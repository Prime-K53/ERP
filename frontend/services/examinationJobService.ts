import {
  AdjustmentSnapshot,
  BillOfMaterial,
  BOMTemplate,
  ExaminationAdjustmentType,
  ExaminationGroupPayload,
  ExaminationInvoiceGroup,
  ExaminationInvoiceGroupJobLine,
  ExaminationJob,
  ExaminationJobPayload,
  ExaminationJobSubject,
  ExaminationRecurringPayload,
  ExaminationRecurringFrequency,
  ExaminationRecurringProfile,
  ExaminationRoundingRuleType,
  Invoice,
  Item,
  MarketAdjustment,
  MarketAdjustmentTransaction,
  PricingRoundingMethod
} from '../types';
import { dbService } from './db';
import { examinationDb } from './examinationDb';
import { isMarketAdjustmentActive } from '../utils/marketAdjustmentUtils';
import { generateNextId, roundToCurrency } from '../utils/helpers';
import { generateNextSalesInvoiceNumber } from './documentNumberService';
import { productionCostService } from './productionCostService';
import { inventoryTransactionService } from './inventoryTransactionService';
import { EXAM_HIDDEN_BOM_TEMPLATE_ID } from './examHiddenBomService';
import { transactionService } from './transactionService';
import { applyRounding, recordRoundingAnalytics } from './pricingRoundingService';
import { logRoundingEvent } from './roundingAnalyticsService';

const JOB_EDIT_LOCKED_STATUSES: ExaminationJob['status'][] = ['Approved', 'Invoiced'];
const EXAMINATION_CALCULATION_VERSION = 2;

const ID_SUFFIX = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const toNumber = (value: unknown, fallback = 0): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const toPositiveInt = (value: unknown, fallback = 0): number => {
  return Math.max(0, Math.floor(toNumber(value, fallback)));
};

const toSafeAdjustmentType = (value: unknown): ExaminationAdjustmentType => {
  return value === 'percentage' ? 'percentage' : 'fixed';
};

const toSafeMarketAdjustmentType = (value: unknown): 'PERCENTAGE' | 'FIXED' | 'PERCENT' => {
  const normalized = String(value || '').toUpperCase();
  if (normalized === 'FIXED') return 'FIXED';
  if (normalized === 'PERCENT') return 'PERCENT';
  return 'PERCENTAGE';
};

const toSafeRoundingType = (value: unknown): ExaminationRoundingRuleType => {
  const allowed: ExaminationRoundingRuleType[] = ['none', 'nearest_10', 'nearest_50', 'nearest_100', 'custom'];
  return allowed.includes(value as ExaminationRoundingRuleType) ? value as ExaminationRoundingRuleType : 'none';
};

const toSafeRoundingMethod = (value: unknown): PricingRoundingMethod => {
  const allowed: PricingRoundingMethod[] = [
    'NEAREST_10',
    'NEAREST_50',
    'NEAREST_100',
    'ALWAYS_UP_10',
    'ALWAYS_UP_50',
    'ALWAYS_UP_100',
    'ALWAYS_UP_500',
    'ALWAYS_UP_CUSTOM',
    'PSYCHOLOGICAL'
  ];
  return allowed.includes(value as PricingRoundingMethod)
    ? value as PricingRoundingMethod
    : 'ALWAYS_UP_50';
};

interface ResolvedExamRoundingConfig {
  roundingMethod?: PricingRoundingMethod;
  roundingRuleType: ExaminationRoundingRuleType;
  roundingValue: number;
}

const resolvePersistedExamRounding = (input: {
  roundingRuleType?: unknown;
  roundingMethod?: unknown;
  roundingValue?: unknown;
  fallbackRuleType?: unknown;
  fallbackMethod?: unknown;
  fallbackValue?: unknown;
}): ResolvedExamRoundingConfig => {
  const effectiveValue = input.roundingValue !== undefined
    ? input.roundingValue
    : (input.fallbackValue !== undefined ? input.fallbackValue : 0);
  const safeValue = Math.max(0, toNumber(effectiveValue, 0));
  const hasExplicitRule = input.roundingRuleType !== undefined;
  const hasExplicitMethod = input.roundingMethod !== undefined;

  if (hasExplicitRule) {
    const explicitRule = toSafeRoundingType(input.roundingRuleType);
    if (explicitRule === 'none') {
      return {
        roundingMethod: undefined,
        roundingRuleType: 'none',
        roundingValue: 0
      };
    }

    const explicitMethod = hasExplicitMethod
      ? toSafeRoundingMethod(input.roundingMethod)
      : toSafeRoundingMethod(getEngineMethodFromExamRounding(explicitRule, safeValue));
    const mapped = getExamRoundingFromEngineMethod(explicitMethod, safeValue);
    return {
      roundingMethod: explicitMethod,
      roundingRuleType: mapped.roundingRuleType,
      roundingValue: Math.max(0, toNumber(mapped.roundingValue, 0))
    };
  }

  if (hasExplicitMethod) {
    const explicitMethod = toSafeRoundingMethod(input.roundingMethod);
    const mapped = getExamRoundingFromEngineMethod(explicitMethod, safeValue);
    return {
      roundingMethod: explicitMethod,
      roundingRuleType: mapped.roundingRuleType,
      roundingValue: Math.max(0, toNumber(mapped.roundingValue, 0))
    };
  }

  const fallbackRule = toSafeRoundingType(input.fallbackRuleType);
  if (fallbackRule === 'none') {
    return {
      roundingMethod: undefined,
      roundingRuleType: 'none',
      roundingValue: 0
    };
  }

  const fallbackMethod = input.fallbackMethod !== undefined
    ? toSafeRoundingMethod(input.fallbackMethod)
    : toSafeRoundingMethod(getEngineMethodFromExamRounding(fallbackRule, safeValue));
  const mapped = getExamRoundingFromEngineMethod(fallbackMethod, safeValue);
  return {
    roundingMethod: fallbackMethod,
    roundingRuleType: mapped.roundingRuleType,
    roundingValue: Math.max(0, toNumber(mapped.roundingValue, 0))
  };
};

export const getExamRoundingFromEngineMethod = (
  method: PricingRoundingMethod,
  customStep?: number
): { roundingRuleType: ExaminationRoundingRuleType; roundingValue: number } => {
  if (method === 'NEAREST_10' || method === 'ALWAYS_UP_10') {
    return { roundingRuleType: 'nearest_10', roundingValue: 10 };
  }
  if (method === 'NEAREST_50' || method === 'ALWAYS_UP_50') {
    return { roundingRuleType: 'nearest_50', roundingValue: 50 };
  }
  if (method === 'NEAREST_100' || method === 'ALWAYS_UP_100') {
    return { roundingRuleType: 'nearest_100', roundingValue: 100 };
  }
  if (method === 'ALWAYS_UP_500') {
    return { roundingRuleType: 'custom', roundingValue: 500 };
  }
  if (method === 'ALWAYS_UP_CUSTOM') {
    return { roundingRuleType: 'custom', roundingValue: Math.max(1, toPositiveInt(customStep, 50)) };
  }

  // Psychological rounding is not represented in legacy exam rounding fields.
  // Persist as custom with default 10-step while tracking actual engine method separately.
  return { roundingRuleType: 'custom', roundingValue: Math.max(1, toPositiveInt(customStep, 10)) };
};

export const getEngineMethodFromExamRounding = (
  roundingType: ExaminationRoundingRuleType,
  customStep?: number
): PricingRoundingMethod => {
  if (roundingType === 'nearest_10') return 'ALWAYS_UP_10';
  if (roundingType === 'nearest_50') return 'ALWAYS_UP_50';
  if (roundingType === 'nearest_100') return 'ALWAYS_UP_100';
  if (roundingType === 'custom') {
    const step = Math.max(1, toPositiveInt(customStep, 50));
    if (step === 10) return 'ALWAYS_UP_10';
    if (step === 50) return 'ALWAYS_UP_50';
    if (step === 100) return 'ALWAYS_UP_100';
    if (step === 500) return 'ALWAYS_UP_500';
    return 'ALWAYS_UP_CUSTOM';
  }
  return 'ALWAYS_UP_50';
};

const toISODateTime = (value?: string) => {
  const parsed = value ? new Date(value) : new Date();
  if (Number.isNaN(parsed.getTime())) return new Date().toISOString();
  return parsed.toISOString();
};

const toISODateOnly = (value?: string) => {
  const parsed = value ? new Date(value) : new Date();
  if (Number.isNaN(parsed.getTime())) return new Date().toISOString().split('T')[0];
  return parsed.toISOString().split('T')[0];
};

const addFrequency = (date: string, frequency: ExaminationRecurringFrequency) => {
  const base = new Date(date);
  const safeBase = Number.isNaN(base.getTime()) ? new Date() : base;
  const next = new Date(safeBase);
  if (frequency === 'weekly') next.setDate(next.getDate() + 7);
  if (frequency === 'monthly') next.setMonth(next.getMonth() + 1);
  if (frequency === 'termly') next.setMonth(next.getMonth() + 4);
  return next.toISOString();
};

const isDue = (nextRunDate: string, asOf: Date) => {
  const next = new Date(nextRunDate);
  if (Number.isNaN(next.getTime())) return false;
  return next.getTime() <= asOf.getTime();
};

const hasLockedStatus = (status: ExaminationJob['status']) => {
  return JOB_EDIT_LOCKED_STATUSES.includes(status);
};

export interface ExaminationPricingComputationInput {
  productionCost: number;
  adjustmentType: ExaminationAdjustmentType;
  adjustmentValue: number;
  precomputedAdjustmentTotal?: number;
  learners: number;
  roundingMethod?: PricingRoundingMethod;
  roundingRuleType: ExaminationRoundingRuleType;
  roundingValue?: number;
  overrideEnabled: boolean;
  manualPricePerLearner?: number;
}

