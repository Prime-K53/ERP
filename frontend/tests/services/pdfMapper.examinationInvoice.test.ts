import { describe, expect, it } from 'vitest';
import { mapToInvoiceData } from '../../utils/pdfMapper';
import type { ExaminationInvoiceDoc } from '../../views/shared/components/PDF/schemas';

describe('pdfMapper examination invoice mapping', () => {
  it('infers conversion history and paid status for examination invoices', () => {
    const mapped = mapToInvoiceData(
      {
        id: 'EXM-INV-001',
        invoiceNumber: 'EXM-INV-001',
        origin_module: 'examination',
        origin_batch_id: 'BATCH-2026-001',
        customerId: 'CUST-001',
        customerName: 'Northview Academy',
        date: '2026-03-29T10:15:00.000Z',
        dueDate: '2026-04-15T00:00:00.000Z',
        totalAmount: 15000,
        paidAmount: 15000,
        status: 'Paid',
        items: [
          {
            id: 'EXM-LINE-1',
            name: 'Examination Service',
            quantity: 1,
            price: 15000,
            total: 15000
          }
        ]
      },
      { currencySymbol: 'K' },
      'EXAMINATION_INVOICE'
    ) as ExaminationInvoiceDoc;

    expect(mapped.status).toBe('Paid');
    expect(mapped.isConverted).toBe(true);
    expect(mapped.conversionDetails?.sourceType).toBe('Examination Batch');
    expect(mapped.conversionDetails?.sourceNumber).toBe('BATCH-2026-001');
    expect(mapped.conversionDetails?.acceptedBy).toBe('Northview Academy');
    expect(mapped.adjustmentSnapshots).toBeUndefined();
    expect(mapped.roundingDifference).toBe(0);
  });
});
