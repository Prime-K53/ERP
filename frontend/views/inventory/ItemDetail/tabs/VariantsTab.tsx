import React, { useState } from 'react';
import { Layers, Package, DollarSign, Check, X, TrendingUp } from 'lucide-react';
import type { Item, ProductVariant } from '../../../../types';
import { resolveMinimumMarkup } from '../../../../services/pricingValidationService';

const t = { 50: '#eef7f6', 100: '#d3ece9', 200: '#a6d9d3', 500: '#1f8577', 600: '#146b60', 700: '#0f544c', 800: '#0b3e39' };
const amber = { 100: '#fbead0', 500: '#d99a3f' };
const paper = '#FEFDFB', ink = '#23282A', inkSoft = '#5c6567', hairline = '#e4ddd1', danger = '#b5493f';

interface Props {
  item: Item;
}

const isProduct = (item: Item) => item.type === 'Product' || item.classification === 'product' || item.classification === 'finished_good';
const isStationery = (item: Item) => item.type === 'Stationery' || item.classification === 'stationery';
const showPages = (item: Item) => isProduct(item) || item.type === 'Service' || item.classification === 'printing_service';

export const VariantsTab: React.FC<Props> = ({ item }) => {
  const itemExt = item as Item & { variants?: ProductVariant[]; smartPricing?: { pages?: number }; pages?: number };
  const variants: ProductVariant[] = itemExt.variants || [];
  const hasVariants = variants.length > 0;
  const [editablePages, setEditablePages] = useState<Record<string, number>>({});

  const baseCost = item.costPrice || item.cost || 0;
  const basePages = itemExt.smartPricing?.pages || itemExt.pages || 1;

  if (!hasVariants) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '64px 0', color: inkSoft }}>
        <Layers size={48} style={{ marginBottom: 16, opacity: 0.5 }} />
        <p style={{ fontSize: 14, fontWeight: 600 }}>No Variants</p>
        <p style={{ fontSize: 12, marginTop: 4 }}>This item has no variants configured.</p>
      </div>
    );
  }

  const totalStock = variants.reduce((s, v) => s + (v.stock || 0), 0);
  const avgPrice = variants.reduce((s, v) => s + (v.sellingPrice || v.price || 0), 0) / variants.length;
  const activeCount = variants.filter(v => v.active !== false).length;

  const kpis = [
    { label: 'Total Variants', value: variants.length, icon: <Layers size={16} />, color: ink },
    { label: 'Combined Stock', value: totalStock, icon: <Package size={16} />, color: t[500] },
    { label: 'Avg Price', value: avgPrice.toFixed(2), icon: <DollarSign size={16} />, color: '#111827' },
    { label: 'Active', value: `${activeCount}/${variants.length}`, icon: <TrendingUp size={16} />, color: t[500] },
  ];

  const columns = showPages(item)
    ? ['Name & Attr', 'Pages', 'Cost Price', 'Selling Price', 'Markup', 'Active']
    : ['Name & Attr', 'Cost Price', 'Selling Price', 'Markup', 'Active'];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
        {kpis.map(k => (
          <div key={k.label} className="prime-card" style={{ background: paper, borderRadius: 12, border: `1.4px solid ${hairline}`, padding: 16, boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <span style={{ fontSize: 10, fontWeight: 600, color: inkSoft, textTransform: 'uppercase', letterSpacing: 0.5 }}>{k.label}</span>
              <span style={{ color: inkSoft }}>{k.icon}</span>
            </div>
            <p style={{ fontSize: 24, fontWeight: 600, color: k.color, fontFamily: "'Inter', sans-serif", fontVariantNumeric: 'tabular-nums' }}>{k.value}</p>
          </div>
        ))}
      </div>

      <div className="prime-card" style={{ background: paper, borderRadius: 12, border: `1.4px solid ${hairline}`, overflow: 'hidden', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>
        <table style={{ width: '100%', fontSize: 14 }}>
          <thead>
            <tr style={{ background: t[50], borderBottom: `1.4px solid ${hairline}` }}>
              {columns.map(h => (
                <th key={h} className="prime-table-header" style={{
                  padding: '12px 16px',
                  fontSize: 10,
                  fontWeight: 600,
                  color: inkSoft,
                  textTransform: 'uppercase',
                  letterSpacing: 0.5,
                  textAlign: ['Cost Price', 'Selling Price', 'Markup', 'Pages'].includes(h) ? 'right' as const : h === 'Active' ? 'center' as const : 'left' as const
                }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {variants.map((v) => {
              const cp = v.costPrice || v.cost || 0;
              const sp = v.sellingPrice || v.price || 0;
              const margin = cp > 0 ? ((sp - cp) / cp) * 100 : 0;
              const marginOk = margin >= (v.minimumMargin || resolveMinimumMarkup(item));
              const currentPages = editablePages[v.id] ?? v.pages ?? 1;
              const costPerPage = baseCost && basePages > 0 ? baseCost / basePages : 0;
              const autoCp = showPages(item) && costPerPage > 0 ? Number((costPerPage * currentPages).toFixed(2)) : cp;

              return (
                <tr key={v.id} className="prime-table-cell"
                  style={{ borderTop: `1.4px solid ${hairline}`, transition: 'all .15s' }}
                  onMouseEnter={e => e.currentTarget.style.background = t[50]}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >
                  <td style={{ padding: '12px 16px', fontWeight: 600, color: ink }}>{v.name}</td>
                  {showPages(item) && (
                    <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                      <input
                        type="number"
                        min={1}
                        value={currentPages}
                        onChange={e => {
                          const p = Number(e.target.value);
                          if (p >= 1) setEditablePages(prev => ({ ...prev, [v.id]: p }));
                        }}
                        className="prime-input"
                        style={{ width: 80, textAlign: 'right', fontSize: 14, border: `1.4px solid ${hairline}`, borderRadius: 4, padding: '2px 6px', outline: 'none', background: paper, color: ink }}
                      />
                    </td>
                  )}
                  <td style={{ padding: '12px 16px', textAlign: 'right', fontFamily: "'Inter', sans-serif", fontVariantNumeric: 'tabular-nums', fontWeight: 600, color: '#111827' }}>{autoCp.toFixed(2)}</td>
                  <td style={{ padding: '12px 16px', textAlign: 'right', fontFamily: "'Inter', sans-serif", fontVariantNumeric: 'tabular-nums', color: '#111827', fontWeight: 600 }}>{sp.toFixed(2)}</td>
                  <td style={{ padding: '12px 16px', textAlign: 'right', fontFamily: "'Inter', sans-serif", fontVariantNumeric: 'tabular-nums', fontWeight: 600, color: marginOk ? t[500] : danger }}>
                    {margin.toFixed(1)}%
                  </td>
                  <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                    {v.active !== false
                      ? <Check size={16} style={{ color: t[500], margin: '0 auto' }} />
                      : <X size={16} style={{ color: inkSoft, margin: '0 auto' }} />}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};