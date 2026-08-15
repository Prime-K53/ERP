import { CompanyConfig, NumberingRule } from '../types';
import { dbService } from './db';
import {
  extractConfiguredDocumentNumberValue,
  formatConfiguredDocumentNumber,
  resolveBuiltInDocumentPrefix,
  resolveEffectiveNumberingRule
} from '../utils/numbering';

export type DocumentNumberSeriesKey = 'sales_invoice' | 'examination_batch';

export interface DocumentNumberSeriesState extends NumberingRule {
  key: DocumentNumberSeriesKey;
  label: string;
  highestExistingNumber: number;
  canEditStartNumber: boolean;
  used: boolean;
  preview: string;
  warning?: string;
}

interface SeriesDefinition {
  key: DocumentNumberSeriesKey;
  label: string;
  storageKey: string;
  companyKeys: string[];
  storeName: 'invoices' | 'examinationBatches';
  numberFields: string[];
}

const SERIES_DEFINITIONS: Record<DocumentNumberSeriesKey, SeriesDefinition> = {
  sales_invoice: {
    key: 'sales_invoice',
    label: 'Sales Invoices',
    storageKey: 'document-number-series:sales_invoice',
    companyKeys: ['sales_invoice', 'invoice', 'inv'],
    storeName: 'invoices',
    numberFields: ['id', 'invoiceNumber', 'invoice_number']
  },
  examination_batch: {
    key: 'examination_batch',
    label: 'Examination Batches',
    storageKey: 'document-number-series:examination_batch',
    companyKeys: ['examination_batch', 'exambatch'],
    storeName: 'examinationBatches',
    numberFields: ['batch_number', 'batchNumber']
  }
};

const normalizeSeriesKey = (value: string): DocumentNumberSeriesKey => {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'sales_invoice' || normalized === 'invoice' || normalized === 'inv') {
    return 'sales_invoice';
  }
  if (normalized === 'examination_batch' || normalized === 'exambatch') {
    return 'examination_batch';
  }
  throw new Error(`Unsupported document number series "${value}".`);
};

const toPositiveInteger = (value: unknown, fallback: number) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.floor(parsed));
};

/**
 * Determines whether the sequence should be reset based on the configured interval
 * and the last reset timestamp.
 */
const shouldResetSequence = (
  resetInterval: NonNullable<NumberingRule['resetInterval']>,
  lastResetAt?: string
): boolean => {
  if (resetInterval === 'Never' || !lastResetAt) return false;

  const now = new Date();
  const lastReset = new Date(lastResetAt);

  switch (resetInterval) {
    case 'Daily':
      // Reset if the last reset was on a different calendar day
      return lastReset.getFullYear() !== now.getFullYear() ||
             lastReset.getMonth() !== now.getMonth() ||
             lastReset.getDate() !== now.getDate();

    case 'Monthly':
      // Reset if the last reset was in a different calendar month
      return lastReset.getFullYear() !== now.getFullYear() ||
             lastReset.getMonth() !== now.getMonth();

    case 'Yearly':
      // Reset if the last reset was in a different calendar year
      return lastReset.getFullYear() !== now.getFullYear();

    default:
      return false;
  }
};

const getCompanyConfig = (): CompanyConfig | null => {
  const saved = localStorage.getItem('nexus_company_config');
  if (!saved) return null;
  try {
    return JSON.parse(saved) as CompanyConfig;
  } catch {
    return null;
  }
};

const resolveCompanyRule = (
  seriesKey: DocumentNumberSeriesKey,
  companyConfig?: CompanyConfig | null
): NumberingRule | null => {
  const effectiveConfig = companyConfig || getCompanyConfig();
  const definition = SERIES_DEFINITIONS[seriesKey];
  for (const key of [seriesKey, ...definition.companyKeys]) {
    const rule = resolveEffectiveNumberingRule(key, effectiveConfig);
    if (rule) {
      return rule;
    }
  }

  return null;
};

export const formatDocumentNumber = (
  rule: Pick<NumberingRule, 'prefix' | 'padding' | 'extension' | 'suffix'>,
  numericValue: number
) => {
  return formatConfiguredDocumentNumber(rule, numericValue);
};

