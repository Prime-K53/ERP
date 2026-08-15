import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  FileText, Download, Loader2, Share2, CheckCircle2, X, CalendarDays,
} from 'lucide-react';
import { createElement } from 'react';
import { pdf } from '@react-pdf/renderer';
import { portalLifecycle } from '../../services/portalApiClient';

import { attachDocumentSecurity } from '../../utils/documentSecurity';
import { initializePrimePdfFonts } from '../shared/components/PDF/templateSettings';
import { PrimeDocument } from '../shared/components/PDF/PrimeDocument';
import { useAuth } from '../../context/AuthContext';
import { useSearchParams } from 'react-router-dom';
import EmptyState from './components/EmptyState';
import PortalLoadingSkeleton from './components/PortalLoadingSkeleton';
import { formatK } from './constants';
import { F } from './portalStyles';

// ── Types ──────────────────────────────────────────────────────────────
interface Transaction {
  date: string;
  description: string;
  reference?: string;
  debit: number;
  credit: number;
  balance: number;
  /** LedgerType from the API (e.g. 'PAYMENT' | 'INVOICE' | 'CREDIT_NOTE'). When present, drives coloring. */
  type?: string;
}

interface StatementData {
  opening_balance: number;
  closing_balance: number;
  outstanding_balance?: number;
  credit_limit?: number;
  transactions: Transaction[];
}

type PeriodFilter = 'all' | 'this_month' | 'last_30' | 'ytd';

const PERIODS: { key: PeriodFilter; label: string }[] = [
  { key: 'all', label: 'ALL' },
  { key: 'this_month', label: 'THIS MONTH' },
  { key: 'last_30', label: 'LAST 30 DAYS' },
  { key: 'ytd', label: 'YTD' },
];

// ── Shared tokens ──────────────────────────────────────────────────────
const MONO = "'JetBrains Mono', monospace";
const NAVY = '#0F2C59';
const TEAL_GRADIENT = 'linear-gradient(135deg, #146b60 0%, #0f544c 100%)';
const EMERALD = '#059669';

// ── Period Filter Chips ────────────────────────────────────────────────
interface PeriodFilterChipsProps {
  active: PeriodFilter;
  onChange: (filter: PeriodFilter) => void;
}

const PeriodFilterChips: React.FC<PeriodFilterChipsProps> = ({ active, onChange }) => {
  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      {PERIODS.map((period) => {
        const isActive = active === period.key;
        return (
          <button
            key={period.key}
            onClick={() => onChange(period.key)}
            aria-pressed={isActive}
            style={{
              padding: '8px 16px',
              borderRadius: 9999,
              border: isActive ? '1px solid transparent' : '1px solid #E2E8F0',
              background: isActive ? TEAL_GRADIENT : 'rgba(255,255,255,0.9)',
              color: isActive ? '#fff' : '#475569',
              fontSize: 11.5,
              fontWeight: 700,
              letterSpacing: '0.05em',
              cursor: 'pointer',
              transition: 'all 200ms cubic-bezier(.4,0,.2,1)',
              boxShadow: isActive ? '0 4px 14px -4px rgba(15,84,76,0.55)' : '0 1px 2px rgba(15,23,42,0.04)',
              transform: isActive ? 'translateY(-1px)' : 'none',
              lineHeight: 1.4,
            }}
            onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.borderColor = '#72c0b7'; }}
            onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.borderColor = '#E2E8F0'; }}
          >
            {period.label}
          </button>
        );
      })}
    </div>
  );
};

// ── Ledger Item Row ────────────────────────────────────────────────────
interface LedgerItemProps {
  transaction: Transaction;
  isLast: boolean;
}

