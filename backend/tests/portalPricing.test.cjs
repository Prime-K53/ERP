/**
 * F3 — Portal pricing source-of-truth tests (hermetic).
 *
 * Verifies that ERP-authoritative pricing for portal order/quotation requests
 * resolves from the cloud `products` catalog (the same source the portal
 * catalog is served from — see portalService.getCatalog) and NEVER from the
 * placeholder cloud `inventory` table, and never from browser-submitted prices.
 *
 * Covers:
 *   1. real product  -> actual ERP master price from `products`
 *   2. unknown product -> price 0 + 'unknown_product' flag (ERP validation)
 *   3. promotion     -> passes through the ERP promotion engine
 *   4. quantity      -> correctly scales the ERP-calculated subtotal/total
 *   5. customer ownership -> pricing stays scoped to the requesting customer
 *   6. accounting firewall -> request creation touches NO accounting tables
 *   (idempotency + cross-customer isolation are covered by
 *    tests/portalRequestIdempotency.test.cjs)
 */

process.env.JWT_SECRET = 'test-jwt-secret';

const PRODUCTS = [
  {
    id: 'prod-a4-env',
    data: { id: 'prod-a4-env', name: 'A4 Envelope', sellingPrice: 500, costPrice: 300, type: 'Stationery', status: 'Active' },
  },
  {
    id: 'prod-a4-hard',
    data: { id: 'prod-a4-hard', name: 'A4 Hardcover', sellingPrice: 6500, cost_price: 4000, type: 'Stationery', status: 'Active' },
  },
  {
    id: 'prod-deleted',
    data: { id: 'prod-deleted', name: 'Discontinued Pad', sellingPrice: 900, costPrice: 600, type: 'Stationery', status: 'deleted' },
  },
];

const INVENTORY_PLACEHOLDERS = [
  { id: 'INV-PAPER', data: { id: 'INV-PAPER', name: 'Paper', material: 'Paper', quantity: 5000, cost_per_unit: 35 } },
];

const store = {
  products: new Map(PRODUCTS.map((p) => [p.id, { id: p.id, ...p.data }])),
  inventory: new Map(INVENTORY_PLACEHOLDERS.map((p) => [p.id, p.data])),
  customers: new Map([
    ['cust_a', { id: 'cust_a', name: 'Customer A', companyId: 'company_a', createdAt: '2026-01-01T00:00:00Z' }],
    ['cust_b', { id: 'cust_b', name: 'Customer B', companyId: 'company_b', createdAt: '2026-01-01T00:00:00Z' }],
  ]),
};

const upsertedTables = [];
function recordUpsert(table, record) {
  upsertedTables.push(table);
  store[table] = store[table] || new Map();
  // Mirror the real envelope contract: the domain object is stored verbatim
  // (cloudSyncStore wraps it into the `data` JSONB column; fromSupabaseRow
  // spreads it back). Flat records are preserved field-for-field.
  store[table].set(record.id, { ...(record.data || record), id: record.id });
}

jest.mock('../services/supabaseRepository.cjs', () => ({
  getAll: jest.fn(async (table, filters = {}) => {
    const rows = [...(store[table] || []).values()];
    if (filters && Object.keys(filters).length) {
      return rows.filter((r) => Object.entries(filters).every(([k, v]) => {
        const val = String((r.data || r)[k.replace(/^data->>/, '')] ?? '');
        return typeof v === 'string' && v.startsWith('eq.') ? val === v.slice(3) : true;
      }));
    }
    return rows;
  }),
  getById: jest.fn(async (table, id) => {
    const row = (store[table] || new Map()).get(id);
    return row ? { ...row } : null;
  }),
  upsert: jest.fn(async (table, record) => {
    recordUpsert(table, record);
    return { id: record.id };
  }),
  softDelete: jest.fn(async () => ({ changes: 1 })),
  __store: store,
  __upsertedTables: upsertedTables,
  __reset: () => {
    for (const key of Object.keys(store)) store[key] = new Map();
    upsertedTables.length = 0;
    PRODUCTS.forEach((p) => store.products.set(p.id, { id: p.id, ...p.data }));
    INVENTORY_PLACEHOLDERS.forEach((p) => store.inventory.set(p.id, p.data));
    store.customers.set('cust_a', { id: 'cust_a', name: 'Customer A', companyId: 'company_a', createdAt: '2026-01-01T00:00:00Z' });
    store.customers.set('cust_b', { id: 'cust_b', name: 'Customer B', companyId: 'company_b', createdAt: '2026-01-01T00:00:00Z' });
  },
}));

