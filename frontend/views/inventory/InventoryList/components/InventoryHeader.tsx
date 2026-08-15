import React from 'react';
import { Plus, Printer, ClipboardCheck, PackageSearch, RefreshCw } from 'lucide-react';

interface Props {
  onNewItem: () => void;
  onPrintLabels: () => void;
  onStockAdjust: () => void;
  onStockCount: () => void;
  onRefresh: () => void;
  loading: boolean;
}

export const InventoryHeader: React.FC<Props> = (p) => (
  <div className="flex items-start justify-between gap-4 mb-6 flex-wrap ref-inv-panel" style={{ padding: '16px 20px' }}>
    <div>
      <div className="eyebrow" style={{ marginBottom: 2 }}>Inventory</div>
      <h1 style={{ fontFamily: "'Inter',sans-serif", fontWeight: 600, fontSize: 22, color: '#0F172A', margin: 0, letterSpacing: '-0.01em' }}>Master Inventory</h1>
      <p style={{ fontSize: 13, color: '#64748B', marginTop: 4, fontFamily: "'Inter',sans-serif" }}>Multi-location tracking and master data list</p>
    </div>
    <div className="flex gap-2 flex-wrap ref-inv-actions">
      <button onClick={p.onNewItem}
        className="inline-flex items-center gap-1.5 bg-blue-600 text-white px-4 py-2 rounded-xl font-medium hover:bg-blue-700 text-sm shadow-sm transition-all">
        <Plus size={15} /> New item
      </button>
      <button onClick={p.onPrintLabels}
        className="inline-flex items-center gap-1.5 bg-white text-slate-700 px-3 py-2 rounded-xl text-sm font-medium border border-slate-200 hover:bg-slate-50 transition-all shadow-sm">
        <Printer size={15} /> Labels
      </button>
      <button onClick={p.onStockAdjust}
        className="inline-flex items-center gap-1.5 bg-white text-slate-700 px-3 py-2 rounded-xl text-sm font-medium border border-slate-200 hover:bg-slate-50 transition-all shadow-sm">
        <ClipboardCheck size={15} /> Adjust
      </button>
      <button onClick={p.onStockCount}
        className="inline-flex items-center gap-1.5 bg-white text-slate-700 px-3 py-2 rounded-xl text-sm font-medium border border-slate-200 hover:bg-slate-50 transition-all shadow-sm">
        <PackageSearch size={15} /> Count
      </button>
      <button onClick={p.onRefresh} disabled={p.loading}
        className="inline-flex items-center gap-1.5 bg-white text-slate-700 px-3 py-2 rounded-xl text-sm font-medium border border-slate-200 hover:bg-slate-50 transition-all disabled:opacity-60 shadow-sm">
        <RefreshCw size={15} className={p.loading ? 'animate-spin' : ''} /> Refresh
      </button>
    </div>
  </div>
);
