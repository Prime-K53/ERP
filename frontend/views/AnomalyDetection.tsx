import React, { useState, useMemo } from 'react';
import { AlertTriangle, AlertCircle, TrendingUp, TrendingDown, DollarSign, Package, Percent, ShieldAlert, Calendar, Filter, Search, X, RefreshCw, Clock, ArrowUpDown } from 'lucide-react';
import { detectDuplicatePayments, detectSalesSpikes, detectSalesDrops, detectUnusualInventoryMovements, detectSuspiciousDiscounts, detectAbnormalExpensePatterns, detectFraudIndicators } from '../services/anomalyDetectionService';
import { formatCurrency } from '../services/reportSummaryService';
import { useAuth } from '../context/AuthContext';
import { useSales } from '../context/SalesContext';
import { useFinance } from '../context/FinanceContext';
import { useInventory } from '../context/InventoryContext';

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

type Severity = 'low' | 'medium' | 'high';

interface AnomalyBase {
  id: string;
  category: string;
  description: string;
  amount?: number;
  severity: Severity;
  date: string;
  transactionRef?: string;
  source: string;
}

interface FraudIndicator extends AnomalyBase {
  recommendation: string;
  fraudType: string;
}

const SEVERITY_ORDER: Record<Severity, number> = { high: 0, medium: 1, low: 2 };

const severityBadge = (severity: Severity) => {
  const styles: Record<Severity, { bg: string; text: string; border: string }> = {
    high: { bg: '#fef2f2', text: danger, border: '#fecaca' },
    medium: { bg: amber[100], text: amber[600], border: amber[300] },
    low: { bg: teal[50], text: teal[700], border: teal[200] },
  };
  const s = styles[severity];
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 10px',
      borderRadius: 20, fontSize: 10, fontWeight: 700, background: s.bg, color: s.text, border: `1px solid ${s.border}`,
    }}>
      {severity === 'high' && <AlertCircle size={10} />}
      {severity === 'medium' && <AlertTriangle size={10} />}
      {severity === 'low' && <Clock size={10} />}
      {severity.toUpperCase()}
    </span>
  );
};

const categoryIcon = (category: string) => {
  const icons: Record<string, React.ReactNode> = {
    duplicate_payment: <DollarSign size={14} color={danger} />,
    sales_spike: <TrendingUp size={14} color={teal[500]} />,
    sales_drop: <TrendingDown size={14} color={amber[500]} />,
    unusual_inventory: <Package size={14} color={teal[500]} />,
    suspicious_discount: <Percent size={14} color={amber[500]} />,
    abnormal_expense: <DollarSign size={14} color={danger} />,
    fraud_indicator: <ShieldAlert size={14} color={danger} />
  };
  return icons[category] || <AlertCircle size={14} color={inkSoft} />;
};

const categoryLabel = (category: string) => {
  const labels: Record<string, string> = {
    duplicate_payment: 'Duplicate Payment',
    sales_spike: 'Sales Spike',
    sales_drop: 'Sales Drop',
    unusual_inventory: 'Unusual Inventory',
    suspicious_discount: 'Suspicious Discount',
    abnormal_expense: 'Abnormal Expense',
    fraud_indicator: 'Fraud Indicator'
  };
  return labels[category] || category;
};

