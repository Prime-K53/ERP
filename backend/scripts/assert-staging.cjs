#!/usr/bin/env node
// assert-staging.cjs — safe local guard that verifies the runtime environment
// is the STAGING Supabase project BEFORE any migration/sync/destructive command
// may run. Does NOT connect to any database, does NOT query Supabase, does NOT
// read or print secret values.
//
// Usage:  node scripts/assert-staging.cjs
// Exit:   0 = staging confirmed, 1 = NOT staging (command must not proceed)
//
// Expected staging target (company TESTING/STAGING project, confirmed 2026-08-14):
//   PROJECT REF : rdtuzuzehfbwvfdzqliw
//   HOST        : rdtuzuzehfbwvfdzqliw.supabase.co
//
// NOTE: a strict PRODUCTION-ID guard cannot be built yet — the repository
// contains no confirmed production Supabase project reference. The production
// ref must be supplied (in backend/.env.production or documented) before the
// inverse guard can be added. Until then this script refuses to run when the
// configured environment is NOT staging.

const fs = require('fs');
const path = require('path');

const ENV_FILE = path.join(__dirname, '..', '.env');
const EXPECTED_PROJECT_REF = 'rdtuzuzehfbwvfdzqliw';
const EXPECTED_HOST = `${EXPECTED_PROJECT_REF}.supabase.co`;

function loadEnv(file) {
  if (!fs.existsSync(file)) return {};
  const env = {};
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
  }
  return env;
}

const env = loadEnv(ENV_FILE);
const nodeEnv = (env.NODE_ENV || '').trim();
const url = (env.SUPABASE_URL || '').trim();

let failures = 0;
function check(name, ok, detail) {
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`);
}

check('NODE_ENV=staging', nodeEnv === 'staging', nodeEnv ? `NODE_ENV=${nodeEnv}` : 'NODE_ENV missing');
check('SUPABASE_URL present', url.length > 0, url ? '(present)' : '(missing)');

let host = '';
try {
  if (url) host = new URL(url).host;
} catch {
  /* host stays empty */
}
check('SUPABASE_URL is valid URL', url.length === 0 || host.length > 0, host ? `host=${host}` : '(invalid or missing)');
check(`host is STAGING project (${EXPECTED_HOST})`, host === EXPECTED_HOST, host ? `host=${host}` : '(unresolved)');
check('no .env.production override present', !fs.existsSync(path.join(__dirname, '..', '.env.production')), '(not present)');

if (failures > 0) {
  console.log('\nGUARD FAILED — environment is NOT the confirmed staging project.');
  console.log('Do NOT apply migrations, do NOT run destructive or sync commands.');
  process.exit(1);
}
console.log('\nSTAGING CONFIRMED — safe to proceed with staging-only operations.');
console.log('(Read-only check: no database was contacted.)');
process.exit(0);