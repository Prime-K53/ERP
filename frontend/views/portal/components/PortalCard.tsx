import React from 'react';

interface Props {
  children: React.ReactNode;
  padding?: string;
  style?: React.CSSProperties;
  className?: string;
  onClick?: () => void;
  hoverable?: boolean;
}

const PortalCard: React.FC<Props> = ({
  children,
  padding,
  style,
  className = '',
  onClick,
  hoverable = false,
}) => {
  const [hovered, setHovered] = React.useState(false);

  const baseStyle: React.CSSProperties = {
    background: 'rgba(255, 255, 255, 0.88)',
    backdropFilter: 'blur(16px) saturate(180%)',
    WebkitBackdropFilter: 'blur(16px) saturate(180%)',
    borderRadius: 16,
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: 'rgba(226, 232, 240, 0.8)',
    boxShadow: '0 4px 20px -2px rgba(15, 23, 42, 0.04), 0 1px 3px rgba(15, 23, 42, 0.02)',
    transition: 'all 250ms cubic-bezier(0.4, 0, 0.2, 1)',
    cursor: onClick ? 'pointer' : 'default',
    padding: padding || '20px',
  };

  const combinedStyle: React.CSSProperties = {
    ...baseStyle,
    ...style,
    ...((hoverable || onClick) && hovered
      ? {
          transform: 'translateY(-2px)',
          background: '#ffffff',
          borderColor: 'rgba(20, 107, 96, 0.25)',
          boxShadow: '0 12px 32px -8px rgba(15, 84, 76, 0.12), 0 4px 12px -2px rgba(15, 23, 42, 0.04)',
        }
      : {}),
  };

  return (
    <div
      className={className}
      style={combinedStyle}
      onClick={onClick}
      onMouseEnter={() => (hoverable || onClick) && setHovered(true)}
      onMouseLeave={() => (hoverable || onClick) && setHovered(false)}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } } : undefined}
    >
      {children}
    </div>
  );
};

export default PortalCard;
