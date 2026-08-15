import React, { useState } from 'react';
import { Filter, X, RotateCcw, Save, Trash2, SlidersHorizontal, Search, Calendar } from 'lucide-react';
import type { FilterState, SavedPreset } from '../hooks/useInventoryList';

interface Props {
  filters: FilterState;
  onSetFilter: <K extends keyof FilterState>(key: K, value: FilterState[K]) => void;
  onReset: () => void;
  presets: SavedPreset[];
  onSavePreset: (name: string) => void;
  onLoadPreset: (name: string) => void;
  onDeletePreset: (name: string) => void;
  categories: string[];
  brands: string[];
  warehouses: string[];
}

const CLASSIFICATIONS = ['Raw Material', 'Product', 'Stationery', 'Service'];
const INVENTORY_ROLES = ['raw_material', 'product', 'stationery'];
const STATUSES = ['Active', 'Inactive', 'Pending'];
const STOCK_STATUSES = ['in_stock', 'low_stock', 'out_of_stock', 'overstocked'];
const TRACKING_OPTS = [
  { value: 'lot', label: 'Lot Tracking' },
  { value: 'serial', label: 'Serial Tracking' },
  { value: 'expiration', label: 'Expiration Tracking' },
];

const chipClass = (active: boolean) =>
  `inline-flex items-center px-2.5 py-1 rounded-lg border text-xs mr-1.5 mb-1.5 cursor-pointer transition-all ${
    active ? 'bg-blue-600 text-white border-blue-600 shadow-sm' : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
  }`;

const FieldLabel: React.FC<{ label: string }> = ({ label }) => (
  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-tight mb-1.5">{label}</div>
);

