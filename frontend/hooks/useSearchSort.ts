import { useState, useMemo, useCallback, useRef, useEffect } from 'react';

export interface SortOption<T = string> {
  field: T;
  label: string;
  direction?: 'asc' | 'desc';
}

export interface SortConfig {
  field: string;
  direction: 'asc' | 'desc';
}

interface UseSearchSortOptions<T> {
  data: T[];
  searchFields: (keyof T | string)[];
  defaultSortField?: string;
  defaultSortDirection?: 'asc' | 'desc';
  storageKey?: string;
  debounceMs?: number;
  initialSearch?: string;
}

export function useSearchSort<T extends Record<string, any>>({
  data,
  searchFields,
  defaultSortField = 'date',
  defaultSortDirection = 'desc',
  storageKey,
  debounceMs = 400,
  initialSearch = '',
}: UseSearchSortOptions<T>) {
  // Load persisted state
  const loadPersisted = useCallback(<V,>(key: string, fallback: V): V => {
    if (!storageKey) return fallback;
    try {
      const stored = localStorage.getItem(`${storageKey}_${key}`);
      if (stored !== null) return JSON.parse(stored);
    } catch { /* ignore */ }
    return fallback;
  }, [storageKey]);

  const [searchTerm, setSearchTermState] = useState(() => loadPersisted('search', initialSearch));
  const [debouncedSearch, setDebouncedSearch] = useState(() => loadPersisted('search', initialSearch));
  const [sortField, setSortFieldState] = useState<string>(() => loadPersisted('sortField', defaultSortField));
  const [sortDirection, setSortDirectionState] = useState<'asc' | 'desc'>(() => loadPersisted('sortDirection', defaultSortDirection));
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Persist state
  const persist = useCallback(<V,>(key: string, value: V) => {
    if (!storageKey) return;
    try {
      localStorage.setItem(`${storageKey}_${key}`, JSON.stringify(value));
    } catch { /* ignore */ }
  }, [storageKey]);

  // Debounced search
  const setSearchTerm = useCallback((value: string) => {
    setSearchTermState(value);
    persist('search', value);
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => {
      setDebouncedSearch(value);
    }, debounceMs);
  }, [debounceMs, persist]);

  // Immediate search on Enter
  const handleSearchKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
      setDebouncedSearch(searchTerm);
    }
  }, [searchTerm]);

  const clearSearch = useCallback(() => {
    setSearchTermState('');
    setDebouncedSearch('');
    persist('search', '');
  }, [persist]);

  const setSortField = useCallback((field: string) => {
    setSortFieldState(field);
    persist('sortField', field);
  }, [persist]);

  const setSortDirection = useCallback((direction: 'asc' | 'desc') => {
    setSortDirectionState(direction);
    persist('sortDirection', direction);
  }, [persist]);

  const toggleSort = useCallback((field: string) => {
    if (sortField === field) {
      const newDir = sortDirection === 'asc' ? 'desc' : 'asc';
      setSortDirection(newDir);
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  }, [sortField, sortDirection, setSortField, setSortDirection]);

  const sortConfig: SortConfig = useMemo(() => ({
    field: sortField,
    direction: sortDirection,
  }), [sortField, sortDirection]);

  // Filtered and sorted data
  const processedData = useMemo(() => {
    let result = [...data];

    // Apply search filter
    const search = debouncedSearch.trim();
    if (search) {
      const lowerSearch = search.toLowerCase();
      result = result.filter(item =>
        searchFields.some(field => {
          const value = item[field as keyof T];
          if (value == null) return false;
          return String(value).toLowerCase().includes(lowerSearch);
        })
      );
    }

    // Apply sorting
    const field = sortField;
    const dir = sortDirection === 'asc' ? 1 : -1;

    result.sort((a, b) => {
      let valA: any = a[field as keyof T];
      let valB: any = b[field as keyof T];

      // Handle nested fields (e.g., "customer.name")
      if (field.includes('.')) {
        const parts = field.split('.');
        valA = parts.reduce((obj, key) => obj?.[key], a);
        valB = parts.reduce((obj, key) => obj?.[key], b);
      }

      // Handle null/undefined
      if (valA == null && valB == null) return 0;
      if (valA == null) return 1 * dir;
      if (valB == null) return -1 * dir;

      // Date comparison
      if (typeof valA === 'string' && typeof valB === 'string') {
        const dateA = new Date(valA).getTime();
        const dateB = new Date(valB).getTime();
        if (!isNaN(dateA) && !isNaN(dateB)) {
          return (dateA - dateB) * dir;
        }
      }

      // Numeric comparison
      if (typeof valA === 'number' && typeof valB === 'number') {
        return (valA - valB) * dir;
      }

      // String comparison
      const strA = String(valA).toLowerCase();
      const strB = String(valB).toLowerCase();
      if (strA < strB) return -1 * dir;
      if (strA > strB) return 1 * dir;
      return 0;
    });

    return result;
  }, [data, debouncedSearch, searchFields, sortField, sortDirection]);

  const hasActiveSearch = debouncedSearch.trim().length > 0;
  const searchResultCount = processedData.length;

  return {
    searchTerm,
    setSearchTerm,
    handleSearchKeyDown,
    clearSearch,
    debouncedSearch,
    sortField,
    sortDirection,
    setSortField,
    setSortDirection,
    toggleSort,
    sortConfig,
    processedData,
    hasActiveSearch,
    searchResultCount,
    totalCount: data.length,
  };
}

export default useSearchSort;