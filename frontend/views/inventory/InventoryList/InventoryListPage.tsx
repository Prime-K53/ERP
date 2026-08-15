import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { Loader2, LayoutDashboard, Boxes, Package, PenTool, Printer, Sparkles, BrainCircuit } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useInventory } from '../../../context/InventoryContext';
import { useAuth } from '../../../context/AuthContext';
import { currencyService } from '../../../services/currencyService';
import { getDefaultDate } from '../../../utils/financialYearUtils';
import { resolveMinimumMarkup } from '../../../services/pricingValidationService';

import StockAdjustmentModal from '../components/StockAdjustmentModal';
import SmartAdjustModal from '../components/SmartAdjustModal';
import { SmartStockInsights } from './components/SmartStockInsights';
import { useInventoryList } from './hooks/useInventoryList';
import { InventoryTable } from './components/InventoryTable';
import { Pagination } from './components/Pagination';
import { EmptyState } from './components/EmptyState';
import { InventoryDashboard } from './components/InventoryDashboard';
import { FilterPanel } from './components/FilterPanel';
import '../../inventory/inventory-reference.css';
import type { Item } from '../../../types';
import { BulkActionToolbar } from './components/BulkActionToolbar';
import { ItemModal } from '../../../components/items/ItemModal';
import { BulkEditModal } from './modals/BulkEditModal';
import { AssignModal } from './modals/AssignModal';
import { PrintLabelModal } from './modals/PrintLabelModal';
import { ConfirmDialog, ConfirmDialogType } from '../../../components/ConfirmDialog';
import { getFloatingMenuStyle } from '../../../utils/actionMenu';

function money(n: number, symbol = '$'): string {
  n = Number(n) || 0;
  return symbol + ' ' + n.toLocaleString('en-US', {minimumFractionDigits:2, maximumFractionDigits:2});
}

function num(v: any): number {
  const n = parseFloat(v);
  return isNaN(n) ? 0 : n;
}

function esc(s: any): string {
  return String(s == null ? '' : s);
}

function getBomSummary(item: any, allItems: any[]): string {
  const sp = item.smartPricing || item.smartPricingSnapshot;
  const pc = item.pricingConfig;
  if (!sp && !pc) return '\u2014';
  const parts: string[] = [];
  if (sp) {
    const paperId = sp.paperItemId || pc?.paperId;
    if (paperId) {
      const paper = allItems.find(i => i.id === paperId);
      parts.push(paper ? paper.name.replace(/\s*\d+gsm.*/i, '').trim() : 'Paper');
    } else if (Number(sp.paperCost) > 0) parts.push('Paper');
    const tonerId = sp.tonerItemId || pc?.tonerId;
    if (tonerId) {
      const toner = allItems.find(i => i.id === tonerId);
      parts.push(toner ? toner.name.replace(/\s*Universal\s*/i, '').trim() : 'Toner');
    } else if (Number(sp.tonerCost) > 0) parts.push('Toner');
    const finishing = sp.finishingEnabled || [];
    if (Array.isArray(finishing) && finishing.length > 0) {
      finishing.forEach((id: string) => {
        parts.push(id.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase()));
      });
    } else if (Number(sp.finishingCost) > 0) parts.push('Finishing');
  }
  if (pc && !sp) {
    if (Number(pc.paperCost) > 0) parts.push('Paper');
    if (Number(pc.tonerCost) > 0) parts.push('Toner');
    const finishing = pc.finishingOptions || [];
    if (Array.isArray(finishing)) {
      finishing.forEach((opt: any) => {
        if (opt.active !== false) {
          parts.push(opt.name || opt.id?.replace(/([A-Z])/g, ' $1').replace(/^./, (s: string) => s.toUpperCase()) || 'Finishing');
        }
      });
    }
  }
  return parts.length > 0 ? parts.join(', ') : '\u2014';
}

type TabKey = 'dashboard' | 'raw' | 'product' | 'stationery' | 'printing';

const BOM_CATEGORY_COLORS: Record<string, { bg: string; text: string }> = {
  Paper: { bg: '#EFF6FF', text: '#1D4ED8' },
  Toner: { bg: '#FEF2F2', text: '#B91C1C' },
  'Cover/Card': { bg: '#F5F3FF', text: '#6D28D9' },
  Staple: { bg: '#F0FDF4', text: '#15803D' },
  'Binding Tape': { bg: '#FFF7ED', text: '#C2410C' },
  Other: { bg: '#F8FAFC', text: '#64748B' },
};

