const path = require('path');
process.chdir(path.resolve(__dirname, '..'));

const ReferralService = require('../services/referralService.cjs');

const TEST_CUSTOMER_ID = 'test-customer-' + Date.now();
const TEST_REFERRER_ID = 'test-referrer-' + Date.now();
const TEST_INVOICE_ID = 'test-invoice-' + Date.now();
const TEST_ACTOR_ID = 'test-actor-' + Date.now();
const TEST_ACTOR_NAME = 'Test Actor';

const service = new ReferralService();

const run = (sql, params = []) => service._run(sql, params);

let passed = 0;
let failed = 0;

const cleanupIds = {
  customers: [],
  referrals: [],
  rewards: [],
  reversals: [],
  analytics: [],
  settings: [],
  campaigns: [],
  timeline: [],
  auditLogs: []
};

function cleanup(...items) {
  for (const item of items) {
    for (const [table, ids] of Object.entries(item)) {
      cleanupIds[table] = (cleanupIds[table] || []).concat(ids);
    }
  }
}

function assertEqual(actual, expected, msg) {
  if (actual !== expected) {
    console.error(`  FAIL: ${msg} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
    failed++;
  } else {
    console.log(`  PASS: ${msg}`);
    passed++;
  }
}

function assertNotEqual(actual, unexpected, msg) {
  if (actual === unexpected) {
    console.error(`  FAIL: ${msg} — values should differ, got ${JSON.stringify(actual)}`);
    failed++;
  } else {
    console.log(`  PASS: ${msg}`);
    passed++;
  }
}

function assertTruthy(val, msg) {
  if (!val) {
    console.error(`  FAIL: ${msg} — expected truthy, got ${JSON.stringify(val)}`);
    failed++;
  } else {
    console.log(`  PASS: ${msg}`);
    passed++;
  }
}

function assertFalsy(val, msg) {
  if (val) {
    console.error(`  FAIL: ${msg} — expected falsy, got ${JSON.stringify(val)}`);
    failed++;
  } else {
    console.log(`  PASS: ${msg}`);
    passed++;
  }
}

async function assertRejects(fn, msg) {
  try {
    await fn();
    console.error(`  FAIL: ${msg} — expected error but none thrown`);
    failed++;
  } catch {
    console.log(`  PASS: ${msg}`);
    passed++;
  }
}

async function cleanDatabase() {
  const tables = [
    ['referral_timeline', cleanupIds.timeline],
    ['referral_audit_logs', cleanupIds.auditLogs],
    ['referral_reversals', cleanupIds.reversals],
    ['referral_rewards', cleanupIds.rewards],
    ['customer_referrals', cleanupIds.referrals],
    ['referral_analytics', cleanupIds.analytics],
    ['referral_settings', cleanupIds.settings],
    ['referral_campaigns', cleanupIds.campaigns]
  ];
  for (const [table, ids] of tables) {
    for (const id of ids) {
      try { await run(`DELETE FROM ${table} WHERE id = ?`, [id]); } catch {}
    }
  }
  for (const id of cleanupIds.customers) {
    try { await run(`DELETE FROM customers WHERE id = ?`, [id]); } catch {}
  }
}

async function runTests() {
  console.log('=== Referral Service Tests ===\n');

  try {
    // ── Setup: create referral tables if not exist ──
    await run(`CREATE TABLE IF NOT EXISTS customer_referrals (
      id TEXT PRIMARY KEY, customer_id TEXT NOT NULL, referred_by_id TEXT,
      referred_by_name TEXT, referral_code TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','converted','expired','cancelled')),
      pending_invoice_id TEXT, pending_invoice_amount REAL DEFAULT 0,
      converted_invoice_id TEXT, converted_at DATETIME, notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP, deleted_at DATETIME
    )`);
    await run(`CREATE TABLE IF NOT EXISTS referral_rewards (
      id TEXT PRIMARY KEY, referral_id TEXT NOT NULL, customer_id TEXT NOT NULL,
      invoice_id TEXT NOT NULL, invoice_amount REAL DEFAULT 0,
      amount REAL NOT NULL CHECK(amount >= 0),
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','paid','cancelled')),
      approved_at DATETIME, approved_by TEXT, cancelled_at DATETIME, cancelled_by TEXT,
      cancel_reason TEXT, wallet_transaction_id TEXT, notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (referral_id) REFERENCES customer_referrals(id) ON DELETE CASCADE
    )`);
    await run(`CREATE TABLE IF NOT EXISTS referral_timeline (
      id TEXT PRIMARY KEY, referral_id TEXT NOT NULL, event_type TEXT NOT NULL,
      title TEXT NOT NULL, description TEXT, amount REAL, actor_id TEXT, actor_name TEXT,
      metadata_json TEXT, timestamp DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (referral_id) REFERENCES customer_referrals(id) ON DELETE CASCADE
    )`);
    await run(`CREATE TABLE IF NOT EXISTS referral_audit_logs (
      id TEXT PRIMARY KEY,
      entity_type TEXT NOT NULL CHECK(entity_type IN ('referral','reward','campaign','setting','reversal')),
      entity_id TEXT NOT NULL, action TEXT NOT NULL, actor_id TEXT NOT NULL, actor_name TEXT,
      field_name TEXT, old_value TEXT, new_value TEXT, reason TEXT, correlation_id TEXT,
      ip_address TEXT, user_agent TEXT, timestamp DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
    await run(`CREATE TABLE IF NOT EXISTS referral_analytics (
      id TEXT PRIMARY KEY,
      period TEXT NOT NULL CHECK(period IN ('daily','weekly','monthly','quarterly','yearly')),
      period_start TEXT NOT NULL, period_end TEXT NOT NULL, total_referrals INTEGER DEFAULT 0,
      active_referrals INTEGER DEFAULT 0, converted_referrals INTEGER DEFAULT 0,
      total_rewards_amount REAL DEFAULT 0, approved_rewards_amount REAL DEFAULT 0,
      paid_rewards_amount REAL DEFAULT 0, pending_rewards_amount REAL DEFAULT 0,
      average_reward_amount REAL DEFAULT 0, conversion_rate REAL DEFAULT 0,
      revenue_attributed REAL DEFAULT 0, roi REAL DEFAULT 0, data_json TEXT,
      generated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
    await run(`CREATE TABLE IF NOT EXISTS referral_reversals (
      id TEXT PRIMARY KEY, reward_id TEXT NOT NULL, reason TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected','completed')),
      requested_by TEXT NOT NULL, requested_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      approved_by TEXT, approved_at DATETIME, rejected_by TEXT, rejected_at DATETIME,
      reject_reason TEXT, completed_at DATETIME, wallet_transaction_id TEXT, notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (reward_id) REFERENCES referral_rewards(id) ON DELETE CASCADE
    )`);
    await run(`CREATE TABLE IF NOT EXISTS referral_settings (
      id TEXT PRIMARY KEY, settings_json TEXT NOT NULL DEFAULT '{}',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    )`);

    // ── Setup: create a customer ──
    await run(
      `INSERT OR IGNORE INTO customers (id, name, email)
       VALUES (?, ?, ?)`,
      [TEST_CUSTOMER_ID, 'Test Customer', 'cust@test.com']
    );
    await run(`UPDATE customers SET walletBalance = 0 WHERE id = ?`, [TEST_CUSTOMER_ID]);
    cleanup({ customers: [TEST_CUSTOMER_ID] });

    // ── 1. register() – creates a referral with valid data ──
    {
      const referral = await service.register({
        customer_id: TEST_CUSTOMER_ID,
        referred_by_id: TEST_REFERRER_ID,
        referred_by_name: 'John Referrer',
        notes: 'Welcome referral'
      });

      assertTruthy(referral, 'register() returns a referral');
      assertEqual(referral.status, 'active', 'referral status is active');
      assertEqual(referral.customer_id, TEST_CUSTOMER_ID, 'referral customer_id matches');
      assertEqual(referral.referred_by_id, TEST_REFERRER_ID, 'referral referred_by_id matches');
      assertEqual(referral.referred_by_name, 'John Referrer', 'referral referred_by_name matches');
      assertEqual(referral.notes, 'Welcome referral', 'referral notes match');
      assertTruthy(referral.id, 'referral has an id');
      assertTruthy(referral.referral_code, 'referral has a referral_code');

      const timeline = await service.getTimeline(referral.id);
      assertTruthy(timeline.length >= 1, 'timeline entry created for registration');
      assertEqual(timeline[0].event_type, 'created', 'timeline event type is created');

      cleanup({ referrals: [referral.id], timeline: timeline.map(t => t.id), auditLogs: [referral.id + '-audit'] });

      let ref1 = referral;
      // Store for later tests
      global._referral1 = ref1;
    }

    // ── 2. register() – rejects self-referral ──
    {
      await assertRejects(() =>
        service.register({
          customer_id: TEST_CUSTOMER_ID,
          referred_by_id: TEST_CUSTOMER_ID
        }),
        'register() rejects self-referral'
      );
    }

    // ── 3. register() – generates unique referral codes ──
    {
      const r2 = await service.register({
        customer_id: 'test-customer-2-' + Date.now(),
        referred_by_id: 'test-referrer-2-' + Date.now(),
        referred_by_name: 'Jane Referrer'
      });

      const r3 = await service.register({
        customer_id: 'test-customer-3-' + Date.now(),
        referred_by_id: 'test-referrer-3-' + Date.now(),
        referred_by_name: 'Bob Referrer'
      });

      assertTruthy(r2.referral_code, 'r2 has a referral_code');
      assertTruthy(r3.referral_code, 'r3 has a referral_code');
      assertNotEqual(r2.referral_code, r3.referral_code, 'two referrals get different codes');
      assertEqual(r2.referral_code.length, 8, 'referral code is 8 chars');
      assertEqual(r3.referral_code.length, 8, 'referral code is 8 chars');

      cleanup({ referrals: [r2.id, r3.id] });

      const t2 = await service.getTimeline(r2.id);
      const t3 = await service.getTimeline(r3.id);
      cleanup({ timeline: [...t2.map(t => t.id), ...t3.map(t => t.id)] });

      global._referral2 = r2;
      global._referral3 = r3;
    }

    // ── 4. getAll() – returns paginated referrals ──
    {
      const result = await service.getAll({ page: 1, limit: 10 });
      assertTruthy(result, 'getAll() returns result');
      assertEqual(result.page, 1, 'getAll page is 1');
      assertEqual(result.limit, 10, 'getAll limit is 10');
      assertTruthy(result.total >= 3, `getAll total >= 3, got ${result.total}`);
      assertTruthy(result.totalPages >= 1, 'getAll totalPages >= 1');
      assertTruthy(Array.isArray(result.referrals), 'getAll referrals is array');
      assertTruthy(result.referrals.length >= 3, `getAll referrals length >= 3, got ${result.referrals.length}`);
    }

    // ── 5. getAll() – filters by status ──
    {
      const active = await service.getAll({ status: 'active' });
      assertTruthy(active.referrals.length >= 3, `filter by active status, got ${active.referrals.length}`);
      active.referrals.forEach(r => assertEqual(r.status, 'active', `referral ${r.id} status is active`));
    }

    // ── 6. getAll() – filters by search ──
    {
      const searched = await service.getAll({ search: 'John' });
      assertTruthy(searched.referrals.length >= 1, `search by name "John" found ${searched.referrals.length}`);
    }

    // ── 7. getAll() – filters by customer_id ──
    {
      const filtered = await service.getAll({ customer_id: TEST_CUSTOMER_ID });
      assertTruthy(filtered.referrals.length >= 1, `filter by customer_id found ${filtered.referrals.length}`);
      filtered.referrals.forEach(r => assertEqual(r.customer_id, TEST_CUSTOMER_ID, 'customer_id matches filter'));
    }

    // ── 8. getById() – returns single referral ──
    {
      const found = await service.getById(global._referral1.id);
      assertTruthy(found, 'getById() returns a referral');
      assertEqual(found.id, global._referral1.id, 'getById id matches');
      assertEqual(found.customer_id, TEST_CUSTOMER_ID, 'getById customer_id matches');
    }

    // ── 9. getById() – returns null for non-existent ──
    {
      const missing = await service.getById('non-existent-id');
      assertFalsy(missing, 'getById() returns null for non-existent id');
    }

    // ── 10. update() – updates referral fields ──
    {
      const updated = await service.update(global._referral1.id, {
        notes: 'Updated notes',
        pending_invoice_id: 'inv-pending-001',
        pending_invoice_amount: 500
      });

      assertEqual(updated.notes, 'Updated notes', 'update() changes notes');
      assertEqual(updated.pending_invoice_id, 'inv-pending-001', 'update() changes pending_invoice_id');
      assertEqual(updated.pending_invoice_amount, 500, 'update() changes pending_invoice_amount');
      assertEqual(updated.status, 'active', 'update() preserves status when not changed');
    }

    // ── 11. cancel() – cancels active referral ──
    {
      const r4 = await service.register({
        customer_id: 'test-customer-4-' + Date.now(),
        referred_by_id: 'test-referrer-4-' + Date.now(),
        referred_by_name: 'Cancel Test'
      });

      const cancelled = await service.cancel(r4.id, TEST_ACTOR_ID, TEST_ACTOR_NAME, 'No longer needed');
      assertEqual(cancelled.status, 'cancelled', 'cancel() sets status to cancelled');

      const timeline = await service.getTimeline(r4.id);
      const cancelledEntry = timeline.find(e => e.event_type === 'referral_cancelled');
      assertTruthy(cancelledEntry, 'cancel creates timeline event');

      cleanup({ referrals: [r4.id], timeline: timeline.map(t => t.id) });
    }

    // ── 12. cancel() – throws on already cancelled ──
    {
      const r5 = await service.register({
        customer_id: 'test-customer-5-' + Date.now(),
        referred_by_id: 'test-referrer-5-' + Date.now(),
        referred_by_name: 'Double Cancel'
      });

      await service.cancel(r5.id, TEST_ACTOR_ID, TEST_ACTOR_NAME, null);
      await assertRejects(() =>
        service.cancel(r5.id, TEST_ACTOR_ID, TEST_ACTOR_NAME, null),
        'cancel() throws on already cancelled referral'
      );

      const t5 = await service.getTimeline(r5.id);
      cleanup({ referrals: [r5.id], timeline: t5.map(t => t.id) });
    }

    // ── 13. expire() – expires active referral ──
    {
      const r6 = await service.register({
        customer_id: 'test-customer-6-' + Date.now(),
        referred_by_id: 'test-referrer-6-' + Date.now(),
        referred_by_name: 'Expire Test'
      });

      const expired = await service.expire(r6.id);
      assertEqual(expired.status, 'expired', 'expire() sets status to expired');

      const timeline = await service.getTimeline(r6.id);
      const expiredEntry = timeline.find(e => e.event_type === 'referral_expired');
      assertTruthy(expiredEntry, 'expire creates timeline event');

      cleanup({ referrals: [r6.id], timeline: timeline.map(t => t.id) });
    }

    // ── 14. createReward() – creates reward with calculated amount ──
    {
      await service.updateSettings({
        enabled: true,
        rewardType: 'percentage',
        rewardValue: 0,
        rewardPercentage: 10,
        minPurchaseAmount: 0,
        maxRewardAmount: 0,
        requireApproval: true,
        autoApproveThreshold: 100,
        selfReferralPrevention: true
      });

      const reward = await service.createReward({
        referral_id: global._referral1.id,
        customer_id: TEST_CUSTOMER_ID,
        invoice_id: TEST_INVOICE_ID,
        invoice_amount: 1000
      });

      assertTruthy(reward, 'createReward() returns a reward');
      assertEqual(reward.status, 'pending', 'reward status is pending');
      assertEqual(reward.referral_id, global._referral1.id, 'reward referral_id matches');
      assertEqual(reward.customer_id, TEST_CUSTOMER_ID, 'reward customer_id matches');
      assertEqual(reward.invoice_id, TEST_INVOICE_ID, 'reward invoice_id matches');
      assertEqual(reward.amount, 100, 'reward amount is 10% of 1000 = 100');
      assertEqual(reward.invoice_amount, 1000, 'reward invoice_amount matches');

      cleanup({ rewards: [reward.id] });

      let r1Timeline = await service.getTimeline(global._referral1.id);
      cleanup({ timeline: r1Timeline.map(t => t.id) });

      global._reward1 = reward;
    }

    // ── 15. createReward() – throws for non-active referral ──
    {
      await assertRejects(() =>
        service.createReward({
          referral_id: 'non-existent-referral',
          customer_id: TEST_CUSTOMER_ID,
          invoice_id: 'inv-xxx',
          invoice_amount: 500
        }),
        'createReward() throws for non-existent referral'
      );
    }

    // ── 16. createReward() – creates reward with custom amount ──
    {
      const reward = await service.createReward({
        referral_id: global._referral2.id,
        customer_id: 'test-customer-2',
        invoice_id: 'inv-custom-001',
        invoice_amount: 200,
        amount: 50
      });

      assertEqual(reward.amount, 50, 'createReward with custom amount uses 50');
      assertEqual(reward.invoice_amount, 200, 'reward invoice_amount matches input');

      cleanup({ rewards: [reward.id] });

      let r2Timeline = await service.getTimeline(global._referral2.id);
      cleanup({ timeline: r2Timeline.map(t => t.id) });

      global._rewardCustom = reward;
    }

    // ── 17. getAllRewards() – returns paginated rewards ──
    {
      const result = await service.getAllRewards({ page: 1, limit: 10 });
      assertTruthy(result, 'getAllRewards() returns result');
      assertTruthy(result.total >= 2, `getAllRewards total >= 2, got ${result.total}`);
      assertTruthy(Array.isArray(result.rewards), 'getAllRewards rewards is array');
      assertEqual(result.page, 1, 'getAllRewards page is 1');
    }

    // ── 18. getPendingRewards() – returns only pending ──
    {
      const pending = await service.getPendingRewards();
      assertTruthy(Array.isArray(pending), 'getPendingRewards returns array');
      assertTruthy(pending.length >= 2, `getPendingRewards length >= 2, got ${pending.length}`);
      pending.forEach(r => assertEqual(r.status, 'pending', 'pending reward status is pending'));
    }

    // ── 19. approveReward() – approves and credits wallet ──
    {
      const approved = await service.approveReward(global._reward1.id, TEST_ACTOR_ID);
      assertEqual(approved.status, 'approved', 'approveReward sets status to approved');
      assertEqual(approved.approved_by, TEST_ACTOR_ID, 'approveReward records approved_by');

      const referral = await service.getById(global._reward1.referral_id);
      assertEqual(referral.status, 'converted', 'referral status becomes converted after reward approval');
      assertEqual(referral.converted_invoice_id, TEST_INVOICE_ID, 'referral converted_invoice_id is set');

      const timeline = await service.getTimeline(referral.id);
      const rewardApproved = timeline.find(e => e.event_type === 'reward_approved');
      assertTruthy(rewardApproved, 'reward_approved timeline entry exists');
    }

    // ── 20. approveReward() – throws on already approved ──
    {
      await assertRejects(() =>
        service.approveReward(global._reward1.id, TEST_ACTOR_ID),
        'approveReward() throws on already approved reward'
      );
    }

    // ── 21. rejectReward() – rejects pending reward ──
    {
      const r7 = await service.register({
        customer_id: 'test-customer-7-' + Date.now(),
        referred_by_id: 'test-referrer-7-' + Date.now(),
        referred_by_name: 'Reject Test'
      });

      const reward = await service.createReward({
        referral_id: r7.id,
        customer_id: 'test-customer-7',
        invoice_id: 'inv-reject-001',
        invoice_amount: 300,
        amount: 30
      });

      const rejected = await service.rejectReward(reward.id, 'Fraud suspected', TEST_ACTOR_ID);
      assertEqual(rejected.status, 'cancelled', 'rejectReward sets status to cancelled');
      assertEqual(rejected.cancelled_by, TEST_ACTOR_ID, 'rejectReward records cancelled_by');
      assertEqual(rejected.cancel_reason, 'Fraud suspected', 'rejectReward records cancel_reason');

      cleanup({ referrals: [r7.id], rewards: [reward.id] });
      const t7 = await service.getTimeline(r7.id);
      cleanup({ timeline: t7.map(t => t.id) });
    }

    // ── 22. createReversal() – creates reversal request ──
    {
      const reversal = await service.createReversal({
        reward_id: global._rewardCustom.id,
        reason: 'Customer returned items',
        requested_by: TEST_ACTOR_ID,
        notes: 'Full refund issued'
      });

      assertTruthy(reversal, 'createReversal() returns a reversal');
      assertEqual(reversal.reward_id, global._rewardCustom.id, 'reversal reward_id matches');
      assertEqual(reversal.status, 'pending', 'reversal status is pending');
      assertEqual(reversal.reason, 'Customer returned items', 'reversal reason matches');
      assertEqual(reversal.requested_by, TEST_ACTOR_ID, 'reversal requested_by matches');

      cleanup({ reversals: [reversal.id] });

      global._reversal1 = reversal;
    }

    // ── 23. approveReversal() – approves reversal ──
    {
      const approved = await service.approveReversal(global._reversal1.id, TEST_ACTOR_ID, 'Reversal approved after review');
      assertTruthy(approved, 'approveReversal() returns result');
      assertEqual(approved.status, 'completed', 'approveReversal sets status to completed');
    }

    // ── 24. getAnalytics() – returns analytics data ──
    {
      const today = new Date().toISOString().slice(0, 10);
      const analytics = await service.getAnalytics({
        period: 'daily',
        period_start: today,
        period_end: today
      });

      assertTruthy(analytics, 'getAnalytics() returns analytics');
      assertTruthy(analytics.total_referrals >= 1, `analytics total_referrals >= 1, got ${analytics.total_referrals}`);
      assertTruthy(analytics.converted_referrals >= 1, `analytics converted_referrals >= 1, got ${analytics.converted_referrals}`);
    }

    // ── 25. generateAnalytics() – calculates and stores analytics ──
    {
      const today = new Date().toISOString().slice(0, 10);
      const analytics = await service.generateAnalytics('daily', today, today);

      assertTruthy(analytics, 'generateAnalytics() returns analytics');
      assertEqual(analytics.period, 'daily', 'analytics period is daily');
      assertEqual(analytics.period_start, today, 'analytics period_start matches');
      assertEqual(analytics.period_end, today, 'analytics period_end matches');
      assertTruthy(analytics.id, 'analytics has an id');

      cleanup({ analytics: [analytics.id] });

      const history = await service.getAnalyticsHistory({});
      assertTruthy(Array.isArray(history), 'getAnalyticsHistory returns array');
      assertTruthy(history.length >= 1, 'getAnalyticsHistory has entries');
    }

    // ── 26. getSettings() – returns default settings ──
    {
      const settings = await service.getSettings();
      assertTruthy(settings, 'getSettings() returns default settings');
      assertEqual(settings.enabled, true, 'default settings enabled is true');
      assertEqual(settings.rewardType, 'percentage', 'default rewardType is percentage');
      assertEqual(settings.rewardPercentage, 5, 'default rewardPercentage is 5');
      assertEqual(settings.minPurchaseAmount, 0, 'default minPurchaseAmount is 0');
      assertEqual(settings.maxRewardAmount, 0, 'default maxRewardAmount is 0');
      assertEqual(settings.requireApproval, true, 'default requireApproval is true');
      assertEqual(settings.selfReferralPrevention, true, 'default selfReferralPrevention is true');
      assertEqual(settings.expiryDays, 365, 'default expiryDays is 365');
      assertEqual(settings.allowMultipleRewards, true, 'default allowMultipleRewards is true');
    }

    // ── 27. updateSettings() – saves settings ──
    {
      const updated = await service.updateSettings({
        enabled: false,
        rewardType: 'fixed',
        rewardValue: 25,
        minPurchaseAmount: 50,
        maxRewardAmount: 200,
        requireApproval: false,
        expiryDays: 180
      });

      assertEqual(updated.enabled, false, 'updateSettings changed enabled');
      assertEqual(updated.rewardType, 'fixed', 'updateSettings changed rewardType');
      assertEqual(updated.rewardValue, 25, 'updateSettings changed rewardValue');
      assertEqual(updated.minPurchaseAmount, 50, 'updateSettings changed minPurchaseAmount');
      assertEqual(updated.maxRewardAmount, 200, 'updateSettings changed maxRewardAmount');
      assertEqual(updated.requireApproval, false, 'updateSettings changed requireApproval');
      assertEqual(updated.expiryDays, 180, 'updateSettings changed expiryDays');

      const fetched = await service.getSettings();
      assertEqual(fetched.enabled, false, 'settings persist after getSettings');
    }

    console.log(`\n=== All ${passed + failed} tests completed ===`);

  } catch (err) {
    console.error('Test suite error:', err);
    failed++;
  } finally {
    await cleanDatabase();
    console.log(`\nResults: ${passed} passed, ${failed} failed`);
    process.exit(failed > 0 ? 1 : 0);
  }
}

runTests();
