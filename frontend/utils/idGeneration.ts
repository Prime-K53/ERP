import { CompanyConfig } from '../types';
import { newUlid } from './ulid';
import {
  extractConfiguredDocumentNumberValue,
  formatConfiguredDocumentNumber,
  normalizeNumberingKey,
  resolveBuiltInDocumentPrefix,
  resolveEffectiveNumberingRule,
} from './numbering';

/**
 * Prime ERP intentionally uses multiple ID strategies:
 * - Sequential IDs for human-facing document/transaction numbers
 * - Category-based SKUs for inventory discovery
 * - Numeric-only account numbers for customer/account records
 * - Opaque local/runtime IDs for offline-first drafts, logs, and snapshots
 */
export const ID_GENERATION_STRATEGIES = Object.freeze({
  sequential: 'Human-readable, collection-scoped numbers',
  sku: 'Category-prefixed stock keeping units',
  numeric: 'Fixed-length numeric account references',
  opaque: 'Timestamp/random or UUID-based local identifiers',
});

const DEFAULT_PADDING = 4;
const DEFAULT_RANDOM_SEGMENT_LENGTH = 9;

const getCompanyConfig = (): CompanyConfig | null => {
  if (typeof window === 'undefined' || !window.localStorage) return null;

  const saved = localStorage.getItem('nexus_company_config');
  if (!saved) return null;

  try {
    return JSON.parse(saved) as CompanyConfig;
  } catch {
    return null;
  }
};

const randomBase36 = (length = DEFAULT_RANDOM_SEGMENT_LENGTH) => {
  const safeLength = Math.max(1, Math.floor(Number(length) || DEFAULT_RANDOM_SEGMENT_LENGTH));

  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789';
    const bytes = new Uint8Array(safeLength);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join('');
  }

  return Math.random().toString(36).slice(2).padEnd(safeLength, '0').slice(0, safeLength);
};

export const isInvoiceNumberingType = (type: string) => {
  const normalized = normalizeNumberingKey(type);
  return normalized === 'invoice'
    || normalized.startsWith('inv')
    || normalized.includes('invoice')
    || normalized.includes('examination');
};

export const resolveSequentialNumberingRule = (type: string, config?: CompanyConfig) => {
  const effectiveConfig = config || getCompanyConfig();
  const effectiveRule = resolveEffectiveNumberingRule(type, effectiveConfig);
  return { effectiveConfig, effectiveRule };
};

export const resolveSequentialNumberingPadding = (type: string, config?: CompanyConfig) => {
  const { effectiveRule } = resolveSequentialNumberingRule(type, config);
  const padding = effectiveRule?.padding;

  if (padding == null && (type === 'examination_invoice' || type === 'examination')) {
    return 6;
  }

  if (padding == null) {
    return DEFAULT_PADDING;
  }

  const parsed = Number(padding);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return DEFAULT_PADDING;
  }

  return parsed;
};

export const generateOpaqueId = (
  prefix = 'ID',
  options?: {
    separator?: string;
    randomLength?: number;
    includeTimestamp?: boolean;
  }
) => {
  const separator = options?.separator ?? '-';
  const includeTimestamp = options?.includeTimestamp !== false;
  const randomSegment = randomBase36(options?.randomLength);

  if (!prefix) {
    return includeTimestamp ? `${Date.now()}${separator}${randomSegment}` : randomSegment;
  }

  if (!includeTimestamp) {
    return `${prefix}${separator}${randomSegment}`;
  }

  return `${prefix}${separator}${Date.now()}${separator}${randomSegment}`;
};

export const generateLocalId = (prefix = 'local') => {
  // Phase 2: opaque local ids are now globally-unique ULIDs (client-generated,
  // time-sortable) so offline drafts never collide with another device.
  return `${prefix}-${newUlid()}`;
};

export const generateNumericAccountNumber = (digits = 8): string => {
  const safeDigits = Math.max(4, Math.floor(Number(digits) || 8));
  const values = new Uint8Array(safeDigits);

  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    crypto.getRandomValues(values);
  } else {
    for (let index = 0; index < safeDigits; index += 1) {
      values[index] = Math.floor(Math.random() * 256);
    }
  }

  return Array.from(values, (value, index) => {
    const digit = value % 10;
    if (index === 0 && digit === 0) return '1';
    return String(digit);
  }).join('');
};

