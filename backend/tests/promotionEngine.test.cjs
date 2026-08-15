/**
 * Promotion Engine — unit tests
 *
 * Covers the acceptance criteria from arch/PROMOTIONS-ENGINE.md:
 *   basic discounts (10%/5%/fixed), date windows (before/at/during/at-end/after),
 *   channels (PORTAL/ERP/BOTH), conditions (min order, max discount, product,
 *   category, customer, tier), usage limits (total + per-customer), security
 *   (manipulated price/discount, invalid/expired/foreign-company promotions,
 *   no double discounting) and stacking.
 *
 * The engine is pure (no DB) — promotionService + the atomic redemption RPC
 * are exercised separately by integration tests.
 */

const {
  calculatePromotion,
  deriveStatus,
  resolveAuthoritativePrices,
  round2,
} = require('../services/promotionEngine.cjs');

// ─── Fixtures ────────────────────────────────────────────────────────────────
const COMPANY = 'company_a';

function activePromotion(overrides = {}) {
  return {
    id: overrides.id || 'promo_1',
    companyId: COMPANY,
    name: overrides.name || 'Test Promotion',
    code: overrides.code || 'TEST10',
    channel: overrides.channel || 'PORTAL',
    discountType: overrides.discountType || 'percentage',
    discountValue: overrides.discountValue ?? 10,
    status: 'active',
    isActive: true,
    isAutoApply: overrides.isAutoApply ?? true,
    minimumOrderAmount: overrides.minimumOrderAmount ?? 0,
    maximumDiscountAmount: overrides.maximumDiscountAmount ?? 0,
    usageLimit: overrides.usageLimit ?? 0,
    usageLimitPerCustomer: overrides.usageLimitPerCustomer ?? 0,
    applicableTo: overrides.applicableTo || 'all',
    productIds: overrides.productIds || [],
    categoryIds: overrides.categoryIds || [],
    customerScope: overrides.customerScope || 'all',
    customerIds: overrides.customerIds || [],
    tierIds: overrides.tierIds || [],
    priority: overrides.priority ?? 0,
    stackable: overrides.stackable ?? true,
    startsAt: overrides.startsAt || null,
    endsAt: overrides.endsAt || null,
    pausedAt: overrides.pausedAt || null,
    cancelledAt: overrides.cancelledAt || null,
    usedCount: overrides.usedCount ?? 0,
    ...overrides,
  };
}

function lines(list) {
  return list.map(([name, quantity, unitPrice, extra = {}]) => ({
    name,
    quantity,
    unitPrice,
    lineTotal: round2(quantity * unitPrice),
    ...extra,
  }));
}

function calc(args) {
  const items = args.items || [];
  const subtotal = args.subtotal ?? round2(items.reduce((s, l) => s + l.lineTotal, 0));
  return calculatePromotion({
    companyId: COMPANY,
    customer: args.customer ?? { id: 'cust_1' },
    customerTierIds: args.customerTierIds || [],
    channel: args.channel ?? 'PORTAL',
    items,
    subtotal,
    promotionCode: args.promotionCode ?? null,
    promotions: args.promotions || [],
    usageByPromotion: args.usageByPromotion || {},
    customerUsageByPromotion: args.customerUsageByPromotion || {},
    now: args.now || new Date('2026-08-15T12:00:00Z'),
    options: args.options || {},
  });
}

