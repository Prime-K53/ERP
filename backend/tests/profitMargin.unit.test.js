/**
 * Unit Tests: getEffectiveMargin precedence logic
 * Tests the three-level override hierarchy: line_item > category > global
 */

const { describe, it, beforeEach, expect } = require('@jest/globals');

// ─── In-memory mock of the DB for isolated unit testing ───────────────────────

let mockRows = [];

jest.mock('../db.cjs', () => {
  const rowsRef = { current: [] };
  const mockDb = {
    get: (query, params, cb) => {
      // Simulate SQLite row lookup
      const scope = query.includes("scope = 'line_item'")
        ? 'line_item'
        : query.includes("scope = 'category'")
        ? 'category'
        : 'global';

      const match = rowsRef.current.find(r => {
        if (r.scope !== scope) return false;
        if (scope === 'global') return true;
        return r.scope_ref_id === params[0];
      });
      cb(null, match || null);
    }
  };
  return {
    db: mockDb,
    getDatabase: () => mockDb,
    initDb: () => Promise.resolve(),
    reinitializeDatabase: () => {},
    __setMockRows: (rows) => { rowsRef.current = rows.map(r => ({ ...r, is_active: 1, deleted_at: null })); },
    __getMockRows: () => rowsRef.current,
  };
});

const profitMarginService = require('../services/profitMarginService.cjs');

// ─── Helper to seed mock DB rows ──────────────────────────────────────────────

