import React, { useState, useEffect, useRef } from 'react';
import { logger } from '@/services/logger';
import {
  TrendingUp, TrendingDown, DollarSign, Clock, ChevronDown, BarChart3,
  Target, ShoppingBag, Award, Sparkles, ChevronRight,
  Calendar, ArrowUp, ArrowDown, Building2, BrainCircuit, LayoutDashboard,
  Package, Users
} from 'lucide-react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts';
import {
  getRealTimeSalesOverview, getTopSellingProducts, getBestPerformingCustomers,
  getSalesTrends, getBranchPerformance, getSalesTargetProgress, predictEndOfMonthRevenue
} from '../services/smartSalesDashboardService';
import { generateExecutiveSummary } from '../services/reportSummaryService';
import { formatNumber } from '../utils/helpers';
import { useAuth } from '../context/AuthContext';
import { useSales } from '../context/SalesContext';
import { useFinance } from '../context/FinanceContext';

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

const PERIODS = ['Today', 'This Week', 'This Month', 'This Quarter', 'This Year', 'All Time'] as const;
type Period = typeof PERIODS[number];

type Tab = 'overview' | 'products' | 'customers' | 'branches';

const TABS = [
  { key: 'overview' as Tab, label: 'Revenue Overview', icon: LayoutDashboard, desc: 'Sales KPIs and trends', color: teal[600] },
  { key: 'products' as Tab, label: 'Top Products', icon: Package, desc: 'Best selling items', color: teal[500] },
  { key: 'customers' as Tab, label: 'Best Customers', icon: Users, desc: 'Top performing accounts', color: teal[700] },
  { key: 'branches' as Tab, label: 'Branch Performance', icon: Building2, desc: 'Multi-branch comparison', color: amber[500] },
];

const getDateRange = (period: Period): { start: string; end: string } => {
  const now = new Date();
  const end = now.toISOString().split('T')[0];
  let start: Date;
  switch (period) {
    case 'Today': start = now; break;
    case 'This Week': {
      const day = now.getDay();
      const diff = now.getDate() - day + (day === 0 ? -6 : 1);
      start = new Date(now.getFullYear(), now.getMonth(), diff); break;
    }
    case 'This Month': start = new Date(now.getFullYear(), now.getMonth(), 1); break;
    case 'This Quarter': {
      const q = Math.floor(now.getMonth() / 3) * 3;
      start = new Date(now.getFullYear(), q, 1); break;
    }
    case 'This Year': start = new Date(now.getFullYear(), 0, 1); break;
    default: start = new Date(2000, 0, 1);
  }
  return { start: start.toISOString().split('T')[0], end };
};

const getTrendPeriod = (period: Period): 'daily' | 'weekly' | 'monthly' => {
  if (period === 'Today' || period === 'This Week') return 'daily';
  if (period === 'This Month' || period === 'This Quarter') return 'weekly';
  return 'monthly';
};

const formatShortCurrency = (value: number): string => {
  if (value >= 1_000_000) {
    const mVal = value / 1_000_000;
    return `${mVal % 1 === 0 ? mVal : mVal.toFixed(1)}M`;
  }
  if (value >= 1_000) {
    const kVal = value / 1_000;
    return `${kVal % 1 === 0 ? kVal : kVal.toFixed(1)}k`;
  }
  return value.toLocaleString(undefined, { maximumFractionDigits: 0 });
};

const SegmentBadge = ({ segment }: { segment: 'vip' | 'regular' | 'occasional' }) => {
  const styles: Record<string, { bg: string; color: string; label: string }> = {
    vip: { bg: amber[100], color: amber[600], label: 'VIP' },
    regular: { bg: teal[50], color: teal[700], label: 'Regular' },
    occasional: { bg: '#f1f5f9', color: '#64748b', label: 'Occasional' },
  };
  const s = styles[segment];
  return (
    <span style={{ fontSize: 10, fontWeight: 700, backgroundColor: s.bg, color: s.color, padding: '2px 8px', borderRadius: 6, textTransform: 'uppercase', letterSpacing: '0.03em' }}>
      {s.label}
    </span>
  );
};

const TrendIndicator = ({ trend }: { trend: 'rising' | 'stable' | 'falling' }) => {
  if (trend === 'rising') return <span style={{ color: teal[600], display: 'inline-flex', alignItems: 'center', gap: 2, fontSize: 11, fontWeight: 700 }}><ArrowUp size={12} />Rising</span>;
  if (trend === 'falling') return <span style={{ color: danger, display: 'inline-flex', alignItems: 'center', gap: 2, fontSize: 11, fontWeight: 700 }}><ArrowDown size={12} />Falling</span>;
  return <span style={{ color: inkSoft, fontSize: 11, fontWeight: 600 }}>Stable</span>;
};

const labelStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 6,
  fontSize: 12, fontWeight: 600, color: teal[800],
  marginBottom: 6, letterSpacing: 0.01
};

const inputStyle: React.CSSProperties = {
  width: '100%', fontFamily: "'Inter', sans-serif", fontSize: 13.5,
  color: ink, background: paper,
  border: `1.4px solid ${hairline}`, borderRadius: 9,
  padding: '9px 12px', outline: 'none',
  transition: 'border-color .15s ease, box-shadow .15s ease, background .15s ease'
};

const selectStyle: React.CSSProperties = {
  ...inputStyle,
  appearance: 'none',
  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%235c6567'/%3E%3C/svg%3E")`,
  backgroundRepeat: 'no-repeat',
  backgroundPosition: 'right 12px center',
  paddingRight: 30,
  cursor: 'pointer'
};

const btnPrimaryStyle: React.CSSProperties = {
  fontFamily: "'Inter', sans-serif", fontSize: 13, fontWeight: 600,
  padding: '9px 18px', borderRadius: 9, cursor: 'pointer',
  background: `linear-gradient(155deg, ${teal[500]}, ${teal[700]})`,
  color: '#fff', border: 'none',
  display: 'flex', alignItems: 'center', gap: 7,
  boxShadow: `0 6px 16px -6px rgba(15,84,76,.55)`,
  transition: 'all .15s ease'
};

const btnGhostStyle: React.CSSProperties = {
  fontFamily: "'Inter', sans-serif", fontSize: 13, fontWeight: 600,
  padding: '9px 18px', borderRadius: 9, cursor: 'pointer',
  background: paper, border: `1.4px solid ${hairline}`, color: inkSoft,
  display: 'flex', alignItems: 'center', gap: 7, transition: 'all .15s ease'
};

