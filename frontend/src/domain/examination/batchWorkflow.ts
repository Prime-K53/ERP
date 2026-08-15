export type ExaminationBatchStatus = 'Draft' | 'Calculated' | 'Approved' | 'Invoiced';

export const WORKFLOW_VALIDATION_CODES = {
  INVALID_STATUS: 'INVALID_STATUS',
  INVALID_TRANSITION: 'INVALID_TRANSITION',
  BATCH_IMMUTABLE: 'BATCH_IMMUTABLE',
  APPROVAL_NOT_ALLOWED: 'APPROVAL_NOT_ALLOWED',
  INVOICE_NOT_ALLOWED: 'INVOICE_NOT_ALLOWED'
} as const;

export interface WorkflowError extends Error {
  workflowCode?: string;
}

export interface ApprovalMaterialDeduction {
  item_id: string;
  item_name: string;
  quantity_required: number;
  unit_cost: number;
}

export interface ApprovalClassSubjectInput {
  pages?: number;
  extra_copies?: number;
}

export interface ApprovalClassInput {
  number_of_learners?: number;
  subjects?: ApprovalClassSubjectInput[];
}

export interface ApprovalMaterialInput {
  id?: string | null;
  name?: string | null;
  material?: string | null;
}

const STATUS_ORDER: ExaminationBatchStatus[] = ['Draft', 'Calculated', 'Approved', 'Invoiced'];

const toNumber = (value: unknown, fallback = 0) => {
  if (value === null || value === undefined || value === '') return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const roundMoney = (value: number) => Math.round((Number(value) || 0) * 100) / 100;

const createWorkflowError = (message: string, workflowCode: string): WorkflowError => {
  const error = new Error(message) as WorkflowError;
  error.workflowCode = workflowCode;
  return error;
};

export const normalizeBatchStatus = (status: unknown, fallback: ExaminationBatchStatus = 'Draft'): ExaminationBatchStatus => {
  const normalized = String(status || '').trim().toLowerCase();
  if (normalized === 'draft') return 'Draft';
  if (normalized === 'calculated') return 'Calculated';
  if (normalized === 'approved') return 'Approved';
  if (normalized === 'invoiced') return 'Invoiced';
  return fallback;
};

export const isKnownBatchStatus = (status: unknown): status is ExaminationBatchStatus => {
  const normalized = normalizeBatchStatus(status, 'Draft');
  return STATUS_ORDER.includes(normalized);
};

export const canTransitionBatchStatus = (
  fromStatusInput: unknown,
  toStatusInput: unknown
): boolean => {
  const fromStatus = normalizeBatchStatus(fromStatusInput);
  const toStatus = normalizeBatchStatus(toStatusInput);
  if (fromStatus === toStatus) return true;
  const fromIndex = STATUS_ORDER.indexOf(fromStatus);
  const toIndex = STATUS_ORDER.indexOf(toStatus);
  return toIndex === fromIndex + 1;
};

export const assertValidStatusTransition = (
  fromStatusInput: unknown,
  toStatusInput: unknown
) => {
  const fromStatus = normalizeBatchStatus(fromStatusInput);
  const toStatus = normalizeBatchStatus(toStatusInput);
  if (!canTransitionBatchStatus(fromStatus, toStatus)) {
    throw createWorkflowError(
      `Invalid status transition from "${fromStatus}" to "${toStatus}".`,
      WORKFLOW_VALIDATION_CODES.INVALID_TRANSITION
    );
  }
};

export const assertBatchMutableForPricing = (
  statusInput: unknown,
  actionDescription = 'update pricing'
) => {
  const status = normalizeBatchStatus(statusInput);
  if (status === 'Approved' || status === 'Invoiced') {
    throw createWorkflowError(
      `Cannot ${actionDescription} for batch status "${statusInput}".`,
      WORKFLOW_VALIDATION_CODES.BATCH_IMMUTABLE
    );
  }
};

export const resolveStatusAfterCalculation = (classCount: number): ExaminationBatchStatus => {
  return classCount > 0 ? 'Calculated' : 'Draft';
};

export const assertCanApproveBatch = (statusInput: unknown) => {
  const status = normalizeBatchStatus(statusInput);
  if (status === 'Approved' || status === 'Invoiced') {
    throw createWorkflowError(
      'Batch is already approved or invoiced',
      WORKFLOW_VALIDATION_CODES.APPROVAL_NOT_ALLOWED
    );
  }
  if (!canTransitionBatchStatus(status, 'Approved')) {
    throw createWorkflowError(
      `Batch with status "${status}" cannot be approved.`,
      WORKFLOW_VALIDATION_CODES.INVALID_TRANSITION
    );
  }
};

export const assertCanGenerateInvoice = (statusInput: unknown) => {
  const status = normalizeBatchStatus(statusInput);
  if (status !== 'Approved' && status !== 'Invoiced') {
    throw createWorkflowError(
      'Batch must be approved before invoicing',
      WORKFLOW_VALIDATION_CODES.INVOICE_NOT_ALLOWED
    );
  }
};

export const calculateApprovalMaterialDeductions = ({
  classes = [],
  paperItem,
  tonerItem,
  paperConversionRate,
  tonerPagesPerUnit,
  paperUnitCost,
  tonerUnitCost,
  calculateSubjectConsumption
}: {
  classes?: ApprovalClassInput[];
  paperItem?: ApprovalMaterialInput | null;
  tonerItem?: ApprovalMaterialInput | null;
  paperConversionRate?: number;
  tonerPagesPerUnit?: number;
  paperUnitCost?: number;
  tonerUnitCost?: number;
  calculateSubjectConsumption: (
    subject: ApprovalClassSubjectInput,
    learners: number
  ) => { totalSheets: number; totalPages: number };
}): ApprovalMaterialDeduction[] => {
  const safePaperRate = Math.max(1, toNumber(paperConversionRate, 500));
  const safeTonerRate = Math.max(1, toNumber(tonerPagesPerUnit, 20000));
  const safePaperUnitCost = Math.max(0, toNumber(paperUnitCost, 0));
  const safeTonerUnitCost = Math.max(0, toNumber(tonerUnitCost, 0));
  const deductions = new Map<string, ApprovalMaterialDeduction>();

  const addDeduction = (item: ApprovalMaterialInput | null | undefined, quantity: number, unitCost: number) => {
    const itemId = String(item?.id || '').trim();
    if (!itemId) return;
    const safeQuantity = Math.max(0, toNumber(quantity, 0));
    if (safeQuantity <= 0) return;
    const existing = deductions.get(itemId) || {
      item_id: itemId,
      item_name: String(item?.name || item?.material || itemId),
      quantity_required: 0,
      unit_cost: roundMoney(unitCost)
    };
    existing.quantity_required = roundMoney(existing.quantity_required + safeQuantity);
    deductions.set(itemId, existing);
  };

  for (const cls of classes || []) {
    const learners = Math.max(1, Math.floor(toNumber(cls?.number_of_learners, 0)));
    let classTotalSheets = 0;
    let classTotalPages = 0;

    for (const subject of cls?.subjects || []) {
      const consumption = calculateSubjectConsumption(subject, learners);
      classTotalSheets += Math.max(0, toNumber(consumption?.totalSheets, 0));
      classTotalPages += Math.max(0, toNumber(consumption?.totalPages, 0));
    }

    const paperQty = classTotalSheets / safePaperRate;
    const tonerQty = classTotalPages / safeTonerRate;
    addDeduction(paperItem, paperQty, safePaperUnitCost);
    addDeduction(tonerItem, tonerQty, safeTonerUnitCost);
  }

  return Array.from(deductions.values());
};
