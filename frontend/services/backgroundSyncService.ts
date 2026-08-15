import { durableSyncQueue, classifyError, QueuedOperation, QueueMetrics } from './durableSyncQueue';
import { sendSyncOps, SyncOp, SyncOpResult } from './syncApiClient';
import { resolvePushConflict } from './syncConflictResolver';
import { cloudDb } from './cloudDb';
import { audit } from './syncAudit';

type SyncEventType = 'sync-start' | 'sync-complete' | 'sync-failure' | 'sync-partial' | 'queue-empty' | 'queue-full' | 'dead-letter' | 'sync-conflict';
type SyncCallback = (event: SyncEventType, data?: unknown) => void;

interface BatchResult {
  success: number;
  failed: number;
  deadLetter: number;
  skipped: number;
  conflictsResolved: number;
  durationMs: number;
}

interface SyncState {
  isSyncing: boolean;
  lastSyncStart: string | null;
  lastSyncSuccess: string | null;
  lastSyncFailure: string | null;
  consecutiveFailures: number;
  totalSynced: number;
  totalFailed: number;
  conflictsResolved: number;
}

/** Upper bound on automatic field-merge round-trips for a single operation
 *  before the conflict is escalated to the dead-letter queue for review. */
const MAX_CONFLICT_MERGES = 3;

const isClient = typeof window !== 'undefined';

let intervalId: ReturnType<typeof setInterval> | null = null;
let cleanupIntervalId: ReturnType<typeof setInterval> | null = null;
let eventListenersRegistered = false;
let isInitialized = false;

let originalPushState: typeof history.pushState | null = null;
let originalReplaceState: typeof history.replaceState | null = null;

// Simulated-offline gate (used by the acceptance framework). While paused the
// sync engine never sends batches to the gateway, but local writes continue to
// enqueue normally — exactly the offline-first condition.
let paused = false;

function onVisibilityChange() {
  if (document.visibilityState === 'visible') {
    syncOnce(true).catch(() => {});
  }
}

function onOnline() {
  syncOnce(true).catch(() => {});
}

function onPushState(this: typeof history, ...args: Parameters<typeof history.pushState>) {
  setTimeout(() => syncOnce(true).catch(() => {}), 500);
  return originalPushState!.apply(this, args);
}

function onReplaceState(this: typeof history, ...args: Parameters<typeof history.replaceState>) {
  setTimeout(() => syncOnce(true).catch(() => {}), 500);
  return originalReplaceState!.apply(this, args);
}

const state: SyncState = {
  isSyncing: false,
  lastSyncStart: null,
  lastSyncSuccess: null,
  lastSyncFailure: null,
  consecutiveFailures: 0,
  totalSynced: 0,
  totalFailed: 0,
  conflictsResolved: 0,
};

const subscribers = new Map<string, SyncCallback>();

function notify(event: SyncEventType, data?: unknown) {
  for (const cb of subscribers.values()) {
    try { cb(event, data); } catch { /* guard */ }
  }
}

