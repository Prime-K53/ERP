import React, { useState, useRef } from 'react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend, BarChart, Bar
} from 'recharts';
import { Download, Maximize2, RefreshCw, ChevronDown } from 'lucide-react';

interface ChartDataPoint {
  name: string;
  value: number;
  previous?: number;
}

interface PortalChartProps {
  data: ChartDataPoint[];
  type?: 'area' | 'bar';
  title?: string;
  dataKey?: string;
  color?: string;
  gradient?: boolean;
  comparePrevious?: boolean;
  onExportPng?: () => void;
  onExportPdf?: () => void;
  loading?: boolean;
}

const PortalChart: React.FC<PortalChartProps> = ({
  data, type = 'area', title, dataKey = 'value', color = '#1f8577',
  gradient = true, comparePrevious = true, onExportPng, onExportPdf, loading = false
}) => {
  const [hovered, setHovered] = useState<string | null>(null);
  const chartRef = useRef<HTMLDivElement>(null);

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    return (
      <div className="glass-panel px-4 py-3 rounded-xl shadow-xl border border-slate-200/60 min-w-[160px]">
        <p className="text-xs font-semibold text-slate-900 mb-2">{label}</p>
        {payload.map((entry: any, index: number) => (
          <div key={index} className="flex items-center justify-between gap-4 mb-1">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full" style={{ background: entry.color }} />
              <span className="text-xs text-slate-600">{entry.name}</span>
            </div>
            <span className="text-xs font-bold text-slate-900 font-mono">
              K {typeof entry.value === 'number' ? entry.value.toLocaleString() : entry.value}
            </span>
          </div>
        ))}
      </div>
    );
  };

  if (loading) {
    return (
      <div className="glass-panel rounded-[var(--radius-md)] p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="h-5 w-32 rounded-lg bg-slate-200/60 overflow-hidden relative">
            <div className="absolute inset-0 -translate-x-full animate-[shimmer_1.5s_infinite]" style={{ background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.5), transparent)' }} />
          </div>
          <div className="flex gap-2">
            <div className="h-8 w-8 rounded-lg bg-slate-200/60 overflow-hidden relative">
              <div className="absolute inset-0 -translate-x-full animate-[shimmer_1.5s_infinite]" style={{ background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.5), transparent)' }} />
            </div>
            <div className="h-8 w-8 rounded-lg bg-slate-200/60 overflow-hidden relative">
              <div className="absolute inset-0 -translate-x-full animate-[shimmer_1.5s_infinite]" style={{ background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.5), transparent)' }} />
            </div>
          </div>
        </div>
        <div className="w-full h-[240px] rounded-xl bg-slate-200/60 overflow-hidden relative">
          <div className="absolute inset-0 -translate-x-full animate-[shimmer_1.5s_infinite]" style={{ background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.5), transparent)' }} />
        </div>
      </div>
    );
  }

  return (
    <div className="glass-panel rounded-[var(--radius-md)] p-6">
      {title && (
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-sm font-bold text-slate-900">{title}</h3>
          <div className="flex items-center gap-2">
            {comparePrevious && (
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white border border-slate-200/60">
                <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Compare</span>
                <ChevronDown.size size={12} className="text-slate-400" />
              </div>
            )}
            <button onClick={onExportPng} className="p-2 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors" aria-label="Export PNG">
              <Download.size size={14} />
            </button>
            <button onClick={onExportPdf} className="p-2 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors" aria-label="Export PDF">
              <Maximize2.size size={14} />
            </button>
          </div>
        </div>
      )}
      <div ref={chartRef} className="w-full" style={{ minHeight: 260 }}>
        <ResponsiveContainer width="100%" height={260}>
          {type === 'area' ? (
            <AreaChart data={data} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
              <defs>
                <linearGradient id={`gradient-${color.replace('#', '')}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={color} stopOpacity="0.25" />
                  <stop offset="100%" stopColor={color} stopOpacity="0" />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#e4ddd1" strokeOpacity={0.5} />
              <XAxis
                dataKey="name"
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 11, fill: '#5c6567', fontFamily: 'Inter' }}
                dy={8}
              />
              <YAxis
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 11, fill: '#5c6567', fontFamily: 'Inter' }}
                tickFormatter={(v) => `K ${v}`}
                dx={-8}
              />
              <Tooltip content={<CustomTooltip />} cursor={{ stroke: color, strokeWidth: 1, strokeDasharray: '4 4' }} />
              {comparePrevious && (
                <Area
                  type="monotone"
                  dataKey="previous"
                  stroke="#94a3b8"
                  strokeWidth={1.5}
                  fill="none"
                  strokeDasharray="5 5"
                  name="Previous"
                  dot={false}
                  activeDot={false}
                />
              )}
              <Area
                type="monotone"
                dataKey={dataKey}
                stroke={color}
                strokeWidth={2.5}
                fill={gradient ? `url(#gradient-${color.replace('#', '')})` : 'none'}
                name="Current"
                dot={false}
                activeDot={{ r: 5, fill: color, stroke: '#fff', strokeWidth: 2 }}
                onMouseEnter={() => setHovered('current')}
                onMouseLeave={() => setHovered(null)}
                style={{ filter: hovered === 'current' ? `drop-shadow(0 0 6px ${color}50)` : 'none', transition: 'filter 0.2s ease' }}
              />
            </AreaChart>
          ) : (
            <BarChart data={data} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e4ddd1" strokeOpacity={0.5} />
              <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#5c6567' }} dy={8} />
              <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#5c6567' }} tickFormatter={(v) => `K ${v}`} dx={-8} />
              <Tooltip content={<CustomTooltip />} cursor={{ fill: `${color}10` }} />
              <Legend wrapperStyle={{ fontSize: 11, fontFamily: 'Inter' }} />
              {comparePrevious && (
                <Bar dataKey="previous" fill="#94a3b8" radius={[4, 4, 0, 0]} name="Previous" />
              )}
              <Bar dataKey={dataKey} fill={color} radius={[4, 4, 0, 0]} name="Current" />
            </BarChart>
          )}
        </ResponsiveContainer>
      </div>
    </div>
  );
};

export default PortalChart;
