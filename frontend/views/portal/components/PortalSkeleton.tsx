import React from 'react';

interface PortalSkeletonProps {
  variant?: 'card' | 'table' | 'detail' | 'list';
  rows?: number;
  className?: string;
}

const SkeletonBase: React.FC<{ className?: string }> = ({ className }) => (
  <div className={`rounded-[10px] bg-slate-200/60 overflow-hidden relative ${className || ''}`}>
    <div className="absolute inset-0 -translate-x-full animate-[shimmer_1.5s_infinite]"
      style={{
        background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.5), transparent)',
      }}
    />
  </div>
);

const PortalSkeleton: React.FC<PortalSkeletonProps> = ({ variant = 'card', rows = 3, className }) => {
  if (variant === 'card') {
    return (
      <div className={`grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 ${className || ''}`}>
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="rounded-[var(--radius-md)] border border-slate-200/60 bg-white p-5 space-y-4">
            <div className="flex items-center gap-3">
              <SkeletonBase className="w-10 h-10 rounded-xl shrink-0" />
              <div className="flex-1 space-y-2">
                <SkeletonBase className="h-3 w-24 rounded-md" />
                <SkeletonBase className="h-2.5 w-16 rounded-md" />
              </div>
            </div>
            <SkeletonBase className="h-7 w-28 rounded-lg" />
            <SkeletonBase className="h-12 w-full rounded-lg" />
          </div>
        ))}
      </div>
    );
  }

  if (variant === 'table') {
    return (
      <div className={`glass-panel rounded-[var(--radius-md)] overflow-hidden ${className || ''}`}>
        <div className="px-4 py-3 border-b border-slate-200/60">
          <SkeletonBase className="h-4 w-32 rounded-md" />
        </div>
        <div className="divide-y divide-slate-100/80">
          {Array.from({ length: rows }).map((_, i) => (
            <div key={i} className="px-4 py-3 flex items-center gap-4">
              <SkeletonBase className="h-4 w-8 rounded-md shrink-0" />
              <SkeletonBase className="h-4 flex-1 rounded-md" />
              <SkeletonBase className="h-4 w-24 rounded-md shrink-0" />
              <SkeletonBase className="h-4 w-20 rounded-md shrink-0" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (variant === 'detail') {
    return (
      <div className={`space-y-6 ${className || ''}`}>
        <div className="glass-panel rounded-[var(--radius-md)] p-6">
          <div className="flex items-start gap-4 mb-6">
            <SkeletonBase className="w-12 h-12 rounded-xl shrink-0" />
            <div className="flex-1 space-y-3">
              <SkeletonBase className="h-5 w-48 rounded-lg" />
              <SkeletonBase className="h-4 w-32 rounded-md" />
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="space-y-2">
                <SkeletonBase className="h-3 w-20 rounded-md" />
                <SkeletonBase className="h-4 w-full rounded-lg" />
              </div>
            ))}
          </div>
        </div>
        <div className="glass-panel rounded-[var(--radius-md)] p-6">
          <SkeletonBase className="h-4 w-32 rounded-md mb-4" />
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <SkeletonBase key={i} className="h-16 w-full rounded-lg" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`space-y-3 ${className || ''}`}>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 p-3">
          <SkeletonBase className="w-10 h-10 rounded-lg shrink-0" />
          <div className="flex-1 space-y-2">
            <SkeletonBase className="h-4 w-48 rounded-md" />
            <SkeletonBase className="h-3 w-32 rounded-md" />
          </div>
          <SkeletonBase className="h-4 w-20 rounded-md shrink-0" />
        </div>
      ))}
    </div>
  );
};

export default PortalSkeleton;
