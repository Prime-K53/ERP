import React, { Suspense, lazy, useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Loader2, ChevronLeft, ChevronRight, Edit3, Copy, Printer, QrCode, Archive, Download, Plus, ArrowUpDown, Package, Layers, DollarSign, Warehouse, ShoppingCart, TrendingUp, FlaskConical, Building2, FileText, ClipboardCheck, History, BarChart3, Sparkles, X, Box, Tag, Grid3X3, Ruler, Globe, Eye } from 'lucide-react';
import { useItemDetail } from './hooks/useItemDetail';

import StockAdjustmentModal from '../components/StockAdjustmentModal';
import { TransferStockModal } from '../InventoryList/modals/TransferStockModal';
import { PrintLabelModal } from '../InventoryList/modals/PrintLabelModal';
import { ItemModal } from '../../../components/items/ItemModal';
import { useInventory } from '../../../context/InventoryContext';
import { useAuth } from '../../../context/AuthContext';
import { OverviewTab } from './tabs/OverviewTab';
import { InventoryTab } from './tabs/InventoryTab';
import { WarehousesTab } from './tabs/WarehousesTab';
import { PricingTab } from './tabs/PricingTab';
import { SuppliersTab } from './tabs/SuppliersTab';
import { RecipesTab } from './tabs/RecipesTab';
import { ProductionTab } from './tabs/ProductionTab';
import { AttachmentsTab } from './tabs/AttachmentsTab';
import type { Item } from '../../../types';
import '../inventory-reference.css';

const TransactionsTab = lazy(() => import('./tabs/TransactionsTab').then(m => ({ default: m.TransactionsTab })));
const PurchaseHistoryTab = lazy(() => import('./tabs/PurchaseHistoryTab').then(m => ({ default: m.PurchaseHistoryTab })));
const SalesHistoryTab = lazy(() => import('./tabs/SalesHistoryTab').then(m => ({ default: m.SalesHistoryTab })));
const AuditLogTab = lazy(() => import('./tabs/AuditLogTab').then(m => ({ default: m.AuditLogTab })));

const TABS = [
  { id: 'overview', label: 'Overview', icon: <Eye size={14} /> },
  { id: 'inventory', label: 'Inventory', icon: <Layers size={14} /> },
  { id: 'warehouses', label: 'Warehouses', icon: <Warehouse size={14} /> },
  { id: 'pricing', label: 'Pricing', icon: <DollarSign size={14} /> },
  { id: 'procurement', label: 'Procurement', icon: <ShoppingCart size={14} /> },
  { id: 'sales', label: 'Sales', icon: <TrendingUp size={14} /> },
  { id: 'production', label: 'Production', icon: <FlaskConical size={14} /> },
  { id: 'bom', label: 'BOM', icon: <Grid3X3 size={14} /> },
  { id: 'suppliers', label: 'Suppliers', icon: <Building2 size={14} /> },
  { id: 'transactions', label: 'Transactions', icon: <ArrowUpDown size={14} />, lazy: true },
  { id: 'documents', label: 'Documents', icon: <FileText size={14} /> },
  { id: 'quality', label: 'Quality', icon: <ClipboardCheck size={14} /> },
  { id: 'activity', label: 'Activity Log', icon: <History size={14} />, lazy: true },
  { id: 'analytics', label: 'Analytics', icon: <BarChart3 size={14} /> },
];

const TYPE_ICONS: Record<string, React.ReactNode> = {
  'Raw Material': <Layers size={22} />,
  'Material': <Box size={22} />,
  'Product': <Package size={22} />,
  'Stationery': <Tag size={22} />,
  'Service': <Globe size={22} />,
};

