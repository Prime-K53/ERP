import type { DocType } from '../../../../stores/documentStore';

export interface ValidationResult {
  valid: boolean;
  error?: string;
}

const requireFields = (data: any, fields: string[], type: string, labels: string[]): string | null => {
  for (let i = 0; i < fields.length; i++) {
    const val = data[fields[i]];
    if (val === undefined || val === null || val === '') {
      return `${type} is missing required field: ${labels[i] || fields[i]}`;
    }
  }
  return null;
};

// Accept numeric amount from any common field name
const resolveAmount = (data: any): number | undefined => {
  const val = data.subtotal ?? data.totalAmount ?? data.total ?? data.total_amount
    ?? data.sub_total ?? data.subtotalAmount ?? data.grand_total ?? data.grandTotal
    ?? data.amount ?? data.amountDue ?? data.balance_due ?? data.balanceDue;
  if (val === undefined || val === null) return undefined;
  const n = typeof val === 'number' ? val : parseFloat(String(val).replace(/[^0-9.-]/g, ''));
  return isNaN(n) ? undefined : n;
};

// Accept document number from any of these common field names
const resolveDocumentNumber = (data: any): string | undefined =>
  data.number || data.id?.toString() || data.invoiceNumber || data.invoice_number
  || data.orderNumber || data.order_number || data.quotationNumber || data.quotation_number
  || data.receiptNumber || data.receipt_number || data.paymentId || data.payment_id
  || data.exchangeNumber || data.exchange_number || data.documentNumber || data.document_number
  || undefined;

const checkArray = (data: any, field: string, type: string, label: string): string | null => {
  const arr = data[field];
  if (!Array.isArray(arr)) {
    return `${type} is missing required array: ${label}`;
  }
  if (arr.length === 0) {
    return `${type} has no ${label} — document will render blank`;
  }
  return null;
};