// ─── 1. Basic discounts ──────────────────────────────────────────────────────
describe('basic discount types', () => {
  it('applies a 10% percentage discount', () => {
    const res = calc({
      items: lines([['A4 Book', 10, 10000]]),
      promotions: [activePromotion({ code: 'AUGUST10', discountType: 'percentage', discountValue: 10 })],
    });
    expect(res.applied).toBe(true);
    expect(res.discountTotal).toBe(10000); // 100,000 × 10%
    expect(res.subtotalBeforeDiscount).toBe(100000);
    expect(res.subtotalAfterDiscount).toBe(90000);
    expect(res.grandTotal).toBe(90000);
    expect(res.lines[0]).toEqual(expect.objectContaining({
      originalUnitPrice: 10000,
      discountAmount: 10000,
      netUnitPrice: 9000,
      lineTotal: 90000,
      promotionCode: 'AUGUST10',
    }));
    // Master price untouched
    expect(res.lines[0].unitPrice).toBe(10000);
  });

  it('applies a 5% percentage discount', () => {
    const res = calc({
      items: lines([['A4 Book', 10, 10000]]),
      promotions: [activePromotion({ discountValue: 5 })],
    });
    expect(res.discountTotal).toBe(5000);
    expect(res.subtotalAfterDiscount).toBe(95000);
  });

  it('applies a fixed amount discount (order level, proportional across lines)', () => {
    const res = calc({
      items: lines([['A', 1, 6000], ['B', 1, 4000]]),
      promotions: [activePromotion({ discountType: 'fixed_amount', discountValue: 5000 })],
    });
    expect(res.applied).toBe(true);
    expect(res.discountTotal).toBe(5000);
    expect(res.subtotalAfterDiscount).toBe(5000);
    // 60/40 split across lines
    expect(res.lines[0].discountAmount).toBe(3000);
    expect(res.lines[1].discountAmount).toBe(2000);
  });

  it('never discounts more than the subtotal', () => {
    const res = calc({
      items: lines([['A', 1, 100]]),
      promotions: [activePromotion({ discountType: 'fixed_amount', discountValue: 99999 })],
      options: { maxTotalDiscountPct: 100 },
    });
    expect(res.discountTotal).toBe(100);
    expect(res.subtotalAfterDiscount).toBe(0);
    expect(res.lines[0].netUnitPrice).toBe(0);
  });
});

// ─── 2. Dates ────────────────────────────────────────────────────────────────
describe('date windows', () => {
  const promo = () => activePromotion({
    startsAt: '2026-08-10T00:00:00Z',
    endsAt: '2026-08-31T23:59:59Z',
  });

  it('not eligible before start', () => {
    const res = calc({ items: lines([['A', 1, 1000]]), promotions: [promo()], now: new Date('2026-08-09T23:59:59Z') });
    expect(res.applied).toBe(false);
  });

  it('eligible exactly at start', () => {
    const res = calc({ items: lines([['A', 1, 1000]]), promotions: [promo()], now: new Date('2026-08-10T00:00:00Z') });
    expect(res.applied).toBe(true);
  });

  it('eligible during the window', () => {
    const res = calc({ items: lines([['A', 1, 1000]]), promotions: [promo()], now: new Date('2026-08-20T12:00:00Z') });
    expect(res.applied).toBe(true);
  });

  it('eligible exactly at expiry boundary (inclusive end)', () => {
    const res = calc({ items: lines([['A', 1, 1000]]), promotions: [promo()], now: new Date('2026-08-31T23:59:59Z') });
    expect(res.applied).toBe(true);
  });

  it('not eligible after expiry', () => {
    const res = calc({ items: lines([['A', 1, 1000]]), promotions: [promo()], now: new Date('2026-09-01T00:00:00Z') });
    expect(res.applied).toBe(false);
    expect(res.metadata).toBeDefined();
  });

  it('deriveStatus handles draft/scheduled/active/paused/expired/cancelled', () => {
    expect(deriveStatus(activePromotion({ status: 'draft' }), new Date('2026-08-15T00:00:00Z'))).toBe('draft');
    expect(deriveStatus(activePromotion({ startsAt: '2026-09-01T00:00:00Z' }), new Date('2026-08-15T00:00:00Z'))).toBe('scheduled');
    expect(deriveStatus(activePromotion(), new Date('2026-08-15T00:00:00Z'))).toBe('active');
    expect(deriveStatus(activePromotion({ pausedAt: '2026-08-12T00:00:00Z' }), new Date('2026-08-15T00:00:00Z'))).toBe('paused');
    expect(deriveStatus(activePromotion({ status: 'paused' }), new Date('2026-08-15T00:00:00Z'))).toBe('paused');
    expect(deriveStatus(activePromotion({ endsAt: '2026-08-01T00:00:00Z' }), new Date('2026-08-15T00:00:00Z'))).toBe('expired');
    expect(deriveStatus(activePromotion({ cancelledAt: '2026-08-12T00:00:00Z' }), new Date('2026-08-15T00:00:00Z'))).toBe('cancelled');
    expect(deriveStatus(activePromotion({ status: 'cancelled' }), new Date('2026-08-15T00:00:00Z'))).toBe('cancelled');
  });
});

