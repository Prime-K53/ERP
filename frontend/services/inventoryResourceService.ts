import type {
  Item, InventoryRole, ResourceSubtype, CostingMethod,
  UnitConversionFactor, PurchaseLot,
} from '../types';
import { dbService } from './db';

// ─── ID generation ───
const generateId = (): string =>
  'PRC_' + Date.now().toString(36).toUpperCase() + '_' + Math.random().toString(36).substring(2, 7).toUpperCase();

/**
 * Inventory Resource Service
 *
 * Manages the lifecycle of internal cost-source items (raw materials, consumables,
 * packaging, spare parts): purchasing with unit conversion, weighted-average CP,
 * normalized cost per consumption unit.
 */
class InventoryResourceService {
  // ─── Purchase flow with unit conversion ───

  /**
   * Record a purchase of an inventory resource.
   *
   * 1. Converts purchase quantity to consumption units
   * 2. Creates a PurchaseLot
   * 3. Recalculates weighted-average normalized CP
   * 4. Updates item stock (in consumption units)
   * 5. Updates item normalizedCP and cost fields
   */
  async recordPurchase(params: {
    itemId: string;
    purchaseQuantity: number;
    purchaseUnit: string;
    totalCost: number;
    supplierId?: string;
    supplierName?: string;
    invoiceRef?: string;
  }): Promise<{ lot: PurchaseLot; updatedItem: Item | null }> {
    const item = await this.getItem(params.itemId);
    if (!item) throw new Error(`Item not found: ${params.itemId}`);

    const consumptionUnit = item.consumptionUnit || item.unit || 'pcs';
    const factor = item.conversionFactor || 1;
    const consumptionQty = params.purchaseQuantity * factor;

    const unitCostPerConsumption = consumptionQty > 0
      ? Math.round((params.totalCost / consumptionQty) * 10000) / 10000
      : 0;

    const lot: PurchaseLot = {
      id: generateId(),
      itemId: params.itemId,
      purchaseDate: new Date().toISOString(),
      purchaseQuantity: params.purchaseQuantity,
      totalCost: params.totalCost,
      purchaseUnit: params.purchaseUnit,
      consumptionQuantity: consumptionQty,
      unitCostPerConsumption,
      remainingConsumption: consumptionQty,
      supplierId: params.supplierId,
      supplierName: params.supplierName,
      invoiceRef: params.invoiceRef,
    };

    // Persist purchase lot
    try {
      const lots = await this.getPurchaseLots(params.itemId);
      lots.push(lot);
      await dbService.put('purchaseLots', lot);
      // Also store lot IDs on item for quick reference
      const lotIds = [...(item.purchaseLotIds || []), lot.id];
      await dbService.put('inventory', { ...item, purchaseLotIds: lotIds });
    } catch (err) {
      console.warn('[InventoryResourceService] Could not persist purchase lot:', err);
    }

    // Recalculate weighted-average CP
    const newNormalizedCP = await this.recalculateWeightedAverageCP(params.itemId);

    // Update item stock (in consumption units)
    const currentStock = item.stock || 0;
    const newStock = currentStock + consumptionQty;

    // Update item
    const updatedItem: Item = {
      ...item,
      stock: newStock,
      normalizedCP: newNormalizedCP,
      cost: newNormalizedCP,
      cost_price: newNormalizedCP,
      costPrice: newNormalizedCP,
      // No SP/margin changes for internal items
    };

    await this.saveItem(updatedItem);
    return { lot, updatedItem };
  }

  /**
   * Calculate weighted-average CP per consumption unit across all active purchase lots.
   */
  async recalculateWeightedAverageCP(itemId: string): Promise<number> {
    const lots = await this.getActiveLots(itemId);
    if (lots.length === 0) {
      const item = await this.getItem(itemId);
      return item?.normalizedCP || item?.costPrice || 0;
    }

    const totalConsumption = lots.reduce((s, l) => s + l.remainingConsumption, 0);
    const totalCost = lots.reduce((s, l) => s + (l.remainingConsumption * l.unitCostPerConsumption), 0);

    return totalConsumption > 0
      ? Math.round((totalCost / totalConsumption) * 10000) / 10000
      : 0;
  }

