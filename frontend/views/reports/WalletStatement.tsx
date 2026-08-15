import React, { useMemo, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useFinance } from '../../context/FinanceContext';
import { useSales } from '../../context/SalesContext';
import { subMonths, format, parseISO } from 'date-fns';
import {
  Wallet, Printer, Filter, X, Search, Download, Eye, FileText,
  TrendingUp, Plus, ArrowUpRight, ArrowDownLeft, RefreshCw,
  AlertCircle, CheckCircle, Clock, CreditCard, Landmark, ChevronDown
} from 'lucide-react';
import { currencyService } from '../../services/currencyService';
import { exportToCSV } from '../../utils/helpers';

const teal = { 50: '#eef7f6', 100: '#d3ece9', 200: '#a6d9d3', 500: '#1f8577', 600: '#146b60', 700: '#0f544c', 800: '#0b3e39', 900: '#082e2a' };
const amber = { 100: '#fbead0', 300: '#eec27a', 500: '#d99a3f' };
const paper = '#FEFDFB';
const ink = '#23282A';
const inkSoft = '#5c6567';
const hairline = '#e4ddd1';
const danger = '#b5493f';

const inputStyle: React.CSSProperties = { width: '100%', fontFamily: "'Inter',sans-serif", fontSize: 13.5, color: ink, background: paper, border: `1.4px solid ${hairline}`, borderRadius: 9, padding: '9px 12px', outline: 'none' };

