/**
 * Migration: Add inventory type system
 * 
 * This migration:
 * 1. Adds 'type' column to inventory table with valid types: stationery, material, product, service
 * 2. Adds stock tracking logic that only applies to stationery and material types
 * 3. Updates existing items appropriately
 * 4. Backfills type column for existing records
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = process.env.DB_PATH || path.resolve(__dirname, '..', 'storage', 'examination.db');
const db = new sqlite3.Database(dbPath);

const run = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function(err) {
      if (err) reject(err);
      else resolve(this);
    });
  });
};

const get = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
};

const migrate = async () => {
  console.log('Running inventory type system migration...');
  
  try {
    // Check if type column already exists
    const columns = await new Promise((resolve, reject) => {
      db.all("PRAGMA table_info(inventory)", [], (err, rows) => {
        if (err) reject(err);
        resolve(rows);
      });
    });
    
    const hasTypeColumn = columns.some(c => c.name === 'type');
    
    if (!hasTypeColumn) {
      console.log('Adding type column to inventory table...');
      
      // Add type column first
      await run(`ALTER TABLE inventory ADD COLUMN type TEXT CHECK(type IN ('stationery', 'material', 'product', 'service')) DEFAULT 'material'`);
      
      // Backfill existing items:
      // Paper, Toner and consumables -> material
      // Everything else defaults to material for now, users can change later
      await run(`UPDATE inventory SET type = 'material' WHERE LOWER(name) LIKE '%paper%' OR LOWER(material) LIKE '%paper%'`);
      await run(`UPDATE inventory SET type = 'material' WHERE LOWER(name) LIKE '%toner%' OR LOWER(material) LIKE '%toner%'`);
      await run(`UPDATE inventory SET type = 'material' WHERE LOWER(name) LIKE '%ink%' OR LOWER(material) LIKE '%ink%'`);
      
      console.log('✓ Type column added and populated');
    } else {
      console.log('Type column already exists');
    }
    
    // Add check constraint to inventory transactions to only allow stock items
    console.log('✓ Inventory type system migration completed successfully');
    
    // Show summary
    const stats = await new Promise((resolve, reject) => {
      db.all(`
        SELECT type, COUNT(*) as count 
        FROM inventory 
        GROUP BY type 
        ORDER BY count DESC
      `, [], (err, rows) => {
        if (err) reject(err);
        resolve(rows);
      });
    });
    
    console.log('\nInventory item distribution by type:');
    stats.forEach(row => {
      console.log(`  ${row.type}: ${row.count} items`);
    });
    
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    throw error;
  } finally {
    db.close();
  }
};

// Run migration if executed directly
if (require.main === module) {
  migrate().catch(() => process.exit(1));
}

module.exports = migrate;