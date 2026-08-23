/**
 * Portal multi-variant catalog + pricing contract tests (hermetic).
 *
 * Root cause guarded here: the portal catalog endpoint read the EMPTY
 * product_variants TABLE while authoritative variants live EMBEDDED in each
 * product doc — so multi-variant products reached Sasa as a single flat price
 * and server-side re-pricing flattened selected variants to the parent price.
 *
 * Contract pinned:
 *   A. catalog DTO exposes embedded variants w/ deterministic ids + exact prices
 *   B. product-level price remains the parent master price (no copying)
 *   C. a line carrying variantId is re-priced from THAT variant (server-side)
 *   D. variant identity survives createQuotationRequest persistence
 *   F/G/H/I. single-price / identical-price / zero-price / null-price variants
 */

process.env.JWT_SECRET = 'test-jwt-secret';

// Authoritative docs mirror the REAL staging shape (embedded variants,
// no variant id fields, e.g. INV-PRD-063 "Lesson Plan").
const PRODUCTS = [
  {
    id: 'INV-TSHIRT',
    data: {
      id: 'INV-TSHIRT',
      name: 'T-Shirt',
      sku: 'INV-TSHIRT',
      type: 'Product',
      category: 'General',
      status: 'Active',
      sellingPrice: 5500,
      costPrice: 2172,
      variants: [
        { name: 'T-Shirt - S', sku: 'TS-S', sellingPrice: 5000, costPrice: 2353.5 },
        { name: 'T-Shirt - M', sku: 'TS-M', sellingPrice: 5500, costPrice: 3173.5 },
        { name: 'T-Shirt - L', sku: 'TS-L', sellingPrice: 6000, costPrice: 3788.5 },
      ],
    },
  },
  {
    id: 'INV-SINGLE',
    data: { id: 'INV-SINGLE', name: 'Plain Notebook', type: 'Product', status: 'Active', sellingPrice: 900, costPrice: 400 },
  },
  {
    id: 'INV-SAME',
    data: {
      id: 'INV-SAME', name: 'Same Price Pack', type: 'Product', status: 'Active', sellingPrice: 1000,
      variants: [
        { name: 'Same - A', sku: 'SP-A', sellingPrice: 1000 },
        { name: 'Same - B', sku: 'SP-B', sellingPrice: 1000 },
      ],
    },
  },
  {
    id: 'INV-ZERO',
    data: {
      id: 'INV-ZERO', name: 'Free Sample Pack', type: 'Product', status: 'Active', sellingPrice: 0,
      variants: [
        { name: 'Zero - A', sku: 'Z-A', sellingPrice: 0 },
        { name: 'Null - B', sku: 'Z-B', sellingPrice: null },
      ],
    },
  },
];

const store = {
  products: new Map(PRODUCTS.map((p) => [p.id, { id: p.id, ...p.data }])),
  product_variants: new Map(), // deliberately empty — mirrors staging reality
  customers: new Map([
    ['cust_a', { id: 'cust_a', name: 'Customer A', companyId: 'company_a', createdAt: '2026-01-01T00:00:00Z' }],
  ]),
};

const upsertedTables = [];
function recordUpsert(table, record) {
  upsertedTables.push(table);
  store[table] = store[table] || new Map();
  store[table].set(record.id, { ...(record.data || record), id: record.id });
}

jest.mock('../services/supabaseRepository.cjs', () => ({
  getAll: jest.fn(async (table) => [...(store[table] || new Map()).values()]),
  getAllStrict: jest.fn(async (table) => [...(store[table] || new Map()).values()]),
  getById: jest.fn(async (table, id) => (store[table] || new Map()).get(id) || null),
  upsert: jest.fn(async (table, record) => {
    recordUpsert(table, record);
    return { id: record.id };
  }),
  softDelete: jest.fn(async () => ({ changes: 1 })),
}));

jest.mock('../services/promotionService.cjs', () => ({
  getActivePromotions: jest.fn(async () => []),
  getUsageByPromotion: jest.fn(async () => ({})),
  getUsageByPromotionForCustomer: jest.fn(async () => ({})),
  recordRedemption: jest.fn(async () => ({})),
}));

jest.mock('../services/workflowEngine.cjs', () => ({
  SALES_ORDER_STATUS: Object.freeze({ DRAFT: 'Draft', CONFIRMED: 'Confirmed', CANCELLED: 'Cancelled' }),
  nextYearScopedNumber: jest.fn(async (_t, _c, prefix) => prefix + '-2026-000042'),
  requestNumberPrefix: jest.fn((type) => (type === 'order' ? 'SO' : 'QTR')),
}));

jest.mock('../auditService.cjs', () => ({
  auditService: { logEvent: jest.fn(async () => ({})) },
}));

const portalService = require('../services/portalService.cjs');
const lifecycle = require('../services/portalLifecycleService.cjs');
const repo = require('../services/supabaseRepository.cjs');