export interface ExaminationPricingComputationResult {
  adjustedCost: number;
  costPerLearner: number;
  unroundedPricePerLearner: number;
  autoPricePerLearner: number;
  roundingMethod: PricingRoundingMethod;
  roundingDifference: number;
  finalPricePerLearner: number;
  finalAmount: number;
  marginImpact: number;
}

export const computeExaminationPricing = (
  input: ExaminationPricingComputationInput
): ExaminationPricingComputationResult => {
  const safeLearners = Math.max(1, toPositiveInt(input.learners));
  const safeProductionCost = toNumber(input.productionCost);
  const safeAdjustmentValue = toNumber(input.adjustmentValue);
  const precomputedAdjustmentTotal = input.precomputedAdjustmentTotal === undefined
    ? null
    : roundToCurrency(toNumber(input.precomputedAdjustmentTotal));

  let adjustedCost = safeProductionCost;
  if (precomputedAdjustmentTotal !== null) {
    // Use exact adjustment total when caller already resolved mixed adjustments.
    adjustedCost = safeProductionCost + precomputedAdjustmentTotal;
  } else if (input.adjustmentType === 'fixed') {
    adjustedCost = safeProductionCost + safeAdjustmentValue;
  } else if (input.adjustmentType === 'percentage') {
    adjustedCost = safeProductionCost * (1 + (safeAdjustmentValue / 100));
  }

  const roundedAdjustedCost = roundToCurrency(adjustedCost);
  const unroundedPricePerLearner = roundedAdjustedCost / safeLearners;

  const shouldBypassRounding = input.roundingRuleType === 'none';
  const resolvedRoundingMethod = toSafeRoundingMethod(
    input.roundingMethod || getEngineMethodFromExamRounding(input.roundingRuleType, input.roundingValue)
  );

  const roundingResult = shouldBypassRounding
    ? {
      roundedPrice: roundToCurrency(unroundedPricePerLearner),
      methodUsed: resolvedRoundingMethod,
      roundingDifference: 0
    }
    : applyRounding(unroundedPricePerLearner, {
      method: resolvedRoundingMethod,
      customStep: Math.max(1, toPositiveInt(input.roundingValue, 50)),
      // Examination pricing must always round up to protect margin.
      profitProtectionMode: true,
      enableSmartThresholds: false
    });

  const autoPrice = roundToCurrency(roundingResult.roundedPrice);
  const manualPrice = toNumber(input.manualPricePerLearner);
  const finalPrice = input.overrideEnabled && manualPrice > 0 ? manualPrice : autoPrice;
  const finalAmount = roundToCurrency(safeLearners * finalPrice);
  const marginImpact = autoPrice > 0 ? ((finalPrice - autoPrice) / autoPrice) * 100 : 0;

  return {
    adjustedCost: roundedAdjustedCost,
    costPerLearner: roundToCurrency(unroundedPricePerLearner),
    unroundedPricePerLearner: roundToCurrency(unroundedPricePerLearner),
    autoPricePerLearner: autoPrice,
    roundingMethod: roundingResult.methodUsed,
    roundingDifference: roundToCurrency(roundingResult.roundingDifference),
    finalPricePerLearner: roundToCurrency(finalPrice),
    finalAmount,
    marginImpact: roundToCurrency(marginImpact)
  };
};

const buildJobLineFromJob = (job: ExaminationJob): ExaminationInvoiceGroupJobLine => ({
  examination_job_id: job.id,
  class_name: job.class_name,
  learners: job.number_of_learners,
  price_per_learner: roundToCurrency(job.final_price_per_learner || 0),
  amount: roundToCurrency(job.final_amount || 0)
});

const buildInvoiceItemFromJob = (job: ExaminationJob) => {
  const quantity = Math.max(0, toPositiveInt(job.number_of_learners));
  const unitPrice = roundToCurrency(job.final_price_per_learner || 0);
  const total = roundToCurrency(quantity * unitPrice);

  return {
    id: `EXAM-LINE-${job.id}`,
    sku: `EXAM-${job.id}`,
    name: `Exam Printing - ${job.class_name}`,
    category: 'Examination',
    type: 'Service',
    attributes: {
      examination_job_id: job.id,
      exam_name: job.exam_name,
      class_name: job.class_name
    },
    price: unitPrice,
    cost: roundToCurrency(job.cost_per_learner || 0),
    stock: 0,
    pages: 0,
    quantity,
    discount: 0,
    total
  } as any;
};

export interface ExaminationJobState {
  job: ExaminationJob;
  subjects: ExaminationJobSubject[];
}

class ExaminationJobService {
  private async syncJobToCloud(job: ExaminationJob): Promise<void> {
    try {
      await dbService.put('examinationJobs', job);
    } catch {
    }
  }

  private async deleteJobFromCloud(id: string): Promise<void> {
    try {
      await dbService.delete('examinationJobs', id);
    } catch {
    }
  }

  private async listAllJobs() {
    return examinationDb.examinationJobs.toArray();
  }

  private async listAllSubjects() {
    return examinationDb.examinationJobSubjects.toArray();
  }

  private async listAllGroups() {
    return examinationDb.examinationInvoiceGroups.toArray();
  }

  private async listAllRecurringProfiles() {
    return examinationDb.examinationRecurringProfiles.toArray();
  }

  private async syncGroupLineForJob(job: ExaminationJob): Promise<ExaminationJob> {
    if (!job.invoice_group_id) {
      return job;
    }

    const group = await examinationDb.examinationInvoiceGroups.get(job.invoice_group_id);
    if (!group) {
      const detachedJob: ExaminationJob = {
        ...job,
        invoice_group_id: undefined,
        updated_at: new Date().toISOString()
      };
      await examinationDb.examinationJobs.put(detachedJob);
      await this.syncJobToCloud(detachedJob);
      return detachedJob;
    }

    if (group.status === 'Invoiced') {
      return job;
    }

    if (group.school_id !== job.school_id) {
      throw new Error('Cannot change school for a job already linked to an invoice group.');
    }

    const updatedLine = buildJobLineFromJob(job);
    const existingLines = group.jobs || [];
    let found = false;
    const nextLines = existingLines.map(line => {
      if (line.examination_job_id !== job.id) return line;
      found = true;
      return updatedLine;
    });

    if (!found) {
      nextLines.push(updatedLine);
    }

    const updatedGroup: ExaminationInvoiceGroup = {
      ...group,
      jobs: nextLines,
      total_amount: roundToCurrency(nextLines.reduce((sum, line) => sum + toNumber(line.amount), 0)),
      updated_at: new Date().toISOString()
    };
    await examinationDb.examinationInvoiceGroups.put(updatedGroup);

    return job;
  }

  private async assertBomExists(bomId: string) {
    if (!bomId) {
      throw new Error('BOM is required.');
    }

    const [boms, templates] = await Promise.all([
      dbService.getAll<BillOfMaterial>('boms'),
      dbService.getAll<BOMTemplate>('bomTemplates')
    ]);

    const found = boms.some(b => b.id === bomId) || templates.some(t => t.id === bomId);
    if (!found) {
      throw new Error(`BOM "${bomId}" does not exist.`);
    }
  }

  private async getDefaultMarketAdjustmentId() {
    const allAdjustments = await dbService.getAll<MarketAdjustment>('marketAdjustments');
    const preferred = allAdjustments.find(isMarketAdjustmentActive);
    return preferred?.id || allAdjustments[0]?.id || '';
  }

  /**
   * Get the default BOM ID for examination jobs
   * Uses the hidden examination BOM template when no specific BOM is provided
   */
  private async getDefaultBOMId(): Promise<string> {
    // First check if there's a user-configured default BOM
    const [boms, templates] = await Promise.all([
      dbService.getAll<BillOfMaterial>('boms'),
      dbService.getAll<BOMTemplate>('bomTemplates')
    ]);
    
    // Look for any examination-related BOM that is marked as default
    const defaultBOM = boms.find(b => (b as any).isDefault === true);
    if (defaultBOM) return defaultBOM.id;
    
    const defaultTemplate = templates.find(t => (t as any).isDefault === true);
    if (defaultTemplate) return defaultTemplate.id;
    
    // Otherwise, use the hidden examination BOM
    const hiddenExamBOM = templates.find(t => t.id === EXAM_HIDDEN_BOM_TEMPLATE_ID);
    if (hiddenExamBOM) return EXAM_HIDDEN_BOM_TEMPLATE_ID;
    
    // Fallback: return any examination BOM if the hidden one doesn't exist yet
    const examBOM = boms.find((bom) => {
      const hint = `${String((bom as any).itemName || '')} ${String(bom.itemId || '')} ${String(bom.id || '')}`.toLowerCase();
      return hint.includes('exam');
    });
    if (examBOM) return examBOM.id;
    
    const examTemplate = templates.find(t => t.name?.toLowerCase().includes('examination'));
    if (examTemplate) return examTemplate.id;
    
    // Last resort: return the hidden BOM ID anyway (will be created on first use)
    return EXAM_HIDDEN_BOM_TEMPLATE_ID;
  }

  /**
   * Get all active market adjustments (not just one)
   * This applies ALL active adjustments from the Market Adjustments module
   */
  private async getAllActiveAdjustments(): Promise<MarketAdjustment[]> {
    const allAdjustments = await dbService.getAll<MarketAdjustment>('marketAdjustments');
    return allAdjustments
      .filter(isMarketAdjustmentActive)
      .sort((a, b) => {
        const sortA = Number(a.sortOrder || 0);
        const sortB = Number(b.sortOrder || 0);
        return sortA - sortB;
      });
  }

