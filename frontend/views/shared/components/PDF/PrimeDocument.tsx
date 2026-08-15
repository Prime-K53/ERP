import React from 'react';
import { Document, Page, View, Text, Font, Image } from '@react-pdf/renderer';
import { docStyles as s } from './styles.ts';
import {
  PrimeDocData,
  SalesExchangeDoc,
  LogisticsDoc,
  StatementDoc,
  FiscalReportDoc,
  ReceiptDoc,
  SupplierPaymentDoc,
  PosReceiptDoc,
  ExaminationInvoiceDoc,
  SubscriptionDoc,
} from './schemas.ts';
import { CompanyConfig } from '../../../../types.ts';
import { resolvePdfLogoSource, resolvePdfQrCodeSource } from '../../../../utils/companyAssetUtils.ts';
import {
  getDefaultPaymentTermsLabel,
  getStoredCompanyConfig,
  resolvePrimeTemplateSettings,
  PrimeTemplateSettings,
} from './templateSettings.ts';
import { generateAccountSummary } from '../../../../utils/pdfMapper.ts';
import { currencyService } from '../../../../services/currencyService';

const formatPhone = (phone: string): string => {
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('265')) {
    return '(+265) ' + digits.slice(3, 6) + ' ' + digits.slice(6, 9) + ' ' + digits.slice(9, 12);
  }
  return phone;
};

const InvoiceInfoPanel = ({
  type,
  settings,
  data,
  config,
  fontScale,
  customers = [],
}: {
  type: 'payment_terms' | 'account_summary';
  settings: PrimeTemplateSettings;
  data: any;
  config: CompanyConfig | null;
  fontScale: number;
  customers?: any[];
}) => {
  if (type === 'account_summary') {
    const summary = generateAccountSummary(data, config, customers);
    return (
      <View style={{ marginBottom: 15 }}>
        <Text style={{ fontSize: 8 * fontScale, fontWeight: 'bold', color: '#94a3b8', textTransform: 'uppercase', marginBottom: 4, letterSpacing: 1 }}>ACCOUNT SUMMARY</Text>
        <Text style={{ fontSize: 10 * fontScale, color: '#475569', lineHeight: 1.4 }}>{summary.statement}</Text>
      </View>
    );
  }

  const paymentTermsLabel = String(data?.paymentTerms || '').trim() || getDefaultPaymentTermsLabel(config);
  return (
    <View style={{ marginBottom: 15 }}>
      <Text style={{ fontSize: 8 * fontScale, fontWeight: 'bold', color: '#94a3b8', textTransform: 'uppercase', marginBottom: 4, letterSpacing: 1 }}>Payment Terms</Text>
      <Text style={{ fontSize: 10 * fontScale, color: '#475569', lineHeight: 1.4 }}>{paymentTermsLabel}</Text>
    </View>
  );
};

const hexToRgb = (hex: string) => {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16)
  } : null;
};

// Disable hyphenation
Font.registerHyphenationCallback(word => [word]);

const renderQrImage = (qrCodeDataUrl?: string | null, size: number = 52) => {
  const resolvedQrCode = resolvePdfQrCodeSource(qrCodeDataUrl);
  if (!resolvedQrCode) return null;

  return <Image src={resolvedQrCode} style={{ width: size, height: size }} />;
};

// Format amount helper
const formatAmount = (amount: number) => {
  return (amount || 0).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};

const toTitleCase = (str: string) => {
  return str.toLowerCase().split(/[_\s]+/).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
};

const formatDateOnly = (value?: string) => {
  const normalized = String(value || '').trim();
  if (!normalized) return 'N/A';

  const parsed = new Date(normalized);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toLocaleDateString();
  }

  const simpleDate = normalized.match(/^(\d{4}-\d{2}-\d{2})/);
  if (simpleDate) {
    const dateOnly = new Date(`${simpleDate[1]}T00:00:00`);
    if (!Number.isNaN(dateOnly.getTime())) {
      return dateOnly.toLocaleDateString();
    }
  }

  const beforeComma = normalized.split(',')[0]?.trim();
  return beforeComma || normalized;
};

const getStatusTone = (status?: string) => {
  const normalized = String(status || '').trim().toLowerCase();

  if (normalized === 'paid' || normalized === 'active') {
    return { border: '#10b981', text: '#059669' };
  }

  if (normalized === 'partial' || normalized === 'partially paid' || normalized === 'partially_paid' || normalized === 'paused' || normalized === 'processing') {
    return { border: '#f59e0b', text: '#d97706' };
  }

  if (normalized === 'overdue') {
    return { border: '#dc2626', text: '#b91c1c' };
  }

  return { border: '#ef4444', text: '#dc2626' };
};

const formatSecurityTimestamp = (value?: string) => {
  const parsed = value ? new Date(value) : new Date();
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toLocaleString();
  }

  return String(value || 'Unknown time');
};

const isCancelledStatus = (status?: string | boolean, data?: any): boolean => {
  if (data?.isCancelled === true || data?.cancelled === true) return true;
  const str = String(status || data?.status || data?.transactionStatus || data?.paymentStatus || data?.orderStatus || '').trim().toLowerCase();
  return str === 'cancelled' || str === 'canceled' || str === 'void' || str === 'voided';
};

const CancelledWatermark = () => (
  <View style={s.watermarkContainer} fixed>
    <Text style={s.watermarkText}>CANCELLED</Text>
  </View>
);

import { StatementSummaryTemplate } from './StatementSummaryTemplate.tsx';

interface DocProps {
  type: 'INVOICE' | 'WORK_ORDER' | 'PO' | 'DELIVERY_NOTE' | 'QUOTATION' | 'RECEIPT' | 'SUPPLIER_PAYMENT' | 'POS_RECEIPT' | 'ACCOUNT_STATEMENT' | 'EXAMINATION_INVOICE' | 'ACCOUNT_STATEMENT_SUMMARY' | 'FISCAL_REPORT' | 'SALES_EXCHANGE' | 'ORDER' | 'SALES_ORDER' | 'SUBSCRIPTION';
  data: PrimeDocData;
  configOverride?: CompanyConfig | null;
}

const SecurityFooter = ({
  data,
  companyName,
  legalFooterLine1,
  legalFooterLine2,
  fontScale = 1,
}: {
  data: Record<string, unknown>;
  companyName: string;
  legalFooterLine1: string;
  legalFooterLine2: string;
  fontScale?: number;
}) => {
  const footerQrSize = 50;
  const documentNumber = String(
    data.number
    || data.invoiceNumber
    || data.orderNumber
    || data.receiptNumber
    || data.paymentId
    || data.exchangeNumber
    || data.reportName
    || 'N/A'
  ).trim() || 'N/A';
  const rawCreatedBy = data?.createdByName || data?.createdBy || data?.created_by || data?.cashierName || '';
  const createdBy = String(rawCreatedBy).trim();
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(createdBy);
  const displayCreatedBy = createdBy && !isUuid ? createdBy : 'System User';
  const createdOn = formatSecurityTimestamp(
    String(data?.createdAtIso
    || data?.createdAt
    || data?.created_at
    || data?.date || '')
  );
  const qrCodeDataUrl = resolvePdfQrCodeSource(String(data?.securityQrCodeDataUrl || '').trim());

  return (
    <View style={s.securityFooter} fixed>
      <View style={s.securityFooterText}>
        <Text style={[s.securityFooterLine, { fontSize: 10 * fontScale, lineHeight: 1.4, textAlign: 'left' }]}>{legalFooterLine1}</Text>
        <Text style={[s.securityFooterLine, { marginTop: 2, fontSize: 10 * fontScale, lineHeight: 1.4, textAlign: 'left' }]}>{legalFooterLine2}</Text>
      </View>

      <View
        style={[
          s.securityQrPanel,
          {
            width: footerQrSize + 8,
            alignItems: 'center',
            borderWidth: 0,
            backgroundColor: 'transparent',
            paddingVertical: 0,
            paddingHorizontal: 0,
          },
        ]}
      >
        {!!qrCodeDataUrl ? (
          <Image src={qrCodeDataUrl} style={{ width: footerQrSize, height: footerQrSize }} />
        ) : null}
      </View>
    </View>
  );
};

