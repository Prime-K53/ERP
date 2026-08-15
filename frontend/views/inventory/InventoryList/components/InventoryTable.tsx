import React, { useState, useRef, useEffect } from 'react';
import { MoreHorizontal, Copy, Archive, Trash2, Barcode, QrCode, Package, Edit3, TrendingUp, Layers, Box, Tag, Globe } from 'lucide-react';
import type { Item } from '../../../../types';
import { RowIndicators } from './RowIndicators';
import { resolveMinimumMarkup } from '../../../../services/pricingValidationService';
import { getFloatingMenuStyle } from '../../../../utils/actionMenu';

const TYPE_ICONS: Record<string, React.ReactNode> = {
  'Raw Material': <Layers size={16} />,
  'Material': <Box size={16} />,
  'Product': <Package size={16} />,
  'Stationery': <Tag size={16} />,
  'Service': <Globe size={16} />,
};

interface Props {
  items: Item[];
  paginatedItems: Item[];
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
  onToggleSelectAll: () => void;
  sortKey: string;
  sortDir: string;
  onSort: (key: string) => void;
  onView: (item: Item) => void;
  onEdit: (item: Item) => void;
  onDuplicate: (item: Item) => void;
  onArchive: (item: Item) => void;
  onDelete: (item: Item) => void;
  onPrintBarcode: (item: Item) => void;
  onPrintQR: (item: Item) => void;
  onAdjustStock: (item: Item) => void;
  onTransferStock: (item: Item) => void;
  columns: string[];
}

export const InventoryTable: React.FC<Props> = (p) => (
  <div className="ref-inv-panel" style={{ padding: 0 }}>
    <div className="overflow-x-auto custom-scrollbar">
      <table className="ref-inv-table">
        <thead>
          <tr>
            <th className="w-10 px-1 text-center">
              <input type="checkbox" onChange={p.onToggleSelectAll}
                checked={p.selectedIds.size === p.paginatedItems?.length && p.paginatedItems?.length > 0}
                className="rounded border-slate-300 text-blue-600 focus:ring-blue-500" />
            </th>
            {p.columns.map(col => (
               <th key={col} onClick={() => p.onSort(col)}
                 className="cursor-pointer select-none">
                <span className="inline-flex items-center gap-1">
                  {col}
                  {p.sortKey === col && <span className="text-[10px] opacity-60">{p.sortDir === 'asc' ? '↑' : '↓'}</span>}
                </span>
              </th>
            ))}
            <th className="w-16 text-right">Actions</th>
          </tr>
        </thead>
        <tbody>
          {p.items.map((item, idx) => (
            <ActionRow key={`${item.id}-${idx}`} item={item} {...p} />
          ))}
        </tbody>
      </table>
    </div>
  </div>
);

interface ActionRowProps extends Props {
  item: Item;
}