  /**
   * Resolve a single adjustment by ID (kept for backward compatibility)
   */
  private async resolveMarketAdjustment(adjustmentId?: string) {
    const id = String(adjustmentId || '').trim();
    if (!id) {
      throw new Error('Adjustment is required.');
    }

    const adjustment = await dbService.get<MarketAdjustment>('marketAdjustments', id);
    if (!adjustment) {
      throw new Error('Selected adjustment was not found in Market Adjustment settings.');
    }

    const marketType = toSafeMarketAdjustmentType(adjustment.type);
    const adjustmentType: ExaminationAdjustmentType = marketType === 'FIXED' ? 'fixed' : 'percentage';
    const adjustmentValue = toNumber(
      marketType === 'FIXED'
        ? adjustment.value
        : (adjustment.percentage ?? adjustment.value)
    );

    return {
      id,
      name: adjustment.displayName || adjustment.name || id,
      adjustmentType,
      adjustmentValue,
      marketType,
      raw: adjustment
    };
  }

  /**
   * Build adjustment snapshots for ALL active adjustments
   * This applies multiple adjustments in sequence (percentage first, then fixed)
   */
  private buildMultiAdjustmentSnapshot(
    examId: string,
    learners: number,
    productionCost: number,
    adjustments: MarketAdjustment[]
  ): {
    adjustmentTotal: number;
    adjustmentSnapshots: AdjustmentSnapshot[];
    adjustmentTransactions: MarketAdjustmentTransaction[];
    combinedPercentage: number;
    combinedFixed: number;
  } {
    let totalPercentage = 0;
    let totalFixed = 0;
    const adjustmentSnapshots: AdjustmentSnapshot[] = [];
    const adjustmentTransactions: MarketAdjustmentTransaction[] = [];
    const safeLearners = Math.max(1, toPositiveInt(learners, 1));
    const safeProductionCost = roundToCurrency(productionCost);

    // Process all active adjustments
    adjustments.forEach((adj, index) => {
      const marketType = toSafeMarketAdjustmentType(adj.type);
      const adjustmentType: ExaminationAdjustmentType = marketType === 'FIXED' ? 'fixed' : 'percentage';
      const adjustmentValue = toNumber(
        marketType === 'FIXED'
          ? adj.value
          : (adj.percentage ?? adj.value)
      );
      
      const adjName = adj.displayName || adj.name || adj.id;
      
      // Calculate based on type
      let calculatedAmount: number;
      if (adjustmentType === 'percentage') {
        // For percentage, apply to base production cost
        calculatedAmount = roundToCurrency(safeProductionCost * (adjustmentValue / 100));
        totalPercentage += adjustmentValue;
      } else {
        // For fixed, multiply by learners to get total fixed amount for the class
        // This ensures fixed adjustments are per-learner charges (e.g., binding, covers)
        calculatedAmount = roundToCurrency(adjustmentValue * safeLearners);
        totalFixed += calculatedAmount;
      }

      // Create snapshot
      const snapshot: AdjustmentSnapshot = {
        name: adjName,
        type: marketType,
        value: adjustmentValue,
        percentage: adjustmentType === 'percentage' ? adjustmentValue : undefined,
        calculatedAmount
      };
      adjustmentSnapshots.push(snapshot);

      // Create transaction record
      const transaction: MarketAdjustmentTransaction = {
        id: `EXAM-ADJ-${examId}-${index}`,
        saleId: examId,
        itemId: examId,
        adjustmentId: adj.id,
        adjustmentName: adjName,
        adjustmentType: marketType,
        adjustmentValue,
        baseAmount: safeProductionCost,
        calculatedAmount,
        quantity: safeLearners,
        unitAmount: safeLearners > 0 ? roundToCurrency(calculatedAmount / safeLearners) : roundToCurrency(calculatedAmount),
        timestamp: new Date().toISOString(),
        status: 'Active',
        notes: `Examination Job adjustment ${index + 1}: ${adjName}`
      };
      adjustmentTransactions.push(transaction);
    });

    // Total adjustment = percentage increase on cost + fixed amount
    const percentageAmount = roundToCurrency(safeProductionCost * (totalPercentage / 100));
    const adjustmentTotal = roundToCurrency(percentageAmount + totalFixed);

    return {
      adjustmentTotal,
      adjustmentSnapshots,
      adjustmentTransactions,
      combinedPercentage: totalPercentage,
      combinedFixed: totalFixed
    };
  }

  /**
   * Build adjustment snapshot for a single adjustment (backward compatibility)
   */
  private buildAdjustmentSnapshot(
    examId: string,
    learners: number,
    productionCost: number,
    resolvedAdjustment: {
      id: string;
      name: string;
      adjustmentType: ExaminationAdjustmentType;
      adjustmentValue: number;
      marketType: 'PERCENTAGE' | 'FIXED' | 'PERCENT';
      raw: MarketAdjustment;
    }
  ): {
    adjustmentTotal: number;
    adjustmentSnapshots: AdjustmentSnapshot[];
    adjustmentTransaction: MarketAdjustmentTransaction;
  } {
    const safeLearners = Math.max(1, toPositiveInt(learners, 1));
    const adjustmentTotal = roundToCurrency(
      resolvedAdjustment.adjustmentType === 'percentage'
        ? productionCost * (resolvedAdjustment.adjustmentValue / 100)
        : resolvedAdjustment.adjustmentValue * safeLearners  // FIXED: Multiply by learners
    );

    const adjustmentSnapshot: AdjustmentSnapshot = {
      name: resolvedAdjustment.name,
      type: resolvedAdjustment.marketType,
      value: resolvedAdjustment.adjustmentValue,
      percentage: resolvedAdjustment.adjustmentType === 'percentage'
        ? resolvedAdjustment.adjustmentValue
        : undefined,
      calculatedAmount: adjustmentTotal
    };

    const adjustmentTransaction: MarketAdjustmentTransaction = {
      id: `EXAM-ADJ-${examId}`,
      saleId: examId,
      itemId: examId,
      adjustmentId: resolvedAdjustment.id,
      adjustmentName: resolvedAdjustment.name,
      adjustmentType: resolvedAdjustment.marketType,
      adjustmentValue: resolvedAdjustment.adjustmentValue,
      baseAmount: roundToCurrency(productionCost),
      calculatedAmount: adjustmentTotal,
      quantity: safeLearners,
      unitAmount: roundToCurrency(adjustmentTotal / safeLearners),
      timestamp: new Date().toISOString(),
      status: 'Active',
      notes: `Examination Job adjustment for ${examId}`
    };

    return {
      adjustmentTotal,
      adjustmentSnapshots: [adjustmentSnapshot],
      adjustmentTransaction
    };
  }

  private assertEditable(job: ExaminationJob) {
    if (hasLockedStatus(job.status)) {
      throw new Error('This examination job cannot be edited after approval.');
    }
  }

  private assertLearners(learners: number) {
    if (!Number.isFinite(learners) || learners <= 0) {
      throw new Error('Number of learners must be greater than zero.');
    }
  }

  private assertSubjects(subjects: ExaminationJobSubject[]) {
    if (!Array.isArray(subjects) || subjects.length === 0) {
      throw new Error('At least one subject is required.');
    }
  }

  private buildSubjectRecord(
    examId: string,
    numberOfLearners: number,
    input: {
      id?: string;
      subject_name: string;
      pages_per_paper: number;
      extra_copies?: number;
    }
  ): ExaminationJobSubject {
    const pagesPerPaper = toPositiveInt(input.pages_per_paper);
    const extraCopies = toPositiveInt(input.extra_copies);
    const totalCopies = Math.max(0, toPositiveInt(numberOfLearners) + extraCopies);
    const totalPages = pagesPerPaper * totalCopies;
    const now = new Date().toISOString();

    return {
      id: input.id || `EXAM-SUBJECT-${ID_SUFFIX()}`,
      examination_job_id: examId,
      subject_name: (input.subject_name || '').trim(),
      pages_per_paper: pagesPerPaper,
      extra_copies: extraCopies,
      total_copies: totalCopies,
      total_pages: totalPages,
      created_at: now,
      updated_at: now
    };
  }

  private async upsertSubjects(
    examId: string,
    numberOfLearners: number,
    payload: ExaminationJobPayload['subjects']
  ) {
    const existing = (await this.listAllSubjects()).filter(s => s.examination_job_id === examId);
    const next = (payload || []).map(subject => this.buildSubjectRecord(examId, numberOfLearners, subject));

    if (next.some(subject => !subject.subject_name)) {
      throw new Error('All subjects must have a name.');
    }

    if (next.some(subject => subject.pages_per_paper <= 0)) {
      throw new Error('Subject pages must be greater than zero.');
    }

    for (const subject of next) {
      const current = existing.find(s => s.id === subject.id);
      const merged: ExaminationJobSubject = {
        ...subject,
        created_at: current?.created_at || subject.created_at
      };
      await examinationDb.examinationJobSubjects.put(merged);
    }

    const nextIds = new Set(next.map(subject => subject.id));
    for (const stale of existing) {
      if (!nextIds.has(stale.id)) {
        await examinationDb.examinationJobSubjects.delete(stale.id);
      }
    }
  }

  private async getJobAndSubjects(examId: string): Promise<ExaminationJobState> {
    const job = await examinationDb.examinationJobs.get(examId);
    if (!job) throw new Error('Examination job not found.');

    const subjects = (await this.listAllSubjects()).filter(subject => subject.examination_job_id === job.id);

    return {
      job,
      subjects
    };
  }