describe('Portal multi-variant pricing contract', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    upsertedTables.length = 0;
    store.products = new Map(PRODUCTS.map((p) => [p.id, { id: p.id, ...p.data }]));
    store.product_variants = new Map();
    store.customers.set('cust_a', { id: 'cust_a', name: 'Customer A', companyId: 'company_a', createdAt: '2026-01-01T00:00:00Z' });
    delete store.quotation_requests;
    delete store.sales_orders;
  });

  it('Test A — catalog DTO exposes all embedded variant prices with stable ids', async () => {
    const catalog = await portalService.getCatalog();
    const tshirt = catalog.find((c) => c.id === 'INV-TSHIRT');

    expect(tshirt.variants).toHaveLength(3);
    expect(tshirt.variants.map((v) => v.sellingPrice)).toEqual([5000, 5500, 6000]);
    // Deterministic keys survive repeated calls (cart + server-side lookup).
    const again = await portalService.getCatalog();
    expect(again.find((c) => c.id === 'INV-TSHIRT').variants.map((v) => v.id))
      .toEqual(tshirt.variants.map((v) => v.id));
    expect(tshirt.variants[0].id).toBe('INV-TSHIRT::TS-S');
  });

  it('Test B — product-level price stays the parent master price', async () => {
    const catalog = await portalService.getCatalog();
    const tshirt = catalog.find((c) => c.id === 'INV-TSHIRT');
    expect(tshirt.price).toBe(5500); // parent master — NOT copied from a variant
  });

  it('Test C — server-side re-pricing honours the selected variant (never flattens)', async () => {
    await lifecycle.createQuotationRequest({
      portalUserId: 'pusr_v',
      customerId: 'cust_a',
      customerName: 'Customer A',
      requestType: 'order',
      items: [
        { productId: 'INV-TSHIRT', variantId: 'INV-TSHIRT::TS-L', name: 'T-Shirt (T-Shirt - L)', quantity: 2, unitPrice: 1 },
        { productId: 'INV-TSHIRT', name: 'T-Shirt', quantity: 1, unitPrice: 1 }, // no selection -> parent master
        { productId: 'INV-TSHIRT', variantId: 'INV-TSHIRT::GONE', name: 'T-Shirt (removed variant)', quantity: 1, unitPrice: 99999 }, // stale id -> parent fallback
      ],
    });

    // Inspect what was persisted for the request.
    const reqRow = [...store.quotation_requests.values()].find((r) => r.request_type === 'order');
    const items = JSON.parse(reqRow.items);
    const largeLine = items.find((l) => l.variantId === 'INV-TSHIRT::TS-L');
    const parentLine = items.find((l) => !l.variantId);
    const staleLine = items.find((l) => l.variantId === 'INV-TSHIRT::GONE');

    // Large bills ITS OWN master price (2 x 6000), not the parent's.
    expect(largeLine.unitPrice).toBe(6000);
    expect(largeLine.priceSource).toBe('master_variant');
    // No selection -> parent master price.
    expect(parentLine.unitPrice).toBe(5500);
    expect(parentLine.priceSource).toBe('master');
    // Stale/unknown variant degrades safely to the parent master price.
    expect(staleLine.unitPrice).toBe(5500);
    expect(staleLine.priceSource).toBe('master');

    // Request totals reflect the variant choice (12000 + 5500 + 5500).
    expect(reqRow.subtotal).toBe(23000);
    expect(reqRow.total).toBe(23000);
  });

  it('Test D — persisted sales-order source keeps variantId + variant cost evidence', async () => {
    const created = await lifecycle.createQuotationRequest({
      portalUserId: 'pusr_v',
      customerId: 'cust_a',
      customerName: 'Customer A',
      requestType: 'order',
      items: [{ productId: 'INV-TSHIRT', variantId: 'INV-TSHIRT::TS-S', name: 'T-Shirt (T-Shirt - S)', quantity: 1, unitPrice: 5000 }],
    });

    const so = await lifecycle.completeSalesOrder(created.id, { admin: { id: 'adm_1', name: 'Sales' } });
    const orderRow = store.sales_orders.get(so.id);
    const items = JSON.parse(orderRow.items);

    expect(items[0].variantId).toBe('INV-TSHIRT::TS-S');
    expect(items[0].unitPrice).toBe(5000);
    // Variant-specific cost evidence (S cost 2353.5, NOT parent 2172).
    expect(items[0].pricingBreakdown.baseMaterialCost).toBe(2353.5);
    expect(items[0].cost).toBe(2353.5);
    expect(orderRow.total).toBe(5000); // accounting firewall: total == variant total
  });

  it('Test F — a single-price product exposes no variants field', async () => {
    const catalog = await portalService.getCatalog();
    const plain = catalog.find((c) => c.id === 'INV-SINGLE');
    expect(plain.price).toBe(900);
    expect(plain.variants).toBeUndefined();
  });

  it('Test G — multiple variants with identical prices are still exposed', async () => {
    const catalog = await portalService.getCatalog();
    const same = catalog.find((c) => c.id === 'INV-SAME');
    expect(same.variants).toHaveLength(2);
    expect(same.variants.every((v) => v.sellingPrice === 1000)).toBe(true);
  });

  it('Test H/I — zero price preserved; null price passed as-null and priced from parent', async () => {
    const catalog = await portalService.getCatalog();
    const zero = catalog.find((c) => c.id === 'INV-ZERO');
    const varA = zero.variants.find((v) => v.name === 'Zero - A');
    const varB = zero.variants.find((v) => v.name === 'Null - B');
    expect(varA.sellingPrice).toBe(0); // legitimate zero — never treated as missing

    // Null (unset upstream) reaches the DTO as null…
    expect(varB.sellingPrice).toBeNull();

    // …and server-side pricing falls back to the PARENT master (never another variant).
    await lifecycle.createQuotationRequest({
      portalUserId: 'pusr_v',
      customerId: 'cust_a',
      customerName: 'Customer A',
      requestType: 'order',
      items: [{ productId: 'INV-ZERO', variantId: varB.id, name: 'Free Sample Pack (Null - B)', quantity: 1, unitPrice: 0 }],
    });
    const reqRow = [...store.quotation_requests.values()].find((r) => r.request_type === 'order' && JSON.parse(r.items)[0].productId === 'INV-ZERO');
    const line = JSON.parse(reqRow.items)[0];
    expect(line.unitPrice).toBe(0); // parent master IS 0 here — authoritative, not invented
  });
});
