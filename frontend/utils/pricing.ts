import { logger } from '@/services/logger';
import type { Item, ItemType, ProductVariant } from '../types';

type VolumePricingTierLike = {
  minQty: number;
  price: number;
};

type PricingCarrier = {
  price?: number | null;
  selling_price?: number | null;
  sellingPrice?: number | null;
  calculated_price?: number | null;
  cost?: number | null;
  cost_price?: number | null;
  cost_per_unit?: number | null;
  costPrice?: number | null;
  rounding_difference?: number | null;
  smartPricingSnapshot?: {
    roundedPrice?: number | null;
    originalPrice?: number | null;
    baseCost?: number | null;
    roundingDifference?: number | null;
  } | null;
};

const normalizeTypeToken = (value: unknown): string => (
  String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
);

const ITEM_TYPE_ALIASES: Record<string, ItemType> = {
  raw: 'Raw Material',
  material: 'Raw Material',
  materials: 'Raw Material',
  consumable: 'Raw Material',
  consumables: 'Raw Material',
  'raw material': 'Raw Material',
  'raw materials': 'Raw Material',
  product: 'Product',
  products: 'Product',
  'finished good': 'Product',
  'finished goods': 'Product',
  'finished product': 'Product',
  'printing product': 'Product',
  stationery: 'Stationery',
  stationary: 'Stationery',
  service: 'Service',
  services: 'Service',
  'printing service': 'Service',
};

export function normalizeInventoryItemType(type?: unknown, classification?: unknown): ItemType {
  const candidates = [type, classification].map(normalizeTypeToken).filter(Boolean);

  for (const candidate of candidates) {
    const canonical = ITEM_TYPE_ALIASES[candidate];
    if (canonical) return canonical;
  }

  for (const candidate of candidates) {
    if (candidate.includes('service')) return 'Service';
    if (candidate.includes('stationer')) return 'Stationery';
    if (candidate.includes('product') || candidate.includes('finished')) return 'Product';
    if (candidate.includes('raw') || candidate.includes('material') || candidate.includes('consumable')) return 'Raw Material';
  }

  return 'Raw Material';
}

const hasFiniteNumber = (value: unknown): boolean => Number.isFinite(Number(value));

const toFiniteNumber = (value: unknown): number | undefined => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const pickPreferredNumber = (...values: Array<number | undefined>): number => {
  const positive = values.find((value) => value !== undefined && value > 0);
  if (positive !== undefined) return positive;

  const finite = values.find((value) => value !== undefined);
  return finite ?? 0;
};

export function resolveStoredSellingPrice(source?: PricingCarrier | null): number {
  if (!source) return 0;

  return pickPreferredNumber(
    toFiniteNumber(source.smartPricingSnapshot?.roundedPrice),
    toFiniteNumber(source.selling_price),
    toFiniteNumber((source as any).sellingPrice),
    toFiniteNumber(source.price),
    toFiniteNumber(source.calculated_price)
  );
}

export function resolveStoredCalculatedPrice(source?: PricingCarrier | null): number {
  if (!source) return 0;

  const roundedPrice = resolveStoredSellingPrice(source);
  const persistedDifference = toFiniteNumber(source.rounding_difference);
  const inferredCalculated = roundedPrice > 0 && persistedDifference !== undefined
    ? roundedPrice - persistedDifference
    : undefined;

  return pickPreferredNumber(
    toFiniteNumber(source.smartPricingSnapshot?.originalPrice),
    toFiniteNumber(source.calculated_price),
    inferredCalculated,
    roundedPrice
  );
}

export function resolveStoredRoundingDifference(source?: PricingCarrier | null): number {
  if (!source) return 0;

  const explicitRoundingDifference = toFiniteNumber(
    source.smartPricingSnapshot?.roundingDifference ?? source.rounding_difference
  );

  if (explicitRoundingDifference !== undefined) {
    return Math.round((explicitRoundingDifference + Number.EPSILON) * 100) / 100;
  }

  const roundedPrice = resolveStoredSellingPrice(source);
  const calculatedPrice = resolveStoredCalculatedPrice(source);

  if (roundedPrice > 0 && calculatedPrice > 0) {
    return Math.round(((roundedPrice - calculatedPrice) + Number.EPSILON) * 100) / 100;
  }

  return 0;
}

