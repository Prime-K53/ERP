import { Item, BOMTemplate, ConsumptionSnapshot, MarketAdjustment, ProductVariant, TransactionAdjustmentSnapshot, MarketAdjustmentTransaction, DynamicServiceDetails } from '../types';
import { logger } from '@/services/logger';
import { pagesToReams, pagesToTonerKg } from '../utils/printConversions';
import { roundToCurrency } from '../utils/helpers';
import { calculateItemFinancials } from '../utils/pricing';
import { generateOpaqueId } from '../utils/idGeneration';
import { resolveVolumeMarginValue, getVolumeDiscountTiers } from '../utils/pricingEngineShared';
import { resolveOfflineEffectiveMargin } from '../services/offlineProfitMargins';
import { applyMargin } from '../utils/getEffectiveMargin';
import { SafeFormulaEngine } from './formulaEngine';
import { dbService } from './db';
import { API_BASE_URL } from '../config/api.js';
import { safeFetch } from './safeFetch';

export interface PricingResult {
    price: number;
    basePrice: number;
    cost: number;
    consumption: ConsumptionSnapshot | null;
    breakdown: { category: string; amount: number }[];
    adjustmentTotal: number;
    adjustmentSnapshots: any[];
    /** Granular transaction-level adjustment snapshots for detailed tracking */
    transactionAdjustmentSnapshots: TransactionAdjustmentSnapshot[];
}

export interface DynamicServiceComponentCost {
    itemId: string;
    name: string;
    quantity: number;
    unit: string;
    unitCost: number;
    totalCost: number;
    usageType: 'per-page' | 'per-copy';
}

export interface DynamicServicePricingResult {
    pages: number;
    copies: number;
    totalPages: number;
    unitCostPerCopy: number;
    unitPricePerCopy: number;
    unitCostPerPage: number;
    unitPricePerPage: number;
    totalCost: number;
    totalPrice: number;
    calculatedTotalPrice: number;
    adjustmentTotal: number;
    adjustmentSnapshots: any[];
    marginAmount?: number;
    rounding_difference?: number;
    components: DynamicServiceComponentCost[];
    serviceDetails: DynamicServiceDetails;
    /** When true, indicates the price has been locked by user confirmation and should not be recalculated on quantity changes */
    priceLocked?: boolean;
    /** The locked total price that should remain constant regardless of quantity modifications */
    lockedTotalPrice?: number;
    /** The locked unit price per copy that was confirmed by the user */
    lockedUnitPricePerCopy?: number;
    /** The locked unit cost per copy that was confirmed by the user */
    lockedUnitCostPerCopy?: number;
}

/**
 * Context for generating transaction-level adjustment records
 */
export interface TransactionContext {
    saleId: string;
    itemId: string;
    itemName: string;
    variantId?: string;
    quantity: number;
}

/**
 * Generate a unique ID for adjustment snapshots
 */
const generateAdjustmentId = () => {
    return generateOpaqueId('ADJ');
};

const getCompanyConfig = () => {
    if (typeof window === 'undefined' || !window.localStorage) return undefined;
    try {
        const raw = localStorage.getItem('nexus_company_config');
        return raw ? JSON.parse(raw) : undefined;
    } catch {
        return undefined;
    }
};

