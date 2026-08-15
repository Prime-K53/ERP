import React, { useState } from 'react';
import { Loader2, Layers, ArrowLeft, CheckCircle2, Clock, TrendingUp } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useProduction } from '../../context/ProductionContext';
import { optimizeGangRun } from '../../services/aiAnalyticsUtils';

const GangRunOptimizer: React.FC = () => {
  const navigate = useNavigate();
  const { workOrders, boms, workCenters } = useProduction();
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);

  const runOptimization = () => {
    setLoading(true);
    setTimeout(() => {
      const res = optimizeGangRun(workOrders, boms, workCenters);
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
        <Layers color="#1f8577" size={28} />
        <div><h1 style={{ fontSize: 20, fontWeight: 700, color: '#23282A', margin: 0 }}>Gang Run Optimizer</h1><p style={{ fontSize: 11, color: '#5c6567', margin: 0 }}>Group similar print jobs to reduce setup waste</p></div>
      </div>

      {!result && !loading && (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ textAlign: 'center', maxWidth: 448 }}>
            <Layers size={48} color="#1f8577" style={{ margin: '0 auto 16px', opacity: 0.6 }} />
            <h2 style={{ fontSize: 18, fontWeight: 600, color: '#23282A', marginBottom: 8 }}>Optimize Print Job Grouping</h2>
            <p style={{ fontSize: 13, color: '#5c6567', marginBottom: 8 }}>{workOrders.length} work orders, {boms.length} BOMs, {workCenters.length} work centers loaded</p>
            <button onClick={runOptimization} style={{ marginTop: 16, padding: '10px 24px', background: '#1f8577', color: '#fff', borderRadius: 12, fontWeight: 500, border: 'none', cursor: 'pointer' }}
              onMouseEnter={e => { e.currentTarget.style.background = '#166b60' }}
              onMouseLeave={e => { e.currentTarget.style.background = '#1f8577' }}
            >Run Optimization</button>
          </div>
        </div>
      )}

      {loading && <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Loader2 size={40} className="animate-spin" color="#1f8577" style={{ margin: '0 auto' }} /></div>}

      {result && !loading && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
            <div style={{ background: '#FEFDFB', padding: 12, borderRadius: 12, boxShadow: '0 1px 3px rgba(0,0,0,.04)', border: '1.4px solid #e4ddd1', display: 'flex', alignItems: 'center', gap: 16, borderLeft: '4px solid #5c6567' }}>
              <div style={{ padding: 10, background: '#eef7f6', color: '#1f8577', borderRadius: 8, flexShrink: 0 }}><Layers size={20} /></div>
              <div style={{ minWidth: 0 }}><p style={{ fontSize: 10, fontWeight: 700, color: '#5c6567', textTransform: 'uppercase', letterSpacing: '-0.3px', lineHeight: 1, margin: '0 0 6px 0' }}>Total Jobs</p><p style={{ fontSize: 18, fontWeight: 600, color: '#23282A', margin: 0 }}>{result.metrics.totalJobs}</p></div>
            </div>
            <div style={{ background: '#FEFDFB', padding: 12, borderRadius: 12, boxShadow: '0 1px 3px rgba(0,0,0,.04)', border: '1.4px solid #e4ddd1', display: 'flex', alignItems: 'center', gap: 16, borderLeft: '4px solid #1f8577' }}>
              <div style={{ padding: 10, background: '#d3ece9', color: '#1f8577', borderRadius: 8, flexShrink: 0 }}><CheckCircle2 size={20} /></div>
              <div style={{ minWidth: 0 }}><p style={{ fontSize: 10, fontWeight: 700, color: '#5c6567', textTransform: 'uppercase', letterSpacing: '-0.3px', lineHeight: 1, margin: '0 0 6px 0' }}>Ganged Jobs</p><p style={{ fontSize: 18, fontWeight: 600, color: '#23282A', margin: 0 }}>{result.metrics.gangedJobs}</p></div>
            </div>
            <div style={{ background: '#FEFDFB', padding: 12, borderRadius: 12, boxShadow: '0 1px 3px rgba(0,0,0,.04)', border: '1.4px solid #e4ddd1', display: 'flex', alignItems: 'center', gap: 16, borderLeft: '4px solid #1f8577' }}>
              <div style={{ padding: 10, background: '#eef7f6', color: '#1f8577', borderRadius: 8, flexShrink: 0 }}><Clock size={20} /></div>
              <div style={{ minWidth: 0 }}><p style={{ fontSize: 10, fontWeight: 700, color: '#5c6567', textTransform: 'uppercase', letterSpacing: '-0.3px', lineHeight: 1, margin: '0 0 6px 0' }}>Setup Savings</p><p style={{ fontSize: 18, fontWeight: 600, color: '#23282A', margin: 0 }}>{result.metrics.setupHoursSaved}h</p></div>
            </div>
            <div style={{ background: '#FEFDFB', padding: 12, borderRadius: 12, boxShadow: '0 1px 3px rgba(0,0,0,.04)', border: '1.4px solid #e4ddd1', display: 'flex', alignItems: 'center', gap: 16, borderLeft: '4px solid #1f8577' }}>
              <div style={{ padding: 10, background: '#eef7f6', color: '#1f8577', borderRadius: 8, flexShrink: 0 }}><TrendingUp size={20} /></div>
              <div style={{ minWidth: 0 }}><p style={{ fontSize: 10, fontWeight: 700, color: '#5c6567', textTransform: 'uppercase', letterSpacing: '-0.3px', lineHeight: 1, margin: '0 0 6px 0' }}>Utilization</p><p style={{ fontSize: 18, fontWeight: 600, color: '#23282A', margin: 0 }}>{result.metrics.utilizationRate}%</p></div>
            </div>
          </div>
          <div style={{ background: '#FEFDFB', borderRadius: 12, border: '1.4px solid #e4ddd1', boxShadow: '0 1px 3px rgba(0,0,0,.04)' }}>
            <div style={{ padding: 16, borderBottom: '1px solid #e4ddd1', fontWeight: 600, color: '#23282A' }}>Groups ({result.groups.length})</div>
            <div style={{ maxHeight: 384, overflowY: 'auto' }}>
              {result.groups.map((group: any, i: number) => (
                <div key={i} style={{ padding: 16, borderBottom: i < result.groups.length - 1 ? '1px solid #e4ddd1' : 'none' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                    <span style={{ fontWeight: 500, color: '#23282A' }}>Group {i + 1} ({group.jobs.length} jobs)</span>
                    {group.totalSetupSavings > 0 && <span style={{ fontSize: 11, background: '#d3ece9', color: '#1f8577', padding: '2px 8px', borderRadius: 9999 }}>Save {group.totalSetupSavings}min</span>}
                  </div>
                  {group.jobs.map((job: any, j: number) => (
                    <div key={j} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#5c6567' }}><CheckCircle2 size={14} color="#1f8577" /><span>{job.product_name || job.customer_name || `Job ${job.id}`}</span></div>
                  ))}
                  {group.sharedWorkCenter && <div style={{ marginTop: 4, fontSize: 11, color: '#5c6567' }}>Center: {group.sharedWorkCenter}</div>}
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

export default GangRunOptimizer;