const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const repo = require('../services/supabaseRepository.cjs');
const portalAuthService = require('../services/portalAuthService.cjs');
const portalLifecycleService = require('../services/portalLifecycleService.cjs');
const jwt = require('jsonwebtoken');
const axios = require('axios');
const { canUseHeaderAuth, getHeaderAuthUser } = require('../middleware/auth.cjs');

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';

const verifyAdminAuth = async (req, res, next) => {
  const headerUser = getHeaderAuthUser(req);
  if (headerUser && canUseHeaderAuth(req)) {
    req.user = headerUser;
    req.authMode = 'header';
    return next();
  }

  // Fallback: if ALLOW_HEADER_AUTH is enabled, trust header auth without loopback check
  // (safe for dev — ALLOW_HEADER_AUTH is only set in development environments)
  if (headerUser && process.env.ALLOW_HEADER_AUTH === 'true') {
    req.user = headerUser;
    req.authMode = 'header';
    return next();
  }

  const authHeader = req.headers['authorization'];
  // EventSource (SSE) cannot send Authorization headers — the realtime stream
  // authenticates with a short-lived ticket issued by GET /events-ticket.
  if (req.path === '/events' && req.query.token) {
    try {
      const decoded = jwt.verify(req.query.token, process.env.JWT_SECRET);
      if (decoded.sse === true) {
        req.user = decoded;
        return next();
      }
    } catch { /* fall through to standard auth */ }
  }
  const token = authHeader && authHeader.split(' ')[1];
  if (token) {
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      req.user = decoded;
      return next();
    } catch (err) {
      // Try Supabase fallback first
      if (SUPABASE_URL && SUPABASE_ANON_KEY && !SUPABASE_URL.includes('placeholder')) {
        try {
          const sbRes = await axios.get(`${SUPABASE_URL}/auth/v1/user`, {
            headers: { Authorization: `Bearer ${token}`, apikey: SUPABASE_ANON_KEY },
            timeout: 5000
          });
          const sbUser = sbRes.data;
          if (sbUser && sbUser.id) {
            req.user = {
              id: sbUser.id,
              username: sbUser.email || sbUser.id,
              role: sbUser.user_metadata?.role || 'Admin',
              email: sbUser.email,
              isSuperAdmin: sbUser.user_metadata?.is_super_admin === true,
              permissions: sbUser.user_metadata?.is_super_admin ? ['*'] : []
            };
            req.authMode = 'supabase';
            return next();
          }
        } catch (sbErr) { 
          console.warn('[PortalAdmin] Supabase token verification failed:', sbErr?.response?.status, sbErr?.message);
          if (sbErr?.response?.status === 401) {
            return res.status(401).json({ error: 'Token expired', message: 'Please login again' });
          }
        }
      }

      if (err.name === 'TokenExpiredError') {
        return res.status(401).json({ error: 'Token expired', message: 'Please login again' });
      }
    }
  }

  console.warn('[PortalAdmin] verifyAdminAuth 403 path=%s method=%s hasBearer=%s hasHeaderUser=%s', req.originalUrl, req.method, Boolean(authHeader), Boolean(getHeaderAuthUser(req)));
  return res.status(403).json({ error: 'Authentication required', message: 'Valid admin auth required' });
};

router.use(verifyAdminAuth);

