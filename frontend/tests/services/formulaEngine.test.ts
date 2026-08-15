import { describe, it, expect } from 'vitest';
import { SafeFormulaEngine } from '../../services/formulaEngine';

describe('SafeFormulaEngine AST Evaluator', () => {

  describe('basic arithmetic', () => {
    it('should evaluate simple addition', () => {
      const result = SafeFormulaEngine.evaluate('2 + 3', {});
      expect(result).toBe(5);
    });

    it('should evaluate subtraction', () => {
      const result = SafeFormulaEngine.evaluate('10 - 4', {});
      expect(result).toBe(6);
    });

    it('should evaluate multiplication', () => {
      const result = SafeFormulaEngine.evaluate('6 * 7', {});
      expect(result).toBe(42);
    });

    it('should evaluate division', () => {
      const result = SafeFormulaEngine.evaluate('20 / 4', {});
      expect(result).toBe(5);
    });

    it('should handle operator precedence', () => {
      const result = SafeFormulaEngine.evaluate('2 + 3 * 4', {});
      expect(result).toBe(14);
    });

    it('should handle parentheses', () => {
      const result = SafeFormulaEngine.evaluate('(2 + 3) * 4', {});
      expect(result).toBe(20);
    });

    it('should handle decimal numbers', () => {
      const result = SafeFormulaEngine.evaluate('3.14 * 2', {});
      expect(result).toBeCloseTo(6.28, 2);
    });
  });

  describe('Math functions', () => {
    it('should evaluate Math.ceil', () => {
      const result = SafeFormulaEngine.evaluate('Math.ceil(4.2)', {});
      expect(result).toBe(5);
    });

    it('should evaluate Math.floor', () => {
      const result = SafeFormulaEngine.evaluate('Math.floor(4.8)', {});
      expect(result).toBe(4);
    });

    it('should evaluate Math.round', () => {
      const result = SafeFormulaEngine.evaluate('Math.round(4.5)', {});
      expect(result).toBe(5);
    });

    it('should evaluate Math.min', () => {
      const result = SafeFormulaEngine.evaluate('Math.min(5, 3, 8)', {});
      expect(result).toBe(3);
    });

    it('should evaluate Math.max', () => {
      const result = SafeFormulaEngine.evaluate('Math.max(5, 3, 8)', {});
      expect(result).toBe(8);
    });

    it('should evaluate Math.abs', () => {
      const result = SafeFormulaEngine.evaluate('Math.abs(-5)', {});
      expect(result).toBe(5);
    });

    it('should evaluate Math.sqrt', () => {
      const result = SafeFormulaEngine.evaluate('Math.sqrt(16)', {});
      expect(result).toBe(4);
    });

    it('should evaluate Math.pow', () => {
      const result = SafeFormulaEngine.evaluate('Math.pow(2, 3)', {});
      expect(result).toBe(8);
    });
  });

  describe('context variables', () => {
    it('should substitute variables from context', () => {
      const result = SafeFormulaEngine.evaluate('price * quantity', { price: 10, quantity: 3 });
      expect(result).toBe(30);
    });

    it('should handle multiple variables', () => {
      const result = SafeFormulaEngine.evaluate('(price + cost) * quantity', { price: 10, cost: 5, quantity: 2 });
      expect(result).toBe(30);
    });

    it('should treat missing variables as zero', () => {
      const result = SafeFormulaEngine.evaluate('price * quantity', {});
      expect(result).toBe(0);
    });
  });

  describe('security validation', () => {
    it('should reject formulas with disallowed characters', () => {
      expect(SafeFormulaEngine.evaluate('alert("hacked")', {})).toBe(0);
    });

    it('should reject formulas with string operations', () => {
      expect(SafeFormulaEngine.evaluate('"hello" + "world"', {})).toBe(0);
    });

    it('should reject formulas with logical operators', () => {
      expect(SafeFormulaEngine.evaluate('5 > 3', {})).toBe(0);
    });
  });

  describe('complex expressions', () => {
    it('should handle nested Math functions', () => {
      const result = SafeFormulaEngine.evaluate('Math.round(Math.sqrt(20) * 10)', {});
      expect(result).toBe(45);
    });

    it('should handle mixed arithmetic and Math functions', () => {
      const result = SafeFormulaEngine.evaluate('Math.ceil(5.2) + Math.floor(5.8) * 2', {});
      expect(result).toBe(16);
    });
  });
});
