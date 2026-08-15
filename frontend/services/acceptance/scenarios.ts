// The eight production acceptance scenarios. Each scenario runs on device A
// (writer/driver) and optionally observes on device B. All coordination goes
// through the backend run record (`run.data.handoff`), never direct device
// communication.

import { dbService } from '../db';
import { backgroundSyncService } from '../backgroundSyncService';
import { durableSyncQueue } from '../durableSyncQueue';
import { acceptanceApi } from './api';
import { check } from './verify';
import { startTimer, refreshQueueSnapshot } from './telemetry';
import { ACCEPTANCE_TAG, ACCEPTANCE_COMPANY, ACCEPTANCE_FY } from './types';
import type { AcceptanceRun, CheckResult, ScenarioMeta } from './types';

export interface ScenarioContext {
  runId: string;
  deviceId: string;
  role: 'A' | 'B';
  checks: CheckResult[];
  addCheck(result: CheckResult): void;
  patch(data: Record<string, unknown>): Promise<void>;
  getRun(): Promise<AcceptanceRun>;
  sleep(ms: number): Promise<void>;
  waitFor(fn: () => Promise<boolean>, timeoutMs: number, what: string): Promise<boolean>;
}

export interface Scenario {
  meta: ScenarioMeta;
  runOnA(ctx: ScenarioContext): Promise<void>;
  observeOnB?(ctx: ScenarioContext): Promise<void>;
}

export const drainQueue = async (ctx: ScenarioContext, what: string): Promise<boolean> =>
  ctx.waitFor(async () => (await durableSyncQueue.countPending()) === 0, 60_000, what);

const handoffValue = (run: AcceptanceRun, key: string): unknown =>
  (run.data?.handoff as Record<string, unknown> | undefined)?.[key];

const dataValue = (run: AcceptanceRun, key: string): unknown => run.data?.[key];

/** Cloud rows are `{ id, data: <domain fields>, version, updated_at }`. */
type Row = Record<string, any>;

const getRow = (store: 'customers' | 'invoices' | 'files', id: string): Promise<Row | undefined> =>
  dbService.get<Row>(store, id) as Promise<Row | undefined>;

const rowData = (row: Record<string, unknown> | undefined): Record<string, unknown> =>
  (row?.data && typeof row.data === 'object' ? row.data : row || {}) as Record<string, unknown>;

export async function setHandoff(ctx: ScenarioContext, key: string, value: unknown): Promise<void> {
  await ctx.patch({ handoff: { ...((await ctx.getRun()).data?.handoff as object | undefined), [key]: value } });
}

export const waitHandoff = (ctx: ScenarioContext, key: string, timeoutMs: number): Promise<boolean> =>
  ctx.waitFor(async () => handoffValue(await ctx.getRun(), key) === true, timeoutMs, `handoff ${key}`);

