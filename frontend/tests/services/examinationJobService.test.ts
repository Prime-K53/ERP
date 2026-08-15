import { describe, expect, it, vi } from 'vitest';
import { computeExaminationPricing, examinationJobService, ExaminationJobState } from '../../services/examinationJobService';

describe('Examination Job Service - Pricing Computation', () => {
  it('calculates fixed adjustment without rounding', () => {
    const result = computeExaminationPricing({
      productionCost: 1000,
      adjustmentType: 'fixed',
      adjustmentValue: 200,
      learners: 100,
      roundingRuleType: 'none',
      overrideEnabled: false
    });

    expect(result.adjustedCost).toBe(1200);
    expect(result.costPerLearner).toBe(12);
    expect(result.autoPricePerLearner).toBe(12);
    expect(result.finalPricePerLearner).toBe(12);
    expect(result.finalAmount).toBe(1200);
    expect(result.marginImpact).toBe(0);
  });

  it('rounds up using nearest_10', () => {
    const result = computeExaminationPricing({
      productionCost: 1200,
      adjustmentType: 'percentage',
      adjustmentValue: 10,
      learners: 99,
      roundingRuleType: 'nearest_10',
      overrideEnabled: false
    });

    // 1200 * 1.10 = 1320; 1320 / 99 = 13.333...
    expect(result.adjustedCost).toBe(1320);
    expect(result.costPerLearner).toBeCloseTo(13.33, 2);
    expect(result.autoPricePerLearner).toBe(20);
    expect(result.finalPricePerLearner).toBe(20);
    expect(result.finalAmount).toBe(1980);
  });

  it('supports custom round-up and manual override with margin impact', () => {
    const result = computeExaminationPricing({
      productionCost: 500,
      adjustmentType: 'fixed',
      adjustmentValue: 0,
      learners: 25,
      roundingRuleType: 'custom',
      roundingValue: 7,
      overrideEnabled: true,
      manualPricePerLearner: 30
    });

    // auto = ceil((500/25)/7) * 7 = ceil(20/7)*7 = 21
    expect(result.autoPricePerLearner).toBe(21);
    expect(result.finalPricePerLearner).toBe(30);
    expect(result.finalAmount).toBe(750);
    expect(result.marginImpact).toBeCloseTo(42.86, 2);
  });

  it('ignores manual price when override is disabled', () => {
    const result = computeExaminationPricing({
      productionCost: 500,
      adjustmentType: 'fixed',
      adjustmentValue: 0,
      learners: 25,
      roundingRuleType: 'custom',
      roundingValue: 7,
      overrideEnabled: false,
      manualPricePerLearner: 30
    });

    expect(result.autoPricePerLearner).toBe(21);
    expect(result.finalPricePerLearner).toBe(21);
    expect(result.marginImpact).toBe(0);
  });

  it('uses precomputed adjustment total for mixed adjustments', () => {
    const result = computeExaminationPricing({
      productionCost: 1000,
      adjustmentType: 'percentage',
      adjustmentValue: 10,
      precomputedAdjustmentTotal: 400, // e.g. 10% + fixed components already aggregated
      learners: 100,
      roundingRuleType: 'none',
      overrideEnabled: false
    });

    expect(result.adjustedCost).toBe(1400);
    expect(result.costPerLearner).toBe(14);
    expect(result.autoPricePerLearner).toBe(14);
    expect(result.finalAmount).toBe(1400);
  });

  it('does not apply rounding when rounding rule is none even if a rounding method is present', () => {
    const result = computeExaminationPricing({
      productionCost: 1045,
      adjustmentType: 'fixed',
      adjustmentValue: 0,
      learners: 10,
      roundingRuleType: 'none',
      roundingMethod: 'ALWAYS_UP_50',
      overrideEnabled: false
    });

    expect(result.costPerLearner).toBe(104.5);
    expect(result.autoPricePerLearner).toBe(104.5);
    expect(result.finalPricePerLearner).toBe(104.5);
    expect(result.finalAmount).toBe(1045);
    expect(result.roundingDifference).toBe(0);
  });

  it('recalculates only eligible open jobs and reports summary', async () => {
    const listSpy = vi.spyOn(examinationJobService as unknown as { listAllJobs: () => Promise<any[]> }, 'listAllJobs').mockResolvedValue([
      { id: 'job-draft', class_name: 'Draft', status: 'Draft', pricing_locked: false },
      { id: 'job-locked', class_name: 'Locked', status: 'Calculated', pricing_locked: true },
      { id: 'job-overridden', class_name: 'Overridden', status: 'Overridden', pricing_locked: false },
      { id: 'job-fail', class_name: 'Failing', status: 'Calculated', pricing_locked: false },
      { id: 'job-approved', class_name: 'Approved', status: 'Approved', pricing_locked: false }
    ]);

    const recalcSpy = vi.spyOn(examinationJobService, 'recalculateExam').mockImplementation(async (examId: string) => {
      if (examId === 'job-fail') {
        throw new Error('forced failure');
      }
      return { job: { id: examId }, subjects: [] } as ExaminationJobState;
    });

    const summary = await examinationJobService.recalculateOpenJobs();

    expect(summary.total_jobs).toBe(5);
    expect(summary.eligible_jobs).toBe(4);
    expect(summary.skipped_locked).toBe(1);
    expect(summary.recalculated_jobs).toBe(2);
    expect(summary.failed_jobs).toBe(1);
    expect(summary.success).toBe(false);
    expect(summary.errors[0]?.job_id).toBe('job-fail');
    expect(recalcSpy).toHaveBeenCalledTimes(3);

    listSpy.mockRestore();
    recalcSpy.mockRestore();
  });
});
