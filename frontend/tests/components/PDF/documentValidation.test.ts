import { describe, it, expect } from 'vitest';
import { validateDocumentData, sanitizePdfPayload } from '../../../views/shared/components/PDF/documentValidation';

// ──────────────────────────────────────────
// Semantic validation tests
// ──────────────────────────────────────────

describe('validateDocumentData — semantic validation', () => {
  const validInvoice = {
    number: 'INV-001',
    items: [{ desc: 'Paper', qty: 10, price: 5, total: 50 }],
    subtotal: 50,
    totalAmount: 50,
  };

  const validReceipt = {
    receiptNumber: 'RCP-001',
    customerName: 'Client',
    amountReceived: 100,
    paymentMethod: 'Cash',
  };

  const validPosReceipt = {
    receiptNumber: 'POS-001',
    cashierName: 'Jane',
    items: [{ desc: 'Item', qty: 1, price: 10, total: 10 }],
    subtotal: 10,
    totalAmount: 10,
    paymentMethod: 'Card',
  };

  const validStatement = {
    customerName: 'Client',
    startDate: '2025-01-01',
    endDate: '2025-01-31',
    openingBalance: 0,
    finalBalance: 100,
    transactions: [{ date: '2025-01-15', reference: 'INV-001', debit: 100, credit: 0, runningBalance: 100 }],
    totalInvoiced: 100,
    totalReceived: 0,
  };

  const validPo = {
    number: 'PO-001',
    supplierName: 'Vendor',
    items: [{ desc: 'Supplies', qty: 5, price: 20, total: 100 }],
    subtotal: 100,
    totalAmount: 100,
  };

  const validWorkOrder = {
    number: 'WO-001',
    instructions: 'Print 1000 booklets',
  };

  const validDeliveryNote = {
    number: 'DN-001',
    clientName: 'Client',
    items: [{ desc: 'Books', qty: 100 }],
  };

  const validFiscalReport = {
    reportName: 'Q1 2025',
    period: 'Jan-Mar 2025',
    sections: [{ title: 'Revenue', rows: [{ label: 'Sales', amount: 1000 }] }],
  };

  const validSalesExchange = {
    exchangeNumber: 'EX-001',
    customerName: 'Client',
    invoiceNumber: 'INV-001',
    reason: 'Damaged goods',
  };

  it('accepts valid invoice', () => {
    expect(validateDocumentData('INVOICE', validInvoice)).toEqual({ valid: true });
  });

  it('accepts valid ORDER', () => {
    expect(validateDocumentData('ORDER', validInvoice)).toEqual({ valid: true });
  });

  it('accepts valid QUOTATION', () => {
    expect(validateDocumentData('QUOTATION', validInvoice)).toEqual({ valid: true });
  });

  it('accepts valid receipt', () => {
    expect(validateDocumentData('RECEIPT', validReceipt)).toEqual({ valid: true });
  });

  it('accepts valid POS receipt', () => {
    expect(validateDocumentData('POS_RECEIPT', validPosReceipt)).toEqual({ valid: true });
  });

  it('accepts valid statement', () => {
    expect(validateDocumentData('ACCOUNT_STATEMENT', validStatement)).toEqual({ valid: true });
  });

  it('accepts valid PO', () => {
    expect(validateDocumentData('PO', validPo)).toEqual({ valid: true });
  });

  it('accepts valid work order', () => {
    expect(validateDocumentData('WORK_ORDER', validWorkOrder)).toEqual({ valid: true });
  });

  it('accepts valid delivery note', () => {
    expect(validateDocumentData('DELIVERY_NOTE', validDeliveryNote)).toEqual({ valid: true });
  });

  it('accepts valid fiscal report', () => {
    expect(validateDocumentData('FISCAL_REPORT', validFiscalReport)).toEqual({ valid: true });
  });

  it('accepts valid sales exchange', () => {
    expect(validateDocumentData('SALES_EXCHANGE', validSalesExchange)).toEqual({ valid: true });
  });

  it('accepts valid supplier payment', () => {
    expect(validateDocumentData('SUPPLIER_PAYMENT', { paymentId: 'PMT-001', supplierName: 'Vendor', amountPaid: 500 })).toEqual({ valid: true });
  });

  // ── Rejection tests ──

  it('rejects null data', () => {
    const r = validateDocumentData('INVOICE', null);
    expect(r.valid).toBe(false);
    expect(r.error).toContain('empty');
  });

  it('rejects undefined data', () => {
    const r = validateDocumentData('INVOICE', undefined);
    expect(r.valid).toBe(false);
  });

  it('rejects invoice without items', () => {
    const r = validateDocumentData('INVOICE', { number: 'INV-001', subtotal: 0, totalAmount: 0 });
    expect(r.valid).toBe(false);
    expect(r.error).toContain('line items');
  });

  it('rejects invoice with empty items array', () => {
    const r = validateDocumentData('INVOICE', { number: 'INV-001', items: [], subtotal: 0, totalAmount: 0 });
    expect(r.valid).toBe(false);
    expect(r.error).toContain('no line items');
  });

  it('rejects invoice with items that have no descriptions', () => {
    const r = validateDocumentData('INVOICE', { number: 'INV-001', items: [{ qty: 1, price: 10, total: 10 }], subtotal: 10, totalAmount: 10 });
    expect(r.valid).toBe(false);
    expect(r.error).toContain('no descriptions');
  });

  it('rejects POS receipt without items', () => {
    const r = validateDocumentData('POS_RECEIPT', { receiptNumber: 'POS-001', cashierName: 'J', subtotal: 0, totalAmount: 0, paymentMethod: 'Cash' });
    expect(r.valid).toBe(false);
    expect(r.error).toContain('line items');
  });

  it('rejects statement without transactions', () => {
    const r = validateDocumentData('ACCOUNT_STATEMENT', { customerName: 'C', startDate: 'X', endDate: 'Y', openingBalance: 0, finalBalance: 0, transactions: [] });
    expect(r.valid).toBe(false);
    expect(r.error).toContain('no transactions');
  });

  it('rejects PO without items', () => {
    const r = validateDocumentData('PO', { number: 'PO-001', supplierName: 'V', items: [], subtotal: 0, totalAmount: 0 });
    expect(r.valid).toBe(false);
    expect(r.error).toContain('no line items');
  });

  it('rejects delivery note without items', () => {
    const r = validateDocumentData('DELIVERY_NOTE', { number: 'DN-001', clientName: 'C' });
    expect(r.valid).toBe(false);
    expect(r.error).toContain('delivery items');
  });

  it('rejects fiscal report without sections', () => {
    const r = validateDocumentData('FISCAL_REPORT', { reportName: 'R', period: 'P' });
    expect(r.valid).toBe(false);
    expect(r.error).toContain('sections');
  });

  // ── Anti-regression: 5 KB blank PDF bug ──

  it('rejects data with items: undefined (the 5 KB bug)', () => {
    // This was the root cause: items: undefined → JSON.stringify drops key → empty PDF
    const badData = {
      number: 'INV-001',
      items: undefined,  // was the bug
      subtotal: 0,
      totalAmount: 0,
    };
    const r = validateDocumentData('INVOICE', badData);
    expect(r.valid).toBe(false);
    expect(r.error).toContain('line items');
  });

  it('rejects data with items: null', () => {
    const r = validateDocumentData('INVOICE', { number: 'INV-001', items: null, subtotal: 0, totalAmount: 0 });
    expect(r.valid).toBe(false);
    expect(r.error).toContain('line items');
  });

  it('rejects completely empty object as invoice', () => {
    const r = validateDocumentData('INVOICE', {});
    expect(r.valid).toBe(false);
  });
});

