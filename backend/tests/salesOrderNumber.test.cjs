/**
 * Sales-order official-number minting — hermetic unit tests for the pure
 * decision helpers in cloudSyncStore.cjs (no network, no Supabase):
 *
 *   pickSalesOrderNumber({ payload, rowNumber })
 *     - keeps an already-official number in the payload (idempotent re-push)
 *     - validates camelCase against ORD- pattern; rejects old SO- prefix
 *     - falls back to the number already committed on the server row
 *   nextSalesOrderNumber(rows)
 *     - next ORD-YYYY-###### sequence across portal (order_number) and
 *       admin-synced (orderNumber) rows
 */

const {
  pickSalesOrderNumber,
  nextSalesOrderNumber,
} = require('../services/cloudSyncStore.cjs');

describe('pickSalesOrderNumber', () => {
  it('keeps an official snake_case ORD number in the payload', () => {
    expect(pickSalesOrderNumber({
      payload: { id: 'so_1', order_number: 'ORD-2026-000042' },
      rowNumber: null,
    })).toBe('ORD-2026-000042');
  });

  it('keeps legacy SO- snake_case number (backwards compat, no pattern check)', () => {
    expect(pickSalesOrderNumber({
      payload: { id: 'so_1', order_number: 'SO-2026-000042' },
      rowNumber: null,
    })).toBe('SO-2026-000042');
  });

  it('keeps an official camelCase ORD number in the payload', () => {
    expect(pickSalesOrderNumber({
      payload: { id: 'so_1', orderNumber: 'ORD-2026-000042' },
      rowNumber: null,
    })).toBe('ORD-2026-000042');
  });

  it('rejects old SO- camelCase as non-official (now ORD-)', () => {
    expect(pickSalesOrderNumber({
      payload: { id: 'so_1', orderNumber: 'SO-2026-000042' },
      rowNumber: null,
    })).toBeNull();
  });

  it('ignores provisional or malformed payload numbers so they get re-minted', () => {
    expect(pickSalesOrderNumber({
      payload: { id: 'so_1', orderNumber: 'SO-ORD-provisional' },
      rowNumber: null,
    })).toBeNull();
    expect(pickSalesOrderNumber({
      payload: { id: 'so_1', orderNumber: '' },
      rowNumber: null,
    })).toBeNull();
    expect(pickSalesOrderNumber({
      payload: { id: 'so_1' },
      rowNumber: null,
    })).toBeNull();
  });

  it('falls back to the number already committed on the server row (idempotent replay)', () => {
    expect(pickSalesOrderNumber({
      payload: { id: 'so_1', orderNumber: 'SO-ORD-provisional' },
      rowNumber: 'ORD-2026-000007',
    })).toBe('ORD-2026-000007');
    expect(pickSalesOrderNumber({
      payload: { id: 'so_1' },
      rowNumber: '',
    })).toBeNull();
  });

  it('is safe against non-object payloads', () => {
    expect(pickSalesOrderNumber({ payload: null, rowNumber: null })).toBeNull();
    expect(pickSalesOrderNumber({ payload: 'x', rowNumber: 'ORD-2026-000001' })).toBe('ORD-2026-000001');
  });
});

describe('nextSalesOrderNumber', () => {
  it('mints ORD-YYYY-000001 on an empty table', () => {
    const number = nextSalesOrderNumber([]);
    expect(number).toMatch(/^ORD-\d{4}-000001$/);
  });

  it('increments the max across both key spellings', () => {
    const rows = [
      { id: 'a', data: { order_number: 'ORD-2025-000099' } },
      { id: 'b', data: { orderNumber: 'ORD-2026-000005' } },
      { id: 'c', data: { orderNumber: 'ORD-2026-000042' } },
      { id: 'd', data: { order_number: 'ORD-2026-000007' } },
      { id: 'e', data: { orderNumber: 'SO-ORD-provisional' } },
    ];
    expect(nextSalesOrderNumber(rows)).toBe('ORD-2026-000043');
  });

  it('ignores rows from other years and malformed numbers', () => {
    const rows = [
      { id: 'a', data: { order_number: 'ORD-2027-000001' } },
      { id: 'b', data: { orderNumber: 'INV-2026-000001' } },
      { id: 'c', data: { orderNumber: 'ORD-2026-abc' } },
      { id: 'd', data: {} },
    ];
    expect(nextSalesOrderNumber(rows)).toBe('ORD-2026-000001');
  });

  it('handles flat rows (no data envelope) and null entries', () => {
    const rows = [
      { id: 'a', order_number: 'ORD-2026-000010' },
      null,
      undefined,
    ];
    expect(nextSalesOrderNumber(rows)).toBe('ORD-2026-000011');
  });
});
