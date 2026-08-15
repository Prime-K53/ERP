console.log('Script started');
const express = require('express');
const bodyParser = require('body-parser');
// const axios = require('axios'); // Let's try native fetch if axios is failing silently
const { db } = require('../db.cjs');
const examinationRouter = require('../routes/examination.cjs');

const app = express();
app.use(bodyParser.json());
app.use('/api/examination', examinationRouter);

const BASE_URL = 'https://prime-erp-system.onrender.com/api/examination';
const TEST_USER_ID = 'api-test-user-999';

const runTest = async () => {
  console.log('Running test...');
  let server;
  try {
    // Start Server
    server = app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });

    // 1. Create Batch via API using fetch
    console.log('Testing POST /batches with x-user-id...');
    const response = await fetch(`${BASE_URL}/batches`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'x-user-id': TEST_USER_ID 
      },
      body: JSON.stringify({
        school_id: 'test-school-api',
        name: 'API Test Batch',
        academic_year: '2026',
        term: '2',
        exam_type: 'Final'
      })
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const batch = await response.json();
    console.log('Batch created:', batch.id);

    // 2. Add Class
    console.log('Adding Class...');
    const clsResponse = await fetch(`${BASE_URL}/classes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-user-id': TEST_USER_ID },
      body: JSON.stringify({ batch_id: batch.id, class_name: 'API Class', number_of_learners: 10 })
    });
    const cls = await clsResponse.json();
    console.log('Class added:', cls.id);

    // 3. Add Subject
    console.log('Adding Subject...');
    await fetch(`${BASE_URL}/subjects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-user-id': TEST_USER_ID },
      body: JSON.stringify({ class_id: cls.id, subject_name: 'API Subject', pages: 5 })
    });

    // 4. Calculate Batch
    console.log('Calculating Batch...');
    await fetch(`${BASE_URL}/batches/${batch.id}/calculate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-user-id': TEST_USER_ID }
    });

    // 5. Approve Batch
    console.log('Approving Batch...');
    await fetch(`${BASE_URL}/batches/${batch.id}/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-user-id': TEST_USER_ID }
    });

    // 6. Generate Invoice
    console.log('Generating Invoice...');
    const invResponse = await fetch(`${BASE_URL}/batches/${batch.id}/invoice`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-user-id': TEST_USER_ID }
    });
    if (!invResponse.ok) throw new Error(`Invoice generation failed: ${invResponse.status}`);
    const invResult = await invResponse.json();
    console.log('Invoice generated:', invResult.invoiceId);

    // 7. Verify Audit Log (Create, Approve, Invoice)
    console.log('Verifying Audit Logs...');
    const audits = await new Promise((resolve, reject) => {
      db.all(
        'SELECT * FROM audit_logs WHERE entity_id = ? ORDER BY timestamp ASC', 
        [batch.id], 
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        }
      );
    });

    console.log('Audit Logs found:', audits.length);
    const actions = audits.map(a => a.action);
    console.log('Actions:', actions);

    if (!actions.includes('CREATE')) throw new Error('CREATE action missing');
    if (!actions.includes('APPROVE')) throw new Error('APPROVE action missing');
    if (!actions.includes('GENERATE_INVOICE')) throw new Error('GENERATE_INVOICE action missing');

    const invoiceLog = audits.find(a => a.action === 'GENERATE_INVOICE');
    if (invoiceLog.user_id !== TEST_USER_ID) {
      throw new Error(`Expected invoice user_id ${TEST_USER_ID}, got ${invoiceLog.user_id}`);
    }

    console.log('API Test Passed Successfully!');

  } catch (error) {
    console.error('Test Failed:', error);
    process.exit(1);
  } finally {
    if (server) server.close();
    process.exit(0);
  }
};

runTest();