export const extractDocumentNumberValue = (
  documentNumber: string,
  rule: Pick<NumberingRule, 'prefix' | 'suffix'> | Partial<Pick<NumberingRule, 'prefix' | 'suffix' | 'extension'>> | null | undefined
) => {
  return extractConfiguredDocumentNumberValue(documentNumber, rule);
};

const normalizeRule = (
  seriesKey: DocumentNumberSeriesKey,
  source?: Partial<NumberingRule> | null,
  currentNumberOverride?: number
): NumberingRule & { lastResetAt?: string } => {
  const defaultPrefix = resolveBuiltInDocumentPrefix(seriesKey) || (seriesKey === 'sales_invoice' ? 'INV' : 'EB');
  const startNumber = toPositiveInteger(source?.startNumber, 1);
  const currentNumber = toPositiveInteger(currentNumberOverride ?? source?.currentNumber ?? startNumber, startNumber);

  return {
    prefix: String(source?.prefix ?? defaultPrefix),
    padding: toPositiveInteger(source?.padding, 4),
    extension: String(source?.extension || '').trim(),
    startNumber,
    currentNumber: Math.max(currentNumber, startNumber),
    suffix: String(source?.suffix || ''),
    resetInterval: source?.resetInterval || 'Never',
    lastResetAt: (source as any)?.lastResetAt
  };
};

const createSeriesState = (
  seriesKey: DocumentNumberSeriesKey,
  rule: NumberingRule,
  highestExistingNumber: number
): DocumentNumberSeriesState => {
  const definition = SERIES_DEFINITIONS[seriesKey];
  const used = toPositiveInteger(rule.currentNumber, rule.startNumber) > toPositiveInteger(rule.startNumber, 1);
  const previewNumber = toPositiveInteger(rule.currentNumber, rule.startNumber);
  const warning = highestExistingNumber >= toPositiveInteger(rule.startNumber, 1)
    ? `Starting number must be greater than the highest existing number (${highestExistingNumber}).`
    : undefined;

  return {
    ...rule,
    key: seriesKey,
    label: definition.label,
    highestExistingNumber,
    canEditStartNumber: !used,
    used,
    preview: formatDocumentNumber(rule, previewNumber),
    warning
  };
};

export const getHighestExistingNumber = async (
  seriesKeyInput: string,
  companyConfig?: CompanyConfig | null
): Promise<number> => {
  const seriesKey = normalizeSeriesKey(seriesKeyInput);
  const definition = SERIES_DEFINITIONS[seriesKey];
  const rule = normalizeRule(seriesKey, resolveCompanyRule(seriesKey, companyConfig));
  const records = await dbService.getAll<Record<string, unknown>>(definition.storeName as string);

  return (records || []).reduce((max, record) => {
    for (const field of definition.numberFields) {
      const candidate = extractDocumentNumberValue(String(record?.[field] || ''), rule);
      if (candidate !== null) {
        return Math.max(max, candidate);
      }
    }
    return max;
  }, 0);
};

const getStoredSeries = async (
  store: any,
  seriesKey: DocumentNumberSeriesKey,
  companyConfig?: CompanyConfig | null
) => {
  const definition = SERIES_DEFINITIONS[seriesKey];
  const existing = await store.get(definition.storageKey);
  const companyRule = resolveCompanyRule(seriesKey, companyConfig);
  return normalizeRule(seriesKey, {
    ...(companyRule || {}),
    ...(existing || {})
  });
};

