import { openDB, IDBPDatabase } from 'idb';

export type QueueStatus = 'pending' | 'syncing' | 'failed' | 'completed' | 'dead_letter';
export type QueueOperation = 'insert' | 'update' | 'delete' | 'upsert';

export interface QueuedOperation {
  id: string;
  operationId: string;
  table: string;
  recordId: string | null;
  operation: QueueOperation;
  payload: unknown;
  userId: string | null;
  createdAt: string;
  retryCount: number;
  lastAttempt: string | null;
  status: QueueStatus;
  lastError: string | null;
  dependsOn: string[];
  fileRef: string | null;
  errorType?: 'retryable' | 'permanent' | null;
  payloadSizeBytes?: number;
  /** Number of optimistic-concurrency conflicts this op survived before convergence (auto-merge cap). */
  conflictCount?: number;
}

export interface QueueMetrics {
  total: number;
  pending: number;
  syncing: number;
  failed: number;
  completed: number;
  deadLetter: number;
  oldestPending: string | null;
  lastSyncSuccess: string | null;
  lastSyncFailure: string | null;
  retryHistogram: Record<number, number>;
  avgRetryCount: number;
  avgSyncLatencyMs: number;
  /** Total optimistic-concurrency conflicts detected across all time (persisted counter). */
  conflictsTotal: number;
  /** Conflicts that auto-merged on disjoint/one-sided fields. */
  conflictsAuto: number;
  /** Conflicts on the same field from both sides that were LWW-resolved and flagged for review. */
  conflictsReview: number;
}

interface QueueDB {
  operations: {
    key: string;
    value: QueuedOperation;
    indexes: {
      'by-status': string;
      'by-created': string;
      'by-operationId': string;
    };
  };
  meta: {
    key: string;
    value: { key: string; value: unknown };
  };
  metrics: {
    key: string;
    value: {
      id: string;
      timestamp: string;
      metric: string;
      value: unknown;
    };
    indexes: {
      'by-metric': string;
    };
  };
}

const DB_NAME = 'PrimeERP_DurableSyncQueue';
const DB_VERSION = 3;

let dbPromise: Promise<IDBPDatabase<QueueDB>> | null = null;

/** @internal – reset IndexedDB connection cache (used in tests) */
export function resetDbConnection(): void {
  dbPromise = null;
}

function getDb(): Promise<IDBPDatabase<QueueDB>> {
  if (!dbPromise) {
    dbPromise = openDB<QueueDB>(DB_NAME, DB_VERSION, {
      upgrade(db, oldVersion) {
        if (oldVersion < 1) {
          const store = db.createObjectStore('operations', { keyPath: 'id' });
          store.createIndex('by-status', 'status');
          store.createIndex('by-created', 'createdAt');
          store.createIndex('by-operationId', 'operationId');
        }
        if (oldVersion < 2) {
          if (!db.objectStoreNames.contains('meta')) {
            db.createObjectStore('meta', { keyPath: 'key' });
          }
        }
        if (oldVersion < 3) {
          if (!db.objectStoreNames.contains('metrics')) {
            const metricsStore = db.createObjectStore('metrics', { keyPath: 'id' });
            metricsStore.createIndex('by-metric', 'metric');
          }
        }
      },
    });
  }
  return dbPromise;
}

