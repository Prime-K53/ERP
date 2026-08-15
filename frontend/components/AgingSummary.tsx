import React from 'react';

interface AgingSummaryProps {
  current: number;
  thirty: number;
  sixty: number;
  ninetyPlus: number;
  currencySymbol?: string;
}

/**
 * AgingSummary Component
 * Displays a professional debt aging footer for statements.
 * Helps customers see overdue amounts at a glance.
 */
const AgingSummary: React.FC<AgingSummaryProps> = ({
  current,
  thirty,
  sixty,
  ninetyPlus,
  currencySymbol = '$'
}) => {
  const formatCurrency = (amount: number) => {
    return `${currencySymbol}${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const totalOutstanding = current + thirty + sixty + ninetyPlus;

  const parts = [
    current > 0 ? `Current balance is ${formatCurrency(current)}` : null,
    thirty > 0 ? `30-day outstanding is ${formatCurrency(thirty)}` : null,
    sixty > 0 ? `60-day outstanding is ${formatCurrency(sixty)}` : null,
    ninetyPlus > 0 ? `90+ day outstanding is ${formatCurrency(ninetyPlus)}` : null,
  ].filter(Boolean);

  const summary = parts.length > 0 ? `${parts.join('. ')}.` : 'No outstanding balance.';

  return (
    <div className="aging-summary mt-8 pt-4 border-t border-slate-100">
      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">Aging Analysis Summary</p>
      <p className="text-[13px] text-slate-700 leading-relaxed">
        {summary} Total outstanding is {formatCurrency(totalOutstanding)}.
      </p>

      <style>{`
        @media print {
          .aging-summary {
            break-inside: avoid;
          }
        }
      `}</style>
    </div>
  );
};

export default AgingSummary;