jest.mock('../services/promotionService.cjs', () => {
  const mocks = {
    getActivePromotions: jest.fn(async () => []),
    getUsageByPromotion: jest.fn(async () => ({})),
    getUsageByPromotionForCustomer: jest.fn(async () => ({})),
    recordRedemption: jest.fn(async () => ({})),
  };
  return mocks;
});

jest.mock('../services/workflowEngine.cjs', () => {
  let seq = 0;
  return {
    SALES_ORDER_STATUS: Object.freeze({ DRAFT: 'Draft', CONFIRMED: 'Confirmed', CANCELLED: 'Cancelled' }),
    nextYearScopedNumber: jest.fn(async () => {
      seq += 1;
      return `ODR-2026-${String(seq).padStart(6, '0')}`;
    }),
    requestNumberPrefix: jest.fn(() => 'ODR'),
  };
});

jest.mock('../auditService.cjs', () => ({
  auditService: { logEvent: jest.fn(async () => ({})) },
}));

const lifecycle = require('../services/portalLifecycleService.cjs');
const repo = require('../services/supabaseRepository.cjs');
const promotionService = require('../services/promotionService.cjs');

function activePromotion(overrides = {}) {
  return {
    id: 'promo_a',
    companyId: 'company_a',
    name: 'Portal 10%',
    code: 'PORTAL10',
    channel: 'PORTAL',
    discountType: 'percentage',
    discountValue: 10,
    status: 'active',
    isActive: true,
    isAutoApply: true,
    minimumOrderAmount: 0,
    maximumDiscountAmount: 0,
    usageLimit: 0,
    usageLimitPerCustomer: 0,
    applicableTo: 'all',
    productIds: [],
    categoryIds: [],
    customerScope: 'all',
    customerIds: [],
    tierIds: [],
    priority: 0,
    stackable: true,
    startsAt: null,
    endsAt: null,
    pausedAt: null,
    cancelledAt: null,
    usedCount: 0,
    ...overrides,
  };
}

