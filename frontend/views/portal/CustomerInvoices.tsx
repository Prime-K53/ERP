import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Download, Search, CreditCard, Landmark, FileText, RotateCcw,
  X, Loader2, Receipt, CheckCircle2, AlertTriangle, ShieldCheck,
} from 'lucide-react';
import { portalLifecycle } from '../../services/portalApiClient';

import { usePortalData } from './hooks/usePortalData';
import PortalPageHeader from './components/PortalPageHeader';
import ErrorBanner from './components/ErrorBanner';
import EmptyState from './components/EmptyState';
import PortalLoadingSkeleton from './components/PortalLoadingSkeleton';
import { useToast } from './components/Toast';
import StripePaymentForm from './StripePaymentForm';
import { F, MONO, NAVY, TEAL_GRADIENT, EMERALD } from './designTokens';
import { formatK, MAX_PAGE_SIZE } from './constants';

interface Invoice {
  id: string;
  invoice_number: string;
  customer_name: string;
  total_amount: number;
  paid_amount: number;
  status: string;
  due_date: string;
  created_at: string;
  description?: string;
  reference?: string;
}

type InvoiceTab = 'unpaid' | 'overdue' | 'paid' | 'all';
type PayMethod = 'card' | 'ach' | 'credit';

const stripePublicKey = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY as string | undefined;

const startOfToday = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};

/** Derive the display classification for an invoice. */
const classifyInvoice = (inv: Invoice): 'paid' | 'overdue' | 'partial' | 'unpaid' => {
  const status = String(inv.status || '').toLowerCase().replace(/[\s]+/g, '_');
  if (status === 'paid' || status === 'fulfilled') return 'paid';
  if (status.includes('partial')) return 'partial';
  const isOverdue =
    status.includes('overdue') ||
    (!!inv.due_date && new Date(inv.due_date) < startOfToday());
  return isOverdue ? 'overdue' : 'unpaid';
};

const displayPaid = (inv: Invoice): number => {
  const paid = Number(inv.paid_amount || 0);
  if (paid > 0) return paid;
  return classifyInvoice(inv) === 'paid' ? Number(inv.total_amount || 0) : 0;
};

const amountDue = (inv: Invoice): number =>
  Math.max(0, Number(inv.total_amount || 0) - displayPaid(inv));

const chipMeta = (kind: ReturnType<typeof classifyInvoice>) => {
  switch (kind) {
    case 'paid':
      return { label: 'PAID', color: '#047857', bg: '#D1FAE5', border: '#A7F3D0' };
    case 'overdue':
      return { label: 'OVERDUE', color: '#B91C1C', bg: '#FEE2E2', border: '#FECACA' };
    case 'partial':
      return { label: 'PARTIALLY PAID', color: '#B45309', bg: '#FEF3C7', border: '#FDE68A' };
    default:
      return { label: 'UNPAID', color: '#B45309', bg: '#FEF3C7', border: '#FDE68A' };
  }
};

const PAY_METHODS: { key: PayMethod; label: string; desc: string; icon: React.ReactNode; color: string }[] = [
  { key: 'card', label: 'Credit / Debit Card', desc: 'Pay securely with card', icon: <CreditCard size={16} />, color: '#2563EB' },
  { key: 'ach', label: 'ACH Bank Transfer', desc: 'Routing + account number', icon: <Landmark size={16} />, color: '#059669' },
  { key: 'credit', label: 'Credit Line / Net-30', desc: 'Settle against company credit', icon: <FileText size={16} />, color: '#D97706' },
];

