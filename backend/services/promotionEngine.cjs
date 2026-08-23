/**
 * Prime ERP — Promotion Engine (server-authoritative)
 *
 * The single source of truth for promotion eligibility and discount
 * calculation. Portal order submission, the portal preview endpoint, and any
 * future ERP integration all call this module. Promotions modify the
 * TRANSACTION price — never the ERP master product price.
 *
 * Design principles (see arch/PROMOTIONS-ENGINE.md):
 *  - The backend is the final authority. Browser-submitted prices/discounts
 *    are display information only; callers must resolve authoritative prices.
 *  - Status is derived consistently from the active flag, start/end dates,
 *    pause state and cancellation state — not from a frontend value alone.
 *  - Multiple promotions never double-discount accidentally: explicit
 *    priority + stackable rules with a hard cap on total discount.
 *  - Historical transactions are never recalculated; callers snapshot the
 *    promotion into the transaction record.
 */

'use strict';

const CHANNELS = Object.freeze({ ERP: 'ERP', PORTAL: 'PORTAL', BOTH: 'BOTH' });
const DISCOUNT_TYPES = Object.freeze({
  PERCENTAGE: 'percentage',
  FIXED_AMOUNT: 'fixed_amount',
  FIXED_PRICE: 'fixed_price',
  BUY_X_GET_Y: 'buy_x_get_y',
  // Legacy / future-ready aliases mapped by normalizePromotion():
  FIXED: 'fixed',
  TIERED: 'tiered',
  CATEGORY: 'category',
  BRAND: 'brand',
  BUNDLE: 'bundle',
  COUPON: 'coupon',
  CAMPAIGN: 'campaign',
});
const CUSTOMER_SCOPES = Object.freeze({
  ALL: 'all',
  CUSTOMERS: 'customers',
  TIERS: 'tiers',
  NEW: 'new_customers',
  EXISTING: 'existing_customers',
});
const APPLICABLE_TO = Object.freeze({ ALL: 'all', PRODUCTS: 'products', CATEGORIES: 'categories', TIERS: 'tiers' });

const round2 = (v) => Math.round((Number(v) || 0) * 100) / 100;
const clamp = (v, min, max) => Math.min(Math.max(Number(v) || 0, min), max);

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Map any historical/legacy promotion shape onto the canonical engine shape. */
function normalizePromotion(promo) {
  if (!promo) return null;
  const p = promo || {};
  const type = String(p.discountType || p.type || 'percentage');
  const value = Number(p.discountValue ?? p.value ?? 0) || 0;

  const canonical = {
    id: p.id,
    companyId: p.companyId || p.company_id || null,
    name: p.name || 'Promotion',
    description: p.description || null,
    code: (p.promotionCode || p.code || '').trim().toUpperCase() || null,
    channel: String(p.channel || 'BOTH').toUpperCase(),
    discountType: type,
    discountValue: value,
    valueType: p.valueType || (type === 'fixed' || type === 'fixed_amount' || type === 'fixed_price' ? 'fixed' : 'percentage'),
    status: p.status || 'draft',
    isActive: p.isActive !== undefined ? !!p.isActive : p.is_active !== undefined ? !!p.is_active : true,
    isAutoApply: p.isAutoApply !== undefined ? !!p.isAutoApply : (p.is_auto_apply !== undefined ? !!p.is_auto_apply : true),
    minimumOrderAmount: Number(p.minimumOrderAmount ?? p.min_order_amount ?? p.minPurchase ?? 0) || 0,
    maximumDiscountAmount: Number(p.maximumDiscountAmount ?? p.max_discount_amount ?? p.maxDiscount ?? 0) || 0,
    usageLimit: Number(p.usageLimit ?? p.usage_limit ?? p.maxUses ?? 0) || 0,
    usageLimitPerCustomer: Number(p.usageLimitPerCustomer ?? p.per_customer_limit ?? 1),
    applicableTo: p.applicableTo || p.applicable_to || (p.categoryId ? APPLICABLE_TO.CATEGORIES : APPLICABLE_TO.ALL),
    productIds: p.productIds || p.applicable_products || [],
    categoryIds: p.categoryIds || p.applicable_categories || (p.categoryId ? [p.categoryId] : []),
    tierIds: p.tierIds || p.applicable_tiers || p.tier_ids_json || [],
    customerScope: p.customerScope || p.customer_scope || CUSTOMER_SCOPES.ALL,
    customerIds: p.customerIds || p.customer_ids || [],
    priority: Number(p.priority ?? 0) || 0,
    stackable: p.stackable !== undefined ? !!p.stackable : p.stackingRule === 'stackable',
    startsAt: p.startsAt || p.starts_at || null,
    endsAt: p.endsAt || p.ends_at || p.expiresAt || null,
    pausedAt: p.pausedAt || p.paused_at || null,
    cancelledAt: p.cancelledAt || p.cancelled_at || null,
    usedCount: Number(p.usedCount ?? p.used_count ?? p.currentUses ?? 0) || 0,
    buyXQty: Number(p.buyXQty ?? p.buy_x_qty ?? 0) || 0,
    getYQty: Number(p.getYQty ?? p.get_y_qty ?? 0) || 0,
    getYDiscount: Number(p.getYDiscount ?? p.get_y_discount ?? 100),
    createdAt: p.createdAt || p.created_at || null,
    updatedAt: p.updatedAt || p.updated_at || null,
  };
  return canonical;
}