export function resolveStoredCost(source?: PricingCarrier | null): number {
  if (!source) return 0;

  return pickPreferredNumber(
    toFiniteNumber(source.smartPricingSnapshot?.baseCost),
    toFiniteNumber(source.cost_price),
    toFiniteNumber(source.cost_per_unit),
    toFiniteNumber(source.cost),
    toFiniteNumber(source.costPrice)
  );
}

export function normalizeStoredPricing<T extends PricingCarrier>(source: T): T {
  if (!source) return source;

  const sellingPrice = resolveStoredSellingPrice(source);
  const calculatedPrice = resolveStoredCalculatedPrice(source);
  const cost = resolveStoredCost(source);

  const normalized = { ...source } as T;
  const hasAnyPrice = hasFiniteNumber(source.price) || hasFiniteNumber(source.selling_price) || hasFiniteNumber(source.smartPricingSnapshot?.roundedPrice);
  const hasAnyCalculated = hasFiniteNumber(source.calculated_price) || hasFiniteNumber(source.smartPricingSnapshot?.originalPrice);
  const hasAnyCost = hasFiniteNumber(source.cost) || hasFiniteNumber(source.cost_price) || hasFiniteNumber(source.cost_per_unit) || hasFiniteNumber(source.smartPricingSnapshot?.baseCost) || hasFiniteNumber(source.costPrice);

  if (hasAnyPrice) {
    normalized.price = sellingPrice as T['price'];
    normalized.selling_price = sellingPrice as T['selling_price'];
    normalized.sellingPrice = sellingPrice as T['sellingPrice'];
  }

  if (hasAnyCalculated || hasAnyPrice) {
    normalized.calculated_price = calculatedPrice as T['calculated_price'];
  }

  if (hasAnyCost) {
    normalized.cost = cost as T['cost'];
    normalized.cost_price = cost as T['cost_price'];
    normalized.costPrice = cost as T['costPrice'];
  }

  return normalized;
}

export function normalizeInventoryItemPricing(item: Item): Item {
  const normalizedItem = normalizeStoredPricing(item);
  const stock = toFiniteNumber(normalizedItem.stock) ?? toFiniteNumber(normalizedItem.quantity) ?? 0;
  const normalizedWithType = {
    ...normalizedItem,
    type: normalizeInventoryItemType(normalizedItem.type, normalizedItem.classification),
    stock,
    quantity: stock,
  };
  const hasVariants = item.variants && item.variants.length > 0;
  
  if (!hasVariants) {
    return normalizedWithType;
  }

  return {
    ...normalizedWithType,
    isVariantParent: true,
    variants: item.variants.map((variant) => normalizeStoredPricing(variant as ProductVariant))
  };
}

/**
 * Resolve unit price given item, quantity and optional variant.
 * Respects item.allowVolumePricing and per-variant tiers.
 * Enforces a minimumCostThreshold by clamping tier price if below threshold.
 * Does not mutate item or variant objects.
 */
export function getUnitPrice(
  item: Item,
  quantity: number,
  variantId?: string,
  options?: { minimumCostThreshold?: number }
): number {
  const minThreshold = options?.minimumCostThreshold ?? 0;

  if (!item) return 0;
  let basePrice = resolveStoredSellingPrice(item);
  let tiers: VolumePricingTierLike[] | undefined = item.volumePricing;

  if (variantId && item.variants && item.variants.length > 0) {
    const variant = (item.variants as ProductVariant[]).find(v => v.id === variantId);
    if (variant) {
      basePrice = resolveStoredSellingPrice(variant) || basePrice;
      tiers = variant.volumePricing ?? item.volumePricing;
    }
  }

  if (!item.allowVolumePricing || !tiers || tiers.length === 0) {
    return basePrice;
  }

  if (!Number.isFinite(quantity) || quantity <= 0) return basePrice;

  const applicable = tiers
    .filter(t => Number.isFinite(t.minQty) && quantity >= t.minQty)
    .sort((a, b) => b.minQty - a.minQty)[0];

  const resolved = applicable ? Number(applicable.price) : basePrice;

  if (Number.isFinite(minThreshold) && resolved < minThreshold) {
    return minThreshold;
  }

  return resolved;
}

