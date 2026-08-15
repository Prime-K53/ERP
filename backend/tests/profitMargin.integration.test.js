/**
 * Integration Tests: /api/settings/profit-margins endpoints
 * Tests happy path, permission denied, validation errors, and conflict detection.
 *
 * Run with:  cd backend && node --test tests/profitMargin.integration.test.js
 * (Or with Jest/Vitest if configured)
 */

const request = require('supertest');

// Use test DB (in-memory SQLite)
process.env.NODE_ENV = 'test';

// Lazy-require the app after setting NODE_ENV
let app;
let db;

beforeAll(async () => {
  const { db: testDb, initDb } = require('../db.cjs');
  db = testDb;
  await initDb();
  app = require('../index.cjs');
  // Give Express a moment to mount routes
  await new Promise(r => setTimeout(r, 200));
});

afterAll(done => {
  if (db) db.close(done);
  else done();
});

// ─── Auth header helpers ───────────────────────────────────────────────────────

const adminHeaders = {
  'x-user-id': 'test-admin',
  'x-user-role': 'Admin',
  'x-user-is-super-admin': 'true',
  'Content-Type': 'application/json'
};

const unauthorizedHeaders = {
  'x-user-id': 'test-sales',
  'x-user-role': 'Sales',
  'x-user-is-super-admin': 'false',
  'Content-Type': 'application/json'
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function createGlobal(marginValue = 25, marginType = 'percentage') {
  return request(app)
    .post('/api/settings/profit-margins')
    .set(adminHeaders)
    .send({ scope: 'global', scope_ref_id: null, margin_type: marginType, margin_value: marginValue, reason: 'Test global' });
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('GET /api/settings/profit-margins', () => {
  it('returns 401 when no auth headers provided', async () => {
    const res = await request(app).get('/api/settings/profit-margins');
    expect(res.status).toBe(401);
  });

  it('returns empty array initially', async () => {
    const res = await request(app).get('/api/settings/profit-margins').set(adminHeaders);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('can filter by scope', async () => {
    const res = await request(app)
      .get('/api/settings/profit-margins?scope=global')
      .set(adminHeaders);
    expect(res.status).toBe(200);
    res.body.forEach((item) => expect(item.scope).toBe('global'));
  });
});

describe('POST /api/settings/profit-margins', () => {
  it('returns 403 when called by a non-admin role', async () => {
    const res = await request(app)
      .post('/api/settings/profit-margins')
      .set(unauthorizedHeaders)
      .send({ scope: 'global', margin_type: 'percentage', margin_value: 20 });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('ACCESS_DENIED');
  });

  it('creates a global override successfully (happy path)', async () => {
    const res = await createGlobal(20);
    expect(res.status).toBe(201);
    expect(res.body.scope).toBe('global');
    expect(res.body.margin_value).toBe(20);
  });

  it('returns 400 for percentage > 100', async () => {
    const res = await request(app)
      .post('/api/settings/profit-margins')
      .set(adminHeaders)
      .send({ scope: 'global', margin_type: 'percentage', margin_value: 150 });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/0 and 100/);
  });

  it('returns 400 for negative fixed_amount', async () => {
    const res = await request(app)
      .post('/api/settings/profit-margins')
      .set(adminHeaders)
      .send({ scope: 'category', scope_ref_id: 'CAT-TEST', margin_type: 'fixed_amount', margin_value: -10 });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/>= 0/);
  });

  it('returns 409 when an active override already exists for same scope_ref_id', async () => {
    // Create first
    await request(app)
      .post('/api/settings/profit-margins')
      .set(adminHeaders)
      .send({ scope: 'category', scope_ref_id: 'CAT-DUPE', margin_type: 'percentage', margin_value: 10 });

    // Try to create second
    const res = await request(app)
      .post('/api/settings/profit-margins')
      .set(adminHeaders)
      .send({ scope: 'category', scope_ref_id: 'CAT-DUPE', margin_type: 'percentage', margin_value: 20 });

    expect(res.status).toBe(409);
  });

  it('creates a line-item override for a specific SKU', async () => {
    const res = await request(app)
      .post('/api/settings/profit-margins')
      .set(adminHeaders)
      .send({ scope: 'line_item', scope_ref_id: 'SKU-INT-001', margin_type: 'percentage', margin_value: 42, reason: 'Integration test' });
    expect(res.status).toBe(201);
    expect(res.body.scope_ref_id).toBe('SKU-INT-001');
  });
});

describe('PATCH /api/settings/profit-margins/:id', () => {
  let settingId;

  beforeAll(async () => {
    const res = await request(app)
      .post('/api/settings/profit-margins')
      .set(adminHeaders)
      .send({ scope: 'category', scope_ref_id: 'CAT-PATCH', margin_type: 'percentage', margin_value: 15, reason: 'Before patch' });
    settingId = res.body.id;
  });

  it('returns 403 for unauthorized role', async () => {
    const res = await request(app)
      .patch(`/api/settings/profit-margins/${settingId}`)
      .set(unauthorizedHeaders)
      .send({ margin_value: 25 });
    expect(res.status).toBe(403);
  });

  it('updates margin_value successfully', async () => {
    const res = await request(app)
      .patch(`/api/settings/profit-margins/${settingId}`)
      .set(adminHeaders)
      .send({ margin_value: 30, reason: 'Patch test' });
    expect(res.status).toBe(200);
    expect(res.body.margin_value).toBe(30);
  });

  it('returns 400 when updating with invalid percentage', async () => {
    const res = await request(app)
      .patch(`/api/settings/profit-margins/${settingId}`)
      .set(adminHeaders)
      .send({ margin_value: 999, margin_type: 'percentage' });
    expect(res.status).toBe(400);
  });

  it('can toggle is_active', async () => {
    const res = await request(app)
      .patch(`/api/settings/profit-margins/${settingId}`)
      .set(adminHeaders)
      .send({ is_active: 0 });
    expect(res.status).toBe(200);
  });
});

describe('DELETE /api/settings/profit-margins/:id', () => {
  let deleteId;

  beforeAll(async () => {
    const res = await request(app)
      .post('/api/settings/profit-margins')
      .set(adminHeaders)
      .send({ scope: 'line_item', scope_ref_id: 'SKU-DEL', margin_type: 'percentage', margin_value: 10 });
    deleteId = res.body.id;
  });

  it('returns 403 for unauthorized role on delete', async () => {
    const res = await request(app)
      .delete(`/api/settings/profit-margins/${deleteId}`)
      .set(unauthorizedHeaders)
      .send({ reason: 'Should fail' });
    expect(res.status).toBe(403);
  });

  it('soft-deletes the override (admin)', async () => {
    const res = await request(app)
      .delete(`/api/settings/profit-margins/${deleteId}`)
      .set(adminHeaders)
      .send({ reason: 'Cleaning up test data' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('deleted item no longer appears in list', async () => {
    const res = await request(app)
      .get('/api/settings/profit-margins')
      .set(adminHeaders);
    const found = res.body.find((s) => s.id === deleteId);
    // Should not appear (soft-deleted)
    expect(found).toBeUndefined();
  });
});

describe('GET /api/settings/profit-margins/audit-log', () => {
  it('returns audit history after operations', async () => {
    const res = await request(app)
      .get('/api/settings/profit-margins/audit-log')
      .set(adminHeaders);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    // Should have at least the operations from above tests
    expect(res.body.length).toBeGreaterThan(0);
  });

  it('can filter audit log by scope', async () => {
    const res = await request(app)
      .get('/api/settings/profit-margins/audit-log?scope=global')
      .set(adminHeaders);
    expect(res.status).toBe(200);
  });
});

describe('POST /api/settings/profit-margins/bulk-upload', () => {
  it('processes CSV rows and returns success/fail counts', async () => {
    const rows = [
      { sku: 'BULK-001', margin_type: 'percentage', margin_value: '22', reason: 'Bulk test' },
      { sku: 'BULK-002', margin_type: 'percentage', margin_value: '33', reason: 'Bulk test' },
      { sku: 'BULK-001', margin_type: 'percentage', margin_value: '44', reason: 'Duplicate — should fail' }
    ];
    const res = await request(app)
      .post('/api/settings/profit-margins/bulk-upload')
      .set(adminHeaders)
      .send({ rows });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(2);
    expect(res.body.failed).toBe(1); // Duplicate
    expect(res.body.errors.length).toBe(1);
  });

  it('returns 403 for non-admin bulk upload', async () => {
    const res = await request(app)
      .post('/api/settings/profit-margins/bulk-upload')
      .set(unauthorizedHeaders)
      .send({ rows: [] });
    expect(res.status).toBe(403);
  });
});
