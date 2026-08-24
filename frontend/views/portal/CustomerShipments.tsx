import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Eye, Search, Loader2, Truck } from 'lucide-react';
import { portalLifecycle, PortalShipmentRecord } from '../../services/portalApiClient';
import { useCustomerAuth } from '../../context/CustomerAuthContext';
import { useToast } from './components/Toast';
import PortalPageHeader from './components/PortalPageHeader';
import PortalInput from './components/PortalInput';
import PortalCard from './components/PortalCard';
import ErrorBanner from './components/ErrorBanner';
import EmptyState from './components/EmptyState';
import StatusBadge from './components/StatusBadge';
import PortalLoadingSkeleton from './components/PortalLoadingSkeleton';
import { SHIPMENT_STATUS_META, DEFAULT_PAGE_SIZE } from './constants';
import { F } from './portalStyles';

const CustomerShipments: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useCustomerAuth();
  const { addToast } = useToast();
  const [shipments, setShipments] = useState<PortalShipmentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params: Record<string, string> = { search: search || undefined };
      if (statusFilter !== 'All') params.status = statusFilter;
      const data = await portalLifecycle.shipments.list();
      let filtered = data;
      if (search) {
        const q = search.toLowerCase();
        filtered = filtered.filter((s) =>
          (s.order_number || '').toLowerCase().includes(q) ||
          (s.tracking_number || '').toLowerCase().includes(q) ||
          (s.customerName || '').toLowerCase().includes(q)
        );
      }
      if (statusFilter !== 'All') {
        filtered = filtered.filter((s) => s.status === statusFilter);
      }
      setShipments(filtered);
    } catch (err: any) {
      setError(err.message || 'Failed to load shipments');
    } finally {
      setLoading(false);
    }
  }, [search, statusFilter]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    let cancelled = false;
    let unsubscribe: (() => void) | undefined;
    (async () => {
      unsubscribe = await portalLifecycle.subscribe({
        onEvent: (type, payload) => {
          if (type === 'entity_changed' && payload?.docType === 'order' && !cancelled) load();
        },
      });

    })();
    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [load]);

  const availableStatuses = useMemo(() => {
    const set = new Set(shipments.map((s) => s.status));
    return ['All', ...Array.from(set).sort()];
  }, [shipments]);

  if (loading) return <div style={{ padding: 32, maxWidth: 56, margin: '0 auto' }}><PortalLoadingSkeleton type="table" count={6} /></div>;

  return (
    <div style={{ fontFamily: F, fontSize: 13, lineHeight: 1.4, color: '#2D3748' }}>
      <PortalPageHeader
        title="Shipments & Tracking"
        subtitle="Track your orders in transit"
        icon={Truck}
      />

      <div style={{ padding: '20px 28px 8px' }}>
        {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <div style={{ position: 'relative', flex: '1 1 240px' }}>
            <Search size={16} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#8A94A6' }} />
            <PortalInput label="" placeholder="Search by order #, tracking #..." value={search} onChange={(v) => setSearch(v)} onFocus={() => {}} onBlur={() => {}} style={{ paddingLeft: 32 }} />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            aria-label="Filter by status"
            style={{
              fontFamily: F,
              fontSize: 13,
              padding: '8px 32px 8px 12px',
              border: '1px solid #E9EDF3',
              borderRadius: 10,
              background: '#fff',
              color: '#1A202C',
              appearance: 'none',
              backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%235c6567'/%3E%3C/svg%3E")`,
              backgroundRepeat: 'no-repeat',
              backgroundPosition: 'right 12px center',
              cursor: 'pointer',
              outline: 'none',
            }}
          >
            {availableStatuses.map((s) => <option key={s} value={s}>{s === 'All' ? 'All Statuses' : s}</option>)}
          </select>
        </div>
      </div>

      <div style={{ padding: '16px 28px 28px' }}>
        {shipments.length === 0 ? (
          <EmptyState icon={<Truck size={28} />} title="No shipments yet" description={search || statusFilter !== 'All' ? 'No shipments match your filters.' : 'When your orders are shipped, tracking information will appear here.'} />
        ) : (
          <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #E9EDF3', overflow: 'hidden' }}>
            <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
              {shipments.map((shipment) => {
                const statusKey = shipment.status.toLowerCase();
                const statusMeta = SHIPMENT_STATUS_META[statusKey] || SHIPMENT_STATUS_META.draft;
                const orderNumber = shipment.order_number || shipment.id.slice(0, 8);
                const date = shipment.orderDate ? new Date(shipment.orderDate).toLocaleDateString() : '';
                const carrier = shipment.carrier || '—';
                const tracking = shipment.tracking_number || '—';
                const estDelivery = shipment.estimated_delivery ? new Date(shipment.estimated_delivery).toLocaleDateString() : '—';
                return (
                  <PortalCard hoverable key={shipment.id}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <div style={{ width: 34, height: 34, borderRadius: 10, background: '#eef7f6', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <Truck size={15} style={{ color: '#146b60' }} />
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: 13, color: '#1A202C' }}>#{orderNumber}</div>
                      </div>
                      <StatusBadge status={shipment.status} type="order" />
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, fontSize: 13, fontWeight: 500, color: '#4A5568', marginTop: 8 }}>
                      <span style={{ color: '#8A94A6', fontSize: 10.5 }}>Date: <span style={{ color: '#4A5568' }}>{date}</span></span>
                      <span style={{ color: '#8A94A6', fontSize: 10.5 }}>Carrier: <span style={{ color: '#4A5568' }}>{carrier}</span></span>
                      <span style={{ color: '#8A94A6', fontSize: 10.5 }}>Tracking: <span style={{ color: '#4A5568' }}>{tracking}</span></span>
                      <span style={{ color: '#8A94A6', fontSize: 10.5 }}>Est. Delivery: <span style={{ color: '#4A5568' }}>{estDelivery}</span></span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 10 }} onClick={(e) => e.stopPropagation()}>
                      <div style={{ display: 'flex', justifyContent: 'center', gap: 4, alignItems: 'center', flexShrink: 0 }}>
                        <button
                          onClick={() => navigate(`/portal/shipments/${shipment.id}`)}
                          style={{
                            padding: 8,
                            color: '#4A5568',
                            background: '#F7FAFC',
                            border: '1px solid transparent',
                            borderRadius: 8,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            transition: 'all .15s ease',
                          }}
                          title="Track shipment"
                          aria-label={`Track shipment for order ${shipment.order_number || shipment.id}`}
                        >
                          <Eye size={14} />
                        </button>
                      </div>
                    </div>
                  </PortalCard>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default CustomerShipments;
