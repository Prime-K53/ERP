import React from 'react';
import { TrendingUp, DollarSign, Package, Receipt } from 'lucide-react';
import type { Sale } from '../../../../types';

const t = { 50: '#eef7f6', 100: '#d3ece9', 200: '#a6d9d3', 500: '#1f8577', 600: '#146b60', 700: '#0f544c', 800: '#0b3e39' };
const amber = { 100: '#fbead0', 500: '#d99a3f' };
const paper = '#FEFDFB', ink = '#23282A', inkSoft = '#5c6567', hairline = '#e4ddd1', danger = '#b5493f';

interface Props {
  sales: Sale[];
  itemId: string;
}

export const SalesHistoryTab: React.FC<Props> = ({ sales, itemId }) => {
  if (sales.length === 0) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '64px 0', color: inkSoft }}>
        <TrendingUp size={48} style={{ marginBottom: 16, opacity: 0.5 }} />
        <p style={{ fontSize: 14, fontWeight: 600 }}>No Sales History</p>
        <p style={{ fontSize: 12, marginTop: 4 }}>This item has not been sold yet.</p>
      </div>
    );
  }

  const totalQty = sales.reduce((s, sale) => {
    const line = sale.items?.find((i: any) => i.id === itemId || i.itemId === itemId);
    return s + (line?.quantity || 0);
  }, 0);
  const totalRevenue = sales.reduce((s, sale) => {
    const line = sale.items?.find((i: any) => i.id === itemId || i.itemId === itemId);
    const qty = line?.quantity || 0;
    const price = line?.price || line?.unitPrice || 0;
    return s + (qty * price);
  }, 0);
  const totalProfit = sales.reduce((s, sale) => {
    const line = sale.items?.find((i: any) => i.id === itemId || i.itemId === itemId);
    if (!line) return s;
    const qty = line.quantity || 0;
    const price = line.price || line.unitPrice || 0;
    const cost = line.costPrice || line.cost || 0;
    return s + ((price - cost) * qty);
  }, 0);

  const kpis = [
    { label: 'Total Orders', value: sales.length, icon: <Receipt size={16} />, color: ink },
    { label: 'Total Quantity', value: totalQty, icon: <Package size={16} />, color: t[500] },
    { label: 'Total Revenue', value: totalRevenue.toFixed(2), icon: <DollarSign size={16} />, color: t[500] },
    { label: 'Total Profit', value: totalProfit.toFixed(2), icon: <TrendingUp size={16} />, color: totalProfit >= 0 ? t[500] : danger },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
        {kpis.map(k => (
          <div key={k.label} className="prime-card" style={{ background: paper, borderRadius: 12, border: `1.4px solid ${hairline}`, padding: 16, boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <span style={{ fontSize: 10, fontWeight: 600, color: inkSoft, textTransform: 'uppercase', letterSpacing: 0.5 }}>{k.label}</span>
              <span style={{ color: inkSoft }}>{k.icon}</span>
            </div>
            <p style={{ fontSize: 20, fontWeight: 600, color: k.color, fontFamily: "'Inter', sans-serif", fontVariantNumeric: 'tabular-nums' }}>{k.value}</p>
          </div>
        ))}
      </div>

      <div className="prime-card" style={{ background: paper, borderRadius: 12, border: `1.4px solid ${hairline}`, overflow: 'hidden', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>
        <table style={{ width: '100%', fontSize: 14 }}>
          <thead>
            <tr style={{ background: t[50], borderBottom: `1.4px solid ${hairline}` }}>
              {['Invoice', 'Customer', 'Date', 'Quantity', 'Unit Price', 'Total', 'Profit', 'Status'].map(h => (
                <th key={h} className="prime-table-header" style={{
                  padding: '12px 16px',
                  fontSize: 10,
                  fontWeight: 600,
                  color: inkSoft,
                  textTransform: 'uppercase',
                  letterSpacing: 0.5,
                  textAlign: h === 'Quantity' || h === 'Unit Price' || h === 'Total' || h === 'Profit' ? 'right' as const : h === 'Status' ? 'center' as const : 'left' as const
                }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sales.map((s) => {
              const line = s.items?.find((i: any) => i.id === itemId || i.itemId === itemId);
              if (!line) return null;
              const qty = line.quantity || 0;
              const price = line.price || line.unitPrice || 0;
              const total = qty * price;
              const cost = line.costPrice || line.cost || 0;
              const profit = total - (qty * cost);
              return (
                <tr key={s.id} className="prime-table-cell"
                  style={{ borderTop: `1.4px solid ${hairline}`, transition: 'all .15s' }}
                  onMouseEnter={e => e.currentTarget.style.background = t[50]}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >
                  <td style={{ padding: '12px 16px', fontFamily: 'monospace', fontSize: 12, fontWeight: 600, color: ink }}>{s.id?.slice(0, 12)}</td>
                  <td style={{ padding: '12px 16px', color: inkSoft }}>{s.customerName || s.customerId || '—'}</td>
                  <td style={{ padding: '12px 16px', fontSize: 12, color: inkSoft }}>{s.date ? new Date(s.date).toLocaleDateString() : '—'}</td>
                  <td style={{ padding: '12px 16px', textAlign: 'right', fontFamily: 'monospace', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{qty}</td>
                  <td style={{ padding: '12px 16px', textAlign: 'right', fontFamily: "'Inter', sans-serif", fontVariantNumeric: 'tabular-nums', fontWeight: 600, color: '#111827' }}>{price.toFixed(2)}</td>
                  <td style={{ padding: '12px 16px', textAlign: 'right', fontFamily: "'Inter', sans-serif", fontWeight: 600, fontVariantNumeric: 'tabular-nums', color: '#111827' }}>{total.toFixed(2)}</td>
                  <td style={{ padding: '12px 16px', textAlign: 'right', fontFamily: "'Inter', sans-serif", fontWeight: 600, fontVariantNumeric: 'tabular-nums', color: profit >= 0 ? t[500] : danger }}>
                    {profit.toFixed(2)}
                  </td>
                  <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                    <span style={{
                      display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10, fontWeight: 600,
                      padding: '4px 10px', borderRadius: 9999,
                      background: s.status === 'Completed' || s.status === 'Paid' ? t[50] : s.status === 'Pending' ? amber[100] : t[100],
                      color: s.status === 'Completed' || s.status === 'Paid' ? t[600] : s.status === 'Pending' ? amber[500] : inkSoft
                    }}>
                      <span style={{ width: 4, height: 4, borderRadius: '50%', background: s.status === 'Completed' || s.status === 'Paid' ? t[500] : s.status === 'Pending' ? amber[500] : inkSoft }} />
                      {s.status || 'Completed'}
                    </span>
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