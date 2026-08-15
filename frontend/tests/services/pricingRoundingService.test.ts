import { describe, expect, it } from 'vitest';
import {
  applyRounding,
  applyProductPriceRounding,
  applyTransactionRounding,
  DEFAULT_PRICING_SETTINGS,
  normalizeTransactionRounding
} from '../../services/pricingRoundingService';

describe('pricingRoundingService', () => {
  it('rounds up by 50 in profit mode', () => {
    const result = applyRounding(8734, {
      method: 'ALWAYS_UP_50',
      customStep: 50,
      profitProtectionMode: true
    });

    expect(result.roundedPrice).toBe(8750);
    expect(result.roundingDifference).toBe(16);
    expect(result.methodUsed).toBe('ALWAYS_UP_50');
  });

  it('prevents margin loss for nearest methods when profit protection is enabled', () => {
    const result = applyRounding(8721, {
      method: 'NEAREST_50',
      customStep: 50,
      profitProtectionMode: true
    });

    // Nearest would be 8700, but profit protection enforces >= original.
    expect(result.roundedPrice).toBe(8750);
    expect(result.roundingDifference).toBe(29);
  });

  it('supports psychological rounding', () => {
    const result = applyRounding(8734, {
      method: 'PSYCHOLOGICAL',
      customStep: 50,
      profitProtectionMode: true
    });

    expect(result.roundedPrice).toBe(8999);
    expect(result.roundingDifference).toBe(265);
  });

  it('uses smart thresholds for <10k and >=10k', () => {
    const companyConfig = {
      pricingSettings: {
        ...DEFAULT_PRICING_SETTINGS,
        defaultMethod: 'ALWAYS_UP_CUSTOM',
        customStep: 25,
        enableSmartThresholds: true,
        thresholdRules: [
          { minPrice: 0, maxPrice: 10000, step: 50 },
          { minPrice: 10000, step: 100 }
        ]
      }
    } as any;

    const small = applyTransactionRounding({
      price: 8701,
      companyConfig,
      scope: 'invoice'
    });
    const large = applyTransactionRounding({
      price: 12001,
      companyConfig,
      scope: 'invoice'
    });

    expect(small.roundedPrice).toBe(8750);
    expect(large.roundedPrice).toBe(12100);
  });

  it('handles negative values (refund-safe direction)', () => {
    const result = applyRounding(-8734, {
      method: 'ALWAYS_UP_50',
      customStep: 50,
      profitProtectionMode: true
    });

    expect(result.roundedPrice).toBe(-8700);
    expect(result.roundingDifference).toBe(34);
  });

  it('handles zero values without distortion', () => {
    const result = applyRounding(0, {
      method: 'ALWAYS_UP_50',
      customStep: 50,
      profitProtectionMode: true
    });

    expect(result.roundedPrice).toBe(0);
    expect(result.roundingDifference).toBe(0);
  });

  it('handles very small values safely', () => {
    const result = applyRounding(0.25, {
      method: 'ALWAYS_UP_CUSTOM',
      customStep: 0.1,
      profitProtectionMode: true
    });

    expect(result.roundedPrice).toBeGreaterThanOrEqual(0.25);
  });

  it('does not apply when scope is disabled', () => {
    const companyConfig = {
      pricingSettings: {
        ...DEFAULT_PRICING_SETTINGS,
        enableRounding: true,
        applyToInvoices: false
      }
    } as any;

    const result = applyTransactionRounding({
      price: 8734,
      companyConfig,
      scope: 'invoice'
    });

    expect(result.applyRounding).toBe(false);
    expect(result.roundedPrice).toBe(8734);
    expect(result.roundingDifference).toBe(0);
  });

  it('avoids double rounding once metadata is present', () => {
    const companyConfig = {
      pricingSettings: {
        ...DEFAULT_PRICING_SETTINGS,
        defaultMethod: 'ALWAYS_UP_50'
      }
    } as any;

    const once = normalizeTransactionRounding(
      {
        totalAmount: 8734
      },
      { scope: 'invoice', companyConfig, totalField: 'totalAmount' }
    );

    const twice = normalizeTransactionRounding(
      once,
      { scope: 'invoice', companyConfig, totalField: 'totalAmount' }
    );

    expect(once.totalAmount).toBe(8750);
    expect(twice.totalAmount).toBe(8750);
    expect(twice.roundingDifference).toBe(16);
  });

  it('applies product-level rounding regardless of POS/Invoice scope flags', () => {
    const companyConfig = {
      pricingSettings: {
        ...DEFAULT_PRICING_SETTINGS,
        enableRounding: true,
        applyToPOS: false,
        applyToInvoices: false,
        applyToQuotations: false,
        defaultMethod: 'ALWAYS_UP_50'
      }
    } as any;

    const result = applyProductPriceRounding({
      calculatedPrice: 8701,
      companyConfig
    });

    expect(result.applyRounding).toBe(true);
    expect(result.roundedPrice).toBe(8750);
    expect(result.roundingDifference).toBe(49);
  });

  it('skips re-rounding when stored rounded metadata already matches calculated price', () => {
    const companyConfig = {
      pricingSettings: {
        ...DEFAULT_PRICING_SETTINGS,
        defaultMethod: 'ALWAYS_UP_50'
      }
    } as any;

    const result = applyProductPriceRounding({
      calculatedPrice: 8734,
      companyConfig,
      existingCalculatedPrice: 8734,
      existingRoundedPrice: 8750,
      existingRoundingDifference: 16,
      existingRoundingMethod: 'ALWAYS_UP_50'
    });

    expect(result.alreadyRounded).toBe(true);
    expect(result.roundedPrice).toBe(8750);
    expect(result.roundingDifference).toBe(16);
  });
});
