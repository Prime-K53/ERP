import { useCallback } from 'react';
import { useFinancialYear } from '../context/FinancialYearContext';

export interface DateValidationResult {
  valid: boolean;
  error: string | null;
  fyName: string | null;
}

export const useDateValidation = () => {
  const { selectedFinancialYear, validateDateInFY } = useFinancialYear();

  const validateDate = useCallback((date: string): DateValidationResult => {
    const error = validateDateInFY(date);
    return {
      valid: !error,
      error,
      fyName: selectedFinancialYear?.name || null,
    };
  }, [validateDateInFY, selectedFinancialYear]);

  const getDefaultDate = useCallback((): string => {
    if (!selectedFinancialYear) return new Date().toISOString().slice(0, 10);
    const today = new Date().toISOString().slice(0, 10);
    const error = validateDateInFY(today);
    if (!error) return today;
    return selectedFinancialYear.start_date;
  }, [selectedFinancialYear, validateDateInFY]);

  return {
    validateDate,
    getDefaultDate,
    isClosed: selectedFinancialYear?.is_closed === 1,
    fyName: selectedFinancialYear?.name || null,
  };
};

export default useDateValidation;