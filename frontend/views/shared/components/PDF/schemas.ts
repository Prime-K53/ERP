import { z } from 'zod';

// Shared base for all Prime ERP documents 
const BaseDocSchema = z.object({
  number: z.string().min(1, "Document number is required"),
  date: z.string().min(1, "Date is required"),
  dueDate: z.string().optional(),
  paymentTerms: z.string().optional(),
  clientName: z.string().min(1, "Client name is required"),
  address: z.string().optional(),
  phone: z.string().optional(),
  createdAtIso: z.string().optional(),
  createdByName: z.string().optional(),
  securityQrPayload: z.string().optional(),
  securityQrCodeDataUrl: z.string().optional(),
  isConverted: z.boolean().optional(),
  conversionDetails: z.object({
    sourceType: z.string(),
    sourceNumber: z.string(),
    date: z.string(),
    acceptedBy: z.string().optional().default('N/A'),
    locationStamp: z.object({
      lat: z.number(),
      lng: z.number()
    }).optional()
  }).optional(),
  items: z.array(z.object({
    desc: z.string(),
    qty: z.number(),
  })).default([]),
});

// 1. Financial (Invoice/PO) adds Price logic 
export const FinancialDocSchema = BaseDocSchema.extend({
  invoiceNumber: z.string().optional(),
  orderNumber: z.string().optional(),
  items: z.array(z.object({
    desc: z.string(),
    qty: z.number(),
    price: z.number(),
    total: z.number(),
  })),
  subtotal: z.number(),
  discount: z.number().default(0),
  roundingDifference: z.number().optional(),
  roundingMethod: z.string().optional(),
  amountPaid: z.number().default(0),
  totalAmount: z.number(),
  status: z.string().optional(),
  walletBalance: z.number().optional(),
  totalCustomerOutstanding: z.number().optional(), // Sum of all unpaid invoices for this customer
});

// 2. Logistics (Work Order/Delivery Note) adds Signature requirements 
export const LogisticsDocSchema = BaseDocSchema.extend({
  technician: z.string().optional(), // Specific to Work Orders 
  instructions: z.string().optional(), // Specific to Work Orders
  status: z.string().optional(),
  receivedBy: z.string().optional(), // Specific to Delivery Notes  
  receivedAt: z.string().optional(),
  driverName: z.string().optional(),
  vehicleNo: z.string().optional(),
  signatureDataUrl: z.string().optional(),
  proofOfDelivery: z.object({
    receivedBy: z.string().optional(),
    timestamp: z.string().optional(),
    signatureDataUrl: z.string().optional(),
    signatureInputMode: z.enum(['Draw', 'Upload']).optional(),
    recipientPhone: z.string().optional(),
    notes: z.string().optional(),
    remarks: z.string().optional(),
    locationStamp: z.object({
      lat: z.number(),
      lng: z.number(),
    }).optional(),
  }).optional(),
  notes: z.string().optional(),
  priority: z.string().optional(),
  technicalSpecs: z.record(z.string(), z.string()).optional(),
  materialChecklist: z.array(z.string()).optional(),
});

// 3. Receipt Schema
export const ReceiptSchema = z.object({
  receiptNumber: z.string(),
  date: z.string(),
  customerName: z.string(),
  amountReceived: z.number(),
  amountApplied: z.number().optional(),
  amountRetained: z.number().optional(),
  changeGiven: z.number().optional(),
  paymentMethod: z.string(),
  appliedInvoices: z.array(z.string()), // ["INV-001", "INV-002"] 
  appliedOrders: z.array(z.string()).optional(), // ["ORD-001", "ORD-002"]
  invoiceTotal: z.number().optional(), // Sum of total amount of all applied invoices
  paymentStatus: z.enum(['PARTIALLY PAID', 'PAID', 'OVERPAID']).optional(),
  balanceDue: z.number().optional(), // Remaining balance if partially paid
  overpaymentAmount: z.number().optional(), // Excess amount if overpaid
  narrative: z.string().optional(), // Specific worded narrative for partial payments
  currentBalance: z.number(),
  walletDeposit: z.number().default(0), // Amount moved to wallet if overpaid 
  calculationVersion: z.number().optional(),
});

// 3.5 Supplier Payment Schema
export const SupplierPaymentSchema = z.object({
  paymentId: z.string(),
  date: z.string(),
  supplierName: z.string(),
  amountPaid: z.number(),
  paymentMethod: z.string(),
  appliedInvoices: z.array(z.string()), // IDs of bills being paid
  narrative: z.string().optional(),
});

// 3.6 POS Receipt Schema
export const PosReceiptSchema = z.object({
  receiptNumber: z.string(),
  date: z.string(),
  cashierName: z.string(),
  customerName: z.string().optional(),
  items: z.array(z.object({
    desc: z.string(),
    qty: z.number(),
    price: z.number(),
    total: z.number(),
  })),
  subtotal: z.number(),
  discount: z.number().default(0),
  tax: z.number().default(0),
  totalAmount: z.number(),
  paymentMethod: z.string(),
  amountTendered: z.number(),
  changeGiven: z.number(),
  payments: z.array(z.object({
    method: z.string(),
    amount: z.number(),
    accountId: z.string().optional(),
  })).optional(),
  footerMessage: z.string().optional(),
  companyInfo: z.object({
    name: z.string(),
    address: z.string(),
    phone: z.string(),
    email: z.string().optional(),
    website: z.string().optional(),
    footerMessage: z.string().optional(),
  }).optional(),
});

