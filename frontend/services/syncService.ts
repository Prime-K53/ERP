import { supabase } from './supabaseClient';
import { dbService } from './db';
import { mergeRecords, fieldLevelMerge } from './syncConflictResolver';
import { durableSyncQueue } from './durableSyncQueue';
import { logger } from './logger';
import { initAudit, audit } from './syncAudit';

// ---------------------------------------------------------------------------
// Cross-device sync notification helpers
// After writing a realtime payload to IndexedDB, we must tell the React layer
// (DataContext / Zustand stores) to re-read. Two channels are used so that
// both same-tab contexts and other tabs in the same browser are notified.
// ---------------------------------------------------------------------------

let _broadcastChannel: BroadcastChannel | null = null;

function getBroadcastChannel(): BroadcastChannel | null {
  if (typeof BroadcastChannel === 'undefined') return null;
  if (!_broadcastChannel) {
    try {
      _broadcastChannel = new BroadcastChannel('primeerp-data-sync');
    } catch {
      return null;
    }
  }
  return _broadcastChannel;
}

/**
 * Emit a data-changed notification so that DataContext.queueRefresh() picks
 * it up and the React layer re-renders with the newly written IndexedDB data.
 */
function emitDataChanged(table: string, eventType: string) {
  if (typeof window === 'undefined') return;
  try {
    window.dispatchEvent(
      new CustomEvent('primeerp:data-changed', {
        detail: { source: 'realtime-sync', table, eventType }
      })
    );
  } catch { /* best-effort */ }
  try {
    getBroadcastChannel()?.postMessage({ type: 'data-changed', source: 'realtime-sync', table, eventType });
  } catch { /* best-effort */ }
}

const SUPABASE_ENABLED = Boolean(
  import.meta.env.VITE_SUPABASE_URL &&
  import.meta.env.VITE_SUPABASE_ANON_KEY &&
  import.meta.env.VITE_SUPABASE_URL !== 'https://placeholder.supabase.co'
);

const PUSH_INTERVAL_MS = 60000;
const SYNC_CONCURRENCY = 6;
// Pull pages per table per pass. Keeps one pass bounded even for huge tables
// (e.g. a fresh install pulling 200k products), while still advancing the
// cursor so the NEXT pass continues instead of restarting the page.
const PULL_PAGE_SIZE = 2000;
const MAX_PULL_ROWS_PER_TABLE_PER_PASS = 50000;
let pushTimer: ReturnType<typeof setInterval> | null = null;
let realtimeSubscribed = false;
let realtimeChannels: any[] = [];
let subscriptionGeneration = 0; // incremented on each unsubscribe to cancel stale async inits
let syncLifecycleActive = false; // idempotency guard — prevents duplicate initial pulls / subscriptions

export interface SyncProgress {
  totalStores: number;
  completedStores: number;
  currentStore: string;
  phase: 'pull' | 'push' | 'done';
}

