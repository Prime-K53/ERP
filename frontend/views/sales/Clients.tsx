import React, { useState, useMemo, useEffect } from 'react';
import {
  Search, Plus, Filter, Download, Phone,
  MapPin, ChevronRight, User, School, Building2, Landmark,
  Trash2, Edit, ExternalLink, MoreVertical,
  DollarSign, Clock, CheckCircle, AlertCircle, TrendingUp, AlertTriangle, FileText, Target,
  Mail, Eye, Send, Wallet, BookOpen, Printer
} from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useSales } from '../../context/SalesContext';
import { useAuth } from '../../context/AuthContext';
import { useFinance } from '../../context/FinanceContext';
import { Customer, Invoice, CustomerPayment } from '../../types';
import { usePagination } from '../../hooks/usePagination';
import Pagination from '../../components/Pagination';
import { ClientModal } from './components/ClientModal';
import { CustomerCard } from './components/CustomerCard';
import { CustomerWorkspace } from './components/CustomerWorkspace';
import { isAfter, parseISO, subDays, format } from 'date-fns';
import { exportToCSV } from '../../utils/helpers';
import { currencyService } from '../../services/currencyService';
import { CustomerSearch } from '../../components/CustomerSearch';
import { ConfirmDialog, ConfirmDialogType } from '../../components/ConfirmDialog';
import { getFloatingMenuStyle } from '../../utils/actionMenu';
import { buildLedgerFromRecords } from '../../services/customerLedger';

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

const pageWrapper: React.CSSProperties = {
  background: paper,
  fontFamily: "'Inter','DM Sans',sans-serif",
  fontSize: 13.5,
  color: ink,
  minHeight: '100vh',
  padding: '12px 12px 32px'
};
// Mobile-first: sm: 16px 24px, md: 16px 24px
const pageWrapperResponsive = `${pageWrapper}`; // Base mobile, use Tailwind classes on container

const labelStyle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  color: teal[800],
  marginBottom: 6,
  letterSpacing: 0.01,
  display: 'block'
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  fontFamily: "'Inter', sans-serif",
  fontSize: 13.5,
  color: ink,
  background: paper,
  border: '1.4px solid #e4ddd1',
  borderRadius: 9,
  padding: '9px 12px',
  outline: 'none',
  transition: 'border-color .15s ease, box-shadow .15s ease, background .15s ease'
};

const btnPrimary: React.CSSProperties = {
  fontFamily: "'Inter', sans-serif", fontSize: 13, fontWeight: 600,
  padding: '9px 18px', borderRadius: 9, cursor: 'pointer', border: '1.4px solid transparent',
  background: 'linear-gradient(155deg, #1f8577, #0f544c)',
  color: '#fff', display: 'inline-flex', alignItems: 'center', gap: 7,
  boxShadow: '0 6px 16px -6px rgba(15,84,76,.55)',
  transition: 'all .15s ease'
};

