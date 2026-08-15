import { dbService } from '../../services/db';
import { Item, ProductVariant, BOMTemplate, FinishingOption } from '../../types';

interface RecalculateResult {
    updatedItems: number;
    updatedVariants: number;
    errors: string[];
}

export const repairVariantPricing = async (
    inventory: Item[],
    _marketAdjustments: any[],
    bomTemplates: BOMTemplate[]
): Promise<RecalculateResult> => {
    let updatedItemsCount = 0;
    let updatedVariantsCount = 0;
    const errors: string[] = [];

    const updatedItems: Item[] = [];

    for (const item of inventory) {
        if (!item.variants || item.variants.length === 0) continue;

        let itemChanged = false;
        const newVariants = [...item.variants];

        for (let i = 0; i < newVariants.length; i++) {
            const variant = newVariants[i];
            const hasZeroCost = !variant.cost || variant.cost <= 0;

            if (hasZeroCost) {
                try {
                    const result = recalculateVariantCost(item, variant, inventory, bomTemplates);
                    if (result) {
                        newVariants[i] = {
                            ...variant,
                            cost: result.cost,
                            cost_price: result.cost_price,
                            updatedAt: new Date().toISOString()
                        };
                        itemChanged = true;
                        updatedVariantsCount++;
                    }
                } catch (err: any) {
                    errors.push(`Error recalculating variant ${variant.sku}: ${err.message}`);
                }
            }
        }

        if (itemChanged) {
            const updatedItem = {
                ...item,
                variants: newVariants,
                isVariantParent: true
            };
            updatedItems.push(updatedItem);
            updatedItemsCount++;
        }
    }

    for (const item of updatedItems) {
        try {
            await dbService.put('inventory', item);
        } catch (err: any) {
            errors.push(`Failed to save item ${item.sku}: ${err.message}`);
        }
    }

    return {
        updatedItems: updatedItemsCount,
        updatedVariants: updatedVariantsCount,
        errors
    };
};

function recalculateVariantCost(
    parent: Item,
    _variant: ProductVariant,
    inventory: Item[],
    _bomTemplates: BOMTemplate[]
) {
    const sp = parent.smartPricing;
    if (!sp) return null;

    const pages = Number(_variant.pages) || 1;

    let paperCost = 0;
    const paper = inventory.find((i: Item) => i.id === sp.paperItemId);
    if (paper) {
        const sheetsPerCopy = Math.ceil(pages / 2);
        const paperExt = paper as Item & { conversion_rate?: number; cost_per_unit?: number };
        const reamSize = Number(paperExt.conversionRate || paperExt.conversion_rate || 500);
        const paperUnitCost = Number(paperExt.cost_price || paperExt.cost_per_unit || paper.cost || 0);
        const costPerSheet = reamSize > 0 ? paperUnitCost / reamSize : 0;
        paperCost = Number((sheetsPerCopy * costPerSheet).toFixed(2));
    }

    let tonerCost = 0;
    const toner = inventory.find((i: Item) => i.id === sp.tonerItemId);
    if (toner) {
        const capacity = 20000;
        const totalPages = pages;
        const tonerExt = toner as Item & { cost_per_unit?: number };
        const tonerUnitCost = Number(tonerExt.cost_price || tonerExt.cost_per_unit || toner.cost || 0);
        tonerCost = Number((totalPages * (tonerUnitCost / capacity)).toFixed(2));
    }

    // Finishing cost — once per item, not per copy/page
    let finishingCost = 0;
    const finishingOpts = (sp as any).finishingOptions as FinishingOption[] | undefined;
    const finishingEnabled = (sp as any).finishingEnabled as string[] | undefined;
    if (finishingOpts && finishingOpts.length > 0) {
        finishingCost = finishingOpts
            .filter((o: FinishingOption) => o.enabled)
            .reduce((sum: number, o: FinishingOption) => sum + (o.price || 0), 0);
    } else if (finishingEnabled && finishingEnabled.length > 0) {
        const savedFinishing = (parent as any).printFinishing as Array<{ id: string; price: number }> | undefined;
        if (savedFinishing && savedFinishing.length > 0) {
            finishingCost = finishingEnabled.reduce((sum: number, id: string) => {
                const opt = savedFinishing.find((f: { id: string; price: number }) => f.id === id);
                return sum + (opt?.price || 0);
            }, 0);
        }
    }

    const baseCost = Number((paperCost + tonerCost + finishingCost).toFixed(2));

    return {
        cost: baseCost,
        cost_price: baseCost,
    };
}
