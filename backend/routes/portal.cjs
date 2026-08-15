const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { verifyPortalToken } = require('../middleware/portalAuth.cjs');
const repo = require('../services/supabaseRepository.cjs');
const portalService = require('../services/portalService.cjs');
const portalAuthService = require('../services/portalAuthService.cjs');
const portalLifecycleService = require('../services/portalLifecycleService.cjs');
const { sensitiveLimiter, apiLimiter } = require('../middleware/rateLimiter.cjs');

// Ensure ticket attachments upload directory exists
const TICKET_ATTACHMENTS_DIR = path.join(__dirname, '..', 'storage', 'ticket-attachments');
fs.mkdirSync(TICKET_ATTACHMENTS_DIR, { recursive: true });

// Multer storage configuration for ticket attachments
const ticketAttachmentStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, TICKET_ATTACHMENTS_DIR);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const uniqueName = `${crypto.randomUUID()}${ext}`;
    cb(null, uniqueName);
  },
});

const uploadTicketAttachment = multer({
  storage: ticketAttachmentStorage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB max
  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      'image/jpeg', 'image/png', 'image/gif', 'image/webp',
      'application/pdf', 'text/plain', 'text/csv',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/zip', 'application/x-zip-compressed',
    ];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('File type not allowed'), false);
    }
  },
});

let stripe = null;
try {
  const Stripe = require('stripe');
  if (process.env.STRIPE_SECRET_KEY) {
    stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2024-06-20' });
  }
} catch { /* stripe not installed or no key — payment will use mock mode */ }

const GLOBAL_PORTAL_LIMIT = apiLimiter({ windowMs: 15 * 60 * 1000, maxRequests: 200 });
const SENSITIVE_PORTAL_LIMIT = sensitiveLimiter({ windowMs: 60 * 60 * 1000, maxRequests: 30 });

router.use(verifyPortalToken);
router.use(GLOBAL_PORTAL_LIMIT);

function requestContext(req) {
  return {
    ip: req.ip || req.headers['x-forwarded-for'] || null,
    userAgent: req.headers['user-agent'] || null,
    method: req.method,
    path: req.originalUrl,
    correlationId: req.correlationId,
  };
}

// ─── Realtime events (SSE) — no manual refresh needed ────────────────────────
router.post('/events-ticket', SENSITIVE_PORTAL_LIMIT, async (req, res) => {
  try {
    const { id, customer_id, email } = req.portalUser;
    const ticket = portalAuthService.generateEventTicket({ id, customer_id, email }, 'portal');
    res.json({ ticket, expiresIn: 300 });
  } catch (err) {
    console.error('[Portal] events-ticket error:', err);
    res.status(500).json({ error: 'Failed to issue realtime ticket' });
  }
});
router.get('/events', (req, res) => {
  const unsubscribe = portalLifecycleService.subscribePortal(req, res);
  res.on('close', unsubscribe);
});

router.get('/catalog', async (req, res) => {
  try {
    const data = await portalService.getCatalog();
    res.json(data);
  } catch (err) {
    console.error('[Portal] Catalog error:', err);
    res.status(500).json({ error: 'Failed to load catalog' });
  }
});

// ─── Promotions (display-only: active PORTAL promotions for badges/banners) ──
router.get('/promotions', async (req, res) => {
  try {
    const { customer_id } = req.portalUser;
    const data = await portalLifecycleService.getActivePortalPromotions(customer_id);
    res.json(data);
  } catch (err) {
    console.error('[Portal] Promotions error:', err);
    res.status(500).json({ error: 'Failed to load promotions' });
  }
});

// ─── Banner Ads (display-only: active portal banner ads) ────────────────────
router.get('/ads', async (req, res) => {
  try {
    const { customer_id } = req.portalUser;
    const data = await portalLifecycleService.getActivePortalAds(customer_id);
    res.json(data);
  } catch (err) {
    console.error('[Portal] Ads error:', err);
    res.status(500).json({ error: 'Failed to load ads' });
  }
});

// ─── Order preview — server-authoritative promotion calculation ──────────────
// The portal may show this estimate; the backend re-calculates at submission.
router.post('/orders/preview', async (req, res) => {
  try {
    const { customer_id } = req.portalUser;
    const { items, promotionCode } = req.body || {};
    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'At least one line item is required' });
    }
    const data = await portalLifecycleService.previewOrder({
      customerId: customer_id,
      items,
      promotionCode: promotionCode || null,
    });
    res.json(data);
  } catch (err) {
    console.error('[Portal] Order preview error:', err);
    res.status(400).json({ error: err.message || 'Failed to preview order' });
  }
});

