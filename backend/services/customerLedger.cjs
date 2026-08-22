/**
 * customerLedger.cjs — THE single authoritative customer ledger definition.
 *
 * Every customer-balance consumer in the backend MUST derive numbers from
 * this module. The ERP frontend mirrors these exact rules in
 * frontend/services/customerLedger.ts (offline-first, IndexedDB-backed).
 *
 * Validated accounting rules (see validation report):
 *   Invoices      status NOT in {draft, cancelled, voided} (case-insensitive)
 *                 → debit  (+ increases receivable)
 *   Credit notes  valid credit_note invoices → credit (−)
 *   Payments      status NOT in {cancelled, voided} (case-insensitive)
 *                 → credit (−) using amountApplied ?? amountRetained ?? amount
 *                 Wallet top-ups are liability movements and are EXCLUDED.
 *   Payment requests are workflow data only — never part of this ledger.
 *
 * Ordering is deterministic:
 *   timestamp(date ?? createdAt) → timestamp(createdAt) → id (string)
 * All dates are parsed as real timestamps — never string localeCompare.
 *
 * Running balance = opening + debits − credits. Positive = customer owes.
 */

const repo = require('./supabaseRepository.cjs');
const { customerFilter } = require('./portalScope.cjs');

// ── Primitives ──────────────────────────────────────────────────────────────

