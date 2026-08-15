import { describe, expect, it } from 'vitest';
import { mapToInvoiceData } from '../../utils/pdfMapper';
import type { FinancialDoc } from '../../views/shared/components/PDF/schemas';

describe('mapToInvoiceData customer contact mapping', () => {
  it('falls back to billing address and preserves creator metadata for financial documents', () => {
    const mapped = mapToInvoiceData(
      {
        id: 'QTN-101',
        date: '2026-04-05T08:30:00.000Z',
        customerName: 'Prime School',
        billingAddress: 'Area 3, Lilongwe',
        customerPhone: '0999 123 456',
        createdBy: 'Jane Admin',
        items: [
          { name: 'Exam Booklet', quantity: 10, price: 50, total: 500 }
        ],
        totalAmount: 500
      },
      { currencySymbol: 'MWK' },
      'QUOTATION'
    ) as FinancialDoc;

    expect(mapped.address).toBe('Area 3, Lilongwe');
    expect(mapped.phone).toBe('0999 123 456');
    expect(mapped.createdByName).toBe('Jane Admin');
    expect(mapped.createdAtIso).toContain('2026-04-05');
  });
});

