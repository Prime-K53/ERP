
const { db, initDb } = require('../db.cjs');
const examinationService = require('../services/examinationService.cjs');
const assert = require('assert');

const runTest = async () => {
  try {
    console.log('Starting Examination Patch Test...');

    // Initialize DB
    await initDb();

    // 1. Create Parent Batch
    const parentBatch = await examinationService.createBatch({
      school_id: 'test-school-patch',
      name: 'Parent Batch',
      academic_year: '2026',
      term: '2',
      exam_type: 'End-Term'
    });
    console.log('Parent Batch created:', parentBatch.id);

    // 2. Add Class & Subject to Parent
    const parentClass = await examinationService.createClass(parentBatch.id, {
      class_name: 'Form 1',
      number_of_learners: 100
    });
    await examinationService.createSubject(parentClass.id, {
      subject_name: 'Mathematics',
      pages: 10
    });

    // 3. Calculate & Approve Parent
    await examinationService.calculateBatch(parentBatch.id);
    await examinationService.approveBatch(parentBatch.id);
    console.log('Parent Batch Approved');

    // 4. Create Patch Batch
    const patchBatch = await examinationService.createBatch({
      school_id: 'test-school-patch',
      name: 'Patch for Parent Batch',
      academic_year: '2026',
      term: '2',
      exam_type: 'End-Term',
      type: 'Patch',
      parent_batch_id: parentBatch.id
    });
    console.log('Patch Batch created:', patchBatch.id);

    // Verify Link
    if (patchBatch.parent_batch_id !== parentBatch.id) {
      throw new Error('Patch batch not linked to parent');
    }
    if (patchBatch.type !== 'Patch') {
      throw new Error('Patch batch type is incorrect');
    }

    // 5. Add Class & Subject to Patch (simulating adding missed students)
    const patchClass = await examinationService.createClass(patchBatch.id, {
      class_name: 'Form 1 Patch',
      number_of_learners: 5
    });
    await examinationService.createSubject(patchClass.id, {
      subject_name: 'Mathematics',
      pages: 10
    });

    // 6. Calculate & Approve Patch
    await examinationService.calculateBatch(patchBatch.id);
    const approvedPatch = await examinationService.approveBatch(patchBatch.id);
    console.log('Patch Batch Approved');

    // Verify Status
    if (approvedPatch.status !== 'Approved') {
      throw new Error('Patch batch should be approved');
    }

    console.log('Test Passed!');
  } catch (error) {
    console.error('Test Failed:', error);
    process.exit(1);
  } finally {
    // Clean up if needed, but for now we rely on test DB or just leaving data
  }
};

runTest();
