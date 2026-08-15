/**
 * Examination Pricing Service
 * 
 * Handles all cost calculations, material deductions, and pricing for examination batches.
 * Supports per-learner pricing model with class-based grouping.
 * 
 * Key Features:
 * - Per-learner pricing (not per-subject)
 * - Extra copies are free to customer but materials are deducted
 * - Multiple classes per school on one invoice
 * - Global BOM configuration from production settings
 * - Hidden BOM integration for Paper and Toner calculations
 * 
 * Hidden BOM Formulas:
 * - Paper: 1 ream = 500 sheets; sheets = Math.ceil(pages / 2) × copies (duplex printing)
 * - Toner: 1kg = 1000g = 20000 pages
 */

import {
    ExamBOMConfig,
    ExamClass,
    ExamSubject,
    ExaminationBatch,
    ExaminationClass,
    ExamInvoiceClassSummary,
    ExamMaterialDeduction,
    Item,
    MarketAdjustment,
    AdjustmentSnapshot,
    BOMTemplate
} from '../types';
import { SafeFormulaEngine } from './formulaEngine';

/**
 * Result of calculating a single class's costs
 */
export interface ClassCalculationResult {
    className: string;
    subjects: string[];
    totalCandidates: number;
    chargePerLearner: number;
    extraCopiesPerSubject: number;
    // Production quantities (includes extra copies)
    totalSheets: number;
    tonerKg: number;
    // Costs
    paperCost: number;
    tonerCost: number;
    laborCost: number;
    baseCost: number;
    adjustmentTotal: number;
    internalCost: number;
    // Revenue
    sellingPrice: number;
    // Profit
    profit: number;
    profitFlag: 'PROFIT' | 'LOSS';
    // Breakdown
    adjustmentBreakdown: { category: string; amount: number }[];
    adjustmentSnapshots: AdjustmentSnapshot[];
}

/**
 * Result of calculating an entire batch
 */
export interface BatchCalculationResult {
    batchId: string;
    schoolName: string;
    classes: ClassCalculationResult[];
    // Aggregated totals
    totalCost: number;
    totalRevenue: number;
    totalProfit: number;
    totalSheets: number;
    totalTonerKg: number;
    profitFlag: 'PROFIT' | 'LOSS';
    // Material deductions needed
    materialDeductions: ExamMaterialDeduction[];
}

// Constants
const PAGES_PER_SHEET = 2;
const TONER_PAGES_PER_KG = 20000;
const SHEETS_PER_REAM = 500;

const toSafeNumber = (value: unknown, fallback = 0): number => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
};

const resolveItemCost = (item: Item | undefined): number => {
    if (!item) return 0;
    const raw = (item as any).cost_price ?? (item as any).cost_per_unit ?? item.cost;
    return toSafeNumber(raw, 0);
};

const resolveBatchConfig = (batch: ExaminationBatch, inventory: Item[]): ExamBOMConfig => {
    const batchConfig = batch['bomConfig'] as Partial<ExamBOMConfig> | undefined;
    const defaults = getDefaultExamBOMConfig(undefined, inventory);
    return {
        ...defaults,
        ...batchConfig
    };
};

const toExamClass = (input: ExaminationClass): ExamClass => {
    const className = String(input['className'] || input.class_name || 'Class');
    const totalCandidates = toSafeNumber(input['totalCandidates'], input.number_of_learners || 0);
    const chargePerLearner = toSafeNumber(
        input['chargePerLearner'],
        input.price_per_learner ?? input.manual_cost_per_learner ?? input.suggested_cost_per_learner ?? 0
    );
    const extraCopiesPerSubject = toSafeNumber(input['extraCopiesPerSubject'], 0);
    const subjects = Array.isArray(input.subjects)
        ? input.subjects.map((subject, index) => ({
            id: String(subject['id'] || `${input.id}-SUB-${index + 1}`),
            name: String(subject['name'] || subject.subject_name || 'Subject'),
            pages: toSafeNumber(subject['pages'], 0)
        }))
        : [];

    return {
        id: input.id,
        className,
        subjects,
        totalCandidates,
        chargePerLearner,
        extraCopiesPerSubject
    };
};

/**
 * Get the default exam BOM configuration from company settings
 */
