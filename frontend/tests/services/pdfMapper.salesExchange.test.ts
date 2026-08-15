import { describe, expect, it } from 'vitest';
import { mapToInvoiceData } from '../../utils/pdfMapper';
import type { SalesExchangeDoc } from '../../views/shared/components/PDF/schemas';

describe('pdfMapper sales exchange contact mapping', () => {
  it('preserves address and phone details for sales exchange documents', () => {
    const mapped = mapToInvoiceData(
      {
        id: 'SE-101',
        exchange_date: '2026-04-09T09:00:00.000Z',
        customer_name: 'Prime School',
        customer_address: 'Area 25, Lilongwe',
        customer_phone: '0888 222 111',
        invoice_id: 'INV-101',
        reason: 'Damaged cover',
        exchange_items: [
          {
            product_name: 'Exam Booklet',
            qty_returned: 5,
            qty_replaced: 5,
            price_difference: 0
          }
        ]
      },
      { currencySymbol: 'MWK' },
      'SALES_EXCHANGE'
    ) as SalesExchangeDoc;

    expect(mapped.address).toBe('Area 25, Lilongwe');
    expect(mapped.phone).toBe('0888 222 111');
    expect(mapped.customerName).toBe('Prime School');
  });
});
