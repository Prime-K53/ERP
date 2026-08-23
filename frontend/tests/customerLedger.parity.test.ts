/**
 * customerLedger.parity.test.ts — Frontend parity test for the canonical
 * customer ledger. Uses the same fixtures as the backend test
 * (backend/tests/customerLedger.parity.test.cjs) to prove behavioral parity.
 *
 * Run: cd frontend && npx vitest run tests/customerLedger.parity.test.ts
 */

import { describe, it, expect } from 'vitest';
import {
  buildLedgerFromRecords,
  round2,
  isInvoiceIncluded,
  isPaymentIncluded,
  isWalletTopup,
  paymentCredit,
  allocationSum,
  type AnyRecord,
} from '../services/customerLedger';

const CID = 'CUST-TEST-001';

// ── Helpers (mirrored from backend test) ────────────────────────────────────

function inv(overrides: Partial<AnyRecord> = {}): AnyRecord {
  return {
    id: `INV-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    customerId: CID,
    totalAmount: 0,
    total_amount: 0,
    status: 'posted',
    createdAt: '2026-08-22T10:00:00Z',
    created_at: '2026-08-22T10:00:00Z',
    ...overrides,
  };
}

function pay(overrides: Partial<AnyRecord> = {}): AnyRecord {
  return {
    id: `PAY-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    customerId: CID,
    amount: 0,
    amountApplied: 0,
    amount_applied: 0,
    status: 'completed',
    createdAt: '2026-08-22T12:00:00Z',
    created_at: '2026-08-22T12:00:00Z',
    allocations: [],
    ...overrides,
  };
}

function ledger(
  invoices: AnyRecord[],
  payments: AnyRecord[],
  opts: { openingBalance?: number } = {},
) {
  return buildLedgerFromRecords({
    customerId: CID,
    invoices,
    payments,
    openingBalance: opts.openingBalance ?? 0,
  });
}

// ── Fixture 1: Basic Invoice ───────────────────────────────────────────────

describe('Fixture 1: Basic invoice', () => {
  it('Balance = invoice total when no payments', () => {
    const invs = [inv({ id: 'INV-001', totalAmount: 100000, total_amount: 100000 })];
    const result = ledger(invs, []);
    expect(result.outstandingBalance).toBe(100000);
    expect(result.closingBalance).toBe(100000);
    expect(result.transactions.length).toBe(1);
    expect(result.transactions[0].type).toBe('invoice');
    expect(result.transactions[0].debit).toBe(100000);
    expect(result.transactions[0].credit).toBe(0);
    expect(result.transactions[0].balance).toBe(100000);
  });
});

// ── Fixture 2: Posted Payment ──────────────────────────────────────────────

describe('Fixture 2: Posted payment', () => {
  it('Payment reduces outstanding balance', () => {
    const invs = [inv({ id: 'INV-001', totalAmount: 100000, total_amount: 100000, createdAt: '2026-08-01T10:00:00Z', created_at: '2026-08-01T10:00:00Z' })];
    const pays = [pay({ id: 'PAY-001', amountApplied: 30000, amount_applied: 30000, amount: 30000, createdAt: '2026-08-02T10:00:00Z', created_at: '2026-08-02T10:00:00Z' })];
    const result = ledger(invs, pays);
    expect(result.outstandingBalance).toBe(70000);
    expect(result.closingBalance).toBe(70000);
    expect(result.transactions.length).toBe(2);
    expect(result.transactions[0].type).toBe('invoice');
    expect(result.transactions[0].balance).toBe(100000);
    expect(result.transactions[1].type).toBe('payment');
    expect(result.transactions[1].balance).toBe(70000);
  });
});

// ── Fixture 3: Pending Payment Request ─────────────────────────────────────

describe('Fixture 3: Pending payment request', () => {
  it('Does NOT affect balance', () => {
    const invs = [inv({ id: 'INV-001', totalAmount: 100000, total_amount: 100000 })];
    const result = ledger(invs, []);
    expect(result.outstandingBalance).toBe(100000);
    expect(result.transactions.length).toBe(1);
  });
});

// ── Fixture 4: Draft Invoice ───────────────────────────────────────────────

describe('Fixture 4: Draft invoice', () => {
  it('Excluded from ledger', () => {
    const invs = [inv({ id: 'INV-D1', totalAmount: 50000, total_amount: 50000, status: 'draft' })];
    const result = ledger(invs, []);
    expect(result.outstandingBalance).toBe(0);
    expect(result.closingBalance).toBe(0);
    expect(result.transactions.length).toBe(0);
    expect(result.excluded.length).toBe(1);
    expect(result.excluded[0].reason).toBe('draft');
  });
});