export function getDefaultExamBOMConfig(
    productionSettings: Record<string, unknown> | undefined,
    inventory: Item[]
): ExamBOMConfig {
    return {
        pricingModel: productionSettings?.pricingModel || 'per-learner',
        paperId: productionSettings?.paperId || findDefaultMaterial(inventory, 'paper'),
        tonerId: productionSettings?.tonerId || findDefaultMaterial(inventory, 'toner'),
        baseMargin: productionSettings?.baseMargin || 20,
        marketAdjustmentId: productionSettings?.marketAdjustmentId,
        laborCostPerHour: productionSettings?.laborCostPerHour || 10,
        defaultWastePercentage: productionSettings?.defaultWastePercentage || 5,
        extraCopiesFree: true // Extra copies are free to customer
    };
}

/**
 * Find default material by type from inventory
 */
function findDefaultMaterial(inventory: Item[], type: 'paper' | 'toner'): string {
    const item = inventory.find(i =>
        i.name?.toLowerCase().includes(type) ||
        i.category?.toLowerCase().includes(type)
    );
    return item?.id || '';
}

/**
 * Calculate sheets needed for a subject
 * 
 * Formula: sheets_per_copy × (candidates + extra_copies) × (1 + waste_percentage)
 */
export function calculateSubjectSheets(
    pages: number,
    candidates: number,
    extraCopies: number,
    wastePercentage: number
): number {
    const sheetsPerCopy = Math.ceil(pages / 2); // Duplex printing
    const productionCopies = candidates + extraCopies; // Extra copies included in production
    const baseSheets = sheetsPerCopy * productionCopies;
    const wasteSheets = Math.ceil(baseSheets * (wastePercentage / 100));
    return baseSheets + wasteSheets;
}

/**
 * Calculate toner consumption in kg
 */
export function calculateTonerConsumption(totalSheets: number): number {
    const totalPages = totalSheets * PAGES_PER_SHEET;
    return totalPages / TONER_PAGES_PER_KG;
}

/**
 * Calculate labor hours for a class
 * Estimate based on total sheets: roughly 1000 sheets per hour
 */
function calculateLaborHours(totalSheets: number): number {
    const SHEETS_PER_HOUR = 1000;
    return Math.max(0.5, totalSheets / SHEETS_PER_HOUR); // Minimum 0.5 hours
}

/**
 * Apply market adjustments to base cost
 */
function applyMarketAdjustments(
    baseCost: number,
    marketAdjustments: MarketAdjustment[],
    marketAdjustmentId?: string
): { total: number; breakdown: { category: string; amount: number }[]; snapshots: AdjustmentSnapshot[] } {
    const breakdown: { category: string; amount: number }[] = [];
    const snapshots: AdjustmentSnapshot[] = [];
    let total = 0;

    // Filter adjustments
    const activeAdjustments = marketAdjustments.filter(adj => {
        const isActive = adj.active ?? adj.isActive ?? true;
        if (marketAdjustmentId) {
            return isActive && adj.id === marketAdjustmentId;
        }
        return isActive;
    });

    for (const adj of activeAdjustments) {
        let amount = 0;

        if (adj.type === 'PERCENTAGE' || adj.type === 'PERCENT' || adj.type === 'percentage') {
            const pct = adj.percentage || adj.value || 0;
            amount = baseCost * (pct / 100);
        } else {
            amount = adj.value || 0;
        }

        total += amount;
        breakdown.push({
            category: adj.displayName || adj.name || adj.category || 'Adjustment',
            amount
        });

        snapshots.push({
            name: adj.name || 'Unknown',
            type: adj.type === 'percentage' ? 'PERCENT' : adj.type as 'PERCENTAGE' | 'FIXED' | 'PERCENT',
            value: adj.value,
            percentage: adj.percentage,
            calculatedAmount: amount
        });
    }

    return { total, breakdown, snapshots };
}

/**
 * Calculate costs for a single class
 */
