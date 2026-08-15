import { describe, expect, it } from 'vitest';
import { attachDocumentSecurity, buildSecurityQrPayload } from '../../utils/documentSecurity';

describe('documentSecurity', () => {
  describe('attachDocumentSecurity', () => {
    it('should attach security payload and QR image data for PDF rendering', async () => {
      const invoiceData = {
        invoiceNumber: 'INV-001',
        date: '2026-05-06',
        customerName: 'John Doe',
        totalAmount: 1000,
        items: [{ desc: 'Item 1', qty: 1, price: 1000, total: 1000 }],
        subtotal: 1000,
        amountPaid: 1000,
      };

      // This should NOT throw even in offline environments
      const result = await attachDocumentSecurity(invoiceData, 'Test Company');

      expect(result).toBeDefined();
      expect(result.invoiceNumber).toBe('INV-001');
      expect(result.securityQrPayload).toBeDefined();
      expect(typeof result.securityQrPayload).toBe('string');
      expect(result.securityQrPayload).toContain('Test Company');
      expect(result.securityQrPayload).toContain('INV-001');
      expect(result.securityQrCodeDataUrl).toContain('data:image/');
    });

    it('should work with various document types', async () => {
      const receiptData = {
        receiptNumber: 'REC-001',
        date: '2026-05-06',
        customerName: 'Jane Doe',
        amountReceived: 500,
        paymentMethod: 'Cash',
      };

      const result = await attachDocumentSecurity(receiptData);

      expect(result.securityQrPayload).toBeDefined();
      expect(result.securityQrPayload).toContain('REC-001');
      expect(result.securityQrCodeDataUrl).toContain('data:image/');
    });

    it('should handle missing company config gracefully', async () => {
      const data = {
        number: 'DOC-001',
        date: new Date().toISOString(),
      };

      const result = await attachDocumentSecurity(data);

      expect(result.securityQrPayload).toBeDefined();
      expect(result.securityQrPayload).toContain('DOC-001');
      expect(result.securityQrCodeDataUrl).toContain('data:image/');
    });
  });

  describe('buildSecurityQrPayload', () => {
    it('should build correct payload string', () => {
      const data = {
        invoiceNumber: 'INV-123',
        date: '2026-05-06T10:00:00Z',
        createdByName: 'Admin User',
      };

      const payload = buildSecurityQrPayload(data, 'Prime ERP');

      expect(payload).toContain('Prime ERP');
      expect(payload).toContain('INV-123');
      expect(payload).toContain('Admin User');
    });
  });
});