const SmartSalesDashboard: React.FC = () => {
  const { companyConfig } = useAuth();
  const { sales, customers } = useSales();
  const { invoices } = useFinance();

  const [period, setPeriod] = useState<Period>('This Month');
  const [activeTab, setActiveTab] = useState<Tab>('overview');
  const [loading, setLoading] = useState(true);
  const [periodOpen, setPeriodOpen] = useState(false);
  const periodRef = useRef<HTMLDivElement>(null);
  const [overview, setOverview] = useState<any>(null);
  const [topProducts, setTopProducts] = useState<any[]>([]);
  const [bestCustomers, setBestCustomers] = useState<any[]>([]);
  const [trends, setTrends] = useState<any[]>([]);
  const [branchPerf, setBranchPerf] = useState<any[]>([]);
  const [forecast, setForecast] = useState<any>(null);
  const [targetProgress, setTargetProgress] = useState<any>(null);
  const [execSummary, setExecSummary] = useState<any>(null);

  const currencySymbol = companyConfig?.currencySymbol || '$';

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (periodRef.current && !periodRef.current.contains(e.target as Node)) setPeriodOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const dateRange = getDateRange(period);
      const allSales = sales || [];
      const allInvoices = invoices || [];

      const overviewData = getRealTimeSalesOverview(allSales, allInvoices, dateRange);
      setOverview(overviewData);

      const products = getTopSellingProducts(allSales, allInvoices, dateRange, 10);
      setTopProducts(products);

      const customersList = getBestPerformingCustomers(allSales, allInvoices, dateRange, 10);
      setBestCustomers(customersList);

      const trendPeriod = getTrendPeriod(period);
      setTrends(getSalesTrends(allSales, allInvoices, trendPeriod));

      setBranchPerf(getBranchPerformance(allSales, allInvoices));
      setForecast(predictEndOfMonthRevenue(allSales, allInvoices));

      const targetData = getSalesTargetProgress(
        (companyConfig as any)?.monthlyTargets || { revenue: 100000, transactions: 100 },
        { revenue: overviewData.totalRevenue, transactions: overviewData.totalTransactions }
      );
      setTargetProgress(targetData);

      try {
        setExecSummary(generateExecutiveSummary({
          sales: allSales, invoices: allInvoices,
          expenses: [], inventory: [],
          dateRange: getDateRange(period)
        }));
      } catch {
        setExecSummary(null);
      }
    } catch (err) {
      logger.error('SmartSalesDashboard fetch error', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, [period]);

  const thStyle: React.CSSProperties = {
    textAlign: 'left', padding: '8px 12px', fontWeight: 700, color: inkSoft,
    fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.04em',
    borderBottom: `1px solid ${hairline}`,
    fontFamily: "'Inter', sans-serif"
  };

  const tdStyle: React.CSSProperties = {
    padding: '10px 12px', borderBottom: `1px solid ${hairline}`,
    color: ink, fontWeight: 500, fontSize: 12,
    fontFamily: "'Inter', sans-serif"
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: paper }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ width: 36, height: 36, border: '4px solid #e4ddd1', borderTopColor: teal[500], borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto' }} />
          <p style={{ marginTop: 12, fontSize: 14, fontWeight: 600, color: inkSoft }}>Loading Sales Dashboard...</p>
        </div>
      </div>
    );
  }

  const renderContent = () => {
    switch (activeTab) {
      case 'overview':
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {overview && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10 }}>
                <KpiCard icon={<DollarSign size={18} />} color={teal[700]} bg={teal[50]} label="Total Revenue" value={`${currencySymbol}${formatShortCurrency(overview.totalRevenue)}`}>
                  <div style={{ fontSize: 10, color: inkSoft, marginTop: 1, display: 'flex', alignItems: 'center', gap: 3 }}>
                    <TrendingUp size={10} color={teal[600]} />
                    <span style={{ color: teal[600], fontWeight: 600 }}>{overview.growthPercent >= 0 ? '+' : ''}{overview.growthPercent.toFixed(1)}%</span>
                    <span>vs yesterday</span>
                  </div>
                </KpiCard>
                <KpiCard icon={<Clock size={18} />} color={teal[600]} bg={teal[50]} label="Today's Revenue" value={`${currencySymbol}${formatShortCurrency(overview.todayRevenue)}`}>
                  <div style={{ fontSize: 10, color: inkSoft, marginTop: 1 }}>{overview.todayTransactions} transactions today</div>
                </KpiCard>
                <KpiCard icon={<Target size={18} />} color={amber[500]} bg={amber[100]} label="Avg Transaction" value={`${currencySymbol}${formatShortCurrency(overview.averageTransactionValue)}`}>
                  <div style={{ fontSize: 10, color: inkSoft, marginTop: 1 }}>Per transaction average</div>
                </KpiCard>
                <KpiCard icon={<ShoppingBag size={18} />} color={teal[800]} bg={teal[50]} label="Transactions" value={formatNumber(overview.totalTransactions)}>
                  <div style={{ fontSize: 10, color: inkSoft, marginTop: 1 }}>Total this period</div>
                </KpiCard>
              </div>
            )}
            <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr', gap: 16 }}>
              <PaperCard>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <SectionTitle>Revenue Trend</SectionTitle>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <LegendDot color={teal[500]} label="Revenue" />
                    <LegendDot color={amber[500]} label="Transactions" />
                  </div>
                </div>
                <div style={{ width: '100%', height: 280, minWidth: 0 }}>
                  {trends.length > 0 ? (
                    <ResponsiveContainer width="100%" height={280} minHeight={280} minWidth={0}>
                      <AreaChart data={trends} margin={{ top: 8, right: 16, left: -8, bottom: 0 }}>
                        <defs>
                          <linearGradient id="trendRevenue" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor={teal[400]} stopOpacity={0.5} />
                            <stop offset="100%" stopColor={teal[400]} stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="4 4" vertical={false} stroke="rgba(228,221,209,0.45)" />
                        <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: inkSoft, fontSize: 10, fontWeight: 500 }} dy={8} interval="preserveStartEnd" />
                        <YAxis yAxisId="left" axisLine={false} tickLine={false} tick={{ fill: inkSoft, fontSize: 10, fontWeight: 500 }} dx={-4} width={48} tickFormatter={(val) => val >= 1000 ? `${(val / 1000).toFixed(0)}k` : String(val)} />
                        <YAxis yAxisId="right" orientation="right" axisLine={false} tickLine={false} tick={{ fill: inkSoft, fontSize: 10, fontWeight: 500 }} dx={4} width={36} />
                        <Tooltip contentStyle={{ borderRadius: 12, border: 'none', boxShadow: '0 8px 32px rgba(15,84,76,.25)', fontSize: 12, padding: '10px 14px', background: teal[800], color: '#ffffff' }} labelStyle={{ fontWeight: 600, color: teal[100], marginBottom: 4, fontSize: 11 }} itemStyle={{ fontWeight: 800, color: '#ffffff', fontVariantNumeric: 'tabular-nums', padding: '2px 0', fontFamily: "'JetBrains Mono', monospace" }} />
                        <Area yAxisId="left" type="monotone" dataKey="revenue" name="Revenue" stroke={teal[500]} strokeWidth={2} fill="url(#trendRevenue)" dot={false} activeDot={{ r: 5, fill: '#ffffff', stroke: teal[500], strokeWidth: 2 }} />
                        <Area yAxisId="right" type="monotone" dataKey="transactions" name="Transactions" stroke={amber[500]} strokeWidth={2} fillOpacity={0} dot={false} activeDot={{ r: 5, fill: '#ffffff', stroke: amber[500], strokeWidth: 2 }} />
                      </AreaChart>
                    </ResponsiveContainer>
                  ) : (
                    <div style={{ height: '100%', minHeight: 150, display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center', color: inkSoft, fontSize: 13, fontWeight: 600, border: `1px dashed ${hairline}`, borderRadius: 18, background: teal[50] }}>
                      No trend data available for this period.
                    </div>
                  )}
                </div>
              </PaperCard>
              <PaperCard>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {forecast && (
                    <>
                      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8 }}>
                        <div style={{ fontSize: 28, fontWeight: 800, color: teal[900], letterSpacing: '-0.02em', lineHeight: 1, fontFamily: "'JetBrains Mono', monospace" }}>
                          {currencySymbol}{formatShortCurrency(forecast.predictedRevenue)}
                        </div>
                        <ConfidenceBadge level={forecast.confidence} />
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: inkSoft, fontWeight: 600 }}>
                        <span>Low: {currencySymbol}{formatShortCurrency(forecast.lowEstimate)}</span>
                        <span>High: {currencySymbol}{formatShortCurrency(forecast.highEstimate)}</span>
                      </div>
                      <ProgressBar value={Math.min(100, (forecast.predictedRevenue / (forecast.highEstimate || forecast.predictedRevenue)) * 100)} color={teal[500]} bg={hairline} />
                      <div style={{ fontSize: 11, color: inkSoft, fontWeight: 500, fontFamily: "'Inter', sans-serif" }}>Based on {forecast.basedOn} data points this month</div>
                      {targetProgress && <TargetProgressCard targetProgress={targetProgress} currencySymbol={currencySymbol} formatShortCurrency={formatShortCurrency} />}
                    </>
                  )}
                  {!forecast && (
                    <div style={{ height: 150, display: 'flex', alignItems: 'center', justifyContent: 'center', color: inkSoft, fontSize: 13, fontWeight: 600 }}>No forecast data available.</div>
                  )}
                </div>
              </PaperCard>
            </div>
            {execSummary && (
              <PaperCard>
                <div style={{ fontSize: 12, fontWeight: 700, color: teal[800], letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6, fontFamily: "'Inter', sans-serif" }}>
                  <Sparkles size={14} color={amber[500]} /> Executive Summary
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                  {execSummary.keyHighlights?.length > 0 && (
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 700, color: teal[800], marginBottom: 6, fontFamily: "'Inter', sans-serif" }}>Key Highlights</div>
                      <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
                        {execSummary.keyHighlights.slice(0, 4).map((h: string, i: number) => (
                          <li key={i} style={{ fontSize: 12, color: ink, padding: '4px 0', display: 'flex', alignItems: 'flex-start', gap: 6, fontFamily: "'Inter', sans-serif" }}>
                            <span style={{ color: teal[500], flexShrink: 0 }}>&bull;</span>
                            <span>{h}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {execSummary.recommendations?.length > 0 && (
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 700, color: teal[800], marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6, fontFamily: "'Inter', sans-serif" }}>
                        <Award size={14} color={teal[600]} /> Recommendations
                      </div>
                      <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
                        {execSummary.recommendations.slice(0, 3).map((r: string, i: number) => (
                          <li key={i} style={{ fontSize: 12, color: ink, padding: '4px 0', display: 'flex', alignItems: 'flex-start', gap: 6, fontFamily: "'Inter', sans-serif" }}>
                            <span style={{ color: teal[500], flexShrink: 0 }}>&rarr;</span>
                            <span>{r}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </PaperCard>
            )}
          </div>
        );
      case 'products':
        return (
          <TabContent title="Top Selling Products" count={topProducts.length} countLabel="items" countColor={teal[500]} countBg={teal[50]}
            emptyIcon={<Package size={28} color={inkSoft} />} emptyTitle="No product data for this period" emptyDesc="Try selecting a different time period."
            isEmpty={topProducts.length === 0}>
            <TableWrapper>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ backgroundColor: teal[50], borderBottom: `1px solid ${teal[100]}` }}>
                    <th style={thStyle}>Product</th>
                    <th style={{ ...thStyle, textAlign: 'right' }}>Qty Sold</th>
                    <th style={{ ...thStyle, textAlign: 'right' }}>Revenue</th>
                    <th style={{ ...thStyle, textAlign: 'right' }}>Avg Price</th>
                    <th style={{ ...thStyle, textAlign: 'right' }}>Trend</th>
                  </tr>
                </thead>
                <tbody>
                  {topProducts.map((p, i) => (
                    <TableRow key={p.itemId || i}>
                      <td style={{ ...tdStyle, fontWeight: 600, maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: "'Inter', sans-serif" }}>{p.itemName}</td>
                      <td style={{ ...tdStyle, textAlign: 'right', fontFamily: "'JetBrains Mono', monospace" }}>{formatNumber(p.quantitySold)}</td>
                      <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 700, fontFamily: "'JetBrains Mono', monospace" }}>{currencySymbol}{formatShortCurrency(p.revenue)}</td>
                      <td style={{ ...tdStyle, textAlign: 'right', fontFamily: "'JetBrains Mono', monospace" }}>{currencySymbol}{formatShortCurrency(p.averagePrice)}</td>
                      <td style={{ ...tdStyle, textAlign: 'right' }}><TrendIndicator trend={p.trend} /></td>
                    </TableRow>
                  ))}
                </tbody>
              </table>
            </TableWrapper>
          </TabContent>
        );
      case 'customers':
        return (
          <TabContent title="Best Performing Customers" count={bestCustomers.length} countLabel="customers" countColor={teal[700]} countBg={teal[50]}
            emptyIcon={<Users size={28} color={inkSoft} />} emptyTitle="No customer data for this period" emptyDesc="Customers will appear once transactions are recorded."
            isEmpty={bestCustomers.length === 0}>
            <TableWrapper>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ backgroundColor: teal[50], borderBottom: `1px solid ${teal[100]}` }}>
                    <th style={thStyle}>Customer</th>
                    <th style={{ ...thStyle, textAlign: 'right' }}>Spent</th>
                    <th style={{ ...thStyle, textAlign: 'right' }}>Orders</th>
                    <th style={{ ...thStyle, textAlign: 'right' }}>AOV</th>
                    <th style={{ ...thStyle, textAlign: 'right' }}>Segment</th>
                  </tr>
                </thead>
                <tbody>
                  {bestCustomers.map((c, i) => (
                    <TableRow key={c.customerId || i}>
                      <td style={{ ...tdStyle, fontWeight: 600, fontFamily: "'Inter', sans-serif" }}>{c.customerName}</td>
                      <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 700, fontFamily: "'JetBrains Mono', monospace" }}>{currencySymbol}{formatShortCurrency(c.totalSpent)}</td>
                      <td style={{ ...tdStyle, textAlign: 'right', fontFamily: "'JetBrains Mono', monospace" }}>{c.orderCount}</td>
                      <td style={{ ...tdStyle, textAlign: 'right', fontFamily: "'JetBrains Mono', monospace" }}>{currencySymbol}{formatShortCurrency(c.averageOrderValue)}</td>
                      <td style={{ ...tdStyle, textAlign: 'right' }}><SegmentBadge segment={c.segment} /></td>
                    </TableRow>
                  ))}
                </tbody>
              </table>
            </TableWrapper>
          </TabContent>
        );
      case 'branches':
        return (
          <TabContent title="Branch Performance" count={branchPerf.length} countLabel="branches" countColor={amber[500]} countBg={amber[100]}
            emptyIcon={<Building2 size={28} color={inkSoft} />} emptyTitle="No branch data available" emptyDesc="Branch information will appear when configured."
            isEmpty={branchPerf.length === 0}>
            <TableWrapper>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ backgroundColor: teal[50], borderBottom: `1px solid ${teal[100]}` }}>
                    <th style={thStyle}>Branch</th>
                    <th style={{ ...thStyle, textAlign: 'right' }}>Revenue</th>
                    <th style={{ ...thStyle, textAlign: 'right' }}>Transactions</th>
                    <th style={{ ...thStyle, textAlign: 'right' }}>Avg Value</th>
                  </tr>
                </thead>
                <tbody>
                  {branchPerf.map((b, i) => (
                    <TableRow key={b.branch || i}>
                      <td style={{ ...tdStyle, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8, fontFamily: "'Inter', sans-serif" }}>
                        <Building2 size={14} color={inkSoft} />
                        {b.branch}
                      </td>
                      <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 700, fontFamily: "'JetBrains Mono', monospace" }}>{currencySymbol}{formatShortCurrency(b.revenue)}</td>
                      <td style={{ ...tdStyle, textAlign: 'right', fontFamily: "'JetBrains Mono', monospace" }}>{b.transactions}</td>
                      <td style={{ ...tdStyle, textAlign: 'right', fontFamily: "'JetBrains Mono', monospace" }}>{currencySymbol}{formatShortCurrency(b.averageValue)}</td>
                    </TableRow>
                  ))}
                </tbody>
              </table>
            </TableWrapper>
          </TabContent>
        );
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      background: paper,
      padding: '20px',
      fontFamily: "'Inter', -apple-system, sans-serif",
      color: ink,
    }}>
      <div style={{ maxWidth: 1520, width: '100%', margin: '0 auto', display: 'flex', gap: 16, alignItems: 'stretch' }}>
        <div style={{ width: 280, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ background: paper, borderRadius: 14, padding: '20px 18px', color: ink, border: `1px solid ${hairline}`, boxShadow: '0 1px 2px rgba(0,0,0,0.04)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <div style={{ width: 36, height: 36, borderRadius: 10, background: `linear-gradient(155deg, ${teal[500]}, ${teal[700]})`, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: `0 4px 10px -3px rgba(15,84,76,.6)` }}>
                <BrainCircuit size={18} color="#fff" />
              </div>
              <div>
                <h1 style={{ fontFamily: "'DM Serif Display', 'Georgia', serif", fontSize: 15, fontWeight: 400, margin: 0, letterSpacing: 0.2, color: teal[800] }}>Smart Sales</h1>
                <p style={{ fontSize: 10, fontWeight: 600, color: inkSoft, margin: 0, letterSpacing: '0.05em', textTransform: 'uppercase' }}>Dashboard</p>
              </div>
            </div>
            <div ref={periodRef} style={{ position: 'relative' }}>
              <button
                onClick={() => setPeriodOpen(o => !o)}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, width: '100%', padding: '8px 0', borderRadius: 9, border: `1.4px solid ${hairline}`, background: paper, color: inkSoft, fontSize: 12, fontWeight: 600, cursor: 'pointer', transition: 'all 0.15s', fontFamily: "'Inter', sans-serif" }}
                onMouseEnter={e => e.currentTarget.style.background = teal[50]}
                onMouseLeave={e => e.currentTarget.style.background = paper}
              >
                <Calendar size={13} /> {period} <ChevronDown size={12} style={{ transition: 'transform 0.15s', transform: periodOpen ? 'rotate(180deg)' : 'none' }} />
              </button>
              {periodOpen && (
                <div style={{ position: 'absolute', top: 'calc(100% + 6px)', left: 0, right: 0, backgroundColor: paper, border: `1px solid ${hairline}`, borderRadius: 9, boxShadow: '0 8px 24px rgba(15,84,76,.12)', zIndex: 50, overflow: 'hidden' }}>
                  {PERIODS.map(p => (
                    <button key={p} onClick={() => { setPeriod(p); setPeriodOpen(false); }} style={{ display: 'block', width: '100%', textAlign: 'left', padding: '10px 14px', fontSize: 12, fontWeight: period === p ? 700 : 500, color: period === p ? teal[700] : inkSoft, backgroundColor: period === p ? teal[50] : 'transparent', border: 'none', cursor: 'pointer', transition: 'background-color 0.1s', fontFamily: "'Inter', sans-serif" }}>
                      {p}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
          <PaperNav tabs={TABS} activeTab={activeTab} onTabChange={setActiveTab} />
          <SidebarKpiGrid overview={overview} forecast={forecast} targetProgress={targetProgress} currencySymbol={currencySymbol} formatShortCurrency={formatShortCurrency} />
        </div>
        <div style={{ flex: 1, minWidth: 0, background: paper, borderRadius: 14, border: `1px solid ${hairline}`, boxShadow: '0 1px 2px rgba(0,0,0,0.04)', padding: '24px', overflow: 'auto' }}>
          {renderContent()}
        </div>
      </div>
    </div>
  );
};

const KpiCard: React.FC<{ icon: React.ReactNode; color: string; bg: string; label: string; value: string; children?: React.ReactNode }> = ({ icon, color, bg, label, value, children }) => (
  <div style={{ background: paper, borderRadius: 14, padding: '14px 16px', border: `1px solid ${hairline}`, display: 'flex', alignItems: 'center', gap: 14, borderLeft: `3px solid ${color}`, boxShadow: '0 1px 2px rgba(0,0,0,0.04)' }}>
    <div style={{ width: 38, height: 38, borderRadius: 10, background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center', color, flexShrink: 0 }}>
      {icon}
    </div>
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: inkSoft, textTransform: 'uppercase', letterSpacing: '0.02em', marginBottom: 2, fontFamily: "'Inter', sans-serif" }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 700, color: ink, fontVariantNumeric: 'tabular-nums', lineHeight: 1.2, fontFamily: "'JetBrains Mono', monospace" }}>{value}</div>
      {children}
    </div>
  </div>
);

const PaperCard: React.FC<{ children: React.ReactNode; style?: React.CSSProperties }> = ({ children, style }) => (
  <div style={{ background: paper, borderRadius: 14, padding: '20px', border: `1px solid ${hairline}`, boxShadow: '0 1px 2px rgba(0,0,0,0.04)', ...style }}>
    {children}
  </div>
);

const SectionTitle: React.FC<{ children: React.ReactNode; style?: React.CSSProperties }> = ({ children, style }) => (
  <div style={{ fontSize: 12, fontWeight: 700, color: teal[800], letterSpacing: '0.05em', textTransform: 'uppercase', fontFamily: "'Inter', sans-serif", ...style }}>{children}</div>
);

const LegendDot: React.FC<{ color: string; label: string }> = ({ color, label }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
    <div style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: color }} />
    <span style={{ fontSize: 10, fontWeight: 600, color: inkSoft, fontFamily: "'Inter', sans-serif" }}>{label}</span>
  </div>
);