const AnomalyDetection: React.FC = () => {
  const { notify } = useAuth();

  const { sales } = useSales();
  const { invoices, expenses } = useFinance();
  const { inventory } = useInventory();
  const payments: any[] = [];
  const [isLoading] = useState(false);
  const [error] = useState<string | null>(null);

  const [filterSeverity, setFilterSeverity] = useState<Severity | 'all'>('all');
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');

  const anomalies = useMemo(() => {
    const results: AnomalyBase[] = [];

    try {
      const duplicatePayments = detectDuplicatePayments(payments);
      duplicatePayments.forEach(dp => {
        results.push({
          id: `dup-${dp.paymentId}`,
          category: 'duplicate_payment',
          description: dp.reason,
          amount: undefined,
          severity: dp.confidence > 80 ? 'high' : dp.confidence > 60 ? 'medium' : 'low',
          date: '',
          transactionRef: dp.paymentId,
          source: 'payment'
        });
      });
    } catch { }

    try {
      const salesSpikes = detectSalesSpikes(sales, invoices);
      salesSpikes.forEach(sp => {
        results.push({
          id: `spike-${sp.date}`,
          category: 'sales_spike',
          description: `Sales spike on ${sp.date}: ${formatCurrency(sp.amount)} (${sp.deviation.toFixed(1)}σ above avg ${formatCurrency(sp.averageAmount)})`,
          amount: sp.amount,
          severity: sp.deviation >= 4 ? 'high' : sp.deviation >= 3 ? 'medium' : 'low',
          date: sp.date,
          transactionRef: sp.transactions[0],
          source: 'sales'
        });
      });
    } catch { }

    try {
      const salesDrops = detectSalesDrops(sales, invoices);
      salesDrops.forEach(sd => {
        results.push({
          id: `drop-${sd.date}`,
          category: 'sales_drop',
          description: `Sales drop on ${sd.date}: ${formatCurrency(sd.amount)} (${Math.abs(sd.deviation).toFixed(1)}σ below avg ${formatCurrency(sd.averageAmount)})`,
          amount: sd.amount,
          severity: Math.abs(sd.deviation) >= 4 ? 'high' : Math.abs(sd.deviation) >= 3 ? 'medium' : 'low',
          date: sd.date,
          transactionRef: sd.transactions[0],
          source: 'sales'
        });
      });
    } catch { }

    try {
      const inventoryMovements = detectUnusualInventoryMovements(inventory, []);
      inventoryMovements.forEach(im => {
        results.push({
          id: `inv-${im.itemId}-${im.movementType}-${Date.now()}`,
          category: 'unusual_inventory',
          description: im.reason,
          amount: im.quantity,
          severity: im.severity,
          date: '',
          transactionRef: im.itemId,
          source: 'inventory'
        });
      });
    } catch { }

    try {
      const suspiciousDiscounts = detectSuspiciousDiscounts(sales, invoices);
      suspiciousDiscounts.forEach(sd => {
        results.push({
          id: `disc-${sd.transactionId}`,
          category: 'suspicious_discount',
          description: sd.reason,
          amount: sd.amount,
          severity: sd.severity,
          date: '',
          transactionRef: sd.transactionId,
          source: 'sales'
        });
      });
    } catch { }

    try {
      const abnormalExpenses = detectAbnormalExpensePatterns(expenses);
      abnormalExpenses.forEach(ae => {
        results.push({
          id: `exp-${ae.expenseId}`,
          category: 'abnormal_expense',
          description: ae.reason,
          amount: ae.amount,
          severity: ae.severity,
          date: '',
          transactionRef: ae.expenseId,
          source: 'expense'
        });
      });
    } catch { }

    return results;
  }, [sales, invoices, expenses, payments, inventory]);

  const fraudIndicators = useMemo(() => {
    const results: FraudIndicator[] = [];
    try {
      const indicators = detectFraudIndicators(sales, invoices, expenses, inventory);
      indicators.forEach(fi => {
        results.push({
          id: `fraud-${fi.type}-${fi.transactionId || Math.random()}`,
          category: 'fraud_indicator',
          description: fi.detail,
          amount: fi.amount,
          severity: fi.severity,
          date: '',
          transactionRef: fi.transactionId,
          source: 'fraud',
          recommendation: fi.recommendation,
          fraudType: fi.type
        });
      });
    } catch { }
    return results;
  }, [sales, invoices, expenses, inventory]);

  const allAnomalies = useMemo(() => [...anomalies, ...fraudIndicators], [anomalies, fraudIndicators]);

  const filteredAnomalies = useMemo(() => {
    return allAnomalies.filter(a => {
      if (filterSeverity !== 'all' && a.severity !== filterSeverity) return false;
      if (filterCategory !== 'all' && a.category !== filterCategory) return false;
      if (filterDateFrom && a.date && a.date < filterDateFrom) return false;
      if (filterDateTo && a.date && a.date > filterDateTo) return false;
      return true;
    }).sort((a, b) => {
      const sevOrder = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];
      if (sevOrder !== 0) return sevOrder;
      return (b.date || '').localeCompare(a.date || '');
    });
  }, [allAnomalies, filterSeverity, filterCategory, filterDateFrom, filterDateTo]);

  const summaryStats = useMemo(() => ({
    total: allAnomalies.length,
    critical: allAnomalies.filter(a => a.severity === 'high').length,
    byCategory: allAnomalies.reduce((acc, a) => {
      acc[a.category] = (acc[a.category] || 0) + 1;
      return acc;
    }, {} as Record<string, number>)
  }), [allAnomalies]);

  const uniqueCategories = useMemo(() => [...new Set(allAnomalies.map(a => a.category))], [allAnomalies]);

  if (isLoading) {
    return (
      <div style={{ padding: 24, maxWidth: 1600, margin: '0 auto', minHeight: '100vh', background: paper, fontFamily: "'Inter','DM Sans',sans-serif", color: ink, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
          <RefreshCw size={24} style={{ animation: 'spin 1s linear infinite', color: teal[500] }} />
          <p style={{ fontSize: 13.5, fontWeight: 500, color: inkSoft }}>Running anomaly detection...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: 24, maxWidth: 1600, margin: '0 auto', minHeight: '100vh', background: paper, fontFamily: "'Inter','DM Sans',sans-serif", color: ink, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ background: paper, borderRadius: 14, border: `1.4px solid ${hairline}`, padding: 32, maxWidth: 400, textAlign: 'center', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
          <AlertCircle size={32} style={{ color: danger, margin: '0 auto 12px' }} />
          <h3 style={{ fontSize: 15, fontWeight: 700, color: ink, margin: '0 0 8px' }}>Detection Failed</h3>
          <p style={{ fontSize: 13, color: inkSoft, margin: '0 0 16px' }}>{error}</p>
          <button
            onClick={() => window.location.reload()}
            style={{
              padding: '9px 18px', borderRadius: 9, border: 'none',
              background: `linear-gradient(155deg, ${teal[500]}, ${teal[700]})`,
              color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer',
              fontFamily: "'Inter', sans-serif",
            }}
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: 24, maxWidth: 1600, margin: '0 auto', display: 'flex', flexDirection: 'column', minHeight: '100vh', background: paper, fontFamily: "'Inter','DM Sans',sans-serif", fontSize: 13.5, color: ink }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 400, fontFamily: "'DM Serif Display', 'Georgia', serif", color: teal[800], letterSpacing: 0.2, margin: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
          <ShieldAlert color={danger} size={20} />
          Anomaly Detection
        </h1>
        <p style={{ fontSize: 12.5, color: inkSoft, marginTop: 4, fontWeight: 500 }}>Automated detection of unusual patterns, fraud indicators, and data anomalies</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14, marginBottom: 24 }}>
        <div style={{ background: paper, borderRadius: 14, padding: '14px 16px', boxShadow: '0 1px 3px rgba(0,0,0,0.04)', border: `1.4px solid ${hairline}`, display: 'flex', alignItems: 'center', gap: 14, borderLeft: `4px solid ${teal[500]}` }}>
          <div style={{ padding: 10, borderRadius: 10, background: teal[50], color: teal[500], display: 'inline-flex' }}><AlertTriangle size={20} /></div>
          <div>
            <p style={{ fontSize: 10, fontWeight: 700, color: inkSoft, textTransform: 'uppercase', letterSpacing: 0.08, margin: '0 0 6px' }}>Total Anomalies</p>
            <p style={{ fontSize: 18, fontWeight: 700, color: ink, margin: 0, fontVariantNumeric: 'tabular-nums' }}>{summaryStats.total}</p>
          </div>
        </div>
        <div style={{ background: paper, borderRadius: 14, padding: '14px 16px', boxShadow: '0 1px 3px rgba(0,0,0,0.04)', border: `1.4px solid ${hairline}`, display: 'flex', alignItems: 'center', gap: 14, borderLeft: `4px solid ${danger}` }}>
          <div style={{ padding: 10, borderRadius: 10, background: '#fef2f2', color: danger, display: 'inline-flex' }}><AlertCircle size={20} /></div>
          <div>
            <p style={{ fontSize: 10, fontWeight: 700, color: inkSoft, textTransform: 'uppercase', letterSpacing: 0.08, margin: '0 0 6px' }}>Critical (High)</p>
            <p style={{ fontSize: 18, fontWeight: 700, color: ink, margin: 0, fontVariantNumeric: 'tabular-nums' }}>{summaryStats.critical}</p>
          </div>
        </div>
        <div style={{ background: paper, borderRadius: 14, padding: '14px 16px', boxShadow: '0 1px 3px rgba(0,0,0,0.04)', border: `1.4px solid ${hairline}`, display: 'flex', alignItems: 'center', gap: 14, borderLeft: `4px solid ${amber[500]}` }}>
          <div style={{ padding: 10, borderRadius: 10, background: amber[100], color: amber[500], display: 'inline-flex' }}><ShieldAlert size={20} /></div>
          <div>
            <p style={{ fontSize: 10, fontWeight: 700, color: inkSoft, textTransform: 'uppercase', letterSpacing: 0.08, margin: '0 0 6px' }}>Fraud Indicators</p>
            <p style={{ fontSize: 18, fontWeight: 700, color: ink, margin: 0, fontVariantNumeric: 'tabular-nums' }}>{fraudIndicators.length}</p>
          </div>
        </div>
        <div style={{ background: paper, borderRadius: 14, padding: '14px 16px', boxShadow: '0 1px 3px rgba(0,0,0,0.04)', border: `1.4px solid ${hairline}`, display: 'flex', alignItems: 'center', gap: 14, borderLeft: `4px solid ${teal[500]}` }}>
          <div style={{ padding: 10, borderRadius: 10, background: teal[50], color: teal[500], display: 'inline-flex' }}><Package size={20} /></div>
          <div>
            <p style={{ fontSize: 10, fontWeight: 700, color: inkSoft, textTransform: 'uppercase', letterSpacing: 0.08, margin: '0 0 6px' }}>Categories Affected</p>
            <p style={{ fontSize: 18, fontWeight: 700, color: ink, margin: 0, fontVariantNumeric: 'tabular-nums' }}>{uniqueCategories.length}</p>
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: paper, border: `1.4px solid ${hairline}`, borderRadius: 9, padding: '7px 12px' }}>
          <Filter size={14} color={inkSoft} />
          <select
            value={filterSeverity}
            onChange={e => setFilterSeverity(e.target.value as Severity | 'all')}
            style={{ fontSize: 12.5, fontWeight: 600, color: inkSoft, background: 'transparent', border: 'none', outline: 'none', cursor: 'pointer', fontFamily: "'Inter', sans-serif", appearance: 'none', paddingRight: 20 }}
          >
            <option value="all">All Severities</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: paper, border: `1.4px solid ${hairline}`, borderRadius: 9, padding: '7px 12px' }}>
          <Search size={14} color={inkSoft} />
          <select
            value={filterCategory}
            onChange={e => setFilterCategory(e.target.value)}
            style={{ fontSize: 12.5, fontWeight: 600, color: inkSoft, background: 'transparent', border: 'none', outline: 'none', cursor: 'pointer', fontFamily: "'Inter', sans-serif", appearance: 'none', paddingRight: 20 }}
          >
            <option value="all">All Categories</option>
            {uniqueCategories.map(cat => (
              <option key={cat} value={cat}>{categoryLabel(cat)}</option>
            ))}
          </select>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: paper, border: `1.4px solid ${hairline}`, borderRadius: 9, padding: '7px 12px' }}>
          <Calendar size={14} color={inkSoft} />
          <input
            type="date"
            value={filterDateFrom}
            onChange={e => setFilterDateFrom(e.target.value)}
            style={{ fontSize: 12.5, fontWeight: 600, color: inkSoft, background: 'transparent', border: 'none', outline: 'none', fontFamily: "'Inter', sans-serif" }}
            placeholder="From"
          />
          <span style={{ color: hairline }}>-</span>
          <input
            type="date"
            value={filterDateTo}
            onChange={e => setFilterDateTo(e.target.value)}
            style={{ fontSize: 12.5, fontWeight: 600, color: inkSoft, background: 'transparent', border: 'none', outline: 'none', fontFamily: "'Inter', sans-serif" }}
            placeholder="To"
          />
        </div>
        {(filterSeverity !== 'all' || filterCategory !== 'all' || filterDateFrom || filterDateTo) && (
          <button
            onClick={() => { setFilterSeverity('all'); setFilterCategory('all'); setFilterDateFrom(''); setFilterDateTo(''); }}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 12px', borderRadius: 9, border: `1px solid ${hairline}`, background: paper, color: inkSoft, fontSize: 12.5, fontWeight: 600, cursor: 'pointer', fontFamily: "'Inter', sans-serif" }}
          >
            <X size={14} /> Clear
          </button>
        )}
      </div>

      <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 24 }}>
        <div style={{ background: paper, borderRadius: 14, border: `1.4px solid ${hairline}`, boxShadow: '0 1px 3px rgba(0,0,0,0.04)', overflow: 'hidden' }}>
          <div style={{ padding: 14, display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: `1.4px solid ${hairline}`, background: teal[50] }}>
            <h3 style={{ fontSize: 13, fontWeight: 700, color: ink, display: 'flex', alignItems: 'center', gap: 8 }}>
              <ArrowUpDown size={14} color={inkSoft} />
              All Detected Anomalies
            </h3>
            <span style={{ fontSize: 10, fontWeight: 700, color: inkSoft }}>{filteredAnomalies.length} of {allAnomalies.length}</span>
          </div>
          {filteredAnomalies.length === 0 ? (
            <div style={{ padding: 48, textAlign: 'center' }}>
              <AlertCircle size={32} style={{ margin: '0 auto 12px', color: hairline }} />
              <p style={{ fontSize: 13, fontWeight: 700, color: inkSoft, margin: 0 }}>No Anomalies Found</p>
              <p style={{ fontSize: 12, marginTop: 4, color: inkSoft }}>All business data appears normal for the selected filters</p>
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, textAlign: 'left' }}>
                <thead>
                  <tr style={{ backgroundColor: teal[50], borderBottom: `1px solid ${hairline}` }}>
                    <th style={{ padding: '12px 16px', fontSize: 11, fontWeight: 700, color: teal[800], textTransform: 'uppercase', letterSpacing: '0.04em' }}>Type</th>
                    <th style={{ padding: '12px 16px', fontSize: 11, fontWeight: 700, color: teal[800], textTransform: 'uppercase', letterSpacing: '0.04em' }}>Description</th>
                    <th style={{ padding: '12px 16px', fontSize: 11, fontWeight: 700, color: teal[800], textTransform: 'uppercase', letterSpacing: '0.04em', textAlign: 'right' }}>Amount</th>
                    <th style={{ padding: '12px 16px', fontSize: 11, fontWeight: 700, color: teal[800], textTransform: 'uppercase', letterSpacing: '0.04em', textAlign: 'center' }}>Severity</th>
                    <th style={{ padding: '12px 16px', fontSize: 11, fontWeight: 700, color: teal[800], textTransform: 'uppercase', letterSpacing: '0.04em' }}>Date / Reference</th>
                  </tr>
                </thead>
                <tbody style={{ borderBottom: `1px solid ${hairline}` }}>
                  {filteredAnomalies.map(a => (
                    <tr key={a.id} style={{ borderBottom: `1px solid ${hairline}`, transition: 'background-color 0.1s' }}
                      onMouseEnter={e => { e.currentTarget.style.backgroundColor = teal[50]; }}
                      onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'transparent'; }}
                    >
                      <td style={{ padding: '12px 16px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          {categoryIcon(a.category)}
                          <span style={{ fontSize: 10, fontWeight: 700, color: inkSoft, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{categoryLabel(a.category)}</span>
                        </div>
                      </td>
                      <td style={{ padding: '12px 16px', fontSize: 12, color: inkSoft, maxWidth: 320 }}>{a.description}</td>
                      <td style={{ padding: '12px 16px', textAlign: 'right', fontSize: 12, fontWeight: 700, color: ink, fontVariantNumeric: 'tabular-nums' }}>
                        {a.amount !== undefined ? formatCurrency(a.amount) : '-'}
                      </td>
                      <td style={{ padding: '12px 16px', textAlign: 'center' }}>{severityBadge(a.severity)}</td>
                      <td style={{ padding: '12px 16px' }}>
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                          {a.date && <span style={{ fontSize: 12, color: inkSoft }}>{a.date}</span>}
                          {a.transactionRef && <span style={{ fontSize: 10, color: inkSoft, fontFamily: "'JetBrains Mono', monospace" }}>{a.transactionRef}</span>}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {fraudIndicators.length > 0 && (
          <div style={{ background: paper, borderRadius: 14, border: `1.4px solid ${hairline}`, boxShadow: '0 1px 3px rgba(0,0,0,0.04)', overflow: 'hidden' }}>
            <div style={{ padding: 14, display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: `1.4px solid ${hairline}`, background: '#fef2f2' }}>
              <h3 style={{ fontSize: 13, fontWeight: 700, color: danger, display: 'flex', alignItems: 'center', gap: 8 }}>
                <ShieldAlert size={14} />
                Fraud Indicators
                <span style={{ fontSize: 10, fontWeight: 700, marginLeft: 8, color: danger }}>({fraudIndicators.length} detected)</span>
              </h3>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, textAlign: 'left' }}>
                <thead>
                  <tr style={{ backgroundColor: '#fef2f2', borderBottom: `1px solid ${hairline}` }}>
                    <th style={{ padding: '12px 16px', fontSize: 11, fontWeight: 700, color: danger, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Type</th>
                    <th style={{ padding: '12px 16px', fontSize: 11, fontWeight: 700, color: danger, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Detail</th>
                    <th style={{ padding: '12px 16px', fontSize: 11, fontWeight: 700, color: danger, textTransform: 'uppercase', letterSpacing: '0.04em', textAlign: 'right' }}>Amount</th>
                    <th style={{ padding: '12px 16px', fontSize: 11, fontWeight: 700, color: danger, textTransform: 'uppercase', letterSpacing: '0.04em', textAlign: 'center' }}>Severity</th>
                    <th style={{ padding: '12px 16px', fontSize: 11, fontWeight: 700, color: danger, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Recommendation</th>
                  </tr>
                </thead>
                <tbody>
                  {fraudIndicators.map(fi => (
                    <tr key={fi.id} style={{ borderBottom: `1px solid ${hairline}`, transition: 'background-color 0.1s' }}
                      onMouseEnter={e => { e.currentTarget.style.backgroundColor = '#fef2f2'; }}
                      onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'transparent'; }}
                    >
                      <td style={{ padding: '12px 16px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <ShieldAlert size={14} color={danger} />
                          <span style={{ fontSize: 10, fontWeight: 700, color: danger, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{fi.fraudType.replace(/_/g, ' ')}</span>
                        </div>
                      </td>
                      <td style={{ padding: '12px 16px', fontSize: 12, color: inkSoft, maxWidth: 300 }}>{fi.description}</td>
                      <td style={{ padding: '12px 16px', textAlign: 'right', fontSize: 12, fontWeight: 700, color: ink, fontVariantNumeric: 'tabular-nums' }}>
                        {fi.amount !== undefined ? formatCurrency(fi.amount) : '-'}
                      </td>
                      <td style={{ padding: '12px 16px', textAlign: 'center' }}>{severityBadge(fi.severity)}</td>
                      <td style={{ padding: '12px 16px', fontSize: 12, color: inkSoft, maxWidth: 250 }}>{fi.recommendation}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default AnomalyDetection;