const btnGhost: React.CSSProperties = {
  fontFamily: "'Inter', sans-serif", fontSize: 13, fontWeight: 600,
  padding: '9px 18px', borderRadius: 9, cursor: 'pointer',
  background: paper, border: '1.4px solid #e4ddd1', color: inkSoft,
  display: 'inline-flex', alignItems: 'center', gap: 7, transition: 'all .15s ease'
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

const menuItemStyle: React.CSSProperties = {
  textAlign: 'left', padding: '8px 10px', fontSize: 12.5, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8,
  color: ink, borderRadius: 8, border: 'none', background: 'transparent', cursor: 'pointer', width: '100%', transition: 'background .15s'
};

const AVATAR_PALETTE = [
  { bg: '#dff1ec', text: '#146b60' },
  { bg: '#fbead0', text: '#a8711f' },
  { bg: '#e6ecf8', text: '#3b5b9b' },
  { bg: '#f3e8f7', text: '#7c3aed' },
  { bg: '#fde8e8', text: '#b5493f' },
  { bg: '#e8f3ea', text: '#15803d' },
];

const getInitials = (name: string) =>
  (name || '?').trim().split(/\s+/).map((w) => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase() || '?';

const avatarPaletteFor = (name: string) => {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return AVATAR_PALETTE[h % AVATAR_PALETTE.length];
};

const relativeDate = (iso: string) => {
  const date = parseISO(iso);
  const now = new Date();
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diffDays = Math.round((startOfDay(now) - startOfDay(date)) / 86400000);
  if (diffDays <= 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
  return format(date, 'MMM dd, yyyy');
};

export const Clients: React.FC = () => {
  const { customers, addCustomer, updateCustomer, deleteCustomer, isLoading, customerPayments } = useSales();
  const { invoices } = useFinance();
  const { companyConfig } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const currency = companyConfig?.currencySymbol || currencyService.getCurrency(currencyService.getBaseCurrency())?.symbol || '$';

  const [searchQuery, setSearchQuery] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSegmentModalOpen, setIsSegmentModalOpen] = useState(false);
  const [pendingSegment, setPendingSegment] = useState<string | undefined>();
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | undefined>();
  const [selectedWorkspaceCustomer, setSelectedWorkspaceCustomer] = useState<Customer | null>(null);
  const [selectedCardCustomer, setSelectedCardCustomer] = useState<Customer | null>(null);
  const [filterStatus, setFilterStatus] = useState<'All' | 'Active' | 'Inactive' | 'Lead'>('All');
  const [selectedMetric, setSelectedMetric] = useState<'All' | 'Overdue' | 'Open' | 'Paid'>('All');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);
  const [menuAnchor, setMenuAnchor] = useState<DOMRect | null>(null);

  const [confirmState, setConfirmState] = useState<{ open: boolean; title: string; message: string; confirmText?: string; type?: ConfirmDialogType; onConfirm?: () => void }>({ open: false, title: '', message: '' });

  const [balanceRange, setBalanceRange] = useState<string>('Any Balance');
  const [customerSegment, setCustomerSegment] = useState<string>('All Segments');
  const [pipelineStageFilter, setPipelineStageFilter] = useState<string>('All Stages');
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      setActiveMenuId(null);
      // Close advanced filters when clicking outside the filter area
      const target = e.target as HTMLElement;
      if (!target.closest('#advanced-filters-wrapper')) {
        setShowAdvancedFilters(false);
      }
    };
    window.addEventListener('click', handleClickOutside);
    return () => window.removeEventListener('click', handleClickOutside);
  }, []);

  useEffect(() => {
    if (location.state?.action === 'create') {
      handleAddNew();
      window.history.replaceState({}, document.title);
    } else if (location.state?.customerId) {
      const customer = customers.find(c => c.id === location.state.customerId);
      if (customer) {
        setSelectedWorkspaceCustomer(customer);
      }
      window.history.replaceState({}, document.title);
    }
  }, [location.state, customers]);

  const [expandedClientId, setExpandedClientId] = useState<string | null>(null);

  /**
   * Running balance per customer = stored Opening Balance (customer.balance)
   * + transactional deltas (invoices debit / payments credit), computed by the
   * canonical ledger service (services/customerLedger.ts) so the list column
   * matches statements and the customer workspace.
   */
  const runningBalanceByCustomer = useMemo(() => {
    const map = new Map<string, number>();
    for (const c of customers) {
      const custInvoices = (invoices || []).filter((inv: any) => inv.customerId === c.id || inv.customerName === c.name);
      const custPayments = (customerPayments || []).filter((p: any) => p.customerId === c.id || p.customerName === c.name);
      const { closingBalance } = buildLedgerFromRecords({
        customerId: c.id,
        invoices: custInvoices as any[],
        payments: custPayments as any[],
        openingBalance: Number(c.balance || 0),
      });
      map.set(c.id, closingBalance);
    }
    return map;
  }, [customers, invoices, customerPayments]);

  const filteredCustomers = useMemo(() => {
    // Exclude locally soft-deleted clients. Deletes are local-first: the row is
    // kept (flagged with deletedAt) until the tombstone propagates to the cloud
    // and is re-pulled. Without this filter a deleted client stays visible in
    // the list (and can reappear after a cloud pull), so it looks like the
    // delete "did nothing".
    return customers.filter(c => {
      if ((c as Customer & Record<string, unknown>).deletedAt) return false;
      const matchesSearch = (c.name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        (c.email || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        (c.phone && c.phone.includes(searchQuery));
      const matchesStatus = filterStatus === 'All' || c.status === filterStatus;

      const matchesSegment = customerSegment === 'All Segments' || c.segment === customerSegment;
      const matchesPipelineStage = pipelineStageFilter === 'All Stages' || (c as Customer & Record<string, unknown>).pipelineStage === pipelineStageFilter;

      let matchesBalance = true;
      const balance = runningBalanceByCustomer.get(c.id) ?? Number(c.balance || 0);
      if (balanceRange === 'Over $1,000') matchesBalance = balance > 1000;
      else if (balanceRange === 'Over $5,000') matchesBalance = balance > 5000;
      else if (balanceRange === 'Over $10,000') matchesBalance = balance > 10000;
      else if (balanceRange === 'Negative (Credit)') matchesBalance = balance < 0;

      let matchesMetric = true;
      if (selectedMetric === 'Overdue') {
        const hasOverdue = invoices.some(inv =>
          inv.customerId === c.id &&
          inv.status !== 'Paid' &&
          inv.status !== 'Cancelled' &&
          isAfter(new Date(), parseISO(inv.dueDate))
        );
        matchesMetric = hasOverdue;
      } else if (selectedMetric === 'Open') {
        const hasOpen = invoices.some(inv =>
          inv.customerId === c.id &&
          (inv.status === 'Unpaid' || inv.status === 'Partial')
        );
        matchesMetric = hasOpen;
      } else if (selectedMetric === 'Paid') {
        const hasRecentPayment = customerPayments.some(r =>
          r.customerId === c.id &&
          r.status === 'Cleared' &&
          isAfter(parseISO(r.date), subDays(new Date(), 30))
        );
        matchesMetric = hasRecentPayment;
      }

      return matchesSearch && matchesStatus && matchesMetric && matchesSegment && matchesBalance && matchesPipelineStage;
    });
  }, [customers, searchQuery, filterStatus, selectedMetric, invoices, customerPayments, balanceRange, customerSegment, pipelineStageFilter, runningBalanceByCustomer]);

  const { currentItems, currentPage, maxPage, totalItems, next, prev, first, last, setItemsPerPage, itemsPerPage } = usePagination(filteredCustomers, 25);

  const stats = useMemo(() => {
    const today = new Date();
    const thirtyDaysAgo = subDays(today, 30);

    const totalBalance = customers.reduce((sum, c) => sum + (runningBalanceByCustomer.get(c.id) ?? Number(c.balance || 0)), 0);

    const overdueBalance = invoices
      .filter(inv => inv.status !== 'Paid' && inv.status !== 'Cancelled' && isAfter(today, parseISO(inv.dueDate)))
      .reduce((sum, inv) => sum + (inv.totalAmount - (inv.paidAmount || 0)), 0);

    const openInvoicesTotal = invoices
      .filter(inv => inv.status === 'Unpaid' || inv.status === 'Partial')
      .reduce((sum, inv) => sum + (inv.totalAmount - (inv.paidAmount || 0)), 0);

    const paidLast30Days = customerPayments
      .filter(r => r.status === 'Cleared' && isAfter(parseISO(r.date), thirtyDaysAgo))
      .reduce((sum, r) => sum + r.amount, 0);

    const activeCount = customers.filter(c => c.status === 'Active').length;

    return {
      totalBalance,
      overdueBalance,
      openInvoicesTotal,
      paidLast30Days,
      activeCount
    };
  }, [customers, invoices, customerPayments, runningBalanceByCustomer]);

  const handleEdit = (customer: Customer) => {
    setSelectedCustomer(customer);
    setIsModalOpen(true);
  };

  const handleAddNew = () => {
    setIsModalOpen(true);
  };

  const handleSegmentSelect = (segment: string) => {
    setPendingSegment(segment);
    setIsSegmentModalOpen(false);
    setSelectedCustomer(undefined);
    setIsModalOpen(true);
  };

  const handleDelete = async (id: string) => {
    setConfirmState({
      open: true,
      title: 'Delete Client',
      message: 'Are you sure you want to delete this client?',
      type: 'danger',
      confirmText: 'Delete',
      onConfirm: async () => {
        await deleteCustomer(id);
      }
    });
  };

  const handleBatchDelete = async () => {
    setConfirmState({
      open: true,
      title: 'Delete Clients',
      message: `Are you sure you want to delete ${selectedIds.length} clients?`,
      type: 'danger',
      confirmText: 'Delete All',
      onConfirm: async () => {
        for (const id of selectedIds) {
          await deleteCustomer(id);
        }
        setSelectedIds([]);
      }
    });
  };

  const handleBatchStatusUpdate = async (status: 'Active' | 'Inactive') => {
    for (const id of selectedIds) {
      const customer = customers.find(c => c.id === id);
      if (customer) {
        await updateCustomer({ ...customer, status });
      }
    }
    setSelectedIds([]);
  };

  const toggleSelectAll = () => {
    if (selectedIds.length === filteredCustomers.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filteredCustomers.map(c => c.id));
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const handleRowMenuClick = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    // Anchor the dropdown to the trigger button via fixed positioning so it is
    // never clipped/overlapped by the scrollable table wrapper.
    setMenuAnchor((e.currentTarget as HTMLElement).getBoundingClientRect());
    setActiveMenuId(prev => (prev === id ? null : id));
  };

  if (selectedWorkspaceCustomer) {
    return (
      <>
        <CustomerWorkspace
          customer={selectedWorkspaceCustomer}
          onBack={() => setSelectedWorkspaceCustomer(null)}
          onEdit={(customer) => {
            setSelectedCustomer(customer);
            setIsModalOpen(true);
          }}
        />

       <ClientModal
          isOpen={isModalOpen}
          onClose={() => { setIsModalOpen(false); setPendingSegment(undefined); }}
          onSave={selectedCustomer ? (c) => updateCustomer(c).then(() => null) : addCustomer}
          customer={selectedCustomer}
          initialSegment={pendingSegment}
        />
      </>
    );
  }

  const getLastTransaction = (customerId: string) => {
    const customerInvoices = invoices.filter(inv => inv.customerId === customerId || inv.customerName === customers.find(c => c.id === customerId)?.name);
    if (customerInvoices.length === 0) return null;

    return customerInvoices.reduce((prev, current) =>
      isAfter(parseISO(current.date), parseISO(prev.date)) ? current : prev
    );
  };

  const fmtMoney = (v: number | undefined) =>
    `${currency}${(v || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const statusBadge = (status: string) => {
    const map: Record<string, { bg: string; text: string; border: string }> = {
      'Active': { bg: teal[100], text: teal[700], border: teal[200] },
      'Inactive': { bg: '#f5f5f4', text: inkSoft, border: hairline },
      'Lead': { bg: amber[100], text: amber[600], border: amber[300] },
      'Suspended': { bg: '#fef2f2', text: '#b5493f', border: '#f5c6c6' },
      'VIP': { bg: teal[50], text: teal[800], border: teal[200] },
      'Prospect': { bg: teal[50], text: teal[700], border: teal[200] },
      'Credit Hold': { bg: '#fef2f2', text: '#b5493f', border: '#f5c6c6' },
    };
    const s = map[status] || { bg: '#f5f5f4', text: inkSoft, border: hairline };
    return (
      <span style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        padding: '2px 8px', borderRadius: 999, fontSize: 10.5, fontWeight: 700,
        border: `1px solid ${s.border}`, background: s.bg, color: s.text,
        letterSpacing: 0.01, whiteSpace: 'nowrap'
      }}>
        {status}
      </span>
    );
  };

  return (
    <div style={pageWrapper}>
      {/* Header */}
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 16, marginBottom: 20 }}>
        <div>
          <h1 style={{
            fontFamily: "'DM Serif Display', 'Georgia', serif", fontWeight: 400,
            fontSize: 22, margin: 0, color: teal[800], letterSpacing: 0.2
          }}>
            Clients
          </h1>
          <p style={{ margin: '4px 0 0', fontSize: 12.5, color: inkSoft, fontWeight: 500, letterSpacing: 0.01 }}>
            Manage your client relationships and balances
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <button onClick={() => navigate('/sales-flow/leads')} style={btnGhost}>
            <Target size={16} /> Lead Board
          </button>
          <button onClick={() => exportToCSV(customers.map(c => ({ 'Customer ID': c.id, 'Full name': c.name, 'Billing Address': c.billingAddress || c.address || '', 'Phone number': c.phone, 'Segment': c.segment, 'Shipping Address': c.shippingAddress || '', 'Opening Balance': c.balance || 0, 'Wallet Balance': c.walletBalance || 0, 'Branch Account': c.accountNumber || '' })), 'Clients')} style={btnGhost}>
            <Download size={16} /> Export
          </button>
          <button onClick={handleAddNew} style={btnPrimary}>
            <Plus size={18} /> New Client
          </button>
        </div>
      </div>

      {/* Money Bar */}
      <div className="customers-money-bar" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14, marginBottom: 18 }}>
        <div onClick={() => setSelectedMetric(selectedMetric === 'Overdue' ? 'All' : 'Overdue')}
          style={{
            cursor: 'pointer', padding: '14px 16px', borderRadius: 14,
            background: paper, border: `1.4px solid ${hairline}`,
            borderLeft: `4px solid ${danger}`,
            display: 'flex', alignItems: 'flex-start', gap: 14,
            transition: 'transform .15s ease, box-shadow .15s ease',
            transform: selectedMetric === 'Overdue' ? 'scale(1.01)' : 'scale(1)',
            boxShadow: selectedMetric === 'Overdue' ? '0 8px 20px -8px rgba(0,0,0,.12)' : '0 1px 3px rgba(0,0,0,.04)'
          }}>
          <div style={{ padding: 10, borderRadius: 10, background: '#fef2f2', color: danger, display: 'inline-flex' }}><AlertTriangle size={20} /></div>
          <div style={{ minWidth: 0 }}>
            <p style={{ fontSize: 10, fontWeight: 700, color: inkSoft, textTransform: 'uppercase', letterSpacing: 0.08, margin: '0 0 6px' }}>Overdue</p>
            <p style={{ fontSize: 18, fontWeight: 600, color: '#111827', margin: 0, fontFamily: "'Inter', sans-serif", fontVariantNumeric: 'tabular-nums', letterSpacing: 0 }}>
              {currency}{(stats.overdueBalance || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </p>
          </div>
        </div>
        <div onClick={() => setSelectedMetric(selectedMetric === 'Open' ? 'All' : 'Open')}
          style={{
            cursor: 'pointer', padding: '14px 16px', borderRadius: 14,
            background: paper, border: `1.4px solid ${hairline}`,
            borderLeft: `4px solid ${amber[500]}`,
            display: 'flex', alignItems: 'flex-start', gap: 14,
            transition: 'transform .15s ease, box-shadow .15s ease',
            transform: selectedMetric === 'Open' ? 'scale(1.01)' : 'scale(1)',
            boxShadow: selectedMetric === 'Open' ? '0 8px 20px -8px rgba(0,0,0,.12)' : '0 1px 3px rgba(0,0,0,.04)'
          }}>
          <div style={{ padding: 10, borderRadius: 10, background: amber[100], color: amber[500], display: 'inline-flex' }}><Clock size={20} /></div>
          <div style={{ minWidth: 0 }}>
            <p style={{ fontSize: 10, fontWeight: 700, color: inkSoft, textTransform: 'uppercase', letterSpacing: 0.08, margin: '0 0 6px' }}>Open Invoices</p>
            <p style={{ fontSize: 18, fontWeight: 600, color: '#111827', margin: 0, fontFamily: "'Inter', sans-serif", fontVariantNumeric: 'tabular-nums', letterSpacing: 0 }}>
              {currency}{(stats.openInvoicesTotal || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </p>
          </div>
        </div>
        <div onClick={() => setSelectedMetric(selectedMetric === 'Paid' ? 'All' : 'Paid')}
          style={{
            cursor: 'pointer', padding: '14px 16px', borderRadius: 14,
            background: paper, border: `1.4px solid ${hairline}`,
            borderLeft: `4px solid ${teal[500]}`,
            display: 'flex', alignItems: 'flex-start', gap: 14,
            transition: 'transform .15s ease, box-shadow .15s ease',
            transform: selectedMetric === 'Paid' ? 'scale(1.01)' : 'scale(1)',
            boxShadow: selectedMetric === 'Paid' ? '0 8px 20px -8px rgba(0,0,0,.12)' : '0 1px 3px rgba(0,0,0,.04)'
          }}>
          <div style={{ padding: 10, borderRadius: 10, background: teal[100], color: teal[600], display: 'inline-flex' }}><CheckCircle size={20} /></div>
          <div style={{ minWidth: 0 }}>
            <p style={{ fontSize: 10, fontWeight: 700, color: inkSoft, textTransform: 'uppercase', letterSpacing: 0.08, margin: '0 0 6px' }}>Paid (30d)</p>
            <p style={{ fontSize: 18, fontWeight: 600, color: '#111827', margin: 0, fontFamily: "'Inter', sans-serif", fontVariantNumeric: 'tabular-nums', letterSpacing: 0 }}>
              {currency}{(stats.paidLast30Days || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </p>
          </div>
        </div>
        <div onClick={() => setSelectedMetric('All')}
          style={{
            cursor: 'pointer', padding: '14px 16px', borderRadius: 14,
            background: paper, border: `1.4px solid ${hairline}`,
            borderLeft: `4px solid ${teal[500]}`,
            display: 'flex', alignItems: 'flex-start', gap: 14,
            transition: 'transform .15s ease, box-shadow .15s ease',
            transform: selectedMetric === 'All' ? 'scale(1.01)' : 'scale(1)',
            boxShadow: selectedMetric === 'All' ? '0 8px 20px -8px rgba(0,0,0,.12)' : '0 1px 3px rgba(0,0,0,.04)'
          }}>
          <div style={{ padding: 10, borderRadius: 10, background: teal[50], color: teal[500], display: 'inline-flex' }}><User size={20} /></div>
          <div style={{ minWidth: 0 }}>
            <p style={{ fontSize: 10, fontWeight: 700, color: inkSoft, textTransform: 'uppercase', letterSpacing: 0.08, margin: '0 0 6px' }}>Total Balance</p>
            <p style={{ fontSize: 18, fontWeight: 600, color: '#111827', margin: 0, fontFamily: "'Inter', sans-serif", fontVariantNumeric: 'tabular-nums', letterSpacing: 0 }}>
              {currency}{(stats.totalBalance || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </p>
          </div>
        </div>
      </div>

      {/* Main Content Card */}
      <div style={{ background: paper, borderRadius: 14, border: `1.4px solid ${hairline}`, overflow: 'visible', display: 'flex', flexDirection: 'column', boxShadow: '0 10px 30px -14px rgba(0,0,0,.14), 0 1px 3px rgba(0,0,0,.04)' }}>
        {/* Filters & Search */}
        <div className="customers-filter-bar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 18px', borderBottom: `1px solid ${hairline}`, background: paper, flexWrap: 'wrap', gap: 12 }}>
          <div style={{ display: 'flex', flex: 1, alignItems: 'center', gap: 14, minWidth: 0, flexWrap: 'wrap' }}>
            <div style={{ position: 'relative', flex: '1 1 260px', maxWidth: 480 }}>
              <Search size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: inkSoft }} />
              <input
                type="text"
                placeholder="Search by name, email or phone..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{ ...inputStyle, paddingLeft: 36 }}
              />
            </div>

            {selectedIds.length > 0 && (
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 12, fontWeight: 700, padding: '6px 10px', borderRadius: 8, border: `1px solid ${teal[200]}`, background: teal[50], color: teal[800] }}>
                  {selectedIds.length} Selected
                </span>
                <div style={{ width: 1, height: 16, background: hairline, margin: '0 2px' }} />
                <select
                  onChange={(e) => {
                    if (e.target.value === 'delete') handleBatchDelete();
                    else if (e.target.value === 'active') handleBatchStatusUpdate('Active');
                    else if (e.target.value === 'inactive') handleBatchStatusUpdate('Inactive');
                    e.target.value = '';
                  }}
                  style={{ ...inputStyle, width: 'auto', padding: '7px 28px 7px 12px', fontSize: 12.5 }}
                >
                  <option value="">Batch Actions</option>
                  <option value="active">Make Active</option>
                  <option value="inactive">Make Inactive</option>
                  <option value="delete">Delete Selected</option>
                </select>
              </div>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value as any)}
              style={{ ...inputStyle, width: 'auto', padding: '7px 28px 7px 12px', fontSize: 12.5 }}
            >
              <option value="All">All Statuses</option>
              <option value="Active">Active</option>
              <option value="Inactive">Inactive</option>
              <option value="Lead">Lead</option>
              <option value="Suspended">Suspended</option>
              <option value="VIP">VIP</option>
              <option value="Prospect">Prospect</option>
              <option value="Credit Hold">Credit Hold</option>
            </select>
            <select
              value={pipelineStageFilter}
              onChange={(e) => setPipelineStageFilter(e.target.value)}
              style={{ ...inputStyle, width: 'auto', padding: '7px 28px 7px 12px', fontSize: 12.5 }}
            >
              <option value="All Stages">All Stages</option>
              <option value="New">New</option>
              <option value="Qualified">Qualified</option>
              <option value="Proposal">Proposal</option>
              <option value="Negotiation">Negotiation</option>
              <option value="Won">Won</option>
              <option value="Lost">Lost</option>
            </select>
            <div id="advanced-filters-wrapper" style={{ position: 'relative', display: 'inline-block' }}>
              <button onClick={() => setShowAdvancedFilters(prev => !prev)} style={{ padding: '7px 10px', borderRadius: 9, border: `1.4px solid ${hairline}`, background: paper, color: inkSoft, display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer', transition: 'all .15s ease', fontSize: 12.5, fontWeight: 600 }}>
                <Filter size={16} /> Advanced
              </button>
              {showAdvancedFilters && (
              <div style={{ position: 'absolute', right: 0, top: 'calc(100% + 6px)', width: 260, borderRadius: 12, boxShadow: '0 20px 40px -16px rgba(0,0,0,.22)', padding: 18, zIndex: 30, background: paper, border: `1.4px solid ${hairline}` }}>
                <h4 style={{ fontSize: 11, fontWeight: 700, color: teal[800], textTransform: 'uppercase', letterSpacing: 0.08, margin: '0 0 14px' }}>Advanced Filters</h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <div>
                    <label style={labelStyle}>Balance Range</label>
                    <select value={balanceRange} onChange={(e) => setBalanceRange(e.target.value)} style={{ ...inputStyle, fontSize: 12.5 }}>
                      <option value="Any Balance">Any Balance</option>
                      <option value="Over $1,000">Over $1,000</option>
                      <option value="Over $5,000">Over $5,000</option>
                      <option value="Over $10,000">Over $10,000</option>
                      <option value="Negative (Credit)">Negative (Credit)</option>
                    </select>
                  </div>
                  <div>
                    <label style={labelStyle}>Customer Segment</label>
                    <select value={customerSegment} onChange={(e) => setCustomerSegment(e.target.value)} style={{ ...inputStyle, fontSize: 12.5 }}>
                      <option value="All Segments">All Segments</option>
                      <option value="Individual">Individual</option>
                      <option value="School Account">School Account</option>
                      <option value="Institution">Institution</option>
                      <option value="Government">Government</option>
                    </select>
                  </div>
                  <button onClick={() => { setBalanceRange('Any Balance'); setCustomerSegment('All Segments'); }} style={{ ...btnGhost, width: '100%', justifyContent: 'center', marginTop: 2 }}>
                    Reset Filters
                  </button>
                </div>
              </div>
              )}
            </div>
          </div>
        </div>

        {/* Table */}
        <div className="clients-table-wrap sales-list-scroll" style={{ overflow: 'auto', maxHeight: 'calc(100vh - 340px)' }}>
          <style>{`
            .clients-table { border-collapse: separate; border-spacing: 0; }
            .clients-table tbody tr { transition: background .12s ease; }
            .clients-table tbody tr:hover > td { background: #f3faf8; }
            .clients-table tbody tr.selected-row > td { background: #eef7f6; }
          `}</style>
          <table className="clients-table" style={{ width: '100%', minWidth: 1080, textAlign: 'left', fontSize: 13, color: ink }}>
            <thead>
              <tr>
                <th style={{ position: 'sticky', top: 0, zIndex: 5, padding: '12px 14px', fontSize: 11, fontWeight: 700, color: teal[800], textTransform: 'uppercase', letterSpacing: 0.08, textAlign: 'center', width: 44, background: teal[50], borderBottom: `1px solid ${hairline}` }}>
                  <input type="checkbox"
                    style={{ width: 15, height: 15, borderRadius: 6, accentColor: teal[600], cursor: 'pointer', border: `1px solid ${teal[200]}` }}
                    checked={selectedIds.length === filteredCustomers.length && filteredCustomers.length > 0}
                    onChange={toggleSelectAll} />
                </th>
                <th style={{ position: 'sticky', top: 0, zIndex: 5, padding: '12px 14px', fontSize: 11, fontWeight: 700, color: teal[800], textTransform: 'uppercase', letterSpacing: 0.08, background: teal[50], borderBottom: `1px solid ${hairline}` }}>Customer</th>
                <th style={{ position: 'sticky', top: 0, zIndex: 5, padding: '12px 14px', fontSize: 11, fontWeight: 700, color: teal[800], textTransform: 'uppercase', letterSpacing: 0.08, background: teal[50], borderBottom: `1px solid ${hairline}` }}>Contact</th>
                <th style={{ position: 'sticky', top: 0, zIndex: 5, padding: '12px 14px', fontSize: 11, fontWeight: 700, color: teal[800], textTransform: 'uppercase', letterSpacing: 0.08, background: teal[50], borderBottom: `1px solid ${hairline}` }}>Last Transaction</th>
                <th style={{ position: 'sticky', top: 0, zIndex: 5, padding: '12px 14px', fontSize: 11, fontWeight: 700, color: teal[800], textTransform: 'uppercase', letterSpacing: 0.08, textAlign: 'right', background: teal[50], borderBottom: `1px solid ${hairline}` }}>Wallet</th>
                <th style={{ position: 'sticky', top: 0, zIndex: 5, padding: '12px 14px', fontSize: 11, fontWeight: 700, color: teal[800], textTransform: 'uppercase', letterSpacing: 0.08, textAlign: 'right', background: teal[50], borderBottom: `1px solid ${hairline}` }}>Open Balance</th>
                <th style={{ position: 'sticky', top: 0, zIndex: 5, padding: '12px 14px', fontSize: 11, fontWeight: 700, color: teal[800], textTransform: 'uppercase', letterSpacing: 0.08, textAlign: 'center', width: 72, background: teal[50], borderBottom: `1px solid ${hairline}` }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={7} style={{ padding: 40, textAlign: 'center', color: inkSoft, fontStyle: 'italic' }}>Loading clients...</td></tr>
              ) : filteredCustomers.length === 0 ? (
                <tr><td colSpan={7} style={{ padding: 40, textAlign: 'center', color: inkSoft, fontStyle: 'italic' }}>No clients found matching your criteria.</td></tr>
              ) : (
                currentItems.map((customer) => {
                  const isChecked = selectedIds.includes(customer.id);
                  const pal = avatarPaletteFor(customer.name || customer.id);
                  const lastTx = getLastTransaction(customer.id);
                  const openBalance = runningBalanceByCustomer.get(customer.id) ?? Number(customer.balance || 0);
                  const owing = openBalance > 0.5;
                  return (
                    <React.Fragment key={customer.id}>
                      <tr className={isChecked ? 'selected-row' : ''} onClick={(e) => { e.stopPropagation(); setSelectedCardCustomer(customer); }}
                        style={{ cursor: 'pointer', background: isChecked ? teal[50] : 'transparent' }}>
                        <td data-label="" style={{ padding: '13px 14px', textAlign: 'center', borderBottom: `1px solid ${hairline}` }} onClick={(e) => e.stopPropagation()}>
                          <input type="checkbox"
                            style={{ width: 15, height: 15, borderRadius: 6, accentColor: teal[600], cursor: 'pointer', border: `1px solid ${teal[200]}` }}
                            checked={isChecked}
                            onChange={() => toggleSelect(customer.id)} />
                        </td>
                        <td data-label="Customer" style={{ padding: '13px 14px', borderBottom: `1px solid ${hairline}` }}>
                          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 11 }}>
                            <button onClick={(e) => { e.stopPropagation(); setExpandedClientId(expandedClientId === customer.id ? null : customer.id); }}
                              style={{ padding: 4, marginTop: 4, color: inkSoft, background: 'transparent', border: 'none', cursor: 'pointer', display: 'inline-flex', transition: 'color .15s' }}>
                              <ChevronRight size={14} style={{ transition: 'transform .2s', transform: expandedClientId === customer.id ? 'rotate(90deg)' : 'rotate(0deg)' }} />
                            </button>
                            <div style={{ width: 38, height: 38, borderRadius: '50%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: pal.bg, color: pal.text, fontWeight: 700, fontSize: 13, letterSpacing: 0.3, flexShrink: 0, border: `1px solid ${teal[100]}` }}>
                              {getInitials(customer.name)}
                            </div>
                              <div style={{ minWidth: 0 }}>
                                <div style={{ cursor: 'pointer', minWidth: 0 }} onClick={(e) => { e.stopPropagation(); setSelectedWorkspaceCustomer(customer); }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                                    <span style={{ fontWeight: 600, color: ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 200, display: 'inline-block' }}>{customer.name}</span>
                                    {statusBadge(customer.status)}
                                  </div>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 3, flexWrap: 'wrap' }}>
                                  <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10.5, color: inkSoft, fontWeight: 600, letterSpacing: 0.02 }}>{customer.id}</div>
                                  {(customer as Customer & Record<string, unknown>).pipelineStage && (
                                    <span style={{ display: 'inline-flex', alignItems: 'center', padding: '2px 8px', borderRadius: 999, fontSize: 10, fontWeight: 700, border: `1px solid ${teal[200]}`, background: teal[50], color: teal[700], whiteSpace: 'nowrap', lineHeight: 1.6 }}>
                                      {(customer as Customer & Record<string, unknown>).pipelineStage}
                                    </span>
                                  )}
                                  {(customer as Customer & Record<string, unknown>).leadSource && (
                                    <span style={{ display: 'inline-flex', alignItems: 'center', padding: '2px 8px', borderRadius: 999, fontSize: 10, fontWeight: 700, border: `1px solid ${amber[300]}`, background: amber[100], color: amber[600], whiteSpace: 'nowrap', lineHeight: 1.6 }}>
                                      {(customer as Customer & Record<string, unknown>).leadSource as string}
                                    </span>
                                  )}
                                  {customer.creditHold && <AlertTriangle size={12} style={{ color: danger, marginLeft: 6 }} />}
                                </div>
                              </div>
                          </div>
                        </td>
                        <td data-label="Contact" style={{ padding: '13px 14px', borderBottom: `1px solid ${hairline}` }}>
                          {customer.phone || customer.portalEmail || customer.email ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 3, alignItems: 'flex-start' }}>
                              {customer.phone && (
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: inkSoft, whiteSpace: 'nowrap' }}>
                                  <Phone size={11} style={{ color: inkSoft, flexShrink: 0 }} />{customer.phone}
                                </span>
                              )}
                              {(customer.portalEmail || customer.email) && (
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: teal[700], whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 230 }} title={customer.portalEmail || customer.email}>
                                  <Mail size={11} style={{ color: teal[500], flexShrink: 0 }} />{customer.portalEmail || customer.email}
                                </span>
                              )}
                            </div>
                          ) : (
                            <span style={{ color: inkSoft, fontSize: 12 }}>—</span>
                          )}
                        </td>
                        <td data-label="Last Transaction" style={{ padding: '13px 14px', borderBottom: `1px solid ${hairline}`, whiteSpace: 'nowrap' }}>
                          {lastTx ? (
                            <>
                              <div style={{ color: ink, fontWeight: 600, whiteSpace: 'nowrap' }} title={format(parseISO(lastTx.date), 'MMM dd, yyyy hh:mm a')}>
                                {relativeDate(lastTx.date)}
                              </div>
                              <div style={{ fontSize: 11, color: inkSoft, fontFamily: "'JetBrains Mono', monospace", marginTop: 3, whiteSpace: 'nowrap' }}>
                                {(lastTx as unknown as { invoiceNumber?: string }).invoiceNumber || (lastTx as unknown as { invoice_number?: string }).invoice_number || lastTx.id}
                              </div>
                            </>
                          ) : (
                            <span style={{ color: inkSoft, fontSize: 12 }}>—&nbsp;No transactions</span>
                          )}
                        </td>
                        <td data-label="Wallet" style={{ padding: '13px 14px', borderBottom: `1px solid ${hairline}`, textAlign: 'right', color: '#111827', fontWeight: 600, fontFamily: "'Inter', sans-serif", fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                          {fmtMoney(customer.walletBalance)}
                        </td>
                        <td data-label="Balance" style={{ padding: '13px 14px', borderBottom: `1px solid ${hairline}`, textAlign: 'right', whiteSpace: 'nowrap' }}>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontFamily: "'Inter', sans-serif", fontWeight: 600, fontVariantNumeric: 'tabular-nums', color: owing ? danger : '#15803d' }}>
                            <span style={{ width: 8, height: 8, borderRadius: '50%', background: owing ? danger : '#22c55e', flexShrink: 0 }} />
                            {owing ? fmtMoney(openBalance) : 'Paid'}
                          </span>
                        </td>
                        <td data-label="Actions" style={{ padding: '13px 14px', borderBottom: `1px solid ${hairline}`, textAlign: 'center' }} onClick={(e) => e.stopPropagation()}>
                          <div style={{ position: 'relative', display: 'inline-block' }}>
                            <button onClick={(e) => handleRowMenuClick(e, customer.id)}
                              style={{ padding: '7px 9px', borderRadius: 9, border: `1.4px solid ${hairline}`, background: paper, color: inkSoft, cursor: 'pointer', display: 'inline-flex', transition: 'all .15s ease', boxShadow: '0 1px 2px rgba(0,0,0,.05)' }}
                              title="Actions">
                              <MoreVertical size={15} />
                            </button>
                            {activeMenuId === customer.id && (
                              <div onClick={(e) => e.stopPropagation()} style={{ ...getFloatingMenuStyle(menuAnchor, { minWidth: 224, estimatedHeight: 300 }), borderRadius: 12, boxShadow: '0 16px 36px -12px rgba(0,0,0,.28)', padding: '8px 10px', background: paper, border: `1.4px solid ${hairline}`, display: 'flex', flexDirection: 'column', gap: 2 }}>
                                <button onClick={() => { setActiveMenuId(null); setSelectedWorkspaceCustomer(customer); }} style={menuItemStyle}><Eye size={14} style={{ color: inkSoft }} /> View Profile</button>
                                <button onClick={() => { setActiveMenuId(null); handleEdit(customer); }} style={menuItemStyle}><Edit size={14} style={{ color: inkSoft }} /> Edit Customer</button>
                                <button onClick={() => { setActiveMenuId(null); navigate('/sales-flow/invoices', { state: { action: 'create', customer: customer.name } }); }} style={menuItemStyle}><Send size={14} style={{ color: teal[600] }} /> Add Transaction</button>
                                <button onClick={() => { setActiveMenuId(null); navigate('/sales-flow/payments', { state: { action: 'create', customer: customer.name, isTopUp: true } }); }} style={menuItemStyle}><Wallet size={14} style={{ color: teal[600] }} /> Deposit to Wallet</button>
                                <button onClick={() => { setActiveMenuId(null); navigate('/revenue/contacts', { state: { customerId: customer.id } }); }} style={menuItemStyle}><BookOpen size={14} style={{ color: inkSoft }} /> View Ledger</button>
                                <button onClick={() => { setActiveMenuId(null); navigate('/revenue/contacts', { state: { customerId: customer.id } }); }} style={menuItemStyle}><Printer size={14} style={{ color: inkSoft }} /> Print Statement</button>
                                <div style={{ height: 1, background: hairline, margin: '4px 0' }} />
                                <button onClick={() => { setActiveMenuId(null); handleDelete(customer.id); }} style={{ ...menuItemStyle, color: danger }}><Trash2 size={14} /> Delete Client</button>
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                      {expandedClientId === customer.id && customer.subAccounts && customer.subAccounts.length > 0 && (
                        <tr style={{ background: paper }}>
                          <td style={{ padding: 0, borderBottom: `1px solid ${hairline}` }}></td>
                          <td colSpan={6} style={{ padding: '18px 22px', borderBottom: `1px solid ${hairline}` }}>
                            <div style={{ background: paper, borderRadius: 12, border: `1.4px solid ${hairline}`, overflow: 'hidden' }}>
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', background: teal[50], borderBottom: `1px solid ${hairline}` }}>
                                <span style={{ fontSize: 11, fontWeight: 700, color: teal[800], textTransform: 'uppercase', letterSpacing: 0.08 }}>Sub Accounts</span>
                              </div>
                              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                                <thead>
                                  <tr>
                                    <th style={{ padding: '10px 16px', fontSize: 11, fontWeight: 700, color: teal[800], textTransform: 'uppercase', letterSpacing: 0.08, textAlign: 'left', borderBottom: `1px solid ${hairline}` }}>Name</th>
                                    <th style={{ padding: '10px 16px', fontSize: 11, fontWeight: 700, color: teal[800], textTransform: 'uppercase', letterSpacing: 0.08, textAlign: 'right', borderBottom: `1px solid ${hairline}` }}>Wallet</th>
                                    <th style={{ padding: '10px 16px', fontSize: 11, fontWeight: 700, color: teal[800], textTransform: 'uppercase', letterSpacing: 0.08, textAlign: 'right', borderBottom: `1px solid ${hairline}` }}>Balance</th>
                                    <th style={{ padding: '10px 16px', fontSize: 11, fontWeight: 700, color: teal[800], textTransform: 'uppercase', letterSpacing: 0.08, textAlign: 'center', borderBottom: `1px solid ${hairline}` }}>Status</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {customer.subAccounts.map((sub: any) => (
                                    <tr key={sub.id} style={{ borderBottom: `1px solid ${hairline}` }}>
                                      <td style={{ padding: '10px 16px', fontWeight: 600, color: ink }}>{sub.name}</td>
                                      <td style={{ padding: '10px 16px', textAlign: 'right', color: '#111827', fontWeight: 600, fontFamily: "'Inter', sans-serif", fontVariantNumeric: 'tabular-nums' }}>
                                        {currency}{(sub.walletBalance || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                      </td>
                                      <td style={{ padding: '10px 16px', textAlign: 'right', color: (sub.balance || 0) > 0 ? danger : '#111827', fontWeight: 600, fontFamily: "'Inter', sans-serif", fontVariantNumeric: 'tabular-nums' }}>
                                        {currency}{(sub.balance || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                      </td>
                                      <td style={{ padding: '10px 16px', textAlign: 'center' }}>
                                        <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: '2px 8px', borderRadius: 999, fontSize: 10.5, fontWeight: 700, border: `1px solid ${sub.status === 'Active' ? teal[200] : hairline}`, background: sub.status === 'Active' ? teal[100] : '#f5f5f4', color: sub.status === 'Active' ? teal[700] : inkSoft }}>
                                          {sub.status}
                                        </span>
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        <div style={{ padding: '14px 18px', borderTop: `1px solid ${hairline}`, background: paper, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div style={{ color: inkSoft, fontSize: 12.5, fontWeight: 500 }}>
            Showing page {currentPage} of {maxPage} · {totalItems} total clients
          </div>
          <Pagination currentPage={currentPage} maxPage={maxPage} totalItems={totalItems} itemsPerPage={itemsPerPage} onNext={next} onPrev={prev} onFirst={first} onLast={last} onItemsPerPageChange={setItemsPerPage} />
        </div>
      </div>

      {selectedCardCustomer && (
        <CustomerCard
          customer={selectedCardCustomer}
          onClose={() => setSelectedCardCustomer(null)}
          onViewProfile={(c) => {
            setSelectedCardCustomer(null);
            setSelectedWorkspaceCustomer(c);
          }}
          onEdit={(c) => {
            setSelectedCardCustomer(null);
            handleEdit(c);
          }}
          onCreateInvoice={(c) => {
            setSelectedCardCustomer(null);
            navigate('/sales-flow/invoices', { state: { action: 'create', customer: c.name } });
          }}
          onCreateQuote={(c) => {
            setSelectedCardCustomer(null);
            navigate('/sales-flow/orders', { state: { action: 'create', customer: c.name } });
          }}
          onStatement={(c) => {
            setSelectedCardCustomer(null);
            navigate('/revenue/contacts', { state: { customerId: c.id } });
          }}
          onWhatsApp={(c) => {
            setSelectedCardCustomer(null);
            if (c.phone) {
              window.open(`https://wa.me/${c.phone.replace(/[^0-9]/g, '')}`, '_blank');
            }
          }}
          onPortalUpdate={(c) => {
            updateCustomer(c).catch(() => {});
          }}
        />
      )}

        <ClientModal
          isOpen={isModalOpen}
          onClose={() => { setIsModalOpen(false); setPendingSegment(undefined); }}
          onSave={selectedCustomer ? (c) => updateCustomer(c).then(() => null) : addCustomer}
          customer={selectedCustomer}
          initialSegment={pendingSegment}
        />

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

export default Clients;