/** Derive effective status from stored state — never trust a lone frontend flag. */
function deriveStatus(promo, now = new Date()) {
  const p = normalizePromotion(promo);
  if (!p) return 'draft';
  if (p.cancelledAt) return 'cancelled';
  if (p.status === 'cancelled') return 'cancelled';
  if (p.pausedAt) return 'paused';
  if (p.status === 'paused') return 'paused';
  if (p.status === 'draft') return 'draft';

  const t = new Date(now).getTime();
  const start = p.startsAt ? new Date(p.startsAt).getTime() : null;
  const end = p.endsAt ? new Date(p.endsAt).getTime() : null;
  if (start !== null && !Number.isNaN(start) && t < start) return 'scheduled';
  if (end !== null && !Number.isNaN(end) && t > end) return 'expired';
  if (p.isActive === false) return 'draft';
  return 'active';
}

function isChannelEligible(promo, channel) {
  const p = normalizePromotion(promo);
  if (!p) return false;
  const ch = String(channel || '').toUpperCase();
  if (p.channel === CHANNELS.BOTH) return true;
  return p.channel === ch;
}

function isDateEligible(promo, now = new Date()) {
  return deriveStatus(promo, now) === 'active';
}

function isCustomerInScope(promo, customer, customerTierIds = []) {
  const p = normalizePromotion(promo);
  if (!p) return false;
  const customerId = customer?.id || customer?.customerId || customer;
  const createdAt = customer?.createdAt || customer?.created_at || null;

  switch (p.customerScope) {
    case CUSTOMER_SCOPES.CUSTOMERS:
      return p.customerIds.length === 0 || p.customerIds.includes(String(customerId));
    case CUSTOMER_SCOPES.TIERS: {
      const tiers = (customerTierIds && customerTierIds.length ? customerTierIds : p.tierIds || []);
      if (p.tierIds.length === 0) return true;
      return (tiers || []).some((t) => p.tierIds.includes(String(t)));
    }
    case CUSTOMER_SCOPES.NEW: {
      if (!createdAt) return false;
      const days = Math.max(0, (Date.now() - new Date(createdAt).getTime()) / 86400000);
      return days <= 90;
    }
    case CUSTOMER_SCOPES.EXISTING: {
      if (!createdAt) return true;
      const days = Math.max(0, (Date.now() - new Date(createdAt).getTime()) / 86400000);
      return days > 90;
    }
    case CUSTOMER_SCOPES.ALL:
    default:
      return true;
  }
}

