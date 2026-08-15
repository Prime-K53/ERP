import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { logger } from '@/services/logger';
import { Item, MarketAdjustment, BOMTemplate, FinishingOption, ExaminationBatch, ExaminationClass, ExaminationSubject } from '../types';
import { dbService } from '../services/db';

// Types for the calculator
export interface Addon {
    id: string;
    name: string;
    cost: number;
    enabled: boolean;
}

export interface FinishingOptionWithMaterial extends FinishingOption {
    type: string;
    cost: number;
    priceAdjustment: number;
    materialConversionRate: number; // e.g., 100 covers per ream
    coversPerCopy: number; // how many covers needed per copy
}

export interface PricingCalculatorState {
    pages: number;
    copies: number;
    finishingOptions: FinishingOptionWithMaterial[];
    marketAdjustmentEnabled: boolean;
}

// Examination pricing result interface
export interface ExaminationPricingResult {
    subtotal: number;
    appliedDiscounts: {
        name: string;
        amount: number;
        type: 'PERCENTAGE' | 'FIXED';
    }[];
    taxBreakdown: {
        name: string;
        rate: number;
        amount: number;
    }[];
    fees: {
        name: string;
        amount: number;
    }[];
    grandTotal: number;
    lineItems: {
        description: string;
        quantity: number;
        unitPrice: number;
        total: number;
    }[];
}

interface PricingCalculatorContextType {
    // State
    isOpen: boolean;
    pages: number;
    copies: number;
    finishingOptions: FinishingOptionWithMaterial[];
    marketAdjustmentEnabled: boolean;
    inventory: Item[];
    marketAdjustments: MarketAdjustment[];
    bomTemplates: BOMTemplate[];
    isLoading: boolean;

    // Examination State
    examinationBatch: ExaminationBatch | null;
    examinationClasses: ExaminationClass[];

    // Computed values
    paperCost: number;
    tonerCost: number;
    finishingCost: number;
    baseCost: number;
    marketAdjustmentTotal: number;
    finalPrice: number;
    examinationPricingResult: ExaminationPricingResult | null;

    // Actions
    setIsOpen: (open: boolean) => void;
    setPages: (pages: number) => void;
    setCopies: (copies: number) => void;
    toggleFinishingOption: (optionId: string) => void;
    updateFinishingOption: (optionId: string, coversPerCopy: number) => void;
    setMarketAdjustmentEnabled: (enabled: boolean) => void;
    setExaminationBatch: (batch: ExaminationBatch | null) => void;
    setExaminationClasses: (classes: ExaminationClass[]) => void;
    calculateExaminationTotal: (batch: ExaminationBatch, classes: ExaminationClass[]) => ExaminationPricingResult;
    resetCalculator: () => void;
}

// Default finishing options with their material conversion rates
const defaultFinishingOptions: FinishingOptionWithMaterial[] = [
    {
        id: 'binding',
        type: 'Binding',
        name: 'Binding',
        enabled: true,
        price: 0,
        items: [],
        quantity: 0,
        cost: 0,
        priceAdjustment: 0,
        materialConversionRate: 1, // per binding
        coversPerCopy: 0
    },
    {
        id: 'pinning',
        type: 'Stapling',
        name: 'Pinning/Stapling',
        enabled: true,
        price: 0,
        items: [],
        quantity: 0,
        cost: 0,
        priceAdjustment: 0,
        materialConversionRate: 5000, // staples come in boxes of 5000
        coversPerCopy: 0
    },
    {
        id: 'covers',
        type: 'Covers',
        name: 'Covers',
        enabled: true,
        price: 0,
        items: [],
        quantity: 0,
        cost: 0,
        priceAdjustment: 0,
        materialConversionRate: 100, // covers come in reams of 100
        coversPerCopy: 0
    },
];

const PricingCalculatorContext = createContext<PricingCalculatorContextType | undefined>(undefined);

