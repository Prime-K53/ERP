import {
  CompanyConfig,
  PricingRoundingMethod,
  PricingSettings,
  PricingThresholdRule,
  RoundingAnalytics
} from '../types';
import { roundToCurrency } from '../utils/helpers';
import { dbService } from './db';

export type RoundingScope = 'pos' | 'invoice' | 'quotation';

export interface ApplyRoundingConfig {
  method: PricingRoundingMethod;
  customStep?: number;
  profitProtectionMode?: boolean;
  enableSmartThresholds?: boolean;
  thresholdRules?: PricingThresholdRule[];
}

export interface ApplyRoundingResult {
  originalPrice: number;
  roundedPrice: number;
  roundingDifference: number;
  methodUsed: PricingRoundingMethod;
  stepUsed: number;
}

export interface TransactionRoundingResult extends ApplyRoundingResult {
  applyRounding: boolean;
  wasRounded: boolean;
}

export interface ProductPriceRoundingResult extends ApplyRoundingResult {
  applyRounding: boolean;
  wasRounded: boolean;
  alreadyRounded: boolean;
}

export const ROUNDING_METHOD_OPTIONS: { value: PricingRoundingMethod; label: string }[] = [
  { value: 'ALWAYS_UP_50', label: 'Always Up (50)' },
  { value: 'ALWAYS_UP_100', label: 'Always Up (100)' },
  { value: 'ALWAYS_UP_500', label: 'Always Up (500)' },
  { value: 'ALWAYS_UP_10', label: 'Always Up (10)' },
  { value: 'ALWAYS_UP_CUSTOM', label: 'Always Up (Custom)' },
  { value: 'NEAREST_10', label: 'Nearest (10)' },
  { value: 'NEAREST_50', label: 'Nearest (50)' },
  { value: 'NEAREST_100', label: 'Nearest (100)' },
  { value: 'PSYCHOLOGICAL', label: 'Psychological (.99/.999)' }
];

const ROUNDING_ANALYTICS_KEY = 'nexus_rounding_analytics';

export const DEFAULT_PRICING_SETTINGS: PricingSettings = {
  enableRounding: true,
  defaultMethod: 'ALWAYS_UP_50',
  customStep: 50,
  applyToPOS: true,
  applyToInvoices: true,
  applyToQuotations: true,
  allowManualOverride: true,
  showOriginalPrice: true,
  profitProtectionMode: true,
  enableSmartThresholds: true,
  thresholdRules: [
    { minPrice: 0, maxPrice: 10000, step: 50 },
    { minPrice: 10000, step: 100 }
  ],
  analytics: {
    totalExtraProfit: 0,
    roundedTransactions: 0,
    byMethod: {}
  }
};

const isFiniteNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

const sanitizeStep = (step: number | undefined, fallback: number): number => {
  const candidate = Number(step);
  if (!Number.isFinite(candidate) || candidate <= 0) return fallback;
  return candidate;
};

const resolveStep = (method: PricingRoundingMethod, customStep: number): number => {
  switch (method) {
    case 'NEAREST_10':
    case 'ALWAYS_UP_10':
      return 10;
    case 'NEAREST_50':
    case 'ALWAYS_UP_50':
      return 50;
    case 'NEAREST_100':
    case 'ALWAYS_UP_100':
      return 100;
    case 'ALWAYS_UP_500':
      return 500;
    case 'ALWAYS_UP_CUSTOM':
      return sanitizeStep(customStep, 1);
    case 'PSYCHOLOGICAL':
    default:
      return 1;
  }
};

const applyPsychologicalRounding = (price: number): number => {
  if (price <= 0) {
    // Refund-safe fallback: move toward zero to avoid over-refunding.
    return Math.ceil(price / 10) * 10;
  }

  let magnitude = 10;
  if (price >= 100) magnitude = 100;
  if (price >= 1000) magnitude = 1000;

  let candidate = Math.floor(price / magnitude) * magnitude + (magnitude - 1);
  if (candidate < price) candidate += magnitude;
  return candidate;
};

const applyMethodRounding = (price: number, method: PricingRoundingMethod, step: number): number => {
  switch (method) {
    case 'NEAREST_10':
    case 'NEAREST_50':
    case 'NEAREST_100':
      return Math.round(price / step) * step;
    case 'ALWAYS_UP_10':
    case 'ALWAYS_UP_50':
    case 'ALWAYS_UP_100':
    case 'ALWAYS_UP_500':
    case 'ALWAYS_UP_CUSTOM':
      return Math.ceil(price / step) * step;
    case 'PSYCHOLOGICAL':
      return applyPsychologicalRounding(price);
    default:
      return price;
  }
};

