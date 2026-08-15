
import { Item, CompanyConfig } from '../types';
import { logger } from '../services/logger';
import {
  extractConfiguredDocumentNumberValue,
  resolveBuiltInDocumentPrefix,
} from './numbering';
import {
  generateCategorySku,
  generateCustomerId as generateCustomerIdCore,
  generateNumericAccountNumber,
  generateSequentialId,
  isInvoiceNumberingType,
  resolveSequentialNumberingPadding,
  resolveSequentialNumberingRule,
} from './idGeneration';
import * as roundingUtils from './roundingUtils';

export const assertInvoiceNumberFormat = (id: string, config?: CompanyConfig, type: string = 'invoice') => {
  // Handle examination invoice format with EXM prefix
  if (String(id || '').toUpperCase().startsWith('EXM-')) {
    // Accept EXM-<anything> format for examination invoices
    if (type === 'examination_invoice') {
      return true;
    }
    // For regular invoices with EXM prefix (e.g., mixed usage), also accept them
    const originModule = String((config as CompanyConfig & { originModule?: string })?.originModule || '').toLowerCase();
    if (originModule === 'examination') {
      return true;
    }
  }

  const padding = resolveSequentialNumberingPadding(type, config);
  const { effectiveRule } = resolveSequentialNumberingRule(type, config);
  const numericValue = extractConfiguredDocumentNumberValue(String(id || ''), {
    prefix: effectiveRule?.prefix || resolveBuiltInDocumentPrefix(type),
    suffix: effectiveRule?.suffix || ''
  });

  if (numericValue === null) {
    throw new Error(`Invoice number must end with ${padding} digits.`);
  }

  const numericText = String(id || '')
    .trim()
    .match(/(\d+)(?!.*\d)/)?.[1];

  if (!numericText || numericText.length !== padding) {
    throw new Error(`Invoice number must end with ${padding} digits.`);
  }
  return true;
};

export const generateNextId = (type: string = 'ID', collection: any[] = [], config?: CompanyConfig) => {
  const nextId = generateSequentialId(type, collection, config);
  if (isInvoiceNumberingType(type)) {
    assertInvoiceNumberFormat(nextId, config, type);
  }
  return nextId;
};

export const generateSku = (category: string, collection: any[]) => {
  return generateCategorySku(category, collection);
};

export const generateCustomerId = (collection: any[] = []) => {
  return generateCustomerIdCore(collection);
};

export const parseTemplate = (template: string, variables: Record<string, any>): string => {
  return template.replace(/{{(\w+)}}/g, (_, key) => {
    return variables[key] !== undefined ? String(variables[key]) : `{{${key}}}`;
  });
};

export const generateAccountNumber = (): string => {
  return generateNumericAccountNumber();
};

const getCompanyConfig = (): CompanyConfig | null => {
  if (typeof window === 'undefined' || !window.localStorage) return null;

  const saved = localStorage.getItem('nexus_company_config');
  if (!saved) return null;

  try {
    return JSON.parse(saved) as CompanyConfig;
  } catch (error) {
    logger.error('Failed to parse company config', error);
    return null;
  }
};

export const formatNumber = (num: number): string => {
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(num || 0);
};

export const parseFormattedNumber = (value: string): number => {
  if (!value) return 0;
  const cleaned = value.replace(/[^0-9.]/g, '');
  const parsed = parseFloat(cleaned);
  return isNaN(parsed) ? 0 : parsed;
};

export const formatNumberCompact = (num: number): string => {
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(num || 0);
};

/**
 * Standard financial rounding based on CompanyConfig rules.
 */
export const roundFinancial = (amount: number, config?: CompanyConfig): number => {
  const cfg = config || getCompanyConfig();
  const rules = cfg?.roundingRules || { method: 'Nearest', precision: 2 };
  return roundingUtils.roundFinancial(amount, rules.method, rules.precision ?? 2);
};

/**
 * Standard currency rounding to 2 decimal places.
 */
export const roundToCurrency = roundingUtils.roundMoney;

/**
 * Calculates the total valuation of a stock collection
 */
export const calculateInventoryValuation = (items: Item[]): number => {
  return items.reduce((sum, item) => sum + ((item.stock || 0) * (item.cost || 0)), 0);
};

export const formatPaymentTerm = (term: string): string => {
  if (!term) return 'Due on Receipt';
  const days = parsePaymentTerms(term);
  if (days === 0) {
    if (term.toLowerCase().includes('receipt') || term.toLowerCase().includes('cod') || term.toLowerCase().includes('immediate')) return term;
    return 'Due on Receipt';
  }
  return `${days} days`;
};

