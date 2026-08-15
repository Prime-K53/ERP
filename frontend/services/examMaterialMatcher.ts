/**
 * Examination Material Matcher Service
 * 
 * Provides flexible product matching for examination consumables.
 * Handles automatic search and identification of:
 * - HP Universal Toner 1kg or equivalent toner products
 * - A4 Paper 80gsm Ream 500 or equivalent paper products
 * 
 * Features:
 * - Multi-criteria matching (specifications, keywords, category)
 * - Tolerance-based specification matching
 * - Priority scoring for best match selection
 * - Fallback chain for robust material resolution
 * 
 * @module examMaterialMatcher
 */

import { Item } from '../types';
import { logger } from '../services/logger';
import { dbService } from './db';

// ============================================================================
// Type Definitions
// ============================================================================

/**
 * Paper product specifications
 */
export interface PaperSpecification {
  size?: 'A4' | 'A3' | 'Letter' | 'Legal';
  weight?: number;           // GSM (e.g., 80, 90, 100)
  sheetsPerReam?: number;    // Typically 500
  weightTolerance?: number;  // Acceptable variance in GSM
  type?: 'Bond' | 'Copy' | 'Premium' | 'Recycled' | 'Any';
}

/**
 * Toner product specifications
 */
export interface TonerSpecification {
  brand?: string;            // 'HP', 'Canon', 'Brother', 'Generic', 'Any'
  type?: 'Universal' | 'OEM' | 'Compatible' | 'Any';
  weight?: number;           // Weight value
  weightUnit?: 'kg' | 'g';
  weightTolerance?: number;  // Acceptable variance (percentage)
  color?: 'Black' | 'Cyan' | 'Magenta' | 'Yellow' | 'Any';
}

/**
 * Keyword matching configuration
 */
export interface KeywordPatterns {
  primary: string[];         // Must match at least one for high confidence
  secondary: string[];       // Bonus points if matched
  exclude?: string[];        // Exclude from results if matched
}

/**
 * Category constraints for filtering
 */
export interface CategoryConstraint {
  mustInclude?: string[];    // Category must contain at least one
  mustExclude?: string[];    // Category must not contain any
}

/**
 * Complete match criteria configuration
 */
export interface MatchCriteria {
  productIds?: string[];     // Known product IDs for exact matching
  specifications?: {
    paper?: PaperSpecification;
    toner?: TonerSpecification;
  };
  keywordPatterns: KeywordPatterns;
  categoryConstraint?: CategoryConstraint;
}

/**
 * Result of a product match operation
 */
export interface MatchResult {
  item: Item;
  score: number;             // 0-100 match score
  matchType: 'exact' | 'specification' | 'keyword' | 'fallback';
  matchedAttributes: string[];
  confidence: 'high' | 'medium' | 'low';
}

/**
 * Material type for examination BOM
 */
export type ExamMaterialType = 'paper' | 'toner';

/**
 * Configuration for default materials
 */
export interface BOMDefaultMaterial {
  id: string;
  materialType: ExamMaterialType;
  preferredItemId?: string;
  fallbackItemIds?: string[];
  matchCriteria: MatchCriteria;
  createdAt?: string;
  updatedAt?: string;
}

// ============================================================================
// Predefined Configurations
// ============================================================================

/**
 * Default match criteria for A4 Paper 80gsm Ream 500
 * 
 * This configuration matches:
 * - Exact: "A4 Paper 80gsm Ream 500"
 * - Equivalent: A4 paper with 75-85 gsm weight
 * - Fallback: Any A4 paper or paper product
 */
export const DEFAULT_PAPER_MATCH_CRITERIA: MatchCriteria = {
  specifications: {
    paper: {
      size: 'A4',
      weight: 80,
      sheetsPerReam: 500,
      weightTolerance: 5,      // Accept 75-85 gsm
      type: 'Any'
    }
  },
  keywordPatterns: {
    primary: ['paper', 'a4', 'ream'],
    secondary: [
      '80gsm', '80 gsm', '80-gsm',
      '500 sheets', '500sheets',
      'copy paper', 'bond paper', 'printing paper',
      'a4 paper', 'a4paper'
    ],
    exclude: ['photo', 'glossy', 'cardstock', 'card stock', 'photo paper']
  },
  categoryConstraint: {
    mustInclude: ['paper', 'stationery', 'consumable', 'supplies'],
    mustExclude: ['equipment', 'machine', 'printer', 'copier']
  }
};

/**
 * Default match criteria for HP Universal Toner 1kg
 * 
 * This configuration matches:
 * - Exact: "HP Universal Toner 1kg"
 * - Equivalent: Universal toner with 0.9-1.1 kg weight
 * - Fallback: Any toner product
 */
