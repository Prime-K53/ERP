const crypto = require('crypto');
const repo = require('./supabaseRepository.cjs');

class FinancialYearService {
  async getFinancialYears() {
    const rows = await repo.financialYears.getAll();
    rows.sort((a, b) => String(b.data?.start_date || b.start_date || '').localeCompare(String(a.data?.start_date || a.start_date || '')));
    return rows.map((r) => ({ ...r, ...(r.data || {}) }));
  }

  async getFinancialYearById(id) {
    const row = await repo.financialYears.getById(id);
    if (!row) return null;
    return { ...row, ...(row.data || {}) };
  }

  async getDefaultFinancialYear() {
    let fy = await this._getActiveDefault();
    if (!fy) {
      fy = await this._getLatestActive();
    }

    if (fy) {
      const today = new Date().toISOString().slice(0, 10);
      if (today > fy.end_date) {
        const nextYear = new Date(fy.end_date).getFullYear() + 1;
        const nextStartDate = `${nextYear}-01-01`;
        const nextEndDate = `${nextYear}-12-31`;

        await this.closeFinancialYear(fy.id);

        fy = await this.createFinancialYear({
          name: String(nextYear),
          code: `FY${nextYear}`,
          start_date: nextStartDate,
          end_date: nextEndDate,
          is_default: true,
          status: 'Active',
          is_closed: false,
        }, '');
      }
    }

    return fy || null;
  }

  async _getActiveDefault() {
    const rows = await repo.financialYears.getAll({ 'data->>is_default': 'eq.1', 'data->>status': 'eq.Active' });
    return rows[0] ? { ...rows[0], ...(rows[0].data || {}) } : null;
  }

  async _getLatestActive() {
    const rows = await repo.financialYears.getAll({ 'data->>status': 'eq.Active' });
    rows.sort((a, b) => String(b.data?.start_date || b.start_date || '').localeCompare(String(a.data?.start_date || a.start_date || '')));
    return rows[0] ? { ...rows[0], ...(rows[0].data || {}) } : null;
  }

  async getFinancialYearByDate(date) {
    const rows = await repo.financialYears.getAll();
    const row = rows.find((r) => {
      const d = r.data || r;
      return date >= d.start_date && date <= d.end_date;
    });
    return row ? { ...row, ...(row.data || {}) } : null;
  }

  async createFinancialYear(data, userId) {
    const id = data.id || crypto.randomUUID();
    const existing = await repo.financialYears.getAll({
      'data->>status': 'eq.Active',
    });
    const overlapping = existing.find((r) => {
      const d = r.data || r;
      return data.end_date >= d.start_date && data.start_date <= d.end_date;
    });
    if (overlapping) {
      throw new Error('Overlapping financial year already exists for this period');
    }
    const hasAny = existing.length > 0;
    const isDefault = data.is_default !== undefined ? (data.is_default ? 1 : 0) : (!hasAny ? 1 : 0);
    if (isDefault) {
      for (const r of existing) {
        const d = r.data || r;
        if (d.is_default) {
          await repo.financialYears.upsert({ ...r, data: { ...d, is_default: 0 } });
        }
      }
    }
    const record = {
      id,
      data: {
        name: data.name,
        code: data.code || '',
        start_date: data.start_date,
        end_date: data.end_date,
        is_default: isDefault ? 1 : 0,
        is_closed: data.is_closed ? 1 : 0,
        status: data.status || 'Active',
        created_by: userId || '',
      },
    };
    await repo.financialYears.upsert(record);
    return this.getFinancialYearById(id);
  }

