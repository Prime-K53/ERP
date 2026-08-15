import React, { useCallback, useEffect, useState } from 'react';
import {
  Truck, Clock, User, Navigation,
  Search, AlertCircle, MapPin, PackageCheck
} from 'lucide-react';
import { pdf } from '@react-pdf/renderer';
import { useAuth } from '../../context/AuthContext';
import { useToast } from './components/Toast';
import { portalLifecycle, PortalShipmentRecord, PortalDeliveryBanner } from '../../services/portalApiClient';
import { PrimeDocument } from '../shared/components/PDF/PrimeDocument';
import { initializePrimePdfFonts } from '../shared/components/PDF/templateSettings';
import { mapToInvoiceData } from '../../utils/pdfMapper';
import { enrichDocumentCustomerData } from '../../utils/documentCustomerData';
import { attachDocumentSecurity } from '../../utils/documentSecurity';
import type { PrimeDocData } from '../shared/components/PDF/schemas';

import { useCustomerAuth } from '../../context/CustomerAuthContext';
import EmptyState from './components/EmptyState';
import PortalLoadingSkeleton from './components/PortalLoadingSkeleton';
import { DeliveryTrackingModal } from './components/DeliveryTrackingModal';
import { F } from './portalStyles';

const statusBadgeStyles: Record<string, { bg: string; color: string; border: string }> = {
  delivered: { bg: '#ECFDF5', color: '#065F46', border: '#A7F3D0' },
  out_for_delivery: { bg: '#EFF6FF', color: '#1E40AF', border: '#BFDBFE' },
  dispatched: { bg: '#F8FAFC', color: '#475569', border: '#E2E8F0' },
  in_transit: { bg: '#F8FAFC', color: '#475569', border: '#E2E8F0' },
  processing: { bg: '#FFFBEB', color: '#92400E', border: '#FDE68A' },
  pending: { bg: '#FFF7ED', color: '#9A3412', border: '#FED7AA' },
};

const StatusBadge: React.FC<{ status: string }> = ({ status }) => {
  const key = status.toLowerCase().replace(/\s+/g, '_');
  const style = statusBadgeStyles[key] || statusBadgeStyles.dispatched;
  const label = status.replace(/_/g, ' ').toUpperCase();

  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 6,
      padding: '4px 10px',
      borderRadius: 9999,
      fontSize: 10.5,
      fontWeight: 700,
      letterSpacing: '0.05em',
      background: style.bg,
      color: style.color,
      border: `1px solid ${style.border}`,
      whiteSpace: 'nowrap',
      lineHeight: 1.4,
    }}>
      {label}
    </span>
  );
};

const bannerConfig: Record<string, { bg: string; border: string; color: string; label: string; icon: React.ReactNode }> = {
  inbound: {
    bg: '#EEF2FF', border: '#C7D2FE', color: '#3730A3',
    label: 'Out of Warehouse',
    icon: <PackageCheck size={16} />,
  },
  active: {
    bg: '#F5F3FF', border: '#DDD6FE', color: '#5B21B6',
    label: 'Out for Delivery',
    icon: <Truck size={16} />,
  },
  delivered: {
    bg: '#ECFDF5', border: '#A7F3D0', color: '#065F46',
    label: 'Delivered',
    icon: <PackageCheck size={16} />,
  },
};

const bannerMessage = (b: PortalDeliveryBanner) => {
  const ref = b.invoiceNumber ? `invoice ${b.invoiceNumber}` : (b.orderNumber ? `order ${b.orderNumber}` : 'your order');
  if (b.stage === 'delivered') return `Your delivery for ${ref} has been delivered.`;
  if (b.stage === 'active') return `Your delivery for ${ref} is out for delivery.`;
  return `Your delivery for ${ref} is out of the warehouse.`;
};

