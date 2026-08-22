import React, { useState } from 'react';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, CardElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { Loader2, CreditCard, Lock } from 'lucide-react';
import { portalLifecycle } from '../../services/portalApiClient';
import PortalButton from './components/PortalButton';
import ErrorBanner from './components/ErrorBanner';
import { useToast } from './components/Toast';

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

const CheckoutForm: React.FC<{
  clientSecret: string;
  invoice: InvoiceDetail;
  onSuccess: () => void;
  onCancel: () => void;
}> = ({ clientSecret, invoice, onSuccess, onCancel }) => {
  const stripe = useStripe();
  const elements = useElements();
  const [submitting, setSubmitting] = useState(false);
  const [cardError, setCardError] = useState<string | null>(null);
  const { addToast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stripe || !elements || !invoice) return;
    setSubmitting(true);
    setCardError(null);
    try {
      const { error, paymentIntent } = await stripe.confirmCardPayment(clientSecret, {
        payment_method: {
          card: elements.getElement(CardElement)!,
          billing_details: { name: invoice.customer_name },
        },
      });
      if (error) {
        setCardError(error.message || 'Payment failed');
        return;
      }
      if (paymentIntent && paymentIntent.status === 'succeeded') {
        const amountToRecord = Number(invoice.total_amount) - Number(invoice.paid_amount || 0);
        // Payments follow the approved workflow: submit a payment request
        // (workflow only); ERP staff verify and post the real payment.
        await portalLifecycle.payments.requestPayment(
          invoice.id,
          amountToRecord,
          `Card payment ${paymentIntent.id}`,
        );
        addToast('success', 'Payment received — pending verification');
        onSuccess();
      }
    } catch (err: any) {
      setCardError(err.message || 'Payment failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {cardError && <ErrorBanner message={cardError} onDismiss={() => setCardError(null)} />}
      <div>
        <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-2">Card Details</label>
        <div className="relative">
          <Lock size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <div className="w-full h-11 px-3.5 py-2.5 border border-slate-200 rounded-xl flex items-center bg-white">
            <CardElement
              options={{
                style: {
                  base: { fontSize: '13px', color: '#23282A', '::placeholder': { color: '#9ca3af' } },
                },
              }}
            />
          </div>
        </div>
      </div>
      <div className="flex gap-3">
        <PortalButton type="submit" disabled={submitting || !stripe} icon={submitting ? Loader2 : CreditCard}>
          {submitting ? 'Processing...' : 'Pay Securely'}
        </PortalButton>
        <PortalButton type="button" variant="secondary" onClick={onCancel} disabled={submitting}>
          Cancel
        </PortalButton>
      </div>
    </form>
  );
};

const stripePublicKey = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY;
const stripePromise = stripePublicKey ? loadStripe(stripePublicKey) : null;

export default function StripePaymentForm(props: {
  clientSecret: string;
  invoice: InvoiceDetail;
  onSuccess: () => void;
  onCancel: () => void;
}) {
  if (!stripePromise) return null;
  return (
    <Elements stripe={stripePromise} options={{ clientSecret: props.clientSecret }}>
      <CheckoutForm {...props} />
    </Elements>
  );
}
