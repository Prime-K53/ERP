import React, { useMemo, useState } from 'react';
import { Package, AlertTriangle, DollarSign, TrendingUp, Box, Layers, BarChart3, ArrowUpDown, Search, Warehouse as WarehouseIcon, Coins, Award } from 'lucide-react';
import { useInventory } from '../../context/InventoryContext';
import { useSalesStore } from '../../stores/salesStore';
import { useAuth } from '../../context/AuthContext';
import { currencyService } from '../../services/currencyService';
import type { Item, Sale as SaleType } from '../../types';
import './inventory-reference.css';

const teal = {
  50: '#eef7f6', 100: '#d3ece9', 200: '#a6d9d3', 300: '#72c0b7',
  400: '#3fa294', 500: '#1f8577', 600: '#146b60', 700: '#0f544c',
  800: '#0b3e39', 900: '#082e2a'
};
const amber = { 100: '#fbead0', 300: '#eec27a', 500: '#d99a3f', 600: '#b97e2b' };
const paper = '#FEFDFB';
const ink = '#23282A';
const inkSoft = '#5c6567';
const hairline = '#e4ddd1';
const danger = '#b5493f';

const inputStyle: React.CSSProperties = {
  width: '100%', border: '1.4px solid #e4ddd1', borderRadius: 9,
  padding: '9px 12px', background: '#FEFDFB',
  fontFamily: "'Inter',sans-serif", fontSize: 13.5, color: '#23282A',
  outline: 'none', transition: 'border-color .15s ease, box-shadow .15s ease'
};

const btnPrimaryStyle: React.CSSProperties = {
  fontFamily: "'Inter', sans-serif", fontSize: 13, fontWeight: 600,
  padding: '9px 18px', borderRadius: 9, cursor: 'pointer', border: '1.4px solid transparent',
  background: 'linear-gradient(155deg, #1f8577, #0f544c)',
  color: '#fff', display: 'flex', alignItems: 'center', gap: 7,
  boxShadow: '0 6px 16px -6px rgba(15,84,76,.55)',
  transition: 'all .15s ease'
};

const btnGhostStyle: React.CSSProperties = {
  fontFamily: "'Inter', sans-serif", fontSize: 13, fontWeight: 600,
  padding: '9px 18px', borderRadius: 9, cursor: 'pointer',
  background: '#FEFDFB', border: '1.4px solid #e4ddd1', color: '#5c6567',
  display: 'flex', alignItems: 'center', gap: 7, transition: 'all .15s ease'
};

const labelStyle: React.CSSProperties = {
  fontSize: 12, fontWeight: 600, color: '#0b3e39',
  marginBottom: 6, letterSpacing: 0.01
};

type ReportTab = 'overview' | 'stock-levels' | 'low-stock' | 'valuation' | 'reorder' | 'financials' | 'top-products';

const TABS: { id: ReportTab; label: string; icon: React.ReactNode }[] = [
  { id: 'overview', label: 'Overview', icon: <BarChart3 size={14} /> },
  { id: 'stock-levels', label: 'Stock Levels', icon: <Box size={14} /> },
  { id: 'low-stock', label: 'Low Stock', icon: <AlertTriangle size={14} /> },
  { id: 'valuation', label: 'Valuation', icon: <DollarSign size={14} /> },
  { id: 'financials', label: 'Financials', icon: <Coins size={14} /> },
  { id: 'top-products', label: 'Top Products', icon: <Award size={14} /> },
  { id: 'reorder', label: 'Reorder', icon: <ArrowUpDown size={14} /> },
];