export const pricingService = {
    formulaEngine: new SafeFormulaEngine(),

    /**
     * Calculates the production cost for an item based on its BOM.
     * When costOnly is true, returns only the BOM cost without adjustments or margin.
     * When costOnly is false, applies market adjustments for transaction processing.
     */
    calculateItemPrice(
        item: Item,
        quantity: number,
        variantId: string | undefined,
        pagesOverride: number | undefined,
        inventory: Item[],
        bomTemplates: BOMTemplate[],
        marketAdjustments: MarketAdjustment[],
        costOnly: boolean = true,
        extraContext?: Record<string, number>
    ): PricingResult {
        let basePrice = item.price || 0;
        let baseCost = item.cost || 0;

        // 0. Find variant if applicable to get its specific base price/cost
        if (variantId && item.variants) {
            const variant = item.variants.find(v => v.id === variantId);
            if (variant) {
                if (variant.price > 0) basePrice = variant.price;
                if (variant.cost > 0) baseCost = variant.cost;
            }
        }

        // 0.1 If it's a material or stationery, it doesn't support BOM here
        if (item.type === 'Material' || item.type === 'Stationery') {
            return {
                price: item.type === 'Stationery' ? (basePrice * quantity) : 0,
                basePrice: item.type === 'Stationery' ? basePrice : 0,
                cost: baseCost * quantity,
                consumption: null,
                breakdown: [],
                adjustmentTotal: 0,
                adjustmentSnapshots: [],
                transactionAdjustmentSnapshots: []
            };
        }

        let cost = baseCost;
        let price = basePrice;
        let consumption: ConsumptionSnapshot | null = null;
        let breakdown: { category: string; amount: number }[] = [];
        let adjustmentTotal = 0;
        let adjustmentSnapshots: any[] = [];

        // 1. Calculate Base Cost from BOM if applicable
        if ((item as Item & Record<string, unknown>).printConsumptionEnabled) {
            const templateId = item.smartPricing?.bomTemplateId;
            const template = bomTemplates.find(t => t.id === templateId);

            if (template) {
                // Determine Pages
                let pagesPerJob = 0;
                if (variantId && item.variants) {
                    const variant = item.variants.find(v => v.id === variantId);
                    if (variant) pagesPerJob = Number(variant.pages) || 0;
                } else {
                    pagesPerJob = pagesOverride ?? (item as Item & Record<string, unknown>).pagesPerJob ?? Number(item.pages) ?? 0;
                }

                const totalPages = pagesPerJob * quantity;
                let paperConsumed = 0;
                let tonerConsumed = 0;
                let bomCost = 0;
                const bomBreakdown: any[] = [];

                for (const comp of template.components) {
                    const material = comp.itemId ? inventory.find(i => i.id === comp.itemId) : undefined;

                    const mode = comp.consumptionMode || ((comp.formula ?? comp.quantityFormula)?.includes('pages') ? 'PAGE_BASED' : 'UNIT_BASED');
                    const compName = (comp.name || material?.name || '').toLowerCase();
                    const isPaper = compName.includes('paper') || material?.category === 'Paper';
                    const isToner = compName.includes('toner') || compName.includes('ink') || material?.category === 'Toner';

                    let consumedQty = 0;
                    if (isPaper) {
                        consumedQty = pagesToReams(mode === 'PAGE_BASED' ? totalPages : quantity);
                        paperConsumed += consumedQty;
                    } else if (isToner) {
                        consumedQty = pagesToTonerKg(mode === 'PAGE_BASED' ? totalPages : quantity);
                        tonerConsumed += consumedQty;
                    } else if ((comp.formula ?? comp.quantityFormula)) {
                        try {
                            const variables = { quantity: quantity, pages: pagesPerJob, ...(extraContext || {}) };
                            const result = this.formulaEngine.evaluateWithResult((comp.formula ?? comp.quantityFormula), variables);
                            consumedQty = result.success ? result.value : 0;

                            if (material?.conversionRate && material.conversionRate > 1) {
                                if (!(comp.formula ?? comp.quantityFormula).includes(material.conversionRate.toString())) {
                                    consumedQty = consumedQty / material.conversionRate;
                                }
                            }
                        } catch (e) {
                            logger.error('Error evaluating formula:', e);
                        }
                    }

                    if (consumedQty > 0) {
                        const unitCost = material?.cost ?? comp.costPerUnit ?? 0;
                        const matCost = consumedQty * unitCost;
                        bomCost += matCost;
                        bomBreakdown.push({
                            materialId: comp.itemId || material?.id || `bom_${template.components.indexOf(comp)}`,
                            materialName: comp.name || material?.name || `Component ${template.components.indexOf(comp) + 1}`,
                            quantity: consumedQty,
                            unit: comp.unit || material?.unit || 'pcs',
                            cost: unitCost
                        });
                    }
                }

                cost = bomCost / quantity; // Unit cost

                consumption = {
                    id: generateOpaqueId('SNAP'),
                    saleId: '',
                    itemId: item.id,
                    variantId: variantId,
                    pages: totalPages,
                    quantity,
                    cost,
                    totalCost: cost * quantity,
                    paperConsumed,
                    tonerConsumed,
                    costPerUnit: cost,
                    bomBreakdown,
                    timestamp: new Date().toISOString()
                };
            }
        }

        // 2. When costOnly mode, return just the cost without adjustments
        if (costOnly) {
            return {
                price: cost,
                basePrice: cost,
                cost,
                consumption,
                breakdown: [],
                adjustmentTotal: 0,
                adjustmentSnapshots: [],
                transactionAdjustmentSnapshots: []
            };
        }

        // 3. Legacy path: apply market adjustments (used during transaction processing)
        let calculatedPrice = cost > 0 ? cost : basePrice;
        let transactionAdjustmentSnapshots: TransactionAdjustmentSnapshot[] = [];

        marketAdjustments.forEach(adj => {
            const isActive = adj.active ?? adj.isActive;
            const categoryMatch = !adj.applyToCategories || adj.applyToCategories.length === 0 || adj.applyToCategories.includes(item.category);

            if (isActive && categoryMatch) {
                let amount = 0;
                if (adj.type === 'PERCENTAGE' || adj.type === 'PERCENT' || adj.type === 'percentage') {
                    const pct = adj.percentage || adj.value;
                    amount = calculatedPrice * (pct / 100);
                } else {
                    amount = adj.value;
                }

                adjustmentTotal += amount;

                adjustmentSnapshots.push({
                    name: adj.name,
                    type: adj.type,
                    value: adj.value,
                    calculatedAmount: amount
                });

                const transactionSnapshot: TransactionAdjustmentSnapshot = {
                    id: generateAdjustmentId(),
                    saleId: '',
                    itemId: item.id,
                    itemName: item.name,
                    variantId: variantId,
                    quantity: quantity,
                    baseCost: calculatedPrice,
                    unitAdjustmentAmount: amount,
                    totalAdjustmentAmount: roundToCurrency(amount * quantity),
                    adjustmentId: adj.id,
                    timestamp: new Date().toISOString(),
                    name: adj.name,
                    type: adj.type as 'PERCENTAGE' | 'FIXED' | 'PERCENT',
                    amount: roundToCurrency(amount * quantity),
                    value: adj.value,
                    calculatedAmount: amount,
                    category: adj.adjustmentCategory || adj.category,
                    isActive: isActive
                };
                transactionAdjustmentSnapshots.push(transactionSnapshot);
            }
        });

        price = roundToCurrency(calculatedPrice + adjustmentTotal);

        return {
            price,
            basePrice: calculatedPrice,
            cost,
            consumption,
            breakdown,
            adjustmentTotal,
            adjustmentSnapshots,
            transactionAdjustmentSnapshots
        };
    },

    /**
     * Calculates dynamic service pricing using pages x copies as the pricing driver.
     * Supports BOM template formulas (preferred), pricingConfig fallback, and static fallback.
     */
    calculateDynamicServicePrice(
        item: Item,
        pages: number,
        copies: number,
        inventory: Item[],
        bomTemplates: BOMTemplate[],
        marketAdjustments: MarketAdjustment[],
        options?: { useStoredPriceAsFinal?: boolean },
        extraContext?: Record<string, number>
    ): DynamicServicePricingResult {
        const safePages = Math.max(1, Math.floor(Number(pages) || Number(item.pages) || 1));
        const safeCopies = Math.max(1, Math.floor(Number(copies) || 1));
        const totalPages = safePages * safeCopies;
        const pricingMethod = (item as any).pricingConfig?.pricingMethod || 'per_page';
        const components: DynamicServiceComponentCost[] = [];

        // Service calculator pricing should honor material consumption granularity.
        // Paper, for example, is charged per sheet (after page->sheet conversion),
        // so we compute the actual run cost first, then derive per-page/per-copy rates.
        const templateId = item.smartPricing?.bomTemplateId || item.smartPricing?.hiddenBOMId;
        const template = templateId ? bomTemplates.find(t => t.id === templateId) : undefined;

        const evaluateTemplateCost = (
            evalPages: number,
            evalCopies: number,
            collectBreakdown: boolean
        ) => {
            const evalTotalPages = evalPages * evalCopies;
            const sheetsPerCopy = pricingMethod === 'per_sheet' ? evalPages : Math.ceil(evalPages / 2);
            const totalSheets = sheetsPerCopy * evalCopies;
            let total = 0;
            const breakdown: DynamicServiceComponentCost[] = [];

            template?.components?.forEach(comp => {
                const material = comp.itemId ? inventory.find(i => i.id === comp.itemId) : undefined;
                if (!material) return;

                const materialName = String(material.name || '').toLowerCase();
                const materialCategory = String(material.category || '').toLowerCase();
                const isPaper = materialName.includes('paper') || materialCategory.includes('paper');
                const mode = comp.consumptionMode || ((comp.formula ?? comp.quantityFormula)?.includes('pages') ? 'PAGE_BASED' : 'UNIT_BASED');
                let consumedQty = 0;

                    if ((comp.formula ?? comp.quantityFormula)) {
                    const normalizedFormula = (comp.formula ?? comp.quantityFormula).replace(/\s+/g, '').toLowerCase();
                    consumedQty = SafeFormulaEngine.evaluate((comp.formula ?? comp.quantityFormula), {
                        pages: evalPages,
                        pageCount: evalPages,
                        quantity: evalCopies,
                        copies: evalCopies,
                        totalPages: evalTotalPages,
                        total_pages: evalTotalPages,
                        sheetsPerCopy,
                        sheets_per_copy: sheetsPerCopy,
                        totalSheets,
                        total_sheets: totalSheets,
                        ...(extraContext || {})
                    } as Record<string, number>);

                    // Normalize legacy paper formulas that are page-driven to sheet-driven costing.
                    if (isPaper) {
                        const isSimplePageDrivenPaperFormula =
                            /^(pages|pagecount|totalpages|total_pages)$/.test(normalizedFormula) ||
                            /^(quantity|copies)\*(pages|pagecount|totalpages|total_pages)$/.test(normalizedFormula) ||
                            /^(pages|pagecount|totalpages|total_pages)\*(quantity|copies)$/.test(normalizedFormula) ||
                            /^(pages|pagecount|totalpages|total_pages)\/2$/.test(normalizedFormula) ||
                            /^(quantity|copies)\*(pages|pagecount|totalpages|total_pages)\/2$/.test(normalizedFormula) ||
                            /^(pages|pagecount|totalpages|total_pages)\*(quantity|copies)\/2$/.test(normalizedFormula) ||
                            /^(quantity|copies)\*(pages|pagecount|totalpages|total_pages)\*0?\.5$/.test(normalizedFormula) ||
                            /^(pages|pagecount|totalpages|total_pages)\*(quantity|copies)\*0?\.5$/.test(normalizedFormula);

                        if (isSimplePageDrivenPaperFormula) {
                            consumedQty = totalSheets;
                        }
                    }
                } else {
                    consumedQty = (isPaper && mode === 'PAGE_BASED')
                        ? totalSheets
                        : (mode === 'PAGE_BASED' ? evalTotalPages : evalCopies);
                }

                if (!isFinite(consumedQty) || consumedQty <= 0) return;

                if (material.conversionRate && material.conversionRate > 1) {
                    const formulaIncludesConversion = !!(comp.formula ?? comp.quantityFormula) && (comp.formula ?? comp.quantityFormula).includes(String(material.conversionRate));
                    const shouldAutoConvert = (isPaper && !formulaIncludesConversion) || (!!(comp.formula ?? comp.quantityFormula) && !formulaIncludesConversion);
                    if (shouldAutoConvert) {
                        consumedQty = consumedQty / material.conversionRate;
                    }
                }

                const unitCost = Number(material.cost_price ?? material.cost) || 0;
                const lineCost = consumedQty * unitCost;
                total += lineCost;

                if (collectBreakdown) {
                    breakdown.push({
                        itemId: material.id,
                        name: material.name,
                        quantity: consumedQty,
                        unit: material.unit,
                        unitCost,
                        totalCost: lineCost,
                        usageType: mode === 'PAGE_BASED' ? 'per-page' : 'per-copy'
                    });
                }
            });

            return { total, breakdown };
        };

        let unitCostPerPage = 0;
        let resolvedTotalCost = 0;

        if (template?.components?.length) {
            const currentRun = evaluateTemplateCost(safePages, safeCopies, true);
            components.push(...currentRun.breakdown);
            resolvedTotalCost = roundToCurrency(currentRun.total || 0);
            if (totalPages > 0) {
                unitCostPerPage = roundToCurrency(resolvedTotalCost / totalPages);
            }
        } else if (item.pricingConfig && !item.pricingConfig.manualOverride) {
            const oneCopySpec = calculateItemFinancials(safePages, item.pricingConfig, inventory, []);
            if ((oneCopySpec?.cost || 0) > 0) {
                resolvedTotalCost = roundToCurrency((oneCopySpec!.cost || 0) * safeCopies);
                if (totalPages > 0) {
                    unitCostPerPage = roundToCurrency(resolvedTotalCost / totalPages);
                }
            }
        }

        if (unitCostPerPage <= 0) {
            const fallbackCost = Number(item.cost_price ?? item.cost) || 0;
            const itemPages = Math.max(1, Math.floor(Number(item.pages) || 1));
            // For services without a BOM, treat stored cost as total cost per copy, not per page.
            unitCostPerPage = roundToCurrency(fallbackCost / itemPages);
        }

        if (resolvedTotalCost <= 0) {
            resolvedTotalCost = roundToCurrency(unitCostPerPage * totalPages);
        }

        const unitCostPerCopy = safeCopies > 0
            ? roundToCurrency(resolvedTotalCost / safeCopies)
            : roundToCurrency(resolvedTotalCost);
        const totalCost = roundToCurrency(resolvedTotalCost);

        const adjustmentSnapshots: any[] = [];
        let unitAdjustmentPerPage = 0;

        marketAdjustments.forEach(adj => {
            const isActive = adj.active ?? adj.isActive;
            const categoryMatch = !adj.applyToCategories || adj.applyToCategories.length === 0 || adj.applyToCategories.includes(item.category);
            if (!isActive || !categoryMatch) return;

            const isPercent = adj.type === 'PERCENTAGE' || adj.type === 'PERCENT' || adj.type === 'percentage';
            const pct = Number(adj.percentage ?? adj.value ?? 0);
            const adjPerPage = roundToCurrency(isPercent
                ? unitCostPerPage * (pct / 100)
                : (Number(adj.value) || 0));

            unitAdjustmentPerPage = roundToCurrency(unitAdjustmentPerPage + adjPerPage);

            // Keep snapshots per copy for downstream quantity aggregation compatibility.
            adjustmentSnapshots.push({
                name: adj.name,
                type: adj.type,
                value: adj.value,
                calculatedAmount: roundToCurrency(adjPerPage * safePages)
            });
        });

        let calculatedUnitPricePerPage = roundToCurrency(unitCostPerPage + unitAdjustmentPerPage);
        if (calculatedUnitPricePerPage <= 0 && (options?.useStoredPriceAsFinal ?? false)) {
            calculatedUnitPricePerPage = roundToCurrency(Number(item.calculated_price ?? item.price) || 0);
        }
        const totalAdjustment = roundToCurrency(unitAdjustmentPerPage * totalPages);
        const calculatedTotalPrice = roundToCurrency(calculatedUnitPricePerPage * totalPages);

        const totalPrice = calculatedTotalPrice;
        const finalUnitPricePerCopy = safeCopies > 0 ? (totalPrice / safeCopies) : totalPrice;
        const finalUnitPricePerPage = safePages > 0 ? (finalUnitPricePerCopy / safePages) : finalUnitPricePerCopy;

        const serviceDetails: DynamicServiceDetails = {
            materials: components.map(c => ({
                itemId: c.itemId,
                quantity: c.quantity,
                cost: c.unitCost,
                totalCost: c.totalCost,
                name: c.name,
            })),
            adjustments: [],
            pages: safePages,
            copies: safeCopies,
            totalPages,
            unitCostPerPage: roundToCurrency(unitCostPerPage),
            unitPricePerPage: finalUnitPricePerPage,
            unitCostPerCopy,
            unitPricePerCopy: finalUnitPricePerCopy,
            totalCost,
            totalPrice,
            calculatedTotalPrice
        };

        return {
            pages: safePages,
            copies: safeCopies,
            totalPages,
            unitCostPerCopy,
            unitPricePerCopy: finalUnitPricePerCopy,
            unitCostPerPage: roundToCurrency(unitCostPerPage),
            unitPricePerPage: finalUnitPricePerPage,
            totalCost,
            totalPrice,
            calculatedTotalPrice,
            adjustmentTotal: totalAdjustment,
            adjustmentSnapshots,
            components,
            serviceDetails
        };
    },

    /**
     * Creates MarketAdjustmentTransaction records from transaction adjustment snapshots.
     * This should be called during sale processing to persist individual adjustment records.
     */
    createAdjustmentTransactions(
        snapshots: TransactionAdjustmentSnapshot[],
        saleId: string
    ): MarketAdjustmentTransaction[] {
        return snapshots.map(snap => ({
            id: generateOpaqueId('MAT'),
            saleId: saleId,
            itemId: snap.itemId,
            variantId: snap.variantId,
            adjustmentId: snap.adjustmentId || '',
            adjustmentName: snap.name,
            adjustmentType: snap.type,
            adjustmentValue: snap.value,
            baseAmount: snap.baseCost,
            calculatedAmount: snap.totalAdjustmentAmount,
            quantity: snap.quantity,
            unitAmount: snap.unitAdjustmentAmount,
            timestamp: new Date().toISOString(),
            status: 'Active' as const,
            notes: `Applied to ${snap.itemName}${snap.variantId ? ' (variant: ' + snap.variantId + ')' : ''}`
        }));
    },

    /**
     * Generates an adjustment summary from transaction adjustment snapshots.
     * Groups adjustments by adjustment ID and calculates totals.
     */
    generateAdjustmentSummary(
        snapshots: TransactionAdjustmentSnapshot[]
    ): { adjustmentId: string; adjustmentName: string; totalAmount: number; itemCount: number; }[] {
        const summaryMap = new Map<string, { adjustmentId: string; adjustmentName: string; totalAmount: number; itemCount: number; }>();

        snapshots.forEach(snap => {
            const key = snap.adjustmentId || snap.name;
            const existing = summaryMap.get(key);
            if (existing) {
                existing.totalAmount += snap.totalAdjustmentAmount;
                existing.itemCount += 1;
            } else {
                summaryMap.set(key, {
                    adjustmentId: snap.adjustmentId || '',
                    adjustmentName: snap.name,
                    totalAmount: snap.totalAdjustmentAmount,
                    itemCount: 1
                });
            }
        });

        return Array.from(summaryMap.values()).map(s => ({
            ...s,
            totalAmount: roundToCurrency(s.totalAmount)
        }));
    },

    /**
     * Calculates variant price based on parent's Hidden BOM.
     * Replaces parent's default page count with variant's specific page count.
     * 
     * @param parentItem - The parent product item containing the Hidden BOM reference
     * @param variant - The variant with specific pages attribute
     * @param quantity - Quantity being priced
     * @param inventory - Full inventory list for material lookups
     * @param bomTemplates - BOM templates list
     * @param marketAdjustments - Active market adjustments
     * @returns PricingResult with calculated price, cost, and snapshots
     */
    calculateVariantPrice(
        parentItem: Item,
        variant: ProductVariant,
        quantity: number,
        inventory: Item[],
        bomTemplates: BOMTemplate[],
        marketAdjustments: MarketAdjustment[]
    ): PricingResult {
        // 1. Check if variant uses dynamic pricing
        if (variant.pricingSource === 'static') {
            return {
                price: variant.price,
                basePrice: variant.price,
                cost: variant.cost,
                consumption: null,
                breakdown: [],
                adjustmentTotal: 0,
                adjustmentSnapshots: variant.adjustmentSnapshots || [],
                transactionAdjustmentSnapshots: []
            };
        }

        // 2. Get the Hidden BOM from parent
        const hiddenBOMId = variant.bomOverrideId
            || parentItem.smartPricing?.hiddenBOMId
            || parentItem.smartPricing?.bomTemplateId;

        // 3. If no BOM configured, return variant's stored price
        if (!hiddenBOMId) {
            return {
                price: variant.price,
                basePrice: variant.price,
                cost: variant.cost,
                consumption: null,
                breakdown: [],
                adjustmentTotal: 0,
                adjustmentSnapshots: variant.adjustmentSnapshots || [],
                transactionAdjustmentSnapshots: []
            };
        }

        // 4. Create a virtual item with variant's pages for BOM calculation
        const virtualItem: Item = {
            ...parentItem,
            pages: variant.pages,  // KEY: Replace parent pages with variant pages
            price: 0,              // Force BOM calculation
            cost: 0,
            // Enable print consumption for BOM calculation
            smartPricing: {
                ...parentItem.smartPricing,
                bomTemplateId: hiddenBOMId
            }
        } as Item;

        // Mark for BOM processing
        (virtualItem as Item & Record<string, unknown>).printConsumptionEnabled = true;

        // 5. Extract numeric attribute values for formula context
        const attrContext: Record<string, number> = {};
        if (variant.attributes) {
            for (const [key, val] of Object.entries(variant.attributes)) {
                const num = Number(val);
                if (!isNaN(num)) attrContext[key.replace(/\s+/g, '_').toLowerCase()] = num;
            }
        }

        // 5. Use existing pricing calculation with variant's pages + attributes
        const result = this.calculateItemPrice(
            virtualItem,
            quantity,
            undefined,         // variantId - we're using virtual item approach
            variant.pages,     // pagesOverride - variant's specific pages
            inventory,
            bomTemplates,
            marketAdjustments,
            true,              // costOnly
            attrContext         // extraContext - variant attributes as formula variables
        );

        const rawBomCost = result.cost;

        // 6. Add finishing options cost from parent smartPricing (mirrors ServiceCalculatorModal.computePageScaledCost)
        const sp = parentItem.smartPricing;
        let finishingCostPerCopy = 0;
        const finishingBreakdown: { name: string; amount: number }[] = [];
        if (sp?.finishingEnabled && sp.finishingEnabled.length > 0) {
            const companyConfig = getCompanyConfig();
            const globalFinishingOptions = companyConfig?.productionSettings?.finishingOptions || [];

            sp.finishingEnabled.forEach((enabledId: string) => {
                let perCopyCost = 0;

                const savedCost = sp.finishingSelections?.find((o: any) => o?.id === enabledId)?.price;
                if (savedCost && savedCost > 0) {
                    perCopyCost = Number(savedCost);
                } else {
                    const optionCost = (sp.finishingOptionCosts || {})[enabledId];
                    if (optionCost && optionCost > 0) {
                        perCopyCost = Number(optionCost);
                    } else {
                        const globalOption = globalFinishingOptions.find((o: any) => o?.id === enabledId);
                        if (globalOption?.price && globalOption.price > 0) {
                            perCopyCost = Number(globalOption.price);
                        }
                    }
                }

                if (perCopyCost > 0) {
                    const batchSize = globalFinishingOptions.find((o: any) => o?.id === enabledId)?.batchSize;
                    const effectiveCost = batchSize && batchSize > 0
                        ? (Math.ceil(quantity / batchSize) * perCopyCost) / quantity
                        : perCopyCost;
                    finishingCostPerCopy += effectiveCost;
                    finishingBreakdown.push({ name: enabledId, amount: effectiveCost });
                }
            });
        }

        const totalBaseCostPerCopy = rawBomCost + finishingCostPerCopy;

        // 7. Apply profit margin (same engine as Smart Pricing / calculateSellingPrice)
        const margin = resolveOfflineEffectiveMargin(parentItem.id, parentItem.category);
        const marginAmount = margin.margin_type === 'percentage'
            ? roundToCurrency(totalBaseCostPerCopy * (margin.margin_value / 100))
            : roundToCurrency(margin.margin_value);
        let sellingPrice = roundToCurrency(totalBaseCostPerCopy + marginAmount);

        // 8. Apply volume / run-length discount
        const discountTiers = getVolumeDiscountTiers(getCompanyConfig());
        const pageCount = Number(variant.pages) || 0;
        const volumeDiscountPct = resolveVolumeMarginValue(pageCount, discountTiers);
        let volumeDiscountAmount = 0;
        if (volumeDiscountPct > 0) {
            volumeDiscountAmount = roundToCurrency(sellingPrice * (volumeDiscountPct / 100));
            sellingPrice = roundToCurrency(sellingPrice - volumeDiscountAmount);
        }

        const adjustmentTotal = finishingCostPerCopy + marginAmount - volumeDiscountAmount;
        const adjustmentSnapshots = [
            ...(result.adjustmentSnapshots || []),
            ...(finishingCostPerCopy > 0 ? [{
                name: 'Finishing Options',
                type: 'FIXED' as const,
                value: finishingCostPerCopy,
                calculatedAmount: roundToCurrency(finishingCostPerCopy)
            }] : []),
            {
                name: 'Profit Margin',
                type: (margin.margin_type === 'fixed_amount' ? 'FIXED' : 'PERCENTAGE') as const,
                value: margin.margin_value,
                calculatedAmount: roundToCurrency(marginAmount)
            },
            ...(volumeDiscountPct > 0 ? [{
                name: 'Volume Discount',
                type: 'PERCENTAGE' as const,
                value: volumeDiscountPct,
                calculatedAmount: roundToCurrency(-volumeDiscountAmount)
            }] : [])
        ];

        // 9. Return final selling price; keep rawBomCost in `cost` for backward compatibility
        //    with masterInventoryPricingService which reads only `cost` for inventory updates.
        return {
            ...result,
            price: sellingPrice,
            basePrice: sellingPrice,
            cost: rawBomCost,
            breakdown: finishingBreakdown,
            adjustmentTotal: roundToCurrency(adjustmentTotal),
            adjustmentSnapshots,
            transactionAdjustmentSnapshots: []
        };
    },

    /**
     * Batch calculates prices for all variants of a parent product.
     * Useful for bulk recalculation when BOM or materials change.
     * 
     * @param parentItem - The parent product with variants
     * @param inventory - Full inventory list
     * @param bomTemplates - BOM templates list
     * @param marketAdjustments - Active market adjustments
     * @returns Map of variant ID to PricingResult
     */
    calculateAllVariantPrices(
        parentItem: Item,
        inventory: Item[],
        bomTemplates: BOMTemplate[],
        marketAdjustments: MarketAdjustment[]
    ): Map<string, PricingResult> {
        const results = new Map<string, PricingResult>();

        if (!parentItem.variants || parentItem.variants.length === 0) {
            return results;
        }

        for (const variant of parentItem.variants) {
            const result = this.calculateVariantPrice(
                parentItem,
                variant,
                1, // Unit quantity for per-item pricing
                inventory,
                bomTemplates,
                marketAdjustments
            );
            results.set(variant.id, result);
        }

        return results;
    },

    /**
     * Determines if a variant should use dynamic pricing.
     * Checks variant settings and parent configuration.
     */
    shouldUseDynamicPricing(variant: ProductVariant, parentItem: Item): boolean {
        // Explicit static pricing takes precedence
        if (variant.pricingSource === 'static') {
            return false;
        }

        // Check if variant is configured for dynamic pricing
        if (variant.pricingSource === 'dynamic' || variant.inheritsParentBOM) {
            return true;
        }

        // Check parent's variant pricing mode
        if (parentItem.smartPricing?.variantPricingMode === 'inherit') {
            return true;
        }

        // Default to static for backward compatibility
        return false;
    }
}

