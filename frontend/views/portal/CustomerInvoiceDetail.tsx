import React, { useEffect, useState } from 'react';
import { createElement } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Download, Eye, Building2, Smartphone, Banknote } from 'lucide-react';
import { pdf } from '@react-pdf/renderer';
import { portalLifecycle } from '../../services/portalApiClient';
import { mapToInvoiceData } from '../../utils/pdfMapper';
import { attachDocumentSecurity } from '../../utils/documentSecurity';
import { initializePrimePdfFonts } from '../shared/components/PDF/templateSettings';
import { PrimeDocument } from '../shared/components/PDF/PrimeDocument';
import { useAuth } from '../../context/AuthContext';
import PortalPageHeader from './components/PortalPageHeader';
import PortalButton from './components/PortalButton';
import PortalCard from './components/PortalCard';
import ErrorBanner from './components/ErrorBanner';
import DocumentPreviewModal from './components/DocumentPreviewModal';
import StatusBadge from './components/StatusBadge';
import PortalLoadingSkeleton from './components/PortalLoadingSkeleton';
import { F } from './portalStyles';
import { formatK } from './constants';

interface LineItem {
  item_name: string;
  quantity: number;
  unit_price: number;
  line_total: number;
}

interface InvoiceDetail {
  id: string;
  invoice_number: string;
  customer_name: string;
  total_amount: number;
  paid_amount: number;
  status: string;
  due_date: string;
  currency: string;
  line_items: LineItem[];
  created_at: string;
  document_title?: string;
}

