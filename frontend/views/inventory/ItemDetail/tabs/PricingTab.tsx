import React from 'react';
import { DollarSign, TrendingUp, TrendingDown, Percent, Shield, Settings } from 'lucide-react';
import type { Item } from '../../../../types';
import { validateMinimumMarkup, resolveMinimumMarkup } from '../../../../services/pricingValidationService';

const t = { 50: '#eef7f6', 100: '#d3ece9', 200: '#a6d9d3', 500: '#1f8577', 600: '#146b60', 700: '#0f544c', 800: '#0b3e39' };
const amber = { 100: '#fbead0', 500: '#d99a3f' };
const paper = '#FEFDFB', ink = '#23282A', inkSoft = '#5c6567', hairline = '#e4ddd1', danger = '#b5493f';

interface Props {
  item: Item;
}

export const PricingTab: React.FC<Props> = ({ item }) => {
  const isRawMaterial = item.type === 'Raw Material' || item.type === 'Material' || item.classification === 'raw_material' || item.classification === 'material';
  const costPrice = item.costPrice || item.cost || 0;
  const sellingPrice = item.sellingPrice || item.price || 0;
  const profit = sellingPrice - costPrice;
  const markup = costPrice > 0 ? ((sellingPrice - costPrice) / costPrice) * 100 : 0;
  const validation = !isRawMaterial && sellingPrice > 0 ? validateMinimumMarkup(costPrice, sellingPrice, { category: item.category, id: item.id }) : null;
  const minMarkup = resolveMinimumMarkup(item);

  const kpis = [
    { label: 'Cost Price', value: costPrice.toFixed(2), icon: <DollarSign size={16} />, accent: false },
    ...(!isRawMaterial ? [{ label: 'Selling Price', value: sellingPrice.toFixed(2), icon: <TrendingUp size={16} />, accent: true }] : []),
    !isRawMaterial ? { label: 'Profit', value: profit.toFixed(2), color: profit >= 0 ? t[500] : danger, icon: <TrendingDown size={16} /> } : null,
    !isRawMaterial ? { label: 'Markup', value: `${markup.toFixed(1)}%`, color: markup >= minMarkup ? t[500] : danger, icon: <Percent size={16} /> } : null,
  ].filter(Boolean);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
        {kpis.map(k => (
          <div key={k.label} className="prime-card" style={{ background: paper, borderRadius: 12, border: `1.4px solid ${hairline}`, padding: 16, boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <span style={{ fontSize: 10, fontWeight: 600, color: inkSoft, textTransform: 'uppercase', letterSpacing: 0.5 }}>{k.label}</span>
              <span style={{ color: k.accent ? t[500] : inkSoft }}>{k.icon}</span>
            </div>
            <p style={{ fontSize: 24, fontWeight: 600, fontFamily: "'Inter', sans-serif", fontVariantNumeric: 'tabular-nums', color: k.color || '#111827' }}>
              {k.value}
            </p>
          </div>
        ))}
      </div>

      {validation && (
        <div className="prime-card" style={{
          borderRadius: 12,
          border: `1.4px solid ${validation.valid ? t[100] : '#fecaca'}`,
          padding: 20,
          boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
          background: validation.valid ? t[50] : '#fef2f2'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
            <Shield size={20} style={{ color: validation.valid ? t[500] : danger }} />
            <div>
              <span style={{ fontSize: 14, fontWeight: 600, color: validation.valid ? t[600] : danger }}>
                {validation.valid ? 'Minimum Markup Passed' : 'Below Minimum Markup'}
              </span>
              <p style={{ fontSize: 12, color: inkSoft, marginTop: 2 }}>
                Required: {validation.minimumMarkup}% &middot; Actual: {validation.profitMarkup.toFixed(1)}% &middot; Profit: {validation.profit.toFixed(2)}
              </p>
            </div>
          </div>
          {!validation.valid && validation.message && (
            <p style={{ fontSize: 12, color: danger, marginLeft: 36 }}>{validation.message}</p>
          )}
        </div>
      )}

      <div className="prime-card" style={{ background: paper, borderRadius: 12, border: `1.4px solid ${hairline}`, overflow: 'hidden', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>
        <div style={{ padding: '14px 20px', background: t[50], borderBottom: `1.4px solid ${hairline}`, display: 'flex', alignItems: 'center', gap: 10 }}>
          <Settings size={14} style={{ color: inkSoft }} />
          <span style={{ fontSize: 12, fontWeight: 600, color: inkSoft, textTransform: 'uppercase', letterSpacing: 0.5 }}>Pricing Configuration</span>
        </div>
        <div style={{ padding: 20 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 24, fontSize: 14 }}>
            <div>
              <span style={{ fontSize: 10, fontWeight: 500, color: inkSoft, textTransform: 'uppercase', letterSpacing: 0.5, display: 'block', marginBottom: 4 }}>Min Markup</span>
              <p style={{ fontWeight: 600, color: ink }}>{minMarkup}%</p>
            </div>
            <div>
              <span style={{ fontSize: 10, fontWeight: 500, color: inkSoft, textTransform: 'uppercase', letterSpacing: 0.5, display: 'block', marginBottom: 4 }}>Currency</span>
              <p style={{ fontWeight: 600, color: ink }}>{(item as Item & { currency?: string }).currency || 'KWD'}</p>
            </div>
            <div>
              <span style={{ fontSize: 10, fontWeight: 500, color: inkSoft, textTransform: 'uppercase', letterSpacing: 0.5, display: 'block', marginBottom: 4 }}>Markup %</span>
              <p style={{ fontWeight: 600, color: ink }}>{(item as Item & { marginPercent?: number }).marginPercent || 0}%</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};