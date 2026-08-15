
const { db } = require('../db.cjs');
const examinationService = require('../services/examinationService.cjs');
const { randomUUID } = require('crypto');

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

async function testFullFlow() {
  console.log('--- Starting End-to-End Test ---');

  const userId = 'TestUser-' + randomUUID().substring(0, 8);
  console.log(`Using User ID: ${userId}`);

  // 1. Setup Inventory
  console.log('1. Setting up Inventory...');
  
  // Use unique material names to avoid UNIQUE constraint violation
  const paperMaterial = 'Test Paper A4 ' + randomUUID();
  const tonerMaterial = 'Test Toner ' + randomUUID();

  const paperResult = await runRun(
    `INSERT INTO inventory (name, material, quantity, cost_per_unit, unit) VALUES (?, ?, ?, ?, ?)`,
    ['Test Paper A4', paperMaterial, 1000, 5000, 'Ream']
  );
  const paperId = paperResult.lastID;

  const tonerResult = await runRun(
    `INSERT INTO inventory (name, material, quantity, cost_per_unit, unit) VALUES (?, ?, ?, ?, ?)`,
    ['Test Toner', tonerMaterial, 50, 85000, 'Cartridge']
  );
  const tonerId = tonerResult.lastID;

  console.log(`   Inventory created. Paper ID: ${paperId}, Toner ID: ${tonerId}`);

  // 2. Create Batch
  console.log('2. Creating Batch...');
  const batchData = {
    school_id: 'SCH-001', 
    name: 'End-to-End Test Batch',
    academic_year: '2025',
    term: '1',
    exam_type: 'Mock',
    type: 'Original'
  };
  const batch = await examinationService.createBatch(batchData, userId);
  console.log(`   Batch created: ${batch.id}`);

  // 3. Add Class
  console.log('3. Adding Class...');
  const classData = {
    class_name: 'Form 4',
    number_of_learners: 100
  };
  const cls = await examinationService.createClass(batch.id, classData);
  console.log(`   Class added: ${cls.id}`);

  // 4. Add Subject
  console.log('4. Adding Subject...');
  const subjectData = {
    subject_name: 'Mathematics',
    pages: 10,
    extra_copies: 5,
    paper_size: 'A4'
  };
  const sub = await examinationService.createSubject(cls.id, subjectData);
  console.log(`   Subject added: ${sub.id}`);

  // 5. Calculate Batch
  console.log('5. Calculating Batch...');
  // Note: calculateBatch logic uses string matching on 'name' or 'material'.
  // It fetches all inventory. 
  // Our inserted items have 'Paper' and 'Toner' in name/material.
  // Ideally, calculateBatch should use specific IDs if possible, but for now we rely on its logic.
  
  const calculatedBatch = await examinationService.calculateBatch(batch.id);
  console.log(`   Batch calculated. Total Amount: ${calculatedBatch.total_amount}`);
  
  if (calculatedBatch.status !== 'Calculated') {
    throw new Error('Batch status should be Calculated');
  }

  // 6. Approve Batch
  console.log('6. Approving Batch...');
  const approvedBatch = await examinationService.approveBatch(batch.id, userId);
  console.log(`   Batch approved. Status: ${approvedBatch.status}`);

  if (approvedBatch.status !== 'Approved') {
    throw new Error('Batch status should be Approved');
  }

  // Verify Inventory Deduction
  const transactions = await new Promise((resolve, reject) => {
      db.all(`SELECT * FROM inventory_transactions WHERE reference_id = ?`, [batch.id], (err, rows) => {
          if(err) reject(err);
          else resolve(rows);
      });
  });

  console.log(`   Inventory Transactions found: ${transactions.length}`);
  if (transactions.length === 0) {
    console.warn('   WARNING: No inventory transactions found. Check calculateBatch logic for item matching.');
  } else {
    transactions.forEach(t => {
      console.log(`     - Deducted ${t.quantity} from item ${t.item_id} by ${t.performed_by}`);
      if (t.performed_by !== userId) throw new Error('Transaction user ID mismatch');
    });
  }

  // 7. Generate Invoice
  console.log('7. Generating Invoice...');
  const invoiceResult = await examinationService.generateInvoice(batch.id, userId);
  console.log(`   Invoice generated. ID: ${invoiceResult.invoiceId}`);
  
  const invoicedBatch = await examinationService.getBatchById(batch.id);
  console.log(`   Batch Status: ${invoicedBatch.status}`);
  
  if (invoicedBatch.status !== 'Completed') {
    throw new Error('Batch status should be Completed');
  }

  // 8. Verify Audit Logs
  console.log('8. Verifying Audit Logs...');
  const logs = await new Promise((resolve, reject) => {
      db.all(`SELECT * FROM audit_logs WHERE entity_id = ? ORDER BY timestamp ASC`, [batch.id], (err, rows) => {
          if(err) reject(err);
          else resolve(rows);
      });
  });

  console.log(`   Audit Logs found: ${logs.length}`);
  logs.forEach(log => {
      console.log(`     - [${log.action}] ${log.details} (User: ${log.user_id})`);
      if (log.user_id !== userId) throw new Error(`Audit log user ID mismatch for action ${log.action}`);
  });

  // Cleanup
  console.log('Cleaning up...');
  await runRun('DELETE FROM examination_batches WHERE id = ?', [batch.id]);
  await runRun('DELETE FROM examination_classes WHERE batch_id = ?', [batch.id]);
  await runRun('DELETE FROM inventory WHERE id IN (?, ?)', [paperId, tonerId]);
  
  console.log('--- Test Completed Successfully ---');
}

testFullFlow().catch(err => {
  console.error('Test Failed:', err);
  process.exit(1);
});
