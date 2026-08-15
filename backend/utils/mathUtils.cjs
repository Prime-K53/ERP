const ROUNDING_PRECISION = 2;
const ROUNDING_FACTOR = 100;

const roundToCurrency = (value) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.round((parsed + Number.EPSILON) * ROUNDING_FACTOR) / ROUNDING_FACTOR;
};

const roundUpToStep = (value, step) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || Number(step) <= 0) return roundToCurrency(parsed);
  return Math.ceil(parsed / Number(step)) * Number(step);
};

const roundToNearest = (value, step) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || Number(step) <= 0) return roundToCurrency(parsed);
  return Math.round(parsed / Number(step)) * Number(step);
};

const calculateMarginAmount = (baseCost, margin) => {
  const safeBase = roundToCurrency(Number(baseCost) || 0);
  if (!margin) return 0;
  const value = Number(margin.margin_value) || 0;
  if ((margin.margin_type || '').toLowerCase() === 'percentage') {
    return roundToCurrency(safeBase * (value / 100));
  }
  return roundToCurrency(value);
};

module.exports = {
  ROUNDING_PRECISION,
  ROUNDING_FACTOR,
  roundToCurrency,
  roundUpToStep,
  roundToNearest,
  calculateMarginAmount
};
