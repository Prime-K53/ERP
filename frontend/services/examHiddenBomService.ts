import { BOMTemplate, Item } from '../types';
import { logger } from '@/services/logger';
import { dbService } from './db';
import { 
  resolveExamMaterialEnhanced, 
  MatchResult,
  DEFAULT_PAPER_MATCH_CRITERIA,
  DEFAULT_TONER_MATCH_CRITERIA,
  MatchCriteria
} from './examMaterialMatcher';

export const EXAM_HIDDEN_BOM_TEMPLATE_ID = 'BOM-TPL-EXAM-HIDDEN';
export const EXAM_HIDDEN_BOM_TEMPLATE_NAME = 'Examination Hidden BOM (System)';

// Unit conversion constants
export const EXAM_SHEETS_PER_REAM = 500;
export const EXAM_PAGES_PER_SHEET = 2;
export const EXAM_TONER_PAGES_PER_KG = 20000;
export const EXAM_TONER_PAGES_PER_GRAM = 20; // 20000 pages / 1000g = 20 pages per gram

// Hidden BOM formulas - designed for automatic application
export const EXAM_HIDDEN_BOM_FORMULAS = {
  // Paper: charge per SHEET (not per ream)
  // total_sheets is already calculated in productionCostService with proper rounding
  // 3 pages = 2 sheets, 4 pages = 2 sheets (using Math.ceil(pages/2))
  paper: 'total_sheets',
  
  // Toner: charge per gram (calculated from total pages)
  // 1000g = 20000 pages, so grams = total_pages / 20
  toner: 'total_pages / 20',
} as const;

// Display formulas (for showing in UI with converted units)
export const EXAM_HIDDEN_BOM_DISPLAY_FORMULAS = {
  paper: `ceil(total_pages / 2) * (candidates + extra_copies)`,
  toner: `total_pages / ${EXAM_TONER_PAGES_PER_GRAM}`,
} as const;

type ExamMaterialType = 'paper' | 'toner';

/**
 * Resolve material from inventory by type using enhanced flexible matching.
 * 
 * This function now uses the examMaterialMatcher service for robust product
 * identification that handles:
 * - HP Universal Toner 1kg or equivalent toner products
 * - A4 Paper 80gsm Ream 500 or equivalent paper products
 * 
 * @param inventory - Array of inventory items to search
 * @param type - Material type ('paper' or 'toner')
 * @param preferredId - Optional preferred item ID for exact match
 * @returns The best matching inventory item or undefined
 */
export function resolveExamMaterial(
  inventory: Item[],
  type: ExamMaterialType,
  preferredId?: string
): Item | undefined {
  // Use enhanced matching with flexible criteria
  const result = resolveExamMaterialEnhanced(inventory, type, preferredId);
  
  if (result) {
    // Log match details for debugging
    logger.debug(`[ExamMaterial] Resolved ${type}: ${result.item.name} ` +
      `(score: ${result.score}, confidence: ${result.confidence}, ` +
      `type: ${result.matchType})`);
    return result.item;
  }
  
  return undefined;
}

/**
 * Resolve material with full match result including confidence and score.
 * Use this when you need detailed matching information.
 * 
 * @param inventory - Array of inventory items to search
 * @param type - Material type ('paper' or 'toner')
 * @param preferredId - Optional preferred item ID for exact match
 * @returns Full match result with scoring details
 */
export function resolveExamMaterialWithDetails(
  inventory: Item[],
  type: ExamMaterialType,
  preferredId?: string
): MatchResult | null {
  return resolveExamMaterialEnhanced(inventory, type, preferredId);
}

/**
 * Resolve both paper and toner materials for examination BOM.
 * Returns detailed match results for both materials.
 * 
 * @param inventory - Array of inventory items to search
 * @param paperId - Optional preferred paper item ID
 * @param tonerId - Optional preferred toner item ID
 * @returns Object with paper and toner match results
 */
export function resolveAllExamMaterials(
  inventory: Item[],
  paperId?: string,
  tonerId?: string
): {
  paper: MatchResult | null;
  toner: MatchResult | null;
} {
  return {
    paper: resolveExamMaterialWithDetails(inventory, 'paper', paperId),
    toner: resolveExamMaterialWithDetails(inventory, 'toner', tonerId)
  };
}

/**
 * Build the hidden BOM template with proper unit conversions
 */
