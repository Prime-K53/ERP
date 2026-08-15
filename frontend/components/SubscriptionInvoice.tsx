import React from 'react';
import { ItemizedTable, SummaryBlock } from './ItemizedTables';
import { Calendar, RefreshCw, CheckCircle2, Mail, Wallet, User, FileText, Settings } from 'lucide-react';

interface SubscriptionItem {
  description: string;
  quantity: number;
  rate: number;
  total: number;
}

interface SubscriptionInvoiceProps {
  items: SubscriptionItem[];
  subtotal: number;
  total: number;
  tax?: number;
  taxRate?: number;
  currencySymbol?: string;
  billingPeriodStart?: string;
  billingPeriodEnd?: string;
  nextBillingDate?: string;
  subscriptionStatus?: string;
  customerName?: string;
  referenceNumber?: string;
  frequency?: string;
  autoDeductWallet?: boolean;
  autoEmail?: boolean;
}

const SubscriptionInvoice: React.FC<SubscriptionInvoiceProps> = ({
  items,
  subtotal,
  total,
  tax,
  taxRate,
  currencySymbol = '$',
  billingPeriodStart,
  billingPeriodEnd,
  nextBillingDate,
  subscriptionStatus,
  customerName,
  referenceNumber,
  frequency,
  autoDeductWallet,
  autoEmail
}) => {
  const columns = [
    { header: 'Qty', accessor: 'quantity', align: 'center' as const, width: '10%' },
    { header: 'Service Description', accessor: 'description', width: '55%', wrapSafe: true },
    { header: 'Unit Price', accessor: 'rate', isCurrency: true, align: 'right' as const, width: '15%' },
    { header: 'Amount', accessor: 'total', isCurrency: true, align: 'right' as const, width: '20%' }
  ];

  const getStatusStyles = (status: string) => {
    switch (status) {
      case 'Active':
        return 'bg-emerald-50 text-emerald-700 border-emerald-200';
      case 'Paused':
        return 'bg-amber-50 text-amber-700 border-amber-200';
      case 'Cancelled':
        return 'bg-rose-50 text-rose-700 border-rose-200';
      case 'Expired':
        return 'bg-slate-100 text-slate-600 border-slate-200';
      default:
        return 'bg-slate-50 text-slate-700 border-slate-200';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'Active':
        return <CheckCircle2 size={12} />;
      case 'Paused':
        return <RefreshCw size={12} />;
      default:
        return null;
    }
  };

  const formatDisplayDate = (value?: string, fallback = 'Not scheduled') => {
    if (!value) return fallback;
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return value;
    return parsed.toLocaleDateString();
  };

  const resolvedStatus = subscriptionStatus || 'Draft';
  const billingPeriodLabel = billingPeriodStart
    ? `${formatDisplayDate(billingPeriodStart)} - ${billingPeriodEnd ? formatDisplayDate(billingPeriodEnd) : 'Open-ended'}`
    : 'Starts on next billing date';

  const summaryItems = [
    { label: 'Subtotal', value: subtotal },
    ...(tax && tax > 0 ? [{ label: `Tax${taxRate ? ` (${taxRate}%)` : ''}`, value: tax }] : []),
    { label: 'Total Due', value: total, isGrandTotal: true }
  ];

  return (
    <div className="subscription-invoice space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-100 bg-slate-50 p-5 shadow-sm">
        <div className="space-y-1">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Recurring Invoice</p>
          <div className="flex items-center gap-2 text-slate-700">
            <FileText size={14} className="text-blue-500" />
            <span className="text-sm font-bold">{referenceNumber || 'Draft recurring schedule'}</span>
          </div>
          {customerName && <p className="text-xs text-slate-500">{customerName}</p>}
        </div>

        <div className="space-y-1 text-right">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Subscription Status</p>
          <div className="flex items-center justify-end gap-3">
            <div className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[10px] font-bold uppercase tracking-tight ${getStatusStyles(resolvedStatus)}`}>
              {getStatusIcon(resolvedStatus)}
              {resolvedStatus}
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-indigo-100 bg-gradient-to-br from-indigo-50 to-purple-50 p-6 shadow-sm">
        <h3 className="mb-4 flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-indigo-600">
          <Settings size={14} />
          Recurring Billing Profile
        </h3>
        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Calendar size={14} className="text-indigo-500" />
              <span className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Billing Period</span>
            </div>
            <p className="pl-5 text-sm font-bold text-slate-800">{billingPeriodLabel}</p>
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <RefreshCw size={14} className="text-indigo-500" />
              <span className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Billing Frequency</span>
            </div>
            <p className="pl-5 text-sm font-bold text-slate-800">{frequency || 'Monthly'}</p>
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Calendar size={14} className="text-indigo-500" />
              <span className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Next Billing Date</span>
            </div>
            <p className="pl-5 text-sm font-bold text-slate-800">{formatDisplayDate(nextBillingDate)}</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2 text-slate-500">
            <User size={14} className="text-blue-500" />
            <span className="text-[10px] font-bold uppercase tracking-wide">Customer</span>
          </div>
          <p className="mt-3 text-sm font-bold text-slate-800">{customerName || 'Customer not assigned'}</p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2 text-slate-500">
            <Wallet size={14} className="text-blue-500" />
            <span className="text-[10px] font-bold uppercase tracking-wide">Auto Collection</span>
          </div>
          <p className="mt-3 text-sm font-bold text-slate-800">{autoDeductWallet ? 'Wallet deduction enabled' : 'Wallet deduction disabled'}</p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2 text-slate-500">
            <Mail size={14} className="text-blue-500" />
            <span className="text-[10px] font-bold uppercase tracking-wide">Auto Delivery</span>
          </div>
          <p className="mt-3 text-sm font-bold text-slate-800">{autoEmail ? 'Email delivery enabled' : 'Email delivery disabled'}</p>
        </div>
      </div>

      <ItemizedTable
        columns={columns}
        data={items}
        currencySymbol={currencySymbol}
      />

      <div className="grid grid-cols-1 items-start gap-8 md:grid-cols-2">
        <div className="break-inside-avoid rounded-2xl border border-blue-100/50 bg-blue-50/30 p-6">
          <h3 className="mb-4 flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-blue-600">
            <RefreshCw size={14} />
            Recurring Schedule Notes
          </h3>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-medium uppercase text-slate-500">Next Billing Date</span>
              <span className="text-sm font-bold text-slate-800">{formatDisplayDate(nextBillingDate)}</span>
            </div>
            <p className="text-[10px] italic leading-relaxed text-slate-500">
              Future invoices will be generated from this recurring profile on the next billing date. Manual schedule overrides, when configured, are applied by the billing engine without changing the underlying line items.
            </p>
          </div>
        </div>

        <SummaryBlock
          items={summaryItems}
          currencySymbol={currencySymbol}
        />
      </div>

      <style>{`
        .subscription-invoice .itemized-table-container th {
          background-color: #f8fafc;
        }
      `}</style>
    </div>
  );
};

export default SubscriptionInvoice;