export const validateDocumentData = (type: DocType | string, data: any): ValidationResult => {
  if (!data || typeof data !== 'object') {
    return { valid: false, error: 'Document data is empty or invalid' };
  }

  const ANY_INVOICE = ['INVOICE', 'ORDER', 'SALES_ORDER', 'SUBSCRIPTION', 'QUOTATION', 'EXAMINATION_INVOICE'];

  if (type === 'RECEIPT') {
    const r1 = requireFields(data, ['receiptNumber', 'customerName', 'paymentMethod'], 'Receipt', ['Receipt number', 'Customer name', 'Payment method']);
    if (r1) return { valid: false, error: r1 };
    const amt = data.amountReceived ?? data.amount_received ?? data.amount ?? data.totalAmount ?? data.total;
    if (amt === undefined || amt === null || (typeof amt !== 'number' && !String(amt).trim())) {
      return { valid: false, error: 'Receipt is missing an amount' };
    }
    return { valid: true };
  }

  if (type === 'POS_RECEIPT') {
    const r1 = requireFields(data, ['receiptNumber', 'cashierName', 'paymentMethod'], 'POS Receipt', ['Receipt number', 'Cashier name', 'Payment method']);
    if (r1) return { valid: false, error: r1 };
    if (resolveAmount(data) === undefined) return { valid: false, error: 'POS Receipt is missing a total amount' };
    const r2 = checkArray(data, 'items', 'POS Receipt', 'line items');
    if (r2) return { valid: false, error: r2 };
    return { valid: true };
  }

  if (type === 'SUPPLIER_PAYMENT') {
    const r1 = requireFields(data, ['paymentId', 'supplierName'], 'Supplier Payment', ['Payment ID', 'Supplier name']);
    if (r1) return { valid: false, error: r1 };
    const amt = data.amountPaid ?? data.amount_paid ?? data.amount ?? data.totalAmount ?? data.total;
    if (amt === undefined || amt === null || (typeof amt !== 'number' && !String(amt).trim())) {
      return { valid: false, error: 'Supplier Payment is missing an amount' };
    }
    return { valid: true };
  }

  if (type === 'SALES_EXCHANGE') {
    const r1 = requireFields(data, ['exchangeNumber', 'customerName', 'invoiceNumber', 'reason'], 'Sales Exchange', ['Exchange number', 'Customer name', 'Reference invoice', 'Reason']);
    if (r1) return { valid: false, error: r1 };
    return { valid: true };
  }

  if (type === 'WORK_ORDER') {
    const r1 = requireFields(data, ['number', 'instructions'], 'Work Order', ['Order number', 'Instructions']);
    if (r1) return { valid: false, error: r1 };
    return { valid: true };
  }

  if (type === 'DELIVERY_NOTE') {
    const noteNumber = data.number || data.dnNumber || data.deliveryNoteNumber || data.id?.toString() || data.invoiceId;
    const clientName = data.clientName || data.customerName;
    if (!noteNumber) return { valid: false, error: 'Delivery Note is missing required field: Note number' };
    if (!clientName) return { valid: false, error: 'Delivery Note is missing required field: Client name' };
    const r2 = checkArray(data, 'items', 'Delivery Note', 'delivery items');
    if (r2) return { valid: false, error: r2 };
    return { valid: true };
  }

  if (type === 'ACCOUNT_STATEMENT' || type === 'ACCOUNT_STATEMENT_SUMMARY') {
    const r1 = requireFields(data, ['customerName', 'startDate', 'endDate', 'openingBalance', 'finalBalance'], 'Statement', ['Customer name', 'Start date', 'End date', 'Opening balance', 'Closing balance']);
    if (r1) return { valid: false, error: r1 };
    const r2 = checkArray(data, 'transactions', 'Statement', 'transactions');
    if (r2) return { valid: false, error: r2 };
    return { valid: true };
  }

  if (type === 'FISCAL_REPORT') {
    const r1 = requireFields(data, ['reportName', 'period'], 'Fiscal Report', ['Report name', 'Period']);
    if (r1) return { valid: false, error: r1 };
    const r2 = checkArray(data, 'sections', 'Fiscal Report', 'sections');
    if (r2) return { valid: false, error: r2 };
    return { valid: true };
  }

  if (type === 'PO') {
    const poName = data.supplierName || data.vendorName || data.supplier_name || data.vendor_name || data.supplierId || data.vendorId || data.supplier_id || data.vendor_id || data.customerName || data.customer_name || data.clientName || data.client_name || data.schoolName || data.school_name;
    if (!poName) return { valid: false, error: 'Purchase Order is missing required field: Supplier name' };
    if (!resolveDocumentNumber(data)) return { valid: false, error: 'Purchase Order is missing a document number' };
    if (resolveAmount(data) === undefined) return { valid: false, error: 'Purchase Order is missing a total amount' };
    const r2 = checkArray(data, 'items', 'Purchase Order', 'line items');
    if (r2) return { valid: false, error: r2 };
    return { valid: true };
  }

  // INVOICE, ORDER, SALES_ORDER, QUOTATION, SUBSCRIPTION, EXAMINATION_INVOICE — generic financial
  if (ANY_INVOICE.includes(type)) {
    const label = type === 'QUOTATION' ? 'Quotation' : type === 'SUBSCRIPTION' ? 'Subscription' : type === 'EXAMINATION_INVOICE' ? 'Examination Invoice' : type === 'ORDER' ? 'Order' : 'Invoice';
    if (!resolveDocumentNumber(data)) return { valid: false, error: `${label} is missing a document number` };
    if (resolveAmount(data) === undefined) return { valid: false, error: `${label} is missing a total or subtotal amount` };
    const r2 = checkArray(data, 'items', label, 'line items');
    if (r2) return { valid: false, error: r2 };
    // Check at least one item has content. Consider common field names used across payloads.
    const items: any[] = data.items || [];
    const itemHasText = (it: any) => {
      if (!it) return false;
      const candidates = [it.desc, it.name, it.productName, it.product_name, it.description, it.title, it.label];
      return candidates.some(c => c !== undefined && c !== null && String(c).trim() !== '');
    };
    const allEmpty = items.every((it: any) => !itemHasText(it));
    if (items.length > 0 && allEmpty) {
      return { valid: false, error: `${label} items have no descriptions — document will render blank` };
    }
    return { valid: true };
  }

  // Fallback: validate generically
  const hasArray = Array.isArray(data.items) ? (data.items.length > 0 ? null : 'has empty items') : 'has no items';
  const hasName = data.clientName || data.customerName || data.number || 'no identifier';
  if (hasArray && !hasName) {
    return { valid: false, error: `Document has no identifiable content (no items, no client)` };
  }

  return { valid: true };
};

export const sanitizePdfPayload = (data: any): any => {
  if (data === undefined || data === null) return null;
  if (typeof data === 'function') return undefined;
  if (data instanceof Date) return data.toISOString();
  if (data instanceof Map) {
    const obj: Record<string, any> = {};
    data.forEach((v, k) => { obj[String(k)] = sanitizePdfPayload(v); });
    return obj;
  }
  if (data instanceof Set) {
    return Array.from(data).map(sanitizePdfPayload);
  }
  if (typeof data === 'object') {
    if (Array.isArray(data)) {
      return data.map(sanitizePdfPayload);
    }
    const result: Record<string, any> = {};
    for (const key of Object.keys(data)) {
      const val = sanitizePdfPayload(data[key]);
      if (val !== undefined) {
        result[key] = val;
      } else {
        // Convert undefined to null for JSON safety
        result[key] = null;
      }
    }
    return result;
  }
  if (typeof data === 'bigint') return String(data);
  return data;
};
