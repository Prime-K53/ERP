import type { Item, ProductVariant, Variant, VariantUnit, UnitConversion, ProductType } from '../types';

let _counter = 0;
function uid(): string {
  _counter++;
  return `tmp_${_counter}_${Date.now()}`;
}

function buildDefaultUnits(item: Item, variant: Variant): VariantUnit[] {
  const units: VariantUnit[] = [];
  const stockingUnit = item.unit || 'pcs';

  units.push({
    unit: stockingUnit,
    isStockingUnit: true,
    isPurchaseUnit: true,
    isUsageUnit: true,
    conversions: [],
  });

  if (item.isStationeryPack && item.unitsPerPack && item.unitsPerPack > 0) {
    const packConversions: UnitConversion[] = [
      {
        fromUnit: 'packs',
        toUnit: stockingUnit,
        factor: item.unitsPerPack,
      },
    ];
    units.push({
      unit: 'packs',
      isStockingUnit: false,
      isPurchaseUnit: true,
      isUsageUnit: false,
      conversions: packConversions,
    });
    variant.stockingUnit = stockingUnit;
  }

  if (item.conversionRate && item.conversionRate > 0 && item.purchaseUnit && item.usageUnit) {
    units[0].conversions.push({
      fromUnit: item.purchaseUnit,
      toUnit: item.usageUnit,
      factor: item.conversionRate,
    });
    units[0].isPurchaseUnit = true;
    units[0].isUsageUnit = true;
  }

  if (item.purchaseUnit && item.purchaseUnit !== stockingUnit) {
    const existing = units.find(u => u.unit === item.purchaseUnit);
    if (existing) {
      existing.isPurchaseUnit = true;
    } else {
      units.push({
        unit: item.purchaseUnit,
        isStockingUnit: false,
        isPurchaseUnit: true,
        isUsageUnit: false,
        conversions: [],
      });
    }
  }

  if (item.usageUnit && item.usageUnit !== stockingUnit && item.usageUnit !== item.purchaseUnit) {
    const existing = units.find(u => u.unit === item.usageUnit);
    if (existing) {
      existing.isUsageUnit = true;
    } else {
      units.push({
        unit: item.usageUnit,
        isStockingUnit: false,
        isPurchaseUnit: false,
        isUsageUnit: true,
        conversions: [],
      });
    }
  }

  return units;
}

export function toVariant(item: Item, pv?: ProductVariant): Variant {
  const id = pv?.id || uid();
  const variant: Variant = {
    id,
    itemId: item.id,
    name: pv?.name || item.name,
    sku: pv?.sku || item.sku,
    barcode: item.barcode,
    active: pv?.active ?? true,
    source: item.isStationeryPack ? 'purchased' : 'manual',
    attributes: pv?.attributes,
    costPrice: pv?.costPrice ?? item.costPrice ?? item.cost ?? 0,
    sellingPrice: pv?.sellingPrice ?? item.sellingPrice ?? item.selling_price ?? item.price ?? 0,
    profitAmount: pv?.profitAmount ?? item.profitAmount ?? 0,
    profitMargin: pv?.profitMargin ?? item.profitMargin ?? 0,
    minimumMargin: pv?.minimumMargin ?? item.minimumMargin ?? 0,
    pricingValidated: pv?.pricingValidated ?? item.pricingValidated ?? false,
    pricingVersion: item.pricingVersion,
    validationTimestamp: item.validationTimestamp,
    lastCostCalculation: pv?.lastCostCalculation,
    bomVersion: pv?.bomVersion,
    serviceRecipeId: item.serviceRecipeId || pv?.recipeId,
    productType: item.productType || (item.type === 'Service' ? 'SERVICE' as ProductType : undefined),
    costMethod: item.productType === 'SERVICE' || item.type === 'Service' ? 'mixed' as const : undefined,
    stockingUnit: item.unit || 'pcs',
    stock: pv?.stock ?? item.stock ?? 0,
    pages: pv?.pages ?? item.pages,
  };

  variant.units = buildDefaultUnits(item, variant);

  return variant;
}
