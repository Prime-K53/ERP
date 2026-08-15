import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { logger } from '@/services/logger';
import {
  BankAccount, BankTransaction, BankStatement, ScheduledPayment, ExchangeRate,
  BankFee, Reconciliation, Adjustment, CashFlowForecast, BankAlert, BankCategory
} from '../../types/banking';
import { useBankingStore } from '../../context/BankingContext';
import { useData, REFRESH_INTERVAL } from '../../context/DataContext';
import { useModuleRefresh } from '../../hooks/useModuleRefresh';
import { useAuth } from '../../context/AuthContext';
import { useFinance } from '../../context/FinanceContext';
import {
  Building2, Clock, TrendingUp, TrendingDown, AlertTriangle, DollarSign, Target,
  Calendar, Download, Filter, RefreshCw, ChevronDown, CheckCircle, Wallet,
  ArrowRight, ExternalLink, Eye, Plus, Search, Trash2, Edit, FileText, Shield,
  BarChart3, TrendingUp as TrendingUpIcon, TrendingDown as TrendingDownIcon, Activity
} from 'lucide-react';
import { format, startOfWeek, endOfWeek, startOfMonth, endOfMonth, startOfYear, endOfYear, isWithinInterval, addDays, addMonths, addYears, subDays, parseISO } from 'date-fns';
import BankingReports from '../../components/BankingReports';
import { PreviewModal } from '../shared/components/PDF/PreviewModal';
import { AccountDetailsDashboard } from './components/AccountDetailsDashboard';
import { currencyService } from '../../services/currencyService';
import { ConfirmDialog, ConfirmDialogType } from '../../components/ConfirmDialog';
import { getDefaultDate, validateDateInFY } from '../../utils/financialYearUtils';
const paper = '#FEFDFB';
const ink = '#23282A';
const inkSoft = '#5c6567';
const hairline = '#e4ddd1';
const teal = { 50: '#eef7f6', 100: '#d4ebe3', 200: '#a6d9d3', 400: '#3fa294', 500: '#2d9a8a', 600: '#1f8577', 700: '#166b5e', 800: '#0f544c', 900: '#0a3d34' };
const amber = { 50: '#fef9e7', 100: '#fef3c7', 200: '#fde68a', 400: '#d99a3f', 500: '#d99a3f', 600: '#b45309', 700: '#92400e', 800: '#78350f', 900: '#451a03' };
const danger = { 50: '#fef2f2', 100: '#fee2e2', 200: '#fecaca', 400: '#dc2626', 500: '#b5493f', 600: '#991b1b', 700: '#7f1d1d', 800: '#450a0a', 900: '#1a0505' };
const emerald = { 50: '#f0fdf4', 100: '#dcfce7', 200: '#bbf7d0', 400: '#16a34a', 500: '#16a34a', 600: '#059669', 700: '#047857', 800: '#065f46', 900: '#064e3b' };

type ScheduledRow = {
  id: string;
  name: string;
  nextPaymentDate: string;
  frequency: string;
  amount: number;
  status: ScheduledPayment['status'];
  source: 'Manual' | 'RecurringInvoice';
  original?: ScheduledPayment;
  recurringId?: string;
};

