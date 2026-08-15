const crypto = require('crypto');
const repo = require('./supabaseRepository.cjs');

class ProductionService {
  async _saveLedgerEntry(entry) {
    const id = crypto.randomUUID();
    const record = {
      id,
      account_id: entry.account_id,
      entry_type: entry.entry_type,
      amount: entry.amount,
      currency: entry.currency || 'USD',
      description: entry.description || null,
      reference_type: entry.reference_type || null,
      reference_id: entry.reference_id || null,
      entry_date: entry.entry_date || new Date().toISOString(),
    };
    await repo.upsert('ledger_entries', record);
    return id;
  }

  async postWipLedger(workOrder, currency = 'USD') {
    const accounts = await repo.accounts.getAll({ 'data->>type': 'eq.asset' });
    const wipAccount = accounts.find((a) => {
      const d = a.data || a;
      const name = String(d.name || '').toLowerCase();
      return name.includes('wip') || name.includes('work in progress');
    });
    const invAccount = accounts.find((a) => {
      const d = a.data || a;
      const name = String(d.name || '').toLowerCase();
      return name.includes('inventory') || name.includes('stock');
    });
    if (!wipAccount || !invAccount) return;
    const qty = workOrder.quantity_planned || 0;
    const unitCost = workOrder.unit_cost || workOrder.estimated_unit_cost || 0;
    let totalAmount = qty * unitCost || workOrder.total_estimated_cost || workOrder.total_cost || qty;
    if (qty > 0 && totalAmount === qty) {
      console.warn(`[Production] WIP ledger amount equals quantity (${totalAmount}) — no cost data for work order ${workOrder.id}`);
    }
    if (totalAmount <= 0) return;
    await this._saveLedgerEntry({
      account_id: wipAccount.id, entry_type: 'debit', amount: totalAmount, currency,
      description: `WIP for Work Order ${workOrder.id}`,
      reference_type: 'work_order', reference_id: workOrder.id,
    });
    await this._saveLedgerEntry({
      account_id: invAccount.id, entry_type: 'credit', amount: totalAmount, currency,
      description: `Raw materials for Work Order ${workOrder.id}`,
      reference_type: 'work_order', reference_id: workOrder.id,
    });
  }

  async postCogsLedger(workOrder, currency = 'USD') {
    const accounts = await repo.accounts.getAll({ 'data->>type': 'eq.expense' });
    const cogsAccount = accounts.find((a) => {
      const d = a.data || a;
      const name = String(d.name || '').toLowerCase();
      return name.includes('cogs') || name.includes('cost of goods') || d.code === '5000';
    });
    const assetAccounts = await repo.accounts.getAll({ 'data->>type': 'eq.asset' });
    const wipAccount = assetAccounts.find((a) => {
      const d = a.data || a;
      const name = String(d.name || '').toLowerCase();
      return name.includes('wip') || name.includes('work in progress');
    });
    if (!cogsAccount || !wipAccount) return;
    const qty = workOrder.quantity_completed || workOrder.quantity_planned || 0;
    const unitCost = workOrder.unit_cost || workOrder.actual_unit_cost || 0;
    let totalAmount = qty * unitCost || workOrder.total_actual_cost || workOrder.total_cost || qty;
    if (qty > 0 && totalAmount === qty) {
      console.warn(`[Production] COGS ledger amount equals quantity (${totalAmount}) — no cost data for work order ${workOrder.id}`);
    }
    if (totalAmount <= 0) return;
    await this._saveLedgerEntry({
      account_id: cogsAccount.id, entry_type: 'debit', amount: totalAmount, currency,
      description: `COGS for Work Order ${workOrder.id}`,
      reference_type: 'work_order_cogs', reference_id: workOrder.id,
    });
    await this._saveLedgerEntry({
      account_id: wipAccount.id, entry_type: 'credit', amount: totalAmount, currency,
      description: `WIP reversal for Work Order ${workOrder.id}`,
      reference_type: 'work_order_cogs', reference_id: workOrder.id,
    });
  }

