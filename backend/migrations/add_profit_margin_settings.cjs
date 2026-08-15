/**
 * Migration: Add Profit Margin Settings Tables
 * Run during bootstrap to ensure profit margin override system is available.
 */
const { db } = require('../db.cjs');

function migrate_add_profit_margin_settings() {
  return new Promise((resolve, reject) => {
    db.serialize(() => {
      db.run(`CREATE TABLE IF NOT EXISTS profit_margin_settings (
        id TEXT PRIMARY KEY,
        scope TEXT NOT NULL CHECK(scope IN ('global', 'category', 'line_item')),
        scope_ref_id TEXT,
        margin_type TEXT NOT NULL CHECK(margin_type IN ('percentage', 'fixed_amount')),
        margin_value REAL NOT NULL,
        is_active INTEGER DEFAULT 1,
        reason TEXT,
        created_by TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        deleted_at DATETIME
      )`, (err) => {
        if (err && !err.message.includes('already exists')) {
          console.error('[Migration] Failed to create profit_margin_settings:', err);
        } else {
          console.log('[Migration] profit_margin_settings table ready.');
        }
      });

      db.run(`CREATE TABLE IF NOT EXISTS profit_margin_audit_logs (
        id TEXT PRIMARY KEY,
        setting_id TEXT,
        action TEXT NOT NULL,
        scope TEXT NOT NULL,
        old_value TEXT,
        new_value TEXT,
        reason TEXT,
        performed_by TEXT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
      )`, (err) => {
        if (err && !err.message.includes('already exists')) {
          console.error('[Migration] Failed to create profit_margin_audit_logs:', err);
        } else {
          console.log('[Migration] profit_margin_audit_logs table ready.');
        }
      });

      db.run(`CREATE INDEX IF NOT EXISTS idx_pms_resolution ON profit_margin_settings(scope, scope_ref_id, is_active, deleted_at)`, () => {});
      db.run(`CREATE INDEX IF NOT EXISTS idx_pm_audit_setting ON profit_margin_audit_logs(setting_id)`, () => {});
      db.run(`CREATE INDEX IF NOT EXISTS idx_pm_audit_timestamp ON profit_margin_audit_logs(timestamp)`, () => {});

      console.log('[Migration] Profit margin override tables and indexes applied.');
      resolve();
    });
  });
}

// Run directly if called as a script
if (require.main === module) {
  const { initDb } = require('../db.cjs');
  initDb()
    .then(() => migrate_add_profit_margin_settings())
    .then(() => {
      console.log('Migration complete.');
      process.exit(0);
    })
    .catch(err => {
      console.error('Migration failed:', err);
      process.exit(1);
    });
}

module.exports = migrate_add_profit_margin_settings;
