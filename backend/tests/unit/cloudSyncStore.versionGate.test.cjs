process.env.SUPABASE_URL = 'https://test.supabase.co';
process.env.SUPABASE_SECRET_KEY = 'test-secret-key';

jest.mock('axios', () => ({
  get: jest.fn(),
  post: jest.fn(),
  delete: jest.fn(),
}));

const axios = require('axios');
const cloudSyncStore = require('../../services/cloudSyncStore.cjs');

describe('cloudSyncStore optimistic-concurrency version gate', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const existingRow = (overrides = {}) => ({
    id: 'row-1',
    version: 4,
    updated_at: '2026-01-10T00:00:00Z',
    data: { name: 'server-name', sku: 'S-1' },
    ...overrides,
  });

  const respond = (body) => ({ data: Array.isArray(body) ? body : [body] });

  describe('upsertRow — unversioned writes', () => {
    it('allows a version-less create when no row exists and stamps version 1', async () => {
      axios.get.mockResolvedValueOnce({ data: [] });
      axios.post.mockResolvedValueOnce(respond({ id: 'row-1', version: 1, updated_at: '2026-02-01T00:00:00Z' }));

      const result = await cloudSyncStore.upsertRow('products', 'row-1', { id: 'row-1', name: 'New' });

      expect(result.version).toBe(1);
      expect(result.conflicted).toBeUndefined();
      const posted = axios.post.mock.calls[0][1];
      expect(posted.version).toBe(1);
      expect(posted.data).toEqual({ id: 'row-1', name: 'New' });
    });

    it('rejects an unversioned update on an existing row as version_required', async () => {
      axios.get.mockResolvedValueOnce(respond(existingRow()));

      const result = await cloudSyncStore.upsertRow('products', 'row-1', { id: 'row-1', name: 'stale-write' });

      expect(result.conflicted).toBe(true);
      expect(result.conflictType).toBe('version_required');
      expect(result.server).toEqual({
        id: 'row-1',
        version: 4,
        updatedAt: '2026-01-10T00:00:00Z',
        data: { name: 'server-name', sku: 'S-1' },
      });
      expect(axios.post).not.toHaveBeenCalled();
    });

    it('blocks tombstone revival: unversioned write on a soft-deleted row is rejected', async () => {
      axios.get.mockResolvedValueOnce(respond(existingRow({ data: { name: 'old', deleted: true, deletedAt: '2026-01-15T00:00:00Z' } })));

      const result = await cloudSyncStore.upsertRow('products', 'row-1', { id: 'row-1', name: 'resurrect' });

      expect(result.conflicted).toBe(true);
      expect(result.conflictType).toBe('version_required');
      expect(result.server.data.deleted).toBe(true);
      expect(axios.post).not.toHaveBeenCalled();
    });
  });

  describe('upsertRow — versioned writes', () => {
    it('accepts a matching version and bumps the stored version', async () => {
      axios.get.mockResolvedValueOnce(respond(existingRow()));
      axios.post.mockResolvedValueOnce(respond({ id: 'row-1', version: 5, updated_at: '2026-02-01T00:00:00Z' }));

      const result = await cloudSyncStore.upsertRow('products', 'row-1', { id: 'row-1', name: 'ok', _version: 4 });

      expect(result.version).toBe(5);
      const posted = axios.post.mock.calls[0][1];
      expect(posted.version).toBe(5);
    });

    it('rejects a stale version as version_conflict with the server snapshot', async () => {
      axios.get.mockResolvedValueOnce(respond(existingRow()));

      const result = await cloudSyncStore.upsertRow('products', 'row-1', { id: 'row-1', name: 'stale', _version: 2 });

      expect(result.conflicted).toBe(true);
      expect(result.conflictType).toBe('version_conflict');
      expect(result.server.version).toBe(4);
      expect(axios.post).not.toHaveBeenCalled();
    });
  });

  describe('applyOp — gateway response shape', () => {
    it('surfaces a version_required conflict as a retryable conflict with server data', async () => {
      axios.get.mockResolvedValueOnce(respond(existingRow()));

      // No operationId: skips the idempotency lookup, so the only GET is getRow.
      const result = await cloudSyncStore.applyOp({
        table: 'products',
        recordId: 'row-1',
        operation: 'upsert',
        payload: { id: 'row-1', name: 'stale-write' },
      });

      expect(result.ok).toBe(false);
      expect(result.conflict).toBe(true);
      expect(result.conflictType).toBe('version_required');
      expect(result.retryable).toBe(true);
      expect(result.server.data.name).toBe('server-name');
      expect(axios.post).not.toHaveBeenCalled();
    });

    it('accepts a version-less create end-to-end', async () => {
      axios.get.mockResolvedValueOnce({ data: [] });
      axios.post.mockResolvedValueOnce(respond({ id: 'row-9', version: 1, updated_at: '2026-02-01T00:00:00Z' }));

      const result = await cloudSyncStore.applyOp({
        table: 'products',
        recordId: 'row-9',
        operation: 'upsert',
        payload: { id: 'row-9', name: 'brand-new' },
      });

      expect(result.ok).toBe(true);
      expect(result.version).toBe(1);
    });
  });
});
