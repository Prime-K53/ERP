import React from 'react';

interface Props {
  title: string;
  subtitle?: string;
  icon?: React.ElementType;
  iconBg?: string;
  iconColor?: string;
  action?: {
    label: string;
    onClick: () => void;
    icon?: React.ElementType;
    disabled?: boolean;
  };
  children?: React.ReactNode;
  style?: React.CSSProperties;
}

const PortalPageHeader: React.FC<Props> = ({
  title,
  subtitle,
  icon: Icon,
  iconBg = 'linear-gradient(135deg, #146b60 0%, #0f544c 100%)',
  iconColor = '#fff',
  action,
  children,
  style,
}) => {
  return (
    <div
      className="glass-panel-premium rounded-2xl p-5 md:p-6 flex items-center justify-between flex-wrap gap-4 border border-slate-200/80 shadow-xs mb-6"
      style={style}
    >
      <div className="flex items-center gap-3.5 min-w-0">
        {Icon && (
          <div
            className="w-11 h-11 rounded-2xl flex items-center justify-center text-white shrink-0 shadow-md shadow-teal-900/20"
            style={{ background: iconBg }}
          >
            <Icon size={20} color={iconColor} />
          </div>
        )}
        <div className="min-w-0">
          <h1 className="text-xl md:text-2xl font-extrabold text-slate-900 tracking-tight leading-tight">
            {title}
          </h1>
          {subtitle && (
            <p className="text-xs font-medium text-slate-500 mt-0.5 leading-relaxed">
              {subtitle}
            </p>
          )}
        </div>
      </div>
      <div className="flex items-center gap-3 shrink-0">
        {children}
        {action && (
          <button
            onClick={action.onClick}
            disabled={action.disabled}
            className="btn-press px-4 py-2.5 rounded-xl text-xs font-bold text-white inline-flex items-center gap-2 transition-all shadow-md shadow-teal-900/25 disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ background: 'linear-gradient(135deg, #146b60 0%, #0f544c 100%)' }}
          >
            {action.icon && <action.icon size={16} />}
            <span>{action.label}</span>
          </button>
        )}
      </div>
    </div>
  );
};

export default PortalPageHeader;
