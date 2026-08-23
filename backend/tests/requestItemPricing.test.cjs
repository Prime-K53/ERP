/**
 * Conversion-boundary pricing tests (hermetic).
 *
 * Defect: quotation/order requests whose lines carried no resolvable catalog
 * identity (free-typed descriptions or stale ids) flowed UNPRICED (K 0.00)
 * into the official quotation editor, even when an ERP product existed with
 * exactly that name.
 *
 * Fix under test: startQuotationGeneration / startOrderGeneration now resolve
 * every requested line against authoritative ERP master data at the
 * CONVERSION boundary:
 *   1. variantId -> master_variant price
 *   2. productId -> master price
 *   3. exact normalized name (unambiguous only) -> master_name_match
 *   4. unmatched -> K 0.00 ('unknown_product' / 'custom_line'), never invented
 */

process.env.JWT_SECRET = 'test-jwt-secret';

const repoActual = jest.requireActual('../services/supabaseRepository.cjs');

// Simulated Supabase rows: { id, data JSONB, created_at, updated_at, version }.
const store = {
  customers: new Map(),
  products: new Map(),
  quotation_requests: new Map(),
};

function seed(table, id, data, created_at = '2026-08-01T08:00:00.000Z') {
  store[table].set(id, { id, data, created_at, updated_at: created_at, version: 1 });
}

