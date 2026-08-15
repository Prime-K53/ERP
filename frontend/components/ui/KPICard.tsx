import React, { useEffect, useState } from 'react';
import { motion, useMotionValue, animate } from 'framer-motion';
import { TrendingUp, TrendingDown, Minus, Sparkles } from 'lucide-react';

interface KPICardProps {
  title: string;
  value: string | number;
  prefix?: string;
  suffix?: string;
  trend?: { value: number; direction: 'up' | 'down' | 'neutral'; label?: string };
  icon?: React.ReactNode;
  variant?: 'default' | 'success' | 'warning' | 'danger';
  sparklineData?: number[];
  insight?: string;
  onClick?: () => void;
}

const variantColors: Record<string, { bg: string; text: string; ring: string }> = {
  default: { bg: 'rgba(99,102,241,0.1)', text: '#6366f1', ring: 'rgba(99,102,241,0.2)' },
  success: { bg: 'rgba(22,163,74,0.1)', text: '#16a34a', ring: 'rgba(22,163,74,0.2)' },
  warning: { bg: 'rgba(245,158,11,0.1)', text: '#d97706', ring: 'rgba(245,158,11,0.2)' },
  danger: { bg: 'rgba(220,38,38,0.1)', text: '#dc2626', ring: 'rgba(220,38,38,0.2)' },
};

function AnimatedNumber({ value, prefix, suffix, duration = 1 }: { value: number; prefix?: string; suffix?: string; duration?: number }) {
  const motionValue = useMotionValue(0);
  const [display, setDisplay] = useState('0');

  useEffect(() => {
    const controls = animate(motionValue, value, {
      duration,
      ease: 'easeOut',
      onUpdate: (latest) => {
        const formatted = Number.isInteger(value) ? Math.round(latest).toString() : latest.toFixed(2);
        setDisplay(formatted);
      },
    });
    return controls.stop;
  }, [value, motionValue, duration]);

  return <>{prefix}{display}{suffix}</>;
}

const Sparkline: React.FC<{ data: number[] }> = ({ data }) => {
  if (!data || data.length < 2) return null;

  const width = 80;
  const height = 28;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;

  const points = data.map((d, i) => {
    const x = (i / (data.length - 1)) * width;
    const y = height - ((d - min) / range) * height;
    return `${x},${y}`;
  }).join(' ');

  const trendUp = data[data.length - 1] >= data[0];

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ flexShrink: 0 }}>
      <polyline
        points={points}
        fill="none"
        stroke={trendUp ? '#16a34a' : '#dc2626'}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
};

const KPICard: React.FC<KPICardProps> = ({
  title,
  value,
  prefix,
  suffix,
  trend,
  icon,
  variant = 'default',
  sparklineData,
  insight,
  onClick,
}) => {
  const [isHovered, setIsHovered] = useState(false);
  const colors = variantColors[variant];

  const numericValue = typeof value === 'string' ? parseFloat(value.replace(/[^0-9.\-]/g, '')) || 0 : value;

  const TrendIcon = trend?.direction === 'up' ? TrendingUp : trend?.direction === 'down' ? TrendingDown : Minus;
  const trendColor = trend?.direction === 'up' ? '#16a34a' : trend?.direction === 'down' ? '#dc2626' : '#64748b';

  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{
        fontFamily: "'Inter', system-ui, sans-serif",
        backgroundColor: '#ffffff',
        borderRadius: 12,
        padding: 20,
        boxShadow: isHovered
          ? '0 8px 25px rgba(0,0,0,0.08), 0 4px 10px rgba(0,0,0,0.04)'
          : '0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)',
        border: '1px solid #e2e8f0',
        cursor: onClick ? 'pointer' : 'default',
        transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
        transform: isHovered ? 'translateY(-2px)' : 'translateY(0)',
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {icon && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 36,
                height: 36,
                borderRadius: 10,
                backgroundColor: colors.bg,
                color: colors.text,
                flexShrink: 0,
              }}
            >
              {icon}
            </div>
          )}
          <span style={{ fontSize: 12, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
            {title}
          </span>
        </div>
        {sparklineData && <Sparkline data={sparklineData} />}
      </div>

      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <motion.span
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: 'easeOut' }}
          style={{ fontSize: 28, fontWeight: 700, color: '#0f172a', lineHeight: 1.1, fontVariantNumeric: 'tabular-nums' }}
        >
          <AnimatedNumber value={numericValue} prefix={prefix} suffix={suffix} />
        </motion.span>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        {trend && (
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 6px', borderRadius: 6, backgroundColor: trendColor === '#64748b' ? 'rgba(100,116,139,0.08)' : 'rgba(22,163,74,0.08)', fontSize: 11, fontWeight: 600 }}>
            <TrendIcon size={12} style={{ color: trendColor }} />
            <span style={{ color: trendColor }}>{trend.value}%</span>
            {trend.label && <span style={{ color: '#64748b', fontWeight: 400 }}>{trend.label}</span>}
          </div>
        )}
        {insight && (
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 3, padding: '2px 6px', borderRadius: 6, backgroundColor: 'rgba(99,102,241,0.08)', fontSize: 11, fontWeight: 500, color: '#6366f1' }}>
            <Sparkles size={11} />
            {insight}
          </div>
        )}
      </div>
    </div>
  );
};

export default KPICard;
