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

const runQuery = (query, params = []) =>
  new Promise((resolve, reject) => {
    db.all(query, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows || []);
    });
  });

async function run() {
  const userId = `override-test-${randomUUID().slice(0, 8)}`;
  console.log('--- Examination Override Verification ---');

  const batch = await examinationService.createBatch({
    school_id: 'OVR-SCHOOL-001',
    name: `Override Test Batch ${Date.now()}`,
    academic_year: '2026',
    term: '1',
    exam_type: 'Mid-Term'
  }, userId);

  const cls = await examinationService.createClass(batch.id, {
    class_name: 'Form 3',
    number_of_learners: 120
  });

  await examinationService.createSubject(cls.id, {
    subject_name: 'Mathematics',
    pages: 10,
    extra_copies: 4
  });

  const calculated = await examinationService.calculateBatch(batch.id, {
    trigger: 'MANUAL_TRIGGER',
    userId
  });

  const classAfterCalc = (calculated.classes || []).find((item) => item.id === cls.id);
  if (!classAfterCalc) throw new Error('Class not found after calculation');

  const suggested = Number(classAfterCalc.suggested_cost_per_learner || 0);
  const manual = suggested + 35;
  console.log(`Suggested CPL: ${suggested}, Manual CPL: ${manual}`);

  let deniedError = null;
  try {
    await examinationService.updateClassPricing(
      cls.id,
      {
        is_manual_override: true,
        cost_per_learner: manual,
        override_reason: 'Permission denial path validation'
      },
      {
        userId,
        trigger: 'MANUAL_OVERRIDE',
        canOverrideSuggestedCost: false
      }
    );
  } catch (error) {
    deniedError = error;
  }

  if (!deniedError || !String(deniedError.message || '').toLowerCase().includes('permission')) {
    throw new Error('Expected override permission denial when canOverrideSuggestedCost=false');
  }

  const overridden = await examinationService.updateClassPricing(
    cls.id,
    {
      is_manual_override: true,
      cost_per_learner: manual,
      override_reason: 'Customer negotiated custom learner fee'
    },
    {
      userId,
      trigger: 'MANUAL_OVERRIDE',
      canOverrideSuggestedCost: true
    }
  );

  const classAfterOverride = (overridden.classes || []).find((item) => item.id === cls.id);
  if (!classAfterOverride) throw new Error('Class not found after override');
  if (!Number(classAfterOverride.is_manual_override)) throw new Error('Override flag was not persisted');
  if (Math.abs(Number(classAfterOverride.price_per_learner) - manual) > 0.01) {
    throw new Error(`Expected class CPL about ${manual}, got ${classAfterOverride.price_per_learner}`);
  }

  const classAdjustments = await runQuery(
    'SELECT * FROM examination_class_adjustments WHERE class_id = ?',
    [cls.id]
  );
  const redistributedTotal = classAdjustments.reduce((sum, row) => sum + Number(row.redistributed_amount || 0), 0);
  const expectedAdjustmentTotal = Number(classAfterOverride.adjustment_total_cost || 0);
  if (Math.abs(redistributedTotal - expectedAdjustmentTotal) > 0.01) {
    throw new Error(
      `Redistributed adjustment mismatch. Expected ${expectedAdjustmentTotal}, got ${redistributedTotal}`
    );
  }

  const pricingAudit = await runQuery(
    'SELECT event_type FROM examination_pricing_audit WHERE class_id = ? ORDER BY datetime(created_at) DESC LIMIT 5',
    [cls.id]
  );
  const auditEvents = pricingAudit.map((row) => row.event_type);
  if (!auditEvents.includes('MANUAL_OVERRIDE') || !auditEvents.includes('AUTO_RECALC')) {
    throw new Error(`Expected MANUAL_OVERRIDE and AUTO_RECALC audit events, got ${auditEvents.join(', ')}`);
  }

  console.log('Override flow verified successfully.');
  console.log(`Class total after override: ${classAfterOverride.total_price}`);
  console.log(`Adjustment delta %: ${classAfterOverride.adjustment_delta_percent}`);

  await runRun('DELETE FROM examination_batches WHERE id = ?', [batch.id]);
  console.log('Cleanup done.');
}

run()
  .catch((error) => {
    console.error('Override verification failed:', error);
    process.exitCode = 1;
  })
  .finally(() => {
    db.close();
  });