const CustomerInvoices: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { addToast } = useToast();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [search, setSearch] = useState('');

  const initialTab = useMemo<InvoiceTab>(() => {
    const t = searchParams.get('tab') as InvoiceTab | null;
    if (t && ['unpaid', 'overdue', 'paid', 'all'].includes(t)) return t;
    const s = (searchParams.get('status') || '').toLowerCase();
    if (s === 'paid' || s === 'fulfilled') return 'paid';
    if (s === 'overdue') return 'overdue';
    if (s === 'all') return 'all';
    return 'unpaid';
  }, [searchParams]);

  const [tab, setTab] = useState<InvoiceTab>(initialTab);

  // Payment sheet state
  const [payTarget, setPayTarget] = useState<Invoice | null>(null);
  const [payMethod, setPayMethod] = useState<PayMethod>('card');
  const [memo, setMemo] = useState('');
  const [cardNo, setCardNo] = useState('');
  const [cardExpiry, setCardExpiry] = useState('');
  const [cardCvv, setCardCvv] = useState('');
  const [achRouting, setAchRouting] = useState('');
  const [achAccount, setAchAccount] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [payError, setPayError] = useState<string | null>(null);
  const [paySuccess, setPaySuccess] = useState(false);
  const [stripeStep, setStripeStep] = useState<{ clientSecret: string; invoiceDetail: any } | null>(null);

  const { loading, error, refresh, clearError } = usePortalData<any>({
    // Fetch the full billing record (All Invoices tab shows every invoice).
    // The key must exactly match the request URL so the local cache lines up.
    key: `/invoices?page=1&pageSize=${MAX_PAGE_SIZE}`,
    label: 'Invoices',
    fetcher: () => portalLifecycle.invoices.list({ page: 1, pageSize: MAX_PAGE_SIZE }),
    onData: (data: any) => {
      if (Array.isArray(data) && data.length > 0) setInvoices(data);
      else if (data && Array.isArray(data.invoices) && data.invoices.length > 0) setInvoices(data.invoices);
      else setInvoices([]);
    },
  });

  // Realtime refresh for invoices + payments.
  useEffect(() => {
    let cancelled = false;
    let unsub: (() => void) | undefined;
    (async () => {
      unsub = await portalLifecycle.subscribe({
        onEvent: (type, payload) => {
          if (type !== 'entity_changed' || cancelled) return;
          const ev = payload?.event;
          if (
            payload?.docType === 'invoice' ||
            ev === 'payment_allocated' || ev === 'payment_made' ||
            ev === 'payment_recorded' || ev === 'payment_reverted' ||
            ev === 'balance_changed'
          ) {
            refresh();
          }
        },
      });
    })();
    return () => { cancelled = true; unsub?.(); };
  }, [refresh]);

  const counts = useMemo(() => ({
    unpaid: invoices.filter((i) => classifyInvoice(i) !== 'paid').length,
    overdue: invoices.filter((i) => classifyInvoice(i) === 'overdue').length,
    paid: invoices.filter((i) => classifyInvoice(i) === 'paid').length,
    all: invoices.length,
  }), [invoices]);

  const outstandingBalance = useMemo(() => {
    return invoices.reduce((sum, inv) => {
      const kind = classifyInvoice(inv);
      if (kind === 'paid') return sum;
      const due = amountDue(inv);
      return sum + due;
    }, 0);
  }, [invoices]);

  const filtered = useMemo(() => {
    let list = invoices;
    if (tab !== 'all') {
      list = invoices.filter((inv) => {
        const kind = classifyInvoice(inv);
        if (tab === 'paid') return kind === 'paid';
        if (tab === 'overdue') return kind === 'overdue';
        return kind !== 'paid'; // unpaid tab = everything pending
      });
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((inv) =>
        String(inv.invoice_number || '').toLowerCase().includes(q) ||
        String(inv.customer_name || '').toLowerCase().includes(q) ||
        String(inv.total_amount || '').includes(q)
      );
    }
    return [...list].sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());
  }, [invoices, tab, search]);

  const switchTab = (next: InvoiceTab) => {
    setTab(next);
    setSearchParams({ tab: next }, { replace: true });
  };

  const resetPaySheet = () => {
    setPayTarget(null);
    setPayMethod('card');
    setMemo('');
    setCardNo(''); setCardExpiry(''); setCardCvv('');
    setAchRouting(''); setAchAccount('');
    setPayError(null);
    setPaySuccess(false);
    setStripeStep(null);
  };

  const confirmPayment = async () => {
    if (!payTarget) return;
    setSubmitting(true);
    setPayError(null);
    try {
      const due = amountDue(payTarget);
      if (payMethod === 'card') {
        const intent = await portalLifecycle.payments.createIntent(payTarget.id, due, 'USD');
        // Real Stripe flow when configured; otherwise record the payment directly.
        if (intent.mode === 'stripe' && stripePublicKey) {
          const detail = await portalLifecycle.invoices.get(payTarget.id);
          setStripeStep({ clientSecret: intent.clientSecret, invoiceDetail: detail });
          return;
        }
        await portalLifecycle.payments.recordPayment(payTarget.id, due, {
          paymentMethod: 'Card',
          reference: memo.trim() || `Card •••• ${cardNo.replace(/\s+/g, '').slice(-4)}`,
        });
      } else if (payMethod === 'ach') {
        await portalLifecycle.payments.recordPayment(payTarget.id, due, {
          paymentMethod: 'ACH',
          reference: memo.trim() || `ACH •••• ${achAccount.slice(-4)}`,
        });
      } else {
        await portalLifecycle.payments.recordPayment(payTarget.id, due, {
          paymentMethod: 'Credit Line',
          reference: memo.trim() || 'Credit Line / Net-30',
        });
      }
      setPaySuccess(true);
      addToast('success', 'Payment recorded — invoice settled');
      refresh();
      window.setTimeout(() => resetPaySheet(), 1500);
    } catch (err: any) {
      setPayError(err.message || 'Payment failed. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <div style={{ padding: 16, maxWidth: 680, marginInline: 'auto' }}><PortalLoadingSkeleton type="table" count={8} /></div>;

  const emptyCopy: Record<InvoiceTab, { title: string; desc: string }> = {
    unpaid: { title: 'No unpaid invoices', desc: 'You are all caught up. New invoices will appear here.' },
    overdue: { title: 'Nothing overdue', desc: 'Great job — no past-due invoices right now.' },
    paid: { title: 'No paid invoices yet', desc: 'Invoices you settle will appear here.' },
    all: { title: 'No invoices yet', desc: 'Your billing history will appear here.' },
  };

  return (
    <div className="px-3 sm:px-4" style={{ fontFamily: F, fontSize: 13.5, lineHeight: 1.45, color: '#1E293B' }}>
      {error && <ErrorBanner message={error} onDismiss={clearError} onRetry={refresh} />}

      {/* Top Bar Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16,
        margin: '4px 0 18px',
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
            <h1 style={{ fontSize: 21, fontWeight: 700, color: '#0F172A', margin: 0, letterSpacing: '-0.02em', lineHeight: 1.25 }}>Invoices</h1>
            <p style={{ fontSize: 13, fontWeight: 500, color: '#64748B', margin: '3px 0 0', lineHeight: 1.4 }}>Billing, payments, and outstanding balances</p>
          </div>
        </div>
      </div>

      {/* Total Outstanding Balance */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '0 0 18px' }}>
        <div>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total Outstanding Balance</div>
          <div style={{ fontSize: 28, fontWeight: 800, color: '#0F172A', fontFamily: F, fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em', marginTop: 2 }}>{formatK(outstandingBalance)}</div>
        </div>
        <div style={{
          width: 44, height: 44, borderRadius: 12,
          background: '#F8FAFC', border: '1px solid #E2E8F0',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#64748B',
        }}>
          <Receipt size={22} />
        </div>
      </div>

      {/* Status tabs */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
        {([['unpaid', 'Unpaid'], ['overdue', 'Overdue'], ['paid', 'Paid'], ['all', 'All Invoices']] as [InvoiceTab, string][]).map(([key, label]) => {
          const active = tab === key;
          return (
            <button
              key={key}
              onClick={() => switchTab(key)}
              style={{
                padding: '8px 16px', borderRadius: 9999,
                border: active ? '1px solid transparent' : '1px solid #E2E8F0',
                background: active ? TEAL_GRADIENT : 'rgba(255,255,255,0.9)',
                color: active ? '#fff' : '#475569',
                fontSize: 11.5, fontWeight: 700, letterSpacing: '0.05em',
                cursor: 'pointer', transition: 'all 200ms cubic-bezier(.4,0,.2,1)',
                boxShadow: active ? '0 4px 14px -4px rgba(15,84,76,0.55)' : '0 1px 2px rgba(15,23,42,0.04)',
                transform: active ? 'translateY(-1px)' : 'none', lineHeight: 1.4,
              }}
            >
              {label}
              <span style={{
                marginLeft: 6, fontSize: 10, fontWeight: 700, borderRadius: 8, padding: '1px 7px',
                background: active ? 'rgba(255,255,255,.18)' : '#F1F5F9', color: active ? '#fff' : '#64748B',
              }}>
                {counts[key]}
              </span>
            </button>
          );
        })}
      </div>

      {/* Search */}
      <div style={{ position: 'relative', marginBottom: 14 }}>
        <Search size={16} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: '#8A94A6' }} />
        <input
          type="text"
          placeholder="Search invoice number, notes, or amount..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{
            width: '100%', padding: '10px 14px 10px 40px', borderRadius: 12,
            background: '#fff', border: '1px solid #E2E8F0', fontSize: 13, color: '#1A202C', outline: 'none',
            boxShadow: '0 1px 3px rgba(15,23,42,0.04)', fontFamily: F,
          }}
        />
      </div>

      {/* Invoice list — flat rows, no cards */}
      {filtered.length === 0 ? (
        <EmptyState icon={<Receipt size={32} />} title={emptyCopy[tab].title} description={emptyCopy[tab].desc} />
      ) : (
        <div>
          {filtered.map((inv, index) => {
            const kind = classifyInvoice(inv);
            const chip = chipMeta(kind);
            const due = amountDue(inv);
            const isLast = index === filtered.length - 1;

            return (
              <div
                key={inv.id}
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
                      <div style={{ fontSize: 15, fontWeight: 700, color: '#0F172A', margin: 0, lineHeight: 1.3, fontFamily: MONO, fontVariantNumeric: 'tabular-nums' }}>
                        {inv.invoice_number}
                      </div>
                      <div style={{ fontSize: 12, color: '#64748B', marginTop: 2 }}>
                        Issue Date: {inv.created_at ? new Date(inv.created_at).toLocaleDateString() : '—'} · Due: {inv.due_date ? new Date(inv.due_date).toLocaleDateString() : '—'}
                      </div>
                    </div>
                    <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', color: chip.color, background: chip.bg, border: `1px solid ${chip.border}`, padding: '4px 10px', borderRadius: 9999, textTransform: 'uppercase', flexShrink: 0, lineHeight: 1.4 }}>
                      {chip.label}
                    </span>
                  </div>

                  {inv.description && (
                    <div style={{ fontSize: 13, color: '#334155', lineHeight: 1.5 }}>
                      {inv.description}
                    </div>
                  )}

                  {inv.reference && (
                    <div style={{ fontSize: 12, color: '#94A3B8', lineHeight: 1.4 }}>
                      {inv.reference}
                    </div>
                  )}

                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', marginTop: 4 }}>
                      <div style={{ fontSize: 15, fontWeight: 800, color: '#0F172A', fontFamily: F, fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.01em' }}>
                      {formatK(due > 0 ? due : inv.total_amount)}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <button
                        onClick={() => navigate(`/portal/invoices/${inv.id}`)}
                        aria-label="Download PDF"
                        title="Download PDF"
                        style={{
                          height: 34, padding: '0 12px', borderRadius: 9,
                          border: '1px solid #E2E8F0', background: '#fff', color: '#4A5568',
                          cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6,
                          fontSize: 12, fontWeight: 600,
                        }}
                      >
                        <Download size={15} />
                        <span>PDF</span>
                      </button>
                      {kind !== 'paid' && (
                        <button
                          onClick={() => { setPayTarget(inv); setPayError(null); setPaySuccess(false); }}
                          style={{
                            display: 'inline-flex', alignItems: 'center', gap: 6,
                            padding: '8px 16px', borderRadius: 9, border: 'none',
                            background: TEAL_GRADIENT, color: '#fff',
                            fontSize: 12, fontWeight: 700, cursor: 'pointer',
                            boxShadow: '0 4px 12px -4px rgba(15,84,76,0.55)',
                            transition: 'transform .15s ease',
                          }}
                          onMouseEnter={(e) => { e.currentTarget.style.transform = 'scale(1.02)'; }}
                          onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
                        >
                          <CreditCard size={14} />Pay Now
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Payment Bottom Sheet ── */}
      {payTarget && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 1200, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(15,23,42,.45)', backdropFilter: 'blur(2px)' }} onClick={() => !submitting && resetPaySheet()} />
          <div style={{
            position: 'relative', width: '100%', maxWidth: 500, background: '#fff',
            borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '92vh', overflowY: 'auto',
            padding: '16px 18px 20px', boxShadow: '0 -12px 40px rgba(0,0,0,.2)',
            fontFamily: F,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <div>
                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#0F172A' }}>Pay Invoice</h3>
                <p style={{ margin: '2px 0 0', fontSize: 11.5, color: '#64748B' }}>
                  {payTarget.invoice_number} · {formatK(amountDue(payTarget))} due
                </p>
              </div>
              <button onClick={resetPaySheet} aria-label="Close" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94A3B8', padding: 4, borderRadius: 8 }}><X size={18} /></button>
            </div>

            {stripeStep ? (
              <StripePaymentForm
                clientSecret={stripeStep.clientSecret}
                invoice={stripeStep.invoiceDetail}
                onSuccess={() => {
                  addToast('success', 'Payment successful!');
                  refresh();
                  window.setTimeout(() => resetPaySheet(), 1200);
                }}
                onCancel={() => setStripeStep(null)}
              />
            ) : (
              <>
                {/* Method selector */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
                  {PAY_METHODS.map((m) => {
                    const active = payMethod === m.key;
                    return (
                      <button
                        key={m.key}
                        onClick={() => setPayMethod(m.key)}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 12, textAlign: 'left', width: '100%',
                          padding: '11px 14px', borderRadius: 12, cursor: 'pointer',
                          border: active ? `1.5px solid ${m.color}` : '1px solid #E9EDF3',
                          background: active ? `${m.color}0D` : '#fff',
                          transition: 'all .15s ease',
                        }}
                      >
                        <div style={{ width: 32, height: 32, borderRadius: 9, background: `${m.color}14`, color: m.color, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          {m.icon}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 12.5, fontWeight: 700, color: '#1A202C' }}>{m.label}</div>
                          <div style={{ fontSize: 10.5, color: '#8A94A6', marginTop: 1 }}>{m.desc}</div>
                        </div>
                        <span style={{ width: 18, height: 18, borderRadius: '50%', border: active ? `5px solid ${m.color}` : '1.5px solid #CBD5E0', flexShrink: 0, transition: 'all .15s ease' }} />
                      </button>
                    );
                  })}
                </div>

                {/* Dynamic fields */}
                {payMethod === 'card' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 14 }}>
                    <div>
                      <label style={{ fontSize: 12, fontWeight: 600, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Card Number</label>
                      <input
                        value={cardNo}
                        onChange={(e) => setCardNo(e.target.value.replace(/[^\d\s]/g, '').slice(0, 19))}
                        placeholder="4242 4242 4242 4242"
                        inputMode="numeric"
                        style={{ width: '100%', marginTop: 4, padding: '9px 12px', borderRadius: 10, border: '1px solid #E9EDF3', fontSize: 13, fontFamily: "'JetBrains Mono', monospace", outline: 'none' }}
                      />
                    </div>
                    <div style={{ display: 'flex', gap: 10 }}>
                      <div style={{ flex: 1 }}>
                        <label style={{ fontSize: 12, fontWeight: 600, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Expiry</label>
                        <input
                          value={cardExpiry}
                          onChange={(e) => setCardExpiry(e.target.value.replace(/[^\d/]/g, '').slice(0, 5))}
                          placeholder="MM/YY"
                          inputMode="numeric"
                          style={{ width: '100%', marginTop: 4, padding: '9px 12px', borderRadius: 10, border: '1px solid #E9EDF3', fontSize: 13, fontFamily: "'JetBrains Mono', monospace", outline: 'none' }}
                        />
                      </div>
                      <div style={{ flex: 1 }}>
                        <label style={{ fontSize: 12, fontWeight: 600, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.04em' }}>CVV</label>
                        <input
                          value={cardCvv}
                          onChange={(e) => setCardCvv(e.target.value.replace(/\D/g, '').slice(0, 4))}
                          placeholder="•••"
                          type="password"
                          inputMode="numeric"
                          style={{ width: '100%', marginTop: 4, padding: '9px 12px', borderRadius: 10, border: '1px solid #E9EDF3', fontSize: 13, fontFamily: "'JetBrains Mono', monospace", outline: 'none' }}
                        />
                      </div>
                    </div>
                  </div>
                )}

                {payMethod === 'ach' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 14 }}>
                    <div>
                      <label style={{ fontSize: 12, fontWeight: 600, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Routing Number</label>
                      <input
                        value={achRouting}
                        onChange={(e) => setAchRouting(e.target.value.replace(/\D/g, '').slice(0, 9))}
                        placeholder="9-digit routing number"
                        inputMode="numeric"
                        style={{ width: '100%', marginTop: 4, padding: '9px 12px', borderRadius: 10, border: '1px solid #E9EDF3', fontSize: 13, fontFamily: "'JetBrains Mono', monospace", outline: 'none' }}
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: 12, fontWeight: 600, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Account Number</label>
                      <input
                        value={achAccount}
                        onChange={(e) => setAchAccount(e.target.value.replace(/[^\d]/g, '').slice(0, 17))}
                        placeholder="Account number"
                        inputMode="numeric"
                        style={{ width: '100%', marginTop: 4, padding: '9px 12px', borderRadius: 10, border: '1px solid #E9EDF3', fontSize: 13, fontFamily: "'JetBrains Mono', monospace", outline: 'none' }}
                      />
                    </div>
                  </div>
                )}

                {payMethod === 'credit' && (
                  <div style={{ marginBottom: 14, padding: '11px 14px', borderRadius: 12, background: '#FFFBEB', border: '1px solid #FDE68A', fontSize: 11.5, color: '#92400E', lineHeight: 1.5, display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                    <ShieldCheck size={15} style={{ flexShrink: 0, marginTop: 1 }} />
                    <span>Settles this invoice against your company credit line / Net-30 account. Available credit will be adjusted immediately.</span>
                  </div>
                )}

                {/* Summary */}
                <div style={{ borderRadius: 12, border: '1px solid #E9EDF3', padding: '12px 14px', marginBottom: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                    <span style={{ color: '#64748B' }}>Invoice</span>
                    <span style={{ color: '#1A202C', fontWeight: 600 }}>{payTarget.invoice_number}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginTop: 6 }}>
                    <span style={{ color: '#64748B' }}>Total Amount</span>
                    <span style={{ color: '#1A202C', fontWeight: 600, fontFamily: "'JetBrains Mono', monospace" }}>{formatK(payTarget.total_amount)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 15, fontWeight: 800, marginTop: 8, paddingTop: 8, borderTop: '1px solid #F1F5F9' }}>
                    <span style={{ color: '#0F172A' }}>Amount Due</span>
                    <span style={{ color: '#DC2626', fontFamily: "'JetBrains Mono', monospace" }}>{formatK(amountDue(payTarget))}</span>
                  </div>
                </div>

                <textarea
                  value={memo}
                  onChange={(e) => setMemo(e.target.value)}
                  placeholder="Payment memo (optional)"
                  rows={2}
                  style={{ width: '100%', padding: '9px 12px', borderRadius: 10, border: '1px solid #E9EDF3', fontSize: 12.5, color: '#1A202C', outline: 'none', resize: 'none', marginBottom: 12, fontFamily: F }}
                />

                {payError && <ErrorBanner message={payError} onDismiss={() => setPayError(null)} />}
                {paySuccess && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', borderRadius: 10, background: '#ECFDF5', border: '1px solid #A7F3D0', color: '#047857', fontSize: 12.5, fontWeight: 600, marginBottom: 12 }}>
                    <CheckCircle2 size={16} /> Payment recorded successfully
                  </div>
                )}

                <button
                  onClick={confirmPayment}
                  disabled={submitting}
                  style={{
                    width: '100%', padding: '12px 16px', borderRadius: 12, border: 'none',
                    background: submitting ? '#9CA3AF' : 'linear-gradient(135deg,#059669,#047857)',
                    color: '#fff', fontSize: 13.5, fontWeight: 700, cursor: submitting ? 'not-allowed' : 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                    boxShadow: '0 6px 16px -6px rgba(5,150,105,.55)',
                  }}
                >
                  {submitting ? <><Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} /> Processing…</> : <>Confirm Payment <ShieldCheck size={15} /></>}
                </button>
              </>
            )}
          </div>
        </div>
      )}

    </div>
  );
};

export default CustomerInvoices;
