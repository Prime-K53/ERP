import type { MarketAdjustment } from '../../types';
import { describe, expect, it } from 'vitest';
import { isMarketAdjustmentActive } from '../../utils/marketAdjustmentUtils';

describe('marketAdjustmentUtils', () => {
  it('treats boolean, numeric, and string active flags consistently', () => {
    expect(isMarketAdjustmentActive({ active: true } as Partial<MarketAdjustment>)).toBe(true);
    expect(isMarketAdjustmentActive({ active: 1 as unknown as boolean } as Partial<MarketAdjustment>)).toBe(true);
    expect(isMarketAdjustmentActive({ active: '1' as unknown as boolean } as Partial<MarketAdjustment>)).toBe(true);
    expect(isMarketAdjustmentActive({ isActive: 'true' } as Partial<MarketAdjustment>)).toBe(true);
    expect(isMarketAdjustmentActive({ is_active: 'yes' as unknown as boolean } as Partial<MarketAdjustment>)).toBe(true);
    expect(isMarketAdjustmentActive({ active: false } as Partial<MarketAdjustment>)).toBe(false);
    expect(isMarketAdjustmentActive({ active: 0 as unknown as boolean } as Partial<MarketAdjustment>)).toBe(false);
    expect(isMarketAdjustmentActive({ isActive: 'false' } as Partial<MarketAdjustment>)).toBe(false);
  });

  it('defaults missing active flags to active', () => {
    expect(isMarketAdjustmentActive({ id: 'adj-1' } as Partial<MarketAdjustment>)).toBe(true);
    expect(isMarketAdjustmentActive(undefined)).toBe(true);
  });
});