// Centralized API_BASE_URL is imported from config

/** LocalStorage key where the Settings page persists profit-margin records offline. */
const OFFLINE_MARGIN_STORE_KEY = 'nexus_profit_margin_settings';

/**
 * Read the global default margin directly from localStorage.
 * The Settings page writes margin records here so they survive without a live backend.
 */
const getGlobalDefaultMarginFromLocalStorage = (): { margin_type: 'percentage' | 'fixed_amount'; margin_value: number; apply_volume_margins?: boolean } | null => {
    try {
        // Primary: dedicated offline margin store written by the Settings page
        const raw = localStorage.getItem(OFFLINE_MARGIN_STORE_KEY);
        if (raw) {
            const records = JSON.parse(raw);
            if (Array.isArray(records)) {
                const globalMargin = records.find((m: any) => m.scope === 'global' && !m.deleted_at);
                if (globalMargin && Number(globalMargin.margin_value) > 0) {
                    return {
                        margin_type: globalMargin.margin_type || 'percentage',
                        margin_value: Number(globalMargin.margin_value),
                        apply_volume_margins: !!globalMargin.apply_volume_margins,
                    };
                }
            }
        }

        // Secondary: fall back to the company config's pricingSettings field
        const configRaw = localStorage.getItem('nexus_company_config');
        if (configRaw) {
            const config = JSON.parse(configRaw);
            const gdm = config?.pricingSettings?.globalDefaultMargin;
            if (gdm && Number(gdm.margin_value) > 0) {
                return {
                    margin_type: gdm.margin_type || 'percentage',
                    margin_value: Number(gdm.margin_value),
                    apply_volume_margins: !!gdm.apply_volume_margins,
                };
            }
            // Also check a flat margin_value on pricingSettings itself
            const flatValue = Number(config?.pricingSettings?.defaultMarginValue ?? config?.pricingSettings?.marginValue ?? 0);
            if (flatValue > 0) {
                return {
                    margin_type: (config?.pricingSettings?.marginType as string) || 'percentage',
                    margin_value: flatValue,
                    apply_volume_margins: false,
                };
            }
        }
    } catch {
        // localStorage parse errors are non-fatal
    }
    return null;
};