  /**
   * Get the effective cost price for a given quantity in consumption units.
   * For 'weighted_average': returns normalizedCP * quantity
   * For 'fifo': peels from oldest lot first
   * For 'standard': returns standard cost * quantity
   */
  async getCostForConsumption(
    itemId: string,
    consumptionQuantity: number,
    method?: CostingMethod,
  ): Promise<{ totalCost: number; lotsUsed: PurchaseLot[] }> {
    const item = await this.getItem(itemId);
    if (!item) throw new Error(`Item not found: ${itemId}`);

    const costingMethod = method || item.costingMethod || 'weighted_average';

    if (costingMethod === 'weighted_average' || costingMethod === 'standard') {
      const unitCost = costingMethod === 'standard'
        ? (item.normalizedCP || item.costPrice || 0)
        : await this.recalculateWeightedAverageCP(itemId);
      return {
        totalCost: Math.round(unitCost * consumptionQuantity * 100) / 100,
        lotsUsed: [],
      };
    }

    // FIFO: peel from oldest active lots
    const lots = await this.getActiveLots(itemId);
    lots.sort((a, b) => new Date(a.purchaseDate).getTime() - new Date(b.purchaseDate).getTime());

    let remaining = consumptionQuantity;
    let totalCost = 0;
    const lotsUsed: PurchaseLot[] = [];
    const lotUpdates: Promise<any>[] = [];

    for (const lot of lots) {
      if (remaining <= 0) break;
      const take = Math.min(remaining, lot.remainingConsumption);
      totalCost += take * lot.unitCostPerConsumption;
      remaining -= take;

      const updatedLot = { ...lot, remainingConsumption: lot.remainingConsumption - take };
      lotsUsed.push(updatedLot);
      lotUpdates.push(
        dbService.put('purchaseLots', updatedLot).catch(() => {})
      );
    }

    await Promise.all(lotUpdates);

    return {
      totalCost: Math.round(totalCost * 100) / 100,
      lotsUsed,
    };
  }

  // ─── Unit conversion helpers ───

  /**
   * Convert a purchase-unit quantity to consumption-unit quantity.
   */
  convertToConsumptionUnit(
    item: Item,
    purchaseQuantity: number,
    purchaseUnit?: string,
  ): { consumptionQuantity: number; consumptionUnit: string } {
    const consumptionUnit = item.consumptionUnit || item.unit || 'pcs';
    if (item.conversionFactor && item.conversionFactor > 0) {
      return {
        consumptionQuantity: purchaseQuantity * item.conversionFactor,
        consumptionUnit,
      };
    }
    // If no conversion factor, assume 1:1
    return { consumptionQuantity: purchaseQuantity, consumptionUnit };
  }

  /**
   * Convert a consumption-unit quantity back to purchase units.
   */
  convertToPurchaseUnit(
    item: Item,
    consumptionQuantity: number,
    purchaseUnit?: string,
  ): { purchaseQuantity: number; purchaseUnit: string } {
    const unit = purchaseUnit || item.purchaseUnit || item.unit || 'pcs';
    if (item.conversionFactor && item.conversionFactor > 0) {
      return {
        purchaseQuantity: consumptionQuantity / item.conversionFactor,
        purchaseUnit: unit,
      };
    }
    return { purchaseQuantity: consumptionQuantity, purchaseUnit: unit };
  }

  /**
   * Get the cost per consumption unit (normalized CP).
   */
  getEffectiveCP(item: Item): number {
    return item.normalizedCP ?? item.costPrice ?? item.cost ?? 0;
  }

  // ─── CRUD ───

  async getItem(id: string): Promise<Item | undefined> {
    return dbService.get('inventory', id);
  }

  async saveItem(item: Item): Promise<void> {
    await dbService.put('inventory', item);
  }

  async getPurchaseLots(itemId: string): Promise<PurchaseLot[]> {
    try {
      return (await dbService.getAll('purchaseLots'))
        .filter((l: any) => l.itemId === itemId) as PurchaseLot[];
    } catch {
      return [];
    }
  }

  async getActiveLots(itemId: string): Promise<PurchaseLot[]> {
    const lots = await this.getPurchaseLots(itemId);
    return lots.filter(l => l.remainingConsumption > 0);
  }

  /**
   * Get all items with inventoryRole !== 'sellable' (i.e. internal/both/undefined).
   * Used to populate resource pickers in BOMs and service recipe builders.
   */
  async getAllResourceItems(filters?: {
    inventoryRole?: InventoryRole;
    resourceSubtype?: ResourceSubtype;
  }): Promise<Item[]> {
    const all: Item[] = await dbService.getAll('inventory');

    if (filters?.inventoryRole) {
      return all.filter(i => i.inventoryRole === filters.inventoryRole);
    }
    if (filters?.resourceSubtype) {
      return all.filter(i => i.resourceSubtype === filters.resourceSubtype);
    }
    // Default: return internal + both items
    return all.filter((i: Item) =>
      i.inventoryRole === 'internal' ||
      i.inventoryRole === 'both' ||
      i.type === 'Raw Material' ||
      i.type === 'Material'
    );
  }
}

export const inventoryResourceService = new InventoryResourceService();
