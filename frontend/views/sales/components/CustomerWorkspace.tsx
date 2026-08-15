import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { logger } from '@/services/logger';
import { useNavigate } from 'react-router-dom';
import {
  X, User, Mail, Phone, MapPin, CreditCard, FileText,
  Globe, Building, Truck, Plus, Trash2, Edit2,
  TrendingUp, AlertTriangle, Clock, CheckCircle,
  DollarSign, ArrowLeft, MoreHorizontal, Download,
  ExternalLink, Calendar, MessageSquare, History,
  PieChart, Settings, FileSearch, Paperclip,
  Briefcase, ShieldAlert, BadgeCheck, FileDown,
  ChevronDown, ChevronRight,
  RefreshCw,
  FileBarChart,
  Eye
} from 'lucide-react';
import { pdf } from '@react-pdf/renderer';
import { PrimeDocument } from '../../shared/components/PDF/PrimeDocument';
import { initializePrimePdfFonts } from '../../shared/components/PDF/templateSettings';
import { StatementDoc } from '../../shared/components/PDF/schemas';
import { Customer, Invoice, CustomerPayment, Sale, Quotation, AuditLogEntry } from '../../../types';
import { useSales } from '../../../context/SalesContext';
import { useFinance } from '../../../context/FinanceContext';
import { useAuth } from '../../../context/AuthContext';
import { useData, REFRESH_INTERVAL } from '../../../context/DataContext';
import { useModuleRefresh } from '../../../hooks/useModuleRefresh';
import { format, parseISO, isAfter } from 'date-fns';
import { attachDocumentSecurity } from '../../../utils/documentSecurity';
import { AuditTimeline } from '../../shared/components/AuditTimeline';
import AICustomerInsights from '../../../components/ai/AICustomerInsights';
import CRMSegmentation from '../../../components/CRM/CRMSegmentation';
import { currencyService } from '../../../services/currencyService';
import { referralService } from '../../../services/referralService';
import { referralTimelineService } from '../../../services/referralTimelineService';
import { referralAuditService } from '../../../services/referralAuditService';
import type { Referral, ReferralReward } from '../../../types/referral';
import type { ReferralTimelineEntry, ReferralAuditEntry } from '../../../types/referral-extended';
import { EngagementDashboard } from './EngagementDashboard';
import { EngagementTimeline } from './EngagementTimeline';

const teal = {
  50: '#eef7f6', 100: '#d3ece9', 200: '#a6d9d3', 300: '#72c0b7',
  400: '#3fa294', 500: '#1f8577', 600: '#146b60', 700: '#0f544c',
  800: '#0b3e39', 900: '#082e2a'
};
const amber = { 100: '#fbead0', 300: '#eec27a', 500: '#d99a3f', 600: '#b97e2b' };
const paper = '#FEFDFB';
const ink = '#23282A';
const inkSoft = '#5c6567';
const hairline = '#e4ddd1';
const danger = '#b5493f';

const labelStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 6,
  fontSize: 12.5, fontWeight: 600, color: '#3b454c',
  marginBottom: 7, letterSpacing: 0.01
};

const inputStyle: React.CSSProperties = {
  width: '100%', fontFamily: "'Inter', sans-serif", fontSize: 13.5,
  color: ink, background: '#fff',
  border: '1px solid #e2ded3', borderRadius: 10,
  padding: '10px 13px', outline: 'none',
  boxShadow: 'inset 0 1px 2px rgba(16,24,40,0.03)',
  transition: 'border-color .15s ease, box-shadow .15s ease, background .15s ease'
};

const textareaStyle: React.CSSProperties = {
  ...inputStyle, resize: 'none', minHeight: 72, lineHeight: 1.5
};

const selectStyle: React.CSSProperties = {
  ...inputStyle,
  appearance: 'none',
  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%235c6567'/%3E%3C/svg%3E")`,
  backgroundRepeat: 'no-repeat',
  backgroundPosition: 'right 12px center',
  paddingRight: 30,
  cursor: 'pointer'
};

const sectionLabelStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 10,
  margin: '30px 0 16px', paddingLeft: 12,
  borderLeft: `3px solid ${teal[500]}`
};

const btnGhostStyle: React.CSSProperties = {
  fontFamily: "'Inter', sans-serif", fontSize: 13, fontWeight: 600,
  padding: '9px 18px', borderRadius: 10, cursor: 'pointer',
  background: '#fff', border: `1px solid ${hairline}`, color: inkSoft,
  display: 'flex', alignItems: 'center', gap: 7, transition: 'all .15s ease'
};

const btnPrimaryStyle: React.CSSProperties = {
  fontFamily: "'Inter', sans-serif", fontSize: 13, fontWeight: 600,
  padding: '9px 18px', borderRadius: 10, cursor: 'pointer', border: '1px solid transparent',
  background: `linear-gradient(155deg, ${teal[500]}, ${teal[700]})`,
  color: '#fff', display: 'flex', alignItems: 'center', gap: 7,
  boxShadow: `0 8px 20px -8px rgba(15,84,76,.6)`,
  transition: 'all .15s ease'
};

interface CustomerWorkspaceProps {
  customer: Customer;
  onBack: () => void;
  onEdit: (customer: Customer) => void;
}

