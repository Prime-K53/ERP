/**
 * B15 — Allow-list integrity tests.
 *
 * Verifies that:
 *   1. No sync allow-list entry points to a nonexistent live table
 *   2. 'users' and 'batches' have been removed from the allow-list
 *   3. All allow-list entries correspond to tables in the baseline migration
 */
process.env.SUPABASE_URL = 'https://test.supabase.co';
process.env.SUPABASE_SECRET_KEY = 'test-secret-key';

jest.mock('axios', () => {
  const instance = {
    get: jest.fn().mockResolvedValue({ data: [] }),
    post: jest.fn().mockResolvedValue({ data: [] }),
    patch: jest.fn().mockResolvedValue({ data: [] }),
    delete: jest.fn(),
  };
  instance.create = jest.fn(() => instance);
  return instance;
});

const fs = require('fs');
const path = require('path');

// Read the sync route to extract ALLOWED_TABLES
const syncRoutePath = path.join(__dirname, '..', '..', 'routes', 'sync.cjs');
const syncSource = fs.readFileSync(syncRoutePath, 'utf8');

// Extract table names from the ALLOWED_TABLES Set
function extractAllowedTables(source) {
  const match = source.match(/const ALLOWED_TABLES = new Set\(\[([\s\S]*?)\]\)/);
  if (!match) throw new Error('ALLOWED_TABLES not found in sync.cjs');
  const inner = match[1];
  const tables = [];
  const re = /'([a-z_][a-z0-9_]*)'/g;
  let m;
  while ((m = re.exec(inner)) !== null) {
    tables.push(m[1]);
  }
  return tables;
}

// Read the baseline migration to get the canonical table list
const baselinePath = path.join(__dirname, '..', '..', '..', 'supabase', 'migrations', '0001_baseline_live_schema.sql');
const baselineSource = fs.readFileSync(baselinePath, 'utf8');

function extractBaselineTables(source) {
  const tables = [];
  const re = /CREATE TABLE IF NOT EXISTS public\.([a-z_][a-z0-9_]*) \(/g;
  let m;
  while ((m = re.exec(source)) !== null) {
    tables.push(m[1]);
  }
  return tables;
}

describe('B15 — sync allow-list integrity', () => {
  const allowedTables = extractAllowedTables(syncSource);
  const baselineTables = extractBaselineTables(baselineSource);
  const baselineSet = new Set(baselineTables);

  it('allow-list does NOT contain "users" (removed per B15)', () => {
    expect(allowedTables).not.toContain('users');
  });

  it('allow-list does NOT contain "batches" (removed per B15)', () => {
    expect(allowedTables).not.toContain('batches');
  });

  it('every allow-list entry exists in the baseline migration (live schema)', () => {
    const missing = allowedTables.filter(t => !baselineSet.has(t));
    expect(missing).toEqual([]);
  });

  it('allow-list has no duplicates', () => {
    const unique = new Set(allowedTables);
    expect(unique.size).toBe(allowedTables.length);
  });

  it('baseline has at least 150 tables (sanity check)', () => {
    expect(baselineTables.length).toBeGreaterThanOrEqual(150);
  });
});
