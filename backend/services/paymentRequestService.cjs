/**
 * Payment Request Service
 *
 * NON-ACCOUNTING customer payment intentions ("I want to pay by bank").
 *
 * A payment request is communication/workflow data ONLY. Creating, listing,
 * or reviewing a payment request MUST NOT:
 *   - create a customer_payments row
 *   - create a payment allocation
 *   - modify an invoice (paidAmount / status / totals / outstanding)
 *   - call Stripe / create a PaymentIntent / create a checkout session
 *   - move money / post accounting entries
 *
 * The actual bank payment happens OUTSIDE the portal. ERP staff verify the
 * bank receipt and record the real accounting payment later through the
 * existing customer-payment / allocation workflow. `linkedPaymentId` is an
 * informational reference only — it never records or posts a payment.
 *
 * Architecture mirrors the quotation_requests lifecycle (portalLifecycleService):
 * rows live in the `payment_requests` JSONB-envelope table, customer identity
 * is ALWAYS derived from the authenticated portal JWT (never the body), reads
 * are customer-scoped via portalScope.customerFilter + JS ownership checks,
 * and numbering uses workflowEngine.nextYearScopedNumber (PAYREQ-YYYY-######).
 */

const crypto = require('crypto');
const repo = require('./supabaseRepository.cjs');
const workflowEngine = require('./workflowEngine.cjs');
const portalLifecycleService = require('./portalLifecycleService.cjs');
const { customerFilter } = require('./portalScope.cjs');

// ─── Controlled lifecycle (NOT accounting statuses) ─────────────────────────
const PAYMENT_REQUEST_STATUS = Object.freeze({
  REQUESTED: 'requested',
  UNDER_REVIEW: 'under_review',
  CONFIRMED: 'confirmed',
  REJECTED: 'rejected',
  CANCELLED: 'cancelled',
});

// Statuses that block a duplicate active request for the same invoice.
const ACTIVE_STATUSES = Object.freeze([
  PAYMENT_REQUEST_STATUS.REQUESTED,
  PAYMENT_REQUEST_STATUS.UNDER_REVIEW,
]);

const PAYMENT_METHOD = 'Bank Transfer';
const REQUEST_NUMBER_PREFIX = 'PAYREQ';

// Allowed transitions: requested → under_review → confirmed, or terminal.
const ALLOWED_TRANSITIONS = Object.freeze({
  [PAYMENT_REQUEST_STATUS.REQUESTED]: [
    PAYMENT_REQUEST_STATUS.UNDER_REVIEW,
    PAYMENT_REQUEST_STATUS.CONFIRMED,
    PAYMENT_REQUEST_STATUS.REJECTED,
    PAYMENT_REQUEST_STATUS.CANCELLED,
  ],
  [PAYMENT_REQUEST_STATUS.UNDER_REVIEW]: [
    PAYMENT_REQUEST_STATUS.CONFIRMED,
    PAYMENT_REQUEST_STATUS.REJECTED,
    PAYMENT_REQUEST_STATUS.CANCELLED,
  ],
  [PAYMENT_REQUEST_STATUS.CONFIRMED]: [],
  [PAYMENT_REQUEST_STATUS.REJECTED]: [],
  [PAYMENT_REQUEST_STATUS.CANCELLED]: [],
});

function genId(prefix = 'payreq') {
  return `${prefix}_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`;
}

function nowIso() {
  return new Date().toISOString();
}

