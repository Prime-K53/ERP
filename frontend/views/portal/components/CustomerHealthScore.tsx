import React from 'react';
import { Heart, TrendingUp, AlertTriangle, CheckCircle2 } from 'lucide-react';

interface CustomerHealthScoreProps {
  score: number;
  factors?: {
    paymentHistory?: number;
    overdueInvoices?: number;
    orderFrequency?: number;
    rewards?: number;
    responseTime?: number;
  };
}

const CustomerHealthScore: React.FC<CustomerHealthScoreProps> = ({ score, factors }) => {
  const getScoreColor = (s: number) => {
    if (s >= 80) return '#059669';
    if (s >= 60) return '#d99a3f';
    return '#dc2626';
  };

  const getScoreLabel = (s: number) => {
    if (s >= 80) return 'Excellent';
    if (s >= 60) return 'Good';
    if (s >= 40) return 'Fair';
    return 'Needs Attention';
  };

  const getScoreIcon = (s: number) => {
    if (s >= 80) return <CheckCircle2 size={20} />;
    if (s >= 60) return <TrendingUp size={20} />;
    return <AlertTriangle size={20} />;
  };

  const scoreColor = getScoreColor(score);
  const circumference = 2 * Math.PI * 54;
  const offset = circumference - (score / 100) * circumference;

  return (
    <div className="glass-panel rounded-[var(--radius-md)] p-6">
      <div className="flex items-start gap-6">
        {/* Circular Score */}
        <div className="relative w-32 h-32 shrink-0">
          <svg className="w-full h-full -rotate-90" viewBox="0 0 120 120">
            <circle cx="60" cy="60" r="54" fill="none" stroke="#e4ddd1" strokeWidth="8" />
            <circle
              cx="60" cy="60" r="54"
              fill="none"
              stroke={scoreColor}
              strokeWidth="8"
              strokeDasharray={circumference}
              strokeDashoffset={offset}
              strokeLinecap="round"
              style={{ transition: 'stroke-dashoffset 1s cubic-bezier(.4,0,.2,1)' }}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <div style={{ color: scoreColor }}>{getScoreIcon(score)}</div>
            <div className="text-2xl font-bold text-slate-900 mt-1">{score}</div>
            <div className="text-[10px] text-slate-500 font-semibold">/ 100</div>
          </div>
        </div>

        {/* Details */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <Heart size={18} style={{ color: scoreColor }} />
            <h3 className="text-base font-bold text-slate-900">Customer Health</h3>
          </div>
          <div className="text-sm font-semibold mb-3" style={{ color: scoreColor }}>
            {getScoreLabel(score)}
          </div>

          {factors && (
            <div className="space-y-2">
              {factors.paymentHistory !== undefined && (
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-600">Payment History</span>
                  <div className="flex items-center gap-2">
                    <div className="w-24 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                      <div className="h-full rounded-full transition-all duration-500" style={{ width: `${factors.paymentHistory}%`, background: scoreColor }} />
                    </div>
                    <span className="text-xs font-semibold text-slate-700 w-8 text-right">{factors.paymentHistory}%</span>
                  </div>
                </div>
              )}
              {factors.overdueInvoices !== undefined && (
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-600">On-time Payments</span>
                  <div className="flex items-center gap-2">
                    <div className="w-24 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                      <div className="h-full rounded-full transition-all duration-500" style={{ width: `${factors.overdueInvoices}%`, background: scoreColor }} />
                    </div>
                    <span className="text-xs font-semibold text-slate-700 w-8 text-right">{factors.overdueInvoices}%</span>
                  </div>
                </div>
              )}
              {factors.orderFrequency !== undefined && (
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-600">Order Frequency</span>
                  <div className="flex items-center gap-2">
                    <div className="w-24 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                      <div className="h-full rounded-full transition-all duration-500" style={{ width: `${factors.orderFrequency}%`, background: scoreColor }} />
                    </div>
                    <span className="text-xs font-semibold text-slate-700 w-8 text-right">{factors.orderFrequency}%</span>
                  </div>
                </div>
              )}
              {factors.rewards !== undefined && (
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-600">Rewards Activity</span>
                  <div className="flex items-center gap-2">
                    <div className="w-24 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                      <div className="h-full rounded-full transition-all duration-500" style={{ width: `${factors.rewards}%`, background: scoreColor }} />
                    </div>
                    <span className="text-xs font-semibold text-slate-700 w-8 text-right">{factors.rewards}%</span>
                  </div>
                </div>
              )}
              {factors.responseTime !== undefined && (
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-600">Engagement</span>
                  <div className="flex items-center gap-2">
                    <div className="w-24 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                      <div className="h-full rounded-full transition-all duration-500" style={{ width: `${factors.responseTime}%`, background: scoreColor }} />
                    </div>
                    <span className="text-xs font-semibold text-slate-700 w-8 text-right">{factors.responseTime}%</span>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default CustomerHealthScore;
