import { describe, expect, it } from 'vitest';
import { calculateSellingPrice } from '../../src/utils/pricing/pricingEngine';

describe('frontend pricing engine', () => {
  it('uses the shared product rounding rules for manual base prices', async () => {
    const result = await calculateSellingPrice({
      baseCost: 100,
      basePrice: 8701,
      quantity: 1,
      context: 'POS',
    });

    expect(result.unitPrice).toBe(8701);
    expect(result.totalPrice).toBe(8701);
  });

  it('normalizes adjustment snapshots with calculated amounts', async () => {
    const result = await calculateSellingPrice({
      baseCost: 50,
      basePrice: 100,
      quantity: 1,
      adjustments: [
        {
          name: 'Fuel',
          type: 'PERCENTAGE',
          value: 10,
        },
      ],
      context: 'POS',
    });

    expect(result.adjustmentSnapshots[0]).toMatchObject({
      name: 'Fuel',
      type: 'PERCENTAGE',
      value: 10,
      calculatedAmount: 10,
    });
  });
});
