import React, { useState } from 'react';
import { X, Calculator, ChevronDown, ChevronUp, Info, Copy } from 'lucide-react';
import { usePricingCalculator, FinishingOptionWithMaterial } from '../context/PricingCalculatorContext';
import { useAuth } from '../context/AuthContext';
import { currencyService } from '../services/currencyService';

interface PricingCalculatorProps {
    // No props needed - uses context
}

const PricingCalculator: React.FC<PricingCalculatorProps> = () => {
    const { companyConfig } = useAuth();
    const currency = currencyService.getCurrency(currencyService.getBaseCurrency())?.symbol || '$';

    const {
        isOpen,
        pages,
        copies,
        finishingOptions,
        marketAdjustmentEnabled,
        marketAdjustments,
        isLoading,
        paperCost,
        tonerCost,
        finishingCost,
        baseCost,
        marketAdjustmentTotal,
        finalPrice,
        examinationPricingResult,
        setIsOpen,
        setPages,
        setCopies,
        toggleFinishingOption,
        updateFinishingOption,
        setMarketAdjustmentEnabled,
        resetCalculator,
    } = usePricingCalculator();

    const [bomExpanded, setBomExpanded] = useState(true);
    const [finishingExpanded, setFinishingExpanded] = useState(true);
    const [marketExpanded, setMarketExpanded] = useState(true);

    if (!isOpen) return null;

    const handlePagesChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const value = parseInt(e.target.value, 10);
        if (!isNaN(value) && value >= 1 && value <= 10000) {
            setPages(value);
        } else if (e.target.value === '') {
            setPages(1);
        }
    };

    const handleCopiesChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const value = parseInt(e.target.value, 10);
        if (!isNaN(value) && value >= 1 && value <= 10000) {
            setCopies(value);
        } else if (e.target.value === '') {
            setCopies(1);
        }
    };

    const formatCurrency = (value: number) => {
        return `${currency} ${value.toFixed(2)}`;
    };

    // Helper to calculate material units needed
    const calculateMaterialUnits = (option: FinishingOptionWithMaterial) => {
        if (option.coversPerCopy === 0) return 0;
        const totalNeeded = copies * option.coversPerCopy;
        return Math.ceil(totalNeeded / option.materialConversionRate);
    };

    return (
        <div
            className="fixed inset-0 z-[9999] bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-4 sm:p-8 animate-in fade-in duration-200"
            onClick={(e) => {
                if (e.target === e.currentTarget) setIsOpen(false);
            }}
        >
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-[600px] max-h-[90vh] overflow-hidden flex flex-col">
                {/* Header */}
                <div className="flex items-center justify-between p-6 border-b border-slate-100">
                    <div className="flex items-center gap-3">
                        <div className="p-2.5 bg-blue-100 rounded-xl">
                            <Calculator size={24} className="text-blue-600" />
                        </div>
                        <div>
                            <h2 className="text-lg font-bold text-slate-800">Pricing Calculator</h2>
                            <p className="text-sm text-slate-500">Real-time BOM pricing</p>
                        </div>
                    </div>
                    <button
                        onClick={() => setIsOpen(false)}
                        className="p-3 hover:bg-slate-100 rounded-2xl text-slate-400 hover:text-slate-600 transition-all"
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-6 space-y-5 custom-scrollbar">
                    {/* Page Count & Copies Input */}
                    <div className="bg-slate-50 rounded-2xl p-5">
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-semibold text-slate-700 mb-3">
                                    Number of Pages
                                </label>
                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={() => setPages(Math.max(1, pages - 1))}
                                        className="w-9 h-9 flex items-center justify-center rounded-lg bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors"
                                    >
                                        -
                                    </button>
                                    <input
                                        type="number"
                                        min="1"
                                        max="10000"
                                        value={pages}
                                        onChange={handlePagesChange}
                                        className="flex-1 h-9 px-3 rounded-lg border border-slate-200 text-center text-slate-800 font-medium focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    />
                                    <button
                                        onClick={() => setPages(Math.min(10000, pages + 1))}
                                        className="w-9 h-9 flex items-center justify-center rounded-lg bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors"
                                    >
                                        +
                                    </button>
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-semibold text-slate-700 mb-3">
                                    <Copy size={14} className="inline mr-1" />
                                    Number of Copies
                                </label>
                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={() => setCopies(Math.max(1, copies - 1))}
                                        className="w-9 h-9 flex items-center justify-center rounded-lg bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors"
                                    >
                                        -
                                    </button>
                                    <input
                                        type="number"
                                        min="1"
                                        max="10000"
                                        value={copies}
                                        onChange={handleCopiesChange}
                                        className="flex-1 h-9 px-3 rounded-lg border border-slate-200 text-center text-slate-800 font-medium focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    />
                                    <button
                                        onClick={() => setCopies(Math.min(10000, copies + 1))}
                                        className="w-9 h-9 flex items-center justify-center rounded-lg bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors"
                                    >
                                        +
                                    </button>
                                </div>
                            </div>
                        </div>
                        <p className="text-xs text-slate-400 mt-3">
                            Sheets needed (double-sided): {Math.ceil(pages / 2) * copies} | Total pages: {pages * copies}
                        </p>
                    </div>

                    {/* BOM Calculator */}
                    <div className="bg-slate-50 rounded-2xl overflow-hidden">
                        <button
                            onClick={() => setBomExpanded(!bomExpanded)}
                            className="w-full flex items-center justify-between p-5 hover:bg-slate-100/50 transition-colors"
                        >
                            <div className="flex items-center gap-2">
                                <span className="text-sm font-semibold text-slate-700">Bill of Materials (BOM)</span>
                                <span className="text-xs bg-blue-100 text-blue-600 px-2 py-0.5 rounded-full">Real-time</span>
                            </div>
                            {bomExpanded ? <ChevronUp size={18} className="text-slate-400" /> : <ChevronDown size={18} className="text-slate-400" />}
                        </button>

                        {bomExpanded && (
                            <div className="px-5 pb-5 space-y-3">
                                {isLoading ? (
                                    <div className="text-center py-4 text-slate-400">Loading materials...</div>
                                ) : (
                                    <>
                                        <div className="flex justify-between items-center py-2 border-b border-slate-100">
                                            <div className="flex items-center gap-2">
                                                <span className="text-sm text-slate-600">Paper Cost</span>
                                                <span className="text-xs text-slate-400">({Math.ceil(pages / 2) * copies} sheets)</span>
                                            </div>
                                            <span className="text-sm font-medium text-slate-800">{formatCurrency(paperCost)}</span>
                                        </div>
                                        <div className="flex justify-between items-center py-2 border-b border-slate-100">
                                            <div className="flex items-center gap-2">
                                                <span className="text-sm text-slate-600">Toner Cost</span>
                                                <span className="text-xs text-slate-400">({pages * copies} pages)</span>
                                            </div>
                                            <span className="text-sm font-medium text-slate-800">{formatCurrency(tonerCost)}</span>
                                        </div>
                                        <div className="flex justify-between items-center py-3 bg-white rounded-xl px-3 mt-2">
                                            <span className="text-sm font-semibold text-slate-700">BOM Total</span>
                                            <span className="text-base font-bold text-blue-600">{formatCurrency(baseCost - finishingCost)}</span>
                                        </div>
                                    </>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Finishing Options */}
                    <div className="bg-slate-50 rounded-2xl overflow-hidden">
                        <button
                            onClick={() => setFinishingExpanded(!finishingExpanded)}
                            className="w-full flex items-center justify-between p-5 hover:bg-slate-100/50 transition-colors"
                        >
                            <div className="flex items-center gap-2">
                                <span className="text-sm font-semibold text-slate-700">Finishing Options</span>
                                <span className="text-xs bg-emerald-100 text-emerald-600 px-2 py-0.5 rounded-full">
                                    {finishingOptions.filter(o => o.coversPerCopy > 0).length} active
                                </span>
                            </div>
                            {finishingExpanded ? <ChevronUp size={18} className="text-slate-400" /> : <ChevronDown size={18} className="text-slate-400" />}
                        </button>

                        {finishingExpanded && (
                            <div className="px-5 pb-5 space-y-3">
                                {finishingOptions.map(option => {
                                    const materialUnitsNeeded = calculateMaterialUnits(option);
                                    const optionCost = materialUnitsNeeded * option.cost;

                                    return (
                                        <div key={option.id} className="flex items-center justify-between py-2">
                                            <div className="flex items-center gap-3">
                                                <button
                                                    onClick={() => toggleFinishingOption(option.id)}
                                                    className={`w-10 h-6 rounded-full transition-colors relative ${option.coversPerCopy > 0 ? 'bg-blue-600' : 'bg-slate-200'}`}
                                                >
                                                    <span className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-transform ${option.coversPerCopy > 0 ? 'left-5' : 'left-1'}`} />
                                                </button>
                                                <div>
                                                    <span className={`text-sm block ${option.coversPerCopy > 0 ? 'text-slate-700' : 'text-slate-400'}`}>
                                                        {option.name}
                                                    </span>
                                                    {option.coversPerCopy > 0 && (
                                                        <span className="text-xs text-slate-400">
                                                            {option.coversPerCopy}/copy | {option.materialConversionRate} per unit
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                {option.coversPerCopy > 0 && (
                                                    <div className="flex flex-col items-end">
                                                        <div className="flex items-center gap-1">
                                                            <span className="text-xs text-slate-400">covers/copy:</span>
                                                            <input
                                                                type="number"
                                                                min="0"
                                                                value={option.coversPerCopy}
                                                                onChange={(e) => updateFinishingOption(option.id, parseInt(e.target.value) || 0)}
                                                                className="w-14 h-7 px-1 text-right text-sm rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                                            />
                                                        </div>
                                                        <span className="text-xs text-slate-400">
                                                            {copies * option.coversPerCopy} total → {materialUnitsNeeded} unit(s)
                                                        </span>
                                                    </div>
                                                )}
                                                {option.coversPerCopy > 0 && (
                                                    <span className="text-sm font-medium text-slate-600 w-20 text-right">
                                                        {formatCurrency(optionCost)}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}

                                {finishingCost > 0 && (
                                    <div className="flex justify-between items-center py-3 bg-white rounded-xl px-3 mt-2">
                                        <span className="text-sm font-semibold text-slate-700">Finishing Total</span>
                                        <span className="text-base font-bold text-blue-600">{formatCurrency(finishingCost)}</span>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Market Adjustments */}
                    <div className="bg-slate-50 rounded-2xl overflow-hidden">
                        <button
                            onClick={() => setMarketExpanded(!marketExpanded)}
                            className="w-full flex items-center justify-between p-5 hover:bg-slate-100/50 transition-colors"
                        >
                            <div className="flex items-center gap-2">
                                <span className="text-sm font-semibold text-slate-700">Market Adjustments</span>
                                {marketAdjustmentEnabled && <span className="text-xs bg-amber-100 text-amber-600 px-2 py-0.5 rounded-full">Active</span>}
                            </div>
                            {marketExpanded ? <ChevronUp size={18} className="text-slate-400" /> : <ChevronDown size={18} className="text-slate-400" />}
                        </button>

                        {marketExpanded && (
                            <div className="px-5 pb-5 space-y-3">
                                {/* Enable toggle */}
                                <div className="flex items-center justify-between py-2">
                                    <span className="text-sm text-slate-600">Enable Market Adjustments</span>
                                    <button
                                        onClick={() => setMarketAdjustmentEnabled(!marketAdjustmentEnabled)}
                                        className={`w-10 h-6 rounded-full transition-colors relative ${marketAdjustmentEnabled ? 'bg-blue-600' : 'bg-slate-200'}`}
                                    >
                                        <span className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-transform ${marketAdjustmentEnabled ? 'left-5' : 'left-1'}`} />
                                    </button>
                                </div>

                                {marketAdjustmentEnabled && (
                                    <>
                                        {/* System market adjustments */}
                                        {marketAdjustments.length > 0 && (
                                            <div className="space-y-2">
                                                <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">System Adjustments</p>
                                                {marketAdjustments.map(adj => (
                                                    <div key={adj.id} className="flex justify-between items-center py-2 bg-white rounded-lg px-3">
                                                        <div className="flex items-center gap-2">
                                                            <Info size={14} className="text-slate-400" />
                                                            <span className="text-sm text-slate-600">{adj.name}</span>
                                                        </div>
                                                        <span className="text-sm font-medium text-slate-800">
                                                            {adj.type?.toUpperCase() === 'PERCENTAGE' || adj.type?.toUpperCase() === 'PERCENT'
                                                                ? `${adj.value}%`
                                                                : `${currency} ${adj.value}`}
                                                        </span>
                                                    </div>
                                                ))}
                                            </div>
                                        )}

                                        {marketAdjustmentTotal > 0 && (
                                            <div className="flex justify-between items-center py-3 bg-white rounded-xl px-3 mt-2">
                                                <span className="text-sm font-semibold text-slate-700">Adjustment Total</span>
                                                <span className="text-base font-bold text-amber-600">{formatCurrency(marketAdjustmentTotal)}</span>
                                            </div>
                                        )}
                                    </>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Examination Summary */}
                    {examinationPricingResult && (
                        <div className="p-4 border-b border-slate-100">
                            <div className="flex items-center justify-between mb-3">
                                <h3 className="text-sm font-semibold text-slate-700">Examination Summary</h3>
                                <span className="text-xs font-medium text-emerald-600 bg-emerald-50 px-2 py-1 rounded-full">
                                    Auto-calculated
                                </span>
                            </div>

                            {/* Line Items */}
                            <div className="space-y-2 mb-4">
                                {examinationPricingResult.lineItems.map((item, idx) => (
                                    <div key={idx} className="flex justify-between items-center py-2 bg-white rounded-lg px-3">
                                        <span className="text-sm text-slate-600">{item.description}</span>
                                        <span className="text-sm font-medium text-slate-800">{formatCurrency(item.total)}</span>
                                    </div>
                                ))}
                            </div>

                            {/* Subtotal */}
                            <div className="flex justify-between items-center py-2 border-t border-slate-200">
                                <span className="text-sm font-medium text-slate-600">Subtotal</span>
                                <span className="text-sm font-semibold text-slate-800">{formatCurrency(examinationPricingResult.subtotal)}</span>
                            </div>

                            {/* Tax Breakdown */}
                            {examinationPricingResult.taxBreakdown.length > 0 && (

                                <div className="mt-3 space-y-2">
                                    <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Taxes</p>
                                    {examinationPricingResult.taxBreakdown.map((tax, idx) => (
                                        <div key={idx} className="flex justify-between items-center py-1">
                                            <span className="text-sm text-slate-600">{tax.name}</span>
                                            <span className="text-sm font-medium text-slate-800">{formatCurrency(tax.amount)}</span>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {/* Fees */}
                            {examinationPricingResult.fees.length > 0 && (
                                <div className="mt-3 space-y-2">
                                    <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Fees</p>
                                    {examinationPricingResult.fees.map((fee, idx) => (
                                        <div key={idx} className="flex justify-between items-center py-1">
                                            <span className="text-sm text-slate-600">{fee.name}</span>
                                            <span className="text-sm font-medium text-slate-800">{formatCurrency(fee.amount)}</span>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {/* Grand Total */}
                            <div className="flex justify-between items-center py-3 bg-emerald-50 rounded-xl px-3 mt-4">
                                <span className="text-sm font-semibold text-emerald-800">Grand Total</span>
                                <span className="text-xl font-bold text-emerald-600">{formatCurrency(examinationPricingResult.grandTotal)}</span>
                            </div>
                        </div>
                    )}
                </div>

                {/* Price Summary */}
                <div className="border-t border-slate-100 p-6 bg-slate-50">
                    <div className="space-y-2 mb-4">
                        <div className="flex justify-between text-sm">
                            <span className="text-slate-500">Paper + Toner</span>
                            <span className="text-slate-700">{formatCurrency(paperCost + tonerCost)}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                            <span className="text-slate-500">Finishing</span>
                            <span className="text-slate-700">{formatCurrency(finishingCost)}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                            <span className="text-slate-500">Market Adjustment</span>
                            <span className="text-slate-700">{formatCurrency(marketAdjustmentTotal)}</span>
                        </div>
                    </div>

                    <div className="flex items-center justify-between pt-4 border-t border-slate-200">
                        <div>
                            <span className="text-sm text-slate-500">Final Price ({copies} copies)</span>
                            <button
                                onClick={resetCalculator}
                                className="block text-xs text-blue-500 hover:text-blue-700 mt-1"
                            >
                                Reset Calculator
                            </button>
                        </div>
                        <span className="text-3xl font-bold text-emerald-600">{formatCurrency(finalPrice)}</span>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default PricingCalculator;
