const WORKFLOW_VALIDATION_CODES = {
  INVALID_STATUS: 'INVALID_STATUS',
  INVALID_TRANSITION: 'INVALID_TRANSITION',
  BATCH_IMMUTABLE: 'BATCH_IMMUTABLE',
  APPROVAL_NOT_ALLOWED: 'APPROVAL_NOT_ALLOWED',
  INVOICE_NOT_ALLOWED: 'INVOICE_NOT_ALLOWED'
};

const STATUS_ORDER = ['Draft', 'Calculated', 'Approved', 'Completed'];

const { roundMoney } = require('./examinationSharedUtils.cjs');

const toNumber = (value, fallback = 0) => {
  if (value === null || value === undefined || value === '') return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const createWorkflowError = (message, workflowCode) => {
  const error = new Error(message);
  error.workflowCode = workflowCode;
  return error;
};

const normalizeBatchStatus = (status, fallback = 'Draft') => {
  const normalized = String(status || '').trim().toLowerCase();
  if (normalized === 'draft') return 'Draft';
  if (normalized === 'calculated') return 'Calculated';
  if (normalized === 'approved') return 'Approved';
  if (normalized === 'completed' || normalized === 'invoiced') return 'Completed';
  return fallback;
};

const canTransitionBatchStatus = (fromStatusInput, toStatusInput) => {
  const fromStatus = normalizeBatchStatus(fromStatusInput);
  const toStatus = normalizeBatchStatus(toStatusInput);
  if (fromStatus === toStatus) return true;
  const fromIndex = STATUS_ORDER.indexOf(fromStatus);
  const toIndex = STATUS_ORDER.indexOf(toStatus);
  return toIndex === fromIndex + 1;
};

const assertBatchMutableForPricing = (statusInput, actionDescription = 'update pricing') => {
  const status = normalizeBatchStatus(statusInput);
  if (status === 'Approved' || status === 'Completed') {
    throw createWorkflowError(
      `Cannot ${actionDescription} for batch status "${statusInput}".`,
      WORKFLOW_VALIDATION_CODES.BATCH_IMMUTABLE
    );
  }
};

const resolveStatusAfterCalculation = (classCount) => {
  return classCount > 0 ? 'Calculated' : 'Draft';
};

const assertCanApproveBatch = (statusInput) => {
  const status = normalizeBatchStatus(statusInput);
  if (status === 'Approved' || status === 'Completed') {
    throw createWorkflowError(
      'Batch is already approved or invoiced',
      WORKFLOW_VALIDATION_CODES.APPROVAL_NOT_ALLOWED
    );
  }
  if (status !== 'Draft' && status !== 'Calculated') {
    throw createWorkflowError(
      `Batch with status "${status}" cannot be approved.`,
      WORKFLOW_VALIDATION_CODES.INVALID_TRANSITION
    );
  }
};

const assertCanGenerateInvoice = (statusInput) => {
  const status = normalizeBatchStatus(statusInput);
  if (status !== 'Approved' && status !== 'Completed') {
    throw createWorkflowError(
      'Batch must be approved before invoicing',
      WORKFLOW_VALIDATION_CODES.INVOICE_NOT_ALLOWED
    );
  }
};

const calculateApprovalMaterialDeductions = ({
  classes = [],
  paperItem,
  tonerItem,
  paperConversionRate,
  tonerPagesPerUnit,
  paperUnitCost,
  tonerUnitCost,
  calculateSubjectConsumption
}) => {
  const safePaperRate = Math.max(1, toNumber(paperConversionRate, 500));
  const safeTonerRate = Math.max(1, toNumber(tonerPagesPerUnit, 20000));
  const safePaperUnitCost = Math.max(0, toNumber(paperUnitCost, 0));
  const safeTonerUnitCost = Math.max(0, toNumber(tonerUnitCost, 0));
  const deductions = new Map();

  const addDeduction = (item, quantity, unitCost) => {
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

module.exports = {
  WORKFLOW_VALIDATION_CODES,
  normalizeBatchStatus,
  canTransitionBatchStatus,
  assertBatchMutableForPricing,
  resolveStatusAfterCalculation,
  assertCanApproveBatch,
  assertCanGenerateInvoice,
  calculateApprovalMaterialDeductions
};
