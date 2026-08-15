import React, { useState } from 'react';
import { Loader2, AlertTriangle, ArrowLeft, Shield, AlertCircle, CheckCircle2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useFinance } from '../../context/FinanceContext';
import { useInventory } from '../../context/InventoryContext';
import { useSales } from '../../context/SalesContext';

const AnomalyDetector: React.FC = () => {
  const navigate = useNavigate();
  const { ledger, invoices, expenses } = useFinance();
  const { inventory } = useInventory();
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);

  const runDetection = () => {
    setLoading(true);
    setTimeout(() => {
      const anomalies: any[] = [];

      const amounts = (ledger || []).map((e: any) => Number(e.amount)).filter((a: number) => a > 0);
      if (amounts.length >= 5) {
        amounts.sort((a, b) => a - b);
        const q1 = amounts[Math.floor(amounts.length * 0.25)];
        const q3 = amounts[Math.floor(amounts.length * 0.75)];
        const iqr = q3 - q1;
        const upper = q3 + 3 * iqr;
        for (const entry of ledger || []) {
          const amt = Number(entry.amount);
          if (amt > upper && amt > 10000) anomalies.push({
            id: `tx-${entry.id}`, category: 'transaction', type: 'unusual_amount', severity: amt > upper * 2 ? 'critical' : 'high',
            risk_score: Math.min(1, amt / (upper * 3)), description: `Unusual ${entry.entry_type} of $${amt.toLocaleString()} in ${entry.account_name || entry.account_code || 'unknown'}`,
            amount: amt, date: entry.entry_date
          });
        }
      }

      for (const item of inventory || []) {
        if (item.quantity < 0) anomalies.push({
          id: `inv-neg-${item.id}`, category: 'inventory', type: 'negative_stock', severity: 'high', risk_score: 0.85,
          description: `Negative stock: "${item.material || item.name}" (qty: ${item.quantity})`, itemName: item.material || item.name, quantity: item.quantity
        });
        if (item.reorder_point > 0 && item.quantity > 0 && item.quantity < item.reorder_point * 0.3) anomalies.push({
          id: `inv-crit-${item.id}`, category: 'inventory', type: 'critical_stock', severity: 'high', risk_score: 0.75,
          description: `Critically low: "${item.material || item.name}" (${item.quantity} vs reorder ${item.reorder_point})`,
          itemName: item.material || item.name, quantity: item.quantity
        });
      }

      const deleteCount = (ledger || []).filter((l: any) => l.status === 'voided' || l.status === 'cancelled').length;
      if (deleteCount > 5) anomalies.push({
        id: 'audit-mass-void', category: 'audit', type: 'mass_voiding', severity: 'medium', risk_score: 0.6,
        description: `${deleteCount} voided/cancelled entries found`
      });

      anomalies.sort((a, b) => (b.risk_score || 0) - (a.risk_score || 0));
      setResult({
        anomalies, totalCount: anomalies.length,
        highRiskCount: anomalies.filter((a: any) => a.risk_score >= 0.7).length,
        mediumRiskCount: anomalies.filter((a: any) => a.risk_score >= 0.4 && a.risk_score < 0.7).length,
        lowRiskCount: anomalies.filter((a: any) => a.risk_score < 0.4).length
      });
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
        <AlertTriangle color="#b5493f" size={28} />
        <div><h1 style={{ fontSize: 20, fontWeight: 700, color: '#23282A', margin: 0 }}>Anomaly Detector</h1><p style={{ fontSize: 11, color: '#5c6567', margin: 0 }}>Unusual transactions, stock, and audit events</p></div>
      </div>

      {!result && !loading && (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ textAlign: 'center', maxWidth: 448 }}>
            <Shield size={48} color="#b5493f" style={{ margin: '0 auto 16px', opacity: 0.6 }} />
            <h2 style={{ fontSize: 18, fontWeight: 600, color: '#23282A', marginBottom: 8 }}>Detect Anomalies</h2>
            <p style={{ fontSize: 13, color: '#5c6567', marginBottom: 8 }}>{(ledger || []).length} ledger entries, {(inventory || []).length} inventory items loaded</p>
            <button onClick={runDetection} style={{ marginTop: 16, padding: '10px 24px', background: '#b5493f', color: '#fff', borderRadius: 12, fontWeight: 500, border: 'none', cursor: 'pointer' }}
              onMouseEnter={e => { e.currentTarget.style.background = '#943d34' }}
              onMouseLeave={e => { e.currentTarget.style.background = '#b5493f' }}
            >Run Detection</button>
          </div>
        </div>
      )}

      {loading && <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Loader2 size={40} className="animate-spin" color="#b5493f" style={{ margin: '0 auto' }} /></div>}

      {result && !loading && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
            <div style={{ background: '#FEFDFB', padding: 12, borderRadius: 12, boxShadow: '0 1px 3px rgba(0,0,0,.04)', border: '1.4px solid #e4ddd1', display: 'flex', alignItems: 'center', gap: 16, borderLeft: '4px solid #5c6567' }}>
              <div style={{ padding: 10, background: '#eef7f6', color: '#1f8577', borderRadius: 8, flexShrink: 0 }}><Shield size={20} /></div>
              <div style={{ minWidth: 0 }}><p style={{ fontSize: 10, fontWeight: 700, color: '#5c6567', textTransform: 'uppercase', letterSpacing: '-0.3px', lineHeight: 1, margin: '0 0 6px 0' }}>Total</p><p style={{ fontSize: 18, fontWeight: 600, color: '#23282A', margin: 0 }}>{result.totalCount}</p></div>
            </div>
            <div style={{ background: '#FEFDFB', padding: 12, borderRadius: 12, boxShadow: '0 1px 3px rgba(0,0,0,.04)', border: '1.4px solid #e4ddd1', display: 'flex', alignItems: 'center', gap: 16, borderLeft: '4px solid #b5493f' }}>
              <div style={{ padding: 10, background: '#fef2f2', color: '#b5493f', borderRadius: 8, flexShrink: 0 }}><AlertTriangle size={20} /></div>
              <div style={{ minWidth: 0 }}><p style={{ fontSize: 10, fontWeight: 700, color: '#5c6567', textTransform: 'uppercase', letterSpacing: '-0.3px', lineHeight: 1, margin: '0 0 6px 0' }}>High</p><p style={{ fontSize: 18, fontWeight: 600, color: '#23282A', margin: 0 }}>{result.highRiskCount}</p></div>
            </div>
            <div style={{ background: '#FEFDFB', padding: 12, borderRadius: 12, boxShadow: '0 1px 3px rgba(0,0,0,.04)', border: '1.4px solid #e4ddd1', display: 'flex', alignItems: 'center', gap: 16, borderLeft: '4px solid #d99a3f' }}>
              <div style={{ padding: 10, background: '#fbead0', color: '#d99a3f', borderRadius: 8, flexShrink: 0 }}><AlertCircle size={20} /></div>
              <div style={{ minWidth: 0 }}><p style={{ fontSize: 10, fontWeight: 700, color: '#5c6567', textTransform: 'uppercase', letterSpacing: '-0.3px', lineHeight: 1, margin: '0 0 6px 0' }}>Medium</p><p style={{ fontSize: 18, fontWeight: 600, color: '#23282A', margin: 0 }}>{result.mediumRiskCount}</p></div>
            </div>
            <div style={{ background: '#FEFDFB', padding: 12, borderRadius: 12, boxShadow: '0 1px 3px rgba(0,0,0,.04)', border: '1.4px solid #e4ddd1', display: 'flex', alignItems: 'center', gap: 16, borderLeft: '4px solid #5c6567' }}>
              <div style={{ padding: 10, background: '#eef7f6', color: '#1f8577', borderRadius: 8, flexShrink: 0 }}><CheckCircle2 size={20} /></div>
              <div style={{ minWidth: 0 }}><p style={{ fontSize: 10, fontWeight: 700, color: '#5c6567', textTransform: 'uppercase', letterSpacing: '-0.3px', lineHeight: 1, margin: '0 0 6px 0' }}>Low</p><p style={{ fontSize: 18, fontWeight: 600, color: '#23282A', margin: 0 }}>{result.lowRiskCount}</p></div>
            </div>
          </div>
          <div style={{ background: '#FEFDFB', borderRadius: 12, border: '1.4px solid #e4ddd1', boxShadow: '0 1px 3px rgba(0,0,0,.04)' }}>
            <div style={{ padding: 12, borderBottom: '1px solid #e4ddd1', fontWeight: 600, fontSize: 13, color: '#23282A' }}>Details</div>
            <div style={{ maxHeight: 384, overflowY: 'auto' }}>
              {result.anomalies.map((a: any, i: number) => (
                <div key={i} style={{ padding: 12, display: 'flex', alignItems: 'flex-start', gap: 12, borderBottom: i < result.anomalies.length - 1 ? '1px solid #e4ddd1' : 'none' }}>
                  <div style={{ marginTop: 2, padding: 4, borderRadius: '50%', background: a.severity === 'critical' ? '#fef2f2' : a.severity === 'high' ? '#fbead0' : '#fbead0', color: a.severity === 'critical' ? '#b5493f' : a.severity === 'high' ? '#d99a3f' : '#d99a3f' }}><AlertCircle size={14} /></div>
                  <div style={{ flex: 1 }}><div style={{ fontSize: 13, fontWeight: 500, color: '#23282A' }}>{a.description}</div><div style={{ fontSize: 11, color: '#5c6567', marginTop: 2 }}>{a.category} · {(a.risk_score * 100).toFixed(0)}% risk</div></div>
                  <div style={{ fontSize: 11, fontWeight: 500, padding: '2px 8px', borderRadius: 9999, background: a.severity === 'critical' ? '#fef2f2' : a.severity === 'high' ? '#fbead0' : '#fbead0', color: a.severity === 'critical' ? '#b5493f' : a.severity === 'high' ? '#d99a3f' : '#d99a3f' }}>{a.severity}</div>
                </div>
              ))}
            </div>
          </div>
          <button onClick={runDetection} style={{ fontSize: 13, color: '#b5493f', fontWeight: 500, background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', padding: 0 }}
            onMouseEnter={e => { e.currentTarget.style.color = '#943d34' }}
            onMouseLeave={e => { e.currentTarget.style.color = '#b5493f' }}
          >Re-run</button>
        </div>
      )}
    </div>
  );
};

export default AnomalyDetector;