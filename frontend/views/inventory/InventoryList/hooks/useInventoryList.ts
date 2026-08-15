import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import type { Item } from '../../../../types';
import * as inventoryListService from '../services/inventoryListService';
import type { InventoryStats } from '../services/inventoryListService';

export type ViewMode = 'table' | 'compact' | 'card';

export interface FilterState {
  classification: string[];
  inventoryRole: string[];
  rawMaterialCategory: string[];
  status: string[];
  warehouse: string[];
  supplier: string[];
  category: string[];
  brand: string[];
  stockStatus: string[];
  tracking: string[];
  hasRecipe: boolean | null;
  hasVariants: boolean | null;
  hasAttachments: boolean | null;
  createdBy: string;
  dateCreatedFrom: string;
  dateCreatedTo: string;
  dateUpdatedFrom: string;
  dateUpdatedTo: string;
}

const DEFAULT_FILTERS: FilterState = {
  classification: [],
  inventoryRole: [],
  rawMaterialCategory: [],
  status: [],
  warehouse: [],
  supplier: [],
  category: [],
  brand: [],
  stockStatus: [],
  tracking: [],
  hasRecipe: null,
  hasVariants: null,
  hasAttachments: null,
  createdBy: '',
  dateCreatedFrom: '',
  dateCreatedTo: '',
  dateUpdatedFrom: '',
  dateUpdatedTo: '',
};

export type SortKey = 'name' | 'sku' | 'type' | 'stock' | 'costPrice' | 'sellingPrice' | 'margin' | 'status' | 'updatedAt';
export type SortDir = 'asc' | 'desc';

export interface SavedPreset {
  name: string;
  filters: FilterState;
}

const PRESETS_KEY = 'inventory-filter-presets';