const ConfidenceBadge: React.FC<{ level: string }> = ({ level }) => {
  const config: Record<string, { bg: string; color: string }> = {
    high: { bg: teal[50], color: teal[700] },
    medium: { bg: amber[100], color: amber[600] },
    low: { bg: paper, color: inkSoft },
  };
  const s = config[level] || config.low;
  return (
    <div style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 6, backgroundColor: s.bg, color: s.color, textTransform: 'uppercase', letterSpacing: '0.03em', marginBottom: 4, fontFamily: "'Inter', sans-serif" }}>
      {level} confidence
    </div>
  );
};

const ProgressBar: React.FC<{ value: number; color: string; height?: number; bg?: string }> = ({ value, color, height = 6, bg = hairline }) => (
  <div style={{ height, backgroundColor: bg, borderRadius: 999, overflow: 'hidden', position: 'relative' }}>
    <div style={{ width: `${Math.min(100, value)}%`, height: '100%', backgroundColor: color, borderRadius: 999, transition: 'width 1s cubic-bezier(0.34, 1.56, 0.64, 1)' }} />
  </div>
);

const TargetProgressCard: React.FC<{ targetProgress: any; currencySymbol: string; formatShortCurrency: (v: number) => string }> = ({ targetProgress, currencySymbol, formatShortCurrency: f }) => (
  <div style={{ marginTop: 8, padding: '12px', borderRadius: 12, backgroundColor: targetProgress.onTrack ? teal[50] : amber[100], border: `1px solid ${hairline}` }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
      <span style={{ fontSize: 11, fontWeight: 700, color: teal[800], textTransform: 'uppercase', letterSpacing: '0.04em', fontFamily: "'Inter', sans-serif" }}>Target Progress</span>
      <span style={{ fontSize: 11, fontWeight: 700, color: targetProgress.onTrack ? teal[600] : amber[600], fontFamily: "'JetBrains Mono', monospace" }}>{targetProgress.revenuePercent.toFixed(0)}%</span>
    </div>
    <ProgressBar value={targetProgress.revenuePercent} color={targetProgress.onTrack ? teal[500] : amber[500]} bg={hairline} />
    <div style={{ fontSize: 10, fontWeight: 600, color: inkSoft, marginTop: 4, display: 'flex', justifyContent: 'space-between', fontFamily: "'Inter', sans-serif" }}>
      <span style={{ fontFamily: "'JetBrains Mono', monospace" }}>{currencySymbol}{f(targetProgress.revenueAchieved)} of {currencySymbol}{f(targetProgress.revenueTarget)}</span>
      <span>{targetProgress.onTrack ? 'On Track' : 'Behind'}</span>
    </div>
  </div>
);

const PaperNav: React.FC<{ tabs: typeof TABS; activeTab: string; onTabChange: (k: any) => void }> = ({ tabs, activeTab, onTabChange }) => (
  <div style={{ background: paper, borderRadius: 14, border: `1px solid ${hairline}`, boxShadow: '0 1px 2px rgba(0,0,0,0.04)', padding: '10px', flex: 1, display: 'flex', flexDirection: 'column' }}>
    {tabs.map(tab => {
      const isActive = activeTab === tab.key;
      return (
        <button key={tab.key} onClick={() => onTabChange(tab.key)} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderRadius: 9, border: 'none', background: isActive ? teal[50] : 'transparent', cursor: 'pointer', textAlign: 'left', width: '100%', transition: 'all 0.15s', marginBottom: '2px', fontFamily: "'Inter', sans-serif" }}
          onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = teal[50]; }}
          onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'transparent'; }}
        >
          <div style={{ width: 32, height: 32, borderRadius: 8, background: isActive ? `${tab.color}15` : hairline, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <tab.icon size={15} color={isActive ? tab.color : inkSoft} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: isActive ? 700 : 600, color: isActive ? teal[800] : ink, fontFamily: "'Inter', sans-serif" }}>{tab.label}</div>
            <div style={{ fontSize: 10, color: inkSoft, marginTop: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontFamily: "'Inter', sans-serif" }}>{tab.desc}</div>
          </div>
          {isActive && <ChevronRight size={14} color={tab.color} />}
        </button>
      );
    })}
  </div>
);