export const syncDocumentNumberSeriesConfig = async (
  companyConfig?: CompanyConfig | null
): Promise<Record<DocumentNumberSeriesKey, DocumentNumberSeriesState>> => {
  const effectiveConfig = companyConfig || getCompanyConfig();
  const highestExisting = {
    sales_invoice: await getHighestExistingNumber('sales_invoice', effectiveConfig),
    examination_batch: await getHighestExistingNumber('examination_batch', effectiveConfig)
  };

  return dbService.executeAtomicOperation(['settings'], async (tx) => {
    const store = tx.objectStore('settings');
    const result = {} as Record<DocumentNumberSeriesKey, DocumentNumberSeriesState>;

    for (const seriesKey of Object.keys(SERIES_DEFINITIONS) as DocumentNumberSeriesKey[]) {
      const definition = SERIES_DEFINITIONS[seriesKey];
      const existing = await store.get(definition.storageKey);
      const companyRule = resolveCompanyRule(seriesKey, effectiveConfig);
      const normalizedCompanyRule = normalizeRule(seriesKey, companyRule);
      const wasUsed = toPositiveInteger(existing?.currentNumber, normalizedCompanyRule.startNumber)
        > toPositiveInteger(existing?.startNumber, normalizedCompanyRule.startNumber);

      const nextStartNumber = wasUsed
        ? toPositiveInteger(existing?.startNumber, normalizedCompanyRule.startNumber)
        : Math.max(normalizedCompanyRule.startNumber, highestExisting[seriesKey] + 1);
      const nextCurrentNumber = wasUsed
        ? Math.max(
            toPositiveInteger(existing?.currentNumber, nextStartNumber),
            nextStartNumber,
            highestExisting[seriesKey] + 1
          )
        : nextStartNumber;

      const persistedRule = normalizeRule(seriesKey, {
        ...normalizedCompanyRule,
        startNumber: nextStartNumber,
        currentNumber: nextCurrentNumber
      });

      await store.put({
        id: definition.storageKey,
        ...persistedRule,
        updatedAt: new Date().toISOString()
      });

      result[seriesKey] = createSeriesState(seriesKey, persistedRule, highestExisting[seriesKey]);
    }

    return result;
  });
};

export const getDocumentNumberSeriesState = async (
  companyConfig?: CompanyConfig | null
): Promise<Record<DocumentNumberSeriesKey, DocumentNumberSeriesState>> => {
  return syncDocumentNumberSeriesConfig(companyConfig);
};

export const generateNextNumber = async (
  seriesKeyInput: string,
  companyConfig?: CompanyConfig | null
): Promise<string> => {
  const seriesKey = normalizeSeriesKey(seriesKeyInput);
  const effectiveConfig = companyConfig || getCompanyConfig();
  const definition = SERIES_DEFINITIONS[seriesKey];

  await syncDocumentNumberSeriesConfig(effectiveConfig);

  return dbService.executeAtomicOperation(['settings'], async (tx) => {
    const store = tx.objectStore('settings');
    const currentRule = await getStoredSeries(store, seriesKey, effectiveConfig);

    if (!currentRule.prefix && seriesKey === 'sales_invoice') {
      throw new Error('Sales invoice number series is not configured yet.');
    }

    // ── Reset Sequence Logic ──
    // If a reset interval is configured and the interval has elapsed since lastResetAt,
    // reset currentNumber back to startNumber and record the reset timestamp.
    const interval = currentRule.resetInterval || 'Never';
    const shouldReset = shouldResetSequence(interval, (currentRule as any).lastResetAt);

    let effectiveCurrentNumber: number;
    let lastResetAt: string | undefined;

    if (shouldReset) {
      effectiveCurrentNumber = toPositiveInteger(currentRule.startNumber, 1);
      lastResetAt = new Date().toISOString();
    } else {
      effectiveCurrentNumber = toPositiveInteger(currentRule.currentNumber, currentRule.startNumber);
      lastResetAt = (currentRule as any).lastResetAt;
    }

    const nextNumber = effectiveCurrentNumber;
    const documentNumber = formatDocumentNumber(currentRule, nextNumber);

    await store.put({
      id: definition.storageKey,
      ...currentRule,
      currentNumber: nextNumber + 1,
      lastResetAt,
      updatedAt: new Date().toISOString()
    });

    return documentNumber;
  });
};

export const generateNextSalesInvoiceNumber = async (companyConfig?: CompanyConfig | null) => {
  return generateNextNumber('sales_invoice', companyConfig);
};

export const generateNextExaminationBatchNumber = async (companyConfig?: CompanyConfig | null) => {
  return generateNextNumber('examination_batch', companyConfig);
};