function isLineInScope(promo, line) {
  const p = normalizePromotion(promo);
  if (!p || !line) return false;
  const productId = line.productId || line.product_id || line.id || null;
  const category = line.category || line.categoryId || line.category_id || null;
  switch (p.applicableTo) {
    case APPLICABLE_TO.PRODUCTS:
      if (!productId) return false;
      return p.productIds.length === 0 || p.productIds.includes(String(productId));
    case APPLICABLE_TO.CATEGORIES:
      if (!category) return p.categoryIds.length === 0;
      return p.categoryIds.length === 0 || p.categoryIds.includes(String(category));
    case APPLICABLE_TO.TIERS:
      // Tier scope is resolved per customer; treat all lines as eligible.
      return true;
    case APPLICABLE_TO.ALL:
    default:
      return true;
  }
}

/** Per-line discount (pre caps) for one promotion. */
function computeLineDiscount(promo, line) {
  const p = normalizePromotion(promo);
  const lineTotal = round2(Number(line.lineTotal ?? (Number(line.quantity) || 1) * (Number(line.unitPrice) || 0)));
  const quantity = Math.max(1, Number(line.quantity) || 1);
  const unitPrice = Number(line.unitPrice ?? line.originalUnitPrice ?? 0) || 0;

  switch (p.discountType) {
    case DISCOUNT_TYPES.PERCENTAGE:
    case DISCOUNT_TYPES.COUPON:
    case DISCOUNT_TYPES.CAMPAIGN:
    case DISCOUNT_TYPES.TIERED:
    case DISCOUNT_TYPES.CATEGORY:
    case DISCOUNT_TYPES.BRAND:
    case DISCOUNT_TYPES.BUNDLE:
      return round2(lineTotal * (p.discountValue / 100));

    case DISCOUNT_TYPES.FIXED_AMOUNT:
    case DISCOUNT_TYPES.FIXED:
      // Order-level value — caller distributes proportionally; per line we
      // report the share based on line weight.
      return round2(lineTotal * (p.discountValue / 100));

    case DISCOUNT_TYPES.FIXED_PRICE: {
      if (unitPrice <= 0) return 0;
      const net = clamp(p.discountValue, 0, unitPrice);
      return round2((unitPrice - net) * quantity);
    }

    case DISCOUNT_TYPES.BUY_X_GET_Y: {
      if (!p.buyXQty || !p.getYQty || quantity < p.buyXQty) return 0;
      // The getY items are free (or at getYDiscount off) at the unit price.
      return round2(unitPrice * p.getYQty * ((p.getYDiscount ?? 100) / 100));
    }

    default:
      return 0;
  }
}

/** Cap a promotion's total discount at its maximumDiscountAmount. */
function capPromotionDiscount(promo, discount) {
  const p = normalizePromotion(promo);
  if (p.maximumDiscountAmount > 0) return Math.min(discount, p.maximumDiscountAmount);
  return discount;
}

/**
 * Evaluate one promotion against an order context.
 * @returns {{eligible:boolean, reason?:string, discount:number, lines:Array}}
 */
