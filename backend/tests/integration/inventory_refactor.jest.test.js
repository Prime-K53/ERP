/**
 * Enterprise Cloud-Native Inventory Creation & ID Architecture Refactor Test Suite
 * 
 * Verifies:
 * 1. Backend/Database primary key UUID generation (client IDs are ignored)
 * 2. Server-side audit metadata lockdown (created_by; company_id ignored)
 * 3. Business SKU uniqueness with HTTP 409 Conflict
 * 4. Input validation (400 Bad Request for missing name)
 * 5. Concurrent creation safety without lost updates or duplicate IDs
 */

const request = require('supertest');

process.env.NODE_ENV = 'test';
process.env.ALLOW_HEADER_AUTH = 'true';

let app;
let db;

const USER_A = 'user-admin-alpha';

const adminHeaders = {
  'x-user-id': USER_A,
  'x-user-role': 'Admin',
  'Content-Type': 'application/json'
};

const SKUS_TO_CLEAN = ['SKU-STEEL-12MM', 'SKU-COPPER-2MM', 'SKU-MOD-001', 'SKU-MOD-002'];

beforeAll(async () => {
  jest.setTimeout(120000);
  const { db: testDb, initDb } = require('../../db.cjs');
  db = testDb;
  await initDb();
  app = require('../../index.cjs');
  const t0 = Date.now();
  while (!(app.router && app.router.stack.length > 50)) {
    if (Date.now() - t0 > 60000) throw new Error('Server routes did not register in time');
    await new Promise(r => setTimeout(r, 250));
  }
}, 120000);

afterAll(async () => {
  await new Promise((resolve) => {
    const placeholders = SKUS_TO_CLEAN.map(() => '?').join(', ');
    db.run(`DELETE FROM inventory WHERE sku IN (${placeholders}) OR sku LIKE 'SKU-CONCURRENT-%'`, SKUS_TO_CLEAN, resolve);
  });
}, 120000);

describe('Cloud-Native Inventory Creation Architecture & ID Lockdown', () => {
  test('1. Backend generates UUID primary key and sets audit metadata (client IDs ignored)', async () => {
    const payload = {
      id: 'CLIENT-LOCAL-ID-TO-BE-IGNORED',
      name: 'Steel Rod 12mm',
      sku: 'SKU-STEEL-12MM',
      quantity: 150,
      cost_per_unit: 25.5,
      selling_price: 35.0,
      unit: 'kg',
      company_id: 'CLIENT-SUPPLIED-COMPANY-IGNORED'
    };

    const res = await request(app)
      .post('/api/inventory')
      .set(adminHeaders)
      .send(payload);

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('id');
    expect(res.body.id).not.toBe('CLIENT-LOCAL-ID-TO-BE-IGNORED');
    // Verify valid UUID format (36 characters with hyphens)
    expect(res.body.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    expect(res.body.company_id).toBeUndefined();
    expect(res.body.created_by).toBe(USER_A);
    expect(res.body.name).toBe('Steel Rod 12mm');
    expect(res.body.sku).toBe('SKU-STEEL-12MM');
  });

  test('2. Missing name returns 400 Bad Request', async () => {
    const res = await request(app)
      .post('/api/inventory')
      .set(adminHeaders)
      .send({ name: '   ', quantity: 10 });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  test('3. Duplicate SKU returns HTTP 409 Conflict (no overwrites)', async () => {
    const payload1 = {
      name: 'Copper Wire 2mm',
      sku: 'SKU-COPPER-2MM',
      quantity: 50
    };

    const res1 = await request(app)
      .post('/api/inventory')
      .set(adminHeaders)
      .send(payload1);

    expect(res1.status).toBe(201);

    // Try creating duplicate SKU
    const payload2 = {
      name: 'Copper Wire Duplicate',
      sku: 'SKU-COPPER-2MM',
      quantity: 100
    };

    const res2 = await request(app)
      .post('/api/inventory')
      .set(adminHeaders)
      .send(payload2);

    expect(res2.status).toBe(409);
    expect(res2.body).toHaveProperty('error');
    expect(res2.body.code).toBe('SKU_ALREADY_EXISTS');
  });

  test('4. Duplicate SKU rejected globally (no tenant isolation)', async () => {
    const payloadDuplicate = {
      name: 'Copper Wire Second Request',
      sku: 'SKU-COPPER-2MM', // Same SKU as previous test
      quantity: 200
    };

    const res = await request(app)
      .post('/api/inventory')
      .set(adminHeaders)
      .send(payloadDuplicate);

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('SKU_ALREADY_EXISTS');
  });

  test('5. PUT /api/inventory/:id SKU conflict detection & update lockdown', async () => {
    // Create item 1
    const item1 = (await request(app).post('/api/inventory').set(adminHeaders).send({ name: 'Item 1', sku: 'SKU-MOD-001' })).body;
    // Create item 2
    const item2 = (await request(app).post('/api/inventory').set(adminHeaders).send({ name: 'Item 2', sku: 'SKU-MOD-002' })).body;

    // Try updating item2 SKU to item1 SKU -> expect 409 Conflict
    const updateRes = await request(app)
      .put(`/api/inventory/${item2.id}`)
      .set(adminHeaders)
      .send({ sku: 'SKU-MOD-001' });

    expect(updateRes.status).toBe(409);

    // Valid update to item2 name -> expect success
    const validUpdate = await request(app)
      .put(`/api/inventory/${item2.id}`)
      .set(adminHeaders)
      .send({ name: 'Item 2 Updated' });

    expect(validUpdate.status).toBe(200);
    expect(validUpdate.body.success).toBe(true);
  });

  test('6. Concurrent Inventory Creation under load (10 parallel requests)', async () => {
    const requests = Array.from({ length: 10 }).map((_, idx) =>
      request(app)
        .post('/api/inventory')
        .set(adminHeaders)
        .send({
          name: `Concurrent Item ${idx}`,
          sku: `SKU-CONCURRENT-${idx}-${Date.now()}`,
          quantity: idx * 10
        })
    );

    const responses = await Promise.all(requests);

    const statusCodes = responses.map(r => r.status);
    expect(statusCodes.every(code => code === 201)).toBe(true);

    const generatedIds = responses.map(r => r.body.id);
    const uniqueIds = new Set(generatedIds);
    expect(uniqueIds.size).toBe(10);
  });
});