// ─── 3. Channels ─────────────────────────────────────────────────────────────
describe('channels', () => {
  it('PORTAL promotion applies to PORTAL orders', () => {
    const res = calc({ items: lines([['A', 1, 1000]]), promotions: [activePromotion({ channel: 'PORTAL' })], channel: 'PORTAL' });
    expect(res.applied).toBe(true);
  });

  it('PORTAL promotion does NOT apply to ERP orders', () => {
    const res = calc({ items: lines([['A', 1, 1000]]), promotions: [activePromotion({ channel: 'PORTAL' })], channel: 'ERP' });
    expect(res.applied).toBe(false);
  });

  it('ERP promotion does not apply to PORTAL orders', () => {
    const res = calc({ items: lines([['A', 1, 1000]]), promotions: [activePromotion({ channel: 'ERP' })], channel: 'PORTAL' });
    expect(res.applied).toBe(false);
  });

  it('BOTH applies to either channel', () => {
    const promo = activePromotion({ channel: 'BOTH' });
    expect(calc({ items: lines([['A', 1, 1000]]), promotions: [promo], channel: 'PORTAL' }).applied).toBe(true);
    expect(calc({ items: lines([['A', 1, 1000]]), promotions: [promo], channel: 'ERP' }).applied).toBe(true);
  });
});

// ─── 4. Conditions ───────────────────────────────────────────────────────────
describe('conditions', () => {
  it('honours minimum order amount', () => {
    const promo = activePromotion({ minimumOrderAmount: 50000 });
    expect(calc({ items: lines([['A', 1, 40000]]), promotions: [promo] }).applied).toBe(false);
    const res = calc({ items: lines([['A', 1, 50000]]), promotions: [promo] });
    expect(res.applied).toBe(true);
    expect(res.discountTotal).toBe(5000);
  });

  it('caps discount at maximum discount amount', () => {
    const promo = activePromotion({ discountValue: 10, maximumDiscountAmount: 3000 });
    const res = calc({ items: lines([['A', 10, 10000]]), promotions: [promo] });
    expect(res.applied).toBe(true);
    expect(res.discountTotal).toBe(3000); // 10% of 100k = 10k → capped at 3k
    expect(res.subtotalAfterDiscount).toBe(97000);
  });

  it('applies only to listed products', () => {
    const promo = activePromotion({ applicableTo: 'products', productIds: ['p1'] });
    const res = calc({
      items: lines([['A', 1, 1000, { productId: 'p1' }], ['B', 1, 1000, { productId: 'p2' }]]),
      promotions: [promo],
    });
    expect(res.applied).toBe(true);
    expect(res.lines[0].discountAmount).toBe(100); // only p1 discounted
    expect(res.lines[1].discountAmount).toBe(0);   // p2 untouched
  });

  it('applies only to listed categories', () => {
    const promo = activePromotion({ applicableTo: 'categories', categoryIds: ['paper'] });
    const res = calc({
      items: lines([['A', 1, 1000, { category: 'paper' }], ['B', 1, 1000, { category: 'ink' }]]),
      promotions: [promo],
    });
    expect(res.applied).toBe(true);
    expect(res.lines[0].discountAmount).toBe(100);
    expect(res.lines[1].discountAmount).toBe(0);
  });

  it('applies only to specified customers', () => {
    const promo = activePromotion({ customerScope: 'customers', customerIds: ['cust_1'] });
    expect(calc({ items: lines([['A', 1, 1000]]), promotions: [promo], customer: { id: 'cust_1' } }).applied).toBe(true);
    expect(calc({ items: lines([['A', 1, 1000]]), promotions: [promo], customer: { id: 'cust_2' } }).applied).toBe(false);
  });

  it('applies only to customers in a tier', () => {
    const promo = activePromotion({ customerScope: 'tiers', tierIds: ['gold'] });
    expect(calc({
      items: lines([['A', 1, 1000]]),
      promotions: [promo],
      customer: { id: 'cust_1' },
      customerTierIds: ['gold'],
    }).applied).toBe(true);
    expect(calc({
      items: lines([['A', 1, 1000]]),
      promotions: [promo],
      customer: { id: 'cust_1' },
      customerTierIds: ['silver'],
    }).applied).toBe(false);
  });
});

