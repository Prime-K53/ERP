import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ShoppingCart, Plus, Loader2, Search, ClipboardList, FileText, ChevronRight } from 'lucide-react';
import { portalLifecycle } from '../../services/portalApiClient';
import { useCustomerAuth } from '../../context/CustomerAuthContext';
import { useToast } from './components/Toast';
import PortalPageHeader from './components/PortalPageHeader';
import PortalInput from './components/PortalInput';
import ErrorBanner from './components/ErrorBanner';
import EmptyState from './components/EmptyState';
import PortalLoadingSkeleton from './components/PortalLoadingSkeleton';
import { F } from './portalStyles';
import { ORDER_STATUS_META, DEFAULT_PAGE_SIZE, FRIENDLY_STATUS_MAP, formatK } from './constants';

type Tab = 'orders' | 'requests' | 'quotations';

const tabs: { key: Tab; label: string; icon: React.ElementType }[] = [
  { key: 'orders', label: 'Orders', icon: ShoppingCart },
  { key: 'requests', label: 'Requests', icon: ClipboardList },
  { key: 'quotations', label: 'Quotations', icon: FileText },
];

interface Order {
  id: string;
  orderNumber?: string;
  orderDate: string;
  customerName: string;
  totalAmount: number;
  status: string;
}

const CustomerOrders: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useCustomerAuth();
  const { addToast } = useToast();
  const [tab, setTab] = useState<Tab>(searchParams.get('tab') as Tab || 'orders');
  const [orders, setOrders] = useState<Order[]>([]);
  const [requests, setRequests] = useState<any[]>([]);
  const [quotations, setQuotations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState('All');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [confirmReorder, setConfirmReorder] = useState<{ open: boolean; order: Order | null }>({ open: false, order: null });

  const loadOrders = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await portalLifecycle.orders.list({ page, pageSize: DEFAULT_PAGE_SIZE, search: search || undefined, status: filter === 'All' ? undefined : filter });
      if ('orders' in data) {
        const mapped: Order[] = (data as any).orders.map((o: any) => ({
          id: o.id,
          orderNumber: o.orderNumber || o.order_number,
          orderDate: o.orderDate || o.order_date || o.created_at || '',
          customerName: o.customerName || o.customer_name || '',
          totalAmount: Number(o.totalAmount ?? o.total ?? o.subtotal ?? 0),
          status: o.status || 'Draft',
        }));
        setOrders(mapped);
        setTotalPages((data as any).totalPages);
        setTotal((data as any).total);
      } else {
        const mapped: Order[] = (data as Order[]).map((o) => ({ ...o }));
        setOrders(mapped);
        setTotalPages(1);
        setTotal(mapped.length);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load orders');
    } finally {
      setLoading(false);
    }
  }, [page, search, filter]);

  const loadRequests = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await portalLifecycle.requests.list({ page, pageSize: DEFAULT_PAGE_SIZE, search: search || undefined, status: filter === 'All' ? undefined : filter });
      if ('requests' in data) {
        setRequests((data as any).requests);
        setTotalPages((data as any).totalPages);
        setTotal((data as any).total);
      } else {
        setRequests(data as any[]);
        setTotalPages(1);
        setTotal((data as any[]).length);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load requests');
    } finally {
      setLoading(false);
    }
  }, [page, search, filter]);

  const loadQuotations = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await portalLifecycle.quotations.list({ page, pageSize: DEFAULT_PAGE_SIZE, search: search || undefined });
      if ('quotations' in data) {
        setQuotations((data as any).quotations);
        setTotalPages((data as any).totalPages);
        setTotal((data as any).total);
      } else {
        setQuotations(data as any[]);
        setTotalPages(1);
        setTotal((data as any[]).length);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load quotations');
    } finally {
      setLoading(false);
    }
  }, [page, search]);

  const load = useCallback(async () => {
    if (tab === 'orders') await loadOrders();
    else if (tab === 'requests') await loadRequests();
    else if (tab === 'quotations') await loadQuotations();
  }, [tab, loadOrders, loadRequests, loadQuotations]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    let cancelled = false;
    let unsubscribe: (() => void) | undefined;
    (async () => {
      unsubscribe = await portalLifecycle.subscribe({
        onEvent: (type, payload) => {
          if (!cancelled) {
            if (tab === 'orders' && payload?.docType === 'order') load();
            else if (tab === 'requests' && payload?.docType === 'request') load();
            else if (tab === 'quotations' && payload?.docType === 'quotation') load();
          }
        },
      });
    })();
    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [tab, load]);

  useEffect(() => {
    setSearchParams({ tab }, { replace: true });
  }, [tab, setSearchParams]);

  useEffect(() => {
    setPage(1);
  }, [tab, search, filter]);

  const handleReorderClick = (order: Order) => {
    setConfirmReorder({ open: true, order });
  };

  const handleReorderConfirm = async () => {
    if (!confirmReorder.order) return;
    const order = confirmReorder.order;
    setConfirmReorder({ open: false, order: null });
    const orderNumber = order.orderNumber || order.id.slice(0, 8);
    navigate(`/portal/new-request?type=order&ref=${encodeURIComponent(orderNumber)}&order_id=${encodeURIComponent(order.id)}`);
  };

  const filteredOrders = useMemo(() => (filter === 'All' ? orders : orders.filter((o) => o.status === filter)), [orders, filter]);
  const availableOrderStatuses = useMemo(() => {
    const set = new Set(orders.map((o) => o.status));
    return ['All', ...Array.from(set).sort()];
  }, [orders]);
  const ordersTotalValue = useMemo(() => filteredOrders.reduce((sum, o) => sum + Number(o.totalAmount || 0), 0), [filteredOrders]);

  const sortedRequests = useMemo(
    () => [...requests].sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()),
    [requests]
  );

  const sortedQuotations = useMemo(() => [...quotations]
    .filter((q: any) => filter === 'All' || q.status === filter)
    .sort((a: any, b: any) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()),
  [quotations, filter]);

  const availableQuotationStatuses = useMemo(() => {
    const set = new Set(quotations.map((q: any) => q.status));
    return ['All', ...Array.from(set).sort()];
  }, [quotations]);

  if (loading && page === 1) return <div style={{ padding: 12, maxWidth: 800, margin: '0 auto' }}><PortalLoadingSkeleton type="table" count={8} /></div>;

  return (
    <div style={{ fontFamily: F, fontSize: 13, lineHeight: 1.4, color: '#2D3748' }}>
      <PortalPageHeader
        title={tab === 'orders' ? 'Orders' : tab === 'requests' ? 'Requests' : 'Quotations'}
        subtitle={tab === 'orders' ? 'View your order history' : tab === 'requests' ? 'Track your requests' : 'View your quotations'}
        icon={tab === 'orders' ? ShoppingCart : tab === 'requests' ? ClipboardList : FileText}
        action={
          tab === 'orders'
            ? { label: 'New Order', onClick: () => navigate('/portal/new-request?type=order'), icon: Plus }
            : tab === 'requests'
              ? { label: 'New Request', onClick: () => navigate('/portal/new-request'), icon: Plus }
              : { label: 'New Quotation', onClick: () => navigate('/portal/new-request?type=quotation'), icon: Plus }
        }
      />

      <div style={{ padding: '0 20px' }}>
        <div style={{ display: 'flex', gap: 6, padding: '6px 0', borderBottom: '1px solid #E9EDF3', marginBottom: 4 }}>
          {tabs.map((t) => {
            const Icon = t.icon;
            const active = tab === t.key;
            return (
              <button
                key={t.key}
                onClick={() => { setTab(t.key); setPage(1); setSearch(''); setFilter('All'); }}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  padding: '8px 14px', borderRadius: 10, border: 'none', cursor: 'pointer',
                  fontFamily: F, fontSize: 13, fontWeight: 600,
                  background: active ? '#ECFDF5' : 'transparent',
                  color: active ? '#0D5047' : '#718096',
                  transition: 'all .15s ease', lineHeight: 1.4
                }}
              >
                <Icon size={15} />
                {t.label}
              </button>
            );
          })}
        </div>
      </div>

      {tab === 'orders' && (
        <>
          <div style={{ padding: '16px 20px 0', display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
            <div style={{
              background: 'linear-gradient(135deg, #1f857712, #4ed3c708)',
              borderRadius: 12, border: '1px solid #E9EDF3', padding: '12px 14px',
              boxShadow: '0 1px 3px rgba(0,0,0,.04)'
            }}>
              <p style={{ margin: 0, fontSize: 10, fontWeight: 700, color: '#0f544c', textTransform: 'uppercase', letterSpacing: 0.08, lineHeight: 1.4, fontFamily: F }}>Total Orders</p>
              <p style={{ margin: '4px 0 0', fontSize: 20, fontWeight: 700, color: '#1A202C', fontFamily: "'JetBrains Mono', monospace", fontVariantNumeric: 'tabular-nums', lineHeight: 1.2 }}>{total}</p>
            </div>
            <div style={{
              background: 'linear-gradient(135deg, #d99a3f12, #d99a3f08)',
              borderRadius: 12, border: '1px solid #E9EDF3', padding: '12px 14px',
              boxShadow: '0 1px 3px rgba(0,0,0,.04)'
            }}>
              <p style={{ margin: 0, fontSize: 10, fontWeight: 700, color: '#b97e2b', textTransform: 'uppercase', letterSpacing: 0.08, lineHeight: 1.4, fontFamily: F }}>Total Value</p>
              <p style={{ margin: '4px 0 0', fontSize: 20, fontWeight: 700, color: '#1A202C', fontFamily: "'JetBrains Mono', monospace", fontVariantNumeric: 'tabular-nums', lineHeight: 1.2 }}>{formatK(ordersTotalValue)}</p>
            </div>
            <div style={{
              background: 'linear-gradient(135deg, #6366f112, #6366f108)',
              borderRadius: 12, border: '1px solid #E9EDF3', padding: '12px 14px',
              boxShadow: '0 1px 3px rgba(0,0,0,.04)'
            }}>
              <p style={{ margin: 0, fontSize: 10, fontWeight: 700, color: '#4f46e5', textTransform: 'uppercase', letterSpacing: 0.08, lineHeight: 1.4, fontFamily: F }}>Pending</p>
              <p style={{ margin: '4px 0 0', fontSize: 20, fontWeight: 700, color: '#1A202C', fontFamily: "'JetBrains Mono', monospace", fontVariantNumeric: 'tabular-nums', lineHeight: 1.2 }}>
                {orders.filter(o => ['Draft', 'Submitted', 'Processing'].includes(o.status)).length}
              </p>
            </div>
          </div>

          <div style={{ padding: '16px 20px 8px' }}>
            {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <div style={{ position: 'relative', flex: '1 1 240px' }}>
                <Search size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#8A94A6', pointerEvents: 'none', zIndex: 1 }} />
                <PortalInput label="" placeholder="Search orders..." value={search} onChange={(v) => { setPage(1); setSearch(v); }} onFocus={() => {}} onBlur={() => {}} style={{ paddingLeft: 36, height: 44, fontSize: 13, fontFamily: F, padding: '8px 12px 8px 36px', border: '1px solid #E9EDF3', borderRadius: 10, background: '#fff', color: '#1A202C', outline: 'none', width: '100%' }} />
              </div>
              <select
                value={filter}
                onChange={(e) => { setPage(1); setFilter(e.target.value); }}
                aria-label="Filter by status"
                style={{
                  fontFamily: F, fontSize: 13, padding: '8px 32px 8px 12px',
                  border: filter !== 'All' ? '1px solid #a6d9d3' : '1px solid #E9EDF3', borderRadius: 10, background: '#fff', color: '#1A202C',
                  appearance: 'none', backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%235c6567'/%3E%3C/svg%3E")`,
                  backgroundRepeat: 'no-repeat', backgroundPosition: 'right 14px center', cursor: 'pointer',
                  boxShadow: filter !== 'All' ? '0 0 0 3px #ECFDF5' : 'none', outline: 'none', transition: 'all .15s ease', lineHeight: 1.4
                }}
              >
                {availableOrderStatuses.map((s) => <option key={s} value={s}>{s === 'All' ? 'All Statuses' : s}</option>)}
              </select>
            </div>
          </div>

          <div style={{ padding: '12px 20px 28px' }}>
            {filteredOrders.length === 0 ? (
              <div style={{
                background: '#fff', borderRadius: 12, border: '1px solid #E9EDF3',
                padding: '40px 20px', textAlign: 'center', boxShadow: '0 1px 3px rgba(0,0,0,.04)'
              }}>
                <div style={{
                  width: 48, height: 48, borderRadius: 12, background: '#ECFDF5',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px'
                }}>
                  <ShoppingCart size={24} color="#008A4C" />
                </div>
                <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: '#1A202C', lineHeight: 1.4 }}>No orders found</p>
                <p style={{ margin: '6px 0 0', fontSize: 13, fontWeight: 500, color: '#4A5568', lineHeight: 1.5 }}>
                  {filter === 'All' ? 'You have no orders yet.' : `No orders with status "${filter}".`}
                </p>
              </div>
            ) : (
              <>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, padding: '0 2px' }}>
                  <div style={{ fontSize: 12, fontWeight: 500, color: '#4A5568', lineHeight: 1.4 }}>
                    Showing {filteredOrders.length} of {total} order{total !== 1 ? 's' : ''}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    {filter !== 'All' && (
                      <span style={{ fontSize: 10, fontWeight: 600, color: '#0f544c', background: '#ECFDF5', border: '1px solid #d3ece9', padding: '3px 8px', borderRadius: 6, lineHeight: 1.3 }}>
                        {filter}
                      </span>
                    )}
                    <span style={{ fontFamily: "'JetBrains Mono', monospace", fontVariantNumeric: 'tabular-nums', fontSize: 12, fontWeight: 600, color: '#718096', lineHeight: 1.4 }}>
                      {formatK(ordersTotalValue)} total
                    </span>
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {filteredOrders.map((order) => {
                    const statusMeta = ORDER_STATUS_META[order.status.toLowerCase()] || ORDER_STATUS_META.draft;
                    const orderNumber = order.orderNumber || order.id.slice(0, 8);
                    const date = order.orderDate ? new Date(order.orderDate) : null;
                    const total = formatK(order.totalAmount);
                    const statusColor = statusMeta.color || '#1f8577';
                    const statusBg = statusMeta.bg || '#ECFDF5';
                    const itemsCount = (order as any).items_count ?? (order as any).items?.length ?? 0;
                    return (
                      <div
                        key={order.id}
                        onClick={() => navigate(`/portal/orders/${order.id}`)}
                        style={{ background: '#fff', borderRadius: 12, padding: '12px 14px', border: '1px solid #E9EDF3', borderLeft: '4px solid #1f8577', display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer', boxShadow: '0 1px 3px rgba(0,0,0,.04)', transition: 'all .15s ease' }}
                      >
                        <div style={{ width: 34, height: 34, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#ECFDF5', flexShrink: 0 }}>
                          <ShoppingCart size={16} color="#1f8577" />
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 600, color: '#1A202C' }}>#{orderNumber}</div>
                          <div style={{ fontSize: 10, color: '#8A94A6', marginTop: 1, lineHeight: 1.3 }}>
                            {date ? date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : ''}
                            {itemsCount > 0 ? ` \u2022 ${itemsCount} item${itemsCount === 1 ? '' : 's'}` : ''}
                          </div>
                        </div>
                        <div style={{ textAlign: 'right', minWidth: 80 }}>
                          <div style={{ fontSize: 14, fontWeight: 600, color: '#1A202C', fontFamily: "'JetBrains Mono', monospace", fontVariantNumeric: 'tabular-nums', lineHeight: 1.35 }}>
                            {total}
                          </div>
                          <div style={{ fontSize: 10, color: '#8A94A6', textTransform: 'uppercase', marginTop: 1, lineHeight: 1.3 }}>
                            Order
                          </div>
                        </div>
                        <div style={{ marginLeft: 'auto', padding: '4px 10px', borderRadius: 6, background: '#ECFDF5', fontSize: 10, fontWeight: 600, color: '#0f544c', display: 'flex', alignItems: 'center', gap: 3, flexShrink: 0, border: '1px solid #d3ece9' }}>
                          View
                          <ChevronRight size={10} />
                        </div>
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
                        fontFamily: F, lineHeight: 1.4, transition: 'all .15s ease'
                      }}
                    >
                      Previous
                    </button>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                        let pageNum: number;
                        if (totalPages <= 5) pageNum = i + 1;
                        else if (page <= 3) pageNum = i + 1;
                        else if (page >= totalPages - 2) pageNum = totalPages - 4 + i;
                        else pageNum = page - 2 + i;
                        return (
                          <button
                            key={pageNum}
                            onClick={() => setPage(pageNum)}
                            style={{
                              width: 32, height: 32, borderRadius: 8,
                              border: page === pageNum ? 'none' : '1px solid #E9EDF3',
                              background: page === pageNum ? '#008A4C' : '#fff',
                              color: page === pageNum ? '#fff' : '#4A5568',
                              fontSize: 12, fontWeight: 600, cursor: 'pointer', lineHeight: 1.4,
                              fontFamily: F,
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              transition: 'all .15s ease'
                            }}
                          >
                            {pageNum}
                          </button>
                        );
                      })}
                    </div>
                    <button
                      onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                      disabled={page >= totalPages}
                      style={{
                        flex: 1, padding: '8px 14px', borderRadius: 10, border: '1px solid #E9EDF3', background: '#fff',
                        cursor: page >= totalPages ? 'not-allowed' : 'pointer', opacity: page >= totalPages ? 0.4 : 1, fontSize: 12, fontWeight: 600, color: '#4A5568',
                        fontFamily: F, lineHeight: 1.4, transition: 'all .15s ease'
                      }}
                    >
                      Next
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </>
      )}

      {tab === 'requests' && (
        <>
          <div style={{ padding: '20px 28px 8px' }}>
            {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}
            <div style={{ position: 'relative', flex: '1 1 240px' }}>
              <Search size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#8A94A6', pointerEvents: 'none', zIndex: 1 }} />
              <PortalInput label="" placeholder="Search requests..." value={search} onChange={(v) => { setPage(1); setSearch(v); }} onFocus={() => {}} onBlur={() => {}} style={{ paddingLeft: 36, fontSize: 13, fontFamily: F, padding: '8px 12px 8px 36px', border: '1px solid #E9EDF3', borderRadius: 10, background: '#fff', color: '#1A202C', outline: 'none', width: '100%' }} />
            </div>
          </div>

          <div style={{ padding: '16px 28px 28px' }}>
            {sortedRequests.length === 0 ? (
              <EmptyState icon={<ClipboardList size={28} />} title="No requests yet" description="Submit a quotation or order request and track it here." />
            ) : (
              <>
                <div style={{ fontSize: 12, fontWeight: 500, color: '#4A5568', marginBottom: 8 }}>
                  Showing {requests.length} of {total} request{total !== 1 ? 's' : ''}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {sortedRequests.map((r: any) => {
                    const itemCount = (r.items || []).reduce((sum: number, i: any) => sum + Number(i.quantity || 0), 0);
                    const friendlyStatus = FRIENDLY_STATUS_MAP[r.status] || r.status;
                    const requestNumber = r.request_number || r.id.slice(0, 8);
                    const date = new Date(r.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
                    const subtotal = formatK(Number(r.subtotal || 0));
                    return (
                      <div
                        key={r.id}
                        onClick={() => navigate(`/portal/requests/${r.id}`)}
                        style={{ background: '#fff', borderRadius: 12, padding: '12px 14px', border: '1px solid #E9EDF3', borderLeft: '4px solid #d99a3f', display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer', boxShadow: '0 1px 3px rgba(0,0,0,.04)', transition: 'all .15s ease' }}
                      >
                        <div style={{ width: 34, height: 34, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#FFFAF0', flexShrink: 0 }}>
                          <ClipboardList size={16} color="#b97e2b" />
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 600, color: '#1A202C' }}>{requestNumber}</div>
                          <div style={{ fontSize: 10, color: '#8A94A6', marginTop: 1, lineHeight: 1.3 }}>
                            {date} \u2022 {itemCount} item{itemCount === 1 ? '' : 's'} \u2022 K {Number(r.subtotal || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </div>
                        </div>
                        <div style={{ marginLeft: 'auto', padding: '4px 10px', borderRadius: 6, background: '#ECFDF5', fontSize: 10, fontWeight: 600, color: '#0f544c', display: 'flex', alignItems: 'center', gap: 3, flexShrink: 0, border: '1px solid #d3ece9' }}>
                          View
                          <ChevronRight size={10} />
                        </div>
                      </div>
                    );
                  })}
                </div>
                {totalPages > 1 && (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 16, fontSize: 12, color: '#4A5568' }}>
                    <span>Page {page} of {totalPages}</span>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1} style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid #E9EDF3', background: '#fff', cursor: page <= 1 ? 'not-allowed' : 'pointer', opacity: page <= 1 ? 0.5 : 1, fontSize: 12, fontWeight: 600, color: '#4A5568', fontFamily: F }}>Previous</button>
                      <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages} style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid #E9EDF3', background: '#fff', cursor: page >= totalPages ? 'not-allowed' : 'pointer', opacity: page >= totalPages ? 0.5 : 1, fontSize: 12, fontWeight: 600, color: '#4A5568', fontFamily: F }}>Next</button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </>
      )}

      {tab === 'quotations' && (
        <>
          <div style={{ padding: '20px 28px 8px' }}>
            {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <div style={{ position: 'relative', flex: '1 1 240px' }}>
                <Search size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#8A94A6', pointerEvents: 'none', zIndex: 1 }} />
                <PortalInput label="" placeholder="Search quotations..." value={search} onChange={(v) => { setPage(1); setSearch(v); }} onFocus={() => {}} onBlur={() => {}} style={{ paddingLeft: 36, fontSize: 13, fontFamily: F, padding: '8px 12px 8px 36px', border: '1px solid #E9EDF3', borderRadius: 10, background: '#fff', color: '#1A202C', outline: 'none', width: '100%' }} />
              </div>
              <select
                value={filter}
                onChange={(e) => { setPage(1); setFilter(e.target.value); }}
                style={{
                  fontFamily: F, fontSize: 13, fontWeight: 500,
                  color: '#1A202C', background: '#fff',
                  border: '1px solid #E9EDF3', borderRadius: 10,
                  padding: '8px 32px 8px 12px', outline: 'none', cursor: 'pointer',
                  minWidth: 130, lineHeight: 1.4,
                  appearance: 'none', backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%235c6567'/%3E%3C/svg%3E")`,
                  backgroundRepeat: 'no-repeat', backgroundPosition: 'right 12px center'
                }}
              >
                <option value="all">All Statuses</option>
                <option value="ready">Ready</option>
                <option value="accepted">Accepted</option>
                <option value="rejected">Rejected</option>
                <option value="revision_requested">Revision Requested</option>
                <option value="converted">Converted</option>
              </select>
            </div>
          </div>

          <div style={{ padding: '16px 28px 28px' }}>
            {sortedQuotations.length === 0 ? (
              <EmptyState icon={<FileText size={28} />} title="No quotations yet" description="Your quotations will appear here once created." />
            ) : (
              <>
                <div style={{ fontSize: 12, fontWeight: 500, color: '#4A5568', marginBottom: 8 }}>
                  Showing {quotations.length} of {total} quotation{total !== 1 ? 's' : ''}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {sortedQuotations.map((q: any) => {
                    const friendlyStatus = FRIENDLY_STATUS_MAP[q.status] || q.status;
                    const isExpired = q.status === 'expired' || (q.valid_until && new Date(q.valid_until) < new Date());
                    const isExpiringSoon = q.valid_until && !isExpired && (new Date(q.valid_until).getTime() - Date.now()) < 7 * 86400000;
                    const quotationNumber = q.quotation_number || q.id.slice(0, 8);
                    const date = new Date(q.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
                    const total = Number(q.total_amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 });
                    return (
                      <div
                        key={q.id}
                        onClick={() => navigate(`/portal/quotations/${q.id}`)}
                        style={{ background: '#fff', borderRadius: 12, padding: '12px 14px', border: '1px solid #E9EDF3', borderLeft: '4px solid #4ed3c7', display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer', boxShadow: '0 1px 3px rgba(0,0,0,.04)', transition: 'all .15s ease' }}
                      >
                        <div style={{ width: 34, height: 34, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#ECFDF5', flexShrink: 0 }}>
                          <FileText size={16} color="#1f8577" />
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 600, color: '#1A202C' }}>{quotationNumber}</div>
                          <div style={{ fontSize: 10, color: '#8A94A6', marginTop: 1, lineHeight: 1.3 }}>
                            {date} \u2022 {friendlyStatus}
                            {isExpired && ' \u2022 Expired'}
                            {isExpiringSoon && !isExpired && ' \u2022 Expiring soon'}
                          </div>
                        </div>
                        <div style={{ textAlign: 'right', minWidth: 80 }}>
                          <div style={{ fontSize: 14, fontWeight: 600, color: '#1A202C', fontFamily: "'JetBrains Mono', monospace", fontVariantNumeric: 'tabular-nums', lineHeight: 1.35 }}>
                            K {total}
                          </div>
                          <div style={{ fontSize: 10, color: '#8A94A6', textTransform: 'uppercase', marginTop: 1, lineHeight: 1.3 }}>
                            Total
                          </div>
                        </div>
                        <div style={{ marginLeft: 'auto', padding: '4px 10px', borderRadius: 6, background: '#ECFDF5', fontSize: 10, fontWeight: 600, color: '#0f544c', display: 'flex', alignItems: 'center', gap: 3, flexShrink: 0, border: '1px solid #d3ece9' }}>
                          View
                          <ChevronRight size={10} />
                        </div>
                      </div>
                    );
                  })}
                </div>
                {totalPages > 1 && (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 16, fontSize: 12, color: '#4A5568' }}>
                    <span>Page {page} of {totalPages}</span>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1} style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid #E9EDF3', background: '#fff', cursor: page <= 1 ? 'not-allowed' : 'pointer', opacity: page <= 1 ? 0.5 : 1, fontSize: 12, fontWeight: 600, color: '#4A5568', fontFamily: F }}>Previous</button>
                      <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages} style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid #E9EDF3', background: '#fff', cursor: page >= totalPages ? 'not-allowed' : 'pointer', opacity: page >= totalPages ? 0.5 : 1, fontSize: 12, fontWeight: 600, color: '#4A5568', fontFamily: F }}>Next</button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </>
      )}

      {confirmReorder.open && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onMouseDown={(e) => { if (e.target === e.currentTarget) setConfirmReorder({ open: false, order: null }); }}>
          <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #E9EDF3', boxShadow: '0 20px 60px rgba(0,0,0,.2)', maxWidth: 440, width: '90%' }} role="dialog" aria-modal="true" aria-labelledby="reorder-title">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 22px', borderBottom: '1px solid #F3F4F6' }}>
              <h2 id="reorder-title" style={{ fontSize: 16, fontWeight: 700, color: '#1A202C', margin: 0, fontFamily: F }}>Confirm Reorder</h2>
              <button onClick={() => setConfirmReorder({ open: false, order: null })} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, borderRadius: 8, color: '#8A94A6', display: 'flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28 }} aria-label="Close dialog">
                <span style={{ fontSize: 18, lineHeight: 1 }}>\u00D7</span>
              </button>
            </div>
            <div style={{ padding: '18px 22px', fontSize: 13, fontWeight: 500, color: '#4A5568', lineHeight: 1.5 }}>
              Create a new order request based on order <strong style={{ color: '#1A202C', fontFamily: "'JetBrains Mono', monospace" }}>#{confirmReorder.order?.orderNumber || confirmReorder.order?.id.slice(0, 8)}</strong>? This will be reviewed by our team.
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', padding: '14px 22px', borderTop: '1px solid #F3F4F6' }}>
              <button onClick={() => setConfirmReorder({ open: false, order: null })} style={{ padding: '6px 14px', borderRadius: 8, cursor: 'pointer', border: '1px solid #E9EDF3', background: '#fff', color: '#4A5568', fontSize: 12, fontWeight: 600, fontFamily: F, lineHeight: 1.4 }}>Cancel</button>
              <button onClick={handleReorderConfirm} style={{ padding: '6px 14px', borderRadius: 8, cursor: 'pointer', border: '1px solid #008A4C', background: '#008A4C', color: '#fff', fontSize: 12, fontWeight: 600, fontFamily: F, lineHeight: 1.4 }}>Create Reorder</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CustomerOrders;
