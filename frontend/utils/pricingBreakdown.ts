import { PricingBreakdownSnapshot } from '../types';
import { resolveStoredRoundingDifference } from './pricing';
import { roundMoney } from './roundingUtils';

const PROFIT_MARGIN_LABEL = 'profit margin';
const ROUNDING_LABEL = 'rounding';

const toFiniteAmount = (value: unknown): number | undefined => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const toPositiveQuantity = (value: unknown): number => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return 1;
  return parsed;
};

const normalizeSnapshotName = (snapshot: any): string =>
  String(snapshot?.name || snapshot?.adjustmentName || '').trim().toLowerCase();

export const isProfitMarginSnapshot = (snapshot: any): boolean =>
  normalizeSnapshotName(snapshot) === PROFIT_MARGIN_LABEL;

export const isRoundingSnapshot = (snapshot: any): boolean => {
  if (Boolean(snapshot?.is_rounding ?? snapshot?.isRounding)) {
    return true;
  }

  const normalizedName = normalizeSnapshotName(snapshot);
  const normalizedId = String(snapshot?.id || snapshot?.adjustmentId || '').trim().toLowerCase();

  return normalizedId === 'auto-rounding'
    || normalizedName === ROUNDING_LABEL
    || normalizedName.includes('rounding')
    || normalizedName.includes('round up')
    || normalizedName.includes('round down');
};

export const getSnapshotCalculatedAmount = (snapshot: any): number => {
  const explicitAmount = [
    snapshot?.calculatedAmount,
    snapshot?.amount,
    snapshot?.total_amount,
    snapshot?.totalAmount,
    snapshot?.appliedAmount,
    snapshot?.totalApplied
  ]
    .map(toFiniteAmount)
    .find((value) => value !== undefined);

  if (explicitAmount !== undefined) {
    return roundMoney(explicitAmount);
  }

  const snapshotType = String(snapshot?.type || '').trim().toUpperCase();
  const snapshotValue = toFiniteAmount(snapshot?.value);
  const rawValue = toFiniteAmount(snapshot?.rawValue);

  if (snapshotValue !== undefined && (rawValue !== undefined || (snapshotType && !snapshotType.startsWith('PERCENT')))) {
    return roundMoney(snapshotValue);
  }

  return 0;
};

export const getMarketAdjustmentSnapshots = <T extends Record<string, any>>(snapshots: T[] = []): T[] => {
  return (Array.isArray(snapshots) ? snapshots : []).filter(
    (snapshot) => !isProfitMarginSnapshot(snapshot) && !isRoundingSnapshot(snapshot)
  );
};

export const getRoundingSnapshots = <T extends Record<string, any>>(snapshots: T[] = []): T[] => {
  return (Array.isArray(snapshots) ? snapshots : []).filter((snapshot) => isRoundingSnapshot(snapshot));
};

export const getProfitMarginAmountFromSnapshots = (snapshots: any[] = []): number | undefined => {
  const profitSnapshots = (Array.isArray(snapshots) ? snapshots : []).filter(isProfitMarginSnapshot);
  if (profitSnapshots.length === 0) return undefined;
  return roundMoney(
    profitSnapshots.reduce((sum, snapshot) => sum + getSnapshotCalculatedAmount(snapshot), 0)
  );
};

export const getRoundingAmountFromSnapshots = (snapshots: any[] = []): number | undefined => {
  const roundingSnapshots = getRoundingSnapshots(snapshots);
  if (roundingSnapshots.length === 0) return undefined;
  return roundMoney(
    roundingSnapshots.reduce((sum, snapshot) => sum + getSnapshotCalculatedAmount(snapshot), 0)
  );
};

const normalizeAdjustmentSnapshot = (snapshot: any, index: number) => ({
  ...snapshot,
  adjustmentId: snapshot?.adjustmentId || snapshot?.id || `ADJ-${index}`,
  name: String(snapshot?.name || snapshot?.adjustmentName || 'Adjustment'),
  type: String(snapshot?.type || 'FIXED'),
  calculatedAmount: getSnapshotCalculatedAmount(snapshot)
});