const STORE_TO_TABLE: Record<string, string> = {
  warehouses: 'warehouses',
  inventory: 'products',
  ledger: 'ledger_entries',
  batches: 'production_batches',
  resources: 'production_resources',
  workCenters: 'work_centers',
  workOrders: 'work_orders',
  salesOrders: 'sales_orders',
  userGroups: 'user_groups',
  bomTemplates: 'bom_templates',
  boms: 'boms',
  bankAccounts: 'bank_accounts',
  customerPayments: 'customer_payments',
  examinationBatches: 'examination_batches',
  auditLogs: 'audit_logs',
  goodsReceipts: 'goods_receipts',
  supplierPayments: 'supplier_payments',
  resourceAllocations: 'resource_allocations',
  profitMarginSettings: 'profit_margin_settings',
  marketAdjustments: 'market_adjustments',
  materialCategories: 'material_categories',
  taxRates: 'tax_rates',
  warehouseInventory: 'warehouse_inventory',
  materialBatches: 'material_batches',
  inventoryTransactions: 'inventory_transactions',
  materialReservations: 'material_reservations',
  bankTransactions: 'bank_transactions',
  bankStatements: 'bank_statements',
  bankScheduledPayments: 'bank_scheduled_payments',
  bankExchangeRates: 'bank_exchange_rates',
  bankFees: 'bank_fees',
  bankReconciliations: 'bank_reconciliations',
  bankAdjustments: 'bank_adjustments',
  bankCashFlowForecasts: 'bank_cash_flow_forecasts',
  bankAlerts: 'bank_alerts',
  bankCategories: 'bank_categories',
  idempotencyKeys: 'idempotency_keys',
  customerNotificationLogs: 'customer_notification_logs',
  whatsappChats: 'whatsapp_chats',
  whatsappTemplates: 'whatsapp_templates',
  whatsappCampaigns: 'whatsapp_campaigns',
  whatsappAutomations: 'whatsapp_automations',
  vatTransactions: 'vat_transactions',
  vatReturns: 'vat_returns',
  roundingLogs: 'rounding_logs',
  examinationJobs: 'examination_jobs',
  examinationJobSubjects: 'examination_job_subjects',
  examinationInvoiceGroups: 'examination_invoice_groups',
  examinationRecurringProfiles: 'examination_recurring_profiles',
  examinationInventoryDeductions: 'examination_inventory_deductions',
  examinationBatchNotifications: 'examination_batch_notifications',
  smsCampaigns: 'sms_campaigns',
  smsTemplates: 'sms_templates',
  subcontractOrders: 'subcontract_orders',
  maintenanceLogs: 'maintenance_logs',
  jobTickets: 'job_tickets',
  jobTicketSettings: 'job_ticket_settings',
  jobOrders: 'job_orders',
  examJobs: 'examination_jobs',
  examPapers: 'examination_papers',
  examPrintingBatches: 'examination_printing_batches',
  salesExchanges: 'sales_exchanges',
  salesExchangeItems: 'sales_exchange_items',
  reprintJobs: 'reprint_jobs',
  salesExchangeApprovals: 'sales_exchange_approvals',
  marketAdjustmentTransactions: 'market_adjustment_transactions',
  notificationAuditLogs: 'notification_audit_logs',
  classes: 'classes',
  subjects: 'subjects',
  recurringInvoices: 'recurring_invoices',
  scheduledPayments: 'scheduled_payments',
  walletTransactions: 'wallet_transactions',
  deliveryNotes: 'delivery_notes',
  payrollRuns: 'payroll_runs',
  expenses: 'expenses',
  income: 'income',
  budgets: 'budgets',
  transfers: 'transfers',
  cheques: 'cheques',
  employees: 'employees',
  payslips: 'payslips',
  subscribers: 'subscribers',
  shipments: 'shipments',
  schools: 'schools',
  financialYears: 'financial_years',
  userPreferences: 'user_preferences',
  tasks: 'tasks',
};

const TABLES_TO_SYNC = [
  'userGroups', 'inventory', 'warehouses', 'customers', 'suppliers',
  'sales', 'invoices', 'purchases', 'accounts', 'ledger',
  'settings', 'reminders',
  'workCenters', 'workOrders', 'batches', 'resources',
  'salesOrders', 'quotations', 'orders',
  'jobOrders', 'salesExchanges', 'reprintJobs',
  'examinationBatches', 'examinationJobs',
  'bomTemplates', 'boms', 'profitMarginSettings', 'marketAdjustments',
  'bankAccounts', 'bankTransactions', 'bankStatements',
  'customerPayments', 'supplierPayments', 'goodsReceipts',
  'recurringInvoices', 'scheduledPayments', 'walletTransactions',
  'deliveryNotes', 'payrollRuns',
  'vatTransactions', 'vatReturns', 'roundingLogs',
  'expenses', 'income', 'budgets', 'transfers', 'cheques',
  'employees', 'payslips',
  'materialCategories', 'warehouseInventory', 'materialBatches',
  'inventoryTransactions', 'materialReservations',
  'jobTickets', 'jobTicketSettings', 'resourceAllocations',
  'examinationJobSubjects', 'examinationInvoiceGroups',
  'examinationRecurringProfiles', 'examinationInventoryDeductions',
  'examinationBatchNotifications',
  'examPapers', 'examPrintingBatches',
  'salesExchangeItems', 'salesExchangeApprovals',
  'subcontractOrders', 'maintenanceLogs', 'classes', 'subjects',
  'subscribers', 'shipments', 'schools', 'tasks',
  'financialYears',
  'userPreferences',
  'bankScheduledPayments', 'bankExchangeRates', 'bankFees',
  'bankReconciliations', 'bankAdjustments', 'bankCashFlowForecasts',
  'bankAlerts', 'bankCategories',
  'smsCampaigns', 'smsTemplates',
  'marketAdjustmentTransactions', 'notificationAuditLogs',
  'whatsappChats', 'whatsappTemplates', 'whatsappCampaigns', 'whatsappAutomations',
  'taxRates',
  'customerNotificationLogs',
];

