import React from 'react';
import { ItemizedTable, SummaryBlock } from '../components/ItemizedTables';
import ReceiptNarrative from '../components/ReceiptNarrative';
import StatementLedger from '../components/StatementLedger';
import AgingSummary from '../components/AgingSummary';
import ExaminationInvoice from '../components/ExaminationInvoice';
import SubscriptionInvoice from '../components/SubscriptionInvoice';
import WorkOrder from '../components/WorkOrder';
import PurchaseOrder from '../components/PurchaseOrder';
import { currencyService } from '../services/currencyService';
import { calculateLedger, calculateAging } from './ledgerUtils';

export type DocumentType = 'Invoice' | 'Quotation' | 'Delivery Note' | 'Statement' | 'Receipt' | 'Examination Invoice' | 'Subscription Invoice' | 'Work Order' | 'Purchase Order';

export interface DocumentRenderOptions {
  showHeader?: boolean;
  showFooter?: boolean;
  showNotes?: boolean;
  showPrices?: boolean;
  showWatermark?: boolean;
  watermarkText?: string;
}

interface DocumentRenderResult {
  title: string;
  header?: React.ReactNode;
  content: React.ReactNode;
  watermark?: string;
  footer?: React.ReactNode;
  companyLogo?: string;
  companyAddress?: string;
  companyName?: string;
  logoPosition?: 'left' | 'right' | 'center';
}

interface BaseDocumentData {
  id: string;
  date: string;
  customerName: string;
  customerAddress?: string;
  items: any[];
  currencySymbol?: string;
}

interface InvoiceData extends BaseDocumentData {
  subtotal: number;
  total: number;
  dueDate?: string;
}

interface StatementData extends BaseDocumentData {
  openingBalance: number;
  closingBalance: number;
  periodStart: string;
  periodEnd: string;
}

interface ReceiptData extends BaseDocumentData {
  amountPaid: number;
  paymentMethod: string;
  invoiceRef?: string;
}

/**
 * ERP Document Mapping Utility
 * Transforms raw ERP JSON objects into structured components for MasterDocument.
 */
