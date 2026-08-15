import React, { useMemo } from 'react';
import { useData } from '../context/DataContext';
import { Landmark, Wallet, Banknote, Clock, ArrowUpRight } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { currencyService } from '../services/currencyService';

export const AccountsCard: React.FC = () => {
  const { 
    customerPayments = [], 
    companyConfig,
    sales = []
  } = useData();

  const currency = currencyService.getCurrency(currencyService.getBaseCurrency())?.symbol || '$';

  const accountsData = useMemo(() => {
    const mappings = [
      { key: 'Online Store', label: 'Cash Account', icon: <Banknote size={18} className="text-emerald-500" />, bgColor: 'bg-emerald-50' },
      { key: 'Housekeeping', label: 'Bank Account', icon: <Landmark size={18} className="text-blue-500" />, bgColor: 'bg-blue-50' },
      { key: 'Tickets', label: 'Mobile Money', icon: <Wallet size={18} className="text-amber-500" />, bgColor: 'bg-amber-50' }
    ];

    return mappings.map(mapping => {
      // Filter payments and sales for this sub-account
      const accountPayments = customerPayments.filter((p: any) => p.subAccountName === mapping.key);
      const accountSales = sales.filter((s: any) => s.subAccountName === mapping.key);

      // Combine dates to find the last received date
      const allDates = [
        ...accountPayments.map((p: any) => p.date),
        ...accountSales.map((s: any) => s.date)
      ].filter(Boolean);

      const lastDate = allDates.length > 0 
        ? format(parseISO(allDates.sort().reverse()[0]), 'dd MMM yyyy')
        : 'No transactions';

      // Calculate balance (total received)
      const totalPayments = accountPayments.reduce((sum: number, p: any) => sum + (p.amount || 0), 0);
      const totalSales = accountSales.reduce((sum: number, s: any) => sum + (s.totalAmount || 0), 0);
      const balance = totalPayments + totalSales;

      return {
        ...mapping,
        lastDate,
        balance
      };
    });
  }, [customerPayments, sales]);

  return (
    <div className="bg-white p-4 rounded-[2rem] shadow-soft border border-slate-50 mb-6">
      <div className="flex justify-between items-center mb-4 px-1">
        <h3 className="text-[14px] font-bold text-slate-900 tracking-tight">Accounts</h3>
        <div className="p-1.5 bg-slate-50 rounded-lg text-slate-400">
          <Clock size={14} />
        </div>
      </div>

      <div className="space-y-2.5">
        {accountsData.map((account) => (
          <div 
            key={account.key}
            className="flex items-center gap-3 p-3 rounded-2xl hover:bg-slate-50 transition-all group border border-transparent hover:border-slate-100"
          >
            <div className={`w-10 h-10 ${account.bgColor} rounded-xl flex items-center justify-center shrink-0 shadow-sm group-hover:scale-105 transition-transform`}>
              {React.cloneElement(account.icon as React.ReactElement<any>, { size: 16 })}
            </div>
            
            <div className="flex-1 min-w-0">
              <div className="flex justify-between items-start mb-0.5">
                <p className="text-[11px] font-bold text-slate-800 truncate">{account.label}</p>
                <span className="text-[10px] font-black text-slate-900 finance-nums">
                  {currency}{account.balance.toLocaleString()}
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-1 h-1 rounded-full bg-slate-300" />
                <p className="text-[9px] font-medium text-slate-400">
                  Last received: <span className="text-slate-500">{account.lastDate}</span>
                </p>
              </div>
            </div>

            <div className="opacity-0 group-hover:opacity-100 transition-opacity">
              <ArrowUpRight size={12} className="text-slate-300" />
            </div>
          </div>
        ))}
      </div>

      <div className="mt-4 pt-4 border-t border-slate-50 px-1">
        <div className="flex items-center justify-between text-[9px] font-bold text-slate-400 uppercase tracking-wider">
          <span>Total Balance</span>
          <span className="text-blue-600">
            {currency}{accountsData.reduce((sum, acc) => sum + acc.balance, 0).toLocaleString()}
          </span>
        </div>
      </div>
    </div>
  );
};
