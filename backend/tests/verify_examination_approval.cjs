const { db } = require('../db.cjs');
const examinationService = require('../services/examinationService.cjs');
const assert = require('assert');

const runTest = async () => {
  try {
    console.log('Starting Examination Approval Test...');

    const TEST_USER_ID = 'test-user-123';

    // 1. Create a Batch
    const batch = await examinationService.createBatch({
      school_id: 'test-school-1',
      name: 'Test Batch Approval',
      academic_year: '2026',
      term: '1',
      exam_type: 'Mid-Term'
    }, TEST_USER_ID);
    console.log('Batch created:', batch.id);

    // 2. Add a Class
    const cls = await examinationService.createClass(batch.id, {
      class_name: 'Form 1 Test',
      number_of_learners: 50
    });
    console.log('Class added:', cls.id);

    // 3. Add a Subject
    const subject = await examinationService.createSubject(cls.id, {
      subject_name: 'Mathematics',
      pages: 10,
      extra_copies: 2,
      paper_size: 'A4',
      orientation: 'Portrait'
    });
    console.log('Subject added:', subject.id);

    // 4. Calculate Batch
    const calculatedBatch = await examinationService.calculateBatch(batch.id);
    console.log('Batch calculated. Total Amount:', calculatedBatch.total_amount);

    // Verify subject totals are persisted (sheets/pages)
    const subjects = await new Promise((resolve, reject) => {
      db.all('SELECT * FROM examination_subjects WHERE class_id = ?', [cls.id], (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
    if (!subjects.length) throw new Error('Expected subject rows after calculation');
    if (Number(subjects[0].total_sheets || 0) <= 0) throw new Error('total_sheets should be populated');
    if (Number(subjects[0].total_pages || 0) <= 0) throw new Error('total_pages should be populated');

    // 5. Approve Batch
    console.log('Approving Batch...');
    const approvedBatch = await examinationService.approveBatch(batch.id, TEST_USER_ID);
    console.log('Batch approved. Status:', approvedBatch.status);
    if (approvedBatch.status !== 'Approved') throw new Error('Batch status should be Approved');

    // 6. Verify Inventory Transactions
    console.log('Verifying Inventory Transactions...');
    const transactions = await new Promise((resolve, reject) => {
      db.all('SELECT * FROM inventory_transactions WHERE reference_id = ?', [batch.id], (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
    console.log('Inventory Transactions found:', transactions.length);
    if (transactions.length === 0) throw new Error('Inventory transactions should exist');

    // 7. Verify Inventory Deduction
    // We need to check if quantity decreased.
    // Since we don't know initial quantity easily without querying before, 
    // we rely on the transaction log 'previous_quantity' and 'new_quantity' which are recorded.
    transactions.forEach(tx => {
      console.log(`Transaction for item ${tx.item_id}: Previous ${tx.previous_quantity} -> New ${tx.new_quantity} (Performed by: ${tx.performed_by})`);
      if (tx.new_quantity >= tx.previous_quantity) throw new Error('Inventory should be deducted');
      if (tx.performed_by !== TEST_USER_ID) throw new Error(`Inventory transaction performed_by should be ${TEST_USER_ID} but was ${tx.performed_by}`);
    });

    // 8. Verify Audit Logs
    console.log('Verifying Audit Logs...');
    const audits = await new Promise((resolve, reject) => {
      db.all('SELECT * FROM audit_logs WHERE entity_id = ?', [batch.id], (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
    console.log('Audit Logs found:', audits.length);
    // Expect at least CREATE and APPROVE
    const createLog = audits.find(a => a.action === 'CREATE');
    const approveLog = audits.find(a => a.action === 'APPROVE');
    
    if (!createLog) throw new Error('CREATE audit log missing');
    if (!approveLog) throw new Error('APPROVE audit log missing');
    
    if (createLog.user_id !== TEST_USER_ID) throw new Error(`CREATE audit log user_id should be ${TEST_USER_ID} but was ${createLog.user_id}`);
    if (approveLog.user_id !== TEST_USER_ID) throw new Error(`APPROVE audit log user_id should be ${TEST_USER_ID} but was ${approveLog.user_id}`);

    console.log('Test Passed Successfully!');

  } catch (error) {
    console.error('Test Failed:', error);
    process.exit(1);
  }
};

runTest();
