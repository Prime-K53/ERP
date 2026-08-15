const repo = require('./supabaseRepository.cjs');

class FinancialReportingService {
  async getProfitAndLoss(startDate, endDate, currency = 'USD') {
    try {
      const invoices = await repo.getAll('invoices');
      const ledgerEntries = await repo.getAll('ledger_entries');
      const accounts = await repo.getAll('chart_of_accounts');

      const filteredInvoices = invoices.filter(i => {
        const d = i.created_at?.slice(0, 10);
        return i.status !== 'cancelled' && d >= startDate && d <= endDate && (i.currency || 'USD') === currency;
      });
      const revenue = filteredInvoices.reduce((sum, i) => sum + Number(i.total_amount || 0), 0);

      const coaCodes = new Map(accounts.map(a => [a.id, a.code]));
      const debitEntries = ledgerEntries.filter(e => e.entry_type === 'debit');
      const cogsEntries = debitEntries.filter(e => {
        const code = coaCodes.get(e.account_id) || '';
        return code.startsWith('5');
      }).filter(e => {
        const d = e.entry_date?.slice(0, 10);
        return d >= startDate && d <= endDate && (e.currency || 'USD') === currency;
      });
      const cogs = cogsEntries.reduce((sum, e) => sum + Number(e.amount || 0), 0);

      const opexEntries = debitEntries.filter(e => {
        const code = coaCodes.get(e.account_id) || '';
        return code.startsWith('6');
      }).filter(e => {
        const d = e.entry_date?.slice(0, 10);
        return d >= startDate && d <= endDate && (e.currency || 'USD') === currency;
      });
      const operatingExpenses = opexEntries.reduce((sum, e) => sum + Number(e.amount || 0), 0);

      const grossProfit = revenue - cogs;
      const netProfit = grossProfit - operatingExpenses;
      const profitMargin = revenue > 0 ? ((netProfit / revenue) * 100).toFixed(2) : 0;

      return {
        period: { startDate, endDate },
        revenue: Number(revenue.toFixed(2)),
        costOfGoodsSold: Number(cogs.toFixed(2)),
        grossProfit: Number(grossProfit.toFixed(2)),
        grossProfitMargin: revenue > 0 ? Number(((grossProfit / revenue) * 100).toFixed(2)) : 0,
        operatingExpenses: Number(operatingExpenses.toFixed(2)),
        netProfit: Number(netProfit.toFixed(2)),
        netProfitMargin: Number(profitMargin),
      };
    } catch (error) {
      console.error('[Reports] P&L error:', error);
      throw error;
    }
  }

  async getBalanceSheet(asOfDate, currency = 'USD') {
    try {
      const accounts = await repo.getAll('chart_of_accounts');
      const assets = accounts.filter(a => a.type === 'asset' && a.is_active).sort((a, b) => String(a.code || '').localeCompare(String(b.code || '')));
      const liabilities = accounts.filter(a => a.type === 'liability' && a.is_active).sort((a, b) => String(a.code || '').localeCompare(String(b.code || '')));
      const equity = accounts.filter(a => a.type === 'equity' && a.is_active).sort((a, b) => String(a.code || '').localeCompare(String(b.code || '')));

      const totalAssets = assets.reduce((sum, acc) => sum + (Number(acc.balance) || 0), 0);
      const totalLiabilities = liabilities.reduce((sum, acc) => sum + (Number(acc.balance) || 0), 0);
      const totalEquity = equity.reduce((sum, acc) => sum + (Number(acc.balance) || 0), 0);

      return {
        asOfDate: asOfDate || new Date().toISOString().split('T')[0],
        assets: { details: assets, total: Number(totalAssets.toFixed(2)) },
        liabilities: { details: liabilities, total: Number(totalLiabilities.toFixed(2)) },
        equity: { details: equity, total: Number(totalEquity.toFixed(2)) },
        balanced: Math.abs(totalAssets - (totalLiabilities + totalEquity)) < 0.01,
      };
    } catch (error) {
      console.error('[Reports] Balance Sheet error:', error);
      throw error;
    }
  }

  async getCashFlowStatement(startDate, endDate) {
    try {
      const ledgerEntries = await repo.getAll('ledger_entries');
      const accounts = await repo.getAll('chart_of_accounts');
      const coaCodes = new Map(accounts.map(a => [a.id, a.code]));

      const filteredEntries = ledgerEntries.filter(e => {
        const d = e.entry_date?.slice(0, 10);
        return d >= startDate && d <= endDate;
      });

      const operatingEntries = filteredEntries.filter(e => {
        const code = coaCodes.get(e.account_id) || '';
        return ['1200', '4000', '5000', '6000'].includes(code);
      });
      const operatingCashFlow = operatingEntries.reduce((sum, e) => {
        return sum + (e.entry_type === 'debit' ? Number(e.amount || 0) : -Number(e.amount || 0));
      }, 0);

      const investingEntries = filteredEntries.filter(e => {
        const code = coaCodes.get(e.account_id) || '';
        return code.startsWith('1') && code !== '1200';
      });
      const investingCashFlow = investingEntries.reduce((sum, e) => {
        return sum + (e.entry_type === 'debit' ? -Number(e.amount || 0) : Number(e.amount || 0));
      }, 0);

      const financingEntries = filteredEntries.filter(e => {
        const code = coaCodes.get(e.account_id) || '';
        return code.startsWith('2') || code.startsWith('3');
      });
      const financingCashFlow = financingEntries.reduce((sum, e) => {
        return sum + (e.entry_type === 'debit' ? Number(e.amount || 0) : -Number(e.amount || 0));
      }, 0);

      const netCashFlow = operatingCashFlow + investingCashFlow + financingCashFlow;

      return {
        period: { startDate, endDate },
        operatingActivities: { netCashFlow: Number(operatingCashFlow.toFixed(2)), entries: operatingEntries },
        investingActivities: { netCashFlow: Number(investingCashFlow.toFixed(2)), entries: investingEntries },
        financingActivities: { netCashFlow: Number(financingCashFlow.toFixed(2)), entries: financingEntries },
        netCashFlow: Number(netCashFlow.toFixed(2)),
      };
    } catch (error) {
      console.error('[Reports] Cash Flow error:', error);
      throw error;
    }
  }

