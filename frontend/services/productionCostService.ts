/**
 * Production Cost Service
 * 
 * Provides unified cost calculation for production operations.
 * Single source of truth for cost calculations across the application.
 */

import { BillOfMaterial, BOMTemplate, Item, MarketAdjustment } from '../types';
import { bomService } from './bomService';
import { SafeFormulaEngine } from './formulaEngine';
import { dbService } from './db';

export interface CostCalculationRequest {
  bomId?: string;
  templateId?: string;
  quantity: number;
  attributes?: Record<string, any>;
  inventory?: Item[];
}

export interface CostBreakdown {
  materialId: string;
  materialName: string;
  quantity: number;
  unitCost: number;
  totalCost: number;
}

export interface CostCalculationResult {
  materialCost: number;
  laborCost: number;
  totalCost: number;
  breakdown: CostBreakdown[];
  adjustments: {
    total: number;
    breakdown: { name: string; amount: number; type: string; value: number }[];
    snapshots: any[];
  };
  metadata: {
    sheetsPerCopy?: number;
    productionCopies?: number;
    baseSheets?: number;
    wasteSheets?: number;
    totalSheets?: number;
    tonerKgs?: number;
  };
}

export interface VarianceAnalysis {
  plannedCost: number;
  actualCost: number;
  variance: number;
  variancePercent: number;
  materialVariances: {
    materialId: string;
    materialName: string;
    plannedQty: number;
    actualQty: number;
    plannedCost: number;
    actualCost: number;
    variance: number;
  }[];
}

class ProductionCostService {
  /**
   * Calculate production cost using BOM or template
   */
  async calculateCost(request: CostCalculationRequest): Promise<CostCalculationResult> {
    const { bomId, templateId, quantity, attributes = {}, inventory: providedInventory } = request;
    
    // Get inventory if not provided
    const inventory = providedInventory || await dbService.getAll<Item>('inventory');
    
    // Try to find BOM first, then template
    let bom: BillOfMaterial | undefined;
    let template: BOMTemplate | undefined;
    
    if (bomId) {
      const boms = await bomService.getBOMs();
      bom = boms.find(b => b.id === bomId);
    }
    
    if (!bom && templateId) {
      const templates = await bomService.getBOMTemplates();
      template = templates.find(t => t.id === templateId);
    }
    
    if (!bom && !template) {
      throw new Error('No BOM or template found for cost calculation');
    }
    
    const components = bom?.components || template?.components || [];
    const laborCost = bom?.laborCost || template?.laborCost || 0;
    
    // Calculate material costs
    let materialCost = 0;
    const breakdown: CostBreakdown[] = [];
    let tonerKgs = 0;
    
    // Calculate sheet-related metadata for examination printing
    const pages = attributes.pages || 0;
    const candidates = attributes.candidates || 0;
    const extraCopies = attributes.extra_copies || 0;
    const sheetsPerCopy = pages > 0 ? Math.ceil(pages / 2) : 0;
    const productionCopies = candidates + extraCopies;
    const baseSheets = sheetsPerCopy * productionCopies;
    const wastePercentage = attributes.wastePercentage || 0.05;
    const wasteSheets = Math.ceil(baseSheets * wastePercentage);
    const totalSheets = baseSheets + wasteSheets;
    const totalPages = totalSheets * 2;
    
    for (const comp of components) {
      const materialId = comp.materialId || comp.itemId;
      const materialName = comp.name || 'Unknown Material';
      const material = inventory.find(i => i.id === materialId || i.name === materialName);
      const unitCost = material?.cost || comp.cost || 0;
      
      // Calculate quantity
      let qty = comp.quantity || 1;
      
      // Resolve formula if present
      const formula = comp.quantityFormula || comp.formula;
      if (formula) {
        qty = SafeFormulaEngine.evaluate(formula, {
          ...attributes,
          pages,
          candidates,
          total_sheets: totalSheets,
          total_pages: totalPages,
          production_copies: productionCopies,
          quantity
        });
      } else if (comp.quantity) {
        qty = comp.quantity * quantity;
      }

      let conversion = material?.conversionRate || 1;
      const unitLower = (material?.unit || '').toLowerCase();
      if (!material?.conversionRate || material.conversionRate <= 0) {
        if (unitLower.includes('ream')) conversion = 500;
        else if (unitLower.includes('kg')) conversion = 1000;
      }
      const costPerUsageUnit = conversion > 0 ? unitCost / conversion : unitCost;
      const totalCost = qty * costPerUsageUnit;
      materialCost += totalCost;

      breakdown.push({
        materialId: materialId || '',
        materialName: material?.name || materialName,
        quantity: qty,
        unitCost: costPerUsageUnit,
        totalCost
      });
      
      // Track toner separately
      if (materialName.toLowerCase().includes('toner') || 
          material?.name?.toLowerCase().includes('toner')) {
        tonerKgs += qty / 1000;
      }
    }
    
    // Calculate market adjustments
    const adjustments = await this.calculateAdjustments(materialCost + laborCost);
    
    const totalCost = materialCost + laborCost + adjustments.total;
    
    return {
      materialCost,
      laborCost,
      totalCost,
      breakdown,
      adjustments,
      metadata: {
        sheetsPerCopy,
        productionCopies,
        baseSheets,
        wasteSheets,
        totalSheets,
        tonerKgs
      }
    };
  }
  
