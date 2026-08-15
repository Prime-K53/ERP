import { describe, expect, it } from 'vitest';
import { calculateRoundedClassPreview } from '../../utils/examinationClassPricing';
import { calculateExaminationBatchPricing } from '../../src/domain/examination/pricingEngine';

describe('ManageSubjectsDialog pricing preview', () => {
  it('uses the rounded learner fee to produce the class total', () => {
    const result = calculateRoundedClassPreview({
      totalBomCost: 1000,
      marketAdjustmentTotal: 100,
      learners: 6,
      margin: {
        margin_type: 'percentage',
        margin_value: 10
      },
      roundingStep: 50
    });

    expect(result.marginAmount).toBe(110);
    expect(result.expectedFeePerLearner).toBe(250);
    expect(result.roundingAdjustment).toBe(290);
    expect(result.totalAdjustments).toBe(390);
    expect(result.totalCost).toBe(1500);
    expect(result.calculatedTotalCost).toBe(1500);
  });
});

describe('examination pricing engine rounding', () => {
  it('keeps total cost aligned with the rounded fee per learner', () => {
    const result = calculateExaminationBatchPricing(
      {
        classes: [
          {
            id: 'class-1',
            class_name: 'Grade 1',
            number_of_learners: 6,
            subjects: [
              { pages: 2, extra_copies: 0 }
            ]
          }
        ]
      },
      {
        paper_unit_cost: 5000,
        toner_unit_cost: 0,
        conversion_rate: 500,
        profit_margin: 0
      },
      []
    );

    expect(result.classes).toHaveLength(1);
    expect(result.classes[0].expectedFeePerLearner).toBe(50);
    expect(result.classes[0].totalCost).toBe(300);
    expect(result.classes[0].liveTotalPreview).toBe(300);
  });
});