// Permanently deletes ALL cloud data (single-company architecture): every row
// in every public table plus the caller's Supabase Auth user, so the same
// credentials can no longer sign in. Requires the service-role key.
router.post('/company/delete', async (req, res) => {
  try {
    const serviceKey = process.env.SUPABASE_SECRET_KEY;
    if (!SUPABASE_URL || SUPABASE_URL.includes('placeholder') || !serviceKey) {
      return res.status(503).json({ error: 'Supabase is not configured on this server' });
    }
    const base = SUPABASE_URL.replace(/\/+$/, '');
    const adminHeaders = {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
    };

    // 1. List every table via the PostgREST OpenAPI spec.
    const { data: spec } = await axios.get(`${base}/rest/v1/`, {
      headers: adminHeaders,
      timeout: 10000,
    });
    const paths = spec?.paths || {};
    const tableNames = Object.keys(paths)
      .filter((p) => /^\/([a-z_][a-z0-9_]*)$/.test(p) && !p.includes('('))
      .map((p) => p.slice(1));

    // 2. Wipe every table (service role bypasses RLS; no filter = all rows).
    const wiped = [];
    for (const table of tableNames) {
      try {
        await axios.delete(`${base}/rest/v1/${table}`, { headers: adminHeaders, timeout: 60000 });
        wiped.push(table);
      } catch { /* skip tables that failed (e.g. internal) */ }
    }

    // 3. Delete the caller's Supabase Auth user so their credentials stop working.
    if (req.user?.id) {
      try {
        await axios.delete(`${base}/auth/v1/admin/users/${req.user.id}`, {
          headers: adminHeaders,
          timeout: 10000,
        });
      } catch { /* best effort */ }
    }

    console.log(`[PortalAdmin] Wiped ${wiped.length} tables for single-company reset`);
    res.json({ ok: true, tables_wiped: wiped.length });
  } catch (err) {
    console.error('[PortalAdmin] Delete company error:', err?.response?.status, err?.response?.data || err.message);
    res.status(500).json({ error: 'Failed to delete company', detail: err?.response?.data || err.message });
  }
});

// Wipes ALL local portal SQLite data (single-company architecture). Used by the
// "Create New Company" / "Delete Company" flows so the Sales Request Pipeline
// and portal lifecycle start from a clean slate instead of the previous
// company's stale rows. This does NOT touch Supabase — it only clears the
// backend SQLite tables that feed /portal/admin/*.
const PORTAL_RESET_TABLES = [
  'quotation_requests',
  'quotations',
  'sales_orders',
  'portal_downloads',
  'portal_timeline_events',
  'document_versions',
  'document_signatures',
  'document_comments',
  'admin_notifications',
  'portal_notifications',
  'portal_tickets',
  'portal_ticket_messages',
  'ticket_attachments',
  'portal_users',
  'portal_sessions',
  'portal_password_resets',
  'portal_login_history',
];

router.post('/company/reset', async (req, res) => {
  try {
    const cleared = [];
    for (const table of PORTAL_RESET_TABLES) {
      try {
        const rows = await repo.getAll(table);
        for (const row of rows) {
          await repo.softDelete(table, row.id);
        }
        cleared.push(table);
      } catch {
        // skip tables that don't exist or fail
      }
    }
    console.log(`[PortalAdmin] Wiped ${cleared.length} local portal tables`);
    res.json({ ok: true, cleared });
  } catch (err) {
    console.error('[PortalAdmin] Company reset error:', err.message);
    res.status(500).json({ error: 'Failed to reset portal data', detail: err.message });
  }
});

// Short-lived ticket so the browser EventSource stream can authenticate via
// query param (EventSource cannot send Authorization/custom headers).
router.get('/events-ticket', (req, res) => {
  try {
    const ticket = jwt.sign(
      {
        id: req.user.id,
        username: req.user.username || 'sales',
        role: req.user.role || 'admin',
        sse: true
      },
      process.env.JWT_SECRET,
      { expiresIn: '5m' }
    );
    res.json({ ticket, expiresIn: 300 });
  } catch (err) {
    console.error('[PortalAdmin] SSE ticket error:', err);
    res.status(500).json({ error: 'Failed to create realtime ticket' });
  }
});

function adminActor(req) {
  return {
    id: req.user.id,
    name: req.user.username || req.user.email || 'Sales',
    role: req.user.role || 'admin'};
}

function requestContext(req) {
  return {
    ip: req.ip || req.headers['x-forwarded-for'] || null,
    userAgent: req.headers['user-agent'] || null,
    method: req.method,
    path: req.originalUrl,
    correlationId: req.correlationId};
}

// ─── Realtime events (SSE) — staff dashboard updates instantly ──────────────
router.get('/events', (req, res) => {
  const unsubscribe = portalLifecycleService.subscribeAdmin(req, res);
  res.on('close', unsubscribe);
});

// ─── Quotation Requests (review workspace) ───────────────────────────────────
router.get('/requests', async (req, res) => {
  try {
    const { status } = req.query;
    const data = await portalLifecycleService.adminListRequests({ status });
    res.json(data);
  } catch (err) {
    console.error('[PortalAdmin] List requests error:', err);
    res.status(500).json({ error: 'Failed to load requests' });
  }
});