const WalletStatement: React.FC = () => {
  const { companyConfig, user } = useAuth();
  const { walletTransactions = [] } = useFinance();
  const { customers = [] } = useSales();
  const currency = companyConfig?.currencySymbol || currencyService.getCurrency(currencyService.getBaseCurrency())?.symbol || 'K';

  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('');
  const [dateRange, setDateRange] = useState<'all' | '1m' | '3m' | '6m' | '12m'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [txTypeFilter, setTxTypeFilter] = useState<string>('all');
  const [paymentMethodFilter, setPaymentMethodFilter] = useState<string>('all');
  const [showFilters, setShowFilters] = useState(false);
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

  const customerWalletTx = useMemo(() => {
    if (!selectedCustomerId) return [];
    return (walletTransactions || []).filter((tx: any) => tx.customerId === selectedCustomerId);
  }, [walletTransactions, selectedCustomerId]);

  const getWalletStatus = (balance: number) => {
    if (balance > 0) return { label: 'Active', color: teal[50], textColor: teal[700], borderColor: teal[200] };
    if (balance === 0) return { label: 'Zero Balance', color: paper, textColor: inkSoft, borderColor: hairline };
    return { label: 'Negative', color: `${danger}15`, textColor: danger, borderColor: danger };
  };

  const walletStatus = getWalletStatus(selectedCustomer?.walletBalance || 0);

  const prePeriodTx = useMemo(() => {
    if (!selectedCustomerId || !dateCutoff) return [];
    return (walletTransactions || [])
      .filter((tx: any) => tx.customerId === selectedCustomerId && new Date(tx.date) < dateCutoff)
      .sort((a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }, [walletTransactions, selectedCustomerId, dateCutoff]);

  const openingBalance = useMemo(() => {
    let balance = 0;
    prePeriodTx.forEach((tx: any) => {
      const amt = Number(tx.amount) || 0;
      if (tx.type === 'Deposit' || tx.type === 'Credit' || tx.type === 'Top-up' || tx.type === 'Refund') balance += amt;
      else if (tx.type === 'Deduction' || tx.type === 'Debit' || tx.type === 'Spending' || tx.type === 'Payment') balance -= amt;
    });
    return balance;
  }, [prePeriodTx]);

  const filteredTx = useMemo(() => {
    let txs = [...customerWalletTx].sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime());
    if (dateCutoff) txs = txs.filter((tx: any) => new Date(tx.date) >= dateCutoff);
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      txs = txs.filter((tx: any) =>
        (tx.reference || '').toLowerCase().includes(q) || (tx.description || '').toLowerCase().includes(q) || (tx.id || '').toLowerCase().includes(q) || (tx.source || '').toLowerCase().includes(q));
    }
    if (txTypeFilter !== 'all') txs = txs.filter((tx: any) => tx.type === txTypeFilter);
    return txs;
  }, [customerWalletTx, dateCutoff, searchQuery, txTypeFilter]);

  const inPeriodTx = useMemo(() => {
    if (!dateCutoff) return customerWalletTx;
    return customerWalletTx.filter((tx: any) => new Date(tx.date) >= dateCutoff);
  }, [customerWalletTx, dateCutoff]);

  const totalTopups = useMemo(() =>
    inPeriodTx.filter((t: any) => t.type === 'Deposit' || t.type === 'Top-up' || t.type === 'Credit').reduce((s: number, t: any) => s + (Number(t.amount) || 0), 0), [inPeriodTx]);

  const totalSpending = useMemo(() =>
    inPeriodTx.filter((t: any) => t.type === 'Deduction' || t.type === 'Spending' || t.type === 'Payment').reduce((s: number, t: any) => s + (Number(t.amount) || 0), 0), [inPeriodTx]);

  const totalRefunds = useMemo(() =>
    inPeriodTx.filter((t: any) => t.type === 'Refund').reduce((s: number, t: any) => s + (Number(t.amount) || 0), 0), [inPeriodTx]);

  const totalAdjustments = useMemo(() =>
    inPeriodTx.filter((t: any) => t.type === 'Adjustment').reduce((s: number, t: any) => s + (Number(t.amount) || 0), 0), [inPeriodTx]);

  const ledgerEntries = useMemo(() => {
    let runningBalance = openingBalance;
    const sorted = [...filteredTx].sort((a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime());
    return sorted.map((tx: any) => {
      const amt = Number(tx.amount) || 0;
      const isCredit = tx.type === 'Deposit' || tx.type === 'Credit' || tx.type === 'Top-up' || tx.type === 'Refund';
      const isDebit = tx.type === 'Deduction' || tx.type === 'Debit' || tx.type === 'Spending' || tx.type === 'Payment' || tx.type === 'Adjustment';
      if (isCredit) runningBalance += amt;
      if (isDebit) runningBalance -= amt;
      return { ...tx, runningBalance, isCredit, isDebit };
    });
  }, [filteredTx, openingBalance]);

  const closingBalance = useMemo(() => {
    if (ledgerEntries.length === 0) return openingBalance;
    return ledgerEntries[ledgerEntries.length - 1].runningBalance;
  }, [ledgerEntries, openingBalance]);

  const formatCurrency = (val: number) =>
    `${currency}${val.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const getTxTypeBadge = (type: string) => {
    const map: Record<string, { bg: string; text: string; border: string }> = {
      'Deposit': { bg: teal[50], text: teal[700], border: teal[200] },
      'Top-up': { bg: teal[50], text: teal[700], border: teal[200] },
      'Credit': { bg: teal[50], text: teal[600], border: teal[200] },
      'Deduction': { bg: `${danger}15`, text: danger, border: `${danger}55` },
      'Debit': { bg: `${danger}15`, text: danger, border: `${danger}55` },
      'Spending': { bg: amber[100], text: amber[500], border: amber[300] },
      'Payment': { bg: `${teal[50]}`, text: teal[700], border: teal[200] },
      'Refund': { bg: teal[50], text: teal[500], border: teal[200] },
      'Adjustment': { bg: paper, text: inkSoft, border: hairline },
    };
    return map[type] || { bg: paper, text: inkSoft, border: hairline };
  };

  const uniqueTxTypes = useMemo(() => {
    const types = new Set(customerWalletTx.map((t: any) => t.type));
    return Array.from(types);
  }, [customerWalletTx]);

  const handleExportCSV = () => {
    if (ledgerEntries.length === 0) return;
    const data = ledgerEntries.map((tx: any) => ({
      Date: format(new Date(tx.date), 'yyyy-MM-dd HH:mm'),
      'Transaction ID': tx.id,
      Description: tx.description || tx.type,
      Credit: tx.isCredit ? tx.amount : '',
      Debit: tx.isDebit ? tx.amount : '',
      'Running Balance': tx.runningBalance,
      Source: tx.source || '',
      Reference: tx.reference || '',
      Type: tx.type,
    }));
    exportToCSV(data, `wallet_statement_${selectedCustomer?.name || 'customer'}`);
  };

  if (!selectedCustomerId) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: inkSoft, gap: 16, padding: 40, fontFamily: "'Inter',sans-serif", fontSize: 13 }}>
        <Landmark size={48} style={{ color: `#d0cbc2` }} />
        <p style={{ fontSize: 18, fontWeight: 600, margin: 0 }}>Select a customer to view wallet statement</p>
        <select value="" onChange={e => setSelectedCustomerId(e.target.value)}
          style={{ ...inputStyle, maxWidth: 300, marginTop: 8, cursor: 'pointer', appearance: 'none', backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%235c6567'/%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 12px center', paddingRight: 30 }}
          className="prime-select">
          <option value="">Choose a customer...</option>
          {customers.map((c: any) => (<option key={c.id} value={c.id}>{c.name}</option>))}
        </select>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, fontFamily: "'Inter',sans-serif", fontSize: 13, color: ink }}>
      <div style={{ background: `linear-gradient(135deg, ${teal[700]}, ${teal[900]})`, padding: 24, borderRadius: 14, boxShadow: `0 8px 24px -8px rgba(11,62,57,.4)`, color: '#fff' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <div style={{ padding: 12, background: 'rgba(255,255,255,.15)', borderRadius: 12, backdropFilter: 'blur(8px)' }}>
              <Wallet size={28} />
            </div>
            <div>
              <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0, letterSpacing: -0.01 }}>Wallet Statement</h2>
              <p style={{ color: teal[100], fontSize: 13, fontWeight: 500, margin: '2px 0 0' }}>{selectedCustomer?.name}</p>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <div style={{ textAlign: 'right' }}>
              <p style={{ color: teal[100], fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.06, margin: 0 }}>Current Balance</p>
              <p style={{ fontSize: 24, fontWeight: 900, margin: 0 }}>{formatCurrency(selectedCustomer?.walletBalance || 0)}</p>
            </div>
            <div style={{ padding: '4px 12px', borderRadius: 999, fontSize: 10, fontWeight: 700, border: `1.4px solid ${walletStatus.borderColor}`, background: walletStatus.color, color: walletStatus.textColor }}>
              {walletStatus.label}
            </div>
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 24, marginTop: 16, paddingTop: 16, borderTop: '1.4px solid rgba(255,255,255,.1)' }}>
          <div>
            <p style={{ color: teal[100], fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.06, margin: 0 }}>Wallet ID</p>
            <p style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 13, fontWeight: 700, margin: 0 }}>{selectedCustomer?.id ? `WLT-${selectedCustomer.id.slice(0, 8)}` : 'N/A'}</p>
          </div>
          <div>
            <p style={{ color: teal[100], fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.06, margin: 0 }}>Currency</p>
            <p style={{ fontWeight: 700, margin: 0 }}>{currency}</p>
          </div>
          <div>
            <p style={{ color: teal[100], fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.06, margin: 0 }}>Last Updated</p>
            <p style={{ fontWeight: 700, margin: 0 }}>{walletTransactions.length > 0 ? format(new Date(walletTransactions[0].date), 'MMM dd, yyyy HH:mm') : 'N/A'}</p>
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12 }}>
        {[
          { label: 'Opening Balance', value: formatCurrency(openingBalance), sub: dateRange === 'all' ? 'Since inception' : `Before ${dateCutoff?.toLocaleDateString()}`, color: ink, bg: paper },
          { label: 'Total Top-ups', value: formatCurrency(totalTopups), sub: `${inPeriodTx.filter((t: any) => t.type === 'Deposit' || t.type === 'Top-up').length} txns`, color: teal[600], bg: paper, icon: ArrowUpRight, iconColor: teal[500] },
          { label: 'Total Spending', value: formatCurrency(totalSpending), sub: `${inPeriodTx.filter((t: any) => t.type === 'Deduction' || t.type === 'Spending' || t.type === 'Payment').length} txns`, color: danger, bg: paper, icon: ArrowDownLeft, iconColor: danger },
          { label: 'Refunds', value: formatCurrency(totalRefunds), sub: '', color: teal[500], bg: paper },
          { label: 'Adjustments', value: formatCurrency(totalAdjustments), sub: '', color: amber[500], bg: paper },
          { label: 'Closing Balance', value: formatCurrency(closingBalance), sub: '', color: '#fff', bg: teal[800] },
        ].map(item => (
          <div key={item.label} style={{ background: item.bg, padding: 16, borderRadius: 12, border: item.bg === paper ? `1.4px solid ${hairline}` : 'none', boxShadow: '0 1px 3px rgba(0,0,0,.04)' }}>
            <p style={{ fontSize: 10, fontWeight: 700, color: inkSoft, textTransform: 'uppercase', letterSpacing: 0.06, margin: '0 0 4px' }}>{item.label}</p>
            <p style={{ fontSize: 18, fontWeight: 900, color: item.color, margin: 0 }}>{item.value}</p>
            {item.sub && <p style={{ fontSize: 9, color: inkSoft, margin: '2px 0 0', display: 'flex', alignItems: 'center', gap: 4 }}>{item.icon && <item.icon size={10} style={{ color: (item as any).iconColor }} />}{item.sub}</p>}
          </div>
        ))}
      </div>

      <div style={{ background: paper, borderRadius: 12, border: `1.4px solid ${hairline}`, boxShadow: '0 1px 3px rgba(0,0,0,.04)' }}>
        <div style={{ padding: 12, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
          <div style={{ display: 'flex', gap: 2, background: teal[50], padding: 2, borderRadius: 9 }}>
            {(['all', '1m', '3m', '6m', '12m'] as const).map((range) => (
              <button key={range} onClick={() => setDateRange(range)}
                style={{ padding: '6px 10px', borderRadius: 7, fontSize: 11, fontWeight: 600, border: 'none', cursor: 'pointer', background: dateRange === range ? paper : 'transparent', color: dateRange === range ? teal[500] : inkSoft, boxShadow: dateRange === range ? '0 1px 2px rgba(0,0,0,.06)' : 'none' }}>
                {range === 'all' ? 'All' : range}
              </button>
            ))}
          </div>
          <div style={{ flex: 1, minWidth: 160 }}>
            <div style={{ position: 'relative' }}>
              <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: inkSoft }} />
              <input type="text" placeholder="Search transactions..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                style={{ ...inputStyle, padding: '6px 10px 6px 30px', fontSize: 12, background: teal[50] }}
                className="prime-input" />
            </div>
          </div>
          <select value={txTypeFilter} onChange={e => setTxTypeFilter(e.target.value)}
            style={{ ...inputStyle, padding: '6px 10px', fontSize: 12, background: teal[50], width: 'auto', cursor: 'pointer' }}
            className="prime-select">
            <option value="all">All Types</option>
            {uniqueTxTypes.map(t => (<option key={String(t)} value={String(t)}>{String(t)}</option>))}
          </select>
          <button onClick={() => setShowFilters(!showFilters)}
            style={{ padding: 8, borderRadius: 9, border: 'none', cursor: 'pointer', background: showFilters ? teal[50] : 'transparent', color: showFilters ? teal[500] : inkSoft }}>
            <Filter size={15} />
          </button>
          <div style={{ width: 1, height: 20, background: hairline }} />
          <button onClick={() => { setSelectedCustomerId(''); setSearchQuery(''); }}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px', borderRadius: 9, border: `1.4px solid ${hairline}`, fontSize: 11, fontWeight: 600, background: paper, cursor: 'pointer', color: inkSoft }}>
            <RefreshCw size={12} /> Reset
          </button>
          <button onClick={handleExportCSV} disabled={ledgerEntries.length === 0}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 9, border: 'none', fontSize: 11, fontWeight: 700, background: teal[50], color: teal[700], cursor: ledgerEntries.length === 0 ? 'not-allowed' : 'pointer', opacity: ledgerEntries.length === 0 ? 0.5 : 1 }}>
            <Download size={13} /> Export CSV
          </button>
          <button onClick={() => window.print()}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 9, border: 'none', fontSize: 11, fontWeight: 700, background: teal[50], color: inkSoft, cursor: 'pointer' }}>
            <Printer size={13} /> Print
          </button>
        </div>
      </div>

      <div style={{ background: paper, borderRadius: 12, border: `1.4px solid ${hairline}`, boxShadow: '0 1px 3px rgba(0,0,0,.04)', overflow: 'hidden' }}>
        <div style={{ padding: '12px 20px', borderBottom: `1.4px solid ${teal[100]}`, background: teal[50], display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <FileText size={15} style={{ color: teal[600] }} />
            <h3 style={{ fontWeight: 700, color: ink, fontSize: 13, margin: 0 }}>Transaction History</h3>
          </div>
          <span style={{ fontSize: 10, color: inkSoft, fontFamily: "'JetBrains Mono',monospace", background: teal[50], padding: '2px 8px', borderRadius: 4 }}>
            {ledgerEntries.length} transaction{ledgerEntries.length !== 1 ? 's' : ''}
          </span>
        </div>
        <div style={{ overflowX: 'auto' }}>
          {ledgerEntries.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 48 }}>
              <Wallet size={36} style={{ margin: '0 auto 12', color: `#d0cbc2` }} />
              <p style={{ color: inkSoft, fontWeight: 500, fontSize: 13, margin: 0 }}>No wallet transactions for this period.</p>
            </div>
          ) : (
            <table style={{ width: '100%', textAlign: 'left', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: teal[50], borderBottom: `1.4px solid ${teal[100]}`, position: 'sticky', top: 0 }}>
                  {['Date & Time', 'Transaction ID', 'Description', 'Credit', 'Debit', 'Running Balance', 'Source', 'Ref Document', 'Created By', 'Actions'].map(h => (
                    <th key={h} style={{ padding: '10px 12px', fontSize: 10, fontWeight: 700, color: inkSoft, textTransform: 'uppercase', letterSpacing: 0.06, textAlign: h === 'Credit' || h === 'Debit' || h === 'Running Balance' || h === 'Actions' ? 'center' : 'left' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {ledgerEntries.map((tx: any, idx: number) => (
                  <React.Fragment key={tx.id || idx}>
                    <tr onClick={() => setExpandedTx(expandedTx === tx.id ? null : tx.id)}
                      style={{ borderBottom: `1.4px solid ${teal[50]}`, cursor: 'pointer' }}
                      onMouseEnter={e => e.currentTarget.style.background = teal[50]}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                      <td style={{ padding: '10px 12px', fontSize: 11, color: inkSoft, whiteSpace: 'nowrap', fontWeight: 500 }}>
                        <div>{format(new Date(tx.date), 'MMM dd, yyyy')}</div>
                        <div style={{ fontSize: 9, color: inkSoft }}>{format(new Date(tx.date), 'HH:mm')}</div>
                      </td>
                      <td style={{ padding: '10px 12px', fontSize: 11, fontFamily: "'JetBrains Mono',monospace", color: inkSoft }}>{(tx.id || '').slice(0, 12)}...</td>
                      <td style={{ padding: '10px 12px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ padding: '2px 6px', borderRadius: 4, fontSize: 9, fontWeight: 700, border: `1.4px solid ${getTxTypeBadge(tx.type).border}`, background: getTxTypeBadge(tx.type).bg, color: getTxTypeBadge(tx.type).text }}>{tx.type}</span>
                          <span style={{ fontSize: 11, color: ink, fontWeight: 500 }}>{tx.description || tx.type}</span>
                        </div>
                      </td>
                      <td style={{ padding: '10px 12px', textAlign: 'right', fontSize: 11, fontWeight: 700, color: teal[600] }}>{tx.isCredit ? formatCurrency(tx.amount) : '-'}</td>
                      <td style={{ padding: '10px 12px', textAlign: 'right', fontSize: 11, fontWeight: 700, color: danger }}>{tx.isDebit ? formatCurrency(tx.amount) : '-'}</td>
                      <td style={{ padding: '10px 12px', textAlign: 'right', fontSize: 11, fontWeight: 700, color: ink }}>{formatCurrency(tx.runningBalance)}</td>
                      <td style={{ padding: '10px 12px', fontSize: 11, color: inkSoft }}>{tx.source || 'Manual'}</td>
                      <td style={{ padding: '10px 12px', fontSize: 11, fontFamily: "'JetBrains Mono',monospace", color: inkSoft }}>{tx.reference || '-'}</td>
                      <td style={{ padding: '10px 12px', fontSize: 11, color: inkSoft }}>{tx.createdBy || user?.name || 'System'}</td>
                      <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                        <button style={{ padding: 6, background: 'transparent', border: 'none', color: inkSoft, cursor: 'pointer', borderRadius: 6 }}
                          onMouseEnter={e => { e.currentTarget.style.background = teal[50]; e.currentTarget.style.color = teal[600]; }}
                          onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = inkSoft; }}>
                          <Eye size={13} />
                        </button>
                      </td>
                    </tr>
                    {expandedTx === tx.id && (
                      <tr style={{ background: teal[50] }}>
                        <td colSpan={10} style={{ padding: '12px 24px' }}>
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 16, fontSize: 12 }}>
                            {[
                              { label: 'Full ID', value: tx.id },
                              { label: 'Amount', value: formatCurrency(tx.amount), bold: true },
                              { label: 'Running Balance', value: formatCurrency(tx.runningBalance), bold: true },
                              { label: 'Reference', value: tx.reference || 'N/A' },
                            ].map(f => (
                              <div key={f.label}>
                                <p style={{ fontWeight: 700, color: inkSoft, textTransform: 'uppercase', fontSize: 9, letterSpacing: 0.06, margin: '0 0 4px' }}>{f.label}</p>
                                <p style={{ color: ink, margin: 0, fontWeight: f.bold ? 700 : 400 }}>{f.value}</p>
                              </div>
                            ))}
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
          .statement-ledger { page-break-inside: auto; }
        }
      `}</style>
    </div>
  );
};

export default WalletStatement;