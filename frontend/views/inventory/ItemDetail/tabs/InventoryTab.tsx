import React from 'react';
import { Package, AlertTriangle, TrendingDown, TrendingUp, BarChart3, Layers } from 'lucide-react';
import type { Item } from '../../../../types';

const t = { 50: '#eef7f6', 100: '#d3ece9', 200: '#a6d9d3', 500: '#1f8577', 600: '#146b60', 700: '#0f544c', 800: '#0b3e39' };
const amber = { 100: '#fbead0', 500: '#d99a3f' };
const paper = '#FEFDFB', ink = '#23282A', inkSoft = '#5c6567', hairline = '#e4ddd1', danger = '#b5493f';

interface Props {
  item: Item;
  stockCalc: { currentStock: number; reserved: number; available: number; incoming: number; committed: number; inventoryValue: number } | null;
}

function stockColor(current: number, min: number): string {
  if (current <= 0) return danger;
  if (current <= min) return amber[500];
  return t[500];
}

const KPI_BG: Record<string, React.CSSProperties> = {
  good: { background: t[50], border: `1.4px solid ${t[100]}` },
  warn: { background: amber[100], border: `1.4px solid ${amber[100]}` },
  bad: { background: '#fef2f2', border: '1.4px solid #fecaca' },
  neutral: { background: t[50], border: `1.4px solid ${hairline}` },
  info: { background: t[50], border: `1.4px solid ${t[100]}` },
};

export const InventoryTab: React.FC<Props> = ({ item, stockCalc }) => {
  if (!stockCalc) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '64px 0', color: inkSoft }}>
        <Package size={48} style={{ marginBottom: 16, opacity: 0.5 }} />
        <p style={{ fontSize: 14, fontWeight: 600 }}>Stock tracking is not available</p>
        <p style={{ fontSize: 12, marginTop: 4 }}>This item type does not support inventory tracking.</p>
      </div>
    );
  }

  const minStock = item.minStockLevel || 0;
  const maxStock = (item as Item & { maxStockLevel?: number }).maxStockLevel || 0;
  const reorder = item.reorderPoint || 0;
  const safetyStock = Math.round(minStock * 0.2);

  const kpis = [
    { label: 'Current Stock', value: stockCalc.currentStock, unit: item.unit || 'pcs', bg: stockCalc.currentStock <= 0 ? 'bad' : stockCalc.currentStock <= minStock ? 'warn' : 'good', icon: <Package size={16} /> },
    { label: 'Reserved', value: stockCalc.reserved, unit: 'allocated', bg: 'neutral', icon: <TrendingDown size={16} /> },
    { label: 'Available', value: stockCalc.available, unit: 'ready to sell', bg: stockCalc.available > 0 ? 'good' : 'bad', icon: <TrendingUp size={16} /> },
    { label: 'Incoming', value: stockCalc.incoming, unit: 'on order', bg: 'info', icon: <Layers size={16} /> },
  ];

  const thresholds = [
    { label: 'Min Stock', value: minStock },
    { label: 'Max Stock', value: maxStock },
    { label: 'Reorder Point', value: reorder },
    { label: 'Safety Stock', value: safetyStock },
  ];

  const maxThreshold = Math.max(maxStock, stockCalc.currentStock, 1);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
        {kpis.map(k => (
          <div key={k.label} className="prime-card" style={{ ...KPI_BG[k.bg], borderRadius: 12, padding: 16, boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <span style={{ fontSize: 10, fontWeight: 600, color: inkSoft, textTransform: 'uppercase', letterSpacing: 0.5 }}>{k.label}</span>
              <span style={{ color: inkSoft }}>{k.icon}</span>
            </div>
            <p style={{ fontSize: 24, fontWeight: 700, color: stockColor(k.value, minStock) }}>{k.value}</p>
            <p style={{ fontSize: 10, color: inkSoft, marginTop: 2 }}>{k.unit}</p>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
        {thresholds.map(t => (
          <div key={t.label} className="prime-card" style={{ background: paper, borderRadius: 12, padding: 16, border: `1.4px solid ${hairline}`, boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>
            <span style={{ fontSize: 10, fontWeight: 600, color: inkSoft, textTransform: 'uppercase', letterSpacing: 0.5, display: 'block', marginBottom: 6 }}>{t.label}</span>
            <p style={{ fontSize: 18, fontWeight: 700, color: ink }}>{t.value}</p>
          </div>
        ))}
      </div>

      <div className="prime-card" style={{ background: paper, borderRadius: 12, border: `1.4px solid ${hairline}`, padding: 20, boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <BarChart3 size={16} style={{ color: inkSoft }} />
              <span style={{ fontSize: 12, fontWeight: 600, color: inkSoft, textTransform: 'uppercase', letterSpacing: 0.5 }}>Inventory Value</span>
            </div>
            <p style={{ fontSize: 24, fontWeight: 600, color: '#111827', fontVariantNumeric: 'tabular-nums', fontFamily: "'Inter', sans-serif" }}>{stockCalc.inventoryValue.toFixed(2)}</p>
          </div>
          {stockCalc.currentStock <= minStock && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: amber[100], border: `1.4px solid ${amber[100]}`, borderRadius: 12 }}>
              <AlertTriangle size={16} style={{ color: amber[500] }} />
              <span style={{ fontSize: 12, fontWeight: 600, color: amber[500] }}>Low Stock Warning</span>
            </div>
          )}
        </div>
        {maxStock > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ position: 'relative', height: 12, background: t[100], borderRadius: 9999, overflow: 'hidden' }}>
              {thresholds.map((t, i) => {
                if (t.value <= 0) return null;
                const pct = Math.min(100, (t.value / maxThreshold) * 100);
                const colors = ['#f87171', '#60a5fa', '#fbbf24', '#34d399'];
                return (
                  <div key={i} style={{ position: 'absolute', top: 0, height: '100%', width: 2, backgroundColor: colors[i], left: `${pct}%`, opacity: 0.5 }} />
                );
              })}
              <div
                style={{
                  height: '100%',
                  borderRadius: 9999,
                  transition: 'all .3s',
                  background: stockCalc.currentStock <= minStock ? '#ef4444' : stockCalc.currentStock <= maxStock * 0.5 ? amber[500] : t[500],
                  width: `${Math.min(100, (stockCalc.currentStock / maxThreshold) * 100)}%`
                }}
              />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: inkSoft }}>
              <span>0</span>
              {thresholds.filter(t => t.value > 0).map(t => (
                <span key={t.label}>{t.label}: {t.value}</span>
              ))}
              <span>{maxThreshold}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};