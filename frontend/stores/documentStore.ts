import { create } from 'zustand';
import { logger } from '@/services/logger';
import { PrimeDocData, FinancialDocSchema, LogisticsDocSchema, ReceiptSchema, SupplierPaymentSchema, PosReceiptSchema, StatementSchema, FiscalReportSchema, SalesExchangeSchema, SubscriptionDocSchema, ExaminationInvoiceSchema } from '../views/shared/components/PDF/schemas';

export type DocType = 'INVOICE' | 'EXAMINATION_INVOICE' | 'PO' | 'WORK_ORDER' | 'DELIVERY_NOTE' | 'QUOTATION' | 'RECEIPT' | 'SUPPLIER_PAYMENT' | 'POS_RECEIPT' | 'ACCOUNT_STATEMENT' | 'ACCOUNT_STATEMENT_SUMMARY' | 'FISCAL_REPORT' | 'SALES_EXCHANGE' | 'SALES_ORDER' | 'SUBSCRIPTION' | 'ORDER';

export interface FilePreviewDescriptor {
  downloadUrl?: string;
  fileId?: string;
  fileName: string;
  mimeType?: string;
  publicUrl?: string;
  sourceUrl?: string;
  title?: string;
}

const resolveSchema = (type: DocType) => {
  if (type === 'INVOICE' || type === 'PO' || type === 'QUOTATION' || type === 'SALES_ORDER' || type === 'ORDER') {
    return FinancialDocSchema;
  }
  if (type === 'EXAMINATION_INVOICE') {
    return ExaminationInvoiceSchema;
  }
  if (type === 'SUBSCRIPTION') {
    return SubscriptionDocSchema;
  }
  if (type === 'RECEIPT') {
    return ReceiptSchema;
  }
  if (type === 'SUPPLIER_PAYMENT') {
    return SupplierPaymentSchema;
  }
  if (type === 'POS_RECEIPT') {
    return PosReceiptSchema;
  }
  if (type === 'ACCOUNT_STATEMENT' || type === 'ACCOUNT_STATEMENT_SUMMARY') {
    return StatementSchema;
  }
  if (type === 'FISCAL_REPORT') {
    return FiscalReportSchema;
  }
  if (type === 'SALES_EXCHANGE') {
    return SalesExchangeSchema;
  }
  return LogisticsDocSchema;
};

interface DocumentState {
  isOpen: boolean;
  type: DocType;
  data: PrimeDocData | null;
  filePreview: FilePreviewDescriptor | null;
  /**
   * Validates raw data against Zod schemas before opening preview.
   * Useful for data coming from external sources or raw API responses.
   */
  safeOpenPreview: (type: DocType, rawData: any) => { success: boolean; error?: string };
  openPreview: (type: DocType, data: PrimeDocData) => void;
  openFilePreview: (file: FilePreviewDescriptor) => void;
  closePreview: () => void;
}

export const useDocumentStore = create<DocumentState>((set) => ({
  isOpen: false,
  type: 'INVOICE',
  data: null,
  filePreview: null,

  safeOpenPreview: (type, rawData) => {
    const schema = resolveSchema(type);
    const result = schema.safeParse(rawData);

    if (result.success) {
      set({ isOpen: true, type, data: result.data, filePreview: null });
      return { success: true };
    }

    logger.error(`[DocumentStore] Invalid ${type} data:`, result.error.format());
    return {
      success: false,
      error: "Missing or invalid document data fields."
    };
  },

  openPreview: (type, data) => set({ isOpen: true, type, data, filePreview: null }),

  openFilePreview: (file) => set({ isOpen: true, data: null, filePreview: file }),

  closePreview: () => set({ isOpen: false, data: null, filePreview: null }),
}));
