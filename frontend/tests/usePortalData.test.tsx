import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { act } from 'react';
import { usePortalData } from '../views/portal/hooks/usePortalData';
import { readPortalCache, writePortalCache } from '../services/portalCache';

const KEY = '/invoices?page=1&pageSize=20';

describe('usePortalData (local-first loading)', () => {
  beforeEach(() => {
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

  it('resolves loading to false after a successful fetch (no cache)', async () => {
    const onData = vi.fn();
    const { result } = renderHook(() =>
      usePortalData<string[]>({
        key: KEY,
        label: 'Test',
        fetcher: () => Promise.resolve(['a', 'b']),
        onData,
      })
    );

    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBeNull();
    expect(onData).toHaveBeenLastCalledWith(['a', 'b']);
    // Fresh response was cached for the next visit.
    expect(readPortalCache<string[]>(KEY)).toEqual(['a', 'b']);
  });

  it('renders cached data immediately and refreshes in the background', async () => {
    writePortalCache(KEY, ['cached']);
    const onData = vi.fn();

    const { result } = renderHook(() =>
      usePortalData<string[]>({
        key: KEY,
        label: 'Test',
        fetcher: () => Promise.resolve(['fresh']),
        onData,
      })
    );

    // Skeleton is skipped entirely — cached data renders on first paint.
    expect(result.current.loading).toBe(false);
    expect(onData).toHaveBeenCalledWith(['cached']);

    // Background sync still runs and applies fresh data.
    await waitFor(() => expect(onData).toHaveBeenLastCalledWith(['fresh']));
    expect(readPortalCache<string[]>(KEY)).toEqual(['fresh']);
  });

  it('sets an error and stops loading when the fetch fails with no cache', async () => {
    const onData = vi.fn();
    const { result } = renderHook(() =>
      usePortalData<string[]>({
        key: KEY,
        label: 'Test',
        fetcher: () => Promise.reject(new Error('Network request failed')),
        onData,
      })
    );

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toContain('Network request failed');
    expect(onData).not.toHaveBeenCalled();
  });

  it('keeps cached data and does not error when the background fetch fails', async () => {
    writePortalCache(KEY, ['stale']);
    const onData = vi.fn();
    const { result } = renderHook(() =>
      usePortalData<string[]>({
        key: KEY,
        label: 'Test',
        fetcher: () => Promise.reject(new Error('offline')),
        onData,
      })
    );

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBeNull();
    expect(onData).toHaveBeenCalledWith(['stale']);
  });

  it('terminates loading with an error when the fetch hangs (timeout)', async () => {
    const hang = new Promise<string[]>(() => {});
    const { result } = renderHook(() =>
      usePortalData<string[]>({
        key: KEY,
        label: 'Test',
        fetcher: () => hang,
        onData: vi.fn(),
        timeoutMs: 50,
      })
    );

    await waitFor(() => expect(result.current.loading).toBe(false), { timeout: 2000 });
    expect(result.current.error).toContain('timed out');
  });

  it('refresh re-runs the load and resolves again', async () => {
    let calls = 0;
    const onData = vi.fn();
    const { result } = renderHook(() =>
      usePortalData<string[]>({
        key: KEY,
        label: 'Test',
        fetcher: () => {
          calls += 1;
          return Promise.resolve([`call-${calls}`]);
        },
        onData,
      })
    );

    await waitFor(() => expect(onData).toHaveBeenLastCalledWith(['call-1']));
    await act(async () => {
      result.current.refresh();
    });
    await waitFor(() => expect(onData).toHaveBeenLastCalledWith(['call-2']));
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
  });
});
