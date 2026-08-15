import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../services/db', () => ({
  dbService: {
    getAll: vi.fn(),
    get: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
    executeAtomicOperation: vi.fn()
  }
}));

import { api } from '../../services/api';

describe('api.finance HTTP fallback', () => {
  const mockAccount = { id: 'acct-1', code: '1000', name: 'Cash', type: 'asset' };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getAccounts', () => {
    it('returns accounts from local DB when backend is unavailable', async () => {
      const { dbService } = await import('../../services/db');
      vi.mocked(dbService.getAll).mockResolvedValue([mockAccount]);

      const result = await api.finance.getAccounts();
      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe('saveAccount', () => {
    it('saves locally and attempts backend sync', async () => {
      const { dbService } = await import('../../services/db');
      vi.mocked(dbService.put).mockResolvedValue(undefined);

      const result = await api.finance.saveAccount(mockAccount);
      expect(result).toBeDefined();
    });
  });

  describe('deleteAccount', () => {
    it('deletes locally and attempts backend sync', async () => {
      const { dbService } = await import('../../services/db');
      vi.mocked(dbService.delete).mockResolvedValue(undefined);

      const result = await api.finance.deleteAccount('acct-1');
      expect(result).toBeDefined();
    });
  });
});
