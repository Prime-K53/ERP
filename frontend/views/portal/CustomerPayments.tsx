import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Receipt, Search, Download, ExternalLink } from 'lucide-react';
import JsBarcode from 'jsbarcode';
import { portalLifecycle, buildQueryString } from '../../services/portalApiClient';

import { usePortalData } from './hooks/usePortalData';
import ErrorBanner from './components/ErrorBanner';
import EmptyState from './components/EmptyState';
import PortalLoadingSkeleton from './components/PortalLoadingSkeleton';
import { DEFAULT_PAGE_SIZE, formatK } from './constants';
import { F, MONO, NAVY, TEAL_GRADIENT } from './designTokens';

interface Payment {
  id: string;
  amount: number;
  payment_method: string;
  date: string;
  reference: string;
  invoice_number?: string;
  order_number?: string;
}

type ReceiptTab = 'all' | 'month' | 'year';

const CustomerPayments: React.FC = () => {
  const navigate = useNavigate();
  const [payments, setPayments] = useState<Payment[]>([]);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [tab, setTab] = useState<ReceiptTab>('all');
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [barcodeUrls, setBarcodeUrls] = useState<Record<string, string>>({});

  type PaymentListResponse = { payments: Payment[]; totalPages: number; total: number } | Payment[];

  const paymentsQuery = buildQueryString({ page, pageSize: DEFAULT_PAGE_SIZE, search: search || undefined });
  const paymentsEndpoint = paymentsQuery ? `/payments?${paymentsQuery}` : '/payments';

  const { loading, error, refresh, clearError } = usePortalData<PaymentListResponse>({
    key: paymentsEndpoint,
    label: 'Receipts',
    fetcher: () => portalLifecycle.payments.list({ page, pageSize: DEFAULT_PAGE_SIZE, search: search || undefined }),
    onData: (data) => {
      if ('payments' in data && data.payments.length > 0) {
        setPayments(data.payments);
        setTotalPages(data.totalPages);
        setTotal(data.total);
      } else if (Array.isArray(data) && data.length > 0) {
        setPayments(data);
        setTotalPages(1);
        setTotal(data.length);
      } else {
        setPayments([]);
        setTotalPages(1);
        setTotal(0);
      }
    },
  });

  const now = new Date();
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();

  const counts = useMemo(() => {
    if (!payments.length) return { all: 0, month: 0, year: 0 };
    return {
      all: payments.length,
      month: payments.filter((p) => new Date(p.date).getMonth() === currentMonth && new Date(p.date).getFullYear() === currentYear).length,
      year: payments.filter((p) => new Date(p.date).getFullYear() === currentYear).length,
    };
  }, [payments]);

  const filtered = useMemo(() => {
    let list = payments;
    if (tab === 'month') {
      list = list.filter((p) => new Date(p.date).getMonth() === currentMonth && new Date(p.date).getFullYear() === currentYear);
    } else if (tab === 'year') {
      list = list.filter((p) => new Date(p.date).getFullYear() === currentYear);
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((p) =>
        String(p.reference || '').toLowerCase().includes(q) ||
        String(p.payment_method || '').toLowerCase().includes(q) ||
        String(p.amount || '').includes(q) ||
        String(p.invoice_number || '').toLowerCase().includes(q) ||
        String(p.order_number || '').toLowerCase().includes(q)
      );
    }
    return [...list].sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime());
  }, [payments, tab, search, currentMonth, currentYear]);

  const totalPaid = useMemo(() => filtered.reduce((sum, p) => sum + Number(p.amount || 0), 0), [filtered]);

  const switchTab = (next: ReceiptTab) => {
    setTab(next);
    setPage(1);
  };

  useEffect(() => {
    let cancelled = false;
    let unsubscribe: (() => void) | undefined;
    (async () => {
      unsubscribe = await portalLifecycle.subscribe({
        onEvent: (type, payload) => {
          if (type !== 'entity_changed' || cancelled) return;
          const event = payload?.event;
          if (event === 'payment_allocated' || event === 'payment_recorded' || event === 'payment_made' || event === 'balance_changed') refresh();
        },
      });
    })();
    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [refresh]);

   useEffect(() => {
     let cancelled = false;
     (async () => {
       const urls: Record<string, string> = {};
       for (const p of filtered) {
         try {
           const canvas = document.createElement('canvas');
           JsBarcode(canvas, p.reference || p.id, {
             format: 'CODE128',
             width: 2,
             height: 50,
             displayValue: true,
             fontSize: 10,
             margin: 4,
             background: '#ffffff',
             lineColor: '#0F172A',
           });
           if (!cancelled) urls[p.id] = canvas.toDataURL('image/png');
         } catch {
           // ignore barcode generation failures
         }
       }
       if (!cancelled) setBarcodeUrls(urls);
     })();
     return () => { cancelled = true; };
   }, [filtered]);

  if (loading && page === 1) return <div style={{ padding: 32, maxWidth: 896, margin: '0 auto' }}><PortalLoadingSkeleton type="table" count={6} /></div>;

  const rowBase: React.CSSProperties = {
    paddingTop: 10,
    paddingBottom: 10,
    paddingLeft: 12,
    paddingRight: 12,
    borderLeft: '3px solid transparent',
    borderRadius: 8,
    background: '#fff',
    transition: 'all 200ms cubic-bezier(.4,0,.2,1)',
    cursor: 'pointer',
  };

  return (
    <div style={{ fontFamily: F, fontSize: 13.5, lineHeight: 1.45, color: '#1E293B' }}>
      {error && <ErrorBanner message={error} onDismiss={clearError} onRetry={refresh} />}

      {/* Header */}
      <div style={{ padding: '0 0 16px' }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: '#0F172A', margin: '0 0 6px', letterSpacing: '-0.01em', lineHeight: 1.3 }}>Receipt</h1>
        <p style={{ fontSize: 13, fontWeight: 500, color: '#64748B', margin: 0, lineHeight: 1.5 }}>Payment receipts and transaction history</p>
      </div>

      {/* Total Paid */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '0 0 18px' }}>
        <div>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total Paid</div>
          <div style={{ fontSize: 28, fontWeight: 800, color: '#0F172A', fontFamily: F, fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em', marginTop: 2 }}>{formatK(totalPaid)}</div>
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

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
        {([
          ['all', 'All Receipts'],
          ['month', 'This Month'],
          ['year', 'This Year'],
        ] as [ReceiptTab, string][]).map(([key, label]) => {
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
          placeholder="Search receipts..."
          value={search}
          onChange={(e) => { setPage(1); setSearch(e.target.value); }}
          style={{
            width: '100%', padding: '10px 14px 10px 40px', borderRadius: 12,
            background: '#fff', border: '1px solid #E2E8F0', fontSize: 13, color: '#1A202C', outline: 'none',
            boxShadow: '0 1px 3px rgba(15,23,42,0.04)', fontFamily: F,
          }}
        />
      </div>

      {/* Receipt list */}
      {filtered.length === 0 ? (
        <EmptyState icon={<Receipt size={32} />} title="No receipts found" description={search || tab !== 'all' ? 'No receipts match your filters.' : 'Your payment receipts will appear here.'} />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {filtered.map((p, index) => {
            const isLast = index === filtered.length - 1;
            const dateStr = p.date ? new Date(p.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';
            const refParts = [
              p.invoice_number ? `INV-${p.invoice_number}` : null,
              p.order_number ? `ORD-${p.order_number}` : null,
            ].filter(Boolean);
            const refText = refParts.length > 0 ? refParts.join(', ') : (p.reference || p.id.slice(0, 8));

            return (
              <div
                key={p.id}
                style={{
                  ...rowBase,
                  borderBottom: isLast ? 'none' : '1px solid #F1F5F9',
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
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0, flex: 1 }}>
                    <div style={{ fontSize: 15, fontWeight: 700, color: '#0F172A', lineHeight: 1.3, fontFamily: MONO, fontVariantNumeric: 'tabular-nums' }}>
                      {p.reference || p.id.slice(0, 8)}
                    </div>
                    <div style={{ fontSize: 12, color: '#64748B', lineHeight: 1.4 }}>
                      Ref: {refText}
                    </div>
                    <div style={{ fontSize: 12, color: '#64748B', lineHeight: 1.4 }}>
                      {dateStr}
                    </div>
                  </div>
                  {barcodeUrls[p.id] && (
                    <img src={barcodeUrls[p.id]} alt="Receipt barcode" style={{ height: 48, width: 'auto', display: 'block', flexShrink: 0 }} />
                  )}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8, flexShrink: 0 }}>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 15, fontWeight: 800, color: '#0F172A', fontFamily: MONO, fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.01em' }}>
                      {formatK(Number(p.amount))}
                    </div>
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); navigate(`/portal/payments/${p.id}`); }}
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: 6,
                      padding: '6px 10px', borderRadius: 8,
                      fontSize: 11, fontWeight: 600,
                      border: '1px solid #E2E8F0', background: '#fff',
                      color: '#4A5568', cursor: 'pointer',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    <ExternalLink size={12} /> View
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      navigate(`/portal/payments/${p.id}`);
                    }}
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: 6,
                      padding: '6px 10px', borderRadius: 8,
                      fontSize: 11, fontWeight: 600,
                      border: 'none',
                      cursor: 'pointer',
                      background: '#0F2C59', color: '#fff',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    <Download size={12} />
                    PDF
                  </button>
                </div>
              </div>
              </div>
            );
          })}
        </div>
      )}

      {totalPages > 1 && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 16, fontSize: 12, color: '#8A94A6', fontWeight: 600 }}>
          <span>Page {page} of {totalPages}</span>
          <div style={{ display: 'flex', gap: 6 }}>
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1} style={{ padding: '6px 14px', borderRadius: 8, fontSize: 12, fontWeight: 600, border: '1px solid #E9EDF3', background: '#fff', color: '#4A5568', cursor: page <= 1 ? 'not-allowed' : 'pointer', opacity: page <= 1 ? 0.5 : 1, lineHeight: 1.4 }}>Previous</button>
            <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages} style={{ padding: '6px 14px', borderRadius: 8, fontSize: 12, fontWeight: 600, border: '1px solid #E9EDF3', background: '#fff', color: '#4A5568', cursor: page >= totalPages ? 'not-allowed' : 'pointer', opacity: page >= totalPages ? 0.5 : 1, lineHeight: 1.4 }}>Next</button>
          </div>
        </div>
      )}
    </div>
  );
};

export default CustomerPayments;