// ─── Quotation Requests (customer-submitted, NOT official documents) ────────
router.get('/requests', async (req, res) => {
  try {
    const { customer_id } = req.portalUser;
    const { page, pageSize, status, search } = req.query;
    const hasPagination = page || pageSize;
    if (hasPagination) {
      const data = await portalService.getRequestsPaginated(customer_id, {
        page: page ? parseInt(page, 10) : 1,
        pageSize: Math.min(100, Math.max(1, parseInt(pageSize, 10) || 20)),
        status: status || undefined,
        search: search || undefined,
      });
      return res.json(data);
    }
    const data = await portalLifecycleService.getRequests({ customerId: customer_id });
    res.json(data);
  } catch (err) {
    console.error('[Portal] Requests error:', err);
    res.status(500).json({ error: 'Failed to load requests' });
  }
});

router.post('/requests', async (req, res) => {
  try {
    const { id, customer_id, email, full_name } = req.portalUser;
    const { requestType, items, notes, requestedDeliveryDate, attachments, reorderOf, reorderOfNumber, promotionCode } = req.body;
    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'At least one line item is required' });
    }
    const result = await portalLifecycleService.createQuotationRequest({
      portalUserId: id,
      customerId: customer_id,
      customerName: full_name || email || 'Customer',
      requestType,
      items,
      notes,
      requestedDeliveryDate,
      attachments,
      reorderOf: reorderOf || null,
      reorderOfNumber: reorderOfNumber || null,
      promotionCode: promotionCode || null,
      context: requestContext(req),
    });
    res.status(201).json(result);
  } catch (err) {
    console.error('[Portal] Create request error:', err);
    res.status(400).json({ error: err.message || 'Failed to submit request' });
  }
});

router.get('/requests/:id', async (req, res) => {
  try {
    const { customer_id } = req.portalUser;
    const data = await portalLifecycleService.getRequestById(req.params.id, { customerId: customer_id });
    if (!data) return res.status(404).json({ error: 'Request not found' });
    res.json(data);
  } catch (err) {
    console.error('[Portal] Request detail error:', err);
    res.status(500).json({ error: 'Failed to load request' });
  }
});

router.post('/requests/:id/cancel', async (req, res) => {
  try {
    const { id, customer_id} = req.portalUser;
    const result = await portalLifecycleService.cancelRequest(req.params.id, {
      portalUserId: id,
      customerId: customer_id,
      context: requestContext(req),
    });
    res.json(result);
  } catch (err) {
    console.error('[Portal] Cancel request error:', err);
    res.status(400).json({ error: err.message || 'Failed to cancel request' });
  }
});

// ─── Quotations (official documents — read-only for customers) ──────────────
router.get('/quotations/:id', async (req, res) => {
  try {
    const { customer_id } = req.portalUser;
    const data = await portalLifecycleService.getQuotationById(req.params.id, { customerId: customer_id });
    if (!data) return res.status(404).json({ error: 'Quotation not found' });
    res.json(data);
  } catch (err) {
    console.error('[Portal] Quotation detail error:', err);
    res.status(500).json({ error: 'Failed to load quotation' });
  }
});

router.post('/quotations/:id/accept', async (req, res) => {
  try {
    const { id, customer_id, email, full_name } = req.portalUser;
    const result = await portalLifecycleService.acceptQuotation(req.params.id, {
      portalUserId: id,
      customerId: customer_id,
      signerName: full_name || email || null,
      signerEmail: email || null,
      context: requestContext(req),
    });
    res.json(result);
  } catch (err) {
    console.error('[Portal] Accept quotation error:', err);
    res.status(400).json({ error: err.message || 'Failed to accept quotation' });
  }
});

router.post('/quotations/:id/reject', async (req, res) => {
  try {
    const { id, customer_id, email, full_name } = req.portalUser;
    const { reason } = req.body || {};
    const result = await portalLifecycleService.rejectQuotation(req.params.id, {
      portalUserId: id,
      customerId: customer_id,
      reason,
      signerName: full_name || email || null,
      signerEmail: email || null,
      context: requestContext(req),
    });
    res.json(result);
  } catch (err) {
    console.error('[Portal] Reject quotation error:', err);
    res.status(400).json({ error: err.message || 'Failed to reject quotation' });
  }
});

router.post('/quotations/:id/revision', async (req, res) => {
  try {
    const { id, customer_id, email, full_name } = req.portalUser;
    const { comments } = req.body || {};
    const result = await portalLifecycleService.requestRevision(req.params.id, {
      portalUserId: id,
      customerId: customer_id,
      comments,
      signerName: full_name || email || null,
      signerEmail: email || null,
      context: requestContext(req),
    });
    res.json(result);
  } catch (err) {
    console.error('[Portal] Revision request error:', err);
    res.status(400).json({ error: err.message || 'Failed to request revision' });
  }
});

