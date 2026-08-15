import React, { useEffect, useMemo, useState } from 'react';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import {
  Activity,
  BarChart3,
  Coins,
  Filter,
  PieChart as PieChartIcon,
  Printer,
  Receipt,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  Users,
  X,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useSales } from '../context/SalesContext';
import { useFinance } from '../context/FinanceContext';
import { useOrders } from '../context/OrdersContext';
import { useExamination } from '../context/ExaminationContext';
import { useLocation, useNavigate } from 'react-router-dom';
import SalesAudit from './reports/SalesAudit';
import RevenueDashboard from './reports/RevenueDashboard';
import ClientLedger from './reports/ClientLedger';
import InternalAuditor from './reports/InternalAuditor';
import RoundingAnalytics from './reports/RoundingAnalytics';
import BusinessHealthReport from './reports/BusinessHealthReport';
import WalletStatement from './reports/WalletStatement';
import CustomerStatement from './reports/CustomerStatement';
import { currencyService } from '../services/currencyService';
import { getRevenueSourceLabel } from '../services/revenueAnalysisService';
const teal={50:'#eef7f6',100:'#d3ece9',200:'#a6d9d3',300:'#72c0b7',400:'#3fa294',500:'#1f8577',600:'#146b60',700:'#0f544c',800:'#0b3e39',900:'#082e2a'};
const amber={100:'#fbead0',300:'#eec27a',500:'#d99a3f',600:'#b97e2b'};
const paper='#FEFDFB',ink='#23282A',inkSoft='#5c6567',hairline='#e4ddd1',danger='#b5493f';

import {
  buildRevenueReportingSnapshot,
  buildRevenueReportingSnapshotFromLines,
  type RevenueDateRange,
} from '../services/revenueReportingService';

type ReportCategory =
  | 'Overview'
  | 'Sales Audit'
  | 'Auditor'
  | 'Financials'
  | 'Client Ledger'
  | 'Wallet Statement'
  | 'Customer Statement'
  | 'Margin Performance'
  | 'Rounding Analytics'
  | 'Business Intel'
  | 'Health Diagnostic';

