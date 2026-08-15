import React, { useMemo, useRef, useState, useEffect } from 'react';
import { Search, X, ArrowUpDown, ChevronDown, Check } from 'lucide-react';

export interface SortOption {
  field: string;
  label: string;
}

interface SearchSortToolbarProps {
  searchTerm: string;
  onSearchChange: (value: string) => void;
  onSearchKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  onSearchClear: () => void;
  sortField: string;
  sortDirection: 'asc' | 'desc';
  sortOptions: SortOption[];
  onSortChange: (field: string) => void;
  onSortDirectionToggle: () => void;
  placeholder?: string;
  resultCount?: number;
  totalCount?: number;
}

const SearchSortToolbar: React.FC<SearchSortToolbarProps> = ({
  searchTerm,
  onSearchChange,
  onSearchKeyDown,
  onSearchClear,
  sortField,
  sortDirection,
  sortOptions,
  onSortChange,
  onSortDirectionToggle,
  placeholder = 'Search...',
  resultCount,
  totalCount,
}) => {
  const [sortDropdownOpen, setSortDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setSortDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const currentSortOption = useMemo(
    () => sortOptions.find(o => o.field === sortField),
    [sortOptions, sortField]
  );

  const directionLabel = sortDirection === 'asc' ? '↑ Asc' : '↓ Desc';

  return (
    <div className="flex flex-wrap sm:flex-nowrap items-center gap-3 w-full sm:w-auto flex-1 justify-end">
      {/* Search Box */}
      <div className="relative flex-1 max-w-[320px] min-w-[200px]">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={14} />
        <input
          type="text"
          placeholder={placeholder}
          className="w-full pl-9 pr-8 py-1.5 border border-slate-200/80 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white/50 font-normal transition-all"
          value={searchTerm}
          onChange={e => onSearchChange(e.target.value)}
          onKeyDown={onSearchKeyDown}
        />
        {searchTerm && (
          <button
            onClick={onSearchClear}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded transition-all"
          >
            <X size={14} />
          </button>
        )}
      </div>

      {/* Result count */}
      {totalCount !== undefined && (
        <span className="text-[11px] text-slate-400 font-medium whitespace-nowrap">
          {resultCount !== undefined ? `${resultCount} / ${totalCount}` : `${totalCount}`} results
        </span>
      )}

      {/* Sort Control */}
      <div className="relative" ref={dropdownRef}>
        <button
          onClick={() => setSortDropdownOpen(!sortDropdownOpen)}
          className="flex items-center gap-1.5 px-3 py-1.5 border border-slate-200/80 rounded-xl text-xs font-medium text-slate-600 hover:bg-slate-50 hover:border-slate-300 transition-all bg-white/50 whitespace-nowrap"
        >
          <ArrowUpDown size={12} className="text-slate-400" />
          <span className="hidden sm:inline">Sort:</span>
          <span className="font-semibold text-slate-700 max-w-[120px] truncate">
            {currentSortOption?.label || 'Date'}
          </span>
          <span className="text-[10px] text-slate-400 font-mono">{directionLabel}</span>
          <ChevronDown size={12} className={`text-slate-400 transition-transform ${sortDropdownOpen ? 'rotate-180' : ''}`} />
        </button>

        {sortDropdownOpen && (
          <div className="absolute right-0 top-full mt-1 w-56 bg-[#FEFDFB] rounded-[14px] shadow-[0_30px_70px_-20px_rgba(0,0,0,.55),0_8px_24px_-8px_rgba(0,0,0,.35),0_0_0_1px_rgba(255,255,255,.04)] border border-[#e4ddd1] z-50 py-1 animate-in fade-in zoom-in-95 origin-top-right">
            <div className="px-3 py-1.5 border-b border-[#e4ddd1]">
              <p className="text-[10px] font-bold text-[#5c6567] uppercase tracking-[0.2em]">Sort by</p>
            </div>
            <div className="max-h-60 overflow-y-auto custom-scrollbar">
              {sortOptions.map(option => (
                <button
                  key={option.field}
                  onClick={() => {
                    onSortChange(option.field);
                    setSortDropdownOpen(false);
                  }}
                  className={`w-full text-left px-3 py-2 text-xs flex items-center justify-between transition-all ${
                    sortField === option.field ? 'text-[#146b60] font-semibold bg-[#eef7f6]' : 'text-[#23282A] font-medium'
                  }`}
                  onMouseEnter={(e) => { if (sortField !== option.field) { e.currentTarget.style.backgroundColor = '#eef7f6'; e.currentTarget.style.paddingLeft = '16px'; } }}
                  onMouseLeave={(e) => { if (sortField !== option.field) { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.paddingLeft = '12px'; } }}
                >
                  <span>{option.label}</span>
                  {sortField === option.field && (
                    <span className="text-[#146b60]">
                      <Check size={14} />
                    </span>
                  )}
                </button>
              ))}
            </div>
            <div className="border-t border-[#e4ddd1] px-3 py-1.5">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onSortDirectionToggle();
                }}
                className="w-full text-left px-2 py-1.5 text-xs font-medium text-[#23282A] hover:bg-[#eef7f6] rounded-lg transition-all flex items-center justify-between"
              >
                <span>Direction</span>
                <span className="text-[#146b60] font-semibold text-[11px] font-mono">
                  {sortDirection === 'asc' ? '↑ Ascending' : '↓ Descending'}
                </span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default SearchSortToolbar;