const buildSmartPricingAdjustmentSnapshots = (smartPricingSnapshot: any): any[] => {
  const marketAdjustments = Array.isArray(smartPricingSnapshot?.marketAdjustments)
    ? smartPricingSnapshot.marketAdjustments
    : [];

  return marketAdjustments.map((snapshot: any, index: number) => {
    const snapshotType = String(snapshot?.type || 'FIXED').toUpperCase();
    const rawValue = snapshot?.rawValue ?? snapshot?.value ?? 0;

    return normalizeAdjustmentSnapshot({
      ...snapshot,
      type: snapshotType,
      value: Number(rawValue),
      percentage: snapshotType.startsWith('PERCENT') ? Number(rawValue) : undefined,
      calculatedAmount: snapshot?.value
    }, index);
  });
};

export const resolveItemAdjustmentSnapshots = (item: any): any[] => {
  const directSnapshots = (Array.isArray(item?.adjustmentSnapshots) ? item.adjustmentSnapshots : [])
    .map((snapshot: any, index: number) => normalizeAdjustmentSnapshot(snapshot, index));

  const directTotal = roundMoney(
    getMarketAdjustmentSnapshots(directSnapshots).reduce((sum, snapshot) => sum + getSnapshotCalculatedAmount(snapshot), 0)
  );

  const smartSnapshots = buildSmartPricingAdjustmentSnapshots(item?.smartPricingSnapshot);
  const smartTotal = roundMoney(
    smartSnapshots.reduce((sum, snapshot) => sum + getSnapshotCalculatedAmount(snapshot), 0)
  );

  const explicitSmartTotal = roundMoney(item?.smartPricingSnapshot?.marketAdjustmentTotal ?? 0);

  // SmartPricing variant whose price is fully computed: if it has a smartPricingSnapshot
  // but no marketAdjustments in it, return empty so the caller does NOT fall back to
  // re-applying global market adjustments on an already-final price.
  const isSmartPricingItem = !!(item?.smartPricingSnapshot || item?.pricingSource === "smart");
  if (isSmartPricingItem && directSnapshots.length === 0 && smartSnapshots.length === 0) {
    return [];
  }

  if (
    smartSnapshots.length > 0
    && (directSnapshots.length === 0 || (directTotal === 0 && (smartTotal > 0 || explicitSmartTotal > 0)))
  ) {
    return smartSnapshots;
  }

  return directSnapshots;
};

const toAdjustmentAmount = (snapshots: any[] = []): number => {
  return roundMoney(
    getMarketAdjustmentSnapshots(snapshots).reduce((sum, snapshot) => sum + getSnapshotCalculatedAmount(snapshot), 0)
  );
};

const toAdjustmentLines = (snapshots: any[] = []) => {
  return getMarketAdjustmentSnapshots(snapshots).map((snapshot: any) => ({
    name: String(snapshot?.name || 'Adjustment'),
    type: String(snapshot?.type || 'FIXED'),
    value: getSnapshotCalculatedAmount(snapshot)
  }));
};

