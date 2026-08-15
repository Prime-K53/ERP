import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { calculateAccountBalances, getAgedData } from '../../services/reportService';

describe('reportService', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-02-23T12:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('classifies P&L vs Balance Sheet balances per debit and credit account type', () => {
    const accounts = [
      { id: 'A-100', code: '1000', name: 'Cash', type: 'Asset' },
      { id: 'L-200', code: '2000', name: 'AP', type: 'Liability' },
      { id: 'R-400', code: '4000', name: 'Sales', type: 'Revenue' },
      { id: 'E-500', code: '5000', name: 'Supplies Expense', type: 'Expense' }
    ];

    const ledger = [
      // Prior period: should affect Liability (BS) but not Expense (P&L in current period).
      { id: 'L1', date: '2026-01-15T10:00:00.000Z', debitAccountId: 'E-500', creditAccountId: 'L-200', amount: 100 },
      // Current period.
      { id: 'L2', date: '2026-02-10T10:00:00.000Z', debitAccountId: 'E-500', creditAccountId: 'L-200', amount: 50 },
      { id: 'L3', date: '2026-02-12T10:00:00.000Z', debitAccountId: 'A-100', creditAccountId: 'R-400', amount: 80 }
    ];

    const balances = calculateAccountBalances(accounts, ledger, { start: '2026-02-01', end: '2026-02-28' });

    expect(balances.current['E-500']).toBe(50);
    expect(balances.current['L-200']).toBe(-50);
    expect(balances.current['A-100']).toBe(80);
    expect(balances.current['R-400']).toBe(-80);
  });

  it('uses dueDate (fallback date) for AR and AP aging buckets', () => {
    const invoices = [
      {
        id: 'INV-1',
        customerName: 'Acme',
        date: '2026-01-01T00:00:00.000Z',
        dueDate: '2026-03-05T00:00:00.000Z',
        totalAmount: 100,
        paidAmount: 0,
        status: 'Unpaid',
        items: []
      },
      {
        id: 'INV-2',
        customerName: 'Beta',
        date: '2026-01-01T00:00:00.000Z',
        dueDate: '2026-02-01T00:00:00.000Z',
        totalAmount: 200,
        paidAmount: 0,
        status: 'Unpaid',
        items: []
      },
      {
        id: 'INV-3',
        customerName: 'Cancelled',
        date: '2026-01-01T00:00:00.000Z',
        dueDate: '2025-11-01T00:00:00.000Z',
        totalAmount: 999,
        paidAmount: 0,
        status: 'Cancelled',
        items: []
      }
    ];

    const purchases = [
      {
        id: 'PO-1',
        supplierId: 'SUP-1',
        date: '2026-02-10T00:00:00.000Z',
        dueDate: '2026-02-20T00:00:00.000Z',
        totalAmount: 120,
        paidAmount: 20,
        paymentStatus: 'Partial',
        status: 'Open'
      },
      {
        id: 'PO-2',
        supplierId: 'SUP-2',
        date: '2026-02-10T00:00:00.000Z',
        dueDate: '2026-02-15T00:00:00.000Z',
        totalAmount: 50,
        paidAmount: 0,
        paymentStatus: 'Partial',
        status: 'Open'
      }
    ];

    const aged = getAgedData(invoices, purchases);

    expect(aged.ar.buckets['0-30']).toBe(300);
    expect(aged.ar.buckets['90+']).toBe(999);
    expect(aged.ap.buckets['0-30']).toBe(150);
  });
});
