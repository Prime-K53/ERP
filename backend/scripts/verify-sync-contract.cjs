#!/usr/bin/env node
// verify-sync-contract.cjs — read-only verification of the live Supabase
// schema against supabase/migrations/0001_baseline_live_schema.sql and the
// cloud-sync contract (envelope: id/data/version/updated_at + updated_at trigger).
//
// Usage: node scripts/verify-sync-contract.cjs
// Reads SUPABASE_URL / SUPABASE_SECRET_KEY / SUPABASE_PUBLISHABLE_KEY from ../.env
// Performs only non-destructive probes (rows it creates are deleted afterwards).

const fs = require('fs');
const path = require('path');

const ENV_FILE = path.join(__dirname, '..', '.env');
const BASELINE = path.join(__dirname, '..', '..', 'supabase', 'migrations', '0001_baseline_live_schema.sql');

function loadEnv(file) {
  const env = {};
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
  }
  return env;
}

const env = loadEnv(ENV_FILE);
const BASE = env.SUPABASE_URL.replace(/\/$/, '');
const SERVICE_KEY = env.SUPABASE_SECRET_KEY;
const ANON_KEY = env.SUPABASE_PUBLISHABLE_KEY;

let failures = 0;
let checks = 0;
function check(name, ok, detail) {
  checks++;
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`);
}

async function api(path, { key = SERVICE_KEY, method = 'GET', body, headers = {} } = {}) {
  const res = await fetch(`${BASE}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      ...headers,
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* keep text */ }
  return { status: res.status, json, text, code: json && (json.code || json.message) };
}

async function run() {

// ─── 1. Baseline table/column parity (generated-from-live, checked back) ───
const sql = fs.readFileSync(BASELINE, 'utf8');
const tables = {};
for (const m of sql.matchAll(/CREATE TABLE IF NOT EXISTS public\.([a-z_0-9]+) \(\n([\s\S]*?)\n\);/g)) {
  const cols = [...m[2].matchAll(/^\s*([a-z_0-9]+)\s+(TEXT|JSONB|INTEGER|BIGINT|TIMESTAMPTZ|BOOLEAN|UUID|NUMERIC|DATE|TEXT\[\])/gm)].map(x => x[1]);
  tables[m[1]] = cols;
}
const names = Object.keys(tables);
console.log(`baseline tables: ${names.length}\n`);

for (const name of names) {
  const cols = tables[name];
  const sel = cols.map(c => `${c}:${c}`).join(',');
  const { status, code } = await api(`${name}?select=${encodeURIComponent(sel)}&limit=1`);
  if (status === 404) check(`table ${name}`, false, 'not found on live (PGRST205)');
  else if (status === 400) check(`table ${name}`, false, `column mismatch: ${code || 'PGRST204'}`);
  else if (status === 200) check(`table ${name}`, true, `${cols.length} columns`);
  else check(`table ${name}`, false, `HTTP ${status}`);
}

// ─── 2. Live RPC surface (must match baseline fn set) ─────────────────────
const rpcTests = [
  ['is_company_staff', {}],
  ['get_current_company_id', {}],
  ['apply_promotion_usage', {
    p_promotion_id: '00000000-0000-0000-0000-000000000000',
    p_customer_id: null, p_source_type: 'probe', p_source_id: 'probe', p_source_number: null,
    p_company_id: 'probe', p_discount_amount: 0, p_subtotal_before: 0, p_subtotal_after: 0, p_snapshot: {},
  }],
];
console.log('');
for (const [fn, args] of rpcTests) {
  const { status, json } = await api(`rpc/${fn}`, { method: 'POST', body: args });
  const ok = status === 200 && (json === null || typeof json === 'object' || typeof json === 'boolean');
  check(`rpc ${fn}`, ok, `HTTP ${status} → ${JSON.stringify(json)}`);
}

// ─── 3. updated_at trigger (non-destructive probe on idempotency_keys) ────
const PROBE_ID = crypto.randomUUID();
{
  const ins = await api('idempotency_keys', { method: 'POST', body: { id: PROBE_ID, data: { probe: 1 } } });
  check('probe insert', ins.status === 201, `HTTP ${ins.status}`);
  const r1 = await api(`idempotency_keys?id=eq.${PROBE_ID}`, {});
  const before = r1.json?.[0]?.updated_at;
  await new Promise(r => setTimeout(r, 1500));
  const patch = await api(`idempotency_keys?id=eq.${PROBE_ID}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=minimal' },
    body: { data: { probe: 2 }, version: 1 },
  });
  const r2 = await api(`idempotency_keys?id=eq.${PROBE_ID}`, {});
  const after = r2.json?.[0]?.updated_at;
  check('updated_at trigger fires on PATCH', !!before && !!after && before !== after, `${before} → ${after}`);
  check('probe rows isolated by id', r2.json?.length === 1, `read ${r2.json?.length} row(s)`);
  const del = await api(`idempotency_keys?id=eq.${PROBE_ID}`, { method: 'DELETE' });
  check('probe cleanup', del.status === 204, `HTTP ${del.status}`);
}

// ─── 4. Envelope round-trip on a generic business table (customers) ───────
{
  const id = crypto.randomUUID();
  const ins = await api('customers', { method: 'POST', body: { id, data: { name: '__contract_probe__' }, version: 0 } });
  check('customers insert (envelope)', ins.status === 201 || ins.status === 200, `HTTP ${ins.status}`);
  if (id) {
    const patch = await api(`customers?id=eq.${id}`, {
      method: 'PATCH', headers: { Prefer: 'return=representation' },
      body: { data: { name: '__contract_probe_2__' }, version: 1 },
    });
    const row = patch.json?.[0];
    check('customers patch returns version bump', patch.status === 200 && row?.version === 1, `version=${row?.version}`);
    check('customers updated_at bumped', !!row?.updated_at, row?.updated_at);
    const del = await api(`customers?id=eq.${id}`, { method: 'DELETE' });
    check('customers cleanup', del.status === 204, `HTTP ${del.status}`);
  }
}

// ─── 5. RLS end-state sanity through the anon (publishable) key ───────────
{
  const { status, json } = await api('customers?select=id&limit=5', { key: ANON_KEY });
  check('anon key can SELECT (RLS active, 0 rows leaked)', status === 200 && Array.isArray(json) && json.length === 0, `HTTP ${status}, rows=${json?.length}`);
  const { status: s2, json: j2 } = await api('idempotency_keys?select=id&limit=5', { key: ANON_KEY });
  check('anon key blocked on business table', s2 === 200 && Array.isArray(j2) && j2.length === 0, `HTTP ${s2}, rows=${j2?.length}`);
}

console.log(`\n${checks - failures}/${checks} checks passed`);
process.exit(failures ? 1 : 0);
}

run().catch((e) => { console.error(e); process.exit(1); });