router.get('/requests/:id', async (req, res) => {
  try {
    const data = await portalLifecycleService.adminGetRequest(req.params.id);
    if (!data) return res.status(404).json({ error: 'Request not found' });
    res.json(data);
  } catch (err) {
    console.error('[PortalAdmin] Request detail error:', err);
    res.status(500).json({ error: 'Failed to load request' });
  }
});

router.put('/requests/:id', async (req, res) => {
  try {
    const { items, notes } = req.body;
    const data = await portalLifecycleService.updateRequest(req.params.id, {
      admin: adminActor(req),
      items,
      notes,
      context: requestContext(req)});
    res.json(data);
  } catch (err) {
    console.error('[PortalAdmin] Update request error:', err);
    res.status(400).json({ error: err.message || 'Failed to update request' });
  }
});

router.post('/requests/:id/reject', async (req, res) => {
  try {
    const { reason } = req.body || {};
    const data = await portalLifecycleService.rejectRequest(req.params.id, {
      admin: adminActor(req),
      reason,
      context: requestContext(req)});
    res.json(data);
  } catch (err) {
    console.error('[PortalAdmin] Reject request error:', err);
    res.status(400).json({ error: err.message || 'Failed to reject request' });
  }
});

router.post('/requests/:id/clarify', async (req, res) => {
  try {
    const { note } = req.body || {};
    const data = await portalLifecycleService.requestClarification(req.params.id, {
      admin: adminActor(req),
      note,
      context: requestContext(req)});
    res.json(data);
  } catch (err) {
    console.error('[PortalAdmin] Clarify request error:', err);
    res.status(400).json({ error: err.message || 'Failed to request clarification' });
  }
});

// Sales opened the request (audit + timeline only)
router.post('/requests/:id/open', async (req, res) => {
  try {
    const data = await portalLifecycleService.markRequestOpened(req.params.id, {
      admin: adminActor(req),
      context: requestContext(req)});
    res.json(data);
  } catch (err) {
    console.error('[PortalAdmin] Open request error:', err);
    res.status(400).json({ error: err.message || 'Failed to record request open' });
  }
});

// Assign a salesperson to the request
router.post('/requests/:id/assign', async (req, res) => {
  try {
    const { assignTo, assignToName } = req.body || {};
    const data = await portalLifecycleService.assignRequest(req.params.id, {
      admin: adminActor(req),
      assignTo,
      assignToName,
      context: requestContext(req)});
    res.json(data);
  } catch (err) {
    console.error('[PortalAdmin] Assign request error:', err);
    res.status(400).json({ error: err.message || 'Failed to assign request' });
  }
});

// Toggle the marked flag on a request (admin follow-up). Returns the updated request.
router.post('/requests/:id/mark', async (req, res) => {
  try {
    const data = await portalLifecycleService.markRequest(req.params.id, {
      admin: adminActor(req),
      context: requestContext(req)});
    res.json(data);
  } catch (err) {
    console.error('[PortalAdmin] Mark request error:', err);
    res.status(400).json({ error: err.message || 'Failed to mark request' });
  }
});

// Delete (clear) a request. Soft delete: sets status to cancelled and stamps
// deleted_at so the request disappears from active queues.
router.delete('/requests/:id', async (req, res) => {
  try {
    const data = await portalLifecycleService.deleteRequest(req.params.id, {
      admin: adminActor(req),
      context: requestContext(req)});
    res.json(data);
  } catch (err) {
    console.error('[PortalAdmin] Delete request error:', err);
    res.status(400).json({ error: err.message || 'Failed to delete request' });
  }
});

// Start quotation generation: does NOT create a quotation and does NOT reserve
// a number. Records the event and returns the prefill payload for the standard
// ERP quotation editor.
router.post('/requests/:id/generate-quotation', async (req, res) => {
  try {
    const data = await portalLifecycleService.startQuotationGeneration(req.params.id, {
      admin: adminActor(req),
      context: requestContext(req)});
    res.json(data);
  } catch (err) {
    console.error('[PortalAdmin] Generate quotation error:', err);
    res.status(400).json({ error: err.message || 'Failed to start quotation generation' });
  }
});

