import { dbService } from './db';
import { examinationBatchService } from './examinationBatchService';
import { Item, MarketAdjustment } from '../types';

const isTruthy = (value: unknown) => {
  if (typeof value === 'boolean') return value;
  const normalized = String(value ?? '').trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on';
};

const isBomRelevantInventoryItem = (item: Partial<Item>) => {
  const hint = `${String(item.name || '')} ${String(item.category || '')} ${String((item as Partial<Item> & Record<string, unknown>).material || '')}`.toLowerCase();
  return hint.includes('paper') || hint.includes('toner');
};

const normalizeAdjustmentForSync = (
  adjustment: MarketAdjustment
): Partial<MarketAdjustment> & Record<string, unknown> => {
  const active = Boolean(adjustment.active ?? adjustment.isActive ?? true);
  const normalizedType: MarketAdjustment['type'] =
    String(adjustment.type || 'PERCENTAGE').toUpperCase() === 'FIXED' ? 'FIXED' : 'PERCENTAGE';
  return {
    id: String(adjustment.id),
    name: String(adjustment.name || adjustment.displayName || 'Adjustment'),
    displayName: String(adjustment.displayName || adjustment.name || 'Adjustment'),
    type: normalizedType,
    value: Number(adjustment.value ?? adjustment.percentage ?? 0),
    percentage: Number(adjustment.percentage ?? adjustment.value ?? 0),
    appliesTo: 'COST' as const,
    active,
    isActive: active,
    description: String(adjustment.description || ''),
    category: String(adjustment.category || ''),
    adjustmentCategory: (adjustment as Partial<MarketAdjustment> & Record<string, unknown>).adjustmentCategory || (adjustment as Partial<MarketAdjustment> & Record<string, unknown>).adjustment_category || null,
    sortOrder: Number((adjustment as Partial<MarketAdjustment> & Record<string, unknown>).sortOrder ?? (adjustment as Partial<MarketAdjustment> & Record<string, unknown>).sort_order ?? 0),
    createdAt: adjustment.createdAt || undefined
  };
};

const normalizeInventoryForSync = (item: Partial<Item>) => ({
  id: String(item.id || ''),
  name: String(item.name || item.category || 'Material'),
  material: String((item as Partial<Item> & Record<string, unknown>).material || item.category || item.type || ''),
  category_id: String(item.category || ''),
  unit: String(item.unit || 'units'),
  quantity: Number((item as Partial<Item> & Record<string, unknown>).quantity ?? item.stock ?? 0),
  cost_per_unit: Number(item.cost_price ?? item.cost ?? 0),
  conversion_rate: Number((item as Partial<Item> & Record<string, unknown>).conversionRate ?? (item as Partial<Item> & Record<string, unknown>).conversion_rate ?? 500),
  last_updated: new Date().toISOString()
});

export const syncMarketAdjustmentsToBackend = async (options?: { triggerRecalculate?: boolean }) => {
  const allAdjustments = await dbService.getAll<MarketAdjustment>('marketAdjustments');
  return examinationBatchService.syncMarketAdjustments({
    adjustments: (allAdjustments || []).map(normalizeAdjustmentForSync),
    replaceMissing: true,
    triggerRecalculate: options?.triggerRecalculate ?? true
  });
};

export const syncBomRelevantInventoryToBackend = async (
  options?: { items?: Array<Partial<Item> & { id: string }>; triggerRecalculate?: boolean }
) => {
  const sourceItems = options?.items || await dbService.getAll<Item>('inventory');
  const payloadItems = (sourceItems || [])
    .filter((item) => Boolean(item?.id))
    .map((item) => normalizeInventoryForSync(item));

  return examinationBatchService.syncInventoryItems({
    items: payloadItems,
    triggerRecalculate: options?.triggerRecalculate ?? true
  });
};

export const syncInventoryItemIfBomRelevant = async (
  item: Partial<Item> & { id: string },
  options?: { triggerRecalculate?: boolean }
) => {
  return syncBomRelevantInventoryToBackend({
    items: [item],
    triggerRecalculate: options?.triggerRecalculate ?? true
  });
};

export const isItemBomRelevant = isBomRelevantInventoryItem;
export const toBool = isTruthy;

// Settings sync helpers
export const syncExamPricingSettingsToBackend = async (payload: {
  paper_item_id?: string | null;
  toner_item_id?: string | null;
  conversion_rate?: number;
  trigger_recalculate?: boolean;
}) => {
  return examinationBatchService.updatePricingSettings(payload);
};

export const fetchExamPricingSettingsFromBackend = async () => {
  return examinationBatchService.getPricingSettings();
};

export const examinationSyncService = {
  syncMarketAdjustmentsToBackend,
  syncBomRelevantInventoryToBackend,
  syncInventoryItemIfBomRelevant,
  isItemBomRelevant,
  toBool,
  syncExamPricingSettingsToBackend,
  fetchExamPricingSettingsFromBackend
};
