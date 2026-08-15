// DO NOT USE IN PRODUCTION - This file is for reference only
// All pricing MUST go through pricingEngine.ts
import { calculateSellingPrice } from '../../src/utils/pricing/pricingEngine';
import { SnapshotEntry } from '../../src/utils/pricing/types';
import { Item, CartItem } from '../types';

export interface AddItemToCartOptions {
  item: Item;
  quantity: number;
  variantId?: string;
  existingAdjustments?: SnapshotEntry[];
}

export async function addItemToCartWithPricing(options: AddItemToCartOptions): Promise<CartItem> {
  const { item, quantity, variantId, existingAdjustments } = options;
  
  const baseItem = item.parentId 
    ? (inventory.find(i => i.id === item.parentId) || item)
    : item;
    
  const vId = item.parentId ? item.id : undefined;
  const baseCost = Number(baseItem.cost) || 0;
  const basePrice = Number(baseItem.price) || baseCost;
  
  const pricing = await calculateSellingPrice({
    itemId: baseItem.id,
    categoryId: baseItem.category,
    baseCost: baseCost,
    basePrice: basePrice,
    quantity: quantity,
    adjustments: existingAdjustments,
    context: 'POS'
  });
  
  const dynamicLine: CartItem = {
    ...item,
    quantity: quantity,
    price: pricing.unitPrice,
    cost: pricing.cost,
    basePrice: basePrice,
    adjustmentSnapshots: pricing.adjustmentSnapshots,
    adjustmentTotal: pricing.adjustmentTotal
  } as CartItem;
  
  return dynamicLine;
}

export async function recalculateItemPrice(
  cartItem: CartItem,
  newQuantity: number,
  inventory: Item[]
): Promise<CartItem> {
  const baseItemId = cartItem.parentId || cartItem.id.split('::')[0];
  const baseItem = inventory.find(i => i.id === baseItemId) || cartItem;
  
  const pricing = await calculateSellingPrice({
    itemId: baseItem.id,
    categoryId: baseItem.category,
    baseCost: Number(baseItem.cost) || 0,
    basePrice: Number(baseItem.price) || baseItem.cost,
    quantity: newQuantity,
    adjustments: cartItem.adjustmentSnapshots,
    context: 'POS'
  });
  
  return {
    ...cartItem,
    quantity: newQuantity,
    price: pricing.unitPrice,
    cost: pricing.cost,
    adjustmentSnapshots: pricing.adjustmentSnapshots,
    adjustmentTotal: pricing.adjustmentTotal
  } as CartItem;
}

// Example only - use calculateServicePrice from pricingEngine directly
export async function EXAMPLE_calculateServicePrice(
  service: Item,
  pages: number,
  copies: number,
  marketAdjustments: any[] = [],
  inventory: Item[] = [],
  bomTemplates: any[] = []
): Promise<{
  unitPricePerCopy: number;
  unitCostPerCopy: number;
  totalPrice: number;
  totalCost: number;
  adjustmentSnapshots: SnapshotEntry[];
  adjustmentTotal: number;
}> {
  const baseCost = Number(service.cost) || 0;
  const totalPages = pages * copies;
  const totalCost = baseCost * totalPages;
  const unitCost = baseCost;
  
  const marketAdjSnapshots: SnapshotEntry[] = (marketAdjustments || [])
    .filter((ma: any) => ma.active ?? ma.isActive)
    .map((adj: any) => {
      const isPct = adj.type === 'PERCENTAGE' || adj.type === 'PERCENT' || adj.type === 'percentage';
      const value = Number(adj.value) || 0;
      const calcAmount = isPct
        ? totalCost * (value / 100)
        : value * totalPages;
        
      return {
        name: adj.name,
        type: isPct ? 'PERCENTAGE' as const : 'FIXED' as const,
        value,
        percentage: isPct ? value : undefined,
        calculatedAmount: calcAmount
      };
    });
  
  const pricing = await calculateSellingPrice({
    itemId: service.id,
    categoryId: service.category,
    baseCost: totalCost,
    basePrice: totalCost,
    quantity: copies,
    adjustments: marketAdjSnapshots,
    context: 'SERVICE'
  });
  
  return {
    unitPricePerCopy: pricing.unitPrice,
    unitCostPerCopy: pricing.cost,
    totalPrice: pricing.totalPrice,
    totalCost: pricing.cost,
    adjustmentSnapshots: pricing.adjustmentSnapshots,
    adjustmentTotal: pricing.adjustmentTotal
  };
}