import { AdjustmentSnapshot, BOMTemplate, CompanyConfig, Item, MarketAdjustment, PricingRoundingMethod, ProductVariant } from '../types';
import { dbService } from './db';
import { pricingService } from './pricingService';
import { calculateItemFinancials, resolveStoredCost } from '../utils/pricing';
import { roundToCurrency } from '../utils/helpers';

export interface MasterInventoryRepriceResult {
    totalCandidates: number;
    activeAdjustments: number;
    updatedItems: number;
    updatedVariants: number;
}

export interface RepricedVariantResult {
    variant: ProductVariant;
    changed: boolean;
    roundingLog: undefined;
}

export interface ProductRecalculateResult {
    found: boolean;
    changed: boolean;
    item?: Item;
}

const DEFAULT_ROUNDING_METHOD: PricingRoundingMethod = 'ALWAYS_UP_50';

const isAdjustmentActive = (adjustment: MarketAdjustment): boolean => {
    return adjustment.active ?? adjustment.isActive ?? false;
};

const isPercentageType = (type?: string): boolean => {
    const normalized = String(type || '').toUpperCase();
    return normalized === 'PERCENTAGE' || normalized === 'PERCENT';
};

const toSnapshotType = (type?: string): AdjustmentSnapshot['type'] => {
    const normalized = String(type || '').toUpperCase();
    if (normalized === 'FIXED') return 'FIXED';
    if (normalized === 'PERCENT') return 'PERCENT';
    return 'PERCENTAGE';
};

const getApplicableAdjustments = (
    itemCategory: string | undefined,
    allAdjustments: MarketAdjustment[]
): MarketAdjustment[] => {
    return allAdjustments.filter((adj) => {
        if (!isAdjustmentActive(adj)) return false;
        const categories = adj.applyToCategories || [];
        if (categories.length === 0) return true;
        if (!itemCategory) return false;
        return categories.includes(itemCategory);
    });
};

const buildSnapshotsFromBaseCost = (
    baseCost: number,
    adjustments: MarketAdjustment[]
): AdjustmentSnapshot[] => {
    return adjustments.map((adj) => {
        const amount = isPercentageType(adj.type)
            ? baseCost * ((adj.percentage ?? adj.value ?? 0) / 100)
            : (adj.value || 0);

        return {
            name: adj.name,
            type: toSnapshotType(adj.type),
            value: Number(adj.value || 0),
            percentage: isPercentageType(adj.type) ? Number(adj.percentage ?? adj.value ?? 0) : undefined,
            calculatedAmount: roundToCurrency(amount)
        };
    });
};

const sumSnapshotAmounts = (snapshots: AdjustmentSnapshot[]): number => {
    return roundToCurrency(snapshots.reduce((sum, snapshot) => sum + (snapshot.calculatedAmount || 0), 0));
};

const resolveGlobalMargin = (
    companyConfig: CompanyConfig | undefined,
    fallbackMarginPercent?: number
): { marginAmount: (baseAmount: number) => number; marginPercent: (baseAmount: number) => number } => {
    const configuredMargin = companyConfig?.pricingSettings?.globalDefaultMargin;
    const marginType = configuredMargin?.margin_type;
    const marginValue = Number(configuredMargin?.margin_value ?? fallbackMarginPercent ?? 0) || 0;

    if (marginType === 'fixed_amount') {
        return {
            marginAmount: () => roundToCurrency(marginValue),
            marginPercent: (baseAmount: number) => (
                baseAmount > 0
                    ? roundToCurrency((marginValue / baseAmount) * 100)
                    : 0
            )
        };
    }

    return {
        marginAmount: (baseAmount: number) => roundToCurrency(baseAmount * (marginValue / 100)),
        marginPercent: () => roundToCurrency(marginValue)
    };
};

const calculateStationeryLinePricing = ({
    baseCost,
    selectedAdjustmentIds,
    applicableAdjustments,
    companyConfig,
    fallbackMarginPercent
}: {
    baseCost: number;
    selectedAdjustmentIds?: string[];
    applicableAdjustments: MarketAdjustment[];
    companyConfig?: CompanyConfig;
    fallbackMarginPercent?: number;
}) => {
    const safeBaseCost = roundToCurrency(Math.max(0, Number(baseCost) || 0));
    const selectedIds = Array.from(new Set((selectedAdjustmentIds || []).filter(Boolean)));
    const selectedAdjustments = applicableAdjustments.filter(adj => selectedIds.includes(adj.id));
    const adjustmentSnapshots = buildSnapshotsFromBaseCost(safeBaseCost, selectedAdjustments);
    const adjustmentTotal = sumSnapshotAmounts(adjustmentSnapshots);
    const subtotalBeforeMargin = roundToCurrency(safeBaseCost + adjustmentTotal);
    const marginResolver = resolveGlobalMargin(companyConfig, fallbackMarginPercent);
    const marginAmount = marginResolver.marginAmount(subtotalBeforeMargin);
    const marginPercent = marginResolver.marginPercent(subtotalBeforeMargin);

    return {
        cost: safeBaseCost,
        selectedAdjustmentIds: selectedIds,
        adjustmentSnapshots,
        adjustmentTotal,
        marginAmount,
        marginPercent,
        calculatedPrice: roundToCurrency(subtotalBeforeMargin + marginAmount)
    };
};