describe('F3 — portal pricing resolves from the authoritative `products` catalog', () => {
  beforeEach(() => {
    repo.__reset();
    jest.clearAllMocks();
    promotionService.getActivePromotions.mockImplementation(async () => []);
    promotionService.getUsageByPromotion.mockImplementation(async () => ({}));
    promotionService.getUsageByPromotionForCustomer.mockImplementation(async () => ({}));
    promotionService.recordRedemption.mockImplementation(async () => ({}));
  });

  it('Test 1 — a real product receives its actual ERP price from `products` (browser price ignored)', async () => {
    const preview = await lifecycle.previewOrder({
      customerId: 'cust_a',
      items: [{ productId: 'prod-a4-env', name: 'A4 Envelope', quantity: 1, unitPrice: 1 }],
    });

    expect(repo.getAll).toHaveBeenCalledWith('products');
    expect(repo.getAll).not.toHaveBeenCalledWith('inventory');
    expect(preview.lines[0]).toEqual(expect.objectContaining({
      productId: 'prod-a4-env',
      unitPrice: 500,           // ERP master price, NOT browser's 1
      lineTotal: 500,
      priceSource: 'master',
    }));
    expect(preview.subtotal).toBe(500);
    expect(preview.grandTotal).toBe(500);
  });

  it('Test 2 — an unknown product is never silently priced at 0 from the browser; it is flagged', async () => {
    const preview = await lifecycle.previewOrder({
      customerId: 'cust_a',
      items: [{ productId: 'ghost-product', name: 'Not in Catalog', quantity: 2, unitPrice: 99999 }],
    });

    expect(preview.lines[0]).toEqual(expect.objectContaining({
      productId: 'ghost-product',
      unitPrice: 0,
      lineTotal: 0,
      priceSource: 'unknown_product',
    }));
    expect(preview.subtotal).toBe(0);
    expect(preview.grandTotal).toBe(0);
  });

  it('Test 3 — a valid promotion passes through the ERP promotion engine', async () => {
    promotionService.getActivePromotions.mockResolvedValue([activePromotion()]);

    const preview = await lifecycle.previewOrder({
      customerId: 'cust_a',
      items: [{ productId: 'prod-a4-hard', name: 'A4 Hardcover', quantity: 2, unitPrice: 1 }],
    });

    expect(promotionService.getActivePromotions).toHaveBeenCalledWith({ companyId: 'company_a', channel: 'PORTAL' });
    expect(preview.subtotal).toBe(13000);
    expect(preview.discountTotal).toBe(1300);
    expect(preview.subtotalAfterDiscount).toBe(11700);
    expect(preview.applied).toBe(true);
    expect(preview.promotion).toEqual(expect.objectContaining({ code: 'PORTAL10', discountType: 'percentage' }));
    expect(preview.lines[0].priceSource).toBe('master');
    expect(preview.lines[0].originalUnitPrice).toBe(6500);
  });

  it('Test 4 — quantity correctly scales the ERP-calculated subtotal and total', async () => {
    const preview = await lifecycle.previewOrder({
      customerId: 'cust_a',
      items: [{ productId: 'prod-a4-env', name: 'A4 Envelope', quantity: 3, unitPrice: 1 }],
    });

    expect(preview.lines[0].quantity).toBe(3);
    expect(preview.lines[0].lineTotal).toBe(1500);
    expect(preview.subtotal).toBe(1500);
    expect(preview.grandTotal).toBe(1500);
  });

  it('Test 5 — pricing remains customer-scoped (customer + company isolation)', async () => {
    promotionService.getActivePromotions.mockImplementation(async ({ companyId }) =>
      companyId === 'company_a' ? [activePromotion()] : []
    );

    const previewA = await lifecycle.previewOrder({
      customerId: 'cust_a',
      items: [{ productId: 'prod-a4-env', name: 'A4 Envelope', quantity: 1, unitPrice: 1 }],
    });
    expect(repo.getById).toHaveBeenCalledWith('customers', 'cust_a');
    expect(promotionService.getUsageByPromotionForCustomer).toHaveBeenCalledWith('cust_a', { companyId: 'company_a' });
    expect(previewA.applied).toBe(true);

    const previewB = await lifecycle.previewOrder({
      customerId: 'cust_b',
      items: [{ productId: 'prod-a4-env', name: 'A4 Envelope', quantity: 1, unitPrice: 1 }],
    });
    expect(promotionService.getActivePromotions).toHaveBeenCalledWith({ companyId: 'company_b', channel: 'PORTAL' });
    expect(previewB.applied).toBe(false);
    // Pricing itself stays identical for both customers — only promotions are company-scoped.
    expect(previewB.lines[0].unitPrice).toBe(500);
  });

  it('Test 6 — order request creation touches NO accounting tables', async () => {
    promotionService.getActivePromotions.mockResolvedValue([activePromotion()]);

    const result = await lifecycle.createQuotationRequest({
      portalUserId: 'pusr_a',
      customerId: 'cust_a',
      customerName: 'Customer A',
      requestType: 'order',
      items: [{ productId: 'prod-a4-env', name: 'A4 Envelope', quantity: 2, unitPrice: 1 }],
    });

    expect(result.requestNumber).toMatch(/^ODR-2026-/);
    expect(result.subtotal).toBe(1000);
    expect(result.discountTotal).toBe(100);
    expect(result.total).toBe(900);

    const written = new Set(repo.__upsertedTables);
    expect(written.has('quotation_requests')).toBe(true);
    expect(written.has('portal_timeline_events')).toBe(true);
    expect(written.has('admin_notifications')).toBe(true);
    for (const forbidden of [
      'invoices', 'sales', 'customer_payments', 'supplier_payments',
      'payment_allocations', 'ledger_entries', 'sales_orders', 'receipts', 'quotations',
    ]) {
      expect(written.has(forbidden)).toBe(false);
    }

    expect(promotionService.recordRedemption).toHaveBeenCalledWith(expect.objectContaining({
      promotionId: 'promo_a',
      customerId: 'cust_a',
      sourceType: 'request',
      discountAmount: 100,
      subtotalBefore: 1000,
      subtotalAfter: 900,
    }));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Pricing-evidence preservation: portal order → sales order → invoice.
//
// Regression guard for the Internal Pricing Breakdown defect: portal-converted
// invoices showed Material Cost K0.00 / Profit Markup = invoice total because
// the pricing evidence (material-cost snapshot) captured at request ingestion
// was stripped at every later boundary. These tests pin the evidence to the
// request, the official sales order, and prove the accounting firewall.
// ─────────────────────────────────────────────────────────────────────────────
describe('Portal order pricing evidence — capture, persistence, conversion', () => {
  const ADMIN = { id: 'adm_1', name: 'Sales', role: 'admin' };

  beforeEach(() => {
    repo.__reset();
    jest.clearAllMocks();
    promotionService.getActivePromotions.mockImplementation(async () => []);
    promotionService.getUsageByPromotion.mockImplementation(async () => ({}));
    promotionService.getUsageByPromotionForCustomer.mockImplementation(async () => ({}));
    promotionService.recordRedemption.mockImplementation(async () => ({}));
  });

  it('Test A — master-priced request lines capture material cost from the authoritative catalog; unknown lines get none', async () => {
    const result = await lifecycle.createQuotationRequest({
      portalUserId: 'pusr_a',
      customerId: 'cust_a',
      customerName: 'Customer A',
      requestType: 'order',
      items: [
        { productId: 'prod-a4-env', name: 'A4 Envelope', quantity: 2, unitPrice: 1 },
        { productId: 'ghost-product', name: 'Custom Line', quantity: 1, unitPrice: 123 },
      ],
    });

    const masterLine = result.items.find((l) => l.productId === 'prod-a4-env');
    expect(masterLine.pricingBreakdown).toEqual(expect.objectContaining({
      baseMaterialCost: 300,     // products.costPrice — NOT derived from any total
      costPrice: 300,
      sellingPrice: 500,         // ERP master price
      profitMarginAmount: 200,   // selling − cost per established policy
      adjustmentTotal: 0,
      roundingDifference: 0,
    }));

    // A line the catalog cannot resolve must never receive invented evidence.
    const unknownLine = result.items.find((l) => l.productId === 'ghost-product');
    expect(unknownLine.pricingBreakdown).toBeUndefined();
  });

  it('Test B — the persisted quotation_requests row retains the pricing evidence', async () => {
    const result = await lifecycle.createQuotationRequest({
      portalUserId: 'pusr_a',
      customerId: 'cust_a',
      customerName: 'Customer A',
      requestType: 'order',
      items: [{ productId: 'prod-a4-hard', name: 'A4 Hardcover', quantity: 1, unitPrice: 1 }],
    });

    const storedRow = store.quotation_requests.get(result.id);
    const storedItems = JSON.parse(storedRow.items);
    // cost_price alias chain (products.cost_price=4000) resolves like resolveStoredCost.
    expect(storedItems[0].pricingBreakdown).toEqual(expect.objectContaining({
      baseMaterialCost: 4000,
      costPrice: 4000,
      sellingPrice: 6500,
      profitMarginAmount: 2500,
    }));
  });

  it('Test C — order → invoice source data keeps the evidence and accounting totals are untouched', async () => {
    const created = await lifecycle.createQuotationRequest({
      portalUserId: 'pusr_a',
      customerId: 'cust_a',
      customerName: 'Customer A',
      requestType: 'order',
      items: [{ productId: 'prod-a4-env', name: 'A4 Envelope', quantity: 2, unitPrice: 1 }],
    });

    upsertedTables.length = 0;
    const so = await lifecycle.completeSalesOrder(created.id, { admin: ADMIN });

    const orderRow = store.sales_orders.get(so.id);
    expect(orderRow).toBeTruthy();

    const items = JSON.parse(orderRow.items);
    expect(items[0].pricingBreakdown).toEqual(expect.objectContaining({
      baseMaterialCost: 300,
      costPrice: 300,
      sellingPrice: 500,
      profitMarginAmount: 200,
    }));
    // Flat cost mirrors for every downstream invoice-conversion reader.
    expect(items[0].cost).toBe(300);
    expect(items[0].cost_price).toBe(300);

    // Order-level aggregates match quantity-scaled line evidence.
    expect(orderRow.materialTotal).toBe(600);       // 2 × 300
    expect(orderRow.profitMarginTotal).toBe(400);   // 2 × 200
    expect(orderRow.adjustmentTotal).toBe(0);
    expect(orderRow.roundingTotal).toBe(0);

    // Accounting firewall: financial totals identical to the request's.
    expect(orderRow.subtotal).toBe(created.subtotal);
    expect(orderRow.total).toBe(created.total);

    // Accounting firewall: conversion writes NO accounting records.
    const written = new Set(upsertedTables);
    for (const forbidden of [
      'invoices', 'sales', 'customer_payments', 'supplier_payments',
      'payment_allocations', 'ledger_entries', 'receipts', 'quotations',
    ]) {
      expect(written.has(forbidden)).toBe(false);
    }
    expect(written.has('sales_orders')).toBe(true);
  });

  it('Test D — legacy requests without evidence are backfilled from the same catalog at conversion', async () => {
    store.quotation_requests.set('req_legacy', {
      id: 'req_legacy',
      request_number: 'ODR-2026-999999',
      customer_id: 'cust_a',
      customer_name: 'Customer A',
      request_type: 'order',
      status: 'submitted',
      items: JSON.stringify([
        { productId: 'prod-a4-env', name: 'A4 Envelope', quantity: 3, unitPrice: 500, lineTotal: 1500 },
      ]),
      subtotal: 1500,
      total: 1500,
    });

    const so = await lifecycle.completeSalesOrder('req_legacy', { admin: ADMIN });
    const orderRow = store.sales_orders.get(so.id);
    const items = JSON.parse(orderRow.items);

    expect(items[0].pricingBreakdown).toEqual(expect.objectContaining({
      baseMaterialCost: 300,
      costPrice: 300,
      profitMarginAmount: 200,
    }));
    expect(orderRow.materialTotal).toBe(900);       // 3 × 300
    expect(orderRow.profitMarginTotal).toBe(600);   // 3 × 200
  });
});