const getTable = (storeName: string): string => STORE_TO_TABLE[storeName] || storeName;

const toCloudRecord = (record: any) => {
  const { data: jsonData, updated_at, ...rest } = record;
  const serverUpdatedAt = typeof updated_at === 'string' ? updated_at : undefined;
  return {
    id: record.id,
    ...rest,
    ...(jsonData || {}),
    ...(serverUpdatedAt ? { updated_at: serverUpdatedAt, _updatedAt: serverUpdatedAt, serverUpdatedAt } : {}),
    _cloudSource: true,
  };
};

async function ensureSession() {
  const { data: { session } } = await supabase.auth.getSession();
  if (session) return session;
  try {
    const { data: { session: refreshed } } = await supabase.auth.refreshSession();
    if (refreshed) return refreshed;
  } catch {
    // Refresh token expired or invalid — skip sync, fall back to local
  }
  return null;
}

const LAST_SYNC_META_PREFIX = 'last_synced_at:';

/**
 * Get the last successful sync timestamp for a given table
 */
async function getLastSyncAt(table: string): Promise<string | null> {
  try {
    const val = await durableSyncQueue.getMeta(`${LAST_SYNC_META_PREFIX}${table}`);
    return val as string | null;
  } catch {
    return null;
  }
}

/**
 * Save the last successful sync timestamp for a given table
 */
async function setLastSyncAt(table: string, timestamp: string): Promise<void> {
  await durableSyncQueue.setMeta(`${LAST_SYNC_META_PREFIX}${table}`, timestamp);
}

/**
 * Pull data from Supabase into local IndexedDB cache using incremental sync.
 * Only fetches rows updated since last sync per table.
 * Falls back to full sync if no prior sync exists.
 */
