const { db } = require('../db.cjs');

async function runMigration() {
  console.log('Starting migration to add pricing fields to examination_classes...');
  
  const columns = [
    { name: 'suggested_cost_per_learner', type: 'REAL DEFAULT 0' },
    { name: 'manual_cost_per_learner', type: 'REAL' },
    { name: 'is_manual_override', type: 'INTEGER DEFAULT 0' },
    { name: 'manual_override_reason', type: 'TEXT' },
    { name: 'manual_override_by', type: 'TEXT' },
    { name: 'manual_override_at', type: 'DATETIME' },
    { name: 'calculated_total_cost', type: 'REAL DEFAULT 0' },
    { name: 'material_total_cost', type: 'REAL DEFAULT 0' },
    { name: 'adjustment_total_cost', type: 'REAL DEFAULT 0' },
    { name: 'adjustment_delta_percent', type: 'REAL DEFAULT 0' },
    { name: 'cost_last_calculated_at', type: 'DATETIME' }
  ];

  for (const col of columns) {
    try {
      await new Promise((resolve, reject) => {
        db.run(`ALTER TABLE examination_classes ADD COLUMN ${col.name} ${col.type}`, (err) => {
          if (err) {
            if (err.message.includes('duplicate column name')) {
              console.log(`Column ${col.name} already exists, skipping.`);
              resolve();
            } else {
              reject(err);
            }
          } else {
            console.log(`Added column ${col.name}`);
            resolve();
          }
        });
      });
    } catch (error) {
      console.error(`Failed to add column ${col.name}:`, error);
    }
  }

  console.log('Migration completed.');
}

runMigration();
