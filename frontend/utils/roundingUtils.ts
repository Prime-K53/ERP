/**
 * Shared rounding utilities for the entire application.
 * All pricing, financial, and receipt calculations should import from here
 * to ensure consistent rounding behavior.
 */

export const ROUNDING_PRECISION = 2;
export const ROUNDING_FACTOR = 100;

/**
 * Round a number to the configured currency precision (2 decimal places).
 * Uses Number.EPSILON to compensate for floating-point drift.
 */
export const roundMoney = (value: number): number => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.round((parsed + Number.EPSILON) * ROUNDING_FACTOR) / ROUNDING_FACTOR;
};

/**
 * Alias for roundMoney — use this for consistency with legacy code.
 */
export const roundToCurrency = roundMoney;

/**
 * Round a number up to the next step multiple.
 * e.g., roundUpToStep(123, 50) = 150
 */
export const roundUpToStep = (value: number, step: number = 50): number => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || step <= 0) return roundMoney(parsed);
  return Math.ceil(parsed / step) * step;
};

/**
 * Round a number to the nearest step multiple.
 * e.g., roundToNearest(123, 50) = 100, roundToNearest(175, 50) = 200
 */
export const roundToNearest = (value: number, step: number = 50): number => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || step <= 0) return roundMoney(parsed);
  return Math.round(parsed / step) * step;
};

export type MarginInput = {
  margin_value?: number;
  margin_type?: 'percentage' | 'fixed_amount' | string;
} | null | undefined;

export const calculateMargin = (baseCost: number, margin: MarginInput): number => {
  const safeBaseCost = roundMoney(baseCost);
  const marginValue = Number(margin?.margin_value ?? 0) || 0;
  if (marginValue <= 0) return 0;
  const type = String(margin?.margin_type || 'percentage').toLowerCase();
  return type === 'fixed_amount' ? roundMoney(marginValue) : roundMoney(safeBaseCost * (marginValue / 100));
};

/**
 * Round a number using configurable method.
 */
export const roundFinancial = (
  amount: number,
  method: 'Nearest' | 'Up' | 'Down' | 'Truncate' = 'Nearest',
  precision: number = ROUNDING_PRECISION
): number => {
  const parsed = Number(amount);
  if (!Number.isFinite(parsed)) return 0;
  const factor = Math.pow(10, precision);
  switch (method) {
    case 'Up': return Math.ceil(parsed * factor) / factor;
    case 'Down': return Math.floor(parsed * factor) / factor;
    case 'Truncate': return Math.trunc(parsed * factor) / factor;
    case 'Nearest':
    default: return Math.round((parsed + Number.EPSILON) * factor) / factor;
  }
};
