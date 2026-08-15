const { db, initDb } = require('../db.cjs');
const examinationService = require('../services/examinationService.cjs');
const assert = require('assert');

const runTest = async () => {
  try {
    console.log('Starting Examination Invoice Test...');

    // Initialize DB to ensure tables exist
    await initDb();

    // 1. Create a Batch
    const batch = await examinationService.createBatch({
      school_id: 'test-school-invoice',
      name: 'Test Invoice Batch',
      academic_year: '2026',
      term: '2',
      exam_type: 'End-Term'
    });
    console.log('Batch created:', batch.id);

    // 2. Add a Class
    const cls = await examinationService.createClass(batch.id, {
      class_name: 'Form 2 Test',
      number_of_learners: 40
    });

    // 3. Add a Subject
    await examinationService.createSubject(cls.id, {
      subject_name: 'Science',
      pages: 15,
      extra_copies: 5,
      paper_size: 'A4',
      orientation: 'Portrait'
    });

    // 4. Calculate Batch
    await examinationService.calculateBatch(batch.id);
    
    // 5. Approve Batch
    await examinationService.approveBatch(batch.id);
    console.log('Batch approved.');

    // 6. Generate Invoice
    console.log('Generating Invoice...');
    const result = await examinationService.generateInvoice(batch.id);
    console.log('Invoice generated:', result);

    if (!result.invoiceId) throw new Error('Invoice ID should be returned');
    if (!result.invoice || !String(result.invoice.id || '').startsWith('EXM-')) {
      throw new Error('Generated invoice payload should expose EXM-prefixed frontend id');
    }
    if (String(result.invoice.origin_module || '').toLowerCase() !== 'examination') {
      throw new Error('Generated invoice payload should include origin_module=examination');
    }

    // 7. Verify Batch Status
    const invoicedBatch = await examinationService.getBatchById(batch.id);
    console.log('Batch Status:', invoicedBatch.status);
    console.log('Batch Invoice ID:', invoicedBatch.invoice_id);

    if (invoicedBatch.status !== 'Completed') throw new Error('Batch status should be Completed');
    if (!invoicedBatch.invoice_id) throw new Error('Batch should have an invoice ID');

    // 8. Verify Invoice Record
    const invoice = await new Promise((resolve, reject) => {
      db.get('SELECT * FROM invoices WHERE id = ?', [result.invoiceId], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });

    console.log('Invoice Record:', invoice);
    if (!invoice) throw new Error('Invoice record not found');
    if (invoice.total_amount !== invoicedBatch.total_amount) throw new Error('Invoice amount mismatch');

    console.log('Test Passed Successfully!');

  } catch (error) {
    console.error('Test Failed:', error);
    process.exit(1);
  }
};

runTest();
