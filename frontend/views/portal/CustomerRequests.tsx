import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ClipboardList, Plus, Loader2, ArrowUpRight, Search, RefreshCw,
  Trash2, ChevronRight, FileText, X, PackageCheck, MessageSquare,
} from 'lucide-react';
import { portalLifecycle, QuotationRequestRecord } from '../../services/portalApiClient';
import { useToast } from './components/Toast';
import PortalPageHeader from './components/PortalPageHeader';
import PortalInput from './components/PortalInput';
import EmptyState from './components/EmptyState';
import PortalLoadingSkeleton from './components/PortalLoadingSkeleton';
import ConfirmDialog from './components/ConfirmDialog';
import { DEFAULT_PAGE_SIZE, FRIENDLY_STATUS_MAP, REQUEST_STATUS_META } from './constants';
import { F, MONO } from './portalStyles';

type RequestTab = 'all' | 'pending' | 'converted' | 'cancelled';

const TABS: { key: RequestTab; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'pending', label: 'Pending' },
  { key: 'converted', label: 'Converted' },
  { key: 'cancelled', label: 'Cancelled' },
];

const STATUS_TO_TAB: Record<string, RequestTab> = {
  submitted: 'pending',
  assigned: 'pending',
  under_review: 'pending',
  waiting_for_customer: 'pending',
  ready_for_conversion: 'pending',
  converted: 'converted',
  rejected: 'cancelled',
  cancelled: 'cancelled',
};

