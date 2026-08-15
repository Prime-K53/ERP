import React, { useState, useEffect, useRef, useMemo } from 'react';
import { logger } from '@/services/logger';
import {
    Plus, Trash2, Box, Settings, Activity, Save, X, ArrowRight,
    Calculator, Package, Briefcase, FileText, CheckCircle,
    AlertTriangle, TrendingUp, AlertCircle, Clock, Hash,
    Scale, Printer, Recycle, Database, Upload, FileSpreadsheet, Sparkles, Building2,
    Calendar, DollarSign, TrendingDown, Search, ChevronDown, ShieldCheck, Info, Layers,
    Eye, Download
} from 'lucide-react';
import { Item, ProductionOperation, BOMComponent, WorkCenter, WorkOrder, JobOrder, VDPConfig, BillOfMaterial } from '../../../types';
import { useAuth } from '../../../context/AuthContext';
import { useFinance } from '../../../context/FinanceContext';
import { useProduction } from '../../../context/ProductionContext';
import { Loader2 } from 'lucide-react';
import { OfflineImage } from '../../../components/OfflineImage';
import { generateNextId } from '../../../utils/helpers';
import { bomService } from '../../../services/bomService';
import { SafeFormulaEngine } from '../../../services/formulaEngine';

// --- BOM FORM ---

interface BOMFormProps {
    inventory: Item[];
    workCenters: WorkCenter[];
    initialData?: any;
    onSave: (data: any) => void;
    onCancel: () => void;
}