function round2(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

function parseJson(value, fallback = null) {
  if (value === null || value === undefined) return fallback;
  if (typeof value !== 'string') return value;
  try { return JSON.parse(value); } catch { return fallback; }
}

/**
 * Customer-facing shape (camelCase), mirrors how portalService maps records.
 */
function toPortalDto(row) {
  if (!row) return null;
  return {
    id: row.id,
    requestNumber: row.request_number || row.requestNumber || null,
    customerId: row.customer_id || row.customerId || null,
    customerName: row.customer_name || row.customerName || null,
    invoiceId: row.invoice_id || row.invoiceId || null,
    invoiceNumber: row.invoice_number || row.invoiceNumber || null,
    requestedAmount: round2(row.requested_amount ?? row.requestedAmount ?? 0),
    paymentMethod: row.payment_method || row.paymentMethod || PAYMENT_METHOD,
    status: row.status || PAYMENT_REQUEST_STATUS.REQUESTED,
    note: row.note || null,
    requestedAt: row.requested_at || row.requestedAt || null,
    reviewedBy: row.reviewed_by || row.reviewedBy || null,
    reviewedAt: row.reviewed_at || row.reviewedAt || null,
    adminNotes: row.admin_notes || row.adminNotes || null,
    linkedPaymentId: row.linked_payment_id || row.linkedPaymentId || null,
    createdAt: row.created_at || null,
  };
}

/**
 * Best-effort ERP event emission (SSE + notifications + timeline). The core
 * request write must NEVER depend on notification success.
 */
async function safePublishEvent(payload) {
  try {
    await portalLifecycleService.publishErpEvent(payload);
  } catch (err) {
    console.warn('[PaymentRequest] Event publish skipped (best-effort):', err.message);
  }
}

/**
 * Create a payment request for the authenticated customer.
 *
 * @param {Object} args
 * @param {string} args.customerId     from the portal JWT — NEVER from the body
 * @param {string} [args.customerName] display name (portal JWT full_name)
 * @param {string} args.invoiceId      target invoice id
 * @param {number} [args.requestedAmount] optional; defaults to outstanding balance
 * @param {string} [args.note]         optional customer note
 * @param {string} [args.portalUserId] portal user id (audit trail)
 * @param {Object} [args.context]      request context for audit logging
 */
async function createRequest({
  customerId,
  customerName,
  invoiceId,
  requestedAmount,
  note,
  portalUserId,
  context = {},
}) {
  if (!customerId) throw new Error('Authenticated customer is required');
  if (!invoiceId) throw new Error('invoiceId is required');

  // 1. Resolve the invoice and verify ownership. Ownership failures are
  //    reported identically to "not found" so we never leak other customers'
  //    invoice existence.
  const invoice = await repo.getById('invoices', String(invoiceId));
  if (!invoice) throw new Error('Invoice not found');
  const invoiceCustomerId = invoice.customerId ?? invoice.customer_id;
  if (String(invoiceCustomerId ?? '') !== String(customerId)) {
    throw new Error('Invoice not found');
  }

  // 2. Authoritative outstanding balance from ERP data (never the browser).
  const total = round2(Number(invoice.totalAmount ?? invoice.total_amount ?? 0));
  const paid = round2(Number(invoice.paidAmount ?? invoice.paid_amount ?? 0));
  const outstanding = round2(Math.max(0, total - paid));

  let amount;
  if (requestedAmount === undefined || requestedAmount === null || requestedAmount === '') {
    amount = outstanding;
  } else {
    amount = round2(Number(requestedAmount));
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new Error('requestedAmount must be a positive number');
    }
    if (amount > outstanding + 0.005) {
      throw new Error(`requestedAmount (${amount}) exceeds the outstanding balance (${outstanding})`);
    }
  }

  // 3. Duplicate protection: block a second ACTIVE request for the same invoice.
  const existingRows = await repo.getAll('payment_requests', { 'data->>invoice_id': `eq.${String(invoiceId)}` });
  const duplicate = (existingRows || []).find((r) =>
    ACTIVE_STATUSES.includes(String(r.status || ''))
  );
  if (duplicate) {
    throw new Error(
      `An active payment request already exists for invoice ${invoice.invoice_number || invoice.invoiceNumber || invoiceId}`
    );
  }

  // 4. Persist the request (workflow data only — no accounting writes).
  const id = genId('payreq');
  const requestNumber = await workflowEngine.nextYearScopedNumber(
    'payment_requests', 'request_number', REQUEST_NUMBER_PREFIX
  );
  const record = {
    id,
    request_number: requestNumber,
    customer_id: String(customerId),
    customer_name: customerName || null,
    invoice_id: String(invoiceId),
    invoice_number: invoice.invoice_number || invoice.invoiceNumber || String(invoiceId),
    requested_amount: amount,
    payment_method: PAYMENT_METHOD,
    status: PAYMENT_REQUEST_STATUS.REQUESTED,
    note: note || null,
    requested_at: nowIso(),
    created_by: portalUserId || null,
  };
  await repo.upsert('payment_requests', record);

  // 5. Notify ERP staff (best-effort) so the request appears in the admin queue.
  await safePublishEvent({
    customerId: String(customerId),
    docType: 'payment_request',
    docId: id,
    docNumber: requestNumber,
    eventType: 'payment_request_created',
    status: PAYMENT_REQUEST_STATUS.REQUESTED,
    title: 'New payment request',
    body: `${customerName || customerId} requested to pay ${amount} for invoice ${record.invoice_number} by ${PAYMENT_METHOD}.`,
    link: '#/sales-flow/payment-requests',
    notificationType: 'payment',
    actor: { type: 'customer', id: portalUserId, name: customerName || 'Customer' },
    metadata: {
      invoiceId: String(invoiceId),
      invoiceNumber: record.invoice_number,
      requestedAmount: amount,
      paymentMethod: PAYMENT_METHOD,
      requestNumber,
    },
  });

  return record;
}

/**
 * Customer-scoped list of the authenticated customer's own requests.
 */
async function getRequestsForCustomer(customerId) {
  if (!customerId) return [];
  const rows = await repo.getAll('payment_requests', customerFilter('payment_requests', customerId));
  const target = String(customerId);
  const scoped = (rows || []).filter((r) =>
    String(r.customer_id ?? r.customerId ?? '') === target
  );
  scoped.sort((a, b) =>
    String(b.requested_at || b.created_at || '').localeCompare(String(a.requested_at || a.created_at || ''))
  );
  return scoped;
}

