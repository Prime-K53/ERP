import React, { useCallback, useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, MapPin, Clock, User, Car, Package, FileText } from 'lucide-react';
import { portalLifecycle, PortalShipmentRecord } from '../../services/portalApiClient';
import { useAuth } from '../../context/AuthContext';
import PortalButton from './components/PortalButton';
import ErrorBanner from './components/ErrorBanner';
import StatusBadge from './components/StatusBadge';
import PortalLoadingSkeleton from './components/PortalLoadingSkeleton';
import { F } from './portalStyles';
import { SHIPMENT_STATUS_META } from './constants';

const root: React.CSSProperties = { fontFamily: F, fontSize: 13, lineHeight: 1.4, color: '#2D3748', padding: 24, maxWidth: 800, margin: '0 auto' };
const card: React.CSSProperties = { background: '#fff', borderRadius: 12, padding: '12px 14px', marginBottom: 10, border: '1px solid #E9EDF3' };
const label: React.CSSProperties = { fontSize: 10.5, fontWeight: 600, color: '#8A94A6', textTransform: 'uppercase', letterSpacing: '0.03em' };
const body: React.CSSProperties = { fontSize: 13, fontWeight: 500, color: '#4A5568' };
const muted: React.CSSProperties = { fontSize: 10.5, color: '#8A94A6' };
const value: React.CSSProperties = { fontSize: 13, fontWeight: 600, color: '#1A202C' };

const CustomerShipmentDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { companyConfig } = useAuth();
  const [shipment, setShipment] = useState<PortalShipmentRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const data = await portalLifecycle.shipments.get(id);
      setShipment(data);
    } catch (err: any) {
      setError(err.message || 'Failed to load shipment');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    let unsubscribe: (() => void) | undefined;
    (async () => {
      unsubscribe = await portalLifecycle.subscribe({
        onEvent: (type, payload) => {
          if (type === 'entity_changed' && payload?.docType === 'order' && payload?.docId === id && !cancelled) load();
        },
      });

    })();
    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [id, load]);

  const formatDate = (value: string | null | undefined) => {
    if (!value) return '—';
    const d = new Date(value);
    return isNaN(d.getTime()) ? '—' : d.toLocaleString();
  };

  const parseLocation = (raw: string | null | undefined) => {
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed.lat === 'number' && typeof parsed.lng === 'number') return parsed;
    } catch { /* ignore */ }
    return null;
  };

  const parseProof = (raw: string | null | undefined) => {
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch { /* ignore */ }
    return null;
  };

  if (loading) return <div style={root}><PortalLoadingSkeleton type="detail" /></div>;
  if (error) return <div style={root}><ErrorBanner message={error} onDismiss={() => setError(null)} /></div>;
  if (!shipment) return null;

  const statusKey = shipment.status.toLowerCase();
  const statusMeta = SHIPMENT_STATUS_META[statusKey] || SHIPMENT_STATUS_META.draft;
  const location = parseLocation(shipment.current_location);
  const proof = parseProof(shipment.proof_of_delivery);

  const stageDefinitions = [
    { key: 'processing', label: 'Processing', description: 'Order is being prepared' },
    { key: 'shipped', label: 'Shipped', description: 'In transit' },
    { key: 'out_for_delivery', label: 'Out for Delivery', description: 'With the courier' },
    { key: 'delivered', label: 'Delivered', description: 'Order delivered' },
  ];

  const currentStage = (() => {
    const s = shipment.status.toLowerCase();
    if (s === 'delivered' || s === 'fulfilled') return 4;
    if (s === 'out_for_delivery') return 3;
    if (s === 'shipped' || s === 'in_transit') return 2;
    return 1;
  })();

  return (
    <div style={root}>
      <PortalButton variant="ghost" onClick={() => navigate('/portal/shipments')} icon={ArrowLeft}>Back to Shipments</PortalButton>

      <div style={{ marginTop: 24, marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 4 }}>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: '#1A202C', margin: 0 }}>
            Order #{shipment.order_number || shipment.id.slice(0, 8)}
          </h1>
          <StatusBadge status={shipment.status} type="order" />
        </div>
        <p style={{ fontSize: 13, fontWeight: 500, color: '#8A94A6', margin: 0 }}>
          {shipment.customerName} • {shipment.orderDate ? new Date(shipment.orderDate).toLocaleDateString() : ''}
        </p>
      </div>

      {shipment.proof_of_delivery && (
        <div style={{ marginBottom: 16, padding: 16, borderRadius: 10, background: '#F0FDF4', border: '1px solid #86EFAC' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <Package size={16} style={{ color: '#0f766e' }} />
            <h2 style={{ fontSize: 14, fontWeight: 600, color: '#0f766e', margin: 0 }}>Proof of Delivery</h2>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, fontSize: 13 }}>
            {proof.receivedBy && (
              <div><span style={{ color: '#8A94A6' }}>Received by:</span> <b style={{ color: '#1A202C' }}>{proof.receivedBy}</b></div>
            )}
            {proof.timestamp && (
              <div><span style={{ color: '#8A94A6' }}>Delivered at:</span> <b style={{ color: '#1A202C' }}>{formatDate(proof.timestamp)}</b></div>
            )}
            {proof.recipientPhone && (
              <div><span style={{ color: '#8A94A6' }}>Phone:</span> <b style={{ color: '#1A202C' }}>{proof.recipientPhone}</b></div>
            )}
            {proof.remarks && (
              <div style={{ gridColumn: 'span 2' }}><span style={{ color: '#8A94A6' }}>Remarks:</span> <span style={{ color: '#4A5568' }}>{proof.remarks}</span></div>
            )}
            {proof.signatureDataUrl && (
              <div style={{ gridColumn: 'span 2' }}>
                <span style={{ color: '#8A94A6' }}>Signature:</span>
                <div style={{ marginTop: 8, padding: 8, background: '#fff', borderRadius: 8, border: '1px solid #E9EDF3', display: 'inline-block' }}>
                  <img src={proof.signatureDataUrl} alt="Delivery signature" style={{ maxHeight: 80, maxWidth: 280 }} />
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16, marginBottom: 16 }}>
        <div style={{ ...card, padding: 16 }}>
          <h3 style={{ ...label, marginBottom: 12 }}>Shipment Details</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <DetailRow icon={<Car size={14} />} label="Carrier" value={shipment.carrier || '—'} />
            <DetailRow icon={<User size={14} />} label="Driver" value={shipment.driver_name || '—'} />
            <DetailRow icon={<FileText size={14} />} label="Vehicle" value={shipment.vehicle_no || '—'} />
            <DetailRow icon={<FileText size={14} />} label="Tracking #" value={shipment.tracking_number || '—'} mono />
          </div>
        </div>

        <div style={{ ...card, padding: 16 }}>
          <h3 style={{ ...label, marginBottom: 12 }}>Schedule</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <DetailRow icon={<Clock size={14} />} label="Estimated Delivery" value={formatDate(shipment.estimated_delivery)} />
            <DetailRow icon={<Clock size={14} />} label="Actual Arrival" value={formatDate(shipment.actual_arrival)} />
            <DetailRow icon={<MapPin size={14} />} label="Last Location" value={location ? `${location.lat.toFixed(4)}, ${location.lng.toFixed(4)}` : '—'} />
          </div>
        </div>
      </div>

      <div style={{ ...card, padding: 16, marginBottom: 16 }}>
        <h3 style={{ ...label, marginBottom: 16 }}>Tracking Timeline</h3>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          {stageDefinitions.map((stage, idx) => {
            const isCompleted = idx < currentStage;
            const isCurrent = idx === currentStage - 1 && currentStage > 0;
            return (
              <div key={stage.key} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'relative' }}>
                {idx > 0 && (
                  <div style={{
                    position: 'absolute', top: 12, left: 0, width: '100%', height: 2,
                    background: isCompleted ? '#14b8a6' : '#E9EDF3',
                    left: '-50%',
                    width: '100%',
                    zIndex: 0,
                  }} />
                )}
                <div style={{
                  width: 28, height: 28, borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10,
                  background: isCurrent || isCompleted ? '#146b60' : '#fff',
                  border: `2px solid ${isCompleted || isCurrent ? '#146b60' : '#E9EDF3'}`,
                  color: isCompleted || isCurrent ? '#fff' : '#8A94A6',
                }}>
                  {isCompleted ? <Package size={12} /> : <span style={{ fontSize: 10, fontWeight: 700 }}>{idx + 1}</span>}
                </div>
                <span style={{ fontSize: 10.5, fontWeight: 600, marginTop: 4, textAlign: 'center', color: isCurrent ? '#0f544c' : '#8A94A6' }}>{stage.label}</span>
              </div>
            );
          })}
        </div>
      </div>

      {shipment.items && shipment.items.length > 0 && (
        <div style={{ ...card, padding: 16 }}>
          <h3 style={{ ...label, marginBottom: 12 }}>Items in this shipment</h3>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left', padding: '8px 14px', ...label }}>Item</th>
                  <th style={{ textAlign: 'right', padding: '8px 14px', ...label, width: 80 }}>Qty</th>
                </tr>
              </thead>
              <tbody>
                {shipment.items.map((item, idx) => (
                  <tr key={idx} style={{ borderTop: idx < shipment.items.length - 1 ? '1px solid #F3F4F6' : 'none' }}>
                    <td style={{ padding: '10px 14px', fontSize: 13, fontWeight: 600, color: '#1A202C' }}>{item.name}</td>
                    <td style={{ padding: '10px 14px', textAlign: 'right', fontSize: 13, color: '#8A94A6', fontVariantNumeric: 'tabular-nums' }}>{item.quantity}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

const DetailRow: React.FC<{ icon: React.ReactNode; label: string; value: string; mono?: boolean }> = ({ icon, label, value, mono }) => (
  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
    <span style={{ marginTop: 2, flexShrink: 0, color: '#8A94A6' }}>{icon}</span>
    <div>
      <div style={{ fontSize: 10.5, color: '#8A94A6' }}>{label}</div>
      <div style={{ fontSize: mono ? 12 : 13, fontWeight: 500, color: '#1A202C', fontFamily: mono ? "'JetBrains Mono', monospace" : undefined }}>{value}</div>
    </div>
  </div>
);

export default CustomerShipmentDetail;