const snapshotsChanged = (oldSnapshots: AdjustmentSnapshot[] | undefined, newSnapshots: AdjustmentSnapshot[]): boolean => {
    return JSON.stringify(oldSnapshots || []) !== JSON.stringify(newSnapshots || []);
};

const pricingConfigChanged = (oldConfig: Item['pricingConfig'], newConfig: Item['pricingConfig']): boolean => {
    return JSON.stringify(oldConfig || null) !== JSON.stringify(newConfig || null);
};

const numbersDiffer = (a: number | undefined, b: number | undefined): boolean => {
    return Math.abs((a || 0) - (b || 0)) > 0.00001;
};

const getStoredConfig = (): CompanyConfig | undefined => {
    if (typeof window === 'undefined' || !window.localStorage) return undefined;
    try {
        const raw = localStorage.getItem('nexus_company_config');
        return raw ? JSON.parse(raw) : undefined;
    } catch {
        return undefined;
    }
};

const applyRoundedFieldsToVariant = (
    _sourceVariant: ProductVariant,
    targetVariant: ProductVariant,
    calculatedPrice: number,
    _companyConfig?: CompanyConfig,
    _options?: {
        methodOverride?: PricingRoundingMethod;
        customStepOverride?: number;
    }
): void => {
    const normalizedPrice = roundToCurrency(Number(calculatedPrice || 0));
    targetVariant.sellingPrice = normalizedPrice;
    targetVariant.selling_price = normalizedPrice;
    targetVariant.price = normalizedPrice;
};

const applyRoundedFieldsToItem = (
    _sourceItem: Item,
    targetItem: Item,
    calculatedPrice: number,
    _companyConfig?: CompanyConfig,
    _options?: {
        methodOverride?: PricingRoundingMethod;
        customStepOverride?: number;
    }
): void => {
    const normalizedPrice = roundToCurrency(Number(calculatedPrice || 0));
    targetItem.sellingPrice = normalizedPrice;
    targetItem.selling_price = normalizedPrice;
    targetItem.price = normalizedPrice;
};

const repriceVariant = (
    parentItem: Item,
    variant: ProductVariant,
    inventory: Item[],
    bomTemplates: BOMTemplate[],
    applicableAdjustments: MarketAdjustment[],
    companyConfig?: CompanyConfig
): RepricedVariantResult => {
    const nextVariant: ProductVariant = { ...variant };
    const hasBomSource = Boolean(
        variant.bomOverrideId ||
        parentItem.smartPricing?.hiddenBOMId ||
        parentItem.smartPricing?.bomTemplateId
    );

    let nextCost = roundToCurrency(resolveStoredCost(variant));

    if (variant.pricingSource === 'static' || parentItem.pricingConfig?.manualOverride) {
        nextCost = roundToCurrency(resolveStoredCost(variant));
    } else if (hasBomSource) {
        const dynamicResult = pricingService.calculateVariantPrice(
            parentItem,
            variant,
            1,
            inventory,
            bomTemplates,
            applicableAdjustments
        );

        nextCost = roundToCurrency(dynamicResult.cost || 0);
    } else if (parentItem.pricingConfig && !parentItem.pricingConfig.manualOverride) {
        const staticSpec = calculateItemFinancials(
            Number(variant.pages || parentItem.pages || 1),
            parentItem.pricingConfig,
            inventory,
            applicableAdjustments
        );

        if (staticSpec) {
            nextCost = roundToCurrency(staticSpec.cost || 0);
        }
    }

    const changed = numbersDiffer(variant.cost, nextVariant.cost) || numbersDiffer(variant.cost_price, nextVariant.cost_price);

    nextVariant.cost = nextCost;
    nextVariant.cost_price = nextCost;
    nextVariant.costPrice = nextCost;

    if (changed) {
        nextVariant.calculatedAt = new Date().toISOString();
        nextVariant.lastCostCalculation = new Date().toISOString();
    }

    return { variant: nextVariant, changed, roundingLog: undefined };
};