function seedRows(rows) {
  const mockedModule = require('../db.cjs');
  mockedModule.__setMockRows(rows);
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('getEffectiveMargin — precedence hierarchy', () => {

  beforeEach(() => { const m = require('../db.cjs'); m.__setMockRows([]); });

  // 1. Falls through all levels → returns system default
  it('returns system default when no overrides exist', async () => {
    const result = await profitMarginService.getEffectiveMargin(null, null);
    expect(result.source).toBe('system');
    expect(result.margin_value).toBe(0);
    expect(result.margin_type).toBe('percentage');
  });

  // 2. Global is found when no line-item or category is provided
  it('returns global margin when only global is set', async () => {
    seedRows([{ scope: 'global', scope_ref_id: null, margin_value: 20, margin_type: 'percentage' }]);
    const result = await profitMarginService.getEffectiveMargin(null, null);
    expect(result.source).toBe('global');
    expect(result.margin_value).toBe(20);
  });

  // 3. Category overrides global
  it('uses category override over global when category matches', async () => {
    seedRows([
      { scope: 'global',   scope_ref_id: null,     margin_value: 20, margin_type: 'percentage' },
      { scope: 'category', scope_ref_id: 'CAT-1',  margin_value: 35, margin_type: 'percentage' }
    ]);
    const result = await profitMarginService.getEffectiveMargin(null, 'CAT-1');
    expect(result.source).toBe('category');
    expect(result.margin_value).toBe(35);
  });

  // 4. Line-item overrides category and global
  it('uses line-item override as highest priority', async () => {
    seedRows([
      { scope: 'global',    scope_ref_id: null,       margin_value: 20,  margin_type: 'percentage' },
      { scope: 'category',  scope_ref_id: 'CAT-1',    margin_value: 35,  margin_type: 'percentage' },
      { scope: 'line_item', scope_ref_id: 'PROD-001',  margin_value: 50,  margin_type: 'percentage' }
    ]);
    const result = await profitMarginService.getEffectiveMargin('PROD-001', 'CAT-1');
    expect(result.source).toBe('line_item');
    expect(result.margin_value).toBe(50);
  });

  // 5. Line-item present, wrong category → returns line-item
  it('returns line-item even when category does not match a different product', async () => {
    seedRows([
      { scope: 'global',    scope_ref_id: null,       margin_value: 20, margin_type: 'percentage' },
      { scope: 'line_item', scope_ref_id: 'PROD-002',  margin_value: 45, margin_type: 'percentage' }
    ]);
    const result = await profitMarginService.getEffectiveMargin('PROD-002', 'CAT-UNKNOWN');
    expect(result.source).toBe('line_item');
    expect(result.margin_value).toBe(45);
  });

  // 6. Category miss → falls through to global
  it('falls back to global when no category override exists for given category', async () => {
    seedRows([
      { scope: 'global',   scope_ref_id: null,    margin_value: 15, margin_type: 'percentage' },
      { scope: 'category', scope_ref_id: 'CAT-2', margin_value: 30, margin_type: 'percentage' }
    ]);
    const result = await profitMarginService.getEffectiveMargin(null, 'CAT-999');
    expect(result.source).toBe('global');
    expect(result.margin_value).toBe(15);
  });

  // 7. Line-item miss → tries category → hits category
  it('falls from line_item miss to category hit', async () => {
    seedRows([
      { scope: 'global',   scope_ref_id: null,       margin_value: 10, margin_type: 'percentage' },
      { scope: 'category', scope_ref_id: 'CAT-3',    margin_value: 28, margin_type: 'percentage' }
    ]);
    const result = await profitMarginService.getEffectiveMargin('PROD-UNKNOWN', 'CAT-3');
    expect(result.source).toBe('category');
    expect(result.margin_value).toBe(28);
  });

  // 8. Fixed amount type is preserved as a line-item override
  it('handles fixed_amount margin type correctly', async () => {
    seedRows([
      { scope: 'line_item', scope_ref_id: 'PROD-FIX', margin_value: 500, margin_type: 'fixed_amount' }
    ]);
    const result = await profitMarginService.getEffectiveMargin('PROD-FIX', null);
    expect(result.source).toBe('line_item');
    expect(result.margin_type).toBe('fixed_amount');
    expect(result.margin_value).toBe(500);
  });

  // 9. All three levels present — line_item wins
  it('correctly resolves: line_item beats category beats global', async () => {
    seedRows([
      { scope: 'global',    scope_ref_id: null,      margin_value: 10, margin_type: 'percentage' },
      { scope: 'category',  scope_ref_id: 'CAT-A',   margin_value: 20, margin_type: 'percentage' },
      { scope: 'line_item', scope_ref_id: 'SKU-A',   margin_value: 30, margin_type: 'percentage' }
    ]);
    const li = await profitMarginService.getEffectiveMargin('SKU-A', 'CAT-A');
    expect(li.source).toBe('line_item');
    expect(li.margin_value).toBe(30);

    // Remove line-item → category wins
    const m1 = require('../db.cjs');
    const filtered1 = m1.__getMockRows().filter(r => r.scope !== 'line_item');
    m1.__setMockRows(filtered1);
    const cat = await profitMarginService.getEffectiveMargin('SKU-A', 'CAT-A');
    expect(cat.source).toBe('category');
    expect(cat.margin_value).toBe(20);

    // Remove category → global wins
    const m2 = require('../db.cjs');
    const filtered2 = m2.__getMockRows().filter(r => r.scope !== 'category');
    m2.__setMockRows(filtered2);
    const global = await profitMarginService.getEffectiveMargin('SKU-A', 'CAT-A');
    expect(global.source).toBe('global');
    expect(global.margin_value).toBe(10);
  });
});

describe('createSetting — validation', () => {

  beforeEach(() => { const m = require('../db.cjs'); m.__setMockRows([]); });

  it('rejects percentage > 100', async () => {
    await expect(
      profitMarginService.createSetting({ scope: 'global', scope_ref_id: null, margin_type: 'percentage', margin_value: 110 }, 'user1')
    ).rejects.toThrow('between 0 and 100');
  });

  it('rejects negative percentage', async () => {
    await expect(
      profitMarginService.createSetting({ scope: 'global', scope_ref_id: null, margin_type: 'percentage', margin_value: -5 }, 'user1')
    ).rejects.toThrow('between 0 and 100');
  });

  it('rejects negative fixed_amount', async () => {
    await expect(
      profitMarginService.createSetting({ scope: 'category', scope_ref_id: 'CAT-1', margin_type: 'fixed_amount', margin_value: -50 }, 'user1')
    ).rejects.toThrow('>= 0');
  });

  it('accepts boundary value 0%', async () => {
    // Should not throw validation — will fail on DB (in-memory mock), that's fine
    const promise = profitMarginService.createSetting({
      scope: 'global', scope_ref_id: null, margin_type: 'percentage', margin_value: 0
    }, 'user1');
    // Expect either success or DB error, NOT a validation error
    await expect(promise).rejects.not.toThrow('between 0 and 100');
  });

  it('accepts boundary value 100%', async () => {
    const promise = profitMarginService.createSetting({
      scope: 'global', scope_ref_id: null, margin_type: 'percentage', margin_value: 100
    }, 'user1');
    await expect(promise).rejects.not.toThrow('between 0 and 100');
  });
});
