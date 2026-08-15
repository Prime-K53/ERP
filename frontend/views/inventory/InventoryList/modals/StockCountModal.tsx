import React, { useState, useMemo, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../../../../components/Dialog';
import { ClipboardCheck, Search, CheckCircle, AlertCircle, Loader2, ArrowUpDown } from 'lucide-react';
import type { Item } from '../../../../types';
import { useInventory } from '../../../../context/InventoryContext';
import { useAuth } from '../../../../context/AuthContext';

interface CountRow { itemId: string; name: string; sku: string; systemStock: number; countedStock: number; variance: number; }

interface Props { open: boolean; items: Item[]; onClose: () => void; }

export const StockCountModal: React.FC<Props> = ({ open, items, onClose }) => {
  const { updateStock, warehouses } = useInventory();
  const { notify } = useAuth();
  const [searchTerm, setSearchTerm] = useState('');
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [selectedWarehouse, setSelectedWarehouse] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [completed, setCompleted] = useState(false);

  React.useEffect(() => {
    if (open) { setCounts({}); setSearchTerm(''); setSubmitting(false); setCompleted(false); if (warehouses.length > 0) setSelectedWarehouse(warehouses[0]?.id || ''); }
  }, [open, warehouses]);

  const countRows: CountRow[] = useMemo(() => {
    const filtered = items.filter(i => { if (!searchTerm) return true; const q = searchTerm.toLowerCase(); return i.name.toLowerCase().includes(q) || (i.sku || '').toLowerCase().includes(q); });
    return filtered.map(i => { const counted = counts[i.id] ?? i.stock ?? 0; const systemStock = i.stock ?? 0; return { itemId: i.id, name: i.name, sku: i.sku || '', systemStock, countedStock: counted, variance: counted - systemStock }; });
  }, [items, counts, searchTerm]);

  const itemsWithVariance = useMemo(() => countRows.filter(r => r.variance !== 0), [countRows]);
  const totalCounted = useMemo(() => countRows.reduce((s, r) => s + r.countedStock, 0), [countRows]);
  const totalSystem = useMemo(() => countRows.reduce((s, r) => s + r.systemStock, 0), [countRows]);
  const totalVariance = useMemo(() => countRows.reduce((s, r) => s + r.variance, 0), [countRows]);

  const handleStockChange = useCallback((id: string, val: number) => { setCounts(prev => ({ ...prev, [id]: Math.max(0, val) })); }, []);
  const acceptSystem = useCallback((id: string) => { const item = items.find(i => i.id === id); if (item) handleStockChange(id, item.stock ?? 0); }, [items, handleStockChange]);

  const handleSubmit = async () => {
    if (!warehouses.length) return;
    setSubmitting(true);
    try {
      const adjustments = countRows.filter(r => r.variance !== 0);
      for (const row of adjustments) await updateStock(row.itemId, row.variance, selectedWarehouse, `Stock count adjustment (system: ${row.systemStock}, counted: ${row.countedStock})`, true);
      notify?.('Stock count completed', 'success');
      setCompleted(true);
    } catch { notify?.('Count failed', 'error'); } finally { setSubmitting(false); }
  };

  if (!open) return null;

  return (
    <Dialog open={open} onClose={onClose} title="Stock Count">
      {completed ? (
        <div className="flex flex-col items-center justify-center py-8">
          <div className="inline-flex p-4 rounded-full mb-4 bg-[#DCF0EA]" style={{ color: '#128C72' }}><CheckCircle size={48} /></div>
          <p className="text-lg font-bold" style={{ color: '#16201B' }}>Stock Count Complete</p>
          <p className="text-sm mt-1" style={{ color: '#6C766F' }}>{itemsWithVariance.length} item{itemsWithVariance.length !== 1 ? 's' : ''} adjusted</p>
          <p className="text-xs mt-0.5" style={{ color: '#9CA59E' }}>Total variance: {totalVariance > 0 ? '+' : ''}{totalVariance} units</p>
          <button onClick={onClose} className="mt-6 px-6 py-2.5 rounded-[7px] font-semibold text-sm transition-all cursor-pointer bg-[#128C72] text-white hover:bg-[#0E5C4C]">Close</button>
        </div>
      ) : (
        <>
          <div className="flex items-center gap-3 mb-4 pb-3 border-b border-[#E5E8E1]">
            <div className="relative flex-1 max-w-xs">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: '#9CA59E' }} />
              <input value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-4 py-2 border border-[#E5E8E1] rounded-[7px] text-sm outline-none bg-white focus:border-[#128C72]" placeholder="Filter items..." />
            </div>
            <select value={selectedWarehouse} onChange={e => setSelectedWarehouse(e.target.value)}
              className="px-3 py-2 border border-[#E5E8E1] rounded-[7px] text-sm bg-white outline-none" style={{ color: '#16201B' }}>
              {warehouses.map(wh => <option key={wh.id} value={wh.id}>{wh.name}</option>)}
            </select>
            <div className="ml-auto flex items-center gap-4 text-xs" style={{ color: '#6C766F' }}>
              <span>System: <strong style={{ color: '#16201B' }}>{totalSystem}</strong></span>
              <span>Counted: <strong style={{ color: '#16201B' }}>{totalCounted}</strong></span>
              <span style={{ color: totalVariance === 0 ? '#128C72' : '#B9791C' }}>
                Variance: <strong>{totalVariance > 0 ? '+' : ''}{totalVariance}</strong>
              </span>
            </div>
          </div>

          <div className="max-h-72 overflow-y-auto mb-4">
            <table className="w-full text-xs" style={{ borderCollapse: 'collapse' }}>
              <thead>
                <tr className="border-b border-[#E5E8E1] sticky top-0" style={{ background: '#F6F7F2' }}>
                  <th className="text-left p-3 font-medium text-[10.5px] uppercase tracking-[.07em]" style={{ color: '#9CA59E' }}>Item</th>
                  <th className="text-center p-3 font-medium text-[10.5px] uppercase tracking-[.07em]" style={{ color: '#9CA59E' }}>System</th>
                  <th className="text-center p-3 font-medium text-[10.5px] uppercase tracking-[.07em]" style={{ color: '#9CA59E' }}>Counted</th>
                  <th className="text-center p-3 font-medium text-[10.5px] uppercase tracking-[.07em]" style={{ color: '#9CA59E' }}>Variance</th>
                  <th className="text-center p-3 w-20"></th>
                </tr>
              </thead>
              <tbody>
                {countRows.map((row, idx) => (
                  <tr key={`${row.itemId}-${idx}`} className="border-b border-[#EFF1EB]" style={row.variance !== 0 ? { background: '#FBEFDA' } : {}}>
                    <td className="p-3">
                      <div className="font-semibold" style={{ color: '#16201B' }}>{row.name}</div>
                      <div className="text-[10px] font-mono" style={{ color: '#9CA59E' }}>{row.sku}</div>
                    </td>
                    <td className="p-3 text-center font-bold font-mono tabular-nums" style={{ color: '#16201B' }}>{row.systemStock}</td>
                    <td className="p-3 text-center">
                      <input type="number" min={0} value={row.countedStock} onChange={e => handleStockChange(row.itemId, parseInt(e.target.value) || 0)}
                        className="w-20 text-center px-2 py-1.5 border border-[#E5E8E1] rounded-[7px] text-sm font-semibold font-mono tabular-nums outline-none focus:border-[#128C72]" />
                    </td>
                    <td className={`p-3 text-center font-bold font-mono tabular-nums ${row.variance === 0 ? '' : row.variance > 0 ? 'text-[#128C72]' : 'text-[#BE4339]'}`}>
                      {row.variance > 0 ? '+' : ''}{row.variance}
                    </td>
                    <td className="p-3 text-center">
                      <button onClick={() => acceptSystem(row.itemId)}
                        className="text-[10px] font-medium flex items-center gap-1 mx-auto transition-all cursor-pointer" style={{ color: '#128C72' }}>
                        <ArrowUpDown size={11} /> Use system
                      </button>
                    </td>
                  </tr>
                ))}
                {countRows.length === 0 && <tr><td colSpan={5} className="p-12 text-center text-sm" style={{ color: '#9CA59E' }}>No matching items</td></tr>}
              </tbody>
            </table>
          </div>

          <DialogFooter>
            <span className="text-xs mr-auto" style={{ color: '#9CA59E' }}>{itemsWithVariance.length} item{itemsWithVariance.length !== 1 ? 's' : ''} with variance</span>
            <button onClick={onClose} className="px-4 py-2.5 border border-[#E5E8E1] rounded-[7px] text-sm font-medium transition-all cursor-pointer bg-white" style={{ color: '#3B453F' }}>Cancel</button>
            <button onClick={handleSubmit} disabled={submitting || itemsWithVariance.length === 0}
              className="px-6 py-2.5 rounded-[7px] text-sm font-bold flex items-center gap-2 transition-all cursor-pointer disabled:opacity-50 bg-[#128C72] text-white hover:bg-[#0E5C4C]">
              {submitting ? <Loader2 size={16} className="animate-spin" /> : <ClipboardCheck size={16} />} Complete Count ({itemsWithVariance.length} adj.)
            </button>
          </DialogFooter>
        </>
      )}
    </Dialog>
  );
};
