import { describe, it, expect } from 'vitest';

// CommonJS backend module
// eslint-disable-next-line @typescript-eslint/no-var-requires
const pricingEngine = require('../../../backend/services/examinationPricingEngine.cjs');

describe('examinationPricingEngine', () => {
  it('calculates subject consumption correctly', () => {
    const result = pricingEngine.calculateSubjectConsumption(
      { pages: 5, extra_copies: 3 },
      40
    );

    // 5 pages -> ceil(5/2) = 3 sheets/copy
    // Copies = 40 + 3 = 43
    expect(result.sheetsPerCopy).toBe(3);
    expect(result.totalCopies).toBe(43);
    expect(result.totalSheets).toBe(129);
    expect(result.totalPages).toBe(215);
  });

  it('calculates class material cost from sheets/pages', () => {
    const result = pricingEngine.calculateClassMaterialCost({
      totalSheets: 1000,
      totalPages: 2000,
      paperUnitCost: 5000,
      tonerUnitCost: 90000
    });

    expect(result.reamsRequired).toBe(2);
    expect(result.paperCost).toBe(10000);
    expect(result.tonerRequired).toBe(0.04);
    expect(result.tonerCost).toBe(3600);
    expect(result.materialCost).toBe(13600);
  });

  it('calculates precise paper cost for fractional ream usage', () => {
    const result = pricingEngine.calculateClassMaterialCost({
      totalSheets: 20, // 20 / 500 = 0.04 reams
      totalPages: 0,
      paperUnitCost: 18000,
      tonerUnitCost: 0
    });

    expect(result.reamsRequired).toBeCloseTo(0.04, 8);
    expect(result.paperCost).toBe(720);
    expect(result.materialCost).toBe(720);
  });

  it('calculates precise toner quantity and cost', () => {
    const result = pricingEngine.calculateClassMaterialCost({
      totalSheets: 0,
      totalPages: 48, // 48 / 20000 = 0.0024 kg
      paperUnitCost: 0,
      tonerUnitCost: 60000
    });

    expect(result.tonerRequired).toBeCloseTo(0.00096, 8);
    expect(result.tonerCost).toBe(57.6);
    expect(result.materialCost).toBe(57.6);
  });

  it('normalizes adjustment types', () => {
    expect(pricingEngine.normalizeAdjustmentType('fixed')).toBe('FIXED');
    expect(pricingEngine.normalizeAdjustmentType('percent')).toBe('PERCENTAGE');
    expect(pricingEngine.normalizeAdjustmentType('PERCENTAGE')).toBe('PERCENTAGE');
  });

  it('prefers inventory master unit cost over other cost sources', () => {
    const result = pricingEngine.resolvePreferredUnitCost({
      inventoryUnitCost: 18000,
      weightedBatchUnitCost: 5200,
      latestInboundUnitCost: 6000,
      fallbackUnitCost: 5000
    });

    expect(result.unitCost).toBe(18000);
    expect(result.source).toBe('inventory.master');
  });

  it('builds sequential adjustment breakdown with ratios', () => {
    const result = pricingEngine.buildAdjustmentBreakdown(1000, [
      { id: 'adj-fixed', name: 'Fixed Charge', type: 'FIXED', value: 100, sort_order: 2 },
      { id: 'adj-pct', name: 'Markup', type: 'PERCENTAGE', value: 10, sort_order: 1 }
    ]);

    // 10% of 1000 = 100, then + fixed 100
    expect(result.materialCost).toBe(1000);
    expect(result.adjustmentTotal).toBe(200);
    expect(result.totalCost).toBe(1200);
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0].adjustmentId).toBe('adj-pct');
    expect(result.rows[0].originalAmount).toBe(100);
    expect(result.rows[1].adjustmentId).toBe('adj-fixed');
    expect(result.rows[1].originalAmount).toBe(100);
    expect(result.rows[0].allocationRatio).toBeCloseTo(0.5, 5);
    expect(result.rows[1].allocationRatio).toBeCloseTo(0.5, 5);
  });

  it('does not inject fallback adjustments when no active adjustments are supplied', () => {
    const result = pricingEngine.buildAdjustmentBreakdown(1000, []);

    expect(result.rows.length).toBe(0);
    expect(result.adjustmentTotal).toBe(0);
    expect(result.totalCost).toBe(1000);
  });

  it('returns suggested pricing when manual override is disabled', () => {
    const breakdown = pricingEngine.buildAdjustmentBreakdown(1500, [
      { id: 'adj', name: 'Markup', type: 'PERCENTAGE', value: 20 }
    ]);

    const result = pricingEngine.resolveClassPricing({
      learners: 30,
      materialCost: breakdown.materialCost,
      suggestedTotalCost: breakdown.totalCost,
      suggestedCostPerLearner: pricingEngine.roundCurrency(breakdown.totalCost / 30),
      adjustmentRows: breakdown.rows,
      manualOverrideEnabled: false
    });

    expect(result.isManualOverride).toBe(false);
    expect(result.finalClassTotal).toBe(breakdown.totalCost);
    expect(result.adjustmentTotal).toBe(breakdown.adjustmentTotal);
    expect(result.percentageDifference).toBe(0);
  });

  it('applies manual override and redistributes adjustments proportionally', () => {
    const breakdown = pricingEngine.buildAdjustmentBreakdown(1000, [
      { id: 'adj-a', name: 'Adj A', type: 'PERCENTAGE', value: 10 }, // 100
      { id: 'adj-b', name: 'Adj B', type: 'FIXED', value: 200 }      // 200
    ]);

    const suggestedCost = pricingEngine.roundCurrency(breakdown.totalCost / 10); // 130
    const manualCost = 160; // class total 1600, target adjustment = 600
    const result = pricingEngine.resolveClassPricing({
      learners: 10,
      materialCost: breakdown.materialCost,
      suggestedTotalCost: breakdown.totalCost,
      suggestedCostPerLearner: suggestedCost,
      adjustmentRows: breakdown.rows,
      manualCostPerLearner: manualCost,
      manualOverrideEnabled: true
    });

    expect(result.isManualOverride).toBe(true);
    expect(result.finalCostPerLearner).toBe(160);
    expect(result.finalClassTotal).toBe(1600);
    expect(result.adjustmentTotal).toBe(600);
    expect(result.percentageDifference).toBeCloseTo(23.08, 2);
    expect(result.adjustmentRows).toHaveLength(2);
    // Original split 100:200 => 1/3 and 2/3 of 600
    expect(result.adjustmentRows[0].redistributedAmount).toBe(200);
    expect(result.adjustmentRows[1].redistributedAmount).toBe(400);
  });

  it('rejects manual override lower than material cost floor', () => {
    const breakdown = pricingEngine.buildAdjustmentBreakdown(1000, [
      { id: 'adj-a', name: 'Adj A', type: 'PERCENTAGE', value: 10 }
    ]);

    expect(() => {
      pricingEngine.resolveClassPricing({
        learners: 10,
        materialCost: breakdown.materialCost,
        suggestedTotalCost: breakdown.totalCost,
        suggestedCostPerLearner: pricingEngine.roundCurrency(breakdown.totalCost / 10),
        adjustmentRows: breakdown.rows,
        manualCostPerLearner: 50, // total 500 < material 1000
        manualOverrideEnabled: true
      });
    }).toThrow(/too low/i);
  });

  it('distributes evenly when original adjustment total is zero', () => {
    const result = pricingEngine.redistributeAdjustments(
      [
        {
          adjustmentId: 'adj-1',
          adjustmentName: 'A',
          adjustmentType: 'FIXED',
          adjustmentValue: 0,
          baseAmount: 0,
          originalAmount: 0,
          redistributedAmount: 0,
          allocationRatio: 0
        },
        {
          adjustmentId: 'adj-2',
          adjustmentName: 'B',
          adjustmentType: 'FIXED',
          adjustmentValue: 0,
          baseAmount: 0,
          originalAmount: 0,
          redistributedAmount: 0,
          allocationRatio: 0
        }
      ],
      300
    );

    expect(result.adjustmentTotal).toBe(300);
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0].redistributedAmount).toBe(150);
    expect(result.rows[1].redistributedAmount).toBe(150);
  });

  it('handles zero suggested price in percentage difference safely', () => {
    expect(pricingEngine.calculatePercentageDifference(100, 0)).toBe(0);
  });
});
