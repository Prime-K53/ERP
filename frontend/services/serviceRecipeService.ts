import type {
  ServiceRecipe, ServiceRecipeLine, ServiceResource,
  ServiceResourceType, Variant
} from '../types';
import { dbService } from './db';
import { productionDb } from './productionDb';

export interface RecipeCostBreakdown {
  totalMaterialCost: number;
  totalLaborCost: number;
  totalMachineCost: number;
  totalOverheadCost: number;
  totalCost: number;
  lines: ServiceRecipeLine[];
}

export interface RecipeValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

const generateId = (): string =>
  'SR_' + Date.now().toString(36).toUpperCase() + '_' + Math.random().toString(36).substring(2, 7).toUpperCase();

class ServiceRecipeService {
  /**
   * Calculate cost for a single recipe line.
   */
  calculateLineCost(line: ServiceRecipeLine, resource?: ServiceResource): number {
    if (resource) {
      return resource.costPerUnit * line.quantity;
    }
    return line.costPerUnit * line.quantity;
  }

  /**
   * Full cost calculation for a recipe.
   * Iterates all lines, categorizes by resource type, computes totals.
   */
  calculateRecipeCost(recipe: ServiceRecipe, resources?: ServiceResource[]): RecipeCostBreakdown {
    const lines = recipe.lines.map(line => {
      const resource = resources?.find(r => r.id === line.resourceId);
      const totalCost = this.calculateLineCost(line, resource);
      return { ...line, totalCost, costPerUnit: resource?.costPerUnit ?? line.costPerUnit };
    });

    let totalMaterialCost = 0;
    let totalLaborCost = 0;
    let totalMachineCost = 0;
    let totalOverheadCost = 0;

    for (const line of lines) {
      switch (line.resourceType) {
        case 'inventory':
          totalMaterialCost += line.totalCost;
          break;
        case 'labor':
          totalLaborCost += line.totalCost;
          break;
        case 'machine':
          totalMachineCost += line.totalCost;
          break;
        case 'expense':
          totalOverheadCost += line.totalCost;
          break;
        case 'service':
          totalOverheadCost += line.totalCost;
          break;
      }
    }

    const totalCost = totalMaterialCost + totalLaborCost + totalMachineCost + totalOverheadCost;

    return {
      totalMaterialCost,
      totalLaborCost,
      totalMachineCost,
      totalOverheadCost,
      totalCost,
      lines,
    };
  }

  /**
   * Recalculate and persist the recipe with updated costs.
   * This is the primary method to call when a recipe or its resources change.
   */
  async recalculateCosts(
    recipe: ServiceRecipe,
    resources?: ServiceResource[]
  ): Promise<ServiceRecipe> {
    const breakdown = this.calculateRecipeCost(recipe, resources);
    const updated: ServiceRecipe = {
      ...recipe,
      lines: breakdown.lines,
      totalMaterialCost: breakdown.totalMaterialCost,
      totalLaborCost: breakdown.totalLaborCost,
      totalMachineCost: breakdown.totalMachineCost,
      totalOverheadCost: breakdown.totalOverheadCost,
      totalCost: breakdown.totalCost,
      lastCalculatedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    return updated;
  }

  /**
   * Calculate the cost price for a single unit of the variant
   * based on the recipe (assuming recipe is for 1 unit of the service).
   */
  async calculateVariantCostPrice(
    variant: Variant,
    recipe: ServiceRecipe,
    resources?: ServiceResource[],
    quantity: number = 1
  ): Promise<{ costPrice: number; breakdown: RecipeCostBreakdown }> {
    const breakdown = this.calculateRecipeCost(recipe, resources);
    return {
      costPrice: breakdown.totalCost / quantity,
      breakdown,
    };
  }

  // ─── CRUD ─────────────────────────────────────

  async getAllRecipes(variantId?: string): Promise<ServiceRecipe[]> {
    try {
      const all = await productionDb.serviceRecipes.toArray() as ServiceRecipe[];
      return variantId ? all.filter(r => r.variantId === variantId) : all;
    } catch {
      const all = await dbService.getAll<ServiceRecipe>('serviceRecipes');
      return variantId ? all.filter(r => r.variantId === variantId) : all;
    }
  }

  async getRecipe(id: string): Promise<ServiceRecipe | undefined> {
    try { return await productionDb.serviceRecipes.get(id); }
    catch { return dbService.get<ServiceRecipe>('serviceRecipes', id); }
  }

  async getActiveRecipe(variantId: string): Promise<ServiceRecipe | undefined> {
    const recipes = await this.getAllRecipes(variantId);
    return recipes.find(r => r.active && !r.validTo);
  }

  async saveRecipe(recipe: ServiceRecipe): Promise<ServiceRecipe> {
    const isNew = !recipe.id;
    const now = new Date().toISOString();
    const toSave: ServiceRecipe = {
      ...recipe,
      id: recipe.id || generateId(),
      version: recipe.version || 1,
      createdAt: recipe.createdAt || now,
      updatedAt: now,
      lastCalculatedAt: recipe.lastCalculatedAt || null,
    };

    if (isNew) {
      toSave.version = 1;
    }

    try { await productionDb.serviceRecipes.put(toSave); }
    catch { await dbService.put('serviceRecipes', toSave); }

    return toSave;
  }

  async deleteRecipe(id: string): Promise<void> {
    try { await productionDb.serviceRecipes.delete(id); }
    catch { await dbService.delete('serviceRecipes', id); }
  }

  async createNewVersion(
    recipe: ServiceRecipe,
    changeLog?: string
  ): Promise<ServiceRecipe> {
    const newVersion: ServiceRecipe = {
      ...recipe,
      id: generateId(),
      version: recipe.version + 1,
      validFrom: new Date().toISOString(),
      validTo: undefined,
      changeLog: changeLog || `Version ${recipe.version + 1}`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      lastCalculatedAt: null,
    };

    // Deprecate old version
    const oldRecipe = { ...recipe, validTo: new Date().toISOString(), updatedAt: new Date().toISOString() };
    try { await productionDb.serviceRecipes.put(oldRecipe); }
    catch { await dbService.put('serviceRecipes', oldRecipe); }

    return this.saveRecipe(newVersion);
  }

  // ─── Validation ───────────────────────────────

  validateRecipe(recipe: Partial<ServiceRecipe>): RecipeValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!recipe.variantId) errors.push('Recipe must be linked to a variant');
    if (!recipe.lines || recipe.lines.length === 0) warnings.push('Recipe has no lines — cost will be zero');

    if (recipe.lines) {
      recipe.lines.forEach((line, i) => {
        if (!line.resourceId) errors.push(`Line ${i + 1}: missing resource`);
        if (!line.quantity || line.quantity <= 0) errors.push(`Line ${i + 1}: quantity must be positive`);
      });
    }

    return { valid: errors.length === 0, errors, warnings };
  }
}

export const serviceRecipeService = new ServiceRecipeService();
