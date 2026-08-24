import React from 'react';
import { portalTheme } from '../constants';

interface Props {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  maxWidth?: string;
  padding?: string;
}

const PremiumPortalShell: React.FC<Props> = ({
  children,
  className = '',
  style,
  maxWidth = '920px',
  padding = '28px 20px 64px',
}) => {
  return (
    <div
      className={`premium-portal-shell ${className}`}
      style={{
        minHeight: 'calc(100vh - 56px)',
        width: '100%',
        maxWidth,
        margin: '0 auto',
        padding,
        background: portalTheme.backgroundGradient,
        ...style,
      }}
    >
      {children}
    </div>
  );
};

export default PremiumPortalShell;