export function calculateClassCost(
    examClass: ExamClass,
    config: ExamBOMConfig,
    inventory: Item[],
    marketAdjustments: MarketAdjustment[] = []
): ClassCalculationResult {
    // Get material costs from inventory
    const paper = inventory.find(i => i.id === config.paperId);
    const toner = inventory.find(i => i.id === config.tonerId);

    const paperCostPerReam = resolveItemCost(paper);
    const tonerCostPerKg = resolveItemCost(toner);

    // Calculate total sheets for all subjects
    let totalSheets = 0;
    const subjectNames: string[] = [];

    for (const subject of examClass.subjects) {
        subjectNames.push(subject.name);
        totalSheets += calculateSubjectSheets(
            subject.pages,
            examClass.totalCandidates,
            examClass.extraCopiesPerSubject,
            config.defaultWastePercentage
        );
    }

    // Calculate material consumption
    const tonerKg = calculateTonerConsumption(totalSheets);

    // Calculate costs
    const totalPaperReams = totalSheets / SHEETS_PER_REAM;
    const paperCost = totalPaperReams * paperCostPerReam;
    const tonerCost = tonerKg * tonerCostPerKg;
    const laborHours = calculateLaborHours(totalSheets);
    const laborCost = laborHours * config.laborCostPerHour;
    const baseCost = paperCost + tonerCost + laborCost;

    // Apply market adjustments
    const { total: adjustmentTotal, breakdown, snapshots } = applyMarketAdjustments(
        baseCost,
        marketAdjustments,
        config.marketAdjustmentId
    );

    // Total internal cost
    const internalCost = baseCost + adjustmentTotal;

    // Calculate selling price (per-learner model)
    // Extra copies are FREE - only billable candidates are charged
    let sellingPrice: number;

    if (config.pricingModel === 'per-learner') {
        sellingPrice = examClass.chargePerLearner * examClass.totalCandidates;
    } else if (config.pricingModel === 'per-page') {
        const totalPages = examClass.subjects.reduce((sum, s) => sum + s.pages, 0);
        sellingPrice = totalPages * examClass.chargePerLearner * examClass.totalCandidates;
    } else if (config.pricingModel === 'cost-plus') {
        sellingPrice = internalCost * (1 + config.baseMargin / 100);
    } else {
        // Default to per-learner
        sellingPrice = examClass.chargePerLearner * examClass.totalCandidates;
    }

    // Calculate profit
    const profit = sellingPrice - internalCost;

    return {
        className: examClass.className,
        subjects: subjectNames,
        totalCandidates: examClass.totalCandidates,
        chargePerLearner: examClass.chargePerLearner,
        extraCopiesPerSubject: examClass.extraCopiesPerSubject,
        totalSheets,
        tonerKg,
        paperCost,
        tonerCost,
        laborCost,
        baseCost,
        adjustmentTotal,
        internalCost,
        sellingPrice,
        profit,
        profitFlag: profit >= 0 ? 'PROFIT' : 'LOSS',
        adjustmentBreakdown: breakdown,
        adjustmentSnapshots: snapshots
    };
}

/**
 * Calculate costs for an entire batch
 */
export function calculateBatchCost(
    batch: ExaminationBatch,
    inventory: Item[],
    marketAdjustments: MarketAdjustment[] = []
): BatchCalculationResult {
    const classResults: ClassCalculationResult[] = [];
    const materialDeductions: ExamMaterialDeduction[] = [];
    const config = resolveBatchConfig(batch, inventory);

    let totalCost = 0;
    let totalRevenue = 0;
    let totalSheets = 0;
    let totalTonerKg = 0;

    // Calculate each class
    for (const examClass of (batch.classes || [])) {
        const classResult = calculateClassCost(
            toExamClass(examClass),
            config,
            inventory,
            marketAdjustments
        );

        classResults.push(classResult);
        totalCost += classResult.internalCost;
        totalRevenue += classResult.sellingPrice;
        totalSheets += classResult.totalSheets;
        totalTonerKg += classResult.tonerKg;
    }

    // Create material deduction records
    const paper = inventory.find(i => i.id === config.paperId);
    const toner = inventory.find(i => i.id === config.tonerId);

    if (paper && totalSheets > 0) {
        const paperReams = totalSheets / SHEETS_PER_REAM;
        const paperUnitCost = resolveItemCost(paper);
        materialDeductions.push({
            id: `DED-${batch.id}-PAPER`,
            batchId: batch.id,
            classId: 'all',
            materialId: paper.id,
            materialName: paper.name,
            quantity: paperReams,
            unit: 'reams',
            unitCost: paperUnitCost,
            totalCost: paperReams * paperUnitCost,
            deductionType: 'paper',
            deductedAt: new Date().toISOString()
        });
    }

    if (toner && totalTonerKg > 0) {
        const tonerUnitCost = resolveItemCost(toner);
        materialDeductions.push({
            id: `DED-${batch.id}-TONER`,
            batchId: batch.id,
            classId: 'all',
            materialId: toner.id,
            materialName: toner.name,
            quantity: totalTonerKg,
            unit: 'kg',
            unitCost: tonerUnitCost,
            totalCost: totalTonerKg * tonerUnitCost,
            deductionType: 'toner',
            deductedAt: new Date().toISOString()
        });
    }

    const totalProfit = totalRevenue - totalCost;

    return {
        batchId: batch.id,
        schoolName: String(batch['schoolName'] || batch['school_name'] || batch.school_id || batch.name),
        classes: classResults,
        totalCost,
        totalRevenue,
        totalProfit,
        totalSheets,
        totalTonerKg,
        profitFlag: totalProfit >= 0 ? 'PROFIT' : 'LOSS',
        materialDeductions
    };
}

