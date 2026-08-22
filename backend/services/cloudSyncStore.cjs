/**
 * cloudSyncStore.cjs — server-side Supabase write client for the ERP sync
 * gateway (`POST /api/sync/ops`).
 *
 * The ERP is offline-first: the sync queue runs on the browser and the
 * backend is the single gateway that validates operations and writes them
 * to the cloud database. This module does those cloud writes with the
 * service-role key (bypassing RLS) so business data lands in Postgres
 * regardless of the calling user's row-level visibility.
 *
 * It deliberately mirrors the write shape used by the legacy direct client
 * (`frontend/services/cloudDb.ts`): rows are stored as `{ id, data, updated_at }`
 * with an optional numeric `version`, and deletes are soft-deletes via a
 * tombstone (`data.deleted = true` + `data.deletedAt`).
 */
const axios = require('axios');

// axios does NOT reject on 4xx/5xx by default; it only throws on network-level
// failures. Without this, a rejected cloud write (bad column, RLS, 401 from an
// expired key, 409/500) would surface as `res.data` being an error object that
// we silently treat as a successful row — corrupting the client's sync state.
// Force rejection on any non-2xx so every failure path funnels through the
// try/catch in applyOp() and is reported as a per-op, retryable failure.
const cloudHttp = typeof axios.create === 'function'
  ? axios.create({ validateStatus: (status) => status >= 200 && status < 300 })
  : axios;

