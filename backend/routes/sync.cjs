/**
 * POST /api/sync/ops — single gateway for ALL business-data writes in the
 * offline-first ERP.
 *
 * Responsibilities:
 *   1. Authenticate (via the global verifyToken mounted in index.cjs, which
 *      accepts backend JWTs AND Supabase JWTs).
 *   2. Accept a batch of upsert/delete operations produced by the durable
 *      sync queue running on the browser.
 *   3. Validate: operation shape + table allow-list (no arbitrary table
 *      writes against the cloud).
 *   4. Write each op to the cloud database with the service-role key, with
 *      per-op idempotency so a retried batch never double-applies.
 *   5. Return per-op results so the client can mark success / dead-letter.
 *
 * Tombstones: deletes are soft. The physical row remains (with
 * `data.deleted` + `data.deletedAt`) so realtime subscribers reconcile.
 */
const express = require('express');
const cloudSyncStore = require('../services/cloudSyncStore.cjs');

const router = express.Router();

// Allow-list of cloud tables the sync gateway may write. Union of the two
// frontend maps (services/cloudDb STORE_TO_TABLE + services/db CLOUD_TABLE_MAP)
// plus the realtime/extra tables. Kept server-side so the browser cannot
// nominate arbitrary tables.
const ALLOWED_TABLES = new Set([
  // catalog / finance
  'products', 'warehouses', 'accounts', 'settings',
  'ledger_entries', 'expenses', 'income', 'budgets', 'transfers', 'cheques',
  'purchase_orders', 'inventory_movements', 'financial_years', 'user_preferences',

  // customers / sales
  'customers', 'suppliers', 'sales', 'purchases', 'invoices', 'quotations', 'orders',
  'customer_payments', 'supplier_payments', 'payment_allocations', 'payment_allocation_lines',
  'sales_orders', 'delivery_notes',
  'shipments', 'recurring_invoices', 'scheduled_payments', 'wallet_transactions',
  'sales_exchanges', 'sales_exchange_items', 'reprint_jobs', 'sales_exchange_approvals',
  'subscribers', 'reminders', 'tasks', 'schools', 'classes', 'subjects',

  // production / inventory
  'production_batches', 'production_resources', 'work_centers', 'work_orders',
  'boms', 'bom_templates', 'goods_receipts', 'job_tickets',
  'job_ticket_settings', 'resource_allocations', 'warehouse_inventory',
  'material_batches', 'material_categories', 'inventory_transactions',
  'material_reservations', 'profit_margin_settings', 'market_adjustments',
  'market_adjustment_transactions', 'tax_rates',

  // payroll / HR
  'employees', 'payroll_runs', 'payslips', 'user_groups',

  // banking
  'bank_accounts', 'bank_transactions', 'bank_statements',
  'bank_scheduled_payments', 'bank_exchange_rates', 'bank_fees',
  'bank_reconciliations', 'bank_adjustments', 'bank_cash_flow_forecasts',
  'bank_alerts', 'bank_categories',

  // VAT / rounding
  'vat_transactions', 'vat_returns', 'rounding_logs',

  // examination module
  'examination_batches', 'examination_jobs', 'examination_job_subjects',
  'examination_invoice_groups', 'examination_recurring_profiles',
  'examination_inventory_deductions', 'examination_batch_notifications',
  'examination_papers', 'examination_printing_batches',
  'notification_audit_logs', 'job_orders',

  // marketing / communications
  'sms_campaigns', 'sms_templates', 'customer_notification_logs',
  'whatsapp_chats', 'whatsapp_templates', 'whatsapp_campaigns',
  'whatsapp_automations', 'portal_ads',

  // procurement / maintenance
  'subcontract_orders', 'maintenance_logs',

  // referral program — pending migration (0003/0004), not yet applied to live.
  // Not in allow-list until the migration is applied to avoid dead-letter debt.

  // engagement / loyalty
  'engagement_timeline', 'engagement_audit', 'engagement_points',
  'engagement_point_balances', 'engagement_cashback', 'engagement_membership_tiers',
  'engagement_customer_tiers', 'engagement_gift_cards',
  'engagement_gift_card_transactions', 'engagement_affiliates',
  'engagement_affiliate_commissions', 'engagement_promotions',
  'engagement_customer_rewards', 'engagement_analytics',

  // audit / sync infrastructure
  'audit_logs', 'profiles', 'idempotency_keys',
]);

