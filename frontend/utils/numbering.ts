import { CompanyConfig, NumberingRule } from '../types';

export const SHARED_NUMBERING_RULE_KEY = 'shared';

const LEGACY_SHARED_NUMBERING_RULE_KEYS = [SHARED_NUMBERING_RULE_KEY, 'global'] as const;
const DEFAULT_PADDING = 4;
const DEFAULT_START_NUMBER = 1;
const DEFAULT_RESET_INTERVAL: NonNullable<NumberingRule['resetInterval']> = 'Never';
const VALID_RESET_INTERVALS = new Set<NonNullable<NumberingRule['resetInterval']>>([
  'Never',
  'Daily',
  'Monthly',
  'Yearly'
]);

type PrefixDefinition = {
  prefix: string;
  aliases: string[];
};

const PREFIX_DEFINITIONS: PrefixDefinition[] = [
  { prefix: 'INV', aliases: ['invoice', 'inv', 'sales_invoice', 'salesinvoice'] },
  { prefix: 'QTN', aliases: ['quotation', 'qtn', 'quote'] },
  { prefix: 'WO', aliases: ['workorder', 'work_order', 'wo'] },
  { prefix: 'PO', aliases: ['purchaseorder', 'purchase_order', 'po'] },
  { prefix: 'DN', aliases: ['deliverynote', 'delivery_note', 'dn'] },
  { prefix: 'PAY', aliases: ['pay'] },
  { prefix: 'SP', aliases: ['spay', 'supplierpayment', 'supplierpayments', 'supplier_payment', 'sp'] },
  { prefix: 'GRN', aliases: ['grn', 'goodsreceipt', 'goodsreceipts', 'goods_receipt'] },
  { prefix: 'LED', aliases: ['ledger', 'led'] },
  { prefix: 'EXP', aliases: ['expense', 'expenses', 'exp'] },
  { prefix: 'REF', aliases: ['refund', 'refunds', 'ref'] },
  { prefix: 'ITM', aliases: ['item', 'items', 'inventoryitem', 'inventoryitems', 'itm'] },
  { prefix: 'RAW', aliases: ['rawmaterial', 'raw_material', 'rawmaterialitem', 'rawmaterialitems'] },
  { prefix: 'STA', aliases: ['stationeryitem', 'stationeryitems', 'stationaryitem', 'stationaryitems'] },
  { prefix: 'SRV', aliases: ['printingserviceitem', 'printingserviceitems', 'printing_service_item', 'serviceitem', 'serviceitems'] },
  { prefix: 'CUST', aliases: ['customer', 'customers', 'cust'] },
  { prefix: 'SUP', aliases: ['supplier', 'suppliers', 'supp', 'sup'] },
  { prefix: 'BAT', aliases: ['batch', 'batches', 'bat'] },
  { prefix: 'BTC', aliases: ['exambatch', 'examination_batch', 'examinationbatch', 'eb'] },
  { prefix: 'ES', aliases: ['examsheet', 'exam_sheet', 'examinationsheet', 'es'] },
  { prefix: 'EXM', aliases: ['examination_invoice', 'examination', 'exm'] },
  { prefix: 'AUD', aliases: ['audit', 'auditlog', 'auditlogs', 'aud'] },
];

const LEGACY_RULE_PRIORITY = [
  'invoice',
  'inv',
  'sales_invoice',
  'quotation',
  'qtn',
  'workorder',
  'wo',
  'purchaseorder',
  'po',
  'deliverynote',
  'dn',
  'pay',
  'spay',
  'grn',
  'ledger',
  'expense',
  'refund',
  'item',
  'customer',
  'supplier',
  'batch',
  'exambatch',
  'examination_batch',
  'examsheet',
  'audit',
];

const toPositiveInteger = (value: unknown, fallback: number) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.floor(parsed));
};

const escapeRegex = (value: string) => String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const buildPrefixSeparator = (prefix: string) => {
  if (!prefix) return '';
  return /[-/\s]$/.test(prefix) ? '' : '-';
};