// Complete the conversion after the ERP quotation has been saved. This is the
// only point where the official quotation is linked to the request and the
// customer is notified.
router.post('/requests/:id/complete-quotation', async (req, res) => {
  try {
    const { quotationNumber, erpQuotationId, quotationSnapshot } = req.body || {};
    const data = await portalLifecycleService.completeQuotation(req.params.id, {
      admin: adminActor(req),
      quotationNumber,
      erpQuotationId,
      quotationSnapshot,
      context: requestContext(req)});
    res.status(201).json(data);
  } catch (err) {
    console.error('[PortalAdmin] Complete quotation error:', err);
    res.status(400).json({ error: err.message || 'Failed to complete quotation' });
  }
});

// Start sales order generation for an ORDER request: does NOT create an order
// and does NOT reserve a number. Records the event and returns the prefill
// payload for the standard ERP sales order editor.
router.post('/requests/:id/generate-order', async (req, res) => {
  try {
    const data = await portalLifecycleService.startOrderGeneration(req.params.id, {
      admin: adminActor(req),
      context: requestContext(req)});
    res.json(data);
  } catch (err) {
    console.error('[PortalAdmin] Generate order error:', err);
    res.status(400).json({ error: err.message || 'Failed to start sales order generation' });
  }
});

// Complete the conversion after the ERP sales order has been saved. This is
// the only point where the official sales order (SO-YYYY-######) is created,
// linked to the request, and the customer is notified.
router.post('/requests/:id/complete-order', async (req, res) => {
  try {
    const { erpOrderId, orderSnapshot } = req.body || {};
    const data = await portalLifecycleService.completeSalesOrder(req.params.id, {
      admin: adminActor(req),
      erpOrderId,
      orderSnapshot,
      context: requestContext(req)});
    res.status(201).json(data);
  } catch (err) {
    console.error('[PortalAdmin] Complete order error:', err);
    res.status(400).json({ error: err.message || 'Failed to complete sales order' });
  }
});

// ─── Official Sales Orders (admin) ───────────────────────────────────────────
router.get('/orders', async (req, res) => {
  try {
    const [orders, customers] = await Promise.all([
      repo.getAll('sales_orders'),
      repo.getAll('customers'),
    ]);
    const customerMap = new Map(customers.map(c => [c.id, c.name]));
    const rows = orders
      .sort((a, b) => String(b.orderDate || '').localeCompare(String(a.orderDate || '')))
      .map(o => ({
        ...o,
        customer_name: customerMap.get(o.customerId) || '',
      }));
    res.json(rows);
  } catch (err) {
    console.error('[PortalAdmin] List orders error:', err);
    res.status(500).json({ error: 'Failed to load orders' });
  }
});

// ─── Official Quotations (admin) ─────────────────────────────────────────────
router.get('/quotations', async (req, res) => {
  try {
    const { status } = req.query;
    const data = await portalLifecycleService.getQuotations({ status });
    res.json(data);
  } catch (err) {
    console.error('[PortalAdmin] List quotations error:', err);
    res.status(500).json({ error: 'Failed to load quotations' });
  }
});

router.get('/quotations/:id', async (req, res) => {
  try {
    const data = await portalLifecycleService.getQuotationById(req.params.id, {});
    if (!data) return res.status(404).json({ error: 'Quotation not found' });
    res.json(data);
  } catch (err) {
    console.error('[PortalAdmin] Quotation detail error:', err);
    res.status(500).json({ error: 'Failed to load quotation' });
  }
});

// Regenerate a quotation after a customer revision request
router.post('/quotations/:id/regenerate', async (req, res) => {
  try {
    const { items, discount, taxRate, deliveryFee, paymentTerms, validUntil } = req.body || {};
    const data = await portalLifecycleService.regenerateQuotation(req.params.id, {
      admin: adminActor(req),
      items,
      discount,
      taxRate,
      deliveryFee,
      paymentTerms,
      validUntil,
      context: requestContext(req)});
    res.json(data);
  } catch (err) {
    console.error('[PortalAdmin] Regenerate quotation error:', err);
    res.status(400).json({ error: err.message || 'Failed to update quotation' });
  }
});