/**
 * Single request. When a customerId is supplied, ownership is enforced in JS
 * (mismatch → null → 404), matching the portal detail-read pattern.
 */
async function getRequestById(id, customerId = null) {
  if (!id) return null;
  const row = await repo.getById('payment_requests', String(id));
  if (!row) return null;
  if (customerId) {
    const rowCustomerId = row.customer_id ?? row.customerId ?? null;
    if (String(rowCustomerId ?? '') !== String(customerId)) return null;
  }
  // Resolve customer name from the authoritative customers table.
  if (row.customer_id) {
    try {
      const customer = await repo.getById('customers', String(row.customer_id));
      if (customer) {
        row.customer_name = customer.name || row.customer_name || null;
        row.customer_email = customer.email || null;
      }
    } catch (_) { /* best-effort */ }
  }
  return row;
}

/**
 * Admin list — all requests (optionally filtered by status).
 * Admin endpoints are role-protected by the route layer; this returns the
 * full rows so staff see customer, invoice, amount, method, status, date.
 */
async function listRequests({ status } = {}) {
  const filters = {};
  if (status) filters['data->>status'] = `eq.${String(status)}`;
  const rows = await repo.getAll('payment_requests', filters);
  if (!rows || rows.length === 0) return [];

  // Resolve customer names from the authoritative customers table (same
  // approach as portalLifecycleService.getRequests).
  let customerMap = {};
  try {
    const customers = await repo.getAll('customers');
    for (const c of (customers || [])) {
      if (c.id) customerMap[c.id] = c;
    }
  } catch (_) { /* best-effort */ }

  const resolved = rows.map((r) => {
    const c = customerMap[r.customer_id] || null;
    return {
      ...r,
      customer_name: (c && c.name) || r.customer_name || null,
      customer_email: (c && c.email) || null,
    };
  });

  resolved.sort((a, b) =>
    String(b.requested_at || b.created_at || '').localeCompare(String(a.requested_at || a.created_at || ''))
  );
  return resolved;
}

/**
 * Admin review — controlled lifecycle transition.
 *
 *   requested  → under_review → confirmed
 *   requested  → rejected | cancelled
 *   under_review → confirmed | rejected | cancelled
 *
 * Confirmation NEVER records the actual payment. `linkedPaymentId` is an
 * optional informational reference to a payment recorded later through the
 * existing ERP accounting-payment workflow.
 */
async function reviewRequest(id, {
  status,
  adminNotes,
  linkedPaymentId,
  reviewedBy,
  context = {},
}) {
  if (!id) throw new Error('Payment request id is required');
  if (!status) throw new Error('status is required');

  const request = await getRequestById(String(id));
  if (!request) throw new Error('Payment request not found');

  const allowed = ALLOWED_TRANSITIONS[String(request.status || '')] || [];
  if (!allowed.includes(String(status))) {
    throw new Error(`Invalid payment request transition: ${request.status} → ${status}`);
  }

  const updates = {
    ...request,
    status: String(status),
    reviewed_by: reviewedBy || null,
    reviewed_at: nowIso(),
  };
  if (adminNotes !== undefined) updates.admin_notes = String(adminNotes);
  if (linkedPaymentId !== undefined && linkedPaymentId !== null && linkedPaymentId !== '') {
    updates.linked_payment_id = String(linkedPaymentId);
  }

  await repo.upsert('payment_requests', updates);

  await safePublishEvent({
    customerId: String(request.customer_id ?? request.customerId ?? ''),
    docType: 'payment_request',
    docId: String(id),
    docNumber: request.request_number || request.requestNumber || null,
    eventType: `payment_request_${status}`,
    status: String(status),
    title: 'Payment request updated',
    body: `Your payment request ${request.request_number || request.requestNumber || id} for invoice ${request.invoice_number || request.invoice_id || ''} is now ${status}.`,
    link: `#/portal/payment-requests/${id}`,
    notificationType: 'payment',
    actor: { type: 'admin', id: reviewedBy, name: reviewedBy || 'ERP Staff' },
    metadata: {
      invoiceId: request.invoice_id || request.invoiceId || null,
      invoiceNumber: request.invoice_number || request.invoiceNumber || null,
      requestedAmount: request.requested_amount ?? request.requestedAmount ?? null,
      paymentMethod: request.payment_method || PAYMENT_METHOD,
      adminNotes: updates.admin_notes || null,
      linkedPaymentId: updates.linked_payment_id || null,
    },
  });

  return updates;
}

module.exports = {
  PAYMENT_REQUEST_STATUS,
  PAYMENT_METHOD,
  REQUEST_NUMBER_PREFIX,
  ACTIVE_STATUSES,
  ALLOWED_TRANSITIONS,
  toPortalDto,
  createRequest,
  getRequestsForCustomer,
  getRequestById,
  listRequests,
  reviewRequest,
};
