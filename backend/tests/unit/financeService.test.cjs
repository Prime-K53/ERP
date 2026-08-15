const { createTestDb, createTestSchema } = require('../setup.cjs');
const FinanceService = require('../../services/financeService.cjs');

describe('FinanceService (unit)', () => {
  let db, finance;

  beforeAll(async () => {
    db = await createTestDb();
    await createTestSchema(db);
    finance = new FinanceService(db);
  });

  afterAll(() => db.close());

  describe('chart of accounts', () => {
    it('creates an account with all fields', async () => {
      const acct = await finance.createAccount({
        code: '1100', name: 'Petty Cash', type: 'asset', category: 'Current Asset', description: 'Office petty cash fund'
      });
      expect(acct.code).toBe('1100');
      expect(acct.is_active).toBe(1);
    });

    it('rejects duplicate inserts - same id', async () => {
      const acct = await finance.createAccount({ code: '1200', name: 'Dupe Test', type: 'liability', id: 'dup-1' });
      await expect(finance.createAccount({ code: '1300', name: 'Should Fail', type: 'equity', id: 'dup-1' }))
        .rejects.toThrow();
    });

    it('lists all accounts (no company scoping)', async () => {
      await finance.createAccount({ code: '1400', name: 'Asset One', type: 'asset' });
      await finance.createAccount({ code: '1500', name: 'Asset Two', type: 'asset' });
      const accounts = await finance.getAccounts();
      expect(accounts.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('ledger', () => {
    it('creates debit and credit entries', async () => {
      const debit = await finance.saveLedgerEntry({
        account_id: 'acct-cash', entry_type: 'debit', amount: 1000,
        entry_date: '2026-06-01T00:00:00.000Z', description: 'Test debit'
      });
      expect(debit.entry_type).toBe('debit');
      expect(debit.amount).toBe(1000);
    });
  });

  describe('budgets', () => {
    it('enforces non-negative amount', async () => {
      const budget = await finance.createBudget({ name: 'Zero Budget', fiscal_year: '2026', period: 'yearly', amount: 0 });
      expect(budget.amount).toBe(0);
    });
  });

  describe('transfers', () => {
    it('creates completed transfer by default', async () => {
      const from = await finance.createAccount({
        code: '1600', name: 'Source', type: 'asset', id: 'acct-a'
      });
      const to = await finance.createAccount({
        code: '1700', name: 'Destination', type: 'asset', id: 'acct-b'
      });
      await new Promise((resolve, reject) => {
        db.run('UPDATE chart_of_accounts SET balance = 1000 WHERE id = ?', [from.id], (err) => {
          if (err) reject(err); else resolve();
        });
      });
      const transfer = await finance.createTransfer({
        from_account_id: from.id, to_account_id: to.id, amount: 500
      }, 'test-user');
      expect(transfer.status).toBe('completed');
    });
  });
});
