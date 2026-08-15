import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileText, Search, CheckCircle2, ChevronRight, RefreshCw, ClipboardList } from 'lucide-react';
import { portalLifecycle, QuotationRecord } from '../../services/portalApiClient';

import PortalInput from './components/PortalInput';
import EmptyState from './components/EmptyState';
import PortalLoadingSkeleton from './components/PortalLoadingSkeleton';
import { DEFAULT_PAGE_SIZE, FRIENDLY_STATUS_MAP } from './constants';
import { F, MONO } from './designTokens';

type Tab = 'all' | 'pending' | 'quoted' | 'approved';

const TABS: { key: Tab; label: string }[] = [
  { key: 'all', label: 'ALL' },
  { key: 'pending', label: 'PENDING' },
  { key: 'quoted', label: 'QUOTED' },
  { key: 'approved', label: 'APPROVED' },
];

const STATUS_TO_TAB: Record<string, Tab> = {
  all: 'all',
  ready: 'pending',
  revision_requested: 'pending',
  accepted: 'approved',
  converted: 'approved',
  expired: 'expired',
  rejected: 'expired',
};

const CustomerQuotations: React.FC = () => {
  const navigate = useNavigate();
  const [quotations, setQuotations] = useState<QuotationRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState<Tab>('all');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [acceptingId, setAcceptingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await portalLifecycle.quotations.list({ page, pageSize: DEFAULT_PAGE_SIZE, search: search || undefined });
      if ('quotations' in data && (data as any).quotations.length > 0) {
        setQuotations((data as any).quotations);
        setTotalPages((data as any).totalPages);
        setTotal((data as any).total);
      } else if (Array.isArray(data) && data.length > 0) {
        setQuotations(data as QuotationRecord[]);
        setTotalPages(1);
        setTotal((data as QuotationRecord[]).length);
      } else {
        setQuotations([]);
        setTotalPages(1);
        setTotal(0);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load quotations');
    } finally {
      setLoading(false);
    }
  }, [page, search]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    let cancelled = false;
    let unsubscribe: (() => void) | undefined;
    (async () => {
      unsubscribe = await portalLifecycle.subscribe({
        onEvent: (type, payload) => {
          if (type === 'entity_changed' && payload.docType === 'quotation' && !cancelled) load();
        },
      });
    })();
    return () => { cancelled = true; unsubscribe?.(); };
  }, [load]);

  const handleAccept = useCallback(async (q: QuotationRecord) => {
    setAcceptingId(q.id);
    try {
      await portalLifecycle.quotations.accept(q.id);
      await load();
    } catch (err: any) {
      setError(err.message || 'Failed to accept quotation');
    } finally {
      setAcceptingId(null);
    }
  }, [load]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return quotations.filter((item) => {
      const matchesSearch = !q ||
        (item.quotation_number || '').toLowerCase().includes(q) ||
        (item as any).project_title?.toLowerCase().includes(q) ||
        (item.items || []).some((i) => (i.name || '').toLowerCase().includes(q));
      const matchesTab = tab === 'all' || STATUS_TO_TAB[item.status] === tab;
      return matchesSearch && matchesTab;
    });
  }, [quotations, search, tab]);

  const formatCurrency = (value: number) =>
    value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const formatDate = (dateStr: string) =>
    new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  const getStatusLabel = (status: string) => {
    const s = (status || '').toLowerCase();
    if (s === 'ready' || s === 'revision_requested') return 'PENDING';
    if (s === 'accepted' || s === 'converted') return 'APPROVED';
    if (s === 'expired' || s === 'rejected') return 'EXPIRED';
    return (FRIENDLY_STATUS_MAP[status] || status).toUpperCase();
  };

  if (loading && page === 1) return <div style={{ padding: 32, maxWidth: 896, margin: '0 auto' }}><PortalLoadingSkeleton type="table" count={6} /></div>;

  return (
    <div style={{ fontFamily: F, fontSize: 13.5, lineHeight: 1.45, color: '#1E293B', minHeight: '100vh' }}>
      <div style={{ padding: '0 28px 28px' }}>
        {error && (
          <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', color: '#B91C1C', borderRadius: 10, padding: '10px 14px', fontSize: 12.5, marginBottom: 10, lineHeight: 1.4 }}>{error}</div>
        )}

        {/* Header */}
        <div style={{ padding: '20px 0 16px' }}>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: '#0F172A', margin: '0 0 6px', letterSpacing: '-0.01em', lineHeight: 1.3 }}>Quotations & Bids</h1>
          <p style={{ fontSize: 13, fontWeight: 500, color: '#64748B', margin: 0, lineHeight: 1.5 }}>Request custom pricing, bulk volume discounts, or engineered item proposals.</p>
        </div>

        {/* Filter tabs */}
        <div style={{ display: 'flex', gap: 8, padding: '8px 0', borderBottom: '1px solid #E9EDF3', marginBottom: 16 }}>
          {TABS.map((t) => {
            const active = tab === t.key;
            return (
              <button
                key={t.key}
                onClick={() => { setTab(t.key); setPage(1); }}
                style={{
                  padding: '7px 16px', borderRadius: 8,
                  border: active ? '1px solid transparent' : '1px solid #E2E8F0',
                  background: active ? '#0F2C59' : '#fff',
                  color: active ? '#fff' : '#475569',
                  fontSize: 12, fontWeight: 700, letterSpacing: '0.05em',
                  cursor: 'pointer', transition: 'all .15s ease', lineHeight: 1.4,
                }}
              >
                {t.label}
              </button>
            );
          })}
        </div>

        {/* Search */}
        <div style={{ position: 'relative', marginBottom: 16 }}>
          <Search size={16} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: '#8A94A6' }} />
          <PortalInput label="" placeholder="Search by quote #, project, or item description..." value={search} onChange={(v) => { setPage(1); setSearch(v); }} onFocus={() => {}} onBlur={() => {}} style={{ paddingLeft: 40 }} />
        </div>

        {/* Quotation List */}
        {filtered.length === 0 ? (
          <EmptyState icon={<FileText size={28} />} title="No quotations found" description={search ? 'Try adjusting your search or filters.' : 'Your quotations will appear here once created.'} />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {filtered.map((q) => {
              const quotationNumber = q.quotation_number || q.id.slice(0, 8);
              const requestedDate = q.created_at ? formatDate(q.created_at) : '—';
              const category = (q as any).project_title || (q as any).title || 'General';
              const targetQty = (q.items || []).reduce((sum, i) => sum + Number(i.quantity || 0), 0);
              const description = (q.items || []).map(i => i.name).filter(Boolean).join(', ') || (q as any).notes || '';
              const quotedPrice = Number(q.total || (q as any).total_amount || 0);
              const reviewNote = (q as any).review_note as string | null | undefined;
              const isPending = q.status === 'ready' || q.status === 'revision_requested';

              return (
                <div
                  key={q.id}
                  style={{
                    padding: '18px 12px',
                    borderBottom: '1px solid #F1F5F9',
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
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 6 }}>
                    <div style={{ fontSize: 15, fontWeight: 700, color: '#1A202C', fontFamily: MONO, fontVariantNumeric: 'tabular-nums' }}>{quotationNumber}</div>
                    <span style={{
                      fontSize: 10, fontWeight: 700, letterSpacing: '0.05em',
                      padding: '3px 10px', borderRadius: 6,
                      border: '1px solid #E2E8F0',
                      color: '#64748B',
                      whiteSpace: 'nowrap',
                    }}>
                      {getStatusLabel(q.status)}
                    </span>
                  </div>

                  <div style={{ fontSize: 12, color: '#64748B', marginBottom: 4 }}>Requested Date: {requestedDate}</div>

                  <div style={{ fontSize: 13.5, color: '#374151', marginBottom: 4 }}>
                    Target Qty: {targetQty.toLocaleString()} units
                  </div>

                  {description && (
                    <div style={{ fontSize: 13, color: '#6B7280', lineHeight: 1.5, marginBottom: 12 }}>{description}</div>
                  )}

                  {quotedPrice > 0 && (
                    <div style={{ borderTop: '1px solid #F1F5F9', paddingTop: 12, marginTop: 4, marginBottom: 12 }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                        <div style={{ fontSize: 14, fontWeight: 700, color: '#1A202C' }}>Sales Quoted Price:</div>
                        <div style={{ fontSize: 18, fontWeight: 700, color: '#1A202C', fontFamily: F, fontVariantNumeric: 'tabular-nums' }}>${formatCurrency(quotedPrice)}</div>
                      </div>
                      {reviewNote && (
                        <div style={{ fontSize: 12, color: '#64748B', lineHeight: 1.5, marginBottom: 4 }}>{reviewNote}</div>
                      )}
                      <div style={{ fontSize: 12, color: '#64748B', lineHeight: 1.5 }}>Production lead time 7 business days.</div>
                    </div>
                  )}

                  {isPending && (
                    <button
                      onClick={() => handleAccept(q)}
                      disabled={acceptingId === q.id}
                      style={{
                        width: '100%',
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                        padding: '11px 16px', borderRadius: 10, border: 'none',
                        background: '#0F2C59', color: '#fff',
                        fontSize: 13, fontWeight: 700,
                        cursor: acceptingId === q.id ? 'not-allowed' : 'pointer',
                        opacity: acceptingId === q.id ? 0.7 : 1,
                        marginTop: 4,
                      }}
                    >
                      {acceptingId === q.id ? (
                        <span style={{ width: 14, height: 14, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
                      ) : (
                        <CheckCircle2 size={16} />
                      )}
                      {acceptingId === q.id ? 'Accepting...' : 'Accept Quote & Place Order'}
                    </button>
                  )}
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
    </div>
  );
};

export default CustomerQuotations;