export const generateCategorySku = (category: string, collection: any[]) => {
  if (!category) return '';

  const prefix = category.substring(0, 3).toUpperCase();
  const matchingItems = (collection || []).filter((item) => item?.sku && item.sku.startsWith(`${prefix}-`));

  let maxNum = 0;
  matchingItems.forEach((item) => {
    const parts = String(item.sku || '').split('-');
    const lastPart = parts[parts.length - 1];
    const parsed = parseInt(lastPart, 10);
    if (!Number.isNaN(parsed) && parsed > maxNum) {
      maxNum = parsed;
    }
  });

  return `${prefix}-${String(maxNum + 1).padStart(DEFAULT_PADDING, '0')}`;
};

export const CUSTOMER_ID_PREFIX = 'CUST';
export const CUSTOMER_ID_PADDING = DEFAULT_PADDING;

/**
 * Generates the next customer id as a CUST-XXXX sequence (e.g. CUST-0001).
 *
 * Customer ids are intentionally NOT driven by the numbering rules in Settings
 * (transactionSettings.numbering). They always use the fixed CUST prefix with
 * four-digit padding, incrementing from the highest CUST- number already in the
 * collection.
 */
export const generateCustomerId = (collection: any[] = []) => {
  const customerIdPattern = new RegExp(`^${CUSTOMER_ID_PREFIX}-(\\d+)$`, 'i');
  let max = 0;

  (collection || []).forEach((item) => {
    if (!item?.id || typeof item.id !== 'string') return;
    const match = item.id.trim().match(customerIdPattern);
    if (!match) return;
    const parsed = parseInt(match[1], 10);
    if (!Number.isNaN(parsed) && parsed > max) max = parsed;
  });

  return `${CUSTOMER_ID_PREFIX}-${String(max + 1).padStart(CUSTOMER_ID_PADDING, '0')}`;
};

export const isCustomerNumberingType = (type: string) => {
  return resolveBuiltInDocumentPrefix(type) === CUSTOMER_ID_PREFIX;
};

export const generateSequentialId = (
  type: string = 'ID',
  collection: any[] = [],
  config?: CompanyConfig
) => {
  const safeType = String(type || 'ID');

  // Customer ids are ALWAYS the fixed CUST-XXXX sequence. They must never be
  // driven by the numbering rules configured in Settings.
  if (isCustomerNumberingType(safeType)) {
    return generateCustomerId(collection);
  }

  const { effectiveRule } = resolveSequentialNumberingRule(safeType, config);
  const padding = resolveSequentialNumberingPadding(safeType, config);

  let prefix = resolveBuiltInDocumentPrefix(safeType) || safeType;
  let startNumber = 1;
  let resetInterval = 'Never';
  let extension = '';
  let suffix = '';

  if (effectiveRule) {
    prefix = effectiveRule.prefix || prefix;
    startNumber = effectiveRule.startNumber || 1;
    resetInterval = effectiveRule.resetInterval || 'Never';
    extension = effectiveRule.extension || '';
    suffix = effectiveRule.suffix || '';
  }

  const activeRule = {
    prefix,
    padding,
    extension,
    suffix,
  };

  if (!collection || collection.length === 0) {
    return formatConfiguredDocumentNumber(activeRule, startNumber);
  }

  let filteredCollection = collection;
  if (resetInterval !== 'Never') {
    const now = new Date();
    filteredCollection = collection.filter((item) => {
      if (!item?.date) return false;

      const itemDate = new Date(item.date);
      if (resetInterval === 'Daily') {
        return itemDate.getDate() === now.getDate()
          && itemDate.getMonth() === now.getMonth()
          && itemDate.getFullYear() === now.getFullYear();
      }

      if (resetInterval === 'Monthly') {
        return itemDate.getMonth() === now.getMonth()
          && itemDate.getFullYear() === now.getFullYear();
      }

      if (resetInterval === 'Yearly') {
        return itemDate.getFullYear() === now.getFullYear();
      }

      return true;
    });
  }

  if (filteredCollection.length === 0) {
    return formatConfiguredDocumentNumber(activeRule, startNumber);
  }

  const maxId = filteredCollection.reduce((max, item) => {
    if (!item?.id || typeof item.id !== 'string') return max;
    const numericValue = extractConfiguredDocumentNumberValue(item.id, activeRule);
    return numericValue !== null ? Math.max(max, numericValue) : max;
  }, 0);

  const nextNumber = Math.max(maxId + 1, startNumber);
  return formatConfiguredDocumentNumber(activeRule, nextNumber);
};
