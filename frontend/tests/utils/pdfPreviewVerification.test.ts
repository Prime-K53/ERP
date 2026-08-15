import { describe, expect, it, vi, beforeEach } from 'vitest';
import { attachDocumentSecurity } from '../../utils/documentSecurity';
import { generatePreviewPdfBlob } from '../../views/shared/components/PDF/PreviewModal';
import { ReceiptSchema, PosReceiptSchema, StatementSchema } from '../../views/shared/components/PDF/schemas';

// Mock react-pdf to avoid actual PDF generation
vi.mock('@react-pdf/renderer', () => ({
  pdf: vi.fn(() => ({
    toBlob: vi.fn(() => new Blob(['mock'], { type: 'application/pdf' })),
  })),
  Document: vi.fn(({ children }) => children),
  Page: vi.fn(({ children }) => children),
  View: vi.fn(({ children }) => children),
  Text: vi.fn(({ children }) => children),
  Font: {
    registerHyphenationCallback: vi.fn(),
  },
}));

// Mock the PrimeDocument component
vi.mock('../../views/shared/components/PDF/PrimeDocument', () => ({
  default: vi.fn(),
}));

describe('PDF Preview Verification', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Mock localStorage
    Storage.prototype.getItem = vi.fn(() => JSON.stringify({
      companyName: 'Test Company',
      invoiceTemplates: { fontFamily: 'Helvetica' },
    }));
  });

  it('should generate receipt preview without offline errors', async () => {
    const receiptData = {
      receiptNumber: 'REC-001',
      date: new Date().toLocaleDateString('en-GB'),
      customerName: 'John Doe',
      amountReceived: 1000,
      amountApplied: 1000,
      changeGiven: 0,
      paymentMethod: 'Cash',
      appliedInvoices: ['INV-001'],
      currentBalance: 0,
      calculationVersion: 1,
    };

    // Validate with schema
    const parsed = ReceiptSchema.safeParse(receiptData);
    expect(parsed.success).toBe(true);

    if (parsed.success) {
      // Attach security (should NOT throw in offline mode)
      const secured = await attachDocumentSecurity(parsed.data, 'Test Company');
      
      expect(secured.securityQrPayload).toBeDefined();
      expect(secured.securityQrCodeDataUrl).toContain('data:image/');
      
      // Verify the payload contains expected data
      expect(secured.securityQrPayload).toContain('Test Company');
      expect(secured.securityQrPayload).toContain('REC-001');
    }
  });

  it('should generate POS receipt preview without offline errors', async () => {
    const posData = {
      receiptNumber: 'POS-001',
      date: new Date().toLocaleDateString('en-GB'),
      cashierName: 'Cashier 1',
      customerName: 'Walk-in Customer',
      items: [
        { desc: 'Item 1', qty: 1, price: 500, total: 500 },
        { desc: 'Item 2', qty: 2, price: 250, total: 500 },
      ],
      subtotal: 1000,
      discount: 0,
      tax: 0,
      totalAmount: 1000,
      paymentMethod: 'Cash',
      amountTendered: 1000,
      changeGiven: 0,
      footerMessage: 'Thank you!',
    };

    const parsed = PosReceiptSchema.safeParse(posData);
    expect(parsed.success).toBe(true);

    if (parsed.success) {
      const secured = await attachDocumentSecurity(parsed.data, 'Test Company');
      
      expect(secured.securityQrPayload).toBeDefined();
      expect(secured.securityQrCodeDataUrl).toContain('data:image/');
    }
  });

  it('should generate statement preview without offline errors', async () => {
    const statementData = {
      date: new Date().toLocaleDateString('en-GB'),
      customerName: 'Jane Doe',
      startDate: '2026-01-01',
      endDate: '2026-05-06',
      currency: 'MWK',
      openingBalance: 0,
      transactions: [
        {
          date: '2026-05-01',
          reference: 'INV-001',
          debit: 1000,
          credit: 0,
          runningBalance: 1000,
        },
        {
          date: '2026-05-06',
          reference: 'PAY-001',
          debit: 0,
          credit: 1000,
          runningBalance: 0,
        },
      ],
      totalInvoiced: 1000,
      totalReceived: 1000,
      finalBalance: 0,
    };

    const parsed = StatementSchema.safeParse(statementData);
    expect(parsed.success).toBe(true);

    if (parsed.success) {
      const secured = await attachDocumentSecurity(parsed.data, 'Test Company');
      
      expect(secured.securityQrPayload).toBeDefined();
      expect(secured.securityQrCodeDataUrl).toContain('data:image/');
    }
  });

  it('generates QR image data during document security attachment', async () => {
    // Import qrcode to mock it
    const QRCode = await import('qrcode');
    const toDataURLSpy = vi.spyOn(QRCode.default, 'toDataURL');
    
    const data = {
      receiptNumber: 'TEST-001',
      date: new Date().toLocaleDateString('en-GB'),
      customerName: 'Test Customer',
      amountReceived: 100,
      paymentMethod: 'Cash',
    };

    await attachDocumentSecurity(data, 'Test Company');

    expect(toDataURLSpy).toHaveBeenCalled();
  });
});
