import React, { useState } from 'react';
import { Loader2, Users, ArrowLeft, AlertTriangle, AlertCircle, CheckCircle2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useSales } from '../../context/SalesContext';
import { useAuth } from '../../context/AuthContext';
import { predictChurn } from '../../services/aiAnalyticsUtils';
import { currencyService } from '../../services/currencyService';

const ChurnPredictor: React.FC = () => {
  const navigate = useNavigate();
  const { companyConfig } = useAuth();
  const currency = companyConfig?.currencySymbol || currencyService.getCurrency(currencyService.getBaseCurrency())?.symbol || 'K';
  const { sales, customers } = useSales();
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);

  const runPrediction = () => {
    setLoading(true);
    setTimeout(() => {
      const res = predictChurn(sales || [], customers || []);
      setResult(res);
      setLoading(false);
    }, 300);
  };

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', padding: 24, background: '#FEFDFB', overflowY: 'auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <button onClick={() => navigate('/ai-analytics')} style={{ padding: 8, borderRadius: 8, border: 'none', background: 'transparent', cursor: 'pointer' }}
          onMouseEnter={e => { e.currentTarget.style.background = '#FEFDFB' }}
          onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
        ><ArrowLeft size={20} /></button>
        <Users color="#1f8577" size={28} />
        <div><h1 style={{ fontSize: 20, fontWeight: 700, color: '#23282A', margin: 0 }}>Churn Predictor</h1><p style={{ fontSize: 11, color: '#5c6567', margin: 0 }}>Identify at-risk customers</p></div>
      </div>

      {!result && !loading && (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ textAlign: 'center', maxWidth: 448 }}>
            <Users size={48} color="#1f8577" style={{ margin: '0 auto 16px', opacity: 0.6 }} />
            <h2 style={{ fontSize: 18, fontWeight: 600, color: '#23282A', marginBottom: 8 }}>Predict Customer Churn</h2>
            <p style={{ fontSize: 13, color: '#5c6567', marginBottom: 8 }}>{(customers || []).length} customers, {(sales || []).length} sales loaded</p>
            <button onClick={runPrediction} style={{ marginTop: 16, padding: '10px 24px', background: '#1f8577', color: '#fff', borderRadius: 12, fontWeight: 500, border: 'none', cursor: 'pointer' }}
              onMouseEnter={e => { e.currentTarget.style.background = '#166b60' }}
              onMouseLeave={e => { e.currentTarget.style.background = '#1f8577' }}
            >Run Analysis</button>
          </div>
        </div>
      )}

      {loading && <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Loader2 size={40} className="animate-spin" color="#1f8577" style={{ margin: '0 auto' }} /></div>}

      {result && !loading && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
            <div style={{ background: '#FEFDFB', padding: 12, borderRadius: 12, boxShadow: '0 1px 3px rgba(0,0,0,.04)', border: '1.4px solid #e4ddd1', display: 'flex', alignItems: 'center', gap: 16, borderLeft: '4px solid #5c6567' }}>
              <div style={{ padding: 10, background: '#eef7f6', color: '#1f8577', borderRadius: 8, flexShrink: 0 }}><Users size={20} /></div>
              <div style={{ minWidth: 0 }}><p style={{ fontSize: 10, fontWeight: 700, color: '#5c6567', textTransform: 'uppercase', letterSpacing: '-0.3px', lineHeight: 1, margin: '0 0 6px 0' }}>Total</p><p style={{ fontSize: 18, fontWeight: 600, color: '#23282A', margin: 0 }}>{result.totalCustomers}</p></div>
            </div>
            <div style={{ background: '#FEFDFB', padding: 12, borderRadius: 12, boxShadow: '0 1px 3px rgba(0,0,0,.04)', border: '1.4px solid #e4ddd1', display: 'flex', alignItems: 'center', gap: 16, borderLeft: '4px solid #b5493f' }}>
              <div style={{ padding: 10, background: '#fef2f2', color: '#b5493f', borderRadius: 8, flexShrink: 0 }}><AlertTriangle size={20} /></div>
              <div style={{ minWidth: 0 }}><p style={{ fontSize: 10, fontWeight: 700, color: '#5c6567', textTransform: 'uppercase', letterSpacing: '-0.3px', lineHeight: 1, margin: '0 0 6px 0' }}>At Risk</p><p style={{ fontSize: 18, fontWeight: 600, color: '#23282A', margin: 0 }}>{result.atRiskCount}</p></div>
            </div>
            <div style={{ background: '#FEFDFB', padding: 12, borderRadius: 12, boxShadow: '0 1px 3px rgba(0,0,0,.04)', border: '1.4px solid #e4ddd1', display: 'flex', alignItems: 'center', gap: 16, borderLeft: '4px solid #d99a3f' }}>
              <div style={{ padding: 10, background: '#fbead0', color: '#d99a3f', borderRadius: 8, flexShrink: 0 }}><AlertCircle size={20} /></div>
              <div style={{ minWidth: 0 }}><p style={{ fontSize: 10, fontWeight: 700, color: '#5c6567', textTransform: 'uppercase', letterSpacing: '-0.3px', lineHeight: 1, margin: '0 0 6px 0' }}>Moderate</p><p style={{ fontSize: 18, fontWeight: 600, color: '#23282A', margin: 0 }}>{result.moderateRiskCount}</p></div>
            </div>
            <div style={{ background: '#FEFDFB', padding: 12, borderRadius: 12, boxShadow: '0 1px 3px rgba(0,0,0,.04)', border: '1.4px solid #e4ddd1', display: 'flex', alignItems: 'center', gap: 16, borderLeft: '4px solid #1f8577' }}>
              <div style={{ padding: 10, background: '#d3ece9', color: '#1f8577', borderRadius: 8, flexShrink: 0 }}><CheckCircle2 size={20} /></div>
              <div style={{ minWidth: 0 }}><p style={{ fontSize: 10, fontWeight: 700, color: '#5c6567', textTransform: 'uppercase', letterSpacing: '-0.3px', lineHeight: 1, margin: '0 0 6px 0' }}>Healthy</p><p style={{ fontSize: 18, fontWeight: 600, color: '#23282A', margin: 0 }}>{result.healthyCount}</p></div>
            </div>
          </div>

          {result.summary?.highValueAtRisk > 0 && (
            <div style={{ padding: 16, background: '#fef2f2', border: '1.4px solid #b5493f', borderRadius: 12, display: 'flex', alignItems: 'center', gap: 12 }}>
              <AlertTriangle color="#b5493f" size={20} />
              <div><div style={{ fontWeight: 500, color: '#23282A', fontSize: 13 }}>{result.summary.highValueAtRisk} high-value customers at risk</div><div style={{ fontSize: 11, color: '#b5493f' }}>Estimated revenue at risk: {currency}{(result.summary.estimatedRevenueAtRisk || 0).toLocaleString()}</div></div>
            </div>
          )}

          <div style={{ background: '#FEFDFB', borderRadius: 12, border: '1.4px solid #e4ddd1', boxShadow: '0 1px 3px rgba(0,0,0,.04)' }}>
            <div style={{ padding: 12, borderBottom: '1px solid #e4ddd1', fontWeight: 600, fontSize: 13, color: '#23282A' }}>Customer Risk Scores</div>
            <div style={{ maxHeight: 384, overflowY: 'auto' }}>
              {result.predictions?.map((p: any, i: number) => (
                <div key={i} style={{ padding: 12, display: 'flex', alignItems: 'center', gap: 12, borderBottom: i < result.predictions.length - 1 ? '1px solid #e4ddd1' : 'none' }}>
                  {p.riskLevel === 'high' ? <AlertTriangle size={16} color="#b5493f" /> : <CheckCircle2 size={16} color="#1f8577" />}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 500, color: '#23282A' }}>{p.customerName}</div>
                    <div style={{ fontSize: 11, color: '#5c6567' }}>{p.totalOrders} orders · {p.daysSinceLastOrder}d since last order</div>
                    {p.keyFactors?.length > 0 && <div style={{ fontSize: 11, color: '#5c6567', marginTop: 2 }}>{p.keyFactors.slice(0, 2).join(' · ')}</div>}
                  </div>
                  <div style={{ textAlign: 'right' }}><div style={{ fontSize: 13, fontWeight: 700, color: p.riskLevel === 'high' ? '#b5493f' : p.riskLevel === 'medium' ? '#d99a3f' : '#1f8577' }}>{Math.round(p.riskScore * 100)}%</div><div style={{ fontSize: 11, color: '#5c6567', textTransform: 'capitalize' }}>{p.riskLevel}</div></div>
                </div>
              ))}
            </div>
          </div>
          <button onClick={runPrediction} style={{ fontSize: 13, color: '#1f8577', fontWeight: 500, background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', padding: 0 }}
            onMouseEnter={e => { e.currentTarget.style.color = '#166b60' }}
            onMouseLeave={e => { e.currentTarget.style.color = '#1f8577' }}
          >Re-run</button>
        </div>
      )}
    </div>
  );
};

export default ChurnPredictor;