/**
 * Get the Global Default Margin settings.
 *
 * Offline-first: always checks localStorage first so the function works when
 * the backend is unreachable (Electron offline mode). Falls back to the
 * backend API only when a valid API base URL is available.
 */
export const getGlobalDefaultMargin = async (): Promise<{ margin_type: 'percentage' | 'fixed_amount'; margin_value: number; apply_volume_margins?: boolean } | null> => {
    // 1. Try localStorage – works 100% offline, no network required
    const localMargin = getGlobalDefaultMarginFromLocalStorage();
    if (localMargin) return localMargin;

    // 2. Try the live backend (only when a valid API origin is available)
    try {
        const apiBase = API_BASE_URL;
        if (!apiBase) return null;

        const userId = localStorage.getItem('prime_user_id') || 'unknown';
        const userRole = localStorage.getItem('prime_user_role') || 'Admin';

        const { data: marginSettings, ok, error } = await safeFetch<any[]>(`${apiBase}/settings/profit-margins?scope=global`, {
            headers: {
                'x-user-id': userId,
                'x-user-role': userRole,
            },
            timeoutMs: 5000 // don't hang indefinitely offline
        });

        if (!ok || error || !marginSettings || !Array.isArray(marginSettings) || marginSettings.length === 0) {
            return null;
        }

        const globalMargin = marginSettings.find((m: any) => m.scope === 'global' && !m.deleted_at);
        if (!globalMargin) return null;

        const result = {
            margin_type: globalMargin.margin_type || 'percentage',
            margin_value: Number(globalMargin.margin_value) || 0,
            apply_volume_margins: !!globalMargin.apply_volume_margins,
        };

        // Cache the result in the cloud-first setting store for next offline session
        try {
            const existing = await dbService.getSetting<any[]>(OFFLINE_MARGIN_STORE_KEY) || [];
            const idx = existing.findIndex((m: any) => m.scope === 'global');
            if (idx >= 0) {
                existing[idx] = { ...existing[idx], ...globalMargin };
            } else {
                existing.push(globalMargin);
            }
            await dbService.saveSetting(OFFLINE_MARGIN_STORE_KEY, existing);
        } catch {
            // non-fatal cache write failure
        }

        return result;
    } catch (error) {
        console.warn('[PricingService] Could not reach backend for global margin (offline?):', (error as Error).message);
        return null;
    }
};