// Tables that simply do not exist in the cloud shape yet. Their writes are
// acknowledged (no-op) so the client drains the queue instead of dead-lettering.
const NOOP_TABLES = new Set(['_files']);

const MAX_BATCH_SIZE = 100;

const VALID_TABLE_PATTERN = /^[a-z_][a-z0-9_]*$/;

router.post('/ops', async (req, res) => {
  try {
    // B5: Authorization — reject portal customers and any unauthenticated caller.
    // The global verifyToken middleware already authenticated the JWT; we now
    // enforce that the caller is an ERP user (not a portal customer). Portal
    // tokens carry role='portal_customer'; ERP tokens carry roles like
    // 'Admin', 'User', 'Company Admin', etc.
    const callerRole = String(req.user?.role || '').toLowerCase();
    if (!req.user || callerRole === 'portal_customer' || callerRole === '') {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Sync gateway requires an ERP user token. Portal customers cannot write business data.',
      });
    }

    const { ops } = req.body || {};
    console.log(`[SYNC-FORENSIC] STAGE-9 backend POST /api/sync/ops received`, {
      opCount: Array.isArray(ops) ? ops.length : 0,
      tables: Array.isArray(ops) ? ops.map(o => o?.table) : [],
      ip: req.ip,
    });
    if (!Array.isArray(ops) || ops.length === 0) {
      return res.status(400).json({ error: 'ops array is required' });
    }
    if (ops.length > MAX_BATCH_SIZE) {
      return res.status(400).json({ error: `batch too large (max ${MAX_BATCH_SIZE})` });
    }
    if (!cloudSyncStore.isConfigured()) {
      const missingVars = [
        !process.env.SUPABASE_URL && !process.env.VITE_SUPABASE_URL ? 'SUPABASE_URL' : null,
        !process.env.SUPABASE_SECRET_KEY ? 'SUPABASE_SECRET_KEY' : null,
      ].filter(Boolean);
      console.error('[sync] 503: cloud not configured. Missing env vars:', missingVars);
      return res.status(503).json({ 
        error: 'Cloud database is not configured on this server',
        missing: missingVars,
        hint: 'Set SUPABASE_URL and SUPABASE_SECRET_KEY on the Render server environment'
      });
    }

    const results = [];
    for (const op of ops) {
      // Guard against malformed queue entries (null/undefined/non-object) so a
      // single bad op can never throw past this loop and surface as a 500.
      if (!op || typeof op !== 'object') {
        results.push({ operationId: undefined, ok: false, error: 'invalid operation envelope', retryable: false });
        continue;
      }

      const table = String(op?.table || '');

      if (!VALID_TABLE_PATTERN.test(table)) {
        results.push({ operationId: op?.operationId, ok: false, error: `invalid table: ${table}`, retryable: false });
        continue;
      }
      if (NOOP_TABLES.has(table)) {
        results.push({ operationId: op?.operationId, ok: true, id: op?.recordId || null, noop: true });
        continue;
      }
      if (!ALLOWED_TABLES.has(table)) {
        results.push({ operationId: op?.operationId, ok: false, error: `table not allowed: ${table}`, retryable: false });
        continue;
      }

      let result;
      try {
        console.log(`[SYNC-FORENSIC] STAGE-10 backend applyOp()`, {
          table,
          recordId: op.recordId,
          operation: op.operation,
          operationId: op.operationId,
        });
        result = await cloudSyncStore.applyOp({
          operationId: op.operationId,
          table,
          recordId: op.recordId || null,
          operation: op.operation,
          payload: op.payload,
        });
        console.log(`[SYNC-FORENSIC] STAGE-10 backend applyOp() RESULT`, {
          table,
          recordId: op.recordId,
          ok: result?.ok,
          version: result?.version,
          conflict: result?.conflict,
          error: result?.error,
          replayed: result?.replayed,
          id: result?.id,
        });
      } catch (opErr) {
        // applyOp is designed to return per-op failures, but a defensive catch
        // here guarantees a bad op never escapes as a 500 — it becomes a
        // retryable per-op failure so the client dead-letters it cleanly.
        console.error('[sync] applyOp threw:', opErr?.stack || opErr?.message || opErr);
        result = {
          operationId: op?.operationId,
          ok: false,
          id: op?.recordId || null,
          error: opErr?.message ? String(opErr.message).slice(0, 300) : 'sync gateway internal error',
          retryable: true,
        };
      }

      results.push(result);
    }

    const okCount = results.filter((r) => r.ok).length;
    console.log(`[SYNC-FORENSIC] STAGE-11 backend response sent`, {
      processed: results.length,
      succeeded: okCount,
      failed: results.length - okCount,
    });
    res.json({
      ok: true,
      processed: results.length,
      succeeded: okCount,
      results,
    });
  } catch (err) {
    console.error('[sync] POST /ops error:', err?.message || err);
    res.status(500).json({ error: 'Sync gateway failed' });
  }
});