export const BOMForm: React.FC<BOMFormProps> = ({ inventory, workCenters, initialData, onSave, onCancel }) => {
    const { companyConfig } = useAuth();
    const currency = companyConfig.currencySymbol;
    const products = inventory.filter(i => i.type === 'Product' || i.type === 'Service');
    const materials = inventory.filter(i => i.type === 'Raw Material');

    const [selectedProduct, setSelectedProduct] = useState(initialData?.productId || '');
    const [selectedVariantId, setSelectedVariantId] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState<'Components' | 'Routing'>('Components');
    const [isFormulaBuilderOpen, setIsFormulaBuilderOpen] = useState(false);
    const [isVariantComparisonOpen, setIsVariantComparisonOpen] = useState(false);
    const [formulaTarget, setFormulaTarget] = useState<'component' | 'labor' | 'price' | null>(null);
    const [activeCompIndex, setActiveCompIndex] = useState<number | null>(null);

    const [components, setComponents] = useState<BOMComponent[]>(initialData?.components || []);
    const [operations, setOperations] = useState<ProductionOperation[]>(initialData?.operations || []);
    const [laborFormula, setLaborFormula] = useState(initialData?.laborFormula || '');
    const [priceFormula, setPriceFormula] = useState(initialData?.priceFormula || '');
    const [isParameterized, setIsParameterized] = useState(initialData?.isParameterized || false);

    const [tempMatId, setTempMatId] = useState('');
    const [tempQty, setTempQty] = useState(1);
    const [tempFormula, setTempFormula] = useState('');
    const [tempOpName, setTempOpName] = useState('');
    const [tempWC, setTempWC] = useState(companyConfig.productionSettings?.defaultWorkCenterId || (workCenters[0]?.id || ''));
    const [tempSetup, setTempSetup] = useState(10);
    const [tempRun, setTempRun] = useState(5);

    const selectedProductItem = inventory.find(i => i.id === selectedProduct);
    const variants = selectedProductItem?.variants || [];

    // Initialize selected variant if not set
    useEffect(() => {
        if (variants.length > 0 && !selectedVariantId) {
            setSelectedVariantId(variants[0].id);
        }
    }, [variants, selectedVariantId]);

    const activeVariant = variants.find(v => v.id === selectedVariantId);

    const evaluateFormula = (formula: string, attributes: Record<string, string | number>) => {
        try {
            // Convert string/number attributes to number format for SafeFormulaEngine
            const numericAttributes: Record<string, number> = {};
            Object.keys(attributes).forEach(key => {
                const val = attributes[key];
                if (typeof val === 'number') {
                    numericAttributes[key] = val;
                } else if (typeof val === 'string' && !isNaN(Number(val))) {
                    numericAttributes[key] = Number(val);
                }
            });

            // Use SafeFormulaEngine instead of eval
            return SafeFormulaEngine.evaluate(formula, numericAttributes);
        } catch (e) {
            logger.error('Error evaluating formula:', e);
            return 0;
        }
    };

    const getEffectiveQty = (comp: BOMComponent) => {
        const formula = comp.formula ?? comp.quantityFormula;
        if (!formula || !activeVariant) return comp.quantity;
        return evaluateFormula(formula, activeVariant.attributes);
    };

    const handleAddComp = () => {
        if (!tempMatId || (tempQty <= 0 && !tempFormula)) return;
        setComponents([...components, { materialId: tempMatId, quantity: tempQty, formula: tempFormula }]);
        setTempMatId('');
        setTempQty(1);
        setTempFormula('');
    };

    const handleAddOp = () => {
        if (!tempOpName || !tempWC) return;
        setOperations([...operations, { id: `OP-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`, name: tempOpName, workCenterId: tempWC, setupTime: tempSetup, runTimePerUnit: tempRun, sequence: operations.length + 1 }]);
        setTempOpName('');
        // Reset to default instead of clearing
        setTempWC(companyConfig.productionSettings?.defaultWorkCenterId || (workCenters[0]?.id || ''));
    };

    const handleSubmit = () => {
        if (!selectedProduct || components.length === 0) return;
        const product = products.find(p => p.id === selectedProduct);
        const laborCostValue = operations.reduce((sum, op) => {
            const wc = workCenters.find(w => w.id === op.workCenterId);
            return sum + ((op.runTimePerUnit / 60) * (wc?.hourlyRate || 0));
        }, 0);
        onSave({
            id: initialData?.id || '',
            productId: selectedProduct,
            productName: product?.name || 'Unspecified Item',
            components,
            operations,
            laborCost: parseFloat(laborCostValue.toFixed(2)),
            isParameterized,
            laborFormula,
            priceFormula
        });
    };

    const calculateCosts = () => {
        const matCostValue = components.reduce((sum, c) => {
            const m = materials.find(mat => mat.id === c.materialId);
            const qty = getEffectiveQty(c);
            const conversion = m?.conversionRate || 1;
            const baseCost = m?.cost || 0;
            const costPerUsageUnit = baseCost / conversion;
            return sum + (qty * costPerUsageUnit);
        }, 0);

        let laborCostValue = 0;
        if (isParameterized && laborFormula && activeVariant) {
            laborCostValue = evaluateFormula(laborFormula, activeVariant.attributes);
        } else {
            laborCostValue = operations.reduce((sum, op) => {
                const wc = workCenters.find(w => w.id === op.workCenterId);
                return sum + ((op.runTimePerUnit / 60) * (wc?.hourlyRate || 0));
            }, 0);
        }

        const totalCostValue = matCostValue + laborCostValue;
        const priceValue = isParameterized && priceFormula && activeVariant
            ? evaluateFormula(priceFormula, activeVariant.attributes)
            : activeVariant?.price || selectedProductItem?.price || 0;

        const marginValue = priceValue > 0 ? ((priceValue - totalCostValue) / priceValue) * 100 : 0;

        return { matCost: matCostValue, laborCost: laborCostValue, totalCost: totalCostValue, price: priceValue, margin: marginValue };
    };

    const { matCost, laborCost, totalCost, price, margin } = calculateCosts();

    const FormulaBuilderModal = () => {
        const [formula, setFormula] = useState(
            formulaTarget === 'component' && activeCompIndex !== null
                ? components[activeCompIndex].formula || ''
                : formulaTarget === 'labor'
                    ? laborFormula
                    : priceFormula
        );

        const attributes = activeVariant?.attributes || {};
        const availableAttributes = Object.keys(attributes);

        const handleSave = () => {
            if (formulaTarget === 'component' && activeCompIndex !== null) {
                const newComps = [...components];
                newComps[activeCompIndex] = { ...newComps[activeCompIndex], formula };
                setComponents(newComps);
            } else if (formulaTarget === 'labor') {
                setLaborFormula(formula);
            } else if (formulaTarget === 'price') {
                setPriceFormula(formula);
            }
            setIsFormulaBuilderOpen(false);
        };

        const insertAttribute = (attr: string) => {
            setFormula(prev => prev + attr);
        };

        return (
            <div className="fixed inset-0 z-[100] bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-4">
                <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden animate-in zoom-in-95 duration-200">
                    <div className="header-container flex justify-between items-center">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center text-white shadow-lg shadow-blue-200">
                                <Sparkles size={20} />
                            </div>
                            <div>
                                <h3 className="text-title">Visual Formula Builder</h3>
                                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-tight">Logic: {formulaTarget?.toUpperCase()}</p>
                            </div>
                        </div>
                        <button onClick={() => setIsFormulaBuilderOpen(false)} className="p-2 hover:bg-slate-200 rounded-xl transition-colors text-slate-400">
                            <X size={20} />
                        </button>
                    </div>

                    <div className="p-6 space-y-6">
                        <div className="space-y-3">
                            <label className="text-label block">Available Attributes</label>
                            <div className="flex flex-wrap gap-2">
                                {availableAttributes.length > 0 ? availableAttributes.map(attr => (
                                    <button
                                        key={attr}
                                        onClick={() => insertAttribute(attr)}
                                        className="px-3 py-1.5 bg-slate-100 hover:bg-blue-600 hover:text-white rounded-lg text-xs font-bold text-slate-600 transition-all border border-slate-200 hover:border-blue-600"
                                    >
                                        {attr}
                                    </button>
                                )) : (
                                    <div className="text-[13px] text-slate-400 italic font-medium py-2 px-1">
                                        No attributes found for selected variant. Add attributes in Inventory first.
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="space-y-3">
                            <label className="text-label block">Expression</label>
                            <div className="relative">
                                <textarea
                                    className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl text-sm font-bold font-mono outline-none focus:border-blue-500 focus:bg-white transition-all min-h-[120px] finance-nums"
                                    value={formula}
                                    onChange={e => setFormula(e.target.value)}
                                    placeholder="e.g. pages * 0.5 + 2"
                                />
                                <div className="absolute bottom-4 right-4 text-[10px] font-bold text-slate-400 bg-white/80 px-2 py-1 rounded-md border border-slate-100 finance-nums">
                                    Result: {evaluateFormula(formula, attributes).toFixed(2)}
                                </div>
                            </div>
                        </div>

                        <div className="grid grid-cols-4 gap-2">
                            {['+', '-', '*', '/', '(', ')'].map(op => (
                                <button
                                    key={op}
                                    onClick={() => insertAttribute(` ${op} `)}
                                    className="p-3 bg-slate-50 hover:bg-slate-100 rounded-xl text-[13px] font-bold text-slate-600 border border-slate-200 transition-all finance-nums"
                                >
                                    {op}
                                </button>
                            ))}
                        </div>

                        <button
                            onClick={handleSave}
                            className="zoho-button-primary w-full flex items-center justify-center gap-3"
                        >
                            <CheckCircle size={20} />
                            Apply Logic
                        </button>
                    </div>
                </div>
            </div>
        );
    };

    const VariantComparisonModal = () => {
        return (
            <div className="fixed inset-0 z-[100] bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-4">
                <div className="bg-white rounded-3xl shadow-2xl w-full max-w-5xl overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]">
                    <div className="header-container flex justify-between items-center shrink-0">
                        <div className="flex items-center gap-4">
                            <div className="w-12 h-12 rounded-2xl bg-indigo-600 flex items-center justify-center text-white shadow-xl shadow-indigo-200">
                                <TrendingUp size={24} />
                            </div>
                            <div>
                                <h3 className="text-title">Variant Cost Comparison</h3>
                                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-tight">Cross-Variant Margin Analysis</p>
                            </div>
                        </div>
                        <button onClick={() => setIsVariantComparisonOpen(false)} className="p-2 hover:bg-slate-200 rounded-xl transition-colors text-slate-400">
                            <X size={24} />
                        </button>
                    </div>

                    <div className="flex-1 overflow-auto p-8">
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            {variants.map(v => {
                                // Calculate costs for this specific variant
                                const variantMatCost = components.reduce((sum, c) => {
                                    const m = materials.find(mat => mat.id === c.materialId);
                                    const qty = c.formula ? evaluateFormula(c.formula, v.attributes) : c.quantity;
                                    const conversion = m?.conversionRate || 1;
                                    const baseCost = m?.cost || 0;
                                    return sum + (qty * (baseCost / conversion));
                                }, 0);

                                const variantLaborCost = isParameterized && laborFormula
                                    ? evaluateFormula(laborFormula, v.attributes)
                                    : laborCost; // fallback to base labor cost if not parameterized

                                const variantTotalCost = variantMatCost + variantLaborCost;
                                const variantPrice = isParameterized && priceFormula
                                    ? evaluateFormula(priceFormula, v.attributes)
                                    : v.price;

                                const variantMargin = variantPrice > 0 ? ((variantPrice - variantTotalCost) / variantPrice) * 100 : 0;

                                return (
                                    <div key={v.id} className={`p-6 rounded-3xl border-2 transition-all ${selectedVariantId === v.id ? 'border-blue-500 bg-blue-50/30' : 'border-slate-100 bg-white'}`}>
                                        <div className="flex justify-between items-start mb-6">
                                            <div className="font-bold text-slate-900 text-[13px] max-w-[150px] leading-tight">{v.name}</div>
                                            <div className={`px-2 py-1 rounded-md text-[10px] font-bold uppercase tracking-tight finance-nums ${variantMargin >= 20 ? 'bg-emerald-100 text-emerald-600' : 'bg-amber-100 text-amber-600'}`}>
                                                {variantMargin.toFixed(1)}% Margin
                                            </div>
                                        </div>

                                        <div className="space-y-4">
                                            <div className="flex justify-between items-center text-[13px]">
                                                <span className="text-label text-[10px] uppercase font-bold tracking-tight">Material Cost</span>
                                                <span className="font-bold text-slate-700 finance-nums">{currency}{variantMatCost.toFixed(2)}</span>
                                            </div>
                                            <div className="flex justify-between items-center text-[13px]">
                                                <span className="text-label text-[10px] uppercase font-bold tracking-tight">Labor Cost</span>
                                                <span className="font-bold text-slate-700 finance-nums">{currency}{variantLaborCost.toFixed(2)}</span>
                                            </div>
                                            <div className="pt-3 border-t border-slate-100 flex justify-between items-center">
                                                <span className="text-label text-[10px] uppercase font-bold tracking-tight">Total Cost</span>
                                                <span className="font-bold text-slate-900 finance-nums">{currency}{variantTotalCost.toFixed(2)}</span>
                                            </div>
                                            <div className="flex justify-between items-center bg-slate-900 p-3 rounded-xl">
                                                <span className="text-label text-[10px] text-slate-400 uppercase font-bold tracking-tight">Selling Price</span>
                                                <span className="font-bold text-white finance-nums">{currency}{variantPrice.toFixed(2)}</span>
                                            </div>
                                        </div>

                                        <button
                                            onClick={() => { setSelectedVariantId(v.id); setIsVariantComparisonOpen(false); }}
                                            className={`w-full mt-6 zoho-button-secondary transition-all ${selectedVariantId === v.id ? 'bg-blue-600 text-white shadow-lg shadow-blue-200 hover:bg-blue-700' : ''}`}
                                        >
                                            {selectedVariantId === v.id ? 'Current View' : 'Switch Preview'}
                                        </button>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    <div className="bg-slate-50 p-6 border-t border-slate-200 text-center">
                        <p className="text-[10px] text-slate-400 font-bold uppercase tracking-tight">
                            Calculations are live based on the current BOM recipe and variant attributes
                        </p>
                    </div>
                </div>
            </div>
        );
    };

    return (
        <div className="flex flex-col h-full bg-[#F8FAFC] overflow-hidden">
            {isFormulaBuilderOpen && <FormulaBuilderModal />}
            {isVariantComparisonOpen && <VariantComparisonModal />}
            {/* Sticky Top Bar */}
            <div className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between shrink-0 header-container">
                <div className="flex items-center gap-4">
                    <button onClick={onCancel} className="p-2 hover:bg-slate-100 rounded-lg transition-colors text-slate-500">
                        <X size={20} />
                    </button>
                    <div>
                        <h2 className="text-title">{initialData ? 'Edit Bill of Materials' : 'New Bill of Materials'}</h2>
                        <p className="text-[13px] text-slate-500 font-medium">Configure material requirements and operational routing</p>
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    <button onClick={onCancel} className="zoho-button-secondary">Cancel</button>
                    <button
                        onClick={handleSubmit}
                        disabled={!selectedProduct || components.length === 0}
                        className="zoho-button-primary flex items-center gap-2"
                    >
                        <Save size={18} />
                        {initialData ? 'Update BOM' : 'Create BOM'}
                    </button>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto p-6">
                <div className="max-w-[1440px] mx-auto grid grid-cols-1 lg:grid-cols-[1fr_400px] gap-6">
                    {/* Left Column: Main Configuration */}
                    <div className="space-y-6">
                        {/* 1. Product & Variant Selection */}
                        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
                            <div className="flex items-start gap-6">
                                <div className="w-20 h-20 bg-slate-100 rounded-xl overflow-hidden shrink-0 border border-slate-200">
                                    {selectedProduct ? (
                                        <OfflineImage src={selectedProductItem?.image} alt="Product" className="w-full h-full object-cover" />
                                    ) : (
                                        <div className="w-full h-full flex items-center justify-center text-slate-300">
                                            <Package size={32} />
                                        </div>
                                    )}
                                </div>
                                <div className="flex-1 space-y-4">
                                    <div>
                                        <label className="text-label block mb-1.5">Target Product</label>
                                        {initialData?.templateId ? (
                                            <div className="w-full p-2.5 border border-blue-200 rounded-lg bg-blue-50/30 text-[13px] font-bold text-blue-900 shadow-sm flex items-center justify-between">
                                                <span>{initialData.productName}</span>
                                                <div className="flex items-center gap-1.5 px-2 py-0.5 bg-blue-100 text-blue-700 rounded-md text-[10px] uppercase tracking-wider">
                                                    <Sparkles size={10} />
                                                    Template
                                                </div>
                                            </div>
                                        ) : (
                                            <select
                                                className="w-full p-2.5 border border-slate-200 rounded-lg text-[13px] font-bold outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 transition-all bg-white appearance-none cursor-pointer shadow-sm"
                                                value={selectedProduct}
                                                onChange={e => setSelectedProduct(e.target.value)}
                                                disabled={!!initialData}
                                            >
                                                <option value="">-- Select Product/Service --</option>
                                                {products.map(p => (
                                                    <option key={p.id} value={p.id}>{p.name} ({p.sku})</option>
                                                ))}
                                            </select>
                                        )}
                                    </div>

                                    {variants.length > 0 && (
                                        <div className="space-y-3 pt-2">
                                            <div className="flex items-center justify-between">
                                                <label className="text-label block">Preview Variant Logic</label>
                                                <button
                                                    onClick={() => setIsVariantComparisonOpen(true)}
                                                    className="flex items-center gap-1.5 text-[10px] font-bold text-blue-600 uppercase tracking-tight hover:text-blue-700 transition-colors"
                                                >
                                                    <TrendingUp size={12} />
                                                    Compare Variants
                                                </button>
                                            </div>
                                            <div className="flex flex-wrap gap-2">
                                                {variants.map(v => (
                                                    <button
                                                        key={v.id}
                                                        onClick={() => setSelectedVariantId(v.id)}
                                                        className={`px-4 py-2 rounded-xl text-xs font-bold transition-all border ${selectedVariantId === v.id
                                                            ? 'bg-blue-600 border-blue-600 text-white shadow-md shadow-blue-100'
                                                            : 'bg-white border-slate-200 text-slate-600 hover:border-blue-300'
                                                            }`}
                                                    >
                                                        {v.name}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* 2. Tabs for Materials & Routing */}
                        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                            <div className="flex border-b border-slate-200 px-2">
                                <button
                                    onClick={() => setActiveTab('Components')}
                                    className={`flex items-center gap-2 px-6 py-2.5 font-bold text-[13px] uppercase tracking-tight border-b-2 transition-all ${activeTab === 'Components' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-400'
                                        }`}
                                >
                                    <Box size={16} />
                                    Material Requirements
                                </button>
                                <button
                                    onClick={() => setActiveTab('Routing')}
                                    className={`flex items-center gap-2 px-6 py-2.5 font-bold text-[13px] uppercase tracking-tight border-b-2 transition-all ${activeTab === 'Routing' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-400'
                                        }`}
                                >
                                    <Activity size={16} />
                                    Operational Routing
                                </button>
                                <div className="ml-auto flex items-center gap-3 pr-6">
                                    <div className="flex items-center gap-2 bg-slate-50 px-3 py-1.5 rounded-full border border-slate-100">
                                        <input
                                            type="checkbox"
                                            id="isParameterized"
                                            checked={isParameterized}
                                            onChange={e => setIsParameterized(e.target.checked)}
                                            className="w-4 h-4 text-blue-600 border-slate-300 rounded focus:ring-blue-500"
                                        />
                                        <label htmlFor="isParameterized" className="text-[10px] font-bold text-slate-500 uppercase tracking-tight cursor-pointer">Formula Engine</label>
                                    </div>
                                </div>
                            </div>

                            <div className="p-6">
                                {activeTab === 'Components' ? (
                                    <div className="space-y-6">
                                        {/* Component Adder */}
                                        <div className="grid grid-cols-[1fr_120px_1fr_44px] gap-3 items-end bg-slate-50 p-4 rounded-xl border border-slate-100 shadow-inner">
                                            <div className="space-y-2">
                                                <label className="text-label block px-1">Source Material</label>
                                                <select
                                                    className="w-full p-2.5 border border-slate-200 rounded-lg text-[13px] font-bold outline-none focus:ring-4 focus:ring-blue-500/10 bg-white"
                                                    value={tempMatId}
                                                    onChange={e => setTempMatId(e.target.value)}
                                                >
                                                    <option value="">-- Choose Material --</option>
                                                    {materials.filter(m => !components.some(c => c.materialId === m.id)).map(m => {
                                                        const conversion = m.conversionRate || 1;
                                                        const usageCost = (m.cost || 0) / conversion;
                                                        const usageUnit = m.usageUnit || m.unit || 'units';
                                                        return <option key={m.id} value={m.id}>{m.name} ({currency}{usageCost.toFixed(2)}/{usageUnit})</option>;
                                                    })}
                                                </select>
                                            </div>
                                            <div className="space-y-2">
                                                <label className="text-label block px-1">Base Qty</label>
                                                <input
                                                    type="number"
                                                    className="w-full p-2.5 border border-slate-200 rounded-lg text-[13px] font-bold text-center outline-none focus:ring-4 focus:ring-blue-500/10 bg-white finance-nums"
                                                    value={tempQty}
                                                    onChange={e => setTempQty(parseFloat(e.target.value))}
                                                />
                                            </div>
                                            {isParameterized && (
                                                <div className="space-y-2">
                                                    <label className="text-label block px-1">Formula (fx)</label>
                                                    <div className="relative">
                                                        <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none">
                                                            <Sparkles size={12} className="text-blue-400" />
                                                        </div>
                                                        <input
                                                            type="text"
                                                            className="w-full pl-8 pr-10 py-2.5 border border-slate-200 rounded-lg text-[13px] font-bold font-mono outline-none focus:ring-4 focus:ring-blue-500/10 bg-white"
                                                            value={tempFormula}
                                                            onChange={e => setTempFormula(e.target.value)}
                                                            placeholder="e.g. pages * 0.5"
                                                        />
                                                        <button
                                                            onClick={() => { setFormulaTarget('component'); setActiveCompIndex(null); setIsFormulaBuilderOpen(true); }}
                                                            className="absolute inset-y-0 right-3 flex items-center text-blue-500 hover:text-blue-700"
                                                        >
                                                            <Sparkles size={14} />
                                                        </button>
                                                    </div>
                                                </div>
                                            )}
                                            <button onClick={handleAddComp} className="zoho-button-primary !p-2.5" title="Add component" aria-label="Add component"><Plus size={18} /></button>
                                        </div>

                                        {/* Components Table */}
                                        <div className="border border-slate-100 rounded-xl overflow-hidden">
                                            <table className="w-full border-collapse">
                                                <thead>
                                                    <tr className="bg-slate-50 border-b border-slate-100">
                                                        <th className="table-header text-left px-6 py-4">Material Component</th>
                                                        <th className="table-header text-center w-32 px-6 py-4">Rule</th>
                                                        <th className="table-header text-center w-32 px-6 py-4">Base Qty</th>
                                                        <th className="table-header text-center w-32 bg-blue-50/50 text-blue-600 px-6 py-4">Effective Qty</th>
                                                        <th className="table-header w-12 bg-slate-50 px-6 py-4"></th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-slate-50">
                                                    {components.map((c, i) => {
                                                        const m = materials.find(mat => mat.id === c.materialId);
                                                        const unitDisplay = m?.usageUnit || m?.unit || 'units';
                                                        const effectiveQty = getEffectiveQty(c);
                                                        return (
                                                            <tr key={i} className="hover:bg-slate-50/50 transition-colors">
                                                                <td className="table-body-cell px-6 py-4">
                                                                    <div className="flex items-center gap-3">
                                                                        <div className="w-10 h-10 rounded-lg overflow-hidden bg-slate-50 border border-slate-200 shrink-0">
                                                                            <OfflineImage src={m?.image} alt={m?.name || 'Component'} className="w-full h-full object-cover" />
                                                                        </div>
                                                                        <div>
                                                                            <div className="font-bold text-slate-800 text-[13px]">{m?.name}</div>
                                                                            <div className="text-[10px] text-slate-400 font-bold uppercase tracking-tight">{m?.sku}</div>
                                                                        </div>
                                                                    </div>
                                                                </td>
                                                                <td className="table-body-cell text-center px-6 py-4">
                                                                    {c.formula ? (
                                                                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-blue-50 text-blue-600 text-[10px] font-bold uppercase tracking-tight border border-blue-100">
                                                                            <Sparkles size={10} />
                                                                            Formula
                                                                        </span>
                                                                    ) : (
                                                                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-100 text-slate-500 text-[10px] font-bold uppercase tracking-tight">
                                                                            Fixed
                                                                        </span>
                                                                    )}
                                                                </td>
                                                                <td className="table-body-cell text-center font-bold text-slate-600 text-[13px] finance-nums px-6 py-4">
                                                                    {c.quantity} <span className="text-[10px] text-slate-400">{unitDisplay}</span>
                                                                </td>
                                                                <td className="table-body-cell text-center bg-blue-50/20 px-6 py-4">
                                                                    <div className="font-bold text-blue-600 text-[13px] finance-nums">
                                                                        {effectiveQty.toFixed(2)} <span className="text-[10px] opacity-70">{unitDisplay}</span>
                                                                    </div>
                                                                    {c.formula && (
                                                                        <div className="flex items-center justify-center gap-1 mt-0.5">
                                                                            <div className="text-[9px] font-mono text-blue-400 truncate max-w-[80px]">{c.formula}</div>
                                                                            <button
                                                                                onClick={() => { setFormulaTarget('component'); setActiveCompIndex(i); setIsFormulaBuilderOpen(true); }}
                                                                                className="text-blue-300 hover:text-blue-500"
                                                                            >
                                                                                <Sparkles size={10} />
                                                                            </button>
                                                                        </div>
                                                                    )}
                                                                </td>
                                                                <td className="table-body-cell text-right px-6 py-4">
                                                                    <button onClick={() => setComponents(prev => prev.filter((_, idx) => idx !== i))} className="text-slate-300 hover:text-red-500 transition-colors">
                                                                        <Trash2 size={16} />
                                                                    </button>
                                                                </td>
                                                            </tr>
                                                        );
                                                    })}
                                                    {components.length === 0 && (
                                                        <tr>
                                                            <td colSpan={5} className="px-4 py-12 text-center text-slate-400 italic text-sm">
                                                                No material components added yet.
                                                            </td>
                                                        </tr>
                                                    )}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="space-y-6">
                                        {isParameterized && (
                                            <div className="grid grid-cols-2 gap-4">
                                                <div className="bg-blue-50/30 p-4 rounded-2xl border border-blue-100">
                                                    <label className="text-label block mb-2 px-1">Labor Cost Formula</label>
                                                    <div className="relative">
                                                        <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none">
                                                            <Calculator size={14} className="text-blue-400" />
                                                        </div>
                                                        <input
                                                            type="text"
                                                            className="w-full pl-9 pr-10 py-2.5 border border-blue-200 rounded-xl text-[13px] font-bold font-mono focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 outline-none bg-white/50"
                                                            value={laborFormula}
                                                            onChange={e => setLaborFormula(e.target.value)}
                                                            placeholder="e.g. pages * 5"
                                                        />
                                                        <button
                                                            onClick={() => { setFormulaTarget('labor'); setIsFormulaBuilderOpen(true); }}
                                                            className="absolute inset-y-0 right-3 flex items-center text-blue-500 hover:text-blue-700"
                                                        >
                                                            <Sparkles size={14} />
                                                        </button>
                                                    </div>
                                                </div>
                                                <div className="bg-emerald-50/30 p-4 rounded-2xl border border-emerald-100">
                                                    <label className="text-label block mb-2 px-1">Dynamic Price Formula</label>
                                                    <div className="relative">
                                                        <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none">
                                                            <DollarSign size={14} className="text-emerald-400" />
                                                        </div>
                                                        <input
                                                            type="text"
                                                            className="w-full pl-9 pr-10 py-2.5 border border-emerald-200 rounded-xl text-[13px] font-bold font-mono focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500 outline-none bg-white/50"
                                                            value={priceFormula}
                                                            onChange={e => setPriceFormula(e.target.value)}
                                                            placeholder="e.g. cost * 1.5"
                                                        />
                                                        <button
                                                            onClick={() => { setFormulaTarget('price'); setIsFormulaBuilderOpen(true); }}
                                                            className="absolute inset-y-0 right-3 flex items-center text-emerald-500 hover:text-emerald-700"
                                                        >
                                                            <Sparkles size={14} />
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>
                                        )}

                                        {/* Operation Adder */}
                                        <div className="grid grid-cols-1 md:grid-cols-[1fr_1fr_160px_44px] gap-3 items-end bg-slate-50 p-4 rounded-xl border border-slate-100">
                                            <div className="space-y-2">
                                                <label className="text-label block px-1">Phase / Process Name</label>
                                                <input
                                                    className="w-full p-2.5 border border-slate-200 rounded-lg text-[13px] font-bold outline-none focus:ring-4 focus:ring-blue-500/10 bg-white"
                                                    value={tempOpName}
                                                    onChange={e => setTempOpName(e.target.value)}
                                                    placeholder="e.g. Digital Printing"
                                                />
                                            </div>
                                            <div className="space-y-2">
                                                <label className="text-label block px-1">Work Center</label>
                                                <select
                                                    className="w-full p-2.5 border border-slate-200 rounded-lg text-[13px] font-bold outline-none focus:ring-4 focus:ring-blue-500/10 bg-white"
                                                    value={tempWC}
                                                    onChange={e => setTempWC(e.target.value)}
                                                >
                                                    {workCenters.map(w => (
                                                        <option key={w.id} value={w.id}>
                                                            {w.name} {w.id === companyConfig.productionSettings?.defaultWorkCenterId ? '(Default)' : ''}
                                                        </option>
                                                    ))}
                                                </select>
                                            </div>
                                            <div className="grid grid-cols-2 gap-2">
                                                <div className="space-y-2">
                                                    <label className="text-label block text-center">Setup (m)</label>
                                                    <input type="number" className="w-full p-2.5 border border-slate-200 rounded-lg text-[13px] font-bold text-center outline-none focus:ring-4 focus:ring-blue-500/10 bg-white finance-nums" value={tempSetup} onChange={e => setTempSetup(parseFloat(e.target.value))} />
                                                </div>
                                                <div className="space-y-2">
                                                    <label className="text-label block text-center">Run (m)</label>
                                                    <input type="number" className="w-full p-2.5 border border-slate-200 rounded-lg text-[13px] font-bold text-center outline-none focus:ring-4 focus:ring-blue-500/10 bg-white finance-nums" value={tempRun} onChange={e => setTempRun(parseFloat(e.target.value))} />
                                                </div>
                                            </div>
                                            <button onClick={handleAddOp} className="zoho-button-primary !p-2.5 flex items-center justify-center" title="Add operation" aria-label="Add operation"><Plus size={18} /></button>
                                        </div>

                                        {/* Operations Timeline */}
                                        <div className="space-y-4 relative before:absolute before:left-[19px] before:top-4 before:bottom-4 before:w-0.5 before:bg-slate-100">
                                            {operations.map((op, i) => {
                                                const wc = workCenters.find(w => w.id === op.workCenterId);
                                                return (
                                                    <div key={i} className="relative flex gap-6 items-start group">
                                                        <div className="w-10 h-10 rounded-full bg-white border-2 border-slate-200 flex items-center justify-center text-[10px] font-bold text-slate-400 shrink-0 z-10 group-hover:border-blue-500 group-hover:text-blue-500 transition-colors">
                                                            {i + 1}
                                                        </div>
                                                        <div className="flex-1 bg-white border border-slate-100 rounded-2xl p-4 shadow-sm hover:border-blue-200 hover:shadow-md transition-all flex items-center justify-between">
                                                            <div className="flex items-center gap-4">
                                                                <div className="p-3 bg-slate-50 rounded-xl text-slate-400 group-hover:text-blue-500 group-hover:bg-blue-50 transition-colors">
                                                                    <Activity size={20} />
                                                                </div>
                                                                <div>
                                                                    <div className="font-bold text-slate-900 text-[13px]">{op.name}</div>
                                                                    <div className="flex items-center gap-2 mt-0.5">
                                                                        <span className="text-[10px] text-slate-400 font-bold uppercase tracking-tight">{wc?.name}</span>
                                                                        <span className="w-1 h-1 rounded-full bg-slate-300"></span>
                                                                        <span className="text-[10px] text-slate-500 font-bold uppercase tracking-tight finance-nums">Rate: {currency}{wc?.hourlyRate}/hr</span>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                            <div className="flex items-center gap-6">
                                                                <div className="text-right">
                                                                    <div className="text-label text-[10px] mb-1">Timing</div>
                                                                    <div className="flex items-center gap-3">
                                                                        <span className="flex items-center gap-1.5 text-[13px] font-bold text-slate-600 bg-slate-50 px-2 py-1 rounded-lg border border-slate-100 finance-nums">
                                                                            <Settings size={12} className="text-slate-400" /> {op.setupTime}m
                                                                        </span>
                                                                        <span className="flex items-center gap-1.5 text-[13px] font-bold text-blue-600 bg-blue-50 px-2 py-1 rounded-lg border border-blue-100 finance-nums">
                                                                            <Clock size={12} /> {op.runTimePerUnit}m/ea
                                                                        </span>
                                                                    </div>
                                                                </div>
                                                                <button onClick={() => setOperations(prev => prev.filter((_, idx) => idx !== i))} className="p-2 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-all">
                                                                    <Trash2 size={18} />
                                                                </button>
                                                            </div>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                            {operations.length === 0 && (
                                                <div className="pl-16 py-12 text-slate-400 italic text-sm">
                                                    No production phases defined.
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Right Column: Sticky Summary & Analysis */}
                    <div className="lg:sticky lg:top-24 space-y-6 self-start">
                        <div className="bg-white rounded-3xl border border-slate-200 shadow-xl shadow-slate-200/50 overflow-hidden">
                            <div className="bg-slate-900 p-6 text-white">
                                <div className="flex justify-between items-start mb-4">
                                    <div>
                                        <h3 className="text-lg font-bold">Cost Analysis</h3>
                                        <p className="text-xs text-slate-400 font-medium">Live breakdown per unit</p>
                                    </div>
                                    <div className="bg-white/10 p-2 rounded-lg">
                                        <TrendingUp size={20} className="text-blue-400" />
                                    </div>
                                </div>
                                <div className="space-y-1">
                                    <div className="text-[10px] text-slate-400 font-bold uppercase tracking-tight">Total Est. Cost</div>
                                    <div className="text-3xl font-bold tracking-tight finance-nums">{currency}{totalCost.toFixed(2)}</div>
                                </div>
                            </div>

                            <div className="p-6 space-y-6">
                                <div className="space-y-4">
                                    <div className="flex justify-between items-center">
                                        <div className="flex items-center gap-3">
                                            <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center text-blue-600">
                                                <Box size={16} />
                                            </div>
                                            <div>
                                                <div className="text-[13px] font-bold text-slate-900">Materials</div>
                                                <div className="text-[10px] text-slate-400 font-bold uppercase tracking-tight">{components.length} components</div>
                                            </div>
                                        </div>
                                        <div className="text-[13px] font-bold text-slate-700 finance-nums">{currency}{matCost.toFixed(2)}</div>
                                    </div>

                                    <div className="flex justify-between items-center">
                                        <div className="flex items-center gap-3">
                                            <div className="w-8 h-8 rounded-lg bg-indigo-50 flex items-center justify-center text-indigo-600">
                                                <Activity size={16} />
                                            </div>
                                            <div>
                                                <div className="text-[13px] font-bold text-slate-900">Labor & Overhead</div>
                                                <div className="text-[10px] text-slate-400 font-bold uppercase tracking-tight">{operations.length} phases</div>
                                            </div>
                                        </div>
                                        <div className="text-[13px] font-bold text-slate-700 finance-nums">{currency}{laborCost.toFixed(2)}</div>
                                    </div>
                                </div>

                                <div className="pt-6 border-t border-slate-100">
                                    <div className="flex justify-between items-end mb-4">
                                        <div>
                                            <div className="text-label text-[10px] mb-1">Target Price</div>
                                            <div className="text-xl font-bold text-slate-900 finance-nums">{currency}{price.toFixed(2)}</div>
                                        </div>
                                        <div className="text-right">
                                            <div className="text-label text-[10px] mb-1">Net Margin</div>
                                            <div className={`text-xl font-bold finance-nums ${margin >= 20 ? 'text-emerald-500' : 'text-amber-500'}`}>
                                                {margin.toFixed(1)}%
                                            </div>
                                        </div>
                                    </div>

                                    {/* Margin Progress Bar */}
                                    <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                                        <div
                                            className={`h-full transition-all duration-500 ${margin >= 20 ? 'bg-emerald-500' : 'bg-amber-500'}`}
                                            style={{ width: `${Math.min(Math.max(margin, 0), 100)}%` }}
                                        />
                                    </div>
                                    <div className="flex justify-between mt-2">
                                        <span className="text-[9px] font-bold text-slate-400 uppercase">Cost</span>
                                        <span className="text-[9px] font-bold text-slate-400 uppercase">Profit</span>
                                    </div>
                                </div>

                                <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100 space-y-3">
                                    <div className="flex items-center gap-2 text-blue-600">
                                        <ShieldCheck size={16} />
                                        <span className="text-[10px] font-bold uppercase tracking-tight">Health Check</span>
                                    </div>
                                    <p className="text-[10px] text-slate-500 leading-relaxed font-medium">
                                        {margin < 15
                                            ? "Warning: Low margin detected. Consider optimizing labor steps or material usage."
                                            : "Healthy margins confirmed based on current production parameters."}
                                    </p>
                                </div>
                            </div>
                        </div>

                        <div className="bg-blue-600 rounded-3xl p-6 text-white shadow-xl shadow-blue-200">
                            <button
                                onClick={handleSubmit}
                                disabled={!selectedProduct || components.length === 0}
                                className="w-full flex items-center justify-center gap-3 py-4 bg-white text-blue-600 rounded-2xl font-bold text-[13px] hover:bg-blue-50 transition-all active:scale-95 disabled:opacity-50 disabled:active:scale-100 finance-nums uppercase tracking-tight"
                            >
                                <Save size={20} />
                                {initialData ? 'Update BOM Recipe' : 'Save New BOM Recipe'}
                            </button>
                            <p className="text-center text-[10px] text-blue-100/60 mt-4 font-bold uppercase tracking-tight">
                                Pressing save will commit changes to production database
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

// --- WORK ORDER MODAL (REDESIGNED) ---

interface WorkOrderModalProps {
    boms: BillOfMaterial[];
    inventory: Item[];
    onSave: (wo: Partial<WorkOrder>) => void;
    onClose: () => void;
    initialData?: WorkOrder;
}

export const WorkOrderModal: React.FC<WorkOrderModalProps> = ({ boms, inventory, onSave, onClose, initialData }) => {
    const { companyConfig, notify } = useAuth();
    const { invoices = [] } = useFinance();
    const { workOrders = [], workCenters = [] } = useProduction();
    const currency = companyConfig.currencySymbol;

    const customerNames = useMemo(() => {
        const names = new Set<string>();
        invoices?.forEach((inv: any) => {
            if (inv.customerName) names.add(inv.customerName);
        });
        return Array.from(names).sort();
    }, [invoices]);

    // Internal Form State
    const [formData, setFormData] = useState<any>({
        id: initialData?.id || generateNextId('workorder', workOrders, companyConfig),
        customerName: initialData?.customerName || '',
        date: initialData?.date || new Date().toISOString().split('T')[0],
        dueDate: initialData?.dueDate || new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0],
        bomId: initialData?.bomId || '',
        variantId: initialData?.attributes?.variantId || '',
        quantity: initialData?.quantityPlanned || 1,
        priority: initialData?.priority || 'Normal',
        discount: 0
    });

    const [customerSearch, setCustomerSearch] = useState(initialData?.customerName || '');
    const [isCustomerDropdownOpen, setIsCustomerDropdownOpen] = useState(false);
    const [recipeSearch, setRecipeSearch] = useState('');

    const customerDropdownRef = useRef<HTMLDivElement>(null);

    // Closest filter for customers
    const filteredCustomers = useMemo(() => {
        return customerNames.filter(name =>
            name.toLowerCase().includes(customerSearch.toLowerCase())
        );
    }, [customerNames, customerSearch]);

    // Filter recipes/BOMs
    const filteredBOMs = useMemo(() => {
        if (!boms) return [];
        return boms.filter(b =>
            b.productName.toLowerCase().includes(recipeSearch.toLowerCase())
        );
    }, [boms, recipeSearch]);

    const selectedBOM = useMemo(() => {
        if (!boms) return null;
        return boms.find(b => b.id === formData.bomId);
    }, [boms, formData.bomId]);

    const selectedProduct = useMemo(() => {
        if (!selectedBOM || !inventory) return null;
        return inventory.find(i => i.id === selectedBOM.productId);
    }, [selectedBOM, inventory]);

    const variants = useMemo(() => {
        return selectedProduct?.variants || [];
    }, [selectedProduct]);

    const selectedVariant = useMemo(() => {
        if (!variants) return null;
        return variants.find(v => v.id === formData.variantId);
    }, [variants, formData.variantId]);

    // Financial Analysis
    const analysis = useMemo(() => {
        if (!selectedBOM) return { subtotal: 0, total: 0, materialCost: 0, laborCost: 0 };

        let laborCostPerUnit = selectedBOM.laborCost || 0;
        if (selectedBOM.isParameterized && selectedBOM.laborFormula && selectedVariant) {
            try {
                laborCostPerUnit = bomService.resolveFormula(selectedBOM.laborFormula, selectedVariant.attributes);
            } catch (e) {
                logger.error("Formula resolution failed", e);
            }
        }

        let materialCostPerUnit = 0;
        if (selectedBOM.components && inventory) {
            selectedBOM.components.forEach(comp => {
                const mat = inventory.find(i => i.id === comp.materialId);
                let unitQty = comp.quantity;
                if (comp.formula && selectedVariant) {
                    try {
                        unitQty = bomService.resolveFormula(comp.formula, selectedVariant.attributes);
                    } catch (e) {
                        logger.error("Formula resolution failed for component", e);
                    }
                }
                materialCostPerUnit += unitQty * (mat?.cost || 0);
            });
        }

        const subtotal = (laborCostPerUnit + materialCostPerUnit) * formData.quantity;
        const total = subtotal - Number(formData.discount || 0);

        return {
            subtotal,
            total,
            materialCost: materialCostPerUnit * formData.quantity,
            laborCost: laborCostPerUnit * formData.quantity
        };
    }, [selectedBOM, selectedVariant, formData.quantity, formData.discount, companyConfig, inventory]);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (customerDropdownRef.current && !customerDropdownRef.current.contains(event.target as Node)) {
                setIsCustomerDropdownOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleRelease = () => {
        if (!formData.customerName || !formData.bomId) {
            notify("Identity and Recipe selection required.", "error");
            return;
        }
        onSave({
            ...initialData,
            ...formData,
            quantityPlanned: formData.quantity,
            productId: selectedBOM?.productId || '',
            productName: selectedVariant ? selectedVariant.name : (selectedBOM?.productName || ''),
            attributes: selectedVariant ? { ...selectedVariant.attributes, variantId: selectedVariant.id } : {},
            status: initialData?.status || 'Scheduled',
            logs: initialData?.logs || []
        });
    };

    return (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4 backdrop-blur-sm">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-6xl h-[90vh] flex flex-col overflow-hidden animate-in zoom-in-95">
                {/* Header Strip */}
                <div className="px-6 py-4 border-b border-slate-200 bg-white flex justify-between items-center shrink-0 header-container">
                    <div>
                        <h2 className="text-title flex items-center gap-3">
                            <Briefcase className="text-blue-600" /> {initialData ? 'Edit' : 'Create'} Production Order
                        </h2>
                        <p className="text-[11px] font-medium text-slate-400 mt-0.5">Order Ref: {formData.id}</p>
                    </div>
                    <div className="flex items-center gap-3">
                        <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-lg text-slate-400 transition-colors" title="Close" aria-label="Close production form"><X size={20} /></button>
                    </div>
                </div>

                <div className="flex flex-1 overflow-hidden" id="work-order-printable">
                    {/* Main Section (2/3) */}
                    <div className="w-2/3 p-6 overflow-y-auto border-r border-slate-200 space-y-8 custom-scrollbar bg-[#F8FAFC]">
                        {/* Top Input Row - Same Width */}
                        <div className="grid grid-cols-3 gap-6">
                            <div className="relative" ref={customerDropdownRef}>
                                <label className="text-label block mb-1.5 px-1">Customer</label>
                                <div className="relative w-full">
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-300" size={16} />
                                    <input
                                        type="text"
                                        className="w-full p-2.5 pl-10 border border-slate-200 rounded-lg bg-white focus:ring-4 focus:ring-blue-500/5 focus:border-blue-500 outline-none font-bold text-slate-800 text-[13px] transition-all shadow-sm"
                                        placeholder="Search or select customer..."
                                        value={customerSearch}
                                        onChange={e => { setCustomerSearch(e.target.value); setIsCustomerDropdownOpen(true); }}
                                        onFocus={() => setIsCustomerDropdownOpen(true)}
                                    />
                                    {isCustomerDropdownOpen && (
                                        <div className="absolute z-50 mt-1 w-full bg-white rounded-xl border border-slate-200 max-h-60 shadow-2xl overflow-y-auto custom-scrollbar animate-in fade-in zoom-in-95 duration-100">
                                            {filteredCustomers.length === 0 ? (
                                                <div className="p-4 text-center text-xs text-slate-400 italic">No customers found</div>
                                            ) : (
                                                filteredCustomers.map(name => (
                                                    <button
                                                        key={name}
                                                        onClick={() => { setFormData({ ...formData, customerName: name }); setCustomerSearch(name); setIsCustomerDropdownOpen(false); }}
                                                        className="w-full px-4 py-3 text-left hover:bg-blue-50 font-bold text-slate-800 text-[13px] border-b border-slate-50 last:border-0 transition-colors"
                                                    >
                                                        {name}
                                                    </button>
                                                ))
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>
                            <div>
                                <label className="text-label block mb-1.5 px-1">Date</label>
                                <input
                                    type="date"
                                    className="w-full p-2.5 border border-slate-200 rounded-lg bg-white focus:ring-4 focus:ring-blue-500/5 focus:border-blue-500 outline-none font-bold text-slate-800 text-[13px] transition-all shadow-sm"
                                    value={formData.date}
                                    onChange={e => setFormData({ ...formData, date: e.target.value })}
                                />
                            </div>
                            <div>
                                <label className="text-label block mb-1.5 px-1">Due Date</label>
                                <input
                                    type="date"
                                    className="w-full p-2.5 border border-slate-200 rounded-lg bg-white focus:ring-4 focus:ring-blue-500/5 focus:border-blue-500 outline-none font-bold text-slate-800 text-[13px] transition-all shadow-sm"
                                    value={formData.dueDate}
                                    onChange={e => setFormData({ ...formData, dueDate: e.target.value })}
                                />
                            </div>
                        </div>

                        {/* Priority Selection */}
                        <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
                            <h3 className="text-[13px] font-bold text-slate-800 mb-4 flex items-center gap-2">
                                <AlertCircle size={16} className="text-amber-500" /> Urgency / Priority Level
                            </h3>
                            <div className="grid grid-cols-4 gap-3">
                                {['Low', 'Normal', 'High', 'Critical'].map((level) => (
                                    <button
                                        key={level}
                                        type="button"
                                        onClick={() => setFormData({ ...formData, priority: level })}
                                        className={`px-4 py-3 rounded-xl text-xs font-bold transition-all border ${formData.priority === level
                                                ? level === 'Critical' ? 'bg-red-600 border-red-600 text-white shadow-md' :
                                                    level === 'High' ? 'bg-amber-600 border-amber-600 text-white shadow-md' :
                                                        level === 'Low' ? 'bg-slate-600 border-slate-600 text-white shadow-md' :
                                                            'bg-blue-600 border-blue-600 text-white shadow-md'
                                                : 'bg-white border-slate-200 text-slate-600 hover:border-blue-300'
                                            }`}
                                    >
                                        {level}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Production Settings Integration */}
                        <div className="grid grid-cols-2 gap-6">
                            <div>
                                <label className="text-label block mb-1.5 px-1">Target Work Center</label>
                                <select
                                    className="w-full p-2.5 border border-slate-200 rounded-lg bg-white focus:ring-4 focus:ring-blue-500/5 focus:border-blue-500 outline-none font-bold text-slate-800 text-[13px] transition-all shadow-sm"
                                    value={formData.workCenterId || companyConfig.productionSettings?.defaultWorkCenterId || ''}
                                    onChange={e => setFormData({ ...formData, workCenterId: e.target.value })}
                                >
                                    <option value="">Select Work Center...</option>
                                    {workCenters.map((wc: WorkCenter) => (
                                        <option key={wc.id} value={wc.id}>{wc.name}</option>
                                    ))}
                                </select>
                            </div>
                            {companyConfig.productionSettings?.trackMachineDownTime && (
                                <div>
                                    <label className="text-label block mb-1.5 px-1 text-rose-600 flex items-center gap-2">
                                        <AlertTriangle size={14} /> Resource Constraint
                                    </label>
                                    <div className="flex items-center gap-3 p-2.5 bg-rose-50 border border-rose-100 rounded-lg">
                                        <input
                                            type="checkbox"
                                            id="hasDowntime"
                                            className="w-4 h-4 text-rose-600 rounded border-rose-300 focus:ring-rose-500"
                                            checked={formData.hasDowntime || false}
                                            onChange={e => setFormData({ ...formData, hasDowntime: e.target.checked })}
                                        />
                                        <label htmlFor="hasDowntime" className="text-xs font-bold text-rose-800">Flag for Maintenance Review</label>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Middle Selection Area */}
                        <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
                            <div className="flex justify-between items-center mb-6">
                                <h3 className="text-[13px] font-bold text-slate-800">Recipe (BOM) Selection</h3>
                                <div className="relative w-64">
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-300" size={14} />
                                    <input
                                        type="text"
                                        className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-[13px] outline-none focus:bg-white focus:border-blue-500 transition-all font-medium"
                                        placeholder="Search recipes..."
                                        value={recipeSearch}
                                        onChange={e => setRecipeSearch(e.target.value)}
                                    />
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-4 max-h-60 overflow-y-auto custom-scrollbar pr-2 mb-6">
                                {filteredBOMs.map(bom => (
                                    <button
                                        key={bom.id}
                                        onClick={() => setFormData({ ...formData, bomId: bom.id, variantId: '' })}
                                        className={`p-4 rounded-xl border text-left transition-all flex flex-col justify-center gap-1 group
                                            ${formData.bomId === bom.id ? 'bg-blue-50 border-blue-500 shadow-sm' : 'bg-white border-slate-200 hover:border-blue-300 hover:bg-slate-50'}`}
                                    >
                                        <div className={`font-bold text-[13px] truncate ${formData.bomId === bom.id ? 'text-blue-700' : 'text-slate-800'}`}>{bom.productName}</div>
                                        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-tight">ID: {bom.id}</div>
                                    </button>
                                ))}
                            </div>

                            {variants.length > 0 && (
                                <div className="border-t border-slate-100 pt-6 animate-in fade-in slide-in-from-top-2 duration-300">
                                    <h3 className="text-[13px] font-bold text-slate-800 mb-4 flex items-center gap-2">
                                        <Layers size={16} className="text-blue-500" /> Technical Specifications
                                    </h3>
                                    <div className="grid grid-cols-2 gap-6 bg-slate-50 p-4 rounded-xl border border-slate-100 mb-6">
                                        {Object.entries(selectedVariant?.attributes || {}).map(([key, value]) => {
                                            if (key === 'variantId') return null;
                                            return (
                                                <div key={key}>
                                                    <label className="text-label block mb-1.5 px-1">{key}</label>
                                                    <input
                                                        type="text"
                                                        readOnly
                                                        className="w-full p-2 border border-slate-200 rounded-lg bg-white/50 text-[12px] font-bold text-slate-600"
                                                        value={String(value)}
                                                    />
                                                </div>
                                            );
                                        })}
                                    </div>
                                    <h3 className="text-[13px] font-bold text-slate-800 mb-4 flex items-center gap-2">
                                        <Layers size={16} className="text-blue-500" /> Select Product Variant
                                    </h3>
                                    <div className="grid grid-cols-3 gap-3">
                                        {variants.map(variant => (
                                            <button
                                                key={variant.id}
                                                onClick={() => setFormData({ ...formData, variantId: variant.id })}
                                                className={`p-3 rounded-xl border text-left transition-all flex flex-col gap-1
                                                    ${formData.variantId === variant.id ? 'bg-blue-600 border-blue-600 text-white shadow-md' : 'bg-slate-50 border-slate-200 hover:border-blue-300 hover:bg-white text-slate-700'}`}
                                            >
                                                <div className="font-bold text-[13px] truncate">{variant.name}</div>
                                                <div className={`text-[9px] font-bold uppercase tracking-tight ${formData.variantId === variant.id ? 'text-blue-100' : 'text-slate-400'}`}>
                                                    {Object.entries(variant.attributes).map(([k, v]) => `${k}: ${v}`).join(' | ')}
                                                </div>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Bottom Table */}
                        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
                            <table className="w-full text-left">
                                <thead className="bg-slate-50 border-b border-slate-200">
                                    <tr>
                                        <th className="table-header">ITEM DESCRIPTION</th>
                                        <th className="table-header text-center">QUANTITY</th>
                                        <th className="table-header text-center">UNIT COST</th>
                                        <th className="table-header text-right">TOTAL</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {selectedBOM ? (
                                        <tr>
                                            <td className="table-body-cell">
                                                <div className="font-bold text-slate-800 text-[13px]">{selectedBOM.productName}</div>
                                                <div className="text-[10px] text-slate-400 font-mono">BOM: {selectedBOM.id}</div>
                                            </td>
                                            <td className="table-body-cell text-center">
                                                <input
                                                    type="number"
                                                    className="w-24 p-2 bg-white border border-slate-200 rounded-lg text-center font-bold text-slate-800 text-[13px] outline-none focus:ring-4 focus:ring-blue-500/5 focus:border-blue-500 transition-all finance-nums"
                                                    value={formData.quantity}
                                                    onChange={e => setFormData({ ...formData, quantity: parseFloat(e.target.value) || 1 })}
                                                />
                                            </td>
                                            <td className="table-body-cell text-center font-bold text-slate-600 text-[13px] finance-nums">{currency}{(selectedBOM.laborCost || 0).toFixed(2)}</td>
                                            <td className="table-body-cell text-right font-bold text-slate-900 text-[13px] finance-nums">{currency}{((selectedBOM.laborCost || 0) * formData.quantity).toFixed(2)}</td>
                                        </tr>
                                    ) : (
                                        <tr>
                                            <td colSpan={4} className="p-12 text-center text-slate-400 font-medium italic text-[13px]">Awaiting Recipe Selection</td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* Right Summary Area (1/3) */}
                    <div className="w-1/3 p-6 flex flex-col gap-6 overflow-y-auto custom-scrollbar bg-white">
                        <div className="bg-[#F8FAFC] rounded-xl border border-slate-200 p-6 flex flex-col gap-8 shrink-0 shadow-sm">
                            <h3 className="text-lg font-bold text-slate-900 flex items-center gap-3">
                                <Calculator size={20} className="text-blue-500" /> Order Summary
                            </h3>
                            <div className="space-y-4">
                                <div className="flex justify-between items-center text-sm">
                                    <span className="text-slate-500 font-medium">Material Cost</span>
                                    <span className="text-slate-900 font-bold">{currency}{analysis.materialCost.toFixed(2)}</span>
                                </div>
                                <div className="flex justify-between items-center text-sm">
                                    <span className="text-slate-500 font-medium">Labor Cost</span>
                                    <span className="text-slate-900 font-bold">{currency}{analysis.laborCost.toFixed(2)}</span>
                                </div>
                                <div className="pt-4 border-t border-slate-100 flex justify-between items-center text-sm">
                                    <span className="text-slate-500 font-medium">Net Subtotal</span>
                                    <span className="text-slate-900 font-bold">{currency}{analysis.subtotal.toFixed(2)}</span>
                                </div>
                                <div className="flex justify-between items-center text-sm">
                                    <span className="text-slate-500 font-medium">Voucher Discount</span>
                                    <div className="flex items-center gap-2">
                                        <span className="text-[11px] text-slate-400 font-bold">{currency}</span>
                                        <input
                                            type="number"
                                            className="w-24 p-2 bg-white border border-slate-200 rounded-lg text-right font-bold text-[13px] outline-none focus:border-blue-500 transition-all shadow-sm finance-nums"
                                            value={formData.discount}
                                            onChange={e => setFormData({ ...formData, discount: parseFloat(e.target.value) || 0 })}
                                        />
                                    </div>
                                </div>
                                <div className="pt-6 border-t border-slate-300 flex justify-between items-center">
                                    <span className="text-sm font-bold text-slate-900 uppercase tracking-tight">Total Amount</span>
                                    <span className="text-3xl font-bold text-blue-600 tracking-tighter leading-none finance-nums">{currency}{analysis.total.toFixed(2)}</span>
                                </div>
                            </div>
                        </div>

                        <div className="bg-blue-50 border border-blue-100 p-4 rounded-xl flex gap-3 shrink-0">
                            <Info size={20} className="text-blue-600 shrink-0 mt-0.5" />
                            <div>
                                <h4 className="text-label text-blue-600 mb-1">Manufacturing Note</h4>
                                <p className="text-[10px] text-blue-800/80 leading-relaxed font-medium">
                                    Orders are integrated with shop floor terminals. Accurate BOM specifications prevent production material variance.
                                </p>
                            </div>
                        </div>

                        <div className="space-y-3 mt-auto shrink-0">
                            <button
                                onClick={handleRelease}
                                className="zoho-button-primary w-full !py-4 text-sm uppercase tracking-tight flex items-center justify-center gap-3 shadow-lg shadow-blue-500/20"
                            >
                                <Plus size={18} /> Release Order
                            </button>
                            <button
                                onClick={onClose}
                                className="w-full py-3 text-slate-400 font-bold text-[11px] uppercase tracking-tight hover:text-rose-600 transition-colors text-center"
                            >
                                Abandon Draft
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

// --- MATERIAL RECONCILIATION MODAL ---
interface MaterialReconciliationModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: (reconciliationData: { id: string, name: string, planned: number, used: number, destroyed: number }[]) => void;
    workOrder: WorkOrder;
    inventory: Item[];
    boms: BillOfMaterial[];
}

export const MaterialReconciliationModal: React.FC<MaterialReconciliationModalProps> = ({ isOpen, onClose, onConfirm, workOrder, inventory, boms }) => {
    const [reconciliationItems, setReconciliationItems] = useState<{ id: string, name: string, planned: number, used: number, destroyed: number }[]>([]);
    useEffect(() => {
        if (isOpen && workOrder) {
            const bom = boms.find(b => b.id === workOrder.bomId);
            const items: { id: string, name: string, planned: number, used: number, destroyed: number }[] = [];

            if (bom) {
                bom.components.forEach(comp => {
                    const invItem = inventory.find(i => i.id === comp.materialId);
                    if (invItem) {
                        let unitQty = comp.quantity;

                        // Use formula if available and work order has attributes
                        if (comp.formula && workOrder.attributes) {
                            try {
                                unitQty = bomService.resolveFormula(comp.formula, workOrder.attributes);
                            } catch (e) {
                                logger.error(`Failed to resolve formula for ${invItem.name}:`, e);
                            }
                        }

                        const planned = unitQty * workOrder.quantityPlanned;
                        items.push({
                            id: invItem.id,
                            name: invItem.name,
                            planned: planned,
                            used: planned,
                            destroyed: 0
                        });
                    }
                });
            }
            setReconciliationItems(items);
        }
    }, [isOpen, workOrder, boms, inventory]);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[80] bg-black/50 flex items-center justify-center p-4 backdrop-blur-sm">
            <div className="bg-white w-full max-w-lg rounded-xl shadow-2xl overflow-hidden animate-in zoom-in-95">
                <div className="px-6 py-4 border-b border-slate-200 bg-slate-50 flex justify-between items-center">
                    <h3 className="font-bold text-slate-900 flex items-center gap-3">
                        <Scale size={20} className="text-blue-600" /> Consumption Reconciliation
                    </h3>
                    <button onClick={onClose} className="p-1 hover:bg-slate-200 rounded-lg transition-colors">
                        <X size={20} className="text-slate-400" />
                    </button>
                </div>
                <div className="p-6 overflow-y-auto max-h-[60vh] space-y-4 custom-scrollbar">
                    {reconciliationItems.map(item => (
                        <div key={item.id} className="p-4 border border-slate-200 rounded-xl bg-white shadow-sm">
                            <div className="text-label mb-4 text-sm">{item.name}</div>
                            <div className="grid grid-cols-3 gap-4 items-center">
                                <div className="text-center p-2.5 bg-slate-50 rounded-lg border border-slate-100 shadow-inner">
                                    <div className="text-label text-center mb-1 text-[11px]">Target</div>
                                    <div className="font-bold text-slate-700 text-[13px] finance-nums">{item.planned}</div>
                                </div>
                                <div>
                                    <label className="text-label block mb-1.5 px-1 text-center">Used</label>
                                    <input
                                        type="number"
                                        className="w-full p-2.5 border border-slate-200 rounded-lg text-center font-bold text-[13px] bg-white outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all finance-nums"
                                        value={item.used}
                                        onChange={e => setReconciliationItems(prev => prev.map(i => i.id === item.id ? { ...i, used: parseFloat(e.target.value) || 0 } : i))}
                                    />
                                </div>
                                <div>
                                    <label className="text-label block mb-1.5 px-1 text-center text-rose-500">Scrap</label>
                                    <input
                                        type="number"
                                        className="w-full p-2.5 border border-rose-100 rounded-lg text-center font-bold text-[13px] text-rose-600 bg-rose-50/50 outline-none focus:border-rose-500 focus:ring-4 focus:ring-rose-500/10 transition-all finance-nums"
                                        value={item.destroyed}
                                        onChange={e => setReconciliationItems(prev => prev.map(i => i.id === item.id ? { ...i, destroyed: parseFloat(e.target.value) || 0 } : i))}
                                    />
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
                <div className="p-4 border-t border-slate-200 bg-slate-50 flex gap-3">
                    <button onClick={onClose} className="flex-1 py-3 text-xs font-bold uppercase tracking-wider text-slate-500 hover:text-slate-800 transition-colors">
                        Cancel
                    </button>
                    <button
                        onClick={() => onConfirm(reconciliationItems)}
                        className="zoho-button-primary flex-[2] !py-3 flex items-center justify-center gap-2"
                    >
                        <CheckCircle size={18} /> Verify Usage
                    </button>
                </div>
            </div>
        </div>
    );
};