const Reports: React.FC = () => {
  const { companyConfig } = useAuth();
  const { sales = [], customers = [] } = useSales();
  const { invoices = [] } = useFinance();
  const { orders = [] } = useOrders();
  const { batches: examinationBatches = [] } = useExamination();
  const location = useLocation();
  const navigate = useNavigate();
    const currency = companyConfig?.currencySymbol || currencyService.getCurrency(currencyService.getBaseCurrency())?.symbol || '$';

  const [activeCategory, setActiveCategory] = useState<ReportCategory>(() => {
    if (location.pathname.includes('sales-audit')) return 'Sales Audit';
    if (location.pathname.includes('margin-performance')) return 'Margin Performance';
    if (location.pathname.includes('rounding-analytics')) return 'Rounding Analytics';
    if (location.pathname.includes('financials')) return 'Financials';
    if (location.pathname.includes('contacts')) return 'Client Ledger';
    if (location.pathname.includes('wallet-statement')) return 'Wallet Statement';
    if (location.pathname.includes('customer-statement')) return 'Customer Statement';
    if (location.pathname.includes('auditor')) return 'Auditor';
    if (location.pathname.includes('intel')) return 'Business Intel';
    if (location.pathname.includes('health')) return 'Health Diagnostic';
    return 'Overview';
  });
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [selectedSubAccountNames, setSelectedSubAccountNames] = useState<string[]>([]);
  const [isCustomerFilterOpen, setIsCustomerFilterOpen] = useState(false);
  const [selectedDateRange, setSelectedDateRange] = useState<RevenueDateRange>('all');

  useEffect(() => {
    if (location.pathname.includes('sales-audit')) setActiveCategory('Sales Audit');
    else if (location.pathname.includes('margin-performance')) setActiveCategory('Margin Performance');
    else if (location.pathname.includes('rounding-analytics')) setActiveCategory('Rounding Analytics');
    else if (location.pathname.includes('financials')) setActiveCategory('Financials');
    else if (location.pathname.includes('contacts')) setActiveCategory('Client Ledger');
    else if (location.pathname.includes('wallet-statement')) setActiveCategory('Wallet Statement');
    else if (location.pathname.includes('customer-statement')) setActiveCategory('Customer Statement');
    else if (location.pathname.includes('auditor')) setActiveCategory('Auditor');
    else if (location.pathname.includes('intel')) setActiveCategory('Business Intel');
    else if (location.pathname.includes('health')) setActiveCategory('Health Diagnostic');
    else if (location.pathname.endsWith('/revenue') || location.pathname.endsWith('/reports')) setActiveCategory('Overview');
  }, [location.pathname]);

  const formatCurrency = (value: number) =>
    `${currency}${Number(value || 0).toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;

  const marginBaseReport = useMemo(
    () =>
      buildRevenueReportingSnapshot({
        sales,
        invoices,
        orders,
        batches: examinationBatches,
        dateRange: selectedDateRange,
        trendDays: 12,
      }),
    [sales, invoices, orders, examinationBatches, selectedDateRange]
  );

  const selectedCustomerName = useMemo(
    () => customers.find((customer: any) => customer.id === selectedCustomerId)?.name || '',
    [customers, selectedCustomerId]
  );

  const availableSubAccounts = useMemo(() => {
    if (!selectedCustomerId) return [];
    const customer = customers.find((entry: any) => entry.id === selectedCustomerId);
    return ['Main', ...((customer?.subAccounts || []).map((sub: any) => String(sub?.name || '').trim()).filter(Boolean))];
  }, [customers, selectedCustomerId]);

  const marginScopedLines = useMemo(() => {
    return marginBaseReport.lines.filter((line) => {
      if (selectedCustomerName && line.customerName !== selectedCustomerName) return false;
      if (selectedSubAccountNames.length > 0) {
        const normalizedSubAccount = String(line.subAccountName || 'Main').trim() || 'Main';
        if (!selectedSubAccountNames.includes(normalizedSubAccount)) return false;
      }
      return true;
    });
  }, [marginBaseReport.lines, selectedCustomerName, selectedSubAccountNames]);

  const marginReport = useMemo(
    () => buildRevenueReportingSnapshotFromLines({ lines: marginScopedLines, trendDays: 12 }),
    [marginScopedLines]
  );

  const renderAuditor = () => <InternalAuditor />;
  const renderClientLedger = () => <ClientLedger />;
  const renderWalletStatement = () => <WalletStatement />;
  const renderCustomerStatement = () => <CustomerStatement />;
  const renderBusinessIntel = () => <BusinessHealthReport />;

  const renderMarginPerformance = () => {
    const marginPercent = marginReport.totals.revenue > 0
      ? (marginReport.totals.profitMargin / marginReport.totals.revenue) * 100
      : 0;
    const adjustmentShare = marginReport.totals.revenue > 0
      ? (marginReport.totals.adjustmentTotal / marginReport.totals.revenue) * 100
      : 0;

    return (
      <div style={{ marginTop: '24px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px' }}>
          <div style={{ background: '#FEFDFB', padding: '12px', borderRadius: '12px', boxShadow: '0 1px 2px rgba(0,0,0,.05)', border: '1.4px solid #e4ddd1', borderColor: '#e4ddd1', display: 'flex', alignItems: 'center', gap: '16px', borderLeftWidth: '4px', borderLeftColor: '#1f8577', transition: 'all .15s ease', transitionDuration: '200ms' }}>
            <div style={{ padding: '10px', background: '#eef7f6', color: '#1f8577', borderRadius: '10px', flexShrink: 0 }}><TrendingUp size={20} /></div>
            <div style={{ minWidth: 0 }}>
              <p style={{ fontWeight: 700, color: '#5c6567', textTransform: 'uppercase', letterSpacing: '-.025em', lineHeight: 1, marginBottom: '6px' }}>Markup Rate</p>
              <p className={`text-lg md:text-xl font-semibold ${marginPercent >= 20 ? 'text-emerald-600' : 'text-amber-600'}`}>{marginPercent.toFixed(1)}%</p>
              <p style={{ color: '#5c6567', marginTop: '2px' }}>{selectedCustomerName ? `${selectedCustomerName} scope` : 'All revenue sources'}</p>
            </div>
          </div>

          <div style={{ background: '#FEFDFB', padding: '12px', borderRadius: '12px', boxShadow: '0 1px 2px rgba(0,0,0,.05)', border: '1.4px solid #e4ddd1', borderColor: '#e4ddd1', display: 'flex', alignItems: 'center', gap: '16px', borderLeftWidth: '4px', borderLeftColor: '#1f8577', transition: 'all .15s ease', transitionDuration: '200ms' }}>
            <div style={{ padding: '10px', background: '#eef7f6', color: '#1f8577', borderRadius: '10px', flexShrink: 0 }}><BarChart3 size={20} /></div>
            <div style={{ minWidth: 0 }}>
              <p style={{ fontWeight: 700, color: '#5c6567', textTransform: 'uppercase', letterSpacing: '-.025em', lineHeight: 1, marginBottom: '6px' }}>Profit Markup</p>
              <p style={{ fontSize: '16px', fontWeight: 600, color: '#1f8577' }}>{formatCurrency(marginReport.totals.profitMargin)}</p>
              <p style={{ color: '#5c6567', marginTop: '2px' }}>{marginReport.totals.transactionCount} transactions</p>
            </div>
          </div>

          <div style={{ background: '#FEFDFB', padding: '12px', borderRadius: '12px', boxShadow: '0 1px 2px rgba(0,0,0,.05)', border: '1.4px solid #e4ddd1', borderColor: '#e4ddd1', display: 'flex', alignItems: 'center', gap: '16px', borderLeftWidth: '4px', borderLeftColor: '#1f8577', transition: 'all .15s ease', transitionDuration: '200ms' }}>
            <div style={{ padding: '10px', background: '#eef7f6', color: '#1f8577', borderRadius: '10px', flexShrink: 0 }}><Coins size={20} /></div>
            <div style={{ minWidth: 0 }}>
              <p style={{ fontWeight: 700, color: '#5c6567', textTransform: 'uppercase', letterSpacing: '-.025em', lineHeight: 1, marginBottom: '6px' }}>Market Adjustments</p>
              <p style={{ fontSize: '16px', fontWeight: 600, color: '#1f8577' }}>{formatCurrency(marginReport.totals.adjustmentTotal)}</p>
              <p style={{ color: '#5c6567', marginTop: '2px' }}>{adjustmentShare.toFixed(1)}% of revenue</p>
            </div>
          </div>

          <div style={{ background: '#FEFDFB', padding: '12px', borderRadius: '12px', boxShadow: '0 1px 2px rgba(0,0,0,.05)', border: '1.4px solid #e4ddd1', borderColor: '#e4ddd1', display: 'flex', alignItems: 'center', gap: '16px', borderLeftWidth: '4px', borderLeftColor: '#1f8577', transition: 'all .15s ease', transitionDuration: '200ms' }}>
            <div className={`p-2.5 rounded-lg shrink-0 ${marginReport.totals.roundingTotal >= 0 ? 'bg-cyan-50 text-cyan-600' : 'bg-rose-50 text-rose-600'}`}>
              <Activity size={20} />
            </div>
            <div style={{ minWidth: 0 }}>
              <p style={{ fontWeight: 700, color: '#5c6567', textTransform: 'uppercase', letterSpacing: '-.025em', lineHeight: 1, marginBottom: '6px' }}>Rounding Impact</p>
              <p className={`text-lg md:text-xl font-semibold ${marginReport.totals.roundingTotal >= 0 ? 'text-cyan-600' : 'text-rose-600'}`}>
                {marginReport.totals.roundingTotal >= 0 ? '+' : ''}{formatCurrency(marginReport.totals.roundingTotal)}
              </p>
              <p style={{ color: '#5c6567', marginTop: '2px' }}>Net round up / down</p>
            </div>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(1,1fr)', gap: '24px', marginTop: '24px' }}>
          <div style={{ background: '#FEFDFB', padding: '24px', borderRadius: '16px', border: '1.4px solid #e4ddd1', borderColor: '#e4ddd1', boxShadow: '0 1px 2px rgba(0,0,0,.05)' }}>
            <h3 style={{ fontWeight: 700, color: '#23282A', fontSize: '13px', letterSpacing: '-.025em', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <TrendingUp size={18} style={{ color: '#1f8577' }} />
              Markup Trend
            </h3>
            <div style={{ width: '100%', height: 256, minHeight: 160 }}>
              <ResponsiveContainer width="100%" height="100%" minHeight={160} minWidth={0}>
                <AreaChart data={marginReport.trend}>
                  <defs>
                    <linearGradient id="marginProfitFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.28} />
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="marginAdjustmentFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#6366f1" stopOpacity={0.24} />
                      <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                  <YAxis
                    tick={{ fontSize: 11, fill: '#94a3b8' }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(value) => `${currency}${value >= 1000 ? `${(value / 1000).toFixed(0)}k` : value}`}
                  />
                  <Tooltip
                    formatter={(value: number) => [formatCurrency(value), '']}
                    contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0', fontSize: '12px' }}
                  />
                  <Area type="monotone" dataKey="profitMargin" name="Profit Markup" stroke="#10b981" strokeWidth={2} fill="url(#marginProfitFill)" />
                  <Area type="monotone" dataKey="adjustmentTotal" name="Adjustments" stroke="#6366f1" strokeWidth={2} fill="url(#marginAdjustmentFill)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div style={{ background: '#FEFDFB', padding: '24px', borderRadius: '16px', border: '1.4px solid #e4ddd1', borderColor: '#e4ddd1', boxShadow: '0 1px 2px rgba(0,0,0,.05)' }}>
            <h3 style={{ fontWeight: 700, color: '#23282A', fontSize: '13px', letterSpacing: '-.025em', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Activity size={18} style={{ color: '#1f8577' }} />
              Source Performance
            </h3>
            <div style={{ width: '100%', height: 256, minHeight: 160 }}>
              <ResponsiveContainer width="100%" height="100%" minHeight={160} minWidth={0}>
                <BarChart
                  data={marginReport.sources.map((source) => ({
                    ...source,
                    label: getRevenueSourceLabel(source.source),
                  }))}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                  <YAxis
                    tick={{ fontSize: 11, fill: '#94a3b8' }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(value) => `${currency}${value >= 1000 ? `${(value / 1000).toFixed(0)}k` : value}`}
                  />
                  <Tooltip
                    formatter={(value: number) => [formatCurrency(value), '']}
                    contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0', fontSize: '12px' }}
                  />
                  <Bar dataKey="profitMargin" name="Profit Markup" fill="#10b981" radius={[6, 6, 0, 0]} />
                  <Bar dataKey="adjustmentTotal" name="Adjustments" fill="#6366f1" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        <div style={{ background: '#FEFDFB', padding: '24px', borderRadius: '16px', border: '1.4px solid #e4ddd1', borderColor: '#e4ddd1', boxShadow: '0 1px 2px rgba(0,0,0,.05)', overflow: 'hidden', marginTop: '24px' }}>
          <h3 style={{ fontWeight: 700, color: '#23282A', fontSize: '13px', letterSpacing: '-.025em', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Activity size={18} style={{ color: '#1f8577' }} />
            Revenue Source Matrix
          </h3>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', textAlign: 'left', fontSize: '13px' }}>
              <thead>
                <tr style={{ color: '#5c6567', fontWeight: 700, letterSpacing: '.1em', borderStyle: 'solid', borderColor: '#e4ddd1', textTransform: 'uppercase' }}>
                  <th style={{ paddingLeft: '16px', paddingTop: '12px', paddingRight: '16px', paddingBottom: '12px' }}>Source</th>
                  <th style={{ paddingLeft: '16px', paddingTop: '12px', textAlign: 'right', paddingRight: '16px', paddingBottom: '12px' }}>Transactions</th>
                  <th style={{ paddingLeft: '16px', paddingTop: '12px', textAlign: 'right', paddingRight: '16px', paddingBottom: '12px' }}>Revenue</th>
                  <th style={{ paddingLeft: '16px', paddingTop: '12px', textAlign: 'right', paddingRight: '16px', paddingBottom: '12px' }}>Material Cost</th>
                  <th style={{ paddingLeft: '16px', paddingTop: '12px', textAlign: 'right', paddingRight: '16px', paddingBottom: '12px' }}>Adjustments</th>
                  <th style={{ paddingLeft: '16px', paddingTop: '12px', textAlign: 'right', paddingRight: '16px', paddingBottom: '12px' }}>Profit Markup</th>
                  <th style={{ paddingLeft: '16px', paddingTop: '12px', textAlign: 'right', paddingRight: '16px', paddingBottom: '12px' }}>Rounding</th>
                </tr>
              </thead>
              <tbody style={{ borderColor: '#e4ddd1' }}>
                {marginReport.sources.map((source) => (
                  <tr key={source.source} style={{ transition: 'color .15s ease,background .15s ease,border-color .15s ease' }}>
                    <td style={{ paddingLeft: '16px', paddingTop: '12px', fontWeight: 600, color: '#23282A', paddingRight: '16px', paddingBottom: '12px' }}>{getRevenueSourceLabel(source.source)}</td>
                    <td style={{ paddingLeft: '16px', paddingTop: '12px', textAlign: 'right', color: '#5c6567', fontVariantNumeric: 'tabular-nums', paddingRight: '16px', paddingBottom: '12px' }}>{source.transactionCount}</td>
                    <td style={{ paddingLeft: '16px', paddingTop: '12px', textAlign: 'right', fontWeight: 600, color: '#23282A', fontVariantNumeric: 'tabular-nums', paddingRight: '16px', paddingBottom: '12px' }}>{formatCurrency(source.revenue)}</td>
                    <td style={{ paddingLeft: '16px', paddingTop: '12px', textAlign: 'right', color: '#5c6567', fontWeight: 600, fontVariantNumeric: 'tabular-nums', paddingRight: '16px', paddingBottom: '12px' }}>{formatCurrency(source.materialCost)}</td>
                    <td style={{ paddingLeft: '16px', paddingTop: '12px', textAlign: 'right', color: '#0f544c', fontWeight: 600, fontVariantNumeric: 'tabular-nums', paddingRight: '16px', paddingBottom: '12px' }}>{formatCurrency(source.adjustmentTotal)}</td>
                    <td style={{ paddingLeft: '16px', paddingTop: '12px', textAlign: 'right', color: '#0f544c', fontWeight: 600, fontVariantNumeric: 'tabular-nums', paddingRight: '16px', paddingBottom: '12px' }}>{formatCurrency(source.profitMargin)}</td>
                    <td className={`px-4 py-3 text-right font-semibold tabular-nums ${source.roundingTotal >= 0 ? 'text-blue-700' : 'text-rose-600'}`}>
                      {source.roundingTotal >= 0 ? '+' : ''}
                      {formatCurrency(source.roundingTotal)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(1,1fr)', gap: '24px', marginTop: '24px' }}>
          <div style={{ background: '#FEFDFB', padding: '24px', borderRadius: '16px', border: '1.4px solid #e4ddd1', borderColor: '#e4ddd1', boxShadow: '0 1px 2px rgba(0,0,0,.05)', overflow: 'hidden' }}>
            <h3 style={{ fontWeight: 700, color: '#23282A', fontSize: '13px', letterSpacing: '-.025em', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <BarChart3 size={18} style={{ color: '#1f8577' }} />
              Top Items by Markup
            </h3>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', textAlign: 'left', fontSize: '13px' }}>
                <thead>
                  <tr style={{ color: '#5c6567', fontWeight: 700, letterSpacing: '.1em', borderStyle: 'solid', borderColor: '#e4ddd1', textTransform: 'uppercase' }}>
                    <th style={{ paddingLeft: '16px', paddingTop: '12px', paddingRight: '16px', paddingBottom: '12px' }}>Item</th>
                    <th style={{ paddingLeft: '16px', paddingTop: '12px', paddingRight: '16px', paddingBottom: '12px' }}>Source</th>
                    <th style={{ paddingLeft: '16px', paddingTop: '12px', textAlign: 'right', paddingRight: '16px', paddingBottom: '12px' }}>Revenue</th>
                    <th style={{ paddingLeft: '16px', paddingTop: '12px', textAlign: 'right', paddingRight: '16px', paddingBottom: '12px' }}>Adjustments</th>
                    <th style={{ paddingLeft: '16px', paddingTop: '12px', textAlign: 'right', paddingRight: '16px', paddingBottom: '12px' }}>Profit Markup</th>
                  </tr>
                </thead>
                <tbody style={{ borderColor: '#e4ddd1' }}>
                  {marginReport.topItems.slice(0, 10).map((item) => (
                    <tr key={`${item.source}-${item.itemName}`} style={{ transition: 'color .15s ease,background .15s ease,border-color .15s ease' }}>
                      <td style={{ paddingLeft: '16px', paddingTop: '12px', fontWeight: 600, color: '#23282A', paddingRight: '16px', paddingBottom: '12px' }}>{item.itemName}</td>
                      <td style={{ paddingLeft: '16px', paddingTop: '12px', color: '#5c6567', paddingRight: '16px', paddingBottom: '12px' }}>{getRevenueSourceLabel(item.source)}</td>
                      <td style={{ paddingLeft: '16px', paddingTop: '12px', textAlign: 'right', fontWeight: 600, color: '#23282A', fontVariantNumeric: 'tabular-nums', paddingRight: '16px', paddingBottom: '12px' }}>{formatCurrency(item.revenue)}</td>
                      <td style={{ paddingLeft: '16px', paddingTop: '12px', textAlign: 'right', color: '#0f544c', fontWeight: 600, fontVariantNumeric: 'tabular-nums', paddingRight: '16px', paddingBottom: '12px' }}>{formatCurrency(item.adjustmentTotal)}</td>
                      <td style={{ paddingLeft: '16px', paddingTop: '12px', textAlign: 'right', color: '#0f544c', fontWeight: 600, fontVariantNumeric: 'tabular-nums', paddingRight: '16px', paddingBottom: '12px' }}>{formatCurrency(item.profitMargin)}</td>
                    </tr>
                  ))}
                  {marginReport.topItems.length === 0 && (
                    <tr>
                      <td colSpan={5} style={{ paddingLeft: '16px', paddingTop: '40px', textAlign: 'center', color: '#5c6567', paddingRight: '16px', paddingBottom: '40px' }}>No item markup data found for this scope.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div style={{ background: '#FEFDFB', padding: '24px', borderRadius: '16px', border: '1.4px solid #e4ddd1', borderColor: '#e4ddd1', boxShadow: '0 1px 2px rgba(0,0,0,.05)' }}>
            <h3 style={{ fontWeight: 700, color: '#23282A', fontSize: '13px', letterSpacing: '-.025em', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Coins size={18} style={{ color: '#1f8577' }} />
              Adjustment Ledger
            </h3>
            <div style={{ marginTop: '12px' }}>
              {marginReport.topAdjustments.slice(0, 8).map((adjustment) => (
                <div key={`${adjustment.source}-${adjustment.adjustmentName}`} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px', background: '#eef7f6', borderRadius: '12px', border: '1.4px solid #e4ddd1', borderColor: '#d3ece9' }}>
                  <div>
                    <p style={{ fontWeight: 600, color: '#23282A', fontSize: '13px' }}>{adjustment.adjustmentName}</p>
                    <p style={{ color: '#5c6567' }}>
                      {getRevenueSourceLabel(adjustment.source)} · {adjustment.transactionCount} transaction(s)
                    </p>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <p style={{ fontWeight: 700, color: '#0f544c', fontVariantNumeric: 'tabular-nums', fontSize: '13px' }}>{formatCurrency(adjustment.totalAmount)}</p>
                    <p style={{ color: '#5c6567' }}>{adjustment.applicationCount} application(s)</p>
                  </div>
                </div>
              ))}
              {marginReport.topAdjustments.length === 0 && (
                <div style={{ textAlign: 'center', color: '#5c6567', paddingTop: '40px', fontSize: '13px', paddingBottom: '40px' }}>No adjustment rows captured in this scope.</div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', width: '100%', fontFamily: 'Inter,"DM Sans",sans-serif', color: '#23282A', overflow: 'hidden' }}>
      <div style={{ background: '#FEFDFB', borderStyle: 'solid', borderColor: '#e4ddd1', flexShrink: 0, paddingLeft: '24px', paddingTop: '16px', display: 'flex', flexDirection: 'column', gap: '16px', paddingRight: '24px', paddingBottom: '16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h2 style={{ fontWeight: 700, fontSize: '24px', color: '#23282A', letterSpacing: '-.025em' }}>Business Intelligence</h2>
            <p style={{ color: '#5c6567', fontSize: '13px', fontWeight: 500 }}>Financial insights and performance metrics</p>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            {activeCategory === 'Margin Performance' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px', background: '#eef7f6', padding: '4px', borderRadius: '12px' }}>
                {(['all', 'week', 'month', 'quarter', 'year'] as const).map((range) => (
                  <button
                    key={range}
                    onClick={() => setSelectedDateRange(range)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                      selectedDateRange === range ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                    }`}
                  >
                    {range === 'all' ? 'All' : range.charAt(0).toUpperCase() + range.slice(1)}
                  </button>
                ))}
              </div>
            )}

            <div style={{ position: 'relative', marginRight: '16px' }}>
              <button
                onClick={() => setIsCustomerFilterOpen(!isCustomerFilterOpen)}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl border transition-all text-sm font-semibold tracking-wide ${
                  selectedCustomerId ? 'bg-blue-50 border-blue-200 text-blue-600' : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50 shadow-sm'
                }`}
              >
                <Filter size={16} />
                {selectedCustomerId ? customers.find((customer: any) => customer.id === selectedCustomerId)?.name : 'Filter by Customer'}
                {selectedCustomerId && (
                  <X
                    size={16}
                    style={{ marginLeft: '4px', transition: 'color .15s ease,background .15s ease,border-color .15s ease' }}
                    onClick={(event) => {
                      event.stopPropagation();
                      setSelectedCustomerId('');
                      setSelectedSubAccountNames([]);
                    }}
                  />
                )}
              </button>

              {isCustomerFilterOpen && (
                <div style={{ position: 'absolute', top: '100%', right: 0, marginTop: '8px', width: '288px', background: '#FEFDFB', border: '1.4px solid #e4ddd1', borderColor: '#e4ddd1', borderRadius: '16px', boxShadow: '0 20px 25px -5px rgba(0,0,0,.1)', zIndex: 50, padding: '16px' }}>
                  <div style={{ marginTop: '16px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                      <label style={{ fontWeight: 600, color: '#5c6567', letterSpacing: '.1em', display: 'block' }}>Select customer</label>
                      <button onClick={() => setIsCustomerFilterOpen(false)} style={{ color: '#5c6567' }}>
                        <X size={14} />
                      </button>
                    </div>
                    <select
                      value={selectedCustomerId}
                      onChange={(event) => {
                        setSelectedCustomerId(event.target.value);
                        setSelectedSubAccountNames([]);
                      }}
                      style={{ width: '100%', background: '#eef7f6', border: '1.4px solid #e4ddd1', borderColor: '#e4ddd1', borderRadius: '12px', paddingLeft: '12px', paddingTop: '8px', fontWeight: 500, outline: 'none', transition: 'color .15s ease,background .15s ease,border-color .15s ease', paddingRight: '12px', paddingBottom: '8px' }}
                    >
                      <option value="">All customers</option>
                      {customers.map((customer: any) => (
                        <option key={customer.id} value={customer.id}>{customer.name}</option>
                      ))}
                    </select>

                    {selectedCustomerId && availableSubAccounts.length > 0 && (
                      <div style={{ paddingTop: '8px', borderStyle: 'solid', borderColor: '#e4ddd1' }}>
                        <label style={{ fontWeight: 600, color: '#5c6567', letterSpacing: '.1em', marginBottom: '8px', display: 'block' }}>Filter sub-accounts</label>
                        <div style={{ marginTop: '6px', overflowY: 'auto' }}>
                          {availableSubAccounts.map((subAccount) => (
                            <label key={subAccount} style={{ display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer', padding: '6px', borderRadius: '10px', transition: 'color .15s ease,background .15s ease,border-color .15s ease' }}>
                              <input
                                type="checkbox"
                                checked={selectedSubAccountNames.includes(subAccount)}
                                onChange={(event) => {
                                  if (event.target.checked) {
                                    setSelectedSubAccountNames([...selectedSubAccountNames, subAccount]);
                                  } else {
                                    setSelectedSubAccountNames(selectedSubAccountNames.filter((entry) => entry !== subAccount));
                                  }
                                }}
                                style={{ width: '16px', height: '16px', borderRadius: '8px', borderColor: '#e4ddd1', color: '#1f8577', cursor: 'pointer' }}
                              />
                              <span style={{ fontWeight: 500, color: '#5c6567', transition: 'color .15s ease,background .15s ease,border-color .15s ease' }}>{subAccount}</span>
                            </label>
                          ))}
                        </div>
                        <p style={{ color: '#5c6567', marginTop: '8px', fontWeight: 500 }}>Leave unchecked to include all sub-accounts.</p>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            <div style={{ display: 'flex', background: '#FEFDFB', borderRadius: '12px', border: '1.4px solid #e4ddd1', borderColor: '#e4ddd1', padding: '4px', boxShadow: '0 1px 2px rgba(0,0,0,.05)' }}>
              <button
                onClick={() => window.print()}
                style={{ padding: '8px', color: '#5c6567', borderRadius: '10px', transition: 'all .15s ease' }}
                title="Print report"
              >
                <Printer size={20} />
              </button>
            </div>
          </div>
        </div>

      </div>

      <div id="report-content" style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '24px', background: '#eef7f6' }}>
        <div style={{ marginLeft: 'auto' }}>
          {activeCategory === 'Overview' && <RevenueDashboard />}
          {activeCategory === 'Sales Audit' && <SalesAudit />}
          {activeCategory === 'Margin Performance' && renderMarginPerformance()}
          {activeCategory === 'Rounding Analytics' && <RoundingAnalytics />}
          {activeCategory === 'Client Ledger' && renderClientLedger()}
          {activeCategory === 'Wallet Statement' && renderWalletStatement()}
          {activeCategory === 'Customer Statement' && renderCustomerStatement()}
          {activeCategory === 'Business Intel' && renderBusinessIntel()}
          {activeCategory === 'Health Diagnostic' && <BusinessHealthReport />}
          {activeCategory === 'Auditor' && renderAuditor()}
        </div>
      </div>
    </div>
  );
};

export default Reports;