// ─── 5. Usage limits ─────────────────────────────────────────────────────────
describe('usage limits', () => {
  it('stops applying once total usage limit is reached', () => {
    const promo = activePromotion({ usageLimit: 5 });
    expect(calc({
      items: lines([['A', 1, 1000]]),
      promotions: [promo],
      usageByPromotion: { promo_1: 4 },
    }).applied).toBe(true);
    expect(calc({
      items: lines([['A', 1, 1000]]),
      promotions: [promo],
      usageByPromotion: { promo_1: 5 },
    }).applied).toBe(false);
  });

  it('stops applying once per-customer limit is reached', () => {
    const promo = activePromotion({ usageLimitPerCustomer: 2 });
    expect(calc({
      items: lines([['A', 1, 1000]]),
      promotions: [promo],
      customerUsageByPromotion: { promo_1: 1 },
    }).applied).toBe(true);
    expect(calc({
      items: lines([['A', 1, 1000]]),
      promotions: [promo],
      customerUsageByPromotion: { promo_1: 2 },
    }).applied).toBe(false);
  });
});

// ─── 6. Security ─────────────────────────────────────────────────────────────
describe('security', () => {
  it('resolves authoritative master prices, ignoring submitted prices', () => {
    const items = resolveAuthoritativePrices(
      [{ productId: 'p1', name: 'A4 Book', quantity: 10, unitPrice: 1 }, { productId: 'unknown', name: 'No Catalog', quantity: 1, unitPrice: 999 }],
      { p1: { sellingPrice: 10000 } }
    );
    expect(items[0].unitPrice).toBe(10000); // master price wins
    expect(items[0].lineTotal).toBe(100000);
    // Unknown productIds are never priced from the browser — price 0 + flag.
    expect(items[1].unitPrice).toBe(0);
    expect(items[1].priceSource).toBe('unknown_product');
  });

  it('keeps browser prices only for genuine custom line items (no productId)', () => {
    const items = resolveAuthoritativePrices(
      [{ name: 'Bespoke print job', quantity: 2, unitPrice: 1500 }],
      {}
    );
    expect(items[0].unitPrice).toBe(1500);
    expect(items[0].priceSource).toBe('custom_line');
  });

  it('ignores a manipulated browser discount', () => {
    // The engine never reads a submitted discount/lineTotal — the caller
    // resolves authoritative master prices first (resolveAuthoritativePrices)
    // and the engine only ever discounts from those.
    const authoritative = resolveAuthoritativePrices(
      [{ productId: 'p1', name: 'A', quantity: 10, unitPrice: 10000, lineTotal: 1 }],
      { p1: { sellingPrice: 10000 } }
    );
    const res = calc({ items: authoritative, promotions: [activePromotion()] });
    expect(res.subtotalBeforeDiscount).toBe(100000);
    expect(res.discountTotal).toBe(10000);
  });

  it('rejects invalid promo codes', () => {
    const res = calc({
      items: lines([['A', 1, 1000]]),
      promotions: [activePromotion({ code: 'AUGUST10', isAutoApply: false })],
      promotionCode: 'WRONG',
    });
    expect(res.applied).toBe(false);
  });

  it('accepts a valid promo code for code-based promotions', () => {
    const res = calc({
      items: lines([['A', 1, 1000]]),
      promotions: [activePromotion({ code: 'AUGUST10', isAutoApply: false })],
      promotionCode: 'august10', // case-insensitive
    });
    expect(res.applied).toBe(true);
    expect(res.discountTotal).toBe(100);
  });

  it('expired promotions never apply', () => {
    const res = calc({
      items: lines([['A', 1, 1000]]),
      promotions: [activePromotion({ endsAt: '2026-08-01T00:00:00Z' })],
      now: new Date('2026-08-15T00:00:00Z'),
    });
    expect(res.applied).toBe(false);
  });

  it('blocks cross-company promotion access', () => {
    const res = calc({
      items: lines([['A', 1, 1000]]),
      promotions: [activePromotion({ id: 'promo_other', companyId: 'company_b' })],
    });
    expect(res.applied).toBe(false);
  });

  it('cannot double-apply the same promotion record', () => {
    // Same promotion id appearing twice (sync glitch) must only discount once.
    const promo = activePromotion();
    const res = calc({ items: lines([['A', 1, 1000]]), promotions: [promo, { ...promo }] });
    expect(res.applied).toBe(true);
    expect(res.discountTotal).toBe(100); // not 200
    expect(res.promotions.length).toBe(1);
  });

  it('no promotion active → system still works (zero discount)', () => {
    const res = calc({ items: lines([['A', 1, 1000]]) });
    expect(res.applied).toBe(false);
    expect(res.discountTotal).toBe(0);
    expect(res.subtotalAfterDiscount).toBe(1000);
    expect(res.grandTotal).toBe(1000);
  });
});

