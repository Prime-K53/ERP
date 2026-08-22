import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { logger } from '@/services/logger';
import { useNavigate } from 'react-router-dom';
import { useModuleRefresh } from '../hooks/useModuleRefresh';
import { useAuth } from '../context/AuthContext';
import { useFinancialYear } from '../context/FinancialYearContext';
import { useFinance } from '../context/FinanceContext';
import { useSales } from '../context/SalesContext';
import { useProduction } from '../context/ProductionContext';
import { useInventory } from '../context/InventoryContext';
import { useProcurement } from '../context/ProcurementContext';
import {
  TrendingUp, TrendingDown, DollarSign, Clock,
  Briefcase, Users, ChevronDown, User,
  MessageSquare, Calculator, FileText, Zap, ArrowRight, ChevronRight,
  Sparkles, Database, BarChart2, X, ArrowUp, ArrowDown, Building2,
  Star, Inbox, Calendar, CalendarDays, Check, Download } from 'lucide-react';
import WhatsAppMarketingModal from '../components/WhatsAppMarketingModal';
import { adminLifecycle } from '../services/adminPortalClient';

import { useDashboardStore } from '../stores/dashboardStore';
import { dbService } from '../services/db';
import { formatNumber, parseFormattedNumber } from '../utils/helpers';
import { currencyService } from '../services/currencyService';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell
} from 'recharts';
import { format, isWithinInterval, parseISO } from 'date-fns';
import { ConfirmDialog, ConfirmDialogType } from '../components/ConfirmDialog';

// ─── CSS keyframes injected once ──────────────────────────────────────────────
const DASHBOARD_STYLES = `
  @keyframes kpi-slide-in {
    from { opacity: 0; transform: translateX(-8px); }
    to   { opacity: 1; transform: translateX(0); }
  }
  @keyframes kpi-slide-up {
    from { opacity: 0; transform: translateX(-8px) scale(0.97); }
    to   { opacity: 1; transform: translateX(0) scale(1); }
  }
  .kpi-value-animate {
    animation: kpi-slide-up 0.85s cubic-bezier(0.34, 1.56, 0.64, 1) both;
  }
  @keyframes shimmer-sweep {
    0%   { transform: translateX(-100%); }
    100% { transform: translateX(200%); }
  }
  @keyframes subtle-pulse {
    0%, 100% { opacity: 1; }
    50%       { opacity: 0.7; }
  }
  .kpi-value-animate {
    animation: kpi-slide-up 0.55s cubic-bezier(0.34, 1.56, 0.64, 1) both;
  }
  .kpi-card-shimmer::after {
    content: '';
    position: absolute;
    inset: 0;
    background: linear-gradient(105deg, transparent 40%, rgba(255,255,255,0.18) 50%, transparent 60%);
    animation: shimmer-sweep 3.5s ease-in-out infinite;
    border-radius: inherit;
    pointer-events: none;
  }
  @keyframes marquee-horizontal {
    0%   { transform: translateX(0); }
    15%  { transform: translateX(0); }
    85%  { transform: translateX(-35%); }
    100% { transform: translateX(-35%); }
  }
  .marquee-content {
    display: block;
    width: max-content;
    white-space: nowrap;
    animation: marquee-horizontal 7s ease-in-out infinite alternate;
  }
`;

const DashboardStyleInjector = () => {
  useEffect(() => {
    const id = 'prime-dashboard-styles';
    let el = document.getElementById(id) as HTMLStyleElement;
    if (!el) {
      el = document.createElement('style');
      el.id = id;
      document.head.appendChild(el);
    }
    el.textContent = DASHBOARD_STYLES;
  }, [DASHBOARD_STYLES]);
  return null;
};

// ─── helpers ────────────────────────────────────────────────────────────────

