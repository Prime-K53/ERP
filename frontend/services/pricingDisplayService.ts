import { CompanyConfig, PricingRoundingMethod } from '../types';
import { roundMoney } from '../utils/roundingUtils';

export type DisplayScope = 'pos' | 'invoice' | 'quotation' | 'receipt' | 'public';

/**
 * PricingDisplayService — single source of truth for display-layer rounding.
 *
 * Business Rule:
 *   Database MUST store exact prices (e.g. 93.47).
 *   Display rounding (e.g. → 95) is ONLY permitted here.
 *   No persistence layer, service layer, or validation layer may round prices.
 *
 * Allowed consumers:
 *   - POS screens
 *   - Invoice preview / printed invoice
 *   - Quotation / Sales Order
 *   - Customer receipts
 *   - Public catalogue / shop
 */

interface RoundingConfig {
  enabled: boolean;
  method: PricingRoundingMethod;
  customStep: number;
}

const getRoundingConfig = (companyConfig?: CompanyConfig | null, scope?: DisplayScope): RoundingConfig => {
  const settings = companyConfig?.pricingSettings;
  if (!settings?.enableRounding) return { enabled: false, method: 'ALWAYS_UP_50', customStep: 50 };

  if (scope === 'pos' && !settings.applyToPOS) return { enabled: false, method: 'ALWAYS_UP_50', customStep: 50 };
  if (scope === 'invoice' && !settings.applyToInvoices) return { enabled: false, method: 'ALWAYS_UP_50', customStep: 50 };
  if (scope === 'quotation' && !settings.applyToQuotations) return { enabled: false, method: 'ALWAYS_UP_50', customStep: 50 };

  return {
    enabled: true,
    method: settings.defaultMethod || 'ALWAYS_UP_50',
    customStep: settings.customStep || 50,
  };
};

const applyMethodRounding = (price: number, method: PricingRoundingMethod, step: number): number => {
  switch (method) {
    case 'NEAREST_10':
    case 'NEAREST_50':
    case 'NEAREST_100':
      return Math.round(price / step) * step;
    case 'ALWAYS_UP_10':
    case 'ALWAYS_UP_50':
    case 'ALWAYS_UP_100':
    case 'ALWAYS_UP_500':
    case 'ALWAYS_UP_CUSTOM':
      return Math.ceil(price / step) * step;
    case 'PSYCHOLOGICAL': {
      if (price <= 0) return Math.ceil(price / 10) * 10;
      let magnitude = 10;
      if (price >= 100) magnitude = 100;
      if (price >= 1000) magnitude = 1000;
      let candidate = Math.floor(price / magnitude) * magnitude + (magnitude - 1);
      if (candidate < price) candidate += magnitude;
      return candidate;
    }
    default:
      return price;
  }
};

export interface DisplayPriceResult {
  originalPrice: number;
  displayPrice: number;
  roundingDifference: number;
  wasRounded: boolean;
}

export const roundForDisplay = (
  price: number,
  companyConfig?: CompanyConfig | null,
  scope?: DisplayScope
): DisplayPriceResult => {
  const config = getRoundingConfig(companyConfig, scope);
  const originalPrice = roundMoney(Number(price || 0));

  if (!config.enabled) {
    return { originalPrice, displayPrice: originalPrice, roundingDifference: 0, wasRounded: false };
  }

  const displayPrice = applyMethodRounding(originalPrice, config.method, config.customStep);
  return {
    originalPrice,
    displayPrice,
    roundingDifference: roundMoney(displayPrice - originalPrice),
    wasRounded: Math.abs(displayPrice - originalPrice) > 0.001,
  };
};

/**
 * Convenience wrapper — returns only the display price (rounded).
 * Use for inline JSX display where only the visible value matters.
 */
export const displayPrice = (
  price: number,
  companyConfig?: CompanyConfig | null,
  scope?: DisplayScope
): number => roundForDisplay(price, companyConfig, scope).displayPrice;

export const roundForPOS = (price: number, companyConfig?: CompanyConfig | null): DisplayPriceResult =>
  roundForDisplay(price, companyConfig, 'pos');

export const roundForInvoice = (price: number, companyConfig?: CompanyConfig | null): DisplayPriceResult =>
  roundForDisplay(price, companyConfig, 'invoice');

export const roundForQuotation = (price: number, companyConfig?: CompanyConfig | null): DisplayPriceResult =>
  roundForDisplay(price, companyConfig, 'quotation');
