/**
 * Sales-order official-number minting — hermetic unit tests for the pure
 * decision helpers in cloudSyncStore.cjs (no network, no Supabase):
 *
 *   pickSalesOrderNumber({ payload, rowNumber })
 *     - keeps an already-official number in the payload (idempotent re-push)
 *     - rejects provisional / malformed payload numbers so they get minted
 *     - falls back to the number already committed on the server row
 *   nextSalesOrderNumber(rows)
 *     - next SO-YYYY-###### sequence across portal (order_number) and
 *       admin-synced (orderNumber) rows
 */

const {
  pickSalesOrderNumber,
  nextSalesOrderNumber,
} = require('../services/cloudSyncStore.cjs');

describe('pickSalesOrderNumber', () => {
  it('keeps an official snake_case number already in the payload', () => {
    expect(pickSalesOrderNumber({
      payload: { id: 'so_1', order_number: 'SO-2026-000042' },
      rowNumber: null,
    })).toBe('SO-2026-000042');
  });

  it('keeps an official camelCase number already in the payload', () => {
    expect(pickSalesOrderNumber({
      payload: { id: 'so_1', orderNumber: 'SO-2026-000042' },
      rowNumber: null,
    })).toBe('SO-2026-000042');
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
      rowNumber: 'SO-2026-000007',
    })).toBe('SO-2026-000007');
    expect(pickSalesOrderNumber({
      payload: { id: 'so_1' },
      rowNumber: '',
    })).toBeNull();
  });

  it('is safe against non-object payloads', () => {
    expect(pickSalesOrderNumber({ payload: null, rowNumber: null })).toBeNull();
    expect(pickSalesOrderNumber({ payload: 'x', rowNumber: 'SO-2026-000001' })).toBe('SO-2026-000001');
  });
});

describe('nextSalesOrderNumber', () => {
  it('mints SO-YYYY-000001 on an empty table', () => {
    const number = nextSalesOrderNumber([]);
    expect(number).toMatch(/^SO-\d{4}-000001$/);
  });

  it('increments the max across both key spellings', () => {
    const rows = [
      { id: 'a', data: { order_number: 'SO-2025-000099' } },
      { id: 'b', data: { orderNumber: 'SO-2026-000005' } },
      { id: 'c', data: { orderNumber: 'SO-2026-000042' } },
      { id: 'd', data: { order_number: 'SO-2026-000007' } },
      { id: 'e', data: { orderNumber: 'SO-ORD-provisional' } },
    ];
    expect(nextSalesOrderNumber(rows)).toBe('SO-2026-000043');
  });

  it('ignores rows from other years and malformed numbers', () => {
    const rows = [
      { id: 'a', data: { order_number: 'SO-2027-000001' } },
      { id: 'b', data: { orderNumber: 'INV-2026-000001' } },
      { id: 'c', data: { orderNumber: 'SO-2026-abc' } },
      { id: 'd', data: {} },
    ];
    expect(nextSalesOrderNumber(rows)).toBe('SO-2026-000001');
  });

  it('handles flat rows (no data envelope) and null entries', () => {
    const rows = [
      { id: 'a', order_number: 'SO-2026-000010' },
      null,
      undefined,
    ];
    expect(nextSalesOrderNumber(rows)).toBe('SO-2026-000011');
  });
});