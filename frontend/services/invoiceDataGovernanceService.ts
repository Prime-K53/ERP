import { ExaminationBatch, ExaminationClass, InvoiceGenerationClassLine } from '../types';
import { logger } from '@/services/logger';

/**
 * Invoice Data Governance Service
 * 
 * Enforces strict data governance protocols ensuring that exclusively
 * the Final Fee per Learner and Live Total Preview values propagate
 * to invoice generation systems.
 * 
 * These values appear respectively as:
 * - Unit Price on invoice line items (final_fee_per_learner)
 * - Total Amount on invoice line items (live_total_preview)
 */

export interface InvoiceGenerationPayload {
  batchId: string;
  currency: string;
  lineItems: InvoiceGenerationClassLine[];
  metadata: {
    totalClasses: number;
    totalLearners: number;
    grandTotal: number;
    generatedAt: string;
  };
}

export interface GovernanceValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  validatedClasses: number;
}

/**
 * STRICT DATA GOVERNANCE: Only these fields are allowed for invoice generation
 * 
 * - unitPrice: Must come from final_fee_per_learner
 * - totalAmount: Must come from live_total_preview
 * 
 * @param batch - The examination batch with classes
 * @returns InvoiceGenerationPayload with strictly governed fields
 * @throws Error if required fields are missing or invalid
 */
export function validateAndBuildInvoicePayload(
  batch: ExaminationBatch
): InvoiceGenerationPayload {
  const errors: string[] = [];
  const warnings: string[] = [];
  
  if (!batch.classes || batch.classes.length === 0) {
    throw new Error('Cannot generate invoice: Batch has no classes');
  }
  
  const lineItems: InvoiceGenerationClassLine[] = batch.classes.map((cls, index) => {
    const rowNum = index + 1;
    
    // STRICT ENFORCEMENT: Validate final_fee_per_learner
    if (cls.final_fee_per_learner === undefined || cls.final_fee_per_learner === null) {
      errors.push(`Class ${rowNum} (${cls.class_name}): final_fee_per_learner is not populated`);
    }
    
    // STRICT ENFORCEMENT: Validate live_total_preview
    if (cls.live_total_preview === undefined || cls.live_total_preview === null) {
      errors.push(`Class ${rowNum} (${cls.class_name}): live_total_preview is not populated`);
    }
    
    // Validate learner count
    const learnerCount = Math.max(0, Math.floor(Number(cls.number_of_learners) || 0));
    if (learnerCount === 0) {
      warnings.push(`Class ${rowNum} (${cls.class_name}): Has zero learners`);
    }
    
    // Data consistency check: live_total_preview should equal final_fee × learners
    const expectedTotal = (cls.final_fee_per_learner || 0) * learnerCount;
    const actualTotal = cls.live_total_preview || 0;
    const variance = Math.abs(expectedTotal - actualTotal);
    
    if (variance > 0.01) {
      warnings.push(
        `Class ${rowNum} (${cls.class_name}): Live Total variance detected. ` +
        `Expected: ${expectedTotal.toFixed(2)}, Actual: ${actualTotal.toFixed(2)}`
      );
    }
    
    return {
      classId: cls.id,
      className: cls.class_name,
      // GOVERNED FIELD: Unit Price MUST be final_fee_per_learner
      unitPrice: cls.final_fee_per_learner || 0,
      // GOVERNED FIELD: Total Amount MUST be live_total_preview
      totalAmount: cls.live_total_preview || 0,
      learners: learnerCount
    };
  });
  
  // If any errors found, throw and prevent invoice generation
  if (errors.length > 0) {
    const errorMessage = `Invoice Data Governance Validation Failed:\n${errors.join('\n')}`;
    logger.error('[DataGovernance]', errorMessage);
    throw new Error(errorMessage);
  }
  
  // Log warnings but allow generation to proceed
  if (warnings.length > 0) {
    console.warn('[DataGovernance] Warnings during validation:', warnings);
  }
  
  const grandTotal = lineItems.reduce((sum, item) => sum + item.totalAmount, 0);
  const totalLearners = lineItems.reduce((sum, item) => sum + item.learners, 0);
  
  return {
    batchId: batch.id,
    currency: batch.currency || 'MWK',
    lineItems,
    metadata: {
      totalClasses: lineItems.length,
      totalLearners,
      grandTotal,
      generatedAt: new Date().toISOString()
    }
  };
}

