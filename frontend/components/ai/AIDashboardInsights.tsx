import React, { useState, useEffect, useCallback } from 'react';
import { Sparkles, TrendingUp, AlertTriangle, DollarSign, Users, Package, RefreshCw, ChevronRight } from 'lucide-react';
import { generateDailyBrief, detectSalesOpportunities, detectInventoryRisks, analyzeCashFlow } from '../../services/geminiService';

interface Props {
  invoices: any[];
  expenses: any[];
  customers: any[];
  inventory: any[];
  jobOrders: any[];
  customerPayments: any[];
  currency: string;
  companyConfig: any;
}

const InsightCard = ({ icon, title, children, color, loading }: { icon: React.ReactNode; title: string; children: React.ReactNode; color: string; loading?: boolean }) => (
  <div style={{
    background: 'rgba(255,255,255,0.65)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)',
    borderRadius: 20, padding: '20px', border: '1px solid rgba(255,255,255,0.8)',
    boxShadow: '0 8px 32px rgba(31,38,135,0.08)', borderTop: `2px solid ${color}44`,
    display: 'flex', flexDirection: 'column', gap: 12, minHeight: 140,
  }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{ width: 32, height: 32, borderRadius: 10, background: `${color}18`, display: 'flex', alignItems: 'center', justifyContent: 'center', color, flexShrink: 0 }}>{icon}</div>
      <span style={{ fontSize: 12, fontWeight: 700, color: '#64748b', letterSpacing: '0.04em', textTransform: 'uppercase' }}>{title}</span>
    </div>
    {loading ? (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, color: '#94a3b8' }}>
        <RefreshCw size={16} className="animate-spin" />
        <span style={{ fontSize: 13, fontWeight: 500 }}>Analyzing...</span>
      </div>
    ) : children}
  </div>
);

