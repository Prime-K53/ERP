const crypto = require('crypto');
const repo = require('./supabaseRepository.cjs');

class ProcurementService {

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

  async postGoodsReceiptLedger(grn, currency = 'USD') {
    const items = await repo.purchaseOrderItems.getAll({ 'data->>purchase_order_id': `eq.${grn.purchase_order_id}` });
    const totalAmount = items.reduce((sum, item) => sum + (Number(item.data?.total_price || item.total_price || 0)), 0);
    if (totalAmount <= 0) return;
    const inventoryAccount = await repo.accounts.getAll({ 'data->>type': 'eq.asset' }).then(rows => rows.find((a) => {
      const d = a.data || a;
      const name = String(d.name || '').toLowerCase();
      return name.includes('inventory') || d.code === '1200';
    }));
    const apAccount = await repo.accounts.getAll({ 'data->>type': 'eq.liability' }).then(rows => rows.find((a) => {
      const d = a.data || a;
      const name = String(d.name || '').toLowerCase();
      return name.includes('payable') || d.code === '2000';
    }));
    if (inventoryAccount && apAccount) {
      const po = await repo.purchaseOrders.getById(grn.purchase_order_id);
      const poCurrency = po?.data?.currency || po?.currency || currency;
      await this._saveLedgerEntry({
        account_id: inventoryAccount.id, entry_type: 'debit', amount: totalAmount,
        currency: poCurrency, description: 'Inventory receipt',
        reference_type: 'goods_receipt', reference_id: grn.id,
      });
      await this._saveLedgerEntry({
        account_id: apAccount.id, entry_type: 'credit', amount: totalAmount,
        currency: poCurrency, description: 'AP accrual',
        reference_type: 'goods_receipt', reference_id: grn.id,
      });
    }
  }

  async getSuppliers() {
    const rows = await repo.suppliers.getAll();
    rows.sort((a, b) => String(a.data?.name || a.name || '').localeCompare(String(b.data?.name || b.name || '')));
    return rows.map((r) => ({ ...r, ...(r.data || {}) }));
  }

  async getSupplierById(id) {
    const row = await repo.suppliers.getById(id);
    if (!row) return null;
    return { ...row, ...(row.data || {}) };
  }

  async createSupplier(data) {
    const id = data.id || crypto.randomUUID();
    const record = {
      id,
      data: {
        name: data.name,
        email: data.email || null,
        phone: data.phone || null,
        address: data.address || null,
        city: data.city || null,
        status: data.status || 'Active',
        category: data.category || null,
        payment_terms: data.payment_terms || null,
      },
    };
    await repo.suppliers.upsert(record);
    return this.getSupplierById(id);
  }

  async updateSupplier(id, data) {
    const old = await repo.suppliers.getById(id);
    if (!old) return null;
    const oldData = old.data || old;
    const updated = { ...old, data: { ...oldData }, updated_at: new Date().toISOString() };
    const allowed = ['name', 'email', 'phone', 'address', 'city', 'status', 'category', 'payment_terms'];
    for (const field of allowed) {
      if (data[field] !== undefined) {
        updated.data[field] = data[field];
      }
    }
    await repo.suppliers.upsert(updated);
    return this.getSupplierById(id);
  }

  async deleteSupplier(id) {
    await repo.suppliers.softDelete(id);
    return { success: true };
  }

  async getPurchases() {
    const rows = await repo.purchaseOrders.getAll();
    const supplierIds = [...new Set(rows.map((r) => r.data?.supplier_id || r.supplier_id).filter(Boolean))];
    const suppliers = await Promise.all(supplierIds.map((sid) => repo.suppliers.getById(sid)));
    const supplierMap = new Map(suppliers.filter(Boolean).map((s) => [s.id, s.data?.name || s.name]));
    return rows
      .map((r) => ({
        ...r,
        ...(r.data || {}),
        supplier_name: supplierMap.get(r.data?.supplier_id || r.supplier_id) || '',
      }))
      .sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
  }

  async getPurchaseById(id) {
    const row = await repo.purchaseOrders.getById(id);
    if (!row) return null;
    const d = row.data || row;
    const supplier = d.supplier_id ? await repo.suppliers.getById(d.supplier_id) : null;
    return {
      ...row,
      ...d,
      supplier_name: supplier ? (supplier.data?.name || supplier.name) : '',
    };
  }

  async getPurchaseItems(purchaseId) {
    const rows = await repo.purchaseOrderItems.getAll({ 'data->>purchase_order_id': `eq.${purchaseId}` });
    return rows.map((r) => ({ ...r, ...(r.data || {}) }));
  }

  async createPurchase(data, userId) {
    const id = data.id || crypto.randomUUID();
    const items = data.items || [];
    const poRecord = {
      id,
      data: {
        supplier_id: data.supplier_id,
        order_date: data.order_date || new Date().toISOString(),
        expected_date: data.expected_date || null,
        status: data.status || 'Draft',
        currency: data.currency || 'USD',
        notes: data.notes || null,
        created_by: userId,
      },
    };
    await repo.purchaseOrders.upsert(poRecord);
    for (const item of items) {
      const itemRecord = {
        id: item.id || crypto.randomUUID(),
        data: {
          purchase_order_id: id,
          item_id: item.item_id || null,
          item_name: item.item_name || '',
          quantity: item.quantity || 0,
          unit_price: item.unit_price || 0,
          total_price: (item.quantity || 0) * (item.unit_price || 0),
        },
      };
      await repo.purchaseOrderItems.upsert(itemRecord);
    }
    return this.getPurchaseById(id);
  }

  async updatePurchaseStatus(id, status) {
    const old = await repo.purchaseOrders.getById(id);
    if (!old) return null;
    await repo.purchaseOrders.upsert({
      ...old,
      data: { ...(old.data || old), status },
      updated_at: new Date().toISOString(),
    });
    return this.getPurchaseById(id);
  }

  async getGoodsReceipts() {
    const rows = await repo.goodsReceipts.getAll();
    rows.sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
    const enriched = [];
    for (const r of rows) {
      const d = r.data || r;
      const po = d.purchase_order_id ? await repo.purchaseOrders.getById(d.purchase_order_id) : null;
      const supplier = po ? await repo.suppliers.getById(po.data?.supplier_id || po.supplier_id) : null;
      enriched.push({
        ...r,
        ...d,
        supplier_id: po ? (po.data?.supplier_id || po.supplier_id) : null,
        supplier_name: supplier ? (supplier.data?.name || supplier.name) : '',
      });
    }
    return enriched;
  }

  async createGoodsReceipt(data, userId, currency = 'USD') {
    const id = data.id || crypto.randomUUID();
    const record = {
      id,
      data: {
        purchase_order_id: data.purchase_order_id,
        received_date: data.received_date || new Date().toISOString(),
        status: 'Received',
        notes: data.notes || null,
        created_by: userId,
      },
    };
    await repo.goodsReceipts.upsert(record);
    const grn = await repo.goodsReceipts.getById(id);
    const grnData = grn ? { ...grn, ...(grn.data || {}) } : record.data;
    await this.postGoodsReceiptLedger(grnData, currency);
    return grnData;
  }
}

module.exports = ProcurementService;
