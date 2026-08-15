/**
 * Backend Pricing Engine
 * Replicates frontend pricing logic for server-side validation
 *
 * CRITICAL: All pricing calculations MUST go through this engine
 * to ensure consistency between frontend and backend
 */

const repo = require('./supabaseRepository.cjs');
const { roundToCurrency, calculateMarginAmount } = require('../utils/mathUtils.cjs');

const PRICING_ENGINE_VERSION = '1.0.0';

const normalizeSnapshot = (adj) => ({
  name: adj.name || 'Adjustment',
  type: adj.type || (adj.percentage !== undefined ? 'PERCENTAGE' : 'FIXED'),
  value: Number(adj.value) || 0,
  percentage: adj.percentage ?? (adj.type === 'PERCENTAGE' ? adj.value : undefined),
  adjustmentId: adj.adjustmentId,
  adjustmentCategory: adj.adjustmentCategory,
  isActive: adj.isActive !== false,
});

const normalizeAdjustments = (input) => {
  if (!input || !Array.isArray(input)) return [];
  return input.map(normalizeSnapshot);
};

const calculateAdjustmentTotal = (snapshots) => {
  return roundToCurrency(
    snapshots.reduce((sum, s) => sum + (s.calculatedAmount || 0), 0)
  );
};

const resolveMargin = async (itemId, categoryId) => {
  if (itemId) {
    const rows = await repo.profitMarginSettings.getAll({ 'data->>scope': 'eq.line_item', 'data->>scope_ref_id': `eq.${itemId}`, 'data->>is_active': 'eq.1' });
    if (rows.length > 0) {
      const d = rows[0].data || rows[0];
      return { ...d, source: 'line_item' };
    }
    return resolveCategoryMargin(categoryId);
  }
  return resolveCategoryMargin(categoryId);
};

const resolveCategoryMargin = async (categoryId) => {
  if (categoryId) {
    const rows = await repo.profitMarginSettings.getAll({ 'data->>scope': 'eq.category', 'data->>scope_ref_id': `eq.${categoryId}`, 'data->>is_active': 'eq.1' });
    if (rows.length > 0) {
      const d = rows[0].data || rows[0];
      return { ...d, source: 'category' };
    }
    return resolveGlobalMargin();
  }
  return resolveGlobalMargin();
};

const resolveGlobalMargin = async () => {
  const rows = await repo.profitMarginSettings.getAll({ 'data->>scope': 'eq.global', 'data->>is_active': 'eq.1' });
  if (rows.length > 0) {
    const d = rows[0].data || rows[0];
    return { ...d, source: 'global', margin_value: d.margin_value ?? 0, margin_type: d.margin_type ?? 'percentage' };
  }
  return { margin_value: 0, margin_type: 'percentage', source: 'system' };
};

const DEFAULT_VOLUME_DISCOUNT_TIERS = [
  { minPages: 500, discountPercent: 25 },
  { minPages: 250, discountPercent: 15 },
  { minPages: 180, discountPercent: 10 },
];

const resolveVolumeMargin = (pages, margin, customTiers) => {
  const p = Number(pages) || 0;
  const tiers = customTiers && customTiers.length > 0 ? customTiers : DEFAULT_VOLUME_DISCOUNT_TIERS;
  const sorted = [...tiers].sort((a, b) => b.minPages - a.minPages);
  for (const tier of sorted) {
    if (p >= tier.minPages) return tier.discountPercent;
  }
  return 0;
};

const normalizeSnapshots = (rawSnapshots, baseAmount) => {
  if (!rawSnapshots || rawSnapshots.length === 0) return [];

  return rawSnapshots.map((snap) => {
    const value = Number(snap.value) || 0;
    const isPct = snap.type === 'PERCENTAGE' || snap.type === 'PERCENT' || snap.type === 'percentage';
    const calculatedAmount = isPct
      ? roundToCurrency(baseAmount * (value / 100))
      : roundToCurrency(value);

    return {
      name: snap.name || 'Adjustment',
      type: isPct ? 'PERCENTAGE' : 'FIXED',
      value,
      percentage: isPct ? value : undefined,
      calculatedAmount,
      adjustmentId: snap.adjustmentId,
      adjustmentCategory: snap.adjustmentCategory,
      isActive: snap.isActive,
    };
  });
};

const getPricingSettings = async () => {
  const rows = await repo.settings.getAll({ 'data->>key': { like: 'pricingSettings.%' } });
  const settings = { enableRounding: true, defaultMethod: 'ALWAYS_UP_50', customStep: 50 };
  for (const row of rows) {
    const d = row.data || row;
    try {
      const key = (d.key || '').replace('pricingSettings.', '');
      const val = JSON.parse(d.value);
      settings[key] = val;
    } catch {
      // skip invalid settings
    }
  }
  return settings;
};

const applyRounding = (price, settings) => {
  if (!settings?.enableRounding) return roundToCurrency(price);

  const method = settings.defaultMethod || 'ALWAYS_UP_50';
  const step = settings.customStep || 50;
  const original = roundToCurrency(price);

  let rounded;
  switch (method) {
    case 'NEAREST_10':
    case 'NEAREST_50':
    case 'NEAREST_100': {
      const stepVal = method === 'NEAREST_10' ? 10 : method === 'NEAREST_50' ? 50 : 100;
      rounded = Math.round(original / stepVal) * stepVal;
      break;
    }
    case 'ALWAYS_UP_10':
    case 'ALWAYS_UP_50':
    case 'ALWAYS_UP_100':
    case 'ALWAYS_UP_500': {
      const stepVal = method === 'ALWAYS_UP_10' ? 10 : method === 'ALWAYS_UP_50' ? 50 : method === 'ALWAYS_UP_100' ? 100 : 500;
      rounded = Math.ceil(original / stepVal) * stepVal;
      break;
    }
    default:
      rounded = original;
  }
  return roundToCurrency(rounded);
};

module.exports = {
  PRICING_ENGINE_VERSION,
  normalizeSnapshot,
  normalizeAdjustments,
  calculateAdjustmentTotal,
  resolveMargin,
  resolveCategoryMargin,
  resolveGlobalMargin,
  resolveVolumeMargin,
  normalizeSnapshots,
  getPricingSettings,
  applyRounding,
};
