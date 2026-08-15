import { dbService } from './db';
import type { PurchaseLot } from '../types/inventory';

export async function addPurchaseLot(lot: PurchaseLot): Promise<void> {
  const lots = await dbService.getAll<any>('purchaseLots');
  lots.push(lot);
  await dbService.put('purchaseLots', lot);
}

export async function getActiveLots(itemId: string): Promise<PurchaseLot[]> {
  const lots = await dbService.getAll<any>('purchaseLots');
  return lots.filter(
    (l: any) => l.itemId === itemId && (l.remainingConsumption || 0) > 0
  ).sort((a: any, b: any) => new Date(a.purchaseDate).getTime() - new Date(b.purchaseDate).getTime());
}

export async function consumeFromLots(
  itemId: string,
  quantity: number,
): Promise<{ lotsConsumed: { lotId: string; quantity: number; unitCost: number }[]; totalCost: number }> {
  const activeLots = await getActiveLots(itemId);
  let remainingQty = quantity;
  const lotsConsumed: { lotId: string; quantity: number; unitCost: number }[] = [];
  let totalCost = 0;

  for (const lot of activeLots) {
    if (remainingQty <= 0) break;

    const takeFromLot = Math.min(remainingQty, lot.remainingConsumption);
    const cost = takeFromLot * lot.unitCostPerConsumption;

    lot.remainingConsumption -= takeFromLot;
    await dbService.put('purchaseLots', lot);

    lotsConsumed.push({
      lotId: lot.id,
      quantity: takeFromLot,
      unitCost: lot.unitCostPerConsumption,
    });

    totalCost += cost;
    remainingQty -= takeFromLot;
  }

  return { lotsConsumed, totalCost };
}

export async function getFifoUnitCost(itemId: string): Promise<number> {
  const activeLots = await getActiveLots(itemId);
  if (activeLots.length === 0) return 0;

  const totalRemaining = activeLots.reduce((sum, l) => sum + l.remainingConsumption, 0);
  if (totalRemaining <= 0) return 0;

  const totalValue = activeLots.reduce((sum, l) => sum + l.remainingConsumption * l.unitCostPerConsumption, 0);
  return totalValue / totalRemaining;
}
