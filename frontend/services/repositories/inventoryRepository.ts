import { BaseRepository } from './baseRepository';
import type { Item } from '../../types';

export class InventoryRepository extends BaseRepository<Item> {
  constructor() {
    super('inventory', 'products');
  }

  async getBySku(sku: string): Promise<(Item & import('./baseRepository').SyncMetadata) | null> {
    const all = await this.getAll();
    return all.find((item: any) => item.sku === sku) || null;
  }

  async getByCategory(categoryId: string): Promise<(Item & import('./baseRepository').SyncMetadata)[]> {
    const all = await this.getAll();
    return all.filter((item: any) => item.category_id === categoryId || item.category === categoryId);
  }

  async getLowStock(): Promise<(Item & import('./baseRepository').SyncMetadata)[]> {
    const all = await this.getAll();
    return all.filter((item: any) => {
      const qty = Number(item.quantity || item.stock || 0);
      const min = Number(item.minStockLevel || item.min_stock_level || 0);
      return min > 0 && qty <= min;
    });
  }

  async updateStock(id: string, quantity: number): Promise<void> {
    const item = await this.getById(id);
    if (!item) throw new Error(`Inventory item not found: ${id}`);
    await this.update(id, {
      ...item,
      quantity,
      stock: quantity,
    } as any);
  }
}

export const inventoryRepository = new InventoryRepository();