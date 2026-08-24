import React from 'react';

interface Props {
  type?: 'card' | 'table' | 'detail';
  count?: number;
}

const SkeletonBlock: React.FC<{ className?: string }> = ({ className = '' }) => (
  <div className={`animate-pulse bg-slate-200 rounded-lg ${className}`} />
);

const CardSkeleton: React.FC = () => (
      <div style={{ padding: '14px 16px', borderRadius: 14, background: '#FFFFFF', border: '1px solid rgba(16,24,40,0.05)', borderLeft: '4px solid rgba(16,24,40,0.05)' }}>
    <div className="flex items-center gap-3">
      <SkeletonBlock className="h-10 w-10 rounded-[10px]" />
      <div className="flex-1 space-y-2">
        <SkeletonBlock className="h-2.5 w-16" />
        <SkeletonBlock className="h-5 w-24" />
      </div>
    </div>
  </div>
);

const TableSkeleton: React.FC = () => (
  <div className="bg-white/70 backdrop-blur-xl rounded-2xl shadow-sm border border-white/60 overflow-hidden">
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] text-left text-[13px] table-fixed">
        <thead className="bg-slate-50/80 backdrop-blur text-slate-500 sticky top-0 z-10 shadow-sm">
          <tr>
            <th className="px-5 py-3 font-bold text-[10px] uppercase tracking-wider text-left">Invoice #</th>
            <th className="px-5 py-3 font-bold text-[10px] uppercase tracking-wider text-left">Date</th>
            <th className="px-5 py-3 font-bold text-[10px] uppercase tracking-wider text-right">Amount</th>
            <th className="px-5 py-3 font-bold text-[10px] uppercase tracking-wider text-center">Status</th>
            <th className="px-5 py-3 font-bold text-[10px] uppercase tracking-wider text-left">Due Date</th>
            <th className="px-5 py-3 font-bold text-[10px] uppercase tracking-wider text-right">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100/50">
          {Array.from({ length: 5 }).map((_, i) => (
            <tr key={i}>
              <td className="px-5 py-3"><SkeletonBlock className="h-4 w-20" /></td>
              <td className="px-5 py-3"><SkeletonBlock className="h-4 w-16" /></td>
              <td className="px-5 py-3"><SkeletonBlock className="h-4 w-16" /></td>
              <td className="px-5 py-3"><SkeletonBlock className="h-4 w-12" /></td>
              <td className="px-5 py-3"><SkeletonBlock className="h-4 w-16" /></td>
              <td className="px-5 py-3"><SkeletonBlock className="h-4 w-12" /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </div>
);

const DetailSkeleton: React.FC = () => (
  <div className="space-y-6">
    <SkeletonBlock className="h-7 w-56" />
    <div className="bg-white/70 backdrop-blur-xl rounded-2xl shadow-sm border border-white/60 p-6 space-y-5">
      <div className="grid grid-cols-2 gap-6">
        <div className="space-y-2">
          <SkeletonBlock className="h-3 w-16" />
          <SkeletonBlock className="h-5 w-36" />
        </div>
        <div className="space-y-2">
          <SkeletonBlock className="h-3 w-16" />
          <SkeletonBlock className="h-5 w-36" />
        </div>
        <div className="space-y-2">
          <SkeletonBlock className="h-3 w-16" />
          <SkeletonBlock className="h-5 w-36" />
        </div>
        <div className="space-y-2">
          <SkeletonBlock className="h-3 w-16" />
          <SkeletonBlock className="h-5 w-36" />
        </div>
      </div>
      <div className="border-t border-slate-200/60 pt-5 space-y-3">
        <SkeletonBlock className="h-3 w-32" />
        <SkeletonBlock className="h-4 w-full" />
        <SkeletonBlock className="h-4 w-3/4" />
        <SkeletonBlock className="h-4 w-5/6" />
      </div>
    </div>
  </div>
);

const PortalLoadingSkeleton: React.FC<Props> = ({ type = 'card', count = 4 }) => {
  if (type === 'table') {
    return <TableSkeleton />;
  }

  if (type === 'detail') {
    return <DetailSkeleton />;
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14, marginBottom: 18 }}>
      {Array.from({ length: count }).map((_, i) => (
        <CardSkeleton key={i} />
      ))}
    </div>
  );
};

export default PortalLoadingSkeleton;
