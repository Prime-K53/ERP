import React from 'react';

interface DensityToggleProps {
  value: 'comfortable' | 'compact';
  onChange: (value: 'comfortable' | 'compact') => void;
}

const DensityToggle: React.FC<DensityToggleProps> = ({ value, onChange }) => {
  return (
    <div className="flex items-center gap-1 p-1 rounded-lg bg-white border border-slate-200/60">
      <button
        onClick={() => onChange('comfortable')}
        className={`flex-1 px-2 py-1 rounded-md text-xs font-semibold transition-all ${
          value === 'comfortable'
            ? 'bg-brand-50 text-brand-700 shadow-sm'
            : 'text-slate-600 hover:text-slate-900'
        }`}
      >
        Comfortable
      </button>
      <button
        onClick={() => onChange('compact')}
        className={`flex-1 px-2 py-1 rounded-md text-xs font-semibold transition-all ${
          value === 'compact'
            ? 'bg-brand-50 text-brand-700 shadow-sm'
            : 'text-slate-600 hover:text-slate-900'
        }`}
      >
        Compact
      </button>
    </div>
  );
};

export default DensityToggle;
