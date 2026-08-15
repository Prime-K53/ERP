const repo = require('./supabaseRepository.cjs');
const { randomUUID, createHash } = require('crypto');
const pricingEngine = require('./examinationPricingEngine.cjs');
const batchWorkflow = require('./examinationBatchWorkflow.cjs');
const examinationInvoiceAdapter = require('./examinationInvoiceAdapter.cjs');
const { auditService } = require('../auditService.cjs');
const { toNumericValue, pickPositiveNumber } = require('./examinationSharedUtils.cjs');

const PAGES_PER_SHEET = pricingEngine.PAGES_PER_SHEET;
const TONER_PAGES_PER_KG = pricingEngine.TONER_PAGES_PER_KG;
const SHEETS_PER_REAM = pricingEngine.SHEETS_PER_REAM;
const DEFAULT_PAPER_CONVERSION_RATE = 500;
// Fallback paper unit cost per ream when no valid inventory cost is available.
const DEFAULT_PAPER_UNIT_COST = 500;
const DEFAULT_TONER_UNIT_COST = 85000;
const DEFAULT_TONER_PAGES_PER_UNIT = TONER_PAGES_PER_KG;



const toBoolean = (value) => {
  if (typeof value === 'boolean') return value;
  const normalized = String(value ?? '').trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on';
};

const isAbortSignalAborted = (signal) => Boolean(signal?.aborted);

const SYNC_ENTITY_MARKET_ADJUSTMENTS = 'market_adjustments';
const SYNC_ENTITY_INVENTORY_ITEMS = 'inventory_items';
const INVOICE_ORIGIN_EXAMINATION = examinationInvoiceAdapter.EXAMINATION_INVOICE_ORIGIN;

const stableHash = (value) => {
  const serialized = typeof value === 'string' ? value : JSON.stringify(value ?? '');
  return createHash('sha256').update(serialized).digest('hex');
};

const asIsoDateTime = (value) => {
  if (!value) return null;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  return date.toISOString();
};

const normalizeAdjustmentTypeForSync = (type) => {
  const normalized = String(type || '').toUpperCase().trim();
  if (normalized === 'FIXED') return 'FIXED';
  if (normalized === 'PERCENT' || normalized === 'PERCENTAGE') return 'PERCENTAGE';
  return 'PERCENTAGE';
};

const normalizeMarketAdjustmentSyncRecord = (record) => {
  const id = String(record?.id || '').trim();
  if (!id) return null;

  const normalizedType = normalizeAdjustmentTypeForSync(record?.type);
  const normalizedValue = toNumericValue(record?.value ?? record?.percentage) ?? 0;
  const normalizedPercentage = toNumericValue(record?.percentage ?? record?.value) ?? 0;
  const active = toBoolean(record?.active ?? record?.isActive ?? record?.is_active ?? 1);
  const sortOrder = toNumericValue(record?.sortOrder ?? record?.sort_order) ?? 0;

  const normalized = {
    id,
    name: String(record?.name || record?.displayName || record?.display_name || 'Adjustment').trim() || 'Adjustment',
    type: normalizedType,
    value: normalizedValue,
    percentage: normalizedPercentage,
    applies_to: String(record?.appliesTo || record?.applies_to || 'COST').trim() || 'COST',
    active: active ? 1 : 0,
    is_active: active ? 1 : 0,
    description: String(record?.description || ''),
    category: String(record?.category || ''),
    display_name: String(record?.displayName || record?.display_name || record?.name || 'Adjustment'),
    adjustment_category: record?.adjustmentCategory || record?.adjustment_category || null,
    sort_order: sortOrder,
    is_system_default: toBoolean(record?.isSystemDefault || record?.is_system_default) ? 1 : 0,
    apply_to_categories: (() => {
      const raw = record?.applyToCategories ?? record?.apply_to_categories;
      if (typeof raw === 'string') return raw;
      if (Array.isArray(raw)) {
        try {
          return JSON.stringify(raw);
        } catch {
          return '[]';
        }
      }
      return '[]';
    })(),
    created_at: record?.createdAt || record?.created_at || null,
    last_applied_at: record?.lastAppliedAt || record?.last_applied_at || null,
    total_applied_amount: toNumericValue(record?.totalAppliedAmount ?? record?.total_applied_amount) ?? 0,
    application_count: toNumericValue(record?.applicationCount ?? record?.application_count) ?? 0
  };

  const checksumPayload = {
    id: normalized.id,
    name: normalized.name,
    type: normalized.type,
    value: normalized.value,
    percentage: normalized.percentage,
    applies_to: normalized.applies_to,
    active: normalized.active,
    description: normalized.description,
    category: normalized.category,
    display_name: normalized.display_name,
    adjustment_category: normalized.adjustment_category,
    sort_order: normalized.sort_order
  };

  return {
    ...normalized,
    sync_checksum: stableHash(checksumPayload)
  };
};

const inventoryMaterialHint = (record) => (
  `${String(record?.name || '')} ${String(record?.material || '')} ${String(record?.category_id || '')}`
).toLowerCase();

const isBomRelevantInventoryRecord = (record, preferredIds = new Set()) => {
  const id = String(record?.id || '').trim();
  if (!id) return false;
  if (preferredIds.has(id)) return true;
  const hint = inventoryMaterialHint(record);
  return hint.includes('paper') || hint.includes('toner');
};

const normalizeInventorySyncRecord = (record) => {
  const id = String(record?.id || '').trim();
  if (!id) return null;

  const costPerUnit = pickPositiveNumber(record?.cost_per_unit, record?.cost_price, record?.cost, 0) ?? 0;
  const quantityCandidate = toNumericValue(record?.quantity ?? record?.stock);
  const quantity = quantityCandidate === null ? null : Math.max(0, quantityCandidate);
  const conversionRate = pickPositiveNumber(
    record?.conversion_rate,
    record?.conversionRate,
    DEFAULT_PAPER_CONVERSION_RATE
  ) ?? DEFAULT_PAPER_CONVERSION_RATE;

  const normalized = {
    id,
    name: String(record?.name || record?.material || 'Material').trim() || 'Material',
    material: String(record?.material || record?.category || record?.type || '').trim() || null,
    category_id: String(record?.category_id || record?.category || '').trim() || null,
    unit: String(record?.unit || 'units').trim() || 'units',
    quantity,
    cost_per_unit: costPerUnit,
    conversion_rate: conversionRate,
    last_updated: asIsoDateTime(record?.last_updated || record?.updated_at || record?.updatedAt || record?.created_at || new Date().toISOString())
  };

  const checksumPayload = {
    id: normalized.id,
    name: normalized.name,
    material: normalized.material,
    category_id: normalized.category_id,
    unit: normalized.unit,
    quantity: normalized.quantity,
    cost_per_unit: normalized.cost_per_unit,
    conversion_rate: normalized.conversion_rate
  };

  return {
    ...normalized,
    sync_checksum: stableHash(checksumPayload)
  };
};

const buildStateChecksum = (records) => {
  const sorted = [...(records || [])].sort((a, b) => String(a.id || '').localeCompare(String(b.id || '')));
  return stableHash(sorted);
};

const frontendInvoiceStatus = (status) => {
  const normalized = String(status || '').trim().toLowerCase();
  if (normalized === 'paid') return 'Paid';
  if (normalized === 'partial' || normalized === 'partially_paid') return 'Partial';
  if (normalized === 'overdue') return 'Overdue';
  if (normalized === 'cancelled' || normalized === 'canceled' || normalized === 'void') return 'Cancelled';
  if (normalized === 'draft') return 'Draft';
  return 'Unpaid';
};

const toIsoOrFallback = (value, fallback = null) => {
  const iso = asIsoDateTime(value);
  return iso || fallback;
};

const parseJsonArray = (rawValue) => {
  if (!rawValue) return [];
  if (Array.isArray(rawValue)) return rawValue;
  if (typeof rawValue !== 'string') return [];
  try {
    const parsed = JSON.parse(rawValue);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const buildExaminationInvoiceClassBreakdown = (batch) => {
  const classes = Array.isArray(batch?.classes) ? batch.classes : [];
  return classes
    .map((cls, index) => {
      const className = String(cls?.class_name || `Class ${index + 1}`).trim() || `Class ${index + 1}`;
      const learners = Math.max(0, Math.floor(toNumericValue(cls?.number_of_learners) ?? 0));
      const unitPrice = toNumericValue(
        cls?.final_fee_per_learner
        ?? cls?.price_per_learner
        ?? cls?.expected_fee_per_learner
      ) ?? 0;
      const classTotal = toNumericValue(cls?.live_total_preview) ?? pricingEngine.roundCurrency(unitPrice * learners);
      const subjects = Array.isArray(cls?.subjects)
        ? cls.subjects
          .map((subject) => String(subject?.subject_name || subject?.name || '').trim())
          .filter(Boolean)
        : [];

      return {
        className,
        subjects,
        totalCandidates: learners,
        chargePerLearner: pricingEngine.roundCurrency(unitPrice),
        classTotal: pricingEngine.roundCurrency(classTotal)
      };
    })
    .filter((entry) => (
      entry.totalCandidates > 0
      || entry.classTotal > 0
      || entry.subjects.length > 0
    ));
};

const parseBatchAdjustmentSnapshots = (serialized) => {
  if (typeof serialized !== 'string' || !serialized.trim()) return [];

  try {
    const parsed = JSON.parse(serialized);
    if (!Array.isArray(parsed)) return [];

    return parsed
      .map((entry, index) => ({
        id: String(entry?.id || `adjustment-${index + 1}`),
        name: String(entry?.name || entry?.adjustment_name || `Adjustment ${index + 1}`),
        type: normalizeAdjustmentTypeForSync(entry?.type || entry?.adjustment_type),
        total_amount: pricingEngine.roundCurrency(
          toNumericValue(entry?.total_amount ?? entry?.totalAmount) ?? 0
        ),
        application_count: Math.max(0, Math.floor(toNumericValue(entry?.application_count ?? entry?.applicationCount) ?? 0)),
        is_rounding: Boolean(
          toBoolean(entry?.is_rounding)
          || String(entry?.id || '').trim().toLowerCase() === 'auto-rounding'
        )
      }))
      .filter((entry) => entry.total_amount > 0);
  } catch {
    return [];
  }
};

const serializeBatchAdjustmentSnapshots = (snapshots = []) => {
  try {
    return JSON.stringify(snapshots);
  } catch {
    return '[]';
  }
};

const summarizeBatchAdjustmentTracking = async (batchId) => {
  const rows = await runQuery(
    `SELECT
       adjustment_id,
       adjustment_name,
       adjustment_type,
       COALESCE(SUM(COALESCE(redistributed_amount, original_amount, 0)), 0) AS total_amount,
       COUNT(*) AS application_count,
       MIN(COALESCE(sequence_no, 0)) AS sequence_no
     FROM examination_class_adjustments
     WHERE batch_id = ?
     GROUP BY adjustment_id, adjustment_name, adjustment_type
     ORDER BY sequence_no ASC, adjustment_name ASC`,
    [batchId]
  );

  const snapshots = (rows || [])
    .map((row, index) => {
      const id = String(row?.adjustment_id || `adjustment-${index + 1}`);
      const totalAmount = pricingEngine.roundCurrency(toNumericValue(row?.total_amount) ?? 0);
      return {
        id,
        name: String(row?.adjustment_name || `Adjustment ${index + 1}`),
        type: normalizeAdjustmentTypeForSync(row?.adjustment_type),
        total_amount: totalAmount,
        application_count: Math.max(0, Math.floor(toNumericValue(row?.application_count) ?? 0)),
        is_rounding: id.trim().toLowerCase() === 'auto-rounding'
      };
    })
    .filter((entry) => entry.total_amount > 0);

  const totalAdjustmentAmount = pricingEngine.roundCurrency(
    snapshots.reduce((sum, entry) => sum + (toNumericValue(entry?.total_amount) ?? 0), 0)
  );
  const roundingAdjustmentTotal = pricingEngine.roundCurrency(
    snapshots
      .filter((entry) => entry.is_rounding)
      .reduce((sum, entry) => sum + (toNumericValue(entry?.total_amount) ?? 0), 0)
  );

  return {
    snapshots,
    serialized: serializeBatchAdjustmentSnapshots(snapshots),
    totalAdjustmentAmount,
    roundingAdjustmentTotal
  };
};

const mapBackendInvoiceToFrontendPayload = ({ invoiceRow, batch, customerName, lineItems }) => {
  const createdAt = toIsoOrFallback(invoiceRow?.created_at, new Date().toISOString());
  const dueDate = toIsoOrFallback(
    invoiceRow?.due_date,
    new Date(Date.now() + (30 * 24 * 60 * 60 * 1000)).toISOString()
  );
  const invoiceNumber = String(
    invoiceRow?.invoice_number
    || examinationInvoiceAdapter.buildExaminationLogicalInvoiceNumber(invoiceRow?.id, createdAt)
  );
  const frontendId = invoiceNumber.toUpperCase().startsWith('EXM-')
    ? invoiceNumber
    : `EXM-${invoiceNumber}`;
  const totalAmount = toNumericValue(invoiceRow?.total_amount) ?? 0;
  const normalizedStatus = frontendInvoiceStatus(invoiceRow?.status);
  const parsedItems = parseJsonArray(invoiceRow?.line_items_json);
  const normalizedItems = parsedItems.length > 0 ? parsedItems : (Array.isArray(lineItems) ? lineItems : []);
  const paidAmount = normalizedStatus === 'Paid' ? totalAmount : 0;
  const adjustmentSnapshots = parseBatchAdjustmentSnapshots(batch?.adjustment_snapshots_json);
  const adjustmentTotal = pricingEngine.roundCurrency(toNumericValue(batch?.calculated_adjustment_total) ?? 0);
  const materialTotal = pricingEngine.roundCurrency(toNumericValue(batch?.calculated_material_total) ?? 0);
  const roundingDifference = pricingEngine.roundCurrency(toNumericValue(batch?.rounding_adjustment_total) ?? 0);
  const preRoundingTotalAmount = pricingEngine.roundCurrency(
    toNumericValue(batch?.pre_rounding_total_amount) ?? Math.max(0, totalAmount - roundingDifference)
  );
  const classBreakdown = buildExaminationInvoiceClassBreakdown(batch);

  return {
    id: frontendId,
    backendInvoiceId: String(invoiceRow?.id || ''),
    invoiceNumber,
    date: createdAt,
    dueDate,
    customerId: String(invoiceRow?.customer_id || batch?.school_id || ''),
    customerName: String(invoiceRow?.customer_name || customerName || `School ${batch?.school_id || ''}`),
    totalAmount,
    subtotal: preRoundingTotalAmount,
    paidAmount,
    status: normalizedStatus,
    items: normalizedItems,
    subAccountName: batch?.sub_account_name || invoiceRow?.sub_account_name || undefined,
    notes: String(invoiceRow?.notes || `Generated from examination batch ${String(batch?.name || batch?.id || '')}`),
    reference: `EXM-BATCH-${String(batch?.id || '')}`,
    currency: String(invoiceRow?.currency || batch?.currency || 'MWK'),
    batchId: String(batch?.id || ''),
    schoolName: String(customerName || ''),
    academicYear: String(batch?.academic_year || ''),
    term: String(batch?.term || ''),
    examType: String(batch?.exam_type || ''),
    materialTotal,
    adjustmentTotal,
    adjustmentSnapshots: adjustmentSnapshots.map((snapshot) => ({
      id: snapshot.id,
      name: snapshot.name,
      type: snapshot.type,
      total_amount: snapshot.total_amount,
      application_count: snapshot.application_count,
      is_rounding: Boolean(snapshot.is_rounding),
      value: snapshot.total_amount,
      calculatedAmount: snapshot.total_amount
    })),
    classBreakdown,
    preRoundingTotalAmount,
    roundingDifference,
    roundingMethod: String(batch?.rounding_method || 'nearest_50'),
    applyRounding: roundingDifference > 0,
    documentTitle: 'Examination Invoice',
    origin_module: INVOICE_ORIGIN_EXAMINATION,
    origin_batch_id: String(batch?.id || ''),
    originModule: INVOICE_ORIGIN_EXAMINATION,
    originBatchId: String(batch?.id || '')
  };
};

const ensureExaminationInvoiceDocumentLink = async ({ invoiceRow, batch, customerName, lineItems, userId }) => {
  const logicalNumber = String(invoiceRow?.invoice_number || '').trim();
  if (!logicalNumber) {
    return null;
  }

  const existingDocument = await runGet(
    'SELECT id, logical_number FROM documents WHERE logical_number = ? LIMIT 1',
    [logicalNumber]
  );
  if (existingDocument?.logical_number) {
    return String(existingDocument.logical_number);
  }

  const payload = {
    id: logicalNumber,
    backendInvoiceId: String(invoiceRow?.id || ''),
    customerId: String(invoiceRow?.customer_id || batch?.customer_id || batch?.school_id || ''),
    customerName: String(invoiceRow?.customer_name || customerName || `School ${batch?.school_id || ''}`),
    totalAmount: toNumericValue(invoiceRow?.total_amount) ?? 0,
    subtotal: toNumericValue(invoiceRow?.subtotal) ?? toNumericValue(invoiceRow?.total_amount) ?? 0,
    dueDate: toIsoOrFallback(invoiceRow?.due_date, new Date().toISOString()),
    date: toIsoOrFallback(invoiceRow?.created_at, new Date().toISOString()),
    currency: String(invoiceRow?.currency || batch?.currency || 'MWK'),
    status: frontendInvoiceStatus(invoiceRow?.status),
    items: Array.isArray(lineItems) && lineItems.length > 0 ? lineItems : parseJsonArray(invoiceRow?.line_items_json),
    reference: `EXM-BATCH-${String(batch?.id || '')}`,
    origin_module: INVOICE_ORIGIN_EXAMINATION,
    origin_batch_id: String(batch?.id || '')
  };

  await runRun(
    `INSERT INTO documents (id, logical_number, type, status, payload, created_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
    [
      randomUUID(),
      logicalNumber,
      'invoice',
      'draft',
      JSON.stringify(payload),
      userId || 'System'
    ]
  );

  return logicalNumber;
};

const tableColumnCache = new Map();
const tableExistsCache = new Map();

const getTableColumnSet = async (tableName) => {
  const normalizedTable = String(tableName || '').trim().toLowerCase();
  if (!normalizedTable) return new Set();
  
  if (tableColumnCache.has(normalizedTable)) {
    return tableColumnCache.get(normalizedTable);
  }

  const columns = await runQuery(`PRAGMA table_info(${normalizedTable})`);
  const columnSet = new Set(
    (columns || [])
      .map((column) => String(column?.name || '').trim().toLowerCase())
      .filter(Boolean)
  );
  
  tableColumnCache.set(normalizedTable, columnSet);
  return columnSet;
};

const serializeAuditValue = (value) => {
  if (value === undefined || value === null) return null;
  try {
    return JSON.stringify(value);
  } catch (error) {
    return JSON.stringify(String(value));
  }
};

const writeAuditLog = async ({
  userId = 'System',
  userRole = 'system',
  action,
  entityType,
  entityId,
  details = '',
  oldValue = null,
  newValue = null,
  reason = null,
  correlationId = null,
  sessionId = null,
  ipAddress = null,
  userAgent = null,
  httpMethod = null,
  httpPath = null,
  approvalChain = null
} = {}) => {
  try {
    const columns = await getTableColumnSet('audit_logs');
    if (!columns.size) {
      return false;
    }

    const timestamp = new Date().toISOString();
    const extendedSchema = columns.has('correlation_id') && columns.has('integrity_hash');

    let payload;
    if (extendedSchema) {
      const effectiveCorrelationId = String(correlationId || randomUUID());
      payload = {
        id: randomUUID(),
        timestamp,
        correlation_id: effectiveCorrelationId,
        user_id: String(userId || 'System'),
        user_role: String(userRole || 'system'),
        session_id: sessionId || null,
        action: String(action || ''),
        entity_type: String(entityType || ''),
        entity_id: String(entityId || ''),
        details: details ? String(details) : null,
        old_value: serializeAuditValue(oldValue),
        new_value: serializeAuditValue(newValue),
        delta: null,
        integrity_hash: stableHash({
          timestamp,
          correlationId: effectiveCorrelationId,
          userId,
          userRole,
          action,
          entityType,
          entityId,
          details,
          oldValue,
          newValue,
          reason
        }),
        ip_address: ipAddress || null,
        user_agent: userAgent || null,
        http_method: httpMethod || null,
        http_path: httpPath || null,
        reason: reason || null,
        approval_chain: approvalChain ? serializeAuditValue(approvalChain) : null
      };
    } else {
      payload = {
        user_id: String(userId || 'System'),
        action: String(action || ''),
        entity_type: String(entityType || ''),
        entity_id: String(entityId || ''),
        details: details ? String(details) : null,
        timestamp
      };
    }

    const insertColumns = Object.keys(payload).filter((column) => columns.has(column));
    if (!insertColumns.length) {
      return false;
    }

    const placeholders = insertColumns.map(() => '?').join(', ');
    const params = insertColumns.map((column) => payload[column]);
    await runRun(
      `INSERT INTO audit_logs (${insertColumns.join(', ')}) VALUES (${placeholders})`,
      params
    );
    return true;
  } catch (error) {
    console.error(JSON.stringify({
      ts: new Date().toISOString(),
      level: 'warn',
      event: 'exam_audit_log_failed',
      action,
      entityType,
      entityId,
      error: String(error?.message || error)
    }));
    return false;
  }
};

const saveLedgerEntry = async (entry) => {
  const id = randomUUID();
  await runRun(
    `INSERT INTO ledger_entries (id, account_id, entry_type, amount, currency, description, reference_type, reference_id, entry_date)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ? )`,
    [id, entry.account_id, entry.entry_type, entry.amount, entry.currency || 'USD', entry.description || null, entry.reference_type || null, entry.reference_id || null, entry.entry_date || new Date().toISOString()]
  );
  return id;
};

const postInvoiceLedger = async (invoiceId, invoiceData) => {
  const arAccount = await runGet(
    "SELECT * FROM accountstype = 'asset' AND (name LIKE '%receivable%' OR code = '1100')",
    []
  );
  const revenueAccount = await runGet(
    "SELECT * FROM accounts(type = 'revenue' OR name LIKE '%revenue%' OR code = '4000')",
    []
  );
  if (!arAccount || !revenueAccount) return;
  const totalAmount = toNumericValue(invoiceData?.total_amount) ?? 0;
  if (totalAmount <= 0) return;
  await saveLedgerEntry({
    account_id: arAccount.id, entry_type: 'debit', amount: totalAmount,
    currency: invoiceData?.currency || 'USD', description: `Invoice #${invoiceId}`,
    reference_type: 'invoice', reference_id: String(invoiceId)
  });
  await saveLedgerEntry({
    account_id: revenueAccount.id, entry_type: 'credit', amount: totalAmount,
    currency: invoiceData?.currency || 'USD', description: `Invoice #${invoiceId} Revenue`,
    reference_type: 'invoice', reference_id: String(invoiceId)
  });
};

const clearTableCache = (tableName) => {
  if (tableName) {
    const normalized = String(tableName).trim().toLowerCase();
    tableColumnCache.delete(normalized);
    tableExistsCache.delete(normalized);
  } else {
    tableColumnCache.clear();
    tableExistsCache.clear();
  }
};