export const CustomerWorkspace: React.FC<CustomerWorkspaceProps> = ({ customer, onBack, onEdit }) => {
  const navigate = useNavigate();
  const { invoices, ledger, accounts, walletTransactions } = useFinance();
  const { refreshAllData } = useData();
  
  // 5-minute poll + focus refresh
  useModuleRefresh(refreshAllData, { interval: REFRESH_INTERVAL });
  const { customerPayments = [], sales, quotations, updateCustomer } = useSales();
  const { addAuditLog, companyConfig, auditLogs, notify } = useAuth();
  const currency = companyConfig?.currencySymbol || currencyService.getCurrency(currencyService.getBaseCurrency())?.symbol || '$';

  const [activeTab, setActiveTab] = useState<'Overview' | 'Timeline' | 'Invoices' | 'Payments' | 'Ledger' | 'Accounting' | 'Wallet' | 'Referrals' | 'Engagement' | 'Documents' | 'Segmentation' | 'Settings' | 'Security Audit'>('Overview');
  const [accountMenu, setAccountMenu] = useState<{ id: string, type: 'debit' | 'credit', x: number, y: number } | null>(null);
  const [viewingAccountId, setViewingAccountId] = useState<string | null>(null);
  const [referrals, setReferrals] = useState<Referral[]>([]);
  const [referralRewards, setReferralRewards] = useState<ReferralReward[]>([]);
  const [referralTimeline, setReferralTimeline] = useState<ReferralTimelineEntry[]>([]);
  const [referralAuditEntries, setReferralAuditEntries] = useState<ReferralAuditEntry[]>([]);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    const style = document.createElement('style');
    style.innerHTML = `
      .white-card {
        background: #FFFFFF;
        border: 1px solid rgba(16,24,40,0.07);
        border-radius: 14px;
        box-shadow: 0 1px 2px rgba(16,24,40,0.04), 0 12px 30px -16px rgba(16,24,40,0.18);
        transition: box-shadow .2s ease, transform .2s ease, border-color .2s ease;
      }
      .white-card:hover {
        box-shadow: 0 2px 4px rgba(16,24,40,0.05), 0 18px 40px -18px rgba(16,24,40,0.22);
      }
      .settings-section-header {
        padding: 20px 28px;
        border-bottom: 1px solid rgba(16,24,40,0.06);
        background: linear-gradient(180deg, #fbfaf7 0%, #ffffff 100%);
        border-top-left-radius: 14px;
        border-top-right-radius: 14px;
      }
      .customer-workspace input:not([type=checkbox]):not([type=radio]):not([type=range]),
      .customer-workspace textarea,
      .customer-workspace select {
        transition: border-color .15s ease, box-shadow .15s ease !important;
      }
      .customer-workspace input:not([type=checkbox]):not([type=radio]):not([type=range]):focus,
      .customer-workspace textarea:focus,
      .customer-workspace select:focus {
        outline: none;
        border-color: #1f8577 !important;
        box-shadow: 0 0 0 3px rgba(31,133,119,0.18) !important;
      }
      .toggle-input {
        position: absolute;
        width: 1px;
        height: 1px;
        padding: 0;
        margin: -1px;
        overflow: hidden;
        clip: rect(0, 0, 0, 0);
        white-space: nowrap;
        border-width: 0;
      }
      .toggle-track {
        width: 44px;
        height: 24px;
        background: #d3ece9;
        border-radius: 9999px;
        position: relative;
        transition: background 0.2s ease;
        cursor: pointer;
        flex-shrink: 0;
      }
      .toggle-track::after {
        content: '';
        position: absolute;
        top: 2px;
        left: 2px;
        width: 20px;
        height: 20px;
        background: #ffffff;
        border-radius: 50%;
        border: 1px solid #D4D7DC;
        transition: transform 0.2s ease;
        box-shadow: 0 1px 2px rgba(0,0,0,0.05);
      }
      .toggle-input:checked + .toggle-track {
        background: #1f8577;
      }
      .toggle-input:checked + .toggle-track::after {
        transform: translateX(20px);
      }
    `;
    document.head.appendChild(style);
    return () => { document.head.removeChild(style); };
  }, []);

  useEffect(() => {
    if (!customer?.id) return
    referralService.getReferralsByReferrer(customer.id).then(setReferrals).catch(() => {})
    referralService.getRewardsByCustomer(customer.id).then(setReferralRewards).catch(() => {})
    Promise.all([
      (async () => {
        const timeline = await referralTimelineService.getAllTimeline(50)
        setReferralTimeline(timeline.filter(t => {
          const ref = referrals.find(r => r.id === t.referralId)
          return ref?.referredById === customer.id
        }))
      })()
    ]).catch(() => {})
    referralAuditService.getAll(50).then(all => setReferralAuditEntries(all)).catch(() => {})
  }, [customer?.id])

  // Memoized transactions for viewingAccountId
  const accountTransactions = useMemo(() => {
    if (!viewingAccountId) return [];
    return (ledger || []).filter(entry =>
      (entry.debitAccountId === viewingAccountId || entry.creditAccountId === viewingAccountId) &&
      (entry.customerId === customer.id || entry.description?.includes(customer.name))
    ).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [viewingAccountId, ledger, customer]);

  // Ledger Filters
  const [ledgerStartDate, setLedgerStartDate] = useState<string>('');
  const [ledgerEndDate, setLedgerEndDate] = useState<string>('');
  const [ledgerTypeFilter, setLedgerTypeFilter] = useState<'All' | 'Invoice' | 'Payment'>('All');
  const [ledgerSubAccountFilter, setLedgerSubAccountFilter] = useState<string>('All');

  // UI State for placeholders
  const [isTransactionMenuOpen, setIsTransactionMenuOpen] = useState(false);
  const [isReminderSent, setIsReminderSent] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isStatementModalOpen, setIsStatementModalOpen] = useState(false);
  const [statementPdfUrl, setStatementPdfUrl] = useState<string | null>(null);

  // Filter data for this customer
  const customerInvoices = useMemo(() =>
    invoices.filter(inv => inv.customerId === customer.id || inv.customerName === customer.name),
    [invoices, customer]);

  const customerPaymentsList = useMemo(() =>
    customerPayments.filter(payment => payment.customerName === customer.name),
    [customerPayments, customer]);

  const customerSales = useMemo(() =>
    sales.filter(s => s.customerId === customer.id || s.customerName === customer.name),
    [sales, customer]);

  const customerQuotes = useMemo(() =>
    quotations.filter(q => q.customerName === customer.name),
    [quotations, customer]);

  const customerLogs = useMemo(() =>
    auditLogs.filter(log => log.entityId === customer.id || (log.details && log.details.includes(customer.name))),
    [auditLogs, customer]);

  const customerLedger = useMemo(() =>
    (ledger || []).filter(entry => entry.customerId === customer.id || entry.description?.includes(customer.name)),
    [ledger, customer]);

  const customerWalletTransactions = useMemo(() =>
    (walletTransactions || []).filter(tx => tx.customerId === customer.id),
    [walletTransactions, customer]);

  const menuGroups = [
    {
      title: 'Overview',
      items: [
        { id: 'Overview', icon: User, label: 'Overview', desc: 'KPI summary & client profile overview' },
      ]
    },
    {
      title: 'Financials',
      items: [
        { id: 'Invoices', icon: FileText, label: 'Invoices', desc: 'All invoices & outstanding balances' },
        { id: 'Payments', icon: DollarSign, label: 'Payments', desc: 'Payment history & transaction records' },
        { id: 'Ledger', icon: FileBarChart, label: 'Ledger', desc: 'Running balance & date-filtered entries' },
        { id: 'Accounting', icon: Briefcase, label: 'Accounting', desc: 'Double-entry GL postings & account views' },
        { id: 'Wallet', icon: CreditCard, label: 'Wallet', desc: 'Prepaid wallet deposits & deductions' },
      ]
    },
    {
      title: 'Growth',
      items: [
        { id: 'Referrals', icon: TrendingUp, label: 'Referrals', desc: 'Referral program & reward earnings' },
        { id: 'Engagement', icon: MessageSquare, label: 'Engagement', desc: 'Interaction metrics & activity timeline' },
      ]
    },
    {
      title: 'Documents',
      items: [
        { id: 'Documents', icon: Paperclip, label: 'Documents', desc: 'Uploaded files & generated reports' },
      ]
    },
    {
      title: 'Management',
      items: [
        { id: 'Segmentation', icon: PieChart, label: 'Segmentation', desc: 'CRM segment rules & classification' },
        { id: 'Settings', icon: Settings, label: 'Settings', desc: 'Billing terms, shipping & preferences' },
        { id: 'Security Audit', icon: ShieldAlert, label: 'Security Audit', desc: 'Immutable client modification trail' },
      ]
    }
  ];

  const filteredGroups = menuGroups.map(group => ({
    ...group,
    items: group.items.filter(item =>
      item.label.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.desc.toLowerCase().includes(searchTerm.toLowerCase())
    )
  })).filter(group => group.items.length > 0);

  const activeGroupTitle = menuGroups.find(g => g.items.some(i => i.id === activeTab))?.title || 'Customer Profile';
  const activeItemLabel = menuGroups.flatMap(g => g.items).find(i => i.id === activeTab)?.label || activeTab;

  // KPIs
  const kpis = useMemo(() => {
    const totalInvoiced = customerInvoices.reduce((sum, inv) => sum + inv.totalAmount, 0);
    const totalPaid = customerInvoices.reduce((sum, inv) => sum + (inv.paidAmount || 0), 0);
    const overdueBalance = customerInvoices
      .filter(inv => inv.status !== 'Paid' && inv.status !== 'Cancelled' && isAfter(new Date(), parseISO(inv.dueDate)))
      .reduce((sum, inv) => sum + (inv.totalAmount - (inv.paidAmount || 0)), 0);

    const ytdSales = customerInvoices
      .filter(inv => new Date(inv.date).getFullYear() === new Date().getFullYear())
      .reduce((sum, inv) => sum + inv.totalAmount, 0);

    const lastInvoice = customerInvoices.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];

    return {
      balance: customer.balance || 0,
      overdueBalance,
      creditLimit: customer.creditLimit || 0,
      outstandingBalance: customerInvoices
        .filter(inv => inv.status !== 'Paid' && inv.status !== 'Cancelled')
        .reduce((sum, inv) => sum + (inv.totalAmount - (inv.paidAmount || 0)), 0),
      ytdSales,
      lastInvoiceTotal: lastInvoice?.totalAmount || 0,
      lastInvoiceDate: lastInvoice?.date || null
    };
  }, [customer, customerInvoices]);

  const { openingBalance, ledgerEntries } = useMemo(() => {
    // Combine invoices and payments into a chronological ledger
    const allEntries = [
      ...customerInvoices.map(inv => ({
        date: inv.date,
        id: inv.id,
        memo: inv.memo || 'Invoice',
        totalAmount: inv.totalAmount,
        subAccountId: inv.subAccountId,
        type: 'Invoice'
      })),
      ...customerPaymentsList.map(payment => ({
        date: payment.date,
        id: payment.id,
        memo: payment.memo || 'Customer Payment',
        amount: payment.amount,
        subAccountId: payment.subAccountId,
        type: 'Payment'
      }))
    ]
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    // Calculate running balance for ALL entries first to get correct opening balance
    let balance = 0;
    const entriesWithBalance = allEntries.map(entry => {
      const debit = 'totalAmount' in entry ? entry.totalAmount : 0;
      const credit = 'amount' in entry ? entry.amount : 0;
      balance += (debit - credit);

      const accountName = entry.subAccountId ?
        customer.subAccounts?.find(s => s.id === entry.subAccountId)?.name : 'Main Account';

      return {
        ...entry,
        debit,
        credit,
        runningBalance: balance,
        accountName
      };
    });

    const startDate = ledgerStartDate ? parseISO(ledgerStartDate) : null;
    const endDate = ledgerEndDate ? parseISO(ledgerEndDate) : null;

    // Opening balance is the balance of the last entry before the start date
    const lastEntryBeforeStart = startDate
      ? entriesWithBalance.filter(e => parseISO(e.date) < startDate).pop()
      : null;
    const openingBal = lastEntryBeforeStart ? lastEntryBeforeStart.runningBalance : 0;

    const filtered = entriesWithBalance.filter(item => {
      const date = parseISO(item.date);
      const isAfterStart = !startDate || date >= startDate;
      const isBeforeEnd = !endDate || date <= endDate;

      const matchesType = ledgerTypeFilter === 'All' ||
        (ledgerTypeFilter === 'Invoice' && item.type === 'Invoice') ||
        (ledgerTypeFilter === 'Payment' && item.type === 'Payment');

      const matchesAccount = ledgerSubAccountFilter === 'All' ||
        (ledgerSubAccountFilter === 'Main' && !item.subAccountId) ||
        (item.subAccountId === ledgerSubAccountFilter);

      return isAfterStart && isBeforeEnd && matchesType && matchesAccount;
    });

    return { openingBalance: openingBal, ledgerEntries: filtered };
  }, [customerInvoices, customerPaymentsList, ledgerStartDate, ledgerEndDate, ledgerTypeFilter, ledgerSubAccountFilter, customer.subAccounts]);

  const handleExportLedger = () => {
    const headers = ['Date', 'Reference', 'Description', 'Account', 'Debit', 'Credit', 'Balance'];
    const rows = ledgerEntries.map(entry => {
      const labeledEntry = entry as typeof entry & { debit: number; credit: number; runningBalance: number; accountName: string };
      return [
        labeledEntry.date,
        labeledEntry.id,
        labeledEntry.memo,
        labeledEntry.subAccountId ? (customer.subAccounts?.find(s => s.id === labeledEntry.subAccountId)?.name || 'Sub-account') : 'Main Account',
        labeledEntry.debit || 0,
        labeledEntry.credit || 0,
        labeledEntry.runningBalance || 0
      ];
    });

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `Ledger_${customer.name}_${format(new Date(), 'yyyy-MM-dd')}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handlePreviewStatement = async () => {
    try {
      const statementData: StatementDoc = {
        date: new Date().toLocaleDateString('en-GB'),
        customerName: customer.name,
        startDate: ledgerStartDate || 'All Time',
        endDate: ledgerEndDate || 'Present',
        currency: currency,
        openingBalance,
        transactions: ledgerEntries.map(e => ({
          date: format(parseISO(e.date), 'dd/MM/yyyy'),
          reference: e.id,
          memo: e.memo || (e.type === 'Invoice' ? 'Invoice Payment' : 'Payment'),
          debit: e.debit || 0,
          credit: e.credit || 0,
          runningBalance: e.runningBalance
        })),
        totalInvoiced: ledgerEntries.reduce((sum, e) => sum + (e.debit || 0), 0),
        totalReceived: ledgerEntries.reduce((sum, e) => sum + (e.credit || 0), 0),
        finalBalance: ledgerEntries.length > 0 ? ledgerEntries[ledgerEntries.length - 1].runningBalance : openingBalance,
      };

      const securedStatementData = await attachDocumentSecurity(statementData, companyConfig?.companyName);
      await initializePrimePdfFonts();
      const blob = await pdf(<PrimeDocument type="ACCOUNT_STATEMENT" data={securedStatementData as StatementDoc} />).toBlob();
      const url = URL.createObjectURL(blob);
      setStatementPdfUrl(url);
      setIsStatementModalOpen(true);
    } catch (error) {
      logger.error("PDF generation failed:", error);
      alert("Failed to generate statement preview.");
    }
  };

  const toggleCreditHold = async () => {
    try {
      const newVal = !customer.creditHold;
      await updateCustomer({ ...customer, creditHold: newVal });
      await addAuditLog({ action: newVal ? 'HOLD' : 'RELEASE' as const, entityType: 'Customer' as const, entityId: customer.id, details: `Credit hold ${newVal ? 'placed' : 'released'} by user` });
      notify(`Credit ${newVal ? 'hold placed' : 'hold released'} for ${customer.name}`, 'success');
    } catch (err: any) {
      notify(`Failed to update credit hold: ${err?.message || err}`, 'error');
    }
  };

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden', fontFamily: "'Inter','DM Sans',sans-serif", fontSize: 13.5, color: ink }}>

      {/* Header */}
      <div style={{
        position: 'relative',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '15px 28px',
        borderBottom: '1px solid rgba(11,62,57,0.4)',
        background: 'linear-gradient(120deg, #0b3e39 0%, #146b60 52%, #1f8577 100%)',
        boxShadow: '0 6px 20px -10px rgba(11,62,57,0.6)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <button
            onClick={onBack}
            style={{ width: 42, height: 42, borderRadius: 12, background: 'linear-gradient(155deg, rgba(255,255,255,0.22), rgba(255,255,255,0.06))', border: '1px solid rgba(255,255,255,0.28)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', transition: 'all .15s ease', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.25)', flexShrink: 0 }}
            onMouseEnter={e => { e.currentTarget.style.background = 'linear-gradient(155deg, rgba(255,255,255,0.32), rgba(255,255,255,0.12))'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'linear-gradient(155deg, rgba(255,255,255,0.22), rgba(255,255,255,0.06))'; }}
          >
            <ArrowLeft size={18} />
          </button>
          <div style={{
            width: 42, height: 42, borderRadius: 12,
            background: 'linear-gradient(155deg, rgba(255,255,255,0.22), rgba(255,255,255,0.06))',
            border: '1px solid rgba(255,255,255,0.28)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.25)', flexShrink: 0
          }}>
            <User size={20} color="#fff" />
          </div>
          <div>
            <h1 style={{
              fontFamily: "'DM Serif Display', 'Georgia', serif", fontWeight: 400,
              fontSize: 19, margin: 0, color: '#ffffff', letterSpacing: 0.3
            }}>
              {customer.name}
            </h1>
            <p style={{ margin: '2px 0 0', fontSize: 11.5, color: 'rgba(255,255,255,0.78)', letterSpacing: 0.02 }}>
              {activeGroupTitle} &mdash; Customer ID: {customer.id}
            </p>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button
            onClick={() => onEdit(customer)}
            style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '9px 18px', borderRadius: 10, background: '#ffffff', color: '#0f544c', fontWeight: 600, fontSize: 13, cursor: 'pointer', transition: 'all .15s ease', border: 'none', boxShadow: '0 8px 18px -8px rgba(0,0,0,0.45)' }}
            onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 12px 24px -10px rgba(0,0,0,0.5)'; }}
            onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 8px 18px -8px rgba(0,0,0,0.45)'; }}
          >
            <Edit2 size={16} /> Edit Profile
          </button>
          <button
            onClick={toggleCreditHold}
            style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '9px 18px', borderRadius: 10, fontWeight: 600, fontSize: 13, cursor: 'pointer', transition: 'all .15s ease', border: 'none', ...(customer.creditHold ? { background: '#c0495f', color: '#fff' } : { background: 'rgba(255,255,255,0.12)', color: '#fff', border: '1px solid rgba(255,255,255,0.28)' }) }}
            onMouseEnter={e => { if (!customer.creditHold) { e.currentTarget.style.background = 'rgba(255,255,255,0.22)'; } }}
            onMouseLeave={e => { if (!customer.creditHold) { e.currentTarget.style.background = 'rgba(255,255,255,0.12)'; } }}
          >
            <ShieldAlert size={16} />
            {customer.creditHold ? 'Release Hold' : 'Place on Hold'}
          </button>
          <div style={{ position: 'relative' }}>
            <button
              onClick={() => setIsTransactionMenuOpen(!isTransactionMenuOpen)}
              style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '9px 18px', borderRadius: 10, background: '#ffffff', color: '#0f544c', fontWeight: 600, fontSize: 13, cursor: 'pointer', transition: 'all .15s ease', border: 'none', boxShadow: '0 8px 18px -8px rgba(0,0,0,0.45)' }}
              onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 12px 24px -10px rgba(0,0,0,0.5)'; }}
              onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 8px 18px -8px rgba(0,0,0,0.45)'; }}
            >
              <Plus size={16} />
              New Transaction
            </button>
            {isTransactionMenuOpen && (
              <div style={{ position: 'absolute', right: 0, top: '100%', marginTop: 4, width: 192, background: '#FEFDFB', borderRadius: 12, boxShadow: '0 20px 50px -12px rgba(0,0,0,.3), 0 0 0 1px rgba(0,0,0,.04)', padding: '6px 0', zIndex: 30 }}>
                <button
                  onClick={() => {
                    navigate('/sales-flow/invoices', {
                      state: {
                        action: 'create',
                        customer: customer.name,
                        customerId: customer.id
                      }
                    });
                    setIsTransactionMenuOpen(false);
                  }}
                  style={{ width: '100%', textAlign: 'left', padding: '9px 16px', fontSize: 13, fontWeight: 600, color: '#5c6567', border: 'none', background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}
                  onMouseEnter={e => e.currentTarget.style.background = '#eef7f6'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >
                  <FileText size={15} style={{ color: '#5c6567', flexShrink: 0 }} />
                  New Invoice
                </button>
                <button
                  onClick={() => {
                    navigate('/sales-flow/payments', {
                      state: {
                        action: 'create',
                        customer: customer.name,
                        customerId: customer.id
                      }
                    });
                    setIsTransactionMenuOpen(false);
                  }}
                  style={{ width: '100%', textAlign: 'left', padding: '9px 16px', fontSize: 13, fontWeight: 600, color: '#5c6567', border: 'none', background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}
                  onMouseEnter={e => e.currentTarget.style.background = '#eef7f6'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >
                  <DollarSign size={15} style={{ color: '#5c6567', flexShrink: 0 }} />
                  New Payment
                </button>
                <button
                  onClick={() => {
                    navigate('/sales-flow/quotations', {
                      state: {
                        action: 'create',
                        type: 'Quotation',
                        customer: customer.name,
                        customerId: customer.id
                      }
                    });
                    setIsTransactionMenuOpen(false);
                  }}
                  style={{ width: '100%', textAlign: 'left', padding: '9px 16px', fontSize: 13, fontWeight: 600, color: '#5c6567', border: 'none', background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}
                  onMouseEnter={e => e.currentTarget.style.background = '#eef7f6'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >
                  <FileSearch size={15} style={{ color: '#5c6567', flexShrink: 0 }} />
                  New Quotation
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* Premium Sidebar */}
        <div style={{
          width: 286, flexShrink: 0,
          background: '#FFFFFF',
          borderRight: '1px solid rgba(16,24,40,0.07)',
          display: 'flex', flexDirection: 'column', position: 'relative', overflowY: 'auto'
        }}>
          <div style={{
            color: '#8b938f', fontSize: 11, letterSpacing: '1px',
            textTransform: 'uppercase', fontWeight: 700, padding: '20px 18px 10px'
          }}>
            Customer Sections
          </div>
          <div style={{ padding: '0 12px 16px' }}>
            <div style={{ padding: '0 6px 12px' }}>
              <input
                type="text"
                placeholder="Search sections..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                style={{ width: '100%', padding: '8px 12px', background: '#F7F6F2', border: '1px solid rgba(16,24,40,0.07)', borderRadius: 8, fontSize: 12, color: '#23282A', outline: 'none', fontFamily: "'Inter','DM Sans',sans-serif" }}
              />
            </div>
            {filteredGroups.map(group => (
              <div key={group.title} style={{ marginBottom: 18 }}>
                <div style={{
                  color: '#9aa19c', fontSize: 10, letterSpacing: '0.9px',
                  textTransform: 'uppercase', fontWeight: 700, padding: '4px 6px 9px'
                }}>{group.title}</div>
                {group.items.map(item => {
                  const isActive = activeTab === item.id;
                  return (
                    <button
                      key={item.id}
                      onClick={() => setActiveTab(item.id)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 12,
                        padding: '11px 13px', borderRadius: 11, width: '100%',
                        background: isActive ? `linear-gradient(135deg, ${teal[500]}, ${teal[700]})` : '#FFFFFF',
                        border: isActive ? '1px solid transparent' : '1px solid rgba(16,24,40,0.06)',
                        boxShadow: isActive ? `0 10px 22px -10px rgba(15,84,76,0.55)` : '0 1px 2px rgba(16,24,40,0.04)',
                        cursor: 'pointer', marginBottom: 8,
                        transition: 'all .15s ease', position: 'relative',
                        textAlign: 'left',
                      }}
                      onMouseEnter={e => {
                        if (!isActive) { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 6px 16px -8px rgba(16,24,40,0.18)'; }
                      }}
                      onMouseLeave={e => {
                        if (!isActive) { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 1px 2px rgba(16,24,40,0.04)'; }
                      }}
                    >
                      <div style={{
                        width: 34, height: 34, borderRadius: 9,
                        background: isActive ? 'rgba(255,255,255,0.18)' : '#eef7f6',
                        color: isActive ? '#fff' : teal[600],
                        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
                      }}>
                        <item.icon size={16} />
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: isActive ? '#fff' : '#23282A' }}>{item.label}</div>
                        <div style={{ fontSize: 10, color: isActive ? 'rgba(255,255,255,0.82)' : '#5c6567', marginTop: 1, lineHeight: 1.3 }}>{item.desc}</div>
                      </div>
                      <div style={{
                        marginLeft: 'auto', padding: '4px 9px', borderRadius: 6,
                        background: isActive ? 'rgba(255,255,255,0.2)' : '#eef7f6',
                        color: isActive ? '#fff' : teal[600],
                        fontSize: 10, fontWeight: 600,
                        display: 'flex', alignItems: 'center', gap: 3, flexShrink: 0
                      }}>
                        Open
                        <ChevronRight size={10} />
                      </div>
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </div>

        {/* Content Area */}
        <div style={{ flex: 1, overflowY: 'auto', background: 'linear-gradient(180deg, #F7F6F2 0%, #F2F1EB 100%)' }}>
          <div style={{ maxWidth: '920px' }} className="p-4 md:p-6 lg:p-7">
          {activeTab === 'Overview' && (
            <div style={{ display: 'flex', gap: 24 }}>
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 24 }}>
                <div style={sectionLabelStyle}><span style={{fontSize: 13, fontWeight: 700, color: teal[800]}}>Financial Overview</span></div>
                <div style={{ display: 'grid', gap: 16 }} className="grid-cols-2 lg:grid-cols-4">
                  {[
                    { icon: DollarSign, label: 'Total Balance', value: kpis.balance, color: teal[500], accent: teal[500], sub: 'Good Standing' },
                    { icon: AlertTriangle, label: 'Overdue Balance', value: kpis.overdueBalance, color: danger, accent: danger, sub: `${customerInvoices.filter(i => i.status === 'Overdue').length} invoices` },
                    { icon: Clock, label: 'Outstanding', value: kpis.outstandingBalance || 0, color: amber[500], accent: amber[500], sub: 'Open invoices & unpaid' },
                    { icon: TrendingUp, label: 'YTD Purchases', value: kpis.ytdSales, color: teal[700], accent: teal[500], sub: `FY ${new Date().getFullYear()}` },
                  ].map((kpi, i) => {
                    const Icon = kpi.icon;
                    return (
                      <div key={i} className="white-card" style={{ padding: '14px 16px', display: 'flex', alignItems: 'flex-start', gap: 14 }}>
                        <div style={{ padding: 8, background: `${kpi.color}15`, borderRadius: 8, color: kpi.color, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <Icon size={20} />
                        </div>
                        <div style={{ minWidth: 0 }}>
                          <p style={{ margin: 0, fontSize: 10, fontWeight: 700, color: inkSoft, textTransform: 'uppercase', letterSpacing: 0.05, lineHeight: 1, marginBottom: 4 }}>{kpi.label}</p>
                          <p style={{ margin: 0, fontSize: 18, fontWeight: 700, color: ink, fontFamily: "'JetBrains Mono', monospace", fontVariantNumeric: 'tabular-nums' }}>{currency}{kpi.value.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                          <p style={{ margin: 0, fontSize: 10, fontWeight: 600, color: inkSoft, marginTop: 4 }}>{kpi.sub}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div style={sectionLabelStyle}><span style={{fontSize: 13, fontWeight: 700, color: teal[800]}}>Contact Information</span></div>
                <div className="white-card grid grid-cols-1 md:grid-cols-2" style={{ padding: '24px', gap: 24 }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                    {[
                      { icon: Mail, label: 'Email Address', value: customer.email || 'N/A' },
                      { icon: Phone, label: 'Phone Number', value: customer.phone || 'N/A' },
                      { icon: Globe, label: 'Website', value: customer.website || 'N/A' },
                    ].map((item, i) => {
                      const Icon = item.icon;
                      return (
                        <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                          <div style={{ padding: 8, background: teal[50], borderRadius: 8, color: inkSoft, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <Icon size={16} />
                          </div>
                          <div>
                            <p style={{ margin: 0, fontSize: 11, fontWeight: 700, color: inkSoft, textTransform: 'uppercase', letterSpacing: 0.03 }}>{item.label}</p>
                            <p style={{ margin: 0, fontWeight: 600, color: ink }}>{item.value}</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                    {[
                      { icon: MapPin, label: 'Billing Address', value: customer.billingAddress || customer.address || 'N/A' },
                      { icon: Briefcase, label: 'Account Manager', value: customer.assignedSalesperson || 'Unassigned' },
                    ].map((item, i) => {
                      const Icon = item.icon;
                      return (
                        <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                          <div style={{ padding: 8, background: teal[50], borderRadius: 8, color: inkSoft, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <Icon size={16} />
                          </div>
                          <div>
                            <p style={{ margin: 0, fontSize: 11, fontWeight: 700, color: inkSoft, textTransform: 'uppercase', letterSpacing: 0.03 }}>{item.label}</p>
                            <p style={{ margin: 0, fontWeight: 600, color: ink, whiteSpace: 'pre-line' }}>{item.value}</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div style={sectionLabelStyle}><span style={{fontSize: 13, fontWeight: 700, color: teal[800]}}>Client Notes</span></div>
                <div className="white-card" style={{ padding: '24px' }}>
                  <p style={{ margin: 0, color: inkSoft, lineHeight: 1.6, whiteSpace: 'pre-line' }}>
                    {customer.notes || 'No notes available for this client.'}
                  </p>
                </div>
              </div>

              <div style={{ width: 300, display: 'flex', flexDirection: 'column', gap: 24, flexShrink: 0 }}>
                <div style={sectionLabelStyle}><span style={{fontSize: 13, fontWeight: 700, color: teal[800]}}>Financial Health</span></div>
                <div className="white-card" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
                  {[
                    { label: 'Avg. Payment Days', value: `${customer.avgPaymentDays || 12} Days` },
                    { label: 'Profitability Score', value: `${customer.profitabilityScore || 85}%`, bar: customer.profitabilityScore || 85 },
                    { label: 'Risk Profile', value: 'Low Risk', badge: true },
                  ].map((item, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: 13, fontWeight: 500, color: inkSoft }}>{item.label}</span>
                      {'bar' in item ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div style={{ width: 80, background: teal[100], height: 6, borderRadius: 4, overflow: 'hidden' }}>
                            <div style={{ height: '100%', background: teal[500], borderRadius: 4, width: `${item.bar}%` }} />
                          </div>
                          <span style={{ fontWeight: 700, color: ink, fontFamily: "'JetBrains Mono', monospace" }}>{item.value}</span>
                        </div>
                      ) : 'badge' in item && item.badge ? (
                        <span style={{ padding: '2px 10px', background: teal[50], color: teal[700], borderRadius: 20, fontSize: 10, fontWeight: 700, border: `1px solid ${teal[100]}`, textTransform: 'uppercase' }}>{item.value}</span>
                      ) : (
                        <span style={{ fontWeight: 700, color: ink }}>{item.value}</span>
                      )}
                    </div>
                  ))}
                </div>

                <div style={sectionLabelStyle}><span style={{fontSize: 13, fontWeight: 700, color: teal[800]}}>Recent Activity</span></div>
                <div className="white-card" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {customerLogs.slice(0, 5).map(log => (
                    <div key={log.id} style={{ display: 'flex', gap: 10 }}>
                      <div style={{ marginTop: 4, width: 8, height: 8, borderRadius: '50%', background: teal[500], flexShrink: 0 }} />
                      <div>
                        <p style={{ margin: 0, fontSize: 12.5, fontWeight: 600, color: ink }}>{log.details}</p>
                        <p style={{ margin: 0, fontSize: 11, color: inkSoft }}>{format(parseISO(log.date), 'MMM dd, yyyy HH:mm')}</p>
                      </div>
                    </div>
                  ))}
                  {customerLogs.length === 0 && (
                    <p style={{ margin: 0, textAlign: 'center', padding: '12px 0', color: inkSoft, fontStyle: 'italic' }}>No recent activity logs.</p>
                  )}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'Timeline' && (
            <div className="white-card" style={{ padding: '24px', maxWidth: 960, margin: '0 auto' }}>
              <h3 style={{ margin: 0, fontWeight: 700, color: ink, fontSize: 18, marginBottom: 24 }}>Unified History Feed</h3>
              <div style={{ position: 'relative' }} className="space-y-8 before:absolute before:inset-0 before:ml-5 before:-translate-x-px before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-slate-200 before:to-transparent">
                {[...customerInvoices, ...customerPaymentsList, ...customerSales, ...customerQuotes]
                  .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                  .map((item: any, idx) => (
                    <div key={item.id + idx} className="relative flex items-center justify-between md:justify-start md:odd:flex-row-reverse group">
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 40, height: 40, borderRadius: '50%', border: '2px solid #fff', background: teal[100], color: teal[700], boxShadow: '0 2px 6px rgba(0,0,0,.08)', transition: 'all .15s ease', zIndex: 10, flexShrink: 0 }}
                        className="group-hover:bg-teal-600 group-hover:text-white">
                        {item.totalAmount !== undefined ? <FileText size={18} /> : <DollarSign size={18} />}
                      </div>
                      <div className="w-[calc(100%-4rem)] md:w-[calc(50%-2.5rem)] p-4 rounded-xl border border-slate-100 bg-white group-hover:border-teal-200 transition-all shadow-sm ml-6">
                        <div className="flex items-center justify-between mb-1">
                          <time style={{ fontWeight: 700, color: teal[600], fontSize: 11, textTransform: 'uppercase' }}>{format(parseISO(item.date), 'MMM dd, yyyy')}</time>
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${item.status === 'Paid' || item.status === 'Cleared' ? 'bg-emerald-50 text-emerald-700' :
                            item.status === 'Unpaid' || item.status === 'Overdue' ? 'bg-rose-50 text-rose-700' :
                              'bg-slate-100 text-slate-600'
                            }`}>
                            {item.status}
                          </span>
                        </div>
                        <div className="text-slate-900 font-bold mb-1">
                          {item.totalAmount !== undefined
                            ? (item.source === 'POS' || item.id?.startsWith('POS-') || item.cashierId
                              ? <span className="flex items-center gap-2">POS Sale #{item.id}<span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-purple-100 text-purple-700 border border-purple-200">POS</span></span>
                              : `Invoice #${item.id}`)
                            : `Payment Received #${item.id}`}
                        </div>
                        <div className="text-slate-500 text-[12px] font-medium">
                          {item.totalAmount !== undefined ?
                            `Invoiced amount: ${currency}${item.totalAmount.toLocaleString()}` :
                            `Received amount: ${currency}${item.amount.toLocaleString()}`}
                        </div>
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          )}

          {activeTab === 'Invoices' && (
            <div className="white-card" style={{ overflow: 'hidden' }}>
              <div className="settings-section-header">
                <h3 style={{ margin: 0, fontWeight: 700, color: ink, fontSize: 14 }}>Customer Invoices</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr style={{ background: teal[50], borderBottom: `1px solid ${hairline}` }}>
                      <th className="px-6 py-3 font-bold text-slate-500 uppercase text-[11px] tracking-wider">Date</th>
                      <th className="px-6 py-3 font-bold text-slate-500 uppercase text-[11px] tracking-wider">Invoice #</th>
                      <th className="px-6 py-3 font-bold text-slate-500 uppercase text-[11px] tracking-wider">Status</th>
                      <th className="px-6 py-3 font-bold text-slate-500 uppercase text-[11px] tracking-wider text-right">Total</th>
                      <th className="px-6 py-3 font-bold text-slate-500 uppercase text-[11px] tracking-wider text-right">Balance</th>
                      <th className="px-6 py-3 font-bold text-slate-500 uppercase text-[11px] tracking-wider text-center">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {customerInvoices.map(inv => (
                      <tr key={inv.id} className="hover:bg-slate-50/50 transition-colors">
                        <td className="px-6 py-4 font-medium text-slate-700">{format(parseISO(inv.date), 'MMM dd, yyyy')}</td>
                        <td className="px-6 py-4 font-bold text-slate-900">{inv.id}</td>
                        <td className="px-6 py-4">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${inv.status === 'Paid' ? 'bg-emerald-50 text-emerald-700' :
                            inv.status === 'Overdue' ? 'bg-rose-50 text-rose-700' :
                              'bg-amber-50 text-amber-700'
                            }`}>
                            {inv.status}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-right font-bold text-slate-900 finance-nums">
                          {currency}{inv.totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </td>
                        <td className="px-6 py-4 text-right font-bold text-rose-600 finance-nums">
                          {currency}{(inv.totalAmount - (inv.paidAmount || 0)).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center justify-center gap-2">
                            <button className="p-1.5 text-slate-400 hover:text-teal-600 hover:bg-teal-50 rounded-lg transition-all">
                              <Download size={16} />
                            </button>
                            <button className="p-1.5 text-slate-400 hover:text-teal-600 hover:bg-teal-50 rounded-lg transition-all">
                              <ExternalLink size={16} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeTab === 'Payments' && (
            <div className="white-card" style={{ overflow: 'hidden' }}>
              <div className="settings-section-header">
                <h3 style={{ margin: 0, fontWeight: 700, color: ink, fontSize: 14 }}>Payment History</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr style={{ background: teal[50], borderBottom: `1px solid ${hairline}` }}>
                      <th className="px-6 py-3 font-bold text-slate-500 uppercase text-[11px] tracking-wider">Date</th>
                      <th className="px-6 py-3 font-bold text-slate-500 uppercase text-[11px] tracking-wider">Payment #</th>
                      <th className="px-6 py-3 font-bold text-slate-500 uppercase text-[11px] tracking-wider">Method</th>
                      <th className="px-6 py-3 font-bold text-slate-500 uppercase text-[11px] tracking-wider">Reference</th>
                      <th className="px-6 py-3 font-bold text-slate-500 uppercase text-[11px] tracking-wider text-right">Amount</th>
                      <th className="px-6 py-3 font-bold text-slate-500 uppercase text-[11px] tracking-wider text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {customerPaymentsList.map(p => (
                      <tr key={p.id} className="hover:bg-slate-50/50 transition-colors">
                        <td className="px-6 py-4 font-medium text-slate-700">{format(parseISO(p.date), 'MMM dd, yyyy')}</td>
                        <td className="px-6 py-4 font-bold text-slate-900">{p.id}</td>
                        <td className="px-6 py-4 font-semibold text-slate-600">{p.paymentMethod}</td>
                        <td className="px-6 py-4 font-medium text-slate-500">{p.reference || 'N/A'}</td>
                        <td className="px-6 py-4 text-right font-bold text-emerald-600 finance-nums">
                          {currency}{p.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </td>
                        <td className="px-6 py-4 text-center">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${p.status === 'Cleared' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
                            }`}>
                            {p.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeTab === 'Segmentation' && (
            <CRMSegmentation />
          )}
          {activeTab === 'Settings' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div style={sectionLabelStyle}><span style={{fontSize: 13, fontWeight: 700, color: teal[800]}}>Billing Settings</span></div>
              <div className="white-card" style={{ padding: '24px', overflow: 'hidden' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <div className="flex items-center justify-between py-2 border-b border-slate-50">
                    <span className="text-slate-600 font-medium">Payment Terms</span>
                    <span className="font-bold text-slate-900">{customer.paymentTerms || 'Net 30'}</span>
                  </div>
                  <div className="flex items-center justify-between py-2 border-b border-slate-50">
                    <span className="text-slate-600 font-medium">Default Currency</span>
                    <span className="font-bold text-slate-900">{customer.currency || 'USD'}</span>
                  </div>
                </div>
              </div>

              <div style={sectionLabelStyle}><span style={{fontSize: 13, fontWeight: 700, color: teal[800]}}>Shipping & Logistics</span></div>
              <div className="white-card" style={{ padding: '24px', overflow: 'hidden' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <div className="flex items-start gap-3">
                    <div className="p-2 bg-slate-50 rounded-lg text-slate-400">
                      <MapPin size={16} />
                    </div>
                    <div>
                      <p className="text-[11px] font-bold text-slate-400 uppercase tracking-tight">Shipping Address</p>
                      <p className="font-semibold text-slate-700 whitespace-pre-line">{customer.shippingAddress || customer.address || 'Same as billing'}</p>
                    </div>
                  </div>
                  <div className="flex items-center justify-between py-2 border-b border-slate-50">
                    <span className="text-slate-600 font-medium">Auto-Send Statements</span>
                    <span className="font-bold text-slate-900">Enabled (Monthly)</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'Security Audit' && (
            <>
              <div style={sectionLabelStyle}><span style={{fontSize: 13, fontWeight: 700, color: teal[800]}}>Security Audit Trail</span></div>
              <div className="white-card" style={{ padding: '24px', overflow: 'hidden', display: 'flex', flexDirection: 'column', height: 600 }}>
                <AuditTimeline 
                  logs={customerLogs} 
                  title={`Security Audit: ${customer.name}`}
                  subtitle="Immutable trail of all modifications to this client profile."
                />
              </div>
            </>
          )}

          {activeTab === 'Documents' && (
            <div className="space-y-6">
              <div style={sectionLabelStyle}><span style={{fontSize: 13, fontWeight: 700, color: teal[800]}}>Uploaded Documents</span></div>
              <div className="white-card" style={{ padding: '32px 24px', textAlign: 'center' }}>
                <div style={{ width: 64, height: 64, background: teal[50], color: inkSoft, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
                  <Paperclip size={32} />
                </div>
                <h3 style={{ margin: 0, fontWeight: 700, color: ink, fontSize: 18, marginBottom: 8 }}>No Documents Uploaded</h3>
                <p style={{ margin: 0, color: inkSoft, marginBottom: 24, maxWidth: 320, marginLeft: 'auto', marginRight: 'auto' }}>Upload contracts, purchase orders, or ID documents for this customer.</p>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
                  <button
                    onClick={() => {
                      setIsUploading(true);
                      setTimeout(() => {
                        setIsUploading(false);
                        alert('Document uploaded successfully!');
                      }, 2000);
                    }}
                    disabled={isUploading}
                    style={{ padding: '10px 20px', background: `linear-gradient(135deg, ${teal[500]}, ${teal[700]})`, color: '#fff', borderRadius: 9, fontWeight: 700, border: 'none', cursor: 'pointer', transition: 'all .15s ease', boxShadow: `0 4px 12px -4px ${teal[400]}`, opacity: isUploading ? 0.5 : 1 }}
                  >
                    {isUploading ? 'Uploading...' : 'Upload Document'}
                  </button>
                  <button
                    onClick={() => {
                      const url = prompt('Enter folder URL (Google Drive, Dropbox, etc.):');
                      if (url) alert(`Folder linked: ${url}`);
                    }}
                    style={{ padding: '10px 20px', background: paper, border: `1.4px solid ${hairline}`, color: inkSoft, borderRadius: 9, fontWeight: 700, cursor: 'pointer', transition: 'all .15s ease' }}
                    onMouseEnter={e => { e.currentTarget.style.background = teal[50]; e.currentTarget.style.color = teal[700]; e.currentTarget.style.borderColor = teal[200]; }}
                    onMouseLeave={e => { e.currentTarget.style.background = paper; e.currentTarget.style.color = inkSoft; e.currentTarget.style.borderColor = hairline; }}
                  >
                    Link Shared Folder
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div style={sectionLabelStyle}><span style={{fontSize: 13, fontWeight: 700, color: teal[800]}}>Generated Reports</span></div>
                <div className="white-card" style={{ padding: '24px' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                    <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg border border-slate-100 group hover:border-teal-200 transition-all">
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-white rounded shadow-sm" style={{ color: teal[600] }}>
                          <FileText size={16} />
                        </div>
                        <div>
                          <p className="font-bold text-slate-900">Account Statement Template</p>
                          <p className="text-[11px] text-slate-500 font-medium">Standard financial summary format</p>
                        </div>
                      </div>
                      <button
                        onClick={handlePreviewStatement}
                        className="px-3 py-1.5 bg-blue-600 text-white rounded-lg font-bold text-[11px] opacity-0 group-hover:opacity-100 transition-all"
                      >
                        Generate
                      </button>
                    </div>
                    <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg border border-slate-100 group hover:border-blue-200 transition-all">
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-white rounded shadow-sm text-emerald-600">
                          <TrendingUp size={16} />
                        </div>
                        <div>
                          <p className="font-bold text-slate-900">Sales Performance Report</p>
                          <p className="text-[11px] text-slate-500 font-medium">Customer purchase history & trends</p>
                        </div>
                      </div>
                      <button
                        onClick={() => alert('Generating Sales Report...')}
                        className="px-3 py-1.5 bg-emerald-600 text-white rounded-lg font-bold text-[11px] opacity-0 group-hover:opacity-100 transition-all"
                      >
                        Generate
                      </button>
                    </div>
                  </div>
                </div>

                <div style={sectionLabelStyle}><span style={{fontSize: 13, fontWeight: 700, color: teal[800]}}>Document Settings</span></div>
                <div className="white-card" style={{ padding: '24px' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                    <label className="flex items-center justify-between p-2 hover:bg-teal-50 rounded transition-colors cursor-pointer">
                      <span className="font-medium text-slate-700">Auto-attach Invoices to Statement</span>
                      <input type="checkbox" name="autoAttachInvoices" className="rounded border-slate-300 focus:ring-teal-500" style={{ accentColor: teal[600] }} defaultChecked />
                    </label>
                    <label className="flex items-center justify-between p-2 hover:bg-teal-50 rounded transition-colors cursor-pointer">
                      <span className="font-medium text-slate-700">Email Monthly Statement</span>
                      <input type="checkbox" name="emailMonthlyStatement" className="rounded border-slate-300 focus:ring-teal-500" style={{ accentColor: teal[600] }} />
                    </label>
                    <label className="flex items-center justify-between p-2 hover:bg-teal-50 rounded transition-colors cursor-pointer">
                      <span className="font-medium text-slate-700">Include Sub-accounts in Ledger</span>
                      <input type="checkbox" name="includeSubAccounts" className="rounded border-slate-300 focus:ring-teal-500" style={{ accentColor: teal[600] }} defaultChecked />
                    </label>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'Ledger' && (
            <div className="space-y-4">
              <div style={sectionLabelStyle}><span style={{fontSize: 13, fontWeight: 700, color: teal[800]}}>Transaction Ledger</span></div>
              <div className="white-card" style={{ overflow: 'hidden' }}>
                <div className="settings-section-header" style={{ display: 'flex', flexDirection: 'column', gap: 16 }} >
                  <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#fff', border: `1px solid ${hairline}`, borderRadius: 8, padding: '4px 8px' }}>
                      <Calendar size={14} style={{ color: inkSoft }} />
                      <input
                        type="date"
                        name="ledgerStartDate"
                        value={ledgerStartDate}
                        onChange={(e) => setLedgerStartDate(e.target.value)}
                        style={{ fontSize: 11, fontWeight: 600, color: ink, outline: 'none', border: 'none', background: 'transparent', fontFamily: "'Inter', sans-serif" }}
                      />
                      <span style={{ color: hairline }}>-</span>
                      <input
                        type="date"
                        name="ledgerEndDate"
                        value={ledgerEndDate}
                        onChange={(e) => setLedgerEndDate(e.target.value)}
                        style={{ fontSize: 11, fontWeight: 600, color: ink, outline: 'none', border: 'none', background: 'transparent', fontFamily: "'Inter', sans-serif" }}
                      />
                    </div>

                    <select
                      name="ledgerTypeFilter"
                      value={ledgerTypeFilter}
                      onChange={(e) => setLedgerTypeFilter(e.target.value as 'All' | 'Invoice' | 'Payment')}
                      style={{ padding: '4px 10px', background: '#fff', border: `1px solid ${hairline}`, borderRadius: 8, fontSize: 11, fontWeight: 700, color: ink, outline: 'none', cursor: 'pointer' }}
                    >
                      <option value="All">All Types</option>
                      <option value="Invoice">Invoices</option>
                      <option value="Payment">Payments</option>
                    </select>

                    {customer.subAccounts && customer.subAccounts.length > 0 && (
                      <select
                        name="ledgerSubAccountFilter"
                        value={ledgerSubAccountFilter}
                        onChange={(e) => setLedgerSubAccountFilter(e.target.value)}
                        style={{ padding: '4px 10px', background: '#fff', border: `1px solid ${hairline}`, borderRadius: 8, fontSize: 11, fontWeight: 700, color: ink, outline: 'none', cursor: 'pointer' }}
                      >
                        <option value="All">All Accounts</option>
                        <option value="Main">Main Account</option>
                        {customer.subAccounts.map(sub => (
                          <option key={sub.id} value={sub.id}>{sub.name}</option>
                        ))}
                      </select>
                    )}

                    <div style={{ width: 1, height: 24, background: hairline, margin: '0 4px' }} className="hidden md:block" />

                    <button
                      onClick={handleExportLedger}
                      className="flex items-center gap-2 px-3 py-1 bg-white border border-slate-200 rounded-lg text-slate-600 font-bold hover:bg-slate-50 transition-all text-[11px]"
                      title="Export to CSV"
                    >
                      <Download size={14} />
                      Export
                    </button>

                    <button
                      onClick={handlePreviewStatement}
                      style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 12px', background: '#fff', border: `1.4px solid ${hairline}`, borderRadius: 8, color: teal[600], fontWeight: 700, cursor: 'pointer', transition: 'all .15s ease', fontSize: 11 }}
                      onMouseEnter={e => { e.currentTarget.style.background = teal[50]; e.currentTarget.style.borderColor = teal[200]; }}
                      onMouseLeave={e => { e.currentTarget.style.background = '#fff'; e.currentTarget.style.borderColor = hairline; }}
                      title="Download PDF Statement"
                    >
                      <FileDown size={14} />
                      PDF Statement
                    </button>
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr style={{ background: teal[50], borderBottom: `1px solid ${hairline}` }}>
                        <th className="px-6 py-3 font-bold text-slate-500 uppercase text-[11px] tracking-wider">Date</th>
                        <th className="px-6 py-3 font-bold text-slate-500 uppercase text-[11px] tracking-wider">Type</th>
                        <th className="px-6 py-3 font-bold text-slate-500 uppercase text-[11px] tracking-wider">Account</th>
                        <th className="px-6 py-3 font-bold text-slate-500 uppercase text-[11px] tracking-wider">Ref #</th>
                        <th className="px-6 py-3 font-bold text-slate-500 uppercase text-[11px] tracking-wider text-right">Debit</th>
                        <th className="px-6 py-3 font-bold text-slate-500 uppercase text-[11px] tracking-wider text-right">Credit</th>
                        <th className="px-6 py-3 font-bold text-slate-500 uppercase text-[11px] tracking-wider text-right">Balance</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      <tr style={{ background: teal[50] }}>
                        <td colSpan={6} className="px-6 py-3 font-bold text-slate-500">Opening Balance</td>
                        <td className="px-6 py-3 text-right font-bold text-slate-900 finance-nums">{currency}0.00</td>
                      </tr>
                      {ledgerEntries.map((row, idx) => (
                        <tr key={idx} className="hover:bg-slate-50/50 transition-colors">
                          <td className="px-6 py-4 font-medium text-slate-700">{format(parseISO(row.date), 'MMM dd, yyyy')}</td>
                          <td className="px-6 py-4 font-semibold text-slate-600">{row.type}</td>
                          <td className="px-6 py-4 font-medium text-slate-500 text-[11px]">{row.accountName}</td>
                          <td className="px-6 py-4 font-bold text-slate-900">{row.id}</td>
                          <td className="px-6 py-4 text-right text-rose-600 finance-nums">{row.debit > 0 ? `${currency}${row.debit.toLocaleString()}` : '-'}</td>
                          <td className="px-6 py-4 text-right text-emerald-600 finance-nums">{row.credit > 0 ? `${currency}${row.credit.toLocaleString()}` : '-'}</td>
                          <td className="px-6 py-4 text-right font-bold text-slate-900 finance-nums">{currency}{row.runningBalance.toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'Accounting' && (
            <div className="space-y-4 animate-in fade-in duration-300">
              {/* Account Actions Menu (Floating) */}
              {accountMenu && (
                <div
                  style={{ position: 'fixed', zIndex: 200, background: '#FEFDFB', borderRadius: 12, boxShadow: '0 20px 50px -12px rgba(0,0,0,.3), 0 0 0 1px rgba(0,0,0,.04)', top: accountMenu.y + 8, left: accountMenu.x, padding: '6px 0', width: 224 }}
                  onMouseLeave={() => setAccountMenu(null)}
                >
                  <div style={{ padding: '8px 16px', borderBottom: `1px solid ${hairline}`, marginBottom: 4 }}>
                    <p style={{ margin: 0, fontSize: 10, fontWeight: 800, color: inkSoft, textTransform: 'uppercase', letterSpacing: 0.1 }}>Account Actions</p>
                    <p className="text-[11px] font-bold text-slate-900 truncate">
                      {accounts.find(a => a.id === accountMenu.id || a.code === accountMenu.id)?.name || accountMenu.id}
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      setViewingAccountId(accountMenu.id);
                      setAccountMenu(null);
                    }}
                    className="w-full text-left px-4 py-2 text-[12px] font-semibold text-slate-700 hover:bg-slate-50 flex items-center gap-2"
                  >
                    <Eye size={14} className="text-blue-500" />
                    View Account Activity
                  </button>
                  <button
                    onClick={() => {
                      notify('Full Account Details feature is under development', 'info');
                      setAccountMenu(null);
                    }}
                    className="w-full text-left px-4 py-2 text-[12px] font-semibold text-slate-700 hover:bg-slate-50 flex items-center gap-2"
                  >
                    <CreditCard size={14} className="text-slate-400" />
                    Account Details & Settings
                  </button>
                  <button
                    onClick={() => {
                      navigate('/accounts/chart-of-accounts', { state: { accountId: accountMenu.id } });
                      setAccountMenu(null);
                    }}
                    className="w-full text-left px-4 py-2 text-[12px] font-semibold text-slate-700 hover:bg-slate-50 flex items-center gap-2"
                  >
                    <ExternalLink size={14} className="text-slate-400" />
                    Go to Chart of Accounts
                  </button>
                  <button
                    onClick={() => {
                      navigate('/sales-flow/payments', {
                        state: {
                          action: 'create',
                          customer: customer.name,
                          customerId: customer.id,
                          subAccount: accounts.find(a => a.id === accountMenu.id || a.code === accountMenu.id)?.name || 'Main',
                          preferredAccount: accountMenu.id
                        }
                      });
                      setAccountMenu(null);
                    }}
                    className="w-full text-left px-4 py-2 text-[12px] font-semibold text-slate-700 hover:bg-slate-50 flex items-center gap-2"
                  >
                    <DollarSign size={14} className="text-emerald-500" />
                    Record Customer Payment
                  </button>
                  <button
                    onClick={() => {
                      notify('Internal Transfer feature is under development', 'info');
                      setAccountMenu(null);
                    }}
                    className="w-full text-left px-4 py-2 text-[12px] font-semibold text-slate-700 hover:bg-slate-50 flex items-center gap-2"
                  >
                    <RefreshCw size={14} className="text-blue-500" />
                    Internal Transfer
                  </button>
                </div>
              )}
              <div style={sectionLabelStyle}><span style={{fontSize: 13, fontWeight: 700, color: teal[800]}}>General Ledger Postings</span></div>
              <div className="white-card" style={{ overflow: 'hidden' }}>
                <div className="settings-section-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <h3 style={{ margin: 0, fontWeight: 700, color: ink, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <History size={18} style={{ color: teal[600] }} />
                    General Ledger Postings
                  </h3>
                  <span style={{ fontSize: 10, fontWeight: 800, background: teal[100], color: teal[700], padding: '3px 10px', borderRadius: 20, textTransform: 'uppercase', letterSpacing: 0.1 }}>Double Entry View</span>
                </div>
              <div style={{ background: paper, borderRadius: 12, border: `1px solid ${hairline}`, overflow: 'hidden' }}>
                <div style={{ padding: '14px 20px', borderBottom: `1px solid ${hairline}`, background: teal[50], display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <h3 style={{ margin: 0, fontWeight: 700, color: ink, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <History size={18} style={{ color: teal[600] }} />
                    General Ledger Postings
                  </h3>
                  <span style={{ fontSize: 10, fontWeight: 800, background: teal[100], color: teal[700], padding: '3px 10px', borderRadius: 20, textTransform: 'uppercase', letterSpacing: 0.1 }}>Double Entry View</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-100">
                        <th className="px-6 py-3 font-bold text-slate-500 uppercase text-[10px] tracking-widest">Date</th>
                        <th className="px-6 py-3 font-bold text-slate-500 uppercase text-[10px] tracking-widest">Description</th>
                        <th className="px-6 py-3 font-bold text-slate-500 uppercase text-[10px] tracking-widest">Debit Account</th>
                        <th className="px-6 py-3 font-bold text-slate-500 uppercase text-[10px] tracking-widest">Credit Account</th>
                        <th className="px-6 py-3 font-bold text-slate-500 uppercase text-[10px] tracking-widest text-right">Amount</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {customerLedger.map((entry, idx) => (
                        <tr key={idx} className="hover:bg-slate-50/50 transition-colors group">
                          <td className="px-6 py-4 text-slate-500 font-medium whitespace-nowrap">{format(parseISO(entry.date), 'MMM dd, yyyy')}</td>
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-2">
                              <div className="font-bold text-slate-900 group-hover:text-blue-600 transition-colors">{entry.description}</div>
                              {entry.referenceId && (
                                <button
                                  onClick={() => {
                                    const isPayment = entry.referenceId?.startsWith('RCP') || entry.referenceId?.startsWith('PAY');
                                    const isInvoice = entry.referenceId?.startsWith('INV');
                                    if (isPayment) navigate('/sales-flow/payments', { state: { paymentId: entry.referenceId } });
                                    else if (isInvoice) navigate('/sales-flow/invoices', { state: { invoiceId: entry.referenceId } });
                                  }}
                                  className="p-1 hover:bg-blue-50 text-blue-400 hover:text-blue-600 rounded transition-colors"
                                  title="View Source Transaction"
                                >
                                  <ExternalLink size={10} />
                                </button>
                              )}
                            </div>
                            <div className="text-[10px] text-slate-400 font-medium">Ref: {entry.referenceId || 'N/A'}</div>
                          </td>
                          <td className="px-6 py-4">
                            <div className="relative">
                              <button
                                onClick={(e) => {
                                  const rect = e.currentTarget.getBoundingClientRect();
                                  setAccountMenu({ id: entry.debitAccountId, type: 'debit', x: rect.left, y: rect.bottom });
                                }}
                                className="text-[11px] font-black text-blue-700 bg-blue-50 px-2 py-1 rounded-lg inline-flex items-center gap-1 hover:bg-blue-100 transition-colors"
                              >
                                {accounts.find(a => a.id === entry.debitAccountId || a.code === entry.debitAccountId)?.name || entry.debitAccountId}
                                <ChevronDown size={10} className="opacity-40" />
                              </button>
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <div className="relative">
                              <button
                                onClick={(e) => {
                                  const rect = e.currentTarget.getBoundingClientRect();
                                  setAccountMenu({ id: entry.creditAccountId, type: 'credit', x: rect.left, y: rect.bottom });
                                }}
                                className="text-[11px] font-black text-rose-700 bg-rose-50 px-2 py-1 rounded-lg inline-flex items-center gap-1 hover:bg-rose-100 transition-colors"
                              >
                                {accounts.find(a => a.id === entry.creditAccountId || a.code === entry.creditAccountId)?.name || entry.creditAccountId}
                                <ChevronDown size={10} className="opacity-40" />
                              </button>
                            </div>
                          </td>
                          <td className="px-6 py-4 text-right font-black text-slate-900 finance-nums">{currency}{entry.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                        </tr>
                      ))}
                      {customerLedger.length === 0 && (
                        <tr>
                          <td colSpan={5} className="px-6 py-12 text-center text-slate-400 italic">No general ledger entries found for this customer.</td>
                        </tr>
                      )}
                    </tbody>
</table>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'Referrals' && (
            <div className="space-y-6 animate-in fade-in duration-300" style={{ padding: 24 }}>
              {/* Timeline Section */}
              {referralTimeline.length > 0 && (
                <div style={{ background: paper, borderRadius: 12, border: `1px solid ${hairline}`, overflow: 'hidden' }}>
                  <div style={{ padding: '14px 20px', borderBottom: `1px solid ${hairline}`, background: teal[50], display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <h3 style={{ margin: 0, fontWeight: 700, color: ink, display: 'flex', alignItems: 'center', gap: 8 }}>
                      <History size={18} style={{ color: amber[500] }} />
                      Referral Timeline
                    </h3>
                  </div>
                  <div className="p-6 max-h-60 overflow-y-auto custom-scrollbar">
                    <div className="relative pl-8 space-y-4">
                      <div className="absolute left-3 top-0 bottom-0 w-0.5 bg-slate-100"></div>
                      {referralTimeline.slice(0, 20).map((entry) => (
                        <div key={entry.id} className="relative">
                          <div className="absolute -left-6 top-1 w-3 h-3 rounded-full border-2 border-amber-500 bg-white"></div>
                          <p className="font-bold text-slate-900 text-sm">{entry.title}</p>
                          {entry.description && <p className="text-[11px] text-slate-500">{entry.description}</p>}
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-[10px] text-slate-400">{new Date(entry.timestamp).toLocaleString()}</span>
                            {entry.amount !== undefined && <span className="text-[10px] font-bold text-emerald-600">{currency}{entry.amount.toLocaleString()}</span>}
                            {entry.actorName && <span className="text-[10px] text-slate-400">by {entry.actorName}</span>}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
                {[
                  { icon: TrendingUp, label: 'Referrals Made', value: referrals.length, sub: 'Total referrals', color: amber[500], accent: amber[500] },
                  { icon: DollarSign, label: 'Rewards Earned', value: referralRewards.filter(r => r.status === 'paid' || r.status === 'approved').reduce((sum, r) => sum + r.amount, 0), sub: 'Total rewards paid', color: teal[500], accent: teal[500], isCurrency: true },
                  { icon: Clock, label: 'Pending', value: referralRewards.filter(r => r.status === 'pending').length, sub: 'Awaiting approval', color: amber[500], accent: amber[500] },
                ].map((kpi, i) => {
                  const Icon = kpi.icon;
                  return (
                    <div key={i} style={{ background: paper, padding: '14px 16px', borderRadius: 12, border: `1px solid ${hairline}`, borderLeft: `4px solid ${kpi.accent}`, display: 'flex', alignItems: 'flex-start', gap: 14 }}>
                      <div style={{ padding: 8, background: `${kpi.color}15`, borderRadius: 8, color: kpi.color, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Icon size={20} />
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <p style={{ margin: 0, fontSize: 10, fontWeight: 700, color: inkSoft, textTransform: 'uppercase', letterSpacing: 0.05, lineHeight: 1, marginBottom: 4 }}>{kpi.label}</p>
                        <p style={{ margin: 0, fontSize: 18, fontWeight: 700, color: ink, fontFamily: "'JetBrains Mono', monospace", fontVariantNumeric: 'tabular-nums' }}>{kpi.isCurrency ? currency : ''}{typeof kpi.value === 'number' ? kpi.value.toLocaleString(undefined, { minimumFractionDigits: kpi.isCurrency ? 2 : 0 }) : kpi.value}</p>
                        <p style={{ margin: 0, fontSize: 10, fontWeight: 600, color: inkSoft, marginTop: 4 }}>{kpi.sub}</p>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div style={{ background: paper, borderRadius: 12, border: `1px solid ${hairline}`, overflow: 'hidden' }}>
                <div style={{ padding: '14px 20px', borderBottom: `1px solid ${hairline}`, background: teal[50], display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <h3 style={{ margin: 0, fontWeight: 700, color: ink, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <TrendingUp size={18} style={{ color: amber[500] }} />
                    Referrals Made
                  </h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr style={{ background: teal[50], borderBottom: `1px solid ${hairline}` }}>
                        <th className="px-6 py-3 font-bold text-slate-500 uppercase text-[10px] tracking-widest">Referred Customer</th>
                        <th className="px-6 py-3 font-bold text-slate-500 uppercase text-[10px] tracking-widest">Code</th>
                        <th className="px-6 py-3 font-bold text-slate-500 uppercase text-[10px] tracking-widest">Date</th>
                        <th className="px-6 py-3 font-bold text-slate-500 uppercase text-[10px] tracking-widest">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {referrals.length === 0 ? (
                        <tr>
                          <td colSpan={4} className="px-6 py-12 text-center text-slate-400 italic">No referrals made by this customer.</td>
                        </tr>
                      ) : (
                        referrals.map((ref) => (
                          <tr key={ref.id} className="hover:bg-slate-50/50 transition-colors">
                            <td className="px-6 py-4 font-bold text-slate-900">{ref.referredByName || ref.customerId}</td>
                            <td className="px-6 py-4 text-slate-500 font-medium">{ref.referralCode}</td>
                            <td className="px-6 py-4 text-slate-500 font-medium">{format(parseISO(ref.date), 'MMM dd, yyyy')}</td>
                            <td className="px-6 py-4">
                              <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-widest border ${ref.status === 'active' ? 'bg-blue-50 text-blue-700 border-blue-100' : ref.status === 'converted' ? 'bg-emerald-50 text-emerald-700 border-emerald-100' : 'bg-slate-50 text-slate-500 border-slate-100'}`}>
                                {ref.status}
                              </span>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              <div style={{ background: paper, borderRadius: 12, border: `1px solid ${hairline}`, overflow: 'hidden' }}>
                <div style={{ padding: '14px 20px', borderBottom: `1px solid ${hairline}`, background: teal[50], display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <h3 style={{ margin: 0, fontWeight: 700, color: ink, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <DollarSign size={18} style={{ color: teal[600] }} />
                    Reward History
                  </h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr style={{ background: teal[50], borderBottom: `1px solid ${hairline}` }}>
                        <th className="px-6 py-3 font-bold text-slate-500 uppercase text-[10px] tracking-widest">Date</th>
                        <th className="px-6 py-3 font-bold text-slate-500 uppercase text-[10px] tracking-widest">Invoice</th>
                        <th className="px-6 py-3 font-bold text-slate-500 uppercase text-[10px] tracking-widest">Amount</th>
                        <th className="px-6 py-3 font-bold text-slate-500 uppercase text-[10px] tracking-widest">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {referralRewards.length === 0 ? (
                        <tr>
                          <td colSpan={4} className="px-6 py-12 text-center text-slate-400 italic">No rewards yet.</td>
                        </tr>
                      ) : (
                        referralRewards.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).map((r) => (
                          <tr key={r.id} className="hover:bg-slate-50/50 transition-colors">
                            <td className="px-6 py-4 text-slate-500 font-medium">{format(parseISO(r.date), 'MMM dd, yyyy')}</td>
                            <td className="px-6 py-4 font-bold text-slate-900">#{r.invoiceId.slice(-8)}</td>
                            <td className="px-6 py-4 font-black text-emerald-600 finance-nums">{currency}{r.amount.toLocaleString()}</td>
                            <td className="px-6 py-4">
                              <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-widest border ${r.status === 'paid' ? 'bg-emerald-50 text-emerald-700 border-emerald-100' : r.status === 'pending' ? 'bg-amber-50 text-amber-700 border-amber-100' : r.status === 'approved' ? 'bg-blue-50 text-blue-700 border-blue-100' : 'bg-rose-50 text-rose-700 border-rose-100'}`}>
                                {r.status}
                              </span>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'Engagement' && (
            <div className="space-y-6 animate-in fade-in duration-300" style={{ padding: 24 }}>
              <EngagementDashboard customerId={customer.id} customer={customer} />
              <div style={{ background: paper, borderRadius: 12, border: `1px solid ${hairline}`, overflow: 'hidden' }}>
                <div style={{ padding: '14px 20px', borderBottom: `1px solid ${hairline}`, background: teal[50], display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <h3 style={{ margin: 0, fontWeight: 700, color: ink, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <History size={18} style={{ color: teal[600] }} />
                    Engagement Timeline
                  </h3>
                </div>
                <div className="p-6 max-h-80 overflow-y-auto custom-scrollbar">
                  <EngagementTimeline customerId={customer.id} limit={30} />
                </div>
              </div>
            </div>
          )}

          {activeTab === 'Wallet' && (
            <div className="space-y-6 animate-in fade-in duration-300" style={{ padding: 24 }}>
              {/* Wallet Header */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
                {[
                  { icon: CreditCard, label: 'Current Balance', value: customer.walletBalance || 0, sub: 'Available for purchases', color: teal[500], accent: teal[500], isCurrency: true },
                  { icon: Plus, label: 'Total Deposits', value: customerWalletTransactions.filter(t => t.type === 'Deposit').reduce((sum, t) => sum + t.amount, 0), sub: 'Lifetime contributions', color: teal[500], accent: teal[500], isCurrency: true },
                  { icon: TrendingUp, label: 'Total Spent', value: customerWalletTransactions.filter(t => t.type === 'Deduction').reduce((sum, t) => sum + t.amount, 0), sub: 'Used for payments', color: danger, accent: danger, isCurrency: true },
                ].map((kpi, i) => {
                  const Icon = kpi.icon;
                  return (
                    <div key={i} style={{ background: paper, padding: '14px 16px', borderRadius: 12, border: `1px solid ${hairline}`, borderLeft: `4px solid ${kpi.accent}`, display: 'flex', alignItems: 'flex-start', gap: 14 }}>
                      <div style={{ padding: 8, background: `${kpi.color}15`, borderRadius: 8, color: kpi.color, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Icon size={20} />
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <p style={{ margin: 0, fontSize: 10, fontWeight: 700, color: inkSoft, textTransform: 'uppercase', letterSpacing: 0.05, lineHeight: 1, marginBottom: 4 }}>{kpi.label}</p>
                        <p style={{ margin: 0, fontSize: 18, fontWeight: 700, color: ink, fontFamily: "'JetBrains Mono', monospace", fontVariantNumeric: 'tabular-nums' }}>{kpi.isCurrency ? currency : ''}{kpi.value.toLocaleString(undefined, { minimumFractionDigits: kpi.isCurrency ? 2 : 0 })}</p>
                        <p style={{ margin: 0, fontSize: 10, fontWeight: 600, color: inkSoft, marginTop: 4 }}>{kpi.sub}</p>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Wallet Transactions Table */}
              <div style={{ background: paper, borderRadius: 12, border: `1px solid ${hairline}`, overflow: 'hidden' }}>
                <div style={{ padding: '14px 20px', borderBottom: `1px solid ${hairline}`, background: teal[50], display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <h3 style={{ margin: 0, fontWeight: 700, color: ink, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <History size={18} style={{ color: teal[600] }} />
                    Wallet Activity History
                  </h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr style={{ background: teal[50], borderBottom: `1px solid ${hairline}` }}>
                        <th className="px-6 py-3 font-bold text-slate-500 uppercase text-[10px] tracking-widest">Date</th>
                        <th className="px-6 py-3 font-bold text-slate-500 uppercase text-[10px] tracking-widest">Type</th>
                        <th className="px-6 py-3 font-bold text-slate-500 uppercase text-[10px] tracking-widest">Description</th>
                        <th className="px-6 py-3 font-bold text-slate-500 uppercase text-[10px] tracking-widest">Sub-Account</th>
                        <th className="px-6 py-3 font-bold text-slate-500 uppercase text-[10px] tracking-widest text-right">Amount</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {customerWalletTransactions.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).map((tx, idx) => (
                        <tr key={idx} className="hover:bg-slate-50/50 transition-colors group">
                          <td className="px-6 py-4 text-slate-500 font-medium whitespace-nowrap">{format(parseISO(tx.date), 'MMM dd, yyyy')}</td>
                          <td className="px-6 py-4">
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-widest border ${tx.type === 'Deposit' ? 'bg-emerald-50 text-emerald-700 border-emerald-100' : 'bg-rose-50 text-rose-700 border-rose-100'
                              }`}>
                              {tx.type}
                            </span>
                          </td>
                          <td className="px-6 py-4 font-bold text-slate-900">{tx.description}</td>
                          <td className="px-6 py-4 text-slate-500 font-medium">{tx.subAccountName || 'Main'}</td>
                          <td className={`px-6 py-4 text-right font-black finance-nums ${tx.type === 'Deposit' ? 'text-emerald-600' : 'text-rose-600'}`}>
                            {tx.type === 'Deposit' ? '+' : '-'}{currency}{tx.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                          </td>
                        </tr>
                      ))}
                      {customerWalletTransactions.length === 0 && (
                        <tr>
                          <td colSpan={5} className="px-6 py-12 text-center text-slate-400 italic">No wallet activity found for this customer.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>
        </div>
      </div>

      {/* Account Activity Modal */}
      {viewingAccountId && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 150, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, background: 'rgba(15,23,42,0.6)', backdropFilter: 'blur(4px)' }}>
          <div style={{ background: paper, borderRadius: 14, boxShadow: '0 30px 70px -20px rgba(0,0,0,.55), 0 8px 24px -8px rgba(0,0,0,.35)', width: '100%', maxWidth: 960, maxHeight: '85vh', overflow: 'hidden', display: 'flex', flexDirection: 'column', border: `1px solid ${hairline}` }}>
            <div style={{ padding: '16px 24px', borderBottom: `1px solid ${hairline}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: teal[50] }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ width: 40, height: 40, borderRadius: 10, background: `linear-gradient(155deg, ${teal[500]}, ${teal[700]})`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <History size={20} color="#fff" />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontWeight: 700, color: ink }}>
                    {accounts.find(a => a.id === viewingAccountId || a.code === viewingAccountId)?.name || viewingAccountId} Activity
                  </h3>
                  <p style={{ margin: '2px 0 0', fontSize: 11, color: inkSoft }}>
                    Ledger Transactions for {customer.name}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setViewingAccountId(null)}
                style={{ width: 32, height: 32, borderRadius: 8, border: `1px solid ${hairline}`, background: paper, color: inkSoft, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', transition: 'all .15s ease' }}
                onMouseEnter={e => { e.currentTarget.style.background = teal[50]; e.currentTarget.style.color = teal[700]; e.currentTarget.style.borderColor = teal[200]; }}
                onMouseLeave={e => { e.currentTarget.style.background = paper; e.currentTarget.style.color = inkSoft; e.currentTarget.style.borderColor = hairline; }}
              >
                <X size={16} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-0">
              <table className="w-full text-left border-collapse">
                <thead className="sticky top-0 z-10">
                  <tr style={{ background: teal[50], borderBottom: `1px solid ${hairline}` }}>
                    <th className="px-6 py-3 font-bold text-slate-500 uppercase text-[10px] tracking-widest">Date</th>
                    <th className="px-6 py-3 font-bold text-slate-500 uppercase text-[10px] tracking-widest">Description</th>
                    <th className="px-6 py-3 font-bold text-slate-500 uppercase text-[10px] tracking-widest">Reference</th>
                    <th className="px-6 py-3 font-bold text-slate-500 uppercase text-[10px] tracking-widest text-right">Debit</th>
                    <th className="px-6 py-3 font-bold text-slate-500 uppercase text-[10px] tracking-widest text-right">Credit</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {accountTransactions.map((entry, idx) => {
                    const isDebit = entry.debitAccountId === viewingAccountId;
                    return (
                      <tr key={idx} className="hover:bg-slate-50/50 transition-colors">
                        <td className="px-6 py-4 text-slate-500 font-medium whitespace-nowrap text-[12px]">
                          {format(parseISO(entry.date), 'MMM dd, yyyy')}
                        </td>
                        <td className="px-6 py-4">
                          <div className="font-bold text-slate-900 text-[12px]">{entry.description}</div>
                        </td>
                        <td className="px-6 py-4">
                          <span className="text-[11px] font-medium text-slate-400">#{entry.referenceId || 'N/A'}</span>
                        </td>
                        <td className="px-6 py-4 text-right font-black text-emerald-600 finance-nums text-[12px]">
                          {isDebit ? `${currency}${entry.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}` : '-'}
                        </td>
                        <td className="px-6 py-4 text-right font-black text-rose-600 finance-nums text-[12px]">
                          {!isDebit ? `${currency}${entry.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}` : '-'}
                        </td>
                      </tr>
                    );
                  })}
                  {accountTransactions.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-6 py-12 text-center text-slate-400 italic">No transactions found for this account in the current context.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div style={{ padding: '14px 24px', borderTop: `1px solid ${hairline}`, background: teal[50], display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', gap: 16 }}>
                <span style={{ fontSize: 11, fontWeight: 700 }}>
                  <span style={{ color: inkSoft, textTransform: 'uppercase', letterSpacing: 0.1, marginRight: 6 }}>Total Debit:</span>
                  <span style={{ color: teal[600], fontFamily: "'JetBrains Mono', monospace" }}>
                    {currency}{accountTransactions
                      .filter(t => t.debitAccountId === viewingAccountId)
                      .reduce((sum, t) => sum + t.amount, 0)
                      .toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </span>
                </span>
                <span style={{ fontSize: 11, fontWeight: 700 }}>
                  <span style={{ color: inkSoft, textTransform: 'uppercase', letterSpacing: 0.1, marginRight: 6 }}>Total Credit:</span>
                  <span style={{ color: danger, fontFamily: "'JetBrains Mono', monospace" }}>
                    {currency}{accountTransactions
                      .filter(t => t.creditAccountId === viewingAccountId)
                      .reduce((sum, t) => sum + t.amount, 0)
                      .toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </span>
                </span>
              </div>
              <button
                onClick={() => setViewingAccountId(null)}
                style={{ padding: '8px 18px', background: ink, color: '#fff', borderRadius: 9, fontWeight: 700, fontSize: 12, border: 'none', cursor: 'pointer', transition: 'all .15s ease' }}
                onMouseEnter={e => e.currentTarget.style.background = teal[800]}
                onMouseLeave={e => e.currentTarget.style.background = ink}
              >
                Close View
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Statement Preview Modal */}
      {isStatementModalOpen && statementPdfUrl && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 150, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, background: 'rgba(15,23,42,0.75)', backdropFilter: 'blur(4px)' }}>
          <div style={{ background: paper, borderRadius: 14, boxShadow: '0 30px 70px -20px rgba(0,0,0,.55), 0 8px 24px -8px rgba(0,0,0,.35)', width: '100%', maxWidth: 1200, height: '90vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div style={{ padding: '16px 24px', borderBottom: `1px solid ${hairline}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: teal[50] }}>
              <h3 style={{ margin: 0, fontWeight: 700, color: ink, display: 'flex', alignItems: 'center', gap: 8 }}>
                <FileText size={20} style={{ color: teal[600] }} />
                Statement Preview
              </h3>
              <button
                onClick={() => setIsStatementModalOpen(false)}
                style={{ width: 32, height: 32, borderRadius: 8, border: `1px solid ${hairline}`, background: paper, color: inkSoft, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', transition: 'all .15s ease' }}
                onMouseEnter={e => { e.currentTarget.style.background = teal[50]; e.currentTarget.style.color = teal[700]; e.currentTarget.style.borderColor = teal[200]; }}
                onMouseLeave={e => { e.currentTarget.style.background = paper; e.currentTarget.style.color = inkSoft; e.currentTarget.style.borderColor = hairline; }}
                title="Close Preview"
              >
                <X size={16} />
              </button>
            </div>

            <div className="flex-1" style={{ background: teal[50], padding: 16, overflow: 'hidden' }}>
              <iframe
                src={statementPdfUrl}
                className="w-full h-full rounded-lg shadow-sm border border-slate-300 bg-white"
                title="Statement Preview"
              />
            </div>

            <div style={{ padding: '14px 24px', borderTop: `1px solid ${hairline}`, background: paper, display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
              <button
                onClick={() => setIsStatementModalOpen(false)}
                style={{ padding: '9px 18px', background: paper, border: `1.4px solid ${hairline}`, color: inkSoft, borderRadius: 9, fontWeight: 700, cursor: 'pointer', transition: 'all .15s ease', fontSize: 13 }}
                onMouseEnter={e => { e.currentTarget.style.background = teal[50]; e.currentTarget.style.color = teal[700]; e.currentTarget.style.borderColor = teal[200]; }}
                onMouseLeave={e => { e.currentTarget.style.background = paper; e.currentTarget.style.color = inkSoft; e.currentTarget.style.borderColor = hairline; }}
              >
                Close
              </button>
              <a
                href={statementPdfUrl}
                download={`Statement_${customer.name}_${format(new Date(), 'yyyy-MM-dd')}.pdf`}
                style={{ padding: '9px 18px', background: `linear-gradient(135deg, ${teal[500]}, ${teal[700]})`, color: '#fff', borderRadius: 9, fontWeight: 700, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 8, boxShadow: `0 4px 12px -4px ${teal[400]}`, transition: 'all .15s ease', fontSize: 13 }}
                onMouseEnter={e => { e.currentTarget.style.opacity = '0.9' }}
                onMouseLeave={e => { e.currentTarget.style.opacity = '1' }}
                onClick={(e) => e.stopPropagation()}
              >
                <Download size={18} />
                Download PDF
              </a>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
