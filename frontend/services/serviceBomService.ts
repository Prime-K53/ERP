import type { BOMTemplate } from '../types';
import type {
  ServiceRecipe, ServiceRecipeLine, ServiceCostMethod,
  ServiceResource
} from '../types/service';
import { bomService } from './bomService';
import { serviceRecipeService } from './serviceRecipeService';

interface BOMComponentMeta {
  itemId: string;
  name: string;
  formula?: string;
  /** @deprecated Use formula instead */
  quantityFormula?: string;
  quantity: number;
}

/**
 * Bridges the existing BOMTemplate system with the ServiceRecipe architecture.
 * Converts BOMTemplates (used for printing services) into ServiceRecipes
 * with proper cost categorization (materials, labor, machine, overhead).
 */
class ServiceBOMService {
  /**
   * Convert a BOMTemplate into a ServiceRecipe with cost calculation.
   * The BOM becomes a "material_based" or "mixed" recipe depending on whether
   * it has labor/machine lines.
   */
  async convertBOMTemplateToRecipe(
    template: BOMTemplate,
    variantId: string,
    attributes?: Record<string, any>,
    materials?: any[]
  ): Promise<ServiceRecipe> {
    const costMethod: ServiceCostMethod = 'mixed';
    const lines: ServiceRecipeLine[] = [];
    const components = (template as BOMTemplate & { components?: BOMComponentMeta[] }).components || [];

    for (let i = 0; i < components.length; i++) {
      const comp: BOMComponentMeta = components[i];
      const material = materials?.find((m: any) => m.id === comp.itemId);

      let qty = comp.quantity || 1;
      const formula = comp.formula ?? comp.quantityFormula;
      if (formula && attributes) {
        qty = bomService.resolveFormula(formula, attributes);
      }

      const costPerUnit = material?.cost || 0;
      const totalCost = costPerUnit * qty;

      const isPaper = comp.name?.toLowerCase().includes('paper');
      const isToner = comp.name?.toLowerCase().includes('toner') || comp.name?.toLowerCase().includes('ink');
      const isMachine = comp.name?.toLowerCase().includes('machine') || comp.name?.toLowerCase().includes('printer');
      const isLabor = comp.name?.toLowerCase().includes('labor') || comp.name?.toLowerCase().includes('operator');

      let resourceType: ServiceRecipeLine['resourceType'] = 'inventory';
      if (isMachine) resourceType = 'machine';
      else if (isLabor) resourceType = 'labor';
      else if (!isPaper && !isToner) resourceType = 'expense';

      lines.push({
        id: `${variantId}_bom_${i}`,
        recipeId: '',
        lineIndex: i,
        resourceType,
        resourceId: comp.itemId || `bom_${i}`,
        resourceName: comp.name || material?.name || `Component ${i + 1}`,
        quantity: qty,
        unit: material?.unit || 'pcs',
        costPerUnit,
        totalCost,
        formula: comp.formula ?? comp.quantityFormula,
        notes: isPaper ? 'Paper' : isToner ? 'Toner/Ink' : undefined,
      });
    }

    // Calculate totals
    const breakdown = serviceRecipeService.calculateRecipeCost(
      { id: '', variantId, version: 1, name: template.name || '', active: true, costMethod, lines, totalMaterialCost: 0, totalLaborCost: 0, totalMachineCost: 0, totalOverheadCost: 0, totalCost: 0, lastCalculatedAt: null, validFrom: new Date().toISOString(), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
    );

    const now = new Date().toISOString();
    return {
      id: '',
      variantId,
      version: 1,
      name: template.name || `Recipe for ${variantId}`,
      active: true,
      costMethod,
      bomTemplateId: template.id,
      lines: breakdown.lines,
      totalMaterialCost: breakdown.totalMaterialCost,
      totalLaborCost: breakdown.totalLaborCost,
      totalMachineCost: breakdown.totalMachineCost,
      totalOverheadCost: breakdown.totalOverheadCost,
      totalCost: breakdown.totalCost,
      lastCalculatedAt: now,
      validFrom: now,
      createdAt: now,
      updatedAt: now,
    };
  }

  /**
   * Calculate service cost price from a BOM template, variant attributes, and material costs.
   * Used for real-time preview in the variant form.
   */
  calculateBOMServiceCost(
    bomTemplate: BOMTemplate,
    attributes?: Record<string, any>,
    materials?: any[],
    quantity: number = 1
  ): { costPrice: number; lines: ServiceRecipeLine[] } {
    const components = (bomTemplate as BOMTemplate & { components?: BOMComponentMeta[] }).components || [];
    const lines: ServiceRecipeLine[] = [];

    for (let i = 0; i < components.length; i++) {
      const comp: BOMComponentMeta = components[i];
      const material = materials?.find((m: any) => m.id === comp.itemId);

      let qty = comp.quantity || 1;
      const formula = comp.formula ?? comp.quantityFormula;
      if (formula && attributes) {
        qty = bomService.resolveFormula(formula, attributes);
      }

      const costPerUnit = material?.cost || 0;
      const totalCost = costPerUnit * qty;

      const isPaper = comp.name?.toLowerCase().includes('paper');
      const isToner = comp.name?.toLowerCase().includes('toner') || comp.name?.toLowerCase().includes('ink');
      const isMachine = comp.name?.toLowerCase().includes('machine') || comp.name?.toLowerCase().includes('printer');
      const isLabor = comp.name?.toLowerCase().includes('labor') || comp.name?.toLowerCase().includes('operator');

      let resourceType: ServiceRecipeLine['resourceType'] = 'inventory';
      if (isMachine) resourceType = 'machine';
      else if (isLabor) resourceType = 'labor';
      else if (!isPaper && !isToner) resourceType = 'expense';

      lines.push({
        id: `calc_${i}`,
        recipeId: '',
        lineIndex: i,
        resourceType,
        resourceId: comp.itemId || `calc_${i}`,
        resourceName: comp.name || material?.name || `Component ${i + 1}`,
        quantity: qty,
        unit: material?.unit || 'pcs',
        costPerUnit,
        totalCost: totalCost * quantity,
        formula: comp.formula ?? comp.quantityFormula,
      });
    }

    const totalCost = lines.reduce((s, l) => s + l.totalCost, 0);
    return {
      costPrice: quantity > 0 ? totalCost / quantity : totalCost,
      lines,
    };
  }

  /**
   * Get all BOM templates suitable for services.
   */
  async getServiceBOMTemplates(): Promise<BOMTemplate[]> {
    return bomService.getBOMTemplates();
  }

  /**
   * Persist the converted recipe and link it to a variant.
   */
  async saveServiceBOMRecipe(
    recipe: ServiceRecipe,
    variantId: string
  ): Promise<ServiceRecipe> {
    const saved = await serviceRecipeService.saveRecipe(recipe);
    return saved;
  }
}

export const serviceBomService = new ServiceBOMService();
