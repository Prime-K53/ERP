process.env.SUPABASE_URL = 'https://test.supabase.co';
process.env.SUPABASE_SECRET_KEY = 'test-secret-key';

jest.mock('axios', () => ({
  get: jest.fn(),
  post: jest.fn(),
  delete: jest.fn(),
}));

const axios = require('axios');
const cloudSyncStore = require('../../services/cloudSyncStore.cjs');

describe('cloudSyncStore tombstone lifecycle', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('countTombstones', () => {
    it('should return the total from the Content-Range header', async () => {
      axios.get.mockResolvedValueOnce({
        data: [],
        headers: { 'content-range': '0-0/42' },
      });

      const count = await cloudSyncStore.countTombstones('products');
      expect(count).toBe(42);
      expect(axios.get).toHaveBeenCalledWith(
        expect.stringContaining('/rest/v1/products'),
        expect.objectContaining({
          headers: expect.objectContaining({ Prefer: 'count=exact' }),
          params: expect.objectContaining({ 'data->>deleted': 'eq.true', select: 'id', limit: 1 }),
        })
      );
    });

    it('should return 0 when the Content-Range header is missing', async () => {
      axios.get.mockResolvedValueOnce({ data: [], headers: {} });

      expect(await cloudSyncStore.countTombstones('products')).toBe(0);
    });

    it('should return 0 on transport errors', async () => {
      axios.get.mockRejectedValueOnce(new Error('network down'));

      expect(await cloudSyncStore.countTombstones('products')).toBe(0);
    });
  });

  describe('purgeTombstones', () => {
    it('should collect ids across pages, archive each, then hard-delete', async () => {
      const page1 = Array.from({ length: 100 }, (_, i) => ({ id: `row-${i}`, updated_at: '2020-01-01T00:00:00Z' }));
      axios.get
        .mockResolvedValueOnce({ data: page1 })
        .mockResolvedValueOnce({ data: [{ id: 'row-100', updated_at: '2020-01-01T00:00:00Z' }] });
      axios.delete.mockResolvedValue({ status: 204 });

      const archiveFn = jest.fn().mockResolvedValue(undefined);
      const result = await cloudSyncStore.purgeTombstones('customers', 30, archiveFn);

      expect(result.purged).toBe(101);
      expect(result.archived).toBe(101);
      expect(archiveFn).toHaveBeenCalledTimes(101);
      expect(axios.delete).toHaveBeenCalledTimes(101);

      const params = axios.get.mock.calls[0][1].params;
      expect(params['data->>deleted']).toBe('eq.true');
      expect(params.updated_at).toMatch(/^lt\./);
      expect(params.order).toBe('updated_at.asc');
    });

    it('should count skipped rows when the hard delete fails', async () => {
      axios.get.mockResolvedValueOnce({ data: [{ id: 'row-1', updated_at: '2020-01-01T00:00:00Z' }] });
      axios.delete.mockRejectedValueOnce(new Error('gone'));

      const result = await cloudSyncStore.purgeTombstones('products', 30);
      expect(result.purged).toBe(0);
      expect(result.skipped).toBe(1);
    });

    it('should stop scanning when a page is shorter than the page size', async () => {
      axios.get.mockResolvedValueOnce({ data: [{ id: 'only', updated_at: '2020-01-01T00:00:00Z' }] });

      const result = await cloudSyncStore.purgeTombstones('products', 30);
      expect(axios.get).toHaveBeenCalledTimes(1);
      expect(result.purged).toBe(1);
    });

    it('should archive best-effort when archiveFn throws', async () => {
      axios.get.mockResolvedValueOnce({ data: [{ id: 'row-1', updated_at: '2020-01-01T00:00:00Z' }] });
      axios.delete.mockResolvedValue({ status: 204 });
      const archiveFn = jest.fn().mockRejectedValue(new Error('disk full'));

      const result = await cloudSyncStore.purgeTombstones('products', 30, archiveFn);
      expect(result.purged).toBe(1);
      expect(result.archived).toBe(0);
    });
  });
});