const CleanInvoiceTemplate = ({
  type,
  data,
  config,
  templateSettings
}: {
  type: string;
  data: Record<string, unknown>;
  config: CompanyConfig | null;
  templateSettings: ReturnType<typeof resolvePrimeTemplateSettings>;
}) => {
  const dataAny = data;
  const fontScale = templateSettings.bodyFontSize / 12;

  // Company Details
  const companyName = config?.companyName || 'Prime Printing & Stationery';
  const companyAddress = config?.addressLine1 || 'Lilongwe, Malawi';
  const rawPhone = config?.phone || '';
  const formattedPhone = rawPhone.replace(/(\+265\s?\d{3}\s?\d{3}\s?\d{3})(?=\+265)/g, '$1 | ');
  const companyPhone = formattedPhone || 'N/A';
  const companyEmail = config?.email || 'N/A';
  const currency = config?.currencySymbol || currencyService.getCurrency(currencyService.getBaseCurrency())?.symbol || 'K';
  
  const logo = resolvePdfLogoSource(config, templateSettings.showCompanyLogo);
  const accentColor = templateSettings.accentColor || '#5a9e96';

  let docTitle = 'INVOICE';
  if (type === 'QUOTATION') docTitle = 'QUOTATION';
  else if (type === 'ORDER' || type === 'SALES_ORDER') docTitle = 'SALES ORDER';
  else if (type === 'PO') docTitle = 'PURCHASE ORDER';
  else if (type === 'SUBSCRIPTION') docTitle = 'RECURRING INVOICE';

  const pod = dataAny.proofOfDelivery as Record<string, unknown> | undefined;

  // Invoice Details
  const invoiceNumber = String(dataAny.invoiceNumber || dataAny.orderNumber || dataAny.number || dataAny.quotationNumber || new Date().getTime());
  const invoiceDate = String(dataAny.date || new Date().toLocaleDateString());
  const dueDate = dataAny.dueDate ? String(dataAny.dueDate) : undefined;
  
  const docTitleForMeta = `${docTitle} ${invoiceNumber}`;
  
  // Recipient Details
  const resolvedRecipientName = String(
    dataAny.clientName || dataAny.customerName || dataAny.customer_name || dataAny.schoolName || dataAny.school_name || dataAny.recipientName || dataAny.recipient_name || dataAny.vendorName || dataAny.vendor_name || dataAny.supplierName || dataAny.supplier_name || pod?.receivedBy || dataAny.receivedBy || ''
  ).trim();
  const resolvedRecipientAddress = String(
    dataAny.address || dataAny.customerAddress || dataAny.customer_address || dataAny.billingAddress || dataAny.billing_address || dataAny.shippingAddress || dataAny.shipping_address || dataAny.schoolAddress || dataAny.school_address || dataAny.vendorAddress || dataAny.vendor_address || dataAny.supplierAddress || dataAny.supplier_address || pod?.address || pod?.deliveryLocation || ''
  ).trim();
  const resolvedRecipientPhone = formatPhone(String(
    dataAny.phone || dataAny.customerPhone || dataAny.customer_phone || dataAny.schoolPhone || dataAny.school_phone || dataAny.vendorPhone || dataAny.vendor_phone || dataAny.supplierPhone || dataAny.supplier_phone || dataAny.recipientPhone || dataAny.recipient_phone || pod?.receiverPhone || pod?.recipientPhone || pod?.phone || ''
  ).trim());

  // Financials
  const items = (dataAny.items || []) as Array<Record<string, unknown>>;
  const subtotal = Number(dataAny.subtotal) || 0;
  const amountPaid = Number(dataAny.amountPaid) || 0;
  const totalAmount = Number(dataAny.totalAmount) || subtotal;
  const tax = Number(dataAny.tax) || 0;
  const discount = Number(dataAny.discount) || 0;
  const discountPercentage = discount > 0 && subtotal > 0 ? Number(((discount / subtotal) * 100).toFixed(2)) : 0;
  const discountLabel = discountPercentage > 0 ? `Discount (${discountPercentage}%)` : 'Discount';
  const discountAmountText = discount > 0 ? `-${currency} ${discount.toLocaleString('en-US', {minimumFractionDigits: 2})}` : '';
  
  const showInvoiceBalances = templateSettings.showOutstandingAndWalletBalances;
  const resolvedWalletBalance = Number(dataAny.walletBalance || 0);
  const resolvedOutstandingBalance = Math.max(0, Number(dataAny.totalAmount || 0) - Number(dataAny.amountPaid || 0));

  const showPaymentTerms = templateSettings.showPaymentTerms;
  const paymentTermsLabel = String(dataAny.paymentTerms || '').trim() || getDefaultPaymentTermsLabel(config);
   
  const companyEnquiryLine = [companyName, companyAddress].filter(Boolean).join(', ');
  const companyFlatContact1 = `${companyEnquiryLine}, Phone ${companyPhone}`;
  const legalFooterLine1 = showPaymentTerms
    ? `This is a computer-generated document. No signature required. Payment terms: ${paymentTermsLabel}.`
    : 'This is a computer-generated document. No signature required, For enquiries contact:';
  const legalFooterLine2 = `${companyFlatContact1}`;

  const renderRow = (item: any, i: number) => {
    const isService = item.category === 'service' || item.type === 'service' || item.isService === true;
    let formattedDesc = item.desc || item.name;
    if (isService) {
      const totalPages = item.totalPages || item.pages || 0;
      const copies = item.copies || item.qty || 1;
      const itemName = item.name || item.desc || 'Service';
      if (totalPages > 0) {
        formattedDesc = `${itemName} (${totalPages} pages × ${copies} copies)`;
      }
    }
      
    return (
      <View key={i} style={{ flexDirection: 'row', borderBottomWidth: 0.5, borderBottomColor: '#e0e0e0', minHeight: 24, alignItems: 'center', paddingVertical: 4 }}>
        <Text style={{ flex: 2, paddingHorizontal: 8, fontSize: 10 * fontScale, color: '#334155' }}>{formattedDesc}</Text>
        <Text style={{ width: 60, paddingHorizontal: 8, fontSize: 10 * fontScale, color: '#334155', textAlign: 'right' }}>{item.qty}</Text>
        <Text style={{ width: 100, paddingHorizontal: 8, fontSize: 10 * fontScale, color: '#334155', textAlign: 'right' }}>{currency} {(item.price || (item.qty ? item.total / item.qty : 0)).toFixed(2)}</Text>
        <Text style={{ width: 100, paddingHorizontal: 8, fontSize: 10 * fontScale, color: '#334155', textAlign: 'right' }}>{currency} {item.total.toFixed(2)}</Text>
      </View>
    );
  };

  const isCancelled = isCancelledStatus(dataAny.status, dataAny);

  return (
    <Document title={docTitleForMeta} author={companyName}>
      <Page size="A4" style={{ padding: 40, fontFamily: templateSettings.fontFamily }}>
        {isCancelled && <CancelledWatermark />}
        {/* Header */}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 40 }}>
           <View style={{ flex: 1 }}>
              {!!logo ? (
                <Image src={logo} style={{ width: templateSettings.logoWidth, marginBottom: 10 }} />
              ) : (
                <Text style={{ fontSize: templateSettings.companyNameFontSize, fontWeight: 'bold', color: accentColor, marginBottom: 8 }}>{companyName}</Text>
              )}
              <Text style={{ fontSize: 9 * fontScale, color: '#64748b', lineHeight: 1.4 }}>{companyAddress}</Text>
              <Text style={{ fontSize: 9 * fontScale, color: '#64748b', marginTop: 2 }}>{companyPhone}</Text>
              {companyEmail !== 'N/A' && <Text style={{ fontSize: 9 * fontScale, color: '#64748b', marginTop: 2 }}>{companyEmail}</Text>}
           </View>
           <View style={{ flex: 1, alignItems: 'flex-end', textAlign: 'right' }}>
              <Text style={{ fontSize: 26 * fontScale, fontWeight: '300', color: '#1e293b', letterSpacing: 1.5 }}>{docTitle}</Text>
              <Text style={{ fontSize: 11 * fontScale, color: '#475569', marginTop: 8, fontWeight: 'bold' }}>{invoiceNumber}</Text>
           </View>
        </View>

        {/* Company and Client Info */}
        <View style={{ flexDirection: 'row', marginBottom: 30, gap: 30 }}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 8 * fontScale, fontWeight: 'bold', color: '#94a3b8', textTransform: 'uppercase', marginBottom: 6, letterSpacing: 1 }}>Bill To</Text>
            <Text style={{ fontSize: 11 * fontScale, fontWeight: 'bold', color: '#1e293b', marginBottom: 4 }}>{resolvedRecipientName || 'N/A'}</Text>
            {!!resolvedRecipientAddress && <Text style={{ fontSize: 10 * fontScale, color: '#334155', marginBottom: 3, lineHeight: 1.4 }}>{resolvedRecipientAddress}</Text>}
            {!!resolvedRecipientPhone && <Text style={{ fontSize: 10 * fontScale, color: '#334155' }}>{resolvedRecipientPhone}</Text>}
          </View>
          <View style={{ flex: 1, alignItems: 'flex-start' }}>
            <View style={{ marginBottom: 12 }}>
              <Text style={{ fontSize: 8 * fontScale, fontWeight: 'bold', color: '#94a3b8', textTransform: 'uppercase', marginBottom: 3, letterSpacing: 1 }}>Date</Text>
              <Text style={{ fontSize: 10 * fontScale, color: '#1e293b', fontWeight: 'bold' }}>{invoiceDate}</Text>
            </View>
            {Boolean(templateSettings.showDueDate) && !!dueDate && (
              <View style={{ marginBottom: 12 }}>
                <Text style={{ fontSize: 8 * fontScale, fontWeight: 'bold', color: '#94a3b8', textTransform: 'uppercase', marginBottom: 3, letterSpacing: 1 }}>Due Date</Text>
                <Text style={{ fontSize: 10 * fontScale, color: '#1e293b', fontWeight: 'bold' }}>{dueDate}</Text>
              </View>
            )}
          </View>
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            {!!dataAny.status && (
              <View style={{ paddingVertical: 8, paddingHorizontal: 12, borderRadius: 4, borderWidth: 1, borderColor: getStatusTone(String(dataAny.status)).border, backgroundColor: getStatusTone(String(dataAny.status)).border + '15' }}>
                <Text style={{ fontSize: 12 * fontScale, color: getStatusTone(String(dataAny.status)).text, fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: 1 }}>{String(dataAny.status).toUpperCase()}</Text>
              </View>
            )}
          </View>
        </View>

        {/* Table representation */}
        <View style={{ marginBottom: 20 }}>
          <View style={{ flexDirection: 'row', backgroundColor: accentColor, borderRadius: 4, minHeight: 28, alignItems: 'center' }}>
            <Text style={{ flex: 2, paddingHorizontal: 8, fontSize: 10 * fontScale, fontWeight: 'bold', color: '#ffffff' }}>Item Description</Text>
            <Text style={{ width: 60, paddingHorizontal: 8, fontSize: 10 * fontScale, fontWeight: 'bold', color: '#ffffff', textAlign: 'right' }}>Qty</Text>
            <Text style={{ width: 100, paddingHorizontal: 8, fontSize: 10 * fontScale, fontWeight: 'bold', color: '#ffffff', textAlign: 'right' }}>Unit Price</Text>
            <Text style={{ width: 100, paddingHorizontal: 8, fontSize: 10 * fontScale, fontWeight: 'bold', color: '#ffffff', textAlign: 'right' }}>Amount</Text>
          </View>
          {items.map(renderRow)}
        </View>

        {/* Totals Section */}
        {type === 'PO' ? (
          <View style={{ flexDirection: 'row', justifyContent: 'flex-end', marginTop: 15 }}>
            <View style={{ minWidth: 220 }}>
              <View style={{ flexDirection: 'row', paddingVertical: 4 }}>
                <Text style={{ flex: 1, fontSize: 10 * fontScale, color: '#475569' }}>Subtotal</Text>
                <Text style={{ flex: 1, fontSize: 10 * fontScale, color: '#1e293b', fontWeight: 'bold', textAlign: 'right' }}>{currency} {subtotal.toLocaleString('en-US', {minimumFractionDigits: 2})}</Text>
              </View>
              {discount > 0 && (
                <View style={{ flexDirection: 'row', paddingVertical: 4 }}>
                  <Text style={{ flex: 1, fontSize: 10 * fontScale, color: '#475569' }}>{discountLabel}</Text>
                  <Text style={{ flex: 1, fontSize: 10 * fontScale, color: '#1e293b', fontWeight: 'bold', textAlign: 'right' }}>{discountAmountText}</Text>
                </View>
              )}
              {tax > 0 && (
                <View style={{ flexDirection: 'row', paddingVertical: 4 }}>
                  <Text style={{ flex: 1, fontSize: 10 * fontScale, color: '#475569' }}>Tax</Text>
                  <Text style={{ flex: 1, fontSize: 10 * fontScale, color: '#1e293b', fontWeight: 'bold', textAlign: 'right' }}>{currency} {tax.toLocaleString('en-US', {minimumFractionDigits: 2})}</Text>
                </View>
              )}
              {dataAny.roundingDifference ? (
                <View style={{ flexDirection: 'row', paddingVertical: 4 }}>
                  <Text style={{ flex: 1, fontSize: 10 * fontScale, color: '#475569' }}>Rounding{dataAny.roundingMethod ? ` (${dataAny.roundingMethod})` : ''}</Text>
                  <Text style={{ flex: 1, fontSize: 10 * fontScale, color: '#1e293b', fontWeight: 'bold', textAlign: 'right' }}>{currency} {Number(dataAny.roundingDifference).toLocaleString('en-US', {minimumFractionDigits: 2})}</Text>
                </View>
              ) : null}
              {type !== 'QUOTATION' && type !== 'SUBSCRIPTION' && (
                <View style={{ flexDirection: 'row', paddingVertical: 4, marginTop: 4, borderTopWidth: 1, borderColor: '#e2e8f0', paddingTop: 8 }}>
                  <Text style={{ flex: 1, fontSize: 10 * fontScale, color: '#475569' }}>Amount Paid</Text>
                  <Text style={{ flex: 1, fontSize: 10 * fontScale, color: '#1e293b', fontWeight: 'bold', textAlign: 'right' }}>{currency} {amountPaid.toLocaleString('en-US', {minimumFractionDigits: 2})}</Text>
                </View>
              )}
              {type !== 'QUOTATION' && type !== 'SUBSCRIPTION' && (
                <View style={{ flexDirection: 'row', paddingVertical: 8, backgroundColor: accentColor + '15', marginTop: 8, borderRadius: 4, paddingHorizontal: 8 }}>
                  <Text style={{ flex: 1, fontSize: 11 * fontScale, fontWeight: 'bold', color: accentColor }}>Balance Due</Text>
                  <Text style={{ fontSize: 11 * fontScale, fontWeight: 'bold', color: accentColor, textAlign: 'right' }}>
                    {currency} {(totalAmount - amountPaid).toLocaleString('en-US', {minimumFractionDigits: 2})}
                  </Text>
                </View>
              )}
            </View>
          </View>
        ) : (
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 15 }}>
          <View style={{ flex: 1.5, paddingRight: 40 }}>
             {/* Notes region */}
              {!!dataAny.notes && (
                 <View>
                    <Text style={{ fontSize: 8 * fontScale, fontWeight: 'bold', color: '#94a3b8', textTransform: 'uppercase', marginBottom: 4, letterSpacing: 1 }}>Notes</Text>
                    <Text style={{ fontSize: 10 * fontScale, color: '#475569', lineHeight: 1.4 }}>{String(dataAny.notes)}</Text>
                 </View>
              )}
          </View>

          <View style={{ flex: 1, minWidth: 220 }}>
            <View style={{ flexDirection: 'row', paddingVertical: 4 }}>
              <Text style={{ flex: 1, fontSize: 10 * fontScale, color: '#475569' }}>Subtotal</Text>
              <Text style={{ flex: 1, fontSize: 10 * fontScale, color: '#1e293b', fontWeight: 'bold', textAlign: 'right' }}>{currency} {subtotal.toLocaleString('en-US', {minimumFractionDigits: 2})}</Text>
            </View>
            {discount > 0 && (
              <View style={{ flexDirection: 'row', paddingVertical: 4 }}>
                <Text style={{ flex: 1, fontSize: 10 * fontScale, color: '#475569' }}>{discountLabel}</Text>
                <Text style={{ flex: 1, fontSize: 10 * fontScale, color: '#1e293b', fontWeight: 'bold', textAlign: 'right' }}>{discountAmountText}</Text>
              </View>
            )}
            {tax > 0 && (
              <View style={{ flexDirection: 'row', paddingVertical: 4 }}>
                <Text style={{ flex: 1, fontSize: 10 * fontScale, color: '#475569' }}>Tax</Text>
                <Text style={{ flex: 1, fontSize: 10 * fontScale, color: '#1e293b', fontWeight: 'bold', textAlign: 'right' }}>{currency} {tax.toLocaleString('en-US', {minimumFractionDigits: 2})}</Text>
              </View>
            )}
            {dataAny.roundingDifference ? (
              <View style={{ flexDirection: 'row', paddingVertical: 4 }}>
                <Text style={{ flex: 1, fontSize: 10 * fontScale, color: '#475569' }}>Rounding{dataAny.roundingMethod ? ` (${dataAny.roundingMethod})` : ''}</Text>
                <Text style={{ flex: 1, fontSize: 10 * fontScale, color: '#1e293b', fontWeight: 'bold', textAlign: 'right' }}>{currency} {Number(dataAny.roundingDifference).toLocaleString('en-US', {minimumFractionDigits: 2})}</Text>
              </View>
            ) : null}
            
            {type !== 'INVOICE' && type !== 'ORDER' && type !== 'QUOTATION' && type !== 'SUBSCRIPTION' && (
              <View style={{ alignSelf: 'flex-end', width: 220, flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, borderTopWidth: 1, borderColor: '#e2e8f0', marginTop: 4 }}>
                <Text style={{ fontSize: 11 * fontScale, fontWeight: 'bold', color: '#1e293b' }}>Total Amount</Text>
                <Text style={{ fontSize: 11 * fontScale, fontWeight: 'bold', color: '#1e293b', textAlign: 'right' }}>{currency} {(totalAmount).toLocaleString('en-US', {minimumFractionDigits: 2})}</Text>
              </View>
            )}
            
            {type !== 'QUOTATION' && type !== 'SUBSCRIPTION' && (
              <View style={{ flexDirection: 'row', paddingVertical: 4, marginTop: (type === 'INVOICE' || type === 'ORDER') ? 4 : 0, borderTopWidth: (type === 'INVOICE' || type === 'ORDER') ? 1 : 0, borderColor: '#e2e8f0', paddingTop: (type === 'INVOICE' || type === 'ORDER') ? 8 : 4 }}>
                <Text style={{ flex: 1, fontSize: 10 * fontScale, color: '#475569' }}>Amount Paid</Text>
                <Text style={{ flex: 1, fontSize: 10 * fontScale, color: '#1e293b', fontWeight: 'bold', textAlign: 'right' }}>{currency} {amountPaid.toLocaleString('en-US', {minimumFractionDigits: 2})}</Text>
              </View>
            )}
            
            
            {type !== 'QUOTATION' && type !== 'SUBSCRIPTION' && (
              <View style={{ flexDirection: 'row', paddingVertical: 8, backgroundColor: accentColor + '15', marginTop: 8, borderRadius: 4, paddingHorizontal: 8 }}>
                <Text style={{ flex: 1, fontSize: 11 * fontScale, fontWeight: 'bold', color: accentColor }}>Balance Due</Text>
                <Text style={{ fontSize: 11 * fontScale, fontWeight: 'bold', color: accentColor, textAlign: 'right' }}>
                    {currency} {(totalAmount - amountPaid).toLocaleString('en-US', {minimumFractionDigits: 2})}
                </Text>
              </View>
            )}
            
            {type === 'SUBSCRIPTION' && (
              <View style={{ flexDirection: 'row', paddingVertical: 8, backgroundColor: accentColor + '15', marginTop: 8, borderRadius: 4, paddingHorizontal: 8 }}>
                <Text style={{ flex: 1, fontSize: 11 * fontScale, fontWeight: 'bold', color: accentColor }}>Recurring Total</Text>
                <Text style={{ flex: 1, fontSize: 11 * fontScale, fontWeight: 'bold', color: accentColor, textAlign: 'right' }}>
                    {currency} {totalAmount.toLocaleString('en-US', {minimumFractionDigits: 2})}
                </Text>
              </View>
            )}
          </View>
        </View>
        )
        }

        {/* Outstanding Balance Statement */}
        {type === 'INVOICE' && showInvoiceBalances && Number(dataAny?.totalCustomerOutstanding || 0) > 0 && (() => {
          const totalOutstanding = Number(dataAny.totalCustomerOutstanding || 0);
          const todayStr = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
          return (
            <View style={{ marginTop: 15, padding: 8, backgroundColor: '#f0f9ff', borderRadius: 4, borderLeftWidth: 3, borderLeftColor: '#0ea5e9' }} wrap={false}>
              <Text style={{ fontSize: 10 * fontScale, color: '#0369a1', lineHeight: 1.4 }}>
                {'Your overall outstanding balance is '}
                <Text style={{ fontWeight: 'bold' }}>{currency} {totalOutstanding.toLocaleString('en-US', { minimumFractionDigits: 2 })}</Text>
                {` as of ${todayStr}`}
              </Text>
            </View>
          );
        })()}

        {/* Footer info (Notes etc) */}
        <View wrap={false} style={{ marginTop: 15, flex: 1 }}>
          {templateSettings.showPaymentTerms ? (
            <InvoiceInfoPanel 
              type="payment_terms" 
              settings={templateSettings} 
              data={dataAny} 
              config={config} 
              fontScale={fontScale} 
            />
          ) : null}
        </View>

        {/* Use the standard Security Footer at bottom */}
        <SecurityFooter
          data={dataAny}
          companyName={companyName}
          legalFooterLine1={legalFooterLine1}
          legalFooterLine2={legalFooterLine2}
          fontScale={fontScale}
        />
      </Page>
    </Document>
  );
};