export const DEFAULT_TONER_MATCH_CRITERIA: MatchCriteria = {
  specifications: {
    toner: {
      brand: 'HP',
      type: 'Universal',
      weight: 1,
      weightUnit: 'kg',
      weightTolerance: 0.1,    // Accept ±10%
      color: 'Black'
    }
  },
  keywordPatterns: {
    primary: ['toner', 'hp universal', '1kg', 'universal toner'],
    secondary: [
      'hp toner', 'laser toner', 'black toner',
      'universal', '1 kg', '1kg toner',
      'hp universal toner', 'hpuniversal',
      'toner powder', 'bulk toner'
    ],
    exclude: [
      'ink', 'cartridge', 'color', 'cyan', 'magenta', 'yellow',
      'drum', 'fuser', 'inkjet'
    ]
  },
  categoryConstraint: {
    mustInclude: ['toner', 'consumable', 'supplies'],
    mustExclude: ['printer', 'machine', 'equipment', 'copier']
  }
};

// ============================================================================
// Matching Algorithm Implementation
// ============================================================================

/**
 * Score an inventory item against match criteria
 * 
 * @param item - Inventory item to score
 * @param criteria - Match criteria configuration
 * @returns Match result with score and confidence level
 */
export function scoreItem(
  item: Item,
  criteria: MatchCriteria
): MatchResult | null {
  let score = 0;
  const matchedAttributes: string[] = [];
  let matchType: MatchResult['matchType'] = 'fallback';
  let confidence: MatchResult['confidence'] = 'low';

  const name = (item.name || '').toLowerCase();
  const category = (item.category || '').toLowerCase();
  const description = (item.description || '').toLowerCase();
  const searchText = `${name} ${category} ${description}`;

  // 1. Check product IDs (exact match - highest priority)
  if (criteria.productIds?.includes(item.id)) {
    return {
      item,
      score: 100,
      matchType: 'exact',
      matchedAttributes: ['id'],
      confidence: 'high'
    };
  }

  // 2. Check category constraints first (filter out non-matching)
  if (criteria.categoryConstraint) {
    const categoryResult = scoreCategoryConstraint(category, criteria.categoryConstraint);
    if (categoryResult === 0) {
      return null; // Item excluded by category constraints
    }
    if (categoryResult > 0) {
      score += categoryResult;
      matchedAttributes.push('category');
    }
  }

  // 3. Check specification matching
  const specResult = scoreSpecifications(item, criteria.specifications);
  if (specResult.score > 0) {
    score += specResult.score;
    matchedAttributes.push(...specResult.matchedAttributes);
    if (specResult.score >= 40) {
      matchType = 'specification';
      confidence = specResult.score >= 60 ? 'high' : 'medium';
    }
  }

  // 4. Check keyword patterns
  const keywordResult = scoreKeywords(searchText, criteria.keywordPatterns);
  if (keywordResult.score > 0) {
    score += keywordResult.score;
    matchedAttributes.push(...keywordResult.matchedAttributes);
    if (matchType === 'fallback' && keywordResult.score >= 20) {
      matchType = 'keyword';
      confidence = keywordResult.score >= 40 ? 'medium' : 'low';
    }
  }

  // Determine final confidence based on total score
  if (score >= 70) {
    confidence = 'high';
  } else if (score >= 40) {
    confidence = confidence === 'low' ? 'medium' : confidence;
  }

  return score > 0 ? {
    item,
    score: Math.min(score, 100),
    matchType,
    matchedAttributes: [...new Set(matchedAttributes)], // Remove duplicates
    confidence
  } : null;
}

/**
 * Score item against specification criteria
 */
function scoreSpecifications(
  item: Item,
  specifications?: MatchCriteria['specifications']
): { score: number; matchedAttributes: string[] } {
  const result = { score: 0, matchedAttributes: [] as string[] };

  if (!specifications) return result;

  // Check paper specifications
  if (specifications.paper) {
    const paperScore = scorePaperSpecification(item, specifications.paper);
    result.score += paperScore.score;
    result.matchedAttributes.push(...paperScore.matchedAttributes);
  }

  // Check toner specifications
  if (specifications.toner) {
    const tonerScore = scoreTonerSpecification(item, specifications.toner);
    result.score += tonerScore.score;
    result.matchedAttributes.push(...tonerScore.matchedAttributes);
  }

  return result;
}

/**
 * Score item against paper specifications
 */
