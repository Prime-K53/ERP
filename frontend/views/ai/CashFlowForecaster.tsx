import React, { useState } from 'react';
import { Loader2, TrendingUp, TrendingDown, ArrowLeft, AlertTriangle, DollarSign } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useFinance } from '../../context/FinanceContext';
import { useSales } from '../../context/SalesContext';
import { useAuth } from '../../context/AuthContext';
import { forecastCashFlow } from '../../services/aiAnalyticsUtils';
import { currencyService } from '../../services/currencyService';

const CashFlowForecaster: React.FC = () => {
  const navigate = useNavigate();
  const { companyConfig } = useAuth();
  const currency = companyConfig?.currencySymbol || currencyService.getCurrency(currencyService.getBaseCurrency())?.symbol || 'K';
  const { invoices, expenses, income, ledger } = useFinance();
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [days, setDays] = useState(90);

  const runForecast = () => {
    setLoading(true);
    setTimeout(() => {
      const ar = (invoices || []).filter((i: any) => i.status === 'pending' || i.status === 'overdue');
      const ap = (expenses || []).filter((e: any) => e.status === 'pending');
      const res = forecastCashFlow(invoices || [], expenses || [], ar, ap, ledger || [], days);
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
        <TrendingUp color="#1f8577" size={28} />
        <div><h1 style={{ fontSize: 20, fontWeight: 700, color: '#23282A', margin: 0 }}>Cash Flow Forecaster</h1><p style={{ fontSize: 11, color: '#5c6567', margin: 0 }}>Project future cash position</p></div>
      </div>

      {!result && !loading && (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ textAlign: 'center', maxWidth: 448 }}>
            <TrendingUp size={48} color="#1f8577" style={{ margin: '0 auto 16px', opacity: 0.6 }} />
            <h2 style={{ fontSize: 18, fontWeight: 600, color: '#23282A', marginBottom: 8 }}>Project Future Cash Position</h2>
            <p style={{ fontSize: 13, color: '#5c6567', marginBottom: 16 }}>{(invoices || []).length} invoices, {(expenses || []).length} expenses, {(ledger || []).length} ledger entries loaded</p>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, marginBottom: 24 }}>
              <label style={{ fontSize: 13, color: '#5c6567' }}>Period:</label>
              <select value={days} onChange={e => setDays(Number(e.target.value))} style={{ padding: '6px 12px', borderRadius: 8, border: '1.4px solid #e4ddd1', fontSize: 13, background: '#FEFDFB', color: '#23282A' }}>
                <option value={30}>30 days</option><option value={60}>60 days</option><option value={90}>90 days</option><option value={180}>180 days</option>
              </select>
            </div>
            <button onClick={runForecast} style={{ padding: '10px 24px', background: '#1f8577', color: '#fff', borderRadius: 12, fontWeight: 500, border: 'none', cursor: 'pointer' }}
              onMouseEnter={e => { e.currentTarget.style.background = '#166b60' }}
              onMouseLeave={e => { e.currentTarget.style.background = '#1f8577' }}
            >Run Forecast</button>
          </div>
        </div>
      )}

      {loading && <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Loader2 size={40} className="animate-spin" color="#1f8577" style={{ margin: '0 auto' }} /></div>}

      {result && !loading && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
            <div style={{ background: '#FEFDFB', padding: 12, borderRadius: 12, boxShadow: '0 1px 3px rgba(0,0,0,.04)', border: '1.4px solid #e4ddd1', display: 'flex', alignItems: 'center', gap: 16, borderLeft: '4px solid #5c6567' }}>
              <div style={{ padding: 10, background: '#eef7f6', color: '#1f8577', borderRadius: 8, flexShrink: 0 }}><DollarSign size={20} /></div>
              <div style={{ minWidth: 0 }}><p style={{ fontSize: 10, fontWeight: 700, color: '#5c6567', textTransform: 'uppercase', letterSpacing: '-0.3px', lineHeight: 1, margin: '0 0 6px 0' }}>Start Balance</p><p style={{ fontSize: 18, fontWeight: 600, color: '#23282A', margin: 0 }}>{currency}{(result.summary.startingBalance || 0).toLocaleString()}</p></div>
            </div>
            <div style={{ background: '#FEFDFB', padding: 12, borderRadius: 12, boxShadow: '0 1px 3px rgba(0,0,0,.04)', border: '1.4px solid #e4ddd1', display: 'flex', alignItems: 'center', gap: 16, borderLeft: '4px solid #1f8577' }}>
              <div style={{ padding: 10, background: '#d3ece9', color: '#1f8577', borderRadius: 8, flexShrink: 0 }}><TrendingUp size={20} /></div>
              <div style={{ minWidth: 0 }}><p style={{ fontSize: 10, fontWeight: 700, color: '#5c6567', textTransform: 'uppercase', letterSpacing: '-0.3px', lineHeight: 1, margin: '0 0 6px 0' }}>Projected ({days}d)</p><p style={{ fontSize: 18, fontWeight: 600, color: result.summary.finalProjectedBalance >= 0 ? '#23282A' : '#b5493f', margin: 0 }}>{currency}{(result.summary.finalProjectedBalance || 0).toLocaleString()}</p></div>
            </div>
            <div style={{ background: '#FEFDFB', padding: 12, borderRadius: 12, boxShadow: '0 1px 3px rgba(0,0,0,.04)', border: '1.4px solid #e4ddd1', display: 'flex', alignItems: 'center', gap: 16, borderLeft: '4px solid #d99a3f' }}>
              <div style={{ padding: 10, background: '#fbead0', color: '#d99a3f', borderRadius: 8, flexShrink: 0 }}><TrendingDown size={20} /></div>
              <div style={{ minWidth: 0 }}><p style={{ fontSize: 10, fontWeight: 700, color: '#5c6567', textTransform: 'uppercase', letterSpacing: '-0.3px', lineHeight: 1, margin: '0 0 6px 0' }}>Min Balance</p><p style={{ fontSize: 18, fontWeight: 600, color: result.summary.minimumProjectedBalance >= 0 ? '#23282A' : '#b5493f', margin: 0 }}>{currency}{(result.summary.minimumProjectedBalance || 0).toLocaleString()}</p></div>
            </div>
            <div style={{ background: '#FEFDFB', padding: 12, borderRadius: 12, boxShadow: '0 1px 3px rgba(0,0,0,.04)', border: '1.4px solid #e4ddd1', display: 'flex', alignItems: 'center', gap: 16, borderLeft: '4px solid #1f8577' }}>
              <div style={{ padding: 10, background: '#eef7f6', color: '#1f8577', borderRadius: 8, flexShrink: 0 }}><AlertTriangle size={20} /></div>
              <div style={{ minWidth: 0 }}><p style={{ fontSize: 10, fontWeight: 700, color: '#5c6567', textTransform: 'uppercase', letterSpacing: '-0.3px', lineHeight: 1, margin: '0 0 6px 0' }}>Risk: {result.summary.riskLevel}</p><p style={{ fontSize: 18, fontWeight: 600, color: result.summary.riskLevel === 'low' ? '#1f8577' : result.summary.riskLevel === 'medium' ? '#d99a3f' : '#b5493f', margin: 0, textTransform: 'capitalize' }}>{result.summary.riskLevel}</p></div>
            </div>
          </div>

          {result.summary.daysUntilNegative >= 0 && (
            <div style={{ padding: 16, background: '#fef2f2', border: '1.4px solid #b5493f', borderRadius: 12, display: 'flex', alignItems: 'center', gap: 12 }}>
              <AlertTriangle color="#b5493f" size={20} />
              <div><div style={{ fontWeight: 500, color: '#23282A', fontSize: 13 }}>Cash depletion warning</div><div style={{ fontSize: 11, color: '#b5493f' }}>Projected negative in {result.summary.daysUntilNegative} days</div></div>
            </div>
          )}

          <div style={{ background: '#FEFDFB', borderRadius: 12, border: '1.4px solid #e4ddd1', boxShadow: '0 1px 3px rgba(0,0,0,.04)' }}>
            <div style={{ padding: 12, borderBottom: '1px solid #e4ddd1', fontWeight: 600, fontSize: 13, color: '#23282A' }}>Daily Projection</div>
            <div style={{ overflowX: 'auto', maxHeight: 256, overflowY: 'auto' }}>
              <table style={{ width: '100%', fontSize: 11, borderCollapse: 'collapse' }}>
                <thead><tr style={{ background: '#eef7f6', color: '#5c6567' }}><th style={{ textAlign: 'left', padding: 8, fontWeight: 600 }}>Date</th><th style={{ textAlign: 'right', padding: 8, fontWeight: 600 }}>Inflow</th><th style={{ textAlign: 'right', padding: 8, fontWeight: 600 }}>Outflow</th><th style={{ textAlign: 'right', padding: 8, fontWeight: 600 }}>Net</th><th style={{ textAlign: 'right', padding: 8, fontWeight: 600 }}>Balance</th></tr></thead>
                <tbody>{result.projection?.map((p: any, i: number) => (
                  <tr key={i} style={{ background: i % 2 === 0 ? '#FEFDFB' : '#FEFDFB' }}>
                    <td style={{ padding: 8, color: '#23282A', textAlign: 'left' }}>{p.date}</td>
                    <td style={{ padding: 8, textAlign: 'right', color: '#1f8577' }}>{currency}{(p.inflow || 0).toLocaleString()}</td>
                    <td style={{ padding: 8, textAlign: 'right', color: '#b5493f' }}>{currency}{(p.outflow || 0).toLocaleString()}</td>
                    <td style={{ padding: 8, textAlign: 'right', fontWeight: 500, color: (p.netFlow || 0) >= 0 ? '#1f8577' : '#b5493f' }}>{currency}{(p.netFlow || 0).toLocaleString()}</td>
                    <td style={{ padding: 8, textAlign: 'right', fontWeight: 500, color: (p.balance || 0) >= 0 ? '#23282A' : '#b5493f' }}>{currency}{(p.balance || 0).toLocaleString()}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          </div>
          <button onClick={runForecast} style={{ fontSize: 13, color: '#1f8577', fontWeight: 500, background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', padding: 0 }}
            onMouseEnter={e => { e.currentTarget.style.color = '#166b60' }}
            onMouseLeave={e => { e.currentTarget.style.color = '#1f8577' }}
          >Re-run</button>
        </div>
      )}
    </div>
  );
};

export default CashFlowForecaster;