const toSafeNumber = (value: unknown): number => {
  if (value === null || value === undefined) return 0;
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (typeof value === 'string') {
    const cleaned = value.replace(/,/g, '');
    const n = parseFloat(cleaned);
    return Number.isFinite(n) ? n : 0;
  }
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

const isRecognizedInvoice = (invoice: any) => {
  const status = String(invoice?.status || '').trim().toLowerCase();
  return status !== 'draft' && status !== 'cancelled' && status !== 'void' && status !== 'voided';
};

const getInvoiceRevenueAmount = (invoice: any) => {
  if (!isRecognizedInvoice(invoice)) return 0;
  return toSafeNumber(invoice?.totalAmount);
};

const getGreeting = (): string => {
   const hour = new Date().getHours();
   if (hour < 12) return 'Good morning';
   if (hour < 18) return 'Good afternoon';
   return 'Good evening';
 };

 const formatShortCurrency = (currency: string, value: number): string => {
   const curr = (currency || '').trim();
   if (value >= 1_000_000) {
     const mVal = value / 1_000_000;
     return `${curr}${mVal % 1 === 0 ? mVal : mVal.toFixed(1)}M`;
   }
   if (value >= 1_000) {
     const kVal = value / 1_000;
     return `${curr}${kVal % 1 === 0 ? kVal : kVal.toFixed(1)}k`;
   }
   return `${curr}${value.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
 };

const hasChartValues = (rows: Array<{ income: number; expenses: number }>) =>
  rows.some(r => toSafeNumber(r.income) > 0 || toSafeNumber(r.expenses) > 0);

// ─── Financial Year date-range filter ─────────────────────────────────────

const useFYFilter = () => {
  const { selectedFinancialYear, getFYDateRange } = useFinancialYear();
  const range = useMemo(() => getFYDateRange(), [selectedFinancialYear, getFYDateRange]);

  const inFY = useCallback((raw: string | Date | undefined | null): boolean => {
    if (!range) return true;
    if (!raw) return false;
    const dStr = raw instanceof Date ? raw.toISOString() : String(raw);
    const day = dStr.split('T')[0];
    if (!day) return false;
    try {
      const dt = parseISO(day);
      return isWithinInterval(dt, { start: parseISO(range.start), end: parseISO(range.end) });
    } catch {
      return false;
    }
  }, [range]);

  return { range, inFY };
};

// ─── types ───────────────────────────────────────────────────────────────────

interface KpiData {
  label: string;
  value: string;
  rawValue: number;
  trend: number | null;
  trendLabel: string;
  icon: React.ReactNode;
  gradient: [string, string];
  sparkData: { v: number }[];
}

// ─── period map ──────────────────────────────────────────────────────────────

const PERIOD_DAYS: Record<string, number> = { Year: 365, Month: 30, Week: 7 };

// ─── sparkline ───────────────────────────────────────────────────────────────

const Sparkline = ({ data, color }: { data: { v: number }[]; color: string }) => (
  <div style={{ width: '100%', marginTop: 12, minWidth: 0, height: 32 }}>
    <ResponsiveContainer width="100%" height={32} minHeight={32} minWidth={0}>
      <AreaChart data={data}>
        <Area
          type="monotone"
          dataKey="v"
          stroke={color}
          fill={color}
          fillOpacity={0.25}
          strokeWidth={2}
          isAnimationActive={false}
          dot={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  </div>
);

// ─── Premium KPI Card ─────────────────────────────────────────────────────────
// ... (unchanged)
interface PremiumKpiCardProps {
  title: string;
  subtitle?: string;
  icon: React.ReactNode;
  iconBg: string;
  iconColor: string;
  accentColor: string;
  value?: string;
  trend?: number | null;
  trendLabel?: string;
  badge?: string;
  badgeBg?: string;
  badgeColor?: string;
  badgeIcon?: React.ReactNode;
  showChevron?: boolean;
  progress?: number;
  topRightIndicator?: React.ReactNode;
  compact?: boolean;
  animDelay?: number;
  onClick?: () => void;
  children?: React.ReactNode;
}

const PremiumKpiCard = ({
  title, subtitle, icon, iconBg, iconColor, accentColor,
  value, trend, trendLabel, badge, badgeBg, badgeColor, badgeIcon, showChevron, progress, topRightIndicator, compact, animDelay = 0, onClick, children
}: PremiumKpiCardProps) => {
  const [animated, setAnimated] = useState(false);
  const trendUp = (trend ?? 0) >= 0;

  useEffect(() => {
    const start = setTimeout(() => setAnimated(true), animDelay);
    const period = 5000 + animDelay * 1.4;
    const interval = setInterval(() => {
      setAnimated(false);
      setTimeout(() => setAnimated(true), 60);
    }, period);
    return () => { clearTimeout(start); clearInterval(interval); };
  }, [animDelay]);

  return (
    <div
      className="kpi-card-shimmer"
      style={{
        position: 'relative',
        background: '#FEFDFB',
        borderRadius: 14,
        padding: compact ? '16px' : '24px',
        boxShadow: '0 1px 2px rgba(11,62,57,.04)',
        border: '1px solid #e4ddd1',
        borderTop: `2px solid ${accentColor}44`,
        cursor: 'pointer',
        transition: 'box-shadow 0.22s ease, transform 0.22s ease, background 0.22s ease',
        display: 'flex',
        flexDirection: 'column',
        gap: compact ? 8 : 16,
        overflow: 'hidden',
        minHeight: 0,
        fontFamily: "'Inter', sans-serif",
      }}
      onClick={onClick}
      onMouseEnter={(e) => {
        e.currentTarget.style.boxShadow = '0 1px 2px rgba(11,62,57,.06), 0 4px 12px rgba(11,62,57,.08)';
        e.currentTarget.style.transform = 'translateY(-2px)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.boxShadow = '0 1px 2px rgba(11,62,57,.04)';
        e.currentTarget.style.transform = 'translateY(0)';
      }}
    >
      {children ? children : (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div style={{
              width: compact ? 36 : 42,
              height: compact ? 36 : 42,
              borderRadius: 12,
              background: iconBg.startsWith('rgba') || iconBg.startsWith('linear') ? iconBg : `linear-gradient(135deg, ${iconBg}, ${iconBg}cc)`,
              boxShadow: `0 4px 12px ${iconColor}22`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: iconColor,
              flexShrink: 0,
            }}>
              {icon}
            </div>
            {topRightIndicator ? (
              <div>{topRightIndicator}</div>
            ) : progress !== undefined ? (
              <div style={{ position: 'relative', width: compact ? 32 : 36, height: compact ? 32 : 36 }}>
                <svg viewBox="0 0 36 36" style={{ width: '100%', height: '100%', transform: 'rotate(-90deg)' }}>
                  <circle cx="18" cy="18" r="14" fill="none" stroke={`${iconColor}22`} strokeWidth="4" />
                  <circle cx="18" cy="18" r="14" fill="none" stroke={iconColor} strokeWidth="4" strokeDasharray="88" strokeDashoffset={88 - (88 * progress) / 100} strokeLinecap="round" style={{ transition: 'stroke-dashoffset 1s ease-out' }} />
                </svg>
              </div>
            ) : showChevron ? (
              <div style={{
                width: 28, height: 28, borderRadius: 8,
                backgroundColor: '#f1f5f9',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: '#94a3b8',
                transition: 'background 0.15s',
              }}>
                <ChevronRight size={14} />
              </div>
            ) : null}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: compact ? 3 : 4 }}>
            <div style={{
              fontSize: compact ? 11 : 12,
              fontWeight: 600,
              color: '#64748b',
              letterSpacing: '0.04em',
              textTransform: 'uppercase',
              lineHeight: 1.4,
            }}>
              {title}
            </div>

            {subtitle && !value && (
              <div style={{ fontSize: compact ? 11 : 13, fontWeight: 500, color: '#94a3b8', lineHeight: 1.4 }}>
                {subtitle}
              </div>
            )}

            {value && (
              <div
                className={animated ? 'kpi-value-animate' : ''}
                style={{
                  fontSize: compact ? 20 : 26,
                  fontWeight: 700,
                  color: '#0f172a',
                  letterSpacing: '-0.025em',
                  lineHeight: 1.15,
                  fontVariantNumeric: 'tabular-nums',
                  marginTop: 2,
                }}
              >
                {value}
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 4 }}>
              {(trend !== undefined && trend !== null) || trendLabel ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  {trend !== undefined && trend !== null && (
                    <span style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 3,
                      fontSize: compact ? 10 : 11,
                      fontWeight: 700,
                      color: trendUp ? '#16a34a' : '#dc2626',
                      backgroundColor: trendUp ? '#f0fdf4' : '#fef2f2',
                      padding: '2px 7px',
                      borderRadius: 6,
                      letterSpacing: '-0.01em',
                    }}>
                      {trendUp ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
                      {trendUp ? '+' : ''}{trend.toFixed(1)}%
                    </span>
                  )}
                  {trendLabel && (
                    <span style={{ fontSize: compact ? 10 : 11, color: '#5b578c', fontWeight: 600 }}>
                      {trendLabel}
                    </span>
                  )}
                </div>
              ) : null}

              {badge && (
                <div style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                  padding: compact ? '5px 12px' : '6px 14px',
                  backgroundColor: badgeBg || (badge === 'This Month' ? '#eff6ff' : '#fef3c7'),
                  borderRadius: 999,
                  fontSize: compact ? 11 : 12,
                  fontWeight: 700,
                  color: badgeColor || (badge === 'This Month' ? '#3b82f6' : '#b45309'),
                  width: 'fit-content',
                }}>
                  {badgeIcon ? badgeIcon : badge === 'This Month' ? <Clock size={12} strokeWidth={2.5} /> : null}
                  {badge}
                </div>
              )}
            </div>
          </div>
        </>
      )}

      <div style={{
        position: 'absolute',
        bottom: -12,
        left: -12,
        width: 80,
        height: 80,
        borderRadius: '50%',
        background: `radial-gradient(circle, ${accentColor}18 0%, transparent 70%)`,
        pointerEvents: 'none',
      }} />
    </div>
  );
};

// ─── Sliding Info Card component ──────────────────────────────────────────
// ... (unchanged)
const SlidingInfoCard = ({ slides, compact, animDelay = 0 }: { slides: any[], compact: boolean, animDelay?: number }) => {
  const [index, setIndex] = useState(0);
  const [direction, setDirection] = useState(1);
  const navigate = useNavigate();

  useEffect(() => {
    const timer = setInterval(() => {
      setDirection(1);
      setIndex(prev => (prev + 1) % slides.length);
    }, 10000 + animDelay);
    return () => clearInterval(timer);
  }, [slides.length, animDelay]);

  const slide = slides[index];

  const routeMap: Record<string, string> = {
    'Active Jobs': '/industrial/shop-floor',
    'Subscription': '/sales-flow/subscriptions',
    'Portal Requests': '/sales-flow/requests',
  };

  const handleCardClick = () => {
    const route = routeMap[slide.label];
    if (route) navigate(route);
  };

  return (
    <div
      className="kpi-card-shimmer"
      style={{
        position: 'relative',
        background: 'rgba(255, 255, 255, 0.65)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        borderRadius: compact ? 16 : 24,
        padding: compact ? '16px' : '24px',
        boxShadow: '0 8px 32px rgba(31, 38, 135, 0.08)',
        border: '1px solid rgba(255, 255, 255, 0.8)',
        borderTop: `2px solid ${slide.color}44`,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        cursor: 'pointer',
        overflow: 'hidden',
        minHeight: compact ? 150 : 170,
        transition: 'all 0.5s ease-in-out',
      }}
      onClick={handleCardClick}
    >
      <div key={index} className="animate-in fade-in slide-in-from-right-4 duration-1000" style={{ height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
        {slide.render ? slide.render(compact) : (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div style={{
                width: compact ? 36 : 42,
                height: compact ? 36 : 42,
                borderRadius: 12,
                background: `linear-gradient(135deg, ${slide.color}, ${slide.color}cc)`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#fff',
                boxShadow: `0 4px 12px ${slide.color}33`,
              }}>
                {slide.icon}
              </div>
              <div style={{ display: 'flex', gap: 4 }}>
                {slides.map((_, i) => (
                  <div key={i} style={{
                    width: 6, height: 6, borderRadius: '50%',
                    backgroundColor: i === index ? slide.color : 'rgba(0,0,0,0.1)',
                    transition: 'all 0.3s'
                  }} />
                ))}
              </div>
            </div>

            <div style={{ marginTop: 12 }}>
              <div style={{ fontSize: compact ? 11 : 12, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                {slide.label}
              </div>
              <div style={{ 
                overflow: 'hidden',
                width: '100%',
                position: 'relative'
              }}>
                <div 
                  className={String(slide.value || '').length > 11 ? 'marquee-content' : ''}
                  style={{ 
                    fontSize: compact ? 22 : 28, 
                    fontWeight: 800, 
                    color: '#2e2a5d', 
                    marginTop: 2, 
                    letterSpacing: '-0.02em',
                    whiteSpace: 'nowrap',
                    width: 'max-content',
                  }}
                >
                  {slide.value}
                </div>
              </div>
              <div style={{ fontSize: compact ? 11 : 12, fontWeight: 500, color: '#5b578c', marginTop: 2 }}>
                {slide.subtitle}
              </div>
            </div>
          </>
        )}
      </div>
      
      {slide.render && (
        <div style={{ position: 'absolute', bottom: compact ? 12 : 16, right: compact ? 16 : 24, display: 'flex', gap: 5 }}>
          {slides.map((_, i) => (
            <div key={i} style={{
              width: i === index ? 12 : 6, 
              height: 6, 
              borderRadius: 3,
              backgroundColor: i === index ? slide.color : 'rgba(0,0,0,0.1)',
              transition: 'all 0.3s'
            }} />
          ))}
        </div>
      )}
    </div>
  );
};

// ─── KPI card alias ────────────────────────────────────────────────────────
const SimpleKpiCard = PremiumKpiCard;

// ─── Animated value wrapper for custom-child KPI cards ─────────────────────
const KpiValueAnimator = ({ animDelay = 0, children }: { animDelay?: number; children: React.ReactNode }) => {
  const [animated, setAnimated] = useState(false);

  useEffect(() => {
    const start = setTimeout(() => setAnimated(true), animDelay);
    const period = 5000 + animDelay * 1.4;
    const interval = setInterval(() => {
      setAnimated(false);
      setTimeout(() => setAnimated(true), 60);
    }, period);
    return () => { clearTimeout(start); clearInterval(interval); };
  }, [animDelay]);

  return (
    <div className={animated ? 'kpi-value-animate' : ''}>
      {children}
    </div>
  );
};

// ─── KPI card (old design - keeping for reference if needed) ────────────────────────────────────────────
const KpiCard = ({ kpi }: { kpi: KpiData }) => {
  const [isHovered, setIsHovered] = useState(false);
  const displayTrend = kpi.trend ?? 0;
  const trendUp = displayTrend >= 0;
  const trendStr = kpi.trend !== null 
    ? `${trendUp ? '+' : ''}${displayTrend.toFixed(1)}% ${kpi.trendLabel}`
    : kpi.trendLabel;

  return (
    <div
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{
        background: `linear-gradient(135deg, ${kpi.gradient[0]}, ${kpi.gradient[1]})`,
        borderRadius: 24,
        padding: '24px',
        color: '#fff',
        boxShadow: isHovered ? '0 12px 36px rgba(0,0,0,0.18)' : '0 8px 32px rgba(0,0,0,0.12)',
        transform: isHovered ? 'translateY(-4px)' : 'none',
        transition: 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1), box-shadow 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
        position: 'relative',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
        minHeight: 160,
      }}
    >
      <div style={{ position: 'absolute', top: 20, right: 20, width: 44, height: 44, borderRadius: '50%', backgroundColor: 'rgba(255,255,255,0.18)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {kpi.icon}
      </div>
      <div style={{ fontSize: 28, fontWeight: 700, letterSpacing: '-0.02em', lineHeight: 1.2 }}>{kpi.value}</div>
      <div style={{ fontSize: 13, fontWeight: 500, opacity: 0.82, letterSpacing: '-0.01em' }}>{kpi.label}</div>
      <div style={{ marginTop: 6 }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 600, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 20, padding: '2px 10px' }}>
          {kpi.trend !== null && (trendUp ? <TrendingUp size={10} /> : <TrendingDown size={10} />)}
          {trendStr}
        </span>
      </div>
      <Sparkline data={kpi.sparkData} color="rgba(255,255,255,0.9)" />
    </div>
  );
};

// ─── period dropdown ─────────────────────────────────────────────────────────
const PeriodDropdown = ({ value, onChange }: { value: string; onChange: (v: string) => void }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button onClick={() => setOpen(o => !o)} style={{
        display: 'flex', alignItems: 'center', gap: 6, padding: '7px 12px', borderRadius: 20,
        border: '1px solid #E2E8F0', backgroundColor: '#fff', fontSize: 13, fontWeight: 600, color: '#334155', cursor: 'pointer',
        boxShadow: '0 1px 4px rgba(0,0,0,0.06)', transition: 'box-shadow 0.15s',
      }}>
        {value}
        <ChevronDown size={14} style={{ transition: 'transform 0.15s', transform: open ? 'rotate(180deg)' : 'none' }} />
      </button>
      {open && (
        <div style={{ position: 'absolute', top: 'calc(100% + 6px)', right: 0, backgroundColor: '#fff', border: '1px solid #E2E8F0', borderRadius: 12, boxShadow: '0 8px 24px rgba(0,0,0,0.1)', zIndex: 50, overflow: 'hidden', minWidth: 120 }}>
          {Object.keys(PERIOD_DAYS).map(period => (
            <button key={period} onClick={() => { onChange(period); setOpen(false); }} style={{
              display: 'block', width: '100%', textAlign: 'left', padding: '10px 16px', fontSize: 13,
              fontWeight: value === period ? 700 : 500, color: value === period ? '#4F46E5' : '#475569',
              backgroundColor: value === period ? '#EEF2FF' : 'transparent', border: 'none', cursor: 'pointer', transition: 'background-color 0.1s',
            }}>
              {period}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

// ─── Responsive hook ────────────────────────────────────────────────────────
const useWindowSize = () => {
  const [size, setSize] = useState({ width: window.innerWidth, height: window.innerHeight });
  useEffect(() => {
    const handler = () => setSize({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);
  return size;
};

// ─── Dashboard Content ───────────────────────────────────────────────────────

const DashboardContent: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [isWhatsAppModalOpen, setIsWhatsAppModalOpen] = useState(false);
  const { initialized, loadDefaults, widgets } = useDashboardStore();
  useEffect(() => { if (!initialized) loadDefaults(); }, [initialized]);
  const { width: screenWidth } = useWindowSize();
  const isMobile  = screenWidth < 640;
  const isTablet  = screenWidth >= 640 && screenWidth < 1024;
  const isDesktop = screenWidth >= 1024;

  const { companyConfig, resetSystem } = useAuth();
  const { accounts, invoices, expenses } = useFinance();
  const { customers, sales, customerPayments, quotations, jobOrders } = useSales();
  const { workOrders } = useProduction();
  const { purchases, suppliers } = useProcurement();

  useModuleRefresh(undefined, { interval: 60000 });

  const currency = companyConfig?.currencySymbol || currencyService.getCurrency(currencyService.getBaseCurrency())?.symbol || '$';
  const rawCompanyName = companyConfig?.companyName || 'Demo Company';
  const displayCompanyName = rawCompanyName.split(' ').slice(0, 2).join(' ');

  const [isLoading, setIsLoading] = useState(true);
  const [chartData, setChartData]   = useState<any[]>([]);
  const [activePeriod, setActivePeriod] = useState<string>('Year');
  const [requestAnalytics, setRequestAnalytics] = useState<any>(null);

  useEffect(() => {
    let cancelled = false;
    const loadAnalytics = () => {
      adminLifecycle.analytics.get()
        .then((data) => { if (!cancelled) setRequestAnalytics(data); })
        .catch(() => {});
    };
    loadAnalytics();
    const timer = setInterval(loadAnalytics, 60000);
    return () => { cancelled = true; clearInterval(timer); };
  }, []);

  const finYearStart = companyConfig?.financialYearStart || 'January';
  const finYearStartMonth = new Date(`${finYearStart} 1, 2000`).getMonth();
  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth();
  const finYearBase = currentMonth < finYearStartMonth ? currentYear - 1 : currentYear;
  const finYears = Array.from({ length: 5 }, (_, i) => {
    const start = finYearBase - 2 + i;
    return `${start}/${String(start + 1).slice(2)}`;
  });
  const [selectedFinYear, setSelectedFinYear] = useState<string>(finYears[2]);
  const { selectedFinancialYear, availableFinancialYears, setFinancialYear, isLoading: isFyLoading } = useFinancialYear();
  const [showFyDropdown, setShowFyDropdown] = useState(false);
  const fyDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (fyDropdownRef.current && !fyDropdownRef.current.contains(event.target as Node)) setShowFyDropdown(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const fyDisplayName = (fy?: { start_date?: string; end_date?: string; name?: string }) => {
    const s = fy?.start_date || selectedFinancialYear?.start_date;
    const e = fy?.end_date || selectedFinancialYear?.end_date;
    const n = fy?.name || selectedFinancialYear?.name;
    const sy = s?.slice(0, 4);
    const ey = e?.slice(0, 4);
    if (sy && ey && sy !== ey) return `FY ${sy}/${ey.slice(2)}`;
    return n || 'Financial Year';
  };

  const currentFyDisplay = React.useMemo(() => {
    if (!selectedFinancialYear) return 'Financial Year';
    return fyDisplayName();
  }, [selectedFinancialYear, fyDisplayName]);

  useEffect(() => {
    if (selectedFinancialYear) {
      const sy = selectedFinancialYear.start_date?.slice(0, 4);
      const ey = selectedFinancialYear.end_date?.slice(0, 4);
      if (sy && ey) setSelectedFinYear(`${sy}/${ey?.slice(2)}`);
    }
  }, [selectedFinancialYear]);

  // Company menu & restore logic omitted for brevity — kept same as original
  const [showCompanyMenu, setShowCompanyMenu] = useState(false);
  const [confirmState, setConfirmState] = useState<{ open: boolean; title: string; message: string; confirmText?: string; type?: ConfirmDialogType; onConfirm?: () => void }>({ open: false, title: '', message: '' });
  const restoreInputRef = useRef<HTMLInputElement>(null);

  const handleCreateCompany = async () => {
    setConfirmState({
      open: true, title: 'Create New Company', message: 'Create a new company? This will permanently wipe and reset all current data except your subscription status.', type: 'danger', confirmText: 'Create New Company',
      onConfirm: () => { (async () => { try { await adminLifecycle.company.reset().catch(() => {}); await resetSystem(); window.location.reload(); } catch (e) { logger.error(e); } })(); }
    });
  };

  const handleRestoreBackupFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setConfirmState({
      open: true, title: 'Restore Company Backup', message: `Restore company from backup "${file.name}"? This will replace the current local database context.`, type: 'warning', confirmText: 'Restore',
      onConfirm: async () => {
        try {
          const raw = await file.text();
          const parsed = JSON.parse(raw);
          if (!parsed || typeof parsed !== 'object' || !parsed.data) throw new Error('Invalid Prime ERP backup structure.');
          await dbService.importDatabase(raw);
          alert('Company restored successfully. Reloading view...'); window.location.reload();
        } catch (error) {
          logger.error('Failed to restore company', error);
          alert(error instanceof Error ? error.message : 'Company restore failed');
        } finally { event.target.value = ''; setShowCompanyMenu(false); }
      }
    });
  };

  // FY filter
  const { inFY } = useFYFilter();

  // Account balances filtered by FY (only transactions within FY affect dashboard)
  const { cashBalance, bankBalance, chequeBalance, walletBalance } = (() => {
    if (!accounts || accounts.length === 0) return { cashBalance: 0, bankBalance: 0, chequeBalance: 0, walletBalance: 0 };
    let cash = 0, bank = 0, cheque = 0, wallet = 0;
    accounts.forEach((acc: any) => {
      const name = String(acc.name || '').toLowerCase();
      const type = String(acc.type || '').toLowerCase();
      const bal  = toSafeNumber(acc.balance);
      if (name.includes('cash') || type === 'cash')     cash   += bal;
      else if (name.includes('cheque') || type === 'cheque') cheque += bal;
      else if (name.includes('wallet') || type === 'wallet') wallet += bal;
      else bank += bal;
    });
    return { cashBalance: cash, bankBalance: bank, chequeBalance: cheque, walletBalance: wallet };
  })();

  // 1. Revenue (This Month) — filter by FY
  const revenueThisMonth = (() => {
    const now = new Date();
    const mm = now.getMonth();
    const yyyy = now.getFullYear();
    return invoices
      .filter((inv: any) => inFY(inv.date || inv.createdAt))
      .filter((inv: any) => {
        const d = new Date(inv.date || inv.createdAt || '');
        return d.getMonth() === mm && d.getFullYear() === yyyy;
      })
      .reduce((sum: number, inv: any) => sum + getInvoiceRevenueAmount(inv), 0);
  })();

  const revenueLastMonth = (() => {
    const now = new Date();
    let mm = now.getMonth() - 1;
    let yyyy = now.getFullYear();
    if (mm < 0) { mm = 11; yyyy--; }
    return invoices
      .filter((inv: any) => inFY(inv.date || inv.createdAt))
      .filter((inv: any) => {
        const d = new Date(inv.date || inv.createdAt || '');
        return d.getMonth() === mm && d.getFullYear() === yyyy;
      })
      .reduce((sum: number, inv: any) => sum + getInvoiceRevenueAmount(inv), 0);
  })();

  const revenueTrend = revenueLastMonth > 0 ? ((revenueThisMonth - revenueLastMonth) / revenueLastMonth) * 100 : (revenueThisMonth > 0 ? 100 : 0);

  // 2. Today's Collection
  const todayStr = new Date().toISOString().split('T')[0];
  const collectionData = (() => {
    const todayPayments = customerPayments
      .filter((p: any) => String(p.status || '').toLowerCase() !== 'voided')
      .filter((p: any) => inFY(p.date || p.createdAt))
      .filter((p: any) => String(p.date || p.createdAt || '').startsWith(todayStr));
    const sum = todayPayments.reduce((acc, p) => acc + toSafeNumber(p.amountRetained ?? p.receiptSnapshot?.amountRetained ?? p.amount), 0);
    const firstAcc = todayPayments[0]?.accountName || todayPayments[0]?.method || 'Cash';
    return { sum, acc: firstAcc };
  })();
  const todaysCollection = collectionData.sum;
  const collectionAccount = collectionData.acc;

  const newInvoicesToday = invoices.filter((inv: any) => String(inv.date || inv.createdAt || '').startsWith(todayStr)).length;

  const yesterdayDate = new Date(); yesterdayDate.setDate(yesterdayDate.getDate() - 1);
  const yesterdayStr = yesterdayDate.toISOString().split('T')[0];
  const yesterdaysCollection = (() => {
    return customerPayments
      .filter((p: any) => String(p.status || '').toLowerCase() !== 'voided')
      .filter((p: any) => inFY(p.date || p.createdAt))
      .filter((p: any) => String(p.date || p.createdAt || '').startsWith(yesterdayStr))
      .reduce((sum: number, p: any) => sum + toSafeNumber(p.amountRetained ?? p.receiptSnapshot?.amountRetained ?? p.amount), 0);
  })();

  const collectionTrend = yesterdaysCollection > 0 ? ((todaysCollection - yesterdaysCollection) / yesterdaysCollection) * 100 : (todaysCollection > 0 ? 100 : 0);

  // 3. Receivables
  const receivables = invoices
    .filter((inv: any) => inFY(inv.date || inv.createdAt))
    .filter((inv: any) => {
      const s = String(inv.status || '').toLowerCase();
      return s !== 'cancelled' && s !== 'voided' && s !== 'draft' && (s === 'unpaid' || s === 'partial' || s === 'overdue');
    })
    .reduce((sum: number, inv: any) => {
      const total  = toSafeNumber(inv.totalAmount);
      const paid   = toSafeNumber(inv.paidAmount);
      return sum + Math.max(0, total - paid);
    }, 0);

  const overdueCount = invoices.filter((inv: any) => inv.status === 'Overdue').length;

  // 4. Active Jobs
  const activeJobs = (() => {
    const activeJobOrders = jobOrders.filter((j: any) => !['Completed', 'Cancelled', 'Closed', 'Delivered'].includes(String(j.status || ''))).length;
    const activeWorkOrders = workOrders.filter((w: any) => !['Completed', 'Cancelled', 'Closed'].includes(String(w.status || ''))).length;
    const activeQuotations = quotations.filter((q: any) => q.status === 'Approved').length;
    return activeJobOrders + activeWorkOrders + activeQuotations;
  })();

  const lastUnpaidInvoice = (() => {
    const unpaid = [...invoices].filter(inv => inv.status === 'Unpaid' || inv.status === 'Partial' || inv.status === 'Overdue')
      .sort((a, b) => new Date(b.date || b.createdAt || 0).getTime() - new Date(a.date || a.createdAt || 0).getTime());
    return unpaid[0] || null;
  })();

  const lastActiveJob = (() => {
    const active = [...jobOrders]
      .filter(j => !['Completed', 'Cancelled', 'Closed', 'Delivered'].includes(String(j.status || '')))
      .sort((a, b) => new Date(b.date || b.createdAt || 0).getTime() - new Date(a.date || a.createdAt || 0).getTime());
    return active[0] || null;
  })();

  const pendingJobsCount = jobOrders.filter(j => String(j.status || '').toLowerCase() === 'pending').length;
  const activeJobOrdersList = jobOrders.filter((j: any) => !['Completed', 'Cancelled', 'Closed', 'Delivered'].includes(String(j.status || '')));

  // sparkline seeds
  const spark1 = [{ v: 10 }, { v: 15 }, { v: 12 }, { v: 25 }, { v: 18 }, { v: 30 }, { v: 28 }];
  const spark2 = [{ v: 20 }, { v: 18 }, { v: 25 }, { v: 22 }, { v: 35 }, { v: 30 }, { v: 40 }];
  const spark3 = [{ v: 30 }, { v: 25 }, { v: 35 }, { v: 20 }, { v: 15 }, { v: 25 }, { v: 20 }];
  const spark4 = [{ v: 15 }, { v: 25 }, { v: 20 }, { v: 35 }, { v: 45 }, { v: 30 }, { v: 50 }];

  const activeSubscriptionsCount = useMemo(() => {
    // subscriptions from useFinance (recurringInvoices)
    // For this example, we will assume expenses are used in the dashboard; adjust as needed.
    return 0;
  }, []);

  const activeJobsCount = jobOrders.filter(j => !['Completed', 'Cancelled', 'Closed', 'Delivered'].includes(String(j.status || ''))).length;

  const nextSubscription = (() => {
    const activeSubs = expenses.filter(s => String(s.status || '').toLowerCase() === 'active');
    if (activeSubs.length === 0) return null;
    const enriched = activeSubs.map((sub) => {
      const nextRunAt = sub.nextRunDate || sub.nextDueDate || sub.nextBillingDate || sub.dueDate || null;
      const amountDue = toSafeNumber(sub.total ?? sub.totalAmount);
      return { ...sub, nextRunAt, nextDueDate: nextRunAt, nextBillingDate: nextRunAt, dueDate: nextRunAt, totalAmount: amountDue, amountDue };
    });
    const sorted = [...enriched].sort((a, b) => new Date(a.nextRunAt || '9999-12-31').getTime() - new Date(b.nextRunAt || '9999-12-31').getTime());
    const next = sorted[0];
    if (!next || (!next.customerName && !next.planName && !next.frequency)) return null;
    return next;
  })();

  const formatSubName = (name: string) => {
    if (!name) return '';
    return name.trim();
  };

  // sliding info slides
  const infoSlides = [
    {
      label: 'Subscription', color: '#f59e0b', icon: <Star size={20} />,
      render: (compact: boolean) => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, height: '100%' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', letterSpacing: '0.05em', textTransform: 'uppercase' }}>SUBSCRIPTION</div>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: '#fffbeb', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#f59e0b', flexShrink: 0 }}><Star size={16} fill="currentColor" /></div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <div style={{ fontSize: 28, fontWeight: 800, color: '#f59e0b', letterSpacing: '-0.02em', lineHeight: 1 }}>{nextSubscription ? formatSubName(nextSubscription.customerName || nextSubscription.planName || 'Active') : 'Enterprise'}</div>
            <div style={{ fontSize: 11, color: '#64748b', fontWeight: 500, marginTop: 4 }}>{nextSubscription ? `${nextSubscription.customerName || 'Company account'} · ${nextSubscription.frequency || 'Pro'}` : 'Prime ERP Management System'}</div>
          </div>
          <div style={{ height: '1px', backgroundColor: 'rgba(0,0,0,0.06)', width: '100%', margin: '2px 0' }} />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontSize: 11, color: '#64748b' }}>Next billing</div>
            <div style={{ fontSize: 11, color: '#0f172a', fontWeight: 700 }}>{nextSubscription ? format(new Date(nextSubscription.nextDueDate || nextSubscription.nextBillingDate || nextSubscription.dueDate), 'MMM d, yyyy') : '—'}</div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontSize: 11, color: '#64748b' }}>Amount due</div>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#b45309', backgroundColor: '#fffbeb', padding: '1px 8px', borderRadius: 6 }}>{formatShortCurrency(currency, toSafeNumber(nextSubscription?.amountDue))}</div>
          </div>
        </div>
      )
    },
    {
      label: 'Active Jobs', color: '#a855f7', icon: <Briefcase size={20} />,
      render: (compact: boolean) => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, height: '100%' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', letterSpacing: '0.05em', textTransform: 'uppercase' }}>ACTIVE JOBS</div>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: '#f3e8ff', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#a855f7', flexShrink: 0 }}><Briefcase size={16} /></div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <div style={{ fontSize: 28, fontWeight: 800, color: '#0f172a', letterSpacing: '-0.02em', lineHeight: 1 }}>{activeJobsCount || '0'}</div>
            <div style={{ fontSize: 11, color: '#64748b', fontWeight: 500, marginTop: 4 }}>Production in progress</div>
          </div>
          <div style={{ height: '1px', backgroundColor: 'rgba(0,0,0,0.06)', width: '100%', margin: '2px 0' }} />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#1e293b' }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: '#a855f7' }} />
              {lastActiveJob ? `${lastActiveJob.jobNo || lastActiveJob.orderNo || 'Job Order'}` : 'No active jobs'}
            </div>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#7c3aed', backgroundColor: '#f5f3ff', padding: '1px 8px', borderRadius: 6 }}>{lastActiveJob ? (lastActiveJob.status || 'Active') : 'Stable'}</div>
          </div>
          {activeJobOrdersList.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3, marginTop: 2 }}>
              <div style={{ fontSize: 10, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>In Production</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {activeJobOrdersList.slice(0, 3).map((job: any, idx: number) => (
                  <div key={idx} style={{ fontSize: 10.5, color: '#334155', lineHeight: 1.3, display: 'flex', gap: 4 }}>
                    <span style={{ color: '#a855f7', flexShrink: 0 }}>·</span>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{job.jobTitle || job.jobDescription || job.notes || job.productName || `${job.jobNo || job.orderNo || ''}`}</span>
                  </div>
                ))}
                {activeJobOrdersList.length > 3 && (
                  <div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 500 }}>+{activeJobOrdersList.length - 3} more</div>
                )}
              </div>
            </div>
          )}
        </div>
      )
    },
    {
      label: 'Portal Requests', color: '#0ea5e9', icon: <Inbox size={20} />,
      render: (compact: boolean) => {
        const r = requestAnalytics || {};
        const reqs = r.requests || {};
        // New/available requests from the customer portal awaiting action.
        const pendingReview = (reqs.submitted || 0) + (reqs.assigned || 0) + (reqs.under_review || 0) + (reqs.waiting_for_customer || 0) + (reqs.ready_for_conversion || 0);
        const types = r.requestTypes || {};
        const openQuotations = types.quotation || 0;
        const openOrders = types.order || 0;
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, height: '100%' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', letterSpacing: '0.05em', textTransform: 'uppercase' }}>PORTAL REQUESTS</div>
              <div style={{ width: 32, height: 32, borderRadius: 8, background: '#e0f2fe', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#0ea5e9', flexShrink: 0 }}><Inbox size={16} /></div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <div style={{ fontSize: 28, fontWeight: 800, color: '#0f172a', letterSpacing: '-0.02em', lineHeight: 1 }}>{pendingReview}</div>
              <div style={{ fontSize: 11, color: '#64748b', fontWeight: 500, marginTop: 4 }}>New requests awaiting review</div>
            </div>
            <div style={{ height: '1px', backgroundColor: 'rgba(0,0,0,0.06)', width: '100%', margin: '2px 0' }} />
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#1e293b' }}>
                <div style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: '#0ea5e9' }} />
                Quotation requests
              </div>
              <div style={{ fontSize: 10, fontWeight: 700, color: '#0369a1', backgroundColor: '#e0f2fe', padding: '1px 8px', borderRadius: 6 }}>{openQuotations}</div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#1e293b' }}>
                <div style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: '#f59e0b' }} />
                Order requests
              </div>
              <div style={{ fontSize: 10, fontWeight: 700, color: '#b45309', backgroundColor: '#fffbeb', padding: '1px 8px', borderRadius: 6 }}>{openOrders}</div>
            </div>
          </div>
        );
      }
    },
  ];

  const kpiCards: KpiData[] = [
    { label: 'Revenue (This Month)', value: formatShortCurrency(currency, revenueThisMonth), rawValue: revenueThisMonth, trend: revenueTrend, trendLabel: 'vs last month', icon: <DollarSign size={22} color="#fff" />, gradient: ['#0d7c71', '#129a8e'], sparkData: spark1 },
    { label: "Today's Collection", value: formatShortCurrency(currency, todaysCollection), rawValue: todaysCollection, trend: collectionTrend, trendLabel: 'vs yesterday', icon: <Clock size={22} color="#fff" />, gradient: ['#5ebd69', '#45a750'], sparkData: spark2 },
    { label: 'Receivables', value: formatShortCurrency(currency, receivables), rawValue: receivables, trend: null, trendLabel: overdueCount > 0 ? `${overdueCount} overdue invoice${overdueCount > 1 ? 's' : ''}` : 'Outstanding balance', icon: <Users size={22} color="#fff" />, gradient: ['#d9663b', '#e67a4d'], sparkData: spark3 },
    { label: 'Active Jobs', value: formatNumber(activeJobs), rawValue: activeJobs, trend: null, trendLabel: 'In progress', icon: <Briefcase size={22} color="#fff" />, gradient: ['#177db8', '#2094d0'], sparkData: spark4 },
  ];

  // ── chart data load ───────────────────────────────────────────────────────
  const loadChartData = useCallback(() => {
    setIsLoading(true);
    try {
      const now  = new Date();
      const cData: Record<string, { income: number; expenses: number; pos: number; paid_inv: number; unpaid_inv: number; partial_inv: number; day: string }> = {};

      if (activePeriod === 'Year') {
        const startYear = parseInt(selectedFinYear.split('/')[0], 10);
        for (let i = 0; i < 12; i++) {
          const d = new Date(startYear, finYearStartMonth + i, 1);
          const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
          const label = d.toLocaleDateString('en-US', { month: 'short' });
          cData[key] = { income: 0, expenses: 0, pos: 0, paid_inv: 0, unpaid_inv: 0, partial_inv: 0, day: label };
        }
      } else {
        const days = PERIOD_DAYS[activePeriod] ?? 30;
        for (let i = days - 1; i >= 0; i--) {
          const d = new Date(now); d.setDate(d.getDate() - i);
          const key = d.toISOString().split('T')[0];
          const label = activePeriod === 'Week' ? d.toLocaleDateString('en-US', { weekday: 'short' }) : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
          if (!cData[key]) cData[key] = { income: 0, expenses: 0, pos: 0, paid_inv: 0, unpaid_inv: 0, partial_inv: 0, day: label };
        }
      }

      const getChartKey = (dRaw: string) => {
        if (!dRaw) return null;
        const dt = new Date(dRaw);
        return activePeriod === 'Year' ? `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}` : dRaw.split('T')[0];
      };

      // POS sales within FY
      sales.forEach((s: any) => {
        if (!inFY(s.date || s.createdAt)) return;
        const key = getChartKey(String(s.date || s.createdAt || ''));
        if (key && cData[key]) {
          const total = toSafeNumber(s.totalAmount);
          if (total > 0) cData[key].pos += total;
          cData[key].expenses += toSafeNumber(s.cost ?? s.expense ?? 0);
        }
      });

      // Invoices within FY
      invoices.forEach((inv: any) => {
        if (!inFY(inv.date || inv.createdAt)) return;
        const key = getChartKey(String(inv.date || inv.createdAt || ''));
        if (key && cData[key]) {
          const total = getInvoiceRevenueAmount(inv);
          const status = String(inv.status || '').toLowerCase();
          if (status === 'paid' || status === 'completed') cData[key].paid_inv += total;
          else if (status === 'partial' || status === 'partially paid' || status === 'overdue') cData[key].partial_inv += total;
          else if (status === 'unpaid' || status === 'due' || status === 'pending') cData[key].unpaid_inv += total;
          else cData[key].income += total;
        }
      });

      // Purchases (expenses) within FY
      purchases.forEach((p: any) => {
        if (!inFY(p.date || p.orderDate || p.createdAt)) return;
        const isPaid = p.status === 'Paid' || p.paymentStatus === 'Paid' || toSafeNumber(p.paidAmount) > 0 || p.paymentStatus === 'Partial';
        if (!isPaid) return;
        const key = getChartKey(String(p.date || p.orderDate || p.createdAt || ''));
        if (key && cData[key]) cData[key].expenses += toSafeNumber(p.paidAmount ?? p.totalAmount ?? p.total);
      });

      // General Expenses within FY
      expenses.forEach((e: any) => {
        if (!inFY(e.date || e.createdAt)) return;
        const key = getChartKey(String(e.date || e.createdAt || ''));
        if (key && cData[key]) cData[key].expenses += toSafeNumber(e.amount);
      });

      Object.values(cData).forEach(entry => { entry.income = entry.pos + entry.paid_inv + entry.unpaid_inv + entry.partial_inv; });

      let formattedData = Object.values(cData);
      if (!hasChartValues(formattedData)) {
        if (activePeriod === 'Year') formattedData = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'].map(month => ({ day: month, income: 0, expenses: 0, pos: 0, paid_inv: 0, unpaid_inv: 0, partial_inv: 0 }));
        else if (activePeriod === 'Week') formattedData = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(d => ({ day: d, income: 0, expenses: 0, pos: 0, paid_inv: 0, unpaid_inv: 0, partial_inv: 0 }));
        else formattedData = Array.from({ length: 30 }, (_, i) => ({ day: `${i + 1}`, income: 0, expenses: 0, pos: 0, paid_inv: 0, unpaid_inv: 0, partial_inv: 0 }));
      }
      setChartData(formattedData);
    } catch (err) { logger.error('Error building chart data', err); }
    finally { setIsLoading(false); }
  }, [invoices, sales, purchases, expenses, activePeriod, companyConfig, selectedFinYear, inFY]);

  useEffect(() => { loadChartData(); }, [selectedFinYear]);

  const hasTransactions = revenueThisMonth > 0 || todaysCollection > 0 || receivables > 0;
  const fyName = selectedFinancialYear?.name || 'this Financial Year';

  return (
     <div className="animate-in fade-in slide-in-from-bottom-4 duration-700" style={{
       minHeight: '100vh', background: '#f3ede3', backgroundPosition: 'center top', backgroundRepeat: 'no-repeat', padding: isMobile ? '8px' : isTablet ? '16px' : '28px 32px 40px', fontFamily: "'Inter', -apple-system, sans-serif", color: '#1e293b', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-start', gap: isMobile ? 8 : 16,
     }}>
      <DashboardStyleInjector />
      <div style={{
        maxWidth: 1520, width: '100%', overflow: 'hidden', flex: 1,
      }}>
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: isMobile ? '20px 16px 0' : isTablet ? '24px 24px 0' : '28px 32px 0', flexWrap: 'wrap', gap: isMobile ? 16 : 24, marginBottom: isMobile ? 8 : 12,
        }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 12.5, fontWeight: 600, color: '#5c6567', letterSpacing: '0.02em' }}>{getGreeting()}, </span>
              <span style={{ fontSize: 12.5, fontWeight: 700, color: '#0b3e39' }}>Prime Printing</span>
              <div style={{ cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
                <ChevronDown size={16} color="#5b578c" style={{ transform: showCompanyMenu ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
              </div>
            </div>
             <div style={{ fontFamily: "'DM Serif Display', Georgia, serif", fontSize: 30, color: '#0b3e39', letterSpacing: '0.2px', lineHeight: 1.2, fontWeight: 400 }}>
               {format(new Date(), isMobile ? 'EEE, MMM d' : 'EEEE, MMMM d, yyyy')}
             </div>
              <div style={{ fontSize: 13, color: '#5c6567', fontWeight: 500 }}>Here's what's happening with your business today.</div>
            </div>
           <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
             {requestAnalytics && (() => {
               const reqs = requestAnalytics.requests || {};
               const pendingReview = (reqs.submitted || 0) + (reqs.assigned || 0) + (reqs.under_review || 0) + (reqs.waiting_for_customer || 0) + (reqs.ready_for_conversion || 0);
               if (pendingReview === 0) return null;
               return (
                 <button onClick={() => navigate('/sales-flow/requests')} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '6px 14px', borderRadius: 999, border: '1px solid #fecaca', background: '#fef2f2', color: '#b91c1c', fontSize: 12, fontWeight: 700, cursor: 'pointer', transition: 'all .15s ease', whiteSpace: 'nowrap' }} onMouseEnter={(e) => { e.currentTarget.style.background = '#fee2e2'; e.currentTarget.style.transform = 'translateY(-1px)'; }} onMouseLeave={(e) => { e.currentTarget.style.background = '#fef2f2'; e.currentTarget.style.transform = 'translateY(0)'; }}>
                   <Inbox size={14} /> Needs Attention: {pendingReview} request{pendingReview !== 1 ? 's' : ''} awaiting review <ArrowRight size={14} />
                 </button>
               );
             })()}
             <button onClick={() => navigate('/reports')} style={{
               background: 'linear-gradient(160deg, #3fa294, #0f544c)', color: '#fff', padding: '10px 20px', borderRadius: 999, border: 'none', fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, transition: 'all 0.2s ease', boxShadow: '0 1px 2px rgba(11,62,57,.15)', whiteSpace: 'nowrap',
             }} onMouseEnter={(e) => { e.currentTarget.style.boxShadow = '0 4px 12px rgba(11,62,57,.25)'; e.currentTarget.style.transform = 'translateY(-1px)'; }} onMouseLeave={(e) => { e.currentTarget.style.boxShadow = '0 1px 2px rgba(11,62,57,.15)'; e.currentTarget.style.transform = 'translateY(0)'; }}>
               {isMobile ? 'Reports' : 'View Detailed Reports'}
             </button>
           </div>
        </div>

        <div style={{
          display: 'grid', gridTemplateColumns: isDesktop ? '1fr 1.6fr' : '1fr', gap: isDesktop ? 24 : 20, marginBottom: isMobile ? 10 : 16, padding: isMobile ? '0 0 24px' : isTablet ? '0 0 32px' : '0 0 40px',
        }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: isMobile ? 12 : 24, minWidth: 0 }}>
            {!hasTransactions && (
              <div style={{ gridColumn: '1 / -1', background: 'linear-gradient(135deg, #f8fafc, #f1f5f9)', borderRadius: 16, padding: '16px 20px', border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: 12, fontSize: 13, color: '#64748b' }}>
                <CalendarDays size={20} style={{ color: '#94a3b8', flexShrink: 0 }} />
                <div><span style={{ fontWeight: 600, color: '#475569' }}>No transactions recorded for {fyName}.</span> {' '}Create your first transaction to see dashboard analytics.</div>
              </div>
            )}
            {widgets.find(w => w.id === 'info-card')?.visible !== false && <SlidingInfoCard slides={infoSlides} compact={isMobile} animDelay={8000} />}
            {widgets.find(w => w.id === 'collection')?.visible !== false && (
              <PremiumKpiCard title="Today's Collection" icon={<Clock size={isMobile ? 16 : 20} />} iconBg="rgba(16, 185, 129, 0.12)" iconColor="#10B981" accentColor="#10B981" compact={isMobile} animDelay={2000} onClick={() => navigate('/sales-flow/payments')}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', letterSpacing: '0.05em', textTransform: 'uppercase' }}>TODAY'S COLLECTION</div>
                    <div style={{ width: 32, height: 32, borderRadius: 8, background: '#ecfdf5', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#10b981', flexShrink: 0 }}><Clock size={16} /></div>
                  </div>
                  <KpiValueAnimator animDelay={2000}><div style={{ fontSize: 28, fontWeight: 800, color: '#059669', letterSpacing: '-0.02em', lineHeight: 1 }}>{formatShortCurrency(currency, todaysCollection)}</div></KpiValueAnimator>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ fontSize: 12, fontWeight: 500, color: '#64748b' }}>{collectionAccount || 'Cash + Mobile'}</div>
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 11, fontWeight: 700, color: collectionTrend >= 0 ? '#16a34a' : '#dc2626', backgroundColor: collectionTrend >= 0 ? '#f0fdf4' : '#fef2f2', padding: '2px 7px', borderRadius: 6, letterSpacing: '-0.01em' }}>
                      {collectionTrend >= 0 ? <TrendingUp size={10} /> : <TrendingDown size={10} />}{collectionTrend >= 0 ? '+' : ''}{collectionTrend.toFixed(1)}% vs yest
                    </div>
                  </div>
                  <div style={{ width: '100%', marginTop: 4, height: 48, minWidth: 0 }}>
                    <ResponsiveContainer width="100%" height={48} minHeight={48} minWidth={0}><AreaChart data={spark2}><Area type="monotone" dataKey="v" stroke="#10b981" fill="#10b981" fillOpacity={0.1} strokeWidth={2} isAnimationActive={false} dot={false} /></AreaChart></ResponsiveContainer>
                  </div>
                </div>
              </PremiumKpiCard>
            )}
            {widgets.find(w => w.id === 'revenue')?.visible !== false && (
              <PremiumKpiCard title="Revenue" icon={<DollarSign size={isMobile ? 16 : 20} />} iconBg="rgba(37, 99, 235, 0.12)" iconColor="#2563EB" accentColor="#2563EB" compact={isMobile} animDelay={4000} onClick={() => navigate('/sales-flow/invoices')}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', letterSpacing: '0.05em', textTransform: 'uppercase' }}>REVENUE</div>
                    <div style={{ width: 32, height: 32, borderRadius: 8, background: revenueThisMonth >= (companyConfig?.monthlyRevenueTarget || 50000) ? '#ecfdf5' : '#eef2ff', display: 'flex', alignItems: 'center', justifyContent: 'center', color: revenueThisMonth >= (companyConfig?.monthlyRevenueTarget || 50000) ? '#10b981' : '#4f46e5', flexShrink: 0, transition: 'all 0.3s ease' }}>
                      {revenueThisMonth >= (companyConfig?.monthlyRevenueTarget || 50000) ? <TrendingUp size={16} /> : <DollarSign size={16} />}
                    </div>
                  </div>
                  <KpiValueAnimator animDelay={4000}><div style={{ fontSize: 28, fontWeight: 800, color: '#0f172a', letterSpacing: '-0.02em', lineHeight: 1 }}>{formatShortCurrency(currency, revenueThisMonth)}</div></KpiValueAnimator>
                  <div style={{ position: 'relative', marginTop: 4 }}>
                    <div style={{ width: '100%', height: 6, backgroundColor: '#f1f5f9', borderRadius: 999, overflow: 'hidden' }}>
                      <div style={{ width: `${Math.max(2, Math.min(100, (revenueThisMonth / (companyConfig?.monthlyRevenueTarget || 50000)) * 100))}%`, height: '100%', backgroundColor: revenueThisMonth >= (companyConfig?.monthlyRevenueTarget || 50000) ? '#10b981' : '#4f46e5', borderRadius: 999, transition: 'width 1.5s cubic-bezier(0.34, 1.56, 0.64, 1)', boxShadow: revenueThisMonth >= (companyConfig?.monthlyRevenueTarget || 50000) ? '0 0 12px rgba(16, 185, 129, 0.4)' : '0 0 12px rgba(79, 70, 229, 0.3)' }} />
                    </div>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
                      <Calendar size={12} />
                      {(() => { const now = new Date(); const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate(); const remaining = lastDay - now.getDate(); return remaining === 0 ? 'Last day!' : `${remaining} days left`; })()}
                    </div>
                    <div style={{ fontSize: 11, color: '#64748b', fontWeight: 700 }}>Goal: <span style={{ color: '#0f172a' }}>{formatShortCurrency(currency, companyConfig?.monthlyRevenueTarget || 50000)}</span></div>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: -4 }}>
                    <div style={{ fontSize: 10, fontWeight: 800, color: revenueThisMonth >= (companyConfig?.monthlyRevenueTarget || 50000) ? '#059669' : '#4f46e5', backgroundColor: revenueThisMonth >= (companyConfig?.monthlyRevenueTarget || 50000) ? '#f0fdf4' : '#f5f3ff', padding: '2px 8px', borderRadius: 6, textTransform: 'uppercase', letterSpacing: '0.02em' }}>
                      {Math.round((revenueThisMonth / (companyConfig?.monthlyRevenueTarget || 50000)) * 100)}% {revenueThisMonth >= (companyConfig?.monthlyRevenueTarget || 50000) ? 'ACHIEVED' : 'COMPLETE'}
                    </div>
                    <div style={{ fontSize: 11, color: revenueTrend >= 0 ? '#16a34a' : '#dc2626', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 3 }}>
                      {revenueTrend >= 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}{revenueTrend >= 0 ? '+' : ''}{revenueTrend.toFixed(1)}%
                    </div>
                  </div>
                </div>
              </PremiumKpiCard>
            )}
            {widgets.find(w => w.id === 'unpaid')?.visible !== false && (
              <PremiumKpiCard title="Unpaid Invoices" icon={<FileText size={isMobile ? 16 : 20} />} iconBg="rgba(239, 68, 68, 0.1)" iconColor="#EF4444" accentColor="#EF4444" compact={isMobile} animDelay={6000} onClick={() => navigate('/sales-flow/invoices')}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', letterSpacing: '0.05em', textTransform: 'uppercase' }}>UNPAID INVOICES</div>
                    <div style={{ width: 32, height: 32, borderRadius: 8, background: '#fef2f2', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#dc2626', flexShrink: 0 }}><FileText size={16} /></div>
                  </div>
                  <KpiValueAnimator animDelay={6000}><div style={{ fontSize: 28, fontWeight: 800, color: '#dc2626', letterSpacing: '-0.02em', lineHeight: 1 }}>{formatShortCurrency(currency, receivables)}</div></KpiValueAnimator>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div style={{ fontSize: 12, fontWeight: 500, color: '#64748b', maxWidth: '100px', lineHeight: 1.25 }}>
                      {overdueCount + (invoices.filter(i => i.status === 'Unpaid' || i.status === 'Partial').length - overdueCount)} outstanding invoices
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
                      <div style={{ fontSize: 13, fontWeight: 800, color: '#16a34a', display: 'flex', alignItems: 'center', gap: 2 }}>↑ {formatShortCurrency(currency, receivables)}</div>
                      <div style={{ fontSize: 10, fontWeight: 700, color: '#b45309', backgroundColor: '#fffbeb', padding: '1px 6px', borderRadius: 6, textTransform: 'lowercase' }}>new</div>
                    </div>
                  </div>
                  <div style={{ height: '1px', backgroundColor: 'rgba(0,0,0,0.06)', width: '100%' }} />
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ fontSize: 12, color: '#1e293b', fontWeight: 500 }}>{lastUnpaidInvoice ? (lastUnpaidInvoice.clientName || lastUnpaidInvoice.customerName) : 'No high debt'}</div>
                    <div style={{ fontSize: 12, color: '#dc2626', fontWeight: 600 }}>{formatShortCurrency(currency, lastUnpaidInvoice ? (toSafeNumber(lastUnpaidInvoice.totalAmount) - toSafeNumber(lastUnpaidInvoice.paidAmount)) : 0)}</div>
                    <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 500 }}>{lastUnpaidInvoice ? format(new Date(lastUnpaidInvoice.date || lastUnpaidInvoice.createdAt), 'MMM d') : '—'}</div>
                  </div>
                </div>
              </PremiumKpiCard>
            )}
          </div>

          {widgets.find(w => w.id === 'chart')?.visible !== false && (
             <div style={{
               background: '#FEFDFB', border: '1px solid #e4ddd1', borderRadius: 14, padding: isMobile ? '20px' : '28px', boxShadow: '0 1px 2px rgba(11,62,57,.04)', display: 'flex', flexDirection: 'column', minWidth: 0, height: '100%',
             }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: isMobile ? 16 : 24, flexWrap: 'wrap', gap: 8 }}>
                <div>
                  <h3 style={{ fontSize: isMobile ? 18 : 20, fontWeight: 800, color: '#2e2a5d', margin: 0, letterSpacing: '-0.02em' }}>Financial performance</h3>
                  {!isMobile && <div style={{ fontSize: 13, color: '#5b578c', fontWeight: 500, marginTop: 3 }}>Revenue & Expenditures</div>}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? 8 : 12, flexWrap: 'wrap' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}><div style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: '#16a34a' }} /><span style={{ fontSize: 10, fontWeight: 600, color: '#5b578c' }}>Income</span></div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}><div style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: '#dc2626' }} /><span style={{ fontSize: 10, fontWeight: 600, color: '#5b578c' }}>Expenses</span></div>
                  {!isMobile && <div style={{ marginLeft: 4 }}><PeriodDropdown value={activePeriod} onChange={setActivePeriod} /></div>}
                </div>
              </div>
              <div style={{ width: '100%', flex: 1, minWidth: 0, minHeight: 150, overflow: 'hidden' }}>
                {chartData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={150}>
                    <AreaChart data={chartData} margin={{ top: 8, right: isMobile ? 4 : 16, left: isMobile ? -24 : -8, bottom: -8 }}>
                      <defs>
                        <linearGradient id="gradIncome" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#16a34a" stopOpacity={0.6} /><stop offset="60%" stopColor="#22c55e" stopOpacity={0.15} /><stop offset="100%" stopColor="#bbf7d0" stopOpacity={0} /></linearGradient>
                        <linearGradient id="gradExpenses" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#dc2626" stopOpacity={0.3} /><stop offset="100%" stopColor="#fecaca" stopOpacity={0} /></linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="4 4" vertical={false} stroke="rgba(148,163,184,0.18)" />
                      <XAxis dataKey="day" axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: isMobile ? 10 : 11, fontWeight: 500 }} dy={4} interval="preserveStartEnd" />
                      <YAxis domain={[0, 'auto']} axisLine={false} tickLine={false} tick={{ fill: '#cbd5e1', fontSize: isMobile ? 10 : 11, fontWeight: 500 }} tickFormatter={(val) => { if (val === 0) return '0'; if (val >= 1000000) return `${(val / 1000000).toFixed(1)}M`; if (val >= 1000) return `${(val / 1000).toFixed(0)}k`; return String(val); }} dx={-4} width={isMobile ? 36 : 48} />
                      <Tooltip contentStyle={{ borderRadius: 12, border: 'none', boxShadow: '0 8px 32px rgba(31,38,135,0.25)', fontSize: isMobile ? 12 : 14, padding: isMobile ? '10px 14px' : '14px 20px', background: '#5b578c', color: '#ffffff' }} labelStyle={{ fontWeight: 600, color: '#e0e7ff', marginBottom: 6, fontSize: 12 }} itemStyle={{ fontWeight: 800, color: '#ffffff', fontVariantNumeric: 'tabular-nums', padding: '2px 0' }} cursor={{ stroke: 'rgba(79,70,229,0.3)', strokeWidth: 1.5, strokeDasharray: '4 4' }} />
                      <Area type="monotone" dataKey="income" name="Income" stroke="#16a34a" strokeWidth={2} fillOpacity={1} fill="url(#gradIncome)" dot={false} activeDot={{ r: 5, fill: '#ffffff', stroke: '#16a34a', strokeWidth: 2 }} />
                      <Area type="monotone" dataKey="expenses" name="Expenses" stroke="#dc2626" strokeWidth={2} fillOpacity={1} fill="url(#gradExpenses)" dot={false} activeDot={{ r: 5, fill: '#ffffff', stroke: '#dc2626', strokeWidth: 2 }} />
                    </AreaChart>
                  </ResponsiveContainer>
                ) : (
                  <div style={{ height: '100%', minHeight: 150, display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center', color: '#94a3b8', fontSize: isMobile ? 12 : 13, fontWeight: 600, border: '1px dashed rgba(148,163,184,0.28)', borderRadius: 18, background: 'rgba(248,250,252,0.7)', padding: '16px 20px' }}>
                    {hasTransactions ? 'No financial activity is available for the selected period yet.' : `No transactions have been recorded for Financial Year ${fyName}.`}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {widgets.find(w => w.id === 'requests')?.visible !== false && requestAnalytics && (
        <div style={{
          background: '#FEFDFB', border: '1px solid #e4ddd1', borderRadius: 14,
          boxShadow: '0 1px 2px rgba(11,62,57,.04)', padding: isMobile ? '18px' : '22px 24px',
          marginBottom: isMobile ? 16 : 24, overflow: 'hidden',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
            <div>
              <h3 style={{ fontSize: isMobile ? 16 : 18, fontWeight: 800, color: '#0b3e39', margin: 0, letterSpacing: '-0.01em' }}>Sales Request Pipeline</h3>
              <div style={{ fontSize: 12.5, color: '#5c6567', fontWeight: 500, marginTop: 2 }}>
                Customer requests → official quotations → sales orders
              </div>
            </div>
            <button onClick={() => navigate('/sales-flow/requests')} style={{
              background: 'linear-gradient(160deg, #3fa294, #0f544c)', color: '#fff', padding: '8px 16px', borderRadius: 999, border: 'none', fontSize: 12, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, boxShadow: '0 1px 2px rgba(11,62,57,.15)', transition: 'all .2s ease', whiteSpace: 'nowrap',
            }} onMouseEnter={(e) => { e.currentTarget.style.boxShadow = '0 4px 12px rgba(11,62,57,.25)'; e.currentTarget.style.transform = 'translateY(-1px)'; }} onMouseLeave={(e) => { e.currentTarget.style.boxShadow = '0 1px 2px rgba(11,62,57,.15)'; e.currentTarget.style.transform = 'translateY(0)'; }}>
              Open Requests <ArrowRight size={13} />
            </button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(auto-fit, minmax(130px, 1fr))' : 'repeat(5, 1fr)', gap: 14 }}>
            {[
              { label: 'Total Requests', value: requestAnalytics.totalRequests || 0, sub: 'all time', accent: '#0f544c', icon: FileText, iconBg: '#eef7f6' },
              { label: 'Pending Review', value: (requestAnalytics.requests?.submitted || 0) + (requestAnalytics.requests?.assigned || 0) + (requestAnalytics.requests?.under_review || 0) + (requestAnalytics.requests?.waiting_for_customer || 0) + (requestAnalytics.requests?.ready_for_conversion || 0), sub: 'in inbox', accent: '#b45309', icon: Clock, iconBg: '#fbead0' },
              { label: 'Quotations Issued', value: requestAnalytics.totalQuotations || 0, sub: `${requestAnalytics.acceptedQuotations || 0} accepted`, accent: '#2563EB', icon: FileText, iconBg: '#eff6ff' },
              { label: 'Converted to Orders', value: requestAnalytics.convertedQuotations || 0, sub: `${requestAnalytics.conversionRate || 0}% conversion`, accent: '#059669', icon: Check, iconBg: '#ecfdf5' },
              { label: 'Downloads', value: requestAnalytics.totalDownloads || 0, sub: `${requestAnalytics.uniqueDownloads || 0} unique docs`, accent: '#7c3aed', icon: Download, iconBg: '#f5f3ff' },
            ].map((item) => (
              <div key={item.label} style={{ background: '#FEFDFB', border: '1.4px solid #e4ddd1', borderLeft: `4px solid ${item.accent}`, boxShadow: '0 1px 3px rgba(0,0,0,.04)', borderRadius: 14, padding: '14px 16px', display: 'flex', alignItems: 'flex-start', gap: 14, minWidth: 0 }}>
                <div style={{ padding: 10, borderRadius: 10, background: item.iconBg, color: item.accent, display: 'inline-flex', flexShrink: 0 }}><item.icon size={18} /></div>
                <div style={{ minWidth: 0 }}>
                  <p style={{ fontSize: 10, fontWeight: 700, color: '#5c6567', textTransform: 'uppercase', letterSpacing: 0.08, margin: '0 0 6px' }}>{item.label}</p>
                  <p style={{ fontSize: 18, fontWeight: 700, color: item.accent, margin: 0, fontFamily: "'JetBrains Mono', monospace", letterSpacing: -0.2 }}>{item.value}</p>
                  <p style={{ fontSize: 10.5, fontWeight: 600, color: '#5c6567', marginTop: 4 }}>{item.sub}</p>
                </div>
              </div>
            ))}
          </div>
          {requestAnalytics.avgReviewMinutes > 0 && (
            <div style={{ fontSize: 11.5, color: '#5c6567', marginTop: 12, fontWeight: 600 }}>
              Average review time: <b style={{ color: '#0b3e39' }}>{requestAnalytics.avgReviewMinutes} min</b>
            </div>
          )}
        </div>
      )}

      <WhatsAppMarketingModal open={isWhatsAppModalOpen} onOpenChange={setIsWhatsAppModalOpen} companyName={companyConfig?.companyName || 'Prime ERP'} />
      <ConfirmDialog open={confirmState.open} onOpenChange={(open) => !open && setConfirmState(c => ({ ...c, open: false }))} onConfirm={() => { confirmState.onConfirm?.(); setConfirmState(c => ({ ...c, open: false })); }} onCancel={() => setConfirmState(c => ({ ...c, open: false }))} title={confirmState.title} message={confirmState.message} confirmText={confirmState.confirmText} type={confirmState.type || 'question'} />
    </div>
  );
};

const Dashboard: React.FC = () => (<DashboardContent />);
export default Dashboard;