function scorePaperSpecification(
  item: Item,
  spec: PaperSpecification
): { score: number; matchedAttributes: string[] } {
  const result = { score: 0, matchedAttributes: [] as string[] };
  const name = (item.name || '').toLowerCase();
  const description = (item.description || '').toLowerCase();
  const searchText = `${name} ${description}`;

  // Check paper size (A4, A3, etc.)
  if (spec.size) {
    const sizePattern = spec.size.toLowerCase();
    if (searchText.includes(sizePattern)) {
      result.score += 15;
      result.matchedAttributes.push(`size:${spec.size}`);
    }
  }

  // Check paper weight (GSM)
  if (spec.weight) {
    const tolerance = spec.weightTolerance || 5;
    const minWeight = spec.weight - tolerance;
    const maxWeight = spec.weight + tolerance;

    // Look for weight patterns in the name/description
    const weightPatterns = [
      /(\d+)\s*gsm/i,
      /(\d+)\s*g\/m/i,
      /(\d+)gsm/i,
      /(\d+)\s*gram/i
    ];

    for (const pattern of weightPatterns) {
      const match = searchText.match(pattern);
      if (match) {
        const foundWeight = parseInt(match[1], 10);
        if (foundWeight >= minWeight && foundWeight <= maxWeight) {
          result.score += 20;
          result.matchedAttributes.push(`weight:${foundWeight}gsm`);
          break;
        } else if (foundWeight >= spec.weight - (tolerance * 2) && foundWeight <= spec.weight + (tolerance * 2)) {
          // Extended tolerance - lower score
          result.score += 10;
          result.matchedAttributes.push(`weight:${foundWeight}gsm~`);
          break;
        }
      }
    }
  }

  // Check sheets per ream
  if (spec.sheetsPerReam) {
    const reamPattern = new RegExp(`${spec.sheetsPerReam}\\s*(sheets?|pcs?|pages?)`, 'i');
    if (reamPattern.test(searchText) || searchText.includes(`${spec.sheetsPerReam}sheets`)) {
      result.score += 10;
      result.matchedAttributes.push(`sheets:${spec.sheetsPerReam}`);
    }
  }

  // Check paper type
  if (spec.type && spec.type !== 'Any') {
    if (searchText.includes(spec.type.toLowerCase())) {
      result.score += 5;
      result.matchedAttributes.push(`type:${spec.type}`);
    }
  }

  return result;
}

/**
 * Score item against toner specifications
 */
function scoreTonerSpecification(
  item: Item,
  spec: TonerSpecification
): { score: number; matchedAttributes: string[] } {
  const result = { score: 0, matchedAttributes: [] as string[] };
  const name = (item.name || '').toLowerCase();
  const description = (item.description || '').toLowerCase();
  const searchText = `${name} ${description}`;

  // Check brand
  if (spec.brand && spec.brand !== 'Any') {
    const brandPattern = spec.brand.toLowerCase();
    if (searchText.includes(brandPattern)) {
      result.score += 15;
      result.matchedAttributes.push(`brand:${spec.brand}`);
    }
  }

  // Check toner type (Universal, OEM, Compatible)
  if (spec.type && spec.type !== 'Any') {
    const typePattern = spec.type.toLowerCase();
    if (searchText.includes(typePattern)) {
      result.score += 15;
      result.matchedAttributes.push(`type:${spec.type}`);
    }
  }

  // Check weight
  if (spec.weight) {
    const tolerance = spec.weightTolerance || 0.1;
    const minWeight = spec.weight * (1 - tolerance);
    const maxWeight = spec.weight * (1 + tolerance);

    // Look for weight patterns
    const weightPatterns = [
      /(\d+(?:\.\d+)?)\s*kg/i,
      /(\d+(?:\.\d+)?)\s*kilogram/i,
      /(\d+(?:\.\d+)?)\s*g\b/i,
      /(\d+(?:\.\d+)?)\s*gram/i
    ];

    for (const pattern of weightPatterns) {
      const match = searchText.match(pattern);
      if (match) {
        let foundWeight = parseFloat(match[1]);
        
        // Convert grams to kg if needed
        if ((match[0].includes('g') && !match[0].includes('kg')) || 
            match[0].includes('gram')) {
          if (foundWeight > 10) { // Likely grams, not kg
            foundWeight = foundWeight / 1000;
          }
        }

        if (foundWeight >= minWeight && foundWeight <= maxWeight) {
          result.score += 20;
          result.matchedAttributes.push(`weight:${foundWeight}kg`);
          break;
        }
      }
    }
  }

  // Check color (default to Black for exam printing)
  if (spec.color && spec.color !== 'Any') {
    const colorPattern = spec.color.toLowerCase();
    if (searchText.includes(colorPattern) || 
        (spec.color === 'Black' && !/cyan|magenta|yellow|color|colour/i.test(searchText))) {
      result.score += 10;
      result.matchedAttributes.push(`color:${spec.color}`);
    }
  }

  return result;
}