function evaluatePromotion(promo, ctx) {
  const p = normalizePromotion(promo);
  const result = { eligible: false, reason: '', discount: 0, lines: [] };

  if (!p) { result.reason = 'missing'; return result; }

  // ── Hard gates ──────────────────────────────────────────────────────────
  const status = deriveStatus(p, ctx.now);
  if (status !== 'active') { result.reason = status; return result; }

  if (!isChannelEligible(p, ctx.channel)) { result.reason = 'channel'; return result; }

  if (p.minimumOrderAmount > 0 && ctx.subtotal < p.minimumOrderAmount) {
    result.reason = 'min_order'; return result;
  }

  if (!isCustomerInScope(p, ctx.customer, ctx.customerTierIds)) { result.reason = 'customer_scope'; return result; }

  // Usage limits (as known to the caller — the DB function re-validates atomically).
  if (p.usageLimit > 0) {
    const used = ctx.usageByPromotion?.[p.id] ?? p.usedCount ?? 0;
    if (used >= p.usageLimit) { result.reason = 'limit_reached'; return result; }
  }
  if (p.usageLimitPerCustomer > 0 && ctx.customer) {
    const customerId = ctx.customer?.id || ctx.customer?.customerId || ctx.customer;
    const usedByCustomer = ctx.customerUsageByPromotion?.[p.id] ?? 0;
    if (usedByCustomer >= p.usageLimitPerCustomer) { result.reason = 'per_customer_limit'; return result; }
  }

  // Code-based promotions require the code; auto promotions don't.
  const isCodeBased = p.isAutoApply === false;
  if (isCodeBased) {
    if (!ctx.promotionCode) { result.reason = 'code_required'; return result; }
    const provided = String(ctx.promotionCode || '').trim().toUpperCase();
    if (!p.code || provided !== p.code) { result.reason = 'invalid_code'; return result; }
  } else if (ctx.promotionCode) {
    // A code was supplied but this is an auto promotion — only accept when the
    // code actually matches, otherwise leave it to the code-based promotions.
    const provided = String(ctx.promotionCode || '').trim().toUpperCase();
    if (p.code && provided !== p.code) { result.reason = 'code_mismatch'; return result; }
  }

  // ── Eligible lines ──────────────────────────────────────────────────────
  const scopedLines = ctx.items.filter((line) => isLineInScope(p, line));
  if (scopedLines.length === 0) { result.reason = 'no_lines'; return result; }

  const scopedSubtotal = round2(scopedLines.reduce((s, l) => s + Number(l.lineTotal ?? 0), 0));

  // ── Discount calculation ────────────────────────────────────────────────
  let discount = 0;
  const lineDiscounts = new Map();

  if (p.discountType === DISCOUNT_TYPES.FIXED_AMOUNT || p.discountType === DISCOUNT_TYPES.FIXED) {
    // Order-level fixed discount distributed proportionally across scoped lines.
    const target = Math.min(p.discountValue, scopedSubtotal);
    for (const line of scopedLines) {
      const lineTotal = Number(line.lineTotal ?? 0);
      const share = scopedSubtotal > 0 ? round2(target * (lineTotal / scopedSubtotal)) : 0;
      if (share > 0) lineDiscounts.set(line._key || line.productId || line.name, share);
    }
    discount = target;
  } else {
    for (const line of scopedLines) {
      const lineDiscount = computeLineDiscount(p, line);
      if (lineDiscount > 0) {
        lineDiscounts.set(line._key || line.productId || line.name, lineDiscount);
        discount += lineDiscount;
      }
    }
  }

  discount = round2(discount);
  discount = capPromotionDiscount(p, discount);
  discount = clamp(discount, 0, ctx.subtotal);

  if (discount <= 0) { result.reason = 'no_discount'; return result; }

  result.eligible = true;
  result.discount = discount;
  result.lines = scopedLines.map((line) => {
    const key = line._key || line.productId || line.name;
    const lineTotal = Number(line.lineTotal ?? 0);
    const amount = round2(lineDiscounts.get(key) ?? 0);
    const pct = lineTotal > 0 ? round2((amount / lineTotal) * 100) : 0;
    return {
      _key: key,
      productId: line.productId || line.product_id || line.id || null,
      name: line.name,
      quantity: line.quantity,
      originalUnitPrice: round2(line.unitPrice),
      discountPercent: pct,
      discountAmount: amount,
      netUnitPrice: round2((lineTotal - amount) / Math.max(1, line.quantity)),
      promotionId: p.id,
      promotionCode: p.code,
    };
  });
  return result;
}

