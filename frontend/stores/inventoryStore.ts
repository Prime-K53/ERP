
import { create } from 'zustand';
import { logger } from '../services/logger';
import { Item, Warehouse } from '../types';
import { api } from '../services/api';
import { dbService } from '../services/db';
import { SEED_ITEM_IDS, SEED_ITEMS, MOCK_WAREHOUSES } from '../constants';
import { generateNextId } from '../utils/helpers';
import { generateLocalId } from '../utils/idGeneration';
import { validateMinimumMarkup } from '../services/pricingValidationService';

import { transactionService } from '../services/transactionService';
import { normalizeInventoryItemPricing, normalizeStoredPricing } from '../utils/pricing';
import {
  recalculatePrice as recalculateProductPrice,
  repriceMasterInventoryFromAdjustments
} from '../services/masterInventoryPricingService';

interface InventoryState {
  inventory: Item[];
  warehouses: Warehouse[];
  isLoading: boolean;
  error: string | null;

  fetchInventory: (silent?: boolean) => Promise<void>;
  addItem: (item: Item) => Promise<void>;
  updateItem: (item: Item) => Promise<void>;
  recalculatePrice: (itemId: string) => Promise<Item | undefined>;
  deleteItem: (id: string) => Promise<void>;
  addWarehouse: (warehouse: Warehouse) => Promise<void>;
  deleteWarehouse: (id: string) => Promise<void>;
  updateStock: (itemId: string, quantityChange: number, locationId?: string, variantId?: string) => Promise<void>;
  updateReservedStock: (itemId: string, reservedChange: number, variantId?: string) => Promise<void>;
  transferStock: (itemId: string, fromLocationId: string, toLocationId: string, quantity: number) => Promise<void>;
}

const resolveNextInventoryId = async (currentInventory: Item[]) => {
  const inventoryMap = new Map<string, Item>();

  for (const item of currentInventory || []) {
    if (item?.id) {
      inventoryMap.set(String(item.id), item);
    }
  }

  try {
    const persistedItems = await api.inventory.getAllItems();
    for (const item of persistedItems || []) {
      if (item?.id) {
        inventoryMap.set(String(item.id), item);
      }
    }
  } catch {
    // Keep ID generation resilient even if a refresh fails.
  }

  return generateNextId('ITM', Array.from(inventoryMap.values()));
};