const enforceProfitProtection = (
  originalPrice: number,
  roundedPrice: number,
  method: PricingRoundingMethod,
  step: number
): number => {
  if (roundedPrice >= originalPrice) return roundedPrice;

  if (method === 'PSYCHOLOGICAL') {
    return applyPsychologicalRounding(originalPrice);
  }

  const normalizedStep = Math.max(step, 1);
  return Math.ceil(originalPrice / normalizedStep) * normalizedStep;
};

const resolveThresholdRule = (
  price: number,
  method: PricingRoundingMethod,
  customStep: number,
  enableSmartThresholds?: boolean,
  thresholdRules?: PricingThresholdRule[]
): { method: PricingRoundingMethod; step: number } => {
  if (!enableSmartThresholds || !thresholdRules || thresholdRules.length === 0) {
    return { method, step: resolveStep(method, customStep) };
  }

  const comparablePrice = Math.abs(price);
  const matchedRule = thresholdRules.find((rule) => {
    const minOk = comparablePrice >= Number(rule.minPrice || 0);
    const maxOk = !isFiniteNumber(rule.maxPrice) || comparablePrice < Number(rule.maxPrice);
    return minOk && maxOk;
  });

  if (!matchedRule) {
    return { method, step: resolveStep(method, customStep) };
  }

  const resolvedMethod = matchedRule.method || method;
  const resolvedStep = sanitizeStep(matchedRule.step, customStep);
  return {
    method: resolvedMethod,
    step: matchedRule.step !== undefined ? resolvedStep : resolveStep(resolvedMethod, resolvedStep)
  };
};

const parseAnalytics = (raw: string | null): RoundingAnalytics => {
  if (!raw) return { totalExtraProfit: 0, roundedTransactions: 0, byMethod: {} };

  try {
    const parsed = JSON.parse(raw);
    return {
      totalExtraProfit: Number(parsed?.totalExtraProfit || 0),
      roundedTransactions: Number(parsed?.roundedTransactions || 0),
      lastUpdatedAt: parsed?.lastUpdatedAt,
      byMethod: parsed?.byMethod || {}
    };
  } catch {
    return { totalExtraProfit: 0, roundedTransactions: 0, byMethod: {} };
  }
};

export const getPricingSettings = (companyConfig?: CompanyConfig | null): PricingSettings => {
  const incoming = (companyConfig?.pricingSettings || {}) as Partial<PricingSettings>;
  const merged: PricingSettings = {
    ...DEFAULT_PRICING_SETTINGS,
    ...incoming,
    customStep: sanitizeStep(incoming.customStep, DEFAULT_PRICING_SETTINGS.customStep),
    thresholdRules: (incoming.thresholdRules && incoming.thresholdRules.length > 0)
      ? (incoming.thresholdRules as PricingThresholdRule[]).map((rule) => ({
        ...rule,
        minPrice: Number(rule.minPrice || 0),
        maxPrice: isFiniteNumber(rule.maxPrice) ? Number(rule.maxPrice) : undefined,
        step: sanitizeStep(rule.step, DEFAULT_PRICING_SETTINGS.customStep)
      }))
      : DEFAULT_PRICING_SETTINGS.thresholdRules,
    analytics: {
      ...(DEFAULT_PRICING_SETTINGS.analytics || {}),
      ...(incoming.analytics || {})
    } as RoundingAnalytics
  };

  return merged;
};

export const isRoundingEnabledForScope = (
  companyConfig: CompanyConfig | null | undefined,
  scope: RoundingScope
): boolean => {
  const settings = getPricingSettings(companyConfig);
  if (!settings.enableRounding) return false;

  if (scope === 'pos') return settings.applyToPOS;
  if (scope === 'invoice') return settings.applyToInvoices;
  return settings.applyToQuotations;
};

