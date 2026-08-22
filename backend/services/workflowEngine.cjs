/**
 * Workflow Engine
 *
 * Central registry for the sales document chain and its lifecycle rules:
 *   Request → Quotation → Sales Order → (Invoice → Receipt — later phases)
 *
 * This module is intentionally dependency-light (repo only) so both
 * portalLifecycleService and portalService can consume it without circular
 * requires. All status transitions, document numbering and chain navigation
 * rules live here — components must never duplicate this logic.
 *
 * Domain docTypes (portal realm):
 *   'request'      → quotation_requests
 *   'quotation'    → quotations
 *   'order'        → sales_orders
 */

const repo = require('./supabaseRepository.cjs');
const crypto = require('crypto');

const SALES_ORDER_STATUS = Object.freeze({
  DRAFT: 'Draft',
  CONFIRMED: 'Confirmed',
  PROCESSING: 'Processing',
  PENDING: 'Pending',
  SHIPPED: 'Shipped',
  DELIVERED: 'Delivered',
  FULFILLED: 'Fulfilled',
  CANCELLED: 'Cancelled',
});

const REQUEST_NUMBER_PREFIXES = Object.freeze({
  quotation: 'QTR',
  order: 'SO',
});

function requestNumberPrefix(requestType) {
  return requestType === 'order' ? REQUEST_NUMBER_PREFIXES.order : REQUEST_NUMBER_PREFIXES.quotation;
}

function getOne(table, filters = {}) {
  return repo.getAll(table, filters).then((rows) => (rows[0] || null));
}

function getAll(table, filters = {}) {
  return repo.getAll(table, filters);
}

function runQuery(table, record) {
  return repo.upsert(table, record);
}

function parseJson(value, fallback = null) {
  if (!value) return fallback;
  try { return JSON.parse(value); } catch { return fallback; }
}

async function nextYearScopedNumber(table, column, prefix) {
  const year = new Date().getFullYear();
  // NOTE: repo.getAll returns flat domain rows (the JSONB `data` is spread onto
  // the row — never a nested `{ data: ... }` envelope) and the repository only
  // supports flat string operators for PostgREST filters. A `{ like: ... }`
  // object cannot be serialized by axios into PostgREST syntax, so the prefix
  // match is done in JS (the same JS-side filtering used across the portal).
  let rows = [];
  try {
    rows = await repo.getAll(table);
  } catch {
    rows = [];
  }
  const prefixToken = `${prefix}-${year}-`;
  let maxSeq = 0;
  for (const row of rows) {
    const value = String(row[column] || '');
    if (!value.startsWith(prefixToken)) continue;
    const num = parseInt(value.slice(prefixToken.length), 10);
    if (Number.isFinite(num) && num > maxSeq) maxSeq = num;
  }
  return `${prefixToken}${String(maxSeq + 1).padStart(6, '0')}`;
}

function assertSalesOrderTransition(order, toStatus) {
  const allowed = {
    [SALES_ORDER_STATUS.DRAFT]: [SALES_ORDER_STATUS.CONFIRMED, SALES_ORDER_STATUS.CANCELLED],
    [SALES_ORDER_STATUS.CONFIRMED]: [SALES_ORDER_STATUS.PROCESSING, SALES_ORDER_STATUS.PENDING, SALES_ORDER_STATUS.SHIPPED, SALES_ORDER_STATUS.DELIVERED, SALES_ORDER_STATUS.FULFILLED, SALES_ORDER_STATUS.CANCELLED],
    [SALES_ORDER_STATUS.PROCESSING]: [SALES_ORDER_STATUS.SHIPPED, SALES_ORDER_STATUS.DELIVERED, SALES_ORDER_STATUS.FULFILLED, SALES_ORDER_STATUS.CANCELLED],
    [SALES_ORDER_STATUS.PENDING]: [SALES_ORDER_STATUS.CONFIRMED, SALES_ORDER_STATUS.PROCESSING, SALES_ORDER_STATUS.CANCELLED],
    [SALES_ORDER_STATUS.SHIPPED]: [SALES_ORDER_STATUS.DELIVERED, SALES_ORDER_STATUS.FULFILLED],
    [SALES_ORDER_STATUS.DELIVERED]: [SALES_ORDER_STATUS.FULFILLED],
    [SALES_ORDER_STATUS.FULFILLED]: [],
    [SALES_ORDER_STATUS.CANCELLED]: [],
  };
  if (!(allowed[String(order.status || order.data?.status || '')] || []).includes(toStatus)) {
    throw new Error(`Invalid sales order transition: ${order.status || order.data?.status} → ${toStatus}`);
  }
}

