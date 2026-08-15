import { z } from 'zod';

/**
 * PricingSettings validation schema
 * Used to validate the pricing configuration before saving to the database
 */
export const PricingSettingsSchema = z.object({
  enableRounding: z.boolean(),
  defaultMethod: z.enum([
    'NEAREST_10',
    'NEAREST_50',
    'NEAREST_100',
    'ALWAYS_UP_10',
    'ALWAYS_UP_50',
    'ALWAYS_UP_100',
    'ALWAYS_UP_500',
    'ALWAYS_UP_CUSTOM',
    'PSYCHOLOGICAL'
  ]),
  customStep: z.number().int().positive(),
  applyToPOS: z.boolean(),
  applyToInvoices: z.boolean(),
  applyToQuotations: z.boolean(),
  allowManualOverride: z.boolean(),
  showOriginalPrice: z.boolean(),
  profitProtectionMode: z.boolean(),
  enableSmartThresholds: z.boolean().optional(),
  thresholdRules: z.array(z.object({
    minPrice: z.number(),
    maxPrice: z.number().optional(),
    step: z.number().int().positive(),
    method: z.enum([
      'NEAREST_10',
      'NEAREST_50',
      'NEAREST_100',
      'ALWAYS_UP_10',
      'ALWAYS_UP_50',
      'ALWAYS_UP_100',
      'ALWAYS_UP_500',
      'ALWAYS_UP_CUSTOM',
      'PSYCHOLOGICAL'
    ]).optional()
  })).optional(),
  analytics: z.object({
    totalExtraProfit: z.number(),
    roundedTransactions: z.number(),
    lastUpdatedAt: z.string().optional(),
    byMethod: z.record(z.string(), z.number()).optional()
  }).optional()
});

/**
 * Type for pricing settings derived from the schema
 */
export type PricingSettings = z.infer<typeof PricingSettingsSchema>;

/**
 * Validation result type for pricing settings
 */
export interface PricingSettingsValidationResult {
  valid: boolean;
  data?: PricingSettings;
  errors?: Array<{
    path: string;
    message: string;
  }>;
}

/**
 * Utility class for validating pricing settings
 * Provides consistent validation across the application
 */
export class PricingSettingsValidator {
  /**
   * Validate pricing settings data
   * @param settings The pricing settings to validate
   * @returns Validation result with detailed error information if invalid
   */
  static validate(settings: unknown): PricingSettingsValidationResult {
    try {
      const data = PricingSettingsSchema.parse(settings);
      return {
        valid: true,
        data
      };
    } catch (error) {
      if (error instanceof z.ZodError) {
        return {
          valid: false,
          errors: error.issues.map(err => ({
            path: err.path.join('.'),
            message: err.message
          }))
        };
      }
      return {
        valid: false,
        errors: [{ path: 'unknown', message: 'Unknown validation error' }]
      };
    }
  }

  /**
   * Validate pricing settings and throw on error
   * Use this when you want to fail fast on invalid settings
   * @param settings The pricing settings to validate
   * @throws FormulaEngineError with validation details
   */
  static validateOrThrow(settings: unknown): PricingSettings {
    const result = this.validate(settings);
    if (!result.valid) {
      const errorMessages = result.errors?.map(e => `${e.path}: ${e.message}`).join(', ') || 'Unknown error';
      throw new Error(`Invalid pricing settings: ${errorMessages}`);
    }
    return result.data!;
  }

  /**
   * Get default valid pricing settings
   * Useful for creating new configurations or resetting to defaults
   */
  static getDefaultSettings(): PricingSettings {
    return {
      enableRounding: false,
      defaultMethod: 'NEAREST_50',
      customStep: 50,
      applyToPOS: false,
      applyToInvoices: false,
      applyToQuotations: false,
      allowManualOverride: false,
      showOriginalPrice: false,
      profitProtectionMode: false
    };
  }

  /**
   * Check if settings have smart thresholds enabled
   * @param settings The pricing settings to check
   * @returns true if smart thresholds are enabled and have valid rules
   */
  static hasSmartThresholds(settings: PricingSettings): boolean {
    if (!settings.enableSmartThresholds) {
      return false;
    }
    if (!settings.thresholdRules || settings.thresholdRules.length === 0) {
      return false;
    }
    // Validate that all rules have required fields
    return settings.thresholdRules.every(rule => 
      rule.minPrice !== undefined && 
      rule.step !== undefined && 
      rule.step > 0
    );
  }

  /**
   * Get the effective rounding method for a given price
   * Considers smart thresholds if enabled
   * @param settings The pricing settings
   * @param price The price to determine method for
   * @returns The rounding method to use
   */
  static getEffectiveMethod(settings: PricingSettings, price: number): string {
    if (this.hasSmartThresholds(settings) && settings.thresholdRules) {
      // Find the first rule that matches the price range
      for (const rule of settings.thresholdRules) {
        if (price >= rule.minPrice && (rule.maxPrice === undefined || price <= rule.maxPrice)) {
          return rule.method || settings.defaultMethod;
        }
      }
    }
    return settings.defaultMethod;
  }
}

export default PricingSettingsValidator;
