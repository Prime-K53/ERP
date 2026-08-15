import { ExaminationBatch, ExaminationClass, ExaminationPricingSettings, ExaminationSubject, Item, MarketAdjustment } from '../types';
import { dbService } from './db';
import { generateNextExaminationBatchNumber } from './documentNumberService';
import { calculateBatchPricing, PricingSettings } from '../utils/examinationPricingCalculator';
import { isExaminationDebugLoggingEnabled } from '../utils/debugFlags';
import { examinationDb } from './examinationDb';
import { newUlid } from '../utils/ulid';

export interface ExaminationInvoiceLineItem {
  id: string;
  itemId: string;
  name: string;
  sku: string;
  description?: string;
  category: string;
  type: 'Service' | 'Product' | 'Material' | 'Stationery';
  unit: string;
  minStockLevel: number;
  stock: number;
  reserved?: number;
  price: number;
  cost: number;
  quantity: number;
  total: number;
}

export interface ExaminationGeneratedInvoicePayload {
  id: string;
  backendInvoiceId: string;
  invoiceNumber: string;
  date: string;
  dueDate: string;
  customerId: string;
  customerName: string;
  subtotal?: number;
  totalAmount: number;
  paidAmount: number;
  status: 'Draft' | 'Unpaid' | 'Partial' | 'Paid' | 'Overdue' | 'Cancelled';
  items: ExaminationInvoiceLineItem[];
  batchId?: string;
  schoolName?: string;
  academicYear?: string;
  term?: string;
  examType?: string;
  classBreakdown?: Array<{
    className: string;
    subjects: string[];
    totalCandidates: number;
    chargePerLearner: number;
    classTotal: number;
  }>;
  materialTotal?: number;
  adjustmentTotal?: number;
  adjustmentSnapshots?: Array<{
    name: string;
    type: 'PERCENTAGE' | 'FIXED' | 'PERCENT';
    value: number;
    calculatedAmount: number;
  }>;
  preRoundingTotalAmount?: number;
  roundingDifference?: number;
  roundingMethod?: string;
  applyRounding?: boolean;
  documentTitle?: string;
  subAccountName?: string;
  notes?: string;
  reference?: string;
  currency?: string;
  origin_module?: string;
  origin_batch_id?: string;
}

const EXAM_PRICING_SETTINGS_KEY = 'examinationPricingSettings';
const DEFAULT_TONER_PAGES_PER_UNIT = 20000;
const DEFAULT_PAPER_CONVERSION_RATE = 500;
const examinationDebugLoggingEnabled = isExaminationDebugLoggingEnabled();

const debugExam = (...args: any[]) => {
  if (examinationDebugLoggingEnabled) {
    console.debug(...args);
  }
};

const generateLocalId = () => {
  // Phase 2: offline batch ids are globally-unique ULIDs so two devices can
  // never mint the same batch id while offline.
  return `local-${newUlid()}`;
};

