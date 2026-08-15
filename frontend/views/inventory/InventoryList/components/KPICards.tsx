import React from 'react';
import { Box, Layers, AlertTriangle, Sparkles, Award } from 'lucide-react';
import type { InventoryStats } from '../services/inventoryListService';

interface TopProductInfo {
  name: string;
  profit: number;
}

interface Props {
  stats: InventoryStats;
  onFilter: (key: string, value: any) => void;
  onSmartStock?: () => void;
  topProduct?: TopProductInfo;
  currency?: string;
}

interface CardDef {
  label: string;
  value: number | string;
  icon: React.ReactNode;
  accent: 'teal' | 'amber' | 'red' | 'blue' | 'gray';
  filterKey?: string;
  filterValue?: any;
  format?: 'number' | 'currency';
  desc: string;
  pct?: number;
}

const ACCENT_MAP: Record<string, { color: string; bg: string }> = {
  teal: { color: '#2563EB', bg: '#EFF6FF' },
  amber: { color: '#D97706', bg: '#FFFBEB' },
  red: { color: '#EF4444', bg: '#FEF2F2' },
  blue: { color: '#2563EB', bg: '#EFF6FF' },
  gray: { color: '#64748B', bg: '#F1F5F9' },
};

function Ring({ pct, color }: { pct: number; color: string }) {
  return (
    <div className="relative w-9 h-9 rounded-full shrink-0" style={{ background: `conic-gradient(${color} ${pct}%, #F1F5F9 0)` }}>
      <div className="absolute inset-[3px] rounded-full bg-white flex items-center justify-center font-mono text-[10px] font-semibold" style={{ color }}>{pct}%</div>
    </div>
  );
}

function formatValue(v: number | string, fmt?: 'number' | 'currency'): string {
  if (typeof v !== 'number') return String(v);
  if (fmt === 'currency') return v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return v.toLocaleString();
}

export const KPICards: React.FC<Props> = ({ stats, onFilter, onSmartStock, topProduct, currency = '' }) => {
  const total = stats.totalItems || 1;
  const cards: CardDef[] = [
    { label: 'Total items', value: stats.totalItems, icon: <Box size={16} />, accent: 'teal', desc: 'Master inventory count', pct: 7 },
    { label: 'Raw materials', value: stats.rawMaterials, icon: <Layers size={16} />, accent: 'gray', desc: 'Materials tracked', pct: Math.round((stats.rawMaterials / total) * 100), filterKey: 'classification', filterValue: ['Raw Material'] },
    { label: 'Top Product', value: topProduct?.name || '—', icon: <Award size={16} />, accent: 'blue', desc: topProduct ? `${currency}${topProduct.profit.toFixed(2)} profit` : 'No sales data' },
    { label: 'Low stock materials', value: stats.lowStockMaterials, icon: <AlertTriangle size={16} />, accent: 'amber', desc: `${stats.lowStockMaterials} raw materials near reorder point`, pct: stats.rawMaterials > 0 ? Math.round((stats.lowStockMaterials / stats.rawMaterials) * 100) : 0 },
    ...(onSmartStock ? [{ label: 'Smart Stock', value: 'AI Ready', icon: <Sparkles size={16} /> as React.ReactNode, accent: 'blue' as const, desc: 'Tap for AI stock insights' }] : []),
  ];

  return (
    <div className="ref-inv-ticket-grid">
      {cards.map(card => {
        return (
          <button key={card.label} onClick={() => { if (card.label === 'Smart Stock') onSmartStock?.(); else if (card.filterKey) onFilter(card.filterKey, card.filterValue); }}
            className="ref-inv-ticket text-left cursor-pointer hover:shadow-md transition-all">
            <div className="ref-inv-ticket-top">
              <span className="text-sm font-semibold">{card.label}</span>
              <span className="text-xs text-slate-400 font-mono">{typeof card.value === 'number' ? '' : ''}</span>
            </div>
            <div className="ref-inv-ticket-figure">{formatValue(card.value, card.format)}</div>
            <div className="ref-inv-ticket-sub">{card.desc}</div>
          </button>
        );
      })}
    </div>
  );
};