/**
 * Main calculation API.
 *
 * @param {object} args
 * @param {string} args.companyId       Company scope (never cross-company).
 * @param {object} [args.customer]      { id, createdAt } of the customer.
 * @param {string[]} [args.customerTierIds]
 * @param {string}  args.channel        'ERP' | 'PORTAL' | 'BOTH'
 * @param {Array}   args.items          [{ productId, name, quantity, unitPrice, lineTotal?, category? }]
 * @param {number}  args.subtotal       Gross subtotal (sum of line totals).
 * @param {string}  [args.promotionCode] Optional promo code.
 * @param {Array}   args.promotions     Raw promotion records (all channels).
 * @param {object}  [args.usageByPromotion]        { [promotionId]: usedCount }
 * @param {object}  [args.customerUsageByPromotion] { [promotionId]: countForThisCustomer }
 * @param {Date|string} [args.now]
 * @param {object}  [args.options]      { stackingRule, maxStacked, maxTotalDiscountPct }
 *
 * @returns {object} { applied, promotions, lines, subtotal, discountTotal,
 *                     subtotalBeforeDiscount, subtotalAfterDiscount,
 *                     taxableSubtotal, grandTotal, metadata }
 */
function calculatePromotion({
  companyId,
  customer = null,
  customerTierIds = [],
  channel = 'PORTAL',
  items = [],
  subtotal,
  promotionCode = null,
  promotions = [],
  usageByPromotion = {},
  customerUsageByPromotion = {},
  now = new Date(),
  options = {},
}) {
  const ctx = {
    companyId,
    customer,
    customerTierIds: customerTierIds || [],
    channel: String(channel || 'PORTAL').toUpperCase(),
    items,
    subtotal: round2(subtotal ?? items.reduce((s, l) => s + Number(l.lineTotal ?? 0), 0)),
    promotionCode: promotionCode ? String(promotionCode).trim().toUpperCase() : null,
    usageByPromotion: usageByPromotion || {},
    customerUsageByPromotion: customerUsageByPromotion || {},
    now,
  };

  const opts = {
    stackingRule: options.stackingRule || 'stackable',
    maxStacked: Math.max(1, Number(options.maxStacked) || 3),
    maxTotalDiscountPct: clamp(options.maxTotalDiscountPct != null ? Number(options.maxTotalDiscountPct) : 50, 0, 100),
  };

  const enrichedLines = ctx.items.map((line, idx) => ({
    _key: `${line.productId || line.name || idx}-${idx}`,
    ...line,
    lineTotal: round2(line.lineTotal ?? (Number(line.quantity) || 1) * (Number(line.unitPrice) || 0)),
  }));

  // 1. Evaluate every promotion (deduped by id so a record synced twice can
  //    never double-discount an order).
  const seenIds = new Set();
  const candidates = (promotions || [])
    .filter((p) => {
      const n = normalizePromotion(p);
      if (!n) return false;
      if (n.id && seenIds.has(n.id)) return false;
      if (n.id) seenIds.add(n.id);
      if (companyId && n.companyId && n.companyId !== companyId) return false; // cross-company block
      return true;
    })
    .map((p) => ({ promo: p, result: evaluatePromotion(p, { ...ctx, items: enrichedLines }) }))
    .filter(({ result }) => result.eligible);

  // 2. Order by priority (desc), then by discount (desc).
  candidates.sort((a, b) => {
    const pa = Number(normalizePromotion(a.promo).priority) || 0;
    const pb = Number(normalizePromotion(b.promo).priority) || 0;
    if (pa !== pb) return pb - pa;
    return b.result.discount - a.result.discount;
  });

  // 3. Stacking rules — never double-discount accidentally.
  let selected = [];
  if (candidates.length > 0) {
    if (opts.stackingRule === 'exclusive') {
      selected = [candidates[0]];
    } else if (opts.stackingRule === 'best_only') {
      selected = [candidates[0]];
    } else {
      const nonStackable = candidates.filter((c) => !normalizePromotion(c.promo).stackable);
      const stackable = candidates.filter((c) => normalizePromotion(c.promo).stackable);
      if (nonStackable.length > 0) {
        // Non-stackable promotions are mutually exclusive — best one wins.
        selected = [nonStackable[0]];
      } else {
        selected = stackable.slice(0, opts.maxStacked);
      }
    }
  }

  // 4. Compute final totals with cumulative caps.
  const subtotalBefore = ctx.subtotal;
  let discountTotal = 0;
  const appliedLines = new Map();
  const appliedPromotions = [];

  const maxTotalDiscount = round2(subtotalBefore * (opts.maxTotalDiscountPct / 100));

  for (const { promo, result } of selected) {
    const p = normalizePromotion(promo);
    let remaining = round2(maxTotalDiscount - discountTotal);
    if (remaining <= 0) break;
    const promoDiscount = Math.min(result.discount, remaining);
    if (promoDiscount <= 0) continue;

    // Distribute this promotion's line discounts, prorated if capped.
    const ratio = result.discount > 0 ? promoDiscount / result.discount : 0;
    for (const lineResult of result.lines) {
      // Key by the enriched line key (unique per cart line) so two lines for
      // the same product never merge into one audit-trail entry.
      const key = lineResult._key || lineResult.productId || lineResult.name;
      const prev = appliedLines.get(key) || { discountAmount: 0, netUnitPrice: 0, promotionId: null, promotionCode: null };
      const added = round2((lineResult.discountAmount || 0) * ratio);
      const originalUnitPrice = lineResult.originalUnitPrice;
      const quantity = Math.max(1, Number(lineResult.quantity) || 1);
      const originalLineTotal = round2(originalUnitPrice * quantity);
      const netLineTotal = clamp(originalLineTotal - (prev.discountAmount + added), 0, originalLineTotal);
      appliedLines.set(key, {
        ...prev,
        productId: lineResult.productId,
        name: lineResult.name,
        quantity,
        originalUnitPrice,
        discountAmount: round2(prev.discountAmount + added),
        netUnitPrice: round2(netLineTotal / quantity),
        promotionId: prev.promotionId || lineResult.promotionId,
        promotionCode: prev.promotionCode || lineResult.promotionCode,
        _originalLineTotal: originalLineTotal,
      });
    }

    discountTotal = round2(discountTotal + promoDiscount);
    appliedPromotions.push({
      id: p.id,
      name: p.name,
      code: p.code,
      discountType: p.discountType,
      discountValue: p.discountValue,
      discountAmount: promoDiscount,
      channel: p.channel,
      priority: p.priority,
      stackable: p.stackable,
    });
  }

  // 5. Final line set (net prices clamped at zero — never negative).
  const finalLines = enrichedLines.map((line) => {
    const key = line._key || line.productId || line.name;
    const applied = appliedLines.get(key) || null;
    const quantity = Math.max(1, Number(line.quantity) || 1);
    const originalLineTotal = round2(Number(line.lineTotal) || 0);
    const discountAmount = applied ? Math.min(applied.discountAmount, originalLineTotal) : 0;
    const netLineTotal = clamp(originalLineTotal - discountAmount, 0, originalLineTotal);
    return {
      productId: line.productId || line.product_id || line.id || null,
      name: line.name,
      quantity,
      unitPrice: round2(Number(line.unitPrice) || 0),
      originalUnitPrice: round2(Number(line.unitPrice) || 0),
      discountPercent: originalLineTotal > 0 ? round2((discountAmount / originalLineTotal) * 100) : 0,
      discountAmount,
      netUnitPrice: round2(netLineTotal / quantity),
      lineTotal: netLineTotal,
      promotionId: applied?.promotionId || null,
      promotionCode: applied?.promotionCode || null,
      // Selected variant identity survives promotion evaluation.
      ...(line.variantId || line.variant_id ? { variantId: String(line.variantId || line.variant_id) } : {}),
      category: line.category || null,
      priceSource: line.priceSource || 'master',
    };
  });

  discountTotal = round2(discountTotal);
  const subtotalAfter = clamp(subtotalBefore - discountTotal, 0, subtotalBefore);

  return {
    applied: discountTotal > 0,
    promotions: appliedPromotions,
    lines: finalLines,
    subtotal: subtotalBefore,
    discountTotal,
    subtotalBeforeDiscount: subtotalBefore,
    subtotalAfterDiscount: subtotalAfter,
    taxableSubtotal: subtotalAfter, // tax configuration is applied by the caller
    grandTotal: subtotalAfter,
    metadata: {
      engine: 'promotionEngine@1',
      stackingRule: opts.stackingRule,
      maxStacked: opts.maxStacked,
      maxTotalDiscountPct: opts.maxTotalDiscountPct,
      evaluated: candidates.length,
      appliedCount: appliedPromotions.length,
      now: new Date(now).toISOString(),
      invalidCode: promotionCode ? !appliedPromotions.some((ap) => ap.code === promotionCode) && candidates.length === 0 : false,
    },
  };
}

