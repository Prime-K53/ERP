
const { db } = require('../db.cjs');
const examinationService = require('../services/examinationService.cjs');

const runRun = (query, params = []) => {
  return new Promise((resolve, reject) => {
    db.run(query, params, function (err) {
      if (err) reject(err);
      else resolve(this);
    });
  });
};

const runGet = (query, params = []) => {
  return new Promise((resolve, reject) => {
    db.get(query, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
};

const verifyPricing = async () => {
  try {
    console.log('Verifying Examination Pricing Calculations...');

    // 1. Ensure Inventory Items (Paper and Toner)
    // Clear existing items by material to avoid unique constraint violation
    await runRun(`DELETE FROM inventory WHERE material IN (?, ?)`, ['Paper', 'Toner']);
    await runRun(`DELETE FROM inventory WHERE id IN (?, ?)`, [1001, 1002]);

    // Using Integer IDs because schema has INTEGER PRIMARY KEY
    const paperId = 1001; 
    await runRun(`INSERT INTO inventory (id, name, material, quantity, cost_per_unit, conversion_rate, reorder_point, unit) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [paperId, 'A4 Paper Ream', 'Paper', 100, 5000, 500, 10, 'Ream']
    );

    const tonerId = 1002;
    await runRun(`INSERT INTO inventory (id, name, material, quantity, cost_per_unit, conversion_rate, reorder_point, unit) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [tonerId, 'HP Toner Cartridge', 'Toner', 50, 150000, 500, 5, 'Cartridge']
    );

    // Ensure deterministic active adjustments for formula verification.
    await runRun(`UPDATE market_adjustments SET active = 0, is_active = 0`);
    await runRun(`DELETE FROM market_adjustments WHERE id IN (?, ?)`, ['BOM-TEST-PCT', 'BOM-TEST-FIX']);
    await runRun(
      `INSERT INTO market_adjustments (id, name, type, value, percentage, active, is_active, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      ['BOM-TEST-PCT', 'Markup 10%', 'PERCENTAGE', 10, 10, 1, 1, 1]
    );
    await runRun(
      `INSERT INTO market_adjustments (id, name, type, value, percentage, active, is_active, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      ['BOM-TEST-FIX', 'Page Fee', 'FIXED', 2, 0, 1, 1, 2]
    );

    await examinationService.updateExamPricingSettings({
      paper_item_id: String(paperId),
      toner_item_id: String(tonerId),
      conversion_rate: 500,
      trigger_recalculate: false
    }, { userId: 'System' });

    // 2. Create Batch
    const batch = await examinationService.createBatch({
      school_id: 'test-school-bom',
      name: 'BOM Test Batch',
      academic_year: '2026',
      term: '3',
      exam_type: 'End-Term'
    });
    console.log('Batch created:', batch.id);

    // 3. Add Class
    const cls = await examinationService.createClass(batch.id, {
      class_name: 'Form 4',
      number_of_learners: 100
    });
    console.log('Class created:', cls.id);

    // 4. Add Subjects
    await examinationService.createSubject(cls.id, {
      name: 'Mathematics',
      paper_size: 'A4',
      pages: 10,
      orientation: 'Portrait'
    });
    
    await examinationService.createSubject(cls.id, {
      name: 'English',
      paper_size: 'A4',
      pages: 8,
      orientation: 'Portrait'
    });
    console.log('Subjects added.');

    // 5. Calculate Batch
    console.log('Calculating batch...');
    const calculated = await examinationService.calculateBatch(batch.id);
    const calculatedClass = (calculated.classes || [])[0];

    if (!calculatedClass) {
      throw new Error('Calculated class missing');
    }

    console.log('Computed material_total_cost:', calculatedClass.material_total_cost);
    console.log('Computed adjustment_total_cost:', calculatedClass.adjustment_total_cost);
    console.log('Computed suggested_cost_per_learner:', calculatedClass.suggested_cost_per_learner);

    // Expected values for this fixture:
    // sheets = 900, pages = 1800, paper_cost = 9000, toner_cost = 13500 => BOM = 22500
    // percentage (10%) = 2250, fixed (2/page) = 3600 => base adjustments = 5850
    // base expected per learner = (22500 + 5850) / 100 = 283.5
    // active-adjustment rounding applies to nearest 50 => 300 per learner,
    // rounding delta = 16.5 * 100 = 1650, final adjustments = 7500
    if (Math.abs(Number(calculatedClass.material_total_cost || 0) - 22500) > 0.01) {
      throw new Error('material_total_cost formula mismatch');
    }
    if (Math.abs(Number(calculatedClass.adjustment_total_cost || 0) - 7500) > 0.01) {
      throw new Error('adjustment_total_cost formula mismatch');
    }
    if (Math.abs(Number(calculatedClass.suggested_cost_per_learner || 0) - 300) > 0.01) {
      throw new Error('suggested_cost_per_learner formula mismatch');
    }

    const persistedSubject = await runGet('SELECT total_sheets, total_pages FROM examination_subjects WHERE class_id = ? LIMIT 1', [cls.id]);
    if (!persistedSubject || Number(persistedSubject.total_sheets || 0) <= 0 || Number(persistedSubject.total_pages || 0) <= 0) {
      throw new Error('Subject totals were not persisted');
    }

    console.log('Pricing Verification Passed!');

  } catch (error) {
    console.error('Verification Failed:', error);
  } finally {
    db.close();
  }
};

verifyPricing();
