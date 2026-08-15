import React, { useState } from 'react';
import { Loader2, Calendar, ArrowLeft, Clock, AlertTriangle, Cpu } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useProduction } from '../../context/ProductionContext';
import { optimizeSchedule } from '../../services/aiAnalyticsUtils';

const SmartScheduler: React.FC = () => {
  const navigate = useNavigate();
  const { workOrders, workCenters, resources } = useProduction();
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);

  const runSchedule = () => {
    setLoading(true);
    setTimeout(() => {
      const res = optimizeSchedule(workOrders || [], workCenters || [], resources || []);
      setResult(res);
      setLoading(false);
    }, 300);
  };

  return (
    <div className="h-full flex flex-col p-6 overflow-y-auto" style={{ background: '#FEFDFB' }}>
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => navigate('/ai-analytics')} className="p-2 rounded-lg transition-colors" style={{ color: '#5c6567' }}><ArrowLeft size={20} /></button>
        <Calendar size={28} style={{ color: '#1f8577' }} />
        <div><h1 className="text-xl font-bold" style={{ color: '#0b3e39' }}>Smart Scheduler</h1><p className="text-xs" style={{ color: '#5c6567' }}>Constraint-based production scheduling</p></div>
      </div>

      {!result && !loading && (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center max-w-md">
            <Calendar size={48} className="mx-auto mb-4" style={{ color: '#a6d9d3' }} />
            <h2 className="text-lg font-semibold mb-2" style={{ color: '#0b3e39' }}>Optimize Production Schedule</h2>
            <p className="text-sm mb-2" style={{ color: '#5c6567' }}>{(workOrders || []).length} work orders, {(workCenters || []).length} work centers, {(resources || []).length} resources</p>
            <button onClick={runSchedule} className="prime-btn mt-4">Run Scheduler</button>
          </div>
        </div>
      )}

      {loading && <div className="flex-1 flex items-center justify-center"><Loader2 size={40} className="animate-spin mx-auto" style={{ color: '#1f8577' }} /></div>}

      {result && !loading && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="p-3 md:p-4 rounded-xl flex items-center gap-4 border-l-4 transition-all duration-200" style={{ background: '#FEFDFB', border: '1.4px solid #e4ddd1', borderLeft: '4px solid #5c6567', boxShadow: '0 1px 3px rgba(0,0,0,.04)' }}>
              <div className="p-2.5 rounded-lg shrink-0" style={{ background: '#eef7f6', color: '#5c6567' }}><Calendar size={20} /></div>
              <div className="min-w-0"><p className="text-[10px] font-bold uppercase tracking-tight leading-none mb-1.5" style={{ color: '#5c6567' }}>Scheduled</p><p className="text-lg md:text-xl font-semibold" style={{ color: '#23282A' }}>{result.metrics.totalScheduled}</p></div>
            </div>
            <div className="p-3 md:p-4 rounded-xl flex items-center gap-4 border-l-4 transition-all duration-200" style={{ background: '#FEFDFB', border: '1.4px solid #e4ddd1', borderLeft: '4px solid #d99a3f', boxShadow: '0 1px 3px rgba(0,0,0,.04)' }}>
              <div className="p-2.5 rounded-lg shrink-0" style={{ background: '#fbead0', color: '#d99a3f' }}><Clock size={20} /></div>
              <div className="min-w-0"><p className="text-[10px] font-bold uppercase tracking-tight leading-none mb-1.5" style={{ color: '#5c6567' }}>Unscheduled</p><p className="text-lg md:text-xl font-semibold" style={{ color: '#23282A' }}>{result.metrics.totalUnscheduled}</p></div>
            </div>
            <div className="p-3 md:p-4 rounded-xl flex items-center gap-4 border-l-4 transition-all duration-200" style={{ background: '#FEFDFB', border: '1.4px solid #e4ddd1', borderLeft: '4px solid #b5493f', boxShadow: '0 1px 3px rgba(0,0,0,.04)' }}>
              <div className="p-2.5 rounded-lg shrink-0" style={{ background: '#fef2f2', color: '#b5493f' }}><AlertTriangle size={20} /></div>
              <div className="min-w-0"><p className="text-[10px] font-bold uppercase tracking-tight leading-none mb-1.5" style={{ color: '#5c6567' }}>Overdue</p><p className="text-lg md:text-xl font-semibold" style={{ color: '#23282A' }}>{result.metrics.overdueJobs}</p></div>
            </div>
            <div className="p-3 md:p-4 rounded-xl flex items-center gap-4 border-l-4 transition-all duration-200" style={{ background: '#FEFDFB', border: '1.4px solid #e4ddd1', borderLeft: '4px solid #1f8577', boxShadow: '0 1px 3px rgba(0,0,0,.04)' }}>
              <div className="p-2.5 rounded-lg shrink-0" style={{ background: '#eef7f6', color: '#1f8577' }}><Cpu size={20} /></div>
              <div className="min-w-0"><p className="text-[10px] font-bold uppercase tracking-tight leading-none mb-1.5" style={{ color: '#5c6567' }}>Est. Hours</p><p className="text-lg md:text-xl font-semibold" style={{ color: '#23282A' }}>{result.metrics.totalEstimatedHours}</p></div>
            </div>
          </div>

          {result.bottlenecks?.length > 0 && (
            <div className="p-4 rounded-xl" style={{ background: '#fef2f2', border: '1.4px solid #fecaca' }}>
              <div className="flex items-center gap-2 mb-2"><Cpu size={18} style={{ color: '#b5493f' }} /><span className="font-medium text-sm" style={{ color: '#991b1b' }}>Bottlenecks</span></div>
              {result.bottlenecks.map((b: any, i: number) => (
                <div key={i} className="text-xs ml-7" style={{ color: '#b5493f' }}>{b.workCenter}: {b.scheduledJobs} jobs ({b.totalHours}h) — score: {b.bottleneckScore}%</div>
              ))}
            </div>
          )}

          <div className="prime-card overflow-hidden">
            <div className="p-3 font-semibold text-sm" style={{ borderBottom: '1.4px solid #e4ddd1', color: '#23282A' }}>Schedule</div>
            <div className="max-h-96 overflow-y-auto">
              {result.schedule?.filter((s: any) => s.status === 'scheduled').map((job: any, i: number) => (
                <div key={i} className="p-3" style={{ borderBottom: '1px solid #e4ddd1' }}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2"><Clock size={14} style={{ color: '#1f8577' }} /><span className="text-sm font-medium" style={{ color: '#23282A' }}>{job.workOrderName}</span></div>
                    <div className="flex items-center gap-2 text-xs">
                      <span className={`px-2 py-0.5 rounded-full font-medium ${job.priority === 'High' ? 'bg-red-50 text-red-600' : job.priority === 'Medium' ? 'bg-amber-50 text-amber-600' : 'bg-slate-50 text-slate-500'}`}>{job.priority}</span>
                      <span style={{ color: '#5c6567' }}>{job.estimatedHours}h</span>
                    </div>
                  </div>
                  <div className="text-xs ml-7 mt-1" style={{ color: '#5c6567' }}>{job.workCenter} · {job.suggestedStartDate} → {job.suggestedEndDate}</div>
                </div>
              ))}
            </div>
          </div>

          {result.recommendations?.length > 0 && (
            <div className="prime-card p-4">
              <div className="font-semibold text-sm mb-2" style={{ color: '#23282A' }}>Recommendations</div>
              {result.recommendations.map((r: string, i: number) => (
                <div key={i} className="flex items-center gap-2 text-sm mb-1" style={{ color: '#5c6567' }}><AlertTriangle size={14} style={{ color: '#d99a3f' }} />{r}</div>
              ))}
            </div>
          )}
          <button onClick={runSchedule} className="text-sm font-medium" style={{ color: '#1f8577' }}>Re-run</button>
        </div>
      )}
    </div>
  );
};

export default SmartScheduler;
