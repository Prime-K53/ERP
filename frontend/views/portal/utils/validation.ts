export function isNonEmpty(value: unknown): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}

export function minLength(length: number) {
  return (value: unknown): boolean => typeof value === 'string' && value.trim().length >= length;
}

export function isEmail(value: unknown): boolean {
  return typeof value === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

export function isNumeric(value: unknown): boolean {
  return typeof value === 'string' && value.trim() !== '' && !Number.isNaN(Number(value));
}

export function isPositiveNumber(value: unknown): boolean {
  return isNumeric(value) && Number(value) > 0;
}

export function matches(otherValue: string) {
  return (value: unknown): boolean => typeof value === 'string' && value === otherValue;
}

export function validateRequired(value: unknown, fieldName: string): string | null {
  if (!isNonEmpty(value)) return `${fieldName} is required`;
  return null;
}

export function validateEmail(value: unknown, fieldName = 'Email'): string | null {
  if (!isNonEmpty(value)) return `${fieldName} is required`;
  if (!isEmail(value)) return `${fieldName} must be a valid email address`;
  return null;
}

export function validatePassword(value: unknown, minLen = 6): string | null {
  if (!isNonEmpty(value)) return 'Password is required';
  if ((value as string).length < minLen) return `Password must be at least ${minLen} characters`;
  return null;
}

export function validateConfirmPassword(password: string, confirm: string): string | null {
  if (!isNonEmpty(confirm)) return 'Please confirm your password';
  if (password !== confirm) return 'Passwords do not match';
  return null;
}