  private async calculateBOMCostByPages(
    bomId: string,
    totalPages: number,
    paperMaterialId?: string,
    tonerMaterialId?: string
  ): Promise<{ productionCost: number; breakdown: Array<{ materialId: string; materialName: string; quantity: number; unitCost: number; totalCost: number }> }> {
    const [boms, templates] = await Promise.all([
      dbService.getAll<BillOfMaterial>('boms'),
      dbService.getAll<BOMTemplate>('bomTemplates')
    ]);

    const hasBom = boms.some(bom => bom.id === bomId);
    const hasTemplate = templates.some(template => template.id === bomId);

    if (!hasBom && !hasTemplate) {
      throw new Error(`BOM "${bomId}" is not available.`);
    }

    const result = await productionCostService.calculateCost({
      bomId: hasBom ? bomId : undefined,
      templateId: !hasBom && hasTemplate ? bomId : undefined,
      quantity: totalPages,
      attributes: {
        quantity: totalPages,
        pages: totalPages,
        total_pages: totalPages,
        candidates: 1,
        extra_copies: 0
      }
    });

    const productionCost = roundToCurrency((result.materialCost || 0) + (result.laborCost || 0));
    return {
      productionCost,
      breakdown: result.breakdown || []
    };
  }

  async listJobs() {
    const [jobs, subjects] = await Promise.all([
      this.listAllJobs(),
      this.listAllSubjects()
    ]);

    return jobs.map(job => ({
      ...job,
      subjects: subjects.filter(subject => subject.examination_job_id === job.id)
    }));
  }

  async getJob(examId: string): Promise<ExaminationJobState> {
    return this.getJobAndSubjects(examId);
  }

  async createJob(payload: ExaminationJobPayload): Promise<ExaminationJobState> {
    this.assertLearners(toPositiveInt(payload.number_of_learners));
    
    // Resolve BOM ID - use default hidden BOM if not provided
    const effectiveBOMId = String(payload.bom_id || '').trim() || await this.getDefaultBOMId();
    await this.assertBomExists(effectiveBOMId);
    
    const effectiveAdjustmentId = String(payload.adjustment_id || '').trim() || await this.getDefaultMarketAdjustmentId();
    const resolvedAdjustment = await this.resolveMarketAdjustment(effectiveAdjustmentId);

    if (!Array.isArray(payload.subjects) || payload.subjects.length === 0) {
      throw new Error('At least one subject is required.');
    }

    const allJobs = await this.listAllJobs();
    const id = generateNextId('examsheet', allJobs);
    const now = new Date().toISOString();
    const resolvedRounding = resolvePersistedExamRounding({
      roundingRuleType: payload.rounding_rule_type,
      roundingMethod: payload.rounding_method,
      roundingValue: payload.rounding_value
    });

    const job: ExaminationJob = {
      id,
      exam_name: (payload.exam_name || '').trim(),
      school_id: (payload.school_id || '').trim(),
      sub_account_name: payload.sub_account_name ? String(payload.sub_account_name).trim() : undefined,
      class_name: (payload.class_name || '').trim(),
      number_of_learners: toPositiveInt(payload.number_of_learners),
      status: 'Draft',
      bom_id: effectiveBOMId,
      paper_material_id: String(payload.paper_material_id || '').trim() || undefined,
      toner_material_id: String(payload.toner_material_id || '').trim() || undefined,
      adjustment_id: resolvedAdjustment.id,
      adjustment_name: resolvedAdjustment.name,
      adjustment_type: resolvedAdjustment.adjustmentType,
      adjustment_value: resolvedAdjustment.adjustmentValue,
      rounding_method: resolvedRounding.roundingMethod,
      rounding_rule_type: resolvedRounding.roundingRuleType,
      rounding_value: resolvedRounding.roundingValue,
      total_pages: 0,
      production_cost: 0,
      adjusted_cost: 0,
      cost_per_learner: 0,
      unrounded_price_per_learner: 0,
      auto_price_per_learner: 0,
      rounding_difference: 0,
      final_price_per_learner: 0,
      final_amount: 0,
      override_enabled: Boolean(payload.override_enabled),
      manual_price_per_learner: toNumber(payload.manual_price_per_learner),
      override_reason: payload.override_reason,
      margin_impact: 0,
      adjustment_total: 0,
      adjustment_snapshots: [],
      calculation_version: EXAMINATION_CALCULATION_VERSION,
      pricing_locked: false,
      pricing_locked_at: undefined,
      pricing_locked_by: undefined,
      created_at: now,
      updated_at: now
    };

    if (!job.exam_name) throw new Error('Exam name is required.');
    if (!job.school_id) throw new Error('School is required.');
    if (!job.class_name) throw new Error('Class is required.');

    await examinationDb.examinationJobs.put(job);
    await this.syncJobToCloud(job);
    await this.upsertSubjects(id, job.number_of_learners, payload.subjects);

    await this.recalculateExam(id);
    return this.getJobAndSubjects(id);
  }

  async updateJob(examId: string, updates: Partial<ExaminationJobPayload>): Promise<ExaminationJobState> {
    const existing = await examinationDb.examinationJobs.get(examId);
    if (!existing) throw new Error('Examination job not found.');

    this.assertEditable(existing);
    const mergedAdjustmentId = (updates.adjustment_id !== undefined
      ? String(updates.adjustment_id || '').trim()
      : String(existing.adjustment_id || '').trim()) || await this.getDefaultMarketAdjustmentId();
    const resolvedAdjustment = await this.resolveMarketAdjustment(mergedAdjustmentId);

    const resolvedRounding = resolvePersistedExamRounding({
      roundingRuleType: updates.rounding_rule_type,
      roundingMethod: updates.rounding_method,
      roundingValue: updates.rounding_value,
      fallbackRuleType: existing.rounding_rule_type,
      fallbackMethod: existing.rounding_method,
      fallbackValue: existing.rounding_value
    });

    const merged: ExaminationJob = {
      ...existing,
      exam_name: updates.exam_name !== undefined ? String(updates.exam_name).trim() : existing.exam_name,
      school_id: updates.school_id !== undefined ? String(updates.school_id).trim() : existing.school_id,
      sub_account_name: updates.sub_account_name !== undefined
        ? (String(updates.sub_account_name || '').trim() || undefined)
        : existing.sub_account_name,
      class_name: updates.class_name !== undefined ? String(updates.class_name).trim() : existing.class_name,
      number_of_learners: updates.number_of_learners !== undefined
        ? toPositiveInt(updates.number_of_learners)
        : existing.number_of_learners,
      bom_id: updates.bom_id !== undefined ? String(updates.bom_id) : existing.bom_id,
      paper_material_id: updates.paper_material_id !== undefined
        ? (String(updates.paper_material_id || '').trim() || undefined)
        : existing.paper_material_id,
      toner_material_id: updates.toner_material_id !== undefined
        ? (String(updates.toner_material_id || '').trim() || undefined)
        : existing.toner_material_id,
      adjustment_id: resolvedAdjustment.id,
      adjustment_name: resolvedAdjustment.name,
      adjustment_type: resolvedAdjustment.adjustmentType,
      adjustment_value: resolvedAdjustment.adjustmentValue,
      rounding_method: resolvedRounding.roundingMethod,
      rounding_rule_type: resolvedRounding.roundingRuleType,
      rounding_value: resolvedRounding.roundingValue,
      override_enabled: updates.override_enabled !== undefined
        ? Boolean(updates.override_enabled)
        : existing.override_enabled,
      manual_price_per_learner: updates.manual_price_per_learner !== undefined
        ? toNumber(updates.manual_price_per_learner)
        : existing.manual_price_per_learner,
      override_reason: updates.override_reason !== undefined
        ? updates.override_reason
        : existing.override_reason,
      pricing_locked: updates.pricing_locked !== undefined
        ? Boolean(updates.pricing_locked)
        : existing.pricing_locked,
      updated_at: new Date().toISOString()
    };

    this.assertLearners(merged.number_of_learners);
    await this.assertBomExists(merged.bom_id);

    if (!merged.exam_name) throw new Error('Exam name is required.');
    if (!merged.school_id) throw new Error('School is required.');
    if (!merged.class_name) throw new Error('Class is required.');

    if (existing.invoice_group_id && merged.school_id !== existing.school_id) {
      const linkedGroup = await examinationDb.examinationInvoiceGroups.get(existing.invoice_group_id);
      if (linkedGroup && linkedGroup.status !== 'Invoiced') {
        throw new Error('Cannot change school while the job belongs to an invoice group. Remove it from the group first.');
      }
    }

    await examinationDb.examinationJobs.put(merged);
    await this.syncJobToCloud(merged);

    if (Array.isArray(updates.subjects)) {
      await this.upsertSubjects(examId, merged.number_of_learners, updates.subjects);
    } else if (updates.number_of_learners !== undefined) {
      const currentSubjects = (await this.listAllSubjects()).filter(subject => subject.examination_job_id === examId);
      await this.upsertSubjects(
        examId,
        merged.number_of_learners,
        currentSubjects.map(subject => ({
          id: subject.id,
          subject_name: subject.subject_name,
          pages_per_paper: subject.pages_per_paper,
          extra_copies: subject.extra_copies
        }))
      );
    }

    const hasSubjectPayload = Array.isArray(updates.subjects);
    const structuralRecalcNeeded =
      hasSubjectPayload
      || merged.number_of_learners !== existing.number_of_learners
      || merged.bom_id !== existing.bom_id
      || (merged.paper_material_id || '') !== (existing.paper_material_id || '')
      || (merged.toner_material_id || '') !== (existing.toner_material_id || '')
      || merged.adjustment_id !== existing.adjustment_id
      || merged.adjustment_type !== existing.adjustment_type
      || toNumber(merged.adjustment_value) !== toNumber(existing.adjustment_value);

    const pricingOnlyRecalcNeeded =
      !structuralRecalcNeeded && (
        merged.override_enabled !== existing.override_enabled
        || toNumber(merged.manual_price_per_learner) !== toNumber(existing.manual_price_per_learner)
        || (merged.override_reason || '') !== (existing.override_reason || '')
        || merged.rounding_method !== existing.rounding_method
        || merged.rounding_rule_type !== existing.rounding_rule_type
        || toNumber(merged.rounding_value) !== toNumber(existing.rounding_value)
      );

    if (structuralRecalcNeeded) {
      await this.recalculateExam(examId);
    } else if (pricingOnlyRecalcNeeded) {
      await this.recalculatePricingOnly(examId);
    } else {
      await this.syncGroupLineForJob(merged);
    }

    return this.getJobAndSubjects(examId);
  }