// Convert an accepted quotation into an official sales order
router.post('/quotations/:id/convert-to-order', async (req, res) => {
  try {
    const { deliveryDate, notes } = req.body || {};
    const data = await portalLifecycleService.convertToOrder(req.params.id, {
      admin: adminActor(req),
      deliveryDate,
      notes,
      context: requestContext(req)});
    res.status(201).json(data);
  } catch (err) {
    console.error('[PortalAdmin] Convert to order error:', err);
    res.status(400).json({ error: err.message || 'Failed to convert to order' });
  }
});

// ─── Quotation version history (Phase 3) ─────────────────────────────────────
router.get('/quotations/:id/versions', async (req, res) => {
  try {
    const quotation = await portalLifecycleService.getQuotationById(req.params.id, {});
    if (!quotation) return res.status(404).json({ error: 'Quotation not found' });
    const data = await portalLifecycleService.listDocumentVersions('quotation', req.params.id, {});
    res.json(data);
  } catch (err) {
    console.error('[PortalAdmin] Quotation versions error:', err);
    res.status(500).json({ error: 'Failed to load quotation versions' });
  }
});

router.get('/quotations/:id/versions/:version', async (req, res) => {
  try {
    const quotation = await portalLifecycleService.getQuotationById(req.params.id, {});
    if (!quotation) return res.status(404).json({ error: 'Quotation not found' });
    const data = await portalLifecycleService.getDocumentVersion('quotation', req.params.id, Number(req.params.version), {});
    if (!data) return res.status(404).json({ error: 'Version not found' });
    res.json(data);
  } catch (err) {
    console.error('[PortalAdmin] Quotation version detail error:', err);
    res.status(500).json({ error: 'Failed to load quotation version' });
  }
});

// ─── Quotation decision signatures (Phase 3) ─────────────────────────────────
router.get('/quotations/:id/signatures', async (req, res) => {
  try {
    const quotation = await portalLifecycleService.getQuotationById(req.params.id, {});
    if (!quotation) return res.status(404).json({ error: 'Quotation not found' });
    const data = await portalLifecycleService.getDocumentSignatures('quotation', req.params.id, {});
    res.json(data);
  } catch (err) {
    console.error('[PortalAdmin] Quotation signatures error:', err);
    res.status(500).json({ error: 'Failed to load signatures' });
  }
});

// ─── Sales order production status (Phase 4) ─────────────────────────────────
router.post('/orders/:id/status', async (req, res) => {
  try {
    const { status, note } = req.body || {};
    if (!status) return res.status(400).json({ error: 'status is required' });
    const data = await portalLifecycleService.updateOrderStatus(req.params.id, {
      admin: adminActor(req),
      toStatus: status,
      note,
      context: requestContext(req)});
    res.json(data);
  } catch (err) {
    console.error('[PortalAdmin] Update order status error:', err);
    res.status(400).json({ error: err.message || 'Failed to update order status' });
  }
});

// ─── Document discussions (Phase 4) ──────────────────────────────────────────
router.get('/comments', async (req, res) => {
  try {
    const { docType, docId } = req.query;
    if (!docType || !docId) {
      return res.status(400).json({ error: 'docType and docId are required' });
    }
    const data = await portalLifecycleService.getComments({
      docType, docId, view: 'admin'});
    res.json(data);
  } catch (err) {
    console.error('[PortalAdmin] Comments error:', err);
    res.status(500).json({ error: 'Failed to load comments' });
  }
});

router.post('/comments', async (req, res) => {
  try {
    const { docType, docId, body, visibility } = req.body || {};
    if (!docType || !docId || !body) {
      return res.status(400).json({ error: 'docType, docId and body are required' });
    }
    const actor = adminActor(req);
    const data = await portalLifecycleService.addComment({
      docType, docId,
      actor: { type: 'admin', id: actor.id, name: actor.name || 'Sales', role: actor.role },
      body,
      visibility: visibility === 'customer' ? 'customer' : 'internal',
      context: requestContext(req)});
    res.status(201).json(data);
  } catch (err) {
    console.error('[PortalAdmin] Add comment error:', err);
    res.status(400).json({ error: err.message || 'Failed to add comment' });
  }
});