const SidebarKpiGrid: React.FC<{ overview: any; forecast: any; targetProgress: any; currencySymbol: string; formatShortCurrency: (v: number) => string }> = ({ overview, forecast, targetProgress, currencySymbol, formatShortCurrency: f }) => (
  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
    <SidebarKpi label="Revenue" value={overview ? f(overview.totalRevenue) : '-'} color={teal[700]} sub="total" />
    <SidebarKpi label="Growth" value={overview ? `${overview.growthPercent >= 0 ? '+' : ''}${overview.growthPercent.toFixed(1)}%` : '-'} color={overview?.growthPercent >= 0 ? teal[600] : danger} sub="vs yesterday" />
    <SidebarKpi label="Forecast" value={forecast ? f(forecast.predictedRevenue) : '-'} color={amber[500]} sub="end of month" />
    <SidebarKpi label="Target" value={targetProgress ? `${targetProgress.revenuePercent.toFixed(0)}%` : '-'} color={targetProgress?.onTrack ? teal[600] : amber[600]} sub={targetProgress?.onTrack ? 'on track' : 'behind'} />
  </div>
);

const SidebarKpi: React.FC<{ label: string; value: string; color: string; sub: string }> = ({ label, value, color, sub }) => (
  <div style={{ background: paper, borderRadius: 12, padding: '12px', border: `1px solid ${hairline}`, textAlign: 'center', boxShadow: '0 1px 2px rgba(0,0,0,0.04)' }}>
    <div style={{ fontSize: 9, fontWeight: 700, color: inkSoft, textTransform: 'uppercase', letterSpacing: '0.05em', fontFamily: "'Inter', sans-serif" }}>{label}</div>
    <div style={{ fontSize: 20, fontWeight: 800, color, marginTop: 4, fontFamily: "'JetBrains Mono', monospace" }}>{value}</div>
    <div style={{ fontSize: 9, color: inkSoft, fontFamily: "'Inter', sans-serif" }}>{sub}</div>
  </div>
);