// ─── 7. Stacking & priority ──────────────────────────────────────────────────
describe('priority and stacking', () => {
  // Higher numeric priority wins (standard convention: 10 beats 5).
  const promoA = () => activePromotion({ id: 'a', code: 'A', priority: 10, stackable: true, discountValue: 10 });
  const promoB = () => activePromotion({ id: 'b', code: 'B', priority: 5, stackable: true, discountValue: 5 });

  it('applies highest-priority promotion when stacking is exclusive', () => {
    const res = calc({
      items: lines([['A', 10000, 10]]),
      promotions: [promoA(), promoB()],
      options: { stackingRule: 'exclusive' },
    });
    expect(res.applied).toBe(true);
    expect(res.promotions.length).toBe(1);
    expect(res.promotions[0].id).toBe('a'); // higher priority (10 > 5)
    expect(res.discountTotal).toBe(10000);  // 10%, not 15%
  });

  it('applies the best non-stackable promotion (no double discount)', () => {
    const res = calc({
      items: lines([['A', 10000, 10]]),
      promotions: [
        activePromotion({ id: 'a', priority: 10, stackable: false, discountValue: 10 }),
        activePromotion({ id: 'b', priority: 5, stackable: false, discountValue: 5 }),
      ],
    });
    expect(res.promotions.length).toBe(1);
    expect(res.discountTotal).toBe(10000);
  });

  it('stacks stackable promotions with the max total discount cap', () => {
    const res = calc({
      items: lines([['A', 10000, 10]]),
      promotions: [promoA(), promoB()],
      options: { stackingRule: 'stackable', maxTotalDiscountPct: 50 },
    });
    expect(res.applied).toBe(true);
    expect(res.promotions.length).toBe(2);
    expect(res.discountTotal).toBe(15000); // 10% + 5% = 15%
    expect(res.subtotalAfterDiscount).toBe(85000);
  });

  it('hard-caps total discount at maxTotalDiscountPct', () => {
    const res = calc({
      items: lines([['A', 10000, 10]]),
      promotions: [promoA(), promoB()],
      options: { stackingRule: 'stackable', maxTotalDiscountPct: 10 },
    });
    expect(res.discountTotal).toBe(10000); // capped at 10%
  });
});

// ─── 8. End-to-end scenario from the spec ────────────────────────────────────
describe('spec end-to-end scenario (AUGUST10)', () => {
  it('computes the August Portal Promotion example exactly', () => {
    const promo = activePromotion({
      id: 'august10',
      name: 'August Portal Promotion',
      code: 'AUGUST10',
      channel: 'PORTAL',
      discountType: 'percentage',
      discountValue: 10,
      minimumOrderAmount: 50000,
      startsAt: '2026-08-10T00:00:00Z',
      endsAt: '2026-08-31T23:59:59Z',
    });
    const items = resolveAuthoritativePrices(
      [
        { productId: 'A', name: 'Product A', quantity: 10, unitPrice: 999 }, // browser lies
        { productId: 'B', name: 'Product B', quantity: 5, unitPrice: 0 },    // browser omits price
      ],
      { A: { sellingPrice: 10000 }, B: { sellingPrice: 20000 } }
    );
    const res = calc({ items, promotions: [promo], now: new Date('2026-08-15T12:00:00Z') });

    expect(res.subtotalBeforeDiscount).toBe(200000); // A=100,000 + B=100,000
    expect(res.discountTotal).toBe(20000);           // 10%
    expect(res.subtotalAfterDiscount).toBe(180000);
    expect(res.grandTotal).toBe(180000);
    expect(res.promotions[0]).toEqual(expect.objectContaining({ id: 'august10', code: 'AUGUST10' }));
    // ERP master prices never change
    expect(res.lines[0].originalUnitPrice).toBe(10000);
    expect(res.lines[1].originalUnitPrice).toBe(20000);
  });
});
