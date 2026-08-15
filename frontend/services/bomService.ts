import { BillOfMaterial, BOMTemplate } from '../types';
import { initDB } from './db';
import { productionDb } from './productionDb';
import { SafeFormulaEngine, FormulaEvaluationResult } from './formulaEngine';
import { repriceMasterInventoryFromAdjustments } from './masterInventoryPricingService';

export const bomService = {
  formulaEngine: new SafeFormulaEngine(),

  async getBOMs(): Promise<BillOfMaterial[]> {
    try { return await productionDb.boms.toArray(); } catch { const db = await initDB(); return db.getAll('boms'); }
  },

  async getBOMTemplates(): Promise<BOMTemplate[]> {
    try { return await productionDb.bomTemplates.toArray(); } catch { const db = await initDB(); return db.getAll('bomTemplates'); }
  },

  async saveBOM(bom: BillOfMaterial): Promise<void> {
    try { await productionDb.boms.put(bom); } catch { const db = await initDB(); await db.put('boms', bom); }
  },

  async saveBOMTemplate(template: BOMTemplate): Promise<void> {
    try { await productionDb.bomTemplates.put(template); } catch { const db = await initDB(); await db.put('bomTemplates', template); }
    await repriceMasterInventoryFromAdjustments();
  },

  async deleteBOM(id: string): Promise<void> {
    try { await productionDb.boms.delete(id); } catch { const db = await initDB(); await db.delete('boms', id); }
  },

  async deleteBOMTemplate(id: string): Promise<void> {
    try { await productionDb.bomTemplates.delete(id); } catch { const db = await initDB(); await db.delete('bomTemplates', id); }
    await repriceMasterInventoryFromAdjustments();
  },

  resolveFormula(formula: string, attributes: Record<string, any>): number {
    const result: FormulaEvaluationResult = this.formulaEngine.evaluateWithResult(formula, attributes);
    return result.success ? result.value : 0;
  },

  calculateVariantBOM(bom: BillOfMaterial, variant: { attributes: Record<string, any> }, materials: any[]): { totalProductionCost: number } {
    let totalMaterialCost = 0;
    
    if (bom.components) {
      bom.components.forEach(comp => {
        const matId = comp.materialId || comp.itemId;
        const material = materials.find(m => m.id === matId);
        if (material) {
          let qty = comp.quantity;
          const f = comp.formula ?? comp.quantityFormula;
          if (f) {
            qty = this.resolveFormula(f, variant.attributes);
          }
          const conversion = material.conversionRate || 1;
          const baseCost = material.cost || 0;
          const costPerUsageUnit = baseCost / conversion;
          totalMaterialCost += qty * costPerUsageUnit;
        }
      });
    }

    return {
      totalProductionCost: totalMaterialCost
    };
  }
};