// ── Fixture 5: Cancelled Invoice ───────────────────────────────────────────

describe('Fixture 5: Cancelled invoice', () => {
  it('Excluded', () => {
    const invs = [inv({ id: 'INV-C1', totalAmount: 75000, total_amount: 75000, status: 'cancelled' })];
    const result = ledger(invs, []);
    expect(result.outstandingBalance).toBe(0);
    expect(result.transactions.length).toBe(0);
    expect(result.excluded.length).toBe(1);
  });
});

// ── Fixture 6: Voided Invoice ──────────────────────────────────────────────

describe('Fixture 6: Voided invoice', () => {
  it('Excluded', () => {
    const invs = [inv({ id: 'INV-V1', totalAmount: 60000, total_amount: 60000, status: 'voided' })];
    const result = ledger(invs, []);
    expect(result.outstandingBalance).toBe(0);
    expect(result.transactions.length).toBe(0);
    expect(result.excluded.length).toBe(1);
  });
});

// ── Fixture 7: Cancelled Payment ───────────────────────────────────────────

describe('Fixture 7: Cancelled payment', () => {
  it('Excluded', () => {
    const invs = [inv({ id: 'INV-001', totalAmount: 100000, total_amount: 100000 })];
    const pays = [pay({ id: 'PAY-C1', amountApplied: 50000, amount_applied: 50000, amount: 50000, status: 'cancelled' })];
    const result = ledger(invs, pays);
    expect(result.outstandingBalance).toBe(100000);
    expect(result.transactions.length).toBe(1);
    expect(result.excluded.length).toBe(1);
    expect(result.excluded[0].kind).toBe('payment');
  });
});

// ── Fixture 8: Voided Payment ──────────────────────────────────────────────

describe('Fixture 8: Voided payment', () => {
  it('Excluded', () => {
    const invs = [inv({ id: 'INV-001', totalAmount: 100000, total_amount: 100000 })];
    const pays = [pay({ id: 'PAY-V1', amountApplied: 50000, amount_applied: 50000, amount: 50000, status: 'voided' })];
    const result = ledger(invs, pays);
    expect(result.outstandingBalance).toBe(100000);
    expect(result.transactions.length).toBe(1);
    expect(result.excluded.length).toBe(1);
  });
});

// ── Fixture 9: Cash with Change ────────────────────────────────────────────

describe('Fixture 9: Cash with change', () => {
  it('Receivable credit = applied amount, NOT tendered cash', () => {
    const invs = [inv({ id: 'INV-001', totalAmount: 100000, total_amount: 100000 })];
    const pays = [pay({
      id: 'PAY-CHG',
      amountApplied: 100000,
      amount_applied: 100000,
      amount: 110000,
      amountRetained: 100000,
      amount_retained: 100000,
    })];
    const result = ledger(invs, pays);
    expect(result.outstandingBalance).toBe(0);
    const paymentTx = result.transactions.find((t) => t.type === 'payment');
    expect(paymentTx!.credit).toBe(100000);
  });

  it('Uses amountApplied first, then amountRetained, then amount', () => {
    expect(paymentCredit({ amountRetained: 80000, amount: 90000 })).toBe(80000);
    expect(paymentCredit({ amount: 50000 })).toBe(50000);
    expect(paymentCredit({ amountApplied: 60000, amount: 90000 })).toBe(60000);
  });
});

// ── Fixture 10: Wallet Top-up ──────────────────────────────────────────────

describe('Fixture 10: Wallet top-up', () => {
  it('Does NOT reduce AR', () => {
    const invs = [inv({ id: 'INV-001', totalAmount: 100000, total_amount: 100000 })];
    const pays = [pay({
      id: 'PAY-WALLET',
      amountApplied: 0,
      amount_applied: 0,
      amount: 50000,
      walletDeposit: 50000,
      paymentPurpose: 'WALLET_TOPUP',
    })];
    const result = ledger(invs, pays);
    expect(result.outstandingBalance).toBe(100000);
    expect(result.walletTopups.length).toBe(1);
    expect(result.transactions.length).toBe(1);
  });

  it('Detects wallet top-up by purpose', () => {
    expect(isWalletTopup({ paymentPurpose: 'WALLET_TOPUP', amount: 100 })).toBe(true);
    expect(isWalletTopup({ payment_purpose: 'wallet_topup', amount: 100 })).toBe(true);
  });

  it('Detects wallet top-up by deposit with zero applied', () => {
    expect(isWalletTopup({ walletDeposit: 100, amountApplied: 0, amount: 100 })).toBe(true);
  });

  it('Detects wallet top-up by excessHandling = Wallet', () => {
    expect(isWalletTopup({ excessHandling: 'Wallet', amount: 100 })).toBe(true);
  });

  it('Partial apply + partial wallet stays IN the ledger', () => {
    const p = { amountApplied: 30000, walletDeposit: 20000, amount: 50000 };
    expect(isWalletTopup(p)).toBe(false);
    expect(paymentCredit(p)).toBe(30000);
  });
});