export function buildExamHiddenBOMTemplate(params: {
  paperItem?: Item;
  tonerItem?: Item;
  laborCost?: number;
  baseMargin?: number;
  lastUpdated?: string;
}): BOMTemplate {
  const { paperItem, tonerItem, laborCost = 10, baseMargin = 20 } = params;
  const components: BOMTemplate['components'] = [];

  if (paperItem) {
    components.push({
      itemId: paperItem.id,
      name: paperItem.name || 'Paper',
      quantityFormula: EXAM_HIDDEN_BOM_FORMULAS.paper,
      unit: 'sheet', // Display unit is sheet
      consumptionMode: 'UNIT_BASED',
      costRole: 'both',
    });
  }

  if (tonerItem) {
    components.push({
      itemId: tonerItem.id,
      name: tonerItem.name || 'Toner',
      quantityFormula: EXAM_HIDDEN_BOM_FORMULAS.toner,
      unit: 'gram', // Display unit is gram
      consumptionMode: 'UNIT_BASED',
      costRole: 'both',
    });
  }

  return {
    id: EXAM_HIDDEN_BOM_TEMPLATE_ID,
    name: EXAM_HIDDEN_BOM_TEMPLATE_NAME,
    type: 'Examination Hidden BOM',
    components,
    defaultMargin: baseMargin,
    laborCost,
    lastUpdated: params.lastUpdated || new Date().toISOString(),
  };
}

/**
 * Check if the current template matches the hidden BOM template
 */
export function isSameExamHiddenTemplate(
  current: BOMTemplate | undefined,
  next: BOMTemplate
): boolean {
  if (!current) return false;
  if (current.id !== next.id) return false;
  if (current.name !== next.name) return false;
  if (current.type !== next.type) return false;
  if ((current.laborCost || 0) !== (next.laborCost || 0)) return false;
  if ((current.defaultMargin || 0) !== (next.defaultMargin || 0)) return false;
  if ((current.components || []).length !== (next.components || []).length) return false;

  return (next.components || []).every(nextComponent => {
    const currentComponent = (current.components || []).find(component => component.itemId === nextComponent.itemId);
    if (!currentComponent) return false;

    return (
      currentComponent.name === nextComponent.name &&
      currentComponent.quantityFormula === nextComponent.quantityFormula &&
      currentComponent.unit === nextComponent.unit &&
      currentComponent.consumptionMode === nextComponent.consumptionMode &&
      currentComponent.costRole === nextComponent.costRole
    );
  });
}

/**
 * Initialize and save the hidden Examination BOM template
 * This should be called during system bootstrap
 */
export async function initializeExamHiddenBOM(): Promise<BOMTemplate | null> {
  try {
    // Get inventory items
    const inventory = await dbService.getAll<Item>('inventory');
    
    // Find paper and toner items
    const paperItem = resolveExamMaterial(inventory, 'paper');
    const tonerItem = resolveExamMaterial(inventory, 'toner');
    
    // Check if hidden BOM already exists
    const templates = await dbService.getAll<BOMTemplate>('bomTemplates');
    const existingHiddenBOM = templates.find(t => t.id === EXAM_HIDDEN_BOM_TEMPLATE_ID);
    
    // Build the hidden BOM template
    const hiddenBOM = buildExamHiddenBOMTemplate({
      paperItem,
      tonerItem,
      laborCost: 10,
      baseMargin: 20,
      lastUpdated: new Date().toISOString()
    });
    
    // Save or update the hidden BOM
    if (existingHiddenBOM) {
      // Check if it's the same before updating
      if (!isSameExamHiddenTemplate(existingHiddenBOM, hiddenBOM)) {
        await dbService.put('bomTemplates', hiddenBOM);
        logger.debug('[ExamHiddenBOM] Updated hidden Examination BOM template');
      }
    } else {
      await dbService.put('bomTemplates', hiddenBOM);
      logger.debug('[ExamHiddenBOM] Created hidden Examination BOM template');
    }
    
    return hiddenBOM;
  } catch (error) {
    logger.error('[ExamHiddenBOM] Failed to initialize hidden BOM:', error);
    return null;
  }
}

/**
 * Get the hidden Examination BOM template ID
 * This is used as the default for all examination module transactions
 */
export function getExamHiddenBOMId(): string {
  return EXAM_HIDDEN_BOM_TEMPLATE_ID;
}

/**
 * Resolve the effective BOM ID for examination jobs
 * Returns the hidden BOM ID if no specific BOM is provided
 */
export async function resolveExamBOMId(bomId?: string): Promise<string> {
  // If a specific BOM is provided, use it
  if (bomId && bomId.trim()) {
    return bomId.trim();
  }
  
  // Otherwise, return the hidden BOM as default
  return EXAM_HIDDEN_BOM_TEMPLATE_ID;
}