// ──────────────────────────────────────────
// Serialization safety tests
// ──────────────────────────────────────────

describe('sanitizePdfPayload — serialization safety', () => {
  it('converts undefined to null', () => {
    const result = sanitizePdfPayload({ a: undefined });
    expect(result.a).toBe(null);
  });

  it('converts Date to ISO string', () => {
    const d = new Date('2025-01-15T10:00:00Z');
    const result = sanitizePdfPayload({ createdAt: d });
    expect(result.createdAt).toBe('2025-01-15T10:00:00.000Z');
  });

  it('converts Map to object', () => {
    const m = new Map([['key1', 'value1'], ['key2', 42]]);
    const result = sanitizePdfPayload({ map: m });
    expect(result.map).toEqual({ key1: 'value1', key2: 42 });
  });

  it('converts Set to array', () => {
    const s = new Set(['a', 'b', 'c']);
    const result = sanitizePdfPayload({ set: s });
    expect(result.set).toEqual(['a', 'b', 'c']);
  });

  it('handles nested objects', () => {
    const obj = {
      items: [
        { desc: 'Paper', qty: 10, price: 5, total: 50, discount: undefined },
        { desc: 'Toner', qty: 2, price: undefined, total: 100 },
      ],
    };
    const result = sanitizePdfPayload(obj);
    expect(result.items[0].discount).toBe(null);
    expect(result.items[1].price).toBe(null);
    expect(result.items[0].desc).toBe('Paper');
  });

  it('preserves null', () => {
    const result = sanitizePdfPayload({ a: null, b: 'hello', c: 42 });
    expect(result).toEqual({ a: null, b: 'hello', c: 42 });
  });

  it('removes functions', () => {
    const result = sanitizePdfPayload({ a: () => 42, b: 'keep' });
    expect(result.a).toBe(null);
    expect(result.b).toBe('keep');
  });

  it('handles BigInt', () => {
    const result = sanitizePdfPayload({ big: BigInt(9007199254740991) });
    expect(result.big).toBe('9007199254740991');
  });

  it('handles deeply nested structure', () => {
    const deep = {
      level1: {
        level2: {
          level3: {
            value: 'found',
            undef: undefined,
          },
        },
      },
    };
    const result = sanitizePdfPayload(deep);
    expect(result.level1.level2.level3.value).toBe('found');
    expect(result.level1.level2.level3.undef).toBe(null);
  });

  it('returns null for null/undefined input', () => {
    expect(sanitizePdfPayload(null)).toBe(null);
    expect(sanitizePdfPayload(undefined)).toBe(null);
  });
});

