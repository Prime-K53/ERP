import { createInvoiceFromBatch, type ExaminationInvoiceDraft } from '../adapters/invoiceAdapter';
import {
  sendBatchApprovedNotification,
  sendBatchCalculatedNotification,
  sendBatchCreatedNotification
} from '../adapters/notificationAdapter';
import { createWorkOrdersFromBatch, type ProductionAdapterRecord } from '../adapters/productionAdapter';
import {
  assertBatchMutableForPricing,
  assertCanApproveBatch,
  assertCanGenerateInvoice,
  assertValidStatusTransition,
  calculateApprovalMaterialDeductions,
  normalizeBatchStatus,
  resolveStatusAfterCalculation
} from '../domain/examination/batchWorkflow';
import {
  calculateSubjectConsumptionForLearners,
  calculateExaminationBatchPricing,
  type PricingAdjustmentInput,
  type PricingBatchInput,
  type PricingSettingsInput
} from '../domain/examination/pricingEngine';
import {
  InMemoryExaminationRepository,
  PostgreSqlExaminationRepository,
  type PostgreSqlQueryExecutor,
  type ExaminationBatchRecord,
  type ExaminationClassRecord,
  type ExaminationRepository
} from '../repositories/examination.repository';

export interface CreateExaminationBatchInput {
  id?: string;
  name?: string;
  school_id?: string;
  exam_type?: string;
  currency?: string;
  classes?: ExaminationClassRecord[];
}

export interface CalculateBatchInput {
  batchId: string;
  settings: PricingSettingsInput | null;
  activeAdjustments?: PricingAdjustmentInput[];
  userId?: string;
}

export interface ApproveBatchInput {
  batchId: string;
  userId?: string;
  paperItem?: { id?: string; name?: string; material?: string };
  tonerItem?: { id?: string; name?: string; material?: string };
  paperConversionRate?: number;
  tonerPagesPerUnit?: number;
  paperUnitCost?: number;
  tonerUnitCost?: number;
  schoolName?: string;
  priority?: 'Low' | 'Medium' | 'High' | 'Critical';
  dueDate?: string;
}

export interface GenerateInvoiceInput {
  batchId: string;
  idempotencyKey?: string;
}

export interface FullFlowInput {
  create: CreateExaminationBatchInput;
  calculate: Omit<CalculateBatchInput, 'batchId'>;
  approve?: Omit<ApproveBatchInput, 'batchId'>;
  invoice?: Omit<GenerateInvoiceInput, 'batchId'>;
}

export interface ApprovalResult {
  batch: ExaminationBatchRecord;
  materialDeductions: Array<{
    item_id: string;
    item_name: string;
    quantity_required: number;
    unit_cost: number;
  }>;
  productionDrafts: ProductionAdapterRecord[];
}

export interface InvoiceResult {
  batch: ExaminationBatchRecord;
  invoice: ExaminationInvoiceDraft;
}

