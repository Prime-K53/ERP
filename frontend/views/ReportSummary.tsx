import React, { useState } from 'react';
import {
  TrendingUp, TrendingDown, FileText, Activity, BarChart3, DollarSign,
  Sparkles, Award, AlertTriangle, Package, ArrowUp, ArrowDown,
  ChevronDown, BrainCircuit, ChevronRight, HeartPulse, ShoppingCart, Target
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useSales } from '../context/SalesContext';
import { useFinance } from '../context/FinanceContext';
import { useInventory } from '../context/InventoryContext';
import {
  generateExecutiveSummary, generateFinancialHealthScore, generateSalesReportSummary,
  generateExpenseReportSummary, generateInventoryReportSummary, formatCurrency, formatPercent
} from '../services/reportSummaryService';

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

type ReportTab = 'Executive Summary' | 'Financial Health' | 'Sales' | 'Expenses' | 'Inventory';

const TABS: { key: ReportTab; label: string; icon: React.FC<{ size?: number }>; desc: string; color: string }[] = [
  { key: 'Executive Summary', label: 'Executive Summary', icon: FileText, desc: 'High-level business overview', color: teal[500] },
  { key: 'Financial Health', label: 'Financial Health', icon: HeartPulse, desc: 'Scorecard and risk analysis', color: teal[500] },
  { key: 'Sales', label: 'Sales Report', icon: ShoppingCart, desc: 'Revenue and sales insights', color: teal[500] },
  { key: 'Expenses', label: 'Expense Report', icon: DollarSign, desc: 'Spending and category breakdown', color: amber[500] },
  { key: 'Inventory', label: 'Inventory Report', icon: Package, desc: 'Stock levels and turnover', color: teal[500] },
];

const PERIODS = ['This Month', 'This Quarter', 'This Year', 'All Time'] as const;
type Period = typeof PERIODS[number];

const getDateRange = (period: Period): { start: string; end: string } => {
  const now = new Date();
  const end = now.toISOString();
  let start: Date;
  switch (period) {
    case 'This Month': start = new Date(now.getFullYear(), now.getMonth(), 1); break;
    case 'This Quarter': { const q = Math.floor(now.getMonth() / 3) * 3; start = new Date(now.getFullYear(), q, 1); break; }
    case 'This Year': start = new Date(now.getFullYear(), 0, 1); break;
    default: start = new Date(2000, 0, 1);
  }
  return { start: start.toISOString(), end };
};

