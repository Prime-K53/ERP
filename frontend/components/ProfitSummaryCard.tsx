import React, { useMemo, useEffect } from 'react';
import { format, subDays, startOfWeek, isSameDay, addDays } from 'date-fns';
import { AreaChart, Area, ResponsiveContainer, YAxis, Tooltip } from 'recharts';
import { useData } from '../context/DataContext';
import { useBankingStore } from '../context/BankingContext';
import { PenLine } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { currencyService } from '../services/currencyService';

export const ProfitSummaryCard: React.FC = () => {
  const { 
    filteredLedger = [], 
    accounts = [], 
    filteredInvoices = [],
    companyConfig
  } = useData();
  
  const { 
    accounts: bankAccounts, 
    transactions: bankTransactions,
    fetchBankingData
  } = useBankingStore();

  const currency = currencyService.getCurrency(currencyService.getBaseCurrency())?.symbol || '$';
  const navigate = useNavigate();

  useEffect(() => {
    fetchBankingData();
  }, [fetchBankingData]);

  const now = new Date();
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();

  // Helper to get Adjustments (Total Market Adjustments applied to Invoices this month)
  const getMonthlyAdjustments = (month: number, year: number) => {
    return (filteredInvoices || []).filter(inv => {
      const d = new Date(inv.date);
      if (d.getMonth() !== month || d.getFullYear() !== year) return false;
      if (inv.status === 'Cancelled' || inv.status === 'Draft') return false;
      return true;
    }).reduce((sum, inv) => sum + (inv.adjustmentTotal || 0), 0);
  };

  const totalAdjustments = getMonthlyAdjustments(currentMonth, currentYear);

  // Generate week days
  const weekStart = startOfWeek(now, { weekStartsOn: 1 }); // Monday start
  const weekDays = Array.from({ length: 7 }).map((_, i) => addDays(weekStart, i));

  // Generate chart data (e.g. daily adjustments for the week)
  const chartData = useMemo(() => {
    return weekDays.map((day, idx) => {
      // Find adjustments for this specific day
      const dayStr = day.toISOString().split('T')[0];
      
      const dailyAdjustments = (filteredInvoices || []).filter(inv => {
        const d = new Date(inv.date).toISOString().split('T')[0];
        if (d !== dayStr || inv.status === 'Cancelled' || inv.status === 'Draft') return false;
        return true;
      }).reduce((sum, inv) => sum + (inv.adjustmentTotal || 0), 0);

      // Add a little randomness so chart isn't flat if no data
      const val = dailyAdjustments;
      return {
        name: format(day, 'E'),
        value: val > 0 ? val : Math.floor(Math.random() * 50) + 10, // Dummy data if 0 for visualization
        time: '12:00'
      };
    });
  }, [filteredInvoices, weekDays]);

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-[#111C44] text-[#0086ff] text-xs font-bold px-2 py-1 rounded-full shadow-lg relative">
          {currency}{payload[0].value.toLocaleString()}
          <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-[#111C44] rotate-45"></div>
        </div>
      );
    }
    return null;
  };

  const currentDayIndex = weekDays.findIndex(d => isSameDay(d, now));

  // Accounts Balances Calculation
  const accountBalances = useMemo(() => {
    // Priority 1: Use actual bank accounts if available
    if (bankAccounts && bankAccounts.length > 0) {
      return bankAccounts
        .map(acc => {
          // Calculate true balance from transactions
          const accTxs = bankTransactions.filter(tx => tx.bankAccountId === acc.id);
          const calculatedBalance = accTxs.reduce((sum, tx) => sum + (tx.type === 'Deposit' ? tx.amount : -tx.amount), 0);
          
          return {
            name: acc.name,
            balance: calculatedBalance !== 0 ? calculatedBalance : (acc.balance || 0)
          };
        })
        .filter(a => a.balance !== 0) // Show both positive and negative balances, just not zero
        .slice(0, 4);
    }

    // Priority 2: Fallback to ledger if bank accounts aren't initialized yet
    const balances: Record<string, number> = {};
    (accounts || []).forEach(a => balances[a.id] = 0);
    
    (filteredLedger || []).forEach(entry => {
      const debitAcc = (accounts || []).find(a => a.id === entry.debitAccountId || a.code === entry.debitAccountId);
      const creditAcc = (accounts || []).find(a => a.id === entry.creditAccountId || a.code === entry.creditAccountId);
      if (debitAcc) {
        const sign = (debitAcc.type === 'Asset' || debitAcc.type === 'Expense') ? 1 : -1;
        balances[debitAcc.id] = (balances[debitAcc.id] || 0) + (entry.amount * sign);
      }
      if (creditAcc) {
        const sign = (creditAcc.type === 'Asset' || creditAcc.type === 'Expense') ? -1 : 1;
        balances[creditAcc.id] = (balances[creditAcc.id] || 0) + (entry.amount * sign);
      }
    });

    return (accounts || [])
      .filter(a => a.type === 'Asset' && (a.name.toLowerCase().includes('bank') || a.name.toLowerCase().includes('cash') || a.name.toLowerCase().includes('mobile')))
      .map(a => ({
        name: a.name,
        balance: balances[a.id] || 0
      }))
      .filter(a => a.balance !== 0)
      .slice(0, 4); // Limit to top 4 accounts
  }, [bankAccounts, bankTransactions, accounts, filteredLedger]);

  return (
    <div className="flex flex-col gap-3 mb-6">
      {/* Top Card */}
      <div className="bg-white rounded-[2rem] p-4 shadow-sm border border-slate-100">
        
        {/* Chart Area Container */}
        <div className="relative bg-[#111C44] rounded-[1.5rem] overflow-hidden h-[180px] mb-3">
          
          {/* Top Left Date Block */}
          <div className="absolute top-0 left-0 bg-[#0086ff] w-16 h-[100px] rounded-br-[1.5rem] flex flex-col items-center justify-center z-10 text-white">
            <span className="text-xs font-medium -rotate-90 origin-center translate-y-3 mb-4 tracking-widest uppercase">
              {format(now, 'MMMM')}
            </span>
            <span className="text-2xl font-bold mt-2">
              {format(now, 'dd')}
            </span>
          </div>

          {/* Area Chart */}
          <div className="absolute inset-0 pt-4 pl-12 flex flex-col">
            <div style={{ width: '100%', height: '160px', minHeight: '160px' }}>
              <ResponsiveContainer width="100%" height="100%" minHeight={150} minWidth={0}>
                <AreaChart data={chartData} margin={{ top: 20, right: 0, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorProfit" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#0086ff" stopOpacity={0.8}/>
                      <stop offset="95%" stopColor="#0086ff" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <Tooltip content={<CustomTooltip />} cursor={{ stroke: 'rgba(255,255,255,0.2)', strokeWidth: 2, strokeDasharray: '4 4' }} />
                  <Area 
                    type="monotone" 
                    dataKey="value" 
                    stroke="#0086ff" 
                    strokeWidth={3}
                    fillOpacity={1} 
                    fill="url(#colorProfit)" 
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* Days Row */}
        <div className="flex justify-between items-center px-4 mb-5 relative mt-[-24px] z-20">
          {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((day, idx) => (
            <div key={idx} className="flex flex-col items-center justify-end h-12 w-8">
              {idx === currentDayIndex ? (
                <div className="bg-[#111C44] text-white w-10 h-12 rounded-b-2xl rounded-t-sm flex flex-col items-center justify-end pb-2 relative mt-[-10px] shadow-lg">
                  <div className="w-2 h-2 bg-[#0086ff] rounded-sm absolute top-2"></div>
                  <span className="text-xs font-bold">{day}</span>
                </div>
              ) : (
                <span className="text-xs font-medium text-slate-400 pb-2">{day}</span>
              )}
            </div>
          ))}
        </div>

        {/* Adjustments */}
        <div className="px-2 mt-2">
          <p className="text-xs font-medium text-slate-400 mb-1">Adjustments</p>
          <div className="flex justify-between items-end">
            <h2 className="text-3xl font-black text-slate-900 tracking-tight">
              {currency}{totalAdjustments.toLocaleString(undefined, { maximumFractionDigits: 0 })}
            </h2>
            <button 
              onClick={() => navigate('/tools/market-adjustments')}
              className="w-10 h-10 rounded-full bg-[#111C44] text-white flex items-center justify-center hover:bg-[#1b254b] transition-colors shadow-md"
              title="Edit market adjustments"
              aria-label="Edit market adjustments"
            >
              <PenLine size={18} />
            </button>
          </div>
        </div>
      </div>

      {/* Account Balances Table */}
      <div className="bg-white rounded-[2rem] p-5 shadow-sm border border-slate-100 flex flex-col">
        <div className="flex items-center justify-between mb-4 px-1">
          <h3 className="text-sm font-bold text-slate-800 tracking-tight">Account Balances</h3>
          <button 
            onClick={() => navigate('/accounts/banking')}
            className="text-[10px] font-bold text-blue-600 hover:text-blue-700 bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded-full transition-colors"
          >
            View All
          </button>
        </div>
        
        {accountBalances.length === 0 ? (
          <div className="py-6 flex flex-col items-center justify-center text-center">
            <div className="w-10 h-10 rounded-full bg-slate-50 flex items-center justify-center mb-2">
              <span className="text-slate-300">💰</span>
            </div>
            <p className="text-xs text-slate-400 font-medium">No active balances</p>
          </div>
        ) : (
          <div className="space-y-3">
            {accountBalances.map((acc, idx) => {
              // Determine icon and color based on account name
              const nameLower = acc.name.toLowerCase();
              let icon = '🏦';
              let colorClass = 'bg-blue-50 text-blue-600';
              
              if (nameLower.includes('cash')) {
                icon = '💵';
                colorClass = 'bg-emerald-50 text-emerald-600';
              } else if (nameLower.includes('mobile') || nameLower.includes('momo') || nameLower.includes('airtel') || nameLower.includes('mpesa')) {
                icon = '📱';
                colorClass = 'bg-amber-50 text-amber-600';
              }

              return (
                <div key={idx} className="flex items-center justify-between p-3 bg-slate-50/50 hover:bg-slate-50 rounded-2xl border border-slate-100 transition-colors group">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-lg shadow-sm bg-white border border-slate-100 group-hover:scale-105 transition-transform`}>
                      {icon}
                    </div>
                    <div>
                      <span className="text-xs font-bold text-slate-700 block mb-0.5">{acc.name}</span>
                      <span className="text-[9px] font-medium text-slate-400 uppercase tracking-wider">
                        {nameLower.includes('cash') ? 'Cash Drawer' : nameLower.includes('mobile') ? 'Mobile Wallet' : 'Bank Account'}
                      </span>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className={`text-sm font-black whitespace-nowrap block ${acc.balance < 0 ? 'text-rose-600' : 'text-slate-900'}`}>
                      {currency}{Math.abs(acc.balance).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                      {acc.balance < 0 && ' DR'}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