  async getWorkCenters() {
    const rows = await repo.workCenters.getAll();
    rows.sort((a, b) => String(a.data?.name || a.name || '').localeCompare(String(b.data?.name || b.name || '')));
    return rows.map((r) => ({ ...r, ...(r.data || {}) }));
  }

  async createWorkCenter(data) {
    const id = data.id || crypto.randomUUID();
    const record = {
      id,
      data: {
        name: data.name,
        description: data.description || null,
        hourly_rate: data.hourly_rate || 0,
        capacity_per_day: data.capacity_per_day || 8,
        status: data.status || 'Active',
        location: data.location || null,
      },
    };
    await repo.workCenters.upsert(record);
    const row = await repo.workCenters.getById(id);
    return { ...row, ...(row.data || {}) };
  }

  async getResources() {
    const rows = await repo.productionResources.getAll();
    rows.sort((a, b) => String(a.data?.name || a.name || '').localeCompare(String(b.data?.name || b.name || '')));
    return rows.map((r) => ({ ...r, ...(r.data || {}) }));
  }

  async createResource(data) {
    const id = data.id || crypto.randomUUID();
    const record = {
      id,
      data: {
        name: data.name,
        work_center_id: data.work_center_id,
        status: data.status || 'Active',
        resource_type: data.resource_type || null,
        description: data.description || null,
      },
    };
    await repo.productionResources.upsert(record);
    const row = await repo.productionResources.getById(id);
    return { ...row, ...(row.data || {}) };
  }

  async getWorkOrders() {
    const rows = await repo.workOrders.getAll();
    rows.sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
    return rows.map((r) => ({ ...r, ...(r.data || {}) }));
  }

  async getWorkOrderById(id) {
    const row = await repo.workOrders.getById(id);
    if (!row) return null;
    return { ...row, ...(row.data || {}) };
  }

  async createWorkOrder(data, userId) {
    const id = data.id || crypto.randomUUID();
    const record = {
      id,
      data: {
        customer_name: data.customer_name || '',
        product_name: data.product_name || '',
        quantity_planned: data.quantity_planned || 0,
        status: data.status || 'Draft',
        due_date: data.due_date || null,
        start_date: data.start_date || null,
        priority: data.priority || 'Medium',
        work_center_id: data.work_center_id || null,
        linked_batch_id: data.linked_batch_id || null,
        created_by: userId,
      },
    };
    await repo.workOrders.upsert(record);
    return this.getWorkOrderById(id);
  }

  async updateWorkOrder(id, data, currency = 'USD') {
    const old = await repo.workOrders.getById(id);
    if (!old) return null;
    const oldData = old.data || old;
    const updated = {
      ...old,
      data: {
        ...oldData,
        ...data,
      },
      updated_at: new Date().toISOString(),
    };
    await repo.workOrders.upsert(updated);
    const workOrder = await this.getWorkOrderById(id);
    if (data.status === 'In Progress') {
      await this.postWipLedger(workOrder, currency);
    } else if (data.status === 'Completed') {
      await this.postCogsLedger(workOrder, currency);
    }
    return workOrder;
  }

  async deleteWorkOrder(id) {
    await repo.workOrders.softDelete(id);
    return { success: true };
  }

  async getBatches() {
    const rows = await repo.productionBatches.getAll();
    rows.sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
    return rows.map((r) => ({ ...r, ...(r.data || {}) }));
  }

  async createBatch(data) {
    const id = data.id || crypto.randomUUID();
    const record = {
      id,
      data: {
        work_order_id: data.work_order_id || null,
        customer_name: data.customer_name || '',
        name: data.name || '',
        status: data.status || 'Pending',
        total_amount: data.total_amount || 0,
        quantity_produced: data.quantity_produced || 0,
        unit_cost: data.unit_cost || 0,
        total_cost: data.total_cost || 0,
      },
    };
    await repo.productionBatches.upsert(record);
    const row = await repo.productionBatches.getById(id);
    return { ...row, ...(row.data || {}) };
  }

  static _instance = null;
  static getInstance() {
    if (!this._instance) {
      this._instance = new ProductionService();
    }
    return this._instance;
  }
}

module.exports = ProductionService;
