const BaseAIService = require('./baseService.cjs');

class CashFlowForecaster extends BaseAIService {
  async forecast( options = {}) {
    const days = options.days || 90;

    const invoices = await this._all(
      `SELECT id, total, status, created_at, due_date FROM invoices WHERE status 
 IN ('pending','paid','overdue')`,
      []
    );

    const expenses = await this._all(
      `SELECT id, amount, status, expense_date FROM expensesstatus IN ('pending','paid')`,
      []
    );

    const ar = await this._all(
      `SELECT id, amount, balance_due, due_date, status FROM accounts_receivable`,
      []
    );

    const ap = await this._all(
      `SELECT id, amount, balance_due, due_date, status FROM accounts_payable`,
      []
    );

    const ledger = await this._all(
      `SELECT entry_date, entry_type, amount FROM ledger_entriesentry_date >= date('now', '-90 days')`,
      []
    );

    const historicalIn = this._aggregateByDay(
      ledger.filter(l => l.entry_type === 'debit'),
      'entry_date', 'amount'
    );
    const historicalOut = this._aggregateByDay(
      ledger.filter(l => l.entry_type === 'credit'),
      'entry_date', 'amount'
    );

    const dailyBalances = this._projectDailyBalances(invoices, expenses, ar, ap, ledger, days);
    const trend = this._calcTrend(historicalIn, historicalOut);
    const summary = this._calcSummary(dailyBalances, invoices, expenses, ar, ap);

    return {
      projection: dailyBalances,
      summary,
      trend,
      parameters: { forecastDays: days, confidenceInterval: '±15%' }
    };
  }

  _aggregateByDay(entries, dateField, amountField) {
    const map = {};
    for (const e of entries) {
      const day = this._serializeDate(e[dateField]);
      if (!day) continue;
      map[day] = (map[day] || 0) + this._safeNumber(e[amountField]);
    }
    return Object.entries(map).map(([date, amount]) => ({ date, amount: Math.round(amount * 100) / 100 }));
  }

  _projectDailyBalances(invoices, expenses, ar, ap, ledger, days) {
    const today = new Date();
    const projections = [];
    let cashBalance = this._estimateCurrentCash(ledger);

    for (let d = 0; d < days; d++) {
      const date = new Date(today);
      date.setDate(date.getDate() + d);
      const dateStr = date.toISOString().split('T')[0];
      let inflow = 0;
      let outflow = 0;

      for (const inv of invoices) {
        if (inv.due_date && this._serializeDate(inv.due_date) === dateStr && inv.status !== 'paid') {
          inflow += this._safeNumber(inv.total);
        }
      }
      for (const e of expenses) {
        if (e.expense_date && this._serializeDate(e.expense_date) === dateStr && e.status !== 'paid') {
          outflow += this._safeNumber(e.amount);
        }
      }
      for (const r of ar) {
        if (r.due_date && this._serializeDate(r.due_date) === dateStr) {
          inflow += this._safeNumber(r.balance_due || r.amount);
        }
      }
      for (const p of ap) {
        if (p.due_date && this._serializeDate(p.due_date) === dateStr) {
          outflow += this._safeNumber(p.balance_due || p.amount);
        }
      }

      cashBalance += inflow - outflow;
      projections.push({
        date: dateStr,
        inflow: Math.round(inflow * 100) / 100,
        outflow: Math.round(outflow * 100) / 100,
        netFlow: Math.round((inflow - outflow) * 100) / 100,
        balance: Math.round(cashBalance * 100) / 100
      });
    }
    return projections;
  }

  _estimateCurrentCash(ledger) {
    const relevantTypes = ['cash', 'bank', 'checking', 'savings', 'petty_cash'];
    let balance = 0;
    for (const entry of ledger) {
      const sign = entry.entry_type === 'debit' ? 1 : -1;
      balance += sign * this._safeNumber(entry.amount);
    }
    return Math.max(balance, 1000);
  }

  _calcTrend(histIn, histOut) {
    const totalIn = histIn.reduce((s, d) => s + d.amount, 0);
    const totalOut = histOut.reduce((s, d) => s + d.amount, 0);
    const avgIn = histIn.length > 0 ? totalIn / histIn.length : 0;
    const avgOut = histOut.length > 0 ? totalOut / histOut.length : 0;
    return {
      averageDailyInflow: Math.round(avgIn * 100) / 100,
      averageDailyOutflow: Math.round(avgOut * 100) / 100,
      netDailyAverage: Math.round((avgIn - avgOut) * 100) / 100,
      direction: avgIn >= avgOut ? 'positive' : 'negative'
    };
  }

  _calcSummary(projections, invoices, expenses, ar, ap) {
    const finalBalance = projections.length > 0 ? projections[projections.length - 1].balance : 0;
    const minBalance = Math.min(...projections.map(p => p.balance));
    const totalIn = projections.reduce((s, p) => s + p.inflow, 0);
    const totalOut = projections.reduce((s, p) => s + p.outflow, 0);
    return {
      startingBalance: projections.length > 0 ? projections[0].balance - projections[0].netFlow : 0,
      finalProjectedBalance: finalBalance,
      minimumProjectedBalance: Math.round(minBalance * 100) / 100,
      totalProjectedInflow: Math.round(totalIn * 100) / 100,
      totalProjectedOutflow: Math.round(totalOut * 100) / 100,
      netProjected: Math.round((totalIn - totalOut) * 100) / 100,
      daysUntilNegative: minBalance < 0 ? projections.findIndex(p => p.balance < 0) : null,
      outstandingReceivables: ar.reduce((s, r) => s + this._safeNumber(r.balance_due || r.amount), 0),
      outstandingPayables: ap.reduce((s, p) => s + this._safeNumber(p.balance_due || p.amount), 0),
      unpaidInvoices: invoices.filter(i => i.status !== 'paid').length,
      riskLevel: minBalance < 0 ? 'high' : finalBalance < projections[0].balance * 0.5 ? 'medium' : 'low'
    };
  }
}

module.exports = CashFlowForecaster;