export function formatVolumePricingHint(item: Item, variantId?: string): string | null {
  let tiers = item.volumePricing;
  if (variantId && item.variants && item.variants.length > 0) {
    const variant = item.variants.find(v => v.id === variantId);
    if (variant && variant.volumePricing && variant.volumePricing.length) tiers = variant.volumePricing;
  }
  if (!tiers || tiers.length === 0) return null;

  const sorted = [...tiers].sort((a, b) => a.minQty - b.minQty);
  const parts = sorted.map((t, idx) => {
    const next = sorted[idx + 1];
    if (next) return `${t.minQty}–${next.minQty - 1}: ${t.price}`;
    return `${t.minQty}+: ${t.price}`;
  });
  return parts.join(' | ');
}

/**
 * Calculate item financials (cost, price, adjustments) based on pages, pricing config, inventory, and market adjustments.
 */
export function calculateItemFinancials(
  pages: number,
  pricingConfig: any,
  inventory: any[],
  adjustments: any[]
): {
  cost: number;
  price: number;
  adjustmentSnapshots: any[];
  transactionAdjustmentSnapshots: any[];
  breakdown: { category: string; amount: number }[];
} {
  if (!pricingConfig || !inventory) {
    return {
      cost: 0,
      price: 0,
      adjustmentSnapshots: [],
      transactionAdjustmentSnapshots: [],
      breakdown: []
    };
  }

  const { paperId, tonerId, finishingOptions, marketAdjustment, manualOverride, pricingMethod } = pricingConfig;
  const totalPages = pages || 1;
  const sheetCount = pricingMethod === 'per_sheet' ? totalPages : Math.ceil(totalPages / 2);

  // Find paper and toner from inventory
  const paper = paperId ? inventory.find((item: any) => item.id === paperId) : null;
  const toner = tonerId ? inventory.find((item: any) => item.id === tonerId) : null;

  // Calculate material costs
  const paperCostPerPage = paper ? Number(paper.cost_price ?? paper.cost_per_unit ?? paper.cost ?? 0) : 0;
  const tonerCostPerPage = toner ? Number(toner.cost_price ?? toner.cost_per_unit ?? toner.cost ?? 0) : 0;
  const paperTotal = paperCostPerPage * sheetCount;
  const tonerTotal = tonerCostPerPage * totalPages;

  // Calculate finishing costs
  let finishingTotal = 0;
  const finishingSnapshots: any[] = [];
  if (finishingOptions && finishingOptions.length > 0) {
    for (const opt of finishingOptions) {
      if (opt.id && inventory) {
        const finishItem = inventory.find((item: any) => item.id === opt.id);
        if (finishItem) {
          const cost = Number(finishItem.cost_price || finishItem.cost || 0) * (opt.quantity || 1);
          finishingTotal += cost;
          finishingSnapshots.push({
            name: opt.name || finishItem.name,
            type: 'material',
            value: cost,
            calculatedAmount: cost
          });
        }
      }
    }
  }

  // Calculate total cost
  const totalCost = paperTotal + tonerTotal + finishingTotal;

  // PHASE 1: Base Markup Layer
  const baseMarkupPrice = calculateSellingPriceFromMarkup(totalCost, pricingConfig?.markupPercent);
  if (pricingConfig?.markupPercent) {
    logger.debug(`[Pricing Engine] Base Markup Layer (${pricingConfig.markupPercent}%): ${baseMarkupPrice}`);
  }

  // Apply market adjustment
  let price = totalCost;
  let adjustmentTotal = 0;
  const adjustmentSnapshots: any[] = [];

  if (marketAdjustment && marketAdjustment !== 0) {
    adjustmentTotal = totalCost * (marketAdjustment / 100);
    price += adjustmentTotal;
    adjustmentSnapshots.push({
      name: 'Market Adjustment',
      type: 'percentage',
      value: marketAdjustment,
      percentage: marketAdjustment,
      calculatedAmount: adjustmentTotal
    });
  }

  // Apply adjustments from market adjustments array
  const transactionAdjustmentSnapshots: any[] = [];
  const breakdown: { category: string; amount: number }[] = [
    { category: 'Paper', amount: paperTotal },
    { category: 'Toner', amount: tonerTotal },
    { category: 'Finishing', amount: finishingTotal }
  ];

  if (adjustments && adjustments.length > 0) {
    for (const adj of adjustments) {
      const adjAmount = adj.percentage
        ? totalCost * ((adj.percentage || adj.value || 0) / 100)
        : (adj.value || 0);
      adjustmentTotal += adjAmount;
      price += adjAmount;

      const snapshot = {
        name: adj.name,
        type: adj.percentage ? 'percentage' : 'fixed',
        value: adj.value || 0,
        percentage: adj.percentage,
        calculatedAmount: adjAmount
      };
      adjustmentSnapshots.push(snapshot);
      transactionAdjustmentSnapshots.push(snapshot);
    }
  }

  return {
    cost: totalCost,
    price,
    adjustmentSnapshots,
    transactionAdjustmentSnapshots,
    breakdown
  };
}

