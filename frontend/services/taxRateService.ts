import { dbService } from './db';
import type { TaxRate, Item } from '../types';

export async function getDefaultTaxRate(): Promise<TaxRate | null> {
  const rates = await dbService.getAll<any>('taxRates');
  const defaultRate = rates.find((r: TaxRate) => r.isDefault && r.active);
  return defaultRate || null;
}

export async function getTaxRateForItem(item: Item): Promise<TaxRate | null> {
  const rates = await dbService.getAll<any>('taxRates');
  const activeRates = rates.filter((r: TaxRate) => r.active);

  const itemSpecific = activeRates.find((r: TaxRate) =>
    r.applicableItemTypes?.includes(item.type)
  );
  if (itemSpecific) return itemSpecific;

  const bothType = activeRates.find((r: TaxRate) => r.type === 'both' || r.type === 'sales');
  if (bothType) return bothType;

  return null;
}

export async function getApplicableTaxRate(
  item: Item,
  customerId?: string,
): Promise<{ rate: number; name: string; taxAmount: number }> {
  const taxRate = await getTaxRateForItem(item);
  if (!taxRate || taxRate.rate <= 0) {
    return { rate: 0, name: 'No Tax', taxAmount: 0 };
  }
  const effectiveRate = taxRate.rate;
  return {
    rate: effectiveRate,
    name: taxRate.name,
    taxAmount: 0,
  };
}

export async function calculateItemTax(
  item: Item,
  unitPrice: number,
  quantity: number,
  customerId?: string,
): Promise<{ rate: number; name: string; taxAmount: number; taxableAmount: number }> {
  const taxableAmount = unitPrice * quantity;
  const taxInfo = await getApplicableTaxRate(item, customerId);
  const taxAmount = taxableAmount * (taxInfo.rate / 100);

  return {
    ...taxInfo,
    taxAmount: Math.round(taxAmount * 1000) / 1000,
    taxableAmount,
  };
}

export async function saveTaxRate(rate: TaxRate): Promise<void> {
  await dbService.put('taxRates', rate);
}

export async function getAllTaxRates(): Promise<TaxRate[]> {
  const rates = await dbService.getAll<any>('taxRates');
  return rates as TaxRate[];
}