// ── Fixture 11: Credit Note ────────────────────────────────────────────────

describe('Fixture 11: Credit note', () => {
  it('Reduces outstanding receivable', () => {
    const invs = [
      inv({ id: 'INV-001', totalAmount: 100000, total_amount: 100000, createdAt: '2026-08-01T10:00:00Z', created_at: '2026-08-01T10:00:00Z' }),
      inv({ id: 'CN-001', totalAmount: 25000, total_amount: 25000, status: 'credit_note', createdAt: '2026-08-03T10:00:00Z', created_at: '2026-08-03T10:00:00Z' }),
    ];
    const result = ledger(invs, []);
    expect(result.outstandingBalance).toBe(75000);
    expect(result.closingBalance).toBe(75000);
    const cnTx = result.transactions.find((t) => t.type === 'credit_note');
    expect(cnTx).toBeDefined();
    expect(cnTx!.debit).toBe(0);
    expect(cnTx!.credit).toBe(25000);
  });
});

// ── Fixture 12: Same-day Transactions ──────────────────────────────────────

describe('Fixture 12: Same-day transactions', () => {
  it('Deterministic ordering by created_at then id', () => {
    const baseDate = '2026-08-22T10:00:00Z';
    const invs = [
      inv({ id: 'INV-AAA', totalAmount: 100000, total_amount: 100000, createdAt: baseDate, created_at: baseDate }),
      inv({ id: 'INV-ZZZ', totalAmount: 50000, total_amount: 50000, createdAt: baseDate, created_at: baseDate }),
    ];
    const pays = [
      pay({ id: 'PAY-AAA', amountApplied: 30000, amount_applied: 30000, amount: 30000, createdAt: baseDate, created_at: baseDate }),
      pay({ id: 'PAY-ZZZ', amountApplied: 10000, amount_applied: 10000, amount: 10000, createdAt: baseDate, created_at: baseDate }),
    ];
    const result = ledger(invs, pays);
    expect(result.transactions[0].id).toBe('INV-AAA');
    expect(result.transactions[1].id).toBe('INV-ZZZ');
    expect(result.transactions[2].id).toBe('PAY-AAA');
    expect(result.transactions[3].id).toBe('PAY-ZZZ');
    expect(result.transactions[0].balance).toBe(100000);
    expect(result.transactions[1].balance).toBe(150000);
    expect(result.transactions[2].balance).toBe(120000);
    expect(result.transactions[3].balance).toBe(110000);
    expect(result.outstandingBalance).toBe(110000);
  });
});

// ── Fixture 13: Mixed Date Formats ─────────────────────────────────────────

describe('Fixture 13: Mixed date formats', () => {
  it('Parses date-only and ISO datetime identically', () => {
    const invs = [
      inv({ id: 'INV-DATE1', totalAmount: 100000, total_amount: 100000, createdAt: '2026-08-22', created_at: '2026-08-22' }),
      inv({ id: 'INV-DATE2', totalAmount: 50000, total_amount: 50000, createdAt: '2026-08-22T04:19:06Z', created_at: '2026-08-22T04:19:06Z' }),
    ];
    const result = ledger(invs, []);
    expect(result.outstandingBalance).toBe(150000);
    expect(result.transactions[0].id).toBe('INV-DATE1');
    expect(result.transactions[1].id).toBe('INV-DATE2');
  });
});

// ── Status Case-Insensitivity ──────────────────────────────────────────────

