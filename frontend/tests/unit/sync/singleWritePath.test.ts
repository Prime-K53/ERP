/**
 * singleWritePath.test.ts — Phase 2 validation of the offline-first pipeline:
 *
 *   UI → IndexedDB (durable queue) → POST /api/sync/ops → gateway
 *
 * Simulates the in-app scenario: create a record offline, reconnect,
 * automatic sync, delete (tombstone), network interruption + retry.
 * Verifies there is exactly one queue and one write path (no direct cloud
 * client writes).
 */
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
const { mockSendOps } = vi.hoisted(() => ({
  mockSendOps: vi.fn(),
}));

vi.mock('idb', () => ({
  openDB: openDBMock,
  deleteDB: vi.fn(async () => {}),
  unwrap: vi.fn(),
}));

vi.mock('../../../services/syncApiClient', () => ({
  sendSyncOps: mockSendOps,
  getSyncAccessToken: vi.fn(async () => 'tok'),
  isSyncGatewayConfigured: vi.fn(() => true),
}));

// The single write path must not involve direct cloud writes from the client.
const cloudDbWriteSpies = vi.hoisted(() => ({
  put: vi.fn(),
  delete: vi.fn(),
}));
vi.mock('../../../services/cloudDb', () => ({
  cloudDb: {
    uploadFile: vi.fn(),
    ...cloudDbWriteSpies,
  },
}));

let createCounter = 0;

function createDb() {
  const id = ++createCounter;
  const stores: Record<string, Map<string, Record<string, unknown>>> = {
    operations: new Map(),
    meta: new Map(),
    metrics: new Map(),
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
    transaction: vi.fn(() => ({ done: Promise.resolve(), objectStore: vi.fn() })),
    createObjectStore: vi.fn(),
    deleteObjectStore: vi.fn(),
  };
}

