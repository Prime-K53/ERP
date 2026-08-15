import React from 'react';
import { Loader2 } from 'lucide-react';

interface ButtonProps {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'glass';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  icon?: React.ReactNode;
  iconPosition?: 'left' | 'right';
  fullWidth?: boolean;
  children?: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
  type?: 'button' | 'submit';
}

const sizeMap: Record<string, { height: string; padding: string; fontSize: string; gap: string }> = {
  sm: { height: '32px', padding: '0 12px', fontSize: '12px', gap: '6px' },
  md: { height: '40px', padding: '0 20px', fontSize: '14px', gap: '8px' },
  lg: { height: '48px', padding: '0 28px', fontSize: '15px', gap: '10px' },
};

const variantStyles: Record<string, React.CSSProperties> = {
  primary: {
    background: 'linear-gradient(135deg, #6366f1, #4f46e5)',
    color: '#ffffff',
    border: 'none',
    boxShadow: '0 1px 3px rgba(99,102,241,0.3)',
  },
  secondary: {
    backgroundColor: '#ffffff',
    color: '#0f172a',
    border: '1px solid #e2e8f0',
    boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
  },
  ghost: {
    backgroundColor: 'transparent',
    color: '#64748b',
    border: 'none',
  },
  danger: {
    backgroundColor: '#dc2626',
    color: '#ffffff',
    border: 'none',
    boxShadow: '0 1px 3px rgba(220,38,38,0.3)',
  },
  glass: {
    backgroundColor: 'rgba(255,255,255,0.15)',
    backdropFilter: 'blur(12px) saturate(180%)',
    WebkitBackdropFilter: 'blur(12px) saturate(180%)',
    color: '#ffffff',
    border: '1px solid rgba(255,255,255,0.2)',
  },
};

const Button: React.FC<ButtonProps> = ({
  variant = 'primary',
  size = 'md',
  loading = false,
  icon,
  iconPosition = 'left',
  fullWidth = false,
  children,
  onClick,
  disabled = false,
  className = '',
  type = 'button',
}) => {
  const sizeStyle = sizeMap[size];

  const baseStyle: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: sizeStyle.gap,
    height: sizeStyle.height,
    padding: sizeStyle.padding,
    fontSize: sizeStyle.fontSize,
    fontFamily: "'Inter', system-ui, sans-serif",
    fontWeight: 600,
    borderRadius: '6px',
    cursor: disabled || loading ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.5 : 1,
    width: fullWidth ? '100%' : undefined,
    transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
    outline: 'none',
    userSelect: 'none' as const,
    position: 'relative' as const,
    overflow: 'hidden',
    ...variantStyles[variant],
  };

  const [focusRing, setFocusRing] = React.useState(false);

  const handleFocus = () => setFocusRing(true);
  const handleBlur = () => setFocusRing(false);

  const content = (
    <>
      {loading && (
        <Loader2 size={size === 'sm' ? 14 : size === 'lg' ? 20 : 16} style={{ animation: 'spin 0.8s linear infinite' }} />
      )}
      {!loading && icon && iconPosition === 'left' && icon}
      {children}
      {!loading && icon && iconPosition === 'right' && icon}
    </>
  );

  return (
    <>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      <button
        type={type}
        style={{
          ...baseStyle,
          boxShadow: focusRing ? `0 0 0 3px rgba(99,102,241,0.25), ${baseStyle.boxShadow || ''}` : baseStyle.boxShadow,
        }}
        className={className}
        onClick={onClick}
        disabled={disabled || loading}
        onFocus={handleFocus}
        onBlur={handleBlur}
        onMouseEnter={(e) => {
          if (!disabled && !loading && variant !== 'ghost' && variant !== 'glass') {
            e.currentTarget.style.transform = 'translateY(-1px)';
            if (variant === 'primary') e.currentTarget.style.boxShadow = '0 4px 12px rgba(99,102,241,0.4)';
            if (variant === 'secondary') e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.08)';
            if (variant === 'danger') e.currentTarget.style.boxShadow = '0 4px 12px rgba(220,38,38,0.4)';
          }
        }}
        onMouseLeave={(e) => {
          if (!disabled && !loading) {
            e.currentTarget.style.transform = 'translateY(0)';
            e.currentTarget.style.boxShadow = variantStyles[variant].boxShadow || '';
          }
        }}
        onMouseDown={(e) => {
          if (!disabled && !loading) {
            e.currentTarget.style.transform = 'translateY(0) scale(0.98)';
          }
        }}
        onMouseUp={(e) => {
          if (!disabled && !loading) {
            e.currentTarget.style.transform = 'translateY(-1px)';
          }
        }}
      >
        {content}
      </button>
    </>
  );
};

export default Button;
