import React, { useState } from 'react';
import { Loader2, Package, ArrowLeft, AlertTriangle, AlertCircle, DollarSign } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useInventory } from '../../context/InventoryContext';
import { useAuth } from '../../context/AuthContext';
import { optimizeReorder } from '../../services/aiAnalyticsUtils';
import { currencyService } from '../../services/currencyService';

const ReorderOptimizer: React.FC = () => {
  const navigate = useNavigate();
  const { companyConfig } = useAuth();
  const currency = companyConfig?.currencySymbol || currencyService.getCurrency(currencyService.getBaseCurrency())?.symbol || 'K';
  const { inventory } = useInventory();
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);

  const runOptimization = () => {
    setLoading(true);
    setTimeout(() => {
      const res = optimizeReorder(inventory || [], []);
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
        <Package color="#1f8577" size={28} />
        <div><h1 style={{ fontSize: 20, fontWeight: 700, color: '#23282A', margin: 0 }}>Reorder Optimizer</h1><p style={{ fontSize: 11, color: '#5c6567', margin: 0 }}>Smart inventory reorder points</p></div>
      </div>

      {!result && !loading && (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ textAlign: 'center', maxWidth: 448 }}>
            <Package size={48} color="#1f8577" style={{ margin: '0 auto 16px', opacity: 0.6 }} />
            <h2 style={{ fontSize: 18, fontWeight: 600, color: '#23282A', marginBottom: 8 }}>Optimize Reorder Points</h2>
            <p style={{ fontSize: 13, color: '#5c6567', marginBottom: 8 }}>{(inventory || []).length} inventory items loaded</p>
            <button onClick={runOptimization} style={{ marginTop: 16, padding: '10px 24px', background: '#1f8577', color: '#fff', borderRadius: 12, fontWeight: 500, border: 'none', cursor: 'pointer' }}
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
              <div style={{ padding: 10, background: '#eef7f6', color: '#1f8577', borderRadius: 8, flexShrink: 0 }}><Package size={20} /></div>
              <div style={{ minWidth: 0 }}><p style={{ fontSize: 10, fontWeight: 700, color: '#5c6567', textTransform: 'uppercase', letterSpacing: '-0.3px', lineHeight: 1, margin: '0 0 6px 0' }}>Items</p><p style={{ fontSize: 18, fontWeight: 600, color: '#23282A', margin: 0 }}>{result.summary.totalItems}</p></div>
            </div>
            <div style={{ background: '#FEFDFB', padding: 12, borderRadius: 12, boxShadow: '0 1px 3px rgba(0,0,0,.04)', border: '1.4px solid #e4ddd1', display: 'flex', alignItems: 'center', gap: 16, borderLeft: '4px solid #b5493f' }}>
              <div style={{ padding: 10, background: '#fef2f2', color: '#b5493f', borderRadius: 8, flexShrink: 0 }}><AlertTriangle size={20} /></div>
              <div style={{ minWidth: 0 }}><p style={{ fontSize: 10, fontWeight: 700, color: '#5c6567', textTransform: 'uppercase', letterSpacing: '-0.3px', lineHeight: 1, margin: '0 0 6px 0' }}>Need Reorder</p><p style={{ fontSize: 18, fontWeight: 600, color: '#23282A', margin: 0 }}>{result.summary.needsReorder}</p></div>
            </div>
            <div style={{ background: '#FEFDFB', padding: 12, borderRadius: 12, boxShadow: '0 1px 3px rgba(0,0,0,.04)', border: '1.4px solid #e4ddd1', display: 'flex', alignItems: 'center', gap: 16, borderLeft: '4px solid #d99a3f' }}>
              <div style={{ padding: 10, background: '#fbead0', color: '#d99a3f', borderRadius: 8, flexShrink: 0 }}><AlertCircle size={20} /></div>
              <div style={{ minWidth: 0 }}><p style={{ fontSize: 10, fontWeight: 700, color: '#5c6567', textTransform: 'uppercase', letterSpacing: '-0.3px', lineHeight: 1, margin: '0 0 6px 0' }}>Critical</p><p style={{ fontSize: 18, fontWeight: 600, color: '#23282A', margin: 0 }}>{result.summary.criticalItems}</p></div>
            </div>
            <div style={{ background: '#FEFDFB', padding: 12, borderRadius: 12, boxShadow: '0 1px 3px rgba(0,0,0,.04)', border: '1.4px solid #e4ddd1', display: 'flex', alignItems: 'center', gap: 16, borderLeft: '4px solid #1f8577' }}>
              <div style={{ padding: 10, background: '#eef7f6', color: '#1f8577', borderRadius: 8, flexShrink: 0 }}><DollarSign size={20} /></div>
              <div style={{ minWidth: 0 }}><p style={{ fontSize: 10, fontWeight: 700, color: '#5c6567', textTransform: 'uppercase', letterSpacing: '-0.3px', lineHeight: 1, margin: '0 0 6px 0' }}>Est. Cost</p><p style={{ fontSize: 18, fontWeight: 600, color: '#23282A', margin: 0 }}>{currency}{(result.summary.totalOrderCost || 0).toLocaleString()}</p></div>
            </div>
          </div>

          <div style={{ background: '#FEFDFB', borderRadius: 12, border: '1.4px solid #e4ddd1', boxShadow: '0 1px 3px rgba(0,0,0,.04)' }}>
            <div style={{ padding: 12, borderBottom: '1px solid #e4ddd1', fontWeight: 600, fontSize: 13, color: '#23282A' }}>Recommendations</div>
            <div style={{ maxHeight: 384, overflowY: 'auto' }}>
              {result.recommendations?.filter((r: any) => r.isRecommended).map((r: any, i: number) => (
                <div key={i} style={{ padding: 12, borderBottom: i < result.recommendations.filter((rx: any) => rx.isRecommended).length - 1 ? '1px solid #e4ddd1' : 'none' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span style={{ fontSize: 13, fontWeight: 500, color: '#23282A' }}>{r.itemName}</span>
                    <span style={{ fontSize: 11, fontWeight: 500, padding: '2px 8px', borderRadius: 9999, background: r.urgency >= 80 ? '#fef2f2' : r.urgency >= 50 ? '#fbead0' : '#eef7f6', color: r.urgency >= 80 ? '#b5493f' : r.urgency >= 50 ? '#d99a3f' : '#1f8577' }}>Urgency: {r.urgency}%</span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, fontSize: 11, color: '#5c6567' }}>
                    <div>Stock: <span style={{ fontWeight: 500, color: '#23282A' }}>{r.currentStock}</span></div>
                    <div>Reorder: <span style={{ fontWeight: 500, color: '#23282A' }}>{r.suggestedReorderPoint}</span></div>
                    <div>Safety: <span style={{ fontWeight: 500, color: '#23282A' }}>{r.safetyStock}</span></div>
                    <div>Order: <span style={{ fontWeight: 500, color: '#1f8577' }}>{r.suggestedOrderQuantity}</span></div>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <button onClick={runOptimization} style={{ fontSize: 13, color: '#1f8577', fontWeight: 500, background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', padding: 0 }}
            onMouseEnter={e => { e.currentTarget.style.color = '#166b60' }}
            onMouseLeave={e => { e.currentTarget.style.color = '#1f8577' }}
          >Re-run</button>
        </div>
      )}
    </div>
  );
};

export default ReorderOptimizer;