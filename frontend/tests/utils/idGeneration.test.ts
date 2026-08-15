import { describe, expect, it } from 'vitest';
import { CompanyConfig } from '../../types';
import {
  generateCustomerId,
  generateLocalId,
  generateNumericAccountNumber,
  generateOpaqueId,
  generateSequentialId,
} from '../../utils/idGeneration';

describe('idGeneration', () => {
  it('uses ULID-based local ids (globally unique, time-sortable)', () => {
    const defaultId = generateLocalId();
    expect(defaultId.slice('local-'.length)).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
    const id = generateLocalId('local');
    expect(id.startsWith('local-')).toBe(true);
    expect(id.slice('local-'.length)).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
  });

  it('creates opaque prefixed ids for local-only records', () => {
    expect(generateOpaqueId('TXN', { randomLength: 4 })).toMatch(/^TXN-\d+-[a-z0-9]{4}$/);
  });

  it('preserves shared sequential numbering rules for non-customer documents', () => {
    const config = {
      transactionSettings: {
        numbering: {
          shared: {
            prefix: '',
            startNumber: 7,
            padding: 3,
            resetInterval: 'Never',
          },
        },
      },
    } as CompanyConfig;

    expect(generateSequentialId('supplier', [], config)).toBe('SUP-007');
  });

  it('keeps customer ids on a fixed CUST-XXXX sequence regardless of settings', () => {
    const config = {
      transactionSettings: {
        numbering: {
          shared: {
            prefix: 'X',
            startNumber: 7,
            padding: 3,
            resetInterval: 'Never',
          },
        },
      },
    } as CompanyConfig;

    expect(generateSequentialId('customer', [], config)).toBe('CUST-0001');
    expect(generateSequentialId('customer', [{ id: 'CUST-0003' }], config)).toBe('CUST-0004');
    expect(generateCustomerId([])).toBe('CUST-0001');
    expect(generateCustomerId([{ id: 'CUST-0009' }, { id: 'CUST-0011' }])).toBe('CUST-0012');
  });

  it('creates fixed-length numeric account numbers without a leading zero', () => {
    expect(generateNumericAccountNumber()).toMatch(/^[1-9]\d{7}$/);
  });
});