const tableExists = async (tableName) => {
  const normalizedTable = String(tableName || '').trim().toLowerCase();
  if (!normalizedTable) return false;

  if (tableExistsCache.has(normalizedTable)) {
    return tableExistsCache.get(normalizedTable);
  }

  const row = await runGet(
    "SELECT name FROM sqlite_master WHERE type='table' AND name=?",
    [normalizedTable]
  );
  const exists = !!row;
  tableExistsCache.set(normalizedTable, exists);
  return exists;
};

const isSchemaDriftError = (error) => {
  const message = String(error?.message || '').toLowerCase();
  return (
    message.includes('no such column')
    || message.includes('no such table')
    || message.includes('has no column named')
  );
};

const buildMarketAdjustmentOrderSql = (columns) => {
  if (columns.has('sort_order')) {
    return 'ORDER BY COALESCE(sort_order, 0) ASC, name ASC';
  }
  return 'ORDER BY name ASC';
};

const buildActiveMarketAdjustmentWhereClauses = (columns) => {
  const clauses = [];

  if (columns.has('is_active') && columns.has('active')) {
    clauses.push('COALESCE(is_active, active, 1) = 1');
  } else if (columns.has('is_active')) {
    clauses.push('COALESCE(is_active, 1) = 1');
  } else if (columns.has('active')) {
    clauses.push('COALESCE(active, 1) = 1');
  }

  if (columns.has('deleted')) clauses.push('COALESCE(deleted, 0) = 0');
  if (columns.has('is_deleted')) clauses.push('COALESCE(is_deleted, 0) = 0');
  if (columns.has('deleted_at')) clauses.push('deleted_at IS NULL');

  return clauses;
};

const normalizeMarketAdjustmentMeta = (row, columns) => {
  const hasIsActive = columns.has('is_active');
  const hasActive = columns.has('active');
  const hasDeleted = columns.has('deleted');
  const hasIsDeleted = columns.has('is_deleted');
  const hasDeletedAt = columns.has('deleted_at');

  const activeCandidate = hasIsActive && hasActive
    ? (row?.is_active ?? row?.active)
    : (hasIsActive ? row?.is_active : row?.active);

  const isActive = (hasIsActive || hasActive)
    ? toBoolean(activeCandidate ?? 1)
    : true;

  const isDeleted = (
    (hasDeleted && toBoolean(row?.deleted ?? 0))
    || (hasIsDeleted && toBoolean(row?.is_deleted ?? 0))
    || (hasDeletedAt && Boolean(row?.deleted_at))
  );

  const sortOrder = toNumericValue(row?.sort_order ?? row?.sortOrder) ?? 0;
  const value = toNumericValue(row?.value ?? row?.percentage) ?? 0;
  const percentage = toNumericValue(row?.percentage ?? row?.value) ?? 0;

  return {
    id: String(row?.id || ''),
    name: String(row?.name || row?.display_name || 'Adjustment'),
    displayName: String(row?.display_name || row?.name || 'Adjustment'),
    type: String(row?.type || 'PERCENTAGE').toUpperCase() === 'FIXED' ? 'FIXED' : 'PERCENTAGE',
    value,
    percentage,
    appliesTo: String(row?.applies_to || row?.appliesTo || 'COST'),
    active: isActive,
    isActive,
    deleted: isDeleted,
    isDeleted,
    deletedAt: row?.deleted_at || null,
    description: String(row?.description || ''),
    category: String(row?.category || ''),
    adjustmentCategory: row?.adjustment_category || row?.adjustmentCategory || null,
    sortOrder,
    createdAt: row?.created_at || null,
    lastAppliedAt: row?.last_applied_at || null,
    totalAppliedAmount: toNumericValue(row?.total_applied_amount ?? row?.totalAppliedAmount) ?? 0,
    applicationCount: toNumericValue(row?.application_count ?? row?.applicationCount) ?? 0
  };
};

const resolveEffectiveClassAdjustments = async () => {
  const columns = await getTableColumnSet('market_adjustments');
  const whereClauses = buildActiveMarketAdjustmentWhereClauses(columns);
    const whereSql = whereClauses.length ? `WHERE ${whereClauses.join(' AND ')}` : '';
  const orderSql = buildMarketAdjustmentOrderSql(columns);
  const params = [];
  const adjustments = await runQuery(`
    SELECT * FROM market_adjustments
    
    ${orderSql}
  `, params);
  return adjustments;
};

const sortAdjustmentsForPricing = (adjustments = []) => {
  return [...adjustments].sort((left, right) => {
    const leftOrder = toNumericValue(left?.sort_order ?? left?.sortOrder) ?? 0;
    const rightOrder = toNumericValue(right?.sort_order ?? right?.sortOrder) ?? 0;
    if (leftOrder !== rightOrder) return leftOrder - rightOrder;
    return String(left?.name || '').localeCompare(String(right?.name || ''));
  });
};

const upsertBomDefaultMaterial = async (materialType, preferredItemId) => {
  const columns = await getTableColumnSet('bom_default_materials');
  const materialKey = String(materialType || '').trim().toLowerCase();
  const normalizedPreferred = preferredItemId ? String(preferredItemId).trim() : null;
  const hasId = columns.has('id');
  const hasUpdatedAt = columns.has('updated_at');
  const hasMatchCriteria = columns.has('match_criteria');

  const updateSql = hasUpdatedAt
    ? `UPDATE bom_default_materials
       SET preferred_item_id = ?,
           updated_at = CURRENT_TIMESTAMP
       WHERE material_type = ?`
    : `UPDATE bom_default_materials
       SET preferred_item_id = ?
       WHERE material_type = ?`;

  const updateResult = await runRun(updateSql, [normalizedPreferred, materialKey]);
  if (Number(updateResult?.changes || 0) > 0) {
    return;
  }

  const rowId = `BOM-${materialKey.toUpperCase()}-DEFAULT`;

  if (hasId && hasMatchCriteria) {
    await runRun(
      `INSERT INTO bom_default_materials (id, material_type, preferred_item_id, match_criteria)
       VALUES (?, ?, ?, ?)`,
      [rowId, materialKey, normalizedPreferred, '{}']
    );
    return;
  }

  if (hasId) {
    await runRun(
      `INSERT INTO bom_default_materials (id, material_type, preferred_item_id)
       VALUES (?, ?, ?)`,
      [rowId, materialKey, normalizedPreferred]
    );
    return;
  }

  if (hasMatchCriteria) {
    await runRun(
      `INSERT INTO bom_default_materials (material_type, preferred_item_id, match_criteria)
       VALUES (?, ?, ?)`,
      [materialKey, normalizedPreferred, '{}']
    );
    return;
  }

  await runRun(
    `INSERT INTO bom_default_materials (material_type, preferred_item_id)
     VALUES (?, ?)`,
    [materialKey, normalizedPreferred]
  );
};

const resolveConfiguredExamMaterial = ({
  inventory,
  bomDefaults,
  materialType,
  keywords = [],
  fallbackId,
  fallbackName,
  fallbackCost
}) => {
  const normalizedType = String(materialType || '').trim().toLowerCase();
  const defaultConfig = (bomDefaults || []).find(
    (entry) => String(entry?.material_type || '').trim().toLowerCase() === normalizedType
  );

  if (defaultConfig?.preferred_item_id) {
    const preferredItem = (inventory || []).find(
      (item) => String(item?.id) === String(defaultConfig.preferred_item_id)
    );
    if (preferredItem) {
      return preferredItem;
    }
  }

  // Try matching specific keywords in order
  for (const keyword of keywords) {
    const match = (inventory || []).find((item) => {
      const hint = `${String(item?.name || '')} ${String(item?.material || '')} ${String(item?.category_id || '')}`.toLowerCase();
      return hint.includes(keyword.toLowerCase());
    });
    if (match) return match;
  }

  // Fallback to generic protected match
  const genericKeyword = keywords[keywords.length - 1] || materialType;
  const matchGeneric = (item) => {
    const hint = `${String(item?.name || '')} ${String(item?.material || '')} ${String(item?.category_id || '')}`.toLowerCase();
    return hint.includes(genericKeyword);
  };

  const protectedMatch = (inventory || []).find(
    (item) => matchGeneric(item) && Number(item?.is_protected || 0) === 1
  );
  if (protectedMatch) return protectedMatch;

  const directMatch = (inventory || []).find((item) => matchGeneric(item));
  if (directMatch) return directMatch;

  return {
    id: fallbackId,
    name: fallbackName,
    cost_per_unit: fallbackCost
  };
};

const resolveExamMaterialConfiguration = async () => {
  await ensureExaminationPricingSchema();
  const inventoryQuery = runQuery('SELECT * FROM inventory');
  const bomDefaultsQuery = runQuery('SELECT * FROM bom_default_materials');
  const [inventory, bomDefaults] = await Promise.all([inventoryQuery, bomDefaultsQuery]);

  const paperItem = resolveConfiguredExamMaterial({
    inventory,
    bomDefaults,
    materialType: 'paper',
    keywords: ['A4 Paper 80gsm', 'paper'],
    fallbackId: 'default-paper',
    fallbackName: 'Standard A4 Paper (Ream)',
    fallbackCost: DEFAULT_PAPER_UNIT_COST
  });

  const tonerItem = resolveConfiguredExamMaterial({
    inventory,
    bomDefaults,
    materialType: 'toner',
    keywords: ['HP Universal Toner', 'toner'],
    fallbackId: 'default-toner',
    fallbackName: 'Standard Toner (Cartridge)',
    fallbackCost: DEFAULT_TONER_UNIT_COST
  });

  const inventoryConversionRate = (inventory || []).reduce((current, item) => {
    if (current !== null) return current;
    return pickPositiveNumber(item?.conversion_rate, item?.conversionRate);
  }, null);

  return {
    paperItem,
    tonerItem,
    // Align with service calculator: consume live material rates from selected inventory items.
    paperUnitCost: pickPositiveNumber(
      paperItem?.cost_per_unit,
      paperItem?.cost_price,
      paperItem?.cost,
      DEFAULT_PAPER_UNIT_COST
    ) ?? DEFAULT_PAPER_UNIT_COST,
    tonerUnitCost: pickPositiveNumber(
      tonerItem?.cost_per_unit,
      tonerItem?.cost_price,
      tonerItem?.cost,
      DEFAULT_TONER_UNIT_COST
    ) ?? DEFAULT_TONER_UNIT_COST,
    paperConversionRate: pickPositiveNumber(
      paperItem?.conversion_rate,
      paperItem?.conversionRate,
      inventoryConversionRate,
      DEFAULT_PAPER_CONVERSION_RATE
    ) ?? DEFAULT_PAPER_CONVERSION_RATE,
    tonerPagesPerUnit: DEFAULT_TONER_PAGES_PER_UNIT
  };
};

const resolveMaterialOverridesFromOptions = async (options = {}, defaults = {}) => {
  const paperOptionId = String(
    options?.paperId ?? options?.paper_item_id ?? ''
  ).trim();
  const tonerOptionId = String(
    options?.tonerId ?? options?.toner_item_id ?? ''
  ).trim();

  const [paperOptionItem, tonerOptionItem] = await Promise.all([
    paperOptionId ? runGet('SELECT * FROM inventory WHERE id = ?', [paperOptionId]) : Promise.resolve(null),
    tonerOptionId ? runGet('SELECT * FROM inventory WHERE id = ?', [tonerOptionId]) : Promise.resolve(null)
  ]);

  const paperItem = paperOptionItem || defaults.paperItem || null;
  const tonerItem = tonerOptionItem || defaults.tonerItem || null;

  const explicitPaperUnitCost = toNumericValue(options?.paperUnitCost ?? options?.paper_unit_cost);
  const explicitTonerUnitCost = toNumericValue(options?.tonerUnitCost ?? options?.toner_unit_cost);
  const explicitTonerPagesPerUnit = toNumericValue(
    options?.tonerPagesPerUnit ?? options?.toner_pages_per_unit
  );
  const explicitPaperConversionRate = toNumericValue(
    options?.paperConversionRate ?? options?.paper_conversion_rate ?? options?.conversion_rate
  );

  const paperUnitCost = pickPositiveNumber(
    explicitPaperUnitCost,
    paperItem ? pickPositiveNumber(paperItem?.cost_per_unit, paperItem?.cost_price, paperItem?.cost) : null,
    defaults.paperUnitCost
  ) ?? DEFAULT_PAPER_UNIT_COST;

  const tonerUnitCost = pickPositiveNumber(
    explicitTonerUnitCost,
    tonerItem ? pickPositiveNumber(tonerItem?.cost_per_unit, tonerItem?.cost_price, tonerItem?.cost) : null,
    defaults.tonerUnitCost
  ) ?? DEFAULT_TONER_UNIT_COST;

  const paperConversionRate = pickPositiveNumber(
    explicitPaperConversionRate,
    paperItem ? pickPositiveNumber(paperItem?.conversion_rate, paperItem?.conversionRate) : null,
    defaults.paperConversionRate,
    DEFAULT_PAPER_CONVERSION_RATE
  ) ?? DEFAULT_PAPER_CONVERSION_RATE;

  const tonerPagesPerUnit = pickPositiveNumber(
    explicitTonerPagesPerUnit,
    defaults.tonerPagesPerUnit,
    DEFAULT_TONER_PAGES_PER_UNIT
  ) ?? DEFAULT_TONER_PAGES_PER_UNIT;

  return {
    paperItem,
    tonerItem,
    paperUnitCost,
    tonerUnitCost,
    paperConversionRate,
    tonerPagesPerUnit
  };
};

const buildClassAdjustmentBreakdown = (baseBomCost, totalPages, activeAdjustments = []) => {
  const safeBaseCost = pricingEngine.roundCurrency(toNumericValue(baseBomCost) ?? 0);
  const safeTotalPages = Math.max(0, toNumericValue(totalPages) ?? 0);
  const sortedAdjustments = sortAdjustmentsForPricing(activeAdjustments);

  const rows = sortedAdjustments.map((adjustment, index) => {
    const adjustmentType = normalizeAdjustmentTypeForSync(adjustment?.type);
    const rawValue = adjustmentType === 'FIXED'
      ? (toNumericValue(adjustment?.value) ?? 0)
      : (toNumericValue(adjustment?.percentage ?? adjustment?.value) ?? 0);
    const amount = adjustmentType === 'FIXED'
      ? pricingEngine.roundCurrency(rawValue * safeTotalPages)
      : pricingEngine.roundCurrency(safeBaseCost * (rawValue / 100));

    return {
      adjustmentId: String(adjustment?.id || `adjustment-${index + 1}`),
      adjustmentName: String(adjustment?.display_name || adjustment?.name || `Adjustment ${index + 1}`),
      adjustmentType,
      adjustmentValue: rawValue,
      baseAmount: safeBaseCost,
      originalAmount: amount,
      redistributedAmount: amount,
      allocationRatio: 0,
      sequenceNo: index + 1
    };
  });

  const totalAdjustmentCost = pricingEngine.roundCurrency(
    rows.reduce((sum, row) => sum + (toNumericValue(row.originalAmount) ?? 0), 0)
  );

  return {
    rows: rows.map((row) => ({
      ...row,
      allocationRatio: totalAdjustmentCost > 0
        ? (toNumericValue(row.originalAmount) ?? 0) / totalAdjustmentCost
        : 0
    })),
    totalAdjustmentCost
  };
};

const normalizePositiveRoundingStep = (value, fallback = 50) => {
  const num = toNumericValue(value);
  if (num === null || num <= 0) return fallback;
  return Math.max(1, Math.round(num));
};

const normalizeBatchRoundingMethod = (method, fallback = 'ALWAYS_UP_50') => {
  const normalized = String(method || '').trim().toUpperCase();
  if (!normalized) return fallback;
  if (normalized === 'NEAREST_10') return 'ALWAYS_UP_10';
  if (normalized === 'NEAREST_50') return 'ALWAYS_UP_50';
  if (normalized === 'NEAREST_100') return 'ALWAYS_UP_100';
  if (normalized === 'ALWAYS_UP_10') return 'ALWAYS_UP_10';
  if (normalized === 'ALWAYS_UP_50') return 'ALWAYS_UP_50';
  if (normalized === 'ALWAYS_UP_100') return 'ALWAYS_UP_100';
  if (normalized === 'ALWAYS_UP_500') return 'ALWAYS_UP_500';
  if (normalized === 'ALWAYS_UP_CUSTOM') return 'ALWAYS_UP_CUSTOM';
  if (normalized === 'PSYCHOLOGICAL') return 'PSYCHOLOGICAL';
  if (normalized === 'NEAREST_500') return 'NEAREST_500';
  if (normalized === 'CUSTOM') return 'ALWAYS_UP_CUSTOM';
  return fallback;
};

const resolveBatchRoundingConfig = (batch, options = {}) => {
  const requestedMethod = options?.rounding_method ?? options?.roundingMethod ?? batch?.rounding_method;
  const requestedValue = options?.rounding_value ?? options?.roundingValue ?? batch?.rounding_value;
  const method = normalizeBatchRoundingMethod(requestedMethod, 'ALWAYS_UP_50');

  let step = normalizePositiveRoundingStep(requestedValue, 50);
  if (method.endsWith('_10')) step = 10;
  else if (method.endsWith('_50')) step = 50;
  else if (method.endsWith('_100')) step = 100;
  else if (method.endsWith('_500')) step = 500;

  return {
    method,
    step,
    persistedMethod: method,
    persistedValue: step,
    displayLabel: method
  };
};

const applyPsychologicalRounding = (price) => {
  if (price <= 0) {
    return Math.ceil(price / 10) * 10;
  }

  let magnitude = 10;
  if (price >= 100) magnitude = 100;
  if (price >= 1000) magnitude = 1000;

  let candidate = Math.floor(price / magnitude) * magnitude + (magnitude - 1);
  if (candidate < price) candidate += magnitude;
  return candidate;
};

const applyBatchRounding = (value, roundingConfig) => {
  const safeValue = pricingEngine.roundCurrency(toNumericValue(value) ?? 0);
  const method = normalizeBatchRoundingMethod(roundingConfig?.method, 'ALWAYS_UP_50');
  const step = normalizePositiveRoundingStep(roundingConfig?.step, 50);

  switch (method) {
    case 'NEAREST_10':
    case 'NEAREST_50':
    case 'NEAREST_100':
    case 'NEAREST_500':
      return pricingEngine.roundCurrency(Math.round(safeValue / step) * step);
    case 'PSYCHOLOGICAL':
      return pricingEngine.roundCurrency(applyPsychologicalRounding(safeValue));
    case 'ALWAYS_UP_10':
    case 'ALWAYS_UP_50':
    case 'ALWAYS_UP_100':
    case 'ALWAYS_UP_500':
    case 'ALWAYS_UP_CUSTOM':
    default:
      return pricingEngine.roundCurrency(pricingEngine.roundUpToNearest(safeValue, step));
  }
};

const distributeAmountAcrossWeights = (totalAmount, weights = []) => {
  const safeTotal = pricingEngine.roundCurrency(toNumericValue(totalAmount) ?? 0);
  if (weights.length === 0) return [];

  const normalizedWeights = weights.map((weight) => Math.max(0, toNumericValue(weight) ?? 0));
  const weightTotal = normalizedWeights.reduce((sum, weight) => sum + weight, 0);
  const effectiveWeights = weightTotal > 0
    ? normalizedWeights
    : normalizedWeights.map(() => 1);
  const effectiveTotal = effectiveWeights.reduce((sum, weight) => sum + weight, 0);

  let runningAllocated = 0;
  return effectiveWeights.map((weight, index) => {
    if (index === effectiveWeights.length - 1) {
      return pricingEngine.roundCurrency(safeTotal - runningAllocated);
    }
    const ratio = effectiveTotal > 0 ? weight / effectiveTotal : 0;
    const amount = pricingEngine.roundCurrency(safeTotal * ratio);
    runningAllocated += amount;
    return amount;
  });
};

const allocateSubjectFinancials = ({
  subjects = [],
  learners,
  paperUnitCost,
  tonerUnitCost,
  paperConversionRate,
  tonerPagesPerUnit,
  classAdjustmentRows = []
}) => {
  const safeLearners = Math.max(1, Math.floor(Number(learners) || 0));
  const subjectRows = (subjects || []).map((subject) => {
    const consumption = pricingEngine.calculateSubjectConsumption(subject, safeLearners);
    const paperQuantity = consumption.totalSheets / Math.max(1, toNumericValue(paperConversionRate) ?? DEFAULT_PAPER_CONVERSION_RATE);
    const tonerQuantity = consumption.totalPages / Math.max(1, toNumericValue(tonerPagesPerUnit) ?? DEFAULT_TONER_PAGES_PER_UNIT);
    const paperCost = pricingEngine.roundCurrency(paperQuantity * (toNumericValue(paperUnitCost) ?? 0));
    const tonerCost = pricingEngine.roundCurrency(tonerQuantity * (toNumericValue(tonerUnitCost) ?? 0));
    const materialCost = pricingEngine.roundCurrency(paperCost + tonerCost);

    return {
      subjectId: String(subject?.id || ''),
      subjectName: String(subject?.subject_name || subject?.name || ''),
      totalPages: consumption.totalPages,
      totalSheets: consumption.totalSheets,
      materialCost,
      paperCost,
      tonerCost,
      marketAdjustmentCost: 0,
      roundingCost: 0,
      adjustmentCost: 0,
      preRoundingTotal: materialCost,
      totalCost: materialCost,
      adjustmentBreakdown: []
    };
  });

  if (subjectRows.length === 0) return [];

  const subjectMaterialTotal = pricingEngine.roundCurrency(
    subjectRows.reduce((sum, row) => sum + row.materialCost, 0)
  );
  const subjectPageTotal = subjectRows.reduce((sum, row) => sum + row.totalPages, 0);

  for (const adjustmentRow of classAdjustmentRows || []) {
    const amount = pricingEngine.roundCurrency(
      toNumericValue(adjustmentRow?.redistributedAmount ?? adjustmentRow?.originalAmount) ?? 0
    );
    if (amount <= 0) continue;

    const adjustmentId = String(adjustmentRow?.adjustmentId || adjustmentRow?.adjustment_id || '');
    const adjustmentName = String(adjustmentRow?.adjustmentName || adjustmentRow?.adjustment_name || adjustmentId || 'Adjustment');
    const adjustmentType = normalizeAdjustmentTypeForSync(adjustmentRow?.adjustmentType || adjustmentRow?.adjustment_type);
    const isRounding = adjustmentId.trim().toLowerCase() === 'auto-rounding';
    const weights = subjectRows.map((row) => {
      if (isRounding) {
        return Math.max(0, row.preRoundingTotal);
      }
      if (adjustmentType === 'FIXED') {
        return Math.max(0, row.totalPages);
      }
      return Math.max(0, row.materialCost);
    });

    const distributed = distributeAmountAcrossWeights(amount, weights);
    distributed.forEach((allocatedAmount, index) => {
      const subjectRow = subjectRows[index];
      const normalizedAmount = pricingEngine.roundCurrency(allocatedAmount);
      subjectRow.adjustmentCost = pricingEngine.roundCurrency(subjectRow.adjustmentCost + normalizedAmount);
      subjectRow.totalCost = pricingEngine.roundCurrency(subjectRow.totalCost + normalizedAmount);
      subjectRow.adjustmentBreakdown.push({
        adjustmentId,
        adjustmentName,
        adjustmentType,
        amount: normalizedAmount,
        isRounding
      });
      if (isRounding) {
        subjectRow.roundingCost = pricingEngine.roundCurrency(subjectRow.roundingCost + normalizedAmount);
      } else {
        subjectRow.marketAdjustmentCost = pricingEngine.roundCurrency(subjectRow.marketAdjustmentCost + normalizedAmount);
        subjectRow.preRoundingTotal = pricingEngine.roundCurrency(subjectRow.preRoundingTotal + normalizedAmount);
      }
    });
  }

  return subjectRows.map((row) => ({
    ...row,
    materialAllocationRatio: subjectMaterialTotal > 0 ? row.materialCost / subjectMaterialTotal : 0,
    pageAllocationRatio: subjectPageTotal > 0 ? row.totalPages / subjectPageTotal : 0
  }));
};