export const PricingCalculatorProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [pages, setPages] = useState(1);
    const [copies, setCopies] = useState(1);
    const [finishingOptions, setFinishingOptions] = useState<FinishingOptionWithMaterial[]>(defaultFinishingOptions);
    const [marketAdjustmentEnabled, setMarketAdjustmentEnabled] = useState(true);
    const [inventory, setInventory] = useState<Item[]>([]);
    const [marketAdjustments, setMarketAdjustments] = useState<MarketAdjustment[]>([]);
    const [bomTemplates, setBomTemplates] = useState<BOMTemplate[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    // Examination state
    const [examinationBatch, setExaminationBatch] = useState<ExaminationBatch | null>(null);
    const [examinationClasses, setExaminationClasses] = useState<ExaminationClass[]>([]);

    // Load inventory, market adjustments, and BOM templates on mount
    useEffect(() => {
        const loadData = async () => {
            try {
                setIsLoading(true);
                const [inv, adjustments, templates] = await Promise.all([
                    dbService.getAll<Item>('inventory'),
                    dbService.getAll<MarketAdjustment>('marketAdjustments'),
                    dbService.getAll<BOMTemplate>('bomTemplates'),
                ]);
                setInventory(inv);
                setMarketAdjustments(adjustments.filter(a => a.active || a.isActive));
                setBomTemplates(templates);

                // Find finishing materials from inventory and update options with real costs and conversion rates
                const binding = inv.find(i => i.name?.toLowerCase().includes('binding'));
                const pinning = inv.find(i => {
                    const name = i.name?.toLowerCase() || '';
                    return name.includes('staple') || /\bpins?\b/.test(name);
                });
                const covers = inv.find(i => i.name?.toLowerCase().includes('cover') || i.name?.toLowerCase().includes('card'));

                setFinishingOptions(prev => prev.map(opt => {
                    let materialCost = 0;
                    let conversionRate = 1;
                    let materialId: string | undefined;

                    if (opt.id === 'binding' && binding) {
                        materialCost = Number(binding.cost_price ?? binding.cost_per_unit ?? binding.cost ?? 0);
                        conversionRate = Number(binding.conversionRate ?? binding.conversion_rate ?? 1);
                        materialId = binding.id;
                    } else if (opt.id === 'pinning' && pinning) {
                        materialCost = Number(pinning.cost_price ?? pinning.cost_per_unit ?? pinning.cost ?? 0);
                        conversionRate = Number(pinning.conversionRate ?? pinning.conversion_rate ?? 5000);
                        materialId = pinning.id;
                    } else if (opt.id === 'covers' && covers) {
                        materialCost = Number(covers.cost_price ?? covers.cost_per_unit ?? covers.cost ?? 0);
                        conversionRate = Number(covers.conversionRate ?? covers.conversion_rate ?? 100);
                        materialId = covers.id;
                    }

                    return {
                        ...opt,
                        cost: materialCost,
                        materialConversionRate: conversionRate,
                        materialId
                    };
                }));
            } catch (error) {
                logger.error('Failed to load pricing data:', error);
            } finally {
                setIsLoading(false);
            }
        };

        if (isOpen) {
            loadData();
        }
    }, [isOpen]);

    // Find paper and toner from inventory
    const paper = useMemo(() => {
        return inventory.find(i =>
            i.type === 'Material' &&
            (i.name?.toLowerCase().includes('paper') || String(i.category || '').toLowerCase() === 'paper')
        );
    }, [inventory]);

    const toner = useMemo(() => {
        return inventory.find(i =>
            i.type === 'Material' &&
            (i.name?.toLowerCase().includes('toner') || String(i.category || '').toLowerCase() === 'toner')
        );
    }, [inventory]);

    // Calculate paper cost based on pages and copies (double-sided printing)
    // Uses same formula as calculateItemFinancials in utils/pricing.ts
    const paperCost = useMemo(() => {
        if (!paper) return 0;

        // Sheets = ceil(pages / 2) * copies (double-sided)
        const sheetsPerCopy = Math.ceil(pages / 2);
        const totalSheets = sheetsPerCopy * copies;
        const reamSize = Number(paper.conversionRate ?? paper.conversion_rate ?? 500);
        const paperUnitCost = Number(paper.cost_price ?? paper.cost_per_unit ?? paper.cost ?? 0);
        const costPerSheet = reamSize > 0 ? paperUnitCost / reamSize : 0;

        return Number((totalSheets * costPerSheet).toFixed(2));
    }, [paper, pages, copies]);

    // Calculate toner cost
    // Uses same formula as calculateItemFinancials in utils/pricing.ts
    const tonerCost = useMemo(() => {
        if (!toner) return 0;

        // Toner usage: pages * copies * (toner cost / capacity)
        const capacity = 20000; // standard page capacity per toner unit
        const totalPages = pages * copies;
        const tonerUnitCost = Number(toner.cost_price ?? toner.cost_per_unit ?? toner.cost ?? 0);
        const costPerPage = tonerUnitCost / capacity;

        return Number((totalPages * costPerPage).toFixed(2));
    }, [toner, pages, copies]);

    // Calculate finishing cost with proper unit conversion
    // Formula: materials_needed = ceil(total_quantity / conversion_rate)
    // Cost = materials_needed * material_cost_per_unit
    const finishingCost = useMemo(() => {
        return finishingOptions
            .filter(opt => opt.coversPerCopy > 0)
            .reduce((sum, opt) => {
                // Calculate total covers needed: copies × covers per copy
                const totalCoversNeeded = copies * opt.coversPerCopy;

                // Calculate how many material units needed (e.g., reams of covers)
                const materialUnitsNeeded = Math.ceil(totalCoversNeeded / opt.materialConversionRate);

                // Cost = units needed × cost per unit
                const optionCost = materialUnitsNeeded * opt.cost;

                return sum + optionCost;
            }, 0);
    }, [finishingOptions, copies]);

    // Base cost = paper + toner + finishing
    const baseCost = useMemo(() => {
        return Number((paperCost + tonerCost + finishingCost).toFixed(2));
    }, [paperCost, tonerCost, finishingCost]);

    // Calculate market adjustment total
    const marketAdjustmentTotal = useMemo(() => {
        if (!marketAdjustmentEnabled) {
            return 0;
        }

        let total = 0;

        // Apply system market adjustments
        marketAdjustments.forEach(adj => {
            const type = adj.type?.toUpperCase();
            if (type === 'PERCENTAGE' || type === 'PERCENT') {
                total += baseCost * (adj.value / 100);
            } else {
                total += adj.value * pages * copies;
            }
        });

        return Number(total.toFixed(2));
    }, [marketAdjustments, marketAdjustmentEnabled, baseCost, pages, copies]);

    // Calculate final price
    const finalPrice = useMemo(() => {
        return Number((baseCost + marketAdjustmentTotal).toFixed(2));
    }, [baseCost, marketAdjustmentTotal]);

    // Calculate examination total with tiered pricing, taxes, and fees
    const calculateExaminationTotal = useCallback((batch: ExaminationBatch, classes: ExaminationClass[]): ExaminationPricingResult => {
        const lineItems: ExaminationPricingResult['lineItems'] = [];
        let subtotal = 0;

        // Process each class as a line item
        classes.forEach((cls) => {
            const learnerCount = cls.number_of_learners || 0;
            const feePerLearner = cls.final_fee_per_learner ?? cls.expected_fee_per_learner ?? cls.price_per_learner ?? 0;
            const total = feePerLearner * learnerCount;

            if (learnerCount > 0) {
                lineItems.push({
                    description: `${cls.class_name} (${learnerCount} learners)`,
                    quantity: learnerCount,
                    unitPrice: feePerLearner,
                    total: total
                });
                subtotal += total;
            }
        });

        const appliedDiscounts: ExaminationPricingResult['appliedDiscounts'] = [];


        // Calculate VAT/tax (16% default)
        const taxRate = 0.16;
        const taxAmount = subtotal * taxRate;
        const taxBreakdown: ExaminationPricingResult['taxBreakdown'] = [{
            name: 'VAT (16%)',
            rate: taxRate,
            amount: taxAmount
        }];

        // Calculate processing fees (fixed per batch)
        const fees: ExaminationPricingResult['fees'] = [
            { name: 'Processing Fee', amount: 50 }
        ];
        const totalFees = fees.reduce((sum, fee) => sum + fee.amount, 0);

        // Calculate grand total
        const grandTotal = subtotal + taxAmount + totalFees;

        return {
            subtotal: Number(subtotal.toFixed(2)),
            appliedDiscounts,
            taxBreakdown,
            fees,
            grandTotal: Number(grandTotal.toFixed(2)),
            lineItems
        };
    }, []);

    // Reactive examination pricing result
    const examinationPricingResult = useMemo<ExaminationPricingResult | null>(() => {
        if (!examinationBatch || examinationClasses.length === 0) {
            return null;
        }
        return calculateExaminationTotal(examinationBatch, examinationClasses);
    }, [examinationBatch, examinationClasses, calculateExaminationTotal]);

    // Actions
    const toggleFinishingOption = useCallback((optionId: string) => {
        setFinishingOptions(prev => prev.map(opt =>
            opt.id === optionId
                ? { ...opt, coversPerCopy: opt.coversPerCopy > 0 ? 0 : 1 }
                : opt
        ));
    }, []);

    const updateFinishingOption = useCallback((optionId: string, coversPerCopy: number) => {
        setFinishingOptions(prev => prev.map(opt =>
            opt.id === optionId
                ? { ...opt, coversPerCopy: Math.max(0, coversPerCopy) }
                : opt
        ));
    }, []);

    const resetCalculator = useCallback(() => {
        setPages(1);
        setCopies(1);
        setFinishingOptions(defaultFinishingOptions);
        setMarketAdjustmentEnabled(true);
    }, []);

    const value: PricingCalculatorContextType = {
        isOpen,
        pages,
        copies,
        finishingOptions,
        marketAdjustmentEnabled,
        inventory,
        marketAdjustments,
        bomTemplates,
        isLoading,
        examinationBatch,
        examinationClasses,
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
        setExaminationBatch,
        setExaminationClasses,
        calculateExaminationTotal,
        resetCalculator,
    };

    return (
        <PricingCalculatorContext.Provider value={value}>
            {children}
        </PricingCalculatorContext.Provider>
    );
};

