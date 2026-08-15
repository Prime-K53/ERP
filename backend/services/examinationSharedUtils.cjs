/**
 * Shared utilities for examination services
 * Extracted from examinationInvoiceAdapter.cjs, examinationService.cjs, and examinationBatchWorkflow.cjs
 */

/**
 * Converts a value to a numeric value, handling strings with commas, null, undefined, etc.
 */
const toNumericValue = (value) => {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string') {
    const normalized = value.replace(/,/g, '').trim();
    if (!normalized) return null;
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

/**
 * Picks the first positive number from the given values
 */
const pickPositiveNumber = (...values) => {
  for (const value of values) {
    const numeric = toNumericValue(value);
    if (numeric !== null && numeric > 0) return numeric;
  }
  return null;
};

/**
 * Rounds a value to 2 decimal places for money calculations
 */
const roundMoney = (value) => Math.round((Number(value) || 0) * 100) / 100;

module.exports = {
  toNumericValue,
  pickPositiveNumber,
  roundMoney,
};