// ─── Admin notifications ─────────────────────────────────────────────────────
router.get('/notifications', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);
    const data = await portalLifecycleService.getAdminNotifications({ limit });
    res.json(data);
  } catch (err) {
    console.error('[PortalAdmin] Notifications error:', err);
    res.status(500).json({ error: 'Failed to load notifications' });
  }
});

router.get('/notifications/unread-count', async (req, res) => {
  try {
    const count = await portalLifecycleService.getAdminUnreadCount();
    res.json({ count });
  } catch (err) {
    console.error('[PortalAdmin] Unread count error:', err);
    res.status(500).json({ error: 'Failed to load unread count' });
  }
});

router.put('/notifications/:id/read', async (req, res) => {
  try {
    await portalLifecycleService.markAdminNotificationRead(req.params.id);
    res.json({ success: true });
  } catch (err) {
    console.error('[PortalAdmin] Mark notification read error:', err);
    res.status(500).json({ error: 'Failed to mark notification as read' });
  }
});

router.put('/notifications/read-all', async (req, res) => {
  try {
    await portalLifecycleService.markAllAdminNotificationsRead();
    res.json({ success: true });
  } catch (err) {
    console.error('[PortalAdmin] Mark all read error:', err);
    res.status(500).json({ error: 'Failed to mark notifications as read' });
  }
});

// ─── Activity feed + analytics ───────────────────────────────────────────────
router.get('/activity', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 25, 100);
    const data = await portalLifecycleService.getActivity({ limit });
    res.json(data);
  } catch (err) {
    console.error('[PortalAdmin] Activity error:', err);
    res.status(500).json({ error: 'Failed to load activity' });
  }
});

router.get('/analytics', async (req, res) => {
  try {
    const data = await portalLifecycleService.getAnalytics();
    res.json(data);
  } catch (err) {
    console.error('[PortalAdmin] Analytics error:', err);
    res.status(500).json({ error: 'Failed to load analytics' });
  }
});

router.get('/users', async (req, res) => {
  try {
    const [portalUsers, customers] = await Promise.all([
      repo.getAllFlat('portal_users'),
      repo.getAll('customers'),
    ]);
    const customerMap = new Map(customers.map(c => [c.id, c]));
    const rows = (portalUsers || []).map(pu => {
      const c = customerMap.get(pu.customer_id) || {};
      return {
        customer_id: c.id || pu.customer_id,
        customer_name: c.name,
        customer_email: c.email,
        customer_phone: c.phone,
        customer_status: c.status,
        portal_user_id: pu.id,
        portal_email: pu.email,
        full_name: pu.full_name,
        portal_phone: pu.phone,
        portal_status: pu.status,
        last_login_at: pu.last_login_at,
        portal_created_at: pu.created_at,
      };
    });
    rows.sort((a, b) => String(a.customer_name || '').localeCompare(String(b.customer_name || '')));
    res.json(rows);
  } catch (err) {
    console.error('[PortalAdmin] List users error:', err);
    res.status(500).json({ error: 'Failed to list portal users' });
  }
});

