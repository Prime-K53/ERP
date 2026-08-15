import { useMemo } from 'react';
import type { Item } from '../../../../types';

export interface DashboardKpi {
  label: string;
  value: string;
  sub: string;
  color: string;
  icon: string;
}

export interface CategoryBreakdown {
  label: string;
  items: number;
  value: number;
  color: string;
}

export interface WarehouseStock {
  name: string;
  stock: number;
  value: number;
}

export interface MonthlyMovement {
  month: string;
  in: number;
  out: number;
}

export interface DashboardData {
  kpis: DashboardKpi[];
  categoryBreakdown: CategoryBreakdown[];
  valueBreakdown: CategoryBreakdown[];
  warehouseStock: WarehouseStock[];
  monthlyMovement: MonthlyMovement[];
  turnover: number;
  fastMoving: number;
  slowMoving: number;
  totalValue: number;
  totalStock: number;
}

function num(v: any): number {
  const n = parseFloat(v);
  return isNaN(n) ? 0 : n;
}

function money(n: number, symbol = '$'): string {
  n = Number(n) || 0;
  if (n >= 1_000_000) return symbol + ' ' + (n / 1_000_000).toFixed(2) + 'M';
  if (n >= 1_000) return symbol + ' ' + (n / 1_000).toFixed(1) + 'K';
  return symbol + ' ' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function useInventoryDashboard(allItems: Item[], warehouses: { id: string; name: string }[], currencySymbol = '$'): DashboardData {
  return useMemo(() => {
    if (!allItems.length) {
      return {
        kpis: [],
        categoryBreakdown: [],
        valueBreakdown: [],
        warehouseStock: [],
        monthlyMovement: [],
        turnover: 0, fastMoving: 0, slowMoving: 0,
        totalValue: 0, totalStock: 0,
      };
    }

    const rawMaterials = allItems.filter(i => (i.type || i.classification) === 'Raw Material');
    const products = allItems.filter(i => (i.type || i.classification) === 'Product');
    const stationery = allItems.filter(i => (i.type || i.classification) === 'Stationery');
    const printingServices = allItems.filter(i => i.type === 'Service' || (i as Item & { classification?: string }).classification === 'Printing Service');

    const totalStock = allItems.reduce((s, i) => s + num(i.stock), 0);
    const totalValue = allItems.reduce((s, i) => s + num(i.stock) * (i.costPrice || i.cost || 0), 0);
    const activeItems = allItems.filter(i => i.status !== 'Inactive' && i.status !== 'Pending');
    const inactiveItems = allItems.filter(i => i.status === 'Inactive');
    const lowStockItems = allItems.filter(i => i.reorderPoint != null && num(i.stock) <= num(i.reorderPoint));
    const outOfStockItems = allItems.filter(i => num(i.stock) <= 0);
    const reorderItems = allItems.filter(i => i.reorderPoint != null && num(i.stock) <= num(i.reorderPoint) && num(i.stock) > 0);
    const categories = new Set(allItems.map(i => i.category).filter(Boolean));
    const warehouseIds = new Set<string>();
    allItems.forEach(i => {
      if (i.warehouseId) warehouseIds.add(i.warehouseId);
      (i.locationStock || []).forEach((ls: { warehouseId: string }) => warehouseIds.add(ls.warehouseId));
    });

    const categoryColors = ['#2563EB', '#16A34A', '#D97706', '#7C3AED', '#DC2626', '#0891B2'];

    const catBreakdown: CategoryBreakdown[] = [
      { label: 'Raw Materials', items: rawMaterials.length, value: rawMaterials.reduce((s, m) => s + num(m.stock) * (m.costPrice || m.cost || 0), 0), color: categoryColors[0] },
      { label: 'Products', items: products.length, value: products.reduce((s, p) => s + num(p.stock) * (p.costPrice || p.cost || 0), 0), color: categoryColors[1] },
      { label: 'Stationery', items: stationery.length, value: stationery.reduce((s, p) => s + num(p.stock) * (p.costPrice || p.cost || 0), 0), color: categoryColors[2] },
      { label: 'Printing Svc', items: printingServices.length, value: printingServices.length, color: categoryColors[4] },
    ];

    const warehouseStock: WarehouseStock[] = warehouses.length > 0
    ? warehouses.map(w => {
        const stock = allItems.reduce((s, i) => {
          const ls = (i.locationStock || []);
          const match = ls.find((l: { warehouseId: string }) => l.warehouseId === w.id);
          return s + (match ? num(match.quantity) : 0);
        }, 0);
        const value = allItems.reduce((s, i) => {
          const ls = (i.locationStock || []);
          const match = ls.find((l: { warehouseId: string }) => l.warehouseId === w.id);
          return s + (match ? num(match.quantity) * (i.costPrice || i.cost || 0) : 0);
        }, 0);
        return { name: w.name, stock, value };
      })
    : allItems.some(i => i.warehouseId)
      ? [{ name: 'Primary', stock: totalStock, value: totalValue }]
      : [];

    const monthlyMovement: MonthlyMovement[] = [];

    const turnover = totalValue > 0 ? (allItems.reduce((s, i) => s + (i.costPrice || i.cost || 0), 0) / totalValue) * 12 : 0;
    const fastMoving = products.filter(p => num(p.stock) > (p.minStockLevel || 10) * 3).length;
    const slowMoving = products.filter(p => num(p.stock) > 0 && num(p.stock) <= (p.minStockLevel || 10)).length;

    return {
      kpis: [
        { label: 'Total Items', value: String(allItems.length), sub: `${activeItems.length} active · ${inactiveItems.length} inactive`, color: '#2563EB', icon: 'Package' },
        { label: 'Total Value', value: money(totalValue, currencySymbol), sub: 'Cost value across all items', color: '#059669', icon: 'DollarSign' },
        { label: 'Stock on Hand', value: String(totalStock), sub: `${allItems.length} items tracked`, color: '#7C3AED', icon: 'Layers' },
        { label: 'Low Stock', value: String(lowStockItems.length), sub: `${reorderItems.length} need reorder`, color: '#D97706', icon: 'AlertTriangle' },
        { label: 'Out of Stock', value: String(outOfStockItems.length), sub: `${((outOfStockItems.length / allItems.length) * 100).toFixed(1)}% of total`, color: '#DC2626', icon: 'XCircle' },
        { label: 'Reorder Required', value: String(reorderItems.length), sub: `${reorderItems.length} items below reorder point`, color: '#F97316', icon: 'ShoppingCart' },
        { label: 'Active Items', value: String(activeItems.length), sub: `${((activeItems.length / allItems.length) * 100).toFixed(0)}% of inventory`, color: '#16A34A', icon: 'CheckCircle' },
        { label: 'Inactive Items', value: String(inactiveItems.length), sub: `${((inactiveItems.length / allItems.length) * 100).toFixed(1)}% of inventory`, color: '#64748B', icon: 'Archive' },
        { label: 'Categories', value: String(categories.size), sub: `Across ${catBreakdown.filter(c => c.items > 0).length} types`, color: '#0891B2', icon: 'Tags' },
        { label: 'Warehouses', value: String(warehouseIds.size || 1), sub: `${warehouseStock.length} active location(s)`, color: '#4F46E5', icon: 'Warehouse' },
      ],
      categoryBreakdown: catBreakdown,
      valueBreakdown: catBreakdown,
      warehouseStock,
      monthlyMovement,
      turnover: Math.round(turnover * 100) / 100,
      fastMoving, slowMoving,
      totalValue, totalStock,
    };
  }, [allItems, warehouses, currencySymbol]);
}