const DeliveryBannerStrip: React.FC<{ banners: PortalDeliveryBanner[]; onSelect?: (b: PortalDeliveryBanner) => void }> = ({ banners, onSelect }) => {
  if (!banners || banners.length === 0) return null;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
      {banners.slice(0, 4).map((b) => {
        const cfg = bannerConfig[b.stage] || bannerConfig.active;
        const ref = b.invoiceNumber ? `Invoice ${b.invoiceNumber}` : (b.orderNumber ? `Order ${b.orderNumber}` : 'Order');
        return (
          <div
            key={b.id}
            onClick={() => onSelect?.(b)}
            style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '10px 14px', borderRadius: 12,
              background: cfg.bg, border: `1px solid ${cfg.border}`, color: cfg.color,
              fontSize: 12.5, fontWeight: 600, lineHeight: 1.4,
              cursor: onSelect ? 'pointer' : 'default',
              transition: 'all .15s ease',
            }}
            onMouseEnter={(e) => {
              if (onSelect) e.currentTarget.style.transform = 'translateY(-1px)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'translateY(0)';
            }}
          >
            <span style={{ flexShrink: 0 }}>{cfg.icon}</span>
            <span style={{ flex: 1, minWidth: 0 }}>{ref}</span>
            <span style={{ flexShrink: 0, fontSize: 9, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              {cfg.label}
            </span>
          </div>
        );
      })}
    </div>
  );
};

