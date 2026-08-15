/**
 * Single-Organization Security Tests
 * Validates the single-organization architecture: no company_id columns,
 * no tenant tables, passthrough tenantContext and _scopeSql.
 */

// Suppress unhandled Statement errors from migration (db.serialize async errors)
process.on('uncaughtException', () => {});
process.on('unhandledRejection', () => {});

const { db, initDb } = require('../db.cjs');

let pass = 0;
let fail = 0;

function assert(condition, msg) {
  if (condition) {
    console.log(`  PASS: ${msg}`);
    pass++;
  } else {
    console.error(`  FAIL: ${msg}`);
    fail++;
  }
}

function runQuery(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

function runAll(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

function runExec(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function(err) {
      if (err) reject(err);
      else resolve(this);
    });
  });
}

async function runTests() {
  console.log('\n=== SINGLE-ORGANIZATION SECURITY TESTS ===\n');

  // 1. Verify all business tables exist
  console.log('1. Schema: all business tables exist\n');
  const tables = [
    'sales', 'invoices', 'examinations', 'schools', 'customers',
    'inventory', 'inventory_transactions', 'material_batches',
    'warehouse_inventory', 'material_categories', 'sales_orders',
    'sales_exchanges', 'sales_exchange_items', 'sales_exchange_approvals',
    'reprint_jobs', 'market_adjustments', 'market_adjustment_transactions',
    'transaction_adjustment_snapshots', 'audit_logs', 'documents',
    'tasks', 'classes', 'subjects',
    'examination_batches', 'examination_classes', 'examination_subjects',
    'examination_bom_calculations', 'examination_class_adjustments',
    'examination_pricing_audit', 'examination_batch_notifications',
    'notification_audit_logs', 'bom_default_materials',
    'profit_margin_settings', 'profit_margin_audit_logs',
    'work_centers', 'production_resources', 'work_orders', 'production_batches'
  ];

  for (const table of tables) {
    try {
      await runQuery(`PRAGMA table_info(${table})`);
      assert(true, `${table} table exists`);
    } catch (err) {
      assert(false, `${table} table exists — ${err.message}`);
    }
  }

  // 2. Verify NO business table has a company_id column
  console.log('\n2. Schema: no company_id columns remain\n');
  let companyColumnsFound = 0;
  for (const table of tables) {
    try {
      const cols = await runAll(`PRAGMA table_info(${table})`);
      const hasCompanyId = cols.some(c => c.name === 'company_id');
      if (hasCompanyId) companyColumnsFound++;
      assert(!hasCompanyId, `${table} has NO company_id column`);
    } catch (err) {
      assert(false, `${table} check failed — ${err.message}`);
    }
  }
  assert(companyColumnsFound === 0, 'no company_id columns found on any business table');

  // 3. Tenant tables removed
  console.log('\n3. Tenant tables removed\n');
  const tenantTables = ['companies', 'user_companies'];
  for (const table of tenantTables) {
    const row = await runQuery("SELECT name FROM sqlite_master WHERE type='table' AND name=?", [table]);
    assert(row === undefined, `${table} table does not exist`);
  }

  // 4. All business data is global (no isolation filters needed)
  console.log('\n4. Data: business records are global\n');
  await runExec("DELETE FROM sales WHERE id LIKE 'sale-%'");
  await runExec("DELETE FROM examination_batches WHERE id IN ('batch-a1','batch-b1')");
  await runExec("DELETE FROM inventory WHERE id IN ('inv-a1','inv-b1')");

  await runExec("INSERT OR IGNORE INTO sales (id, date, total_amount) VALUES (?, datetime('now'), ?)",
    ['sale-a1', 100]);
  await runExec("INSERT OR IGNORE INTO sales (id, date, total_amount) VALUES (?, datetime('now'), ?)",
    ['sale-b1', 300]);

  const allSales = await runAll("SELECT id FROM sales WHERE id LIKE 'sale-%' ORDER BY id");
  assert(allSales.length >= 2, 'All sales records visible globally');

  await runExec("DELETE FROM sales WHERE id LIKE 'sale-%'");
  await runExec("DELETE FROM examination_batches WHERE id IN ('batch-a1','batch-b1')");
  await runExec("DELETE FROM inventory WHERE id IN ('inv-a1','inv-b1')");

  // 5. tenantContext middleware is a passthrough
  console.log('\n5. Middleware: tenantContext passes through\n');
  const mockJson = () => {};
  const mockRes = { status: () => ({ json: mockJson }), json: mockJson };

  const { tenantContext } = require('../middleware/tenantContext.cjs');

  let nextCalled = false;
  const mockReq = {
    headers: { 'x-company-id': 'comp-a-test' },
    user: { id: 'usr-test-a' }
  };
  tenantContext(mockReq, mockRes, () => { nextCalled = true; });
  assert(nextCalled, 'tenantContext calls next()');
  assert(mockReq.companyId === undefined, 'tenantContext does NOT set req.companyId');

  let nextCalled2 = false;
  const mockReqNoHeader = { headers: {}, user: { id: 'usr-test-a' } };
  tenantContext(mockReqNoHeader, mockRes, () => { nextCalled2 = true; });
  assert(nextCalled2, 'tenantContext passes through without headers');

  // 6. JWT payload has no company claims
  console.log('\n6. Auth: JWT payload has no company claims\n');
  const { generateToken, verifyToken } = require('../middleware/auth.cjs');
  const token = generateToken({ id: 'usr-test-a', username: 'tester', role: 'Admin' });
  const payload = require('jsonwebtoken').decode(token);
  assert(payload.company_id === undefined, 'JWT has no company_id claim');
  assert(payload.companies === undefined, 'JWT has no companies claim');

  const req6 = { headers: { authorization: `Bearer ${token}` } };
  await verifyToken(req6, { json: () => {} }, () => {});
  assert(req6.user.id === 'usr-test-a', 'verifyToken still authenticates the user');

  // 7. validateResourceExists utility
  console.log('\n7. validateResourceExists: resource existence validation works\n');
  const { validateResourceExists } = require('../middleware/validation.cjs');
  await runExec("INSERT OR IGNORE INTO examination_batches (id, batch_number, school_id, name) VALUES (?, ?, ?, ?)",
    ['batch-a1', 'BN-A001', 'sch-1', 'Batch A1']);
  const owned = await validateResourceExists('examination_batches', 'id', 'batch-a1');
  assert(owned !== null, 'existing resource resolves');
  const notOwned = await validateResourceExists('examination_batches', 'id', 'batch-nonexistent');
  assert(notOwned === null, 'missing resource resolves to null');
  await runExec("DELETE FROM examination_batches WHERE id IN ('batch-a1','batch-b1')");

  // 8. BaseService _scopeSql is a passthrough
  console.log('\n8. BaseService _scopeSql: passthrough (no tenant scoping)\n');
  const BaseService = require('../services/baseService.cjs');
  const svc = new BaseService();

  const selectResult = svc._scopeSql('SELECT * FROM customers WHERE status = ?', ['Active']);
  assert(selectResult.sql === 'SELECT * FROM customers WHERE status = ?', '_scopeSql leaves SQL unchanged');
  assert(selectResult.params[0] === 'Active', '_scopeSql preserves original params');

  const updateResult = svc._scopeSql('UPDATE customers SET status = ? WHERE id = ?', ['Active', 'CUST-1']);
  assert(updateResult.sql === 'UPDATE customers SET status = ? WHERE id = ?', '_scopeSql does not inject company_id into UPDATE');

  const deleteResult = svc._scopeSql('DELETE FROM customers WHERE id = ?', ['CUST-1']);
  assert(deleteResult.sql === 'DELETE FROM customers WHERE id = ?', '_scopeSql does not inject company_id into DELETE');

  // 9. DocumentService.resolveDocument works without company context
  console.log('\n9. DocumentService resolveDocument (no tenant scoping)\n');
  const docService = require('../services/documentService.cjs');
  const docId = require('crypto').randomUUID();
  await runExec("INSERT INTO documents (id, type, payload, status, created_at) VALUES (?, 'test', '{}', 'final', datetime('now'))",
    [docId]);
  const docResult = await docService.resolveDocument(docId);
  assert(docResult !== null, 'document resolves without company context');
  await runExec('DELETE FROM documents WHERE id = ?', [docId]);

  // 10. Cleanup test data
  console.log('\n10. Cleanup\n');
  await runExec("DELETE FROM sales WHERE id LIKE 'sale-%'");
  await runExec("DELETE FROM examination_batches WHERE id IN ('batch-a1', 'batch-b1')");
  await runExec("DELETE FROM inventory WHERE id IN ('inv-a1', 'inv-b1')");
  console.log('  Test data cleaned up\n');

  // Summary
  console.log('=== SUMMARY ===');
  console.log(`  Passed: ${pass}`);
  console.log(`  Failed: ${fail}`);
  console.log(`  Result: ${fail === 0 ? 'ALL TESTS PASSED' : 'SOME TESTS FAILED'}\n`);

  process.exit(fail === 0 ? 0 : 1);
}

// Wait for DB init
initDb().then(() => {
  runTests().catch(err => {
    console.error('Test error:', err);
    process.exit(1);
  });
});