export function useInventoryList() {
  const [allItems, setAllItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [filters, setFilters] = useState<FilterState>(() => {
    try {
      const saved = localStorage.getItem('inventory-list-filters');
      return saved ? { ...DEFAULT_FILTERS, ...JSON.parse(saved) } : DEFAULT_FILTERS;
    } catch { return DEFAULT_FILTERS; }
  });
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    return (localStorage.getItem('inventory-view-mode') as ViewMode) || 'table';
  });
  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [stats, setStats] = useState<InventoryStats | null>(null);
  const [filterPresets, setFilterPresets] = useState<SavedPreset[]>(() => {
    try {
      const saved = localStorage.getItem(PRESETS_KEY);
      return saved ? JSON.parse(saved) : [];
    } catch { return []; }
  });
  const [statsFilter, setStatsFilter] = useState<string>('all');
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => {
      setDebouncedSearch(search);
    }, 250);
    return () => clearTimeout(searchTimeout.current);
  }, [search]);

  useEffect(() => {
    localStorage.setItem('inventory-list-filters', JSON.stringify(filters));
  }, [filters]);

  useEffect(() => {
    localStorage.setItem('inventory-view-mode', viewMode);
  }, [viewMode]);

  useEffect(() => {
    localStorage.setItem(PRESETS_KEY, JSON.stringify(filterPresets));
  }, [filterPresets]);

  const loadItems = useCallback(async () => {
    setLoading(true);
    try {
      const items = await inventoryListService.fetchAllItems();
      setAllItems(items);
      setStats(inventoryListService.calculateStats(items));
    } catch {
      setAllItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadItems(); }, [loadItems]);

  const categories = useMemo(() => inventoryListService.getItemCategories(allItems), [allItems]);
  const brands = useMemo(() => inventoryListService.getItemBrands(allItems), [allItems]);
  const warehouses = useMemo(() => inventoryListService.getItemWarehouses(allItems), [allItems]);

  const filteredItems = useMemo(() => {
    let result = [...allItems];
    const s = debouncedSearch.toLowerCase().trim();

    if (s) {
      result = result.filter(item =>
        (item.name || '').toLowerCase().includes(s) ||
        (item.sku || '').toLowerCase().includes(s) ||
        (item.barcode || '').toLowerCase().includes(s) ||
        (item.qrCode || '').toLowerCase().includes(s) ||
        (item.supplierSku || '').toLowerCase().includes(s) ||
        (item.description || '').toLowerCase().includes(s) ||
        (item.brand || '').toLowerCase().includes(s)
      );
    }

    if (filters.classification.length > 0) {
      result = result.filter(item => filters.classification.includes(item.type || item.classification || ''));
    }
    if (filters.inventoryRole.length > 0) {
      result = result.filter(item => filters.inventoryRole.includes(item.inventoryRole || ''));
    }
    if (filters.rawMaterialCategory.length > 0) {
      result = result.filter(item => filters.rawMaterialCategory.includes((item as any).rawMaterialCategory || 'consumable'));
    }
    if (filters.status.length > 0) {
      result = result.filter(item => filters.status.includes(item.status || 'Active'));
    }
    if (filters.warehouse.length > 0) {
      result = result.filter(item =>
        filters.warehouse.includes(item.warehouseId || '') ||
        (item.locationStock || []).some((ls: { warehouseId: string; quantity: number }) => filters.warehouse.includes(ls.warehouseId))
      );
    }
    if (filters.supplier.length > 0) {
      result = result.filter(item => filters.supplier.includes(item.preferredSupplierId || ''));
    }
    if (filters.category.length > 0) {
      result = result.filter(item => filters.category.includes(item.category || ''));
    }
    if (filters.brand.length > 0) {
      result = result.filter(item => filters.brand.includes(item.brand || ''));
    }
    if (filters.stockStatus.length > 0) {
      result = inventoryListService.filterItemsByStock(result, filters.stockStatus[0] || '');
    }
    if (filters.tracking.length > 0) {
      result = result.filter(item => {
        const t = item;
        return filters.tracking.some(track => {
          if (track === 'lot') return t.lotTracking || t.trackLot;
          if (track === 'serial') return t.serialTracking || t.trackSerial;
          if (track === 'expiration') return t.expirationTracking || t.trackExpiration;
          return false;
        });
      });
    }
    if (filters.hasRecipe !== null) {
      result = result.filter(item => filters.hasRecipe ? !!item.serviceRecipeId : !item.serviceRecipeId);
    }
    if (filters.hasVariants !== null) {
      result = result.filter(item => filters.hasVariants ? !!item.variants?.length : !item.variants?.length);
    }
    if (filters.hasAttachments !== null) {
      result = result.filter(item => filters.hasAttachments ? !!(item.attachments?.length) : !(item.attachments?.length));
    }

    result.sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case 'name': cmp = (a.name || '').localeCompare(b.name || ''); break;
        case 'sku': cmp = (a.sku || '').localeCompare(b.sku || ''); break;
        case 'type': cmp = (a.type || '').localeCompare(b.type || ''); break;
        case 'stock': cmp = (a.stock || 0) - (b.stock || 0); break;
        case 'costPrice': cmp = (a.costPrice || a.cost || 0) - (b.costPrice || b.cost || 0); break;
        case 'sellingPrice': cmp = (a.sellingPrice || a.price || 0) - (b.sellingPrice || b.price || 0); break;
        case 'margin': cmp = inventoryListService.getItemMargin(a) - inventoryListService.getItemMargin(b); break;
        case 'status': cmp = (a.status || 'Active').localeCompare(b.status || 'Active'); break;
        case 'updatedAt': cmp = new Date(a.updatedAt || a.validationTimestamp || 0).getTime() - new Date(b.updatedAt || b.validationTimestamp || 0).getTime(); break;
      }
      return sortDir === 'desc' ? -cmp : cmp;
    });

    return result;
  }, [allItems, debouncedSearch, filters, sortKey, sortDir]);

  const totalPages = useMemo(() => Math.max(1, Math.ceil(filteredItems.length / pageSize)), [filteredItems, pageSize]);
  const safePage = Math.min(page, totalPages);

  const paginatedItems = useMemo(() => {
    const start = (safePage - 1) * pageSize;
    return filteredItems.slice(start, start + pageSize);
  }, [filteredItems, safePage, pageSize]);

  const totalInventoryValue = useMemo(() =>
    allItems.reduce((sum, i) => sum + (i.stock || 0) * (i.costPrice || i.cost || 0), 0),
  [allItems]);

  const toggleSort = useCallback((key: SortKey) => {
    setSortDir(prev => sortKey === key ? (prev === 'asc' ? 'desc' : 'asc') : 'asc');
    setSortKey(key);
  }, [sortKey]);

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const toggleSelectAll = useCallback(() => {
    if (selectedIds.size === paginatedItems.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(paginatedItems.map(i => i.id)));
    }
  }, [paginatedItems, selectedIds]);

  const clearSelection = useCallback(() => setSelectedIds(new Set()), []);

  const resetFilters = useCallback(() => {
    setFilters(DEFAULT_FILTERS);
    setSearch('');
    setDebouncedSearch('');
  }, []);

  const setFilter = useCallback(<K extends keyof FilterState>(key: K, value: FilterState[K]) => {
    setFilters(prev => ({ ...prev, [key]: value }));
    setPage(1);
  }, []);

  const savePreset = useCallback((name: string) => {
    setFilterPresets(prev => [...prev.filter(p => p.name !== name), { name, filters }]);
  }, [filters]);

  const loadPreset = useCallback((name: string) => {
    const preset = filterPresets.find(p => p.name === name);
    if (preset) { setFilters({ ...DEFAULT_FILTERS, ...preset.filters }); setPage(1); }
  }, [filterPresets]);

  const deletePreset = useCallback((name: string) => {
    setFilterPresets(prev => prev.filter(p => p.name !== name));
  }, []);

  return {
    allItems, loading, stats, statsFilter, setStatsFilter,
    search, setSearch, debouncedSearch,
    filters, setFilter, resetFilters, savePreset, loadPreset, deletePreset, filterPresets,
    viewMode, setViewMode,
    sortKey, sortDir, toggleSort,
    page, setPage: (p: number) => setPage(Math.max(1, Math.min(p, totalPages))),
    pageSize, setPageSize,
    safePage, totalPages,
    paginatedItems, filteredItems, totalInventoryValue,
    selectedIds, toggleSelect, toggleSelectAll, clearSelection, selectedCount: selectedIds.size,
    categories, brands, warehouses,
    refresh: loadItems,
  };
}