export const buildPricingBreakdownSnapshot = (
  item: any
): PricingBreakdownSnapshot | undefined => {
  if (!item) return undefined;

  const existing = item.pricingBreakdown as PricingBreakdownSnapshot | undefined;
  if (existing) {
    const costPrice = roundMoney(existing.costPrice ?? existing.baseMaterialCost ?? 0);
    const sellingPrice = roundMoney(existing.sellingPrice ?? 0);
    const profitAmount = roundMoney(existing.profitAmount ?? (sellingPrice - costPrice));
    const profitMargin = existing.profitMargin ?? (costPrice > 0 ? roundMoney((profitAmount / costPrice) * 100) : 0);
    const minimumMargin = existing.minimumMargin ?? 0;

    return {
      paperCost: roundMoney(existing.paperCost ?? 0),
      tonerCost: roundMoney(existing.tonerCost ?? 0),
      finishingCost: roundMoney(existing.finishingCost ?? 0),
      baseMaterialCost: roundMoney(existing.baseMaterialCost ?? 0),
      costPrice,
      sellingPrice,
      profitAmount,
      profitMargin,
      minimumMargin,
      pages: existing.pages,
      copies: existing.copies,
      adjustmentTotal: roundMoney(existing.adjustmentTotal ?? 0),
      adjustmentLines: Array.isArray(existing.adjustmentLines) ? existing.adjustmentLines : [],
      profitMarginAmount: roundMoney(existing.profitMarginAmount ?? 0),
      marginType: existing.marginType,
      marginValue: existing.marginValue,
      roundingDifference: roundMoney(existing.roundingDifference ?? 0),
      wasRounded: Boolean(existing.wasRounded),
      roundingMethod: existing.roundingMethod
    };
  }

  const smartSnapshot = item.smartPricingSnapshot || item.smartPricing;
  const adjustmentSnapshots = resolveItemAdjustmentSnapshots(item);
  const sellingPrice = roundMoney(
    item.price
    ?? item.unitPrice
    ?? item.selling_price
    ?? smartSnapshot?.roundedPrice
    ?? 0
  );
  const baseMaterialCost = roundMoney(
    smartSnapshot?.baseCost
    ?? item.basePrice
    ?? item.cost_price
    ?? item.cost
    ?? item.productionCostSnapshot?.baseProductionCost
    ?? 0
  );
  const explicitMarketAdjustmentTotal = [
    smartSnapshot?.marketAdjustmentTotal,
    item.marketAdjustmentTotal
  ].find((value) => Number.isFinite(Number(value)));
  const adjustmentTotal = roundMoney(
    explicitMarketAdjustmentTotal
    ?? (adjustmentSnapshots.length > 0 ? toAdjustmentAmount(adjustmentSnapshots) : item.adjustmentTotal)
  );
  const roundingDifference = roundMoney(
    smartSnapshot?.roundingDifference
    ?? item.roundingDifference
    ?? item.rounding_difference
    ?? resolveStoredRoundingDifference(item)
  );

  const itemWithManual = item as { manual_override?: boolean; manualOverride?: boolean };
  const isManualOverride = Boolean(itemWithManual.manual_override ?? itemWithManual.manualOverride);
  const explicitMargin = isManualOverride
    ? Number.NaN
    : Number(
        smartSnapshot?.profitMarginAmount
        ?? item.profitMarginAmount
        ?? item.marginAmount
        ?? getProfitMarginAmountFromSnapshots(adjustmentSnapshots)
      );
  const profitMarginAmount = Number.isFinite(explicitMargin)
    ? roundMoney(explicitMargin)
    : roundMoney(sellingPrice - baseMaterialCost - adjustmentTotal - roundingDifference);

  const pages = smartSnapshot?.pages ?? item.pagesOverride ?? item.pages;
  const copies = smartSnapshot?.copies ?? item.quantity ?? item.serviceDetails?.copies;

  const paperCost = roundMoney(smartSnapshot?.paperCost ?? 0);
  const tonerCost = roundMoney(smartSnapshot?.tonerCost ?? 0);
  const finishingCost = roundMoney(smartSnapshot?.finishingCost ?? 0);

  if (
    sellingPrice === 0
    && baseMaterialCost === 0
    && adjustmentTotal === 0
    && profitMarginAmount === 0
    && roundingDifference === 0
    && paperCost === 0
    && tonerCost === 0
    && finishingCost === 0
  ) {
    return undefined;
  }

  const costPrice = baseMaterialCost;
  const profitAmount = roundMoney(sellingPrice - costPrice);
  const profitMargin = sellingPrice > 0 ? roundMoney((profitAmount / sellingPrice) * 100) : 0;
  const minimumMargin = Number(item.minimumMargin) || 0;

  return {
    paperCost,
    tonerCost,
    finishingCost,
    baseMaterialCost,
    costPrice,
    sellingPrice,
    profitAmount,
    profitMargin,
    minimumMargin,
    pages,
    copies,
    adjustmentTotal,
    adjustmentLines: toAdjustmentLines(adjustmentSnapshots),
    profitMarginAmount,
    marginType: smartSnapshot?.marginType ?? item.marginType,
    marginValue: smartSnapshot?.marginValue ?? item.marginValue,
    roundingDifference,
    wasRounded: Math.abs(roundingDifference) > 0.0001 || Boolean(smartSnapshot?.wasRounded),
    roundingMethod: smartSnapshot?.roundingMethod ?? item.roundingMethod ?? item.rounding_method
  };
};