/**
 * Calculate selling price using Global Default Margin, market adjustments, and VAT
 */
export const calculateAutoPrice = async ({
    cost,
    includeVat = true,
    companyConfig,
    marketAdjustments
}: {
    cost: number;
    includeVat?: boolean;
    companyConfig?: any;
    marketAdjustments?: any[];
}): Promise<{
    sellingPrice: number;
    markupApplied: number;
    marketAdjustmentApplied: number;
    vatApplied: number;
    hasGlobalMargin: boolean;
    warning?: string;
}> => {
    const result = {
        sellingPrice: 0,
        markupApplied: 0,
        marketAdjustmentApplied: 0,
        vatApplied: 0,
        hasGlobalMargin: false,
        warning: undefined as string | undefined
    };

    if (cost <= 0) {
        result.warning = 'Cost is not set. Please enter a cost price first.';
        return result;
    }

    // Get Global Default Margin
    const globalMargin = await getGlobalDefaultMargin();
    if (!globalMargin || globalMargin.margin_value <= 0) {
        result.warning = 'No Global Default Margin configured. Please configure it in Settings > Profit Margin.';
        return result;
    }

    // Apply markup
    let markedUpPrice = cost;
    const marginValue = globalMargin.margin_value;
    const marginType = globalMargin.margin_type;

    if (marginType === 'percentage') {
        markedUpPrice = cost * (1 + marginValue / 100);
        result.markupApplied = markedUpPrice - cost;
    } else {
        markedUpPrice = cost + marginValue;
        result.markupApplied = marginValue;
    }

    // Volume / run-length discount (System B) — % off the marked-up price, not a margin replacement
    if (globalMargin.apply_volume_margins) {
        const pages = Number((companyConfig as Record<string, unknown>)?.pages) || 0;
        const discountTiers = getVolumeDiscountTiers(companyConfig);
        const volumeDiscountPct = resolveVolumeMarginValue(pages, discountTiers);
        if (volumeDiscountPct > 0) {
            const discountAmount = roundToCurrency(markedUpPrice * (volumeDiscountPct / 100));
            markedUpPrice = roundToCurrency(markedUpPrice - discountAmount);
            result.markupApplied = roundToCurrency(result.markupApplied - discountAmount);
        }
    }

    let priceBeforeVat = markedUpPrice;

    // Apply market adjustments (if configured in companyConfig)
    const activeAdjustments = marketAdjustments?.filter((adj: any) => adj.active ?? adj.isActive) || [];
    let totalMarketAdjustment = 0;
    for (const adj of activeAdjustments) {
        const adjType = (adj.type || '').toUpperCase();
        if (adjType === 'PERCENTAGE' || adjType === 'PERCENT') {
            totalMarketAdjustment += markedUpPrice * ((adj.value || 0) / 100);
        } else {
            totalMarketAdjustment += (adj.value || 0);
        }
    }
    priceBeforeVat += totalMarketAdjustment;
    result.marketAdjustmentApplied = totalMarketAdjustment;

    // Apply VAT (if enabled)
    let vatRate = 0;
    if (includeVat && companyConfig?.vatRate) {
        vatRate = Number(companyConfig.vatRate) || 0;
    }
    if (includeVat && !vatRate && companyConfig?.taxRate) {
        vatRate = Number(companyConfig.taxRate) || 0;
    }
    if (vatRate > 0) {
        result.vatApplied = priceBeforeVat * vatRate;
    }

    result.sellingPrice = priceBeforeVat + result.vatApplied;
    result.hasGlobalMargin = true;
    return result;
};