const SUPABASE_URL = String(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').replace(/\/+$/, '');
const SECRET_KEY = process.env.SUPABASE_SECRET_KEY || '';

const isConfigured = () => Boolean(
  SUPABASE_URL
  && SECRET_KEY
  && !SUPABASE_URL.includes('placeholder')
  && !SECRET_KEY.includes('placeholder')
);

// Log configuration status at module load time for Render diagnostics
(function checkCloudConfig() {
  const urlOk = Boolean(SUPABASE_URL && !SUPABASE_URL.includes('placeholder'));
  const keyOk = Boolean(SECRET_KEY && !SECRET_KEY.includes('placeholder'));
  if (!urlOk || !keyOk) {
    console.error('[cloudSyncStore] STARTUP: Cloud sync NOT configured.', {
      SUPABASE_URL_set: urlOk,
      SUPABASE_SECRET_KEY_set: keyOk,
      supabase_env_vars: Object.keys(process.env).filter(k => k.toLowerCase().includes('supabase')),
    });
  } else {
    console.log('[cloudSyncStore] STARTUP: Cloud sync configured OK. URL=' + SUPABASE_URL);
  }
})();

function adminHeaders() {
  return {
    apikey: SECRET_KEY,
    Authorization: `Bearer ${SECRET_KEY}`,
    'Content-Type': 'application/json',
    Prefer: 'return=representation',
  };
}

// ─── uuid5 (deterministic id for idempotency keys) ─────────────────────────
const NAMESPACE = Buffer.from('d6a7e280-8c0e-4a7e-9b1a-1e5f2c3d4a5b', 'utf8');

function stringToUuid5(input) {
  const { createHash } = require('crypto');
  const hash = createHash('sha1').update(NAMESPACE).update(String(input || ''), 'utf8').digest();
  const bytes = hash.subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

// ─── idempotency ────────────────────────────────────────────────────────────
let idempotencyTableReady = null;

async function ensureIdempotencyTable() {
  if (idempotencyTableReady !== null) return idempotencyTableReady;
  try {
    const res = await cloudHttp.get(`${SUPABASE_URL}/rest/v1/idempotency_keys`, {
      headers: { apikey: SECRET_KEY, Authorization: `Bearer ${SECRET_KEY}` },
      params: { select: 'id', limit: 0 },
      timeout: 8000,
    });
    idempotencyTableReady = Array.isArray(res.data);
  } catch {
    idempotencyTableReady = false;
  }
  return idempotencyTableReady;
}

async function checkIdempotency(operationId) {
  if (!operationId || !(await ensureIdempotencyTable())) {
    return { alreadyProcessed: false };
  }
  try {
    const uuid = stringToUuid5(operationId);
    const res = await cloudHttp.get(`${SUPABASE_URL}/rest/v1/idempotency_keys`, {
      headers: { apikey: SECRET_KEY, Authorization: `Bearer ${SECRET_KEY}` },
      params: { select: 'id,result', id: `eq.${uuid}`, limit: 1 },
      timeout: 8000,
    });
    const row = Array.isArray(res.data) ? res.data[0] : null;
    return row
      ? { alreadyProcessed: true, result: row.result || null }
      : { alreadyProcessed: false };
  } catch {
    return { alreadyProcessed: false };
  }
}

async function recordIdempotency(operationId, result) {
  if (!operationId || !(await ensureIdempotencyTable())) return;
  try {
    const uuid = stringToUuid5(operationId);
    await cloudHttp.post(`${SUPABASE_URL}/rest/v1/idempotency_keys`, {
      id: uuid,
      result: result || null,
      expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    }, {
      headers: { ...adminHeaders(), Prefer: 'resolution=merge-duplicates' },
      timeout: 8000,
    });
  } catch {
    // best-effort
  }
}

// ─── row helpers ────────────────────────────────────────────────────────────
async function getRow(table, id) {
  const res = await cloudHttp.get(`${SUPABASE_URL}/rest/v1/${table}`, {
    headers: { apikey: SECRET_KEY, Authorization: `Bearer ${SECRET_KEY}` },
    params: { select: '*', id: `eq.${id}`, limit: 1 },
    timeout: 15000,
  });
  return Array.isArray(res.data) ? (res.data[0] || null) : null;
}

function sanitizeRecord(payload) {
  const raw = { ...(payload && typeof payload === 'object' ? payload : {}) };
  delete raw._updatedAt;
  delete raw._cloudSource;
  delete raw._operationId;
  delete raw._version;
  delete raw.dependsOn;
  delete raw.deletedAt; // computed server-side for tombstones only
  // Strip top-level sync metadata that lives in its own Supabase column.
  // `version` and `updated_at` are top-level columns; storing them inside
  // the `data` JSONB causes toCloudRecord() to read a stale value (from
  // the JSONB) that overrides the fresh top-level column on the next pull.
  delete raw.version;
  delete raw.updated_at;
  delete raw.created_at;
  return raw;
}

/**
 * Fetch every row of a cloud table (id + data envelope) with pagination.
 * Used by the portal backfill to propagate pre-existing committed rows.
 */
async function listRows(table) {
  const LIMIT = 200;
  const out = [];
  let from = 0;
  for (;;) {
    const res = await cloudHttp.get(`${SUPABASE_URL}/rest/v1/${table}`, {
      headers: { apikey: SECRET_KEY, Authorization: `Bearer ${SECRET_KEY}` },
      params: { select: '*', offset: from, limit: LIMIT },
      timeout: 20000,
    });
    const page = Array.isArray(res.data) ? res.data : [];
    out.push(...page);
    if (page.length < LIMIT) break;
    from += page.length;
    if (from > 5000) break; // safety valve for pathological tables
  }
  return out;
}

// ─── Sales order official-number minting ────────────────────────────────────
// The canonical sales order number is backend-authoritative (`ORD-YYYY-######`).
// Portal-created orders already get one server-side (portalLifecycleService).
// Admin-created orders arrive here through the sync gateway with a provisional
// or missing number, so the gateway mints the official number at write time.
// Minting is idempotent: an already-official number in the payload is kept,
// and a row that already carries an official number on the server is reused
// (never re-minted) so retries cannot produce two numbers for one order.

const SALES_ORDER_NUMBER_PATTERN = /^ORD-\d{4}-\d{6}$/;

/**
 * Pure decision helper (unit-testable): returns the official number to use, or
 * null when one must be minted. `payloadNumber` is preferred; `rowNumber` is
 * the number already committed on the server (used for idempotent replays).
 */
function pickSalesOrderNumber({ payload, rowNumber }) {
  const has = (v) => typeof v === 'string' && v.trim().length > 0;
  const data = payload && typeof payload === 'object' ? payload : {};
  const payloadNumber = has(data.order_number)
    ? data.order_number
    : (has(data.orderNumber) && SALES_ORDER_NUMBER_PATTERN.test(data.orderNumber) ? data.orderNumber : null);
  if (payloadNumber) return payloadNumber;
  return has(rowNumber) ? rowNumber : null;
}

/**
 * Pure scanner (unit-testable): next sequence value across every committed
 * sales_orders row, reading both key spellings (`order_number` snake_case from
 * the portal, `orderNumber` camelCase from admin-synced records).
 */
function nextSalesOrderNumber(rows) {
  const year = new Date().getFullYear();
  const prefixToken = `ORD-${year}-`;
  let maxSeq = 0;
  for (const row of rows || []) {
    const data = row && typeof row === 'object'
      ? (row.data && typeof row.data === 'object' ? row.data : row)
      : {};
    const value = String(data.order_number || data.orderNumber || '');
    if (!value.startsWith(prefixToken)) continue;
    const num = parseInt(value.slice(prefixToken.length), 10);
    if (Number.isFinite(num) && num > maxSeq) maxSeq = num;
  }
  return `${prefixToken}${String(maxSeq + 1).padStart(6, '0')}`;
}

/**
 * Resolve the official sales order number for an incoming upsert. Returns the
 * number to stamp onto the payload, or null when the payload already carries a
 * settled official number (in which case nothing needs to be injected).
 * Never throws — the gateway must not block a business write on numbering.
 */
async function ensureSalesOrderNumber(payload) {
  const settled = pickSalesOrderNumber({ payload, rowNumber: null });
  if (settled) return settled;
  let rowNumber = null;
  try {
    const existing = await getRow('sales_orders', payload.id);
    rowNumber = existing && existing.data && typeof existing.data === 'object'
      ? (existing.data.order_number || existing.data.orderNumber || null)
      : null;
  } catch { /* row missing or cloud unreachable — mint below */ }
  const fromRow = pickSalesOrderNumber({ payload: {}, rowNumber });
  if (fromRow) return fromRow;
  const rows = await listRows('sales_orders');
  return nextSalesOrderNumber(rows);
}

/**
 * Read the current server row and compare it against the version the client
 * based its edit on. Returns either the matched row (the write can proceed)
 * or a structured conflict payload so the client can field-merge immediately.
 *
 * NOTE: This function is retained for backward compatibility with any code
 * that still calls it directly. The primary upsert path now uses atomic
 * conditional PATCH (see upsertRow / softDeleteRow) which eliminates the
 * race window between this read and the subsequent write.
 */
async function checkVersion(table, id, incomingVersion) {
  if (!Number.isFinite(incomingVersion)) return { ok: true, serverVersion: 0 };
  const existing = await getRow(table, id);
  const serverVersion = existing?.version != null ? Number(existing.version) : 0;
  if (serverVersion !== incomingVersion) {
    return {
      ok: false,
      conflict: true,
      conflictType: 'version_conflict',
      serverVersion,
      server: conflictServerPayload(id, existing, serverVersion),
    };
  }
  return { ok: true, serverVersion };
}

/** Shape of the server snapshot handed to the client for field-merging. */
function conflictServerPayload(id, existing, serverVersion) {
  return {
    id,
    version: serverVersion,
    updatedAt: existing?.updated_at || null,
    data: (existing && existing.data && typeof existing.data === 'object') ? existing.data : {},
  };
}

/**
 * Upsert a row: `{ id, data: <domain fields>, updated_at }`.
 * Numeric `version` is the optimistic-lock precondition.
 *
 * B6: The version check and write are now a SINGLE atomic database operation.
 * When the payload carries a base version, we issue:
 *   PATCH /rest/v1/<table>?id=eq.<id>&version=eq.<expected>
 *   Body: { data, version: expected+1, updated_at }
 * If zero rows are updated, the version moved → conflict. No separate read.
 *
 * Writes WITHOUT a version are only allowed as genuine creates (no existing
 * row): the server stamps `version: 1` so later edits have a base. If the row
 * already exists — including a soft-deleted tombstone — the write is rejected
 * as a `version_required` conflict.
 */
async function upsertRow(table, id, payload, serverNow = new Date().toISOString()) {
  const domain = sanitizeRecord(payload);
  const incomingVersion = Number(payload._version ?? payload.version);

  console.log(`[SYNC-FORENSIC] STAGE-13 cloudSyncStore.upsertRow()`, {
    table, id, incomingVersion, hasDomain: !!domain,
  });

  // B6: Atomic versioned write — single PATCH with WHERE version = expected.
  if (Number.isFinite(incomingVersion)) {
    const row = {
      data: domain,
      updated_at: serverNow,
      version: incomingVersion + 1,
    };
    try {
      const res = await cloudHttp.patch(`${SUPABASE_URL}/rest/v1/${table}`, row, {
        headers: adminHeaders(),
        params: { id: `eq.${id}`, version: `eq.${incomingVersion}` },
        timeout: 20000,
      });
      // PostgREST returns the updated rows as an array. Empty = conflict.
      const updated = Array.isArray(res.data) ? res.data : [];
      if (updated.length === 0) {
        // Version mismatch — another client changed the row. Fetch current
        // snapshot so the client can field-merge without an extra round-trip.
        const existing = await getRow(table, id);
        const serverVersion = existing?.version != null ? Number(existing.version) : 0;

        // The row does not exist at all — this is a CREATE, not an update.
        // An atomic PATCH cannot match a non-existent row (WHERE version = N
        // matches nothing), so without this a brand-new row stamped with an
        // initial version would be misreported as a version conflict and never
        // inserted. Insert it with the initial version, mirroring the
        // tombstone-resurrection / unversioned-create POST below.
        if (!existing) {
          const createdRow = { id, data: domain, updated_at: serverNow, version: 1 };
          console.log(`[SYNC-FORENSIC] STAGE-13 atomic PATCH 0 rows + row absent → INSERT (create)`, {
            table, id,
          });
          const created = await cloudHttp.post(`${SUPABASE_URL}/rest/v1/${table}`, createdRow, {
            headers: { ...adminHeaders(), Prefer: 'resolution=merge-duplicates,return=representation' },
            params: { on_conflict: 'id' },
            timeout: 20000,
          });
          const saved = Array.isArray(created.data) ? (created.data[0] || null) : created.data;
          return {
            id: saved?.id || id,
            updatedAt: saved?.updated_at || serverNow,
            createdAt: saved?.created_at || null,
            version: saved?.version != null ? Number(saved.version) : 1,
          };
        }

        console.log(`[SYNC-FORENSIC] STAGE-13 OCC conflict (atomic PATCH, 0 rows)`, {
          table, id, incomingVersion, serverVersion,
        });
        return {
          id,
          conflicted: true,
          conflictType: 'version_conflict',
          serverVersion,
          server: conflictServerPayload(id, existing, serverVersion),
        };
      }
      const saved = updated[0];
      console.log(`[SYNC-FORENSIC] STAGE-13 atomic PATCH OK`, {
        table, id, savedVersion: saved?.version, savedId: saved?.id,
      });
      return {
        id: saved?.id || id,
        updatedAt: saved?.updated_at || serverNow,
        createdAt: saved?.created_at || null,
        version: saved?.version != null ? Number(saved.version) : (incomingVersion + 1),
      };
    } catch (err) {
      // axios throws on non-2xx; a 0-row PATCH returns 200 (not thrown).
      // Any thrown error here is a real transport/cloud failure.
      throw err;
    }
  }

  // No version supplied. An existing row — live or tombstoned — must not be
  // overwritten unconditionally; return it as a `version_required` conflict
  // so the client merges against the current snapshot and retries with a base.
  // Exception: tombstoned rows with a version are treated as resurrection intent.
  const existing = await getRow(table, id);
  if (existing) {
    const isTombstone = existing.data && typeof existing.data === 'object'
      && (existing.data.deleted === true || existing.data.deletedAt);
    const serverVersion = existing.version != null ? Number(existing.version) : 0;

    if (isTombstone && Number.isFinite(incomingVersion)) {
      // Tombstone resurrection with version: overwrite the tombstone.
      const row = { id, data: domain, updated_at: serverNow, version: serverVersion + 1 };
      console.log(`[SYNC-FORENSIC] STAGE-13 cloudSyncStore.upsertRow() TOMBSTONE RESURRECT`, {
        table, id, serverVersion, newVersion: serverVersion + 1,
      });
      const res = await cloudHttp.post(`${SUPABASE_URL}/rest/v1/${table}`, row, {
        headers: { ...adminHeaders(), Prefer: 'resolution=merge-duplicates,return=representation' },
        params: { on_conflict: 'id' },
        timeout: 20000,
      });
      const saved = Array.isArray(res.data) ? (res.data[0] || null) : res.data;
      return {
        id: saved?.id || id,
        updatedAt: saved?.updated_at || serverNow,
        createdAt: saved?.created_at || null,
        version: saved?.version != null ? Number(saved.version) : (serverVersion + 1),
      };
    }

    // Unversioned write on existing row (live or tombstone) → version_required.
    return {
      id,
      conflicted: true,
      conflictType: 'version_required',
      serverVersion,
      server: conflictServerPayload(id, existing, serverVersion),
    };
  }

  // Genuine create: no row exists, so stamp the initial version.
  const row = { id, data: domain, updated_at: serverNow, version: 1 };
  console.log(`[SYNC-FORENSIC] STAGE-13 Supabase upsert NEW RECORD (no version)`, {
    table, id,
  });
  const res = await cloudHttp.post(`${SUPABASE_URL}/rest/v1/${table}`, row, {
    headers: { ...adminHeaders(), Prefer: 'resolution=merge-duplicates,return=representation' },
    params: { on_conflict: 'id' },
    timeout: 20000,
  });
  const saved = Array.isArray(res.data) ? (res.data[0] || null) : res.data;
  console.log(`[SYNC-FORENSIC] STAGE-13 Supabase upsert OK (new record v1)`, {
    table, id, savedVersion: saved?.version, savedId: saved?.id,
  });
  return {
    id: saved?.id || id,
    updatedAt: saved?.updated_at || serverNow,
    createdAt: saved?.created_at || null,
    version: saved?.version != null ? Number(saved.version) : 1,
  };
}

/**
 * Soft-delete a row by writing a tombstone into `data`. The physical row is
 * kept so realtime subscribers on other devices observe the deletion as an
 * UPDATE and can reconcile their local caches.
 *
 * B6: The read-then-write is now a single atomic PATCH with a version
 * precondition. The base data is preserved in the `data` JSONB column while
 * tombstone flags are merged in and the version is bumped.
 */
async function softDeleteRow(table, id, serverNow = new Date().toISOString()) {
  // Read the current row to preserve its data payload under the tombstone.
  // This read is for data preservation only; the version check is enforced
  // atomically by the subsequent conditional PATCH.
  const existing = await getRow(table, id);
  const base = existing && existing.data && typeof existing.data === 'object' ? { ...existing.data } : {};
  const baseVersion = existing?.version != null ? Number(existing.version) : 0;

  const tombstoneData = { ...base, deleted: true, deletedAt: serverNow };

  // B6: Atomic conditional PATCH — version must still match.
  const row = {
    id,
    data: tombstoneData,
    updated_at: serverNow,
    version: baseVersion + 1,
  };
  try {
    const res = await cloudHttp.patch(`${SUPABASE_URL}/rest/v1/${table}`, row, {
      headers: adminHeaders(),
      params: { id: `eq.${id}`, version: `eq.${baseVersion}` },
      timeout: 20000,
    });
    const updated = Array.isArray(res.data) ? res.data : [];
    if (updated.length === 0) {
      // Version mismatch — another client changed the row. Surface as conflict.
      return { id, conflicted: true, conflictType: 'version_conflict', serverVersion: baseVersion };
    }
    const saved = updated[0];
    return {
      id: saved?.id || id,
      updatedAt: saved?.updated_at || serverNow,
      deleted: true,
    };
  } catch (err) {
    // Fallback: if the atomic PATCH fails for a reason other than version
    // mismatch (e.g. row was hard-deleted), fall through to the legacy
    // upsert path so tombstones can still be written.
    const res = await cloudHttp.post(`${SUPABASE_URL}/rest/v1/${table}`, row, {
      headers: { ...adminHeaders(), Prefer: 'resolution=merge-duplicates,return=representation' },
      params: { on_conflict: 'id' },
      timeout: 20000,
    });
    const saved = Array.isArray(res.data) ? (res.data[0] || null) : res.data;
    return {
      id: saved?.id || id,
      updatedAt: saved?.updated_at || serverNow,
      deleted: true,
    };
  }
}

// ─── tombstone lifecycle ────────────────────────────────────────────────────
// Soft deletes keep the physical row (`data.deleted = true` + `data.deletedAt`)
// so realtime subscribers on other devices can reconcile. That makes a good
// experience but means deleted rows live forever. These helpers implement the
// retention policy side of the lifecycle: count tombstones, and GC them once
// they pass the retention window, best-effort archiving each row to a JSONL
// file before it is physically removed from the cloud.

const TOMBSTONE_FLAG = { 'data->>deleted': 'eq.true' };
const PURGE_PAGE_SIZE = 100;

/**
 * Count soft-deleted (tombstoned) rows across a table, all ages.
 */
async function countTombstones(table) {
  if (!isConfigured()) return 0;
  try {
    const res = await cloudHttp.get(`${SUPABASE_URL}/rest/v1/${table}`, {
      headers: { ...adminHeaders(), Prefer: 'count=exact' },
      params: { ...TOMBSTONE_FLAG, select: 'id', limit: 1 },
      timeout: 15000,
    });
    const contentRange = String(res.headers?.['content-range'] || '0-0/0');
    // PostgREST returns a `Content-Range: start-end/total` header with count=exact.
    const totalMatch = contentRange.split('/')[1];
    const total = Number(totalMatch);
    return Number.isFinite(total) ? total : 0;
  } catch {
    return 0;
  }
}

/**
 * Purge tombstones older than `retentionDays` for one table. Each purged row is
 * first handed to `archiveFn(row, table)` so the operator keeps an audit trail
 * (archival) before the row is hard-deleted from the cloud.
 *
 * The scan is done in two passes on purpose: first collect the matching ids
 * (bounded offset pages — result set is static while we read), then delete each
 * id. Deleting while paginating can skip rows, so we never read and write in
 * the same loop.
 */
async function purgeTombstones(table, retentionDays, archiveFn = null) {
  if (!isConfigured()) return { purged: 0, archived: 0, skipped: 0 };
  const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000).toISOString();

  // Phase 1 — collect candidate ids (older than retention).
  const ids = [];
  for (let offset = 0; offset < 10000; offset += PURGE_PAGE_SIZE) {
    const res = await cloudHttp.get(`${SUPABASE_URL}/rest/v1/${table}`, {
      headers: { apikey: SECRET_KEY, Authorization: `Bearer ${SECRET_KEY}` },
      params: {
        ...TOMBSTONE_FLAG,
        select: 'id,updated_at',
        updated_at: `lt.${cutoff}`,
        order: 'updated_at.asc',
        limit: PURGE_PAGE_SIZE,
        offset,
      },
      timeout: 20000,
    });
    const rows = Array.isArray(res.data) ? res.data : [];
    if (rows.length === 0) break;
    for (const row of rows) {
      if (row?.id != null) ids.push(row);
    }

    // With the retention filter applied, any page shorter than the page size
    // means we've walked the whole set — stop early.
    if (rows.length < PURGE_PAGE_SIZE) break;
  }

  // Phase 2 — archive then hard-delete each tombstone.
  let purged = 0;
  let archived = 0;
  let skipped = 0;
  for (const { id } of ids) {
    if (archiveFn) {
      try { await archiveFn(id, table); archived++; } catch { /* archival is best-effort */ }
    }
    try {
      await cloudHttp.delete(`${SUPABASE_URL}/rest/v1/${table}`, {
        headers: { apikey: SECRET_KEY, Authorization: `Bearer ${SECRET_KEY}` },
        params: { id: `eq.${id}` },
        timeout: 20000,
      });
      purged++;
    } catch {
      skipped++;
    }
  }

  return { purged, archived, skipped };
}

/**
 * Apply an operation. Returns a normalized result object used by the route:
 *   { operationId, ok, id, updatedAt, error, retryable }
 * Errors produced by the cloud (validation, schema, RLS, uniqueness) are
 * marked `retryable:false` so the client moves the op to its dead-letter
 * queue instead of retrying forever. Network/5xx are retryable.
 */
async function applyOp(op) {
  const { operationId, table, recordId, operation, payload } = op || {};
  console.log(`[SYNC-FORENSIC] STAGE-12 cloudSyncStore.applyOp()`, {
    table, recordId, operation, operationId,
    hasPayload: !!payload,
    payloadKeys: payload ? Object.keys(payload).slice(0, 10) : [],
  });
  if (!table || typeof table !== 'string') {
    return { operationId, ok: false, error: 'table is required', retryable: false };
  }
  if (!['upsert', 'delete'].includes(operation)) {
    return { operationId, ok: false, error: `unsupported operation: ${operation}`, retryable: false };
  }

  // Idempotency guard — if the same operation id already succeeded, replay is a no-op.
  // Wrapped defensively: a failure probing the idempotency table must never bubble
  // up as a 500 — it degrades to "not seen yet" and the write proceeds (or fails
  // safely downstream). This is the most likely source of previously-unhandled 500s.
  if (operationId) {
    try {
      const seen = await checkIdempotency(operationId);
      if (seen.alreadyProcessed) {
        return { operationId, ok: true, id: seen.result || recordId, replayed: true };
      }
    } catch (idErr) {
      console.warn(`[cloudSyncStore] idempotency probe failed for ${operationId}, continuing:`, idErr?.message || idErr);
    }
  }

  try {
    let result;
    if (operation === 'delete') {
      // recordId required; tombstone the row (no hard delete).
      if (!recordId) {
        return { operationId, ok: false, error: 'recordId is required for delete', retryable: false };
      }
      result = await softDeleteRow(table, recordId);
    } else {
      const id = recordId || payload?.id;
      if (!id) {
        return { operationId, ok: false, error: 'recordId or payload.id is required for upsert', retryable: false };
      }
      if (table === 'sales_orders' && payload && typeof payload === 'object') {
        try {
          const officialNumber = await ensureSalesOrderNumber(payload);
          if (officialNumber) {
            payload.order_number = officialNumber;
            console.log(`[cloudSyncStore] sales_orders ${id} official number: ${officialNumber}`);
          }
        } catch (mintErr) {
          // Numbering must never block the business write — the row is saved
          // without an official number and the next push re-runs the mint.
          console.warn(`[cloudSyncStore] sales_orders ${id} number mint skipped:`, mintErr?.message || mintErr);
        }
      }
      result = await upsertRow(table, id, payload);
    }

    // Optimistic-concurrency gate rejected the write: another device changed
    // the row since this client read it. Return the current server row so the
    // client can field-merge without an extra round-trip and retry immediately.
    if (result?.conflicted) {
      return {
        operationId,
        ok: false,
        id: result.id,
        conflict: true,
        conflictType: result.conflictType || 'version_conflict',
        retryable: true,
        error: 'Version conflict — record was updated by another device',
        server: result.server,
      };
    }

    if (operationId && result?.id) {
      // Best-effort only: a failure recording the idempotency key must never
      // turn a successful write into a 500. The write already succeeded.
      try { await recordIdempotency(operationId, result.id); }
      catch (recErr) { console.warn(`[cloudSyncStore] idempotency record failed for ${operationId}:`, recErr?.message || recErr); }
    }
    return { operationId, ok: true, id: result.id, updatedAt: result.updatedAt, version: result.version };
  } catch (err) {
    const status = err?.response?.status;
    const detail = err?.response?.data ? (typeof err.response.data === 'string' ? err.response.data : JSON.stringify(err.response.data)) : '';
    const message = err?.message || String(err);
    const normalized = detail && detail.length < 300 ? detail : message;

    // B8: Granular error classification. Only genuinely transient failures are
    // retryable; schema/authorization/constraint errors are dead-lettered.
    let isRetryable;
    if (!status) {
      // No HTTP status → network-level failure (DNS, timeout, connection reset)
      isRetryable = true;
    } else if (status === 429) {
      // Rate limiting — caller should back off and retry
      isRetryable = true;
    } else if (status >= 500) {
      // Server-side error — may be transient (overload, restart, etc.)
      isRetryable = true;
    } else if (status === 409) {
      // Conflict — OCC version mismatch or unique constraint
      isRetryable = true;
    } else {
      // 4xx (except 409/429): schema errors (PGRST204/PGRST205), authorization
      // failures, constraint violations, bad requests → non-retryable.
      isRetryable = false;
    }

    console.warn(`[cloudSyncStore] ${operation} ${table}/${recordId} failed (${status || 'network'}): ${normalized}`);
    return { operationId, ok: false, id: recordId, error: normalized, retryable: isRetryable };
  }
}

module.exports = {
  isConfigured,
  stringToUuid5,
  applyOp,
  getRow,
  listRows,
  upsertRow,
  softDeleteRow,
  checkIdempotency,
  recordIdempotency,
  countTombstones,
  purgeTombstones,
  pickSalesOrderNumber,
  nextSalesOrderNumber,
};