const toIso = () => new Date().toISOString();
const isLocalBatchId = (id: string) => String(id || '').startsWith('local-');
const isUuidFormat = (id: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

const resolveBatchId = async (id: string): Promise<string> => {
  if (isLocalBatchId(id)) return id;
  if (isUuidFormat(id)) return id;
  const byNumber = await examinationBatchService.getBatchByNumber(id);
  if (!byNumber) throw new Error(`Batch not found: ${id}`);
  return byNumber.id;
};

const normalizeBatchForStorage = (
  batch: Partial<ExaminationBatch> & Record<string, any>,
  overrides: Record<string, any> = {}
): any => {
  const id = String(batch.id || batch.batch_id || generateLocalId());
  const createdAt = String(batch.created_at || batch.createdAt || toIso());
  const updatedAt = String(batch.updated_at || batch.updatedAt || createdAt);
  const batchNumber = String(batch.batch_number || batch.batchNumber || '').trim();
  return {
    ...batch,
    id,
    ...(batchNumber ? { batch_number: batchNumber, batchNumber } : {}),
    created_at: createdAt,
    updated_at: updatedAt,
    ...overrides,
    _lastModifiedAt: overrides._lastModifiedAt || updatedAt
  };
};

const getLocalBatches = async () => {
  let batches: any[] = [];
  try {
    const data = await examinationDb.examinationBatches.toArray();
    batches = Array.isArray(data) ? data.map((batch) => normalizeBatchForStorage(batch)) : [];
  } catch {
  }
  try {
    const syncedBatchRecords = await dbService.getAll<any>('examinationBatches');
    if (Array.isArray(syncedBatchRecords) && syncedBatchRecords.length > 0) {
      const syncedMap = new Map<string, any>();
      for (const b of syncedBatchRecords) syncedMap.set(String(b.id), normalizeBatchForStorage(b));
      for (const batch of batches) {
        const existing = syncedMap.get(String(batch.id));
        if (existing) syncedMap.set(String(batch.id), { ...existing, ...batch });
        else syncedMap.set(String(batch.id), batch);
      }
      batches = Array.from(syncedMap.values());
    }
  } catch {
  }
  return batches;
};

const storeLocalBatches = async (batches: Array<Record<string, any>>) => {
  const entries = batches.map((batch) => normalizeBatchForStorage(batch));
  try {
    await examinationDb.examinationBatches.bulkPut(entries);
  } catch {
  }
};



const storeLocalBatch = async (batch: Record<string, any>) => {
  const entry = normalizeBatchForStorage(batch);
  try {
    await examinationDb.examinationBatches.put(entry);
  } catch {
  }
  return entry;
};

const removeLocalBatch = async (id: string) => {
  try {
    await examinationDb.examinationBatches.delete(id);
  } catch {
  }
  try {
    await dbService.delete('examinationBatches', id);
  } catch {
  }
};

const enqueueOutbox = async (type: string, entityId: string, payload: Record<string, any>) => {
  const operation = type.endsWith(':delete')
    ? 'delete'
    : type.endsWith(':update')
      ? 'update'
      : 'create';

  // Single write path: business ops flow to the cloud only through the
  // durable sync queue → backend sync gateway (/api/sync/ops).
  try {
    const { durableSyncQueue } = await import('./durableSyncQueue');
    await durableSyncQueue.enqueue({
      table: 'examination_batches',
      recordId: entityId,
      operation: operation === 'delete' ? 'delete' : 'upsert' as const,
      payload: { ...payload, id: entityId },
    });
  } catch {
  }
};

const getLocalInventory = async () => {
  try {
    return await dbService.getAll<Item>('inventory');
  } catch {
    return [];
  }
};

const getLocalAdjustments = async () => {
  try {
    return await dbService.getAll<MarketAdjustment>('marketAdjustments');
  } catch {
    return [];
  }
};

const enrichPricingSettingsWithInventory = (
  input: Partial<PricingSettings>,
  inventory: Item[]
): PricingSettings => {
  const paperItem = inventory.find((item) => String(item.id) === String(input.paper_item_id || ''));
  const tonerItem = inventory.find((item) => String(item.id) === String(input.toner_item_id || ''));
  const conversionRate = Number(input.conversion_rate ?? (paperItem as any)?.conversionRate ?? DEFAULT_PAPER_CONVERSION_RATE) || DEFAULT_PAPER_CONVERSION_RATE;

  return {
    paper_item_id: input.paper_item_id ? String(input.paper_item_id) : null,
    paper_item_name: input.paper_item_name || paperItem?.name || null,
    paper_unit_cost: Number(input.paper_unit_cost ?? (paperItem as any)?.cost_per_unit ?? paperItem?.cost ?? paperItem?.cost_price ?? 0) || 0,
    toner_item_id: input.toner_item_id ? String(input.toner_item_id) : null,
    toner_item_name: input.toner_item_name || tonerItem?.name || null,
    toner_unit_cost: Number(input.toner_unit_cost ?? (tonerItem as any)?.cost_per_unit ?? tonerItem?.cost ?? tonerItem?.cost_price ?? 0) || 0,
    conversion_rate: conversionRate,
    adjustment_rate: input.adjustment_rate,
    profit_margin: input.profit_margin,
    constants: {
      toner_pages_per_unit: Number(input.constants?.toner_pages_per_unit ?? DEFAULT_TONER_PAGES_PER_UNIT) || DEFAULT_TONER_PAGES_PER_UNIT,
    },
    active_adjustments: Array.isArray(input.active_adjustments) ? input.active_adjustments : []
  };
};

const getLocalPricingSettings = async (): Promise<PricingSettings> => {
  const inventory = await getLocalInventory();
  const stored = await dbService.getSetting<Partial<PricingSettings>>(EXAM_PRICING_SETTINGS_KEY);
  return enrichPricingSettingsWithInventory(stored || {}, inventory);
};

const saveLocalPricingSettings = async (input: Partial<PricingSettings>) => {
  const inventory = await getLocalInventory();
  const existing = await dbService.getSetting<Partial<PricingSettings>>(EXAM_PRICING_SETTINGS_KEY);
  const next = enrichPricingSettingsWithInventory({ ...(existing || {}), ...(input || {}) }, inventory);
  await dbService.saveSetting(EXAM_PRICING_SETTINGS_KEY, next);
  return next;
};

const findLocalBatch = async (batchId: string) => {
  const localBatches = await getLocalBatches();
  const batch = localBatches.find((entry) => (
    String(entry.id) === String(batchId)
    || String(entry.batch_number || entry.batchNumber || '') === String(batchId)
  ));
  return batch ? normalizeBatchForStorage(batch) : null;
};

const updateLocalBatch = async (
  batchId: string,
  updater: (batch: Record<string, any>) => Record<string, any>
) => {
  const existing = await findLocalBatch(batchId);
  if (!existing) {
    throw new Error(`Batch not found in local storage: ${batchId}`);
  }

  const updatedAt = toIso();
  const updated = normalizeBatchForStorage(
    updater({
      ...existing,
      classes: Array.isArray(existing.classes) ? existing.classes.map((row: any) => ({ ...row })) : [],
      subjects: Array.isArray(existing.subjects) ? [...existing.subjects] : []
    }),
    {
      updated_at: updatedAt,
      updatedAt,
      _offline: true,
      _syncStatus: 'pending',
      _lastModifiedAt: updatedAt
    }
  );

  await storeLocalBatch(updated);
  await enqueueOutbox('examinationBatch:update', String(updated.id), updated);
  return updated;
};

const findLocalClassOwner = async (classId: string) => {
  const batches = await getLocalBatches();
  for (const batch of batches) {
    const classes = Array.isArray((batch as any).classes) ? (batch as any).classes : [];
    const classIndex = classes.findIndex((row: any) => String(row?.id) === String(classId));
    if (classIndex >= 0) {
      return { batch: normalizeBatchForStorage(batch), classIndex };
    }
  }
  return null;
};

const findLocalSubjectOwner = async (subjectId: string) => {
  const batches = await getLocalBatches();
  for (const batch of batches) {
    const classes = Array.isArray((batch as any).classes) ? (batch as any).classes : [];
    for (let classIndex = 0; classIndex < classes.length; classIndex += 1) {
      const subjects = Array.isArray(classes[classIndex]?.subjects) ? classes[classIndex].subjects : [];
      const subjectIndex = subjects.findIndex((row: any) => String(row?.id) === String(subjectId));
      if (subjectIndex >= 0) {
        return { batch: normalizeBatchForStorage(batch), classIndex, subjectIndex };
      }
    }
  }
  return null;
};

const calculateLocalBatchState = async (
  batch: Partial<ExaminationBatch> & Record<string, any>,
  explicitSettings?: Partial<PricingSettings>,
  explicitAdjustments?: MarketAdjustment[]
) => {
  const inventory = await getLocalInventory();
  const storedSettings = await getLocalPricingSettings();
  const settings = enrichPricingSettingsWithInventory(
    { ...storedSettings, ...(explicitSettings || {}) },
    inventory
  );
  const adjustments = explicitAdjustments || await getLocalAdjustments();
  const activeAdjustments = adjustments.filter((adjustment: any) => {
    const active = adjustment?.active ?? adjustment?.isActive ?? adjustment?.is_active ?? true;
    return active === true || active === 1 || active === '1';
  });
  const pricing = calculateBatchPricing(batch as ExaminationBatch, settings, activeAdjustments);
  return { inventory, settings, activeAdjustments, pricing };
};

const applyCalculatedBatchState = async (
  batch: Partial<ExaminationBatch> & Record<string, any>,
  explicitSettings?: Partial<PricingSettings>,
  explicitAdjustments?: MarketAdjustment[]
) => {
  const { settings, activeAdjustments, pricing } = await calculateLocalBatchState(batch, explicitSettings, explicitAdjustments);
  const pricingByClassId = new Map(pricing.classes.map((row) => [String(row.classId), row]));

  const classes = (Array.isArray(batch.classes) ? batch.classes : []).map((entry: any, index: number) => {
    const classId = String(entry?.id || `class-${index + 1}`);
    const pricingRow = pricingByClassId.get(classId);
    const learners = Math.max(1, Math.floor(Number(entry?.number_of_learners || 0)));
    const hasManualOverride = Boolean(Number(entry?.is_manual_override || 0)) && Number(entry?.manual_cost_per_learner ?? 0) > 0;
    const expectedFee = Number(pricingRow?.expectedFeePerLearner ?? entry?.expected_fee_per_learner ?? 0) || 0;
    const finalFee = hasManualOverride
      ? Number(entry?.manual_cost_per_learner ?? expectedFee)
      : Number(pricingRow?.finalFeePerLearner ?? expectedFee);
    const liveTotal = hasManualOverride
      ? Number((finalFee * learners).toFixed(2))
      : Number(pricingRow?.liveTotalPreview ?? finalFee * learners);

    return {
      ...entry,
      expected_fee_per_learner: expectedFee,
      suggested_cost_per_learner: expectedFee,
      final_fee_per_learner: finalFee,
      price_per_learner: finalFee,
      live_total_preview: liveTotal,
      manual_override_amount: hasManualOverride ? Number(((finalFee - expectedFee) * learners).toFixed(2)) : 0,
      material_total_cost: Number(pricingRow?.totalBomCost ?? entry?.material_total_cost ?? 0) || 0,
      adjustment_total_cost: Number(pricingRow?.totalAdjustments ?? entry?.adjustment_total_cost ?? 0) || 0,
      market_adjustment_total: Number(pricingRow?.marketAdjustmentTotal ?? entry?.market_adjustment_total ?? pricingRow?.totalAdjustments ?? 0) || 0,
      rounding_adjustment: Number(pricingRow?.roundingAdjustment ?? entry?.rounding_adjustment ?? 0) || 0,
      calculated_total_cost: Number(pricingRow?.totalCost ?? entry?.calculated_total_cost ?? 0) || 0,
      total_pages: Number(pricingRow?.totalPages ?? entry?.total_pages ?? 0) || 0,
      total_sheets: Number(pricingRow?.totalSheets ?? entry?.total_sheets ?? 0) || 0,
      updated_at: toIso()
    };
  });

  const totalAmount = Number(classes.reduce((sum: number, row: any) => sum + (Number(row?.live_total_preview) || 0), 0).toFixed(2));
  const materialTotal = Number(classes.reduce((sum: number, row: any) => sum + (Number(row?.material_total_cost) || 0), 0).toFixed(2));
  const adjustmentTotal = Number(classes.reduce((sum: number, row: any) => sum + (Number(row?.adjustment_total_cost) || 0), 0).toFixed(2));
  const totalLearners = classes.reduce((sum: number, row: any) => sum + Math.max(0, Math.floor(Number(row?.number_of_learners) || 0)), 0);

  return normalizeBatchForStorage({
    ...batch,
    classes,
    total_amount: totalAmount,
    pre_rounding_total_amount: totalAmount,
    material_total: materialTotal,
    adjustment_total: adjustmentTotal,
    total_students: totalLearners,
    expected_candidature: totalLearners,
    pricing_settings_snapshot: settings,
    active_adjustments_snapshot: activeAdjustments
  });
};

const summarizeBatchTotals = (batch: Partial<ExaminationBatch> & Record<string, any>) => {
  const classes = Array.isArray(batch.classes) ? batch.classes : [];
  const totalAmount = Number(classes.reduce((sum: number, row: any) => sum + (Number(row?.live_total_preview) || 0), 0).toFixed(2));
  const materialTotal = Number(classes.reduce((sum: number, row: any) => sum + (Number(row?.material_total_cost) || 0), 0).toFixed(2));
  const adjustmentTotal = Number(classes.reduce((sum: number, row: any) => sum + (Number(row?.adjustment_total_cost ?? row?.market_adjustment_total) || 0), 0).toFixed(2));
  const totalLearners = classes.reduce((sum: number, row: any) => sum + Math.max(0, Math.floor(Number(row?.number_of_learners) || 0)), 0);

  return {
    ...batch,
    total_amount: totalAmount,
    pre_rounding_total_amount: totalAmount,
    material_total: materialTotal,
    adjustment_total: adjustmentTotal,
    total_students: totalLearners,
    expected_candidature: totalLearners
  };
};

const buildLocalBomRows = async (batch: Partial<ExaminationBatch> & Record<string, any>) => {
  const { inventory, settings, pricing } = await calculateLocalBatchState(batch);
  const tonerPagesPerUnit = Number(settings.constants?.toner_pages_per_unit || DEFAULT_TONER_PAGES_PER_UNIT) || DEFAULT_TONER_PAGES_PER_UNIT;
  const paperItem = inventory.find((item) => String(item.id) === String(settings.paper_item_id || ''));
  const tonerItem = inventory.find((item) => String(item.id) === String(settings.toner_item_id || ''));
  const rows: Array<Record<string, any>> = [];

  pricing.classes.forEach((classRow) => {
    const classId = String(classRow.classId);
    const paperQuantity = Number((classRow.totalSheets / Math.max(1, Number(settings.conversion_rate) || DEFAULT_PAPER_CONVERSION_RATE)).toFixed(4));
    const tonerQuantity = Number((classRow.totalPages / Math.max(1, tonerPagesPerUnit)).toFixed(6));
    const paperTotal = Number((paperQuantity * Number(settings.paper_unit_cost || 0)).toFixed(2));
    const tonerTotal = Number((tonerQuantity * Number(settings.toner_unit_cost || 0)).toFixed(2));

    if (settings.paper_item_id) {
      rows.push({
        id: `local-bom-paper-${classId}`,
        class_id: classId,
        item_id: settings.paper_item_id,
        item_name: settings.paper_item_name || paperItem?.name || 'Paper',
        component_type: 'MATERIAL',
        quantity_required: paperQuantity,
        unit_cost: Number(settings.paper_unit_cost || 0),
        total_cost: paperTotal
      });
    }

    if (settings.toner_item_id) {
      rows.push({
        id: `local-bom-toner-${classId}`,
        class_id: classId,
        item_id: settings.toner_item_id,
        item_name: settings.toner_item_name || tonerItem?.name || 'Toner',
        component_type: 'MATERIAL',
        quantity_required: tonerQuantity,
        unit_cost: Number(settings.toner_unit_cost || 0),
        total_cost: tonerTotal
      });
    }

    if (Number(classRow.totalAdjustments) > 0) {
      rows.push({
        id: `local-bom-adjustment-${classId}`,
        class_id: classId,
        component_type: 'ADJUSTMENT',
        adjustment_id: `local-adjustment-${classId}`,
        adjustment_name: 'Pricing Adjustments',
        adjustment_type: 'PERCENTAGE',
        adjustment_value: 0,
        quantity_required: 1,
        unit_cost: Number(classRow.totalAdjustments),
        total_cost: Number(classRow.totalAdjustments)
      });
    }
  });

  return rows;
};

const buildLocalInvoicePayload = async (
  batch: Partial<ExaminationBatch> & Record<string, any>,
  payload?: { idempotencyKey?: string; invoiceNumber?: string }
): Promise<ExaminationGeneratedInvoicePayload> => {
  const invoiceId = `local-exam-invoice-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
  const invoiceNumber = payload?.invoiceNumber || `EXM-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
  const schools = await dbService.getAll<any>('schools').catch(() => []);
  const customers = await dbService.getAll<any>('customers').catch(() => []);
  const schoolId = String(batch.school_id || '').trim();
  const schoolName = (
    schools.find((school: any) => String(school?.id) === schoolId)?.name
    || customers.find((customer: any) => String(customer?.id) === schoolId)?.name
    || batch.schoolName
    || batch.name
    || 'Offline Customer'
  );

  const classes = Array.isArray(batch.classes) ? batch.classes : [];
  const items: ExaminationInvoiceLineItem[] = classes.map((cls: any, index: number) => {
    const learners = Math.max(1, Math.floor(Number(cls?.number_of_learners) || 0));
    const unitPrice = Number(cls?.final_fee_per_learner ?? cls?.expected_fee_per_learner ?? cls?.price_per_learner ?? 0) || 0;
    const total = Number(cls?.live_total_preview ?? (unitPrice * learners)) || 0;
    return {
      id: String(cls?.id || `${invoiceId}-${index + 1}`),
      itemId: String(cls?.id || `${invoiceId}-${index + 1}`),
      name: String(cls?.class_name || `Class ${index + 1}`),
      sku: `EXM-${String(cls?.id || index + 1)}`,
      description: `${Array.isArray(cls?.subjects) ? cls.subjects.length : 0} subject(s)`,
      category: 'Examination',
      type: 'Service',
      unit: 'learner',
      minStockLevel: 0,
      stock: 0,
      reserved: 0,
      price: Number(unitPrice.toFixed(2)),
      cost: Number((Number(cls?.material_total_cost ?? 0) / learners).toFixed(2)),
      quantity: learners,
      total: Number(total.toFixed(2))
    };
  });

  return {
    id: invoiceId,
    backendInvoiceId: invoiceId,
    invoiceNumber,
    date: toIso(),
    dueDate: new Date(Date.now() + (30 * 24 * 60 * 60 * 1000)).toISOString(),
    customerId: schoolId,
    customerName: schoolName,
    subtotal: Number(batch.pre_rounding_total_amount ?? batch.total_amount ?? items.reduce((sum, row) => sum + row.total, 0)),
    totalAmount: Number(batch.total_amount ?? items.reduce((sum, row) => sum + row.total, 0)),
    paidAmount: 0,
    status: 'Unpaid',
    items,
    batchId: String(batch.batch_number || batch.batchNumber || batch.id || ''),
    schoolName,
    academicYear: batch.academic_year,
    term: batch.term,
    examType: batch.exam_type,
    classBreakdown: classes.map((cls: any) => ({
      className: String(cls?.class_name || 'Class'),
      subjects: Array.isArray(cls?.subjects) ? cls.subjects.map((subject: any) => String(subject?.subject_name || subject?.name || 'Subject')) : [],
      totalCandidates: Math.max(0, Math.floor(Number(cls?.number_of_learners) || 0)),
      chargePerLearner: Number(cls?.final_fee_per_learner ?? cls?.expected_fee_per_learner ?? 0) || 0,
      classTotal: Number(cls?.live_total_preview ?? 0) || 0
    })),
    materialTotal: Number(batch.material_total ?? 0) || 0,
    adjustmentTotal: Number(batch.adjustment_total ?? 0) || 0,
    preRoundingTotalAmount: Number(batch.pre_rounding_total_amount ?? batch.total_amount ?? 0) || 0,
    roundingDifference: 0,
    roundingMethod: 'nearest_50',
    applyRounding: true,
    documentTitle: 'Examination Service Invoice',
    notes: `Generated offline from batch ${String(batch.batch_number || batch.batchNumber || batch.id || '')}`,
    reference: payload?.idempotencyKey,
    currency: String(batch.currency || 'MWK'),
    origin_module: 'examination',
    origin_batch_id: String(batch.batch_number || batch.batchNumber || batch.id || '')
  };
};

export const examinationBatchService = {
  _syncInProgress: false,

  async listBatches(): Promise<ExaminationBatch[]> {
    return (await getLocalBatches()) as ExaminationBatch[];
  },

  async getBatch(id: string): Promise<ExaminationBatch> {
    debugExam('[DEBUG] examinationBatchService.getBatch - Fetching batch:', { id, isLocal: isLocalBatchId(id) });

    if (isLocalBatchId(id)) {
      const local = await getLocalBatches();
      const found = local.find(batch => String(batch.id) === String(id));
      if (found) return found as ExaminationBatch;
      throw new Error('Local batch not found');
    }

    if (!isUuidFormat(id)) {
      debugExam('[DEBUG] examinationBatchService.getBatch - ID appears to be batch number, using lookup:', { id });
      const byNumber = await this.getBatchByNumber(id);
      if (byNumber) return byNumber;
      throw new Error(`Batch not found: ${id}`);
    }

    const local = await getLocalBatches();
    const found = local.find(batch => String(batch.id) === String(id));
    if (found) return found as ExaminationBatch;
    throw new Error(`Batch not found: ${id}`);
  },

  async createBatch(payload: Partial<ExaminationBatch>): Promise<ExaminationBatch> {
    const incomingBatchNumber = String((payload as any)?.batch_number || (payload as any)?.batchNumber || '').trim();
    const reservedBatchNumber = incomingBatchNumber || await generateNextExaminationBatchNumber();
    const payloadWithBatchNumber = {
      ...payload,
      batch_number: reservedBatchNumber,
      batchNumber: reservedBatchNumber
    };

    debugExam('[DEBUG] examinationBatchService.createBatch - Creating batch locally:', payloadWithBatchNumber);

    const now = toIso();
    const offlineBatch = normalizeBatchForStorage(
      {
        ...payloadWithBatchNumber,
        status: payload.status || 'Draft'
      },
      {
        _offline: true,
        _syncStatus: 'pending',
        _lastModifiedAt: now,
        created_at: now,
        updated_at: now
      }
    );

    await storeLocalBatch(offlineBatch);
    await enqueueOutbox('examinationBatch:create', String(offlineBatch.id), payloadWithBatchNumber as any);
    return offlineBatch as ExaminationBatch;
  },

  async updateBatch(id: string, payload: Partial<ExaminationBatch>): Promise<ExaminationBatch> {
    const local = await getLocalBatches();
    const existing = local.find(batch => String(batch.id) === String(id)) || {};
    const updated = normalizeBatchForStorage({
      ...existing,
      ...payload,
      id
    }, {
      _offline: true,
      _syncStatus: 'pending',
      _lastModifiedAt: toIso()
    });
    await storeLocalBatch(updated);
    await enqueueOutbox('examinationBatch:update', String(id), payload as any);
    return updated as ExaminationBatch;
  },

  async deleteBatch(id: string): Promise<void> {
    await removeLocalBatch(id);
    await enqueueOutbox('examinationBatch:delete', String(id), { id });
  },

  async deleteBatches(ids: string[]): Promise<{ success: string[]; failed: { id: string; error: string }[] }> {
    const results = { success: [] as string[], failed: [] as { id: string; error: string }[] };

    for (const id of ids) {
      try {
        await this.deleteBatch(id);
        results.success.push(id);
      } catch (error) {
        results.failed.push({
          id,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }

    return results;
  },

  async syncPendingBatches(): Promise<{ synced: number; failed: number; pending: number }> {
    // The durable queue is the single sync engine — a re-online event just
    // reports what is still pending for examination batches. The actual
    // drain is handled by backgroundSyncService via /api/sync/ops.
    try {
      const { durableSyncQueue } = await import('./durableSyncQueue');
      const { backgroundSyncService } = await import('./backgroundSyncService');
      backgroundSyncService.trigger();
      const pending = (await durableSyncQueue.getAll('pending')).filter(op => op.table === 'examination_batches').length;
      return { synced: 0, failed: 0, pending };
    } catch {
      return { synced: 0, failed: 0, pending: 0 };
    }
  },

  async calculateBatch(
    id: string,
    options?: {
      trigger?: string;
      paperId?: string;
      tonerId?: string;
      paperUnitCost?: number;
      tonerUnitCost?: number;
      paperConversionRate?: number;
      roundingMethod?: string;
      roundingValue?: number;
      adjustments?: MarketAdjustment[];
    }
  ): Promise<ExaminationBatch> {
    const localBatch = await this.getBatch(id);
    const recalculated = await applyCalculatedBatchState(localBatch as any, {
      paper_item_id: options?.paperId || null,
      toner_item_id: options?.tonerId || null,
      paper_unit_cost: options?.paperUnitCost,
      toner_unit_cost: options?.tonerUnitCost,
      conversion_rate: options?.paperConversionRate
    }, options?.adjustments);
    return updateLocalBatch(String((localBatch as any).id || id), () => ({
      ...recalculated,
      status: 'Calculated'
    })) as Promise<ExaminationBatch>;
  },

  async approveBatch(id: string): Promise<{ batch: ExaminationBatch; warnings?: Array<{ item_id: string; item_name: string; available: number; required: number; message: string }> }> {
    const batch = await updateLocalBatch(id, (b: any) => ({
      ...b,
      status: 'Approved'
    })) as unknown as ExaminationBatch;
    return { batch, warnings: [] };
  },

  async getCostBreakdown(id: string): Promise<any[]> {
    const batch = await this.getBatch(id);
    return buildLocalBomRows(batch as any);
  },

  async getBOM(id: string): Promise<any[]> {
    return this.getCostBreakdown(id);
  },

  async getAdjustmentMeta(): Promise<{ adjustments: MarketAdjustment[]; fetched_at: string }> {
    return {
      adjustments: await getLocalAdjustments(),
      fetched_at: toIso()
    };
  },

  async syncMarketAdjustments(payload: {
    adjustments: Array<Partial<MarketAdjustment> & Record<string, unknown>>;
    replaceMissing?: boolean;
    triggerRecalculate?: boolean;
  }): Promise<{
    success: boolean;
    upserted: number;
    changed: number;
    deactivated: number;
    checksum: string;
    item_count: number;
    recalculation?: any;
  }> {
    const adjustments = Array.isArray(payload.adjustments) ? payload.adjustments : [];
    await Promise.all(adjustments.map((adjustment) => dbService.put('marketAdjustments', {
      id: String(adjustment.id || generateLocalId()),
      name: String(adjustment.name || adjustment.displayName || 'Adjustment'),
      displayName: String(adjustment.displayName || adjustment.name || 'Adjustment'),
      type: String(adjustment.type || 'PERCENTAGE').toUpperCase() === 'FIXED' ? 'FIXED' : 'PERCENTAGE',
      value: Number(adjustment.value ?? adjustment.percentage ?? 0) || 0,
      percentage: Number(adjustment.percentage ?? adjustment.value ?? 0) || 0,
      active: adjustment.active ?? adjustment.isActive ?? true
    } as any)));
    return {
      success: true,
      upserted: adjustments.length,
      changed: adjustments.length,
      deactivated: 0,
      checksum: `offline-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      item_count: adjustments.length
    };
  },

  async syncInventoryItems(payload: {
    items: Array<(Partial<Item> & { id: string }) & Record<string, unknown>>;
    triggerRecalculate?: boolean;
  }): Promise<{
    success: boolean;
    upserted: number;
    changed: number;
    cost_changed: number;
    checksum: string;
    item_count: number;
    recalculation?: any;
  }> {
    const items = Array.isArray(payload.items) ? payload.items : [];
    return {
      success: true,
      upserted: items.length,
      changed: items.length,
      cost_changed: 0,
      checksum: `offline-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      item_count: items.length
    };
  },

  async getSyncHealth(): Promise<{
    checked_at: string;
    ok: boolean;
    entities: Record<string, {
      last_synced_at: string | null;
      state_checksum: string | null;
      backend_checksum: string;
      state_count: number;
      backend_count: number;
      drift: boolean;
    }>;
  }> {
    const [batches, adjustments, inventory] = await Promise.all([
      getLocalBatches(),
      getLocalAdjustments(),
      getLocalInventory()
    ]);
    return {
      checked_at: toIso(),
      ok: true,
      entities: {
        examinationBatches: {
          last_synced_at: null,
          state_checksum: 'offline-local-first',
          backend_checksum: 'offline-disabled',
          state_count: batches.length,
          backend_count: 0,
          drift: false
        },
        marketAdjustments: {
          last_synced_at: null,
          state_checksum: 'offline-local-first',
          backend_checksum: 'offline-disabled',
          state_count: adjustments.length,
          backend_count: 0,
          drift: false
        },
        inventoryItems: {
          last_synced_at: null,
          state_checksum: 'offline-local-first',
          backend_checksum: 'offline-disabled',
          state_count: inventory.length,
          backend_count: 0,
          drift: false
        }
      }
    };
  },

  async recalculateNonInvoicedBatches(payload?: {
    trigger?: string;
    includeApproved?: boolean;
    limit?: number;
  }): Promise<{
    attempted: number;
    recalculated: number;
    failed: number;
    skipped: number;
    errors: Array<{ batch_id: string; status: string; error: string }>;
  }> {
    const batches = await getLocalBatches();
    const includeApproved = Boolean(payload?.includeApproved);
    const limit = Math.max(1, Number(payload?.limit || batches.length));
    const targets = batches
      .filter((batch: any) => {
        const status = String(batch?.status || '').toLowerCase();
        if (status === 'invoiced' || status === 'paid') return false;
        if (!includeApproved && status === 'approved') return false;
        return true;
      })
      .slice(0, limit);

    let recalculated = 0;
    let failed = 0;
    let skipped = Math.max(0, batches.length - targets.length);
    const errors: Array<{ batch_id: string; status: string; error: string }> = [];

    for (const batch of targets) {
      try {
        await this.calculateBatch(String(batch.id));
        recalculated += 1;
      } catch (recalcError) {
        failed += 1;
        errors.push({
          batch_id: String(batch.id),
          status: String(batch.status || 'Draft'),
          error: recalcError instanceof Error ? recalcError.message : 'Unknown error'
        });
      }
    }

    return {
      attempted: targets.length,
      recalculated,
      failed,
      skipped,
      errors
    };
  },

  async recalculateBatch(batchId: string): Promise<any> {
    return this.calculateBatch(batchId);
  },

  async generateInvoice(
    id: string,
    payload?: { idempotencyKey?: string; invoiceNumber?: string }
  ): Promise<{
    success: boolean;
    invoiceId: number;
    created?: boolean;
    idempotent?: boolean;
    invoice?: ExaminationGeneratedInvoicePayload;
  }> {
    const localBatch = await this.getBatch(id);
    const recalculated = await applyCalculatedBatchState(localBatch as any);
    const updatedBatch = await updateLocalBatch(String((localBatch as any).id || id), () => ({
      ...recalculated,
      status: 'Invoiced'
    }));
    const invoicePayload = await buildLocalInvoicePayload(updatedBatch as any, payload);
    return {
      success: true,
      invoiceId: Date.now() * 1000 + Math.floor(Math.random() * 1000),
      created: true,
      idempotent: false,
      invoice: invoicePayload
    };
  },

  // Class methods
  async getBatchByNumber(batchNumber: string): Promise<ExaminationBatch | null> {
    const local = await getLocalBatches();
    const localMatch = local.find(batch => batch.batch_number === batchNumber || batch.batchNumber === batchNumber);
    return (localMatch as ExaminationBatch) || null;
  },

  async findBatchByNumber(batchNumber: string): Promise<ExaminationBatch | null> {
    return this.getBatchByNumber(batchNumber);
  },

  async addClass(batchId: string, payload: Partial<ExaminationClass>): Promise<ExaminationClass> {
    if (!batchId || !batchId.trim()) {
      throw new Error('Batch ID is required to create a class');
    }
    if (!payload.class_name || !String(payload.class_name).trim()) {
      throw new Error('Class name is required');
    }
    if (payload.number_of_learners === undefined || payload.number_of_learners === null) {
      throw new Error('Number of learners is required');
    }
    if (Number(payload.number_of_learners) <= 0) {
      throw new Error('Number of learners must be greater than 0');
    }

    const createdClass = {
      ...payload,
      id: generateLocalId(),
      batch_id: batchId,
      class_name: String(payload.class_name || '').trim(),
      number_of_learners: Math.max(1, Math.floor(Number(payload.number_of_learners) || 0)),
      subjects: Array.isArray(payload.subjects) ? payload.subjects : [],
      is_manual_override: false,
      manual_cost_per_learner: null,
      created_at: toIso(),
      updated_at: toIso()
    };

    const updatedBatch = await updateLocalBatch(batchId, (batch) => ({
      ...batch,
      classes: [...(Array.isArray(batch.classes) ? batch.classes : []), createdClass]
    }));
    const recalculated = await applyCalculatedBatchState(updatedBatch);
    const storedBatch = await updateLocalBatch(String(updatedBatch.id), () => ({
      ...recalculated,
      status: updatedBatch.status || 'Draft'
    }));
    return (Array.isArray((storedBatch as any).classes) ? (storedBatch as any).classes : []).find((row: any) => String(row.id) === String(createdClass.id));
  },

  async updateClass(classId: string, payload: Partial<ExaminationClass>): Promise<ExaminationClass> {
    const owner = await findLocalClassOwner(classId);
    if (!owner) throw new Error(`Class not found in local storage: ${classId}`);
    const updatedBatch = await updateLocalBatch(String(owner.batch.id), (batch) => {
      const classes = Array.isArray(batch.classes) ? [...batch.classes] : [];
      classes[owner.classIndex] = {
        ...classes[owner.classIndex],
        ...payload,
        id: classId,
        updated_at: toIso()
      };
      return { ...batch, classes };
    });
    const recalculated = await applyCalculatedBatchState(updatedBatch);
    const storedBatch = await updateLocalBatch(String(updatedBatch.id), () => recalculated);
    return (Array.isArray((storedBatch as any).classes) ? (storedBatch as any).classes : []).find((row: any) => String(row.id) === String(classId));
  },

  async updateClassPricing(
    classId: string,
    payload: { cost_per_learner?: number; is_manual_override?: boolean; override_reason?: string },
    canOverrideSuggestedCost = false
  ): Promise<ExaminationBatch> {
    const owner = await findLocalClassOwner(classId);
    if (!owner) throw new Error(`Class not found in local storage: ${classId}`);
    const updatedBatch = await updateLocalBatch(String(owner.batch.id), (batch) => {
      const classes = Array.isArray(batch.classes) ? [...batch.classes] : [];
      const existing = classes[owner.classIndex] || {};
      const learners = Math.max(1, Math.floor(Number(existing.number_of_learners) || 0));
      const manualFee = Number(payload.cost_per_learner ?? existing.manual_cost_per_learner ?? 0) || 0;
      classes[owner.classIndex] = {
        ...existing,
        is_manual_override: payload.is_manual_override ?? existing.is_manual_override ?? true,
        manual_cost_per_learner: manualFee,
        final_fee_per_learner: manualFee,
        price_per_learner: manualFee,
        live_total_preview: Number((manualFee * learners).toFixed(2)),
        override_reason: payload.override_reason || existing.override_reason,
        updated_at: toIso()
      };
      return summarizeBatchTotals({ ...batch, classes });
    });
    return updatedBatch as ExaminationBatch;
  },

  async getClassPricingHistory(classId: string, limit = 100): Promise<any[]> {
    return [];
  },

  async deleteClass(classId: string): Promise<void> {
    const owner = await findLocalClassOwner(classId);
    if (!owner) return;
    const updatedBatch = await updateLocalBatch(String(owner.batch.id), (batch) => ({
      ...batch,
      classes: (Array.isArray(batch.classes) ? batch.classes : []).filter((row: any) => String(row?.id) !== String(classId))
    }));
    const recalculated = await applyCalculatedBatchState(updatedBatch);
    await updateLocalBatch(String(updatedBatch.id), () => recalculated);
  },

  // Subject methods
  async addSubject(classId: string, payload: Partial<ExaminationSubject>): Promise<ExaminationSubject> {
    const owner = await findLocalClassOwner(classId);
    if (!owner) throw new Error(`Class not found in local storage: ${classId}`);
    const createdSubject = {
      ...payload,
      id: generateLocalId(),
      class_id: classId,
      subject_name: String((payload as any).subject_name || payload.name || 'Subject').trim(),
      name: String(payload.name || (payload as any).subject_name || 'Subject').trim(),
      pages: Math.max(1, Math.floor(Number((payload as any).pages || 0) || 1)),
      extra_copies: Math.max(0, Math.floor(Number((payload as any).extra_copies || 0))),
      created_at: toIso(),
      updated_at: toIso()
    };
    const updatedBatch = await updateLocalBatch(String(owner.batch.id), (batch) => {
      const classes = Array.isArray(batch.classes) ? [...batch.classes] : [];
      const currentClass = { ...classes[owner.classIndex] };
      currentClass.subjects = [...(Array.isArray(currentClass.subjects) ? currentClass.subjects : []), createdSubject];
      classes[owner.classIndex] = currentClass;
      return { ...batch, classes };
    });
    const recalculated = await applyCalculatedBatchState(updatedBatch);
    await updateLocalBatch(String(updatedBatch.id), () => recalculated);
    return createdSubject as ExaminationSubject;
  },

  async updateSubject(subjectId: string, payload: Partial<ExaminationSubject>): Promise<ExaminationSubject> {
    const owner = await findLocalSubjectOwner(subjectId);
    if (!owner) throw new Error(`Subject not found in local storage: ${subjectId}`);
    const updatedBatch = await updateLocalBatch(String(owner.batch.id), (batch) => {
      const classes = Array.isArray(batch.classes) ? [...batch.classes] : [];
      const currentClass = { ...classes[owner.classIndex] };
      const subjects = Array.isArray(currentClass.subjects) ? [...currentClass.subjects] : [];
      subjects[owner.subjectIndex] = {
        ...subjects[owner.subjectIndex],
        ...payload,
        id: subjectId,
        updated_at: toIso()
      };
      currentClass.subjects = subjects;
      classes[owner.classIndex] = currentClass;
      return { ...batch, classes };
    });
    const recalculated = await applyCalculatedBatchState(updatedBatch);
    await updateLocalBatch(String(updatedBatch.id), () => recalculated);
    const currentClass = (Array.isArray((updatedBatch as any).classes) ? (updatedBatch as any).classes : [])[owner.classIndex];
    return (Array.isArray(currentClass?.subjects) ? currentClass.subjects : []).find((row: any) => String(row.id) === String(subjectId));
  },

  async deleteSubject(subjectId: string): Promise<void> {
    const owner = await findLocalSubjectOwner(subjectId);
    if (!owner) return;
    const updatedBatch = await updateLocalBatch(String(owner.batch.id), (batch) => {
      const classes = Array.isArray(batch.classes) ? [...batch.classes] : [];
      const currentClass = { ...classes[owner.classIndex] };
      currentClass.subjects = (Array.isArray(currentClass.subjects) ? currentClass.subjects : []).filter((row: any) => String(row?.id) !== String(subjectId));
      classes[owner.classIndex] = currentClass;
      return { ...batch, classes };
    });
    const recalculated = await applyCalculatedBatchState(updatedBatch);
    await updateLocalBatch(String(updatedBatch.id), () => recalculated);
  },

  // Settings methods
  async getPricingSettings(): Promise<ExaminationPricingSettings> {
    return getLocalPricingSettings() as Promise<ExaminationPricingSettings>;
  },

  async updatePricingSettings(payload: {
    paper_item_id?: string | null;
    toner_item_id?: string | null;
    conversion_rate?: number;
    trigger_recalculate?: boolean;
    lock_batch_id?: string;
    lock_pricing_snapshot?: boolean;
    lock_reason?: string;
  }): Promise<{
    success: boolean;
    recalculation?: any;
    pricing_lock?: any;
  }> {
    const settings = await saveLocalPricingSettings(payload);
    if (payload.lock_batch_id) {
      await updateLocalBatch(String(payload.lock_batch_id), (batch) => ({
        ...batch,
        pricing_settings_snapshot: settings,
        pricing_lock: payload.lock_pricing_snapshot ? {
          locked: true,
          reason: payload.lock_reason || 'Offline pricing snapshot',
          locked_at: toIso()
        } : batch.pricing_lock
      }));
    }
    return {
      success: true,
      pricing_lock: payload.lock_pricing_snapshot ? {
        locked: true,
        reason: payload.lock_reason || 'Offline pricing snapshot'
      } : undefined
    };
  },

  async getExamPricingSettings() {
    return this.getPricingSettings();
  },

  async updateExamPricingSettings(payload: {
    paper_item_id?: string | null;
    toner_item_id?: string | null;
    conversion_rate?: number;
    trigger_recalculate?: boolean;
    lock_batch_id?: string;
    lock_pricing_snapshot?: boolean;
    lock_reason?: string;
  }) {
    return this.updatePricingSettings(payload);
  },

  // New methods for Examination Pricing Redesign
  async getClass(classId: string): Promise<ExaminationClass> {
    const owner = await findLocalClassOwner(classId);
    if (!owner) throw new Error(`Class not found in local storage: ${classId}`);
    return owner.batch.classes?.[owner.classIndex] as ExaminationClass;
  },

  async getClassPreview(
    classId: string,
    options?: {
      paperId?: string;
      tonerId?: string;
      paperUnitCost?: number;
      tonerUnitCost?: number;
      tonerPagesPerUnit?: number;
      paperConversionRate?: number;
      applyRounding?: boolean;
      rounding_method?: string;
      rounding_value?: number;
      roundingMethod?: string;
      roundingValue?: number;
      adjustments?: MarketAdjustment[];
    }
  ): Promise<{
    classId: string;
    className: string;
    learners: number;
    totalSheets: number;
    totalPages: number;
    paperQuantity: number;
    tonerQuantity: number;
    paperCost: number;
    tonerCost: number;
    totalBomCost: number;
    totalAdjustments: number;
    totalCost: number;
    expectedFeePerLearner: number;
    materialTotalCost: number;
    adjustmentTotalCost: number;
    calculatedTotalCost: number;
      adjustmentBreakdown: Array<{
        adjustmentId: string;
        adjustmentName: string;
      adjustmentType: string;
      adjustmentValue: number;
      baseAmount: number;
      originalAmount: number;
      redistributedAmount: number;
        allocationRatio: number;
      }>;
  }> {
    const owner = await findLocalClassOwner(classId);
    if (!owner) throw new Error(`Class not found in local storage: ${classId}`);
    const recalculated = await applyCalculatedBatchState(owner.batch, {
      paper_item_id: options?.paperId || null,
      toner_item_id: options?.tonerId || null,
      paper_unit_cost: options?.paperUnitCost,
      toner_unit_cost: options?.tonerUnitCost,
      conversion_rate: options?.paperConversionRate
    }, options?.adjustments);
    const classRow = (Array.isArray(recalculated.classes) ? recalculated.classes : []).find((row: any) => String(row.id) === String(classId));
    if (!classRow) throw new Error(`Class not found in local storage: ${classId}`);
    return {
      classId: String(classRow.id),
      className: String(classRow.class_name || 'Class'),
      learners: Math.max(0, Math.floor(Number(classRow.number_of_learners) || 0)),
      totalSheets: Number(classRow.total_sheets || 0),
      totalPages: Number(classRow.total_pages || 0),
      paperQuantity: Number((Number(classRow.total_sheets || 0) / Math.max(1, Number(options?.paperConversionRate || DEFAULT_PAPER_CONVERSION_RATE))).toFixed(4)),
      tonerQuantity: Number((Number(classRow.total_pages || 0) / DEFAULT_TONER_PAGES_PER_UNIT).toFixed(6)),
      paperCost: Number(classRow.material_total_cost || 0),
      tonerCost: 0,
      totalBomCost: Number(classRow.material_total_cost || 0),
      totalAdjustments: Number(classRow.adjustment_total_cost || 0),
      totalCost: Number(classRow.calculated_total_cost || classRow.live_total_preview || 0),
      expectedFeePerLearner: Number(classRow.expected_fee_per_learner || 0),
      materialTotalCost: Number(classRow.material_total_cost || 0),
      adjustmentTotalCost: Number(classRow.adjustment_total_cost || 0),
      calculatedTotalCost: Number(classRow.calculated_total_cost || classRow.live_total_preview || 0),
      adjustmentBreakdown: []
    };
  },

  async updateClassFinancialMetrics(
    classId: string,
    payload: {
      expected_fee_per_learner?: number;
      final_fee_per_learner?: number;
      live_total_preview?: number;
      material_total_cost?: number;
      adjustment_total_cost?: number;
      market_adjustment_total?: number;
      rounding_adjustment?: number;
      calculated_total_cost?: number;
      financial_metrics_source?: 'SYSTEM_CALCULATION' | 'MANUAL_OVERRIDE' | 'PRICING_SETTINGS_SYNC';
      financial_metrics_updated_by?: string;
      financial_metrics_updated_at?: string;
    }
  ): Promise<ExaminationClass> {
    const owner = await findLocalClassOwner(classId);
    if (!owner) throw new Error(`Class not found in local storage: ${classId}`);
    const updatedBatch = await updateLocalBatch(String(owner.batch.id), (batch) => {
      const classes = Array.isArray(batch.classes) ? [...batch.classes] : [];
      classes[owner.classIndex] = {
        ...classes[owner.classIndex],
        ...payload,
        id: classId,
        updated_at: toIso()
      };
      return summarizeBatchTotals({ ...batch, classes });
    });
    return (Array.isArray((updatedBatch as any).classes) ? (updatedBatch as any).classes : []).find((row: any) => String(row.id) === String(classId));
  },

  async syncPricingToBatch(
    batchId: string,
    payload: {
      settings: ExaminationPricingSettings;
      adjustments: MarketAdjustment[];
      triggerSource: 'SYSTEM_CALCULATION' | 'MANUAL_OVERRIDE' | 'PRICING_SETTINGS_SYNC';
    }
  ): Promise<{
    success: boolean;
    classesUpdated: number;
    errors: Array<{ classId: string; error: string }>;
  }> {
    const updatedSettings = await saveLocalPricingSettings(payload.settings || {});
    const localBatch = await this.getBatch(batchId);
    const recalculated = await applyCalculatedBatchState(localBatch as any, updatedSettings, payload.adjustments);
    const storedBatch = await updateLocalBatch(String((localBatch as any).id || batchId), () => ({
      ...recalculated,
      pricing_settings_snapshot: updatedSettings
    }));
    return {
      success: true,
      classesUpdated: Array.isArray((storedBatch as any).classes) ? (storedBatch as any).classes.length : 0,
      errors: []
    };
  }
};
