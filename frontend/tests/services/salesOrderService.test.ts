import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('../../services/db', () => ({
  dbService: {
    get: vi.fn(),
    getAll: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock('../../utils/helpers', () => ({
  generateNextId: vi.fn((prefix: string) => `${prefix}-NEXT`),
}));

import { dbService } from '../../services/db';
import {
  canonicalizeOrder,
  canTransition,
  assertCanTransition,
  validateOrder,
  normalizeTotals,
  buildInvoiceFromOrder,
  assertTenantSafe,
  adoptQuotationRequestAsSalesOrder,
  migrateLegacyOrders,
  isOfficialNumber,
  generateProvisionalOrderId,
  salesOrderService,
} from '../../services/salesOrderService';

const baseOrder = (overrides: Record<string, unknown> = {}) => ({
  id: 'so_1',
  customerName: 'Acme',
  orderDate: '2026-08-18T09:00:00.000Z',
  items: [
    { id: 'i1', productId: 'p1', description: 'Flyers', quantity: 2, unitPrice: 100, lineTotal: 200 },
  ],
  total: 200,
  ...overrides,
});

describe('canonicalizeOrder', () => {
  it('translates legacy statuses into the canonical vocabulary', () => {
    expect(canonicalizeOrder(baseOrder({ status: 'Pending' })).status).toBe('Confirmed');
    expect(canonicalizeOrder(baseOrder({ status: 'Completed' })).status).toBe('Fulfilled');
    expect(canonicalizeOrder(baseOrder({ status: 'Paid' })).status).toBe('Confirmed');
  });

  it('derives paymentStatus from legacy payment-state statuses', () => {
    expect(canonicalizeOrder(baseOrder({ status: 'Paid' })).paymentStatus).toBe('Paid');
    expect(canonicalizeOrder(baseOrder({ status: 'Partially Paid' })).paymentStatus).toBe('Partially Paid');
  });

  it('prefers the server-minted order_number over a provisional orderNumber', () => {
    const canonical = canonicalizeOrder(
      baseOrder({ orderNumber: 'SO-ORD-provisional', orderNumberProvisional: true, order_number: 'SO-2026-000042' }),
    );
    expect(canonical.orderNumber).toBe('SO-2026-000042');
    expect(canonical.orderNumberProvisional).toBe(false);
  });

  it('flags a missing/unofficial number as provisional', () => {
    expect(canonicalizeOrder(baseOrder({ orderNumber: 'ORD-123' })).orderNumberProvisional).toBe(true);
    expect(canonicalizeOrder(baseOrder({})).orderNumberProvisional).toBe(true);
  });

  it('keeps an official orderNumber and does not flag it provisional', () => {
    const canonical = canonicalizeOrder(baseOrder({ orderNumber: 'SO-2026-000001' }));
    expect(canonical.orderNumber).toBe('SO-2026-000001');
    expect(canonical.orderNumberProvisional).toBe(false);
  });

  it('normalizes totals (totalAmount alias, remainingBalance)', () => {
    const canonical = canonicalizeOrder(baseOrder({ total: 200, paidAmount: 50 }));
    expect(canonical.totalAmount).toBe(200);
    expect(canonical.remainingBalance).toBe(150);
  });
});

describe('transition rules', () => {
  it('allows canonical transitions', () => {
    expect(canTransition('Draft', 'Confirmed')).toBe(true);
    expect(canTransition('Draft', 'Cancelled')).toBe(true);
    expect(canTransition('Confirmed', 'Processing')).toBe(true);
    expect(canTransition('Confirmed', 'Fulfilled')).toBe(true);
    expect(canTransition('Confirmed', 'Converted')).toBe(true);
    expect(canTransition('Processing', 'Fulfilled')).toBe(true);
  });

  it('rejects terminal transitions', () => {
    expect(canTransition('Fulfilled', 'Confirmed')).toBe(false);
    expect(canTransition('Cancelled', 'Confirmed')).toBe(false);
    expect(canTransition('Converted', 'Fulfilled')).toBe(false);
    expect(() => assertCanTransition('Fulfilled', 'Confirmed')).toThrow(/Invalid sales order transition/);
  });

  it('accepts legacy aliases at the boundary', () => {
    expect(canTransition('Pending', 'Completed')).toBe(true);
    expect(canTransition('Pending', 'Converted')).toBe(true);
  });
});

describe('validateOrder / normalizeTotals', () => {
  it('rejects orders without id, items, or total', () => {
    expect(validateOrder({ id: 'x', items: [], total: 0 } as any)).toContain('Order must contain at least one item');
    expect(validateOrder({ items: [{}], total: 5 } as any)).toContain('Order id is required');
    expect(validateOrder(baseOrder() as any)).toEqual([]);
  });

  it('computes subtotal and line totals', () => {
    const order = normalizeTotals({
      id: 'so_1',
      customerName: 'Acme',
      orderDate: '2026-08-18T09:00:00.000Z',
      items: [
        { id: 'i1', productId: 'p1', quantity: 2, unitPrice: 100 },
        { id: 'i2', productId: 'p2', quantity: 1, unitPrice: 50 },
      ],
    } as any);
    expect(order.subtotal).toBe(250);
    expect(order.total).toBe(250);
  });
});

describe('buildInvoiceFromOrder', () => {
  it('produces an invoice draft carrying conversion details and source order id', () => {
    const draft = buildInvoiceFromOrder(baseOrder({ orderNumber: 'SO-2026-000005' }), {
      user: { name: 'Alice' },
    });
    expect(draft.sourceOrderId).toBe('so_1');
    expect(draft.conversionDetails.sourceType).toBe('order');
    expect(draft.conversionDetails.sourceNumber).toBe('SO-2026-000005');
    expect(draft.conversionDetails.acceptedBy).toBe('Alice');
    expect(draft.items[0].price).toBe(100);
    expect(draft.totalAmount).toBe(200);
  });
});

describe('tenant safety', () => {
  it('throws when the order belongs to another tenant', () => {
    expect(() => assertTenantSafe(baseOrder({ companyId: 'company_b' }) as any, { id: 'company_a' }))
      .toThrow(/another tenant/);
    expect(() => assertTenantSafe(baseOrder({ companyId: 'company_a' }) as any, { id: 'company_a' }))
      .not.toThrow();
    expect(() => assertTenantSafe(baseOrder({ companyId: 'company_a' }) as any, undefined)).not.toThrow();
  });
});

describe('adoptQuotationRequestAsSalesOrder', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('persists locally, completes the request, and applies the official number', async () => {
    const persistLocal = vi.fn(async (order: any) => order);
    const completeOrder = vi.fn(async () => ({ id: 'so_official', orderNumber: 'SO-2026-000077' }));
    const updateLocal = vi.fn(async () => undefined);

    const result = await adoptQuotationRequestAsSalesOrder(
      { id: 'req_1', requestNumber: 'REQ-100' },
      baseOrder() as any,
      { persistLocal, completeOrder, updateLocal },
    );

    expect(result.success).toBe(true);
    expect(result.adopted).toBe(true);
    expect(result.order.id).toBe('so_official');
    expect(result.order.orderNumber).toBe('SO-2026-000077');
    expect(result.order.orderNumberProvisional).toBe(false);
    expect(completeOrder).toHaveBeenCalledWith('req_1', expect.objectContaining({ erpOrderId: 'so_1' }));
    expect(updateLocal).toHaveBeenCalledWith(expect.objectContaining({
      id: 'so_official',
      sourceRequestId: 'req_1',
      sourceRequestNumber: 'REQ-100',
      status: 'Confirmed',
    }));
  });

  it('reports failure without throwing when the backend does not return an order', async () => {
    const result = await adoptQuotationRequestAsSalesOrder(
      { id: 'req_2' },
      baseOrder() as any,
      {
        persistLocal: async (o: any) => o,
        completeOrder: async () => ({ error: 'boom' }),
        updateLocal: async () => undefined,
      },
    );
    expect(result.success).toBe(false);
    expect(result.error).toContain('Backend did not return');
  });

  it('reports failure and keeps the persisted draft when completion throws', async () => {
    const result = await adoptQuotationRequestAsSalesOrder(
      { id: 'req_3' },
      baseOrder() as any,
      {
        persistLocal: async (o: any) => o,
        completeOrder: async () => { throw new Error('network down'); },
        updateLocal: async () => undefined,
      },
    );
    expect(result.success).toBe(false);
    expect(result.order.id).toBe('so_1');
    expect(result.error).toContain('network down');
  });
});

describe('migrateLegacyOrders', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('migrates legacy rows, skipping duplicates and invalid rows', async () => {
    vi.mocked(dbService.getAll)
      .mockResolvedValueOnce([
        { id: 'leg_1', status: 'Pending', items: [{ id: 'i1', productId: 'p1', quantity: 1, unitPrice: 10 }], total: 10 },
        { id: 'leg_2', status: 'Paid', items: [{ id: 'i2', productId: 'p2', quantity: 1, unitPrice: 20 }], total: 20 },
        { id: 'leg_1' }, // duplicate id → skipped
        { status: 'Pending' }, // no id → invalid
      ])
      .mockResolvedValueOnce([
        { id: 'leg_2', status: 'Confirmed' }, // already canonical
      ])
      .mockResolvedValueOnce([
        { id: 'leg_1', status: 'Confirmed' },
        { id: 'leg_2', status: 'Confirmed' },
      ]);

    const report = await migrateLegacyOrders();

    expect(report.migrated).toBe(1);
    expect(report.duplicatesSkipped).toBe(2);
    expect(report.invalidSkipped).toBe(1);
    expect(report.canonicalCount).toBe(2);
    expect(dbService.put).toHaveBeenCalledTimes(1);
    const first = vi.mocked(dbService.put).mock.calls[0][1] as any;
    expect(first.id).toBe('leg_1');
    expect(first.status).toBe('Confirmed');
    expect(first.legacyStatus).toBe('Pending');
  });
});

describe('salesOrderService CRUD', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates canonical orders and rejects invalid ones', async () => {
    await salesOrderService.create(baseOrder() as any);
    expect(dbService.put).toHaveBeenCalledWith('salesOrders', expect.objectContaining({ id: 'so_1' }));

    await expect(salesOrderService.create({ id: 'bad', items: [], total: 0 } as any))
      .rejects.toThrow(/at least one item/);
  });

  it('records payments and accumulates paidAmount', async () => {
    vi.mocked(dbService.get).mockResolvedValue(baseOrder({ payments: [], paidAmount: 0 }) as any);
    await salesOrderService.recordPayment('so_1', {
      id: 'pay_1',
      orderId: 'so_1',
      amount: 80,
      method: 'Cash',
      date: '2026-08-18',
    } as any);
    const updated = vi.mocked(dbService.put).mock.calls[0][1] as any;
    expect(updated.payments).toHaveLength(1);
    expect(updated.paidAmount).toBe(80);
    expect(updated.paymentStatus).toBe('Partially Paid');
  });

  it('throws when recording a payment for a missing order', async () => {
    vi.mocked(dbService.get).mockResolvedValue(undefined);
    await expect(salesOrderService.recordPayment('nope', {} as any)).rejects.toThrow(/Order not found/);
  });
});

describe('number helpers', () => {
  it('recognizes official and provisional numbers', () => {
    expect(isOfficialNumber('SO-2026-000042')).toBe(true);
    expect(isOfficialNumber('SO/2026/000042')).toBe(true);
    expect(isOfficialNumber('ORD-123')).toBe(false);
    expect(isOfficialNumber(null)).toBe(false);
  });

  it('generateProvisionalOrderId delegates to the shared id generator', () => {
    expect(generateProvisionalOrderId([])).toBe('SO-NEXT');
  });
});