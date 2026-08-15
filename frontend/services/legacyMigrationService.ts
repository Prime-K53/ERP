import type { Item, Variant, ProductType, ProductVariant } from '../types';
import type { InventoryRole, ResourceSubtype, CostingMethod } from '../types/inventory';
import { dbService } from './db';
import { toVariant } from '../utils/variantMigration';

export interface MigrationSummary {
  totalItems: number;
  processed: number;
  errors: number;
  skipped: number;
  details: MigrationDetail[];
}

export interface MigrationDetail {
  itemId: string;
  itemName: string;
  action: 'updated' | 'skipped' | 'error';
  productType?: ProductType;
  inventoryRole?: InventoryRole;
  resourceSubtype?: ResourceSubtype;
  variantCreated?: boolean;
  error?: string;
}

export type MigrationProgressCallback = (progress: {
  current: number;
  total: number;
  percent: number;
  currentItem: string;
}) => void;

type TypeMapping = {
  productType: ProductType;
  inventoryRole: InventoryRole;
  resourceSubtype?: ResourceSubtype;
  costingMethod?: CostingMethod;
  consumptionUnit?: string;
};

const ITEM_TYPE_MAPPING: Record<string, TypeMapping> = {
  'Raw Material': {
    productType: 'INVENTORY',
    inventoryRole: 'internal',
    resourceSubtype: 'raw_material',
    costingMethod: 'weighted_average',
  },
  'Material': {
    productType: 'INVENTORY',
    inventoryRole: 'internal',
    resourceSubtype: 'raw_material',
    costingMethod: 'weighted_average',
  },
  'Stationery': {
    productType: 'INVENTORY',
    inventoryRole: 'both',
    costingMethod: 'weighted_average',
  },
  'Product': {
    productType: 'MANUFACTURED',
    inventoryRole: 'sellable',
    costingMethod: 'weighted_average',
  },
  'Service': {
    productType: 'SERVICE',
    inventoryRole: 'sellable',
    costingMethod: 'weighted_average',
  },
};

class LegacyMigrationService {
  async migrateLegacyTypes(
    progressCallback?: MigrationProgressCallback,
  ): Promise<MigrationSummary> {
    const allItems = await dbService.getAll<Item>('inventory');
    const summary: MigrationSummary = {
      totalItems: allItems.length,
      processed: 0,
      errors: 0,
      skipped: 0,
      details: [],
    };

    for (let i = 0; i < allItems.length; i++) {
      const item = allItems[i];

      progressCallback?.({
        current: i + 1,
        total: allItems.length,
        percent: Math.round(((i + 1) / allItems.length) * 100),
        currentItem: item.name,
      });

      try {
        const result = await this.migrateItem(item);
        if (result.action === 'skipped') {
          summary.skipped++;
        } else if (result.action === 'error') {
          summary.errors++;
        } else {
          summary.processed++;
        }
        summary.details.push(result);
      } catch (err) {
        summary.errors++;
        summary.details.push({
          itemId: item.id,
          itemName: item.name,
          action: 'error',
          error: err instanceof Error ? err.message : 'Unknown error',
        });
      }
    }

    return summary;
  }

  private async migrateItem(item: Item): Promise<MigrationDetail> {
    const type = item.type;
    const mapping = ITEM_TYPE_MAPPING[type];

    if (!mapping) {
      return {
        itemId: item.id,
        itemName: item.name,
        action: 'skipped',
        error: `Unknown item type: ${type}`,
      };
    }

    const hasProductType = item.productType === mapping.productType;
    const hasInventoryRole = item.inventoryRole === mapping.inventoryRole;

    if (hasProductType && hasInventoryRole) {
      return {
        itemId: item.id,
        itemName: item.name,
        action: 'skipped',
        productType: item.productType,
        inventoryRole: item.inventoryRole,
      };
    }

    const updatedItem: Item = {
      ...item,
      productType: mapping.productType,
      inventoryRole: mapping.inventoryRole,
      costingMethod: mapping.costingMethod || item.costingMethod,
    };

    if (mapping.resourceSubtype) {
      updatedItem.resourceSubtype = mapping.resourceSubtype;
    }

    if (mapping.consumptionUnit) {
      updatedItem.consumptionUnit = mapping.consumptionUnit;
    }

    if (!updatedItem.consumptionUnit && mapping.inventoryRole === 'internal') {
      updatedItem.consumptionUnit = item.usageUnit || item.unit || 'pcs';
    }

    if (mapping.inventoryRole === 'internal' && !item.conversionFactor && item.conversionRate && item.conversionRate > 0) {
      updatedItem.conversionFactor = item.conversionRate;
      updatedItem.consumptionUnit = item.usageUnit || item.unit || 'pcs';
    }

    await dbService.put('inventory', updatedItem);

    let variantCreated = false;
    if (!item.variants || item.variants.length === 0) {
      const variant = toVariant(updatedItem);
      variant.productType = mapping.productType;
      variant.inventoryRole = mapping.inventoryRole;
      updatedItem.variants = [variant as unknown as ProductVariant];
      await dbService.put('inventory', updatedItem);
      variantCreated = true;
    }

    return {
      itemId: item.id,
      itemName: item.name,
      action: 'updated',
      productType: mapping.productType,
      inventoryRole: mapping.inventoryRole,
      resourceSubtype: mapping.resourceSubtype,
      variantCreated,
    };
  }

  async migrateItemById(itemId: string): Promise<MigrationDetail> {
    const item = await dbService.get<Item>('inventory', itemId);
    if (!item) {
      return {
        itemId,
        itemName: 'Unknown',
        action: 'error',
        error: 'Item not found',
      };
    }
    return this.migrateItem(item);
  }

  async migrateItemsByType(type: string): Promise<MigrationDetail[]> {
    const allItems = await dbService.getAll<Item>('inventory');
    const filtered = allItems.filter(i => i.type === type);
    const results: MigrationDetail[] = [];
    for (const item of filtered) {
      results.push(await this.migrateItem(item));
    }
    return results;
  }
}

export const legacyMigrationService = new LegacyMigrationService();
