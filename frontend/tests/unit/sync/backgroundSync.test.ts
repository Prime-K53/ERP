import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { durableSyncQueue, resetDbConnection } from '../../../services/durableSyncQueue';
import { backgroundSyncService } from '../../../services/backgroundSyncService';

(globalThis as any).IDBKeyRange = {
  only: vi.fn((val: string) => ({ only: val })),
  upperBound: vi.fn(),
  lowerBound: vi.fn(),
  bound: vi.fn(),
};

const { openDBMock } = vi.hoisted(() => ({ openDBMock: vi.fn() }));
const { mockSendOps, mockUploadFile } = vi.hoisted(() => ({
  mockSendOps: vi.fn(async (ops: { operationId?: string }[]) => ({
    ok: true,
    processed: ops.length,
    succeeded: ops.length,
    results: ops.map((op) => ({ operationId: op.operationId, ok: true, id: 'mock-id' })),
  })),
  mockUploadFile: vi.fn(async () => 'mock-url'),
}));

vi.mock('idb', () => ({
  openDB: openDBMock,
  deleteDB: vi.fn(async () => {}),
  unwrap: vi.fn(),
}));

vi.mock('../../../services/syncApiClient', () => ({
  sendSyncOps: mockSendOps,
}));

vi.mock('../../../services/cloudDb', () => ({
  cloudDb: {
    uploadFile: mockUploadFile,
  },
}));

let createCounter = 0;

function createDb() {
  const id = ++createCounter;
  const stores: Record<string, Map<string, Record<string, unknown>>> = {
    operations: new Map(),
    meta: new Map(),
    metrics: new Map(),
    inventory: new Map(),
  };

  const INDEX_FIELD: Record<string, string> = {
    'by-status': 'status',
    'by-created': 'createdAt',
    'by-operationId': 'operationId',
    'by-metric': 'metric',
  };

  return {
    __testId: id,
    get: vi.fn(async (storeName: string, key: string) => stores[storeName]?.get(key) || undefined),
    put: vi.fn(async (storeName: string, value: Record<string, unknown>) => {
      stores[storeName].set(value.id as string, { ...value });
    }),
    delete: vi.fn(async (storeName: string, key: string) => { stores[storeName].delete(key); }),
    getAll: vi.fn(async (storeName: string) => Array.from(stores[storeName].values())),
    getAllFromIndex: vi.fn(async (storeName: string, indexName: string, range?: unknown) => {
      const all = Array.from(stores[storeName].values());
      if (!range) return all;
      const rangeVal = (range as { only: string }).only;
      const field = INDEX_FIELD[indexName] || indexName;
      return all.filter(r => (r as any)[field] === rangeVal);
    }),
    count: vi.fn(async (storeName: string) => stores[storeName].size),
    close: vi.fn(),
    objectStoreNames: { contains: vi.fn(() => true) },
    transaction: vi.fn((storeNames: string | string[], _mode?: string) => {
      const names = Array.isArray(storeNames) ? storeNames : [storeNames];
      return {
        done: Promise.resolve(),
        objectStore: (n: string) => ({
          put: async (value: Record<string, unknown>) => {
            (stores[n] ||= new Map()).set(value.id as string, { ...value });
          },
          get: async (key: string) => stores[n]?.get(key),
        }),
      };
    }),
    createObjectStore: vi.fn(),
    deleteObjectStore: vi.fn(),
  };
}

