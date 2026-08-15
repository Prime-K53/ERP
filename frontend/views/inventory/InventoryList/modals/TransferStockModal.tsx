import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../../../../components/Dialog';
import { ArrowRight, Warehouse, AlertCircle, Loader2 } from 'lucide-react';
import type { Item } from '../../../../types';
import { useInventory } from '../../../../context/InventoryContext';

interface Props {
  open: boolean;
  item: Item | null;
  onClose: () => void;
  onSuccess: () => void;
}

export const TransferStockModal: React.FC<Props> = ({ open, item, onClose, onSuccess }) => {
  const { warehouses, transferStock } = useInventory();
  const [fromWarehouse, setFromWarehouse] = useState('');
  const [toWarehouse, setToWarehouse] = useState('');
  const [quantity, setQuantity] = useState<number>(1);
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  React.useEffect(() => {
    if (open && warehouses.length > 0) {
      setFromWarehouse(warehouses[0]?.id || '');
      setToWarehouse(warehouses.length > 1 ? warehouses[1]?.id : warehouses[0]?.id || '');
      setQuantity(1); setReason('');
    }
  }, [open, warehouses]);

  if (!item) return null;

  const currentStock = item.stock || 0;
  const sameWarehouse = fromWarehouse === toWarehouse;
  const exceedsStock = quantity > currentStock;

  const handleSubmit = async () => {
    if (sameWarehouse || quantity <= 0 || exceedsStock) return;
    setSubmitting(true);
    try { await transferStock(item.id, fromWarehouse, toWarehouse, quantity); onSuccess(); onClose(); } catch {} finally { setSubmitting(false); }
  };

  return (
    <Dialog open={open} onClose={onClose} title="Transfer Stock">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-[34px] h-[34px] rounded-[9px] flex items-center justify-center bg-[#FBEFDA]" style={{ color: '#B9791C' }}>
          <ArrowRight size={20} />
        </div>
        <div>
          <p className="text-xs font-medium" style={{ color: '#6C766F' }}>{item.name} ({item.sku})</p>
        </div>
      </div>

      <div className="flex items-center justify-between px-4 py-3 rounded-[10px] border border-[#EFF1EB] mb-4" style={{ background: '#F6F7F2' }}>
        <span className="text-xs font-bold uppercase tracking-wider" style={{ color: '#9CA59E' }}>Current Stock</span>
        <span className="font-bold font-mono text-lg" style={{ color: '#16201B' }}>{currentStock} {item.unit}</span>
      </div>

      {sameWarehouse && <p className="text-xs flex items-center gap-1 font-medium mb-4" style={{ color: '#B9791C' }}><AlertCircle size={12} /> Source and destination must differ</p>}

      <div className="space-y-4">
        <div>
          <label className="block text-xs font-medium mb-1.5" style={{ color: '#6C766F' }}>From Warehouse</label>
          <div className="relative">
            <Warehouse className="absolute left-3 top-1/2 -translate-y-1/2" size={16} style={{ color: '#9CA59E' }} />
            <select value={fromWarehouse} onChange={e => setFromWarehouse(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 border border-[#E5E8E1] rounded-[7px] text-sm appearance-none bg-white outline-none focus:border-[#128C72]" style={{ color: '#16201B' }}>
              {warehouses.map(wh => <option key={wh.id} value={wh.id}>{wh.name}</option>)}
            </select>
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium mb-1.5" style={{ color: '#6C766F' }}>To Warehouse</label>
          <div className="relative">
            <Warehouse className="absolute left-3 top-1/2 -translate-y-1/2" size={16} style={{ color: '#9CA59E' }} />
            <select value={toWarehouse} onChange={e => setToWarehouse(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 border border-[#E5E8E1] rounded-[7px] text-sm appearance-none bg-white outline-none focus:border-[#128C72]" style={{ color: '#16201B' }}>
              {warehouses.map(wh => <option key={wh.id} value={wh.id}>{wh.name}</option>)}
            </select>
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium mb-1.5" style={{ color: '#6C766F' }}>Quantity to Transfer</label>
          <input type="number" min={1} max={currentStock} value={quantity} onChange={e => setQuantity(Number(e.target.value))}
            className="w-full px-4 py-2.5 border border-[#E5E8E1] rounded-[7px] text-lg font-semibold outline-none focus:border-[#128C72]" style={{ color: '#16201B' }} />
          {exceedsStock && <p className="mt-1 text-xs flex items-center gap-1 font-medium" style={{ color: '#BE4339' }}><AlertCircle size={12} /> Exceeds available stock</p>}
        </div>

        <div>
          <label className="block text-xs font-medium mb-1.5" style={{ color: '#6C766F' }}>Reason (Optional)</label>
          <textarea value={reason} onChange={e => setReason(e.target.value)}
            className="w-full px-4 py-2 border border-[#E5E8E1] rounded-[7px] text-sm outline-none focus:border-[#128C72]" rows={2} placeholder="e.g., Warehouse reallocation" />
        </div>
      </div>

      <DialogFooter>
        <button type="button" onClick={onClose}
          className="flex-1 px-4 py-2.5 border border-[#E5E8E1] rounded-[7px] text-sm font-medium transition-all cursor-pointer bg-white" style={{ color: '#3B453F' }}>
          Cancel
        </button>
        <button type="button" onClick={handleSubmit} disabled={submitting || sameWarehouse || quantity <= 0 || exceedsStock}
          className="flex-1 px-4 py-2.5 rounded-[7px] text-sm font-bold flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-50 bg-[#128C72] text-white hover:bg-[#0E5C4C]">
          {submitting ? <Loader2 size={18} className="animate-spin" /> : <ArrowRight size={18} />} Transfer
        </button>
      </DialogFooter>
    </Dialog>
  );
};