export const applyRounding = (price: number, config: ApplyRoundingConfig): ApplyRoundingResult => {
  const originalPrice = roundToCurrency(Number(price || 0));
  const normalizedMethod = config.method || DEFAULT_PRICING_SETTINGS.defaultMethod;
  const safeCustomStep = sanitizeStep(config.customStep, DEFAULT_PRICING_SETTINGS.customStep);
  const resolved = resolveThresholdRule(
    originalPrice,
    normalizedMethod,
    safeCustomStep,
    config.enableSmartThresholds,
    config.thresholdRules
  );

  let roundedPrice = applyMethodRounding(originalPrice, resolved.method, resolved.step);
  if (config.profitProtectionMode !== false) {
    roundedPrice = enforceProfitProtection(originalPrice, roundedPrice, resolved.method, resolved.step);
  }

  const safeRoundedPrice = roundToCurrency(roundedPrice);
  return {
    originalPrice,
    roundedPrice: safeRoundedPrice,
    roundingDifference: roundToCurrency(safeRoundedPrice - originalPrice),
    methodUsed: resolved.method,
    stepUsed: resolved.step
  };
};

export const applyTransactionRounding = (params: {
  price: number;
  companyConfig?: CompanyConfig | null;
  scope: RoundingScope;
  applyRoundingOverride?: boolean;
  methodOverride?: PricingRoundingMethod;
  customStepOverride?: number;
}): TransactionRoundingResult => {
  const settings = getPricingSettings(params.companyConfig);
  const shouldApplyByScope = isRoundingEnabledForScope(params.companyConfig, params.scope);
  const shouldApply = params.applyRoundingOverride !== undefined
    ? params.applyRoundingOverride
    : shouldApplyByScope;

  const fallbackMethod = params.methodOverride || settings.defaultMethod;
  const basePrice = roundToCurrency(Number(params.price || 0));

  if (!shouldApply) {
    return {
      originalPrice: basePrice,
      roundedPrice: basePrice,
      roundingDifference: 0,
      methodUsed: fallbackMethod,
      stepUsed: resolveStep(fallbackMethod, settings.customStep),
      applyRounding: false,
      wasRounded: false
    };
  }

  const result = applyRounding(basePrice, {
    method: fallbackMethod,
    customStep: params.customStepOverride ?? settings.customStep,
    profitProtectionMode: settings.profitProtectionMode,
    enableSmartThresholds: settings.enableSmartThresholds,
    thresholdRules: settings.thresholdRules
  });

  return {
    ...result,
    applyRounding: true,
    wasRounded: Math.abs(result.roundingDifference) > 0
  };
};

export const applyProductPriceRounding = (params: {
  calculatedPrice: number;
  companyConfig?: CompanyConfig | null;
  methodOverride?: PricingRoundingMethod;
  customStepOverride?: number;
  applyRoundingOverride?: boolean;
  existingCalculatedPrice?: number;
  existingRoundedPrice?: number;
  existingRoundingDifference?: number;
  existingRoundingMethod?: PricingRoundingMethod;
  skipIfAlreadyRounded?: boolean;
  trackAnalytics?: boolean;
}): ProductPriceRoundingResult => {
  const settings = getPricingSettings(params.companyConfig);
  const shouldApply = params.applyRoundingOverride !== undefined
    ? params.applyRoundingOverride
    : settings.enableRounding;
  const fallbackMethod = params.methodOverride || settings.defaultMethod;
  const basePrice = roundToCurrency(Number(params.calculatedPrice || 0));

  if (!shouldApply) {
    return {
      originalPrice: basePrice,
      roundedPrice: basePrice,
      roundingDifference: 0,
      methodUsed: fallbackMethod,
      stepUsed: resolveStep(fallbackMethod, settings.customStep),
      applyRounding: false,
      wasRounded: false,
      alreadyRounded: false
    };
  }

  const isSameCalculated = isFiniteNumber(params.existingCalculatedPrice)
    && Math.abs(Number(params.existingCalculatedPrice) - basePrice) < 0.000001;
  const hasStoredRounded = isFiniteNumber(params.existingRoundedPrice)
    && isFiniteNumber(params.existingRoundingDifference);
  const sameMethod = !params.existingRoundingMethod || params.existingRoundingMethod === fallbackMethod;
  const alreadyRounded = (params.skipIfAlreadyRounded ?? true) && isSameCalculated && hasStoredRounded && sameMethod;

  if (alreadyRounded) {
    return {
      originalPrice: basePrice,
      roundedPrice: roundToCurrency(Number(params.existingRoundedPrice)),
      roundingDifference: roundToCurrency(Number(params.existingRoundingDifference)),
      methodUsed: params.existingRoundingMethod || fallbackMethod,
      stepUsed: resolveStep(params.existingRoundingMethod || fallbackMethod, settings.customStep),
      applyRounding: true,
      wasRounded: Math.abs(Number(params.existingRoundingDifference || 0)) > 0,
      alreadyRounded: true
    };
  }

  const result = applyRounding(basePrice, {
    method: fallbackMethod,
    customStep: params.customStepOverride ?? settings.customStep,
    profitProtectionMode: settings.profitProtectionMode,
    enableSmartThresholds: settings.enableSmartThresholds,
    thresholdRules: settings.thresholdRules
  });

  if ((params.trackAnalytics ?? true) && result.roundingDifference > 0) {
    recordRoundingAnalytics(result.roundingDifference, result.methodUsed).catch(() => {});
  }

  return {
    ...result,
    applyRounding: true,
    wasRounded: Math.abs(result.roundingDifference) > 0,
    alreadyRounded: false
  };
};