  async replaceSubjects(
    examId: string,
    subjects: ExaminationJobPayload['subjects']
  ): Promise<ExaminationJobState> {
    const existing = await examinationDb.examinationJobs.get(examId);
    if (!existing) throw new Error('Examination job not found.');
    this.assertEditable(existing);

    await this.upsertSubjects(examId, existing.number_of_learners, subjects);
    await this.recalculateExam(examId);
    return this.getJobAndSubjects(examId);
  }

  private async recalculatePricingOnly(examId: string): Promise<ExaminationJobState> {
    const { job, subjects } = await this.getJobAndSubjects(examId);
    if (job.pricing_locked) {
      return { job, subjects };
    }

    this.assertLearners(job.number_of_learners);

    const normalizedRounding = resolvePersistedExamRounding({
      fallbackRuleType: job.rounding_rule_type,
      fallbackMethod: job.rounding_method,
      fallbackValue: job.rounding_value
    });
    const existingAdjustmentTotal = toNumber(job.adjustment_total, 0);

    const pricing = computeExaminationPricing({
      productionCost: toNumber(job.production_cost, 0),
      adjustmentType: job.adjustment_type,
      adjustmentValue: toNumber(job.adjustment_value, 0),
      precomputedAdjustmentTotal: existingAdjustmentTotal,
      learners: job.number_of_learners,
      roundingMethod: normalizedRounding.roundingMethod,
      roundingRuleType: normalizedRounding.roundingRuleType,
      roundingValue: normalizedRounding.roundingValue,
      overrideEnabled: job.override_enabled,
      manualPricePerLearner: job.manual_price_per_learner
    });

    const manualPrice = toNumber(job.manual_price_per_learner);
    const nextStatus: ExaminationJob['status'] =
      job.status === 'Approved' || job.status === 'Invoiced'
        ? job.status
        : job.override_enabled && manualPrice > 0
          ? 'Overridden'
          : 'Calculated';

    const updated: ExaminationJob = {
      ...job,
      status: nextStatus,
      adjusted_cost: pricing.adjustedCost,
      cost_per_learner: pricing.costPerLearner,
      rounding_method: normalizedRounding.roundingMethod,
      rounding_rule_type: normalizedRounding.roundingRuleType,
      rounding_value: normalizedRounding.roundingValue,
      unrounded_price_per_learner: pricing.unroundedPricePerLearner,
      auto_price_per_learner: pricing.autoPricePerLearner,
      rounding_difference: pricing.roundingDifference,
      final_price_per_learner: pricing.finalPricePerLearner,
      final_amount: pricing.finalAmount,
      margin_impact: pricing.marginImpact,
      calculation_version: EXAMINATION_CALCULATION_VERSION,
      updated_at: new Date().toISOString()
    };

    await examinationDb.examinationJobs.put(updated);
    await this.syncJobToCloud(updated);
    const syncedJob = await this.syncGroupLineForJob(updated);
    return {
      job: syncedJob,
      subjects
    };
  }

  async recalculateExam(examId: string): Promise<ExaminationJobState> {
    const { job, subjects } = await this.getJobAndSubjects(examId);

    // Skip recalculation if pricing is locked
    if (job.pricing_locked) {
      return { job, subjects };
    }

    // Store original values for comparison
    const originalProductionCost = job.production_cost || 0;
    const originalAdjustedCost = job.adjusted_cost || 0;
    const originalFinalAmount = job.final_amount || 0;

    this.assertLearners(job.number_of_learners);
    await this.assertBomExists(job.bom_id);
    this.assertSubjects(subjects);
    if (job.rounding_rule_type === 'custom' && (!job.rounding_value || toNumber(job.rounding_value) <= 0)) {
      throw new Error('Custom rounding value must be greater than zero.');
    }

    const normalizedSubjects = subjects.map(subject =>
      this.buildSubjectRecord(job.id, job.number_of_learners, {
        id: subject.id,
        subject_name: subject.subject_name,
        pages_per_paper: subject.pages_per_paper,
        extra_copies: subject.extra_copies
      })
    );

    for (const subject of normalizedSubjects) {
      await examinationDb.examinationJobSubjects.put({
        ...subject,
        created_at: subjects.find(s => s.id === subject.id)?.created_at || subject.created_at
      });
    }

    const totalPages = normalizedSubjects.reduce((sum, subject) => sum + subject.total_pages, 0);
    if (totalPages <= 0) {
      throw new Error('Total pages must be greater than zero.');
    }

    const bomCost = await this.calculateBOMCostByPages(job.bom_id, totalPages, job.paper_material_id, job.toner_material_id);
    const productionCost = bomCost.productionCost;

    // Detect significant changes in production cost (indicates potential data issues)
    if (originalProductionCost > 0 && productionCost > 0) {
      const costChangePercent = Math.abs(productionCost - originalProductionCost) / originalProductionCost;
      if (costChangePercent > 0.15) { // >15% change
        console.warn(
          `[ExaminationJobService] Significant production cost change detected for job ${examId}: ` +
          `$ ${originalProductionCost.toLocaleString()} → $ ${productionCost.toLocaleString()} ` +
          `(${Math.round(costChangePercent * 100)}% change)`
        );
      }
    }

    const normalizedRounding = resolvePersistedExamRounding({
      fallbackRuleType: job.rounding_rule_type,
      fallbackMethod: job.rounding_method,
      fallbackValue: job.rounding_value
    });

    // Use ALL active market adjustments instead of just one
    const allActiveAdjustments = await this.getAllActiveAdjustments();
    
    // Build multi-adjustment snapshot (applies ALL active adjustments)
    const adjustmentTracking = this.buildMultiAdjustmentSnapshot(
      examId,
      job.number_of_learners,
      productionCost,
      allActiveAdjustments
    );

    // For pricing computation, use combined adjustment totals
    const combinedAdjustmentType: ExaminationAdjustmentType = adjustmentTracking.combinedPercentage > 0 ? 'percentage' : 'fixed';
    const combinedAdjustmentValue = adjustmentTracking.combinedPercentage > 0 
      ? adjustmentTracking.combinedPercentage 
      : adjustmentTracking.combinedFixed;

    const pricing = computeExaminationPricing({
      productionCost,
      adjustmentType: combinedAdjustmentType,
      adjustmentValue: combinedAdjustmentValue,
      precomputedAdjustmentTotal: adjustmentTracking.adjustmentTotal,
      learners: job.number_of_learners,
      roundingMethod: normalizedRounding.roundingMethod,
      roundingRuleType: normalizedRounding.roundingRuleType,
      roundingValue: normalizedRounding.roundingValue,
      overrideEnabled: job.override_enabled,
      manualPricePerLearner: job.manual_price_per_learner
    });

    const manualPrice = toNumber(job.manual_price_per_learner);

    const nextStatus: ExaminationJob['status'] =
      job.status === 'Approved' || job.status === 'Invoiced'
        ? job.status
        : job.override_enabled && manualPrice > 0
          ? 'Overridden'
          : 'Calculated';

    const updated: ExaminationJob = {
      ...job,
      status: nextStatus,
      total_pages: totalPages,
      production_cost: roundToCurrency(productionCost),
      adjustment_id: allActiveAdjustments.length > 0 ? allActiveAdjustments[0]?.id : undefined,
      adjustment_name: allActiveAdjustments.length > 0 ? (allActiveAdjustments[0]?.displayName || allActiveAdjustments[0]?.name) : undefined,
      adjustment_type: combinedAdjustmentType,
      adjustment_value: combinedAdjustmentValue,
      adjustment_total: adjustmentTracking.adjustmentTotal,
      adjustment_snapshots: adjustmentTracking.adjustmentSnapshots,
      adjusted_cost: pricing.adjustedCost,
      cost_per_learner: pricing.costPerLearner,
      rounding_method: normalizedRounding.roundingMethod,
      rounding_rule_type: normalizedRounding.roundingRuleType,
      rounding_value: normalizedRounding.roundingValue,
      unrounded_price_per_learner: pricing.unroundedPricePerLearner,
      auto_price_per_learner: pricing.autoPricePerLearner,
      rounding_difference: pricing.roundingDifference,
      final_price_per_learner: pricing.finalPricePerLearner,
      final_amount: pricing.finalAmount,
      margin_impact: pricing.marginImpact,
      calculation_version: EXAMINATION_CALCULATION_VERSION,
      updated_at: new Date().toISOString()
    };

    await examinationDb.examinationJobs.put(updated);
    await this.syncJobToCloud(updated);

    // Log significant total changes for audit purposes
    if (originalFinalAmount > 0 && updated.final_amount > 0) {
      const totalChangePercent = Math.abs(updated.final_amount - originalFinalAmount) / originalFinalAmount;
      if (totalChangePercent > 0.10) { // >10% change
        console.warn(
          `[ExaminationJobService] Significant total amount change for job ${examId}: ` +
          `$ ${originalFinalAmount.toLocaleString()} → $ ${updated.final_amount.toLocaleString()} ` +
          `(${Math.round(totalChangePercent * 100)}% change). ` +
          `Override: ${updated.override_enabled}, Manual Price: $ ${updated.manual_price_per_learner}`
        );
      }
    }

    // Store all adjustment transactions for audit trail
    for (const transaction of adjustmentTracking.adjustmentTransactions) {
      await dbService.put('marketAdjustmentTransactions', transaction);
    }

    const totalRoundingImpact = roundToCurrency(pricing.roundingDifference * Math.max(1, toPositiveInt(job.number_of_learners, 1)));
    if (totalRoundingImpact > 0) {
      recordRoundingAnalytics(totalRoundingImpact, pricing.roundingMethod);
    }

    try {
      if (pricing.roundingDifference > 0) {
        await logRoundingEvent({
          productId: job.id,
          productName: `Exam Job - ${job.class_name}`,
          variantId: 'per-learner',
          variantName: 'Per Learner Rate',
          date: new Date().toISOString(),
          calculatedPrice: pricing.unroundedPricePerLearner,
          roundedPrice: pricing.autoPricePerLearner,
          roundingDifference: pricing.roundingDifference,
          roundingMethod: pricing.roundingMethod,
          userId: 'system'
        });
      }
    } catch (roundingLogError) {
      console.warn('[ExaminationJobService] Failed to log rounding analytics event:', roundingLogError);
    }

    const syncedJob = await this.syncGroupLineForJob(updated);

    const refreshedSubjects = (await this.listAllSubjects()).filter(subject => subject.examination_job_id === examId);
    return {
      job: syncedJob,
      subjects: refreshedSubjects
    };
  }