async function processBatch(batchSize: number = 10): Promise<BatchResult> {
  const startTime = Date.now();
  let success = 0;
  let failed = 0;
  let deadLetter = 0;
  let skipped = 0;
  let conflictsResolved = 0;

  const items = await durableSyncQueue.dequeue(batchSize);

  if (items.length === 0) return { success: 0, failed: 0, deadLetter: 0, skipped: 0, conflictsResolved: 0, durationMs: 0 };

  console.log(`[SYNC-FORENSIC] STAGE-5 processBatch() dequeued ${items.length} items`, {
    items: items.map(i => ({ table: i.table, recordId: i.recordId, operation: i.operation, operationId: i.operationId })),
  });

  // Split the batch: business ops go through the backend sync gateway
  // (single write path); file uploads stay direct to Supabase Storage.
  const gatewayOps: { item: QueuedOperation; op: SyncOp }[] = [];
  const fileItems: QueuedOperation[] = [];

  for (const item of items) {
    if (item.fileRef) {
      fileItems.push(item);
    } else {
      gatewayOps.push({
        item,
        op: {
          operationId: item.operationId,
          table: item.table,
          recordId: item.recordId,
          operation: item.operation === 'delete' ? 'delete' : 'upsert',
          payload: item.payload,
        },
      });
    }
  }

  // 1) Business ops → backend gateway (one round-trip for the whole batch).
  let opResults = new Map<string, SyncOpResult>();
  let transportFailed = false;
  if (gatewayOps.length > 0) {
    try {
      const syncPayload = gatewayOps.map(({ op }) => op);
      console.log(`[SYNC-FORENSIC] STAGE-6 sendSyncOps() calling POST /api/sync/ops`, {
        opCount: syncPayload.length,
        tables: syncPayload.map(o => o.table),
        endpoint: 'POST /api/sync/ops',
      });
      const response = await sendSyncOps(syncPayload);
      console.log(`[SYNC-FORENSIC] STAGE-6 sendSyncOps() response`, {
        ok: response.ok,
        processed: response.processed,
        succeeded: response.succeeded,
        results: response.results.map(r => ({
          operationId: r.operationId,
          ok: r.ok,
          version: r.version,
          conflict: r.conflict,
          error: r.error,
          replayed: r.replayed,
          noop: r.noop,
        })),
      });
      for (const result of response.results) {
        if (result.operationId) opResults.set(result.operationId, result);
      }
    } catch (err) {
      // Transport failure: the entire batch is retryable. Mark items failed
      // and bail before the settle loop so they aren't marked completed.
      transportFailed = true;
      const errorMessage = err instanceof Error ? err.message : String(err);
      const errorType = classifyError(errorMessage);
      console.error(`[SYNC-FORENSIC] STAGE-6 sendSyncOps() TRANSPORT FAILURE`, {
        error: errorMessage,
        errorType,
        opCount: gatewayOps.length,
      });
      for (const { item } of gatewayOps) {
        await durableSyncQueue.markFailed(item.id, errorMessage);
        if (errorType === 'permanent') deadLetter++;
        else failed++;
      }
    }
  }

  const settleItem = async (item: QueuedOperation, result: SyncOpResult | undefined) => {
    if (!result || result.ok) {
      await durableSyncQueue.markCompleted(item.id);

      // Stamp the server-stamped version back into the live record (bulkPut:
      // no re-enqueue) so the next edit carries a valid optimistic-concurrency
      // base and never trips a `version_required` round-trip. Ambiguous or
      // non-business tables are skipped and self-heal through the merge path.
      const serverVersion = result ? Number(result.version) : NaN;
      const stampedPayload = (item.payload ?? {}) as Record<string, unknown>;
      if (Number.isFinite(serverVersion) && item.table !== '_files' && stampedPayload.id) {
        try {
          const { dbService, getStoreForCloudTable } = await import('./db');
          const storeName = getStoreForCloudTable(item.table);
          if (storeName) {
            const live = await dbService.get<Record<string, unknown>>(storeName as never, String(stampedPayload.id));
            if (live && typeof live === 'object') {
              (live as Record<string, unknown>)._version = serverVersion;
              (live as Record<string, unknown>).version = serverVersion;
              await dbService.bulkPut(storeName as never, [live]);
            }
          }
        } catch {
          // best-effort version stamp
        }
      }
      return 'success';
    }
    // Optimistic-concurrency conflict: the gateway rejected the write because
    // another device committed a newer version. Holds a current server snapshot
    // so we can field-merge and requeue in place — no extra round-trip.
    if (result.conflict && result.server) {
      return resolveConflict(item, result);
    }
    // Per-op rejection from the gateway: dead-letter permanent errors,
    // keep retrying transient ones.
    const errorMessage = result.error || 'Sync gateway rejected the operation';
    const permanent = result.retryable === false || classifyError(errorMessage) === 'permanent';
    await durableSyncQueue.markFailed(item.id, errorMessage);
    return permanent ? 'deadLetter' : 'failed';
  };

  const resolveConflict = async (item: QueuedOperation, result: SyncOpResult): Promise<'success' | 'deadLetter' | 'conflict'> => {
    const serverVersion = Number(result.server?.version ?? 0);
    const table = item.table;
    const recordId = item.recordId;

    const recordConflict = async (resolved: 'auto' | 'review', conflictedFields: string[]) => {
      await durableSyncQueue.recordConflict({
        operationId: item.operationId,
        table,
        recordId,
        conflictedFields,
        resolved,
        serverVersion,
      });
      notify('sync-conflict', {
        table,
        recordId,
        operation: item.operation,
        resolved,
        conflictedFields,
        serverVersion,
      });
    };

    // Deletes are tombstones that always bind; a conflict only means a
    // concurrent upsert raced ahead of the delete — the delete intent stands.
    if (item.operation === 'delete') {
      await durableSyncQueue.markCompleted(item.id);
      state.conflictsResolved++;
      conflictsResolved++;
      await durableSyncQueue.recordConflict({
        operationId: item.operationId,
        table,
        recordId,
        conflictedFields: [],
        resolved: 'auto',
        serverVersion,
      });
      // Hard-delete the tombstoned record from IndexedDB now that the
      // cloud has confirmed the delete.  This prevents tombstones from
      // accumulating locally forever.
      try {
        const { dbService, getStoreForCloudTable } = await import('./db');
        const localStore = getStoreForCloudTable(table);
        if (localStore && recordId) {
          await dbService.hardDelete(localStore as any, recordId);
        }
      } catch {
        // best-effort cleanup — the tombstone is harmless if left behind
      }
      return 'success';
    }

    const localPayload = (item.payload ?? {}) as Record<string, unknown>;
    const resolution = resolvePushConflict(localPayload, result.server.data, {
      version: serverVersion,
      updatedAt: result.server?.updatedAt,
    });

    // No local delta vs the server row — the conflicting update already
    // captured our intent (or only timestamps diverged). No re-push needed.
    if (resolution.converged) {
      await durableSyncQueue.markCompleted(item.id);
      state.conflictsResolved++;
      conflictsResolved++;
      await recordConflict(resolution.conflictedFields.length > 0 ? 'review' : 'auto', resolution.conflictedFields);
      return 'success';
    }

    const mergeCount = (item.conflictCount || 0) + 1;
    if (mergeCount > MAX_CONFLICT_MERGES) {
      // Back-and-forth on the same record with no convergence — stop looping
      // and leave it visible for manual review/retry.
      const reason = resolution.conflictedFields.length > 0
        ? `CONFLICT requires review — same-field edits: ${resolution.conflictedFields.join(', ')}`
        : 'CONFLICT requires review — repeated versioning conflicts';
      await durableSyncQueue.deadLetter(item.id, reason);
      state.totalFailed++;
      await recordConflict('review', resolution.conflictedFields);
      notify('dead-letter', { table, recordId, reason });
      return 'deadLetter';
    }

    // Requeue the field-merged payload with the fresh base version. It is
    // picked up by the next batch in this sync pass (or the next interval).
    await durableSyncQueue.requeue(item.id, resolution.merged, { conflictCount: mergeCount });
    state.conflictsResolved++;
    conflictsResolved++;
    await recordConflict(resolution.conflictedFields.length > 0 ? 'review' : 'auto', resolution.conflictedFields);
    return 'conflict';
  };

  for (const { item } of gatewayOps) {
    if (transportFailed) {
      // Already handled in the transport-failure catch above.
      continue;
    }
    const outcome = await settleItem(item, opResults.get(item.operationId));
    console.log(`[SYNC-FORENSIC] STAGE-7 settleItem()`, {
      table: item.table,
      recordId: item.recordId,
      operationId: item.operationId,
      outcome,
      serverVersion: opResults.get(item.operationId)?.version,
    });
    if (outcome === 'success') {
      // Mark the local record as synced so the FY migration is idempotent
      // and the record is never re-queued. Uses bulkPut (no re-enqueue).
      if (item.table === 'financial_years' && item.recordId) {
        try {
          const { dbService } = await import('./db');
          const record = await dbService.get<any>('financialYears', item.recordId);
          if (record && !record.deletedAt) {
            record.syncStatus = 'synced';
            record.lastSyncedAt = new Date().toISOString();
            record._cloudSource = true;
            await dbService.bulkPut('financialYears', [record]);
          }
        } catch {
          // best-effort status write
        }
      }
      success++;
    } else if (outcome === 'deadLetter') {
      deadLetter++;
    } else if (outcome === 'conflict') {
      // Field-merged and requeued; it re-runs in the next batch of this pass.
      // conflictsResolved was already incremented inside resolveConflict so
      // delete/converged/requeue resolutions all count exactly once.
    } else {
      failed++;
    }
  }

  // 2) File uploads → direct Supabase Storage (large binaries bypass the
  // backend so the gateway never becomes a bandwidth bottleneck).
  const filePromises = fileItems.map(async (item) => {
    try {
      // Blobs live in the canonical PrimeERP IndexedDB `files` store
      // (written by dbService.uploadFile); never open a separate database —
      // a mismatched DB name would silently never find the blob.
      const { dbService } = await import('./db');
      const blob = await dbService.getFileBlob(item.fileRef);
      if (!blob) {
        await durableSyncQueue.markFailed(item.id, 'File blob missing locally — upload cannot proceed');
        deadLetter++;
        return;
      }
      await cloudDb.uploadFile(blob as File, 'documents', item.operationId);
      await durableSyncQueue.markCompleted(item.id);
      success++;
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      const errorType = classifyError(errorMessage);
      await durableSyncQueue.markFailed(item.id, errorMessage);
      if (errorType === 'permanent') deadLetter++;
      else failed++;
    }
  });

  const settled = await Promise.allSettled(filePromises);
  for (const result of settled) {
    if (result.status === 'rejected') {
      skipped++;
    }
  }

  const durationMs = Date.now() - startTime;
  state.lastSyncStart = new Date().toISOString();

  return { success, failed, deadLetter, skipped, conflictsResolved, durationMs };
}