const Banking: React.FC = () => {
  const {
    accounts, transactions, statements, scheduledPayments, exchangeRates,
    fees, reconciliations, adjustments, cashFlowForecasts, alerts, categories,
    isLoading, fetchBankingData, createAccount, updateAccount, deleteAccount,
    createTransaction, updateTransaction, deleteTransaction,
    createScheduledPayment, updateScheduledPayment, deleteScheduledPayment,
    createFee, createStatement, processStatement, createReconciliation,
    completeReconciliation, createCashFlowForecast, createAlert,
    acknowledgeAlert, createCategory, updateCategory, deleteCategory,
    saveExchangeRate
  } = useBankingStore();
  const { refreshAllData } = useData();
  const { companyConfig } = useAuth();
  const { recurringInvoices } = useFinance();
  const currency = companyConfig?.currencySymbol || currencyService.getCurrency(currencyService.getBaseCurrency())?.symbol || '$';

  // Initial fetch on mount
  useEffect(() => {
    fetchBankingData();
  }, [fetchBankingData]);

  // 5-minute poll + focus refresh
  useModuleRefresh(async () => {
    await Promise.allSettled([
      fetchBankingData(),
      refreshAllData()
    ]);
  }, { interval: REFRESH_INTERVAL });
  const normalizeDate = useCallback((value: string) => value.split('T')[0], []);

  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'Accounts' | 'Transactions' | 'Statements' | 'Scheduled' | 'Reconciliation' | 'Forecasts' | 'Reports'>('Accounts');
  const [showModal, setShowModal] = useState<'Account' | 'Transaction' | 'ScheduledPayment' | 'Fee' | 'Statement' | 'Reconciliation' | 'Forecast' | 'Alert' | 'Category' | null>(null);
  const [documentPreviewOpen, setDocumentPreviewOpen] = useState(false);
  const [documentPreviewTitle, setDocumentPreviewTitle] = useState<string>('Document Preview');
  const [documentPreviewContent, setDocumentPreviewContent] = useState<React.ReactNode>(null);
  const [auditedAccount, setAuditedAccount] = useState<any | null>(null);

  const [confirmState, setConfirmState] = useState<{ open: boolean; title: string; message: string; confirmText?: string; type?: ConfirmDialogType; onConfirm?: () => void }>({ open: false, title: '', message: '' });

  const openDocumentPreview = (title: string, content: React.ReactNode) => {
    setDocumentPreviewTitle(title);
    setDocumentPreviewContent(content);
    setDocumentPreviewOpen(true);
  };
  const closeDocumentPreview = () => setDocumentPreviewOpen(false);

  const renderTransactionReceiptContent = (tx: BankTransaction) => (
    <div style={{ whiteSpace: 'pre-wrap' }}>
      <div className="font-semibold mb-2">Transaction Receipt</div>
      <div>Date: {new Date(tx.date).toDateString()}</div>
      <div>Account: {accounts.find(a => a.id === tx.bankAccountId)?.name || tx.bankAccountId}</div>
      <div>Type: {tx.type}</div>
      <div>Amount: {currency}{tx.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
      <div>Description: {tx.description}</div>
      <div>Reference: {tx.reference}</div>
    </div>
  );

  const renderStatementDocumentContent = (stmt: BankStatement) => {
    const accountName = accounts.find(a => a.id === stmt.bankAccountId)?.name || stmt.bankAccountId;
    return (
      <div>
        <div className="font-semibold mb-2">Statement Document</div>
        <div>Account: {accountName}</div>
        <div>Period: {format(parseISO(stmt.startDate), 'MMM dd, yyyy')} - {format(parseISO(stmt.endDate), 'MMM dd, yyyy')}</div>
        <div>Starting Balance: {currency}{stmt.startingBalance.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
        <div>Ending Balance: {currency}{stmt.endingBalance.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
        <div>Deposits: {currency}{stmt.totalDeposits.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
        <div>Withdrawals: {currency}{stmt.totalWithdrawals.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
        <div>Transactions: {stmt.transactions?.length ?? 0}</div>
        {stmt.transactions && stmt.transactions.length > 0 && (
          <div className="mt-3 border-t border-slate-200 pt-2">
            <div className="text-sm font-semibold mb-2">Transactions</div>
            <table className="w-full text-left text-xs">
              <thead>
                <tr>
                  <th className="py-1">Date</th>
                  <th className="py-1">Desc</th>
                  <th className="py-1">Amount</th>
                </tr>
              </thead>
              <tbody>
                {stmt.transactions.map(t => (
                  <tr key={t.id}>
                    <td className="py-1">{new Date(t.date).toLocaleDateString()}</td>
                    <td className="py-1">{t.description}</td>
                    <td className="py-1">{currency}{t.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    );
  };
  const [modalData, setModalData] = useState<any>(null);
  const [dateRange, setDateRange] = useState({
    start: startOfMonth(new Date()).toISOString().split('T')[0],
    end: endOfMonth(new Date()).toISOString().split('T')[0]
  });
  const [quickFilter, setQuickFilter] = useState<string>('This Month');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [accountForm, setAccountForm] = useState({
    name: '',
    accountNumber: '',
    bankName: '',
    accountType: 'Asset' as 'Asset' | 'Liability' | 'Equity' | 'Revenue' | 'Expense',
    currency: companyConfig?.currencySymbol || 'USD',
    status: 'Active' as 'Active' | 'Inactive' | 'Closed',
    openingDate: getDefaultDate()
  });
  const [transactionForm, setTransactionForm] = useState({
    date: getDefaultDate(),
    amount: '',
    type: 'Deposit' as BankTransaction['type'],
    description: '',
    reference: '',
    bankAccountId: '',
    categoryId: ''
  });
  const [scheduledPaymentForm, setScheduledPaymentForm] = useState({
    name: '',
    description: '',
    bankAccountId: '',
    amount: '',
    frequency: 'Monthly' as ScheduledPayment['frequency'],
    startDate: new Date().toISOString().split('T')[0],
    endDate: '',
    status: 'Active' as ScheduledPayment['status'],
    paymentMethod: 'Bank Transfer' as ScheduledPayment['paymentMethod'],
    counterpartyName: '',
    counterpartyAccountNumber: '',
    counterpartyBankName: '',
    categoryId: ''
  });
  const [reconciliationForm, setReconciliationForm] = useState({
    bankAccountId: '',
    startDate: startOfMonth(new Date()).toISOString().split('T')[0],
    endDate: new Date().toISOString().split('T')[0],
    endingBalance: '',
    statementId: '',
    notes: ''
  });
  const [forecastForm, setForecastForm] = useState({
    bankAccountId: '',
    date: addMonths(new Date(), 1).toISOString().split('T')[0],
    notes: ''
  });

  // Handled by useModuleRefresh hook

  useEffect(() => {
    if (quickFilter === 'This Week') {
      setDateRange({
        start: startOfWeek(new Date()).toISOString().split('T')[0],
        end: endOfWeek(new Date()).toISOString().split('T')[0]
      });
    } else if (quickFilter === 'This Month') {
      setDateRange({
        start: startOfMonth(new Date()).toISOString().split('T')[0],
        end: endOfMonth(new Date()).toISOString().split('T')[0]
      });
    } else if (quickFilter === 'This Year') {
      setDateRange({
        start: startOfYear(new Date()).toISOString().split('T')[0],
        end: endOfYear(new Date()).toISOString().split('T')[0]
      });
    } else if (quickFilter === 'All Time') {
      setDateRange({
        start: '1970-01-01',
        end: new Date().toISOString().split('T')[0]
      });
    }
  }, [quickFilter]);

  const activeAccounts = useMemo(() => {
    return accounts.filter(a => a.status === 'Active');
  }, [accounts]);

  useEffect(() => {
    if (!selectedAccountId && activeAccounts.length > 0) {
      setSelectedAccountId(activeAccounts[0].id);
    }
  }, [selectedAccountId, activeAccounts]);

  const activeAccount = useMemo(() => {
    return accounts.find(a => a.id === selectedAccountId);
  }, [accounts, selectedAccountId]);

  const accountTransactions = useMemo(() => {
    return transactions
      .filter(tx => (selectedAccountId ? tx.bankAccountId === selectedAccountId : true))
      .filter(tx => {
        const txDate = new Date(tx.date);
        const start = new Date(dateRange.start);
        const end = new Date(dateRange.end);
        return isWithinInterval(txDate, { start, end });
      })
      .filter(tx => {
        if (!searchTerm) return true;
        return (
          tx.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
          tx.reference.toLowerCase().includes(searchTerm.toLowerCase()) ||
          tx.counterparty?.name.toLowerCase().includes(searchTerm.toLowerCase())
        );
      })
      .filter(tx => {
        if (!selectedCategoryId) return true;
        return tx.categoryId === selectedCategoryId;
      })
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [transactions, selectedAccountId, dateRange, searchTerm, selectedCategoryId]);

  const accountBalance = useMemo(() => {
    return accountTransactions.reduce((sum, tx) => {
      return sum + (tx.type === 'Deposit' ? tx.amount : -tx.amount);
    }, 0);
  }, [accountTransactions]);

  const accountAvailableBalance = useMemo(() => {
    if (!selectedAccountId) return 0;
    // In a real system, this would account for pending transactions
    return accountBalance;
  }, [selectedAccountId, accountBalance]);

  const recurringScheduleRows = useMemo<ScheduledRow[]>(() => {
    if (!recurringInvoices?.length) return [];
    const todayKey = format(new Date(), 'yyyy-MM-dd');
    return recurringInvoices.flatMap(inv => {
      if (inv.status === 'Expired') return [];
      const dates = new Set<string>();
      if (inv.scheduledDates?.length) {
        inv.scheduledDates.forEach(date => {
          const dateKey = normalizeDate(date);
          if (dateKey >= todayKey) dates.add(dateKey);
        });
      }
      if (inv.nextRunDate) {
        const dateKey = normalizeDate(inv.nextRunDate);
        if (dateKey >= todayKey) dates.add(dateKey);
      }
      const amount = Number(inv.total);
      return Array.from(dates).map(date => ({
        id: `RINV-${inv.id}-${date}`,
        name: inv.customerName || 'Recurring Invoice',
        nextPaymentDate: date,
        frequency: inv.frequency,
        amount: Number.isFinite(amount) ? amount : 0,
        status: inv.status === 'Active' ? 'Active' : inv.status === 'Paused' ? 'Paused' : 'Completed',
        source: 'RecurringInvoice' as const,
        recurringId: inv.id
      }));
    });
  }, [recurringInvoices, normalizeDate]);

  const scheduledRows = useMemo<ScheduledRow[]>(() => {
    const manualRows: ScheduledRow[] = scheduledPayments.map(payment => ({
      id: payment.id,
      name: payment.name,
      nextPaymentDate: payment.nextPaymentDate,
      frequency: payment.frequency,
      amount: payment.amount,
      status: payment.status,
      source: 'Manual',
      original: payment
    }));

    return [...manualRows, ...recurringScheduleRows].sort((a, b) => {
      return new Date(a.nextPaymentDate).getTime() - new Date(b.nextPaymentDate).getTime();
    });
  }, [scheduledPayments, recurringScheduleRows]);

  const scheduledPaymentsDue = useMemo(() => {
    const today = format(new Date(), 'yyyy-MM-dd');
    return scheduledRows
      .filter(p => p.nextPaymentDate === today && p.status === 'Active')
      .sort((a, b) => a.nextPaymentDate.localeCompare(b.nextPaymentDate));
  }, [scheduledRows]);

  const upcomingScheduledPayments = useMemo(() => {
    const today = new Date();
    const next30Days = addDays(today, 30);
    return scheduledRows
      .filter(p => {
        const nextDate = new Date(p.nextPaymentDate);
        return nextDate > today && nextDate <= next30Days;
      })
      .sort((a, b) => a.nextPaymentDate.localeCompare(b.nextPaymentDate));
  }, [scheduledRows]);

  const activeAlerts = useMemo(() => {
    return alerts.filter(a => a.status === 'Triggered' || a.status === 'Active');
  }, [alerts]);

  const cashFlowSummary = useMemo(() => {
    const income = accountTransactions
      .filter(tx => tx.type === 'Deposit')
      .reduce((sum, tx) => sum + tx.amount, 0);
    
    const expenses = accountTransactions
      .filter(tx => tx.type === 'Withdrawal' || tx.type === 'Fee')
      .reduce((sum, tx) => sum + tx.amount, 0);

    return {
      income,
      expenses,
      net: income - expenses,
      transactions: accountTransactions.length
    };
  }, [accountTransactions]);

  const getAccountBalanceUpTo = (accountId: string, endDate: string) => {
    const end = new Date(endDate);
    return transactions
      .filter(tx => tx.bankAccountId === accountId)
      .filter(tx => new Date(tx.date) <= end)
      .reduce((sum, tx) => sum + (tx.type === 'Deposit' ? tx.amount : -tx.amount), 0);
  };

  const getStartingBalance = (accountId: string, startDate: string) => {
    const start = new Date(startDate);
    return transactions
      .filter(tx => tx.bankAccountId === accountId)
      .filter(tx => new Date(tx.date) < start)
      .reduce((sum, tx) => sum + (tx.type === 'Deposit' ? tx.amount : -tx.amount), 0);
  };

  const getCategoryType = (categoryId?: string) => {
    if (!categoryId) return undefined;
    return categories.find(c => c.id === categoryId)?.type;
  };

  const advanceScheduleDate = (date: Date, frequency: ScheduledPayment['frequency']) => {
    switch (frequency) {
      case 'Daily':
        return addDays(date, 1);
      case 'Weekly':
        return addDays(date, 7);
      case 'Biweekly':
        return addDays(date, 14);
      case 'Monthly':
        return addMonths(date, 1);
      case 'Quarterly':
        return addMonths(date, 3);
      case 'Annually':
        return addYears(date, 1);
      default:
        return addMonths(date, 1);
    }
  };

  const expandScheduledPaymentOccurrences = (payment: ScheduledPayment, start: Date, end: Date) => {
    const dates: Date[] = [];
    if (!payment.nextPaymentDate) return dates;
    let cursor = new Date(payment.nextPaymentDate);
    if (Number.isNaN(cursor.getTime())) return dates;
    const paymentEnd = payment.endDate ? new Date(payment.endDate) : null;
    let guard = 0;

    while (cursor <= end && guard < 2000) {
      if (paymentEnd && cursor > paymentEnd) break;
      if (cursor >= start) {
        dates.push(new Date(cursor));
      }
      cursor = advanceScheduleDate(cursor, payment.frequency);
      guard += 1;
    }

    return dates;
  };

  const reconciliationPreview = useMemo(() => {
    if (!reconciliationForm.bankAccountId || !reconciliationForm.startDate || !reconciliationForm.endDate) {
      return null;
    }
    const startingBalance = getStartingBalance(reconciliationForm.bankAccountId, reconciliationForm.startDate);
    const bookBalance = getAccountBalanceUpTo(reconciliationForm.bankAccountId, reconciliationForm.endDate);
    const endingBalance = Number(reconciliationForm.endingBalance);
    const clearedBalance = Number.isFinite(endingBalance) ? endingBalance : 0;
    const difference = bookBalance - clearedBalance;
    return {
      startingBalance,
      bookBalance,
      clearedBalance,
      difference
    };
  }, [reconciliationForm, transactions]);

  const forecastPreview = useMemo(() => {
    if (!forecastForm.bankAccountId || !forecastForm.date) return null;
    const forecastEnd = new Date(forecastForm.date);
    if (Number.isNaN(forecastEnd.getTime())) return null;

    const forecastStart = new Date();
    forecastStart.setHours(0, 0, 0, 0);
    const todayKey = format(forecastStart, 'yyyy-MM-dd');
    const baseBalance = getAccountBalanceUpTo(forecastForm.bankAccountId, todayKey);

    let income = 0;
    let expenses = 0;
    let recurringIncome = 0;
    const scheduledForForecast: ScheduledPayment[] = [];

    scheduledPayments
      .filter(p => p.status === 'Active' && p.bankAccountId === forecastForm.bankAccountId)
      .forEach(payment => {
        const occurrences = expandScheduledPaymentOccurrences(payment, forecastStart, forecastEnd);
        if (occurrences.length > 0) {
          scheduledForForecast.push(payment);
        }
        const categoryType = getCategoryType(payment.categoryId);
        const isIncome = categoryType === 'Income';
        occurrences.forEach(() => {
          if (isIncome) income += payment.amount;
          else expenses += payment.amount;
        });
      });

    recurringScheduleRows
      .filter(row => row.status === 'Active')
      .forEach(row => {
        const rowDate = new Date(row.nextPaymentDate);
        if (rowDate >= forecastStart && rowDate <= forecastEnd) {
          recurringIncome += row.amount;
        }
      });

    income += recurringIncome;

    const projectedBalance = baseBalance + income - expenses;
    const variance = projectedBalance - baseBalance;

    return {
      baseBalance,
      income,
      recurringIncome,
      expenses,
      projectedBalance,
      variance,
      scheduledPayments: scheduledForForecast
    };
  }, [forecastForm, scheduledPayments, recurringScheduleRows, categories, transactions]);

  const visibleForecasts = useMemo(() => {
    if (!selectedAccountId) return cashFlowForecasts;
    return cashFlowForecasts.filter(forecast => forecast.bankAccountId === selectedAccountId);
  }, [cashFlowForecasts, selectedAccountId]);

  const handleQuickFilter = (filter: string) => {
    setQuickFilter(filter);
  };

  const handleCreateAccount = () => {
    setModalData(null);
    setAccountForm({
      name: '',
      accountNumber: '',
      bankName: '',
      accountType: 'Asset',
      currency: companyConfig?.currencySymbol || 'USD',
      status: 'Active',
      openingDate: getDefaultDate()
    });
    setShowModal('Account');
  };

  const handleEditAccount = (account: BankAccount) => {
    setModalData(account);
    setAccountForm({
      name: account.name,
      accountNumber: account.accountNumber,
      bankName: account.bankName,
      accountType: account.accountType,
      currency: account.currency,
      status: account.status,
      openingDate: account.openingDate.split('T')[0]
    });
    setShowModal('Account');
  };

  const handleDeleteAccount = async (id: string) => {
    setConfirmState({
      open: true,
      title: 'Deactivate Account',
      message: 'Are you sure you want to deactivate this account?',
      type: 'danger',
      confirmText: 'Deactivate',
      onConfirm: async () => {
        await deleteAccount(id);
        if (selectedAccountId === id) {
          setSelectedAccountId(null);
        }
      }
    });
  };

  const handleCreateTransaction = () => {
    setModalData(null);
    setTransactionForm({
      date: getDefaultDate(),
      amount: '',
      type: 'Deposit',
      description: '',
      reference: '',
      bankAccountId: selectedAccountId || activeAccounts[0]?.id || '',
      categoryId: ''
    });
    setShowModal('Transaction');
  };

  const handleEditTransaction = (transaction: BankTransaction) => {
    setModalData(transaction);
    setTransactionForm({
      date: transaction.date.split('T')[0],
      amount: transaction.amount.toString(),
      type: transaction.type,
      description: transaction.description,
      reference: transaction.reference,
      bankAccountId: transaction.bankAccountId,
      categoryId: transaction.categoryId || ''
    });
    setShowModal('Transaction');
  };

  const handleSubmitAccount = async (event: React.FormEvent) => {
    event.preventDefault();

    const dateError = validateDateInFY(accountForm.openingDate);
    if (dateError) { window.alert(dateError); return; }

    const payload = {
      name: accountForm.name.trim(),
      accountNumber: accountForm.accountNumber.trim(),
      bankName: accountForm.bankName.trim(),
      accountType: accountForm.accountType,
      status: accountForm.status,
      openingDate: new Date(accountForm.openingDate).toISOString(),
      currency: accountForm.currency.trim().toUpperCase()
    };

    if (!payload.name || !payload.accountNumber || !payload.bankName) return;

    if (modalData) {
      await updateAccount({
        id: modalData.id,
        ...payload
      });
    } else {
      await createAccount(payload);
    }

    setShowModal(null);
  };

  const handleSubmitTransaction = async (event: React.FormEvent) => {
    event.preventDefault();

    const dateError = validateDateInFY(transactionForm.date);
    if (dateError) { window.alert(dateError); return; }

    const amount = Number(transactionForm.amount);
    if (!transactionForm.bankAccountId || !Number.isFinite(amount) || amount <= 0) return;

    const payload = {
      date: transactionForm.date,
      amount,
      type: transactionForm.type,
      description: transactionForm.description.trim() || transactionForm.type,
      reference: transactionForm.reference.trim() || `TXN-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      bankAccountId: transactionForm.bankAccountId,
      categoryId: transactionForm.categoryId || undefined,
      category: categories.find(c => c.id === transactionForm.categoryId)?.name,
      reconciled: false
    };

    if (modalData) {
      await updateTransaction({
        id: modalData.id,
        ...payload
      });
    } else {
      await createTransaction(payload);
    }

    setShowModal(null);
  };

  const handleSubmitScheduledPayment = async (event: React.FormEvent) => {
    event.preventDefault();

    const startDateError = validateDateInFY(scheduledPaymentForm.startDate);
    if (startDateError) { window.alert(startDateError); return; }
    if (scheduledPaymentForm.endDate) {
      const endDateError = validateDateInFY(scheduledPaymentForm.endDate);
      if (endDateError) { window.alert(endDateError); return; }
    }

    const amount = Number(scheduledPaymentForm.amount);
    if (!scheduledPaymentForm.name.trim() || !scheduledPaymentForm.bankAccountId || !Number.isFinite(amount) || amount <= 0) return;

    const counterpartyName = scheduledPaymentForm.counterpartyName.trim() || scheduledPaymentForm.name.trim();
    const payload = {
      name: scheduledPaymentForm.name.trim(),
      description: scheduledPaymentForm.description.trim() || scheduledPaymentForm.name.trim(),
      bankAccountId: scheduledPaymentForm.bankAccountId,
      amount,
      frequency: scheduledPaymentForm.frequency,
      startDate: scheduledPaymentForm.startDate,
      endDate: scheduledPaymentForm.endDate || undefined,
      status: scheduledPaymentForm.status,
      paymentMethod: scheduledPaymentForm.paymentMethod,
      counterparty: {
        name: counterpartyName,
        accountNumber: scheduledPaymentForm.counterpartyAccountNumber.trim() || undefined,
        bankName: scheduledPaymentForm.counterpartyBankName.trim() || undefined
      },
      categoryId: scheduledPaymentForm.categoryId || undefined,
      category: categories.find(c => c.id === scheduledPaymentForm.categoryId)?.name
    };

    if (modalData) {
      await updateScheduledPayment({
        id: modalData.id,
        ...payload,
        nextPaymentDate: scheduledPaymentForm.startDate
      });
    } else {
      await createScheduledPayment(payload);
    }

    setShowModal(null);
  };

  const handleSubmitReconciliation = async (event: React.FormEvent) => {
    event.preventDefault();

    const startDateError = validateDateInFY(reconciliationForm.startDate);
    if (startDateError) { window.alert(startDateError); return; }
    const endDateError = validateDateInFY(reconciliationForm.endDate);
    if (endDateError) { window.alert(endDateError); return; }

    const endingBalance = Number(reconciliationForm.endingBalance);
    if (!reconciliationForm.bankAccountId || !reconciliationForm.startDate || !reconciliationForm.endDate) return;
    if (!Number.isFinite(endingBalance)) return;

    const startDate = reconciliationForm.startDate;
    const endDate = reconciliationForm.endDate;
    const startingBalance = getStartingBalance(reconciliationForm.bankAccountId, startDate);
    const bookBalance = getAccountBalanceUpTo(reconciliationForm.bankAccountId, endDate);
    const clearedBalance = endingBalance;
    const difference = bookBalance - clearedBalance;
    const unclearedItems = transactions.filter(tx => {
      if (tx.bankAccountId !== reconciliationForm.bankAccountId) return false;
      if (tx.reconciled) return false;
      return new Date(tx.date) <= new Date(endDate);
    });

    const payload = {
      bankAccountId: reconciliationForm.bankAccountId,
      statementId: reconciliationForm.statementId.trim() || `Manual-${endDate}`,
      startDate,
      endDate,
      startingBalance,
      endingBalance,
      bookBalance,
      clearedBalance,
      unclearedItems,
      adjustments: [],
      difference,
      status: 'Pending' as const,
      notes: reconciliationForm.notes.trim() || undefined
    };

    await createReconciliation(payload);
    setShowModal(null);
  };

  const handleSubmitForecast = async (event: React.FormEvent) => {
    event.preventDefault();

    const dateError = validateDateInFY(forecastForm.date);
    if (dateError) { window.alert(dateError); return; }

    if (!forecastForm.bankAccountId || !forecastForm.date || !forecastPreview) return;

    const payload = {
      bankAccountId: forecastForm.bankAccountId,
      date: forecastForm.date,
      projectedBalance: forecastPreview.projectedBalance,
      actualBalance: forecastPreview.baseBalance,
      variance: forecastPreview.variance,
      income: forecastPreview.income,
      expenses: forecastPreview.expenses,
      scheduledPayments: forecastPreview.scheduledPayments,
      notes: forecastForm.notes.trim() || undefined
    };

    await createCashFlowForecast(payload);
    setShowModal(null);
  };

  const handleDeleteTransaction = async (id: string) => {
    setConfirmState({
      open: true,
      title: 'Delete Transaction',
      message: 'Are you sure you want to delete this transaction?',
      type: 'danger',
      confirmText: 'Delete',
      onConfirm: async () => {
        await deleteTransaction(id);
      }
    });
  };

  const handleCreateScheduledPayment = () => {
    setModalData(null);
    setScheduledPaymentForm({
      name: '',
      description: '',
      bankAccountId: selectedAccountId || activeAccounts[0]?.id || '',
      amount: '',
      frequency: 'Monthly',
      startDate: new Date().toISOString().split('T')[0],
      endDate: '',
      status: 'Active',
      paymentMethod: 'Bank Transfer',
      counterpartyName: '',
      counterpartyAccountNumber: '',
      counterpartyBankName: '',
      categoryId: ''
    });
    setShowModal('ScheduledPayment');
  };

  const handleEditScheduledPayment = (payment: ScheduledPayment) => {
    setModalData(payment);
    setScheduledPaymentForm({
      name: payment.name,
      description: payment.description,
      bankAccountId: payment.bankAccountId,
      amount: payment.amount.toString(),
      frequency: payment.frequency,
      startDate: normalizeDate(payment.startDate),
      endDate: payment.endDate ? normalizeDate(payment.endDate) : '',
      status: payment.status,
      paymentMethod: payment.paymentMethod,
      counterpartyName: payment.counterparty?.name || '',
      counterpartyAccountNumber: payment.counterparty?.accountNumber || '',
      counterpartyBankName: payment.counterparty?.bankName || '',
      categoryId: payment.categoryId || ''
    });
    setShowModal('ScheduledPayment');
  };

  const handleDeleteScheduledPayment = async (id: string) => {
    setConfirmState({
      open: true,
      title: 'Delete Scheduled Payment',
      message: 'Are you sure you want to delete this scheduled payment?',
      type: 'danger',
      confirmText: 'Delete',
      onConfirm: async () => {
        await deleteScheduledPayment(id);
      }
    });
  };

  const handleCreateFee = () => {
    setModalData(null);
    setShowModal('Fee');
  };

  const handleCreateStatement = () => {
    setModalData(null);
    setShowModal('Statement');
  };

  const handleGenerateStatement = async () => {
    if (!selectedAccountId) return;
    
    try {
      // Use selected date range
      const startDate = new Date(dateRange.start);
      const endDate = new Date(dateRange.end);
      
      // Get all account transactions first, then derive period values
      const allAccountTransactions = transactions
        .filter(tx => tx.bankAccountId === selectedAccountId)
        .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

      const statementTransactions = allAccountTransactions
        .filter(tx => {
          const txDate = new Date(tx.date);
          return txDate >= startDate && txDate <= endDate;
        });
      
      // Calculate balances
      const startingBalance = allAccountTransactions
        .filter(tx => new Date(tx.date) < startDate)
        .reduce((sum, tx) => {
          return sum + (tx.type === 'Deposit' ? tx.amount : -tx.amount);
        }, 0);
      
      const endingBalance = statementTransactions
        .reduce((sum, tx) => {
          return sum + (tx.type === 'Deposit' ? tx.amount : -tx.amount);
        }, startingBalance);
      
      const totalDeposits = statementTransactions
        .filter(tx => tx.type === 'Deposit')
        .reduce((sum, tx) => sum + tx.amount, 0);
      
      const totalWithdrawals = statementTransactions
        .filter(tx => tx.type === 'Withdrawal' || tx.type === 'Fee' || tx.type === 'Payment')
        .reduce((sum, tx) => sum + tx.amount, 0);
      
      // Create statement
      const statementData = {
        bankAccountId: selectedAccountId,
        startDate: startDate.toISOString().split('T')[0],
        endDate: endDate.toISOString().split('T')[0],
        startingBalance,
        endingBalance,
        totalDeposits,
        totalWithdrawals,
        totalFees: statementTransactions.filter(tx => tx.type === 'Fee').reduce((sum, tx) => sum + tx.amount, 0),
        transactions: statementTransactions,
        source: 'Manual' as const,
        status: 'Processed' as const,
        importedBy: 'System'
      };
      
      await createStatement(statementData);
    } catch (error: any) {
      logger.error('Failed to generate statement:', error);
    }
  };

  const handleViewStatement = (statement: BankStatement) => {
    setModalData(statement);
    setShowModal('Statement');
  };

  const handleProcessStatement = async (id: string) => {
    await processStatement(id);
  };

  const handleCreateReconciliation = () => {
    setModalData(null);
    setReconciliationForm({
      bankAccountId: selectedAccountId || activeAccounts[0]?.id || '',
      startDate: startOfMonth(new Date()).toISOString().split('T')[0],
      endDate: new Date().toISOString().split('T')[0],
      endingBalance: '',
      statementId: '',
      notes: ''
    });
    setShowModal('Reconciliation');
  };

  const handleCompleteReconciliation = async (id: string) => {
    await completeReconciliation(id);
  };

  const handleCreateForecast = () => {
    setModalData(null);
    setForecastForm({
      bankAccountId: selectedAccountId || activeAccounts[0]?.id || '',
      date: addMonths(new Date(), 1).toISOString().split('T')[0],
      notes: ''
    });
    setShowModal('Forecast');
  };

  const handleCreateAlert = () => {
    setModalData(null);
    setShowModal('Alert');
  };

  const handleAcknowledgeAlert = async (id: string) => {
    await acknowledgeAlert(id);
  };

  const handleCreateCategory = () => {
    setModalData(null);
    setShowModal('Category');
  };

  const handleEditCategory = (category: BankCategory) => {
    setModalData(category);
    setShowModal('Category');
  };

  const handleDeleteCategory = async (id: string) => {
    setConfirmState({
      open: true,
      title: 'Delete Category',
      message: 'Are you sure you want to delete this category?',
      type: 'danger',
      confirmText: 'Delete',
      onConfirm: async () => {
        await deleteCategory(id);
      }
    });
  };

  const handleExportTransactions = () => {
    const csvData = [
      [
        'Date', 'Type', 'Description', 'Amount', 'Reference',
        'Category', 'Counterparty', 'Balance'
      ],
      ...accountTransactions.map(tx => [
        tx.date,
        tx.type,
        tx.description,
        tx.amount,
        tx.reference,
        tx.category || '',
        tx.counterparty?.name || '',
        accountBalance
      ])
    ];

    // Export functionality would use: exportToCSV(csvData, `transactions_${selectedAccountId || 'all'}_${dateRange.start}_${dateRange.end}.csv`);
  };

  const handleSaveExchangeRate = async () => {
    const rate = 1.12; // Example rate: 1 USD = 1.12 EUR
    await saveExchangeRate({
      baseCurrency: 'USD',
      targetCurrency: 'EUR',
      rate,
      date: getDefaultDate(),
      source: 'Manual'
    });
  };

  if (isLoading) {
    return (
      <div className="p-6 max-w-[1600px] mx-auto h-[calc(100vh-4rem)] flex flex-col items-center justify-center" style={{ background: paper }}>
        <div className="animate-spin rounded-full h-12 w-12 border-b-2" style={{ borderColor: teal[600] }}></div>
        <p className="mt-4 text-sm font-medium" style={{ color: inkSoft }}>Loading banking data...</p>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-[1600px] mx-auto h-[calc(100vh-4rem)] flex flex-col relative">

      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8 shrink-0">
        <div>
          <h1 className="text-2xl font-black text-ink flex items-center gap-3" style={{ fontFamily: "'DM Serif Display', Georgia, serif", fontWeight: 400, fontSize: 28, color: ink, letterSpacing: 0.2 }}>
            <Building2 className="text-teal-600" size={28} />
            Banking & Finance
          </h1>
          <p className="text-sm text-inkSoft mt-1 font-medium">
            Comprehensive banking management with reconciliation, forecasting, and reporting
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleCreateAccount}
            style={{ padding: '9px 18px', borderRadius: 9, cursor: 'pointer', background: paper, border: `1.4px solid ${hairline}`, color: inkSoft, display: 'flex', alignItems: 'center', gap: 6, transition: 'all .15s ease', fontFamily: 'inherit', fontSize: 13, fontWeight: 600 }}
            onMouseEnter={e => { e.currentTarget.style.background = teal[50]; e.currentTarget.style.borderColor = '#a6d9d3'; e.currentTarget.style.color = teal[700]; }}
            onMouseLeave={e => { e.currentTarget.style.background = paper; e.currentTarget.style.borderColor = hairline; e.currentTarget.style.color = inkSoft; }}
          >
            <Plus size={16} />
            New Account
          </button>
          <button
            onClick={handleSaveExchangeRate}
            style={{ padding: '9px 18px', borderRadius: 9, cursor: 'pointer', border: '1.4px solid transparent', background: `linear-gradient(155deg, ${teal[600]}, ${teal[800]})`, color: '#fff', display: 'flex', alignItems: 'center', gap: 6, boxShadow: '0 6px 16px -6px rgba(15,84,76,.55)', transition: 'all .15s ease', fontFamily: 'inherit', fontSize: 13, fontWeight: 600 }}
            onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 8px 20px -6px rgba(15,84,76,.65)'; }}
            onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 6px 16px -6px rgba(15,84,76,.55)'; }}
          >
            Update Exchange Rate
          </button>
          <button
            onClick={handleCreateTransaction}
            style={{ padding: '9px 18px', borderRadius: 9, cursor: 'pointer', border: '1.4px solid transparent', background: `linear-gradient(155deg, ${teal[600]}, ${teal[800]})`, color: '#fff', display: 'flex', alignItems: 'center', gap: 6, boxShadow: '0 6px 16px -6px rgba(15,84,76,.55)', transition: 'all .15s ease', fontFamily: 'inherit', fontSize: 13, fontWeight: 600 }}
            onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 8px 20px -6px rgba(15,84,76,.65)'; }}
            onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 6px 16px -6px rgba(15,84,76,.55)'; }}
          >
            <Plus size={18} />
            New Transaction
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex flex-col md:flex-row gap-2 mb-6 shrink-0">
        {(['Accounts', 'Transactions', 'Statements', 'Scheduled', 'Reconciliation', 'Forecasts', 'Reports'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{
              padding: '9px 18px', borderRadius: 9, cursor: 'pointer', border: `1.4px solid ${activeTab === tab ? teal[400] : hairline}`,
              background: activeTab === tab ? teal[50] : paper, color: activeTab === tab ? teal[700] : inkSoft,
              fontFamily: 'inherit', fontSize: 13, fontWeight: 600, transition: 'all .15s ease',
            }}
            onMouseEnter={e => { if (activeTab !== tab) { e.currentTarget.style.background = '#fafbfb'; } }}
            onMouseLeave={e => { if (activeTab !== tab) { e.currentTarget.style.background = paper; } }}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Content based on active tab */}
      {activeTab === 'Accounts' && (
        <div className="mb-8">
          {activeAccounts.length === 0 ? (
            <div className="bg-white rounded-[1.5rem] border border-slate-200 shadow-sm p-10 text-center" style={{ background: paper, borderColor: hairline }}>
              <Building2 size={48} className="mx-auto mb-4" style={{ color: inkSoft }} />
              <p className="font-medium" style={{ color: inkSoft }}>No active banking accounts available.</p>
              <p className="text-sm mt-1" style={{ color: inkSoft }}>
                Create a banking account to start tracking balances and transactions.
              </p>
              <button
                onClick={handleCreateAccount}
                style={{ padding: '9px 18px', borderRadius: 9, cursor: 'pointer', border: '1.4px solid transparent', background: `linear-gradient(155deg, ${teal[600]}, ${teal[800]})`, color: '#fff', display: 'inline-flex', alignItems: 'center', gap: 6, boxShadow: '0 6px 16px -6px rgba(15,84,76,.55)', transition: 'all .15s ease', fontFamily: 'inherit', fontSize: 13, fontWeight: 600, marginTop: 20 }}
                onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 8px 20px -6px rgba(15,84,76,.65)'; }}
                onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 6px 16px -6px rgba(15,84,76,.55)'; }}
              >
                Create Account
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {activeAccounts.map(acc => (
                <div
                  key={acc.id}
                  className="bg-white p-[24px] rounded-[1.5rem] border border-slate-200 shadow-sm hover:shadow-xl transition-all group hover:border-teal-300 flex flex-col cursor-pointer"
                  style={{ background: paper, borderColor: hairline }}
                  onClick={() => setSelectedAccountId(acc.id)}
                >
                  <div className="flex justify-between items-start mb-4">
                    <div className="p-3 rounded-xl text-teal-600 group-hover:bg-teal-50 group-hover:text-teal-600 transition-colors" style={{ background: teal[50] }}>
                      <Building2 size={24} />
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <span className="text-[10px] font-black px-2 py-1 rounded-lg tracking-wide mb-1" style={{ backgroundColor: teal[50], color: inkSoft }}>
                        {acc.accountNumber}
                      </span>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleEditAccount(acc);
                          }}
                          className="p-2 text-teal-600 hover:bg-teal-50 rounded-lg transition-colors"
                          title="Edit account"
                        >
                          <Edit size={16} />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteAccount(acc.id);
                          }}
                          className="p-2 text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                          title="Deactivate account"
                        >
                          <Trash2 size={16} />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setAuditedAccount(acc);
                          }}
                          className="p-2 text-teal-600 hover:bg-teal-50 rounded-lg transition-colors"
                          title="View audit trail"
                        >
                          <Shield size={16} />
                        </button>
                      </div>
                    </div>
                  </div>
                  <div className="flex-1">
                    <h3 className="font-black text-slate-800 text-lg mb-1 group-hover:text-teal-900 transition-colors leading-tight" style={{ color: ink }}>
                      {acc.name}
                    </h3>
                    <p className="text-xs font-bold text-slate-400 tracking-wide mb-4" style={{ color: inkSoft }}>
                      {acc.bankName}
                    </p>
                    <div className="pt-4 border-t border-slate-100 flex justify-between items-center" style={{ borderColor: hairline }}>
                      <span className="text-[10px] font-black tracking-wide" style={{ color: inkSoft }}>Balance</span>
                      <span className={`text-xl font-black ${
                        acc.balance >= 0 ? 'text-emerald-600' : 'text-rose-600'
                      }`}>
                        {currency}{acc.balance.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                    <div className="pt-2 flex justify-between items-center">
                      <span className="text-[10px] font-black tracking-wide" style={{ color: inkSoft }}>Available</span>
                      <span className={`text-sm font-black ${
                        acc.availableBalance >= 0 ? 'text-emerald-600' : 'text-rose-600'
                      }`}>
                        {currency}{acc.availableBalance.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === 'Transactions' && (
        <div className="bg-white rounded-[1.5rem] border border-slate-200 shadow-sm flex flex-col flex-1 overflow-hidden">
          {/* Header */}
          <div className="p-[24px] border-b border-slate-200 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between" style={{ background: teal[50], borderColor: hairline }}>
            <div className="flex items-center gap-2">
              <Search size={16} style={{ color: inkSoft }} />
              <h3 className="font-semibold tracking-tighter text-[16px]" style={{ color: ink }}>Transactions</h3>
            </div>
            <div className="flex flex-wrap items-center gap-4 text-xs sm:text-sm">
              <span style={{ color: inkSoft, fontWeight: 600 }}>Cash Flow</span>
              <div className="flex items-center gap-2">
                <span style={{ color: inkSoft }}>Income</span>
                <span className="font-semibold text-emerald-600">+{currency}{cashFlowSummary.income.toLocaleString()}</span>
              </div>
              <div className="flex items-center gap-2">
                <span style={{ color: inkSoft }}>Expenses</span>
                <span className="font-semibold text-rose-600">-{currency}{cashFlowSummary.expenses.toLocaleString()}</span>
              </div>
              <div className="flex items-center gap-2">
                <span style={{ color: inkSoft }}>Transactions</span>
                <span className="font-semibold text-teal-600">{cashFlowSummary.transactions}</span>
              </div>
              <div className="flex items-center gap-2">
                <span style={{ color: inkSoft }}>Net</span>
                <span className={`font-semibold ${cashFlowSummary.net >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                  {cashFlowSummary.net >= 0 ? '+' : ''}{currency}{cashFlowSummary.net.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </span>
              </div>
            </div>
          </div>

          {/* Filters */}
          <div className="p-[24px] border-b border-slate-100 flex flex-col md:flex-row gap-4" style={{ borderColor: hairline }}>
            <div className="flex gap-2 flex-wrap">
              {['This Week', 'This Month', 'This Year', 'All Time'].map((filter) => (
                <button
                  key={filter}
                  onClick={() => handleQuickFilter(filter)}
                  style={{
                    padding: '9px 18px', borderRadius: 9, cursor: 'pointer', border: `1.4px solid ${quickFilter === filter ? teal[400] : hairline}`,
                    background: quickFilter === filter ? teal[50] : paper, color: quickFilter === filter ? teal[700] : inkSoft,
                    fontFamily: 'inherit', fontSize: 13, fontWeight: 600, transition: 'all .15s ease',
                  }}
                  onMouseEnter={e => { if (quickFilter !== filter) { e.currentTarget.style.background = '#fafbfb'; } }}
                  onMouseLeave={e => { if (quickFilter !== filter) { e.currentTarget.style.background = paper; } }}
                >
                  {filter}
                </button>
              ))}
            </div>
            <div className="flex-1 flex items-center justify-end gap-2">
              <select
                value={selectedAccountId || ''}
                onChange={(e) => setSelectedAccountId(e.target.value || null)}
                style={{ padding: '8px 10px', border: `1.4px solid ${hairline}`, borderRadius: 9, background: paper, color: ink, outline: 'none', fontFamily: 'inherit', fontSize: 13 }}
                onFocus={e => { e.currentTarget.style.borderColor = '#3fa294'; e.currentTarget.style.background = teal[50]; }}
                onBlur={e => { e.currentTarget.style.borderColor = hairline; e.currentTarget.style.background = paper; }}
              >
                <option value="">All Accounts</option>
                {activeAccounts.map(acc => (
                  <option key={acc.id} value={acc.id}>
                    {acc.name}
                  </option>
                ))}
              </select>
              <select
                value={selectedCategoryId || ''}
                onChange={(e) => setSelectedCategoryId(e.target.value || null)}
                style={{ padding: '8px 10px', border: `1.4px solid ${hairline}`, borderRadius: 9, background: paper, color: ink, outline: 'none', fontFamily: 'inherit', fontSize: 13 }}
                onFocus={e => { e.currentTarget.style.borderColor = '#3fa294'; e.currentTarget.style.background = teal[50]; }}
                onBlur={e => { e.currentTarget.style.borderColor = hairline; e.currentTarget.style.background = paper; }}
              >
                <option value="">All Categories</option>
                {categories.map(cat => (
                  <option key={cat.id} value={cat.id}>
                    {cat.name}
                  </option>
                ))}
              </select>
              <input
                type="text"
                placeholder="Search transactions..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                style={{ padding: '8px 10px', border: `1.4px solid ${hairline}`, borderRadius: 9, background: paper, color: ink, outline: 'none', fontFamily: 'inherit', fontSize: 13, minWidth: 200 }}
                onFocus={e => { e.currentTarget.style.borderColor = '#3fa294'; e.currentTarget.style.background = teal[50]; }}
                onBlur={e => { e.currentTarget.style.borderColor = hairline; e.currentTarget.style.background = paper; }}
              />
              <button
                onClick={handleExportTransactions}
                style={{ padding: '9px 18px', borderRadius: 9, cursor: 'pointer', border: '1.4px solid transparent', background: `linear-gradient(155deg, ${teal[600]}, ${teal[800]})`, color: '#fff', fontFamily: 'inherit', fontSize: 13, fontWeight: 600, boxShadow: '0 6px 16px -6px rgba(15,84,76,.55)', transition: 'all .15s ease' }}
                onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 8px 20px -6px rgba(15,84,76,.65)'; }}
                onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 6px 16px -6px rgba(15,84,76,.55)'; }}
              >
                Export
              </button>
            </div>
          </div>

          {/* Transactions Table */}
          <div className="flex-1 overflow-y-auto">
            {accountTransactions.length === 0 ? (
              <div className="p-8 text-center text-slate-400">
                <FileText size={48} className="mx-auto text-slate-200 mb-4" />
                <p className="text-sm italic">No transactions found for the selected criteria.</p>
              </div>
            ) : (
              <table className="w-full text-left text-sm">
                <thead className="sticky top-0 text-xs font-bold tracking-wide" style={{ backgroundColor: teal[50], color: inkSoft, borderBottom: `1.4px solid ${hairline}` }}>
                  <tr>
                    <th className="p-3">Date</th>
                    <th className="p-3">Account</th>
                    <th className="p-3">Type</th>
                    <th className="p-3">Description</th>
                    <th className="p-3">Amount</th>
                    <th className="p-3">Category</th>
                    <th className="p-3">Counterparty</th>
                    <th className="p-3">Reference</th>
                    <th className="p-3">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y" style={{ borderColor: hairline }}>
                  {accountTransactions.map(tx => (
                    <tr key={tx.id} className="hover:bg-teal-50 transition-colors" style={{ borderColor: hairline }}>
                      <td className="p-3 text-sm whitespace-nowrap" style={{ color: inkSoft }}>
                        {format(new Date(tx.date), 'MMM dd, yyyy')}
                      </td>
                      <td className="p-3 font-medium" style={{ color: ink }}>
                        {accounts.find(a => a.id === tx.bankAccountId)?.name || tx.bankAccountId}
                      </td>
                      <td className="p-3 font-medium">
                        <span className="px-2 py-1 rounded text-[10px] font-black tracking-wide" style={{
                          backgroundColor: tx.type === 'Deposit' ? emerald[50] : tx.type === 'Withdrawal' ? danger[50] : tx.type === 'Fee' ? '#f1f5f9' : '#eef2ff',
                          color: tx.type === 'Deposit' ? emerald[600] : tx.type === 'Withdrawal' ? danger[500] : tx.type === 'Fee' ? inkSoft : '#4f46e5'
                        }}>
                          {tx.type}
                        </span>
                      </td>
                      <td className="p-3">
                        <div className="font-medium" style={{ color: ink }}>{tx.description}</div>
                        {tx.reference && (
                          <div className="text-[10px] font-mono mt-1" style={{ color: inkSoft }}>
                            Ref: {tx.reference}
                          </div>
                        )}
                      </td>
                      <td className="p-3 text-right font-bold" style={{ color: tx.type === 'Deposit' ? emerald[600] : danger[500] }}>
                        {tx.type === 'Deposit' ? '+' : '-'}
                        {currency}{Math.abs(tx.amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </td>
                      <td className="p-3" style={{ color: inkSoft }}>
                        {tx.category || 'Uncategorized'}
                      </td>
                      <td className="p-3">
                        {tx.counterparty?.name || 'N/A'}
                      </td>
                      <td className="p-3 font-mono text-[10px] text-slate-400">
                        {tx.reference || '-'}
                      </td>
                      <td className="p-3 flex gap-1">
                        <button
                          onClick={() => handleEditTransaction(tx)}
                          className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                          title="Edit transaction"
                        >
                          <Edit size={16} />
                        </button>
                        <button
                          onClick={() => openDocumentPreview('Transaction Receipt', renderTransactionReceiptContent(tx))}
                          className="p-2 text-slate-600 hover:bg-slate-50 rounded-lg transition-colors"
                          title="Preview document"
                        >
                          <FileText size={16} />
                        </button>
                        <button
                          onClick={() => handleDeleteTransaction(tx.id)}
                          className="p-2 text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                          title="Delete transaction"
                        >
                          <Trash2 size={16} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

        </div>
      )}

      {/* Other tabs would follow similar patterns */}

      {activeTab === 'Statements' && (
        <div className="bg-white rounded-[1.5rem] border border-slate-200 shadow-sm flex flex-col flex-1 overflow-hidden" style={{ background: paper, borderColor: hairline }}>
          <div className="p-[24px] border-b border-slate-200 flex items-center justify-between" style={{ borderColor: hairline, background: teal[50] }}>
            <div className="flex items-center gap-2">
              <FileText size={16} style={{ color: inkSoft }} />
              <h3 className="font-semibold tracking-tighter text-[16px]" style={{ color: ink }}>Bank Statements</h3>
            </div>
            <div className="flex gap-2">
              <select
                value={selectedAccountId || ''}
                onChange={(e) => setSelectedAccountId(e.target.value || null)}
                style={{ padding: '8px 10px', border: `1.4px solid ${hairline}`, borderRadius: 9, background: paper, color: ink, outline: 'none', fontFamily: 'inherit', fontSize: 13 }}
                onFocus={e => { e.currentTarget.style.borderColor = '#3fa294'; e.currentTarget.style.background = teal[50]; }}
                onBlur={e => { e.currentTarget.style.borderColor = hairline; e.currentTarget.style.background = paper; }}
              >
                <option value="">Select Account</option>
                {activeAccounts.map(acc => (
                  <option key={acc.id} value={acc.id}>{acc.name}</option>
                ))}
              </select>
              <div className="flex gap-2">
                <input
                  type="date"
                  value={dateRange.start}
                  onChange={(e) => setDateRange({...dateRange, start: e.target.value})}
                  style={{ padding: '8px 10px', border: `1.4px solid ${hairline}`, borderRadius: 9, background: paper, color: ink, outline: 'none', fontFamily: 'inherit', fontSize: 13 }}
                  onFocus={e => { e.currentTarget.style.borderColor = '#3fa294'; e.currentTarget.style.background = teal[50]; }}
                  onBlur={e => { e.currentTarget.style.borderColor = hairline; e.currentTarget.style.background = paper; }}
                />
                <input
                  type="date"
                  value={dateRange.end}
                  onChange={(e) => setDateRange({...dateRange, end: e.target.value})}
                  style={{ padding: '8px 10px', border: `1.4px solid ${hairline}`, borderRadius: 9, background: paper, color: ink, outline: 'none', fontFamily: 'inherit', fontSize: 13 }}
                  onFocus={e => { e.currentTarget.style.borderColor = '#3fa294'; e.currentTarget.style.background = teal[50]; }}
                  onBlur={e => { e.currentTarget.style.borderColor = hairline; e.currentTarget.style.background = paper; }}
                />
              </div>
              <button
                onClick={handleGenerateStatement}
                disabled={!selectedAccountId}
                style={{ padding: '9px 18px', borderRadius: 9, cursor: 'pointer', border: '1.4px solid transparent', background: `linear-gradient(155deg, ${teal[600]}, ${teal[800]})`, color: '#fff', fontFamily: 'inherit', fontSize: 13, fontWeight: 600, boxShadow: '0 6px 16px -6px rgba(15,84,76,.55)', transition: 'all .15s ease', display: 'flex', alignItems: 'center', gap: 6 }}
                onMouseEnter={e => { if (!e.currentTarget.disabled) { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 8px 20px -6px rgba(15,84,76,.65)'; }}}
                onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 6px 16px -6px rgba(15,84,76,.55)'; }}
              >
                <FileText size={16} />
                Generate Statement
              </button>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-6">
            {statements.length === 0 ? (
<div className="text-center py-12" style={{ color: inkSoft }}>
                <FileText size={48} className="mx-auto mb-4" style={{ color: hairline }} />
                <p className="text-sm italic">No statements found for the selected criteria.</p>
              </div>
            ) : (
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-slate-500 border-b border-slate-200">
                  <tr>
                    <th className="p-4">Account</th>
                    <th className="p-4">Period</th>
                    <th className="p-4">Starting Balance</th>
                    <th className="p-4">Ending Balance</th>
                    <th className="p-4">Deposits</th>
                    <th className="p-4">Withdrawals</th>
                    <th className="p-4">Status</th>
                    <th className="p-4">Generated</th>
                    <th className="p-4">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {statements.map(stmt => {
                    const account = accounts.find(a => a.id === stmt.bankAccountId);
                    return (
                      <tr key={stmt.id} className="hover:bg-slate-50">
                        <td className="p-4 font-medium">{account?.name || stmt.bankAccountId}</td>
                        <td className="p-4">
                          {format(parseISO(stmt.startDate), 'MMM dd')} - {format(parseISO(stmt.endDate), 'MMM dd, yyyy')}
                        </td>
                        <td className="p-4 font-mono text-emerald-600">{currency}{stmt.startingBalance.toLocaleString()}</td>
                        <td className="p-4 font-mono text-blue-600">{currency}{stmt.endingBalance.toLocaleString()}</td>
                        <td className="p-4 font-mono text-green-600">{currency}{stmt.totalDeposits.toLocaleString()}</td>
                        <td className="p-4 font-mono text-red-600">{currency}{stmt.totalWithdrawals.toLocaleString()}</td>
                        <td className="p-4">
                          <span className={`px-2 py-1 rounded text-xs font-medium ${
                            stmt.status === 'Reconciled' ? 'bg-emerald-100 text-emerald-700' :
                            stmt.status === 'Processed' ? 'bg-blue-100 text-blue-700' :
                            'bg-slate-100 text-slate-700'
                          }`}>
                            {stmt.status}
                          </span>
                        </td>
                        <td className="p-4 text-slate-500">
                          {format(parseISO(stmt.importedAt), 'MMM dd, yyyy')}
                        </td>
                        <td className="p-4">
                          <button
                            onClick={() => handleViewStatement(stmt)}
                            className="p-1 text-blue-600 hover:bg-blue-50 rounded"
                            title="View Statement"
                          >
                            <Eye size={16} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {activeTab === 'Scheduled' && (
        <div className="bg-white rounded-[1.5rem] border border-slate-200 shadow-sm flex flex-col flex-1 overflow-hidden" style={{ background: paper, borderColor: hairline }}>
          <div className="p-[24px] border-b border-slate-200 flex items-center justify-between" style={{ borderColor: hairline, background: teal[50] }}>
            <div className="flex items-center gap-2">
              <Clock size={16} style={{ color: inkSoft }} />
              <h3 className="font-semibold tracking-tighter text-[16px]" style={{ color: ink }}>Scheduled Payments</h3>
            </div>
            <button
              onClick={handleCreateScheduledPayment}
              style={{ padding: '9px 18px', borderRadius: 9, cursor: 'pointer', border: '1.4px solid transparent', background: `linear-gradient(155deg, ${teal[600]}, ${teal[800]})`, color: '#fff', display: 'flex', alignItems: 'center', gap: 6, boxShadow: '0 6px 16px -6px rgba(15,84,76,.55)', transition: 'all .15s ease', fontFamily: 'inherit', fontSize: 13, fontWeight: 600 }}
              onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 8px 20px -6px rgba(15,84,76,.65)'; }}
              onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 6px 16px -6px rgba(15,84,76,.55)'; }}
            >
              <Plus size={16} />
              Add Payment
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-6">
            {scheduledRows.length === 0 ? (
              <div className="text-center py-12" style={{ color: inkSoft }}>
                <Clock size={48} className="mx-auto mb-4" style={{ color: hairline }} />
                <p className="text-sm italic">No scheduled payments configured.</p>
              </div>
            ) : (
              <table className="w-full text-left text-sm">
                <thead className="sticky top-0 text-xs font-bold tracking-wide" style={{ backgroundColor: teal[50], color: inkSoft, borderBottom: `1.4px solid ${hairline}` }}>
                  <tr>
                    <th className="p-4">Name</th>
                    <th className="p-4">Next Payment</th>
                    <th className="p-4">Frequency</th>
                    <th className="p-4">Amount</th>
                    <th className="p-4">Status</th>
                    <th className="p-4">Source</th>
                    <th className="p-4">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y" style={{ borderColor: hairline }}>
                  {scheduledRows.map(row => (
                    <tr key={row.id} className="hover:bg-teal-50 transition-colors" style={{ borderColor: hairline }}>
                      <td className="p-4">
                        <div className="font-medium" style={{ color: ink }}>{row.name}</div>
                        {row.source === 'RecurringInvoice' && (
                          <div className="text-[11px]" style={{ color: inkSoft }}>Recurring invoice</div>
                        )}
                      </td>
                      <td className="p-4" style={{ color: ink }}>{format(parseISO(row.nextPaymentDate), 'MMM dd, yyyy')}</td>
                      <td className="p-4" style={{ color: ink }}>{row.frequency}</td>
                      <td className="p-4 font-mono font-bold" style={{ color: ink }}>{currency}{row.amount.toLocaleString()}</td>
                      <td className="p-4">
                        <span className="px-2 py-1 rounded text-xs font-medium" style={{
                          backgroundColor: row.status === 'Active' ? emerald[50] : row.status === 'Paused' ? amber[50] : '#f1f5f9',
                          color: row.status === 'Active' ? emerald[600] : row.status === 'Paused' ? amber[600] : inkSoft
                        }}>
                          {row.status}
                        </span>
                      </td>
                      <td className="p-4">
                        {row.source === 'Manual' && row.original ? (
                          <div className="flex gap-2">
                            <button
                              onClick={() => handleEditScheduledPayment(row.original!)}
                              className="p-2 text-teal-600 hover:bg-teal-50 rounded-lg transition-colors"
                              title="Edit payment"
                            >
                              <Edit size={16} />
                            </button>
                            <button
                              onClick={() => handleDeleteScheduledPayment(row.original!.id)}
                              className="p-2 text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                              title="Delete payment"
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        ) : (
                          <span className="text-xs" style={{ color: inkSoft }}>Managed in Sales</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {activeTab === 'Reconciliation' && (
        <div className="bg-white rounded-[1.5rem] border border-slate-200 shadow-sm flex flex-col flex-1 overflow-hidden" style={{ background: paper, borderColor: hairline }}>
          <div className="p-[24px] border-b border-slate-200 flex items-center justify-between" style={{ borderColor: hairline, background: teal[50] }}>
            <div className="flex items-center gap-2">
              <Shield size={16} style={{ color: inkSoft }} />
              <h3 className="font-semibold tracking-tighter text-[16px]" style={{ color: ink }}>Bank Reconciliation</h3>
            </div>
            <button
              onClick={handleCreateReconciliation}
              style={{ padding: '9px 18px', borderRadius: 9, cursor: 'pointer', border: '1.4px solid transparent', background: `linear-gradient(155deg, ${teal[600]}, ${teal[800]})`, color: '#fff', display: 'flex', alignItems: 'center', gap: 6, boxShadow: '0 6px 16px -6px rgba(15,84,76,.55)', transition: 'all .15s ease', fontFamily: 'inherit', fontSize: 13, fontWeight: 600 }}
              onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 8px 20px -6px rgba(15,84,76,.65)'; }}
              onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 6px 16px -6px rgba(15,84,76,.55)'; }}
            >
              <Plus size={16} />
              New Reconciliation
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-6">
            {reconciliations.length === 0 ? (
              <div className="text-center py-12" style={{ color: inkSoft }}>
                <Shield size={48} className="mx-auto mb-4" style={{ color: hairline }} />
                <p className="text-sm italic">No reconciliations started yet.</p>
              </div>
            ) : (
              <table className="w-full text-left text-sm">
                <thead className="sticky top-0 text-xs font-bold tracking-wide" style={{ backgroundColor: teal[50], color: inkSoft, borderBottom: `1.4px solid ${hairline}` }}>
                  <tr>
                    <th className="p-4">Period</th>
                    <th className="p-4">Bank Balance</th>
                    <th className="p-4">Book Balance</th>
                    <th className="p-4">Difference</th>
                    <th className="p-4">Status</th>
                    <th className="p-4">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y" style={{ borderColor: hairline }}>
                  {reconciliations.map(rec => (
                    <tr key={rec.id} className="hover:bg-teal-50 transition-colors" style={{ borderColor: hairline }}>
                      <td className="p-4">
                        {format(parseISO(rec.startDate), 'MMM dd')} - {format(parseISO(rec.endDate), 'MMM dd, yyyy')}
                      </td>
<td className="p-4 font-mono" style={{ color: ink }}>
                            {format(parseISO(rec.startDate), 'MMM dd, yyyy')} - {format(parseISO(rec.endDate), 'MMM dd, yyyy')}
                          </td>
                          <td className="p-4 font-mono" style={{ color: ink }}>{currency}{rec.startingBalance.toLocaleString()}</td>
                          <td className="p-4 font-mono" style={{ color: ink }}>{currency}{rec.bookBalance.toLocaleString()}</td>
                          <td className="p-4 font-mono font-bold" style={{ color: rec.difference === 0 ? emerald[600] : danger[500] }}>
                            {currency}{Math.abs(rec.difference).toLocaleString()}
                          </td>
                          <td className="p-4">
                            <span className="px-2 py-1 rounded text-xs font-medium" style={{
                              backgroundColor: rec.status === 'Completed' ? emerald[50] : rec.status === 'In Progress' ? teal[50] : '#f1f5f9',
                              color: rec.status === 'Completed' ? emerald[600] : rec.status === 'In Progress' ? teal[600] : inkSoft
                            }}>
                              {rec.status}
                            </span>
                          </td>
                          <td className="p-4">
                            {rec.status !== 'Completed' && (
                              <button
                                onClick={() => handleCompleteReconciliation(rec.id)}
                                style={{ padding: '5px 12px', borderRadius: 9, cursor: 'pointer', border: '1.4px solid transparent', background: `linear-gradient(155deg, ${teal[600]}, ${teal[800]})`, color: '#fff', fontFamily: 'inherit', fontSize: 11, fontWeight: 700, boxShadow: '0 4px 12px rgba(31,133,119,.12)', transition: 'all .15s ease' }}
                              >
                                Complete
                              </button>
                            )}
                          </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {activeTab === 'Forecasts' && (
<div className="bg-white rounded-[1.5rem] border border-slate-200 shadow-sm flex flex-col flex-1 overflow-hidden" style={{ background: paper, borderColor: hairline }}>
          <div className="p-[24px] border-b border-slate-200 flex items-center justify-between" style={{ borderColor: hairline, background: teal[50] }}>
            <div className="flex items-center gap-2">
              <TrendingUp size={16} style={{ color: inkSoft }} />
              <h3 className="font-semibold tracking-tighter text-[16px]" style={{ color: ink }}>Cash Flow Forecasts</h3>
            </div>
            <div className="flex items-center gap-2">
              <select
                value={selectedAccountId || ''}
                onChange={(e) => setSelectedAccountId(e.target.value || null)}
                style={{ padding: '8px 10px', border: `1.4px solid ${hairline}`, borderRadius: 9, background: paper, color: ink, outline: 'none', fontFamily: 'inherit', fontSize: 13 }}
                onFocus={e => { e.currentTarget.style.borderColor = '#3fa294'; e.currentTarget.style.background = teal[50]; }}
                onBlur={e => { e.currentTarget.style.borderColor = hairline; e.currentTarget.style.background = paper; }}
              >
                <option value="">All Accounts</option>
                {activeAccounts.map(acc => (
                  <option key={acc.id} value={acc.id}>{acc.name}</option>
                ))}
              </select>
              <button
                onClick={handleCreateForecast}
                style={{ padding: '9px 18px', borderRadius: 9, cursor: 'pointer', border: '1.4px solid transparent', background: `linear-gradient(155deg, ${teal[600]}, ${teal[800]})`, color: '#fff', display: 'flex', alignItems: 'center', gap: 6, boxShadow: '0 6px 16px -6px rgba(15,84,76,.55)', transition: 'all .15s ease', fontFamily: 'inherit', fontSize: 13, fontWeight: 600 }}
                onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 8px 20px -6px rgba(15,84,76,.65)'; }}
                onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 6px 16px -6px rgba(15,84,76,.55)'; }}
              >
                <Plus size={16} />
                New Forecast
              </button>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-6">
            {visibleForecasts.length === 0 ? (
              <div className="text-center py-12" style={{ color: inkSoft }}>
                <TrendingUp size={48} className="mx-auto mb-4" style={{ color: hairline }} />
                <p className="text-sm italic">No cash flow forecasts created yet.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {visibleForecasts.map(forecast => (
                  <div key={forecast.id} style={{ background: paper, borderRadius: 14, border: `1.4px solid ${hairline}`, boxShadow: '0 1px 3px rgba(0,0,0,0.04)', padding: 24 }}>
                    <div className="text-sm mb-2" style={{ color: inkSoft }}>
                      {format(parseISO(forecast.date), 'MMMM dd, yyyy')}
                    </div>
                    <div className="text-2xl font-bold mb-4" style={{ color: ink }}>
                      {currency}{forecast.projectedBalance.toLocaleString()}
                    </div>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <div style={{ color: inkSoft }}>Income</div>
                        <div className="font-medium text-emerald-600">+{currency}{forecast.income.toLocaleString()}</div>
                      </div>
                      <div>
                        <div style={{ color: inkSoft }}>Expenses</div>
                        <div className="font-medium text-rose-600">-{currency}{forecast.expenses.toLocaleString()}</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'Reports' && (
        <div className="bg-white rounded-[1.5rem] border border-slate-200 shadow-sm flex flex-col flex-1 overflow-hidden" style={{ background: paper, borderColor: hairline }}>
          <div className="flex-1 overflow-y-auto">
            <BankingReports selectedAccountId={selectedAccountId || undefined} />
          </div>
        </div>
      )}

      {/* Modals */}
      {/* Account Modal */}
      {showModal === 'Account' && (
        <div className="fixed inset-0 z-[60] bg-black/50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-[1.5rem] shadow-2xl w-full max-w-md overflow-hidden animate-fadeIn flex">
            <div style={{ width: 4, background: 'linear-gradient(180deg, #1f8577, #0f544c)', flexShrink: 0 }} />
            <div className="flex-1">
              <div className="p-[24px] border-b border-slate-100 flex justify-between items-center">
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                  <div style={{ width: 38, height: 38, borderRadius: 10, background: 'linear-gradient(155deg, #1f8577, #0f544c)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 10px -3px rgba(15,84,76,.4)' }}>
                    <Building2 size={18} color="#fff" />
                  </div>
                  <div>
                    <h2 style={{ fontFamily: "'DM Serif Display', Georgia, serif", fontWeight: 400, fontSize: 20, margin: 0, color: '#0b3e39', letterSpacing: 0.2 }}>
                      {modalData ? 'Edit Account' : 'New Account'}
                    </h2>
                    <p style={{ margin: '2px 0 0', fontSize: 11.5, color: '#5c6567', letterSpacing: 0.02 }}>Banking & Finance</p>
                  </div>
                </div>
                <button onClick={() => setShowModal(null)} style={{ padding: '6px', borderRadius: 8, border: '1.4px solid #e4ddd1', background: '#FEFDFB', color: '#5c6567', cursor: 'pointer', transition: 'all .15s ease' }}
                  onMouseEnter={e => { e.currentTarget.style.background = '#eef7f6'; e.currentTarget.style.color = '#0f544c'; e.currentTarget.style.borderColor = '#a6d9d3'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = '#FEFDFB'; e.currentTarget.style.color = '#5c6567'; e.currentTarget.style.borderColor = '#e4ddd1'; }}
                >
                  <X size={15} />
                </button>
              </div>
              <form onSubmit={handleSubmitAccount} className="p-6 space-y-4">
              <div>
                <label style={{ fontSize: 9, fontWeight: 700, letterSpacing: 0.06, textTransform: 'uppercase', color: '#5c6567', marginBottom: 5, display: 'block' }}>Account Name</label>
                <input
                  type="text"
                  value={accountForm.name}
                  onChange={(e) => setAccountForm({ ...accountForm, name: e.target.value })}
                  className="w-full"
                  style={{ padding: '8px 10px', border: '1.4px solid #e4ddd1', borderRadius: 7, fontSize: 13, color: '#23282A', background: '#FEFDFB', outline: 'none', fontFamily: 'inherit' }}
                  onFocus={e => { e.currentTarget.style.borderColor = '#3fa294'; e.currentTarget.style.background = '#eef7f6'; }}
                  onBlur={e => { e.currentTarget.style.borderColor = '#e4ddd1'; e.currentTarget.style.background = '#FEFDFB'; }}
                  placeholder="e.g. Main Operating Account"
                  required
                />
              </div>
              <div>
                <label style={{ fontSize: 9, fontWeight: 700, letterSpacing: 0.06, textTransform: 'uppercase', color: '#5c6567', marginBottom: 5, display: 'block' }}>Account Number</label>
                <input
                  type="text"
                  value={accountForm.accountNumber}
                  onChange={(e) => setAccountForm({ ...accountForm, accountNumber: e.target.value })}
                  className="w-full"
                  style={{ padding: '8px 10px', border: '1.4px solid #e4ddd1', borderRadius: 7, fontSize: 13, color: '#23282A', background: '#FEFDFB', outline: 'none', fontFamily: 'inherit' }}
                  onFocus={e => { e.currentTarget.style.borderColor = '#3fa294'; e.currentTarget.style.background = '#eef7f6'; }}
                  onBlur={e => { e.currentTarget.style.borderColor = '#e4ddd1'; e.currentTarget.style.background = '#FEFDFB'; }}
                  placeholder="e.g. 1234567890"
                  required
                />
              </div>
              <div>
                <label style={{ fontSize: 9, fontWeight: 700, letterSpacing: 0.06, textTransform: 'uppercase', color: '#5c6567', marginBottom: 5, display: 'block' }}>Bank Name</label>
                <input
                  type="text"
                  value={accountForm.bankName}
                  onChange={(e) => setAccountForm({ ...accountForm, bankName: e.target.value })}
                  className="w-full"
                  style={{ padding: '8px 10px', border: '1.4px solid #e4ddd1', borderRadius: 7, fontSize: 13, color: '#23282A', background: '#FEFDFB', outline: 'none', fontFamily: 'inherit' }}
                  onFocus={e => { e.currentTarget.style.borderColor = '#3fa294'; e.currentTarget.style.background = '#eef7f6'; }}
                  onBlur={e => { e.currentTarget.style.borderColor = '#e4ddd1'; e.currentTarget.style.background = '#FEFDFB'; }}
                  placeholder="e.g. Stanbic Bank"
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label style={{ fontSize: 9, fontWeight: 700, letterSpacing: 0.06, textTransform: 'uppercase', color: '#5c6567', marginBottom: 5, display: 'block' }}>Account Type</label>
                  <select
                    value={accountForm.accountType}
                    onChange={(e) => setAccountForm({ ...accountForm, accountType: e.target.value as 'Asset' | 'Liability' | 'Equity' | 'Revenue' | 'Expense' })}
                    className="w-full"
                    style={{ padding: '8px 10px', border: '1.4px solid #e4ddd1', borderRadius: 7, fontSize: 13, color: '#23282A', background: '#FEFDFB', outline: 'none', fontFamily: 'inherit' }}
                    onFocus={e => { e.currentTarget.style.borderColor = '#3fa294'; e.currentTarget.style.background = '#eef7f6'; }}
                    onBlur={e => { e.currentTarget.style.borderColor = '#e4ddd1'; e.currentTarget.style.background = '#FEFDFB'; }}
                  >
                    <option value="Asset">Asset</option>
                    <option value="Liability">Liability</option>
                    <option value="Equity">Equity</option>
                    <option value="Revenue">Revenue</option>
                    <option value="Expense">Expense</option>
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: 9, fontWeight: 700, letterSpacing: 0.06, textTransform: 'uppercase', color: '#5c6567', marginBottom: 5, display: 'block' }}>Currency</label>
                  <input
                    type="text"
                    value={accountForm.currency}
                    onChange={(e) => setAccountForm({ ...accountForm, currency: e.target.value.toUpperCase() })}
                    className="w-full"
                    style={{ padding: '8px 10px', border: '1.4px solid #e4ddd1', borderRadius: 7, fontSize: 13, color: '#23282A', background: '#FEFDFB', outline: 'none', fontFamily: 'inherit' }}
                    onFocus={e => { e.currentTarget.style.borderColor = '#3fa294'; e.currentTarget.style.background = '#eef7f6'; }}
                    onBlur={e => { e.currentTarget.style.borderColor = '#e4ddd1'; e.currentTarget.style.background = '#FEFDFB'; }}
                    placeholder="e.g. USD"
                    maxLength={3}
                    required
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label style={{ fontSize: 9, fontWeight: 700, letterSpacing: 0.06, textTransform: 'uppercase', color: '#5c6567', marginBottom: 5, display: 'block' }}>Opening Date</label>
                  <input
                    type="date"
                    value={accountForm.openingDate}
                    onChange={(e) => setAccountForm({ ...accountForm, openingDate: e.target.value })}
                    className="w-full"
                    style={{ padding: '8px 10px', border: '1.4px solid #e4ddd1', borderRadius: 7, fontSize: 13, color: '#23282A', background: '#FEFDFB', outline: 'none', fontFamily: 'inherit' }}
                    onFocus={e => { e.currentTarget.style.borderColor = '#3fa294'; e.currentTarget.style.background = '#eef7f6'; }}
                    onBlur={e => { e.currentTarget.style.borderColor = '#e4ddd1'; e.currentTarget.style.background = '#FEFDFB'; }}
                    required
                  />
                </div>
                <div>
                  <label style={{ fontSize: 9, fontWeight: 700, letterSpacing: 0.06, textTransform: 'uppercase', color: '#5c6567', marginBottom: 5, display: 'block' }}>Status</label>
                  <select
                    value={accountForm.status}
                    onChange={(e) => setAccountForm({ ...accountForm, status: e.target.value as 'Active' | 'Inactive' | 'Closed' })}
                    className="w-full"
                    style={{ padding: '8px 10px', border: '1.4px solid #e4ddd1', borderRadius: 7, fontSize: 13, color: '#23282A', background: '#FEFDFB', outline: 'none', fontFamily: 'inherit' }}
                    onFocus={e => { e.currentTarget.style.borderColor = '#3fa294'; e.currentTarget.style.background = '#eef7f6'; }}
                    onBlur={e => { e.currentTarget.style.borderColor = '#e4ddd1'; e.currentTarget.style.background = '#FEFDFB'; }}
                  >
                    <option value="Active">Active</option>
                    <option value="Inactive">Inactive</option>
                    <option value="Closed">Closed</option>
                  </select>
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowModal(null)}
                  style={{ padding: '9px 18px', borderRadius: 9, cursor: 'pointer', background: '#FEFDFB', border: '1.4px solid #e4ddd1', color: '#5c6567', display: 'flex', alignItems: 'center', gap: 7, transition: 'all .15s ease', fontFamily: 'inherit', fontSize: 13, fontWeight: 600 }}
                  onMouseEnter={e => { e.currentTarget.style.background = '#eef7f6'; e.currentTarget.style.borderColor = '#a6d9d3'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = '#FEFDFB'; e.currentTarget.style.borderColor = '#e4ddd1'; }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  style={{ padding: '9px 18px', borderRadius: 9, cursor: 'pointer', border: '1.4px solid transparent', background: 'linear-gradient(155deg, #1f8577, #0f544c)', color: '#fff', display: 'flex', alignItems: 'center', gap: 6, boxShadow: '0 6px 16px -6px rgba(15,84,76,.55)', transition: 'all .15s ease', fontFamily: 'inherit', fontSize: 13, fontWeight: 600 }}
                  onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 8px 20px -6px rgba(15,84,76,.65)'; }}
                  onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 6px 16px -6px rgba(15,84,76,.55)'; }}
                >
                  {modalData ? 'Update Account' : 'Create Account'}
                </button>
              </div>
            </form>
          </div>
        </div>
        </div>
      )}

      {/* Transaction Modal */}
      {showModal === 'Transaction' && (
        <div className="fixed inset-0 z-[60] bg-black/50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-[1.5rem] shadow-2xl w-full max-w-md overflow-hidden animate-fadeIn flex">
            <div style={{ width: 4, background: 'linear-gradient(180deg, #1f8577, #0f544c)', flexShrink: 0 }} />
            <div className="flex-1">
              <div className="p-[24px] border-b border-slate-100 flex justify-between items-center">
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                  <div style={{ width: 38, height: 38, borderRadius: 10, background: 'linear-gradient(155deg, #1f8577, #0f544c)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 10px -3px rgba(15,84,76,.4)' }}>
                    <ArrowRightLeft size={18} color="#fff" />
                  </div>
                  <div>
                    <h2 style={{ fontFamily: "'DM Serif Display', Georgia, serif", fontWeight: 400, fontSize: 20, margin: 0, color: '#0b3e39', letterSpacing: 0.2 }}>
                      {modalData ? 'Edit Transaction' : 'New Transaction'}
                    </h2>
                    <p style={{ margin: '2px 0 0', fontSize: 11.5, color: '#5c6567', letterSpacing: 0.02 }}>Banking & Finance</p>
                  </div>
                </div>
                <button onClick={() => setShowModal(null)} style={{ padding: '6px', borderRadius: 8, border: '1.4px solid #e4ddd1', background: '#FEFDFB', color: '#5c6567', cursor: 'pointer', transition: 'all .15s ease' }}
                  onMouseEnter={e => { e.currentTarget.style.background = '#eef7f6'; e.currentTarget.style.color = '#0f544c'; e.currentTarget.style.borderColor = '#a6d9d3'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = '#FEFDFB'; e.currentTarget.style.color = '#5c6567'; e.currentTarget.style.borderColor = '#e4ddd1'; }}
                >
                  <X size={15} />
                </button>
              </div>
              <form onSubmit={handleSubmitTransaction} className="p-6 space-y-4">
              <div>
                <label style={{ fontSize: 9, fontWeight: 700, letterSpacing: 0.06, textTransform: 'uppercase', color: '#5c6567', marginBottom: 5, display: 'block' }}>Account</label>
                <select
                  value={transactionForm.bankAccountId}
                  onChange={(e) => setTransactionForm({ ...transactionForm, bankAccountId: e.target.value })}
                  className="w-full"
                  style={{ padding: '8px 10px', border: '1.4px solid #e4ddd1', borderRadius: 7, fontSize: 13, color: '#23282A', background: '#FEFDFB', outline: 'none', fontFamily: 'inherit' }}
                  onFocus={e => { e.currentTarget.style.borderColor = '#3fa294'; e.currentTarget.style.background = '#eef7f6'; }}
                  onBlur={e => { e.currentTarget.style.borderColor = '#e4ddd1'; e.currentTarget.style.background = '#FEFDFB'; }}
                  required
                >
                  <option value="">Select account</option>
                  {activeAccounts.map(account => (
                    <option key={account.id} value={account.id}>
                      {account.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label style={{ fontSize: 9, fontWeight: 700, letterSpacing: 0.06, textTransform: 'uppercase', color: '#5c6567', marginBottom: 5, display: 'block' }}>Date</label>
                  <input
                    type="date"
                    value={transactionForm.date}
                    onChange={(e) => setTransactionForm({ ...transactionForm, date: e.target.value })}
                    className="w-full"
                    style={{ padding: '8px 10px', border: '1.4px solid #e4ddd1', borderRadius: 7, fontSize: 13, color: '#23282A', background: '#FEFDFB', outline: 'none', fontFamily: 'inherit' }}
                    onFocus={e => { e.currentTarget.style.borderColor = '#3fa294'; e.currentTarget.style.background = '#eef7f6'; }}
                    onBlur={e => { e.currentTarget.style.borderColor = '#e4ddd1'; e.currentTarget.style.background = '#FEFDFB'; }}
                    required
                  />
                </div>
                <div>
                  <label style={{ fontSize: 9, fontWeight: 700, letterSpacing: 0.06, textTransform: 'uppercase', color: '#5c6567', marginBottom: 5, display: 'block' }}>Type</label>
                  <select
                    value={transactionForm.type}
                    onChange={(e) => setTransactionForm({ ...transactionForm, type: e.target.value as BankTransaction['type'] })}
                    className="w-full"
                    style={{ padding: '8px 10px', border: '1.4px solid #e4ddd1', borderRadius: 7, fontSize: 13, color: '#23282A', background: '#FEFDFB', outline: 'none', fontFamily: 'inherit' }}
                    onFocus={e => { e.currentTarget.style.borderColor = '#3fa294'; e.currentTarget.style.background = '#eef7f6'; }}
                    onBlur={e => { e.currentTarget.style.borderColor = '#e4ddd1'; e.currentTarget.style.background = '#FEFDFB'; }}
                  >
                    <option value="Deposit">Deposit</option>
                    <option value="Withdrawal">Withdrawal</option>
                    <option value="Transfer">Transfer</option>
                    <option value="Fee">Fee</option>
                    <option value="Interest">Interest</option>
                    <option value="Payment">Payment</option>
                  </select>
                </div>
              </div>
              <div>
                <label style={{ fontSize: 9, fontWeight: 700, letterSpacing: 0.06, textTransform: 'uppercase', color: '#5c6567', marginBottom: 5, display: 'block' }}>Amount</label>
                <input
                  type="number"
                  step="0.01"
                  value={transactionForm.amount}
                  onChange={(e) => setTransactionForm({ ...transactionForm, amount: e.target.value })}
                  className="w-full"
                  style={{ padding: '8px 10px', border: '1.4px solid #e4ddd1', borderRadius: 7, fontSize: 13, color: '#23282A', background: '#FEFDFB', outline: 'none', fontFamily: 'inherit' }}
                  onFocus={e => { e.currentTarget.style.borderColor = '#3fa294'; e.currentTarget.style.background = '#eef7f6'; }}
                  onBlur={e => { e.currentTarget.style.borderColor = '#e4ddd1'; e.currentTarget.style.background = '#FEFDFB'; }}
                  placeholder="0.00"
                  required
                />
              </div>
              <div>
                <label style={{ fontSize: 9, fontWeight: 700, letterSpacing: 0.06, textTransform: 'uppercase', color: '#5c6567', marginBottom: 5, display: 'block' }}>Description</label>
                <input
                  type="text"
                  value={transactionForm.description}
                  onChange={(e) => setTransactionForm({ ...transactionForm, description: e.target.value })}
                  className="w-full"
                  style={{ padding: '8px 10px', border: '1.4px solid #e4ddd1', borderRadius: 7, fontSize: 13, color: '#23282A', background: '#FEFDFB', outline: 'none', fontFamily: 'inherit' }}
                  onFocus={e => { e.currentTarget.style.borderColor = '#3fa294'; e.currentTarget.style.background = '#eef7f6'; }}
                  onBlur={e => { e.currentTarget.style.borderColor = '#e4ddd1'; e.currentTarget.style.background = '#FEFDFB'; }}
                  placeholder="e.g. Office rent payment"
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label style={{ fontSize: 9, fontWeight: 700, letterSpacing: 0.06, textTransform: 'uppercase', color: '#5c6567', marginBottom: 5, display: 'block' }}>Reference</label>
                  <input
                    type="text"
                    value={transactionForm.reference}
                    onChange={(e) => setTransactionForm({ ...transactionForm, reference: e.target.value })}
                    className="w-full"
                    style={{ padding: '8px 10px', border: '1.4px solid #e4ddd1', borderRadius: 7, fontSize: 13, color: '#23282A', background: '#FEFDFB', outline: 'none', fontFamily: 'inherit' }}
                    onFocus={e => { e.currentTarget.style.borderColor = '#3fa294'; e.currentTarget.style.background = '#eef7f6'; }}
                    onBlur={e => { e.currentTarget.style.borderColor = '#e4ddd1'; e.currentTarget.style.background = '#FEFDFB'; }}
                    placeholder="e.g. INV-2024-001"
                  />
                </div>
                <div>
                  <label style={{ fontSize: 9, fontWeight: 700, letterSpacing: 0.06, textTransform: 'uppercase', color: '#5c6567', marginBottom: 5, display: 'block' }}>Category</label>
                  <select
                    value={transactionForm.categoryId}
                    onChange={(e) => setTransactionForm({ ...transactionForm, categoryId: e.target.value })}
                    className="w-full"
                    style={{ padding: '8px 10px', border: '1.4px solid #e4ddd1', borderRadius: 7, fontSize: 13, color: '#23282A', background: '#FEFDFB', outline: 'none', fontFamily: 'inherit' }}
                    onFocus={e => { e.currentTarget.style.borderColor = '#3fa294'; e.currentTarget.style.background = '#eef7f6'; }}
                    onBlur={e => { e.currentTarget.style.borderColor = '#e4ddd1'; e.currentTarget.style.background = '#FEFDFB'; }}
                  >
                    <option value="">Uncategorized</option>
                    {categories.map(category => (
                      <option key={category.id} value={category.id}>
                        {category.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowModal(null)}
                  style={{ padding: '9px 18px', borderRadius: 9, cursor: 'pointer', background: '#FEFDFB', border: '1.4px solid #e4ddd1', color: '#5c6567', display: 'flex', alignItems: 'center', gap: 7, transition: 'all .15s ease', fontFamily: 'inherit', fontSize: 13, fontWeight: 600 }}
                  onMouseEnter={e => { e.currentTarget.style.background = '#eef7f6'; e.currentTarget.style.borderColor = '#a6d9d3'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = '#FEFDFB'; e.currentTarget.style.borderColor = '#e4ddd1'; }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  style={{ padding: '9px 18px', borderRadius: 9, cursor: 'pointer', border: '1.4px solid transparent', background: 'linear-gradient(155deg, #1f8577, #0f544c)', color: '#fff', display: 'flex', alignItems: 'center', gap: 6, boxShadow: '0 6px 16px -6px rgba(15,84,76,.55)', transition: 'all .15s ease', fontFamily: 'inherit', fontSize: 13, fontWeight: 600 }}
                  onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 8px 20px -6px rgba(15,84,76,.65)'; }}
                  onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 6px 16px -6px rgba(15,84,76,.55)'; }}
                >
                  {modalData ? 'Update Transaction' : 'Create Transaction'}
                </button>
              </div>
            </form>
          </div>
        </div>
        </div>
      )}

      {/* Statement Modal */}
      {showModal === 'Statement' && (
        <div className="fixed inset-0 z-[60] bg-black/50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-[1.5rem] shadow-2xl w-full max-w-2xl overflow-hidden animate-fadeIn flex">
            <div style={{ width: 4, background: 'linear-gradient(180deg, #1f8577, #0f544c)', flexShrink: 0 }} />
            <div className="flex-1">
              <div className="p-[24px] border-b border-slate-100 flex justify-between items-center">
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                  <div style={{ width: 38, height: 38, borderRadius: 10, background: 'linear-gradient(155deg, #1f8577, #0f544c)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 10px -3px rgba(15,84,76,.4)' }}>
                    <FileText size={18} color="#fff" />
                  </div>
                  <div>
                    <h2 style={{ fontFamily: "'DM Serif Display', Georgia, serif", fontWeight: 400, fontSize: 20, margin: 0, color: '#0b3e39', letterSpacing: 0.2 }}>
                      Bank Statement
                    </h2>
                    <p style={{ margin: '2px 0 0', fontSize: 11.5, color: '#5c6567', letterSpacing: 0.02 }}>Banking & Finance</p>
                  </div>
                </div>
                <button onClick={() => setShowModal(null)} style={{ padding: '6px', borderRadius: 8, border: '1.4px solid #e4ddd1', background: '#FEFDFB', color: '#5c6567', cursor: 'pointer', transition: 'all .15s ease' }}
                  onMouseEnter={e => { e.currentTarget.style.background = '#eef7f6'; e.currentTarget.style.color = '#0f544c'; e.currentTarget.style.borderColor = '#a6d9d3'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = '#FEFDFB'; e.currentTarget.style.color = '#5c6567'; e.currentTarget.style.borderColor = '#e4ddd1'; }}
                >
                  <X size={15} />
                </button>
              </div>
              <div className="p-6 space-y-4 max-h-[60vh] overflow-auto">
              {modalData && (modalData as BankStatement) ? (
                <div className="space-y-2">
                  <div className="text-sm text-slate-600">Account: {accounts.find(a => a.id === (modalData as BankStatement).bankAccountId)?.name || (modalData as BankStatement).bankAccountId}</div>
                  <div className="text-sm text-slate-600">Period: {format(parseISO((modalData as BankStatement).startDate), 'MMM dd, yyyy')} - {format(parseISO((modalData as BankStatement).endDate), 'MMM dd, yyyy')}</div>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>Starting Balance: <strong>{currency}{(modalData as BankStatement).startingBalance.toLocaleString(undefined, { minimumFractionDigits: 2 })}</strong></div>
                    <div>Ending Balance: <strong>{currency}{(modalData as BankStatement).endingBalance.toLocaleString(undefined, { minimumFractionDigits: 2 })}</strong></div>
                  </div>
                </div>
              ) : (
                <div className="text-slate-500">No statement selected.</div>
              )}
              <div className="border-t border-slate-200 pt-2 mt-2"></div>
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => setShowModal(null)}
                  style={{ padding: '9px 18px', borderRadius: 9, cursor: 'pointer', background: '#FEFDFB', border: '1.4px solid #e4ddd1', color: '#5c6567', display: 'flex', alignItems: 'center', gap: 7, transition: 'all .15s ease', fontFamily: 'inherit', fontSize: 13, fontWeight: 600 }}
                  onMouseEnter={e => { e.currentTarget.style.background = '#eef7f6'; e.currentTarget.style.borderColor = '#a6d9d3'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = '#FEFDFB'; e.currentTarget.style.borderColor = '#e4ddd1'; }}
                >
                  Close
                </button>
                <button
                  style={{ padding: '9px 18px', borderRadius: 9, cursor: 'pointer', border: '1.4px solid transparent', background: 'linear-gradient(155deg, #1f8577, #0f544c)', color: '#fff', display: 'flex', alignItems: 'center', gap: 6, boxShadow: '0 6px 16px -6px rgba(15,84,76,.55)', transition: 'all .15s ease', fontFamily: 'inherit', fontSize: 13, fontWeight: 600 }}
                  onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 8px 20px -6px rgba(15,84,76,.65)'; }}
                  onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 6px 16px -6px rgba(15,84,76,.55)'; }}
                  onClick={() => openDocumentPreview('Statement Document', renderStatementDocumentContent(modalData as BankStatement))}
                >
                  Preview Document
                </button>
              </div>
            </div>
          </div>
        </div>
        </div>
      )}

      {/* Document Preview Modal */}
      <PreviewModal isOpen={documentPreviewOpen} onClose={closeDocumentPreview} title={documentPreviewTitle} content={documentPreviewContent} />

      {/* Scheduled Payment Modal */}
      {showModal === 'ScheduledPayment' && (
        <div className="fixed inset-0 z-[60] bg-black/50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-[1.5rem] shadow-2xl w-full max-w-lg overflow-hidden animate-fadeIn flex">
            <div style={{ width: 4, background: 'linear-gradient(180deg, #1f8577, #0f544c)', flexShrink: 0 }} />
            <div className="flex-1">
              <div className="p-[24px] border-b border-slate-100 flex justify-between items-center">
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                  <div style={{ width: 38, height: 38, borderRadius: 10, background: 'linear-gradient(155deg, #1f8577, #0f544c)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 10px -3px rgba(15,84,76,.4)' }}>
                    <Clock size={18} color="#fff" />
                  </div>
                  <div>
                    <h2 style={{ fontFamily: "'DM Serif Display', Georgia, serif", fontWeight: 400, fontSize: 20, margin: 0, color: '#0b3e39', letterSpacing: 0.2 }}>
                      {modalData ? 'Edit Scheduled Payment' : 'New Scheduled Payment'}
                    </h2>
                    <p style={{ margin: '2px 0 0', fontSize: 11.5, color: '#5c6567', letterSpacing: 0.02 }}>Banking & Finance</p>
                  </div>
                </div>
                <button onClick={() => setShowModal(null)} style={{ padding: '6px', borderRadius: 8, border: '1.4px solid #e4ddd1', background: '#FEFDFB', color: '#5c6567', cursor: 'pointer', transition: 'all .15s ease' }}
                  onMouseEnter={e => { e.currentTarget.style.background = '#eef7f6'; e.currentTarget.style.color = '#0f544c'; e.currentTarget.style.borderColor = '#a6d9d3'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = '#FEFDFB'; e.currentTarget.style.color = '#5c6567'; e.currentTarget.style.borderColor = '#e4ddd1'; }}
                >
                  <X size={15} />
                </button>
              </div>
              <form onSubmit={handleSubmitScheduledPayment} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Payment Name</label>
                <input
                  type="text"
                  value={scheduledPaymentForm.name}
                  onChange={(e) => setScheduledPaymentForm({ ...scheduledPaymentForm, name: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                  placeholder="e.g. Monthly Rent"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Description</label>
                <input
                  type="text"
                  value={scheduledPaymentForm.description}
                  onChange={(e) => setScheduledPaymentForm({ ...scheduledPaymentForm, description: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                  placeholder="e.g. Recurring payment for office space"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Account</label>
                <select
                  value={scheduledPaymentForm.bankAccountId}
                  onChange={(e) => setScheduledPaymentForm({ ...scheduledPaymentForm, bankAccountId: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                  required
                >
                  <option value="">Select account</option>
                  {activeAccounts.map(account => (
                    <option key={account.id} value={account.id}>
                      {account.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Amount</label>
                  <input
                    type="number"
                    step="0.01"
                    value={scheduledPaymentForm.amount}
                    onChange={(e) => setScheduledPaymentForm({ ...scheduledPaymentForm, amount: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                    placeholder="0.00"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Frequency</label>
                  <select
                    value={scheduledPaymentForm.frequency}
                    onChange={(e) => setScheduledPaymentForm({ ...scheduledPaymentForm, frequency: e.target.value as ScheduledPayment['frequency'] })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                  >
                    <option value="Daily">Daily</option>
                    <option value="Weekly">Weekly</option>
                    <option value="Biweekly">Biweekly</option>
                    <option value="Monthly">Monthly</option>
                    <option value="Quarterly">Quarterly</option>
                    <option value="Annually">Annually</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Start Date</label>
                  <input
                    type="date"
                    value={scheduledPaymentForm.startDate}
                    onChange={(e) => setScheduledPaymentForm({ ...scheduledPaymentForm, startDate: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">End Date (Optional)</label>
                  <input
                    type="date"
                    value={scheduledPaymentForm.endDate}
                    onChange={(e) => setScheduledPaymentForm({ ...scheduledPaymentForm, endDate: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Status</label>
                  <select
                    value={scheduledPaymentForm.status}
                    onChange={(e) => setScheduledPaymentForm({ ...scheduledPaymentForm, status: e.target.value as ScheduledPayment['status'] })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                  >
                    <option value="Active">Active</option>
                    <option value="Paused">Paused</option>
                    <option value="Completed">Completed</option>
                    <option value="Cancelled">Cancelled</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Payment Method</label>
                  <select
                    value={scheduledPaymentForm.paymentMethod}
                    onChange={(e) => setScheduledPaymentForm({ ...scheduledPaymentForm, paymentMethod: e.target.value as ScheduledPayment['paymentMethod'] })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                  >
                    <option value="Bank Transfer">Bank Transfer</option>
                    <option value="Wire Transfer">Wire Transfer</option>
                    <option value="ACH">ACH</option>
                    <option value="Check">Check</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Counterparty Name</label>
                  <input
                    type="text"
                    value={scheduledPaymentForm.counterpartyName}
                    onChange={(e) => setScheduledPaymentForm({ ...scheduledPaymentForm, counterpartyName: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                    placeholder="e.g. John Doe"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Counterparty Account</label>
                  <input
                    type="text"
                    value={scheduledPaymentForm.counterpartyAccountNumber}
                    onChange={(e) => setScheduledPaymentForm({ ...scheduledPaymentForm, counterpartyAccountNumber: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                    placeholder="e.g. 10987654321"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Counterparty Bank</label>
                  <input
                    type="text"
                    value={scheduledPaymentForm.counterpartyBankName}
                    onChange={(e) => setScheduledPaymentForm({ ...scheduledPaymentForm, counterpartyBankName: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                    placeholder="e.g. Equity Bank"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Category</label>
                  <select
                    value={scheduledPaymentForm.categoryId}
                    onChange={(e) => setScheduledPaymentForm({ ...scheduledPaymentForm, categoryId: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                  >
                    <option value="">Uncategorized</option>
                    {categories.map(category => (
                      <option key={category.id} value={category.id}>
                        {category.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowModal(null)}
                  style={{ padding: '9px 18px', borderRadius: 9, cursor: 'pointer', background: '#FEFDFB', border: '1.4px solid #e4ddd1', color: '#5c6567', display: 'flex', alignItems: 'center', gap: 7, transition: 'all .15s ease', fontFamily: 'inherit', fontSize: 13, fontWeight: 600 }}
                  onMouseEnter={e => { e.currentTarget.style.background = '#eef7f6'; e.currentTarget.style.borderColor = '#a6d9d3'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = '#FEFDFB'; e.currentTarget.style.borderColor = '#e4ddd1'; }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  style={{ padding: '9px 18px', borderRadius: 9, cursor: 'pointer', border: '1.4px solid transparent', background: 'linear-gradient(155deg, #1f8577, #0f544c)', color: '#fff', display: 'flex', alignItems: 'center', gap: 6, boxShadow: '0 6px 16px -6px rgba(15,84,76,.55)', transition: 'all .15s ease', fontFamily: 'inherit', fontSize: 13, fontWeight: 600 }}
                  onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 8px 20px -6px rgba(15,84,76,.65)'; }}
                  onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 6px 16px -6px rgba(15,84,76,.55)'; }}
                >
                  {modalData ? 'Update Payment' : 'Create Payment'}
                </button>
              </div>
            </form>
          </div>
        </div>
        </div>
      )}

      {/* Reconciliation Modal */}
      {showModal === 'Reconciliation' && (
        <div className="fixed inset-0 z-[60] bg-black/50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-[1.5rem] shadow-2xl w-full max-w-lg overflow-hidden animate-fadeIn flex">
            <div style={{ width: 4, background: 'linear-gradient(180deg, #1f8577, #0f544c)', flexShrink: 0 }} />
            <div className="flex-1">
              <div className="p-[24px] border-b border-slate-100 flex justify-between items-center">
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                  <div style={{ width: 38, height: 38, borderRadius: 10, background: 'linear-gradient(155deg, #1f8577, #0f544c)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 10px -3px rgba(15,84,76,.4)' }}>
                    <Shield size={18} color="#fff" />
                  </div>
                  <div>
                    <h2 style={{ fontFamily: "'DM Serif Display', Georgia, serif", fontWeight: 400, fontSize: 20, margin: 0, color: '#0b3e39', letterSpacing: 0.2 }}>
                      New Reconciliation
                    </h2>
                    <p style={{ margin: '2px 0 0', fontSize: 11.5, color: '#5c6567', letterSpacing: 0.02 }}>Banking & Finance</p>
                  </div>
                </div>
                <button onClick={() => setShowModal(null)} style={{ padding: '6px', borderRadius: 8, border: '1.4px solid #e4ddd1', background: '#FEFDFB', color: '#5c6567', cursor: 'pointer', transition: 'all .15s ease' }}
                  onMouseEnter={e => { e.currentTarget.style.background = '#eef7f6'; e.currentTarget.style.color = '#0f544c'; e.currentTarget.style.borderColor = '#a6d9d3'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = '#FEFDFB'; e.currentTarget.style.color = '#5c6567'; e.currentTarget.style.borderColor = '#e4ddd1'; }}
                >
                  <X size={15} />
                </button>
              </div>
            <form onSubmit={handleSubmitReconciliation} className="p-6 space-y-4">
              <div>
                <label style={{ fontSize: 9, fontWeight: 700, letterSpacing: 0.06, textTransform: 'uppercase', color: '#5c6567', marginBottom: 5, display: 'block' }}>Account</label>
                <select
                  value={reconciliationForm.bankAccountId}
                  onChange={(e) => setReconciliationForm({ ...reconciliationForm, bankAccountId: e.target.value })}
                  className="w-full"
                  style={{ padding: '8px 10px', border: '1.4px solid #e4ddd1', borderRadius: 7, fontSize: 13, color: '#23282A', background: '#FEFDFB', outline: 'none', fontFamily: 'inherit' }}
                  onFocus={e => { e.currentTarget.style.borderColor = '#3fa294'; e.currentTarget.style.background = '#eef7f6'; }}
                  onBlur={e => { e.currentTarget.style.borderColor = '#e4ddd1'; e.currentTarget.style.background = '#FEFDFB'; }}
                  required
                >
                  <option value="">Select account</option>
                  {activeAccounts.map(account => (
                    <option key={account.id} value={account.id}>
                      {account.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label style={{ fontSize: 9, fontWeight: 700, letterSpacing: 0.06, textTransform: 'uppercase', color: '#5c6567', marginBottom: 5, display: 'block' }}>Start Date</label>
                  <input
                    type="date"
                    value={reconciliationForm.startDate}
                    onChange={(e) => setReconciliationForm({ ...reconciliationForm, startDate: e.target.value })}
                    className="w-full"
                    style={{ padding: '8px 10px', border: '1.4px solid #e4ddd1', borderRadius: 7, fontSize: 13, color: '#23282A', background: '#FEFDFB', outline: 'none', fontFamily: 'inherit' }}
                    onFocus={e => { e.currentTarget.style.borderColor = '#3fa294'; e.currentTarget.style.background = '#eef7f6'; }}
                    onBlur={e => { e.currentTarget.style.borderColor = '#e4ddd1'; e.currentTarget.style.background = '#FEFDFB'; }}
                    required
                  />
                </div>
                <div>
                  <label style={{ fontSize: 9, fontWeight: 700, letterSpacing: 0.06, textTransform: 'uppercase', color: '#5c6567', marginBottom: 5, display: 'block' }}>End Date</label>
                  <input
                    type="date"
                    value={reconciliationForm.endDate}
                    onChange={(e) => setReconciliationForm({ ...reconciliationForm, endDate: e.target.value })}
                    className="w-full"
                    style={{ padding: '8px 10px', border: '1.4px solid #e4ddd1', borderRadius: 7, fontSize: 13, color: '#23282A', background: '#FEFDFB', outline: 'none', fontFamily: 'inherit' }}
                    onFocus={e => { e.currentTarget.style.borderColor = '#3fa294'; e.currentTarget.style.background = '#eef7f6'; }}
                    onBlur={e => { e.currentTarget.style.borderColor = '#e4ddd1'; e.currentTarget.style.background = '#FEFDFB'; }}
                    required
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label style={{ fontSize: 9, fontWeight: 700, letterSpacing: 0.06, textTransform: 'uppercase', color: '#5c6567', marginBottom: 5, display: 'block' }}>Ending Balance</label>
                  <input
                    type="number"
                    step="0.01"
                    value={reconciliationForm.endingBalance}
                    onChange={(e) => setReconciliationForm({ ...reconciliationForm, endingBalance: e.target.value })}
                    className="w-full"
                    style={{ padding: '8px 10px', border: '1.4px solid #e4ddd1', borderRadius: 7, fontSize: 13, color: '#23282A', background: '#FEFDFB', outline: 'none', fontFamily: 'inherit' }}
                    onFocus={e => { e.currentTarget.style.borderColor = '#3fa294'; e.currentTarget.style.background = '#eef7f6'; }}
                    onBlur={e => { e.currentTarget.style.borderColor = '#e4ddd1'; e.currentTarget.style.background = '#FEFDFB'; }}
                    placeholder="0.00"
                    required
                  />
                </div>
                <div>
                  <label style={{ fontSize: 9, fontWeight: 700, letterSpacing: 0.06, textTransform: 'uppercase', color: '#5c6567', marginBottom: 5, display: 'block' }}>Statement ID (Optional)</label>
                  <input
                    type="text"
                    value={reconciliationForm.statementId}
                    onChange={(e) => setReconciliationForm({ ...reconciliationForm, statementId: e.target.value })}
                    className="w-full"
                    style={{ padding: '8px 10px', border: '1.4px solid #e4ddd1', borderRadius: 7, fontSize: 13, color: '#23282A', background: '#FEFDFB', outline: 'none', fontFamily: 'inherit' }}
                    onFocus={e => { e.currentTarget.style.borderColor = '#3fa294'; e.currentTarget.style.background = '#eef7f6'; }}
                    onBlur={e => { e.currentTarget.style.borderColor = '#e4ddd1'; e.currentTarget.style.background = '#FEFDFB'; }}
                    placeholder="e.g. STMT-2024-04"
                  />
                </div>
              </div>
              <div>
                <label style={{ fontSize: 9, fontWeight: 700, letterSpacing: 0.06, textTransform: 'uppercase', color: '#5c6567', marginBottom: 5, display: 'block' }}>Notes</label>
                <textarea
                  value={reconciliationForm.notes}
                  onChange={(e) => setReconciliationForm({ ...reconciliationForm, notes: e.target.value })}
                  className="w-full"
                  style={{ padding: '8px 10px', border: '1.4px solid #e4ddd1', borderRadius: 7, fontSize: 13, color: '#23282A', background: '#FEFDFB', outline: 'none', fontFamily: 'inherit', minHeight: 80 }}
                  onFocus={e => { e.currentTarget.style.borderColor = '#3fa294'; e.currentTarget.style.background = '#eef7f6'; }}
                  onBlur={e => { e.currentTarget.style.borderColor = '#e4ddd1'; e.currentTarget.style.background = '#FEFDFB'; }}
                  placeholder="e.g. Adjustments for pending checks"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowModal(null)}
                  style={{ padding: '9px 18px', borderRadius: 9, cursor: 'pointer', background: '#FEFDFB', border: '1.4px solid #e4ddd1', color: '#5c6567', display: 'flex', alignItems: 'center', gap: 7, transition: 'all .15s ease', fontFamily: 'inherit', fontSize: 13, fontWeight: 600 }}
                  onMouseEnter={e => { e.currentTarget.style.background = '#eef7f6'; e.currentTarget.style.borderColor = '#a6d9d3'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = '#FEFDFB'; e.currentTarget.style.borderColor = '#e4ddd1'; }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  style={{ padding: '9px 18px', borderRadius: 9, cursor: 'pointer', border: '1.4px solid transparent', background: 'linear-gradient(155deg, #1f8577, #0f544c)', color: '#fff', display: 'flex', alignItems: 'center', gap: 6, boxShadow: '0 6px 16px -6px rgba(15,84,76,.55)', transition: 'all .15s ease', fontFamily: 'inherit', fontSize: 13, fontWeight: 600 }}
                  onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 8px 20px -6px rgba(15,84,76,.65)'; }}
                  onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 6px 16px -6px rgba(15,84,76,.55)'; }}
                >
                  Create Reconciliation
                </button>
              </div>
              {reconciliationPreview && (
                <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-sm space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">Starting Balance</span>
                    <span className="font-medium">{currency}{reconciliationPreview.startingBalance.toLocaleString()}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">Book Balance</span>
                    <span className="font-medium">{currency}{reconciliationPreview.bookBalance.toLocaleString()}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">Cleared Balance</span>
                    <span className="font-medium">{currency}{reconciliationPreview.clearedBalance.toLocaleString()}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">Difference</span>
                    <span className={reconciliationPreview.difference === 0 ? 'font-medium text-emerald-600' : 'font-medium text-rose-600'}>
                      {currency}{Math.abs(reconciliationPreview.difference).toLocaleString()}
                    </span>
                  </div>
                </div>
              )}
            </form>
          </div>
        </div>
        </div>
      )}

      {/* Forecast Modal */}
      {showModal === 'Forecast' && (
        <div className="fixed inset-0 z-[60] bg-black/50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-[1.5rem] shadow-2xl w-full max-w-lg overflow-hidden animate-fadeIn flex">
            <div style={{ width: 4, background: 'linear-gradient(180deg, #1f8577, #0f544c)', flexShrink: 0 }} />
            <div className="flex-1">
              <div className="p-[24px] border-b border-slate-100 flex justify-between items-center">
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                  <div style={{ width: 38, height: 38, borderRadius: 10, background: 'linear-gradient(155deg, #1f8577, #0f544c)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 10px -3px rgba(15,84,76,.4)' }}>
                    <TrendingUp size={18} color="#fff" />
                  </div>
                  <div>
                    <h2 style={{ fontFamily: "'DM Serif Display', Georgia, serif", fontWeight: 400, fontSize: 20, margin: 0, color: '#0b3e39', letterSpacing: 0.2 }}>
                      Create Cash Flow Forecast
                    </h2>
                    <p style={{ margin: '2px 0 0', fontSize: 11.5, color: '#5c6567', letterSpacing: 0.02 }}>Banking & Finance</p>
                  </div>
                </div>
                <button onClick={() => setShowModal(null)} style={{ padding: '6px', borderRadius: 8, border: '1.4px solid #e4ddd1', background: '#FEFDFB', color: '#5c6567', cursor: 'pointer', transition: 'all .15s ease' }}
                  onMouseEnter={e => { e.currentTarget.style.background = '#eef7f6'; e.currentTarget.style.color = '#0f544c'; e.currentTarget.style.borderColor = '#a6d9d3'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = '#FEFDFB'; e.currentTarget.style.color = '#5c6567'; e.currentTarget.style.borderColor = '#e4ddd1'; }}
                >
                  <X size={15} />
                </button>
              </div>
            <form onSubmit={handleSubmitForecast} className="p-6 space-y-4">
              <div>
                <label style={{ fontSize: 9, fontWeight: 700, letterSpacing: 0.06, textTransform: 'uppercase', color: '#5c6567', marginBottom: 5, display: 'block' }}>Account</label>
                <select
                  value={forecastForm.bankAccountId}
                  onChange={(e) => setForecastForm({ ...forecastForm, bankAccountId: e.target.value })}
                  className="w-full"
                  style={{ padding: '8px 10px', border: '1.4px solid #e4ddd1', borderRadius: 7, fontSize: 13, color: '#23282A', background: '#FEFDFB', outline: 'none', fontFamily: 'inherit' }}
                  onFocus={e => { e.currentTarget.style.borderColor = '#3fa294'; e.currentTarget.style.background = '#eef7f6'; }}
                  onBlur={e => { e.currentTarget.style.borderColor = '#e4ddd1'; e.currentTarget.style.background = '#FEFDFB'; }}
                  required
                >
                  <option value="">Select account</option>
                  {activeAccounts.map(account => (
                    <option key={account.id} value={account.id}>
                      {account.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label style={{ fontSize: 9, fontWeight: 700, letterSpacing: 0.06, textTransform: 'uppercase', color: '#5c6567', marginBottom: 5, display: 'block' }}>Forecast Date</label>
                  <input
                    type="date"
                    value={forecastForm.date}
                    onChange={(e) => setForecastForm({ ...forecastForm, date: e.target.value })}
                    className="w-full"
                    style={{ padding: '8px 10px', border: '1.4px solid #e4ddd1', borderRadius: 7, fontSize: 13, color: '#23282A', background: '#FEFDFB', outline: 'none', fontFamily: 'inherit' }}
                    onFocus={e => { e.currentTarget.style.borderColor = '#3fa294'; e.currentTarget.style.background = '#eef7f6'; }}
                    onBlur={e => { e.currentTarget.style.borderColor = '#e4ddd1'; e.currentTarget.style.background = '#FEFDFB'; }}
                    required
                  />
                </div>
                <div>
                  <label style={{ fontSize: 9, fontWeight: 700, letterSpacing: 0.06, textTransform: 'uppercase', color: '#5c6567', marginBottom: 5, display: 'block' }}>Notes</label>
                  <input
                    type="text"
                    value={forecastForm.notes}
                    onChange={(e) => setForecastForm({ ...forecastForm, notes: e.target.value })}
                    className="w-full"
                    style={{ padding: '8px 10px', border: '1.4px solid #e4ddd1', borderRadius: 7, fontSize: 13, color: '#23282A', background: '#FEFDFB', outline: 'none', fontFamily: 'inherit' }}
                    onFocus={e => { e.currentTarget.style.borderColor = '#3fa294'; e.currentTarget.style.background = '#eef7f6'; }}
                    onBlur={e => { e.currentTarget.style.borderColor = '#e4ddd1'; e.currentTarget.style.background = '#FEFDFB'; }}
                    placeholder="e.g. Q4 growth assumptions"
                  />
                </div>
              </div>
              {forecastPreview && (
                <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-sm space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">Base Balance</span>
                    <span className="font-medium">{currency}{forecastPreview.baseBalance.toLocaleString()}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">Scheduled Income</span>
                    <span className="font-medium text-emerald-600">+{currency}{(forecastPreview.income - forecastPreview.recurringIncome).toLocaleString()}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">Recurring Income</span>
                    <span className="font-medium text-emerald-600">+{currency}{forecastPreview.recurringIncome.toLocaleString()}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">Scheduled Expenses</span>
                    <span className="font-medium text-rose-600">-{currency}{forecastPreview.expenses.toLocaleString()}</span>
                  </div>
                  <div className="flex items-center justify-between border-t border-slate-200 pt-2 mt-2">
                    <span className="text-slate-600 font-semibold">Projected Balance</span>
                    <span className="font-semibold">{currency}{forecastPreview.projectedBalance.toLocaleString()}</span>
                  </div>
                </div>
              )}
               <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowModal(null)}
                  style={{ padding: '9px 18px', borderRadius: 9, cursor: 'pointer', background: '#FEFDFB', border: '1.4px solid #e4ddd1', color: '#5c6567', display: 'flex', alignItems: 'center', gap: 7, transition: 'all .15s ease', fontFamily: 'inherit', fontSize: 13, fontWeight: 600 }}
                  onMouseEnter={e => { e.currentTarget.style.background = '#eef7f6'; e.currentTarget.style.borderColor = '#a6d9d3'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = '#FEFDFB'; e.currentTarget.style.borderColor = '#e4ddd1'; }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  style={{ padding: '9px 18px', borderRadius: 9, cursor: 'pointer', border: '1.4px solid transparent', background: 'linear-gradient(155deg, #1f8577, #0f544c)', color: '#fff', display: 'flex', alignItems: 'center', gap: 6, boxShadow: '0 6px 16px -6px rgba(15,84,76,.55)', transition: 'all .15s ease', fontFamily: 'inherit', fontSize: 13, fontWeight: 600 }}
                  onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 8px 20px -6px rgba(15,84,76,.65)'; }}
                  onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 6px 16px -6px rgba(15,84,76,.55)'; }}
                >
                  Create Forecast
                </button>
              </div>
            </form>
          </div>
        </div>
        </div>
      )}
      {auditedAccount && (
        <div className="fixed inset-0 z-[100]">
          <AccountDetailsDashboard
            account={{
              ...auditedAccount,
              code: auditedAccount.accountNumber,
            }}
            onClose={() => setAuditedAccount(null)}
          />
        </div>
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

export default Banking;
