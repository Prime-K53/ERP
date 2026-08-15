const axios = require('axios');
const cloudSyncStore = require('./cloudSyncStore.cjs');

const SUPABASE_URL = String(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').replace(/\/+$/, '');
const SECRET_KEY = process.env.SUPABASE_SECRET_KEY || '';

function isConfigured() {
  return Boolean(SUPABASE_URL && SECRET_KEY && !SUPABASE_URL.includes('placeholder'));
}

function adminHeaders() {
  return {
    apikey: SECRET_KEY,
    Authorization: `Bearer ${SECRET_KEY}`,
    'Content-Type': 'application/json',
    Prefer: 'return=representation',
  };
}

function fromSupabaseRow(row) {
  if (!row) return null;
  const data = (row.data && typeof row.data === 'object') ? row.data : {};
  return {
    ...data,
    id: row.id,
    updated_at: row.updated_at || null,
    version: row.version != null ? Number(row.version) : 0,
  };
}

function toSupabaseRow(domain) {
  if (!domain || !domain.id) return null;
  const { id, ...data } = domain;
  return {
    id,
    data,
    updated_at: new Date().toISOString(),
    version: domain.version != null ? Number(domain.version) + 1 : 1,
  };
}

async function request(table, params = {}, options = {}) {
  if (!isConfigured()) return null;
  const url = `${SUPABASE_URL}/rest/v1/${table}`;
  const headers = {
    apikey: SECRET_KEY,
    Authorization: `Bearer ${SECRET_KEY}`,
    'User-Agent': options.userAgent || 'supabase-repo/1',
  };
  try {
    const { data } = await axios.get(url, { params, headers, timeout: options.timeout || 10000 });
    return Array.isArray(data) ? data : null;
  } catch (err) {
    const status = err.response && err.response.status;
    const detail = err.response && err.response.data ? JSON.stringify(err.response.data) : '';
    console.warn(`[SupabaseRepo] ${table} read failed (${status || err.message}): ${detail}`);
    return null;
  }
}

async function getAll(table, filters = {}) {
  const rows = await request(table, filters);
  if (!rows || rows.length === 0) return [];
  return rows.map(fromSupabaseRow);
}

/**
 * Strict read: distinguishes "genuinely zero rows" from "query failed".
 * The Portal must never present a database failure as an empty result, so
 * financial/customer-critical reads go through this method and let the
 * failure propagate to a visible error state.
 */
async function getAllStrict(table, filters = {}) {
  const rows = await request(table, filters);
  if (rows === null) {
    throw new Error(`Failed to read ${table} from Supabase (query returned no data)`);
  }
  return rows.map(fromSupabaseRow);
}

async function getById(table, id) {
  const rows = await request(table, { id: `eq.${id}`, limit: 1 });
  if (!rows || rows.length === 0) return null;
  return fromSupabaseRow(rows[0]);
}

async function upsert(table, domainObject) {
  if (!isConfigured()) return null;
  const row = toSupabaseRow(domainObject);
  if (!row) return null;

  try {
    const result = await cloudSyncStore.upsertRow(table, row.id, row);
    if (result && result.id) {
      return getById(table, result.id);
    }
    return null;
  } catch (err) {
    console.warn(`[SupabaseRepo] ${table} upsert failed:`, err?.message || err);
    return null;
  }
}

async function softDelete(table, id) {
  if (!isConfigured()) return null;
  try {
    const result = await cloudSyncStore.softDeleteRow(table, id);
    if (result && result.id) {
      return getById(table, result.id);
    }
    return null;
  } catch (err) {
    console.warn(`[SupabaseRepo] ${table} softDelete failed:`, err?.message || err);
    return null;
  }
}

async function count(table, filters = {}) {
  if (!isConfigured()) return 0;
  try {
    const url = `${SUPABASE_URL}/rest/v1/${table}`;
    const headers = { ...adminHeaders(), Prefer: 'count=exact' };
    const { headers: respHeaders } = await axios.get(url, {
      params: { select: 'id', ...filters, limit: 1 },
      headers,
      timeout: 15000,
    });
    const contentRange = String(respHeaders?.['content-range'] || '0-0/0');
    const totalMatch = contentRange.split('/')[1];
    const total = Number(totalMatch);
    return Number.isFinite(total) ? total : 0;
  } catch {
    return 0;
  }
}

const entityQueries = {
  customers: {
    getAll: (filters = {}) => getAll('customers', filters),
    getById: (id) => getById('customers', id),
    upsert: (record) => upsert('customers', record),
    softDelete: (id) => softDelete('customers', id),
  },
  suppliers: {
    getAll: (filters = {}) => getAll('suppliers', filters),
    getById: (id) => getById('suppliers', id),
    upsert: (record) => upsert('suppliers', record),
    softDelete: (id) => softDelete('suppliers', id),
  },
  invoices: {
    getAll: (filters = {}) => getAll('invoices', filters),
    getById: (id) => getById('invoices', id),
    upsert: (record) => upsert('invoices', record),
    softDelete: (id) => softDelete('invoices', id),
  },
  sales: {
    getAll: (filters = {}) => getAll('sales', filters),
    getById: (id) => getById('sales', id),
    upsert: (record) => upsert('sales', record),
    softDelete: (id) => softDelete('sales', id),
  },
  sales_orders: {
    getAll: (filters = {}) => getAll('sales_orders', filters),
    getById: (id) => getById('sales_orders', id),
    upsert: (record) => upsert('sales_orders', record),
    softDelete: (id) => softDelete('sales_orders', id),
  },
  quotations: {
    getAll: (filters = {}) => getAll('quotations', filters),
    getById: (id) => getById('quotations', id),
    upsert: (record) => upsert('quotations', record),
    softDelete: (id) => softDelete('quotations', id),
  },
  orders: {
    getAll: (filters = {}) => getAll('orders', filters),
    getById: (id) => getById('orders', id),
    upsert: (record) => upsert('orders', record),
    softDelete: (id) => softDelete('orders', id),
  },
  products: {
    getAll: (filters = {}) => getAll('products', filters),
    getById: (id) => getById('products', id),
    upsert: (record) => upsert('products', record),
    softDelete: (id) => softDelete('products', id),
  },
  inventory: {
    getAll: (filters = {}) => getAll('inventory', filters),
    getById: (id) => getById('inventory', id),
    upsert: (record) => upsert('inventory', record),
    softDelete: (id) => softDelete('inventory', id),
  },
  customer_payments: {
    getAll: (filters = {}) => getAll('customer_payments', filters),
    getById: (id) => getById('customer_payments', id),
    upsert: (record) => upsert('customer_payments', record),
    softDelete: (id) => softDelete('customer_payments', id),
  },
  supplier_payments: {
    getAll: (filters = {}) => getAll('supplier_payments', filters),
    getById: (id) => getById('supplier_payments', id),
    upsert: (record) => upsert('supplier_payments', record),
    softDelete: (id) => softDelete('supplier_payments', id),
  },
  delivery_notes: {
    getAll: (filters = {}) => getAll('delivery_notes', filters),
    getById: (id) => getById('delivery_notes', id),
    upsert: (record) => upsert('delivery_notes', record),
    softDelete: (id) => softDelete('delivery_notes', id),
  },
  receipts: {
    getAll: (filters = {}) => getAll('receipts', filters),
    getById: (id) => getById('receipts', id),
    upsert: (record) => upsert('receipts', record),
    softDelete: (id) => softDelete('receipts', id),
  },
  expenses: {
    getAll: (filters = {}) => getAll('expenses', filters),
    getById: (id) => getById('expenses', id),
    upsert: (record) => upsert('expenses', record),
    softDelete: (id) => softDelete('expenses', id),
  },
  income: {
    getAll: (filters = {}) => getAll('income', filters),
    getById: (id) => getById('income', id),
    upsert: (record) => upsert('income', record),
    softDelete: (id) => softDelete('income', id),
  },
  accounts: {
    getAll: (filters = {}) => getAll('accounts', filters),
    getById: (id) => getById('accounts', id),
    upsert: (record) => upsert('accounts', record),
    softDelete: (id) => softDelete('accounts', id),
  },
  ledger_entries: {
    getAll: (filters = {}) => getAll('ledger_entries', filters),
    getById: (id) => getById('ledger_entries', id),
    upsert: (record) => upsert('ledger_entries', record),
    softDelete: (id) => softDelete('ledger_entries', id),
  },
  budgets: {
    getAll: (filters = {}) => getAll('budgets', filters),
    getById: (id) => getById('budgets', id),
    upsert: (record) => upsert('budgets', record),
    softDelete: (id) => softDelete('budgets', id),
  },
  transfers: {
    getAll: (filters = {}) => getAll('transfers', filters),
    getById: (id) => getById('transfers', id),
    upsert: (record) => upsert('transfers', record),
    softDelete: (id) => softDelete('transfers', id),
  },
  bank_accounts: {
    getAll: (filters = {}) => getAll('bank_accounts', filters),
    getById: (id) => getById('bank_accounts', id),
    upsert: (record) => upsert('bank_accounts', record),
    softDelete: (id) => softDelete('bank_accounts', id),
  },
  bank_transactions: {
    getAll: (filters = {}) => getAll('bank_transactions', filters),
    getById: (id) => getById('bank_transactions', id),
    upsert: (record) => upsert('bank_transactions', record),
    softDelete: (id) => softDelete('bank_transactions', id),
  },
  warehouses: {
    getAll: (filters = {}) => getAll('warehouses', filters),
    getById: (id) => getById('warehouses', id),
    upsert: (record) => upsert('warehouses', record),
    softDelete: (id) => softDelete('warehouses', id),
  },
  warehouse_inventory: {
    getAll: (filters = {}) => getAll('warehouse_inventory', filters),
    getById: (id) => getById('warehouse_inventory', id),
    upsert: (record) => upsert('warehouse_inventory', record),
    softDelete: (id) => softDelete('warehouse_inventory', id),
  },
  material_batches: {
    getAll: (filters = {}) => getAll('material_batches', filters),
    getById: (id) => getById('material_batches', id),
    upsert: (record) => upsert('material_batches', record),
    softDelete: (id) => softDelete('material_batches', id),
  },
  material_categories: {
    getAll: (filters = {}) => getAll('material_categories', filters),
    getById: (id) => getById('material_categories', id),
    upsert: (record) => upsert('material_categories', record),
    softDelete: (id) => softDelete('material_categories', id),
  },
  inventory_transactions: {
    getAll: (filters = {}) => getAll('inventory_transactions', filters),
    getById: (id) => getById('inventory_transactions', id),
    upsert: (record) => upsert('inventory_transactions', record),
    softDelete: (id) => softDelete('inventory_transactions', id),
  },
  market_adjustments: {
    getAll: (filters = {}) => getAll('market_adjustments', filters),
    getById: (id) => getById('market_adjustments', id),
    upsert: (record) => upsert('market_adjustments', record),
    softDelete: (id) => softDelete('market_adjustments', id),
  },
  market_adjustment_transactions: {
    getAll: (filters = {}) => getAll('market_adjustment_transactions', filters),
    getById: (id) => getById('market_adjustment_transactions', id),
    upsert: (record) => upsert('market_adjustment_transactions', record),
    softDelete: (id) => softDelete('market_adjustment_transactions', id),
  },
  profit_margin_settings: {
    getAll: (filters = {}) => getAll('profit_margin_settings', filters),
    getById: (id) => getById('profit_margin_settings', id),
    upsert: (record) => upsert('profit_margin_settings', record),
    softDelete: (id) => softDelete('profit_margin_settings', id),
  },
  work_orders: {
    getAll: (filters = {}) => getAll('work_orders', filters),
    getById: (id) => getById('work_orders', id),
    upsert: (record) => upsert('work_orders', record),
    softDelete: (id) => softDelete('work_orders', id),
  },
  production_batches: {
    getAll: (filters = {}) => getAll('production_batches', filters),
    getById: (id) => getById('production_batches', id),
    upsert: (record) => upsert('production_batches', record),
    softDelete: (id) => softDelete('production_batches', id),
  },
  job_tickets: {
    getAll: (filters = {}) => getAll('job_tickets', filters),
    getById: (id) => getById('job_tickets', id),
    upsert: (record) => upsert('job_tickets', record),
    softDelete: (id) => softDelete('job_tickets', id),
  },
  employees: {
    getAll: (filters = {}) => getAll('employees', filters),
    getById: (id) => getById('employees', id),
    upsert: (record) => upsert('employees', record),
    softDelete: (id) => softDelete('employees', id),
  },
  payroll_runs: {
    getAll: (filters = {}) => getAll('payroll_runs', filters),
    getById: (id) => getById('payroll_runs', id),
    upsert: (record) => upsert('payroll_runs', record),
    softDelete: (id) => softDelete('payroll_runs', id),
  },
  payslips: {
    getAll: (filters = {}) => getAll('payslips', filters),
    getById: (id) => getById('payslips', id),
    upsert: (record) => upsert('payslips', record),
    softDelete: (id) => softDelete('payslips', id),
  },
  vat_transactions: {
    getAll: (filters = {}) => getAll('vat_transactions', filters),
    getById: (id) => getById('vat_transactions', id),
    upsert: (record) => upsert('vat_transactions', record),
    softDelete: (id) => softDelete('vat_transactions', id),
  },
  tax_rates: {
    getAll: (filters = {}) => getAll('tax_rates', filters),
    getById: (id) => getById('tax_rates', id),
    upsert: (record) => upsert('tax_rates', record),
    softDelete: (id) => softDelete('tax_rates', id),
  },
  settings: {
    getAll: (filters = {}) => getAll('settings', filters),
    getById: (id) => getById('settings', id),
    upsert: (record) => upsert('settings', record),
    softDelete: (id) => softDelete('settings', id),
  },
  user_preferences: {
    getAll: (filters = {}) => getAll('user_preferences', filters),
    getById: (id) => getById('user_preferences', id),
    upsert: (record) => upsert('user_preferences', record),
    softDelete: (id) => softDelete('user_preferences', id),
  },
  financial_years: {
    getAll: (filters = {}) => getAll('financial_years', filters),
    getById: (id) => getById('financial_years', id),
    upsert: (record) => upsert('financial_years', record),
    softDelete: (id) => softDelete('financial_years', id),
  },
  audit_logs: {
    getAll: (filters = {}) => getAll('audit_logs', filters),
    getById: (id) => getById('audit_logs', id),
    upsert: (record) => upsert('audit_logs', record),
    softDelete: (id) => softDelete('audit_logs', id),
  },
  tasks: {
    getAll: (filters = {}) => getAll('tasks', filters),
    getById: (id) => getById('tasks', id),
    upsert: (record) => upsert('tasks', record),
    softDelete: (id) => softDelete('tasks', id),
  },
  sales_exchanges: {
    getAll: (filters = {}) => getAll('sales_exchanges', filters),
    getById: (id) => getById('sales_exchanges', id),
    upsert: (record) => upsert('sales_exchanges', record),
    softDelete: (id) => softDelete('sales_exchanges', id),
  },
  sales_exchange_items: {
    getAll: (filters = {}) => getAll('sales_exchange_items', filters),
    getById: (id) => getById('sales_exchange_items', id),
    upsert: (record) => upsert('sales_exchange_items', record),
    softDelete: (id) => softDelete('sales_exchange_items', id),
  },
  reprint_jobs: {
    getAll: (filters = {}) => getAll('reprint_jobs', filters),
    getById: (id) => getById('reprint_jobs', id),
    upsert: (record) => upsert('reprint_jobs', record),
    softDelete: (id) => softDelete('reprint_jobs', id),
  },
  sales_exchange_approvals: {
    getAll: (filters = {}) => getAll('sales_exchange_approvals', filters),
    getById: (id) => getById('sales_exchange_approvals', id),
    upsert: (record) => upsert('sales_exchange_approvals', record),
    softDelete: (id) => softDelete('sales_exchange_approvals', id),
  },
  examinations: {
    getAll: (filters = {}) => getAll('examinations', filters),
    getById: (id) => getById('examinations', id),
    upsert: (record) => upsert('examinations', record),
    softDelete: (id) => softDelete('examinations', id),
  },
  examination_batches: {
    getAll: (filters = {}) => getAll('examination_batches', filters),
    getById: (id) => getById('examination_batches', id),
    upsert: (record) => upsert('examination_batches', record),
    softDelete: (id) => softDelete('examination_batches', id),
  },
  examination_classes: {
    getAll: (filters = {}) => getAll('examination_classes', filters),
    getById: (id) => getById('examination_classes', id),
    upsert: (record) => upsert('examination_classes', record),
    softDelete: (id) => softDelete('examination_classes', id),
  },
  examination_subjects: {
    getAll: (filters = {}) => getAll('examination_subjects', filters),
    getById: (id) => getById('examination_subjects', id),
    upsert: (record) => upsert('examination_subjects', record),
    softDelete: (id) => softDelete('examination_subjects', id),
  },
  examination_bom_calculations: {
    getAll: (filters = {}) => getAll('examination_bom_calculations', filters),
    getById: (id) => getById('examination_bom_calculations', id),
    upsert: (record) => upsert('examination_bom_calculations', record),
    softDelete: (id) => softDelete('examination_bom_calculations', id),
  },
  examination_class_adjustments: {
    getAll: (filters = {}) => getAll('examination_class_adjustments', filters),
    getById: (id) => getById('examination_class_adjustments', id),
    upsert: (record) => upsert('examination_class_adjustments', record),
    softDelete: (id) => softDelete('examination_class_adjustments', id),
  },
  examination_pricing_audit: {
    getAll: (filters = {}) => getAll('examination_pricing_audit', filters),
    getById: (id) => getById('examination_pricing_audit', id),
    upsert: (record) => upsert('examination_pricing_audit', record),
    softDelete: (id) => softDelete('examination_pricing_audit', id),
  },
  examination_batch_notifications: {
    getAll: (filters = {}) => getAll('examination_batch_notifications', filters),
    getById: (id) => getById('examination_batch_notifications', id),
    upsert: (record) => upsert('examination_batch_notifications', record),
    softDelete: (id) => softDelete('examination_batch_notifications', id),
  },
  notification_audit_logs: {
    getAll: (filters = {}) => getAll('notification_audit_logs', filters),
    getById: (id) => getById('notification_audit_logs', id),
    upsert: (record) => upsert('notification_audit_logs', record),
    softDelete: (id) => softDelete('notification_audit_logs', id),
  },
  bom_default_materials: {
    getAll: (filters = {}) => getAll('bom_default_materials', filters),
    getById: (id) => getById('bom_default_materials', id),
    upsert: (record) => upsert('bom_default_materials', record),
    softDelete: (id) => softDelete('bom_default_materials', id),
  },
  documents: {
    getAll: (filters = {}) => getAll('documents', filters),
    getById: (id) => getById('documents', id),
    upsert: (record) => upsert('documents', record),
    softDelete: (id) => softDelete('documents', id),
  },
  classes: {
    getAll: (filters = {}) => getAll('classes', filters),
    getById: (id) => getById('classes', id),
    upsert: (record) => upsert('classes', record),
    softDelete: (id) => softDelete('classes', id),
  },
  subjects: {
    getAll: (filters = {}) => getAll('subjects', filters),
    getById: (id) => getById('subjects', id),
    upsert: (record) => upsert('subjects', record),
    softDelete: (id) => softDelete('subjects', id),
  },
  schools: {
    getAll: (filters = {}) => getAll('schools', filters),
    getById: (id) => getById('schools', id),
    upsert: (record) => upsert('schools', record),
    softDelete: (id) => softDelete('schools', id),
  },
  engagement_timeline: {
    getAll: (filters = {}) => getAll('engagement_timeline', filters),
    getById: (id) => getById('engagement_timeline', id),
    upsert: (record) => upsert('engagement_timeline', record),
    softDelete: (id) => softDelete('engagement_timeline', id),
  },
  engagement_audit: {
    getAll: (filters = {}) => getAll('engagement_audit', filters),
    getById: (id) => getById('engagement_audit', id),
    upsert: (record) => upsert('engagement_audit', record),
    softDelete: (id) => softDelete('engagement_audit', id),
  },
  engagement_points: {
    getAll: (filters = {}) => getAll('engagement_points', filters),
    getById: (id) => getById('engagement_points', id),
    upsert: (record) => upsert('engagement_points', record),
    softDelete: (id) => softDelete('engagement_points', id),
  },
  engagement_point_balances: {
    getAll: (filters = {}) => getAll('engagement_point_balances', filters),
    getById: (id) => getById('engagement_point_balances', id),
    upsert: (record) => upsert('engagement_point_balances', record),
    softDelete: (id) => softDelete('engagement_point_balances', id),
  },
  engagement_cashback: {
    getAll: (filters = {}) => getAll('engagement_cashback', filters),
    getById: (id) => getById('engagement_cashback', id),
    upsert: (record) => upsert('engagement_cashback', record),
    softDelete: (id) => softDelete('engagement_cashback', id),
  },
  engagement_membership_tiers: {
    getAll: (filters = {}) => getAll('engagement_membership_tiers', filters),
    getById: (id) => getById('engagement_membership_tiers', id),
    upsert: (record) => upsert('engagement_membership_tiers', record),
    softDelete: (id) => softDelete('engagement_membership_tiers', id),
  },
  engagement_customer_tiers: {
    getAll: (filters = {}) => getAll('engagement_customer_tiers', filters),
    getById: (id) => getById('engagement_customer_tiers', id),
    upsert: (record) => upsert('engagement_customer_tiers', record),
    softDelete: (id) => softDelete('engagement_customer_tiers', id),
  },
  engagement_gift_cards: {
    getAll: (filters = {}) => getAll('engagement_gift_cards', filters),
    getById: (id) => getById('engagement_gift_cards', id),
    upsert: (record) => upsert('engagement_gift_cards', record),
    softDelete: (id) => softDelete('engagement_gift_cards', id),
  },
  engagement_gift_card_transactions: {
    getAll: (filters = {}) => getAll('engagement_gift_card_transactions', filters),
    getById: (id) => getById('engagement_gift_card_transactions', id),
    upsert: (record) => upsert('engagement_gift_card_transactions', record),
    softDelete: (id) => softDelete('engagement_gift_card_transactions', id),
  },
  engagement_affiliates: {
    getAll: (filters = {}) => getAll('engagement_affiliates', filters),
    getById: (id) => getById('engagement_affiliates', id),
    upsert: (record) => upsert('engagement_affiliates', record),
    softDelete: (id) => softDelete('engagement_affiliates', id),
  },
  engagement_affiliate_commissions: {
    getAll: (filters = {}) => getAll('engagement_affiliate_commissions', filters),
    getById: (id) => getById('engagement_affiliate_commissions', id),
    upsert: (record) => upsert('engagement_affiliate_commissions', record),
    softDelete: (id) => softDelete('engagement_affiliate_commissions', id),
  },
  engagement_promotions: {
    getAll: (filters = {}) => getAll('engagement_promotions', filters),
    getById: (id) => getById('engagement_promotions', id),
    upsert: (record) => upsert('engagement_promotions', record),
    softDelete: (id) => softDelete('engagement_promotions', id),
  },
  engagement_customer_rewards: {
    getAll: (filters = {}) => getAll('engagement_customer_rewards', filters),
    getById: (id) => getById('engagement_customer_rewards', id),
    upsert: (record) => upsert('engagement_customer_rewards', record),
    softDelete: (id) => softDelete('engagement_customer_rewards', id),
  },
  engagement_analytics: {
    getAll: (filters = {}) => getAll('engagement_analytics', filters),
    getById: (id) => getById('engagement_analytics', id),
    upsert: (record) => upsert('engagement_analytics', record),
    softDelete: (id) => softDelete('engagement_analytics', id),
  },
  customer_referrals: {
    getAll: (filters = {}) => getAll('customer_referrals', filters),
    getById: (id) => getById('customer_referrals', id),
    upsert: (record) => upsert('customer_referrals', record),
    softDelete: (id) => softDelete('customer_referrals', id),
  },
  referral_rewards: {
    getAll: (filters = {}) => getAll('referral_rewards', filters),
    getById: (id) => getById('referral_rewards', id),
    upsert: (record) => upsert('referral_rewards', record),
    softDelete: (id) => softDelete('referral_rewards', id),
  },
  referral_timeline: {
    getAll: (filters = {}) => getAll('referral_timeline', filters),
    getById: (id) => getById('referral_timeline', id),
    upsert: (record) => upsert('referral_timeline', record),
    softDelete: (id) => softDelete('referral_timeline', id),
  },
  referral_audit_logs: {
    getAll: (filters = {}) => getAll('referral_audit_logs', filters),
    getById: (id) => getById('referral_audit_logs', id),
    upsert: (record) => upsert('referral_audit_logs', record),
    softDelete: (id) => softDelete('referral_audit_logs', id),
  },
  referral_campaigns: {
    getAll: (filters = {}) => getAll('referral_campaigns', filters),
    getById: (id) => getById('referral_campaigns', id),
    upsert: (record) => upsert('referral_campaigns', record),
    softDelete: (id) => softDelete('referral_campaigns', id),
  },
  referral_analytics: {
    getAll: (filters = {}) => getAll('referral_analytics', filters),
    getById: (id) => getById('referral_analytics', id),
    upsert: (record) => upsert('referral_analytics', record),
    softDelete: (id) => softDelete('referral_analytics', id),
  },
  referral_reversals: {
    getAll: (filters = {}) => getAll('referral_reversals', filters),
    getById: (id) => getById('referral_reversals', id),
    upsert: (record) => upsert('referral_reversals', record),
    softDelete: (id) => softDelete('referral_reversals', id),
  },
  referral_event_history: {
    getAll: (filters = {}) => getAll('referral_event_history', filters),
    getById: (id) => getById('referral_event_history', id),
    upsert: (record) => upsert('referral_event_history', record),
    softDelete: (id) => softDelete('referral_event_history', id),
  },
  sms_campaigns: {
    getAll: (filters = {}) => getAll('sms_campaigns', filters),
    getById: (id) => getById('sms_campaigns', id),
    upsert: (record) => upsert('sms_campaigns', record),
    softDelete: (id) => softDelete('sms_campaigns', id),
  },
  sms_templates: {
    getAll: (filters = {}) => getAll('sms_templates', filters),
    getById: (id) => getById('sms_templates', id),
    upsert: (record) => upsert('sms_templates', record),
    softDelete: (id) => softDelete('sms_templates', id),
  },
  whatsapp_chats: {
    getAll: (filters = {}) => getAll('whatsapp_chats', filters),
    getById: (id) => getById('whatsapp_chats', id),
    upsert: (record) => upsert('whatsapp_chats', record),
    softDelete: (id) => softDelete('whatsapp_chats', id),
  },
  whatsapp_templates: {
    getAll: (filters = {}) => getAll('whatsapp_templates', filters),
    getById: (id) => getById('whatsapp_templates', id),
    upsert: (record) => upsert('whatsapp_templates', record),
    softDelete: (id) => softDelete('whatsapp_templates', id),
  },
  whatsapp_campaigns: {
    getAll: (filters = {}) => getAll('whatsapp_campaigns', filters),
    getById: (id) => getById('whatsapp_campaigns', id),
    upsert: (record) => upsert('whatsapp_campaigns', record),
    softDelete: (id) => softDelete('whatsapp_campaigns', id),
  },
  whatsapp_automations: {
    getAll: (filters = {}) => getAll('whatsapp_automations', filters),
    getById: (id) => getById('whatsapp_automations', id),
    upsert: (record) => upsert('whatsapp_automations', record),
    softDelete: (id) => softDelete('whatsapp_automations', id),
  },
  customer_notification_logs: {
    getAll: (filters = {}) => getAll('customer_notification_logs', filters),
    getById: (id) => getById('customer_notification_logs', id),
    upsert: (record) => upsert('customer_notification_logs', record),
    softDelete: (id) => softDelete('customer_notification_logs', id),
  },
  subcontract_orders: {
    getAll: (filters = {}) => getAll('subcontract_orders', filters),
    getById: (id) => getById('subcontract_orders', id),
    upsert: (record) => upsert('subcontract_orders', record),
    softDelete: (id) => softDelete('subcontract_orders', id),
  },
  maintenance_logs: {
    getAll: (filters = {}) => getAll('maintenance_logs', filters),
    getById: (id) => getById('maintenance_logs', id),
    upsert: (record) => upsert('maintenance_logs', record),
    softDelete: (id) => softDelete('maintenance_logs', id),
  },
  assets: {
    getAll: (filters = {}) => getAll('assets', filters),
    getById: (id) => getById('assets', id),
    upsert: (record) => upsert('assets', record),
    softDelete: (id) => softDelete('assets', id),
  },
  purchase_orders: {
    getAll: (filters = {}) => getAll('purchase_orders', filters),
    getById: (id) => getById('purchase_orders', id),
    upsert: (record) => upsert('purchase_orders', record),
    softDelete: (id) => softDelete('purchase_orders', id),
  },
  goods_receipts: {
    getAll: (filters = {}) => getAll('goods_receipts', filters),
    getById: (id) => getById('goods_receipts', id),
    upsert: (record) => upsert('goods_receipts', record),
    softDelete: (id) => softDelete('goods_receipts', id),
  },
  inventory_movements: {
    getAll: (filters = {}) => getAll('inventory_movements', filters),
    getById: (id) => getById('inventory_movements', id),
    upsert: (record) => upsert('inventory_movements', record),
    softDelete: (id) => softDelete('inventory_movements', id),
  },
  boms: {
    getAll: (filters = {}) => getAll('boms', filters),
    getById: (id) => getById('boms', id),
    upsert: (record) => upsert('boms', record),
    softDelete: (id) => softDelete('boms', id),
  },
  bom_templates: {
    getAll: (filters = {}) => getAll('bom_templates', filters),
    getById: (id) => getById('bom_templates', id),
    upsert: (record) => upsert('bom_templates', record),
    softDelete: (id) => softDelete('bom_templates', id),
  },
  cheques: {
    getAll: (filters = {}) => getAll('cheques', filters),
    getById: (id) => getById('cheques', id),
    upsert: (record) => upsert('cheques', record),
    softDelete: (id) => softDelete('cheques', id),
  },
  reminders: {
    getAll: (filters = {}) => getAll('reminders', filters),
    getById: (id) => getById('reminders', id),
    upsert: (record) => upsert('reminders', record),
    softDelete: (id) => softDelete('reminders', id),
  },
  subscribers: {
    getAll: (filters = {}) => getAll('subscribers', filters),
    getById: (id) => getById('subscribers', id),
    upsert: (record) => upsert('subscribers', record),
    softDelete: (id) => softDelete('subscribers', id),
  },
  recurring_invoices: {
    getAll: (filters = {}) => getAll('recurring_invoices', filters),
    getById: (id) => getById('recurring_invoices', id),
    upsert: (record) => upsert('recurring_invoices', record),
    softDelete: (id) => softDelete('recurring_invoices', id),
  },
  scheduled_payments: {
    getAll: (filters = {}) => getAll('scheduled_payments', filters),
    getById: (id) => getById('scheduled_payments', id),
    upsert: (record) => upsert('scheduled_payments', record),
    softDelete: (id) => softDelete('scheduled_payments', id),
  },
  wallet_transactions: {
    getAll: (filters = {}) => getAll('wallet_transactions', filters),
    getById: (id) => getById('wallet_transactions', id),
    upsert: (record) => upsert('wallet_transactions', record),
    softDelete: (id) => softDelete('wallet_transactions', id),
  },
  shipments: {
    getAll: (filters = {}) => getAll('shipments', filters),
    getById: (id) => getById('shipments', id),
    upsert: (record) => upsert('shipments', record),
    softDelete: (id) => softDelete('shipments', id),
  },
  user_groups: {
    getAll: (filters = {}) => getAll('user_groups', filters),
    getById: (id) => getById('user_groups', id),
    upsert: (record) => upsert('user_groups', record),
    softDelete: (id) => softDelete('user_groups', id),
  },
  work_centers: {
    getAll: (filters = {}) => getAll('work_centers', filters),
    getById: (id) => getById('work_centers', id),
    upsert: (record) => upsert('work_centers', record),
    softDelete: (id) => softDelete('work_centers', id),
  },
  production_resources: {
    getAll: (filters = {}) => getAll('production_resources', filters),
    getById: (id) => getById('production_resources', id),
    upsert: (record) => upsert('production_resources', record),
    softDelete: (id) => softDelete('production_resources', id),
  },
  resource_allocations: {
    getAll: (filters = {}) => getAll('resource_allocations', filters),
    getById: (id) => getById('resource_allocations', id),
    upsert: (record) => upsert('resource_allocations', record),
    softDelete: (id) => softDelete('resource_allocations', id),
  },
  rounding_logs: {
    getAll: (filters = {}) => getAll('rounding_logs', filters),
    getById: (id) => getById('rounding_logs', id),
    upsert: (record) => upsert('rounding_logs', record),
    softDelete: (id) => softDelete('rounding_logs', id),
  },
  bank_statements: {
    getAll: (filters = {}) => getAll('bank_statements', filters),
    getById: (id) => getById('bank_statements', id),
    upsert: (record) => upsert('bank_statements', record),
    softDelete: (id) => softDelete('bank_statements', id),
  },
  bank_scheduled_payments: {
    getAll: (filters = {}) => getAll('bank_scheduled_payments', filters),
    getById: (id) => getById('bank_scheduled_payments', id),
    upsert: (record) => upsert('bank_scheduled_payments', record),
    softDelete: (id) => softDelete('bank_scheduled_payments', id),
  },
  bank_exchange_rates: {
    getAll: (filters = {}) => getAll('bank_exchange_rates', filters),
    getById: (id) => getById('bank_exchange_rates', id),
    upsert: (record) => upsert('bank_exchange_rates', record),
    softDelete: (id) => softDelete('bank_exchange_rates', id),
  },
  bank_fees: {
    getAll: (filters = {}) => getAll('bank_fees', filters),
    getById: (id) => getById('bank_fees', id),
    upsert: (record) => upsert('bank_fees', record),
    softDelete: (id) => softDelete('bank_fees', id),
  },
  bank_reconciliations: {
    getAll: (filters = {}) => getAll('bank_reconciliations', filters),
    getById: (id) => getById('bank_reconciliations', id),
    upsert: (record) => upsert('bank_reconciliations', record),
    softDelete: (id) => softDelete('bank_reconciliations', id),
  },
  bank_adjustments: {
    getAll: (filters = {}) => getAll('bank_adjustments', filters),
    getById: (id) => getById('bank_adjustments', id),
    upsert: (record) => upsert('bank_adjustments', record),
    softDelete: (id) => softDelete('bank_adjustments', id),
  },
  bank_cash_flow_forecasts: {
    getAll: (filters = {}) => getAll('bank_cash_flow_forecasts', filters),
    getById: (id) => getById('bank_cash_flow_forecasts', id),
    upsert: (record) => upsert('bank_cash_flow_forecasts', record),
    softDelete: (id) => softDelete('bank_cash_flow_forecasts', id),
  },
  bank_alerts: {
    getAll: (filters = {}) => getAll('bank_alerts', filters),
    getById: (id) => getById('bank_alerts', id),
    upsert: (record) => upsert('bank_alerts', record),
    softDelete: (id) => softDelete('bank_alerts', id),
  },
  bank_categories: {
    getAll: (filters = {}) => getAll('bank_categories', filters),
    getById: (id) => getById('bank_categories', id),
    upsert: (record) => upsert('bank_categories', record),
    softDelete: (id) => softDelete('bank_categories', id),
  },
  departments: {
    getAll: (filters = {}) => getAll('departments', filters),
    getById: (id) => getById('departments', id),
    upsert: (record) => upsert('departments', record),
    softDelete: (id) => softDelete('departments', id),
  },
  purchase_orders: {
    getAll: (filters = {}) => getAll('purchase_orders', filters),
    getById: (id) => getById('purchase_orders', id),
    upsert: (record) => upsert('purchase_orders', record),
    softDelete: (id) => softDelete('purchase_orders', id),
  },
  quotation_requests: {
    getAll: (filters = {}) => getAll('quotation_requests', filters),
    getById: (id) => getById('quotation_requests', id),
    upsert: (record) => upsert('quotation_requests', record),
    softDelete: (id) => softDelete('quotation_requests', id),
  },
  support_tickets: {
    getAll: (filters = {}) => getAll('support_tickets', filters),
    getById: (id) => getById('support_tickets', id),
    upsert: (record) => upsert('support_tickets', record),
    softDelete: (id) => softDelete('support_tickets', id),
  },
  portal_notifications: {
    getAll: (filters = {}) => getAll('portal_notifications', filters),
    getById: (id) => getById('portal_notifications', id),
    upsert: (record) => upsert('portal_notifications', record),
    softDelete: (id) => softDelete('portal_notifications', id),
  },
  products_variants: {
    getAll: (filters = {}) => getAll('product_variants', filters),
    getById: (id) => getById('product_variants', id),
    upsert: (record) => upsert('product_variants', record),
    softDelete: (id) => softDelete('product_variants', id),
  },
  material_reservations: {
    getAll: (filters = {}) => getAll('material_reservations', filters),
    getById: (id) => getById('material_reservations', id),
    upsert: (record) => upsert('material_reservations', record),
    softDelete: (id) => softDelete('material_reservations', id),
  },
  examination_jobs: {
    getAll: (filters = {}) => getAll('examination_jobs', filters),
    getById: (id) => getById('examination_jobs', id),
    upsert: (record) => upsert('examination_jobs', record),
    softDelete: (id) => softDelete('examination_jobs', id),
  },
  examination_job_subjects: {
    getAll: (filters = {}) => getAll('examination_job_subjects', filters),
    getById: (id) => getById('examination_job_subjects', id),
    upsert: (record) => upsert('examination_job_subjects', record),
    softDelete: (id) => softDelete('examination_job_subjects', id),
  },
  examination_invoice_groups: {
    getAll: (filters = {}) => getAll('examination_invoice_groups', filters),
    getById: (id) => getById('examination_invoice_groups', id),
    upsert: (record) => upsert('examination_invoice_groups', record),
    softDelete: (id) => softDelete('examination_invoice_groups', id),
  },
  examination_recurring_profiles: {
    getAll: (filters = {}) => getAll('examination_recurring_profiles', filters),
    getById: (id) => getById('examination_recurring_profiles', id),
    upsert: (record) => upsert('examination_recurring_profiles', record),
    softDelete: (id) => softDelete('examination_recurring_profiles', id),
  },
  examination_inventory_deductions: {
    getAll: (filters = {}) => getAll('examination_inventory_deductions', filters),
    getById: (id) => getById('examination_inventory_deductions', id),
    upsert: (record) => upsert('examination_inventory_deductions', record),
    softDelete: (id) => softDelete('examination_inventory_deductions', id),
  },
  examination_papers: {
    getAll: (filters = {}) => getAll('examination_papers', filters),
    getById: (id) => getById('examination_papers', id),
    upsert: (record) => upsert('examination_papers', record),
    softDelete: (id) => softDelete('examination_papers', id),
  },
  examination_printing_batches: {
    getAll: (filters = {}) => getAll('examination_printing_batches', filters),
    getById: (id) => getById('examination_printing_batches', id),
    upsert: (record) => upsert('examination_printing_batches', record),
    softDelete: (id) => softDelete('examination_printing_batches', id),
  },
  job_orders: {
    getAll: (filters = {}) => getAll('job_orders', filters),
    getById: (id) => getById('job_orders', id),
    upsert: (record) => upsert('job_orders', record),
    softDelete: (id) => softDelete('job_orders', id),
  },
  acceptance_runs: {
    getAll: (filters = {}) => getAll('acceptance_runs', filters),
    getById: (id) => getById('acceptance_runs', id),
    upsert: (record) => upsert('acceptance_runs', record),
    softDelete: (id) => softDelete('acceptance_runs', id),
  },
};

// ─── Flat-table helpers (portal tables with regular columns) ─────────────────

async function getAllFlat(table, filters = {}) {
  const rows = await request(table, filters);
  return rows || [];
}

async function getByIdFlat(table, id) {
  const rows = await request(table, { id: `eq.${id}`, limit: 1 });
  return rows?.[0] || null;
}

async function upsertFlat(table, record) {
  if (!isConfigured()) return null;
  const { id, ...data } = record;
  const row = { id, ...data, updated_at: new Date().toISOString() };
  try {
    const res = await axios.post(`${SUPABASE_URL}/rest/v1/${table}`, row, {
      headers: { ...adminHeaders(), Prefer: 'resolution=merge-duplicates,return=representation' },
      params: { on_conflict: 'id' },
      timeout: 20000,
    });
    return Array.isArray(res.data) ? (res.data[0] || null) : res.data;
  } catch (err) {
    console.warn(`[SupabaseRepo] ${table} upsertFlat failed:`, err?.message || err);
    return null;
  }
}

async function updateFlat(table, id, updates) {
  if (!isConfigured()) return null;
  try {
    const row = { ...updates, updated_at: new Date().toISOString() };
    const res = await axios.patch(`${SUPABASE_URL}/rest/v1/${table}`, row, {
      headers: { ...adminHeaders(), Prefer: 'return=representation' },
      params: { id: `eq.${id}` },
      timeout: 20000,
    });
    return Array.isArray(res.data) ? (res.data[0] || null) : res.data;
  } catch (err) {
    console.warn(`[SupabaseRepo] ${table} updateFlat failed:`, err?.message || err);
    return null;
  }
}

const portalEntities = {
  portal_users: {
    getAll: (filters = {}) => getAllFlat('portal_users', filters),
    getById: (id) => getByIdFlat('portal_users', id),
    getByEmail: (email) => getAllFlat('portal_users', { email: `eq.${email}`, limit: 1 }).then(rows => rows?.[0] || null),
    getByCustomerId: (customerId) => getAllFlat('portal_users', { customer_id: `eq.${customerId}`, limit: 1 }).then(rows => rows?.[0] || null),
    upsert: (record) => upsertFlat('portal_users', record),
    update: (id, updates) => updateFlat('portal_users', id, updates),
  },
  portal_sessions: {
    getAll: (filters = {}) => getAllFlat('portal_sessions', filters),
    getById: (id) => getByIdFlat('portal_sessions', id),
    upsert: (record) => upsertFlat('portal_sessions', record),
    update: (id, updates) => updateFlat('portal_sessions', id, updates),
  },
  portal_password_resets: {
    getAll: (filters = {}) => getAllFlat('portal_password_resets', filters),
    getById: (id) => getByIdFlat('portal_password_resets', id),
    upsert: (record) => upsertFlat('portal_password_resets', record),
    update: (id, updates) => updateFlat('portal_password_resets', id, updates),
  },
  portal_login_history: {
    getAll: (filters = {}) => getAllFlat('portal_login_history', filters),
    getById: (id) => getByIdFlat('portal_login_history', id),
    upsert: (record) => upsertFlat('portal_login_history', record),
  },
};

module.exports = {
  isConfigured,
  fromSupabaseRow,
  toSupabaseRow,
  request,
  getAll,
  getAllStrict,
  getById,
  upsert,
  softDelete,
  count,
  entities: entityQueries,
  getAllFlat,
  getByIdFlat,
  upsertFlat,
  updateFlat,
  portalEntities,
};