/**
 * Resolve authoritative unit prices for client-submitted line items.
 * Browser prices are never trusted; catalogMap is keyed by product id AND by
 * deterministic variant id (see services/catalogVariants.cjs), each providing
 * { sellingPrice } from ERP master data. A line that carries a variantId is
 * priced from THAT variant's master price — never flattened to the parent.
 */
function resolveAuthoritativePrices(items, catalogMap = {}) {
  if (!Array.isArray(items)) return [];
  return items.map((item) => {
    const productId = item.productId || item.product_id || item.id || null;
    const variantId = item.variantId || item.variant_id || null;
    // Security: neither productId nor variantId in the ERP catalog is ever
    // priced from the browser — price at 0 and flag it so the order is
    // obviously anomalous and rejected/flagged by sales. Browser prices are
    // only kept for genuine custom line items (no productId at all), which
    // the ERP sales team confirms before issuing a quotation.
    let entry = null;
    let priceSource = 'master';
    if (variantId && catalogMap[String(variantId)]) {
      entry = catalogMap[String(variantId)];
      priceSource = 'master_variant';
    } else if (productId) {
      entry = catalogMap[String(productId)] || null;
    }
    let price;
    if (entry) {
      price = Number(entry.sellingPrice ?? entry.selling_price ?? entry.price ?? 0) || 0;
    } else if (productId) {
      price = 0;
      priceSource = 'unknown_product';
    } else {
      price = Number(item.unitPrice ?? item.price ?? 0) || 0;
      priceSource = 'custom_line';
    }
    const quantity = Math.max(1, Number(item.quantity ?? item.qty ?? 1) || 1);
    const priceRounded = round2(price);
    return {
      productId,
      // Preserve the selected variant identity end-to-end (request -> sales
      // order) alongside its authoritatively resolved price.
      ...(variantId ? { variantId: String(variantId) } : {}),
      name: String(item.name || item.description || entry?.name || 'Item'),
      quantity,
      unitPrice: priceRounded,
      lineTotal: round2(priceRounded * quantity),
      category: item.category || entry?.category || entry?.type || null,
      priceSource,
    };
  }).filter((l) => l.name && l.quantity > 0);
}

module.exports = {
  CHANNELS,
  DISCOUNT_TYPES,
  CUSTOMER_SCOPES,
  APPLICABLE_TO,
  normalizePromotion,
  deriveStatus,
  isChannelEligible,
  isDateEligible,
  isCustomerInScope,
  isLineInScope,
  computeLineDiscount,
  capPromotionDiscount,
  evaluatePromotion,
  calculatePromotion,
  resolveAuthoritativePrices,
  round2,
};
