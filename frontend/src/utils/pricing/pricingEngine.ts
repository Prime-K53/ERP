import { getEffectiveMargin } from '../../../utils/getEffectiveMargin';
import { roundToCurrency, safeNumber } from './helpers';
import { calculateMargin } from '../../../utils/roundingUtils';
import {
  calculatePricingAdjustmentTotal,
  normalizePricingSnapshots,
  resolveVolumeMarginValue,
  getVolumeDiscountTiers,
} from '../../../utils/pricingEngineShared';
import {
  PricingInput,
  PricingResult,
  SnapshotEntry,
  EffectiveMargin,
  PricingBreakdown
} from './types';

export const PRICING_ENGINE_VERSION = "1.0.0";

const validatePricingInput = (input: any): void => {
  if (input.adjustments !== undefined && !Array.isArray(input.adjustments)) {
    throw new Error("Invalid adjustments format: must be array of snapshots");
  }
  if (!input.context) {
    throw new Error("Pricing context is required");
  }
  if (input.baseCost == null || isNaN(input.baseCost)) {
    throw new Error("Invalid base cost");
  }
  if (input.baseCost < 0) {
    throw new Error("Base cost cannot be negative");
  }
};

const resolveMargin = async (
  itemId?: string | null,
  categoryId?: string | null
): Promise<{ margin: EffectiveMargin; shouldApply: boolean }> => {
  const margin = await getEffectiveMargin(itemId, categoryId);
  const shouldApply = margin.source !== 'system' || margin.margin_value > 0;
  return { margin, shouldApply };
};

const calculateMarginAmount = (baseCost: number, margin: EffectiveMargin): number => {
  return calculateMargin(baseCost, margin);
};

const normalizeSnapshots = (
  rawSnapshots: SnapshotEntry[] | undefined,
  baseAmount: number
): SnapshotEntry[] => {
  return normalizePricingSnapshots(rawSnapshots, baseAmount) as SnapshotEntry[];
};

const calculateAdjustmentTotal = (snapshots: SnapshotEntry[]): number => {
  return calculatePricingAdjustmentTotal(snapshots);
};

const resolveApplicableQtyTier = (
  tiers: Array<{ minQty: number; price: number }> | undefined,
  quantity: number
): { minQty: number; price: number } | undefined => {
  if (!tiers || tiers.length === 0) return undefined;
  return [...tiers]
    .filter((t) => Number.isFinite(t.minQty) && quantity >= t.minQty)
    .sort((a, b) => b.minQty - a.minQty)[0];
};

export async function calculateSellingPrice(
  input: PricingInput
): Promise<PricingResult> {
  validatePricingInput(input);

  const {
    itemId,
    categoryId,
    baseCost,
    basePrice,
    quantity = 1,
    pages,
    adjustments,
    context,
    quantityTiers,
    allowQuantityTiering
  } = input;

  const safeCost = safeNumber(baseCost, 0);
  const safeQty = Math.max(1, Math.floor(safeNumber(quantity, 1)));
  const initialBase = safeNumber(basePrice, safeCost);

  const normalizedAdjustments = normalizeSnapshots(adjustments, initialBase);
  const adjustmentTotal = calculateAdjustmentTotal(normalizedAdjustments);
  const costAfterAdjustments = safeCost + adjustmentTotal;

  // -- Step 1: Resolve pre-discount unit price --
  // Priority: quantity tier > manual basePrice > margin-based calculation
  let preDiscountPrice: number;
  let marginAmount = 0;
  let profitMarginSnapshot: SnapshotEntry | null = null;

  const applicableTier = allowQuantityTiering
    ? resolveApplicableQtyTier(quantityTiers, safeQty)
    : undefined;

  if (applicableTier) {
    // System A: quantity-based tiered pricing overrides
    preDiscountPrice = applicableTier.price;
    marginAmount = roundToCurrency(preDiscountPrice - costAfterAdjustments);
  } else if (basePrice != null && !isNaN(basePrice) && basePrice > 0) {
    // Manual selling price
    preDiscountPrice = basePrice;
    marginAmount = roundToCurrency(preDiscountPrice - costAfterAdjustments);
  } else {
    // Margin-based pricing (cost + adjustments + markup)
    const { margin, shouldApply } = await resolveMargin(itemId, categoryId);

    if (shouldApply) {
      marginAmount = calculateMarginAmount(costAfterAdjustments, margin);
      profitMarginSnapshot = {
        name: 'Profit Margin',
        type: margin.margin_type === 'percentage' ? 'PERCENTAGE' : 'FIXED',
        value: margin.margin_value,
        percentage: margin.margin_type === 'percentage' ? margin.margin_value : undefined,
        calculatedAmount: roundToCurrency(marginAmount)
      };
    }

    preDiscountPrice = costAfterAdjustments + marginAmount;
  }

  // Build snapshot array: market adjustments + profit margin
  let finalSnapshots = [...normalizedAdjustments];
  if (profitMarginSnapshot) {
    finalSnapshots = finalSnapshots.filter(s => s.name !== 'Profit Margin');
    finalSnapshots.push(profitMarginSnapshot);
  }

  // -- Step 2: Apply volume / run-length discount to price (System B) --
  // Volume discount is a % off the current price, not a replacement of the margin.
  let volumeDiscountPct = 0;
  if ((context as string) !== 'EXAMINATION') {
    const pageCount = Number(pages) || 0;
    const discountTiers = getVolumeDiscountTiers(undefined);
    volumeDiscountPct = resolveVolumeMarginValue(pageCount, discountTiers);
  }

  let priceBeforeRounding = preDiscountPrice;
  if (volumeDiscountPct > 0) {
    const discountAmount = roundToCurrency(preDiscountPrice * (volumeDiscountPct / 100));
    priceBeforeRounding = roundToCurrency(preDiscountPrice - discountAmount);
    // Recalculate effective margin from discounted price
    marginAmount = roundToCurrency(priceBeforeRounding - costAfterAdjustments);
    if (marginAmount < 0) marginAmount = 0;
    // Update profit margin snapshot with effective margin
    if (profitMarginSnapshot) {
      profitMarginSnapshot.calculatedAmount = roundToCurrency(marginAmount);
      finalSnapshots = finalSnapshots.map(s =>
        s.name === 'Profit Margin' ? profitMarginSnapshot! : s
      );
    }
    // Inject Volume Discount as a separate snapshot entry
    finalSnapshots = finalSnapshots.filter(s => s.name !== 'Volume Discount');
    finalSnapshots.push({
      name: 'Volume Discount',
      type: 'PERCENTAGE',
      value: volumeDiscountPct,
      percentage: volumeDiscountPct,
      calculatedAmount: roundToCurrency(-discountAmount),
    });
  }

  const finalAdjustmentTotal = calculateAdjustmentTotal(finalSnapshots);

  const unitPrice = priceBeforeRounding;
  const totalPrice = roundToCurrency(unitPrice * safeQty);

  const breakdown: PricingBreakdown = {
    baseCost: safeCost,
    adjustments: adjustmentTotal,
    margin: marginAmount
  };

  return {
    unitPrice,
    totalPrice,
    cost: safeCost,
    marginAmount,
    adjustmentSnapshots: finalSnapshots,
    adjustmentTotal: finalAdjustmentTotal,
    roundingDifference: 0,
    breakdown,
    pricingVersion: PRICING_ENGINE_VERSION
  };
}

