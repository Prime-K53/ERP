/**
 * POST /api/portal/referrals idempotency tests — hermetic (repo and
 * portalService are mocked; no Supabase, no network, no DB writes).
 *
 * Covers:
 *   A. first idempotent request -> exactly one referral created (201)
 *   B. same-key replay -> original response replayed, no duplicate referral
 *   C. same customer + different key -> business duplicate-prevention runs
 *      (NOT idempotency replay; the business rule still rejects)
 *   D. different customer + same key -> actor isolation, no response leak
 *   E. canonical persistence (data.key, never data.data.key) + response
 *   F. referral business protections intact (missing field, self-referral,
 *      identity taken from the JWT, not the body)
 *   + JWT auth enforced on initial request and replay
 *   + invalid Idempotency-Key rejected without creating a referral
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

jest.mock('../services/portalService.cjs', () => ({
  createReferral: jest.fn(),
}));

const request = require('supertest');
const express = require('express');
const repo = require('../services/supabaseRepository.cjs');
const portalService = require('../services/portalService.cjs');
const { generatePortalToken } = require('../middleware/portalAuth.cjs');
const portalRoutes = require('../routes/portal.cjs');

const REFERRAL_BODY = {
  referredCustomerId: 'CUST_REF',
  notes: 'Test idempotent referral',
};

function makeReferral(seq, portalUserId, customerId, input) {
  return {
    id: `ref-${seq}`,
    customerId: input.referredCustomerId,
    referredByCustomerId: customerId,
    referralCode: `REF-2026-${String(seq).padStart(6, '0')}`,
    status: 'active',
    notes: input.notes || null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

const app = express();
app.use(express.json());
app.use('/api/portal', portalRoutes);

const userA = generatePortalToken({ id: 'pusr_A', customer_id: 'CUST_A', email: 'a@test.com' });
const userB = generatePortalToken({ id: 'pusr_B', customer_id: 'CUST_B', email: 'b@test.com' });

describe('POST /api/portal/referrals idempotency', () => {
  beforeEach(() => {
    repo.__reset();
    jest.clearAllMocks();
    let seq = 0;
    const pairs = new Set();
    portalService.createReferral.mockImplementation(async (portalUserId, customerId, input) => {
      if (!input.referredCustomerId) {
        throw new Error('Referred customer is required');
      }
      if (input.referredCustomerId === customerId) {
        throw new Error('You cannot refer yourself');
      }
      const pairKey = `${customerId}|${input.referredCustomerId}`;
      if (pairs.has(pairKey)) {
        throw new Error('This customer has already been referred by you');
      }
      pairs.add(pairKey);
      seq += 1;
      return makeReferral(seq, portalUserId, customerId, input);
    });
  });

  it('Test 1 — normal request without Idempotency-Key succeeds and creates exactly one referral', async () => {
    const res = await request(app)
      .post('/api/portal/referrals')
      .set('Authorization', `Bearer ${userA}`)
      .send(REFERRAL_BODY);

    expect(res.status).toBe(201);
    expect(res.body.referralCode).toMatch(/^REF-2026-/);
    expect(portalService.createReferral).toHaveBeenCalledTimes(1);
    expect(portalService.createReferral).toHaveBeenCalledWith(
      'pusr_A', 'CUST_A',
      { referredCustomerId: 'CUST_REF', notes: 'Test idempotent referral' }
    );
    expect(repo.getAll).not.toHaveBeenCalled();
    expect(repo.upsert).not.toHaveBeenCalled();
  });

  it('Test A — first idempotent request succeeds and creates exactly one referral', async () => {
    const res = await request(app)
      .post('/api/portal/referrals')
      .set('Authorization', `Bearer ${userA}`)
      .set('Idempotency-Key', 'ref-create-001')
      .send(REFERRAL_BODY);

    expect(res.status).toBe(201);
    expect(res.body.referralCode).toMatch(/^REF-2026-/);
    expect(portalService.createReferral).toHaveBeenCalledTimes(1);
    expect(repo.upsert).toHaveBeenCalled();
  });

  it('Test B — same-key replay returns the original response and creates no second referral', async () => {
    const first = await request(app)
      .post('/api/portal/referrals')
      .set('Authorization', `Bearer ${userA}`)
      .set('Idempotency-Key', 'ref-create-001')
      .send(REFERRAL_BODY);
    expect(first.status).toBe(201);
    expect(portalService.createReferral).toHaveBeenCalledTimes(1);

    const replay = await request(app)
      .post('/api/portal/referrals')
      .set('Authorization', `Bearer ${userA}`)
      .set('Idempotency-Key', 'ref-create-001')
      .send(REFERRAL_BODY);

    expect(replay.status).toBe(201);
    expect(portalService.createReferral).toHaveBeenCalledTimes(1);
    expect(replay.body).toEqual(first.body);
  });

  it('Test C — same customer + different key runs business duplicate-prevention (not idempotency replay)', async () => {
    const first = await request(app)
      .post('/api/portal/referrals')
      .set('Authorization', `Bearer ${userA}`)
      .set('Idempotency-Key', 'ref-create-001')
      .send(REFERRAL_BODY);
    expect(first.status).toBe(201);

    const second = await request(app)
      .post('/api/portal/referrals')
      .set('Authorization', `Bearer ${userA}`)
      .set('Idempotency-Key', 'ref-create-002')
      .send(REFERRAL_BODY);

    expect(second.status).toBe(400);
    expect(second.body.error).toBe('This customer has already been referred by you');
    expect(second.body).not.toEqual(first.body);
    expect(portalService.createReferral).toHaveBeenCalledTimes(2);
  });

  it('Test D — same key from a different customer never replays the first customer response', async () => {
    const aRes = await request(app)
      .post('/api/portal/referrals')
      .set('Authorization', `Bearer ${userA}`)
      .set('Idempotency-Key', 'ref-shared-key-001')
      .send({ ...REFERRAL_BODY, referredCustomerId: 'CUST_REF' });
    expect(aRes.status).toBe(201);
    expect(aRes.body.referralCode).toBe('REF-2026-000001');

    const bRes = await request(app)
      .post('/api/portal/referrals')
      .set('Authorization', `Bearer ${userB}`)
      .set('Idempotency-Key', 'ref-shared-key-001')
      .send({ ...REFERRAL_BODY, referredCustomerId: 'CUST_REF2' });

    expect(bRes.status).toBe(201);
    expect(bRes.body.referralCode).toBe('REF-2026-000002');
    expect(bRes.body).not.toEqual(aRes.body);
    expect(portalService.createReferral).toHaveBeenCalledTimes(2);
    expect(portalService.createReferral).toHaveBeenLastCalledWith(
      'pusr_B', 'CUST_B',
      { referredCustomerId: 'CUST_REF2', notes: 'Test idempotent referral' }
    );

    const aReplay = await request(app)
      .post('/api/portal/referrals')
      .set('Authorization', `Bearer ${userA}`)
      .set('Idempotency-Key', 'ref-shared-key-001')
      .send({ ...REFERRAL_BODY, referredCustomerId: 'CUST_REF' });

    expect(aReplay.status).toBe(201);
    expect(aReplay.body).toEqual(aRes.body);
    expect(portalService.createReferral).toHaveBeenCalledTimes(2);
  });

  it('Test E — stored shape is canonical data.key (never data.data.key) with response persisted', async () => {
    const key = 'ref-persist-001';
    const res = await request(app)
      .post('/api/portal/referrals')
      .set('Authorization', `Bearer ${userA}`)
      .set('Idempotency-Key', key)
      .send(REFERRAL_BODY);
    expect(res.status).toBe(201);

    const created = repo.upsert.mock.calls.find((c) => c[0] === 'idempotency_keys' && c[1].key === key);
    expect(created).toBeTruthy();
    expect(created[1].key).toBe(key);
    expect(created[1].data).toBeUndefined();
    expect(created[1].method).toBe('POST');
    expect(created[1].path).toBe('/api/portal/referrals');
    expect(created[1].user_id).toBe('pusr_A');
    expect(created[1].expires_at).toBeTruthy();

    const responseWrite = repo.upsert.mock.calls.find(
      (c) => c[0] === 'idempotency_keys' && c[1].key === key && c[1].response_code
    );
    expect(responseWrite).toBeTruthy();
    expect(responseWrite[1].response_code).toBe(201);
    const storedBody = JSON.parse(responseWrite[1].response_body);
    expect(storedBody.referralCode).toBe(res.body.referralCode);

    const stored = [...repo.__rows.values()].find((r) => r.data.key === key);
    expect(stored).toBeTruthy();
    expect(stored.data.key).toBe(key);
    expect(stored.data.data).toBeUndefined();
  });

  it('Test F — referral business protections stay intact behind idempotency', async () => {
    const missing = await request(app)
      .post('/api/portal/referrals')
      .set('Authorization', `Bearer ${userA}`)
      .set('Idempotency-Key', 'ref-validate-001')
      .send({ notes: 'no customer id' });
    expect(missing.status).toBe(400);
    expect(missing.body.error).toBe('Referred customer is required');
    expect(portalService.createReferral).not.toHaveBeenCalled();

    const self = await request(app)
      .post('/api/portal/referrals')
      .set('Authorization', `Bearer ${userA}`)
      .set('Idempotency-Key', 'ref-validate-002')
      .send({ ...REFERRAL_BODY, referredCustomerId: 'CUST_A' });
    expect(self.status).toBe(400);
    expect(self.body.error).toBe('You cannot refer yourself');
    expect(portalService.createReferral).toHaveBeenCalledWith(
      'pusr_A', 'CUST_A',
      { referredCustomerId: 'CUST_A', notes: 'Test idempotent referral' }
    );

    const legitimate = await request(app)
      .post('/api/portal/referrals')
      .set('Authorization', `Bearer ${userA}`)
      .set('Idempotency-Key', 'ref-validate-003')
      .send(REFERRAL_BODY);
    expect(legitimate.status).toBe(201);
    expect(legitimate.body.referredByCustomerId).toBe('CUST_A');
  });

  it('JWT auth is still enforced on the initial request and on replays', async () => {
    const unauthorized = await request(app)
      .post('/api/portal/referrals')
      .set('Idempotency-Key', 'ref-auth-001')
      .send(REFERRAL_BODY);
    expect(unauthorized.status).toBe(401);
    expect(portalService.createReferral).not.toHaveBeenCalled();

    await request(app)
      .post('/api/portal/referrals')
      .set('Authorization', `Bearer ${userA}`)
      .set('Idempotency-Key', 'ref-auth-001')
      .send(REFERRAL_BODY);
    expect(portalService.createReferral).toHaveBeenCalledTimes(1);

    const replayWithoutToken = await request(app)
      .post('/api/portal/referrals')
      .set('Idempotency-Key', 'ref-auth-001')
      .send(REFERRAL_BODY);
    expect(replayWithoutToken.status).toBe(401);
    expect(portalService.createReferral).toHaveBeenCalledTimes(1);
  });

  it('Rejects an invalid Idempotency-Key (shorter than 8 chars) without creating a referral', async () => {
    const res = await request(app)
      .post('/api/portal/referrals')
      .set('Authorization', `Bearer ${userA}`)
      .set('Idempotency-Key', 'short')
      .send(REFERRAL_BODY);

    expect(res.status).toBe(400);
    expect(portalService.createReferral).not.toHaveBeenCalled();
  });
});
