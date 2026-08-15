import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useAuth } from './AuthContext';
import { api } from '../services/api';

export interface FinancialYear {
  id: string;
  name: string;
  code: string;
  start_date: string;
  end_date: string;
  is_default: number | boolean;
  is_active: number | boolean;
  is_closed: number;
  status: string;
}

interface FinancialYearContextType {
  selectedFinancialYear: FinancialYear | null;
  availableFinancialYears: FinancialYear[];
  isLoading: boolean;
  setFinancialYear: (fy: FinancialYear) => void;
  refreshFinancialYears: () => Promise<void>;
  isDateInFY: (date: string) => boolean;
  getFYDateRange: () => { start: string; end: string } | null;
  validateDateInFY: (date: string) => string | null;
}

const FinancialYearContext = createContext<FinancialYearContextType | undefined>(undefined);

const DATA_CHANGED_EVENT = 'primeerp:data-changed';
const DATA_CHANGED_CHANNEL = 'primeerp-data-sync';

function getFyIdFromUrl(): string | null {
  const params = new URLSearchParams(window.location.search);
  return params.get('financialYear') || params.get('fy') || null;
}

function isActive(fy: FinancialYear | null | undefined): boolean {
  if (!fy) return false;
  return Boolean(fy.is_active) || Boolean(fy.is_default) || fy.is_default === 1;
}

export const FinancialYearProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isInitialized } = useAuth();
  const [financialYears, setFinancialYears] = useState<FinancialYear[]>([]);
  const [selected, setSelected] = useState<FinancialYear | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchFinancialYears = useCallback(async () => {
    const [years, defaultFy] = await Promise.all([
      api.system.getFinancialYears(),
      api.system.getDefaultFinancialYear(),
    ]);
    return { years: years || [], defaultFy: defaultFy || null };
  }, []);

  const applyFinancialYear = useCallback((fy: FinancialYear) => {
    setSelected(fy);
  }, []);

  const refreshFinancialYears = useCallback(async () => {
    const { years, defaultFy } = await fetchFinancialYears();
    setFinancialYears(years);

    // Priority 1: URL parameter (explicit navigation)
    const urlId = getFyIdFromUrl();
    if (urlId) {
      const urlMatch = years.find((fy: FinancialYear) => fy.id === urlId);
      if (urlMatch) {
        applyFinancialYear(urlMatch);
        setIsLoading(false);
        return;
      }
    }

    // Priority 2: Company-wide active Financial Year (synced from IndexedDB)
    const activeMatch = years.find((fy: FinancialYear) => isActive(fy));
    if (activeMatch) {
      applyFinancialYear(activeMatch);
      setIsLoading(false);
      return;
    }

    // Priority 3: Default FY from backend/repository
    if (defaultFy) {
      applyFinancialYear(defaultFy);
      if (years.length === 0) {
        try {
          const freshYears = await api.system.getFinancialYears();
          if (freshYears?.length) setFinancialYears(freshYears);
        } catch { /* best-effort */ }
      }
    } else if (years.length > 0) {
      applyFinancialYear(years[0]);
    }
    setIsLoading(false);
  }, [fetchFinancialYears, applyFinancialYear]);

  const scheduleRefresh = useCallback(() => {
    if (refreshTimer.current) clearTimeout(refreshTimer.current);
    refreshTimer.current = setTimeout(() => {
      refreshFinancialYears().catch(() => undefined);
    }, 400);
  }, [refreshFinancialYears]);

  // Refresh when company data changes (pull, realtime sync, cross-tab writes)
  useEffect(() => {
    const onDataChanged = (event: Event) => {
      const detail = (event as CustomEvent).detail as { stores?: string[] } | undefined;
      if (!detail?.stores || detail.stores.includes('financialYears') || detail.stores.includes('settings')) {
        scheduleRefresh();
      }
    };

    window.addEventListener(DATA_CHANGED_EVENT, onDataChanged);

    let channel: BroadcastChannel | null = null;
    if (typeof BroadcastChannel !== 'undefined') {
      channel = new BroadcastChannel(DATA_CHANGED_CHANNEL);
      channel.onmessage = (event: MessageEvent) => {
        const detail = event.data as { stores?: string[] } | undefined;
        if (!detail?.stores || detail.stores.includes('financialYears') || detail.stores.includes('settings')) {
          scheduleRefresh();
        }
      };
    }

    return () => {
      window.removeEventListener(DATA_CHANGED_EVENT, onDataChanged);
      if (channel) channel.close();
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
    };
  }, [scheduleRefresh]);

  useEffect(() => {
    if (!isInitialized) return;
    refreshFinancialYears();
  }, [isInitialized, refreshFinancialYears]);

  const setFinancialYear = useCallback(async (fy: FinancialYear) => {
    setSelected(fy);
    // Company-wide: persist the active FY so every device sees the change.
    try {
      await api.system.setActiveFinancialYear(fy.id);
    } catch {
      // Best-effort; local selection is already applied.
    }
  }, []);

  const isDateInFY = useCallback((date: string): boolean => {
    if (!selected) return true;
    return date >= selected.start_date && date <= selected.end_date;
  }, [selected]);

  const getFYDateRange = useCallback(() => {
    if (!selected) return null;
    return { start: selected.start_date, end: selected.end_date };
  }, [selected]);

  const validateDateInFY = useCallback((date: string): string | null => {
    if (!selected) return null;
    if (date < selected.start_date || date > selected.end_date) {
      return `Selected date does not belong to the active Financial Year (${selected.name}). Please switch Financial Year or choose a valid date within ${selected.start_date} to ${selected.end_date}.`;
    }
    if (selected.is_closed) {
      return `Financial Year "${selected.name}" is closed. No new transactions can be created.`;
    }
    return null;
  }, [selected]);

  const value = useMemo(() => ({
    selectedFinancialYear: selected,
    availableFinancialYears: financialYears,
    isLoading,
    setFinancialYear,
    refreshFinancialYears,
    isDateInFY,
    getFYDateRange,
    validateDateInFY,
  }), [selected, financialYears, isLoading, setFinancialYear, refreshFinancialYears, isDateInFY, getFYDateRange, validateDateInFY]);

  return (
    <FinancialYearContext.Provider value={value}>
      {children}
    </FinancialYearContext.Provider>
  );
};

export const useFinancialYear = () => {
  const context = useContext(FinancialYearContext);
  if (!context) throw new Error('useFinancialYear must be used within FinancialYearProvider');
  return context;
};

export default FinancialYearContext;
