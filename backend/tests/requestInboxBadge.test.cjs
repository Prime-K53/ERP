/**
 * Quotation Requests hub — notification badge lifecycle (hermetic).
 *
 * Defects guarded here:
 *   1. The SQL read-shim ignored `WHERE is_read = 0`, so the hub inbox
 *      returned requests even after notifications were read → badge never
 *      cleared.
 *   2. The UPDATE shim only bound `col = ?` placeholders, so
 *      `UPDATE admin_notifications SET is_read = 1 WHERE id = ?` silently
 *      wrote NOTHING (and the bulk no-WHERE mark-all did not run at all).
 *
 * Contract now: opening the hub calls markRequestNotificationsRead() →
 * request-pipeline notifications become read → getInboxRequests() returns []
 * → the badge disappears on the hub and the dashboard.
 */

process.env.JWT_SECRET = 'test-jwt-secret';

const repoActual = jest.requireActual('../services/supabaseRepository.cjs');

const store = {
  customers: new Map(),
  admin_notifications: new Map(),
  quotation_requests: new Map(),
};

function seed(table, id, data, created_at = '2026-08-23T08:00:00.000Z') {
  if (!store[table]) store[table] = new Map();
  store[table].set(id, { id, data, created_at, updated_at: created_at, version: 1 });
}

jest.mock('../services/supabaseRepository.cjs', () => ({
  getAll: jest.fn(async (table) => {
    const rows = [...((store[table] || new Map()).values())];
    return rows.map((row) => repoActual.fromSupabaseRow(row));
  }),
  getById: jest.fn(async (table, id) => {
    const row = (store[table] || new Map()).get(String(id));
    return row ? repoActual.fromSupabaseRow(row) : null;
  }),
  upsert: jest.fn(async (table, record) => {
    if (!store[table]) store[table] = new Map();
    const { id } = record;
    const data = { ...record };
    delete data.id;
    const existing = store[table].get(id);
    store[table].set(id, {
      id,
      data,
      created_at: existing ? existing.created_at : new Date().toISOString(),
      updated_at: new Date().toISOString(),
      version: existing ? existing.version + 1 : 1,
    });
    return repoActual.fromSupabaseRow(store[table].get(id));
  }),
  softDelete: jest.fn(async () => ({ changes: 1 })),
}));

jest.mock('../services/promotionService.cjs', () => ({
  getActivePromotions: jest.fn(async () => []),
  getUsageByPromotion: jest.fn(async () => ({})),
  getUsageByPromotionForCustomer: jest.fn(async () => ({})),
  recordRedemption: jest.fn(async () => ({})),
}));

jest.mock('../services/workflowEngine.cjs', () => ({
  SALES_ORDER_STATUS: Object.freeze({ DRAFT: 'Draft', CONFIRMED: 'Confirmed', CANCELLED: 'Cancelled' }),
  nextYearScopedNumber: jest.fn(async (_t, _c, prefix) => `${prefix}-2026-000001`),
  requestNumberPrefix: jest.fn((type) => (type === 'order' ? 'SO' : 'QTR')),
}));

jest.mock('../auditService.cjs', () => ({
  auditService: { logEvent: jest.fn(async () => ({})) },
}));

const lifecycle = require('../services/portalLifecycleService.cjs');

function seedFixture() {
  Object.keys(store).forEach((k) => store[k].clear());

  seed('customers', 'cust_badge', { name: 'Badge Customer' });

  // Unread REQUEST notification (hub link) + an unrelated stream that must NOT be touched.
  seed('admin_notifications', 'an_req_1', {
    type: 'REQUEST', title: 'New quotation request',
    link: '#/sales-flow/requests', customer_id: 'cust_badge', customer_name: 'Badge Customer',
  });
  seed('admin_notifications', 'an_pay_1', {
    type: 'PAYMENT', title: 'Payment request submitted',
    link: '#/sales-flow/payment-requests', customer_id: 'cust_badge', customer_name: 'Badge Customer',
  });

  // Active + closed + deleted requests for the badge customer.
  seed('quotation_requests', 'req_active', {
    request_number: 'QTR-2026-000201', customer_id: 'cust_badge', customer_name: 'Badge Customer',
    request_type: 'quotation', items: JSON.stringify([]), status: 'submitted',
  });
  seed('quotation_requests', 'req_closed', {
    request_number: 'QTR-2026-000202', customer_id: 'cust_badge', customer_name: 'Badge Customer',
    request_type: 'quotation', items: JSON.stringify([]), status: 'converted',
  });
  seed('quotation_requests', 'req_deleted', {
    request_number: 'QTR-2026-000203', customer_id: 'cust_badge', customer_name: 'Badge Customer',
    request_type: 'order', items: JSON.stringify([]), status: 'submitted', deleted: true,
  });
}

describe('Quotation Requests hub badge lifecycle', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    seedFixture();
  });

  it('inbox lists only active requests of customers with UNREAD request notifications', async () => {
    const inbox = await lifecycle.getInboxRequests();
    expect(inbox.map((r) => r.id)).toEqual(['req_active']);
  });

  it('markRequestNotificationsRead clears ONLY hub-scoped notifications', async () => {
    const result = await lifecycle.markRequestNotificationsRead();
    expect(result.marked).toBe(1);

    const reqNotif = await repoActual.fromSupabaseRow(store.admin_notifications.get('an_req_1'));
    void reqNotif;
    const reloadedReq = await lifecycle.getAdminNotifications({ limit: 10 });
    const reqRow = reloadedReq.find((n) => n.id === 'an_req_1');
    const payRow = reloadedReq.find((n) => n.id === 'an_pay_1');
    expect(Number(reqRow.is_read)).toBe(1);
    expect(Number(payRow.is_read ?? 0)).toBe(0); // unrelated stream untouched
  });

  it('badge disappears: inbox returns [] after opening the hub (mark-read)', async () => {
    await lifecycle.markRequestNotificationsRead();
    const inbox = await lifecycle.getInboxRequests();
    expect(inbox).toEqual([]);
  });

  it('markAdminNotificationRead persists is_read=1 through the UPDATE shim (regression)', async () => {
    await lifecycle.markAdminNotificationRead('an_req_1');
    const rows = await lifecycle.getAdminNotifications({ limit: 10 });
    expect(Number(rows.find((n) => n.id === 'an_req_1').is_read)).toBe(1);
  });

  it('markAllAdminNotificationsRead bulk-marks every row (no-WHERE UPDATE path)', async () => {
    await lifecycle.markAllAdminNotificationsRead();
    const rows = await lifecycle.getAdminNotifications({ limit: 10 });
    for (const n of rows) {
      expect(Number(n.is_read ?? 0)).toBe(1);
    }
  });
});
