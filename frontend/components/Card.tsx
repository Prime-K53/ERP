import React from 'react';

type DivProps = React.HTMLAttributes<HTMLDivElement>;

const Card: React.FC<DivProps> = ({ className = '', ...props }) => (
  <div className={`rounded-xl border border-slate-200 bg-white shadow-sm ${className}`} {...props} />
);

const CardHeader: React.FC<DivProps> = ({ className = '', ...props }) => (
  <div className={`px-5 py-4 border-b border-slate-100 ${className}`} {...props} />
);

const CardTitle: React.FC<DivProps> = ({ className = '', ...props }) => (
  <h3 className={`text-base font-bold text-slate-900 ${className}`} {...props} />
);

const CardContent: React.FC<DivProps> = ({ className = '', ...props }) => (
  <div className={`p-5 ${className}`} {...props} />
);

export { Card, CardHeader, CardTitle, CardContent };
export default Card;
