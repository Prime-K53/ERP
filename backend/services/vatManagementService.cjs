const repo = require('./supabaseRepository.cjs');
const crypto = require('crypto');

class VATManagementService {
  calculateVAT(amount, vatRate, vatCategory = 'standard') {
    const rate = Number(vatRate) || 0;
    const netAmount = Number(amount) || 0;
    const vatAmount = netAmount * (rate / 100);
    const grossAmount = netAmount + vatAmount;
    return {
      netAmount: Number(netAmount.toFixed(2)),
      vatRate: rate,
      vatAmount: Number(vatAmount.toFixed(2)),
      grossAmount: Number(grossAmount.toFixed(2)),
      vatCategory,
    };
  }

  async recordVATTransaction(data) {
    const id = data.id || `VAT-${Date.now()}-${crypto.randomBytes(6).toString('hex')}`;
    const period = data.period || new Date().toISOString().slice(0, 7);
    const record = {
      id,
      transaction_type: data.transaction_type,
      reference_id: data.reference_id,
      reference_type: data.reference_type,
      vat_rate: data.vat_rate,
      vat_amount: data.vat_amount,
      net_amount: data.net_amount,
      gross_amount: data.gross_amount,
      vat_category: data.vat_category || 'standard',
      is_recoverable: data.is_recoverable !== undefined ? data.is_recoverable : 1,
      period,
      status: data.status || 'pending',
    };
    await repo.upsert('vat_transactions', record);
    return { id, ...data, period };
  }

  async getVATTransactions(period, filters = {}) {
    let rows = await repo.getAll('vat_transactions', { 'data->>period': `eq.${period}` });
    if (filters.transaction_type) {
      rows = rows.filter(r => r.transaction_type === filters.transaction_type);
    }
    if (filters.status) {
      rows = rows.filter(r => r.status === filters.status);
    }
    if (filters.vat_category) {
      rows = rows.filter(r => r.vat_category === filters.vat_category);
    }
    rows.sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
    return rows;
  }

  async updateVATStatus(id, status) {
    const row = await repo.getById('vat_transactions', id);
    if (!row) return null;
    await repo.upsert('vat_transactions', { ...row, status, updated_at: new Date().toISOString() });
    return { id, status };
  }

  async getVATSummary(period) {
    const rows = await repo.getAll('vat_transactions', { 'data->>period': `eq.${period}` });
    const summary = {
      period,
      outputVAT: 0,
      inputVAT: 0,
      netVAT: 0,
      totalTransactions: rows.length,
      byCategory: {},
    };
    for (const row of rows) {
      const netAmount = Number(row.net_amount || 0);
      const vatAmount = Number(row.vat_amount || 0);
      const grossAmount = Number(row.gross_amount || 0);
      summary.totalTransactions += 1;
      if (row.transaction_type === 'sale') {
        summary.outputVAT += vatAmount;
      } else if (row.transaction_type === 'purchase') {
        summary.inputVAT += vatAmount;
      }
      const categoryKey = `${row.transaction_type}_${row.vat_category}`;
      if (!summary.byCategory[categoryKey]) {
        summary.byCategory[categoryKey] = {
          transaction_type: row.transaction_type,
          vat_category: row.vat_category,
          count: 0,
          total_net: 0,
          total_vat: 0,
          total_gross: 0,
        };
      }
      summary.byCategory[categoryKey].count += 1;
      summary.byCategory[categoryKey].total_net += netAmount;
      summary.byCategory[categoryKey].total_vat += vatAmount;
      summary.byCategory[categoryKey].total_gross += grossAmount;
    }
    summary.outputVAT = Number(summary.outputVAT.toFixed(2));
    summary.inputVAT = Number(summary.inputVAT.toFixed(2));
    summary.netVAT = Number((summary.outputVAT - summary.inputVAT).toFixed(2));
    return summary;
  }

  async getVATPeriods() {
    const rows = await repo.getAll('vat_transactions');
    const periodMap = new Map();
    for (const row of rows) {
      if (!row.period) continue;
      if (!periodMap.has(row.period)) {
        periodMap.set(row.period, {
          period: row.period,
          transaction_count: 0,
          total_vat: 0,
          last_updated: row.created_at || '',
        });
      }
      const p = periodMap.get(row.period);
      p.transaction_count += 1;
      p.total_vat += Number(row.vat_amount || 0);
      if ((row.created_at || '') > p.last_updated) p.last_updated = row.created_at;
    }
    return Array.from(periodMap.values()).sort((a, b) => String(b.period).localeCompare(String(a.period)));
  }

  async reverseVATTransaction(id, reason) {
    const existing = await repo.getById('vat_transactions', id);
    if (!existing) throw new Error('VAT transaction not found');
    const reversalId = crypto.randomUUID();
    await repo.upsert('vat_transactions', {
      id: reversalId,
      transaction_type: existing.transaction_type,
      reference_id: existing.reference_id,
      reference_type: existing.reference_type,
      vat_rate: existing.vat_rate,
      vat_amount: -Number(existing.vat_amount || 0),
      net_amount: -Number(existing.net_amount || 0),
      gross_amount: -Number(existing.gross_amount || 0),
      vat_category: existing.vat_category,
      is_recoverable: existing.is_recoverable,
      period: existing.period,
      status: 'reversed',
      reversal_of: id,
      reversal_reason: reason || null,
    });
    await repo.upsert('vat_transactions', { ...existing, status: 'reversed', updated_at: new Date().toISOString() });
    return { id: reversalId, originalId: id };
  }

  async importFromInvoices(period) {
    const invoices = await repo.getAll('invoices', { 'data->>period': `eq.${period}` });
    const results = [];
    for (const invoice of invoices) {
      const vatAmount = Number(invoice.total_amount || 0) * 0.16;
      const result = await this.recordVATTransaction({
        transaction_type: 'sale',
        reference_id: invoice.id,
        reference_type: 'invoice',
        vat_rate: 16,
        vat_amount: vatAmount,
        net_amount: Number(invoice.total_amount || 0) - vatAmount,
        gross_amount: Number(invoice.total_amount || 0),
        vat_category: 'standard',
        is_recoverable: 0,
        period,
        status: 'posted',
      });
      results.push(result);
    }
    return { imported: results.length, results };
  }
}

module.exports = VATManagementService;