// 4. Statement Schema
export const StatementSchema = z.object({
  date: z.string(), // Issue date
  customerName: z.string(),
  startDate: z.string(),
  endDate: z.string(),
  currency: z.string().default('MWK'),
  openingBalance: z.number().default(0),
  transactions: z.array(z.object({
    date: z.string(),
    reference: z.string(),
    memo: z.string().optional(),
    debit: z.number(),
    credit: z.number(),
    runningBalance: z.number(),
  })),
  totalInvoiced: z.number(),
  totalReceived: z.number(),
  finalBalance: z.number(),
});

// 6. Sales Exchange Schema
export const SalesExchangeSchema = z.object({
  exchangeNumber: z.string(),
  date: z.string(),
  customerName: z.string(),
  address: z.string().optional(),
  phone: z.string().optional(),
  invoiceNumber: z.string(),
  reason: z.string(),
  remarks: z.string().optional(),
  items: z.array(z.object({
    desc: z.string(),
    qtyReturned: z.number(),
    qtyReplaced: z.number(),
    priceDiff: z.number(),
    replacedProductName: z.string().optional(),
  })),
  totalPriceDiff: z.number(),
});

// 5. Fiscal Report Schema
export const FiscalReportSchema = z.object({
  reportName: z.string(),
  period: z.string(),
  currency: z.string(),
  sections: z.array(z.object({
    title: z.string(),
    rows: z.array(z.object({
      label: z.string(),
      amount: z.number(),
      prevAmount: z.number().optional(),
      isTotal: z.boolean().optional(),
      indent: z.boolean().optional(),
      subText: z.string().optional()
    }))
  })),
  netPerformance: z.object({
    label: z.string(),
    amount: z.number(),
    prevAmount: z.number().optional()
  }).optional()
});

// 7. Subscription Schema
export const SubscriptionDocSchema = FinancialDocSchema.extend({
  frequency: z.string().optional(),
  nextRunDate: z.string().optional(),
  nextBillingDate: z.string().optional(),
  billingPeriodStart: z.string().optional(),
  billingPeriodEnd: z.string().optional(),
  totalCycles: z.number().optional(),
  walletBalance: z.number().optional(),
  autoDeductWallet: z.boolean().optional(),
  autoEmail: z.boolean().optional(),
  scheduledDates: z.array(z.string()).optional(),
  adjustmentSnapshots: z.array(z.object({
    name: z.string(),
    type: z.string(),
    value: z.number(),
    calculatedAmount: z.number(),
  })).optional(),
});

// 8. Examination Invoice Schema
export const ExaminationInvoiceSchema = FinancialDocSchema.extend({
  batchId: z.string().optional(),
  academicYear: z.string().optional(),
  term: z.string().optional(),
  examType: z.string().optional(),
  schoolName: z.string().optional(),
  subAccountName: z.string().optional(),
  materialTotal: z.number().optional(),
  adjustmentTotal: z.number().optional(),
  preRoundingTotalAmount: z.number().optional(),
  roundingDifference: z.number().optional(),
  roundingMethod: z.string().optional(),
  adjustmentSnapshots: z.array(z.object({
    name: z.string(),
    type: z.string(),
    value: z.number(),
    calculatedAmount: z.number(),
  })).optional(),
  subjects: z.array(z.object({
    name: z.string(),
    pages: z.number(),
    candidates: z.number(),
    totalSheets: z.number().optional(),
    internalCost: z.number().optional(),
    sellingPrice: z.number().optional(),
  })).optional(),
  classBreakdown: z.array(z.object({
    className: z.string(),
    subjects: z.array(z.string()),
    totalCandidates: z.number(),
    chargePerLearner: z.number(),
    classTotal: z.number(),
  })).optional(),
});

export type FinancialDoc = z.infer<typeof FinancialDocSchema>;
export type LogisticsDoc = z.infer<typeof LogisticsDocSchema>;
export type ReceiptDoc = z.infer<typeof ReceiptSchema>;
export type SupplierPaymentDoc = z.infer<typeof SupplierPaymentSchema>;
export type PosReceiptDoc = z.infer<typeof PosReceiptSchema>;
export type StatementDoc = z.infer<typeof StatementSchema>;
export type FiscalReportDoc = z.infer<typeof FiscalReportSchema>;
export type SalesExchangeDoc = z.infer<typeof SalesExchangeSchema>;
export type SubscriptionDoc = z.infer<typeof SubscriptionDocSchema>;
export type ExaminationInvoiceDoc = z.infer<typeof ExaminationInvoiceSchema>;
export type PrimeDocData = FinancialDoc | LogisticsDoc | ReceiptDoc | SupplierPaymentDoc | PosReceiptDoc | StatementDoc | FiscalReportDoc | SalesExchangeDoc | SubscriptionDoc | ExaminationInvoiceDoc;

type UnionKeys<T> = T extends T ? keyof T : never;
type PickType<T, K extends PropertyKey> = T extends Record<K, infer V> ? V : never;

export type LoosePrimeDocData = {
  [K in UnionKeys<PrimeDocData>]?: PickType<PrimeDocData, K>;
};
