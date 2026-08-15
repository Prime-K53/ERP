
import React, { useState, useMemo, useEffect } from 'react';
import { Target, Save, AlertCircle, TrendingUp, ArrowRight, FileText, ChevronRight, X } from 'lucide-react';
import { useFinance } from '../../context/FinanceContext';
import { useAuth } from '../../context/AuthContext';
import { Budget } from '../../types';
import { useNavigate, useSearchParams } from 'react-router-dom';

const Budgets: React.FC = () => {
  const { accounts, ledger, budgets, saveBudget } = useFinance();
  const { companyConfig } = useAuth();
  const currency = companyConfig.currencySymbol;
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  
  const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().slice(0, 7)); // YYYY-MM
  const [budgetType, setBudgetType] = useState<'Expense' | 'Revenue'>('Expense');

  useEffect(() => {
    const month = searchParams.get('month');
    const type = searchParams.get('type');
    if (month) setSelectedMonth(month);
    if (type === 'Revenue' || type === 'Expense') setBudgetType(type);
  }, [searchParams]);

  // Filter for Accounts based on type
  const targetAccounts = accounts.filter(a => a.type === budgetType);

  // Calculate Actuals vs Budget
  const budgetData = useMemo(() => {
      return targetAccounts.map(acc => {
          // Get budget for this account & month
          const budget = budgets.find(b => b.accountId === acc.id && b.month === selectedMonth);
          const limit = budget?.amount || 0;

          // Calculate Actuals
          // Sum movements to this account in selected month
          const actual = ledger
            .filter(t => 
                (t.debitAccountId === acc.id || t.creditAccountId === acc.id) && 
                t.date.startsWith(selectedMonth)
            )
            .reduce((sum, t) => {
                const sign = (acc.type === 'Revenue' || acc.type === 'Liability' || acc.type === 'Equity')
                    ? (t.creditAccountId === acc.id ? 1 : -1)
                    : (t.debitAccountId === acc.id ? 1 : -1);
                return sum + (t.amount * sign);
            }, 0);

          const variance = budgetType === 'Expense' ? limit - actual : actual - limit;
          const percent = limit > 0 ? (actual / limit) * 100 : 0;

          return { ...acc, limit, actual, variance, percent, budgetId: budget?.id };
      });
  }, [targetAccounts, ledger, budgets, selectedMonth, budgetType]);

  const totalBudget = budgetData.reduce((s, b) => s + b.limit, 0);
  const totalActual = budgetData.reduce((s, b) => s + b.actual, 0);

  return (
    <div className="p-6 max-w-[1600px] mx-auto h-[calc(100vh-4rem)] flex flex-col">
        <div className="mb-8 flex flex-col md:flex-row justify-between md:items-end gap-6 shrink-0">
            <div>
                <h1 className="text-3xl font-black text-slate-900 flex items-center gap-3 tracking-tighter uppercase">
                    <Target className="text-blue-600" size={32}/> Budgeting & Control
                </h1>
                <p className="text-slate-400 font-bold uppercase text-[10px] tracking-widest mt-1">Set targets and track performance variance</p>
            </div>
            <div className="flex flex-col md:flex-row gap-4 items-center">
                <div className="flex bg-white border border-slate-200 rounded-2xl p-1 shadow-sm">
                    <button 
                        onClick={() => setBudgetType('Expense')}
                        className={`px-4 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all ${budgetType === 'Expense' ? 'bg-rose-600 text-white shadow-md' : 'text-slate-500 hover:bg-slate-50'}`}
                    >
                        Expenses
                    </button>
                    <button 
                        onClick={() => setBudgetType('Revenue')}
                        className={`px-4 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all ${budgetType === 'Revenue' ? 'bg-emerald-600 text-white shadow-md' : 'text-slate-500 hover:bg-slate-50'}`}
                    >
                        Revenue
                    </button>
                </div>
                <div className="flex items-center gap-2 bg-white border border-slate-200 px-3 py-1.5 rounded-2xl shadow-sm">
                    <TrendingUp size={14} className="text-slate-400"/>
                    <input 
                        type="month" 
                        className="text-xs font-bold bg-transparent outline-none text-slate-700"
                        value={selectedMonth}
                        onChange={e => setSelectedMonth(e.target.value)}
                    />
                </div>
                <div className="flex gap-2">
                    <button 
                        onClick={() => navigate('/fiscal-reports/financials?type=IncomeStatement')}
                        className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 text-slate-600 rounded-2xl text-[9px] font-black uppercase tracking-widest hover:bg-slate-50 transition-all shadow-sm"
                    >
                        <FileText size={14}/> View P&L
                    </button>
                    <button 
                        onClick={() => navigate('/supply-chain/forecasting?tab=cashflow')}
                        className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-2xl text-[9px] font-black uppercase tracking-widest hover:bg-blue-700 transition-all shadow-lg shadow-blue-900/20"
                    >
                        <TrendingUp size={14}/> Forecast
                    </button>
                </div>
            </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8 shrink-0">
            <div className="bg-white p-6 rounded-[2rem] border border-slate-200 shadow-xl relative overflow-hidden group hover:scale-[1.02] transition-transform">
                <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity"><Target size={60}/></div>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Total {budgetType} Target</p>
                <h3 className="text-3xl font-black text-slate-900 mt-1">{currency}{totalBudget.toLocaleString()}</h3>
                <p className="text-[9px] font-bold text-slate-400 mt-2 uppercase tracking-tight">Set for {selectedMonth}</p>
            </div>
            <div className="bg-white p-6 rounded-[2rem] border border-slate-200 shadow-xl relative overflow-hidden group hover:scale-[1.02] transition-transform">
                <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity"><TrendingUp size={60}/></div>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Actual {budgetType === 'Revenue' ? 'Earnings' : 'Spending'}</p>
                <h3 className={`text-3xl font-black mt-1 ${budgetType === 'Expense' ? (totalActual > totalBudget ? 'text-rose-600' : 'text-blue-600') : (totalActual < totalBudget ? 'text-amber-600' : 'text-emerald-600')}`}>
                    {currency}{totalActual.toLocaleString()}
                </h3>
                <p className="text-[9px] font-bold text-slate-400 mt-2 uppercase tracking-tight">Real-time ledger data</p>
            </div>
            <div className={`p-6 rounded-[2rem] border shadow-xl relative overflow-hidden group hover:scale-[1.02] transition-transform ${budgetType === 'Expense' ? (totalBudget - totalActual < 0 ? 'bg-rose-50 border-rose-200' : 'bg-emerald-50 border-emerald-200') : (totalActual >= totalBudget ? 'bg-emerald-50 border-emerald-200' : 'bg-rose-50 border-rose-200')}`}>
                <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity"><AlertCircle size={60}/></div>
                <p className={`text-[10px] font-black uppercase tracking-widest ${budgetType === 'Expense' ? (totalBudget - totalActual < 0 ? 'text-rose-500' : 'text-emerald-500') : (totalActual >= totalBudget ? 'text-emerald-500' : 'text-rose-500')}`}>
                    {budgetType === 'Revenue' ? 'Target Gap' : 'Remaining'}
                </p>
                <h3 className={`text-3xl font-black mt-1 ${budgetType === 'Expense' ? (totalBudget - totalActual < 0 ? 'text-rose-700' : 'text-emerald-700') : (totalActual >= totalBudget ? 'text-emerald-700' : 'text-rose-700')}`}>
                    {currency}{Math.abs(totalBudget - totalActual).toLocaleString()}
                </h3>
                <p className={`text-[9px] font-bold mt-2 uppercase tracking-tight ${budgetType === 'Expense' ? (totalBudget - totalActual < 0 ? 'text-rose-400' : 'text-emerald-400') : (totalActual >= totalBudget ? 'text-emerald-400' : 'text-rose-400')}`}>
                    {budgetType === 'Expense' ? (totalBudget - totalActual < 0 ? 'Over budget' : 'Within budget') : (totalActual >= totalBudget ? 'Target reached' : 'Below target')}
                </p>
            </div>
        </div>

        <div className="bg-white rounded-[2.5rem] shadow-2xl border border-slate-200 flex-1 flex flex-col overflow-hidden">
            <div className="p-6 border-b border-slate-100 bg-slate-50 grid grid-cols-12 gap-4 font-black text-slate-400 text-[10px] uppercase tracking-[0.2em]">
                <div className="col-span-3">Account</div>
                <div className="col-span-2 text-right">Budget</div>
                <div className="col-span-2 text-right">Actual</div>
                <div className="col-span-3 px-4 text-center">Utilization</div>
                <div className="col-span-2 text-right">Variance</div>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-2 custom-scrollbar">
                {budgetData.map(row => (
                    <BudgetRow 
                        key={row.id} 
                        data={row} 
                        month={selectedMonth} 
                        onSave={saveBudget} 
                        currency={currency}
                    />
                ))}
            </div>
        </div>
    </div>
  );
};

