import React, { useState } from 'react';
import { Sparkles, X, Loader2, FileText, AlertCircle } from 'lucide-react';
import { summarizeDocument } from '../../services/geminiService';

interface Props {
  docType: string;
  data: any;
  label?: string;
  color?: string;
}

const AIDocumentSummarizer: React.FC<Props> = ({ docType, data, label = 'AI Summary', color = '#8b5cf6' }) => {
  const [open, setOpen] = useState(false);
  const [summary, setSummary] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const handleSummarize = async () => {
    setOpen(true);
    setLoading(true);
    const result = await summarizeDocument(docType, data);
    setSummary(result);
    setLoading(false);
  };

  const statusColor = (s: string) =>
    s === 'paid' || s === 'completed' || s === 'delivered' ? '#16a34a' :
    s === 'overdue' || s === 'cancelled' ? '#dc2626' : '#d97706';
  const statusBg = (s: string) =>
    s === 'paid' || s === 'completed' || s === 'delivered' ? '#f0fdf4' :
    s === 'overdue' || s === 'cancelled' ? '#fef2f2' : '#fffbeb';

  return (
    <>
      <button onClick={handleSummarize} style={{
        border: 'none', background: `${color}12`, color, cursor: 'pointer',
        padding: '6px 12px', borderRadius: 8, fontSize: 11, fontWeight: 700,
        display: 'flex', alignItems: 'center', gap: 5, transition: 'background 0.15s', whiteSpace: 'nowrap',
      }}
        onMouseEnter={e => e.currentTarget.style.background = `${color}22`}
        onMouseLeave={e => e.currentTarget.style.background = `${color}12`}
      ><Sparkles size={12} />{label}</button>

      {open && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 10000, background: 'rgba(0,0,0,0.2)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
        }} onClick={() => setOpen(false)}>
          <div style={{
            background: '#fff', borderRadius: 24, padding: 28, maxWidth: 460, width: '100%',
            boxShadow: '0 20px 60px rgba(15,23,42,0.2)', animation: 'kpi-slide-in 0.2s ease-out',
            maxHeight: '80vh', overflowY: 'auto',
          }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <FileText size={18} color={color} />
                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: '#0f172a' }}>{docType} Summary</h3>
              </div>
              <button onClick={() => setOpen(false)} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#94a3b8', padding: 4 }} title="Close" aria-label="Close summary"><X size={18} /></button>
            </div>

            {loading ? (
              <div style={{ padding: '40px 0', textAlign: 'center', color: '#94a3b8' }}>
                <Loader2 size={24} className="animate-spin" style={{ margin: '0 auto 12px' }} />
                <div style={{ fontSize: 14, fontWeight: 500 }}>Summarizing document...</div>
              </div>
            ) : summary ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {summary.status && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <AlertCircle size={14} color={statusColor(summary.status)} />
                    <span style={{
                      padding: '2px 10px', borderRadius: 99, fontSize: 11, fontWeight: 700,
                      background: statusBg(summary.status), color: statusColor(summary.status),
                    }}>{summary.status.toUpperCase()}</span>
                  </div>
                )}

                <p style={{ margin: 0, fontSize: 14, color: '#334155', lineHeight: 1.7 }}>{summary.summary || 'No summary available.'}</p>

                {summary.keyNumbers?.length > 0 && (
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 8 }}>Key Numbers</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {summary.keyNumbers.map((k: string, i: number) => (
                        <span key={i} style={{ padding: '4px 10px', borderRadius: 8, background: '#f1f5f9', fontSize: 12, fontWeight: 600, color: '#334155' }}>{k}</span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : null}
          </div>
        </div>
      )}
    </>
  );
};

export default AIDocumentSummarizer;