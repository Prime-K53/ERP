import { api } from '../../../../services/api';
import { exportToCSV } from '../../../../utils/helpers';
import { normalizeInventoryItemPricing } from '../../../../utils/pricing';
import type { Item } from '../../../../types';

export interface InventoryStats {
  totalItems: number;
  rawMaterials: number;
  nonStockServices: number;
  inventoryValue: number;
  reservedStock: number;
  lowStockMaterials: number;
  rawValue?: number;
  productValue?: number;
  stationeryValue?: number;
  printingProfit?: number;
  stockValue?: number;
}

export async function fetchAllItems(): Promise<Item[]> {
  try {
    const items = await api.inventory.getAllItems();
    return items.map(normalizeInventoryItemPricing);
  } catch {
    return [];
  }
}

export function calculateStats(items: Item[]): InventoryStats {
  let rawMaterials = 0, nonStockServices = 0;
  let inventoryValue = 0, reservedStock = 0, lowStockMaterials = 0;
  let rawValue = 0, productValue = 0, stationeryValue = 0, printingProfit = 0;

  for (const item of items) {
    const type = item.type || item.classification || '';
    const stock = item.stock || 0;
    const costPrice = item.costPrice || item.cost || item.cost_price || 0;
    const reserved = item.reserved || 0;
    const minStock = item.minStockLevel || item.reorderPoint || 0;

    if (type === 'Raw Material' || item.resourceSubtype === 'raw_material') {
      rawMaterials++;
      if (minStock > 0 && stock > 0 && stock <= minStock) lowStockMaterials++;
    }
    else if (type === 'Service' && !(item as Item & Record<string, unknown>).printingServiceType) nonStockServices++;

    const val = stock * costPrice;
    inventoryValue += val;
    if (type === 'Raw Material' || item.resourceSubtype === 'raw_material') rawValue += val;
    else if (type === 'Product') productValue += val;
    else if (type === 'Stationery') stationeryValue += val;

    // printing profit (approx): for printing services, use margin * stock
    if ((type === 'Service' || (item as Item & Record<string, unknown>).printingServiceType) && (item.sellingPrice || item.price)) {
      const sell = item.sellingPrice || item.price || 0;
      const cost = costPrice;
      printingProfit += (sell - cost) * stock;
    }
    reservedStock += reserved;
  }

  return {
    totalItems: items.length,
    rawMaterials,
    nonStockServices,
    inventoryValue,
    reservedStock,
    lowStockMaterials,
    rawValue,
    productValue,
    stationeryValue,
    printingProfit,
    stockValue: inventoryValue,
  };
}

export function getStockHealth(item: Item): 'healthy' | 'low' | 'reorder' | 'out' | 'inactive' {
  const status = item.status || 'Active';
  if (status === 'Inactive') return 'inactive';
  const stock = item.stock || 0;
  if (stock <= 0) return 'out';
  const minStock = item.minStockLevel || item.reorderPoint || 0;
  const reorder = item.reorderPoint || 0;
  if (reorder > 0 && stock <= reorder) return 'reorder';
  if (minStock > 0 && stock <= minStock) return 'low';
  return 'healthy';
}

export function getStockHealthColor(health: string): string {
  switch (health) {
    case 'healthy': return 'bg-emerald-100 text-emerald-700';
    case 'low': return 'bg-amber-100 text-amber-700';
    case 'reorder': return 'bg-orange-100 text-orange-700';
    case 'out': return 'bg-red-100 text-red-700';
    case 'inactive': return 'bg-slate-100 text-slate-500';
    default: return 'bg-slate-100 text-slate-500';
  }
}

export function getItemMargin(item: Item): number {
  const cost = item.costPrice || item.cost || 0;
  const sell = item.sellingPrice || item.price || 0;
  if (cost <= 0) return 0;
  return ((sell - cost) / cost) * 100;
}

export function exportItemsToCSV(items: Item[]): void {
  const data = items.map(item => {
    const variants = ((item as any).variants || []).filter((v: unknown) => v && typeof v === 'object' && Object.keys(v as object).length > 0);
    const variantLabel = variants.length > 0 ? `${variants.length} variant${variants.length !== 1 ? 's' : ''}` : 'standard';
    return {
      Name: item.name,
      SKU: item.sku || '',
      Barcode: item.barcode || '',
      Type: item.type || '',
      Category: item.category || '',
      Brand: (item as Item & Record<string, unknown>).brand || '',
      Unit: item.unit || '',
      Variants: variantLabel,
      Stock: item.stock || 0,
      Reserved: item.reserved || 0,
      Available: (item.stock || 0) - (item.reserved || 0),
      'Cost Price': item.costPrice || item.cost || 0,
      'Selling Price': item.sellingPrice || item.price || 0,
      'Inventory Value': (item.stock || 0) * (item.costPrice || item.cost || 0),
      Status: item.status || 'Active',
      Supplier: item.preferredSupplierId || '',
      'Min Stock': item.minStockLevel || 0,
      'Reorder Point': item.reorderPoint || 0,
      Description: (item.description || '').replace(/,/g, ';'),
    };
  });
  exportToCSV(data, `inventory-export-${Date.now()}`);
}

export function filterItemsByStock(items: Item[], stockFilter: string): Item[] {
  if (!stockFilter || stockFilter === 'all') return items;
  return items.filter(item => {
    const health = getStockHealth(item);
    switch (stockFilter) {
      case 'in_stock': return health === 'healthy' || health === 'low' || health === 'reorder';
      case 'low_stock': return health === 'low' || health === 'reorder';
      case 'out_of_stock': return health === 'out';
      case 'overstock': return (item.stock || 0) > (item.minStockLevel || 100) * 3;
      default: return true;
    }
  });
}

export function getItemCategories(items: Item[]): string[] {
  const cats = new Set<string>();
  items.forEach(i => { if (i.category) cats.add(i.category); });
  return Array.from(cats).sort();
}

export function getItemBrands(items: Item[]): string[] {
  const brands = new Set<string>();
  items.forEach(i => { const b = (i as Item & Record<string, unknown>).brand; if (b) brands.add(b); });
  return Array.from(brands).sort();
}

export function getItemWarehouses(items: Item[]): string[] {
  const whs = new Set<string>();
  items.forEach(i => {
    if (i.warehouseId) whs.add(i.warehouseId);
    const locationStock = (i as Item & Record<string, unknown>).locationStock || [];
    locationStock.forEach((ls: any) => { if (ls.warehouseId) whs.add(ls.warehouseId); });
  });
  return Array.from(whs).sort();
}