function round2(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

function toNum(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function normStatus(v) {
  return String(v ?? '').trim().toLowerCase();
}

/** First non-nullish finite number (explicit 0 is VALID — only null/undefined skip). */
function firstNum(...candidates) {
  for (const c of candidates) {
    if (c !== null && c !== undefined) {
      const n = Number(c);
      if (Number.isFinite(n)) return n;
    }
  }
  return null;
}

function parseTime(v) {
  if (!v) return NaN;
  const t = new Date(v).getTime();
  return Number.isFinite(t) ? t : NaN;
}

/**
 * Deterministic ordering key. Primary: accounting date (falls back to
 * created_at). Secondary: created_at. Final tie-break: id string.
 * Missing/invalid dates sort to epoch — stable and identical on both sides.
 */
function sortKey(entry) {
  const dateT = parseTime(entry.date);
  const createdT = parseTime(entry.createdAt ?? entry.created_at);
  const primary = Number.isFinite(dateT) ? dateT : (Number.isFinite(createdT) ? createdT : 0);
  return [primary, Number.isFinite(createdT) ? createdT : 0, String(entry.id || '')];
}

function compareEntries(a, b) {
  const ka = sortKey(a);
  const kb = sortKey(b);
  if (ka[0] !== kb[0]) return ka[0] - kb[0];
  if (ka[1] !== kb[1]) return ka[1] - kb[1];
  return ka[2] < kb[2] ? -1 : ka[2] > kb[2] ? 1 : 0;
}

// ── Field accessors (rows mix camelCase/snake_case across historical writers)

const CLOSED_INVOICE_STATUSES = new Set(['draft', 'cancelled', 'voided']);
const CLOSED_PAYMENT_STATUSES = new Set(['cancelled', 'voided']);

function invoiceTotal(inv) {
  return toNum(firstNum(inv.totalAmount, inv.total_amount, inv.total));
}

function invoiceNumber(inv) {
  return firstNonEmpty(inv.invoiceNumber, inv.invoice_number);
}

function firstNonEmpty(...candidates) {
  for (const c of candidates) {
    if (c !== null && c !== undefined && String(c).trim() !== '') return c;
  }
  return null;
}

function isCreditNoteInvoice(inv) {
  return normStatus(inv.status) === 'credit_note';
}

function isInvoiceIncluded(inv) {
  // Missing status counts as posted (legacy rows).
  return !CLOSED_INVOICE_STATUSES.has(normStatus(inv.status));
}

function isPaymentIncluded(pay) {
  return !CLOSED_PAYMENT_STATUSES.has(normStatus(pay.status));
}

/**
 * Sum of allocation lines in ANY historical shape:
 *   ERP:         [{ invoiceId, amount }]
 *   portal shim: [{ invoice_id, allocated }]
 */
function allocationSum(pay) {
  const allocations = Array.isArray(pay.allocations) ? pay.allocations : [];
  let sum = 0;
  for (const a of allocations) {
    if (!a || typeof a !== 'object') continue;
    sum += toNum(firstNum(a.amount, a.allocated, a.allocationAmount));
  }
  return round2(sum);
}

/**
 * Receivable-settlement credit for one payment:
 *   amountApplied (explicit 0 COUNTS — wallet-only rows stay at 0)
 *   ?? amountRetained            (cash-with-change legacy rows)
 *   ?? allocationSum             (rows carrying allocations but no snapshot)
 *   ?? amount                    (bare rows, e.g. legacy portal shim writes)
 * Tendered cash is used ONLY when nothing better exists — change-given and
 * wallet deposits must never inflate the receivable credit.
 */
function paymentCredit(pay) {
  const allocSum = allocationSum(pay);
  return round2(
    firstNum(
      pay.amountApplied,
      pay.amount_applied,
      pay.amountRetained,
      pay.amount_retained,
      allocSum > 0 ? allocSum : null,
      pay.amount,
    ) ?? 0,
  );
}

/**
 * Wallet top-ups move money into the wallet liability; they never settle AR.
 * Detected from the posting purpose recorded by transactionService snapshots,
 * or structurally (wallet deposit with nothing applied / excess→Wallet with
 * nothing applied). Partial apply + partial wallet stays IN the ledger —
 * paymentCredit then correctly credits only the applied portion.
 */
function isWalletTopup(pay) {
  const purpose = String(firstNonEmpty(pay.paymentPurpose, pay.payment_purpose) || '').toUpperCase();
  if (purpose === 'WALLET_TOPUP') return true;
  const applied = firstNum(pay.amountApplied, pay.amount_applied);
  const deposit = firstNum(pay.walletDeposit, pay.wallet_deposit);
  const handling = String(firstNonEmpty(pay.excessHandling, pay.excess_handling) || '');
  const appliedKnown = applied !== null;
  const appliedPositive = appliedKnown && applied > 0;
  if (!appliedPositive) {
    if (deposit !== null && deposit > 0) return true;
    if (handling === 'Wallet') return true;
  }
  return false;
}

// ── Pure core (shared by tests on both sides) ───────────────────────────────

/**
 * Build the authoritative ledger from raw records. Pure — no I/O — so the
 * ERP frontend port and the parity test fixtures consume exactly this shape.
 *
 * @param {object} input
 * @param {string} input.customerId
 * @param {Array}  input.invoices  customer-scoped invoice rows
 * @param {Array}  input.payments  customer-scoped customer_payment rows
 * @param {number} [input.openingBalance]
 */
function buildLedgerFromRecords({ customerId, invoices = [], payments = [], openingBalance = 0 }) {
  const txs = [];
  const excluded = [];
  const walletTopups = [];

  for (const inv of invoices) {
    if (!isInvoiceIncluded(inv)) {
      excluded.push({ id: inv.id, kind: 'invoice', reason: normStatus(inv.status) || 'closed' });
      continue;
    }
    const total = invoiceTotal(inv);
    const creditNote = isCreditNoteInvoice(inv);
    const number = invoiceNumber(inv) || inv.id;
    txs.push({
      id: String(inv.id),
      type: creditNote ? 'credit_note' : 'invoice',
      date: firstNonEmpty(inv.date, inv.createdAt, inv.created_at),
      createdAt: firstNonEmpty(inv.createdAt, inv.created_at),
      reference: String(number),
      description: `${creditNote ? 'Credit Note' : 'Invoice'} ${number}`,
      status: String(inv.status || ''),
      debit: creditNote ? 0 : total,
      credit: creditNote ? total : 0,
    });
  }

  for (const pay of payments) {
    if (!isPaymentIncluded(pay)) {
      excluded.push({ id: pay.id, kind: 'payment', reason: normStatus(pay.status) });
      continue;
    }
    if (isWalletTopup(pay)) {
      walletTopups.push({ id: String(pay.id), date: firstNonEmpty(pay.date, pay.createdAt, pay.created_at), amount: paymentAmountOf(pay) });
      continue;
    }
    const number = firstNonEmpty(pay.reference, pay.receiptNumber, pay.id);
    txs.push({
      id: String(pay.id),
      type: 'payment',
      date: firstNonEmpty(pay.date, pay.createdAt, pay.created_at),
      createdAt: firstNonEmpty(pay.createdAt, pay.created_at),
      reference: String(number),
      description: firstNonEmpty(pay.reference, pay.notes) || 'Payment received',
      status: String(pay.status || ''),
      debit: 0,
      credit: paymentCredit(pay),
    });
  }

  txs.sort(compareEntries);

  let running = round2(openingBalance);
  const transactions = txs.map((t) => {
    running = round2(running + t.debit - t.credit);
    return { ...t, balance: running };
  });

  const closingBalance = running;
  return {
    customerId,
    openingBalance: round2(openingBalance),
    transactions,
    closingBalance,
    outstandingBalance: Math.max(0, closingBalance),
    excluded,
    walletTopups,
  };
}

function paymentAmountOf(pay) {
  return toNum(firstNum(pay.amount, pay.total, pay.total_amount));
}

// ── Customer-scoped loaders ─────────────────────────────────────────────────

async function loadCustomerInvoices(customerId) {
  const rows = await repo.getAllStrict('invoices', customerFilter('invoices', customerId));
  return verifyScope(rows, customerId);
}

async function loadCustomerPayments(customerId) {
  const rows = await repo.getAllStrict('customer_payments', customerFilter('customer_payments', customerId));
  return verifyScope(rows, customerId);
}

/** Defense-in-depth JS ownership check (mirrors portalService.scopedRows). */
function verifyScope(rows, customerId) {
  const target = String(customerId || '');
  if (!target) return [];
  return (rows || []).filter(
    (r) => String(firstNonEmpty(r.customerId, r.customer_id) || '') === target,
  );
}

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Authoritative ledger for one customer.
 * Loaders may be injected (tests); default reads Supabase via the repo.
 */
async function buildLedger(customerId, { openingBalance = 0, invoices, payments } = {}) {
  const invs = Array.isArray(invoices) ? invoices : await loadCustomerInvoices(customerId);
  const pays = Array.isArray(payments) ? payments : await loadCustomerPayments(customerId);
  return buildLedgerFromRecords({ customerId, invoices: invs, payments: pays, openingBalance });
}

async function getOutstanding(customerId, opts = {}) {
  const ledger = await buildLedger(customerId, opts);
  return ledger.outstandingBalance;
}

module.exports = {
  // primitives
  round2,
  toNum,
  normStatus,
  firstNum,
  parseTime,
  compareEntries,
  sortKey,
  // rules
  CLOSED_INVOICE_STATUSES,
  CLOSED_PAYMENT_STATUSES,
  isInvoiceIncluded,
  isPaymentIncluded,
  isCreditNoteInvoice,
  isWalletTopup,
  invoiceTotal,
  paymentAmount: paymentAmountOf,
  paymentCredit,
  allocationSum,
  // core + api
  buildLedgerFromRecords,
  buildLedger,
  getOutstanding,
  loadCustomerInvoices,
  loadCustomerPayments,
};
