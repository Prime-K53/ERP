import React, { useState, useMemo } from 'react';
import { logger } from '@/services/logger';
import {
  Users, Shield, AlertTriangle, ChevronDown, ChevronUp,
  Loader2, DollarSign, Calendar, ShoppingCart, TrendingUp,
  TrendingDown, CreditCard, RotateCcw, Search, X,
  BarChart3, Activity, Clock, Star
} from 'lucide-react';
import { useSales } from '../context/SalesContext';
import { useFinance } from '../context/FinanceContext';
import {
  calculateCustomerRiskScore, classifyRiskCategory,
  getCustomerPaymentHistory, getCustomerPurchaseFrequency,
  getCustomerAverageOrderValue, getCustomerCreditUsage, getCustomerReturnRate
} from '../services/customerRiskService';
import { formatCurrency } from '../services/reportSummaryService';

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

const toSafeNumber = (value: unknown): number => {
  if (value === null || value === undefined) return 0;
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (typeof value === 'string') {
    const cleaned = value.replace(/,/g, '');
    const n = parseFloat(cleaned);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
};

const CustomerRiskScore: React.FC = () => {
  const { sales, customers } = useSales();
  const { invoices, customerPayments: payments } = useFinance();
  const [loading] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<any>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('All');

  const customerScores = useMemo(() => {
    return (customers || []).map((customer) => {
      const id = customer.id || customer.customerId || '';
      return calculateCustomerRiskScore(
        customer,
        (invoices || []).filter((i: any) => (i.customerId || i.customer_id) === id),
        (payments || []).filter((p: any) => (p.customerId || p.customer_id) === id),
        (sales || []).filter((s: any) => (s.customerId || s.customer_id) === id)
      );
    });
  }, [customers, invoices, payments, sales]);

  const filteredScores = useMemo(() => {
    let result = customerScores;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter((s) => s.customerName.toLowerCase().includes(q));
    }
    if (categoryFilter !== 'All') {
      result = result.filter((s) => s.category === categoryFilter);
    }
    return result;
  }, [customerScores, searchQuery, categoryFilter]);

  const categoryCounts = useMemo(() => {
    const counts = { Low: 0, Medium: 0, High: 0 };
    customerScores.forEach((s) => {
      if (s.category === 'Low') counts.Low++;
      else if (s.category === 'Medium') counts.Medium++;
      else if (s.category === 'High') counts.High++;
    });
    return counts;
  }, [customerScores]);

  const getScoreColor = (score: number) => {
    if (score >= 71) return teal[600];
    if (score >= 41) return amber[500];
    return danger;
  };

  const getCategoryBadge = (category: string) => {
    const styles: Record<string, { bg: string; text: string }> = {
      Low: { bg: teal[50], text: teal[700] },
      Medium: { bg: amber[100], text: amber[600] },
      High: { bg: '#fef2f2', text: danger },
    };
    const s = styles[category] || styles.Medium;
    return (
      <span style={{ display: 'inline-flex', padding: '2px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700, background: s.bg, color: s.text }}>
        {category}
      </span>
    );
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', padding: 40, background: paper, fontFamily: "'Inter','DM Sans',sans-serif" }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
          <Loader2 size={32} style={{ animation: 'spin 1s linear infinite', color: teal[500] }} />
          <p style={{ color: inkSoft, fontSize: 13.5, fontWeight: 500 }}>Analyzing customer risk profiles...</p>
        </div>
      </div>
    );
  }

  const detail = selectedCustomer ? customerScores.find(
    (s) => (s.customerId || '') === (selectedCustomer.id || selectedCustomer.customerId || '')
  ) : null;

  return (
    <div style={{ padding: 24, background: paper, fontFamily: "'Inter','DM Sans',sans-serif", fontSize: 13.5, color: ink, minHeight: '100vh' }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 400, fontFamily: "'DM Serif Display', 'Georgia', serif", color: teal[800], letterSpacing: 0.2, margin: 0 }}>Customer Risk Score</h1>
        <p style={{ fontSize: 12.5, color: inkSoft, marginTop: 4, fontWeight: 500, letterSpacing: 0.01 }}>Analyze customer payment behavior and risk profiles</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 24 }}>
        <div style={{ background: paper, borderRadius: 14, padding: '14px 16px', boxShadow: '0 1px 3px rgba(0,0,0,0.04)', border: `1.4px solid ${hairline}`, display: 'flex', alignItems: 'center', gap: 14, borderLeft: `4px solid ${teal[500]}` }}>
          <div style={{ width: 38, height: 38, borderRadius: 10, background: teal[50], display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Shield size={18} color={teal[500]} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: inkSoft, textTransform: 'uppercase', letterSpacing: '-0.02em', marginBottom: 2 }}>Low Risk</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: teal[700], fontVariantNumeric: 'tabular-nums', lineHeight: 1.2 }}>{categoryCounts.Low}</div>
          </div>
        </div>
        <div style={{ background: paper, borderRadius: 14, padding: '14px 16px', boxShadow: '0 1px 3px rgba(0,0,0,0.04)', border: `1.4px solid ${hairline}`, display: 'flex', alignItems: 'center', gap: 14, borderLeft: `4px solid ${amber[500]}` }}>
          <div style={{ width: 38, height: 38, borderRadius: 10, background: amber[100], display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <AlertTriangle size={18} color={amber[500]} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: inkSoft, textTransform: 'uppercase', letterSpacing: '-0.02em', marginBottom: 2 }}>Medium Risk</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: amber[600], fontVariantNumeric: 'tabular-nums', lineHeight: 1.2 }}>{categoryCounts.Medium}</div>
          </div>
        </div>
        <div style={{ background: paper, borderRadius: 14, padding: '14px 16px', boxShadow: '0 1px 3px rgba(0,0,0,0.04)', border: `1.4px solid ${hairline}`, display: 'flex', alignItems: 'center', gap: 14, borderLeft: `4px solid ${danger}` }}>
          <div style={{ width: 38, height: 38, borderRadius: 10, background: '#fef2f2', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <AlertTriangle size={18} color={danger} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: inkSoft, textTransform: 'uppercase', letterSpacing: '-0.02em', marginBottom: 2 }}>High Risk</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: danger, fontVariantNumeric: 'tabular-nums', lineHeight: 1.2 }}>{categoryCounts.High}</div>
          </div>
        </div>
        <div style={{ background: paper, borderRadius: 14, padding: '14px 16px', boxShadow: '0 1px 3px rgba(0,0,0,0.04)', border: `1.4px solid ${hairline}`, display: 'flex', alignItems: 'center', gap: 14, borderLeft: `4px solid ${teal[500]}` }}>
          <div style={{ width: 38, height: 38, borderRadius: 10, background: teal[50], display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Users size={18} color={teal[500]} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: inkSoft, textTransform: 'uppercase', letterSpacing: '-0.02em', marginBottom: 2 }}>Total Customers</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: ink, fontVariantNumeric: 'tabular-nums', lineHeight: 1.2 }}>{customers.length}</div>
          </div>
        </div>
      </div>

      <div style={{ background: paper, borderRadius: 14, boxShadow: '0 1px 3px rgba(0,0,0,0.04)', border: `1.4px solid ${hairline}`, overflow: 'hidden' }}>
        <div style={{ padding: 14, borderBottom: `1px solid ${hairline}`, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ position: 'relative', flex: 1, minWidth: 200 }}>
            <Search size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: inkSoft }} />
            <input
              placeholder="Search customers..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{ width: '100%', padding: '9px 12px 9px 36px', borderRadius: 9, border: `1.4px solid ${hairline}`, fontSize: 13.5, outline: 'none', fontFamily: "'Inter', sans-serif", color: ink, background: paper }}
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery('')} style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: inkSoft }}>
                <X size={14} />
              </button>
            )}
          </div>
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            style={{ padding: '9px 12px', borderRadius: 9, border: `1.4px solid ${hairline}`, fontSize: 13.5, outline: 'none', background: paper, fontFamily: "'Inter', sans-serif", color: ink, cursor: 'pointer', appearance: 'none', backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%235c6567'/%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 12px center', paddingRight: 30 }}
          >
            <option value="All">All Categories</option>
            <option value="Low">Low Risk</option>
            <option value="Medium">Medium Risk</option>
            <option value="High">High Risk</option>
          </select>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: teal[50], borderBottom: `2px solid ${hairline}` }}>
                <th style={{ padding: '12px 16px', textAlign: 'left', color: teal[800], fontWeight: 700, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Customer</th>
                <th style={{ padding: '12px 16px', textAlign: 'left', color: teal[800], fontWeight: 700, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Risk Score</th>
                <th style={{ padding: '12px 16px', textAlign: 'left', color: teal[800], fontWeight: 700, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Category</th>
                <th style={{ padding: '12px 16px', textAlign: 'right', color: teal[800], fontWeight: 700, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total Spent</th>
                <th style={{ padding: '12px 16px', textAlign: 'right', color: teal[800], fontWeight: 700, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Outstanding</th>
                <th style={{ padding: '12px 16px', textAlign: 'center', color: teal[800], fontWeight: 700, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredScores.length === 0 && (
                <tr><td colSpan={6} style={{ padding: 40, textAlign: 'center', color: inkSoft }}>No customers found</td></tr>
              )}
              {filteredScores.map((score) => (
                <tr
                  key={score.customerId}
                  onClick={() => setSelectedCustomer(customers.find((c: any) => (c.id || c.customerId) === score.customerId))}
                  style={{ borderBottom: `1px solid ${hairline}`, cursor: 'pointer', background: selectedCustomer?.id === score.customerId ? teal[50] : undefined }}
                >
                  <td style={{ padding: '12px 16px', fontWeight: 600, color: ink }}>{score.customerName}</td>
                  <td style={{ padding: '12px 16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ flex: 1, maxWidth: 100, height: 6, background: '#f1f5f9', borderRadius: 3, overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${score.score}%`, background: getScoreColor(score.score), borderRadius: 3, transition: 'width 0.3s' }} />
                      </div>
                      <span style={{ fontSize: 12, fontWeight: 700, color: getScoreColor(score.score) }}>{score.score}</span>
                    </div>
                  </td>
                  <td style={{ padding: '12px 16px' }}>{getCategoryBadge(score.category)}</td>
                  <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 600, color: ink }}>
                    {formatCurrency(score.factors?.find((f) => f.name === 'Average Order Value')?.impact || 0)}
                  </td>
                  <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 600, color: danger }}>
                    {formatCurrency(score.factors?.find((f) => f.name === 'Credit Usage')?.impact || 0)}
                  </td>
                  <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedCustomer(selectedCustomer?.id === score.customerId ? null : customers.find((c: any) => (c.id || c.customerId) === score.customerId));
                      }}
                      style={{ padding: '6px 12px', borderRadius: 8, border: `1px solid ${hairline}`, background: paper, fontSize: 11, fontWeight: 600, color: teal[600], cursor: 'pointer', fontFamily: "'Inter', sans-serif" }}
                    >
                      {selectedCustomer?.id === score.customerId ? 'Close' : 'Details'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {selectedCustomer && detail && (() => {
        const cId = selectedCustomer.id || selectedCustomer.customerId || '';
        const paymentHistory = getCustomerPaymentHistory(cId, invoices, payments);
        const purchaseFrequency = getCustomerPurchaseFrequency(cId, sales);
        const avgOrderValue = getCustomerAverageOrderValue(cId, sales, invoices);
        const creditUsage = getCustomerCreditUsage(cId, invoices);
        const returnRate = getCustomerReturnRate(cId, sales);

        return (
          <div style={{ marginTop: 24, background: paper, borderRadius: 14, boxShadow: '0 1px 3px rgba(0,0,0,0.04)', border: `1.4px solid ${hairline}`, padding: 24 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
              <h2 style={{ fontSize: 18, fontWeight: 400, fontFamily: "'DM Serif Display', 'Georgia', serif", color: teal[800] }}>{detail.customerName} — Risk Detail</h2>
              <span style={{ fontSize: 36, fontWeight: 900, color: getScoreColor(detail.score) }}>{detail.score}<span style={{ fontSize: 14, fontWeight: 600, color: inkSoft }}>/100</span></span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: 16, marginBottom: 20 }}>
              <div style={{ padding: 16, borderRadius: 12, background: paper, border: `1px solid ${hairline}` }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <Clock size={14} color={teal[500]} />
                  <span style={{ fontSize: 11, fontWeight: 700, color: inkSoft, textTransform: 'uppercase' }}>Payment History</span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                  <div><span style={{ fontSize: 11, color: inkSoft }}>On Time</span><p style={{ fontSize: 18, fontWeight: 800, color: teal[600] }}>{paymentHistory.onTime}</p></div>
                  <div><span style={{ fontSize: 11, color: inkSoft }}>Late</span><p style={{ fontSize: 18, fontWeight: 800, color: amber[500] }}>{paymentHistory.late}</p></div>
                  <div><span style={{ fontSize: 11, color: inkSoft }}>Missed</span><p style={{ fontSize: 18, fontWeight: 800, color: danger }}>{paymentHistory.missed}</p></div>
                </div>
                <p style={{ fontSize: 12, color: inkSoft, marginTop: 8 }}>Avg payment: {paymentHistory.averagePaymentDays} days</p>
              </div>

              <div style={{ padding: 16, borderRadius: 12, background: paper, border: `1px solid ${hairline}` }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <ShoppingCart size={14} color={teal[500]} />
                  <span style={{ fontSize: 11, fontWeight: 700, color: inkSoft, textTransform: 'uppercase' }}>Purchase Frequency</span>
                </div>
                <p style={{ fontSize: 18, fontWeight: 800, color: ink }}>{purchaseFrequency.totalOrders} <span style={{ fontSize: 12, fontWeight: 500, color: inkSoft }}>orders</span></p>
                <p style={{ fontSize: 12, color: inkSoft }}>Every {purchaseFrequency.frequencyDays} days</p>
                <p style={{ fontSize: 12, color: purchaseFrequency.trend === 'increasing' ? teal[600] : purchaseFrequency.trend === 'declining' ? danger : inkSoft }}>
                  Trend: {purchaseFrequency.trend}
                </p>
              </div>

              <div style={{ padding: 16, borderRadius: 12, background: paper, border: `1px solid ${hairline}` }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <DollarSign size={14} color={teal[500]} />
                  <span style={{ fontSize: 11, fontWeight: 700, color: inkSoft, textTransform: 'uppercase' }}>Avg Order Value</span>
                </div>
                <p style={{ fontSize: 18, fontWeight: 800, color: ink }}>{formatCurrency(avgOrderValue.averageValue)}</p>
                <p style={{ fontSize: 12, color: avgOrderValue.trend === 'rising' ? teal[600] : avgOrderValue.trend === 'falling' ? danger : inkSoft }}>
                  <TrendingUp size={12} style={{ display: 'inline' }} /> {avgOrderValue.trend}
                </p>
              </div>

              <div style={{ padding: 16, borderRadius: 12, background: paper, border: `1px solid ${hairline}` }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <CreditCard size={14} color={teal[500]} />
                  <span style={{ fontSize: 11, fontWeight: 700, color: inkSoft, textTransform: 'uppercase' }}>Credit Usage</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ flex: 1, height: 8, background: '#f1f5f9', borderRadius: 4, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${Math.min(creditUsage.utilizationPercent, 100)}%`, background: creditUsage.utilizationPercent > 80 ? danger : creditUsage.utilizationPercent > 50 ? amber[500] : teal[600], borderRadius: 4 }} />
                  </div>
                  <span style={{ fontSize: 13, fontWeight: 700, color: ink }}>{creditUsage.utilizationPercent.toFixed(0)}%</span>
                </div>
                <p style={{ fontSize: 12, color: inkSoft, marginTop: 4 }}>{formatCurrency(creditUsage.overdueAmount)} overdue</p>
              </div>

              <div style={{ padding: 16, borderRadius: 12, background: paper, border: `1px solid ${hairline}` }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <RotateCcw size={14} color={teal[500]} />
                  <span style={{ fontSize: 11, fontWeight: 700, color: inkSoft, textTransform: 'uppercase' }}>Return Rate</span>
                </div>
                <p style={{ fontSize: 18, fontWeight: 800, color: ink }}>{returnRate.totalReturns} <span style={{ fontSize: 12, fontWeight: 500, color: inkSoft }}>returns</span></p>
                <p style={{ fontSize: 12, color: inkSoft }}>{returnRate.returnRate.toFixed(1)}% rate</p>
              </div>
            </div>

            {detail.factors && detail.factors.length > 0 && (
              <div>
                <h3 style={{ fontSize: 14, fontWeight: 700, color: ink, marginBottom: 12 }}>Risk Factors Breakdown</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {detail.factors.map((factor, idx) => (
                    <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px', borderRadius: 10, background: paper, border: `1px solid ${hairline}` }}>
                      <div style={{ width: 32, height: 32, borderRadius: 8, background: factor.impact > 0 ? teal[50] : '#fef2f2', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        {factor.impact > 0 ? <TrendingUp size={14} color={teal[600]} /> : <TrendingDown size={14} color={danger} />}
                      </div>
                      <div style={{ flex: 1 }}>
                        <p style={{ fontSize: 13, fontWeight: 600, color: ink }}>{factor.name}</p>
                        <p style={{ fontSize: 11, color: inkSoft }}>{factor.detail}</p>
                      </div>
                      <span style={{ fontSize: 13, fontWeight: 700, color: factor.impact > 0 ? teal[600] : danger }}>
                        {factor.impact > 0 ? '+' : ''}{factor.impact}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        );
      })()}
    </div>
  );
};

export default CustomerRiskScore;