function genId(prefix = 'dv') {
  return `${prefix}_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`;
}

async function createVersionSnapshot({ customerId, docType, docId, version, snapshot, reason, actor = {} }) {
  if (!docType || !docId || !version) throw new Error('docType, docId and version are required');
  const record = {
    id: genId('dv'),
    customer_id: customerId || null,
    doc_type: docType,
    doc_id: docId,
    version,
    snapshot: typeof snapshot === 'string' ? snapshot : JSON.stringify(snapshot),
    reason: reason || null,
    created_by: actor.id || null,
    created_by_name: actor.name || null,
  };
  await runQuery('document_versions', record);
  return record;
}

async function listDocumentVersions(docType, docId, {} = {}) {
  const rows = await repo.getAll('document_versions', { 'data->>doc_type': `eq.${docType}`, 'data->>doc_id': `eq.${docId}` });
  rows.sort((a, b) => String(a.data?.version || '').localeCompare(String(b.data?.version || '')));
  return rows.map((r) => ({ ...r, snapshot: parseJson(r.data?.snapshot, {}) }));
}

async function getDocumentVersion(docType, docId, version, {} = {}) {
  const rows = await repo.getAll('document_versions', { 'data->>doc_type': `eq.${docType}`, 'data->>doc_id': `eq.${docId}`, 'data->>version': `eq.${version}` });
  const row = rows[0] || null;
  if (!row) return null;
  return { ...row, snapshot: parseJson(row.data?.snapshot, {}) };
}

async function getDocumentChain({ docType, docId, customerId } = {}) {
  if (!docType || !docId) throw new Error('docType and docId are required');

  const collected = { request: null, quotation: null, order: null, originOrder: null };

  const loadRequest = async (id) => {
    if (!id || collected.request) return collected.request;
    const filters = { id };
    if (customerId) filters.customer_id = customerId;
    const row = await getOne('quotation_requests', filters);
    if (row) collected.request = row;
    return row;
  };

  const loadQuotation = async (id) => {
    if (!id || collected.quotation) return collected.quotation;
    const filters = { id };
    if (customerId) filters.customer_id = customerId;
    const row = await getOne('quotations', filters);
    if (row) collected.quotation = row;
    return row;
  };

  const loadOrder = async (id) => {
    if (!id || collected.order) return collected.order;
    const filters = { id };
    if (customerId) filters.customer_id = customerId;
    const row = await getOne('sales_orders', filters);
    if (row) collected.order = row;
    return row;
  };

  if (docType === 'request') {
    const request = await loadRequest(docId);
    if (!request) throw new Error('Request not found');
    if (request.data?.quotation_id) await loadQuotation(request.data.quotation_id);
    if (request.data?.sales_order_id) {
      await loadOrder(request.data.sales_order_id);
    } else if (collected.quotation && collected.quotation.data?.order_id) {
      await loadOrder(collected.quotation.data.order_id);
    } else {
      const bySource = await repo.getAll('sales_orders', { 'data->>source_request_id': `eq.${docId}` });
      if (bySource.length > 0) await loadOrder(bySource[0].id);
    }
  } else if (docType === 'quotation') {
    await loadQuotation(docId);
    if (collected.quotation?.data?.request_id) await loadRequest(collected.quotation.data.request_id);
    if (collected.quotation?.data?.order_id) await loadOrder(collected.quotation.data.order_id);
    else {
      const byQuotation = await repo.getAll('sales_orders', { 'data->>quotation_id': `eq.${docId}` });
      if (byQuotation.length > 0) await loadOrder(byQuotation[0].id);
    }
  } else if (docType === 'order') {
    await loadOrder(docId);
    if (collected.order?.data?.quotation_id) await loadQuotation(collected.order.data.quotation_id);
    if (collected.order?.data?.source_request_id) await loadRequest(collected.order.data.source_request_id);
  }

  return collected;
}

module.exports = {
  SALES_ORDER_STATUS,
  REQUEST_NUMBER_PREFIXES,
  requestNumberPrefix,
  getOne,
  getAll,
  runQuery,
  parseJson,
  nextYearScopedNumber,
  assertSalesOrderTransition,
  genId,
  createVersionSnapshot,
  listDocumentVersions,
  getDocumentVersion,
  getDocumentChain,
};
