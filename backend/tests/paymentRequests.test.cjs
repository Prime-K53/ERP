/**
 * paymentRequestService unit tests — hermetic (repo / workflowEngine /
 * portalLifecycleService are mocked; no Supabase, no network, no writes).
 *
 * Focus areas per the implementation spec:
 *   - CREATE: CUST-0001 → INV-0024 (outstanding K11,000, method Bank
 *     Transfer, status requested)
 *   - ACCOUNTING SAFETY: request creation only ever writes `payment_requests`
 *     rows — never invoices / customer_payments / payment_allocations
 *   - INVOICE OWNERSHIP: cross-customer invoices are rejected
 *   - DUPLICATE PROTECTION: one active request per invoice; new requests
 *     allowed after rejected/cancelled
 *   - CUSTOMER ISOLATION: customer-scoped list + JS ownership check on detail
 *   - ADMIN REVIEW: lifecycle transitions + reviewer stamping
 */

jest.mock('../services/supabaseRepository.cjs', () => ({
  getById: jest.fn(),
  getAll: jest.fn(),
  upsert: jest.fn(),
}));

jest.mock('../services/workflowEngine.cjs', () => ({
  nextYearScopedNumber: jest.fn().mockResolvedValue('PAYREQ-2026-000001'),
}));

jest.mock('../services/portalLifecycleService.cjs', () => ({
  publishErpEvent: jest.fn().mockResolvedValue({ published: true }),
}));

const repo = require('../services/supabaseRepository.cjs');
const workflowEngine = require('../services/workflowEngine.cjs');
const service = require('../services/paymentRequestService.cjs');

const INV_0024 = {
  id: 'INV-0024',
  customerId: 'CUST-0001',
  customerName: 'Acme LTD',
  invoiceNumber: 'INV-0024',
  totalAmount: 21000,
  paidAmount: 10000,
  status: 'Partial',
};