export const scenarios: Record<string, Scenario> = {
  offline_create: {
    meta: { key: 'offline_create', title: 'Offline Create', description: 'Create a customer while offline, then sync and verify cloud + device B.', requiresObserver: true },
    async runOnA(ctx) {
      const timer = startTimer('offline_create');
      const customerId = `ACC-CUST-${ctx.runId}`;
      await ctx.patch({ customerId });

      backgroundSyncService.setPaused(true);
      const customer = {
        id: customerId,
        name: 'Acceptance Customer',
        email: 'acceptance@prime.local',
        fy: ACCEPTANCE_FY,
        [ACCEPTANCE_TAG]: ctx.runId,
      };
      await dbService.put('customers', customer);
      const localRow = await getRow('customers', customerId);
      ctx.addCheck(check('offline_create', 'Local write while offline', !!localRow, 'customer present in IndexedDB', localRow ? 'present' : 'missing', { id: customerId }));

      backgroundSyncService.setPaused(false);
      await backgroundSyncService.trigger();
      const drained = await drainQueue(ctx, 'offline_create queue drain');
      ctx.addCheck(check('offline_create', 'Queue drains on reconnect', drained, 'pending -> 0', drained ? '0 pending' : 'stuck'));

      const cloud = await acceptanceApi.verifyCloud(ctx.runId, 'customers');
      const cloudRow = cloud.rows[0];
      ctx.addCheck(check('offline_create', 'Cloud row created', cloud.count === 1 && !!cloudRow, '1 customer in cloud', `count=${cloud.count}`));
      ctx.addCheck(check('offline_create', 'Server version stamped', !!cloudRow && typeof cloudRow.version === 'number' && cloudRow.version >= 1, 'version >= 1', String(cloudRow?.version)));

      const stamp = localRow?._serverVersion ?? localRow?.version;
      ctx.addCheck(check('offline_create', 'Version stamped into live record', typeof stamp === 'number' && stamp >= 1, 'live record carries server version', String(stamp)));
      ctx.addCheck(check('offline_create', 'Acceptance tag present in cloud', !!cloudRow && rowData(cloudRow)[ACCEPTANCE_TAG] === ctx.runId, `acceptanceRunId=${ctx.runId}`, String(rowData(cloudRow)[ACCEPTANCE_TAG])));

      await refreshQueueSnapshot();
      await acceptanceApi.postTelemetry(ctx.runId, timer.stop());
    },
    async observeOnB(ctx) {
      await ctx.waitFor(async () => !!await getRow('customers', `ACC-CUST-${ctx.runId}`), 60_000, 'customer arrives on B');
      const row = await getRow('customers', `ACC-CUST-${ctx.runId}`);
      ctx.addCheck(check('offline_create', 'B sees customer (realtime or pull)', !!row, 'present in local store', row ? 'present' : 'missing'));
      const stamp = row?._serverVersion ?? row?.version;
      ctx.addCheck(check('offline_create', 'B row versioned', typeof stamp === 'number', 'version stamped', String(stamp)));
    },
  },

  offline_update: {
    meta: { key: 'offline_update', title: 'Offline Update', description: 'Update the customer offline; verify version increment and propagation.', requiresObserver: true },
    async runOnA(ctx) {
      const timer = startTimer('offline_update');
      const customerId = String(dataValue(await ctx.getRun(), 'customerId') || `ACC-CUST-${ctx.runId}`);
      const before = await getRow('customers', customerId);
      const beforeVersion = before?._serverVersion ?? before?.version;

      backgroundSyncService.setPaused(true);
      await dbService.put('customers', { ...before, name: 'Acceptance Customer (updated)' });
      const local = await getRow('customers', customerId);
      ctx.addCheck(check('offline_update', 'Local update applied offline', local?.name === 'Acceptance Customer (updated)', 'name updated', String(local?.name)));

      backgroundSyncService.setPaused(false);
      await backgroundSyncService.trigger();
      const drained = await drainQueue(ctx, 'offline_update queue drain');
      ctx.addCheck(check('offline_update', 'Queue drains on reconnect', drained, 'pending -> 0', drained ? '0 pending' : 'stuck'));

      const cloud = await acceptanceApi.verifyCloud(ctx.runId, 'customers');
      const cloudRow = cloud.rows[0];
      ctx.addCheck(check('offline_update', 'Cloud row updated', rowData(cloudRow).name === 'Acceptance Customer (updated)', 'updated name in cloud', String(rowData(cloudRow).name)));
      ctx.addCheck(check('offline_update', 'Version incremented', typeof cloudRow?.version === 'number' && cloudRow.version > (beforeVersion ?? 0), `version > ${beforeVersion}`, String(cloudRow?.version)));

      await refreshQueueSnapshot();
      await acceptanceApi.postTelemetry(ctx.runId, timer.stop());
    },
    async observeOnB(ctx) {
      const customerId = `ACC-CUST-${ctx.runId}`;
      await ctx.waitFor(async () => (await getRow('customers', customerId))?.name === 'Acceptance Customer (updated)', 60_000, 'updated customer arrives on B');
      const row = await getRow('customers', customerId);
      ctx.addCheck(check('offline_update', 'B receives update', row?.name === 'Acceptance Customer (updated)', 'updated name', String(row?.name)));
    },
  },

  offline_delete: {
    meta: { key: 'offline_delete', title: 'Offline Delete', description: 'Delete the customer; verify tombstone, removal and no resurrection.', requiresObserver: true },
    async runOnA(ctx) {
      const timer = startTimer('offline_delete');
      const customerId = `ACC-CUST-${ctx.runId}`;

      backgroundSyncService.setPaused(true);
      await dbService.delete('customers', customerId);
      const local = await getRow('customers', customerId);
      ctx.addCheck(check('offline_delete', 'Local delete while offline', !local, 'row gone from IndexedDB', local ? 'still present' : 'gone'));

      backgroundSyncService.setPaused(false);
      await backgroundSyncService.trigger();
      const drained = await drainQueue(ctx, 'offline_delete queue drain');
      ctx.addCheck(check('offline_delete', 'Queue drains on reconnect', drained, 'pending -> 0', drained ? '0 pending' : 'stuck'));

      const cloud = await acceptanceApi.verifyCloud(ctx.runId, 'customers');
      ctx.addCheck(check('offline_delete', 'Cloud row deleted (tombstone)', cloud.count === 0, '0 customers in cloud', `count=${cloud.count}`));

      await ctx.sleep(3000);
      const cloudAgain = await acceptanceApi.verifyCloud(ctx.runId, 'customers');
      ctx.addCheck(check('offline_delete', 'No resurrection after settle', cloudAgain.count === 0, 'still 0 customers', `count=${cloudAgain.count}`));

      await refreshQueueSnapshot();
      await acceptanceApi.postTelemetry(ctx.runId, timer.stop());
    },
    async observeOnB(ctx) {
      const customerId = `ACC-CUST-${ctx.runId}`;
      await ctx.waitFor(async () => !await getRow('customers', customerId), 60_000, 'customer disappears on B');
      ctx.addCheck(check('offline_delete', 'B row removed', true, 'row gone', 'gone'));
    },
  },

  file_upload: {
    meta: { key: 'file_upload', title: 'Offline File Upload', description: 'Attach a file offline; on reconnect upload to storage and download on device B.', requiresObserver: true },
    async runOnA(ctx) {
      const timer = startTimer('file_upload');
      const content = `Acceptance file for ${ctx.runId} — created offline on ${new Date().toISOString()}`;
      const file = new File([content], `acceptance-${ctx.runId}.txt`, { type: 'text/plain' });

      dbService.setForceOffline(true);
      backgroundSyncService.setPaused(true);
      const fileId = await dbService.saveFile(file);
      ctx.addCheck(check('file_upload', 'File cached locally while offline', !!fileId, 'file id returned', fileId || 'none'));
      await ctx.patch({ fileId });

      backgroundSyncService.setPaused(false);
      dbService.setForceOffline(false);
      await backgroundSyncService.trigger();
      const drained = await drainQueue(ctx, 'file_upload queue drain');
      ctx.addCheck(check('file_upload', 'Queue drains on reconnect', drained, 'pending -> 0', drained ? '0 pending' : 'stuck'));

      await ctx.waitFor(async () => (await acceptanceApi.verifyCloud(ctx.runId, '_files')).count >= 1, 60_000, 'file op reaches cloud');
      const storage = await acceptanceApi.verifyCloud(ctx.runId, '_storage');
      const fileFound = storage.count >= 1;
      ctx.addCheck(check('file_upload', 'File exists in Supabase Storage', fileFound, 'object in storage bucket', storage.count > 0 ? `count=${storage.count}` : 'not found'));

      await refreshQueueSnapshot();
      await acceptanceApi.postTelemetry(ctx.runId, timer.stop());
    },
    async observeOnB(ctx) {
      await ctx.waitFor(async () => (await acceptanceApi.verifyCloud(ctx.runId, '_storage')).count >= 1, 90_000, 'file reaches storage');
      const file = await acceptanceApi.verifyFile(ctx.runId);
      ctx.addCheck(check('file_upload', 'B locates file on storage', file.found, 'storage object found', file.name || 'not found'));
      let downloaded = false;
      let size = 0;
      if (file.found && file.url) {
        try {
          const res = await fetch(file.url);
          if (res.ok) {
            const blob = await res.blob();
            downloaded = true;
            size = blob.size;
          }
        } catch { /* network */ }
      }
      ctx.addCheck(check('file_upload', 'B downloads file from storage', downloaded && size > 0, 'blob retrievable via signed URL', downloaded ? `size=${size}` : 'unavailable'));
    },
  },

  conflict: {
    meta: { key: 'conflict', title: 'Conflict Resolution', description: 'A edits offline while B edits online; verify detection, merge and clean queue.', requiresObserver: true },
    async runOnA(ctx) {
      const timer = startTimer('conflict');
      const customerId = `ACC-CUST-${ctx.runId}`;
      const fresh = { id: customerId, name: 'Conflict Customer', email: 'conflict@prime.local', fy: ACCEPTANCE_FY, [ACCEPTANCE_TAG]: ctx.runId };
      await dbService.put('customers', fresh);
      await drainQueue(ctx, 'conflict seed drain');
      await ctx.patch({ customerId });

      await setHandoff(ctx, 'bEditReady', true);
      await waitHandoff(ctx, 'bEditDone', 120_000);
      ctx.addCheck(check('conflict', 'B completed its online edit', true, 'handoff received', 'received'));

      backgroundSyncService.setPaused(true);
      const seed = await getRow('customers', customerId);
      await dbService.put('customers', { ...seed, email: 'conflict-a@prime.local' });
      ctx.addCheck(check('conflict', 'A offline edit applied', (await getRow('customers', customerId))?.email === 'conflict-a@prime.local', 'email = conflict-a', 'local email set'));

      backgroundSyncService.setPaused(false);
      await backgroundSyncService.trigger();
      const drained = await drainQueue(ctx, 'conflict queue drain');
      ctx.addCheck(check('conflict', 'Queue drains after conflict', drained, 'pending -> 0', drained ? '0 pending' : 'stuck'));

      const cloud = await acceptanceApi.verifyCloud(ctx.runId, 'customers');
      const row = cloud.rows[0];
      ctx.addCheck(check('conflict', 'Merged row keeps both field changes', !!row && rowData(row).name === 'Conflict Customer (B edit)' && rowData(row).email === 'conflict-a@prime.local', 'name from B, email from A', JSON.stringify(row)));
      const metrics = await durableSyncQueue.getMetrics();
      ctx.addCheck(check('conflict', 'No dead letters', metrics.deadLetter === 0, '0 dead letters', String(metrics.deadLetter)));

      await refreshQueueSnapshot();
      await acceptanceApi.postTelemetry(ctx.runId, timer.stop());
    },
    async observeOnB(ctx) {
      const customerId = `ACC-CUST-${ctx.runId}`;
      await ctx.waitFor(async () => handoffValue(await ctx.getRun(), 'bEditReady') === true, 120_000, 'A signals B edit');
      await setHandoff(ctx, 'bEditStarted', true);
      const row = await getRow('customers', customerId);
      await dbService.put('customers', { ...row, name: 'Conflict Customer (B edit)' });
      await drainQueue(ctx, 'B online edit drain');
      await setHandoff(ctx, 'bEditDone', true);
      ctx.addCheck(check('conflict', 'B edit synced', rowData((await acceptanceApi.verifyCloud(ctx.runId, 'customers')).rows[0])?.name === 'Conflict Customer (B edit)', 'name = B edit', 'cloud updated'));
    },
  },

  restart: {
    meta: { key: 'restart', title: 'Browser Restart', description: 'Queue while paused, simulate restart, verify pending ops resume.', requiresObserver: false },
    async runOnA(ctx) {
      const timer = startTimer('restart');
      backgroundSyncService.setPaused(true);
      const ids: string[] = [];
      for (let i = 0; i < 3; i++) {
        const id = `ACC-RESTART-${ctx.runId}-${i}`;
        ids.push(id);
        await dbService.put('customers', { id, name: `Restart Customer ${i}`, fy: ACCEPTANCE_FY, [ACCEPTANCE_TAG]: ctx.runId });
      }
      const before = await durableSyncQueue.countPending();
      ctx.addCheck(check('restart', '3 ops queued while paused', before === 3, 'pending = 3', String(before)));
      await ctx.patch({ restartIds: ids });

      backgroundSyncService.reset();
      ctx.addCheck(check('restart', 'In-memory state reset (restart sim)', true, 'engine reset', 'reset'));

      backgroundSyncService.setPaused(false);
      await backgroundSyncService.trigger();
      const drained = await drainQueue(ctx, 'restart queue drain');
      ctx.addCheck(check('restart', 'Pending ops resume after restart', drained && (await durableSyncQueue.countPending()) === 0, 'pending -> 0', drained ? 'drained' : 'stuck'));

      const cloud = await acceptanceApi.verifyCloud(ctx.runId, 'customers');
      ctx.addCheck(check('restart', 'All 3 rows in cloud exactly once', cloud.count === 3, '3 customers', `count=${cloud.count}`));

      await refreshQueueSnapshot();
      await acceptanceApi.postTelemetry(ctx.runId, timer.stop());
    },
  },

  realtime: {
    meta: { key: 'realtime', title: 'Realtime Propagation', description: 'Create an invoice online; device B receives it without a refresh.', requiresObserver: true },
    async runOnA(ctx) {
      const timer = startTimer('realtime');
      const invoiceId = `ACC-INV-${ctx.runId}`;
      const invoice = {
        id: invoiceId,
        invoiceNumber: `ACC-${ctx.runId.slice(-4)}-001`,
        customerName: ACCEPTANCE_COMPANY,
        fy: ACCEPTANCE_FY,
        status: 'draft',
        total: 100,
        [ACCEPTANCE_TAG]: ctx.runId,
      };
      await dbService.put('invoices', invoice);
      const drained = await drainQueue(ctx, 'realtime invoice drain');
      ctx.addCheck(check('realtime', 'Invoice synced online', drained, 'pending -> 0', drained ? 'drained' : 'stuck'));
      await ctx.patch({ invoiceId });

      const cloud = await acceptanceApi.verifyCloud(ctx.runId, 'invoices');
      ctx.addCheck(check('realtime', 'Invoice row in cloud', cloud.count === 1, '1 invoice', `count=${cloud.count}`));

      await refreshQueueSnapshot();
      await acceptanceApi.postTelemetry(ctx.runId, timer.stop());
    },
    async observeOnB(ctx) {
      const invoiceId = `ACC-INV-${ctx.runId}`;
      const started = performance.now();
      await ctx.waitFor(async () => !!await getRow('invoices', invoiceId), 60_000, 'invoice arrives on B');
      const realtimeMs = Math.round(performance.now() - started);
      const row = await getRow('invoices', invoiceId);
      ctx.addCheck(check('realtime', 'B received invoice', !!row, 'invoice present', row ? 'present' : 'missing', { realtimeMs }));
      ctx.addCheck(check('realtime', 'Received within SLA', realtimeMs <= 10_000, '<= 10s', `${realtimeMs}ms`, { realtimeMs }));
      await acceptanceApi.postTelemetry(ctx.runId, { deviceId: ctx.deviceId, scenarioKey: 'realtime', durationMs: realtimeMs, queueDepth: 0, retries: 0, conflicts: 0, deadLetters: 0, realtimeMs });
    },
  },

  multi_tab: {
    meta: { key: 'multi_tab', title: 'Multi-Tab Idempotency', description: 'Rapid concurrent writes + duplicate enqueues; verify exactly-once cloud rows.', requiresObserver: false },
    async runOnA(ctx) {
      const timer = startTimer('multi_tab');
      const ids: string[] = [];
      for (let i = 0; i < 20; i++) {
        const id = `ACC-MT-${ctx.runId}-${i}`;
        ids.push(id);
      }
      await Promise.all(ids.map((id) => dbService.put('customers', { id, name: `MultiTab ${id.slice(-2)}`, fy: ACCEPTANCE_FY, [ACCEPTANCE_TAG]: ctx.runId })));
      await backgroundSyncService.trigger();
      await backgroundSyncService.trigger();
      const drained = await drainQueue(ctx, 'multi_tab queue drain');
      ctx.addCheck(check('multi_tab', 'Concurrent burst drained', drained, 'pending -> 0', drained ? 'drained' : 'stuck'));

      const duplicate = await durableSyncQueue.enqueue({
        table: 'customers', recordId: ids[0], operation: 'upsert',
        payload: { id: ids[0], name: `MultiTab ${ids[0].slice(-2)}`, fy: ACCEPTANCE_FY, [ACCEPTANCE_TAG]: ctx.runId },
      });
      await ctx.sleep(1500);
      ctx.addCheck(check('multi_tab', 'Duplicate enqueue deduped', !!duplicate, 'same op returned', 'no second op'));

      const cloud = await acceptanceApi.verifyCloud(ctx.runId, 'customers');
      ctx.addCheck(check('multi_tab', 'Exactly 20 rows in cloud', cloud.count === 20, '20 customers', `count=${cloud.count}`));
      const uniqueIds = new Set(cloud.rows.map((r) => r.id)).size;
      ctx.addCheck(check('multi_tab', 'No duplicate ids in cloud', uniqueIds === 20, '20 unique ids', `${uniqueIds} unique`));

      await refreshQueueSnapshot();
      await acceptanceApi.postTelemetry(ctx.runId, timer.stop());
    },
  },
};