export const InventoryReports: React.FC = () => {
  const { inventory, warehouses } = useInventory();
  const { sales } = useSalesStore();
  const { companyConfig } = useAuth();
  const currency = companyConfig?.currencySymbol || currencyService.getCurrency(currencyService.getBaseCurrency())?.symbol || 'KWD';
  const [activeTab, setActiveTab] = useState<ReportTab>('overview');
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');

  const categories = useMemo(() => {
    const cats = new Set<string>();
    inventory.forEach((i: Item) => { if (i.category) cats.add(i.category); });
    return ['all', ...Array.from(cats).sort()];
  }, [inventory]);

  const activeItems = useMemo(() => inventory.filter((i: Item) => i.status !== 'Inactive') as Item[], [inventory]);

  const totalValue = useMemo(() =>
    activeItems.reduce((s, i) => s + (i.costPrice || 0) * Math.max(i.stock || 0, 0), 0),
    [activeItems]);

  const lowStockItems = useMemo(() =>
    activeItems.filter((i: Item) => (i.reorderPoint ?? 0) > 0 && (i.stock ?? 0) <= (i.reorderPoint ?? 0)),
    [activeItems]);

  const outOfStock = useMemo(() =>
    activeItems.filter((i: Item) => (i.stock ?? 0) === 0 && (i.reorderPoint ?? 0) > 0),
    [activeItems]);

  const valuationByCategory = useMemo(() => {
    const map = new Map<string, { count: number; value: number; cost: number }>();
    activeItems.forEach((i: Item) => {
      const cat = i.category || 'Uncategorized';
      const entry = map.get(cat) || { count: 0, value: 0, cost: 0 };
      entry.count++;
      entry.cost += i.costPrice || 0;
      entry.value += (i.costPrice || 0) * Math.max(i.stock || 0, 0);
      map.set(cat, entry);
    });
    return Array.from(map.entries()).sort((a, b) => b[1].value - a[1].value);
  }, [activeItems]);

  const valuationByWarehouse = useMemo(() => {
    const map = new Map<string, { count: number; value: number }>();
    activeItems.forEach((i: Item) => {
      const locs = i.locationStock || [];
      if (locs.length === 0) {
        const entry = map.get('Unassigned') || { count: 0, value: 0 };
        entry.count++;
        entry.value += (i.costPrice || 0) * Math.max(i.stock || 0, 0);
        map.set('Unassigned', entry);
      } else {
        locs.forEach((ls: { warehouseId: string; quantity: number }) => {
          const wh = warehouses.find((w: any) => w.id === ls.warehouseId);
          const label = wh ? wh.name : ls.warehouseId;
          const entry = map.get(label) || { count: 0, value: 0 };
          entry.count++;
          entry.value += (i.costPrice || 0) * Math.max(ls.quantity || 0, 0);
          map.set(label, entry);
        });
      }
    });
    return Array.from(map.entries()).sort((a, b) => b[1].value - a[1].value);
  }, [activeItems, warehouses]);

  const totalPotentialRevenue = useMemo(() =>
    activeItems.reduce((s, i) => s + (i.sellingPrice || 0) * Math.max(i.stock || 0, 0), 0),
    [activeItems]);

  const grossProfitPotential = totalPotentialRevenue - totalValue;

  const overallMarkupPct = useMemo(() => {
    const totalCost = activeItems.reduce((s, i) => s + (i.costPrice || 0), 0);
    const totalSell = activeItems.reduce((s, i) => s + (i.sellingPrice || 0), 0);
    return totalCost > 0 ? ((totalSell - totalCost) / totalCost) * 100 : 0;
  }, [activeItems]);

  const markupDistribution = useMemo(() => {
    const buckets: { label: string; min: number; max: number; items: number; value: number }[] = [
      { label: '0-10%', min: 0, max: 10, items: 0, value: 0 },
      { label: '10-20%', min: 10, max: 20, items: 0, value: 0 },
      { label: '20-30%', min: 20, max: 30, items: 0, value: 0 },
      { label: '30-50%', min: 30, max: 50, items: 0, value: 0 },
      { label: '50-100%', min: 50, max: 100, items: 0, value: 0 },
      { label: '100%+', min: 100, max: Infinity, items: 0, value: 0 },
    ];
    activeItems.forEach((i: Item) => {
      const cp = i.costPrice || 0;
      const sp = i.sellingPrice || 0;
      if (cp <= 0) return;
      const markup = ((sp - cp) / cp) * 100;
      for (const b of buckets) {
        if (markup >= b.min && markup < b.max) {
          b.items++;
          b.value += cp * Math.max(i.stock || 0, 0);
          break;
        }
      }
    });
    return buckets;
  }, [activeItems]);

  const negativeMarkupItems = useMemo(() =>
    activeItems.filter((i: Item) => (i.costPrice || 0) > 0 && (i.sellingPrice || 0) < (i.costPrice || 0)),
    [activeItems]);

  const productSalesAggregated = useMemo(() => {
    const map = new Map<string, { name: string; sku: string; qty: number; revenue: number; cost: number; profit: number }>();
    if (!sales) return Array.from(map.values()).sort((a, b) => b.profit - a.profit);
    sales.forEach((sale: any) => {
      if (sale.status !== 'Paid' && sale.status !== 'Completed') return;
      (sale.items || []).forEach((item: any) => {
        const id = item.productId || item.itemId || item.id || '';
        const name = item.productName || item.name || 'Unknown';
        const qty = item.quantity || 0;
        const price = item.price || item.selling_price || item.unitPrice || 0;
        const cost = item.cost || item.cost_price || 0;
        const key = `${id}:${name}`;
        const existing = map.get(key) || { name, sku: item.sku || '', qty: 0, revenue: 0, cost: 0, profit: 0 };
        existing.qty += qty;
        existing.revenue += price * qty;
        existing.cost += cost * qty;
        existing.profit += (price - cost) * qty;
        map.set(key, existing);
      });
    });
    return Array.from(map.values()).sort((a, b) => b.profit - a.profit);
  }, [sales]);

  const filteredItems = useMemo(() => {
    let items = activeItems;
    if (activeTab === 'low-stock') items = lowStockItems;
    else if (activeTab === 'reorder') items = [...lowStockItems].sort((a, b) => ((a.stock ?? 0) / Math.max(a.reorderPoint ?? 1, 1)) - ((b.stock ?? 0) / Math.max(b.reorderPoint ?? 1, 1)));
    if (categoryFilter !== 'all') items = items.filter((i: Item) => i.category === categoryFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      items = items.filter((i: Item) => i.name.toLowerCase().includes(q) || i.sku.toLowerCase().includes(q));
    }
    return items;
  }, [activeItems, lowStockItems, activeTab, categoryFilter, search]);

  const statusBadge = (item: Item) => {
    const stock = item.stock ?? 0;
    const rop = item.reorderPoint ?? 0;
    if (stock === 0 && rop > 0) return <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: '#fef2f2', color: '#b5493f', border: '1px solid #f5c6c2' }}>Out of Stock</span>;
    if (rop > 0 && stock <= rop) return <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: amber[100], color: '#8c5c1f', border: `1px solid ${amber[300]}` }}>Low Stock</span>;
    if (stock === 0) return <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: '#f3f0ec', color: inkSoft, border: `1px solid ${hairline}` }}>Zero</span>;
    return <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: teal[50], color: teal[700], border: `1px solid ${teal[200]}` }}>In Stock</span>;
  };

  const searchAndFilter = (
    <div className="flex items-center gap-3 mb-4">
      <div className="relative flex-1 max-w-xs">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: '#5c6567' }} />
        <input type="text" placeholder="Search items..." value={search} onChange={e => setSearch(e.target.value)}
          style={inputStyle}
        />
      </div>
      <select value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)}
        style={{ ...inputStyle, paddingRight: 30, cursor: 'pointer', appearance: 'none',
          backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%235c6567'/%3E%3C/svg%3E")`,
          backgroundRepeat: 'no-repeat', backgroundPosition: 'right 12px center' }}>
        {categories.map(c => <option key={c} value={c}>{c === 'all' ? 'All Categories' : c}</option>)}
      </select>
    </div>
  );

  const renderTable = (items: Item[], showRop = false) => (
    <div className="pp-panel" style={{ padding: 0 }}>
      <div className="overflow-x-auto custom-scrollbar">
        <table className="pp-table" data-mobile-cards="true">
          <thead>
            <tr>
              <th className="text-left">Item</th>
              <th className="text-left">SKU</th>
              <th className="num">Stock</th>
              {showRop && <th className="num">Reorder Point</th>}
              <th className="num">Cost Price</th>
              <th className="num">Stock Value</th>
              <th className="text-center">Status</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr><td colSpan={showRop ? 7 : 6} data-label="" className="px-4 py-12 text-center text-xs font-medium" style={{ color: inkSoft }}>No items match your filters.</td></tr>
            ) : items.map((item: Item, idx: number) => (
              <tr key={`${item.id}-${idx}`} style={{ borderBottom: `1px solid ${hairline}` }}>
                <td data-label="Item" style={{ fontWeight: 600, color: ink }}>{item.name}</td>
                <td data-label="SKU" style={{ fontSize: 12, fontFamily: "'JetBrains Mono',monospace", color: inkSoft }}>{item.sku}</td>
                <td data-label="Stock" className="num" style={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums', color: (item.stock ?? 0) <= (item.reorderPoint ?? -1) ? danger : ink }}>
                  {item.stock ?? 0}
                </td>
                {showRop && <td data-label="Reorder Point" className="num" style={{ color: inkSoft }}>{item.reorderPoint ?? '-'}</td>}
                <td data-label="Cost Price" className="num" style={{ fontVariantNumeric: 'tabular-nums', color: teal[800] }}>
                  {currency}{(item.costPrice ?? 0).toFixed(2)}
                </td>
                <td data-label="Stock Value" className="num" style={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums', color: ink }}>
                  {currency}{((item.costPrice ?? 0) * Math.max(item.stock ?? 0, 0)).toFixed(2)}
                </td>
                <td data-label="Status" style={{ textAlign: 'center' }}>{statusBadge(item)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );

  return (
    <div className="h-full flex flex-col p-6 max-w-[1280px] mx-auto" style={{ background: paper, color: ink }}>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-[40px] h-[40px] rounded-[10px] flex items-center justify-center" style={{ background: 'linear-gradient(155deg, #1f8577, #0f544c)', boxShadow: '0 4px 10px -3px rgba(15,84,76,.6)' }}>
            <Package size={20} color="#fff" />
          </div>
          <div>
            <h1 style={{ fontFamily: "'DM Serif Display', 'Georgia', serif", fontWeight: 400, fontSize: 22, margin: 0, color: teal[800], letterSpacing: 0.2 }}>Inventory Reports</h1>
            <p style={{ margin: '2px 0 0', fontSize: 11.5, color: inkSoft, letterSpacing: 0.02 }}>{activeItems.length} active items · {currency}{totalValue.toFixed(2)} total value</p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b mb-6" style={{ borderColor: hairline, background: paper, borderRadius: '14px 14px 0 0' }}>
        <div className="flex items-center gap-6 px-4 overflow-x-auto custom-scrollbar">
          {TABS.map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              className="py-3 text-[13px] font-bold transition-all whitespace-nowrap flex items-center gap-1.5"
              style={{
                borderBottom: activeTab === tab.id ? '2px solid #0b3e39' : '2px solid transparent',
                color: activeTab === tab.id ? teal[800] : inkSoft,
                background: 'transparent', cursor: 'pointer'
              }}>
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab Content */}
      {activeTab === 'overview' && (
        <div className="flex-1 overflow-y-auto space-y-6">
          {/* KPI Row */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: 'Total Items', value: activeItems.length, icon: <Box size={20} />, color: 'teal', border: 'border-l-teal-500', iconBg: teal[50], iconText: teal[700] },
              { label: 'Top Product', value: productSalesAggregated[0]?.name || 'N/A', sub: productSalesAggregated[0] ? `${currency}${productSalesAggregated[0].profit.toFixed(2)} profit` : '', icon: <Award size={20} />, color: 'teal', border: 'border-l-teal-400', iconBg: teal[50], iconText: teal[600] },
              { label: 'Low Stock Items', value: lowStockItems.length, icon: <AlertTriangle size={20} />, color: 'amber', border: 'border-l-amber-500', iconBg: amber[100], iconText: '#8c5c1f' },
              { label: 'Out of Stock', value: outOfStock.length, icon: <TrendingUp size={20} />, color: 'red', border: 'border-l-red-500', iconBg: '#fef2f2', iconText: danger },
            ].map((kpi: any) => (
              <div key={kpi.label} className="p-3 md:p-4 rounded-xl flex items-center gap-4 transition-all" style={{ background: paper, borderLeft: `3px solid ${kpi.iconBg === teal[50] ? teal[500] : kpi.iconBg === amber[100] ? amber[500] : '#b5493f'}`, border: `1px solid ${hairline}`, borderLeftWidth: 3, borderLeftColor: kpi.label === 'Total Items' ? teal[500] : kpi.label === 'Top Product' ? teal[400] : kpi.label === 'Low Stock Items' ? amber[500] : '#b5493f' }}>
                <div className="p-2.5 rounded-lg" style={{ background: kpi.iconBg, color: kpi.iconText }}>{kpi.icon}</div>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-tight leading-none mb-1.5" style={{ color: inkSoft }}>{kpi.label}</p>
                  <p className="text-lg md:text-xl font-semibold finance-nums" style={{ color: ink, fontFamily: "'JetBrains Mono',monospace" }}>{kpi.value}</p>
                  {kpi.sub && <p className="text-[10px] mt-0.5" style={{ color: teal[600] }}>{kpi.sub}</p>}
                </div>
              </div>
            ))}
          </div>

          {/* Valuation by Category */}
          <div className="pp-panel" style={{ background: paper, border: `1px solid ${hairline}`, borderRadius: 14 }}>
            <h3 className="text-sm font-bold mb-4 flex items-center gap-2" style={{ color: ink }}>
              <Layers size={16} style={{ color: teal[500] }} /> Inventory Value by Category
            </h3>
            <div className="space-y-2">
              {valuationByCategory.map(([cat, data]) => {
                const pct = totalValue > 0 ? (data.value / totalValue) * 100 : 0;
                return (
                  <div key={cat} className="flex items-center gap-3">
                    <span className="w-32 text-xs font-semibold truncate" style={{ color: teal[800] }}>{cat}</span>
                    <div className="flex-1 h-2.5 rounded-full overflow-hidden" style={{ background: teal[50] }}>
                      <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: `linear-gradient(90deg, #1f8577, #0f544c)` }} />
                    </div>
                    <span className="w-24 text-xs font-semibold text-right finance-nums" style={{ color: '#111827', fontFamily: "'Inter', sans-serif" }}>{currency}{data.value.toFixed(2)}</span>
                    <span className="w-16 text-[10px] text-right" style={{ color: inkSoft }}>{pct.toFixed(1)}%</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Valuation by Warehouse */}
          <div className="pp-panel" style={{ background: paper, border: `1px solid ${hairline}`, borderRadius: 14 }}>
            <h3 className="text-sm font-bold mb-4 flex items-center gap-2" style={{ color: ink }}>
              <WarehouseIcon size={16} style={{ color: teal[500] }} /> Inventory Value by Warehouse
            </h3>
            <div className="space-y-2">
              {valuationByWarehouse.map(([wh, data]) => {
                const pct = totalValue > 0 ? (data.value / totalValue) * 100 : 0;
                return (
                  <div key={wh} className="flex items-center gap-3">
                    <span className="w-40 text-xs font-semibold truncate" style={{ color: teal[800] }}>{wh}</span>
                    <div className="flex-1 h-2.5 rounded-full overflow-hidden" style={{ background: teal[50] }}>
                      <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: `linear-gradient(90deg, #1f8577, #0f544c)` }} />
                    </div>
                    <span className="w-24 text-xs font-semibold text-right finance-nums" style={{ color: '#111827', fontFamily: "'Inter', sans-serif" }}>{currency}{data.value.toFixed(2)}</span>
                    <span className="w-16 text-[10px] text-right" style={{ color: inkSoft }}>{pct.toFixed(1)}%</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'stock-levels' && (
        <div className="flex-1 overflow-y-auto">
          {searchAndFilter}
          {renderTable(filteredItems as Item[])}
        </div>
      )}

      {activeTab === 'low-stock' && (
        <div className="flex-1 overflow-y-auto">
          <div className="flex items-center gap-2 mb-4 p-3 rounded-[8px]" style={{ background: amber[100], border: `1px solid ${amber[300]}` }}>
            <AlertTriangle size={16} style={{ color: '#8c5c1f' }} />
            <span className="text-xs font-medium" style={{ color: '#6b4513' }}>
              {lowStockItems.length} item{lowStockItems.length !== 1 ? 's' : ''} at or below reorder point. {outOfStock.length} item{outOfStock.length !== 1 ? 's' : ''} out of stock.
            </span>
          </div>
          {searchAndFilter}
          {renderTable(filteredItems as Item[], true)}
        </div>
      )}

      {activeTab === 'valuation' && (
        <div className="flex-1 overflow-y-auto space-y-6">
          {/* Classification Breakdown */}
          <div className="pp-panel" style={{ background: paper, border: `1px solid ${hairline}`, borderRadius: 14 }}>
            <h3 className="text-sm font-bold mb-4" style={{ color: ink }}>Value by Classification</h3>
            <div className="overflow-x-auto custom-scrollbar">
              <table className="pp-table" data-mobile-cards="true">
                <thead>
                  <tr>
                    <th>Classification</th>
                    <th className="num">Items</th>
                    <th className="num">Cost Value</th>
                    <th className="num">Share</th>
                  </tr>
                </thead>
                <tbody>
                  {(() => {
                    const cats = ['Raw Material', 'Consumable', 'Product', 'Stationery'];
                    const breakdown = cats.map(label => {
                      const items = activeItems.filter(i => (i.type || i.classification) === label);
                      const value = items.reduce((s, i) => s + (i.costPrice || 0) * Math.max(i.stock || 0, 0), 0);
                      return { label, items: items.length, value };
                    });
                    const total = breakdown.reduce((s, c) => s + c.value, 0);
                    return breakdown.map((c: { label: string; items: number; value: number }) => (
                      <tr key={c.label}>
                        <td data-label="Classification" style={{ fontWeight: 600, color: ink }}>{c.label}</td>
                        <td data-label="Items" className="num" style={{ color: inkSoft }}>{c.items}</td>
                        <td data-label="Cost Value" className="num" style={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums', color: ink }}>{currency}{c.value.toFixed(2)}</td>
                        <td data-label="Share" className="num">
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'flex-end' }}>
                            <div style={{ flex: 1, maxWidth: 120, height: 8, borderRadius: 4, background: teal[50], overflow: 'hidden' }}>
                              <div style={{ height: '100%', borderRadius: 4, background: `linear-gradient(90deg, #1f8577, #0f544c)`, width: `${total > 0 ? (c.value / total * 100) : 0}%` }} />
                            </div>
                            <span className="text-xs font-semibold finance-nums" style={{ color: inkSoft, width: 48, textAlign: 'right', fontFamily: "'JetBrains Mono',monospace" }}>{total > 0 ? (c.value / total * 100).toFixed(1) : '0.0'}%</span>
                          </div>
                        </td>
                      </tr>
                    ));
                  })()}
                </tbody>
              </table>
            </div>
          </div>
          {/* By Category */}
          <div className="pp-panel" style={{ background: paper, border: `1px solid ${hairline}`, borderRadius: 14 }}>
            <h3 className="text-sm font-bold mb-4" style={{ color: ink }}>Value by Category</h3>
            <div className="overflow-x-auto custom-scrollbar">
              <table className="pp-table" data-mobile-cards="true">
                <thead>
                  <tr>
                    <th>Category</th>
                    <th className="num">Items</th>
                    <th className="num">Total Cost</th>
                    <th className="num">Stock Value</th>
                    <th className="num">% of Total</th>
                  </tr>
                </thead>
                <tbody>
                  {valuationByCategory.map(([cat, data]) => (
                    <tr key={cat}>
                      <td data-label="Category" style={{ fontWeight: 600, color: ink }}>{cat}</td>
                      <td data-label="Items" className="num" style={{ color: inkSoft }}>{data.count}</td>
                      <td data-label="Total Cost" className="num" style={{ fontVariantNumeric: 'tabular-nums', color: '#111827' }}>{currency}{data.cost.toFixed(2)}</td>
                      <td data-label="Stock Value" className="num" style={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums', color: '#111827', fontFamily: "'Inter', sans-serif" }}>{currency}{data.value.toFixed(2)}</td>
                      <td data-label="% of Total" className="num" style={{ color: inkSoft }}>{totalValue > 0 ? ((data.value / totalValue) * 100).toFixed(1) : '0.0'}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          {/* By Warehouse */}
          <div className="pp-panel" style={{ background: paper, border: `1px solid ${hairline}`, borderRadius: 14 }}>
            <h3 className="text-sm font-bold mb-4" style={{ color: ink }}>Value by Warehouse</h3>
            <div className="overflow-x-auto custom-scrollbar">
              <table className="pp-table" data-mobile-cards="true">
                <thead>
                  <tr>
                    <th>Warehouse</th>
                    <th className="num">Items</th>
                    <th className="num">Stock Value</th>
                    <th className="num">% of Total</th>
                  </tr>
                </thead>
                <tbody>
                  {valuationByWarehouse.map(([wh, data]) => (
                    <tr key={wh}>
                      <td data-label="Warehouse" style={{ fontWeight: 600, color: ink }}>{wh}</td>
                      <td data-label="Items" className="num" style={{ color: inkSoft }}>{data.count}</td>
                      <td data-label="Stock Value" className="num" style={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums', color: '#111827', fontFamily: "'Inter', sans-serif" }}>{currency}{data.value.toFixed(2)}</td>
                      <td data-label="% of Total" className="num" style={{ color: inkSoft }}>{totalValue > 0 ? ((data.value / totalValue) * 100).toFixed(1) : '0.0'}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          {/* Total */}
          <div className="pp-panel" style={{ background: paper, border: `1px solid ${hairline}`, borderRadius: 14 }}>
            <div className="flex items-center justify-between">
              <span className="text-sm font-bold" style={{ color: ink }}>Total Inventory Value</span>
              <span className="text-lg font-bold finance-nums" style={{ color: '#111827', fontFamily: "'Inter', sans-serif" }}>{currency}{totalValue.toFixed(2)}</span>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'financials' && (
        <div className="flex-1 overflow-y-auto space-y-6">
          {/* Financial Basis KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: 'Total Cost Basis', value: currency + totalValue.toFixed(2), icon: <DollarSign size={20} />, border: teal[500], iconBg: teal[50], iconText: teal[700] },
              { label: 'Potential Revenue', value: currency + totalPotentialRevenue.toFixed(2), icon: <TrendingUp size={20} />, border: teal[400], iconBg: teal[50], iconText: teal[600] },
              { label: 'Gross Profit Potential', value: currency + grossProfitPotential.toFixed(2), icon: <Coins size={20} />, border: grossProfitPotential >= 0 ? teal[500] : '#b5493f', iconBg: grossProfitPotential >= 0 ? teal[50] : '#fef2f2', iconText: grossProfitPotential >= 0 ? teal[700] : danger },
              { label: 'Avg Markup', value: overallMarkupPct.toFixed(1) + '%', icon: <BarChart3 size={20} />, border: overallMarkupPct >= 20 ? teal[500] : amber[500], iconBg: 'bg-amber-50', iconText: overallMarkupPct >= 20 ? teal[700] : '#8c5c1f' },
            ].map(kpi => (
              <div key={kpi.label} className="p-3 md:p-4 rounded-xl flex items-center gap-4 transition-all" style={{ background: paper, border: `1px solid ${hairline}`, borderLeft: `3px solid ${kpi.border}` }}>
                <div className="p-2.5 rounded-lg" style={{ background: kpi.iconBg, color: kpi.iconText }}>{kpi.icon}</div>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-tight leading-none mb-1.5" style={{ color: inkSoft }}>{kpi.label}</p>
                  <p className="text-lg md:text-xl font-semibold finance-nums" style={{ color: '#111827', fontFamily: "'Inter', sans-serif" }}>{kpi.value}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Markup Distribution */}
          <div className="pp-panel" style={{ background: paper, border: `1px solid ${hairline}`, borderRadius: 14 }}>
            <h3 className="text-sm font-bold mb-4" style={{ color: ink }}>Markup Distribution</h3>
            <div className="space-y-3">
              {markupDistribution.map(b => {
                const totalInvValue = markupDistribution.reduce((s, x) => s + x.value, 0);
                const pct = totalInvValue > 0 ? (b.value / totalInvValue) * 100 : 0;
                return (
                  <div key={b.label}>
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="font-semibold" style={{ color: teal[800] }}>{b.label}</span>
                      <span style={{ color: inkSoft }}>{b.items} items · {currency}{b.value.toFixed(2)}</span>
                    </div>
                    <div className="h-2.5 rounded-full overflow-hidden" style={{ background: teal[50] }}>
                      <div className="h-full rounded-full transition-all" style={{
                        width: `${pct}%`,
                        background: b.label === '100%+' ? `linear-gradient(90deg, #1f8577, #0f544c)` : b.label === '0-10%' ? '#b5493f' : b.label === '10-20%' ? '#d99a3f' : `linear-gradient(90deg, #1f8577, #0f544c)`
                      }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Negative / Low Markup Warning */}
          {negativeMarkupItems.length > 0 && (
            <div className="pp-panel" style={{ background: paper, border: `1px solid ${hairline}`, borderRadius: 14 }}>
              <div className="flex items-center gap-2 mb-3">
                <AlertTriangle size={16} style={{ color: danger }} />
                <h3 className="text-sm font-bold" style={{ color: ink }}>Items Selling Below Cost ({negativeMarkupItems.length})</h3>
              </div>
              <div className="overflow-x-auto custom-scrollbar">
                <table className="pp-table" data-mobile-cards="true">
                  <thead>
                    <tr>
                      <th>Item</th>
                      <th className="num">Cost</th>
                      <th className="num">Selling Price</th>
                      <th className="num">Loss/Unit</th>
                      <th className="num">Stock</th>
                      <th className="num">Total Loss</th>
                    </tr>
                  </thead>
                  <tbody>
                    {negativeMarkupItems.map((i: Item, idx: number) => {
                      const loss = (i.costPrice || 0) - (i.sellingPrice || 0);
                      return (
                        <tr key={`${i.id}-${idx}`}>
                          <td data-label="Item" style={{ fontWeight: 600, color: ink }}>{i.name}</td>
                          <td data-label="Cost" className="num" style={{ fontVariantNumeric: 'tabular-nums', color: '#111827' }}>{currency}{(i.costPrice || 0).toFixed(2)}</td>
                          <td data-label="Selling Price" className="num" style={{ fontVariantNumeric: 'tabular-nums', color: danger }}>{currency}{(i.sellingPrice || 0).toFixed(2)}</td>
                          <td data-label="Loss/Unit" className="num" style={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums', color: danger }}>-{currency}{loss.toFixed(2)}</td>
                          <td data-label="Stock" className="num" style={{ color: inkSoft }}>{i.stock ?? 0}</td>
                          <td data-label="Total Loss" className="num" style={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums', color: danger }}>-{currency}{(loss * Math.max(i.stock || 0, 0)).toFixed(2)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === 'top-products' && (
        <div className="flex-1 overflow-y-auto">
          <div className="flex items-center gap-2 mb-4 p-3 rounded-[8px]" style={{ background: teal[50], border: `1px solid ${teal[200]}` }}>
            <Award size={16} style={{ color: teal[600] }} />
            <span className="text-xs font-medium" style={{ color: teal[800] }}>
              Top {productSalesAggregated.length} income-generating products ranked by total profit.
            </span>
          </div>
          <div className="pp-panel" style={{ padding: 0, background: paper, border: `1px solid ${hairline}`, borderRadius: 14 }}>
            <div className="overflow-x-auto custom-scrollbar">
              <table className="pp-table" data-mobile-cards="true">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Product</th>
                    <th className="num">Units Sold</th>
                    <th className="num">Revenue</th>
                    <th className="num">Cost</th>
                    <th className="num">Total Profit</th>
                    <th className="num">Markup</th>
                  </tr>
                </thead>
                <tbody>
                  {productSalesAggregated.length === 0 ? (
                    <tr><td colSpan={7} data-label="" className="px-4 py-12 text-center text-xs font-medium" style={{ color: inkSoft }}>No sales data available to compute product profitability.</td></tr>
                  ) : productSalesAggregated.slice(0, 100).map((p, i) => {
                    const markupPct = p.cost > 0 ? (p.profit / p.cost) * 100 : 0;
                    return (
                      <tr key={`${p.name}-${i}`}>
                        <td data-label="#" style={{ color: inkSoft, fontWeight: 600, fontFamily: "'JetBrains Mono',monospace" }}>{i + 1}</td>
                        <td data-label="Product">
                          <div style={{ fontWeight: 600, color: ink }}>{p.name}</div>
                          {p.sku && <div style={{ fontSize: 10, fontFamily: "'JetBrains Mono',monospace", color: inkSoft }}>{p.sku}</div>}
                        </td>
                        <td data-label="Units Sold" className="num" style={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums', color: '#111827', fontFamily: "'Inter', sans-serif" }}>{p.qty}</td>
                        <td data-label="Revenue" className="num" style={{ fontVariantNumeric: 'tabular-nums', color: '#111827', fontFamily: "'Inter', sans-serif" }}>{currency}{p.revenue.toFixed(2)}</td>
                        <td data-label="Cost" className="num" style={{ fontVariantNumeric: 'tabular-nums', color: '#111827', fontFamily: "'Inter', sans-serif" }}>{currency}{p.cost.toFixed(2)}</td>
                        <td data-label="Total Profit" className="num" style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: p.profit >= 0 ? teal[600] : danger, fontFamily: "'Inter', sans-serif" }}>{currency}{p.profit.toFixed(2)}</td>
                        <td data-label="Markup" className="num">
                          <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{
                            background: markupPct >= 30 ? teal[50] : markupPct >= 15 ? teal[100] : markupPct >= 0 ? amber[100] : '#fef2f2',
                            color: markupPct >= 30 ? teal[700] : markupPct >= 15 ? teal[600] : markupPct >= 0 ? '#8c5c1f' : danger,
                            border: `1px solid ${markupPct >= 30 ? teal[200] : markupPct >= 15 ? teal[200] : markupPct >= 0 ? amber[300] : '#f5c6c2'}`
                          }}>{markupPct.toFixed(1)}%</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'reorder' && (
        <div className="flex-1 overflow-y-auto">
          <div className="flex items-center gap-2 mb-4 p-3 rounded-[8px]" style={{ background: teal[50], border: `1px solid ${teal[200]}` }}>
            <ArrowUpDown size={16} style={{ color: teal[700] }} />
            <span className="text-xs font-medium" style={{ color: teal[800] }}>
              {lowStockItems.length} item{lowStockItems.length !== 1 ? 's' : ''} need reorder. Sorted by urgency (stock vs reorder point ratio).
            </span>
          </div>
          {searchAndFilter}
          {renderTable(filteredItems as Item[], true)}
        </div>
      )}
    </div>
  );
};

export default InventoryReports;
