import React, { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Receipt, CheckCircle2, Download, Loader2 } from 'lucide-react';
import { createElement } from 'react';
import { pdf } from '@react-pdf/renderer';
import { portalApi, portalLifecycle } from '../../services/portalApiClient';
import { attachDocumentSecurity } from '../../utils/documentSecurity';
import { initializePrimePdfFonts } from '../shared/components/PDF/templateSettings';
import { PrimeDocument } from '../shared/components/PDF/PrimeDocument';
import { useAuth } from '../../context/AuthContext';
import ErrorBanner from './components/ErrorBanner';
import PortalLoadingSkeleton from './components/PortalLoadingSkeleton';
import { F, MONO } from './designTokens';
import { formatK } from './constants';

interface Allocation {
  id?: string;
  allocation_id?: string;
  invoice_id: string;
  invoice_number: string | null;
  total_amount?: number | null;
  missing_invoice?: boolean;
  paid_amount: number;
  amount: number;
  order_id?: string;
  order_number?: string;
  order_total?: number;
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

const root: React.CSSProperties = { fontFamily: F, fontSize: 13.5, lineHeight: 1.45, color: '#1E293B', padding: 24, maxWidth: 896, margin: '0 auto' };
const row: React.CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '14px 12px', borderBottom: '1px solid #F1F5F9', borderLeft: '3px solid transparent', borderRadius: 8, background: '#fff', transition: 'all 200ms cubic-bezier(.4,0,.2,1)' };
const rowLast: React.CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '14px 12px', borderBottom: 'none', borderLeft: '3px solid transparent', borderRadius: 8, background: '#fff', transition: 'all 200ms cubic-bezier(.4,0,.2,1)' };

const CustomerPaymentDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [payment, setPayment] = useState<PaymentDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshError, setRefreshError] = useState<string | null>(null);
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
              .then((data) => { setPayment(data); setRefreshError(null); })
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

  const handleDownloadReceipt = useCallback(async () => {
    if (!payment) return;
    setDownloading(true);
    try {
      await initializePrimePdfFonts();

      const allocations = payment.allocations || [];
      const appliedInvoices = allocations.map((a) => a.invoice_number || a.invoice_id);
      const appliedOrders = allocations.map((a) => a.order_number || a.order_id).filter(Boolean);
      // Only invoices that are actually known contribute to the totals — a
      // missing/unauthorized invoice has `total_amount: null`, so it must not
      // be counted as a zero invoice (that would fabricate a false balance).
      const invoiceTotal = allocations.reduce((sum, a) => (
        a.missing_invoice ? sum : sum + Number(a.total_amount || 0)
      ), 0);
      const orderTotal = allocations.reduce((sum, a) => sum + Number(a.order_total || 0), 0);
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
        appliedOrders,
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
   const totalAllocated = allocations.reduce((sum, a) => sum + Number(a.amount || 0), 0);
   const amountReceived = Number(payment.amount || 0);

   const refParts = allocations.map((a) => {
     if (a.invoice_number && a.order_number) return `INV-${a.invoice_number} / ORD-${a.order_number}`;
     if (a.invoice_number) return `INV-${a.invoice_number}`;
     if (a.order_number) return `ORD-${a.order_number}`;
     return a.invoice_id ? `INV-${a.invoice_id.slice(0, 8)}` : '';
   }).filter(Boolean);
   const refText = refParts.length > 0 ? refParts.join(', ') : '-';

   return (
      <div style={root}>
        {refreshError && <div style={{ marginBottom: 12 }}><ErrorBanner message={refreshError} onDismiss={() => { setRefreshError(null); portalApi.get<PaymentDetail>(`/payments/${id}`).then(setPayment).catch(() => setRefreshError('Retry failed — data may be stale')); }} /></div>}
        <button onClick={() => navigate('/portal/payments')} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 13, fontWeight: 500, color: '#059669', background: 'none', border: 'none', cursor: 'pointer', marginBottom: 24, padding: 0, fontFamily: F }}>
          <ArrowLeft size={14} /> Back to Receipt
        </button>

        <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ marginBottom: 12, fontSize: 12, fontWeight: 600, color: '#8A94A6', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
              Receipt #{payment.reference || payment.id.slice(0, 8)}
            </div>

            <div
              style={row}
              onMouseEnter={(e) => { e.currentTarget.style.background = '#F8FAFC'; e.currentTarget.style.borderLeftColor = '#0F2C59'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = '#fff'; e.currentTarget.style.borderLeftColor = 'transparent'; }}
            >
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: '#0F172A', margin: 0, lineHeight: 1.3 }}>Ref: {refText}</div>
                <div style={{ fontSize: 12, color: '#64748B', marginTop: 2 }}>
                  {payment.date ? new Date(payment.date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : '—'}
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 15, fontWeight: 800, color: '#0F172A', fontFamily: MONO, fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.01em' }}>{formatK(amountReceived)}</div>
                </div>
                <button
                  onClick={() => {}}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    padding: '7px 12px', borderRadius: 8,
                    fontSize: 12, fontWeight: 600,
                    border: '1px solid #E2E8F0', background: '#fff',
                    color: '#4A5568', cursor: 'pointer',
                  }}
                >
                  View
                </button>
                <button
                  onClick={handleDownloadReceipt}
                  disabled={downloading}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    padding: '7px 12px', borderRadius: 8,
                    fontSize: 12, fontWeight: 600,
                    border: 'none', cursor: downloading ? 'not-allowed' : 'pointer',
                    background: '#0F2C59', color: '#fff',
                    opacity: downloading ? 0.6 : 1,
                  }}
                >
                  {downloading ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <Download size={13} />}
                  PDF
                </button>
              </div>
            </div>

            {allocations.length > 0 && (
              <div style={{ marginTop: 18, padding: '0 0 8px', fontSize: 12, fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Paid For
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {allocations.map((a, idx) => {
                const isLast = idx === allocations.length - 1;
                const ref = a.invoice_number ? `INV-${a.invoice_number}` : `INV-${a.invoice_id.slice(0, 8)}`;
                const orderRef = a.order_number ? `ORD-${a.order_number}` : null;
                const dateStr = payment.date ? new Date(payment.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';

                return (
                  <div
                    key={a.allocation_id || a.id || a.invoice_id}
                    style={isLast ? rowLast : row}
                    onMouseEnter={(e) => { e.currentTarget.style.background = '#F8FAFC'; e.currentTarget.style.borderLeftColor = '#0F2C59'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = '#fff'; e.currentTarget.style.borderLeftColor = 'transparent'; }}
                  >
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontSize: 15, fontWeight: 700, color: '#0F172A', margin: 0, lineHeight: 1.3, fontFamily: MONO, fontVariantNumeric: 'tabular-nums' }}>
                        {ref}
                        {orderRef ? <span style={{ color: '#64748B', fontWeight: 600 }}> / {orderRef}</span> : ''}
                      </div>
                      <div style={{ fontSize: 12, color: '#64748B', marginTop: 2 }}>{dateStr}</div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Paid</div>
                        <div style={{ fontSize: 15, fontWeight: 800, color: '#0F172A', fontFamily: MONO, fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.01em' }}>{formatK(a.amount)}</div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {allocations.length > 1 && (
              <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '10px 12px', marginTop: 4 }}>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total Paid</div>
                  <div style={{ fontSize: 16, fontWeight: 800, color: '#0F172A', fontFamily: MONO, fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.01em' }}>{formatK(amountReceived)}</div>
                </div>
              </div>
            )}

             <div style={{ marginTop: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#8A94A6', fontSize: 10.5, gap: 8 }}>
               <Receipt size={14} />
               Need help with this payment? Visit Support.
             </div>
           </div>
         </div>
       </div>
    );
};

export default CustomerPaymentDetail;
