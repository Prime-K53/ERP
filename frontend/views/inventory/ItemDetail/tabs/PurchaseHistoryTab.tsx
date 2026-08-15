import React from 'react';
import { ShoppingCart, ClipboardList, DollarSign, Package } from 'lucide-react';
import type { Purchase } from '../../../../types';

const t = { 50: '#eef7f6', 100: '#d3ece9', 200: '#a6d9d3', 500: '#1f8577', 600: '#146b60', 700: '#0f544c', 800: '#0b3e39' };
const amber = { 100: '#fbead0', 500: '#d99a3f' };
const paper = '#FEFDFB', ink = '#23282A', inkSoft = '#5c6567', hairline = '#e4ddd1', danger = '#b5493f';

interface Props {
  purchases: Purchase[];
  itemId: string;
}

export const PurchaseHistoryTab: React.FC<Props> = ({ purchases, itemId }) => {
  if (purchases.length === 0) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '64px 0', color: inkSoft }}>
        <ShoppingCart size={48} style={{ marginBottom: 16, opacity: 0.5 }} />
        <p style={{ fontSize: 14, fontWeight: 600 }}>No Purchase History</p>
        <p style={{ fontSize: 12, marginTop: 4 }}>No purchase orders have been placed for this item.</p>
      </div>
    );
  }

  const totalQty = purchases.reduce((s, p) => {
    const line = p.items?.find(i => i.itemId === itemId);
    return s + (line?.quantity || 0);
  }, 0);
  const totalCost = purchases.reduce((s, p) => {
    const line = p.items?.find(i => i.itemId === itemId);
    return s + ((line?.cost || 0) * (line?.quantity || 0));
  }, 0);

  const kpis = [
    { label: 'Total Orders', value: purchases.length, icon: <ClipboardList size={16} />, color: ink },
    { label: 'Total Quantity', value: totalQty, icon: <Package size={16} />, color: t[500] },
    { label: 'Total Spent', value: totalCost.toFixed(2), icon: <DollarSign size={16} />, color: danger },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
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
              {['PO #', 'Supplier', 'Date', 'Quantity', 'Unit Cost', 'Total', 'Status'].map(h => (
                <th key={h} className="prime-table-header" style={{
                  padding: '12px 16px',
                  fontSize: 10,
                  fontWeight: 600,
                  color: inkSoft,
                  textTransform: 'uppercase',
                  letterSpacing: 0.5,
                  textAlign: h === 'Quantity' || h === 'Unit Cost' || h === 'Total' ? 'right' as const : 'left' as const
                }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {purchases.map((p) => {
              const line = p.items?.find(i => i.itemId === itemId);
              if (!line) return null;
              return (
                <tr key={p.id} className="prime-table-cell"
                  style={{ borderTop: `1.4px solid ${hairline}`, transition: 'all .15s' }}
                  onMouseEnter={e => e.currentTarget.style.background = t[50]}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >
                  <td style={{ padding: '12px 16px', fontFamily: 'monospace', fontSize: 12, fontWeight: 600, color: ink }}>{p.id?.slice(0, 12)}</td>
                  <td style={{ padding: '12px 16px', color: inkSoft }}>{p.supplierId || p.supplierName || '—'}</td>
                  <td style={{ padding: '12px 16px', fontSize: 12, color: inkSoft }}>{p.date ? new Date(p.date).toLocaleDateString() : '—'}</td>
                  <td style={{ padding: '12px 16px', textAlign: 'right', fontFamily: 'monospace', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{line.quantity}</td>
                  <td style={{ padding: '12px 16px', textAlign: 'right', fontFamily: "'Inter', sans-serif", fontVariantNumeric: 'tabular-nums', fontWeight: 600, color: '#111827' }}>{line.cost?.toFixed(2)}</td>
                  <td style={{ padding: '12px 16px', textAlign: 'right', fontFamily: "'Inter', sans-serif", fontWeight: 600, fontVariantNumeric: 'tabular-nums', color: '#111827' }}>{(line.cost * line.quantity).toFixed(2)}</td>
                  <td style={{ padding: '12px 16px' }}>
                    <span style={{
                      display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10, fontWeight: 600,
                      padding: '4px 10px', borderRadius: 9999,
                      background: p.status === 'Received' ? t[50] : p.status === 'Ordered' ? t[50] : amber[100],
                      color: p.status === 'Received' ? t[600] : p.status === 'Ordered' ? t[600] : amber[500]
                    }}>
                      <span style={{ width: 4, height: 4, borderRadius: '50%', background: p.status === 'Received' ? t[500] : p.status === 'Ordered' ? t[500] : amber[500] }} />
                      {p.status || 'Draft'}
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