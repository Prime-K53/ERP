/**
 * Portal Lifecycle Service
 *
 * Centralized, backend-authoritative document lifecycle for the customer portal.
 * Every state transition, download, notification, timeline event and audit log
 * flows through this service — components must never duplicate this logic.
 *
 * Realms:
 *   portal  → customer-side SSE channel (customer is signed in to the portal)
 *   admin   → staff-side SSE channel (admin ERP is signed in)
 */

const crypto = require('crypto');
const repo = require('./supabaseRepository.cjs');
const { auditService } = require('../auditService.cjs');
const emailService = require('./emailService.cjs');
const workflowEngine = require('./workflowEngine.cjs');
const promotionEngine = require('./promotionEngine.cjs');
const promotionService = require('./promotionService.cjs');

// ─── Centralized status enums ────────────────────────────────────────────────
const REQUEST_STATUS = Object.freeze({
  DRAFT: 'draft',
  SUBMITTED: 'submitted',
  ASSIGNED: 'assigned',
  UNDER_REVIEW: 'under_review',
  WAITING_FOR_CUSTOMER: 'waiting_for_customer',
  READY_FOR_CONVERSION: 'ready_for_conversion',
  CONVERTED: 'converted',
  REJECTED: 'rejected',
  CANCELLED: 'cancelled',
});

const QUOTATION_STATUS = Object.freeze({
  READY: 'ready',
  ACCEPTED: 'accepted',
  REJECTED: 'rejected',
  REVISION_REQUESTED: 'revision_requested',
  CONVERTED: 'converted',
  EXPIRED: 'expired',
});

const EVENT_TYPES = Object.freeze({
  REQUEST_SUBMITTED: 'request_submitted',
  REQUEST_CANCELLED: 'request_cancelled',
  REQUEST_REVIEWED: 'request_reviewed',
  REQUEST_OPENED: 'request_opened',
  REQUEST_ASSIGNED: 'request_assigned',
  REQUEST_CLARIFICATION: 'request_clarification',
  REQUEST_REJECTED: 'request_rejected',
   REQUEST_MARKED: 'request_marked',
   REQUEST_UNMARKED: 'request_unmarked',
   REQUEST_DELETED: 'request_deleted',
  QUOTATION_GENERATION_STARTED: 'quotation_generation_started',
  QUOTATION_GENERATED: 'quotation_generated',
  QUOTATION_SAVED: 'quotation_saved',
  QUOTATION_NUMBER_ASSIGNED: 'quotation_number_assigned',
  QUOTATION_DOWNLOADED: 'document_downloaded',
  QUOTATION_ACCEPTED: 'quotation_accepted',
  QUOTATION_REJECTED: 'quotation_rejected',
  REVISION_REQUESTED: 'revision_requested',
  REVISION_REGENERATED: 'quotation_regenerated',
  QUOTATION_EXPIRED: 'quotation_expired',
  ORDER_CONVERTED: 'order_converted',
  ORDER_GENERATION_STARTED: 'order_generation_started',
  ORDER_GENERATED: 'order_generated',
  ORDER_STATUS_CHANGED: 'order_status_changed',
  REQUEST_REORDERED: 'request_reordered',
  COMMENT_ADDED: 'comment_added',
  INVOICE_POSTED: 'invoice_posted',
  INVOICE_UPDATED: 'invoice_updated',
  INVOICE_VOIDED: 'invoice_voided',
  INVOICE_PAID: 'invoice_paid',
  INVOICE_OVERDUE: 'invoice_overdue',
  PAYMENT_RECEIVED: 'payment_received',
  PAYMENT_ALLOCATED: 'payment_allocated',
  RECEIPT_CREATED: 'receipt_created',
  CREDIT_NOTE_CREATED: 'credit_note_created',
  PRODUCTION_STARTED: 'production_started',
  PRODUCTION_COMPLETED: 'production_completed',
  PRINTING_STARTED: 'printing_started',
  FINISHING_COMPLETED: 'finishing_completed',
  PACKAGING_COMPLETED: 'packaging_completed',
  ORDER_READY: 'order_ready',
  ORDER_DELIVERED: 'order_delivered',
  PDF_GENERATED: 'pdf_generated',
  PROOF_UPLOADED: 'proof_uploaded',
  DELIVERY_NOTE_CREATED: 'delivery_note_created',
  MESSAGE_RECEIVED: 'message_received',
  ARTWORK_APPROVED: 'artwork_approved',
  PROOF_APPROVED: 'proof_approved',
});