const ModernInvoiceTemplate = ({
  type,
  data,
  config,
  templateSettings
}: {
  type: string;
  data: Record<string, unknown>;
  config: CompanyConfig | null;
  templateSettings: ReturnType<typeof resolvePrimeTemplateSettings>;
}) => {
  const dataAny = data;
  const fontScale = templateSettings.bodyFontSize / 12;

  // Company Details
  const companyName = config?.companyName || 'Prime Printing & Stationery';
  const companyPhone = config?.phone || 'N/A';
  const companyEmail = config?.email || 'N/A';
  const currency = config?.currencySymbol || currencyService.getCurrency(currencyService.getBaseCurrency())?.symbol || 'K';
  
  const logo = resolvePdfLogoSource(config, templateSettings.showCompanyLogo);
  const accentColor = templateSettings.accentColor || '#739F99';
  const dueDate = dataAny.dueDate ? String(dataAny.dueDate) : undefined;

  let docTitle = 'Invoice';
  if (type === 'QUOTATION') docTitle = 'Quotation Document';
  else if (type === 'ORDER' || type === 'SALES_ORDER') docTitle = 'Sales Order';
  else if (type === 'PO') docTitle = 'Purchase Order';
  else if (type === 'SUBSCRIPTION') docTitle = 'Recurring Invoice';
  else if (type === 'INVOICE') docTitle = 'Invoice Service';
  else {
    const titleCased = type.toLowerCase().split(/[_\s]+/).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
    docTitle = titleCased || 'Document';
  }

  const titleWords = docTitle.split(' ');
  const titleFirst = titleWords[0];
  const titleRest = titleWords.slice(1).join(' ');

  const pod = dataAny.proofOfDelivery as Record<string, unknown> | undefined;

  // Invoice Details
  const invoiceNumber = String(dataAny.invoiceNumber || dataAny.orderNumber || dataAny.number || dataAny.quotationNumber || new Date().getTime());
  const invoiceDate = String(dataAny.date || new Date().toLocaleDateString());
  
  const docTitleForMeta = `${docTitle} ${invoiceNumber}`;
  
  // Recipient Details
  const resolvedRecipientName = String(
    dataAny.clientName || dataAny.customerName || dataAny.customer_name || dataAny.schoolName || dataAny.school_name || dataAny.recipientName || dataAny.recipient_name || dataAny.vendorName || dataAny.vendor_name || dataAny.supplierName || dataAny.supplier_name || pod?.receivedBy || dataAny.receivedBy || ''
  ).trim();
  const resolvedRecipientAddress = String(
    dataAny.address || dataAny.customerAddress || dataAny.customer_address || dataAny.billingAddress || dataAny.billing_address || dataAny.shippingAddress || dataAny.shipping_address || dataAny.schoolAddress || dataAny.school_address || dataAny.vendorAddress || dataAny.vendor_address || dataAny.supplierAddress || dataAny.supplier_address || pod?.address || pod?.deliveryLocation || ''
  ).trim();
  const resolvedRecipientPhone = formatPhone(String(
    dataAny.phone || dataAny.customerPhone || dataAny.customer_phone || dataAny.schoolPhone || dataAny.school_phone || dataAny.vendorPhone || dataAny.vendor_phone || dataAny.supplierPhone || dataAny.supplier_phone || dataAny.recipientPhone || dataAny.recipient_phone || pod?.receiverPhone || pod?.recipientPhone || pod?.phone || ''
  ).trim());

  // Financials
  const items = (dataAny.items || []) as Array<Record<string, unknown>>;
  const subtotal = Number(dataAny.subtotal) || 0;
  const amountPaid = Number(dataAny.amountPaid) || 0;
  const totalAmount = Number(dataAny.totalAmount) || subtotal;
  const tax = Number(dataAny.tax) || 0;
  const discount = Number(dataAny.discount) || 0;
  const discountPercentage = discount > 0 && subtotal > 0 ? Number(((discount / subtotal) * 100).toFixed(2)) : 0;
  const discountLabel = discountPercentage > 0 ? `Discount (${discountPercentage}%)` : 'Discount';
  const discountAmountText = discount > 0 ? `-${currency} ${discount.toLocaleString('en-US', {minimumFractionDigits: 2})}` : '';
  
  const showDueDate = templateSettings.showDueDate;
  const showInvoiceBalances = templateSettings.showOutstandingAndWalletBalances;
  const resolvedOutstandingBalance = Math.max(0, Number(dataAny.totalAmount || 0) - Number(dataAny.amountPaid || 0));
  const outstandingDisplay = showInvoiceBalances && type === 'INVOICE' ? resolvedOutstandingBalance : (totalAmount - amountPaid);
  const paymentTermsLabel = String(dataAny.paymentTerms || '').trim() || getDefaultPaymentTermsLabel(config);

  const qrCodeDataUrl = resolvePdfQrCodeSource(String(dataAny.securityQrCodeDataUrl || ''));

  const renderRow = (item: any, i: number) => {
    const isService = item.category === 'service' || item.type === 'service' || item.isService === true;
    let formattedDesc = item.desc || item.name;
    if (isService) {
      const totalPages = item.totalPages || item.pages || 0;
      const copies = item.copies || item.qty || 1;
      const itemName = item.name || item.desc || 'Service';
      if (totalPages > 0) {
        formattedDesc = `${itemName} (${totalPages} pages × ${copies} copies)`;
      }
    }
    
    const bgColor = i % 2 !== 0 ? '#F5F5F5' : 'transparent';
      
    return (
      <View key={i} style={{ flexDirection: 'row', backgroundColor: bgColor, minHeight: 28, alignItems: 'center', paddingVertical: 6, paddingHorizontal: 4 }}>
        <Text style={{ flex: 2.2, paddingHorizontal: 4, fontSize: 10 * fontScale, color: '#333333' }}>{formattedDesc}</Text>
        <Text style={{ width: 60, paddingHorizontal: 4, fontSize: 10 * fontScale, color: '#333333' }}>{item.qty}</Text>
        <Text style={{ width: 110, paddingHorizontal: 4, fontSize: 10 * fontScale, color: '#333333' }}>
            {currency} {(item.price || (item.qty ? item.total / item.qty : 0)).toLocaleString('en-US', {minimumFractionDigits: 2})}
        </Text>
        <Text style={{ width: 110, paddingHorizontal: 4, fontSize: 10 * fontScale, color: '#333333', textAlign: 'right' }}>
            {currency} {item.total.toLocaleString('en-US', {minimumFractionDigits: 2})}
        </Text>
      </View>
    );
  };

  const isCancelled = isCancelledStatus(rc.paymentStatus || dataAny.status, dataAny);

  return (
    <Document title={docTitleForMeta} author={companyName}>
      <Page size="A4" style={{ paddingVertical: 45, paddingHorizontal: 40, fontFamily: templateSettings.fontFamily, backgroundColor: '#FFFFFF' }}>
        {isCancelled && <CancelledWatermark />}
        
{/* Centered Logo & Company Header */}
        <View style={{ alignItems: 'center', marginBottom: 1.5 }}>
          {!!logo ? (
             <Image src={logo} style={{ width: templateSettings.logoWidth }} />
           ) : (
             <Text style={{ color: '#222222', fontSize: templateSettings.logoWidth * 0.4, fontWeight: 'bold' }}>{companyName.charAt(0)}</Text>
           )}
        </View>

        {/* Invoice Huge Title */}
        <View style={{ alignItems: 'center', marginBottom: 2 }}>
          <Text style={{ fontSize: 48 * fontScale, color: '#111111' }}>
            <Text style={{ fontWeight: 'heavy' }}>{titleFirst}</Text>
            {!!titleRest && <Text style={{ fontStyle: 'italic', fontWeight: 'normal', color: '#333333' }}> {titleRest}</Text>}
          </Text>
        </View>

        {/* Info Row: Number / Date */}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 30, marginBottom: 40 }}>
          <Text style={{ fontSize: 12 * fontScale, color: '#222222' }}>
            <Text style={{ fontWeight: 'bold' }}>{type === 'INVOICE' ? 'Invoice Number:' : 'Reference Number:'}</Text> {invoiceNumber}
          </Text>
          <Text style={{ fontSize: 12 * fontScale, color: '#222222' }}>
            <Text style={{ fontWeight: 'bold' }}>{type === 'INVOICE' ? 'Invoice Date:' : 'Date:'}</Text> {invoiceDate}
          </Text>
        </View>

        {/* Columns: Payment Info vs Bill To */}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 30 }}>
          <View style={{ flex: 1, paddingRight: 20 }}>
            <View style={{ backgroundColor: accentColor, paddingVertical: 6, paddingHorizontal: 12, alignSelf: 'flex-start', marginBottom: 12, minWidth: 150 }}>
              <Text style={{ color: '#ffffff', fontSize: 10 * fontScale, fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: 1 }}>COMPANY INFO</Text>
            </View>
            {companyPhone !== 'N/A' && <Text style={{ fontSize: 11 * fontScale, color: '#333333', marginBottom: 3 }}>{companyPhone}</Text>}
            {companyEmail !== 'N/A' && <Text style={{ fontSize: 11 * fontScale, color: '#333333', marginBottom: 3 }}>{companyEmail}</Text>}
          </View>
          
          <View style={{ flex: 1 }}>
            <View style={{ backgroundColor: accentColor, paddingVertical: 6, paddingHorizontal: 12, alignSelf: 'flex-end', marginBottom: 12, minWidth: 150 }}>
              <Text style={{ color: '#ffffff', fontSize: 10 * fontScale, fontWeight: 'bold', textAlign: 'right', textTransform: 'uppercase', letterSpacing: 1 }}>BILL TO</Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={{ fontSize: 12 * fontScale, fontWeight: 'bold', color: '#111111', marginBottom: 4 }}>{resolvedRecipientName}</Text>
              {!!resolvedRecipientAddress && <Text style={{ fontSize: 10 * fontScale, color: '#333333', textAlign: 'right', lineHeight: 1.4 }}>{resolvedRecipientAddress}</Text>}
              {!!resolvedRecipientPhone && <Text style={{ fontSize: 10 * fontScale, color: '#333333', textAlign: 'right', marginTop: 2 }}>{resolvedRecipientPhone}</Text>}
            </View>
          </View>
        </View>

        {/* Table representation */}
        <View style={{ marginBottom: 15 }}>
          <View style={{ flexDirection: 'row', backgroundColor: accentColor, paddingVertical: 8, paddingHorizontal: 4, alignItems: 'center' }}>
            <Text style={{ flex: 2.2, paddingHorizontal: 4, fontSize: 11 * fontScale, fontWeight: 'bold', color: '#ffffff' }}>Item Description</Text>
            <Text style={{ width: 60, paddingHorizontal: 4, fontSize: 11 * fontScale, fontWeight: 'bold', color: '#ffffff' }}>Qty.</Text>
            <Text style={{ width: 110, paddingHorizontal: 4, fontSize: 11 * fontScale, fontWeight: 'bold', color: '#ffffff' }}>Unit Price</Text>
            <Text style={{ width: 110, paddingHorizontal: 4, fontSize: 11 * fontScale, fontWeight: 'bold', color: '#ffffff', textAlign: 'right' }}>Amount</Text>
          </View>
          {items.map(renderRow)}
          
          {/* Total Payment Gray Row */}
          <View style={{ flexDirection: 'row', backgroundColor: '#D9DEDE', paddingVertical: 8, paddingHorizontal: 4, alignItems: 'center', marginTop: 4 }}>
            <Text style={{ flex: 2.2, paddingHorizontal: 4, fontSize: 11 * fontScale, fontWeight: 'bold', color: '#111111' }}>Total Payment</Text>
            <Text style={{ width: 60, paddingHorizontal: 4, fontSize: 11 * fontScale, color: '#111111' }}>-</Text>
            <Text style={{ width: 100, paddingHorizontal: 4, fontSize: 11 * fontScale, color: '#111111' }}>-</Text>
            <Text style={{ width: 100, paddingHorizontal: 4, fontSize: 11 * fontScale, fontWeight: 'bold', color: '#111111', textAlign: 'right' }}>{currency} {subtotal.toLocaleString('en-US', {minimumFractionDigits: 2})}</Text>
          </View>
        </View>

        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 15 }}>
          {/* Notes Bottom Left */}
          <View style={{ width: 200 }}>
              {!!dataAny.notes && (
                 <View style={{ marginTop: 10 }}>
                    <Text style={{ fontSize: 12 * fontScale, fontWeight: 'bold', color: '#111111', marginBottom: 6 }}>Notes:</Text>
                    <Text style={{ fontSize: 10 * fontScale, color: '#333333', lineHeight: 1.5 }}>{String(dataAny.notes)}</Text>
                    <View style={{ width: '100%', height: 1, backgroundColor: '#111111', marginTop: 15 }} />
                 </View>
              )}
          </View>

          {/* Totals Section */}
          <View style={{ width: 220 }}>
            {tax > 0 && (
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, paddingRight: 4 }}>
                <Text style={{ color: '#333333', fontSize: 11 * fontScale }}>Tax</Text>
                <Text style={{ color: '#333333', fontSize: 11 * fontScale }}>{currency} {tax.toLocaleString('en-US', {minimumFractionDigits: 2})}</Text>
              </View>
            )}
            {discount > 0 && (
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, paddingRight: 4 }}>
                <Text style={{ color: '#333333', fontSize: 11 * fontScale }}>{discountLabel}</Text>
                <Text style={{ color: '#333333', fontSize: 11 * fontScale }}>-{currency} {discount.toLocaleString('en-US', {minimumFractionDigits: 2})}</Text>
              </View>
            )}
            {dataAny.roundingDifference ? (
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, paddingRight: 4 }}>
                <Text style={{ color: '#333333', fontSize: 11 * fontScale }}>Rounding{dataAny.roundingMethod ? ` (${dataAny.roundingMethod})` : ''}</Text>
                <Text style={{ color: '#333333', fontSize: 11 * fontScale }}>{currency} {Number(dataAny.roundingDifference).toLocaleString('en-US', {minimumFractionDigits: 2})}</Text>
              </View>
            ) : null}
            {amountPaid > 0 && (
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, paddingRight: 4 }}>
                <Text style={{ color: '#333333', fontSize: 11 * fontScale }}>Amount Paid</Text>
                <Text style={{ color: '#333333', fontSize: 11 * fontScale }}>-{currency} {amountPaid.toLocaleString('en-US', {minimumFractionDigits: 2})}</Text>
              </View>
            )}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', backgroundColor: '#Dce1e1', paddingVertical: 8, paddingHorizontal: 6, marginTop: 4 }}>
              <Text style={{ color: '#111111', fontWeight: 'bold', fontSize: 12 * fontScale }}>
                Balance Due
              </Text>
              <Text style={{ color: '#111111', fontWeight: 'bold', fontSize: 12 * fontScale }}>
                {currency} {(totalAmount - amountPaid).toLocaleString('en-US', {minimumFractionDigits: 2})}
              </Text>
            </View>
            
          </View>
        </View>

        {/* Outstanding Balance Statement */}
        {type === 'INVOICE' && showInvoiceBalances && Number(dataAny?.totalCustomerOutstanding || 0) > 0 && (() => {
          const totalOutstanding = Number(dataAny.totalCustomerOutstanding || 0);
          const todayStr = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
          return (
            <View style={{ marginTop: 15, padding: 8, backgroundColor: '#f0f9ff', borderRadius: 4, borderLeftWidth: 3, borderLeftColor: '#0ea5e9' }} wrap={false}>
              <Text style={{ fontSize: 10 * fontScale, color: '#0369a1', lineHeight: 1.4 }}>
                {'Your overall outstanding balance is '}
                <Text style={{ fontWeight: 'bold' }}>{currency} {totalOutstanding.toLocaleString('en-US', { minimumFractionDigits: 2 })}</Text>
                {` as of ${todayStr}`}
              </Text>
            </View>
          );
        })()}

        {/* Footer info (QR and Signature) */}
        <View wrap={false} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginTop: 15, flex: 1, gap: 20 }}>
          <View style={{ flexDirection: 'column', flex: 1 }}>
            {templateSettings.showPaymentTerms ? (
              <InvoiceInfoPanel 
                type="payment_terms" 
                settings={templateSettings} 
                data={dataAny} 
                config={config} 
                fontScale={fontScale} 
              />
            ) : null}
            
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', marginTop: 10, gap: 12 }}>
              <View>
                {renderQrImage(qrCodeDataUrl, 56) || <View style={{ width: 56, height: 56, backgroundColor: '#eeeeee' }} />}
              </View>
              <View style={{ justifyContent: 'center', flex: 1 }}>
                <Text style={{ fontWeight: 'bold', fontSize: 11 * fontScale, color: '#111111', marginBottom: 4 }}>More Info:</Text>
                {companyPhone !== 'N/A' && <Text style={{ fontSize: 10 * fontScale, color: '#333333', marginBottom: 2 }}>{companyPhone}</Text>}
                {companyEmail !== 'N/A' && <Text style={{ fontSize: 10 * fontScale, color: '#333333' }}>{companyEmail}</Text>}
              </View>
            </View>
          </View>

          <View style={{ alignItems: 'center', minWidth: 160 }}>
            <Text style={{ fontSize: 11 * fontScale, color: '#222222', marginBottom: 8 }}>{showDueDate && dueDate ? `Due Date: ${formatDateOnly(dueDate)}` : `Date: ${invoiceDate}`}</Text>
            <View style={{ width: '100%', height: 30, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{fontFamily: templateSettings.fontFamily, fontStyle: 'italic', fontSize: 22, color: '#111111'}}>{companyName.split(' ')[0]}</Text>
            </View>
            <View style={{ width: '100%', height: 1.5, backgroundColor: '#444444', marginTop: 8, marginBottom: 4 }} />
            {dataAny.createdAtIso || dataAny.createdAt ? (
              <Text style={{ fontSize: 8 * fontScale, color: '#666666' }}>
                Ref: {String(dataAny.invoiceNumber || dataAny.orderNumber || dataAny.number || 'N/A')}
              </Text>
            ) : null}
          </View>
        </View>

      </Page>
    </Document>
  );
};