  async updateFinancialYear(id, data) {
    const fy = await this.getFinancialYearById(id);
    if (!fy) throw new Error('Financial year not found');

    const updated = { ...fy };
    if (data.name !== undefined) updated.name = data.name;
    if (data.code !== undefined) updated.code = data.code;
    if (data.start_date !== undefined) updated.start_date = data.start_date;
    if (data.end_date !== undefined) updated.end_date = data.end_date;
    if (data.status !== undefined) updated.status = data.status;
    if (data.is_closed !== undefined) updated.is_closed = data.is_closed ? 1 : 0;
    if (data.is_default !== undefined) {
      if (data.is_default) {
        const allFy = await this.getFinancialYears();
        for (const f of allFy) {
          if (f.id !== id && f.is_default) {
            await repo.financialYears.upsert({ ...f, is_default: 0, updated_at: new Date().toISOString() });
          }
        }
      }
      updated.is_default = data.is_default ? 1 : 0;
    }

    await repo.financialYears.upsert({ ...updated, updated_at: new Date().toISOString() });
    return this.getFinancialYearById(id);
  }

  async closeFinancialYear(id) {
    const fy = await this.getFinancialYearById(id);
    if (!fy) throw new Error('Financial year not found');
    if (fy.is_closed) throw new Error('Financial year is already closed');

    const nextFy = await repo.financialYears.getAll({
      'data->>status': 'eq.Active',
    });
    const next = nextFy.find((r) => {
      const d = r.data || r;
      const nextDay = new Date(fy.end_date);
      nextDay.setDate(nextDay.getDate() + 1);
      return d.start_date === nextDay.toISOString().slice(0, 10);
    });

    const carryForwardBalances = async () => {
      const balanceSheetAccounts = await repo.accounts.getAll({
        'data->>type': { in: 'Asset,Liability,Equity' },
      });
      if (balanceSheetAccounts.length > 0 && next) {
        const entryDate = next.data?.start_date || next.start_date;
        for (const account of balanceSheetAccounts) {
          const d = account.data || account;
          const isDebitNormal = d.type === 'Asset';
          const lineId = crypto.randomUUID();
          const absBalance = Math.abs(d.balance || 0);
          const entryType = d.balance > 0
            ? (isDebitNormal ? 'debit' : 'credit')
            : (isDebitNormal ? 'credit' : 'debit');
          await repo.upsert('ledger_entries', {
            id: lineId,
            data: {
              account_id: account.id,
              entry_type: entryType,
              amount: absBalance,
              entry_date: entryDate,
              description: `Opening balance - ${d.name} (carried forward from FY ${fy.name})`,
              created_at: new Date().toISOString(),
            },
          });
        }
      }
    };

    await carryForwardBalances();

    await repo.financialYears.upsert({
      ...fy,
      data: { ...(fy.data || fy), is_closed: 1, status: 'Closed' },
      updated_at: new Date().toISOString(),
    });
    return this.getFinancialYearById(id);
  }

  async deleteFinancialYear(id) {
    const fy = await this.getFinancialYearById(id);
    if (!fy) throw new Error('Financial year not found');
    if (fy.is_default) {
      throw new Error('Cannot delete the default financial year. Set another year as default first.');
    }
    await repo.financialYears.softDelete(id);
    return { success: true };
  }

  async getOrCreateDefaultFinancialYear(userId) {
    let fy = await this.getDefaultFinancialYear();
    if (fy) return fy;

    const now = new Date();
    const year = now.getFullYear();
    const startDate = `${year}-01-01`;
    const endDate = `${year}-12-31`;

    fy = await this.createFinancialYear({
      name: `${year}`,
      code: `FY${year}`,
      start_date: startDate,
      end_date: endDate,
      is_default: true,
      status: 'Active',
      is_closed: false,
    }, userId);

    return fy;
  }

  async validateTransactionDate(date) {
    const fy = await this.getFinancialYearByDate(date);
    if (!fy) {
      throw new Error(`Selected date does not belong to any active Financial Year. Please switch Financial Year or choose a valid date.`);
    }
    if (fy.is_closed) {
      throw new Error(`Financial Year "${fy.name}" is closed. No new transactions can be created.`);
    }
    return fy;
  }
}

module.exports = FinancialYearService;
