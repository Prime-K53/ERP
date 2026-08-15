import React, { useCallback, useEffect, useMemo, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { ClipboardList, Plus, Loader2, ArrowUpRight, Search, RefreshCw, SlidersHorizontal, Trash2, ChevronRight } from 'lucide-react';
import { portalLifecycle, QuotationRequestRecord } from '../../services/portalApiClient';

import { useCustomerAuth } from '../../context/CustomerAuthContext';
import { useToast } from './components/Toast';
import PortalPageHeader from './components/PortalPageHeader';
import PortalCard from './components/PortalCard';
import PortalButton from './components/PortalButton';
import PortalInput from './components/PortalInput';
import EmptyState from './components/EmptyState';
import StatusBadge from './components/StatusBadge';
import PortalLoadingSkeleton from './components/PortalLoadingSkeleton';
import { DEFAULT_PAGE_SIZE, FRIENDLY_STATUS_MAP } from './constants';
import { F } from './portalStyles';

const SWIPE_THRESHOLD = 80;

const CustomerRequests: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useCustomerAuth();
  const { addToast } = useToast();
  const [requests, setRequests] = useState<QuotationRequestRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [confirmState, setConfirmState] = useState<{ open: boolean; id: string | null }>({ open: false, id: null });
  const [showFilterSheet, setShowFilterSheet] = useState(false);
  const [swipedId, setSwipedId] = useState<string | null>(null);
  const touchStartX = useRef<number>(0);
  const touchCurrentX = useRef<number>(0);
  const cardRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await portalLifecycle.requests.list({ page, pageSize: DEFAULT_PAGE_SIZE, search: search || undefined, status: statusFilter || undefined });
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
  }, [page, search, statusFilter]);

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
  }, [search, statusFilter]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await load();
  };

  const handleCancelClick = (id: string) => {
    setConfirmState({ open: true, id });
    setSwipedId(null);
  };

  const handleCancelConfirm = async () => {
    if (!confirmState.id) return;
    const id = confirmState.id;
    setConfirmState({ open: false, id: null });
    setCancellingId(id);
    try {
      await portalLifecycle.requests.cancel(id);
      addToast('success', 'Request cancelled successfully');
      await load();
    } catch (err: any) {
      addToast('error', err.message || 'Failed to cancel request');
    } finally {
      setCancellingId(null);
    }
  };

  const handleTouchStart = (id: string, e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    touchCurrentX.current = e.touches[0].clientX;
    setSwipedId(prev => prev === id ? null : prev);
  };

  const handleTouchMove = (id: string, e: React.TouchEvent) => {
    touchCurrentX.current = e.touches[0].clientX;
  };

  const handleTouchEnd = (id: string) => {
    const diff = touchStartX.current - touchCurrentX.current;
    if (diff > SWIPE_THRESHOLD) {
      setSwipedId(id);
    } else if (diff < -SWIPE_THRESHOLD) {
      setSwipedId(null);
    }
  };

  const sorted = useMemo(
    () => [...requests].sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()),
    [requests]
  );

  const statusOptions = useMemo(() => {
    const map: Record<string, string> = {};
    for (const r of requests) {
      const raw = r.status || '';
      const friendly = FRIENDLY_STATUS_MAP[raw] || raw;
      if (friendly && !map[friendly]) map[friendly] = raw;
    }
    return map;
  }, [requests]);

  const activeFilterCount = (statusFilter ? 1 : 0) + (search ? 1 : 0);

  if (loading && page === 1) return <div style={{ padding: 16 }}><PortalLoadingSkeleton type="table" count={6} /></div>;

  return (
    <div style={{ background: '#fff', borderRadius: 20, overflow: 'hidden', fontFamily: F, fontSize: 13.5, lineHeight: 1.45, color: '#1E293B' }}>
      <div style={{ padding: '16px 20px 0' }}>
        {error && (
          <div style={{
            background: '#FEF2F2', border: '1px solid #FECACA', color: '#B91C1C', borderRadius: 10, padding: '10px 14px', fontSize: 12.5,
            marginBottom: 10, lineHeight: 1.4,
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12
          }}>
            <span>{error}</span>
            <button onClick={() => setError(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#B91C1C', padding: 4, flexShrink: 0 }} aria-label="Dismiss error">
              <ArrowUpRight size={14} style={{ transform: 'rotate(45deg)' }} />
            </button>
          </div>
        )}

        <div style={{ display: 'flex', gap: 10 }}>
          <div style={{ position: 'relative', flex: 1 }}>
            <Search size={18} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: '#8A94A6' }} />
            <PortalInput
              label=""
              placeholder="Search requests..."
              value={search}
              onChange={(v) => { setPage(1); setSearch(v); }}
              onFocus={() => {}}
              onBlur={() => {}}
              style={{ paddingLeft: 42, borderRadius: 14, height: 48, fontSize: 15 }}
            />
          </div>
          <button
            onClick={() => setShowFilterSheet(true)}
            style={{
              width: 48, height: 48, borderRadius: 14, border: `1px solid ${activeFilterCount ? '#4ed3c7' : '#E9EDF3'}`,
              background: activeFilterCount ? '#eef7f6' : '#fff', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', flexShrink: 0
            }}
          >
            <SlidersHorizontal size={18} color={activeFilterCount ? '#146b60' : '#8A94A6'} />
            {activeFilterCount > 0 && (
              <span style={{
                position: 'absolute', top: -4, right: -4, width: 18, height: 18, borderRadius: '50%',
                background: 'linear-gradient(135deg, #1f8577, #0f544c)', color: '#fff',
                fontSize: 10, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center'
              }}>
                {activeFilterCount}
              </span>
            )}
          </button>
        </div>

        {refreshing && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '12px 0', color: '#146b60' }}>
            <RefreshCw size={16} style={{ animation: 'spin 1s linear infinite' }} />
            <span style={{ fontSize: 12, fontWeight: 600 }}>Refreshing...</span>
          </div>
        )}
      </div>

      <div style={{ padding: '12px 20px 28px' }}>
        {sorted.length === 0 ? (
          <EmptyState
            icon={ClipboardList}
            title="No requests yet"
            description="Submit a quotation or order request and track it here."
            action={{ label: 'New Request', onClick: () => navigate('/portal/new-request') }}
          />
        ) : (
          <>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <span style={{ fontSize: 12, color: '#8A94A6', fontWeight: 500 }}>
                {total} request{total !== 1 ? 's' : ''} {statusFilter ? '• filtered' : ''}
              </span>
              <button onClick={handleRefresh} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#146b60', display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, fontWeight: 600 }}>
                <RefreshCw size={14} /> Refresh
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {sorted.map((r, idx) => {
                const itemCount = (r.items || []).reduce((sum, i) => sum + Number(i.quantity || 0), 0);
                const friendlyStatus = FRIENDLY_STATUS_MAP[r.status] || r.status;
                const isSwiped = swipedId === r.id;
                const canCancel = r.status === 'submitted' || r.status === 'assigned' || r.status === 'under_review' || r.status === 'waiting_for_customer';
                return (
                  <div
                    key={r.id}
                    style={{ position: 'relative', overflow: 'hidden', borderRadius: 18 }}
                    onTouchStart={(e) => handleTouchStart(r.id, e)}
                    onTouchMove={(e) => handleTouchMove(r.id, e)}
                    onTouchEnd={() => handleTouchEnd(r.id)}
                  >
                    <div style={{
                      position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', padding: '0 8px',
                      background: 'linear-gradient(135deg, rgba(181,73,63,0.08), rgba(181,73,63,0.15))', borderRadius: 18,
                      transform: isSwiped ? 'translateX(0)' : 'translateX(100%)', transition: 'transform .25s cubic-bezier(.4,0,.2,1)'
                    }}>
                      {canCancel && (
                        <button
                          onClick={() => handleCancelClick(r.id)}
                          disabled={cancellingId === r.id}
                          style={{
                            width: 72, height: '100%', border: 'none', borderRadius: 18, cursor: 'pointer',
                            background: 'linear-gradient(135deg, #b5493f, rgba(181,73,63,0.87))', color: '#fff',
                            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4,
                            boxShadow: '0 4px 12px -4px rgba(181,73,63,.5)'
                          }}
                        >
                          {cancellingId === r.id ? <Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} /> : <Trash2 size={18} />}
                          <span style={{ fontSize: 10, fontWeight: 700 }}>Cancel</span>
                        </button>
                      )}
                    </div>

                    <PortalCard
                      hoverable
                      onClick={() => navigate(`/portal/requests/${r.id}`)}
                      style={{ transform: isSwiped ? 'translateX(-88px)' : 'translateX(0)', transition: 'transform .25s cubic-bezier(.4,0,.2,1)', position: 'relative', padding: 0, overflow: 'visible' }}
                    >
                      <div
                        style={{
                          borderRadius: 14, padding: '14px 16px', background: '#fff',
                          border: '1px solid rgba(16,24,40,0.06)', borderLeft: '4px solid #d99a3f',
                          display: 'flex', alignItems: 'center', gap: 12, textAlign: 'left', width: '100%',
                          boxShadow: '0 1px 2px rgba(16,24,40,0.04)', transition: 'all .15s ease',
                          cursor: 'pointer'
                        }}
                      >
                        <div style={{ width: 34, height: 34, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#FEF3C7', flexShrink: 0 }}>
                          <ClipboardList size={16} color="#b97e2b" />
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 600, color: '#0b3e39' }}>{r.request_number}</div>
                          <div style={{ fontSize: 10, color: '#8A94A6', marginTop: 1, lineHeight: 1.3 }}>
                            {new Date(r.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })} • {itemCount} item{itemCount === 1 ? '' : 's'} • K {Number(r.subtotal || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </div>
                        </div>
                        <div style={{ marginLeft: 'auto', padding: '4px 10px', borderRadius: 6, background: '#eef7f6', fontSize: 10, fontWeight: 600, color: '#0f544c', display: 'flex', alignItems: 'center', gap: 3, flexShrink: 0, border: '1px solid #d3ece9' }}>
                          View
                          <ChevronRight size={10} />
                        </div>
                      </div>
                    </PortalCard>
                  </div>
                );
              })}
            </div>

            {totalPages > 1 && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 20, gap: 12 }}>
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
                        width: 32, height: 32, borderRadius: 8, border: p === page ? 'none' : '1px solid #E9EDF3',
                        background: p === page ? '#008A4C' : '#fff',
                        color: p === page ? '#fff' : '#4A5568', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                        boxShadow: p === page ? '0 4px 10px -3px rgba(0,138,76,.6)' : 'none', transition: 'all .15s ease'
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
          </>
        )}
      </div>

      {/* Floating Action Button */}
      <button
        onClick={() => navigate('/portal/new-request')}
        style={{
          position: 'fixed', bottom: 24, right: 24, width: 56, height: 56, borderRadius: 18, border: 'none', cursor: 'pointer',
          background: 'linear-gradient(135deg, #008A4C, #006B3A)',
          color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 8px 24px -8px rgba(0,138,76,.6)', zIndex: 40, transition: 'transform .15s ease'
        }}
        onTouchStart={() => {}}
      >
        <Plus size={24} strokeWidth={3} />
      </button>

      {/* Filter Bottom Sheet */}
      {showFilterSheet && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 60, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}
          onClick={() => setShowFilterSheet(false)}
        >
          <div style={{ background: 'rgba(0,0,0,.4)', backdropFilter: 'blur(4px)', flex: 1 }} />
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: '#fff', borderRadius: '24px 24px 0 0', padding: '20px 24px 28px',
              boxShadow: '0 -8px 32px -16px rgba(0,0,0,.3)', animation: 'slideUp .3s cubic-bezier(.4,0,.2,1)'
            }}
          >
            <div style={{ width: 40, height: 4, borderRadius: 2, background: '#E9EDF3', margin: '0 auto 16px' }} />
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <h3 style={{ fontSize: 18, fontWeight: 700, color: '#1A202C', margin: 0 }}>Filters</h3>
              <button onClick={() => { setStatusFilter(''); setSearch(''); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#146b60', fontSize: 13, fontWeight: 600 }}>
                Clear all
              </button>
            </div>
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#64748B', textTransform: 'uppercase', letterSpacing: 0.06, marginBottom: 8, display: 'block' }}>Status</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                <button
                  onClick={() => { setStatusFilter(''); setShowFilterSheet(false); }}
                  style={{
                    padding: '10px 16px', borderRadius: 12, border: `1px solid ${!statusFilter ? '#4ed3c7' : '#E9EDF3'}`,
                    background: !statusFilter ? '#eef7f6' : '#fff', color: !statusFilter ? '#0f544c' : '#0b3e39',
                    fontSize: 13, fontWeight: 600, cursor: 'pointer', transition: 'all .15s ease'
                  }}
                >
                  All
                </button>
                {Object.entries(statusOptions).map(([label, raw]) => (
                  <button
                    key={raw}
                    onClick={() => { setStatusFilter(raw); setShowFilterSheet(false); }}
                    style={{
                      padding: '10px 16px', borderRadius: 12, border: `1px solid ${statusFilter === raw ? '#4ed3c7' : '#E9EDF3'}`,
                      background: statusFilter === raw ? '#eef7f6' : '#fff', color: statusFilter === raw ? '#0f544c' : '#0b3e39',
                      fontSize: 13, fontWeight: 600, cursor: 'pointer', transition: 'all .15s ease'
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <button
              onClick={() => setShowFilterSheet(false)}
              style={{
                width: '100%', padding: '14px 0', borderRadius: 14, border: 'none', cursor: 'pointer',
                background: 'linear-gradient(135deg, #008A4C, #006B3A)', color: '#fff',
                fontSize: 15, fontWeight: 700, boxShadow: '0 6px 16px -6px rgba(0,138,76,.5)'
              }}
            >
              Show {total} result{total !== 1 ? 's' : ''}
            </button>
          </div>
        </div>
      )}

      {/* Confirm Dialog */}
      {confirmState.open && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, background: 'rgba(0,0,0,.5)', backdropFilter: 'blur(6px)', animation: 'fadeIn .2s ease' }} onClick={() => setConfirmState({ open: false, id: null })}>
          <div onClick={(e) => e.stopPropagation()} style={{
            background: '#fff', borderRadius: 24, width: '100%', maxWidth: 360, overflow: 'hidden',
            boxShadow: '0 20px 40px -12px rgba(0,0,0,.4)', animation: 'scaleIn .2s cubic-bezier(.4,0,.2,1)'
          }}>
            <div style={{ padding: '22px 24px 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <h3 style={{ fontSize: 18, fontWeight: 700, color: '#1A202C', margin: 0 }}>Cancel Request</h3>
              <button onClick={() => setConfirmState({ open: false, id: null })} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 6, borderRadius: 10, color: '#8A94A6' }} aria-label="Close">
                <ArrowUpRight size={18} style={{ transform: 'rotate(45deg)' }} />
              </button>
            </div>
            <div style={{ padding: '16px 24px 24px', fontSize: 14, color: '#8A94A6', lineHeight: 1.6 }}>
              Are you sure you want to cancel this request? This action cannot be undone.
            </div>
            <div style={{ display: 'flex', gap: 10, padding: '0 24px 24px' }}>
              <button onClick={() => setConfirmState({ open: false, id: null })} style={{
                flex: 1, padding: '14px 0', borderRadius: 14, border: '1px solid #E9EDF3', background: '#fff',
                color: '#0b3e39', fontSize: 14, fontWeight: 700, cursor: 'pointer', transition: 'all .15s ease'
              }}>
                Keep Request
              </button>
              <button onClick={handleCancelConfirm} style={{
                flex: 1, padding: '14px 0', borderRadius: 14, border: 'none', cursor: 'pointer',
                background: 'linear-gradient(135deg, #b5493f, rgba(181,73,63,0.87))', color: '#fff',
                fontSize: 14, fontWeight: 700, boxShadow: '0 6px 16px -6px rgba(181,73,63,.5)', transition: 'all .15s ease'
              }}>
                Cancel Request
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CustomerRequests;
