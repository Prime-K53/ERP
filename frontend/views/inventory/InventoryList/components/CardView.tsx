import React from 'react';
import { Package, Edit2, Eye, Layers, Box, Tag, Globe } from 'lucide-react';
import type { Item } from '../../../../types';
import { StockBadge, RowIndicators } from './RowIndicators';

const TYPE_ICONS: Record<string, React.ReactNode> = {
  'Raw Material': <Layers size={18} />,
  'Material': <Box size={18} />,
  'Product': <Package size={18} />,
  'Stationery': <Tag size={18} />,
  'Service': <Globe size={18} />,
};

interface Props {
  items: Item[];
  onView: (item: Item) => void;
  onEdit: (item: Item) => void;
}

export const CardView: React.FC<Props> = ({ items, onView, onEdit }) => (
  <div className="card-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(232px, 1fr))', gap: '13px' }}>
    {items.map((item, idx) => (
      <div key={`${item.id}-${idx}`} onClick={() => onView(item)}
        className="bg-white/70 backdrop-blur-xl border border-white/60 rounded-2xl p-4 cursor-pointer transition-all hover:shadow-md shadow-sm"
        style={{ boxShadow: '0 1px 2px rgba(15,23,42,.04), 0 6px 18px rgba(15,23,42,.05)' }}>
        <div className="flex items-start justify-between mb-[10px]">
          <div className="flex items-center gap-2">
            <span className="text-slate-500 shrink-0">{TYPE_ICONS[item.type || ''] || <Package size={18} />}</span>
            <span className="font-medium text-[14px]" style={{ color: '#0F172A' }}>{item.name}</span>
            <RowIndicators item={item} />
          </div>
          <StockBadge item={item} />
        </div>
        <span className="font-mono text-[12px] block mt-[2px]" style={{ color: '#64748B' }}>{item.sku || '—'}</span>
        <span className="inline-flex px-[9px] py-[3px] rounded-[99px] text-[12px] mt-2" style={{ background: '#F8FAFC', color: '#475569' }}>{item.type || '—'}</span>
        {(item.type === 'Raw Material' || item.type === 'Material') && (
          <span className={`inline-flex px-[9px] py-[3px] rounded-[99px] text-[12px] mt-2 ml-1.5 ${(item as any).rawMaterialCategory === 'non_consumable' ? 'bg-orange-50 text-orange-600' : 'bg-emerald-50 text-emerald-600'}`}>
            {(item as any).rawMaterialCategory === 'non_consumable' ? 'Non-Consumable' : 'Consumable'}
          </span>
        )}
        <div className="grid2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginTop: '12px', fontSize: '12.5px' }}>
          <div><span className="block text-[10.5px] uppercase tracking-[.05em]" style={{ color: '#94A3B8' }}>Stock</span><span className="font-mono tabular-nums">{item.stock || 0}</span></div>
          <div><span className="block text-[10.5px] uppercase tracking-[.05em]" style={{ color: '#94A3B8' }}>Available</span><span className="font-mono tabular-nums">{(item.stock || 0) - (item.reserved || 0)}</span></div>
          <div><span className="block text-[10.5px] uppercase tracking-[.05em]" style={{ color: '#94A3B8' }}>Cost</span><span className="tabular-nums" style={{ fontWeight: 600, color: '#111827' }}>{(item.costPrice || item.cost || 0).toFixed(2)}</span></div>
          <div><span className="block text-[10.5px] uppercase tracking-[.05em]" style={{ color: '#94A3B8' }}>Selling</span><span className="tabular-nums" style={{ fontWeight: 600, color: '#111827' }}>{(item.sellingPrice || item.price || 0).toFixed(2)}</span></div>
        </div>
        <div className="flex gap-2 mt-3 pt-3" style={{ borderTop: '1px solid #F1F5F9' }}>
          <button onClick={e => { e.stopPropagation(); onView(item); }}
            className="flex-1 inline-flex items-center justify-center gap-1 px-3 py-1.5 rounded-xl text-xs font-medium transition-all border border-[#E2E8F0] bg-white text-[#475569] hover:bg-blue-50/50 shadow-sm">
            <Eye size={13} /> View
          </button>
          <button onClick={e => { e.stopPropagation(); onEdit(item); }}
            className="flex items-center justify-center gap-1 px-3 py-1.5 rounded-xl text-xs font-medium transition-all border border-[#E2E8F0] bg-white text-[#475569] hover:bg-blue-50/50 shadow-sm">
            <Edit2 size={13} /> Edit
          </button>
        </div>
      </div>
    ))}
  </div>
);
