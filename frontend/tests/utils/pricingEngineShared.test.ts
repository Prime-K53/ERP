import { describe, expect, it } from 'vitest';
import { calculateMaterialCosts, getItemConversionRate, getItemUnitCost } from '../../utils/pricingEngineShared';

describe('pricingEngineShared', () => {
  it('uses positive cost aliases and default paper conversion for modal BOM costs', () => {
    const result = calculateMaterialCosts({
      paper: {
        cost_price: 0,
        cost: 0,
        costPrice: 20000,
        conversionRate: 0,
      },
      toner: {
        cost_price: 0,
        cost: 0,
        costPrice: 75000,
      },
      pages: 50,
      copies: 1,
      finishingOptions: [{ enabled: true, price: 770 }],
    });

    expect(result.paperCost).toBe(1000);
    expect(result.tonerCost).toBe(187.5);
    expect(result.finishingCost).toBe(770);
    expect(result.baseCost).toBe(1957.5);
  });

  it('falls back to costPrice for finishing inventory items too', () => {
    const result = calculateMaterialCosts({
      paper: undefined,
      toner: undefined,
      pages: 1,
      copies: 2,
      finishingOptions: [
        {
          enabled: true,
          price: 0,
          items: [{ itemId: 'finish-1', quantity: 3 }],
        },
      ],
      inventory: [{ id: 'finish-1', cost_price: 0, costPrice: 25 }],
    });

    expect(result.finishingInventoryCost).toBe(150);
    expect(result.baseCost).toBe(150);
  });

  it('exposes resilient unit cost and conversion helpers', () => {
    expect(getItemUnitCost({ cost_price: 0, costPrice: 20000 })).toBe(20000);
    expect(getItemConversionRate({ conversionRate: 0 })).toBe(500);
    expect(getItemConversionRate({ conversionFactor: 250 })).toBe(250);
  });
});
