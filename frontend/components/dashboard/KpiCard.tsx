/**
 * Premium KPI Card component
 * Title (small, muted), Value (large, bold), Trend indicator, Optional sparkline
 */
import React, { memo, useMemo } from 'react';
import { ArrowUpRight, ArrowDownRight } from 'lucide-react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
} from 'recharts';
import { SEMANTIC_COLORS, SHADOWS, RADIUS } from '../../styles/designTokens';

export type TrendDirection = 'up' | 'down' | 'neutral';

export interface SparklineDataPoint {
  value: number;
}

export interface KpiCardProps {
  title: string;
  value: string;
  trendDirection?: TrendDirection;
  trendValue?: string;
  accentColor?: string;
  sparklineData?: SparklineDataPoint[];
  sparklineColor?: string;
  icon?: React.ReactNode;
  className?: string;
}

// Stable style objects - defined outside to prevent recreation
const CARD_STYLE: React.CSSProperties = {
  backgroundColor: '#FFFFFF',
  borderRadius: RADIUS.lg,
  boxShadow: SHADOWS.card,
  padding: '20px 24px',
  transition: 'box-shadow 0.2s ease',
  height: '100%',
  display: 'flex',
  flexDirection: 'column',
  justifyContent: 'space-between',
};

const TITLE_STYLE: React.CSSProperties = {
  fontSize: '13px',
  fontWeight: 500,
  color: SEMANTIC_COLORS.textSecondary,
  margin: 0,
  marginBottom: '8px',
  letterSpacing: '-0.01em',
};

const VALUE_STYLE: React.CSSProperties = {
  fontSize: '28px',
  fontWeight: 700,
  color: SEMANTIC_COLORS.textPrimary,
  lineHeight: 1.2,
  letterSpacing: '-0.02em',
};

const TREND_CONTAINER_STYLE: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '4px',
  marginTop: '12px',
};

const TREND_BADGE_BASE: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '2px',
  padding: '2px 8px',
  borderRadius: RADIUS.sm,
  fontSize: '12px',
  fontWeight: 600,
};

const SPARKLINE_CONTAINER_STYLE: React.CSSProperties = {
  position: 'absolute' as const,
  bottom: 0,
  right: 16,
  width: '80px',
  height: '32px',
};

/**
 * Sparkline component - memoized with disabled animation for stability
 */
const Sparkline: React.FC<{
  data: SparklineDataPoint[];
  color: string;
}> = memo(({ data, color }) => {
  const memoizedData = useMemo(() => data, [data]);
  // Stable color reference
  const strokeColor = color;

  if (memoizedData.length === 0) return null;

  return (
    <div style={SPARKLINE_CONTAINER_STYLE}>
      <ResponsiveContainer width="100%" height={32} minWidth={0} minHeight={32}>
        <LineChart data={memoizedData}>
          <Line
            type="monotone"
            dataKey="value"
            stroke={strokeColor}
            strokeWidth={1.5}
            dot={false}
            isAnimationActive={true}
            animationBegin={5000}
            animationDuration={2000}
            animationEasing="ease-in-out"
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
});

Sparkline.displayName = 'Sparkline';

/**
 * KPI Card component - memoized for performance
 */
const KpiCardComponent: React.FC<KpiCardProps> = memo(({
  title,
  value,
  trendDirection = 'neutral',
  trendValue,
  accentColor = SEMANTIC_COLORS.textPrimary,
  sparklineData,
  sparklineColor = '#4F46E5',
  icon,
  className = '',
}) => {
  // Memoized accent indicator style
  const accentStyle: React.CSSProperties = useMemo(() => ({
    width: '4px',
    height: '100%',
    position: 'absolute',
    left: 0,
    top: 0,
    borderRadius: RADIUS.lg,
    backgroundColor: accentColor,
    opacity: 0.8,
  }), [accentColor]);

  // Trend badge styles based on direction
  const trendBadgeStyle: React.CSSProperties = useMemo(() => {
    const base = { ...TREND_BADGE_BASE };
    switch (trendDirection) {
      case 'up':
        base.backgroundColor = `${SEMANTIC_COLORS.income}15`;
        base.color = SEMANTIC_COLORS.income;
        break;
      case 'down':
        base.backgroundColor = `${SEMANTIC_COLORS.expenditure}15`;
        base.color = SEMANTIC_COLORS.expenditure;
        break;
      default:
        base.backgroundColor = `${SEMANTIC_COLORS.neutral}15`;
        base.color = SEMANTIC_COLORS.neutral;
    }
    return base;
  }, [trendDirection]);

  const hasTrendInfo = trendValue && trendDirection !== 'neutral';

  // Stable key for sparkline to prevent unnecessary remounts
  const sparklineKey = `sparkline-${title}`;

  return (
    <div className={className} style={{ ...CARD_STYLE, position: 'relative' }}>
      {/* Left accent bar */}
      <div style={accentStyle} />
      
      <div style={{ flex: 1 }}>
        {/* Title */}
        <h3 style={TITLE_STYLE}>{title}</h3>
        
        {/* Value */}
        <div style={{ ...VALUE_STYLE, color: accentColor }}>
          {value}
        </div>
        
        {/* Trend */}
        {hasTrendInfo && (
          <div style={TREND_CONTAINER_STYLE}>
            <span style={trendBadgeStyle}>
              {trendDirection === 'up' && <ArrowUpRight size={12} />}
              {trendDirection === 'down' && <ArrowDownRight size={12} />}
              {trendValue}
            </span>
            <span style={{ fontSize: '11px', color: SEMANTIC_COLORS.textMuted }}>
              vs last period
            </span>
          </div>
        )}
      </div>
      
      {/* Sparkline */}
      {sparklineData && sparklineData.length > 0 && (
        <Sparkline
          key={sparklineKey}
          data={sparklineData}
          color={sparklineColor}
        />
      )}
    </div>
  );
});

KpiCardComponent.displayName = 'KpiCard';

export default KpiCardComponent;
