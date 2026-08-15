import { describe, it, expect, vi } from 'vitest';
import { newUlid, newId, isUlid } from '../../../utils/ulid';

const ULID_PATTERN = /^[0-9A-HJKMNP-TV-Z]{26}$/;

describe('ulid', () => {
  it('produces 26-character Crockford-base32 ids', () => {
    for (let i = 0; i < 100; i += 1) {
      const id = newUlid();
      expect(id).toMatch(ULID_PATTERN);
      expect(id).toHaveLength(26);
    }
  });

  it('is globally unique across many generations', () => {
    // setup.ts stubs getRandomValues as a no-op returning the caller's buffer unchanged,
    // which would reuse identical random segments. Install real entropy for this test only.
    const rng = (arr: Uint8Array) => {
      for (let i = 0; i < (arr as Uint8Array).length; i += 1) {
        arr[i] = Math.floor(Math.random() * 256);
      }
      return arr;
    };
    const cryptoObj = globalThis.crypto;
    Object.defineProperty(cryptoObj, 'getRandomValues', {
      value: rng,
      writable: true,
      configurable: true,
    });
    const seen = new Set<string>();
    for (let i = 0; i < 10000; i += 1) seen.add(newUlid());
    expect(seen.size).toBe(10000);
  });

  it('is time-sortable (higher timestamps sort after lower ones)', () => {
    // Char 9 of a ULID mixes the 3 lowest timestamp bits with the top 2 random
    // bits, so sub-8ms gaps can invert a prefix comparison. Control Date.now
    // with 61s gaps and compare full strings (the guaranteed ordering).
    const times = [1_700_000_000_000, 1_700_000_061_000, 1_700_000_122_000];
    let i = 0;
    vi.spyOn(Date, 'now').mockImplementation(() => times[Math.min(i++, times.length - 1)]);
    const ids = [newUlid(), newUlid(), newUlid()];
    expect(ids[0] < ids[1]).toBe(true);
    expect(ids[1] < ids[2]).toBe(true);
  });

  it('supports an optional human-readable prefix (record id)', () => {
    const id = newId('CUST');
    expect(id.startsWith('CUST-')).toBe(true);
    expect(id.slice(5)).toMatch(ULID_PATTERN);
  });

  it('validates ulid shape', () => {
    expect(isUlid(newUlid())).toBe(true);
    expect(isUlid('INV-0001')).toBe(false);
    expect(isUlid('not-a-ulid')).toBe(false);
  });
});