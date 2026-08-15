import { describe, it, expect } from 'vitest';
import { validateRequired, validatePositiveNumber, chain } from '../../utils/validation';

describe('validation utilities', () => {
  describe('validateRequired', () => {
    it('passes for non-empty values', () => {
      const result = validateRequired('hello', 'field', 'Field');
      expect(result).toBeNull();
    });

    it('fails for empty values', () => {
      expect(validateRequired('', 'field', 'Field')).not.toBeNull();
      expect(validateRequired(null, 'field', 'Field')).not.toBeNull();
      expect(validateRequired(undefined, 'field', 'Field')).not.toBeNull();
    });
  });

  describe('validatePositiveNumber', () => {
    it('passes for positive numbers', () => {
      expect(validatePositiveNumber(10, 'amount', 'Amount')).toBeNull();
    });

    it('fails for zero and negatives', () => {
      expect(validatePositiveNumber(0, 'amount', 'Amount')).not.toBeNull();
      expect(validatePositiveNumber(-5, 'amount', 'Amount')).not.toBeNull();
    });
  });

  describe('chain', () => {
    it('returns errors when some validators fail', () => {
      const result = chain(
        validateRequired('', 'name', 'Name'),
        validatePositiveNumber(10, 'age', 'Age')
      );
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBe(1);
      expect(result.errors[0].field).toBe('name');
    });

    it('passes when all validators pass', () => {
      const result = chain(
        validateRequired('John', 'name', 'Name'),
        validatePositiveNumber(25, 'age', 'Age')
      );
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });
});
