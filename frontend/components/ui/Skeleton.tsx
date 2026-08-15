import React from 'react';

type SkeletonVariant = 'text' | 'circular' | 'rectangular' | 'card';

interface SkeletonProps {
  variant?: SkeletonVariant;
  width?: string | number;
  height?: string | number;
  className?: string;
}

const variantDefaults: Record<SkeletonVariant, { width: string | number; height: string | number; borderRadius: string }> = {
  text: { width: '100%', height: 14, borderRadius: '4px' },
  circular: { width: 40, height: 40, borderRadius: '50%' },
  rectangular: { width: '100%', height: 120, borderRadius: '8px' },
  card: { width: '100%', height: 180, borderRadius: '12px' },
};

const Skeleton: React.FC<SkeletonProps> = ({
  variant = 'text',
  width,
  height,
  className = '',
}) => {
  const defaults = variantDefaults[variant];

  return (
    <>
      <style>{`
        @keyframes ui-skeleton-pulse {
          0% { opacity: 0.6; }
          50% { opacity: 1; }
          100% { opacity: 0.6; }
        }
      `}</style>
      <div
        className={className}
        style={{
          width: width ?? defaults.width,
          height: height ?? defaults.height,
          borderRadius: defaults.borderRadius,
          backgroundColor: '#e2e8f0',
          animation: 'ui-skeleton-pulse 1.8s ease-in-out infinite',
        }}
      />
    </>
  );
};

export default Skeleton;
