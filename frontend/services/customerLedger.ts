/**
 * customerLedger.ts — THE single authoritative customer ledger definition
 * for the ERP frontend (offline-first mirror of backend/services/customerLedger.cjs).
 *
 * Every customer-balance consumer in the ERP MUST derive numbers from this
 * module instead of maintaining private formulas. It reads the already-synced
 * IndexedDB stores (`invoices`, `customerPayments`) so all financial views
 * keep working fully offline.
 *
 * Validated accounting rules (must stay byte-for-byte equivalent to backend):
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

import { dbService } from './db';

// ── Primitives ──────────────────────────────────────────────────────────────

export function round2(value: number): number {
  return Math.round((Number(value) || 0) * 100) / 100;
}

function toNum(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function normStatus(v: unknown): string {
  return String(v ?? '').trim().toLowerCase();
}

/** First non-nullish finite number (explicit 0 is VALID — only null/undefined skip). */
function firstNum(...candidates: unknown[]): number | null {
  for (const c of candidates) {
    if (c !== null && c !== undefined) {
      const n = Number(c);
      if (Number.isFinite(n)) return n;
    }
  }
  return null;
}

function parseTime(v: unknown): number {
  if (!v) return NaN;
  const t = new Date(v as string | number | Date).getTime();
  return Number.isFinite(t) ? t : NaN;
}

type AnyRecord = Record<string, any>;

function firstNonEmpty(...candidates: unknown[]): any {
  for (const c of candidates) {
    if (c !== null && c !== undefined && String(c).trim() !== '') return c;
  }
  return null;
}

/**
 * Deterministic ordering key. Primary: accounting date (falls back to
 * created_at). Secondary: created_at. Final tie-break: id string.
 * Missing/invalid dates sort to epoch — stable and identical on both sides.
 */
function sortKey(entry: AnyRecord): [number, number, string] {
  const dateT = parseTime(entry.date);
  const createdT = parseTime(entry.createdAt ?? entry.created_at);
  const primary = Number.isFinite(dateT) ? dateT : (Number.isFinite(createdT) ? createdT : 0);
  return [primary, Number.isFinite(createdT) ? createdT : 0, String(entry.id || '')];
}

function compareEntries(a: AnyRecord, b: AnyRecord): number {
  const ka = sortKey(a);
  const kb = sortKey(b);
  if (ka[0] !== kb[0]) return ka[0] - kb[0];
  if (ka[1] !== kb[1]) return ka[1] - kb[1];
  return ka[2] < kb[2] ? -1 : ka[2] > kb[2] ? 1 : 0;
}

// ── Rules ───────────────────────────────────────────────────────────────────

const CLOSED_INVOICE_STATUSES = new Set(['draft', 'cancelled', 'voided']);
const CLOSED_PAYMENT_STATUSES = new Set(['cancelled', 'voided']);

export function isInvoiceIncluded(inv: AnyRecord): boolean {
  // Missing status counts as posted (legacy rows).
  return !CLOSED_INVOICE_STATUSES.has(normStatus(inv.status));
}

export function isPaymentIncluded(pay: AnyRecord): boolean {
  return !CLOSED_PAYMENT_STATUSES.has(normStatus(pay.status));
}

export function isCreditNoteInvoice(inv: AnyRecord): boolean {
  return normStatus(inv.status) === 'credit_note';
}

export function invoiceTotal(inv: AnyRecord): number {
  return toNum(firstNum(inv.totalAmount, inv.total_amount, inv.total));
}

/**
 * Sum of allocation lines in ANY historical shape:
 *   ERP:         [{ invoiceId, amount }]
 *   portal shim: [{ invoice_id, allocated }]
 */
