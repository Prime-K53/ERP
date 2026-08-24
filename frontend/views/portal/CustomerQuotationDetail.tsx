import React, { useCallback, useEffect, useState } from 'react';
import { createElement } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Download, Loader2, CheckCircle2, XCircle, RefreshCcw, FileText, MessageSquare, History, Clock, BadgeCheck } from 'lucide-react';
import { pdf } from '@react-pdf/renderer';
import { portalLifecycle, QuotationRecord, TimelineEvent, DocumentVersionRecord, DocumentSignatureRecord } from '../../services/portalApiClient';
import ErrorBanner from './components/ErrorBanner';
import { mapToInvoiceData } from '../../utils/pdfMapper';
import { attachDocumentSecurity } from '../../utils/documentSecurity';
import { initializePrimePdfFonts } from '../shared/components/PDF/templateSettings';
import { PrimeDocument } from '../shared/components/PDF/PrimeDocument';
import { useAuth } from '../../context/AuthContext';
import StatusBadge from './components/StatusBadge';
import PortalLoadingSkeleton from './components/PortalLoadingSkeleton';
import DocumentChain from './components/DocumentChain';
import DocumentDiscussion from './components/DocumentDiscussion';
import VersionHistoryModal from './components/VersionHistoryModal';
import { F } from './portalStyles';
import { formatK } from './constants';

const stageDefinitions = [
  { key: 'submitted', label: 'Requested', description: 'Your request was received' },
  { key: 'under_review', label: 'Under Review', description: 'Our team is reviewing it' },
  { key: 'quotation_ready', label: 'Quotation Ready', description: 'Your official quotation is ready' },
  { key: 'accepted', label: 'Accepted', description: 'Converted into an order' },
];

function stageIndex(status: string): number {
  if (status === 'converted') return 4;
  switch (status) {
    case 'ready': return 3;
    case 'accepted': return 4;
    case 'revision_requested': return 3;
    case 'rejected': return 3;
    case 'expired': return 3;
    default: return 0;
  }
}

const root: React.CSSProperties = { fontFamily: F, fontSize: 13, lineHeight: 1.4, color: '#2D3748', padding: 24, maxWidth: 800, margin: '0 auto' };
const card: React.CSSProperties = { background: '#fff', borderRadius: 12, padding: '12px 14px', marginBottom: 10, border: '1px solid #E9EDF3' };
const cardNoPad: React.CSSProperties = { background: '#fff', borderRadius: 12, marginBottom: 10, border: '1px solid #E9EDF3', overflow: 'hidden' };
const sectionTitle: React.CSSProperties = { fontSize: 14, fontWeight: 600, color: '#1A202C', margin: 0 };
const label: React.CSSProperties = { fontSize: 10.5, fontWeight: 600, color: '#8A94A6', textTransform: 'uppercase', letterSpacing: '0.03em' };
const body: React.CSSProperties = { fontSize: 13, fontWeight: 500, color: '#4A5568' };
const muted: React.CSSProperties = { fontSize: 10.5, color: '#8A94A6' };
const th: React.CSSProperties = { padding: '8px 14px', fontSize: 10.5, fontWeight: 600, color: '#8A94A6', textTransform: 'uppercase', letterSpacing: '0.03em', borderTop: '1px solid #F3F4F6' };
const thR: React.CSSProperties = { ...th, textAlign: 'right' };
const td: React.CSSProperties = { padding: '8px 14px', fontSize: 13, fontWeight: 500, color: '#4A5568', borderTop: '1px solid #F3F4F6' };
const tdR: React.CSSProperties = { ...td, textAlign: 'right' };
const tdB: React.CSSProperties = { ...td, textAlign: 'right', fontWeight: 600, color: '#1A202C', fontFamily: "'JetBrains Mono', monospace" };

const CustomerQuotationDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { companyConfig } = useAuth();
  const [quotation, setQuotation] = useState<QuotationRecord | null>(null);
  const [timeline, setTimeline] = useState<TimelineEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [action, setAction] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [revisionNote, setRevisionNote] = useState('');
  const [rejectionReason, setRejectionReason] = useState('');
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [versions, setVersions] = useState<DocumentVersionRecord[]>([]);
  const [versionsOpen, setVersionsOpen] = useState(false);
  const [versionsLoading, setVersionsLoading] = useState(false);
  const [signatures, setSignatures] = useState<DocumentSignatureRecord[]>([]);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const [q, events, sigs] = await Promise.all([
        portalLifecycle.quotations.get(id),
        portalLifecycle.timeline.get('quotation', id),
        portalLifecycle.quotations.signatures(id).catch(() => [] as DocumentSignatureRecord[]),
      ]);
      setQuotation(q);
      setTimeline(events || []);
      setSignatures(sigs);
      setError(null);
    } catch (err: any) {
      setError(err.message || 'Failed to load quotation');
    } finally {
      setLoading(false);
    }
  }, [id]);

  const openVersions = async () => {
    if (!quotation) return;
    setVersionsOpen(true);
    setVersionsLoading(true);
    try {
      const data = await portalLifecycle.quotations.versions.list(quotation.id);
      setVersions(data || []);
    } catch {
      setVersions([]);
    } finally {
      setVersionsLoading(false);
    }
  };

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
          if (type === 'entity_changed' && payload.docType === 'quotation' && payload.docId === id && !cancelled) load();
        },
      });

    })();
    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [id, load]);

  const runAction = async (actionName: string, payload?: any) => {
    if (!quotation) return;
    setAction(actionName);
    setActionError(null);
    try {
      if (actionName === 'accept') {
        await portalLifecycle.quotations.accept(quotation.id, { acceptedBy: quotation.customer_name });
      } else if (actionName === 'reject') {
        if (!rejectionReason.trim()) throw new Error('Please provide a reason for rejecting');
        await portalLifecycle.quotations.reject(quotation.id, { reason: rejectionReason });
      } else if (actionName === 'revision') {
        if (!revisionNote.trim()) throw new Error('Please describe the changes you need');
        await portalLifecycle.quotations.requestRevision(quotation.id, { comments: revisionNote });
      }
      await load();
    } catch (err: any) {
      setActionError(err.message || `Failed to ${actionName} quotation`);
    } finally {
      setAction(null);
    }
  };

  const handleDownloadPdf = async () => {
    if (!quotation) return;
    setDownloading(true);
    setDownloadError(null);
    try {
      await portalLifecycle.downloads.record('quotation', quotation.id);
      const items = (quotation.items || []).map((i) => ({
        desc: i.name,
        qty: Number(i.quantity || 1),
        price: Number(i.unitPrice || 0),
        total: Number(i.lineTotal ?? i.quantity * i.unitPrice),
      }));
      const mapped = mapToInvoiceData(
        {
          ...quotation,
          items,
          quotation_number: quotation.quotation_number,
          customerName: quotation.customer_name,
          customer_name: quotation.customer_name,
          subtotal: quotation.subtotal,
          date: quotation.created_at,
        },
        companyConfig,
        'QUOTATION'
      ) as any;
      const secured = await attachDocumentSecurity(mapped, companyConfig?.companyName);
      await initializePrimePdfFonts();
      const blob = await pdf(createElement(PrimeDocument as any, { type: 'QUOTATION', data: secured }) as any).toBlob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = `${quotation.quotation_number}.pdf`;
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

  if (loading) return <div style={root}><PortalLoadingSkeleton type="detail" /></div>;
  if (error) return <div style={root}><ErrorBanner message={error} onDismiss={() => setError(null)} /></div>;
  if (!quotation) return null;

  const status = quotation.status;
  const currentStage = stageIndex(status);
  const canDecide = status === 'ready' || status === 'revision_requested';
  const canDownload = status === 'ready' || status === 'accepted' || status === 'revision_requested' || status === 'converted';

  return (
    <div style={root}>
      <button onClick={() => navigate('/portal/orders?tab=quotations')} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 13, fontWeight: 500, color: '#059669', background: 'none', border: 'none', cursor: 'pointer', marginBottom: 24, padding: 0, fontFamily: F }}>
        <ArrowLeft size={14} /> Back to Quotations
      </button>

      {downloadError && <ErrorBanner message={downloadError} onDismiss={() => setDownloadError(null)} />}
      {actionError && <ErrorBanner message={actionError} onDismiss={() => setActionError(null)} />}

      <DocumentChain docType="quotation" docId={quotation.id} />

      <div style={{ ...card, padding: '16px 18px', marginBottom: 16 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginBottom: 20 }}>
          <div>
            <h1 style={{ fontSize: 18, fontWeight: 700, color: '#1A202C', margin: 0 }}>Quotation {quotation.quotation_number}</h1>
            <p style={{ fontSize: 13, fontWeight: 500, color: '#8A94A6', marginTop: 4 }}>
              Issued: {new Date(quotation.created_at).toLocaleDateString()}
              {quotation.valid_until ? ` • Valid until ${new Date(quotation.valid_until).toLocaleDateString()}` : ''}
              {quotation.payment_terms ? ` • ${quotation.payment_terms}` : ''}
              {quotation.source_request_number ? ` • From request ${quotation.source_request_number}` : ''}
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            {Number(quotation.version || 1) > 1 && (
              <button
                onClick={openVersions}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 14px', borderRadius: 8, border: 'none', background: '#1A202C', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: F }}
              >
                <History size={14} /> V{quotation.version} <span style={{ color: '#CBD5E0', fontWeight: 400 }}>• history</span>
              </button>
            )}
            {Number(quotation.version || 1) > 1 && <span style={{ display: 'none', fontSize: 10, color: '#8A94A6' }}>Revision {quotation.version}</span>}
            <StatusBadge status={status} />
            {canDownload && (
              <button
                onClick={handleDownloadPdf}
                disabled={downloading}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 14px', borderRadius: 8, border: 'none', background: '#F1F5F9', color: '#1A202C', fontSize: 12, fontWeight: 600, cursor: downloading ? 'not-allowed' : 'pointer', opacity: downloading ? 0.5 : 1, fontFamily: F }}
              >
                {downloading ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Download size={14} />} {downloading ? 'Generating...' : 'PDF'}
              </button>
            )}
          </div>
        </div>

        {status === 'expired' && (
          <div style={{ marginBottom: 16, background: '#F1F5F9', border: '1px solid #E2E8F0', borderRadius: 10, padding: 14, display: 'flex', alignItems: 'flex-start', gap: 12 }}>
            <Clock size={16} style={{ color: '#8A94A6', marginTop: 2, flexShrink: 0 }} />
            <div>
              <p style={{ fontSize: 13, fontWeight: 600, color: '#4A5568', margin: 0 }}>This quotation has expired</p>
              <p style={{ fontSize: 10.5, fontWeight: 500, color: '#8A94A6', marginTop: 2 }}>
                It was valid until {quotation.valid_until ? new Date(quotation.valid_until).toLocaleDateString() : 'its expiry date'} and can no longer be
                accepted. Please submit a new request or contact our team to prepare a fresh quotation.
              </p>
            </div>
          </div>
        )}

        {status === 'accepted' && quotation.accepted_by && (
          <div style={{ marginBottom: 16, background: '#ECFDF5', border: '1px solid #A7F3D0', borderRadius: 10, padding: 14, display: 'flex', alignItems: 'flex-start', gap: 12 }}>
            <BadgeCheck size={16} style={{ color: '#059669', marginTop: 2, flexShrink: 0 }} />
            <div>
              <p style={{ fontSize: 13, fontWeight: 600, color: '#059669', margin: 0 }}>Accepted and digitally recorded</p>
              <p style={{ fontSize: 10.5, fontWeight: 500, color: '#059669', marginTop: 2 }}>
                Accepted by <span style={{ fontWeight: 600 }}>{quotation.accepted_by}</span>
                {quotation.accepted_by_email ? ` (${quotation.accepted_by_email})` : ''} on{' '}
                {quotation.accepted_at ? new Date(quotation.accepted_at).toLocaleString() : 'an unknown date'}.
                {signatures.length > 1 && ` ${signatures.length - 1} earlier decision${signatures.length > 2 ? 's' : ''} recorded on this document.`}
              </p>
            </div>
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
          {stageDefinitions.map((stage, i) => {
            const done = currentStage > i + 1 || (currentStage === i + 1);
            const active = currentStage === i + 1;
            const isLast = i === stageDefinitions.length - 1;
            return (
              <React.Fragment key={stage.key}>
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                  <div style={{
                    width: 32, height: 32, borderRadius: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                    background: done ? '#059669' : active ? '#F59E0B' : '#E2E8F0',
                    color: done || active ? '#fff' : '#8A94A6',
                  }}>
                    {done && currentStage > i + 1 ? <CheckCircle2 size={15} /> : <span style={{ fontSize: 10, fontWeight: 700 }}>{i + 1}</span>}
                  </div>
                  <span style={{ marginTop: 6, fontSize: 10, fontWeight: 600, textAlign: 'center', color: done || active ? '#1A202C' : '#8A94A6' }}>
                    {stage.label}
                  </span>
                  <span style={{ fontSize: 9, color: '#8A94A6', textAlign: 'center' }}>{stage.description}</span>
                </div>
                {!isLast && <div style={{ height: 2, flex: 1, marginTop: -20, background: done ? '#059669' : '#E2E8F0', borderRadius: 1 }} />}
              </React.Fragment>
            );
          })}
        </div>

        <div style={{ fontSize: 13, fontWeight: 500, color: '#4A5568' }}>
          <span style={{ color: '#8A94A6' }}>Customer:</span> {quotation.customer_name}
        </div>
      </div>

      {canDecide && (
        <div style={{ ...card, padding: '14px 18px', marginBottom: 16 }}>
          <h2 style={{ ...sectionTitle, marginBottom: 16 }}>Review Quotation</h2>
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10 }}>
            <button
              onClick={() => runAction('accept')}
              disabled={action !== null}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '8px 14px', borderRadius: 8, border: 'none', background: '#059669', color: '#fff', fontSize: 12, fontWeight: 600, cursor: action !== null ? 'not-allowed' : 'pointer', opacity: action !== null ? 0.5 : 1, fontFamily: F }}
            >
              {action === 'accept' ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <CheckCircle2 size={15} />} Accept &amp; Convert to Order
            </button>
            <button
              onClick={() => runAction('reject')}
              disabled={action !== null}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '8px 14px', borderRadius: 8, border: '1px solid #FECACA', background: '#FEF2F2', color: '#B91C1C', fontSize: 12, fontWeight: 600, cursor: action !== null ? 'not-allowed' : 'pointer', opacity: action !== null ? 0.5 : 1, fontFamily: F }}
            >
              {action === 'reject' ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <XCircle size={15} />} Reject
            </button>
            <button
              onClick={() => runAction('revision')}
              disabled={action !== null}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '8px 14px', borderRadius: 8, border: '1px solid #E9EDF3', background: '#F1F5F9', color: '#1A202C', fontSize: 12, fontWeight: 600, cursor: action !== null ? 'not-allowed' : 'pointer', opacity: action !== null ? 0.5 : 1, fontFamily: F }}
            >
              {action === 'revision' ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <RefreshCcw size={15} />} Request Changes
            </button>
          </div>
          {status === 'revision_requested' && (
            <p style={{ marginTop: 8, fontSize: 10.5, fontWeight: 500, color: '#7C3AED' }}>Revision requested — our team will regenerate the quotation.</p>
          )}
          <div style={{ display: 'grid', gap: 12, marginTop: 12 }}>
            <div>
              <label style={{ display: 'block', fontSize: 10.5, fontWeight: 600, color: '#8A94A6', textTransform: 'uppercase', letterSpacing: '0.03em', marginBottom: 6 }}>Change Request</label>
              <textarea
                value={revisionNote}
                onChange={(e) => setRevisionNote(e.target.value)}
                rows={2}
                placeholder="Describe the changes you need (prices, quantities, terms)..."
                style={{ width: '100%', padding: '8px 12px', fontSize: 13, border: '1px solid #E9EDF3', borderRadius: 10, background: '#fff', color: '#1A202C', outline: 'none', resize: 'none', fontFamily: F, lineHeight: 1.4 }}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 10.5, fontWeight: 600, color: '#8A94A6', textTransform: 'uppercase', letterSpacing: '0.03em', marginBottom: 6 }}>Rejection Reason</label>
              <textarea
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                rows={2}
                placeholder="Why are you rejecting this quotation?"
                style={{ width: '100%', padding: '8px 12px', fontSize: 13, border: '1px solid #E9EDF3', borderRadius: 10, background: '#fff', color: '#1A202C', outline: 'none', resize: 'none', fontFamily: F, lineHeight: 1.4 }}
              />
            </div>
          </div>
        </div>
      )}

      {status === 'rejected' && quotation.rejection_reason && (
        <div style={{ marginBottom: 16, background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 10, padding: 14 }}>
          <p style={{ ...label, marginBottom: 4, color: '#B91C1C' }}>Rejected</p>
          <p style={{ fontSize: 13, fontWeight: 500, color: '#B91C1C' }}>{quotation.rejection_reason}</p>
        </div>
      )}
      {status === 'converted' && (
        <div style={{ marginBottom: 16, background: '#ECFDF5', border: '1px solid #A7F3D0', borderRadius: 10, padding: 14, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <p style={{ fontSize: 13, fontWeight: 500, color: '#059669' }}>This quotation was accepted and converted into an order.</p>
          <button
            onClick={() => quotation.order_id && navigate(`/portal/orders/${quotation.order_id}`)}
            style={{ padding: '6px 14px', borderRadius: 8, border: 'none', background: '#059669', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer', flexShrink: 0, fontFamily: F }}
          >
            View Order
          </button>
        </div>
      )}

      <div style={cardNoPad}>
        <div style={{ padding: '12px 14px', borderBottom: '1px solid #E9EDF3' }}>
          <h2 style={sectionTitle}>Items</h2>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={{ ...th, textAlign: 'left' }}>Item</th>
                <th style={thR}>Qty</th>
                <th style={thR}>Price</th>
                <th style={thR}>Total</th>
              </tr>
            </thead>
            <tbody>
              {(quotation.items || []).map((item, i) => (
                <tr key={i}>
                  <td style={{ ...td, fontWeight: 600, color: '#1A202C' }}>{item.name}</td>
                  <td style={{ ...tdR, fontVariantNumeric: 'tabular-nums' }}>{item.quantity}</td>
                  <td style={{ ...tdR, fontFamily: "'JetBrains Mono', monospace" }}>{formatK(item.unitPrice || 0)}</td>
                  <td style={{ ...tdB }}>{formatK(item.lineTotal ?? item.quantity * item.unitPrice)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div style={{ padding: '12px 14px', borderTop: '1px solid #E9EDF3', display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}><span style={{ color: '#4A5568' }}>Subtotal</span><span style={{ fontFamily: "'JetBrains Mono', monospace" }}>{formatK(quotation.subtotal)}</span></div>
          {Number(quotation.discount) > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}><span style={{ color: '#4A5568' }}>Discount</span><span style={{ fontFamily: "'JetBrains Mono', monospace" }}>- {formatK(quotation.discount)}</span></div>
          )}
          {Number(quotation.delivery_fee) > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}><span style={{ color: '#4A5568' }}>Delivery Fee</span><span style={{ fontFamily: "'JetBrains Mono', monospace" }}>{formatK(quotation.delivery_fee)}</span></div>
          )}
          {Number(quotation.tax_amount) > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}><span style={{ color: '#4A5568' }}>Tax ({Number(quotation.tax_rate)}%)</span><span style={{ fontFamily: "'JetBrains Mono', monospace" }}>{formatK(quotation.tax_amount)}</span></div>
          )}
          <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 8, borderTop: '1px solid #E9EDF3', fontSize: 15, fontWeight: 700 }}>
            <span style={{ color: '#1A202C' }}>Total</span>
            <span style={{ color: '#1A202C', fontFamily: "'JetBrains Mono', monospace" }}>{formatK(quotation.total)}</span>
          </div>
        </div>
      </div>

      {quotation.revision_note && (
        <div style={{ marginBottom: 16, background: '#F5F3FF', border: '1px solid #DDD6FE', borderRadius: 10, padding: 14 }}>
          <p style={{ ...label, marginBottom: 4, color: '#7C3AED' }}>Your change request</p>
          <p style={{ fontSize: 13, fontWeight: 500, color: '#7C3AED' }}>{quotation.revision_note}</p>
        </div>
      )}

      <div style={{ ...card, padding: '14px 18px', marginBottom: 16 }}>
        <h2 style={{ ...sectionTitle, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
          <MessageSquare size={15} style={{ color: '#8A94A6' }} /> Activity Timeline
        </h2>
        {timeline.length === 0 ? (
          <p style={{ fontSize: 13, fontWeight: 500, color: '#8A94A6' }}>No activity yet.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {timeline.map((event) => (
              <div key={event.id} style={{ display: 'flex', gap: 12 }}>
                <div style={{ width: 8, height: 8, borderRadius: 4, background: '#059669', marginTop: 5, flexShrink: 0 }} />
                <div style={{ minWidth: 0 }}>
                  <p style={{ fontSize: 13, fontWeight: 500, color: '#1A202C', margin: 0 }}>{event.title}</p>
                  {event.description && <p style={{ fontSize: 10.5, fontWeight: 500, color: '#8A94A6', margin: '2px 0 0' }}>{event.description}</p>}
                  <p style={{ fontSize: 10, color: '#8A94A6', marginTop: 2 }}>
                    {new Date(event.created_at).toLocaleString()} • {event.actor_name || 'System'}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {signatures.length > 0 && (
        <div style={cardNoPad}>
          <div style={{ padding: '12px 14px', borderBottom: '1px solid #E9EDF3' }}>
            <h2 style={sectionTitle}>Decision Records</h2>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {signatures.map((sig) => (
              <div key={sig.id} style={{ padding: '10px 14px', borderTop: '1px solid #F3F4F6', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <span style={{
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    padding: '3px 8px', borderRadius: 6, fontSize: 10, fontWeight: 600, border: '1px solid',
                    background: sig.decision === 'accepted' ? '#ECFDF5' : sig.decision === 'rejected' ? '#FEF2F2' : '#F5F3FF',
                    color: sig.decision === 'accepted' ? '#059669' : sig.decision === 'rejected' ? '#B91C1C' : '#7C3AED',
                    borderColor: sig.decision === 'accepted' ? '#A7F3D0' : sig.decision === 'rejected' ? '#FECACA' : '#DDD6FE',
                    whiteSpace: 'nowrap'
                  }}>{sig.decision}</span>
                  <p style={{ fontSize: 12, fontWeight: 600, color: '#1A202C', marginTop: 4 }}>{sig.signer_name || '—'}</p>
                  <p style={{ fontSize: 10.5, fontWeight: 500, color: '#8A94A6', marginTop: 2 }}>{sig.signer_email || '—'} • {sig.signed_at ? new Date(sig.signed_at).toLocaleString() : '—'}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <DocumentDiscussion docType="quotation" docId={quotation.id} />

      <VersionHistoryModal
        open={versionsOpen}
        onClose={() => setVersionsOpen(false)}
        versions={versions}
        loading={versionsLoading}
      />
    </div>
  );
};

export default CustomerQuotationDetail;
