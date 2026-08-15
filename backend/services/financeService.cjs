const crypto = require('crypto');
const { randomUUID } = require('crypto');
const repo = require('./supabaseRepository.cjs');
const auditService = require('../auditService.cjs');

class FinanceService {
  async _all(table, filters = {}) {
    return repo.getAll(table, filters);
  }

  async _getById(table, id) {
    return repo.getById(table, id);
  }

  async _upsert(table, record) {
    return repo.upsert(table, record);
  }

  async _softDelete(table, id) {
    return repo.softDelete(table, id);
  }

  _validateCurrency(currency) {
    const code = String(currency || 'USD').trim();
    const isoRegex = /^[A-Z]{3}$/;
    if (!isoRegex.test(code)) {
      throw new Error(`Invalid currency code: ${code}. Must be a 3-letter ISO code.`);
    }
  }

  // ── Chart of Accounts ──────────────────────────────────────────────
  async getAccounts() {
    return repo.getAll('chart_of_accounts');
  }

  async getAccountById(id) {
    return repo.getById('chart_of_accounts', id);
  }

  async createAccount(data) {
    this._validateCurrency(data.currency);
    const id = data.id || crypto.randomUUID();
    const record = {
      id,
      code: data.code,
      name: data.name,
      type: data.type,
      category: data.category || null,
      subtype: data.subtype || null,
      parent_id: data.parent_id || null,
      is_active: data.is_active != null ? (data.is_active ? 1 : 0) : 1,
      description: data.description || null,
    };
    await repo.upsert('chart_of_accounts', record);
    return this.getAccountById(id);
  }

  async updateAccount(id, data) {
    const old = await this.getAccountById(id);
    if (!old) throw new Error('Account not found');
    const updates = { ...old };
    const allowed = ['code', 'name', 'type', 'category', 'subtype', 'parent_id', 'is_active', 'description'];
    for (const key of allowed) {
      if (data[key] !== undefined) {
        updates[key] = key === 'is_active' ? (data[key] ? 1 : 0) : data[key];
      }
    }
    updates.updated_at = new Date().toISOString();
    await repo.upsert('chart_of_accounts', updates);
    return this.getAccountById(id);
  }

  async deleteAccount(id) {
    await repo.softDelete('chart_of_accounts', id);
    return { success: true };
  }

  // ── Ledger ─────────────────────────────────────────────────────────
  async getLedger(accountId) {
    let rows = await repo.getAll('ledger_entries');
    if (accountId) {
      rows = rows.filter(e => e.account_id === accountId);
    }
    rows.sort((a, b) => String(b.entry_date || '').localeCompare(String(a.entry_date || '')));
    return rows;
  }

  async saveLedgerEntry(entry, currency = 'USD') {
    const id = entry.id || crypto.randomUUID();
    const record = {
      id,
      account_id: entry.account_id,
      account_code: entry.account_code || null,
      account_name: entry.account_name || null,
      entry_type: entry.entry_type,
      amount: entry.amount,
      currency: entry.currency || currency,
      description: entry.description || null,
      reference_type: entry.reference_type || null,
      reference_id: entry.reference_id || null,
      journal_id: entry.journal_id || null,
      entry_date: entry.entry_date,
      created_by: entry.created_by || null,
    };
    await repo.upsert('ledger_entries', record);
    return repo.getById('ledger_entries', id);
  }

  async reverseLedgerEntriesByReference(referenceType, referenceId) {
    const entries = await repo.getAll('ledger_entries', {
      'data->>reference_type': `eq.${referenceType}`,
      'data->>reference_id': `eq.${referenceId}`,
    });
    const journalId = randomUUID();
    for (const entry of entries) {
      await repo.upsert('ledger_entries', {
        id: randomUUID(),
        account_id: entry.account_id,
        account_code: entry.account_code,
        account_name: entry.account_name,
        entry_type: entry.entry_type === 'debit' ? 'credit' : 'debit',
        amount: entry.amount,
        currency: entry.currency,
        description: `Reversal of ${entry.description || entry.reference_id}`,
        reference_type: 'reversal',
        reference_id: referenceId,
        journal_id: journalId,
        entry_date: new Date().toISOString(),
        created_by: null,
      });
    }
    return journalId;
  }

