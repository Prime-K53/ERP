import React, { useState } from 'react';

interface InputProps {
  label?: string;
  placeholder?: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  icon?: React.ReactNode;
  error?: string;
  hint?: string;
  type?: string;
  disabled?: boolean;
  className?: string;
}

const Input: React.FC<InputProps> = ({
  label,
  placeholder,
  value,
  onChange,
  icon,
  error,
  hint,
  type = 'text',
  disabled = false,
  className = '',
}) => {
  const [focused, setFocused] = useState(false);
  const hasValue = value.length > 0;

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
          backgroundColor: disabled ? '#f1f5f9' : '#ffffff',
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
        <input
          type={type}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          disabled={disabled}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          style={{
            width: '100%',
            border: 'none',
            outline: 'none',
            backgroundColor: 'transparent',
            fontFamily: "'Inter', system-ui, sans-serif",
            fontSize: '13px',
            color: '#0f172a',
            padding: icon ? '10px 12px 10px 8px' : '10px 12px',
            borderRadius: '8px',
            lineHeight: '20px',
            transition: 'color 0.2s',
          }}
          className={className}
        />
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
      {hint && !error && (
        <p
          style={{
            margin: '4px 0 0',
            fontSize: '11px',
            color: '#94a3b8',
          }}
        >
          {hint}
        </p>
      )}
    </div>
  );
};

export default Input;
