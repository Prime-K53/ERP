import React, { useMemo, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useFinance } from '../../context/FinanceContext';
import { useSales } from '../../context/SalesContext';
import { format, parseISO, subMonths, differenceInDays } from 'date-fns';
import {
  Users, Printer, Filter, X, Search, Download, Eye, FileText,
  TrendingUp, ArrowUpRight, ArrowDownLeft, RefreshCw, Building2,
  Phone, Mail, MapPin, CreditCard, Clock, AlertTriangle, CheckCircle,
  ChevronDown, FileSpreadsheet, Landmark
} from 'lucide-react';
import { currencyService } from '../../services/currencyService';
import { buildLedgerFromRecords } from '../../services/customerLedger';
import { exportToCSV } from '../../utils/helpers';

interface StatementTransaction {
  id: string;
  date: string;
  docNumber: string;
  reference: string;
  description: string;
  debit: number;
  credit: number;
  runningBalance: number;
  dueDate?: string;
  status: string;
  type: 'INVOICE' | 'PAYMENT' | 'CREDIT_NOTE' | 'REFUND';
}

const CustomerStatement: React.FC = () => {
  const { companyConfig } = useAuth();
  const { invoices = [] } = useFinance();
  const { customers = [], customerPayments = [] } = useSales();
  const currency = companyConfig?.currencySymbol || currencyService.getCurrency(currencyService.getBaseCurrency())?.symbol || 'K';

  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('');
  const [dateRange, setDateRange] = useState<'all' | '1m' | '3m' | '6m' | '12m'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [txTypeFilter, setTxTypeFilter] = useState<string>('all');
  const [expandedTx, setExpandedTx] = useState<string | null>(null);

  const dateCutoff = useMemo(() => {
    if (dateRange === 'all') return null;
    const months = { '1m': 1, '3m': 3, '6m': 6, '12m': 12 }[dateRange];
    return subMonths(new Date(), months);
  }, [dateRange]);

  const selectedCustomer = useMemo(
    () => customers.find((c: any) => c.id === selectedCustomerId),
    [customers, selectedCustomerId]
  );

  const customerInvoices = useMemo(() => {
    if (!selectedCustomerId) return [];
    return (invoices || []).filter((inv: any) => inv.customerId === selectedCustomerId);
  }, [invoices, selectedCustomerId]);

  const customerPaymentsList = useMemo(() => {
    if (!selectedCustomerId) return [];
    return (customerPayments || []).filter((p: any) => p.customerId === selectedCustomerId);
  }, [customerPayments, selectedCustomerId]);

  const overdueAmount = useMemo(() => {
    const now = new Date();
    return customerInvoices
      .filter((inv: any) => {
        const status = (inv.status || '').toLowerCase();
        const isUnpaid = status === 'unpaid' || status === 'overdue' || status === 'partial' || status === 'partially paid';
        const isOverdue = inv.dueDate && new Date(inv.dueDate) < now;
        return isUnpaid && isOverdue;
      })
      .reduce((sum: number, inv: any) => sum + (Number(inv.totalAmount) || 0) - (Number(inv.paidAmount) || 0), 0);
  }, [customerInvoices]);

  // Canonical ledger — single authoritative definition shared with the
  // backend. Replaces the component-private totals/running-balance math.
  const canonicalLedger = useMemo(
    () => buildLedgerFromRecords({ customerId: selectedCustomerId, invoices: customerInvoices, payments: customerPaymentsList }),
    [selectedCustomerId, customerInvoices, customerPaymentsList]
  );

  const outstandingBalance = useMemo(
    () => canonicalLedger.outstandingBalance,
    [canonicalLedger]
  );

  const openingBalance = 0;

  const statementTransactions = useMemo(() => {
    // Canonical ledger (services/customerLedger.ts): validated inclusion
    // rules, debit−credit convention, deterministic ordering. Display rows
    // are derived from it — never recomputed locally.
    const invMeta = new Map(customerInvoices.map((inv: any) => [String(inv.id), inv]));
    const payMeta = new Map(customerPaymentsList.map((p: any) => [String(p.id), p]));

    const txs: StatementTransaction[] = canonicalLedger.transactions.map(tx => {
      const meta: any = tx.type === 'payment' ? payMeta.get(tx.id) : invMeta.get(tx.id);
      const status = String(meta?.status || (tx.type === 'payment' ? 'completed' : '')).toLowerCase();
      const payStatus = tx.type === 'payment'
        ? (status === 'refund' ? 'REFUND' : 'PAYMENT')
        : (tx.type === 'credit_note' ? 'CREDIT_NOTE' : 'INVOICE');
      return {
        id: tx.id,
        date: tx.date || '',
        docNumber: tx.type === 'payment'
          ? (meta?.receiptNumber || tx.id)
          : (meta?.invoiceNumber || tx.id),
        reference: tx.type === 'payment' ? (meta?.invoiceId || meta?.reference || '') : (meta?.reference || meta?.orderNumber || ''),
        description: tx.description,
        debit: tx.debit,
        credit: tx.credit,
        runningBalance: tx.balance,
        dueDate: meta?.dueDate,
        status: status.charAt(0).toUpperCase() + status.slice(1),
        type: payStatus as StatementTransaction['type'],
      };
    });

    // The date range filters DISPLAY only — running balances stay true
    // (computed over the full canonical history).
    const visible = dateCutoff
      ? txs.filter(tx => tx.date && new Date(tx.date) >= dateCutoff)
      : txs;

    return visible.reverse();
  }, [canonicalLedger, customerInvoices, customerPaymentsList, dateCutoff]);

  const filteredTx = useMemo(() => {
    let result = statementTransactions;

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(tx =>
        tx.docNumber.toLowerCase().includes(q) ||
        tx.description.toLowerCase().includes(q) ||
        tx.reference.toLowerCase().includes(q)
      );
    }

    if (txTypeFilter !== 'all') {
      result = result.filter(tx => tx.type === txTypeFilter);
    }

    return result;
  }, [statementTransactions, searchQuery, txTypeFilter]);

  const totalSales = useMemo(() =>
    customerInvoices
      .filter((inv: any) => !['cancelled', 'void', 'draft'].includes((inv.status || '').toLowerCase()))
      .reduce((sum: number, inv: any) => sum + (Number(inv.totalAmount) || 0), 0), [customerInvoices]);

  const totalPayments = useMemo(() =>
    customerPaymentsList
      .filter((p: any) => {
        const s = String(p.status || '').toLowerCase();
        return s !== 'cancelled' && s !== 'voided' && s !== 'void';
      })
      .reduce((sum: number, p: any) => sum + (Number(p.amount) || 0), 0), [customerPaymentsList]);

  const totalCreditNotes = useMemo(() =>
    customerInvoices
      .filter((inv: any) => (inv.status || '').toLowerCase() === 'credit_note')
      .reduce((sum: number, inv: any) => sum + (Number(inv.totalAmount) || 0), 0), [customerInvoices]);

  const formatCurrency = (val: number) =>
    `${currency}${val.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const getStatusBadge = (status: string) => {
    const s = status.toLowerCase();
    if (s === 'paid' || s === 'completed') return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    if (s === 'unpaid' || s === 'overdue') return 'bg-rose-50 text-rose-700 border-rose-200';
    if (s === 'partial' || s === 'partially paid' || s === 'partially_paid') return 'bg-amber-50 text-amber-700 border-amber-200';
    if (s === 'draft') return 'bg-slate-50 text-slate-500 border-slate-200';
    if (s === 'cancelled' || s === 'void') return 'bg-rose-50 text-rose-700 border-rose-200';
    if (s === 'refund') return 'bg-cyan-50 text-cyan-700 border-cyan-200';
    if (s === 'credit_note') return 'bg-purple-50 text-purple-700 border-purple-200';
    return 'bg-slate-50 text-slate-600 border-slate-200';
  };

  const getStatusIcon = (status: string) => {
    const s = status.toLowerCase();
    if (s === 'paid' || s === 'completed') return <CheckCircle size={10} className="text-emerald-500" />;
    if (s === 'overdue') return <AlertTriangle size={10} className="text-rose-500" />;
    if (s === 'unpaid') return <Clock size={10} className="text-amber-500" />;
    return null;
  };

  const isOverdue = (dueDate?: string) => {
    if (!dueDate) return false;
    return new Date(dueDate) < new Date();
  };

  const handleExportCSV = () => {
    if (filteredTx.length === 0) return;
    const data = filteredTx.map(tx => ({
      Date: format(new Date(tx.date), 'yyyy-MM-dd'),
      'Doc Number': tx.docNumber,
      Reference: tx.reference,
      Description: tx.description,
      Debit: tx.debit || '',
      Credit: tx.credit || '',
      'Running Balance': tx.runningBalance,
      'Due Date': tx.dueDate ? format(new Date(tx.dueDate), 'yyyy-MM-dd') : '',
      Status: tx.status,
      Type: tx.type,
    }));
    exportToCSV(data, `customer_statement_${selectedCustomer?.name || 'customer'}`);
  };

  if (!selectedCustomerId) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-slate-400 gap-4">
        <Building2 size={48} className="text-slate-300" />
        <p className="text-lg font-semibold">Select a customer to view statement</p>
        <select
          value=""
          onChange={e => setSelectedCustomerId(e.target.value)}
          className="mt-2 bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-medium outline-none focus:border-blue-500 transition-colors shadow-sm min-w-[300px]"
        >
          <option value="">Choose a customer...</option>
          {customers.map((c: any) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </div>
    );
  }

  const dueDateStyle = (dueDate?: string) => {
    if (!dueDate) return '';
    const days = differenceInDays(new Date(dueDate), new Date());
    if (days < 0) return 'text-rose-600 font-bold';
    if (days <= 7) return 'text-amber-600 font-bold';
    return 'text-slate-500';
  };

  return (
    <div className="space-y-5 animate-fadeIn">
      {/* Customer Details Header */}
      <div className="bg-gradient-to-br from-emerald-600 to-emerald-800 p-6 rounded-2xl shadow-xl shadow-emerald-200/50 text-white">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-white/15 rounded-xl backdrop-blur-sm">
              <Building2 size={28} />
            </div>
            <div>
              <h2 className="text-lg font-bold tracking-tight">Customer Statement</h2>
              <p className="text-emerald-100 text-sm font-medium mt-0.5">{selectedCustomer?.name}</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right">
              <p className="text-emerald-200 text-[10px] font-bold uppercase tracking-widest">Outstanding Balance</p>
              <p className="text-xl font-black finance-nums">{formatCurrency(outstandingBalance)}</p>
            </div>
            {overdueAmount > 0 && (
              <div className="px-3 py-1.5 rounded-full bg-rose-500/20 text-rose-100 text-[10px] font-bold border border-rose-300/30">
                {formatCurrency(overdueAmount)} Overdue
              </div>
            )}
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4 pt-4 border-t border-white/10">
          <div className="flex items-center gap-2">
            <MapPin size={13} className="text-emerald-200" />
            <div>
              <p className="text-emerald-200 text-[9px] font-bold uppercase tracking-widest">Customer ID</p>
              <p className="font-mono text-xs font-bold">{selectedCustomer?.id || 'N/A'}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Phone size={13} className="text-emerald-200" />
            <div>
              <p className="text-emerald-200 text-[9px] font-bold uppercase tracking-widest">Contact</p>
              <p className="text-xs font-bold">{selectedCustomer?.phone || 'N/A'}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Mail size={13} className="text-emerald-200" />
            <div>
              <p className="text-emerald-200 text-[9px] font-bold uppercase tracking-widest">Email</p>
              <p className="text-xs font-bold">{selectedCustomer?.email || 'N/A'}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <CreditCard size={13} className="text-emerald-200" />
            <div>
              <p className="text-emerald-200 text-[9px] font-bold uppercase tracking-widest">Credit Limit</p>
              <p className="text-xs font-bold">{selectedCustomer?.creditLimit ? formatCurrency(selectedCustomer.creditLimit) : 'N/A'}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Opening Balance</p>
          <p className="text-lg font-black text-slate-900 finance-nums">{formatCurrency(0)}</p>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Total Sales</p>
          <p className="text-lg font-black text-blue-600 finance-nums">{formatCurrency(totalSales)}</p>
          <div className="flex items-center gap-1 mt-0.5">
            <ArrowUpRight size={10} className="text-blue-500" />
            <span className="text-[9px] text-blue-500 font-medium">{customerInvoices.length} invoices</span>
          </div>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Total Payments</p>
          <p className="text-lg font-black text-emerald-600 finance-nums">{formatCurrency(totalPayments)}</p>
          <div className="flex items-center gap-1 mt-0.5">
            <ArrowDownLeft size={10} className="text-emerald-500" />
            <span className="text-[9px] text-emerald-500 font-medium">{customerPaymentsList.length} payments</span>
          </div>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Credit Notes</p>
          <p className="text-lg font-black text-purple-600 finance-nums">{formatCurrency(totalCreditNotes)}</p>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Outstanding</p>
          <p className={`text-lg font-black finance-nums ${outstandingBalance > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>
            {formatCurrency(outstandingBalance)}
          </p>
        </div>
        <div className={`p-4 rounded-xl shadow-sm text-white ${overdueAmount > 0 ? 'bg-gradient-to-br from-rose-600 to-rose-800' : 'bg-gradient-to-br from-slate-700 to-slate-900'}`}>
          <p className="text-[10px] font-bold text-white/70 uppercase tracking-widest mb-1">Overdue Amount</p>
          <p className="text-lg font-black finance-nums">{formatCurrency(overdueAmount)}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
        <div className="p-3 flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-lg">
            {(['all', '1m', '3m', '6m', '12m'] as const).map((range) => (
              <button
                key={range}
                onClick={() => setDateRange(range)}
                className={`px-2.5 py-1.5 rounded-md text-[11px] font-semibold transition-all ${
                  dateRange === range ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                {range === 'all' ? 'All' : range}
              </button>
            ))}
          </div>

          <div className="flex-1 min-w-[160px]">
            <div className="relative">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search transactions..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-lg pl-8 pr-2.5 py-1.5 text-xs font-medium outline-none focus:border-blue-500 transition-colors"
              />
            </div>
          </div>

          <select
            value={txTypeFilter}
            onChange={e => setTxTypeFilter(e.target.value)}
            className="bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-medium outline-none focus:border-blue-500"
          >
            <option value="all">All Types</option>
            <option value="INVOICE">Invoices</option>
            <option value="PAYMENT">Payments</option>
            <option value="CREDIT_NOTE">Credit Notes</option>
            <option value="REFUND">Refunds</option>
          </select>

          <button
            onClick={() => { setSelectedCustomerId(''); setSearchQuery(''); }}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-200 text-[11px] font-semibold bg-white hover:bg-slate-50 transition-all"
          >
            <RefreshCw size={12} />
            Reset
          </button>

          <button
            onClick={handleExportCSV}
            disabled={filteredTx.length === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-50 text-emerald-700 text-[11px] font-bold hover:bg-emerald-100 transition-all disabled:opacity-50"
          >
            <FileSpreadsheet size={13} />
            Export CSV
          </button>

          <button
            onClick={() => window.print()}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-50 text-slate-600 text-[11px] font-bold hover:bg-slate-100 transition-all"
          >
            <Printer size={13} />
            Print
          </button>
        </div>
      </div>

      {/* Transaction Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileText size={15} className="text-emerald-600" />
            <h3 className="font-bold text-slate-900 text-sm">Transaction History</h3>
          </div>
          <div className="flex items-center gap-2">
            {selectedCustomer?.address && (
              <span className="text-[10px] text-slate-400">{selectedCustomer.address}</span>
            )}
            <span className="text-[10px] text-slate-400 font-mono bg-slate-100 px-2 py-0.5 rounded">
              {filteredTx.length} transaction{filteredTx.length !== 1 ? 's' : ''}
            </span>
          </div>
        </div>

        <div className="overflow-x-auto">
          {filteredTx.length === 0 ? (
            <div className="text-center py-12">
              <Building2 size={36} className="mx-auto text-slate-300 mb-3" />
              <p className="text-slate-400 font-medium text-sm">No transactions found.</p>
              <p className="text-xs text-slate-300 mt-1">Try a different date range or customer.</p>
            </div>
          ) : (
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100 sticky top-0">
                  <th className="px-3 py-2.5 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Date</th>
                  <th className="px-3 py-2.5 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Doc Number</th>
                  <th className="px-3 py-2.5 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Reference</th>
                  <th className="px-3 py-2.5 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Description</th>
                  <th className="px-3 py-2.5 text-[10px] font-bold text-slate-500 uppercase tracking-widest text-right">Debit</th>
                  <th className="px-3 py-2.5 text-[10px] font-bold text-slate-500 uppercase tracking-widest text-right">Credit</th>
                  <th className="px-3 py-2.5 text-[10px] font-bold text-slate-500 uppercase tracking-widest text-right">Running Balance</th>
                  <th className="px-3 py-2.5 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Due Date</th>
                  <th className="px-3 py-2.5 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Status</th>
                  <th className="px-3 py-2.5 text-[10px] font-bold text-slate-500 uppercase tracking-widest text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {filteredTx.map((tx, idx) => (
                  <React.Fragment key={`${tx.id}-${idx}`}>
                    <tr
                      className={`hover:bg-slate-50/50 transition-colors cursor-pointer ${
                        tx.type === 'INVOICE' && isOverdue(tx.dueDate) && (tx.status === 'Unpaid' || tx.status === 'Overdue') ? 'bg-rose-50/30' : ''
                      }`}
                      onClick={() => setExpandedTx(expandedTx === `${tx.id}-${idx}` ? null : `${tx.id}-${idx}`)}
                    >
                      <td className="px-3 py-2.5 text-[11px] text-slate-600 whitespace-nowrap font-medium">
                        {format(new Date(tx.date), 'MMM dd, yyyy')}
                      </td>
                      <td className="px-3 py-2.5 text-[11px] font-mono text-slate-600 font-medium">
                        {tx.docNumber}
                      </td>
                      <td className="px-3 py-2.5 text-[11px] font-mono text-slate-400">
                        {tx.reference || '-'}
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-2">
                          <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold border ${
                            tx.type === 'INVOICE' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                            tx.type === 'PAYMENT' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                            tx.type === 'CREDIT_NOTE' ? 'bg-purple-50 text-purple-700 border-purple-200' :
                            'bg-cyan-50 text-cyan-700 border-cyan-200'
                          }`}>
                            {tx.type === 'CREDIT_NOTE' ? 'CN' : tx.type === 'PAYMENT' ? 'PMT' : tx.type === 'REFUND' ? 'REF' : 'INV'}
                          </span>
                          <span className="text-[11px] text-slate-700 font-medium">{tx.description}</span>
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-right text-[11px] font-bold text-rose-600 finance-nums">
                        {tx.debit > 0 ? formatCurrency(tx.debit) : '-'}
                      </td>
                      <td className="px-3 py-2.5 text-right text-[11px] font-bold text-emerald-600 finance-nums">
                        {tx.credit > 0 ? formatCurrency(tx.credit) : '-'}
                      </td>
                      <td className="px-3 py-2.5 text-right text-[11px] font-bold text-slate-900 finance-nums">
                        {formatCurrency(tx.runningBalance)}
                      </td>
                      <td className="px-3 py-2.5 text-[11px] whitespace-nowrap">
                        {tx.dueDate ? (
                          <span className={dueDateStyle(tx.dueDate)}>
                            {format(new Date(tx.dueDate), 'MMM dd, yyyy')}
                          </span>
                        ) : '-'}
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-1">
                          {getStatusIcon(tx.status)}
                          <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold border ${getStatusBadge(tx.status)}`}>
                            {tx.status}
                          </span>
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        <button
                          className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-md transition-all"
                          title="View details"
                        >
                          <Eye size={13} />
                        </button>
                      </td>
                    </tr>
                    {expandedTx === `${tx.id}-${idx}` && (
                      <tr className="bg-slate-50/50">
                        <td colSpan={10} className="px-6 py-3">
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
                            <div>
                              <p className="font-bold text-slate-400 uppercase text-[9px] tracking-widest mb-1">Transaction ID</p>
                              <p className="font-mono text-slate-700">{tx.id}</p>
                            </div>
                            <div>
                              <p className="font-bold text-slate-400 uppercase text-[9px] tracking-widest mb-1">Document</p>
                              <p className="font-medium text-slate-700">{tx.docNumber}</p>
                            </div>
                            <div>
                              <p className="font-bold text-slate-400 uppercase text-[9px] tracking-widest mb-1">Reference</p>
                              <p className="font-mono text-slate-600">{tx.reference || 'N/A'}</p>
                            </div>
                            <div>
                              <p className="font-bold text-slate-400 uppercase text-[9px] tracking-widest mb-1">Running Balance</p>
                              <p className="font-bold text-slate-900">{formatCurrency(tx.runningBalance)}</p>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <style>{`
        @media print {
          body { background: white !important; }
        }
      `}</style>
    </div>
  );
};

export default CustomerStatement;
