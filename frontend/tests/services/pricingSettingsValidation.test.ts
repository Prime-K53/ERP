import { describe, it, expect } from 'vitest';
import { PricingSettingsValidator, PricingSettingsSchema } from '../../services/pricingSettingsValidation';

describe('PricingSettings Validation', () => {
  describe('valid configurations', () => {
    it('should accept minimal valid settings', () => {
      const settings = {
        enableRounding: true,
        defaultMethod: 'NEAREST_50',
        customStep: 50,
        applyToPOS: false,
        applyToInvoices: false,
        applyToQuotations: false,
        allowManualOverride: false,
        showOriginalPrice: false,
        profitProtectionMode: false
      };
      const result = PricingSettingsValidator.validate(settings);
      expect(result.valid).toBe(true);
      expect(result.data).toBeDefined();
    });

    it('should accept settings with smart thresholds', () => {
      const settings = {
        enableRounding: true,
        defaultMethod: 'ALWAYS_UP_CUSTOM',
        customStep: 100,
        applyToPOS: false,
        applyToInvoices: false,
        applyToQuotations: false,
        allowManualOverride: false,
        showOriginalPrice: false,
        profitProtectionMode: true,
        enableSmartThresholds: true,
        thresholdRules: [
          { minPrice: 0, maxPrice: 1000, step: 50, method: 'ALWAYS_UP_50' },
          { minPrice: 1000, step: 100, method: 'ALWAYS_UP_100' }
        ]
      };
      const result = PricingSettingsValidator.validate(settings);
      expect(result.valid).toBe(true);
      expect(result.data?.thresholdRules).toHaveLength(2);
    });

    it('should accept settings with analytics', () => {
      const settings = {
        enableRounding: true,
        defaultMethod: 'NEAREST_100',
        customStep: 100,
        applyToPOS: false,
        applyToInvoices: false,
        applyToQuotations: false,
        allowManualOverride: false,
        showOriginalPrice: false,
        profitProtectionMode: false,
        analytics: {
          totalExtraProfit: 1500.75,
          roundedTransactions: 42,
          lastUpdatedAt: '2025-01-15T10:30:00Z',
          byMethod: { 'NEAREST_50': 20, 'ALWAYS_UP_100': 22 }
        }
      };
      const result = PricingSettingsValidator.validate(settings);
      expect(result.valid).toBe(true);
      expect(result.data?.analytics?.totalExtraProfit).toBe(1500.75);
    });
  });

  describe('invalid configurations', () => {
    it('should reject missing required fields', () => {
      const settings = {
        enableRounding: true,
        defaultMethod: 'NEAREST_50',
        customStep: 50
        // Missing other required fields
      };
      const result = PricingSettingsValidator.validate(settings);
      expect(result.valid).toBe(false);
      expect(result.errors).toBeDefined();
    });

    it('should reject invalid defaultMethod', () => {
      const settings = {
        enableRounding: true,
        defaultMethod: 'INVALID_METHOD',
        customStep: 50,
        applyToPOS: false,
        applyToInvoices: false,
        applyToQuotations: false,
        allowManualOverride: false,
        showOriginalPrice: false,
        profitProtectionMode: false
      };
      const result = PricingSettingsValidator.validate(settings);
      expect(result.valid).toBe(false);
      expect(result.errors?.some(e => e.path === 'defaultMethod')).toBe(true);
    });

    it('should reject non-positive customStep', () => {
      const settings = {
        enableRounding: true,
        defaultMethod: 'NEAREST_50',
        customStep: 0,
        applyToPOS: false,
        applyToInvoices: false,
        applyToQuotations: false,
        allowManualOverride: false,
        showOriginalPrice: false,
        profitProtectionMode: false
      };
      const result = PricingSettingsValidator.validate(settings);
      expect(result.valid).toBe(false);
    });

    it('should reject non-integer customStep', () => {
      const settings = {
        enableRounding: true,
        defaultMethod: 'NEAREST_50',
        customStep: 50.5,
        applyToPOS: false,
        applyToInvoices: false,
        applyToQuotations: false,
        allowManualOverride: false,
        showOriginalPrice: false,
        profitProtectionMode: false
      };
      const result = PricingSettingsValidator.validate(settings);
      expect(result.valid).toBe(false);
    });

    it('should reject thresholdRules with missing minPrice', () => {
      const settings = {
        enableRounding: true,
        defaultMethod: 'ALWAYS_UP_CUSTOM',
        customStep: 100,
        applyToPOS: false,
        applyToInvoices: false,
        applyToQuotations: false,
        allowManualOverride: false,
        showOriginalPrice: false,
        profitProtectionMode: false,
        thresholdRules: [
          { step: 50 } // missing minPrice
        ]
      };
      const result = PricingSettingsValidator.validate(settings);
      expect(result.valid).toBe(false);
    });

    it('should reject thresholdRules with non-positive step', () => {
      const settings = {
        enableRounding: true,
        defaultMethod: 'ALWAYS_UP_CUSTOM',
        customStep: 100,
        applyToPOS: false,
        applyToInvoices: false,
        applyToQuotations: false,
        allowManualOverride: false,
        showOriginalPrice: false,
        profitProtectionMode: false,
        thresholdRules: [
          { minPrice: 0, step: -10 }
        ]
      };
      const result = PricingSettingsValidator.validate(settings);
      expect(result.valid).toBe(false);
    });

    it('should reject analytics with missing required fields', () => {
      const settings = {
        enableRounding: true,
        defaultMethod: 'NEAREST_50',
        customStep: 50,
        applyToPOS: false,
        applyToInvoices: false,
        applyToQuotations: false,
        allowManualOverride: false,
        showOriginalPrice: false,
        profitProtectionMode: false,
        analytics: {
          totalExtraProfit: 100
          // missing roundedTransactions
        }
      };
      const result = PricingSettingsValidator.validate(settings);
      expect(result.valid).toBe(false);
    });
  });

  describe('utility methods', () => {
    it('should provide default settings', () => {
      const defaults = PricingSettingsValidator.getDefaultSettings();
      expect(defaults.enableRounding).toBe(false);
      expect(defaults.defaultMethod).toBe('NEAREST_50');
      expect(defaults.customStep).toBe(50);
    });

    it('should detect smart thresholds correctly', () => {
      const settingsWithThresholds = {
        enableRounding: true,
        defaultMethod: 'NEAREST_50',
        customStep: 50,
        applyToPOS: false,
        applyToInvoices: false,
        applyToQuotations: false,
        allowManualOverride: false,
        showOriginalPrice: false,
        profitProtectionMode: false,
        enableSmartThresholds: true,
        thresholdRules: [
          { minPrice: 0, step: 25 },
          { minPrice: 100, step: 50 }
        ]
      };
      expect(PricingSettingsValidator.hasSmartThresholds(settingsWithThresholds)).toBe(true);

      const settingsWithoutThresholds = {
        ...settingsWithThresholds,
        enableSmartThresholds: false
      };
      expect(PricingSettingsValidator.hasSmartThresholds(settingsWithoutThresholds)).toBe(false);
    });

    it('should determine effective method based on price', () => {
      const settings = {
        enableRounding: true,
        defaultMethod: 'NEAREST_50',
        customStep: 50,
        applyToPOS: false,
        applyToInvoices: false,
        applyToQuotations: false,
        allowManualOverride: false,
        showOriginalPrice: false,
        profitProtectionMode: false,
        enableSmartThresholds: true,
        thresholdRules: [
          { minPrice: 0, maxPrice: 100, step: 10, method: 'NEAREST_10' },
          { minPrice: 100, step: 50, method: 'NEAREST_50' }
        ]
      };

      expect(PricingSettingsValidator.getEffectiveMethod(settings, 50)).toBe('NEAREST_10');
      expect(PricingSettingsValidator.getEffectiveMethod(settings, 150)).toBe('NEAREST_50');
      expect(PricingSettingsValidator.getEffectiveMethod(settings, 500)).toBe('NEAREST_50'); // falls back to last rule
    });
  });
});
