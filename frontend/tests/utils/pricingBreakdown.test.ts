import { describe, expect, it } from 'vitest';
import { resolveTransactionPricingSummary } from '../../utils/pricingBreakdown';

describe('pricingBreakdown', () => {
  it('separates rounding snapshots from examination adjustment totals', () => {
    const summary = resolveTransactionPricingSummary({
      originModule: 'examination',
      totalAmount: 5000,
      preRoundingTotalAmount: 4870.9,
      materialTotal: 2511,
      adjustmentTotal: 1178.7,
      profitMarginTotal: 1310.3,
      adjustmentSnapshots: [
        {
          id: 'transport',
          name: 'Transport/Logistics',
          type: 'FIXED',
          total_amount: 1049.6,
          calculatedAmount: 1049.6,
        },
        {
          id: 'auto-rounding',
          name: 'Rounding',
          type: 'FIXED',
          total_amount: 129.1,
          calculatedAmount: 129.1,
          is_rounding: true,
        },
      ],
    });

    expect(summary.materialTotal).toBe(2511);
    expect(summary.adjustmentTotal).toBe(1049.6);
    expect(summary.profitMarginTotal).toBe(1310.3);
    expect(summary.roundingTotal).toBe(129.1);
    expect(summary.adjustmentSnapshots).toHaveLength(1);
    expect(summary.adjustmentSnapshots[0]?.name).toBe('Transport/Logistics');
  });

  it('renders non-zero material cost and correct markup for a portal-converted invoice', () => {
    // Simulates the invoice produced by order → invoice conversion from a
    // portal request whose lines carry the persisted pricingBreakdown
    // (baseMaterialCost 300, sellingPrice 500, qty 2 → total 1000).
    const summary = resolveTransactionPricingSummary({
      totalAmount: 1000,
      materialTotal: 600,
      adjustmentTotal: 0,
      profitMarginTotal: 400,
      roundingTotal: 0,
      items: [
        {
          quantity: 2,
          price: 500,
          cost: 300,
          adjustmentSnapshots: [],
          adjustmentTotal: 0,
          pricingBreakdown: {
            baseMaterialCost: 300,
            costPrice: 300,
            sellingPrice: 500,
            adjustmentTotal: 0,
            adjustmentLines: [],
            profitMarginAmount: 200,
            roundingDifference: 0,
            wasRounded: false,
          },
        },
      ],
    });

    expect(summary.materialTotal).toBe(600);
    expect(summary.materialTotal).not.toBe(0);
    expect(summary.adjustmentTotal).toBe(0);
    expect(summary.profitMarginTotal).toBe(400);
    expect(summary.roundingTotal).toBe(0);

    // Firewall invariant of the established model:
    // material + adjustments + markup + rounding === selling total.
    expect(
      summary.materialTotal + summary.adjustmentTotal + summary.profitMarginTotal + summary.roundingTotal
    ).toBe(1000);
  });

  it('keeps evidence intact when only per-line pricingBreakdown is present (no root aggregates)', () => {
    const summary = resolveTransactionPricingSummary({
      totalAmount: 6500,
      items: [
        {
          quantity: 1,
          price: 6500,
          pricingBreakdown: {
            baseMaterialCost: 4000,
            costPrice: 4000,
            sellingPrice: 6500,
            adjustmentTotal: 0,
            adjustmentLines: [],
            profitMarginAmount: 2500,
            roundingDifference: 0,
            wasRounded: false,
          },
        },
      ],
    });

    expect(summary.materialTotal).toBe(4000);
    expect(summary.profitMarginTotal).toBe(2500);
  });
});
