import { useCallback, useEffect, useRef, useState } from 'react';
import { portalLog, readPortalCache, writePortalCache, withTimeout } from '../../../services/portalCache';

export interface UsePortalDataResult {
  /** True only while there is no cached data to show and the fetch is in flight. */
  loading: boolean;
  /** Set when the fetch failed and no cached data was available. */
  error: string | null;
  /** Re-run the load (retry / realtime refresh). */
  refresh: () => void;
  /** Clear the current error (banner dismiss). */
  clearError: () => void;
}

interface UsePortalDataOptions<T> {
  /**
   * Stable identity for the data set — the exact portal endpoint (with query
   * string) that is fetched. Must match the URL the API client requests so
   * cache keys line up. Changing it reloads the data.
   */
  key: string;
  /** Network fetch. Runs in the background after cached data renders. */
  fetcher: () => Promise<T>;
  /** Applies a response (cached or fresh) to the component's state. */
  onData: (data: T) => void;
  /** Module label used in dev logs, e.g. 'Invoices'. */
  label: string;
  /** Hard timeout for the background fetch (default 15s). */
  timeoutMs?: number;
}

/**
 * Shared LOCAL-FIRST loading architecture for portal modules.
 *
 * Flow (guaranteed to terminate — no fifth state where a skeleton stays forever):
 *   1. Cached data (if any) renders immediately, so the UI never waits on the cloud.
 *   2. The network fetch runs in the BACKGROUND with a hard timeout.
 *   3. Success  → fresh data rendered + cache updated.
 *      Failure  → cached data kept (offline mode) or an explicit error state.
 *   4. `loading` is always resolved via the same paths: DATA / EMPTY / ERROR.
 *
 * `fetcher`/`onData` are read through refs, so unstable closures never cause
 * the effect to re-run in a loop (the effect only depends on `key`).
 */
export function usePortalData<T>({
  key,
  fetcher,
  onData,
  label,
  timeoutMs = 15000,
}: UsePortalDataOptions<T>): UsePortalDataResult {
  const fetcherRef = useRef(fetcher);
  const onDataRef = useRef(onData);
  fetcherRef.current = fetcher;
  onDataRef.current = onData;

  // Local-first: if a snapshot already exists, skip the skeleton entirely.
  const [loading, setLoading] = useState<boolean>(() => readPortalCache<T>(key) === null);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  const refresh = useCallback(() => setNonce((n) => n + 1), []);
  const clearError = useCallback(() => setError(null), []);

  useEffect(() => {
    let cancelled = false;

    portalLog(label, 'Loading started', key);

    const cached = readPortalCache<T>(key);
    const hadCache = cached !== null;
    if (hadCache) {
      portalLog(label, 'Local cache hit — rendering immediately', key);
      onDataRef.current(cached as T);
      setError(null);
      setLoading(false);
    } else {
      setLoading(true);
    }

    (async () => {
      try {
        portalLog(label, 'Background sync started', key);
        const data = await withTimeout<T>(fetcherRef.current(), timeoutMs, label);
        if (cancelled) return;
        writePortalCache(key, data);
        onDataRef.current(data);
        setError(null);
        portalLog(label, 'Background sync completed', key);
      } catch (err: any) {
        if (cancelled) return;
        const message = err?.message || 'Failed to load data';
        portalLog(label, 'Load error:', message);
        if (!hadCache) {
          portalLog(label, 'No cached data — showing error state', key);
          setError(message);
        } else {
          portalLog(label, 'Keeping cached data after sync failure', key);
        }
      } finally {
        if (!cancelled) {
          portalLog(label, 'Loading completed', key);
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [key, nonce, timeoutMs, label]);

  return { loading, error, refresh, clearError };
}