describe('paymentRequestService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    workflowEngine.nextYearScopedNumber.mockResolvedValue('PAYREQ-2026-000001');
    repo.getById.mockImplementation(async (table, id) => {
      if (table === 'invoices' && id === 'INV-0024') return { ...INV_0024 };
      if (table === 'payment_requests' && id === 'req-1') {
        return { id: 'req-1', request_number: 'PAYREQ-2026-000001', customer_id: 'CUST-0001', invoice_id: 'INV-0024', status: 'requested', requested_amount: 11000 };
      }
      if (table === 'payment_requests' && id === 'req-review') {
        return { id: 'req-review', request_number: 'PAYREQ-2026-000002', customer_id: 'CUST-0001', invoice_id: 'INV-0024', status: 'requested', requested_amount: 11000 };
      }
      return null;
    });
    repo.getAll.mockResolvedValue([]);
    repo.upsert.mockResolvedValue({ id: 'new-id' });
  });

  describe('CREATE', () => {
    it('creates a request defaulting to the outstanding balance (K11,000)', async () => {
      const record = await service.createRequest({
        customerId: 'CUST-0001',
        customerName: 'Acme LTD',
        invoiceId: 'INV-0024',
        portalUserId: 'pusr_1',
      });

      expect(record.customer_id).toBe('CUST-0001');
      expect(record.customer_name).toBe('Acme LTD');
      expect(record.invoice_id).toBe('INV-0024');
      expect(record.invoice_number).toBe('INV-0024');
      expect(record.requested_amount).toBe(11000);
      expect(record.payment_method).toBe('Bank Transfer');
      expect(record.status).toBe('requested');
      expect(record.requested_at).toBeTruthy();
      expect(workflowEngine.nextYearScopedNumber).toHaveBeenCalledWith(
        'payment_requests', 'request_number', 'PAYREQ'
      );
    });

    it('accepts an explicit requested amount', async () => {
      const record = await service.createRequest({
        customerId: 'CUST-0001',
        customerName: 'Acme LTD',
        invoiceId: 'INV-0024',
        requestedAmount: 5000,
      });
      expect(record.requested_amount).toBe(5000);
    });

    it('rejects an amount above the outstanding balance', async () => {
      await expect(service.createRequest({
        customerId: 'CUST-0001', customerName: 'Acme LTD',
        invoiceId: 'INV-0024', requestedAmount: 12000,
      })).rejects.toThrow(/exceeds the outstanding balance/);
    });

    it('rejects a non-positive or non-numeric amount', async () => {
      await expect(service.createRequest({
        customerId: 'CUST-0001', customerName: 'Acme LTD',
        invoiceId: 'INV-0024', requestedAmount: 0,
      })).rejects.toThrow(/positive number/);
      await expect(service.createRequest({
        customerId: 'CUST-0001', customerName: 'Acme LTD',
        invoiceId: 'INV-0024', requestedAmount: 'abc',
      })).rejects.toThrow(/positive number/);
    });
  });

  describe('ACCOUNTING SAFETY', () => {
    it('only writes payment_requests rows — never invoices/payments/allocations', async () => {
      await service.createRequest({
        customerId: 'CUST-0001', customerName: 'Acme LTD',
        invoiceId: 'INV-0024', note: 'Paying by bank',
      });

      expect(repo.upsert).toHaveBeenCalledTimes(1);
      expect(repo.upsert).toHaveBeenCalledWith('payment_requests', expect.any(Object));
      const tablesWritten = repo.upsert.mock.calls.map((c) => c[0]);
      expect(tablesWritten).toEqual(['payment_requests']);
      expect(tablesWritten).not.toContain('invoices');
      expect(tablesWritten).not.toContain('customer_payments');
      expect(tablesWritten).not.toContain('payment_allocations');
      expect(tablesWritten).not.toContain('ledger_entries');
    });

    it('never calls Stripe / payment-intent helpers (no API usage in the service)', async () => {
      const source = require('fs').readFileSync(require.resolve('../services/paymentRequestService.cjs'), 'utf8');
      // Actual API usage would appear as property/method calls on a Stripe SDK
      // object or require('stripe') — comments only explain the firewall.
      expect(source).not.toMatch(/require\s*\(\s*['"]stripe['"]\s*\)/i);
      expect(source).not.toMatch(/stripe\.paymentIntents|stripe\.checkout|\.paymentIntents\.create/i);
    });
  });

  describe('INVOICE OWNERSHIP', () => {
    it('rejects a request for an invoice that does not belong to the customer', async () => {
      repo.getById.mockImplementation(async (table, id) => {
        if (table === 'invoices' && id === 'INV-0024') {
          return { ...INV_0024, customerId: 'CUST-0007' };
        }
        return null;
      });
      await expect(service.createRequest({
        customerId: 'CUST-0001', customerName: 'Acme LTD', invoiceId: 'INV-0024',
      })).rejects.toThrow(/Invoice not found/);
      expect(repo.upsert).not.toHaveBeenCalled();
    });

    it('rejects when the invoice does not exist', async () => {
      await expect(service.createRequest({
        customerId: 'CUST-0001', customerName: 'Acme LTD', invoiceId: 'INV-9999',
      })).rejects.toThrow(/Invoice not found/);
      expect(repo.upsert).not.toHaveBeenCalled();
    });
  });

  describe('DUPLICATE PROTECTION', () => {
    it('blocks a second active request for the same invoice', async () => {
      repo.getAll.mockResolvedValue([
        { id: 'existing-1', invoice_id: 'INV-0024', status: 'requested' },
      ]);
      await expect(service.createRequest({
        customerId: 'CUST-0001', customerName: 'Acme LTD', invoiceId: 'INV-0024',
      })).rejects.toThrow(/already exists/);
      expect(repo.upsert).not.toHaveBeenCalled();
    });

    it('allows a new request after the previous one was rejected', async () => {
      repo.getAll.mockResolvedValue([
        { id: 'old-1', invoice_id: 'INV-0024', status: 'rejected' },
      ]);
      const record = await service.createRequest({
        customerId: 'CUST-0001', customerName: 'Acme LTD', invoiceId: 'INV-0024',
      });
      expect(record.status).toBe('requested');
    });
  });

  describe('CUSTOMER ISOLATION', () => {
    it('lists only the authenticated customer\'s requests', async () => {
      repo.getAll.mockResolvedValue([
        { id: 'a', customer_id: 'CUST-0001', requested_at: '2026-08-15T00:00:00Z' },
        { id: 'b', customer_id: 'CUST-0007', requested_at: '2026-08-16T00:00:00Z' },
      ]);
      const rows = await service.getRequestsForCustomer('CUST-0001');
      expect(rows).toHaveLength(1);
      expect(rows[0].id).toBe('a');
      // The PostgREST scope filter must be the customer_id key.
      expect(repo.getAll).toHaveBeenCalledWith(
        'payment_requests', { 'data->>customer_id': 'eq.CUST-0001' }
      );
    });

    it('returns null on detail when the customer does not own the request', async () => {
      const row = await service.getRequestById('req-1', 'CUST-0007');
      expect(row).toBeNull();
      const owned = await service.getRequestById('req-1', 'CUST-0001');
      expect(owned).not.toBeNull();
      expect(owned.id).toBe('req-1');
    });
  });

  describe('ADMIN LIST + REVIEW', () => {
    it('lists all requests sorted newest-first', async () => {
      repo.getAll.mockResolvedValue([
        { id: 'old', requested_at: '2026-08-10T00:00:00Z' },
        { id: 'new', requested_at: '2026-08-15T00:00:00Z' },
      ]);
      const rows = await service.listRequests({});
      expect(rows.map((r) => r.id)).toEqual(['new', 'old']);
    });

    it('filters the admin list by status', async () => {
      await service.listRequests({ status: 'requested' });
      expect(repo.getAll).toHaveBeenCalledWith('payment_requests', { 'data->>status': 'eq.requested' });
    });

    it('reviews requested → confirmed and stamps reviewer + time', async () => {
      const updated = await service.reviewRequest('req-review', {
        status: 'confirmed',
        adminNotes: 'Bank receipt verified',
        reviewedBy: 'staff-42',
      });
      expect(updated.status).toBe('confirmed');
      expect(updated.reviewed_by).toBe('staff-42');
      expect(updated.reviewed_at).toBeTruthy();
      expect(updated.admin_notes).toBe('Bank receipt verified');
      expect(repo.upsert).toHaveBeenCalledWith('payment_requests', expect.objectContaining({
        id: 'req-review', status: 'confirmed', reviewed_by: 'staff-42',
      }));
    });

    it('allows requested → under_review → confirmed', async () => {
      repo.getById.mockImplementation(async (table, id) => {
        if (table === 'payment_requests' && id === 'req-flow') {
          return { id: 'req-flow', customer_id: 'CUST-0001', status: 'under_review', requested_amount: 11000 };
        }
        return null;
      });
      const updated = await service.reviewRequest('req-flow', { status: 'confirmed', reviewedBy: 'staff-1' });
      expect(updated.status).toBe('confirmed');
    });

    it('rejects invalid lifecycle transitions', async () => {
      await expect(service.reviewRequest('req-review', {
        status: 'confirmed', reviewedBy: 'staff-1',
      })).resolves.toMatchObject({ status: 'confirmed' });
      // From confirmed, no further transitions are allowed.
      repo.getById.mockImplementation(async (table, id) => {
        if (table === 'payment_requests' && id === 'req-review') {
          return { id: 'req-review', customer_id: 'CUST-0001', status: 'confirmed', requested_amount: 11000 };
        }
        return null;
      });
      await expect(service.reviewRequest('req-review', {
        status: 'under_review', reviewedBy: 'staff-1',
      })).rejects.toThrow(/Invalid payment request transition/);
    });

    it('does not record a payment during confirmation (no payment tables written)', async () => {
      await service.reviewRequest('req-review', { status: 'confirmed', reviewedBy: 'staff-1' });
      const tablesWritten = repo.upsert.mock.calls.map((c) => c[0]);
      expect(tablesWritten).toEqual(['payment_requests']);
      expect(tablesWritten).not.toContain('customer_payments');
      expect(tablesWritten).not.toContain('payment_allocations');
    });
  });

  describe('PORTAL DTO', () => {
    it('maps stored rows to the customer-facing camelCase shape', () => {
      const dto = service.toPortalDto({
        id: 'payreq_x',
        request_number: 'PAYREQ-2026-000001',
        customer_id: 'CUST-0001',
        customer_name: 'Acme LTD',
        invoice_id: 'INV-0024',
        invoice_number: 'INV-0024',
        requested_amount: 11000,
        payment_method: 'Bank Transfer',
        status: 'requested',
        requested_at: '2026-08-15T00:00:00.000Z',
        note: 'Will pay Monday',
      });
      expect(dto).toEqual({
        id: 'payreq_x',
        requestNumber: 'PAYREQ-2026-000001',
        customerId: 'CUST-0001',
        customerName: 'Acme LTD',
        invoiceId: 'INV-0024',
        invoiceNumber: 'INV-0024',
        requestedAmount: 11000,
        paymentMethod: 'Bank Transfer',
        status: 'requested',
        note: 'Will pay Monday',
        requestedAt: '2026-08-15T00:00:00.000Z',
        reviewedBy: null,
        reviewedAt: null,
        adminNotes: null,
        linkedPaymentId: null,
        createdAt: null,
      });
    });
  });
});