const CustomerInvoiceDetail: React.FC = () => {
  const { id } = useParams() as { id?: string };
  const navigate = useNavigate();
  const { companyConfig } = useAuth();

  const [invoice, setInvoice] = useState<InvoiceDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);

  useEffect(() => {
    if (!id) return;
    portalLifecycle.invoices.get(id)
      .then(setInvoice)
      .catch((err) => setError(err.message || 'Failed to load invoice'))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    let unsubscribe: (() => void) | undefined;
    (async () => {
      unsubscribe = await portalLifecycle.subscribe({
        onEvent: (type, payload) => {
          if (type === 'entity_changed' && payload?.docType === 'invoice' && payload?.docId === id && !cancelled) {
            portalLifecycle.invoices.get(id)
              .then((data) => { setInvoice(data); setRefreshError(null); })
              .catch(() => { setRefreshError('Update failed — data may be stale'); })
              .finally(() => setLoading(false));
          }
        },
      });

    })();
    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [id]);

  const handleDownloadPdf = async () => {
    if (!invoice) return;
    setDownloading(true);
    setDownloadError(null);
    try {
      const items = (invoice.line_items || []).map((i) => ({
        desc: i.item_name,
        qty: Number(i.quantity || 1),
        price: Number(i.unit_price || 0),
        total: Number(i.line_total ?? i.unit_price * i.quantity),
      }));
      const mapped = mapToInvoiceData(
        {
          ...invoice,
          items,
          customerName: invoice.customer_name,
          subtotal: invoice.total_amount,
        },
        companyConfig,
        'INVOICE'
      ) as any;
      const secured = await attachDocumentSecurity(mapped, companyConfig?.companyName);
      await initializePrimePdfFonts();
      const blob = await pdf(createElement(PrimeDocument as any, { type: 'INVOICE', data: secured }) as any).toBlob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = `${invoice.invoice_number || invoice.id}.pdf`;
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

  if (loading) return <div style={{ padding: 24, maxWidth: 800, margin: '0 auto', fontFamily: F, fontSize: 13.5, lineHeight: 1.45, color: '#1E293B' }}><PortalLoadingSkeleton type="detail" /></div>;
  if (error) return <div style={{ padding: 24, maxWidth: 800, margin: '0 auto', fontFamily: F, fontSize: 13.5, lineHeight: 1.45, color: '#1E293B' }}><ErrorBanner message={error} onDismiss={() => setError(null)} /></div>;
  if (!invoice) return null;

  const remaining = Number(invoice.total_amount) - Number(invoice.paid_amount || 0);
  const subtotal = (invoice.line_items || []).reduce((sum, item) => sum + Number(item.line_total), 0);

  const rootStyle: React.CSSProperties = { fontFamily: F, fontSize: 13.5, lineHeight: 1.45, color: '#1E293B' };
  const cardStyle: React.CSSProperties = { background: '#fff', borderRadius: 12, padding: '12px 14px', marginBottom: 10, border: '1px solid #E9EDF3' };
  const cardNoPadStyle: React.CSSProperties = { background: '#fff', borderRadius: 12, marginBottom: 10, border: '1px solid #E9EDF3', overflow: 'hidden' };
  const sectionTitleStyle: React.CSSProperties = { fontSize: 14, fontWeight: 600, color: '#1A202C', margin: 0 };
  const labelStyle: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.03em' };
  const bodyStyle: React.CSSProperties = { fontSize: 13, fontWeight: 500, color: '#4A5568' };
  const mutedStyle: React.CSSProperties = { fontSize: 12, color: '#64748B' };

  return (
    <div style={rootStyle}>
      {downloadError && <div style={{ padding: '0 28px 0' }}><ErrorBanner message={downloadError} onDismiss={() => setDownloadError(null)} /></div>}
      {refreshError && <div style={{ padding: '0 28px 0' }}><ErrorBanner message={refreshError} onDismiss={() => { setRefreshError(null); portalLifecycle.invoices.get(id!).then(setInvoice).catch(() => setRefreshError('Retry failed — data may be stale')); }} /></div>}

      <div style={{ padding: '0 28px 28px' }}>
        <PortalCard style={{ ...cardStyle, padding: '16px 18px', marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
            <div>
              <p style={{ ...bodyStyle, margin: 0 }}>Customer: <strong style={{ color: '#1A202C' }}>{invoice.customer_name}</strong></p>
              <p style={{ ...bodyStyle, marginTop: 4 }}>
                Status: <StatusBadge status={invoice.status} />
              </p>
            </div>
            <PortalButton variant="secondary" onClick={() => setPreviewOpen(true)} icon={Eye}>Preview</PortalButton>
          </div>
        </PortalCard>

        <div style={{ ...cardNoPadStyle }}>
          <div style={{ padding: '12px 14px', borderBottom: '1px solid #E9EDF3' }}>
            <h2 style={sectionTitleStyle}>Line Items</h2>
          </div>
          <div style={{ padding: '4px 18px 0' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 24, padding: '10px 0', borderBottom: '1px solid #E9EDF3' }}>
              <span style={{ flex: 1, ...labelStyle }}>Item</span>                  <span style={{ width: 48, textAlign: 'right', ...labelStyle }}>Qty</span>
                  <span style={{ width: 96, textAlign: 'right', ...labelStyle, fontVariantNumeric: 'tabular-nums' }}>Price</span>
                  <span style={{ width: 110, textAlign: 'right', ...labelStyle, fontVariantNumeric: 'tabular-nums' }}>Total</span>
            </div>
            {(invoice.line_items || []).map((item, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 24, padding: '14px 0', borderBottom: i < (invoice.line_items || []).length - 1 ? '1px solid #F3F4F6' : 'none' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: '#1A202C' }}>{item.item_name}</span>
                </div>
                <span style={{ width: 48, textAlign: 'right', fontSize: 13, color: '#4A5568' }}>{item.quantity}</span>
                <span style={{ width: 96, textAlign: 'right', fontSize: 13, fontFamily: "'JetBrains Mono', monospace", color: '#4A5568' }}>{formatK(item.unit_price)}</span>
                <span style={{ width: 110, textAlign: 'right', fontSize: 13, fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, color: '#1A202C' }}>{formatK(item.line_total)}</span>
              </div>
            ))}
          </div>
          <div style={{ padding: '12px 14px', borderTop: '1px solid #E9EDF3', display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
              <span style={{ color: '#4A5568' }}>Subtotal</span>
              <span style={{ fontFamily: "'JetBrains Mono', monospace", color: '#1A202C' }}>{formatK(subtotal)}</span>
            </div>
            {Number(invoice.paid_amount) > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                <span style={{ color: '#059669' }}>Paid</span>
                <span style={{ fontFamily: "'JetBrains Mono', monospace", color: '#059669' }}>{formatK(invoice.paid_amount)}</span>
              </div>
            )}
            {remaining > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                <span style={{ color: '#D97706' }}>Remaining</span>
                <span style={{ fontFamily: "'JetBrains Mono', monospace", color: '#D97706' }}>{formatK(remaining)}</span>
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 15, fontWeight: 700, borderTop: '1px solid #E9EDF3', paddingTop: 8, marginTop: 4 }}>
              <span style={{ color: '#1A202C' }}>Total</span>
              <span style={{ fontFamily: "'JetBrains Mono', monospace", color: '#1A202C' }}>{formatK(invoice.total_amount)}</span>
            </div>
          </div>
        </div>

        {remaining > 0 && (
          <div style={{ marginTop: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <div style={{
                width: 28, height: 28, borderRadius: 7,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: '#ECFDF5', color: '#059669',
              }}>
                <Banknote size={16} />
              </div>
              <span style={{ fontSize: 12, fontWeight: 600, color: '#8A94A6', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                How to Pay
              </span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {[
                { type: 'mobile', icon: <Smartphone size={14} />, name: 'Airtel Money', number: '0992 528 222', accountName: 'Prime Media', color: '#059669' },
                { type: 'mobile', icon: <Smartphone size={14} />, name: 'TNM Mpamba', number: '0992 528 222', accountName: 'Prime Media', color: '#059669' },
                { type: 'bank', icon: <Building2 size={14} />, name: 'Bank Transfer', bank: 'National Bank', account: '1010182286', accountName: 'Prime Media', color: '#2563EB' },
                { type: 'bank', icon: <Building2 size={14} />, name: 'Bank Transfer', bank: 'First Capital Bank', account: '1036047166312', accountName: 'Prime Media', color: '#2563EB' },
              ].map((method, i) => (
                <div key={i} style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '10px 14px',
                  borderRadius: 10,
                  background: '#fff',
                  border: '1px solid #E9EDF3',
                }}>
                  <div style={{
                    width: 28, height: 28, borderRadius: 7,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: `${method.color}10`, color: method.color,
                    flexShrink: 0,
                  }}>
                    {method.icon}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: '#1A202C' }}>{method.name}</div>
                    <div style={{ fontSize: 10.5, color: '#8A94A6', marginTop: 1 }}>
                      {'bank' in method ? `${method.bank} — ${method.account}` : `Number: ${method.number}`}
                    </div>
                  </div>
                  <div style={{ fontSize: 10, color: '#8A94A6', textAlign: 'right' }}>
                    {method.accountName}
                  </div>
                </div>
              ))}
            </div>

            <div style={{
              marginTop: 12,
              padding: '10px 14px',
              borderRadius: 8,
              background: '#FFFBEB',
              border: '1px solid #FDE68A',
              fontSize: 11,
              color: '#92400E',
              lineHeight: 1.5,
            }}>
              After transferring, please send proof of payment via WhatsApp or email so we can allocate it to your account promptly.
            </div>
          </div>
        )}

      </div>

      <DocumentPreviewModal
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
        title={`Invoice ${invoice.invoice_number}`}
        onDownload={handleDownloadPdf}
        downloading={downloading}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
            <span style={{ color: '#4A5568' }}>Invoice Number:</span>
            <span style={{ color: '#1A202C', fontWeight: 600 }}>{invoice.invoice_number}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
            <span style={{ color: '#4A5568' }}>Customer:</span>
            <span style={{ color: '#1A202C' }}>{invoice.customer_name}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
            <span style={{ color: '#4A5568' }}>Status:</span>
            <StatusBadge status={invoice.status} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
            <span style={{ color: '#4A5568' }}>Total:</span>
            <span style={{ color: '#1A202C', fontFamily: "'JetBrains Mono', monospace" }}>{formatK(invoice.total_amount)}</span>
          </div>
          {(invoice.line_items || []).map((item, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '8px 0', borderBottom: '1px solid #F3F4F6' }}>
              <span style={{ color: '#1A202C' }}>{item.item_name} × {item.quantity}</span>
              <span style={{ color: '#1A202C', fontFamily: "'JetBrains Mono', monospace" }}>{formatK(item.line_total)}</span>
            </div>
          ))}
        </div>
      </DocumentPreviewModal>
    </div>
  );
};

export default CustomerInvoiceDetail;
