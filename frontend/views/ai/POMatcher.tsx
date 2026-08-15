import React, { useState } from 'react';
import { Loader2, FileSearch, ArrowLeft, CheckCircle2, AlertTriangle, Clock } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useProcurement } from '../../context/ProcurementContext';
import { useFinance } from '../../context/FinanceContext';
import { useAuth } from '../../context/AuthContext';
import { matchPOs } from '../../services/aiAnalyticsUtils';
import { currencyService } from '../../services/currencyService';

const POMatcher: React.FC = () => {
  const navigate = useNavigate();
  const { companyConfig } = useAuth();
  const currency = companyConfig?.currencySymbol || currencyService.getCurrency(currencyService.getBaseCurrency())?.symbol || 'K';
  const { purchases, goodsReceipts, suppliers } = useProcurement();
  const { supplierPayments } = useFinance();
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);

  const runMatch = () => {
    setLoading(true);
    setTimeout(() => {
      const res = matchPOs(purchases || [], goodsReceipts || [], supplierPayments || [], suppliers || []);
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
        <FileSearch color="#1f8577" size={28} />
        <div><h1 style={{ fontSize: 20, fontWeight: 700, color: '#23282A', margin: 0 }}>PO Matcher</h1><p style={{ fontSize: 11, color: '#5c6567', margin: 0 }}>3-way: PO ↔ Goods Receipt ↔ Invoice</p></div>
      </div>

      {!result && !loading && (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ textAlign: 'center', maxWidth: 448 }}>
            <FileSearch size={48} color="#1f8577" style={{ margin: '0 auto 16px', opacity: 0.6 }} />
            <h2 style={{ fontSize: 18, fontWeight: 600, color: '#23282A', marginBottom: 8 }}>Match Purchase Orders</h2>
            <p style={{ fontSize: 13, color: '#5c6567', marginBottom: 8 }}>{(purchases || []).length} POs, {(goodsReceipts || []).length} receipts, {(suppliers || []).length} suppliers</p>
            <button onClick={runMatch} style={{ marginTop: 16, padding: '10px 24px', background: '#1f8577', color: '#fff', borderRadius: 12, fontWeight: 500, border: 'none', cursor: 'pointer' }}
              onMouseEnter={e => { e.currentTarget.style.background = '#166b60' }}
              onMouseLeave={e => { e.currentTarget.style.background = '#1f8577' }}
            >Run Matching</button>
          </div>
        </div>
      )}

      {loading && <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Loader2 size={40} className="animate-spin" color="#1f8577" style={{ margin: '0 auto' }} /></div>}

      {result && !loading && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
            <div style={{ background: '#FEFDFB', padding: 12, borderRadius: 12, boxShadow: '0 1px 3px rgba(0,0,0,.04)', border: '1.4px solid #e4ddd1', display: 'flex', alignItems: 'center', gap: 16, borderLeft: '4px solid #5c6567' }}>
              <div style={{ padding: 10, background: '#eef7f6', color: '#1f8577', borderRadius: 8, flexShrink: 0 }}><FileSearch size={20} /></div>
              <div style={{ minWidth: 0 }}><p style={{ fontSize: 10, fontWeight: 700, color: '#5c6567', textTransform: 'uppercase', letterSpacing: '-0.3px', lineHeight: 1, margin: '0 0 6px 0' }}>Total POs</p><p style={{ fontSize: 18, fontWeight: 600, color: '#23282A', margin: 0 }}>{result.summary.total}</p></div>
            </div>
            <div style={{ background: '#FEFDFB', padding: 12, borderRadius: 12, boxShadow: '0 1px 3px rgba(0,0,0,.04)', border: '1.4px solid #e4ddd1', display: 'flex', alignItems: 'center', gap: 16, borderLeft: '4px solid #1f8577' }}>
              <div style={{ padding: 10, background: '#d3ece9', color: '#1f8577', borderRadius: 8, flexShrink: 0 }}><CheckCircle2 size={20} /></div>
              <div style={{ minWidth: 0 }}><p style={{ fontSize: 10, fontWeight: 700, color: '#5c6567', textTransform: 'uppercase', letterSpacing: '-0.3px', lineHeight: 1, margin: '0 0 6px 0' }}>Matched</p><p style={{ fontSize: 18, fontWeight: 600, color: '#23282A', margin: 0 }}>{result.summary.fullyMatched}</p></div>
            </div>
            <div style={{ background: '#FEFDFB', padding: 12, borderRadius: 12, boxShadow: '0 1px 3px rgba(0,0,0,.04)', border: '1.4px solid #e4ddd1', display: 'flex', alignItems: 'center', gap: 16, borderLeft: '4px solid #d99a3f' }}>
              <div style={{ padding: 10, background: '#fbead0', color: '#d99a3f', borderRadius: 8, flexShrink: 0 }}><Clock size={20} /></div>
              <div style={{ minWidth: 0 }}><p style={{ fontSize: 10, fontWeight: 700, color: '#5c6567', textTransform: 'uppercase', letterSpacing: '-0.3px', lineHeight: 1, margin: '0 0 6px 0' }}>Partial</p><p style={{ fontSize: 18, fontWeight: 600, color: '#23282A', margin: 0 }}>{result.summary.partialMatch}</p></div>
            </div>
            <div style={{ background: '#FEFDFB', padding: 12, borderRadius: 12, boxShadow: '0 1px 3px rgba(0,0,0,.04)', border: '1.4px solid #e4ddd1', display: 'flex', alignItems: 'center', gap: 16, borderLeft: '4px solid #b5493f' }}>
              <div style={{ padding: 10, background: '#fef2f2', color: '#b5493f', borderRadius: 8, flexShrink: 0 }}><AlertTriangle size={20} /></div>
              <div style={{ minWidth: 0 }}><p style={{ fontSize: 10, fontWeight: 700, color: '#5c6567', textTransform: 'uppercase', letterSpacing: '-0.3px', lineHeight: 1, margin: '0 0 6px 0' }}>Unmatched</p><p style={{ fontSize: 18, fontWeight: 600, color: '#23282A', margin: 0 }}>{result.summary.unmatched}</p></div>
            </div>
          </div>

          <div style={{ background: '#FEFDFB', borderRadius: 12, border: '1.4px solid #e4ddd1', boxShadow: '0 1px 3px rgba(0,0,0,.04)' }}>
            <div style={{ padding: 12, borderBottom: '1px solid #e4ddd1', fontWeight: 600, fontSize: 13, color: '#23282A' }}>Results</div>
            <div style={{ maxHeight: 384, overflowY: 'auto' }}>
              {result.matches?.map((m: any, i: number) => (
                <div key={i} style={{ padding: 12, borderBottom: i < result.matches.length - 1 ? '1px solid #e4ddd1' : 'none' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      {m.matchLevel === 'full' ? <CheckCircle2 size={16} color="#1f8577" /> : <AlertTriangle size={16} color="#d99a3f" />}
                      <span style={{ fontSize: 13, fontWeight: 500, color: '#23282A' }}>{m.poNumber}</span>
                    </div>
                    <span style={{ fontSize: 11, fontWeight: 500, padding: '2px 8px', borderRadius: 9999, background: m.matchLevel === 'full' ? '#d3ece9' : m.matchLevel === 'partial' ? '#fbead0' : '#fef2f2', color: m.matchLevel === 'full' ? '#1f8577' : m.matchLevel === 'partial' ? '#d99a3f' : '#b5493f' }}>{m.matchStatus}</span>
                  </div>
                  <div style={{ fontSize: 11, color: '#5c6567', marginLeft: 24 }}>{m.supplierName} · {currency}{(m.poTotal || 0).toLocaleString()} · {m.grCount} receipts</div>
                  {m.discrepancies?.map((d: any, j: number) => (
                    <div key={j} style={{ marginLeft: 24, fontSize: 11, color: '#b5493f', marginTop: 2 }}>⚠ {d.description}</div>
                  ))}
                </div>
              ))}
            </div>
          </div>
          <button onClick={runMatch} style={{ fontSize: 13, color: '#1f8577', fontWeight: 500, background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', padding: 0 }}
            onMouseEnter={e => { e.currentTarget.style.color = '#166b60' }}
            onMouseLeave={e => { e.currentTarget.style.color = '#1f8577' }}
          >Re-run</button>
        </div>
      )}
    </div>
  );
};

export default POMatcher;