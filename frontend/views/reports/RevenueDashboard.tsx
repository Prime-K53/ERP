import React, { useEffect, useMemo, useState } from 'react';
import { useData, REFRESH_INTERVAL } from '../../context/DataContext';
import { useAuth } from '../../context/AuthContext';
import { useSales } from '../../context/SalesContext';
import { useFinance } from '../../context/FinanceContext';
import { useOrders } from '../../context/OrdersContext';
import { useExamination } from '../../context/ExaminationContext';
import { useModuleRefresh } from '../../hooks/useModuleRefresh';
import {
  Activity, Coins, DollarSign, Layers3, Receipt,
  TrendingDown, TrendingUp, Users, Wallet,
} from 'lucide-react';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { getRevenueSourceLabel } from '../../services/revenueAnalysisService';
import {
  buildRevenueReportingSnapshot, matchesRevenueDateRange,
  type RevenueDateRange,
} from '../../services/revenueReportingService';
import { currencyService } from '../../services/currencyService';

const teal = { 50: '#eef7f6', 100: '#d3ece9', 200: '#a6d9d3', 500: '#1f8577', 600: '#146b60', 700: '#0f544c', 800: '#0b3e39', 900: '#082e2a' };
const ink = '#23282A';
const inkSoft = '#5c6567';
const hairline = '#e4ddd1';

const cardBase: React.CSSProperties = { background: '#FEFDFB', borderRadius: 14, border: `1.4px solid ${hairline}`, boxShadow: '0 1px 3px rgba(0,0,0,.04)' };
const cardPad: React.CSSProperties = { ...cardBase, padding: 24 };