const LedgerItem: React.FC<LedgerItemProps> = ({ transaction, isLast }) => {
  const type = (transaction.type || '').toLowerCase();
  const isPaymentType = type === 'payment' || type === 'payment_received' || type === 'credit' || type === 'credit_note';
  const isDebit = !isPaymentType && transaction.debit > 0;
  const isCredit = isPaymentType || transaction.credit > 0;
  const shownAmount = isCredit
    ? (transaction.credit > 0 ? transaction.credit : transaction.debit)
    : transaction.debit;
  const formattedDate = new Date(transaction.date).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });

  return (
    <div
      style={{
        paddingTop: 10,
        paddingBottom: 10,
        paddingLeft: 12,
        paddingRight: 12,
        borderBottom: isLast ? 'none' : '1px solid #E2E8F0',
        borderLeft: '3px solid transparent',
        borderRadius: 8,
        background: '#fff',
        transition: 'all 200ms cubic-bezier(.4,0,.2,1)',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = '#F8FAFC';
        e.currentTarget.style.borderLeftColor = '#0F2C59';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = '#fff';
        e.currentTarget.style.borderLeftColor = 'transparent';
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: '#1E293B', lineHeight: 1.3 }}>{transaction.description}</div>
            <div style={{ fontSize: 12, color: '#64748B', marginTop: 2, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              {transaction.reference && (
                <>
                  <span style={{ fontFamily: MONO, fontVariantNumeric: 'tabular-nums' }}>Ref: {transaction.reference}</span>
                  <span style={{ color: '#CBD5E1' }}>•</span>
                </>
              )}
              <span>{formattedDate}</span>
            </div>
          </div>
          <div style={{ textAlign: 'right', flexShrink: 0 }}>
            {isDebit && shownAmount > 0 && (
              <div style={{ fontSize: 14, fontWeight: 700, color: '#DC2626', fontFamily: F, fontVariantNumeric: 'tabular-nums' }}>
                +{formatK(shownAmount)}
              </div>
            )}
            {isCredit && shownAmount > 0 && (
              <div style={{ fontSize: 14, fontWeight: 700, color: '#059669', fontFamily: F, fontVariantNumeric: 'tabular-nums' }}>
                -{formatK(shownAmount)}
              </div>
            )}
            <div style={{ fontSize: 11, fontWeight: 600, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.06em', marginTop: 3 }}>
              Running Balance
            </div>
            <div style={{ fontSize: 13.5, fontWeight: 700, color: '#0F172A', fontFamily: F, fontVariantNumeric: 'tabular-nums' }}>
              {formatK(transaction.balance)}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// ── Financial Status Card ──────────────────────────────────────────────
interface FinancialStatusCardProps {
  outstandingBalance: number;
  creditLimit: number;
}

const FinancialStatusCard: React.FC<FinancialStatusCardProps> = ({ outstandingBalance, creditLimit }) => {
  const balance = Number(outstandingBalance) || 0;
  const limit = Number(creditLimit) || 0;
  const availableCredit = limit - Math.abs(balance);
  const utilization = limit > 0 ? Math.min(100, (Math.abs(balance) / limit) * 100) : 0;

  return (
    <div style={{ borderRadius: 16, border: '1px solid #E2E8F0', background: '#fff', boxShadow: '0 1px 3px rgba(15,23,42,0.04)', overflow: 'hidden' }}>
      <div style={{ padding: '18px 20px 14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: 11.5, fontWeight: 600, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>Outstanding Balance</div>
            <div style={{ fontSize: 26, fontWeight: 800, color: '#0F172A', fontFamily: F, fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em', lineHeight: 1.2 }}>
              {formatK(Math.abs(balance))}
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 11.5, fontWeight: 600, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>Approved Credit Limit</div>
            <div style={{ fontSize: 26, fontWeight: 800, color: '#0F172A', fontFamily: F, fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em', lineHeight: 1.2 }}>
              {formatK(limit)}
            </div>
          </div>
        </div>

        <div style={{ marginTop: 14 }}>
          <div style={{ fontSize: 11.5, fontWeight: 600, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>Available Credit</div>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#475569', marginBottom: 6 }}>Available Credit: {formatK(Math.max(0, availableCredit))}</div>
          <div style={{ height: 9, borderRadius: 5, background: '#E2E8F0', overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${utilization}%`, borderRadius: 5, background: utilization > 80 ? '#DC2626' : utilization > 60 ? '#D97706' : '#059669', transition: 'width 600ms cubic-bezier(.4,0,.2,1)' }} />
          </div>
        </div>
      </div>
    </div>
  );
};

// ── Export Dialog ───────────────────────────────────────────────────────
interface StatementExportDialogProps {
  isOpen: boolean;
  onClose: () => void;
  data: StatementData;
  startDate: string;
  endDate: string;
  companyName?: string;
  periodFilter: PeriodFilter;
}

const StatementExportDialog: React.FC<StatementExportDialogProps> = ({
  isOpen,
  onClose,
  data,
  startDate,
  endDate,
  companyName,
  periodFilter,
}) => {
  const [downloading, setDownloading] = useState(false);
  const [copied, setCopied] = useState(false);

  // Stable, human-friendly account ID derived from the company name.
  const accountId = useMemo(() => {
    const base = (companyName || 'CUS').replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 4) || 'CUS';
    const code = [...base].reduce((acc, ch) => acc + ch.charCodeAt(0), 0).toString(16).toUpperCase().padStart(4, '0');
    return `ACC-${base}-${code}`;
  }, [companyName]);

  const handleDownloadPdf = useCallback(async () => {
    setDownloading(true);
    try {
      await initializePrimePdfFonts();

      const transactions = (data.transactions || []).map((t) => ({
        date: t.date,
        reference: t.description || '',
        memo: '',
        debit: Number(t.debit || 0),
        credit: Number(t.credit || 0),
        runningBalance: Number(t.balance || 0),
      }));

      const totalInvoiced = transactions.reduce((sum, t) => sum + t.debit, 0);
      const totalReceived = transactions.reduce((sum, t) => sum + t.credit, 0);

      const statementData = {
        date: new Date().toLocaleDateString(),
        customerName: companyName || 'Customer',
        startDate: startDate || 'N/A',
        endDate: endDate || 'N/A',
        currency: 'MWK',
        openingBalance: Number(data.opening_balance || 0),
        transactions,
        totalInvoiced,
        totalReceived,
        finalBalance: Number(data.closing_balance || 0),
      };

      const secured = await attachDocumentSecurity(statementData, companyName);
      const blob = await pdf(createElement(PrimeDocument as any, { type: 'ACCOUNT_STATEMENT', data: secured }) as any).toBlob();

      const url = URL.createObjectURL(blob);
      const a = window.document.createElement('a');
      a.href = url;
      a.download = `Statement-${startDate || 'start'}_to_${endDate || 'end'}.pdf`;
      window.document.body.appendChild(a);
      a.click();
      window.document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Failed to generate statement PDF:', err);
    } finally {
      setDownloading(false);
    }
  }, [data, startDate, endDate, companyName]);

  const handleCopyLink = useCallback(async () => {
    try {
      // HashRouter: route + params live after the '#', so build the link from the base URL.
      const base = window.location.href.split('#')[0];
      const link = `${base}#/portal/account-statements?period=${periodFilter}`;
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy link:', err);
    }
  }, [periodFilter]);

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(15,23,42,0.6)',
        backdropFilter: 'blur(6px)',
        WebkitBackdropFilter: 'blur(6px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        padding: 20,
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        style={{
          background: 'rgba(255,255,255,0.96)',
          backdropFilter: 'blur(24px) saturate(160%)',
          WebkitBackdropFilter: 'blur(24px) saturate(160%)',
          borderRadius: 20,
          border: '1px solid rgba(226,232,240,0.9)',
          boxShadow: '0 30px 60px -15px rgba(15,23,42,0.35), 0 4px 12px -4px rgba(15,23,42,0.08)',
          width: '100%',
          maxWidth: 460,
          animation: 'modalIn .18s cubic-bezier(.4,0,.2,1)',
        }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="export-title"
      >
        {/* Header */}
        <div style={{
          padding: '18px 24px',
          borderBottom: '1px solid #F1F5F9',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 34, height: 34, borderRadius: 10,
              background: TEAL_GRADIENT,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 2px 8px -2px rgba(15,84,76,0.5)',
            }}>
              <Download size={16} style={{ color: '#fff' }} />
            </div>
            <div>
              <h2 id="export-title" style={{ fontSize: 17, fontWeight: 700, color: '#0F172A', margin: 0, lineHeight: 1.25 }}>
                Export Statement
              </h2>
              <p style={{ fontSize: 12, color: '#64748B', margin: '2px 0 0', lineHeight: 1.3 }}>
                Download or share your official statement
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              width: 34, height: 34, borderRadius: 10,
              border: '1px solid #E2E8F0',
              background: '#fff',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', color: '#64748B',
              transition: 'all 150ms ease',
            }}
            aria-label="Close dialog"
            onMouseEnter={(e) => { e.currentTarget.style.background = '#F8FAFC'; e.currentTarget.style.color = '#0F172A'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = '#fff'; e.currentTarget.style.color = '#64748B'; }}
          >
            <X size={18} />
          </button>
        </div>

        {/* PDF Preview Summary */}
        <div style={{ padding: '20px 24px' }}>
          <div style={{
            padding: '16px 20px',
            borderRadius: 14,
            background: 'linear-gradient(180deg, #F8FAFC, #F1F5F9)',
            border: '1px solid #E2E8F0',
            marginBottom: 20,
          }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
              {[
                { label: 'Company', value: companyName || 'Customer', mono: false },
                { label: 'Account ID', value: accountId, mono: true },
                { label: 'Statement Period', value: `${startDate} to ${endDate}`, mono: false },
              ].map((row) => (
                <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    {row.label}
                  </span>
                  <span style={{ fontSize: 13, fontWeight: 600, color: '#1E293B', fontFamily: row.mono ? MONO : undefined, fontVariantNumeric: 'tabular-nums' }}>
                    {row.value}
                  </span>
                </div>
              ))}
              <div style={{
                marginTop: 6,
                paddingTop: 12,
                borderTop: '1px solid #E2E8F0',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: NAVY, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Net Current Balance
                </span>
                <span style={{
                  fontSize: 17,
                  fontWeight: 700,
                  color: Number(data.closing_balance) < 0 ? '#DC2626' : EMERALD,
                  fontFamily: F,
                  fontVariantNumeric: 'tabular-nums',
                }}>
                  {formatK(data.closing_balance || 0)}
                </span>
              </div>
            </div>
          </div>

          {/* Export Actions */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <button
              onClick={handleDownloadPdf}
              disabled={downloading}
              style={{
                width: '100%',
                padding: '13px 20px',
                borderRadius: 12,
                border: 'none',
                background: TEAL_GRADIENT,
                color: '#fff',
                fontSize: 13.5,
                fontWeight: 600,
                cursor: downloading ? 'not-allowed' : 'pointer',
                opacity: downloading ? 0.65 : 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 10,
                boxShadow: '0 6px 16px -6px rgba(15,84,76,0.6)',
                transition: 'all 200ms cubic-bezier(.4,0,.2,1)',
              }}
              onMouseEnter={(e) => { if (!downloading) e.currentTarget.style.transform = 'translateY(-1px)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.transform = 'none'; }}
            >
              {downloading ? (
                <Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} />
              ) : (
                <Download size={18} />
              )}
              {downloading ? 'Generating...' : 'Download Official PDF Statement'}
            </button>

            <button
              onClick={handleCopyLink}
              style={{
                width: '100%',
                padding: '13px 20px',
                borderRadius: 12,
                border: copied ? '1px solid rgba(5,150,105,0.4)' : '1px solid #E2E8F0',
                background: copied ? 'rgba(5,150,105,0.06)' : '#fff',
                color: copied ? EMERALD : NAVY,
                fontSize: 13.5,
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 10,
                transition: 'all 200ms cubic-bezier(.4,0,.2,1)',
              }}
              onMouseEnter={(e) => { if (!copied) { e.currentTarget.style.background = '#F8FAFC'; e.currentTarget.style.borderColor = '#72c0b7'; } }}
              onMouseLeave={(e) => { if (!copied) { e.currentTarget.style.background = '#fff'; e.currentTarget.style.borderColor = '#E2E8F0'; } }}
            >
              {copied ? (
                <>
                  <CheckCircle2 size={18} style={{ color: EMERALD }} />
                  Link Copied!
                </>
              ) : (
                <>
                  <Share2 size={18} />
                  Share Statement Link
                </>
              )}
            </button>

            <p style={{ fontSize: 11.5, color: '#94A3B8', textAlign: 'center', margin: '4px 0 0', lineHeight: 1.45 }}>
              The PDF includes your full transaction ledger for the selected period.
            </p>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
};

// ── Main Component ─────────────────────────────────────────────────────
const CustomerAccountStatements: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [data, setData] = useState<StatementData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [periodFilter, setPeriodFilterState] = useState<PeriodFilter>(() => {
    // Router-provided search params work under HashRouter too (params live in the hash).
    const p = searchParams.get('period');
    return PERIODS.some(({ key }) => key === p) ? (p as PeriodFilter) : 'all';
  });
  const [showExportDialog, setShowExportDialog] = useState(false);
  const { companyConfig } = useAuth();

  // Keep the shareable ?period= param in sync so shared links land on the right period.
  const setPeriodFilter = useCallback((filter: PeriodFilter) => {
    setPeriodFilterState(filter);
    setSearchParams({ period: filter }, { replace: true });
  }, [setSearchParams]);

  // Calculate date range based on period filter
  const getDateRange = useCallback((filter: PeriodFilter) => {
    const now = new Date();
    const end = now.toISOString().split('T')[0];
    let start: string;

    switch (filter) {
      case 'this_month':
        start = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
        break;
      case 'last_30':
        start = new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0];
        break;
      case 'ytd':
        start = new Date(now.getFullYear(), 0, 1).toISOString().split('T')[0];
        break;
      case 'all':
      default:
        start = new Date(Date.now() - 365 * 86400000).toISOString().split('T')[0];
        break;
    }

    return { start, end };
  }, []);

  const fetchStatement = useCallback(async (filter: PeriodFilter) => {
    setLoading(true);
    setError(null);
    try {
      const { start, end } = getDateRange(filter);
      const result = await portalLifecycle.statements.list({ startDate: start, endDate: end });
      setData((result && (result as StatementData).transactions?.length > 0) ? result as StatementData : null);
    } catch (err: any) {
      setError(err.message || 'Failed to load statement');
    } finally {
      setLoading(false);
    }
  }, [getDateRange]);

  useEffect(() => {
    fetchStatement(periodFilter);
  }, [periodFilter, fetchStatement]);

  useEffect(() => {
    let cancelled = false;
    let unsubscribe: (() => void) | undefined;
    (async () => {
      unsubscribe = await portalLifecycle.subscribe({
        onEvent: (type, payload) => {
          if (type === 'entity_changed' && (
            payload?.docType === 'statement' || payload?.docType === 'invoice' ||
            payload?.docType === 'payment_allocated' || payload?.docType === 'credit_note' ||
            payload?.docType === 'debit_note'
          ) && !cancelled) {
            fetchStatement(periodFilter);
          }
        },
      });
    })();
    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [fetchStatement, periodFilter]);

  if (loading) {
    return (
      <div style={{ padding: 32, maxWidth: 860, margin: '0 auto' }}>
        <PortalLoadingSkeleton type="table" count={6} />
      </div>
    );
  }

  const { start: currentStart, end: currentEnd } = getDateRange(periodFilter);
  const outstandingBalance = data?.outstanding_balance ?? data?.closing_balance ?? 0;
  const creditLimit = data?.credit_limit ?? 0;

  return (
    <div style={{ fontFamily: F, fontSize: 13.5, lineHeight: 1.45, color: '#1E293B' }}>
      {/* Top Bar Header & Export Trigger */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        margin: '4px 28px 22px',
        flexWrap: 'wrap',
        gap: 16,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{
            width: 50, height: 50, borderRadius: 15,
            background: 'linear-gradient(160deg, #4A76B5 0%, #0F2C59 100%)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 8px 20px -8px rgba(15,44,89,0.6), inset 0 1px 0 rgba(255,255,255,0.25)',
          }}>
            <FileText size={24} style={{ color: '#fff' }} />
          </div>
          <div>
            <h1 style={{ fontSize: 21, fontWeight: 700, color: '#0F172A', margin: 0, letterSpacing: '-0.02em', lineHeight: 1.25 }}>
              Financial Statements
            </h1>
            <p style={{ fontSize: 13, fontWeight: 500, color: '#64748B', margin: '3px 0 0', lineHeight: 1.4 }}>
              Account activity and balances
            </p>
          </div>
        </div>

        {data && data.transactions.length > 0 && (
          <button
            onClick={() => setShowExportDialog(true)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '11px 20px',
              borderRadius: 12,
              border: 'none',
              background: TEAL_GRADIENT,
              color: '#fff',
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
              boxShadow: '0 6px 16px -6px rgba(15,84,76,0.6)',
              transition: 'all 200ms cubic-bezier(.4,0,.2,1)',
              lineHeight: 1.4,
            }}
            onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 10px 22px -8px rgba(15,84,76,0.7)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = '0 6px 16px -6px rgba(15,84,76,0.6)'; }}
          >
            <Download size={16} />
            Export PDF
          </button>
        )}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 20, padding: '0 28px 28px' }}>
        {error && (
          <div style={{
            padding: '12px 16px',
            borderRadius: 10,
            background: '#FEF2F2',
            border: '1px solid #FECACA',
            color: '#DC2626',
            fontSize: 13,
            fontWeight: 500,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}>
            {error}
          </div>
        )}

        {/* Financial Status & Credit Progress Card */}
        {data && (
          <FinancialStatusCard
            outstandingBalance={outstandingBalance}
            creditLimit={creditLimit}
          />
        )}

        {/* Period Filter Chips */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <PeriodFilterChips active={periodFilter} onChange={setPeriodFilter} />
          <span style={{ fontSize: 12, color: '#94A3B8', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <CalendarDays size={14} />
            {currentStart} to {currentEnd}
          </span>
        </div>

        {/* Transaction Ledger List */}
        {!data ? null : data.transactions.length === 0 ? (
          <EmptyState
            icon={<FileText size={32} />}
            title="No transactions"
            description="No transactions found for the selected period."
          />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            <div style={{
              fontSize: 12,
              fontWeight: 600,
              color: '#64748B',
              paddingLeft: 4,
              paddingRight: 4,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
              flexWrap: 'wrap',
            }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                Transaction Ledger
                <span style={{
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  minWidth: 20, height: 20, padding: '0 7px', borderRadius: 9999,
                  background: 'rgba(15,44,89,0.08)', color: NAVY, fontSize: 11, fontWeight: 700, fontVariantNumeric: 'tabular-nums',
                }}>
                  {data.transactions.length}
                </span>
              </span>
              <span style={{ fontFamily: F, fontVariantNumeric: 'tabular-nums', fontSize: 12, color: '#94A3B8' }}>
                {formatK(data.opening_balance || 0)} → {formatK(data.closing_balance || 0)}
              </span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
              {data.transactions.map((transaction, idx) => (
                <LedgerItem
                  key={`${transaction.date}-${transaction.description}-${idx}`}
                  transaction={transaction}
                  isLast={idx === data.transactions.length - 1}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Export Dialog */}
      <StatementExportDialog
        isOpen={showExportDialog}
        onClose={() => setShowExportDialog(false)}
        data={data || { opening_balance: 0, closing_balance: 0, transactions: [] }}
        startDate={currentStart}
        endDate={currentEnd}
        companyName={companyConfig?.companyName}
        periodFilter={periodFilter}
      />
    </div>
  );
};

export default CustomerAccountStatements;
