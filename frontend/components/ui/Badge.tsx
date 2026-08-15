import React from 'react';

interface BadgeProps {
  variant?: 'default' | 'success' | 'warning' | 'danger' | 'info' | 'neutral';
  size?: 'sm' | 'md';
  dot?: boolean;
  children: React.ReactNode;
  className?: string;
}

const colorMap: Record<string, { bg: string; text: string; dot: string }> = {
  default: { bg: 'rgba(99,102,241,0.1)', text: '#6366f1', dot: '#6366f1' },
  success: { bg: 'rgba(22,163,74,0.1)', text: '#16a34a', dot: '#16a34a' },
  warning: { bg: 'rgba(245,158,11,0.1)', text: '#d97706', dot: '#f59e0b' },
  danger: { bg: 'rgba(220,38,38,0.1)', text: '#dc2626', dot: '#dc2626' },
  info: { bg: 'rgba(59,130,246,0.1)', text: '#3b82f6', dot: '#3b82f6' },
  neutral: { bg: 'rgba(100,116,139,0.1)', text: '#64748b', dot: '#64748b' },
};

const sizeMap: Record<string, { height: string; padding: string; fontSize: string; gap: string }> = {
  sm: { height: '20px', padding: '0 8px', fontSize: '11px', gap: '4px' },
  md: { height: '24px', padding: '0 10px', fontSize: '12px', gap: '5px' },
};

const Badge: React.FC<BadgeProps> = ({
  variant = 'default',
  size = 'md',
  dot = false,
  children,
  className = '',
}) => {
  const colors = colorMap[variant];
  const sizeStyle = sizeMap[size];

  return (
    <span
      className={className}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: sizeStyle.gap,
        height: sizeStyle.height,
        padding: sizeStyle.padding,
        fontSize: sizeStyle.fontSize,
        fontWeight: 600,
        fontFamily: "'Inter', system-ui, sans-serif",
        color: colors.text,
        backgroundColor: colors.bg,
        borderRadius: '999px',
        whiteSpace: 'nowrap',
        boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
      }}
    >
      {dot && (
        <span
          style={{
            width: size === 'sm' ? '5px' : '6px',
            height: size === 'sm' ? '5px' : '6px',
            borderRadius: '50%',
            backgroundColor: colors.dot,
            flexShrink: 0,
          }}
        />
      )}
      {children}
    </span>
  );
};

export default Badge;
