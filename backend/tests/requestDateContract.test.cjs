/**
 * Request date-contract regression tests (hermetic).
 *
 * Root cause guarded here: quotation/order requests persisted NO timestamp
 * inside their JSONB envelope, and supabaseRepository.fromSupabaseRow dropped
 * the row-level `created_at` column on read — so every API response omitted
 * the date entirely and ERP rendered "Invalid Date". Payment requests worked
 * only because they persist an explicit `requested_at` INSIDE the envelope.
 *
 * The fix exposes the canonical DB column through the mapper. These tests pin:
 *   1. fromSupabaseRow maps the created_at column (contract)
 *   2. quotation request -> API DTO carries a valid created_at (Test A)
 *   3. order request     -> API DTO carries a valid created_at (Test B)
 *   4. payment request DTO contract unchanged (Test C reference)
 *   5. pre-existing legacy rows heal without migration (Test E)
 *
 * The store simulates the real envelope write path: sanitizeRecord strips
 * created_at from the payload; the Postgres column default fills the row.
 */

process.env.JWT_SECRET = 'test-jwt-secret';

const repoActual = jest.requireActual('../services/supabaseRepository.cjs');

// Simulated Supabase rows: { id, data JSONB, created_at, updated_at, version }.
const store = {
  customers: new Map(),
  quotation_requests: new Map(),
};

let seqCounter = 100;

function dbDefaultNow() {
  return new Date().toISOString();
}

function simulateEnvelopeUpsert(table, record) {
  // Mirrors cloudSyncStore.sanitizeRecord: sync metadata stripped from the
  // domain payload; created_at lives ONLY in its own column (DB default).
  store[table] = store[table] || new Map();
  const { id } = record;
  const data = { ...record };
  delete data.id;
  delete data.version;
  delete data.updated_at;
  delete data.created_at;
  const existing = store[table].get(id);
  const row = {
    id,
    data,
    created_at: existing ? existing.created_at : dbDefaultNow(), // NOT NULL DEFAULT NOW()
    updated_at: dbDefaultNow(),
    version: existing ? existing.version + 1 : 1,
  };
  store[table].set(id, row);
}

jest.mock('../services/supabaseRepository.cjs', () => ({
  getAll: jest.fn(async (table) => {
    const rows = [...((store[table] || new Map()).values())];
    return rows.map((row) => repoActual.fromSupabaseRow(row));
  }),
  getById: jest.fn(async (table, id) => {
    const row = (store[table] || new Map()).get(id);
    return row ? repoActual.fromSupabaseRow(row) : null;
  }),
  upsert: jest.fn(async (table, record) => {
    simulateEnvelopeUpsert(table, record);
    return repoActual.fromSupabaseRow(store[table].get(record.id));
  }),
  softDelete: jest.fn(async () => ({ changes: 1 })),
}));

jest.mock('../services/promotionService.cjs', () => ({
  getActivePromotions: jest.fn(async () => []),
  getUsageByPromotion: jest.fn(async () => ({})),
  getUsageByPromotionForCustomer: jest.fn(async () => ({})),
  recordRedemption: jest.fn(async () => ({})),
}));

jest.mock('../services/workflowEngine.cjs', () => ({
  SALES_ORDER_STATUS: Object.freeze({ DRAFT: 'Draft', CONFIRMED: 'Confirmed', CANCELLED: 'Cancelled' }),
  nextYearScopedNumber: jest.fn(async (_table, _col, prefix) => {
    seqCounter += 1;
    return prefix + '-2026-' + String(seqCounter).padStart(6, '0');
  }),
  requestNumberPrefix: jest.fn((type) => (type === 'order' ? 'SO' : 'QTR')),
}));

jest.mock('../auditService.cjs', () => ({
  auditService: { logEvent: jest.fn(async () => ({})) },
}));

const lifecycle = require('../services/portalLifecycleService.cjs');
const { fromSupabaseRow } = repoActual;
const paymentRequestService = require('../services/paymentRequestService.cjs');