  /**
   * Calculate market adjustments
   */
  private async calculateAdjustments(baseAmount: number): Promise<CostCalculationResult['adjustments']> {
    const adjustments = await dbService.getAll<MarketAdjustment>('marketAdjustments');
    const activeAdjustments = adjustments.filter(a => a.active ?? a.isActive);
    
    let total = 0;
    const breakdown: { name: string; amount: number; type: string; value: number }[] = [];
    const snapshots: any[] = [];
    
    for (const adj of activeAdjustments) {
      let amount = 0;
      const isPercentage = adj.type === 'PERCENTAGE' || adj.type === 'PERCENT' || adj.type === 'percentage';
      
      if (isPercentage) {
        amount = baseAmount * ((adj.percentage || adj.value) / 100);
      } else {
        amount = adj.value;
      }
      
      total += amount;
      
      breakdown.push({
        name: adj.name,
        amount,
        type: adj.type,
        value: adj.value
      });
      
      snapshots.push({
        adjustmentId: adj.id,
        name: adj.name,
        type: adj.type,
        value: adj.value,
        calculatedAmount: amount
      });
    }
    
    return { total, breakdown, snapshots };
  }
  
  /**
   * Calculate variance between planned and actual costs
   */
  calculateVariance(planned: CostCalculationResult, actual: {
    materialCost: number;
    laborCost: number;
    breakdown: { materialId: string; quantity: number; unitCost: number }[];
  }): VarianceAnalysis {
    const plannedCost = planned.totalCost;
    const actualCost = actual.materialCost + actual.laborCost + planned.adjustments.total;
    const variance = actualCost - plannedCost;
    const variancePercent = plannedCost > 0 ? (variance / plannedCost) * 100 : 0;
    
    // Calculate material-level variances
    const materialVariances = planned.breakdown.map(plannedItem => {
      const actualItem = actual.breakdown.find(a => a.materialId === plannedItem.materialId);
      const actualQty = actualItem?.quantity || 0;
      const actualUnitCost = actualItem?.unitCost || plannedItem.unitCost;
      const actualTotalCost = actualQty * actualUnitCost;
      
      return {
        materialId: plannedItem.materialId,
        materialName: plannedItem.materialName,
        plannedQty: plannedItem.quantity,
        actualQty,
        plannedCost: plannedItem.totalCost,
        actualCost: actualTotalCost,
        variance: actualTotalCost - plannedItem.totalCost
      };
    });
    
    return {
      plannedCost,
      actualCost,
      variance,
      variancePercent,
      materialVariances
    };
  }
  
  /**
   * Quick cost estimate for examination printing
   */
  async estimateExamCost(params: {
    pages: number;
    candidates: number;
    extraCopies: number;
    bomTemplateId: string;
  }): Promise<CostCalculationResult> {
    const { pages, candidates, extraCopies, bomTemplateId } = params;
    
    return this.calculateCost({
      templateId: bomTemplateId,
      quantity: candidates + extraCopies,
      attributes: {
        pages,
        candidates,
        extra_copies: extraCopies
      }
    });
  }
  
  /**
   * Get cost history for analysis
   */
  async getCostHistory(workOrderId: string): Promise<{
    planned: CostCalculationResult | null;
    actual: CostCalculationResult | null;
    variance: VarianceAnalysis | null;
  }> {
    // This would typically fetch from a cost history table
    // For now, return null - can be implemented when cost history persistence is added
    return {
      planned: null,
      actual: null,
      variance: null
    };
  }
}

export const productionCostService = new ProductionCostService();
export default productionCostService;
