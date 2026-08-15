/**
 * Local-first cache for the customer portal.
 *
 * The portal is LOCAL-FIRST: modules render instantly from this cache, then
 * refresh from the cloud/API in the background. The cache is namespaced per
 * portal customer so sessions never leak data between accounts.
 *
 * A hung network request can NEVER keep a portal module loading forever:
 * every fetch is wrapped in `withTimeout`, and on failure the module falls
 * back to the cached snapshot (or an explicit error state when no cache).
 */

const CACHE_VERSION = 'v1';
const STORAGE_PREFIX = 'primeportal:cache';
const MAX_ENTRIES = 30;
const DEBUG_LOG_KEY = 'primeportal:debug-logs';

interface CacheEntry {
  savedAt: number;
  data: unknown;
}

interface CacheBucket {
  [endpoint: string]: CacheEntry;
}

function getCustomerScope(): string {
  try {
    const raw = sessionStorage.getItem('portal_session');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed?.user?.customer_id) {
        return String(parsed.user.customer_id);
      }
    }
  } catch {
    // Session unreadable — fall back to a shared anonymous bucket.
  }
  return 'anonymous';
}

function bucketKey(): string {
  return `${STORAGE_PREFIX}:${CACHE_VERSION}:${getCustomerScope()}`;
}

function readBucket(): CacheBucket {
  try {
    const raw = localStorage.getItem(bucketKey());
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeBucket(bucket: CacheBucket): void {
  try {
    const keys = Object.keys(bucket);
    if (keys.length > MAX_ENTRIES) {
      // Evict the oldest entries first.
      keys.sort((a, b) => (bucket[a]?.savedAt || 0) - (bucket[b]?.savedAt || 0));
      for (const stale of keys.slice(0, keys.length - MAX_ENTRIES)) {
        delete bucket[stale];
      }
    }
    localStorage.setItem(bucketKey(), JSON.stringify(bucket));
  } catch {
    // Quota exceeded / storage unavailable — drop the largest entries and retry once.
    try {
      const keys = Object.keys(bucket);
      keys.sort(
        (a, b) =>
          JSON.stringify(bucket[b]?.data ?? null).length -
          JSON.stringify(bucket[a]?.data ?? null).length
      );
      for (const big of keys.slice(0, Math.max(1, Math.floor(keys.length / 2)))) {
        delete bucket[big];
      }
      localStorage.setItem(bucketKey(), JSON.stringify(bucket));
    } catch {
      // Give up silently — the cache must never break the app.
    }
  }
}

/** Read a previously cached portal response, or null when absent. */
export function readPortalCache<T>(endpoint: string): T | null {
  try {
    const entry = readBucket()[endpoint];
    return entry ? (entry.data as T) : null;
  } catch {
    return null;
  }
}

/** Persist a portal response so the next visit can render instantly. */
export function writePortalCache(endpoint: string, data: unknown): void {
  try {
    const bucket = readBucket();
    bucket[endpoint] = { savedAt: Date.now(), data };
    writeBucket(bucket);
  } catch {
    // Ignore — cache write failures are non-fatal.
  }
}

/** Remove all cached portal data for the current customer. */
export function clearPortalCache(): void {
  try {
    localStorage.removeItem(bucketKey());
  } catch {
    // Ignore.
  }
}

/**
 * Resolve a promise but never wait longer than `timeoutMs`.
 * A hung network/cloud call can therefore never block the UI indefinitely.
 */
export function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs = 15000,
  label = 'request'
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`${label} timed out after ${timeoutMs}ms`));
    }, timeoutMs);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      }
    );
  });
}

/**
 * Dev logging for the portal loading chain.
 * Enabled by default; set localStorage `primeportal:debug-logs` to `0` to silence.
 */
export function portalLog(module: string, message: string, ...args: unknown[]): void {
  try {
    if (localStorage.getItem(DEBUG_LOG_KEY) === '0') return;
  } catch {
    // Storage unavailable — keep logging.
  }
  // eslint-disable-next-line no-console
  console.log(`[Portal][${module}] ${message}`, ...args);
}
