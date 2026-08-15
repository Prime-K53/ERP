import React from 'react';

interface CardProps {
  variant?: 'default' | 'glass' | 'gradient' | 'bordered';
  padding?: 'none' | 'sm' | 'md' | 'lg';
  hover?: boolean;
  className?: string;
  children: React.ReactNode;
  onClick?: () => void;
}

const paddingMap = {
  none: '0px',
  sm: '12px',
  md: '20px',
  lg: '28px',
};

const variantStyles: Record<string, React.CSSProperties> = {
  default: {
    backgroundColor: '#ffffff',
    boxShadow: '0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)',
  },
  glass: {
    backgroundColor: 'rgba(255,255,255,0.6)',
    backdropFilter: 'blur(16px) saturate(180%)',
    WebkitBackdropFilter: 'blur(16px) saturate(180%)',
    border: '1px solid rgba(255,255,255,0.3)',
    boxShadow: '0 8px 32px rgba(0,0,0,0.06)',
  },
  gradient: {
    background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 50%, #a78bfa 100%)',
    color: '#ffffff',
  },
  bordered: {
    backgroundColor: 'transparent',
    border: '1px solid #e2e8f0',
  },
};

const Card: React.FC<CardProps> = ({
  variant = 'default',
  padding = 'md',
  hover = false,
  className = '',
  children,
  onClick,
}) => {
  const [isHovered, setIsHovered] = React.useState(false);

  const baseStyle: React.CSSProperties = {
    borderRadius: '12px',
    padding: paddingMap[padding],
    transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
    fontFamily: "'Inter', system-ui, sans-serif",
    cursor: onClick ? 'pointer' : 'inherit',
    transform: hover && isHovered ? 'translateY(-2px)' : 'translateY(0)',
    boxShadow:
      variant === 'default' && hover && isHovered
        ? '0 8px 25px rgba(0,0,0,0.08), 0 4px 10px rgba(0,0,0,0.04)'
        : variant === 'default'
          ? '0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)'
          : variant === 'glass' && hover && isHovered
            ? '0 12px 40px rgba(0,0,0,0.1)'
            : variant === 'glass'
              ? '0 8px 32px rgba(0,0,0,0.06)'
              : undefined,
    ...variantStyles[variant],
  };

  return (
    <div
      style={baseStyle}
      className={className}
      onClick={onClick}
      onMouseEnter={() => hover && setIsHovered(true)}
      onMouseLeave={() => hover && setIsHovered(false)}
    >
      {children}
    </div>
  );
};

export default Card;
