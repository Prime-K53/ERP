
import React, { useState, useMemo } from 'react';
import { Scale, CheckCircle, AlertTriangle, Search, Calendar } from 'lucide-react';
import { useFinance } from '../../context/FinanceContext';
import { useAuth } from '../../context/AuthContext';

const paper = '#FEFDFB', ink = '#23282A', inkSoft = '#5c6567', hairline = '#e4ddd1';

const Reconciliation: React.FC = () => {
  const { accounts, ledger, toggleReconciled } = useFinance();
  const { companyConfig } = useAuth();
  const currency = companyConfig?.currencySymbol || '$';

  // State
  const [selectedAccountId, setSelectedAccountId] = useState<string>('');
  const [statementDate, setStatementDate] = useState(new Date().toISOString().split('T')[0]);
  const [statementBalance, setStatementBalance] = useState<string>('0');
  const [filterText, setFilterText] = useState('');

  // Filter accounts (Only Assets usually reconciled)
  const bankAccounts = accounts.filter(a => a.type === 'Asset');

  // Get transactions for selected account up to statement date
  const transactions = useMemo(() => {
      if (!selectedAccountId) return [];
      return ledger
        .filter(entry => 
            (entry.debitAccountId === selectedAccountId || entry.creditAccountId === selectedAccountId) &&
            new Date(entry.date) <= new Date(statementDate)
        )
        .sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [ledger, selectedAccountId, statementDate]);

  // Calculate Balances
  const clearedBalance = useMemo(() => {
      return transactions
        .filter(t => t.reconciled)
        .reduce((sum, t) => {
            const isDebit = t.debitAccountId === selectedAccountId;
            // For Asset: Debit increases, Credit decreases
            return sum + (isDebit ? t.amount : -t.amount);
        }, 0);
  }, [transactions, selectedAccountId]);

  const bookBalance = useMemo(() => {
      return transactions.reduce((sum, t) => {
          const isDebit = t.debitAccountId === selectedAccountId;
          return sum + (isDebit ? t.amount : -t.amount);
      }, 0);
  }, [transactions, selectedAccountId]);

  const adjustedBankBalance = parseFloat(statementBalance) || 0;
  const difference = adjustedBankBalance - clearedBalance;
  const isBalanced = Math.abs(difference) < 0.01;

  const filteredTransactions = transactions.filter(t => 
      t.description.toLowerCase().includes(filterText.toLowerCase()) ||
      t.referenceId?.toLowerCase().includes(filterText.toLowerCase()) ||
      t.amount.toString().includes(filterText)
  );

  return (
    <div className="p-6 max-w-[1600px] mx-auto h-[calc(100vh-4rem)] flex flex-col">
        <div className="mb-4 shrink-0">
            <h1 className="text-lg font-bold text-slate-900 flex items-center gap-2"><Scale className="text-blue-600" size={20}/> Bank Reconciliation</h1>
            <p className="text-xs text-slate-500 mt-0.5">Match system records with bank statements.</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6 shrink-0">
            {/* Controls */}
            <div className="prime-card" style={{ background: paper, padding: 16, borderRadius: 14, border: `1.4px solid ${hairline}`, display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div>
                    <label className="block text-xs font-bold text-slate-500 mb-1">Select Bank Account</label>
                    <select 
                        className="w-full p-1.5 border border-slate-300 rounded-lg text-sm"
                        value={selectedAccountId}
                        onChange={e => setSelectedAccountId(e.target.value)}
                    >
                        <option value="">-- Choose Account --</option>
                        {bankAccounts.map(acc => <option key={acc.id} value={acc.id}>{acc.name} ({acc.code})</option>)}
                    </select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                    <div>
                        <label className="block text-xs font-bold text-slate-500 mb-1">Statement Date</label>
                        <input type="date" className="w-full p-1.5 border border-slate-300 rounded-lg text-sm" value={statementDate} onChange={e => setStatementDate(e.target.value)}/>
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-slate-500 mb-1">Ending Balance</label>
                        <input type="number" className="w-full p-1.5 border border-slate-300 rounded-lg font-bold text-sm" value={statementBalance} onChange={e => setStatementBalance(e.target.value)}/>
                    </div>
                </div>
            </div>

            {/* Summary Cards */}
            <div className="lg:col-span-2 grid grid-cols-3 gap-3">
                <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 flex flex-col justify-center">
                    <span className="text-[10px] font-bold text-slate-500 uppercase">Statement Balance</span>
                    <span className="text-xl font-bold text-slate-900">{currency}{parseFloat(statementBalance).toLocaleString(undefined, {minimumFractionDigits: 2})}</span>
                </div>
                <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 flex flex-col justify-center">
                    <span className="text-[10px] font-bold text-slate-500 uppercase">Cleared Balance</span>
                    <span className="text-xl font-bold text-blue-600">{currency}{clearedBalance.toLocaleString(undefined, {minimumFractionDigits: 2})}</span>
                    <span className="text-[10px] text-slate-400">System Total (Checked)</span>
                </div>
                <div className={`p-4 rounded-xl border flex flex-col justify-center ${isBalanced ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200'}`}>
                    <span className={`text-[10px] font-bold uppercase ${isBalanced ? 'text-emerald-600' : 'text-red-600'}`}>Difference</span>
                    <span className={`text-xl font-bold ${isBalanced ? 'text-emerald-700' : 'text-red-700'}`}>{currency}{Math.abs(difference).toLocaleString(undefined, {minimumFractionDigits: 2})}</span>
                    <span className="text-[10px] font-medium flex items-center gap-1">
                        {isBalanced ? <><CheckCircle size={10}/> Balanced</> : <><AlertTriangle size={10}/> Unbalanced</>}
                    </span>
                </div>
            </div>
        </div>

        {/* Transactions List */}
        {selectedAccountId && (
            <div className="flex-1 prime-card" style={{ background: paper, borderRadius: 14, border: `1.4px solid ${hairline}`, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                <div className="p-3" style={{ borderBottom: `1.4px solid ${hairline}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#eef7f6' }}>
                    <h3 className="font-bold text-sm text-slate-800">Transactions</h3>
                    <div className="relative w-56">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" size={14}/>
                        <input type="text" className="w-full pl-8 p-1.5 border border-slate-300 rounded-lg text-xs" placeholder="Search..." value={filterText} onChange={e => setFilterText(e.target.value)}/>
                    </div>
                </div>
                <div className="flex-1 overflow-y-auto">
                    <table className="w-full text-left text-sm">
                        <thead className="bg-white sticky top-0 z-10 text-xs" style={{ color: inkSoft, borderBottom: `1.4px solid ${hairline}` }}>
                            <tr>
                                <th className="p-3 w-16 text-center">Status</th>
                                <th className="p-3">Date</th>
                                <th className="p-3">Reference</th>
                                <th className="p-3">Description</th>
                                <th className="p-3 text-right">Amount</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {filteredTransactions.map(t => {
                                const isDebit = t.debitAccountId === selectedAccountId;
                                const amount = isDebit ? t.amount : -t.amount;
                                return (
                                    <tr 
                                        key={t.id} 
                                        className={`hover:bg-slate-50 cursor-pointer ${t.reconciled ? 'bg-blue-50/30' : ''}`}
                                        onClick={() => toggleReconciled(t.id)}
                                    >
                                        <td className="p-3 text-center">
                                            <div className={`w-4 h-4 rounded border mx-auto flex items-center justify-center transition-colors ${t.reconciled ? 'bg-blue-600 border-blue-600 text-white' : 'border-slate-300'}`}>
                                                {t.reconciled && <CheckCircle size={12}/>}
                                            </div>
                                        </td>
                                        <td className="p-3 text-slate-500 text-xs">{new Date(t.date).toLocaleDateString()}</td>
                                        <td className="p-3 font-mono text-[10px] text-slate-400">{t.referenceId || '-'}</td>
                                        <td className="p-3 font-medium text-slate-800 text-xs">{t.description}</td>
                                        <td className={`p-3 text-right font-bold text-xs ${amount >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                                            {currency}{amount.toFixed(2)}
                                        </td>
                                    </tr>
                                );
                            })}
                            {filteredTransactions.length === 0 && <tr><td colSpan={5} className="p-8 text-center text-slate-400">No transactions found for this period.</td></tr>}
                        </tbody>
                    </table>
                </div>
                <div className="p-3 flex justify-between items-center text-xs" style={{ borderTop: `1.4px solid ${hairline}`, background: '#eef7f6' }}>
                    <div className="text-slate-500">
                        Showing {filteredTransactions.length} transactions.
                    </div>
                    <div>
                        Book Balance: <span className="font-bold text-slate-900">{currency}{bookBalance.toLocaleString(undefined, {minimumFractionDigits: 2})}</span>
                    </div>
                </div>
            </div>
        )}
    </div>
  );
};

export default Reconciliation;
