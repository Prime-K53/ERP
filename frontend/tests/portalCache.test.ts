import { describe, it, expect, beforeEach } from 'vitest';
import {
  clearPortalCache,
  readPortalCache,
  writePortalCache,
  withTimeout,
} from '../services/portalCache';

describe('portalCache', () => {
  beforeEach(() => {
    // Route the jsdom localStorage mock through an in-memory map so cache
    // round-trips actually work (the test setup returns null by default).
    const map = new Map<string, string>();
    const ls = window.localStorage as any;
    if (typeof ls.getItem?.mockImplementation === 'function') {
      ls.getItem.mockImplementation((k: string) => map.get(k) ?? null);
      ls.setItem.mockImplementation((k: string, v: string) => {
        map.set(k, String(v));
      });
      ls.removeItem.mockImplementation((k: string) => {
        map.delete(k);
      });
    }
  });

  it('returns null when nothing was cached', () => {
    expect(readPortalCache('/invoices?page=1')).toBeNull();
  });

  it('round-trips a value through the cache', () => {
    const endpoint = '/invoices?page=1&pageSize=20';
    writePortalCache(endpoint, { invoices: [1, 2, 3], total: 3 });
    expect(readPortalCache(endpoint)).toEqual({ invoices: [1, 2, 3], total: 3 });
  });

  it('overwrites an existing entry', () => {
    const endpoint = '/payments';
    writePortalCache(endpoint, { payments: [] });
    writePortalCache(endpoint, { payments: [1] });
    expect(readPortalCache(endpoint)).toEqual({ payments: [1] });
  });

  it('clears cached values for the customer', () => {
    writePortalCache('/invoices', { invoices: [] });
    writePortalCache('/orders', { orders: [] });
    clearPortalCache();
    expect(readPortalCache('/invoices')).toBeNull();
    expect(readPortalCache('/orders')).toBeNull();
  });

  it('ignores corrupted cache entries', () => {
    const ls = window.localStorage as any;
    ls.setItem?.('primeportal:cache:v1:anonymous', '{not valid json');
    expect(readPortalCache('/invoices')).toBeNull();
  });
});

describe('withTimeout', () => {
  it('resolves when the promise resolves first', async () => {
    await expect(withTimeout(Promise.resolve('ok'), 100)).resolves.toBe('ok');
  });

  it('rejects with the original error when the promise fails first', async () => {
    await expect(
      withTimeout(Promise.reject(new Error('boom')), 100)
    ).rejects.toThrow('boom');
  });

  it('rejects when the promise hangs past the timeout', async () => {
    const hang = new Promise(() => {});
    await expect(withTimeout(hang, 50, 'TestModule')).rejects.toThrow(
      'TestModule timed out after 50ms'
    );
  });
});
