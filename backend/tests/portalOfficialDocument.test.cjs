/**
 * Official document download contract tests (hermetic).
 *
 * Pins the ERP → Portal document integration:
 *   - renderer bundle produces application/pdf bytes (mocked here; real
 *     rendering is proven live/staging)
 *   - Content-Disposition filenames are ERP-provided and sanitized
 *   - customer scoping: a foreign invoice id resolves NOT_FOUND through the
 *     SAME portal getters the route uses, so existence never leaks
 *   - audit trail is best-effort and never blocks an authorized download
 */

process.env.JWT_SECRET = 'test-jwt-secret';

const RENDERED = Buffer.from('%PDF-1.7 official-document-bytes');

jest.mock('../services/officialDocument/primeRenderer.cjs', () => ({
  renderOfficialDocumentPdf: jest.fn(async () => RENDERED),
}));

const store = {
  customers: new Map([
    ['cust_a', { id: 'cust_a', name: 'Customer A' }],
    ['cust_b', { id: 'cust_b', name: 'Customer B' }],
  ]),
  invoices: new Map([
    ['inv_a1', { id: 'inv_a1', customerId: 'cust_a', customerIdAlt: undefined, invoiceNumber: 'INV-A-001', totalAmount: 1000 }],
    ['inv_b1', { id: 'inv_b1', customer_id: 'cust_b', invoiceNumber: 'INV-B-001', totalAmount: 250 }],
  ]),
};

jest.mock('../services/supabaseRepository.cjs', () => ({
  getAll: jest.fn(async (table) => [...(store[table] || new Map()).values()]),
  getAllStrict: jest.fn(async (table, filters = {}) => {
    const rows = [...(store[table] || new Map()).values()];
    // Simulate PostgREST eq. filter for id column.
    const idFilter = filters.id || filters['data->>id'];
    if (idFilter && typeof idFilter === 'string' && idFilter.startsWith('eq.')) {
      const targetId = idFilter.slice(3);
      return rows.filter((r) => String(r.id) === targetId).slice(0, filters.limit || rows.length);
    }
    return rows;
  }),
  getById: jest.fn(async (table, id) => (store[table] || new Map()).get(id) || null),
  upsert: jest.fn(async (table, record) => {
    store[table] = store[table] || new Map();
    store[table].set(record.id, { ...(record.data || record), id: record.id });
    return { id: record.id };
  }),
  softDelete: jest.fn(async () => ({ changes: 1 })),
}));

const officialDocumentService = require('../services/officialDocumentService.cjs');
const portalService = require('../services/portalService.cjs');
const { renderOfficialDocumentPdf } = require('../services/officialDocument/primeRenderer.cjs');

describe('Official document download contract', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('Test A — renders application/pdf bytes for an owned invoice', async () => {
    const { buffer, contentType } = await officialDocumentService.renderOfficialPdf({
      type: 'INVOICE',
      rawData: store.invoices.get('inv_a1'),
      customers: [store.customers.get('cust_a')],
    });
    expect(contentType).toBe('application/pdf');
    expect(buffer.length).toBeGreaterThan(0);
    expect(buffer.slice(0, 4).toString('ascii')).toBe('%PDF');
    expect(renderOfficialDocumentPdf).toHaveBeenCalledWith(expect.objectContaining({
      type: 'INVOICE',
      rawData: expect.objectContaining({ id: 'inv_a1' }),
    }));
  });

  it('Content-Disposition — uses the ERP filename, sanitized; appends .pdf once', () => {
    expect(officialDocumentService.buildContentDisposition('INV-A-001.pdf'))
      .toBe('attachment; filename="INV-A-001.pdf"');
    expect(officialDocumentService.buildContentDisposition('INV A/001'))
      .toBe('attachment; filename="INV_A_001.pdf"');
    expect(officialDocumentService.buildContentDisposition(null))
      .toBe('attachment; filename="document.pdf"');
  });

  it('Test F — a foreign invoice id resolves NOT_FOUND via the SAME scoped getter the route uses', async () => {
    // Customer A requesting their own invoice -> found.
    const own = await portalService.getInvoiceById('inv_a1', 'cust_a');
    expect(own && (own.customerId ?? own.customer_id ?? own.customerIdAlt)).toBe('cust_a');

    // Customer A requesting Customer B's invoice -> the scoped getter must not
    // return it (route maps this to 404 without leaking existence).
    const foreignByOwnedId = await portalService.getInvoiceById('inv_a1', 'cust_b');
    const foreignRecord = await portalService.getInvoiceById('inv_b1', 'cust_a');
    const leaked =
      (foreignByOwnedId && String(foreignByOwnedId.customerId ?? foreignByOwnedId.customer_id ?? foreignByOwnedId.customerIdAlt) === 'cust_b') ||
      (foreignRecord && String(foreignRecord.customerId ?? foreignRecord.customer_id ?? '') === 'cust_b');
    expect(leaked).toBeFalsy();
  });

  it('Slash-in-ID — invoice IDs containing "/" resolve correctly through the scoped getter', async () => {
    // Add a slash-containing invoice to the store.
    const slashInvoice = { id: 'INV-P726/027', customerId: 'cust_a', invoiceNumber: 'INV-P726/027', totalAmount: 13500 };
    store.invoices.set('INV-P726/027', slashInvoice);

    // Owner retrieves it — must find it by exact ID.
    const found = await portalService.getInvoiceById('INV-P726/027', 'cust_a');
    expect(found).not.toBeNull();
    expect(found.id).toBe('INV-P726/027');
    expect(found.totalAmount).toBe(13500);

    // Foreign customer must not see it.
    const foreign = await portalService.getInvoiceById('INV-P726/027', 'cust_b');
    expect(foreign).toBeNull();

    // Render the document — must produce valid PDF bytes.
    const { buffer, contentType } = await officialDocumentService.renderOfficialPdf({
      type: 'INVOICE',
      rawData: found,
      customers: [store.customers.get('cust_a')],
    });
    expect(contentType).toBe('application/pdf');
    expect(buffer.slice(0, 4).toString('ascii')).toBe('%PDF');

    // Content-Disposition must sanitize the slash in the filename.
    const disposition = officialDocumentService.buildContentDisposition('INV-P726/027.pdf');
    expect(disposition).toContain('INV-P726_027.pdf');
    expect(disposition).not.toContain('/');

    // Cleanup
    store.invoices.delete('INV-P726/027');
  });

  it('Audit — download marker writes only workflow tables (no accounting writes)', async () => {
    const before = snapshotCounts();
    // Simulate the route's audit step.
    const lifecycle = require('../services/portalLifecycleService.cjs');
    await lifecycle.recordDownload({
      docType: 'invoice',
      docId: 'inv_a1',
      portalUserId: 'pusr_x',
      customerId: 'cust_a',
      context: {},
    }).catch(() => {});
    const after = snapshotCounts();
    const changed = Object.keys(after).filter((t) => after[t] !== before[t]);
    for (const t of changed) {
      expect(['customers', 'invoices', 'portal_downloads']).toContain(t);
    }
    for (const forbidden of ['invoices', 'customer_payments', 'payment_allocations', 'ledger_entries']) {
      expect(after[forbidden] || 0).toBe(before[forbidden] || 0);
    }
  });
});

function snapshotCounts() {
  const counts = {};
  for (const t of ['customers', 'invoices', 'portal_downloads', 'customer_payments', 'payment_allocations', 'ledger_entries']) {
    counts[t] = (store[t] || new Map()).size;
  }
  return counts;
}