export const recordRoundingAnalytics = async (
  roundingDifference: number,
  method: PricingRoundingMethod
): Promise<RoundingAnalytics> => {
  if (typeof window === 'undefined' || !window.localStorage) {
    return { totalExtraProfit: 0, roundedTransactions: 0, byMethod: {} };
  }

  const current = parseAnalytics(await dbService.getSetting<string>(ROUNDING_ANALYTICS_KEY) || null);
  const safeDifference = roundToCurrency(Number(roundingDifference || 0));
  if (safeDifference <= 0) return current;

  const byMethod = { ...(current.byMethod || {}) };
  byMethod[method] = roundToCurrency(Number(byMethod[method] || 0) + safeDifference);

  const next: RoundingAnalytics = {
    totalExtraProfit: roundToCurrency(current.totalExtraProfit + safeDifference),
    roundedTransactions: Number(current.roundedTransactions || 0) + 1,
    lastUpdatedAt: new Date().toISOString(),
    byMethod
  };

  await dbService.saveSetting(ROUNDING_ANALYTICS_KEY, next);
  return next;
};

export const getRoundingAnalytics = async (): Promise<RoundingAnalytics> => {
  if (typeof window === 'undefined' || !window.localStorage) {
    return { totalExtraProfit: 0, roundedTransactions: 0, byMethod: {} };
  }
  return parseAnalytics(await dbService.getSetting<string>(ROUNDING_ANALYTICS_KEY) || null);
};

export const normalizeTransactionRounding = <T extends Record<string, any>>(
  transaction: T,
  options: {
    scope: RoundingScope;
    companyConfig?: CompanyConfig | null;
    totalField?: 'total' | 'totalAmount';
  }
): T => {
  if (!transaction) return transaction;

  const totalField = options.totalField ||
    (isFiniteNumber(transaction.totalAmount) ? 'totalAmount' : 'total');

  const currentTotal = Number(transaction[totalField] || 0);
  if (!Number.isFinite(currentTotal)) return transaction;

  // Guard against accidental double-rounding if metadata already reflects the stored total.
  const alreadyRounded = isFiniteNumber(transaction.roundedPrice)
    && isFiniteNumber(transaction.originalPrice)
    && isFiniteNumber(transaction.roundingDifference)
    && Math.abs(Number(transaction.roundedPrice) - currentTotal) < 0.000001;

  if (alreadyRounded) return transaction;

  const result = applyTransactionRounding({
    price: currentTotal,
    companyConfig: options.companyConfig,
    scope: options.scope,
    applyRoundingOverride: transaction.applyRounding,
    methodOverride: transaction.roundingMethod,
    customStepOverride: undefined
  });

  const normalized = {
    ...transaction,
    applyRounding: result.applyRounding,
    roundingMethod: result.methodUsed,
    originalPrice: result.originalPrice,
    roundedPrice: result.roundedPrice,
    roundingDifference: result.roundingDifference,
    [totalField]: result.roundedPrice
  } as T;

  if (isFiniteNumber((normalized as T & Record<string, unknown>).totalAmount)) {
    (normalized as T & Record<string, unknown>).totalAmount = result.roundedPrice;
  }
  if (isFiniteNumber((normalized as T & Record<string, unknown>).total)) {
    (normalized as T & Record<string, unknown>).total = result.roundedPrice;
  }
  if (isFiniteNumber((normalized as T & Record<string, unknown>).bill_total)) {
    (normalized as T & Record<string, unknown>).bill_total = result.roundedPrice;
  }

  if (result.applyRounding && result.roundingDifference > 0) {
    recordRoundingAnalytics(result.roundingDifference, result.methodUsed).catch(() => {});
  }

  return normalized;
};
