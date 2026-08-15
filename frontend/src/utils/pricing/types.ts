export type PricingContext = 'POS' | 'ORDER' | 'SERVICE' | 'EXAMINATION';

export type MarginType = 'percentage' | 'fixed_amount';

export type EffectiveMargin = {
  margin_value: number;
  margin_type: MarginType;
  source: 'line_item' | 'category' | 'global' | 'system';
  apply_volume_margins?: boolean;
};

export interface SnapshotEntry {
  id?: string;
  name: string;
  type: 'PERCENTAGE' | 'FIXED' | 'PERCENT' | 'percentage';
  value: number;
  percentage?: number;
  calculatedAmount: number;
  adjustmentId?: string;
  adjustmentCategory?: string;
  isActive?: boolean;
}

export interface PricingInput {
  itemId?: string;
  categoryId?: string;
  baseCost: number;
  basePrice?: number;
  quantity?: number;
  pages?: number;
  adjustments?: SnapshotEntry[];
  context: PricingContext;
  /** Quantity-based tiered pricing (System A): per-quantity price breaks */
  quantityTiers?: Array<{ minQty: number; price: number }>;
  allowQuantityTiering?: boolean;
}

export interface PricingBreakdown {
  baseCost: number;
  adjustments: number;
  margin: number;
}

export interface PricingResult {
  unitPrice: number;
  totalPrice: number;
  cost: number;
  marginAmount: number;
  adjustmentSnapshots: SnapshotEntry[];
  adjustmentTotal: number;
  roundingDifference: number;
  breakdown: PricingBreakdown;
  pricingVersion?: string;
}

export interface ResolvedMargin {
  margin: EffectiveMargin;
  marginAmount: number;
  shouldApply: boolean;
}