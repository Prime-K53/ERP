import React from 'react';
import { TrendingUp, TrendingDown, ArrowUpRight, ChevronRight } from 'lucide-react';

interface PremiumKPICardProps {
  label: string;
  value: string | number;
  icon: React.ElementType;
  sublabel?: string;
  sublabelColor?: string;
  /** Trend hint: higher-is-better percentage with a positive/negative arrow. */
  trend?: { value: number; positive: boolean; suffix?: string };
  gradient: string;
  glowColor: string;
  onClick?: () => void;
  badge?: string;
  badgeColor?: string;
  lightBg?: string;
  iconBg?: string;
}

const PremiumKPICard: React.FC<PremiumKPICardProps> = ({
  label,
  value,
  icon: Icon,
  sublabel,
  sublabelColor,
  trend,
  gradient,
  glowColor,
  onClick,
  badge,
  badgeColor,
  lightBg,
  iconBg,
}) => {
  const bgColor = lightBg || '#fff';
  const iconBackground = iconBg || gradient;

  return (
    <div
      onClick={onClick}
      className="pkpi-card"
      style={{
        position: 'relative',
        borderRadius: 16,
        padding: '14px 14px 12px',
        background: bgColor,
        cursor: onClick ? 'pointer' : 'default',
        border: '1px solid #E8EDF5',
        boxShadow: '0 1px 4px rgba(15,23,42,.04)',
        transition: 'transform .18s ease, box-shadow .18s ease, border-color .18s ease',
        minHeight: 110,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        overflow: 'hidden',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = 'translateY(-2px)';
        e.currentTarget.style.boxShadow = '0 8px 20px -8px rgba(15,44,89,.12)';
        e.currentTarget.style.borderColor = '#D8E0F0';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = 'translateY(0)';
        e.currentTarget.style.boxShadow = '0 1px 4px rgba(15,23,42,.04)';
        e.currentTarget.style.borderColor = '#E8EDF5';
      }}
    >
      {/* Top row: icon + chevron */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div
          className="pkpi-icon"
          style={{
            width: 36, height: 36, borderRadius: 11,
            background: iconBackground,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#fff',
            boxShadow: '0 4px 12px -4px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.2)',
            transition: 'transform .2s ease, box-shadow .2s ease',
          }}
        >
          <Icon size={18} strokeWidth={2} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
          {badge && (
            <span style={{
              fontSize: 9, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase',
              padding: '3px 8px', borderRadius: 6,
              background: badgeColor ? `${badgeColor}1A` : 'rgba(100,116,139,0.12)',
              color: badgeColor || '#64748B',
              whiteSpace: 'nowrap',
            }}>
              {badge}
            </span>
          )}
          {onClick && (
            <ChevronRight size={18} color="#CBD5E0" style={{ flexShrink: 0 }} />
          )}
        </div>
      </div>

      {/* Bottom content */}
      <div style={{ marginTop: 12 }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: '#64748B', marginBottom: 4, letterSpacing: '0.01em' }}>
          {label}
        </div>
        <div style={{ fontSize: 18, fontWeight: 800, color: '#0F172A', lineHeight: 1.2, fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em', fontFamily: "'Inter', sans-serif" }}>
          {value}
        </div>
        {sublabel && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 600, color: sublabelColor || '#94A3B8', marginTop: 6 }}>
            {sublabel}
          </div>
        )}
        {trend && (
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 6, fontSize: 10.5, fontWeight: 700 }}>
            {trend.positive ? (
              <TrendingUp size={12} color="#059669" />
            ) : (
              <TrendingDown size={12} color="#DC2626" />
            )}
            <span style={{ color: trend.positive ? '#047857' : '#DC2626' }}>
              {Math.round(Number(trend.value) || 0)}%
            </span>
            {trend.suffix && <span style={{ color: '#94A3B8', fontWeight: 600 }}>{trend.suffix}</span>}
          </div>
        )}
      </div>

      <style>{`
        .pkpi-card:hover .pkpi-icon {
          transform: translateY(-2px) scale(1.05);
          box-shadow: 0 8px 20px -6px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.25);
        }
      `}</style>
    </div>
  );
};

export default PremiumKPICard;