// ─── Quotation version history (Phase 3) ─────────────────────────────────────
router.get('/quotations/:id/versions', async (req, res) => {
  try {
    const { customer_id } = req.portalUser;
    const quotation = await portalLifecycleService.getQuotationById(req.params.id, { customerId: customer_id });
    if (!quotation) return res.status(404).json({ error: 'Quotation not found' });
    const data = await portalLifecycleService.listDocumentVersions('quotation', req.params.id, { });
    res.json(data);
  } catch (err) {
    console.error('[Portal] Quotation versions error:', err);
    res.status(500).json({ error: 'Failed to load quotation versions' });
  }
});

router.get('/quotations/:id/versions/:version', async (req, res) => {
  try {
    const { customer_id } = req.portalUser;
    const quotation = await portalLifecycleService.getQuotationById(req.params.id, { customerId: customer_id });
    if (!quotation) return res.status(404).json({ error: 'Quotation not found' });
    const data = await portalLifecycleService.getDocumentVersion('quotation', req.params.id, Number(req.params.version), { });
    if (!data) return res.status(404).json({ error: 'Version not found' });
    res.json(data);
  } catch (err) {
    console.error('[Portal] Quotation version detail error:', err);
    res.status(500).json({ error: 'Failed to load quotation version' });
  }
});

// ─── Quotation decision signatures (Phase 3) ─────────────────────────────────
router.get('/quotations/:id/signatures', async (req, res) => {
  try {
    const { customer_id } = req.portalUser;
    const quotation = await portalLifecycleService.getQuotationById(req.params.id, { customerId: customer_id });
    if (!quotation) return res.status(404).json({ error: 'Quotation not found' });
    const data = await portalLifecycleService.getDocumentSignatures('quotation', req.params.id, { customerId: customer_id });
    res.json(data);
  } catch (err) {
    console.error('[Portal] Quotation signatures error:', err);
    res.status(500).json({ error: 'Failed to load signatures' });
  }
});

// ─── Document discussions (Phase 4) ──────────────────────────────────────────
router.get('/comments', async (req, res) => {
  try {
    const { customer_id } = req.portalUser;
    const { docType, docId } = req.query;
    if (!docType || !docId) {
      return res.status(400).json({ error: 'docType and docId are required' });
    }
    const data = await portalLifecycleService.getComments({
      docType, docId, customerId: customer_id, view: 'customer',
    });
    res.json(data);
  } catch (err) {
    console.error('[Portal] Comments error:', err);
    res.status(500).json({ error: 'Failed to load comments' });
  }
});

router.post('/comments', async (req, res) => {
  try {
    const { id, customer_id, email, full_name } = req.portalUser;
    const { docType, docId, body } = req.body || {};
    if (!docType || !docId || !body) {
      return res.status(400).json({ error: 'docType, docId and body are required' });
    }
    const data = await portalLifecycleService.addComment({
      docType, docId, customerId: customer_id,
      actor: { type: 'customer', id, name: full_name || email || 'Customer' },
      body,
      context: requestContext(req),
    });
    res.status(201).json(data);
  } catch (err) {
    console.error('[Portal] Add comment error:', err);
    res.status(400).json({ error: err.message || 'Failed to add comment' });
  }
});

// ─── Downloads (gated + audited) ─────────────────────────────────────────────
router.post('/downloads', SENSITIVE_PORTAL_LIMIT, async (req, res) => {
  try {
    const { id, customer_id} = req.portalUser;
    const { docType, docId } = req.body || {};
    if (!docType || !docId) {
      return res.status(400).json({ error: 'docType and docId are required' });
    }
    const result = await portalLifecycleService.recordDownload({
      docType,
      docId,
      portalUserId: id,
      customerId: customer_id,
      context: requestContext(req),
    });
    res.json(result);
  } catch (err) {
    console.error('[Portal] Download audit error:', err);
    res.status(400).json({ error: err.message || 'Download not permitted' });
  }
});

// ─── Timeline (merged chronological history per document) ────────────────────
router.get('/timeline', async (req, res) => {
  try {
    const { customer_id } = req.portalUser;
    const { docType, docId } = req.query;
    if (!docType || !docId) {
      return res.status(400).json({ error: 'docType and docId are required' });
    }
    const data = await portalLifecycleService.getTimeline({
      docType,
      docId,
      customerId: customer_id,
    });
    res.json(data);
  } catch (err) {
    console.error('[Portal] Timeline error:', err);
    res.status(500).json({ error: 'Failed to load timeline' });
  }
});

// ─── Dashboard ────────────────────────────────────────────────
router.get('/dashboard', async (req, res) => {
  try {
    const { id, customer_id} = req.portalUser;
    const data = await portalService.getDashboard(id, customer_id );
    res.json(data);
  } catch (err) {
    console.error('[Portal] Dashboard error:', err);
    res.status(500).json({ error: 'Failed to load dashboard' });
  }
});

