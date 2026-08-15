import { describe, expect, it } from 'vitest';
import { normalizeInventoryItemPricing, normalizeInventoryItemType } from '../../utils/pricing';
import type { Item } from '../../types';

describe('inventory item normalization', () => {
  it('maps backend inventory type values to frontend classifications', () => {
    expect(normalizeInventoryItemType('material')).toBe('Raw Material');
    expect(normalizeInventoryItemType('product')).toBe('Product');
    expect(normalizeInventoryItemType('stationery')).toBe('Stationery');
    expect(normalizeInventoryItemType('service')).toBe('Service');
    expect(normalizeInventoryItemType(undefined, 'printing_service')).toBe('Service');
  });

  it('hydrates stock and canonical type from backend-shaped rows', () => {
    const item = normalizeInventoryItemPricing({
      id: 'itm-1',
      name: 'Bond Paper',
      sku: 'RAW-001',
      type: 'material',
      quantity: 25,
      cost_per_unit: 12,
      selling_price: 0,
    } as unknown as Item);

    expect(item.type).toBe('Raw Material');
    expect(item.stock).toBe(25);
    expect(item.quantity).toBe(25);
    expect(item.cost).toBe(12);
    expect(item.costPrice).toBe(12);
  });
});