describe('Status handling: case-insensitive', () => {
  it('Treats Draft/draft/DRAFT identically', () => {
    expect(isInvoiceIncluded({ status: 'Draft' })).toBe(false);
    expect(isInvoiceIncluded({ status: 'draft' })).toBe(false);
    expect(isInvoiceIncluded({ status: 'DRAFT' })).toBe(false);
    expect(isInvoiceIncluded({ status: 'posted' })).toBe(true);
    expect(isInvoiceIncluded({ status: 'Paid' })).toBe(true);
    expect(isInvoiceIncluded({ status: 'PAID' })).toBe(true);
  });

  it('Cancelled/cancelled/CANCELLED all excluded', () => {
    expect(isPaymentIncluded({ status: 'Cancelled' })).toBe(false);
    expect(isPaymentIncluded({ status: 'cancelled' })).toBe(false);
    expect(isPaymentIncluded({ status: 'CANCELLED' })).toBe(false);
    expect(isPaymentIncluded({ status: 'completed' })).toBe(true);
    expect(isPaymentIncluded({ status: 'Completed' })).toBe(true);
  });

  it('Missing status counts as posted (legacy rows)', () => {
    expect(isInvoiceIncluded({})).toBe(true);
    expect(isPaymentIncluded({})).toBe(true);
  });
});

// ── Payment Amount Selection ───────────────────────────────────────────────

describe('Payment amount selection', () => {
  it('Prefers amountApplied over all others', () => {
    expect(paymentCredit({ amountApplied: 100, amountRetained: 200, amount: 300 })).toBe(100);
  });

  it('Falls back to amountRetained', () => {
    expect(paymentCredit({ amountRetained: 200, amount: 300 })).toBe(200);
  });

  it('Falls back to allocation sum if available', () => {
    expect(paymentCredit({ allocations: [{ amount: 150 }, { amount: 50 }], amount: 300 })).toBe(200);
  });

  it('Falls back to amount', () => {
    expect(paymentCredit({ amount: 300 })).toBe(300);
  });

  it('Returns 0 when nothing available', () => {
    expect(paymentCredit({})).toBe(0);
  });

  it('Explicit 0 in amountApplied is valid (wallet-only rows)', () => {
    expect(paymentCredit({ amountApplied: 0, amount: 500 })).toBe(0);
  });
});

// ── Opening Balance ────────────────────────────────────────────────────────

describe('Opening balance', () => {
  it('Included in running balance', () => {
    const invs = [inv({ id: 'INV-001', totalAmount: 50000, total_amount: 50000 })];
    const result = ledger(invs, [], { openingBalance: 10000 });
    expect(result.transactions[0].balance).toBe(60000);
    expect(result.closingBalance).toBe(60000);
    expect(result.outstandingBalance).toBe(60000);
  });
});

// ── Complex Scenario ───────────────────────────────────────────────────────

describe('Complex scenario: invoice + partial payment + credit note', () => {
  it('Produces correct running balances', () => {
    const invs = [
      inv({ id: 'INV-001', totalAmount: 200000, total_amount: 200000, createdAt: '2026-08-01T10:00:00Z', created_at: '2026-08-01T10:00:00Z' }),
      inv({ id: 'CN-001', totalAmount: 20000, total_amount: 20000, status: 'credit_note', createdAt: '2026-08-03T10:00:00Z', created_at: '2026-08-03T10:00:00Z' }),
    ];
    const pays = [
      pay({ id: 'PAY-001', amountApplied: 80000, amount_applied: 80000, amount: 80000, createdAt: '2026-08-02T10:00:00Z', created_at: '2026-08-02T10:00:00Z' }),
    ];
    const result = ledger(invs, pays);
    expect(result.transactions.length).toBe(3);
    expect(result.transactions[0].id).toBe('INV-001');
    expect(result.transactions[0].balance).toBe(200000);
    expect(result.transactions[1].id).toBe('PAY-001');
    expect(result.transactions[1].balance).toBe(120000);
    expect(result.transactions[2].id).toBe('CN-001');
    expect(result.transactions[2].balance).toBe(100000);
    expect(result.outstandingBalance).toBe(100000);
  });
});

// ── Partial payment with wallet ────────────────────────────────────────────

describe('Partial payment with wallet deposit', () => {
  it('Credits only applied portion, wallet stays out of AR', () => {
    const invs = [inv({ id: 'INV-001', totalAmount: 100000, total_amount: 100000 })];
    const pays = [pay({
      id: 'PAY-MIXED',
      amountApplied: 60000,
      amount_applied: 60000,
      walletDeposit: 40000,
      amount: 100000,
    })];
    const result = ledger(invs, pays);
    expect(result.outstandingBalance).toBe(40000);
    expect(result.walletTopups.length).toBe(0);
    const payTx = result.transactions.find((t) => t.type === 'payment');
    expect(payTx!.credit).toBe(60000);
  });
});
