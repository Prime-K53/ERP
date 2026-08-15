import React from 'react';
import { Package, Layers, Box, Tag, Globe } from 'lucide-react';
import type { Item } from '../../../../types';
import { StockBadge, RowIndicators } from './RowIndicators';

const TYPE_ICONS: Record<string, React.ReactNode> = {
  'Raw Material': <Layers size={16} />,
  'Material': <Box size={16} />,
  'Product': <Package size={16} />,
  'Stationery': <Tag size={16} />,
  'Service': <Globe size={16} />,
};

interface Props {
  items: Item[];
  onView: (item: Item) => void;
  onEdit: (item: Item) => void;
}

export const CompactView: React.FC<Props> = ({ items, onView, onEdit }) => (
  <div className="bg-white border border-[#E2E8F0] rounded-2xl overflow-hidden divide-y divide-[#F1F5F9] shadow-sm">
    {items.map((item, idx) => (
      <div key={`${item.id}-${idx}`} onClick={() => onView(item)}
        className="flex items-center gap-4 px-4 py-[7px] cursor-pointer transition-colors hover:bg-blue-50/50">
        <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: '#F8FAFC', color: '#94A3B8' }}>
          {TYPE_ICONS[item.type || ''] || <Package size={16} />}
        </div>
        <div className="flex-1 min-w-0 flex items-center gap-3">
          <span className="text-[12.5px] font-medium truncate" style={{ color: '#0F172A' }}>{item.name}</span>
          <span className="font-mono text-[12.5px] shrink-0" style={{ color: '#64748B' }}>{item.sku}</span>
          <span className="inline-flex px-[9px] py-[3px] rounded-[99px] text-[12px] shrink-0" style={{ background: '#F8FAFC', color: '#475569' }}>{item.type}</span>
          {(item.type === 'Raw Material' || item.type === 'Material') && (
            <>
              <span className={`inline-flex px-[9px] py-[3px] rounded-[99px] text-[12px] shrink-0 ${(item as any).rawMaterialCategory === 'non_consumable' ? 'bg-orange-50 text-orange-600' : 'bg-emerald-50 text-emerald-600'}`}>
                {(item as any).rawMaterialCategory === 'non_consumable' ? 'Non-Consumable' : 'Consumable'}
              </span>
              {(item as any).rawBomCategory ? (
                <span className={`inline-flex px-[9px] py-[3px] rounded-[99px] text-[12px] shrink-0 ${
                  (item as any).rawBomCategory === 'Paper' ? 'bg-blue-50 text-blue-700' :
                  (item as any).rawBomCategory === 'Toner' ? 'bg-red-50 text-red-700' :
                  (item as any).rawBomCategory === 'Cover/Card' ? 'bg-violet-50 text-violet-700' :
                  (item as any).rawBomCategory === 'Staple' ? 'bg-green-50 text-green-700' :
                  (item as any).rawBomCategory === 'Binding Tape' ? 'bg-orange-50 text-orange-700' :
                  'bg-slate-50 text-slate-600'
                }`}>
                  {(item as any).rawBomCategory}
                </span>
              ) : null}
            </>
          )}
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <RowIndicators item={item} />
          <StockBadge item={item} />
          <span className="text-[12.5px] tabular-nums" style={{ color: '#111827', fontWeight: 600 }}>{(item.costPrice || item.cost || 0).toFixed(2)}</span>
          <span className="text-[12.5px] font-medium tabular-nums" style={{ color: '#111827' }}>{(item.sellingPrice || item.price || 0).toFixed(2)}</span>
        </div>
        <button onClick={e => { e.stopPropagation(); onEdit(item); }}
          className="px-3 py-1 text-xs font-medium rounded-xl border border-[#E2E8F0] bg-white text-[#475569] hover:bg-blue-50/50 transition-all shadow-sm shrink-0">
          Edit
        </button>
      </div>
    ))}
  </div>
);
