import React from 'react';
import { ArrowLeft, ArrowRight, Edit2, Printer, Copy } from 'lucide-react';
import type { Item } from '../../../../types';

interface Props {
  item: Item;
  pricingCalc: { costPrice: number; sellingPrice: number; profit: number; markup: number; minimumMarkup: number } | null;
  stockCalc: { currentStock: number; reserved: number; available: number } | null;
  onBack: () => void;
  onEdit: () => void;
  onDuplicate: () => void;
  onPrev?: () => void;
  onNext?: () => void;
  hasPrev: boolean;
  hasNext: boolean;
}

export const ItemHeader: React.FC<Props> = ({
  item, pricingCalc, stockCalc, onBack, onEdit, onDuplicate, onPrev, onNext, hasPrev, hasNext,
}) => {
  const barcode = item.barcode || item.sku;
  const stockStatus = stockCalc?.currentStock === 0 ? 'out' : stockCalc && stockCalc.currentStock <= (item.minStockLevel || 0) ? 'low' : 'good';
  const totalVal = stockCalc ? stockCalc.currentStock * (pricingCalc?.costPrice || 0) : 0;

  return (
    <div className="pp-panel" style={{ margin: 0, borderRadius: 0, borderLeft: 'none', borderRight: 'none', borderTop: 'none', padding: '16px 24px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={onBack} className="pp-btn pp-btn-ghost" style={{ padding: '6px 8px' }} aria-label="Back to inventory">
            <ArrowLeft size={18} />
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            {hasPrev && onPrev && (
              <button onClick={onPrev} className="pp-btn pp-btn-ghost" style={{ padding: '4px 6px' }} aria-label="Previous item">
                <ArrowLeft size={14} />
              </button>
            )}
            {hasNext && onNext && (
              <button onClick={onNext} className="pp-btn pp-btn-ghost" style={{ padding: '4px 6px' }} aria-label="Next item">
                <ArrowRight size={14} />
              </button>
            )}
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <h1 style={{ fontFamily: "'Fraunces',serif", fontWeight: 600, fontSize: 22, color: 'var(--inv-ink)', margin: 0 }}>{item.name}</h1>
              <span className={`status-badge ${item.status === 'Active' ? 'ok' : 'na'}`}>{item.type}</span>
              <span className={`status-badge ${item.status === 'Active' ? 'ok' : 'na'}`}
                style={item.status !== 'Active' ? { background: 'var(--inv-line-soft)', color: 'var(--inv-muted)' } : {}}>
                {item.status || 'Active'}
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 4, fontSize: 12, color: 'var(--inv-muted)' }}>
              <span style={{ fontFamily: "'IBM Plex Mono',monospace", padding: '2px 6px', background: 'var(--inv-paper)', borderRadius: 4 }}>{item.sku}</span>
              {barcode && <span style={{ fontFamily: "'IBM Plex Mono',monospace" }}>Barcode: {barcode}</span>}
              {item.category && <span>{item.category}</span>}
              <span>Unit: {item.unit || 'pcs'}</span>
            </div>
          </div>
        </div>
        <div className="actions">
          <button onClick={onEdit} className="pp-btn pp-btn-primary" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, padding: '7px 14px' }}>
            <Edit2 size={13} /> Edit
          </button>
          <button onClick={onDuplicate} className="pp-btn pp-btn-ghost" style={{ padding: '6px 8px' }} title="Duplicate">
            <Copy size={15} />
          </button>
          <button className="pp-btn pp-btn-ghost" style={{ padding: '6px 8px' }} title="Print Barcode">
            <Printer size={15} />
          </button>
        </div>
      </div>

      <div className="pp-ticket-grid" style={{ gridTemplateColumns: 'repeat(6, 1fr)', gap: 10, marginBottom: 0 }}>
        <div className="pp-ticket" style={stockStatus === 'out' ? { background: 'var(--inv-press-red-bg)' } : stockStatus === 'low' ? { background: '#FFFBEB' } : {}}>
          <div className="pp-ticket-top">
            <span>Stock</span>
            <span style={{ color: stockStatus === 'out' ? 'var(--inv-press-red)' : stockStatus === 'low' ? 'var(--inv-stamp)' : 'var(--inv-press-green)' }}>{stockCalc?.currentStock ?? '-'}</span>
          </div>
          <div className="pp-ticket-divider" />
          <div className="pp-ticket-figure" style={{ fontSize: 20, color: stockCalc?.currentStock === 0 ? 'var(--inv-press-red)' : 'var(--inv-ink)' }}>{stockCalc?.currentStock ?? '-'}</div>
          <div className="pp-ticket-sub">{stockCalc?.available ?? 0} available</div>
        </div>
        <div className="pp-ticket">
          <div className="pp-ticket-top">
            <span>Reserved</span>
            <span style={{ color: 'var(--inv-stamp-dark)' }}>{stockCalc?.reserved ?? '-'}</span>
          </div>
          <div className="pp-ticket-divider" />
          <div className="pp-ticket-figure" style={{ fontSize: 20, color: 'var(--inv-stamp-dark)' }}>{stockCalc?.reserved ?? '-'}</div>
          <div className="pp-ticket-sub">allocated</div>
        </div>
        <div className="pp-ticket">
          <div className="pp-ticket-top">
            <span>Cost</span>
          </div>
          <div className="pp-ticket-divider" />
          <div className="pp-ticket-figure" style={{ fontSize: 20 }}>{pricingCalc ? pricingCalc.costPrice.toFixed(2) : '-'}</div>
          <div className="pp-ticket-sub">per {item.unit || 'unit'}</div>
        </div>
        <div className="pp-ticket">
          <div className="pp-ticket-top">
            <span>Sell Price</span>
          </div>
          <div className="pp-ticket-divider" />
          <div className="pp-ticket-figure" style={{ fontSize: 20 }}>{pricingCalc ? pricingCalc.sellingPrice.toFixed(2) : '-'}</div>
          <div className="pp-ticket-sub">per {item.unit || 'unit'}</div>
        </div>
        <div className="pp-ticket" style={pricingCalc && pricingCalc.markup < pricingCalc.minimumMarkup ? { background: 'var(--inv-press-red-bg)' } : {}}>
          <div className="pp-ticket-top">
            <span>Markup</span>
          </div>
          <div className="pp-ticket-divider" />
          <div className="pp-ticket-figure" style={{ fontSize: 20, color: pricingCalc && pricingCalc.markup >= pricingCalc.minimumMarkup ? 'var(--inv-press-green)' : pricingCalc ? 'var(--inv-press-red)' : 'var(--inv-ink)' }}>
            {pricingCalc ? `${pricingCalc.markup.toFixed(1)}%` : '-'}
          </div>
          <div className="pp-ticket-sub">{pricingCalc ? `min ${pricingCalc.minimumMarkup}%` : 'no data'}</div>
        </div>
        <div className="pp-ticket">
          <div className="pp-ticket-top">
            <span>Profit</span>
          </div>
          <div className="pp-ticket-divider" />
          <div className="pp-ticket-figure" style={{ fontSize: 20, color: (pricingCalc?.profit || 0) >= 0 ? 'var(--inv-press-green)' : 'var(--inv-press-red)' }}>
            {pricingCalc ? pricingCalc.profit.toFixed(2) : '-'}
          </div>
          <div className="pp-ticket-sub">per {item.unit || 'unit'}</div>
        </div>
      </div>
    </div>
  );
};
