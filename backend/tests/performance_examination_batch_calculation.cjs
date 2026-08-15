const { performance } = require('perf_hooks');
const { db } = require('../db.cjs');
const examinationService = require('../services/examinationService.cjs');
const { randomUUID } = require('crypto');

const runRun = (query, params = []) =>
  new Promise((resolve, reject) => {
    db.run(query, params, function onRun(err) {
      if (err) reject(err);
      else resolve(this);
    });
  });

async function run() {
  const userId = `perf-${randomUUID().slice(0, 8)}`;
  const batch = await examinationService.createBatch({
    school_id: 'PERF-SCHOOL-001',
    name: `Performance Batch ${Date.now()}`,
    academic_year: '2026',
    term: '2',
    exam_type: 'End-of-Term'
  }, userId);

  const cls = await examinationService.createClass(batch.id, {
    class_name: 'Large Cohort',
    number_of_learners: 10000
  });

  const subjects = [
    ['Mathematics', 12],
    ['English', 14],
    ['Biology', 10],
    ['Chemistry', 11],
    ['Physics', 10],
    ['History', 8],
    ['Geography', 9],
    ['Commerce', 7]
  ];

  for (const [name, pages] of subjects) {
    await examinationService.createSubject(cls.id, {
      subject_name: name,
      pages,
      extra_copies: 10
    });
  }

  const startedAt = performance.now();
  const calculated = await examinationService.calculateBatch(batch.id, {
    trigger: 'MANUAL_TRIGGER',
    userId
  });
  const elapsedMs = performance.now() - startedAt;

  const roundedElapsed = Math.round(elapsedMs * 100) / 100;
  console.log('--- Examination Batch Calculation Performance ---');
  console.log(`Batch ID: ${batch.id}`);
  console.log(`Learners: 10000`);
  console.log(`Subjects: ${subjects.length}`);
  console.log(`Duration (ms): ${roundedElapsed}`);
  console.log(`Batch Total: ${calculated.total_amount}`);

  if (elapsedMs > 2000) {
    throw new Error(`Performance target missed. Took ${roundedElapsed}ms (> 2000ms).`);
  }

  console.log('Performance target met (<= 2000 ms).');

  await runRun('DELETE FROM examination_batches WHERE id = ?', [batch.id]);
}

run()
  .catch((error) => {
    console.error('Performance test failed:', error);
    process.exitCode = 1;
  })
  .finally(() => {
    db.close();
  });
