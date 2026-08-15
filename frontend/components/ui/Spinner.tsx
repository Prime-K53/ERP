import React from 'react';

interface SpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  color?: string;
  className?: string;
}

const sizeMap: Record<string, number> = {
  sm: 16,
  md: 24,
  lg: 36,
};

const Spinner: React.FC<SpinnerProps> = ({
  size = 'md',
  color = '#6366f1',
  className = '',
}) => {
  const dimension = sizeMap[size];

  return (
    <>
      <style>{`
        @keyframes ui-spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
      <div
        className={className}
        style={{
          width: dimension,
          height: dimension,
          border: `2.5px solid #e2e8f0`,
          borderTopColor: color,
          borderRadius: '50%',
          animation: 'ui-spin 0.7s linear infinite',
        }}
      />
    </>
  );
};

export default Spinner;
