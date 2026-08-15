import React from 'react';

type BadgeVariant = 'default' | 'secondary' | 'success' | 'destructive' | 'outline';

interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
}

const variantClasses: Record<BadgeVariant, string> = {
  default: 'bg-blue-100 text-blue-800',
  secondary: 'bg-slate-100 text-slate-700',
  success: 'bg-emerald-100 text-emerald-800',
  destructive: 'bg-red-100 text-red-800',
  outline: 'bg-transparent border border-slate-300 text-slate-700'
};

const Badge: React.FC<BadgeProps> = ({ variant = 'default', className = '', ...props }) => {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${variantClasses[variant]} ${className}`}
      {...props}
    />
  );
};

export { Badge };
export default Badge;
