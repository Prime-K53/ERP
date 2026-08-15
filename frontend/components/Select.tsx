import React from 'react';

type SelectProps = Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'onChange'> & {
  label?: string;
  error?: string;
  placeholder?: string;
  options?: Array<{ value: string | number; label: string }>;
  onChange?: (value: any) => void;
};

const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ className = '', label, error, children, options, onChange, ...props }, ref) => {
    return (
      <div className="space-y-1">
        {label && (
          <label className="block text-sm font-medium text-slate-700">
            {label}
          </label>
        )}
        <select
          ref={ref}
          data-form-field=""
          onChange={(e) => onChange && onChange(e.target.value)}
          className={`w-full rounded-md border bg-white px-3 py-2 text-sm outline-none transition-colors focus:ring-2 focus:ring-blue-200 ${
            error ? 'border-red-300 focus:border-red-400' : 'border-slate-300 focus:border-blue-400'
          } ${className}`}
          {...props}
        >
          {options ? options.map(opt => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          )) : children}
        </select>
        {error && <p className="text-xs text-red-600">{error}</p>}
      </div>
    );
  }
);

Select.displayName = 'Select';

export { Select };
export default Select;
