import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Table2, Search, Filter, Download, FileSpreadsheet, FileText,
  ChevronLeft, ChevronRight, ArrowUpDown, ArrowUp, ArrowDown,
  Eye, EyeOff, Columns, PieChart, X, RotateCcw, Loader2
} from 'lucide-react';
import { useSales } from '../context/SalesContext';
import { useFinance } from '../context/FinanceContext';
import { useInventory } from '../context/InventoryContext';
import {
  exportToCsv, exportToPdf, filterData, paginateData, sortData, searchData,
  getColumnDefinitions, aggregateData, pivotData
} from '../services/advancedDataTableService';
import { useAuth } from '../context/AuthContext';

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

type DataSource = 'Sales' | 'Invoices' | 'Expenses' | 'Inventory' | 'Payments' | 'Customers';
type AggregateFn = 'sum' | 'avg' | 'count';
type TabMode = 'table' | 'pivot';

const DATA_SOURCES: DataSource[] = ['Sales', 'Invoices', 'Expenses', 'Inventory', 'Payments', 'Customers'];
const PAGE_SIZES = [10, 25, 50, 100];

const toSafeString = (v: unknown): string => v == null ? '' : String(v);

const formatCellValue = (value: unknown, type: string): string => {
  if (value == null) return '-';
  if (type === 'date') {
    const d = new Date(toSafeString(value));
    return isNaN(d.getTime()) ? toSafeString(value) : d.toLocaleDateString();
  }
  if (type === 'currency') return Number(value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (type === 'number') return Number(value).toLocaleString();
  if (type === 'boolean') return value ? 'Yes' : 'No';
  return toSafeString(value);
};

const AdvancedDataTable: React.FC = () => {
  const { notify } = useAuth();
  const { sales, customers } = useSales();
  const { invoices, expenses } = useFinance();
  const { inventory } = useInventory();

  const getDataSource = (source: string) => {
    switch (source) {
      case 'Sales': return sales || [];
      case 'Invoices': return invoices || [];
      case 'Expenses': return expenses || [];
      case 'Inventory': return inventory || [];
      case 'Payments': return [];
      case 'Customers': return customers || [];
      default: return [];
    }
  };

  const [dataSource, setDataSource] = useState<DataSource>('Sales');
  const rawData = useMemo(() => getDataSource(dataSource), [dataSource, sales, invoices, expenses, inventory, customers]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<string>('');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [columnVisibility, setColumnVisibility] = useState<Record<string, boolean>>({});
  const [showColumnPanel, setShowColumnPanel] = useState(false);
  const [showFilterPanel, setShowFilterPanel] = useState(false);
  const [filters, setFilters] = useState<Record<string, any>>({});

  const [tabMode, setTabMode] = useState<TabMode>('table');
  const [pivotRowField, setPivotRowField] = useState('');
  const [pivotColField, setPivotColField] = useState('');
  const [pivotValueField, setPivotValueField] = useState('');
  const [pivotAggFn, setPivotAggFn] = useState<AggregateFn>('sum');

  const columns = useMemo(() => getColumnDefinitions(rawData), [rawData]);

  useEffect(() => {
    const vis: Record<string, boolean> = {};
    columns.forEach(c => { vis[c.key] = true; });
    setColumnVisibility(prev => {
      const merged = { ...vis };
      Object.keys(prev).forEach(k => { if (k in vis) merged[k] = prev[k]; });
      return merged;
    });
  }, [columns]);

  useEffect(() => {
    setPage(1);
  }, [dataSource, searchQuery, filters, sortBy, sortDir]);

  const searched = useMemo(() => searchData(rawData as any[], searchQuery), [rawData, searchQuery]);
  const filtered = useMemo(() => filterData(searched, filters), [searched, filters]);
  const sorted = useMemo(() => sortData(filtered, sortBy, sortDir), [filtered, sortBy, sortDir]);
  const paginated = useMemo(() => paginateData(sorted, page, pageSize), [sorted, page, pageSize]);

  const handleSort = useCallback((key: string) => {
    setSortBy(prev => {
      if (prev === key) {
        setSortDir(d => d === 'asc' ? 'desc' : 'asc');
        return prev;
      }
      setSortDir('asc');
      return key;
    });
  }, []);

  const handleExportCsv = useCallback(() => {
    const visible = columns.filter(c => columnVisibility[c.key]);
    exportToCsv(filtered, `${dataSource}_export`, visible);
    notify?.('CSV exported successfully', 'success');
  }, [filtered, columns, columnVisibility, dataSource, notify]);

  const handleExportPdf = useCallback(() => {
    const visible = columns.filter(c => columnVisibility[c.key]);
    exportToPdf(filtered, `${dataSource} Report`, visible);
    notify?.('PDF report generated', 'success');
  }, [filtered, columns, columnVisibility, dataSource, notify]);

  const aggregationRow = useMemo(() => {
    if (filtered.length === 0) return null;
    const numericCols = columns.filter(c => c.type === 'number' || c.type === 'currency');
    const row: Record<string, string> = {};
    numericCols.forEach(col => {
      const values = filtered.map(r => Number(r[col.key])).filter(v => !isNaN(v));
      if (values.length > 0) {
        const sum = values.reduce((a, b) => a + b, 0);
        const avg = sum / values.length;
        row[col.key] = col.type === 'currency'
          ? `${sum.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (avg: ${avg.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })})`
          : `${sum.toLocaleString()} (avg: ${Math.round(avg).toLocaleString()})`;
      }
    });
    return row;
  }, [filtered, columns]);

  const pivotResult = useMemo(() => {
    if (!pivotRowField || !pivotColField || !pivotValueField || tabMode !== 'pivot') return [];
    try {
      return pivotData(filtered, [pivotRowField], [pivotColField], pivotValueField, pivotAggFn);
    } catch {
      return [];
    }
  }, [filtered, pivotRowField, pivotColField, pivotValueField, pivotAggFn, tabMode]);

  const pivotColValues = useMemo(() => {
    if (pivotResult.length === 0) return [];
    return Object.keys(pivotResult[0]).filter(k => k !== pivotRowField);
  }, [pivotResult, pivotRowField]);

  const visibleColumns = useMemo(() => columns.filter(c => columnVisibility[c.key]), [columns, columnVisibility]);

  const handleFilterChange = (key: string, value: any) => {
    setFilters((prev: Record<string, any>) => {
      const next = { ...prev };
      if (value === null || value === undefined || value === '' || (typeof value === 'object' && !value.min && !value.max && !value.start && !value.end)) {
        delete next[key];
      } else {
        next[key] = value;
      }
      return next;
    });
    setPage(1);
  };

  const clearFilters = () => {
    setFilters({});
    setSearchQuery('');
    setPage(1);
  };

  const hasActiveFilters = Object.keys(filters).length > 0 || searchQuery.length > 0;

  return (
    <div style={{ padding: '20px', minHeight: '100vh', background: paper, fontFamily: "'Inter','DM Sans',sans-serif", color: ink }}>
      <div style={{ marginBottom: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 400, fontFamily: "'DM Serif Display', 'Georgia', serif", color: teal[800], letterSpacing: 0.2, margin: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
            <Table2 color={teal[500]} size={20} /> Advanced Data Table
          </h1>
          <p style={{ fontSize: 12.5, color: inkSoft, marginTop: 4, fontWeight: 500 }}>Explore, filter, sort, and export your business data</p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', gap: 2, background: paper, border: `1.4px solid ${hairline}`, borderRadius: 9, padding: 2 }}>
            <button
              onClick={() => setTabMode('table')}
              style={{
                padding: '7px 14px', borderRadius: 8, border: 'none',
                background: tabMode === 'table' ? paper : 'transparent',
                color: tabMode === 'table' ? ink : inkSoft,
                fontSize: 12, fontWeight: 600, cursor: 'pointer',
                fontFamily: "'Inter', sans-serif",
                boxShadow: tabMode === 'table' ? '0 1px 4px rgba(0,0,0,0.06)' : 'none',
              }}
            >
              <Table2 size={14} style={{ display: 'inline', marginRight: 4 }} /> Table
            </button>
            <button
              onClick={() => setTabMode('pivot')}
              style={{
                padding: '7px 14px', borderRadius: 8, border: 'none',
                background: tabMode === 'pivot' ? paper : 'transparent',
                color: tabMode === 'pivot' ? ink : inkSoft,
                fontSize: 12, fontWeight: 600, cursor: 'pointer',
                fontFamily: "'Inter', sans-serif",
                boxShadow: tabMode === 'pivot' ? '0 1px 4px rgba(0,0,0,0.06)' : 'none',
              }}
            >
              <PieChart size={14} style={{ display: 'inline', marginRight: 4 }} /> Pivot
            </button>
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 16 }}>
        <select
          value={dataSource}
          onChange={e => setDataSource(e.target.value as DataSource)}
          style={{
            padding: '9px 12px', borderRadius: 9, border: `1.4px solid ${hairline}`,
            fontSize: 12.5, fontWeight: 600, color: inkSoft, background: paper,
            outline: 'none', cursor: 'pointer', fontFamily: "'Inter', sans-serif",
            appearance: 'none', paddingRight: 28,
            backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%235c6567'/%3E%3C/svg%3E")`,
            backgroundRepeat: 'no-repeat', backgroundPosition: 'right 10px center',
          }}
        >
          {DATA_SOURCES.map(ds => <option key={ds} value={ds}>{ds}</option>)}
        </select>

        <div style={{ position: 'relative', flex: 1, maxWidth: 400 }}>
          <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: inkSoft }} />
          <input
            type="text"
            placeholder="Search across all fields..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            style={{
              width: '100%', padding: '9px 12px 9px 32px', borderRadius: 9,
              border: `1.4px solid ${hairline}`, fontSize: 12.5, outline: 'none',
              fontFamily: "'Inter', sans-serif", color: ink, background: paper,
            }}
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery('')} style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: inkSoft }}>
              <X size={14} />
            </button>
          )}
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button
            onClick={() => setShowColumnPanel(!showColumnPanel)}
            style={{
              display: 'flex', alignItems: 'center', gap: 6, padding: '7px 12px',
              borderRadius: 9, border: `1.4px solid ${hairline}`, background: paper,
              color: inkSoft, fontSize: 12, fontWeight: 600, cursor: 'pointer',
              fontFamily: "'Inter', sans-serif", transition: 'all 0.15s',
            }}
          >
            <Columns size={14} /> Columns
          </button>

          <button
            onClick={() => setShowFilterPanel(!showFilterPanel)}
            style={{
              display: 'flex', alignItems: 'center', gap: 6, padding: '7px 12px',
              borderRadius: 9, border: `1.4px solid ${hairline}`, background: paper,
              color: inkSoft, fontSize: 12, fontWeight: 600, cursor: 'pointer',
              fontFamily: "'Inter', sans-serif", transition: 'all 0.15s',
            }}
          >
            <Filter size={14} /> Filters
          </button>

          <button onClick={handleExportCsv} style={{
            display: 'flex', alignItems: 'center', gap: 6, padding: '7px 12px',
            borderRadius: 9, border: `1.4px solid ${hairline}`, background: paper,
            color: inkSoft, fontSize: 12, fontWeight: 600, cursor: 'pointer',
            fontFamily: "'Inter', sans-serif", transition: 'all 0.15s',
          }}>
            <FileSpreadsheet size={14} /> CSV
          </button>
          <button onClick={handleExportPdf} style={{
            display: 'flex', alignItems: 'center', gap: 6, padding: '7px 12px',
            borderRadius: 9, border: `1.4px solid ${hairline}`, background: paper,
            color: inkSoft, fontSize: 12, fontWeight: 600, cursor: 'pointer',
            fontFamily: "'Inter', sans-serif", transition: 'all 0.15s',
          }}>
            <FileText size={14} /> PDF
          </button>

          {hasActiveFilters && (
            <button onClick={clearFilters} style={{
              display: 'flex', alignItems: 'center', gap: 6, padding: '7px 12px',
              borderRadius: 9, border: `1.4px solid ${hairline}`, background: paper,
              color: danger, fontSize: 12, fontWeight: 600, cursor: 'pointer',
              fontFamily: "'Inter', sans-serif", transition: 'all 0.15s',
            }}>
              <RotateCcw size={14} /> Reset
            </button>
          )}
        </div>
      </div>

      {showFilterPanel && (
        <div style={{ marginBottom: 16, background: paper, borderRadius: 14, border: `1.4px solid ${hairline}`, boxShadow: '0 1px 3px rgba(0,0,0,0.04)', padding: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <label style={{ fontSize: 10, fontWeight: 700, color: inkSoft, textTransform: 'uppercase', letterSpacing: '0.08em', display: 'flex', alignItems: 'center', gap: 6 }}>
              <Filter size={12} /> Filter By Column
            </label>
            <button onClick={() => setShowFilterPanel(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: inkSoft }}>
              <X size={14} />
            </button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
            {columns.map(col => {
              const currentVal = filters[col.key];
              if (col.type === 'string') {
                return (
                  <div key={col.key} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <label style={{ fontSize: 10, fontWeight: 700, color: inkSoft, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{col.label}</label>
                    <input
                      type="text"
                      placeholder={`Contains "${col.label}"...`}
                      value={typeof currentVal === 'string' ? currentVal : ''}
                      onChange={e => handleFilterChange(col.key, e.target.value)}
                      style={{ padding: '7px 10px', borderRadius: 8, border: `1.4px solid ${hairline}`, fontSize: 12, outline: 'none', fontFamily: "'Inter', sans-serif", color: ink, background: paper }}
                    />
                  </div>
                );
              }
              if (col.type === 'number' || col.type === 'currency') {
                const rangeVal = currentVal as { min?: string; max?: string } | undefined;
                return (
                  <div key={col.key} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <label style={{ fontSize: 10, fontWeight: 700, color: inkSoft, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{col.label}</label>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <input
                        type="number"
                        placeholder="Min"
                        value={rangeVal?.min ?? ''}
                        onChange={e => handleFilterChange(col.key, { ...(rangeVal || {}), min: e.target.value ? Number(e.target.value) : undefined })}
                        style={{ flex: 1, padding: '7px 10px', borderRadius: 8, border: `1.4px solid ${hairline}`, fontSize: 12, outline: 'none', fontFamily: "'Inter', sans-serif", color: ink, background: paper }}
                      />
                      <input
                        type="number"
                        placeholder="Max"
                        value={rangeVal?.max ?? ''}
                        onChange={e => handleFilterChange(col.key, { ...(rangeVal || {}), max: e.target.value ? Number(e.target.value) : undefined })}
                        style={{ flex: 1, padding: '7px 10px', borderRadius: 8, border: `1.4px solid ${hairline}`, fontSize: 12, outline: 'none', fontFamily: "'Inter', sans-serif", color: ink, background: paper }}
                      />
                    </div>
                  </div>
                );
              }
              if (col.type === 'date') {
                const dateVal = currentVal as { start?: string; end?: string } | undefined;
                return (
                  <div key={col.key} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <label style={{ fontSize: 10, fontWeight: 700, color: inkSoft, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{col.label}</label>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <input
                        type="date"
                        value={dateVal?.start ?? ''}
                        onChange={e => handleFilterChange(col.key, { ...(dateVal || {}), start: e.target.value || undefined })}
                        style={{ flex: 1, padding: '7px 10px', borderRadius: 8, border: `1.4px solid ${hairline}`, fontSize: 12, outline: 'none', fontFamily: "'Inter', sans-serif", color: ink, background: paper }}
                      />
                      <input
                        type="date"
                        value={dateVal?.end ?? ''}
                        onChange={e => handleFilterChange(col.key, { ...(dateVal || {}), end: e.target.value || undefined })}
                        style={{ flex: 1, padding: '7px 10px', borderRadius: 8, border: `1.4px solid ${hairline}`, fontSize: 12, outline: 'none', fontFamily: "'Inter', sans-serif", color: ink, background: paper }}
                      />
                    </div>
                  </div>
                );
              }
              if (col.type === 'boolean') {
                return (
                  <div key={col.key} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <label style={{ fontSize: 10, fontWeight: 700, color: inkSoft, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{col.label}</label>
                    <select
                      value={currentVal === undefined ? '' : currentVal ? 'true' : 'false'}
                      onChange={e => {
                        const v = e.target.value;
                        handleFilterChange(col.key, v === '' ? undefined : v === 'true');
                      }}
                      style={{ padding: '7px 10px', borderRadius: 8, border: `1.4px solid ${hairline}`, fontSize: 12, outline: 'none', fontFamily: "'Inter', sans-serif", color: ink, background: paper }}
                    >
                      <option value="">All</option>
                      <option value="true">True</option>
                      <option value="false">False</option>
                    </select>
                  </div>
                );
              }
              return null;
            })}
          </div>
        </div>
      )}

      {tabMode === 'pivot' && (
        <div style={{ marginBottom: 16, background: paper, borderRadius: 14, border: `1.4px solid ${hairline}`, boxShadow: '0 1px 3px rgba(0,0,0,0.04)', padding: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label style={{ fontSize: 10, fontWeight: 700, color: inkSoft, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Row Field</label>
              <select
                value={pivotRowField}
                onChange={e => setPivotRowField(e.target.value)}
                style={{ padding: '7px 10px', borderRadius: 8, border: `1.4px solid ${hairline}`, fontSize: 12, outline: 'none', fontFamily: "'Inter', sans-serif", color: ink, background: paper }}
              >
                <option value="">Select row field...</option>
                {columns.map(col => <option key={col.key} value={col.key}>{col.label}</option>)}
              </select>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label style={{ fontSize: 10, fontWeight: 700, color: inkSoft, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Column Field</label>
              <select
                value={pivotColField}
                onChange={e => setPivotColField(e.target.value)}
                style={{ padding: '7px 10px', borderRadius: 8, border: `1.4px solid ${hairline}`, fontSize: 12, outline: 'none', fontFamily: "'Inter', sans-serif", color: ink, background: paper }}
              >
                <option value="">Select column field...</option>
                {columns.map(col => <option key={col.key} value={col.key}>{col.label}</option>)}
              </select>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label style={{ fontSize: 10, fontWeight: 700, color: inkSoft, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Value Field</label>
              <select
                value={pivotValueField}
                onChange={e => setPivotValueField(e.target.value)}
                style={{ padding: '7px 10px', borderRadius: 8, border: `1.4px solid ${hairline}`, fontSize: 12, outline: 'none', fontFamily: "'Inter', sans-serif", color: ink, background: paper }}
              >
                <option value="">Select value field...</option>
                {columns.filter(c => c.type === 'number' || c.type === 'currency').map(col => <option key={col.key} value={col.key}>{col.label}</option>)}
              </select>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label style={{ fontSize: 10, fontWeight: 700, color: inkSoft, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Aggregate</label>
              <select
                value={pivotAggFn}
                onChange={e => setPivotAggFn(e.target.value as AggregateFn)}
                style={{ padding: '7px 10px', borderRadius: 8, border: `1.4px solid ${hairline}`, fontSize: 12, outline: 'none', fontFamily: "'Inter', sans-serif", color: ink, background: paper }}
              >
                <option value="sum">Sum</option>
                <option value="avg">Average</option>
                <option value="count">Count</option>
              </select>
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', background: paper, borderRadius: 14, border: `1.4px solid ${hairline}` }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
            <Loader2 size={32} style={{ animation: 'spin 1s linear infinite', color: teal[500] }} />
            <p style={{ fontSize: 13.5, fontWeight: 600, color: inkSoft }}>Loading data...</p>
          </div>
        </div>
      ) : error ? (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', background: paper, borderRadius: 14, border: `1.4px solid ${hairline}` }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
            <p style={{ fontSize: 13.5, fontWeight: 700, color: danger }}>Failed to load data</p>
            <p style={{ fontSize: 12, color: inkSoft }}>{error}</p>
          </div>
        </div>
      ) : tabMode === 'pivot' ? (
        <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', background: paper, borderRadius: 14, border: `1.4px solid ${hairline}`, boxShadow: '0 1px 3px rgba(0,0,0,0.04)', overflow: 'hidden' }}>
          {pivotResult.length === 0 ? (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: inkSoft }}>
              <div style={{ textAlign: 'center' }}>
                <PieChart size={48} style={{ margin: '0 auto 12px', opacity: 0.2 }} />
                <p style={{ fontSize: 13.5, fontWeight: 700, margin: 0 }}>Configure pivot fields above</p>
                <p style={{ fontSize: 12, marginTop: 4, color: inkSoft }}>Select row, column, and value fields to generate the pivot table</p>
              </div>
            </div>
          ) : (
            <div style={{ overflow: 'auto', flex: 1 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, textAlign: 'left' }}>
                <thead>
                  <tr style={{ color: inkSoft, fontWeight: 700, fontSize: 10, letterSpacing: '0.08em', borderBottom: `1px solid ${hairline}`, backgroundColor: teal[50], textTransform: 'uppercase' }}>
                    <th style={{ padding: '10px 14px', position: 'sticky', left: 0, background: teal[50], boxShadow: '2px 0 4px rgba(0,0,0,0.04)', zIndex: 10 }}>{pivotRowField}</th>
                    {pivotColValues.map(col => <th key={col} style={{ padding: '10px 14px', textAlign: 'right' }}>{col}</th>)}
                  </tr>
                </thead>
                <tbody style={{ borderBottom: `1px solid ${hairline}` }}>
                  {pivotResult.map((row, i) => (
                    <tr key={i} style={{ transition: 'background-color 0.1s' }}
                      onMouseEnter={e => { e.currentTarget.style.backgroundColor = teal[50]; }}
                      onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'transparent'; }}
                    >
                      <td style={{ padding: '8px 14px', fontWeight: 600, color: ink, position: 'sticky', left: 0, background: paper, boxShadow: '2px 0 4px rgba(0,0,0,0.04)' }}>{row[pivotRowField]}</td>
                      {pivotColValues.map(col => (
                        <td key={col} style={{ padding: '8px 14px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: inkSoft }}>{Number(row[col] ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : (
        <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', background: paper, borderRadius: 14, border: `1.4px solid ${hairline}`, boxShadow: '0 1px 3px rgba(0,0,0,0.04)', overflow: 'hidden' }}>
          {rawData.length === 0 ? (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: inkSoft }}>
              <div style={{ textAlign: 'center' }}>
                <Table2 size={48} style={{ margin: '0 auto 12px', opacity: 0.2 }} />
                <p style={{ fontSize: 13.5, fontWeight: 700, margin: 0 }}>No data available</p>
                <p style={{ fontSize: 12, marginTop: 4, color: inkSoft }}>Select a different data source or adjust your filters</p>
              </div>
            </div>
          ) : (
            <>
              <div style={{ overflow: 'auto', flex: 1 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, textAlign: 'left' }}>
                  <thead>
                    <tr style={{ color: inkSoft, fontWeight: 700, fontSize: 10, letterSpacing: '0.08em', borderBottom: `1px solid ${hairline}`, backgroundColor: teal[50], textTransform: 'uppercase' }}>
                      {visibleColumns.map(col => (
                        <th
                          key={col.key}
                          onClick={() => handleSort(col.key)}
                          style={{ padding: '10px 14px', cursor: 'pointer', hoverColor: ink, transition: 'color 0.1s', whiteSpace: 'nowrap', userSelect: 'none' }}
                        >
                          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                            {col.label}
                            {sortBy === col.key ? (
                              sortDir === 'asc' ? <ArrowUp size={10} /> : <ArrowDown size={10} />
                            ) : (
                              <ArrowUpDown size={10} style={{ opacity: 0.3 }} />
                            )}
                          </span>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody style={{ borderBottom: `1px solid ${hairline}` }}>
                    {paginated.data.length === 0 ? (
                      <tr>
                        <td colSpan={visibleColumns.length} style={{ padding: '48px 14px', textAlign: 'center', color: inkSoft }}>
                          <p style={{ fontSize: 13.5, fontWeight: 700, margin: 0 }}>No matching records</p>
                          <p style={{ fontSize: 12, marginTop: 4, color: inkSoft }}>Try adjusting your filters or search terms</p>
                        </td>
                      </tr>
                    ) : (
                      paginated.data.map((row, rowIdx) => (
                        <tr key={rowIdx} style={{ transition: 'background-color 0.1s' }}
                          onMouseEnter={e => { e.currentTarget.style.backgroundColor = teal[50]; }}
                          onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'transparent'; }}
                        >
                          {visibleColumns.map(col => (
                            <td key={col.key} style={{ padding: '8px 14px', color: inkSoft, whiteSpace: 'nowrap', maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {formatCellValue(row[col.key], col.type)}
                            </td>
                          ))}
                        </tr>
                      ))
                    )}
                  </tbody>
                  {aggregationRow && (
                    <tfoot>
                      <tr style={{ backgroundColor: teal[50], borderTop: `2px solid ${hairline}` }}>
                        {visibleColumns.map(col => (
                          <td key={col.key} style={{ padding: '8px 14px', whiteSpace: 'nowrap', fontSize: 11 }}>
                            {(col.type === 'number' || col.type === 'currency') && aggregationRow[col.key]
                              ? <span style={{ fontVariantNumeric: 'tabular-nums' }}>{aggregationRow[col.key]}</span>
                              : col === visibleColumns[0] ? 'Totals (Sum / Avg)' : '-'}
                          </td>
                        ))}
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderTop: `1px solid ${hairline}`, background: paper }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span style={{ fontSize: 11, color: inkSoft, fontWeight: 500 }}>
                    {paginated.totalItems > 0
                      ? `${(paginated.currentPage - 1) * pageSize + 1}-${Math.min(paginated.currentPage * pageSize, paginated.totalItems)} of ${paginated.totalItems} items`
                      : '0 items'}
                  </span>
                  <select
                    value={pageSize}
                    onChange={e => { setPageSize(Number(e.target.value)); setPage(1); }}
                    style={{ padding: '4px 8px', borderRadius: 8, border: `1.4px solid ${hairline}`, fontSize: 11, fontWeight: 600, color: inkSoft, outline: 'none', fontFamily: "'Inter', sans-serif", background: paper }}
                  >
                    {PAGE_SIZES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div style={{ display: 'flex', gap: 4 }}>
                  <button
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    disabled={!paginated.hasPrev}
                    style={{ padding: '6px 10px', borderRadius: 8, border: `1px solid ${hairline}`, background: paper, color: inkSoft, cursor: 'pointer', fontSize: 12, transition: 'all 0.15s', fontFamily: "'Inter', sans-serif" }}
                  >
                    <ChevronLeft size={16} />
                  </button>
                  {Array.from({ length: Math.min(paginated.totalPages, 5) }, (_, i) => {
                    const start = Math.max(1, paginated.currentPage - 2);
                    const pageNum = start + i;
                    if (pageNum > paginated.totalPages) return null;
                    return (
                      <button
                        key={pageNum}
                        onClick={() => setPage(pageNum)}
                        style={{
                          width: 32, height: 32, borderRadius: 8, fontSize: 11, fontWeight: 600,
                          border: `1px solid ${hairline}`, background: paginated.currentPage === pageNum ? teal[500] : paper,
                          color: paginated.currentPage === pageNum ? '#fff' : inkSoft,
                          cursor: 'pointer', transition: 'all 0.15s', fontFamily: "'Inter', sans-serif",
                        }}
                      >
                        {pageNum}
                      </button>
                    );
                  })}
                  <button
                    onClick={() => setPage(p => Math.min(paginated.totalPages, p + 1))}
                    disabled={!paginated.hasNext}
                    style={{ padding: '6px 10px', borderRadius: 8, border: `1px solid ${hairline}`, background: paper, color: inkSoft, cursor: 'pointer', fontSize: 12, transition: 'all 0.15s', fontFamily: "'Inter', sans-serif" }}
                  >
                    <ChevronRight size={16} />
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default AdvancedDataTable;
