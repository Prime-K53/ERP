import React, { useState, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../../../../components/Dialog';
import { Save, Package, DollarSign, Warehouse, Users, Hash, AlertCircle, Loader2 } from 'lucide-react';
import type { Item } from '../../../../types';

interface Props {
  open: boolean;
  items: Item[];
  onClose: () => void;
  onSave: (ids: string[], updates: Partial<Item>) => Promise<void>;
}

const FIELDS: { key: string; label: string; icon: React.ReactNode; type: 'text' | 'number' | 'select'; options?: { label: string; value: string }[] }[] = [
  { key: 'category', label: 'Category', icon: <Package size={14} />, type: 'text' },
  { key: 'type', label: 'Type', icon: <Hash size={14} />, type: 'select', options: [
    { label: 'Raw Material', value: 'Raw Material' }, { label: 'Product', value: 'Product' },
    { label: 'Finished Good', value: 'Finished Good' }, { label: 'Service', value: 'Service' },
    { label: 'Consumable', value: 'Consumable' }, { label: 'Stationery', value: 'Stationery' },
  ]},
  { key: 'status', label: 'Status', icon: <AlertCircle size={14} />, type: 'select', options: [
    { label: 'Active', value: 'Active' }, { label: 'Inactive', value: 'Inactive' },
  ]},
  { key: 'minStockLevel', label: 'Min Stock Level', icon: <Warehouse size={14} />, type: 'number' },
  { key: 'reorderPoint', label: 'Reorder Point', icon: <Warehouse size={14} />, type: 'number' },
  { key: 'costPrice', label: 'Cost Price', icon: <DollarSign size={14} />, type: 'number' },
  { key: 'sellingPrice', label: 'Selling Price', icon: <DollarSign size={14} />, type: 'number' },
  { key: 'preferredSupplierId', label: 'Supplier ID', icon: <Users size={14} />, type: 'text' },
];

export const BulkEditModal: React.FC<Props> = ({ open, items, onClose, onSave }) => {
  const [updates, setUpdates] = useState<Record<string, string | number>>({});
  const [submitting, setSubmitting] = useState(false);
  const activeFields = useMemo(() => Object.keys(updates).length, [updates]);

  React.useEffect(() => { if (!open) setUpdates({}); }, [open]);
  if (!open || items.length === 0) return null;

  const getCurrentValue = (key: string): string => {
    if (items.length === 1) { const v = (items[0] as Item)[key as keyof Item]; return v !== undefined && v !== null ? String(v) : ''; }
    const vals = new Set(items.map(i => String((i as Item)[key as keyof Item] ?? '')));
    return vals.size === 1 ? vals.values().next().value : '(multiple)';
  };

  const handleFieldChange = (key: string, value: string) => {
    if (!value && value !== '0') { const next = { ...updates }; delete next[key]; setUpdates(next); }
    else { setUpdates(prev => ({ ...prev, [key]: value })); }
  };

  const handleSubmit = async () => {
    if (activeFields === 0) return;
    setSubmitting(true);
    try {
      const parsed: Record<string, any> = {};
      for (const [key, val] of Object.entries(updates)) {
        const field = FIELDS.find(f => f.key === key);
        parsed[key] = field?.type === 'number' ? Number(val) : val;
      }
      await onSave(items.map(i => i.id), parsed as Partial<Item>);
      onClose();
    } finally { setSubmitting(false); }
  };

  return (
    <Dialog open={open} onClose={onClose} title="Bulk Edit">
      <div className="max-h-[60vh] overflow-y-auto space-y-4">
        {FIELDS.map(field => {
          const currentVal = updates[field.key] !== undefined ? String(updates[field.key]) : '';
          return (
            <div key={field.key}>
              <label className="flex items-center gap-1.5 text-xs font-medium mb-1.5" style={{ color: '#6C766F' }}>
                {field.icon} {field.label}
              </label>
              {field.type === 'select' ? (
                <select value={currentVal || getCurrentValue(field.key)} onChange={e => handleFieldChange(field.key, e.target.value)}
                  className="w-full px-3 py-2 border border-[#E5E8E1] rounded-[7px] text-sm bg-white outline-none focus:border-[#128C72]" style={{ color: '#16201B' }}>
                  <option value="">— No change —</option>
                  {field.options?.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              ) : (
                <input type={field.type} value={currentVal || getCurrentValue(field.key)} onChange={e => handleFieldChange(field.key, e.target.value)}
                  placeholder="— No change —"
                  className="w-full px-3 py-2 border border-[#E5E8E1] rounded-[7px] text-sm outline-none focus:border-[#128C72]" style={{ color: '#16201B' }} />
              )}
            </div>
          );
        })}
        {activeFields === 0 && <p className="text-xs text-center py-4" style={{ color: '#9CA59E' }}>Select fields above to edit. Empty fields are not changed.</p>}
      </div>

      <DialogFooter>
        <button type="button" onClick={onClose}
          className="flex-1 px-4 py-2.5 border border-[#E5E8E1] rounded-[7px] text-sm font-medium transition-all cursor-pointer bg-white" style={{ color: '#3B453F' }}>
          Cancel
        </button>
        <button type="button" onClick={handleSubmit} disabled={submitting || activeFields === 0}
          className="flex-1 px-4 py-2.5 rounded-[7px] text-sm font-bold flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-50 bg-[#128C72] text-white hover:bg-[#0E5C4C]">
          {submitting ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />} Apply to {items.length} item{items.length !== 1 ? 's' : ''}
        </button>
      </DialogFooter>
    </Dialog>
  );
};