/**
 * Score item against keyword patterns
 */
function scoreKeywords(
  searchText: string,
  patterns: KeywordPatterns
): { score: number; matchedAttributes: string[] } {
  const result = { score: 0, matchedAttributes: [] as string[] };
  const text = searchText.toLowerCase();

  // Check for excluded keywords first
  if (patterns.exclude) {
    for (const exclude of patterns.exclude) {
      if (text.includes(exclude.toLowerCase())) {
        return { score: 0, matchedAttributes: ['excluded'] };
      }
    }
  }

  // Score primary keywords (higher weight)
  let primaryMatches = 0;
  for (const keyword of patterns.primary) {
    if (text.includes(keyword.toLowerCase())) {
      primaryMatches++;
      result.matchedAttributes.push(`primary:${keyword}`);
    }
  }
  result.score += primaryMatches * 15; // 15 points per primary match

  // Score secondary keywords (lower weight)
  let secondaryMatches = 0;
  for (const keyword of patterns.secondary) {
    if (text.includes(keyword.toLowerCase())) {
      secondaryMatches++;
      result.matchedAttributes.push(`secondary:${keyword}`);
    }
  }
  result.score += secondaryMatches * 5; // 5 points per secondary match

  return result;
}

/**
 * Score category constraints
 */
function scoreCategoryConstraint(
  category: string,
  constraint: CategoryConstraint
): number {
  const cat = category.toLowerCase();

  // Check must exclude
  if (constraint.mustExclude) {
    for (const exclude of constraint.mustExclude) {
      if (cat.includes(exclude.toLowerCase())) {
        return 0; // Excluded
      }
    }
  }

  // Check must include
  if (constraint.mustInclude) {
    for (const include of constraint.mustInclude) {
      if (cat.includes(include.toLowerCase())) {
        return 10; // Matches category constraint
      }
    }
    // If mustInclude is specified but none match, still allow
    // (category might not be set properly)
    return 5;
  }

  return 5; // No constraint, neutral score
}

/**
 * Find the best matching item from inventory
 * 
 * @param inventory - Array of inventory items to search
 * @param criteria - Match criteria configuration
 * @returns Best match result or null if no match found
 */
export function findBestMatch(
  inventory: Item[],
  criteria: MatchCriteria
): MatchResult | null {
  const results: MatchResult[] = [];

  for (const item of inventory) {
    const result = scoreItem(item, criteria);
    if (result && result.score > 0) {
      results.push(result);
    }
  }

  // Sort by score descending, then by confidence
  results.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    const confidenceOrder = { high: 3, medium: 2, low: 1 };
    return confidenceOrder[b.confidence] - confidenceOrder[a.confidence];
  });

  return results[0] || null;
}

/**
 * Find all matching items from inventory sorted by score
 * 
 * @param inventory - Array of inventory items to search
 * @param criteria - Match criteria configuration
 * @param minScore - Minimum score threshold (default: 20)
 * @returns Array of match results sorted by score
 */
export function findAllMatches(
  inventory: Item[],
  criteria: MatchCriteria,
  minScore: number = 20
): MatchResult[] {
  const results: MatchResult[] = [];

  for (const item of inventory) {
    const result = scoreItem(item, criteria);
    if (result && result.score >= minScore) {
      results.push(result);
    }
  }

  // Sort by score descending
  results.sort((a, b) => b.score - a.score);

  return results;
}

// ============================================================================
// Material Resolution Service
// ============================================================================

/**
 * Resolve examination material with flexible matching
 * 
 * Resolution order:
 * 1. Check for configured preferred item ID
 * 2. Check for fallback item IDs
 * 3. Use flexible matching criteria
 * 4. Legacy keyword fallback
 * 
 * @param inventory - Array of inventory items
 * @param materialType - Type of material ('paper' or 'toner')
 * @param preferredId - Optional preferred item ID
 * @param config - Optional custom match criteria
 */
