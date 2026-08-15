import { createElement } from 'react';
import { logger } from '@/services/logger';
import { pdf } from '@react-pdf/renderer';
import { useDocumentStore, DocType } from '../stores/documentStore';
import { useAuth } from '../context/AuthContext';
import { useSales } from '../context/SalesContext';
import { useFinance } from '../context/FinanceContext';
import { mapToInvoiceData } from '../utils/pdfMapper';
import { enrichDocumentCustomerData } from '../utils/documentCustomerData';
import { PrimeDocument } from '../views/shared/components/PDF/PrimeDocument';
import { PrimeDocData } from '../views/shared/components/PDF/schemas';
import { attachDocumentSecurity } from '../utils/documentSecurity';
import { printDocumentUrl } from '../utils/documentPrint';
import { initializePrimePdfFonts } from '../views/shared/components/PDF/templateSettings';
import { validateDocumentData } from '../views/shared/components/PDF/documentValidation';

export const useDocumentPreview = () => {
  const { safeOpenPreview } = useDocumentStore();
  const { notify, companyConfig } = useAuth();
  const { customers } = useSales();
  const { invoices } = useFinance();

  const prepareDocument = async (
    openMode: 'preview' | 'print',
    type: DocType,
    rawData: any,
    boms?: any[],
    inventory?: any[]
  ) => {
    try {
      const originModule = String(rawData?.originModule || rawData?.origin_module || '').toLowerCase();
      const isExaminationInvoice = type === 'INVOICE' && (
        originModule === 'examination'
        || String(rawData?.documentTitle || rawData?.document_title || '').toLowerCase().includes('examination invoice')
        || String(rawData?.reference || '').toUpperCase().startsWith('EXM-BATCH-')
      );
      const effectiveType: DocType = isExaminationInvoice ? 'EXAMINATION_INVOICE' : type;

      // Validate raw data BEFORE mapping (mapper adds safe placeholders)
      const rawValidation = validateDocumentData(effectiveType, rawData);
      if (!rawValidation.valid) {
        notify(rawValidation.error || 'Document data is invalid', 'error');
        return;
      }

      let enrichedData = enrichDocumentCustomerData(rawData, customers);

      const customerName = enrichedData?.customerName || enrichedData?.customer_name;
      if (customerName && invoices) {
        const totalOutstanding = (invoices as any[])
          .filter((inv: any) =>
            inv.customerName === customerName &&
            !['Paid', 'Cancelled', 'Void', 'Draft'].includes(String(inv.status || ''))
          )
          .reduce((sum: number, inv: any) => {
            const due = Math.max(0, Number(inv.totalAmount || 0) - Number(inv.paidAmount || 0));
            return sum + due;
          }, 0);
        enrichedData = { ...enrichedData, totalCustomerOutstanding: totalOutstanding };
      }

      if (effectiveType === 'SUBSCRIPTION' && rawData) {
        try {
          const customer = (customers || []).find((c: any) =>
            String(c.id) === String(rawData.customerId) || c.name === rawData.customerName
          );

          if (customer) {
            enrichedData = {
              ...enrichedData,
              walletBalance: customer.walletBalance || customer.wallet_balance || 0
            };
          }
        } catch (_) { /* Wallet balance enrichment is best-effort */ }
      }

      const mappedData = mapToInvoiceData(enrichedData, companyConfig, effectiveType, boms, inventory);

      if (openMode === 'print') {
        logger.debug('[useDocumentPreview] Starting print generation', { type: effectiveType });
        const startTime = performance.now();

        const securedData = await attachDocumentSecurity(mappedData as any, companyConfig?.companyName);
        await initializePrimePdfFonts();
        const blob = await pdf(createElement(PrimeDocument as any, {
          type: effectiveType,
          data: securedData as PrimeDocData,
          customers: customers as any
        }) as any).toBlob();

        const duration = performance.now() - startTime;
        logger.debug('[useDocumentPreview] Print PDF generated', {
          size: blob.size,
          durationMs: Math.round(duration),
        });

        const blobUrl = URL.createObjectURL(blob);

        try {
          await printDocumentUrl(blobUrl, `${effectiveType} print`);
        } finally {
          window.setTimeout(() => URL.revokeObjectURL(blobUrl), 5000);
        }

        return;
      }

      const result = safeOpenPreview(effectiveType, mappedData);
      if (!result.success && result.error) {
        notify(result.error, 'error');
      }
    } catch (error: any) {
      logger.error(`[useDocumentPreview] Mapping failed for ${type}:`, error);
      if (error.format) {
        logger.error(`[useDocumentPreview] Zod issues:`, error.format());
      }
      notify("Failed to prepare document data: " + (error.message || "Unknown error"), 'error');
    }
  };

  const handlePreview = (type: DocType, rawData: any, boms?: any[], inventory?: any[]) =>
    void prepareDocument('preview', type, rawData, boms, inventory);

  const handlePrint = (type: DocType, rawData: any, boms?: any[], inventory?: any[]) =>
    void prepareDocument('print', type, rawData, boms, inventory);

  return { handlePreview, handlePrint };
};
