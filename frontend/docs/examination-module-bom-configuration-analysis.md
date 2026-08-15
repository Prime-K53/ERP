# Bill of Materials (BOM) Configuration Analysis
## Examination Module - Consumable Component Tracking System

**Document Version:** 1.0  
**Date:** February 24, 2026  
**Author:** System Analysis Team  

---

## Executive Summary

This document provides a comprehensive analysis of the Bill of Materials (BOM) configuration within the Prime ERP System's examination module. The analysis focuses on the automatic search and identification of critical examination consumables—specifically **HP Universal Toner 1kg** (or equivalent toner products) and **A4 Paper 80gsm Ream 500** (or equivalent paper products)—ensuring consistent availability and accurate inventory tracking regardless of product naming variations or supplier descriptions.

---

## Table of Contents

1. [Current Architecture Overview](#1-current-architecture-overview)
2. [BOM Configuration Structure](#2-bom-configuration-structure)
3. [Material Resolution System](#3-material-resolution-system)
4. [Flexible Product Matching Design](#4-flexible-product-matching-design)
5. [Implementation Recommendations](#5-implementation-recommendations)
6. [Database Schema Analysis](#6-database-schema-analysis)
7. [Configuration Guidelines](#7-configuration-guidelines)
8. [Testing & Validation](#8-testing--validation)

---

## 1. Current Architecture Overview

### 1.1 System Components

The examination module BOM system consists of the following key components:

| Component | Location | Purpose |
|-----------|----------|---------|
| [`examinationService.cjs`](server/services/examinationService.cjs:1) | `server/services/` | Backend service for BOM calculations and inventory deduction |
| [`examHiddenBomService.ts`](services/examHiddenBomService.ts:1) | `services/` | Hidden BOM template management for automatic material resolution |
| [`examPricingService.ts`](services/examPricingService.ts:1) | `services/` | Cost calculation engine with BOM integration |
| [`InventoryContext.tsx`](context/InventoryContext.tsx:1) | `context/` | Frontend inventory state management |
| [`types.ts`](types.ts:1894) | Root | TypeScript type definitions for BOM structures |
| [`db.cjs`](server/db.cjs:1) | `server/` | SQLite database schema and initialization |

### 1.2 Data Flow Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        EXAMINATION MODULE BOM FLOW                          │
└─────────────────────────────────────────────────────────────────────────────┘

┌──────────────┐    ┌──────────────────┐    ┌─────────────────────┐
│  User Creates│───▶│  Examination     │───▶│  BOM Calculation    │
│  Exam Batch  │    │  Service         │    │  Triggered          │
└──────────────┘    └──────────────────┘    └─────────────────────┘
                                                    │
                                                    ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                        MATERIAL RESOLUTION PROCESS                            │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────────────┐         ┌─────────────────────┐                    │
│  │  PAPER RESOLUTION   │         │  TONER RESOLUTION   │                    │
│  ├─────────────────────┤         ├─────────────────────┤                    │
│  │ 1. Check Preferred  │         │ 1. Check Preferred  │                    │
│  │    Paper ID         │         │    Toner ID         │                    │
│  │                     │         │                     │                    │
│  │ 2. Keyword Search:  │         │ 2. Keyword Search:  │                    │
│  │    - "paper"        │         │    - "toner"        │                    │
│  │    - "a4"           │         │    - "hp universal" │                    │
│  │    - "ream"         │         │    - "1kg"          │                    │
│  │    - "80gsm"        │         │                     │                    │
│  │                     │         │ 3. Category Match:  │                    │
│  │ 3. Category Match:  │         │    - "Toner"        │                    │
│  │    - "Paper"        │         │    - "Consumables"  │                    │
│  │    - "Stationery"   │         │                     │                    │
│  └─────────────────────┘         └─────────────────────┘                    │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
                                                    │
                                                    ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                        BOM CALCULATION ENGINE                                 │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Paper Formula:  total_sheets = ceil(pages / 2) × (candidates + extra)      │
│  Toner Formula:  grams = total_pages / 20  (20 pages per gram)              │
│                                                                              │
│  Constants:                                                                  │
│  - SHEETS_PER_REAM = 500                                                    │
│  - PAGES_PER_SHEET = 2 (duplex printing)                                    │
│  - TONER_PAGES_PER_KG = 20,000                                              │
│  - TONER_PAGES_PER_GRAM = 20                                                │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
                                                    │
                                                    ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                        INVENTORY DEDUCTION                                    │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────────────┐         ┌─────────────────────┐                    │
│  │  Paper Deduction    │         │  Toner Deduction    │                    │
│  ├─────────────────────┤         ├─────────────────────┤                    │
│  │  Quantity: Reams    │         │  Quantity: kg       │                    │
│  │  = total_sheets/500 │         │  = total_pages/20000│                    │
│  │                     │         │                     │                    │
│  │  Transaction Log:   │         │  Transaction Log:   │                    │
│  │  - Reference: Batch │         │  - Reference: Batch │                    │
│  │  - Type: OUT        │         │  - Type: OUT        │                    │
│  │  - Reason: Exam     │         │  - Reason: Exam     │                    │
│  └─────────────────────┘         └─────────────────────┘                    │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. BOM Configuration Structure

### 2.1 Core Type Definitions

The examination module uses several TypeScript interfaces for BOM configuration:

#### [`ExamBOMConfig`](types.ts:1894)

```typescript
interface ExamBOMConfig {
  pricingModel: 'per-learner' | 'per-page' | 'cost-plus';
  paperId: string;              // Reference to paper inventory item
  tonerId: string;              // Reference to toner inventory item
  baseMargin: number;           // Profit margin percentage
  marketAdjustmentId?: string;  // Optional market adjustment rule
  laborCostPerHour: number;     // Labor cost for production
  defaultWastePercentage: number; // Waste factor (typically 5%)
  extraCopiesFree: boolean;     // Extra copies not billed, only materials deducted
}
```

#### [`BOMTemplate`](types.ts:2236)

```typescript
interface BOMTemplate {
  id: string;
  name: string;
  type: string;
  components: {
    itemId: string;
    name: string;
    quantityFormula: string;  // e.g., "total_sheets" or "total_pages / 20"
    unit: string;             // 'sheet', 'gram', 'kg', 'ream'
    consumptionMode?: 'PAGE_BASED' | 'UNIT_BASED';
    costRole?: 'production' | 'inventory' | 'both';
  }[];
  defaultMargin?: number;
  laborCost?: number;
  lastUpdated?: string;
}
```

#### [`MaterialCategory`](types.ts:2154)

```typescript
interface MaterialCategory {
  id: string;
  name: string;           // 'Paper', 'Toner', 'Ink', etc.
  description?: string;
  unit: string;           // 'reams', 'kg', 'cartridges'
  conversionRate: number; // sheets per unit (e.g., 500 sheets per ream)
  defaultCost?: number;
  reorderPoint?: number;
  preferredSupplier?: string;
  color?: string;         // UI color for category identification
  isActive?: boolean;
}
```

### 2.2 Hidden BOM Template

The system uses a "Hidden BOM" pattern for examination materials:

```typescript
// From examHiddenBomService.ts
export const EXAM_HIDDEN_BOM_TEMPLATE_ID = 'BOM-TPL-EXAM-HIDDEN';
export const EXAM_HIDDEN_BOM_TEMPLATE_NAME = 'Examination Hidden BOM (System)';

// Unit conversion constants
export const EXAM_SHEETS_PER_REAM = 500;
export const EXAM_PAGES_PER_SHEET = 2;
export const EXAM_TONER_PAGES_PER_KG = 20000;
export const EXAM_TONER_PAGES_PER_GRAM = 20;

// Hidden BOM formulas
export const EXAM_HIDDEN_BOM_FORMULAS = {
  paper: 'total_sheets',           // Charge per sheet
  toner: 'total_pages / 20',       // Charge per gram
};
```

---

## 3. Material Resolution System

### 3.1 Current Resolution Logic

The [`resolveExamMaterial()`](services/examHiddenBomService.ts:36) function handles material lookup:

```typescript
export function resolveExamMaterial(
  inventory: Item[],
  type: ExamMaterialType,
  preferredId?: string
): Item | undefined {
  // 1. Check for preferred ID first
  if (preferredId) {
    const preferred = inventory.find(item => item.id === preferredId);
    if (preferred) return preferred;
  }

  // 2. Fallback to keyword search
  const keyword = type.toLowerCase();
  return inventory.find(item => {
    const name = (item.name || '').toLowerCase();
    const category = (item.category || '').toLowerCase();
    const unit = (item.unit || '').toLowerCase();

    return name.includes(keyword) || 
           category.includes(keyword) || 
           unit.includes(keyword);
  });
}
```

### 3.2 Current Limitations

The current implementation has several limitations:

1. **Simple keyword matching** - Only checks if the keyword exists anywhere in the name/category
2. **No specification matching** - Cannot match "80gsm" or "1kg" specifications
3. **No equivalent product detection** - Cannot identify products with equivalent functionality
4. **No priority scoring** - Returns first match rather than best match
5. **No supplier variation handling** - Different suppliers may use different naming conventions

---

## 4. Flexible Product Matching Design

### 4.1 Enhanced Product Matching System

To address the requirements for **HP Universal Toner 1kg** and **A4 Paper 80gsm Ream 500**, we propose an enhanced matching system:

#### 4.1.1 Product Specification Schema

```typescript
interface ProductSpecification {
  // Paper Specifications
  paperSize?: 'A4' | 'A3' | 'Letter' | 'Legal';
  paperWeight?: number;           // GSM (e.g., 80, 90, 100)
  paperQuantity?: number;         // Sheets per ream (typically 500)
  paperType?: 'Bond' | 'Copy' | 'Premium' | 'Recycled';
  
  // Toner Specifications
  tonerBrand?: string;            // 'HP', 'Canon', 'Brother', 'Generic'
  tonerType?: 'Universal' | 'OEM' | 'Compatible';
  tonerWeight?: number;           // Weight in kg or grams
  tonerColor?: 'Black' | 'Cyan' | 'Magenta' | 'Yellow';
  
  // General
  isConsumable: boolean;
  consumableCategory: 'Paper' | 'Toner' | 'Ink' | 'Other';
}
```

#### 4.1.2 Enhanced Matching Algorithm

```typescript
interface MatchCriteria {
  // Primary identifiers (exact match preferred)
  productIds?: string[];           // Known product IDs
  
  // Specification matching
  specifications: {
    // For Paper: A4 Paper 80gsm Ream 500
    paper?: {
      size?: 'A4';
      weight?: number;             // 80 gsm
      sheetsPerReam?: number;      // 500
      weightTolerance?: number;    // ±5 gsm acceptable
    };
    
    // For Toner: HP Universal Toner 1kg
    toner?: {
      brand?: string;              // 'HP'
      type?: 'Universal';
      weight?: number;             // 1 kg
      weightUnit?: 'kg' | 'g';
      weightTolerance?: number;    // ±10% acceptable
    };
  };
  
  // Keyword patterns for flexible matching
  keywordPatterns: {
    primary: string[];             // Must match at least one
    secondary: string[];           // Bonus points if matched
    exclude?: string[];            // Exclude if matched
  };
  
  // Category constraints
  categoryConstraint?: {
    mustInclude: string[];         // Category must contain these
    mustExclude?: string[];        // Category must not contain these
  };
}

interface MatchResult {
  item: Item;
  score: number;                   // 0-100 match score
  matchType: 'exact' | 'specification' | 'keyword' | 'fallback';
  matchedAttributes: string[];     // Which attributes matched
  confidence: 'high' | 'medium' | 'low';
}
```

#### 4.1.3 Paper Product Matcher

```typescript
// Configuration for A4 Paper 80gsm Ream 500 matching
const PAPER_MATCH_CONFIG: MatchCriteria = {
  specifications: {
    paper: {
      size: 'A4',
      weight: 80,
      sheetsPerReam: 500,
      weightTolerance: 5           // Accept 75-85 gsm
    }
  },
  keywordPatterns: {
    primary: ['paper', 'a4', 'ream'],
    secondary: ['80gsm', '80 gsm', '500 sheets', 'copy paper', 'bond paper'],
    exclude: ['photo', 'glossy', 'cardstock']
  },
  categoryConstraint: {
    mustInclude: ['paper', 'stationery', 'consumable'],
    mustExclude: ['equipment', 'machine']
  }
};
```

#### 4.1.4 Toner Product Matcher

```typescript
// Configuration for HP Universal Toner 1kg matching
const TONER_MATCH_CONFIG: MatchCriteria = {
  specifications: {
    toner: {
      brand: 'HP',
      type: 'Universal',
      weight: 1,
      weightUnit: 'kg',
      weightTolerance: 0.1         // Accept 0.9-1.1 kg
    }
  },
  keywordPatterns: {
    primary: ['toner', 'hp universal', '1kg'],
    secondary: ['universal toner', 'hp toner', 'laser toner', 'black toner'],
    exclude: ['ink', 'cartridge', 'color', 'cyan', 'magenta', 'yellow']
  },
  categoryConstraint: {
    mustInclude: ['toner', 'consumable'],
    mustExclude: ['printer', 'machine', 'equipment']
  }
};
```

### 4.2 Matching Algorithm Implementation

```typescript
function findBestMatch(
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
  
  // Sort by score descending, return best match
  results.sort((a, b) => b.score - a.score);
  return results[0] || null;
}

function scoreItem(item: Item, criteria: MatchCriteria): MatchResult | null {
  let score = 0;
  const matchedAttributes: string[] = [];
  let matchType: MatchResult['matchType'] = 'fallback';
  let confidence: MatchResult['confidence'] = 'low';
  
  const name = (item.name || '').toLowerCase();
  const category = (item.category || '').toLowerCase();
  const description = (item.description || '').toLowerCase();
  const searchText = `${name} ${category} ${description}`;
  
  // 1. Check product IDs (exact match)
  if (criteria.productIds?.includes(item.id)) {
    return {
      item,
      score: 100,
      matchType: 'exact',
      matchedAttributes: ['id'],
      confidence: 'high'
    };
  }
  
  // 2. Check specification matching
  const specScore = scoreSpecifications(item, criteria.specifications);
  if (specScore > 0) {
    score += specScore;
    matchType = 'specification';
    confidence = specScore >= 80 ? 'high' : specScore >= 50 ? 'medium' : 'low';
  }
  
  // 3. Check keyword patterns
  const keywordScore = scoreKeywords(searchText, criteria.keywordPatterns);
  if (keywordScore > 0) {
    score += keywordScore;
    if (matchType === 'fallback') matchType = 'keyword';
  }
  
  // 4. Check category constraints
  if (criteria.categoryConstraint) {
    const categoryScore = scoreCategory(category, criteria.categoryConstraint);
    if (categoryScore === 0) return null; // Excluded
    score += categoryScore;
  }
  
  return score > 0 ? {
    item,
    score: Math.min(score, 100),
    matchType,
    matchedAttributes,
    confidence
  } : null;
}
```

---

## 5. Implementation Recommendations

### 5.1 Database Schema Enhancements

Add the following columns to the `inventory` table for better product matching:

```sql
-- Add specification columns to inventory table
ALTER TABLE inventory ADD COLUMN specifications TEXT; -- JSON blob for specifications
ALTER TABLE inventory ADD COLUMN consumable_category TEXT; -- 'Paper', 'Toner', 'Ink', etc.
ALTER TABLE inventory ADD COLUMN is_consumable INTEGER DEFAULT 0;
ALTER TABLE inventory ADD COLUMN equivalent_products TEXT; -- JSON array of equivalent product IDs
ALTER TABLE inventory ADD COLUMN match_keywords TEXT; -- JSON array of search keywords
```

### 5.2 Configuration Table for BOM Defaults

Create a system configuration table for default BOM materials:

```sql
-- BOM Default Materials Configuration
CREATE TABLE IF NOT EXISTS bom_default_materials (
  id TEXT PRIMARY KEY,
  material_type TEXT NOT NULL,           -- 'paper', 'toner'
  preferred_item_id TEXT,                -- Preferred inventory item ID
  fallback_item_ids TEXT,                -- JSON array of fallback IDs
  match_criteria TEXT,                   -- JSON blob with MatchCriteria
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (preferred_item_id) REFERENCES inventory(id)
);

-- Insert default configurations
INSERT INTO bom_default_materials (id, material_type, match_criteria) VALUES
('BOM-PAPER-DEFAULT', 'paper', json('{
  "specifications": {
    "paper": {
      "size": "A4",
      "weight": 80,
      "sheetsPerReam": 500,
      "weightTolerance": 5
    }
  },
  "keywordPatterns": {
    "primary": ["paper", "a4", "ream"],
    "secondary": ["80gsm", "80 gsm", "500 sheets", "copy paper"]
  },
  "categoryConstraint": {
    "mustInclude": ["paper", "stationery", "consumable"]
  }
}'));

INSERT INTO bom_default_materials (id, material_type, match_criteria) VALUES
('BOM-TONER-DEFAULT', 'toner', json('{
  "specifications": {
    "toner": {
      "brand": "HP",
      "type": "Universal",
      "weight": 1,
      "weightUnit": "kg",
      "weightTolerance": 0.1
    }
  },
  "keywordPatterns": {
    "primary": ["toner", "hp universal", "1kg"],
    "secondary": ["universal toner", "hp toner", "laser toner"]
  },
  "categoryConstraint": {
    "mustInclude": ["toner", "consumable"]
  }
}'));
```

### 5.3 Service Layer Updates

Update the [`examinationService.cjs`](server/services/examinationService.cjs:190) to use the enhanced matching:

```javascript
// Enhanced material resolution with flexible matching
const resolveMaterialWithFallback = async (materialType) => {
  // 1. Check for configured default
  const config = await runGet(
    'SELECT * FROM bom_default_materials WHERE material_type = ?',
    [materialType]
  );
  
  if (config) {
    // 2. Try preferred item first
    if (config.preferred_item_id) {
      const preferred = await runGet(
        'SELECT * FROM inventory WHERE id = ?',
        [config.preferred_item_id]
      );
      if (preferred && preferred.quantity > 0) return preferred;
    }
    
    // 3. Try fallback items
    if (config.fallback_item_ids) {
      const fallbacks = JSON.parse(config.fallback_item_ids);
      for (const fallbackId of fallbacks) {
        const item = await runGet(
          'SELECT * FROM inventory WHERE id = ?',
          [fallbackId]
        );
        if (item && item.quantity > 0) return item;
      }
    }
    
    // 4. Use match criteria for flexible search
    const criteria = JSON.parse(config.match_criteria);
    return await findBestMatchInInventory(criteria);
  }
  
  // 5. Legacy fallback to keyword search
  return findItem(materialType);
};
```

---

## 6. Database Schema Analysis

### 6.1 Current Examination Tables

#### [`examination_batches`](server/db.cjs:284)

```sql
CREATE TABLE IF NOT EXISTS examination_batches (
  id TEXT PRIMARY KEY,
  school_id TEXT NOT NULL,
  name TEXT NOT NULL,
  academic_year TEXT,
  term TEXT,
  exam_type TEXT,
  status TEXT DEFAULT 'Draft',
  total_amount REAL DEFAULT 0,
  currency TEXT DEFAULT 'MWK',
  invoice_id TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

#### [`examination_bom_calculations`](server/db.cjs:329)

```sql
CREATE TABLE IF NOT EXISTS examination_bom_calculations (
  id TEXT PRIMARY KEY,
  batch_id TEXT NOT NULL,
  class_id TEXT,
  item_id TEXT NOT NULL,        -- Inventory Item ID (Paper, Toner)
  item_name TEXT,
  quantity_required REAL NOT NULL,
  unit_cost REAL NOT NULL,
  total_cost REAL NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### 6.2 Inventory Tracking Tables

#### [`inventory`](server/db.cjs:21)

```sql
CREATE TABLE IF NOT EXISTS inventory (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  material TEXT,
  quantity INTEGER NOT NULL DEFAULT 0,
  cost_per_unit REAL NOT NULL,
  unit TEXT DEFAULT 'units',
  category_id TEXT,
  min_stock_level INTEGER DEFAULT 0,
  max_stock_level INTEGER DEFAULT 0,
  reorder_point INTEGER DEFAULT 0,
  warehouse_id TEXT,
  last_updated DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

#### [`inventory_transactions`](server/db.cjs:121)

```sql
CREATE TABLE IF NOT EXISTS inventory_transactions (
  id TEXT PRIMARY KEY,
  item_id TEXT NOT NULL,
  warehouse_id TEXT,
  batch_id TEXT,
  type TEXT NOT NULL CHECK(type IN ('IN', 'OUT', 'ADJUSTMENT')),
  quantity INTEGER NOT NULL,
  previous_quantity INTEGER NOT NULL,
  new_quantity INTEGER NOT NULL,
  unit_cost REAL,
  total_cost REAL,
  reference TEXT,
  reference_id TEXT,
  reason TEXT NOT NULL,
  performed_by TEXT,
  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

---

## 7. Configuration Guidelines

### 7.1 Setting Up Paper Products

To configure **A4 Paper 80gsm Ream 500** or equivalent:

1. **Create the inventory item** with proper categorization:
   ```sql
   INSERT INTO inventory (id, name, category_id, cost_per_unit, unit, quantity)
   VALUES ('PAPER-A4-80GSM-500', 'A4 Paper 80gsm Ream 500', 'CAT-PAPER', 5000, 'reams', 100);
   ```

2. **Set as default for examination BOM**:
   ```sql
   UPDATE bom_default_materials 
   SET preferred_item_id = 'PAPER-A4-80GSM-500'
   WHERE material_type = 'paper';
   ```

3. **Add equivalent products** (for fallback):
   ```sql
   UPDATE bom_default_materials 
   SET fallback_item_ids = json('["PAPER-A4-75GSM", "PAPER-A4-90GSM"]')
   WHERE material_type = 'paper';
   ```

### 7.2 Setting Up Toner Products

To configure **HP Universal Toner 1kg** or equivalent:

1. **Create the inventory item**:
   ```sql
   INSERT INTO inventory (id, name, category_id, cost_per_unit, unit, quantity)
   VALUES ('TONER-HP-UNIVERSAL-1KG', 'HP Universal Toner 1kg', 'CAT-TONER', 85000, 'kg', 50);
   ```

2. **Set as default for examination BOM**:
   ```sql
   UPDATE bom_default_materials 
   SET preferred_item_id = 'TONER-HP-UNIVERSAL-1KG'
   WHERE material_type = 'toner';
   ```

3. **Add equivalent products**:
   ```sql
   UPDATE bom_default_materials 
   SET fallback_item_ids = json('["TONER-GENERIC-1KG", "TONER-CANON-1KG"]')
   WHERE material_type = 'toner';
   ```

### 7.3 Product Naming Conventions

For optimal matching, use consistent naming patterns:

| Product Type | Recommended Naming Pattern | Examples |
|--------------|---------------------------|----------|
| Paper | `{Size} Paper {Weight}gsm Ream {Quantity}` | A4 Paper 80gsm Ream 500 |
| Toner | `{Brand} {Type} Toner {Weight}{Unit}` | HP Universal Toner 1kg |
| Alternative Paper | `{Size} {Weight}gsm {Type} Paper` | A4 80gsm Copy Paper |
| Alternative Toner | `{Brand} {Weight} {Type} Toner` | HP 1kg Universal Toner |

---

## 8. Testing & Validation

### 8.1 Test Cases for Paper Matching

| Test Case | Input | Expected Match | Confidence |
|-----------|-------|----------------|------------|
| Exact Match | "A4 Paper 80gsm Ream 500" | Exact product | High |
| Weight Variation | "A4 Paper 75gsm Ream 500" | Equivalent (within tolerance) | Medium |
| Different Naming | "A4 Copy Paper 80gsm" | Keyword match | Medium |
| Brand Specific | "Double A A4 Paper 80gsm" | Specification match | High |
| Fallback | "A4 Paper" | First available A4 paper | Low |

### 8.2 Test Cases for Toner Matching

| Test Case | Input | Expected Match | Confidence |
|-----------|-------|----------------|------------|
| Exact Match | "HP Universal Toner 1kg" | Exact product | High |
| Weight Variation | "HP Universal Toner 900g" | Equivalent (within tolerance) | Medium |
| Different Brand | "Canon Universal Toner 1kg" | Specification match | Medium |
| Generic | "Universal Toner 1kg" | Keyword match | Medium |
| Fallback | "Toner" | First available toner | Low |

### 8.3 Validation Script

```javascript
// Test script for BOM material resolution
async function validateBOMMaterialResolution() {
  const testCases = [
    { type: 'paper', search: 'A4 Paper 80gsm Ream 500', expectedId: 'PAPER-A4-80GSM-500' },
    { type: 'toner', search: 'HP Universal Toner 1kg', expectedId: 'TONER-HP-UNIVERSAL-1KG' },
    { type: 'paper', search: 'A4 Copy Paper', expectedCategory: 'Paper' },
    { type: 'toner', search: 'Universal Toner', expectedCategory: 'Toner' }
  ];
  
  for (const test of testCases) {
    const result = await resolveMaterialWithFallback(test.type);
    console.log(`Test: ${test.search}`);
    console.log(`  Matched: ${result?.name || 'No match'}`);
    console.log(`  Expected: ${test.expectedId || test.expectedCategory}`);
    console.log(`  Status: ${result ? 'PASS' : 'FAIL'}`);
  }
}
```

---

## Appendix A: File References

| File | Purpose | Key Functions |
|------|---------|---------------|
| [`server/services/examinationService.cjs`](server/services/examinationService.cjs:1) | Backend BOM calculations | `calculateBatch()`, `approveBatch()` |
| [`services/examHiddenBomService.ts`](services/examHiddenBomService.ts:1) | Hidden BOM management | `resolveExamMaterial()`, `buildExamHiddenBOMTemplate()` |
| [`services/examPricingService.ts`](services/examPricingService.ts:1) | Cost calculations | `calculateClassCost()`, `calculateBatchCost()` |
| [`context/InventoryContext.tsx`](context/InventoryContext.tsx:1) | Inventory state | `updateStock()`, `getAvailableWithKits()` |
| [`types.ts`](types.ts:1894) | Type definitions | `ExamBOMConfig`, `BOMTemplate`, `MaterialCategory` |
| [`server/db.cjs`](server/db.cjs:1) | Database schema | Table definitions, migrations |

---

## Appendix B: Constants Reference

```typescript
// From examHiddenBomService.ts
export const EXAM_SHEETS_PER_REAM = 500;
export const EXAM_PAGES_PER_SHEET = 2;
export const EXAM_TONER_PAGES_PER_KG = 20000;
export const EXAM_TONER_PAGES_PER_GRAM = 20;

// From examinationService.cjs
const PAGES_PER_SHEET = 2;
const TONER_PAGES_PER_KG = 20000;
const SHEETS_PER_REAM = 500;

// From examPricingService.ts
const PAGES_PER_SHEET = 2;
const TONER_PAGES_PER_KG = 20000;
const SHEETS_PER_REAM = 500;
```

---

## Document History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-02-24 | System Analysis Team | Initial comprehensive analysis |
| 1.1 | 2026-02-24 | System Analysis Team | Added implementation files and migration script |

---

## Appendix C: Implementation Files

The following implementation files have been created to support the enhanced BOM configuration:

### C.1 Material Matcher Service

**File:** [`services/examMaterialMatcher.ts`](services/examMaterialMatcher.ts)

This service provides flexible product matching for examination consumables:

```typescript
// Key exports:
export function resolveExamMaterialEnhanced(
  inventory: Item[],
  materialType: ExamMaterialType,
  preferredId?: string,
  config?: MatchCriteria
): MatchResult | null;

export function findBestMatch(
  inventory: Item[],
  criteria: MatchCriteria
): MatchResult | null;

export const DEFAULT_PAPER_MATCH_CRITERIA: MatchCriteria;
export const DEFAULT_TONER_MATCH_CRITERIA: MatchCriteria;
```

### C.2 Database Migration Script

**File:** [`server/migrations/add_bom_default_materials.cjs`](server/migrations/add_bom_default_materials.cjs)

Run this migration to add the `bom_default_materials` table:

```bash
node server/migrations/add_bom_default_materials.cjs
```

### C.3 Updated Hidden BOM Service

**File:** [`services/examHiddenBomService.ts`](services/examHiddenBomService.ts)

The hidden BOM service has been updated to use the enhanced material matcher:

```typescript
// Enhanced resolution with detailed results
export function resolveExamMaterialWithDetails(
  inventory: Item[],
  type: ExamMaterialType,
  preferredId?: string
): MatchResult | null;

// Resolve both materials at once
export function resolveAllExamMaterials(
  inventory: Item[],
  paperId?: string,
  tonerId?: string
): { paper: MatchResult | null; toner: MatchResult | null };
```

---

## Appendix D: Quick Start Guide

### D.1 Setting Up Default Materials

1. **Run the migration:**
   ```bash
   node server/migrations/add_bom_default_materials.cjs
   ```

2. **Configure preferred items (optional):**
   ```sql
   UPDATE bom_default_materials 
   SET preferred_item_id = 'YOUR-PAPER-ID'
   WHERE material_type = 'paper';
   
   UPDATE bom_default_materials 
   SET preferred_item_id = 'YOUR-TONER-ID'
   WHERE material_type = 'toner';
   ```

3. **Add fallback items (optional):**
   ```sql
   UPDATE bom_default_materials 
   SET fallback_item_ids = json('["FALLBACK-ID-1", "FALLBACK-ID-2"]')
   WHERE material_type = 'paper';
   ```

### D.2 Using the Enhanced Matching

```typescript
import { resolveExamMaterialEnhanced, resolveAllExamMaterials } from './services/examMaterialMatcher';

// Resolve paper with details
const paperResult = resolveExamMaterialEnhanced(inventory, 'paper', preferredPaperId);
if (paperResult) {
  console.log(`Found: ${paperResult.item.name}`);
  console.log(`Confidence: ${paperResult.confidence}`);
  console.log(`Score: ${paperResult.score}`);
}

// Resolve both materials
const materials = resolveAllExamMaterials(inventory, paperId, tonerId);
console.log('Paper:', materials.paper?.item.name);
console.log('Toner:', materials.toner?.item.name);
```

---

*End of Document*