const ReportSummary: React.FC = () => {
  const { companyConfig } = useAuth();
  const currency = companyConfig?.currencySymbol || 'MK';

  const [activeTab, setActiveTab] = useState<ReportTab>('Executive Summary');
  const [period, setPeriod] = useState<Period>('This Month');
  const [periodOpen, setPeriodOpen] = useState(false);
  const periodRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (periodRef.current && !periodRef.current.contains(e.target as Node)) setPeriodOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const { sales } = useSales();
  const { invoices, expenses } = useFinance();
  const { inventory } = useInventory();

  const dateRange = getDateRange(period);

  const execSummary = generateExecutiveSummary({
    sales: sales || [], invoices: invoices || [], expenses: expenses || [], inventory: inventory || [], dateRange,
  });

  const totalRevenue = execSummary.metrics.find((m: any) => m.label === 'Total Revenue');
  const totalExpenses = execSummary.metrics.find((m: any) => m.label === 'Total Expenses');
  const revenue = parseFloat((totalRevenue?.value || '').replace(/[^0-9.-]/g, '')) || 0;
  const expensesVal = parseFloat((totalExpenses?.value || '').replace(/[^0-9.-]/g, '')) || 0;
  const profitMargin = revenue > 0 ? ((revenue - expensesVal) / revenue) * 100 : 0;

  const healthScore = generateFinancialHealthScore({
    revenue, expenses: expensesVal, assets: revenue * 1.5, liabilities: expensesVal * 0.6,
    equity: revenue, profitMargin, currentRatio: 1.8,
  });

  const salesSummary = generateSalesReportSummary(sales || [], invoices || [], period);
  const expenseSummary = generateExpenseReportSummary(expenses || [], period);
  const inventorySummary = generateInventoryReportSummary(inventory || [], []);

  const renderContent = () => {
    switch (activeTab) {
      case 'Executive Summary': return renderExecutiveSummary();
      case 'Financial Health': return renderFinancialHealth();
      case 'Sales': return renderSalesSummary();
      case 'Expenses': return renderExpenseSummary();
      case 'Inventory': return renderInventorySummary();
      default: return null;
    }
  };

  const renderExecutiveSummary = () => {
    if (!execSummary) return null;
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <GlassCard>
          <h3 style={{ fontSize: 17, fontWeight: 400, fontFamily: "'DM Serif Display', 'Georgia', serif", color: ink, margin: '0 0 8px', letterSpacing: '-0.01em' }}>{execSummary.title}</h3>
          <p style={{ fontSize: 13, color: inkSoft, margin: 0, lineHeight: 1.6 }}>{execSummary.summary}</p>
        </GlassCard>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10 }}>
          {execSummary.metrics.filter((m: any) => m.label !== 'Top Category' && m.label !== 'Top Customer' && m.label !== 'Inventory Turnover').map((metric: any) => (
            <div key={metric.label} style={{ background: paper, borderRadius: 14, padding: '14px 16px', border: `1.4px solid ${hairline}`, borderLeft: `4px solid ${teal[500]}` }}>
              <p style={{ fontSize: 10, fontWeight: 700, color: inkSoft, textTransform: 'uppercase', margin: '0 0 4px', letterSpacing: '0.02em' }}>{metric.label}</p>
              <p style={{ fontSize: 18, fontWeight: 700, color: ink, margin: 0, fontVariantNumeric: 'tabular-nums' }}>{metric.value}</p>
              {metric.change && (
                <p style={{ fontSize: 11, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4, margin: '4px 0 0', color: metric.direction === 'up' ? teal[600] : metric.direction === 'down' ? danger : inkSoft }}>
                  {metric.direction === 'up' ? <ArrowUp size={11} /> : metric.direction === 'down' ? <ArrowDown size={11} /> : null}
                  {metric.change}
                </p>
              )}
            </div>
          ))}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <GlassCard>
            <div style={{ fontSize: 11, fontWeight: 700, color: inkSoft, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
              <Sparkles size={13} color={amber[500]} /> Highlights
            </div>
            <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
              {execSummary.highlights.map((h: string, i: number) => (
                <li key={i} style={{ fontSize: 13, color: inkSoft, padding: '5px 0', display: 'flex', alignItems: 'flex-start', gap: 8, borderBottom: i < execSummary.highlights.length - 1 ? `1px solid ${hairline}` : 'none' }}>
                  <span style={{ color: teal[500], flexShrink: 0, marginTop: 2 }}>&bull;</span>
                  {h}
                </li>
              ))}
              {execSummary.highlights.length === 0 && <li style={{ fontSize: 13, color: inkSoft, padding: '8px 0' }}>No highlights available.</li>}
            </ul>
          </GlassCard>
          <GlassCard>
            <div style={{ fontSize: 11, fontWeight: 700, color: inkSoft, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
              <Award size={13} color={teal[500]} /> Recommendations
            </div>
            <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
              {execSummary.recommendations.map((r: string, i: number) => (
                <li key={i} style={{ fontSize: 13, color: inkSoft, padding: '5px 0', display: 'flex', alignItems: 'flex-start', gap: 8, borderBottom: i < execSummary.recommendations.length - 1 ? `1px solid ${hairline}` : 'none' }}>
                  <span style={{ color: teal[500], flexShrink: 0, marginTop: 2 }}>&rarr;</span>
                  {r}
                </li>
              ))}
              {execSummary.recommendations.length === 0 && <li style={{ fontSize: 13, color: inkSoft, padding: '8px 0' }}>No recommendations available.</li>}
            </ul>
          </GlassCard>
        </div>
      </div>
    );
  };

  const renderFinancialHealth = () => {
    if (!healthScore) return null;
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <GlassCard style={{ textAlign: 'center' }}>
          <p style={{ fontSize: 10, fontWeight: 700, color: inkSoft, textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 8px' }}>Financial Health Score</p>
          <div style={{ fontSize: 48, fontWeight: 900, color: ink, letterSpacing: '-0.03em', lineHeight: 1 }}>{healthScore.score}</div>
          <div style={{ fontSize: 40, fontWeight: 900, color: getGradeColor(healthScore.grade), marginTop: 4 }}>{healthScore.grade}</div>
          <p style={{ fontSize: 12, color: inkSoft, marginTop: 8 }}>Overall Financial Health Grade</p>
        </GlassCard>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          {healthScore.breakdown.map((item: any) => (
            <GlassCard key={item.category}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <h4 style={{ fontSize: 13, fontWeight: 700, color: ink, margin: 0 }}>{item.category}</h4>
                <span style={{ fontSize: 13, fontWeight: 700, color: ink }}>{item.score}/{item.maxScore}</span>
              </div>
              <div style={{ height: 8, backgroundColor: '#f1f5f9', borderRadius: 999, overflow: 'hidden', marginBottom: 8 }}>
                <div style={{ height: '100%', borderRadius: 999, backgroundColor: getProgressColor(item.score, item.maxScore), width: `${(item.score / item.maxScore) * 100}%`, transition: 'width 0.5s' }} />
              </div>
              <p style={{ fontSize: 12, color: inkSoft, margin: 0 }}>{item.comment}</p>
            </GlassCard>
          ))}
        </div>
      </div>
    );
  };

  const renderSalesSummary = () => {
    if (!salesSummary) return null;
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <GlassCard>
          <h3 style={{ fontSize: 17, fontWeight: 400, fontFamily: "'DM Serif Display', 'Georgia', serif", color: ink, margin: '0 0 8px', letterSpacing: '-0.01em' }}>{salesSummary.title}</h3>
          <p style={{ fontSize: 13, color: inkSoft, margin: 0, lineHeight: 1.6 }}>{salesSummary.summary}</p>
        </GlassCard>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <GlassCard>
            <div style={{ fontSize: 11, fontWeight: 700, color: inkSoft, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
              <BarChart3 size={13} color={teal[500]} /> Key Findings
            </div>
            <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
              {salesSummary.keyFindings.map((f: string, i: number) => (
                <li key={i} style={{ fontSize: 13, color: inkSoft, padding: '5px 0', display: 'flex', alignItems: 'flex-start', gap: 8, borderBottom: i < salesSummary.keyFindings.length - 1 ? `1px solid ${hairline}` : 'none' }}>
                  <span style={{ color: teal[500], flexShrink: 0, marginTop: 2 }}>&bull;</span>
                  {f}
                </li>
              ))}
              {salesSummary.keyFindings.length === 0 && <li style={{ fontSize: 13, color: inkSoft, padding: '8px 0' }}>No key findings available.</li>}
            </ul>
          </GlassCard>
          <GlassCard>
            <div style={{ fontSize: 11, fontWeight: 700, color: inkSoft, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
              <TrendingUp size={13} color={teal[500]} /> Trends
            </div>
            <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
              {salesSummary.trends.map((t: string, i: number) => (
                <li key={i} style={{ fontSize: 13, color: inkSoft, padding: '5px 0', display: 'flex', alignItems: 'flex-start', gap: 8, borderBottom: i < salesSummary.trends.length - 1 ? `1px solid ${hairline}` : 'none' }}>
                  <span style={{ color: teal[500], flexShrink: 0, marginTop: 2 }}>&rarr;</span>
                  {t}
                </li>
              ))}
              {salesSummary.trends.length === 0 && <li style={{ fontSize: 13, color: inkSoft, padding: '8px 0' }}>No trends identified.</li>}
            </ul>
          </GlassCard>
        </div>
        <GlassCard>
          <div style={{ fontSize: 11, fontWeight: 700, color: inkSoft, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
            <Activity size={13} color={teal[500]} /> Suggested Charts
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 10 }}>
            {salesSummary.charts.map((chart: any, i: number) => (
              <div key={i} style={{ background: paper, borderRadius: 10, padding: '14px', border: `1px solid ${hairline}` }}>
                <p style={{ fontSize: 13, fontWeight: 700, color: ink, margin: 0 }}>{chart.title}</p>
                <p style={{ fontSize: 11, color: inkSoft, margin: '4px 0 0' }}>{chart.description}</p>
                <span style={{ fontSize: 10, fontWeight: 700, color: teal[500], textTransform: 'uppercase', marginTop: 6, display: 'inline-block' }}>{chart.type} chart</span>
              </div>
            ))}
          </div>
        </GlassCard>
      </div>
    );
  };

  const renderExpenseSummary = () => {
    if (!expenseSummary) return null;
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <GlassCard>
          <h3 style={{ fontSize: 17, fontWeight: 400, fontFamily: "'DM Serif Display', 'Georgia', serif", color: ink, margin: '0 0 8px', letterSpacing: '-0.01em' }}>{expenseSummary.title}</h3>
          <p style={{ fontSize: 13, color: inkSoft, margin: 0, lineHeight: 1.6 }}>{expenseSummary.summary}</p>
        </GlassCard>
        <GlassCard>
          <div style={{ fontSize: 11, fontWeight: 700, color: inkSoft, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
            <BarChart3 size={13} color={amber[500]} /> Key Findings
          </div>
          <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
            {expenseSummary.keyFindings.map((f: string, i: number) => (
              <li key={i} style={{ fontSize: 13, color: inkSoft, padding: '5px 0', display: 'flex', alignItems: 'flex-start', gap: 8, borderBottom: i < expenseSummary.keyFindings.length - 1 ? `1px solid ${hairline}` : 'none' }}>
                <span style={{ color: amber[500], flexShrink: 0, marginTop: 2 }}>&bull;</span>
                {f}
              </li>
            ))}
            {expenseSummary.keyFindings.length === 0 && <li style={{ fontSize: 13, color: inkSoft, padding: '8px 0' }}>No key findings available.</li>}
          </ul>
        </GlassCard>
        <GlassCard>
          <div style={{ fontSize: 11, fontWeight: 700, color: inkSoft, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
            <DollarSign size={13} color={danger} /> Category Breakdown
          </div>
          <div style={{ border: `1px solid ${hairline}`, borderRadius: 10, overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ backgroundColor: teal[50], borderBottom: `1px solid ${hairline}` }}>
                    <th style={{ textAlign: 'left', padding: '10px 14px', fontWeight: 700, fontSize: 11, color: teal[800], textTransform: 'uppercase', letterSpacing: '0.04em' }}>Category</th>
                    <th style={{ textAlign: 'right', padding: '10px 14px', fontWeight: 700, fontSize: 11, color: teal[800], textTransform: 'uppercase', letterSpacing: '0.04em' }}>Amount</th>
                    <th style={{ textAlign: 'right', padding: '10px 14px', fontWeight: 700, fontSize: 11, color: teal[800], textTransform: 'uppercase', letterSpacing: '0.04em' }}>% of Total</th>
                  </tr>
                </thead>
                <tbody>
                  {expenseSummary.categories.map((cat: any) => (
                    <tr key={cat.name} style={{ borderBottom: `1px solid ${hairline}`, transition: 'background-color 0.1s' }}
                      onMouseEnter={e => { e.currentTarget.style.backgroundColor = teal[50]; }}
                      onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'transparent'; }}>
                      <td style={{ padding: '10px 14px', fontWeight: 600, color: ink }}>{cat.name}</td>
                      <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 700, color: ink, fontVariantNumeric: 'tabular-nums' }}>{formatCurrency(cat.amount)}</td>
                      <td style={{ padding: '10px 14px', textAlign: 'right' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8 }}>
                          <div style={{ width: 60, height: 6, backgroundColor: '#f1f5f9', borderRadius: 999, overflow: 'hidden' }}>
                            <div style={{ height: '100%', backgroundColor: danger, borderRadius: 999, width: `${Math.min(cat.percentOfTotal, 100)}%` }} />
                          </div>
                          <span style={{ fontSize: 12, fontWeight: 600, color: inkSoft }}>{formatPercent(cat.percentOfTotal)}</span>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {expenseSummary.categories.length === 0 && (
                    <tr><td colSpan={3} style={{ padding: '40px 0', textAlign: 'center', color: inkSoft, fontSize: 13 }}>No expense categories found.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </GlassCard>
        <GlassCard>
          <div style={{ fontSize: 11, fontWeight: 700, color: inkSoft, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
            <Award size={13} color={teal[500]} /> Recommendations
          </div>
          <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
            {expenseSummary.recommendations.map((r: string, i: number) => (
              <li key={i} style={{ fontSize: 13, color: inkSoft, padding: '5px 0', display: 'flex', alignItems: 'flex-start', gap: 8, borderBottom: i < expenseSummary.recommendations.length - 1 ? `1px solid ${hairline}` : 'none' }}>
                <span style={{ color: teal[500], flexShrink: 0, marginTop: 2 }}>&rarr;</span>
                {r}
              </li>
            ))}
            {expenseSummary.recommendations.length === 0 && <li style={{ fontSize: 13, color: inkSoft, padding: '8px 0' }}>No recommendations available.</li>}
          </ul>
        </GlassCard>
      </div>
    );
  };

  const renderInventorySummary = () => {
    if (!inventorySummary) return null;
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <GlassCard>
          <h3 style={{ fontSize: 17, fontWeight: 400, fontFamily: "'DM Serif Display', 'Georgia', serif", color: ink, margin: '0 0 8px', letterSpacing: '-0.01em' }}>{inventorySummary.title}</h3>
          <p style={{ fontSize: 13, color: inkSoft, margin: 0, lineHeight: 1.6 }}>{inventorySummary.summary}</p>
        </GlassCard>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
          <div style={{ background: paper, borderRadius: 14, padding: '14px 16px', border: `1.4px solid ${hairline}`, borderLeft: `4px solid ${teal[500]}` }}>
            <p style={{ fontSize: 10, fontWeight: 700, color: inkSoft, textTransform: 'uppercase', margin: '0 0 4px' }}>Total Items</p>
            <p style={{ fontSize: 18, fontWeight: 700, color: ink, margin: 0 }}>{inventorySummary.totalItems}</p>
          </div>
          <div style={{ background: paper, borderRadius: 14, padding: '14px 16px', border: `1.4px solid ${hairline}`, borderLeft: `4px solid ${teal[500]}` }}>
            <p style={{ fontSize: 10, fontWeight: 700, color: inkSoft, textTransform: 'uppercase', margin: '0 0 4px' }}>Total Value</p>
            <p style={{ fontSize: 18, fontWeight: 700, color: ink, margin: 0 }}>{formatCurrency(inventorySummary.totalValue)}</p>
          </div>
          <div style={{ background: paper, borderRadius: 14, padding: '14px 16px', border: `1.4px solid ${hairline}`, borderLeft: `4px solid ${amber[500]}` }}>
            <p style={{ fontSize: 10, fontWeight: 700, color: inkSoft, textTransform: 'uppercase', margin: '0 0 4px' }}>Low Stock</p>
            <p style={{ fontSize: 18, fontWeight: 700, color: amber[600], margin: 0 }}>{inventorySummary.lowStockItems}</p>
          </div>
          <div style={{ background: paper, borderRadius: 14, padding: '14px 16px', border: `1.4px solid ${hairline}`, borderLeft: `4px solid ${danger}` }}>
            <p style={{ fontSize: 10, fontWeight: 700, color: inkSoft, textTransform: 'uppercase', margin: '0 0 4px' }}>Overstock</p>
            <p style={{ fontSize: 18, fontWeight: 700, color: danger, margin: 0 }}>{inventorySummary.overstockItems}</p>
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <GlassCard>
            <div style={{ fontSize: 11, fontWeight: 700, color: inkSoft, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
              <Package size={13} color={teal[500]} /> Top Moving Items
            </div>
            {inventorySummary.topMovingItems.length > 0 ? (
              <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
                {inventorySummary.topMovingItems.map((item: string, i: number) => (
                  <li key={i} style={{ fontSize: 13, color: inkSoft, padding: '6px 0', display: 'flex', alignItems: 'center', gap: 10, borderBottom: i < inventorySummary.topMovingItems.length - 1 ? `1px solid ${hairline}` : 'none' }}>
                    <span style={{ width: 22, height: 22, borderRadius: 999, backgroundColor: teal[50], color: teal[500], fontSize: 10, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{i + 1}</span>
                    {item}
                  </li>
                ))}
              </ul>
            ) : (
              <p style={{ fontSize: 13, color: inkSoft, margin: 0 }}>No movement data available.</p>
            )}
          </GlassCard>
          <GlassCard>
            <div style={{ fontSize: 11, fontWeight: 700, color: inkSoft, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
              <Award size={13} color={teal[500]} /> Recommendations
            </div>
            <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
              {inventorySummary.recommendations.map((r: string, i: number) => (
                <li key={i} style={{ fontSize: 13, color: inkSoft, padding: '5px 0', display: 'flex', alignItems: 'flex-start', gap: 8, borderBottom: i < inventorySummary.recommendations.length - 1 ? `1px solid ${hairline}` : 'none' }}>
                  <span style={{ color: teal[500], flexShrink: 0, marginTop: 2 }}>&rarr;</span>
                  {r}
                </li>
              ))}
              {inventorySummary.recommendations.length === 0 && <li style={{ fontSize: 13, color: inkSoft, padding: '8px 0' }}>No recommendations available.</li>}
            </ul>
          </GlassCard>
        </div>
      </div>
    );
  };

  return (
    <div style={{
      minHeight: '100vh',
      background: paper,
      padding: '20px',
      fontFamily: "'Inter','DM Sans',sans-serif",
      color: ink,
    }}>
      <div style={{ maxWidth: 1520, width: '100%', margin: '0 auto', display: 'flex', gap: 16, alignItems: 'stretch' }}>
        <div style={{ width: 280, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ background: paper, borderRadius: 14, padding: '20px 18px', border: `1.4px solid ${hairline}`, boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <div style={{
                width: 36, height: 36, borderRadius: 10,
                background: `linear-gradient(155deg, ${teal[500]}, ${teal[700]})`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: `0 4px 10px -3px rgba(15,84,76,.6)`,
              }}>
                <BrainCircuit size={18} />
              </div>
              <div>
                <h1 style={{ fontSize: 15, fontWeight: 400, fontFamily: "'DM Serif Display', 'Georgia', serif", color: teal[800], margin: 0, letterSpacing: 0.2 }}>Report</h1>
                <p style={{ fontSize: 10, fontWeight: 600, color: inkSoft, margin: 0, letterSpacing: '0.05em', textTransform: 'uppercase' }}>Summary</p>
              </div>
            </div>
            <div ref={periodRef} style={{ position: 'relative' }}>
              <button
                onClick={() => setPeriodOpen(o => !o)}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, width: '100%', padding: '8px 0', borderRadius: 9, border: `1.4px solid ${hairline}`, background: paper, color: inkSoft, fontSize: 12, fontWeight: 600, cursor: 'pointer', transition: 'all 0.15s', fontFamily: "'Inter', sans-serif" }}
                onMouseEnter={e => { e.currentTarget.style.background = teal[50]; e.currentTarget.style.color = teal[700]; e.currentTarget.style.borderColor = teal[200]; }}
                onMouseLeave={e => { e.currentTarget.style.background = paper; e.currentTarget.style.color = inkSoft; e.currentTarget.style.borderColor = hairline; }}
              >
                <FileText size={13} /> {period} <ChevronDown size={12} style={{ transition: 'transform 0.15s', transform: periodOpen ? 'rotate(180deg)' : 'none' }} />
              </button>
              {periodOpen && (
                <div style={{ position: 'absolute', top: 'calc(100% + 6px)', left: 0, right: 0, backgroundColor: paper, border: `1.4px solid ${hairline}`, borderRadius: 12, boxShadow: '0 8px 24px rgba(0,0,0,0.1)', zIndex: 50, overflow: 'hidden' }}>
                  {PERIODS.map(p => (
                    <button key={p} onClick={() => { setPeriod(p); setPeriodOpen(false); }} style={{ display: 'block', width: '100%', textAlign: 'left', padding: '10px 14px', fontSize: 12, fontWeight: period === p ? 700 : 500, color: period === p ? teal[700] : inkSoft, backgroundColor: period === p ? teal[50] : 'transparent', border: 'none', cursor: 'pointer', transition: 'background-color 0.1s', fontFamily: "'Inter', sans-serif" }}>
                      {p}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
          <div style={{ background: paper, borderRadius: 14, border: `1.4px solid ${hairline}`, boxShadow: '0 1px 3px rgba(0,0,0,0.04)', padding: '10px', flex: 1, display: 'flex', flexDirection: 'column' }}>
            {TABS.map(tab => {
              const isActive = activeTab === tab.key;
              return (
                <button key={tab.key} onClick={() => setActiveTab(tab.key)} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderRadius: 9, border: 'none', background: isActive ? paper : 'transparent', boxShadow: isActive ? '0 1px 4px rgba(0,0,0,0.06)' : 'none', cursor: 'pointer', textAlign: 'left', width: '100%', transition: 'all 0.15s', marginBottom: 2, fontFamily: "'Inter', sans-serif" }}
                  onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = teal[50]; }}
                  onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'transparent'; }}
                >
                  <div style={{
                    width: 32, height: 32, borderRadius: 8,
                    background: isActive ? `${tab.color}15` : '#f1f5f9',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                  }}>
                    <tab.icon size={15} color={isActive ? tab.color : inkSoft} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontSize: 13, fontWeight: isActive ? 700 : 600,
                      color: isActive ? ink : inkSoft,
                    }}>{tab.label}</div>
                    <div style={{
                      fontSize: 10, color: inkSoft, marginTop: 1,
                      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                    }}>{tab.desc}</div>
                  </div>
                  {isActive && <ChevronRight size={14} color={tab.color} />}
                </button>
              );
            })}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <SidebarKpi label="Revenue" value={revenue > 0 ? formatCurrency(revenue) : '-'} color={teal[500]} sub="total" />
            <SidebarKpi label="Expenses" value={expensesVal > 0 ? formatCurrency(expensesVal) : '-'} color={danger} sub="total" />
            <SidebarKpi label="Margin" value={profitMargin > 0 ? `${profitMargin.toFixed(1)}%` : '-'} color={profitMargin >= 0 ? teal[600] : danger} sub="profit margin" />
            <SidebarKpi label="Health" value={healthScore ? `${healthScore.score}` : '-'} color={healthScore?.score >= 70 ? teal[600] : danger} sub={`grade ${healthScore?.grade || '-'}`} />
          </div>
        </div>
        <div style={{ flex: 1, minWidth: 0, background: paper, borderRadius: 14, border: `1.4px solid ${hairline}`, boxShadow: '0 1px 3px rgba(0,0,0,0.04)', padding: '24px', overflow: 'auto' }}>
          {renderContent()}
        </div>
      </div>
    </div>
  );
};

const getGradeColor = (grade: string) => {
  switch (grade) {
    case 'A': return teal[600];
    case 'B': return '#2563eb';
    case 'C': return amber[500];
    case 'D': return '#ea580c';
    case 'F': return danger;
    default: return inkSoft;
  }
};

const getProgressColor = (score: number, maxScore: number) => {
  const pct = (score / maxScore) * 100;
  if (pct >= 80) return teal[500];
  if (pct >= 60) return '#3b82f6';
  if (pct >= 40) return amber[500];
  return danger;
};

const GlassCard: React.FC<{ children: React.ReactNode; style?: React.CSSProperties }> = ({ children, style }) => (
  <div style={{ background: paper, borderRadius: 14, padding: '20px', boxShadow: '0 1px 3px rgba(0,0,0,0.04)', border: `1.4px solid ${hairline}`, ...style }}>
    {children}
  </div>
);

const SidebarKpi: React.FC<{ label: string; value: string; color: string; sub: string }> = ({ label, value, color, sub }) => (
  <div style={{ background: paper, borderRadius: 12, padding: '12px', border: `1.4px solid ${hairline}`, textAlign: 'center' }}>
    <div style={{ fontSize: 9, fontWeight: 700, color: inkSoft, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
    <div style={{ fontSize: 20, fontWeight: 800, color, marginTop: 4 }}>{value}</div>
    <div style={{ fontSize: 9, color: inkSoft }}>{sub}</div>
  </div>
);

export default ReportSummary;