const repo = require('./supabaseRepository.cjs');
const crypto = require('crypto');

class BankingService {
  async getAccounts() {
    return repo.getAll('bank_accounts');
  }

  async getAccountById(id) {
    return repo.getById('bank_accounts', id);
  }

  async createAccount(data) {
    const id = data.id || `BANK-${Date.now()}-${crypto.randomBytes(6).toString('hex')}`;
    const record = {
      id,
      account_name: data.accountName || data.account_name,
      account_number: data.accountNumber || data.account_number,
      bank_name: data.bankName || data.bank_name,
      branch_code: data.branchCode || data.branch_code || null,
      account_type: data.accountType || data.account_type || 'checking',
      currency: data.currency || 'USD',
      opening_balance: data.openingBalance || data.opening_balance || 0,
      current_balance: data.openingBalance || data.opening_balance || 0,
      status: data.status || 'Active',
      created_by: data.createdBy || data.created_by || null,
    };
    await repo.upsert('bank_accounts', record);
    return repo.getById('bank_accounts', id);
  }

  async updateAccount(id, data) {
    const old = await repo.getById('bank_accounts', id);
    if (!old) throw new Error('Bank account not found');
    const updates = { ...old };
    const fieldMap = {
      accountName: 'account_name', accountNumber: 'account_number',
      bankName: 'bank_name', branchCode: 'branch_code',
      accountType: 'account_type', currency: 'currency', status: 'status',
    };
    for (const [key, dbField] of Object.entries(fieldMap)) {
      if (data[key] !== undefined) updates[dbField] = data[key];
    }
    updates.updated_at = new Date().toISOString();
    const updated = await repo.upsert('bank_accounts', updates);
    return updated;
  }

  async deleteAccount(id) {
    const transactions = await repo.getAll('bank_transactions', { 'data->>account_id': `eq.${id}` });
    if (transactions.length > 0) {
      throw new Error('Cannot delete account with existing transactions');
    }
    await repo.softDelete('bank_accounts', id);
    return { success: true };
  }

  async getTransactions(filters = {}) {
    let rows = await repo.getAll('bank_transactions');
    if (filters.accountId) rows = rows.filter(r => r.account_id === filters.accountId);
    if (filters.type) rows = rows.filter(r => String(r.type || '').toLowerCase() === String(filters.type).toLowerCase());
    if (filters.status) rows = rows.filter(r => String(r.status || '').toLowerCase() === String(filters.status).toLowerCase());
    if (filters.startDate) rows = rows.filter(r => r.date >= filters.startDate);
    if (filters.endDate) rows = rows.filter(r => r.date <= filters.endDate);
    rows.sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
    return rows.slice(0, 500);
  }

  async getTransactionById(id) {
    return repo.getById('bank_transactions', id);
  }

  async createTransaction(data) {
    const id = data.id || `BT-${Date.now()}-${crypto.randomBytes(6).toString('hex')}`;
    const record = {
      id,
      account_id: data.accountId || data.account_id,
      date: data.date || new Date().toISOString().split('T')[0],
      type: data.type,
      amount: data.amount,
      currency: data.currency || 'USD',
      description: data.description,
      reference_type: data.referenceType || data.reference_type || null,
      reference_id: data.referenceId || data.reference_id || null,
      status: data.status || 'pending',
      reconciled: data.reconciled || 0,
      created_by: data.createdBy || data.created_by || null,
    };
    await repo.upsert('bank_transactions', record);

    if (data.type === 'deposit' || data.type === 'transfer_in') {
      const account = await repo.getById('bank_accounts', record.account_id);
      if (account) {
        await repo.upsert('bank_accounts', {
          ...account,
          current_balance: Number(account.current_balance || 0) + Number(data.amount || 0),
        });
      }
    } else if (data.type === 'withdrawal' || data.type === 'transfer_out') {
      const account = await repo.getById('bank_accounts', record.account_id);
      if (account) {
        await repo.upsert('bank_accounts', {
          ...account,
          current_balance: Number(account.current_balance || 0) - Number(data.amount || 0),
        });
      }
    }

    return repo.getById('bank_transactions', id);
  }

  async transferFunds(data) {
    const fromId = data.fromAccountId || data.from_account_id;
    const toId = data.toAccountId || data.to_account_id;
    const amount = Number(data.amount || 0);
    const date = data.date || new Date().toISOString().split('T')[0];

    const fromAccount = await repo.getById('bank_accounts', fromId);
    const toAccount = await repo.getById('bank_accounts', toId);
    if (!fromAccount || !toAccount) throw new Error('Invalid account(s)');

    const outId = `BT-${Date.now()}-out-${crypto.randomBytes(4).toString('hex')}`;
    const inId = `BT-${Date.now()}-in-${crypto.randomBytes(4).toString('hex')}`;

    await repo.upsert('bank_transactions', {
      id: outId, account_id: fromId, date, type: 'transfer_out',
      amount, currency: data.currency || 'USD',
      description: `Transfer to ${toAccount.account_name || toId}`,
      reference_type: 'transfer', reference_id: data.referenceId || null,
      status: 'completed', reconciled: 0, created_by: data.createdBy || null,
    });

    await repo.upsert('bank_transactions', {
      id: inId, account_id: toId, date, type: 'transfer_in',
      amount, currency: data.currency || 'USD',
      description: `Transfer from ${fromAccount.account_name || fromId}`,
      reference_type: 'transfer', reference_id: data.referenceId || null,
      status: 'completed', reconciled: 0, created_by: data.createdBy || null,
    });

    await repo.upsert('bank_accounts', {
      ...fromAccount,
      current_balance: Number(fromAccount.current_balance || 0) - amount,
    });
    await repo.upsert('bank_accounts', {
      ...toAccount,
      current_balance: Number(toAccount.current_balance || 0) + amount,
    });

    return { outId, inId, amount, date };
  }

  async getAccountBalance(id, asOfDate) {
    const account = await repo.getById('bank_accounts', id);
    if (!account) return 0;
    let transactions = await repo.getAll('bank_transactions', { 'data->>account_id': `eq.${id}`, 'data->>status': `eq.completed` });
    if (asOfDate) {
      transactions = transactions.filter(t => t.date <= asOfDate);
    }
    const txTotal = transactions.reduce((sum, t) => {
      const amt = Number(t.amount || 0);
      return sum + (t.type === 'deposit' || t.type === 'transfer_in' ? amt : -amt);
    }, 0);
    return Number(account.opening_balance || 0) + txTotal;
  }

  async getReconciliationSummary(id, startDate, endDate) {
    const transactions = await repo.getAll('bank_transactions', { 'data->>account_id': `eq.${id}` });
    const filtered = transactions.filter(t => t.date >= startDate && t.date <= endDate);
    const deposits = filtered.filter(t => t.type === 'deposit' || t.type === 'transfer_in').reduce((sum, t) => sum + Number(t.amount || 0), 0);
    const withdrawals = filtered.filter(t => t.type === 'withdrawal' || t.type === 'transfer_out').reduce((sum, t) => sum + Number(t.amount || 0), 0);
    return {
      deposits,
      withdrawals,
      net: deposits - withdrawals,
      transactionCount: filtered.length,
      reconciledCount: filtered.filter(t => t.reconciled).length,
    };
  }
}

module.exports = BankingService;
