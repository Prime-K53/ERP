const { db } = require('../db.cjs');
const examinationService = require('../services/examinationService.cjs');
const { randomUUID } = require('crypto');

const runRun = (query, params = []) =>
  new Promise((resolve, reject) => {
    db.run(query, params, function onRun(err) {
      if (err) reject(err);
      else resolve(this);
    });
  });

const runGet = (query, params = []) =>
  new Promise((resolve, reject) => {
    db.get(query, params, (err, row) => {
      if (err) reject(err);
      else resolve(row || null);
    });
  });

async function run() {
  const userId = `pricing-lock-${randomUUID().slice(0, 8)}`;
  const adjustmentId = `LOCK-ADJ-${randomUUID().slice(0, 8)}`;
  let batchId = null;

  console.log('--- Examination Pricing Lock Verification ---');

  try {
    const batch = await examinationService.createBatch({
      school_id: 'LOCK-SCHOOL-001',
      name: `Pricing Lock Test ${Date.now()}`,
      academic_year: '2026',
      term: '1',
      exam_type: 'Final'
    }, userId);
    batchId = batch.id;

    const cls = await examinationService.createClass(batch.id, {
      class_name: 'Form 4',
      number_of_learners: 80
    });

    await examinationService.createSubject(cls.id, {
      subject_name: 'Mathematics',
      pages: 12,
      extra_copies: 3
    });

    await runRun(
      `INSERT INTO market_adjustments (id, name, type, value, percentage, active, is_active, sort_order)
       VALUES (?, ?, ?, ?, ?, 1, 1, 1)
       ON CONFLICT(id) DO UPDATE SET
         name = excluded.name,
         type = excluded.type,
         value = excluded.value,
         percentage = excluded.percentage,
         active = 1,
         is_active = 1,
         sort_order = 1`,
      [adjustmentId, 'Lock Test Adjustment', 'PERCENTAGE', 10, 10]
    );

    const calculatedBeforeLock = await examinationService.calculateBatch(batch.id, {
      trigger: 'LOCK_TEST_INITIAL',
      userId
    });
    const classBeforeLock = (calculatedBeforeLock.classes || []).find((item) => item.id === cls.id);
    if (!classBeforeLock) throw new Error('Class not found before pricing lock.');

    const suggestedBefore = Number(classBeforeLock.suggested_cost_per_learner || 0);
    const finalBefore = Number(classBeforeLock.price_per_learner || 0);
    if (suggestedBefore <= 0 || finalBefore <= 0) {
      throw new Error(`Unexpected pricing before lock: suggested=${suggestedBefore}, final=${finalBefore}`);
    }

    await examinationService.updateExamPricingSettings(
      {
        trigger_recalculate: false,
        lock_batch_id: batch.id,
        lock_pricing_snapshot: true,
        lock_reason: 'Pricing lock verification script'
      },
      { userId }
    );

    const lockedBatch = await examinationService.getBatchById(batch.id);
    if (!Number(lockedBatch?.pricing_lock_enabled || 0)) {
      throw new Error('Batch pricing lock was not enabled.');
    }

    await runRun(
      `UPDATE market_adjustments
       SET value = ?, percentage = ?
       WHERE id = ?`,
      [250, 250, adjustmentId]
    );

    const recalculatedAfterChange = await examinationService.calculateBatch(batch.id, {
      trigger: 'LOCK_TEST_RECALC_AFTER_CHANGE',
      userId
    });
    const classAfterChange = (recalculatedAfterChange.classes || []).find((item) => item.id === cls.id);
    if (!classAfterChange) throw new Error('Class not found after pricing lock recalc.');

    const suggestedAfter = Number(classAfterChange.suggested_cost_per_learner || 0);
    const finalAfter = Number(classAfterChange.price_per_learner || 0);

    if (Math.abs(suggestedAfter - suggestedBefore) > 0.01) {
      throw new Error(`Suggested CPL changed after adjustment update. Before=${suggestedBefore}, After=${suggestedAfter}`);
    }
    if (Math.abs(finalAfter - finalBefore) > 0.01) {
      throw new Error(`Final CPL changed after adjustment update. Before=${finalBefore}, After=${finalAfter}`);
    }

    console.log('Pricing lock verified successfully.');
    console.log(`Suggested CPL stayed at ${suggestedAfter}.`);
    console.log(`Final CPL stayed at ${finalAfter}.`);
  } finally {
    await runRun('DELETE FROM market_adjustments WHERE id = ?', [adjustmentId]).catch(() => {});
    if (batchId) {
      await runRun('DELETE FROM examination_batches WHERE id = ?', [batchId]).catch(() => {});
    }
    db.close();
  }
}

run().catch((error) => {
  console.error('Pricing lock verification failed:', error);
  process.exitCode = 1;
});
