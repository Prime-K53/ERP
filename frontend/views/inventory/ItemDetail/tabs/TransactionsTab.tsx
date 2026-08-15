import React, { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, Filter, Calendar, TrendingDown, TrendingUp } from 'lucide-react';
import type { InventoryTransaction } from '../../../../types';

const t = { 50: '#eef7f6', 100: '#d3ece9', 200: '#a6d9d3', 500: '#1f8577', 600: '#146b60', 700: '#0f544c', 800: '#0b3e39' };
const amber = { 100: '#fbead0', 500: '#d99a3f' };
const paper = '#FEFDFB', ink = '#23282A', inkSoft = '#5c6567', hairline = '#e4ddd1', danger = '#b5493f';

interface Props {
  transactions: InventoryTransaction[];
}

type TxType = 'in' | 'out' | 'all';

export const TransactionsTab: React.FC<Props> = ({ transactions }) => {
  const [filter, setFilter] = useState<TxType>('all');
  const [dateRange, setDateRange] = useState<'all' | '30d' | '90d' | '1y'>('all');

  const filtered = useMemo(() => {
    let result = transactions;
    if (filter !== 'all') {
      result = result.filter(t => {
        const qty = t.quantityChange || t.quantity || 0;
        return filter === 'in' ? qty > 0 : qty < 0;
      });
    }
    if (dateRange !== 'all') {
      const now = Date.now();
      const cutoffs = { '30d': 30 * 86400000, '90d': 90 * 86400000, '1y': 365 * 86400000 };
      const cutoff = now - cutoffs[dateRange];
      result = result.filter(t => new Date(t.date || t.createdAt || '').getTime() >= cutoff);
    }
    return result;
  }, [transactions, filter, dateRange]);

  const inboundCount = filtered.filter(t => (t.quantityChange || t.quantity || 0) > 0).length;
  const outboundCount = filtered.length - inboundCount;

  if (transactions.length === 0) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '64px 0', color: inkSoft }}>
        <ArrowDown size={48} style={{ marginBottom: 16, opacity: 0.5 }} />
        <p style={{ fontSize: 14, fontWeight: 600 }}>No Transactions</p>
        <p style={{ fontSize: 12, marginTop: 4 }}>No inventory movements recorded for this item.</p>
      </div>
    );
  }

  const segStyle = (active: boolean): React.CSSProperties => ({
    padding: '6px 12px',
    fontSize: active ? 12 : 12,
    fontWeight: 600,
    borderRadius: 6,
    transition: 'all .15s',
    border: 'none',
    cursor: 'pointer',
    background: active ? paper : 'transparent',
    color: active ? t[500] : inkSoft,
    boxShadow: active ? '0 1px 2px rgba(0,0,0,0.05)' : 'none',
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ display: 'flex', background: t[100], borderRadius: 9, padding: 2 }}>
          {(['all', 'in', 'out'] as TxType[]).map(t2 => (
            <button key={t2} onClick={() => setFilter(t2)} className="prime-btn-secondary" style={segStyle(filter === t2)}>
              {t2 === 'all' ? 'All' : t2 === 'in' ? 'Inbound' : 'Outbound'}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', background: t[100], borderRadius: 9, padding: 2 }}>
          {(['all', '30d', '90d', '1y'] as const).map(d => (
            <button key={d} onClick={() => setDateRange(d)} className="prime-btn-secondary" style={segStyle(dateRange === d)}>
              {d === 'all' ? 'All' : d}
            </button>
          ))}
        </div>
        <span style={{ fontSize: 12, color: inkSoft, marginLeft: 'auto' }}>
          {filtered.length} of {transactions.length} transactions
        </span>
      </div>

      {filter !== 'all' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <div style={{ background: t[50], border: `1.4px solid ${t[100]}`, borderRadius: 12, padding: 12, display: 'flex', alignItems: 'center', gap: 12 }}>
            <TrendingDown size={20} style={{ color: t[500] }} />
            <div>
              <span style={{ fontSize: 10, fontWeight: 600, color: t[500], textTransform: 'uppercase', letterSpacing: 0.5 }}>Inbound</span>
              <p style={{ fontSize: 18, fontWeight: 700, color: t[600] }}>{inboundCount}</p>
            </div>
          </div>
          <div style={{ background: '#fef2f2', border: '1.4px solid #fecaca', borderRadius: 12, padding: 12, display: 'flex', alignItems: 'center', gap: 12 }}>
            <TrendingUp size={20} style={{ color: danger }} />
            <div>
              <span style={{ fontSize: 10, fontWeight: 600, color: danger, textTransform: 'uppercase', letterSpacing: 0.5 }}>Outbound</span>
              <p style={{ fontSize: 18, fontWeight: 700, color: danger }}>{outboundCount}</p>
            </div>
          </div>
        </div>
      )}

      <div className="prime-card" style={{ background: paper, borderRadius: 12, border: `1.4px solid ${hairline}`, overflow: 'hidden', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', fontSize: 14 }}>
            <thead>
              <tr style={{ background: t[50], borderBottom: `1.4px solid ${hairline}` }}>
                {['Date', 'Type', 'Reference', 'Warehouse', 'Qty In', 'Qty Out', 'Balance', 'Cost'].map(h => (
                  <th key={h} className="prime-table-header" style={{
                    padding: '12px 16px',
                    fontSize: 10,
                    fontWeight: 600,
                    color: inkSoft,
                    textTransform: 'uppercase',
                    letterSpacing: 0.5,
                    textAlign: h === 'Qty In' || h === 'Qty Out' || h === 'Balance' || h === 'Cost' ? 'right' : 'left'
                  }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody style={{}}>
              {filtered.map((t2: any, i: number) => {
                const qty = t2.quantityChange || t2.quantity || 0;
                const isIn = qty > 0;
                const balance = t2.balanceAfter || t2.runningBalance || 0;
                return (
                  <tr key={t2.id || i} className="prime-table-cell"
                    style={{ borderTop: `1.4px solid ${hairline}`, transition: 'all .15s' }}
                    onMouseEnter={e => e.currentTarget.style.background = t[50]}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                  >
                    <td style={{ padding: '12px 16px', fontSize: 12, color: inkSoft }}>{new Date(t2.date || t2.createdAt || '').toLocaleDateString()}</td>
                    <td style={{ padding: '12px 16px' }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, fontWeight: 600, color: isIn ? t[500] : danger }}>
                        {isIn ? <ArrowDown size={12} /> : <ArrowUp size={12} />}
                        {t2.type || (isIn ? 'Receipt' : 'Issue')}
                      </span>
                    </td>
                    <td style={{ padding: '12px 16px', fontSize: 12, fontFamily: 'monospace', color: inkSoft }}>{t2.reference || t2.id?.slice(0, 8) || '—'}</td>
                    <td style={{ padding: '12px 16px', fontSize: 12, color: inkSoft }}>{t2.warehouseId || '—'}</td>
                    <td style={{ padding: '12px 16px', textAlign: 'right', fontFamily: 'monospace', fontVariantNumeric: 'tabular-nums', color: t[500], fontWeight: 500 }}>{isIn ? Math.abs(qty) : '—'}</td>
                    <td style={{ padding: '12px 16px', textAlign: 'right', fontFamily: 'monospace', fontVariantNumeric: 'tabular-nums', color: danger, fontWeight: 500 }}>{!isIn ? Math.abs(qty) : '—'}</td>
                    <td style={{ padding: '12px 16px', textAlign: 'right', fontFamily: 'monospace', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{balance}</td>
                    <td style={{ padding: '12px 16px', textAlign: 'right', fontFamily: "'Inter', sans-serif", fontVariantNumeric: 'tabular-nums', fontWeight: 600, color: '#111827' }}>{t2.unitCost || t2.cost || '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};