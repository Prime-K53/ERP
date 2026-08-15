import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';

(globalThis as any).IDBKeyRange = {
  only: vi.fn((val: string) => ({ only: val })),
  upperBound: vi.fn(),
  lowerBound: vi.fn(),
  bound: vi.fn(),
};

type MockRecord = Record<string, unknown>;

function createMemoryDB() {
  const stores: Record<string, Map<string, MockRecord>> = {
    operations: new Map(),
    meta: new Map(),
    metrics: new Map(),
  };

  const KEY_PATHS: Record<string, string> = {
    operations: 'id',
    meta: 'key',
    metrics: 'id',
  };

  const getKey = (storeName: string, value: MockRecord): string => {
    const kp = KEY_PATHS[storeName] || 'id';
    return (value as any)[kp] as string;
  };

  const db = {
    get: vi.fn(async (storeName: string, key: string) => {
      return stores[storeName]?.get(key) || undefined;
    }),
    put: vi.fn(async (storeName: string, value: MockRecord) => {
      const k = getKey(storeName, value);
      stores[storeName].set(k, { ...value });
    }),
    delete: vi.fn(async (storeName: string, key: string) => {
      stores[storeName].delete(key);
    }),
    getAll: vi.fn(async (storeName: string) => {
      return Array.from(stores[storeName].values());
    }),
    getAllFromIndex: vi.fn(async (storeName: string, indexName: string, range?: unknown) => {
      const all = Array.from(stores[storeName].values());
      if (!range) return all;
      const rangeVal = (range as { only: string }).only;
      const INDEX_FIELD: Record<string, string> = {
        'by-status': 'status',
        'by-created': 'createdAt',
        'by-operationId': 'operationId',
        'by-metric': 'metric',
      };
      const field = INDEX_FIELD[indexName] || indexName;
      return all.filter(r => {
        const idxVal = (r as any)[field];
        return idxVal === rangeVal;
      });
    }),
    count: vi.fn(async (storeName: string) => stores[storeName].size),
    close: vi.fn(),
    objectStoreNames: { contains: vi.fn(() => true) },
    transaction: vi.fn(() => ({ done: Promise.resolve(), objectStore: vi.fn() })),
    createObjectStore: vi.fn(),
    deleteObjectStore: vi.fn(),
  };

  return { db, stores };
}

const memoryDB = createMemoryDB();

vi.mock('idb', () => ({
  openDB: vi.fn(async () => memoryDB.db),
  deleteDB: vi.fn(async () => {
    memoryDB.stores.operations.clear();
    memoryDB.stores.meta.clear();
    memoryDB.stores.metrics.clear();
  }),
  unwrap: vi.fn(),
}));

