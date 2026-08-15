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
});