  async voidExpenseLedger(id) {
    return this.reverseLedgerEntriesByReference('expense', id);
  }

  async voidIncomeLedger(id) {
    return this.reverseLedgerEntriesByReference('income', id);
  }

  // ── Expenses ───────────────────────────────────────────────────────
  async getExpenses() {
    const rows = await repo.getAll('expenses');
    return rows.sort((a, b) => String(b.expense_date || '').localeCompare(String(a.expense_date || '')));
  }

  async createExpense(data) {
    this._validateCurrency(data.currency);
    const id = data.id || crypto.randomUUID();
    const record = {
      id,
      category: data.category,
      vendor_name: data.vendor_name || null,
      amount: data.amount,
      currency: data.currency || 'USD',
      description: data.description || null,
      expense_date: data.expense_date,
      account_id: data.account_id || null,
      payment_method: data.payment_method || null,
      status: data.status || 'pending',
      receipt_url: data.receipt_url || null,
      created_by: data.created_by || null,
    };
    await repo.upsert('expenses', record);
    return repo.getById('expenses', id);
  }

  async updateExpense(id, data) {
    const old = await repo.getById('expenses', id);
    if (!old) throw new Error('Expense not found');
    const updates = { ...old };
    const allowed = ['category', 'vendor_name', 'amount', 'currency', 'description', 'expense_date', 'account_id', 'payment_method', 'status', 'receipt_url'];
    for (const field of allowed) {
      if (data[field] !== undefined) {
        updates[field] = data[field] === null ? null : data[field];
      }
    }
    updates.updated_at = new Date().toISOString();
    const updated = await repo.upsert('expenses', updates);

    if (data.status === 'cancelled') {
      await this.voidExpenseLedger(id);
    }
    return updated;
  }

  async deleteExpense(id) {
    await repo.softDelete('expenses', id);
    return { success: true };
  }

  // ── Income ─────────────────────────────────────────────────────────
  async getIncome() {
    const rows = await repo.getAll('income');
    return rows.sort((a, b) => String(b.income_date || '').localeCompare(String(a.income_date || '')));
  }

  async createIncome(data) {
    this._validateCurrency(data.currency);
    const id = data.id || crypto.randomUUID();
    const record = {
      id,
      source: data.source,
      amount: data.amount,
      currency: data.currency || 'USD',
      description: data.description || null,
      income_date: data.income_date,
      account_id: data.account_id || null,
      payment_method: data.payment_method || null,
      reference: data.reference || null,
      created_by: data.created_by || null,
    };
    await repo.upsert('income', record);
    return repo.getById('income', id);
  }

  async deleteIncome(id) {
    await this.voidIncomeLedger(id);
    await repo.softDelete('income', id);
    return { success: true };
  }

  // ── Budgets ────────────────────────────────────────────────────────
  async getBudgets() {
    const rows = await repo.getAll('budgets');
    return rows.sort((a, b) => String(b.fiscal_year || '').localeCompare(String(a.fiscal_year || '')));
  }

  async createBudget(data) {
    this._validateCurrency(data.currency);
    const id = data.id || crypto.randomUUID();
    const record = {
      id,
      name: data.name,
      fiscal_year: data.fiscal_year,
      category: data.category,
      budgeted_amount: data.budgeted_amount,
      currency: data.currency || 'USD',
      notes: data.notes || null,
      created_by: data.created_by || null,
    };
    await repo.upsert('budgets', record);
    return repo.getById('budgets', id);
  }

  async updateBudget(id, data) {
    const old = await repo.getById('budgets', id);
    if (!old) throw new Error('Budget not found');
    const updates = { ...old };
    const allowed = ['name', 'fiscal_year', 'category', 'budgeted_amount', 'currency', 'notes'];
    for (const field of allowed) {
      if (data[field] !== undefined) {
        updates[field] = data[field];
      }
    }
    updates.updated_at = new Date().toISOString();
    await repo.upsert('budgets', updates);
    return repo.getById('budgets', id);
  }

  async deleteBudget(id) {
    await repo.softDelete('budgets', id);
    return { success: true };
  }
}

module.exports = FinanceService;