export const useInventoryStore = create<InventoryState>((set, get) => ({
  inventory: [],
  warehouses: [],
  isLoading: false,
  error: null,

  fetchInventory: async (silent = false) => {
    if (!silent) set({ isLoading: true, error: null });
    try {
      const [loadedItems, loadedWarehouses] = await Promise.all([
        api.inventory.getAllItems(),
        dbService.getAll<Warehouse>('warehouses')
      ]);

      const seedIds = new Set(SEED_ITEM_IDS);
      const normalizedItems = (loadedItems || []).map((item) => {
        const base = normalizeInventoryItemPricing(item);
        const hasVariants = base.variants && base.variants.length > 0;
        return {
          ...base,
          isSeed: seedIds.has(item.id),
          isVariantParent: hasVariants ? true : (base.isVariantParent || false),
        };
      });

      const existingStateItems = get().inventory || [];
      const itemMap = new Map<string, Item>();
      for (const item of existingStateItems) {
        itemMap.set(item.id, item);
      }
      for (const item of normalizedItems) {
        itemMap.set(item.id, item);
      }
      set({ inventory: Array.from(itemMap.values()) });

      if (loadedWarehouses.length === 0) {
        for (const w of MOCK_WAREHOUSES) await dbService.put('warehouses', w);
        set(state => ({ ...state, warehouses: MOCK_WAREHOUSES }));
      } else {
        set(state => ({ ...state, warehouses: loadedWarehouses }));
      }
    } catch (error) {
      logger.error('Inventory Load Error:', error);
      if (!silent) set({ error: 'Failed to load inventory data' });
    } finally {
      if (!silent) set({ isLoading: false });
    }
  },

  addItem: async (item: Item) => {
    const isSellable = !['material', 'raw material', 'stationery', 'service'].includes(String(item.type).toLowerCase());
    const validation = isSellable
      ? validateMinimumMarkup(
          Number(item.costPrice || item.cost || 0),
          Number(item.sellingPrice || item.price || 0),
          item
        )
      : { valid: true, profit: 0, profitMarkup: 0, minimumMarkup: 0 };
    if (!validation.valid) {
      throw new Error(
        `Cannot save product. Calculated markup (${validation.profitMarkup.toFixed(1)}%) is below minimum required markup (${validation.minimumMarkup}%). ${validation.message}`
      );
    }

    const sellingPriceVal = Number(item.sellingPrice || item.selling_price || item.price || 0);
    const costPriceVal = Number(item.costPrice || item.cost_price || item.cost || 0);
    const newItem = {
      ...item,
      price: sellingPriceVal,
      selling_price: sellingPriceVal,
      cost: costPriceVal,
      cost_price: costPriceVal,
      costPrice: costPriceVal,
      sellingPrice: sellingPriceVal,
      profitAmount: isSellable ? validation.profit : 0,
      profitMargin: isSellable ? validation.profitMarkup : 0,
      minimumMargin: isSellable ? validation.minimumMarkup : 0,
      pricingValidated: !isSellable || validation.valid,
      validationTimestamp: new Date().toISOString(),
    };
    const id = newItem.id || await resolveNextInventoryId(get().inventory);
    const savedItem = { ...newItem, id };
    set(state => ({
      inventory: [...state.inventory.filter(i => i.id !== id), savedItem]
    }));
    await transactionService.saveItem(savedItem);
    await get().fetchInventory(true);
  },

  updateItem: async (item: Item) => {
    const isSellable = !['material', 'raw material', 'stationery', 'service'].includes(String(item.type).toLowerCase());
    const validation = isSellable
      ? validateMinimumMarkup(
          Number(item.costPrice || item.cost || 0),
          Number(item.sellingPrice || item.price || 0),
          item
        )
      : { valid: true, profit: 0, profitMarkup: 0, minimumMarkup: 0 };
    if (!validation.valid) {
      throw new Error(
        `Cannot save product. Calculated markup (${validation.profitMarkup.toFixed(1)}%) is below minimum required markup (${validation.minimumMarkup}%). ${validation.message}`
      );
    }

    const previous = get().inventory.find(i => i.id === item.id);
    const sellPriceVal = Number(item.sellingPrice || item.selling_price || item.price || 0);
    const costPriceVal = Number(item.costPrice || item.cost_price || item.cost || 0);
    const updatedItem = {
      ...item,
      price: sellPriceVal,
      selling_price: sellPriceVal,
      cost: costPriceVal,
      cost_price: costPriceVal,
      costPrice: costPriceVal,
      sellingPrice: sellPriceVal,
      profitAmount: isSellable ? validation.profit : 0,
      profitMargin: isSellable ? validation.profitMarkup : 0,
      minimumMargin: isSellable ? validation.minimumMarkup : 0,
      pricingValidated: !isSellable || validation.valid,
      validationTimestamp: new Date().toISOString(),
    };
    set(state => ({
      inventory: state.inventory.map(i => i.id === item.id ? { ...i, ...updatedItem } : i)
    }));
    await transactionService.saveItem(updatedItem, previous);
    await get().fetchInventory(true);

    const previousCost = Number(previous?.cost_price ?? previous?.cost ?? 0);
    const nextCost = Number(item.cost_price ?? item.cost ?? 0);
    const materialCostChanged = item.type === 'Material' && Math.abs(previousCost - nextCost) > 0.00001;
    if (materialCostChanged) {
      await repriceMasterInventoryFromAdjustments();
      await get().fetchInventory();
    }
  },

  recalculatePrice: async (itemId: string) => {
    const repriced = await recalculateProductPrice(itemId);
    if (repriced.item) {
      set(state => ({
        inventory: state.inventory.map(i => i.id === repriced.item!.id ? repriced.item! : i)
      }));
      return repriced.item;
    }
    return undefined;
  },

  deleteItem: async (id: string) => {
    const itemToDelete = get().inventory.find(i => i.id === id);
    if (itemToDelete?.isProtected) {
      set({ error: 'Cannot delete protected item' });
      throw new Error('Cannot delete protected item');
    }
    await transactionService.deleteItem(id);
    set(state => ({
      inventory: state.inventory.filter(i => i.id !== id)
    }));
  },

  addWarehouse: async (warehouse: Warehouse) => {
    const prevWh = get().warehouses;
    const exists = prevWh.find(w => w.id === warehouse.id);
    set(state => ({
      warehouses: exists
        ? state.warehouses.map(w => w.id === warehouse.id ? warehouse : w)
        : [...state.warehouses, warehouse],
    }));
    try {
      await api.inventory.saveWarehouse(warehouse);
    } catch (error) {
      set({ warehouses: prevWh });
      throw error;
    }
  },

  deleteWarehouse: async (id: string) => {
    const prevWh = get().warehouses;
    set(state => ({ warehouses: state.warehouses.filter(w => w.id !== id) }));
    try {
      await api.inventory.deleteWarehouse(id);
    } catch (error) {
      set({ warehouses: prevWh });
      throw error;
    }
  },

  updateStock: async (itemId: string, quantityChange: number, locationId: string = 'WH-MAIN', variantId?: string) => {
    // We use transactionService for the heavy lifting to ensure atomicity and ledger integrity
    // Note: This store method is now a wrapper around the atomic service
    await transactionService.adjustStock({
      itemId,
      qtyChange: quantityChange,
      reason: 'System adjustment via store',
      warehouseId: locationId,
      variantId
    });
    // Refresh the local state from the DB
    await get().fetchInventory();
  },

  updateReservedStock: async (itemId: string, reservedChange: number, variantId?: string) => {
    await transactionService.updateReservedStock(itemId, reservedChange, variantId);
    await get().fetchInventory();
  },

  transferStock: async (itemId: string, fromLocationId: string, toLocationId: string, quantity: number) => {
    await transactionService.transferStock(itemId, fromLocationId, toLocationId, quantity);
    await get().fetchInventory();
  }
}));
