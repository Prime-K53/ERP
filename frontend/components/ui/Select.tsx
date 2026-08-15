import React, { useState } from 'react';
import { ChevronDown } from 'lucide-react';

interface SelectProps {
  label?: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  icon?: React.ReactNode;
  error?: string;
  className?: string;
}

const Select: React.FC<SelectProps> = ({
  label,
  value,
  onChange,
  options,
  icon,
  error,
  className = '',
}) => {
  const [focused, setFocused] = useState(false);

  return (
    <div style={{ fontFamily: "'Inter', system-ui, sans-serif", width: '100%' }}>
      {label && (
        <label
          style={{
            display: 'block',
            fontSize: '11px',
            fontWeight: 600,
            color: '#64748b',
            marginBottom: '6px',
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
          }}
        >
          {label}
        </label>
      )}
      <div
        style={{
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
          width: '100%',
          borderRadius: '8px',
          border: `1px solid ${error ? '#dc2626' : focused ? '#6366f1' : '#e2e8f0'}`,
          backgroundColor: '#ffffff',
          transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
          boxShadow: focused
            ? '0 0 0 3px rgba(99,102,241,0.12)'
            : error
              ? '0 0 0 3px rgba(220,38,38,0.1)'
              : 'none',
        }}
      >
        {icon && (
          <span
            style={{
              display: 'flex',
              alignItems: 'center',
              paddingLeft: '12px',
              color: '#94a3b8',
              flexShrink: 0,
            }}
          >
            {icon}
          </span>
        )}
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          className={className}
          style={{
            width: '100%',
            border: 'none',
            outline: 'none',
            backgroundColor: 'transparent',
            fontFamily: "'Inter', system-ui, sans-serif",
            fontSize: '13px',
            color: value ? '#0f172a' : '#94a3b8',
            padding: icon ? '10px 36px 10px 8px' : '10px 36px 10px 12px',
            borderRadius: '8px',
            lineHeight: '20px',
            cursor: 'pointer',
            appearance: 'none',
            WebkitAppearance: 'none',
            MozAppearance: 'none',
          }}
        >
          {options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        <span
          style={{
            position: 'absolute',
            right: '12px',
            color: '#94a3b8',
            pointerEvents: 'none',
            display: 'flex',
            alignItems: 'center',
          }}
        >
          <ChevronDown size={16} />
        </span>
      </div>
      {error && (
        <p
          style={{
            margin: '4px 0 0',
            fontSize: '11px',
            color: '#dc2626',
            fontWeight: 500,
          }}
        >
          {error}
        </p>
      )}
    </div>
  );
};

export default Select;