function generateId(): string {
  return `q-${crypto.randomUUID?.() ?? Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function generateOperationId(): string {
  return crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

const RETRYABLE_ERROR_PATTERNS = [
  'timeout', 'network', 'offline', 'fetch', 'abort',
  '429', '500', '502', '503', '504',
  'ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND',
  'rate limit', 'too many requests',
  'service unavailable', 'internal server error',
  'bad gateway', 'gateway timeout',
];

const PERMANENT_ERROR_PATTERNS = [
  'validation', 'malformed', 'foreign key', 'not found',
  'missing required', 'unauthorized', 'forbidden',
  'deleted resource', 'schema mismatch', 'constraint',
  'duplicate key value violates unique constraint',
  'violates foreign key constraint',
  'violates not-null constraint',
  'invalid input syntax',
  'row-level security',
  '42501',
  'policy',
];

export function classifyError(message: string): 'retryable' | 'permanent' {
  const lower = message.toLowerCase();
  for (const pattern of PERMANENT_ERROR_PATTERNS) {
    if (lower.includes(pattern)) return 'permanent';
  }
  for (const pattern of RETRYABLE_ERROR_PATTERNS) {
    if (lower.includes(pattern)) return 'retryable';
  }
  return 'retryable';
}

function detectCycle(dependsOn: string[], allItems: QueuedOperation[], visited: Set<string> = new Set(), path: Set<string> = new Set()): boolean {
  for (const depId of dependsOn) {
    if (path.has(depId)) return true;
    if (visited.has(depId)) continue;
    visited.add(depId);
    path.add(depId);
    const depItem = allItems.find(i => i.id === depId);
    if (depItem && depItem.dependsOn.length > 0) {
      if (detectCycle(depItem.dependsOn, allItems, visited, path)) return true;
    }
    path.delete(depId);
  }
  return false;
}

export const durableSyncQueue = {
  async enqueue<T>(input: {
    table: string;
    recordId: string | null;
    operation: QueueOperation;
    payload: T;
    userId?: string | null;
    dependsOn?: string[];
    fileRef?: string | null;
}): Promise<QueuedOperation> {
    const now = new Date().toISOString();
    const db = await getDb();
    const payloadStr = JSON.stringify(input.payload);

    // Only active operations (pending/syncing/failed) participate in
    // duplicate detection and dependency resolution. Scanning the full store
    // (which also holds 24h of completed records) made every local write
    // O(all operations) and slowed the app down as the queue grew.
    const activeLayers = await Promise.all(
      (['pending', 'syncing', 'failed'] as QueueStatus[]).map((status) =>
        db.getAllFromIndex('operations', 'by-status', IDBKeyRange.only(status))
      )
    );
    const allExisting = ([] as QueuedOperation[]).concat(...activeLayers);

    const duplicate = allExisting.find((op) =>
      op.table === input.table
      && op.recordId === (input.recordId || null)
      && op.operation === input.operation
      && (op.status === 'pending' || op.status === 'syncing' || op.status === 'failed')
      && JSON.stringify(op.payload) === payloadStr
    );

    if (duplicate) {
      return duplicate;
    }

    // Merge: when a pending upsert exists for the same table+recordId with
    // a different payload, fold the newer fields into the existing queue item
    // instead of creating a duplicate. This prevents a fresh create (Device B
    // creating CUST-0001) from colliding with an earlier pending upsert of
    // the same record with stale data.
    if (input.operation === 'upsert' && input.recordId) {
      const existingPendingUpsert = allExisting.find((op) =>
        op.table === input.table
        && op.recordId === input.recordId
        && op.operation === 'upsert'
        && (op.status === 'pending' || op.status === 'failed')
        && JSON.stringify(op.payload) !== payloadStr
      );

      if (existingPendingUpsert) {
        // Merge newer fields into the existing payload (latest-write-wins)
        existingPendingUpsert.payload = { ...existingPendingUpsert.payload, ...input.payload };
        const db = await getDb();
        await db.put('operations', existingPendingUpsert);
        return existingPendingUpsert;
      }
    }

    let dependsOn = [...(input.dependsOn || [])];

    if (input.operation === 'delete' && input.recordId) {
      const sameRecordOps = allExisting.filter((op) =>
        op.table === input.table
        && op.recordId === input.recordId
        && (op.status === 'pending' || op.status === 'syncing' || op.status === 'failed')
        && op.operation !== 'delete'
      );

      dependsOn = Array.from(new Set([
        ...dependsOn,
        ...sameRecordOps.filter((op) => op.status === 'syncing').map((op) => op.id),
      ]));

      for (const op of sameRecordOps) {
        if (op.status !== 'syncing') {
          await db.delete('operations', op.id);
        }
      }
    }

    if (dependsOn.length > 0) {
      const cycleCandidates = await db.getAll('operations');
      const visited = new Set<string>();
      const path = new Set<string>();
      if (detectCycle(dependsOn, cycleCandidates, visited, path)) {
        throw new Error(`Dependency cycle detected: operation would create a circular dependency`);
      }
    }

    const item: QueuedOperation = {
      id: generateId(),
      operationId: input.fileRef ? input.fileRef : generateOperationId(),
      table: input.table,
      recordId: input.recordId || null,
      operation: input.operation,
      payload: input.payload,
      userId: input.userId || null,
      createdAt: now,
      retryCount: 0,
      lastAttempt: null,
      status: 'pending',
      lastError: null,
      dependsOn,
      fileRef: input.fileRef || null,
      payloadSizeBytes: payloadStr.length,
      conflictCount: 0,
    };
    await db.put('operations', item);
    console.log(`[SYNC-FORENSIC] STAGE-3 durableSyncQueue.enqueue() persisted`, {
      queueId: item.id,
      operationId: item.operationId,
      table: item.table,
      recordId: item.recordId,
      operation: item.operation,
      status: item.status,
      payloadSizeBytes: item.payloadSizeBytes,
    });
    return item;
  },

  async enqueueWithCache<T>(input: {
    table: string;
    recordId: string | null;
    operation: QueueOperation;
    payload: T;
    userId?: string | null;
    dependsOn?: string[];
    fileRef?: string | null;
  }, cacheWrite: () => Promise<void>): Promise<QueuedOperation> {
    const item = await this.enqueue(input);
    try {
      await cacheWrite();
    } catch {
      await this.remove(item.id);
      throw new Error('Cache write failed after queue enqueue, operation rolled back');
    }
    return item;
  },

  async dequeue(limit: number = 10): Promise<QueuedOperation[]> {
    const db = await getDb();
    const allPending = await db.getAllFromIndex('operations', 'by-status', IDBKeyRange.only('pending'));

    // Loading every completed/dead-lettr record on each dequeue was a hidden
    // O(all operations) scan. Only load them when at least one pending item
    // actually has dependencies (the common empty/independent case skips it).
    const hasDeps = allPending.some((op) => op.dependsOn.length > 0);
    const completedIds = new Set<string>();
    const deadLetterIds = new Set<string>();
    if (hasDeps) {
      const allCompleted = await db.getAllFromIndex('operations', 'by-status', IDBKeyRange.only('completed'));
      for (const op of allCompleted) completedIds.add(op.id);
      const allDead = await db.getAllFromIndex('operations', 'by-status', IDBKeyRange.only('dead_letter'));
      for (const op of allDead) deadLetterIds.add(op.id);
    }

    const blocked = new Set<string>(completedIds);
    for (const id of deadLetterIds) blocked.add(id);

    allPending.sort((a, b) => a.createdAt.localeCompare(b.createdAt));

    const ready: QueuedOperation[] = [];
    const processingIds = new Set<string>();

    // Iteratively resolve dependencies within the batch:
    // Items with no deps are added immediately.
    // Items whose deps are blocked (completed/dead) are also added.
    // Then items whose deps are now in the current batch are added (transitive).
    let changed = true;
    while (changed && ready.length < limit) {
      changed = false;
      for (const op of allPending) {
        if (processingIds.has(op.id)) continue;
        if (ready.length >= limit) break;

        const allDepsMet = op.dependsOn.length === 0 ||
          op.dependsOn.every(depId => blocked.has(depId) || processingIds.has(depId));

        if (allDepsMet) {
          ready.push(op);
          processingIds.add(op.id);
          changed = true;
        }
      }
    }

    const now = new Date().toISOString();
    for (const op of ready) {
      op.status = 'syncing';
      op.lastAttempt = now;
      await db.put('operations', op);
    }
    console.log(`[SYNC-FORENSIC] STAGE-4 durableSyncQueue.dequeue() returned`, {
      count: ready.length,
      limit,
      totalPending: allPending.length,
      items: ready.map(o => ({ id: o.id, operationId: o.operationId, table: o.table, recordId: o.recordId, operation: o.operation })),
    });
    return ready;
  },

  async markCompleted(id: string, serverTimestamp?: string): Promise<void> {
    const db = await getDb();
    const item = await db.get('operations', id);
    if (item) {
      item.status = 'completed';
      item.retryCount = 0;
      item.lastAttempt = serverTimestamp || new Date().toISOString();
      item.lastError = null;
      await db.put('operations', item);
    }
  },

  async markFailed(id: string, error: string): Promise<void> {
    const db = await getDb();
    const item = await db.get('operations', id);
    if (item) {
      const errorType = classifyError(error);
      item.status = errorType === 'permanent' ? 'dead_letter' : 'failed';
      item.retryCount = item.retryCount + 1;
      item.lastAttempt = new Date().toISOString();
      item.lastError = error;
      item.errorType = errorType;
      await db.put('operations', item);
    }
  },

  /**
   * Force an item to the dead-letter queue regardless of error classification.
   * Used for conflicts that cannot converge automatically (same-field edits on
   * both devices) so the background loop stops hammering the record and the
   * item stays visible for manual review/retry.
   */
  async deadLetter(id: string, error: string): Promise<void> {
    const db = await getDb();
    const item = await db.get('operations', id);
    if (item) {
      item.status = 'dead_letter';
      item.retryCount = item.retryCount + 1;
      item.lastAttempt = new Date().toISOString();
      item.lastError = error;
      item.errorType = 'permanent';
      await db.put('operations', item);
    }
  },

  async retryDeadLetter(id: string): Promise<void> {
    const db = await getDb();
    const item = await db.get('operations', id);
    if (item && item.status === 'dead_letter') {
      item.status = 'pending';
      item.retryCount = 0;
      item.lastError = null;
      item.errorType = null;
      await db.put('operations', item);
    }
  },

  /**
   * Requeue an operation in place with a new payload (used after an
   * optimistic-concurrency conflict is field-merged). The item keeps its
   * id, order, dependencies and retry history so the merge round-trip stays a
   * single queue entry instead of spawning a duplicate op.
   */
  async requeue<T>(id: string, payload: T, updates: Partial<Pick<QueuedOperation, 'conflictCount'>> = {}): Promise<void> {
    const db = await getDb();
    const item = await db.get('operations', id);
    if (!item) return;
    const payloadStr = JSON.stringify(payload);
    item.payload = payload;
    item.payloadSizeBytes = payloadStr.length;
    if (updates.conflictCount !== undefined) item.conflictCount = updates.conflictCount;
    item.status = 'pending';
    item.lastError = null;
    item.errorType = null;
    item.lastAttempt = new Date().toISOString();
    await db.put('operations', item);
  },

  async recordConflict(record: {
    operationId: string | null;
    table: string;
    recordId: string | null;
    conflictedFields: string[];
    resolved: 'auto' | 'review';
    serverVersion: number;
  }): Promise<void> {
    const db = await getDb();
    await db.put('metrics', {
      id: `conflict-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      timestamp: new Date().toISOString(),
      metric: 'sync_conflicts_total',
      value: record,
    });
    const counter = await this.getMeta('conflicts_total');
    await this.setMeta('conflicts_total', Number(counter || 0) + 1);
  },

  async getConflictCount(): Promise<{ auto: number; review: number }> {
    const all = await this.getMetrics();
    return { auto: all.conflictsAuto, review: all.conflictsReview };
  },

  async getConflicts(limit: number = 50): Promise<unknown[]> {
    const db = await getDb();
    const all = await db.getAllFromIndex('metrics', 'by-metric', IDBKeyRange.only('sync_conflicts_total'));
    return all
      .filter((m) => (m.value as { resolved?: string })?.resolved !== undefined)
      .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
      .slice(0, limit)
      .map((m) => m.value);
  },

  async remove(id: string): Promise<void> {
    const db = await getDb();
    await db.delete('operations', id);
  },

  async cleanup(completedRetentionMs: number = 86400000, deadLetterRetentionMs: number = 30 * 86400000, metricsRetentionMs: number = 90 * 86400000): Promise<number> {
    const db = await getDb();
    const cutoff = new Date(Date.now() - completedRetentionMs).toISOString();
    const dlCutoff = new Date(Date.now() - deadLetterRetentionMs).toISOString();
    const metricsCutoff = new Date(Date.now() - metricsRetentionMs).toISOString();
    const all = await db.getAll('operations');
    let removed = 0;
    for (const item of all) {
      if (item.status === 'completed' && item.lastAttempt && item.lastAttempt < cutoff) {
        await db.delete('operations', item.id);
        removed++;
        continue;
      }
      // Dead-letter ops that outlive their retention are archival — their
      // payload is no longer actionable (they were never going to retry) and
      // keeping them bloats the queue forever. They are removed as part of
      // queue compaction.
      if (item.status === 'dead_letter' && item.lastAttempt && item.lastAttempt < dlCutoff) {
        await db.delete('operations', item.id);
        removed++;
      }
    }
    // Conflict/health telemetry records also accumulate. Prune anything older
    // than the metrics retention window so the bounds stay small.
    const metricsAll = await db.getAll('metrics');
    for (const rec of metricsAll) {
      if (rec.timestamp && rec.timestamp < metricsCutoff) {
        await db.delete('metrics', rec.id);
        removed++;
      }
    }
    return removed;
  },

  async countPending(): Promise<number> {
    const db = await getDb();
    return (await db.getAllFromIndex('operations', 'by-status', IDBKeyRange.only('pending'))).length;
  },

  async countFailed(): Promise<number> {
    const db = await getDb();
    return (await db.getAllFromIndex('operations', 'by-status', IDBKeyRange.only('failed'))).length;
  },

  async countDeadLetter(): Promise<number> {
    const db = await getDb();
    return (await db.getAllFromIndex('operations', 'by-status', IDBKeyRange.only('dead_letter'))).length;
  },

  async getAll(status?: QueueStatus): Promise<QueuedOperation[]> {
    const db = await getDb();
    if (status) {
      return db.getAllFromIndex('operations', 'by-status', IDBKeyRange.only(status));
    }
    return db.getAll('operations');
  },

  async getByOperationId(operationId: string): Promise<QueuedOperation | undefined> {
    const db = await getDb();
    const all = await db.getAllFromIndex('operations', 'by-operationId', operationId);
    return all[0];
  },

  async hasPendingMutation(table: string, recordId: string): Promise<boolean> {
    const db = await getDb();
    const activeLayers = await Promise.all(
      (['pending', 'syncing', 'failed'] as QueueStatus[]).map((status) =>
        db.getAllFromIndex('operations', 'by-status', IDBKeyRange.only(status))
      )
    );
    const allActive = ([] as QueuedOperation[]).concat(...activeLayers);
    return allActive.some(
      (op) => op.table === table && op.recordId === recordId
    );
  },

  async retryFailed(): Promise<number> {
    const db = await getDb();
    const failed = await db.getAllFromIndex('operations', 'by-status', IDBKeyRange.only('failed'));
    let count = 0;
    for (const item of failed) {
      await db.put('operations', { ...item, status: 'pending' });
      count++;
    }
    return count;
  },

  async getMetrics(): Promise<QueueMetrics> {
    const db = await getDb();
    const all = await db.getAll('operations');
    const byStatus: Record<string, QueuedOperation[]> = {};
    for (const op of all) {
      if (!byStatus[op.status]) byStatus[op.status] = [];
      byStatus[op.status].push(op);
    }

    const pending = (byStatus.pending || []).length;
    const syncing = (byStatus.syncing || []).length;
    const failed = (byStatus.failed || []).length;
    const completed = (byStatus.completed || []).length;
    const deadLetter = (byStatus.dead_letter || []).length;

    const sortedByCreated = [...(byStatus.pending || [])].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    const oldestPending = sortedByCreated.length > 0 ? sortedByCreated[0].createdAt : null;

    // recordMetric stamps ids with a timestamp suffix (e.g.
    // `last_sync_success-1754...`), so telemetry lookups go through the
    // by-metric index and take the most recent record instead of an exact id.
    const lastSuccessRecs = await db.getAllFromIndex('metrics', 'by-metric', IDBKeyRange.only('last_sync_success'));
    const lastFailureRecs = await db.getAllFromIndex('metrics', 'by-metric', IDBKeyRange.only('last_sync_failure'));
    const latest = (recs: unknown[]) => (recs as { timestamp: string; value: unknown }[])
      .sort((a, b) => b.timestamp.localeCompare(a.timestamp))[0]?.value ?? null;
    const lastSuccess = latest(lastSuccessRecs);
    const lastFailure = latest(lastFailureRecs);

    const retryCounts: Record<number, number> = {};
    for (const op of all) {
      const rc = op.retryCount || 0;
      retryCounts[rc] = (retryCounts[rc] || 0) + 1;
    }

    const totalRetries = all.reduce((sum, op) => sum + (op.retryCount || 0), 0);
    const avgRetryCount = all.length > 0 ? totalRetries / all.length : 0;

    // Real sync latency from the last batch record (previously hardcoded 0).
    let avgSyncLatencyMs = 0;
    try {
      const lastBatch = await db.get('meta', 'last_sync_batch') as { key: string; value?: { durationMs?: number; batchCount?: number } } | undefined;
      if (lastBatch?.value && lastBatch.value.batchCount && lastBatch.value.durationMs) {
        avgSyncLatencyMs = Math.round(lastBatch.value.durationMs / lastBatch.value.batchCount);
      }
    } catch {
      // best-effort latency
    }

    // Conflict telemetry: persisted counter + per-resolution-type tallies.
    const conflictsTotal = Number(await this.getMeta('conflicts_total') || 0);
    const conflictRecords = await db.getAllFromIndex('metrics', 'by-metric', IDBKeyRange.only('sync_conflicts_total'));
    let conflictsAuto = 0;
    let conflictsReview = 0;
    for (const rec of conflictRecords) {
      const r = rec.value as { resolved?: 'auto' | 'review' };
      if (r?.resolved === 'review') conflictsReview++;
      else conflictsAuto++;
    }

    return {
      total: all.length,
      pending,
      syncing,
      failed,
      completed,
      deadLetter,
      oldestPending,
      lastSyncSuccess: lastSuccess as string | null,
      lastSyncFailure: lastFailure as string | null,
      retryHistogram: retryCounts,
      avgRetryCount,
      avgSyncLatencyMs,
      conflictsTotal,
      conflictsAuto,
      conflictsReview,
    };
  },

  async recordMetric(metric: string, value: unknown): Promise<void> {
    const db = await getDb();
    await db.put('metrics', {
      id: `${metric}-${Date.now()}`,
      timestamp: new Date().toISOString(),
      metric,
      value,
    });
  },

  async getMeta(key: string): Promise<unknown | undefined> {
    const db = await getDb();
    const record = await db.get('meta', key);
    return record?.value;
  },

  async setMeta(key: string, value: unknown): Promise<void> {
    const db = await getDb();
    await db.put('meta', { key, value });
  },

  async rebuildDependencyGraph(): Promise<number> {
    const db = await getDb();
    const pending = await db.getAllFromIndex('operations', 'by-status', IDBKeyRange.only('pending'));
    const all = await db.getAll('operations');
    let recovered = 0;
    for (const op of pending) {
      if (op.dependsOn.length > 0) {
        const visited = new Set<string>();
        const path = new Set<string>();
        if (detectCycle(op.dependsOn, all, visited, path)) {
          op.lastError = `Dependency cycle detected and broken: ${op.dependsOn.join(', ')}`;
          op.dependsOn = [];
          await db.put('operations', op);
          recovered++;
        }
      }
    }
    return recovered;
  },

  async destroy(): Promise<void> {
    const db = await getDb();
    db.close();
    dbPromise = null;
    const { deleteDB } = await import('idb');
    await deleteDB(DB_NAME);
  },
};
