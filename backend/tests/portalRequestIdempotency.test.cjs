/**
 * POST /api/portal/requests idempotency tests — hermetic (repo and
 * portalLifecycleService are mocked; no Supabase, no network, no DB writes).
 *
 * Covers:
 *   - normal request without Idempotency-Key (unchanged behavior)
 *   - first idempotent request -> exactly one ODR
 *   - same-key replay -> no second ODR, original response replayed
 *   - different key -> treated as a separate request
 *   - no accounting mutation (only idempotency_keys storage is touched)
 *   - cross-customer same-key isolation (replay can never leak another
 *     customer's response; keys are scoped to the authenticated actor)
 *   - same-key + different-body documented limitation (original response
 *     is replayed — matches the shared middleware policy)
 *   - JWT auth still enforced on both initial request and replay
 */

process.env.JWT_SECRET = 'test-jwt-secret';

jest.mock('../services/supabaseRepository.cjs', () => {
  const rows = new Map();
  return {
    getAll: jest.fn(async (table, filters = {}) => {
      if (table !== 'idempotency_keys') return [];
      const keyFilter = filters['data->>key'];
      const userFilter = filters['data->>user_id'];
      const key = keyFilter && keyFilter.startsWith('eq.') ? keyFilter.slice(3) : null;
      const user = userFilter && userFilter.startsWith('eq.') ? userFilter.slice(3) : null;
      const out = [];
      for (const row of rows.values()) {
        if (key !== null && row.data.key !== key) continue;
        if (user !== null && String(row.data.user_id) !== String(user)) continue;
        out.push({ id: row.id, data: { ...row.data } });
      }
      return out;
    }),
    upsert: jest.fn(async (table, record) => {
      if (table !== 'idempotency_keys') {
        throw new Error(`unexpected table in upsert: ${table}`);
      }
      // Mirror cloudSyncStore.upsertRow(): the payload is stored verbatim
      // inside the `data` JSONB column (canonical single-wrap), and creates
      // are stamped with version 1 which the middleware must carry forward
      // on the response write.
      const existing = rows.get(record.id);
      const version = existing ? (existing.version || 0) + 1 : 1;
      rows.set(record.id, { id: record.id, data: { ...record }, version });
      return { id: record.id, version };
    }),
    softDelete: jest.fn(async (table, id) => {
      if (table !== 'idempotency_keys') {
        throw new Error(`unexpected table in softDelete: ${table}`);
      }
      rows.delete(id);
      return { id };
    }),
    __rows: rows,
    __reset: () => rows.clear(),
  };
});

jest.mock('../services/portalLifecycleService.cjs', () => ({
  createQuotationRequest: jest.fn(),
}));

const request = require('supertest');
const express = require('express');
const repo = require('../services/supabaseRepository.cjs');
const lifecycle = require('../services/portalLifecycleService.cjs');
const { generatePortalToken } = require('../middleware/portalAuth.cjs');
const portalRoutes = require('../routes/portal.cjs');

const ORDER_BODY = {
  requestType: 'order',
  items: [{ productId: 'p1', name: 'A4 Paper (Ream)', quantity: 2, unitPrice: 150 }],
  notes: 'Test idempotent order request',
};

function makeResponse(seq, input) {
  return {
    id: `req-${seq}`,
    requestNumber: `ODR-2026-${String(seq).padStart(6, '0')}`,
    status: 'submitted',
    items: input.items || [],
    subtotal: 300,
    discountTotal: 0,
    total: 300,
    promotion: null,
    promotionApplied: false,
    reorderOf: null,
    reorderOfNumber: null,
  };
}

const app = express();
app.use(express.json());
app.use('/api/portal', portalRoutes);

const userA = generatePortalToken({ id: 'pusr_A', customer_id: 'CUST_A', email: 'a@test.com' });
const userB = generatePortalToken({ id: 'pusr_B', customer_id: 'CUST_B', email: 'b@test.com' });

