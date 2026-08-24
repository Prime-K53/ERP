import React, { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, CreditCard, CheckCircle2, Download, Loader2 } from 'lucide-react';
import { createElement } from 'react';
import { pdf } from '@react-pdf/renderer';
import { portalApi, portalLifecycle } from '../../services/portalApiClient';
import { attachDocumentSecurity } from '../../utils/documentSecurity';
import { initializePrimePdfFonts } from '../shared/components/PDF/templateSettings';
import { PrimeDocument } from '../shared/components/PDF/PrimeDocument';
import { useAuth } from '../../context/AuthContext';
import ErrorBanner from './components/ErrorBanner';
import PortalLoadingSkeleton from './components/PortalLoadingSkeleton';
import { F } from './portalStyles';
import { formatK } from './constants';

interface Allocation {
  id: string;
  invoice_id: string;
  invoice_number: string;
  invoice_total: number;
  paid_amount: number;
  amount: number;
}

interface PaymentDetail {
  id: string;
  amount: number;
  payment_method: string;
  date: string;
  reference: string;
  notes?: string;
  status?: string;
  allocations: Allocation[];
}

const root: React.CSSProperties = { fontFamily: F, fontSize: 13, lineHeight: 1.4, color: '#2D3748', padding: 24, maxWidth: 800, margin: '0 auto' };
const card: React.CSSProperties = { background: '#fff', borderRadius: 12, padding: '12px 14px', marginBottom: 10, border: '1px solid #E9EDF3' };
const cardNoPad: React.CSSProperties = { background: '#fff', borderRadius: 12, marginBottom: 10, border: '1px solid #E9EDF3', overflow: 'hidden' };
const sectionTitle: React.CSSProperties = { fontSize: 14, fontWeight: 600, color: '#1A202C', margin: 0 };
const body: React.CSSProperties = { fontSize: 13, fontWeight: 500, color: '#4A5568' };
const muted: React.CSSProperties = { fontSize: 10.5, color: '#8A94A6' };

const CustomerPaymentDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [payment, setPayment] = useState<PaymentDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const { companyConfig } = useAuth();

  useEffect(() => {
    if (!id) return;
    portalApi.get<PaymentDetail>(`/payments/${id}`)
      .then(setPayment)
      .catch((err) => setError(err.message || 'Failed to load payment'))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    let unsubscribe: (() => void) | undefined;
    (async () => {
      unsubscribe = await portalLifecycle.subscribe({
        onEvent: (type, payload) => {
          if (type === 'entity_changed' && payload?.event === 'payment_allocated' && !cancelled) {
            portalApi.get<PaymentDetail>(`/payments/${id}`)
              .then(setPayment)
              .catch(() => {})
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

  const handleDownloadReceipt = useCallback(async () => {
    if (!payment) return;
    setDownloading(true);
    try {
      await initializePrimePdfFonts();

      const allocations = payment.allocations || [];
      const appliedInvoices = allocations.map((a) => a.invoice_number || a.invoice_id);
      const invoiceTotal = allocations.reduce((sum, a) => sum + Number(a.invoice_total || 0), 0);
      const totalAllocated = allocations.reduce((sum, a) => sum + Number(a.amount || 0), 0);
      const amountReceived = Number(payment.amount || 0);

      let paymentStatus: 'PAID' | 'PARTIALLY PAID' | 'OVERPAID' = 'PAID';
      if (totalAllocated < amountReceived) paymentStatus = 'OVERPAID';
      else if (totalAllocated < invoiceTotal) paymentStatus = 'PARTIALLY PAID';

      const receiptData = {
        receiptNumber: payment.reference || payment.id?.slice(0, 8) || 'N/A',
        date: payment.date ? new Date(payment.date).toLocaleDateString() : new Date().toLocaleDateString(),
        customerName: companyConfig?.companyName || 'Customer',
        amountReceived,
        amountApplied: totalAllocated,
        changeGiven: 0,
        walletDeposit: 0,
        paymentMethod: payment.payment_method || 'Unknown',
        appliedInvoices,
        appliedOrders: [],
        invoiceTotal,
        paymentStatus,
        balanceDue: Math.max(0, invoiceTotal - totalAllocated),
        overpaymentAmount: Math.max(0, amountReceived - totalAllocated),
        narrative: `Payment of ${formatK(amountReceived)} received via ${payment.payment_method || 'N/A'}. ${allocations.length} invoice(s) allocated.`,
        currentBalance: Math.max(0, invoiceTotal - totalAllocated),
        calculationVersion: 1,
      };

      const secured = await attachDocumentSecurity(receiptData, companyConfig?.companyName);
      const blob = await pdf(
        createElement(PrimeDocument, { type: 'RECEIPT', data: secured })
      ).toBlob();

      const url = URL.createObjectURL(blob);
      const a = window.document.createElement('a');
      a.href = url;
      a.download = `Receipt-${payment.reference || payment.id?.slice(0, 8) || 'payment'}.pdf`;
      window.document.body.appendChild(a);
      a.click();
      window.document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Failed to generate receipt PDF:', err);
    } finally {
      setDownloading(false);
    }
  }, [payment, companyConfig]);

  if (loading) return <div style={root}><PortalLoadingSkeleton type="detail" /></div>;
  if (error) return <div style={root}><ErrorBanner message={error} onDismiss={() => setError(null)} /></div>;
  if (!payment) return null;

  const allocations = payment.allocations || [];

  return (
    <div style={root}>
      <button onClick={() => navigate('/portal/payments')} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 13, fontWeight: 500, color: '#059669', background: 'none', border: 'none', cursor: 'pointer', marginBottom: 24, padding: 0, fontFamily: F }}>
        <ArrowLeft size={14} /> Back to Payments
      </button>

      <div style={{ ...card, padding: '16px 18px', marginBottom: 16 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginBottom: 16 }}>
          <div>
            <h1 style={{ fontSize: 18, fontWeight: 700, color: '#1A202C', margin: 0 }}>Payment #{payment.reference || payment.id.slice(0, 8)}</h1>
            <p style={{ fontSize: 13, fontWeight: 500, color: '#8A94A6', marginTop: 4 }}>
              {payment.date ? new Date(payment.date).toLocaleDateString() : ''} • {payment.payment_method}
              {payment.status ? ` • ${payment.status}` : ''}
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <CheckCircle2 size={18} style={{ color: '#059669' }} />
              <span style={{ fontSize: 22, fontWeight: 700, color: '#059669', fontFamily: "'JetBrains Mono', monospace" }}>{formatK(payment.amount)}</span>
            </div>
            <button
              onClick={handleDownloadReceipt}
              disabled={downloading}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 8,
                padding: '6px 14px',
                borderRadius: 8,
                fontSize: 12, fontWeight: 600,
                border: 'none', cursor: downloading ? 'not-allowed' : 'pointer',
                background: '#008A4C', color: '#fff',
                opacity: downloading ? 0.6 : 1,
                fontFamily: F,
              }}
            >
              {downloading ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Download size={14} />}
              {downloading ? 'Generating…' : 'Download Receipt'}
            </button>
          </div>
        </div>
        {payment.notes && <div style={{ fontSize: 13, fontWeight: 500, color: '#8A94A6' }}>{payment.notes}</div>}
      </div>

      <div style={cardNoPad}>
        <div style={{ padding: '12px 14px', borderBottom: '1px solid #E9EDF3' }}>
          <h2 style={sectionTitle}>Applied To Invoices</h2>
        </div>
        {allocations.length === 0 ? (
          <div style={{ padding: '32px 14px', textAlign: 'center', ...muted }}>No invoice allocations for this payment.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {allocations.map((a) => (
              <div key={a.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '10px 14px', borderTop: '1px solid #F3F4F6', flexWrap: 'wrap' }}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <p style={{ fontSize: 13, fontWeight: 600, color: '#1A202C', margin: 0 }}>Invoice {a.invoice_number || a.invoice_id}</p>
                </div>
                <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexShrink: 0 }}>
                  <span style={{ fontSize: 13, fontFamily: "'JetBrains Mono', monospace", color: '#4A5568' }}>Total: {formatK(a.invoice_total)}</span>
                  <span style={{ fontSize: 13, fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, color: '#059669' }}>Allocated: {formatK(a.amount)}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={{ marginTop: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#8A94A6', fontSize: 10.5, gap: 8 }}>
        <CreditCard size={14} />
        Need help with this payment? Visit Support.
      </div>
    </div>
  );
};

export default CustomerPaymentDetail;
