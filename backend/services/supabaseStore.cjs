const axios = require('axios');

const SUPABASE_URL = String(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').replace(/\/+$/, '');
const SECRET_KEY = process.env.SUPABASE_SECRET_KEY || '';
const PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY || '';
const KEY = SECRET_KEY || PUBLISHABLE_KEY;

const CACHE_TTL_MS = 15 * 1000;
const cache = new Map();

const isConfigured = () => Boolean(SUPABASE_URL && KEY && !SUPABASE_URL.includes('placeholder'));

async function request(table, params = {}, options = {}) {
  if (!isConfigured()) return null;
  const url = `${SUPABASE_URL}/rest/v1/${table}`;
  const headers = {
    apikey: KEY,
    Authorization: `Bearer ${KEY}`,
    'User-Agent': options.userAgent || 'supabase-js/2',
  };
  try {
    const { data } = await axios.get(url, { params, headers, timeout: options.timeout || 10000 });
    return Array.isArray(data) ? data : null;
  } catch (err) {
    const status = err.response && err.response.status;
    const detail = err.response && err.response.data ? JSON.stringify(err.response.data) : '';
    console.warn(`[SupabaseStore] ${table} read failed (${status || err.message}): ${detail}`);
    return null;
  }
}

async function cached(key, fetcher) {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.value;
  const value = await fetcher();
  cache.set(key, { at: Date.now(), value });
  return value;
}

const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

// ─── Catalog (products) ────────────────────────────────────────────────

async function listCatalogItems() {
  return cached('catalog', async () => {
    const rows = await request('products', { select: 'id,data' }, { timeout: 20000 });
    if (!rows || rows.length === 0) return [];
    const items = [];
    for (const row of rows) {
      const d = (row && typeof row.data === 'object' && row.data) ? row.data : {};
      if (String(d.status || '').toLowerCase() === 'deleted') continue;
      if (String(d.inventoryRole || '').toLowerCase() === 'internal') continue;
      items.push({
        id: row.id,
        name: d.name || row.name || row.id,
        sku: d.sku || null,
        unit: d.unit || '',
        price: num(d.sellingPrice ?? d.selling_price ?? d.price),
        quantity: num(d.stock),
        category: d.category || d.type || 'General',
        status: d.status || 'Active',
      });
    }
    return items;
  });
}

// ─── Sales (POS receipts — real ERP activity) ─────────────────────────

async function listSales(customerId) {
  if (!customerId) return [];
  return cached(`sales:${customerId}`, async () => {
    const rows = await request('sales', { select: 'id,data', 'data->>customerId': 'eq.' + customerId, limit: 1000 }, { timeout: 20000 });
    if (!rows || rows.length === 0) return [];
    return rows.map((row) => {
      const d = (row && typeof row.data === 'object' && row.data) ? row.data : {};
      return {
        id: row.id,
        date: d.date || d.paid_at || d.created_at || null,
        totalAmount: num(d.totalAmount ?? d.total ?? d.total_amount),
        customerName: d.customerName || '',
        status: d.status || 'Paid',
      };
    });
  });
}

// ─── Customers ──────────────────────────────────────────────────────────

async function getCustomer(customerId) {
  if (!customerId) return null;
  const rows = await request('customers', { id: 'eq.' + customerId, select: 'id,data' });
  if (!rows || rows.length === 0) return null;
  const row = rows[0];
  const d = (row && typeof row.data === 'object' && row.data) ? row.data : {};
  return {
    id: row.id,
    name: d.name || row.name || '',
    email: d.email || row.email || '',
    phone: d.phone || row.phone || '',
    address: d.billingAddress || d.address || '',
    city: d.city || '',
    state: d.state || '',
    zip: d.zip || '',
    country: d.country || '',
    balance: num(d.balance),
    walletBalance: num(d.walletBalance),
    creditLimit: num(d.creditLimit),
    outstandingBalance: num(d.outstandingBalance ?? d.balance),
    status: d.status || row.status || '',
  };
}

// ─── Invoices ───────────────────────────────────────────────────────────

function mapInvoiceLineItems(items) {
  if (!Array.isArray(items)) return [];
  return items.map((it) => {
    const x = it || {};
    return {
      item_name: x.productName || x.itemName || x.name || x.desc || x.description || '',
      quantity: num(x.quantity),
      unit_price: num(x.unitPrice ?? x.unit_price ?? x.price ?? x.selling_price),
      line_total: num(x.subtotal ?? x.lineTotalNet ?? x.line_total ?? x.subTotal ?? x.price * x.quantity),
    };
  });
}

function mapInvoice(row) {
  const d = (row && typeof row.data === 'object' && row.data) ? row.data : {};
  const status = d.status || (num(d.paidAmount) > 0 ? 'partial' : 'unpaid');
  return {
    id: row.id,
    invoice_number: d.invoice_number || d.invoiceNumber || row.id,
    customer_name: d.customerName || '',
    total_amount: num(d.totalAmount ?? d.total ?? d.total_amount),
    paid_amount: num(d.paidAmount ?? d.paid_amount),
    status: String(status),
    due_date: d.dueDate || d.due_date || null,
    created_at: d.date || d.created_at || null,
    currency: d.currency || 'MWK',
    subtotal: num(d.subtotal ?? d.materialTotal ?? d.total ?? d.total_amount),
    other_charges: num(d.otherCharges ?? d.other_charges),
    notes: d.notes || null,
    document_title: d.documentTitle || null,
    line_items: mapInvoiceLineItems(d.items || d.line_items),
    _customerId: d.customerId || null,
  };
}

async function listInvoices(customerId) {
  if (!customerId) return [];
  return cached(`invoices:${customerId}`, async () => {
    const rows = await request('invoices', { select: 'id,data', 'data->>customerId': 'eq.' + customerId, limit: 1000 }, { timeout: 20000 });
    if (!rows || rows.length === 0) return [];
    return rows
      .map((row) => mapInvoice(row))
      .sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
  });
}

async function getInvoice(invoiceId, customerId) {
  if (!invoiceId) return null;
  const rows = await request('invoices', { select: 'id,data', id: 'eq.' + invoiceId, limit: 1 }, { timeout: 15000 });
  if (!rows || rows.length === 0) return null;
  const invoice = mapInvoice(rows[0]);
  if (customerId && invoice._customerId !== customerId) return null;
  delete invoice._customerId;
  return invoice;
}

// ─── Cloud health (for SQLite fallback decisions) ──────────────────────

async function cloudAvailable() {
  const items = await listCatalogItems();
  return Array.isArray(items) && items.length > 0;
}

module.exports = {
  isConfigured,
  listCatalogItems,
  getCustomer,
  listInvoices,
  getInvoice,
  listSales,
  cloudAvailable,
};