export function resolveExamMaterialEnhanced(
  inventory: Item[],
  materialType: ExamMaterialType,
  preferredId?: string,
  config?: MatchCriteria
): MatchResult | null {
  // 1. Check for preferred ID first (respect user-selected material regardless of stock)
  if (preferredId) {
    const preferred = inventory.find(item => item.id === preferredId);
    if (preferred) {
      return {
        item: preferred,
        score: 100,
        matchType: 'exact',
        matchedAttributes: ['preferredId'],
        confidence: 'high'
      };
    }
  }

  // 2. Use provided config or default criteria
  const criteria = config || 
    (materialType === 'paper' ? DEFAULT_PAPER_MATCH_CRITERIA : DEFAULT_TONER_MATCH_CRITERIA);

  // 3. Find best match using flexible criteria
  const match = findBestMatch(inventory, criteria);

  if (match) {
    return match;
  }

  // 4. Legacy fallback - simple keyword search
  const keyword = materialType.toLowerCase();
  const fallbackItem = inventory.find(item => {
    const name = (item.name || '').toLowerCase();
    const category = (item.category || '').toLowerCase();
    const unit = (item.unit || '').toLowerCase();
    return name.includes(keyword) || category.includes(keyword) || unit.includes(keyword);
  });

  if (fallbackItem) {
    return {
      item: fallbackItem,
      score: 10,
      matchType: 'fallback',
      matchedAttributes: ['keyword'],
      confidence: 'low'
    };
  }

  return null;
}

/**
 * Resolve both paper and toner for examination BOM
 * 
 * @param inventory - Array of inventory items
 * @param paperId - Optional preferred paper ID
 * @param tonerId - Optional preferred toner ID
 * @returns Object with paper and toner match results
 */
export function resolveExamMaterials(
  inventory: Item[],
  paperId?: string,
  tonerId?: string
): {
  paper: MatchResult | null;
  toner: MatchResult | null;
} {
  return {
    paper: resolveExamMaterialEnhanced(inventory, 'paper', paperId),
    toner: resolveExamMaterialEnhanced(inventory, 'toner', tonerId)
  };
}

// ============================================================================
// Database Integration
// ============================================================================

/**
 * Load BOM default material configuration from database
 */
export async function loadBOMDefaultMaterial(
  materialType: ExamMaterialType
): Promise<BOMDefaultMaterial | null> {
  try {
    const configs = await dbService.getAll<BOMDefaultMaterial>('bomDefaultMaterials');
    return configs.find(c => c.materialType === materialType) || null;
  } catch (error) {
    logger.error(`[ExamMaterialMatcher] Failed to load BOM default for ${materialType}:`, error);
    return null;
  }
}

/**
 * Save BOM default material configuration to database
 */
export async function saveBOMDefaultMaterial(
  config: BOMDefaultMaterial
): Promise<void> {
  try {
    await dbService.put('bomDefaultMaterials', {
      ...config,
      updatedAt: new Date().toISOString()
    });
  } catch (error) {
    logger.error(`[ExamMaterialMatcher] Failed to save BOM default:`, error);
    throw error;
  }
}

/**
 * Resolve material using database configuration
 */
export async function resolveMaterialFromConfig(
  inventory: Item[],
  materialType: ExamMaterialType
): Promise<MatchResult | null> {
  // Load configuration from database
  const config = await loadBOMDefaultMaterial(materialType);

  if (config) {
    // Try preferred item
    if (config.preferredItemId) {
      const preferred = inventory.find(item => item.id === config.preferredItemId);
      if (preferred) {
        return {
          item: preferred,
          score: 100,
          matchType: 'exact',
          matchedAttributes: ['preferredId'],
          confidence: 'high'
        };
      }
    }

    // Try fallback items
    if (config.fallbackItemIds && config.fallbackItemIds.length > 0) {
      for (const fallbackId of config.fallbackItemIds) {
        const item = inventory.find(i => i.id === fallbackId);
        if (item) {
          return {
            item,
            score: 90,
            matchType: 'exact',
            matchedAttributes: ['fallbackId'],
            confidence: 'high'
          };
        }
      }
    }

    // Use match criteria from config
    if (config.matchCriteria) {
      const match = findBestMatch(inventory, config.matchCriteria);
      if (match) return match;
    }
  }

  // Fall back to default criteria
  return resolveExamMaterialEnhanced(inventory, materialType);
}

// ============================================================================
// Export Default Object
// ============================================================================

export default {
  // Core matching functions
  scoreItem,
  findBestMatch,
  findAllMatches,
  
  // Material resolution
  resolveExamMaterialEnhanced,
  resolveExamMaterials,
  resolveMaterialFromConfig,
  
  // Configuration management
  loadBOMDefaultMaterial,
  saveBOMDefaultMaterial,
  
  // Default configurations
  DEFAULT_PAPER_MATCH_CRITERIA,
  DEFAULT_TONER_MATCH_CRITERIA
};
