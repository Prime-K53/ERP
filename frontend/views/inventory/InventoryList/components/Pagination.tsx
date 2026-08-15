import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface Props {
  page: number;
  totalPages: number;
  pageSize: number;
  totalItems: number;
  onPageChange: (p: number) => void;
  onPageSizeChange: (s: number) => void;
}

const PAGE_SIZES = [25, 50, 100, 250];

export const Pagination: React.FC<Props> = ({ page, totalPages, pageSize, totalItems, onPageChange, onPageSizeChange }) => {
  const start = (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, totalItems);

  return (
    <div className="flex items-center justify-between px-4 py-3 bg-white/70 backdrop-blur-xl rounded-2xl border border-white/60 shadow-sm text-sm text-slate-500">
      <div className="flex items-center gap-3">
        <span>{start}–{end} of {totalItems}</span>
        <div className="flex items-center gap-1.5">
          <span className="text-slate-400">Rows:</span>
          <select value={pageSize} onChange={e => onPageSizeChange(Number(e.target.value))}
            className="text-sm border border-slate-200 rounded-xl px-2 py-1 bg-white outline-none text-slate-700">
            {PAGE_SIZES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
      </div>

      <div className="flex items-center gap-1">
        <button onClick={() => onPageChange(page - 1)} disabled={page <= 1}
          className="p-1.5 rounded-lg transition-all disabled:opacity-30 disabled:cursor-not-allowed hover:bg-slate-100 text-slate-400">
          <ChevronLeft size={16} />
        </button>
        {getPageNumbers(page, totalPages).map((p, i) =>
          p === '...' ? (
            <span key={`dots-${i}`} className="px-1 text-sm text-slate-400">...</span>
          ) : (
            <button key={p} onClick={() => onPageChange(p as number)}
              className={`w-8 h-8 rounded-xl text-sm font-medium transition-all border-0 bg-transparent cursor-pointer ${
                p === page ? 'bg-blue-600 text-white' : 'text-slate-500 hover:bg-slate-100'
              }`}>
              {p}
            </button>
          )
        )}
        <button onClick={() => onPageChange(page + 1)} disabled={page >= totalPages}
          className="p-1.5 rounded-lg transition-all disabled:opacity-30 disabled:cursor-not-allowed hover:bg-slate-100 text-slate-400">
          <ChevronRight size={16} />
        </button>
      </div>
    </div>
  );
};

function getPageNumbers(current: number, total: number): (number | string)[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const pages: (number | string)[] = [1];
  if (current > 3) pages.push('...');
  const start = Math.max(2, current - 1);
  const end = Math.min(total - 1, current + 1);
  for (let i = start; i <= end; i++) pages.push(i);
  if (current < total - 2) pages.push('...');
  pages.push(total);
  return pages;
}
