const repo = require('./supabaseRepository.cjs');
const auditService = require('../auditService.cjs');
const { randomUUID } = require('crypto');

const profitMarginService = {
  getEffectiveMargin: async (lineItemId, categoryId) => {
    if (lineItemId) {
      const rows = await repo.getAll('profit_margin_settings', {
        'data->>scope': 'eq.line_item',
        'data->>scope_ref_id': `eq.${lineItemId}`,
        'data->>is_active': 'eq.true',
      });
      if (rows.length > 0) return { ...rows[0], source: 'line_item' };
      return profitMarginService._checkCategory(categoryId);
    }
    return profitMarginService._checkCategory(categoryId);
  },

  _checkCategory: async (categoryId) => {
    if (categoryId) {
      const rows = await repo.getAll('profit_margin_settings', {
        'data->>scope': 'eq.category',
        'data->>scope_ref_id': `eq.${categoryId}`,
        'data->>is_active': 'eq.true',
      });
      if (rows.length > 0) return { ...rows[0], source: 'category' };
      return profitMarginService._checkGlobal();
    }
    return profitMarginService._checkGlobal();
  },

  _checkGlobal: async () => {
    const rows = await repo.getAll('profit_margin_settings', {
      'data->>scope': 'eq.global',
      'data->>is_active': 'eq.true',
    });
    if (rows.length > 0) return { ...rows[0], source: 'global' };
    return { margin_value: 0, margin_type: 'percentage', source: 'system' };
  },

  listSettings: async (scope = null) => {
    const filters = { 'data->>deleted_at': 'is.null' };
    if (scope) filters['data->>scope'] = `eq.${scope}`;
    const rows = await repo.getAll('profit_margin_settings', filters);
    return rows.sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
  },

  getById: async (id) => {
    const rows = await repo.getAll('profit_margin_settings', {
      id: `eq.${id}`,
      'data->>deleted_at': 'is.null',
    });
    return rows[0] || null;
  },

  createSetting: async (data, userId) => {
    const { scope, scope_ref_id, margin_type, margin_value, reason } = data;
    if (margin_type === 'percentage' && (margin_value < 0 || margin_value > 100)) {
      throw new Error('Percentage margin must be between 0 and 100');
    }
    if (margin_type === 'fixed_amount' && margin_value < 0) {
      throw new Error('Fixed margin must be >= 0');
    }

    const existing = await repo.getAll('profit_margin_settings', {
      'data->>scope': `eq.${scope}`,
      'data->>scope_ref_id': `eq.${scope_ref_id || ''}`,
      'data->>is_active': 'eq.true',
      'data->>deleted_at': 'is.null',
    });
    if (existing.length > 0) {
      throw new Error(`An active override already exists for this ${scope}`);
    }

    const id = randomUUID();
    const setting = await repo.upsert('profit_margin_settings', {
      id,
      scope,
      scope_ref_id,
      margin_type,
      margin_value,
      reason: reason || null,
      created_by: userId,
      apply_volume_margins: data.apply_volume_margins || 0,
      is_active: true,
      deleted_at: null,
    });

    if (auditService && auditService.record) {
      await auditService.record({
        table: 'profit_margin_settings',
        record_id: id,
        action: 'CREATE',
        scope,
        new_value: JSON.stringify(data),
        reason,
        performed_by: userId,
      });
    }

    return { id, ...data };
  },

  updateSetting: async (id, data, userId) => {
    const old = await profitMarginService.getById(id);
    if (!old) throw new Error('Setting not found');

    const { margin_value, margin_type, is_active, reason } = data;
    if (margin_type === 'percentage' && (margin_value < 0 || margin_value > 100)) {
      throw new Error('Percentage margin must be between 0 and 100');
    }

    const updates = { ...old };
    if (margin_value !== undefined) updates.margin_value = margin_value;
    if (margin_type !== undefined) updates.margin_type = margin_type;
    if (is_active !== undefined) updates.is_active = is_active;
    if (data.apply_volume_margins !== undefined) updates.apply_volume_margins = data.apply_volume_margins;
    if (reason !== undefined) updates.reason = reason;
    updates.updated_at = new Date().toISOString();

    const updated = await repo.upsert('profit_margin_settings', updates);

    if (auditService && auditService.record) {
      await auditService.record({
        table: 'profit_margin_settings',
        record_id: id,
        action: 'UPDATE',
        scope: old.scope,
        old_value: JSON.stringify(old),
        new_value: JSON.stringify({ ...old, ...data }),
        reason: reason || data.reason,
        performed_by: userId,
      });
    }

    return { id, ...old, ...data };
  },

  deleteSetting: async (id, userId, reason) => {
    const old = await profitMarginService.getById(id);
    if (!old) throw new Error('Setting not found');

    const updates = { ...old, deleted_at: new Date().toISOString(), is_active: false };
    await repo.upsert('profit_margin_settings', updates);

    if (auditService && auditService.record) {
      await auditService.record({
        table: 'profit_margin_settings',
        record_id: id,
        action: 'DELETE',
        scope: old.scope,
        old_value: JSON.stringify(old),
        reason,
        performed_by: userId,
      });
    }

    return { success: true };
  },

  bulkUpload: async (rows, userId) => {
    const results = { success: 0, failed: 0, errors: [] };
    for (const row of rows) {
      try {
        await profitMarginService.createSetting({
          scope: 'line_item',
          scope_ref_id: row.sku,
          margin_type: row.margin_type,
          margin_value: parseFloat(row.margin_value),
          reason: row.reason || 'Bulk upload',
        }, userId);
        results.success++;
      } catch (err) {
        results.failed++;
        results.errors.push({ sku: row.sku, error: err.message });
      }
    }
    return results;
  },

  getAuditLog: async (filters = {}) => {
    const allLogs = await repo.getAll('profit_margin_audit_logs');
    let filtered = allLogs;
    if (filters.scope) filtered = filtered.filter(l => l.scope === filters.scope);
    if (filters.user) filtered = filtered.filter(l => l.performed_by === filters.user);
    if (filters.startDate) filtered = filtered.filter(l => l.timestamp >= filters.startDate);
    if (filters.endDate) filtered = filtered.filter(l => l.timestamp <= filters.endDate);
    filtered.sort((a, b) => String(b.timestamp || '').localeCompare(String(a.timestamp || '')));
    const offset = parseInt(filters.offset) || 0;
    const limit = parseInt(filters.limit) || 100;
    return filtered.slice(offset, offset + limit);
  },
};

module.exports = profitMarginService;
