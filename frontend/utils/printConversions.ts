/**
 * Utility functions for print material conversions.
 * Implements conversion rules for Paper and Toner consumption.
 */

/**
 * PAPER CONVERSION RULES:
 * 1 ream = 500 sheets
 * 1 sheet = 2 pages (double-sided)
 * 1 ream = 1000 pages
 */
export const PAPER_CONVERSION = {
  PAGES_PER_SHEET: 2,
  SHEETS_PER_REAM: 500,
  PAGES_PER_REAM: 1000, // 500 * 2
} as const;

/**
 * TONER CONVERSION RULES:
 * 1 kg = 1000 g
 * 1 kg = 20000 pages
 * 1 g = 20 pages
 */
export const TONER_CONVERSION = {
  GRAMS_PER_KG: 1000,
  PAGES_PER_KG: 20000,
  PAGES_PER_GRAM: 20, // 20000 / 1000
} as const;

/**
 * Converts a number of pages to the equivalent number of paper reams.
 * @param pages The number of pages to convert.
 * @returns The number of reams (can be fractional).
 */
export const pagesToReams = (pages: number): number => {
  if (!pages || pages <= 0) return 0;
  return pages / PAPER_CONVERSION.PAGES_PER_REAM;
};

/**
 * Converts a number of pages to the equivalent weight of toner in kilograms.
 * @param pages The number of pages to convert.
 * @returns The weight in kilograms (can be fractional).
 */
export const pagesToTonerKg = (pages: number): number => {
  if (!pages || pages <= 0) return 0;
  return pages / TONER_CONVERSION.PAGES_PER_KG;
};
