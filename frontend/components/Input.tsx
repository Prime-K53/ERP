import React from 'react';

type InputProps = React.InputHTMLAttributes<HTMLInputElement> & {
  label?: string;
  error?: string;
};

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className = '', label, error, ...props }, ref) => {
    const errorId = error ? `${props.id || props.name}-error` : undefined;
    
    return (
      <div className="space-y-1">
        {label && (
          <label 
            htmlFor={props.id || props.name}
            className="block text-sm font-medium text-slate-700"
          >
            {label}
          </label>
        )}
        <input
          ref={ref}
          id={props.id || props.name}
          data-form-field=""
          aria-invalid={!!error}
          aria-describedby={errorId}
          className={`w-full rounded-md border px-3 py-2 text-sm outline-none transition-colors focus:ring-2 focus:ring-blue-200 ${
            error ? 'border-red-300 focus:border-red-400' : 'border-slate-300 focus:border-blue-400'
          } ${className}`}
          {...props}
        />
        {error && (
          <p id={errorId} className="text-xs text-red-600 animate-fade-in" role="alert">
            {error}
          </p>
        )}
      </div>
    );
  }
);

Input.displayName = 'Input';

export { Input };
export default Input;