const BudgetRow: React.FC<{ data: any, month: string, onSave: (b: Budget) => void, currency: string }> = ({ data, month, onSave, currency }) => {
    const [isEditing, setIsEditing] = useState(false);
    const [limit, setLimit] = useState(data.limit);

    const handleSave = () => {
        onSave({
            id: data.budgetId || '', 
            accountId: data.id,
            month,
            amount: parseFloat(limit)
        });
        setIsEditing(false);
    };

    return (
        <div className="grid grid-cols-12 gap-4 items-center p-3 hover:bg-slate-50 rounded-lg border border-transparent hover:border-slate-100 transition-colors text-sm">
            <div className="col-span-3 font-medium text-slate-800 truncate" title={data.name}>{data.name}</div>
            
            <div className="col-span-2 text-right">
                {isEditing ? (
                    <div className="flex items-center justify-end gap-1">
                        <input 
                            type="number" 
                            className="w-24 p-1 border border-blue-300 rounded text-right font-bold text-xs"
                            value={limit}
                            onChange={e => setLimit(e.target.value)}
                            autoFocus
                        />
                        <button onClick={handleSave} className="p-1 bg-emerald-100 text-emerald-700 rounded" title="Save" aria-label="Save budget limit"><Save size={14}/></button>
                    </div>
                ) : (
                    <button onClick={() => setIsEditing(true)} className="hover:bg-blue-50 px-2 py-1 rounded text-slate-600 hover:text-blue-600 font-mono">
                        {currency}{data.limit.toLocaleString()}
                    </button>
                )}
            </div>

            <div className="col-span-2 text-right font-mono text-slate-700">
                {currency}{data.actual.toLocaleString()}
            </div>

            <div className="col-span-3 px-4">
                <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden flex">
                    <div 
                        className={`h-full ${data.percent > 100 ? 'bg-red-500' : data.percent > 80 ? 'bg-amber-500' : 'bg-emerald-500'}`} 
                        style={{ width: `${Math.min(100, data.percent)}%` }}
                    ></div>
                </div>
                <div className="text-[10px] text-right mt-1 text-slate-400">{data.percent.toFixed(1)}%</div>
            </div>

            <div className={`col-span-2 text-right font-bold ${data.variance < 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                {currency}{data.variance.toLocaleString()}
            </div>
        </div>
    );
};

export default Budgets;
