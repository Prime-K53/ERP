import type { Customer, CustomerPricingTier, DiscountRule, Item } from '../types';
import { dbService } from './db';

const TIER_MULTIPLIERS: Record<string, number> = {
  standard: 1.0,
  premium: 0.95,
  wholesale: 0.85,
  distributor: 0.75,
};

export async function getCustomerPricingTier(customerId: string): Promise<CustomerPricingTier | null> {
  const tiers = await dbService.getAll<any>('customerPricingTiers');
  const tier = tiers.find((t: any) => t.customerId === customerId);
  return tier || null;
}

export function resolveCustomerPrice(
  basePrice: number,
  customerTier: CustomerPricingTier | null,
  customerSegment?: string,
): number {
  if (customerTier?.markupMultiplier) {
    return basePrice * customerTier.markupMultiplier;
  }
  if (customerTier?.discountPercent) {
    return basePrice * (1 - customerTier.discountPercent / 100);
  }
  if (customerSegment && TIER_MULTIPLIERS[customerSegment.toLowerCase()]) {
    return basePrice * TIER_MULTIPLIERS[customerSegment.toLowerCase()];
  }
  return basePrice;
}

export async function getApplicableDiscounts(
  customerId: string,
  customerSegment: string | undefined,
  itemCategory: string | undefined,
  orderTotal: number,
): Promise<DiscountRule[]> {
  const allRules = await dbService.getAll<any>('discountRules');
  const now = new Date().toISOString();

  return allRules.filter((rule: DiscountRule) => {
    if (!rule.active) return false;
    if (rule.validFrom && rule.validFrom > now) return false;
    if (rule.validTo && rule.validTo < now) return false;
    if (rule.usageLimit && rule.usageCount >= rule.usageLimit) return false;
    if (rule.minOrderAmount && orderTotal < rule.minOrderAmount) return false;
    if (rule.scope === 'global') return true;
    if (rule.scope === 'customer_segment' && customerSegment && rule.scopeValue === customerSegment) return true;
    if (rule.scope === 'customer_specific' && rule.scopeValue === customerId) return true;
    if (rule.scope === 'category' && itemCategory && rule.scopeValue === itemCategory) return true;
    return false;
  }).sort((a, b) => a.priority - b.priority);
}

export function applyDiscounts(
  lineTotal: number,
  quantity: number,
  unitPrice: number,
  discounts: DiscountRule[],
): { discountedTotal: number; appliedDiscounts: { ruleId: string; amount: number }[] } {
  let total = lineTotal;
  const appliedDiscounts: { ruleId: string; amount: number }[] = [];

  for (const rule of discounts) {
    let discountAmount = 0;
    if (rule.type === 'percentage') {
      discountAmount = total * (rule.value / 100);
    } else {
      discountAmount = Math.min(rule.value * quantity, total);
    }
    if (rule.maxDiscountAmount) {
      discountAmount = Math.min(discountAmount, rule.maxDiscountAmount);
    }
    discountAmount = Math.round(discountAmount * 1000) / 1000;
    if (discountAmount > 0) {
      total -= discountAmount;
      appliedDiscounts.push({ ruleId: rule.id, amount: discountAmount });
    }
  }

  return { discountedTotal: Math.max(0, total), appliedDiscounts };
}

export async function incrementDiscountUsage(discountId: string): Promise<void> {
  const allRules = await dbService.getAll<any>('discountRules');
  const rule = allRules.find((r: any) => r.id === discountId);
  if (rule) {
    rule.usageCount = (rule.usageCount || 0) + 1;
    await dbService.put('discountRules', rule);
  }
}