export async function pullRemoteChanges(
  onProgress?: (progress: SyncProgress) => void,
  forceFullSync: boolean = false
): Promise<{ pulled: number; errors: string[] }> {
  if (!SUPABASE_ENABLED) {
    console.log(`[SYNC-FORENSIC] pullRemoteChanges() SKIPPED — Supabase not enabled`);
    return { pulled: 0, errors: [] };
  }

  const session = await ensureSession();
  if (!session) {
    console.log(`[SYNC-FORENSIC] pullRemoteChanges() SKIPPED — not authenticated`);
    return { pulled: 0, errors: ['Not authenticated'] };
  }

  console.log(`[SYNC-FORENSIC] PULL-START pullRemoteChanges()`, { forceFullSync, tableCount: TABLES_TO_SYNC.length });
  const errors: string[] = [];
  let pulled = 0;
  const totalStores = TABLES_TO_SYNC.length;
  let completedStores = 0;

  for (let i = 0; i < totalStores; i += SYNC_CONCURRENCY) {
    const batch = TABLES_TO_SYNC.slice(i, i + SYNC_CONCURRENCY);

    const results = await Promise.allSettled(
      batch.map(async (storeName) => {
        const table = getTable(storeName);
        let storeCount = 0;

        try {
          // Incremental sync: only fetch rows updated since last sync.
          // Rows are paged so a table with more updated rows than the gateway's
          // single-request limit still fully converges instead of truncating.
          const pageSize = PULL_PAGE_SIZE;
          let offset = 0;
          let lastTimestamp: string | null = null;
          let rowsInPass = 0;

          while (rowsInPass < MAX_PULL_ROWS_PER_TABLE_PER_PASS) {
            let query = supabase.from(table).select('*');

            // Incremental sync: only fetch rows updated since last sync
            if (!forceFullSync) {
              const lastSyncAt = await getLastSyncAt(table);
              if (lastSyncAt) {
                query = query.gte('updated_at', lastSyncAt);
              }
            }

            const { data, error } = await query
              .order('updated_at', { ascending: true })
              .range(offset, offset + pageSize - 1);

            if (error) { errors.push(`${storeName}: ${error.message}`); break; }
            if (!data || data.length === 0) break;

            const cloudRecords = data.map((record: any) => toCloudRecord(record));

            console.log(`[SYNC-FORENSIC] PULL-PAGE ${table}: fetched ${cloudRecords.length} rows (offset=${offset})`);

            // Apply field-level merge for existing records, skip for new ones
            // All cloud records are marked _cloudSource: true so they don't trigger re-sync
            const mergedRecords = [];
            for (const cloudRecord of cloudRecords) {
              // Server-side tombstone (soft delete via the sync gateway):
              // reconcile locally as a delete, never resurrect the row.
              if (cloudRecord.deleted === true) {
                const existing = await dbService.get(storeName, cloudRecord.id);
                if (existing && !(existing as Record<string, unknown>).deletedAt) {
                  await dbService.delete(storeName, cloudRecord.id, { cloudSource: true });
                }
                continue;
              }
              const existing = await dbService.get(storeName, cloudRecord.id);
              if (existing) {
                const pendingMutation = await durableSyncQueue.hasPendingMutation(table, cloudRecord.id);
                if (pendingMutation) {
                  console.log(`[SYNC-FORENSIC] PULL-SKIP-MERGE ${table}/${cloudRecord.id} — has pending local mutation`);
                  continue;
                }
                const merged = fieldLevelMerge(existing, cloudRecord);
                if (cloudRecord.serverUpdatedAt) {
                  merged.serverUpdatedAt = cloudRecord.serverUpdatedAt;
                }
                merged._cloudSource = true;
                await dbService.put(storeName, merged, { cloudSource: true });
              } else {
                mergedRecords.push(cloudRecord as Record<string, unknown>);
              }
            }
            if (mergedRecords.length > 0) {
              await dbService.bulkPut(storeName, mergedRecords);
            }

            storeCount += cloudRecords.length;
            rowsInPass += cloudRecords.length;
            audit('pull', 'table page processed', { table, pageRows: cloudRecords.length, offset });
            // Track the latest updated_at seen so far for incremental sync
            lastTimestamp = data[data.length - 1]?.updated_at ?? lastTimestamp;

            // Reached the last page for this table — persist the cursor and stop.
            if (data.length < pageSize) break;
            offset += data.length;
          }

          // Persist the final cursor for incremental sync. When a pass was cut
          // short by the pass cap, the cursor still advances to where we stopped,
          // so the next periodic pass resumes from just past the last page.
          if (lastTimestamp) {
            await setLastSyncAt(table, lastTimestamp);
          }
          audit('pull', 'table complete', { table, storeCount, errors: errors.filter(e => e.startsWith(`${storeName}:`)) });

        } catch (err) {
          errors.push(`${storeName}: ${err instanceof Error ? err.message : 'Unknown'}`);
        }

        return storeCount;
      })
    );

    for (const result of results) {
      if (result.status === 'fulfilled') {
        pulled += result.value;
      }
    }

    completedStores += batch.length;
    onProgress?.({
      totalStores,
      completedStores,
      currentStore: batch[batch.length - 1] || '',
      phase: 'pull',
    });
  }

  if (pulled > 0) {
    localStorage.setItem('nexus_last_sync_pull', new Date().toISOString());
  }

  console.log(`[SYNC-FORENSIC] PULL-COMPLETE pullRemoteChanges()`, { pulled, errorCount: errors.length, errors: errors.slice(0, 5) });
  return { pulled, errors };
}

/**
 * Subscribe to real-time changes from Supabase.
 * When another device makes a change, it's pushed to all connected clients.
 *
 * FIX (Bug #1): After each IndexedDB write we now dispatch `primeerp:data-changed`
 * and a BroadcastChannel message so that DataContext.queueRefresh() fires and
 * the React/Zustand stores pick up the new data immediately.
 *
 * FIX (Bug #6): Each channel now includes a `company_id` column filter so that
 * only this tenant's events are delivered — prevents cross-tenant leakage when
 * RLS is temporarily misconfigured and reduces unnecessary traffic.
 */