  async recalculateOpenJobs(options?: { includeOverridden?: boolean }) {
    const includeOverridden = options?.includeOverridden !== undefined
      ? Boolean(options.includeOverridden)
      : true;
    const eligibleStatuses = new Set<ExaminationJob['status']>(
      includeOverridden
        ? ['Draft', 'Calculated', 'Overridden']
        : ['Draft', 'Calculated']
    );

    const allJobs = await this.listAllJobs();
    const targets = allJobs.filter((job) => eligibleStatuses.has(job.status));
    const summary = {
      total_jobs: allJobs.length,
      eligible_jobs: targets.length,
      recalculated_jobs: 0,
      skipped_locked: 0,
      failed_jobs: 0,
      errors: [] as Array<{ job_id: string; class_name: string; message: string }>
    };

    for (const job of targets) {
      if (job.pricing_locked) {
        summary.skipped_locked += 1;
        continue;
      }

      try {
        await this.recalculateExam(job.id);
        summary.recalculated_jobs += 1;
      } catch (error: any) {
        summary.failed_jobs += 1;
        summary.errors.push({
          job_id: job.id,
          class_name: job.class_name,
          message: error?.message || 'Unknown recalculation error.'
        });
      }
    }

    return {
      success: summary.failed_jobs === 0,
      ...summary
    };
  }

  private async ensureInventoryDeducted(examId: string, reference: string) {
    const { job } = await this.getJobAndSubjects(examId);
    if (job.inventory_deducted) return job;

    if (job.total_pages <= 0) {
      throw new Error('Cannot deduct inventory before calculation.');
    }

    const bomCost = await this.calculateBOMCostByPages(job.bom_id, job.total_pages, job.paper_material_id, job.toner_material_id);
    const lines = (bomCost.breakdown || [])
      .filter(line => line.materialId && toNumber(line.quantity) > 0)
      .map(line => ({
        itemId: line.materialId,
        itemName: line.materialName || line.materialId,
        quantity: toNumber(line.quantity),
        unitCost: toNumber(line.unitCost),
        totalCost: toNumber(line.totalCost)
      }));

    if (lines.length === 0) {
      throw new Error('No inventory-linked BOM lines were produced for this job.');
    }

    const inventory = await dbService.getAll<Item>('inventory');
    const stockById = new Map(inventory.map(item => [item.id, toNumber(item.stock)]));

    const insufficient = lines.find(line => (stockById.get(line.itemId) || 0) < line.quantity);
    if (insufficient) {
      throw new Error(
        `Insufficient stock for ${insufficient.itemName}. Available: ${stockById.get(insufficient.itemId) || 0}, required: ${roundToCurrency(insufficient.quantity)}.`
      );
    }

    for (const line of lines) {
      const result = await inventoryTransactionService.deductInventory({
        itemId: line.itemId,
        warehouseId: '',
        quantity: line.quantity,
        reason: 'Examination Production Consumption',
        reference: 'ExaminationJob',
        referenceId: examId,
        performedBy: 'system'
      });

      if (!result.success) {
        throw new Error(result.error || `Failed to deduct inventory for ${line.itemName}.`);
      }
    }

    const deductionRecord = {
      id: `EXAM-DED-${ID_SUFFIX()}`,
      examination_job_id: examId,
      bom_id: job.bom_id,
      total_pages: job.total_pages,
      lines: lines.map(line => ({
        item_id: line.itemId,
        item_name: line.itemName,
        quantity: roundToCurrency(line.quantity),
        unit_cost: roundToCurrency(line.unitCost),
        total_cost: roundToCurrency(line.totalCost)
      })),
      deducted_at: new Date().toISOString(),
      reference
    };

    await examinationDb.examinationInventoryDeductions.put(deductionRecord as any);

    const updatedJob: ExaminationJob = {
      ...job,
      inventory_deducted: true,
      inventory_deducted_at: new Date().toISOString(),
      inventory_deduction_ref: reference,
      updated_at: new Date().toISOString()
    };
    await examinationDb.examinationJobs.put(updatedJob);
    await this.syncJobToCloud(updatedJob);

    return updatedJob;
  }

  async approveJob(examId: string): Promise<ExaminationJobState> {
    let state = await this.recalculateExam(examId);
    if (state.job.status === 'Invoiced') {
      throw new Error('Invoiced jobs cannot be approved again.');
    }

    const approved: ExaminationJob = {
      ...state.job,
      status: 'Approved',
      updated_at: new Date().toISOString()
    };
    await examinationDb.examinationJobs.put(approved);
    await this.syncJobToCloud(approved);

    await this.ensureInventoryDeducted(examId, `APPROVAL-${approved.id}`);
    state = await this.getJobAndSubjects(examId);
    return state;
  }

  async listInvoiceGroups() {
    const groups = await this.listAllGroups();
    return groups.sort((a, b) => b.created_at.localeCompare(a.created_at));
  }

  private async ensureGroupEligibility(group: ExaminationInvoiceGroup, jobs: ExaminationJob[]) {
    if (group.status === 'Invoiced') {
      throw new Error('Cannot edit an already invoiced group.');
    }

    if (jobs.some(job => job.school_id !== group.school_id)) {
      throw new Error('All jobs in a group must belong to the same school.');
    }

    if (jobs.some(job => job.status === 'Invoiced' || Boolean(job.invoice_id))) {
      throw new Error('One or more selected jobs are already invoiced.');
    }

    const groupedElsewhere = jobs.find(job => job.invoice_group_id && job.invoice_group_id !== group.id);
    if (groupedElsewhere) {
      throw new Error(`Job "${groupedElsewhere.class_name}" already belongs to another invoice group.`);
    }
  }

  async createInvoiceGroup(payload: ExaminationGroupPayload) {
    if (!payload.school_id) throw new Error('School is required for an invoice group.');

    const groups = await this.listAllGroups();
    const id = generateNextId('EXAM-GRP', groups);
    const now = new Date().toISOString();

    const group: ExaminationInvoiceGroup = {
      id,
      school_id: payload.school_id,
      status: 'Draft',
      total_amount: 0,
      jobs: [],
      created_at: now,
      updated_at: now
    };

    await examinationDb.examinationInvoiceGroups.put(group);

    if (payload.examination_job_ids?.length) {
      return this.addJobsToGroup(group.id, payload.examination_job_ids);
    }

    return group;
  }

  async addJobsToGroup(groupId: string, examinationJobIds: string[]) {
    const group = await examinationDb.examinationInvoiceGroups.get(groupId);
    if (!group) throw new Error('Invoice group not found.');

    const uniqueJobIds = Array.from(new Set((examinationJobIds || []).filter(Boolean)));
    if (uniqueJobIds.length === 0) {
      throw new Error('No examination jobs selected.');
    }

    const allJobs = await this.listAllJobs();
    const selectedJobs = uniqueJobIds.map(id => allJobs.find(job => job.id === id)).filter(Boolean) as ExaminationJob[];
    if (selectedJobs.length !== uniqueJobIds.length) {
      throw new Error('One or more examination jobs were not found.');
    }

    await this.ensureGroupEligibility(group, selectedJobs);

    const resolvedJobs: ExaminationJob[] = [];
    for (const job of selectedJobs) {
      const recalculated = await this.recalculateExam(job.id);
      const upToDateJob = recalculated.job;
      if (upToDateJob.school_id !== group.school_id) {
        throw new Error('All jobs in a group must belong to the same school.');
      }
      resolvedJobs.push(upToDateJob);
    }

    const linesByJobId = new Map<string, ExaminationInvoiceGroupJobLine>();
    for (const line of group.jobs || []) {
      linesByJobId.set(line.examination_job_id, line);
    }

    for (const job of resolvedJobs) {
      linesByJobId.set(job.id, buildJobLineFromJob(job));
      const groupedJob = {
        ...job,
        invoice_group_id: group.id,
        updated_at: new Date().toISOString()
      };
      await examinationDb.examinationJobs.put(groupedJob);
      await this.syncJobToCloud(groupedJob);
    }

    const nextLines = Array.from(linesByJobId.values());
    const totalAmount = roundToCurrency(nextLines.reduce((sum, line) => sum + line.amount, 0));

    const updatedGroup: ExaminationInvoiceGroup = {
      ...group,
      jobs: nextLines,
      total_amount: totalAmount,
      updated_at: new Date().toISOString()
    };

    await examinationDb.examinationInvoiceGroups.put(updatedGroup);
    return updatedGroup;
  }

