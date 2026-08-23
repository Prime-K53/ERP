const repo = require('./supabaseRepository.cjs');
const supabaseStore = require('./supabaseStore.cjs');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const portalAuthService = require('./portalAuthService.cjs');
const portalLifecycleService = require('./portalLifecycleService.cjs');
const ReferralService = require('./referralService.cjs');
const referralService = new ReferralService();
const { customerFilter, withCustomerScope } = require('./portalScope.cjs');
const customerLedger = require('./customerLedger.cjs');

const TICKET_ATTACHMENTS_DIR = path.join(__dirname, '..', 'storage', 'ticket-attachments');

/**
 * Bound an awaited cloud/Supabase call with a timeout. A hanging cloud
 * request must never block the portal response — it falls back to the local
 * database instead (local-first, cloud-sync-in-background behaviour).
 */
function withCloudTimeout(promise, ms = 5000, label = 'Cloud') {
  let timer = null;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${label} request timed out after ${ms}ms`)), ms);
    }),
  ]).finally(() => clearTimeout(timer));
}

function genId(prefix = 'prt') {
  return `${prefix}_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`;
}

function parseJson(value, fallback = null) {
  if (value === null || value === undefined) return fallback;
  if (typeof value !== 'string') return value;
  try { return JSON.parse(value); } catch { return fallback; }
}

async function getAllFrom(table, filters = {}) {
  // Strict read: a database failure must surface as an error (route 500 →
  // frontend error/retry), never as a fabricated empty result. A genuinely
  // empty table still returns [].
  return repo.getAllStrict(table, filters);
}

async function getOneById(table, id) {
  const rows = await repo.getAllStrict(table, { id: `eq.${id}`, limit: 1 });
  return rows[0] || null;
}

/**
 * Customer-scoped table read with defense-in-depth.
 *
 * `customerFilter` applies the canonical PostgREST scope (including an `or`
 * clause for tables written by both the ERP frontend `customerId` and the
 * backend shim `customer_id`). Reads are STRICT: a database failure propagates
 * to a visible error state and is never masked as an empty result. In
 * addition, every returned row is verified to match the customer in JS — a
 * customer can NEVER see another customer's records, even if a row carries an
 * unexpected key spelling or a filter was misapplied.
 */
async function scopedRows(table, customerId) {
  const rows = await repo.getAllStrict(table, customerFilter(table, customerId));
  const target = String(customerId || '');
  return target
    ? rows.filter((r) => String(r.customerId || r.customer_id || '') === target)
    : rows;
}

/**
 * Customer's official orders from BOTH authoritative ERP order structures:
 *   - `sales_orders` — SO-YYYY orders written by the backend shim
 *     (portalLifecycleService) and the ERP frontend salesOrders store.
 *   - `orders`      — ORD-XXXX orders written by the ERP frontend orders
 *     store (the ERP internal Order History screen's source; e.g. orders
 *     converted from a quotation in the ERP UI).
 * Both are read through the canonical customer scope (PostgREST `or` /
 * single-key filter) AND re-verified in JS, so a customer can NEVER see
 * another customer's orders. Rows are deduplicated by id.
 */
async function getCustomerOrders(customerId) {
  const [soRows, orderRows] = await Promise.all([
    scopedRows('sales_orders', customerId),
    scopedRows('orders', customerId),
  ]);
  const merged = new Map();
  for (const row of [...soRows, ...orderRows]) {
    const key = String(row.id);
    if (!merged.has(key)) merged.set(key, row);
  }
  return Array.from(merged.values());
}

const portalService = {

  async getDashboard(portalUserId, customerId) {
    const [customerRows, invoices, orders, requests, quotations, notifications, pointRows, walletRows, shipments] = await Promise.all([
      getOneById('customers', customerId),
      getAllFrom('invoices', customerFilter('invoices', customerId)),
      getCustomerOrders(customerId),
      getAllFrom('quotation_requests', customerFilter('quotation_requests', customerId)),
      getAllFrom('quotations', customerFilter('quotations', customerId)),
      getAllFrom('portal_notifications', { 'portal_user_id': `eq.${portalUserId}` }),
      getOneById('engagement_point_balances', customerId),
      getAllFrom('wallet_transactions', customerFilter('wallet_transactions', customerId)),
      this.getShipments(customerId),
    ]);

    const customer = customerRows || null;
    if (!customer) {
      throw new Error('Customer record not found for authenticated portal user');
    }
    const pointBalance = pointRows || null;

    const unpaidCount = invoices.filter((i) => /unpaid|partial|overdue/i.test(String(i.status || ''))).length;
    const totalOrders = orders.length;
    const activeRequestCount = requests.filter((r) =>
      ['submitted', 'assigned', 'under_review', 'waiting_for_customer', 'ready_for_conversion'].includes(String(r.status || ''))
    ).length;
    const openQuotationCount = quotations.filter((q) =>
      ['ready', 'accepted', 'revision_requested'].includes(String(q.status || ''))
    ).length;
    const productionOrderCount = orders.filter((o) =>
      ['confirmed', 'processing', 'pending', 'shipped'].includes(String(o.status || '').toLowerCase())
    ).length;
    const unreadMessageCount = notifications.filter((n) => !n.is_read).length;
    const activeDeliveries = (shipments || []).filter((s) =>
      !/delivered|cancelled/i.test(String(s.order_status || ''))
    ).length;

    const [recentDocs, recentTransactions, pendingDeliveries] = await Promise.all([
      this.getRecentDocuments(customerId, 5),
      this.getRecentTransactions(customerId, 5),
      this.getTodayPendingDeliveries(customerId),
    ]);

    const health = this.computeHealthScore({
      customer,
      invoices,
      orders,
      requests,
      quotations,
      pointBalance,
      walletRows,
    });

    // Authoritative outstanding balance — computed by the canonical customer
    // ledger (single definition shared with the ERP). The stored
    // customers.balance field is a deprecated cache and must never be the
    // source of financial truth.
    const [ledgerPayments] = await Promise.all([
      customerLedger.loadCustomerPayments(customerId),
    ]);
    const ledger = customerLedger.buildLedgerFromRecords({ customerId, invoices, payments: ledgerPayments });
    const outstandingBalance = ledger.outstandingBalance;

    return {
      // [LEDGER] balance derived from the authoritative ledger, not the deprecated cache.
      balance: ledger.closingBalance,
      walletBalance: (customer && customer.walletBalance != null) ? customer.walletBalance : 0,
      outstandingBalance,
      creditLimit: (customer && customer.creditLimit != null) ? customer.creditLimit : 0,
      unpaidInvoiceCount: unpaidCount,
      totalOrders,
      activeRequestCount,
      openQuotationCount,
      productionOrderCount,
      unreadMessageCount,
      activeDeliveries,
      recentDocuments: recentDocs,
      recentTransactions,
      pendingDeliveries,
      health,
    };
  },

  // ── Customer Health Score — computed from real ERP data ──────────────────
  computeHealthScore({ customer, invoices = [], orders = [], requests = [], quotations = [], pointBalance = null, walletRows = [] }) {
    const toNum = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
    const now = Date.now();
    const DAY = 24 * 60 * 60 * 1000;
    const paidStatus = (s) => /paid|fulfilled|settled/i.test(String(s || ''));
    const openStatus = (s) => /unpaid|partial|overdue|pending/i.test(String(s || ''));

    // ── Payment History ──
    let paidAmount = 0;
    let totalAmount = 0;
    for (const inv of invoices) {
      const total = toNum(inv.total_amount ?? inv.total ?? inv.amount);
      if (total <= 0) continue;
      totalAmount += total;
      if (paidStatus(inv.status)) paidAmount += total;
      else paidAmount += Math.min(total, toNum(inv.paid_amount ?? inv.paidAmount ?? 0));
    }
    const paymentHistory = totalAmount > 0
      ? Math.round((paidAmount / totalAmount) * 100)
      : 100;

    // ── Overdue Invoices ──
    const openWithDueDate = invoices.filter((i) => {
      if (!openStatus(i.status)) return false;
      const due = i.due_date || i.dueDate || i.created_at;
      if (!due) return true; // open invoice with no due date counts as risk
      return new Date(due).getTime() < now;
    }).length;
    const totalOpen = invoices.filter((i) => openStatus(i.status)).length;
    const overdueInvoices = totalOpen > 0
      ? Math.max(0, Math.round(100 - (openWithDueDate / totalOpen) * 100))
      : 100;

    // ── Order Frequency (last 90 days vs total history) ──
    const recentOrders = orders.filter((o) => {
      const d = new Date(o.orderDate || o.created_at || o.date || 0).getTime();
      return Number.isFinite(d) && d >= now - 90 * DAY;
    }).length;
    const orderFrequency = orders.length > 0
      ? Math.min(100, Math.round((recentOrders / orders.length) * 70 + 30))
      : 0;

    // ── Rewards / Loyalty Activity ──
    const points = toNum(pointBalance?.balance ?? pointBalance?.points ?? 0);
    const walletCredits = (walletRows || [])
      .filter((w) => String(w.type || '').toLowerCase() === 'credit')
      .reduce((sum, w) => sum + toNum(w.amount), 0);
    const rewards = Math.min(100, Math.round(
      Math.min(points, 100) * 0.6 + Math.min(walletCredits * 0.5, 100) * 0.4
    ));

    // ── Engagement / Response Time (requests + quotations activity) ──
    const recentActivity = [...requests, ...quotations].filter((r) => {
      const d = new Date(r.created_at || r.date || 0).getTime();
      return Number.isFinite(d) && d >= now - 30 * DAY;
    }).length;
    const responseTime = Math.min(100, Math.round((recentActivity / 4) * 100));

    const factors = {
      paymentHistory,
      overdueInvoices,
      orderFrequency,
      rewards,
      responseTime,
    };

    const score = Math.round(
      paymentHistory * 0.30
      + overdueInvoices * 0.25
      + orderFrequency * 0.20
      + rewards * 0.15
      + responseTime * 0.10
    );

    return {
      score: Math.max(0, Math.min(100, score)),
      factors,
      summary: {
        paidValue: paidAmount,
        totalValue: totalAmount,
        openInvoices: totalOpen,
        overdueInvoices: openWithDueDate,
        recentOrders,
        totalOrders: orders.length,
        points,
        walletCredits,
      },
    };
  },

  async getCatalog(includeDeleted = false) {
    // The ERP frontend syncs its local `inventory` store to the cloud
    // `products` table (CLOUD_TABLE_MAP.inventory = 'products' in
    // frontend/services/db.ts + cloudDb.ts). The cloud `inventory` table is
    // never written by the sync gateway, so reading it yields an empty
    // catalog — the portal must read `products` to show the real ERP items
    // (products, stationery, raw materials, services).
    // Strict read: a catalog query failure surfaces as an error (route 500 →
    // error/retry), never as a fake empty catalog. A genuinely empty `products`
    // table is a valid empty state and returns [].
    let catalogItems = await getAllFrom('products');

    if (!includeDeleted) {
      catalogItems = catalogItems.filter((i) => String(i.status || '').toLowerCase() !== 'deleted');
    }

    // Hide raw materials: only show printed products, stationery, and printing services
    catalogItems = catalogItems.filter((i) => {
      const type = String(i.type || i.inventoryRole || '').toLowerCase();
      return !/raw|material|stock/i.test(type);
    });
    catalogItems.sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));

    const productIds = catalogItems.map((i) => i.id).filter(Boolean);
    const { collectProductVariants } = require('./catalogVariants.cjs');
    let tableVariantsByParent = new Map();
    if (productIds.length > 0) {
      // The authoritative variant data lives EMBEDDED in each product doc;
      // the product_variants table is merged when populated. Without this
      // merge a multi-variant product reaches the portal as a single price.
      try {
        const allVariants = await getAllFrom('product_variants');
        for (const v of allVariants || []) {
          if (v.active === false) continue;
          const pid = v.productId || v.product_id;
          if (!pid || !productIds.includes(pid)) continue;
          if (!tableVariantsByParent.has(pid)) tableVariantsByParent.set(pid, []);
          tableVariantsByParent.get(pid).push(v);
        }
      } catch (err) {
        console.warn('[Portal] product_variants read failed (continuing with embedded variants):', err?.message || err);
      }
    }

    return catalogItems.map((item) => {
      const variants = collectProductVariants(item, tableVariantsByParent.get(item.id))
        .filter((v) => v.active)
        .map((v) => ({
          id: v.id,
          productId: v.productId,
          name: v.name,
          sku: v.sku,
          attributes: v.attributes,
          sellingPrice: v.sellingPrice,
          costPrice: v.costPrice,
          stock: v.stock,
          active: v.active,
        }));

      return {
        id: item.id,
        name: item.name,
        sku: item.sku,
        unit: item.unit || '',
        type: item.type || item.inventoryRole || null,
        description: item.description || null,
        price: Number(item.sellingPrice ?? item.selling_price ?? item.price ?? 0),
        quantity: Number(item.stock ?? item.quantity ?? 0),
        category: item.category || item.type || 'General',
        status: item.status || 'Active',
        variants: variants.length > 0 ? variants : undefined,
      };
    });
  },

  async getRecentTransactions(customerId, limit = 5) {
    const entries = [];

    const [cloudInvoices, cloudSales] = await Promise.all([
      getAllFrom('invoices', customerFilter('invoices', customerId)),
      getAllFrom('sales', customerFilter('sales', customerId)),
    ]);

    for (const inv of cloudInvoices) {
      entries.push({
        date: inv.created_at,
        description: `Invoice ${inv.invoice_number || inv.id}`,
        amount: inv.total_amount,
        type: 'invoice',
        status: inv.status,
        docType: 'invoice',
        docId: inv.id,
      });
    }

    for (const sale of cloudSales) {
      entries.push({
        date: sale.date,
        description: `Sale ${sale.id || ''}`.trim() || 'Sale',
        amount: sale.total_amount,
        type: 'sale',
        status: sale.status,
        docType: 'sale',
        docId: sale.id,
      });
    }

    const recentPayments = await getAllFrom('customer_payments', customerFilter('customer_payments', customerId));
    for (const pay of recentPayments) {
      entries.push({
        date: pay.date,
        description: (pay.reference && String(pay.reference).trim()) ? String(pay.reference).trim() : 'Payment received',
        amount: pay.amount,
        type: 'payment',
        status: pay.status,
        docType: 'payment',
        docId: pay.id,
      });
    }

    const recentOrders = await getCustomerOrders(customerId);
    for (const ord of recentOrders) {
      entries.push({
        date: ord.orderDate,
        description: `Order ${ord.order_number || ord.orderNumber || ord.id} ${ord.status || ''}`.trim(),
        amount: null,
        type: 'order',
        status: ord.status,
        docType: 'order',
        docId: ord.id,
      });
    }

    const recentRequests = await getAllFrom('quotation_requests', customerFilter('quotation_requests', customerId));
    for (const req of recentRequests) {
      entries.push({
        date: req.created_at,
        description: `${req.request_type || 'Request'} ${req.request_number || req.id}`.trim(),
        amount: null,
        type: 'request',
        status: req.status,
        docType: 'request',
        docId: req.id,
      });
    }

    return entries
      .filter((e) => e.date)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, limit);
  },

  async getRecentDocuments(customerId, limit = 5) {
    const [requests, quotations, orders] = await Promise.all([
      getAllFrom('quotation_requests', customerFilter('quotation_requests', customerId)),
      getAllFrom('quotations', customerFilter('quotations', customerId)),
      getCustomerOrders(customerId),
    ]);

    const mappedRequests = requests.map((r) => ({
      docType: 'request',
      id: r.id,
      docNumber: r.request_number || r.id,
      status: r.status,
      request_type: r.request_type,
      created_at: r.created_at,
    }));

    const mappedQuotations = quotations.map((q) => ({
      docType: 'quotation',
      id: q.id,
      docNumber: q.quotation_number || q.id,
      status: q.status,
      created_at: q.created_at,
    }));

    const mappedOrders = orders.map((o) => ({
      docType: 'order',
      id: o.id,
      docNumber: o.order_number || o.orderNumber || o.id,
      status: o.status,
      created_at: o.orderDate || o.created_at,
    }));

    return [...mappedRequests, ...mappedQuotations, ...mappedOrders]
      .sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime())
      .slice(0, limit);
  },

  async getRequestsPaginated(customerId, { page = 1, pageSize = 20, status, search } = {}) {
    const offset = (page - 1) * pageSize;
    const filters = withCustomerScope('quotation_requests', customerId);
    if (status) filters['data->>status'] = `eq.${status}`;

    const allRows = await getAllFrom('quotation_requests', filters);
    let filtered = Array.isArray(allRows) ? allRows : [];
    if (search) {
      const q = String(search).toLowerCase();
      filtered = filtered.filter((r) =>
        String(r.request_number || '').toLowerCase().includes(q) ||
        String(r.customer_name || '').toLowerCase().includes(q)
      );
    }
    filtered.sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
    const total = filtered.length;
    const rows = filtered.slice(offset, offset + pageSize);

    return {
      requests: rows.map((r) => ({
        ...r,
        status: r.quotation_id ? (r.status === 'quotation_ready' ? 'converted' : r.status) : r.status,
        items: parseJson(r.items, []),
        attachments: parseJson(r.attachments, []),
        promotion: parseJson(r.promotion, null),
      })),
      total, page, pageSize, totalPages: Math.ceil(total / pageSize) || 1,
    };
  },

  async getOrders(customerId) {
    const [orders, customer] = await Promise.all([
      getCustomerOrders(customerId),
      getOneById('customers', customerId),
    ]);
    return orders.map((o) => ({
      ...o,
      order_number: o.order_number || o.orderNumber,
      customerName: (customer && customer.name) || '',
      totalAmount: o.totalAmount ?? o.total ?? 0,
      items_json: o.items,
    }));
  },

  async getOrdersPaginated(customerId, { page = 1, pageSize = 20, status, search, dateFrom, dateTo } = {}) {
    const offset = (page - 1) * pageSize;
    const allRows = await getCustomerOrders(customerId);
    let filtered = Array.isArray(allRows) ? allRows : [];

    // Request-chain fallback: an order converted from one of this customer's
    // requests is authoritative for portal visibility even when the order
    // record's own customer key is mismatched (legacy records whose link was
    // recorded only on the request side). The request ↔ order link is the
    // permanent bidirectional reference, so it is resolved first and the order
    // is fetched by id (from either authoritative order structure). Orders
    // carrying NO customer key at all stay hidden (isolation: ownership must
    // be provable).
    try {
      const requestRows = await getAllFrom('quotation_requests', customerFilter('quotation_requests', customerId));
      const linkedIds = new Set();
      for (const r of Array.isArray(requestRows) ? requestRows : []) {
        const linkedId = r.sales_order_id || r.salesOrderId;
        if (linkedId) linkedIds.add(String(linkedId));
      }
      if (linkedIds.size > 0) {
        const known = new Set(filtered.map((o) => String(o.id)));
        for (const linkedId of linkedIds) {
          if (known.has(linkedId)) continue;
          const order = (await getOneById('sales_orders', linkedId)) || (await getOneById('orders', linkedId));
          if (!order) continue;
          // Defense in depth: never surface an order owned by another customer
          // even if the request linkage claims otherwise.
          const orderCustomer = order.customerId || order.customer_id || null;
          if (customerId && String(orderCustomer ?? '') !== String(customerId)) continue;
          if (status && String(order.status || '').toLowerCase() !== String(status).toLowerCase()) continue;
          filtered.push(order);
          known.add(String(order.id));
        }
      }
    } catch {
      // Non-fatal: the direct customer-scope query above remains authoritative.
    }

    if (status) {
      const s = String(status).toLowerCase();
      filtered = filtered.filter((o) => String(o.status || '').toLowerCase() === s);
    }
    if (search) {
      const q = String(search).toLowerCase();
      filtered = filtered.filter((o) =>
        String(o.order_number || o.orderNumber || '').toLowerCase().includes(q) ||
        String(o.customerName || o.customer_name || '').toLowerCase().includes(q)
      );
    }
    if (dateFrom) filtered = filtered.filter((o) => String(o.orderDate || o.created_at || '') >= dateFrom);
    if (dateTo) filtered = filtered.filter((o) => String(o.orderDate || o.created_at || '') <= dateTo);
    filtered.sort((a, b) => String(b.orderDate || b.created_at || '').localeCompare(String(a.orderDate || a.created_at || '')));
    const total = filtered.length;
    const rows = filtered.slice(offset, offset + pageSize);

    return { orders: rows, total, page, pageSize, totalPages: Math.ceil(total / pageSize) || 1 };
  },

  async getOrderById(orderId, customerId) {
    const order = (await getOneById('sales_orders', orderId)) || (await getOneById('orders', orderId));
    if (!order) return null;
    const orderCustomerId = order.customerId || order.customer_id || null;
    if (customerId && String(orderCustomerId) !== String(customerId)) return null;
    order.order_number = order.order_number || order.orderNumber;
    order.items = parseJson(order.items, []).map((item) => {
      const price = Number(item.price ?? item.unitPrice ?? item.unit_price ?? 0);
      const quantity = Number(item.quantity ?? 1);
      const lineTotal = Number(item.lineTotal ?? item.line_total ?? (price * quantity));
      return {
        name: item.name || item.productName || item.product_name || item.description || 'Item',
        quantity,
        unitPrice: price,
        lineTotal
      };
    });
    order.promotion = parseJson(order.promotion, null);
    order.totalAmount = order.total ?? order.totalAmount ?? 0;
    return order;
  },

  async getQuotations(customerId) {
    // quotations is written by BOTH the ERP frontend store (camelCase
    // `customerId`) and the backend shim (snake_case `customer_id`). The
    // lifecycle query scopes by `customer_id`; merge any canonical-scope rows
    // the shim query misses so historical records from either source appear.
    const [lifecycleRows, cloudRows] = await Promise.all([
      portalLifecycleService.getQuotations({ customerId }),
      getAllFrom('quotations', customerFilter('quotations', customerId)),
    ]);
    const seen = new Set((lifecycleRows || []).map((r) => r.id));
    const extras = (cloudRows || [])
      .filter((r) => !seen.has(r.id))
      .map((r) => ({ ...r, items: parseJson(r.items, []) }));
    return [...(lifecycleRows || []), ...extras];
  },

  async getQuotationsPaginated(customerId, { page = 1, pageSize = 20, status, search } = {}) {
    const offset = (page - 1) * pageSize;
    const filters = withCustomerScope('quotations', customerId);
    if (status) filters['data->>status'] = `eq.${status}`;

    const allRows = await getAllFrom('quotations', filters);
    let filtered = Array.isArray(allRows) ? allRows : [];
    if (search) {
      const q = String(search).toLowerCase();
      filtered = filtered.filter((r) =>
        String(r.quotation_number || '').toLowerCase().includes(q) ||
        String(r.customer_name || '').toLowerCase().includes(q)
      );
    }
    filtered.sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
    const total = filtered.length;
    const rows = filtered.slice(offset, offset + pageSize);

    return {
      quotations: rows.map((r) => ({
        ...r,
        items: parseJson(r.items, []),
      })),
      total, page, pageSize, totalPages: Math.ceil(total / pageSize) || 1,
    };
  },

  async getInvoices(customerId) {
    try {
      const cloudInvoices = await withCloudTimeout(supabaseStore.listInvoices(customerId), 5000, 'Cloud invoices');
      if (Array.isArray(cloudInvoices) && cloudInvoices.length > 0) {
        return cloudInvoices.map((i) => ({
          id: i.id,
          invoice_number: i.invoice_number,
          customer_name: i.customer_name,
          total_amount: i.total_amount,
          paid_amount: i.paid_amount,
          status: i.status,
          due_date: i.due_date,
          created_at: i.created_at,
        }));
      }
    } catch (err) {
      console.warn('[PortalService] Cloud invoices unavailable, using local:', err.message);
    }

    const invoices = await getAllFrom('invoices', customerFilter('invoices', customerId));
    return invoices.map((i) => ({
      id: i.id,
      invoice_number: i.invoice_number,
      customer_name: i.customer_name,
      total_amount: i.total_amount,
      paid_amount: i.paid_amount,
      status: i.status,
      due_date: i.due_date,
      created_at: i.created_at,
    }));
  },

  async getInvoicesPaginated(customerId, { page = 1, pageSize = 20, status, search, dateFrom, dateTo } = {}) {
    const offset = (page - 1) * pageSize;

    try {
      const cloudInvoices = await withCloudTimeout(supabaseStore.listInvoices(customerId), 5000, 'Cloud invoices');
      if (Array.isArray(cloudInvoices) && cloudInvoices.length > 0) {
        let filtered = cloudInvoices.map((i) => ({
          id: i.id,
          invoice_number: i.invoice_number,
          customer_name: i.customer_name,
          total_amount: i.total_amount,
          paid_amount: i.paid_amount,
          status: i.status,
          due_date: i.due_date,
          created_at: i.created_at,
        }));
        if (status) {
          const lowerStatus = String(status).toLowerCase();
          filtered = filtered.filter((inv) => String(inv.status || '').toLowerCase() === lowerStatus);
        }
        if (search) {
          const lowerSearch = String(search).toLowerCase();
          filtered = filtered.filter((inv) =>
            String(inv.invoice_number || '').toLowerCase().includes(lowerSearch) ||
            String(inv.customer_name || '').toLowerCase().includes(lowerSearch)
          );
        }
        return {
          invoices: filtered.slice(offset, offset + pageSize),
          total: filtered.length,
          page,
          pageSize,
          totalPages: Math.ceil(filtered.length / pageSize) || 1,
        };
      }
    } catch (err) {
      console.warn('[PortalService] Cloud invoices unavailable, using local:', err.message);
    }

    const filters = customerFilter('invoices', customerId);

    const allRows = await getAllFrom('invoices', filters);
    let filtered = Array.isArray(allRows) ? allRows : [];
    if (status) {
      const lowerStatus = String(status).toLowerCase();
      filtered = filtered.filter((inv) => String(inv.status || '').toLowerCase() === lowerStatus);
    }
    if (search) {
      const lowerSearch = String(search).toLowerCase();
      filtered = filtered.filter((inv) =>
        String(inv.invoice_number || '').toLowerCase().includes(lowerSearch) ||
        String(inv.customer_name || '').toLowerCase().includes(lowerSearch)
      );
    }
    if (dateFrom) filtered = filtered.filter((inv) => String(inv.created_at || '') >= dateFrom);
    if (dateTo) filtered = filtered.filter((inv) => String(inv.created_at || '') <= dateTo);
    filtered.sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
    const total = filtered.length;
    const rows = filtered.slice(offset, offset + pageSize).map((i) => ({
      id: i.id,
      invoice_number: i.invoice_number,
      customer_name: i.customer_name,
      total_amount: i.total_amount,
      paid_amount: i.paid_amount,
      status: i.status,
      due_date: i.due_date,
      created_at: i.created_at,
    }));

    return { invoices: rows, total, page, pageSize, totalPages: Math.ceil(total / pageSize) || 1 };
  },

  async revertInvoicePayment(invoiceId, customerId, { portalUserId = null } = {}) {
    const invoice = await this.getInvoiceById(invoiceId, customerId);
    if (!invoice) return null;

    const payments = await getAllFrom('customer_payments', { 'data->>customerId': `eq.${customerId}` });
    const amountForInvoice = (p) =>
      (Array.isArray(p.allocations) ? p.allocations : [])
        .filter((a) => String(a.invoice_id || a.invoiceId || '') === String(invoiceId))
        .reduce((s, a) => s + Number(a.allocated ?? a.amount ?? 0), 0);

    // Payments from this customer that allocate to this invoice and are not
    // already reversed.
    const matching = (Array.isArray(payments) ? payments : []).filter((p) => {
      if (String(p.customerId || p.customer_id || '') !== String(customerId)) return false;
      if (p.reversed === true || /revers/i.test(String(p.status || ''))) return false;
      return amountForInvoice(p) > 0;
    });

    if (matching.length === 0) {
      throw new Error('No reversible payment found for this invoice');
    }

    // Reverse the most recent payment allocated to the invoice.
    matching.sort((a, b) =>
      String(b.date || b.created_at || '').localeCompare(String(a.date || a.created_at || ''))
    );
    const payment = matching[0];
    const reversedAmount = amountForInvoice(payment);

    await repo.upsert('customer_payments', {
      ...payment,
      status: 'reversed',
      reversed: true,
      reversed_at: new Date().toISOString(),
    });

    // Best-effort: mark normalized allocation rows as reversed.
    try {
      const lines = await getAllFrom('payment_allocation_lines', { 'data->>invoice_id': `eq.${invoiceId}` });
      await Promise.all((Array.isArray(lines) ? lines : []).map((line) =>
        repo.upsert('payment_allocation_lines', { ...line, reversed: true })
      ));
      const allocs = await getAllFrom('payment_allocations', { 'data->>payment_id': `eq.${payment.id || payment.paymentId || ''}` });
      await Promise.all((Array.isArray(allocs) ? allocs : []).map((alloc) =>
        repo.upsert('payment_allocations', { ...alloc, reversed: true })
      ));
    } catch (err) {
      console.warn('[PortalService] Best-effort allocation reversal failed:', err.message);
    }

    // Recompute the invoice paid amount + status from remaining active payments.
    const remainingPaid = matching.slice(1).reduce((sum, p) => sum + amountForInvoice(p), 0);
    const total = Number(invoice.total_amount) || 0;
    const newStatus = remainingPaid <= 0 ? 'unpaid' : remainingPaid >= total ? 'paid' : 'partially_paid';
    await repo.upsert('invoices', {
      ...invoice,
      paid_amount: remainingPaid,
      status: newStatus,
      paid_at: remainingPaid <= 0 ? null : invoice.paid_at,
    });

    // Emit realtime event + in-app notification (mirrors recordPayment).
    try {
      await portalLifecycleService.publishErpEvent({
        customerId,
        docType: 'invoice',
        docId: String(invoiceId),
        eventType: 'payment_reverted',
        docNumber: invoice.invoice_number,
        title: 'Payment reverted',
        body: `A payment of K ${Number(reversedAmount).toFixed(2)} was reverted on invoice ${invoice.invoice_number}.`,
        link: `#/portal/invoices/${invoiceId}`,
        notificationType: 'payment_reverted',
        actor: { type: 'customer', id: portalUserId },
        metadata: { invoiceId, reversedAmount },
      });
    } catch (err) {
      console.warn('[PortalService] Revert event publish failed:', err.message);
    }

    return { success: true, invoiceId, reversedAmount, status: newStatus, remainingPaid };
  },

  async getInvoiceById(invoiceId, customerId) {
    try {
      const cloud = await withCloudTimeout(supabaseStore.getInvoice(invoiceId, customerId), 5000, 'Cloud invoice');
      if (cloud) return cloud;
    } catch (err) {
      console.warn('[PortalService] Cloud invoice unavailable, using local:', err.message);
    }
    const invoice = await getOneById('invoices', invoiceId);
    if (!invoice) return null;
    const invoiceCustomerId = invoice.customerId || invoice.customer_id || null;
    if (customerId && String(invoiceCustomerId) !== String(customerId)) return null;
    invoice.line_items = invoice.items || parseJson(invoice.line_items_json, []);
    delete invoice.line_items_json;
    delete invoice.items;
    return invoice;
  },

  async getPayments(customerId) {
    const payments = await getAllFrom('customer_payments', customerFilter('customer_payments', customerId));
    return payments.map((p) => ({
      id: p.id,
      amount: p.amount,
      payment_method: p.method,
      date: p.date,
      reference: p.reference,
    }));
  },

  async getPaymentsPaginated(customerId, { page = 1, pageSize = 20, search, dateFrom, dateTo } = {}) {
    const offset = (page - 1) * pageSize;
    const filters = withCustomerScope('customer_payments', customerId);

    const allRows = await getAllFrom('customer_payments', filters);
    let filtered = Array.isArray(allRows) ? allRows : [];
    if (search) {
      const q = String(search).toLowerCase();
      filtered = filtered.filter((p) =>
        String(p.reference || '').toLowerCase().includes(q) ||
        String(p.method || '').toLowerCase().includes(q)
      );
    }
    if (dateFrom) filtered = filtered.filter((p) => String(p.date || '') >= dateFrom);
    if (dateTo) filtered = filtered.filter((p) => String(p.date || '') <= dateTo);
    filtered.sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
    const total = filtered.length;
    const rows = filtered.slice(offset, offset + pageSize).map((p) => ({
      id: p.id,
      amount: p.amount,
      payment_method: p.method,
      date: p.date,
      reference: p.reference,
    }));

    return { payments: rows, total, page, pageSize, totalPages: Math.ceil(total / pageSize) || 1 };
  },

  async getPaymentById(paymentId, customerId) {
    const payment = await getOneById('customer_payments', paymentId);
    if (!payment) return null;
    const paymentCustomerId = payment.customerId || payment.customer_id || null;
    if (customerId && String(paymentCustomerId) !== String(customerId)) return null;

    const inlineAllocations = Array.isArray(payment.allocations) ? payment.allocations : [];
    const validAllocations = inlineAllocations.filter((alloc) => {
      const invoiceId = alloc.invoice_id || alloc.invoiceId || '';
      const amount = Number(alloc.allocated ?? alloc.amount ?? 0);
      return invoiceId && amount > 0;
    });

    const invoiceIds = [...new Set(validAllocations.map((a) => a.invoice_id || a.invoiceId))];
    const invoiceMap = new Map();
    if (invoiceIds.length > 0) {
      // Customer-scoped enrichment: fetch ONLY invoices that belong to the
      // authenticated customer. A malicious or malformed allocation that
      // references another customer's invoice resolves to a missing invoice —
      // its number/amount/metadata are never exposed.
      const invoices = await getAllFrom('invoices', {
        id: `in.(${invoiceIds.join(',')})`,
        ...customerFilter('invoices', customerId),
      });
      for (const inv of invoices) {
        invoiceMap.set(inv.id, inv);
      }
    }

    payment.allocations = validAllocations.map((alloc) => {
      const invoiceId = alloc.invoice_id || alloc.invoiceId || '';
      const amount = Number(alloc.allocated ?? alloc.amount ?? 0);
      const invoice = invoiceMap.get(invoiceId) || null;
      return {
        allocation_id: alloc.allocation_id || alloc.allocationId || null,
        invoice_id: invoiceId,
        invoice_number: invoice ? (invoice.invoice_number || invoice.invoiceNumber || invoiceId) : null,
        // Unknown financial data must not be fabricated as zero: a missing or
        // unauthorized invoice has NO known total, so it is null, and the
        // frontend can distinguish "total = 0" from "invoice could not be found".
        total_amount: invoice ? Number(invoice.total_amount ?? invoice.totalAmount ?? 0) : null,
        amount,
        missing_invoice: !invoice,
      };
    });
    return payment;
  },

  async getStatements(customerId, startDate, endDate) {
    const [customer, ledger] = await Promise.all([
      getOneById('customers', customerId),
      customerLedger.buildLedger(customerId),
    ]);

    // Deterministic windowing over the authoritative ledger. Bounds are real
    // timestamps (date-only end bounds include the whole day); transactions
    // before the start fold into the opening balance.
    const hasStart = Boolean(startDate);
    const hasEnd = Boolean(endDate);
    const startT = hasStart ? customerLedger.parseTime(startDate) : null;
    let endT = hasEnd ? customerLedger.parseTime(endDate) : null;
    if (endT != null && Number.isFinite(endT) && String(endDate).length <= 10) {
      endT += 24 * 60 * 60 * 1000 - 1; // inclusive date-only end
    }

    let openingBalance = ledger.openingBalance;
    const mapped = [];
    for (const t of ledger.transactions) {
      const ts = customerLedger.parseTime(t.date);
      const effectiveTs = Number.isFinite(ts) ? ts : 0;
      if (startT != null && Number.isFinite(startT) && effectiveTs < startT) {
        openingBalance = customerLedger.round2(openingBalance + t.debit - t.credit);
        continue;
      }
      if (endT != null && Number.isFinite(endT) && effectiveTs > endT) continue;
      mapped.push({
        date: t.date,
        description: t.description || '',
        type: t.type,
        debit: t.debit,
        credit: t.credit,
        balance: t.balance,
      });
    }

    return {
      opening_balance: openingBalance,
      closing_balance: mapped.length > 0 ? mapped[mapped.length - 1].balance : openingBalance,
      outstanding_balance: ledger.outstandingBalance,
      credit_limit: (customer && customer.creditLimit != null) ? customer.creditLimit : 0,
      transactions: mapped,
    };
  },

  /**
   * Map a raw payment record (from getPaymentById) into the PrimeDocument
   * RECEIPT data contract. This is a pure mapping — no DB writes.
   */
  mapPaymentToReceiptData(payment, customer) {
    const allocations = payment.allocations || [];
    const validAllocations = allocations.filter((a) => a && a.invoice_id && Number(a.amount || 0) > 0);
    const appliedInvoices = validAllocations.map((a) => a.invoice_number || a.invoice_id);
    const appliedOrders = validAllocations.map((a) => a.order_number || a.order_id).filter(Boolean);
    const invoiceTotal = validAllocations.reduce((sum, a) => (
      a.missing_invoice ? sum : sum + Number(a.total_amount || 0)
    ), 0);
    const totalAllocated = validAllocations.reduce((sum, a) => sum + Number(a.amount || 0), 0);
    const amountReceived = Number(payment.amount || 0);

    let paymentStatus = 'PAID';
    if (totalAllocated < amountReceived) paymentStatus = 'OVERPAID';
    else if (totalAllocated < invoiceTotal) paymentStatus = 'PARTIALLY PAID';

    return {
      receiptNumber: payment.reference || payment.id?.slice(0, 8) || 'N/A',
      date: payment.date ? new Date(payment.date).toLocaleDateString() : new Date().toLocaleDateString(),
      customerName: customer?.name || payment.customerName || payment.customer_name || 'Customer',
      amountReceived,
      amountApplied: totalAllocated,
      changeGiven: 0,
      walletDeposit: 0,
      paymentMethod: payment.method || payment.payment_method || 'Unknown',
      appliedInvoices,
      appliedOrders,
      invoiceTotal,
      paymentStatus,
      balanceDue: Math.max(0, invoiceTotal - totalAllocated),
      overpaymentAmount: Math.max(0, amountReceived - totalAllocated),
      narrative: `Payment of ${amountReceived} received via ${payment.method || payment.payment_method || 'N/A'}. ${validAllocations.length} invoice(s) allocated.`,
      currentBalance: Math.max(0, invoiceTotal - totalAllocated),
      calculationVersion: 1,
    };
  },

  /**
   * Build the PrimeDocument ACCOUNT_STATEMENT data contract from the
   * authoritative ledger. Pure mapping — no DB writes.
   */
  buildStatementData(customerId, customer, statementsData) {
    const transactions = (statementsData.transactions || []).map((t) => ({
      date: t.date,
      reference: t.description || '',
      memo: '',
      debit: Number(t.debit || 0),
      credit: Number(t.credit || 0),
      runningBalance: Number(t.balance || 0),
    }));

    const totalInvoiced = transactions.reduce((sum, t) => sum + t.debit, 0);
    const totalReceived = transactions.reduce((sum, t) => sum + t.credit, 0);

    return {
      date: new Date().toLocaleDateString(),
      customerName: customer?.name || 'Customer',
      startDate: statementsData.startDate || 'N/A',
      endDate: statementsData.endDate || 'N/A',
      currency: 'K',
      openingBalance: Number(statementsData.opening_balance || 0),
      transactions,
      totalInvoiced,
      totalReceived,
      finalBalance: Number(statementsData.closing_balance || 0),
    };
  },

  async getLoyalty(customerId) {
    const [points, cashback, pointsHistory, tier] = await Promise.all([
      getOneById('engagement_point_balances', customerId),
      getAllFrom('engagement_cashback', customerFilter('engagement_cashback', customerId)),
      getAllFrom('engagement_points', customerFilter('engagement_points', customerId)),
      getOneById('engagement_customer_tiers', customerId),
    ]);

    const totalCashback = (cashback || []).reduce((sum, c) => sum + Number(c.amount || 0), 0);

    return {
      points: (points && points.balance) || 0,
      cashback: totalCashback,
      tier: (tier && tier.tier_name) || 'Standard',
      pointsHistory: pointsHistory || []
    };
  },

  async getWallet(customerId) {
    // Strict reads: a query failure propagates to a visible error state.
    // A genuine zero balance / empty transaction list remains valid — it is
    // only returned when the queries themselves succeed.
    const customer = await getOneById('customers', customerId);
    if (!customer) {
      throw new Error('Customer record not found for authenticated portal user');
    }
    const rewards = await getAllFrom('referral_rewards', withCustomerScope('referral_rewards', customerId, { 'data->>status': 'eq.approved' }));
    const cashback = await getAllFrom('engagement_cashback', withCustomerScope('engagement_cashback', customerId, { 'data->>status': 'eq.approved' }));
    const walletPayments = await getAllFrom('customer_payments', customerFilter('customer_payments', customerId));

    const transactions = [
      ...(rewards || []).map((r) => ({ date: r.approved_at, amount: Number(r.amount) || 0, type: 'credit', reference: 'Referral reward' })),
      ...(cashback || []).map((c) => ({ date: c.approved_at, amount: Number(c.amount) || 0, type: 'credit', reference: 'Cashback' })),
      ...(walletPayments || []).filter((p) => String(p.method || '').toLowerCase() === 'wallet' && String(p.status || '').toLowerCase() !== 'voided')
        .map((p) => ({ date: p.date, amount: -(Number(p.amount) || 0), type: 'debit', reference: p.reference || 'Wallet payment' })),
    ].sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime());

    return {
      walletBalance: (customer && customer.walletBalance != null) ? customer.walletBalance : 0,
      transactions
    };
  },

  async getProfile(customerId) {
    const cloud = await getOneById('customers', customerId);
    if (!cloud) return null;
    // [LEDGER] Derive balance from the authoritative ledger instead of the
    // deprecated stored cache field.
    const ledger = await customerLedger.buildLedger(customerId);
    return {
      id: cloud.id,
      full_name: cloud.name || '',
      email: cloud.email || '',
      phone: cloud.phone || '',
      address: cloud.address || '',
      city: cloud.city || '',
      state: cloud.state || '',
      zip: cloud.zip || '',
      country: cloud.country || '',
      balance: ledger.closingBalance,
      walletBalance: Number(cloud.walletBalance) || 0,
      creditLimit: Number(cloud.creditLimit) || 0,
      outstandingBalance: ledger.outstandingBalance,
      status: cloud.status || '',
      created_at: cloud.created_at || null
    };
  },

  async getDocuments(customerId) {
    const invoices = await getAllFrom('invoices', customerFilter('invoices', customerId));
    return invoices.map((inv) => ({
      id: inv.id,
      type: inv.status && /paid|fulfilled/i.test(String(inv.status || '')) ? 'receipt' : 'invoice',
      title: `${inv.invoice_number || inv.id} (${inv.status || 'Draft'})`,
      date: inv.created_at,
      url: `#/portal/invoices/${inv.id}`,
      amount: inv.total_amount,
    }));
  },

  async getNotifications(portalUserId) {
    // portal_notifications is written by the backend shim (portalLifecycleService
    // notifyCustomer) with `portal_user_id` — never `portalUserId`.
    return getAllFrom('portal_notifications', { 'portal_user_id': `eq.${portalUserId}` });
  },

  async getUnreadNotificationCount(portalUserId) {
    const rows = await getAllFrom('portal_notifications', { 'portal_user_id': `eq.${portalUserId}` });
    return rows.filter((n) => n.is_read !== true).length;
  },

  async markNotificationRead(notificationId, portalUserId) {
    const row = await getOneById('portal_notifications', notificationId);
    if (row && String(row.portal_user_id || '') === String(portalUserId)) {
      await repo.upsert('portal_notifications', { ...row, is_read: true });
    }
  },

  async markAllNotificationsRead(portalUserId) {
    const rows = await getAllFrom('portal_notifications', { 'portal_user_id': `eq.${portalUserId}` });
    await Promise.all((Array.isArray(rows) ? rows : []).filter((row) => row.is_read !== true).map((row) =>
      repo.upsert('portal_notifications', { ...row, is_read: true })
    ));
  },

  // ─── Referrals ──────────────────────────────────────────────────
  async getReferrals(portalUserId, customerId, { page = 1, pageSize = 20, status, search, sort = 'date_desc' } = {}) {
    const offset = (page - 1) * pageSize;
    const filters = { 'data->>referred_by_id': `eq.${customerId}` };
    if (status) filters['data->>status'] = `eq.${status}`;

    const allRows = await getAllFrom('customer_referrals', filters);
    let filtered = (Array.isArray(allRows) ? allRows : []).filter((r) => !r.deleted_at);
    if (search) {
      const q = String(search).toLowerCase();
      filtered = filtered.filter((r) => String(r.customer_name || r.customer_id || '').toLowerCase().includes(q));
    }
    const allowedSorts = {
      date_desc: (a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')),
      date_asc: (a, b) => String(a.created_at || '').localeCompare(String(b.created_at || '')),
      status: (a, b) => String(a.status || '').localeCompare(String(b.status || '')),
    };
    filtered.sort(allowedSorts[sort] || allowedSorts.date_desc);
    const total = filtered.length;
    const rows = filtered.slice(offset, offset + pageSize);

    return {
      referrals: rows.map(r => ({
        id: r.id,
        referredCustomerId: r.customer_id,
        referredCustomerName: r.customer_id,
        referredCustomerEmail: null,
        status: r.status,
        pendingInvoiceId: r.pending_invoice_id,
        pendingInvoiceAmount: r.pending_invoice_amount || 0,
        convertedInvoiceId: r.converted_invoice_id,
        convertedAt: r.converted_at,
        notes: r.notes,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      })),
      total, page, pageSize, totalPages: Math.ceil(total / pageSize) || 1,
    };
  },

  async getReferralById(id, portalUserId, customerId) {
    const referral = await getOneById('customer_referrals', id);
    if (!referral) return null;
    if (String(referral.referred_by_id || '') !== String(customerId)) return null;
    return {
      id: referral.id,
      referredCustomerId: referral.customer_id,
      referredCustomerName: referral.referred_customer_name || referral.customer_id,
      referredCustomerEmail: referral.referred_customer_email || null,
      status: referral.status,
      pendingInvoiceId: referral.pending_invoice_id,
      pendingInvoiceAmount: referral.pending_invoice_amount || 0,
      convertedInvoiceId: referral.converted_invoice_id,
      convertedAt: referral.converted_at,
      notes: referral.notes,
      createdAt: referral.created_at,
      updatedAt: referral.updated_at,
    };
  },

  async getReferralTimeline(referralId, customerId) {
    // Ownership gate: the referral must belong to the authenticated customer.
    // `:req.params.id` alone is never proof of ownership.
    const referral = await getOneById('customer_referrals', referralId);
    if (!referral) return null;
    if (String(referral.referred_by_id || '') !== String(customerId)) return null;
    return getAllFrom('referral_timeline', { 'data->>referral_id': `eq.${referralId}` });
  },

  async getReferralRewards(portalUserId, customerId, { page = 1, pageSize = 20, status } = {}) {
    const offset = (page - 1) * pageSize;
    const filters = { 'data->>customer_id': `eq.${customerId}` };
    if (status) filters['data->>status'] = `eq.${status}`;

    const allRows = await getAllFrom('referral_rewards', filters);
    let filtered = Array.isArray(allRows) ? allRows : [];
    filtered.sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
    const total = filtered.length;
    const rows = filtered.slice(offset, offset + pageSize);

    return {
      rewards: rows.map(r => ({
        id: r.id,
        referralId: r.referral_id,
        referralCode: null,
        referredCustomerId: null,
        referredCustomerName: null,
        invoiceId: r.invoice_id,
        invoiceAmount: r.invoice_amount || 0,
        amount: r.amount || 0,
        status: r.status,
        approvedAt: r.approved_at,
        cancelledAt: r.cancelled_at,
        cancelReason: r.cancel_reason,
        walletTransactionId: r.wallet_transaction_id,
        createdAt: r.created_at,
      })),
      total, page, pageSize, totalPages: Math.ceil(total / pageSize) || 1,
    };
  },

  async getReferralSettings() {
    const settings = await referralService.getSettings();
    return {
      enabled: settings.enabled ?? true,
      rewardType: settings.rewardType || 'percentage',
      rewardValue: settings.rewardValue || 0,
      rewardPercentage: settings.rewardPercentage || 0,
      minimumPurchase: settings.minPurchaseAmount || 0,
      maxRewardAmount: settings.maxRewardAmount || 0,
      expiryDays: settings.expiryDays || 365,
      requireApproval: settings.requireApproval ?? true,
      shareMessage: 'Invite friends and earn rewards.',
    };
  },

  async createReferral(portalUserId, customerId, { referredCustomerId, notes }) {
    if (!referredCustomerId) {
      throw new Error('Referred customer is required');
    }
    if (referredCustomerId === customerId) {
      throw new Error('You cannot refer yourself');
    }

    const customer = await getOneById('customers', referredCustomerId);
    if (!customer) {
      throw new Error('Customer not found');
    }

    const existingRows = await getAllFrom('customer_referrals', {
      'data->>customer_id': `eq.${referredCustomerId}`,
      'data->>referred_by_id': `eq.${customerId}`,
    });
    const existing = (Array.isArray(existingRows) ? existingRows : []).find(
      (r) => !r.deleted_at && ['active', 'converted'].includes(String(r.status || ''))
    );
    if (existing) {
      throw new Error('This customer has already been referred by you');
    }

    return referralService.register(
      {
        customer_id: referredCustomerId,
        referred_by_id: customerId,
        referred_by_name: customer.name,
        notes: notes || null,
      });
  },

  async searchCustomersForReferral(query, excludeCustomerId) {
    if (!query || query.trim().length < 2) return [];
    const q = String(query).trim().toLowerCase();
    // Pre-filter at the database: only customers whose name OR email contains
    // the query are loaded (never the whole customer directory). The JS filter
    // below remains the authoritative matcher; this is a performance bound.
    const esc = (s) => s.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    const ilike = `*${esc(q)}*`;
    let results = [];
    try {
      results = await getAllFrom('customers', {
        or: `(data->>name.ilike."${ilike}",data->>email.ilike."${ilike}")`,
        'data->>id': `neq.${excludeCustomerId}`,
      });
    } catch (err) {
      console.warn('[PortalService] Referral customer ilike pre-filter failed, falling back:', err.message);
      results = await getAllFrom('customers', {
        'data->>id': `neq.${excludeCustomerId}`,
      });
    }
    return (Array.isArray(results) ? results : [])
      .filter((c) =>
        String(c.name || '').toLowerCase().includes(q) ||
        String(c.email || '').toLowerCase().includes(q)
      )
      .slice(0, 20)
      .map((c) => ({ id: c.id, name: c.name, email: c.email }));
  },

  async getReferralFunnelStats(customerId) {
    const allReferrals = await getAllFrom('customer_referrals', { 'data->>referred_by_id': `eq.${customerId}` });
    const referrals = Array.isArray(allReferrals) ? allReferrals.filter((r) => !r.deleted_at) : [];
    const referralIds = referrals.map((r) => r.id);

    let myRewards = [];
    if (referralIds.length > 0) {
      const allRewards = await getAllFrom('referral_rewards', { 'data->>customer_id': `eq.${customerId}` });
      myRewards = Array.isArray(allRewards) ? allRewards : [];
    }

    const total = referrals.length;
    const signedUp = referrals.filter((r) => String(r.status || '') === 'active').length;
    const qualified = referrals.filter((r) => String(r.status || '') === 'active' && r.pending_invoice_id).length;
    const rewardApproved = myRewards.filter((r) => ['approved', 'paid'].includes(String(r.status || ''))).length;
    const paid = myRewards.filter((r) => String(r.status || '') === 'paid').length;
    const pendingRewardAmount = myRewards.filter((r) => String(r.status || '') === 'pending').reduce((s, r) => s + Number(r.amount || 0), 0);
    const totalEarned = myRewards.filter((r) => ['approved', 'paid'].includes(String(r.status || ''))).reduce((s, r) => s + Number(r.amount || 0), 0);

    return {
      total,
      signedUp,
      qualified,
      rewardApproved,
      paid,
      pendingRewardAmount,
      totalEarned,
      conversionRate: total > 0 ? Math.round((paid / total) * 100) : 0,
    };
  },

  async getSupportTickets(portalUserId, customerId) {
    const filters = {
      'portal_user_id': `eq.${portalUserId}`,
      'customer_id': `eq.${customerId}`,
    };
    const rows = await getAllFrom('portal_tickets', filters);
    return Array.isArray(rows) ? rows.sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || ''))) : [];
  },

  async createSupportTicket(portalUserId, customerId, { subject, message, priority }) {
    const id = genId('ptkt');
    await repo.upsert('portal_tickets', {
      id,
      portal_user_id: portalUserId,
      customer_id: customerId,
      subject,
      message,
      priority: priority || 'normal',
    });

    const msgId = genId('pmsg');
    await repo.upsert('portal_ticket_messages', {
      id: msgId,
      ticket_id: id,
      sender_type: 'customer',
      message,
    });

    return { id, subject, message, priority: priority || 'normal' };
  },

  async addTicketMessage(ticketId, portalUserId, customerId, message) {
    // Ownership gate BEFORE any write: the ticket must belong to the
    // authenticated portal user AND customer, or the request is rejected.
    const ticket = await getOneById('portal_tickets', ticketId);
    if (!ticket ||
        String(ticket.portal_user_id || '') !== String(portalUserId) ||
        String(ticket.customer_id || '') !== String(customerId)) {
      throw new Error('Ticket not found or access denied');
    }

    const id = genId('pmsg');
    await repo.upsert('portal_ticket_messages', {
      id,
      ticket_id: ticketId,
      sender_type: 'customer',
      message,
    });

    await repo.upsert('portal_tickets', { ...ticket, updated_at: new Date().toISOString() });

    return { id, ticket_id: ticketId, message };
  },

  async updateTicketStatus(ticketId, portalUserId, customerId, status) {
    const ticket = await getOneById('portal_tickets', ticketId);
    if (!ticket ||
        String(ticket.portal_user_id || '') !== String(portalUserId) ||
        String(ticket.customer_id || '') !== String(customerId)) {
      throw new Error('Ticket not found or access denied');
    }
    await repo.upsert('portal_tickets', { ...ticket, status, updated_at: new Date().toISOString() });
    return { success: true, ticketId, status };
  },

  async uploadTicketAttachment(ticketId, portalUserId, customerId, file, messageId) {
    const ticket = await getOneById('portal_tickets', ticketId);
    if (!ticket ||
        String(ticket.portal_user_id || '') !== String(portalUserId) ||
        String(ticket.customer_id || '') !== String(customerId)) {
      throw new Error('Ticket not found or access denied');
    }

    const id = genId('tatt');
    const storagePath = file.filename;
    await repo.upsert('ticket_attachments', {
      id,
      ticket_id: ticketId,
      message_id: messageId || null,
      filename: storagePath,
      original_name: file.originalname,
      mime_type: file.mimetype,
      size_bytes: file.size,
      storage_path: storagePath,
      uploaded_by: portalUserId,
    });

    return {
      id,
      ticket_id: ticketId,
      message_id: messageId || null,
      filename: storagePath,
      original_name: file.originalname,
      mime_type: file.mimetype,
      size_bytes: file.size,
      uploaded_by: portalUserId,
      created_at: new Date().toISOString(),
    };
  },

  async getTicketAttachment(attachmentId, customerId) {
    const attachment = await getOneById('ticket_attachments', attachmentId);
    if (!attachment) return null;
    const ticket = await getOneById('portal_tickets', attachment.ticket_id);
    if (!ticket || String(ticket.customer_id || '') !== String(customerId)) return null;
    return attachment;
  },

  async deleteTicketAttachment(attachmentId, portalUserId, customerId) {
    const attachment = await getOneById('ticket_attachments', attachmentId);
    if (!attachment) {
      throw new Error('Attachment not found or access denied');
    }
    const ticket = await getOneById('portal_tickets', attachment.ticket_id);
    if (!ticket || String(ticket.customer_id || '') !== String(customerId)) {
      throw new Error('Attachment not found or access denied');
    }

    // Delete the file from disk
    const filePath = path.join(TICKET_ATTACHMENTS_DIR, attachment.filename);
    try {
      await fs.promises.unlink(filePath);
    } catch (err) {
      if (err.code !== 'ENOENT') {
        console.error('[Portal] Error deleting attachment file:', err.message);
      }
    }

    // Delete the database record
    await repo.softDelete('ticket_attachments', attachmentId);

    return { success: true, attachmentId };
  },

  async getShipments(customerId, { status, search } = {}) {
    const [salesOrders, deliveryNotes, shipments] = await Promise.all([
      scopedRows('sales_orders', customerId),
      scopedRows('delivery_notes', customerId),
      scopedRows('shipments', customerId),
    ]);

    const results = [];
    // Shipments are the authoritative live-delivery documents: they carry
    // tracking, driver, vehicle and ETA and are pushed first. Delivery notes
    // then follow with their LIVE status from Inbound ("Warehouse Dispatched")
    // through POD-sealed delivery; a linked sales order (whose status is NOT
    // updated at dispatch) is suppressed so the portal list and timeline
    // reflect the real delivery stage.
    for (const sh of (Array.isArray(shipments) ? shipments : [])) {
      if (results.some((r) => r.id === sh.id || r.id === sh.orderId || r.id === sh.order_id)) continue;
      results.push({ ...sh, _source: 'shipments' });
    }
    for (const dn of (Array.isArray(deliveryNotes) ? deliveryNotes : [])) {
      if (results.some((r) => r.id === dn.id || r.id === dn.order_id || r.id === dn.orderId)) continue;
      results.push({ ...dn, _source: 'delivery_notes' });
    }
    for (const so of (Array.isArray(salesOrders) ? salesOrders : [])) {
      // Sales orders only surface once they have entered the dispatch pipeline
      // AND no linked shipment/delivery note already represents this delivery.
      if (!so.tracking_number && !so.trackingNumber) continue;
      if (results.some((r) => r.id === so.id || String(r.order_id || r.orderId || '') === String(so.id))) continue;
      results.push({ ...so, _source: 'sales_orders' });
    }

    let filtered = results;
    if (status) {
      const lower = String(status).toLowerCase();
      filtered = filtered.filter((r) => String(r.status || r.order_status || '').toLowerCase() === lower);
    }
    if (search) {
      const q = String(search).toLowerCase();
      filtered = filtered.filter((r) =>
        String(r.order_number || r.orderNumber || '').toLowerCase().includes(q) ||
        String(r.tracking_number || r.trackingNumber || '').toLowerCase().includes(q) ||
        String(r.customerName || r.customer_name || '').toLowerCase().includes(q)
      );
    }
    filtered.sort((a, b) => String(b.orderDate || b.date || b.created_at || '').localeCompare(String(a.orderDate || a.date || a.created_at || '')));
    return filtered;
  },

  async getShipmentById(shipmentId, customerId) {
    const sh = await getOneById('shipments', shipmentId);
    if (sh) {
      const shCustomerId = sh.customerId || sh.customer_id || null;
      if (String(shCustomerId) !== String(customerId)) return null;
      if (!sh.trackingNumber && !sh.tracking_number) return null;
      return { ...sh, _source: 'shipments' };
    }
    const row = await getOneById('sales_orders', shipmentId);
    if (row) {
      const rowCustomerId = row.customerId || row.customer_id || null;
      if (String(rowCustomerId) !== String(customerId)) return null;
      if (!row.tracking_number && !row.trackingNumber) return null;
      return { ...row, _source: 'sales_orders' };
    }
    const dn = await getOneById('delivery_notes', shipmentId);
    if (dn) {
      const dnCustomerId = dn.customerId || dn.customer_id || null;
      if (String(dnCustomerId) !== String(customerId)) return null;
      if (!dn.tracking_number && !dn.trackingNumber) return null;
      return { ...dn, _source: 'delivery_notes' };
    }
    return null;
  },

  // Resolve the delivery note behind a delivery/shipment id, strictly scoped
  // to the requesting customer. The portal renders the note from this record
  // (Download Delivery Note) so a customer can only ever retrieve their own.
  async getDeliveryNoteForDelivery(deliveryId, customerId) {
    const belongs = (dn) => {
      const dnCustomerId = dn.customerId || dn.customer_id || null;
      return dn && String(dnCustomerId) === String(customerId);
    };

    // Direct hit — the id IS a delivery note.
    try {
      const direct = await repo.getById('delivery_notes', deliveryId);
      if (direct && belongs(direct)) return direct;
    } catch (err) {
      console.warn('[PortalService] Delivery note direct lookup failed:', err?.message || err);
    }

    // Otherwise the id is a sales order; locate its linked delivery note.
    const notes = await scopedRows('delivery_notes', customerId);
    const note = notes.find(
      (dn) => String(dn.order_id || dn.orderId || '') === String(deliveryId)
    );
    return note && belongs(note) ? note : null;
  },

  // Customer-facing delivery status banners for the portal carousel (sliding
  // like the ads). A banner appears from the moment a delivery is pushed to
  // Inbound ("out of the warehouse") and its message follows every status
  // change: Inbound → out of warehouse, Active → out for delivery,
  // Delivered → delivered (POD sealed). Strictly scoped to the customer.
  async getDeliveryBanners(customerId) {
    const [notes, shipments, invoices] = await Promise.all([
      scopedRows('delivery_notes', customerId),
      scopedRows('shipments', customerId),
      scopedRows('invoices', customerId),
    ]);

      const invoiceById = new Map();
      for (const inv of invoices) invoiceById.set(String(inv.id), inv);
      const notesById = new Map();
      for (const n of notes) notesById.set(String(n.id), n);

      const banners = [];
      const invoiceNumberFor = (inv) =>
        inv ? (inv.invoice_number || inv.invoiceNumber || null) : null;

      // Inbound: delivery note created, goods leaving the warehouse. Only
      // genuinely-pending notes without a linked shipment qualify — once a
      // shipment exists it is the authoritative source for the active/delivered
      // stage, so emitting both would show two contradictory banners.
      for (const dn of notes) {
        const status = String(dn.status || 'pending');
        if (/delivered|cancelled|void/i.test(status)) continue;
        if (shipments.some((s) => String(s.orderId || '') === String(dn.id))) continue;
        const invoiceId = dn.invoiceId || dn.invoice_id || null;
        banners.push({
          id: `dn-${dn.id}`,
          stage: 'inbound',
          status,
          orderNumber: dn.orderNumber || dn.order_number || dn.orderId || dn.order_id || null,
          invoiceNumber: invoiceNumberFor(invoiceId ? invoiceById.get(String(invoiceId)) : null)
            || dn.invoiceNumber || dn.invoice_number || null,
          trackingNumber: dn.trackingNumber || dn.tracking_number || null,
          updatedAt: dn.updated_at || dn.updatedAt || dn.date || null,
        });
      }

      // Active / Delivered: dispatched shipments (out for delivery → delivered).
      for (const shp of shipments) {
        const status = String(shp.status || '');
        if (/cancelled|void/i.test(status)) continue;
        const delivered = /delivered|fulfilled/i.test(status);
        const note = shp.orderId ? notesById.get(String(shp.orderId)) : null;
        const invoiceId = (note && (note.invoiceId || note.invoice_id)) || shp.invoiceId || shp.invoice_id || null;
        banners.push({
          id: `shp-${shp.id}`,
          stage: delivered ? 'delivered' : 'active',
          status,
          orderNumber: shp.orderNumber || shp.order_number || shp.orderId || null,
          invoiceNumber: invoiceNumberFor(invoiceId ? invoiceById.get(String(invoiceId)) : null)
            || (note && (note.invoiceNumber || note.invoice_number)) || shp.invoiceNumber || shp.invoice_number || null,
          trackingNumber: shp.trackingNumber || shp.tracking_number
            || (note && (note.trackingNumber || note.tracking_number)) || null,
          updatedAt: shp.updated_at || shp.updatedAt || shp.date || null,
        });
      }

      // Newest activity first so the carousel leads with the freshest update.
      banners.sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));
      return banners;
  },

  // Today's in-flight deliveries for the customer. Fronts the Logistics Command
  // "Active" tab: shipments that are dispatched (not Delivered/Cancelled) and
  // scheduled to arrive today. Each entry includes its line items and the
  // linked invoice so the portal banner can offer "Seal Proof of Delivery"-
  // aware detail. As soon as POD is sealed (status -> Delivered) the shipment
  // drops out of the list and the banner disappears.
  async getTodayPendingDeliveries(customerId) {
    // Strict reads: a query failure propagates to the route error state and is
    // NEVER returned as "no pending deliveries". A legitimate empty result
    // (successful queries, zero rows) still returns [].
    const [shipments, notes, invoices] = await Promise.all([
      getAllFrom('shipments', customerFilter('shipments', customerId)),
      getAllFrom('delivery_notes', customerFilter('delivery_notes', customerId)),
      getAllFrom('invoices', customerFilter('invoices', customerId)),
    ]);

      const now = new Date();
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const end = new Date(start);
      end.setDate(end.getDate() + 1);
      const isToday = (value) => {
        if (!value) return false;
        const d = new Date(value);
        return !Number.isNaN(d.getTime()) && d >= start && d < end;
      };

      const notesById = new Map((notes || []).map((n) => [n.id, n]));
      const invoiceById = new Map((invoices || []).map((i) => [i.id, i]));
      const parseItems = (value) => {
        if (Array.isArray(value)) return value;
        if (typeof value === 'string') return parseJson(value, []);
        return [];
      };

      const result = [];
      for (const shp of shipments || []) {
        if (/delivered|cancelled/i.test(String(shp.status || ''))) continue;

        const note = shp.orderId ? notesById.get(String(shp.orderId)) : null;
        const deliveryDate =
          shp.estimated_delivery ||
          shp.estimatedDelivery ||
          (note && (note.estimated_delivery || note.estimatedDelivery || note.delivery_date || note.deliveryDate)) ||
          shp.date ||
          null;
        if (!isToday(deliveryDate)) continue;

        const invoiceId = note && (note.invoiceId || note.invoice_id)
          ? String(note.invoiceId || note.invoice_id)
          : (shp.invoiceId || shp.invoice_id || null);
        const invoice = invoiceId ? invoiceById.get(invoiceId) : null;

        result.push({
          shipmentId: shp.id,
          orderId: shp.orderId || null,
          status: shp.status,
          deliveryDate: deliveryDate || null,
          trackingNumber:
            shp.tracking_number || shp.trackingNumber || (note && (note.tracking_number || note.trackingNumber)) || null,
          carrier: shp.carrier || (note && note.carrier) || null,
          driverName: shp.driver_name || shp.driverName || (note && (note.driver_name || note.driverName)) || null,
          vehicleNo: shp.vehicle_no || shp.vehicleNo || (note && (note.vehicle_no || note.vehicleNo)) || null,
          items: shp.items && shp.items.length
            ? shp.items
            : parseItems(note && (note.items || note.items_json)),
          notes: (note && note.notes) || shp.notes || null,
          invoiceId,
          invoiceNumber: (invoice && (invoice.invoice_number || invoice.invoiceNumber)) || null,
          invoiceStatus: (invoice && invoice.status) || null,
          // Unknown financial data must not be fabricated as zero: when no
          // invoice row is linked, the amount is null, not 0.
          invoiceAmount: invoice ? Number(invoice.total_amount ?? invoice.totalAmount ?? 0) : null,
        });
      }

      return result;
  },

};

module.exports = portalService;
