/**
 * Server-side OFFICIAL document renderer.
 *
 * This is THE SAME rendering pipeline the ERP staff UI uses for official
 * documents (hooks/useDocumentPreview print path):
 *   validateDocumentData -> enrichDocumentCustomerData -> mapToInvoiceData
 *   -> attachDocumentSecurity -> PrimeDocument (@react-pdf/renderer)
 *
 * It exists so the ERP BACKEND can serve authoritative application/pdf bytes
 * to the customer portal WITHOUT duplicating any template or generation logic
 * in Sasa, and without a second visual template inside the ERP.
 *
 * Built to CJS by frontend/scripts/build-official-document-renderer.mjs and
 * consumed by backend/services/officialDocumentService.cjs.
 */
import { createElement } from 'react';
import { pdf } from '@react-pdf/renderer';
import { mapToInvoiceData } from '../utils/pdfMapper';
import { enrichDocumentCustomerData } from '../utils/documentCustomerData';
import { PrimeDocument } from '../views/shared/components/PDF/PrimeDocument';
import { attachDocumentSecurity } from '../utils/documentSecurity';
import { initializePrimePdfFonts } from '../views/shared/components/PDF/templateSettings';
import { validateDocumentData } from '../views/shared/components/PDF/documentValidation';

export interface RenderOfficialDocumentInput {
  /** DocType understood by PrimeDocument: INVOICE | QUOTATION | SALES_ORDER | ORDER | DELIVERY_NOTE | RECEIPT … */
  type: string;
  /** The AUTHORITATIVE ERP record (invoice/quotation/order row as stored). */
  rawData: unknown;
  /** Company configuration (branding/terms). Null falls back to mapper placeholders. */
  companyConfig?: unknown;
  /** Customer records used for enrichment; pass at least the owning customer. */
  customers?: unknown[];
}

export async function renderOfficialDocumentPdf(
  input: RenderOfficialDocumentInput
): Promise<Buffer> {
  const { type, rawData } = input;
  if (!type || !rawData) {
    throw new Error('renderOfficialDocumentPdf: type and rawData are required');
  }

  // 1. Validate BEFORE mapping (mirrors useDocumentPreview).
  const rawValidation = validateDocumentData(type as any, rawData);
  if (!rawValidation.valid) {
    throw new Error(`Document data is invalid: ${rawValidation.error || 'validation failed'}`);
  }

  // 2. Enrich with customer data when available (best-effort, same as staff UI).
  let enrichedData = enrichDocumentCustomerData(rawData, (input.customers || []) as any);

  // 3. Canonical mapping into the PrimeDocument data contract.
  const mappedData = mapToInvoiceData(enrichedData, input.companyConfig as any, type as any);

  // 4. Security layer (QR/fingerprint), identical to staff-generated copies.
  const securedData = await attachDocumentSecurity(mappedData as any, (input.companyConfig as any)?.companyName);

  // 5. Render with the SAME React-PDF template.
  await initializePrimePdfFonts();
  const blob = await pdf(
    createElement(PrimeDocument as any, {
      type,
      data: securedData,
      customers: (input.customers || []) as any,
    }) as any
  ).toBlob();

  const buffer = Buffer.from(await blob.arrayBuffer());
  if (!buffer || buffer.length === 0) {
    throw new Error('Renderer produced an empty PDF');
  }
  return buffer;
}

export default renderOfficialDocumentPdf;