const normalizeResetInterval = (
  value: unknown,
  fallback: NonNullable<NumberingRule['resetInterval']> = DEFAULT_RESET_INTERVAL
): NonNullable<NumberingRule['resetInterval']> => {
  if (typeof value !== 'string') return fallback;
  return VALID_RESET_INTERVALS.has(value as NonNullable<NumberingRule['resetInterval']>)
    ? (value as NonNullable<NumberingRule['resetInterval']>)
    : fallback;
};

export const normalizeNumberingKey = (value: string) => String(value || '').trim().toLowerCase();

const compactNumberingKey = (value: string) => normalizeNumberingKey(value).replace(/[\s_-]+/g, '');

const prefixLookup = new Map<string, string>();
for (const definition of PREFIX_DEFINITIONS) {
  for (const alias of definition.aliases) {
    prefixLookup.set(normalizeNumberingKey(alias), definition.prefix);
    prefixLookup.set(compactNumberingKey(alias), definition.prefix);
  }
}

const getNumberingRules = (config?: CompanyConfig | null): Record<string, NumberingRule> => {
  return (config?.transactionSettings?.numbering || {}) as Record<string, NumberingRule>;
};

const cloneRule = (rule: NumberingRule): NumberingRule => ({
  prefix: String(rule.prefix || ''),
  padding: toPositiveInteger(rule.padding, DEFAULT_PADDING),
  extension: String(rule.extension || ''),
  startNumber: toPositiveInteger(rule.startNumber, DEFAULT_START_NUMBER),
  currentNumber: rule.currentNumber == null ? undefined : toPositiveInteger(rule.currentNumber, DEFAULT_START_NUMBER),
  suffix: String(rule.suffix || ''),
  resetInterval: normalizeResetInterval(rule.resetInterval)
});

export const DEFAULT_SHARED_NUMBERING_RULE: NumberingRule = {
  prefix: '',
  padding: DEFAULT_PADDING,
  extension: '',
  startNumber: DEFAULT_START_NUMBER,
  resetInterval: DEFAULT_RESET_INTERVAL
};

export const normalizeSharedNumberingRule = (source?: Partial<NumberingRule> | null): NumberingRule => {
  const startNumber = toPositiveInteger(source?.startNumber, DEFAULT_START_NUMBER);
  const currentNumber = source?.currentNumber == null
    ? undefined
    : toPositiveInteger(source.currentNumber, startNumber);

  return {
    prefix: '',
    padding: toPositiveInteger(source?.padding, DEFAULT_PADDING),
    extension: String(source?.extension || ''),
    startNumber,
    currentNumber,
    suffix: String(source?.suffix || ''),
    resetInterval: normalizeResetInterval(source?.resetInterval)
  };
};

export const resolveBuiltInDocumentPrefix = (type: string) => {
  const normalized = normalizeNumberingKey(type);
  if (!normalized) return '';

  return prefixLookup.get(normalized)
    || prefixLookup.get(compactNumberingKey(normalized))
    || String(type || '').trim().toUpperCase();
};

const resolveLegacyGlobalRule = (numbering: Record<string, NumberingRule>) => {
  for (const key of LEGACY_RULE_PRIORITY) {
    if (numbering[key]) {
      return numbering[key];
    }
  }

  return Object.entries(numbering).find(([key, value]) => {
    if (!value) return false;
    return !LEGACY_SHARED_NUMBERING_RULE_KEYS.includes(normalizeNumberingKey(key) as 'shared' | 'global');
  })?.[1] || null;
};

const resolveDirectNumberingRule = (type: string, config?: CompanyConfig | null) => {
  const numbering = getNumberingRules(config);
  const normalized = normalizeNumberingKey(type);
  const lookupKeys = new Set<string>([type, normalized, compactNumberingKey(normalized)]);

  const matchedDefinition = PREFIX_DEFINITIONS.find((definition) =>
    definition.aliases.some((alias) => {
      const normalizedAlias = normalizeNumberingKey(alias);
      return normalizedAlias === normalized || compactNumberingKey(alias) === compactNumberingKey(normalized);
    })
  );

  if (matchedDefinition) {
    for (const alias of matchedDefinition.aliases) {
      lookupKeys.add(alias);
      lookupKeys.add(normalizeNumberingKey(alias));
      lookupKeys.add(compactNumberingKey(alias));
    }
  }

  for (const key of lookupKeys) {
    if (numbering[key]) {
      return numbering[key];
    }
  }

  return null;
};

