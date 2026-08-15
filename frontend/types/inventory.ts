// ──────────────────────────────────────────────
// Inventory Resource — cost sources for BOMs and services
// ──────────────────────────────────────────────

/** Determines which product workflows apply to this item */
export type InventoryRole = 'internal' | 'sellable' | 'both';

/** Sub-classification for internal cost-source items */
export type ResourceSubtype = 'raw_material' | 'packaging' | 'spare_part';

/** Whether a raw material is consumed during production or wears out over time */
export type RawMaterialCategory = 'consumable' | 'non_consumable';

/** Costing method for calculating normalized Cost Price */
export type CostingMethod = 'weighted_average' | 'fifo' | 'standard';

/** Purchase-to-consumption unit relationship */
export interface UnitConversionFactor {
  purchaseUnit: string;
  consumptionUnit: string;
  /** How many consumption units per one purchase unit (e.g. 500 sheets per ream) */
  factor: number;
}

/** Records a single purchase lot for weighted-average / FIFO tracking */
export interface PurchaseLot {
  id: string;
  itemId: string;
  purchaseDate: string;
  /** Quantity in purchase units */
  purchaseQuantity: number;
  /** Total cost of this lot in currency */
  totalCost: number;
  /** Purchase unit (e.g. "Ream", "Cartridge") */
  purchaseUnit: string;
  /** Resolved quantity in consumption units after conversion */
  consumptionQuantity: number;
  /** Unit cost per consumption unit for this lot */
  unitCostPerConsumption: number;
  /** Remaining consumption units still in stock */
  remainingConsumption: number;
  /** Supplier reference */
  supplierId?: string;
  supplierName?: string;
  invoiceRef?: string;
}
