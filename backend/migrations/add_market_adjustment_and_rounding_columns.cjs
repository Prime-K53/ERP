/**
 * Migration: Add market_adjustment_total and rounding_adjustment columns
 * to examination_classes table for proper separation of adjustments
 */
const migration = async (db) => {
  console.log('[Migration] Adding market_adjustment_total and rounding_adjustment columns to examination_classes...');
  
  // Check if columns already exist
  const tableInfo = await new Promise((resolve, reject) => {
    db.all("PRAGMA table_info(examination_classes)", (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
  
  const hasMarketAdjustmentTotal = tableInfo.some(row => row.name === 'market_adjustment_total');
  const hasRoundingAdjustment = tableInfo.some(row => row.name === 'rounding_adjustment');
  
  if (!hasMarketAdjustmentTotal) {
    await new Promise((resolve, reject) => {
      db.run("ALTER TABLE examination_classes ADD COLUMN market_adjustment_total NUMERIC(15, 2) DEFAULT 0", (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
    console.log('[Migration] Added market_adjustment_total column');
  }
  
  if (!hasRoundingAdjustment) {
    await new Promise((resolve, reject) => {
      db.run("ALTER TABLE examination_classes ADD COLUMN rounding_adjustment NUMERIC(15, 2) DEFAULT 0", (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
    console.log('[Migration] Added rounding_adjustment column');
  }
  
  // Migrate existing data: split adjustment_total_cost into market_adjustment_total and rounding_adjustment
  // For now, we'll set market_adjustment_total = adjustment_total_cost and rounding_adjustment = 0
  // The actual split will happen when classes are re-saved with the new logic
  await new Promise((resolve, reject) => {
    db.run(`
      UPDATE examination_classes 
      SET market_adjustment_total = adjustment_total_cost,
          rounding_adjustment = 0
      WHERE market_adjustment_total IS NULL OR rounding_adjustment IS NULL
    `, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
  
  console.log('[Migration] Market adjustment and rounding columns migration completed');
};

module.exports = migration;
