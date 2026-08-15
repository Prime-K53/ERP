import React, { useCallback, useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Download, MessageSquare, CheckCircle2, ShoppingCart, RotateCcw, Truck, FileText } from 'lucide-react';
import { createElement } from 'react';
import { pdf } from '@react-pdf/renderer';
import { portalApi, portalLifecycle, TimelineEvent } from '../../services/portalApiClient';
import { mapToInvoiceData } from '../../utils/pdfMapper';
import { attachDocumentSecurity } from '../../utils/documentSecurity';
import { initializePrimePdfFonts } from '../shared/components/PDF/templateSettings';
import { PrimeDocument } from '../shared/components/PDF/PrimeDocument';
import { useAuth } from '../../context/AuthContext';
import StatusBadge from './components/StatusBadge';
import PortalLoadingSkeleton from './components/PortalLoadingSkeleton';
import DocumentChain from './components/DocumentChain';
import DocumentDiscussion from './components/DocumentDiscussion';
import ConfirmDialog from './components/ConfirmDialog';
import ErrorBanner from './components/ErrorBanner';
import PortalButton from './components/PortalButton';
import { F } from './portalStyles';
import { formatK } from './constants';

interface OrderItem {
  name: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
}

interface OrderDetail {
  id: string;
  orderNumber?: string;
  order_date?: string;
  orderDate: string;
  customerName: string;
  totalAmount: number;
  subtotal?: number;
  discountTotal?: number;
  promotion?: {
    id: string;
    code: string | null;
    name: string;
    discountType: string;
    discountValue: number;
    discountAmount: number;
    discountPercent: number;
    channel: string;
    appliedAt?: string | null;
  } | null;
  status: string;
  items: OrderItem[];
  notes?: string;
  quotation_id?: string | null;
  tracking_number?: string | null;
  carrier?: string | null;
  driver_name?: string | null;
  vehicle_no?: string | null;
  estimated_delivery?: string | null;
  actual_arrival?: string | null;
  current_location?: string | null;
  proof_of_delivery?: string | null;
  shipping_address?: string | null;
}

const stageDefinitions = [
  { key: 'quotation_accepted', label: 'Accepted', description: 'Quotation accepted' },
  { key: 'confirmed', label: 'Confirmed', description: 'Order confirmed by our team' },
  { key: 'processing', label: 'Processing', description: 'Order being prepared' },
  { key: 'shipped', label: 'Shipped', description: 'In transit' },
  { key: 'delivered', label: 'Delivered', description: 'Order delivered' },
];

function stageIndex(status: string): number {
  const normalized = status.toLowerCase().replace(/\s+/g, '');
  if (normalized === 'delivered' || normalized === 'fulfilled' || normalized === 'complete') return 5;
  if (normalized === 'shipped' || normalized === 'in_transit' || normalized === 'out_for_delivery') return 4;
  if (normalized === 'processing' || normalized === 'inprogress' || normalized === 'in_progress') return 3;
  if (normalized === 'confirmed') return 2;
  return 1;
}

