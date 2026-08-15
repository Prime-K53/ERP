const { createTestDb, generateTestId } = require('../setup.cjs');
const { TEST_USER_ID } = require('../helpers.cjs');

describe('Financial Year Integration', () => {
  let db, financialYear;

  beforeAll(async () => {
    jest.setTimeout(30000);
    db = await createTestDb();
    // Create required tables
    const tables = [
      `CREATE TABLE IF NOT EXISTS financial_years (
        id TEXT PRIMARY KEY, name TEXT NOT NULL, code TEXT,
        start_date TEXT NOT NULL, end_date TEXT NOT NULL,
        is_default INTEGER DEFAULT 0, is_closed INTEGER DEFAULT 0,
        status TEXT DEFAULT 'Active' CHECK(status IN ('Active','Closed')),
        created_by TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`,
      `CREATE TABLE IF NOT EXISTS sales (
        id TEXT PRIMARY KEY, date TEXT NOT NULL, customer_id TEXT,
        customer_name TEXT, total_amount REAL DEFAULT 0,
        status TEXT DEFAULT 'Draft', items_json TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`,
      `CREATE TABLE IF NOT EXISTS invoices (
        id TEXT PRIMARY KEY, customer_id TEXT, customer_name TEXT,
        total_amount REAL DEFAULT 0, status TEXT DEFAULT 'unpaid',
        invoice_date TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`,
      `CREATE TABLE IF NOT EXISTS expenses (
        id TEXT PRIMARY KEY, category TEXT, vendor_name TEXT,
        amount REAL NOT NULL, expense_date TEXT, status TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`,
      `CREATE TABLE IF NOT EXISTS customer_payments (
        id TEXT PRIMARY KEY, date TEXT NOT NULL, customer_id TEXT,
        customer_name TEXT, amount REAL DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`,
      `CREATE TABLE IF NOT EXISTS chart_of_accounts (
        id TEXT PRIMARY KEY, code TEXT, name TEXT, type TEXT,
        category TEXT, subtype TEXT, parent_id TEXT,
        balance REAL DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`,
      `CREATE TABLE IF NOT EXISTS ledger_entries (
        id TEXT PRIMARY KEY, account_id TEXT, entry_type TEXT,
        amount REAL DEFAULT 0, currency TEXT, description TEXT,
        reference_type TEXT, reference_id TEXT, entry_date TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`,
    ];
    await Promise.all(tables.map(sql =>
      new Promise((resolve, reject) => {
        db.run(sql, err => err ? reject(err) : resolve());
      })
    ));
    const FinancialYearService = require('../../services/financialYearService.cjs');
    financialYear = new FinancialYearService(db);
  }, 30000);

  afterAll(() => { try { db.close(); } catch {} });

  const fyId = () => generateTestId('fy');

  // ── CRUD Operations ──
  describe('CRUD Operations', () => {
    test('create a financial year', async () => {
      const fy = await financialYear.createFinancialYear({
        id: fyId(), name: 'FY 2026', code: 'FY2026',
        start_date: '2026-01-01', end_date: '2026-12-31',
      }, TEST_USER_ID);
      expect(fy).toBeDefined();
      expect(fy.name).toBe('FY 2026');
      expect(fy.start_date).toBe('2026-01-01');
      expect(fy.end_date).toBe('2026-12-31');
      expect(fy.is_default).toBe(1);
    });

    test('get financial year by id', async () => {
      const id = fyId();
      await financialYear.createFinancialYear({
        id, name: 'FY 2025', code: 'FY2025',
        start_date: '2025-01-01', end_date: '2025-12-31',
      }, TEST_USER_ID);
      const fy = await financialYear.getFinancialYearById(id);
      expect(fy).toBeDefined();
      expect(fy.name).toBe('FY 2025');
    });

    test('update a financial year', async () => {
      const id = fyId();
      await financialYear.createFinancialYear({
        id, name: 'FY 2024', code: 'FY2024',
        start_date: '2024-01-01', end_date: '2024-12-31',
      }, TEST_USER_ID);
      const updated = await financialYear.updateFinancialYear(id, { name: 'FY 2024 Updated' });
      expect(updated.name).toBe('FY 2024 Updated');
    });

    test('close a financial year', async () => {
      const id = fyId();
      await financialYear.createFinancialYear({
        id, name: 'FY 2023', code: 'FY2023',
        start_date: '2023-01-01', end_date: '2023-12-31',
      }, TEST_USER_ID);
      const closed = await financialYear.closeFinancialYear(id);
      expect(closed.is_closed).toBe(1);
      expect(closed.status).toBe('Closed');
    });

    test('delete a financial year', async () => {
      const id = fyId();
      await financialYear.createFinancialYear({
        id, name: 'FY 2022', code: 'FY2022',
        start_date: '2022-01-01', end_date: '2022-12-31',
      }, TEST_USER_ID);
      const defaultId = fyId();
      await financialYear.createFinancialYear({
        id: defaultId, name: 'FY Default', code: 'FYDefault',
        start_date: '2021-01-01', end_date: '2021-12-31', is_default: true,
      }, TEST_USER_ID);
      const result = await financialYear.deleteFinancialYear(id);
      expect(result.success).toBe(true);
    });
  });

  // ── Default FY ──
  describe('Default Financial Year', () => {
    test('getDefaultFinancialYear returns the default FY', async () => {
      const fy = await financialYear.getDefaultFinancialYear();
      expect(fy).toBeDefined();
      expect(fy.is_default).toBe(1);
    });

    test('getOrCreateDefaultFinancialYear returns the default FY without duplicating', async () => {
      const fy = await financialYear.getOrCreateDefaultFinancialYear(TEST_USER_ID);
      expect(fy).toBeDefined();
      expect(fy.is_default).toBe(1);
      expect(fy.status).toBe('Active');
      expect(fy.start_date).toBeDefined();
      expect(fy.end_date).toBeDefined();
    });
  });

  // ── Date Validation ──
  describe('Date Validation', () => {
    test('passes for date within open FY', async () => {
      await financialYear.createFinancialYear({
        id: fyId(), name: 'FY 2027', code: 'FY2027',
        start_date: '2027-01-01', end_date: '2027-12-31',
      }, TEST_USER_ID);
      const result = await financialYear.validateTransactionDate('2027-06-15');
      expect(result).toBeDefined();
    });

    test('rejects date outside any FY', async () => {
      await expect(
        financialYear.validateTransactionDate('2099-01-01')
      ).rejects.toThrow(/does not belong/);
    });

    test('rejects date in closed FY', async () => {
      const id = fyId();
      await financialYear.createFinancialYear({
        id, name: 'FY 2020', code: 'FY2020',
        start_date: '2020-01-01', end_date: '2020-12-31',
      }, TEST_USER_ID);
      await financialYear.closeFinancialYear(id);
      await expect(
        financialYear.validateTransactionDate('2020-06-15')
      ).rejects.toThrow(/closed/);
    });
  });

  // ── SQL-level filtering ──
  describe('SQL Filtering', () => {
    test('getFinancialYearByDate uses SQL date comparison', async () => {
      const id = fyId();
      await financialYear.createFinancialYear({
        id, name: 'FY 2028', code: 'FY2028',
        start_date: '2028-01-01', end_date: '2028-12-31',
      }, TEST_USER_ID);
      const fy = await financialYear.getFinancialYearByDate('2028-06-01');
      expect(fy).toBeDefined();
      expect(fy.id).toBe(id);
    });

    test('returns null for out-of-range date', async () => {
      const fy = await financialYear.getFinancialYearByDate('2010-06-01');
      expect(fy).toBeNull();
    });
  });

  // ── Overlap Detection ──
  describe('Overlap Detection', () => {
    test('rejects overlapping financial years', async () => {
      await financialYear.createFinancialYear({
        id: fyId(), name: 'FY 2029', code: 'FY2029',
        start_date: '2029-01-01', end_date: '2029-12-31',
      }, TEST_USER_ID);
      await expect(
        financialYear.createFinancialYear({
          id: fyId(), name: 'Overlap FY', code: 'Overlap',
          start_date: '2029-06-01', end_date: '2030-06-01',
        }, TEST_USER_ID)
      ).rejects.toThrow(/Overlapping/);
    });
  });

  // ── Closed FY Rejection ──
  describe('Closed FY Rejection', () => {
    test('closeFinancialYear throws if already closed', async () => {
      const id = fyId();
      await financialYear.createFinancialYear({
        id, name: 'FY 2031', code: 'FY2031',
        start_date: '2031-01-01', end_date: '2031-12-31',
      }, TEST_USER_ID);
      await financialYear.closeFinancialYear(id);
      await expect(
        financialYear.closeFinancialYear(id)
      ).rejects.toThrow(/already closed/);
    });
  });
});