  async getARAging(asOfDate) {
    const invoices = await repo.getAll('invoices');
    const unpaid = invoices.filter(i => String(i.status || '').toLowerCase() !== 'paid');
    const buckets = { current: 0, days1to30: 0, days31to60: 0, days61to90: 0, over90: 0 };
    const asOf = new Date(asOfDate || new Date().toISOString().split('T')[0]);
    for (const inv of unpaid) {
      const due = new Date(inv.due_date || inv.created_at || '');
      const days = Math.floor((asOf - due) / (1000 * 60 * 60 * 24));
      const amount = Number(inv.total_amount || 0);
      if (days <= 0) buckets.current += amount;
      else if (days <= 30) buckets.days1to30 += amount;
      else if (days <= 60) buckets.days31to60 += amount;
      else if (days <= 90) buckets.days61to90 += amount;
      else buckets.over90 += amount;
    }
    return { asOfDate, buckets, total: Object.values(buckets).reduce((s, v) => s + v, 0) };
  }

  async getAPAging(asOfDate) {
    const invoices = await repo.getAll('invoices');
    const unpaid = invoices.filter(i => String(i.status || '').toLowerCase() !== 'paid');
    const buckets = { current: 0, days1to30: 0, days31to60: 0, days61to90: 0, over90: 0 };
    const asOf = new Date(asOfDate || new Date().toISOString().split('T')[0]);
    for (const inv of unpaid) {
      const due = new Date(inv.due_date || inv.created_at || '');
      const days = Math.floor((asOf - due) / (1000 * 60 * 60 * 24));
      const amount = Number(inv.total_amount || 0);
      if (days <= 0) buckets.current += amount;
      else if (days <= 30) buckets.days1to30 += amount;
      else if (days <= 60) buckets.days31to60 += amount;
      else if (days <= 90) buckets.days61to90 += amount;
      else buckets.over90 += amount;
    }
    return { asOfDate, buckets, total: Object.values(buckets).reduce((s, v) => s + v, 0) };
  }

  async getTrialBalance(asOfDate) {
    const accounts = await repo.getAll('chart_of_accounts');
    const entries = await repo.getAll('ledger_entries');
    const filteredEntries = entries.filter(e => {
      const d = e.entry_date?.slice(0, 10);
      return d <= asOfDate;
    });
    const balances = new Map();
    for (const entry of filteredEntries) {
      const existing = balances.get(entry.account_id) || { debit: 0, credit: 0 };
      if (entry.entry_type === 'debit') existing.debit += Number(entry.amount || 0);
      else existing.credit += Number(entry.amount || 0);
      balances.set(entry.account_id, existing);
    }
    return accounts.map(a => ({
      id: a.id,
      code: a.code,
      name: a.name,
      type: a.type,
      debit: Number((balances.get(a.id)?.debit || 0).toFixed(2)),
      credit: Number((balances.get(a.id)?.credit || 0).toFixed(2)),
      balance: Number(((balances.get(a.id)?.debit || 0) - (balances.get(a.id)?.credit || 0)).toFixed(2)),
    }));
  }

  async getBudgetVsActual(fiscalYear, period) {
    const budgets = await repo.getAll('budgets', { 'data->>fiscal_year': `eq.${fiscalYear}` });
    const invoices = await repo.getAll('invoices');
    const expenses = await repo.getAll('expenses');
    const report = [];
    for (const budget of budgets) {
      const actual = invoices
        .filter(i => i.category === budget.category)
        .reduce((sum, i) => sum + Number(i.total_amount || 0), 0) +
        expenses
        .filter(e => e.category === budget.category)
        .reduce((sum, e) => sum + Number(e.amount || 0), 0);
      report.push({
        category: budget.category,
        budgeted: Number(budget.budgeted_amount || 0),
        actual: Number(actual.toFixed(2)),
        variance: Number((Number(budget.budgeted_amount || 0) - actual).toFixed(2)),
        percentVariance: budget.budgeted_amount > 0 ? Number(((actual / Number(budget.budgeted_amount || 0)) * 100).toFixed(2)) : 0,
      });
    }
    return { fiscalYear, period, categories: report };
  }

  async getVATReport(period) {
    const vatService = new (require('./vatManagementService.cjs'))();
    const summary = await vatService.getVATSummary(period);
    const transactions = await vatService.getVATTransactions(period);
    return { period, summary, transactions };
  }
}

module.exports = FinancialReportingService;
