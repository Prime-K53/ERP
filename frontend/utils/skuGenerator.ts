import { Item, ProductVariant } from '../types';

const CATEGORY_PREFIXES: Record<string, string> = {
  raw: 'MAT',
  product: 'PRD',
  service: 'SER',
  stationery: 'STA',
  'Raw Material': 'MAT',
  Material: 'MAT',
  Product: 'PRD',
  Service: 'SER',
  Stationery: 'STA',
};

const CATEGORY_FROM_TYPE: Record<string, string> = {
  'Raw Material': 'raw',
  Product: 'product',
  Service: 'service',
  Stationery: 'stationery',
};

export const generateAutoSKU = (categoryOrType: string, name: string, attributes?: Record<string, string | number>, collection?: any[]): string => {
  const cat = CATEGORY_FROM_TYPE[categoryOrType] || categoryOrType;
  const prefix = CATEGORY_PREFIXES[cat] || 'ITM';

  if (collection && collection.length > 0) {
    let maxNum = 0;
    collection.forEach((item: any) => {
      const sku = String(item?.sku || '');
      if (!sku.startsWith('INV-')) return;
      const parts = sku.split('-');
      const last = parts[parts.length - 1];
      const parsed = parseInt(last, 10);
      if (!Number.isNaN(parsed) && parsed > maxNum) maxNum = parsed;
    });
    return `INV-${prefix}-${String(maxNum + 1).padStart(4, '0')}`;
  }

  return `INV-${prefix}-0001`;
};

export const generateAutoBarcode = (): string => {
    // EAN-13 style (12 digits + checksum is complex, so just 12 random digits for now)
    // Or just 12 random digits
    let barcode = '';
    for (let i = 0; i < 12; i++) {
        barcode += Math.floor(Math.random() * 10);
    }
    return barcode;
};

export const generateBulkVariants = (
    basePrice: number,
    baseCost: number,
    bulkAttributes: { name: string, values: string[] }[]
): Partial<ProductVariant>[] => {
    if (bulkAttributes.length === 0) return [];

    // Cartesian product of arrays
    const cartesian = (...a: any[][]) => a.reduce((a, b) => a.flatMap(d => b.map(e => [d, e].flat())));

    // Extract values arrays
    const valuesArrays = bulkAttributes.map(attr => attr.values);

    // Generate combinations
    // If only one attribute, cartesian logic needs array of arrays
    const combinations = bulkAttributes.length === 1
        ? valuesArrays[0].map(v => [v])
        : cartesian(...valuesArrays);

    return combinations.map(combo => {
        const attributes: Record<string, string> = {};
        let nameSuffix = '';

        // combo is array of values corresponding to bulkAttributes order
        combo.forEach((val: string, index: number) => {
            const attrName = bulkAttributes[index].name;
            attributes[attrName] = val;
            nameSuffix += ` ${val}`;
        });

        // Generate ID parts
        const variantId = 'var_' + Date.now().toString(36) + Math.random().toString(36).substr(2, 5);

        // Generate SKU for variant
        // We don't have item name here easily, so we returns partial and let caller handle naming if possible
        // But we returned full objects.

        return {
            id: variantId,
            name: nameSuffix.trim(), // Will be appended to Item Name
            attributes: attributes,
            price: basePrice,
            cost: baseCost,
            stock: 0,
            pages: 1,
            sku: '' // Placeholder, caller should generate
        };
    });
};