  async removeJobFromGroup(groupId: string, examinationJobId: string) {
    const group = await examinationDb.examinationInvoiceGroups.get(groupId);
    if (!group) throw new Error('Invoice group not found.');
    if (group.status === 'Invoiced') throw new Error('Cannot modify an invoiced group.');

    const nextLines = (group.jobs || []).filter(line => line.examination_job_id !== examinationJobId);
    const totalAmount = roundToCurrency(nextLines.reduce((sum, line) => sum + line.amount, 0));

    const updatedGroup: ExaminationInvoiceGroup = {
      ...group,
      jobs: nextLines,
      total_amount: totalAmount,
      updated_at: new Date().toISOString()
    };
    await examinationDb.examinationInvoiceGroups.put(updatedGroup);

    const job = await examinationDb.examinationJobs.get(examinationJobId);
    if (job?.invoice_group_id === group.id) {
      const detachedJob = {
        ...job,
        invoice_group_id: undefined,
        updated_at: new Date().toISOString()
      };
      await examinationDb.examinationJobs.put(detachedJob);
      await this.syncJobToCloud(detachedJob);
    }

    return updatedGroup;
  }

  async deleteInvoiceGroup(groupId: string) {
    const group = await examinationDb.examinationInvoiceGroups.get(groupId);
    if (!group) throw new Error('Invoice group not found.');
    if (group.status === 'Invoiced') throw new Error('Invoiced groups cannot be deleted.');

    for (const line of group.jobs || []) {
      const job = await examinationDb.examinationJobs.get(line.examination_job_id);
      if (job?.invoice_group_id === groupId) {
        const detachedJob = {
          ...job,
          invoice_group_id: undefined,
          updated_at: new Date().toISOString()
        };
        await examinationDb.examinationJobs.put(detachedJob);
        await this.syncJobToCloud(detachedJob);
      }
    }

    await examinationDb.examinationInvoiceGroups.delete(groupId);
    return { success: true };
  }

  async deleteJob(examId: string) {
    const job = await examinationDb.examinationJobs.get(examId);
    if (!job) throw new Error('Examination job not found.');
    if (job.status === 'Approved' || job.status === 'Invoiced') {
      throw new Error('Approved or invoiced jobs cannot be deleted.');
    }

    const allGroups = await this.listAllGroups();
    for (const group of allGroups) {
      if (group.status === 'Invoiced') continue;
      const hasLine = (group.jobs || []).some(line => line.examination_job_id === examId);
      if (hasLine) {
        await this.removeJobFromGroup(group.id, examId);
      }
    }

    const subjects = await this.listAllSubjects();
    for (const subject of subjects.filter(s => s.examination_job_id === examId)) {
      await examinationDb.examinationJobSubjects.delete(subject.id);
    }

    await examinationDb.examinationJobs.delete(examId);
    await this.deleteJobFromCloud(examId);
    return { success: true };
  }

  private async createInvoiceFromJobs(
    jobs: ExaminationJob[],
    options?: { groupId?: string }
  ) {
    if (!jobs.length) {
      throw new Error('At least one examination job is required for invoicing.');
    }

    if (jobs.some(job => job.status === 'Invoiced' || Boolean(job.invoice_id))) {
      throw new Error('Cannot invoice a job more than once.');
    }

    const schoolId = jobs[0].school_id;
    if (jobs.some(job => job.school_id !== schoolId)) {
      throw new Error('All jobs must belong to the same school to generate a single invoice.');
    }

    if (options?.groupId) {
      const incompatible = jobs.find(job => job.invoice_group_id && job.invoice_group_id !== options.groupId);
      if (incompatible) {
        throw new Error('Selected jobs include records assigned to a different invoice group.');
      }
    }

    const refreshedJobs: ExaminationJob[] = [];
    for (const job of jobs) {
      const recalculated = await this.recalculateExam(job.id);
      refreshedJobs.push(recalculated.job);
    }

    for (const job of refreshedJobs) {
      if (!job.inventory_deducted) {
        await this.ensureInventoryDeducted(job.id, `INVOICE-${job.id}`);
      }
    }

    const customers = await dbService.getAll<{ id: string; name?: string }>('customers');
    const customer = customers.find((entry) => entry.id === schoolId);
    const customerName = customer?.name || schoolId;
    const subAccountNames = Array.from(new Set(
      refreshedJobs
        .map(job => String(job.sub_account_name || '').trim())
        .filter(Boolean)
    ));

    const invoiceId = await generateNextSalesInvoiceNumber();
    const now = new Date();

    const items = refreshedJobs.map(job => buildInvoiceItemFromJob(job));
    const totalAmount = roundToCurrency(refreshedJobs.reduce((sum, job) => sum + job.final_amount, 0));

    const invoice: Invoice = {
      id: invoiceId,
      customerId: schoolId,
      customerName,
      date: now.toISOString(),
      dueDate: new Date(now.getTime() + (30 * 24 * 60 * 60 * 1000)).toISOString(),
      totalAmount,
      paidAmount: 0,
      status: 'Unpaid',
      items,
      subAccountName: subAccountNames.length === 1 ? subAccountNames[0] : undefined,
      notes: `Examination invoice generated from ${refreshedJobs.length} class job(s).`,
      category: 'Examination',
      originModule: 'examination',
      type: 'Examination Invoice'
    };

    await transactionService.processInvoice(invoice);

    for (const job of refreshedJobs) {
      const invoicedJob = {
        ...job,
        status: 'Invoiced',
        invoice_id: invoiceId,
        updated_at: new Date().toISOString()
      };
      await examinationDb.examinationJobs.put(invoicedJob);
      await this.syncJobToCloud(invoicedJob);
    }

    if (options?.groupId) {
      const group = await examinationDb.examinationInvoiceGroups.get(options.groupId);
      if (group) {
        await examinationDb.examinationInvoiceGroups.put({
          ...group,
          status: 'Invoiced',
          invoice_id: invoiceId,
          total_amount: totalAmount,
          updated_at: new Date().toISOString()
        });
      }
    }

    return {
      invoice_id: invoiceId,
      total_amount: totalAmount,
      job_ids: refreshedJobs.map(job => job.id)
    };
  }

  async createInvoiceForJobs(examinationJobIds: string[]) {
    const uniqueIds = Array.from(new Set((examinationJobIds || []).filter(Boolean)));
    if (!uniqueIds.length) throw new Error('No examination jobs selected.');

    const allJobs = await this.listAllJobs();
    const jobs = uniqueIds.map(id => allJobs.find(job => job.id === id)).filter(Boolean) as ExaminationJob[];
    if (jobs.length !== uniqueIds.length) {
      throw new Error('One or more examination jobs were not found.');
    }

    const groupedJobs = jobs.filter(job => Boolean(job.invoice_group_id));
    if (groupedJobs.length) {
      const groupIds = Array.from(new Set(groupedJobs.map(job => job.invoice_group_id).filter(Boolean) as string[]));
      if (groupIds.length !== 1 || groupedJobs.length !== jobs.length) {
        throw new Error('Jobs linked to invoice groups must be invoiced from a single group.');
      }

      const group = await examinationDb.examinationInvoiceGroups.get(groupIds[0]);
      if (!group || group.status === 'Invoiced') {
        throw new Error('The linked invoice group is not available for invoicing.');
      }

      const groupJobIds = new Set((group.jobs || []).map(line => line.examination_job_id));
      const selectedIds = new Set(jobs.map(job => job.id));
      const isExactGroupSelection =
        groupJobIds.size === selectedIds.size &&
        Array.from(groupJobIds).every(id => selectedIds.has(id));

      if (!isExactGroupSelection) {
        throw new Error('Invoice grouped jobs from the Invoice Group screen to keep group totals consistent.');
      }

      return this.createInvoiceFromJobs(jobs, { groupId: group.id });
    }

    return this.createInvoiceFromJobs(jobs);
  }

  async generateInvoiceForGroup(groupId: string) {
    const group = await examinationDb.examinationInvoiceGroups.get(groupId);
    if (!group) throw new Error('Invoice group not found.');
    if (group.status === 'Invoiced' || group.invoice_id) {
      throw new Error('This invoice group has already been invoiced.');
    }

    const jobIds = (group.jobs || []).map(line => line.examination_job_id);
    if (!jobIds.length) throw new Error('Invoice group has no jobs.');

    const allJobs = await this.listAllJobs();
    const jobs = jobIds.map(id => allJobs.find(job => job.id === id)).filter(Boolean) as ExaminationJob[];
    if (jobs.length !== jobIds.length) {
      throw new Error('One or more jobs in the group could not be found.');
    }

    return this.createInvoiceFromJobs(jobs, { groupId: group.id });
  }

  async listRecurringProfiles() {
    const profiles = await this.listAllRecurringProfiles();
    return profiles.sort((a, b) => b.created_at.localeCompare(a.created_at));
  }