describe('backgroundSyncService', () => {
  let freshDb: ReturnType<typeof createDb>;

  beforeEach(() => {
    freshDb = createDb();
    openDBMock.mockReset().mockResolvedValue(freshDb);

    mockSendOps.mockReset().mockImplementation(async (ops: { operationId?: string }[]) => ({
      ok: true,
      processed: ops.length,
      succeeded: ops.length,
      results: ops.map((op) => ({ operationId: op.operationId, ok: true, id: 'mock-id' })),
    }));
    mockUploadFile.mockReset().mockResolvedValue('mock-url');

    resetDbConnection();
    backgroundSyncService.reset();
  });

  afterEach(() => {
    backgroundSyncService.stopPeriodicSync();
  });

  describe('syncNow', () => {
    it('should process pending queue items', async () => {
      await durableSyncQueue.enqueue({ table: 'products', recordId: 'p1', operation: 'upsert', payload: { name: 'Test' } });

      const result = await backgroundSyncService.syncNow();
      expect(result).toBeDefined();
      expect(result!.success).toBe(1);
      expect(result!.failed).toBe(0);
    });

    it('should mark items as failed on cloud error', async () => {
      mockSendOps.mockRejectedValueOnce(new Error('timeout'));

      await durableSyncQueue.enqueue({ table: 'products', recordId: 'p1', operation: 'upsert', payload: { name: 'Test' } });

      const result = await backgroundSyncService.syncNow();
      expect(result).toBeDefined();
      expect(result!.success).toBe(0);
      expect(result!.failed).toBe(1);
    });

    it('should move permanent errors to dead letter queue', async () => {
      mockSendOps.mockImplementation(async (ops: { operationId?: string }[]) => ({
        ok: true,
        processed: ops.length,
        succeeded: 0,
        results: ops.map((op) => ({ operationId: op.operationId, ok: false, error: 'violates foreign key constraint', retryable: false })),
      }));

      await durableSyncQueue.enqueue({ table: 'products', recordId: 'p1', operation: 'upsert', payload: { name: 'Test' } });

      const result = await backgroundSyncService.syncNow();
      expect(result!.deadLetter).toBe(1);
    });

    it('should skip when already syncing', async () => {
      const promise1 = backgroundSyncService.syncNow();
      const result2 = await backgroundSyncService.syncNow(false);
      expect(result2).toBeNull();
      await promise1;
    });
  });

  describe('server version stamping', () => {
    it('writes the server-stamped version back into the live record after a successful push', async () => {
      // The local store for the `products` cloud table is `inventory`.
      await freshDb.put('inventory', { id: 'p1', name: 'Widget' });
      mockSendOps.mockImplementation(async (ops: { operationId?: string }[]) => ({
        ok: true,
        processed: ops.length,
        succeeded: ops.length,
        results: ops.map((op) => ({ operationId: op.operationId, ok: true, id: 'p1', version: 5 })),
      }));

      await durableSyncQueue.enqueue({ table: 'products', recordId: 'p1', operation: 'upsert', payload: { id: 'p1', name: 'Widget' } });

      const result = await backgroundSyncService.syncNow();
      expect(result!.success).toBe(1);

      const live = await freshDb.getAll('inventory');
      expect(live).toHaveLength(1);
      expect(live[0]._version).toBe(5);
      expect(live[0].version).toBe(5);
      expect(live[0].name).toBe('Widget');
    });

    it('skips the stamp when the gateway returns no version', async () => {
      await freshDb.put('inventory', { id: 'p1', name: 'Widget' });

      await durableSyncQueue.enqueue({ table: 'products', recordId: 'p1', operation: 'upsert', payload: { id: 'p1', name: 'Widget' } });

      const result = await backgroundSyncService.syncNow();
      expect(result!.success).toBe(1);

      const live = await freshDb.getAll('inventory');
      expect(live[0]._version).toBeUndefined();
    });
  });

  describe('metrics', () => {
    it('should return queue metrics through getMetrics', async () => {
      await durableSyncQueue.enqueue({ table: 'products', recordId: 'p1', operation: 'upsert', payload: {} });

      const metrics = await backgroundSyncService.getMetrics();
      expect(metrics.pending).toBe(1);
      expect(metrics.total).toBe(1);
    });
  });

  describe('subscribe', () => {
    it('should notify subscribers on sync events', async () => {
      await durableSyncQueue.enqueue({ table: 'products', recordId: 'p1', operation: 'upsert', payload: {} });

      const callback = vi.fn();
      backgroundSyncService.subscribe('test-listener', callback);

      const result = await backgroundSyncService.syncNow();
      expect(result).toBeDefined();
      expect(result!.success).toBe(1);
      expect(callback).toHaveBeenCalledWith('sync-complete', expect.any(Object));
    });
  });

  describe('retryDeadLetter and retryAllFailed', () => {
    it('should retry a single dead letter item', async () => {
      const item = await durableSyncQueue.enqueue({ table: 't', recordId: '1', operation: 'upsert', payload: {} });
      await durableSyncQueue.markFailed(item.id, 'violates foreign key constraint');

      await backgroundSyncService.retryDeadLetter(item.id);
      const pending = await durableSyncQueue.getAll('pending');
      expect(pending).toHaveLength(1);
    });

    it('should retry all failed items', async () => {
      const i1 = await durableSyncQueue.enqueue({ table: 't', recordId: '1', operation: 'upsert', payload: {} });
      const i2 = await durableSyncQueue.enqueue({ table: 't', recordId: '2', operation: 'upsert', payload: {} });
      await durableSyncQueue.markFailed(i1.id, 'timeout');
      await durableSyncQueue.markFailed(i2.id, 'timeout');

      const count = await backgroundSyncService.retryAllFailed();
      expect(count).toBe(2);
    });
  });

  describe('conflict flow', () => {
    const conflictResult = (operationId?: string, data: Record<string, unknown> = { id: 'p1', name: 'Server Name', price: 200, version: 7 }) => ({
      operationId,
      ok: false,
      conflict: true,
      version: 7,
      server: {
        version: 7,
        updatedAt: '2026-06-30T00:00:00Z',
        data,
      },
    });

    const alwaysConflict = (data?: Record<string, unknown>) => async (ops: { operationId?: string }[]) => ({
      ok: true,
      processed: ops.length,
      succeeded: 0,
      results: ops.map((op) => conflictResult(op.operationId, data)),
    });

    it('should field-merge disjoint edits, requeue with fresh version, then complete on retry', async () => {
      let call = 0;
      mockSendOps.mockImplementation(async (ops: { operationId?: string }[]) => {
        call++;
        if (call === 1) {
          // Server snapshot has no `name` — the local edit is a pure addition.
          return {
            ok: true,
            processed: ops.length,
            succeeded: 0,
            results: ops.map((op) => conflictResult(op.operationId, { id: 'p1', price: 200, version: 7 })),
          };
        }
        return {
          ok: true,
          processed: ops.length,
          succeeded: ops.length,
          results: ops.map((op) => ({ operationId: op.operationId, ok: true, id: 'p1' })),
        };
      });

      await durableSyncQueue.enqueue({
        table: 'products', recordId: 'p1', operation: 'upsert',
        payload: { id: 'p1', name: 'Local Name' },
      });

      const result = await backgroundSyncService.syncNow();
      expect(result!.success).toBe(1);
      expect(result!.conflictsResolved).toBe(1);
      expect(await durableSyncQueue.getAll('completed')).toHaveLength(1);

      // The re-pushed payload carried the local-only field, the server field,
      // and the fresh base version stamped by the resolver.
      const repushed = mockSendOps.mock.calls[1][0] as { payload: Record<string, unknown> }[];
      expect(repushed[0].payload.name).toBe('Local Name');
      expect(repushed[0].payload.price).toBe(200);
      expect(repushed[0].payload._version).toBe(7);

      const conflicts = await durableSyncQueue.getConflicts(10);
      expect(conflicts).toHaveLength(1);
      expect((conflicts[0] as any).resolved).toBe('auto');
    });

    it('should record review resolution for same-field edits and requeue for a follow-up push', async () => {
      let call = 0;
      mockSendOps.mockImplementation(async (ops: { operationId?: string }[]) => {
        call++;
        if (call === 1) {
          // First batch conflicts; the requeued merge then matches the server row.
          return {
            ok: true,
            processed: ops.length,
            succeeded: 0,
            results: ops.map((op) => conflictResult(op.operationId)),
          };
        }
        return {
          ok: true,
          processed: ops.length,
          succeeded: ops.length,
          results: ops.map((op) => ({ operationId: op.operationId, ok: true, id: 'p1' })),
        };
      });

      await durableSyncQueue.enqueue({
        table: 'products', recordId: 'p1', operation: 'upsert',
        payload: { id: 'p1', name: 'Local Name', _updatedAt: '2026-07-01T00:00:00Z' },
      });

      const result = await backgroundSyncService.syncNow();
      expect(result!.success).toBe(1);
      expect(result!.conflictsResolved).toBe(1);

      const conflicts = await durableSyncQueue.getConflicts(10);
      expect((conflicts[0] as any).resolved).toBe('review');
      expect((conflicts[0] as any).conflictedFields).toContain('name');
    });

    it('should dead-letter within one pass when a conflict never converges (merge cap)', async () => {
      // The server row never gains the local-only `name` field, so every merge
      // round re-pushes the same delta and the op can never converge.
      mockSendOps.mockImplementation(alwaysConflict({ id: 'p1', price: 200, version: 7 }));

      await durableSyncQueue.enqueue({
        table: 'products', recordId: 'p1', operation: 'upsert',
        payload: { id: 'p1', name: 'Local Name' },
      });

      // 3 merge round-trips happen inside a single pass (batches 1-3), then
      // batch 4 exceeds MAX_CONFLICT_MERGES and dead-letters the op.
      const result = await backgroundSyncService.syncNow();
      expect(result!.success).toBe(0);
      expect(result!.deadLetter).toBe(1);
      expect(result!.conflictsResolved).toBe(3);

      const dlq = await durableSyncQueue.getAll('dead_letter');
      expect(dlq).toHaveLength(1);
      expect(dlq[0].lastError).toContain('CONFLICT requires review');
      expect(dlq[0].lastError).toContain('repeated versioning conflicts');
      expect(dlq[0].errorType).toBe('permanent');
    });

    it('should complete a delete whose conflict raced an upsert (delete intent binds)', async () => {
      mockSendOps.mockImplementation(alwaysConflict());

      await durableSyncQueue.enqueue({
        table: 'products', recordId: 'p1', operation: 'delete', payload: { id: 'p1' },
      });

      const result = await backgroundSyncService.syncNow();
      expect(result!.success).toBe(1);
      expect(result!.conflictsResolved).toBe(1);
      expect(await durableSyncQueue.getAll('completed')).toHaveLength(1);
    });

    it('should mark an op completed when the merge converges with the server row', async () => {
      mockSendOps.mockImplementation(alwaysConflict({ id: 'p1', name: 'Same', price: 100, version: 7 }));

      await durableSyncQueue.enqueue({
        table: 'products', recordId: 'p1', operation: 'upsert',
        payload: { id: 'p1', name: 'Same', price: 100 },
      });

      const result = await backgroundSyncService.syncNow();
      expect(result!.success).toBe(1);
      expect(result!.conflictsResolved).toBe(1);
      expect(await durableSyncQueue.getAll('completed')).toHaveLength(1);
    });
  });

  describe('adaptive batch sizing', () => {
    it('should scale batch size up for large pending queues', async () => {
      for (let i = 0; i < 25; i++) {
        await durableSyncQueue.enqueue({ table: 'products', recordId: `p${i}`, operation: 'upsert', payload: {} });
      }
      const result = await backgroundSyncService.syncNow();
      // 25 items at batchSize 15 → 2 batches; everything succeeds
      expect(result!.success).toBe(25);
    });
  });

  describe('state', () => {
    it('should track sync state', async () => {
      await durableSyncQueue.enqueue({ table: 'products', recordId: 'p1', operation: 'upsert', payload: {} });

      const result = await backgroundSyncService.syncNow();
      expect(result).toBeDefined();
      expect(result!.success).toBe(1);

      const fullState = await backgroundSyncService.getState();
      expect(fullState.totalSynced).toBeGreaterThan(0);
    });
  });

  describe('simulated offline gate (acceptance framework)', () => {
    it('tracks the paused flag and resets it with reset()', () => {
      expect(backgroundSyncService.isPaused()).toBe(false);
      backgroundSyncService.setPaused(true);
      expect(backgroundSyncService.isPaused()).toBe(true);
      backgroundSyncService.reset();
      expect(backgroundSyncService.isPaused()).toBe(false);
    });

    it('queues local writes while paused but does not send anything to the gateway', async () => {
      backgroundSyncService.setPaused(true);
      await durableSyncQueue.enqueue({ table: 'products', recordId: 'p1', operation: 'upsert', payload: { name: 'Offline' } });

      const result = await backgroundSyncService.syncNow();
      expect(result).toBeNull();
      expect(mockSendOps).not.toHaveBeenCalled();
      expect(await durableSyncQueue.countPending()).toBe(1);
    });

    it('drains the queued writes once unpaused', async () => {
      backgroundSyncService.setPaused(true);
      await durableSyncQueue.enqueue({ table: 'products', recordId: 'p1', operation: 'upsert', payload: { name: 'Offline' } });
      await backgroundSyncService.syncNow();

      backgroundSyncService.setPaused(false);
      const result = await backgroundSyncService.syncNow();
      expect(result).toBeDefined();
      expect(result!.success).toBe(1);
      expect(await durableSyncQueue.countPending()).toBe(0);
    });
  });
});
