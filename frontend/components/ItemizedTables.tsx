import React from 'react';

interface Column {
  header: string;
  accessor: string;
  align?: 'left' | 'center' | 'right';
  isCurrency?: boolean;
  width?: string; // e.g., '15%'
  wrapSafe?: boolean; // Enable word-wrapping for long descriptions
  render?: (value: any, item: any) => React.ReactNode;
}

interface ItemizedTableProps {
  columns: Column[];
  data: any[];
  currencySymbol?: string;
}

/**
 * ItemizedTable Component
 * Optimized for multi-page PDF generation with sticky headers and precise alignment.
 */
export const ItemizedTable: React.FC<ItemizedTableProps> = ({ 
  columns, 
  data, 
  currencySymbol = '$' 
}) => {
  return (
    <div className="itemized-table-container w-full overflow-visible">
      <table className="w-full border-collapse bg-white" style={{ tableLayout: 'fixed' }}>
        <thead className="print-header-repeat">
          <tr>
            {columns.map((col, idx) => (
              <th 
                key={idx}
                className={`
                  bg-white text-slate-500 text-[10px] font-bold uppercase tracking-wider 
                  py-3 px-4 border-b-2 border-slate-200 text-left
                  ${col.align === 'right' || col.isCurrency ? 'text-right' : ''}
                  ${col.align === 'center' ? 'text-center' : ''}
                  ${col.wrapSafe ? 'text-wrap-safe' : ''}
                `}
                style={{ 
                  position: 'sticky', 
                  top: 0, 
                  zIndex: 10,
                  width: col.width || 'auto' 
                }}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 bg-white">
          {data.map((row, rowIdx) => (
            <tr key={rowIdx} className="break-inside-avoid bg-white">
              {columns.map((col, colIdx) => {
                const value = row[col.accessor];
                return (
                  <td 
                    key={colIdx}
                    className={`
                      py-3 px-4 text-xs text-slate-700 bg-white
                      ${col.align === 'right' || col.isCurrency ? 'text-right font-mono' : ''}
                      ${col.align === 'center' ? 'text-center' : ''}
                      ${col.wrapSafe ? 'text-wrap-safe' : ''}
                    `}
                  >
                    {col.render ? col.render(value, row) : (
                      col.isCurrency ? `${currencySymbol}${Number(value || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}` : value
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>

      <style>{`
        @media print {
          .print-header-repeat {
            display: table-header-group;
          }
          tr {
            break-inside: avoid;
          }
        }
      `}</style>
    </div>
  );
};

interface SummaryItem {
  label: string;
  value: number;
  isGrandTotal?: boolean;
  isPaid?: boolean;
}

interface SummaryBlockProps {
  items: SummaryItem[];
  currencySymbol?: string;
  notes?: string;
  status?: string;
}

/**
 * SummaryBlock Component
 * Ensures financial totals never split across pages and maintains clear alignment.
 */
export const SummaryBlock: React.FC<SummaryBlockProps> = ({ 
  items, 
  currencySymbol = '$',
  notes,
  status
}) => {
  return (
    <div className="summary-block mt-8 flex flex-col items-end break-inside-avoid" style={{ pageBreakInside: 'avoid' }}>
      <div className="w-full max-w-[300px] space-y-2 relative">
        {status && (
          <div className="absolute right-0 bottom-full mb-3">
             <span className={`inline-flex px-3 py-1 rounded-full text-xs font-bold border uppercase tracking-wider ${
                 status === 'Paid' || status === 'Completed' || status === 'PAID' ? 'bg-emerald-100/50 text-emerald-700 border-emerald-200' :
                 status === 'Partial' || status === 'PARTIAL' ? 'bg-blue-100/50 text-blue-700 border-blue-200' :
                 status === 'Pending' || status === 'Draft' || status === 'PENDING' ? 'bg-amber-100/50 text-amber-700 border-amber-200' :
                 status === 'Cancelled' || status === 'CANCELLED' ? 'bg-rose-100/50 text-rose-700 border-rose-200' :
                 'bg-slate-100/50 text-slate-600 border-slate-200'
             }`}>
                 {status}
             </span>
          </div>
        )}
        {items.map((item, idx) => (
          <div 
            key={idx} 
            className={`
              flex justify-between items-center py-1
              ${item.isGrandTotal ? 'mt-4 pt-4 border-t-2 border-slate-900' : ''}
              ${item.isPaid ? 'text-emerald-600' : ''}
            `}
          >
            <span className={`text-[11px] ${item.isGrandTotal ? 'font-black text-slate-900' : item.isPaid ? 'font-bold text-emerald-600' : 'font-medium text-slate-500 uppercase'}`}>
              {item.label}
            </span>
            <span className={`font-mono ${item.isGrandTotal ? 'text-lg font-black text-blue-600' : item.isPaid ? 'text-sm font-bold text-emerald-600' : 'text-sm font-bold text-slate-800'}`}>
              {currencySymbol}{item.value.toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </span>
          </div>
        ))}
      </div>
      
      {notes && (
        <div className="w-full mt-8 p-4 bg-slate-50 rounded-lg border border-slate-100 break-inside-avoid">
          <p className="text-[9px] font-bold text-slate-400 uppercase mb-1">Notes / Terms</p>
          <p className="text-[10px] text-slate-600 leading-relaxed">{notes}</p>
        </div>
      )}

      <style>{`
        .summary-block {
          break-inside: avoid !important;
          page-break-inside: avoid !important;
        }
      `}</style>
    </div>
  );
};