/**
 * Generate invoice class summary for display
 */
export function generateInvoiceSummary(
    batchResult: BatchCalculationResult
): ExamInvoiceClassSummary[] {
    return batchResult.classes.map(cls => ({
        className: cls.className,
        subjects: cls.subjects,
        totalCandidates: cls.totalCandidates,
        chargePerLearner: cls.chargePerLearner,
        classTotal: cls.sellingPrice
    }));
}

/**
 * Format batch result for invoice document
 */
export function formatBatchForInvoice(
    batch: ExaminationBatch,
    batchResult: BatchCalculationResult,
    currencySymbol: string = '$'
): {
    invoiceNumber: string;
    date: string;
    customerName: string;
    customerAddress?: string;
    academicYear: string;
    term: string;
    examType: string;
    classBreakdown: ExamInvoiceClassSummary[];
    subtotal: number;
    total: number;
} {
    return {
        invoiceNumber: String(batch['invoiceId'] || batch.invoice_id || `INV-EXAM-${batch.id}`),
        date: new Date().toLocaleDateString(),
        customerName: String(batch['schoolName'] || batch['school_name'] || batch.school_id || 'School'),
        academicYear: String(batch['academicYear'] || batch.academic_year || ''),
        term: batch.term,
        examType: String(batch['examType'] || batch.exam_type || ''),
        classBreakdown: generateInvoiceSummary(batchResult),
        subtotal: batchResult.totalRevenue,
        total: batchResult.totalRevenue
    };
}

/**
 * Calculate breakdown for display in UI
 */
export function calculateBatchBreakdown(
    batch: ExaminationBatch,
    inventory: Item[],
    marketAdjustments: MarketAdjustment[] = []
): {
    totalCandidates: number;
    totalSubjects: number;
    totalSheets: number;
    totalTonerKg: number;
    totalCost: number;
    totalRevenue: number;
    totalProfit: number;
    profitMargin: number;
} {
    let totalCandidates = 0;
    let totalSubjects = 0;

    for (const cls of (batch.classes || [])) {
        totalCandidates += toSafeNumber(cls['totalCandidates'], cls.number_of_learners || 0);
        totalSubjects += Array.isArray(cls.subjects) ? cls.subjects.length : 0;
    }

    const result = calculateBatchCost(batch, inventory, marketAdjustments);

    return {
        totalCandidates,
        totalSubjects,
        totalSheets: result.totalSheets,
        totalTonerKg: result.totalTonerKg,
        totalCost: result.totalCost,
        totalRevenue: result.totalRevenue,
        totalProfit: result.totalProfit,
        profitMargin: result.totalRevenue > 0
            ? (result.totalProfit / result.totalRevenue) * 100
            : 0
    };
}

export default {
    getDefaultExamBOMConfig,
    calculateSubjectSheets,
    calculateTonerConsumption,
    calculateClassCost,
    calculateBatchCost,
    generateInvoiceSummary,
    formatBatchForInvoice,
    calculateBatchBreakdown
};
