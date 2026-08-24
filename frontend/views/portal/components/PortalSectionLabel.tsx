import React from 'react';
import { portalTheme } from '../constants';

interface Props {
  label: string;
  subtitle?: string;
  className?: string;
  style?: React.CSSProperties;
}

const PortalSectionLabel: React.FC<Props> = ({ label, subtitle, className = '', style }) => {
  return (
    <div
      className={`section-label flex items-center gap-2.5 mb-3 ${className}`}
      style={{ ...style }}
    >
      <span
        className="text-[11px] font-bold uppercase tracking-wider"
        style={{ color: portalTheme.inkMuted }}
      >
        {label}
      </span>
      {subtitle && (
        <span className="text-[12px]" style={{ color: portalTheme.inkSoft }}>
          {subtitle}
        </span>
      )}
      <span
        className="flex-1 h-px"
        style={{ background: portalTheme.hairline }}
      />
    </div>
  );
};

export default PortalSectionLabel;
