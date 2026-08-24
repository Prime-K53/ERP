/**
 * Portal PDF security layer — regression tests for the download-hang defect.
 *
 * Proves, against the REAL pdf-lib implementation (no mocks):
 *   1. securePortalPdf RESOLVES quickly (the hang was a stale server process,
 *      never this layer — pinned here so any future blocking regression in
 *      watermark/metadata/ViewerPreferences fails fast in CI)
 *   2. output still begins with %PDF- and loads via PDFDocument
 *   3. portal-origin metadata (Creator) is applied
 *   4. output differs from input (watermark bytes actually added)
 *   5. ERP-staff path (source 'erp') bypasses security entirely
 *
 * No accounting/business data is touched: everything is byte-level.
 */

process.env.JWT_SECRET = 'test-jwt-secret';

jest.setTimeout(30000);

const officialDocumentService = require('../services/officialDocumentService.cjs');
const {
  securePortalPdf,
  addWatermark,
  applyMetadata,
  WATERMARK_PRIMARY,
} = require('../services/portalPdfSecurity.cjs');
const { PDFDocument } = require('pdf-lib');

const INVOICE_FIXTURE = {
  id: 'INV-SEC-1',
  invoiceNumber: 'INV-SEC-001',
  customerId: 'CUST-0001',
  customerName: 'Security Probe Customer',
  date: '2026-08-24',
  dueDate: '2026-09-24',
  status: 'Unpaid',
  items: [
    { name: 'Lesson Plan (L)', quantity: 2, unitPrice: 7000, price: 7000 },
  ],
  totalAmount: 14000,
  paidAmount: 0,
};

describe('Portal PDF security layer resolves and applies provenance', () => {
  let rawBuffer;

  beforeAll(async () => {
    const { buffer } = await officialDocumentService.renderOfficialPdf({
      type: 'INVOICE',
      rawData: INVOICE_FIXTURE,
      customers: [],
      source: 'erp', // raw staff-equivalent bytes
    });
    rawBuffer = buffer;
  });

  it('renderer resolves with real %PDF- bytes (no hang)', async () => {
    expect(rawBuffer.slice(0, 5).toString('ascii')).toBe('%PDF-');
    expect(rawBuffer.length).toBeGreaterThan(1000);
  });

  it('securePortalPdf resolves well under the timeout ceiling', async () => {
    const started = Date.now();
    const secured = await securePortalPdf(rawBuffer);
    const elapsed = Date.now() - started;

    expect(elapsed).toBeLessThan(15000); // hang guard
    expect(secured.slice(0, 5).toString('ascii')).toBe('%PDF-');
    expect(secured.length).toBeGreaterThan(rawBuffer.length); // watermark added

    // Output must still load as a valid PDF document.
    const doc = await PDFDocument.load(secured, { ignoreEncryption: true });
    expect(doc.getPageCount()).toBeGreaterThanOrEqual(1);
    // Portal-origin metadata proves the security pass executed.
    expect(doc.getCreator()).toContain('Customer Portal');
  });

  it('watermark + metadata stages each resolve independently', async () => {
    const watermarked = await addWatermark(rawBuffer);
    expect(watermarked.length).toBeGreaterThan(rawBuffer.length);

    const withMeta = await applyMetadata(watermarked);
    const doc = await PDFDocument.load(withMeta, { ignoreEncryption: true });
    expect(doc.getCreator()).toContain('Customer Portal');
    expect(String(WATERMARK_PRIMARY)).toBe('PORTAL COPY');
  });

  it('ERP-staff source bypasses the security layer (unwatermarked)', async () => {
    const erpSide = await officialDocumentService.renderOfficialPdf({
      type: 'INVOICE',
      rawData: INVOICE_FIXTURE,
      customers: [],
      source: 'erp',
    });
    const portalSide = await officialDocumentService.renderOfficialPdf({
      type: 'INVOICE',
      rawData: INVOICE_FIXTURE,
      customers: [],
      source: 'portal',
    });

    // Same generator, but the portal copy carries extra watermark/metadata.
    expect(portalSide.buffer.length).toBeGreaterThan(erpSide.buffer.length);
    expect(portalSide.contentType).toBe('application/pdf');
  });
});
