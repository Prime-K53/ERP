import { describe, it, expect, vi, beforeEach } from 'vitest';

let resolvedData: unknown = null;
let resolvedError: unknown = null;

function createQueryBuilder() {
  const builder: Record<string, unknown> = {};
  const thenable = (data: unknown, error: unknown) => {
    const p = Promise.resolve({ data, error });
    return p;
  };

  builder.select = vi.fn(() => builder);
  builder.eq = vi.fn(() => builder);
  builder.order = vi.fn(() => thenable(resolvedData, resolvedError));
  builder.single = vi.fn(() => thenable(resolvedData, resolvedError));
  builder.maybeSingle = vi.fn(() => thenable(resolvedData, resolvedError));
  builder.upsert = vi.fn(() => builder);
  builder.delete = vi.fn(() => builder);
  builder.then = undefined as any;

  return builder;
}

let mockBuilder = createQueryBuilder();

vi.mock('../../../services/supabaseClient', () => ({
  supabase: {
    auth: {
      getSession: vi.fn(() => Promise.resolve({ data: { session: { user: { id: 'user-1' }, access_token: 'tok' } } })),
      refreshSession: vi.fn(() => Promise.resolve({ data: { session: { user: { id: 'user-1' }, access_token: 'tok' } } })),
      getUser: vi.fn(() => Promise.resolve({ data: { user: { id: 'user-1' } } })),
    },
    from: vi.fn(() => mockBuilder),
    storage: {
      from: vi.fn(() => ({
      upload: vi.fn(),
      createSignedUrl: vi.fn(),
      download: vi.fn(),
    })),
    },
    channel: vi.fn(() => ({
      on: vi.fn().mockReturnThis(),
      subscribe: vi.fn(),
    })),
    removeChannel: vi.fn(),
  },
}));

describe('cloudDb (single write path)', () => {
  let cloudDb: typeof import('../../../services/cloudDb').cloudDb;

  beforeEach(async () => {
    vi.clearAllMocks();
    resolvedData = null;
    resolvedError = null;
    mockBuilder = createQueryBuilder();

    cloudDb = (await import('../../../services/cloudDb')).cloudDb;
  });

  describe('listCompanyProfiles (read path)', () => {
    it('should fetch and flatten the jsonb data column', async () => {
      const serverRecords = [
        { id: 'p1', user_id: 'u1', role: 'Admin', status: 'Active', data: { full_name: 'Ada Lovelace' }, updated_at: '2026-06-29T12:00:00Z' },
        { id: 'p2', user_id: 'u2', data: { role: 'Cashier', full_name: 'Grace Hopper', status: 'Inactive' }, updated_at: '2026-06-29T13:00:00Z' },
      ];
      resolvedData = serverRecords;
      resolvedError = null;

      const records = await cloudDb.listCompanyProfiles();
      expect(records).toHaveLength(2);
      expect(records![0].full_name).toBe('Ada Lovelace');
      expect(records![1].status).toBe('Inactive');
    });
  });

  describe('upsertProfile (write routed through the queue)', () => {
    it('should return a stable id and never write directly to Supabase', async () => {
      const { supabase } = await import('../../../services/supabaseClient');
      const result = await cloudDb.upsertProfile({
        user_id: 'user-9',
        role: 'Admin',
        full_name: 'Ada',
        fullName: 'Ada',
      });

      expect(result).toBeTruthy();
      // Same user → same id on retry (deterministic — no duplicates on re-upsert merge).
      const again = await cloudDb.upsertProfile({ user_id: 'user-9' });
      expect(again).toBe(result);

      // The only supabase writes cloudDb may still perform are storage uploads.
      expect(supabase.from).not.toHaveBeenCalled();
    });

    it('returns null when no user id is provided', async () => {
      const out = await cloudDb.upsertProfile({});
      expect(out).toBeNull();
    });
  });

  describe('uploadFile (intentional storage write, not business data)', () => {
    it('should upload and return a storage path', async () => {
      const { supabase } = await import('../../../services/supabaseClient');
      const uploadMock = vi.fn().mockResolvedValue({ data: { path: 'comp-1/documents/file.pdf' }, error: null });
      vi.mocked(supabase.storage.from).mockReturnValue({
        upload: uploadMock,
        createSignedUrl: vi.fn(),
        download: vi.fn(),
      } as any);

      const file = new File(['test'], 'test.pdf', { type: 'application/pdf' });
      const result = await cloudDb.uploadFile(file, 'documents', 'op-file-1');
      expect(result).toMatch(/^storage:/);
    });
  });
});