import { resolveOfflineEffectiveMargin } from '../services/offlineProfitMargins';

export interface EffectiveMargin {
  margin_value: number;
  margin_type: 'percentage' | 'fixed_amount';
  source: 'line_item' | 'category' | 'global' | 'system';
  apply_volume_margins?: boolean;
}

const cache = new Map<string, EffectiveMargin>();

export async function getEffectiveMargin(
  lineItemId?: string | null,
  categoryId?: string | null,
  useCache = true
): Promise<EffectiveMargin> {
  const cacheKey = `${lineItemId ?? ''}|${categoryId ?? ''}`;

  if (useCache && cache.has(cacheKey)) {
    return cache.get(cacheKey)!;
  }

  const localMargin = resolveOfflineEffectiveMargin(lineItemId, categoryId);
  if (useCache) cache.set(cacheKey, localMargin);
  return localMargin;
}

export function invalidateMarginCache(lineItemId?: string, categoryId?: string) {
  if (!lineItemId && !categoryId) {
    cache.clear();
    return;
  }

  for (const key of cache.keys()) {
    const [cachedLineItemId, cachedCategoryId] = key.split('|');
    if (
      (lineItemId && cachedLineItemId === lineItemId)
      || (categoryId && cachedCategoryId === categoryId)
    ) {
      cache.delete(key);
    }
  }
}

export function applyMargin(baseCost: number, margin: EffectiveMargin): number {
  if (margin.margin_type === 'percentage') {
    return baseCost * (1 + margin.margin_value / 100);
  }

  return baseCost + margin.margin_value;
}

export async function getSellingPrice(
  baseCost: number,
  lineItemId?: string | null,
  categoryId?: string | null
): Promise<{ sellingPrice: number; margin: EffectiveMargin }> {
  const margin = await getEffectiveMargin(lineItemId, categoryId);
  return { sellingPrice: applyMargin(baseCost, margin), margin };
}