export default getUnitPrice;

/**
 * Calculate selling price from cost plus markup percentage.
 * Formula: SP = CP × (1 + Markup/100)
 */
export function calculateSellingPriceFromMarkup(
  costPrice: number,
  markupPercent?: number
) {
  const markup = markupPercent ?? 0;
  return costPrice * (1 + markup / 100);
}

/**
 * @deprecated Use calculateSellingPriceFromMarkup instead
 */
export const calculateBaseSellingPrice = calculateSellingPriceFromMarkup;

/**
 * Calculate the price display for a parent product with variants.
 * If all variants have the same price, returns that price.
 * If variants have different prices, returns a price range "minPrice - maxPrice".
 * For items without variants, returns the item's own price.
 */
export function getParentProductPriceDisplay(item: Item): number | { min: number; max: number } | null {
  // If not a variant parent or no variants, return the item's own price
  if (!item.isVariantParent || !item.variants || item.variants.length === 0) {
    return item.price || null;
  }

  // Get all variant prices, using resolveStoredSellingPrice for each variant
  const variantPrices = item.variants
    .map(variant => resolveStoredSellingPrice(variant as PricingCarrier))
    .filter(price => price > 0)
    .sort((a, b) => a - b);

  if (variantPrices.length === 0) {
    return item.price || null;
  }

  // If all prices are the same, return the single price
  const minPrice = variantPrices[0];
  const maxPrice = variantPrices[variantPrices.length - 1];

  if (minPrice === maxPrice) {
    return minPrice;
  }

  // If prices differ, return the range
  return { min: minPrice, max: maxPrice };
}

/**
 * Format the parent product price for display in UI.
 * Returns a string like "K500" for single price or "K200 - K500" for price range.
 */
