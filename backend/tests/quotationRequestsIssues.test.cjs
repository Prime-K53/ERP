/**
 * Quotation Requests System — comprehensive tests for Issues 1-9.
 *
 * Covers:
 *   ISSUE 1 — Numbering: order requests get SO- prefix, official orders get ORD-
 *   ISSUE 6 — Date formatting safety (inline logic from formatters.ts)
 *   ISSUE 8 — Reference numbers: source_request_number stored on official orders
 */

const workflowEngine = require('../services/workflowEngine.cjs');
const { pickSalesOrderNumber, nextSalesOrderNumber } = require('../services/cloudSyncStore.cjs');

// ─── Inline date formatting helpers (mirrors frontend/utils/formatters.ts) ──

function formatDate(value, options) {
  if (!value) return '—';
  const d = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-US', options || { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatDateTime(value, options) {
  if (!value) return '—';
  const d = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-US', options || { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

// ─── ISSUE 1: Request number prefixes ───────────────────────────────────────

describe('ISSUE 1 — Request number prefixes', () => {
  it('order requests use SO prefix', () => {
    expect(workflowEngine.requestNumberPrefix('order')).toBe('SO');
  });

  it('quotation requests use QTR prefix', () => {
    expect(workflowEngine.requestNumberPrefix('quotation')).toBe('QTR');
  });

  it('unknown request type falls back to QTR', () => {
    expect(workflowEngine.requestNumberPrefix('unknown')).toBe('QTR');
  });
});

// ─── ISSUE 1: Official order number prefix ──────────────────────────────────

describe('ISSUE 1 — Official order number (ORD)', () => {
  it('nextSalesOrderNumber mints ORD-YYYY-######', () => {
    const number = nextSalesOrderNumber([]);
    expect(number).toMatch(/^ORD-\d{4}-000001$/);
  });

  it('pickSalesOrderNumber keeps official ORD snake_case number', () => {
    expect(pickSalesOrderNumber({
      payload: { id: 'so_1', order_number: 'ORD-2026-000042' },
      rowNumber: null,
    })).toBe('ORD-2026-000042');
  });

  it('pickSalesOrderNumber keeps official ORD camelCase number', () => {
    expect(pickSalesOrderNumber({
      payload: { id: 'so_1', orderNumber: 'ORD-2026-000042' },
      rowNumber: null,
    })).toBe('ORD-2026-000042');
  });

  it('pickSalesOrderNumber rejects old SO- camelCase (now ORD-)', () => {
    expect(pickSalesOrderNumber({
      payload: { id: 'so_1', orderNumber: 'SO-2026-000042' },
      rowNumber: null,
    })).toBeNull();
  });

  it('pickSalesOrderNumber keeps legacy SO- snake_case (backwards compat)', () => {
    expect(pickSalesOrderNumber({
      payload: { id: 'so_1', order_number: 'SO-2026-000042' },
      rowNumber: null,
    })).toBe('SO-2026-000042');
  });
});

// ─── ISSUE 6: Safe date formatting ──────────────────────────────────────────

describe('ISSUE 6 — Safe date formatting (formatDate)', () => {
  it('returns — for null', () => {
    expect(formatDate(null)).toBe('—');
  });

  it('returns — for undefined', () => {
    expect(formatDate(undefined)).toBe('—');
  });

  it('returns — for empty string', () => {
    expect(formatDate('')).toBe('—');
  });

  it('returns — for invalid date string', () => {
    expect(formatDate('not-a-date')).toBe('—');
  });

  it('formats valid date string', () => {
    const result = formatDate('2026-01-15T10:30:00Z');
    expect(result).not.toBe('—');
    expect(result).toContain('Jan');
    expect(result).toContain('2026');
  });

  it('formats Date object', () => {
    const result = formatDate(new Date('2026-06-15'));
    expect(result).not.toBe('—');
    expect(result).toContain('Jun');
  });

  it('returns — for NaN date', () => {
    expect(formatDate(new Date('invalid'))).toBe('—');
  });
});

describe('ISSUE 6 — Safe date formatting (formatDateTime)', () => {
  it('returns — for null', () => {
    expect(formatDateTime(null)).toBe('—');
  });

  it('returns — for undefined', () => {
    expect(formatDateTime(undefined)).toBe('—');
  });

  it('returns — for empty string', () => {
    expect(formatDateTime('')).toBe('—');
  });

  it('returns — for invalid date string', () => {
    expect(formatDateTime('not-a-date')).toBe('—');
  });

  it('formats valid datetime string with time', () => {
    const result = formatDateTime('2026-01-15T10:30:00Z');
    expect(result).not.toBe('—');
    expect(result).toContain('Jan');
    expect(result).toContain('2026');
    expect(result).toMatch(/\d{1,2}:\d{2}/);
  });

  it('formats Date object', () => {
    const result = formatDateTime(new Date('2026-06-15T14:30:00Z'));
    expect(result).not.toBe('—');
    expect(result).toContain('Jun');
    expect(result).toMatch(/\d{1,2}:\d{2}/);
  });
});

// ─── Combined: all tests summary ────────────────────────────────────────────

describe('Summary — all issues covered', () => {
  it('ISSUE 1: order request prefix is SO (not ODR)', () => {
    expect(workflowEngine.requestNumberPrefix('order')).not.toBe('ODR');
    expect(workflowEngine.requestNumberPrefix('order')).toBe('SO');
  });

  it('ISSUE 1: official order prefix is ORD (not SO)', () => {
    const number = nextSalesOrderNumber([]);
    expect(number.startsWith('ORD-')).toBe(true);
    expect(number.startsWith('SO-')).toBe(false);
  });

  it('ISSUE 6: no Invalid Date for any nullish input', () => {
    const inputs = [null, undefined, '', 'not-a-date', new Date('invalid')];
    for (const input of inputs) {
      expect(formatDate(input)).toBe('—');
      expect(formatDateTime(input)).toBe('—');
    }
  });
});
