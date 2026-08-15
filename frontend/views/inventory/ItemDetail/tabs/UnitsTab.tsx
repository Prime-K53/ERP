import React from 'react';
import { Scale, ArrowRight, ShoppingCart, TrendingUp, Beaker } from 'lucide-react';
import type { Item } from '../../../../types';

const t = { 50: '#eef7f6', 100: '#d3ece9', 200: '#a6d9d3', 500: '#1f8577', 600: '#146b60', 700: '#0f544c', 800: '#0b3e39' };
const amber = { 100: '#fbead0', 500: '#d99a3f' };
const paper = '#FEFDFB', ink = '#23282A', inkSoft = '#5c6567', hairline = '#e4ddd1', danger = '#b5493f';

interface Props {
  item: Item;
}

export const UnitsTab: React.FC<Props> = ({ item }) => {
  const baseUnit = item.unit || 'pcs';
  const ext = item as Item & { purchaseUnit?: string; salesUnit?: string; consumptionUnit?: string; conversions?: { fromUnit: string; toUnit: string; factor: number }[]; unitConversions?: { fromUnit: string; toUnit: string; factor: number }[]; conversionRate?: number };
  const purchaseUnit = ext.purchaseUnit || item.purchaseUnit || '';
  const salesUnit = ext.salesUnit || '';
  const consumptionUnit = ext.consumptionUnit || item.consumptionUnit || '';
  const conversions: { fromUnit: string; toUnit: string; factor: number }[] = ext.conversions || ext.unitConversions || [];
  const conversionRate = item.conversionFactor || ext.conversionRate || 1;

  const cards = [
    { label: 'Base Unit', value: baseUnit, icon: <Scale size={16} />, color: ink },
    { label: 'Purchase Unit', value: purchaseUnit || '—', icon: <ShoppingCart size={16} />, color: t[500] },
    { label: 'Sales Unit', value: salesUnit || '—', icon: <TrendingUp size={16} />, color: t[500] },
    { label: 'Consumption Unit', value: consumptionUnit || '—', icon: <Beaker size={16} />, color: amber[500] },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
        {cards.map(c => (
          <div key={c.label} className="prime-card" style={{ background: paper, borderRadius: 12, border: `1.4px solid ${hairline}`, padding: 16, boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <span style={{ fontSize: 10, fontWeight: 600, color: inkSoft, textTransform: 'uppercase', letterSpacing: 0.5 }}>{c.label}</span>
              <span style={{ color: c.color }}>{c.icon}</span>
            </div>
            <p style={{ fontSize: 20, fontWeight: 700, color: c.value !== '—' ? c.color : inkSoft }}>{c.value}</p>
          </div>
        ))}
      </div>

      {purchaseUnit && !conversions.length && (
        <div className="prime-card" style={{ background: paper, borderRadius: 12, border: `1.4px solid ${hairline}`, overflow: 'hidden', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>
          <div style={{ padding: '14px 20px', background: t[50], borderBottom: `1.4px solid ${hairline}`, display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ padding: 6, borderRadius: 9, background: paper, boxShadow: '0 1px 2px rgba(0,0,0,0.05)', color: inkSoft }}><Scale size={16} /></span>
            <span style={{ fontSize: 12, fontWeight: 600, color: inkSoft, textTransform: 'uppercase', letterSpacing: 0.5 }}>Conversion</span>
          </div>
          <div style={{ padding: 20, display: 'flex', alignItems: 'center', gap: 16 }}>
            <div style={{ padding: '10px 16px', background: t[100], borderRadius: 12 }}>
              <span style={{ fontWeight: 700, color: ink }}>1 {purchaseUnit}</span>
            </div>
            <ArrowRight size={20} style={{ color: inkSoft, flexShrink: 0 }} />
            <div style={{ padding: '10px 16px', background: t[50], borderRadius: 12, border: `1.4px solid ${t[100]}` }}>
              <span style={{ fontWeight: 700, color: t[500] }}>{conversionRate} {baseUnit}</span>
            </div>
          </div>
        </div>
      )}

      {conversions.length > 0 && (
        <div className="prime-card" style={{ background: paper, borderRadius: 12, border: `1.4px solid ${hairline}`, overflow: 'hidden', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>
          <div style={{ padding: '14px 20px', background: t[50], borderBottom: `1.4px solid ${hairline}`, display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ padding: 6, borderRadius: 9, background: paper, boxShadow: '0 1px 2px rgba(0,0,0,0.05)', color: inkSoft }}><Scale size={16} /></span>
            <span style={{ fontSize: 12, fontWeight: 600, color: inkSoft, textTransform: 'uppercase', letterSpacing: 0.5 }}>Conversion Tree ({conversions.length})</span>
          </div>
          <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
            {conversions.map((c, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 12, background: t[50], borderRadius: 12, border: `1.4px solid ${hairline}` }}>
                <div style={{ padding: '6px 12px', background: paper, borderRadius: 9, boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>
                  <span style={{ fontWeight: 700, color: ink }}>1 {c.fromUnit}</span>
                </div>
                <ArrowRight size={16} style={{ color: inkSoft, flexShrink: 0 }} />
                <div style={{ padding: '6px 12px', background: t[50], borderRadius: 9, border: `1.4px solid ${t[100]}` }}>
                  <span style={{ fontWeight: 700, color: t[500] }}>{c.factor} {c.toUnit}</span>
                </div>
                <div style={{ display: 'flex', gap: 4, marginLeft: 'auto' }}>
                  {c.fromUnit === purchaseUnit && <span style={{ fontSize: 10, padding: '2px 8px', background: t[50], color: t[600], borderRadius: 9999, fontWeight: 600 }}>Purchasing</span>}
                  {c.toUnit === consumptionUnit && <span style={{ fontSize: 10, padding: '2px 8px', background: amber[100], color: amber[500], borderRadius: 9999, fontWeight: 600 }}>Consumption</span>}
                  {(c.fromUnit === salesUnit || c.toUnit === salesUnit) && <span style={{ fontSize: 10, padding: '2px 8px', background: t[50], color: t[600], borderRadius: 9999, fontWeight: 600 }}>Sales</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {!purchaseUnit && !conversions.length && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '48px 0', color: inkSoft }}>
          <Scale size={48} style={{ marginBottom: 16, opacity: 0.5 }} />
          <p style={{ fontSize: 14, fontWeight: 600 }}>No Unit Conversions</p>
          <p style={{ fontSize: 12, marginTop: 4 }}>Configure purchase or sales units to enable conversions.</p>
        </div>
      )}
    </div>
  );
};