const persistClassAdjustmentRows = async ({
  batchId,
  classId,
  rows = [],
  source = 'SYSTEM',
}) => {
  const adjParams = [classId];
  await runRun(`DELETE FROM examination_class_adjustments WHERE class_id = ?`, adjParams);

  const normalizedSource = source === 'MANUAL_OVERRIDE' ? 'MANUAL_OVERRIDE' : 'SYSTEM';
  let sequenceCounter = 0;

  for (const row of rows) {
    sequenceCounter += 1;
    const sequenceNo = Number.isFinite(Number(row?.sequenceNo))
      ? Number(row.sequenceNo)
      : sequenceCounter;

    await runRun(
      `INSERT INTO examination_class_adjustments (
        id,
        batch_id,
        class_id,
        adjustment_id,
        adjustment_name,
        adjustment_type,
        adjustment_value,
        base_amount,
        original_amount,
        redistributed_amount,
        allocation_ratio,
        sequence_no,
        source,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
      [
        randomUUID(),
        batchId,
        classId,
        String(row?.adjustmentId || `adjustment-${sequenceNo}`),
        String(row?.adjustmentName || `Adjustment ${sequenceNo}`),
        normalizeAdjustmentTypeForSync(row?.adjustmentType),
        toNumericValue(row?.adjustmentValue) ?? 0,
        toNumericValue(row?.baseAmount) ?? 0,
        toNumericValue(row?.originalAmount) ?? 0,
        toNumericValue(row?.redistributedAmount) ?? 0,
        toNumericValue(row?.allocationRatio) ?? 0,
        sequenceNo,
        normalizedSource
      ]
    );
  }
};

const normalizeAdjustmentSnapshotRow = (adjustment, index = 0) => {
  const rawId = String(adjustment?.id || '').trim();
  const adjustmentType = normalizeAdjustmentTypeForSync(adjustment?.type);
  const rawValue = adjustmentType === 'FIXED'
    ? (toNumericValue(adjustment?.value) ?? 0)
    : (toNumericValue(adjustment?.percentage ?? adjustment?.value) ?? 0);
  const sortOrder = toNumericValue(adjustment?.sort_order ?? adjustment?.sortOrder) ?? index;

  return {
    id: rawId || `adjustment-${index + 1}`,
    name: String(adjustment?.name || adjustment?.display_name || `Adjustment ${index + 1}`),
    display_name: String(adjustment?.display_name || adjustment?.name || `Adjustment ${index + 1}`),
    type: adjustmentType,
    value: rawValue,
    percentage: adjustmentType === 'FIXED' ? 0 : rawValue,
    sort_order: sortOrder
  };
};

const serializeAdjustmentSnapshot = (adjustments = []) => {
  const normalized = sortAdjustmentsForPricing(adjustments)
    .map((adjustment, index) => normalizeAdjustmentSnapshotRow(adjustment, index));

  try {
    return JSON.stringify(normalized);
  } catch {
    return '[]';
  }
};

const parseAdjustmentSnapshot = (serialized) => {
  if (typeof serialized !== 'string' || !serialized.trim()) return null;

  try {
    const parsed = JSON.parse(serialized);
    if (!Array.isArray(parsed)) return null;
    return parsed.map((entry, index) => normalizeAdjustmentSnapshotRow(entry, index));
  } catch {
    return null;
  }
};

const stringifyDetails = (value) => {
  try {
    return JSON.stringify(value ?? {});
  } catch {
    return JSON.stringify({ warning: 'Failed to stringify details payload.' });
  }
};

let ensurePricingSchemaPromise = null;
let ensureSyncSchemaPromise = null;
let ensureInvoiceSchemaPromise = null;
let ensureCoreSchemaPromise = null;
let ensureNotificationSchemaPromise = null;

const ensureCoreExaminationSchema = async () => {
  if (ensureCoreSchemaPromise) return ensureCoreSchemaPromise;

  ensureCoreSchemaPromise = (async () => {
    const ensureColumnIfMissingCore = async (tableName, columnName, definition) => {
      const exists = await tableExists(tableName);
      if (!exists) return;
      const columns = await runQuery(`PRAGMA table_info(${tableName})`);
      const hasColumn = columns.some((column) => column.name === columnName);
      if (!hasColumn) {
        await runRun(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
      }
    };

    await runRun(`CREATE TABLE IF NOT EXISTS examination_batches (
      id TEXT PRIMARY KEY,
      school_id TEXT NOT NULL,
      name TEXT NOT NULL,
      academic_year TEXT,
      term TEXT,
      exam_type TEXT,
      type TEXT DEFAULT 'Original',
      parent_batch_id TEXT,
      sub_account_name TEXT,
      status TEXT DEFAULT 'Draft',
      total_amount REAL DEFAULT 0,
      calculated_material_total REAL DEFAULT 0,
      calculated_adjustment_total REAL DEFAULT 0,
      adjustment_snapshots_json TEXT,
      rounding_adjustment_total REAL DEFAULT 0,
      pre_rounding_total_amount REAL DEFAULT 0,
      rounding_method TEXT DEFAULT 'nearest_50',
      rounding_value REAL DEFAULT 50,
      expected_candidature INTEGER DEFAULT 0,
      calculated_cost_per_learner REAL DEFAULT 0,
      calculation_trigger TEXT,
      calculation_duration_ms INTEGER DEFAULT 0,
      last_calculated_at DATETIME,
      currency TEXT DEFAULT 'MWK',
      invoice_id TEXT,
      pricing_lock_enabled INTEGER DEFAULT 0,
      pricing_lock_reason TEXT,
      pricing_lock_by TEXT,
      pricing_locked_at DATETIME,
      locked_paper_unit_cost REAL,
      locked_toner_unit_cost REAL,
      locked_conversion_rate REAL,
      locked_adjustments_json TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);


    await runRun(`CREATE TABLE IF NOT EXISTS examination_classes (
      id TEXT PRIMARY KEY,
      batch_id TEXT NOT NULL,
      class_name TEXT NOT NULL,
      number_of_learners INTEGER NOT NULL,
      suggested_cost_per_learner REAL DEFAULT 0,
      manual_cost_per_learner REAL,
      is_manual_override INTEGER DEFAULT 0,
      manual_override_reason TEXT,
      manual_override_by TEXT,
      manual_override_at DATETIME,
      calculated_total_cost REAL DEFAULT 0,
      material_total_cost REAL DEFAULT 0,
      adjustment_total_cost REAL DEFAULT 0,
      adjustment_delta_percent REAL DEFAULT 0,
      cost_last_calculated_at DATETIME,
      price_per_learner REAL DEFAULT 0,
      total_price REAL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (batch_id) REFERENCES examination_batches(id) ON DELETE CASCADE
    )`);

    await runRun(`CREATE TABLE IF NOT EXISTS examination_subjects (
      id TEXT PRIMARY KEY,
      class_id TEXT NOT NULL,
      subject_name TEXT NOT NULL,
      pages INTEGER NOT NULL,
      extra_copies INTEGER DEFAULT 0,
      paper_size TEXT DEFAULT 'A4',
      orientation TEXT DEFAULT 'Portrait',
      total_sheets INTEGER DEFAULT 0,
      total_pages INTEGER DEFAULT 0,
      total_amount REAL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (class_id) REFERENCES examination_classes(id) ON DELETE CASCADE
    )`);

    await runRun(`CREATE TABLE IF NOT EXISTS examination_bom_calculations (
      id TEXT PRIMARY KEY,
      batch_id TEXT NOT NULL,
      class_id TEXT,
      item_id TEXT NOT NULL,
      item_name TEXT,
      component_type TEXT DEFAULT 'MATERIAL',
      adjustment_id TEXT,
      adjustment_name TEXT,
      adjustment_type TEXT,
      adjustment_value REAL DEFAULT 0,
      allocation_ratio REAL DEFAULT 0,
      quantity_required REAL NOT NULL,
      unit_cost REAL NOT NULL,
      total_cost REAL NOT NULL,
      cost_source TEXT,
      source_unit_cost REAL,
      source_timestamp DATETIME,
      source_item_id TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (batch_id) REFERENCES examination_batches(id) ON DELETE CASCADE
    )`);

    await runRun(`CREATE TABLE IF NOT EXISTS examination_class_adjustments (
      id TEXT PRIMARY KEY,
      batch_id TEXT NOT NULL,
      class_id TEXT NOT NULL,
      adjustment_id TEXT NOT NULL,
      adjustment_name TEXT NOT NULL,
      adjustment_type TEXT NOT NULL CHECK(adjustment_type IN ('PERCENTAGE', 'FIXED', 'PERCENT')),
      adjustment_value REAL DEFAULT 0,
      base_amount REAL DEFAULT 0,
      original_amount REAL DEFAULT 0,
      redistributed_amount REAL DEFAULT 0,
      allocation_ratio REAL DEFAULT 0,
      sequence_no INTEGER DEFAULT 0,
      source TEXT DEFAULT 'SYSTEM' CHECK(source IN ('SYSTEM', 'MANUAL_OVERRIDE')),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (batch_id) REFERENCES examination_batches(id) ON DELETE CASCADE,
      FOREIGN KEY (class_id) REFERENCES examination_classes(id) ON DELETE CASCADE
    )`);

    await ensureColumnIfMissingCore('examination_classes', 'market_adjustment_total', 'REAL DEFAULT 0');
    await ensureColumnIfMissingCore('examination_classes', 'rounding_adjustment', 'REAL DEFAULT 0');
    await ensureColumnIfMissingCore('examination_classes', 'manual_override_amount', 'REAL DEFAULT 0');
    await ensureColumnIfMissingCore('examination_classes', 'calculated_total_pages', 'INTEGER DEFAULT 0');
    await ensureColumnIfMissingCore('examination_subjects', 'pages', 'INTEGER DEFAULT 0');
    await ensureColumnIfMissingCore('examination_subjects', 'extra_copies', 'INTEGER DEFAULT 0');
    await ensureColumnIfMissingCore('examination_subjects', 'total_pages', 'INTEGER DEFAULT 0');
    await ensureColumnIfMissingCore('examination_batches', 'adjustment_snapshots_json', 'TEXT');
    await ensureColumnIfMissingCore('examination_batches', 'rounding_adjustment_total', 'REAL DEFAULT 0');
    await ensureColumnIfMissingCore('examination_batches', 'pre_rounding_total_amount', 'REAL DEFAULT 0');
    await ensureColumnIfMissingCore('examination_batches', 'rounding_method', "TEXT DEFAULT 'nearest_50'");
    await ensureColumnIfMissingCore('examination_batches', 'rounding_value', 'REAL DEFAULT 50');

    await runRun(`CREATE TABLE IF NOT EXISTS examination_pricing_audit (
      id TEXT PRIMARY KEY,
      batch_id TEXT NOT NULL,
      class_id TEXT,
      user_id TEXT,
      event_type TEXT NOT NULL CHECK(event_type IN ('SYSTEM_CALCULATION', 'MANUAL_OVERRIDE', 'MANUAL_OVERRIDE_RESET', 'AUTO_RECALC', 'VALIDATION_WARNING', 'PERMISSION_DENIED')),
      trigger_source TEXT,
      previous_cost_per_learner REAL,
      suggested_cost_per_learner REAL,
      new_cost_per_learner REAL,
      candidature INTEGER DEFAULT 0,
      previous_total_amount REAL,
      new_total_amount REAL,
      percentage_difference REAL DEFAULT 0,
      details_json TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (batch_id) REFERENCES examination_batches(id) ON DELETE CASCADE,
      FOREIGN KEY (class_id) REFERENCES examination_classes(id) ON DELETE CASCADE
    )`);

    await runRun(`CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT,
      action TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      details TEXT,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    await runRun('CREATE INDEX IF NOT EXISTS idx_exam_batches_school ON examination_batches(school_id)');
    await runRun('CREATE INDEX IF NOT EXISTS idx_exam_batches_created_at ON examination_batches(created_at)');
    await runRun('CREATE INDEX IF NOT EXISTS idx_exam_classes_batch ON examination_classes(batch_id)');
    await runRun('CREATE INDEX IF NOT EXISTS idx_exam_subjects_class ON examination_subjects(class_id)');
    await runRun('CREATE INDEX IF NOT EXISTS idx_exam_bom_calc_batch_class ON examination_bom_calculations(batch_id, class_id)');
  })().then(null, (error) => {
    ensureCoreSchemaPromise = null;
    console.error('[CoreSchema] Error ensuring core examination schema:', error);
  });

  return ensureCoreSchemaPromise;
};

const ensureNotificationSchema = async () => {
  if (ensureNotificationSchemaPromise) return ensureNotificationSchemaPromise;

  ensureNotificationSchemaPromise = (async () => {
    await runRun(`CREATE TABLE IF NOT EXISTS examination_batch_notifications (
      id TEXT PRIMARY KEY,
      batch_id TEXT,
      user_id TEXT NOT NULL,
      notification_type TEXT NOT NULL,
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      priority TEXT DEFAULT 'Medium',
      batch_details_json TEXT,
      is_read INTEGER DEFAULT 0,
      read_at DATETIME,
      delivered_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      expires_at DATETIME,
    )`);

    await runRun(`CREATE TABLE IF NOT EXISTS notification_audit_logs (
      id TEXT PRIMARY KEY,
      notification_id TEXT,
      user_id TEXT NOT NULL,
      action TEXT NOT NULL,
      details_json TEXT,
      ip_address TEXT,
      user_agent TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    )`);

    await runRun('CREATE INDEX IF NOT EXISTS idx_exam_notifications_user ON examination_batch_notifications(user_id)');
    await runRun('CREATE INDEX IF NOT EXISTS idx_exam_notifications_created ON examination_batch_notifications(created_at)');
    await runRun('CREATE INDEX IF NOT EXISTS idx_exam_notifications_read ON examination_batch_notifications(is_read)');
    await runRun('CREATE INDEX IF NOT EXISTS idx_exam_notifications_user_created ON examination_batch_notifications(user_id, created_at DESC)');
    await runRun('');
    await runRun('CREATE INDEX IF NOT EXISTS idx_notification_audit_logs_notification ON notification_audit_logs(notification_id)');
    await runRun('CREATE INDEX IF NOT EXISTS idx_notification_audit_logs_user ON notification_audit_logs(user_id)');
    await runRun('CREATE INDEX IF NOT EXISTS idx_notification_audit_logs_created ON notification_audit_logs(created_at)');
    await runRun('');

      })().then(null, (error) => {
    ensureNotificationSchemaPromise = null;
    console.error('[NotificationSchema] Error ensuring notification schema:', error);
  });

  return ensureNotificationSchemaPromise;
};

const normalizeNotificationRow = (row) => {
  if (!row) return null;
  let batchDetails = null;
  if (row.batch_details_json) {
    try {
      batchDetails = JSON.parse(row.batch_details_json);
    } catch {
      batchDetails = null;
    }
  }
  return {
    ...row,
    batch_details: batchDetails || row.batch_details || {},
    is_read: Boolean(row.is_read),
    read_at: row.read_at ?? null,
    delivered_at: row.delivered_at ?? row.created_at ?? null,
    created_at: row.created_at ?? null
  };
};

const ensureColumnIfMissing = async (tableName, columnName, definition) => {
  const exists = await tableExists(tableName);
  if (!exists) return;
  
  const columnSet = await getTableColumnSet(tableName);
  const normalizedCol = String(columnName || '').trim().toLowerCase();
  
  if (!columnSet.has(normalizedCol)) {
    console.log(`[Schema] Adding missing column ${normalizedCol} to ${tableName}`);
    await runRun(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
    clearTableCache(tableName);
  }
};

const ensureExaminationSyncSchema = async () => {
  if (ensureSyncSchemaPromise) return ensureSyncSchemaPromise;

  ensureSyncSchemaPromise = (async () => {
    await runRun(`CREATE TABLE IF NOT EXISTS examination_sync_state (
      entity_type TEXT NOT NULL,
      last_synced_at DATETIME,
      last_checksum TEXT,
      item_count INTEGER DEFAULT 0,
      last_payload_json TEXT,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (entity_type)
    )`);

    await ensureColumnIfMissing('market_adjustments', 'percentage', 'REAL');
    await ensureColumnIfMissing('market_adjustments', 'applies_to', "TEXT NOT NULL DEFAULT 'COST'");
    await ensureColumnIfMissing('market_adjustments', 'is_active', 'INTEGER DEFAULT 1');
    await ensureColumnIfMissing('market_adjustments', 'description', 'TEXT');
    await ensureColumnIfMissing('market_adjustments', 'category', 'TEXT');
    await ensureColumnIfMissing('market_adjustments', 'display_name', 'TEXT');
    await ensureColumnIfMissing('market_adjustments', 'adjustment_category', 'TEXT');
    await ensureColumnIfMissing('market_adjustments', 'sort_order', 'INTEGER DEFAULT 0');
    await ensureColumnIfMissing('market_adjustments', 'is_system_default', 'INTEGER DEFAULT 0');
    await ensureColumnIfMissing('market_adjustments', 'apply_to_categories', "TEXT DEFAULT '[]'");
    await ensureColumnIfMissing('market_adjustments', 'created_at', 'DATETIME');
    await ensureColumnIfMissing('market_adjustments', 'last_applied_at', 'DATETIME');
    await ensureColumnIfMissing('market_adjustments', 'total_applied_amount', 'REAL DEFAULT 0');
    await ensureColumnIfMissing('market_adjustments', 'application_count', 'INTEGER DEFAULT 0');
    await ensureColumnIfMissing('market_adjustments', 'last_synced_at', 'DATETIME');
    await ensureColumnIfMissing('market_adjustments', 'sync_checksum', 'TEXT');

    await ensureColumnIfMissing('inventory', 'unit', "TEXT DEFAULT 'units'");
    await ensureColumnIfMissing('inventory', 'category_id', 'TEXT');
    await ensureColumnIfMissing('inventory', 'conversion_rate', `REAL DEFAULT ${DEFAULT_PAPER_CONVERSION_RATE}`);
    await ensureColumnIfMissing('inventory', 'last_updated', 'DATETIME');
    await ensureColumnIfMissing('inventory', 'last_synced_at', 'DATETIME');
    await ensureColumnIfMissing('inventory', 'sync_checksum', 'TEXT');
  })().then(null, (error) => {
    ensureSyncSchemaPromise = null;
    console.error('[SyncSchema] Error ensuring sync schema:', error);
  });

  return ensureSyncSchemaPromise;
};

const ensureExaminationPricingSchema = async () => {
  if (ensurePricingSchemaPromise) return ensurePricingSchemaPromise;

  ensurePricingSchemaPromise = (async () => {
    await ensureCoreExaminationSchema();

    await runRun(`CREATE TABLE IF NOT EXISTS bom_default_materials (
      material_type TEXT PRIMARY KEY,
      preferred_item_id TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (preferred_item_id) REFERENCES inventory(id)
    )`);
    await runRun('CREATE INDEX IF NOT EXISTS idx_bom_default_materials_preferred ON bom_default_materials(preferred_item_id)');

    await runRun(`CREATE TABLE IF NOT EXISTS examination_class_adjustments (
      id TEXT PRIMARY KEY,
      batch_id TEXT NOT NULL,
      class_id TEXT NOT NULL,
      adjustment_id TEXT NOT NULL,
      adjustment_name TEXT NOT NULL,
      adjustment_type TEXT NOT NULL CHECK(adjustment_type IN ('PERCENTAGE', 'FIXED', 'PERCENT')),
      adjustment_value REAL DEFAULT 0,
      base_amount REAL DEFAULT 0,
      original_amount REAL DEFAULT 0,
      redistributed_amount REAL DEFAULT 0,
      allocation_ratio REAL DEFAULT 0,
      sequence_no INTEGER DEFAULT 0,
      source TEXT DEFAULT 'SYSTEM' CHECK(source IN ('SYSTEM', 'MANUAL_OVERRIDE')),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    await runRun(`CREATE TABLE IF NOT EXISTS examination_pricing_audit (
      id TEXT PRIMARY KEY,
      batch_id TEXT NOT NULL,
      class_id TEXT,
      user_id TEXT,
      event_type TEXT NOT NULL CHECK(event_type IN ('SYSTEM_CALCULATION', 'MANUAL_OVERRIDE', 'MANUAL_OVERRIDE_RESET', 'AUTO_RECALC', 'VALIDATION_WARNING', 'PERMISSION_DENIED')),
      trigger_source TEXT,
      previous_cost_per_learner REAL,
      suggested_cost_per_learner REAL,
      new_cost_per_learner REAL,
      candidature INTEGER DEFAULT 0,
      previous_total_amount REAL,
      new_total_amount REAL,
      percentage_difference REAL DEFAULT 0,
      details_json TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    await ensureColumnIfMissing('examination_batches', 'calculated_material_total', 'REAL DEFAULT 0');
    await ensureColumnIfMissing('examination_batches', 'calculated_adjustment_total', 'REAL DEFAULT 0');
    await ensureColumnIfMissing('examination_batches', 'adjustment_snapshots_json', 'TEXT');
    await ensureColumnIfMissing('examination_batches', 'market_adjustment_total', 'REAL DEFAULT 0');
    await ensureColumnIfMissing('examination_batches', 'rounding_adjustment_total', 'REAL DEFAULT 0');
    await ensureColumnIfMissing('examination_batches', 'pre_rounding_total_amount', 'REAL DEFAULT 0');
    await ensureColumnIfMissing('examination_batches', 'rounding_method', "TEXT DEFAULT 'nearest_50'");
    await ensureColumnIfMissing('examination_batches', 'rounding_value', 'REAL DEFAULT 50');
    await ensureColumnIfMissing('examination_batches', 'expected_candidature', 'INTEGER DEFAULT 0');
    await ensureColumnIfMissing('examination_batches', 'calculated_cost_per_learner', 'REAL DEFAULT 0');
    await ensureColumnIfMissing('examination_batches', 'calculation_trigger', 'TEXT');
    await ensureColumnIfMissing('examination_batches', 'calculation_duration_ms', 'INTEGER DEFAULT 0');
    await ensureColumnIfMissing('examination_batches', 'last_calculated_at', 'DATETIME');
    await ensureColumnIfMissing('examination_batches', 'pricing_lock_enabled', 'INTEGER DEFAULT 0');
    await ensureColumnIfMissing('examination_batches', 'pricing_lock_reason', 'TEXT');
    await ensureColumnIfMissing('examination_batches', 'pricing_lock_by', 'TEXT');
    await ensureColumnIfMissing('examination_batches', 'pricing_locked_at', 'DATETIME');
    await ensureColumnIfMissing('examination_batches', 'locked_paper_unit_cost', 'REAL');
    await ensureColumnIfMissing('examination_batches', 'locked_toner_unit_cost', 'REAL');
    await ensureColumnIfMissing('examination_batches', 'locked_conversion_rate', 'REAL');
    await ensureColumnIfMissing('examination_batches', 'locked_adjustments_json', 'TEXT');
    await ensureColumnIfMissing('examination_batches', 'type', "TEXT DEFAULT 'Original'");
    await ensureColumnIfMissing('examination_batches', 'parent_batch_id', 'TEXT');
    await ensureColumnIfMissing('examination_batches', 'sub_account_name', 'TEXT');
    await ensureColumnIfMissing('examination_batches', 'currency', "TEXT DEFAULT 'MWK'");
    await ensureColumnIfMissing('inventory', 'conversion_rate', `REAL DEFAULT ${DEFAULT_PAPER_CONVERSION_RATE}`);

    await ensureColumnIfMissing('examination_classes', 'suggested_cost_per_learner', 'REAL DEFAULT 0');
    await ensureColumnIfMissing('examination_classes', 'manual_cost_per_learner', 'REAL');
    await ensureColumnIfMissing('examination_classes', 'is_manual_override', 'INTEGER DEFAULT 0');
    await ensureColumnIfMissing('examination_classes', 'manual_override_reason', 'TEXT');
    await ensureColumnIfMissing('examination_classes', 'manual_override_by', 'TEXT');
    await ensureColumnIfMissing('examination_classes', 'manual_override_at', 'DATETIME');
    await ensureColumnIfMissing('examination_classes', 'calculated_total_cost', 'REAL DEFAULT 0');
    await ensureColumnIfMissing('examination_classes', 'material_total_cost', 'REAL DEFAULT 0');
    await ensureColumnIfMissing('examination_classes', 'adjustment_total_cost', 'REAL DEFAULT 0');
    await ensureColumnIfMissing('examination_classes', 'adjustment_delta_percent', 'REAL DEFAULT 0');
    await ensureColumnIfMissing('examination_classes', 'cost_last_calculated_at', 'DATETIME');
    await ensureColumnIfMissing('examination_classes', 'market_adjustment_total', 'REAL DEFAULT 0');
    await ensureColumnIfMissing('examination_classes', 'rounding_adjustment', 'REAL DEFAULT 0');
    await ensureColumnIfMissing('examination_classes', 'manual_override_amount', 'REAL DEFAULT 0');

    await ensureColumnIfMissing('examination_subjects', 'total_pages', 'INTEGER DEFAULT 0');

    await ensureColumnIfMissing('examination_bom_calculations', 'component_type', "TEXT DEFAULT 'MATERIAL'");
    await ensureColumnIfMissing('examination_bom_calculations', 'adjustment_id', 'TEXT');
    await ensureColumnIfMissing('examination_bom_calculations', 'adjustment_name', 'TEXT');
    await ensureColumnIfMissing('examination_bom_calculations', 'adjustment_type', 'TEXT');
    await ensureColumnIfMissing('examination_bom_calculations', 'adjustment_value', 'REAL DEFAULT 0');
    await ensureColumnIfMissing('examination_bom_calculations', 'allocation_ratio', 'REAL DEFAULT 0');
    await ensureColumnIfMissing('examination_bom_calculations', 'cost_source', 'TEXT');
    await ensureColumnIfMissing('examination_bom_calculations', 'source_unit_cost', 'REAL');
    await ensureColumnIfMissing('examination_bom_calculations', 'source_timestamp', 'DATETIME');
    await ensureColumnIfMissing('examination_bom_calculations', 'source_item_id', 'TEXT');
  })().then(null, (error) => {
    ensurePricingSchemaPromise = null;
    console.error('[PricingSchema] Error ensuring pricing schema:', error);
  });

  return ensurePricingSchemaPromise;
};

const ensureExaminationInvoiceSchema = async () => {
  if (ensureInvoiceSchemaPromise) return ensureInvoiceSchemaPromise;

  ensureInvoiceSchemaPromise = (async () => {
    await ensureColumnIfMissing('invoices', 'due_date', 'DATETIME');
    await ensureColumnIfMissing('invoices', 'customer_name', 'TEXT');
    await ensureColumnIfMissing('invoices', 'invoice_number', 'TEXT');
    await ensureColumnIfMissing('invoices', 'origin_module', 'TEXT');
    await ensureColumnIfMissing('invoices', 'origin_batch_id', 'TEXT');
    await ensureColumnIfMissing('invoices', 'idempotency_key', 'TEXT');
    await ensureColumnIfMissing('invoices', 'line_items_json', 'TEXT');
    await ensureColumnIfMissing('invoices', 'notes', 'TEXT');
    await ensureColumnIfMissing('invoices', 'updated_at', 'DATETIME');

    await runRun('CREATE INDEX IF NOT EXISTS idx_invoices_origin_batch ON invoices(origin_module, origin_batch_id)');
    await runRun('CREATE UNIQUE INDEX IF NOT EXISTS idx_invoices_idempotency_key ON invoices(idempotency_key)');
  })().then(null, (error) => {
    ensureInvoiceSchemaPromise = null;
    console.error('[InvoiceSchema] Error ensuring invoice schema:', error);
  });

  return ensureInvoiceSchemaPromise;
};

const logPricingAuditEntry = async (entry) => {
  await ensureExaminationPricingSchema();
  await runRun(
    `INSERT INTO examination_pricing_audit (
      id, batch_id, class_id, user_id, event_type, trigger_source,
      previous_cost_per_learner, suggested_cost_per_learner, new_cost_per_learner,
      candidature, previous_total_amount, new_total_amount, percentage_difference, details_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      randomUUID(),
      entry.batch_id,
      entry.class_id || null,
      entry.user_id || 'System',
      entry.event_type,
      entry.trigger_source || null,
      entry.previous_cost_per_learner ?? null,
      entry.suggested_cost_per_learner ?? null,
      entry.new_cost_per_learner ?? null,
      entry.candidature ?? 0,
      entry.previous_total_amount ?? null,
      entry.new_total_amount ?? null,
      entry.percentage_difference ?? 0,
      stringifyDetails(entry.details_json)
    ]
  );
};

const updateSyncState = async (entityType, records) => {
  await ensureExaminationSyncSchema();
  const normalizedRecords = Array.isArray(records) ? records : [];
  const checksum = buildStateChecksum(normalizedRecords);
  const payload = stringifyDetails(normalizedRecords);
  await runRun(
    `INSERT INTO examination_sync_state (
      entity_type, last_synced_at, last_checksum, item_count, last_payload_json, updated_at
    ) VALUES (? , CURRENT_TIMESTAMP, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(entity_type) DO UPDATE SET
      last_synced_at = CURRENT_TIMESTAMP,
      last_checksum = excluded.last_checksum,
      item_count = excluded.item_count,
      last_payload_json = excluded.last_payload_json,
      updated_at = CURRENT_TIMESTAMP`,
    [entityType, checksum, normalizedRecords.length, payload]
  );
  return { checksum, itemCount: normalizedRecords.length };
};

const getSyncStateRow = async (entityType) => {
  await ensureExaminationSyncSchema();
  return runGet(
    `SELECT entity_type, last_synced_at, last_checksum, item_count, updated_at
     FROM examination_sync_state
     WHERE entity_type = ?`,
    [entityType]
  );
};

const getPreferredBomMaterialIds = async () => {
  try {
    const rows = await runQuery(
      `SELECT preferred_item_id
       FROM bom_default_materials
       WHERE preferred_item_id IS NOT NULL
         AND TRIM(preferred_item_id) <> ''`
    );
    return new Set((rows || []).map((row) => String(row.preferred_item_id || '').trim()).filter(Boolean));
  } catch {
    // Table may not exist in older environments.
    return new Set();
  }
};

const buildBackendMarketAdjustmentChecksumPayload = async () => {
  const columns = await getTableColumnSet('market_adjustments');
  const orderSql = buildMarketAdjustmentOrderSql(columns);
  const params = [];
  const rows = await runQuery(`
    SELECT * FROM market_adjustments
    
    ${orderSql}
  `, params);

  return (rows || [])
    .map((row) => normalizeMarketAdjustmentSyncRecord(row))
    .filter(Boolean)
    .map((row) => ({
      id: row.id,
      name: row.name,
      type: row.type,
      value: row.value,
      percentage: row.percentage,
      applies_to: row.applies_to,
      active: row.active,
      description: row.description,
      category: row.category,
      display_name: row.display_name,
      adjustment_category: row.adjustment_category,
      sort_order: row.sort_order
    }));
};

const buildBackendInventoryChecksumPayload = async () => {
  const preferredIds = await getPreferredBomMaterialIds();
  const query = 'SELECT * FROM inventory ORDER BY id ASC';
  const params = [];
  const rows = await runQuery(query, params);
  return (rows || [])
    .map((row) => normalizeInventorySyncRecord(row))
    .filter(Boolean)
    .filter((row) => isBomRelevantInventoryRecord(row, preferredIds))
    .map((row) => ({
      id: row.id,
      name: row.name,
      material: row.material,
      category_id: row.category_id,
      unit: row.unit,
      quantity: row.quantity,
      cost_per_unit: row.cost_per_unit,
      conversion_rate: row.conversion_rate
    }));
};

const assertBatchMutableForPricing = batchWorkflow.assertBatchMutableForPricing;

const resolveClassLiveTotalForRollup = (cls) => {
  const learners = Math.max(0, Math.floor(toNumericValue(cls?.number_of_learners) ?? 0));
  const persistedLiveTotal = toNumericValue(cls?.live_total_preview);
  if (persistedLiveTotal !== null && persistedLiveTotal >= 0) {
    return pricingEngine.roundCurrency(persistedLiveTotal);
  }

  const hasManualOverride = toBoolean(cls?.is_manual_override ?? 0);
  const manualCostPerLearner = toNumericValue(cls?.manual_cost_per_learner);
  if (hasManualOverride && manualCostPerLearner !== null && manualCostPerLearner > 0 && learners > 0) {
    return pricingEngine.roundCurrency(manualCostPerLearner * learners);
  }

  const finalFeePerLearner = pickPositiveNumber(
    cls?.final_fee_per_learner,
    cls?.price_per_learner,
    cls?.expected_fee_per_learner
  );
  if (finalFeePerLearner !== null && learners > 0) {
    return pricingEngine.roundCurrency(finalFeePerLearner * learners);
  }

  return pricingEngine.roundCurrency(
    toNumericValue(cls?.calculated_total_cost)
    ?? toNumericValue(cls?.total_price)
    ?? 0
  );
};

const recalculateBatchFinancialTotalsFromClasses = async (batchId) => {
  const batchRow = await runGet('SELECT rounding_method, rounding_value FROM examination_batches WHERE id = ?', [batchId]);
  const classes = await runQuery('SELECT * FROM examination_classes WHERE batch_id = ?', [batchId]);

  let totalAmount = 0;
  let materialTotal = 0;
  let adjustmentTotal = 0;
  let learnerCount = 0;

  for (const cls of classes || []) {
    totalAmount += resolveClassLiveTotalForRollup(cls);
    materialTotal += toNumericValue(cls?.material_total_cost) ?? 0;
    adjustmentTotal += toNumericValue(cls?.adjustment_total_cost) ?? 0;
    learnerCount += Math.max(0, Math.floor(Number(cls?.number_of_learners) || 0));
  }

  const roundedTotalAmount = pricingEngine.roundCurrency(totalAmount);
  const roundedMaterialTotal = pricingEngine.roundCurrency(materialTotal);
  const roundedAdjustmentTotal = pricingEngine.roundCurrency(adjustmentTotal);
  const adjustmentTracking = await summarizeBatchAdjustmentTracking(batchId);
  const hasAdjustmentSnapshots = adjustmentTracking.snapshots.length > 0;
  const normalizedAdjustmentSnapshots = hasAdjustmentSnapshots
    ? adjustmentTracking.snapshots
    : (roundedAdjustmentTotal > 0
      ? [
        {
          id: 'calculated-adjustments',
          name: 'Calculated Adjustments',
          type: 'FIXED',
          total_amount: roundedAdjustmentTotal,
          application_count: 0,
          is_rounding: false
        }
      ]
      : []);
  const normalizedRoundingTotal = hasAdjustmentSnapshots
    ? pricingEngine.roundCurrency(adjustmentTracking.roundingAdjustmentTotal)
    : 0;
  const preRoundingTotalAmount = pricingEngine.roundCurrency(
    Math.max(0, roundedTotalAmount - normalizedRoundingTotal)
  );
  const calculatedCostPerLearner = learnerCount > 0
    ? pricingEngine.roundCurrency(roundedTotalAmount / learnerCount)
    : 0;

  await runRun(
    `UPDATE examination_batches
     SET total_amount = ?,
         calculated_material_total = ?,
         calculated_adjustment_total = ?,
         adjustment_snapshots_json = ?,
         rounding_adjustment_total = ?,
         pre_rounding_total_amount = ?,
         rounding_method = ?,
         rounding_value = ?,
         expected_candidature = ?,
         calculated_cost_per_learner = ?,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
    [roundedTotalAmount, roundedMaterialTotal, roundedAdjustmentTotal, serializeBatchAdjustmentSnapshots(normalizedAdjustmentSnapshots), normalizedRoundingTotal, preRoundingTotalAmount, batchRow?.rounding_method || 'ALWAYS_UP_50', normalizePositiveRoundingStep(batchRow?.rounding_value, 50), learnerCount, calculatedCostPerLearner, batchId]
  );

  return {
    classCount: classes.length,
    learnerCount,
    totalAmount: roundedTotalAmount,
    materialTotal: roundedMaterialTotal,
    adjustmentTotal: roundedAdjustmentTotal,
    roundingTotal: normalizedRoundingTotal,
    preRoundingTotalAmount
  };
};

const examinationService = {
  // --- Audit Logs ---
  getAuditLogs: async (entityType, entityId) => {
    return await auditService.getEntityHistory(entityType, entityId);
  },

  getAuditTrail: async (correlationId) => {
    return await auditService.getCorrelationTrail(correlationId);
  },

  // --- Settings ---
  getExamPricingSettings: async () => {
    await ensureExaminationPricingSchema();
    const activeAdjustments = await resolveEffectiveClassAdjustments();
    const {
      paperItem,
      tonerItem,
      paperUnitCost,
      tonerUnitCost,
      paperConversionRate
    } = await resolveExamMaterialConfiguration();

    return {
      paper_item_id: paperItem ? paperItem.id : null,
      paper_item_name: paperItem ? paperItem.name : null,
      paper_unit_cost: paperUnitCost,
      toner_item_id: tonerItem ? tonerItem.id : null,
      toner_item_name: tonerItem ? tonerItem.name : null,
      toner_unit_cost: tonerUnitCost,
      conversion_rate: paperConversionRate,
      constants: {
        pages_per_sheet: PAGES_PER_SHEET,
        toner_pages_per_unit: TONER_PAGES_PER_KG,
        default_paper_conversion_rate: DEFAULT_PAPER_CONVERSION_RATE,
        adjustment_formula: {
          percentage: 'base_bom_cost * (value / 100)',
          fixed: 'value * total_pages',
          compounding: false
        }
      },
      active_adjustments: activeAdjustments.map((adj) => ({
        id: adj.id,
        name: adj.name,
        type: adj.type,
        value: adj.value,
        percentage: adj.percentage,
        applies_to: adj.appliesTo,
        active: adj.active,
        description: adj.description,
        category: adj.category,
        adjustment_category: adj.adjustmentCategory,
        sort_order: adj.sortOrder
      }))
    };
  },

  updateExamPricingSettings: async (payload, options = {}) => {
    await ensureExaminationPricingSchema();
    const userId = options.userId || 'System';
    const triggerRecalculate = payload?.trigger_recalculate === undefined ? true : toBoolean(payload.trigger_recalculate);
    const lockBatchIdRaw = payload?.lock_batch_id ?? payload?.lockBatchId;
    const lockBatchId = lockBatchIdRaw ? String(lockBatchIdRaw).trim() : '';
    const lockPricingSnapshot = payload?.lock_pricing_snapshot === undefined
      ? (payload?.lockPricingSnapshot === undefined ? Boolean(lockBatchId) : toBoolean(payload?.lockPricingSnapshot))
      : toBoolean(payload?.lock_pricing_snapshot);
    const lockReasonRaw = payload?.lock_reason ?? payload?.lockReason;
    const lockReason = String(lockReasonRaw || '').trim();

    const hasPaperItemUpdate = Object.prototype.hasOwnProperty.call(payload || {}, 'paper_item_id');
    const hasTonerItemUpdate = Object.prototype.hasOwnProperty.call(payload || {}, 'toner_item_id');
    const hasConversionRateUpdate = Object.prototype.hasOwnProperty.call(payload || {}, 'conversion_rate');
    const paperItemId = payload.paper_item_id ? String(payload.paper_item_id).trim() : null;
    const tonerItemId = payload.toner_item_id ? String(payload.toner_item_id).trim() : null;
    const conversionRate = toNumericValue(payload.conversion_rate);

    await runRun('BEGIN TRANSACTION');
    try {
      if (hasPaperItemUpdate) {
        await upsertBomDefaultMaterial('paper', paperItemId);
      }
      if (hasTonerItemUpdate) {
        await upsertBomDefaultMaterial('toner', tonerItemId);
      }

      if (hasConversionRateUpdate) {
        const normalizedRate = conversionRate ?? DEFAULT_PAPER_CONVERSION_RATE;
        if (normalizedRate <= 0) {
          throw new Error('Conversion rate must be greater than zero.');
        }

        const updateWhere = `WHERE conversion_rate IS NOT NULL OR conversion_rate IS NULL`;
        const updateParams = [normalizedRate];
        await runRun(
          `UPDATE inventory
           SET conversion_rate = ?,
               last_updated = CURRENT_TIMESTAMP
           `,
          updateParams
        );
      }

      await runRun('COMMIT');
    } catch (error) {
      try {
        await runRun('ROLLBACK');
      } catch {
        // Ignore rollback errors
      }
      throw error;
    }

    let recalcSummary = null;
    if (triggerRecalculate) {
      recalcSummary = await examinationService.recalculateNonInvoicedBatches({
        trigger: 'SETTINGS_UPDATE',
        userId,
        includeApproved: false});
    }

    let lockSummary = null;
    if (lockPricingSnapshot && lockBatchId) {
      lockSummary = await examinationService.lockBatchPricingSnapshot(lockBatchId, {
        userId,
        reason: lockReason || 'Saved via examination pricing settings'});

      await examinationService.calculateBatch(lockBatchId, {
        trigger: 'SETTINGS_PRICING_LOCK',
        userId
      });
    }

    return {
      success: true,
      recalculation: recalcSummary,
      pricing_lock: lockSummary
    };
  },

  // --- Batches ---
  getAllBatches: async (options = {}) => {
    await ensureCoreExaminationSchema();
    const includeSubjectPages = options?.includeSubjectPages !== false;
    const includeClassStats = options?.includeClassStats !== false;
    const runBatchListQuery = async () => {
      if (!includeClassStats) {
        return await runQuery(`
          SELECT
            b.*,
            COALESCE(cls.class_count, 0) AS class_count,
            COALESCE(cls.learner_count, 0) AS learner_count,
            COALESCE(
              NULLIF(cls.calculated_total_pages, 0),
              COALESCE(subj.estimated_total_pages, 0),
              0
            ) AS total_pages,
            CAST(CEIL(COALESCE(
              NULLIF(cls.calculated_total_pages, 0),
              COALESCE(subj.estimated_total_pages, 0),
              0
            ) / 2.0) AS INTEGER) AS total_sheets
          FROM examination_batches b
          LEFT JOIN (
            SELECT
              batch_id,
              COUNT(*) AS class_count,
              COALESCE(SUM(number_of_learners), 0) AS learner_count,
              COALESCE(SUM(calculated_total_pages), 0) AS calculated_total_pages
            FROM examination_classes
            GROUP BY batch_id
          ) cls ON cls.batch_id = b.id
          LEFT JOIN (
            SELECT
              cls.batch_id AS batch_id,
              COALESCE(
                SUM((CASE WHEN COALESCE(sub.pages, 0) > 0 THEN CAST(COALESCE(sub.pages,0) AS REAL) ELSE 1 END) * (COALESCE(cls.number_of_learners,0) + COALESCE(sub.extra_copies,0))),
                0
              ) AS estimated_total_pages
            FROM examination_classes cls
            INNER JOIN examination_subjects sub ON sub.class_id = cls.id
            GROUP BY cls.batch_id
          ) subj ON subj.batch_id = b.id
          
          ORDER BY b.created_at DESC
        `, []);
      }

      const classColumns = await getTableColumnSet('examination_classes');
      const subjectColumns = includeSubjectPages
        ? await getTableColumnSet('examination_subjects')
        : new Set();

      const hasClassCalculatedPages = classColumns.has('calculated_total_pages');
      const hasClassLearnerCount = classColumns.has('number_of_learners');
      const hasSubjectPages = includeSubjectPages && subjectColumns.has('pages');
      const hasSubjectTotalPages = includeSubjectPages && subjectColumns.has('total_pages');
      const hasSubjectExtraCopies = includeSubjectPages && subjectColumns.has('extra_copies');

      const classCalculatedPagesExpr = hasClassCalculatedPages ? 'COALESCE(calculated_total_pages, 0)' : '0';
      const classLearnerCountExpr = hasClassLearnerCount ? 'COALESCE(number_of_learners, 0)' : '0';
      const subjectPagesExpr = includeSubjectPages
        ? (hasSubjectPages
          ? 'COALESCE(sub.pages, 0)'
          : (hasSubjectTotalPages ? 'COALESCE(sub.total_pages, 0)' : '0'))
        : '0';
      const subjectExtraCopiesExpr = includeSubjectPages && hasSubjectExtraCopies ? 'COALESCE(sub.extra_copies, 0)' : '0';

      const totalPagesExpr = includeSubjectPages
        ? `COALESCE(
            NULLIF(cls.calculated_total_pages, 0),
            COALESCE(subj.estimated_total_pages, 0),
            0
          )`
        : 'COALESCE(NULLIF(cls.calculated_total_pages, 0), 0)';

      // Calculate total_sheets as CEIL(total_pages / 2) for duplex printing
      const totalSheetsExpr = includeSubjectPages
        ? `CAST(CEIL(COALESCE(
            NULLIF(cls.calculated_total_pages, 0),
            COALESCE(subj.estimated_total_pages, 0),
            0
          ) / 2.0) AS INTEGER)`
        : 'CAST(CEIL(COALESCE(NULLIF(cls.calculated_total_pages, 0), 0) / 2.0) AS INTEGER)';

      const subjectJoinSql = includeSubjectPages
        ? `
        LEFT JOIN (
          SELECT
            cls.batch_id AS batch_id,
            COALESCE(
              SUM(
                (CASE WHEN ${subjectPagesExpr} > 0 THEN CAST(${subjectPagesExpr} AS REAL) ELSE 1 END) *
                (${hasClassLearnerCount ? 'COALESCE(cls.number_of_learners, 0)' : '0'} + ${subjectExtraCopiesExpr})
              ),
              0
            ) AS estimated_total_pages
          FROM examination_classes cls
          INNER JOIN examination_subjects sub ON sub.class_id = cls.id
          GROUP BY cls.batch_id
        ) subj ON subj.batch_id = b.id`
        : '';

      const primaryQuery = `
        SELECT
          b.*,
          COALESCE(cls.class_count, 0) AS class_count,
          COALESCE(cls.learner_count, 0) AS learner_count,
          ${totalPagesExpr} AS total_pages,
          ${totalSheetsExpr} AS total_sheets
        FROM examination_batches b
        LEFT JOIN (
          SELECT
            batch_id,
            COUNT(*) AS class_count,
            COALESCE(SUM(${classLearnerCountExpr}), 0) AS learner_count,
            COALESCE(
              SUM(
                CASE
                  WHEN ${classCalculatedPagesExpr} > 0 THEN ${classCalculatedPagesExpr}
                  ELSE 0
                END
              ),
              0
            ) AS calculated_total_pages
          FROM examination_classes
          GROUP BY batch_id
        ) cls ON cls.batch_id = b.id
        ${subjectJoinSql}
        
        ORDER BY b.created_at DESC
      `;

      try {
        return await runQuery(primaryQuery, []);
      } catch (error) {
        if (!isSchemaDriftError(error)) throw error;

        // Fallback for partially migrated DBs: return batches with class/learner counts.
        return await runQuery(`
          SELECT
            b.*,
            COALESCE(cls.class_count, 0) AS class_count,
            COALESCE(cls.learner_count, 0) AS learner_count,
            0 AS total_pages,
            0 AS total_sheets
          FROM examination_batches b
          LEFT JOIN (
            SELECT
              batch_id,
              COUNT(*) AS class_count,
              COALESCE(SUM(${classLearnerCountExpr}), 0) AS learner_count
            FROM examination_classes
            GROUP BY batch_id
          ) cls ON cls.batch_id = b.id
          
          ORDER BY b.created_at DESC
        `, []);
      }
    };

    try {
      return await runBatchListQuery();
    } catch (error) {
      if (!isSchemaDriftError(error)) throw error;
      await ensureCoreExaminationSchema();
      return await runBatchListQuery();
    }
  },

  getBatchById: async (id) => {
    const runBatchDetailQuery = async () => {
      const params = [id];
      const batch = await runGet(`SELECT * FROM examination_batches WHERE id = ?`, params);
      if (!batch) {
        console.log(JSON.stringify({
          ts: new Date().toISOString(),
          level: 'info',
          event: 'batch_fetch_not_found',
          batchId: id
        }));
        return null;
      }
      console.log(JSON.stringify({
        ts: new Date().toISOString(),
        level: 'info',
        event: 'batch_fetch_success',
        batchId: id,
        name: batch.name
      }));
      batch.adjustment_snapshots = parseBatchAdjustmentSnapshots(batch?.adjustment_snapshots_json);
      const defaultMaterialConfig = await resolveExamMaterialConfiguration();

      const classes = await runQuery('SELECT * FROM examination_classes WHERE batch_id = ?', [id]);

      for (let cls of classes) {
        cls.subjects = await runQuery('SELECT * FROM examination_subjects WHERE class_id = ?', [cls.id]);
        const classAdjustmentRows = await runQuery(
          `SELECT *
           FROM examination_class_adjustments
           WHERE class_id = ?
           ORDER BY sequence_no ASC, adjustment_name ASC`,
          [cls.id]
        );
        const subjectAllocations = allocateSubjectFinancials({
          subjects: cls.subjects,
          learners: cls.number_of_learners,
          paperUnitCost: pickPositiveNumber(batch?.locked_paper_unit_cost, defaultMaterialConfig.paperUnitCost) ?? defaultMaterialConfig.paperUnitCost,
          tonerUnitCost: pickPositiveNumber(batch?.locked_toner_unit_cost, defaultMaterialConfig.tonerUnitCost) ?? defaultMaterialConfig.tonerUnitCost,
          paperConversionRate: pickPositiveNumber(batch?.locked_conversion_rate, defaultMaterialConfig.paperConversionRate) ?? defaultMaterialConfig.paperConversionRate,
          tonerPagesPerUnit: defaultMaterialConfig.tonerPagesPerUnit,
          classAdjustmentRows
        });
        const subjectAllocationsById = new Map(
          subjectAllocations.map((allocation) => [String(allocation.subjectId), allocation])
        );
        cls.subjects = cls.subjects.map((subject) => {
          const allocation = subjectAllocationsById.get(String(subject?.id || ''));
          if (!allocation) return subject;
          return {
            ...subject,
            allocated_material_cost: allocation.materialCost,
            allocated_market_adjustment_cost: allocation.marketAdjustmentCost,
            allocated_rounding_cost: allocation.roundingCost,
            allocated_adjustment_cost: allocation.adjustmentCost,
            allocated_pre_rounding_total: allocation.preRoundingTotal,
            allocated_total_cost: allocation.totalCost,
            allocated_paper_cost: allocation.paperCost,
            allocated_toner_cost: allocation.tonerCost,
            adjustment_breakdown: allocation.adjustmentBreakdown
          };
        });
      }

      batch.classes = classes;
      return batch;
    };

    try {
      return await runBatchDetailQuery();
    } catch (error) {
      if (!isSchemaDriftError(error)) throw error;
      await ensureCoreExaminationSchema();
      return await runBatchDetailQuery();
    }
  },

  getBOMCalculations: async (batchId) => {
    const batchFilter = '';
    const params = [batchId];
    return await runQuery(
      `SELECT * FROM examination_bom_calculations WHERE batch_id = ?  ORDER BY class_id, item_name`,
      params
    );
  },

  getMarketAdjustmentMeta: async () => {
    const columns = await getTableColumnSet('market_adjustments');
    const orderSql = buildMarketAdjustmentOrderSql(columns);
    const params = [];
    const rows = await runQuery(`
      SELECT * FROM market_adjustments
      
      ${orderSql}
    `, params);
    return rows.map((row) => normalizeMarketAdjustmentMeta(row, columns));
  },

  syncMarketAdjustments: async (payload = {}, options = {}) => {
    await ensureExaminationSyncSchema();
    const rawAdjustments = Array.isArray(payload?.adjustments)
      ? payload.adjustments
      : (Array.isArray(payload) ? payload : []);
    const replaceMissing = payload?.replace_missing === undefined
      ? (payload?.replaceMissing === undefined ? true : toBoolean(payload.replaceMissing))
      : toBoolean(payload.replace_missing);
    const triggerRecalculate = payload?.trigger_recalculate === undefined
      ? (payload?.triggerRecalculate === undefined ? false : toBoolean(payload.triggerRecalculate))
      : toBoolean(payload.trigger_recalculate);
    const userId = payload?.user_id || payload?.userId || options?.userId || 'System';

    const normalized = rawAdjustments
      .map((entry) => normalizeMarketAdjustmentSyncRecord(entry))
      .filter(Boolean);

    const existingRows = await runQuery('SELECT * FROM market_adjustments');
    const existingById = new Map(
      (existingRows || [])
        .map((row) => normalizeMarketAdjustmentSyncRecord(row))
        .filter(Boolean)
        .map((row) => [row.id, row])
    );

    let upsertedCount = 0;
    let changedCount = 0;
    let deactivatedCount = 0;

    await runRun('BEGIN TRANSACTION');
    try {
      for (const adjustment of normalized) {
        const existing = existingById.get(adjustment.id);
        if (!existing || existing.sync_checksum !== adjustment.sync_checksum || Number(existing.active) !== Number(adjustment.active)) {
          changedCount += 1;
        }

        const upsertParams = [
          adjustment.id,
          adjustment.name,
          adjustment.type,
          adjustment.value,
          adjustment.percentage,
          adjustment.applies_to,
          adjustment.active,
          adjustment.is_active,
          adjustment.description,
          adjustment.category,
          adjustment.display_name,
          adjustment.adjustment_category,
          adjustment.sort_order,
          adjustment.is_system_default,
          adjustment.apply_to_categories,
          adjustment.created_at,
          adjustment.last_applied_at,
          adjustment.total_applied_amount,
          adjustment.application_count,
          adjustment.sync_checksum
        ];
        await runRun(
          `INSERT INTO market_adjustments (
            id, name, type, value, percentage, applies_to, active, is_active,
            description, category, display_name, adjustment_category, sort_order,
            is_system_default, apply_to_categories, created_at, last_applied_at,
            total_applied_amount, application_count, last_synced_at, sync_checksum
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, CURRENT_TIMESTAMP), ?, ?, ?, CURRENT_TIMESTAMP, ?)
          ON CONFLICT(id) DO UPDATE SET
            name = excluded.name,
            type = excluded.type,
            value = excluded.value,
            percentage = excluded.percentage,
            applies_to = excluded.applies_to,
            active = excluded.active,
            is_active = excluded.is_active,
            description = excluded.description,
            category = excluded.category,
            display_name = excluded.display_name,
            adjustment_category = excluded.adjustment_category,
            sort_order = excluded.sort_order,
            is_system_default = excluded.is_system_default,
            apply_to_categories = excluded.apply_to_categories,
            last_applied_at = excluded.last_applied_at,
            total_applied_amount = excluded.total_applied_amount,
            application_count = excluded.application_count,
            last_synced_at = CURRENT_TIMESTAMP,
            sync_checksum = excluded.sync_checksum`,
          upsertParams
        );
        upsertedCount += 1;
      }

      if (replaceMissing) {
        let deactivateResult;
        if (normalized.length > 0) {
          const placeholders = normalized.map(() => '?').join(', ');
          const deactivateParams = normalized.map((item) => item.id);
          deactivateResult = await runRun(
            `UPDATE market_adjustments
             SET active = 0,
                 is_active = 0,
                 last_synced_at = CURRENT_TIMESTAMP
             WHERE id NOT IN (${placeholders})
               AND COALESCE(active, is_active, 1) = 1`,
            deactivateParams
          );
        } else {
          const deactivateParams = [];
          deactivateResult = await runRun(
            `UPDATE market_adjustments
             SET active = 0,
                 is_active = 0,
                 last_synced_at = CURRENT_TIMESTAMP
             WHERE COALESCE(active, is_active, 1) = 1`,
            deactivateParams
          );
        }
        deactivatedCount = Number(deactivateResult?.changes || 0);
        changedCount += deactivatedCount;
      }

      await runRun('COMMIT');
    } catch (error) {
      try {
        await runRun('ROLLBACK');
      } catch {
        // Ignore rollback errors and surface the original failure.
      }
      throw error;
    }

    // Always snapshot backend-normalized rows so drift health compares like-for-like.
    const backendPayload = await buildBackendMarketAdjustmentChecksumPayload();
    const syncState = await updateSyncState(
      SYNC_ENTITY_MARKET_ADJUSTMENTS,
      backendPayload
    );

    let recalcSummary = null;
    if (triggerRecalculate && changedCount > 0 && !isAbortSignalAborted(options?.signal)) {
      recalcSummary = await examinationService.recalculateNonInvoicedBatches({
        trigger: 'SYNC_MARKET_ADJUSTMENTS',
        userId,
        includeApproved: false,
        signal: options?.signal});
    }

    return {
      success: true,
      upserted: upsertedCount,
      changed: changedCount,
      deactivated: deactivatedCount,
      checksum: syncState.checksum,
      item_count: syncState.itemCount,
      recalculation: recalcSummary
    };
  },

  syncInventoryItems: async (payload = {}, options = {}) => {
    await ensureExaminationSyncSchema();
    const rawItems = Array.isArray(payload?.items)
      ? payload.items
      : (Array.isArray(payload) ? payload : []);
    const triggerRecalculate = payload?.trigger_recalculate === undefined
      ? (payload?.triggerRecalculate === undefined ? false : toBoolean(payload.triggerRecalculate))
      : toBoolean(payload.trigger_recalculate);
    const userId = payload?.user_id || payload?.userId || options?.userId || 'System';

    const preferredIds = await getPreferredBomMaterialIds();
    const normalizedAll = rawItems
      .map((entry) => normalizeInventorySyncRecord(entry))
      .filter(Boolean);
    const normalized = normalizedAll.filter((entry) => isBomRelevantInventoryRecord(entry, preferredIds));

    if (normalized.length === 0) {
      // Keep sync state aligned to backend selection scope even when nothing is upserted.
      const backendPayload = await buildBackendInventoryChecksumPayload();
      const syncState = await updateSyncState(SYNC_ENTITY_INVENTORY_ITEMS, backendPayload);
      return {
        success: true,
        upserted: 0,
        changed: 0,
        cost_changed: 0,
        checksum: syncState.checksum,
        item_count: syncState.itemCount,
        recalculation: null
      };
    }

    const existingById = new Map(
      await runQuery('SELECT * FROM inventory')
        .map((row) => [String(row.id), row])
    );

    let upsertedCount = 0;
    let changedCount = 0;
    let costChangedCount = 0;

    await runRun('BEGIN TRANSACTION');
    try {
      for (const item of normalized) {
        const existing = existingById.get(item.id);
        const existingNormalized = existing ? normalizeInventorySyncRecord(existing) : null;
        if (!existingNormalized || existingNormalized.sync_checksum !== item.sync_checksum) {
          changedCount += 1;
        }

        const previousCost = pickPositiveNumber(
          existing?.cost_per_unit,
          existing?.cost_price,
          existing?.cost
        ) ?? 0;
        if (!existing || Math.abs(previousCost - item.cost_per_unit) > 0.00001) {
          costChangedCount += 1;
        }

        const quantityForInsert = item.quantity === null
          ? (toNumericValue(existing?.quantity) ?? 0)
          : item.quantity;

        const upsertParams = [
          item.id,
          item.name,
          item.material,
          quantityForInsert,
          item.cost_per_unit,
          item.unit,
          item.category_id,
          item.conversion_rate,
          item.last_updated,
          item.sync_checksum
        ];
        await runRun(
          `INSERT INTO inventory (
            id, name, material, quantity, cost_per_unit, unit, category_id,
            conversion_rate, last_updated, last_synced_at, sync_checksum
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, CURRENT_TIMESTAMP), CURRENT_TIMESTAMP, ?)
          ON CONFLICT(id) DO UPDATE SET
            name = excluded.name,
            material = COALESCE(excluded.material, inventory.material),
            quantity = COALESCE(excluded.quantity, inventory.quantity),
            cost_per_unit = excluded.cost_per_unit,
            unit = COALESCE(NULLIF(excluded.unit, ''), inventory.unit),
            category_id = COALESCE(NULLIF(excluded.category_id, ''), inventory.category_id),
            conversion_rate = COALESCE(excluded.conversion_rate, inventory.conversion_rate),
            last_updated = CURRENT_TIMESTAMP,
            last_synced_at = CURRENT_TIMESTAMP,
            sync_checksum = excluded.sync_checksum`,
          upsertParams
        );
        upsertedCount += 1;
      }

      await runRun('COMMIT');
    } catch (error) {
      try {
        await runRun('ROLLBACK');
      } catch {
        // Ignore rollback errors and surface the original failure.
      }
      throw error;
    }

    // Always snapshot backend-normalized rows so drift health compares like-for-like.
    const backendPayload = await buildBackendInventoryChecksumPayload();
    const syncState = await updateSyncState(
      SYNC_ENTITY_INVENTORY_ITEMS,
      backendPayload
    );

    let recalcSummary = null;
    if (triggerRecalculate && costChangedCount > 0 && !isAbortSignalAborted(options?.signal)) {
      recalcSummary = await examinationService.recalculateNonInvoicedBatches({
        trigger: 'SYNC_INVENTORY_ITEMS',
        userId,
        includeApproved: false,
        signal: options?.signal});
    }

    return {
      success: true,
      upserted: upsertedCount,
      changed: changedCount,
      cost_changed: costChangedCount,
      checksum: syncState.checksum,
      item_count: syncState.itemCount,
      recalculation: recalcSummary
    };
  },

  getSyncHealth: async () => {
    await ensureExaminationSyncSchema();
    const [marketState, inventoryState, marketPayload, inventoryPayload] = await Promise.all([
      getSyncStateRow(SYNC_ENTITY_MARKET_ADJUSTMENTS),
      getSyncStateRow(SYNC_ENTITY_INVENTORY_ITEMS),
      buildBackendMarketAdjustmentChecksumPayload(),
      buildBackendInventoryChecksumPayload()
    ]);

    const backendMarketChecksum = buildStateChecksum(marketPayload);
    const backendInventoryChecksum = buildStateChecksum(inventoryPayload);

    const marketDrift = !marketState?.last_checksum || marketState.last_checksum !== backendMarketChecksum;
    const inventoryDrift = !inventoryState?.last_checksum || inventoryState.last_checksum !== backendInventoryChecksum;

    return {
      checked_at: new Date().toISOString(),
      ok: !marketDrift && !inventoryDrift,
      entities: {
        [SYNC_ENTITY_MARKET_ADJUSTMENTS]: {
          last_synced_at: marketState?.last_synced_at || null,
          state_checksum: marketState?.last_checksum || null,
          backend_checksum: backendMarketChecksum,
          state_count: Number(marketState?.item_count || 0),
          backend_count: marketPayload.length,
          drift: marketDrift
        },
        [SYNC_ENTITY_INVENTORY_ITEMS]: {
          last_synced_at: inventoryState?.last_synced_at || null,
          state_checksum: inventoryState?.last_checksum || null,
          backend_checksum: backendInventoryChecksum,
          state_count: Number(inventoryState?.item_count || 0),
          backend_count: inventoryPayload.length,
          drift: inventoryDrift
        }
      }
    };
  },

  lockBatchPricingSnapshot: async (batchId, options = {}) => {
    await ensureExaminationPricingSchema();

    const normalizedBatchId = String(batchId || '').trim();
    if (!normalizedBatchId) {
      throw new Error('Batch id is required to lock pricing snapshot.');
    }

    const batchParams = [normalizedBatchId];
    const existingBatch = await runGet(`SELECT id FROM examination_batches WHERE id = ? `, batchParams);
    if (!existingBatch) {
      throw new Error('Batch not found');
    }

    const userId = options?.userId || 'System';
    const reason = String(options?.reason || 'Saved via examination pricing settings').trim()
      || 'Saved via examination pricing settings';

    const {
      paperUnitCost,
      tonerUnitCost,
      paperConversionRate
    } = await resolveExamMaterialConfiguration();
    const activeAdjustments = await resolveEffectiveClassAdjustments();
    const lockedAdjustmentsJson = serializeAdjustmentSnapshot(activeAdjustments);

    await runRun(
      `UPDATE examination_batches
       SET pricing_lock_enabled = 1,
           pricing_lock_reason = ?,
           pricing_lock_by = ?,
           pricing_locked_at = CURRENT_TIMESTAMP,
           locked_paper_unit_cost = ?,
           locked_toner_unit_cost = ?,
           locked_conversion_rate = ?,
           locked_adjustments_json = ?,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [reason, userId, pricingEngine.roundCurrency(paperUnitCost), pricingEngine.roundCurrency(tonerUnitCost), paperConversionRate, lockedAdjustmentsJson, normalizedBatchId]
    );

    const classFilter = '';
    const classParams = [normalizedBatchId];
    const classCountRow = await runGet(
      `SELECT COUNT(*) AS total FROM examination_classes WHERE batch_id = ? `,
      classParams
    );

    return {
      batch_id: normalizedBatchId,
      pricing_lock_enabled: true,
      class_count: Number(classCountRow?.total || 0)
    };
  },

  recalculateNonInvoicedBatches: async (options = {}) => {
    const trigger = String(options?.trigger || 'BACKFILL_NON_INVOICED').trim() || 'BACKFILL_NON_INVOICED';
    const userId = options?.userId || 'System';
    const includeApproved = toBoolean(options?.includeApproved);
    const signal = options?.signal;
    const limit = toNumericValue(options?.limit);
    const params = [];
    let query = `
      SELECT id, status
      FROM examination_batches
      WHERE COALESCE(status, 'Draft') <> 'Completed'
    `;
        if (!includeApproved) {
      query += ` AND COALESCE(status, 'Draft') <> 'Approved'`;
    }
    query += ' ORDER BY datetime(updated_at) ASC, datetime(created_at) ASC';
    if (limit !== null && Number.isFinite(limit) && limit > 0) {
      query += ' LIMIT ?';
      params.push(Math.floor(limit));
    }

    const candidates = await runQuery(query, params);
    const summary = {
      attempted: 0,
      recalculated: 0,
      failed: 0,
      skipped: 0,
      cancelled: false,
      errors: []
    };

    const candidateRows = candidates || [];
    for (let index = 0; index < candidateRows.length; index += 1) {
      if (isAbortSignalAborted(signal)) {
        summary.cancelled = true;
        summary.skipped += Math.max(0, candidateRows.length - index);
        break;
      }

      const batch = candidateRows[index];
      summary.attempted += 1;
      try {
        await examinationService.calculateBatch(batch.id, { trigger, userId });
        summary.recalculated += 1;
      } catch (error) {
        summary.failed += 1;
        summary.errors.push({
          batch_id: batch.id,
          status: batch.status,
          error: error?.message || 'Unknown error'
        });
      }
    }

    return summary;
  },

  createBatch: async (data, userId = 'System') => {
    console.log(JSON.stringify({
      ts: new Date().toISOString(),
      level: 'info',
      event: 'batch_create_start',
      userId
    }));

    await ensureExaminationPricingSchema();

    const id = randomUUID();
    const payload = (data && typeof data === 'object') ? data : {};
    const schoolIdCandidate = payload.school_id ?? payload.schoolId;
    const nameCandidate = payload.name ?? payload.batch_name ?? payload.batchName;
    const academicYearCandidate = payload.academic_year ?? payload.academicYear;
    const termCandidate = payload.term;
    const examTypeCandidate = payload.exam_type ?? payload.examType;
    const typeCandidate = payload.type;
    const parentBatchCandidate = payload.parent_batch_id ?? payload.parentBatchId;
    const currencyCandidate = payload.currency;
    const subAccountCandidate = payload.sub_account_name ?? payload.subAccountName;
    const batchNumberCandidate = payload.batch_number ?? payload.batchNumber;
    const initialRoundingConfig = resolveBatchRoundingConfig(null, payload);
    const ensureUniqueBatchNumber = async (candidate) => {
      const normalizedCandidate = String(candidate || '').trim();
      if (!normalizedCandidate) return normalizedCandidate;

      const duplicate = await runGet(
        'SELECT batch_number FROM examination_batches WHERE batch_number = ?',
        [normalizedCandidate]
      );
      if (!duplicate) {
        return normalizedCandidate;
      }

      const parts = normalizedCandidate.match(/^(.*?)(\d+)([^0-9]*)$/);
      if (!parts) {
        throw new Error(`Batch number "${normalizedCandidate}" already exists.`);
      }

      const [, prefix, numericPart, suffix] = parts;
      const existingRows = await runQuery(
        'SELECT batch_number FROM examination_batches WHERE batch_number LIKE ?',
        [`${prefix}%`]
      );

      const highestUsedNumber = (existingRows || []).reduce((max, row) => {
        const currentValue = String(row?.batch_number || '').trim();
        const currentParts = currentValue.match(/^(.*?)(\d+)([^0-9]*)$/);
        if (!currentParts) return max;
        if (currentParts[1] !== prefix || currentParts[3] !== suffix) return max;
        const numericValue = parseInt(currentParts[2], 10);
        return Number.isFinite(numericValue) ? Math.max(max, numericValue) : max;
      }, parseInt(numericPart, 10) || 0);

      return `${prefix}${String(highestUsedNumber + 1).padStart(numericPart.length, '0')}${suffix}`;
    };

    if (!schoolIdCandidate || !nameCandidate || !String(nameCandidate).trim()) {
      throw new Error('School ID and batch name are required fields');
    }

    let batchNumber = String(batchNumberCandidate || '').trim();
    if (!batchNumber) {
      const currentYear = new Date().getFullYear().toString();
      const batchYearPrefix = `BTC-PPS-${currentYear}-`;
      const lastBatchRow = await runQuery(
        `SELECT batch_number FROM examination_batches WHERE batch_number LIKE ? ORDER BY batch_number DESC LIMIT 1`,
        [`${batchYearPrefix}%`]
      );
      let nextNum = 1;
      if (lastBatchRow && lastBatchRow.length > 0 && lastBatchRow[0].batch_number) {
        const parts = lastBatchRow[0].batch_number.split('-');
        const lastSeq = parseInt(parts[3], 10);
        if (!isNaN(lastSeq)) {
          nextNum = lastSeq + 1;
        }
      }
      batchNumber = `${batchYearPrefix}${String(nextNum).padStart(3, '0')}`;
    }
    batchNumber = await ensureUniqueBatchNumber(batchNumber);

    const normalizedPayload = {
      id,
      batch_number: batchNumber,
      school_id: String(schoolIdCandidate).trim(),
      name: String(nameCandidate).trim(),
      academic_year: String(academicYearCandidate || '').trim() || new Date().getFullYear().toString(),
      term: String(termCandidate || '').trim() || '1',
      exam_type: String(examTypeCandidate || '').trim() || 'Mid-Term',
      type: String(typeCandidate || '').trim() || 'Original',
      parent_batch_id: parentBatchCandidate ? String(parentBatchCandidate).trim() : null,
      currency: String(currencyCandidate || '').trim() || 'MWK',
      sub_account_name: subAccountCandidate ? String(subAccountCandidate).trim() : null,
      rounding_method: initialRoundingConfig.persistedMethod,
      rounding_value: initialRoundingConfig.persistedValue
    };

    console.log(JSON.stringify({
      ts: new Date().toISOString(),
      level: 'info',
      event: 'batch_create_payload',
      batchId: normalizedPayload.id,
      schoolId: normalizedPayload.school_id,
      name: normalizedPayload.name,
      academicYear: normalizedPayload.academic_year,
      term: normalizedPayload.term,
      examType: normalizedPayload.exam_type,
      currency: normalizedPayload.currency
    }));

    try {
      const columnsInfo = await runQuery('PRAGMA table_info(examination_batches)');
      const availableColumns = new Set((columnsInfo || []).map((column) => column.name));
      const requiredColumns = ['id', 'school_id', 'name'];
      const missingRequiredColumns = requiredColumns.filter((column) => !availableColumns.has(column));
      if (missingRequiredColumns.length > 0) {
        throw new Error(`examination_batches schema is missing required column(s): ${missingRequiredColumns.join(', ')}`);
      }

      const preferredColumnOrder = [
        'id',
        'batch_number',
        'school_id',
        'name',
        'academic_year',
        'term',
        'exam_type',
        'type',
        'parent_batch_id',
        'currency',
        'sub_account_name',
        'rounding_method',
        'rounding_value'
      ];
      const insertColumns = preferredColumnOrder.filter((column) => availableColumns.has(column));
      const placeholders = insertColumns.map(() => '?').join(', ');
      const insertValues = insertColumns.map((column) => normalizedPayload[column]);

      const insertResult = await runRun(
        `INSERT INTO examination_batches (${insertColumns.join(', ')})
         VALUES (${placeholders})`,
        insertValues
      );
      console.log(JSON.stringify({
        ts: new Date().toISOString(),
        level: 'info',
        event: 'batch_create_inserted',
        batchId: id
      }));
    } catch (insertError) {
      console.error(JSON.stringify({
        ts: new Date().toISOString(),
        level: 'error',
        event: 'batch_create_insert_failed',
        batchId: id,
        error: insertError.message
      }));
      throw new Error(`Failed to create batch: ${insertError.message}`);
    }

    // Audit Log
    try {
      await writeAuditLog({
        userId,
        action: 'CREATE',
        entityType: 'ExaminationBatch',
        entityId: id,
        details: `Created batch ${normalizedPayload.name}`,
        newValue: normalizedPayload
      });
    } catch (auditError) {
      console.error(JSON.stringify({
        ts: new Date().toISOString(),
        level: 'warn',
        event: 'batch_create_audit_failed',
        batchId: id,
        error: auditError.message
      }));
    }

    // Auto-trigger pricing calculation immediately after batch creation.
    // Use a timeout to ensure creation response is not delayed indefinitely by calculation.
    try {
      const calculationPromise = examinationService.calculateBatch(id, { trigger: 'AUTO_CREATE', userId });
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Calculation timeout')), 10000)
      );
      
      await Promise.race([calculationPromise, timeoutPromise]);    } catch (calcError) {
        console.error(JSON.stringify({
          ts: new Date().toISOString(),
          level: 'warn',
          event: 'batch_create_calc_failed',
          batchId: id,
          error: calcError.message
        }));
        try {
          await writeAuditLog({
            userId,
            action: 'CALCULATE_FAILED',
            entityType: 'ExaminationBatch',
            entityId: id,
            details: `Auto calculation failed/timed out after creation: ${calcError.message}`
          });
        } catch (auditError) {
          console.error(JSON.stringify({
            ts: new Date().toISOString(),
            level: 'warn',
            event: 'batch_create_audit_failed',
            batchId: id,
            error: auditError.message
          }));
        }
      }

    // Read the batch row directly to return a complete object immediately.
    // Avoid getBatchById here because it does heavy joins (classes, subjects,
    // adjustments, material config) that are unnecessary for a brand-new batch
    // with no classes and can fail on partially-migrated schemas.
    const batch = await runGet('SELECT * FROM examination_batches WHERE id = ?', [id]);
    if (!batch) {
      throw new Error('Batch was created but could not be retrieved');
    }
    batch.classes = [];
    batch.adjustment_snapshots = parseBatchAdjustmentSnapshots(batch?.adjustment_snapshots_json);
    console.log(JSON.stringify({
      ts: new Date().toISOString(),
      level: 'info',
      event: 'batch_create_complete',
      batchId: id,
      name: batch.name
    }));
    return batch;
  },

  updateBatch: async (id, data, userId = 'System') => {
    const { name, academic_year, term, exam_type, status, currency, sub_account_name } = data;
    let fields = [];
    let params = [];
    if (name) { fields.push('name = ?'); params.push(name); }
    if (academic_year) { fields.push('academic_year = ?'); params.push(academic_year); }
    if (term) { fields.push('term = ?'); params.push(term); }
    if (exam_type) { fields.push('exam_type = ?'); params.push(exam_type); }
    if (status) { fields.push('status = ?'); params.push(status); }
    if (currency) { fields.push('currency = ?'); params.push(currency); }
    if (sub_account_name) { fields.push('sub_account_name = ?'); params.push(sub_account_name); }

    if (fields.length === 0) return await examinationService.getBatchById(id);

    params.push(id);
    await runRun(`UPDATE examination_batches SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, params);

    await writeAuditLog({
      userId,
      action: 'UPDATE',
      entityType: 'ExaminationBatch',
      entityId: id,
      details: 'Updated batch details',
      newValue: data
    });

    return await examinationService.getBatchById(id);
  },

  deleteBatch: async (id, userId = 'System') => {
    const params = [id];
    const existingBatch = await runGet(`SELECT * FROM examination_batches WHERE id = ?`, params);
    if (!existingBatch) {
      return { success: true };
    }

    const relatedBatchTables = [
      'examination_batch_notifications',
      'examination_bom_calculations',
      'examination_class_adjustments',
      'examination_pricing_audit'
    ];

    if (await tableExists('examination_classes')) {
      const classRows = await runQuery('SELECT id FROM examination_classes WHERE batch_id = ?', [id]);
      const classIds = (classRows || [])
        .map((row) => String(row?.id || '').trim())
        .filter(Boolean);

      if (classIds.length > 0 && await tableExists('examination_subjects')) {
        const placeholders = classIds.map(() => '?').join(', ');
        const subjectParams = classIds;
        await runRun(
          `DELETE FROM examination_subjects WHERE class_id IN (${placeholders})`,
          subjectParams
        );
      }

      const classParams = [id];
      await runRun(`DELETE FROM examination_classes WHERE batch_id = ?`, classParams);
    }

    for (const tableName of relatedBatchTables) {
      if (await tableExists(tableName)) {
        await runRun(`DELETE FROM ${tableName} WHERE batch_id = ?`, [id]);
      }
    }

    const deleteParams = [id];
    await runRun(`DELETE FROM examination_batches WHERE id = ?`, deleteParams);

    // Audit Log
    await writeAuditLog({
      userId,
      action: 'DELETE',
      entityType: 'ExaminationBatch',
      entityId: id,
      details: 'Deleted batch',
      oldValue: existingBatch
    });

    return { success: true };
  },

  // --- Classes ---
  createClass: async (batchId, data, options = {}) => {
    const id = randomUUID();
    const className = String(data.class_name || '').trim();
    const learnersRaw = Number(data.number_of_learners);
    const learners = Number.isFinite(learnersRaw) ? Math.floor(learnersRaw) : NaN;

    // Basic validations with sensible bounds
    if (!className) {
      throw new Error('Class name is required');
    }
    if (className.length > 255) {
      throw new Error('Class name must be 255 characters or fewer');
    }
    if (!Number.isFinite(learners) || learners <= 0) {
      throw new Error('Number of learners must be greater than zero');
    }
    if (learners > 10000) {
      throw new Error('Number of learners exceeds allowed maximum (10000)');
    }

    // Verify batch exists before attempting insert
    const batchParams = [batchId];
    const batch = await runGet(`SELECT id FROM examination_batches WHERE id = ? `, batchParams);
    if (!batch) {
      throw new Error(`Batch with ID ${batchId} not found. Please create the batch first.`);
    }

    // Attempt insert and capture insertion errors (FK, uniqueness etc.)
    try {
      await runRun(
        `INSERT INTO examination_classes (id, batch_id, class_name, number_of_learners)
         VALUES (?, ?, ?, ?)`,
        [id, batchId, className, learners]
      );
    } catch (insertErr) {
      const msg = String(insertErr?.message || insertErr);
      if (msg.toLowerCase().includes('foreign key') || msg.toLowerCase().includes('constraint failed')) {
        throw new Error(`Failed to create class: batch with ID ${batchId} may not exist (FK constraint).`);
      }
      if (msg.toLowerCase().includes('unique') || msg.toLowerCase().includes('constraint')) {
        throw new Error(`Failed to create class: duplicate class name in the same batch.`);
      }
      throw insertErr;
    }

    let calculation_status = 'not_triggered';
    let calculation_error = null;
    try {
      const batchStatus = await runGet('SELECT status FROM examination_batches WHERE id = ?', [batchId]);
      if (!batchStatus || batchStatus.status !== 'Finalized') {
        calculation_status = 'queued';
        Promise.resolve()
          .then(() => examinationService.calculateBatch(batchId, { trigger: 'AUTO_CLASS_CREATE' }))
          .catch((calcError) => {
            const asyncError = String(calcError?.message || calcError);
            console.error(`Failed to calculate batch ${batchId} after class creation:`, asyncError);
          });
      }
    } catch (err) {
      calculation_status = 'unknown';
      calculation_error = String(err?.message || err);
    }

    const created = await runGet('SELECT * FROM examination_classes WHERE id = ?', [id]);
    // Augment returned object with calculation metadata
    return Object.assign({}, created, { calculation_status, calculation_error });
  },

  updateClass: async (id, data) => {
    const classFilter = '';
    const classParams = [id];
    const currentClass = await runGet(`SELECT * FROM examination_classes WHERE id = ? `, classParams);
    if (!currentClass) {
      throw new Error('Class not found');
    }

    const { class_name, number_of_learners } = data;
    let fields = [];
    let params = [];

    if (class_name !== undefined) {
      const className = String(class_name || '').trim();
      if (!className) {
        throw new Error('Class name cannot be empty');
      }
      fields.push('class_name = ?');
      params.push(className);
    }

    if (number_of_learners !== undefined) {
      const learners = Number(number_of_learners);
      if (!Number.isFinite(learners) || learners <= 0) {
        throw new Error('Number of learners must be greater than zero');
      }
      fields.push('number_of_learners = ?');
      params.push(Math.floor(learners));
    }

    if (fields.length === 0) return await runGet('SELECT * FROM examination_classes WHERE id = ?', [id]);

    params.push(id);
    await runRun(`UPDATE examination_classes SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, params);

    await examinationService.calculateBatch(currentClass.batch_id, { trigger: 'AUTO_CLASS_UPDATE' });
    return await runGet('SELECT * FROM examination_classes WHERE id = ?', [id]);
  },

  deleteClass: async (id) => {
    const classFilter = '';
    const classParams = [id];
    const currentClass = await runGet(`SELECT * FROM examination_classes WHERE id = ? `, classParams);
    if (!currentClass) {
      return { success: true };
    }

    await runRun(`DELETE FROM examination_classes WHERE id = ?`, [id]);
    await examinationService.calculateBatch(currentClass.batch_id, { trigger: 'AUTO_CLASS_DELETE' });
    return { success: true };
  },

  updateClassPricing: async (classId, payload, options = {}) => {
    await ensureExaminationPricingSchema();

    const classFilter = '';
    const classParams = [classId];
    const currentClass = await runGet(`SELECT * FROM examination_classes WHERE id = ? `, classParams);
    if (!currentClass) {
      throw new Error('Class not found');
    }
    const batchParams = [currentClass.batch_id];
    const currentBatch = await runGet(
      `SELECT id, status FROM examination_batches WHERE id = ? `,
      batchParams
    );
    if (!currentBatch) {
      throw new Error('Batch not found');
    }
    assertBatchMutableForPricing(currentBatch.status, 'update class pricing');

    const userId = options.userId || 'System';
    const triggerSource = options.trigger || 'MANUAL_OVERRIDE';
    const canOverrideSuggestedCost = Boolean(options.canOverrideSuggestedCost);
    const isManualOverride = payload?.is_manual_override === undefined
      ? true
      : toBoolean(payload?.is_manual_override);

    if (isManualOverride && !canOverrideSuggestedCost) {
      await logPricingAuditEntry({
        batch_id: currentClass.batch_id,
        class_id: classId,
        user_id: userId,
        event_type: 'PERMISSION_DENIED',
        trigger_source: triggerSource,
        previous_cost_per_learner: toNumericValue(currentClass.price_per_learner) ?? 0,
        suggested_cost_per_learner: toNumericValue(currentClass.suggested_cost_per_learner) ?? 0,
        new_cost_per_learner: toNumericValue(payload?.cost_per_learner) ?? null,
        candidature: Number(currentClass.number_of_learners) || 0,
        previous_total_amount: toNumericValue(currentClass.total_price) ?? 0,
        details_json: {
          message: 'User attempted manual override without required permission.',
          class_id: classId
        }
      });
      throw new Error('You do not have permission to override the suggested cost per learner.');
    }

    if (isManualOverride) {
      const manualCost = toNumericValue(payload?.cost_per_learner);
      if (manualCost === null || manualCost <= 0) {
        throw new Error('Manual cost per learner must be greater than zero.');
      }
      const overrideReason = String(payload?.override_reason || '').trim();
      if (!overrideReason) {
        throw new Error('Override reason is required for manual cost changes.');
      }

      await runRun(
        `UPDATE examination_classes
         SET is_manual_override = 1,
             manual_cost_per_learner = ?,
             manual_override_reason = ?,
             manual_override_by = ?,
             manual_override_at = CURRENT_TIMESTAMP,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [manualCost, overrideReason, userId, classId]
      );
    } else {
      await runRun(
        `UPDATE examination_classes
         SET is_manual_override = 0,
             manual_cost_per_learner = NULL,
             manual_override_reason = NULL,
             manual_override_by = ?,
             manual_override_at = CURRENT_TIMESTAMP,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [userId, classId]
      );
    }

    await logPricingAuditEntry({
      batch_id: currentClass.batch_id,
      class_id: classId,
      user_id: userId,
      event_type: isManualOverride ? 'MANUAL_OVERRIDE' : 'MANUAL_OVERRIDE_RESET',
      trigger_source: triggerSource,
      previous_cost_per_learner: toNumericValue(currentClass.price_per_learner) ?? 0,
      suggested_cost_per_learner: toNumericValue(currentClass.suggested_cost_per_learner) ?? 0,
      new_cost_per_learner: isManualOverride
        ? (toNumericValue(payload?.cost_per_learner) ?? 0)
        : (toNumericValue(currentClass.suggested_cost_per_learner) ?? 0),
      candidature: Number(currentClass.number_of_learners) || 0,
      previous_total_amount: toNumericValue(currentClass.total_price) ?? 0,
      new_total_amount: isManualOverride
        ? (toNumericValue(payload?.cost_per_learner) ?? 0) * (Number(currentClass.number_of_learners) || 0)
        : toNumericValue(currentClass.calculated_total_cost) ?? 0,
      details_json: {
        class_id: classId,
        is_manual_override: isManualOverride,
        override_reason: payload?.override_reason || null
      }
    });

    await examinationService.calculateBatch(currentClass.batch_id, {
      trigger: isManualOverride ? 'MANUAL_OVERRIDE' : 'MANUAL_OVERRIDE_RESET',
      userId
    });

    return await examinationService.getBatchById(currentClass.batch_id);
  },

  getClassPricingHistory: async (classId, limit = 100) => {
    await ensureExaminationPricingSchema();
    const safeLimit = Math.max(1, Math.min(500, Number(limit) || 100));
    const whereClause = `WHERE class_id = ?`;
    const params = [classId];
    return await runQuery(
      `SELECT * FROM examination_pricing_audit
       ${whereClause}
       ORDER BY datetime(created_at) DESC
       LIMIT ?`,
      [...params, safeLimit]
    );
  },

  // --- Subjects ---
  createSubject: async (classId, data) => {
    const id = randomUUID();
    let { subject_name, name, pages, extra_copies, paper_size, orientation } = data;

    // Allow 'name' as alias for 'subject_name'
    if (!subject_name && name) subject_name = name;

    const subjectName = String(subject_name || '').trim();
    const parsedPages = Number(pages);
    const parsedExtraCopies = Number(extra_copies || 0);

    if (!subjectName) {
      throw new Error('Subject name is required');
    }
    if (!Number.isFinite(parsedPages) || parsedPages <= 0) {
      throw new Error('Pages must be greater than zero');
    }
    if (!Number.isFinite(parsedExtraCopies) || parsedExtraCopies < 0) {
      throw new Error('Extra copies cannot be negative');
    }

    // Validate class exists before creating subject
    const classFilter = '';
    const classParams = [classId];
    const cls = await runGet(`SELECT batch_id FROM examination_classes WHERE id = ? `, classParams);
    if (!cls) {
      throw new Error(`Class with ID ${classId} not found. Please create the class first.`);
    }

    await runRun(
      `INSERT INTO examination_subjects (id, class_id, subject_name, pages, extra_copies, paper_size, orientation)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [id, classId, subjectName, Math.floor(parsedPages), Math.floor(parsedExtraCopies), paper_size || 'A4', orientation || 'Portrait']
    );

    // Only trigger calculation if batch is not already finalized
    if (cls.batch_id) {
      const batchStatus = await runGet('SELECT status FROM examination_batches WHERE id = ?', [cls.batch_id]);
      if (batchStatus && batchStatus.status !== 'Finalized') {
        try {
          await examinationService.calculateBatch(cls.batch_id, { trigger: 'AUTO_SUBJECT_CREATE' });
        } catch (calcError) {
          console.error(`Failed to calculate batch ${cls.batch_id} after subject creation:`, calcError.message);
          // Don't throw - subject was created successfully, just calculation failed
        }
      }
    }

    return await runGet('SELECT * FROM examination_subjects WHERE id = ?', [id]);
  },

  updateSubject: async (id, data) => {
    const subjectFilter = '';
    const subjectParams = [id];
    const currentSubject = await runGet(`SELECT * FROM examination_subjects WHERE id = ? `, subjectParams);
    if (!currentSubject) {
      throw new Error('Subject not found');
    }

    let { subject_name, name, pages, extra_copies, paper_size, orientation } = data;

    if (!subject_name && name) subject_name = name;

    let fields = [];
    let params = [];
    if (subject_name !== undefined) {
      const subjectName = String(subject_name || '').trim();
      if (!subjectName) {
        throw new Error('Subject name cannot be empty');
      }
      fields.push('subject_name = ?');
      params.push(subjectName);
    }
    if (pages !== undefined) {
      const parsedPages = Number(pages);
      if (!Number.isFinite(parsedPages) || parsedPages <= 0) {
        throw new Error('Pages must be greater than zero');
      }
      fields.push('pages = ?');
      params.push(Math.floor(parsedPages));
    }
    if (extra_copies !== undefined) {
      const parsedExtraCopies = Number(extra_copies);
      if (!Number.isFinite(parsedExtraCopies) || parsedExtraCopies < 0) {
        throw new Error('Extra copies cannot be negative');
      }
      fields.push('extra_copies = ?');
      params.push(Math.floor(parsedExtraCopies));
    }
    if (paper_size) { fields.push('paper_size = ?'); params.push(paper_size); }
    if (orientation) { fields.push('orientation = ?'); params.push(orientation); }

    if (fields.length === 0) return await runGet('SELECT * FROM examination_subjects WHERE id = ?', [id]);

    params.push(id);
    await runRun(`UPDATE examination_subjects SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, params);

    const cls = await runGet('SELECT batch_id FROM examination_classes WHERE id = ?', [currentSubject.class_id]);
    if (cls?.batch_id) {
      await examinationService.calculateBatch(cls.batch_id, { trigger: 'AUTO_SUBJECT_UPDATE' });
    }

    return await runGet('SELECT * FROM examination_subjects WHERE id = ?', [id]);
  },

  deleteSubject: async (id) => {
    const subjectFilter = '';
    const subjectParams = [id];
    const currentSubject = await runGet(`SELECT * FROM examination_subjects WHERE id = ? `, subjectParams);
    if (!currentSubject) {
      return { success: true };
    }

    const cls = await runGet('SELECT batch_id FROM examination_classes WHERE id = ?', [currentSubject.class_id]);
    await runRun(`DELETE FROM examination_subjects WHERE id = ?${subjectDeleteClause}`, [id]);

    if (cls?.batch_id) {
      await examinationService.calculateBatch(cls.batch_id, { trigger: 'AUTO_SUBJECT_DELETE' });
    }

    return { success: true };
  },

  // --- Calculation Logic ---
  calculateBatch: async (batchId, options = {}) => {
    await ensureExaminationPricingSchema();

    const startedAt = Date.now();
    const trigger = String(options?.trigger || 'MANUAL').trim() || 'MANUAL';
    const userId = options?.userId || 'System';

    const batch = await examinationService.getBatchById(batchId);
    if (!batch) throw new Error('Batch not found');
    const defaultMaterialConfig = await resolveExamMaterialConfiguration();
    const {
      paperItem,
      tonerItem,
      paperUnitCost,
      tonerUnitCost,
      paperConversionRate,
      tonerPagesPerUnit
    } = await resolveMaterialOverridesFromOptions(options, defaultMaterialConfig);
    const activeAdjustments = Array.isArray(options?.adjustments)
      ? options.adjustments
      : await resolveEffectiveClassAdjustments();
    const marketAdjustmentSaleRef = `EXAM-BATCH-${batchId}`;
    const isPricingSnapshotLocked = toBoolean(batch?.pricing_lock_enabled);
    const lockedAdjustments = isPricingSnapshotLocked
      ? parseAdjustmentSnapshot(batch?.locked_adjustments_json)
      : null;
    const effectivePaperUnitCost = isPricingSnapshotLocked
      ? (pickPositiveNumber(batch?.locked_paper_unit_cost, paperUnitCost) ?? paperUnitCost)
      : paperUnitCost;
    const effectiveTonerUnitCost = isPricingSnapshotLocked
      ? (pickPositiveNumber(batch?.locked_toner_unit_cost, tonerUnitCost) ?? tonerUnitCost)
      : tonerUnitCost;
    const effectivePaperConversionRate = isPricingSnapshotLocked
      ? (pickPositiveNumber(batch?.locked_conversion_rate, paperConversionRate) ?? paperConversionRate)
      : paperConversionRate;
    const effectiveTonerPagesPerUnit = pickPositiveNumber(
      options?.tonerPagesPerUnit ?? options?.toner_pages_per_unit,
      tonerPagesPerUnit,
      DEFAULT_TONER_PAGES_PER_UNIT
    ) ?? DEFAULT_TONER_PAGES_PER_UNIT;
    const effectiveAdjustments = isPricingSnapshotLocked && Array.isArray(lockedAdjustments)
      ? lockedAdjustments
      : activeAdjustments;
    const roundingConfig = resolveBatchRoundingConfig(batch, options);

    let batchTotalAmount = 0;
    let batchMaterialTotal = 0;
    let batchAdjustmentTotal = 0;
    let batchMarketAdjustmentTotal = 0;
    let batchRoundingAdjustmentTotal = 0;
    let batchLearnerCount = 0;
    let calculationDuration = 0;

    await runRun('BEGIN TRANSACTION');
    try {
      // Keep a single adjustment transaction snapshot per batch recalculation.
      await runRun('DELETE FROM market_adjustment_transactions WHERE sale_id = ?', [marketAdjustmentSaleRef]);

      // Ensure the synthetic auto-rounding adjustment exists so the FK
      // constraint on market_adjustment_transactions.adjustment_id is satisfied.
      await runRun(`INSERT OR IGNORE INTO market_adjustments (id, name, type, value, applies_to, is_system_default, is_active, active, adjustment_category, sort_order)
                    VALUES ('auto-rounding', 'Rounding Adjustment', 'FIXED', 0, 'COST', 1, 0, 0, 'Custom', 9999)`);

      for (const cls of batch.classes || []) {
        const learners = Math.max(1, Math.floor(Number(cls.number_of_learners) || 0));
        let classTotalSheets = 0;
        let classTotalPages = 0;

        for (const sub of cls.subjects || []) {
          const subjectConsumption = pricingEngine.calculateSubjectConsumption(sub, learners);
          classTotalSheets += subjectConsumption.totalSheets;
          classTotalPages += subjectConsumption.totalPages;

          await runRun(
            `UPDATE examination_subjects
             SET total_sheets = ?,
                 total_pages = ?,
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = ?`,
            [subjectConsumption.totalSheets, subjectConsumption.totalPages, sub.id]
          );
        }

        const paperQuantity = classTotalSheets / effectivePaperConversionRate;
        const tonerQuantity = classTotalPages / effectiveTonerPagesPerUnit;
        const paperCost = pricingEngine.roundCurrency(paperQuantity * effectivePaperUnitCost);
        const tonerCost = pricingEngine.roundCurrency(tonerQuantity * effectiveTonerUnitCost);
        const totalBomCost = pricingEngine.roundCurrency(paperCost + tonerCost);
        const classAdjustmentBreakdown = buildClassAdjustmentBreakdown(totalBomCost, classTotalPages, effectiveAdjustments);
        let roundingAdjustmentRow = null;

        const marketAdjustmentCost = pricingEngine.roundCurrency(classAdjustmentBreakdown.totalAdjustmentCost);
        let totalAdjustments = marketAdjustmentCost;
        let expectedTotal = pricingEngine.roundCurrency(totalBomCost + totalAdjustments);
        
        // Track separate market adjustment and rounding amounts for proper data separation
        const marketAdjustmentTotal = marketAdjustmentCost;
        let roundingAdjustmentTotal = 0;
        let expectedFeePerLearner = learners > 0
          ? pricingEngine.roundCurrency(expectedTotal / learners)
          : 0;
        let roundingTotalForClass = 0;

        // Apply rounding only when there are active market adjustments.
        // This prevents showing non-zero adjustment totals caused solely by rounding.
        const shouldApplyRoundingAdjustment = classAdjustmentBreakdown.totalAdjustmentCost > 0;
        if (shouldApplyRoundingAdjustment) {
          const roundedFeePerLearner = applyBatchRounding(expectedFeePerLearner, roundingConfig);
          const roundingDiffPerLearner = pricingEngine.roundCurrency(roundedFeePerLearner - expectedFeePerLearner);
          if (roundingDiffPerLearner > 0) {
            roundingTotalForClass = pricingEngine.roundCurrency(roundingDiffPerLearner * learners);
            batchRoundingAdjustmentTotal += roundingTotalForClass;
            totalAdjustments = pricingEngine.roundCurrency(totalAdjustments + roundingTotalForClass);
            expectedTotal = pricingEngine.roundCurrency(totalBomCost + totalAdjustments);
            expectedFeePerLearner = roundedFeePerLearner;
            // Update the rounding adjustment total for this class
            roundingAdjustmentTotal = roundingTotalForClass;
            roundingAdjustmentRow = {
              adjustmentId: 'auto-rounding',
              adjustmentName: 'Rounding Adjustment',
              adjustmentType: 'FIXED',
              adjustmentValue: roundingTotalForClass,
              baseAmount: expectedTotal,
              originalAmount: roundingTotalForClass,
              redistributedAmount: roundingTotalForClass,
              allocationRatio: 0,
              sequenceNo: classAdjustmentBreakdown.rows.length + 1
            };

            await runRun(
              `INSERT INTO market_adjustment_transactions (
                id, sale_id, item_id, adjustment_id, adjustment_name, adjustment_type,
                adjustment_value, base_amount, calculated_amount, quantity, unit_amount, status, notes
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              [
                randomUUID(),
                marketAdjustmentSaleRef,
                cls.id,
                'auto-rounding',
                'Rounding Adjustment',
                'FIXED',
                roundingTotalForClass,
                expectedTotal,
                roundingTotalForClass,
                learners,
                learners > 0 ? roundingDiffPerLearner : 0,
                'Active',
                `Examination batch ${batchId}, class ${cls.class_name}, trigger ${trigger}`
              ]
            );
          }
        }

        const previousCostPerLearner = toNumericValue(cls.price_per_learner) ?? 0;
        const previousTotalPrice = toNumericValue(cls.total_price) ?? 0;
        const requestedManualOverride = Number(cls.is_manual_override || 0) === 1;
        const manualCostPerLearner = toNumericValue(cls.manual_cost_per_learner);
        const hasValidManualOverride = manualCostPerLearner !== null && manualCostPerLearner > 0;
        const isManualOverride = requestedManualOverride && hasValidManualOverride;

        if (requestedManualOverride && !hasValidManualOverride) {
          await runRun(
            `UPDATE examination_classes
             SET is_manual_override = 0,
                 manual_cost_per_learner = NULL,
                 manual_override_reason = NULL,
                 manual_override_by = ?,
                 manual_override_at = CURRENT_TIMESTAMP
             WHERE id = ?`,
            [userId, cls.id]
          );
        }

        const finalCostPerLearner = isManualOverride
          ? pricingEngine.roundCurrency(manualCostPerLearner)
          : expectedFeePerLearner;
        const finalClassTotal = pricingEngine.roundCurrency(finalCostPerLearner * learners);
        const adjustmentDeltaPercent = isManualOverride
          ? pricingEngine.calculatePercentageDifference(finalCostPerLearner, expectedFeePerLearner)
          : 0;

        // Track the manual override delta as a separate financial line item.
        // This ensures the delta is visible in breakdowns and reports rather than
        // silently absorbed into the total.
        const manualOverrideAmount = isManualOverride
          ? pricingEngine.roundCurrency(finalClassTotal - expectedTotal)
          : 0;

        // Calculate the three critical financial metrics
        const finalFeePerLearner = finalCostPerLearner;
        const liveTotalPreview = finalClassTotal;
        const financialMetricsSource = isManualOverride ? 'MANUAL_OVERRIDE' : 'SYSTEM_CALCULATION';
        // Include any rounding adjustment row in the persisted class adjustments.
        // This ensures that rounding adjustments are captured in the adjustment snapshots
        // and therefore reflected in the batch-level rounding totals.
        const classAdjustmentRows = roundingAdjustmentRow
          ? [...classAdjustmentBreakdown.rows, roundingAdjustmentRow]
          : classAdjustmentBreakdown.rows;

        await persistClassAdjustmentRows({
          batchId,
          classId: cls.id,
          rows: classAdjustmentRows,
          source: isManualOverride ? 'MANUAL_OVERRIDE' : 'SYSTEM'});

        await runRun(
           `UPDATE examination_classes
            SET suggested_cost_per_learner = ?,
                calculated_total_cost = ?,
                material_total_cost = ?,
                adjustment_total_cost = ?,
                market_adjustment_total = ?,
                rounding_adjustment = ?,
                manual_override_amount = ?,
                adjustment_delta_percent = ?,
                price_per_learner = ?,
                total_price = ?,
                cost_last_calculated_at = CURRENT_TIMESTAMP,
                updated_at = CURRENT_TIMESTAMP,
                expected_fee_per_learner = ?,
                final_fee_per_learner = ?,
                live_total_preview = ?,
                financial_metrics_source = ?,
                financial_metrics_updated_at = CURRENT_TIMESTAMP,
                financial_metrics_updated_by = ?
            WHERE id = ?`,
          [
                expectedFeePerLearner,
                expectedTotal,
                totalBomCost,
                totalAdjustments,
                marketAdjustmentTotal,
                roundingAdjustmentTotal,
                manualOverrideAmount,
                adjustmentDeltaPercent,
                finalCostPerLearner,
                finalClassTotal,
                expectedFeePerLearner,
                finalFeePerLearner,
                liveTotalPreview,
                financialMetricsSource,
                userId,
                cls.id]
        );

        for (const adjustmentRow of classAdjustmentBreakdown.rows) {
          await runRun(
            `INSERT INTO market_adjustment_transactions (
              id, sale_id, item_id, adjustment_id, adjustment_name, adjustment_type,
              adjustment_value, base_amount, calculated_amount, quantity, unit_amount, status, notes
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              randomUUID(),
              marketAdjustmentSaleRef,
              cls.id,
              adjustmentRow.adjustmentId,
              adjustmentRow.adjustmentName,
              adjustmentRow.adjustmentType,
              adjustmentRow.adjustmentValue,
              adjustmentRow.baseAmount,
              adjustmentRow.originalAmount,
              learners,
              learners > 0
                ? pricingEngine.roundCurrency((toNumericValue(adjustmentRow.originalAmount) ?? 0) / learners)
                : 0,
              'Active',
              `Examination batch ${batchId}, class ${cls.class_name}, trigger ${trigger}`
            ]
          );
        }

        await logPricingAuditEntry({
          batch_id: batchId,
          class_id: cls.id,
          user_id: userId,
          event_type: isManualOverride ? 'AUTO_RECALC' : 'SYSTEM_CALCULATION',
          trigger_source: trigger,
          previous_cost_per_learner: previousCostPerLearner,
          suggested_cost_per_learner: expectedFeePerLearner,
          new_cost_per_learner: finalCostPerLearner,
          candidature: learners,
          previous_total_amount: previousTotalPrice,
          new_total_amount: finalClassTotal,
          percentage_difference: isManualOverride ? adjustmentDeltaPercent : 0,
          details_json: {
            class_name: cls.class_name,
            class_id: cls.id,
            total_sheets: classTotalSheets,
            total_pages: classTotalPages,
            calculated_total_sheets: classTotalSheets,
            calculated_total_pages: classTotalPages,
            paper_quantity: paperQuantity,
            toner_quantity: tonerQuantity,
            paper_conversion_rate: effectivePaperConversionRate,
            toner_pages_per_unit: effectiveTonerPagesPerUnit,
            paper_item_id: paperItem?.id || null,
            toner_item_id: tonerItem?.id || null,
            paper_unit_cost: effectivePaperUnitCost,
            toner_unit_cost: effectiveTonerUnitCost,
            material_cost: totalBomCost,
            adjustment_total: totalAdjustments,
            is_manual_override: Boolean(isManualOverride),
            pricing_lock_enabled: isPricingSnapshotLocked,
            pricing_locked_at: batch?.pricing_locked_at || null,
            pricing_lock_reason: batch?.pricing_lock_reason || null
          }
        });

        batchTotalAmount += finalClassTotal;
        batchMaterialTotal += totalBomCost;
        batchAdjustmentTotal += totalAdjustments;
        batchLearnerCount += learners;
        
        // Track separate market adjustment and rounding totals at batch level
        batchMarketAdjustmentTotal += marketAdjustmentTotal;
        batchRoundingAdjustmentTotal += roundingAdjustmentTotal;
      }

      calculationDuration = Date.now() - startedAt;
      const overallSuggestedCostPerLearner = batchLearnerCount > 0
        ? pricingEngine.roundCurrency(batchTotalAmount / batchLearnerCount)
        : 0;
      const roundedBatchTotalAmount = pricingEngine.roundCurrency(batchTotalAmount);
      const roundedBatchMaterialTotal = pricingEngine.roundCurrency(batchMaterialTotal);
      const roundedBatchAdjustmentTotal = pricingEngine.roundCurrency(batchAdjustmentTotal);
      const normalizedBatchRoundingAdjustmentTotal = pricingEngine.roundCurrency(batchRoundingAdjustmentTotal);
      const adjustmentTracking = await summarizeBatchAdjustmentTracking(batchId);
      const hasAdjustmentSnapshots = adjustmentTracking.snapshots.length > 0;
      const normalizedAdjustmentSnapshots = hasAdjustmentSnapshots
        ? adjustmentTracking.snapshots
        : (roundedBatchAdjustmentTotal > 0
          ? [
            {
              id: 'calculated-adjustments',
              name: 'Calculated Adjustments',
              type: 'FIXED',
              total_amount: roundedBatchAdjustmentTotal,
              application_count: 0,
              is_rounding: false
            }
          ]
          : []);
      const persistedRoundingAdjustmentTotal = hasAdjustmentSnapshots
        ? pricingEngine.roundCurrency(adjustmentTracking.roundingAdjustmentTotal)
        : normalizedBatchRoundingAdjustmentTotal;
      const preRoundingTotalAmount = pricingEngine.roundCurrency(
        Math.max(0, roundedBatchTotalAmount - persistedRoundingAdjustmentTotal)
      );

      await runRun(
        `UPDATE examination_batches
         SET total_amount = ?,
             calculated_material_total = ?,
             calculated_adjustment_total = ?,
             market_adjustment_total = ?,
             adjustment_snapshots_json = ?,
             rounding_adjustment_total = ?,
             pre_rounding_total_amount = ?,
             rounding_method = ?,
             rounding_value = ?,
             expected_candidature = ?,
             calculated_cost_per_learner = ?,
             status = ?,
             calculation_trigger = ?,
             calculation_duration_ms = ?,
             last_calculated_at = CURRENT_TIMESTAMP,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [roundedBatchTotalAmount, roundedBatchMaterialTotal, roundedBatchAdjustmentTotal, pricingEngine.roundCurrency(batchMarketAdjustmentTotal), serializeBatchAdjustmentSnapshots(normalizedAdjustmentSnapshots), persistedRoundingAdjustmentTotal, preRoundingTotalAmount, roundingConfig.persistedMethod, roundingConfig.persistedValue, batchLearnerCount, overallSuggestedCostPerLearner, batchWorkflow.resolveStatusAfterCalculation(batch.classes?.length || 0), trigger, calculationDuration, batchId]
      );

      await runRun('COMMIT');
    } catch (error) {
      try {
        await runRun('ROLLBACK');
      } catch (rollbackError) {
        console.warn('[Examination] Failed to rollback calculation transaction:', rollbackError?.message || rollbackError);
      }
      throw error;
    }

    if (userId && userId !== 'System') {
      try {
        await writeAuditLog({
          userId,
          action: 'CALCULATE',
          entityType: 'ExaminationBatch',
          entityId: batchId,
          details: `Calculated examination batch via ${trigger}. Total ${pricingEngine.roundCurrency(batchTotalAmount)} in ${calculationDuration} ms.`
        });
      } catch (auditError) {
        console.warn('[Examination] Failed to write batch calculation audit log:', auditError?.message || auditError);
      }
    }

    return await examinationService.getBatchById(batchId);
  },

  calculateClassPreview: async (classId, options = {}) => {
    await ensureExaminationPricingSchema();

    const cls = await examinationService.getClassById(classId);
    if (!cls) throw new Error('Class not found');
    const batchParams = [cls.batch_id];
    const batch = await runGet(`SELECT id, rounding_method, rounding_value FROM examination_batches WHERE id = ? `, batchParams);

    const defaultMaterialConfig = await resolveExamMaterialConfiguration();
    const {
      paperItem,
      tonerItem,
      paperUnitCost,
      tonerUnitCost,
      paperConversionRate,
      tonerPagesPerUnit
    } = await resolveMaterialOverridesFromOptions(options, defaultMaterialConfig);

    const effectivePaperUnitCost = paperUnitCost;
    const effectiveTonerUnitCost = tonerUnitCost;
    const effectiveConversionRate = paperConversionRate;
    const effectiveTonerPagesPerUnit = tonerPagesPerUnit;

    const activeAdjustments = await resolveEffectiveClassAdjustments();
    const roundingConfig = resolveBatchRoundingConfig(batch, options);
    const learners = Math.max(1, Math.floor(Number(cls.number_of_learners) || 0));

    let classTotalSheets = 0;
    let classTotalPages = 0;

    for (const sub of cls.subjects || []) {
      const subjectConsumption = pricingEngine.calculateSubjectConsumption(sub, learners);
      classTotalSheets += subjectConsumption.totalSheets;
      classTotalPages += subjectConsumption.totalPages;
    }

    const paperQuantity = classTotalSheets / effectiveConversionRate;
    const tonerQuantity = classTotalPages / effectiveTonerPagesPerUnit;
    const paperCost = pricingEngine.roundCurrency(paperQuantity * effectivePaperUnitCost);
    const tonerCost = pricingEngine.roundCurrency(tonerQuantity * effectiveTonerUnitCost);
    const totalBomCost = pricingEngine.roundCurrency(paperCost + tonerCost);

    const classAdjustmentBreakdown = buildClassAdjustmentBreakdown(totalBomCost, classTotalPages, activeAdjustments);

    let totalAdjustments = pricingEngine.roundCurrency(classAdjustmentBreakdown.totalAdjustmentCost);
    let expectedTotal = pricingEngine.roundCurrency(totalBomCost + totalAdjustments);
    let expectedFeePerLearner = learners > 0
      ? pricingEngine.roundCurrency(expectedTotal / learners)
      : 0;

    const applyRoundingRaw = options?.applyRounding ?? options?.apply_rounding;
    const applyPreviewRounding = applyRoundingRaw === undefined ? true : toBoolean(applyRoundingRaw);

    // Apply rounding only when explicitly enabled for preview and there are active adjustments.
    const shouldApplyPreviewRounding = applyPreviewRounding && classAdjustmentBreakdown.totalAdjustmentCost > 0;
    if (shouldApplyPreviewRounding) {
      const roundedFeePerLearner = applyBatchRounding(expectedFeePerLearner, roundingConfig);
      const roundingDiffPerLearner = pricingEngine.roundCurrency(roundedFeePerLearner - expectedFeePerLearner);
      if (roundingDiffPerLearner > 0) {
        const roundingTotalForClass = pricingEngine.roundCurrency(roundingDiffPerLearner * learners);
        totalAdjustments = pricingEngine.roundCurrency(totalAdjustments + roundingTotalForClass);
        expectedTotal = pricingEngine.roundCurrency(totalBomCost + totalAdjustments);
        expectedFeePerLearner = roundedFeePerLearner;
      }
    }

    return {
      classId,
      className: cls.class_name,
      learners,
      totalSheets: classTotalSheets,
      totalPages: classTotalPages,
      paperQuantity,
      tonerQuantity,
      paperCost,
      tonerCost,
      paperItemId: paperItem?.id || null,
      tonerItemId: tonerItem?.id || null,
      paperUnitCost: effectivePaperUnitCost,
      tonerUnitCost: effectiveTonerUnitCost,
      paperConversionRate: effectiveConversionRate,
      tonerPagesPerUnit: effectiveTonerPagesPerUnit,
      totalBomCost,
      totalAdjustments,
      totalCost: expectedTotal,
      expectedFeePerLearner,
      materialTotalCost: totalBomCost,
      adjustmentTotalCost: totalAdjustments,
      calculatedTotalCost: expectedTotal,
      roundingMethod: roundingConfig.persistedMethod,
      roundingValue: roundingConfig.persistedValue,
      adjustmentBreakdown: classAdjustmentBreakdown.rows || []
    };
  },

  approveBatch: async (batchId, userId = 'System') => {
    await ensureExaminationPricingSchema();
    const batch = await examinationService.getBatchById(batchId);
    if (!batch) throw new Error('Batch not found');
    batchWorkflow.assertCanApproveBatch(batch.status);

    const {
      paperItem,
      tonerItem,
      paperUnitCost,
      tonerUnitCost,
      paperConversionRate
    } = await resolveExamMaterialConfiguration();

    const deductions = batchWorkflow.calculateApprovalMaterialDeductions({
      classes: batch.classes || [],
      paperItem,
      tonerItem,
      paperConversionRate,
      tonerPagesPerUnit: TONER_PAGES_PER_KG,
      paperUnitCost,
      tonerUnitCost,
      calculateSubjectConsumption: pricingEngine.calculateSubjectConsumption
    });

    const warnings = [];

    await runRun('BEGIN TRANSACTION');
    try {
      for (const deduction of deductions) {
        const item = await runGet('SELECT * FROM inventory WHERE id = ?', [deduction.item_id]);
        if (!item) {
          console.warn(`Item ${deduction.item_id} not found in inventory during batch approval`);
          continue;
        }

        const previousQuantity = toNumericValue(item.quantity) ?? 0;
        const newQuantity = previousQuantity - deduction.quantity_required;
        const totalCost = pricingEngine.roundCurrency(deduction.quantity_required * deduction.unit_cost);

        if (newQuantity < 0) {
          warnings.push({
            item_id: deduction.item_id,
            item_name: item.name,
            available: previousQuantity,
            required: deduction.quantity_required,
            message: `Low inventory for ${item.name}: only ${previousQuantity} available, ${deduction.quantity_required} required. Stock will go negative.`
          });
        }

        await runRun(
          `UPDATE inventory
           SET quantity = ?,
               last_updated = CURRENT_TIMESTAMP
           WHERE id = ?`,
          [newQuantity, deduction.item_id]
        );

        await runRun(
          `INSERT INTO inventory_transactions (
            id, item_id, type, quantity, previous_quantity, new_quantity, 
            unit_cost, total_cost, reference, reference_id, reason, performed_by
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            randomUUID(),
            deduction.item_id,
            'OUT',
            deduction.quantity_required,
            previousQuantity,
            newQuantity,
            deduction.unit_cost,
            totalCost,
            'Examination Batch',
            batchId,
            `Batch Approval: ${batch.name}`,
            userId
          ]
        );
      }

      await runRun(
        'UPDATE examination_batches SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        ['Approved', batchId]
      );

      await writeAuditLog({
        userId,
        action: 'APPROVE',
        entityType: 'ExaminationBatch',
        entityId: batchId,
        details: warnings.length > 0 ? `Approved batch with inventory warnings: ${warnings.map(w => w.message).join('; ')}` : 'Approved batch'
      });

      await runRun('COMMIT');
    } catch (error) {
      try {
        await runRun('ROLLBACK');
      } catch (rollbackError) {
        console.warn('[Examination] Failed to rollback approval transaction:', rollbackError?.message || rollbackError);
      }
      throw error;
    }

    const approvedBatch = await examinationService.getBatchById(batchId);
    return { batch: approvedBatch, warnings };
  },

  generateInvoice: async (batchId, userId = 'System', options = {}) => {
    const requestedInvoiceNumber = options?.invoiceNumber || options?.invoice_number;
    await ensureExaminationInvoiceSchema();
    const batch = await examinationService.getBatchById(batchId);
    if (!batch) throw new Error('Batch not found');
    batchWorkflow.assertCanGenerateInvoice(batch.status);
    const invoiceDraft = examinationInvoiceAdapter.createInvoiceFromBatch({
      batchData: batch,
      idempotencyKey: options?.idempotencyKey || options?.idempotency_key
    });
    const idempotencyKey = invoiceDraft.idempotencyKey;

    const schoolLookupId = toNumericValue(batch.school_id);
    const school = schoolLookupId !== null
      ? await runGet('SELECT * FROM schools WHERE id = ?', [schoolLookupId])
      : null;
    let customer = null;
    try {
      const customerLookupId = String(batch.customer_id || batch.school_id || '').trim();
      customer = customerLookupId
        ? await runGet('SELECT * FROM customers WHERE id = ?', [customerLookupId])
        : null;
    } catch {
      customer = null;
    }
    const customerName = String(school?.name || customer?.name || `School ${batch.school_id || ''}`);
    const persistedSchoolId = school?.id ?? null;
    const persistedCustomerId = customer?.id ?? (String(batch.customer_id || batch.school_id || '').trim() || null);
    const lineItems = invoiceDraft.lineItems;
    const batchTotalAmount = invoiceDraft.batchTotalAmount;
    const persistedBatchTotalAmount = toNumericValue(batch.total_amount) ?? 0;
    if (Math.abs(persistedBatchTotalAmount - batchTotalAmount) > 0.01) {
      console.warn(
        `[Examination] Invoice total using governed line-item sum differs from batch total. ` +
        `batch_id=${batchId}, batch_total=${persistedBatchTotalAmount}, line_item_total=${batchTotalAmount}`
      );
    }

    const findExistingInvoice = async () => {
      if (idempotencyKey) {
        const params = [idempotencyKey];
        const byIdempotency = await runGet(
          `SELECT * FROM invoices WHERE idempotency_key = ? ORDER BY id DESC LIMIT 1`,
          params
        );
        if (byIdempotency) return byIdempotency;
      }

      const byOrigin = await runGet(
        `SELECT * FROM invoices WHERE origin_module = ? AND origin_batch_id = ? ORDER BY id DESC LIMIT 1`,
        [INVOICE_ORIGIN_EXAMINATION, String(batchId)]
      );
      if (byOrigin) return byOrigin;

      if (batch.invoice_id) {
        const byBatchRef = await runGet(
          `SELECT * FROM invoices WHERE (invoice_number = ? OR id = ?) ORDER BY id DESC LIMIT 1`,
          [batch.invoice_id, batch.invoice_id]
        );
        if (byBatchRef) return byBatchRef;
      }

      return null;
    };

    let existingInvoice = await findExistingInvoice();
    if (existingInvoice) {
      const existingInvoiceTotal = toNumericValue(existingInvoice.total_amount) ?? batchTotalAmount;
      const linkedLogicalInvoiceId = await ensureExaminationInvoiceDocumentLink({
        invoiceRow: existingInvoice,
        batch,
        customerName,
        lineItems,
        userId
      });
      await runRun(
        'UPDATE examination_batches SET status = ?, invoice_id = ?, total_amount = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [String(existingInvoice.status || '').toLowerCase() === 'paid' ? 'Paid' : 'Completed', String(linkedLogicalInvoiceId || existingInvoice.invoice_number || existingInvoice.id), existingInvoiceTotal, batchId]
      );

      return {
        success: true,
        invoiceId: Number(existingInvoice.id),
        created: false,
        idempotent: true,
        invoice: mapBackendInvoiceToFrontendPayload({
          invoiceRow: existingInvoice,
          batch,
          customerName,
          lineItems
        })
      };
    }

    if (batch.status === 'Completed') {
      throw new Error('Batch is already invoiced and no linked invoice record was found');
    }

    const dueDateIso = invoiceDraft.dueDateIso;
    const lineItemsJson = stringifyDetails(lineItems);
    const invoiceNote = invoiceDraft.invoiceNote;
    const documentTitle = invoiceDraft.documentTitle;

    let invoiceId = null;
    try {
      const invoiceResult = await runRun(
        `INSERT INTO invoices (
          school_id, customer_id, customer_name, sub_account_name,
          subtotal, total_amount, currency, status, due_date,
          invoice_number, origin_module, origin_batch_id, idempotency_key,
          line_items_json, notes, document_title,
          rounding_difference, rounding_method, adjustment_total, adjustment_snapshots_json,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
        [
              persistedSchoolId,
              persistedCustomerId,
              customerName,
              batch.sub_account_name || null,
              batchTotalAmount,
              batchTotalAmount,
              invoiceDraft.currency,
              'unpaid',
              dueDateIso,
              null,
              invoiceDraft.originModule,
              invoiceDraft.originBatchId,
              idempotencyKey || null,
              lineItemsJson,
              invoiceNote,
              documentTitle,
              toNumericValue(batch.rounding_adjustment_total) || 0,
              batch.rounding_method || 'nearest_50',
              toNumericValue(batch.calculated_adjustment_total) || 0,
              batch.adjustment_snapshots_json || '[]']
      );

      invoiceId = Number(invoiceResult.lastID);
      const logicalNumber = requestedInvoiceNumber || examinationInvoiceAdapter.buildExaminationLogicalInvoiceNumber(invoiceId);
      await runRun(
        'UPDATE invoices SET invoice_number = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [logicalNumber, invoiceId]
      );
    } catch (error) {
      const message = String(error?.message || '');
      // If error mentions document_title column missing, retry without it (backward compatibility)
      if (message.toLowerCase().includes('no such column: document_title')) {
        const invoiceResult = await runRun(
          `INSERT INTO invoices (
            school_id, customer_id, customer_name, sub_account_name,
            subtotal, total_amount, currency, status, due_date,
            invoice_number, origin_module, origin_batch_id, idempotency_key,
            line_items_json, notes, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
          [
                persistedSchoolId,
                persistedCustomerId,
                customerName,
                batch.sub_account_name || null,
                batchTotalAmount,
                batchTotalAmount,
                invoiceDraft.currency,
                'unpaid',
                dueDateIso,
                null,
                invoiceDraft.originModule,
                invoiceDraft.originBatchId,
                idempotencyKey || null,
                lineItemsJson,
                invoiceNote]
        );
        invoiceId = Number(invoiceResult.lastID);
        const logicalNumber = requestedInvoiceNumber || examinationInvoiceAdapter.buildExaminationLogicalInvoiceNumber(invoiceId);
        await runRun(
          'UPDATE invoices SET invoice_number = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
          [logicalNumber, invoiceId]
        );
      } else {
        const isIdempotencyConflict = message.toLowerCase().includes('idempotency_key')
          && message.toLowerCase().includes('unique');
        if (!isIdempotencyConflict) {
          throw error;
        }

        existingInvoice = await findExistingInvoice();
        if (!existingInvoice) {
          throw error;
        }

        invoiceId = Number(existingInvoice.id);
      }
    }

    const invoiceRow = await runGet('SELECT * FROM invoices WHERE id = ?', [invoiceId]);
    if (!invoiceRow) {
      throw new Error('Invoice creation failed: invoice not found after insert');
    }
    const linkedLogicalInvoiceId = await ensureExaminationInvoiceDocumentLink({
      invoiceRow,
      batch,
      customerName,
      lineItems,
      userId
    });

    await runRun(
      'UPDATE examination_batches SET status = ?, invoice_id = ?, total_amount = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      ['Completed', String(linkedLogicalInvoiceId || invoiceRow.invoice_number || invoiceId), batchTotalAmount, batchId]
    );

    // Audit Log
    await writeAuditLog({
      userId,
      action: 'GENERATE_INVOICE',
      entityType: 'ExaminationBatch',
      entityId: batchId,
      details: `Generated Invoice #${invoiceId}`
    });

    // Post ledger entries
    await postInvoiceLedger(invoiceId, invoiceRow);

    return {
      success: true,
      invoiceId: Number(invoiceId),
      created: true,
      idempotent: false,
      invoice: mapBackendInvoiceToFrontendPayload({
        invoiceRow,
        batch,
        customerName,
        lineItems
      })
    };
  },

  // --- New Methods for Examination Pricing Redesign ---

  getClassById: async (classId) => {
    const batchFilter = '';
    const params = [classId];
    const cls = await runGet(`SELECT * FROM examination_classes WHERE id = ? `, params);
    if (!cls) return null;

    // Attach subjects
    cls.subjects = await runQuery('SELECT * FROM examination_subjects WHERE class_id = ?', [classId]);

    return cls;
  },

  updateClassFinancialMetrics: async (classId, payload, { userId }) => {
    const classFilter = '';
    const classParams = [classId];
    const currentClass = await runGet(`SELECT * FROM examination_classes WHERE id = ? `, classParams);
    if (!currentClass) {
      throw new Error(`Class ${classId} not found`);
    }
    const batchParams = [currentClass.batch_id];
    const currentBatch = await runGet(
      `SELECT id, status FROM examination_batches WHERE id = ? `,
      batchParams
    );
    if (!currentBatch) {
      throw new Error(`Batch ${currentClass.batch_id} not found`);
    }
    assertBatchMutableForPricing(currentBatch.status, 'update class financial metrics');

    const fields = [];
    const params = [];
    let shouldStampCost = false;

    if (payload.expected_fee_per_learner !== undefined) {
      fields.push('expected_fee_per_learner = ?');
      params.push(payload.expected_fee_per_learner);
    }
    if (payload.final_fee_per_learner !== undefined) {
      fields.push('final_fee_per_learner = ?');
      params.push(payload.final_fee_per_learner);
    }
    if (payload.live_total_preview !== undefined) {
      fields.push('live_total_preview = ?');
      params.push(payload.live_total_preview);
    }
    if (payload.material_total_cost !== undefined) {
      fields.push('material_total_cost = ?');
      params.push(payload.material_total_cost);
      shouldStampCost = true;
    }
    if (payload.adjustment_total_cost !== undefined) {
      fields.push('adjustment_total_cost = ?');
      params.push(payload.adjustment_total_cost);
      shouldStampCost = true;
    }
    if (payload.market_adjustment_total !== undefined) {
      fields.push('market_adjustment_total = ?');
      params.push(payload.market_adjustment_total);
      shouldStampCost = true;
    }
    if (payload.rounding_adjustment !== undefined) {
      fields.push('rounding_adjustment = ?');
      params.push(payload.rounding_adjustment);
      shouldStampCost = true;
    }
    if (payload.calculated_total_cost !== undefined) {
      fields.push('calculated_total_cost = ?');
      params.push(payload.calculated_total_cost);
      shouldStampCost = true;
    }
    if (payload.financial_metrics_source !== undefined) {
      fields.push('financial_metrics_source = ?');
      params.push(payload.financial_metrics_source);
    }
    if (payload.financial_metrics_updated_by !== undefined) {
      fields.push('financial_metrics_updated_by = ?');
      params.push(payload.financial_metrics_updated_by);
    }
    if (payload.financial_metrics_updated_at !== undefined) {
      fields.push('financial_metrics_updated_at = ?');
      params.push(payload.financial_metrics_updated_at);
    }

    if (fields.length === 0) {
      return currentClass;
    }

    if (shouldStampCost) {
      fields.push('cost_last_calculated_at = CURRENT_TIMESTAMP');
    }

    params.push(classId);
    await runRun(
      `UPDATE examination_classes SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      params
    );
    await recalculateBatchFinancialTotalsFromClasses(currentClass.batch_id);

    // Audit log
    await writeAuditLog({
      userId,
      action: 'UPDATE_FINANCIAL_METRICS',
      entityType: 'ExaminationClass',
      entityId: classId,
      details: `Updated financial metrics: ${fields.join(', ')}`
    });

    return await runGet('SELECT * FROM examination_classes WHERE id = ?', [classId]);
  },

  syncPricingToBatchClasses: async (batchId, { settings, adjustments, triggerSource, userId }) => {
    const batch = await examinationService.getBatchById(batchId);
    if (!batch) {
      throw new Error(`Batch ${batchId} not found`);
    }
    assertBatchMutableForPricing(batch.status, 'sync pricing to classes');

    if (!batch.classes || batch.classes.length === 0) {
      return {
        success: true,
        classesUpdated: 0,
        errors: []
      };
    }

    const errors = [];
    let classesUpdated = 0;
    const timestamp = new Date().toISOString();
    const roundingConfig = resolveBatchRoundingConfig(batch, settings || {});

    for (const cls of batch.classes) {
      try {
        // Get pricing for this class from calculator (simplified version)
        const learners = Math.max(1, Math.floor(Number(cls.number_of_learners) || 0));

        // Calculate expected fee using the same logic as the calculator
        let totalSheets = 0;
        let totalPages = 0;

        for (const subject of cls.subjects || []) {
          const pages = Math.max(1, Math.floor(Number(subject.pages) || 0));
          const extraCopies = Math.max(0, Math.floor(Number(subject.extra_copies) || 0));
          const copies = learners + extraCopies;
          totalSheets += Math.ceil(pages / 2) * copies;
          totalPages += pages * copies;
        }

        const conversionRate = Math.max(1, Number(settings.conversion_rate) || 500);
        const tonerPagesPerUnit = Math.max(1, Number(settings.constants?.toner_pages_per_unit) || 20000);

        const paperQty = totalSheets / conversionRate;
        const tonerQty = totalPages / tonerPagesPerUnit;
        const paperCost = Math.round((paperQty * (Number(settings.paper_unit_cost) || 0)) * 100) / 100;
        const tonerCost = Math.round((tonerQty * (Number(settings.toner_unit_cost) || 0)) * 100) / 100;
        const totalBomCost = Math.round((paperCost + tonerCost) * 100) / 100;

        // Calculate adjustments
        const effectiveAdjustments = adjustments.length > 0
          ? adjustments
          : (settings.active_adjustments || []);

        let totalAdjustments = (effectiveAdjustments || []).reduce((sum, adjustment) => {
          const adjType = String(adjustment.type || '').toUpperCase();
          const numericValue = adjType === 'FIXED'
            ? (Number(adjustment.value) || 0)
            : (Number(adjustment.percentage ?? adjustment.value) || 0);

          const amount = adjType === 'FIXED'
            ? Math.round(numericValue * totalPages * 100) / 100
            : Math.round(totalBomCost * (numericValue / 100) * 100) / 100;

          return sum + amount;
        }, 0);

        let totalCost = Math.round((totalBomCost + totalAdjustments) * 100) / 100;
        let expectedFeePerLearner = learners > 0
          ? Math.round((totalCost / learners) * 100) / 100
          : 0;

        // Apply rounding only when there are active market adjustments.
        if (totalAdjustments > 0) {
          const roundedFeePerLearner = applyBatchRounding(expectedFeePerLearner, roundingConfig);
          const roundingDiffPerLearner = Math.round((roundedFeePerLearner - expectedFeePerLearner) * 100) / 100;

          if (roundingDiffPerLearner > 0) {
            // Update the expected fee to the rounded value
            expectedFeePerLearner = roundedFeePerLearner;
            // Calculate totalCost FROM the fee to ensure consistency (forward calculation)
            totalCost = Math.round(expectedFeePerLearner * learners * 100) / 100;
          }
        }

        // Determine final fee: preserve override if present
        const hasManualOverride = Boolean(Number(cls.is_manual_override || 0)) && cls.manual_cost_per_learner != null;
        const finalFeePerLearner = hasManualOverride
          ? Number(cls.manual_cost_per_learner)
          : expectedFeePerLearner;

        // CRITICAL FIX: Calculate liveTotalPreview FROM fee to ensure fee × learners = total
        // This prevents floating-point precision mismatch where total (calculated as fee × learners)
        // differs from the sum of BOM + adjustments due to rounding at intermediate steps.
        const liveTotalPreview = Math.round(finalFeePerLearner * learners * 100) / 100;

        // Update the class
        await runRun(
          `UPDATE examination_classes SET
            expected_fee_per_learner = ?,
            final_fee_per_learner = ?,
            live_total_preview = ?,
            material_total_cost = ?,
            adjustment_total_cost = ?,
            calculated_total_cost = ?,
            financial_metrics_source = ?,
            financial_metrics_updated_by = ?,
            financial_metrics_updated_at = ?,
            cost_last_calculated_at = CURRENT_TIMESTAMP,
            updated_at = CURRENT_TIMESTAMP
          WHERE id = ?`,
          [
                expectedFeePerLearner,
                finalFeePerLearner,
                liveTotalPreview,
                totalBomCost,
                totalAdjustments,
                totalCost,
                triggerSource,
                userId,
                timestamp,
                cls.id]
        );

        classesUpdated++;
      } catch (error) {
        errors.push({
          classId: cls.id,
          error: error.message
        });
      }
    }
    if (classesUpdated > 0) {
      await recalculateBatchFinancialTotalsFromClasses(batchId);
    }

    // Audit log
    await writeAuditLog({
      userId,
      action: 'SYNC_PRICING_TO_BATCH',
      entityType: 'ExaminationBatch',
      entityId: batchId,
      details: `Synced pricing to ${classesUpdated} classes`
    });

    return {
      success: errors.length === 0,
      classesUpdated,
      errors
    };
  },
  getNotifications: async (userId, limit = 50) => {
    await ensureNotificationSchema();
    if (!userId) return [];
    const normalizedUserId = String(userId).trim();
    const normalizedLimit = Math.min(Math.max(Number.parseInt(String(limit), 10) || 50, 1), 1000);
    const params = [normalizedUserId, normalizedLimit];
    const rows = await runQuery(
      `SELECT * FROM examination_batch_notifications
       WHERE user_id = ?
       ORDER BY created_at DESC
       LIMIT ?`,
      params
    );
    return (rows || []).map(normalizeNotificationRow).filter(Boolean);
  },
  createNotification: async (notification = {}) => {
    await ensureNotificationSchema();
    const id = notification.id || randomUUID();
    const batchDetailsJson = stringifyDetails(notification.batch_details || notification.batchDetails || {});
    const deliveredAt = notification.delivered_at || new Date().toISOString();
    const createdAt = notification.created_at || new Date().toISOString();
    const expiresAt = notification.expires_at || null;
    const isRead = notification.is_read ? 1 : 0;
    const readAt = notification.read_at || null;

    await runRun(
      `INSERT INTO examination_batch_notifications (
        id, batch_id, user_id, notification_type, title, message, priority,
        batch_details_json, is_read, read_at, delivered_at, created_at, expires_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        notification.batch_id || null,
        notification.user_id,
        notification.notification_type,
        notification.title || 'Notification',
        notification.message || '',
        notification.priority || 'Medium',
        batchDetailsJson,
        isRead,
        readAt,
        deliveredAt,
        createdAt,
        expiresAt
      ]
    );

    return normalizeNotificationRow({
      ...notification,
      id,
      batch_details_json: batchDetailsJson,
      is_read: isRead,
      read_at: readAt,
      delivered_at: deliveredAt,
      created_at: createdAt,
      expires_at: expiresAt
    });
  },
  markNotificationRead: async (notificationId, userId) => {
    await ensureNotificationSchema();
    if (!notificationId) return { success: false };
    if (userId) {
      await runRun(
        `UPDATE examination_batch_notifications
         SET is_read = 1, read_at = CURRENT_TIMESTAMP
         WHERE id = ? AND user_id = ?`,
        [notificationId, userId]
      );
    } else {
      await runRun(
        `UPDATE examination_batch_notifications
         SET is_read = 1, read_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [notificationId]
      );
    }
    return { success: true };
  },
  deleteNotification: async (notificationId, userId) => {
    await ensureNotificationSchema();
    if (!notificationId) return { success: false };
    if (userId) {
      await runRun(`DELETE FROM examination_batch_notifications WHERE id = ? AND user_id = ?`, [notificationId, userId]);
    } else {
      await runRun(`DELETE FROM examination_batch_notifications WHERE id = ?`, [notificationId]);
    }
    return { success: true };
  },
  createNotificationAuditLog: async (entry = {}) => {
    await ensureNotificationSchema();
    const id = entry.id || randomUUID();
    await runRun(
      `INSERT INTO notification_audit_logs (
        id, notification_id, user_id, action, details_json, ip_address, user_agent, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        entry.notification_id || null,
        entry.user_id,
        entry.action,
        stringifyDetails(entry.details_json || entry.details || {}),
        entry.ip_address || null,
        entry.user_agent || null,
        entry.created_at || new Date().toISOString()
      ]
    );
    return { ...entry, id };
  }
};

module.exports = {
  ...examinationService,
  ensureCoreExaminationSchema,
  ensureExaminationSyncSchema,
  ensureExaminationPricingSchema
};
