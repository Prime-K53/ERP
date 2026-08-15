import { roundMoney } from '../utils/roundingUtils';

export interface ValidationResult {
  valid: boolean;
  profit: number;
  profitMarkup: number;
  minimumMarkup: number;
  message?: string;
}

export interface PricingSnapshot {
  costPrice: number;
  sellingPrice: number;
  profit: number;
  profitMarkup: number;
  minimumMarkup: number;
  validated: boolean;
  validatedAt: string;
}

const MARGIN_STORE_KEY = 'nexus_profit_margin_settings';

const markupScopePriority = ['product', 'category', 'global'] as const;

interface MarkupRecord {
  id?: string;
  scope: string;
  category?: string;
  productId?: string;
  // Keep margin_type/margin_value field names for localStorage compatibility
  margin_type: 'percentage' | 'fixed_amount';
  margin_value: number;
  deleted_at?: string;
}

const loadMarkupRecords = (): MarkupRecord[] => {
  try {
    const raw = localStorage.getItem(MARGIN_STORE_KEY);
    if (!raw) return [];
    return JSON.parse(raw).filter((r: MarkupRecord) => !r.deleted_at);
  } catch {
    return [];
  }
};

export const resolveMinimumMarkup = (item?: { category?: string; id?: string }): number => {
  const records = loadMarkupRecords();
  const activeRecords = records.filter((r) => !r.deleted_at);

  const productRecord = activeRecords.find(
    (r) => r.scope === 'product' && r.productId === item?.id
  );
  if (productRecord) return Number(productRecord.margin_value) || 0;

  const categoryRecord = activeRecords.find(
    (r) => r.scope === 'category' && r.category === item?.category
  );
  if (categoryRecord) return Number(categoryRecord.margin_value) || 0;

  const globalRecord = activeRecords.find((r) => r.scope === 'global');
  if (globalRecord) return Number(globalRecord.margin_value) || 0;

  // Fallback: check company config pricingSettings (same as getGlobalDefaultMarginFromLocalStorage)
  try {
    const configRaw = localStorage.getItem('nexus_company_config');
    if (configRaw) {
      const config = JSON.parse(configRaw);
      const gdm = config?.pricingSettings?.globalDefaultMargin;
      if (gdm && Number(gdm.margin_value) > 0) {
        return Number(gdm.margin_value);
      }
      const flatValue = Number(config?.pricingSettings?.defaultMarginValue ?? config?.pricingSettings?.marginValue ?? 0);
      if (flatValue > 0) {
        return flatValue;
      }
    }
  } catch {
    // non-fatal parse error
  }

  return 20;
};

export const calculateProfit = (costPrice: number, sellingPrice: number): number => {
  return roundMoney(sellingPrice - costPrice);
};

export const calculateMarkup = (costPrice: number, sellingPrice: number): number => {
  if (costPrice <= 0) return 0;
  return roundMoney(((sellingPrice - costPrice) / costPrice) * 100);
};

export const validateMinimumMarkup = (
  costPrice: number,
  sellingPrice: number,
  item?: { category?: string; id?: string }
): ValidationResult => {
  const profit = calculateProfit(costPrice, sellingPrice);
  const profitMarkup = calculateMarkup(costPrice, sellingPrice);
  const minimumMarkup = resolveMinimumMarkup(item);

  return {
    profit,
    profitMarkup,
    minimumMarkup,
    valid: profitMarkup >= minimumMarkup,
    message:
      profitMarkup < minimumMarkup
        ? `Calculated markup (${profitMarkup.toFixed(1)}%) is below the minimum required markup (${minimumMarkup}%). Increase the selling price or reduce production costs before saving.`
        : undefined,
  };
};

export const buildPricingSnapshot = (
  costPrice: number,
  sellingPrice: number,
  item?: { category?: string; id?: string }
): PricingSnapshot => {
  const validation = validateMinimumMarkup(costPrice, sellingPrice, item);
  return {
    costPrice: roundMoney(costPrice),
    sellingPrice: roundMoney(sellingPrice),
    profit: validation.profit,
    profitMarkup: validation.profitMarkup,
    minimumMarkup: validation.minimumMarkup,
    validated: validation.valid,
    validatedAt: new Date().toISOString(),
  };
};

export const validateItemPricing = (
  item: { costPrice?: number; sellingPrice?: number; cost?: number; price?: number; category?: string; id?: string }
): ValidationResult => {
  const costPrice = item.costPrice ?? item.cost ?? 0;
  const sellingPrice = item.sellingPrice ?? item.price ?? 0;
  return validateMinimumMarkup(Number(costPrice), Number(sellingPrice), item);
};