export const usePricingCalculator = () => {
    const context = useContext(PricingCalculatorContext);
    // Return default values if used outside provider to prevent crashes
    const defaultValue: PricingCalculatorContextType = {
        isOpen: false,
        pages: 1,
        copies: 1,
        finishingOptions: [],
        marketAdjustmentEnabled: true,
        inventory: [],
        marketAdjustments: [],
        bomTemplates: [],
        isLoading: false,
        examinationBatch: null,
        examinationClasses: [],
        paperCost: 0,
        tonerCost: 0,
        finishingCost: 0,
        baseCost: 0,
        marketAdjustmentTotal: 0,
        finalPrice: 0,
        examinationPricingResult: null,
        setIsOpen: () => { },
        setPages: () => { },
        setCopies: () => { },
        toggleFinishingOption: () => { },
        updateFinishingOption: () => { },
        setMarketAdjustmentEnabled: () => { },
        setExaminationBatch: () => { },
        setExaminationClasses: () => { },
        calculateExaminationTotal: () => ({
            subtotal: 0,
            appliedDiscounts: [],
            taxBreakdown: [],
            fees: [],
            grandTotal: 0,
            lineItems: []
        }),
        resetCalculator: () => { },
    };
    return context || defaultValue;
};

export default PricingCalculatorContext;
