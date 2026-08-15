/**
 * @file InvoicePayload.ts
 * @description Normalized, future-proof payload structure for ERP Invoices.
 * This structure is designed to be independent of presentation, storage, or transport layers.
 */

/**
 * Monetary value with currency context.
 * Uses strings for amounts to prevent floating-point precision issues in transit.
 */
export interface Money {
  amount: string;      // Decimal string (e.g., "1500.50")
  currency: string;    // ISO 4217 (e.g., "USD")
  precision: number;   // Number of decimal places (e.g., 2)
}

/**
 * Party information (Issuer or Customer) captured at the time of issuance.
 */
export interface InvoiceParty {
  id?: string;
  name: string;
  address: {
    line1: string;
    line2?: string;
    city: string;
    state?: string;
    postalCode?: string;
    countryCode: string; // ISO 3166-1 alpha-2
  };
  contact: {
    email: string;
    phone?: string;
    website?: string;
  };
}


/**
 * Discount breakdown for a line item or total.
 */
export interface DiscountDetail {
  description: string;
  type: 'PERCENTAGE' | 'FLAT';
  value: string;       // The rate or amount
  amount: Money;       // Calculated discount amount
}

/**
 * A single line item in the invoice.
 */
export interface InvoiceLineItem {
  sequence: number;    // Display order
  id: string;          // Internal product/service ID
  sku?: string;
  description: string;
  longDescription?: string;
  quantity: string;    // Decimal string for precision (e.g., "10.000")
  uom: string;         // Unit of Measure (e.g., "kg", "pcs", "hour")
  
  pricing: {
    unitPrice: Money;
    subtotalNet: Money;   // Net amount
    subtotalGross: Money; // Gross amount
  };

  metadata?: Record<string, any>; // Extensibility for line-specific data (e.g., batch numbers)
}

/**
 * Summary of payments applied to this invoice.
 */
export interface PaymentSummary {
  totalPaid: Money;
  totalRemaining: Money;
  status: 'UNPAID' | 'PARTIAL' | 'PAID' | 'OVERPAID';
  lastPaymentDate?: string;
  installments?: {
    dueDate: string;
    amount: Money;
    status: 'PENDING' | 'PAID' | 'OVERDUE';
  }[];
}

/**
 * References to related documents or external entities.
 */
export interface InvoiceReferences {
  purchaseOrderNumber?: string;
  quotationUid?: string;
  salesOrderUid?: string;
  jobOrderUid?: string;
  externalReference?: string;
  notes?: string;
  termsAndConditions?: string;
}

/**
 * The Root Invoice Payload.
 */
export interface InvoicePayload {
  issuer: InvoiceParty;
  customer: InvoiceParty;
  shippingAddress?: InvoiceParty['address'];
  
  dates: {
    issuedAt: string;  // ISO 8601
    dueDate: string;   // ISO 8601
    servicePeriodStart?: string;
    servicePeriodEnd?: string;
  };

  items: InvoiceLineItem[];

  totals: {
    subtotalNet: Money;    // Sum of lines net
    totalDiscount: Money;  // Total discount applied at invoice level
    grandTotal: Money;     // Final amount due
  };

  payment: PaymentSummary;
  references: InvoiceReferences;
  
  extensions?: Record<string, any>; // Catch-all for industry-specific fields
}