const NOTIFICATION_TYPES = Object.freeze({
  REQUEST: 'request',
  QUOTATION: 'quotation',
  ORDER: 'order',
  INVOICE: 'invoice',
  PAYMENT: 'payment',
  RECEIPT: 'receipt',
  PRODUCTION: 'production',
  DOCUMENT: 'document',
  DOWNLOAD: 'download',
  DECISION: 'decision',
  SYSTEM: 'system',
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

// Portal tables with REAL flat columns (not {id, data} JSONB envelopes).
// WHERE-clause shims must filter these by column name, never `data->>`.
const FLAT_SHIM_TABLES = new Set([
  'portal_users',
  'portal_sessions',
  'portal_password_resets',
  'portal_login_history',
]);

function snakeToCamel(field) {
  return String(field || '').replace(/_([a-z])/g, (_, c) => c.toUpperCase());
}

// Extract positional WHERE conditions: `WHERE [alias.]col = ? [AND col = ? ...]`.
// Each condition binds to params in order, exactly like the SQL it mirrors.
function whereConditions(trimmed) {
  return [...trimmed.matchAll(/(?:WHERE|\bAND\b)\s+(?:\w+\.)?(\w+)\s*=\s*\?/gi)]
    .map((m) => m[1]);
}

function shimFilter(table, field, value) {
  return { [FLAT_SHIM_TABLES.has(table) ? field : `data->>${field}`]: `eq.${value}` };
}

async function getOne(query, params = []) {
  const trimmed = String(query || '').trim();
  const countMatch = trimmed.match(/SELECT\s+COUNT\s*\(\*\)\s+as\s+(\w+)\s+FROM\s+(\w+)/i);
  if (countMatch) {
    const rows = await repo.getAll(countMatch[2]);
    return { [countMatch[1]]: rows.length };
  }
  const fromMatch = trimmed.match(/FROM\s+(\w+)/i);
  if (!fromMatch) return null;
  const table = fromMatch[1];
  const conds = whereConditions(trimmed);

  if (conds.length > 0 && params.length > 0) {
    // id-first lookup: fetch the row, then verify every remaining condition
    // in JS (dual-spelling aware: `customer_id` matches `data.customerId`).
    if (conds[0].toLowerCase() === 'id') {
      const row = await repo.getById(table, String(params[0]));
      if (!row) return null;
      for (let i = 1; i < conds.length; i++) {
        const value = params[i];
        if (value === undefined) break;
        const field = conds[i];
        const actual = row[field] ?? row[snakeToCamel(field)];
        if (String(actual ?? '') !== String(value)) return null;
      }
      return row;
    }
    const filters = {};
    for (let i = 0; i < conds.length; i++) {
      const value = params[i];
      if (value === undefined) break;
      Object.assign(filters, shimFilter(table, conds[i], value));
    }
    const rows = await repo.getAll(table, filters);
    return rows[0] || null;
  }

  const rows = await repo.getAll(table);
  return rows[0] || null;
}

async function getAll(query, params = []) {
  const trimmed = String(query || '').trim();
  const fromMatch = trimmed.match(/FROM\s+(\w+)/i);
  if (!fromMatch) return [];
  const table = fromMatch[1];
  const conds = whereConditions(trimmed);
  if (conds.length === 0) return repo.getAll(table);
  const filters = {};
  for (let i = 0; i < conds.length; i++) {
    const value = params[i];
    if (value === undefined) break;
    Object.assign(filters, shimFilter(table, conds[i], value));
  }
  return repo.getAll(table, filters);
}

async function runQuery(query, params = []) {
  const trimmed = String(query || '').trim();
  const placeholders = (query.match(/\?/g) || []).length;
  if (placeholders !== params.length) {
    return Promise.reject(
      new Error(`SQL binding mismatch: ${placeholders} placeholders vs ${params.length} params in: ${query.slice(0, 140)}`)
    );
  }
  try {
    if (/DELETE\s+FROM/i.test(trimmed)) {
      const deleteMatch = trimmed.match(/DELETE\s+FROM\s+(\w+)\s+WHERE\s+id\s*=\s*\?/i);
      if (deleteMatch) {
        await repo.softDelete(deleteMatch[1], String(params[0]));
        return { id: params[0], changes: 1 };
      }
      return { changes: 0 };
    }
    if (/UPDATE/i.test(trimmed)) {
      const updateMatch = trimmed.match(/UPDATE\s+(\w+)\s+SET/i);
      if (updateMatch) {
        const id = String(params[params.length - 1]);
        const row = await repo.getById(updateMatch[1], id);
        if (row) {
          const updates = { ...row };
          const setMatch = trimmed.match(/SET\s+(.+?)\s+WHERE/is);
          if (setMatch) {
            const pairs = setMatch[1].split(',');
            for (let i = 0; i < Math.min(pairs.length, params.length - 1); i++) {
              const colMatch = pairs[i].match(/(\w+)\s*=\s*\?/);
              if (colMatch) updates[colMatch[1]] = params[i];
            }
          }
          await repo.upsert(updateMatch[1], updates);
        }
        return { id, changes: 1 };
      }
      return { changes: 0 };
    }
    if (/INSERT\s+INTO/i.test(trimmed)) {
      const insertMatch = trimmed.match(/INSERT\s+INTO\s+(\w+)/i);
      if (insertMatch) {
        const id = String(params[0] || `gen_${Date.now()}`);
        const record = { id };
        const colMatch = trimmed.match(/\(([^)]+)\)\s*VALUES\s*\(/i);
        if (colMatch) {
          const cols = colMatch[1].split(',').map(c => c.trim());
          for (let i = 1; i < Math.min(cols.length, params.length); i++) {
            record[cols[i]] = params[i];
          }
        }
        await repo.upsert(insertMatch[1], record);
        return { id, changes: 1 };
      }
      return { changes: 0 };
    }
    return { changes: 0 };
  } catch (err) {
    throw err;
  }
}

function genId(prefix = 'plc') {
  return `${prefix}_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`;
}

function nowIso() {
  return new Date().toISOString();
}

function parseJson(value, fallback = null) {
  if (!value) return fallback;
  try { return JSON.parse(value); } catch { return fallback; }
}

function round2(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

function normalizeItems(items) {
  if (!Array.isArray(items)) return [];
  return items.map((item) => {
    const quantity = Math.max(1, Number(item.quantity ?? item.qty ?? 1) || 1);
    const unitPrice = round2(item.unitPrice ?? item.price ?? item.unit_price ?? 0);
    const base = {
      productId: item.productId || item.product_id || item.id || null,
      name: String(item.name || item.description || item.productName || 'Item'),
      quantity,
      unitPrice,
      lineTotal: round2(quantity * unitPrice),
    };
    // Preserve promotion line metadata (audit trail: master price + discount).
    if (item.originalUnitPrice !== undefined) base.originalUnitPrice = round2(item.originalUnitPrice);
    if (item.discountPercent !== undefined) base.discountPercent = round2(item.discountPercent);
    if (item.discountAmount !== undefined) base.discountAmount = round2(item.discountAmount);
    if (item.netUnitPrice !== undefined) base.netUnitPrice = round2(item.netUnitPrice);
    if (item.promotionId) base.promotionId = item.promotionId;
    if (item.promotionCode) base.promotionCode = item.promotionCode;
    return base;
  }).filter((item) => item.name && item.quantity > 0);
}

function computeTotals(items, discount = 0, taxRate = 0, deliveryFee = 0) {
  const subtotal = round2(items.reduce((sum, i) => sum + (Number(i.lineTotal) || 0), 0));
  const taxAmount = round2(subtotal * (Number(taxRate) || 0) / 100);
  const total = round2(subtotal - round2(discount) + taxAmount + round2(deliveryFee));
  return { subtotal, taxAmount, total };
}

// ─── Promotion helpers (server-authoritative pricing) ───────────────────────

// ERP master catalog used to resolve authoritative prices. Browser-submitted
// prices are display information only and are never trusted.
async function getCatalogPriceMap() {
  const cloud = await repo.getAll('inventory');
  const map = {};
  for (const item of cloud || []) {
    map[item.id] = {
      name: item.name || item.productName || null,
      sellingPrice: Number(item.sellingPrice ?? item.selling_price ?? item.price ?? 0) || 0,
      category: item.category || item.type || null,
    };
  }
  return map;
}

function stripPromotionLineFields(item) {
  const { originalUnitPrice, discountPercent, discountAmount, netUnitPrice, promotionId, promotionCode, ...rest } = item || {};
  return rest;
}

/**
 * Run the promotion engine on an order context (portal). Resolves authoritative
 * master prices and evaluates eligibility server-side. Usage is recorded by the
 * caller (recordOrderPromotionRedemption) AFTER the source document is
 * persisted, so redemptions never reference a row that does not exist yet.
 */
async function runOrderPromotion({ customerId, items, promotionCode }) {
  const catalogMap = await getCatalogPriceMap();
  const authoritativeItems = promotionEngine.resolveAuthoritativePrices(items, catalogMap);
  const subtotal = round2(authoritativeItems.reduce((s, l) => s + Number(l.lineTotal || 0), 0));

  const customer = await repo.getById('customers', customerId);
  const companyId = (customer && (customer.companyId || customer.company_id)) || null;

  const [active, usageByPromotion, customerUsageByPromotion] = await Promise.all([
    promotionService.getActivePromotions({ companyId, channel: 'PORTAL' }),
    promotionService.getUsageByPromotion({ companyId }),
    promotionService.getUsageByPromotionForCustomer(customerId, { companyId }),
  ]);

  const calculation = promotionEngine.calculatePromotion({
    companyId,
    customer: { id: customerId, createdAt: (customer && (customer.createdAt || customer.created_at)) || null },
    channel: 'PORTAL',
    items: authoritativeItems,
    subtotal,
    promotionCode: promotionCode || null,
    promotions: active,
    usageByPromotion,
    customerUsageByPromotion,
  });

  const primary = calculation.promotions[0] || null;
  const promotion = primary
    ? {
        id: primary.id,
        code: primary.code,
        name: primary.name,
        discountType: primary.discountType,
        discountValue: primary.discountValue,
        discountAmount: calculation.discountTotal,
        discountPercent: subtotal > 0 ? round2((calculation.discountTotal / subtotal) * 100) : 0,
        channel: 'PORTAL',
        appliedAt: nowIso(),
      }
    : null;

  // Line items keep the ERP master price PLUS explicit discount fields so the
  // ERP always sees WHY the price differs — never a silently changed master.
  const storedItems = calculation.lines.map((l) => ({
    productId: l.productId,
    name: l.name,
    quantity: l.quantity,
    unitPrice: l.originalUnitPrice,
    originalUnitPrice: l.originalUnitPrice,
    discountPercent: l.discountPercent,
    discountAmount: l.discountAmount,
    netUnitPrice: l.netUnitPrice,
    lineTotal: round2(l.originalUnitPrice * l.quantity),
    promotionId: l.promotionId,
    promotionCode: l.promotionCode,
    // Price source audit flag: 'master' | 'unknown_product' | 'custom_line'.
    // A line priced at 0 with source 'unknown_product' must be reviewed by
    // sales before a quotation is issued.
    priceSource: l.priceSource || 'master',
  }));

  return {
    subtotal,
    discountTotal: calculation.discountTotal,
    total: calculation.subtotalAfterDiscount,
    promotion,
    promotionApplied: calculation.applied,
    primary,
    companyId,
    items: storedItems,
    calculation,
  };
}

/**
 * Record promotion usage atomically (best-effort when the cloud RPC is
 * unavailable — checkout must never fail on usage bookkeeping). Call ONLY
 * after the source document has been persisted.
 */
async function recordOrderPromotionRedemption({ primary, customerId, companyId, sourceId, sourceType = 'request', sourceNumber = null, discountTotal, subtotal, subtotalAfter, snapshot }) {
  if (!primary || !sourceId) return;
  try {
    await promotionService.recordRedemption({
      promotionId: primary.id,
      customerId,
      companyId,
      sourceType,
      sourceId,
      sourceNumber,
      discountAmount: discountTotal,
      subtotalBefore: subtotal,
      subtotalAfter,
      snapshot,
    });
  } catch (err) {
    console.warn('[Lifecycle] Promotion usage recording failed (non-fatal):', err.message);
  }
}

// Normalizes request statuses from older database generations so the rest of the
// system only ever sees the current status vocabulary.
function normalizeRequestStatus(status) {
  if (status === 'quotation_ready') return REQUEST_STATUS.READY_FOR_CONVERSION;
  return status;
}

// ─── Realtime (SSE) hub ──────────────────────────────────────────────────────
const subscribers = { portal: new Map(), admin: new Map() };

function subscribe(channel, res, req) {
  const key = crypto.randomUUID();
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.write('retry: 15000\n\n');
  const heartbeat = setInterval(() => {
    try { res.write(': ping\n\n'); } catch { /* connection dropped */ }
  }, 25000);

  const entry = { res, req, cleanup: null };
  subscribers[channel].set(key, entry);

  const cleanup = () => {
    clearInterval(heartbeat);
    subscribers[channel].delete(key);
    req.removeListener('close', cleanup);
  };
  entry.cleanup = cleanup;
  req.on('close', cleanup);

  return () => cleanup();
}

function shouldDeliver(channel, entry, payload = {}) {
  if (!entry || !entry.req || !payload || typeof payload !== 'object') return true;

  if (channel === 'portal') {
    const portalUser = entry.req.portalUser || {};
    if (!portalUser.customer_id) return false;
    if (payload.customerId && String(payload.customerId) !== String(portalUser.customer_id)) return false;
    return true;
  }

  return true;
}

function broadcast(channel, eventName, payload) {
  const data = `event: ${eventName}\ndata: ${JSON.stringify(payload)}\n\n`;
  for (const entry of subscribers[channel].values()) {
    if (!shouldDeliver(channel, entry, payload)) continue;
    try { entry.res.write(data); } catch { /* connection dropped */ }
  }
}

// ─── Shared recording primitives (single source of truth) ──────────────────
async function addTimeline( customerId, docType, docId, eventType, title, description, actor, metadata = {}) {
  const id = genId('ptl');
  await runQuery(
    `INSERT INTO portal_timeline_events
       (id, customer_id, doc_type, doc_id, event_type, title, description, actor_type, actor_id, actor_name, metadata)
     VALUES (? , ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, customerId || null, docType, docId, eventType, title, description || null, actor.type || 'system', actor.id || null, actor.name || null, Object.keys(metadata).length ? JSON.stringify(metadata) : null]
  );
  return id;
}

async function logAudit({ actor, action, entityType, entityId, details, oldValue, newValue, context = {} }) {
  try {
    await auditService.logEvent({
      userId: actor.id || actor.name || 'portal',
      userRole: actor.role || 'portal_customer',
      action,
      entityType,
      entityId,
      details,
      oldValue,
      newValue,
      ipAddress: context.ip,
      userAgent: context.userAgent,
      httpMethod: context.method,
      httpPath: context.path,
      correlationId: context.correlationId,
    });
  } catch (err) {
    console.error('[Lifecycle] Audit log failed:', err.message);
  }
}

async function notifyCustomer({ customerId, type, title, body, link, actorName }) {
  const users = await getAll(
    'SELECT id, email, full_name FROM portal_users WHERE customer_id = ? AND status = ?',
    [customerId, 'active']
  );
  for (const user of users) {
    await runQuery(
      `INSERT INTO portal_notifications (id, portal_user_id, type, title, body, link)
       VALUES (?, ?, ?, ?, ?, ? )`,
      [genId('pnt'), user.id, type, title, body || null, link || null]
    );
  }
  broadcast('portal', 'notification', { customerId, type, title, body, link, actorName, createdAt: nowIso(),
  });
}

async function notifyAdmin({ type, title, body, link, customerId, customerName }) {
  await runQuery(
    `INSERT INTO admin_notifications (id, type, title, body, link, customer_id, customer_name)
     VALUES (? , ?, ?, ?, ?, ?, ?)`,
    [genId('ant'), type, title, body || null, link || null, customerId || null, customerName || null]
  );
  const notificationPayload = { type, title, body, link, customerId, customerName, createdAt: nowIso() };
  broadcast('admin', 'notification', notificationPayload);
  broadcast('admin', 'system_alert', {
    ...notificationPayload,
    module: 'Sales',
    priority: 'Medium',
    actionUrl: link && link.startsWith('#') ? link.slice(1) : (link || '/sales-flow/requests'),
  });
}

async function sendEmailBestEffort({ to, subject, text }) {
  if (!to) return;
  try {
    await emailService.sendEmail({ to, subject, text, senderName: 'Prime ERP' });
  } catch (err) {
    console.warn('[Lifecycle] Email skipped (best-effort):', err.message);
  }
}

// Emits a data-changed event over the relevant SSE channel so connected clients
// refetch the affected document/entity immediately (no manual refresh needed).
function emitEntityChange(channel, payload) {
  broadcast(channel, 'entity_changed', payload);
}

// ─── Lifecycle state machine ─────────────────────────────────────────────────
function assertRequestTransition(request, toStatus) {
  const allowed = {
    [REQUEST_STATUS.DRAFT]: [REQUEST_STATUS.SUBMITTED, REQUEST_STATUS.REJECTED, REQUEST_STATUS.CANCELLED],
    [REQUEST_STATUS.SUBMITTED]: [REQUEST_STATUS.ASSIGNED, REQUEST_STATUS.UNDER_REVIEW, REQUEST_STATUS.READY_FOR_CONVERSION, REQUEST_STATUS.REJECTED, REQUEST_STATUS.CANCELLED],
    [REQUEST_STATUS.ASSIGNED]: [REQUEST_STATUS.UNDER_REVIEW, REQUEST_STATUS.READY_FOR_CONVERSION, REQUEST_STATUS.REJECTED, REQUEST_STATUS.CANCELLED],
    [REQUEST_STATUS.UNDER_REVIEW]: [REQUEST_STATUS.WAITING_FOR_CUSTOMER, REQUEST_STATUS.READY_FOR_CONVERSION, REQUEST_STATUS.REJECTED, REQUEST_STATUS.CANCELLED],
    [REQUEST_STATUS.WAITING_FOR_CUSTOMER]: [REQUEST_STATUS.UNDER_REVIEW, REQUEST_STATUS.READY_FOR_CONVERSION, REQUEST_STATUS.REJECTED, REQUEST_STATUS.CANCELLED],
    [REQUEST_STATUS.READY_FOR_CONVERSION]: [REQUEST_STATUS.CONVERTED, REQUEST_STATUS.REJECTED, REQUEST_STATUS.CANCELLED],
    [REQUEST_STATUS.CONVERTED]: [],
    [REQUEST_STATUS.REJECTED]: [],
    [REQUEST_STATUS.CANCELLED]: [],
  };
  if (!(allowed[request.status] || []).includes(toStatus)) {
    throw new Error(`Invalid request transition: ${request.status} → ${toStatus}`);
  }
}

function assertQuotationTransition(quotation, toStatus) {
  const allowed = {
    [QUOTATION_STATUS.READY]: [QUOTATION_STATUS.ACCEPTED, QUOTATION_STATUS.REJECTED, QUOTATION_STATUS.REVISION_REQUESTED, QUOTATION_STATUS.CONVERTED],
    [QUOTATION_STATUS.REVISION_REQUESTED]: [QUOTATION_STATUS.READY, QUOTATION_STATUS.ACCEPTED, QUOTATION_STATUS.REJECTED, QUOTATION_STATUS.REVISION_REQUESTED],
    [QUOTATION_STATUS.ACCEPTED]: [QUOTATION_STATUS.CONVERTED],
    [QUOTATION_STATUS.REJECTED]: [],
    [QUOTATION_STATUS.CONVERTED]: [],
    [QUOTATION_STATUS.EXPIRED]: [],
  };
  if (!(allowed[quotation.status] || []).includes(toStatus)) {
    throw new Error(`Invalid quotation transition: ${quotation.status} → ${toStatus}`);
  }
}

// ─── Phase 3/4 shared primitives ─────────────────────────────────────────────

// Immutable decision signature (accept / reject / revision request).
async function recordSignature({ customerId, docType, docId, decision, signedBy, signerName, signerEmail, note, context = {} }) {
  await runQuery(
    `INSERT INTO document_signatures
       (id, customer_id, doc_type, doc_id, decision, signed_by, signer_name, signer_email, note, ip_address, user_agent)
     VALUES (? , ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [genId('dsg'), customerId || null, docType, docId, decision, signedBy || null, signerName || null, signerEmail || null, note || null, context.ip || null, context.userAgent || null]
  );
}

// Lazy expiry enforcement: quotations whose valid_until has passed move to
// 'expired' the moment anyone reads them (or when the admin list is fetched).
async function applyQuotationExpiry(quotation) {
  if (!quotation || !quotation.valid_until) return quotation;
  if (![QUOTATION_STATUS.READY, QUOTATION_STATUS.REVISION_REQUESTED].includes(quotation.status)) return quotation;
  if (new Date(quotation.valid_until).getTime() > Date.now()) return quotation;

  const expiredAt = nowIso();
  await runQuery(
    `UPDATE quotations SET status = ?, expired_at = ?, updated_at = ? WHERE id = ?`,
    [QUOTATION_STATUS.EXPIRED, expiredAt, expiredAt, quotation.id]
  );
  quotation.status = QUOTATION_STATUS.EXPIRED;
  quotation.expired_at = expiredAt;

  await addTimeline(quotation.customer_id, 'quotation', quotation.id, EVENT_TYPES.QUOTATION_EXPIRED,
    'Quotation expired', `${quotation.quotation_number} expired on ${quotation.valid_until}.`,
    { type: 'system' }, { validUntil: quotation.valid_until });

  await logAudit({
    actor: { id: 'system', name: 'Expiry engine', role: 'system' },
    action: 'QUOTATION_EXPIRE', entityType: 'quotation', entityId: quotation.id,
    details: `${quotation.quotation_number} expired (valid_until ${quotation.valid_until})`,
    oldValue: { status: 'ready' }, newValue: { status: QUOTATION_STATUS.EXPIRED },
  });

  await notifyAdmin({
    type: NOTIFICATION_TYPES.SYSTEM, title: 'Quotation expired',
    body: `${quotation.quotation_number} expired on ${quotation.valid_until} without a customer decision.`,
    link: '#/sales-flow/requests', customerId: quotation.customer_id, customerName: quotation.customer_name,
  });

  emitEntityChange('admin', { customerId: quotation.customer_id, docType: 'quotation', docId: quotation.id, status: QUOTATION_STATUS.EXPIRED, quotationNumber: quotation.quotation_number });
  return quotation;
}

const DOC_TABLES = Object.freeze({ request: 'quotation_requests', quotation: 'quotations', order: 'sales_orders' });

// Confirms the caller may access a chain document; returns the row.
async function assertDocAccess(docType, docId, { customerId}) {
  const table = DOC_TABLES[docType];
  if (!table) throw new Error('Unknown document type');
  const row = await getOne(`SELECT id, customer_id FROM ${table} WHERE id = ?`, [docId]);
  if (!row) throw new Error('Document not found');
  const rowCustomerId = row.customer_id ?? row.customerId;
  if (customerId && String(rowCustomerId ?? '') !== String(customerId)) throw new Error('Document not found');
  return row;
}

function docPortalLink(docType, docId) {
  if (docType === 'invoice') return `#/portal/invoices/${docId}`;
  if (docType === 'payment' || docType === 'receipt') return `#/portal/payments/${docId}`;
  if (docType === 'quotation') return `#/portal/quotations/${docId}`;
  if (docType === 'order') return `#/portal/orders/${docId}`;
  return `#/portal/requests/${docId}`;
}

function normalizeActor(actor = {}) {
  return {
    type: actor.type || 'system',
    id: actor.id || actor.userId || null,
    name: actor.name || actor.username || actor.email || (actor.type === 'admin' ? 'Staff' : 'ERP'),
    role: actor.role || (actor.type === 'admin' ? 'admin' : 'system'),
  };
}

function publicEntityPayload({
  customerId,
  docType,
  docId,
  eventType,
  status,
  docNumber,
  metadata = {},
}) {
  return {
    customerId,
    docType,
    docId,
    event: eventType,
    eventType,
    status,
    docNumber,
    metadata,
    updatedAt: nowIso(),
  };
}

// ─── Customer: requests ──────────────────────────────────────────────────────
const portalLifecycleService = {

  REQUEST_STATUS,
  QUOTATION_STATUS,
  SALES_ORDER_STATUS: workflowEngine.SALES_ORDER_STATUS,
  EVENT_TYPES,
  NOTIFICATION_TYPES,

  subscribePortal(req, res) { return subscribe('portal', res, req); },
  subscribeAdmin(req, res) { return subscribe('admin', res, req); },
  emitEntityChange(channel, payload) { return emitEntityChange(channel, payload); },
  notifyCustomer(payload) { return notifyCustomer(payload); },
  notifyAdmin(payload) { return notifyAdmin(payload); },

  async publishErpEvent({
    customerId,
    docType,
    docId,
    docNumber,
    eventType,
    status,
    title,
    body,
    link,
    notificationType,
    actor = {},
    metadata = {},
    notify = true,
    timeline = true,
  } = {}) {
    if (!customerId || !docType || !docId || !eventType) {
      return { published: false, reason: 'missing_required_event_fields' };
    }

    const safeActor = normalizeActor(actor);
    const displayTitle = title || `${docType} updated`;
    const displayBody = body || null;
    const resolvedLink = link || docPortalLink(docType, docId);

    if (timeline) {
      await addTimeline(
        customerId,
        docType,
        docId,
        eventType,
        displayTitle,
        displayBody,
        safeActor,
        { docNumber: docNumber || null, status: status || null, ...metadata }
      );
    }

    if (notify) {
      await notifyCustomer({
        customerId,
        type: notificationType || NOTIFICATION_TYPES.SYSTEM,
        title: displayTitle,
        body: displayBody,
        link: resolvedLink,
        actorName: safeActor.name,
      });
    }

    const payload = publicEntityPayload({
      customerId,
      docType,
      docId,
      eventType,
      status,
      docNumber,
      metadata,
    });
    emitEntityChange('portal', payload);
    emitEntityChange('admin', payload);
    return { published: true, payload };
  },

  async createQuotationRequest({ portalUserId, customerId, customerName, requestType, items, notes, requestedDeliveryDate, attachments, reorderOf, reorderOfNumber, promotionCode, context = {} }) {
    if (!Array.isArray(items) || items.length === 0) throw new Error('At least one line item is required');
    const requestTypeValue = requestType === 'order' ? 'order' : 'quotation';
    const normalizedAttachments = Array.isArray(attachments) ? attachments.slice(0, 20).map((a) => ({
      name: String(a.name || a.fileName || 'Attachment'),
      url: String(a.url || ''),
      type: String(a.type || ''),
    })) : [];

    const id = genId('req');
    const requestNumber = await workflowEngine.nextYearScopedNumber(
      'quotation_requests', 'request_number', workflowEngine.requestNumberPrefix(requestTypeValue)
    );

    // Server-authoritative pricing + promotion calculation. Browser prices and
    // any submitted discount are never trusted.
    const promoResult = await runOrderPromotion({
      customerId,
      items,
      promotionCode: promotionCode || null,
    });
    const storedItems = promoResult.items;
    const subtotal = promoResult.subtotal;
    const { discountTotal, total, promotion, promotionApplied } = promoResult;

    await runQuery(
      `INSERT INTO quotation_requests
         (id, request_number, customer_id, customer_name, request_type, items, subtotal,
          discount_total, total, promotion, promotion_applied,
          notes, status, requested_delivery_date, attachments, reorder_of, reorder_of_number, created_by)
       VALUES (?, ?, ?, ? , ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, requestNumber, customerId, customerName, requestTypeValue, JSON.stringify(storedItems), subtotal, discountTotal, total, promotion ? JSON.stringify(promotion) : null, promotionApplied ? 1 : 0, notes || null, REQUEST_STATUS.SUBMITTED, requestedDeliveryDate || null, normalizedAttachments.length ? JSON.stringify(normalizedAttachments) : null, reorderOf || null, reorderOfNumber || null, portalUserId]
    );

    // Usage is recorded only after the request row exists (atomic, best-effort).
    await recordOrderPromotionRedemption({
      primary: promoResult.primary,
      customerId,
      companyId: promoResult.companyId,
      sourceId: id,
      sourceType: 'request',
      sourceNumber: requestNumber,
      discountTotal,
      subtotal,
      subtotalAfter: total,
      snapshot: promotion,
    });

    await addTimeline( customerId, 'request', id, EVENT_TYPES.REQUEST_SUBMITTED,
      'Request submitted', `${customerName} submitted a ${requestTypeValue} request (${requestNumber}).`,
      { type: 'customer', id: portalUserId, name: customerName },
      { requestNumber, itemCount: storedItems.length, subtotal, discountTotal, total, promotion: promotion ? { code: promotion.code, name: promotion.name, discountAmount: promotion.discountAmount } : null, requestedDeliveryDate: requestedDeliveryDate || null, reorderOf: reorderOf || null, reorderOfNumber: reorderOfNumber || null });

    await logAudit({
      actor: { id: portalUserId, name: customerName, role: 'portal_customer' },
      action: 'PORTAL_REQUEST_CREATE',
      entityType: 'quotation_request',
      entityId: id,
      details: `${requestNumber} created via customer portal${promotion ? ` — promotion ${promotion.code || promotion.name} applied (${discountTotal})` : ''}${reorderOfNumber ? ` (reorder of ${reorderOfNumber})` : ''}`,
      newValue: { requestNumber, requestType: requestTypeValue, items: storedItems, subtotal, discountTotal, total, promotion, requestedDeliveryDate: requestedDeliveryDate || null, reorderOf: reorderOf || null, reorderOfNumber: reorderOfNumber || null },
      context,
    });

    await notifyAdmin({
      type: NOTIFICATION_TYPES.REQUEST,
      title: requestTypeValue === 'order' ? 'New order request' : 'New quotation request',
      body: `Customer: ${customerName} — Request: ${requestNumber} — Submitted just now.${promotion ? ` Promotion ${promotion.code || promotion.name} applied (${discountTotal} off).` : ''}${reorderOfNumber ? ` Reorder of ${reorderOfNumber}.` : ''}`,
      link: '#/sales-flow/requests',
      customerId,
      customerName,
    });

    emitEntityChange('portal', { customerId, docType: 'request', docId: id, status: REQUEST_STATUS.SUBMITTED, requestNumber, promotionApplied });
    emitEntityChange('admin', { customerId, docType: 'request', docId: id, status: REQUEST_STATUS.SUBMITTED, requestNumber, promotionApplied });

    return { id, requestNumber, status: REQUEST_STATUS.SUBMITTED, items: storedItems, subtotal, discountTotal, total, promotion, promotionApplied, reorderOf: reorderOf || null, reorderOfNumber: reorderOfNumber || null };
  },

  // ─── Server-side order preview (no persistence, no usage consumption) ─────
  // The Portal frontend may show an estimate; the backend is the final
  // authority and re-calculates at submission time.
  async previewOrder({ customerId, items, promotionCode = null }) {
    const result = await runOrderPromotion({
      customerId,
      items,
      promotionCode: promotionCode || null,
    });
    return {
      applied: result.promotionApplied,
      promotion: result.promotion,
      lines: result.items,
      subtotal: result.subtotal,
      discountTotal: result.discountTotal,
      subtotalBeforeDiscount: result.subtotal,
      subtotalAfterDiscount: result.total,
      taxableSubtotal: result.total,
      grandTotal: result.total,
      metadata: result.calculation.metadata || {},
    };
  },

  // Active PORTAL promotions for display (badges / banners). Display only —
  // the authoritative calculation happens server-side at submission.
  async getActivePortalPromotions(customerId) {
    const customer = await repo.getById('customers', customerId);
    const companyId = (customer && (customer.companyId || customer.company_id)) || null;
    const active = await promotionService.getActivePromotions({ companyId, channel: 'PORTAL' });
    return active.map((p) => ({
      id: p.id,
      name: p.name,
      description: p.description || null,
      code: p.code || p.promotionCode || null,
      discountType: p.discountType || p.type || 'percentage',
      discountValue: Number(p.discountValue ?? p.value ?? 0) || 0,
      channel: p.channel || 'PORTAL',
      isAutoApply: p.isAutoApply !== undefined ? !!p.isAutoApply : true,
      applicableTo: p.applicableTo || p.applicable_to || 'all',
      productIds: p.productIds || p.applicable_products || [],
      categoryIds: p.categoryIds || p.applicable_categories || [],
      minimumOrderAmount: Number(p.minimumOrderAmount ?? p.min_order_amount ?? 0) || 0,
      endsAt: p.endsAt || p.ends_at || null,
    }));
  },

  // Active PORTAL banner ads for display (display only). Managed in
  // Smart Operations Hub → Ads. Ordered by priority (highest first).
  async getActivePortalAds(customerId) {
    let rows = [];
    try {
      rows = await repo.getAll('portal_ads');
    } catch (err) {
      console.warn('[Portal] portal_ads read failed:', err?.message || err);
      rows = [];
    }
    if (!Array.isArray(rows) || rows.length === 0) return [];

    // Multi-company safety: only serve ads belonging to the customer's company.
    let companyId = null;
    if (customerId) {
      try {
        const customer = await repo.getById('customers', customerId);
        companyId = (customer && (customer.companyId || customer.company_id)) || null;
      } catch {
        companyId = null;
      }
    }
    if (companyId) {
      rows = rows.filter((ad) => {
        const adCompany = ad.companyId || ad.company_id;
        return !adCompany || String(adCompany) === String(companyId);
      });
    }

    const now = Date.now();
    return rows
      .map((ad) => ({
        id: ad.id,
        title: ad.title || '',
        subtitle: ad.subtitle || null,
        badge: ad.badge || null,
        ctaLabel: ad.ctaLabel || null,
        ctaTarget: ad.ctaTarget || null,
        imageUrl: ad.imageUrl || null,
        gradient: ad.gradient || null,
        emoji: ad.emoji || null,
        isActive: ad.isActive !== false && ad.status !== 'paused' && ad.status !== 'draft' && ad.status !== 'expired',
        startsAt: ad.startsAt || ad.starts_at || null,
        endsAt: ad.endsAt || ad.ends_at || ad.expiresAt || null,
        priority: Number(ad.priority ?? 0) || 0,
      }))
      .filter((ad) => {
        if (!ad.isActive) return false;
        const start = ad.startsAt ? new Date(ad.startsAt).getTime() : null;
        const end = ad.endsAt ? new Date(ad.endsAt).getTime() : null;
        if (start !== null && !Number.isNaN(start) && now < start) return false;
        if (end !== null && !Number.isNaN(end) && now > end) return false;
        return true;
      })
      .sort((a, b) => b.priority - a.priority)
      .map((ad) => ({
        id: ad.id,
        title: ad.title,
        subtitle: ad.subtitle,
        badge: ad.badge,
        ctaLabel: ad.ctaLabel,
        ctaTarget: ad.ctaTarget,
        imageUrl: ad.imageUrl,
        gradient: ad.gradient,
        emoji: ad.emoji,
        endsAt: ad.endsAt,
      }));
  },

  async getRequests({ customerId, status } = {}) {
    let query = `
      SELECT q.*, c.name AS resolved_customer_name
      FROM quotation_requests q
      LEFT JOIN customers c ON c.id = q.customer_id
      WHERE 1=1`;
    const params = [];
    if (customerId) { query += ' AND q.customer_id = ?'; params.push(customerId); }
    
    if (status) { query += ' AND q.status = ?'; params.push(status); }
    query += ' ORDER BY q.created_at DESC';
    const rows = await getAll(query, params);
    return rows.map((r) => ({
      ...r,
      status: r.quotation_id ? (r.status === 'quotation_ready' ? REQUEST_STATUS.CONVERTED : r.status) : normalizeRequestStatus(r.status),
      customer_name: r.resolved_customer_name || r.customer_name,
      items: parseJson(r.items, []),
      attachments: parseJson(r.attachments, []),
      promotion: parseJson(r.promotion, null),
    }));
  },

  async getRequestById(id, { customerId} = {}) {
    const request = await getOne(
      `SELECT q.*, c.name AS resolved_customer_name
         FROM quotation_requests q
         LEFT JOIN customers c ON c.id = q.customer_id
        WHERE q.id = ?`,
      [id]
    );
    if (!request) return null;
    if (customerId && String(request.customer_id ?? request.customerId ?? '') !== String(customerId)) return null;
    request.status = request.quotation_id ? (request.status === 'quotation_ready' ? REQUEST_STATUS.CONVERTED : request.status) : normalizeRequestStatus(request.status);
    request.customer_name = request.resolved_customer_name || request.customer_name;
    request.items = parseJson(request.items, []);
    request.attachments = parseJson(request.attachments, []);
    request.promotion = parseJson(request.promotion, null);
    return request;
  },

  async cancelRequest(id, { portalUserId, customerId, context = {} }) {
    const request = await this.getRequestById(id, { customerId});
    if (!request) throw new Error('Request not found');
    assertRequestTransition(request, REQUEST_STATUS.CANCELLED);

    await runQuery(
      `UPDATE quotation_requests SET status = ?, updated_at = ? WHERE id = ?`,
      [REQUEST_STATUS.CANCELLED, nowIso(), id]
    );

    await addTimeline( customerId, 'request', id, EVENT_TYPES.REQUEST_CANCELLED,
      'Request cancelled', `${request.customer_name} cancelled ${request.request_number}.`,
      { type: 'customer', id: portalUserId, name: request.customer_name });

    await logAudit({
      actor: { id: portalUserId, name: request.customer_name, role: 'portal_customer' }, action: 'PORTAL_REQUEST_CANCEL', entityType: 'quotation_request', entityId: id,
      details: `${request.request_number} cancelled by customer`,
      oldValue: { status: request.status }, newValue: { status: REQUEST_STATUS.CANCELLED }, context,
    });

    await notifyAdmin({ type: NOTIFICATION_TYPES.REQUEST, title: 'Quotation request cancelled',
      body: `Customer: ${request.customer_name} — Request: ${request.request_number} was cancelled.`,
      link: '#/sales-flow/requests', customerId, customerName: request.customer_name,
    });

    emitEntityChange('admin', { customerId, docType: 'request', docId: id, status: REQUEST_STATUS.CANCELLED });
    return { id, status: REQUEST_STATUS.CANCELLED };
  },

  // ─── Admin: review requests ────────────────────────────────────────────────
  async adminListRequests({ status } = {}) {
    return this.getRequests({ status });
  },

  async adminGetRequest(id) {
    return this.getRequestById(id, {});
  },

  async updateRequest(id, { admin, items, notes, context = {} }) {
    const request = await this.adminGetRequest(id);
    if (!request) throw new Error('Request not found');
    if ([REQUEST_STATUS.READY_FOR_CONVERSION, REQUEST_STATUS.CONVERTED, REQUEST_STATUS.REJECTED, REQUEST_STATUS.CANCELLED].includes(request.status)) {
      throw new Error('Request can no longer be edited');
    }

    const normalized = items ? normalizeItems(items) : request.items;
    if (normalized.length === 0) throw new Error('At least one line item is required');
    const { subtotal } = computeTotals(normalized);

    const nextStatus = request.status === REQUEST_STATUS.SUBMITTED
      ? REQUEST_STATUS.UNDER_REVIEW
      : request.status === REQUEST_STATUS.WAITING_FOR_CUSTOMER
        ? REQUEST_STATUS.UNDER_REVIEW
        : request.status;
    await runQuery(
      `UPDATE quotation_requests SET items = ?, subtotal = ?, notes = ?, status = ?, reviewed_by = ?, reviewed_at = ?, updated_at = ?
       WHERE id = ?`,
      [JSON.stringify(normalized), subtotal, notes !== undefined ? notes : request.notes,
        nextStatus, admin.id, nowIso(), nowIso(), id]
    );

    if (nextStatus === REQUEST_STATUS.UNDER_REVIEW && request.status === REQUEST_STATUS.SUBMITTED) {
      await addTimeline( request.customer_id, 'request', id, EVENT_TYPES.REQUEST_REVIEWED,
        'Under review', `${admin.name || 'Sales'} started reviewing ${request.request_number}.`,
        { type: 'admin', id: admin.id, name: admin.name || 'Sales' });
      await logAudit({
        actor: { id: admin.id, name: admin.name || 'Sales', role: admin.role || 'admin' }, action: 'PORTAL_REQUEST_REVIEW_START', entityType: 'quotation_request', entityId: id,
        details: `${request.request_number} moved to under review`, context,
      });
    } else {
      await logAudit({
        actor: { id: admin.id, name: admin.name || 'Sales', role: admin.role || 'admin' }, action: 'PORTAL_REQUEST_EDIT', entityType: 'quotation_request', entityId: id,
        details: `${request.request_number} line items updated by sales`,
        oldValue: { items: request.items, subtotal: request.subtotal },
        newValue: { items: normalized, subtotal }, context,
      });
    }

    emitEntityChange('admin', { customerId: request.customer_id, docType: 'request', docId: id, status: nextStatus });
    return this.adminGetRequest(id);
  },

  async rejectRequest(id, { admin, reason, context = {} }) {
    const request = await this.adminGetRequest(id);
    if (!request) throw new Error('Request not found');
    assertRequestTransition(request, REQUEST_STATUS.REJECTED);

    await runQuery(
      `UPDATE quotation_requests SET status = ?, review_note = ?, reviewed_by = ?, reviewed_at = ?, updated_at = ?
       WHERE id = ?`,
      [REQUEST_STATUS.REJECTED, reason || null, admin.id, nowIso(), nowIso(), id]
    );

    await addTimeline( request.customer_id, 'request', id, EVENT_TYPES.REQUEST_REJECTED,
      'Request rejected', `${admin.name || 'Sales'} rejected ${request.request_number}.`,
      { type: 'admin', id: admin.id, name: admin.name || 'Sales' },
      { reason: reason || '' });

    await logAudit({
      actor: { id: admin.id, name: admin.name || 'Sales', role: admin.role || 'admin' }, action: 'PORTAL_REQUEST_REJECT', entityType: 'quotation_request', entityId: id,
      details: `${request.request_number} rejected${reason ? `: ${reason}` : ''}`,
      oldValue: { status: request.status }, newValue: { status: REQUEST_STATUS.REJECTED, reason }, context,
    });

    await notifyCustomer({ customerId: request.customer_id, type: NOTIFICATION_TYPES.REQUEST,
      title: 'Your request was not approved',
      body: `${request.request_number} — ${reason || 'Please contact our sales team for more information.'}`,
      link: '#/portal/requests',
      actorName: admin.name || 'Sales',
    });

    emitEntityChange('portal', { customerId: request.customer_id, docType: 'request', docId: id, status: REQUEST_STATUS.REJECTED });
    return { id, status: REQUEST_STATUS.REJECTED };
  },

  async requestClarification(id, { admin, note, context = {} }) {
    const request = await this.adminGetRequest(id);
    if (!request) throw new Error('Request not found');
    if ([REQUEST_STATUS.READY_FOR_CONVERSION, REQUEST_STATUS.CONVERTED, REQUEST_STATUS.REJECTED, REQUEST_STATUS.CANCELLED].includes(request.status)) {
      throw new Error('Request can no longer be updated');
    }

    await runQuery(
      `UPDATE quotation_requests SET review_note = ?, reviewed_by = ?, reviewed_at = ?, status = ?, updated_at = ?
       WHERE id = ?`,
      [note || null, admin.id, nowIso(), REQUEST_STATUS.WAITING_FOR_CUSTOMER, nowIso(), id]
    );

    await addTimeline( request.customer_id, 'request', id, EVENT_TYPES.REQUEST_CLARIFICATION,
      'Clarification requested', `${admin.name || 'Sales'} asked for clarification on ${request.request_number}.`,
      { type: 'admin', id: admin.id, name: admin.name || 'Sales' },
      { note: note || '', status: REQUEST_STATUS.WAITING_FOR_CUSTOMER });

    await logAudit({
      actor: { id: admin.id, name: admin.name || 'Sales', role: admin.role || 'admin' }, action: 'PORTAL_REQUEST_CLARIFY', entityType: 'quotation_request', entityId: id,
      details: `Clarification requested for ${request.request_number}`,
      oldValue: { status: request.status }, newValue: { status: REQUEST_STATUS.WAITING_FOR_CUSTOMER, note }, context,
    });

    await notifyCustomer({ customerId: request.customer_id, type: NOTIFICATION_TYPES.REQUEST,
      title: 'We need more information',
      body: `Regarding ${request.request_number} — ${note || 'Please review your request and contact us.'}`,
      link: '#/portal/requests',
      actorName: admin.name || 'Sales',
    });

    emitEntityChange('portal', { customerId: request.customer_id, docType: 'request', docId: id, status: REQUEST_STATUS.WAITING_FOR_CUSTOMER });
    return { id, status: REQUEST_STATUS.WAITING_FOR_CUSTOMER };
  },

  // ─── Admin: assign salesperson ──────────────────────────────────────────────
  async assignRequest(id, { admin, assignTo, assignToName, context = {} }) {
    const request = await this.adminGetRequest(id);
    if (!request) throw new Error('Request not found');
    if ([REQUEST_STATUS.CONVERTED, REQUEST_STATUS.REJECTED, REQUEST_STATUS.CANCELLED].includes(request.status)) {
      throw new Error('Request is closed and cannot be assigned');
    }

    const nextStatus = request.status === REQUEST_STATUS.SUBMITTED
      ? REQUEST_STATUS.ASSIGNED
      : request.status;

    await runQuery(
      `UPDATE quotation_requests SET assigned_to = ?, assigned_by = ?, assigned_at = ?, status = ?, updated_at = ?
       WHERE id = ?`,
      [assignTo || null, admin.id || null, nowIso(), nextStatus, nowIso(), id]
    );

    await addTimeline( request.customer_id, 'request', id, EVENT_TYPES.REQUEST_ASSIGNED,
      'Sales assigned', `${assignToName || assignTo || 'Sales'} was assigned to ${request.request_number}.`,
      { type: 'admin', id: admin.id, name: admin.name || 'Sales' },
      { assignTo: assignTo || null, assignToName: assignToName || null });

    await logAudit({
      actor: { id: admin.id, name: admin.name || 'Sales', role: admin.role || 'admin' }, action: 'PORTAL_REQUEST_ASSIGN', entityType: 'quotation_request', entityId: id,
      details: `${request.request_number} assigned to ${assignToName || assignTo || 'unassigned'}`,
      oldValue: { assignedTo: request.assigned_to }, newValue: { assignedTo: assignTo || null }, context,
    });

    emitEntityChange('admin', { customerId: request.customer_id, docType: 'request', docId: id, status: nextStatus });
    return this.adminGetRequest(id);
  },

  // ─── Admin: mark/unmark a request for follow-up ───────────────────
  async markRequest(id, { admin, context = {} }) {
    const request = await this.adminGetRequest(id);
    if (!request) throw new Error('Request not found');
    if (request.deleted_at) throw new Error('Request has been deleted');

    const newMarked = request.marked ? 0 : 1;
    await runQuery(
      `UPDATE quotation_requests SET marked = ?, updated_at = ? WHERE id = ?`,
      [newMarked, nowIso(), id]
    );

    await addTimeline( request.customer_id, 'request', id, newMarked ? EVENT_TYPES.REQUEST_MARKED : EVENT_TYPES.REQUEST_UNMARKED,
      newMarked ? 'Request marked' : 'Request unmarked',
      `${admin.name || 'Sales'} ${newMarked ? 'marked' : 'unmarked'} ${request.request_number}.`,
      { type: 'admin', id: admin.id, name: admin.name || 'Sales' },
      { marked: newMarked });

    await logAudit({
      actor: { id: admin.id, name: admin.name || 'Sales', role: admin.role || 'admin' }, action: newMarked ? 'PORTAL_REQUEST_MARK' : 'PORTAL_REQUEST_UNMARK', entityType: 'quotation_request', entityId: id,
      details: `${request.request_number} ${newMarked ? 'marked' : 'unmarked'} by sales`,
      oldValue: { marked: request.marked }, newValue: { marked: newMarked }, context,
    });

    emitEntityChange('admin', { customerId: request.customer_id, docType: 'request', docId: id, marked: newMarked });
    return this.adminGetRequest(id);
  },

  // ─── Admin: delete (clear) a request ──────────────────────────────
  async deleteRequest(id, { admin, context = {} }) {
    const request = await this.adminGetRequest(id);
    if (!request) throw new Error('Request not found');
    if (request.deleted_at) throw new Error('Request is already deleted');
    if (request.status === REQUEST_STATUS.CONVERTED && request.quotation_id) {
      throw new Error('Cannot delete a request that has been converted to a quotation');
    }

    const now = nowIso();
    await runQuery(
      `UPDATE quotation_requests SET status = ?, deleted_at = ?, updated_at = ? WHERE id = ?`,
      [REQUEST_STATUS.CANCELLED, now, now, id]
    );

    await addTimeline( request.customer_id, 'request', id, EVENT_TYPES.REQUEST_DELETED,
      'Request deleted', `${admin.name || 'Sales'} deleted ${request.request_number}.`,
      { type: 'admin', id: admin.id, name: admin.name || 'Sales' },
      { deletedAt: now });

    await logAudit({
      actor: { id: admin.id, name: admin.name || 'Sales', role: admin.role || 'admin' }, action: 'PORTAL_REQUEST_DELETE', entityType: 'quotation_request', entityId: id,
      details: `${request.request_number} deleted by sales`,
      oldValue: { status: request.status, deleted_at: null }, newValue: { status: REQUEST_STATUS.CANCELLED, deleted_at: now }, context,
    });

    emitEntityChange('admin', { customerId: request.customer_id, docType: 'request', docId: id, status: REQUEST_STATUS.CANCELLED, deleted: true });
    return { id, status: REQUEST_STATUS.CANCELLED, deleted: true };
  },

  // ─── Admin: sales opened the request (audit + timeline only) ───────────────
  async markRequestOpened(id, { admin, context = {} }) {
    const request = await this.adminGetRequest(id);
    if (!request) throw new Error('Request not found');

    await addTimeline( request.customer_id, 'request', id, EVENT_TYPES.REQUEST_OPENED,
      'Sales opened request', `${admin.name || 'Sales'} opened ${request.request_number}.`,
      { type: 'admin', id: admin.id, name: admin.name || 'Sales' });

    await logAudit({
      actor: { id: admin.id, name: admin.name || 'Sales', role: admin.role || 'admin' }, action: 'PORTAL_REQUEST_OPEN', entityType: 'quotation_request', entityId: id,
      details: `${request.request_number} opened by sales`, context,
    });
    return { id, status: request.status };
  },

  // ─── Admin: start quotation generation ─────────────────────────────────────
  // Per business rules, clicking "Generate Quotation" does NOT create a
  // quotation and does NOT reserve a quotation number. It records the event,
  // moves the request to "Ready for Conversion" and returns a prefill payload
  // for the STANDARD ERP quotation editor.
  async startQuotationGeneration(requestId, { admin, context = {} }) {
    const request = await this.adminGetRequest(requestId);
    if (!request) throw new Error('Request not found');
    if ([REQUEST_STATUS.REJECTED, REQUEST_STATUS.CANCELLED].includes(request.status)) {
      throw new Error('Request is closed and cannot be converted');
    }
    if (request.quotation_id) throw new Error('A quotation has already been generated for this request');

    await runQuery(
      `UPDATE quotation_requests SET status = ?, reviewed_by = ?, reviewed_at = ?, updated_at = ?
       WHERE id = ?`,
      [REQUEST_STATUS.READY_FOR_CONVERSION, admin.id, nowIso(), nowIso(), requestId]
    );

    await addTimeline( request.customer_id, 'request', requestId, EVENT_TYPES.QUOTATION_GENERATION_STARTED,
      'Quotation generation started', `${admin.name || 'Sales'} opened the quotation editor from ${request.request_number}.`,
      { type: 'admin', id: admin.id, name: admin.name || 'Sales' },
      { status: REQUEST_STATUS.READY_FOR_CONVERSION });

    await logAudit({
      actor: { id: admin.id, name: admin.name || 'Sales', role: admin.role || 'admin' }, action: 'QUOTATION_GENERATION_START', entityType: 'quotation_request', entityId: requestId,
      details: `Quotation generation started from ${request.request_number}`,
      oldValue: { status: request.status }, newValue: { status: REQUEST_STATUS.READY_FOR_CONVERSION }, context,
    });

    emitEntityChange('admin', { customerId: request.customer_id, docType: 'request', docId: requestId, status: REQUEST_STATUS.READY_FOR_CONVERSION });

    // Prefill payload for the ERP quotation editor. No quotation exists yet.
    const customer = await getOne(
      `SELECT id, name, email, phone, address, city,
              segment, balance
         FROM customers WHERE id = ?`,
      [request.customer_id]
    );

    return {
      id: request.id,
      requestNumber: request.request_number,
      requestType: request.request_type,
      customer_id: request.customer_id,
      customer_name: request.customer_name,
      items: request.items,
      subtotal: request.subtotal,
      discountTotal: Number(request.discount_total ?? request.discountTotal ?? 0) || 0,
      total: Number(request.total ?? 0) || round2((Number(request.subtotal) || 0) - (Number(request.discount_total ?? request.discountTotal) || 0)),
      promotion: request.promotion || null,
      promotionApplied: !!request.promotion,
      notes: request.notes,
      requestedDeliveryDate: request.requested_delivery_date || null,
      attachments: request.attachments || [],
      status: REQUEST_STATUS.READY_FOR_CONVERSION,
      assignedTo: request.assigned_to || null,
      customer: customer ? {
        name: customer.name,
        email: customer.email,
        phone: customer.phone,
        address: customer.address,
        billingAddress: customer.billingAddress || customer.address || '',
        shippingAddress: customer.shippingAddress || customer.billingAddress || customer.address || '',
        city: customer.city,
        segment: customer.segment,
        paymentTerms: customer.paymentTerms || 'Net 7',
        currency: customer.currency || 'MWK',
      } : null,
    };
  },

  // ─── Admin: complete the conversion after the ERP quotation is saved ───────
  // Called by the ERP quotation editor after the official quotation has been
  // saved with its number. This is the ONLY place a request becomes "converted":
  //  1. Creates the backend quotation record mirroring the ERP quotation
  //  2. Links the request ↔ quotation (permanent bidirectional reference)
  //  3. Records audit + timeline events
  //  4. Notifies the customer
  async completeQuotation(requestId, { admin, quotationNumber, erpQuotationId, quotationSnapshot = {}, context = {} }) {
    const request = await this.adminGetRequest(requestId);
    if (!request) throw new Error('Request not found');
    if ([REQUEST_STATUS.REJECTED, REQUEST_STATUS.CANCELLED].includes(request.status)) {
      throw new Error('Request is closed and cannot be converted');
    }
    if (request.quotation_id) throw new Error('A quotation has already been linked to this request');

    const snapshotItems = Array.isArray(quotationSnapshot.items) ? quotationSnapshot.items : request.items;
    const normalizedItems = normalizeItems(snapshotItems);
    if (normalizedItems.length === 0) throw new Error('At least one line item is required');

    // Promotion carry-through: the ERP quotation keeps the discount granted at
    // the point of sale. Sales may override it, but it is never silently lost.
    const requestPromotion = request.promotion || null;
    const promotion = quotationSnapshot.promotion || requestPromotion || null;
    const snapshotProvidedDiscount = quotationSnapshot.discountAmount !== undefined || quotationSnapshot.discount !== undefined;
    let discount = round2(Number(quotationSnapshot.discountAmount ?? quotationSnapshot.discount) || 0);
    if (!snapshotProvidedDiscount && requestPromotion && request.discount_total) {
      discount = round2(Number(request.discount_total) || 0);
    }
    const taxRate = Number(quotationSnapshot.taxRate ?? quotationSnapshot.tax_rate) || 0;
    const deliveryFee = round2(Number(quotationSnapshot.otherCharges ?? quotationSnapshot.deliveryFee ?? quotationSnapshot.delivery_fee) || 0);
    const { subtotal, taxAmount, total } = computeTotals(normalizedItems, discount, taxRate, deliveryFee);

    const id = genId('qt');
    const now = nowIso();
    // Official quotation number comes from the ERP editor when available;
    // otherwise the backend generates one so the chain never dead-ends.
    const number = quotationNumber || await workflowEngine.nextYearScopedNumber('quotations', 'quotation_number', 'QT');

    await runQuery('BEGIN TRANSACTION');
    try {
      await runQuery(
        `INSERT INTO quotations
           (id, quotation_number, request_id, customer_id, customer_name, items,
            subtotal, discount, tax_rate, tax_amount, delivery_fee, total, currency,
            payment_terms, valid_until, status, created_by, source_request_number, erp_quotation_id,
            promotion, discount_total, promotion_applied)
         VALUES (?, ?, ?, ?, ? , ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, number, requestId, request.customer_id, request.customer_name, JSON.stringify(normalizedItems), subtotal, discount, taxRate, taxAmount, deliveryFee, total, quotationSnapshot.currency || 'MWK', quotationSnapshot.paymentTerms || 'Net 7', quotationSnapshot.validUntil || null, QUOTATION_STATUS.READY, admin.id, request.request_number, erpQuotationId || null, promotion ? JSON.stringify(promotion) : null, discount, promotion ? 1 : 0]
      );

      await runQuery(
        `UPDATE quotation_requests SET status = ?, quotation_id = ?, quotation_number = ?,
           converted_at = ?, converted_by = ?, reviewed_by = ?, reviewed_at = ?, updated_at = ?
         WHERE id = ?`,
        [REQUEST_STATUS.CONVERTED, id, number, now, admin.id, admin.id, now, now, requestId]
      );

      await addTimeline( request.customer_id, 'request', requestId, EVENT_TYPES.QUOTATION_SAVED,
        'Quotation saved', `${number} was saved for ${request.request_number}.`,
        { type: 'admin', id: admin.id, name: admin.name || 'Sales' },
        { quotationNumber: number, total });

      await workflowEngine.createVersionSnapshot({
        customerId: request.customer_id,
        docType: 'quotation',
        docId: id,
        version: 1,
        snapshot: {
          items: normalizedItems,
          subtotal, discount, taxRate, taxAmount, deliveryFee, total,
          currency: quotationSnapshot.currency || 'MWK',
          paymentTerms: quotationSnapshot.paymentTerms || 'Net 7',
          validUntil: quotationSnapshot.validUntil || null,
          status: QUOTATION_STATUS.READY,
          promotion,
        },
        reason: 'Original',
        actor: { id: admin.id, name: admin.name || 'Sales' },
      });

      await addTimeline( request.customer_id, 'request', requestId, EVENT_TYPES.QUOTATION_NUMBER_ASSIGNED,
        'Quotation number assigned', `${number} was assigned to ${request.request_number}.`,
        { type: 'system' }, { quotationNumber: number });

      await addTimeline( request.customer_id, 'quotation', id, EVENT_TYPES.QUOTATION_GENERATED,
        'Quotation ready', `Official quotation ${number} is ready for review.`,
        { type: 'system' }, { total, sourceRequest: request.request_number });

      await logAudit({
        actor: { id: admin.id, name: admin.name || 'Sales', role: admin.role || 'admin' }, action: 'QUOTATION_SAVED', entityType: 'quotation', entityId: id,
        details: `${number} created from request ${request.request_number}`,
        oldValue: { status: request.status },
        newValue: { status: REQUEST_STATUS.CONVERTED, quotationNumber: number, items: normalizedItems, subtotal, taxAmount, total }, context,
      });

      await notifyCustomer({ customerId: request.customer_id, type: NOTIFICATION_TYPES.QUOTATION,
        title: `Your quotation ${number} is ready`,
        body: `Your official quotation (from request ${request.request_number}) is available for review.`,
        link: `#/portal/quotations/${id}`,
        actorName: admin.name || 'Sales',
      });
      const portalUsers = await getAll(
        'SELECT id, email FROM portal_users WHERE customer_id = ? AND status = ?',
        [request.customer_id, 'active']
      );
      for (const user of portalUsers) {
        await sendEmailBestEffort({
          to: user.email,
          subject: `Your quotation ${number} is ready for review`,
          text: `Dear ${request.customer_name},\n\nYour official quotation ${number} (total ${total}) prepared from request ${request.request_number} is ready.\nSign in to the customer portal to preview, download or respond.\n\nPrime ERP`,
        });
      }

      await runQuery('COMMIT');
    } catch (err) {
      await runQuery('ROLLBACK');
      throw err;
    }

    emitEntityChange('portal', { customerId: request.customer_id, docType: 'quotation', docId: id, status: QUOTATION_STATUS.READY, quotationNumber: number });
    emitEntityChange('portal', { customerId: request.customer_id, docType: 'request', docId: requestId, status: REQUEST_STATUS.CONVERTED, quotationNumber: number });
    emitEntityChange('admin', { customerId: request.customer_id, docType: 'quotation', docId: id, status: QUOTATION_STATUS.READY, quotationNumber: number });
    emitEntityChange('admin', { customerId: request.customer_id, docType: 'request', docId: requestId, status: REQUEST_STATUS.CONVERTED, quotationNumber: number });

    return this.getQuotationById(id, {});
  },

  // ─── Admin: start official sales order generation ──────────────────────────
  // Mirrors startQuotationGeneration: does NOT create an order and does NOT
  // reserve an order number. Records the event, moves the order request to
  // "Ready for Conversion" and returns a prefill payload for the STANDARD ERP
  // sales order editor.
  async startOrderGeneration(requestId, { admin, context = {} }) {
    const request = await this.adminGetRequest(requestId);
    if (!request) throw new Error('Request not found');
    if (request.request_type !== 'order') throw new Error('Only order requests generate official sales orders');
    if ([REQUEST_STATUS.REJECTED, REQUEST_STATUS.CANCELLED].includes(request.status)) {
      throw new Error('Request is closed and cannot be converted');
    }
    if (request.sales_order_id) throw new Error('A sales order has already been generated for this request');

    await runQuery(
      `UPDATE quotation_requests SET status = ?, reviewed_by = ?, reviewed_at = ?, updated_at = ?
       WHERE id = ?`,
      [REQUEST_STATUS.READY_FOR_CONVERSION, admin.id, nowIso(), nowIso(), requestId]
    );

    await addTimeline( request.customer_id, 'request', requestId, EVENT_TYPES.ORDER_GENERATION_STARTED,
      'Sales order generation started', `${admin.name || 'Sales'} opened the sales order editor from ${request.request_number}.`,
      { type: 'admin', id: admin.id, name: admin.name || 'Sales' },
      { status: REQUEST_STATUS.READY_FOR_CONVERSION });

    await logAudit({
      actor: { id: admin.id, name: admin.name || 'Sales', role: admin.role || 'admin' }, action: 'SALES_ORDER_GENERATION_START', entityType: 'quotation_request', entityId: requestId,
      details: `Sales order generation started from ${request.request_number}`,
      oldValue: { status: request.status }, newValue: { status: REQUEST_STATUS.READY_FOR_CONVERSION }, context,
    });

    emitEntityChange('admin', { customerId: request.customer_id, docType: 'request', docId: requestId, status: REQUEST_STATUS.READY_FOR_CONVERSION });

    const customer = await getOne(
      `SELECT id, name, email, phone, address, city,
              segment, balance
         FROM customers WHERE id = ?`,
      [request.customer_id]
    );

    return {
      id: request.id,
      requestNumber: request.request_number,
      requestType: request.request_type,
      customer_id: request.customer_id,
      customer_name: request.customer_name,
      items: request.items,
      subtotal: request.subtotal,
      discountTotal: Number(request.discount_total ?? request.discountTotal ?? 0) || 0,
      total: Number(request.total ?? 0) || round2((Number(request.subtotal) || 0) - (Number(request.discount_total ?? request.discountTotal) || 0)),
      promotion: request.promotion || null,
      promotionApplied: !!request.promotion,
      notes: request.notes,
      deliveryDate: request.requested_delivery_date || null,
      reorderOf: request.reorder_of || null,
      reorderOfNumber: request.reorder_of_number || null,
      attachments: request.attachments || [],
      status: REQUEST_STATUS.READY_FOR_CONVERSION,
      assignedTo: request.assigned_to || null,
      customer: customer ? {
        name: customer.name,
        email: customer.email,
        phone: customer.phone,
        address: customer.address,
        billingAddress: customer.billingAddress || customer.address || '',
        shippingAddress: customer.shippingAddress || customer.billingAddress || customer.address || '',
        city: customer.city,
        segment: customer.segment,
        paymentTerms: customer.paymentTerms || 'Net 7',
        currency: customer.currency || 'MWK',
      } : null,
    };
  },

  // ─── Admin: complete the conversion after the ERP sales order is saved ─────
  // Mirrors completeQuotation. Called by the ERP sales order editor after the
  // official sales order has been saved. This is the ONLY place an order
  // request becomes "converted":
  //  1. Creates the official sales order record (SO-YYYY-######, Confirmed)
  //  2. Links the request ↔ order (permanent bidirectional reference)
  //  3. Records audit + timeline events
  //  4. Notifies the customer
  async completeSalesOrder(requestId, { admin, erpOrderId, orderSnapshot = {}, context = {} }) {
    const request = await this.adminGetRequest(requestId);
    if (!request) throw new Error('Request not found');
    if (request.request_type !== 'order') throw new Error('Only order requests generate official sales orders');
    if ([REQUEST_STATUS.REJECTED, REQUEST_STATUS.CANCELLED].includes(request.status)) {
      throw new Error('Request is closed and cannot be converted');
    }
    if (request.sales_order_id) throw new Error('A sales order has already been generated for this request');

    const snapshotItems = Array.isArray(orderSnapshot.items) ? orderSnapshot.items : request.items;
    const normalizedItems = normalizeItems(snapshotItems);
    if (normalizedItems.length === 0) throw new Error('At least one line item is required');

    // Promotion carry-through: the sales order preserves the discount granted
    // at the point of sale (immutable unless legitimately edited).
    const requestPromotion = request.promotion || null;
    const promotion = orderSnapshot.promotion || requestPromotion || null;
    const snapshotProvidedDiscount = orderSnapshot.discountAmount !== undefined || orderSnapshot.discount !== undefined;
    let discount = round2(Number(orderSnapshot.discountAmount ?? orderSnapshot.discount) || 0);
    if (!snapshotProvidedDiscount && requestPromotion && request.discount_total) {
      discount = round2(Number(request.discount_total) || 0);
    }
    const taxRate = Number(orderSnapshot.taxRate ?? orderSnapshot.tax_rate) || 0;
    const otherCharges = round2(Number(orderSnapshot.otherCharges ?? orderSnapshot.deliveryFee ?? orderSnapshot.delivery_fee) || 0);
    const { subtotal, taxAmount, total } = computeTotals(normalizedItems, discount, taxRate, otherCharges);
    const deliveryDate = orderSnapshot.deliveryDate || orderSnapshot.delivery_date || request.requested_delivery_date || null;

    // When the ERP editor already wrote a row for this order (offline-first:
    // it lands in IndexedDB and syncs to the cloud under its own id), the
    // backend ADOPTS that row instead of creating a duplicate. The official
    // number + request linkage are merged into the existing record so the ERP
    // list, the portal and the document chain all reference ONE order. Without
    // an erpOrderId a fresh canonical record is created as before.
    const orderId = erpOrderId || genId('so');
    const orderNumber = await workflowEngine.nextYearScopedNumber('sales_orders', 'order_number', 'SO');
    const itemsJson = JSON.stringify(
      normalizedItems.map((item) => ({
        id: item.productId || genId('itm'),
        productId: item.productId || null,
        description: item.name,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        lineTotal: item.lineTotal,
        originalUnitPrice: item.originalUnitPrice !== undefined ? item.originalUnitPrice : item.unitPrice,
        discountPercent: item.discountPercent !== undefined ? item.discountPercent : 0,
        discountAmount: item.discountAmount !== undefined ? item.discountAmount : 0,
        netUnitPrice: item.netUnitPrice !== undefined ? item.netUnitPrice : item.unitPrice,
        promotionId: item.promotionId || null,
        promotionCode: item.promotionCode || null,
      }))
    );
    const now = nowIso();

    await runQuery('BEGIN TRANSACTION');
    try {
      // Merge with the cloud row when the ERP record already exists so the
      // version-aware cloud write gate is satisfied (repo.upsert bumps the
      // version read from the existing row).
      const erpExisting = erpOrderId ? await repo.getById('sales_orders', erpOrderId) : null;
      const orderRecord = {
        ...(erpExisting || {}),
        id: orderId,
        order_number: orderNumber,
        source_request_id: requestId,
        source_request_number: request.request_number,
        reorder_of: request.reorder_of || null,
        reorder_of_number: request.reorder_of_number || null,
        // Dual key spelling: the ERP frontend store writes `customerId`, the
        // backend shim writes `customer_id`. Writing BOTH guarantees the order
        // is found by the admin list AND by the portal's customer scope.
        customer_id: request.customer_id,
        customerId: request.customer_id,
        customer_name: request.customer_name || orderSnapshot.customerName || null,
        orderDate: (erpExisting && erpExisting.orderDate) || now,
        deliveryDate,
        status: workflowEngine.SALES_ORDER_STATUS.CONFIRMED,
        items: itemsJson,
        subtotal,
        discounts: discount,
        tax: taxAmount,
        other_charges: otherCharges,
        total,
        notes: orderSnapshot.notes || request.notes || `Generated from ${request.request_number}`,
        approved_by: admin.id,
        approved_at: now,
        erp_order_id: erpOrderId || null,
        created_by: admin.id,
        created_at: now,
        updated_at: now,
        promotion: promotion ? JSON.stringify(promotion) : null,
        discount_total: discount,
        promotion_applied: promotion ? 1 : 0,
        subtotal_before_discount: subtotal,
        version: erpExisting ? erpExisting.version : undefined,
      };
      const savedOrder = await repo.upsert('sales_orders', orderRecord);
      if (!savedOrder || !savedOrder.id) {
        throw new Error('Failed to persist the official sales order');
      }

      await runQuery(
        `UPDATE quotation_requests SET status = ?, sales_order_id = ?, sales_order_number = ?,
           converted_at = ?, converted_by = ?, reviewed_by = ?, reviewed_at = ?, updated_at = ?
         WHERE id = ?`,
        [REQUEST_STATUS.CONVERTED, orderId, orderNumber, now, admin.id, admin.id, now, now, requestId]
      );

      await addTimeline( request.customer_id, 'request', requestId, EVENT_TYPES.ORDER_GENERATED,
        'Sales order generated', `${orderNumber} was generated from ${request.request_number}.`,
        { type: 'admin', id: admin.id, name: admin.name || 'Sales' },
        { orderNumber, total });

      await addTimeline( request.customer_id, 'order', orderId, EVENT_TYPES.ORDER_GENERATED,
        'Order confirmed', `Official sales order ${orderNumber} is confirmed.`,
        { type: 'system' }, { total, sourceRequest: request.request_number });

      await logAudit({
        actor: { id: admin.id, name: admin.name || 'Sales', role: admin.role || 'admin' }, action: 'SALES_ORDER_GENERATED', entityType: 'sales_order', entityId: orderId,
        details: `${orderNumber} created from request ${request.request_number}`,
        oldValue: { status: request.status },
        newValue: { status: REQUEST_STATUS.CONVERTED, orderNumber, items: normalizedItems, subtotal, taxAmount, total }, context,
      });

      await notifyCustomer({ customerId: request.customer_id, type: NOTIFICATION_TYPES.ORDER,
        title: `Your order ${orderNumber} is confirmed`,
        body: `Your order request ${request.request_number} has been confirmed as official order ${orderNumber}.`,
        link: `#/portal/orders/${orderId}`,
        actorName: admin.name || 'Sales',
      });
      const portalUsers = await getAll(
        'SELECT id, email FROM portal_users WHERE customer_id = ? AND status = ?',
        [request.customer_id, 'active']
      );
      for (const user of portalUsers) {
        await sendEmailBestEffort({
          to: user.email,
          subject: `Your order ${orderNumber} is confirmed`,
          text: `Dear ${request.customer_name},\n\nYour order ${orderNumber} (total ${total}) prepared from request ${request.request_number} is confirmed.\nTrack it from the customer portal.\n\nPrime ERP`,
        });
      }

      await runQuery('COMMIT');
    } catch (err) {
      await runQuery('ROLLBACK');
      throw err;
    }

    emitEntityChange('portal', { customerId: request.customer_id, docType: 'order', docId: orderId, status: workflowEngine.SALES_ORDER_STATUS.CONFIRMED, orderNumber });
    emitEntityChange('portal', { customerId: request.customer_id, docType: 'request', docId: requestId, status: REQUEST_STATUS.CONVERTED, orderNumber });
    emitEntityChange('admin', { customerId: request.customer_id, docType: 'order', docId: orderId, status: workflowEngine.SALES_ORDER_STATUS.CONFIRMED, orderNumber });
    emitEntityChange('admin', { customerId: request.customer_id, docType: 'request', docId: requestId, status: REQUEST_STATUS.CONVERTED, orderNumber });

    return { id: orderId, orderNumber, status: workflowEngine.SALES_ORDER_STATUS.CONFIRMED };
  },

  // ─── Customer: reorder an official sales order ─────────────────────────────
  // A reorder NEVER copies the official order — it creates a brand-new order
  // request (ODR-YYYY-######) referencing the original order, so the request
  // goes through the full sales review pipeline again.
  async reorderFromOrder(orderId, { portalUserId, customerId, context = {} }) {
    const order = await getOne(
      'SELECT * FROM sales_orders WHERE id = ? AND customer_id = ?',
      [orderId, customerId]
    );
    if (!order) throw new Error('Order not found');
    if ([workflowEngine.SALES_ORDER_STATUS.DRAFT, workflowEngine.SALES_ORDER_STATUS.CANCELLED].includes(String(order.status || ''))) {
      throw new Error('This order cannot be reordered');
    }
    const orderNumber = order.order_number || order.id;
    let items = workflowEngine.parseOrderItems(order.items);
    if (items.length === 0) throw new Error('This order has no line items to reorder');
    // A reorder is a NEW request: it must not carry the previous promotion's
    // line metadata. The engine re-evaluates current promotions at submit time.
    items = items.map(stripPromotionLineFields);

    const customer = await getOne('SELECT name FROM customers WHERE id = ?', [customerId]);
    const customerName = (customer && customer.name) || 'Customer';

    const id = genId('req');
    const requestNumber = await workflowEngine.nextYearScopedNumber('quotation_requests', 'request_number', 'ODR');
    const { subtotal } = computeTotals(items);

    await runQuery(
      `INSERT INTO quotation_requests
         (id, request_number, customer_id, customer_name, request_type, items, subtotal,
          notes, status, requested_delivery_date, reorder_of, reorder_of_number, created_by)
       VALUES (?, ?, ?, ? , ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, requestNumber, customerId, customerName, 'order', JSON.stringify(items), subtotal, `Reorder of ${orderNumber}`, REQUEST_STATUS.SUBMITTED, order.deliveryDate || null, orderId, orderNumber, portalUserId]
    );

    await addTimeline( customerId, 'request', id, EVENT_TYPES.REQUEST_REORDERED,
      'Reorder requested', `${customerName} reordered ${orderNumber} as ${requestNumber}.`,
      { type: 'customer', id: portalUserId, name: customerName },
      { reorderOf: orderId, reorderOfNumber: orderNumber, itemCount: items.length, subtotal });

    await logAudit({
      actor: { id: portalUserId, name: customerName, role: 'portal_customer' }, action: 'PORTAL_REQUEST_REORDER', entityType: 'quotation_request', entityId: id,
      details: `${requestNumber} created as reorder of ${orderNumber}`,
      newValue: { requestNumber, reorderOf: orderId, reorderOfNumber: orderNumber, items, subtotal }, context,
    });

    await notifyAdmin({ type: NOTIFICATION_TYPES.REQUEST, title: 'New order request (reorder)',
      body: `Customer: ${customerName} — Request: ${requestNumber} — Reorder of ${orderNumber}.`,
      link: '#/sales-flow/requests', customerId, customerName,
    });

    emitEntityChange('portal', { customerId, docType: 'request', docId: id, status: REQUEST_STATUS.SUBMITTED, requestNumber });
    emitEntityChange('admin', { customerId, docType: 'request', docId: id, status: REQUEST_STATUS.SUBMITTED, requestNumber, reorderOfNumber: orderNumber });

    return { id, requestNumber, status: REQUEST_STATUS.SUBMITTED, reorderOf: orderId, reorderOfNumber: orderNumber };
  },

  // ─── Document chain navigation ─────────────────────────────────────────────
  async getDocumentChain({ docType, docId, customerId } = {}) {
    return workflowEngine.getDocumentChain({ docType, docId, customerId });
  },

  // ─── Quotation reads ───────────────────────────────────────────────────────
  async getQuotations({ customerId, status } = {}) {
    let query = `
      SELECT q.*, c.name AS resolved_customer_name
      FROM quotations q
      LEFT JOIN customers c ON c.id = q.customer_id
      WHERE 1=1`;
    const params = [];
    if (customerId) { query += ' AND q.customer_id = ?'; params.push(customerId); }
    
    if (status) { query += ' AND q.status = ?'; params.push(status); }
    query += ' ORDER BY q.created_at DESC';
    const rows = await getAll(query, params);
    const openRows = rows.filter((r) =>
      [QUOTATION_STATUS.READY, QUOTATION_STATUS.REVISION_REQUESTED].includes(r.status) &&
      r.valid_until && new Date(r.valid_until).getTime() <= Date.now()
    );
    for (const row of openRows) {
      await applyQuotationExpiry(row);
    }
    return rows.map((r) => ({
      ...r,
      customer_name: r.resolved_customer_name || r.customer_name,
      items: parseJson(r.items, []),
    }));
  },

  async getQuotationById(id, { customerId} = {}) {
    const quotation = await getOne(
      `SELECT q.*, c.name AS resolved_customer_name
         FROM quotations q
         LEFT JOIN customers c ON c.id = q.customer_id
        WHERE q.id = ?`,
      [id]
    );
    if (!quotation) return null;
    if (customerId && String(quotation.customer_id ?? quotation.customerId ?? '') !== String(customerId)) return null;
    quotation.customer_name = quotation.resolved_customer_name || quotation.customer_name;
    quotation.items = parseJson(quotation.items, []);
    await applyQuotationExpiry(quotation);
    return quotation;
  },

  // ─── Customer: quotation decisions ─────────────────────────────────────────
  async acceptQuotation(id, { portalUserId, customerId, signerName, signerEmail, context = {} }) {
    const quotation = await this.getQuotationById(id, { customerId});
    if (!quotation) throw new Error('Quotation not found');
    if (quotation.status === QUOTATION_STATUS.EXPIRED) {
      throw new Error('This quotation has expired and can no longer be accepted');
    }
    assertQuotationTransition(quotation, QUOTATION_STATUS.ACCEPTED);

    const acceptedBy = signerName || quotation.customer_name || 'Customer';
    await runQuery(
      `UPDATE quotations SET status = ?, accepted_by = ?, accepted_by_email = ?, accepted_at = ?, updated_at = ? WHERE id = ?`,
      [QUOTATION_STATUS.ACCEPTED, acceptedBy, signerEmail || null, nowIso(), nowIso(), id]
    );

    await recordSignature({ customerId, docType: 'quotation', docId: id, decision: 'accepted',
      signedBy: portalUserId, signerName: acceptedBy, signerEmail, context,
    });

    await addTimeline( customerId, 'quotation', id, EVENT_TYPES.QUOTATION_ACCEPTED,
      'Quotation accepted', `${acceptedBy} accepted ${quotation.quotation_number}.`,
      { type: 'customer', id: portalUserId, name: acceptedBy });

    await logAudit({
      actor: { id: portalUserId, name: acceptedBy, role: 'portal_customer' }, action: 'QUOTATION_ACCEPT', entityType: 'quotation', entityId: id,
      details: `${quotation.quotation_number} accepted by customer`,
      oldValue: { status: quotation.status }, newValue: { status: QUOTATION_STATUS.ACCEPTED, acceptedBy }, context,
    });

    await notifyAdmin({ type: NOTIFICATION_TYPES.DECISION, title: 'Quotation accepted',
      body: `${acceptedBy} accepted ${quotation.quotation_number} (${quotation.total}).`,
      link: '#/sales-flow/requests', customerId, customerName: acceptedBy,
    });

    emitEntityChange('admin', { customerId, docType: 'quotation', docId: id, status: QUOTATION_STATUS.ACCEPTED, quotationNumber: quotation.quotation_number });
    return { id, status: QUOTATION_STATUS.ACCEPTED };
  },

  async rejectQuotation(id, { portalUserId, customerId, reason, signerName, signerEmail, context = {} }) {
    const quotation = await this.getQuotationById(id, { customerId});
    if (!quotation) throw new Error('Quotation not found');
    if (quotation.status === QUOTATION_STATUS.EXPIRED) {
      throw new Error('This quotation has expired and can no longer be responded to');
    }
    assertQuotationTransition(quotation, QUOTATION_STATUS.REJECTED);

    const signer = signerName || quotation.customer_name || 'Customer';
    await runQuery(
      `UPDATE quotations SET status = ?, rejection_reason = ?, rejected_at = ?, updated_at = ? WHERE id = ?`,
      [QUOTATION_STATUS.REJECTED, reason || null, nowIso(), nowIso(), id]
    );

    await recordSignature({ customerId, docType: 'quotation', docId: id, decision: 'rejected',
      signedBy: portalUserId, signerName: signer, signerEmail, note: reason || null, context,
    });

    await addTimeline( customerId, 'quotation', id, EVENT_TYPES.QUOTATION_REJECTED,
      'Quotation rejected', `${signer} rejected ${quotation.quotation_number}.`,
      { type: 'customer', id: portalUserId, name: signer },
      { reason: reason || '' });

    await logAudit({
      actor: { id: portalUserId, name: signer, role: 'portal_customer' }, action: 'QUOTATION_REJECT', entityType: 'quotation', entityId: id,
      details: `${quotation.quotation_number} rejected${reason ? `: ${reason}` : ''}`,
      oldValue: { status: quotation.status }, newValue: { status: QUOTATION_STATUS.REJECTED, reason }, context,
    });

    await notifyAdmin({ type: NOTIFICATION_TYPES.DECISION, title: 'Quotation rejected',
      body: `${signer} rejected ${quotation.quotation_number}${reason ? ` — ${reason}` : ''}.`,
      link: '#/sales-flow/requests', customerId, customerName: signer,
    });

    emitEntityChange('admin', { customerId, docType: 'quotation', docId: id, status: QUOTATION_STATUS.REJECTED, quotationNumber: quotation.quotation_number });
    return { id, status: QUOTATION_STATUS.REJECTED };
  },

  async requestRevision(id, { portalUserId, customerId, comments, signerName, signerEmail, context = {} }) {
    const quotation = await this.getQuotationById(id, { customerId});
    if (!quotation) throw new Error('Quotation not found');
    if (quotation.status === QUOTATION_STATUS.EXPIRED) {
      throw new Error('This quotation has expired and can no longer be responded to');
    }
    assertQuotationTransition(quotation, QUOTATION_STATUS.REVISION_REQUESTED);

    const signer = signerName || quotation.customer_name || 'Customer';
    await runQuery(
      `UPDATE quotations SET status = ?, revision_note = ?, revision_requested_at = ?, updated_at = ? WHERE id = ?`,
      [QUOTATION_STATUS.REVISION_REQUESTED, comments || null, nowIso(), nowIso(), id]
    );

    await recordSignature({ customerId, docType: 'quotation', docId: id, decision: 'revision',
      signedBy: portalUserId, signerName: signer, signerEmail, note: comments || null, context,
    });

    await addTimeline( customerId, 'quotation', id, EVENT_TYPES.REVISION_REQUESTED,
      'Revision requested', `${signer} requested changes to ${quotation.quotation_number}.`,
      { type: 'customer', id: portalUserId, name: signer },
      { comments: comments || '' });

    await logAudit({
      actor: { id: portalUserId, name: signer, role: 'portal_customer' }, action: 'QUOTATION_REVISION_REQUEST', entityType: 'quotation', entityId: id,
      details: `Revision requested for ${quotation.quotation_number}${comments ? `: ${comments}` : ''}`,
      oldValue: { status: quotation.status }, newValue: { status: QUOTATION_STATUS.REVISION_REQUESTED, comments }, context,
    });

    await notifyAdmin({ type: NOTIFICATION_TYPES.DECISION, title: 'Revision requested',
      body: `${signer} requested changes to ${quotation.quotation_number}${comments ? ` — ${comments}` : ''}.`,
      link: '#/sales-flow/requests', customerId, customerName: signer,
    });

    emitEntityChange('admin', { customerId, docType: 'quotation', docId: id, status: QUOTATION_STATUS.REVISION_REQUESTED, quotationNumber: quotation.quotation_number });
    return { id, status: QUOTATION_STATUS.REVISION_REQUESTED };
  },

  async regenerateQuotation(id, { admin, items, discount, taxRate, deliveryFee, paymentTerms, validUntil, context = {} }) {
    const quotation = await this.getQuotationById(id, {});
    if (!quotation) throw new Error('Quotation not found');
    if (quotation.status !== QUOTATION_STATUS.REVISION_REQUESTED) {
      throw new Error('Only quotation revisions can be regenerated');
    }

    const normalized = normalizeItems(items);
    if (normalized.length === 0) throw new Error('At least one line item is required');
    const { subtotal, taxAmount, total } = computeTotals(normalized, discount, taxRate, deliveryFee);
    const nextVersion = (Number(quotation.version) || 1) + 1;
    const effectivePaymentTerms = paymentTerms || quotation.payment_terms || 'Net 7';
    const effectiveValidUntil = validUntil || quotation.valid_until;

    await runQuery(
      `UPDATE quotations SET items = ?, subtotal = ?, discount = ?, tax_rate = ?, tax_amount = ?,
         delivery_fee = ?, total = ?, payment_terms = ?, valid_until = ?, status = ?, revision_note = NULL,
         version = ?, updated_at = ?
       WHERE id = ?`,
      [JSON.stringify(normalized), subtotal, round2(discount), Number(taxRate) || 0, taxAmount,
        round2(deliveryFee), total, effectivePaymentTerms,
        effectiveValidUntil, QUOTATION_STATUS.READY, nextVersion, nowIso(), id]
    );

    // Immutable snapshot of the new revision — older revisions stay intact even
    // if this one is later accepted and converted into an order.
    await workflowEngine.createVersionSnapshot({
      customerId: quotation.customer_id,
      docType: 'quotation',
      docId: id,
      version: nextVersion,
      snapshot: {
        items: normalized,
        subtotal, discount, taxRate: Number(taxRate) || 0, taxAmount, deliveryFee, total,
        currency: quotation.currency,
        paymentTerms: effectivePaymentTerms,
        validUntil: effectiveValidUntil,
        status: QUOTATION_STATUS.READY,
      },
      reason: `Revision ${nextVersion} — regenerated after customer revision request`,
      actor: { id: admin.id, name: admin.name || 'Sales' },
    });

    await addTimeline( quotation.customer_id, 'quotation', id, EVENT_TYPES.REVISION_REGENERATED,
      'Quotation updated', `${admin.name || 'Sales'} updated ${quotation.quotation_number} and sent it back for review.`,
      { type: 'admin', id: admin.id, name: admin.name || 'Sales' }, { total, version: nextVersion });

    await logAudit({
      actor: { id: admin.id, name: admin.name || 'Sales', role: admin.role || 'admin' }, action: 'QUOTATION_REGENERATE', entityType: 'quotation', entityId: id,
      details: `${quotation.quotation_number} regenerated after revision request`,
      oldValue: { status: quotation.status, total: quotation.total },
      newValue: { status: QUOTATION_STATUS.READY, items: normalized, total }, context,
    });

    await notifyCustomer({ customerId: quotation.customer_id, type: NOTIFICATION_TYPES.QUOTATION,
      title: `Updated quotation ${quotation.quotation_number}`,
      body: 'Your revised quotation is ready for review.',
      link: `#/portal/quotations/${id}`, actorName: admin.name || 'Sales',
    });

    emitEntityChange('portal', { customerId: quotation.customer_id, docType: 'quotation', docId: id, status: QUOTATION_STATUS.READY });
    return this.getQuotationById(id, {});
  },

  // ─── Admin: convert to official sales order ────────────────────────────────
  async convertToOrder(id, { admin, deliveryDate, notes, context = {} }) {
    const quotation = await this.getQuotationById(id, {});
    if (!quotation) throw new Error('Quotation not found');
    if (quotation.status !== QUOTATION_STATUS.ACCEPTED && quotation.status !== QUOTATION_STATUS.READY) {
      throw new Error('Quotation must be accepted before converting to an order');
    }

    const orderId = genId('so');
    const orderNumber = await workflowEngine.nextYearScopedNumber('sales_orders', 'order_number', 'SO');
    const itemsJson = JSON.stringify(
      quotation.items.map((item) => ({
        id: item.productId || genId('itm'),
        productId: item.productId || null,
        description: item.name,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        lineTotal: item.lineTotal,
      }))
    );
    const now = nowIso();

    await runQuery('BEGIN TRANSACTION');
    try {
      await runQuery(
        `INSERT INTO sales_orders
           (id, order_number, quotation_id, source_request_id, source_request_number, customer_id, orderDate, deliveryDate, status, items,
            subtotal, discounts, tax, other_charges, total, notes,
            approved_by, approved_at, created_by, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ? )`,
        [orderId, orderNumber, id, quotation.request_id || null, quotation.source_request_number || null, quotation.customer_id, now, deliveryDate || null, workflowEngine.SALES_ORDER_STATUS.CONFIRMED, itemsJson, quotation.subtotal, quotation.discount, quotation.tax_amount, quotation.delivery_fee, quotation.total, notes || `Converted from ${quotation.quotation_number}`, admin.id, now, admin.id, now, now]
      );

      await runQuery(
        `UPDATE quotations SET status = ?, order_id = ?, converted_at = ?, updated_at = ? WHERE id = ?`,
        [QUOTATION_STATUS.CONVERTED, orderId, nowIso(), nowIso(), id]
      );

      await addTimeline( quotation.customer_id, 'quotation', id, EVENT_TYPES.ORDER_CONVERTED,
        'Converted to sales order', `${quotation.quotation_number} was converted to sales order ${orderNumber}.`,
        { type: 'admin', id: admin.id, name: admin.name || 'Sales' }, { orderNumber });

      await addTimeline( quotation.customer_id, 'order', orderId, EVENT_TYPES.ORDER_CONVERTED,
        'Order confirmed', `Sales order ${orderNumber} created from ${quotation.quotation_number}.`,
        { type: 'system' }, { quotationNumber: quotation.quotation_number, total: quotation.total });

      await logAudit({
        actor: { id: admin.id, name: admin.name || 'Sales', role: admin.role || 'admin' }, action: 'SALES_ORDER_CONVERT', entityType: 'sales_order', entityId: orderId,
        details: `${orderNumber} created from quotation ${quotation.quotation_number}`,
        oldValue: { status: quotation.status },
        newValue: { status: QUOTATION_STATUS.CONVERTED, orderId, orderNumber }, context,
      });

      const portalUsers = await getAll(
        'SELECT id, email FROM portal_users WHERE customer_id = ? AND status = ?',
        [quotation.customer_id, 'active']
      );
      await notifyCustomer({ customerId: quotation.customer_id, type: NOTIFICATION_TYPES.ORDER,
        title: `Your order ${orderNumber} is confirmed`,
        body: `Your order from ${quotation.quotation_number} has been confirmed.`,
        link: `#/portal/orders/${orderId}`,
        actorName: admin.name || 'Sales',
      });
      for (const user of portalUsers) {
        await sendEmailBestEffort({
          to: user.email,
          subject: `Your order ${orderNumber} is confirmed`,
          text: `Dear ${quotation.customer_name},\n\nYour order ${orderNumber} (total ${quotation.total}) has been confirmed.\nTrack it from the customer portal.\n\nPrime ERP`,
        });
      }

      await runQuery('COMMIT');
    } catch (err) {
      await runQuery('ROLLBACK');
      throw err;
    }

    emitEntityChange('portal', { customerId: quotation.customer_id, docType: 'order', docId: orderId, status: 'Confirmed', orderNumber });
    emitEntityChange('admin', { customerId: quotation.customer_id, docType: 'quotation', docId: id, status: QUOTATION_STATUS.CONVERTED });
    emitEntityChange('admin', { customerId: quotation.customer_id, docType: 'order', docId: orderId, status: 'Confirmed' });

    return { id: orderId, orderNumber, status: 'Confirmed' };
  },

  // ─── Downloads (gated + audited) ───────────────────────────────────────────
  async recordDownload({ docType, docId, portalUserId, customerId, context = {} }) {
    let doc = null;
    let docNumber = null;
    let allowed = false;

    if (docType === 'quotation') {
      doc = await this.getQuotationById(docId, { customerId});
      if (!doc) throw new Error('Quotation not found');
      allowed = [QUOTATION_STATUS.READY, QUOTATION_STATUS.ACCEPTED, QUOTATION_STATUS.REVISION_REQUESTED, QUOTATION_STATUS.CONVERTED].includes(doc.status);
      docNumber = doc.quotation_number;
    } else if (docType === 'order') {
      doc = await getOne(
        'SELECT * FROM sales_orders WHERE id = ? AND customer_id = ?',
        [docId, customerId]
      );
      if (!doc) throw new Error('Order not found');
      allowed = ![workflowEngine.SALES_ORDER_STATUS.DRAFT, workflowEngine.SALES_ORDER_STATUS.CANCELLED].includes(String(doc.status || ''));
      docNumber = doc.order_number || doc.id;
    } else {
      throw new Error('Unsupported document type');
    }

    if (!allowed) throw new Error('This document is not available for download yet');

    const id = genId('pdl');
    await runQuery(
      `INSERT INTO portal_downloads
         (id, customer_id, portal_user_id, doc_type, doc_id, doc_number, ip_address, user_agent)
       VALUES (? , ?, ?, ?, ?, ?, ?, ?)`,
      [id, customerId, portalUserId, docType, docId, docNumber, context.ip || null, context.userAgent ? String(context.userAgent).slice(0, 500) : null]
    );

    const title = docType === 'quotation' ? `Quotation ${docNumber} downloaded` : `Order ${docNumber} downloaded`;
    await addTimeline( customerId, docType, docId, EVENT_TYPES.QUOTATION_DOWNLOADED,
      'Document downloaded', `${doc.customer_name || 'Customer'} ${title}.`,
      { type: 'customer', id: portalUserId, name: doc.customer_name || 'Customer' },
      { docType, docNumber });

    await logAudit({
      actor: { id: portalUserId, name: doc.customer_name || 'Customer', role: 'portal_customer' }, action: 'DOCUMENT_DOWNLOAD', entityType: docType, entityId: docId,
      details: `${title} downloaded by ${doc.customer_name || 'customer'}`,
      newValue: { docType, docNumber }, context,
    });

    await notifyAdmin({ type: NOTIFICATION_TYPES.DOWNLOAD, title: 'Document downloaded',
      body: `${doc.customer_name || 'Customer'} downloaded ${docType} ${docNumber}.`,
      link: '#/sales-flow/requests', customerId, customerName: doc.customer_name || 'Customer',
    });

    emitEntityChange('admin', { customerId, docType, docId, event: 'download' });
    return { allowed: true, docType, docId, docNumber, downloadId: id };
  },

  // ─── Timeline (merged customer + admin chronological history) ──────────────
  async getTimeline({ docType, docId, customerId } = {}) {
    let query = 'SELECT * FROM portal_timeline_events WHERE doc_type = ? AND doc_id = ?';
    const params = [docType, docId];
    
    if (customerId) { query += ' AND customer_id = ?'; params.push(customerId); }
    query += ' ORDER BY created_at ASC';
    return getAll(query, params);
  },

  // ─── Admin notifications ───────────────────────────────────────────────────
  async getAdminNotifications( { limit = 50 } = {}) {
    return getAll(
      'SELECT * FROM admin_notifications ORDER BY created_at DESC LIMIT ?',
      [limit]
    );
  },

  async getAdminUnreadCount() {
    const row = await getOne(
      'SELECT COUNT(*) as count FROM admin_notificationsis_read = 0',
      []
    );
    return (row && row.count) || 0;
  },

  async markAdminNotificationRead(id) {
    await runQuery(
      'UPDATE admin_notifications SET is_read = 1 WHERE id = ?',
      [id]
    );
  },

  async markAllAdminNotificationsRead() {
    await runQuery(
      'UPDATE admin_notifications SET is_read = 1',
      []
    );
  },

  // ─── Admin activity feed (customer actions merged into one stream) ─────────
  async getActivity( { limit = 25 } = {}) {
    const timeline = await getAll(
      `SELECT 'timeline' as source, id, created_at, doc_type, doc_id, event_type, title, description, actor_type, actor_name, customer_id
       FROM portal_timeline_events
       ORDER BY created_at DESC LIMIT ?`,
      [limit]
    );
    const downloads = await getAll(
      `SELECT 'download' as source, id, created_at, doc_type, doc_id, doc_number, customer_id,
              '' as event_type, doc_number as title, '' as description, 'customer' as actor_type, '' as actor_name
       FROM portal_downloads
       ORDER BY created_at DESC LIMIT ?`,
      [limit]
    );
    return [...timeline, ...downloads]
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, limit);
  },

  // ─── Analytics (derived from audit-grade tables) ───────────────────────────
  async getAnalytics() {
    // NOTE: repo.getAll returns raw table rows (this repository layer never
    // executes SELECT/aggregate clauses), so all counts are computed in JS.
    const allRequests = await getAll('SELECT * FROM quotation_requests', []);

    const requestTotals = {};
    const requestTypes = {};
    for (const row of allRequests) {
      const status = row.status;
      requestTotals[status] = (requestTotals[status] || 0) + 1;
      // Open (actionable) requests by type — quotation vs order — so
      // dashboards can surface "new requests / orders from the portal".
      if (!row.deleted_at && !['cancelled', 'rejected', 'converted'].includes(status)) {
        requestTypes[row.request_type] = (requestTypes[row.request_type] || 0) + 1;
      }
    }
    const totalRequests = Object.values(requestTotals).reduce((a, b) => a + b, 0);

    const reviewRows = allRequests.filter(r => r.reviewed_at && r.created_at);
    const reviewMinutes = [];
    for (const row of reviewRows) {
      const minutes = (new Date(row.reviewed_at).getTime() - new Date(row.created_at).getTime()) / 60000;
      if (Number.isFinite(minutes)) reviewMinutes.push(minutes);
    }
    const avgReviewMinutes = reviewMinutes.length
      ? Math.round(reviewMinutes.reduce((sum, m) => sum + m, 0) / reviewMinutes.length)
      : 0;

    const quotationRows = await getAll('SELECT * FROM quotations', []);
    const quotationTotals = {};
    for (const row of quotationRows) quotationTotals[row.status] = (quotationTotals[row.status] || 0) + 1;
    const totalQuotations = Object.values(quotationTotals).reduce((a, b) => a + b, 0);

    const downloadRows = await getAll('SELECT * FROM portal_downloads', []);
    const downloadTotals = {};
    for (const row of downloadRows) downloadTotals[row.doc_type] = (downloadTotals[row.doc_type] || 0) + 1;
    const totalDownloads = Object.values(downloadTotals).reduce((a, b) => a + b, 0);

    const uniqueDownloads = new Set(downloadRows.map(r => r.doc_id).filter(Boolean)).size;

    const acceptedCount = (quotationTotals.accepted || 0) + (quotationTotals.converted || 0);
    return {
      requests: requestTotals,
      requestTypes,
      totalRequests,
      avgReviewMinutes,
      quotations: quotationTotals,
      totalQuotations,
      acceptedQuotations: acceptedCount,
      convertedQuotations: quotationTotals.converted || 0,
      acceptanceRate: totalQuotations ? Math.round((acceptedCount / totalQuotations) * 100) : 0,
      conversionRate: totalQuotations ? Math.round(((quotationTotals.converted || 0) / totalQuotations) * 100) : 0,
      downloads: downloadTotals,
      totalDownloads,
      uniqueDownloads,
    };
  },

  // ─── Phase 3: Document version history ──────────────────────────────────────
  listDocumentVersions(docType, docId, {} = {}) {
    return workflowEngine.listDocumentVersions(docType, docId, {});
  },

  getDocumentVersion(docType, docId, version, {} = {}) {
    return workflowEngine.getDocumentVersion(docType, docId, version, {});
  },

  // ─── Phase 3: Decision signatures (who accepted / rejected / requested) ─────
  async getDocumentSignatures(docType, docId, { customerId } = {}) {
    let query = 'SELECT * FROM document_signatures WHERE doc_type = ? AND doc_id = ?';
    const params = [docType, docId];
    
    if (customerId) { query += ' AND customer_id = ?'; params.push(customerId); }
    query += ' ORDER BY created_at ASC';
    return getAll(query, params);
  },

  // ─── Phase 4: Document discussions (threaded comments) ──────────────────────
  async getComments({ docType, docId, customerId, view = 'admin' } = {}) {
    let query = 'SELECT * FROM document_comments WHERE doc_type = ? AND doc_id = ?';
    const params = [docType, docId];
    
    if (customerId) { query += ' AND customer_id = ?'; params.push(customerId); }
    if (view === 'customer') {
      query += " AND visibility = 'customer'";
    }
    query += ' ORDER BY created_at ASC';
    return getAll(query, params);
  },

  async addComment({ docType, docId, customerId, actor = {}, body, visibility = 'internal', context = {} }) {
    const text = String(body || '').trim();
    if (!text) throw new Error('Comment body is required');
    const doc = await assertDocAccess(docType, docId, { customerId });
    const isCustomer = actor.type === 'customer';
    const effectiveVisibility = isCustomer ? 'customer' : (visibility === 'customer' ? 'customer' : 'internal');
    const actorName = actor.name || (isCustomer ? 'Customer' : 'Staff');
    const id = genId('cmt');

    await runQuery(
      `INSERT INTO document_comments
         (id, customer_id, doc_type, doc_id, author_type, author_id, author_name, visibility, body)
       VALUES (? , ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, doc.customer_id, docType, docId, actor.type || 'admin', actor.id || null, actorName, effectiveVisibility, text]
    );

    await addTimeline( doc.customer_id, docType, docId, EVENT_TYPES.COMMENT_ADDED,
      isCustomer ? 'Comment added by customer' : 'Note added by staff',
      `${actorName}: ${text.slice(0, 120)}`,
      { type: actor.type, id: actor.id, name: actorName },
      { visibility: effectiveVisibility });

    await logAudit({
      actor: { id: actor.id, name: actorName, role: isCustomer ? 'portal_customer' : (actor.role || 'admin') }, action: isCustomer ? 'DOCUMENT_COMMENT_ADD' : 'DOCUMENT_NOTE_ADD',
      entityType: docType, entityId: docId,
      details: `${actorName} commented on ${docType} ${docId}${isCustomer ? '' : ` (${effectiveVisibility})`}`,
      newValue: { visibility: effectiveVisibility, body: text.slice(0, 200) }, context,
    });

    if (isCustomer) {
      await notifyAdmin({ type: NOTIFICATION_TYPES.DECISION, title: 'Customer comment added',
        body: `${actorName} commented on a ${docType}: ${text.slice(0, 140)}`,
        link: '#/sales-flow/requests', customerId: doc.customer_id, customerName: actorName,
      });
    } else if (effectiveVisibility === 'customer') {
      await notifyCustomer({ customerId: doc.customer_id, type: NOTIFICATION_TYPES.DECISION,
        title: 'Staff note added', body: text.slice(0, 140),
        link: docPortalLink(docType, docId), actorName,
      });
    }

    emitEntityChange('portal', { customerId: doc.customer_id, docType, docId, event: 'comment', visibility: effectiveVisibility });
    emitEntityChange('admin', { customerId: doc.customer_id, docType, docId, event: 'comment', visibility: effectiveVisibility });
    return this.getComments({ docType, docId, view: isCustomer ? 'customer' : 'admin' });
  },

  // ─── Phase 4: Sales order production progress ───────────────────────────────
  async updateOrderStatus(orderId, { admin, toStatus, note, context = {} }) {
    const order = await getOne(
      'SELECT * FROM sales_orders WHERE id = ?',
      [orderId]
    );
    if (!order) throw new Error('Order not found');
    workflowEngine.assertSalesOrderTransition(order, toStatus);

    const fromStatus = order.status;
    const now = nowIso();
    await runQuery(
      `UPDATE sales_orders SET status = ?, notes = ?, updated_by = ?, updated_at = ? WHERE id = ?`,
      [toStatus, note || order.notes || null, admin.id, now, orderId]
    );

    await addTimeline( order.customer_id, 'order', orderId, EVENT_TYPES.ORDER_STATUS_CHANGED,
      'Order status changed', `${order.order_number} moved from ${fromStatus} to ${toStatus}.`,
      { type: 'admin', id: admin.id, name: admin.name || 'Sales' },
      { from: fromStatus, to: toStatus, note: note || '' });

    await logAudit({
      actor: { id: admin.id, name: admin.name || 'Sales', role: admin.role || 'admin' }, action: 'SALES_ORDER_STATUS_UPDATE', entityType: 'order', entityId: orderId,
      details: `${order.order_number} ${fromStatus} → ${toStatus}`,
      oldValue: { status: fromStatus }, newValue: { status: toStatus, note: note || null }, context,
    });

    const progressStatuses = [
      workflowEngine.SALES_ORDER_STATUS.PROCESSING,
      workflowEngine.SALES_ORDER_STATUS.SHIPPED,
      workflowEngine.SALES_ORDER_STATUS.DELIVERED,
      workflowEngine.SALES_ORDER_STATUS.FULFILLED,
    ];
    if (progressStatuses.includes(toStatus)) {
      await notifyCustomer({ customerId: order.customer_id, type: NOTIFICATION_TYPES.ORDER,
        title: `Order ${order.order_number} is ${toStatus.toLowerCase()}`,
        body: `Your order ${order.order_number} moved to ${toStatus}.${note ? ` ${note}` : ''}`,
        link: `#/portal/orders/${orderId}`, actorName: admin.name || 'Sales',
      });
    }

    emitEntityChange('portal', { customerId: order.customer_id, docType: 'order', docId: orderId, status: toStatus, orderNumber: order.order_number });
    emitEntityChange('admin', { customerId: order.customer_id, docType: 'order', docId: orderId, status: toStatus, orderNumber: order.order_number });
    return { id: orderId, status: toStatus, orderNumber: order.order_number };
  },

};

module.exports = portalLifecycleService;
