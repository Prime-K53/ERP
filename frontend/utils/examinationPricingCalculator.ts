import { ExaminationBatch, MarketAdjustment } from '../types';
import { calculateExaminationBatchPricing } from '../src/domain/examination/pricingEngine';
import { roundMoney } from './roundingUtils';

export interface PricingSettings {
  paper_item_id: string | null;
  paper_item_name: string | null;
  paper_unit_cost: number;
  toner_item_id: string | null;
  toner_item_name: string | null;
  toner_unit_cost: number;
  conversion_rate: number;
  adjustment_rate?: number;
  profit_margin?: number;
  constants?: {
    toner_pages_per_unit?: number;
  };
  active_adjustments: Array<{
    id: string;
    name: string;
    type: string;
    value: number;
    percentage: number;
    sort_order?: number;
  }>;
}

export interface ClassPricingResult {
  classId: string;
  className: string;
  learners: number;
  totalSheets: number;
  totalPages: number;
  totalBomCost: number;
  totalAdjustments: number;
  totalCost: number;
  marketAdjustmentTotal?: number;
  roundingAdjustment?: number;
  // Three Critical Financial Metrics (Examination Pricing Redesign)
  expectedFeePerLearner: number;     // Mirrors Pricing Settings calculation exactly
  finalFeePerLearner: number;        // Mutable, initialized = expectedFeePerLearner
  liveTotalPreview: number;          // Final Fee × Learner Count (real-time)
}

export interface BatchPricingResult {
  classes: ClassPricingResult[];
}

export const calculateBatchPricing = (
  batch: ExaminationBatch | null | undefined,
  settings: PricingSettings | null,
  activeAdjustments: MarketAdjustment[]
): BatchPricingResult => {
  return calculateExaminationBatchPricing(batch, settings, activeAdjustments);
};

/**
 * Get the expected fee per learner for a specific class from the batch pricing calculation
 */
export const getExpectedFeePerLearner = (
  batch: ExaminationBatch | null | undefined,
  settings: PricingSettings | null,
  activeAdjustments: MarketAdjustment[],
  classId: string
): number => {
  const result = calculateBatchPricing(batch, settings, activeAdjustments);
  const classResult = result.classes.find(cls => cls.classId === classId);
  return classResult ? classResult.expectedFeePerLearner : 0;
};

/**
 * Get the live total preview for a specific class (final fee per learner × number of learners)
 * Updated to use the new final_fee_per_learner field
 */
export const getLiveTotalPreview = (
  batch: ExaminationBatch | null | undefined,
  settings: PricingSettings | null,
  activeAdjustments: MarketAdjustment[],
  classId: string
): number => {
  // First try to get from the persisted final_fee_per_learner
  const cls = batch?.classes?.find(c => c.id === classId);
  if (cls?.final_fee_per_learner !== undefined && cls?.final_fee_per_learner !== null) {
    const learners = Math.max(1, Math.floor(Number(cls?.number_of_learners) || 0));
    return roundMoney(Number(cls.final_fee_per_learner * learners) || 0);
  }
  
  // Fallback to calculated value
  const expectedFee = getExpectedFeePerLearner(batch, settings, activeAdjustments, classId);
  const learners = Math.max(1, Math.floor(Number(cls?.number_of_learners) || 0));
  return roundMoney(Number(expectedFee * learners) || 0);
};

/**
 * Get the final fee per learner for a specific class
 * Uses the new final_fee_per_learner field with fallback to expected fee
 */
export const getFinalFeePerLearner = (
  batch: ExaminationBatch | null | undefined,
  settings: PricingSettings | null,
  activeAdjustments: MarketAdjustment[],
  classId: string
): number => {
  // First try to get from the persisted final_fee_per_learner
  const cls = batch?.classes?.find(c => c.id === classId);
  if (cls?.final_fee_per_learner !== undefined && cls?.final_fee_per_learner !== null) {
    return cls.final_fee_per_learner;
  }
  
  // Fallback to calculated expected fee
  return getExpectedFeePerLearner(batch, settings, activeAdjustments, classId);
};
