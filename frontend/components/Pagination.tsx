
import React from 'react';
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';

interface PaginationProps {
  currentPage: number;
  maxPage: number;
  totalItems: number;
  itemsPerPage: number;
  onNext: () => void;
  onPrev: () => void;
  onFirst?: () => void;
  onLast?: () => void;
  onItemsPerPageChange?: (count: number) => void;
  itemsPerPageOptions?: number[];
  showItemsPerPage?: boolean;
}

const Pagination: React.FC<PaginationProps> = ({ 
  currentPage, 
  maxPage, 
  totalItems, 
  itemsPerPage, 
  onNext, 
  onPrev,
  onFirst,
  onLast,
  onItemsPerPageChange,
  itemsPerPageOptions = [10, 25, 50, 100],
  showItemsPerPage = true
}) => {
  if (totalItems === 0) return null;

  const startItem = totalItems === 0 ? 0 : (currentPage - 1) * itemsPerPage + 1;
  const endItem = Math.min(currentPage * itemsPerPage, totalItems);

  return (
    <div className="px-4 py-2.5 bg-white/90 backdrop-blur-md border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0">
      <div className="flex flex-wrap items-center gap-3 sm:gap-4">
        <div className="text-[12px] text-slate-500">
          Showing <span className="font-semibold text-slate-800">{startItem}</span> to <span className="font-semibold text-slate-800">{endItem}</span> of <span className="font-semibold text-slate-800">{totalItems}</span> results
        </div>
        
        {showItemsPerPage && onItemsPerPageChange && (
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-slate-400">per page</span>
            <select
              value={itemsPerPage}
              onChange={(e) => onItemsPerPageChange(Number(e.target.value))}
              className="bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 text-[12px] font-medium text-slate-700 outline-none focus:border-blue-500 transition-colors cursor-pointer"
            >
              {itemsPerPageOptions.map((opt) => (
                <option key={opt} value={opt}>{opt}</option>
              ))}
            </select>
          </div>
        )}
      </div>
      
      <div className="flex items-center gap-1">
        {onFirst && (
          <button
            onClick={onFirst}
            disabled={currentPage === 1}
            className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-500 disabled:opacity-40 disabled:hover:bg-transparent disabled:cursor-not-allowed transition-all"
            title="First page"
          >
            <ChevronsLeft size={14} />
          </button>
        )}
        <button
          onClick={onPrev}
          disabled={currentPage === 1}
          className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-600 disabled:opacity-40 disabled:hover:bg-transparent disabled:cursor-not-allowed transition-all active:scale-95 shadow-sm"
        >
          <ChevronLeft size={14} />
        </button>
        <div className="text-[12px] font-semibold text-slate-700 px-3 bg-slate-50 py-1.5 rounded-md border border-slate-100 mx-1">
          {currentPage} / {maxPage}
        </div>
        <button
          onClick={onNext}
          disabled={currentPage === maxPage}
          className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-600 disabled:opacity-40 disabled:hover:bg-transparent disabled:cursor-not-allowed transition-all active:scale-95 shadow-sm"
        >
          <ChevronRight size={14} />
        </button>
        {onLast && (
          <button
            onClick={onLast}
            disabled={currentPage === maxPage}
            className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-500 disabled:opacity-40 disabled:hover:bg-transparent disabled:cursor-not-allowed transition-all"
            title="Last page"
          >
            <ChevronsRight size={14} />
          </button>
        )}
      </div>
    </div>
  );
};

export default Pagination;