describe('Request date contract - created_at flows from persistence to API', () => {
  beforeEach(() => {
    store.customers.clear();
    store.quotation_requests.clear();
    jest.clearAllMocks();
    store.customers.set('cust_date', {
      id: 'cust_date',
      name: 'Date Probe Customer',
      companyId: 'company_a',
      createdAt: '2026-01-01T00:00:00Z',
    });
  });

  it('contract - fromSupabaseRow exposes the canonical created_at column', () => {
    const mapped = fromSupabaseRow({
      id: 'r1',
      data: { status: 'submitted' },
      created_at: '2026-08-23T10:30:00.000Z',
      updated_at: '2026-08-23T11:00:00.000Z',
      version: 3,
    });
    expect(mapped.created_at).toBe('2026-08-23T10:30:00.000Z');
    expect(new Date(mapped.created_at).getTime()).not.toBeNaN();

    // Legacy rows that carry an in-envelope value keep precedence.
    const legacyMapped = fromSupabaseRow({
      id: 'r2',
      data: { created_at: '2020-01-01T00:00:00.000Z' },
      created_at: '2026-08-23T10:30:00.000Z',
      updated_at: null,
      version: 1,
    });
    expect(legacyMapped.created_at).toBe('2020-01-01T00:00:00.000Z');

    // Absent everywhere -> explicit null (never undefined).
    const empty = fromSupabaseRow({ id: 'r3', data: {}, created_at: null, updated_at: null, version: 1 });
    expect(empty.created_at).toBeNull();
  });

  it('contract - PostgREST microsecond timestamps are normalized to strict JS-safe ISO', () => {
    // EXACT shape Supabase/PostgREST returns for timestamptz DEFAULT NOW():
    // >3 fractional digits + +00:00 offset. ECMA-262 only guarantees parsing
    // for .sss; stricter engines (WebKit) return Invalid Date and ERP rendered
    // "—" even though the field was present.
    const postgrestRow = {
      id: 'req_so7',
      data: { request_number: 'SO-2026-000007' },
      created_at: '2026-08-23T12:22:13.55572+00:00',
      updated_at: '2026-08-23T12:22:12.722+00:00',
      version: 1,
    };
    const dto = fromSupabaseRow(postgrestRow);

    expect(dto.created_at).toBe('2026-08-23T12:22:13.555Z');
    expect(dto.updated_at).toBe('2026-08-23T12:22:12.722Z');

    // The served value must round-trip through every engine's spec-mandated
    // path: strict ISO in -> identical instant out.
    expect(new Date(dto.created_at).toISOString()).toBe('2026-08-23T12:22:13.555Z');

    // Same instant as the raw value when parsed by a lenient engine (Node),
    // proving normalization preserves the moment — no date invention.
    expect(new Date(dto.created_at).getTime()).toBe(new Date(postgrestRow.created_at).getTime());
  });

  it('Test A - quotation request returns a valid created_at through the API mapper', async () => {
    const created = await lifecycle.createQuotationRequest({
      portalUserId: 'pusr_date',
      customerId: 'cust_date',
      customerName: 'Date Probe Customer',
      requestType: 'quotation',
      items: [{ productId: 'prod-x', name: 'Product X', quantity: 1, unitPrice: 500 }],
    });

    const dto = await lifecycle.getRequestById(created.id, {});
    expect(dto.created_at).toBeTruthy();
    expect(new Date(dto.created_at).getTime()).not.toBeNaN();
  });

  it('Test B - order request returns a valid created_at through detail and list mappers', async () => {
    const created = await lifecycle.createQuotationRequest({
      portalUserId: 'pusr_date',
      customerId: 'cust_date',
      customerName: 'Date Probe Customer',
      requestType: 'order',
      items: [{ productId: 'prod-x', name: 'Product X', quantity: 1, unitPrice: 500 }],
    });

    const dto = await lifecycle.getRequestById(created.id, {});
    expect(dto.created_at).toBeTruthy();
    expect(new Date(dto.created_at).getTime()).not.toBeNaN();

    const list = await lifecycle.getRequests({ customerId: 'cust_date' });
    const listed = list.find((r) => r.id === created.id);
    expect(listed.created_at).toBeTruthy();
    expect(new Date(listed.created_at).getTime()).not.toBeNaN();
  });

  it('Test E - a pre-existing legacy row (column-only timestamp) heals without migration', async () => {
    store.quotation_requests.set('req_legacy_row', {
      id: 'req_legacy_row',
      data: {
        request_number: 'QTR-2026-000001',
        customer_id: 'cust_date',
        customer_name: 'Date Probe Customer',
        request_type: 'order',
        status: 'submitted',
        items: JSON.stringify([{ productId: 'prod-x', name: 'Product X', quantity: 1, unitPrice: 500 }]),
      },
      created_at: '2025-12-31T09:15:00.000Z',
      updated_at: '2025-12-31T09:15:00.000Z',
      version: 1,
    });

    const dto = await lifecycle.getRequestById('req_legacy_row', {});
    expect(dto.created_at).toBe('2025-12-31T09:15:00.000Z');
    expect(Number.isNaN(new Date(dto.created_at).getTime())).toBe(false);
  });

  it('Test C - payment request DTO contract unchanged (known-good reference)', () => {
    const dto = paymentRequestService.toPortalDto({
      id: 'payreq_1',
      request_number: 'PAYREQ-2026-000001',
      customer_id: 'cust_date',
      invoice_id: 'inv_1',
      requested_amount: 100,
      status: 'requested',
      requested_at: '2026-08-16T18:23:39.051Z',
      created_at: '2026-08-16T18:23:39.100Z',
    });
    expect(dto.requestedAt).toBe('2026-08-16T18:23:39.051Z');
    expect(dto.createdAt).toBe('2026-08-16T18:23:39.100Z');
    expect(new Date(dto.requestedAt).getTime()).not.toBeNaN();
  });
});