const ProfessionalInvoiceTemplate = ({
  type,
  data,
  config,
  templateSettings
}: {
  type: string;
  data: Record<string, unknown>;
  config: CompanyConfig | null;
  templateSettings: ReturnType<typeof resolvePrimeTemplateSettings>;
}) => {
  const dataAny = data;
  const fontScale = templateSettings.bodyFontSize / 12;

  // Company Details
  const companyName = config?.companyName || 'Prime Printing & Stationery';
  const companyAddress = config?.addressLine1 || 'Lilongwe, Malawi';
  const rawPhone = config?.phone || '';
  const formattedPhone = rawPhone.replace(/(\+265\s?\d{3}\s?\d{3}\s?\d{3})(?=\+265)/g, '$1 | ');
  const companyPhone = formattedPhone || 'N/A';
  const companyEmail = config?.email || 'N/A';
  const currency = config?.currencySymbol || currencyService.getCurrency(currencyService.getBaseCurrency())?.symbol || 'K';
  
  const logo = resolvePdfLogoSource(config, templateSettings.showCompanyLogo);
  const accentColor = templateSettings.accentColor || '#E8450A';

  let docTitle = 'INVOICE';
  if (type === 'QUOTATION') docTitle = 'QUOTATION';
  else if (type === 'ORDER' || type === 'SALES_ORDER') docTitle = 'SALES ORDER';
  else if (type === 'PO') docTitle = 'PURCHASE ORDER';
  else if (type === 'SUBSCRIPTION') docTitle = 'RECURRING INVOICE';

  const pod = dataAny.proofOfDelivery as Record<string, unknown> | undefined;

  // Invoice Details
  const invoiceNumber = String(dataAny.invoiceNumber || dataAny.orderNumber || dataAny.number || dataAny.quotationNumber || new Date().getTime());
  const invoiceDate = String(dataAny.date || new Date().toLocaleDateString());
  const dueDate = dataAny.dueDate ? String(dataAny.dueDate) : undefined;
  
  const docTitleForMeta = `${docTitle} ${invoiceNumber}`;
  
  // Recipient Details
  const resolvedRecipientName = String(
    dataAny.clientName || dataAny.customerName || dataAny.customer_name || dataAny.schoolName || dataAny.school_name || dataAny.recipientName || dataAny.recipient_name || dataAny.vendorName || dataAny.vendor_name || dataAny.supplierName || dataAny.supplier_name || pod?.receivedBy || dataAny.receivedBy || ''
  ).trim();
  const resolvedRecipientAddress = String(
    dataAny.address || dataAny.customerAddress || dataAny.customer_address || dataAny.billingAddress || dataAny.billing_address || dataAny.shippingAddress || dataAny.shipping_address || dataAny.schoolAddress || dataAny.school_address || dataAny.vendorAddress || dataAny.vendor_address || dataAny.supplierAddress || dataAny.supplier_address || pod?.address || pod?.deliveryLocation || ''
  ).trim();
  const resolvedRecipientPhone = formatPhone(String(
    dataAny.phone || dataAny.customerPhone || dataAny.customer_phone || dataAny.schoolPhone || dataAny.school_phone || dataAny.vendorPhone || dataAny.vendor_phone || dataAny.supplierPhone || dataAny.supplier_phone || dataAny.recipientPhone || dataAny.recipient_phone || pod?.receiverPhone || pod?.recipientPhone || pod?.phone || ''
  ).trim());

  // Financials
  const items = (dataAny.items || []) as Array<Record<string, unknown>>;
  const subtotal = Number(dataAny.subtotal) || 0;
  const amountPaid = Number(dataAny.amountPaid) || 0;
  const totalAmount = Number(dataAny.totalAmount) || subtotal;
  const tax = Number(dataAny.tax) || 0;
  const discount = Number(dataAny.discount) || 0;
  const discountPercentage = discount > 0 && subtotal > 0 ? Number(((discount / subtotal) * 100).toFixed(2)) : 0;
  const discountLabel = discountPercentage > 0 ? `Discount (${discountPercentage}%)` : 'Discount';
  
  const showDueDate = templateSettings.showDueDate;
  const showInvoiceBalances = templateSettings.showOutstandingAndWalletBalances;
  const resolvedOutstandingBalance = Math.max(0, Number(dataAny.totalAmount || 0) - Number(dataAny.amountPaid || 0));
  const outstandingDisplay = showInvoiceBalances && type === 'INVOICE' ? resolvedOutstandingBalance : (totalAmount - amountPaid);
  
  const renderRow = (item: any, i: number) => {
    const isService = item.category === 'service' || item.type === 'service' || item.isService === true;
    let formattedDesc = item.desc || item.name;
    if (isService) {
      const totalPages = item.totalPages || item.pages || 0;
      const copies = item.copies || item.qty || 1;
      const itemName = item.name || item.desc || 'Service';
      if (totalPages > 0) {
        formattedDesc = `${itemName} (${totalPages} pages × ${copies} copies)`;
      }
    }
      
    return (
      <View key={i} style={{ flexDirection: 'row', borderBottomWidth: 0.5, borderBottomColor: '#eeeeee', minHeight: 24, alignItems: 'center', paddingVertical: 5 }}>
        <Text style={{ flex: 2.2, paddingHorizontal: 4, fontSize: 10 * fontScale, color: '#333333' }}>{formattedDesc}</Text>
        <Text style={{ width: 50, paddingHorizontal: 4, fontSize: 10 * fontScale, color: '#333333', textAlign: 'right' }}>{item.qty}</Text>
        <Text style={{ width: 80, paddingHorizontal: 4, fontSize: 10 * fontScale, color: '#333333', textAlign: 'right' }}>{currency} {(item.price || (item.qty ? item.total / item.qty : 0)).toLocaleString('en-US', {minimumFractionDigits: 2})}</Text>
        <Text style={{ width: 80, paddingHorizontal: 4, fontSize: 10 * fontScale, color: '#333333', textAlign: 'right' }}>{currency} {item.total.toLocaleString('en-US', {minimumFractionDigits: 2})}</Text>
      </View>
    );
  };

  const isCancelled = isCancelledStatus(st.status || dataAny.status, dataAny);

  return (
    <Document title={docTitleForMeta} author={companyName}>
      <Page size="A4" style={{ padding: 40, fontFamily: templateSettings.fontFamily, backgroundColor: '#ffffff' }}>
        {isCancelled && <CancelledWatermark />}
        {/* Top Row */}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 30 }}>
          <View style={{ alignItems: 'center', justifyContent: 'center' }}>
            {!!logo ? (
              <Image src={logo} style={{ width: templateSettings.logoWidth }} />
            ) : (
              <Text style={{ color: '#222222', fontSize: templateSettings.logoWidth * 0.4, fontWeight: 'bold' }}>{companyName.charAt(0)}</Text>
            )}
          </View>
          <View style={{ textAlign: 'right', alignItems: 'flex-end' }}>
            <Text style={{ fontSize: 13 * fontScale, fontWeight: 'bold', color: '#111111', marginBottom: 2 }}>{companyName}</Text>
            <Text style={{ fontSize: 10 * fontScale, color: '#444444', lineHeight: 1.4 }}>{companyAddress}</Text>
            <Text style={{ fontSize: 10 * fontScale, color: '#444444', lineHeight: 1.4 }}>{companyPhone}</Text>
            {companyEmail !== 'N/A' && <Text style={{ fontSize: 10 * fontScale, color: '#444444', lineHeight: 1.4 }}>{companyEmail}</Text>}
          </View>
        </View>

        {/* Main Row / Client Info */}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 25 }}>
          <View>
            <Text style={{ fontSize: 9 * fontScale, color: '#999999', letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 4 }}>Client</Text>
            <Text style={{ fontSize: 14 * fontScale, fontWeight: 'bold', color: '#111111', marginBottom: 2 }}>{resolvedRecipientName}</Text>
            {!!resolvedRecipientAddress && <Text style={{ fontSize: 10 * fontScale, color: '#444444', lineHeight: 1.4 }}>{resolvedRecipientAddress}</Text>}
          </View>
          <View>
            <Text style={{ fontSize: 32 * fontScale, fontWeight: 'bold', color: '#cccccc', letterSpacing: 2 }}>{docTitle}</Text>
          </View>
        </View>

        {/* Due Row */}
        <View style={{ flexDirection: 'row', alignItems: 'stretch', marginBottom: 25 }}>
          <View style={{ backgroundColor: accentColor, paddingVertical: 12, paddingHorizontal: 16, flex: 1, justifyContent: 'center' }}>
            {type !== 'QUOTATION' && type !== 'SUBSCRIPTION' ? (
              <Text style={{ fontSize: 16 * fontScale, fontWeight: 'bold', color: '#ffffff', letterSpacing: 1 }}>
                {type === 'INVOICE' && showInvoiceBalances ? 'OUTSTANDING' : 'DUE'} — {currency} {outstandingDisplay.toLocaleString('en-US', {minimumFractionDigits: 2})}
              </Text>
            ) : (
              <Text style={{ fontSize: 16 * fontScale, fontWeight: 'bold', color: '#ffffff', letterSpacing: 1 }}>
                TOTAL — {currency} {totalAmount.toLocaleString('en-US', {minimumFractionDigits: 2})}
              </Text>
            )}
          </View>
          <View style={{ backgroundColor: '#ffffff', borderWidth: 1, borderColor: accentColor, paddingVertical: 10, paddingHorizontal: 14, minWidth: 160, justifyContent: 'center' }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
              <Text style={{ color: '#999999', fontSize: 10 * fontScale }}>Date</Text>
              <Text style={{ fontSize: 10 * fontScale, color: '#444444' }}>{invoiceDate}</Text>
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text style={{ color: '#999999', fontSize: 10 * fontScale }}>Ref #</Text>
              <Text style={{ fontSize: 10 * fontScale, color: '#444444' }}>{invoiceNumber}</Text>
            </View>
            {Boolean(showDueDate) && !!dueDate && (
               <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 }}>
                 <Text style={{ color: '#999999', fontSize: 10 * fontScale }}>Due</Text>
                 <Text style={{ fontSize: 10 * fontScale, color: '#444444' }}>{formatDateOnly(dueDate)}</Text>
               </View>
            )}
          </View>
        </View>

        {/* Table representation */}
        <View style={{ marginBottom: 15 }}>
          <View style={{ flexDirection: 'row', borderBottomWidth: 1.5, borderBottomColor: '#222222', paddingBottom: 6 }}>
            <Text style={{ flex: 2.2, paddingHorizontal: 4, fontSize: 9 * fontScale, fontWeight: 'bold', color: '#666666', letterSpacing: 1, textTransform: 'uppercase' }}>Item Description</Text>
            <Text style={{ width: 50, paddingHorizontal: 4, fontSize: 9 * fontScale, fontWeight: 'bold', color: '#666666', letterSpacing: 1, textTransform: 'uppercase', textAlign: 'right' }}>Qty</Text>
            <Text style={{ width: 80, paddingHorizontal: 4, fontSize: 9 * fontScale, fontWeight: 'bold', color: '#666666', letterSpacing: 1, textTransform: 'uppercase', textAlign: 'right' }}>Unit</Text>
            <Text style={{ width: 80, paddingHorizontal: 4, fontSize: 9 * fontScale, fontWeight: 'bold', color: '#666666', letterSpacing: 1, textTransform: 'uppercase', textAlign: 'right' }}>Price</Text>
          </View>
          {items.map(renderRow)}
        </View>

        {/* Totals Section */}
        <View style={{ alignSelf: 'flex-end', width: 220, marginBottom: 25 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3 }}>
            <Text style={{ color: '#999999', fontSize: 10 * fontScale }}>Sub Total —</Text>
            <Text style={{ color: '#555555', fontSize: 10 * fontScale }}>{currency} {subtotal.toLocaleString('en-US', {minimumFractionDigits: 2})}</Text>
          </View>
          {tax > 0 && (
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3 }}>
              <Text style={{ color: '#999999', fontSize: 10 * fontScale }}>Tax —</Text>
              <Text style={{ color: '#555555', fontSize: 10 * fontScale }}>{currency} {tax.toLocaleString('en-US', {minimumFractionDigits: 2})}</Text>
            </View>
          )}
          {discount > 0 && (
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3 }}>
              <Text style={{ color: '#999999', fontSize: 10 * fontScale }}>{discountLabel} —</Text>
              <Text style={{ color: '#555555', fontSize: 10 * fontScale }}>-{currency} {discount.toLocaleString('en-US', {minimumFractionDigits: 2})}</Text>
            </View>
          )}
          {dataAny.roundingDifference ? (
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3 }}>
              <Text style={{ color: '#999999', fontSize: 10 * fontScale }}>Rounding{dataAny.roundingMethod ? ` (${dataAny.roundingMethod})` : ''} —</Text>
              <Text style={{ color: '#555555', fontSize: 10 * fontScale }}>{currency} {Number(dataAny.roundingDifference).toLocaleString('en-US', {minimumFractionDigits: 2})}</Text>
            </View>
          ) : null}
          {amountPaid > 0 && (
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3 }}>
              <Text style={{ color: '#999999', fontSize: 10 * fontScale }}>Amount Paid —</Text>
              <Text style={{ color: '#555555', fontSize: 10 * fontScale }}>-{currency} {amountPaid.toLocaleString('en-US', {minimumFractionDigits: 2})}</Text>
            </View>
          )}
          {(type === 'INVOICE' || type === 'ORDER' || (type as string) === 'SALES_ORDER') ? (
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 3, paddingTop: 6, borderTopWidth: 0.5, borderTopColor: '#dddddd' }}>
              <Text style={{ color: accentColor, fontWeight: 'bold', fontSize: 12 * fontScale }}>Due Balance —</Text>
              <Text style={{ color: accentColor, fontWeight: 'bold', fontSize: 12 * fontScale }}>{currency} {(totalAmount - amountPaid).toLocaleString('en-US', {minimumFractionDigits: 2})}</Text>
            </View>
          ) : (
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 3, paddingTop: 6, borderTopWidth: 0.5, borderTopColor: '#dddddd' }}>
              <Text style={{ color: accentColor, fontWeight: 'bold', fontSize: 12 * fontScale }}>Total Grand —</Text>
              <Text style={{ color: accentColor, fontWeight: 'bold', fontSize: 12 * fontScale }}>{currency} {totalAmount.toLocaleString('en-US', {minimumFractionDigits: 2})}</Text>
            </View>
          )}
        </View>

        {/* Bottom Row */}
        <View wrap={false} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginTop: 10, paddingTop: 15, borderTopWidth: 0.5, borderTopColor: '#eeeeee', flex: 1, gap: 20 }}>
          <View style={{ flex: 1 }}>
            {!!dataAny.notes && (
              <View wrap={false} style={{ marginBottom: 15 }}>
                <Text style={{ fontSize: 9 * fontScale, fontWeight: 'bold', color: '#999999', textTransform: 'uppercase', marginBottom: 4, letterSpacing: 1 }}>Notes</Text>
                <Text style={{ fontSize: 10 * fontScale, color: '#444444', lineHeight: 1.4 }}>{String(dataAny.notes)}</Text>
              </View>
            )}

            <View style={{ marginTop: 10 }}>
              <Text style={{ fontStyle: 'italic', fontSize: 15 * fontScale, color: '#555555', marginBottom: 4, fontFamily: templateSettings.fontFamily }}>{companyName}</Text>
              <Text style={{ fontWeight: 'bold', fontSize: 10 * fontScale, color: '#111111' }}>{companyName}</Text>
              <Text style={{ fontSize: 9 * fontScale, color: accentColor, letterSpacing: 1, textTransform: 'uppercase', marginTop: 2 }}>Authorized Signatory</Text>
            </View>
          </View>

           <View style={{ flex: 1, alignItems: 'flex-end', textAlign: 'right' }}>
              {templateSettings.showPaymentTerms && config?.transactionSettings?.defaultPaymentTermsDays !== undefined && (
                <View wrap={false} style={{ marginBottom: 10 }}>
                  <Text style={{ fontSize: 9 * fontScale, fontWeight: 'bold', color: '#999999', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 3 }}>Payment Method / Terms</Text>
                  <Text style={{ fontSize: 9 * fontScale, color: '#666666', lineHeight: 1.6 }}>{getDefaultPaymentTermsLabel(config)}</Text>
                </View>
              )}
              
              <View style={{ alignItems: 'flex-start', width: '100%' }}>
               <Text style={{ fontSize: 8 * fontScale, color: '#aaaaaa', lineHeight: 1.4, textAlign: 'left', marginTop: 4 }}>
                   This is a computer-generated document. No signature required, For enquiries contact:
                 </Text>
                 <Text style={{ fontSize: 8 * fontScale, color: '#aaaaaa', lineHeight: 1.4, textAlign: 'left', marginTop: 1 }}>
                   {`${companyName}, ${companyAddress}, Phone ${companyPhone}`}
                </Text>
             </View>
          </View>
        </View>
      </Page>
    </Document>
  );
};