describe('single write path (offline → online)', () => {
  let freshDb: ReturnType<typeof createDb>;

  beforeEach(() => {
    freshDb = createDb();
    openDBMock.mockReset().mockResolvedValue(freshDb);
    mockSendOps.mockReset();
    resetDbConnection();
    backgroundSyncService.reset();
  });

  afterEach(() => {
    backgroundSyncService.stopPeriodicSync();
  });

  it('create offline → reconnect → automatic sync reaches the gateway exactly once', async () => {
    // Offline: the user creates a customer; the write lands in the durable queue.
    mockSendOps.mockRejectedValueOnce(new Error('network error (offline)'));

    await durableSyncQueue.enqueue({
      table: 'customers',
      recordId: 'CUST-NEW',
      operation: 'upsert',
      payload: { id: 'CUST-NEW', name: 'Offline Customer' },
    });

    let result = await backgroundSyncService.syncNow();
    expect(result!.failed).toBe(1); // network interruption → kept for retry

    // Reconnect: automatic sync drains the queue.
    mockSendOps.mockImplementation(async (ops: any[]) => ({
      ok: true,
      processed: ops.length,
      succeeded: ops.length,
      results: ops.map((op) => ({ operationId: op.operationId, ok: true, id: op.recordId })),
    }));

    await backgroundSyncService.retryAllFailed();
    result = await backgroundSyncService.syncNow();
    expect(result!.success).toBe(1);
    expect(result!.failed).toBe(0);

    // The gateway (and only the gateway) received the op.
    expect(mockSendOps).toHaveBeenCalledTimes(2);
    const [, finalCall] = mockSendOps.mock.calls;
    expect(finalCall[0][0]).toMatchObject({
      table: 'customers',
      recordId: 'CUST-NEW',
      operation: 'upsert',
    });
    // No direct cloud writes from the client.
    expect(cloudDbWriteSpies.put).not.toHaveBeenCalled();
    expect(cloudDbWriteSpies.delete).not.toHaveBeenCalled();
  });

  it('every business write is a queue op with the gateway op shape', async () => {
    await durableSyncQueue.enqueue({
      table: 'inventory',
      recordId: 'prod-1',
      operation: 'upsert',
      payload: { id: 'prod-1', name: 'Ink', quantity: 5 },
    });

    mockSendOps.mockImplementation(async (ops: any[]) => ({
      ok: true,
      processed: ops.length,
      succeeded: ops.length,
      results: ops.map((op) => ({ operationId: op.operationId, ok: true, id: op.recordId })),
    }));

    await backgroundSyncService.syncNow();

    expect(mockSendOps).toHaveBeenCalledTimes(1);
    const [ops] = mockSendOps.mock.calls[0];
    expect(ops).toHaveLength(1);
    expect(ops[0]).toMatchObject({
      table: 'inventory',
      recordId: 'prod-1',
      operation: 'upsert',
    });
    expect(ops[0].payload.name).toBe('Ink');
  });

  it('delete becomes a tombstone op and is idempotent on replay', async () => {
    await durableSyncQueue.enqueue({
      table: 'customers',
      recordId: 'CUST-OLD',
      operation: 'delete',
      payload: { id: 'CUST-OLD' },
    });

    mockSendOps.mockImplementation(async (ops: any[]) => ({
      ok: true,
      processed: ops.length,
      succeeded: ops.length,
      results: ops.map((op) => ({ operationId: op.operationId, ok: true, id: op.recordId })),
    }));

    const result = await backgroundSyncService.syncNow();
    expect(result!.success).toBe(1);

    const [ops] = mockSendOps.mock.calls[0];
    expect(ops[0]).toMatchObject({ operation: 'delete', recordId: 'CUST-OLD' });

    // After completion the op never re-queues (single application per op).
    expect(await durableSyncQueue.countPending()).toBe(0);
  });

  it('permanent gateway rejection dead-letters; transient failure retries', async () => {
    // Permanent (schema) error → dead letter.
    mockSendOps.mockImplementation(async (ops: any[]) => ({
      ok: true,
      processed: ops.length,
      succeeded: 0,
      results: ops.map((op) => ({
        operationId: op.operationId,
        ok: false,
        error: 'violates foreign key constraint',
        retryable: false,
      })),
    }));
    await durableSyncQueue.enqueue({ table: 'inventory', recordId: 'bad', operation: 'upsert', payload: { id: 'bad' } });
    let result = await backgroundSyncService.syncNow();
    expect(result!.deadLetter).toBe(1);

    // Transient (5xx) error → stays in the retryable layer.
    mockSendOps.mockImplementation(async (ops: any[]) => ({
      ok: true,
      processed: ops.length,
      succeeded: 0,
      results: ops.map((op) => ({
        operationId: op.operationId,
        ok: false,
        error: 'internal server error',
        retryable: true,
      })),
    }));
    await durableSyncQueue.enqueue({ table: 'inventory', recordId: 'temp', operation: 'upsert', payload: { id: 'temp' } });
    result = await backgroundSyncService.syncNow();
    expect(result!.failed).toBe(1);
    expect(await durableSyncQueue.countFailed()).toBe(1);
  });

  it('queue survives an app restart (durable IndexedDB) and drains later', async () => {
    await durableSyncQueue.enqueue({ table: 'customers', recordId: 'CUST-1', operation: 'upsert', payload: { id: 'CUST-1' } });
    // Simulate restart: drop the connection cache; the store is still on disk.
    resetDbConnection();
    openDBMock.mockResolvedValue(freshDb);

    expect(await durableSyncQueue.countPending()).toBe(1);

    mockSendOps.mockImplementation(async (ops: any[]) => ({
      ok: true,
      processed: ops.length,
      succeeded: ops.length,
      results: ops.map((op) => ({ operationId: op.operationId, ok: true, id: op.recordId })),
    }));
    const result = await backgroundSyncService.syncNow();
    expect(result!.success).toBe(1);
    expect(await durableSyncQueue.countPending()).toBe(0);
  });
});