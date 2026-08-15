import { MarketAdjustment } from '../types';

export const MARKET_ADJUSTMENTS_CHANGED_EVENT = 'market-adjustments:changed';

export const isMarketAdjustmentActive = (
  adjustment: Partial<MarketAdjustment> | null | undefined
): boolean => {
  const activeValue = adjustment?.active ?? adjustment?.isActive ?? (adjustment as Partial<MarketAdjustment> & { is_active?: boolean })?.is_active;

  if (activeValue === undefined || activeValue === null) {
    return true;
  }

  if (typeof activeValue === 'boolean') {
    return activeValue;
  }

  if (typeof activeValue === 'number') {
    return activeValue === 1;
  }

  const normalized = String(activeValue).trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on';
};
