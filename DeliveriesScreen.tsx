import React from 'react';

export type DeliveryStatus = 'IN_TRANSIT' | 'OUT_FOR_DELIVERY' | 'DELIVERED' | 'PENDING';

export interface DeliveryEntity {
  id: string;
  orderId: string;
  trackingNumber: string;
  status: DeliveryStatus;
  driverName: string;
  vehicleNo: string;
  deliveryAddress: string;
  estimatedArrival: string;
}

interface DeliveriesScreenProps {
  deliveries: DeliveryEntity[];
  onTrackDelivery: (delivery: DeliveryEntity) => void;
}

const F = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";

const DeliveriesScreen: React.FC<DeliveriesScreenProps> = ({ deliveries, onTrackDelivery }) => {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', fontFamily: F }}>
      <div style={{ padding: 16, background: '#fff', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{
            width: 40, height: 40, borderRadius: 12,
            background: '#EEF2FF', display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#4F46E5'
          }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2" />
              <path d="M15 18H9" />
              <path d="M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.624l-3.48-4.35A1 1 0 0 0 17.52 8H14" />
              <circle cx="17" cy="18" r="2" />
              <circle cx="7" cy="18" r="2" />
            </svg>
          </div>
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 700, color: '#111827', margin: 0, lineHeight: 1.3 }}>Deliveries</h1>
            <p style={{ fontSize: 13, color: '#6B7280', margin: 0, marginTop: 2 }}>Live dispatch notifications and real-time shipment tracking.</p>
          </div>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
        {deliveries.length === 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 220, gap: 12 }}>
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2" />
              <path d="M15 18H9" />
              <path d="M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.624l-3.48-4.35A1 1 0 0 0 17.52 8H14" />
              <circle cx="17" cy="18" r="2" />
              <circle cx="7" cy="18" r="2" />
            </svg>
            <p style={{ color: '#6B7280', fontSize: 14 }}>No active or past deliveries found.</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {deliveries.map((delivery) => (
              <div key={delivery.id} style={{
                background: '#fff',
                borderRadius: 16,
                border: '1px solid #F3F4F6',
                padding: 16,
                boxShadow: '0 1px 2px rgba(0,0,0,0.04)'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 15, fontWeight: 700, color: '#111827' }}>Order {delivery.orderId}</div>
                    <div style={{ fontSize: 12, color: '#6B7280', marginTop: 2 }}>Tracking: {delivery.trackingNumber}</div>
                  </div>
                  <StatusChip status={delivery.status} />
                </div>

                <div style={{ height: 1, background: '#F3F4F6', margin: '14px 0' }} />

                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#4F46E5" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                    <circle cx="12" cy="7" r="4" />
                  </svg>
                  <span style={{ fontSize: 14, color: '#374151' }}>{delivery.driverName} · {delivery.vehicleNo}</span>
                </div>

                <div style={{ height: 10 }} />

                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#4F46E5" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
                    <circle cx="12" cy="10" r="3" />
                  </svg>
                  <span style={{ fontSize: 13, color: '#6B7280', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{delivery.deliveryAddress}</span>
                </div>

                <div style={{ height: 1, background: '#F3F4F6', margin: '14px 0' }} />

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#4F46E5" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="10" />
                      <polyline points="12 6 12 12 16 14" />
                    </svg>
                    <div>
                      <div style={{ fontSize: 11, color: '#6B7280', textTransform: 'uppercase', letterSpacing: 0.05 }}>Estimated arrival</div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: '#4F46E5', marginTop: 1 }}>{delivery.estimatedArrival}</div>
                    </div>
                  </div>
                  <button
                    onClick={() => onTrackDelivery(delivery)}
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: 6,
                      padding: '8px 16px', borderRadius: 10,
                      border: '1px solid #E5E7EB', background: '#fff',
                      color: '#374151', fontSize: 13, fontWeight: 600,
                      cursor: 'pointer', fontFamily: F
                    }}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
                      <circle cx="12" cy="10" r="3" />
                    </svg>
                    Live Tracking
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

const StatusChip: React.FC<{ status: DeliveryStatus }> = ({ status }) => {
  const config = {
    DELIVERED: { bg: '#D1FAE5', text: '#065F46' },
    OUT_FOR_DELIVERY: { bg: '#DBEAFE', text: '#1E40AF' },
    IN_TRANSIT: { bg: '#FEF3C7', text: '#92400E' },
    PENDING: { bg: '#F3F4F6', text: '#374151' },
  }[status] || { bg: '#F3F4F6', text: '#374151' };

  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center',
      padding: '4px 10px', borderRadius: 8,
      background: config.bg, color: config.text,
      fontSize: 11, fontWeight: 700, textTransform: 'capitalize',
      border: `1px solid ${config.text}25`
    }}>
      {status.replace('_', ' ').toLowerCase()}
    </span>
  );
};

export default DeliveriesScreen;
