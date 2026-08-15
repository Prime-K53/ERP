import { describe, expect, it, vi, afterEach } from 'vitest';
import { transactionService } from '../../services/transactionService';
import { dbService } from '../../services/db';
import type { DeliveryNote, Shipment } from '../../types';

const createBaseDeliveryNote = (): DeliveryNote => ({
  id: 'DN-100',
  invoiceId: 'INV-100',
  date: '2026-02-20T10:00:00.000Z',
  customerName: 'Acme Ltd',
  shippingAddress: 'Lilongwe',
  items: [],
  status: 'Pending'
});

const createBaseShipment = (): Shipment => ({
  id: 'SHP-100',
  orderId: 'DN-100',
  customerName: 'Acme Ltd',
  carrier: 'Own Delivery',
  trackingNumber: 'TRK-ABC123',
  weight: 1,
  weightUnit: 'kg',
  dimensions: { l: 1, w: 1, h: 1 },
  status: 'In Transit',
  shippingCost: 20
});

const createAtomicHarness = (seed: { shipments?: Shipment[]; deliveryNotes?: DeliveryNote[] } = {}) => {
  const shipmentMap = new Map((seed.shipments || []).map((item) => [item.id, item]));
  const deliveryNoteMap = new Map((seed.deliveryNotes || []).map((item) => [item.id, item]));

  const shipmentStore = {
    get: vi.fn(async (id: string) => shipmentMap.get(id)),
    put: vi.fn(async (item: Shipment) => {
      shipmentMap.set(item.id, item);
    }),
    getAll: vi.fn(async () => Array.from(shipmentMap.values()))
  };

  const deliveryNoteStore = {
    get: vi.fn(async (id: string) => deliveryNoteMap.get(id)),
    put: vi.fn(async (item: DeliveryNote) => {
      deliveryNoteMap.set(item.id, item);
    }),
    getAll: vi.fn(async () => Array.from(deliveryNoteMap.values()))
  };

  const tx = {
    objectStore: (store: 'shipments' | 'deliveryNotes') => {
      if (store === 'shipments') return shipmentStore;
      return deliveryNoteStore;
    }
  };

  return {
    tx,
    shipmentMap,
    deliveryNoteMap
  };
};

describe('transactionService.updateShipmentStatus', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('persists shipment and updates linked delivery note to in transit', async () => {
    const harness = createAtomicHarness({
      deliveryNotes: [createBaseDeliveryNote()]
    });

    vi.spyOn(dbService, 'executeAtomicOperation').mockImplementation(async (_stores, operation: any) => {
      return operation(harness.tx);
    });

    const shipment = {
      ...createBaseShipment(),
      driverName: 'Moffat',
      vehicleNo: 'ZA 1234'
    };

    await transactionService.updateShipmentStatus(shipment);

    const savedShipment = harness.shipmentMap.get(shipment.id);
    const savedDeliveryNote = harness.deliveryNoteMap.get('DN-100');

    expect(savedShipment?.status).toBe('In Transit');
    expect(savedDeliveryNote?.status).toBe('In Transit');
    expect(savedDeliveryNote?.driverName).toBe('Moffat');
    expect(savedDeliveryNote?.vehicleNo).toBe('ZA 1234');
    expect(savedDeliveryNote?.trackingNumber).toBe('TRK-ABC123');
  });

  it('normalizes and syncs proof-of-delivery signature data to delivery note', async () => {
    const harness = createAtomicHarness({
      deliveryNotes: [createBaseDeliveryNote()]
    });

    vi.spyOn(dbService, 'executeAtomicOperation').mockImplementation(async (_stores, operation: any) => {
      return operation(harness.tx);
    });

    const shipment: Shipment = {
      ...createBaseShipment(),
      status: 'Delivered',
      proofOfDelivery: {
        receivedBy: 'John Receiver',
        timestamp: '2026-02-21T11:30:00.000Z',
        signature: 'data:image/png;base64,AAA111',
        notes: 'Delivered to front desk'
      }
    };

    await transactionService.updateShipmentStatus(shipment);

    const savedDeliveryNote = harness.deliveryNoteMap.get('DN-100');
    const savedShipment = harness.shipmentMap.get('SHP-100');

    expect(savedShipment?.proofOfDelivery && savedShipment.proofOfDelivery.signatureDataUrl).toBe('data:image/png;base64,AAA111');
    expect(savedDeliveryNote?.status).toBe('Delivered');
    expect(savedDeliveryNote?.proofOfDelivery && savedDeliveryNote.proofOfDelivery.signatureDataUrl).toBe('data:image/png;base64,AAA111');
    expect(savedDeliveryNote?.proofOfDelivery && savedDeliveryNote.proofOfDelivery.signatureInputMode).toBe('Upload');
  });
});

describe('transactionService.reconcileLegacyShipmentProofToDeliveryNotes', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('backfills missing delivery-note proof from legacy delivered shipment proof', async () => {
    const deliveredShipment: Shipment = {
      ...createBaseShipment(),
      status: 'Delivered',
      proofOfDelivery: {
        receivedBy: 'Jane Receiver',
        timestamp: '2026-02-22T14:20:00.000Z',
        signature: 'data:image/png;base64,LEGACY',
        remarks: 'Legacy signature'
      }
    };

    const harness = createAtomicHarness({
      shipments: [deliveredShipment],
      deliveryNotes: [createBaseDeliveryNote()]
    });

    vi.spyOn(dbService, 'executeAtomicOperation').mockImplementation(async (_stores, operation: any) => {
      return operation(harness.tx);
    });

    const result = await transactionService.reconcileLegacyShipmentProofToDeliveryNotes();
    const savedDeliveryNote = harness.deliveryNoteMap.get('DN-100');

    expect(result.updatedCount).toBe(1);
    expect(savedDeliveryNote?.status).toBe('Delivered');
    expect(savedDeliveryNote?.proofOfDelivery && savedDeliveryNote.proofOfDelivery.signatureDataUrl).toBe('data:image/png;base64,LEGACY');
  });
});