async function syncOnce(force: boolean = false): Promise<BatchResult | null> {
  // Never run two sync passes concurrently — forced syncs (navigation, online,
  // visibility) previously bypassed this guard and flooded the network with
  // overlapping cloud writes.
  if (state.isSyncing) {
    console.log(`[SYNC-FORENSIC] syncOnce() SKIPPED — already syncing`);
    return null;
  }

  // Simulated offline: the acceptance framework (and any user who wants a
  // true airplane mode) pauses network sync while local writes keep queuing.
  if (paused) {
    console.log(`[SYNC-FORENSIC] syncOnce() SKIPPED — paused (simulated offline)`);
    return null;
  }

  // Cheap short-circuit: when nothing is pending there is nothing to do, so we
  // avoid the heavy getMetrics()/dequeue() scans that fired on every page
  // navigation and every background interval tick.
  //
  // CRITICAL: retry failed operations first. When the device goes offline
  // mid-sync, the transport failure catch marks pending ops as `failed`.
  // On reconnect, `countPending()` returns 0 because the items are `failed`,
  // so `syncOnce()` would skip forever. Retrying them restores them to
  // `pending` so the normal dequeue path picks them up.
  try {
    await durableSyncQueue.retryFailed();
  } catch {
    // non-fatal
  }

  let pendingCount = 0;
  try {
    pendingCount = await durableSyncQueue.countPending();
    if (pendingCount === 0) {
      console.log(`[SYNC-FORENSIC] syncOnce() SKIPPED — 0 pending ops`);
      return null;
    }
  } catch {
    // If the count fails, proceed anyway.
  }

  console.log(`[SYNC-FORENSIC] syncOnce() START`, { pendingCount, force, consecutiveFailures: state.consecutiveFailures });
  state.isSyncing = true;

  try {
    const metricsBefore: QueueMetrics = await durableSyncQueue.getMetrics();
    const totalBefore = metricsBefore.total;

    let totalSuccess = 0;
    let totalFailed = 0;
    let totalDeadLetter = 0;
    let totalSkipped = 0;
    let totalConflicts = 0;
    let totalDuration = 0;
    let batchCount = 0;

    const maxBatches = 5;

    // Batch size scales with what's actually queued so a burst of offline edits
    // isn't serialized through tiny 10-item batches, while a sparse queue stays
    // small and responsive. Capped to keep a single request well under the
    // gateway limit.
    let batchSize = 10;
    try {
      const pendingCount = await durableSyncQueue.countPending();
      if (pendingCount > 40) batchSize = 25;
      else if (pendingCount > 20) batchSize = 15;
    } catch {
      batchSize = 10;
    }

    for (let i = 0; i < maxBatches; i++) {
      const result = await processBatch(batchSize);
      if (result.success === 0 && result.failed === 0 && result.deadLetter === 0 && result.skipped === 0 && result.conflictsResolved === 0) break;

      totalSuccess += result.success;
      totalFailed += result.failed;
      totalDeadLetter += result.deadLetter;
      totalSkipped += result.skipped;
      totalConflicts += result.conflictsResolved;
      totalDuration += result.durationMs;
      batchCount++;
    }

    state.totalSynced += totalSuccess;
    state.totalFailed += totalFailed + totalDeadLetter;

    const metricsAfter: QueueMetrics = await durableSyncQueue.getMetrics();

    await durableSyncQueue.setMeta('last_sync_batch', {
      timestamp: new Date().toISOString(),
      success: totalSuccess,
      failed: totalFailed,
      deadLetter: totalDeadLetter,
      conflictsResolved: totalConflicts,
      durationMs: totalDuration,
      batchCount,
      totalBefore,
      totalAfter: metricsAfter.total,
    });

    if (totalFailed > 0 || totalDeadLetter > 0) {
      state.consecutiveFailures++;
      state.lastSyncFailure = new Date().toISOString();
      await durableSyncQueue.recordMetric('last_sync_failure', state.lastSyncFailure);
      notify('sync-failure', { failed: totalFailed, deadLetter: totalDeadLetter, totalBefore });
    } else if (totalSuccess > 0) {
      state.consecutiveFailures = 0;
      state.lastSyncSuccess = new Date().toISOString();
      await durableSyncQueue.recordMetric('last_sync_success', state.lastSyncSuccess);
      notify('sync-complete', { synced: totalSuccess, totalBefore });
    }

    if (totalBefore > 0 && metricsAfter.total === 0) {
      notify('queue-empty');
    }

    console.log(`[SYNC-FORENSIC] syncOnce() COMPLETE`, {
      totalSuccess, totalFailed, totalDeadLetter, totalConflicts, totalDuration, batchCount,
      pendingAfter: metricsAfter.total,
    });
    return { success: totalSuccess, failed: totalFailed, deadLetter: totalDeadLetter, skipped: totalSkipped, conflictsResolved: totalConflicts, durationMs: totalDuration };
  } catch (err) {
    state.consecutiveFailures++;
    state.lastSyncFailure = new Date().toISOString();
    await durableSyncQueue.recordMetric('last_sync_failure', state.lastSyncFailure);
    notify('sync-failure', { error: err instanceof Error ? err.message : String(err) });
    console.error(`[SYNC-FORENSIC] syncOnce() EXCEPTION`, { error: err instanceof Error ? err.message : String(err) });
    return null;
  } finally {
    state.isSyncing = false;
  }
}