export const attachPricingBreakdown = <T extends Record<string, any>>(item: T): T => {
  const pricingBreakdown = buildPricingBreakdownSnapshot(item);
  if (!pricingBreakdown) return item;
  return {
    ...item,
    pricingBreakdown
  };
};

export const summarizePricingBreakdown = (items: any[] = []) => {
  return items.reduce((summary, rawItem) => {
    const item = attachPricingBreakdown(rawItem);
    const breakdown = item.pricingBreakdown as PricingBreakdownSnapshot | undefined;
    const quantity = toPositiveQuantity(item.quantity);

    const materialTotal = roundMoney((breakdown?.baseMaterialCost ?? Number(item.cost || 0)) * quantity);
    const adjustmentTotal = roundMoney((breakdown?.adjustmentTotal ?? Number(item.adjustmentTotal || 0)) * quantity);
    const roundingTotal = roundMoney((breakdown?.roundingDifference ?? item.roundingDifference ?? item.rounding_difference ?? 0) * quantity);

    const marginPerUnit = breakdown
      ? (breakdown.profitAmount ?? breakdown.profitMarginAmount ?? 0)
      : roundMoney(
          Number(item.price || item.unitPrice || 0)
          - Number(item.cost || 0)
          - Number(item.adjustmentTotal || 0)
          - Number(item.roundingDifference || item.rounding_difference || 0)
        );

    summary.materialTotal = roundMoney(summary.materialTotal + materialTotal);
    summary.adjustmentTotal = roundMoney(summary.adjustmentTotal + adjustmentTotal);
    summary.profitMarginTotal = roundMoney(summary.profitMarginTotal + (marginPerUnit * quantity));
    summary.roundingTotal = roundMoney(summary.roundingTotal + roundingTotal);
    return summary;
  }, {
    materialTotal: 0,
    adjustmentTotal: 0,
    profitMarginTotal: 0,
    roundingTotal: 0
  });
};

export const aggregateMarketAdjustmentSnapshots = (items: any[] = []) => {
  const map = new Map<string, any>();

  items.forEach((rawItem) => {
    const item = attachPricingBreakdown(rawItem);
    const quantity = toPositiveQuantity(item.quantity);
    const snapshots = getMarketAdjustmentSnapshots(resolveItemAdjustmentSnapshots(item));

    snapshots.forEach((snapshot: any, index: number) => {
      const key = String(snapshot?.adjustmentId || snapshot?.name || `ADJ-${index}`);
      const existing = map.get(key);
      const calculatedAmount = roundMoney(getSnapshotCalculatedAmount(snapshot) * quantity);

      if (existing) {
        existing.calculatedAmount = roundMoney(existing.calculatedAmount + calculatedAmount);
        return;
      }

      map.set(key, {
        ...snapshot,
        adjustmentId: snapshot?.adjustmentId || key,
        name: snapshot?.name || 'Adjustment',
        calculatedAmount
      });
    });
  });

  return Array.from(map.values());
};

