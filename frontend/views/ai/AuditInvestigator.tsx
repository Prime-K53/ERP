import React, { useState } from 'react';
import { Loader2, Shield, ArrowLeft, AlertTriangle, CheckCircle2, Search } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useFinance } from '../../context/FinanceContext';
import { useSales } from '../../context/SalesContext';
import { generateAIResponse } from '../../services/geminiService';

const AuditInvestigator: React.FC = () => {
  const navigate = useNavigate();
  const { ledger, invoices } = useFinance();
  const { sales } = useSales();
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [query, setQuery] = useState('');

  const buildAuditContext = () => {
    const parts: string[] = [];
    parts.push(`Ledger entries: ${(ledger || []).length}`);
    parts.push(`Invoices: ${(invoices || []).length}`);
    parts.push(`Sales: ${(sales || []).length}`);
    const voided = (ledger || []).filter((l: any) => l.status === 'voided' || l.status === 'cancelled');
    if (voided.length > 0) parts.push(`Voided/cancelled entries: ${voided.length}`);
    const highValue = (ledger || []).filter((l: any) => Number(l.amount) > 10000);
    if (highValue.length > 0) parts.push(`High-value entries (>$10K): ${highValue.length}`);
    const overdueInvoices = (invoices || []).filter((i: any) => i.status === 'overdue');
    if (overdueInvoices.length > 0) parts.push(`Overdue invoices: ${overdueInvoices.length}`);
    return parts.join('\n');
  };

  const runInvestigation = async (customQuery?: string) => {
    setLoading(true);
    try {
      const q = customQuery || query || 'Analyze the audit data and highlight any anomalies or concerns.';
      const context = buildAuditContext();
      const systemPrompt = 'You are an AI audit investigator. Analyze the audit trail data, identify anomalies, unusual patterns, and risks. Be concise and specific.';
      const answer = await generateAIResponse(`Audit Data:\n${context}\n\nInvestigation: ${q}`, systemPrompt);

      const voidedCount = (ledger || []).filter((l: any) => l.status === 'voided' || l.status === 'cancelled').length;
      const highValCount = (ledger || []).filter((l: any) => Number(l.amount) > 10000).length;
      const findings = [
        { id: 'f1', type: 'info', title: 'Total Records Reviewed', description: `${(ledger || []).length} ledger entries, ${(invoices || []).length} invoices, ${(sales || []).length} sales`, severity: 0 },
      ];
      if (voidedCount > 5) findings.push({ id: 'f2', type: 'warning', title: 'High Void Rate', description: `${voidedCount} voided/cancelled entries found`, severity: 5 });
      if (highValCount > 0) findings.push({ id: 'f3', type: 'info', title: 'High-Value Transactions', description: `${highValCount} entries over $10K`, severity: 3 });

      setResult({ findings, totalFindings: findings.length, highSeverity: findings.filter(f => f.severity >= 7).length, mediumSeverity: findings.filter(f => f.severity >= 4 && f.severity < 7).length, lowSeverity: findings.filter(f => f.severity < 4 && f.severity > 0).length, answer });
    } catch (err: any) {
      setResult({ findings: [], totalFindings: 0, highSeverity: 0, mediumSeverity: 0, lowSeverity: 0, answer: `Error: ${err.message}` });
    } finally { setLoading(false); }
  };

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', padding: 24, background: '#FEFDFB', overflowY: 'auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <button onClick={() => navigate('/ai-analytics')} style={{ padding: 8, borderRadius: 8, border: 'none', background: 'transparent', cursor: 'pointer' }}
          onMouseEnter={e => { e.currentTarget.style.background = '#FEFDFB' }}
          onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
        ><ArrowLeft size={20} /></button>
        <Shield color="#5c6567" size={28} />
        <div><h1 style={{ fontSize: 20, fontWeight: 700, color: '#23282A', margin: 0 }}>Audit Investigator</h1><p style={{ fontSize: 11, color: '#5c6567', margin: 0 }}>AI-powered audit trail analysis</p></div>
      </div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <input value={query} onChange={e => setQuery(e.target.value)} onKeyDown={e => e.key === 'Enter' && runInvestigation()} placeholder="Ask about audit data (e.g., 'Any anomalies?')" style={{ flex: 1, padding: '8px 16px', borderRadius: 12, border: '1.4px solid #e4ddd1', fontSize: 13, outline: 'none', background: '#FEFDFB', color: '#23282A' }} />
        <button onClick={() => runInvestigation()} disabled={loading} style={{ padding: '8px 16px', background: '#5c6567', color: '#fff', borderRadius: 12, border: 'none', cursor: 'pointer', opacity: loading ? 0.5 : 1, display: 'flex', alignItems: 'center' }}
          onMouseEnter={e => { if (!loading) e.currentTarget.style.background = '#4a5254' }}
          onMouseLeave={e => { e.currentTarget.style.background = '#5c6567' }}
        ><Search size={18} /></button>
      </div>

      {!result && !loading && (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ textAlign: 'center', maxWidth: 448 }}>
            <Shield size={48} color="#5c6567" style={{ margin: '0 auto 16px', opacity: 0.6 }} />
            <h2 style={{ fontSize: 18, fontWeight: 600, color: '#23282A', marginBottom: 8 }}>Investigate Audit Trail</h2>
            <p style={{ fontSize: 13, color: '#5c6567', marginBottom: 8 }}>{(ledger || []).length} ledger entries, {(invoices || []).length} invoices loaded</p>
            <button onClick={() => runInvestigation('')} style={{ marginTop: 16, padding: '10px 24px', background: '#5c6567', color: '#fff', borderRadius: 12, fontWeight: 500, border: 'none', cursor: 'pointer' }}
              onMouseEnter={e => { e.currentTarget.style.background = '#4a5254' }}
              onMouseLeave={e => { e.currentTarget.style.background = '#5c6567' }}
            >Run Full Audit Scan</button>
          </div>
        </div>
      )}

      {loading && <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Loader2 size={40} className="animate-spin" color="#5c6567" style={{ margin: '0 auto' }} /></div>}

      {result && !loading && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
            <div style={{ background: '#FEFDFB', padding: 12, borderRadius: 12, boxShadow: '0 1px 3px rgba(0,0,0,.04)', border: '1.4px solid #e4ddd1', display: 'flex', alignItems: 'center', gap: 16, borderLeft: '4px solid #5c6567' }}>
              <div style={{ padding: 10, background: '#eef7f6', color: '#1f8577', borderRadius: 8, flexShrink: 0 }}><Search size={20} /></div>
              <div style={{ minWidth: 0 }}><p style={{ fontSize: 10, fontWeight: 700, color: '#5c6567', textTransform: 'uppercase', letterSpacing: '-0.3px', lineHeight: 1, margin: '0 0 6px 0' }}>Findings</p><p style={{ fontSize: 18, fontWeight: 600, color: '#23282A', margin: 0 }}>{result.totalFindings}</p></div>
            </div>
            <div style={{ background: '#FEFDFB', padding: 12, borderRadius: 12, boxShadow: '0 1px 3px rgba(0,0,0,.04)', border: '1.4px solid #e4ddd1', display: 'flex', alignItems: 'center', gap: 16, borderLeft: '4px solid #b5493f' }}>
              <div style={{ padding: 10, background: '#fef2f2', color: '#b5493f', borderRadius: 8, flexShrink: 0 }}><AlertTriangle size={20} /></div>
              <div style={{ minWidth: 0 }}><p style={{ fontSize: 10, fontWeight: 700, color: '#5c6567', textTransform: 'uppercase', letterSpacing: '-0.3px', lineHeight: 1, margin: '0 0 6px 0' }}>High</p><p style={{ fontSize: 18, fontWeight: 600, color: '#23282A', margin: 0 }}>{result.highSeverity}</p></div>
            </div>
            <div style={{ background: '#FEFDFB', padding: 12, borderRadius: 12, boxShadow: '0 1px 3px rgba(0,0,0,.04)', border: '1.4px solid #e4ddd1', display: 'flex', alignItems: 'center', gap: 16, borderLeft: '4px solid #d99a3f' }}>
              <div style={{ padding: 10, background: '#fbead0', color: '#d99a3f', borderRadius: 8, flexShrink: 0 }}><Shield size={20} /></div>
              <div style={{ minWidth: 0 }}><p style={{ fontSize: 10, fontWeight: 700, color: '#5c6567', textTransform: 'uppercase', letterSpacing: '-0.3px', lineHeight: 1, margin: '0 0 6px 0' }}>Medium</p><p style={{ fontSize: 18, fontWeight: 600, color: '#23282A', margin: 0 }}>{result.mediumSeverity}</p></div>
            </div>
            <div style={{ background: '#FEFDFB', padding: 12, borderRadius: 12, boxShadow: '0 1px 3px rgba(0,0,0,.04)', border: '1.4px solid #e4ddd1', display: 'flex', alignItems: 'center', gap: 16, borderLeft: '4px solid #5c6567' }}>
              <div style={{ padding: 10, background: '#eef7f6', color: '#1f8577', borderRadius: 8, flexShrink: 0 }}><CheckCircle2 size={20} /></div>
              <div style={{ minWidth: 0 }}><p style={{ fontSize: 10, fontWeight: 700, color: '#5c6567', textTransform: 'uppercase', letterSpacing: '-0.3px', lineHeight: 1, margin: '0 0 6px 0' }}>Low</p><p style={{ fontSize: 18, fontWeight: 600, color: '#23282A', margin: 0 }}>{result.lowSeverity}</p></div>
            </div>
          </div>
          {result.answer && <div style={{ background: '#FEFDFB', borderRadius: 12, padding: 16, border: '1.4px solid #e4ddd1', boxShadow: '0 1px 3px rgba(0,0,0,.04)' }}><div style={{ fontSize: 13, color: '#23282A', whiteSpace: 'pre-wrap' }}>{result.answer}</div></div>}
          <div style={{ background: '#FEFDFB', borderRadius: 12, border: '1.4px solid #e4ddd1', boxShadow: '0 1px 3px rgba(0,0,0,.04)' }}>
            <div style={{ padding: 12, borderBottom: '1px solid #e4ddd1', fontWeight: 600, fontSize: 13, color: '#23282A' }}>Findings</div>
            <div style={{ maxHeight: 256, overflowY: 'auto' }}>
              {result.findings?.filter((f: any) => f.severity > 0).map((f: any, i: number) => (
                <div key={i} style={{ padding: 12, display: 'flex', alignItems: 'flex-start', gap: 12, borderBottom: i < result.findings.filter((fx: any) => fx.severity > 0).length - 1 ? '1px solid #e4ddd1' : 'none' }}>
                  {f.severity >= 5 ? <AlertTriangle size={16} color="#d99a3f" style={{ marginTop: 2 }} /> : <CheckCircle2 size={16} color="#5c6567" style={{ marginTop: 2 }} />}
                  <div style={{ flex: 1 }}><div style={{ fontSize: 13, fontWeight: 500, color: '#23282A' }}>{f.title}</div><div style={{ fontSize: 11, color: '#5c6567' }}>{f.description}</div></div>
                  <div style={{ fontSize: 11, fontWeight: 500, padding: '2px 8px', borderRadius: 9999, background: f.severity >= 7 ? '#fef2f2' : f.severity >= 4 ? '#fbead0' : '#eef7f6', color: f.severity >= 7 ? '#b5493f' : f.severity >= 4 ? '#d99a3f' : '#5c6567' }}>{f.severity}/10</div>
                </div>
              ))}
            </div>
          </div>
          <button onClick={() => runInvestigation('')} style={{ fontSize: 13, color: '#5c6567', fontWeight: 500, background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', padding: 0 }}
            onMouseEnter={e => { e.currentTarget.style.color = '#23282A' }}
            onMouseLeave={e => { e.currentTarget.style.color = '#5c6567' }}
          >Re-run</button>
        </div>
      )}
    </div>
  );
};

export default AuditInvestigator;