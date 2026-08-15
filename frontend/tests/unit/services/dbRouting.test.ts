import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const store: Record<string, string> = {};

  return {
    localStorage: {
      getItem: vi.fn((key: string) => store[key] ?? null),
      setItem: vi.fn((key: string, value: string) => {
        store[key] = value;
      }),
      removeItem: vi.fn((key: string) => {
        delete store[key];
      }),
      clear: vi.fn(() => {
        Object.keys(store).forEach((key) => delete store[key]);
      }),
      key: vi.fn((index: number) => Object.keys(store)[index] ?? null),
      get length() {
        return Object.keys(store).length;
      }
    },
    idbGetAll: vi.fn(),
    idbGet: vi.fn(),
    idbPut: vi.fn(),
    idbDelete: vi.fn(),
    openDB: vi.fn(),
    deleteDB: vi.fn(async () => undefined)
  };
});

vi.mock('idb', () => ({
  openDB: mocks.openDB,
  deleteDB: mocks.deleteDB
}));

describe('dbService routing', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();

    Object.defineProperty(global, 'localStorage', {
      value: mocks.localStorage,
      configurable: true
    });

    const customers = [
      { id: 'c-1', name: 'Legacy Customer' },
      { id: 'c-2', name: 'Legacy Only' }
    ];

    mocks.idbGetAll.mockImplementation(async (storeName: string) => {
      if (storeName === 'customers') {
        return customers;
      }
      return [];
    });

    mocks.idbGet.mockImplementation(async (storeName: string, key: string) => {
      if (storeName === 'customers') {
        return customers.find(c => c.id === key);
      }
      return undefined;
    });
    mocks.idbPut.mockImplementation(async (_storeName: string, value: any) => value?.id || 'legacy-id');
    mocks.idbDelete.mockResolvedValue(undefined);

    mocks.openDB.mockResolvedValue({
      objectStoreNames: {
        contains: vi.fn(() => true)
      },
      getAll: mocks.idbGetAll,
      getAllKeys: vi.fn(async (storeName: string) => {
        if (storeName === 'customers') return ['c-1', 'c-2'];
        return [];
      }),
      get: mocks.idbGet,
      put: mocks.idbPut,
      delete: mocks.idbDelete,
      close: vi.fn(),
      transaction: vi.fn(() => ({
        done: Promise.resolve(),
        abort: vi.fn(),
        objectStore: vi.fn(() => ({
          clear: vi.fn(async () => undefined),
          put: vi.fn(async () => undefined)
        }))
      }))
    });
  });

  it('reads from legacy store for dual-read collections', async () => {
    const { dbService } = await import('../../../services/db');

    const rows = await dbService.getAll<{ id: string; name: string }>('customers');

    expect(rows).toEqual([
      { id: 'c-1', name: 'Legacy Customer' },
      { id: 'c-2', name: 'Legacy Only' }
    ]);
  });

  it('writes to legacy store for backed collections', async () => {
    const { dbService } = await import('../../../services/db');
    const result = await dbService.put('customers', { id: 'c-9', name: 'Fallback Customer' });

    expect(result).toBe('c-9');
    expect(mocks.idbPut).toHaveBeenCalledWith('customers', expect.objectContaining({ id: 'c-9' }));
  });
});