import React from 'react';
import type { Item } from '../../../../types';

const I = (item: Item) => item as Item & { trackingMethod?: string; valuationMethod?: string };

interface Props {
  item: Item;
  stockCalc: { currentStock: number; reserved: number; available: number; incoming: number; committed: number; inventoryValue: number } | null;
  pricingCalc: { costPrice: number; sellingPrice: number; profit: number; markup: number; minimumMarkup: number } | null;
  validationScore: number;
}

const INV = {
  ink: 'var(--inv-ink)',
  paper: 'var(--inv-paper)',
  paper2: 'var(--inv-paper-2)',
  line: 'var(--inv-line)',
  text: 'var(--inv-text)',
  muted: 'var(--inv-muted)',
  stamp: 'var(--inv-stamp)',
  stampDark: 'var(--inv-stamp-dark)',
  green: 'var(--inv-press-green)',
  red: 'var(--inv-press-red)',
  redBg: 'var(--inv-press-red-bg)',
  lineSoft: 'var(--inv-line-soft)',
};

export const ItemSidebar: React.FC<Props> = ({ item, stockCalc, pricingCalc, validationScore }) => {
  const completeness = Math.min(100, validationScore);

  const scoreColor = completeness >= 80 ? INV.green : completeness >= 50 ? INV.stampDark : INV.red;
  const scoreBg = completeness >= 80 ? '#E9F1EA' : completeness >= 50 ? INV.paper : INV.redBg;
  const scoreBar = completeness >= 80 ? INV.green : completeness >= 50 ? INV.stamp : INV.red;

  const warnings: { text: string; severity: 'high' | 'medium' | 'low' }[] = [];
  if (!item.sku) warnings.push({ text: 'No SKU assigned', severity: 'medium' });
  if (!item.costPrice && !item.cost) warnings.push({ text: 'No cost price set', severity: 'high' });
  if (!item.sellingPrice && !item.price) warnings.push({ text: 'No selling price set', severity: 'high' });
  if (pricingCalc && pricingCalc.markup < pricingCalc.minimumMarkup) warnings.push({ text: `Markup ${pricingCalc.markup.toFixed(1)}% below min ${pricingCalc.minimumMarkup}%`, severity: 'high' });
  if (stockCalc && stockCalc.currentStock === 0) warnings.push({ text: 'Out of stock', severity: 'high' });
  if (stockCalc && stockCalc.reserved > stockCalc.currentStock) warnings.push({ text: 'Over-reserved', severity: 'high' });
  if (!item.unit) warnings.push({ text: 'No unit set', severity: 'low' });
  if (!item.category) warnings.push({ text: 'No category', severity: 'low' });

  return (
    <div style={{ width: 280, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Completeness */}
      <div className="pp-panel" style={{ padding: 14, background: scoreBg, borderColor: scoreBg }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <span className="pp-subhead" style={{ margin: 0, color: INV.muted }}>Completeness</span>
          <span style={{ fontFamily: "'Fraunces',serif", fontSize: 20, fontWeight: 600, color: scoreColor }}>{completeness}%</span>
        </div>
        <div className="bar-track" style={{ width: '100%', height: 6, background: 'var(--inv-line-soft)' }}>
          <div className="bar-fill" style={{ width: `${completeness}%`, background: scoreBar }} />
        </div>
        {completeness >= 80 && (
          <div className="pp-muted" style={{ marginTop: 6, fontSize: 11, color: INV.green }}>Ready for use</div>
        )}
      </div>

      {/* Stock Summary */}
      {stockCalc && (
        <div className="pp-panel" style={{ padding: 0 }}>
          <div className="pp-panel-head" style={{ padding: '10px 14px', margin: 0, borderBottom: `1px solid ${INV.line}` }}>
            <span className="pp-subhead" style={{ margin: 0 }}>Stock Summary</span>
          </div>
          <div style={{ padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[
              { label: 'Current', value: stockCalc.currentStock, color: INV.text },
              { label: 'Reserved', value: stockCalc.reserved, color: INV.stampDark },
              { label: 'Available', value: stockCalc.available, color: stockCalc.available > 0 ? INV.green : INV.red },
              { label: 'Incoming', value: stockCalc.incoming, color: INV.green },
              { label: 'Committed', value: stockCalc.committed, color: INV.muted },
              { label: 'Inventory Value', value: stockCalc.inventoryValue.toFixed(2), color: INV.text, amount: true },
            ].map(s => (
              <div key={s.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span className="pp-muted" style={{ fontSize: 11.5 }}>{s.label}</span>
                <span style={{ fontFamily: s.amount ? "'Inter', sans-serif" : "'IBM Plex Mono',monospace", fontWeight: 600, fontSize: 12, fontVariantNumeric: s.amount ? 'tabular-nums' : undefined, color: s.amount ? '#111827' : s.color }}>{s.value}</span>
              </div>
            ))}
          </div>
          {stockCalc.currentStock > 0 && (
            <div style={{ padding: '0 14px 12px' }}>
              <div className="bar-track" style={{ width: '100%', height: 5, background: INV.lineSoft }}>
                <div className="bar-fill" style={{ width: `${Math.min(100, (stockCalc.currentStock / (stockCalc.currentStock + stockCalc.reserved + stockCalc.incoming)) * 100)}%`, background: INV.stamp }} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, marginTop: 4, color: INV.muted }}>
                <span>{((stockCalc.available / (stockCalc.currentStock || 1)) * 100).toFixed(0)}% available</span>
                <span>{((stockCalc.reserved / (stockCalc.currentStock || 1)) * 100).toFixed(0)}% reserved</span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Pricing */}
      {pricingCalc && (
        <div className="pp-panel" style={{ padding: 0 }}>
          <div className="pp-panel-head" style={{ padding: '10px 14px', margin: 0, borderBottom: `1px solid ${INV.line}` }}>
            <span className="pp-subhead" style={{ margin: 0 }}>Pricing</span>
          </div>
          <div style={{ padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[
              { label: 'Cost', value: pricingCalc.costPrice.toFixed(2), color: INV.text, amount: true },
              { label: 'Selling', value: pricingCalc.sellingPrice.toFixed(2), color: INV.text, amount: true },
              { label: 'Profit', value: pricingCalc.profit.toFixed(2), color: pricingCalc.profit >= 0 ? INV.green : INV.red },
              { label: 'Markup', value: `${pricingCalc.markup.toFixed(1)}%`, color: pricingCalc.markup >= pricingCalc.minimumMarkup ? INV.green : INV.red },
            ].map(s => (
              <div key={s.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span className="pp-muted" style={{ fontSize: 11.5 }}>{s.label}</span>
                <span style={{ fontFamily: s.amount ? "'Inter', sans-serif" : "'IBM Plex Mono',monospace", fontWeight: 600, fontSize: 12, fontVariantNumeric: s.amount ? 'tabular-nums' : undefined, color: s.amount ? '#111827' : s.color }}>{s.value}</span>
              </div>
            ))}
            <div style={{ paddingTop: 6, borderTop: `1px solid ${INV.line}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span className="pp-muted" style={{ fontSize: 10 }}>Min Markup</span>
              <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 10, color: INV.muted }}>{pricingCalc.minimumMarkup}%</span>
            </div>
          </div>
        </div>
      )}

      {/* Alerts */}
      <div className="pp-panel" style={{ padding: 0 }}>
        <div className="pp-panel-head" style={{ padding: '10px 14px', margin: 0, borderBottom: `1px solid ${INV.line}` }}>
          <span className="pp-subhead" style={{ margin: 0 }}>{warnings.length > 0 ? `Alerts (${warnings.length})` : 'Status'}</span>
        </div>
        {warnings.length > 0 ? (
          <div style={{ padding: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
            {warnings.map((w, i) => {
              const warnStyle: React.CSSProperties = { padding: '6px 8px', borderRadius: 4, fontSize: 11, lineHeight: 1.4 };
              if (w.severity === 'high') { warnStyle.background = INV.redBg; warnStyle.color = INV.red; }
              else if (w.severity === 'medium') { warnStyle.background = INV.paper; warnStyle.color = INV.stampDark; }
              else { warnStyle.color = INV.muted; }
              return <div key={i} style={warnStyle}>{w.text}</div>;
            })}
          </div>
        ) : (
          <div style={{ padding: '12px 14px', fontSize: 12, color: INV.green, fontWeight: 600 }}>All checks passed</div>
        )}
      </div>

      {/* General Info */}
      <div className="pp-panel" style={{ padding: 0 }}>
        <div className="pp-panel-head" style={{ padding: '10px 14px', margin: 0, borderBottom: `1px solid ${INV.line}` }}>
          <span className="pp-subhead" style={{ margin: 0 }}>General Info</span>
        </div>
        <div style={{ padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}><span className="pp-muted">ID</span><span style={{ fontFamily: "'IBM Plex Mono',monospace", color: INV.text }}>{item.id?.slice(0, 16)}</span></div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}><span className="pp-muted">Created</span><span style={{ color: INV.text }}>{item.createdAt ? new Date(item.createdAt).toLocaleDateString() : '—'}</span></div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}><span className="pp-muted">Updated</span><span style={{ color: INV.text }}>{item.updatedAt ? new Date(item.updatedAt).toLocaleDateString() : '—'}</span></div>
          {((I(item)).trackingMethod || I(item).valuationMethod) && (
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span className="pp-muted">Tracking</span>
              <span style={{ color: INV.text }}>{I(item).trackingMethod || I(item).valuationMethod || '—'}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