export const parsePaymentTerms = (terms: string): number => {
  if (!terms) return 0;
  // Handle "Net X" format
  const netMatch = terms.match(/Net\s*(\d+)/i);
  if (netMatch) return parseInt(netMatch[1]);

  // Handle "X days" format
  const daysMatch = terms.match(/(\d+)\s*days/i);
  if (daysMatch) return parseInt(daysMatch[1]);

  // Default common terms
  switch (terms.toLowerCase()) {
    case 'due on receipt': return 0;
    case 'cod': return 0;
    case 'end of month': {
      const d = new Date();
      const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0);
      return Math.max(0, Math.ceil((lastDay.getTime() - d.getTime()) / (1000 * 60 * 60 * 24)));
    }
    default: return 0;
  }
};

export const calculateDueDate = (date: string | Date, terms: string): string => {
  const baseDate = new Date(date);
  const days = parsePaymentTerms(terms);
  const dueDate = new Date(baseDate);
  dueDate.setDate(baseDate.getDate() + days);
  return dueDate.toISOString().split('T')[0];
};

export const DEFAULT_PAYMENT_TERMS: Record<string, string> = {
  'Individual': 'Net 7',
  'School Account': 'Net 365',
  'Institution': 'Net 30',
  'Government': 'Net 7',
  'Examination Account': 'Net 30'
};

export type PaymentTransactionType = 'invoice' | 'order' | 'quotation' | 'recurring' | 'other';

const SUB_ACCOUNT_PAYMENT_TERMS = 'Net 30';
const QUOTATION_PAYMENT_TERMS = 'Net 7';
const FALLBACK_MAIN_ACCOUNT_PAYMENT_TERMS = 'Net 30';
const MANAGED_PAYMENT_TERMS = new Set(
  [...Object.values(DEFAULT_PAYMENT_TERMS), FALLBACK_MAIN_ACCOUNT_PAYMENT_TERMS, 'Due on Receipt']
    .map((term) => String(term || '').trim().toLowerCase())
);

export const isSubAccountSelection = (subAccountName?: string | null): boolean => {
  const normalized = String(subAccountName || '').trim().toLowerCase();
  return Boolean(normalized) && normalized !== 'main' && normalized !== 'main account';
};

export const getDefaultPaymentTermsForSegment = (segment?: string | null): string => {
  const normalizedSegment = String(segment || '').trim();
  return DEFAULT_PAYMENT_TERMS[normalizedSegment] || FALLBACK_MAIN_ACCOUNT_PAYMENT_TERMS;
};

export const hasCustomPaymentTerms = (customer?: { paymentTerms?: string } | null): boolean => {
  const raw = String(customer?.paymentTerms || '').trim();
  if (!raw) return false;
  return !MANAGED_PAYMENT_TERMS.has(raw.toLowerCase());
};

export const resolveCustomerPaymentTerms = ({
  customer,
  subAccountName,
  transactionType = 'invoice',
  preserveCustomTerms = true
}: {
  customer?: { segment?: string; paymentTerms?: string } | null;
  subAccountName?: string | null;
  transactionType?: PaymentTransactionType;
  preserveCustomTerms?: boolean;
}): string => {
  if (transactionType === 'quotation') {
    return QUOTATION_PAYMENT_TERMS;
  }

  if (isSubAccountSelection(subAccountName)) {
    return SUB_ACCOUNT_PAYMENT_TERMS;
  }

  if (preserveCustomTerms && hasCustomPaymentTerms(customer)) {
    return String(customer?.paymentTerms || '').trim();
  }

  return getDefaultPaymentTermsForSegment(customer?.segment);
};

export const resolveCustomerPaymentPolicy = ({
  customer,
  subAccountName,
  transactionType = 'invoice',
  issuedDate,
  preserveCustomTerms = true
}: {
  customer?: { segment?: string; paymentTerms?: string } | null;
  subAccountName?: string | null;
  transactionType?: PaymentTransactionType;
  issuedDate: string | Date;
  preserveCustomTerms?: boolean;
}): { paymentTerms: string; dueDate: string } => {
  const paymentTerms = resolveCustomerPaymentTerms({
    customer,
    subAccountName,
    transactionType,
    preserveCustomTerms
  });

  return {
    paymentTerms,
    dueDate: calculateDueDate(issuedDate, paymentTerms)
  };
};

export const getPaymentTermsForCustomer = (
  customer: { segment?: string; paymentTerms?: string },
  subAccountName?: string
): string => resolveCustomerPaymentTerms({
  customer,
  subAccountName,
  transactionType: 'invoice',
  preserveCustomTerms: true
});

