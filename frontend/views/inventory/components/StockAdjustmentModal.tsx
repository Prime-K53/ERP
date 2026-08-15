import React, { useState } from 'react';
import { logger } from '@/services/logger';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../../../components/Dialog';
import { Save, AlertCircle, TrendingUp, TrendingDown, RefreshCw, MapPin } from 'lucide-react';
import { Item, Warehouse } from '../../../types';
import { useInventory } from '../../../context/InventoryContext';
import { getDefaultDate, validateDateInFY } from '../../../utils/financialYearUtils';

interface StockAdjustmentModalProps {
    isOpen: boolean;
    onClose: () => void;
    item: Item | null;
}

const StockAdjustmentModal: React.FC<StockAdjustmentModalProps> = ({ isOpen, onClose, item }) => {
    const { updateStock, warehouses } = useInventory();
    const [adjustmentType, setAdjustmentType] = useState<'ADD' | 'REMOVE' | 'SET'>('ADD');
    const [quantity, setQuantity] = useState<number>(0);
    const [reason, setReason] = useState<string>('');
    const [selectedWarehouse, setSelectedWarehouse] = useState<string>('WH-MAIN');
    const [isSubmitting, setIsSubmitting] = useState(false);

    if (!isOpen || !item) return null;

    const currentStock = item.stock || 0;

    // Calculate new stock based on adjustment type
    const calculateNewStock = () => {
        switch (adjustmentType) {
            case 'ADD': return currentStock + quantity;
            case 'REMOVE': return currentStock - quantity;
            case 'SET': return quantity;
            default: return currentStock;
        }
    };

    const newStock = calculateNewStock();
    const stockChange = adjustmentType === 'SET' ? quantity - currentStock : (adjustmentType === 'ADD' ? quantity : -quantity);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (quantity < 0 && adjustmentType !== 'SET') return;
        if (adjustmentType === 'REMOVE' && quantity > currentStock) {
            // Optional: add a confirmation or warning for negative stock
        }

        const dateValidation = validateDateInFY(getDefaultDate());
        if (dateValidation) {
            alert(dateValidation);
            return;
        }

        setIsSubmitting(true);
        try {
            // updateStock expects (itemId, qtyChange, locationId, reason, manualAdjustment)
            await updateStock(item.id, stockChange, selectedWarehouse, reason || `Manual adjustment: ${adjustmentType}`, true);
            onClose();
            // Reset form
            setQuantity(0);
            setReason('');
            setAdjustmentType('ADD');
        } catch (error) {
            logger.error('Adjustment failed:', error);
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <Dialog open={isOpen} onClose={onClose} title="Stock Adjustment">
            <p className="text-xs text-slate-500 font-medium mb-4">{item.name} ({item.sku})</p>
            <form onSubmit={handleSubmit} className="space-y-6">
                <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Location / Warehouse</label>
                    <div className="relative">
                        <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <select
                            value={selectedWarehouse}
                            onChange={(e) => setSelectedWarehouse(e.target.value)}
                            className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-sm appearance-none bg-white"
                        >
                            {warehouses.length > 0 ? (
                                warehouses.map(wh => (
                                    <option key={wh.id} value={wh.id}>{wh.name}</option>
                                ))
                            ) : (
                                <option value="WH-MAIN">Main Warehouse</option>
                            )}
                        </select>
                    </div>
                </div>

                <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Adjustment Type</label>
                    <div className="flex p-1 bg-slate-100 rounded-lg gap-1">
                        {(['ADD', 'REMOVE', 'SET'] as const).map((type) => (
                            <button
                                key={type}
                                type="button"
                                onClick={() => setAdjustmentType(type)}
                                className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-md transition-all text-sm font-medium ${adjustmentType === type
                                        ? 'bg-white text-indigo-600 shadow-sm'
                                        : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200/50'
                                    }`}
                            >
                                {type === 'ADD' && <TrendingUp size={16} />}
                                {type === 'REMOVE' && <TrendingDown size={16} />}
                                {type === 'SET' && <RefreshCw size={16} />}
                                {type.charAt(0) + type.slice(1).toLowerCase()}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                    <div className="px-4 py-3 bg-slate-50 rounded-lg border border-slate-100">
                        <span className="text-[10px] font-bold text-slate-400 uppercase">Current Stock</span>
                        <div className="text-xl font-bold text-slate-700">{currentStock} {item.unit}</div>
                    </div>
                    <div className={`px-4 py-3 rounded-lg border flex flex-col ${newStock < 0 ? 'bg-red-50 border-red-100' : 'bg-green-50 border-green-100'}`}>
                        <span className="text-[10px] font-bold text-slate-400 uppercase">Resulting Stock</span>
                        <div className={`text-xl font-bold ${newStock < 0 ? 'text-red-600' : 'text-green-600'}`}>{newStock} {item.unit}</div>
                    </div>
                </div>

                <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                        {adjustmentType === 'SET' ? 'New Quantity' : 'Change Quantity'}
                    </label>
                    <div className="relative">
                        <input
                            type="number"
                            min={adjustmentType === 'SET' ? "0" : "1"}
                            value={quantity}
                            onChange={(e) => setQuantity(Number(e.target.value))}
                            className="w-full px-4 py-2.5 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-lg font-semibold"
                            placeholder="0"
                            required
                        />
                    </div>
                    {adjustmentType === 'REMOVE' && quantity > currentStock && (
                        <p className="mt-2 text-xs text-amber-600 flex items-center gap-1 font-medium">
                            <AlertCircle size={12} /> This will result in negative stock
                        </p>
                    )}
                </div>

                <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Reason (Optional)</label>
                    <textarea
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-sm"
                        rows={2}
                        placeholder="e.g., Stock count discrepancy, Sample for client..."
                    />
                </div>
            </form>

            <DialogFooter>
                <button
                    type="button"
                    onClick={onClose}
                    className="flex-1 px-4 py-2.5 border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-50 transition-colors font-medium text-sm"
                >
                    Cancel
                </button>
                <button
                    type="submit"
                    onClick={handleSubmit}
                    disabled={isSubmitting || quantity < 0}
                    className="flex-1 px-4 py-2.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors font-bold text-sm flex items-center justify-center gap-2 shadow-sm shadow-indigo-100"
                >
                    {isSubmitting ? (
                        <RefreshCw size={18} className="animate-spin" />
                    ) : (
                        <Save size={18} />
                    )}
                    Save Adjustment
                </button>
            </DialogFooter>
        </Dialog>
    );
};

export default StockAdjustmentModal;
