import React, { useState, useMemo, useEffect } from 'react';
import { logger } from '@/services/logger';
import { useNavigate, useLocation } from 'react-router-dom';
import { Landmark, Plus, Edit2, Trash2, Search, X, CheckCircle, FolderTree, AlertCircle, History, BarChart3, ArrowRight, ExternalLink } from 'lucide-react';
import { useFinance } from '../../context/FinanceContext';
import { useAuth } from '../../context/AuthContext';
import { Account, AccountType, LedgerEntry } from '../../types';
import { format, parseISO } from 'date-fns';
import { AccountDetailsDashboard } from './components/AccountDetailsDashboard';
import { currencyService } from '../../services/currencyService';
import { ConfirmDialog, ConfirmDialogType } from '../../components/ConfirmDialog';

const ChartOfAccounts: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { accounts, ledger, addAccount, updateAccount, deleteAccount } = useFinance();
  const { checkPermission, notify, companyConfig } = useAuth();
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<AccountType | 'All'>('All');
  const currency = companyConfig?.currencySymbol || currencyService.getCurrency(currencyService.getBaseCurrency())?.symbol || '$';
  
  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState<Partial<Account>>({
    code: '',
    name: '',
    type: 'Asset'
  });

  const [confirmState, setConfirmState] = useState<{ open: boolean; title: string; message: string; confirmText?: string; type?: ConfirmDialogType; onConfirm?: () => void }>({ open: false, title: '', message: '' });

  // Drilldown State
  const [drilldownAccount, setDrilldownAccount] = useState<Account | null>(null);

  // Handle incoming account drilldown from other modules
  useEffect(() => {
    if (location.state?.accountId && accounts.length > 0) {
      const account = accounts.find(a => a.id === location.state.accountId || a.code === location.state.accountId);
      if (account) {
        setDrilldownAccount(account);
        // Clear state so it doesn't reopen on refresh
        navigate(location.pathname, { replace: true, state: {} });
      }
    }
  }, [location.state, accounts, navigate, location.pathname]);

  const canEdit = checkPermission('accounts.edit');

  const filteredAccounts = accounts.filter(a => 
    (filterType === 'All' || a.type === filterType) &&
    (a.name.toLowerCase().includes(searchTerm.toLowerCase()) || a.code.includes(searchTerm))
  ).sort((a, b) => a.code.localeCompare(b.code));

  const accountEntries = useMemo(() => {
    if (!drilldownAccount) return [];
    return (ledger || []).filter(e => 
      e.debitAccountId === drilldownAccount.id || 
      e.debitAccountId === drilldownAccount.code ||
      e.creditAccountId === drilldownAccount.id || 
      e.creditAccountId === drilldownAccount.code
    ).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [ledger, drilldownAccount]);

  const currentBalance = useMemo(() => {
    if (!drilldownAccount) return 0;
    const isAssetOrExpense = drilldownAccount.type === 'Asset' || drilldownAccount.type === 'Expense';
    
    return accountEntries.reduce((sum, entry) => {
        const isDebit = entry.debitAccountId === drilldownAccount.id || entry.debitAccountId === drilldownAccount.code;
        const isCredit = entry.creditAccountId === drilldownAccount.id || entry.creditAccountId === drilldownAccount.code;
        
        if (isAssetOrExpense) {
            if (isDebit) return sum + entry.amount;
            if (isCredit) return sum - entry.amount;
        } else {
            if (isCredit) return sum + entry.amount;
            if (isDebit) return sum - entry.amount;
        }
        return sum;
    }, 0);
  }, [accountEntries, drilldownAccount]);

  const accountBalances = useMemo(() => {
    const balances: Record<string, number> = {};
    (ledger || []).forEach(entry => {
      const debitAcc = accounts.find(a => a.id === entry.debitAccountId || a.code === entry.debitAccountId);
      const creditAcc = accounts.find(a => a.id === entry.creditAccountId || a.code === entry.creditAccountId);
      [debitAcc, creditAcc].forEach((acc, idx) => {
        if (!acc) return;
        const isDebit = idx === 0;
        const isAssetOrExpense = acc.type === 'Asset' || acc.type === 'Expense';
        if (isAssetOrExpense) {
          balances[acc.id] = (balances[acc.id] || 0) + (isDebit ? entry.amount : -entry.amount);
        } else {
          balances[acc.id] = (balances[acc.id] || 0) + (isDebit ? -entry.amount : entry.amount);
        }
      });
    });
    return balances;
  }, [accounts, ledger]);

  const handleOpenModal = (account?: Account) => {
    if (!canEdit) return;
    if (account) {
      setEditingId(account.id);
      setFormData({ code: account.code, name: account.name, type: account.type });
    } else {
      setEditingId(null);
      setFormData({ code: '', name: '', type: 'Asset' });
    }
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canEdit || isSubmitting) return;
    if (!formData.code || !formData.name) {
      notify("Please fill in both Code and Name", "error");
      return;
    }

    setIsSubmitting(true);
    try {
      if (editingId) {
        const accountData: Account = {
          id: editingId,
          code: formData.code,
          name: formData.name,
          type: formData.type as AccountType
        };
        await updateAccount(accountData);
        notify("Account updated successfully", "success");
      } else {
        // Check for duplicate code
        if (accounts.some(a => a.code === formData.code)) {
            notify("Account code already exists", "error");
            setIsSubmitting(false);
            return;
        }
        
        const accountData: Account = {
          id: `ACC-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
          code: formData.code,
          name: formData.name,
          type: formData.type as AccountType
        };
        await addAccount(accountData);
        notify("Account created successfully", "success");
      }
      
      setIsModalOpen(false);
    } catch (err) {
      logger.error(err);
      notify("Error saving account", "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = (id: string) => {
    if (!canEdit) return;
    setConfirmState({
      open: true,
      title: 'Delete Account',
      message: 'Are you sure? Deleting an account with transaction history will cause reporting errors.',
      type: 'danger',
      confirmText: 'Delete',
      onConfirm: () => {
        deleteAccount(id);
        notify('Account deleted', 'info');
      }
    });
  };

  const getTypeColor = (type: AccountType) => {
    switch (type) {
      case 'Asset': return 'bg-blue-100 text-blue-800';
      case 'Liability': return 'bg-red-100 text-red-800';
      case 'Equity': return 'bg-purple-100 text-purple-800';
      case 'Revenue': return 'bg-emerald-100 text-emerald-800';
      case 'Expense': return 'bg-amber-100 text-amber-800';
      default: return 'bg-slate-100 text-slate-800';
    }
  };

  return (
    <div className="p-6 max-w-[1600px] mx-auto h-[calc(100vh-4rem)] flex flex-col relative">
      
      {/* Add/Edit Modal */}
      {isModalOpen && canEdit && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden animate-fadeIn border border-slate-200">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <h2 className="text-xl font-bold text-slate-900">
                {editingId ? 'Edit Account' : 'Add New Account'}
              </h2>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X size={24} />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
               <div>
                 <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Account Type</label>
                 <select 
                   className="w-full p-2.5 border border-slate-200 rounded-lg text-sm bg-white focus:ring-2 focus:ring-blue-500 outline-none"
                   value={formData.type}
                   onChange={e => setFormData({...formData, type: e.target.value as AccountType})}
                 >
                   <option value="Asset">Asset (1000s)</option>
                   <option value="Liability">Liability (2000s)</option>
                   <option value="Equity">Equity (3000s)</option>
                   <option value="Revenue">Revenue (4000s)</option>
                   <option value="Expense">Expense (5000-6000s)</option>
                 </select>
               </div>
               <div>
                 <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Account Code</label>
                 <input 
                   type="text" required
                   className="w-full p-2.5 border border-slate-200 rounded-lg text-sm font-mono font-bold focus:ring-2 focus:ring-blue-500 outline-none"
                   placeholder="e.g. 1050"
                   value={formData.code}
                   onChange={e => setFormData({...formData, code: e.target.value})}
                 />
                 <p className="text-[10px] text-slate-400 mt-1">Unique identifier for the ledger.</p>
               </div>
               <div>
                 <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Account Name</label>
                 <input 
                   type="text" required
                   className="w-full p-2.5 border border-slate-200 rounded-lg text-sm font-bold focus:ring-2 focus:ring-blue-500 outline-none"
                   placeholder="e.g. Office Supplies"
                   value={formData.name}
                   onChange={e => setFormData({...formData, name: e.target.value})}
                 />
               </div>
               <button 
                type="submit" 
                disabled={isSubmitting}
                className="w-full py-3 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 mt-4 flex items-center justify-center gap-2 shadow-lg shadow-blue-100 disabled:opacity-50"
               >
                 {isSubmitting ? "Saving..." : <><CheckCircle size={18} /> Save Account</>}
               </button>
            </form>
          </div>
        </div>
      )}

      <div className="mb-6 flex flex-col md:flex-row justify-between md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 flex items-center gap-2 tracking-tight uppercase">
            <Landmark className="text-blue-600" size={24}/> Chart of Accounts
          </h1>
          <p className="text-slate-500 text-sm mt-1">Manage the structure of your financial records</p>
        </div>
        {canEdit && (
            <button onClick={() => handleOpenModal()} className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 text-white rounded-xl hover:bg-blue-700 font-bold uppercase text-[11px] tracking-widest shadow-lg shadow-blue-100 transition-all active:scale-95">
              <Plus size={16}/> Add Account
            </button>
        )}
      </div>

      <div className="bg-white/70 backdrop-blur-xl rounded-2xl shadow-sm border border-white/60 flex flex-col min-h-0 flex-1 overflow-hidden">
        <div className="p-4 border-b border-slate-200/60 flex flex-col md:flex-row gap-4 justify-between bg-slate-50/30">
           <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1 md:pb-0">
             {['All', 'Asset', 'Liability', 'Equity', 'Revenue', 'Expense'].map(type => (
               <button 
                 key={type}
                  onClick={() => setFilterType(type as AccountType | 'All')}
                 className={`px-4 py-1.5 text-[10px] font-black uppercase tracking-widest rounded-full border transition-all whitespace-nowrap ${filterType === type ? 'bg-slate-800 text-white border-slate-800 shadow-md' : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'}`}
               >
                 {type}
               </button>
             ))}
           </div>
           <div className="relative w-full md:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
              <input 
                type="text" 
                placeholder="Search accounts..."
                className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white/50"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
              />
           </div>
        </div>

        <div className="overflow-y-auto flex-1 custom-scrollbar">
           <table className="w-full text-left text-xs">
              <thead className="bg-slate-50/80 backdrop-blur text-slate-500 font-bold border-b border-slate-200/60 sticky top-0 z-10">
                <tr>
                  <th className="px-6 py-4 w-32 uppercase tracking-widest text-[9px]">Code</th>
                  <th className="px-6 py-4 uppercase tracking-widest text-[9px]">Account Name</th>
                  <th className="px-6 py-4 uppercase tracking-widest text-[9px]">Type</th>
                  <th className="px-6 py-4 text-right uppercase tracking-widest text-[9px]">Balance</th>
                  <th className="px-6 py-4 text-right uppercase tracking-widest text-[9px]">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100/50">
                {filteredAccounts.map(acc => {
                  const bal = accountBalances[acc.id] || 0;
                  const isNegative = (acc.type === 'Asset' || acc.type === 'Expense') ? bal < 0 : bal < 0;
                  return (
                  <tr key={acc.id} className="hover:bg-blue-50/30 transition-colors group">
                    <td className="px-6 py-4 font-mono font-bold text-slate-600">{acc.code}</td>
                    <td className="px-6 py-4 font-bold text-slate-900 flex items-center gap-3">
                       <div className="p-1.5 bg-slate-50 text-slate-400 rounded-lg group-hover:text-blue-500 group-hover:bg-white transition-colors">
                         <FolderTree size={14}/>
                       </div>
                       {acc.name}
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider border ${getTypeColor(acc.type)}`}>
                        {acc.type}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right tabular-nums">
                      <span className={`font-bold ${bal === 0 ? 'text-slate-300' : isNegative ? 'text-red-600' : 'text-slate-900'}`}>
                        {currency}{bal.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                       <div className="flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                           <button 
                             onClick={() => setDrilldownAccount(acc)}
                             className="p-2 text-slate-400 hover:text-emerald-600 bg-white border border-slate-100 rounded-lg shadow-sm transition-all"
                             title="View Ledger"
                           >
                             <History size={14}/>
                           </button>
                           {canEdit && (
                             <>
                               <button onClick={() => handleOpenModal(acc)} className="p-2 text-slate-400 hover:text-blue-600 bg-white border border-slate-100 rounded-lg shadow-sm transition-all">
                                 <Edit2 size={14}/>
                               </button>
                               <button onClick={() => handleDelete(acc.id)} className="p-2 text-slate-400 hover:text-red-600 bg-white border border-slate-100 rounded-lg shadow-sm transition-all">
                                 <Trash2 size={14}/>
                               </button>
                             </>
                           )}
                       </div>
                    </td>
                  </tr>
                  );
                })}
                {filteredAccounts.length === 0 && (
                  <tr><td colSpan={5} className="p-12 text-center text-slate-400 italic">No accounts found.</td></tr>
                )}
              </tbody>
            </table>
        </div>
      </div>

      {/* Account Details Dashboard */}
      {drilldownAccount && (
        <AccountDetailsDashboard
            account={drilldownAccount}
            onClose={() => setDrilldownAccount(null)}
        />
      )}

      <ConfirmDialog
        open={confirmState.open}
        onOpenChange={(open) => !open && setConfirmState(c => ({ ...c, open: false }))}
        onConfirm={() => {
          confirmState.onConfirm?.();
          setConfirmState(c => ({ ...c, open: false }));
        }}
        onCancel={() => setConfirmState(c => ({ ...c, open: false }))}
        title={confirmState.title}
        message={confirmState.message}
        confirmText={confirmState.confirmText}
        type={confirmState.type || 'question'}
      />
    </div>
  );
};

export default ChartOfAccounts;