const repriceItem = (
    item: Item,
    inventory: Item[],
    bomTemplates: BOMTemplate[],
    allAdjustments: MarketAdjustment[],
    companyConfig?: CompanyConfig
): { item: Item; changed: boolean; variantChanges: number } => {
    const nextItem: Item = { ...item };
    let nextCost = roundToCurrency(resolveStoredCost(item));
    let variantChanges = 0;

    // Internal inventory resources: CP comes from normalizedCP or stored cost; no SP/margin needed
    if (item.inventoryRole === 'internal') {
        nextCost = roundToCurrency(item.normalizedCP ?? resolveStoredCost(item));
        nextItem.normalizedCP = nextCost;
        nextItem.cost = nextCost;
        nextItem.cost_price = nextCost;
        nextItem.costPrice = nextCost;
        // SP stays 0 for internal items
        return { item: nextItem, changed: false, variantChanges: 0 };
    }

    if (item.smartPricing?.bomTemplateId || item.smartPricing?.hiddenBOMId) {
        const bomTemplateId = item.smartPricing?.bomTemplateId || item.smartPricing?.hiddenBOMId;
        const virtualItem: Item = {
            ...item,
            smartPricing: {
                ...item.smartPricing,
                bomTemplateId
            }
        };
        (virtualItem as Item & { printConsumptionEnabled?: boolean }).printConsumptionEnabled = true;

        const bomResult = pricingService.calculateItemPrice(
            virtualItem,
            1,
            undefined,
            Number(item.pages || 1),
            inventory,
            bomTemplates,
            allAdjustments
        );

        nextCost = roundToCurrency(bomResult.cost || resolveStoredCost(item));
    } else if (item.type === 'Service') {
        const serviceResult = pricingService.calculateDynamicServicePrice(
            item,
            Number(item.pages || 1),
            1,
            inventory,
            bomTemplates,
            allAdjustments
        );
        nextCost = roundToCurrency(serviceResult.unitCostPerCopy || resolveStoredCost(item));
    }

    nextItem.cost = nextCost;
    nextItem.cost_price = nextCost;
    nextItem.costPrice = nextCost;

    if (item.variants && item.variants.length > 0) {
        const repricedVariants = item.variants.map((variant) => {
            const result = repriceVariant(item, variant, inventory, bomTemplates, allAdjustments, companyConfig);
            if (result.changed) variantChanges += 1;
            return result.variant;
        });
        nextItem.variants = repricedVariants;
    }

    const changed =
        numbersDiffer(item.cost, nextItem.cost) ||
        numbersDiffer(item.cost_price, nextItem.cost_price);

    return { item: nextItem, changed, variantChanges };
};

export const recalculatePrice = async (
    productId: string,
    companyConfig?: CompanyConfig
): Promise<ProductRecalculateResult> => {
    const [inventory, bomTemplates, adjustments] = await Promise.all([
        dbService.getAll<Item>('inventory'),
        dbService.getAll<BOMTemplate>('bomTemplates'),
        dbService.getAll<MarketAdjustment>('marketAdjustments')
    ]);

    const item = inventory.find((entry) => entry.id === productId);
    if (!item) {
        return { found: false, changed: false };
    }

    const activeAdjustments = adjustments.filter(isAdjustmentActive);
    const configToUse = companyConfig || getStoredConfig();
    const result = repriceItem(item, inventory, bomTemplates, activeAdjustments, configToUse);

    if (result.changed) {
        await dbService.put('inventory', result.item);
    }

    return {
        found: true,
        changed: result.changed,
        item: result.item
    };
};

export const repriceMasterInventoryFromAdjustments = async (
    companyConfig?: CompanyConfig
): Promise<MasterInventoryRepriceResult> => {
    const [inventory, bomTemplates, adjustments] = await Promise.all([
        dbService.getAll<Item>('inventory'),
        dbService.getAll<BOMTemplate>('bomTemplates'),
        dbService.getAll<MarketAdjustment>('marketAdjustments')
    ]);

    const activeAdjustments = adjustments.filter(isAdjustmentActive);
    const candidates = inventory.filter((item) => item.type !== 'Raw Material');
    const updatedItems: Item[] = [];
    let updatedVariantCount = 0;
    const configToUse = companyConfig || getStoredConfig();

    candidates.forEach((item) => {
        const result = repriceItem(item, inventory, bomTemplates, activeAdjustments, configToUse);
        if (result.changed) {
            updatedItems.push(result.item);
            updatedVariantCount += result.variantChanges;
        }
    });

    await Promise.all(updatedItems.map((item) => dbService.put('inventory', item)));

    return {
        totalCandidates: candidates.length,
        activeAdjustments: activeAdjustments.length,
        updatedItems: updatedItems.length,
        updatedVariants: updatedVariantCount
    };
};