async function subscribeToRemoteChanges() {
  if (!SUPABASE_ENABLED || realtimeSubscribed) {
    console.log(`[SYNC-FORENSIC] subscribeToRemoteChanges() SKIPPED`, { SUPABASE_ENABLED, realtimeSubscribed });
    return;
  }
  console.log(`[SYNC-FORENSIC] subscribeToRemoteChanges() START`);
  realtimeSubscribed = true;
  const myGeneration = ++subscriptionGeneration;

  // Retrieve the company_id once for use in per-channel column filters.
  // Falls back gracefully — if company_id is unavailable we subscribe without
  // the filter and rely on RLS to enforce tenant isolation.
  let companyId: string | null = null;
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user) {
      // Prefer app_metadata.tenant_id (server-stamped, cannot be spoofed)
      companyId =
        (session.user.app_metadata as Record<string, string>)?.tenant_id ||
        (session.user.app_metadata as Record<string, string>)?.company_id ||
        (session.user.user_metadata as Record<string, string>)?.company_id ||
        null;
    }
  } catch {
    // Could not retrieve session — continue without column filter
  }

  for (const storeName of TABLES_TO_SYNC) {
    if (!realtimeSubscribed || subscriptionGeneration !== myGeneration) break; // Race guard: abort if unsubscribed or superseded
    const table = getTable(storeName);

    try {
      // Build the postgres_changes filter. When company_id is known we scope
      // the subscription to only this tenant's rows for efficiency and security.
      const changeFilter: Record<string, string> = { event: '*', schema: 'public', table };
      if (companyId) {
        changeFilter.filter = `company_id=eq.${companyId}`;
      }

      const channelName = companyId
        ? `primeerp:${companyId}:${table}`
        : `primeerp:${table}`;

      const channel = supabase
        .channel(channelName)
        .on(
          'postgres_changes' as const,
          changeFilter,
          async (payload: any) => {
            try {
              const eventType: string = payload.eventType || 'UNKNOWN';
              console.log(`[SYNC-FORENSIC] REALTIME event received`, {
                table, eventType, id: payload.new?.id || payload.old?.id,
              });

              if (eventType === 'DELETE') {
                const deleteId = payload.old?.id;
                if (!deleteId) {
                  logger.warn(`[Sync] realtime DELETE ${table}: payload.old.id missing — skipping`, payload.old);
                } else {
                  try {
                    await dbService.delete(storeName, deleteId, { cloudSource: true });
                    logger.info(`[Sync] realtime DELETE ${table} id=${deleteId} → dispatching data-changed`);
                    emitDataChanged(table, 'DELETE');
                  } catch (e) { logger.error('Realtime DELETE failed', e as Error); }
                }

              } else if (payload.new) {
                const cloudRecord = toCloudRecord(payload.new);

                // Server-side tombstone arrives as an UPDATE (soft delete):
                // delete locally and skip the merge so the row isn't resurrected.
                if (cloudRecord.deleted === true) {
                  try {
                    await dbService.delete(storeName, payload.new.id, { cloudSource: true });
                    emitDataChanged(table, 'SOFT_DELETE');
                  } catch (e) { logger.error('Realtime soft-delete failed', e as Error); }
                  return;
                }

                const local = await dbService.get(storeName, payload.new.id);
                if (local) {
                  const pendingMutation = await durableSyncQueue.hasPendingMutation(table, payload.new.id);
                  if (pendingMutation) {
                    console.log(`[SYNC-FORENSIC] REALTIME-SKIP-MERGE ${table}/${payload.new.id} — has pending local mutation`);
                    return;
                  }
                  const merged = fieldLevelMerge(local, cloudRecord);
                  if (cloudRecord.serverUpdatedAt) {
                    merged.serverUpdatedAt = cloudRecord.serverUpdatedAt;
                  }
                  merged._cloudSource = true;
                  console.log(`[SYNC-FORENSIC] REALTIME MERGE ${table}/${payload.new.id}`);
                  await dbService.put(storeName, merged as Record<string, unknown>, { cloudSource: true });
                } else {
                  console.log(`[SYNC-FORENSIC] REALTIME NEW ${table}/${payload.new.id}`);
                  await dbService.put(storeName, cloudRecord as Record<string, unknown>, { cloudSource: true });
                }

                // ── FIX Bug #1 ───────────────────────────────────────────────
                // Notify the React layer that IndexedDB has been updated.
                // DataContext listens to both signals and calls queueRefresh(),
                // which triggers refreshAllData() → Zustand stores re-read IDB
                // and re-render. Without this, Device B's UI never updates.
                logger.info(`[Sync] realtime ${eventType} ${table} → dispatching data-changed`);
                emitDataChanged(table, eventType);
              }
            } catch {
              // best-effort realtime sync
            }
          }
        )
        .subscribe((status: string) => {
          if (status === 'SUBSCRIBED') {
            audit('realtime', 'channel subscribed', { table, companyId: companyId || 'unknown' });
          } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            logger.warn(`[Sync] realtime channel ${channelName} status=${status} — will rely on polling`);
          }
        });

      realtimeChannels.push(channel);
    } catch {
      // best-effort subscription setup
    }
  }
}

