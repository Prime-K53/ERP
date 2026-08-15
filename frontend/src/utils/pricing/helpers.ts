import { SnapshotEntry, EffectiveMargin, MarginType } from './types';

export const isValidNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

export const safeNumber = (value: unknown, fallback = 0): number =>
  isValidNumber(value) ? value : fallback;

export const roundToCurrency = (amount: number): number =>
  Math.round((amount + Number.EPSILON) * 100) / 100;

export const isPercentageType = (type: string): boolean => {
  const normalized = type.toUpperCase();
  return normalized === 'PERCENTAGE' || normalized === 'PERCENT' || normalized === 'PERCENTAGE';
};

export const calculateAdjustmentAmount = (
  baseAmount: number,
  type: string,
  value: number
): number => {
  if (isPercentageType(type)) {
    return roundToCurrency(baseAmount * (value / 100));
  }
  return roundToCurrency(value);
};

export const calculateMarginAmount = (
  baseCost: number,
  margin: EffectiveMargin
): number => {
  if (margin.margin_type === 'percentage') {
    return roundToCurrency(baseCost * (margin.margin_value / 100));
  }
  return roundToCurrency(margin.margin_value);
};

export const normalizeSnapshot = (
  snapshot: Partial<SnapshotEntry>,
  baseAmount: number
): SnapshotEntry => {
  const type = snapshot.type || 'PERCENTAGE';
  const value = safeNumber(snapshot.value, 0);
  const calculatedAmount = calculateAdjustmentAmount(baseAmount, type, value);

  return {
    name: snapshot.name || 'Adjustment',
    type: isPercentageType(type) ? 'PERCENTAGE' : 'FIXED',
    value,
    percentage: isPercentageType(type) ? value : undefined,
    calculatedAmount,
    ...snapshot
  };
};

export const injectProfitMarginSnapshot = (
  existingSnapshots: SnapshotEntry[],
  margin: EffectiveMargin,
  marginAmount: number
): SnapshotEntry[] => {
  const filtered = existingSnapshots.filter(
    s => s.name !== 'Profit Margin'
  );

  if (marginAmount <= 0) {
    return filtered;
  }

  const snapshot: SnapshotEntry = {
    name: 'Profit Margin',
    type: margin.margin_type === 'percentage' ? 'PERCENTAGE' : 'FIXED',
    value: margin.margin_value,
    percentage: margin.margin_type === 'percentage' ? margin.margin_value : undefined,
    calculatedAmount: roundToCurrency(marginAmount)
  };

  return [...filtered, snapshot];
};

export const calculateAdjustmentTotal = (
  snapshots: SnapshotEntry[]
): number => {
  return roundToCurrency(
    snapshots.reduce((sum, s) => sum + (s.calculatedAmount || 0), 0)
  );
};

export const calculateTotalFromSnapshots = (
  baseCost: number,
  snapshots: SnapshotEntry[]
): number => {
  const adjustmentTotal = calculateAdjustmentTotal(snapshots);
  return roundToCurrency(baseCost + adjustmentTotal);
};