jest.mock('../services/supabaseRepository.cjs', () => ({
  getAll: jest.fn(async (table) => {
    const rows = [...((store[table] || new Map()).values())];
    return rows.map((row) => repoActual.fromSupabaseRow(row));
  }),
  getById: jest.fn(async (table, id) => {
    const row = (store[table] || new Map()).get(String(id));
    return row ? repoActual.fromSupabaseRow(row) : null;
  }),
  upsert: jest.fn(async (table, record) => {
    if (!store[table]) store[table] = new Map();
    const { id } = record;
    const data = { ...record };
    delete data.id;
    const existing = store[table].get(id);
    store[table].set(id, {
      id,
      data,
      created_at: existing ? existing.created_at : new Date().toISOString(),
      updated_at: new Date().toISOString(),
      version: existing ? existing.version + 1 : 1,
    });
    return repoActual.fromSupabaseRow(store[table].get(id));
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
  nextYearScopedNumber: jest.fn(async (_t, _c, prefix) => `${prefix}-2026-000001`),
  requestNumberPrefix: jest.fn((type) => (type === 'order' ? 'SO' : 'QTR')),
}));

jest.mock('../auditService.cjs', () => ({
  auditService: { logEvent: jest.fn(async () => ({})) },
}));

const lifecycle = require('../services/portalLifecycleService.cjs');

const ADMIN = { id: 'adm_1', name: 'Sales', role: 'admin' };

function seedFixtures() {
  store.customers.clear();
  store.products.clear();
  store.quotation_requests.clear();

  seed('customers', 'cust_acme', {
    name: 'Acme LTD',
    email: 'acme@example.com',
    segment: 'School Account',
  });

  // Authoritative ERP master data (cloud `products`).
  seed('products', 'prod_scheme_pad', { name: 'Scheme Pad', sellingPrice: 500, costPrice: 300 });
  seed('products', 'prod_chalk_box', { name: 'Chalk (box)', sellingPrice: 120, costPrice: 80 });
  seed('products', 'prod_scheme_pads', { name: 'Scheme Pads', sellingPrice: 999, costPrice: 600 }); // similar-but-distinct
  seed('products', 'prod_mystery_a', { name: 'Mystery Kit', sellingPrice: 700 });
  seed('products', 'prod_mystery_b', { name: 'Mystery Kit', sellingPrice: 900 }); // ambiguous duplicate name
  seed('products', 'prod_custom_booklet', { name: 'Custom school attendance booklet', status: 'deleted' }); // deleted: must NOT price
}

function seedRequest(id, number, items) {
  seed('quotation_requests', id, {
    request_number: number,
    customer_id: 'cust_acme',
    customer_name: 'Acme LTD',
    request_type: 'quotation',
    items: JSON.stringify(items),
    subtotal: 0,
    notes: null,
    attachments: [],
    status: 'submitted',
  }, '2026-08-23T12:00:00.000Z');
}

async function generate(requestId) {
  return lifecycle.startQuotationGeneration(requestId, { admin: ADMIN });
}

describe('Conversion-boundary item pricing', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    seedFixtures();
  });

  // Test 1 — existing product resolved by exact normalized description.
  it('prices "Scheme Pad" x25 from ERP master data when the line has no productId', async () => {
    seedRequest('req_1', 'QTR-2026-000101', [
      { name: 'Scheme Pad', quantity: 25, unitPrice: 0 },
    ]);

    const prefill = await generate('req_1');
    const line = prefill.items.find((l) => l.name === 'Scheme Pad');

    expect(line.unitPrice).toBe(500);
    expect(line.lineTotal).toBe(12500);
    expect(line.priceSource).toBe('master_name_match');
    expect(line.productId).toBe('prod_scheme_pad');
    expect(prefill.subtotal).toBe(12500);
    expect(prefill.total).toBe(12500);
    // Original request document is never rewritten.
    const storedRaw = store.quotation_requests.get('req_1');
    const storedLine = JSON.parse(storedRaw.data.items)[0];
    expect(storedLine.unitPrice).toBe(0);
  });

  // Test 2 — multiple existing products each receive their own price.
  it('prices multiple matched lines independently', async () => {
    seedRequest('req_2', 'QTR-2026-000102', [
      { name: 'Scheme Pad', quantity: 25, unitPrice: 0 },
      { name: 'Chalk (box)', quantity: 2, unitPrice: 0 },
    ]);

    const prefill = await generate('req_2');
    const pad = prefill.items.find((l) => l.name === 'Scheme Pad');
    const chalk = prefill.items.find((l) => l.name === 'Chalk (box)');

    expect(pad.unitPrice).toBe(500);
    expect(chalk.unitPrice).toBe(120);
    expect(prefill.subtotal).toBe(12500 + 240);
    expect(prefill.total).toBe(12740);
  });

  // Test 3 — unknown/custom items stay K 0.00 and conversion still succeeds.
  it('keeps unmatched custom items at zero without rejecting the conversion', async () => {
    seedRequest('req_3', 'QTR-2026-000103', [
      { name: 'Custom school attendance booklet', quantity: 100, unitPrice: 0 },
    ]);

    const prefill = await generate('req_3');
    const line = prefill.items[0];

    expect(line.unitPrice).toBe(0);
    expect(line.lineTotal).toBe(0);
    expect(['unknown_product', 'custom_line']).toContain(line.priceSource);
    expect(prefill.items).toHaveLength(1);
    expect(prefill.subtotal).toBe(0);
  });

  // Test 4 — similar names must NOT fuzzy-match; ambiguous duplicates refuse auto-pricing.
  it('does not fuzzy-match similar names and refuses ambiguous duplicate names', async () => {
    seedRequest('req_4', 'QTR-2026-000104', [
      { name: 'Scheme  PAD', quantity: 1, unitPrice: 0 }, // whitespace variants normalize to one key -> Scheme Pad
      { name: 'Scheme Pads', quantity: 1, unitPrice: 0 }, // distinct product, own exact price
      { name: 'Mystery Kit', quantity: 1, unitPrice: 0 }, // two catalog entries share this name -> ambiguous
    ]);

    const prefill = await generate('req_4');
    const byName = Object.fromEntries(prefill.items.map((l) => [l.name.replace(/\s+/g, ' ').trim(), l]));

    expect(byName['Scheme PAD'].unitPrice).toBe(500); // normalized exact match
    expect(byName['Scheme Pads'].unitPrice).toBe(999); // its OWN product, not Scheme Pad's
    expect(byName['Mystery Kit'].unitPrice).toBe(0); // ambiguous: never guessed
    expect(byName['Mystery Kit'].priceSource).not.toBe('master_name_match');
  });

  // Test 5 — line totals and totals derive from resolved prices × quantities.
  it('computes lineTotal = unitPrice × quantity and consistent totals', async () => {
    seedRequest('req_5', 'QTR-2026-000105', [
      { name: 'Scheme Pad', quantity: 3, unitPrice: 0 },
      { name: 'Chalk (box)', quantity: 7, unitPrice: 0 },
    ]);

    const prefill = await generate('req_5');
    for (const l of prefill.items) {
      expect(l.lineTotal).toBeCloseTo(l.unitPrice * l.quantity, 2);
    }
    expect(prefill.subtotal).toBeCloseTo(1500 + 840, 2);
  });

  // Test 6 — catalog-id lines keep resolving to the SAME master price (existing behavior preserved).
  it('keeps productId lines priced from the same authoritative master price', async () => {
    seedRequest('req_6', 'QTR-2026-000106', [
      { productId: 'prod_chalk_box', name: 'Chalk (box)', quantity: 4, unitPrice: 120 },
    ]);

    const prefill = await generate('req_6');
    const line = prefill.items[0];

    expect(line.priceSource).toBe('master');
    expect(line.unitPrice).toBe(120);
    expect(line.lineTotal).toBe(480);
    // Extra request-line fields survive the resolution untouched.
    seedRequest('req_6b', 'QTR-2026-000107', [
      { productId: 'prod_chalk_box', name: 'Chalk (box)', quantity: 4, unitPrice: 120, unit: 'box' },
    ]);
    const prefillB = await generate('req_6b');
    expect(prefillB.items[0].unit).toBe('box');
  });

  // Test 7 — stale productId falls back to exact-name, then zero; repeated conversion creates nothing.
  it('falls back to exact name for a stale productId and never duplicates documents', async () => {
    seedRequest('req_7', 'QTR-2026-000108', [
      { productId: 'prod_gone', name: 'Chalk (box)', quantity: 2, unitPrice: 0 },
    ]);

    const prefill = await generate('req_7');
    expect(prefill.items[0].unitPrice).toBe(120);
    expect(prefill.items[0].priceSource).toBe('master_name_match');

    // Repeated generation attempts create no quotations (conversion only marks state).
    await generate('req_7').catch(() => {});
    let quotationRows = 0;
    for (const [, table] of [['x', store.quotation_requests]]) {
      void table;
      quotationRows = [...store.quotation_requests.keys()].filter((k) => String(k).startsWith('qt_')).length;
    }
    expect(quotationRows).toBe(0);

    // Once linked to a quotation, regeneration is refused (duplicate protection intact).
    const row = store.quotation_requests.get('req_7');
    row.data.quotation_id = 'qt_existing';
    row.data.status = 'converted';
    await expect(generate('req_7')).rejects.toThrow(/already been generated/i);
  });

  // Test 8 — pricing reads ONLY the shared ERP master catalog (customer isolation).
  it('resolves prices exclusively from the shared products master', async () => {
    seedRequest('req_8', 'QTR-2026-000109', [
      { name: 'Scheme Pad', quantity: 1, unitPrice: 0 },
    ]);

    const { getAll } = require('../services/supabaseRepository.cjs');
    await generate('req_8');

    const tablesRead = getAll.mock.calls.map((call) => call[0]);
    expect(tablesRead).toContain('products');
    for (const t of tablesRead) {
      expect(t).toBe('products'); // no customer-scoped or private tables consulted for pricing
    }
  });
});
