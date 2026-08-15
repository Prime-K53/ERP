import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  X, User, Mail, Phone, MapPin, CreditCard, FileText,
  Globe, Building, Truck, Plus, Trash2, Edit2,
  TrendingUp, AlertTriangle, Clock, CheckCircle,
  DollarSign, ArrowLeft, MoreHorizontal, Download,
  ExternalLink, Calendar, MessageSquare, History,
  PieChart, Settings, FileSearch, Paperclip,
  Briefcase, ShieldAlert, BadgeCheck, FileDown,
  ChevronDown,
  RefreshCw,
  FileBarChart,
  Building2
} from 'lucide-react';
import { Supplier, Purchase, SupplierPayment, AuditLogEntry, LedgerEntry } from '../../../types';
import { useProcurement } from '../../../context/ProcurementContext';
import { useFinance } from '../../../context/FinanceContext';
import { useAuth } from '../../../context/AuthContext';
import { format, parseISO, isAfter } from 'date-fns';
import { currencyService } from '../../../services/currencyService';
import AISupplierScorecard from '../../../components/ai/AISupplierScorecard';

interface SupplierWorkspaceProps {
  supplier: Supplier;
  onBack: () => void;
  onEdit: (supplier: Supplier) => void;
}

export const SupplierWorkspace: React.FC<SupplierWorkspaceProps> = ({ supplier, onBack, onEdit }) => {
  const navigate = useNavigate();
  const { purchases = [] } = useProcurement();
  const { supplierPayments = [], ledger = [] } = useFinance();
  const { companyConfig, auditLogs = [] } = useAuth();
  const currency = companyConfig?.currencySymbol || currencyService.getCurrency(currencyService.getBaseCurrency())?.symbol || '$';

  const [activeTab, setActiveTab] = useState<'Overview' | 'Timeline' | 'Bills' | 'Payments' | 'Ledger' | 'Documents' | 'Settings'>('Overview');

  // Filter data for this supplier
  const supplierPurchases = useMemo(() =>
    purchases.filter(p => p.supplierId === supplier.id || p.supplierName === supplier.name),
    [purchases, supplier]);

  const supplierPaymentsList = useMemo(() =>
    supplierPayments.filter(payment => payment.supplierId === supplier.id),
    [supplierPayments, supplier]);

  const supplierLogs = useMemo(() =>
    auditLogs.filter(log => log.entityId === supplier.id || (log.details && log.details.includes(supplier.name))),
    [auditLogs, supplier]);

  const supplierLedger = useMemo(() =>
    (ledger || []).filter(entry => entry.supplierId === supplier.id || entry.supplierName === supplier.name),
    [ledger, supplier]);

  // KPIs
  const kpis = useMemo(() => {
    // Helper to safely get numeric values
    const getNumber = (value: any, fallback = 0) => (typeof value === 'number' && !isNaN(value) ? value : fallback);

    const totalPurchased = supplierPurchases.reduce((sum, p) => sum + getNumber(p.total), 0);
    const totalPaid = supplierPurchases.reduce((sum, p) => sum + getNumber(p.paidAmount), 0);
    const overduePayables = supplierPurchases
      .filter(p => p.paymentStatus !== 'Paid' && p.paymentStatus !== 'Cancelled' && p.dueDate && isAfter(new Date(), parseISO(p.dueDate)))
      .reduce((sum, p) => sum + (getNumber(p.total) - getNumber(p.paidAmount)), 0);

    const ytdPurchases = supplierPurchases
      .filter(p => new Date(p.date).getFullYear() === new Date().getFullYear())
      .reduce((sum, p) => sum + getNumber(p.total), 0);

    const lastBill = [...supplierPurchases].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];

    return {
      balance: getNumber(supplier.balance),
      overduePayables,
      ytdPurchases,
      lastBillTotal: getNumber(lastBill?.total),
      lastBillDate: lastBill?.date || null
    };
  }, [supplier, supplierPurchases]);

  const renderOverview = () => (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Contact Info */}
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-4">
          <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <User size={16} className="text-slate-400" />
            Contact Information
          </h3>
          <div className="space-y-3">
            <div className="flex items-start gap-3">
              <Mail size={14} className="text-slate-400 mt-1" />
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-tight">Email Address</p>
                <p className="text-[13px] font-semibold text-slate-700">{supplier.email || 'No email provided'}</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <Phone size={14} className="text-slate-400 mt-1" />
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-tight">Phone Number</p>
                <p className="text-[13px] font-semibold text-slate-700">{supplier.phone || ''}</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <MapPin size={14} className="text-slate-400 mt-1" />
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-tight">Billing Address</p>
                <p className="text-[13px] font-semibold text-slate-700 whitespace-pre-line">
                  {supplier.address || ''}
                  {supplier.city && `\n${supplier.city}`}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Business Details */}
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-4">
          <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <Building size={16} className="text-slate-400" />
            Business Details
          </h3>
          <div className="space-y-3">
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-tight">Payment Terms</p>
              <p className="text-[13px] font-semibold text-slate-700">{supplier.paymentTerms || 'Due on receipt'}</p>
            </div>
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-tight">Category</p>
              <p className="text-[13px] font-semibold text-slate-700">{supplier.category || 'General Supplier'}</p>
            </div>
          </div>
        </div>

        {/* Financial Summary */}
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-4">
          <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <PieChart size={16} className="text-slate-400" />
            Financial Summary
          </h3>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-[13px] font-medium text-slate-500">Last Bill Date</p>
              <p className="text-[13px] font-bold text-slate-700">{kpis.lastBillDate ? format(parseISO(kpis.lastBillDate), 'MMM dd, yyyy') : 'N/A'}</p>
            </div>
            <div className="flex items-center justify-between">
              <p className="text-[13px] font-medium text-slate-500">Last Bill Amount</p>
              <p className="text-[13px] font-bold text-slate-700 finance-nums">{currency}{kpis.lastBillTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
            </div>
            <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
              <p className="text-[13px] font-bold text-slate-900">Total Payable</p>
              <p className="text-[13px] font-bold text-rose-600 finance-nums">{currency}{kpis.balance.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Recent Activity */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-900">Recent Transactions</h3>
          <button onClick={() => setActiveTab('Bills')} className="text-xs font-bold text-indigo-600 hover:text-indigo-700">View All</button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-slate-50/50">
                <th className="px-6 py-3 text-[11px] font-bold text-slate-500 uppercase tracking-wider">Date</th>
                <th className="px-6 py-3 text-[11px] font-bold text-slate-500 uppercase tracking-wider">Type</th>
                <th className="px-6 py-3 text-[11px] font-bold text-slate-500 uppercase tracking-wider">Reference</th>
                <th className="px-6 py-3 text-[11px] font-bold text-slate-500 uppercase tracking-wider">Status</th>
                <th className="px-6 py-3 text-[11px] font-bold text-slate-500 uppercase tracking-wider text-right">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {[...supplierPurchases, ...supplierPaymentsList]
                .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                .slice(0, 5)
                .map((tx: any) => (
                  <tr key={tx.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-6 py-3 text-[13px] font-semibold text-slate-700">{format(parseISO(tx.date), 'MMM dd, yyyy')}</td>
                    <td className="px-6 py-3">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-tight ${
                        tx.total !== undefined ? 'bg-amber-50 text-amber-700 border border-amber-100' : 'bg-emerald-50 text-emerald-700 border border-emerald-100'
                      }`}>
                        {tx.total !== undefined ? 'Bill' : 'Payment'}
                      </span>
                    </td>
                    <td className="px-6 py-3 text-[13px] font-bold text-slate-900">{tx.id}</td>
                    <td className="px-6 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        (tx.status === 'Paid' || tx.paymentStatus === 'Paid' || tx.status === 'Cleared') ? 'bg-emerald-50 text-emerald-700' :
                        (tx.status === 'Unpaid' || tx.paymentStatus === 'Unpaid') ? 'bg-rose-50 text-rose-700' :
                        'bg-amber-50 text-amber-700'
                      }`}>
                        {tx.paymentStatus || tx.status}
                      </span>
                    </td>
                    <td className="px-6 py-3 text-[13px] font-bold text-slate-900 text-right finance-nums">
                      {currency}{(tx.total || tx.amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex flex-col h-screen bg-slate-50 overflow-hidden">
      {/* Top Header/Action Bar */}
      <div className="bg-white border-b border-slate-200 px-6 py-3 flex items-center justify-between sticky top-0 z-20 shadow-sm">
        <div className="flex items-center gap-4">
          <button
            onClick={onBack}
            className="p-2 hover:bg-slate-100 rounded-full transition-colors text-slate-500"
          >
            <ArrowLeft size={20} />
          </button>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center font-bold text-lg shadow-md shadow-indigo-100">
              {supplier.name.charAt(0)}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-bold text-slate-900 tracking-tight">{supplier.name}</h2>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${supplier.status === 'Active' ? 'bg-emerald-50 text-emerald-700 border-emerald-100' : 'bg-slate-100 text-slate-600 border-slate-200'}`}>
                  {supplier.status}
                </span>
              </div>
              <p className="text-slate-500 font-medium">Supplier ID: {supplier.id} • {supplier.category || 'General Vendor'}</p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => onEdit(supplier)}
            className="flex items-center gap-2 px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-slate-700 font-semibold hover:bg-slate-50 transition-all text-[13px]"
          >
            <Edit2 size={16} />
            Edit Profile
          </button>
          <AISupplierScorecard
            supplier={supplier}
            purchases={supplierPurchases}
            payments={supplierPayments}
          />
          <div className="h-6 w-px bg-slate-200 mx-1" />
          <button
            onClick={() => navigate('/procurement/bills', { state: { action: 'create', supplierId: supplier.id } })}
            className="flex items-center gap-2 px-3.5 py-1.5 bg-indigo-600 text-white rounded-lg font-semibold hover:bg-indigo-700 transition-all shadow-md shadow-indigo-100 text-[13px]"
          >
            <Plus size={16} />
            New Bill
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar">
        {/* KPI Dashboard Row */}
        <div className="p-6 grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Total Payable</span>
              <Building2 size={16} className="text-indigo-600" />
            </div>
            <div className="text-2xl font-bold text-slate-900 finance-nums">
              {currency}{kpis.balance.toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </div>
            <div className="mt-2 flex items-center gap-1 text-[11px] font-semibold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full w-fit">
              <CheckCircle size={12} />
              Active Supplier
            </div>
          </div>

          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Overdue Payables</span>
              <AlertTriangle size={16} className="text-rose-500" />
            </div>
            <div className={`text-2xl font-bold finance-nums ${kpis.overduePayables > 0 ? 'text-rose-600' : 'text-slate-900'}`}>
              {currency}{kpis.overduePayables.toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </div>
            <p className="text-[11px] text-slate-500 font-medium mt-1">Based on overdue bills</p>
          </div>

          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">YTD Purchases</span>
              <TrendingUp size={16} className="text-indigo-600" />
            </div>
            <div className="text-2xl font-bold text-slate-900 finance-nums">
              {currency}{kpis.ytdPurchases.toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </div>
            <p className="text-[11px] text-slate-500 font-medium mt-1">FY {new Date().getFullYear()}</p>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="px-6 border-b border-slate-200 bg-white sticky top-0 z-10">
          <div className="flex items-center gap-8">
            {(['Overview', 'Timeline', 'Bills', 'Payments', 'Ledger', 'Documents', 'Settings'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`py-4 text-[13px] font-bold transition-all relative ${activeTab === tab ? 'text-indigo-600' : 'text-slate-500 hover:text-slate-700'}`}
              >
                {tab}
                {activeTab === tab && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-indigo-600 rounded-full" />}
              </button>
            ))}
          </div>
        </div>

        {/* Tab Content */}
        <div className="p-6">
          {activeTab === 'Overview' && renderOverview()}
          {activeTab !== 'Overview' && (
            <div className="bg-white p-12 rounded-xl border border-slate-200 border-dashed text-center">
              <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4">
                <FileSearch size={24} className="text-slate-300" />
              </div>
              <h3 className="text-sm font-bold text-slate-900 mb-1">{activeTab} Details</h3>
              <p className="text-xs text-slate-500 max-w-xs mx-auto">This section is being populated with {activeTab.toLowerCase()} data for {supplier.name}.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
