import React from 'react';
import { portalTheme } from '../constants';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

interface Props {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  loading?: boolean;
  variant?: ButtonVariant;
  size?: 'sm' | 'md' | 'lg';
  icon?: React.ElementType;
  className?: string;
  style?: React.CSSProperties;
  type?: 'button' | 'submit' | 'reset';
}

const PortalButton: React.FC<Props> = ({
  children,
  onClick,
  disabled = false,
  loading = false,
  variant = 'primary',
  size = 'md',
  icon: Icon,
  className = '',
  style,
  type = 'button',
}) => {
  const baseStyle: React.CSSProperties = {
    fontFamily: "'Inter', sans-serif",
    fontWeight: 600,
    borderRadius: 12,
    cursor: disabled || loading ? 'not-allowed' : 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    transition: 'all 200ms cubic-bezier(0.4, 0, 0.2, 1)',
    opacity: disabled || loading ? 0.6 : 1,
    position: 'relative',
  };

  const sizeStyles: Record<string, React.CSSProperties> = {
    sm: { padding: '6px 14px', fontSize: 12, height: 36, minHeight: 36 },
    md: { padding: '9px 18px', fontSize: 13, height: 42, minHeight: 42 },
    lg: { padding: '12px 24px', fontSize: 14, height: 48, minHeight: 48 },
  };

  const variantStyles: Record<ButtonVariant, React.CSSProperties> = {
    primary: {
      background: 'linear-gradient(135deg, #146b60 0%, #0f544c 100%)',
      color: '#fff',
      border: '1px solid rgba(255, 255, 255, 0.15)',
      boxShadow: '0 4px 14px -2px rgba(15, 84, 76, 0.4)',
    },
    secondary: {
      background: 'rgba(255, 255, 255, 0.9)',
      color: '#0b3e39',
      border: '1px solid rgba(203, 213, 225, 0.8)',
      boxShadow: '0 1px 3px rgba(15, 23, 42, 0.04)',
    },
    ghost: {
      background: 'transparent',
      color: '#146b60',
      border: '1px solid transparent',
      boxShadow: 'none',
    },
    danger: {
      background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
      color: '#fff',
      border: '1px solid rgba(255, 255, 255, 0.15)',
      boxShadow: '0 4px 14px -2px rgba(220, 38, 38, 0.4)',
    },
  };

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled || loading}
      className={`btn-press ${className}`}
      style={{ ...baseStyle, ...sizeStyles[size], ...variantStyles[variant], ...style }}
    >
      {loading && (
        <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin shrink-0" />
      )}
      {!loading && Icon && <Icon size={size === 'sm' ? 14 : 16} className="shrink-0" />}
      <span>{children}</span>
    </button>
  );
};

export default PortalButton;
