import React from 'react';

interface Column<T> {
  key: string;
  header: string;
  render?: (item: T) => React.ReactNode;
  width?: string;
  align?: 'left' | 'right' | 'center';
  sticky?: boolean;
}

interface PortalTableProps<T> {
  columns: Column<T>[];
  data: T[];
  keyExtractor: (item: T) => string;
  onRowClick?: (item: T) => void;
  expandable?: boolean;
  renderExpanded?: (item: T) => React.ReactNode;
  loading?: boolean;
  emptyMessage?: string;
  searchable?: boolean;
  searchPlaceholder?: string;
  onSearch?: (query: string) => void;
}

function PortalTable<T>({
  columns,
  data,
  keyExtractor,
  onRowClick,
  expandable,
  renderExpanded,
  loading,
  emptyMessage = 'No records found',
  searchable,
  searchPlaceholder = 'Search...',
  onSearch,
}: PortalTableProps<T>) {
  const [searchQuery, setSearchQuery] = React.useState('');
  const [expandedRows, setExpandedRows] = React.useState<Set<string>>(new Set());

  React.useEffect(() => {
    onSearch?.(searchQuery);
  }, [searchQuery]);

  const toggleRow = (key: string) => {
    setExpandedRows(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  return (
    <div className="glass-panel-premium rounded-2xl overflow-hidden border border-slate-200/80 shadow-xs">
      {searchable && (
        <div className="px-5 py-3.5 border-b border-slate-200/60 bg-white/50 backdrop-blur-sm">
          <div className="relative">
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={searchPlaceholder}
              className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-slate-50/80 border border-slate-200 text-sm text-slate-900 placeholder:text-slate-400 outline-none focus:bg-white focus:border-teal-500/60 focus:ring-4 focus:ring-teal-500/10 transition-all shadow-2xs"
            />
            <svg className="absolute left-3.5 top-3 text-slate-400" width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.3-4.3" />
            </svg>
          </div>
        </div>
      )}
      <div className="overflow-x-auto custom-scrollbar">
        <table className="w-full border-collapse text-left">
          <thead>
            <tr className="border-b border-slate-200/70 bg-slate-50/70">
              {expandable && <th className="w-10 px-4 py-3.5" />}
              {columns.map((col) => (
                <th
                  key={col.key}
                  className={`px-4 py-3.5 text-[10.5px] font-bold uppercase tracking-wider text-slate-500 ${col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : ''} ${col.sticky ? 'sticky left-0 bg-slate-50/95 backdrop-blur z-10' : ''}`}
                  style={{ width: col.width }}
                >
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100/90 bg-white/70">
            {loading ? (
              <tr>
                <td colSpan={columns.length + (expandable ? 1 : 0)} className="px-4 py-16 text-center text-sm text-slate-400">
                  <div className="flex flex-col items-center justify-center gap-2">
                    <div className="w-6 h-6 border-2 border-teal-500/30 border-t-teal-600 rounded-full animate-spin" />
                    <span>Loading data...</span>
                  </div>
                </td>
              </tr>
            ) : data.length === 0 ? (
              <tr>
                <td colSpan={columns.length + (expandable ? 1 : 0)} className="px-4 py-16 text-center text-sm text-slate-400">
                  <div className="flex flex-col items-center justify-center gap-1.5">
                    <svg className="w-10 h-10 text-slate-300 mb-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
                    </svg>
                    <span className="font-medium text-slate-600">{emptyMessage}</span>
                  </div>
                </td>
              </tr>
            ) : (
              data.map((item) => {
                const key = keyExtractor(item);
                const isExpanded = expandedRows.has(key);
                return (
                  <React.Fragment key={key}>
                    <tr
                      className={`group transition-all duration-150 ${onRowClick ? 'cursor-pointer hover:bg-teal-50/40 hover:scale-[0.998]' : 'hover:bg-slate-50/50'}`}
                      onClick={() => onRowClick?.(item)}
                    >
                      {expandable && (
                        <td className="px-4 py-3.5">
                          <button
                            onClick={(e) => { e.stopPropagation(); toggleRow(key); }}
                            className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-all"
                            aria-label={isExpanded ? 'Collapse' : 'Expand'}
                          >
                            <svg
                              className="transition-transform duration-200"
                              style={{ transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)' }}
                              width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                            >
                              <path d="m9 18 6-6-6-6" />
                            </svg>
                          </button>
                        </td>
                      )}
                      {columns.map((col) => (
                        <td
                          key={col.key}
                          className={`px-4 py-3.5 text-xs font-medium text-slate-800 ${col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : ''} ${col.sticky ? 'sticky left-0 bg-white/95 backdrop-blur z-10' : ''}`}
                        >
                          {col.render ? col.render(item) : (item as any)[col.key]}
                        </td>
                      ))}
                    </tr>
                    {expandable && isExpanded && renderExpanded && (
                      <tr>
                        <td colSpan={columns.length + 1} className="px-4 py-0 bg-slate-50/60 border-t border-slate-100">
                          <div className="py-4">{renderExpanded(item)}</div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default PortalTable;