const RevenueDashboard: React.FC = () => {
  const { companyConfig } = useAuth();
  const { sales = [], isLoading } = useSales();
  const { invoices = [], expenses = [] } = useFinance();
  const { orders = [] } = useOrders();
  const { batches: examinationBatches = [] } = useExamination();
  const { refreshAllData } = useData();

  const [isRefreshing, setIsRefreshing] = useState(false);

  useEffect(() => {
    const loadData = async () => { setIsRefreshing(true); await refreshAllData?.(); setIsRefreshing(false); };
    loadData();
  }, []);

  useModuleRefresh(refreshAllData, { interval: REFRESH_INTERVAL });

  const currency = companyConfig?.currencySymbol || currencyService.getCurrency(currencyService.getBaseCurrency())?.symbol || '$';
  const [dateRange, setDateRange] = useState<RevenueDateRange>('month');

  const formatCurrency = (value: number) =>
    `${currency}${Number(value || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const report = useMemo(() =>
    buildRevenueReportingSnapshot({ sales, invoices, orders, batches: examinationBatches, dateRange, trendDays: 7 }),
    [sales, invoices, orders, examinationBatches, dateRange]);

  const operatingExpenses = useMemo(() =>
    (expenses || []).filter((expense: any) => matchesRevenueDateRange(expense?.date, dateRange)).reduce((sum: number, expense: any) => sum + Number(expense?.amount || 0), 0),
    [expenses, dateRange]);

  const outstandingReceivables = useMemo(() =>
    (invoices || []).filter((invoice: any) => matchesRevenueDateRange(invoice?.date, dateRange)).filter((invoice: any) => !['cancelled', 'draft'].includes(String(invoice?.status || '').toLowerCase())).reduce((sum: number, invoice: any) => { const t = Number(invoice?.totalAmount || invoice?.total || 0); const p = Number(invoice?.paidAmount || 0); return sum + Math.max(0, t - p); }, 0),
    [invoices, dateRange]);

  const netContribution = report.totals.profitMargin - operatingExpenses;

  const kpis = [
    { label: 'Recognized Revenue', value: formatCurrency(report.totals.revenue), subtext: `${report.totals.transactionCount} posted transactions`, icon: TrendingUp, border: teal[500], iconBg: teal[50], iconColor: teal[500], textColor: teal[700] },
    { label: 'Material Cost', value: formatCurrency(report.totals.materialCost), subtext: 'Recovered from sales and examination', icon: Layers3, border: inkSoft, iconBg: teal[50], iconColor: inkSoft, textColor: ink },
    { label: 'Market Adjustments', value: formatCurrency(report.totals.adjustmentTotal), subtext: `${report.topAdjustments.length} tracked adjustment type(s)`, icon: Coins, border: teal[500], iconBg: teal[50], iconColor: teal[500], textColor: teal[700] },
    { label: 'Profit Markup', value: formatCurrency(report.totals.profitMargin), subtext: report.totals.revenue > 0 ? `${((report.totals.profitMargin / report.totals.revenue) * 100).toFixed(1)}% of revenue` : 'No revenue in range', icon: DollarSign, border: report.totals.profitMargin >= 0 ? teal[600] : '#b5493f', iconBg: teal[50], iconColor: teal[600], textColor: teal[700] },
    { label: 'Round Up / Down', value: `${report.totals.roundingTotal >= 0 ? '+' : ''}${formatCurrency(report.totals.roundingTotal)}`, subtext: 'Net rounding effect', icon: Activity, border: teal[600], iconBg: teal[50], iconColor: teal[600], textColor: teal[700] },
    { label: 'Outstanding AR', value: formatCurrency(outstandingReceivables), subtext: 'Open invoice exposure', icon: Wallet, border: '#d99a3f', iconBg: '#fbead0', iconColor: '#d99a3f', textColor: '#d99a3f' },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24, padding: '16px 24px', maxWidth: 1600, margin: '0 auto', fontFamily: "'Inter',sans-serif", fontSize: 13, color: ink }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h2 style={{ fontSize: 22, fontWeight: 700, color: ink, margin: 0, letterSpacing: -0.02 }}>Revenue Analysis</h2>
            <p style={{ fontSize: 13, color: inkSoft, fontWeight: 500, margin: '2px 0 0' }}>Unified tracking for sales, order-form invoices, and examination billing.</p>
          </div>
          <div style={{ display: 'flex', gap: 2, background: '#FEFDFB', padding: 3, borderRadius: 12, border: `1.4px solid ${hairline}`, boxShadow: '0 1px 2px rgba(0,0,0,.04)' }}>
            {(['week', 'month', 'quarter', 'year', 'all'] as const).map((range) => (
              <button key={range} onClick={() => setDateRange(range)}
                style={{ padding: '6px 12px', borderRadius: 9, fontSize: 12, fontWeight: 600, border: 'none', cursor: 'pointer', background: dateRange === range ? `linear-gradient(155deg, ${teal[500]}, ${teal[700]})` : 'transparent', color: dateRange === range ? '#fff' : inkSoft, boxShadow: dateRange === range ? `0 4px 10px -4px rgba(15,84,76,.4)` : 'none' }}>
                {range.charAt(0).toUpperCase() + range.slice(1)}
              </button>
            ))}
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
          {kpis.map((kpi) => {
            const Icon = kpi.icon;
            return (
              <div key={kpi.label} style={{ background: '#FEFDFB', padding: '12px 16px', borderRadius: 12, boxShadow: '0 1px 3px rgba(0,0,0,.04)', border: `1.4px solid ${hairline}`, borderLeft: `4px solid ${kpi.border}`, display: 'flex', alignItems: 'center', gap: 16 }}>
                <div style={{ padding: 10, borderRadius: 9, background: kpi.iconBg, color: kpi.iconColor, flexShrink: 0 }}>
                  <Icon size={20} />
                </div>
                <div style={{ minWidth: 0 }}>
                  <p style={{ fontSize: 10, fontWeight: 700, color: inkSoft, textTransform: 'uppercase', letterSpacing: -0.01, margin: '0 0 4px' }}>{kpi.label}</p>
                  <p style={{ fontSize: 18, fontWeight: 600, color: kpi.textColor, margin: 0 }}>{kpi.value}</p>
                  <p style={{ fontSize: 10, color: inkSoft, margin: '2px 0 0' }}>{kpi.subtext}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div style={{ background: `linear-gradient(135deg, ${teal[800]}, ${teal[900]})`, padding: 20, borderRadius: 14, boxShadow: `0 8px 24px -8px rgba(11,62,57,.4)`, color: '#fff' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <p style={{ fontSize: 11, fontWeight: 700, color: teal[100], letterSpacing: 0.06, textTransform: 'uppercase', margin: 0 }}>Operating Expenses</p>
              <h3 style={{ fontSize: 24, fontWeight: 900, margin: '4px 0 0' }}>{formatCurrency(operatingExpenses)}</h3>
              <p style={{ fontSize: 11, color: teal[100], fontWeight: 500, margin: '4px 0 0' }}>Operating expenses inside the selected window</p>
            </div>
            <div style={{ padding: 12, background: 'rgba(255,255,255,.1)', borderRadius: 12 }}>
              <TrendingDown size={22} />
            </div>
          </div>
        </div>
        <div style={{ background: `linear-gradient(135deg, ${teal[600]}, ${teal[800]})`, padding: 20, borderRadius: 14, boxShadow: `0 8px 24px -8px rgba(11,62,57,.4)`, color: '#fff' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <p style={{ fontSize: 11, fontWeight: 700, color: teal[100], letterSpacing: 0.06, textTransform: 'uppercase', margin: 0 }}>Net Contribution</p>
              <h3 style={{ fontSize: 24, fontWeight: 900, margin: '4px 0 0' }}>{formatCurrency(netContribution)}</h3>
              <p style={{ fontSize: 11, color: teal[100], fontWeight: 500, margin: '4px 0 0' }}>Profit markup less operating expenses</p>
            </div>
            <div style={{ padding: 12, background: 'rgba(255,255,255,.15)', borderRadius: 12 }}>
              <Receipt size={22} />
            </div>
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 24 }}>
        <div style={cardPad}>
          <h3 style={{ fontWeight: 700, color: ink, fontSize: 13, margin: '0 0 16px', display: 'flex', alignItems: 'center', gap: 8 }}>
            <TrendingUp size={18} style={{ color: teal[500] }} /> 7-Day Revenue vs Markup Trend
          </h3>
          <div style={{ width: '100%', height: 280, minHeight: 180 }}>
            <ResponsiveContainer width="100%" height="100%" minHeight={180} minWidth={0}>
              <AreaChart data={report.trend}>
                <defs>
                  <linearGradient id="trendRevenue" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={teal[500]} stopOpacity={0.28} /><stop offset="95%" stopColor={teal[500]} stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="trendMargin" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={teal[200]} stopOpacity={0.24} /><stop offset="95%" stopColor={teal[200]} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke={teal[50]} />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: inkSoft }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: inkSoft }} axisLine={false} tickLine={false} tickFormatter={(value) => `${currency}${value >= 1000 ? `${(value / 1000).toFixed(0)}k` : value}`} />
                <Tooltip formatter={(value: number) => [formatCurrency(value), '']} contentStyle={{ borderRadius: 12, border: `1.4px solid ${hairline}`, fontSize: 12 }} />
                <Area type="monotone" dataKey="revenue" name="Revenue" stroke={teal[500]} strokeWidth={2} fill="url(#trendRevenue)" />
                <Area type="monotone" dataKey="profitMargin" name="Profit Markup" stroke={teal[200]} strokeWidth={2} fill="url(#trendMargin)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div style={cardPad}>
          <h3 style={{ fontWeight: 700, color: ink, fontSize: 13, margin: '0 0 16px', display: 'flex', alignItems: 'center', gap: 8 }}>
            <Users size={18} style={{ color: teal[500] }} /> Top Customers
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {report.customers.slice(0, 6).map((customer, index) => (
              <div key={`${customer.customerName}-${index}`} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 12, background: teal[50], borderRadius: 12 }}>
                <div>
                  <p style={{ fontWeight: 600, color: ink, fontSize: 13, margin: 0 }}>{customer.customerName}</p>
                  <p style={{ fontSize: 11, color: inkSoft, margin: 0 }}>{customer.transactionCount} transaction(s)</p>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <p style={{ fontWeight: 700, color: ink, margin: 0, fontSize: 13 }}>{formatCurrency(customer.revenue)}</p>
                  <p style={{ fontSize: 11, color: teal[600], fontWeight: 500, margin: 0 }}>{formatCurrency(customer.profitMargin)} markup</p>
                </div>
              </div>
            ))}
            {report.customers.length === 0 && (<div style={{ textAlign: 'center', color: inkSoft, padding: 40, fontSize: 13 }}>No revenue records available for this range.</div>)}
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 24 }}>
        <div style={cardPad}>
          <h3 style={{ fontWeight: 700, color: ink, fontSize: 13, margin: '0 0 16px', display: 'flex', alignItems: 'center', gap: 8 }}>
            <Activity size={18} style={{ color: teal[500] }} /> Revenue by Source
          </h3>
          <div style={{ width: '100%', height: 250, minHeight: 180 }}>
            <ResponsiveContainer width="100%" height="100%" minHeight={180} minWidth={0}>
              <BarChart data={report.sources.map((source) => ({ ...source, label: getRevenueSourceLabel(source.source) }))}>
                <CartesianGrid strokeDasharray="3 3" stroke={teal[50]} />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: inkSoft }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: inkSoft }} axisLine={false} tickLine={false} tickFormatter={(value) => `${currency}${value >= 1000 ? `${(value / 1000).toFixed(0)}k` : value}`} />
                <Tooltip formatter={(value: number) => [formatCurrency(value), '']} contentStyle={{ borderRadius: 12, border: `1.4px solid ${hairline}`, fontSize: 12 }} />
                <Bar dataKey="revenue" name="Revenue" fill={teal[500]} radius={[6, 6, 0, 0]} />
                <Bar dataKey="profitMargin" name="Profit Markup" fill={teal[200]} radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div style={cardPad}>
          <h3 style={{ fontWeight: 700, color: ink, fontSize: 13, margin: '0 0 16px', display: 'flex', alignItems: 'center', gap: 8 }}>
            <Coins size={18} style={{ color: teal[500] }} /> Adjustment Ledger
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {report.topAdjustments.slice(0, 6).map((adjustment) => (
              <div key={`${adjustment.source}-${adjustment.adjustmentName}`} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 12, background: teal[50], borderRadius: 12, border: `1.4px solid ${teal[100]}` }}>
                <div>
                  <p style={{ fontWeight: 600, color: ink, fontSize: 13, margin: 0 }}>{adjustment.adjustmentName}</p>
                  <p style={{ fontSize: 11, color: inkSoft, margin: 0 }}>{getRevenueSourceLabel(adjustment.source)} · {adjustment.transactionCount} transaction(s)</p>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <p style={{ fontWeight: 700, color: teal[700], margin: 0, fontSize: 13 }}>{formatCurrency(adjustment.totalAmount)}</p>
                  <p style={{ fontSize: 11, color: inkSoft, margin: 0 }}>{adjustment.applicationCount} application(s)</p>
                </div>
              </div>
            ))}
            {report.topAdjustments.length === 0 && (<div style={{ textAlign: 'center', color: inkSoft, padding: 40, fontSize: 13 }}>No adjustment entries captured in this range.</div>)}
          </div>
        </div>
      </div>

      <div style={{ ...cardBase, overflow: 'hidden' }}>
        <div style={{ padding: 24 }}>
          <h3 style={{ fontWeight: 700, color: ink, fontSize: 13, margin: '0 0 16px', display: 'flex', alignItems: 'center', gap: 8 }}>
            <Receipt size={18} style={{ color: inkSoft }} /> Source Summary
          </h3>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', textAlign: 'left', fontSize: 13, borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: `1.4px solid ${teal[100]}`, fontSize: 10, fontWeight: 700, color: inkSoft, textTransform: 'uppercase', letterSpacing: 0.06 }}>
                  <th style={{ padding: '12px 16px' }}>Source</th>
                  <th style={{ padding: '12px 16px', textAlign: 'right' }}>Transactions</th>
                  <th style={{ padding: '12px 16px', textAlign: 'right' }}>Revenue</th>
                  <th style={{ padding: '12px 16px', textAlign: 'right' }}>Adjustments</th>
                  <th style={{ padding: '12px 16px', textAlign: 'right' }}>Profit Markup</th>
                  <th style={{ padding: '12px 16px', textAlign: 'right' }}>Manual Override</th>
                  <th style={{ padding: '12px 16px', textAlign: 'right' }}>Rounding</th>
                </tr>
              </thead>
              <tbody>
                {report.sources.map((source) => (
                  <tr key={source.source} style={{ borderBottom: `1.4px solid ${teal[50]}` }}
                    onMouseEnter={e => e.currentTarget.style.background = teal[50]}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                    <td style={{ padding: '12px 16px', fontWeight: 600, color: ink }}>{getRevenueSourceLabel(source.source)}</td>
                    <td style={{ padding: '12px 16px', textAlign: 'right', color: inkSoft }}>{source.transactionCount}</td>
                    <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 600, color: ink }}>{formatCurrency(source.revenue)}</td>
                    <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 600, color: teal[700] }}>{formatCurrency(source.adjustmentTotal)}</td>
                    <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 600, color: teal[600] }}>{formatCurrency(source.profitMargin)}</td>
                    <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 600, color: source.manualOverrideAmount >= 0 ? '#d99a3f' : '#b5493f' }}>
                      {source.manualOverrideAmount >= 0 ? '+' : ''}{formatCurrency(source.manualOverrideAmount)}
                    </td>
                    <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 600, color: source.roundingTotal >= 0 ? teal[600] : '#b5493f' }}>
                      {source.roundingTotal >= 0 ? '+' : ''}{formatCurrency(source.roundingTotal)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div style={{ ...cardBase, overflow: 'hidden' }}>
        <div style={{ padding: 24 }}>
          <h3 style={{ fontWeight: 700, color: ink, fontSize: 13, margin: '0 0 16px', display: 'flex', alignItems: 'center', gap: 8 }}>
            <Receipt size={18} style={{ color: inkSoft }} /> Recent Revenue Transactions
          </h3>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', textAlign: 'left', fontSize: 13, borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: `1.4px solid ${teal[100]}`, fontSize: 10, fontWeight: 700, color: inkSoft, textTransform: 'uppercase', letterSpacing: 0.06 }}>
                  <th style={{ padding: '12px 16px' }}>Document</th>
                  <th style={{ padding: '12px 16px' }}>Source</th>
                  <th style={{ padding: '12px 16px' }}>Customer</th>
                  <th style={{ padding: '12px 16px', textAlign: 'right' }}>Revenue</th>
                  <th style={{ padding: '12px 16px', textAlign: 'right' }}>Adjustments</th>
                  <th style={{ padding: '12px 16px', textAlign: 'right' }}>Profit Markup</th>
                  <th style={{ padding: '12px 16px', textAlign: 'right' }}>Manual Override</th>
                  <th style={{ padding: '12px 16px', textAlign: 'right' }}>Rounding</th>
                </tr>
              </thead>
              <tbody>
                {report.transactions.slice(0, 8).map((transaction) => (
                  <tr key={transaction.key} style={{ borderBottom: `1.4px solid ${teal[50]}` }}
                    onMouseEnter={e => e.currentTarget.style.background = teal[50]}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                    <td style={{ padding: '12px 16px' }}>
                      <div style={{ fontWeight: 600, color: ink }}>{transaction.transactionNumber}</div>
                      <div style={{ fontSize: 11, color: inkSoft }}>
                        {new Date(transaction.date).toLocaleDateString()}{transaction.subAccountName ? ` · ${transaction.subAccountName}` : ''}
                      </div>
                    </td>
                    <td style={{ padding: '12px 16px', color: inkSoft }}>{getRevenueSourceLabel(transaction.source)}</td>
                    <td style={{ padding: '12px 16px', color: ink }}>{transaction.customerName}</td>
                    <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 600, color: ink }}>{formatCurrency(transaction.revenue)}</td>
                    <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 600, color: teal[700] }}>{formatCurrency(transaction.adjustmentTotal)}</td>
                    <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 600, color: teal[600] }}>{formatCurrency(transaction.profitMargin)}</td>
                    <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 600, color: transaction.manualOverrideAmount >= 0 ? '#d99a3f' : '#b5493f' }}>
                      {transaction.manualOverrideAmount >= 0 ? '+' : ''}{formatCurrency(transaction.manualOverrideAmount)}
                    </td>
                    <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 600, color: transaction.roundingTotal >= 0 ? teal[600] : '#b5493f' }}>
                      {transaction.roundingTotal >= 0 ? '+' : ''}{formatCurrency(transaction.roundingTotal)}
                    </td>
                  </tr>
                ))}
                {report.transactions.length === 0 && (<tr><td colSpan={8} style={{ padding: 48, textAlign: 'center', color: inkSoft }}>No revenue transactions found for the selected range.</td></tr>)}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};

export default RevenueDashboard;