router.post('/users', async (req, res) => {
  try {
    const { customer_id, email, password, full_name, phone } = req.body;
    if (!customer_id || !email || !password) {
      return res.status(400).json({ error: 'customer_id, email, and password are required' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }
    const existing = await portalAuthService.getPortalUserByEmail(email);
    if (existing) {
      return res.status(409).json({ error: 'A portal account with this email already exists' });
    }
    const user = await portalAuthService.registerPortalUser({
      customer_id,
      email,
      password,
      full_name: full_name || '',
      phone: phone || ''
    });
    res.status(201).json({ message: 'Portal user created', user });
    } catch (err) {
      if (err.message === 'Email already registered') {
        return res.status(409).json({ error: err.message });
      }
      console.error('[PortalAdmin] Create user error:', err);
      res.status(500).json({ error: 'Failed to create portal user', detail: err.message });
  }
});

router.put('/users/:id', async (req, res) => {
  try {
    const { status, full_name, phone, email } = req.body;
    const user = await portalAuthService.getPortalUserById(req.params.id);
    if (!user) return res.status(404).json({ error: 'Portal user not found' });

    if (status && !['active', 'disabled'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }
    if (status) {
      const old = await repo.getById('portal_users', req.params.id);
      if (old) {
        await repo.upsert('portal_users', { ...old, status, updated_at: new Date().toISOString() });
      }
    }
    const updateFields = {};
    if (full_name !== undefined) updateFields.full_name = full_name;
    if (phone !== undefined) updateFields.phone = phone;
    if (email !== undefined) updateFields.email = email;
    if (Object.keys(updateFields).length > 0) {
      await portalAuthService.updatePortalUser(req.params.id, updateFields);
    }
    res.json({ message: 'Portal user updated' });
  } catch (err) {
    console.error('[PortalAdmin] Update user error:', err);
    res.status(500).json({ error: 'Failed to update portal user' });
  }
});

router.delete('/users/:id', async (req, res) => {
  try {
    const user = await portalAuthService.getPortalUserById(req.params.id);
    if (!user) return res.status(404).json({ error: 'Portal user not found' });

    const old = await repo.getById('portal_users', req.params.id);
    if (old) {
      await repo.upsert('portal_users', { ...old, status: 'disabled', updated_at: new Date().toISOString() });
    }
    await portalAuthService.revokeAllSessions(req.params.id);
    res.json({ message: 'Portal user disabled' });
  } catch (err) {
    console.error('[PortalAdmin] Delete user error:', err);
    res.status(500).json({ error: 'Failed to disable portal user' });
  }
});

router.post('/users/:id/reset-password', async (req, res) => {
  try {
    const { new_password } = req.body;
    if (!new_password || new_password.length < 6) {
      return res.status(400).json({ error: 'New password must be at least 6 characters' });
    }
    const user = await portalAuthService.getPortalUserById(req.params.id);
    if (!user) return res.status(404).json({ error: 'Portal user not found' });

    await portalAuthService.updatePassword(req.params.id, new_password);
    await portalAuthService.revokeAllSessions(req.params.id);
    res.json({ message: 'Password reset successfully' });
  } catch (err) {
    console.error('[PortalAdmin] Reset password error:', err);
    res.status(500).json({ error: 'Failed to reset password' });
  }
});

router.post('/users/auto-create', async (req, res) => {
  try {
    const { customer_id, name, email, phone, full_name, invite } = req.body;
    if (!customer_id) {
      return res.status(400).json({ error: 'customer_id is required' });
    }

    const existing = await portalAuthService.getPortalUserByCustomerId(customer_id);
    if (existing) {
      return res.json({ existing: true, user: existing, generated_password: null, invite_code: null });
    }

    // Upsert the customer into the backend customers table so the portal admin
    // user list and customer login resolution work for local-first customers.
    const existingCustomer = await repo.getById('customers', customer_id);
    if (existingCustomer) {
      await repo.upsert('customers', {
        ...existingCustomer,
        name: name || existingCustomer.name || '',
        email: email || existingCustomer.email || '',
        phone: phone || existingCustomer.phone || '',
      });
    } else {
      await repo.upsert('customers', {
        id: customer_id,
        name: name || '',
        email: email || '',
        phone: phone || '',
      });
    }

    const password = crypto.randomBytes(9).toString('base64url');
    const generatedEmail = await (async () => {
      if (name) {
        const words = name.split(/\s+/).filter(Boolean);
        for (const word of words) {
          const sanitized = word.toLowerCase().replace(/[^a-z0-9]/g, '');
          if (sanitized) {
            const candidate = `${sanitized}@pps.co`;
            const existing = await portalAuthService.getPortalUserByEmail(candidate);
            if (!existing) return candidate;
          }
        }
      }
      return `${customer_id.toLowerCase()}@pps.co`;
    })();
    const user = await portalAuthService.registerPortalUser({
      customer_id,
      email: generatedEmail,
      password,
      full_name: full_name || name || '',
      phone: phone || '',
      status: invite ? 'invited' : 'active'
    });
    if (invite) {
      const { code, expires_at } = await portalAuthService.createInviteCode(user.id);
      return res.status(201).json({ user, invite_code: code, invite_expires_at: expires_at });
    }
    res.status(201).json({ user, generated_password: password });
  } catch (err) {
    const message = err && typeof err === 'object' && typeof err.message === 'string' ? err.message : String(err);
    if (message === 'Email already registered') {
      return res.status(409).json({ error: message });
    }
    console.error('[PortalAdmin] Auto-create user error:', err);
    return res.status(500).json({ error: 'Failed to create portal user', detail: message });
  }
});

router.post('/users/:id/regenerate-password', async (req, res) => {
  try {
    const portalUserId = req.params.id;
    const { customer_id, name, email, phone } = req.body || {};
    let user = await portalAuthService.getPortalUserById(portalUserId);
    let adoptedId = portalUserId;

    if (!user && customer_id) {
      // Same customer recreated earlier under a different id (auto-create after a
      // redeploy wipe). Adopt that account and tell the frontend the new id.
      user = await portalAuthService.getPortalUserByCustomerId(customer_id);
      if (user) adoptedId = user.id;
    }

    if (!user) {
      // The portal_users row is missing (Render redeploy reset SQLite while the
      // customer still references this id). Recreate the account with the same id
      // so the customer's portalUserId stays valid. Prefer request-provided
      // customer data so this works even when Supabase env vars are not
      // configured on the host; fall back to a Supabase lookup.
      let customerId = customer_id;
      let info = { name, email, phone };
      if (!customerId || !email) {
        const customer = await portalAuthService.findCustomerByPortalUserId(portalUserId);
        if (!customer && !customerId) return res.status(404).json({ error: 'Portal user not found' });
        if (customer) {
          customerId = customer.id;
          info = {
            ...info,
            ...((customer.data && typeof customer.data === 'object') ? customer.data : {}),
          };
        }
      }
      try {
        user = await portalAuthService.registerPortalUser({
          id: portalUserId,
          customer_id: customerId,
          email: email || info.email || `${customerId}@pps.co`,
          password: crypto.randomBytes(9).toString('base64url'),
          full_name: name || info.name || '',
          phone: phone || info.phone || '',
          status: 'active',
        });
      } catch (err) {
        // Email collision with an account recreated earlier: adopt that account
        // instead of failing with 409.
        if (err.message !== 'Email already registered') throw err;
        const existing = await portalAuthService.getPortalUserByEmail(email || info.email);
        if (!existing) throw err;
        user = existing;
        adoptedId = existing.id;
      }
      console.log(`[PortalAdmin] Recreated missing portal user ${portalUserId} -> ${adoptedId} for customer ${customerId}`);
    }

    const new_password = crypto.randomBytes(9).toString('base64url');
    await portalAuthService.updatePassword(adoptedId, new_password);
    await portalAuthService.revokeAllSessions(adoptedId);
    res.json({ generated_password: new_password, user_id: adoptedId });
  } catch (err) {
    console.error('[PortalAdmin] Regenerate password error:', err);
    res.status(500).json({ error: 'Failed to regenerate password' });
  }
});

router.post('/users/:id/invite', async (req, res) => {
  try {
    const user = await portalAuthService.getPortalUserById(req.params.id);
    if (!user) return res.status(404).json({ error: 'Portal user not found' });
    if (user.status === 'disabled') {
      return res.status(400).json({ error: 'Cannot invite a disabled account' });
    }

    // Flipping an active account to 'invited' forces the customer to re-activate
    // (new code, old sessions revoked) — used for resending invites.
    if (user.status !== 'invited') {
      await portalAuthService.setPortalUserStatus(user.id, 'invited');
      await portalAuthService.revokeAllSessions(user.id);
    }
    const { code, expires_at } = await portalAuthService.createInviteCode(user.id);
    res.json({ code, expires_at, user: { ...user, status: 'invited' } });
  } catch (err) {
    console.error('[PortalAdmin] Invite user error:', err);
    res.status(500).json({ error: 'Failed to create invite' });
  }
});

// Staff (sales users) available for request assignment
router.get('/staff', async (req, res) => {
  try {
    const rows = await repo.getAll('users', { 'data->>is_active': 'eq.1' });
    rows.sort((a, b) => String(a.username || '').localeCompare(String(b.username || '')));
    res.json(rows.map(u => ({
      id: u.id,
      username: u.username,
      email: u.email,
      role: u.role,
      is_active: u.is_active,
    })));
  } catch (err) {
    console.error('[PortalAdmin] List staff error:', err);
    res.status(500).json({ error: 'Failed to load staff' });
  }
});

module.exports = router;
