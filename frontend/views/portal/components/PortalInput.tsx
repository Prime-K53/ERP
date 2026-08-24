import React from 'react';

interface Props {
  label?: string;
  value?: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  type?: string;
  disabled?: boolean;
  error?: string;
  hint?: string;
  autoFocus?: boolean;
  required?: boolean;
  style?: React.CSSProperties;
  className?: string;
  onBlur?: () => void;
  onFocus?: () => void;
}

const PortalInput: React.FC<Props> = ({
  label,
  value,
  onChange,
  placeholder,
  type = 'text',
  disabled = false,
  error,
  hint,
  autoFocus = false,
  required = false,
  style,
  className = '',
  onBlur,
  onFocus,
}) => {
  const [focused, setFocused] = React.useState(false);

  const handleFocus = () => {
    setFocused(true);
    onFocus?.();
  };

  const handleBlur = () => {
    setFocused(false);
    onBlur?.();
  };

  return (
    <div className={`flex flex-col gap-1.5 ${className}`} style={style}>
      {label && (
        <label className="text-xs font-semibold text-slate-700 tracking-wide">
          {label}
          {required && <span className="text-rose-500 ml-0.5">*</span>}
        </label>
      )}
      <input
        type={type}
        value={value}
        onChange={(e) => onChange?.(e.target.value)}
        onFocus={handleFocus}
        onBlur={handleBlur}
        placeholder={placeholder}
        disabled={disabled}
        autoFocus={autoFocus}
        required={required}
        className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50/80 border text-sm text-slate-900 placeholder:text-slate-400 outline-none transition-all duration-200"
        style={{
          fontFamily: "'Inter', sans-serif",
          borderColor: error ? '#ef4444' : focused ? 'rgba(20, 107, 96, 0.6)' : 'rgba(226, 232, 240, 0.9)',
          boxShadow: error
            ? '0 0 0 3px rgba(239, 68, 68, 0.15)'
            : focused
              ? '0 0 0 4px rgba(20, 107, 96, 0.12)'
              : '0 1px 2px rgba(15, 23, 42, 0.03)',
          background: focused ? '#ffffff' : undefined,
          opacity: disabled ? 0.6 : 1,
        }}
      />
      {error && <p className="text-[11px] font-medium text-rose-500 mt-0.5">{error}</p>}
      {hint && !error && <p className="text-[11px] text-slate-400 mt-0.5">{hint}</p>}
    </div>
  );
};

export default PortalInput;
