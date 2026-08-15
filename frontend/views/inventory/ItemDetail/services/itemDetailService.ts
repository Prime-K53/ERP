import { api } from '../../../../services/api';
import { dbService } from '../../../../services/db';
import { transactionService } from '../../../../services/transactionService';
import { normalizeInventoryItemPricing } from '../../../../utils/pricing';
import { resolveMinimumMarkup } from '../../../../services/pricingValidationService';
import type { Item, Purchase, Sale, InventoryTransaction, AuditLogEntry, ProductionBatch, WorkOrder, Supplier } from '../../../../types';

export async function fetchItem(id: string): Promise<Item | null> {
  try {
    const items = await api.inventory.getAllItems();
    const item = items.find(entry => entry.id === id) || null;
    return item ? normalizeInventoryItemPricing(item) : null;
  } catch {
    return null;
  }
}

export async function fetchAllItems(): Promise<Item[]> {
  try {
    const items = await api.inventory.getAllItems();
    return items.map(normalizeInventoryItemPricing);
  } catch {
    return [];
  }
}

export async function fetchItemTransactions(itemId: string): Promise<InventoryTransaction[]> {
  try {
    const all = await dbService.getAll<InventoryTransaction>('inventoryTransactions');
    return all.filter(t => t.itemId === itemId).sort((a, b) =>
      new Date(b.date || b.createdAt || '').getTime() - new Date(a.date || a.createdAt || '').getTime(),
    );
  } catch {
    return [];
  }
}

export async function fetchPurchaseHistory(itemId: string): Promise<Purchase[]> {
  try {
    const all = await dbService.getAll<Purchase>('purchases');
    return all
      .filter(p => p.items?.some(i => i.itemId === itemId))
      .sort((a, b) => new Date(b.date || '').getTime() - new Date(a.date || '').getTime());
  } catch {
    return [];
  }
}

export async function fetchSalesHistory(itemId: string): Promise<Sale[]> {
  try {
    const all = await dbService.getAll<Sale>('sales');
    return all
      .filter(s => s.items?.some(i => i.id === itemId || i.itemId === itemId))
      .sort((a, b) => new Date(b.date || '').getTime() - new Date(a.date || '').getTime());
  } catch {
    return [];
  }
}

export async function fetchAuditLog(entityId: string): Promise<AuditLogEntry[]> {
  try {
    const all = await dbService.getAll<AuditLogEntry>('auditLogs');
    return all
      .filter(log => log.entityId === entityId)
      .sort((a, b) => new Date(b.date || '').getTime() - new Date(a.date || '').getTime());
  } catch {
    return [];
  }
}

export async function fetchProductionData(itemId: string): Promise<{ batches: ProductionBatch[]; workOrders: WorkOrder[] }> {
  try {
    const [batches, workOrders] = await Promise.all([
      dbService.getAll<ProductionBatch>('batches'),
      dbService.getAll<WorkOrder>('workOrders'),
    ]);
    return {
      batches: batches.filter(b => b.productId === itemId || b.bomId === itemId),
      workOrders: workOrders.filter(wo => wo.bomId === itemId || (wo as WorkOrder & { itemId?: string }).itemId === itemId),
    };
  } catch {
    return { batches: [], workOrders: [] };
  }
}

export async function fetchSuppliers(): Promise<Supplier[]> {
  try {
    return await dbService.getAll<Supplier>('suppliers');
  } catch {
    return [];
  }
}

export async function saveItem(item: Item): Promise<void> {
  await transactionService.saveItem(item);
}

export async function duplicateItem(item: Item): Promise<Item> {
  const dup: Item = {
    ...item,
    id: 'ITM-' + Date.now().toString(36).toUpperCase() + '-' + Math.random().toString(36).substring(2, 7).toUpperCase(),
    name: `${item.name} (Copy)`,
    sku: item.sku ? `${item.sku}-COPY` : undefined,
    stock: 0,
  };
  await transactionService.saveItem(dup);
  return normalizeInventoryItemPricing(dup);
}

export function getItemStockCalculations(item: Item): {
  currentStock: number;
  reserved: number;
  available: number;
  incoming: number;
  committed: number;
  inventoryValue: number;
} {
  const currentStock = item.stock || 0;
  const reserved = item.reserved ?? 0;
  const available = Math.max(0, currentStock - reserved);
  const itemExt = item as Item & { incoming?: number; committed?: number };
  const incoming = itemExt.incoming ?? 0;
  const committed = itemExt.committed ?? 0;
  const costPrice = item.costPrice || item.cost || 0;
  const inventoryValue = currentStock * costPrice;
  return { currentStock, reserved, available, incoming, committed, inventoryValue };
}

export function getItemPricing(item: Item): {
  costPrice: number;
  sellingPrice: number;
  profit: number;
  markup: number;
  minimumMarkup: number;
} {
  const costPrice = item.costPrice || item.cost || 0;
  const sellingPrice = item.sellingPrice || item.price || 0;
  const profit = sellingPrice - costPrice;
  const markup = costPrice > 0 ? ((sellingPrice - costPrice) / costPrice) * 100 : 0;
  const minimumMarkup = resolveMinimumMarkup(item);
  return { costPrice, sellingPrice, profit, markup, minimumMarkup };
}
