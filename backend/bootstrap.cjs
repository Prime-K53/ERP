const fs = require('fs');
const path = require('path');
const { getDbPath, backupDir, ensureRuntimeDirs } = require('./runtimePaths.cjs');
const sq = require('./services/supabaseQuery.cjs');
const repo = require('./services/supabaseRepository.cjs');
const BackupService = require('./services/backupService.cjs');
const licenseService = require('./services/licenseService.cjs');

async function bootstrap() {
  console.log('--- PRIME ERP BOOTSTRAP START ---');

  ensureRuntimeDirs();

  const fingerprint = licenseService.getFingerprint();
  console.log(`Machine Fingerprint: ${fingerprint}`);
  const license = licenseService.validateLicense();
  console.log(`[LICENSE STATUS] ${license.mode} ${license.valid ? '(Valid)' : '(Limited Access - Offline Trial)'}`);

  if (!license.valid && !fs.existsSync(licenseService.licensePath)) {
    console.log('Generating auto-trial license for first run...');
    licenseService.generateTrialLicense(365);
  }

  try {
    console.log('Verifying Supabase connection...');
    const alive = await sq.getOne('SELECT 1 AS alive');
    if (!alive) {
      console.warn('[Bootstrap] Supabase connection check returned no data.');
    }
    console.log('Supabase connection verified.');

    console.log('Initializing auth schema...');
    const authService = require('./services/authService.cjs');
    await authService.ensureAuthSchema();

    console.log('Initializing portal auth schema...');
    const portalAuthService = require('./services/portalAuthService.cjs');
    await portalAuthService.ensurePortalSchema();

    console.log('Initializing referral tables...');
    const migrate_add_referral_tables = require('./migrations/add_referral_tables.cjs');
    await migrate_add_referral_tables();

    console.log('Schema verification passed.');
  } catch (err) {
    console.error('--- DATABASE CRITICAL ERROR ---');
    console.error(err);
    process.exit(1);
  }

  const backupService = new BackupService(backupDir);
  await backupService.createBackup().catch(err => console.warn('Initial backup failed:', err));

  // supabaseQuery.getOne() is promise-based — it does not take a callback. The
  // previous version passed (err, row) => {} and awaited nothing, so the Promise
  // never resolved and the server never finished booting (every /api request
  // then surfaced as a 500 from the dev proxy).
  try {
    const row = await sq.getOne('SELECT COUNT(*) as count FROM schools');
    if (row && Number(row.count) === 0) {
      console.log('First run detected. Seeding default data...');
      try {
        await seedDefaultData();
      } catch (seedErr) {
        console.error('Failed to seed default data (non-fatal):', seedErr);
      }
    }
  } catch (err) {
    console.error('Error checking schools count:', err);
  }
  console.log('--- PRIME ERP BOOTSTRAP COMPLETE ---');
}

async function seedDefaultData() {
  const schools = [
    { id: 'school-1', name: 'Sample Academy', pricing_type: 'margin-based', pricing_value: 0.3 },
    { id: 'school-2', name: 'City Primary', pricing_type: 'per-sheet', pricing_value: 15.0 }
  ];
  for (const s of schools) {
    await repo.upsert('schools', s);
  }

  const defaultClasses = [
    'Standard 1', 'Standard 2', 'Standard 3', 'Standard 4',
    'Standard 5', 'Standard 6', 'Standard 7', 'Standard 8'
  ];
  for (const c of defaultClasses) {
    await repo.upsert('classes', { id: `class-${c.replace(/\s+/g, '-').toLowerCase()}`, name: c });
  }

  const defaultSubjects = [
    { id: 'subject-1', name: 'Agriculture', code: 'AGRI' },
    { id: 'subject-2', name: 'Bible knowledge', code: 'BK' },
    { id: 'subject-3', name: 'Chichewa', code: 'CHI' },
    { id: 'subject-4', name: 'English', code: 'ENG' },
    { id: 'subject-5', name: 'Expressive arts', code: 'ARTS' },
    { id: 'subject-6', name: 'Life skills', code: 'LS' },
    { id: 'subject-7', name: 'Mathematics', code: 'MATH' },
    { id: 'subject-8', name: 'P / Science', code: 'PSCI' },
    { id: 'subject-9', name: 'Social studies', code: 'SS' },
    { id: 'subject-10', name: 'Ulimi Sayansi', code: 'USAY' },
    { id: 'subject-11', name: 'Arts and Life', code: 'ALIFE' },
    { id: 'subject-12', name: 'Social & BK', code: 'SBK' }
  ];
  for (const s of defaultSubjects) {
    await repo.upsert('subjects', s);
  }

  const materials = [
    { id: 'INV-PAPER', name: 'Paper', material: 'Paper', quantity: 5000, cost_per_unit: 35.0 },
    { id: 'INV-TONER', name: 'Toner', material: 'Toner', quantity: 1000, cost_per_unit: 0.25 }
  ];
  for (const m of materials) {
    await repo.upsert('inventory', m);
  }

  const workCenters = [
    { id: 'WC-PRN-01', name: 'Offset Printing Line 1', description: 'Primary printing facility', hourly_rate: 45.00, capacity_per_day: 8, status: 'Active' },
    { id: 'WC-BND-01', name: 'Perfect Binding Station', description: 'Paper binding and finishing', hourly_rate: 35.00, capacity_per_day: 8, status: 'Active' },
    { id: 'WC-CUT-01', name: 'Hydraulic Cutting Station', description: 'Precision paper cutting', hourly_rate: 25.00, capacity_per_day: 8, status: 'Active' }
  ];
  for (const wc of workCenters) {
    await repo.upsert('work_centers', wc);
  }

  const resources = [
    { id: 'RES-PRN-01', name: 'Heidelberg Speedmaster', work_center_id: 'WC-PRN-01', status: 'Active' },
    { id: 'RES-BND-01', name: 'Horizon Binder', work_center_id: 'WC-BND-01', status: 'Active' },
    { id: 'RES-CUT-01', name: 'Polar Cutter', work_center_id: 'WC-CUT-01', status: 'Active' }
  ];
  for (const r of resources) {
    await repo.upsert('production_resources', r);
  }

  console.log('Default data seeded (schools, classes, subjects, inventory, work centers, resources).');
}

module.exports = bootstrap;
