import { describe, it, expect } from 'vitest';
import { assertInvoiceNumberFormat, generateNextId } from '../../utils/helpers';
import { CompanyConfig } from '../../types';

const buildSharedConfig = (padding: number): CompanyConfig => ({
  transactionSettings: {
    numbering: {
      shared: {
        prefix: '',
        startNumber: 1,
        padding,
        resetInterval: 'Never'
      }
    }
  }
} as CompanyConfig);

const buildLegacyInvoiceConfig = (padding: number): CompanyConfig => ({
  transactionSettings: {
    numbering: {
      invoice: {
        prefix: 'INV',
        startNumber: 1,
        padding,
        resetInterval: 'Never'
      }
    }
  }
} as CompanyConfig);

describe('invoice numbering padding', () => {
  it('pads invoice numbers to configured length', () => {
    const config = buildSharedConfig(5);
    const first = generateNextId('invoice', [], config);
    const second = generateNextId('invoice', [{ id: first, date: '2026-01-01' }], config);
    expect(first).toBe('INV-00001');
    expect(second).toBe('INV-00002');
  });

  it('uses built-in prefixes for non-invoice documents with the shared rule', () => {
    const config = buildSharedConfig(3);
    expect(generateNextId('quotation', [], config)).toBe('QTN-001');
    expect(generateNextId('supplier', [], config)).toBe('SUP-001');
  });

  it('includes the configured global extension in generated numbers', () => {
    const config = {
      transactionSettings: {
        numbering: {
          shared: {
            prefix: '',
            startNumber: 1,
            padding: 4,
            extension: 'P7',
            resetInterval: 'Never'
          }
        }
      }
    } as CompanyConfig;

    expect(generateNextId('invoice', [], config)).toBe('INV-P7/0001');
    expect(generateNextId('quotation', [], config)).toBe('QTN-P7/0001');
  });

  it('resets numbering daily when the shared rule requires it', () => {
    const config = {
      transactionSettings: {
        numbering: {
          shared: {
            prefix: '',
            startNumber: 7,
            padding: 3,
            resetInterval: 'Daily'
          }
        }
      }
    } as CompanyConfig;

    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);

    expect(generateNextId('invoice', [{ id: 'INV-025', date: yesterday.toISOString() }], config)).toBe('INV-007');
  });

  it('keeps legacy invoice settings working', () => {
    const config = buildLegacyInvoiceConfig(4);
    expect(generateNextId('invoice', [], config)).toBe('INV-0001');
  });

  it('validates invoice number format against padding', () => {
    const config = buildSharedConfig(3);
    expect(() => assertInvoiceNumberFormat('INV-001', config, 'invoice')).not.toThrow();
    expect(() => assertInvoiceNumberFormat('INV-01', config, 'invoice')).toThrow();
  });
});