// ─── Orders ───────────────────────────────────────────────────
router.get('/orders', async (req, res) => {
  try {
    const { customer_id } = req.portalUser;
    const { page, pageSize, status, search, dateFrom, dateTo } = req.query;
    const hasPagination = page || pageSize;
    if (hasPagination) {
      const data = await portalService.getOrdersPaginated(customer_id, {
        page: page ? parseInt(page, 10) : 1,
        pageSize: Math.min(100, Math.max(1, parseInt(pageSize, 10) || 20)),
        status: status || undefined,
        search: search || undefined,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
      });
      return res.json(data);
    }
    const data = await portalService.getOrders(customer_id );
    res.json(data);
  } catch (err) {
    console.error('[Portal] Orders error:', err);
    res.status(500).json({ error: 'Failed to load orders' });
  }
});

router.get('/orders/:id', async (req, res) => {
  try {
    const { customer_id } = req.portalUser;
    const data = await portalService.getOrderById(req.params.id, customer_id );
    if (!data) return res.status(404).json({ error: 'Order not found' });
    res.json(data);
  } catch (err) {
    console.error('[Portal] Order detail error:', err);
    res.status(500).json({ error: 'Failed to load order' });
  }
});

// Reorder an official sales order — creates a brand-new order request
// (ODR-YYYY-######) so the order goes through sales review again.
router.post('/orders/:id/reorder', async (req, res) => {
  try {
    const { id, customer_id} = req.portalUser;
    const result = await portalLifecycleService.reorderFromOrder(req.params.id, {
      portalUserId: id,
      customerId: customer_id,
      context: requestContext(req),
    });
    res.status(201).json(result);
  } catch (err) {
    console.error('[Portal] Reorder error:', err);
    res.status(400).json({ error: err.message || 'Failed to reorder' });
  }
});

// ─── Document chain (request → quotation → sales order) ────────────────────
router.get('/document-chain', async (req, res) => {
  try {
    const { customer_id } = req.portalUser;
    const { docType, docId } = req.query;
    if (!docType || !docId) {
      return res.status(400).json({ error: 'docType and docId are required' });
    }
    const data = await portalLifecycleService.getDocumentChain({
      docType,
      docId,
      customerId: customer_id,
    });
    res.json(data);
  } catch (err) {
    console.error('[Portal] Document chain error:', err);
    res.status(400).json({ error: err.message || 'Failed to load document chain' });
  }
});

// ─── Quotations ───────────────────────────────────────────────
router.get('/quotations', async (req, res) => {
  try {
    const { customer_id } = req.portalUser;
    const { page, pageSize, status, search } = req.query;
    const hasPagination = page || pageSize;
    if (hasPagination) {
      const data = await portalService.getQuotationsPaginated(customer_id, {
        page: page ? parseInt(page, 10) : 1,
        pageSize: Math.min(100, Math.max(1, parseInt(pageSize, 10) || 20)),
        status: status || undefined,
        search: search || undefined,
      });
      return res.json(data);
    }
    const data = await portalService.getQuotations(customer_id );
    res.json(data);
  } catch (err) {
    console.error('[Portal] Quotations error:', err);
    res.status(500).json({ error: 'Failed to load quotations' });
  }
});

// ─── Invoices ─────────────────────────────────────────────────
router.get('/invoices', async (req, res) => {
  try {
    const { customer_id } = req.portalUser;
    const { page, pageSize, status, search, dateFrom, dateTo } = req.query;
    const hasPagination = page || pageSize;
    if (hasPagination) {
      const data = await portalService.getInvoicesPaginated(customer_id, {
        page: page ? parseInt(page, 10) : 1,
        pageSize: Math.min(100, Math.max(1, parseInt(pageSize, 10) || 20)),
        status: status || undefined,
        search: search || undefined,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
      });
      return res.json(data);
    }
    const data = await portalService.getInvoices(customer_id );
    res.json(data);
  } catch (err) {
    console.error('[Portal] Invoices error:', err);
    res.status(500).json({ error: 'Failed to load invoices' });
  }
});

router.get('/invoices/:id', async (req, res) => {
  try {
    const { customer_id } = req.portalUser;
    const data = await portalService.getInvoiceById(req.params.id, customer_id );
    if (!data) return res.status(404).json({ error: 'Invoice not found' });
    res.json(data);
  } catch (err) {
    console.error('[Portal] Invoice detail error:', err);
    res.status(500).json({ error: 'Failed to load invoice' });
  }
});

// Revert the latest payment on an invoice back to unpaid (testing / corrections).
// DISABLED: This endpoint bypasses ERP accounting rules and was intended for testing only.
// A normal portal customer must not be able to arbitrarily revert an ERP invoice.
// To revert a payment, use the ERP admin interface.
router.post('/invoices/:id/revert', async (req, res) => {
  res.status(403).json({ error: 'This feature is not available in the portal. Please contact your administrator to revert a payment.' });
});