function getBackoffInterval(): number {
  const base = 15000;
  const maxInterval = 600000;
  const multiplier = Math.min(state.consecutiveFailures, 8);
  return Math.min(base * Math.pow(2, multiplier), maxInterval);
}

async function runCleanup(): Promise<void> {
  try {
    const removed = await durableSyncQueue.cleanup(86400000);
    if (removed > 0) {
      await durableSyncQueue.recordMetric('cleanup_removed', removed);
    }
  } catch {
    // cleanup errors are non-fatal
  }
}

async function reportHealth(): Promise<void> {
  try {
    const metrics = await durableSyncQueue.getMetrics();
    const stuckThreshold = 300000;
    if (metrics.oldestPending) {
      const oldestAge = Date.now() - new Date(metrics.oldestPending).getTime();
      if (oldestAge > stuckThreshold && metrics.pending > 0) {
        notify('queue-full', { oldestAge, pending: metrics.pending });
      }
    }
  } catch {
    // health check errors are non-fatal
  }
}

if (isClient) {
  if ('onvisibilitychange' in document) {
    document.addEventListener('visibilitychange', onVisibilityChange);
  }
  if (typeof navigator !== 'undefined' && 'onLine' in navigator) {
    window.addEventListener('online', onOnline);
  }
  originalPushState = history.pushState.bind(history);
  originalReplaceState = history.replaceState.bind(history);
  history.pushState = onPushState;
  history.replaceState = onReplaceState;
}