export const resolveGlobalNumberingRule = (config?: CompanyConfig | null): NumberingRule | null => {
  const numbering = getNumberingRules(config);

  for (const key of LEGACY_SHARED_NUMBERING_RULE_KEYS) {
    if (numbering[key]) {
      return normalizeSharedNumberingRule(numbering[key]);
    }
  }

  const legacyRule = resolveLegacyGlobalRule(numbering);
  return legacyRule ? normalizeSharedNumberingRule(legacyRule) : null;
};

export const resolveEffectiveNumberingRule = (
  type: string,
  config?: CompanyConfig | null
): NumberingRule | null => {
  const sourceRule = resolveGlobalNumberingRule(config) || resolveDirectNumberingRule(type, config);
  if (!sourceRule) return null;

  const normalizedRule = cloneRule(sourceRule as NumberingRule);
  return {
    ...normalizedRule,
    prefix: resolveBuiltInDocumentPrefix(type) || normalizedRule.prefix || String(type || '').trim().toUpperCase()
  };
};

export const createSharedNumberingConfig = (source?: Partial<NumberingRule> | null) => ({
  [SHARED_NUMBERING_RULE_KEY]: normalizeSharedNumberingRule(source || DEFAULT_SHARED_NUMBERING_RULE)
});

export const normalizeCompanyNumberingConfig = (config: CompanyConfig): CompanyConfig => {
  const sharedRule = resolveGlobalNumberingRule(config) || normalizeSharedNumberingRule(DEFAULT_SHARED_NUMBERING_RULE);

  return {
    ...config,
    transactionSettings: {
      ...config.transactionSettings,
      numbering: createSharedNumberingConfig(sharedRule)
    }
  };
};

export const formatNumberingPreview = (
  type: string,
  rule?: Partial<NumberingRule> | null
) => {
  const normalizedRule = normalizeSharedNumberingRule(rule);
  const prefix = resolveBuiltInDocumentPrefix(type);
  return formatConfiguredDocumentNumber({
    ...normalizedRule,
    prefix
  }, normalizedRule.startNumber);
};

export const formatConfiguredDocumentNumber = (
  rule: Pick<NumberingRule, 'prefix' | 'padding' | 'extension' | 'suffix'>,
  numericValue: number
) => {
  const padded = String(toPositiveInteger(numericValue, DEFAULT_START_NUMBER)).padStart(
    toPositiveInteger(rule.padding, DEFAULT_PADDING),
    '0'
  );
  const prefix = String(rule.prefix || '').trim();
  const extension = String(rule.extension || '').trim();
  const suffix = String(rule.suffix || '');
  const prefixSeparator = buildPrefixSeparator(prefix);
  const extensionPart = extension ? `${extension}/` : '';
  return `${prefix}${prefixSeparator}${extensionPart}${padded}${suffix}`;
};

export const extractConfiguredDocumentNumberValue = (
  documentNumber: string,
  rule: Pick<NumberingRule, 'prefix' | 'suffix'> | Partial<Pick<NumberingRule, 'prefix' | 'suffix' | 'extension'>> | null | undefined
) => {
  const raw = String(documentNumber || '').trim();
  if (!raw) return null;

  const prefix = String(rule?.prefix || '').trim();
  let remainder = raw;

  if (prefix) {
    const separatorPattern = /[-/\s]$/.test(prefix) ? '' : '[-/\\s]?';
    const prefixPattern = new RegExp(`^${escapeRegex(prefix)}${separatorPattern}`, 'i');
    const prefixMatch = raw.match(prefixPattern);
    if (!prefixMatch) {
      return null;
    }
    remainder = raw.slice(prefixMatch[0].length);
  }

  const suffix = String(rule?.suffix || '');
  if (suffix) {
    if (!remainder.endsWith(suffix)) {
      return null;
    }
    remainder = remainder.slice(0, remainder.length - suffix.length);
  }

  // Ignore the optional branch extension when reading existing numbers so a pattern
  // update does not accidentally reset a live sequence.
  const match = remainder.match(/(\d+)(?!.*\d)/);
  if (!match) {
    return null;
  }

  const parsed = Number(match[1]);
  return Number.isFinite(parsed) ? parsed : null;
};
