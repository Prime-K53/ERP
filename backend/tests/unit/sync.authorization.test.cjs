/**
 * B5 — Authorization tests for POST /api/sync/ops.
 *
 * Verifies that:
 *   1. Unauthenticated requests → 401 (handled by global verifyToken)
 *   2. Portal customer tokens → 403 Forbidden
 *   3. ERP user tokens → allowed through
 */
process.env.SUPABASE_URL = 'https://test.supabase.co';
process.env.SUPABASE_SECRET_KEY = 'test-secret-key';
process.env.JWT_SECRET = 'test-jwt-secret';

jest.mock('axios', () => {
  const instance = {
    get: jest.fn().mockResolvedValue({ data: [] }),
    post: jest.fn().mockResolvedValue({ data: [] }),
    patch: jest.fn().mockResolvedValue({ data: [] }),
    delete: jest.fn(),
  };
  instance.create = jest.fn(() => instance);
  return instance;
});

const express = require('express');
const request = require('supertest');
const jwt = require('jsonwebtoken');

const JWT_SECRET = 'test-jwt-secret';

// Build a minimal Express app with just the sync route + auth middleware
function buildApp() {
  const app = express();
  app.use(express.json());

  // Simulate the global verifyToken middleware (simplified)
  const { verifyToken } = require('../../middleware/auth.cjs');
  app.use('/api', verifyToken);

  const syncRoutes = require('../../routes/sync.cjs');
  app.use('/api/sync', syncRoutes);

  return app;
}

function makeToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '1h' });
}

describe('B5 — sync gateway authorization', () => {
  let app;
  beforeAll(() => { app = buildApp(); });

  it('rejects unauthenticated requests (no token)', async () => {
    const res = await request(app)
      .post('/api/sync/ops')
      .send({ ops: [{ table: 'products', recordId: 'r1', operation: 'upsert', payload: {} }] });

    expect(res.status).toBe(401);
  });

  it('rejects portal_customer tokens with 403', async () => {
    const token = makeToken({ id: 'portal-user-1', role: 'portal_customer', email: 'cust@test.com' });

    const res = await request(app)
      .post('/api/sync/ops')
      .set('Authorization', `Bearer ${token}`)
      .send({ ops: [{ table: 'products', recordId: 'r1', operation: 'upsert', payload: {} }] });

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('Forbidden');
    expect(res.body.message).toContain('ERP user token');
  });

  it('allows Admin role through to sync processing', async () => {
    const token = makeToken({ id: 'admin-1', role: 'Admin', email: 'admin@test.com' });

    const res = await request(app)
      .post('/api/sync/ops')
      .set('Authorization', `Bearer ${token}`)
      .send({ ops: [{ table: 'nonexistent_table_xyz', recordId: 'r1', operation: 'upsert', payload: {} }] });

    // Should pass auth but fail on table validation (not 403)
    expect(res.status).toBe(200);
    expect(res.body.results[0].error).toContain('table not allowed');
  });

  it('allows User role through to sync processing', async () => {
    const token = makeToken({ id: 'user-1', role: 'User', email: 'user@test.com' });

    const res = await request(app)
      .post('/api/sync/ops')
      .set('Authorization', `Bearer ${token}`)
      .send({ ops: [{ table: 'nonexistent_table_xyz', recordId: 'r1', operation: 'upsert', payload: {} }] });

    expect(res.status).toBe(200);
    expect(res.body.results[0].error).toContain('table not allowed');
  });
});
