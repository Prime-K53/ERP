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

/**
 * Read the current server row and compare it against the version the client
 * based its edit on. Returns either the matched row (the write can proceed)
 * or a structured conflict payload so the client can field-merge immediately.
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
 * When the payload carries a base version, the gateway reads the current row
 * and rejects the write with a conflict payload if the stored version moved
 * (concurrent edit from another device). Accepted writes bump the stored
 * version monotonically (server-stamped), so a stale client can never
 * silently overwrite a newer row — it gets a mergeable conflict instead.
 *
 * Writes WITHOUT a version are only allowed as genuine creates (no existing
 * row): the server stamps `version: 1` so later edits have a base. If the row
 * already exists — including a soft-deleted tombstone — the write is rejected
 * as a `version_required` conflict. This closes the two legacy hazards of
 * unconditional last-write-wins: a stale client clobbering newer server state,
 * and a bare payload re-animating a row another device soft-deleted.
 */
async function upsertRow(table, id, payload, serverNow = new Date().toISOString()) {
  const domain = sanitizeRecord(payload);
  const incomingVersion = Number(payload._version ?? payload.version);

  if (Number.isFinite(incomingVersion)) {
    const gate = await checkVersion(table, id, incomingVersion);
    if (!gate.ok) {
      return { id, conflicted: true, conflictType: gate.conflictType, server: gate.server };
    }
    const row = {
      id,
      data: domain,
      updated_at: serverNow,
      version: gate.serverVersion + 1,
    };
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
      version: saved?.version != null ? Number(saved.version) : (gate.serverVersion + 1),
    };
  }

  // No version supplied. An existing row — live or tombstoned — must not be
  // overwritten unconditionally; return it as a `version_required` conflict
  // so the client merges against the current snapshot and retries with a base.
  const existing = await getRow(table, id);
  if (existing) {
    const serverVersion = existing.version != null ? Number(existing.version) : 0;
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
    version: saved?.version != null ? Number(saved.version) : 1,
  };
}

/**
 * Soft-delete a row by writing a tombstone into `data`. The physical row is
 * kept so realtime subscribers on other devices observe the deletion as an
 * UPDATE and can reconcile their local caches.
 */
async function softDeleteRow(table, id, serverNow = new Date().toISOString()) {
  const existing = await getRow(table, id);
  const base = existing && existing.data && typeof existing.data === 'object' ? existing.data : {};

  const row = {
    id,
    data: { ...base, deleted: true, deletedAt: serverNow, ...(existing?.data ? {} : {}) },
    updated_at: serverNow,
  };
  // Deletes win: stamp the next version so any concurrently queued upsert on a
  // stale base is rejected and the client re-merges (or observes the tombstone).
  const baseVersion = existing?.version != null ? Number(existing.version) : 0;
  row.version = baseVersion + 1;

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
    const isRetryable = status === 409 || status >= 500 || !status;
    // Harden: any cloud-side rejection surfaces a stable, short error string.
    const normalized = detail && detail.length < 300 ? detail : message;
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
};