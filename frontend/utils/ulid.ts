/**
 * ulid.ts — client-side, globally-unique, time-sortable identifiers.
 *
 * Phase 2 goal: every NEW record carries a globally-unique client-generated
 * id so offline clients can never collide. ULIDs are
 *   - 128-bit (48-bit millisecond timestamp + 80 bits of crypto randomness)
 *   - 26 characters in Crockford base32 (sortable, URL-safe, case-safe)
 *   - generatable off-device (or on-device) without any backend round-trip
 *
 * Existing ids are intentionally preserved — only NEW records use these.
 */
const CROCKFORD_BASE32 = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const ULID_LENGTH = 26;

function encodeBase32(uuidBytes: Uint8Array, buf: string[] = []): string {
  let carry = 0;
  let bits = 0;
  for (const byte of uuidBytes) {
    carry = (carry << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      buf.push(CROCKFORD_BASE32[(carry >>> (bits - 5)) & 0x1f]);
      bits -= 5;
    }
  }
  if (bits > 0) {
    buf.push(CROCKFORD_BASE32[(carry << (5 - bits)) & 0x1f]);
  }
  return buf.join('');
}

/**
 * Generate a ULID string. Safe in browsers and workers (uses
 * `crypto.getRandomValues`), with a pure-JS fallback for runtimes without it.
 */
export function newUlid(): string {
  const bytes = new Uint8Array(16);

  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < 16; i += 1) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }

  // 48-bit big-endian millisecond timestamp in the first 6 bytes.
  let time = Date.now();
  for (let i = 5; i >= 0; i -= 1) {
    bytes[i] = time & 0xff;
    time = Math.floor(time / 256);
  }

  // ULID can technically overflow its 26-char alphabet for times past an
  // epoch far in the future; clamp to keep it deterministic and safe.
  const encoded = encodeBase32(bytes).slice(0, ULID_LENGTH).padEnd(ULID_LENGTH, '0');
  if (encoded.length !== ULID_LENGTH) {
    // Fall back to a UUIDv4-style id if something unexpected happened so we
    // never emit a malformed identifier.
    return crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }
  return encoded;
}

/**
 * Generate a new record id, optionally namespaced by a type prefix
 * (e.g. `CUST-01...`). The prefix is kept for human browsing while the
 * payload is still globally unique.
 */
export function newId(prefix?: string): string {
  const uid = newUlid();
  if (!prefix) return uid;
  return `${prefix}-${uid}`;
}

export function isUlid(value: unknown): boolean {
  return typeof value === 'string' && /^[0-9A-HJKMNP-TV-Z]{26}$/.test(value);
}

/** Validate / normalize an arbitrary candidate id (used by the sync layer). */
export function ensureGlobalId(id?: string | null, prefix?: string): string {
  if (id && !isUlid(id)) return id;
  return newId(prefix);
}