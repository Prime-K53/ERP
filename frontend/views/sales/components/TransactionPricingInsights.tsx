import React, { useMemo } from 'react';
import { ArrowDownRight, ArrowUpRight, Coins, Layers3, TrendingUp, Wallet } from 'lucide-react';
import { resolveTransactionPricingSummary } from '../../../utils/pricingBreakdown';

interface TransactionPricingInsightsProps {
  transaction: any;
  currencySymbol: string;
  title?: string;
}

const formatMoney = (currencySymbol: string, value: number) =>
  `${currencySymbol}${Number(value || 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;



export const TransactionPricingInsights: React.FC<TransactionPricingInsightsProps> = ({
  transaction,
  currencySymbol,
  title = 'Internal Pricing Breakdown',
}) => {
  const summary = useMemo(() => resolveTransactionPricingSummary(transaction), [transaction]);

  const hasData = useMemo(() => {
    return Math.abs(summary.materialTotal) > 0.0001
      || Math.abs(summary.adjustmentTotal) > 0.0001
      || Math.abs(summary.profitMarginTotal) > 0.0001
      || Math.abs(summary.roundingTotal) > 0.0001
      || (summary.adjustmentSnapshots || []).length > 0;
  }, [summary]);

  if (!hasData) return null;

  return (
    <div className="bg-white rounded-[1.25rem] border border-slate-200 overflow-hidden shadow-sm">
      <div className="px-6 py-4 border-b border-slate-100 bg-slate-50 flex items-center justify-between gap-4">
        <div>
          <h3 className="font-semibold text-slate-700 tracking-tight text-[13.5px]">{title}</h3>
          <p className="text-[12px] text-slate-500 mt-1">Visible in the sales workspace only, hidden from customer documents.</p>
        </div>
      </div>

      <div className="p-6 space-y-5">
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-white p-3 md:p-4 rounded-xl shadow-sm border border-slate-100 flex items-start gap-4 border-l-4 border-l-slate-500 hover:bg-slate-50 transition-all duration-200">
            <div className="p-2.5 bg-slate-50 text-slate-600 rounded-lg shrink-0">
              <Layers3 size={20} />
            </div>
            <div>
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-tight leading-none mb-1.5">Material Cost</p>
              <p className="text-lg md:text-xl font-semibold text-slate-900 finance-nums">{formatMoney(currencySymbol, summary.materialTotal)}</p>
            </div>
          </div>

          <div className="bg-white p-3 md:p-4 rounded-xl shadow-sm border border-slate-100 flex items-start gap-4 border-l-4 border-l-indigo-500 hover:bg-slate-50 transition-all duration-200">
            <div className="p-2.5 bg-indigo-50 text-indigo-600 rounded-lg shrink-0">
              <Coins size={20} />
            </div>
            <div>
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-tight leading-none mb-1.5">Adjustments</p>
              <p className="text-lg md:text-xl font-semibold text-indigo-700 finance-nums">{formatMoney(currencySymbol, summary.adjustmentTotal)}</p>
            </div>
          </div>

          <div className="bg-white p-3 md:p-4 rounded-xl shadow-sm border border-slate-100 flex items-start gap-4 border-l-4 border-l-emerald-500 hover:bg-slate-50 transition-all duration-200">
            <div className="p-2.5 bg-emerald-50 text-emerald-600 rounded-lg shrink-0">
              <TrendingUp size={20} />
            </div>
            <div>
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-tight leading-none mb-1.5">Profit Markup</p>
              <p className={`text-lg md:text-xl font-semibold finance-nums ${summary.profitMarginTotal >= 0 ? 'text-slate-900' : 'text-rose-600'}`}>{formatMoney(currencySymbol, summary.profitMarginTotal)}</p>
            </div>
          </div>

          <div className="bg-white p-3 md:p-4 rounded-xl shadow-sm border border-slate-100 flex items-start gap-4 border-l-4 border-l-blue-500 hover:bg-slate-50 transition-all duration-200">
            <div className="p-2.5 bg-blue-50 text-blue-600 rounded-lg shrink-0">
              {summary.roundingTotal >= 0 ? <ArrowUpRight size={20} /> : <ArrowDownRight size={20} />}
            </div>
            <div>
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-tight leading-none mb-1.5">Round Up / Down</p>
              <p className={`text-lg md:text-xl font-semibold finance-nums ${summary.roundingTotal >= 0 ? 'text-slate-900' : 'text-rose-600'}`}>
                {summary.roundingTotal >= 0 ? '+' : ''}
                {formatMoney(currencySymbol, summary.roundingTotal)}
              </p>
            </div>
          </div>
        </div>

        {(summary.adjustmentSnapshots || []).length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-[12px] font-semibold text-slate-500 uppercase tracking-widest">
              <Wallet size={14} className="text-indigo-500" />
              Adjustment Ledger
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {(summary.adjustmentSnapshots || []).map((snapshot: any, index: number) => (
                <div key={`${snapshot?.adjustmentId || snapshot?.name || 'adjustment'}-${index}`} className="rounded-xl border border-indigo-100 bg-indigo-50/40 px-4 py-3">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="text-[13px] font-bold text-slate-800">{snapshot?.name || 'Adjustment'}</p>
                      <p className="text-[11px] text-slate-500 font-medium">
                        {String(snapshot?.type || '').toUpperCase() === 'PERCENTAGE'
                          ? `${Number(snapshot?.value || 0)}%`
                          : 'Fixed amount'}
                      </p>
                    </div>
                    <div className="text-right text-[13px] font-black text-indigo-700 tabular-nums">
                      {formatMoney(currencySymbol, Number(snapshot?.calculatedAmount || 0))}
                    </div>
                  </div>
                </div>
              ))}
              {Math.abs(summary.roundingTotal) > 0.0001 && (
                <div className="rounded-xl border border-blue-100 bg-blue-50/40 px-4 py-3">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="text-[13px] font-bold text-slate-800">Rounding Adjustment</p>
                      <p className="text-[11px] text-slate-500 font-medium">Automatic precision</p>
                    </div>
                    <div className={`text-right text-[13px] font-black tabular-nums ${summary.roundingTotal >= 0 ? 'text-blue-700' : 'text-rose-600'}`}>
                      {summary.roundingTotal >= 0 ? '+' : ''}
                      {formatMoney(currencySymbol, summary.roundingTotal)}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default TransactionPricingInsights;