// ─── Payments ─────────────────────────────────────────────────
router.get('/payments', async (req, res) => {
  try {
    const { customer_id } = req.portalUser;
    const { page, pageSize, search, dateFrom, dateTo } = req.query;
    const hasPagination = page || pageSize;
    if (hasPagination) {
      const data = await portalService.getPaymentsPaginated(customer_id, {
        page: page ? parseInt(page, 10) : 1,
        pageSize: Math.min(100, Math.max(1, parseInt(pageSize, 10) || 20)),
        search: search || undefined,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
      });
      return res.json(data);
    }
    const data = await portalService.getPayments(customer_id );
    res.json(data);
  } catch (err) {
    console.error('[Portal] Payments error:', err);
    res.status(500).json({ error: 'Failed to load payments' });
  }
});

router.get('/payments/:id', async (req, res) => {
  try {
    const { customer_id } = req.portalUser;
    const data = await portalService.getPaymentById(req.params.id, customer_id );
    if (!data) return res.status(404).json({ error: 'Payment not found' });
    res.json(data);
  } catch (err) {
    console.error('[Portal] Payment detail error:', err);
    res.status(500).json({ error: 'Failed to load payment' });
  }
});

// ─── Statements ───────────────────────────────────────────────
router.get('/statements', async (req, res) => {
  try {
    const { customer_id } = req.portalUser;
    const { startDate, endDate } = req.query;
    const data = await portalService.getStatements(customer_id, startDate, endDate);
    res.json(data);
  } catch (err) {
    console.error('[Portal] Statements error:', err);
    res.status(500).json({ error: 'Failed to load statements' });
  }
});

// ─── Loyalty ──────────────────────────────────────────────────
router.get('/loyalty', async (req, res) => {
  try {
    const { customer_id } = req.portalUser;
    const data = await portalService.getLoyalty(customer_id );
    res.json(data);
  } catch (err) {
    console.error('[Portal] Loyalty error:', err);
    res.status(500).json({ error: 'Failed to load loyalty data' });
  }
});

// ─── Wallet ───────────────────────────────────────────────────
router.get('/wallet', async (req, res) => {
  try {
    const { customer_id } = req.portalUser;
    const data = await portalService.getWallet(customer_id );
    res.json(data);
  } catch (err) {
    console.error('[Portal] Wallet error:', err);
    res.status(500).json({ error: 'Failed to load wallet data' });
  }
});

// ─── Profile ──────────────────────────────────────────────────
router.get('/profile', async (req, res) => {
  try {
    const { customer_id } = req.portalUser;
    const data = await portalService.getProfile(customer_id );
    if (!data) return res.status(404).json({ error: 'Profile not found' });
    res.json(data);
  } catch (err) {
    console.error('[Portal] Profile error:', err);
    res.status(500).json({ error: 'Failed to load profile' });
  }
});

