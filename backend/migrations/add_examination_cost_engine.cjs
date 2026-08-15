/**
 * Migration: Examination Batch Cost Engine
 *
 * Adds:
 * - Extended pricing columns on examination_batches and examination_classes
 * - Adjustment metadata columns on examination_bom_calculations
 * - examination_class_adjustments table
 * - examination_pricing_audit table
 *
 * Run:
 *   node server/migrations/add_examination_cost_engine.cjs
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.resolve(__dirname, '../examination.db');
const db = new sqlite3.Database(dbPath);

const run = (sql) =>
  new Promise((resolve, reject) => {
    db.run(sql, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });

const all = (sql) =>
  new Promise((resolve, reject) => {
    db.all(sql, (err, rows) => {
      if (err) reject(err);
      else resolve(rows || []);
    });
  });

const addColumnIfMissing = async (tableName, columnName, columnType) => {
  const columns = await all(`PRAGMA table_info(${tableName})`);
  const exists = columns.some((column) => column.name === columnName);
  if (exists) {
    console.log(`- ${tableName}.${columnName} already exists`);
    return;
  }
  await run(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${columnType}`);
  console.log(`+ Added ${tableName}.${columnName}`);
};

const createTableIfMissing = async (tableName, createSql) => {
  await run(createSql);
  console.log(`+ Ensured table ${tableName}`);
};

const createIndexIfMissing = async (indexSql, indexName) => {
  await run(indexSql);
  console.log(`+ Ensured index ${indexName}`);
};

async function migrate() {
  console.log('[Migration] Starting examination cost engine migration...');

  const batchColumns = [
    ['calculated_material_total', 'REAL DEFAULT 0'],
    ['calculated_adjustment_total', 'REAL DEFAULT 0'],
    ['expected_candidature', 'INTEGER DEFAULT 0'],
    ['calculated_cost_per_learner', 'REAL DEFAULT 0'],
    ['calculation_trigger', 'TEXT'],
    ['calculation_duration_ms', 'INTEGER DEFAULT 0'],
    ['last_calculated_at', 'DATETIME']
  ];

  const classColumns = [
    ['suggested_cost_per_learner', 'REAL DEFAULT 0'],
    ['manual_cost_per_learner', 'REAL'],
    ['is_manual_override', 'INTEGER DEFAULT 0'],
    ['manual_override_reason', 'TEXT'],
    ['manual_override_by', 'TEXT'],
    ['manual_override_at', 'DATETIME'],
    ['calculated_total_cost', 'REAL DEFAULT 0'],
    ['material_total_cost', 'REAL DEFAULT 0'],
    ['adjustment_total_cost', 'REAL DEFAULT 0'],
    ['adjustment_delta_percent', 'REAL DEFAULT 0'],
    ['cost_last_calculated_at', 'DATETIME']
  ];

  const bomColumns = [
    ['component_type', "TEXT DEFAULT 'MATERIAL'"],
    ['adjustment_id', 'TEXT'],
    ['adjustment_name', 'TEXT'],
    ['adjustment_type', 'TEXT'],
    ['adjustment_value', 'REAL DEFAULT 0'],
    ['allocation_ratio', 'REAL DEFAULT 0']
  ];

  for (const [name, type] of batchColumns) {
    await addColumnIfMissing('examination_batches', name, type);
  }
  for (const [name, type] of classColumns) {
    await addColumnIfMissing('examination_classes', name, type);
  }
  for (const [name, type] of bomColumns) {
    await addColumnIfMissing('examination_bom_calculations', name, type);
  }

  await createTableIfMissing(
    'examination_class_adjustments',
    `CREATE TABLE IF NOT EXISTS examination_class_adjustments (
      id TEXT PRIMARY KEY,
      batch_id TEXT NOT NULL,
      class_id TEXT NOT NULL,
      adjustment_id TEXT NOT NULL,
      adjustment_name TEXT NOT NULL,
      adjustment_type TEXT NOT NULL CHECK(adjustment_type IN ('PERCENTAGE', 'FIXED', 'PERCENT')),
      adjustment_value REAL DEFAULT 0,
      base_amount REAL DEFAULT 0,
      original_amount REAL DEFAULT 0,
      redistributed_amount REAL DEFAULT 0,
      allocation_ratio REAL DEFAULT 0,
      sequence_no INTEGER DEFAULT 0,
      source TEXT DEFAULT 'SYSTEM' CHECK(source IN ('SYSTEM', 'MANUAL_OVERRIDE')),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (batch_id) REFERENCES examination_batches(id) ON DELETE CASCADE,
      FOREIGN KEY (class_id) REFERENCES examination_classes(id) ON DELETE CASCADE
    )`
  );

  await createTableIfMissing(
    'examination_pricing_audit',
    `CREATE TABLE IF NOT EXISTS examination_pricing_audit (
      id TEXT PRIMARY KEY,
      batch_id TEXT NOT NULL,
      class_id TEXT,
      user_id TEXT,
      event_type TEXT NOT NULL CHECK(event_type IN ('SYSTEM_CALCULATION', 'MANUAL_OVERRIDE', 'MANUAL_OVERRIDE_RESET', 'AUTO_RECALC', 'VALIDATION_WARNING', 'PERMISSION_DENIED')),
      trigger_source TEXT,
      previous_cost_per_learner REAL,
      suggested_cost_per_learner REAL,
      new_cost_per_learner REAL,
      candidature INTEGER DEFAULT 0,
      previous_total_amount REAL,
      new_total_amount REAL,
      percentage_difference REAL DEFAULT 0,
      details_json TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (batch_id) REFERENCES examination_batches(id) ON DELETE CASCADE,
      FOREIGN KEY (class_id) REFERENCES examination_classes(id) ON DELETE CASCADE
    )`
  );

  await createIndexIfMissing(
    'CREATE INDEX IF NOT EXISTS idx_exam_class_adjustments_batch ON examination_class_adjustments(batch_id)',
    'idx_exam_class_adjustments_batch'
  );
  await createIndexIfMissing(
    'CREATE INDEX IF NOT EXISTS idx_exam_class_adjustments_class ON examination_class_adjustments(class_id)',
    'idx_exam_class_adjustments_class'
  );
  await createIndexIfMissing(
    'CREATE INDEX IF NOT EXISTS idx_exam_pricing_audit_batch ON examination_pricing_audit(batch_id)',
    'idx_exam_pricing_audit_batch'
  );
  await createIndexIfMissing(
    'CREATE INDEX IF NOT EXISTS idx_exam_pricing_audit_class ON examination_pricing_audit(class_id)',
    'idx_exam_pricing_audit_class'
  );
  await createIndexIfMissing(
    'CREATE INDEX IF NOT EXISTS idx_exam_pricing_audit_event ON examination_pricing_audit(event_type)',
    'idx_exam_pricing_audit_event'
  );
  await createIndexIfMissing(
    'CREATE INDEX IF NOT EXISTS idx_exam_bom_calc_batch_class ON examination_bom_calculations(batch_id, class_id)',
    'idx_exam_bom_calc_batch_class'
  );

  console.log('[Migration] Examination cost engine migration completed.');
}

migrate()
  .catch((error) => {
    console.error('[Migration] Failed:', error);
    process.exitCode = 1;
  })
  .finally(() => {
    db.close();
  });
