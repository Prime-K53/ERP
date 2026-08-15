/**
 * @file DocumentContract.ts
 * @description Future-proof document contract for a clean, headless ERP system.
 * This contract is independent of UI, database, PDF, and printing.
 */

/**
 * Document States representing the lifecycle of any document.
 */
export type DocumentState = 
  | 'DRAFT'           // Initial state, editable
  | 'PENDING_REVIEW'  // Waiting for approval
  | 'APPROVED'        // Approved, ready for processing
  | 'FINALIZED'       // Locked, no longer editable
  | 'CANCELLED'       // Invalidated or reversed
  | 'CLOSED';         // Fully processed and archived

/**
 * High-level document categories.
 */
export type DocumentType = 
  | 'SALES_INVOICE'
  | 'PURCHASE_ORDER'
  | 'QUOTATION'
  | 'DELIVERY_NOTE'
  | 'PRODUCTION_JOB'
  | 'INVENTORY_ADJUSTMENT'
  | 'CASH_RECEIPT';

/**
 * Immutable identity and versioning info.
 */
export interface DocumentIdentity {
  uid: string;              // Global UUID for database/API tracking
  sequenceId: string;       // Human-readable ID (e.g., INV-2026-001)
  type: DocumentType;       // Discriminator for logic
  version: number;          // Incremental version for audit trails
  parentUid?: string;       // Reference to previous version if revised
  tenantId: string;         // Multi-tenancy support
}

/**
 * Audit and lifecycle tracking.
 */
export interface DocumentLifecycle {
  state: DocumentState;
  createdAt: string;        // ISO 8601
  updatedAt: string;        // ISO 8601
  createdBy: string;        // User ID
  updatedBy: string;        // User ID
  finalizedAt?: string;     // When it moved to FINALIZED/APPROVED
  tags: string[];           // Custom classification
}

/**
 * Generic Payload structure. 
 * THeader: Domain specific header (e.g., Invoice details)
 * TLine: Domain specific line items
 */
export interface DocumentPayload<THeader, TLine> {
  header: THeader;
  lines: TLine[];
  totals: {
    subtotal: number;
    discountTotal: number;
    grandTotal: number;
    currency: string;
  };
}

/**
 * Relationships between documents (e.g., Invoice linked to a Sales Order).
 */
export interface DocumentLink {
  targetUid: string;
  targetType: DocumentType;
  relationship: 'SOURCE' | 'AMENDMENT' | 'Fulfillment' | 'PAYMENT';
}

/**
 * The Root Document Contract.
 */
export interface ERPDocument<THeader = any, TLine = any> {
  identity: DocumentIdentity;
  lifecycle: DocumentLifecycle;
  payload: DocumentPayload<THeader, TLine>;
  metadata: Record<string, any>; // Extensible catch-all for non-payload data
  links: DocumentLink[];        // Cross-document references
  hash?: string;                // Integrity check of the payload
}

// --- Domain Specific Payload Definitions (Example: Invoice) ---

export interface InvoiceHeader {
  customerId: string;
  customerName: string;
  billingAddress: string;
  shippingAddress?: string;
  date: string;
  dueDate: string;
  paymentTerms: string;
  reference?: string;
}

export interface InvoiceLine {
  itemId: string;
  description: string;
  quantity: number;
  unitPrice: number;
  discountAmount: number;
  totalNet: number;
  totalGross: number;
  uom: string; // Unit of Measure
}

/**
 * Typed Invoice Document for the ERP.
 */
export type InvoiceDocument = ERPDocument<InvoiceHeader, InvoiceLine>;