export const InventoryListPage: React.FC = () => {
  const navigate = useNavigate();
  const { addItem, updateItem, deleteItem, warehouses } = useInventory();
  const { companyConfig, notify } = useAuth();
  const currencySymbol = companyConfig?.currencySymbol || currencyService.getCurrency(currencyService.getBaseCurrency())?.symbol || '$';

  const {
    allItems, loading, search, setSearch,
    filters, setFilter, resetFilters,
    categories, brands, warehouses: warehouseIds,
    filterPresets, savePreset, loadPreset, deletePreset,
    sortKey, sortDir, toggleSort,
    page, setPage, pageSize, setPageSize,
    safePage, totalPages, paginatedItems, filteredItems,
    selectedIds, toggleSelect, toggleSelectAll, clearSelection,
    refresh,
  } = useInventoryList();

  const [activeTab, setActiveTab] = useState<TabKey>('dashboard');
  const [tabSearch, setTabSearch] = useState<string>('');

  const [isAdjustModalOpen, setIsAdjustModalOpen] = useState(false);
  const [adjustingItem, setAdjustingItem] = useState<Item | null>(null);
  const [openActionMenu, setOpenActionMenu] = useState<{ id: string; anchor?: DOMRect } | null>(null);

  const [isBulkEditOpen, setIsBulkEditOpen] = useState(false);
  const [isAssignOpen, setIsAssignOpen] = useState(false);
  const [assignMode, setAssignMode] = useState<'warehouse' | 'supplier'>('warehouse');
  const [isPrintOpen, setIsPrintOpen] = useState(false);
  const [printMode, setPrintMode] = useState<'barcode' | 'qrcode' | 'label'>('label');
  const [isSmartAdjustOpen, setIsSmartAdjustOpen] = useState(false);
  const [isInsightsOpen, setIsInsightsOpen] = useState(false);
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());

  const [confirmState, setConfirmState] = useState<{ open: boolean; title: string; message: string; confirmText?: string; type?: ConfirmDialogType; onConfirm?: () => void }>({ open: false, title: '', message: '' });

  const toggleExpand = useCallback((id: string) => {
    setExpandedItems(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const selectedItems = useMemo(() => allItems.filter(i => selectedIds.has(i.id)), [allItems, selectedIds]);

  const handleTabSelectAll = useCallback((items: Item[]) => {
    const allSelected = items.length > 0 && items.every(i => selectedIds.has(i.id));
    if (allSelected) {
      items.forEach(i => { if (selectedIds.has(i.id)) toggleSelect(i.id); });
    } else {
      items.forEach(i => { if (!selectedIds.has(i.id)) toggleSelect(i.id); });
    }
  }, [selectedIds, toggleSelect]);

  const handleBulkDelete = useCallback(async () => {
    setConfirmState({
      open: true,
      title: 'Delete Items',
      message: `Delete ${selectedItems.length} item(s)? This cannot be undone.`,
      type: 'danger',
      confirmText: 'Delete',
      onConfirm: async () => {
        try {
          await Promise.all(selectedItems.map(i => deleteItem(i.id)));
          notify?.(`${selectedItems.length} item(s) deleted`, 'success');
          clearSelection();
          refresh();
        } catch (error: any) {
          notify?.(`Delete failed: ${error?.message || 'Unknown error'}`, 'error');
        }
      }
    });
  }, [selectedItems, deleteItem, notify, clearSelection, refresh]);

  const handleBulkArchive = useCallback(async () => {
    setConfirmState({
      open: true,
      title: 'Archive Items',
      message: `Archive ${selectedItems.length} item(s)?`,
      type: 'warning',
      confirmText: 'Archive',
      onConfirm: async () => {
        try {
          await Promise.all(selectedItems.map(i => updateItem({ ...i, status: 'Inactive' })));
          notify?.(`${selectedItems.length} item(s) archived`, 'success');
          clearSelection();
          refresh();
        } catch (error: any) {
          notify?.(`Archive failed: ${error?.message || 'Unknown error'}`, 'error');
        }
      }
    });
  }, [selectedItems, updateItem, notify, clearSelection, refresh]);

  const handleBulkActivate = useCallback(async () => {
    try {
      await Promise.all(selectedItems.map(i => updateItem({ ...i, status: 'Active' })));
      notify?.(`${selectedItems.length} item(s) activated`, 'success');
      clearSelection();
      refresh();
    } catch (error: any) {
      notify?.(`Activate failed: ${error?.message || 'Unknown error'}`, 'error');
    }
  }, [selectedItems, updateItem, notify, clearSelection, refresh]);

  const handleBulkDeactivate = useCallback(async () => {
    setConfirmState({
      open: true,
      title: 'Deactivate Items',
      message: `Deactivate ${selectedItems.length} item(s)?`,
      type: 'warning',
      confirmText: 'Deactivate',
      onConfirm: async () => {
        try {
          await Promise.all(selectedItems.map(i => updateItem({ ...i, status: 'Inactive' })));
          notify?.(`${selectedItems.length} item(s) deactivated`, 'success');
          clearSelection();
          refresh();
        } catch (error: any) {
          notify?.(`Deactivate failed: ${error?.message || 'Unknown error'}`, 'error');
        }
      }
    });
  }, [selectedItems, updateItem, notify, clearSelection, refresh]);

  const handleExportSelected = useCallback(() => {
    if (selectedItems.length === 0) return;
    const headers = ['Name', 'SKU', 'Type', 'Status', 'Stock', 'Cost Price', 'Selling Price', 'Category', 'Brand'];
    const rows = selectedItems.map(i => [
      i.name, i.sku || '', i.type || '', i.status || 'Active',
      String(i.stock || 0), String(i.costPrice || i.cost || 0),
      String(i.sellingPrice || i.price || 0), i.category || '', i.brand || '',
    ]);
    const csv = [headers, ...rows].map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `inventory-export-${getDefaultDate()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    notify?.(`Exported ${selectedItems.length} item(s)`, 'success');
  }, [selectedItems, notify]);

  useEffect(() => {
    const handleClickOutside = () => {
      if (openActionMenu) setOpenActionMenu(null);
    };
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, [openActionMenu]);

  const typeForTab: Record<string, string> = {
    raw: 'Raw Material',
    product: 'Product',
    stationery: 'Stationery',
    printing: 'Service',
  };

const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<Item | null>(null);
  const [modalSourceTab, setModalSourceTab] = useState<string | null>(null);

  const handleNewItem = useCallback((tabType?: string) => {
    setEditingItem(null);
    setModalSourceTab(tabType || null);
    setIsModalOpen(true);
  }, []);

  const handleEditItem = useCallback((item: Item) => {
    setEditingItem(item);
    if (item.type === 'Service' || (item as any).classification === 'printing_service') setModalSourceTab('printing');
    else if (item.type === 'Product' || (item as any).classification === 'product') setModalSourceTab('product');
    else if (item.type === 'Stationery' || (item as any).classification === 'stationery') setModalSourceTab('stationery');
    else setModalSourceTab('raw');
    setIsModalOpen(true);
  }, []);

  const handleSaveItem = useCallback(async (savedItem: Item) => {
    try {
      const isUpdate = !!savedItem.id;
      if (isUpdate) {
        await updateItem(savedItem);
        notify?.('Item updated successfully', 'success');
      } else {
        await addItem(savedItem);
        notify?.('Item created successfully', 'success');
      }
      refresh();
      setIsModalOpen(false);
      setEditingItem(null);
    } catch (error: any) {
      notify?.(`Save failed: ${error?.message || 'Unknown error'}`, 'error');
    }
  }, [updateItem, addItem, notify, refresh]);

  const handleViewItem = useCallback((item: Item) => {
    navigate(`/supply-chain/inventory/${item.id}`);
  }, [navigate]);

const handleProduce = useCallback((item: Item) => {
    setActiveTab('dashboard');
  }, [setActiveTab]);

  const toggleActionMenu = useCallback((id: string, e?: React.MouseEvent<HTMLButtonElement>) => {
    // Capture the trigger button's rect so the menu can be rendered with fixed
    // positioning (the .pp-panel overflow:hidden would otherwise clip/overlap it).
    setOpenActionMenu(prev =>
      prev && prev.id === id
        ? null
        : { id, anchor: e?.currentTarget.getBoundingClientRect() }
    );
  }, []);

  const closeActionMenu = useCallback(() => {
    setOpenActionMenu(null);
  }, []);

  const handleDuplicate = useCallback(async (item: Item) => {
    const dup = {
      ...item,
      id: '',
      name: `${item.name} (Copy)`,
      sku: item.sku ? `${item.sku}-COPY` : '',
    };
    setEditingItem(dup as Item);
    setIsModalOpen(true);
  }, []);

  const handleOpenAdjustStock = useCallback((item: Item) => {
    setAdjustingItem(item);
    setIsAdjustModalOpen(true);
  }, []);

  const handleTransferStock = useCallback((item: Item) => {
    navigate(`/supply-chain/inventory/${item.id}?tab=warehouses`);
  }, [navigate]);

  const handleToggleStatus = useCallback(async (item: Item) => {
    const newStatus = item.status === 'Active' ? 'Inactive' : 'Active';
    setConfirmState({
      open: true,
      title: newStatus === 'Inactive' ? 'Archive Item' : 'Activate Item',
      message: `${newStatus === 'Inactive' ? 'Archive' : 'Activate'} "${item.name}"?`,
      type: 'question',
      confirmText: newStatus === 'Inactive' ? 'Archive' : 'Activate',
      onConfirm: async () => {
        try {
          await updateItem({ ...item, status: newStatus });
          notify?.(`${item.name} ${newStatus === 'Inactive' ? 'archived' : 'activated'}`, 'success');
          refresh();
        } catch (error: any) {
          notify?.(`Failed to update status: ${error?.message || 'Unknown error'}`, 'error');
        }
      }
    });
  }, [updateItem, notify, refresh]);

  const handlePrintBarcode = useCallback((item: Item) => {
    navigate(`/internal-tools/barcodes?item=${encodeURIComponent(item.id)}`);
  }, [navigate]);

  const handlePrintQR = useCallback((item: Item) => {
    const win = window.open('', '_blank');
    if (!win) { notify?.('Popup blocked. Allow popups for this site.', 'error'); return; }
    const sp = item.sellingPrice || item.price || 0;
    win.document.write(`<!DOCTYPE html><html><head><title>QR - ${esc(item.name)}</title><style>body{font-family:system-ui,-apple-system,sans-serif;padding:24px;text-align:center;background:#f8fafc}.label{background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:20px;margin:12px auto;display:inline-block;box-shadow:0 4px 12px rgba(0,0,0,.08)}.name{font-weight:700;font-size:14px;color:#0f172a;margin-bottom:8px}.qr-grid{display:grid;grid-template-columns:repeat(11,8px);grid-template-rows:repeat(11,8px);gap:1px;justify-content:center;margin:12px 0}.cell{background:#fff;border-radius:1px}.cell.dark{background:#0f172a}.meta{font-size:10px;color:#64748b;font-family:'Courier New',monospace;margin-top:6px}</style></head><body><div class="label"><div class="name">${esc(item.name)}</div><div class="qr-grid">${Array.from({length:121},(_,i)=>{const r=Math.floor(i/11),c=i%11;return r===0||r===10||c===0||c===10||(r>=2&&r<=4&&c>=2&&c<=4)||(r>=2&&r<=4&&c>=7&&c<=9)||(r>=7&&r<=9&&c>=2&&c<=4)||(r===7&&c>=7&&c<=8)||(r===8&&c>=7&&c<=9)||(r===9&&c===8)||(r===5&&c===5)?'<div class="cell dark"></div>':'<div class="cell"></div>';}).join('')}</div><div class="meta">${esc(item.sku || 'N/A')}${sp>0 ? ` · ${'MK ' + sp.toFixed(2)}` : ''}</div></div><script>window.print()</script></body></html>`);
    win.document.close();
  }, [notify]);

  const handleDeleteItem = useCallback(async (item: Item) => {
    setConfirmState({
      open: true,
      title: 'Delete Item',
      message: `Delete "${item.name}"?`,
      type: 'danger',
      confirmText: 'Delete',
      onConfirm: async () => {
        try {
          await deleteItem(item.id);
          notify?.('Item deleted', 'success');
          refresh();
          clearSelection();
        } catch (error: any) {
          notify?.(`Delete failed: ${error?.message || 'Unknown error'}`, 'error');
        }
      }
    });
  }, [deleteItem, notify, refresh, clearSelection]);

  // Build all items rows for InventoryTable on dashboard
  const availableColumns = ['Name', 'SKU', 'Classification', 'Status', 'Stock', 'Base Unit', 'Cost Price', 'Selling Price', 'Markup'];

  // Derived tab data
  const sortByName = (a: Item, b: Item) => (a.name || '').localeCompare(b.name || '');
  const rawMaterials = useMemo(() => allItems.filter(i => (i.type || i.classification) === 'Raw Material').sort(sortByName), [allItems]);
  const products = useMemo(() => allItems.filter(i => (i.type || i.classification) === 'Product').sort(sortByName), [allItems]);
  const stationery = useMemo(() => allItems.filter(i => (i.type || i.classification) === 'Stationery').sort(sortByName), [allItems]);
  const printingServices = useMemo(() => allItems.filter(i => (i.type || i.classification) === 'Service' || (i as Record<string, unknown>).classification === 'Printing Service').sort(sortByName), [allItems]);

  const lowStock = useCallback((item: Item) => {
    return item.reorderPoint != null && Number(item.stock) <= Number(item.reorderPoint);
  }, []);

  const adjustStock = useCallback(async (item: Item, delta: number) => {
    const updated = { ...item, stock: Math.max(0, num(item.stock) + delta) };
    try {
      await updateItem(updated);
      refresh();
    } catch { /* ignore */ }
  }, [updateItem, refresh]);

  const deleteSimple = useCallback(async (item: Item) => {
    setConfirmState({
      open: true,
      title: 'Delete Item',
      message: `Delete "${item.name}"?`,
      type: 'danger',
      confirmText: 'Delete',
      onConfirm: async () => {
        try {
          await deleteItem(item.id);
          refresh();
        } catch { /* ignore */ }
      }
    });
  }, [deleteItem, refresh]);

  if (loading) {
    return (
      <div className="h-full flex flex-col overflow-hidden" style={{ background: '#F3F0EC' }}>
        <div className="flex items-center justify-center py-20 flex-1">
          <Loader2 size={32} className="animate-spin text-slate-300" />
        </div>
      </div>
    );
  }

  if (allItems.length === 0) {
    return (
      <div className="h-full flex flex-col overflow-hidden" style={{ background: '#F3F0EC' }}>
        <div className="flex-1 overflow-y-auto p-4 md:p-6 max-w-[1600px] mx-auto w-full">
          <EmptyState type="no_items" onNewItem={handleNewItem} />
        </div>
      </div>
    );
  }

  const filteredForTab = activeTab === 'raw' ? rawMaterials
    : activeTab === 'product' ? products
    : activeTab === 'stationery' ? stationery
    : activeTab === 'printing' ? printingServices
    : allItems;

  const searchFiltered = filteredForTab.filter(i => {
    const q = tabSearch.toLowerCase();
    if (!q) return true;
    return (i.name || '').toLowerCase().includes(q) || (i.sku || '').toLowerCase().includes(q);
  });

  return (
    <div className="h-full flex flex-col overflow-hidden" style={{ background: '#F3F0EC' }}>
      <div className="flex-1 overflow-y-auto custom-scrollbar">
        <div className="inventory-module">
          {/* Module head */}
          <div className="module-head">
            <div className="eyebrow">Inventory Management</div>
            <h1 className="module-title">Inventory</h1>
          </div>

          {/* Tabs */}
          <div className="dash-tabs">
            {([
              { key: 'dashboard', label: 'Overview', icon: LayoutDashboard },
              { key: 'raw', label: 'Raw Materials', icon: Boxes },
              { key: 'product', label: 'Products', icon: Package },
              { key: 'stationery', label: 'Stationery', icon: PenTool },
              { key: 'printing', label: 'Printing Service', icon: Printer },
            ] as const).map(({ key, label, icon: Icon }) => (
              <button key={key} className={`dash-tab ${activeTab === key ? 'active' : ''}`}
                onClick={() => setActiveTab(key as TabKey)}>
                <Icon size={15} strokeWidth={2.2} />
                <span>{label}</span>
              </button>
            ))}
          </div>

          {/* Filter & Search row */}
          <div className="flex items-center gap-2 mb-3">
            <FilterPanel
              filters={filters}
              onSetFilter={setFilter}
              onReset={resetFilters}
              presets={filterPresets}
              onSavePreset={savePreset}
              onLoadPreset={loadPreset}
              onDeletePreset={deletePreset}
              categories={categories}
              brands={brands}
              warehouses={warehouseIds}
            />
            <div className="flex gap-2 ml-auto">
              <button
                type="button"
                onClick={() => setIsSmartAdjustOpen(true)}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold text-indigo-700 bg-indigo-50 border border-indigo-200 hover:bg-indigo-100 transition-all"
              >
                <Sparkles size={14} />
                Smart Adjust
              </button>
              <button
                type="button"
                onClick={() => setIsInsightsOpen(true)}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 hover:bg-emerald-100 transition-all"
              >
                <BrainCircuit size={14} />
                AI Insights
              </button>
            </div>
          </div>

          {/* ============ DASHBOARD ============ */}
          {activeTab === 'dashboard' && (
            <InventoryDashboard allItems={allItems} warehouses={warehouses} onViewItem={handleViewItem} />
          )}

          {/* ============ RAW MATERIALS ============ */}
          {activeTab === 'raw' && (
            <>
              <div className="page-head">
                <div>
                  <div className="eyebrow">Inputs &middot; Not For Sale</div>
                  <h1 className="pp">Raw Materials</h1>
                </div>
                <button className="pp-btn pp-btn-primary" onClick={() => handleNewItem(activeTab)}>
                   + Add Raw Material
                 </button>
              </div>
              <BulkActionToolbar
                selectedCount={selectedIds.size}
                onBulkEdit={() => setIsBulkEditOpen(true)}
                onAssignWarehouse={() => { setAssignMode('warehouse'); setIsAssignOpen(true); }}
                onAssignSupplier={() => { setAssignMode('supplier'); setIsAssignOpen(true); }}
                onPrintLabels={() => { setPrintMode('label'); setIsPrintOpen(true); }}
                onExportSelected={handleExportSelected}
                onArchive={handleBulkArchive}
                onActivate={handleBulkActivate}
                onDeactivate={handleBulkDeactivate}
                onGenerateBarcodes={() => { setPrintMode('barcode'); setIsPrintOpen(true); }}
                onGenerateQRCodes={() => { setPrintMode('qrcode'); setIsPrintOpen(true); }}
                onStockAdjust={() => { if (selectedItems.length > 0) { setAdjustingItem(selectedItems[0]); setIsAdjustModalOpen(true); } }}
                onDelete={handleBulkDelete}
                onClear={clearSelection}
              />
              <div className="pp-panel">
                <div className="pp-panel-head">
                  <h2 className="pp">Raw Materials List</h2>
                  <div className="flex items-center gap-3">
                    <input className="pp-search" placeholder="Search raw materials..."
                      value={tabSearch} onChange={e => setTabSearch(e.target.value)} style={{marginBottom:0}} />
                    <span className="pp-muted">{searchFiltered.length} item(s)</span>
                  </div>
                </div>
                {searchFiltered.length === 0 ? (
                  <div className="pp-empty">No raw materials yet.</div>
                ) : (
                  <table className="pp-table">
                    <thead>
                      <tr>
                        <th className="w-10 px-1 text-center">
                          <input type="checkbox" checked={searchFiltered.length > 0 && searchFiltered.every(i => selectedIds.has(i.id))}
                            onChange={() => handleTabSelectAll(searchFiltered)}
                            className="rounded border-slate-300 text-blue-600 focus:ring-blue-500" />
                        </th>
                        <th>SKU</th><th>Name</th><th>Unit</th><th className="num">Cost / Unit</th><th className="num">Stock</th><th className="num">Reorder At</th><th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {searchFiltered.map((m, idx) => (
                        <tr key={`${m.id}-${idx}`} className={lowStock(m) ? 'pp-row-warn' : ''} onClick={() => handleViewItem(m)} style={{cursor:'pointer'}}>
                          <td className="table-body-cell w-10 px-1 text-center" onClick={e => e.stopPropagation()}>
                            <input type="checkbox" checked={selectedIds.has(m.id)} onChange={() => toggleSelect(m.id)}
                              className="rounded border-slate-300 text-blue-600 focus:ring-blue-500" />
                          </td>
                          <td className="mono" style={{fontFamily:'IBM Plex Mono,monospace', fontSize:10, color:'#64748B'}}>{esc(m.sku)}</td>
                          <td>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              {esc(m.name)}
                              {(m as any).rawBomCategory ? (
                                <span className="inline-flex px-[7px] py-[2px] rounded-[99px] text-[11px]" style={{
                                  background: BOM_CATEGORY_COLORS[(m as any).rawBomCategory]?.bg || '#F1F5F9',
                                  color: BOM_CATEGORY_COLORS[(m as any).rawBomCategory]?.text || '#475569',
                                }}>
                                  {(m as any).rawBomCategory}
                                </span>
                              ) : null}
                            </div>
                            {(m as Record<string, unknown>).supplierName ? <div className="pp-sub">{esc((m as Record<string, unknown>).supplierName)}</div> : ''}
                          </td>
                          <td className="mono" style={{ fontFamily:'IBM Plex Mono,monospace' }}>{esc(m.unit || 'pcs')}</td>
                          <td className="num mono" style={{ fontFamily:"'Inter',sans-serif", fontVariantNumeric:'tabular-nums', fontWeight:600 }}>{money(m.costPrice || m.cost || 0, currencySymbol)}</td>
                          <td className="num mono" style={{ fontFamily:'IBM Plex Mono,monospace' }}>
                            <span className="pp-stepper">
                              <button onClick={e => { e.stopPropagation(); adjustStock(m, -1); }}>&minus;</button>
                              <span>{esc(m.stock)}</span>
                              <button onClick={e => { e.stopPropagation(); adjustStock(m, 1); }}>+</button>
                            </span>
                          </td>
                          <td className="num mono" style={{ fontFamily:'IBM Plex Mono,monospace' }}>
                            {m.reorderPoint != null ? esc(m.reorderPoint) : '\u2014'}
                          </td>
                          <td className="actions" onClick={e => e.stopPropagation()}>
                            <div className="action-dropdown-container">
                              <button className="action-menu-btn" onClick={(e) => toggleActionMenu(m.id, e)}>
                                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                                  <circle cx="8" cy="3" r="1.5" fill="currentColor"/>
                                  <circle cx="8" cy="8" r="1.5" fill="currentColor"/>
                                  <circle cx="8" cy="13" r="1.5" fill="currentColor"/>
                                </svg>
                              </button>
                              {openActionMenu?.id === m.id && (
                                <div className="action-dropdown-menu" style={getFloatingMenuStyle(openActionMenu?.anchor, { minWidth: 220, estimatedHeight: 380 })}>
                                  <button className="action-dropdown-item" onClick={() => { handleEditItem(m); closeActionMenu(); }}>
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                                    Edit
                                  </button>
                                  <button className="action-dropdown-item" onClick={() => { handleDuplicate(m); closeActionMenu(); }}>
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                                    Duplicate
                                  </button>
                                  <button className="action-dropdown-item" onClick={() => { handleViewItem(m); closeActionMenu(); }}>
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                                    View Details
                                  </button>
                                  <div className="action-dropdown-divider"></div>
                                  <button className="action-dropdown-item" onClick={() => { handleOpenAdjustStock(m); closeActionMenu(); }}>
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
                                    Adjust Stock
                                  </button>
                                  <button className="action-dropdown-item" onClick={() => { handleTransferStock(m); closeActionMenu(); }}>
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>
                                    Transfer Stock
                                  </button>
                                  <div className="action-dropdown-divider"></div>
                                  <button className="action-dropdown-item" onClick={() => { handlePrintBarcode(m); closeActionMenu(); }}>
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M2 15h20"/><path d="M4 15v5a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-5"/><rect x="7" y="9" width="2" height="6"/><rect x="11" y="9" width="2" height="6"/><rect x="15" y="9" width="2" height="6"/></svg>
                                    Print Barcode
                                  </button>
                                  <button className="action-dropdown-item" onClick={() => { handlePrintQR(m); closeActionMenu(); }}>
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="2" width="8" height="8"/><rect x="14" y="2" width="8" height="8"/><rect x="2" y="14" width="8" height="8"/><line x1="14" y1="14" x2="18" y2="14"/><line x1="18" y1="18" x2="18" y2="22"/><line x1="14" y1="22" x2="16" y2="22"/></svg>
                                    Print QR
                                  </button>
                                  <div className="action-dropdown-divider"></div>
                                  <button className="action-dropdown-item" onClick={() => { handleToggleStatus(m); closeActionMenu(); }}>
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
                                    {m.status === 'Active' ? 'Archive' : 'Activate'}
                                  </button>
                                  <div className="action-dropdown-divider"></div>
                                  <button className="action-dropdown-item danger" onClick={() => { deleteSimple(m); closeActionMenu(); }}>
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                                    Delete
                                  </button>
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="pp-totals-row">
                        <td></td>
                        <td>Total ({searchFiltered.length} items)</td>
                        <td></td>
                        <td className="num mono" style={{fontFamily:"'Inter',sans-serif", fontVariantNumeric:'tabular-nums', fontWeight:600}}>{money(searchFiltered.reduce((s,i) => s + (i.costPrice || i.cost || 0), 0), currencySymbol)}</td>
                        <td className="num mono" style={{fontFamily:'IBM Plex Mono,monospace'}}>{searchFiltered.reduce((s,i) => s + num(i.stock), 0)}</td>
                        <td></td>
                        <td></td>
                      </tr>
                    </tfoot>
                  </table>
                )}
              </div>
            </>
          )}

          {/* ============ PRODUCTS ============ */}
          {activeTab === 'product' && (
            <>
              <div className="page-head">
                <div>
                  <div className="eyebrow">Made From Bill Of Materials</div>
                  <h1 className="pp">Products</h1>
                </div>
                <button className="pp-btn pp-btn-primary" onClick={() => handleNewItem('product')}>+ Add Product</button>
              </div>
              <BulkActionToolbar
                selectedCount={selectedIds.size}
                onBulkEdit={() => setIsBulkEditOpen(true)}
                onAssignWarehouse={() => { setAssignMode('warehouse'); setIsAssignOpen(true); }}
                onAssignSupplier={() => { setAssignMode('supplier'); setIsAssignOpen(true); }}
                onPrintLabels={() => { setPrintMode('label'); setIsPrintOpen(true); }}
                onExportSelected={handleExportSelected}
                onArchive={handleBulkArchive}
                onActivate={handleBulkActivate}
                onDeactivate={handleBulkDeactivate}
                onGenerateBarcodes={() => { setPrintMode('barcode'); setIsPrintOpen(true); }}
                onGenerateQRCodes={() => { setPrintMode('qrcode'); setIsPrintOpen(true); }}
                onStockAdjust={() => { if (selectedItems.length > 0) { setAdjustingItem(selectedItems[0]); setIsAdjustModalOpen(true); } }}
                onDelete={handleBulkDelete}
                onClear={clearSelection}
              />
              <div className="pp-panel">
                <div className="pp-panel-head">
                <h2 className="pp">Products List</h2>
                  <div className="flex items-center gap-3">
                    <input className="pp-search" placeholder="Search products..." value={tabSearch}
                      onChange={e => setTabSearch(e.target.value)} style={{marginBottom:0}} />
                    <span className="pp-muted">{searchFiltered.length} item(s)</span>
                  </div>
                </div>
                {searchFiltered.length === 0 ? (
                  <div className="pp-empty">No products yet.</div>
                ) : (
                  <table className="pp-table">
                    <thead>
                      <tr>
                        <th className="w-10 px-1 text-center">
                          <input type="checkbox" checked={searchFiltered.length > 0 && searchFiltered.every(i => selectedIds.has(i.id))}
                            onChange={() => handleTabSelectAll(searchFiltered)}
                            className="rounded border-slate-300 text-blue-600 focus:ring-blue-500" />
                        </th>
                        <th>SKU</th><th>Product</th><th>Variants</th><th className="num">Cost Price</th><th className="num">Selling Price</th><th className="num">Margin</th><th className="num">Stock</th><th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {searchFiltered.map((p) => {
                        const variants = ((p as any).variants || []).filter((v: unknown) => v && typeof v === 'object' && Object.keys(v as object).length > 0);
                        const hasVariants = variants.length > 0;
                        const isExpanded = expandedItems.has(p.id);
                        const parentCp = p.costPrice || p.cost || 0;
                        const parentSp = p.sellingPrice || p.price || 0;
                        const parentMargin = parentCp > 0 ? ((parentSp - parentCp) / parentCp * 100).toFixed(1) : '0.0';
                        const parentLow = lowStock(p);
                        const isMenuOpen = openActionMenu?.id === p.id;
                        const parentStockTotal = hasVariants ? variants.reduce((s: number, v: any) => s + num(v.stock), 0) : num(p.stock);
                        const variantLabel = hasVariants ? `${variants.length} variant${variants.length !== 1 ? 's' : ''}` : 'standard';
                        return (
                          <React.Fragment key={p.id}>
                            <tr className={parentLow ? 'pp-row-warn' : ''} onClick={() => handleViewItem(p)} style={{cursor:'pointer'}}>
                              <td className="table-body-cell w-10 px-1 text-center" onClick={e => e.stopPropagation()}>
                                <input type="checkbox" checked={selectedIds.has(p.id)} onChange={() => toggleSelect(p.id)}
                                  className="rounded border-slate-300 text-blue-600 focus:ring-blue-500" />
                              </td>
                              <td className="mono" style={{fontFamily:'IBM Plex Mono,monospace', fontSize:10, color:'#64748B'}}>
                                {hasVariants && (
                                  <button onClick={e => { e.stopPropagation(); toggleExpand(p.id); }} className="mr-1 text-slate-400 hover:text-slate-600 transition-colors" style={{background:'none', border:'none', cursor:'pointer', padding:0, verticalAlign:'middle'}}>
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{transform: isExpanded ? 'rotate(90deg)' : 'none', transition:'transform .15s'}}><polyline points="9 18 15 12 9 6"/></svg>
                                  </button>
                                )}
                                {esc(p.sku)}
                              </td>
                              <td>{esc(p.name)}</td>
                              <td>{variantLabel}</td>
                              <td className="num mono" style={{fontFamily:"'Inter',sans-serif", fontVariantNumeric:'tabular-nums', fontWeight:600}}>{money(parentCp, currencySymbol)}</td>
                              <td className="num mono" style={{fontFamily:"'Inter',sans-serif", fontVariantNumeric:'tabular-nums', fontWeight:600}}>{money(parentSp, currencySymbol)}</td>
                              <td className={`num mono ${Number(parentMargin) >= resolveMinimumMarkup(p) ? 'pp-pos' : 'pp-neg'}`} style={{fontFamily:'IBM Plex Mono,monospace'}}>{parentMargin}%</td>
                              <td className="num mono" style={{fontFamily:'IBM Plex Mono,monospace'}}>
                                <span className="pp-stepper">
                                  <button onClick={e => { e.stopPropagation(); adjustStock(p, -1); }}>&minus;</button>
                                  <span>{parentStockTotal}</span>
                                  <button onClick={e => { e.stopPropagation(); adjustStock(p, 1); }}>+</button>
                                </span>
                              </td>
                              <td className="actions" onClick={e => e.stopPropagation()}>
                                <div className="action-dropdown-container">
                                  <button className="action-menu-btn" onClick={(e) => toggleActionMenu(p.id, e)}>
                                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                                      <circle cx="8" cy="3" r="1.5" fill="currentColor"/>
                                      <circle cx="8" cy="8" r="1.5" fill="currentColor"/>
                                      <circle cx="8" cy="13" r="1.5" fill="currentColor"/>
                                    </svg>
                                  </button>
                                  {isMenuOpen && (
                                    <div className="action-dropdown-menu" style={getFloatingMenuStyle(openActionMenu?.anchor, { minWidth: 220, estimatedHeight: 380 })}>
                                      <button className="action-dropdown-item" onClick={() => { handleEditItem(p); closeActionMenu(); }}>
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                                        Edit
                                      </button>
                                      <button className="action-dropdown-item" onClick={() => { handleDuplicate(p); closeActionMenu(); }}>
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                                        Duplicate
                                      </button>
<button className="action-dropdown-item" onClick={() => { handleProduce(p); closeActionMenu(); }}>
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>
                                        Produce
                                      </button>
                                      <button className="action-dropdown-item" onClick={() => { handleViewItem(p); closeActionMenu(); }}>
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                                        View Details
                                      </button>
                                      <div className="action-dropdown-divider"></div>
                                      <button className="action-dropdown-item" onClick={() => { handleOpenAdjustStock(p); closeActionMenu(); }}>
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
                                        Adjust Stock
                                      </button>
                                      <button className="action-dropdown-item" onClick={() => { handleTransferStock(p); closeActionMenu(); }}>
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>
                                        Transfer Stock
                                      </button>
                                      <div className="action-dropdown-divider"></div>
                                      <button className="action-dropdown-item" onClick={() => { handlePrintBarcode(p); closeActionMenu(); }}>
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M2 15h20"/><path d="M4 15v5a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-5"/><rect x="7" y="9" width="2" height="6"/><rect x="11" y="9" width="2" height="6"/><rect x="15" y="9" width="2" height="6"/></svg>
                                        Print Barcode
                                      </button>
                                      <button className="action-dropdown-item" onClick={() => { handlePrintQR(p); closeActionMenu(); }}>
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="2" width="8" height="8"/><rect x="14" y="2" width="8" height="8"/><rect x="2" y="14" width="8" height="8"/><line x1="14" y1="14" x2="18" y2="14"/><line x1="18" y1="18" x2="18" y2="22"/><line x1="14" y1="22" x2="16" y2="22"/></svg>
                                        Print QR
                                      </button>
                                      <div className="action-dropdown-divider"></div>
                                      <button className="action-dropdown-item" onClick={() => { handleToggleStatus(p); closeActionMenu(); }}>
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
                                        {p.status === 'Active' ? 'Archive' : 'Activate'}
                                      </button>
                                      <div className="action-dropdown-divider"></div>
                                      <button className="action-dropdown-item danger" onClick={() => { deleteSimple(p); closeActionMenu(); }}>
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                                        Delete
                                      </button>
                                    </div>
                                  )}
                                </div>
                              </td>
                            </tr>
                            {hasVariants && isExpanded && variants.map((v: any, vIdx: number) => {
                              const vCp = v.costPrice || v.basePrice || p.costPrice || p.cost || 0;
                              const vSp = v.sellingPrice || p.sellingPrice || p.price || 0;
                              const vMargin = vCp > 0 ? ((vSp - vCp) / vCp * 100).toFixed(1) : '0.0';
                              return (
                                <tr key={`${p.id}-v-${vIdx}`} className="pp-variant-row" onClick={() => handleViewItem(p)} style={{cursor:'pointer', background:'#F8FAFC'}}>
                                  <td></td>
                                  <td></td>
                                  <td className="text-xs text-slate-500 pl-6">↳ {esc(v.name || 'Standard')}</td>
                                  <td></td>
                                  <td className="num mono text-xs" style={{fontFamily:"'Inter',sans-serif", fontVariantNumeric:'tabular-nums', fontWeight:600}}>{money(vCp, currencySymbol)}</td>
                                  <td className="num mono text-xs" style={{fontFamily:"'Inter',sans-serif", fontVariantNumeric:'tabular-nums', fontWeight:600}}>{money(vSp, currencySymbol)}</td>
                                  <td className={`num mono text-xs ${Number(vMargin) >= resolveMinimumMarkup(p) ? 'pp-pos' : 'pp-neg'}`} style={{fontFamily:'IBM Plex Mono,monospace'}}>{vMargin}%</td>
                                  <td className="num mono text-xs" style={{fontFamily:'IBM Plex Mono,monospace'}}>
                                    <span className="pp-stepper" style={{fontSize:12}}>
                                      <button onClick={e => { e.stopPropagation(); adjustStock({...p, stock: v.stock, id: v.id || p.id}, -1); }}>&minus;</button>
                                      <span>{esc(v.stock ?? 0)}</span>
                                      <button onClick={e => { e.stopPropagation(); adjustStock({...p, stock: v.stock, id: v.id || p.id}, 1); }}>+</button>
                                    </span>
                                  </td>
                                  <td></td>
                                </tr>
                              );
                            })}
                          </React.Fragment>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr className="pp-totals-row">
                        <td></td>
                        <td>Total ({searchFiltered.length} items)</td>
                        <td></td>
                        <td></td>
                        <td className="num mono" style={{fontFamily:"'Inter',sans-serif", fontVariantNumeric:'tabular-nums', fontWeight:600}}>{money(searchFiltered.reduce((s,i) => s + (i.costPrice || i.cost || 0), 0), currencySymbol)}</td>
                        <td className="num mono" style={{fontFamily:"'Inter',sans-serif", fontVariantNumeric:'tabular-nums', fontWeight:600}}>{money(searchFiltered.reduce((s,i) => s + (i.sellingPrice || i.price || 0), 0), currencySymbol)}</td>
                        <td></td>
                        <td className="num mono" style={{fontFamily:'IBM Plex Mono,monospace'}}>{searchFiltered.reduce((s,i) => s + num(i.stock), 0)}</td>
                        <td></td>
                      </tr>
                    </tfoot>
                  </table>
                )}
              </div>
            </>
          )}

          {/* ============ STATIONERY ============ */}
          {activeTab === 'stationery' && (
            <>
              <div className="page-head">
                <div>
                  <div className="eyebrow">Manual Pricing</div>
                  <h1 className="pp">Stationery</h1>
                </div>
                <button className="pp-btn pp-btn-primary" onClick={() => handleNewItem('stationery')}>+ Add Stationery</button>
              </div>
              <BulkActionToolbar
                selectedCount={selectedIds.size}
                onBulkEdit={() => setIsBulkEditOpen(true)}
                onAssignWarehouse={() => { setAssignMode('warehouse'); setIsAssignOpen(true); }}
                onAssignSupplier={() => { setAssignMode('supplier'); setIsAssignOpen(true); }}
                onPrintLabels={() => { setPrintMode('label'); setIsPrintOpen(true); }}
                onExportSelected={handleExportSelected}
                onArchive={handleBulkArchive}
                onActivate={handleBulkActivate}
                onDeactivate={handleBulkDeactivate}
                onGenerateBarcodes={() => { setPrintMode('barcode'); setIsPrintOpen(true); }}
                onGenerateQRCodes={() => { setPrintMode('qrcode'); setIsPrintOpen(true); }}
                onStockAdjust={() => { if (selectedItems.length > 0) { setAdjustingItem(selectedItems[0]); setIsAdjustModalOpen(true); } }}
                onDelete={handleBulkDelete}
                onClear={clearSelection}
              />
              <div className="pp-panel">
                <div className="pp-panel-head">
                <h2 className="pp">Stationery List</h2>
                  <div className="flex items-center gap-3">
                    <input className="pp-search" placeholder="Search stationery..." value={tabSearch}
                      onChange={e => setTabSearch(e.target.value)} style={{marginBottom:0}} />
                    <span className="pp-muted">{searchFiltered.length} item(s)</span>
                  </div>
                </div>
                {searchFiltered.length === 0 ? (
                  <div className="pp-empty">No stationery items yet.</div>
                ) : (
                  <table className="pp-table">
                    <thead>
                      <tr>
                        <th className="w-10 px-1 text-center">
                          <input type="checkbox" checked={searchFiltered.length > 0 && searchFiltered.every(i => selectedIds.has(i.id))}
                            onChange={() => handleTabSelectAll(searchFiltered)}
                            className="rounded border-slate-300 text-blue-600 focus:ring-blue-500" />
                        </th>
                        <th>SKU</th><th>Product</th><th>Variants</th><th className="num">Cost Price</th><th className="num">Selling Price</th><th className="num">Margin</th><th className="num">Stock</th><th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {searchFiltered.map((p) => {
                        const variants = ((p as any).variants || []).filter((v: unknown) => v && typeof v === 'object' && Object.keys(v as object).length > 0);
                        const hasVariants = variants.length > 0;
                        const isExpanded = expandedItems.has(p.id);
                        const parentCp = p.costPrice || p.cost || 0;
                        const parentSp = p.sellingPrice || p.price || 0;
                        const parentMargin = parentCp > 0 ? ((parentSp - parentCp) / parentCp * 100).toFixed(1) : '0.0';
                        const parentLow = lowStock(p);
                        const isMenuOpen = openActionMenu?.id === p.id;
                        const parentStockTotal = hasVariants ? variants.reduce((s: number, v: any) => s + num(v.stock), 0) : num(p.stock);
                        const variantLabel = hasVariants ? `${variants.length} variants` : 'standard';
                        return (
                          <React.Fragment key={p.id}>
                            <tr className={parentLow ? 'pp-row-warn' : ''} onClick={() => handleViewItem(p)} style={{cursor:'pointer'}}>
                              <td className="table-body-cell w-10 px-1 text-center" onClick={e => e.stopPropagation()}>
                                <input type="checkbox" checked={selectedIds.has(p.id)} onChange={() => toggleSelect(p.id)}
                                  className="rounded border-slate-300 text-blue-600 focus:ring-blue-500" />
                              </td>
                              <td className="mono" style={{fontFamily:'IBM Plex Mono,monospace', fontSize:10, color:'#64748B'}}>
                                {hasVariants && (
                                  <button onClick={e => { e.stopPropagation(); toggleExpand(p.id); }} className="mr-1 text-slate-400 hover:text-slate-600 transition-colors" style={{background:'none', border:'none', cursor:'pointer', padding:0, verticalAlign:'middle'}}>
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{transform: isExpanded ? 'rotate(90deg)' : 'none', transition:'transform .15s'}}><polyline points="9 18 15 12 9 6"/></svg>
                                  </button>
                                )}
                                {esc(p.sku)}
                              </td>
                              <td>{esc(p.name)}</td>
                              <td>{variantLabel}</td>
                              <td className="num mono" style={{fontFamily:"'Inter',sans-serif", fontVariantNumeric:'tabular-nums', fontWeight:600}}>{money(parentCp, currencySymbol)}</td>
                              <td className="num mono" style={{fontFamily:"'Inter',sans-serif", fontVariantNumeric:'tabular-nums', fontWeight:600}}>{money(parentSp, currencySymbol)}</td>
                              <td className={`num mono ${Number(parentMargin) >= resolveMinimumMarkup(p) ? 'pp-pos' : 'pp-neg'}`} style={{fontFamily:'IBM Plex Mono,monospace'}}>{parentMargin}%</td>
                              <td className="num mono" style={{fontFamily:'IBM Plex Mono,monospace'}}>
                                <span className="pp-stepper">
                                  <button onClick={e => { e.stopPropagation(); adjustStock(p, -1); }}>&minus;</button>
                                  <span>{parentStockTotal}</span>
                                  <button onClick={e => { e.stopPropagation(); adjustStock(p, 1); }}>+</button>
                                </span>
                              </td>
                              <td className="actions" onClick={e => e.stopPropagation()}>
                                <div className="action-dropdown-container">
                                  <button className="action-menu-btn" onClick={(e) => toggleActionMenu(p.id, e)}>
                                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                                      <circle cx="8" cy="3" r="1.5" fill="currentColor"/>
                                      <circle cx="8" cy="8" r="1.5" fill="currentColor"/>
                                      <circle cx="8" cy="13" r="1.5" fill="currentColor"/>
                                    </svg>
                                  </button>
                                  {isMenuOpen && (
                                    <div className="action-dropdown-menu" style={getFloatingMenuStyle(openActionMenu?.anchor, { minWidth: 220, estimatedHeight: 380 })}>
                                      <button className="action-dropdown-item" onClick={() => { handleEditItem(p); closeActionMenu(); }}>
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                                        Edit
                                      </button>
                                      <button className="action-dropdown-item" onClick={() => { handleDuplicate(p); closeActionMenu(); }}>
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                                        Duplicate
                                      </button>
                                      <button className="action-dropdown-item" onClick={() => { handleViewItem(p); closeActionMenu(); }}>
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                                        View Details
                                      </button>
                                      <div className="action-dropdown-divider"></div>
                                      <button className="action-dropdown-item" onClick={() => { handleOpenAdjustStock(p); closeActionMenu(); }}>
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
                                        Adjust Stock
                                      </button>
                                      <button className="action-dropdown-item" onClick={() => { handleTransferStock(p); closeActionMenu(); }}>
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>
                                        Transfer Stock
                                      </button>
                                      <div className="action-dropdown-divider"></div>
                                      <button className="action-dropdown-item" onClick={() => { handlePrintBarcode(p); closeActionMenu(); }}>
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M2 15h20"/><path d="M4 15v5a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-5"/><rect x="7" y="9" width="2" height="6"/><rect x="11" y="9" width="2" height="6"/><rect x="15" y="9" width="2" height="6"/></svg>
                                        Print Barcode
                                      </button>
                                      <button className="action-dropdown-item" onClick={() => { handlePrintQR(p); closeActionMenu(); }}>
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="2" width="8" height="8"/><rect x="14" y="2" width="8" height="8"/><rect x="2" y="14" width="8" height="8"/><line x1="14" y1="14" x2="18" y2="14"/><line x1="18" y1="18" x2="18" y2="22"/><line x1="14" y1="22" x2="16" y2="22"/></svg>
                                        Print QR
                                      </button>
                                      <div className="action-dropdown-divider"></div>
                                      <button className="action-dropdown-item" onClick={() => { handleToggleStatus(p); closeActionMenu(); }}>
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
                                        {p.status === 'Active' ? 'Archive' : 'Activate'}
                                      </button>
                                      <div className="action-dropdown-divider"></div>
                                      <button className="action-dropdown-item danger" onClick={() => { deleteSimple(p); closeActionMenu(); }}>
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                                        Delete
                                      </button>
                                    </div>
                                  )}
                                </div>
                              </td>
                            </tr>
                            {hasVariants && isExpanded && variants.map((v: any, vIdx: number) => {
                              const vCp = v.costPrice || v.basePrice || p.costPrice || p.cost || 0;
                              const vSp = v.sellingPrice || p.sellingPrice || p.price || 0;
                              const vMargin = vCp > 0 ? ((vSp - vCp) / vCp * 100).toFixed(1) : '0.0';
                              return (
                                <tr key={`${p.id}-v-${vIdx}`} className="pp-variant-row" onClick={() => handleViewItem(p)} style={{cursor:'pointer', background:'#F8FAFC'}}>
                                  <td></td>
                                  <td className="text-xs text-slate-500 pl-6">↳ {esc(v.name || 'Standard')}</td>
                                  <td></td>
                                  <td className="num mono text-xs" style={{fontFamily:"'Inter',sans-serif", fontVariantNumeric:'tabular-nums', fontWeight:600}}>{money(vCp, currencySymbol)}</td>
                                  <td className="num mono text-xs" style={{fontFamily:"'Inter',sans-serif", fontVariantNumeric:'tabular-nums', fontWeight:600}}>{money(vSp, currencySymbol)}</td>
                                  <td className={`num mono text-xs ${Number(vMargin) >= resolveMinimumMarkup(p) ? 'pp-pos' : 'pp-neg'}`} style={{fontFamily:'IBM Plex Mono,monospace'}}>{vMargin}%</td>
                                  <td className="num mono text-xs" style={{fontFamily:'IBM Plex Mono,monospace'}}>
                                    <span className="pp-stepper" style={{fontSize:12}}>
                                      <button onClick={e => { e.stopPropagation(); adjustStock({...p, stock: v.stock, id: v.id || p.id}, -1); }}>&minus;</button>
                                      <span>{esc(v.stock ?? 0)}</span>
                                      <button onClick={e => { e.stopPropagation(); adjustStock({...p, stock: v.stock, id: v.id || p.id}, 1); }}>+</button>
                                    </span>
                                  </td>
                                  <td></td>
                                </tr>
                              );
                            })}
                          </React.Fragment>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr className="pp-totals-row">
                        <td></td>
                        <td>Total ({searchFiltered.length} items)</td>
                        <td></td>
                        <td></td>
                        <td className="num mono" style={{fontFamily:"'Inter',sans-serif", fontVariantNumeric:'tabular-nums', fontWeight:600}}>{money(searchFiltered.reduce((s,i) => s + (i.costPrice || i.cost || 0), 0), currencySymbol)}</td>
                        <td className="num mono" style={{fontFamily:"'Inter',sans-serif", fontVariantNumeric:'tabular-nums', fontWeight:600}}>{money(searchFiltered.reduce((s,i) => s + (i.sellingPrice || i.price || 0), 0), currencySymbol)}</td>
                        <td></td>
                        <td className="num mono" style={{fontFamily:'IBM Plex Mono,monospace'}}>{searchFiltered.reduce((s,i) => s + num(i.stock), 0)}</td>
                        <td></td>
                      </tr>
                    </tfoot>
                  </table>
                )}
              </div>
            </>
          )}

          {/* ============ PRINTING SERVICE ============ */}
          {activeTab === 'printing' && (
            <>
              <div className="page-head">
                <div>
                  <div className="eyebrow">Priced Per Page</div>
                  <h1 className="pp">Printing Service</h1>
                </div>
                <button className="pp-btn pp-btn-primary" onClick={() => handleNewItem('printing')}>+ Add Service Type</button>
              </div>

              <BulkActionToolbar
                selectedCount={selectedIds.size}
                onBulkEdit={() => setIsBulkEditOpen(true)}
                onAssignWarehouse={() => { setAssignMode('warehouse'); setIsAssignOpen(true); }}
                onAssignSupplier={() => { setAssignMode('supplier'); setIsAssignOpen(true); }}
                onPrintLabels={() => { setPrintMode('label'); setIsPrintOpen(true); }}
                onExportSelected={handleExportSelected}
                onArchive={handleBulkArchive}
                onActivate={handleBulkActivate}
                onDeactivate={handleBulkDeactivate}
                onGenerateBarcodes={() => { setPrintMode('barcode'); setIsPrintOpen(true); }}
                onGenerateQRCodes={() => { setPrintMode('qrcode'); setIsPrintOpen(true); }}
                onStockAdjust={() => { if (selectedItems.length > 0) { setAdjustingItem(selectedItems[0]); setIsAdjustModalOpen(true); } }}
                onDelete={handleBulkDelete}
                onClear={clearSelection}
              />
              <div className="pp-panel">
                <div className="pp-panel-head">
                  <h2 className="pp">Service Types</h2>
                  <div className="flex items-center gap-3">
                    <input className="pp-search" placeholder="Search services..." value={tabSearch}
                      onChange={e => setTabSearch(e.target.value)} style={{marginBottom:0}} />
                    <span className="pp-muted">{searchFiltered.length} service(s)</span>
                  </div>
                </div>
                {searchFiltered.length === 0 ? (
                  <div className="pp-empty">No service types yet.</div>
                ) : (
                  <table className="pp-table">
                    <thead>
                      <tr>
                        <th className="w-10 px-1 text-center">
                          <input type="checkbox" checked={searchFiltered.length > 0 && searchFiltered.every(i => selectedIds.has(i.id))}
                            onChange={() => handleTabSelectAll(searchFiltered)}
                            className="rounded border-slate-300 text-blue-600 focus:ring-blue-500" />
                        </th>
                        <th>Service Code</th><th>Service Name</th><th>Category</th><th>Output Unit</th><th>BOM</th><th>Status</th><th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {searchFiltered.map((s, idx) => {
                        return (
                          <tr key={`${s.id}-${idx}`} onClick={() => handleViewItem(s)} style={{cursor:'pointer'}}>
                            <td className="table-body-cell w-10 px-1 text-center" onClick={e => e.stopPropagation()}>
                              <input type="checkbox" checked={selectedIds.has(s.id)} onChange={() => toggleSelect(s.id)}
                                className="rounded border-slate-300 text-blue-600 focus:ring-blue-500" />
                            </td>
                            <td className="mono" style={{fontFamily:'IBM Plex Mono,monospace', fontSize:10, color:'#64748B'}}>{esc(s.serviceSku || s.sku)}</td>
                            <td>{esc(s.name)}</td>
                            <td>{esc(s.category || s.classification || '-')}</td>
                            <td className="mono" style={{fontFamily:'IBM Plex Mono,monospace', fontSize:10}}>{esc(s.unit || 'pcs')}</td>
                            <td className="text-xs text-slate-600 max-w-[200px] truncate" title={getBomSummary(s, allItems)}>{getBomSummary(s, allItems)}</td>
                            <td>
                              <span className={`inline-flex items-center px-2 py-1 rounded-md text-[10px] font-semibold ${
                                s.status === 'Active' || !s.status ? 'bg-green-100 text-green-700 border border-green-200' :
                                s.status === 'Inactive' ? 'bg-red-100 text-red-700 border border-red-200' :
                                'bg-amber-100 text-amber-700 border border-amber-200'
                              }`}>
                                {s.status || 'Active'}
                              </span>
                            </td>
                            <td className="actions" onClick={e => e.stopPropagation()}>
                              <div className="action-dropdown-container">
                                <button className="action-menu-btn" onClick={(e) => toggleActionMenu(s.id, e)}>
                                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                                    <circle cx="8" cy="3" r="1.5" fill="currentColor"/>
                                    <circle cx="8" cy="8" r="1.5" fill="currentColor"/>
                                    <circle cx="8" cy="13" r="1.5" fill="currentColor"/>
                                  </svg>
                                </button>
                                {openActionMenu?.id === s.id && (
                                  <div className="action-dropdown-menu" style={getFloatingMenuStyle(openActionMenu?.anchor, { minWidth: 220, estimatedHeight: 380 })}>
                                    <button className="action-dropdown-item" onClick={() => { handleEditItem(s); closeActionMenu(); }}>
                                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                                      Edit
                                    </button>
                                    <button className="action-dropdown-item" onClick={() => { handleDuplicate(s); closeActionMenu(); }}>
                                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                                      Duplicate
                                    </button>
                                    <button className="action-dropdown-item" onClick={() => { handleViewItem(s); closeActionMenu(); }}>
                                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                                      View Details
                                    </button>
                                    <div className="action-dropdown-divider"></div>
                                    <button className="action-dropdown-item" onClick={() => { handleOpenAdjustStock(s); closeActionMenu(); }}>
                                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
                                      Adjust Stock
                                    </button>
                                    <div className="action-dropdown-divider"></div>
                                    <button className="action-dropdown-item" onClick={() => { handlePrintBarcode(s); closeActionMenu(); }}>
                                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M2 15h20"/><path d="M4 15v5a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-5"/><rect x="7" y="9" width="2" height="6"/><rect x="11" y="9" width="2" height="6"/><rect x="15" y="9" width="2" height="6"/></svg>
                                      Print Barcode
                                    </button>
                                    <button className="action-dropdown-item" onClick={() => { handlePrintQR(s); closeActionMenu(); }}>
                                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="2" width="8" height="8"/><rect x="14" y="2" width="8" height="8"/><rect x="2" y="14" width="8" height="8"/><line x1="14" y1="14" x2="18" y2="14"/><line x1="18" y1="18" x2="18" y2="22"/><line x1="14" y1="22" x2="16" y2="22"/></svg>
                                      Print QR
                                    </button>
                                    <div className="action-dropdown-divider"></div>
                                    <button className="action-dropdown-item" onClick={() => { handleToggleStatus(s); closeActionMenu(); }}>
                                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
                                      {s.status === 'Active' ? 'Archive' : 'Activate'}
                                    </button>
                                    <div className="action-dropdown-divider"></div>
                                    <button className="action-dropdown-item danger" onClick={() => { deleteSimple(s); closeActionMenu(); }}>
                                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                                      Delete
                                    </button>
                                  </div>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr className="pp-totals-row">
                        <td></td>
                        <td>Total ({searchFiltered.length} services)</td>
                        <td></td>
                        <td></td>
                        <td></td>
                        <td></td>
                        <td></td>
                        <td></td>
                      </tr>
                    </tfoot>
                  </table>
                )}
              </div>
            </>
          )}

        </div>
      </div>

{/* Modals */}
      <ItemModal open={isModalOpen} item={editingItem} onClose={() => { setIsModalOpen(false); setEditingItem(null); setModalSourceTab(null); }} onSave={handleSaveItem} allItems={allItems} sourceTab={modalSourceTab} />
      {adjustingItem && (
        <StockAdjustmentModal
          isOpen={isAdjustModalOpen}
          onClose={() => { setIsAdjustModalOpen(false); setAdjustingItem(null); }}
          item={adjustingItem}
        />
      )}
      <BulkEditModal
        open={isBulkEditOpen}
        items={selectedItems}
        onClose={() => setIsBulkEditOpen(false)}
        onSave={async (ids, updates) => {
          await Promise.all(ids.map(id => {
            const item = allItems.find(i => i.id === id);
            if (item) return updateItem({ ...item, ...updates } as Item);
          }));
          notify?.(`Updated ${ids.length} item(s)`, 'success');
          clearSelection();
          refresh();
        }}
      />
      <AssignModal
        open={isAssignOpen}
        items={selectedItems}
        mode={assignMode}
        onClose={() => setIsAssignOpen(false)}
        onAssign={async (ids, value) => {
          await Promise.all(ids.map(id => {
            const item = allItems.find(i => i.id === id);
            if (item) {
              const field = assignMode === 'warehouse' ? 'warehouseId' : 'preferredSupplierId';
              return updateItem({ ...item, [field]: value } as Item);
            }
          }));
          notify?.(`Assigned to ${ids.length} item(s)`, 'success');
          clearSelection();
          refresh();
        }}
      />
      <PrintLabelModal
        open={isPrintOpen}
        items={selectedItems}
        mode={printMode}
        onClose={() => setIsPrintOpen(false)}
      />
      <SmartAdjustModal
        isOpen={isSmartAdjustOpen}
        onClose={() => setIsSmartAdjustOpen(false)}
        onSuccess={() => { refresh(); clearSelection(); }}
        items={selectedItems.length > 0 ? selectedItems : allItems}
      />
      {isInsightsOpen && (
        <SmartStockInsights
          items={allItems}
          onClose={() => setIsInsightsOpen(false)}
        />
      )}

      <ConfirmDialog
        open={confirmState.open}
        onOpenChange={(open) => !open && setConfirmState(c => ({ ...c, open: false }))}
        onConfirm={() => {
          confirmState.onConfirm?.();
          setConfirmState(c => ({ ...c, open: false }));
        }}
        onCancel={() => setConfirmState(c => ({ ...c, open: false }))}
        title={confirmState.title}
        message={confirmState.message}
        confirmText={confirmState.confirmText}
        type={confirmState.type || 'question'}
      />
    </div>
  );
};

