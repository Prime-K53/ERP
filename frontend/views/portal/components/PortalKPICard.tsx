import React from 'react';
import { TrendingUp, TrendingDown } from 'lucide-react';

interface Props {
  label: string;
  value: string | number;
  icon: React.ElementType;
  trend?: { value: number; positive: boolean };
  color?: 'emerald' | 'blue' | 'amber' | 'rose' | 'violet' | 'teal' | 'slate';
  selected?: boolean;
  onClick?: () => void;
}

const colorConfig: Record<string, { border: string; bg: string; iconBg: string; iconColor: string }> = {
  emerald: { border: '#1f8577', bg: '#FEFDFB', iconBg: '#eef7f6', iconColor: '#1f8577' },
  blue: { border: '#3b82f6', bg: '#FEFDFB', iconBg: '#eff6ff', iconColor: '#3b82f6' },
  amber: { border: '#d99a3f', bg: '#FEFDFB', iconBg: '#fbead0', iconColor: '#d99a3f' },
  rose: { border: '#b5493f', bg: '#FEFDFB', iconBg: '#fef2f2', iconColor: '#b5493f' },
  violet: { border: '#6366F1', bg: '#FEFDFB', iconBg: '#eef2ff', iconColor: '#6366F1' },
  teal: { border: '#0f766e', bg: '#FEFDFB', iconBg: '#f0fdfa', iconColor: '#0f766e' },
  slate: { border: '#475569', bg: '#FEFDFB', iconBg: '#f1f5f9', iconColor: '#475569' },
};

const PortalKPICard: React.FC<Props> = ({ label, value, icon: Icon, trend, color = 'emerald', selected = false, onClick }) => {
  const colors = colorConfig[color];

  return (
    <div
      onClick={onClick}
      className="glass-panel-interactive rounded-2xl p-4 relative overflow-hidden group flex items-start gap-3.5"
      style={{
        cursor: onClick ? 'pointer' : 'default',
        borderLeft: `4px solid ${colors.border}`,
        borderColor: selected ? colors.border : undefined,
        boxShadow: selected ? '0 12px 28px -6px rgba(15, 23, 42, 0.12)' : undefined,
      }}
    >
      <div className="p-2.5 rounded-xl shrink-0 transition-transform duration-200 group-hover:scale-105" style={{ background: colors.iconBg, color: colors.iconColor }}>
        <Icon size={20} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500 mb-1">{label}</p>
        <div className="flex items-baseline justify-between gap-2">
          <p className="text-xl font-bold text-slate-900 font-sans tracking-tight" style={{ fontVariantNumeric: 'tabular-nums' }}>
            {value}
          </p>
          {trend && (
            <div className={`inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full ${trend.positive ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}`}>
              {trend.positive ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
              <span>{trend.value}%</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default PortalKPICard;
