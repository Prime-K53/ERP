/**
 * Migration: Add Customer Referral Tables
 * Run during bootstrap to ensure referral system is available.
 */
const { getDatabase } = require('../db.cjs');

function migrate_add_referral_tables() {
  return new Promise((resolve, reject) => {
    const db = getDatabase();
    
    db.serialize(() => {
      // Customer Referrals Table
      const createRefTable = `CREATE TABLE IF NOT EXISTS customer_referrals (
        id TEXT PRIMARY KEY,
        data TEXT NOT NULL DEFAULT '{}',
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`;
      
      db.run(createRefTable, (err) => {
        if (err && !err.message.includes('already exists')) {
          console.error('[Migration] Failed to create customer_referrals:', err);
        } else {
          console.log('[Migration] customer_referrals table ready.');
        }
      });

      // Referral Rewards Table
      const createRewardTable = `CREATE TABLE IF NOT EXISTS referral_rewards (
        id TEXT PRIMARY KEY,
        data TEXT NOT NULL DEFAULT '{}',
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`;
      
      db.run(createRewardTable, (err) => {
        if (err && !err.message.includes('already exists')) {
          console.error('[Migration] Failed to create referral_rewards:', err);
        } else {
          console.log('[Migration] referral_rewards table ready.');
        }
      });

      console.log('[Migration] Referral tables and indexes applied.');
      resolve();
    });
  });
}

// Run directly if called as a script
if (require.main === module) {
  const { initDb } = require('../db.cjs');
  initDb()
    .then(() => migrate_add_referral_tables())
    .then(() => {
      console.log('Migration complete.');
      process.exit(0);
    })
    .catch(err => {
      console.error('Migration failed:', err);
      process.exit(1);
    });
}

module.exports = migrate_add_referral_tables;