export async function calculateServicePrice(
  input: Omit<PricingInput, 'baseCost'> & {
    baseCost: number;
    pages: number;
    copies: number;
    inventory?: any[];
    bomTemplates?: any[];
    marketAdjustments?: any[];
  }
): Promise<PricingResult> {
  const { pages = 1, copies = 1, inventory = [], bomTemplates = [], marketAdjustments = [] } = input;
  const inputWithDefaults: PricingInput = {
    itemId: input.itemId,
    categoryId: input.categoryId,
    baseCost: input.baseCost,
    basePrice: input.basePrice,
    quantity: copies,
    adjustments: input.adjustments,
    context: 'SERVICE'
  };

  const basePricing = await calculateSellingPrice(inputWithDefaults);

  if (marketAdjustments && marketAdjustments.length > 0) {
    const activeAdjustments = marketAdjustments.filter((ma: any) => ma.active ?? ma.isActive);
    const serviceSnapshots = activeAdjustments.map((adj: any) => {
      const isPct = adj.type === 'PERCENTAGE' || adj.type === 'PERCENT' || adj.type === 'percentage';
      const value = safeNumber(adj.value, 0);
      const calculatedAmount = isPct
        ? roundToCurrency(basePricing.unitPrice * (value / 100))
        : value;

      return {
        name: adj.name || 'Market Adjustment',
        type: isPct ? 'PERCENTAGE' as const : 'FIXED' as const,
        value,
        percentage: isPct ? value : undefined,
        calculatedAmount: roundToCurrency(calculatedAmount * copies)
      };
    });

    const serviceAdjustments = calculateAdjustmentTotal(serviceSnapshots);
    const adjustedUnitPrice = basePricing.unitPrice + serviceAdjustments / copies;
    const adjustedTotalPrice = roundToCurrency(adjustedUnitPrice * copies);

    return {
      ...basePricing,
      unitPrice: roundToCurrency(adjustedUnitPrice),
      totalPrice: adjustedTotalPrice,
      adjustmentTotal: basePricing.adjustmentTotal + serviceAdjustments,
      roundingDifference: 0,
      adjustmentSnapshots: [...basePricing.adjustmentSnapshots, ...serviceSnapshots]
    };
  }

  return basePricing;
}

export async function calculatePOSPrice(
  itemId: string,
  categoryId: string,
  baseCost: number,
  basePrice?: number,
  quantity?: number,
  existingAdjustments?: SnapshotEntry[]
): Promise<PricingResult> {
  return calculateSellingPrice({
    itemId,
    categoryId,
    baseCost,
    basePrice,
    quantity,
    adjustments: existingAdjustments,
    context: 'POS'
  });
}

export async function calculateOrderPrice(
  itemId: string,
  categoryId: string,
  baseCost: number,
  basePrice?: number,
  quantity?: number,
  existingAdjustments?: SnapshotEntry[]
): Promise<PricingResult> {
  return calculateSellingPrice({
    itemId,
    categoryId,
    baseCost,
    basePrice,
    quantity,
    adjustments: existingAdjustments,
    context: 'ORDER'
  });
}