export function formatParentProductPrice(item: Item, currency: string = '$'): string {
  const priceInfo = getParentProductPriceDisplay(item);

  if (priceInfo === null) {
    return `${currency}0.00`;
  }

  if (typeof priceInfo === 'number') {
    return `${currency}${priceInfo.toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
  }

  const minFormatted = priceInfo.min.toLocaleString(undefined, { minimumFractionDigits: 2 });
  const maxFormatted = priceInfo.max.toLocaleString(undefined, { minimumFractionDigits: 2 });
  return `${currency}${minFormatted} - ${currency}${maxFormatted}`;
}

/**
 * Get the cost price for material items (Material or Raw Material types).
 * For variant parents, returns the cost range from variants.
 * Returns number for single cost or { min, max } for range.
 */
export function getMaterialItemCostDisplay(item: Item): number | { min: number; max: number } | null {
  // If not a variant parent or no variants, return the item's own cost
  if (!item.isVariantParent || !item.variants || item.variants.length === 0) {
    return resolveStoredCost(item as PricingCarrier) || null;
  }

  // Get all variant costs
  const variantCosts = item.variants
    .map(variant => resolveStoredCost(variant as PricingCarrier))
    .filter(cost => cost > 0)
    .sort((a, b) => a - b);

  if (variantCosts.length === 0) {
    return resolveStoredCost(item as PricingCarrier) || null;
  }

  // If all costs are the same, return the single cost
  const minCost = variantCosts[0];
  const maxCost = variantCosts[variantCosts.length - 1];

  if (minCost === maxCost) {
    return minCost;
  }

  // If costs differ, return the range
  return { min: minCost, max: maxCost };
}

/**
 * Format the material item cost price for display in UI.
 * Returns a string like "K500" for single cost or "K200 - K500" for cost range.
 */
export function formatMaterialItemCost(item: Item, currency: string = '$'): string {
  const costInfo = getMaterialItemCostDisplay(item);

  if (costInfo === null) {
    return `${currency}0.00`;
  }

  if (typeof costInfo === 'number') {
    return `${currency}${costInfo.toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
  }

  const minFormatted = costInfo.min.toLocaleString(undefined, { minimumFractionDigits: 2 });
  const maxFormatted = costInfo.max.toLocaleString(undefined, { minimumFractionDigits: 2 });
  return `${currency}${minFormatted} - ${currency}${maxFormatted}`;
}

const DEFAULT_REAM_SIZE = 500;
const DEFAULT_TONER_CAPACITY = 20000;

function findDefaultPaper(items: Item[]): Item | undefined {
  return items.find(i =>
    i.name?.toLowerCase().includes('paper') ||
    i.category?.toLowerCase().includes('paper')
  );
}

function findDefaultToner(items: Item[]): Item | undefined {
  return items.find(i =>
    i.name?.toLowerCase().includes('toner') ||
    i.category?.toLowerCase().includes('toner')
  );
}

function resolveItemCost(item: Item): number {
  return Number((item as any).cost_price ?? (item as any).cost_per_unit ?? (item as any).cost ?? 0);
}

function resolveConversionRate(item: Item): number {
  return Number((item as any).conversionRate ?? (item as any).conversion_rate ?? DEFAULT_REAM_SIZE);
}

export function calculatePhotocopyCostPerPage(inventory: Item[]): number {
  const paper = findDefaultPaper(inventory);
  const toner = findDefaultToner(inventory);
  const paperUnitCost = paper ? resolveItemCost(paper) : 0;
  const conversionRate = paper ? resolveConversionRate(paper) : DEFAULT_REAM_SIZE;
  const paperCostPerPage = conversionRate > 0 ? paperUnitCost / (conversionRate * 2) : 0;
  let tonerCostPerPage = 0;
  if (toner) {
    const perUnitCost = Number((toner as any).cost_per_unit ?? 0);
    if (perUnitCost > 0) {
      tonerCostPerPage = perUnitCost;
    } else {
      const tonerUnitCost = resolveItemCost(toner);
      const tonerConversionRate = Number((toner as any).conversionRate ?? (toner as any).conversion_rate ?? DEFAULT_TONER_CAPACITY);
      tonerCostPerPage = tonerConversionRate > 0 ? tonerUnitCost / tonerConversionRate : 0;
    }
  }
  return parseFloat((paperCostPerPage + tonerCostPerPage).toFixed(4));
}

export function calculateTypePrintingCostPerPage(inventory: Item[]): number {
  return calculatePhotocopyCostPerPage(inventory);
}
