import React from 'react';

interface LedgerEntry {
  date: string;
  description: string;
  reference: string;
  debit?: number;
  credit?: number;
  balance: number;
}

interface StatementLedgerProps {
  entries: LedgerEntry[];
  currencySymbol?: string;
  openingBalance: number;
  closingBalance: number;
}

/**
 * StatementLedger Component
 * Renders a professional chronological ledger for customer statements.
 * Features repeating headers for multi-page PDF generation.
 */
const StatementLedger: React.FC<StatementLedgerProps> = ({
  entries,
  currencySymbol = '$',
  openingBalance,
  closingBalance
}) => {
  const formatCurrency = (amount?: number) => {
    if (amount === undefined || amount === null) return '-';
    return `${currencySymbol}${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  return (
    <div className="statement-ledger w-full">
      <table className="w-full border-collapse" style={{ tableLayout: 'fixed' }}>
        <thead className="display-table-header-group">
          <tr className="border-b-2 border-slate-200 bg-slate-50/50">
            <th className="py-3 px-4 text-left text-[10px] font-bold text-slate-500 uppercase tracking-widest w-[12%]">Date</th>
            <th className="py-3 px-4 text-left text-[10px] font-bold text-slate-500 uppercase tracking-widest w-[38%]">Description</th>
            <th className="py-3 px-4 text-left text-[10px] font-bold text-slate-500 uppercase tracking-widest w-[15%]">Ref#</th>
            <th className="py-3 px-4 text-right text-[10px] font-bold text-slate-500 uppercase tracking-widest w-[10%]">Debit</th>
            <th className="py-3 px-4 text-right text-[10px] font-bold text-slate-500 uppercase tracking-widest w-[10%]">Credit</th>
            <th className="py-3 px-4 text-right text-[10px] font-bold text-slate-500 uppercase tracking-widest w-[15%]">Balance</th>
          </tr>
        </thead>
        <tbody>
          {/* Opening Balance Row */}
          <tr className="border-b border-slate-100 bg-blue-50/20 font-semibold">
            <td className="py-3 px-4 text-[11px] text-slate-400 italic">Pre-period</td>
            <td className="py-3 px-4 text-[11px] text-slate-900 uppercase tracking-tight">Opening Balance Brought Forward</td>
            <td className="py-3 px-4 text-[11px] text-slate-400">-</td>
            <td className="py-3 px-4 text-right text-[11px] text-slate-400">-</td>
            <td className="py-3 px-4 text-right text-[11px] text-slate-400">-</td>
            <td className="py-3 px-4 text-right text-[11px] text-blue-700 font-bold">{formatCurrency(openingBalance)}</td>
          </tr>

          {/* Ledger Entries */}
          {entries.map((entry, index) => (
            <tr key={index} className="border-b border-slate-100 hover:bg-slate-50/30 transition-colors">
              <td className="py-3 px-4 text-[11px] text-slate-600">
                {new Date(entry.date).toLocaleDateString()}
              </td>
              <td className="py-3 px-4 text-[11px] text-slate-800 font-medium">
                {entry.description}
              </td>
              <td className="py-3 px-4 text-[11px] text-slate-500 font-mono">
                {entry.reference}
              </td>
              <td className="py-3 px-4 text-right text-[11px] text-rose-600 font-semibold">
                {entry.debit ? formatCurrency(entry.debit) : '-'}
              </td>
              <td className="py-3 px-4 text-right text-[11px] text-emerald-600 font-semibold">
                {entry.credit ? formatCurrency(entry.credit) : '-'}
              </td>
              <td className="py-3 px-4 text-right text-[11px] text-slate-900 font-bold">
                {formatCurrency(entry.balance)}
              </td>
            </tr>
          ))}

          {/* Closing Balance Row */}
          <tr className="border-t-2 border-slate-200 bg-slate-50 font-bold">
            <td className="py-4 px-4 text-[11px] text-slate-400 italic">End-period</td>
            <td className="py-4 px-4 text-[11px] text-slate-900 uppercase tracking-tight" colSpan={4}>Closing Statement Balance</td>
            <td className="py-4 px-4 text-right text-[12px] text-blue-800 font-black underline decoration-2 underline-offset-4">
              {formatCurrency(closingBalance)}
            </td>
          </tr>
        </tbody>
      </table>

      <style>{`
        .statement-ledger thead {
          display: table-header-group !important;
        }
        @media print {
          .statement-ledger table {
            page-break-inside: auto;
          }
          .statement-ledger tr {
            page-break-inside: avoid;
            page-break-after: auto;
          }
        }
      `}</style>
    </div>
  );
};

export default StatementLedger;
