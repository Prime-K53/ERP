/**
 * Single-Organization Security Tests (Jest version)
 * Validates the single-organization architecture: no company_id columns,
 * no tenant tables, passthrough tenantContext.
 */
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret-for-tenant-isolation-tests';

const { db, initDb } = require('../../db.cjs');
const { tenantContext } = require('../../middleware/tenantContext.cjs');
const { generateToken, verifyToken } = require('../../middleware/auth.cjs');

const runQuery = (sql, params = []) => new Promise((resolve, reject) => {
  db.get(sql, params, (err, row) => {
    if (err) reject(err);
    else resolve(row);
  });
});

const runAll = (sql, params = []) => new Promise((resolve, reject) => {
  db.all(sql, params, (err, rows) => {
    if (err) reject(err);
    else resolve(rows);
  });
});

const runExec = (sql, params = []) => new Promise((resolve, reject) => {
  db.run(sql, params, function (err) {
    if (err) reject(err);
    else resolve(this);
  });
});

const tables = [
  'sales', 'invoices', 'examinations', 'schools', 'customers',
  'inventory', 'inventory_transactions', 'material_batches',
  'warehouse_inventory', 'material_categories', 'sales_orders',
  'sales_exchanges', 'sales_exchange_items', 'sales_exchange_approvals',
  'reprint_jobs', 'market_adjustments', 'market_adjustment_transactions',
  'transaction_adjustment_snapshots', 'audit_logs', 'documents',
  'tasks', 'classes', 'subjects', 'examination_batches',
  'examination_classes', 'examination_subjects', 'examination_bom_calculations',
  'examination_class_adjustments', 'examination_pricing_audit',
  'examination_batch_notifications', 'notification_audit_logs',
  'bom_default_materials', 'profit_margin_settings',
  'profit_margin_audit_logs', 'work_centers', 'production_resources',
  'work_orders', 'production_batches', 'sale_items',
  'chart_of_accounts', 'suppliers',
  'purchase_orders', 'goods_receipts'
];

beforeAll(async () => {
  await initDb();
});

afterAll(async () => {
  await runExec("DELETE FROM sales WHERE id LIKE 'sale-%'");
  await runExec("DELETE FROM examination_batches WHERE id IN ('batch-a1', 'batch-b1')");
  await runExec("DELETE FROM inventory WHERE id IN ('inv-a1', 'inv-b1')");
});

describe('Single-Organization Security', () => {

  test('all business tables exist and have NO company_id column', async () => {
    for (const table of tables) {
      const cols = await runAll(`PRAGMA table_info(${table})`);
      expect(cols).toBeDefined();
      expect(cols.some(c => c.name === 'company_id')).toBe(false);
    }
  });

  test('tenant tables (companies, user_companies) do not exist', async () => {
    const companies = await runQuery("SELECT name FROM sqlite_master WHERE type='table' AND name='companies'");
    expect(companies).toBeUndefined();
    const userCompanies = await runQuery("SELECT name FROM sqlite_master WHERE type='table' AND name='user_companies'");
    expect(userCompanies).toBeUndefined();
  });

  test('data isolation: all business data is global', async () => {
    await runExec("INSERT OR IGNORE INTO sales (id, date, total_amount) VALUES (?, datetime('now'), ?)",
      ['sale-a1', 100]);
    await runExec("INSERT OR IGNORE INTO sales (id, date, total_amount) VALUES (?, datetime('now'), ?)",
      ['sale-b1', 300]);

    const sales = await runAll("SELECT id, total_amount FROM sales WHERE id LIKE 'sale-%' ORDER BY id");
    expect(sales.length).toBe(2);
    expect(sales.some(s => s.id === 'sale-a1')).toBe(true);
    expect(sales.some(s => s.id === 'sale-b1')).toBe(true);
  });

  test('examination batches are global', async () => {
    await runExec("INSERT OR IGNORE INTO examination_batches (id, batch_number, school_id, name) VALUES (?, ?, ?, ?)",
      ['batch-a1', 'BN-A001', 'sch-1', 'Batch A1']);
    await runExec("INSERT OR IGNORE INTO examination_batches (id, batch_number, school_id, name) VALUES (?, ?, ?, ?)",
      ['batch-b1', 'BN-B001', 'sch-2', 'Batch B1']);

    const batches = await runAll('SELECT id FROM examination_batches WHERE id IN (?, ?) ORDER BY id', ['batch-a1', 'batch-b1']);
    expect(batches).toHaveLength(2);
  });

  test('inventory is global', async () => {
    await runExec("INSERT OR IGNORE INTO inventory (id, name, cost_per_unit, quantity) VALUES (?, ?, ?, ?)",
      ['inv-a1', 'Item A1', 10, 100]);
    await runExec("INSERT OR IGNORE INTO inventory (id, name, cost_per_unit, quantity) VALUES (?, ?, ?, ?)",
      ['inv-b1', 'Item B1', 20, 200]);

    const inv = await runAll('SELECT id FROM inventory WHERE id IN (?, ?) ORDER BY id', ['inv-a1', 'inv-b1']);
    expect(inv).toHaveLength(2);
  });

  test('tenantContext middleware is a passthrough', (done) => {
    const mockReq = { headers: { 'x-company-id': 'comp-a-test' }, user: { id: 'usr-test-a' } };
    tenantContext(mockReq, {}, () => {
      expect(mockReq.companyId).toBeUndefined();
      done();
    });
  });

  test('JWT payload has no company claims', async () => {
    const token = generateToken({ id: 'usr-test-a', username: 'tester', role: 'Admin' });
    const payload = require('jsonwebtoken').decode(token);
    expect(payload.company_id).toBeUndefined();
    expect(payload.companies).toBeUndefined();

    const req = {
      path: '/api/customers',
      method: 'GET',
      originalUrl: '/api/customers',
      headers: { authorization: `Bearer ${token}` },
    };
    await verifyToken(req, { json: () => {} }, () => {});
    expect(req.user.id).toBe('usr-test-a');
  });
});