export const getFontStack = (font?: string) => {
  switch (font) {
    case 'Roboto': return '"Roboto", "Helvetica Neue", Helvetica, Arial, sans-serif';
    case 'Playfair Display': return '"Playfair Display", Georgia, serif';
    case 'JetBrains Mono': return '"JetBrains Mono", "Courier New", monospace';
    case 'Montserrat': return '"Montserrat", sans-serif';
    case 'Comic Sans MS': return '"Comic Sans MS", "Comic Sans", cursive';
    case 'Century Gothic': return '"Century Gothic", CenturyGothic, AppleGothic, sans-serif';
    case 'Courier New': return 'Courier, monospace';
    case 'Georgia': return 'Georgia, serif';
    case 'Helvetica': return '"Helvetica Neue", Helvetica, Arial, sans-serif';
    default: return '"Inter", sans-serif';
  }
};

/**
 * Utility to download a blob and revoke its URL after a delay
 */
export const downloadBlob = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  
  // Revoke after a delay to ensure the browser has started the download
  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 1000); // 1 second is safe for most browsers
};

/**
 * Utility to export data to CSV and trigger download
 */
export const exportToCSV = (data: any[], filename: string) => {
  if (!data || !data.length) return;

  const headers = Object.keys(data[0]);
  const csvContent = [
    headers.join(','),
    ...data.map(row =>
      headers.map(fieldName => {
        const value = row[fieldName];
        const strValue = value === null || value === undefined ? '' : String(value);
        // Escape quotes and wrap in quotes if contains comma
        const escaped = strValue.replace(/"/g, '""');
        return escaped.includes(',') ? `"${escaped}"` : escaped;
      }).join(',')
    )
  ].join('\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  downloadBlob(blob, `${filename}_${new Date().toISOString().split('T')[0]}.csv`);
};

export interface ClassPricingInputs {
  bom: number;
  adjustmentAmount?: number;
  marginAmount?: number;
  learners: number;
  adjustmentRate?: number;
  profitMargin?: number;
  roundingDirection?: 'nearest' | 'up' | 'down';
}

export interface ClassPricingResult {
  finalClassTotal: number;
  roundedFeePerLearner: number;
  rawFeePerLearner: number;
  rawClassTotal: number;
  adjustedCost: number;
  roundingDifference: number;
  roundingDirection: 'nearest' | 'up' | 'down';
}

export const calculateClassPricing = (inputs: ClassPricingInputs): ClassPricingResult => {
  const { bom, learners, adjustmentAmount, marginAmount, adjustmentRate = 0, profitMargin = 0, roundingDirection = 'up' } = inputs;
  
  const safeLearners = Math.max(1, Math.floor(learners || 0));
  
  const adjustedCost = adjustmentAmount !== undefined
    ? Number((bom + adjustmentAmount).toFixed(2))
    : Number((bom * (1 + adjustmentRate)).toFixed(2));
  
  const rawTotal = marginAmount !== undefined
    ? Number((adjustedCost + marginAmount).toFixed(2))
    : Number((adjustedCost * (1 + profitMargin)).toFixed(2));
  
  const rawFeePerLearner = Number((rawTotal / safeLearners).toFixed(2));
  
  let roundedFeePerLearner: number;
  
  if (roundingDirection === 'up') {
    roundedFeePerLearner = Math.ceil(rawFeePerLearner / 50) * 50;
  } else if (roundingDirection === 'down') {
    roundedFeePerLearner = Math.floor(rawFeePerLearner / 50) * 50;
  } else {
    const rawFeeRoundedDown = Math.floor(rawFeePerLearner / 50) * 50;
    const rawFeeRoundedUp = Math.ceil(rawFeePerLearner / 50) * 50;
    const diffDown = Math.abs(rawFeePerLearner - rawFeeRoundedDown);
    const diffUp = Math.abs(rawFeePerLearner - rawFeeRoundedUp);
    roundedFeePerLearner = diffUp <= diffDown ? rawFeeRoundedUp : rawFeeRoundedDown;
  }
  
  const finalClassTotal = Number((roundedFeePerLearner * safeLearners).toFixed(2));
  
  const roundingDifference = Number((finalClassTotal - rawTotal).toFixed(2));
  
  return {
    finalClassTotal,
    roundedFeePerLearner,
    rawFeePerLearner,
    rawClassTotal: rawTotal,
    adjustedCost,
    roundingDifference,
    roundingDirection: roundingDirection as 'nearest' | 'up' | 'down'
  };
};