const CustomerRequests: React.FC = () => {
  const navigate = useNavigate();
  const { addToast } = useToast();
  const [requests, setRequests] = useState<QuotationRequestRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState<RequestTab>('all');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  const [detailRequest, setDetailRequest] = useState<QuotationRequestRecord | null>(null);
  const [cancelTarget, setCancelTarget] = useState<QuotationRequestRecord | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await portalLifecycle.requests.list({ page, pageSize: DEFAULT_PAGE_SIZE, search: search || undefined });
      if ('requests' in data && data.requests.length > 0) {
        setRequests(data.requests);
        setTotalPages(data.totalPages);
        setTotal(data.total);
      } else if (Array.isArray(data) && data.length > 0) {
        setRequests(data);
        setTotalPages(1);
        setTotal(data.length);
      } else {
        setRequests([]);
        setTotalPages(1);
        setTotal(0);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load requests');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [page, search]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    let cancelled = false;
    let unsubscribe: (() => void) | undefined;
    (async () => {
      unsubscribe = await portalLifecycle.subscribe({
        onEvent: (type, payload) => {
          if (type === 'entity_changed' && payload.docType === 'request' && !cancelled) load();
        },
      });
    })();
    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [load]);

  useEffect(() => {
    setPage(1);
  }, [search, tab]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await load();
  };

  const filtered = useMemo(() => {
    return requests.filter((r) => {
      const matchesTab = tab === 'all' || STATUS_TO_TAB[r.status] === tab;
      const q = search.trim().toLowerCase();
      const matchesSearch = !q ||
        (r.request_number || '').toLowerCase().includes(q) ||
        (r.customer_name || '').toLowerCase().includes(q) ||
        (r.request_type || '').toLowerCase().includes(q);
      return matchesTab && matchesSearch;
    });
  }, [requests, tab, search]);

  const counts = useMemo(() => ({
    all: requests.length,
    pending: requests.filter((r) => STATUS_TO_TAB[r.status] === 'pending').length,
    converted: requests.filter((r) => r.status === 'converted').length,
    cancelled: requests.filter((r) => r.status === 'cancelled' || r.status === 'rejected').length,
  }), [requests]);

  const handleCancelClick = (r: QuotationRequestRecord) => {
    setCancelTarget(r);
    setConfirmOpen(true);
  };

  const handleCancelConfirm = async () => {
    if (!cancelTarget) return;
    const id = cancelTarget.id;
    setConfirmOpen(false);
    setCancellingId(id);
    try {
      await portalLifecycle.requests.cancel(id);
      addToast('success', 'Request cancelled successfully');
      await load();
    } catch (err: any) {
      addToast('error', err.message || 'Failed to cancel request');
    } finally {
      setCancellingId(null);
      setCancelTarget(null);
    }
  };

  const canCancel = (status: string) => ['submitted', 'assigned', 'under_review', 'waiting_for_customer', 'ready_for_conversion'].includes(status);

  const getStatusChip = (status: string) => {
    const meta = REQUEST_STATUS_META[status] || { label: status, color: '#64748B', bg: '#F1F5F9' };
    return (
      <span style={{
        fontSize: 10, fontWeight: 700, letterSpacing: '0.04em',
        padding: '3px 10px', borderRadius: 6,
        background: meta.bg, color: meta.color,
        whiteSpace: 'nowrap',
      }}>
        {FRIENDLY_STATUS_MAP[status] || status}
      </span>
    );
  };

  if (loading && page === 1) return <div style={{ padding: 16 }}><PortalLoadingSkeleton type="table" count={6} /></div>;

  return (
    <div style={{ fontFamily: F, fontSize: 13.5, lineHeight: 1.45, color: '#1E293B' }}>
      {error && (
        <div style={{
          background: '#FEF2F2', border: '1px solid #FECACA', color: '#DC2626', borderRadius: 10, padding: '10px 14px', fontSize: 12.5,
          marginBottom: 10, lineHeight: 1.4,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12
        }}>
          <span>{error}</span>
          <button onClick={() => setError(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#DC2626', padding: 4, flexShrink: 0 }} aria-label="Dismiss error">
            <ArrowUpRight size={14} style={{ transform: 'rotate(45deg)' }} />
          </button>
        </div>
      )}

      <PortalPageHeader
        title="Customer Requests"
        subtitle="Review and track your quotation and order requests"
        icon={ClipboardList}
        action={{
          label: 'New Request',
          onClick: () => navigate('/portal/new-request'),
          icon: Plus,
        }}
      />

      <style>{`
        @keyframes cpoSlideUp { from { transform: translateY(100%); opacity: 0 } to { transform: translateY(0); opacity: 1 } }
      `}</style>
      <div style={{ display: 'flex', gap: 6, padding: '6px 0', borderBottom: '1px solid #E9EDF3', marginBottom: 14 }}>
        {TABS.map((t) => {
          const active = tab === t.key;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '8px 16px', borderRadius: 8,
                border: active ? '1px solid transparent' : '1px solid #E2E8F0',
                background: active ? '#0F2C59' : '#fff',
                color: active ? '#fff' : '#475569',
                fontSize: 12, fontWeight: 700, letterSpacing: '0.05em',
                cursor: 'pointer', transition: 'all .15s ease', lineHeight: 1.4,
              }}
            >
              {t.label}
              <span style={{
                marginLeft: 4, fontSize: 10, fontWeight: 700, borderRadius: 6, padding: '1px 7px',
                background: active ? 'rgba(255,255,255,.18)' : '#F1F5F9', color: active ? '#fff' : '#64748B',
              }}>
                {counts[t.key]}
              </span>
            </button>
          );
        })}
      </div>

      {/* Search */}
      <div style={{ position: 'relative', marginBottom: 14 }}>
        <Search size={16} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: '#8A94A6', pointerEvents: 'none' }} />
        <PortalInput
          label=""
          placeholder="Search by request #, type, or item..."
          value={search}
          onChange={(v) => { setPage(1); setSearch(v); }}
          onFocus={() => {}}
          onBlur={() => {}}
          style={{ paddingLeft: 40, height: 44, fontSize: 13 }}
        />
      </div>

      {/* List */}
      {filtered.length === 0 ? (
        <EmptyState
          icon={<ClipboardList size={28} />}
          title="No requests found"
          description={search ? 'Try adjusting your search or filters.' : 'Your requests will appear here once submitted.'}
        />
      ) : (
        <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #E9EDF3', overflow: 'hidden' }}>
          {filtered.map((r, index) => {
            const itemCount = (r.items || []).reduce((sum, i) => sum + Number(i.quantity || 0), 0);
            const subtotal = Number(r.subtotal || 0);
            const isLast = index === filtered.length - 1;
            const isCancelling = cancellingId === r.id;

            return (
              <div
                key={r.id}
                style={{
                  padding: '14px 16px',
                  borderBottom: isLast ? 'none' : '1px solid #F1F5F9',
                  borderLeft: '3px solid transparent',
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
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 14, fontWeight: 700, color: '#0F172A', fontFamily: MONO, fontVariantNumeric: 'tabular-nums' }}>
                        {r.request_number}
                      </span>
                      {getStatusChip(r.status)}
                      <span style={{ fontSize: 10, fontWeight: 700, color: '#64748B', background: '#F1F5F9', padding: '2px 8px', borderRadius: 6, textTransform: 'uppercase' }}>
                        {r.request_type || 'quotation'}
                      </span>
                    </div>
                    <div style={{ fontSize: 12, color: '#64748B', marginTop: 3 }}>
                      {new Date(r.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                      {' • '}{itemCount} item{itemCount === 1 ? '' : 's'}
                      {' • '}<span style={{ fontFamily: MONO, fontVariantNumeric: 'tabular-nums' }}>K {subtotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                    {canCancel(r.status) && (
                      <button
                        onClick={(e) => { e.stopPropagation(); handleCancelClick(r); }}
                        disabled={isCancelling}
                        style={{
                          padding: '6px 12px', borderRadius: 8, border: '1px solid #FECACA', background: '#FFF7F7',
                          color: '#DC2626', fontSize: 11, fontWeight: 700, cursor: 'pointer',
                          display: 'inline-flex', alignItems: 'center', gap: 4, transition: 'all .15s ease',
                        }}
                      >
                        {isCancelling ? <Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} /> : <Trash2 size={12} />}
                        Cancel
                      </button>
                    )}
                    <button
                      onClick={() => setDetailRequest(r)}
                      style={{
                        padding: '6px 12px', borderRadius: 8, border: '1px solid #E2E8F0', background: '#fff',
                        color: '#0F2C59', fontSize: 11, fontWeight: 700, cursor: 'pointer',
                        display: 'inline-flex', alignItems: 'center', gap: 4, transition: 'all .15s ease',
                      }}
                    >
                      View <ChevronRight size={12} />
                    </button>
                  </div>
                </div>

                {r.quotation_number && (
                  <div style={{ fontSize: 12, color: '#059669', fontWeight: 600, marginTop: 2 }}>
                    Quotation: #{r.quotation_number}
                  </div>
                )}
                {r.sales_order_number && (
                  <div style={{ fontSize: 12, color: '#059669', fontWeight: 600, marginTop: 2 }}>
                    Order: #{r.sales_order_number}
                  </div>
                )}
                {r.status === 'waiting_for_customer' && (
                  <div style={{ fontSize: 12, color: '#7C3AED', fontWeight: 600, marginTop: 4, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    <MessageSquare size={12} /> Waiting for your response
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {totalPages > 1 && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 16, gap: 12 }}>
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page <= 1}
            style={{
              flex: 1, padding: '8px 14px', borderRadius: 10, border: '1px solid #E9EDF3', background: '#fff',
              cursor: page <= 1 ? 'not-allowed' : 'pointer', opacity: page <= 1 ? 0.4 : 1, fontSize: 12, fontWeight: 600, color: '#4A5568',
              transition: 'all .15s ease'
            }}
          >
            Previous
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
              <button
                key={p}
                onClick={() => setPage(p)}
                style={{
                  width: 32, height: 32, borderRadius: 8, border: p === page ? 'none' : '1px solid #E9EDF0',
                  background: p === page ? '#0F2C59' : '#fff',
                  color: p === page ? '#fff' : '#475569', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                  boxShadow: p === page ? '0 4px 10px -3px rgba(15,44,89,.6)' : 'none', transition: 'all .15s ease'
                }}
              >
                {p}
              </button>
            ))}
          </div>
          <button
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
            style={{
              flex: 1, padding: '8px 14px', borderRadius: 10, border: '1px solid #E9EDF3', background: '#fff',
              cursor: page >= totalPages ? 'not-allowed' : 'pointer', opacity: page >= totalPages ? 0.4 : 1, fontSize: 12, fontWeight: 600, color: '#4A5568',
              transition: 'all .15s ease'
            }}
          >
            Next
          </button>
        </div>
      )}

      {/* Detail Modal */}
      {detailRequest && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 80,
            display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
            background: 'rgba(15,23,42,.45)', backdropFilter: 'blur(2px)',
          }}
          onMouseDown={(e) => { if (e.target === e.currentTarget) setDetailRequest(null); }}
        >
          <div style={{
            background: '#fff', width: '100%', maxWidth: 640, maxHeight: '88vh', overflowY: 'auto',
            borderRadius: '20px 20px 0 0', boxShadow: '0 -16px 48px rgba(2,8,23,.3)',
            animation: 'cpoSlideUp .28s cubic-bezier(.16,1,.3,1)',
          }}>
            <div style={{ padding: '16px 20px 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#1A202C' }}>{detailRequest.request_number}</h3>
                <p style={{ margin: '2px 0 0', fontSize: 11.5, color: '#64748B' }}>
                  {detailRequest.request_type === 'order' ? 'Order Request' : 'Quotation Request'}
                  {' • '}{new Date(detailRequest.created_at).toLocaleDateString()}
                </p>
              </div>
              <button onClick={() => setDetailRequest(null)} aria-label="Close" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#8A94A6', padding: 4, borderRadius: 8 }}>
                <X size={18} />
              </button>
            </div>

            <div style={{ padding: '14px 20px 20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                {getStatusChip(detailRequest.status)}
                {detailRequest.quotation_number && (
                  <span style={{ fontSize: 12, fontWeight: 700, color: '#059669' }}>
                    <FileText size={13} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 4 }} />
                    Quotation: #{detailRequest.quotation_number}
                  </span>
                )}
                {detailRequest.sales_order_number && (
                  <span style={{ fontSize: 12, fontWeight: 700, color: '#059669' }}>
                    <PackageCheck size={13} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 4 }} />
                    Order: #{detailRequest.sales_order_number}
                  </span>
                )}
              </div>

              {detailRequest.items && detailRequest.items.length > 0 && (
                <div style={{ marginBottom: 14, border: '1px solid #E9EDF3', borderRadius: 12, overflow: 'hidden' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ background: '#F8FAFC' }}>
                        <th style={{ textAlign: 'left', padding: '8px 12px', fontSize: 10.5, fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Item</th>
                        <th style={{ textAlign: 'right', padding: '8px 12px', fontSize: 10.5, fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.04em', width: 70 }}>Qty</th>
                        <th style={{ textAlign: 'right', padding: '8px 12px', fontSize: 10.5, fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.04em', width: 100 }}>Price</th>
                        <th style={{ textAlign: 'right', padding: '8px 12px', fontSize: 10.5, fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.04em', width: 100 }}>Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detailRequest.items.map((item, i) => (
                        <tr key={i} style={{ borderTop: i > 0 ? '1px solid #F1F5F9' : 'none' }}>
                          <td style={{ padding: '8px 12px', fontSize: 13, fontWeight: 600, color: '#1A202C' }}>{item.name}</td>
                          <td style={{ padding: '8px 12px', textAlign: 'right', fontSize: 13, color: '#4A5568' }}>x{item.quantity}</td>
                          <td style={{ padding: '8px 12px', textAlign: 'right', fontSize: 13, color: '#4A5568', fontFamily: MONO, fontVariantNumeric: 'tabular-nums' }}>K {Number(item.unitPrice || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                          <td style={{ padding: '8px 12px', textAlign: 'right', fontSize: 13, fontWeight: 700, color: '#1A202C', fontFamily: MONO, fontVariantNumeric: 'tabular-nums' }}>
                            K {((Number(item.quantity) || 0) * (Number(item.unitPrice) || 0)).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div style={{ padding: '8px 12px', borderTop: '1px solid #E9EDF3', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Subtotal</span>
                    <span style={{ fontSize: 14, fontWeight: 700, color: '#1A202C', fontFamily: MONO, fontVariantNumeric: 'tabular-nums' }}>
                      K {Number(detailRequest.subtotal || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                </div>
              )}

              {detailRequest.notes && (
                <div style={{ padding: '10px 14px', background: '#F8FAFC', borderRadius: 10, border: '1px solid #E9EDF3', marginBottom: 14 }}>
                  <div style={{ fontSize: 10.5, fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4 }}>Notes</div>
                  <p style={{ margin: 0, fontSize: 13, color: '#334155', lineHeight: 1.5 }}>{detailRequest.notes}</p>
                </div>
              )}

              {detailRequest.requested_delivery_date && (
                <div style={{ fontSize: 12, color: '#64748B', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontWeight: 600 }}>Requested Delivery:</span>
                  {new Date(detailRequest.requested_delivery_date).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
                </div>
              )}

              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  onClick={() => { setDetailRequest(null); navigate(`/portal/requests/${detailRequest.id}`); }}
                  style={{
                    flex: 1, padding: '10px 0', borderRadius: 10, border: '1px solid #E9EDF3', background: '#fff',
                    color: '#0F172A', fontSize: 13, fontWeight: 700, cursor: 'pointer', transition: 'all .15s ease',
                  }}
                >
                  View Full Details
                </button>
                {canCancel(detailRequest.status) && (
                  <button
                    onClick={() => { setDetailRequest(null); setCancelTarget(detailRequest); setConfirmOpen(true); }}
                    style={{
                      flex: 1, padding: '10px 0', borderRadius: 10, border: 'none', cursor: 'pointer',
                      background: '#DC2626', color: '#fff', fontSize: 13, fontWeight: 700,
                      boxShadow: '0 4px 12px -4px rgba(220,38,38,.5)', transition: 'all .15s ease',
                    }}
                  >
                    Cancel Request
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Cancel Confirm Dialog */}
      <ConfirmDialog
        open={confirmOpen}
        title="Cancel Request"
        message={cancelTarget ? `Are you sure you want to cancel request ${cancelTarget.request_number}? This action cannot be undone.` : ''}
        confirmLabel="Cancel Request"
        cancelLabel="Keep Request"
        variant="danger"
        onConfirm={handleCancelConfirm}
        onCancel={() => { setConfirmOpen(false); setCancelTarget(null); }}
      />
    </div>
  );
};

export default CustomerRequests;
