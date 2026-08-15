import { describe, it, expect } from 'vitest';
import {
    calculateSubjectSheets,
    calculateTonerConsumption,
    calculateClassCost
} from './examPricingService';
import { ExamClass, ExamBOMConfig, Item, MarketAdjustment } from '../types';

describe('Exam Pricing Service', () => {

    describe('calculateSubjectSheets', () => {
        it('should calculate base sheets correctly for single page (duplex round up)', () => {
            // 1 page / 2 = 0.5 -> ceil(0.5) = 1 sheet per copy
            // 10 candidates + 0 extra = 10 copies
            // 10 * 1 = 10 base sheets
            // Waste 0%
            const result = calculateSubjectSheets(1, 10, 0, 0);
            expect(result).toBe(10);
        });

        it('should calculate base sheets correctly for 3 pages', () => {
            // 3 pages / 2 = 1.5 -> ceil(1.5) = 2 sheets per copy
            // 10 candidates
            // 10 * 2 = 20 base sheets
            const result = calculateSubjectSheets(3, 10, 0, 0);
            expect(result).toBe(20);
        });

        it('should include extra copies', () => {
            // 2 pages -> 1 sheet per copy
            // 10 candidates + 5 extra = 15 copies
            // 15 * 1 = 15 base sheets
            const result = calculateSubjectSheets(2, 10, 5, 0);
            expect(result).toBe(15);
        });

        it('should add waste percentage', () => {
            // 2 pages -> 1 sheet per copy
            // 100 copies = 100 base sheets
            // 5% waste -> 5 sheets
            // Total 105
            const result = calculateSubjectSheets(2, 100, 0, 5);
            expect(result).toBe(105);
        });

        it('should round up waste sheets', () => {
            // 2 pages -> 1 sheet per copy
            // 10 copies = 10 base sheets
            // 5% waste -> 0.5 sheets -> ceil(0.5) = 1 sheet
            // Total 11
            const result = calculateSubjectSheets(2, 10, 0, 5);
            expect(result).toBe(11);
        });
    });

    describe('calculateTonerConsumption', () => {
        it('should calculate toner usage based on 20000 pages per kg', () => {
            // 1000 sheets * 2 sides = 2000 pages
            // 2000 / 20000 = 0.1 kg
            const result = calculateTonerConsumption(1000);
            expect(result).toBeCloseTo(0.1);
        });
    });

    describe('calculateClassCost', () => {
        const mockInventory: Item[] = [
            { id: 'paper-1', name: 'A4 Paper', cost: 10, category: 'Paper', stock: 100 } as any,
            { id: 'toner-1', name: 'Black Toner', cost: 100, category: 'Toner', stock: 10 } as any
        ];

        const mockConfig: ExamBOMConfig = {
            pricingModel: 'per-learner',
            paperId: 'paper-1',
            tonerId: 'toner-1',
            baseMargin: 20,
            laborCostPerHour: 50,
            defaultWastePercentage: 0,
            extraCopiesFree: true
        };

        const mockClass: ExamClass = {
            id: 'class-1',
            className: 'Grade 1A',
            subjects: [
                { id: 's1', name: 'Math', pages: 2 }, // 1 sheet
                { id: 's2', name: 'English', pages: 4 } // 2 sheets
            ],
            totalCandidates: 10,
            chargePerLearner: 100,
            extraCopiesPerSubject: 0
        };

        it('should calculate total sheets and costs correctly', () => {
            const result = calculateClassCost(mockClass, mockConfig, mockInventory);

            // Math: 1 sheet/copy * 10 copies = 10 sheets
            // English: 2 sheets/copy * 10 copies = 20 sheets
            // Total sheets: 30
            expect(result.totalSheets).toBe(30);

            // Paper Cost: 30 sheets / 500 sheets/ream = 0.06 reams
            // 0.06 reams * 10 cost = 0.6
            expect(result.paperCost).toBeCloseTo(0.6);

            // Toner: 30 sheets * 2 pages/sheet = 60 pages
            // 60 / 20000 = 0.003 kg
            // 0.003 * 100 cost = 0.3
            expect(result.tonerCost).toBeCloseTo(0.3);

            // Labor: 30 sheets / 1000 sheets/hr = 0.03 hr -> bumped to min 0.5 hr
            // 0.5 hr * 50 cost = 25
            expect(result.laborCost).toBe(25);

            // Base Cost: 0.6 + 0.3 + 25 = 25.9
            expect(result.baseCost).toBeCloseTo(25.9);
        });

        it('should calculate selling price based on per-learner model', () => {
            const result = calculateClassCost(mockClass, mockConfig, mockInventory);
            // 10 candidates * 100 charge
            expect(result.sellingPrice).toBe(1000);
            // Profit: 1000 - 25.9 = 974.1
            expect(result.profit).toBeCloseTo(974.1);
        });

        it('should apply market adjustments', () => {
            const adjustments: MarketAdjustment[] = [
                { id: 'adj-1', name: 'Inflation', type: 'PERCENTAGE', value: 10, active: true, appliesTo: 'COST' }
            ];

            const configWithAdj = { ...mockConfig, marketAdjustmentId: 'adj-1' };
            const result = calculateClassCost(mockClass, configWithAdj, mockInventory, adjustments);

            // Base Cost: 25.9
            // Adjustment: 10% of 25.9 = 2.59
            // Internal Cost: 28.49
            expect(result.adjustmentTotal).toBeCloseTo(2.59);
            expect(result.internalCost).toBeCloseTo(28.49);
        });
    });
});