router.put('/profile', async (req, res) => {
  try {
    const { id } = req.portalUser;
    const { full_name, phone, email, address, city, state, zip, country } = req.body;
    await portalAuthService.updatePortalUser(id, { full_name, phone, email, address, city, state, zip, country });
    res.json({ message: 'Profile updated successfully' });
  } catch (err) {
    console.error('[Portal] Profile update error:', err);
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

router.put('/profile/password', SENSITIVE_PORTAL_LIMIT, async (req, res) => {
  try {
    const { id } = req.portalUser;
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Current password and new password are required' });
    }
    if (newPassword.length < 6) {
      return res.status(400).json({ error: 'New password must be at least 6 characters' });
    }
    await portalAuthService.changePassword(id, currentPassword, newPassword);
    res.json({ message: 'Password changed successfully' });
  } catch (err) {
    console.error('[Portal] Password change error:', err);
    if (err.message === 'Current password is incorrect') {
      return res.status(400).json({ error: err.message });
    }
    res.status(500).json({ error: 'Failed to change password' });
  }
});

// ─── Documents ────────────────────────────────────────────────
router.get('/documents', async (req, res) => {
  try {
    const { customer_id } = req.portalUser;
    const data = await portalService.getDocuments(customer_id );
    res.json(data);
  } catch (err) {
    console.error('[Portal] Documents error:', err);
    res.status(500).json({ error: 'Failed to load documents' });
  }
});

// ─── Notifications ────────────────────────────────────────────
router.get('/notifications', async (req, res) => {
  try {
    const { id } = req.portalUser;
    const data = await portalService.getNotifications(id );
    res.json(data);
  } catch (err) {
    console.error('[Portal] Notifications error:', err);
    res.status(500).json({ error: 'Failed to load notifications' });
  }
});

router.put('/notifications/:id/read', async (req, res) => {
  try {
    const { id } = req.portalUser;
    await portalService.markNotificationRead(req.params.id, id);
    res.json({ success: true });
  } catch (err) {
    console.error('[Portal] Mark notification read error:', err);
    res.status(500).json({ error: 'Failed to mark notification as read' });
  }
});

router.get('/notifications/unread-count', async (req, res) => {
  try {
    const { id } = req.portalUser;
    const count = await portalService.getUnreadNotificationCount(id );
    res.json({ count });
  } catch (err) {
    console.error('[Portal] Unread count error:', err);
    res.status(500).json({ error: 'Failed to load unread count' });
  }
});

router.put('/notifications/read-all', async (req, res) => {
  try {
    const { id } = req.portalUser;
    await portalService.markAllNotificationsRead(id );
    res.json({ success: true });
  } catch (err) {
    console.error('[Portal] Mark all read error:', err);
    res.status(500).json({ error: 'Failed to mark all notifications as read' });
  }
});

// ─── Referrals ────────────────────────────────────────────────
router.get('/referrals', async (req, res) => {
  try {
    const { id, customer_id} = req.portalUser;
    const { page, pageSize, status, search, sort } = req.query;
    const data = await portalService.getReferrals(id, customer_id, {
      page: page ? parseInt(page, 10) : 1,
      pageSize: pageSize ? parseInt(pageSize, 10) : 20,
      status: status || undefined,
      search: search || undefined,
      sort: sort || 'date_desc',
    });
    res.json(data);
  } catch (err) {
    console.error('[Portal] Referrals error:', err);
    res.status(500).json({ error: err.message || 'Failed to load referrals' });
  }
});

router.get('/referrals/rewards', async (req, res) => {
  try {
    const { id, customer_id} = req.portalUser;
    const { page, pageSize, status } = req.query;
    const data = await portalService.getReferralRewards(id, customer_id, {
      page: page ? parseInt(page, 10) : 1,
      pageSize: pageSize ? parseInt(pageSize, 10) : 20,
      status: status || undefined,
    });
    res.json(data);
  } catch (err) {
    console.error('[Portal] Referral rewards error:', err);
    res.status(500).json({ error: 'Failed to load rewards' });
  }
});

router.get('/referrals/settings', async (req, res) => {
  try {
    const data = await portalService.getReferralSettings();
    res.json(data);
  } catch (err) {
    console.error('[Portal] Referral settings error:', err);
    res.status(500).json({ error: 'Failed to load referral settings' });
  }
});

router.get('/referrals/stats', async (req, res) => {
  try {
    const { customer_id } = req.portalUser;
    const data = await portalService.getReferralFunnelStats(customer_id );
    res.json(data);
  } catch (err) {
    console.error('[Portal] Referral stats error:', err);
    res.status(500).json({ error: 'Failed to load referral stats' });
  }
});

router.get('/referrals/:id/timeline', async (req, res) => {
  try {
    const { customer_id } = req.portalUser;
    const data = await portalService.getReferralTimeline(req.params.id, customer_id);
    if (data === null) return res.status(404).json({ error: 'Referral not found' });
    res.json(data);
  } catch (err) {
    console.error('[Portal] Referral timeline error:', err);
    res.status(500).json({ error: 'Failed to load timeline' });
  }
});

router.get('/referrals/:id', async (req, res) => {
  try {
    const { id, customer_id} = req.portalUser;
    const data = await portalService.getReferralById(req.params.id, id, customer_id );
    if (!data) return res.status(404).json({ error: 'Referral not found' });
    res.json(data);
  } catch (err) {
    console.error('[Portal] Referral detail error:', err);
    res.status(500).json({ error: 'Failed to load referral' });
  }
});

router.post('/referrals', async (req, res) => {
  try {
    const { id, customer_id} = req.portalUser;
    const { referredCustomerId, notes } = req.body || {};
    if (!referredCustomerId) {
      return res.status(400).json({ error: 'Referred customer is required' });
    }
    const data = await portalService.createReferral(id, customer_id, {
      referredCustomerId,
      notes,
    });
    res.status(201).json(data);
  } catch (err) {
    console.error('[Portal] Create referral error:', err);
    res.status(400).json({ error: err.message || 'Failed to create referral' });
  }
});

router.get('/referrals/customers/search', async (req, res) => {
  try {
    const { customer_id } = req.portalUser;
    const { q } = req.query;
    if (!q || String(q).trim().length < 2) {
      return res.json([]);
    }
    const data = await portalService.searchCustomersForReferral( String(q), customer_id);
    res.json(data);
  } catch (err) {
    console.error('[Portal] Customer search error:', err);
    res.status(500).json({ error: 'Failed to search customers' });
  }
});

// ─── Support Tickets ──────────────────────────────────────────
router.get('/support/tickets', async (req, res) => {
  try {
    const { id, customer_id} = req.portalUser;
    const data = await portalService.getSupportTickets(id, customer_id );
    res.json(data);
  } catch (err) {
    console.error('[Portal] Support tickets error:', err);
    res.status(500).json({ error: 'Failed to load tickets' });
  }
});

router.post('/support/tickets', SENSITIVE_PORTAL_LIMIT, async (req, res) => {
  try {
    const { id, customer_id} = req.portalUser;
    const { subject, message, priority } = req.body;
    if (!subject || !message) {
      return res.status(400).json({ error: 'Subject and message are required' });
    }
    const ticket = await portalService.createSupportTicket(id, customer_id, { subject, message, priority });
    res.status(201).json(ticket);
  } catch (err) {
    console.error('[Portal] Create ticket error:', err);
    res.status(500).json({ error: 'Failed to create ticket' });
  }
});

router.post('/support/tickets/:id/messages', async (req, res) => {
  try {
    const { id, customer_id } = req.portalUser;
    const { message } = req.body;
    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }
    const msg = await portalService.addTicketMessage(req.params.id, id, customer_id, message);
    res.status(201).json(msg);
  } catch (err) {
    console.error('[Portal] Add message error:', err);
    res.status(500).json({ error: 'Failed to add message' });
  }
});

router.put('/support/tickets/:id/status', async (req, res) => {
  try {
    const { id, customer_id } = req.portalUser;
    const { status } = req.body;
    if (!status) {
      return res.status(400).json({ error: 'Status is required' });
    }
    const result = await portalService.updateTicketStatus(req.params.id, id, customer_id, status);
    res.json(result);
  } catch (err) {
    console.error('[Portal] Update ticket status error:', err);
    res.status(500).json({ error: 'Failed to update ticket status' });
  }
});

// ─── Support Ticket Attachments ──────────────────────────────────
router.post('/support/tickets/:id/attachments', uploadTicketAttachment.single('file'), async (req, res) => {
  try {
    const { id, customer_id } = req.portalUser;
    const { message_id } = req.body;
    if (!req.file) {
      return res.status(400).json({ error: 'File is required' });
    }
    const attachment = await portalService.uploadTicketAttachment(
      req.params.id,
      id,
      customer_id,
      req.file,
      message_id || null
    );
    res.status(201).json(attachment);
  } catch (err) {
    console.error('[Portal] Upload attachment error:', err);
    res.status(500).json({ error: err.message || 'Failed to upload attachment' });
  }
});

router.get('/support/tickets/:id/attachments/:attachmentId', async (req, res) => {
  try {
    const { customer_id } = req.portalUser;
    const { attachmentId } = req.params;
    const attachment = await portalService.getTicketAttachment(attachmentId, customer_id);
    if (!attachment) {
      return res.status(404).json({ error: 'Attachment not found' });
    }
    const filePath = path.join(TICKET_ATTACHMENTS_DIR, attachment.filename);
    res.setHeader('Content-Type', attachment.mime_type);
    res.setHeader('Content-Disposition', `attachment; filename="${attachment.original_name}"`);
    fs.createReadStream(filePath).pipe(res);
  } catch (err) {
    console.error('[Portal] Download attachment error:', err);
    res.status(500).json({ error: 'Failed to download attachment' });
  }
});

router.delete('/support/tickets/:id/attachments/:attachmentId', async (req, res) => {
  try {
    const { id, customer_id } = req.portalUser;
    const result = await portalService.deleteTicketAttachment(req.params.attachmentId, id, customer_id);
    res.json(result);
  } catch (err) {
    console.error('[Portal] Delete attachment error:', err);
    res.status(500).json({ error: 'Failed to delete attachment' });
  }
});

// ─── Shipments / Tracking (customer-facing, read-only) ─────────────────────────
// Today's in-flight deliveries (feeds the "Pending delivery today" banner).
// Lightweight enough for the portal to poll while the dashboard stays cached.
router.get('/deliveries/today', async (req, res) => {
  try {
    const { customer_id } = req.portalUser;
    const rows = await portalService.getTodayPendingDeliveries(customer_id);
    res.json(rows);
  } catch (err) {
    console.error('[Portal] Today deliveries error:', err);
    res.status(500).json({ error: 'Failed to load today deliveries' });
  }
});

// Customer-facing delivery status banners (sliding carousel like the ads).
// Every delivery status change updates the banner message for that customer.
router.get('/deliveries/banner', async (req, res) => {
  try {
    const { customer_id } = req.portalUser;
    const rows = await portalService.getDeliveryBanners(customer_id);
    res.json(rows);
  } catch (err) {
    console.error('[Portal] Delivery banner error:', err);
    res.status(500).json({ error: 'Failed to load delivery banners' });
  }
});

// Downloadable delivery note for a (usually delivered) delivery, strictly
// scoped to the requesting customer.
router.get('/deliveries/:id/note', async (req, res) => {
  try {
    const { customer_id } = req.portalUser;
    const note = await portalService.getDeliveryNoteForDelivery(req.params.id, customer_id);
    if (!note) return res.status(404).json({ error: 'Delivery note not found' });
    res.json(note);
  } catch (err) {
    console.error('[Portal] Delivery note error:', err);
    res.status(500).json({ error: 'Failed to load delivery note' });
  }
});

router.get('/shipments', async (req, res) => {
  try {
    const { customer_id } = req.portalUser;
    const { status, search } = req.query;
    const rows = await portalService.getShipments(customer_id, {
      status: status || undefined,
      search: search || undefined,
    });
    res.json(rows);
  } catch (err) {
    console.error('[Portal] Shipments list error:', err);
    res.status(500).json({ error: 'Failed to load shipments' });
  }
});

router.get('/shipments/:id', async (req, res) => {
  try {
    const { customer_id } = req.portalUser;
    const row = await portalService.getShipmentById(req.params.id, customer_id );
    if (!row) return res.status(404).json({ error: 'Shipment not found' });
    res.json(row);
  } catch (err) {
    console.error('[Portal] Shipment detail error:', err);
    res.status(500).json({ error: 'Failed to load shipment' });
  }
});

// ─── Payment Processing ───────────────────────────────────────
// Create a Stripe PaymentIntent for an invoice (falls back to mock mode if Stripe not configured)
router.post('/payments/intent', async (req, res) => {
  try {
    const { customer_id } = req.portalUser;
    const { invoiceId, amount, currency = 'USD' } = req.body;
    if (!invoiceId || !amount) {
      return res.status(400).json({ error: 'invoiceId and amount are required' });
    }

    // Verify the invoice belongs to this customer
    const invoice = await portalService.getInvoiceById(invoiceId, customer_id );
    if (!invoice) return res.status(404).json({ error: 'Invoice not found' });

    if (stripe) {
      const intent = await stripe.paymentIntents.create({
        amount: Math.round(Number(amount) * 100), // cents
        currency: String(currency).toLowerCase(),
        metadata: { invoiceId: String(invoiceId), customerId: String(customer_id), portalUser: String(req.portalUser.id) },
      });
      return res.json({ clientSecret: intent.client_secret, mode: 'stripe' });
    }

    // Mock mode — returns a fake client secret for development/testing
    const mockSecret = `pi_mock_${crypto.randomBytes(16).toString('hex')}_secret`;
    res.json({ clientSecret: mockSecret, mode: 'mock' });
  } catch (err) {
    console.error('[Portal] Payment intent error:', err);
    res.status(500).json({ error: 'Failed to create payment intent' });
  }
});

// Record a completed payment (called after Stripe confirms the payment)
router.post('/payments', async (req, res) => {
  try {
    const { customer_id } = req.portalUser;
    const { invoiceId, amount, currency = 'USD', paymentMethod = 'Card', reference, transactionId } = req.body;

    const invoice = await portalService.getInvoiceById(invoiceId, customer_id);
    if (!invoice) return res.status(404).json({ error: 'Invoice not found' });

    const remaining = Number(invoice.total_amount) - Number(invoice.paid_amount || 0) - Number(amount);
    let newStatus;
    if (remaining <= 0) newStatus = 'paid';
    else newStatus = 'partially_paid';

    const paymentId = crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString('hex');
    const payment = {
      id: paymentId,
      customerId: customer_id,
      customerName: req.portalUser.customer_name || '',
      amount,
      date: new Date().toISOString(),
      method: paymentMethod,
      reference: reference || transactionId || '',
      allocations: [{ invoice_id: invoiceId, allocated: amount }],
      createdBy: req.portalUser.id,
    };
    await repo.upsert('customer_payments', payment);

    const oldInvoice = await repo.getById('invoices', invoiceId);
    if (oldInvoice) {
      await repo.upsert('invoices', {
        ...oldInvoice,
        paid_amount: Number(oldInvoice.paid_amount || 0) + Number(amount),
        status: newStatus,
        paid_at: new Date().toISOString(),
      });
    }

    // Emit realtime event and notification
    portalLifecycleService.publishErpEvent({
      customerId: customer_id,
      docType: 'invoice',
      docId: String(invoiceId),
      eventType: 'payment_made',
      docNumber: invoice.invoice_number,
      title: 'Payment received',
      body: `A payment of K ${Number(amount).toFixed(2)} has been applied to invoice ${invoice.invoice_number}.`,
      link: `#/portal/invoices/${invoiceId}`,
      notificationType: 'payment_received',
      actor: { type: 'customer', id: req.portalUser.id },
      metadata: { amount, currency, paymentMethod },
    });

    res.json({ success: true, paymentId, status: newStatus });
  } catch (err) {
    console.error('[Portal] Record payment error:', err);
    res.status(500).json({ error: 'Failed to record payment' });
  }
});

module.exports = router;