export const backgroundSyncService = {
  get state(): Readonly<SyncState> { return state; },

  async initialize(): Promise<void> {
    if (isInitialized) return;
    isInitialized = true;

    const recovered = await durableSyncQueue.rebuildDependencyGraph();
    if (recovered > 0) {
      await durableSyncQueue.recordMetric('graph_recovered', recovered);
    }

    await this.startPeriodicSync();
    await runCleanup();
  },

  startPeriodicSync(intervalMs?: number): void {
    if (intervalId) clearInterval(intervalId);

    audit('push', 'backgroundSyncService startPeriodicSync', { intervalMs });

    const doSync = async () => {
      try {
        audit('push', 'syncOnce begin', {});
        await syncOnce();
        audit('push', 'syncOnce end', {});
      } catch {
        // background sync errors are handled internally
      }
    };

    doSync();
    intervalId = setInterval(doSync, intervalMs ?? getBackoffInterval());

    if (!cleanupIntervalId) {
      cleanupIntervalId = setInterval(runCleanup, 3600000);
    }

    if (!eventListenersRegistered) {
      eventListenersRegistered = true;
      if (isClient && 'onvisibilitychange' in document) {
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'visible') {
            const newInterval = getBackoffInterval();
            if (intervalId) {
              clearInterval(intervalId);
              intervalId = setInterval(doSync, newInterval);
            }
            doSync();
            runCleanup();
            reportHealth();
          }
        });
      }
      if (isClient && typeof navigator !== 'undefined' && 'onLine' in navigator) {
        window.addEventListener('online', () => {
          state.consecutiveFailures = 0;
          const newInterval = getBackoffInterval();
          if (intervalId) {
            clearInterval(intervalId);
            intervalId = setInterval(doSync, newInterval);
          }
          doSync();
        });
      }
    }
  },

  stopPeriodicSync(): void {
    if (intervalId) {
      clearInterval(intervalId);
      intervalId = null;
    }
    if (cleanupIntervalId) {
      clearInterval(cleanupIntervalId);
      cleanupIntervalId = null;
    }
  },

  async syncNow(force: boolean = true): Promise<BatchResult | null> {
    return syncOnce(force);
  },

  async getMetrics(): Promise<QueueMetrics> {
    return durableSyncQueue.getMetrics();
  },

  async retryDeadLetter(id: string): Promise<void> {
    await durableSyncQueue.retryDeadLetter(id);
  },

  async retryAllFailed(): Promise<number> {
    return durableSyncQueue.retryFailed();
  },

  async getState(): Promise<SyncState & { queueMetrics: QueueMetrics }> {
    const metrics = await durableSyncQueue.getMetrics();
    return { ...state, queueMetrics: metrics };
  },

  subscribe(id: string, callback: SyncCallback): () => void {
    subscribers.set(id, callback);
    return () => { subscribers.delete(id); };
  },

  async exportQueue(): Promise<QueuedOperation[]> {
    return durableSyncQueue.getAll();
  },

  /** Conflict records (auto-resolved + flagged-for-review) for dashboards/UI. */
  async getConflicts(limit?: number): Promise<unknown[]> {
    return durableSyncQueue.getConflicts(limit);
  },

  async getConflictCount(): Promise<{ auto: number; review: number }> {
    return durableSyncQueue.getConflictCount();
  },

  triggerImmediateSync(): void {
    syncOnce(true).catch(() => {});
  },

  /** Alias for syncNow — used by syncService.ts */
  async trigger(): Promise<BatchResult | null> {
    return syncOnce(true);
  },

  /** True while the sync engine is in simulated-offline mode. */
  isPaused(): boolean {
    return paused;
  },

  /** Pause/resume network sync without touching the local queue. */
  setPaused(value: boolean): void {
    paused = value;
  },

  /** Alias for initialize — used by syncService.ts */
  start(): void {
    this.initialize().catch(() => {});
  },

  /** Reset internal state for test isolation */
  reset(): void {
    state.isSyncing = false;
    paused = false;
    state.lastSyncStart = null;
    state.lastSyncSuccess = null;
    state.lastSyncFailure = null;
    state.consecutiveFailures = 0;
    state.totalSynced = 0;
    state.totalFailed = 0;
    state.conflictsResolved = 0;
    subscribers.clear();
    this.stopPeriodicSync();
    eventListenersRegistered = false;
    isInitialized = false;
  },
};