const AIDashboardInsights: React.FC<Props> = ({ invoices, expenses, customers, inventory, jobOrders, customerPayments, currency, companyConfig }) => {
  const [brief, setBrief] = useState<{ bullets: string[] } | null>(null);
  const [opportunities, setOpportunities] = useState<any[]>([]);
  const [risks, setRisks] = useState<any[]>([]);
  const [cashFlow, setCashFlow] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const loadInsights = useCallback(async () => {
    setLoading(true);
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const validInvoices = (invoices || []).filter((i: any) => i?.status !== 'draft' && i?.status !== 'cancelled');
    const monthInvoices = validInvoices.filter((i: any) => new Date(i.date || i.createdAt) >= monthStart);
    const revenue = monthInvoices.reduce((s: number, i: any) => s + Number(i.totalAmount || 0), 0);
    const monthExpenses = (expenses || []).filter((e: any) => new Date(e.date || e.createdAt) >= monthStart);
    const expensesMonth = monthExpenses.reduce((s: number, e: any) => s + Number(e.amount || 0), 0);
    const unpaid = validInvoices.filter((i: any) => i?.status === 'unpaid' || i?.status === 'partial' || i?.status === 'overdue');
    const todaysCollection = (customerPayments || []).filter((p: any) => {
      const d = new Date(p.date || p.createdAt);
      return d.toDateString() === now.toDateString();
    }).reduce((s: number, p: any) => s + Number(p.amount || 0), 0);
    const lowStockItems = (inventory || []).filter((i: any) => Number(i.stock || 0) < 10);
    const pendingOrders = (invoices || []).filter((i: any) => i?.status === 'pending' || i?.status === 'draft').length;

    const dailyBriefPromise = generateDailyBrief({
      revenue, revenueTarget: companyConfig?.monthlyRevenueTarget || 50000,
      unpaidInvoices: unpaid.length, unpaidTotal: unpaid.reduce((s: number, i: any) => s + Number(i.balance || i.totalAmount || 0), 0),
      todaysCollection, expensesMonth, lowStockItems: lowStockItems.length,
      activeJobs: (jobOrders || []).length, customers: (customers || []).length, pendingOrders,
    });

    const opportunitiesPromise = detectSalesOpportunities(customers || [], validInvoices);
    const risksPromise = detectInventoryRisks(inventory || []);
    const cashFlowPromise = analyzeCashFlow({
      pendingInvoicesTotal: unpaid.reduce((s: number, i: any) => s + Number(i.balance || i.totalAmount || 0), 0),
      upcomingExpensesTotal: monthExpenses.reduce((s: number, e: any) => s + Number(e.amount || 0), 0),
      currentBalance: revenue - expensesMonth,
      pendingInvoicesCount: unpaid.length,
      upcomingExpensesCount: monthExpenses.length,
    });

    const [briefResult, opps, riskItems, cf] = await Promise.all([
      dailyBriefPromise, opportunitiesPromise, risksPromise, cashFlowPromise,
    ]);

    if (briefResult?.bullets?.length) setBrief(briefResult);
    if (opps?.length) setOpportunities(opps.slice(0, 3));
    if (riskItems?.length) setRisks(riskItems.slice(0, 3));
    if (cf) setCashFlow(cf);
    setLoading(false);
  }, [invoices, expenses, customers, inventory, jobOrders, customerPayments, companyConfig]);

  useEffect(() => { loadInsights(); }, [loadInsights]);

  const cashFlowColor = cashFlow?.status === 'healthy' ? '#16a34a' : cashFlow?.status === 'warning' ? '#d97706' : '#dc2626';

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Sparkles size={18} color="#8b5cf6" />
          <h3 style={{ fontSize: 16, fontWeight: 800, color: '#2e2a5d', margin: 0, letterSpacing: '-0.02em' }}>AI Insights</h3>
        </div>
        <button onClick={loadInsights} title="Refresh AI Insights" style={{
          border: 'none', background: '#f1f5f9', cursor: 'pointer', width: 30, height: 30, borderRadius: 8,
          display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b', transition: 'background 0.15s',
        }}
          onMouseEnter={e => e.currentTarget.style.background = '#e2e8f0'}
          onMouseLeave={e => e.currentTarget.style.background = '#f1f5f9'}
        ><RefreshCw size={14} /></button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
        <InsightCard icon={<TrendingUp size={16} />} title="Daily Brief" color="#8b5cf6" loading={loading && !brief}>
          {brief?.bullets ? (
            <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 8 }}>
              {brief.bullets.map((b, i) => (
                <li key={i} style={{ fontSize: 13, color: '#334155', lineHeight: 1.5, paddingLeft: 16, position: 'relative' }}>
                  <span style={{ position: 'absolute', left: 0, top: 6, width: 6, height: 6, borderRadius: '50%', background: ['#8b5cf6', '#3b82f6', '#10b981'][i] }} />
                  {b}
                </li>
              ))}
            </ul>
          ) : !loading ? <div style={{ color: '#94a3b8', fontSize: 13, fontStyle: 'italic' }}>No insights available</div> : null}
        </InsightCard>

        <InsightCard icon={<DollarSign size={16} />} title="Cash Flow Projection" color={cashFlowColor} loading={loading && !cashFlow}>
          {cashFlow && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{
                  padding: '2px 10px', borderRadius: 99, fontSize: 11, fontWeight: 700,
                  background: cashFlow.status === 'healthy' ? '#f0fdf4' : cashFlow.status === 'warning' ? '#fffbeb' : '#fef2f2',
                  color: cashFlowColor,
                }}>
                  {cashFlow.status === 'healthy' ? 'Healthy' : cashFlow.status === 'warning' ? 'Warning' : 'Caution'}
                </div>
                <span style={{ fontSize: 18, fontWeight: 800, color: '#0f172a', fontVariantNumeric: 'tabular-nums' }}>
                  {currency}{cashFlow.projectedBalance?.toLocaleString()}
                </span>
              </div>
              <span style={{ fontSize: 12, color: '#64748b', lineHeight: 1.4 }}>{cashFlow.message}</span>
            </div>
          )}
        </InsightCard>

        <InsightCard icon={<Users size={16} />} title="Sales Opportunities" color="#3b82f6" loading={loading && !opportunities.length}>
          {opportunities.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {opportunities.map((opp, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderRadius: 10, background: '#f8fafc' }}>
                  <div style={{
                    width: 24, height: 24, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                    background: opp.type === 'upsell' ? '#ecfdf5' : opp.type === 'churn_risk' ? '#fef2f2' : opp.type === 'payment_due' ? '#fffbeb' : '#eef2ff',
                    color: opp.type === 'upsell' ? '#16a34a' : opp.type === 'churn_risk' ? '#dc2626' : opp.type === 'payment_due' ? '#d97706' : '#3b82f6',
                  }}>
                    <ChevronRight size={14} />
                  </div>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: '#0f172a' }}>{opp.name}</div>
                    <div style={{ fontSize: 11, color: '#64748b' }}>{opp.reason}</div>
                  </div>
                </div>
              ))}
            </div>
          ) : !loading ? <div style={{ color: '#94a3b8', fontSize: 13, fontStyle: 'italic' }}>No opportunities found</div> : null}
        </InsightCard>

        <InsightCard icon={<Package size={16} />} title="Inventory Risks" color="#d97706" loading={loading && !risks.length}>
          {risks.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {risks.map((r, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderRadius: 10, background: '#f8fafc' }}>
                  <AlertTriangle size={14} color={r.risk === 'stockout' ? '#dc2626' : r.risk === 'zero_stock' ? '#ef4444' : '#d97706'} />
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: '#0f172a' }}>{r.name}</div>
                    <div style={{ fontSize: 11, color: '#64748b' }}>Stock: {r.currentStock} — {r.suggestedAction}</div>
                  </div>
                </div>
              ))}
            </div>
          ) : !loading ? <div style={{ color: '#94a3b8', fontSize: 13, fontStyle: 'italic' }}>No inventory risks detected</div> : null}
        </InsightCard>
      </div>
    </div>
  );
};

export default AIDashboardInsights;