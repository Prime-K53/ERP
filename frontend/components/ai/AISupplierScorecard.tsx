import React, { useState } from 'react';
import { Sparkles, X, Loader2, DollarSign, ShoppingCart, ThumbsUp, AlertTriangle, TrendingUp, Star } from 'lucide-react';
import { generateSupplierScorecard } from '../../services/geminiService';

interface Props {
  supplier: any;
  purchases: any[];
  payments: any[];
}

const AISupplierScorecard: React.FC<Props> = ({ supplier, purchases, payments }) => {
  const [open, setOpen] = useState(false);
  const [score, setScore] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const handleAnalyze = async () => {
    setOpen(true);
    setLoading(true);
    const result = await generateSupplierScorecard(supplier, purchases, payments);
    setScore(result);
    setLoading(false);
  };

  const scoreColor = (s: number) => s >= 80 ? '#16a34a' : s >= 60 ? '#d97706' : '#dc2626';
  const reliabilityColor = (r: string) =>
    r === 'excellent' ? '#16a34a' : r === 'good' ? '#3b82f6' : r === 'average' ? '#d97706' : '#dc2626';
  const reliabilityBg = (r: string) =>
    r === 'excellent' ? '#f0fdf4' : r === 'good' ? '#eef2ff' : r === 'average' ? '#fffbeb' : '#fef2f2';

  return (
    <>
      <button onClick={handleAnalyze} style={{
        border: 'none', background: '#f0edff', color: '#8b5cf6', cursor: 'pointer',
        padding: '8px 14px', borderRadius: 10, fontSize: 12, fontWeight: 700,
        display: 'flex', alignItems: 'center', gap: 6, transition: 'background 0.15s', whiteSpace: 'nowrap',
      }}
        onMouseEnter={e => e.currentTarget.style.background = '#e4dffc'}
        onMouseLeave={e => e.currentTarget.style.background = '#f0edff'}
      ><Sparkles size={14} /> Scorecard</button>

      {open && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 10000, background: 'rgba(0,0,0,0.2)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
        }} onClick={() => setOpen(false)}>
          <div style={{
            background: '#fff', borderRadius: 24, padding: 28, maxWidth: 440, width: '100%',
            boxShadow: '0 20px 60px rgba(15,23,42,0.2)', animation: 'kpi-slide-in 0.2s ease-out',
          }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Star size={18} color="#8b5cf6" />
                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: '#0f172a' }}>Supplier Scorecard</h3>
              </div>
              <button onClick={() => setOpen(false)} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#94a3b8', padding: 4 }} title="Close" aria-label="Close scorecard"><X size={18} /></button>
            </div>

            {loading ? (
              <div style={{ padding: '40px 0', textAlign: 'center', color: '#94a3b8' }}>
                <Loader2 size={24} className="animate-spin" style={{ margin: '0 auto 12px' }} />
                <div style={{ fontSize: 14, fontWeight: 500 }}>Analyzing supplier performance...</div>
              </div>
            ) : score ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                  <div style={{
                    width: 64, height: 64, borderRadius: 16,
                    background: `linear-gradient(135deg, ${scoreColor(score.score)}20, ${scoreColor(score.score)}08)`,
                    border: `2px solid ${scoreColor(score.score)}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 22, fontWeight: 800, color: scoreColor(score.score),
                  }}>{score.score || 0}</div>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <span style={{ fontSize: 16, fontWeight: 700, color: '#0f172a' }}>{supplier.name}</span>
                      <span style={{
                        padding: '2px 8px', borderRadius: 99, fontSize: 10, fontWeight: 700,
                        background: reliabilityBg(score.reliability), color: reliabilityColor(score.reliability),
                      }}>{score.reliability}</span>
                    </div>
                    <div style={{ fontSize: 12, color: '#64748b' }}>{score.orderCount || 0} orders · ${(score.totalSpend || 0).toLocaleString()} total</div>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {(score.strengths || []).map((s: string, i: number) => (
                    <span key={i} style={{ padding: '3px 10px', borderRadius: 99, fontSize: 11, fontWeight: 600, background: '#f0fdf4', color: '#16a34a', display: 'flex', alignItems: 'center', gap: 4 }}>
                      <ThumbsUp size={11} />{s}
                    </span>
                  ))}
                  {(score.weaknesses || []).map((w: string, i: number) => (
                    <span key={i} style={{ padding: '3px 10px', borderRadius: 99, fontSize: 11, fontWeight: 600, background: '#fef2f2', color: '#dc2626', display: 'flex', alignItems: 'center', gap: 4 }}>
                      <AlertTriangle size={11} />{w}
                    </span>
                  ))}
                </div>

                <div style={{ padding: '12px 14px', borderRadius: 12, background: '#f0edff', fontSize: 13, color: '#334155', lineHeight: 1.5, fontWeight: 500 }}>
                  {score.recommendation || 'No recommendation available.'}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      )}
    </>
  );
};

export default AISupplierScorecard;