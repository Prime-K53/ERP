import React, { useState } from 'react';
import { Sparkles, X, Loader2, TrendingUp, Clock, DollarSign, CheckCircle, AlertTriangle } from 'lucide-react';
import { generateCustomerInsight } from '../../services/geminiService';

interface Props {
  customer: any;
  invoices: any[];
  payments: any[];
  currency?: string;
}

const AICustomerInsights: React.FC<Props> = ({ customer, invoices, payments, currency: propCurrency }) => {
  const [open, setOpen] = useState(false);
  const [insight, setInsight] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const currency = propCurrency || customer?.currency || '$';

  const handleAnalyze = async () => {
    setOpen(true);
    setLoading(true);
    const result = await generateCustomerInsight(customer, invoices, payments);
    setInsight(result);
    setLoading(false);
  };

  const badgeColor = (val: string) =>
    val === 'high' || val === 'excellent' ? '#16a34a' : val === 'medium' || val === 'good' || val === 'average' ? '#d97706' : '#dc2626';
  const badgeBg = (val: string) =>
    val === 'high' || val === 'excellent' ? '#f0fdf4' : val === 'medium' || val === 'good' || val === 'average' ? '#fffbeb' : '#fef2f2';

  return (
    <>
      <button onClick={handleAnalyze} style={{
        border: 'none', background: '#f0edff', color: '#8b5cf6', cursor: 'pointer',
        padding: '8px 14px', borderRadius: 10, fontSize: 12, fontWeight: 700,
        display: 'flex', alignItems: 'center', gap: 6, transition: 'background 0.15s', whiteSpace: 'nowrap',
      }}
        onMouseEnter={e => e.currentTarget.style.background = '#e4dffc'}
        onMouseLeave={e => e.currentTarget.style.background = '#f0edff'}
      ><Sparkles size={14} /> AI Insight</button>

      {open && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 10000, background: 'rgba(0,0,0,0.2)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
        }} onClick={() => setOpen(false)}>
          <div style={{
            background: '#fff', borderRadius: 24, padding: 28, maxWidth: 420, width: '100%',
            boxShadow: '0 20px 60px rgba(15,23,42,0.2)', animation: 'kpi-slide-in 0.2s ease-out',
          }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Sparkles size={18} color="#8b5cf6" />
                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: '#0f172a' }}>Customer AI Insight</h3>
              </div>
              <button onClick={() => setOpen(false)} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#94a3b8', padding: 4 }} title="Close" aria-label="Close insights"><X size={18} /></button>
            </div>

            {loading ? (
              <div style={{ padding: '40px 0', textAlign: 'center', color: '#94a3b8' }}>
                <Loader2 size={24} className="animate-spin" style={{ margin: '0 auto 12px' }} />
                <div style={{ fontSize: 14, fontWeight: 500 }}>Analyzing customer data...</div>
              </div>
            ) : insight ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {[
                    { label: 'Reliability', value: insight.reliability },
                    { label: 'Payment', value: insight.paymentPunctuality },
                  ].map((item, i) => (
                    <span key={i} style={{
                      padding: '3px 10px', borderRadius: 99, fontSize: 11, fontWeight: 700,
                      background: badgeBg(item.value), color: badgeColor(item.value),
                    }}>{item.label}: {item.value}</span>
                  ))}
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  {[
                    { icon: <DollarSign size={14} />, label: 'Total Spent', value: `${currency}${(insight.totalSpent || 0).toLocaleString()}` },
                    { icon: <TrendingUp size={14} />, label: 'Avg Invoice', value: `${currency}${(insight.averageInvoice || 0).toLocaleString()}` },
                    { icon: <Clock size={14} />, label: 'Last Order', value: insight.lastOrderDate ? new Date(insight.lastOrderDate).toLocaleDateString() : 'N/A' },
                  ].map((item, i) => (
                    <div key={i} style={{ padding: '10px', borderRadius: 12, background: '#f8fafc' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: '#64748b', fontWeight: 600, marginBottom: 4 }}>{item.icon}{item.label}</div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: '#0f172a' }}>{item.value}</div>
                    </div>
                  ))}
                </div>

                <div style={{ padding: '12px 14px', borderRadius: 12, background: '#f0edff', fontSize: 13, color: '#334155', lineHeight: 1.5, fontWeight: 500 }}>
                  {insight.insight || 'No insight available.'}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      )}
    </>
  );
};

export default AICustomerInsights;