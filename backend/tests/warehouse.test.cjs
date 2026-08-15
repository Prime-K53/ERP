const sqlite3 = require('sqlite3');
const { describe, it, beforeAll, afterAll, expect } = require('@jest/globals');

let db;

beforeAll(() => {
  return new Promise((resolve, reject) => {
    db = new sqlite3.Database(':memory:', (err) => {
      if (err) return reject(err);
      resolve();
    });
  });
});

afterAll((done) => {
  if (db) db.close(done);
});

function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve(this);
    });
  });
}

function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

// ─── Schema ─────────────────────────────────────────────────────────────────────

async function createTables() {
  await run(`CREATE TABLE IF NOT EXISTS warehouse_inventory (
    id TEXT PRIMARY KEY,
    item_id TEXT NOT NULL,
    warehouse_id TEXT NOT NULL,
    quantity INTEGER NOT NULL DEFAULT 0,
    reserved INTEGER NOT NULL DEFAULT 0,
    available INTEGER NOT NULL DEFAULT 0,
    last_updated DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(item_id, warehouse_id)
  )`);

  await run(`CREATE TABLE IF NOT EXISTS warehouse_snapshots (
    id TEXT PRIMARY KEY,
    snapshot_data TEXT NOT NULL,
    snapshot_type TEXT DEFAULT 'manual',
    notes TEXT,
    created_by TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  await run(`CREATE TABLE IF NOT EXISTS inventory (
    id TEXT PRIMARY KEY,
    name TEXT,
    quantity REAL DEFAULT 0,
    reserved REAL DEFAULT 0,
    last_updated DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
}

// ─── Tests ──────────────────────────────────────────────────────────────────────

describe('Warehouse Inventory SQL', () => {
  beforeAll(async () => {
    await createTables();
  });

  it('creates tables and inserts warehouse inventory rows', async () => {
    await run(`INSERT INTO warehouse_inventory (id, item_id, warehouse_id, quantity, reserved, available)
               VALUES ('wh1-item-a', 'item-a', 'WH-01', 100, 10, 90)`);
    await run(`INSERT INTO warehouse_inventory (id, item_id, warehouse_id, quantity, reserved, available)
               VALUES ('wh1-item-b', 'item-b', 'WH-01', 50, 5, 45)`);
    await run(`INSERT INTO warehouse_inventory (id, item_id, warehouse_id, quantity, reserved, available)
               VALUES ('wh2-item-a', 'item-a', 'WH-02', 30, 3, 27)`);

    const rows = await all('SELECT COUNT(*) as cnt FROM warehouse_inventory');
    expect(rows[0].cnt).toBe(3);
  });

  it('aggregates warehouses correctly (GET /api/warehouses query)', async () => {
    const rows = await all(`SELECT wi.warehouse_id,
                                   COALESCE(SUM(wi.quantity), 0) as total_stock,
                                   COALESCE(SUM(wi.reserved), 0) as total_reserved,
                                   COUNT(DISTINCT wi.item_id) as item_count,
                                   MAX(wi.last_updated) as last_updated
                            FROM warehouse_inventory wi
                            GROUP BY wi.warehouse_id
                            ORDER BY wi.warehouse_id`);

    expect(rows).toHaveLength(2);
    expect(rows[0].warehouse_id).toBe('WH-01');
    expect(rows[0].total_stock).toBe(150);
    expect(rows[0].total_reserved).toBe(15);
    expect(rows[0].item_count).toBe(2);

    expect(rows[1].warehouse_id).toBe('WH-02');
    expect(rows[1].total_stock).toBe(30);
    expect(rows[1].total_reserved).toBe(3);
    expect(rows[1].item_count).toBe(1);
  });
});

describe('Warehouse Snapshots SQL', () => {
  beforeAll(async () => {
    await createTables();
  });

  it('inserts and retrieves snapshots', async () => {
    const data = JSON.stringify([{ warehouse_id: 'WH-01', total_stock: 150 }]);
    await run(`INSERT OR REPLACE INTO warehouse_snapshots (id, snapshot_data, snapshot_type, notes, created_by, created_at)
               VALUES ('snap1', ?, 'manual', 'Test snapshot', 'tester', ?)`,
               [data, new Date().toISOString()]);

    const rows = await all('SELECT * FROM warehouse_snapshots ORDER BY created_at DESC LIMIT ?', [20]);
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe('snap1');
    expect(rows[0].snapshot_type).toBe('manual');
    expect(rows[0].notes).toBe('Test snapshot');
    expect(rows[0].created_by).toBe('tester');

    const parsed = JSON.parse(rows[0].snapshot_data);
    expect(parsed).toEqual([{ warehouse_id: 'WH-01', total_stock: 150 }]);
  });
});

describe('Sync Master Inventory SQL', () => {
  beforeAll(async () => {
    await createTables();
    await run(`INSERT INTO inventory (id, name, quantity, reserved)
               VALUES ('item-a', 'Item A', 0, 0)`);
    await run(`INSERT INTO inventory (id, name, quantity, reserved)
               VALUES ('item-b', 'Item B', 0, 0)`);
  });

  it('syncs a single item from warehouse totals', async () => {
    const rows = await all(`SELECT item_id, SUM(quantity) as total_qty, SUM(reserved) as total_reserved
                            FROM warehouse_inventory WHERE item_id = ? GROUP BY item_id`,
                            ['item-a']);

    expect(rows).toHaveLength(1);
    expect(rows[0].total_qty).toBe(130); // 100 + 30 from both warehouses
    expect(rows[0].total_reserved).toBe(13); // 10 + 3
  });

  it('syncs all items', async () => {
    const rows = await all(`SELECT wi.item_id, SUM(wi.quantity) as total_qty, SUM(wi.reserved) as total_reserved
                            FROM warehouse_inventory wi GROUP BY wi.item_id`);

    expect(rows).toHaveLength(2);
    const itemA = rows.find(r => r.item_id === 'item-a');
    const itemB = rows.find(r => r.item_id === 'item-b');
    expect(itemA.total_qty).toBe(130);
    expect(itemA.total_reserved).toBe(13);
    expect(itemB.total_qty).toBe(50);
    expect(itemB.total_reserved).toBe(5);
  });

  it('updates inventory from totals', async () => {
    const totals = await all(`SELECT item_id, SUM(quantity) as total_qty, SUM(reserved) as total_reserved
                              FROM warehouse_inventory GROUP BY item_id`);

    for (const row of totals) {
      await run('UPDATE inventory SET quantity = ?, reserved = ?, last_updated = CURRENT_TIMESTAMP WHERE id = ?',
                [row.total_qty, row.total_reserved, row.item_id]);
    }

    const updated = await all('SELECT id, quantity, reserved FROM inventory ORDER BY id');
    expect(updated[0].id).toBe('item-a');
    expect(updated[0].quantity).toBe(130);
    expect(updated[0].reserved).toBe(13);
    expect(updated[1].id).toBe('item-b');
    expect(updated[1].quantity).toBe(50);
    expect(updated[1].reserved).toBe(5);
  });
});