// ──────────────────────────────────────────
// End-to-end: simulated 5 KB blank PDF prevention
// ──────────────────────────────────────────

describe('Anti-regression — 5 KB blank PDF', () => {
  const simulateWorkerGenerate = (type: string, data: any): { blocked: boolean; reason?: string } => {
    const validation = validateDocumentData(type, data);
    if (!validation.valid) {
      return { blocked: true, reason: validation.error };
    }
    const safe = sanitizePdfPayload(data);
    // Re-validate after sanitization
    const recheck = validateDocumentData(type, safe);
    if (!recheck.valid) {
      return { blocked: true, reason: recheck.error };
    }
    return { blocked: false };
  };

  it('blocks the original 5 KB bug scenario (items: undefined)', () => {
    const result = simulateWorkerGenerate('INVOICE', {
      number: 'INV-001',
      items: undefined,
      subtotal: 0,
      totalAmount: 0,
    });
    expect(result.blocked).toBe(true);
    expect(result.reason).toContain('line items');
  });

  it('blocks items: null', () => {
    const result = simulateWorkerGenerate('INVOICE', {
      number: 'INV-001',
      items: null,
      subtotal: 0,
      totalAmount: 0,
    });
    expect(result.blocked).toBe(true);
    expect(result.reason).toContain('line items');
  });

  it('blocks empty items array', () => {
    const result = simulateWorkerGenerate('INVOICE', {
      number: 'INV-001',
      items: [],
      subtotal: 0,
      totalAmount: 0,
    });
    expect(result.blocked).toBe(true);
  });

  it('allows valid invoice through both layers', () => {
    const result = simulateWorkerGenerate('INVOICE', {
      number: 'INV-001',
      items: [{ desc: 'Paper', qty: 10, price: 5, total: 50 }],
      subtotal: 50,
      totalAmount: 50,
    });
    expect(result.blocked).toBe(false);
  });
});