const ActionRow: React.FC<ActionRowProps> = ({ item, ...p }) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuAnchor, setMenuAnchor] = useState<DOMRect | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const actions = [
    { icon: <Edit3 size={14} />, label: 'Edit', onClick: () => { p.onEdit(item); setMenuOpen(false); } },
    { icon: <Copy size={14} />, label: 'Duplicate', onClick: () => { p.onDuplicate(item); setMenuOpen(false); } },
    { icon: <Archive size={14} />, label: 'Archive', onClick: () => { p.onArchive(item); setMenuOpen(false); } },
    { icon: <Trash2 size={14} />, label: 'Delete', onClick: () => { p.onDelete(item); setMenuOpen(false); }, danger: true },
    { icon: <Barcode size={14} />, label: 'Print Barcode', onClick: () => { p.onPrintBarcode(item); setMenuOpen(false); } },
    { icon: <QrCode size={14} />, label: 'Print QR', onClick: () => { p.onPrintQR(item); setMenuOpen(false); } },
    { icon: <Package size={14} />, label: 'Adjust Stock', onClick: () => { p.onAdjustStock(item); setMenuOpen(false); } },
    { icon: <TrendingUp size={14} />, label: 'Transfer Stock', onClick: () => { p.onTransferStock(item); setMenuOpen(false); } },
  ];

  const low = (item.stock || 0) <= (item.reorderPoint || 0) && (item.reorderPoint || 0) > 0;
  return (
    <tr className={`transition-colors cursor-pointer ${low ? 'ref-inv-row-warn' : ''}`} onClick={() => p.onView(item)}>
      <td className="table-body-cell w-10 px-1 text-center" data-label="" onClick={e => e.stopPropagation()}>
        <input type="checkbox" checked={p.selectedIds.has(item.id)} onChange={() => p.onToggleSelect(item.id)}
          className="rounded border-slate-300 text-blue-600 focus:ring-blue-500" />
      </td>
      {p.columns.map(col => (
        <td key={col} className="table-body-cell whitespace-nowrap" data-label={col}>
          {col === 'Name' ? (
            <div className="flex items-center gap-2">
              <span className="text-slate-500 shrink-0">{TYPE_ICONS[item.type || ''] || <Package size={16} />}</span>
              <span className="font-medium text-slate-900">{item.name}</span>
              <RowIndicators item={item} />
            </div>
          ) : renderCell(item, col)}
        </td>
      ))}
      <td className="table-body-cell w-16 text-right" data-label="Actions" onClick={e => e.stopPropagation()}>
        <div className="relative inline-flex" ref={menuRef}>
          <button onClick={(e) => { setMenuAnchor(e.currentTarget.getBoundingClientRect()); setMenuOpen(v => !v); }}
            className="p-1.5 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-all">
            <MoreHorizontal size={16} />
          </button>
          {menuOpen && (
            <div
              style={{ ...getFloatingMenuStyle(menuAnchor, { minWidth: 176, estimatedHeight: 340 }) }}
              className="bg-[#FEFDFB] rounded-[14px] shadow-[0_30px_70px_-20px_rgba(0,0,0,.55),0_8px_24px_-8px_rgba(0,0,0,.35),0_0_0_1px_rgba(255,255,255,.04)] border border-[#e4ddd1] py-1">
              {actions.map((a, i) => (
                <button key={i} onClick={a.onClick}
                  className={`w-full flex items-center gap-2.5 px-3.5 py-2 text-sm transition-all ${a.danger ? 'text-red-500 hover:bg-red-50' : 'text-[#23282A] hover:bg-[#eef7f6]'}`}>
                  {a.icon} {a.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </td>
    </tr>
  );
};

function renderCell(item: any, col: string): React.ReactNode {
  switch (col) {
    case 'Name': return <span className="font-medium text-slate-900">{item.name}</span>;
    case 'SKU': return <span className="font-mono text-xs text-slate-500">{item.sku || '—'}</span>;
    case 'Classification': return <span className="inline-flex px-2 py-0.5 rounded-lg text-xs bg-slate-100 text-slate-700">{item.type || '—'}</span>;
    case 'Type': return <span className="inline-flex px-2 py-0.5 rounded-lg text-xs bg-slate-100 text-slate-700">{item.type || '—'}</span>;
    case 'Status': {
      const s = item.status || 'Active';
      const isActive = s === 'Active';
      return (
        <span className="inline-flex items-center gap-1.5 text-xs text-slate-700">
          <span className={`w-2 h-2 rounded-full ${isActive ? 'bg-green-500' : 'bg-slate-300'}`} />
          {s}
        </span>
      );
    }
    case 'Stock': return <span className={`font-mono tabular-nums ${(item.stock || 0) <= 0 ? 'text-red-500' : 'text-slate-900'}`}>{item.stock || 0}</span>;
    case 'Available': return <span className={`font-mono tabular-nums ${(item.stock || 0) - (item.reserved || 0) <= 0 ? 'text-red-500' : 'text-slate-700'}`}>{(item.stock || 0) - (item.reserved || 0)}</span>;
    case 'Reserved': return <span className="font-mono tabular-nums text-amber-600">{item.reserved || 0}</span>;
    case 'Base Unit': return <span className="text-slate-500">{item.unit || 'pcs'}</span>;
    case 'Cost Price': return <span className="tabular-nums" style={{ color: '#111827', fontWeight: 600 }}>{(item.costPrice || item.cost || 0).toFixed(2)}</span>;
    case 'Selling Price': return <span className="tabular-nums" style={{ color: '#111827', fontWeight: 600 }}>{(item.sellingPrice || item.price || 0).toFixed(2)}</span>;
    case 'Markup': {
      const cost = item.costPrice || item.cost || 0;
      const sell = item.sellingPrice || item.price || 0;
      const markup = cost > 0 ? ((sell - cost) / cost) * 100 : 0;
      const isHealthy = markup >= resolveMinimumMarkup(item);
      return <span className={`font-mono tabular-nums ${isHealthy ? 'text-green-600' : 'text-red-500'}`}>{markup.toFixed(1)}%</span>;
    }
    case 'Inventory Value': {
      const val = (item.stock || 0) * (item.costPrice || item.cost || 0);
      return <span className="tabular-nums" style={{ color: '#111827', fontWeight: 600 }}>{val.toFixed(2)}</span>;
    }
    case 'Supplier': return <span className="text-slate-500">{item.preferredSupplierId || '—'}</span>;
    case 'Warehouse': return <span className="text-slate-500">{item.warehouseId || '—'}</span>;
    case 'Category': return <span className="text-slate-500">{item.category || '—'}</span>;
    case 'Brand': return <span className="text-slate-500">{item.brand || '—'}</span>;
    case 'Last Updated': return <span className="text-xs text-slate-400">{item.updatedAt || item.validationTimestamp ? new Date(item.updatedAt || item.validationTimestamp).toLocaleDateString() : '—'}</span>;
    default: return <span className="text-slate-500">—</span>;
  }
}