/**
 * Pre-validation check - can be used to verify data before attempting invoice generation
 * 
 * @param batch - The examination batch to validate
 * @returns GovernanceValidationResult with validation status and any issues
 */
export function preValidateForInvoiceGeneration(
  batch: ExaminationBatch
): GovernanceValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  let validatedClasses = 0;
  
  if (!batch.classes || batch.classes.length === 0) {
    return {
      isValid: false,
      errors: ['Batch has no classes'],
      warnings: [],
      validatedClasses: 0
    };
  }
  
  batch.classes.forEach((cls, index) => {
    const rowNum = index + 1;
    let hasError = false;
    
    // Check for required financial metrics
    if (cls.final_fee_per_learner === undefined || cls.final_fee_per_learner === null) {
      errors.push(`Class ${rowNum} (${cls.class_name}): Missing final_fee_per_learner`);
      hasError = true;
    }
    
    if (cls.live_total_preview === undefined || cls.live_total_preview === null) {
      errors.push(`Class ${rowNum} (${cls.class_name}): Missing live_total_preview`);
      hasError = true;
    }
    
    // Check for zero values that might indicate calculation issues
    if (cls.final_fee_per_learner === 0) {
      warnings.push(`Class ${rowNum} (${cls.class_name}): final_fee_per_learner is zero`);
    }
    
    if (cls.live_total_preview === 0) {
      warnings.push(`Class ${rowNum} (${cls.class_name}): live_total_preview is zero`);
    }
    
    if (!hasError) {
      validatedClasses++;
    }
  });
  
  return {
    isValid: errors.length === 0,
    errors,
    warnings,
    validatedClasses
  };
}

/**
 * Utility to check if a class has all required financial metrics populated
 * 
 * @param cls - The examination class to check
 * @returns boolean indicating if class is ready for invoice generation
 */
export function isClassReadyForInvoice(cls: ExaminationClass): boolean {
  return (
    cls.final_fee_per_learner !== undefined &&
    cls.final_fee_per_learner !== null &&
    cls.live_total_preview !== undefined &&
    cls.live_total_preview !== null &&
    cls.final_fee_per_learner >= 0 &&
    cls.live_total_preview >= 0
  );
}

/**
 * Get a summary of financial metrics for all classes in a batch
 * Useful for reporting and verification
 * 
 * @param batch - The examination batch
 * @returns Summary object with financial breakdown
 */
export function getBatchFinancialSummary(batch: ExaminationBatch) {
  if (!batch.classes || batch.classes.length === 0) {
    return {
      totalClasses: 0,
      classesWithMetrics: 0,
      classesMissingMetrics: 0,
      totalExpectedFees: 0,
      totalFinalFees: 0,
      totalLiveTotals: 0,
      readyForInvoice: false
    };
  }
  
  const classesWithMetrics = batch.classes.filter(isClassReadyForInvoice).length;
  
  const totals = batch.classes.reduce(
    (acc, cls) => ({
      expectedFees: acc.expectedFees + (cls.expected_fee_per_learner || 0),
      finalFees: acc.finalFees + (cls.final_fee_per_learner || 0),
      liveTotals: acc.liveTotals + (cls.live_total_preview || 0)
    }),
    { expectedFees: 0, finalFees: 0, liveTotals: 0 }
  );
  
  return {
    totalClasses: batch.classes.length,
    classesWithMetrics,
    classesMissingMetrics: batch.classes.length - classesWithMetrics,
    totalExpectedFees: totals.expectedFees,
    totalFinalFees: totals.finalFees,
    totalLiveTotals: totals.liveTotals,
    readyForInvoice: classesWithMetrics === batch.classes.length
  };
}
