/**
 * Single-Organization Request Context Integration Tests
 *
 * Verifies the single-organization architecture:
 * 1. tenantContext passes requests through without setting company context.
 * 2. JWT tokens carry no company_id/companies claims.
 * 3. x-company-id headers are ignored (no company switching possible).
 * 4. Authentication still works for all users.
 */

// Suppress unhandled Statement errors from migration (db.serialize async errors)
process.on('uncaughtException', () => {});
process.on('unhandledRejection', () => {});

const { db, initDb } = require('../../db.cjs');
const { generateToken, verifyToken } = require('../../middleware/auth.cjs');
const { tenantContext } = require('../../middleware/tenantContext.cjs');

const USER_A_ID = 'usr-multi-a';
const USER_B_ID = 'usr-multi-b';

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

function runExec(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function(err) {
      if (err) reject(err);
      else resolve(this);
    });
  });
}

async function cleanup() {
  await runExec('DELETE FROM users WHERE id IN (?, ?)', [USER_A_ID, USER_B_ID]);
}

function makeRes() {
  const responses = [];
  const res = {
    status: (code) => {
      responses.push(code);
      return { json: (body) => { responses.push(body); } };
    },
    json: (body) => { responses.push(body); },
    get responses() { return responses; }
  };
  return res;
}

async function runTests() {
  console.log('\n=== SINGLE-ORGANIZATION REQUEST CONTEXT TESTS ===\n');

  await runExec('INSERT OR IGNORE INTO users (id, username, email, password_hash, role, permissions) VALUES (?, ?, ?, ?, ?, ?)',
    [USER_A_ID, 'user_a', 'user_a@test.local', 'hash', 'User', '[]']);
  await runExec('INSERT OR IGNORE INTO users (id, username, email, password_hash, role, permissions) VALUES (?, ?, ?, ?, ?, ?)',
    [USER_B_ID, 'user_b', 'user_b@test.local', 'hash', 'User', '[]']);

  // Test 1: JWT has no company claims
  console.log('1. JWT payload carries no company context\n');
  const tokenA = generateToken({ id: USER_A_ID, username: 'user_a', email: 'user_a@test.local', role: 'User' });
  const payloadA = require('jsonwebtoken').decode(tokenA);
  assert(payloadA.company_id === undefined, 'JWT has no company_id claim');
  assert(payloadA.companies === undefined, 'JWT has no companies claim');

  // Test 2: tenantContext passes through with x-company-id header
  console.log('2. x-company-id header is ignored\n');
  const req1Base = { headers: { authorization: `Bearer ${tokenA}` } };
  await verifyToken(req1Base, { json: () => {} }, () => {});

  let req2 = {
    headers: { 'x-company-id': 'comp-a-test' },
    user: req1Base.user,
    path: '/api/sales'
  };
  let nextCalled = false;
  await tenantContext(req2, makeRes(), () => { nextCalled = true; });
  assert(nextCalled, 'tenantContext calls next() with header present');
  assert(req2.companyId === undefined, 'req.companyId is NOT set from header');

  // Test 3: tenantContext passes through with a different x-company-id
  console.log('3. Different x-company-id header also ignored\n');
  let req3 = {
    headers: { 'x-company-id': 'comp-b-test' },
    user: req1Base.user,
    path: '/api/sales'
  };
  let next3Called = false;
  await tenantContext(req3, makeRes(), () => { next3Called = true; });
  assert(next3Called, 'tenantContext calls next() for any header value');
  assert(req3.companyId === undefined, 'req.companyId is NOT set (no company switching)');

  // Test 4: Unauthenticated request passes through
  console.log('4. Unauthenticated request passes through\n');
  let req4 = {
    headers: {},
    user: null,
    path: '/api/auth/login'
  };
  let next4Called = false;
  await tenantContext(req4, makeRes(), () => { next4Called = true; });
  assert(next4Called, 'Unauthenticated request passes through');

  // Test 5: Auth endpoints pass through with authenticated user
  console.log('5. Auth endpoints skip context handling\n');
  let req5 = {
    headers: {},
    user: req1Base.user,
    path: '/auth/login'
  };
  let next5Called = false;
  await tenantContext(req5, makeRes(), () => { next5Called = true; });
  assert(next5Called, 'Auth endpoint passes through even with authenticated user');

  // Test 6: verifyToken works for both users regardless of headers
  console.log('6. Authentication works for all users\n');
  const tokenB = generateToken({ id: USER_B_ID, username: 'user_b', email: 'user_b@test.local', role: 'User' });
  const reqBBase = { headers: { authorization: `Bearer ${tokenB}` } };
  await verifyToken(reqBBase, { json: () => {} }, () => {});
  assert(reqBBase.user.id === USER_B_ID, 'User B authenticates successfully');

  await cleanup();

  // Summary
  console.log('\n=== SUMMARY ===');
  console.log(`  Passed: ${pass}`);
  console.log(`  Failed: ${fail}`);
  console.log(`  Result: ${fail === 0 ? 'ALL TESTS PASSED' : 'SOME TESTS FAILED'}\n`);

  process.exit(fail === 0 ? 0 : 1);
}

initDb().then(() => {
  runTests().catch(err => {
    console.error('Test error:', err);
    process.exit(1);
  });
});
