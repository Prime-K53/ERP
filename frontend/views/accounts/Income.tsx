
import React, { useState, useMemo } from 'react';
import { DollarSign, Plus, Search, Calendar, CheckCircle, Trash2, Edit2, X, ArrowDownRight } from 'lucide-react';
import { useFinance } from '../../context/FinanceContext';
import { useAuth } from '../../context/AuthContext';
import { useBankingStore } from '../../context/BankingContext';
import { Income } from '../../types';
import { DEFAULT_ACCOUNTS, ACCOUNT_IDS } from '../../constants';
import { getDefaultDate, validateDateInFY } from '../../utils/financialYearUtils';

const paper = '#FEFDFB', ink = '#23282A', inkSoft = '#5c6567', hairline = '#e4ddd1';

const IncomeView: React.FC = () => {
  const { income, addIncome, updateIncome, deleteIncome } = useFinance();
  const { companyConfig, user, notify } = useAuth();
  const { accounts: bankAccounts, fetchBankingData } = useBankingStore();
  const currency = companyConfig.currencySymbol;

  React.useEffect(() => {
    fetchBankingData?.();
  }, [fetchBankingData]);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);

  const [formData, setFormData] = useState<Partial<Income>>({
    date: getDefaultDate(),
    amount: 0,
    category: 'Other Income',
    description: '',
    paymentMethod: 'Cash',
    recordedBy: user?.username || 'System',
    accountId: ACCOUNT_IDS.CASH_DRAWER
  });

  const handleSubmit = (e: React.FormEvent) => {
      e.preventDefault();
      
      const amt = Number(formData.amount);
      if (!formData.amount || isNaN(amt) || amt <= 0) {
          notify("Please enter a valid positive income amount.", "error");
          return;
      }
      if (!formData.category) {
          notify("Selection of an income category is required.", "error");
          return;
      }
      if (!formData.description || !formData.description.trim()) {
          notify("A description is required for this income record.", "error");
          return;
      }

      const dateError = validateDateInFY(formData.date!);
      if (dateError) {
          notify(dateError, "error");
          return;
      }

      const incData = {
          ...formData,
          amount: amt,
          id: editingId || '',
          date: new Date(formData.date!).toISOString()
      } as Income;

      if (editingId) updateIncome(incData);
      else addIncome(incData);

      setIsModalOpen(false);
      resetForm();
      notify("Income record saved successfully.", "success");
  };

  const resetForm = () => {
      setFormData({
        date: getDefaultDate(),
        amount: 0,
        category: 'Other Income',
        description: '',
        paymentMethod: 'Cash',
        recordedBy: user?.username || 'System',
        accountId: ACCOUNT_IDS.CASH_DRAWER
      });
      setEditingId(null);
  };

  const handleEdit = (inc: Income) => {
      setFormData({
          ...inc,
          date: new Date(inc.date).toISOString().split('T')[0]
      });
      setEditingId(inc.id);
      setIsModalOpen(true);
  };

  const filteredIncome = income.filter(i => 
      i.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
      i.category.toLowerCase().includes(searchTerm.toLowerCase())
  ).sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const totalIncome = filteredIncome.reduce((sum, i) => sum + i.amount, 0);

  return (
    <div className="p-6 max-w-[1600px] mx-auto h-[calc(100vh-4rem)] flex flex-col">
        {isModalOpen && (
            <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
                <div className="bg-white rounded-xl shadow-2xl w-full max-w-md animate-fadeIn">
                    <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50 rounded-t-xl">
                        <h2 className="text-xl font-bold text-slate-900">{editingId ? 'Edit Income' : 'Record New Income'}</h2>
                        <button onClick={() => setIsModalOpen(false)}><X size={24} className="text-slate-400 hover:text-slate-600"/></button>
                    </div>
                    <form onSubmit={handleSubmit} className="p-6 space-y-4">
                        <div>
                            <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Amount ({currency})</label>
                            <input 
                                type="number" step="0.01" required 
                                className="w-full p-3 border-2 border-slate-200 rounded-lg text-xl font-bold focus:border-emerald-500 outline-none"
                                value={formData.amount} onChange={e => setFormData({...formData, amount: parseFloat(e.target.value)})}
                                placeholder="0.00" autoFocus
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Category</label>
                            <select className="w-full p-2 border rounded-lg bg-white" value={formData.category} onChange={e => setFormData({...formData, category: e.target.value})}>
                                <option>Other Income</option>
                                <option>Prize / Grant</option>
                                <option>Interest Income</option>
                                <option>Refund Received</option>
                                <option>Asset Sale</option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Description</label>
                            <input type="text" required className="w-full p-2 border rounded-lg" value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})} placeholder="e.g. Competition Prize"/>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Date</label>
                                <input type="date" required className="w-full p-2 border rounded-lg" value={formData.date} onChange={e => setFormData({...formData, date: e.target.value})}/>
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Receipt Account</label>
                                <select 
                                    className="w-full p-2 border rounded-lg bg-white" 
                                    value={formData.accountId} 
                                    onChange={e => setFormData({...formData, accountId: e.target.value})}
                                >
                                    <optgroup label="Default Accounts">
                                        <option value={ACCOUNT_IDS.CASH_DRAWER}>Cash Drawer (1000)</option>
                                        <option value={ACCOUNT_IDS.BANK}>Main Bank Account (1050)</option>
                                        <option value={ACCOUNT_IDS.MOBILE_MONEY}>Mobile Money (1060)</option>
                                    </optgroup>
                                    {(bankAccounts || []).length > 0 && (
                                        <optgroup label="Specific Bank Accounts">
                                            {bankAccounts.filter(a => a.status === 'Active' && !['1000', '1050', '1060'].includes(a.id)).map(acc => (
                                                <option key={acc.id} value={acc.id}>{acc.name} ({acc.bankName})</option>
                                            ))}
                                        </optgroup>
                                    )}
                                </select>
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Method</label>
                                <select className="w-full p-2 border rounded-lg bg-white" value={formData.paymentMethod} onChange={e => setFormData({...formData, paymentMethod: e.target.value as Income['paymentMethod']})}>
                                    <option>Cash</option>
                                    <option>Bank Transfer</option>
                                    <option>Cheque</option>
                                </select>
                            </div>
                        </div>
                        <button type="submit" className="w-full py-3 bg-emerald-600 text-white rounded-lg font-bold hover:bg-emerald-700 mt-2 flex items-center justify-center gap-2">
                            <CheckCircle size={18}/> Save Income
                        </button>
                    </form>
                </div>
            </div>
        )}

        <div className="flex justify-between items-center mb-6">
            <div>
                <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2"><ArrowDownRight className="text-emerald-600"/> Direct Income</h1>
                <p className="text-slate-500 mt-1">Manage non-sales revenue like grants, prizes, or interest.</p>
            </div>
            <div className="flex gap-4">
                <div className="prime-card" style={{ background: paper, border: `1.4px solid ${hairline}`, padding: '8px 16px', borderRadius: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span className="text-xs font-bold text-slate-500 uppercase">Total Income</span>
                    <span className="text-xl font-bold text-emerald-600">{currency}{totalIncome.toLocaleString()}</span>
                </div>
                <button onClick={() => { resetForm(); setIsModalOpen(true); }} className="bg-emerald-600 text-white px-4 py-2 rounded-lg font-bold hover:bg-emerald-700 flex items-center gap-2 shadow-sm">
                    <Plus size={18}/> Add Income
                </button>
            </div>
        </div>

        <div className="prime-card" style={{ background: paper, borderRadius: 14, border: `1.4px solid ${hairline}`, flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div className="p-4 flex justify-between items-center" style={{ borderBottom: `1.4px solid ${hairline}`, background: '#eef7f6' }}>
                <div className="relative w-72">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16}/>
                    <input 
                        type="text" 
                        placeholder="Search income records..."
                        className="w-full pl-9 p-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                    />
                </div>
            </div>
            <div className="flex-1 overflow-y-auto">
                <table className="w-full text-left text-sm">
                    <thead className="bg-white sticky top-0 z-10" style={{ color: inkSoft, borderBottom: `1.4px solid ${hairline}` }}>
                        <tr>
                            <th className="p-4">Date</th>
                            <th className="p-4">Description</th>
                            <th className="p-4">Category</th>
                            <th className="p-4">Method</th>
                            <th className="p-4 text-right">Amount</th>
                            <th className="p-4 text-right">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {filteredIncome.map(inc => (
                            <tr key={inc.id} className="hover:bg-slate-50">
                                <td className="p-4 text-slate-500">
                                    <div className="flex items-center gap-2"><Calendar size={14}/> {new Date(inc.date).toLocaleDateString()}</div>
                                </td>
                                <td className="p-4 font-medium text-slate-900">{inc.description}</td>
                                <td className="p-4"><span className="bg-emerald-50 text-emerald-700 px-2 py-1 rounded text-xs font-bold border border-emerald-100">{inc.category}</span></td>
                                <td className="p-4 text-slate-600">{inc.paymentMethod}</td>
                                <td className="p-4 text-right font-bold text-emerald-600">+{currency}{inc.amount.toFixed(2)}</td>
                                <td className="p-4 text-right flex justify-end gap-2">
                                    <button onClick={() => handleEdit(inc)} className="text-blue-600 hover:text-blue-800 transition-colors"><Edit2 size={16}/></button>
                                    <button onClick={() => deleteIncome(inc.id)} className="text-red-600 hover:text-red-800 transition-colors"><Trash2 size={16}/></button>
                                </td>
                            </tr>
                        ))}
                        {filteredIncome.length === 0 && <tr><td colSpan={6} className="p-12 text-center text-slate-400">No income records found.</td></tr>}
                    </tbody>
                </table>
            </div>
        </div>
    </div>
  );
};

export default IncomeView;