export const resolveTransactionPricingSummary = (transaction: any) => {
  const normalizedItems = Array.isArray(transaction?.items)
    ? transaction.items.map((item: any) => attachPricingBreakdown(item))
    : [];
  const derivedSummary = summarizePricingBreakdown(normalizedItems);

  const pickMetric = (rootValue: unknown, derivedValue: number) => {
    const parsedRoot = Number(rootValue);
    if (Number.isFinite(parsedRoot) && Math.abs(parsedRoot) > 0.0001) {
      return roundMoney(parsedRoot);
    }

    if (Math.abs(derivedValue) > 0.0001) {
      return roundMoney(derivedValue);
    }

    return 0;
  };

  const rawRootSnapshots = Array.isArray(transaction?.adjustmentSnapshots)
    ? transaction.adjustmentSnapshots
    : [];
  const rootSnapshots = getMarketAdjustmentSnapshots(rawRootSnapshots).map((snapshot: any) => ({
        ...snapshot,
        calculatedAmount: getSnapshotCalculatedAmount(snapshot)
      }));
  const hasRootRoundingSnapshots = getRoundingSnapshots(rawRootSnapshots).length > 0;
  const rootAdjustmentTotalFromSnapshots = roundMoney(
    rootSnapshots.reduce((sum, snapshot) => sum + getSnapshotCalculatedAmount(snapshot), 0)
  );
  const rootRoundingTotalFromSnapshots = roundMoney(getRoundingAmountFromSnapshots(rawRootSnapshots) ?? 0);
  const rootRoundingValue = roundMoney(
    Number(
      transaction?.roundingTotal
      ?? transaction?.rounding_total
      ?? transaction?.roundingDifference
      ?? transaction?.rounding_difference
    )
  );
  const preRoundingTotal = Number(
    transaction?.preRoundingTotalAmount
    ?? transaction?.pre_rounding_total_amount
    ?? transaction?.subtotal
  );
  const totalAmount = Number(transaction?.totalAmount ?? transaction?.total ?? transaction?.total_amount);
  const isExaminationTransaction = String(transaction?.originModule || transaction?.origin_module || '').trim().toLowerCase() === 'examination'
    || String(transaction?.documentTitle || transaction?.document_title || '').trim().toLowerCase().includes('examination')
    || String(transaction?.reference || '').trim().toUpperCase().startsWith('EXM-BATCH-')
    || Boolean(transaction?.batchId || transaction?.originBatchId || transaction?.origin_batch_id);
  const inferredRoundingFromTotals = (
    isExaminationTransaction
    && Number.isFinite(preRoundingTotal)
    && Number.isFinite(totalAmount)
  )
    ? roundMoney(totalAmount - preRoundingTotal)
    : 0;

  return {
    items: normalizedItems,
    materialTotal: pickMetric(transaction?.materialTotal ?? transaction?.material_total, derivedSummary.materialTotal),
    adjustmentTotal: (
      rootSnapshots.length > 0 || hasRootRoundingSnapshots
        ? rootAdjustmentTotalFromSnapshots
        : pickMetric(transaction?.adjustmentTotal ?? transaction?.adjustment_total, derivedSummary.adjustmentTotal)
    ),
    profitMarginTotal: pickMetric(transaction?.profitMarginTotal ?? transaction?.profit_margin_total ?? transaction?.profitAdjustment, derivedSummary.profitMarginTotal),
    roundingTotal: (
      hasRootRoundingSnapshots
        ? rootRoundingTotalFromSnapshots
        : Math.abs(rootRoundingValue) > 0.0001
          ? rootRoundingValue
          : Math.abs(inferredRoundingFromTotals) > 0.0001
            ? inferredRoundingFromTotals
            : pickMetric(undefined, derivedSummary.roundingTotal)
    ),
    adjustmentSnapshots: rootSnapshots.length > 0 || hasRootRoundingSnapshots
      ? rootSnapshots
      : aggregateMarketAdjustmentSnapshots(normalizedItems)
  };
};