export const ItemDetailPage: React.FC = () => {
  const { itemId } = useParams<{ itemId: string }>();
  const navigate = useNavigate();
  const {
    item, loading, error,
    transactions, purchases, sales, auditLogs, productionData, suppliers,
    activeTab, setActiveTab,
    stockCalc, pricingCalc,
    prevItem, nextItem,
    allItems, refresh, handleSave, handleDuplicate,
  } = useItemDetail(itemId);

  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  const { updateItem } = useInventory();
  const { notify } = useAuth();

  const [isEditing, setIsEditing] = useState(false);
  const [aiOpen, setAiOpen] = useState(true);

  const [isAdjustOpen, setIsAdjustOpen] = useState(false);
  const [isTransferOpen, setIsTransferOpen] = useState(false);
  const [printMode, setPrintMode] = useState<'barcode' | 'qrcode' | null>(null);

  const ext = (item ?? {}) as Item & { classification?: string; productType?: string; averageMonthlyUsage?: number; brand?: string };
  const isRaw = useMemo(() => {
    const t = item?.type || '';
    return t === 'Raw Material' || t === 'Material' || ext.classification === 'raw_material' || ext.classification === 'material';
  }, [item]);

  const isProduct = useMemo(() => {
    const t = item?.type || '';
    return t === 'Product' || t === 'Service' || ext.productType === 'MANUFACTURED';
  }, [item]);

  const isStockTracked = useMemo(() => {
    const t = item?.type || '';
    return t === 'Raw Material' || t === 'Stationery';
  }, [item]);

  const handleEditSave = useCallback(async (updated: Item) => {
    await handleSave(updated);
    setIsEditing(false);
    refresh();
  }, [handleSave, refresh]);

  const handleBack = () => navigate('/supply-chain/inventory');

  const onDuplicate = useCallback(async () => {
    if (!item) return;
    const dup = await handleDuplicate();
    if (dup) navigate(`/supply-chain/inventory/${dup.id}`);
  }, [item, handleDuplicate, navigate]);

  const handleToggleStatus = useCallback(async () => {
    if (!item) return;
    const newStatus = item.status === 'Inactive' ? 'Active' : 'Inactive';
    try {
      await updateItem({ ...item, status: newStatus }, `Status changed to ${newStatus}`);
      notify?.(`${item.name} ${newStatus === 'Inactive' ? 'archived' : 'activated'}`, 'success');
      refresh();
    } catch (err: any) {
      notify?.(`Failed to update status: ${err?.message || 'Unknown error'}`, 'error');
    }
  }, [item, updateItem, notify, refresh]);

  // KPI data
  const kpis = useMemo(() => {
    if (!item || !stockCalc || !pricingCalc) return [];
    const cur = stockCalc.currentStock;
    const avail = stockCalc.available;
    const reserved = stockCalc.reserved;
    const value = stockCalc.inventoryValue;

    if (isStockTracked) {
      const common = [
        { label: 'Current Stock', value: String(cur), sub: `${avail} available`, color: cur === 0 ? '#DC2626' : cur <= (item.minStockLevel || 0) ? '#D97706' : '#16A34A' },
        { label: 'Available', value: String(avail), sub: `${((avail / (cur || 1)) * 100).toFixed(0)}% of stock`, color: '#2563EB' },
        { label: 'Reserved', value: String(reserved), sub: `${((reserved / (cur || 1)) * 100).toFixed(0)}% allocated`, color: '#7C3AED' },
        { label: 'Stock Value', value: value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }), sub: 'Total cost value', color: '#059669' },
      ];

      if (isRaw) {
        return [...common,
          { label: 'Avg Cost', value: pricingCalc.costPrice.toFixed(2), sub: 'Per unit', color: '#2563EB' },
          { label: 'Reorder Level', value: String(item.reorderPoint || item.minStockLevel || 0), sub: item.reorderPoint ? `Min: ${item.minStockLevel || '—'}` : 'Not set', color: cur <= (item.reorderPoint || 0) ? '#DC2626' : '#64748B' },
        ];
      }

      return [...common,
        { label: 'Selling Price', value: pricingCalc.sellingPrice.toFixed(2), sub: `Profit ${pricingCalc.profit.toFixed(2)}`, color: pricingCalc.profit >= 0 ? '#16A34A' : '#DC2626' },
        { label: 'Gross Margin', value: `${pricingCalc.markup.toFixed(1)}%`, sub: `Min ${pricingCalc.minimumMarkup}%`, color: pricingCalc.markup >= pricingCalc.minimumMarkup ? '#16A34A' : '#DC2626' },
      ];
    }

    // For non-stock-tracked items (Products, Services)
    return [
      { label: 'Selling Price', value: pricingCalc.sellingPrice.toFixed(2), sub: `Profit ${pricingCalc.profit.toFixed(2)}`, color: pricingCalc.profit >= 0 ? '#16A34A' : '#DC2626' },
      { label: 'Gross Margin', value: `${pricingCalc.markup.toFixed(1)}%`, sub: `Min ${pricingCalc.minimumMarkup}%`, color: pricingCalc.markup >= pricingCalc.minimumMarkup ? '#16A34A' : '#DC2626' },
    ];
  }, [item, stockCalc, pricingCalc, isRaw, isStockTracked]);

  // AI insights
  const aiInsights = useMemo(() => {
    if (!item || !stockCalc || !pricingCalc) return [];
    const insights: { text: string; severity: 'high' | 'med' | 'low' | 'ok' }[] = [];
    const cur = stockCalc.currentStock;
    const reorder = item.reorderPoint || item.minStockLevel || 0;

    if (isStockTracked) {
      if (cur <= 0) insights.push({ text: 'Item is out of stock. Urgent reorder needed.', severity: 'high' });
      else if (reorder > 0 && cur <= reorder) insights.push({ text: `Stock level (${cur}) is at or below reorder point (${reorder}).`, severity: 'med' });
      else insights.push({ text: 'Stock level is healthy.', severity: 'ok' });

      if (cur > 0 && ext.averageMonthlyUsage) {
        const months = cur / ext.averageMonthlyUsage;
        if (months < 1) insights.push({ text: `Estimated ${(months * 30).toFixed(0)} days until stockout based on usage.`, severity: 'med' });
        else insights.push({ text: `Estimated ${months.toFixed(1)} months of stock remaining.`, severity: 'ok' });
      }

      if (isRaw && !item.preferredSupplierId) insights.push({ text: 'No preferred supplier assigned.', severity: 'low' });
    } else {
      insights.push({ text: 'Stock tracking is not enabled for this item type.', severity: 'low' });
    }

    if (!pricingCalc.sellingPrice && !isRaw) insights.push({ text: 'No selling price configured.', severity: 'high' });
    else if (pricingCalc.markup < pricingCalc.minimumMarkup) insights.push({ text: `Markup ${pricingCalc.markup.toFixed(1)}% is below minimum ${pricingCalc.minimumMarkup}%.`, severity: 'med' });
    else if (pricingCalc.sellingPrice > 0) insights.push({ text: `Current markup ${pricingCalc.markup.toFixed(1)}% meets minimum target.`, severity: 'ok' });

    return insights;
  }, [item, stockCalc, pricingCalc, isRaw, isStockTracked]);

  if (loading && !mounted) {
    return (
      <div className="h-full flex items-center justify-center bg-[#F3F0EC]">
        <div className="flex flex-col items-center gap-3">
          <Loader2 size={32} className="animate-spin text-slate-300" />
          <span className="text-sm font-medium text-slate-400">Loading item...</span>
        </div>
      </div>
    );
  }

  if (error || !item) {
    return (
      <div className="h-full flex items-center justify-center bg-[#F3F0EC]">
        <div className="text-center">
          <Package size={48} className="mx-auto mb-4 text-slate-300" />
          <h2 className="text-lg font-bold mb-2 text-slate-800">{error || 'Item not found'}</h2>
          <button onClick={handleBack} className="px-4 py-2 rounded-xl text-sm font-semibold inline-flex items-center gap-2 bg-blue-600 text-white hover:bg-blue-700">
            <ChevronLeft size={16} /> Back to Inventory
          </button>
        </div>
      </div>
    );
  }

  const getStockStatus = () => {
    if (!isStockTracked) return 'not-applicable';
    const cur = stockCalc?.currentStock || 0;
    if (cur <= 0) return 'out-of-stock';
    if ((item.reorderPoint || 0) > 0 && cur <= item.reorderPoint!) return 'low-stock';
    return 'active';
  };

  const getTypeBadgeClass = () => {
    const t = item.type || '';
    if (t === 'Raw Material' || t === 'Material') return 'rm';
    if (t === 'Product' || t === 'Stationery') return 'fg';
    if (t === 'Service') return 'svc';
    return 'cons';
  };

  const stockStatus = getStockStatus();

  const getStockStatusLabel = () => {
    if (stockStatus === 'not-applicable') return 'No Stock Tracking';
    if (stockStatus === 'active') return 'Active';
    if (stockStatus === 'low-stock') return 'Low Stock';
    return 'Out of Stock';
  };

  return (
    <div className="item-detail-shell">

      {/* ── STICKY HEADER ── */}
      <div className="item-detail-top">
        <div className="item-identity">
          <div className="item-avatar">
            {TYPE_ICONS[item.type || ''] || <Package size={22} />}
          </div>
          <div className="item-detail-header-info">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <h1>{item.name}</h1>
              <span className={`item-type-badge ${getTypeBadgeClass()}`}>{item.type || ext.classification || 'Item'}</span>
              <span className={`item-status-badge ${stockStatus}`}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'currentColor' }} />
                {getStockStatusLabel()}
              </span>
            </div>
            <div className="item-meta">
              <span className="item-meta-sku">{item.sku}</span>
              {item.barcode && <span className="item-meta-sku">Barcode: {item.barcode}</span>}
              {item.category && <span className="item-meta-chip"><Tag size={10} /> {item.category}</span>}
              {ext.brand && <span className="item-meta-chip">{item.brand || ext.brand}</span>}
              <span className="item-meta-chip"><Ruler size={10} /> {item.unit || 'pcs'}</span>
              <span style={{ fontSize: 10, color: '#94A3B8' }}>Updated {item.updatedAt ? new Date(item.updatedAt).toLocaleDateString() : '—'}</span>
            </div>
          </div>
          <div className="item-quick-actions">
            <button className="qa-btn primary" onClick={() => setIsEditing(true)}><Edit3 size={13} /> Edit</button>
            <button className="qa-btn" onClick={onDuplicate}><Copy size={13} /> Duplicate</button>
            <button className="qa-icon" title="Print Barcode" onClick={() => setPrintMode('barcode')}><Printer size={14} /></button>
            <button className="qa-icon" title="Generate QR" onClick={() => setPrintMode('qrcode')}><QrCode size={14} /></button>
            <button className="qa-icon" title="Export"><Download size={14} /></button>
            {isStockTracked && <button className="qa-icon" title="Adjust Stock" onClick={() => setIsAdjustOpen(true)}><Plus size={14} /></button>}
            {isStockTracked && <button className="qa-icon" title="Transfer" onClick={() => setIsTransferOpen(true)}><ArrowUpDown size={14} /></button>}
            <button className="qa-icon" title={item?.status === 'Inactive' ? 'Activate' : 'Archive'} onClick={handleToggleStatus}><Archive size={14} /></button>
            {prevItem && <button className="qa-icon" onClick={() => navigate(`/supply-chain/inventory/${prevItem.id}`)} title="Previous"><ChevronLeft size={14} /></button>}
            {nextItem && <button className="qa-icon" onClick={() => navigate(`/supply-chain/inventory/${nextItem.id}`)} title="Next"><ChevronRight size={14} /></button>}
          </div>
        </div>

        {/* ── KPI DASHBOARD ── */}
        <div className="item-kpi-bar">
          <div className="item-kpi-grid">
            {kpis.map(kpi => (
              <div key={kpi.label} className="item-kpi-card" style={{ borderLeft: `3px solid ${kpi.color}` }}>
                <div className="item-kpi-label">{kpi.label}</div>
                <div className="item-kpi-value">{kpi.value}</div>
                <div className="item-kpi-sub">{kpi.sub}</div>
              </div>
            ))}
          </div>
        </div>

        {/* ── TAB NAV ── */}
        <div className="item-tab-bar">
          {TABS.map(tab => {
            const showTab = tab.id === 'overview' || tab.id === 'inventory' || tab.id === 'warehouses' || tab.id === 'pricing' ||
              tab.id === 'suppliers' || tab.id === 'transactions' || tab.id === 'documents' || tab.id === 'quality' || tab.id === 'activity' || tab.id === 'analytics' ||
              (tab.id === 'procurement' && isRaw) ||
              (tab.id === 'sales' && isProduct) ||
              (tab.id === 'production' && (isRaw || isProduct)) ||
              (tab.id === 'bom' && isProduct);
            if (!showTab) return null;
            return (
              <button key={tab.id} className={`item-tab ${activeTab === tab.id ? 'active' : ''}`} onClick={() => setActiveTab(tab.id)}>
                {tab.icon} {tab.label}
              </button>
            );
          })}
          <div style={{ flex: 1 }} />
          <button className="item-tab" onClick={() => setAiOpen(v => !v)} style={{ color: aiOpen ? 'var(--inv-stamp)' : undefined }}>
            <Sparkles size={14} /> AI
          </button>
        </div>
      </div>

      {/* ── BODY + AI PANEL ── */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        <div className="item-detail-body">
          <Suspense fallback={
            <div className="flex items-center justify-center py-20">
              <Loader2 size={28} className="animate-spin text-slate-300" />
            </div>
          }>
            {activeTab === 'overview' && <OverviewTab item={item} />}
            {activeTab === 'inventory' && <InventoryTab item={item} stockCalc={stockCalc} />}
            {activeTab === 'warehouses' && <WarehousesTab item={item} />}
            {activeTab === 'pricing' && <PricingTab item={item} />}
            {activeTab === 'procurement' && <PurchaseHistoryTab purchases={purchases} itemId={item.id || ''} />}
            {activeTab === 'sales' && <SalesHistoryTab sales={sales} itemId={item.id || ''} />}
            {activeTab === 'production' && <ProductionTab item={item} productionData={[...productionData.workOrders, ...productionData.batches]} />}
            {activeTab === 'bom' && <RecipesTab item={item} />}
            {activeTab === 'suppliers' && <SuppliersTab item={item} suppliers={suppliers} />}
            {activeTab === 'transactions' && <TransactionsTab transactions={transactions} />}
            {activeTab === 'documents' && <AttachmentsTab item={item} />}
            {activeTab === 'quality' && (
              <div className="space-y-4">
                <div className="detail-card full">
                  <h3><ClipboardCheck size={15} /> Stock Health</h3>
                  <div className="grid grid-cols-3 gap-4 mt-3">
                    <div className="bg-slate-50 rounded-lg p-4 text-center">
                      <div className="text-xs text-slate-500">Current Stock</div>
                      <div className={`text-lg font-bold mt-1 ${(stockCalc?.currentStock || 0) <= 0 ? 'text-red-600' : (stockCalc?.currentStock || 0) <= (item.reorderPoint || 0) ? 'text-amber-600' : 'text-green-600'}`}>{stockCalc?.currentStock || 0}</div>
                    </div>
                    <div className="bg-slate-50 rounded-lg p-4 text-center">
                      <div className="text-xs text-slate-500">Reorder Point</div>
                      <div className="text-lg font-bold text-slate-800 mt-1">{item.reorderPoint || '—'}</div>
                    </div>
                    <div className="bg-slate-50 rounded-lg p-4 text-center">
                      <div className="text-xs text-slate-500">Min Stock Level</div>
                      <div className="text-lg font-bold text-slate-800 mt-1">{item.minStockLevel || '—'}</div>
                    </div>
                  </div>
                </div>
                <div className="detail-card full">
                  <h3><Package size={15} /> Item Details</h3>
                  <div className="grid grid-cols-2 gap-x-8 gap-y-3 mt-3 text-sm">
                    <div className="flex justify-between"><span className="text-slate-500">Unit</span><span className="font-medium">{item.unit || 'pcs'}</span></div>
                    <div className="flex justify-between"><span className="text-slate-500">Category</span><span className="font-medium">{item.category || '—'}</span></div>
                    <div className="flex justify-between"><span className="text-slate-500">Status</span><span className={`font-medium ${item.status === 'Inactive' ? 'text-slate-400' : 'text-green-600'}`}>{item.status || 'Active'}</span></div>
                    <div className="flex justify-between"><span className="text-slate-500">Preferred Supplier</span><span className="font-medium">{item.preferredSupplierId || '—'}</span></div>
                  </div>
                </div>
              </div>
            )}
            {activeTab === 'activity' && <AuditLogTab auditLog={auditLogs} />}
            {activeTab === 'analytics' && pricingCalc && stockCalc && (
              <div className="space-y-6">
                <div className="detail-card full">
                  <h3><BarChart3 size={15} /> Inventory Analytics</h3>
                  <div className="grid grid-cols-3 gap-4 mt-4">
                    <div className="bg-slate-50 rounded-lg p-4 text-center">
                      <div className="text-xs text-slate-500">Stock Turnover</div>
                      <div className="text-lg font-bold text-slate-800 mt-1">{pricingCalc.profit > 0 ? ((stockCalc.currentStock / Math.max(1, pricingCalc.profit)) * 12).toFixed(1) : '—'}x</div>
                      <div className="text-[10px] text-slate-400 mt-1">Annual estimate</div>
                    </div>
                    <div className="bg-slate-50 rounded-lg p-4 text-center">
                      <div className="text-xs text-slate-500">Stock Value</div>
                      <div className="text-lg font-bold text-slate-800 mt-1">{stockCalc.inventoryValue.toLocaleString()}</div>
                      <div className="text-[10px] text-slate-400 mt-1">{stockCalc.currentStock} units @ {pricingCalc.costPrice.toFixed(2)}</div>
                    </div>
                    <div className="bg-slate-50 rounded-lg p-4 text-center">
                      <div className="text-xs text-slate-500">Available Ratio</div>
                      <div className={`text-lg font-bold mt-1 ${stockCalc.available < stockCalc.currentStock * 0.5 ? 'text-amber-600' : 'text-green-600'}`}>{stockCalc.currentStock > 0 ? ((stockCalc.available / stockCalc.currentStock) * 100).toFixed(0) : '0'}%</div>
                      <div className="text-[10px] text-slate-400 mt-1">{stockCalc.available} of {stockCalc.currentStock} avail.</div>
                    </div>
                  </div>
                </div>
                <div className="detail-card full">
                  <h3><DollarSign size={15} /> Financial Analytics</h3>
                  <div className="grid grid-cols-3 gap-4 mt-4">
                    <div className="bg-slate-50 rounded-lg p-4 text-center">
                      <div className="text-xs text-slate-500">Cost Price</div>
                      <div className="text-lg font-bold text-slate-800 mt-1">{pricingCalc.costPrice.toFixed(2)}</div>
                    </div>
                    <div className="bg-slate-50 rounded-lg p-4 text-center">
                      <div className="text-xs text-slate-500">Selling Price</div>
                      <div className={`text-lg font-bold mt-1 ${pricingCalc.sellingPrice > pricingCalc.costPrice ? 'text-green-600' : 'text-slate-800'}`}>{pricingCalc.sellingPrice > 0 ? pricingCalc.sellingPrice.toFixed(2) : '—'}</div>
                    </div>
                    <div className="bg-slate-50 rounded-lg p-4 text-center">
                      <div className="text-xs text-slate-500">Margin</div>
                      <div className={`text-lg font-bold mt-1 ${pricingCalc.markup >= pricingCalc.minimumMarkup ? 'text-green-600' : pricingCalc.markup > 0 ? 'text-amber-600' : 'text-slate-800'}`}>{pricingCalc.markup > 0 ? `${pricingCalc.markup.toFixed(1)}%` : '—'}</div>
                      <div className="text-[10px] text-slate-400 mt-1">Target: {pricingCalc.minimumMarkup}%</div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </Suspense>
        </div>

        {/* ── AI PANEL ── */}
        {aiOpen && (
          <div className="ai-panel">
            <div className="ai-panel-header">
              <Sparkles size={15} style={{ color: 'var(--inv-stamp)' }} />
              AI Intelligence
              <button onClick={() => setAiOpen(false)} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: '#94A3B8', padding: 4 }}><X size={14} /></button>
            </div>
            <div className="ai-panel-body">
              {aiInsights.length === 0 && (
                <div className="ai-insight-card ok">All checks passed. Item data looks good.</div>
              )}
              {aiInsights.map((ins, i) => (
                <div key={i} className={`ai-insight-card ${ins.severity}`}>{ins.text}</div>
              ))}
              <div style={{ borderTop: '1px solid var(--inv-line-soft)', paddingTop: 10, marginTop: 4 }}>
                <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', color: '#94A3B8', marginBottom: 6 }}>Smart Actions</div>
                {isRaw && <div className="ai-insight-card low" style={{ cursor: 'pointer' }}>Create Purchase Order</div>}
                {isProduct && <div className="ai-insight-card low" style={{ cursor: 'pointer' }}>Create Sales Order</div>}
                {isStockTracked && stockCalc && stockCalc.currentStock <= (item.reorderPoint || 0) && stockCalc.currentStock > 0 && (
                  <div className="ai-insight-card med" style={{ cursor: 'pointer' }}>Reorder Now</div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      <ItemModal
        open={isEditing}
        item={item}
        onClose={() => setIsEditing(false)}
        onSave={handleEditSave}
        allItems={allItems}
        sourceTab={
          item?.type === 'Product'
            ? 'product'
            : item?.type === 'Stationery'
              ? 'stationery'
              : item?.type === 'Service' || (item as any)?.classification === 'printing_service'
                ? 'printing'
                : null
        }
      />
      <StockAdjustmentModal isOpen={isAdjustOpen} onClose={() => setIsAdjustOpen(false)} item={item} />

      <TransferStockModal open={isTransferOpen} item={item} onClose={() => setIsTransferOpen(false)} onSuccess={refresh} />

      <PrintLabelModal open={printMode !== null} items={[item]} mode={printMode || 'barcode'} onClose={() => setPrintMode(null)} />
    </div>
  );
};

export default ItemDetailPage;
