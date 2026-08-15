import React from 'react';

interface Props {
  icon: React.ElementType | React.ReactNode;
  title: string;
  description?: string;
  action?: { label: string; onClick: () => void };
  secondaryAction?: { label: string; onClick: () => void };
}

const EmptyState: React.FC<Props> = ({ icon, title, description, action, secondaryAction }) => {
  const IconComponent = typeof icon === 'function' ? icon : null;
  return (
    <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
      <div className="glass-panel p-5 rounded-2xl mb-5 text-slate-400 inline-flex">
        {React.isValidElement(icon) ? icon : IconComponent ? <IconComponent.size size={36} /> : null}
      </div>
      <h3 className="text-xl font-semibold text-slate-800 mb-1.5" style={{ fontFamily: "'Inter', sans-serif" }}>{title}</h3>
      {description && (
        <p className="text-sm text-slate-500 max-w-sm leading-relaxed mb-6" style={{ fontFamily: "'Inter', sans-serif", lineHeight: 1.6 }}>
          {description}
        </p>
      )}
      <div className="flex flex-wrap items-center justify-center gap-3">
        {action && (
          <button
            onClick={action.onClick}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white transition-all hover:shadow-lg hover:shadow-emerald-600/20 hover:-translate-y-0.5"
            style={{ background: 'linear-gradient(135deg, #1f8577, #0f544c)' }}
          >
            {action.label}
          </button>
        )}
        {secondaryAction && (
          <button
            onClick={secondaryAction.onClick}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-slate-700 bg-white border border-slate-200 hover:border-slate-300 hover:bg-slate-50 transition-all"
          >
            {secondaryAction.label}
          </button>
        )}
      </div>
    </div>
  );
};

export default EmptyState;