const CustomerDeliveries: React.FC = () => {
  const { user } = useCustomerAuth();
  const { companyConfig } = useAuth();
  const { addToast } = useToast();
  const [shipments, setShipments] = useState<PortalShipmentRecord[]>([]);
  const [banners, setBanners] = useState<PortalDeliveryBanner[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [selectedShipment, setSelectedShipment] = useState<PortalShipmentRecord | null>(null);
  const [downloadingNote, setDownloadingNote] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
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
      setShipments(filtered.length > 0 ? filtered : []);
    } catch (err: any) {
      setError(err.message || 'Failed to load deliveries');
    } finally {
      setLoading(false);
    }
  }, [search]);

  const loadBanners = useCallback(() => {
    portalLifecycle.deliveries
      .banners()
      .then((list) => setBanners(Array.isArray(list) ? list : []))
      .catch(() => setBanners((prev) => prev));
  }, []);

  const handleBannerSelect = useCallback((banner: PortalDeliveryBanner) => {
    const ref = banner.orderNumber || banner.invoiceNumber;
    if (!ref) return;
    const match = shipments.find((s) => {
      const orderNum = (s.order_number || '').replace(/^ORD-/i, '');
      const trackNum = (s.tracking_number || '').replace(/^TRK-/i, '');
      return orderNum === ref || trackNum === ref;
    });
    if (match) setSelectedShipment(match);
  }, [shipments]);

  useEffect(() => {
    load();
    loadBanners();
  }, [load, loadBanners]);

  useEffect(() => {
    let cancelled = false;
    let unsubscribe: (() => void) | undefined;
    (async () => {
      unsubscribe = await portalLifecycle.subscribe({
        onEvent: (type, payload) => {
          if (
            type === 'entity_changed' &&
            payload?.docType &&
            ['order', 'shipment', 'delivery', 'delivery_note'].includes(payload.docType) &&
            !cancelled
          ) {
            load();
            loadBanners();
          }
        },
      });
    })();
    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [load, loadBanners]);

  const handleDownloadDeliveryNote = async (shipment: PortalShipmentRecord) => {
    if (downloadingNote) return;
    setDownloadingNote(shipment.id);
    try {
      const note = await portalLifecycle.deliveries.note(shipment.id);
      if (!note) {
        addToast('error', 'Delivery note not found for this delivery.');
        return;
      }
      addToast('info', 'Preparing Delivery Note PDF…');
      const enriched = enrichDocumentCustomerData(note, []);
      const pdfData = mapToInvoiceData(enriched, companyConfig, 'DELIVERY_NOTE');
      await initializePrimePdfFonts();
      const secured = await attachDocumentSecurity(pdfData, companyConfig?.companyName);
      const blob = await pdf(<PrimeDocument type="DELIVERY_NOTE" data={secured as PrimeDocData} />).toBlob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      const dnNumber = note.dnNumber || note.deliveryNoteNumber || note.id || '';
      link.download = dnNumber ? `Delivery Note - ${dnNumber}.pdf` : 'Delivery Note.pdf';
      link.click();
      URL.revokeObjectURL(url);
      addToast('success', 'Delivery Note downloaded');
    } catch (err: any) {
      addToast('error', err?.message || 'Failed to download delivery note');
    } finally {
      setDownloadingNote(null);
    }
  };

  const formatETA = (estimated_delivery?: string) => {
    if (!estimated_delivery) return '—';
    const d = new Date(estimated_delivery);
    const now = new Date();
    const diffMs = d.getTime() - now.getTime();
    const diffDays = Math.floor(diffMs / 86400000);

    if (d.toDateString() === now.toDateString()) {
      return d.toLocaleString('en-US', { hour: '2-digit', minute: '2-digit' });
    }
    if (diffDays === 0 && diffMs > 0) {
      return `Today, ${d.toLocaleString('en-US', { hour: '2-digit', minute: '2-digit' })}`;
    }
    if (diffDays === 1) {
      return `Tomorrow, ${d.toLocaleString('en-US', { hour: '2-digit', minute: '2-digit' })}`;
    }
    if (diffDays > 1 && diffDays <= 7) {
      return `In ${diffDays} days, ${d.toLocaleString('en-US', { hour: '2-digit', minute: '2-digit' })}`;
    }
    return d.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatDelivered = (estimated_delivery?: string) => {
    if (!estimated_delivery) return '—';
    return new Date(estimated_delivery).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (loading) {
    return (
      <div style={{ padding: '0 16px', maxWidth: 800, margin: '0 auto' }}>
        <PortalLoadingSkeleton type="table" count={6} />
      </div>
    );
  }

  return (
    <div style={{ fontFamily: F, fontSize: 13.5, lineHeight: 1.45, color: '#1E293B' }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 14,
        margin: '4px 16px 18px',
      }}>
        <div style={{
          width: 50, height: 50, borderRadius: 15,
          background: 'linear-gradient(160deg, #4A76B5 0%, #0F2C59 100%)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 8px 20px -8px rgba(15,44,89,0.6), inset 0 1px 0 rgba(255,255,255,0.25)',
        }}>
          <Truck size={24} style={{ color: '#fff' }} />
        </div>
        <div>
          <h1 style={{ fontSize: 21, fontWeight: 700, color: '#0F172A', margin: 0, letterSpacing: '-0.02em', lineHeight: 1.25 }}>
            Delivery Notifications &amp; Tracking
          </h1>
          <p style={{ fontSize: 13, fontWeight: 500, color: '#64748B', margin: '3px 0 0', lineHeight: 1.4 }}>
            Receive live dispatch notifications and track active logistics shipments in real time.
          </p>
        </div>
      </div>

      <div style={{ padding: '0 16px 28px' }}>
        {error && (
          <div style={{
            padding: '12px 16px',
            borderRadius: 10,
            background: '#FEF2F2',
            border: '1px solid #FECACA',
            color: '#DC2626',
            fontSize: 13,
            fontWeight: 500,
            marginBottom: 16,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}>
            <AlertCircle size={16} />
            {error}
          </div>
        )}

        {/* Live delivery status banners */}
        <DeliveryBannerStrip banners={banners} onSelect={handleBannerSelect} />

        {/* Deliveries List */}
        {shipments.length === 0 ? (
          <EmptyState
            icon={<Truck size={32} />}
            title="No deliveries yet"
            description={search ? 'No deliveries match your search.' : 'When your orders are dispatched, tracking information will appear here.'}
          />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {shipments.map((shipment, index) => {
              const orderNumber = shipment.order_number || shipment.id.slice(0, 8);
              const trackingNumber = shipment.tracking_number || '—';
              const driverName = shipment.driver_name || '—';
              const vehicleNo = shipment.vehicle_no || '—';
              const destination = shipment.shipping_address || '—';

              const displayOrderNumber = orderNumber.replace(/^ORD-/i, '');
              const displayTrackingNumber = trackingNumber.replace(/^TRK-/i, '');

              const status = (shipment.status || '').toLowerCase();
              const isDelivered = status === 'delivered' || status === 'fulfilled';
              const etaText = isDelivered
                ? formatDelivered(shipment.estimated_delivery)
                : formatETA(shipment.estimated_delivery);

              return (
                <div
                  key={shipment.id}
                  onClick={() => setSelectedShipment(shipment)}
                  style={{
                    padding: '16px',
                    borderRadius: 12,
                    background: '#fff',
                    border: '1px solid #E2E8F0',
                    cursor: 'pointer',
                    transition: 'all 200ms cubic-bezier(.4,0,.2,1)',
                    boxShadow: '0 1px 3px rgba(15,23,42,0.04)',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.boxShadow = '0 4px 12px rgba(15,23,42,0.08)';
                    e.currentTarget.style.borderColor = '#CBD5E1';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.boxShadow = '0 1px 3px rgba(15,23,42,0.04)';
                    e.currentTarget.style.borderColor = '#E2E8F0';
                  }}
                >
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {/* Order + Status */}
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <h3 style={{ fontSize: 15, fontWeight: 700, color: '#0F172A', margin: 0, lineHeight: 1.3, fontFamily: "'JetBrains Mono', monospace", fontVariantNumeric: 'tabular-nums' }}>
                          Order ORD-{displayOrderNumber}
                        </h3>
                        <div style={{ fontSize: 12, color: '#64748B', marginTop: 2 }}>
                          Tracking No: TRK-{displayTrackingNumber}
                        </div>
                      </div>
                      <StatusBadge status={shipment.status} />
                    </div>

                    {/* Driver */}
                    <div style={{ fontSize: 12.5, color: '#475569', lineHeight: 1.5, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <User size={13} style={{ color: '#64748B', flexShrink: 0 }} />
                      <span>
                        Driver: {driverName}{driverName !== '—' ? ` (${vehicleNo})` : ''}
                      </span>
                    </div>

                    {/* Address */}
                    <div style={{ fontSize: 12.5, color: '#475569', lineHeight: 1.5, display: 'flex', alignItems: 'flex-start', gap: 6 }}>
                      <MapPin size={13} style={{ color: '#64748B', flexShrink: 0, marginTop: 2 }} />
                      <span>{destination}</span>
                    </div>

                    {/* Estimated Arrival + Live Tracking */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', marginTop: 2 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, flex: '1 1 auto' }}>
                        <Clock size={14} style={{ color: '#2563EB', flexShrink: 0 }} />
                        <span style={{ fontSize: 11, fontWeight: 600, color: '#1E40AF', whiteSpace: 'nowrap' }}>Estimated Arrival</span>
                        <span style={{ fontSize: 10.5, color: '#64748B', whiteSpace: 'nowrap' }}>
                          {isDelivered ? `Delivered ${etaText}` : etaText}
                        </span>
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedShipment(shipment);
                        }}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 6,
                          padding: '6px 12px',
                          borderRadius: 8,
                          background: '#0F2C59',
                          color: '#fff',
                          fontSize: 12,
                          fontWeight: 700,
                          border: 'none',
                          cursor: 'pointer',
                          whiteSpace: 'nowrap',
                          transition: 'all 0.15s ease',
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = '#1E3A8A';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = '#0F2C59';
                        }}
                      >
                        <Navigation size={13} />
                        Live Tracking
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Search */}
        <div style={{ position: 'relative', marginTop: 20 }}>
          <Search size={16} style={{
            position: 'absolute',
            left: 14,
            top: '50%',
            transform: 'translateY(-50%)',
            color: '#94A3B8',
          }} />
          <input
            type="text"
            placeholder="Search by order #, tracking #, or customer..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              width: '100%',
              padding: '10px 14px 10px 40px',
              borderRadius: 12,
              background: '#fff',
              border: '1px solid #E2E8F0',
              fontSize: 13,
              fontWeight: 500,
              color: '#1E293B',
              fontFamily: F,
              outline: 'none',
              boxShadow: '0 1px 3px rgba(15,23,42,0.04)',
              transition: 'all 0.15s ease',
            }}
          />
        </div>
      </div>

      {/* Live Tracking Modal */}
      {selectedShipment && (
        <DeliveryTrackingModal
          delivery={{
            id: selectedShipment.id,
            orderId: (selectedShipment.order_number || selectedShipment.id.slice(0, 8)).replace(/^ORD-/i, ''),
            trackingNumber: (selectedShipment.tracking_number || '—').replace(/^TRK-/i, ''),
            status: selectedShipment.status || 'processing',
            estimatedArrival: selectedShipment.estimated_delivery,
            driverName: selectedShipment.driver_name,
            driverPhone: selectedShipment.driver_phone,
            vehicleNumber: selectedShipment.vehicle_no,
            carrier: selectedShipment.carrier,
            shippingAddress: selectedShipment.shipping_address,
          }}
          isOpen
          onClose={() => setSelectedShipment(null)}
          onDownloadDeliveryNote={() => handleDownloadDeliveryNote(selectedShipment)}
          downloadingNote={downloadingNote === selectedShipment.id}
        />
      )}
    </div>
  );
};

export default CustomerDeliveries;