  private async updateRecurringProfileStatus(
    profileId: string,
    status: ExaminationRecurringProfile['status']
  ) {
    const profile = await examinationDb.examinationRecurringProfiles.get(profileId);
    if (!profile) throw new Error('Recurring profile not found.');

    let nextStatus = status;
    let nextRunDate = profile.next_run_date;

    if (status === 'Active') {
      if (profile.end_date) {
        const endDate = new Date(profile.end_date);
        if (!Number.isNaN(endDate.getTime()) && Date.now() > endDate.getTime()) {
          nextStatus = 'Expired';
        }
      }

      if (nextStatus === 'Active') {
        const parsedNextRun = new Date(profile.next_run_date);
        if (Number.isNaN(parsedNextRun.getTime()) || parsedNextRun.getTime() < Date.now()) {
          nextRunDate = new Date().toISOString();
        }
      }
    }

    const updatedProfile: ExaminationRecurringProfile = {
      ...profile,
      status: nextStatus,
      next_run_date: nextRunDate,
      updated_at: new Date().toISOString()
    };

    await examinationDb.examinationRecurringProfiles.put(updatedProfile);
    return updatedProfile;
  }

  private async createRecurringProfile(
    sourceType: 'job' | 'group',
    sourceId: string,
    payload: ExaminationRecurringPayload
  ) {
    if (!payload.frequency) throw new Error('Recurring frequency is required.');
    if (!payload.start_date) throw new Error('Recurring start date is required.');

    const allProfiles = await this.listAllRecurringProfiles();
    const hasExistingProfile = allProfiles.some(
      profile =>
        profile.source_type === sourceType &&
        profile.source_id === sourceId &&
        profile.status !== 'Expired'
    );

    if (hasExistingProfile) {
      throw new Error('An active recurring profile already exists for this source.');
    }

    const start = toISODateTime(payload.start_date);
    const parsedStart = new Date(start);
    if (Number.isNaN(parsedStart.getTime())) {
      throw new Error('Recurring start date is invalid.');
    }

    if (payload.end_date) {
      const parsedEnd = new Date(toISODateOnly(payload.end_date));
      if (Number.isNaN(parsedEnd.getTime())) {
        throw new Error('Recurring end date is invalid.');
      }
      if (parsedEnd.getTime() < parsedStart.getTime()) {
        throw new Error('Recurring end date cannot be earlier than start date.');
      }
    }

    const id = generateNextId('EXAM-REC', allProfiles);
    const now = new Date().toISOString();

    const profile: ExaminationRecurringProfile = {
      id,
      source_type: sourceType,
      source_id: sourceId,
      frequency: payload.frequency,
      start_date: toISODateOnly(payload.start_date),
      end_date: payload.end_date ? toISODateOnly(payload.end_date) : undefined,
      auto_generate: Boolean(payload.auto_generate),
      next_run_date: start,
      status: 'Active',
      created_at: now,
      updated_at: now
    };

    await examinationDb.examinationRecurringProfiles.put(profile);
    return profile;
  }

  async pauseRecurringProfile(profileId: string) {
    return this.updateRecurringProfileStatus(profileId, 'Paused');
  }

  async resumeRecurringProfile(profileId: string) {
    return this.updateRecurringProfileStatus(profileId, 'Active');
  }

  async deleteRecurringProfile(profileId: string) {
    const profile = await examinationDb.examinationRecurringProfiles.get(profileId);
    if (!profile) throw new Error('Recurring profile not found.');
    await examinationDb.examinationRecurringProfiles.delete(profileId);
    return { success: true };
  }

  async convertJobToRecurring(examId: string, payload: ExaminationRecurringPayload) {
    const job = await examinationDb.examinationJobs.get(examId);
    if (!job) throw new Error('Examination job not found.');
    return this.createRecurringProfile('job', examId, payload);
  }

  async convertGroupToRecurring(groupId: string, payload: ExaminationRecurringPayload) {
    const group = await examinationDb.examinationInvoiceGroups.get(groupId);
    if (!group) throw new Error('Examination invoice group not found.');
    return this.createRecurringProfile('group', groupId, payload);
  }

  private async cloneJobForRecurring(sourceJobId: string, runDate: string) {
    const state = await this.getJobAndSubjects(sourceJobId);
    const suffix = toISODateOnly(runDate);
    const fallbackAdjustmentId = await this.getDefaultMarketAdjustmentId();

    const clone = await this.createJob({
      exam_name: `${state.job.exam_name} (${suffix})`,
      school_id: state.job.school_id,
      sub_account_name: state.job.sub_account_name,
      class_name: state.job.class_name,
      number_of_learners: state.job.number_of_learners,
      bom_id: state.job.bom_id,
      adjustment_id: state.job.adjustment_id || fallbackAdjustmentId,
      adjustment_type: state.job.adjustment_type,
      adjustment_value: state.job.adjustment_value,
      rounding_method: state.job.rounding_method,
      rounding_rule_type: state.job.rounding_rule_type,
      rounding_value: state.job.rounding_value,
      // Recurring cycles must always bill from fresh BOM-recalculated pricing.
      override_enabled: false,
      manual_price_per_learner: 0,
      override_reason: undefined,
      subjects: state.subjects.map(subject => ({
        subject_name: subject.subject_name,
        pages_per_paper: subject.pages_per_paper,
        extra_copies: subject.extra_copies
      }))
    });

    return clone.job;
  }

  private async cloneGroupForRecurring(sourceGroupId: string, runDate: string) {
    const sourceGroup = await examinationDb.examinationInvoiceGroups.get(sourceGroupId);
    if (!sourceGroup) {
      throw new Error('Recurring source group no longer exists.');
    }

    const clonedJobs: ExaminationJob[] = [];
    for (const line of sourceGroup.jobs || []) {
      const clonedJob = await this.cloneJobForRecurring(line.examination_job_id, runDate);
      clonedJobs.push(clonedJob);
    }

    const group = await this.createInvoiceGroup({
      school_id: sourceGroup.school_id,
      examination_job_ids: clonedJobs.map(job => job.id)
    });

    return group;
  }

  async runRecurringBilling(asOfDate?: string) {
    const now = asOfDate ? new Date(asOfDate) : new Date();
    const safeNow = Number.isNaN(now.getTime()) ? new Date() : now;

    const profiles = await this.listAllRecurringProfiles();
    const activeProfiles = profiles.filter(profile => profile.status === 'Active' && profile.auto_generate);

    let generatedInvoices = 0;
    let processedProfiles = 0;
    const errors: Array<{ profile_id: string; error: string }> = [];

    for (const profile of activeProfiles) {
      try {
        if (profile.end_date) {
          const endDate = new Date(profile.end_date);
          if (!Number.isNaN(endDate.getTime()) && safeNow.getTime() > endDate.getTime()) {
            await examinationDb.examinationRecurringProfiles.put({
              ...profile,
              status: 'Expired',
              updated_at: new Date().toISOString()
            });
            continue;
          }
        }

        if (!isDue(profile.next_run_date, safeNow)) {
          continue;
        }

        const runDate = profile.next_run_date;
        if (profile.source_type === 'job') {
          const clonedJob = await this.cloneJobForRecurring(profile.source_id, runDate);
          await this.createInvoiceForJobs([clonedJob.id]);
          generatedInvoices += 1;
        } else {
          const clonedGroup = await this.cloneGroupForRecurring(profile.source_id, runDate);
          await this.generateInvoiceForGroup(clonedGroup.id);
          generatedInvoices += 1;
        }

        const nextRunDate = addFrequency(profile.next_run_date, profile.frequency);
        const shouldExpire = profile.end_date
          ? new Date(nextRunDate).getTime() > new Date(profile.end_date).getTime()
          : false;

        await examinationDb.examinationRecurringProfiles.put({
          ...profile,
          next_run_date: nextRunDate,
          last_run_date: new Date().toISOString(),
          status: shouldExpire ? 'Expired' : profile.status,
          updated_at: new Date().toISOString()
        });

        processedProfiles += 1;
      } catch (error) {
        errors.push({
          profile_id: profile.id,
          error: error instanceof Error ? error.message : 'Unknown recurring billing error'
        });
      }
    }

    return {
      processed_profiles: processedProfiles,
      generated_invoices: generatedInvoices,
      errors
    };
  }

  async lockPricing(examId: string, userId?: string): Promise<ExaminationJobState> {
    const { job, subjects } = await this.getJobAndSubjects(examId);

    // Only allow locking if job is in Calculated or Overridden status
    if (job.status !== 'Calculated' && job.status !== 'Overridden') {
      throw new Error('Pricing can only be locked for calculated or overridden jobs.');
    }

    // Skip if already locked
    if (job.pricing_locked) {
      return { job, subjects };
    }

    const lockedJob: ExaminationJob = {
      ...job,
      pricing_locked: true,
      pricing_locked_at: new Date().toISOString(),
      pricing_locked_by: userId || 'system',
      updated_at: new Date().toISOString()
    };

    await examinationDb.examinationJobs.put(lockedJob);
    await this.syncJobToCloud(lockedJob);
    return { job: lockedJob, subjects };
  }

  async unlockPricing(examId: string): Promise<ExaminationJobState> {
    const { job, subjects } = await this.getJobAndSubjects(examId);

    // Skip if not locked
    if (!job.pricing_locked) {
      return { job, subjects };
    }

    const unlockedJob: ExaminationJob = {
      ...job,
      pricing_locked: false,
      pricing_locked_at: undefined,
      pricing_locked_by: undefined,
      updated_at: new Date().toISOString()
    };

    await examinationDb.examinationJobs.put(unlockedJob);
    await this.syncJobToCloud(unlockedJob);
    return { job: unlockedJob, subjects };
  }
}

export const examinationJobService = new ExaminationJobService();
export default examinationJobService;
export type {
  ExaminationGroupPayload,
  ExaminationInvoiceGroupJobLine,
  ExaminationJobPayload,
  ExaminationRecurringFrequency,
  ExaminationRecurringPayload
};
