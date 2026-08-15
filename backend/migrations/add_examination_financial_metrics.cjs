/**
 * Migration: Add Three Critical Financial Metrics to Examination Classes
 * 
 * This migration adds the following fields to support the Examination Pricing Redesign:
 * - expected_fee_per_learner: Mirrors Pricing Settings calculation exactly
 * - final_fee_per_learner: Mutable, initialized = expected_fee_per_learner
 * - live_total_preview: Final Fee × Learner Count (real-time)
 * 
 * Also adds audit trail columns:
 * - financial_metrics_updated_at
 * - financial_metrics_updated_by
 * - financial_metrics_source
 * 
 * Created: 2026-02-28
 */

const { db } = require('../db.cjs');

function runMigration() {
  return new Promise((resolve, reject) => {
    console.log('[Migration] Starting: Add Examination Financial Metrics...');
    
    const columnsToAdd = [
      { name: 'expected_fee_per_learner', type: 'REAL DEFAULT 0' },
      { name: 'final_fee_per_learner', type: 'REAL DEFAULT 0' },
      { name: 'live_total_preview', type: 'REAL DEFAULT 0' },
      { name: 'financial_metrics_updated_at', type: 'DATETIME' },
      { name: 'financial_metrics_updated_by', type: 'TEXT' },
      { name: 'financial_metrics_source', type: 'TEXT' }
    ];
    
    const addColumn = (column) => {
      return new Promise((resolveColumn, rejectColumn) => {
        db.run(
          `ALTER TABLE examination_classes ADD COLUMN ${column.name} ${column.type}`,
          (err) => {
            if (err) {
              if (err.message.includes('duplicate column')) {
                console.log(`[Migration] Column ${column.name} already exists, skipping...`);
                resolveColumn();
              } else {
                rejectColumn(err);
              }
            } else {
              console.log(`[Migration] Added column: ${column.name}`);
              resolveColumn();
            }
          }
        );
      });
    };
    
    const createIndexes = () => {
      return new Promise((resolveIndexes, rejectIndexes) => {
        const indexes = [
          'CREATE INDEX IF NOT EXISTS idx_exam_classes_expected_fee ON examination_classes(expected_fee_per_learner)',
          'CREATE INDEX IF NOT EXISTS idx_exam_classes_final_fee ON examination_classes(final_fee_per_learner)',
          'CREATE INDEX IF NOT EXISTS idx_exam_classes_live_total ON examination_classes(live_total_preview)'
        ];
        
        let completed = 0;
        
        indexes.forEach(indexSql => {
          db.run(indexSql, (err) => {
            if (err) {
              console.warn('[Migration] Index creation warning:', err.message);
            } else {
              console.log('[Migration] Created index');
            }
            completed++;
            if (completed === indexes.length) {
              resolveIndexes();
            }
          });
        });
      });
    };
    
    const migrateExistingData = () => {
      return new Promise((resolveMigrate, rejectMigrate) => {
        console.log('[Migration] Migrating existing data...');
        
        db.run(
          `UPDATE examination_classes SET
            expected_fee_per_learner = COALESCE(suggested_cost_per_learner, price_per_learner, calculated_total_cost / NULLIF(number_of_learners, 0), 0),
            final_fee_per_learner = COALESCE(price_per_learner, suggested_cost_per_learner, calculated_total_cost / NULLIF(number_of_learners, 0), 0),
            live_total_preview = COALESCE(total_price, calculated_total_cost, price_per_learner * number_of_learners, 0),
            financial_metrics_updated_at = CURRENT_TIMESTAMP,
            financial_metrics_source = 'SYSTEM_CALCULATION'
          WHERE expected_fee_per_learner IS NULL OR expected_fee_per_learner = 0`,
          function(err) {
            if (err) {
              rejectMigrate(err);
            } else {
              console.log(`[Migration] Updated ${this.changes} existing records`);
              resolveMigrate();
            }
          }
        );
      });
    };
    
    // Run migration steps
    (async () => {
      try {
        // Add all columns
        for (const column of columnsToAdd) {
          await addColumn(column);
        }
        
        // Create indexes
        await createIndexes();
        
        // Migrate existing data
        await migrateExistingData();
        
        console.log('[Migration] Completed successfully');
        resolve();
      } catch (error) {
        console.error('[Migration] Failed:', error);
        reject(error);
      }
    })();
  });
}

// Run if called directly
if (require.main === module) {
  runMigration()
    .then(() => {
      console.log('[Migration] Script completed');
      process.exit(0);
    })
    .catch(err => {
      console.error('[Migration] Script failed:', err);
      process.exit(1);
    });
}

module.exports = { runMigration };
