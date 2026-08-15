process.env.SUPABASE_URL = 'https://test.supabase.co';
process.env.SUPABASE_SECRET_KEY = 'test-secret-key';

jest.mock('axios', () => {
  const instance = {
    get: jest.fn(),
    post: jest.fn(),
    patch: jest.fn(),
    delete: jest.fn(),
  };
  instance.create = jest.fn(() => instance);
  return instance;
});

const axios = require('axios');
const cloudSyncStore = require('../../services/cloudSyncStore.cjs');

describe('cloudSyncStore optimistic-concurrency version gate (B6 atomic)', () => {
  beforeEach(() => {
    jest.resetAllMocks();
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
      expect(axios.patch).not.toHaveBeenCalled();
    });

    it('blocks tombstone revival: unversioned write on a soft-deleted row is rejected', async () => {
      axios.get.mockResolvedValueOnce(respond(existingRow({ data: { name: 'old', deleted: true, deletedAt: '2026-01-15T00:00:00Z' } })));

      const result = await cloudSyncStore.upsertRow('products', 'row-1', { id: 'row-1', name: 'resurrect' });

      expect(result.conflicted).toBe(true);
      expect(result.conflictType).toBe('version_required');
      expect(result.serverVersion).toBe(4);
      expect(result.server.data.deleted).toBe(true);
      expect(axios.post).not.toHaveBeenCalled();
      expect(axios.patch).not.toHaveBeenCalled();
    });

    it('allows tombstone resurrection when version is supplied', async () => {
      axios.patch.mockResolvedValueOnce(respond({ id: 'row-1', version: 5, updated_at: '2026-02-01T00:00:00Z', data: { name: 'resurrect' } }));

      const result = await cloudSyncStore.upsertRow('products', 'row-1', { id: 'row-1', name: 'resurrect', _version: 4 });

      expect(result.version).toBe(5);
      expect(result.conflicted).toBeUndefined();
      expect(axios.patch).toHaveBeenCalledTimes(1);
      expect(axios.post).not.toHaveBeenCalled();
    });
  });

  describe('upsertRow — versioned writes (B6 atomic PATCH)', () => {
    it('accepts a matching version via atomic PATCH and bumps the stored version', async () => {
      axios.patch.mockResolvedValueOnce(respond({ id: 'row-1', version: 5, updated_at: '2026-02-01T00:00:00Z' }));

      const result = await cloudSyncStore.upsertRow('products', 'row-1', { id: 'row-1', name: 'ok', _version: 4 });

      expect(result.version).toBe(5);
      expect(result.conflicted).toBeUndefined();
      // B6: Only PATCH called — no separate GET for version check
      expect(axios.get).not.toHaveBeenCalled();
      expect(axios.post).not.toHaveBeenCalled();
      const [patchUrl, patchBody] = axios.patch.mock.calls[0];
      expect(patchUrl).toContain('/rest/v1/products');
      expect(patchBody.data).toMatchObject({ name: 'ok' });
      expect(patchBody.version).toBe(5);
      // Version precondition sent as query parameter
      expect(axios.patch.mock.calls[0][2].params).toEqual({ id: 'eq.row-1', version: 'eq.4' });
    });

    it('rejects a stale version as version_conflict when atomic PATCH returns 0 rows', async () => {
      // PostgREST returns empty array when WHERE version = expected matches nothing
      axios.patch.mockResolvedValueOnce({ data: [] });
      // Fetches current snapshot for field-merge
      axios.get.mockResolvedValueOnce(respond(existingRow()));

      const result = await cloudSyncStore.upsertRow('products', 'row-1', { id: 'row-1', name: 'stale', _version: 2 });

      expect(result.conflicted).toBe(true);
      expect(result.conflictType).toBe('version_conflict');
      expect(result.server.version).toBe(4);
      expect(axios.post).not.toHaveBeenCalled();
    });

    it('does NOT mutate the row on OCC conflict', async () => {
      axios.patch.mockResolvedValueOnce({ data: [] });
      axios.get.mockResolvedValueOnce(respond(existingRow()));

      await cloudSyncStore.upsertRow('products', 'row-1', { id: 'row-1', name: 'stale', _version: 2 });

      // No POST (upsert) should have been called
      expect(axios.post).not.toHaveBeenCalled();
    });
  });

  describe('softDeleteRow — B6 atomic PATCH', () => {
    it('uses atomic conditional PATCH for tombstone write', async () => {
      axios.get.mockResolvedValueOnce(respond(existingRow()));
      axios.patch.mockResolvedValueOnce(respond({ id: 'row-1', version: 5, updated_at: '2026-02-01T00:00:00Z', data: { name: 'server-name', sku: 'S-1', deleted: true, deletedAt: '2026-02-01T00:00:00Z' } }));

      const result = await cloudSyncStore.softDeleteRow('products', 'row-1');

      expect(result.deleted).toBe(true);
      expect(axios.patch).toHaveBeenCalledTimes(1);
      const [patchUrl, patchBody, patchConfig] = axios.patch.mock.calls[0];
      expect(patchUrl).toContain('/rest/v1/products');
      expect(patchBody.data.deleted).toBe(true);
      expect(patchBody.version).toBe(5);
      expect(patchConfig.params).toEqual({ id: 'eq.row-1', version: 'eq.4' });
    });

    it('returns conflict when atomic PATCH finds version mismatch', async () => {
      axios.get.mockResolvedValueOnce(respond(existingRow()));
      axios.patch.mockResolvedValueOnce({ data: [] });

      const result = await cloudSyncStore.softDeleteRow('products', 'row-1');

      expect(result.conflicted).toBe(true);
      expect(result.conflictType).toBe('version_conflict');
    });
  });

  describe('applyOp — gateway response shape', () => {
    it('surfaces a version_required conflict as a retryable conflict with server data', async () => {
      axios.get.mockResolvedValueOnce(respond(existingRow()));

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
      expect(axios.patch).not.toHaveBeenCalled();
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

    it('returns conflict via atomic PATCH for versioned write', async () => {
      axios.patch.mockResolvedValueOnce({ data: [] });
      axios.get.mockResolvedValueOnce(respond(existingRow()));

      const result = await cloudSyncStore.applyOp({
        table: 'products',
        recordId: 'row-1',
        operation: 'upsert',
        payload: { id: 'row-1', name: 'stale', _version: 2 },
      });

      expect(result.ok).toBe(false);
      expect(result.conflict).toBe(true);
      expect(result.retryable).toBe(true);
    });
  });
});
