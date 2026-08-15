import { ExaminationSubject } from '../types';
import { roundMoney, roundUpToStep as _roundUpToStep, calculateMargin } from './roundingUtils';
import { calculateExaminationBomCost } from '../src/domain/examination/pricingEngine';

export const roundCurrency = roundMoney;

export const roundUpToStep = (value: number, step: number) => _roundUpToStep(value, Math.max(1, Math.round(Number(step) || 50)));

export type EffectiveMarginLike = Parameters<typeof calculateMargin>[1];
export const resolveMarginAmount = calculateMargin;

export const calculateLocalClassPreviewBase = (
  subjects: ExaminationSubject[],
  learners: number,
  paperUnitCost: number,
  tonerUnitCost: number,
  paperConversionRate: number,
  tonerPagesPerUnit: number,
  adjustments: any[]
) => {
  const safeLearners = Math.max(0, Math.floor(Number(learners) || 0));
  const bom = calculateExaminationBomCost(
    subjects,
    safeLearners || 1,
    paperUnitCost,
    tonerUnitCost,
    paperConversionRate,
    tonerPagesPerUnit
  );
  const { totalSheets, totalPages, paperCost, tonerCost, totalBomCost } = bom;

  const marketAdjustmentTotal = roundCurrency((adjustments || []).reduce((sum, adjustment) => {
    const type = String(adjustment?.type || '').toUpperCase();
    const rawValue = Number(adjustment?.value ?? adjustment?.percentage ?? 0) || 0;
    const amount = type === 'FIXED'
      ? roundCurrency(rawValue * totalPages)
      : roundCurrency(totalBomCost * (rawValue / 100));
    return sum + amount;
  }, 0));

  const paperQuantity = totalSheets / Math.max(1, Number(paperConversionRate) || 500);
  const tonerQuantity = totalPages / Math.max(1, Number(tonerPagesPerUnit) || 20000);

  return {
    totalSheets,
    totalPages,
    paperQuantity,
    tonerQuantity,
    paperCost,
    tonerCost,
    totalBomCost,
    marketAdjustmentTotal
  };
};

export const calculateRoundedClassPreview = ({
  totalBomCost,
  marketAdjustmentTotal,
  learners,
  margin,
  roundingStep = 50
}: {
  totalBomCost: number;
  marketAdjustmentTotal: number;
  learners: number;
  margin?: EffectiveMarginLike;
  roundingStep?: number;
}) => {
  const safeLearners = Math.max(0, Math.floor(Number(learners) || 0));
  const safeBomCost = roundCurrency(totalBomCost);
  const safeMarketAdjustmentTotal = roundCurrency(marketAdjustmentTotal);
  const subtotalBeforeMargin = roundCurrency(safeBomCost + safeMarketAdjustmentTotal);
  const marginAmount = resolveMarginAmount(subtotalBeforeMargin, margin);
  const preRoundedTotal = roundCurrency(subtotalBeforeMargin + marginAmount);

  if (safeLearners <= 0) {
    return {
      marginAmount,
      roundingAdjustment: 0,
      totalAdjustments: safeMarketAdjustmentTotal,
      totalCost: preRoundedTotal,
      expectedFeePerLearner: 0,
      calculatedTotalCost: preRoundedTotal
    };
  }

  const rawFeePerLearner = roundCurrency(preRoundedTotal / safeLearners);
  const expectedFeePerLearner = roundUpToStep(rawFeePerLearner, roundingStep);
  const totalCost = roundCurrency(expectedFeePerLearner * safeLearners);
  const roundingAdjustment = roundCurrency(Math.max(0, totalCost - preRoundedTotal));

  return {
    marginAmount,
    marketAdjustmentTotal: safeMarketAdjustmentTotal,
    roundingAdjustment,
    totalAdjustments: roundCurrency(safeMarketAdjustmentTotal + roundingAdjustment),
    totalCost,
    expectedFeePerLearner,
    calculatedTotalCost: totalCost
  };
};