const s = {
  root: { fontFamily: F, fontSize: 13.5, lineHeight: 1.45, color: '#1E293B', padding: 24, maxWidth: 800, margin: '0 auto' } as React.CSSProperties,
  card: { background: '#fff', borderRadius: 12, padding: '12px 14px', marginBottom: 10, border: '1px solid #E9EDF3' } as React.CSSProperties,
  cardNoPad: { background: '#fff', borderRadius: 12, marginBottom: 10, border: '1px solid #E9EDF3', overflow: 'hidden' as const } as React.CSSProperties,
  cardHeader: { padding: '10px 14px', borderBottom: '1px solid #E9EDF3' } as React.CSSProperties,
  sectionTitle: { fontSize: 14, fontWeight: 600, color: '#1A202C', margin: 0 } as React.CSSProperties,
  label: { fontSize: 12, fontWeight: 600, color: '#64748B', textTransform: 'uppercase' as const, letterSpacing: '0.03em' } as React.CSSProperties,
  body: { fontSize: 13, fontWeight: 500, color: '#4A5568' } as React.CSSProperties,
  muted: { fontSize: 12, color: '#64748B' } as React.CSSProperties,
  value: { fontSize: 13, fontWeight: 600, color: '#1A202C' } as React.CSSProperties,
  row: { padding: '8px 14px', borderTop: '1px solid #F3F4F6', display: 'flex', alignItems: 'center' } as React.CSSProperties,
  th: { padding: '8px 14px', fontSize: 13.5, fontWeight: 600, color: '#475569', borderTop: '1px solid #F3F4F6' } as React.CSSProperties,
  thRight: { padding: '8px 14px', fontSize: 13.5, fontWeight: 600, color: '#475569', textAlign: 'right' as const, borderTop: '1px solid #F3F4F6' } as React.CSSProperties,
  td: { padding: '8px 14px', fontSize: 13, fontWeight: 500, color: '#4A5568', borderTop: '1px solid #F3F4F6' } as React.CSSProperties,
  tdRight: { padding: '8px 14px', fontSize: 13, fontWeight: 500, color: '#4A5568', textAlign: 'right' as const, borderTop: '1px solid #F3F4F6' } as React.CSSProperties,
  tdBold: { padding: '8px 14px', fontSize: 13, fontWeight: 600, color: '#1A202C', textAlign: 'right' as const, borderTop: '1px solid #F3F4F6', fontFamily: "'JetBrains Mono', monospace" } as React.CSSProperties,
  totalBar: { padding: '10px 14px', borderTop: '1px solid #E9EDF3', display: 'flex', alignItems: 'center', justifyContent: 'space-between' } as React.CSSProperties,
};

const CustomerOrderDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { companyConfig } = useAuth();
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [timeline, setTimeline] = useState<TimelineEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [confirmReorder, setConfirmReorder] = useState<{ open: boolean; order: OrderDetail | null }>({ open: false, order: null });
  const [deliveryCountdown, setDeliveryCountdown] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const o = await portalApi.get<any>(`/orders/${id}`);
      setOrder({
        id: o.id,
        orderNumber: o.order_number || o.orderNumber,
        orderDate: o.orderDate || o.order_date || o.created_at || '',
        customerName: o.customerName || o.customer_name || '',
        totalAmount: Number(o.total ?? o.subtotal ?? 0),
        subtotal: Number(o.subtotal ?? 0),
        discountTotal: Number(o.discount_total ?? o.discountTotal ?? 0),
        promotion: o.promotion || null,
        status: o.status || 'Draft',
        items: (o.items || []).map((item: any) => {
          const quantity = Number(item.quantity ?? 1);
          const unitPrice = Number(item.unitPrice ?? item.price ?? 0);
          return {
            name: item.description || item.name || item.productName || 'Item',
            quantity,
            unitPrice,
            lineTotal: Number(item.lineTotal ?? (quantity * unitPrice)),
          };
        }),
        notes: o.notes || '',
        quotation_id: o.quotation_id || null,
        tracking_number: o.tracking_number || null,
        carrier: o.carrier || null,
        driver_name: o.driver_name || null,
        vehicle_no: o.vehicle_no || null,
        estimated_delivery: o.estimated_delivery || null,
        actual_arrival: o.actual_arrival || null,
        current_location: o.current_location || null,
        proof_of_delivery: o.proof_of_delivery || null,
        shipping_address: o.shipping_address || null,
      });
      const events = await portalLifecycle.timeline.get('order', id);
      setTimeline(events || []);
      setError(null);
    } catch (err: any) {
      setError(err.message || 'Failed to load order');
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
          if (type === 'entity_changed' && payload.docType === 'order' && payload.docId === id && !cancelled) load();
        },
      });

    })();
    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [id, load]);

  useEffect(() => {
    if (!order?.estimated_delivery) return;
    const calcCountdown = () => {
      const now = new Date();
      const delivery = new Date(order.estimated_delivery!);
      const diff = delivery.getTime() - now.getTime();
      if (diff <= 0) return 'Delivered or overdue';
      const days = Math.floor(diff / (1000 * 60 * 60 * 24));
      const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      return `${days}d ${hours}h remaining`;
    };
    setDeliveryCountdown(calcCountdown());
    const interval = setInterval(() => {
      setDeliveryCountdown(calcCountdown());
    }, 60 * 60 * 1000);
    return () => clearInterval(interval);
  }, [order?.estimated_delivery]);

  const handleDownloadPdf = async () => {
    if (!order) return;
    setDownloading(true);
    setDownloadError(null);
    try {
      await portalLifecycle.downloads.record('order', order.id);
      const mapped = mapToInvoiceData(
        {
          ...order,
          items: order.items.map((i) => ({ desc: i.name, qty: i.quantity, price: i.unitPrice, total: i.lineTotal })),
          customerName: order.customerName,
          subtotal: order.totalAmount,
          orderDate: order.orderDate,
          status: order.status,
        },
        companyConfig,
        'ORDER'
      ) as any;
      const secured = await attachDocumentSecurity(mapped, companyConfig?.companyName);
      await initializePrimePdfFonts();
      const blob = await pdf(createElement(PrimeDocument as any, { type: 'ORDER', data: secured }) as any).toBlob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = `${order.orderNumber || order.id}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(blobUrl), 5000);
    } catch (err: any) {
      setDownloadError(err.message || 'Failed to generate PDF');
    } finally {
      setDownloading(false);
    }
  };

  const handleReorderRequest = () => {
    if (!order) return;
    setConfirmReorder({ open: true, order });
  };

  const handleReorderConfirm = async () => {
    if (!order) return;
    setConfirmReorder({ open: false, order: null });
    setLoading(true);
    try {
      const result = await portalLifecycle.orders.reorder(order.id);
      navigate(`/portal/orders?tab=requests`);
    } catch (err: any) {
      setError(err.message || 'Failed to create reorder request');
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <div style={s.root}><PortalLoadingSkeleton type="detail" /></div>;
  if (error) return <div style={s.root}><ErrorBanner message={error} onDismiss={() => setError(null)} /></div>;
  if (!order) return null;

  const currentStage = stageIndex(order.status);

  return (
    <div style={s.root}>
      <PortalButton variant="ghost" onClick={() => navigate('/portal/orders')} icon={ArrowLeft}>Back to Orders</PortalButton>

      <DocumentChain docType="order" docId={order.id} />

      {downloadError && <ErrorBanner message={downloadError} onDismiss={() => setDownloadError(null)} />}

      <ConfirmDialog
        open={confirmReorder.open}
        title="Reorder"
        message={`Create a new order request based on order ${order.orderNumber || order.id.slice(0, 8)}? This will be reviewed by our team.`}
        confirmLabel="Create Reorder"
        cancelLabel="Cancel"
        onConfirm={handleReorderConfirm}
        onCancel={() => setConfirmReorder({ open: false, order: null })}
      />

      <div style={{ ...s.card, padding: '16px 18px', marginBottom: 16 }}>
        <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 16, marginBottom: 20 }}>
          <div>
            <h1 style={{ fontSize: 18, fontWeight: 700, color: '#1A202C', margin: 0 }}>Order #{order.orderNumber || order.id.slice(0, 8)}</h1>
            <p style={{ fontSize: 13, fontWeight: 500, color: '#8A94A6', marginTop: 4 }}>
              {order.orderDate ? new Date(order.orderDate).toLocaleDateString() : ''}
              {order.notes ? ` • ${order.notes}` : ''}
            </p>
            {order.estimated_delivery && (
              <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
                <Truck size={14} style={{ color: '#8A94A6' }} />
                <span style={{ fontSize: 13, fontWeight: 500, color: '#8A94A6' }}>Estimated Delivery:</span>
                <span style={{ fontSize: 13, fontWeight: 600, color: '#1A202C' }}>
                  {new Date(order.estimated_delivery).toLocaleDateString()}
                </span>
                {deliveryCountdown && (
                  <span style={{
                    fontSize: 10, fontWeight: 600, borderRadius: 6, padding: '3px 8px',
                    background: deliveryCountdown === 'Delivered or overdue' ? '#FEF2F2' : '#ECFDF5',
                    color: deliveryCountdown === 'Delivered or overdue' ? '#B91C1C' : '#059669',
                  }}>
                    {deliveryCountdown}
                  </span>
                )}
              </div>
            )}
            {order.shipping_address && (
              <p style={{ fontSize: 10.5, color: '#8A94A6', marginTop: 4, maxWidth: 512, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }} title={order.shipping_address}>
                📍 {order.shipping_address}
              </p>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' as const }}>
            <StatusBadge status={order.status} />
            {(order as any).tracking_number && (
              <PortalButton variant="primary" onClick={() => navigate(`/portal/deliveries`)} icon={Truck}>Track Shipment</PortalButton>
            )}
            {order.status !== 'Draft' && order.status !== 'Cancelled' && (
              <PortalButton variant="secondary" onClick={() => navigate('/portal/invoices')} icon={FileText}>View Invoice</PortalButton>
            )}
            {order.status !== 'Draft' && order.status !== 'Cancelled' && (
              <PortalButton variant="secondary" onClick={handleReorderRequest} icon={RotateCcw}>Reorder</PortalButton>
            )}
            <PortalButton variant="secondary" onClick={handleDownloadPdf} icon={Download} loading={downloading}>{downloading ? 'Generating...' : 'PDF'}</PortalButton>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
          {stageDefinitions.map((stage, i) => {
            const done = currentStage > i + 1;
            const active = currentStage === i + 1;
            const isLast = i === stageDefinitions.length - 1;
            return (
              <React.Fragment key={stage.key}>
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column' as const, alignItems: 'center' }}>
                  <div style={{
                    width: 32, height: 32, borderRadius: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                    background: done ? '#059669' : active ? '#F59E0B' : '#E2E8F0',
                    color: done || active ? '#fff' : '#8A94A6',
                  }}>
                    {done ? <CheckCircle2 size={15} /> : active ? <ShoppingCart size={14} /> : <span style={{ fontSize: 10, fontWeight: 700 }}>{i + 1}</span>}
                  </div>
                  <span style={{ marginTop: 6, fontSize: 10, fontWeight: 600, textAlign: 'center' as const, color: done || active ? '#1A202C' : '#8A94A6' }}>
                    {stage.label}
                  </span>
                  <span style={{ fontSize: 9, color: '#8A94A6', textAlign: 'center' as const }}>{stage.description}</span>
                </div>
                {!isLast && <div style={{ height: 2, flex: 1, marginTop: -20, background: done ? '#059669' : '#E2E8F0', borderRadius: 1 }} />}
              </React.Fragment>
            );
          })}
        </div>

        <div style={{ fontSize: 13, fontWeight: 500, color: '#4A5568' }}>
          <span style={{ color: '#8A94A6' }}>Customer:</span> {order.customerName}
        </div>
      </div>

      <div style={s.cardNoPad}>
        <div style={s.cardHeader}>
          <h2 style={s.sectionTitle}>Order Items</h2>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={{ ...s.th, textAlign: 'left' }}>Item</th>
                <th style={s.thRight}>Qty</th>
                <th style={s.thRight}>Price</th>
                <th style={s.thRight}>Total</th>
              </tr>
            </thead>
            <tbody>
              {(order.items || []).map((item, i) => (
                <tr key={i}>
                  <td style={{ ...s.td, fontWeight: 600, color: '#1A202C' }}>{item.name}</td>
                  <td style={{ ...s.tdRight, fontVariantNumeric: 'tabular-nums' }}>{item.quantity}</td>
                  <td style={{ ...s.tdRight, fontFamily: "'JetBrains Mono', monospace" }}>{formatK(item.unitPrice)}</td>
                  <td style={{ ...s.tdBold }}>{formatK(item.lineTotal)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div style={{ padding: '10px 14px', borderTop: '1px solid #F3F4F6', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 12.5, fontWeight: 600, color: '#8A94A6', textTransform: 'uppercase', letterSpacing: '0.03em' }}>Subtotal</span>
          <span style={{ fontSize: 13, fontWeight: 600, color: '#1A202C', fontFamily: "'JetBrains Mono', monospace" }}>{formatK(order.subtotal && order.subtotal > 0 ? order.subtotal : order.totalAmount)}</span>
        </div>
        {order.promotion && Number(order.discountTotal || 0) > 0 && (
          <div style={{ padding: '8px 14px', borderTop: '1px solid #F3F4F6', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#FFFBEB' }}>
            <span style={{ fontSize: 12.5, fontWeight: 600, color: '#B45309' }}>
              {order.promotion.code || order.promotion.name} discount
            </span>
            <span style={{ fontSize: 13, fontWeight: 700, color: '#B45309', fontFamily: "'JetBrains Mono', monospace" }}>
              −{formatK(order.discountTotal)}
            </span>
          </div>
        )}
        <div style={s.totalBar}>
          <span style={{ fontSize: 13, fontWeight: 600, color: '#1A202C' }}>Total</span>
          <span style={{ fontSize: 16, fontWeight: 700, color: '#059669', fontFamily: "'JetBrains Mono', monospace" }}>{formatK(order.totalAmount)}</span>
        </div>
      </div>

      {order.promotion && Number(order.discountTotal || 0) > 0 && (
        <div style={{
          background: 'linear-gradient(135deg, #FFF7ED 0%, #FFEDD5 100%)',
          border: '1px solid #FDBA74', borderRadius: 12, padding: '14px 18px', marginBottom: 12,
          boxShadow: '0 2px 8px -4px rgba(249,115,22,.2)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
              <div style={{
                width: 38, height: 38, borderRadius: 11, flexShrink: 0,
                background: 'linear-gradient(135deg, #F97316, #EA580C)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: '0 4px 10px -4px rgba(249,115,22,.5)'
              }}>
                <span style={{ fontSize: 18 }}>🎁</span>
              </div>
              <div style={{ minWidth: 0 }}>
                <p style={{ fontSize: 11, fontWeight: 700, color: '#C2410C', textTransform: 'uppercase', letterSpacing: '0.04em', margin: 0 }}>
                  Portal Exclusive Offer{order.promotion.channel === 'BOTH' ? ' • Special Offer' : ''}
                </p>
                <p style={{ fontSize: 14, fontWeight: 700, color: '#7C2D12', margin: '3px 0 0', lineHeight: 1.35 }}>
                  {order.promotion.name}{order.promotion.code ? ` • ${order.promotion.code}` : ''}
                </p>
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <p style={{ fontSize: 20, fontWeight: 800, color: '#C2410C', margin: 0, fontFamily: "'JetBrains Mono', monospace", fontVariantNumeric: 'tabular-nums' }}>
                −{formatK(order.discountTotal)}
              </p>
              <p style={{ fontSize: 10.5, fontWeight: 600, color: '#9A3412', margin: '2px 0 0' }}>Discount applied</p>
            </div>
          </div>
        </div>
      )}
      {order.notes && (
        <div style={{ ...s.card, marginTop: 12 }}>
          <p style={{ ...s.label, marginBottom: 4 }}>Notes</p>
          <p style={{ fontSize: 13, fontWeight: 500, color: '#4A5568' }}>{order.notes}</p>
        </div>
      )}

      <div style={{ ...s.card, padding: '14px 18px', marginTop: 12 }}>
        <h2 style={{ ...s.sectionTitle, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
          <MessageSquare size={15} style={{ color: '#8A94A6' }} /> Activity Timeline
        </h2>
        {timeline.length === 0 ? (
          <p style={{ fontSize: 13, fontWeight: 500, color: '#8A94A6' }}>No activity yet.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 16 }}>
            {timeline.map((event) => (
              <div key={event.id} style={{ display: 'flex', gap: 12 }}>
                <div style={{ width: 8, height: 8, borderRadius: 4, background: '#059669', marginTop: 5, flexShrink: 0 }} />
                <div style={{ minWidth: 0 }}>
                  <p style={{ fontSize: 13, fontWeight: 500, color: '#1A202C', margin: 0 }}>{event.title}</p>
                  {event.description && <p style={{ fontSize: 10.5, color: '#8A94A6', margin: '2px 0 0' }}>{event.description}</p>}
                  <p style={{ fontSize: 10, color: '#8A94A6', marginTop: 2 }}>
                    {new Date(event.created_at).toLocaleString()} • {event.actor_name || 'System'}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={{ marginTop: 12 }}>
        <DocumentDiscussion docType="order" docId={order.id} />
      </div>
    </div>
  );
};

export default CustomerOrderDetail;
