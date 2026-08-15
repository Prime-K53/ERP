import { describe, it, expect } from 'vitest';
import {
    resolveExamMaterial,
    buildExamHiddenBOMTemplate,
    isSameExamHiddenTemplate,
    EXAM_HIDDEN_BOM_TEMPLATE_ID
} from '../../services/examHiddenBomService';
import { Item, BOMTemplate } from '../../types';

describe('Exam Hidden BOM Service', () => {

    const mockInventory: Item[] = [
        { id: '1', name: 'A4 Paper Ream', category: 'Paper', unit: 'ream', cost: 50 },
        { id: '2', name: 'Black Toner Cartridge', category: 'Toner', unit: 'kg', cost: 100 },
        { id: '3', name: 'Other Item', category: 'Misc', unit: 'pcs', cost: 10 }
    ] as unknown as Item[];

    describe('resolveExamMaterial', () => {
        it('should find material by preferred ID', () => {
            const result = resolveExamMaterial(mockInventory, 'paper', '1');
            expect(result?.id).toBe('1');
        });

        it('should find material by keyword if preferred ID not found or not provided', () => {
            const result = resolveExamMaterial(mockInventory, 'paper');
            expect(result?.id).toBe('1');
        });

        it('should return undefined if not found', () => {
            const result = resolveExamMaterial([], 'paper');
            expect(result).toBeUndefined();
        });
    });

    describe('buildExamHiddenBOMTemplate', () => {
        it('should build a template with paper and toner', () => {
            const paper = mockInventory[0];
            const toner = mockInventory[1];

            const result = buildExamHiddenBOMTemplate({
                paperItem: paper,
                tonerItem: toner,
                laborCost: 15,
                baseMargin: 25
            });

            expect(result.id).toBe(EXAM_HIDDEN_BOM_TEMPLATE_ID);
            expect(result.components).toHaveLength(2);
            expect(result.laborCost).toBe(15);
            expect(result.defaultMargin).toBe(25);
            expect(result.components[0].itemId).toBe(paper.id);
            expect(result.components[1].itemId).toBe(toner.id);
        });

        it('should handle missing items', () => {
            const result = buildExamHiddenBOMTemplate({});
            expect(result.components).toHaveLength(0);
        });
    });

    describe('isSameExamHiddenTemplate', () => {
        const templateA = {
            id: EXAM_HIDDEN_BOM_TEMPLATE_ID,
            name: 'Template',
            type: 'Exact',
            laborCost: 10,
            defaultMargin: 20,
            components: [
                { itemId: '1', name: 'Paper', quantityFormula: 'x', unit: 'ream' }
            ]
        } as BOMTemplate;

        const templateB = { ...templateA }; // Clone

        it('should return true for identical templates', () => {
            expect(isSameExamHiddenTemplate(templateA, templateB)).toBe(true);
        });

        it('should return false if labor cost differs', () => {
            const templateC = { ...templateA, laborCost: 11 };
            expect(isSameExamHiddenTemplate(templateA, templateC)).toBe(false);
        });

        it('should return false if margin differs', () => {
            const templateC = { ...templateA, defaultMargin: 21 };
            expect(isSameExamHiddenTemplate(templateA, templateC)).toBe(false);
        });

        it('should return false if components differ', () => {
            const templateC = {
                ...templateA,
                components: [
                    { itemId: '2', name: 'Toner', quantityFormula: 'y', unit: 'kg' }
                ]
            } as BOMTemplate;
            expect(isSameExamHiddenTemplate(templateA, templateC)).toBe(false);
        });
    });
});
