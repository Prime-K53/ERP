import React, { useState, useMemo } from 'react';
import { 
  Plus, Trash2, Calculator, 
  ShieldCheck, AlertCircle, Info, Landmark,
  TrendingUp, Scaling, FileCheck,
  PieChart, Activity, Truck, 
  RotateCcw, Save, Loader2, Printer
} from 'lucide-react';
import { Purchase, LandingCostItem, Expense } from '../../../types';
import { useAuth } from '../../../context/AuthContext';
import { useFinance } from '../../../context/FinanceContext';
import { useInventory } from '../../../context/InventoryContext';
import { useProcurement } from '../../../context/ProcurementContext';

interface LandingCostAllocationProps {
    purchase: Purchase;
    onUpdate: (costs: LandingCostItem[]) => void;
}

const LandingCostAllocation: React.FC<LandingCostAllocationProps> = ({ purchase, onUpdate }) => {
    const { companyConfig, notify, user } = useAuth(); const { purchases = [] } = useProcurement();
    const { addExpense } = useFinance();
    const { updatePurchase } = useInventory();
    const currency = companyConfig.currencySymbol;

    const supplierNames = useMemo(() => {
        const names = new Set<string>();
        purchases?.forEach((p: any) => {
            if (p.supplierId) names.add(p.supplierId);
        });
        return Array.from(names).sort();
    }, [purchases]);
    
    const [costs, setCosts] = useState<LandingCostItem[]>(purchase.landingCosts || []);
    const [allocationMethod, setAllocationMethod] = useState<'Value' | 'Quantity'>('Value');
    const [isSaving, setIsSaving] = useState(false);

    const totalLandingCost = useMemo(() => (costs || []).reduce((sum, c) => sum + (c.amount || 0), 0), [costs]);
    const totalPurchaseValue = useMemo(() => (purchase.items || []).reduce((sum, i) => sum + ((i.cost || 0) * (i.quantity || 0)), 0), [purchase.items]);
    const totalPurchaseQty = useMemo(() => (purchase.items || []).reduce((sum, i) => sum + (i.quantity || 0), 0), [purchase.items]);
    const burdenRatio = totalPurchaseValue > 0 ? (totalLandingCost / totalPurchaseValue) * 100 : 0;

    const allocatedItems = useMemo(() => {
        return (purchase.items || []).map(item => {
            const baseTotal = (item.cost || 0) * (item.quantity || 0);
            let share = 0;
            
            if (allocationMethod === 'Value') {
                share = totalPurchaseValue > 0 ? (baseTotal / totalPurchaseValue) * totalLandingCost : 0;
            } else {
                share = totalPurchaseQty > 0 ? ((item.quantity || 0) / totalPurchaseQty) * totalLandingCost : 0;
            }

            const unitBurden = (item.quantity || 0) > 0 ? share / (item.quantity || 0) : 0;
            const landedUnitCost = (item.cost || 0) + unitBurden;

            return {
                ...item,
                share,
                landedUnitCost
            };
        });
    }, [purchase.items, totalLandingCost, totalPurchaseValue, totalPurchaseQty, allocationMethod]);

    const handleAddCost = () => {
        const newCost: LandingCostItem = {
            id: `LC-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
            category: 'Freight',
            description: '',
            amount: 0
        };
        const updated = [...costs, newCost];
        setCosts(updated);
        onUpdate(updated);
    };

    const handlePostAsBill = (cost: LandingCostItem) => {
        if (!cost.amount || cost.amount <= 0) {
            notify("Cannot post a zero-amount bill", "error");
            return;
        }
        
        const expense: Expense = {
            id: '',
            date: new Date().toISOString(),
            amount: cost.amount,
            category: 'Transport & Freight',
            description: `Landing Cost (${cost.category}) for PO #${purchase.id}: ${cost.description}`,
            recordedBy: user?.name || 'System',
            status: 'Approved',
            referenceId: purchase.id
        };

        addExpense(expense);
        notify(`Vendor Bill created for ${cost.category}`, "success");
    };

    const updateCost = (id: string, field: keyof LandingCostItem, value: any) => {
        const updated = costs.map(c => c.id === id ? { ...c, [field]: value } : c);
        setCosts(updated);
        onUpdate(updated);
    };

    const removeCost = (id: string) => {
        const updated = costs.filter(c => c.id !== id);
        setCosts(updated);
        onUpdate(updated);
    };

    const handleClearAll = () => {
        if (confirm("Purge all recorded shipping expenses for this PO?")) {
            setCosts([]);
            onUpdate([]);
        }
    };

    const handleFinalize = async () => {
        setIsSaving(true);
        try {
            await updatePurchase({ 
                ...purchase, 
                landingCosts: costs,
                notes: (purchase.notes || '') + `\n[System]: Landing costs updated at ${new Date().toLocaleTimeString()}`
            });
            notify("Shipment burden profiles saved to Purchase Order.", "success");
        } catch (e) {
            notify("Failed to finalize costs.", "error");
        } finally {
            setIsSaving(false);
        }
    };

    const handleQuickAdd = (category: LandingCostItem['category'], amt: number) => {
        const newCost: LandingCostItem = {
            id: `LC-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
            category,
            description: `Standard ${category} estimate`,
            amount: amt
        };
        const updated = [...costs, newCost];
        setCosts(updated);
        onUpdate(updated);
    };

    return (
        <div className="flex flex-col gap-8 animate-in fade-in duration-300">
            
            {/* Analytics Header */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="bg-white p-6 rounded-[2rem] border border-slate-200 shadow-sm">
                    <div className="flex items-center gap-3 mb-2">
                        <div className="p-2 bg-blue-50 text-blue-600 rounded-lg"><PieChart size={16}/></div>
                        <span className="text-label">Burden Ratio</span>
                    </div>
                    <div className="flex items-baseline gap-2">
                        <span className="text-title">{(burdenRatio || 0).toFixed(1)}%</span>
                        <span className="text-[10px] font-bold text-slate-400 tracking-tight uppercase">of Goods Value</span>
                    </div>
                </div>
                <div className="bg-white p-6 rounded-[2rem] border border-slate-200 shadow-sm">
                    <div className="flex items-center gap-3 mb-2">
                        <div className="p-2 bg-emerald-50 text-emerald-600 rounded-lg"><Activity size={16}/></div>
                        <span className="text-label">Total Surcharges</span>
                    </div>
                    <div className="text-title finance-nums">{currency}{(totalLandingCost || 0).toLocaleString()}</div>
                </div>
                <div className="col-span-2 flex gap-2">
                    <button 
                        onClick={() => handleQuickAdd('Freight', 1500)}
                        className="flex-1 bg-slate-50 border border-slate-200 rounded-2xl p-4 text-left hover:bg-slate-100 transition-all group"
                    >
                        <Truck size={18} className="text-slate-400 group-hover:text-blue-600 mb-2"/>
                        <span className="block text-label mb-1">Quick Estimate</span>
                        <span className="block text-[13px] font-semibold text-slate-800">Domestic Freight</span>
                    </button>
                    <button 
                        onClick={() => handleQuickAdd('Customs', 500)}
                        className="flex-1 bg-slate-50 border border-slate-200 rounded-2xl p-4 text-left hover:bg-slate-100 transition-all group"
                    >
                        <Landmark size={18} className="text-slate-400 group-hover:text-indigo-600 mb-2"/>
                        <span className="block text-label mb-1">Quick Estimate</span>
                        <span className="block text-[13px] font-semibold text-slate-800">Clearance & Duty</span>
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                
                {/* Left: Input Ledger */}
                <div className="bg-white rounded-[2.5rem] border border-slate-200 shadow-sm overflow-hidden flex flex-col">
                    <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                        <div>
                            <h3 className="text-title flex items-center gap-2">
                                <Landmark size={16} className="text-blue-600"/> Shipment Expense Ledger
                            </h3>
                            <p className="text-[10px] text-slate-400 font-bold uppercase mt-1 tracking-tight">Secondary Vendor Invoices</p>
                        </div>
                        <div className="flex gap-2">
                            <button 
                                onClick={handleClearAll}
                                title="Clear All Costs"
                                className="bg-slate-100 text-slate-400 p-2 rounded-xl hover:bg-rose-50 hover:text-rose-500 transition-colors"
                            >
                                <RotateCcw size={18}/>
                            </button>
                            <button 
                                onClick={handleAddCost}
                                className="bg-blue-600 text-white p-2 rounded-xl hover:bg-blue-700 shadow-lg shadow-blue-200 transition-all active:scale-95"
                            >
                                <Plus size={18}/>
                            </button>
                        </div>
                    </div>

                    <div className="flex-1 overflow-y-auto p-6 space-y-4 custom-scrollbar min-h-[350px]">
                        {(costs || []).length === 0 ? (
                            <div className="h-full flex flex-col items-center justify-center text-slate-400 opacity-40 italic py-20">
                                <AlertCircle size={40} className="mb-2"/>
                                <p className="text-[13px] font-bold uppercase tracking-tight">No surcharges logged</p>
                            </div>
                        ) : (
                            costs.map(cost => (
                                <div key={cost.id} className="p-5 bg-slate-50 rounded-2xl border border-slate-200 group relative">
                                    <div className="grid grid-cols-2 gap-4 mb-4">
                                        <div>
                                            <label className="text-label mb-1.5 block">Cost Category</label>
                                            <select 
                                                className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-[13px] font-semibold outline-none focus:border-blue-500"
                                                value={cost.category}
                                                onChange={e => updateCost(cost.id, 'category', e.target.value)}
                                            >
                                                <option>Freight</option>
                                                <option>Customs</option>
                                                <option>Insurance</option>
                                                <option>Handling</option>
                                                <option>Other</option>
                                            </select>
                                        </div>
                                        <div>
                                            <label className="text-label mb-1.5 block">Amount ({currency})</label>
                                            <input 
                                                type="number" 
                                                className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-[13px] font-bold outline-none focus:border-blue-500 text-right finance-nums"
                                                value={cost.amount || ''}
                                                onChange={e => updateCost(cost.id, 'amount', parseFloat(e.target.value))}
                                                placeholder="0.00"
                                            />
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="col-span-1">
                                            <label className="text-label mb-1.5 block">Remit To (Carrier)</label>
                                            <select 
                                                className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-[13px] outline-none font-semibold"
                                                value={cost.providerId}
                                                onChange={e => updateCost(cost.id, 'providerId', e.target.value)}
                                            >
                                                <option value="">-- Manual Provider --</option>
                                                {supplierNames.map(name => <option key={name} value={name}>{name}</option>)}
                                            </select>
                                        </div>
                                        <div className="col-span-1 flex items-end">
                                            <button 
                                                onClick={() => handlePostAsBill(cost)}
                                                disabled={!cost.amount || !cost.providerId}
                                                className="w-full py-2 bg-white border border-slate-200 rounded-lg text-[13px] font-bold uppercase tracking-tight text-slate-600 hover:text-blue-600 hover:border-blue-200 disabled:opacity-30 transition-all flex items-center justify-center gap-2 shadow-sm"
                                            >
                                                <FileCheck size={12}/> Post as Bill
                                            </button>
                                        </div>
                                    </div>
                                    <button 
                                        onClick={() => removeCost(cost.id)}
                                        className="absolute -top-2 -right-2 bg-white border border-rose-100 text-rose-500 p-1.5 rounded-full shadow-md hover:bg-rose-50 opacity-0 group-hover:opacity-100 transition-opacity"
                                    >
                                        <Trash2 size={12}/>
                                    </button>
                                </div>
                            ))
                        )}
                    </div>
                    
                    <div className="p-6 bg-slate-900 text-white shrink-0">
                        <div className="flex justify-between items-center">
                            <span className="text-label text-blue-400">Total Landed Load</span>
                            <span className="text-[24px] font-bold finance-nums">{currency}{(totalLandingCost || 0).toLocaleString(undefined, {minimumFractionDigits: 2})}</span>
                        </div>
                    </div>
                </div>

                {/* Right: Allocation Logic */}
                <div className="space-y-6">
                    <div className="bg-white p-8 rounded-[3rem] border border-slate-200 shadow-sm relative overflow-hidden group">
                        <div className="absolute top-0 right-0 p-8 opacity-5 rotate-12 group-hover:rotate-0 transition-transform duration-1000"><Calculator size={120}/></div>
                        <h3 className="text-title mb-6 flex items-center gap-2">
                            <Scaling size={16} className="text-purple-600"/> Capitalization Logic
                        </h3>
                        <div className="flex gap-4 p-1.5 bg-slate-100 rounded-2xl border border-slate-200 mb-8">
                            <button 
                                onClick={() => setAllocationMethod('Value')}
                                className={`flex-1 py-3 rounded-xl text-[12.5px] font-bold uppercase tracking-widest transition-all ${allocationMethod === 'Value' ? 'bg-white text-blue-600 shadow-md' : 'text-slate-500 hover:text-slate-800'}`}
                            >
                                Value-Proportional
                            </button>
                            <button 
                                onClick={() => setAllocationMethod('Quantity')}
                                className={`flex-1 py-3 rounded-xl text-[12.5px] font-bold uppercase tracking-widest transition-all ${allocationMethod === 'Quantity' ? 'bg-white text-blue-600 shadow-md' : 'text-slate-500 hover:text-slate-800'}`}
                            >
                                Unit-Proportional
                            </button>
                        </div>
                        
                        <div className="bg-blue-50 p-5 rounded-2xl border border-blue-100 flex items-start gap-4">
                            <Info size={18} className="text-blue-600 shrink-0 mt-0.5"/>
                            <p className="text-[13px] text-blue-800 leading-relaxed font-medium uppercase tracking-tight">
                                {allocationMethod === 'Value' 
                                    ? "Costs are distributed based on the monetary weight of each line. Expensive items absorb a higher percentage of the landing cost."
                                    : "Costs are split evenly per physical unit. Best used for shipments where weight or size is the primary cost driver."
                                }
                            </p>
                        </div>
                    </div>

                    <div className="bg-white rounded-[2.5rem] border border-slate-200 shadow-sm overflow-hidden flex flex-col">
                        <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <TrendingUp size={16} className="text-emerald-600"/>
                                <h3 className="text-title">Valuation Bridge</h3>
                            </div>
                    <div className="flex gap-4">
                        <button 
                            onClick={() => window.print()}
                            className="bg-white text-slate-600 px-3 py-1 rounded-xl text-[13px] font-bold uppercase tracking-tight hover:bg-slate-50 border border-slate-200 flex items-center gap-2"
                        >
                            <Printer size={12}/>
                            Print Report
                        </button>
                    </div>
                </div>
                <div id="valuation-bridge" className="p-0 bg-white">
                            <table className="w-full text-left border-collapse">
                                <thead className="sticky top-0 z-10">
                                    <tr className="bg-slate-50/50">
                                        <th className="table-header px-4 py-2">Item SKU</th>
                                        <th className="table-header px-4 py-2 text-right">Factory</th>
                                        <th className="table-header px-4 py-2 text-center">Burden</th>
                                        <th className="table-header px-4 py-2 text-right">Landed</th>
                                    </tr>
                                </thead>

                                <tbody className="divide-y divide-slate-100">
                                    {allocatedItems.map((ai, i) => (
                                        <tr key={i} className="hover:bg-slate-50/50 transition-colors">
                                            <td className="table-body-cell px-4 py-2">
                                                <div className="font-semibold text-slate-800 text-[13px] truncate max-w-[150px]">{ai.name}</div>
                                                <div className="text-[10px] text-slate-400 font-mono">{ai.sku}</div>
                                            </td>
                                            <td className="table-body-cell px-4 py-2 text-right finance-nums">{currency}{(ai.cost || 0).toFixed(2)}</td>
                                            <td className="table-body-cell px-4 py-2 text-center text-blue-600 font-bold finance-nums">+{currency}{(ai.share / (ai.quantity || 1)).toFixed(2)}</td>
                                            <td className="table-body-cell px-4 py-2 text-right font-black text-emerald-600 finance-nums">{currency}{(ai.landedUnitCost || 0).toFixed(2)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>

            </div>

            {/* Bottom Finalize Control */}
            <div className="bg-slate-900 p-6 rounded-[2.5rem] border border-white/5 flex flex-col md:flex-row items-center gap-6 shadow-2xl relative overflow-hidden">
                <div className="absolute inset-0 bg-blue-600 opacity-5 pointer-events-none"></div>
                <div className="w-14 h-14 bg-blue-600 rounded-2xl flex items-center justify-center shadow-lg border border-white/10 shrink-0">
                    <ShieldCheck size={32} className="text-white"/>
                </div>
                <div className="flex-1">
                    <h4 className="font-black text-white uppercase text-sm tracking-tighter">Inventory Valuation Integrity</h4>
                    <p className="text-slate-400 text-xs mt-1 leading-relaxed max-w-2xl font-medium">
                        Finalizing will save these shipment expenses to the Purchase Order. When goods are received, the system will automatically capitalization these surcharges into the <b>weighted average unit cost</b> of your items.
                    </p>
                </div>
                <div className="shrink-0">
                    <button 
                        onClick={handleFinalize}
                        disabled={isSaving}
                        className="bg-white text-slate-900 px-8 py-4 rounded-2xl font-black uppercase text-[11px] tracking-widest hover:bg-slate-100 transition-all flex items-center gap-3 shadow-xl active:scale-95 disabled:opacity-50"
                    >
                        {isSaving ? <Loader2 size={18} className="animate-spin text-blue-600"/> : <Save size={18} className="text-blue-600"/>}
                        Commit to Order
                    </button>
                </div>
            </div>
        </div>
    );
};

export default LandingCostAllocation;