describe('durableSyncQueue', () => {
  let durableSyncQueue: typeof import('../../../services/durableSyncQueue').durableSyncQueue;

  beforeAll(async () => {
    const mod = await import('../../../services/durableSyncQueue');
    durableSyncQueue = mod.durableSyncQueue;
  });

  beforeEach(() => {
    memoryDB.stores.operations.clear();
    memoryDB.stores.meta.clear();
    memoryDB.stores.metrics.clear();
  });

  describe('enqueue', () => {
    it('should enqueue an operation with pending status', async () => {
      const item = await durableSyncQueue.enqueue({
        table: 'products',
        recordId: 'prod-1',
        operation: 'upsert',
        payload: { name: 'Test Product', price: 100 },
      });

      expect(item).toBeDefined();
      expect(item.id).toBeTruthy();
      expect(item.table).toBe('products');
      expect(item.recordId).toBe('prod-1');
      expect(item.operation).toBe('upsert');
      expect(item.status).toBe('pending');
      expect(item.retryCount).toBe(0);
      expect(item.createdAt).toBeTruthy();
    });

    it('should allow valid dependency chains', async () => {
      const parent = await durableSyncQueue.enqueue({
        table: 'parent',
        recordId: 'p-1',
        operation: 'upsert',
        payload: {},
      });

      const child = await durableSyncQueue.enqueue({
        table: 'child',
        recordId: 'c-1',
        operation: 'upsert',
        payload: {},
        dependsOn: [parent.id],
      });

      expect(child.dependsOn).toEqual([parent.id]);
    });
  });

  describe('dequeue', () => {
    it('should return pending items in FIFO order', async () => {
      await durableSyncQueue.enqueue({ table: 't1', recordId: '1', operation: 'upsert', payload: {} });
      await durableSyncQueue.enqueue({ table: 't2', recordId: '2', operation: 'upsert', payload: {} });

      const items = await durableSyncQueue.dequeue(10);
      expect(items).toHaveLength(2);
      expect(items[0].recordId).toBe('1');
      expect(items[1].recordId).toBe('2');
    });

    it('should respect dependency ordering', async () => {
      const a = await durableSyncQueue.enqueue({ table: 't', recordId: 'a', operation: 'upsert', payload: {} });
      await durableSyncQueue.enqueue({ table: 't', recordId: 'b', operation: 'upsert', payload: {}, dependsOn: [a.id] });

      const items = await durableSyncQueue.dequeue(10);
      expect(items).toHaveLength(2);
      expect(items[0].recordId).toBe('a');
      expect(items[1].recordId).toBe('b');
    });

    it('should only return items with unmet dependencies when limit is low', async () => {
      const a = await durableSyncQueue.enqueue({ table: 't', recordId: 'a', operation: 'upsert', payload: {} });
      await durableSyncQueue.enqueue({ table: 't', recordId: 'b', operation: 'upsert', payload: {}, dependsOn: [a.id] });

      const items = await durableSyncQueue.dequeue(1);
      expect(items).toHaveLength(1);
      expect(items[0].recordId).toBe('a');
    });

    it('should mark dequeued items as syncing', async () => {
      await durableSyncQueue.enqueue({ table: 't', recordId: '1', operation: 'upsert', payload: {} });
      const items = await durableSyncQueue.dequeue(10);
      expect(items[0].status).toBe('syncing');
    });
  });

  describe('markCompleted / markFailed', () => {
    it('should mark item as completed', async () => {
      const item = await durableSyncQueue.enqueue({ table: 't', recordId: '1', operation: 'upsert', payload: {} });
      await durableSyncQueue.markCompleted(item.id, '2026-06-29T12:00:00Z');

      const all = await durableSyncQueue.getAll('completed');
      expect(all).toHaveLength(1);
      expect(all[0].status).toBe('completed');
    });

    it('should mark retryable errors as failed', async () => {
      const item = await durableSyncQueue.enqueue({ table: 't', recordId: '1', operation: 'upsert', payload: {} });
      await durableSyncQueue.markFailed(item.id, 'timeout');

      const failed = await durableSyncQueue.getAll('failed');
      expect(failed).toHaveLength(1);
      expect(failed[0].retryCount).toBe(1);
    });

    it('should mark permanent errors as dead_letter', async () => {
      const item = await durableSyncQueue.enqueue({ table: 't', recordId: '1', operation: 'upsert', payload: {} });
      await durableSyncQueue.markFailed(item.id, 'violates foreign key constraint');

      const dlq = await durableSyncQueue.getAll('dead_letter');
      expect(dlq).toHaveLength(1);
    });

    it('should allow retry of dead letter items', async () => {
      const item = await durableSyncQueue.enqueue({ table: 't', recordId: '1', operation: 'upsert', payload: {} });
      await durableSyncQueue.markFailed(item.id, 'violates foreign key constraint');
      await durableSyncQueue.retryDeadLetter(item.id);

      const pending = await durableSyncQueue.getAll('pending');
      expect(pending).toHaveLength(1);
      expect(pending[0].retryCount).toBe(0);
      expect(pending[0].status).toBe('pending');
    });
  });

  describe('classifyError', () => {
    let classifyError: (msg: string) => 'retryable' | 'permanent';

    beforeAll(async () => {
      const mod = await import('../../../services/durableSyncQueue');
      classifyError = mod.classifyError;
    });

    it('should classify timeouts as retryable', () => {
      expect(classifyError('timeout')).toBe('retryable');
      expect(classifyError('NetworkError: fetch failed')).toBe('retryable');
      expect(classifyError('503 Service Unavailable')).toBe('retryable');
    });

    it('should classify validation errors as permanent', () => {
      expect(classifyError('violates not-null constraint')).toBe('permanent');
      expect(classifyError('duplicate key value violates unique constraint')).toBe('permanent');
      expect(classifyError('foreign key constraint violation')).toBe('permanent');
    });

    it('should default to retryable for unknown errors', () => {
      expect(classifyError('unknown weird error')).toBe('retryable');
    });
  });

  describe('getMetrics', () => {
    it('should return correct counts', async () => {
      await durableSyncQueue.enqueue({ table: 't', recordId: '1', operation: 'upsert', payload: {} });
      await durableSyncQueue.enqueue({ table: 't', recordId: '2', operation: 'upsert', payload: {} });

      const metrics = await durableSyncQueue.getMetrics();
      expect(metrics.total).toBe(2);
      expect(metrics.pending).toBe(2);
      expect(metrics.failed).toBe(0);
      expect(metrics.completed).toBe(0);
    });

    it('should track completed and failed counts', async () => {
      const i1 = await durableSyncQueue.enqueue({ table: 't', recordId: '1', operation: 'upsert', payload: {} });
      const i2 = await durableSyncQueue.enqueue({ table: 't', recordId: '2', operation: 'upsert', payload: {} });
      await durableSyncQueue.markCompleted(i1.id);
      await durableSyncQueue.markFailed(i2.id, 'timeout');

      const metrics = await durableSyncQueue.getMetrics();
      expect(metrics.completed).toBe(1);
      expect(metrics.failed).toBe(1);
    });
  });

  describe('cleanup', () => {
    it('should remove completed items older than retention period', async () => {
      await durableSyncQueue.enqueue({ table: 't', recordId: '1', operation: 'upsert', payload: {} });
      const allItems = await durableSyncQueue.getAll();
      const item = allItems[0];
      await durableSyncQueue.markCompleted(item.id, '2020-01-01T00:00:00Z');

      const removed = await durableSyncQueue.cleanup(0);
      expect(removed).toBe(1);

      const remaining = await durableSyncQueue.getAll();
      expect(remaining).toHaveLength(0);
    });

    it('should not remove recent completed items', async () => {
      await durableSyncQueue.enqueue({ table: 't', recordId: '1', operation: 'upsert', payload: {} });
      const allItems = await durableSyncQueue.getAll();
      const item = allItems[0];
      await durableSyncQueue.markCompleted(item.id, new Date().toISOString());

      const removed = await durableSyncQueue.cleanup(86400000);
      expect(removed).toBe(0);
    });
  });

  describe('deadLetter', () => {
    it('should force an item to the dead-letter queue with permanent error type', async () => {
      const item = await durableSyncQueue.enqueue({ table: 't', recordId: '1', operation: 'upsert', payload: {} });
      await durableSyncQueue.deadLetter(item.id, 'CONFLICT requires review — same-field edits: name');

      const dlq = await durableSyncQueue.getAll('dead_letter');
      expect(dlq).toHaveLength(1);
      expect(dlq[0].errorType).toBe('permanent');
      expect(dlq[0].lastError).toContain('CONFLICT requires review');
      expect(dlq[0].retryCount).toBeGreaterThan(0);
    });
  });

  describe('requeue', () => {
    it('should reset status to pending with a new merged payload', async () => {
      const item = await durableSyncQueue.enqueue({ table: 't', recordId: '1', operation: 'upsert', payload: { name: 'old' } });
      await durableSyncQueue.markFailed(item.id, 'timeout');

      await durableSyncQueue.requeue(item.id, { name: 'merged' }, { conflictCount: 2 });
      const pending = await durableSyncQueue.getAll('pending');
      expect(pending).toHaveLength(1);
      expect(pending[0].payload).toEqual({ name: 'merged' });
      expect(pending[0].conflictCount).toBe(2);
      expect(pending[0].lastError).toBeNull();
      expect(pending[0].id).toBe(item.id);
    });
  });

  describe('recordConflict / getConflicts', () => {
    it('should store a conflict record and increment the total counter', async () => {
      await durableSyncQueue.recordConflict({
        operationId: 'op-1',
        table: 'products',
        recordId: 'p1',
        conflictedFields: ['name'],
        resolved: 'review',
        serverVersion: 7,
      });

      const conflicts = await durableSyncQueue.getConflicts(10);
      expect(conflicts).toHaveLength(1);
      const record = conflicts[0] as Record<string, unknown>;
      expect(record.table).toBe('products');
      expect(record.recordId).toBe('p1');
      expect(record.resolved).toBe('review');
      expect(record.serverVersion).toBe(7);
      expect(await durableSyncQueue.getMeta('conflicts_total')).toBe(1);
    });

    it('should sort newest first and respect the limit', async () => {
      await durableSyncQueue.recordConflict({ operationId: 'a', table: 't', recordId: '1', conflictedFields: [], resolved: 'auto', serverVersion: 1 });
      await durableSyncQueue.recordConflict({ operationId: 'b', table: 't', recordId: '2', conflictedFields: [], resolved: 'auto', serverVersion: 2 });
      await durableSyncQueue.recordConflict({ operationId: 'c', table: 't', recordId: '3', conflictedFields: [], resolved: 'auto', serverVersion: 3 });
      // Age records deterministically: all were written in the same ms in tests.
      for (const rec of memoryDB.stores.metrics.values()) {
        const opId = (rec.value as { operationId: string }).operationId;
        rec.timestamp = `2026-06-0${1 + ['a', 'b', 'c'].indexOf(opId)}T00:00:00Z`;
      }

      const conflicts = await durableSyncQueue.getConflicts(2);
      expect(conflicts).toHaveLength(2);
      expect((conflicts[0] as Record<string, unknown>).recordId).toBe('3');
      expect((conflicts[1] as Record<string, unknown>).recordId).toBe('2');
    });
  });

  describe('cleanup retention', () => {
    it('should remove dead-letter items older than the dead-letter retention window', async () => {
      const item = await durableSyncQueue.enqueue({ table: 't', recordId: '1', operation: 'upsert', payload: {} });
      await durableSyncQueue.markFailed(item.id, 'violates foreign key constraint');
      const dlq = await durableSyncQueue.getAll('dead_letter');
      expect(dlq).toHaveLength(1);
      // Age the record past its retention window.
      dlq[0].lastAttempt = '2020-01-01T00:00:00Z';
      memoryDB.stores.operations.set(dlq[0].id, dlq[0]);

      const removed = await durableSyncQueue.cleanup(86400000, 0, 90 * 86400000);
      expect(removed).toBe(1);
      expect(await durableSyncQueue.getAll('dead_letter')).toHaveLength(0);
    });

    it('should keep fresh dead-letter items', async () => {
      const item = await durableSyncQueue.enqueue({ table: 't', recordId: '1', operation: 'upsert', payload: {} });
      await durableSyncQueue.markFailed(item.id, 'violates foreign key constraint');

      const removed = await durableSyncQueue.cleanup(86400000, 30 * 86400000, 90 * 86400000);
      expect(removed).toBe(0);
      expect(await durableSyncQueue.getAll('dead_letter')).toHaveLength(1);
    });

    it('should prune metrics records past the metrics retention window', async () => {
      await durableSyncQueue.recordMetric('cleanup_removed', 3);
      // Age the telemetry record past its retention window.
      for (const rec of memoryDB.stores.metrics.values()) {
        if (rec.metric === 'cleanup_removed') rec.timestamp = '2020-01-01T00:00:00Z';
      }

      const removed = await durableSyncQueue.cleanup(86400000, 30 * 86400000, 0);
      expect(removed).toBe(1);
    });

    it('should not prune fresh metrics records', async () => {
      await durableSyncQueue.recordMetric('cleanup_removed', 3);

      const removed = await durableSyncQueue.cleanup(86400000, 30 * 86400000, 90 * 86400000);
      expect(removed).toBe(0);
    });
  });

  describe('getMetrics telemetry', () => {
    it('should surface the most recent last_sync_success/failure records', async () => {
      await durableSyncQueue.recordMetric('last_sync_failure', '2026-06-29T10:00:00Z');
      await durableSyncQueue.recordMetric('last_sync_success', '2026-06-29T11:00:00Z');

      const metrics = await durableSyncQueue.getMetrics();
      expect(metrics.lastSyncSuccess).toBe('2026-06-29T11:00:00Z');
      expect(metrics.lastSyncFailure).toBe('2026-06-29T10:00:00Z');
    });

    it('should tally conflictsAuto and conflictsReview from conflict records', async () => {
      await durableSyncQueue.recordConflict({ operationId: 'a', table: 't', recordId: '1', conflictedFields: [], resolved: 'auto', serverVersion: 1 });
      await durableSyncQueue.recordConflict({ operationId: 'b', table: 't', recordId: '2', conflictedFields: ['name'], resolved: 'review', serverVersion: 2 });

      const metrics = await durableSyncQueue.getMetrics();
      expect(metrics.conflictsTotal).toBe(2);
      expect(metrics.conflictsAuto).toBe(1);
      expect(metrics.conflictsReview).toBe(1);
    });
  });

  describe('enqueueWithCache', () => {
    it('should enqueue and then call cache write', async () => {
      const cacheWrite = vi.fn().mockResolvedValue(undefined);
      const item = await durableSyncQueue.enqueueWithCache({
        table: 'products',
        recordId: 'prod-1',
        operation: 'upsert',
        payload: { name: 'Test' },
      }, cacheWrite);

      expect(item).toBeDefined();
      expect(cacheWrite).toHaveBeenCalledOnce();
    });

    it('should rollback queue item if cache write fails', async () => {
      const cacheWrite = vi.fn().mockRejectedValue(new Error('cache full'));
      await expect(
        durableSyncQueue.enqueueWithCache({
          table: 'products',
          recordId: 'prod-1',
          operation: 'upsert',
          payload: { name: 'Test' },
        }, cacheWrite)
      ).rejects.toThrow(/rolled back/);
    });
  });

  describe('retryFailed', () => {
    it('should reset all failed items to pending', async () => {
      const i1 = await durableSyncQueue.enqueue({ table: 't', recordId: '1', operation: 'upsert', payload: {} });
      const i2 = await durableSyncQueue.enqueue({ table: 't', recordId: '2', operation: 'upsert', payload: {} });
      await durableSyncQueue.markFailed(i1.id, 'timeout');
      await durableSyncQueue.markFailed(i2.id, 'timeout');

      const count = await durableSyncQueue.retryFailed();
      expect(count).toBe(2);
    });
  });

  describe('meta', () => {
    it('should store and retrieve metadata', async () => {
      await durableSyncQueue.setMeta('last_sync', '2026-06-29T12:00:00Z');
      const val = await durableSyncQueue.getMeta('last_sync');
      expect(val).toBe('2026-06-29T12:00:00Z');
    });
  });
});