// Health probe for the sync gateway (used to detect route availability).
router.get('/health', (req, res) => {
  res.json({ ok: true, cloud: cloudSyncStore.isConfigured() });
});

// ─── tombstone lifecycle (admin) ────────────────────────────────────────────
// Soft deletes keep physical rows so other devices reconcile; the retention
// policy below gives admins the tools to purge old tombstones from the cloud
// with a JSONL audit trail written into the workspace Sync folder first.

const fs = require('fs');
const path = require('path');
const workspaceService = require('../services/workspaceService.cjs');

const isAdmin = (req) => {
  const role = String(req.user?.role || '').toLowerCase();
  return role === 'admin' || role === 'company admin' || role === 'owner';
};

const syncArchiveDir = () => {
  const config = workspaceService.getWorkspaceConfig();
  return config?.workspacePath ? path.join(config.workspacePath, 'Sync', 'tombstone-archive') : null;
};

/** Append one tombstone row as a JSON line; never throws (best-effort archival). */
async function archiveTombstone(id, table) {
  const dir = syncArchiveDir();
  if (!dir) return;
  fs.mkdirSync(dir, { recursive: true });
  const day = new Date().toISOString().slice(0, 10);
  const file = path.join(dir, `${table}-${day}.jsonl`);
  fs.appendFileSync(file, JSON.stringify({ archivedAt: new Date().toISOString(), table, id }) + '\n');
}

// Count soft-deleted rows in a table (all ages).
router.get('/tombstones/count', async (req, res) => {
  try {
    const table = String(req.query.table || '');
    if (!ALLOWED_TABLES.has(table)) {
      return res.status(400).json({ error: `table not allowed: ${table}` });
    }
    const count = await cloudSyncStore.countTombstones(table);
    res.json({ ok: true, table, count });
  } catch (err) {
    console.error('[sync] GET /tombstones/count error:', err?.message || err);
    res.status(500).json({ error: 'Tombstone count failed' });
  }
});

// Purge tombstones older than `retentionDays` for one table, archiving each row
// to the workspace before it is hard-deleted from the cloud.
router.post('/tombstones/purge', async (req, res) => {
  try {
    if (!isAdmin(req)) {
      return res.status(403).json({ error: 'Admin role required to purge tombstones' });
    }
    const { table, retentionDays } = req.body || {};
    if (!ALLOWED_TABLES.has(String(table || ''))) {
      return res.status(400).json({ error: `table not allowed: ${table}` });
    }
    const days = Math.max(1, Math.min(Number(retentionDays) || 30, 365));
    const result = await cloudSyncStore.purgeTombstones(String(table), days, archiveTombstone);
    res.json({ ok: true, table, retentionDays: days, ...result });
  } catch (err) {
    console.error('[sync] POST /tombstones/purge error:', err?.message || err);
    res.status(500).json({ error: 'Tombstone purge failed' });
  }
});

module.exports = router;