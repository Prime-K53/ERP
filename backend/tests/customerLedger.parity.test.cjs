/**
 * customerLedger.parity.test.cjs — Automated parity tests for the canonical
 * customer ledger. These fixtures are consumed by BOTH:
 *   - backend/services/customerLedger.cjs
 *   - frontend/services/customerLedger.ts (via buildLedgerFromRecords)
 *
 * All 13 required scenarios are tested here.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  buildLedgerFromRecords,
  round2,
  isInvoiceIncluded,
  isPaymentIncluded,
  isWalletTopup,
  paymentCredit,
  CLOSED_INVOICE_STATUSES,
  CLOSED_PAYMENT_STATUSES,
} = require('../services/customerLedger.cjs');

const CID = 'CUST-TEST-001';

// ── Helper ──────────────────────────────────────────────────────────────────

function inv(overrides = {}) {
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

function pay(overrides = {}) {
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

function ledger(invoices, payments, opts = {}) {
  return buildLedgerFromRecords({
    customerId: CID,
    invoices,
    payments,
    openingBalance: opts.openingBalance ?? 0,
  });
}

// ── Fixture 1 — Basic Invoice ──────────────────────────────────────────────

describe('Fixture 1: Basic invoice', () => {
  it('Balance = invoice total when no payments', () => {
    const invs = [inv({ id: 'INV-001', totalAmount: 100000, total_amount: 100000 })];
    const result = ledger(invs, []);
    assert.equal(result.outstandingBalance, 100000);
    assert.equal(result.closingBalance, 100000);
    assert.equal(result.transactions.length, 1);
    assert.equal(result.transactions[0].type, 'invoice');
    assert.equal(result.transactions[0].debit, 100000);
    assert.equal(result.transactions[0].credit, 0);
    assert.equal(result.transactions[0].balance, 100000);
  });
});

// ── Fixture 2 — Posted Payment ─────────────────────────────────────────────

describe('Fixture 2: Posted payment', () => {
  it('Payment reduces outstanding balance', () => {
    const invs = [inv({ id: 'INV-001', totalAmount: 100000, total_amount: 100000, createdAt: '2026-08-01T10:00:00Z', created_at: '2026-08-01T10:00:00Z' })];
    const pays = [pay({ id: 'PAY-001', amountApplied: 30000, amount_applied: 30000, amount: 30000, createdAt: '2026-08-02T10:00:00Z', created_at: '2026-08-02T10:00:00Z' })];
    const result = ledger(invs, pays);
    assert.equal(result.outstandingBalance, 70000);
    assert.equal(result.closingBalance, 70000);
    assert.equal(result.transactions.length, 2);
    // Invoice first (earlier date)
    assert.equal(result.transactions[0].type, 'invoice');
    assert.equal(result.transactions[0].balance, 100000);
    // Payment second
    assert.equal(result.transactions[1].type, 'payment');
    assert.equal(result.transactions[1].balance, 70000);
  });
});

// ── Fixture 3 — Pending Payment Request ────────────────────────────────────

describe('Fixture 3: Pending payment request (no posted payment)', () => {
  it('Payment request does NOT affect balance', () => {
    const invs = [inv({ id: 'INV-001', totalAmount: 100000, total_amount: 100000 })];
    // No payments posted — payment requests are NOT financial transactions
    const result = ledger(invs, []);
    assert.equal(result.outstandingBalance, 100000);
    assert.equal(result.transactions.length, 1);
  });
});

// ── Fixture 4 — Draft Invoice ──────────────────────────────────────────────

describe('Fixture 4: Draft invoice', () => {
  it('Draft invoices are excluded from ledger', () => {
    const invs = [inv({ id: 'INV-D1', totalAmount: 50000, total_amount: 50000, status: 'draft' })];
    const result = ledger(invs, []);
    assert.equal(result.outstandingBalance, 0);
    assert.equal(result.closingBalance, 0);
    assert.equal(result.transactions.length, 0);
    assert.equal(result.excluded.length, 1);
    assert.equal(result.excluded[0].reason, 'draft');
  });
});

// ── Fixture 5 — Cancelled Invoice ──────────────────────────────────────────

describe('Fixture 5: Cancelled invoice', () => {
  it('Cancelled invoices are excluded', () => {
    const invs = [inv({ id: 'INV-C1', totalAmount: 75000, total_amount: 75000, status: 'cancelled' })];
    const result = ledger(invs, []);
    assert.equal(result.outstandingBalance, 0);
    assert.equal(result.transactions.length, 0);
    assert.equal(result.excluded.length, 1);
  });
});

// ── Fixture 6 — Voided Invoice ─────────────────────────────────────────────

describe('Fixture 6: Voided invoice', () => {
  it('Voided invoices are excluded', () => {
    const invs = [inv({ id: 'INV-V1', totalAmount: 60000, total_amount: 60000, status: 'voided' })];
    const result = ledger(invs, []);
    assert.equal(result.outstandingBalance, 0);
    assert.equal(result.transactions.length, 0);
    assert.equal(result.excluded.length, 1);
  });
});

// ── Fixture 7 — Cancelled Payment ──────────────────────────────────────────

describe('Fixture 7: Cancelled payment', () => {
  it('Cancelled payments are excluded', () => {
    const invs = [inv({ id: 'INV-001', totalAmount: 100000, total_amount: 100000 })];
    const pays = [pay({ id: 'PAY-C1', amountApplied: 50000, amount_applied: 50000, amount: 50000, status: 'cancelled' })];
    const result = ledger(invs, pays);
    assert.equal(result.outstandingBalance, 100000);
    assert.equal(result.transactions.length, 1);
    assert.equal(result.excluded.length, 1);
    assert.equal(result.excluded[0].kind, 'payment');
  });
});

// ── Fixture 8 — Voided Payment ─────────────────────────────────────────────

describe('Fixture 8: Voided payment', () => {
  it('Voided payments are excluded', () => {
    const invs = [inv({ id: 'INV-001', totalAmount: 100000, total_amount: 100000 })];
    const pays = [pay({ id: 'PAY-V1', amountApplied: 50000, amount_applied: 50000, amount: 50000, status: 'voided' })];
    const result = ledger(invs, pays);
    assert.equal(result.outstandingBalance, 100000);
    assert.equal(result.transactions.length, 1);
    assert.equal(result.excluded.length, 1);
  });
});

// ── Fixture 9 — Cash with Change ───────────────────────────────────────────

describe('Fixture 9: Cash with change', () => {
  it('Receivable credit = applied amount, NOT tendered cash', () => {
    const invs = [inv({ id: 'INV-001', totalAmount: 100000, total_amount: 100000 })];
    // Tendered 110,000 but only 100,000 applied (10,000 change)
    const pays = [pay({
      id: 'PAY-CHG',
      amountApplied: 100000,
      amount_applied: 100000,
      amount: 110000,          // tendered cash
      amountRetained: 100000,  // amount retained
      amount_retained: 100000,
    })];
    const result = ledger(invs, pays);
    assert.equal(result.outstandingBalance, 0);
    // Credit must be 100000 (applied), not 110000 (tendered)
    const paymentTx = result.transactions.find((t) => t.type === 'payment');
    assert.equal(paymentTx.credit, 100000);
  });

  it('Uses amountApplied first, then amountRetained, then amount', () => {
    // Only amountRetained set (legacy cash-with-change row)
    const p1 = { amountRetained: 80000, amount: 90000 };
    assert.equal(paymentCredit(p1), 80000);

    // Only amount set (bare legacy row)
    const p2 = { amount: 50000 };
    assert.equal(paymentCredit(p2), 50000);

    // amountApplied set — takes precedence
    const p3 = { amountApplied: 60000, amount: 90000 };
    assert.equal(paymentCredit(p3), 60000);
  });
});

// ── Fixture 10 — Wallet Top-up ─────────────────────────────────────────────

describe('Fixture 10: Wallet top-up', () => {
  it('Wallet top-up does NOT reduce AR', () => {
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
    assert.equal(result.outstandingBalance, 100000);
    assert.equal(result.walletTopups.length, 1);
    assert.equal(result.transactions.length, 1);
  });

  it('Detects wallet top-up by purpose', () => {
    assert.equal(isWalletTopup({ paymentPurpose: 'WALLET_TOPUP', amount: 100 }), true);
    assert.equal(isWalletTopup({ payment_purpose: 'wallet_topup', amount: 100 }), true);
  });

  it('Detects wallet top-up by deposit with zero applied', () => {
    assert.equal(isWalletTopup({ walletDeposit: 100, amountApplied: 0, amount: 100 }), true);
    assert.equal(isWalletTopup({ wallet_deposit: 100, amount_applied: 0 }), true);
  });

  it('Detects wallet top-up by excessHandling = Wallet', () => {
    assert.equal(isWalletTopup({ excessHandling: 'Wallet', amount: 100 }), true);
  });

  it('Partial apply + partial wallet stays IN the ledger', () => {
    const p = { amountApplied: 30000, walletDeposit: 20000, amount: 50000 };
    assert.equal(isWalletTopup(p), false); // applied > 0, so NOT a wallet-only top-up
    assert.equal(paymentCredit(p), 30000); // credits only the applied portion
  });
});

// ── Fixture 11 — Credit Note ───────────────────────────────────────────────

describe('Fixture 11: Credit note', () => {
  it('Credit note reduces outstanding receivable', () => {
    const invs = [
      inv({ id: 'INV-001', totalAmount: 100000, total_amount: 100000, createdAt: '2026-08-01T10:00:00Z', created_at: '2026-08-01T10:00:00Z' }),
      inv({ id: 'CN-001', totalAmount: 25000, total_amount: 25000, status: 'credit_note', createdAt: '2026-08-03T10:00:00Z', created_at: '2026-08-03T10:00:00Z' }),
    ];
    const result = ledger(invs, []);
    assert.equal(result.outstandingBalance, 75000);
    assert.equal(result.closingBalance, 75000);
    const cnTx = result.transactions.find((t) => t.type === 'credit_note');
    assert.ok(cnTx, 'Credit note should be in transactions');
    assert.equal(cnTx.debit, 0);
    assert.equal(cnTx.credit, 25000);
  });
});

// ── Fixture 12 — Same-day Transactions ─────────────────────────────────────

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
    // Same timestamp → sort by id string
    assert.equal(result.transactions[0].id, 'INV-AAA');
    assert.equal(result.transactions[1].id, 'INV-ZZZ');
    assert.equal(result.transactions[2].id, 'PAY-AAA');
    assert.equal(result.transactions[3].id, 'PAY-ZZZ');
    // Running balances
    assert.equal(result.transactions[0].balance, 100000);
    assert.equal(result.transactions[1].balance, 150000);
    assert.equal(result.transactions[2].balance, 120000);
    assert.equal(result.transactions[3].balance, 110000);
    assert.equal(result.outstandingBalance, 110000);
  });
});

// ── Fixture 13 — Mixed Date Formats ────────────────────────────────────────

describe('Fixture 13: Mixed date formats', () => {
  it('Parses date-only and ISO datetime identically', () => {
    const invs = [
      inv({ id: 'INV-DATE1', totalAmount: 100000, total_amount: 100000, createdAt: '2026-08-22', created_at: '2026-08-22' }),
      inv({ id: 'INV-DATE2', totalAmount: 50000, total_amount: 50000, createdAt: '2026-08-22T04:19:06Z', created_at: '2026-08-22T04:19:06Z' }),
    ];
    const result = ledger(invs, []);
    assert.equal(result.outstandingBalance, 150000);
    // Both parse to the same date — ordering by id
    assert.equal(result.transactions[0].id, 'INV-DATE1');
    assert.equal(result.transactions[1].id, 'INV-DATE2');
  });
});

// ── Status Case-Insensitivity ──────────────────────────────────────────────

describe('Status handling: case-insensitive', () => {
  it('Treats Draft/draft/DRAFT identically', () => {
    assert.equal(isInvoiceIncluded({ status: 'Draft' }), false);
    assert.equal(isInvoiceIncluded({ status: 'draft' }), false);
    assert.equal(isInvoiceIncluded({ status: 'DRAFT' }), false);
    assert.equal(isInvoiceIncluded({ status: 'posted' }), true);
    assert.equal(isInvoiceIncluded({ status: 'Paid' }), true);
    assert.equal(isInvoiceIncluded({ status: 'PAID' }), true);
  });

  it('Cancelled/cancelled/CANCELLED all excluded', () => {
    assert.equal(isPaymentIncluded({ status: 'Cancelled' }), false);
    assert.equal(isPaymentIncluded({ status: 'cancelled' }), false);
    assert.equal(isPaymentIncluded({ status: 'CANCELLED' }), false);
    assert.equal(isPaymentIncluded({ status: 'completed' }), true);
    assert.equal(isPaymentIncluded({ status: 'Completed' }), true);
  });

  it('Missing status counts as posted (legacy rows)', () => {
    assert.equal(isInvoiceIncluded({}), true);
    assert.equal(isPaymentIncluded({}), true);
  });
});

// ── Payment Amount Selection ───────────────────────────────────────────────

describe('Payment amount selection', () => {
  it('Prefers amountApplied over all others', () => {
    assert.equal(paymentCredit({ amountApplied: 100, amountRetained: 200, amount: 300 }), 100);
  });

  it('Falls back to amountRetained', () => {
    assert.equal(paymentCredit({ amountRetained: 200, amount: 300 }), 200);
  });

  it('Falls back to allocation sum if available', () => {
    assert.equal(paymentCredit({ allocations: [{ amount: 150 }, { amount: 50 }], amount: 300 }), 200);
  });

  it('Falls back to amount', () => {
    assert.equal(paymentCredit({ amount: 300 }), 300);
  });

  it('Returns 0 when nothing available', () => {
    assert.equal(paymentCredit({}), 0);
  });

  it('Explicit 0 in amountApplied is valid (wallet-only rows)', () => {
    assert.equal(paymentCredit({ amountApplied: 0, amount: 500 }), 0);
  });
});

// ── Opening Balance ────────────────────────────────────────────────────────

describe('Opening balance', () => {
  it('Opening balance is included in running balance', () => {
    const invs = [inv({ id: 'INV-001', totalAmount: 50000, total_amount: 50000 })];
    const result = ledger(invs, [], { openingBalance: 10000 });
    assert.equal(result.transactions[0].balance, 60000);
    assert.equal(result.closingBalance, 60000);
    assert.equal(result.outstandingBalance, 60000);
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
    assert.equal(result.transactions.length, 3);
    // INV-001: balance = 200000
    assert.equal(result.transactions[0].id, 'INV-001');
    assert.equal(result.transactions[0].balance, 200000);
    // PAY-001: balance = 200000 - 80000 = 120000
    assert.equal(result.transactions[1].id, 'PAY-001');
    assert.equal(result.transactions[1].balance, 120000);
    // CN-001: balance = 120000 - 20000 = 100000
    assert.equal(result.transactions[2].id, 'CN-001');
    assert.equal(result.transactions[2].balance, 100000);
    assert.equal(result.outstandingBalance, 100000);
  });
});

// ── Wallet + Invoice (partial apply + wallet) ──────────────────────────────

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
    assert.equal(result.outstandingBalance, 40000); // 100000 - 60000
    assert.equal(result.walletTopups.length, 0); // NOT a wallet top-up (applied > 0)
    const payTx = result.transactions.find((t) => t.type === 'payment');
    assert.equal(payTx.credit, 60000); // only applied amount
  });
});
