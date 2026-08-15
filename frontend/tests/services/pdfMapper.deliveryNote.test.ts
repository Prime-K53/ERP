import { describe, expect, it } from 'vitest';
import { mapToInvoiceData } from '../../utils/pdfMapper';
import type { LogisticsDoc } from '../../views/shared/components/PDF/schemas';

describe('pdfMapper delivery note POD mapping', () => {
  it('maps proof-of-delivery fields including signature payload for delivery note documents', () => {
    const mapped = mapToInvoiceData(
      {
        id: 'DN-778',
        invoiceId: 'INV-778',
        date: '2026-02-22T09:30:00.000Z',
        customerName: 'Acme Stores',
        shippingAddress: 'Area 3',
        status: 'Delivered',
        driverName: 'Moffat',
        vehicleNo: 'ZA 1234',
        items: [{ name: 'A4 Paper', quantity: 5 }],
        proofOfDelivery: {
          receivedBy: 'John Receiver',
          recipientPhone: '+265991111111',
          timestamp: '2026-02-22T10:00:00.000Z',
          signatureDataUrl: 'data:image/png;base64,AAA',
          signatureInputMode: 'Upload',
          remarks: 'Delivered in good condition',
          locationStamp: { lat: -13.9626, lng: 33.7741 }
        }
      },
      { currencySymbol: 'K' },
      'DELIVERY_NOTE'
    ) as LogisticsDoc;

    expect(mapped.status).toBe('Delivered');
    expect(mapped.receivedBy).toBe('John Receiver');
    expect(mapped.signatureDataUrl).toBe('data:image/png;base64,AAA');
    expect(mapped.receivedAt).toBe('2026-02-22T10:00:00.000Z');
    expect(mapped.proofOfDelivery?.signatureInputMode).toBe('Upload');
    expect(mapped.proofOfDelivery?.recipientPhone).toBe('+265991111111');
    expect(mapped.conversionDetails?.locationStamp).toEqual({ lat: -13.9626, lng: 33.7741 });
  });
});
