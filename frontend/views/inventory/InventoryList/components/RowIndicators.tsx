import React from 'react';
import { AlertTriangle, XCircle, Archive, Thermometer, Hash, Layers, Beaker, Printer, Package } from 'lucide-react';
import type { Item } from '../../../../types';
import { getStockHealth } from '../services/inventoryListService';

interface Props {
  item: Item;
}

export const RowIndicators: React.FC<Props> = ({ item }) => {
  const stock = item.stock || 0;
  const minStock = item.minStockLevel || item.reorderPoint || 0;
  const status = item.status || 'Active';
  const t = item as Item & {
    printingServiceType?: unknown;
    lotTracking?: unknown;
    trackLot?: unknown;
    serialTracking?: unknown;
    trackSerial?: unknown;
    temperatureControlled?: unknown;
    hazardous?: unknown;
    batchTracking?: unknown;
    batchControlled?: unknown;
  };

  const indicators: { icon: React.ReactNode; label: string; show: boolean; color: string }[] = [
    { icon: <XCircle size={12} />, label: 'Out of Stock', show: stock <= 0 && status !== 'Inactive', color: '#DC2626' },
    { icon: <AlertTriangle size={12} />, label: 'Low Stock', show: stock > 0 && minStock > 0 && stock <= minStock, color: '#D97706' },
    { icon: <Archive size={12} />, label: 'Inactive', show: status === 'Inactive', color: '#94A3B8' },
    { icon: <Package size={12} />, label: 'Recipe Missing', show: (item.productType === 'MANUFACTURED' || t.printingServiceType) && !item.serviceRecipeId, color: '#DC2626' },
    { icon: <Layers size={12} />, label: 'Supplier Missing', show: !item.preferredSupplierId, color: '#D97706' },
    { icon: <Hash size={12} />, label: 'Lot Tracking', show: !!(t.lotTracking || t.trackLot), color: '#2563EB' },
    { icon: <Hash size={12} />, label: 'Serial Tracking', show: !!(t.serialTracking || t.trackSerial), color: '#2563EB' },
    { icon: <Thermometer size={12} />, label: 'Temp. Controlled', show: !!(t.temperatureControlled || t.hazardous), color: '#DC2626' },
    { icon: <Beaker size={12} />, label: 'Batch Controlled', show: !!(t.batchTracking || t.batchControlled), color: '#2563EB' },
    { icon: <Layers size={12} />, label: 'Has Variants', show: !!(t.variants?.length > 0), color: '#2563EB' },
    { icon: <Printer size={12} />, label: 'Printing Service', show: !!t.printingServiceType, color: '#2563EB' },
  ];

  return (
    <div className="flex items-center gap-1">
      {indicators.filter(i => i.show).map(i => (
        <span key={i.label} style={{ color: i.color }} title={i.label}>{i.icon}</span>
      ))}
    </div>
  );
};

export const StockBadge: React.FC<{ item: Item }> = ({ item }) => {
  const health = getStockHealth(item);
  const configs: Record<string, { label: string; bg: string; color: string }> = {
    healthy: { label: `${item.stock || 0} in stock`, bg: '#F0FDF4', color: '#16A34A' },
    low: { label: `${item.stock || 0} — low stock`, bg: '#FFFBEB', color: '#D97706' },
    reorder: { label: `${item.stock || 0} — reorder needed`, bg: '#FEF2F2', color: '#DC2626' },
    out: { label: 'Out of stock', bg: '#FEF2F2', color: '#DC2626' },
    inactive: { label: 'Inactive', bg: '#F8FAFC', color: '#64748B' },
  };
  const cfg = configs[health] || configs.healthy;
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-[99px] text-xs font-medium" style={{ background: cfg.bg, color: cfg.color }}>
      {cfg.label}
    </span>
  );
};