export function allocationSum(pay: AnyRecord): number {
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
 *   ?? amount                    (bare rows)
 * Tendered cash is used ONLY when nothing better exists — change-given and
 * wallet deposits must never inflate the receivable credit.
 */
export function paymentCredit(pay: AnyRecord): number {
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
 * Partial apply + partial wallet stays IN the ledger — paymentCredit then
 * correctly credits only the applied portion.
 */
export function isWalletTopup(pay: AnyRecord): boolean {
  const purpose = String(firstNonEmpty(pay.paymentPurpose, pay.payment_purpose) || '').toUpperCase();
  if (purpose === 'WALLET_TOPUP') return true;
  const applied = firstNum(pay.amountApplied, pay.amount_applied);
  const deposit = firstNum(pay.walletDeposit, pay.wallet_deposit);
  const handling = String(firstNonEmpty(pay.excessHandling, pay.excess_handling) || '');
  const appliedPositive = applied !== null && applied > 0;
  if (!appliedPositive) {
    if (deposit !== null && deposit > 0) return true;
    if (handling === 'Wallet') return true;
  }
  return false;
}

// ── Public shapes ───────────────────────────────────────────────────────────

export interface LedgerTransaction {
  id: string;
  type: 'invoice' | 'payment' | 'credit_note';
  date: string | null;
  createdAt: string | null;
  reference: string;
  description: string;
  status: string;
  debit: number;
  credit: number;
  balance: number;
}

export interface LedgerExclusion {
  id: string;
  kind: 'invoice' | 'payment';
  reason: string;
}

export interface LedgerWalletTopup {
  id: string;
  date: string | null;
  amount: number;
}

export interface CustomerLedgerResult {
  customerId: string;
  openingBalance: number;
  transactions: LedgerTransaction[];
  closingBalance: number;
  outstandingBalance: number;
  excluded: LedgerExclusion[];
  walletTopups: LedgerWalletTopup[];
}

// ── Pure core (shared by parity fixtures on both sides) ─────────────────────

/**
 * Build the authoritative ledger from raw records. Pure — no I/O — so parity
 * tests can feed byte-identical fixtures to this port and to the backend.
 */
export function buildLedgerFromRecords({
  customerId,
  invoices = [],
  payments = [],
  openingBalance = 0,
}: {
  customerId: string;
  invoices?: AnyRecord[];
  payments?: AnyRecord[];
  openingBalance?: number;
}): CustomerLedgerResult {
  const txs: AnyRecord[] = [];
  const excluded: LedgerExclusion[] = [];
  const walletTopups: LedgerWalletTopup[] = [];

  for (const inv of invoices) {
    if (!isInvoiceIncluded(inv)) {
      excluded.push({ id: String(inv.id), kind: 'invoice', reason: normStatus(inv.status) || 'closed' });
      continue;
    }
    const total = invoiceTotal(inv);
    const creditNote = isCreditNoteInvoice(inv);
    const number = firstNonEmpty(inv.invoiceNumber, inv.invoice_number) || inv.id;
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
      excluded.push({ id: String(pay.id), kind: 'payment', reason: normStatus(pay.status) });
      continue;
    }
    if (isWalletTopup(pay)) {
      walletTopups.push({
        id: String(pay.id),
        date: firstNonEmpty(pay.date, pay.createdAt, pay.created_at),
        amount: toNum(firstNum(pay.amount, pay.total, pay.total_amount)),
      });
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
    return { ...(t as unknown as LedgerTransaction), balance: running };
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

// ── IndexedDB-backed API (offline-first) ────────────────────────────────────

/**
 * Authoritative ledger for one customer, computed from the local stores.
 * Records may be injected (tests); default reads IndexedDB via dbService.
 */
export async function buildCustomerLedger(
  customerId: string,
  opts: { openingBalance?: number; invoices?: AnyRecord[]; payments?: AnyRecord[] } = {},
): Promise<CustomerLedgerResult> {
  const invoices = opts.invoices ?? (await dbService.getAll<AnyRecord>('invoices'));
  const payments = opts.payments ?? (await dbService.getAll<AnyRecord>('customerPayments'));
  const scopedInvoices = invoices.filter((i) => String(i.customerId ?? '') === String(customerId));
  const scopedPayments = payments.filter((p) => String(p.customerId ?? '') === String(customerId));
  return buildLedgerFromRecords({
    customerId,
    invoices: scopedInvoices,
    payments: scopedPayments,
    openingBalance: opts.openingBalance ?? 0,
  });
}

/** The ONE number every ERP view should display as "customer owes". */
export async function getCustomerOutstanding(customerId: string): Promise<number> {
  const ledger = await buildCustomerLedger(customerId);
  return ledger.outstandingBalance;
}