export const FilterPanel: React.FC<Props> = (p) => {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<'filters' | 'presets'>('filters');
  const [presetName, setPresetName] = useState('');

  const activeCount = Object.entries(p.filters).filter(([k, v]) => {
    if (k === 'hasRecipe' || k === 'hasVariants' || k === 'hasAttachments') return v !== null;
    if (Array.isArray(v)) return v.length > 0;
    return !!v;
  }).length;

  const toggleArray = (key: 'classification' | 'inventoryRole' | 'rawMaterialCategory' | 'status' | 'warehouse' | 'supplier' | 'category' | 'brand' | 'stockStatus' | 'tracking', value: string) => {
    const current: string[] = Array.isArray(p.filters[key]) ? p.filters[key] as string[] : [];
    const next = current.includes(value) ? current.filter(v => v !== value) : [...current, value];
    p.onSetFilter(key, next as FilterState[typeof key]);
  };

  const toggleNull = (key: 'hasRecipe' | 'hasVariants' | 'hasAttachments') => {
    p.onSetFilter(key, p.filters[key] === true ? null : true as FilterState[typeof key]);
  };

  return (
    <div className="relative">
      <div className="flex items-center gap-2">
        <button onClick={() => setOpen(!open)}
          className="inline-flex items-center gap-1.5 bg-white text-slate-700 px-3 py-2 rounded-xl text-sm font-medium border border-slate-200 hover:bg-slate-50 transition-colors shadow-sm">
          <SlidersHorizontal size={14} /> 
          <span>Filters</span>
          {activeCount > 0 && (
            <span className="bg-blue-600 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center leading-none">{activeCount}</span>
          )}
        </button>
        {activeCount > 0 && (
          <button onClick={p.onReset} className="p-2 text-slate-400 hover:text-red-500 rounded-lg hover:bg-red-50 transition-all" title="Reset filters">
            <RotateCcw size={14} />
          </button>
        )}
      </div>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute top-full left-0 mt-2 bg-white/70 backdrop-blur-xl border border-white/60 rounded-2xl z-50 p-4 min-w-[280px] shadow-lg max-h-[70vh] overflow-y-auto">
            {/* Tabs */}
            <div className="flex gap-1 mb-3 pb-2 border-b border-slate-100">
              <button onClick={() => setTab('filters')} className={`text-xs font-semibold px-2.5 py-1 rounded-lg transition-all ${tab === 'filters' ? 'bg-blue-600 text-white' : 'text-slate-500 hover:bg-slate-100'}`}>
                <SlidersHorizontal size={12} className="inline mr-1" />Filters
              </button>
              <button onClick={() => setTab('presets')} className={`text-xs font-semibold px-2.5 py-1 rounded-lg transition-all ${tab === 'presets' ? 'bg-blue-600 text-white' : 'text-slate-500 hover:bg-slate-100'}`}>
                <Save size={12} className="inline mr-1" />Presets
              </button>
            </div>

            {tab === 'filters' && (
              <div className="space-y-3">
                {/* Classification */}
                <div>
                  <FieldLabel label="Classification" />
                  <div className="flex flex-wrap">
                    {CLASSIFICATIONS.map(c => (
                      <span key={c} onClick={() => toggleArray('classification', c)}
                        className={chipClass(p.filters.classification.includes(c))}>{c}</span>
                    ))}
                  </div>
                </div>

                {/* Status */}
                <div>
                  <FieldLabel label="Status" />
                  <div className="flex flex-wrap">
                    {STATUSES.map(s => (
                      <span key={s} onClick={() => toggleArray('status', s)}
                        className={chipClass(p.filters.status.includes(s))}>{s}</span>
                    ))}
                  </div>
                </div>

                {/* Stock Status */}
                <div>
                  <FieldLabel label="Stock Level" />
                  <div className="flex flex-wrap">
                    {STOCK_STATUSES.map(s => (
                      <span key={s} onClick={() => toggleArray('stockStatus', s)}
                        className={chipClass(p.filters.stockStatus.includes(s))}>
                        {s === 'in_stock' ? 'In Stock' : s === 'low_stock' ? 'Low Stock' : s === 'out_of_stock' ? 'Out of Stock' : 'Overstocked'}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Warehouse */}
                {p.warehouses.length > 0 && (
                  <div>
                    <FieldLabel label="Warehouse" />
                    <div className="flex flex-wrap">
                      {p.warehouses.map(w => (
                        <span key={w} onClick={() => toggleArray('warehouse', w)}
                          className={chipClass(p.filters.warehouse.includes(w))}>{w}</span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Category */}
                {p.categories.length > 0 && (
                  <div>
                    <FieldLabel label="Category" />
                    <div className="flex flex-wrap">
                      {p.categories.map(c => (
                        <span key={c} onClick={() => toggleArray('category', c)}
                          className={chipClass(p.filters.category.includes(c))}>{c}</span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Brand */}
                {p.brands.length > 0 && (
                  <div>
                    <FieldLabel label="Brand" />
                    <div className="flex flex-wrap">
                      {p.brands.map(b => (
                        <span key={b} onClick={() => toggleArray('brand', b)}
                          className={chipClass(p.filters.brand.includes(b))}>{b}</span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Tracking */}
                <div>
                  <FieldLabel label="Tracking" />
                  <div className="flex flex-wrap">
                    {TRACKING_OPTS.map(t => (
                      <span key={t.value} onClick={() => toggleArray('tracking', t.value)}
                        className={chipClass(p.filters.tracking.includes(t.value))}>{t.label}</span>
                    ))}
                  </div>
                </div>

                {/* Raw Material Category */}
                <div>
                  <FieldLabel label="Raw Material Type" />
                  <div className="flex flex-wrap">
                    {['consumable', 'non_consumable'].map(c => (
                      <span key={c} onClick={() => toggleArray('rawMaterialCategory', c)}
                        className={chipClass(p.filters.rawMaterialCategory.includes(c))}>
                        {c === 'consumable' ? 'Consumable' : 'Non-Consumable'}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Boolean toggles */}
                <div className="flex flex-wrap gap-1.5">
                  {[
                    { key: 'hasVariants' as const, label: 'Has Variants' },
                    { key: 'hasRecipe' as const, label: 'Has Recipe / BOM' },
                    { key: 'hasAttachments' as const, label: 'Has Attachments' },
                  ].map(item => (
                    <span key={item.key} onClick={() => toggleNull(item.key)}
                      className={chipClass(p.filters[item.key] === true)}>{item.label}</span>
                  ))}
                </div>

                {/* Dates */}
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <FieldLabel label="Created From" />
                    <input type="date" value={p.filters.dateCreatedFrom} onChange={e => p.onSetFilter('dateCreatedFrom', e.target.value)}
                      className="w-full px-2 py-1.5 text-xs border border-slate-200 rounded-lg bg-white focus:ring-2 focus:ring-blue-100 focus:border-blue-300 outline-none" />
                  </div>
                  <div>
                    <FieldLabel label="Created To" />
                    <input type="date" value={p.filters.dateCreatedTo} onChange={e => p.onSetFilter('dateCreatedTo', e.target.value)}
                      className="w-full px-2 py-1.5 text-xs border border-slate-200 rounded-lg bg-white focus:ring-2 focus:ring-blue-100 focus:border-blue-300 outline-none" />
                  </div>
                </div>
              </div>
            )}

            {tab === 'presets' && (
              <div>
                <div className="flex gap-2 mb-3">
                  <input value={presetName} onChange={e => setPresetName(e.target.value)} placeholder="Preset name..."
                    className="flex-1 px-2.5 py-1.5 text-xs border border-slate-200 rounded-xl bg-white focus:ring-2 focus:ring-blue-100 focus:border-blue-300 outline-none" />
                  <button onClick={() => { if (presetName.trim()) { p.onSavePreset(presetName.trim()); setPresetName(''); } }}
                    className="px-2.5 py-1.5 text-xs font-semibold bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors">
                    Save
                  </button>
                </div>
                {p.presets.length === 0 ? (
                  <div className="text-xs text-slate-400 text-center py-4">No saved filter presets</div>
                ) : (
                  p.presets.map(pr => (
                    <div key={pr.name} className="flex items-center justify-between py-1.5 px-2 rounded-lg hover:bg-slate-50 cursor-pointer"
                      onClick={() => { p.onLoadPreset(pr.name); setOpen(false); }}>
                      <span className="text-xs font-medium text-slate-700">{pr.name}</span>
                      <button onClick={e => { e.stopPropagation(); p.onDeletePreset(pr.name); }}
                        className="p-1 text-slate-300 hover:text-red-500 rounded transition-colors">
                        <Trash2 size={12} />
                      </button>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};