export const PrimeDocument = ({ type, data, configOverride = null, customers = [] }: DocProps & { customers?: any[] }) => {
  const isFinancial = type === 'INVOICE' || type === 'PO' || type === 'QUOTATION' || type === 'ORDER' || (type as string) === 'SALES_ORDER' || type === 'SUBSCRIPTION';
  const dataAny = data as Record<string, unknown>;
  const pod = dataAny.proofOfDelivery as Record<string, unknown> | undefined;
  const config = configOverride || getStoredCompanyConfig();
  const templateSettings = resolvePrimeTemplateSettings(config);

  if (isFinancial && templateSettings.engine === 'Clean') {
    return <CleanInvoiceTemplate type={type} data={dataAny} config={config} templateSettings={templateSettings} />;
  }

  if (isFinancial && templateSettings.engine === 'Professional') {
    return <ProfessionalInvoiceTemplate type={type} data={dataAny} config={config} templateSettings={templateSettings} />;
  }

  if (isFinancial && templateSettings.engine === 'Modern') {
    return <ModernInvoiceTemplate type={type} data={dataAny} config={config} templateSettings={templateSettings} />;
  }

  const fontScale = templateSettings.bodyFontSize / 12;
  const showDueDate = templateSettings.showDueDate;
  const showPaymentTerms = templateSettings.showPaymentTerms;
  const paymentTermsLabel = String(dataAny?.paymentTerms || '').trim() || getDefaultPaymentTermsLabel(config);
  const companyName = config?.companyName || 'Prime Printing & Stationery';
  const companyAddress = config?.addressLine1 || 'Lilongwe, Malawi';

  // Format phone numbers if they are concatenated without separators
  const rawPhone = config?.phone || '';
  const formattedPhone = rawPhone.replace(/(\+265\s?\d{3}\s?\d{3}\s?\d{3})(?=\+265)/g, '$1 | ');
  const companyPhone = formattedPhone || 'N/A';
  const companyEmail = config?.email || 'N/A';

  const companyContact = `${formattedPhone} | ${config?.email || ''}`;
  const companyEnquiryLine = [companyName, companyAddress].filter(Boolean).join(', ');
  const companyFlatContact2 = `${companyEnquiryLine}, Phone ${companyPhone}`;
  const legalFooterLine1 = showPaymentTerms
    ? `This is a computer-generated document. No signature required. Payment terms: ${paymentTermsLabel}.`
    : 'This is a computer-generated document. No signature required, For enquiries contact:';
  const legalFooterLine2 = `${companyFlatContact2}`;
  const currency = config?.currencySymbol || currencyService.getCurrency(currencyService.getBaseCurrency())?.symbol || 'K';
  const logo = resolvePdfLogoSource(config, templateSettings.showCompanyLogo);
  const showInvoiceBalances = templateSettings.showOutstandingAndWalletBalances;
  const resolvedWalletBalance = Number(dataAny?.walletBalance || 0);
  const resolvedOutstandingBalance = Math.max(
    0,
    Number(dataAny?.totalAmount || 0) - Number(dataAny?.amountPaid || 0)
  );
  const pageStyle = {
    fontFamily: templateSettings.fontFamily,
    fontSize: templateSettings.bodyFontSize,
  };
  const brandTextStyle = {
    fontFamily: templateSettings.fontFamily,
    fontSize: templateSettings.companyNameFontSize,
    fontWeight: 'bold',
  };
  const titleStyle = {
    fontSize: 27.75 * fontScale,
  };
  const scaledFont = (size: number) => Number((size * fontScale).toFixed(2));
  const renderBrandMark = (alignment: 'left' | 'right' = 'right') => (
    !!logo
      ? (
        <Image
          src={logo}
          style={{
            width: templateSettings.logoWidth,
            marginBottom: alignment === 'right' ? 0 : 10,
          }}
        />
      )
      : (
        <Text
          style={[
            brandTextStyle,
            alignment === 'left' ? { marginBottom: 5 } : null,
          ]}
        >
          {companyName}
        </Text>
      )
  );

  const isRightAligned = ['INVOICE', 'QUOTATION', 'ORDER', 'SALES_ORDER', 'PO', 'DELIVERY_NOTE', 'EXAMINATION_INVOICE', 'SALES_EXCHANGE', 'SUBSCRIPTION'].includes(type);
  const recipientSectionEnabledTypes = ['INVOICE', 'PO', 'WORK_ORDER', 'DELIVERY_NOTE', 'QUOTATION', 'EXAMINATION_INVOICE', 'ORDER', 'SALES_ORDER', 'SUBSCRIPTION'];
  const resolvedRecipientName = String(
    dataAny.clientName
    || dataAny.customerName
    || dataAny.customer_name
    || dataAny.schoolName
    || dataAny.school_name
    || dataAny.recipientName
    || dataAny.recipient_name
    || dataAny.vendorName
    || dataAny.vendor_name
    || dataAny.supplierName
    || dataAny.supplier_name
    || pod?.receivedBy
    || dataAny.receivedBy
    || ''
  ).trim();
  const resolvedRecipientAddress = String(
    dataAny.address
    || dataAny.customerAddress
    || dataAny.customer_address
    || dataAny.billingAddress
    || dataAny.billing_address
    || dataAny.shippingAddress
    || dataAny.shipping_address
    || dataAny.schoolAddress
    || dataAny.school_address
    || dataAny.vendorAddress
    || dataAny.vendor_address
    || dataAny.supplierAddress
    || dataAny.supplier_address
    || pod?.address
    || pod?.deliveryLocation
    || ''
  ).trim();
  const resolvedRecipientPhone = formatPhone(String(
    dataAny.phone
    || dataAny.customerPhone
    || dataAny.customer_phone
    || dataAny.schoolPhone
    || dataAny.school_phone
    || dataAny.vendorPhone
    || dataAny.vendor_phone
    || dataAny.supplierPhone
    || dataAny.supplier_phone
    || dataAny.recipientPhone
    || dataAny.recipient_phone
    || pod?.receiverPhone
    || pod?.recipientPhone
    || pod?.phone
    || ''
  ).trim());
  const shouldRenderRecipientSection = Boolean(
    recipientSectionEnabledTypes.includes(type) || resolvedRecipientName || resolvedRecipientAddress || resolvedRecipientPhone
  );
  const recipientLabel = type === 'PO'
    ? 'To Vendor'
    : type === 'EXAMINATION_INVOICE'
      ? 'Customer'
      : 'Bill To:';
  const resolveConversionSourceNumber = (doc: any) => {
    if (!doc?.conversionDetails) return 'N/A';
    if (doc.conversionDetails.sourceNumber === 'N/A' && 'invoiceNumber' in doc) return doc.invoiceNumber;
    if (doc.conversionDetails.sourceNumber === 'N/A' && 'orderNumber' in doc) return doc.orderNumber;
    return doc.conversionDetails.sourceNumber || 'N/A';
  };

  if (type === 'SALES_EXCHANGE') {
    const d = data as Record<string, unknown>;
    const items = (d.items || []) as Array<Record<string, unknown>>;
    const cd = d.conversionDetails as Record<string, unknown> | undefined;

    const isCancelled = isCancelledStatus(d.status, d);

    return (
      <Document title={`Sales Exchange - ${String(d.exchangeNumber)}`} author={companyName}>
        <Page size="A4" style={[s.page, pageStyle]}>
          {isCancelled && <CancelledWatermark />}
          {Boolean(d.isConverted) && !!cd && (
            <View style={[s.conversionBox, { position: 'absolute', top: 40, right: 40, zIndex: 10 }]}>
              <Text style={s.conversionTitle}>Conversion History</Text>
              <Text>Converted from {String(cd.sourceType)} {String(cd.sourceNumber)}</Text>
              <Text>on {String(cd.date)}</Text>
            </View>
          )}

          <View style={s.headerSection}>
            <View style={s.headerLeft}>
              <Text style={[s.title, titleStyle]}>Exchange Note</Text>
              <View style={s.infoText}>
                <Text>Exchange # : {String(d.exchangeNumber)}</Text>
                <Text>Date : {String(d.date)}</Text>
                <Text>Ref Invoice : {String(d.invoiceNumber)}</Text>
              </View>
            </View>
            <View style={s.headerRight}>
              {renderBrandMark('right')}
            </View>
          </View>

          <View style={[s.billingSection, { marginTop: 20 }]}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontWeight: 'bold', marginBottom: 5, fontSize: 10, textTransform: 'uppercase', color: '#64748b' }}>Customer</Text>
              <Text style={{ fontSize: 12, fontWeight: 'bold' }}>{String(d.customerName)}</Text>
              <Text style={{ fontSize: 10, color: '#475569', marginTop: 4 }}>{resolvedRecipientAddress || 'N/A'}</Text>
              <Text style={{ fontSize: 10, color: '#475569', marginTop: 2 }}>{resolvedRecipientPhone || 'N/A'}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontWeight: 'bold', marginBottom: 5, fontSize: 10, textTransform: 'uppercase', color: '#64748b' }}>Reason for Exchange</Text>
              <Text style={{ fontSize: 11 }}>{String(d.reason)}</Text>
            </View>
          </View>

          <View style={{ marginTop: 20 }}>
            <View style={s.tableHeader}>
              <Text style={s.colDesc}>Item Description</Text>
              <Text style={[s.colQty, { width: 60 }]}>Returned</Text>
              <Text style={[s.colQty, { width: 60 }]}>Replaced</Text>
            </View>
            {items.map((item: Record<string, unknown>, i: number) => (
              <View key={i} style={s.row}>
                <Text style={[s.colDesc, { fontSize: 10 }]}>{String(item.desc || 'N/A')}</Text>
                <Text style={[s.colQty, { width: 60, fontSize: 10 }]}>{Number(item.qtyReturned)}</Text>
                <Text style={[s.colQty, { width: 60, fontSize: 10 }]}>{Number(item.qtyReplaced)}</Text>
                <Text style={[s.colTotal, { fontSize: 10, fontWeight: 'bold' }]}>
                  {currency} {formatAmount(Number(item.priceDiff))}
                </Text>
              </View>
            ))}
          </View>

          {!!d.remarks && (
            <View style={{ marginTop: 20, padding: 12, backgroundColor: '#f8fafc', borderRadius: 6, borderLeftWidth: 3, borderLeftColor: '#3b82f6' }}>
              <Text style={{ fontSize: 10, fontWeight: 'bold', marginBottom: 5, textTransform: 'uppercase', color: '#475569' }}>Remarks / Special Instructions:</Text>
              <Text style={{ fontSize: 10, color: '#1e293b', lineHeight: 1.5 }}>{String(d.remarks)}</Text>
            </View>
          )}

          <View style={{ marginTop: 60 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <View style={{ width: 180, alignItems: 'center' }}>
                <View style={{ width: '100%', borderTopWidth: 1, borderColor: '#000', marginBottom: 5 }} />
                <Text style={{ fontSize: 10 }}>Customer Signature</Text>
                <Text style={{ fontSize: 8, color: '#666' }}>I accept the replacement items</Text>
              </View>
              <View style={{ width: 180, alignItems: 'center' }}>
                <View style={{ width: '100%', borderTopWidth: 1, borderColor: '#000', marginBottom: 5 }} />
                <Text style={{ fontSize: 10 }}>Authorized Officer</Text>
                <Text style={{ fontSize: 8, color: '#666' }}>Exchange approved & processed</Text>
              </View>
            </View>
          </View>

          <SecurityFooter
            data={d}
            companyName={companyName}
            legalFooterLine1="This is a computer-generated Sales Exchange Note. No signature is required if authorized digitally."
            legalFooterLine2={`All exchanges are subject to ${companyName} Return & Exchange Policy.`}
            fontScale={fontScale}
          />
        </Page>
      </Document>
    );
  }

  if (type === 'RECEIPT') {
    const rc = data as ReceiptDoc;
    const isPartial = rc.paymentStatus === 'PARTIALLY PAID' || (rc.balanceDue && rc.balanceDue > 0);
    const isOverpaid = rc.paymentStatus === 'OVERPAID';
    const overpaymentAmount = rc.overpaymentAmount || rc.walletDeposit || 0;

    const isCancelled = isCancelledStatus(rc.paymentStatus || rc.status, rc);

    return (
      <Document title={`Payment Receipt - ${rc.receiptNumber}`} author={companyName}>
        <Page size="A4" style={[s.page, pageStyle]}>
          {isCancelled && <CancelledWatermark />}

          <View style={s.headerSection}>
            <View style={s.headerLeft}>
              <Text style={[s.title, titleStyle]}>Payment Receipt</Text>
              <View style={s.infoText}>
                <Text>Receipt # : {rc.receiptNumber}</Text>
                <Text>Date : {rc.date}</Text>
                <Text>Method : {rc.paymentMethod}</Text>
              </View>
            </View>
            <View style={s.headerRight}>
              {renderBrandMark('right')}
            </View>
          </View>

          {isOverpaid && (
            <View style={{ backgroundColor: '#fef2f2', padding: 10, borderRadius: 4, marginBottom: 15, borderLeftWidth: 4, borderLeftColor: '#ef4444' }}>
              <Text style={{ color: '#991b1b', fontSize: 12, fontWeight: 'bold', lineHeight: 1.4 }}>OVERPAYMENT NOTICE</Text>
              <Text style={{ color: '#b91c1c', fontSize: 12, lineHeight: 1.4 }}>
                This payment exceeds the invoice total. The excess has been credited to your wallet.
              </Text>
            </View>
          )}

          <View style={[s.billingSection, { marginTop: 0, marginBottom: 20, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }]}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontWeight: 'bold', marginBottom: 5, fontSize: 10, textTransform: 'uppercase', color: '#64748b' }}>Received From</Text>
              <View style={s.recipientInfoText}>
                <Text style={s.recipientName}>{rc.customerName || 'N/A'}</Text>
                {resolvedRecipientAddress ? (
                  <Text style={s.recipientDetail}>{resolvedRecipientAddress}</Text>
                ) : null}
                {resolvedRecipientPhone ? (
                  <Text style={s.recipientPhone}>{resolvedRecipientPhone}</Text>
                ) : null}
              </View>
            </View>
            <View style={[s.statusBox, { borderLeftColor: '#10b981' }]}>
              <Text style={{ fontSize: 16, fontWeight: 'bold', color: '#059669' }}>
                PAID
              </Text>
            </View>
          </View>

          <View style={{ marginTop: 5, padding: 15, backgroundColor: '#f8fafc', borderRadius: 8 }}>
            <Text style={{ fontSize: 12, lineHeight: 1.6, color: '#334155' }}>
              {rc.narrative || `This receipt acknowledges payment of ${currency} ${formatAmount(rc.amountReceived)} received from ${rc.customerName}.`}
            </Text>
          </View>

          <View style={{ marginTop: 30 }}>
            <View style={s.tableHeader}>
              <Text style={{ flex: 3 }}>Description</Text>
              <Text style={{ flex: 1, textAlign: 'right' }}>Amount Paid</Text>
            </View>
            <View style={s.row}>
              <Text style={{ flex: 3 }}>
                {(rc.appliedOrders || []).length > 0
                  ? `Payment for Orders: ${(rc.appliedOrders || []).join(', ')}`
                  : `Payment for Invoices: ${(rc.appliedInvoices || []).join(', ')}`}
              </Text>
              <Text style={{ flex: 1, textAlign: 'right' }}>{currency} {formatAmount(rc.amountReceived)}</Text>
            </View>
          </View>


          <View style={[s.summaryContainer, { justifyContent: 'flex-end' }]}>
            <View style={{ width: 260 }}>
              <View style={[s.totalRow]}>
                <Text style={{ flex: 1, fontWeight: 'bold' }}>Amount Received</Text>
                <Text style={{ fontWeight: 'bold', textAlign: 'right' }}>{currency} {formatAmount(rc.amountReceived)}</Text>
              </View>

              {isPartial && (
                <View style={[s.totalRow]}>
                  <Text style={{ flex: 1, color: '#ef4444' }}>Outstanding Balance</Text>
                  <Text style={{ color: '#ef4444', textAlign: 'right' }}>{currency} {formatAmount(rc.balanceDue)}</Text>
                </View>
              )}

              {isOverpaid && overpaymentAmount > 0 && (
                <View style={[s.totalRow]}>
                  <Text style={{ flex: 1, color: '#10b981', fontWeight: 'bold' }}>Wallet Credit</Text>
                  <Text style={{ color: '#10b981', fontWeight: 'bold', textAlign: 'right' }}>{currency} {formatAmount(overpaymentAmount)}</Text>
                </View>
              )}
            </View>
          </View>

            <View style={s.footerContainer} wrap={false}>
              <Text style={[s.thankYouText, { fontSize: scaledFont(12) }]}>Thank you for choosing <Text style={{ fontWeight: 'bold', fontSize: scaledFont(14) }}>{companyName}</Text></Text>
              <View style={s.footerLine} />
              <Text style={[s.footerDetail, { fontSize: scaledFont(12) }]}>{companyAddress}</Text>
              <Text style={[s.footerDetail, { fontSize: scaledFont(12) }]}>{companyContact}</Text>
            </View>

          <SecurityFooter
            data={rc}
            companyName={companyName}
            legalFooterLine1="This is a computer-generated payment receipt. No signature required if digitally authorized."
            legalFooterLine2={`${companyName}, ${companyAddress}, Phone ${companyPhone}`}
            fontScale={fontScale}
          />
        </Page>
      </Document>
    );
  }

  if (type === 'SUPPLIER_PAYMENT') {
    const sp = data as SupplierPaymentDoc;
    const isCancelled = isCancelledStatus(sp.status, sp);
    return (
      <Document title={`Payment Voucher - ${sp.paymentId}`} author={companyName}>
        <Page size="A4" style={[s.page, pageStyle]}>
          {isCancelled && <CancelledWatermark />}
          <View style={s.headerSection}>
            <View style={s.headerLeft}>
              {renderBrandMark('left')}
            </View>
            <View style={s.headerLeft}>
              <Text style={[s.title, titleStyle]}>Payment Voucher</Text>
              <View style={s.infoText}>
                <Text>Voucher # : {sp.paymentId}</Text>
                <Text>Date : {sp.date}</Text>
                <Text>Method : {sp.paymentMethod}</Text>
              </View>
            </View>
          </View>

          <View style={[s.billingSection, { marginTop: 0, marginBottom: 0 }]}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontWeight: 'bold', marginBottom: 5, fontSize: 10, textTransform: 'uppercase', color: '#64748b' }}>Paid To</Text>
              <Text style={{ fontSize: 12, fontWeight: 'bold' }}>{sp.supplierName}</Text>
            </View>
          </View>

          <View style={{ marginTop: 5, padding: 15, backgroundColor: '#f8fafc', borderRadius: 8 }}>
            <Text style={{ fontSize: 12, lineHeight: 1.6, color: '#334155' }}>
              {sp.narrative || `This voucher confirms payment of ${currency} ${formatAmount(sp.amountPaid)} to ${sp.supplierName}.`}
            </Text>
          </View>

          <View style={{ marginTop: 30 }}>
            <View style={s.tableHeader}>
              <Text style={{ flex: 3 }}>Description</Text>
              <Text style={{ flex: 1, textAlign: 'right' }}>Amount Paid</Text>
            </View>
            <View style={s.row}>
              <Text style={{ flex: 3 }}>Payment against Invoices: {(sp.appliedInvoices || []).join(', ')}</Text>
              <Text style={{ flex: 1, textAlign: 'right' }}>{currency} {formatAmount(sp.amountPaid)}</Text>
            </View>
          </View>

          <View style={s.summaryContainer}>
            <View style={s.summaryBox}>
              <View style={s.totalRow}>
                <Text>Total Paid</Text>
                <Text style={{ fontWeight: 'bold' }}>{currency} {formatAmount(sp.amountPaid)}</Text>
              </View>
            </View>
          </View>

            <View style={s.footerContainer} wrap={false}>
              <Text style={[s.thankYouText, { fontSize: scaledFont(12) }]}>Authorized by <Text style={{ fontWeight: 'bold', fontSize: scaledFont(14) }}>{companyName}</Text></Text>
              <View style={s.footerLine} />
              <Text style={[s.companyName, { fontSize: scaledFont(12) }]}>{companyName}</Text>
              <Text style={[s.footerDetail, { fontSize: scaledFont(12) }]}>{companyAddress}</Text>
              <Text style={[s.footerDetail, { fontSize: scaledFont(12) }]}>{companyContact}</Text>
            </View>

          <View style={s.signatureBlock}>
            <View>
              <View style={s.sigLine} />
              <Text>Authorized Signatory</Text>
            </View>
            <View>
              <View style={s.sigLine} />
              <Text>Received By</Text>
            </View>
          </View>

          <SecurityFooter
            data={sp}
            companyName={companyName}
            legalFooterLine1="This is a computer-generated payment voucher."
            legalFooterLine2={`Issued securely by ${companyName}.`}
            fontScale={fontScale}
          />
        </Page>
      </Document>
    );
  }