const TabContent: React.FC<{ title: string; count: number; countLabel: string; countColor: string; countBg: string; emptyIcon: React.ReactNode; emptyTitle: string; emptyDesc: string; isEmpty: boolean; children: React.ReactNode }> = ({ title, count, countLabel, countColor, countBg, emptyIcon, emptyTitle, emptyDesc, isEmpty, children }) => (
  <div>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
      <div>
        <h2 style={{ fontFamily: "'DM Serif Display', 'Georgia', serif", fontSize: 18, fontWeight: 400, color: teal[800], margin: 0, letterSpacing: 0.2 }}>{title}</h2>
        <p style={{ fontSize: 13, color: inkSoft, margin: '4px 0 0', fontFamily: "'Inter', sans-serif" }}>{count > 0 ? `${count} ${countLabel}` : 'No data available'}</p>
      </div>
      {count > 0 && <span style={{ fontSize: 11, fontWeight: 700, color: countColor, backgroundColor: countBg, padding: '4px 12px', borderRadius: 8, fontFamily: "'Inter', sans-serif" }}>{count} {countLabel}</span>}
    </div>
    {!isEmpty ? children : <EmptyState icon={emptyIcon} title={emptyTitle} desc={emptyDesc} />}
  </div>
);

const EmptyState: React.FC<{ icon: React.ReactNode; title: string; desc: string }> = ({ icon, title, desc }) => (
  <div style={{ padding: '60px 0', textAlign: 'center' }}>
    <div style={{ width: 56, height: 56, borderRadius: 16, background: teal[50], display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px' }}>
      {icon}
    </div>
    <p style={{ fontSize: 15, fontWeight: 700, color: teal[800], margin: 0, fontFamily: "'DM Serif Display', 'Georgia', serif" }}>{title}</p>
    <p style={{ fontSize: 13, color: inkSoft, margin: '4px 0 0', fontFamily: "'Inter', sans-serif" }}>{desc}</p>
  </div>
);

const TableWrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div style={{ border: `1px solid ${hairline}`, borderRadius: 14, overflow: 'hidden' }}>
    <div style={{ overflowX: 'auto' }}>
      {children}
    </div>
  </div>
);

const TableRow: React.FC<{ children: React.ReactNode; style?: React.CSSProperties }> = ({ children, style }) => {
  const [hovered, setHovered] = useState(false);
  return (
    <tr style={{ borderBottom: `1px solid ${hairline}`, backgroundColor: hovered ? teal[50] : 'transparent', transition: 'background-color 0.1s', ...style }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}>
      {children}
    </tr>
  );
};

export default SmartSalesDashboard;
