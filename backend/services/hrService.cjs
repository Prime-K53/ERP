const crypto = require('crypto');
const repo = require('./supabaseRepository.cjs');

class HRService {
  async _saveLedgerEntry(entry) {
    const id = crypto.randomUUID();
    const record = {
      id,
      data: {
        account_id: entry.account_id,
        entry_type: entry.entry_type,
        amount: entry.amount,
        currency: entry.currency || 'USD',
        description: entry.description || null,
        reference_type: entry.reference_type || null,
        reference_id: entry.reference_id || null,
        entry_date: entry.entry_date || new Date().toISOString(),
      },
    };
    await repo.upsert('ledger_entries', record);
    return id;
  }

  async postPayrollLedger(run, currency = 'USD') {
    const accounts = await repo.accounts.getAll({ 'data->>type': 'eq.expense' });
    const expenseAccount = accounts.find((a) => {
      const d = a.data || a;
      const name = String(d.name || '').toLowerCase();
      return name.includes('wage') || name.includes('salary') || name.includes('payroll') || d.code === '6300';
    });
    const liabilityAccounts = await repo.accounts.getAll({ 'data->>type': 'eq.liability' });
    const liabilityAccount = liabilityAccounts.find((a) => {
      const d = a.data || a;
      const name = String(d.name || '').toLowerCase();
      return name.includes('payable') || name.includes('accrued');
    });
    const totalAmount = run.total_gross || 0;
    if (totalAmount <= 0 || !expenseAccount || !liabilityAccount) return;
    await this._saveLedgerEntry({
      account_id: expenseAccount.id, entry_type: 'debit', amount: totalAmount, currency,
      description: `Payroll ${run.name || run.id}`,
      reference_type: 'payroll', reference_id: run.id,
    });
    await this._saveLedgerEntry({
      account_id: liabilityAccount.id, entry_type: 'credit', amount: totalAmount, currency,
      description: `Payroll liability ${run.name || run.id}`,
      reference_type: 'payroll', reference_id: run.id,
    });
  }

  async getEmployees() {
    const rows = await repo.employees.getAll();
    rows.sort((a, b) => String(a.data?.name || a.name || '').localeCompare(String(b.data?.name || b.name || '')));
    return rows.map((r) => ({ ...r, ...(r.data || {}) }));
  }

  async createEmployee(data) {
    const id = data.id || crypto.randomUUID();
    const record = {
      id,
      data: {
        name: data.name,
        email: data.email || null,
        phone: data.phone || null,
        department: data.department || null,
        role: data.role || null,
        status: data.status || 'Active',
        salary: data.salary || 0,
      },
    };
    await repo.employees.upsert(record);
    const row = await repo.employees.getById(id);
    return { ...row, ...(row.data || {}) };
  }

  async updateEmployee(id, data) {
    const old = await repo.employees.getById(id);
    if (!old) return null;
    const oldData = old.data || old;
    const updated = {
      ...old,
      data: { ...oldData },
      updated_at: new Date().toISOString(),
    };
    const allowed = ['name', 'email', 'phone', 'department', 'role', 'status', 'salary'];
    for (const field of allowed) {
      if (data[field] !== undefined) {
        updated.data[field] = data[field];
      }
    }
    await repo.employees.upsert(updated);
    const row = await repo.employees.getById(id);
    return { ...row, ...(row.data || {}) };
  }

  async deleteEmployee(id) {
    await repo.employees.softDelete(id);
    return { success: true };
  }

  async getPayrollRuns() {
    const rows = await repo.payrollRuns.getAll();
    rows.sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
    return rows.map((r) => ({ ...r, ...(r.data || {}) }));
  }

  async createPayrollRun(data, currency = 'USD') {
    const id = data.id || crypto.randomUUID();
    const record = {
      id,
      data: {
        name: data.name,
        period_start: data.period_start,
        period_end: data.period_end,
        status: data.status || 'Draft',
        total_gross: data.total_gross || 0,
        total_deductions: data.total_deductions || 0,
        total_net: data.total_net || 0,
        employee_count: data.employee_count || 0,
      },
    };
    await repo.payrollRuns.upsert(record);
    const run = await repo.payrollRuns.getById(id);
    const runData = run ? { ...run, ...(run.data || {}) } : record.data;
    await this.postPayrollLedger(runData, currency);
    return runData;
  }

  async getPayslips() {
    const rows = await repo.payslips.getAll();
    rows.sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
    return rows.map((r) => ({ ...r, ...(r.data || {}) }));
  }

  async createPayslip(data) {
    const id = data.id || crypto.randomUUID();
    const record = {
      id,
      data: {
        employee_id: data.employee_id,
        payroll_run_id: data.payroll_run_id,
        gross_pay: data.gross_pay || 0,
        deductions: data.deductions || 0,
        net_pay: data.net_pay || 0,
        pay_period: data.pay_period,
        status: data.status || 'Draft',
      },
    };
    await repo.payslips.upsert(record);
    const row = await repo.payslips.getById(id);
    return { ...row, ...(row.data || {}) };
  }
}

module.exports = HRService;