const generateBatchId = () => `batch-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

const roundMoney = (value: number) => Math.round((Number(value) || 0) * 100) / 100;

const toSubjectConsumption = (subject: { pages?: number; extra_copies?: number }, learners: number) => {
  const consumption = calculateSubjectConsumptionForLearners(subject, learners);
  return {
    totalSheets: consumption.totalSheets,
    totalPages: consumption.totalPages
  };
};

const toProductionSubjectDrafts = (batch: ExaminationBatchRecord) => {
  return (batch.classes || []).flatMap((cls, classIndex) => {
    const className = String(cls.class_name || `Class ${classIndex + 1}`);
    const learners = Math.max(1, Math.floor(Number(cls.number_of_learners) || 0));
    return (cls.subjects || []).map((subject, subjectIndex) => {
      const consumption = calculateSubjectConsumptionForLearners(subject, learners);
      const baseSheets = Math.ceil(consumption.pages / 2) * learners;
      return {
        subject: String(subject.subject_name || subject.name || `Subject ${subjectIndex + 1}`),
        className,
        pages: consumption.pages,
        candidates: learners,
        extraCopies: consumption.extraCopies,
        baseSheets,
        totalSheets: consumption.totalSheets,
        totalPages: consumption.totalPages,
        productionCopies: consumption.copies
      };
    });
  });
};

export class ExaminationService {
  constructor(private readonly repository: ExaminationRepository) {}

  async createBatch(input: CreateExaminationBatchInput, userId?: string): Promise<ExaminationBatchRecord> {
    const created = await this.repository.createBatch({
      id: String(input.id || generateBatchId()),
      name: input.name,
      school_id: input.school_id,
      exam_type: input.exam_type,
      currency: input.currency || 'MWK',
      status: normalizeBatchStatus('Draft'),
      total_amount: 0,
      classes: Array.isArray(input.classes) ? input.classes : []
    });
    await this.notifySafely(() => sendBatchCreatedNotification(created, userId));
    return created;
  }

  async calculateBatch(input: CalculateBatchInput): Promise<ExaminationBatchRecord> {
    const batch = await this.getBatchByIdOrThrow(input.batchId);
    assertBatchMutableForPricing(batch.status, 'calculate batch');

    const pricingResult = calculateExaminationBatchPricing(
      { classes: batch.classes || [] } as PricingBatchInput,
      input.settings,
      input.activeAdjustments || []
    );

    const byClassId = new Map(pricingResult.classes.map((result) => [result.classId, result]));
    const mergedClasses = (batch.classes || []).map((cls, index) => {
      const clsId = String(cls.id || `class-${index + 1}`);
      const result = byClassId.get(clsId);
      if (!result) {
        return cls;
      }
      return {
        ...cls,
        id: clsId,
        class_name: result.className,
        number_of_learners: result.learners,
        total_sheets: result.totalSheets,
        total_pages: result.totalPages,
        total_bom_cost: result.totalBomCost,
        total_adjustments: result.totalAdjustments,
        total_cost: result.totalCost,
        expected_fee_per_learner: result.expectedFeePerLearner,
        final_fee_per_learner: result.finalFeePerLearner,
        live_total_preview: result.liveTotalPreview
      };
    });

    const totalAmount = roundMoney(
      mergedClasses.reduce((sum, cls) => sum + (Number(cls.live_total_preview) || 0), 0)
    );
    const statusAfterCalculation = resolveStatusAfterCalculation(mergedClasses.length);
    assertValidStatusTransition(batch.status, statusAfterCalculation);

    const updated = await this.repository.saveCalculationResults(batch.id, {
      classes: mergedClasses,
      total_amount: totalAmount,
      status: statusAfterCalculation
    });

    await this.notifySafely(() => sendBatchCalculatedNotification(updated, input.userId));
    return updated;
  }

  async approveBatch(input: ApproveBatchInput): Promise<ApprovalResult> {
    const batch = await this.getBatchByIdOrThrow(input.batchId);
    assertCanApproveBatch(batch.status);

    const materialDeductions = calculateApprovalMaterialDeductions({
      classes: batch.classes || [],
      paperItem: input.paperItem,
      tonerItem: input.tonerItem,
      paperConversionRate: input.paperConversionRate,
      tonerPagesPerUnit: input.tonerPagesPerUnit,
      paperUnitCost: input.paperUnitCost,
      tonerUnitCost: input.tonerUnitCost,
      calculateSubjectConsumption: toSubjectConsumption
    });

    const productionDrafts = createWorkOrdersFromBatch({
      batchId: batch.id,
      batchName: String(batch.name || `Batch ${batch.id}`),
      schoolName: String(input.schoolName || batch.school_id || 'School'),
      subjects: toProductionSubjectDrafts(batch),
      priority: input.priority,
      dueDate: input.dueDate
    });

    assertValidStatusTransition(batch.status, 'Approved');
    const updated = await this.repository.updateBatch(batch.id, {
      status: 'Approved',
      approvals: {
        approved_at: new Date().toISOString(),
        approved_by: input.userId || null,
        material_deductions: materialDeductions,
        production_jobs: productionDrafts.map((record) => record.job),
        work_orders: productionDrafts.map((record) => record.workOrder)
      }
    });

    await this.notifySafely(() => sendBatchApprovedNotification(updated, input.userId));
    return {
      batch: updated,
      materialDeductions,
      productionDrafts
    };
  }

  async generateInvoice(input: GenerateInvoiceInput): Promise<InvoiceResult> {
    const batch = await this.getBatchByIdOrThrow(input.batchId);
    assertCanGenerateInvoice(batch.status);
    assertValidStatusTransition(batch.status, 'Invoiced');

    const invoice = createInvoiceFromBatch({
      batchData: batch,
      idempotencyKey: input.idempotencyKey
    });

    const updated = await this.repository.updateBatch(batch.id, {
      status: 'Invoiced',
      invoice,
      total_amount: invoice.batchTotalAmount
    });

    return {
      batch: updated,
      invoice
    };
  }

  async runFullFlow(input: FullFlowInput) {
    const created = await this.createBatch(input.create);
    const calculated = await this.calculateBatch({
      batchId: created.id,
      settings: input.calculate.settings,
      activeAdjustments: input.calculate.activeAdjustments,
      userId: input.calculate.userId
    });
    const approved = await this.approveBatch({
      batchId: calculated.id,
      ...input.approve
    });
    const invoiced = await this.generateInvoice({
      batchId: approved.batch.id,
      ...input.invoice
    });

    return {
      batch: invoiced.batch,
      invoice: invoiced.invoice,
      productionDrafts: approved.productionDrafts,
      materialDeductions: approved.materialDeductions
    };
  }

  async getBatchById(id: string) {
    return this.repository.getBatchById(id);
  }

  async getAllBatches() {
    return this.repository.getAllBatches();
  }

  private async getBatchByIdOrThrow(batchId: string) {
    const batch = await this.repository.getBatchById(batchId);
    if (!batch) {
      throw new Error(`Examination batch "${batchId}" not found`);
    }
    return batch;
  }

  private async notifySafely(callback: () => Promise<unknown>) {
    try {
      await callback();
    } catch {
      return;
    }
  }
}

const resolveDefaultRepository = (): ExaminationRepository => {
  const globalDb = (globalThis as { __EXAMINATION_PG__?: PostgreSqlQueryExecutor }).__EXAMINATION_PG__;
  if (globalDb && typeof globalDb.query === 'function') {
    return new PostgreSqlExaminationRepository(globalDb);
  }
  return new InMemoryExaminationRepository();
};

export const examinationService = new ExaminationService(resolveDefaultRepository());
