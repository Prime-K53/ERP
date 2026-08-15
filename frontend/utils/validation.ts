export interface ValidationError {
  field: string;
  message: string;
}

export type ValidationResult = { valid: true; errors: [] } | { valid: false; errors: ValidationError[] };

export const valid = (): ValidationResult => ({ valid: true, errors: [] });

export const invalid = (errors: ValidationError[]): ValidationResult => ({ valid: false, errors });

export const validateRequired = (value: any, field: string, label: string): ValidationError | null => {
  if (value === undefined || value === null || (typeof value === 'string' && value.trim() === '')) {
    return { field, message: `${label} is required` };
  }
  return null;
};

export const validatePositiveNumber = (value: any, field: string, label: string): ValidationError | null => {
  const num = Number(value);
  if (isNaN(num) || num <= 0) {
    return { field, message: `${label} must be a positive number` };
  }
  return null;
};

export const validateNonNegative = (value: any, field: string, label: string): ValidationError | null => {
  if (value === undefined || value === null) return { field, message: `${label} is required` };
  const num = Number(value);
  if (isNaN(num) || num < 0) {
    return { field, message: `${label} must be zero or greater` };
  }
  return null;
};

export const validateMinLength = (value: string, min: number, field: string, label: string): ValidationError | null => {
  if (!value || value.trim().length < min) {
    return { field, message: `${label} must be at least ${min} characters` };
  }
  return null;
};

export const chain = (...checks: (ValidationError | null)[]): ValidationResult => {
  const errors = checks.filter((e): e is ValidationError => e !== null);
  return errors.length === 0 ? valid() : invalid(errors);
};

export const validateEntity = <T extends Record<string, any>>(
  entity: T,
  rules: { field: keyof T; checks: ((val: any, field: string) => ValidationError | null)[] }[]
): ValidationResult => {
  const errors: ValidationError[] = [];
  for (const rule of rules) {
    for (const check of rule.checks) {
      const err = check(entity[rule.field], rule.field as string);
      if (err) errors.push(err);
    }
  }
  return errors.length === 0 ? valid() : invalid(errors);
};

export const formatErrors = (result: ValidationResult): string => {
  if (result.valid) return '';
  return result.errors.map(e => `${e.field}: ${e.message}`).join('; ');
};
