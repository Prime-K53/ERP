const { roundToCurrency, roundUpToStep } = require('../utils/mathUtils.cjs');

const PAGES_PER_SHEET = 2;
const TONER_MG_PER_SHEET = 20;  // Must match index.cjs
const TONER_PAGES_PER_KG = Math.floor(1000000 / TONER_MG_PER_SHEET);  // 1kg = 1,000,000mg → 50,000 pages
const SHEETS_PER_REAM = 500;

const DEFAULT_FALLBACK_ADJUSTMENTS = [];

const toNumber = (value, fallback = 0) => {
  if (value === null || value === undefined || value === '') return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const roundCurrency = (value) => roundToCurrency(value);

const clampNonNegative = (value) => Math.max(0, roundCurrency(value));

const normalizeAdjustmentType = (type) => {
  const normalized = String(type || '').toUpperCase().trim();
  if (normalized === 'FIXED') return 'FIXED';
  if (normalized === 'PERCENT') return 'PERCENTAGE';
  return 'PERCENTAGE';
};

/**
 * Resolve the preferred material unit cost source for BOM calculations.
 * Priority:
 * 1) current inventory master cost
 * 2) weighted active material batch cost
 * 3) latest inbound transaction cost
 * 4) configured fallback cost
 */
const resolvePreferredUnitCost = ({
  inventoryUnitCost,
  weightedBatchUnitCost,
  latestInboundUnitCost,
  fallbackUnitCost = 0
}) => {
  const preferred = [
    { source: 'inventory.master', value: toNumber(inventoryUnitCost, 0) },
    { source: 'material_batches.weighted_active', value: toNumber(weightedBatchUnitCost, 0) },
    { source: 'inventory_transactions.latest_in', value: toNumber(latestInboundUnitCost, 0) },
    { source: 'fallback.default', value: toNumber(fallbackUnitCost, 0) }
  ].find((entry) => entry.value > 0);

  if (!preferred) {
    return { unitCost: 0, source: 'none' };
  }

  return { unitCost: preferred.value, source: preferred.source };
};

const calculateSubjectConsumption = (subject, learners) => {
  const pages = Math.max(1, Math.floor(toNumber(subject?.pages, 0)));
  const extraCopies = Math.max(0, Math.floor(toNumber(subject?.extra_copies, 0)));
  const safeLearners = Math.max(1, Math.floor(toNumber(learners, 1)));

  const sheetsPerCopy = Math.ceil(pages / PAGES_PER_SHEET);
  const totalCopies = safeLearners + extraCopies;
  const totalSheets = sheetsPerCopy * totalCopies;
  const totalPages = pages * totalCopies;

  return {
    pages,
    extraCopies,
    sheetsPerCopy,
    totalCopies,
    totalSheets,
    totalPages
  };
};

const calculateClassMaterialCost = ({
  totalSheets,
  totalPages,
  paperUnitCost,
  tonerUnitCost
}) => {
  const safeSheets = Math.max(0, toNumber(totalSheets, 0));
  const safePages = Math.max(0, toNumber(totalPages, 0));
  const safePaperUnitCost = Math.max(0, toNumber(paperUnitCost, 0));
  const safeTonerUnitCost = Math.max(0, toNumber(tonerUnitCost, 0));

  const reamsRequired = safeSheets / SHEETS_PER_REAM;
  const tonerRequired = safePages / TONER_PAGES_PER_KG;
  const paperCost = clampNonNegative(reamsRequired * safePaperUnitCost);
  const tonerCost = clampNonNegative(tonerRequired * safeTonerUnitCost);
  const materialCost = clampNonNegative(paperCost + tonerCost);

  return {
    reamsRequired,
    tonerRequired,
    paperCost,
    tonerCost,
    materialCost
  };
};

const sortAdjustments = (adjustments) => {
  return [...adjustments].sort((a, b) => {
    const left = toNumber(a?.sort_order, 0);
    const right = toNumber(b?.sort_order, 0);
    if (left !== right) return left - right;
    return String(a?.name || '').localeCompare(String(b?.name || ''));
  });
};

const normalizeAdjustments = (adjustments = []) => {
  return sortAdjustments(adjustments).map((adj, index) => {
    const type = normalizeAdjustmentType(adj?.type);
    const rawValue = type === 'FIXED'
      ? toNumber(adj?.value, 0)
      : toNumber(adj?.percentage ?? adj?.value, 0);

    return {
      id: String(adj?.id || `fallback-adjustment-${index + 1}`),
      name: String(adj?.display_name || adj?.name || `Adjustment ${index + 1}`),
      type,
      value: rawValue,
      sortOrder: toNumber(adj?.sort_order, index)
    };
  });
};

const buildAdjustmentBreakdown = (materialCost, adjustments = []) => {
  const normalized = normalizeAdjustments(adjustments);
  const safeMaterialCost = clampNonNegative(materialCost);
  let runningTotal = safeMaterialCost;
  let totalAdjustment = 0;

  const rows = normalized.map((adj) => {
    const baseAmount = runningTotal;
    const amount = adj.type === 'FIXED'
      ? clampNonNegative(adj.value)
      : clampNonNegative(baseAmount * (adj.value / 100));

    runningTotal = clampNonNegative(runningTotal + amount);
    totalAdjustment = clampNonNegative(totalAdjustment + amount);

    return {
      adjustmentId: adj.id,
      adjustmentName: adj.name,
      adjustmentType: adj.type,
      adjustmentValue: adj.value,
      baseAmount: clampNonNegative(baseAmount),
      originalAmount: clampNonNegative(amount),
      redistributedAmount: clampNonNegative(amount),
      allocationRatio: 0
    };
  });

  const normalizedRows = rows.map((row, index) => ({
    ...row,
    allocationRatio: totalAdjustment > 0
      ? row.originalAmount / totalAdjustment
      : (rows.length > 0 ? 1 / rows.length : 0),
    sequenceNo: index + 1
  }));

  return {
    rows: normalizedRows,
    materialCost: safeMaterialCost,
    adjustmentTotal: clampNonNegative(totalAdjustment),
    totalCost: clampNonNegative(safeMaterialCost + totalAdjustment)
  };
};

const roundPreservingTotal = (values, targetTotal) => {
  if (values.length === 0) return [];
  const rounded = values.map((value) => clampNonNegative(value));
  const current = rounded.reduce((sum, value) => sum + value, 0);
  const diff = roundCurrency(targetTotal - current);
  if (Math.abs(diff) < 0.01) return rounded;
  rounded[rounded.length - 1] = clampNonNegative(rounded[rounded.length - 1] + diff);
  return rounded;
};

const redistributeAdjustments = (rows, targetAdjustmentTotal) => {
  const safeTargetTotal = clampNonNegative(targetAdjustmentTotal);
  if (!rows.length) {
    return {
      rows: [],
      adjustmentTotal: safeTargetTotal
    };
  }

  const safeRows = rows.map((row) => ({
    ...row,
    originalAmount: clampNonNegative(row.originalAmount),
    allocationRatio: Math.max(0, toNumber(row.allocationRatio, 0))
  }));
  const originalTotal = safeRows.reduce((sum, row) => sum + row.originalAmount, 0);

  let redistributedRaw;
  if (originalTotal <= 0) {
    const even = safeTargetTotal / safeRows.length;
    redistributedRaw = safeRows.map(() => even);
  } else {
    const scale = safeTargetTotal / originalTotal;
    redistributedRaw = safeRows.map((row) => row.originalAmount * scale);
  }

  const redistributed = roundPreservingTotal(redistributedRaw, safeTargetTotal);

  const resultRows = safeRows.map((row, index) => ({
    ...row,
    redistributedAmount: clampNonNegative(redistributed[index]),
    allocationRatio: safeTargetTotal > 0
      ? clampNonNegative(redistributed[index]) / safeTargetTotal
      : row.allocationRatio
  }));

  return {
    rows: resultRows,
    adjustmentTotal: clampNonNegative(
      resultRows.reduce((sum, row) => sum + row.redistributedAmount, 0)
    )
  };
};

const calculatePercentageDifference = (manualCostPerLearner, suggestedCostPerLearner) => {
  const manual = toNumber(manualCostPerLearner, 0);
  const suggested = toNumber(suggestedCostPerLearner, 0);
  if (suggested <= 0) return 0;
  return roundCurrency(((manual - suggested) / suggested) * 100);
};

const resolveClassPricing = ({
  learners,
  materialCost,
  suggestedTotalCost,
  suggestedCostPerLearner,
  adjustmentRows,
  manualCostPerLearner,
  manualOverrideEnabled
}) => {
  const safeLearners = Math.max(1, Math.floor(toNumber(learners, 1)));
  const safeMaterialCost = clampNonNegative(materialCost);
  const safeSuggestedTotalCost = clampNonNegative(suggestedTotalCost);
  const safeSuggestedCostPerLearner = clampNonNegative(suggestedCostPerLearner);
  const safeAdjustmentRows = Array.isArray(adjustmentRows) ? adjustmentRows : [];

  if (!manualOverrideEnabled) {
    return {
      isManualOverride: false,
      finalCostPerLearner: safeSuggestedCostPerLearner,
      finalClassTotal: safeSuggestedTotalCost,
      adjustmentTotal: clampNonNegative(safeSuggestedTotalCost - safeMaterialCost),
      adjustmentRows: safeAdjustmentRows.map((row) => ({
        ...row,
        redistributedAmount: clampNonNegative(row.redistributedAmount ?? row.originalAmount)
      })),
      percentageDifference: 0
    };
  }

  const safeManualCostPerLearner = toNumber(manualCostPerLearner, 0);
  if (!Number.isFinite(safeManualCostPerLearner) || safeManualCostPerLearner <= 0) {
    throw new Error('Manual cost per learner must be greater than zero.');
  }

  const manualClassTotal = roundCurrency(safeManualCostPerLearner * safeLearners);
  const minimumClassTotal = safeMaterialCost;
  if (manualClassTotal < minimumClassTotal) {
    throw new Error(
      `Manual cost is too low. Minimum allowed per learner is ${roundCurrency(minimumClassTotal / safeLearners)}.`
    );
  }

  const targetAdjustmentTotal = clampNonNegative(manualClassTotal - safeMaterialCost);
  const redistributed = redistributeAdjustments(safeAdjustmentRows, targetAdjustmentTotal);

  return {
    isManualOverride: true,
    finalCostPerLearner: roundCurrency(manualClassTotal / safeLearners),
    finalClassTotal: clampNonNegative(manualClassTotal),
    adjustmentTotal: redistributed.adjustmentTotal,
    adjustmentRows: redistributed.rows,
    percentageDifference: calculatePercentageDifference(
      safeManualCostPerLearner,
      safeSuggestedCostPerLearner
    )
  };
};

// --- Round Up Logic ---

/**
 * Rounds a value UP to the nearest multiple.
 * Delegates to shared mathUtils.roundUpToStep.
 */
const roundUpToNearest = (value, nearest) => roundUpToStep(value, nearest);

/**
 * Calculates a "Rounding Adjustment" to reach the rounded-up target.
 * Returns the adjustment amount needed to add to the base value to reach the target.
 */
const calculateRoundingAdjustment = (baseValue, targetValue) => {
  const safeBase = clampNonNegative(baseValue);
  const safeTarget = clampNonNegative(targetValue);
  return clampNonNegative(safeTarget - safeBase);
};

module.exports = {
  PAGES_PER_SHEET,
  TONER_PAGES_PER_KG,
  SHEETS_PER_REAM,
  DEFAULT_FALLBACK_ADJUSTMENTS,
  toNumber,
  roundCurrency,
  roundUpToNearest,
  calculateRoundingAdjustment,
  normalizeAdjustmentType,
  resolvePreferredUnitCost,
  calculateSubjectConsumption,
  calculateClassMaterialCost,
  buildAdjustmentBreakdown,
  redistributeAdjustments,
  calculatePercentageDifference,
  resolveClassPricing
};