if (type === 'POS_RECEIPT') {
  const r = data as PosReceiptDoc;
  const isCancelled = isCancelledStatus(r.status, r);

  const scale = 1;
  const baseFontSize = 7.6 * scale;
  const largeFontSize = 10 * scale;
  const smallFontSize = 6.4 * scale;
  const mediumFontSize = 8.4 * scale;

  return (
    <Document title={`Receipt - ${r.receiptNumber}`} author={companyName}>
      <Page size="A4" style={[s.page, pageStyle, { padding: 0, backgroundColor: '#f9fafb', fontFamily: templateSettings.fontFamily }]}>
        {isCancelled && <CancelledWatermark />}
        <View style={[s.posA4Wrapper, { width: 250 * scale, paddingVertical: 24 * scale, paddingHorizontal: 8 * scale }]}>
            <View style={{ alignItems: 'center', marginBottom: 12 * scale }}>
              <Text style={{ fontWeight: 'bold', fontSize: 14 * scale, textAlign: 'center', marginBottom: 3 * scale }}>{companyName}</Text>
              <Text style={{ fontSize: baseFontSize, textAlign: 'center', marginBottom: 2 * scale }}>{companyAddress}</Text>
              <Text style={{ fontSize: baseFontSize, textAlign: 'center' }}>{companyContact}</Text>
            </View>

            <View style={{ marginBottom: 12 * scale, borderBottomWidth: 1, borderBottomColor: '#000', borderBottomStyle: 'dashed', paddingBottom: 8 * scale }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 2 * scale }}>
                <Text style={{ fontSize: baseFontSize, color: '#666' }}>Date:</Text>
                <Text style={{ fontSize: baseFontSize }}>{r.date}</Text>
              </View>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 2 * scale }}>
                <Text style={{ fontSize: baseFontSize, color: '#666' }}>Receipt #:</Text>
                <Text style={{ fontWeight: 'bold', fontSize: baseFontSize }}>{r.receiptNumber}</Text>
              </View>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 2 * scale }}>
                <Text style={{ fontSize: baseFontSize, color: '#666' }}>Cashier:</Text>
                <Text style={{ fontSize: baseFontSize }}>{(() => {
                  const cashier = String(r.cashierName || '').trim();
                  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(cashier);
                  return cashier && !isUuid ? cashier : 'System User';
                })()}</Text>
              </View>
              {!!r.customerName && (
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Text style={{ fontSize: baseFontSize, color: '#666' }}>Customer:</Text>
                  <Text style={{ fontSize: baseFontSize }}>{r.customerName}</Text>
                </View>
              )}
              <View style={{ flexDirection: 'row', justifyContent: 'center', marginTop: 6 * scale }}>
                <View style={{ paddingVertical: 3 * scale, paddingHorizontal: 8 * scale, borderRadius: 3 * scale, borderWidth: 1, borderColor: getStatusTone('paid').border, backgroundColor: getStatusTone('paid').border + '15' }}>
                  <Text style={{ fontSize: baseFontSize, color: getStatusTone('paid').text, fontWeight: 'bold', letterSpacing: 1 * scale }}>PAID</Text>
                </View>
              </View>
            </View>

            <View style={{ marginBottom: 15 * scale }}>
              <View style={{ flexDirection: 'row', borderBottomWidth: 0.5, borderBottomColor: '#ccc', paddingBottom: 3 * scale, marginBottom: 5 * scale }}>
                <Text style={{ flex: 3, fontWeight: 'bold', fontSize: baseFontSize }}>Description</Text>
                <Text style={{ flex: 1, fontWeight: 'bold', fontSize: baseFontSize, textAlign: 'right' }}>Total</Text>
              </View>
              {r.items.map((item: any, i: number) => (
                <View key={i} style={{ marginBottom: 6 * scale }}>
                  <Text style={{ fontSize: mediumFontSize, fontWeight: 'normal' }}>{item.desc}</Text>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 1 * scale }}>
                    <Text style={{ fontSize: baseFontSize, color: '#444' }}>{item.qty} x {formatAmount(item.price)}</Text>
                    <Text style={{ fontSize: mediumFontSize }}>{formatAmount(item.total)}</Text>
                  </View>
                </View>
              ))}
            </View>

            <View style={{ borderTopWidth: 1, borderTopColor: '#000', borderTopStyle: 'dashed', paddingTop: 8 * scale, gap: 3 * scale }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={{ fontSize: mediumFontSize }}>Subtotal</Text>
                <Text style={{ fontSize: mediumFontSize }}>{formatAmount(r.subtotal)}</Text>
              </View>
              {r.discount > 0 && (
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Text style={{ fontSize: mediumFontSize }}>Discount</Text>
                  <Text style={{ fontSize: mediumFontSize }}>-{formatAmount(r.discount)}</Text>
                </View>
              )}
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 * scale, paddingTop: 4 * scale, borderTopWidth: 0.5, borderTopColor: '#eee' }}>
                <Text style={{ fontWeight: 'bold', fontSize: largeFontSize }}>TOTAL</Text>
                <Text style={{ fontWeight: 'bold', fontSize: largeFontSize }}>{currency} {formatAmount(r.totalAmount)}</Text>
              </View>
            </View>

            <View style={{ marginTop: 12 * scale, borderTopWidth: 1, borderTopColor: '#000', borderTopStyle: 'dashed', paddingTop: 8 * scale, gap: 3 * scale }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={{ fontSize: baseFontSize, color: '#666' }}>Method</Text>
                <Text style={{ fontSize: baseFontSize }}>{r.paymentMethod}</Text>
              </View>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={{ fontSize: baseFontSize, color: '#666' }}>Cash Tendered</Text>
                <Text style={{ fontSize: baseFontSize }}>{formatAmount(r.amountTendered)}</Text>
              </View>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={{ fontSize: baseFontSize, color: '#666' }}>Change Given</Text>
                <Text style={{ fontWeight: 'bold', fontSize: baseFontSize }}>{formatAmount(r.changeGiven)}</Text>
              </View>
            </View>

            <View style={{ marginTop: 18 * scale, alignItems: 'center' }}>
              <Text style={{ fontWeight: 'bold', textAlign: 'center', fontSize: mediumFontSize }}>Thank you for your business!</Text>
              <Text style={{ textAlign: 'center', fontSize: smallFontSize, marginTop: 6 * scale, color: '#999', textTransform: 'uppercase', letterSpacing: 0.6 * scale }}>Powered by Prime ERP</Text>
            </View>
          </View>
        </Page>
      </Document>
    );
  }

  if ((type === 'ACCOUNT_STATEMENT_SUMMARY' || type === 'ACCOUNT_STATEMENT') && 'finalBalance' in data) {
    return <StatementSummaryTemplate data={data as StatementDoc} configOverride={config} />;
  }

  const isConverted = 'isConverted' in data && data.isConverted;
  const conversionDetails = isConverted && 'conversionDetails' in data ? (dataAny.conversionDetails as Record<string, unknown>) || null : null;
  const isFromOrder = conversionDetails?.sourceType === 'Order' || conversionDetails?.sourceType === 'JobOrder';
  const isFromQuotation = conversionDetails?.sourceType === 'Quotation';
  const isConvertedOrder = (type === 'INVOICE' || (type as string) === 'SALES_ORDER' || type === 'ORDER') && isConverted;

  let title: string;
  if (type === 'FISCAL_REPORT' && 'reportName' in data) {
    title = String(dataAny.reportName);
  } else if (type === 'INVOICE' || (isConvertedOrder && isFromOrder)) {
    title = 'Invoice';
  } else {
    switch (type as string) {
      case 'ORDER':
        title = 'Sales Order';
        break;
      case 'SALES_ORDER':
        title = 'Sales Order';
        break;
      case 'SUBSCRIPTION':
        title = 'Recurring Invoice';
        break;
      case 'QUOTATION':
        title = 'Quotation';
        break;
      case 'PO':
        title = 'Purchase Order';
        break;
      case 'EXAMINATION_INVOICE':
        title = 'Exam Invoice';
        break;
      default:
        title = toTitleCase(type);
        break;
    }
  }

  const isCancelled = isCancelledStatus(dataAny.status, dataAny);

  return (
    <Document
      title={`${title} - ${'number' in data ? data.number : ('receiptNumber' in data ? data.receiptNumber : ('clientName' in data ? data.clientName : 'DOC'))}`}
      author={companyName}
      subject="ERP Generated Document"
      creator="Prime ERP System"
      keywords={`${type}, ERP, Business Document`}
    >
      <Page size="A4" style={[s.page, pageStyle]}>
        {isCancelled && <CancelledWatermark />}
        <View style={s.headerSection}>
          {isRightAligned ? (
            <>
              <View style={s.headerLeft}>
                <Text style={[s.title, titleStyle]}>{title}</Text>
                <View style={s.infoText}>
                  {type === 'INVOICE' ? (
                    <>
                      <Text>Invoice No. {String(('invoiceNumber' in data && dataAny.invoiceNumber) || ('number' in data ? dataAny.number : 'INV'))}</Text>
                      <Text>Invoice Date: {String('date' in data ? dataAny.date : 'N/A')}</Text>
                      {Boolean(showDueDate) && 'dueDate' in data && !!data.dueDate && <Text>Due Date: {formatDateOnly(String(data.dueDate))}</Text>}
                      {isFromQuotation && <Text style={{ fontSize: 8, color: '#64748b', marginTop: 2 }}>Order Ref: {String(conversionDetails?.sourceNumber || 'N/A')}</Text>}
                      {isFromOrder && <Text style={{ fontSize: 8, color: '#64748b', marginTop: 2 }}>Original Order: {String(conversionDetails?.sourceNumber || 'N/A')}</Text>}
                    </>
                  ) : type === 'ORDER' ? (
                    <>
                      <Text>Order No. {String(('orderNumber' in data && dataAny.orderNumber) || ('number' in data ? dataAny.number : 'ORD'))}</Text>
                      <Text>Order Date: {String('date' in data ? dataAny.date : 'N/A')}</Text>
                      <Text style={{ fontSize: 8, color: '#64748b', marginTop: 2 }}>Order Ref: {String(isFromQuotation && conversionDetails?.sourceNumber ? conversionDetails.sourceNumber : (('orderNumber' in data && dataAny.orderNumber) || 'N/A'))}</Text>
                      {Boolean(showDueDate) && 'dueDate' in data && !!data.dueDate && <Text>Due Date: {formatDateOnly(String(data.dueDate))}</Text>}
                    </>
                  ) : (type as string) === 'SALES_ORDER' ? (
                    <>
                      <Text>Sales Order No. {String(('orderNumber' in data && dataAny.orderNumber) || ('number' in data ? dataAny.number : 'SO'))}</Text>
                      <Text>Sales Order Date: {String('date' in data ? dataAny.date : 'N/A')}</Text>
                      {Boolean(showDueDate) && 'dueDate' in data && !!data.dueDate && <Text>Due Date: {formatDateOnly(String(data.dueDate))}</Text>}
                    </>
                  ) : type === 'EXAMINATION_INVOICE' ? (
                    <>
                      <Text>Exam Invoice No. {String('number' in data ? dataAny.number : 'INV')}</Text>
                      <Text>Exam Invoice Date: {String('date' in data ? dataAny.date : 'N/A')}</Text>
                      {Boolean(showDueDate) && 'dueDate' in data && !!data.dueDate && <Text>Due Date: {formatDateOnly(String(data.dueDate))}</Text>}
                    </>
                  ) : type === 'SUBSCRIPTION' ? (
                    <>
                      <Text>Recurring Inv. No. {String('number' in data ? dataAny.number : 'SUB')}</Text>
                      <Text>Issue Date: {String('date' in data ? dataAny.date : 'N/A')}</Text>
                      {'billingPeriodStart' in data && 'billingPeriodEnd' in data && !!dataAny.billingPeriodStart && !!dataAny.billingPeriodEnd && (
                        <Text style={{ marginTop: 2 }}>Period: {String(dataAny.billingPeriodStart)} to {String(dataAny.billingPeriodEnd)}</Text>
                      )}
                      {'frequency' in data && !!dataAny.frequency && (
                        <Text>Frequency: {toTitleCase(String(dataAny.frequency))}</Text>
                      )}
                      {'nextRunDate' in data && !!dataAny.nextRunDate && (
                        <Text style={{ marginTop: 2, fontWeight: 'bold' }}>Next Run: {String(dataAny.nextRunDate)}</Text>
                      )}
                    </>
                  ) : (
                    <>
                      <Text>{toTitleCase(type)} No. {String('number' in data ? dataAny.number : ('receiptNumber' in data ? dataAny.receiptNumber : 'STATEMENT'))}</Text>
                      <Text>{toTitleCase(type)} Date: {String('date' in data ? dataAny.date : 'N/A')}</Text>
                      {type === 'QUOTATION' && Boolean(showDueDate) && 'dueDate' in data && !!data.dueDate && <Text>Valid Until: {formatDateOnly(String(data.dueDate))}</Text>}
                    </>
                  )}
                </View>
              </View>
              <View style={s.headerRight}>
                {renderBrandMark('right')}
              </View>
            </>
          ) : (
            <>
              <View style={s.headerLeft}>
                {renderBrandMark('left')}
                <Text style={[s.title, titleStyle]}>{title}</Text>
                <View style={s.infoText}>
                  <Text>{toTitleCase(type)} No. {String('number' in data ? dataAny.number : ('receiptNumber' in data ? dataAny.receiptNumber : 'STATEMENT'))}</Text>
                  <Text>{toTitleCase(type)} Date: {String('date' in data ? dataAny.date : 'N/A')}</Text>
                </View>
              </View>
              <View style={s.headerRight}>
              </View>
            </>
          )}
        </View>

        {/* Logo (Optional, keep if needed or remove if strictly following snippet) */}
        {/* <View style={{ position: 'absolute', top: 40, right: 40, textAlign: 'right' }}>
          <Text style={{ fontWeight: 'bold', fontSize: 13.5 }}>PRIME</Text>
          <Text style={{ fontWeight: 'bold', fontSize: 13.5 }}>LOGO</Text>
        </View> */}

        {/* RECIPIENT SECTION */}
        {shouldRenderRecipientSection && (
          <View style={[s.billingSection, s.recipientSectionTight, { alignItems: 'flex-start', justifyContent: 'space-between' }]}>
            <View style={{ flex: 1, flexDirection: 'row' }}>
              <Text style={{ width: 80, fontWeight: 'bold' }}>{recipientLabel}</Text>
              <View style={s.recipientInfoText}>
                <Text style={s.recipientName}>{resolvedRecipientName || 'N/A'}</Text>
                <Text style={s.recipientDetail}>{resolvedRecipientAddress || 'N/A'}</Text>
                <Text style={s.recipientPhone}>{resolvedRecipientPhone || 'N/A'}</Text>
              </View>
            </View>

            {/* Conversion Details Box */}
            {/* Conversion / Acceptance Details Box */}
            {('isConverted' in data && !!data.isConverted) && (!!conversionDetails || type === 'QUOTATION') && (
              <View wrap={false} style={[s.conversionBox, { marginLeft: 20 }]}>
                <Text style={s.conversionTitle}>{type === 'QUOTATION' ? 'Acceptance Details' : 'Conversion History'}</Text>
                {type === 'QUOTATION' && 'date' in data ? (
                  <>
                    <Text>Accepted on {formatDateOnly(String(dataAny.date || ''))} by {resolvedRecipientName || 'N/A'}</Text>
                  </>
                ) : conversionDetails ? (
                  <>
                    <Text>
                      Converted from {resolveConversionSourceNumber(dataAny)} on {formatDateOnly(String(conversionDetails.date))} as accepted by {String(conversionDetails.acceptedBy || resolvedRecipientName || 'N/A')}
                    </Text>
                  </>
                ) : null}
              </View>
            )}
          </View>
        )}

        {/* TABLE SECTION */}
        {type !== 'DELIVERY_NOTE' && type !== 'WORK_ORDER' && type !== 'ACCOUNT_STATEMENT' && type !== 'EXAMINATION_INVOICE' && (
          <>
            {/* Case: INVOICE / PO */}
            {isFinancial && (
              <View style={s.tableSectionTight}>
                {/* 1. Restored Table Header with 2px border */}
                <View style={s.tableHeader}>
                  <Text style={s.colQty}>Qty</Text>
                  <Text style={s.colDesc}>Item Description</Text>
                  <Text style={s.colPrice}>Price</Text>
                  <Text style={s.colTotal}>Total</Text>
                </View>

                {/* 2. Item Rows with consistent 13px spacing */}
                {/* For Invoice, Order, Quotation: Service items show simplified format */}
                {/* For POS: All items show standard format */}
                {(('items' in data ? dataAny.items : []) as Array<Record<string, unknown>>).map((item: Record<string, unknown>, i: number) => {
                  // Check if this is a service-type item (category, type, or isService flag)
                  const isService = item.category === 'service' ||
                                   item.type === 'service' ||
                                   item.isService === true;
                  
                  // Check if current document type should use simplified service format
                  const useSimplifiedFormat = isService &&
                    (type === 'INVOICE' || type === 'ORDER' || (type as string) === 'SALES_ORDER' || type === 'QUOTATION');
                  
                  // Format description based on item type and document type
                  let formattedDesc = String(item.desc || '');
                  if (useSimplifiedFormat) {
                    const totalPages = Number(item.totalPages || item.pages || 0);
                    const copies = Number(item.copies || item.qty || 1);
                    const itemName = String(item.name || item.desc || 'Service');
                    formattedDesc = `${itemName} (${totalPages} pages × ${copies} copies)`;
                  }
                  
                  return (
                    <View key={i} style={s.row}>
                      <Text style={s.colQty}>{Number(item.qty)}</Text>
                      <Text style={s.colDesc}>{formattedDesc}</Text>
                      <Text style={s.colPrice}>{currency} {formatAmount(Number(item.price))}</Text>
                      <Text style={s.colTotal}>{currency} {formatAmount(Number(item.total))}</Text>
                    </View>
                  );
                })}

                {/* 3. The Masterpiece Summary Box (Restoring Source 1 Layout) */}
                <View
                  style={[
                    s.summaryContainer,
                    type === 'QUOTATION' ? { justifyContent: 'flex-end' } : null,
                    type === 'PO' ? { justifyContent: 'flex-end' } : null,
                  ]}
                >
                  {/* Left Side: Invoice Status for INVOICE/ORDER types */}
                  {(type === 'INVOICE' || type === 'ORDER' || (type as string) === 'SALES_ORDER' || type === 'SUBSCRIPTION') && 'status' in data && !!data.status && (
                    <View style={s.summaryLeft}>
                      {/* INVOICE STATUS TITLE REMOVED */}
                      <View style={[s.statusBox, { borderLeftColor: getStatusTone(data.status).border }]}>
                        <Text style={{ fontSize: 16, fontWeight: 'bold', color: getStatusTone(data.status).text }}>{data.status.toUpperCase()}</Text>
                      </View>
                    </View>
                  )}
                  
                  {/* Right Side: Summary Values */}
                  <View style={s.summaryRight}>
                    <View style={s.summaryBox}>
                      {(() => {
                        const itemsArr = ('items' in data ? data.items : []) as Array<Record<string, unknown>>;
                        const itemsSum = itemsArr.length > 0 ? itemsArr.reduce((s: number, i: Record<string, unknown>) => s + Number(i.total || 0), 0) : null;
                        const displaySubtotal = itemsSum !== null ? itemsSum : ('subtotal' in data ? Number(data.subtotal) : 0);
                        const displayDiscount = 'discount' in data ? Number(data.discount) : 0;
                        const displayTotal = itemsSum !== null ? itemsSum - displayDiscount : ('totalAmount' in data ? Number(data.totalAmount) : 0);
                        const displayAmountPaid = 'amountPaid' in data ? Number(data.amountPaid) : 0;
                        const displayDiscountPct = displaySubtotal > 0 ? Number(((displayDiscount / displaySubtotal) * 100).toFixed(2)) : 0;
                        const displayDiscountLabel = displayDiscountPct > 0 ? `Discount (${displayDiscountPct}%)` : 'Discount';

                        return (
                          <>
                            <View style={s.summaryRow}>
                              <Text style={{ flex: 1, fontWeight: 'bold' }}>Subtotal</Text>
                              <Text style={{ textAlign: 'right' }}>{currency} {formatAmount(displaySubtotal)}</Text>
                            </View>

                            {displayDiscount > 0 && (
                              <View style={s.summaryRow}>
                                <Text style={{ flex: 1 }}>{displayDiscountLabel}</Text>
                                <Text style={{ textAlign: 'right' }}>-{currency} {formatAmount(displayDiscount)}</Text>
                              </View>
                            )}

                            {type === 'QUOTATION' && (
                              <View style={s.totalRow}>
                                <Text style={{ flex: 1, fontWeight: 'bold' }}>Quoted Amount:</Text>
                                <Text style={{ textAlign: 'right', paddingLeft: 8 }}>{currency} {formatAmount(displayTotal)}</Text>
                              </View>
                            )}

                            {type !== 'QUOTATION' && type !== 'SUBSCRIPTION' && (
                              <>
                                <View style={s.summaryRow}>
                                  <Text style={{ flex: 1, fontWeight: 'bold' }}>Amount Paid</Text>
                                  <Text style={{ textAlign: 'right' }}>{currency} {formatAmount(displayAmountPaid)}</Text>
                                </View>
                            <View style={s.totalRow}>
                              <Text style={{ flex: 1 }}>Due Balance</Text>
                              <Text style={{ textAlign: 'right' }}>{currency} {formatAmount(('totalAmount' in data ? Number(data.totalAmount) : 0) - displayAmountPaid)}</Text>
                            </View>
                              </>
                            )}
                          </>
                        );
                      })()}

                      {/* Total before payments - Hidden on Invoices, Orders, Quotations, and POs */}
                      {type !== 'INVOICE' && type !== 'ORDER' && type !== 'QUOTATION' && type !== 'SUBSCRIPTION' && type !== 'PO' && (
                      <View style={s.summaryRow}>
                        <Text style={{ fontWeight: 'bold' }}>Total Amount</Text>
                        <Text style={{ textAlign: 'right' }}>{currency} {formatAmount('totalAmount' in data ? data.totalAmount : 0)}</Text>
                      </View>
                      )}

                      {/* Subscription Totals */}
                      {type === 'SUBSCRIPTION' && (
                        <View style={s.totalRow}>
                          <Text>Recurring Total</Text>
                          <Text style={{ textAlign: 'right' }}>{currency} {formatAmount('totalAmount' in data ? data.totalAmount : 0)}</Text>
                        </View>
                      )}
                    </View>
          </View>
        </View>

        {/* Outstanding Balance Statement */}
                {type === 'INVOICE' && showInvoiceBalances && Number(dataAny?.totalCustomerOutstanding || 0) > 0 && (() => {
                  const totalOutstanding = Number(dataAny.totalCustomerOutstanding || 0);
                  const todayStr = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
                  return (
                    <View style={{ marginTop: 15, padding: 8, backgroundColor: '#f0f9ff', borderRadius: 4, borderLeftWidth: 3, borderLeftColor: '#0ea5e9' }} wrap={false}>
                      <Text style={{ fontSize: scaledFont(10), color: '#0369a1', lineHeight: 1.4 }}>
                        {'Your overall outstanding balance is '}
                        <Text style={{ fontWeight: 'bold' }}>{currency} {totalOutstanding.toLocaleString('en-US', { minimumFractionDigits: 2 })}</Text>
                        {` as of ${todayStr}`}
                      </Text>
                    </View>
                  );
                })()}

                  {/* Thank You Note */}
                  <View wrap={false} style={{ marginTop: 15, alignItems: 'center' }}>
                    <Text style={{ fontSize: scaledFont(12), color: '#334155' }}>
                      Thank you for choosing <Text style={{ fontWeight: 'bold' }}>{companyName}</Text>
                    </Text>
                  </View>

                {/* Quotation Note */}
                {type === 'QUOTATION' && (
                  <View wrap={false} style={{ marginTop: 15, padding: 8, backgroundColor: '#f0f9ff', borderRadius: 4, borderLeftWidth: 3, borderLeftColor: '#0ea5e9' }}>
                    <Text style={{ fontSize: scaledFont(9), color: '#0369a1', lineHeight: 1.4 }}>
                      Note: Acceptance of this quotation converts it into a formal Sales Order subject to our standard terms and conditions.
                    </Text>
                  </View>
                )}

                {Boolean(showPaymentTerms) && !!paymentTermsLabel && (
                  <View
                    wrap={false}
                    style={{
                      marginTop: 14,
                      padding: 10,
                      backgroundColor: '#f8fafc',
                      borderRadius: 6,
                      borderLeftWidth: 3,
                      borderLeftColor: templateSettings.accentColor,
                    }}
                  >
                    <Text style={{ fontSize: scaledFont(9), fontWeight: 'bold', color: '#475569', textTransform: 'uppercase' }}>
                      Payment Terms
                    </Text>
                    <Text style={{ fontSize: scaledFont(10), color: '#334155', marginTop: 4, lineHeight: 1.45 }}>
                      {paymentTermsLabel}
                      {showDueDate && dataAny?.dueDate ? ` | Due by ${formatDateOnly(String(dataAny.dueDate))}` : ''}
                    </Text>
                  </View>
                )}


              </View>
            )}

            {/* Non-financial cases (original logic) */}
            {!isFinancial && (
              <>
                <View style={s.tableHeader}>
                  <Text style={s.colDesc}>Description / Instructions</Text>
                  <Text style={s.colQty}>Qty</Text>
                </View>

                {('items' in data ? data.items : []).map((item, i) => (
                  <View key={i} style={s.row}>
                    <Text style={s.colDesc}>{item.desc}</Text>
                    <Text style={s.colQty}>{item.qty}</Text>
                  </View>
                ))}
              </>
            )}
          </>
        )}

        {/* WORK_ORDER Case */}
        {type === 'WORK_ORDER' && (
          <View style={{ marginTop: 20 }}>
            {/* Job Header Info */}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 15, padding: 10, backgroundColor: '#f8fafc', borderRadius: 4, borderLeftWidth: 3, borderLeftColor: dataAny.priority === 'Critical' ? '#e11d48' : dataAny.priority === 'High' ? '#f59e0b' : '#3b82f6' }}>
              <View>
                <Text style={{ fontSize: 10, color: '#64748b', fontWeight: 'bold', textTransform: 'uppercase' }}>Priority Level</Text>
                <Text style={{ fontSize: 14, fontWeight: 'bold', color: dataAny.priority === 'Critical' ? '#e11d48' : '#0f172a' }}>{String(dataAny.priority || 'Normal')}</Text>
              </View>
              {('technician' in data) && !!data.technician && (
                <View style={{ textAlign: 'right' }}>
                  <Text style={{ fontSize: 10, color: '#64748b', fontWeight: 'bold', textTransform: 'uppercase' }}>Technician</Text>
                  <Text style={{ fontSize: 12, fontWeight: 'bold' }}>{String(data.technician)}</Text>
                </View>
              )}
            </View>

            {/* Technical Specifications Grid */}
            {('technicalSpecs' in data) && !!data.technicalSpecs && Object.keys(data.technicalSpecs).length > 0 && (
              <View style={{ marginBottom: 20 }}>
                <Text style={{ fontSize: 10, fontWeight: 'bold', marginBottom: 8, color: '#475569', textTransform: 'uppercase', letterSpacing: 1 }}>Technical Specifications</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
                  {Object.entries(data.technicalSpecs).map(([key, value], i) => (
                    <View key={i} style={{ width: '30%', padding: 8, backgroundColor: '#fff', borderWidth: 0.5, borderColor: '#e2e8f0', borderRadius: 4 }}>
                      <Text style={{ fontSize: 8, color: '#94a3b8', fontWeight: 'bold', textTransform: 'uppercase', marginBottom: 2 }}>{key}</Text>
                      <Text style={{ fontSize: 10, fontWeight: 'bold', color: '#1e293b' }}>{String(value)}</Text>
                    </View>
                  ))}
                </View>
              </View>
            )}

            {/* Production Instructions */}
            <View style={{ backgroundColor: '#f1f5f9', padding: 12, marginBottom: 20, borderRadius: 4 }}>
              <Text style={{ fontSize: 10, fontWeight: 'bold', marginBottom: 5, color: '#475569', textTransform: 'uppercase' }}>Manufacturing Instructions:</Text>
              <Text style={{ fontSize: 11, color: '#334155', lineHeight: 1.4 }}>{('instructions' in data ? data.instructions : null) || "Standard operating procedure required. Ensure quality check before release."}</Text>
            </View>

            {/* Materials Checklist */}
            {('materialChecklist' in data) && Array.isArray(data.materialChecklist) && data.materialChecklist.length > 0 && (
              <View style={{ marginBottom: 20 }}>
                <Text style={{ fontSize: 10, fontWeight: 'bold', marginBottom: 8, color: '#475569', textTransform: 'uppercase', letterSpacing: 1 }}>Materials Checklist</Text>
                <View style={{ borderTopWidth: 1, borderColor: '#e2e8f0' }}>
                  {data.materialChecklist.map((m, i) => (
                    <View key={i} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 6, borderBottomWidth: 0.5, borderColor: '#f1f5f9' }}>
                      <View style={{ width: 12, height: 12, borderWidth: 1, borderColor: '#cbd5e1', marginRight: 10, borderRadius: 2 }} />
                      <Text style={{ fontSize: 10, color: '#334155' }}>{m}</Text>
                    </View>
                  ))}
                </View>
              </View>
            )}

            {/* Service Tasks */}
            <Text style={{ fontSize: 10, fontWeight: 'bold', marginBottom: 8, color: '#475569', textTransform: 'uppercase', letterSpacing: 1 }}>Production Checklist</Text>
            <View style={s.tableHeader}>
              <Text style={s.colDesc}>Service / Process Details</Text>
              <Text style={s.colQty}>Completion</Text>
            </View>

            {('items' in data ? data.items : []).map((item, i) => (
              <View key={i} style={s.row}>
                <Text style={s.colDesc}>{item.desc}</Text>
                <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}>
                  <View style={{ width: 12, height: 12, borderWidth: 1, borderColor: '#000', marginRight: 5 }} />
                  <Text style={{ fontSize: 9 }}>Initial</Text>
                </View>
              </View>
            ))}
          </View>
        )}

        {/* DELIVERY_NOTE Case */}
        {type === 'DELIVERY_NOTE' && (
          <View style={{ marginTop: 20 }}>
            <Text style={{ fontSize: 12, fontWeight: 'bold', marginBottom: 10 }}>
              DELIVERY ITEMS CHECKLIST
            </Text>
            <View style={s.tableHeader}>
              <Text style={s.colDesc}>Item Description</Text>
              <Text style={s.colQty}>Qty Shipped</Text>
            </View>

            {('items' in data ? data.items : []).map((item, i) => (
              <View key={i} style={s.row}>
                <Text style={s.colDesc}>{item.desc}</Text>
                <Text style={s.colQty}>{item.qty}</Text>
              </View>
            ))}

            {/* Receiver's Remarks Box */}
            <View style={s.remarksBox}>
              <Text style={s.remarksTitle}>Receiver's Remarks</Text>
              <Text style={{ fontSize: 9, color: '#666' }}>
                {String(dataAny.notes || pod?.remarks || pod?.notes || 'Please note any discrepancies or comments regarding the delivery here...')}
              </Text>
            </View>
          </View>
        )}



        {/* Case: ACCOUNT_STATEMENT */}
        {type === 'ACCOUNT_STATEMENT' && 'transactions' in data && (
          <View style={{ marginTop: 20 }}>
            {/* Period Summary */}
            <View style={{ marginBottom: 20, padding: 10, backgroundColor: '#f8fafc', borderRadius: 4 }}>
              <Text style={{ fontSize: 10, color: '#64748b' }}>Statement Period:</Text>
              <Text style={{ fontSize: 12, fontWeight: 'bold' }}>{data.startDate} — {data.endDate}</Text>
            </View>

            {/* Ledger Table */}
            <View style={s.tableHeader}>
              <Text style={{ flex: 1.5 }}>Date</Text>
              <Text style={{ flex: 2 }}>Reference</Text>
              <Text style={{ flex: 1, textAlign: 'right' }}>Debit ({currency})</Text>
              <Text style={{ flex: 1, textAlign: 'right' }}>Credit ({currency})</Text>
              <Text style={{ flex: 1.5, textAlign: 'right' }}>Balance ({currency})</Text>
            </View>

            {data.transactions.map((txn, i) => (
              <View key={i} style={s.row}>
                <Text style={{ flex: 1.5 }}>{txn.date}</Text>
                <Text style={{ flex: 2 }}>{txn.reference}</Text>
                <Text style={{ flex: 1, textAlign: 'right' }}>{txn.debit > 0 ? formatAmount(txn.debit) : '-'}</Text>
                <Text style={{ flex: 1, textAlign: 'right' }}>{txn.credit > 0 ? formatAmount(txn.credit) : '-'}</Text>
                <Text style={{ flex: 1.5, textAlign: 'right', fontWeight: 'bold' }}>{formatAmount(txn.runningBalance)}</Text>
              </View>
            ))}

            {/* Summary Totals */}
            <View style={{ marginTop: 30, borderTopWidth: 2, borderColor: '#000', paddingTop: 10 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 5 }}>
                <Text>Total Debits:</Text>
                <Text>{currency} {formatAmount(Number('totalInvoiced' in data ? dataAny.totalInvoiced : 0))}</Text>
              </View>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 5 }}>
                <Text>Total Credits:</Text>
                <Text>{currency} {formatAmount(Number('totalReceived' in data ? dataAny.totalReceived : 0))}</Text>
              </View>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 5, padding: 8, backgroundColor: '#000', color: '#fff' }}>
                <Text style={{ fontWeight: 'bold' }}>TOTAL OUTSTANDING:</Text>
                <Text style={{ fontWeight: 'bold' }}>{currency} {formatAmount(Number('finalBalance' in data ? data.finalBalance : 0))}</Text>
              </View>
            </View>
          </View>
        )}

        {/* Case: FISCAL_REPORT */}
        {type === 'FISCAL_REPORT' && 'sections' in data && (
          <View style={{ marginTop: 20 }}>
            {/* Period Summary */}
            <View style={{ marginBottom: 20, padding: 12, backgroundColor: '#f8fafc', borderRadius: 8, borderLeftWidth: 4, borderLeftColor: '#2563eb' }}>
              <Text style={{ fontSize: 10, color: '#64748b', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: 1 }}>Report Period</Text>
              <Text style={{ fontSize: 14, fontWeight: 'bold', color: '#0f172a' }}>{data.period}</Text>
            </View>

            {data.sections.map((section, idx) => (
              <View key={idx} style={{ marginBottom: 20 }}>
                <Text style={{ fontSize: 10, fontWeight: 'bold', color: '#1e293b', textTransform: 'uppercase', borderBottomWidth: 1, borderBottomColor: '#e2e8f0', paddingBottom: 4, marginBottom: 8 }}>
                  {section.title}
                </Text>
                {section.rows.map((row, rowIdx) => (
                  <View key={rowIdx} style={{
                    flexDirection: 'row',
                    justifyContent: 'space-between',
                    paddingVertical: 6,
                    paddingHorizontal: 4,
                    backgroundColor: row.isTotal ? '#f1f5f9' : 'transparent',
                    borderTopWidth: row.isTotal ? 1 : 0,
                    borderColor: '#cbd5e1'
                  }}>
                    <View style={{ marginLeft: row.indent ? 15 : 0 }}>
                      <Text style={{ fontSize: row.isTotal ? 10 : 9, fontWeight: row.isTotal ? 'bold' : 'normal' }}>{row.label}</Text>
                      {!!row.subText && <Text style={{ fontSize: 7, color: '#64748b', marginTop: 1 }}>{row.subText}</Text>}
                    </View>
                    <View style={{ flexDirection: 'row', gap: 20 }}>
                      {row.prevAmount !== undefined && (
                        <Text style={{ fontSize: 8, color: '#94a3b8', width: 60, textAlign: 'right' }}>
                          {data.currency}{formatAmount(row.prevAmount)}
                        </Text>
                      )}
                      <Text style={{ fontSize: row.isTotal ? 10 : 9, fontWeight: row.isTotal ? 'bold' : 'normal', width: 80, textAlign: 'right' }}>
                        {data.currency}{formatAmount(row.amount)}
                      </Text>
                    </View>
                  </View>
                ))}
              </View>
            ))}

            {!!data.netPerformance && (
              <View style={{ marginTop: 20, padding: 12, backgroundColor: '#0f172a', borderRadius: 8 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text style={{ color: '#fff', fontSize: 12, fontWeight: 'bold' }}>{data.netPerformance.label}</Text>
                  <View style={{ flexDirection: 'row', gap: 20 }}>
                    {data.netPerformance.prevAmount !== undefined && (
                      <Text style={{ color: '#94a3b8', fontSize: 10, textAlign: 'right', width: 60 }}>
                        {data.currency}{formatAmount(data.netPerformance.prevAmount)}
                      </Text>
                    )}
                    <Text style={{ color: data.netPerformance.amount >= 0 ? '#4ade80' : '#f87171', fontSize: 14, fontWeight: 'bold', textAlign: 'right', width: 80 }}>
                      {data.currency}{formatAmount(data.netPerformance.amount)}
                    </Text>
                  </View>
                </View>
              </View>
            )}
          </View>
        )}
        
        {/* Case: EXAMINATION_INVOICE */}
        {type === 'EXAMINATION_INVOICE' && (
          <View style={{ marginTop: 20 }}>
            <View style={s.tableHeader}>
              <Text style={{ flex: 1, textAlign: 'center' }}>Qty</Text>
              <Text style={{ flex: 3 }}>Class / Subject</Text>
              <Text style={{ flex: 1, textAlign: 'right' }}>Price</Text>
              <Text style={{ flex: 1.5, textAlign: 'right' }}>Total</Text>
            </View>

            {(('items' in data ? dataAny.items : []) as Array<Record<string, unknown>>).map((item: Record<string, unknown>, i: number) => (
              <View key={i} style={s.row}>
                <Text style={{ flex: 1, textAlign: 'center', fontSize: 12 }}>{Number(item.qty)}</Text>
                <View style={{ flex: 3 }}>
                  <Text style={{ fontWeight: 'normal', fontSize: 12 }}>{String(item.desc)}</Text>
                </View>
                <Text style={{ flex: 1, textAlign: 'right', fontSize: 12 }}>{formatAmount(Number(item.price))}</Text>
                <Text style={{ flex: 1.5, textAlign: 'right', fontSize: 12 }}>{formatAmount(Number(item.total))}</Text>
              </View>
            ))}

            <View style={s.summaryContainer}>
              {'status' in data && !!data.status && (
                <View style={s.summaryLeft}>
                  {/* INVOICE STATUS TITLE REMOVED */}
                  <View style={[s.statusBox, { borderLeftColor: getStatusTone(data.status).border }]}>
                    <Text style={{ fontSize: 16, fontWeight: 'bold', color: getStatusTone(data.status).text }}>
                      {data.status.toUpperCase()}
                    </Text>
                  </View>
                </View>
              )}

              <View style={s.summaryRight}>
                <View style={s.summaryBox}>
                  <View style={s.summaryRow}>
                    <Text style={{ fontWeight: 'bold' }}>Subtotal</Text>
                    <Text>{currency} {formatAmount(Number(dataAny.preRoundingTotalAmount || dataAny.subtotal || 0))}</Text>
                  </View>

                  {dataAny.roundingDifference ? (
                    <View style={s.summaryRow}>
                      <Text style={{ fontWeight: 'bold' }}>Rounding{String(dataAny.roundingMethod ? ` (${String(dataAny.roundingMethod)})` : '')}</Text>
                      <Text>{currency} {formatAmount(Number(dataAny.roundingDifference))}</Text>
                    </View>
                  ) : null}

                  <View style={[s.summaryRow, { borderTopWidth: 1, borderTopColor: '#e2e8f0', paddingTop: 4, marginTop: 4 }]}>
                    <Text style={{ fontWeight: 'bold' }}>Grand Total</Text>
                    <Text>{currency} {formatAmount(Number('totalAmount' in data ? dataAny.totalAmount : 0))}</Text>
                  </View>
                  <View style={s.summaryRow}>
                    <Text style={{ fontWeight: 'bold' }}>Amount Paid</Text>
                    <Text>{currency} {formatAmount(Number('amountPaid' in data ? dataAny.amountPaid : 0))}</Text>
                  </View>
                  <View style={s.totalRow}>
                    <Text>Balance Due</Text>
                    <Text>
                      {currency} {formatAmount(Number('totalAmount' in data ? dataAny.totalAmount : 0) - Number('amountPaid' in data ? dataAny.amountPaid : 0))}
                    </Text>
                  </View>
                </View>
              </View>
            </View>

              <View wrap={false} style={{ marginTop: 12, alignItems: 'center' }}>
                <Text style={{ fontSize: scaledFont(12), color: '#334155' }}>
                  Thank you for choosing <Text style={{ fontWeight: 'bold' }}>{companyName}</Text>
                </Text>
              </View>

            {Boolean(showPaymentTerms) && !!paymentTermsLabel && (
              <View
                wrap={false}
                style={{
                  marginTop: 14,
                  padding: 10,
                  backgroundColor: '#f8fafc',
                  borderRadius: 6,
                  borderLeftWidth: 3,
                  borderLeftColor: templateSettings.accentColor,
                }}
              >
                <Text style={{ fontSize: scaledFont(9), fontWeight: 'bold', color: '#475569', textTransform: 'uppercase' }}>
                  Payment Terms
                </Text>
                <Text style={{ fontSize: scaledFont(10), color: '#334155', marginTop: 4, lineHeight: 1.45 }}>
                  {paymentTermsLabel}
                  {showDueDate && dataAny?.dueDate ? ` | Due by ${formatDateOnly(String(dataAny.dueDate))}` : ''}
                </Text>
              </View>
            )}
          </View>
        )}

        {/* DYNAMIC FOOTER (Signatures for Delivery/Work Orders) */}
        {!isFinancial && type !== 'DELIVERY_NOTE' && type !== 'EXAMINATION_INVOICE' && (
          <View style={s.signatureBlock}>
            <View>
              <View style={s.sigLine} />
              <Text>Issued By (Prime)</Text>
            </View>
            <View>
              <View style={s.sigLine} />
              <Text>Received By (Client)</Text>
            </View>
          </View>
        )}

        {/* Delivery Signature Block */}
        {type === 'DELIVERY_NOTE' && (
          <View style={[s.signatureBlock, { marginTop: 40 }]}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 10, fontWeight: 'bold', marginBottom: 5 }}>Logistics Details</Text>
              <Text style={{ fontSize: 9, marginBottom: 3 }}>Driver Name: {('driverName' in data ? data.driverName : '____________________')}</Text>
              <Text style={{ fontSize: 9 }}>Vehicle No: {('vehicleNo' in data ? data.vehicleNo : '____________________')}</Text>
            </View>
            <View style={{ flex: 1, alignItems: 'flex-end' }}>
              {Boolean(dataAny.signatureDataUrl || pod?.signatureDataUrl) ? (
                <View style={{ height: 40, width: 100, marginBottom: 5 }} />
              ) : (
                <View style={{ height: 45 }} />
              )}
              <View style={[s.sigLine, { width: 180 }]} />
              <Text style={{ fontSize: 9 }}>Received By: {String(dataAny.receivedBy || pod?.receivedBy || conversionDetails?.acceptedBy || '____________________')}</Text>
              <Text style={{ fontSize: 7, color: '#666' }}>Stamp & Signature</Text>
              {(() => {
                const locStamp = (conversionDetails?.locationStamp || pod?.locationStamp) as Record<string, unknown> | undefined;
                const lat = Number(locStamp?.lat);
                const lng = Number(locStamp?.lng);
                if (lat || lng) {
                  return (
                    <Text style={{ fontSize: 7, color: '#666', marginTop: 5 }}>
                      GPS: {lat.toFixed(4)}, {lng.toFixed(4)}
                    </Text>
                  );
                }
                return null;
              })()}
            </View>
          </View>
        )}

        {/* Standard Receipt Signature */}


        {/* DYNAMIC CENTERED FOOTER (Movable) */}
        <View style={s.footerContainer} wrap={false}>
          <View style={s.footerLine} />
        </View>

        {/* STATIC LEGAL FOOTER (Fixed at the bottom of every page) */}
        <SecurityFooter
          data={dataAny}
          companyName={companyName}
          legalFooterLine1={legalFooterLine1}
          legalFooterLine2={legalFooterLine2}
          fontScale={fontScale}
        />
      </Page>
    </Document>
  );
};