import { useEffect, useRef, useCallback } from 'react';
import { useData } from '../context/DataContext';

interface UseModuleRefreshOptions {
  interval?: number | null;
  focusRefresh?: boolean;
}

const MIN_FOCUS_REFRESH_INTERVAL = 60_000;

/**
 * Hook to manage data polling and window-focus refresh for specific modules.
 * 
 * @param refreshFn Optional custom refresh function. Defaults to refreshAllData from DataContext.
 * @param options Configuration for interval and focus refresh.
 */
export const useModuleRefresh = (
  refreshFn?: () => Promise<void>,
  options: UseModuleRefreshOptions = {}
) => {
  const { startPolling, stopPolling, refreshAllData } = useData();
  const { interval = 300_000, focusRefresh = true } = options;
  
  const targetRefreshFn = refreshFn || refreshAllData;
  const lastRefreshRef = useRef<number>(0);
  const mountedRef = useRef(true);

  const handleFocus = useCallback(() => {
    if (!focusRefresh || !mountedRef.current) return;
    
    const now = Date.now();
    if (now - lastRefreshRef.current > MIN_FOCUS_REFRESH_INTERVAL) {
      lastRefreshRef.current = now;
      targetRefreshFn().catch(() => undefined);
    }
  }, [focusRefresh, targetRefreshFn]);

  useEffect(() => {
    mountedRef.current = true;
    // Start polling if interval is provided
    if (interval !== null && interval > 0) {
      startPolling(interval);
    }

    // Register focus listener
    if (focusRefresh) {
      window.addEventListener('focus', handleFocus);
    }

    return () => {
      mountedRef.current = false;
      stopPolling();
      window.removeEventListener('focus', handleFocus);
    };
  }, [interval, focusRefresh, startPolling, stopPolling, handleFocus]);

  return {
    refresh: targetRefreshFn
  };
};