function unsubscribeFromRemoteChanges() {
  subscriptionGeneration++; // invalidate any in-flight subscribeToRemoteChanges call
  for (const channel of realtimeChannels) {
    try { supabase.removeChannel(channel); } catch { /* skip */ }
  }
  realtimeChannels = [];
  realtimeSubscribed = false;
  if (_broadcastChannel) {
    try { _broadcastChannel.close(); } catch { /* skip */ }
    _broadcastChannel = null;
  }
}

export function startPeriodicSync(
  intervalMs = PUSH_INTERVAL_MS,
  onSyncComplete?: (result: { pulled: number; pushed: number; errors: string[] }) => void
) {
  if (!SUPABASE_ENABLED) {
    console.log(`[SYNC-FORENSIC] startPeriodicSync() SKIPPED — SUPABASE_ENABLED=false`);
    return;
  }
  if (syncLifecycleActive) {
    console.log(`[SYNC-FORENSIC] startPeriodicSync() SKIPPED — lifecycle already active`);
    return;
  }

  console.log(`[SYNC-FORENSIC] startPeriodicSync() START`, { intervalMs, isOnline: navigator.onLine });
  audit('sync', 'startPeriodicSync', { intervalMs });
  syncLifecycleActive = true;

  // subscribeToRemoteChanges is now async (fetches session for company_id filter)
  subscribeToRemoteChanges().catch((err) => {
    logger.warn('[Sync] subscribeToRemoteChanges failed, falling back to polling:', err);
  });

  // Start the durable background sync engine (processes the durable queue,
  // handles realtime recovery, incremental pulls, and retries forever)
  import('./backgroundSyncService').then(({ backgroundSyncService }) => {
    backgroundSyncService.start();
  });

  // Periodic pull (incremental sync) - 30 second interval for catching missed realtime events
  pushTimer = setInterval(async () => {
    if (navigator.onLine) {
      const result = await pullRemoteChanges().catch(() => ({ pulled: 0, errors: [] }));
    }
  }, Math.min(intervalMs, 30000));

  // Initial sync on start - full pull on first sync, then incremental
  if (navigator.onLine) {
    const isFirstSync = !localStorage.getItem('nexus_last_sync_pull');
    console.log(`[SYNC-FORENSIC] startPeriodicSync() initial pull decision`, { isFirstSync, lastSyncPull: localStorage.getItem('nexus_last_sync_pull') });
    audit('sync', 'initial pull starting', { isFirstSync });
    pullRemoteChanges(undefined, isFirstSync).then(result => {
      console.log(`[SYNC-FORENSIC] startPeriodicSync() initial pull COMPLETE`, { pulled: result.pulled, errorCount: result.errors.length });
      audit('sync', 'initial pull complete', { pulled: result.pulled, errors: result.errors });
      onSyncComplete?.({ pulled: result.pulled, pushed: 0, errors: result.errors });
    }).catch(err => console.warn('[Sync] Initial pull failed:', err));
  } else {
    console.log(`[SYNC-FORENSIC] startPeriodicSync() initial pull SKIPPED — offline`);
    audit('sync', 'initial pull skipped offline', {});
    onSyncComplete?.({ pulled: 0, pushed: 0, errors: ['offline'] });
  }
}

export function stopPeriodicSync() {
  if (pushTimer) {
    clearInterval(pushTimer);
    pushTimer = null;
  }
  syncLifecycleActive = false;
  unsubscribeFromRemoteChanges();
  import('./backgroundSyncService').then(({ backgroundSyncService }) => {
    backgroundSyncService.stopPeriodicSync();
  }).catch(() => {});
}
