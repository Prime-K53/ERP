import { dbService } from './db';

async function fetchAllInventoryFromDb(): Promise<any[]> {
  return dbService.getAll<any>('inventory');
}

export async function syncItemStockWithWarehouses(itemId: string): Promise<void> {
  const localInventory = await dbService.getAll<any>('inventory');
  const localItem = localInventory.find(i => i.id === itemId);
  if (!localItem) return;

  const localWarehouseInventory = await dbService.getAll<any>('warehouseInventory');
  const itemWhInventories = localWarehouseInventory.filter((w: any) => w.itemId === itemId);

  if (itemWhInventories.length === 0) return;

  const totalStock = itemWhInventories.reduce((sum: number, w: any) => sum + (w.quantity || 0), 0);
  const totalReserved = itemWhInventories.reduce((sum: number, w: any) => sum + (w.reserved || 0), 0);

  if (localItem.stock !== totalStock || (localItem.reservedStock || 0) !== totalReserved) {
    localItem.stock = totalStock;
    localItem.reservedStock = totalReserved;
    await dbService.put('inventory', localItem);
  }
}

export async function syncAllItemStockWithWarehouses(): Promise<number> {
  const localInventory = await dbService.getAll<any>('inventory');
  const localWarehouseInventory = await dbService.getAll<any>('warehouseInventory');
  let syncedCount = 0;

  for (const item of localInventory) {
    const itemWhInventories = localWarehouseInventory.filter((w: any) => w.itemId === item.id);
    if (itemWhInventories.length === 0) continue;

    const totalStock = itemWhInventories.reduce((sum: number, w: any) => sum + (w.quantity || 0), 0);
    const totalReserved = itemWhInventories.reduce((sum: number, w: any) => sum + (w.reserved || 0), 0);

    if (item.stock !== totalStock || (item.reservedStock || 0) !== totalReserved) {
      item.stock = totalStock;
      item.reservedStock = totalReserved;
      await dbService.put('inventory', item);
      syncedCount++;
    }
  }

  return syncedCount;
}

export async function syncWarehouseFromMaster(itemId: string): Promise<void> {
  const inventory = await dbService.getAll<any>('inventory');
  const item = inventory.find(i => i.id === itemId);
  if (!item) return;

  const warehouseInventory = await dbService.getAll<any>('warehouseInventory');
  const existingWh = warehouseInventory.find((w: any) => w.itemId === itemId);

  if (!existingWh) {
    await dbService.put('warehouseInventory', {
      id: `WH-MAIN_${itemId}`,
      itemId,
      warehouseId: 'WH-MAIN',
      quantity: item.stock || 0,
      reserved: item.reservedStock || 0
    });
  }
}

export async function createWarehouseSnapshot(notes?: string): Promise<{ itemId: string; warehouseId: string; quantity: number; reserved: number }[]> {
  const warehouseInventory = await dbService.getAll<any>('warehouseInventory');
  return warehouseInventory.map((w: any) => ({
    itemId: w.itemId,
    warehouseId: w.warehouseId,
    quantity: w.quantity || 0,
    reserved: w.reserved || 0,
  }));
}

export async function getWarehouseSnapshots(limit: number = 20): Promise<any[]> {
  return (await dbService.getAll<any>('warehouseSnapshots'))
    .sort((a: any, b: any) => new Date(b.created_at || b.createdAt).getTime() - new Date(a.created_at || a.createdAt).getTime())
    .slice(0, limit);
}

export async function getWarehouseInventory(warehouseId?: string): Promise<any[]> {
  const inventory = await dbService.getAll<any>('warehouseInventory');
  if (warehouseId) {
    return inventory.filter((i: any) => i.warehouseId === warehouseId);
  }
  return inventory;
}
