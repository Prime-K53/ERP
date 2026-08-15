import { ExaminationClass, OverrideCascadeResult } from '../types';

const roundMoney = (value: number) => Math.round((Number(value) || 0) * 100) / 100;

/**
 * Real-time override cascade handler
 * Triggered immediately when user inputs override amount
 * Updates Final Fee per Learner and cascades to Live Total Preview
 * 
 * @param classData - The examination class data
 * @param overrideAmount - The new override amount entered by user
 * @param userId - The ID of the user making the change
 * @returns OverrideCascadeResult with before/after values
 */
export function handleOverrideCascade(
  classData: ExaminationClass,
  overrideAmount: number,
  userId: string
): OverrideCascadeResult {
  const previousFinalFee = classData.final_fee_per_learner ?? classData.expected_fee_per_learner ?? 0;
  const newFinalFee = roundMoney(overrideAmount);
  const learnerCount = Math.max(1, Math.floor(Number(classData.number_of_learners) || 0));
  
  // Immediate recalculation of Live Total Preview
  // Formula: Live Total Preview = Final Fee per Learner × Number of Learners
  const newLiveTotal = roundMoney(newFinalFee * learnerCount);
  
  return {
    classId: classData.id,
    previousFinalFee,
    newFinalFee,
    previousLiveTotal: classData.live_total_preview ?? roundMoney(previousFinalFee * learnerCount),
    newLiveTotal,
    learnerCount,
    updatedAt: new Date().toISOString()
  };
}

/**
 * Validates that the override amount is acceptable
 * 
 * @param overrideAmount - The proposed override amount
 * @param expectedFee - The calculated expected fee (for comparison/warning)
 * @returns Validation result with isValid flag and optional warning
 */
export function validateOverrideAmount(
  overrideAmount: number,
  expectedFee?: number
): { isValid: boolean; error?: string; warning?: string } {
  if (!Number.isFinite(overrideAmount)) {
    return { isValid: false, error: 'Override amount must be a valid number' };
  }
  
  if (overrideAmount < 0) {
    return { isValid: false, error: 'Override amount cannot be negative' };
  }
  
  if (overrideAmount === 0) {
    return { isValid: false, error: 'Override amount must be greater than zero' };
  }
  
  // Warning if override is significantly different from expected
  if (expectedFee && expectedFee > 0) {
    const difference = Math.abs(overrideAmount - expectedFee);
    const percentDiff = (difference / expectedFee) * 100;
    
    if (percentDiff > 50) {
      return {
        isValid: true,
        warning: `Override is ${percentDiff.toFixed(0)}% different from expected fee. Please verify.`
      };
    }
  }
  
  return { isValid: true };
}

/**
 * Calculate the live total preview without mutating the class data
 * Used for real-time UI previews before persistence
 * 
 * @param finalFeePerLearner - The final fee per learner
 * @param numberOfLearners - The number of learners
 * @returns The calculated live total preview
 */
export function calculateLiveTotalPreview(
  finalFeePerLearner: number,
  numberOfLearners: number
): number {
  const learners = Math.max(1, Math.floor(Number(numberOfLearners) || 0));
  const fee = roundMoney(finalFeePerLearner);
  return roundMoney(fee * learners);
}
