import React, { useCallback, useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Loader2, MessageSquare, CheckCircle2, ArrowUpRight, FileText, XCircle, Share2 } from 'lucide-react';
import { portalLifecycle, QuotationRequestRecord, TimelineEvent } from '../../services/portalApiClient';
import ErrorBanner from './components/ErrorBanner';
import StatusBadge from './components/StatusBadge';
import PortalLoadingSkeleton from './components/PortalLoadingSkeleton';
import PortalButton from './components/PortalButton';
import DocumentChain from './components/DocumentChain';
import DocumentDiscussion from './components/DocumentDiscussion';
import { useToast } from './components/Toast';
import { F } from './portalStyles';
import { REQUEST_STATUS_META, FRIENDLY_STATUS_MAP, formatK } from './constants';

const stageDefinitions = [
  { key: 'submitted', label: 'Submitted', description: 'Request received', icon: '📬' },
  { key: 'assigned', label: 'Assigned', description: 'Sales assigned', icon: '👤' },
  { key: 'under_review', label: 'Under Review', description: 'Team is reviewing', icon: '🔍' },
  { key: 'ready_for_conversion', label: 'Quotation', description: 'Official quotation being drafted', icon: '📝' },
  { key: 'converted', label: 'Quotation Issued', description: 'Official quotation available', icon: '✅' },
];

function stageIndex(status: string): number {
  switch (status) {
    case 'draft': return 1;
    case 'submitted': return 1;
    case 'assigned': return 2;
    case 'under_review': return 3;
    case 'waiting_for_customer': return 3;
    case 'ready_for_conversion': return 4;
    case 'converted': return 5;
    case 'rejected': return -1;
    case 'cancelled': return -1;
    default: return 1;
  }
}

const root: React.CSSProperties = { fontFamily: F, fontSize: 13.5, lineHeight: 1.45, color: '#1E293B', maxWidth: 720, margin: '0 auto', paddingBottom: 100 };
const card: React.CSSProperties = { background: '#fff', borderRadius: 12, padding: '12px 14px', marginBottom: 10, border: '1px solid #E9EDF3' };
const cardNoPad: React.CSSProperties = { background: '#fff', borderRadius: 12, marginBottom: 10, border: '1px solid #E9EDF3', overflow: 'hidden' };
const sectionTitle: React.CSSProperties = { fontSize: 14, fontWeight: 600, color: '#1A202C', margin: 0 };
const label: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.03em' };
const body: React.CSSProperties = { fontSize: 13, fontWeight: 500, color: '#4A5568' };
const muted: React.CSSProperties = { fontSize: 12, color: '#64748B' };

const CustomerRequestDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { addToast } = useToast();
  const [request, setRequest] = useState<QuotationRequestRecord | null>(null);
  const [timeline, setTimeline] = useState<TimelineEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const [r, events] = await Promise.all([
        portalLifecycle.requests.get(id),
        portalLifecycle.timeline.get('request', id),
      ]);
      setRequest(r);
      setTimeline(events || []);
      setError(null);
    } catch (err: any) {
      setError(err.message || 'Failed to load request');
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
          if (type === 'entity_changed' && payload.docType === 'request' && payload.docId === id && !cancelled) load();
        },
      });
    })();
    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [id, load]);

  const handleCancelClick = () => {
    setConfirmCancel(true);
  };

  const handleCancelConfirm = async () => {
    setConfirmCancel(false);
    if (!request) return;
    setCancelling(true);
    setError(null);
    try {
      await portalLifecycle.requests.cancel(request.id);
      addToast('success', 'Request cancelled successfully');
      await load();
    } catch (err: any) {
      setError(err.message || 'Failed to cancel request');
      addToast('error', err.message || 'Failed to cancel request');
    } finally {
      setCancelling(false);
    }
  };

  const copyRequestId = () => {
    if (request?.request_number) {
      navigator.clipboard.writeText(request.request_number);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const shareRequest = () => {
    if (request?.request_number && navigator.share) {
      navigator.share({ title: `Request ${request.request_number}`, text: `Track my request ${request.request_number}` }).catch(() => {});
    } else {
      copyRequestId();
    }
  };

  if (loading) return <div style={{ padding: 16 }}><PortalLoadingSkeleton type="detail" /></div>;
  if (error) return <div style={{ padding: 16 }}><ErrorBanner message={error} onDismiss={() => setError(null)} /></div>;
  if (!request) return null;

  const currentStage = stageIndex(request.status);
  const failed = currentStage === -1;
  const isConverted = request.status === 'converted';

  return (
    <div style={root}>
      <div style={{
        position: 'sticky', top: 0, zIndex: 20, background: 'rgba(254,253,251,.92)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)',
        borderBottom: '1px solid #E9EDF3'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 20px' }}>
          <button
            onClick={() => navigate('/portal/orders?tab=requests')}
            aria-label="Back to requests"
            style={{
              width: 40, height: 40, borderRadius: 12, border: 'none', cursor: 'pointer',
              background: '#ECFDF5', color: '#0f544c', flexShrink: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all .15s ease'
            }}
          >
            <ArrowLeft size={20} strokeWidth={2.2} />
          </button>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h1 style={{ fontSize: 17, fontWeight: 700, color: '#1A202C', margin: 0, letterSpacing: 0.1 }}>
              {request.request_number}
            </h1>
            <p style={{ fontSize: 12, color: '#8A94A6', margin: '2px 0 0' }}>
              {new Date(request.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
              {request.request_type ? ` • ${request.request_type === 'order' ? 'Order' : 'Quotation'}` : ''}
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={shareRequest}
              style={{
                width: 40, height: 40, borderRadius: 12, cursor: 'pointer',
                background: '#fff', color: '#8A94A6', display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: '0 1px 3px rgba(0,0,0,.06)', border: '1px solid #E9EDF3'
              }}
            >
              <Share2 size={18} />
            </button>
            {(request.status === 'submitted' || request.status === 'assigned' || request.status === 'under_review' || request.status === 'waiting_for_customer') && (
              <PortalButton
                variant="ghost"
                size="sm"
                onClick={handleCancelClick}
                disabled={cancelling}
                style={{ color: '#B5493F', border: '1px solid #E9EDF3', borderRadius: 12, height: 40 }}
              >
                {cancelling ? <Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} /> : 'Cancel'}
              </PortalButton>
            )}
          </div>
        </div>
      </div>

      <div style={{ padding: '20px 20px 0', display: 'flex', flexDirection: 'column', gap: 16 }}>
        <DocumentChain docType="request" docId={request.id} />

        {!failed ? (
          <div style={{
            background: '#f0fdfa',
            border: '1px solid #99f6e4', borderRadius: 12, padding: '16px 18px',
            boxShadow: '0 2px 8px -4px rgba(15,84,76,.15)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <div>
                <p style={{ fontSize: 10.5, fontWeight: 600, color: '#059669', textTransform: 'uppercase', letterSpacing: '0.03em', margin: 0 }}>Status</p>
                <p style={{ fontSize: 18, fontWeight: 700, color: '#1A202C', margin: '4px 0 0' }}>
                  {FRIENDLY_STATUS_MAP[request.status] || request.status}
                </p>
              </div>
              <StatusBadge status={FRIENDLY_STATUS_MAP[request.status] || request.status} />
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 0, position: 'relative' }}>
              {stageDefinitions.map((stage, i) => {
                const done = currentStage > i + 1;
                const active = currentStage === i + 1;
                return (
                  <React.Fragment key={stage.key}>
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                      <div style={{
                        width: 36, height: 36, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center',
                        background: done ? '#146b60' : active ? '#FEF3C7' : '#fff',
                        color: done ? '#fff' : active ? '#D97706' : '#8A94A6',
                        border: done ? 'none' : active ? '2px solid #FBBF24' : '2px solid #E9EDF3',
                        boxShadow: done ? '0 4px 12px -4px rgba(15,84,76,.5)' : active ? '0 2px 8px -4px rgba(245,158,11,.3)' : 'none',
                        transition: 'all .3s ease', position: 'relative', zIndex: 2
                      }}>
                        {done ? <CheckCircle2 size={16} /> : <span style={{ fontSize: 12, fontWeight: 800 }}>{i + 1}</span>}
                      </div>
                      <span style={{ fontSize: 10, fontWeight: 600, color: done || active ? '#1A202C' : '#8A94A6', textAlign: 'center', lineHeight: 1.3 }}>
                        {stage.label}
                      </span>
                    </div>
                    {i < stageDefinitions.length - 1 && (
                      <div style={{
                        position: 'absolute', top: 18, left: `calc(${(i + 0.5) * (100 / stageDefinitions.length)}% + 8px)`,
                        right: `calc(${(stageDefinitions.length - i - 0.5) * (100 / stageDefinitions.length)}% - 8px)`,
                        height: 2, background: done ? '#4ed3c7' : '#E9EDF3',
                        borderRadius: 1, zIndex: 1, transition: 'all .3s ease'
                      }} />
                    )}
                  </React.Fragment>
                );
              })}
            </div>
          </div>
        ) : (
          <div style={{
            background: '#FEF2F2',
            border: '1px solid #FECACA', borderRadius: 12, padding: '16px 18px',
            display: 'flex', alignItems: 'flex-start', gap: 14
          }}>
            <div style={{
              width: 34, height: 34, borderRadius: 10, background: '#FEE2E2',
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
            }}>
              <XCircle size={18} color="#B91C1C" />
            </div>
            <div>
              <p style={{ fontSize: 14, fontWeight: 600, color: '#B91C1C', margin: 0 }}>Request {request.status === 'cancelled' ? 'Cancelled' : 'Rejected'}</p>
              {request.review_note && <p style={{ fontSize: 13, fontWeight: 500, color: '#4A5568', marginTop: 4, lineHeight: 1.5 }}>{request.review_note}</p>}
            </div>
          </div>
        )}

        {request.promotion && Number(request.discount_total || 0) > 0 && (
          <div style={{
            background: 'linear-gradient(135deg, #FFF7ED 0%, #FFEDD5 100%)',
            border: '1px solid #FDBA74', borderRadius: 12, padding: '14px 18px',
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
                    Portal Exclusive Offer{request.promotion.channel === 'BOTH' ? ' • Special Offer' : ''}
                  </p>
                  <p style={{ fontSize: 14, fontWeight: 700, color: '#7C2D12', margin: '3px 0 0', lineHeight: 1.35 }}>
                    {request.promotion.name}{request.promotion.code ? ` • ${request.promotion.code}` : ''}
                  </p>
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <p style={{ fontSize: 20, fontWeight: 800, color: '#C2410C', margin: 0, fontFamily: "'JetBrains Mono', monospace", fontVariantNumeric: 'tabular-nums' }}>
                  −{formatK(Number(request.discount_total || 0))}
                </p>
                <p style={{ fontSize: 10.5, fontWeight: 600, color: '#9A3412', margin: '2px 0 0' }}>Discount applied</p>
              </div>
            </div>
          </div>
        )}

        {isConverted && request.quotation_id && (
          <button
            onClick={() => navigate(`/portal/quotations/${request.quotation_id}`)}
            style={{
              width: '100%', padding: '16px 18px', borderRadius: 12, border: 'none', cursor: 'pointer',
              background: '#146b60',
              color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              boxShadow: '0 6px 16px -6px rgba(15,84,76,.5)', transition: 'all .15s ease'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{
                width: 34, height: 34, borderRadius: 10, background: 'rgba(255,255,255,.15)',
                display: 'flex', alignItems: 'center', justifyContent: 'center'
              }}>
                <FileText size={18} color="#fff" />
              </div>
              <div style={{ textAlign: 'left' }}>
                <p style={{ fontSize: 14, fontWeight: 600, margin: 0 }}>View Quotation</p>
                <p style={{ fontSize: 12, opacity: 0.85, margin: '2px 0 0' }}>
                  {request.quotation_number ? `#${request.quotation_number}` : 'Click to view'}
                </p>
              </div>
            </div>
            <ArrowUpRight size={18} />
          </button>
        )}

        {request.status === 'waiting_for_customer' && (
          <div style={{
            background: '#F5F3FF', border: '1px solid #DDD6FE',
            borderRadius: 12, padding: '16px 18px', display: 'flex', alignItems: 'flex-start', gap: 12
          }}>
            <div style={{
              width: 34, height: 34, borderRadius: 10, background: '#EDE9FE',
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
            }}>
              <MessageSquare size={18} color="#7C3AED" />
            </div>
            <p style={{ fontSize: 13, fontWeight: 500, color: '#5B21B6', lineHeight: 1.5, margin: 0 }}>
              Our team is waiting on additional information from you. Please contact us or submit a new request with more detail.
            </p>
          </div>
        )}

        <div style={{ ...cardNoPad }}>
          <div style={{ padding: '12px 14px', borderBottom: '1px solid #E9EDF3', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <h2 style={sectionTitle}>Requested Items</h2>
            <span style={{ fontSize: 12, color: '#8A94A6', fontWeight: 600 }}>{(request.items || []).length} items</span>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left', padding: '8px 14px', ...label }}>Item</th>
                  <th style={{ textAlign: 'right', padding: '8px 14px', ...label, width: 80 }}>Qty</th>
                  <th style={{ textAlign: 'right', padding: '8px 14px', ...label, width: 110 }}>Price</th>
                  <th style={{ textAlign: 'right', padding: '8px 14px', ...label, width: 110 }}>Total</th>
                </tr>
              </thead>
              <tbody>
                {(request.items || []).map((item, i) => (
                  <tr key={i} style={{ borderTop: i < (request.items || []).length - 1 ? '1px solid #F3F4F6' : 'none' }}>
                    <td style={{ padding: '10px 14px', fontSize: 13, fontWeight: 600, color: '#1A202C', lineHeight: 1.4 }}>{item.name}</td>
                    <td style={{ padding: '10px 14px', textAlign: 'right', fontSize: 13, color: '#4A5568' }}>x{item.quantity}</td>
                    <td style={{ padding: '10px 14px', textAlign: 'right', fontSize: 13, color: '#4A5568', fontFamily: "'JetBrains Mono', monospace", fontVariantNumeric: 'tabular-nums' }}>{formatK(item.unitPrice || 0)}</td>
                    <td style={{ padding: '10px 14px', textAlign: 'right', fontSize: 14, fontWeight: 700, color: '#1A202C', fontFamily: "'JetBrains Mono', monospace", fontVariantNumeric: 'tabular-nums' }}>{formatK(item.lineTotal ?? item.quantity * item.unitPrice)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ padding: '10px 14px', borderTop: '1px solid #E9EDF3', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: '#8A94A6', textTransform: 'uppercase', letterSpacing: '0.03em' }}>Subtotal</span>
            <span style={{ fontSize: 14, fontWeight: 700, color: '#1A202C', fontFamily: "'JetBrains Mono', monospace" }}>
              {formatK(request.subtotal)}
            </span>
          </div>
          {request.promotion && Number(request.discount_total || 0) > 0 && (
            <div style={{ padding: '8px 14px', borderTop: '1px solid #F3F4F6', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#FFFBEB' }}>
              <span style={{ fontSize: 12.5, fontWeight: 600, color: '#B45309' }}>
                {request.promotion.code || request.promotion.name} discount
              </span>
              <span style={{ fontSize: 13, fontWeight: 700, color: '#B45309', fontFamily: "'JetBrains Mono', monospace" }}>
                −{formatK(Number(request.discount_total || 0))}
              </span>
            </div>
          )}
          {Number(request.total ?? request.subtotal ?? 0) > 0 && Number(request.discount_total || 0) > 0 && (
            <div style={{ padding: '10px 14px', borderTop: '1px solid #E9EDF3', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: '#1A202C' }}>Total</span>
              <span style={{ fontSize: 18, fontWeight: 800, color: '#146b60', fontFamily: "'JetBrains Mono', monospace" }}>
                {formatK(request.total)}
              </span>
            </div>
          )}
        </div>

        <div style={{ ...card, padding: '16px 18px' }}>
          <h2 style={{ fontSize: 10.5, fontWeight: 600, color: '#8A94A6', textTransform: 'uppercase', letterSpacing: '0.03em', margin: '0 0 12px' }}>Details</h2>
          {request.requested_delivery_date && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#14b8a6', flexShrink: 0 }} />
              <span style={{ fontSize: 13, fontWeight: 500, color: '#1A202C' }}>
                <span style={{ fontWeight: 600, color: '#8A94A6' }}>Delivery: </span>
                {new Date(request.requested_delivery_date).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
              </span>
            </div>
          )}
          {request.notes && (
            <div style={{ background: '#ECFDF5', borderRadius: 10, padding: '10px 14px', border: '1px solid #D1FAE5' }}>
              <p style={{ fontSize: 10.5, fontWeight: 600, color: '#059669', textTransform: 'uppercase', letterSpacing: '0.03em', margin: '0 0 6px' }}>Notes</p>
              <p style={{ fontSize: 13, fontWeight: 500, color: '#1A202C', margin: 0, lineHeight: 1.6 }}>{request.notes}</p>
            </div>
          )}
        </div>

        {request.attachments && request.attachments.length > 0 && (
          <div style={{ ...card, padding: '16px 18px' }}>
            <h2 style={{ fontSize: 10.5, fontWeight: 600, color: '#8A94A6', textTransform: 'uppercase', letterSpacing: '0.03em', margin: '0 0 12px' }}>Attachments</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {request.attachments.map((a, i) => (
                <a
                  key={i}
                  href={a.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 10,
                    background: '#ECFDF5', border: '1px solid #D1FAE5',
                    color: '#059669', textDecoration: 'none', fontSize: 13, fontWeight: 600,
                    transition: 'all .15s ease'
                  }}
                >
                  <FileText size={16} />
                  <span style={{ flex: 1 }}>{a.name}</span>
                  <ArrowUpRight size={14} />
                </a>
              ))}
            </div>
          </div>
        )}

        <div style={{ ...card, padding: '16px 18px' }}>
          <h2 style={{ fontSize: 10.5, fontWeight: 600, color: '#8A94A6', textTransform: 'uppercase', letterSpacing: '0.03em', margin: '0 0 14px', display: 'flex', alignItems: 'center', gap: 8 }}>
            <MessageSquare size={14} /> Activity
          </h2>
          {timeline.length === 0 ? (
            <p style={{ fontSize: 13, fontWeight: 500, color: '#8A94A6', textAlign: 'center', padding: '20px 0' }}>No activity yet.</p>
          ) : (
            <div style={{ position: 'relative', paddingLeft: 20 }}>
              <div style={{ position: 'absolute', left: 5, top: 8, bottom: 8, width: 2, background: '#a6d9d3', borderRadius: 1 }} />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {timeline.map((event) => (
                  <div key={event.id} style={{ position: 'relative', paddingLeft: 16 }}>
                    <div style={{
                      position: 'absolute', left: -15, top: 4, width: 10, height: 10, borderRadius: '50%',
                      background: '#146b60',
                      border: '2px solid #fff', boxShadow: '0 0 0 2px #72c0b7'
                    }} />
                    <p style={{ fontSize: 13, fontWeight: 600, color: '#1A202C', margin: 0, lineHeight: 1.4 }}>{event.title}</p>
                    {event.description && <p style={{ fontSize: 13, fontWeight: 500, color: '#4A5568', marginTop: 3, lineHeight: 1.5 }}>{event.description}</p>}
                    <p style={{ fontSize: 10.5, color: '#8A94A6', marginTop: 4, fontWeight: 500 }}>
                      {new Date(event.created_at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      {event.actor_name ? ` • ${event.actor_name}` : ''}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div style={{ marginBottom: 20 }}>
          <DocumentDiscussion docType="request" docId={request.id} />
        </div>
      </div>

      {confirmCancel && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, background: 'rgba(0,0,0,.5)', backdropFilter: 'blur(6px)' }} onClick={() => setConfirmCancel(false)}>
          <div onClick={(e) => e.stopPropagation()} style={{
            background: '#fff', borderRadius: 12, width: '100%', maxWidth: 360, overflow: 'hidden',
            boxShadow: '0 20px 40px -12px rgba(0,0,0,.4)'
          }}>
            <div style={{ padding: '18px 20px 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <h3 style={{ fontSize: 16, fontWeight: 700, color: '#1A202C', margin: 0 }}>Cancel Request</h3>
              <button onClick={() => setConfirmCancel(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 6, borderRadius: 8, color: '#8A94A6' }} aria-label="Close">
                <XCircle size={18} />
              </button>
            </div>
            <div style={{ padding: '14px 20px 20px', fontSize: 13, fontWeight: 500, color: '#4A5568', lineHeight: 1.6 }}>
              Are you sure you want to cancel request <strong style={{ color: '#1A202C' }}>{request?.request_number}</strong>? This action cannot be undone.
            </div>
            <div style={{ display: 'flex', gap: 10, padding: '0 20px 20px' }}>
              <button onClick={() => setConfirmCancel(false)} style={{
                flex: 1, padding: '10px 0', borderRadius: 8, border: '1px solid #E9EDF3', background: '#fff',
                color: '#1A202C', fontSize: 12, fontWeight: 600, cursor: 'pointer', transition: 'all .15s ease', fontFamily: F
              }}>
                Keep Request
              </button>
              <button onClick={handleCancelConfirm} style={{
                flex: 1, padding: '10px 0', borderRadius: 8, border: 'none', cursor: 'pointer',
                background: '#B5493F', color: '#fff',
                fontSize: 12, fontWeight: 600, boxShadow: '0 6px 16px -6px rgba(181,73,63,.5)', transition: 'all .15s ease', fontFamily: F
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

export default CustomerRequestDetail;