describe('POST /api/portal/requests idempotency', () => {
  beforeEach(() => {
    repo.__reset();
    jest.clearAllMocks();
    let seq = 0;
    lifecycle.createQuotationRequest.mockImplementation(async (input) => {
      seq += 1;
      return makeResponse(seq, input);
    });
  });

  it('Test 1 — normal request without Idempotency-Key succeeds and creates an ODR', async () => {
    const res = await request(app)
      .post('/api/portal/requests')
      .set('Authorization', `Bearer ${userA}`)
      .send(ORDER_BODY);

    expect(res.status).toBe(201);
    expect(res.body.requestNumber).toMatch(/^ODR-2026-/);
    expect(lifecycle.createQuotationRequest).toHaveBeenCalledTimes(1);
    expect(lifecycle.createQuotationRequest).toHaveBeenCalledWith(
      expect.objectContaining({ customerId: 'CUST_A', requestType: 'order' })
    );
    expect(repo.getAll).not.toHaveBeenCalled();
    expect(repo.upsert).not.toHaveBeenCalled();
  });

  it('Test 2 — first idempotent request succeeds and creates exactly one ODR', async () => {
    const res = await request(app)
      .post('/api/portal/requests')
      .set('Authorization', `Bearer ${userA}`)
      .set('Idempotency-Key', 'test-order-001')
      .send(ORDER_BODY);

    expect(res.status).toBe(201);
    expect(res.body.requestNumber).toMatch(/^ODR-2026-/);
    expect(lifecycle.createQuotationRequest).toHaveBeenCalledTimes(1);
    expect(repo.upsert).toHaveBeenCalled();
  });

  it('Test 3 — same-key replay returns the original response and creates no second ODR', async () => {
    const first = await request(app)
      .post('/api/portal/requests')
      .set('Authorization', `Bearer ${userA}`)
      .set('Idempotency-Key', 'test-order-001')
      .send(ORDER_BODY);
    expect(first.status).toBe(201);
    expect(lifecycle.createQuotationRequest).toHaveBeenCalledTimes(1);

    const replay = await request(app)
      .post('/api/portal/requests')
      .set('Authorization', `Bearer ${userA}`)
      .set('Idempotency-Key', 'test-order-001')
      .send(ORDER_BODY);

    expect(replay.status).toBe(201);
    expect(lifecycle.createQuotationRequest).toHaveBeenCalledTimes(1);
    expect(replay.body).toEqual(first.body);
  });

  it('Test 4 — different key is treated as a separate request', async () => {
    const first = await request(app)
      .post('/api/portal/requests')
      .set('Authorization', `Bearer ${userA}`)
      .set('Idempotency-Key', 'test-order-001')
      .send(ORDER_BODY);
    expect(first.body.requestNumber).toBe('ODR-2026-000001');

    const second = await request(app)
      .post('/api/portal/requests')
      .set('Authorization', `Bearer ${userA}`)
      .set('Idempotency-Key', 'test-order-002')
      .send(ORDER_BODY);

    expect(second.status).toBe(201);
    expect(lifecycle.createQuotationRequest).toHaveBeenCalledTimes(2);
    expect(second.body.requestNumber).toBe('ODR-2026-000002');
    expect(second.body.requestNumber).not.toBe(first.body.requestNumber);
  });

  it('Test 5 — order-request idempotency never touches accounting storage', async () => {
    await request(app)
      .post('/api/portal/requests')
      .set('Authorization', `Bearer ${userA}`)
      .set('Idempotency-Key', 'test-order-001')
      .send(ORDER_BODY);
    await request(app)
      .post('/api/portal/requests')
      .set('Authorization', `Bearer ${userA}`)
      .set('Idempotency-Key', 'test-order-001')
      .send(ORDER_BODY);
    await request(app)
      .post('/api/portal/requests')
      .set('Authorization', `Bearer ${userA}`)
      .set('Idempotency-Key', 'test-order-002')
      .send(ORDER_BODY);

    const accountingTables = ['invoices', 'customer_payments', 'payment_allocations', 'ledger_entries', 'expenses', 'income', 'budgets', 'transfers'];
    for (const table of accountingTables) {
      for (const call of repo.upsert.mock.calls) {
        expect(call[0]).not.toBe(table);
      }
    }
    expect(repo.upsert.mock.calls.length).toBeGreaterThan(0);
    for (const call of repo.upsert.mock.calls) {
      expect(call[0]).toBe('idempotency_keys');
    }
    for (const call of repo.getAll.mock.calls) {
      expect(call[0]).toBe('idempotency_keys');
    }
  });

  it('Test 6 — same key from a different customer never replays the first customer response', async () => {
    const aRes = await request(app)
      .post('/api/portal/requests')
      .set('Authorization', `Bearer ${userA}`)
      .set('Idempotency-Key', 'test-shared-key-001')
      .send(ORDER_BODY);
    expect(aRes.status).toBe(201);
    expect(aRes.body.requestNumber).toBe('ODR-2026-000001');

    const bRes = await request(app)
      .post('/api/portal/requests')
      .set('Authorization', `Bearer ${userB}`)
      .set('Idempotency-Key', 'test-shared-key-001')
      .send(ORDER_BODY);

    expect(bRes.status).toBe(201);
    expect(bRes.body.requestNumber).toBe('ODR-2026-000002');
    expect(bRes.body).not.toEqual(aRes.body);
    expect(lifecycle.createQuotationRequest).toHaveBeenCalledTimes(2);
    expect(lifecycle.createQuotationRequest).toHaveBeenLastCalledWith(
      expect.objectContaining({ customerId: 'CUST_B' })
    );

    const aReplay = await request(app)
      .post('/api/portal/requests')
      .set('Authorization', `Bearer ${userA}`)
      .set('Idempotency-Key', 'test-shared-key-001')
      .send(ORDER_BODY);

    expect(aReplay.status).toBe(201);
    expect(aReplay.body).toEqual(aRes.body);
    expect(lifecycle.createQuotationRequest).toHaveBeenCalledTimes(2);
  });

  it('Documented limitation — same key with a different body replays the original response (existing policy)', async () => {
    const first = await request(app)
      .post('/api/portal/requests')
      .set('Authorization', `Bearer ${userA}`)
      .set('Idempotency-Key', 'test-order-003')
      .send(ORDER_BODY);
    expect(first.status).toBe(201);

    const differentBody = {
      ...ORDER_BODY,
      items: [{ productId: 'p9', name: 'Different product', quantity: 99, unitPrice: 999 }],
    };
    const replayed = await request(app)
      .post('/api/portal/requests')
      .set('Authorization', `Bearer ${userA}`)
      .set('Idempotency-Key', 'test-order-003')
      .send(differentBody);

    expect(replayed.status).toBe(201);
    expect(replayed.body).toEqual(first.body);
    expect(lifecycle.createQuotationRequest).toHaveBeenCalledTimes(1);
  });

  it('JWT auth is still enforced on the initial request and on replays', async () => {
    const unauthorized = await request(app)
      .post('/api/portal/requests')
      .set('Idempotency-Key', 'test-order-004')
      .send(ORDER_BODY);
    expect(unauthorized.status).toBe(401);
    expect(lifecycle.createQuotationRequest).not.toHaveBeenCalled();

    await request(app)
      .post('/api/portal/requests')
      .set('Authorization', `Bearer ${userA}`)
      .set('Idempotency-Key', 'test-order-004')
      .send(ORDER_BODY);
    expect(lifecycle.createQuotationRequest).toHaveBeenCalledTimes(1);

    const replayWithoutToken = await request(app)
      .post('/api/portal/requests')
      .set('Idempotency-Key', 'test-order-004')
      .send(ORDER_BODY);
    expect(replayWithoutToken.status).toBe(401);
    expect(lifecycle.createQuotationRequest).toHaveBeenCalledTimes(1);
  });

  it('Rejects an invalid Idempotency-Key (shorter than 8 chars)', async () => {
    const res = await request(app)
      .post('/api/portal/requests')
      .set('Authorization', `Bearer ${userA}`)
      .set('Idempotency-Key', 'short')
      .send(ORDER_BODY);

    expect(res.status).toBe(400);
    expect(lifecycle.createQuotationRequest).not.toHaveBeenCalled();
  });
});