export const mapErpDataToDocument = (type: DocumentType, data: any, renderOptions: DocumentRenderOptions = {}): DocumentRenderResult => {
  const currency = data?.currencySymbol || currencyService.getCurrency(currencyService.getBaseCurrency())?.symbol || '$';

  const options: Required<DocumentRenderOptions> = {
    showHeader: renderOptions.showHeader !== false,
    showFooter: renderOptions.showFooter !== false,
    showNotes: renderOptions.showNotes !== false,
    showPrices: renderOptions.showPrices !== false,
    showWatermark: renderOptions.showWatermark === true,
    watermarkText: renderOptions.watermarkText || ''
  };

  // Normalize common ERP data into the shape this document layer expects
  const normalizeItems = () => {
    const raw = Array.isArray(data?.items) ? data.items : [];
    return raw.map((item: any) => {
      const qty = Number(item.quantity ?? item.qty ?? 0);
      const unitPrice = Number(item.unitPrice ?? item.price ?? item.cost ?? 0);
      const total = Number(
        item.total ??
        item.lineTotalNet ??
        item.lineTotal ??
        (unitPrice * qty)
      );

      return {
        ...item,
        name: item.name ?? item.description ?? item.itemName ?? 'Item',
        sku: item.sku ?? item.itemId ?? item.id ?? '',
        quantity: qty,
        unitPrice,
        total,
        shipped: Number(item.shipped ?? item.quantityShipped ?? item.quantity ?? 0)
      };
    });
  };

  const normalizeExamInvoiceItems = () => {
    const raw = Array.isArray(data?.items) ? data.items : [];
    return raw.map((item: any) => {
      const units = Number(item.units ?? item.quantity ?? item.qty ?? 0);
      const rate = Number(item.rate ?? item.unitPrice ?? item.price ?? item.cost ?? 0);
      const total = Number(
        item.total ??
        item.lineTotalNet ??
        item.lineTotal ??
        (rate * units)
      );
      return {
        ...item,
        description: item.description ?? item.name ?? item.itemName ?? 'Item',
        units,
        rate,
        total
      };
    });
  };

  const normalized = {
    ...data,
    items: normalizeItems(),
    subtotal: Number(
      data?.subtotal ??
      data?.subtotalAmount ??
      Number(data?.totalAmount ?? data?.total ?? data?.grandTotal ?? 0)
    ),
    total: Number(data?.total ?? data?.totalAmount ?? data?.grandTotal ?? 0)
  };

  // 1. Common Header Mapping
  const renderHeader = () => {
    if (!options.showHeader) return undefined;

    // Specialized header for PO to focus on "Vendor" instead of "Bill To"
    if (type === 'Purchase Order') {
      return (
        <div className="flex justify-between w-full text-[11px]">
          <div className="space-y-1">
            <p className="font-bold text-slate-800 uppercase tracking-tighter">Issued To:</p>
            <p className="text-slate-600 font-medium">{normalized.vendorName}</p>
            {normalized.vendorAddress && <p className="text-slate-500 max-w-[200px]">{normalized.vendorAddress.split('\n')[0]}</p>}
          </div>
          <div className="text-right space-y-1">
            <p><span className="text-slate-400 uppercase font-bold mr-2">PO #:</span> <span className="font-mono font-bold text-slate-800">{normalized.id}</span></p>
            <p><span className="text-slate-400 uppercase font-bold mr-2">Date:</span> <span className="font-medium text-slate-600">{new Date(normalized.date).toLocaleDateString()}</span></p>
          </div>
        </div>
      );
    }

    const displayType = (type as string) === 'Order' ? 'Sales Order' : type;

    return (
      <div className="flex justify-between w-full text-[11px]">
        <div className="space-y-1">
          <p className="font-bold text-slate-800 uppercase tracking-tighter">Bill To:</p>
          <p className="text-slate-600 font-medium">{normalized.customerName}</p>
          {normalized.customerAddress && <p className="text-slate-500 max-w-[200px]">{normalized.customerAddress}</p>}
        </div>
        <div className="text-right space-y-1">
          <p><span className="text-slate-400 uppercase font-bold mr-2">{displayType} #:</span> <span className="font-mono font-bold text-slate-800">{normalized.id}</span></p>
          <p><span className="text-slate-400 uppercase font-bold mr-2">{displayType} Date:</span> <span className="font-medium text-slate-600">{new Date(normalized.date).toLocaleDateString()}</span></p>
          {normalized.dueDate && <p><span className="text-slate-400 uppercase font-bold mr-2">Due Date:</span> <span className="font-bold text-rose-600">{new Date(normalized.dueDate).toLocaleDateString()}</span></p>}
        </div>
      </div>
    );
  };

  // 2. Specific Content Logic
  const renderContent = () => {
    switch (type) {
      case 'Delivery Note':
        const pod = normalized.proofOfDelivery || {};
        const podSignature = pod.signatureDataUrl || pod.signature || normalized.signatureDataUrl;
        const podReceivedAt = pod.timestamp || normalized.receivedAt || normalized.actualArrival;
        return (
          <div className="space-y-6">
            <ItemizedTable
              columns={[
                { header: 'Item Description', accessor: 'name', wrapSafe: true },
                { header: 'Qty', accessor: 'quantity', align: 'center' as const }
              ]}
              data={normalized.items}
            />
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-[11px]">
                <div>
                  <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Received By</p>
                  <p className="font-semibold text-slate-700">{pod.receivedBy || normalized.receivedBy || 'N/A'}</p>
                </div>
                <div>
                  <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Received At</p>
                  <p className="font-semibold text-slate-700">{podReceivedAt ? new Date(podReceivedAt).toLocaleString() : 'N/A'}</p>
                </div>
                <div>
                  <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Recipient Phone</p>
                  <p className="font-semibold text-slate-700">{pod.recipientPhone || 'N/A'}</p>
                </div>
                <div>
                  <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">GPS Stamp</p>
                  <p className="font-mono font-semibold text-slate-700">
                    {pod.locationStamp
                      ? `${Number(pod.locationStamp.lat).toFixed(4)}, ${Number(pod.locationStamp.lng).toFixed(4)}`
                      : 'N/A'}
                  </p>
                </div>
              </div>
              {(pod.remarks || pod.notes || normalized.notes) && (
                <div className="mt-4 border-t border-slate-200 pt-3">
                  <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Remarks</p>
                  <p className="text-xs text-slate-700 leading-relaxed mt-1">{pod.remarks || pod.notes || normalized.notes}</p>
                </div>
              )}
            </div>
            <div className="mt-6 border-t border-slate-200 pt-8 grid grid-cols-2 gap-8 items-end">
              <div>
                <p className="text-[9px] font-bold text-slate-400 uppercase mb-2">Received By (Name & Signature)</p>
                <div className="border border-slate-300 rounded-md p-2 h-24 flex items-center justify-center bg-white">
                  {podSignature ? (
                    <img
                      src={podSignature}
                      alt="Recipient signature"
                      className="max-h-full max-w-full object-contain"
                    />
                  ) : (
                    <p className="text-[10px] text-slate-400">No signature captured</p>
                  )}
                </div>
              </div>
              <div className="border-b border-slate-300 pb-2">
                <p className="text-[9px] font-bold text-slate-400 uppercase">Date of Receipt</p>
                <p className="text-xs font-semibold text-slate-700 mt-1">
                  {podReceivedAt ? new Date(podReceivedAt).toLocaleString() : 'N/A'}
                </p>
              </div>
            </div>
          </div>
        );

      case 'Statement':
        const statementData = data as StatementData;
        const calculatedEntries = calculateLedger(data.items, statementData.openingBalance);
        const agingData = calculateAging(data.items);

        return (
          <div className="space-y-6">
            <div className="p-4 bg-slate-50 rounded-xl border border-slate-100 flex justify-between">
              <div>
                <p className="text-[9px] font-bold text-slate-400 uppercase">Period</p>
                <p className="text-xs font-bold text-slate-700">{new Date(statementData.periodStart).toLocaleDateString()} - {new Date(statementData.periodEnd).toLocaleDateString()}</p>
              </div>
              <div className="text-right">
                <p className="text-[9px] font-bold text-slate-400 uppercase">Opening Balance</p>
                <p className="text-xs font-bold text-slate-700 font-mono">{currency}{statementData.openingBalance.toLocaleString()}</p>
              </div>
            </div>

            <StatementLedger
              entries={calculatedEntries}
              currencySymbol={currency}
              openingBalance={statementData.openingBalance}
              closingBalance={statementData.closingBalance}
            />

            <AgingSummary
              current={agingData.current}
              thirty={agingData.thirty}
              sixty={agingData.sixty}
              ninetyPlus={agingData.ninetyPlus}
              currencySymbol={currency}
            />
          </div>
        );

      case 'Receipt':
        // Deprecated legacy mapper: use posted receipt payload values only (no live recomputation).
        const invoiceNumbers = Array.isArray(data.appliedInvoices)
          ? data.appliedInvoices
          : (Array.isArray(data.items) ? data.items.map((i: any) => i.id || i.description).filter(Boolean) : []);
        const remainingBalance = Number(data.balanceDue ?? 0);
        const overpaymentAmount = Number(data.walletDeposit ?? data.overpaymentAmount ?? 0);
        const amount = Number(data.amountReceived ?? data.amountPaid ?? 0);
        return (
          <div className="space-y-6 relative z-10 h-full flex flex-col flex-1">
            <ReceiptNarrative
              customerName={data.customerName}
              amount={amount}
              invoiceNumbers={invoiceNumbers}
              remainingBalance={remainingBalance}
              overpaymentAmount={overpaymentAmount}
              currencySymbol={currency}
              paymentMethod={data.paymentMethod || 'Posted'}
            />
          </div>
        );

      case 'Examination Invoice':
        const examItems = normalizeExamInvoiceItems();
        return (
          <ExaminationInvoice
            items={examItems}
            subtotal={normalized.subtotal}
            surcharges={data.surcharges || 0}
            total={normalized.total}
            currencySymbol={currency}
            examinationTerms={data.examinationTerms}
            candidateInstructions={data.candidateInstructions}
            classBreakdown={data.classBreakdown}
            academicYear={data.academicYear}
            term={data.term}
            examType={data.examType}
            schoolName={data.schoolName}
          />
        );

      case 'Subscription Invoice':
        const subscriptionItems = normalized.items.map((item: any) => ({
          description: item.name ?? item.description ?? item.itemName ?? 'Recurring line item',
          quantity: Number(item.quantity ?? item.qty ?? 0),
          rate: Number(item.unitPrice ?? item.price ?? item.cost ?? 0),
          total: Number(item.total ?? item.lineTotal ?? item.lineTotalNet ?? 0)
        }));
        return (
          <SubscriptionInvoice
            items={subscriptionItems}
            subtotal={normalized.subtotal}
            total={normalized.total}
            tax={Number(data.tax || 0)}
            taxRate={Number(data.taxRate || 0)}
            currencySymbol={currency}
            billingPeriodStart={data.billingPeriodStart}
            billingPeriodEnd={data.billingPeriodEnd}
            nextBillingDate={data.nextBillingDate}
            subscriptionStatus={data.status}
            customerName={data.clientName}
            referenceNumber={data.number}
            frequency={data.frequency}
            autoDeductWallet={data.autoDeductWallet}
            autoEmail={data.autoEmail}
          />
        );

      case 'Work Order':
        return (
          <WorkOrder
            resources={data.resources || []}
            workDescription={data.workDescription}
            assignedTechnician={data.assignedTechnician}
            location={data.location}
            scheduledDate={data.scheduledDate}
          />
        );

      case 'Purchase Order':
        return (
          <PurchaseOrder
            items={normalized.items}
            subtotal={normalized.subtotal}
            total={normalized.total}
            currencySymbol={currency}
            vendorName={normalized.vendorName}
            vendorAddress={normalized.vendorAddress}
            vendorEmail={normalized.vendorEmail}
            shippingAddress={normalized.shippingAddress}
            shippingContact={normalized.shippingContact}
            expectedDeliveryDate={normalized.expectedDeliveryDate}
            paymentTerms={normalized.paymentTerms}
          />
        );

      default: // Invoice or Quotation
        const columns = options.showPrices
          ? [
            { header: 'Qty', accessor: 'quantity', align: 'center' as const },
            { header: 'Description', accessor: 'name', wrapSafe: true },
            { header: 'Price', accessor: 'unitPrice', isCurrency: true },
            { header: 'Total', accessor: 'total', isCurrency: true }
          ]
          : [
            { header: 'Qty', accessor: 'quantity', align: 'center' as const },
            { header: 'Description', accessor: 'name', wrapSafe: true }
          ];

        return (
          <div className="space-y-6">
            <ItemizedTable
              columns={columns}
              data={normalized.items}
              currencySymbol={currency}
            />
            <SummaryBlock
              items={[
                { label: 'Subtotal', value: normalized.subtotal },
                ...(data.amountPaid ? [{ label: 'Paid', value: data.amountPaid, isPaid: true }] : []),
                { label: 'Total Amount', value: normalized.total, isGrandTotal: true }
              ]}
              currencySymbol={currency}
              notes={options.showNotes ? normalized.notes : undefined}
              status={data.status}
            />
          </div>
        );
    }
  };

  const logoPosition: 'left' | 'right' | 'center' =
    (type === 'Receipt' || type === 'Statement') ? 'left' :
      (type === 'POS_RECEIPT') ? 'center' : 'right';

  const getTitle = () => {
    if (type === 'Quotation') return 'QUOTATION';
    if ((type as string) === 'Order') return 'SALES ORDER';
    if (type === 'Receipt') return 'PAYMENT RECEIPT';
    if (type === 'Examination Invoice') return 'SERVICE INVOICE';
    return type.toUpperCase();
  };

  const isCancelled =
    String(data?.status || data?.transactionStatus || data?.paymentStatus || data?.orderStatus || '').toLowerCase() === 'cancelled' ||
    String(data?.status || data?.transactionStatus || data?.paymentStatus || data?.orderStatus || '').toLowerCase() === 'canceled' ||
    String(data?.status || data?.transactionStatus || data?.paymentStatus || data?.orderStatus || '').toLowerCase() === 'void' ||
    String(data?.status || data?.transactionStatus || data?.paymentStatus || data?.orderStatus || '').toLowerCase() === 'voided' ||
    data?.isCancelled === true ||
    data?.cancelled === true;

  const watermarkText = options.watermarkText || (options.showWatermark ? 'DRAFT' : (isCancelled ? 'CANCELLED' : undefined));

  return {
    title: getTitle(),
    header: renderHeader(),
    content: renderContent(),
    watermark: watermarkText,
    companyLogo: data?.companyLogo,
    companyAddress: data?.companyAddress,
    companyName: data?.companyName,
    logoPosition,
    footer: options.showFooter ? (
      <div className="flex justify-between items-end w-full">
        <div className="text-[9px] text-slate-400 italic">
          <p>{data.companyAddress || 'Your Company Address Here'}</p>
          <p>Thank you for your business.</p>
        </div>
        <div className="text-right text-[9px] font-bold text-slate-500">
          <p>Page 1 of 1</p>
        </div>
      </div>
    ) : undefined
  };
};
