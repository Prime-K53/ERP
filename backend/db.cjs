let sqlite3;
try {
  sqlite3 = require('sqlite3').verbose();
} catch (err) {
  console.error('[Database] FATAL: sqlite3 native module failed to load.');
  console.error('[Database] Run: cd backend && npm rebuild sqlite3');
  console.error('[Database] Or in Docker: see backend/Dockerfile which handles this.');
  console.error('[Database] Error:', err.message);
  if (process.env.JEST_WORKER_ID !== undefined) {
    throw new Error('sqlite3 native module not available - run: npm rebuild sqlite3');
  }
  process.exit(1);
}
const fs = require('fs');
const { getDbPath, ensureRuntimeDirs } = require('./runtimePaths.cjs');

ensureRuntimeDirs();

// Singleton pattern: prevent multiple DB instances
let dbInstance = null;
let instanceId = 0;

/**
 * Get or create the singleton database instance.
 * This ensures only a single DB connection exists in the application.
 * @returns {sqlite3.Database} The singleton database instance
 */
function getDatabase() {
  if (dbInstance === null) {
    instanceId++;
    if (instanceId > 1) {
      throw new Error('Multiple database connection attempts detected. Use getDatabase() to access the singleton instance.');
    }
    const dbPath = getDbPath();
    console.log(`[Database] Opening database at: ${dbPath}`);
    dbInstance = new sqlite3.Database(dbPath);
    
    // Enable WAL mode for concurrent read/write performance
    // WAL allows concurrent reads while writes are in progress
    dbInstance.run('PRAGMA journal_mode=WAL');
    
    // NORMAL synchronous provides good durability with better performance
    // than FULL, while still being safer than OFF
    dbInstance.run('PRAGMA synchronous=NORMAL');
    
    // Enable foreign key constraints for data integrity
    dbInstance.run('PRAGMA foreign_keys=ON');
    
    // Give SQLite up to 10 seconds to retry if it hits a lock before giving up
    dbInstance.run('PRAGMA busy_timeout=10000');
  }
  return dbInstance;
}

// Export the singleton instance directly
let db = getDatabase();

const initDb = () => {
  return new Promise((resolve, reject) => {
    db.serialize(() => {
      // Tasks Table
      db.run(`CREATE TABLE IF NOT EXISTS tasks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        completed INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`);

      // Customers Table
      db.run(`CREATE TABLE IF NOT EXISTS customers (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT,
        phone TEXT,
        address TEXT,
        city TEXT,
        balance REAL DEFAULT 0,
        walletBalance REAL DEFAULT 0,
        creditLimit REAL DEFAULT 0,
        creditHold INTEGER DEFAULT 0,
        outstandingBalance REAL DEFAULT 0,
        status TEXT DEFAULT 'Active',
        category TEXT DEFAULT 'School',
        segment TEXT DEFAULT 'B2B'
      )`, (err) => {
        if (!err) {
          // The original customers table predates the ERP→Portal mirror writes,
          // which upsert with updated_at/created_at (and queries order by
          // updated_at). Add the missing columns so /api/erp-portal/mirror no
          // longer fails with "table customers has no column named updated_at".
          db.all("PRAGMA table_info(customers)", (err, rows) => {
            if (!err && rows) {
              const existingColumns = new Set(rows.map(r => r.name));
              const columnsToAdd = [
                { name: 'created_at', type: 'DATETIME' },
                { name: 'updated_at', type: 'DATETIME' },
              ];
              columnsToAdd.forEach(col => {
                if (!existingColumns.has(col.name)) {
                  db.run(`ALTER TABLE customers ADD COLUMN ${col.name} ${col.type}`, (err) => {
                    if (err) console.error(`Error adding ${col.name} column to customers:`, err);
                  });
                }
              });
            }
          });
        }
      });

      // Schools Table
      db.run(`CREATE TABLE IF NOT EXISTS schools (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        pricing_type TEXT CHECK(pricing_type IN ('margin-based', 'per-sheet')) NOT NULL,
        pricing_value REAL NOT NULL
      )`);

      // Inventory Table
      db.run(`CREATE TABLE IF NOT EXISTS inventory (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        sku TEXT,
        material TEXT,
        type TEXT CHECK(type IN ('stationery', 'material', 'product', 'service')) DEFAULT 'material',
        is_stock_tracked INTEGER GENERATED ALWAYS AS (CASE WHEN type IN ('stationery', 'material') THEN 1 ELSE 0 END) VIRTUAL,
        quantity INTEGER NOT NULL DEFAULT 0,
        cost_per_unit REAL NOT NULL DEFAULT 0,
        selling_price REAL DEFAULT 0,
        conversion_rate REAL DEFAULT 500,
        unit TEXT DEFAULT 'units',
        category_id TEXT,
        min_stock_level INTEGER DEFAULT 0,
        max_stock_level INTEGER DEFAULT 0,
        reorder_point INTEGER DEFAULT 0,
        warehouse_id TEXT,
        reserved INTEGER NOT NULL DEFAULT 0,
        is_protected INTEGER DEFAULT 0,
        created_by TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        last_updated DATETIME DEFAULT CURRENT_TIMESTAMP,
        last_synced_at DATETIME,
        sync_checksum TEXT
      )`, (err) => {
        if (!err) {
          db.all("PRAGMA table_info(inventory)", (err, rows) => {
            if (!err && rows) {
              const existingColumns = new Set(rows.map(r => r.name));
              const columnsToAdd = [ { name: 'sku', type: 'TEXT' },
                { name: 'selling_price', type: 'REAL DEFAULT 0' },
                { name: 'created_by', type: 'TEXT' },
                { name: 'reserved', type: 'INTEGER NOT NULL DEFAULT 0' },
                { name: 'is_protected', type: 'INTEGER DEFAULT 0' },
                { name: 'created_at', type: 'DATETIME' },
                { name: 'updated_at', type: 'DATETIME' },
                { name: 'status', type: "TEXT NOT NULL DEFAULT 'Active'" },
                { name: 'deleted_at', type: 'DATETIME' },
                { name: 'void_reason', type: 'TEXT' },
                { name: 'voided_by', type: 'TEXT' }
              ];
              columnsToAdd.forEach(col => {
                if (!existingColumns.has(col.name)) {
                  db.run(`ALTER TABLE inventory ADD COLUMN ${col.name} ${col.type}`, (err) => {
                    if (err) console.error(`Error adding ${col.name} column to inventory:`, err);
                  });
                }
              });
              db.run(`CREATE UNIQUE INDEX IF NOT EXISTS idx_inventory_sku ON inventory (sku) WHERE sku IS NOT NULL AND sku != ''`);
            }
          });
        }
      });

      // Examinations Table
      db.run(`CREATE TABLE IF NOT EXISTS examinations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        batch_id TEXT,
        school_id INTEGER,
        customer_id TEXT,
        school_name TEXT,
        sub_account_name TEXT,
        class TEXT,
        subject TEXT,
        pages INTEGER,
        candidates INTEGER,
        waste_percent REAL,
        extra_copies INTEGER,
        charge_per_learner REAL,
        sheets_per_copy INTEGER,
        production_copies INTEGER,
        base_sheets INTEGER,
        waste_sheets REAL,
        actual_waste_sheets REAL,
        total_sheets_used REAL,
        billable_sheets INTEGER,
        internal_cost REAL,
        selling_price REAL,
        status TEXT DEFAULT 'pending', 
        invoice_id INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        is_recurring INTEGER DEFAULT 0,
        academic_year TEXT,
        term TEXT,
        exam_type TEXT,
        FOREIGN KEY (school_id) REFERENCES schools(id),
        FOREIGN KEY (invoice_id) REFERENCES invoices(id)
      )`);

      // Invoices Table
      db.run(`CREATE TABLE IF NOT EXISTS invoices (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        school_id INTEGER,
        customer_id TEXT,
        customer_name TEXT,
        sub_account_name TEXT,
        subtotal REAL DEFAULT 0,
        total_amount REAL,
        paid_amount REAL DEFAULT 0,
        currency TEXT DEFAULT 'MWK',
        status TEXT DEFAULT 'unpaid',
        payment_method TEXT,
        paid_at DATETIME,
        due_date DATETIME,
        invoice_number TEXT,
        origin_module TEXT,
        origin_batch_id TEXT,
        idempotency_key TEXT,
        line_items_json TEXT,
        notes TEXT,
        document_title TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (school_id) REFERENCES schools(id)
      )`, (err) => {
        if (!err) {
          // Check if currency column exists (for existing tables)
          db.all("PRAGMA table_info(invoices)", (err, rows) => {
            if (!err && rows) {
              const existingColumns = new Set(rows.map(r => r.name));

              const columnsToAdd = [
                { name: 'currency', type: "TEXT DEFAULT 'MWK'" },
                { name: 'customer_name', type: 'TEXT' },
                { name: 'paid_amount', type: 'REAL DEFAULT 0' },
                { name: 'due_date', type: 'DATETIME' },
                { name: 'invoice_number', type: 'TEXT' },
                { name: 'origin_module', type: 'TEXT' },
                { name: 'origin_batch_id', type: 'TEXT' },
                { name: 'rounding_difference', type: 'REAL DEFAULT 0' },
                { name: 'rounding_method', type: 'TEXT' },
                { name: 'other_charges', type: 'REAL DEFAULT 0' },
                { name: 'adjustment_total', type: 'REAL DEFAULT 0' },
                { name: 'adjustment_snapshots_json', type: 'TEXT' },
                { name: 'idempotency_key', type: 'TEXT' },
                { name: 'line_items_json', type: 'TEXT' },
                { name: 'notes', type: 'TEXT' },
                { name: 'document_title', type: 'TEXT' },
                { name: 'updated_at', type: 'DATETIME' }
              ];

              columnsToAdd.forEach(col => {
                if (!existingColumns.has(col.name)) {
                  db.run(`ALTER TABLE invoices ADD COLUMN ${col.name} ${col.type}`, (err) => {
                    if (err) console.error(`Error adding ${col.name} column to invoices:`, err);
                    else console.log(`Added ${col.name} column to invoices table`);
                  });
                }
              });
            }
          });
        }
      });

      // Normalized sale items table for referential integrity and queryability
      db.run(`CREATE TABLE IF NOT EXISTS sale_items (
        id TEXT PRIMARY KEY,
        sale_id TEXT NOT NULL,
        item_id TEXT NOT NULL,
        variant_id TEXT,
        item_name TEXT,
        quantity INTEGER NOT NULL,
        unit_price REAL NOT NULL DEFAULT 0,
        unit_cost REAL DEFAULT 0,
        line_total REAL DEFAULT 0,
        discount REAL DEFAULT 0,
        item_type TEXT,
        consumption_snapshot_json TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (sale_id) REFERENCES sales(id) ON DELETE CASCADE
      )`);
      db.run(`CREATE INDEX IF NOT EXISTS idx_sale_items_sale ON sale_items(sale_id)`);
      db.run(`CREATE INDEX IF NOT EXISTS idx_sale_items_item ON sale_items(item_id)`);

      // Sales table — customer_id is app-level FK to customers(id); items stored as JSON
      db.run(`CREATE TABLE IF NOT EXISTS sales (
        id TEXT PRIMARY KEY,
        date DATETIME NOT NULL,
        customer_id TEXT,
        customer_name TEXT,
        sub_account_name TEXT,
        total_amount REAL DEFAULT 0 CHECK (total_amount >= 0),
        material_total REAL DEFAULT 0 CHECK (material_total >= 0),
        adjustment_total REAL DEFAULT 0 CHECK (adjustment_total >= 0),
        profit_margin_total REAL DEFAULT 0 CHECK (profit_margin_total >= 0),
        rounding_total REAL DEFAULT 0 CHECK (rounding_total >= 0),
        other_charges REAL DEFAULT 0 CHECK (other_charges >= 0),
        adjustment_snapshots_json TEXT,
        status TEXT DEFAULT 'Paid' CHECK (status IN ('Draft', 'Pending', 'Paid', 'Partially Paid', 'Voided', 'Refunded')),
        payment_method TEXT,
        source TEXT,
        items_json TEXT,
        payments_json TEXT,
        last_synced_at DATETIME,
        sync_checksum TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        created_by TEXT,
        updated_by TEXT,
        void_reason TEXT,
        voided_at DATETIME,
        idempotency_key TEXT UNIQUE
      )`, (err) => {
        if (!err) {
          db.all("PRAGMA table_info(sales)", (err, rows) => {
            if (!err && rows) {
              const existingColumns = new Set(rows.map(r => r.name));
              const columnsToAdd = [
                { name: 'sub_account_name', type: 'TEXT' },
                { name: 'material_total', type: 'REAL DEFAULT 0' },
                { name: 'adjustment_total', type: 'REAL DEFAULT 0' },
                { name: 'profit_margin_total', type: 'REAL DEFAULT 0' },
                { name: 'rounding_total', type: 'REAL DEFAULT 0' },
                { name: 'other_charges', type: 'REAL DEFAULT 0' },
                { name: 'adjustment_snapshots_json', type: 'TEXT' },
                { name: 'updated_at', type: 'DATETIME' },
                { name: 'created_by', type: 'TEXT' },
                { name: 'updated_by', type: 'TEXT' },
                { name: 'void_reason', type: 'TEXT' },
                { name: 'voided_at', type: 'DATETIME' }
              ];

              columnsToAdd.forEach(col => {
                if (!existingColumns.has(col.name)) {
                  db.run(`ALTER TABLE sales ADD COLUMN ${col.name} ${col.type}`, (err) => {
                    if (err) console.error(`Error adding ${col.name} column to sales:`, err);
                    else console.log(`Added ${col.name} column to sales table`);
                  });
                }
              });
              
              // Add unique index for idempotency_key (skip if column doesn't exist yet)
              try {
                db.run(`CREATE UNIQUE INDEX IF NOT EXISTS idx_sales_idempotency ON sales(idempotency_key)`, (err) => {
                  if (err && !err.message.includes('duplicate column name')) {
                    console.error('Error creating idempotency index:', err);
                  }
                });
              } catch (e) {
                // Index might fail if column doesn't exist yet, that's ok
              }
            }
          });
        }
      });


      // Classes Table
      db.run(`CREATE TABLE IF NOT EXISTS classes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE NOT NULL
      )`);

      // Audit Logs Table (Compliance-Grade Immutable Trail)
      db.run(`CREATE TABLE IF NOT EXISTS audit_logs (
        id TEXT PRIMARY KEY,
        timestamp DATETIME NOT NULL,
        correlation_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        user_role TEXT NOT NULL,
        session_id TEXT,
        action TEXT NOT NULL,
        entity_type TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        details TEXT,
        old_value TEXT,
        new_value TEXT,
        delta TEXT,
        integrity_hash TEXT NOT NULL,
        ip_address TEXT,
        user_agent TEXT,
        http_method TEXT,
        http_path TEXT,
        reason TEXT,
        approval_chain TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`);

      // Inventory Transactions Table (for full audit trail)
      db.run(`CREATE TABLE IF NOT EXISTS inventory_transactions (
        id TEXT PRIMARY KEY,
        item_id TEXT NOT NULL,
        warehouse_id TEXT,
        batch_id TEXT,
        type TEXT NOT NULL CHECK(type IN ('IN', 'OUT', 'ADJUSTMENT')),
        quantity INTEGER NOT NULL,
        previous_quantity INTEGER NOT NULL,
        new_quantity INTEGER NOT NULL,
        unit_cost REAL,
        total_cost REAL,
        reference TEXT,
        reference_id TEXT,
        reason TEXT NOT NULL,
        performed_by TEXT NOT NULL DEFAULT 'system',
        ip_address TEXT,
        user_agent TEXT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
      )`, (err) => {
        if (!err) {
          db.all("PRAGMA table_info(inventory_transactions)", (err, rows) => {
            if (!err && rows) {
              const existingColumns = new Set(rows.map(r => r.name));
              const columnsToAdd = [ { name: 'ip_address', type: 'TEXT' },
                { name: 'user_agent', type: 'TEXT' },
              ];
              columnsToAdd.forEach(col => {
                if (!existingColumns.has(col.name)) {
                  db.run(`ALTER TABLE inventory_transactions ADD COLUMN ${col.name} ${col.type}`, (err) => {
                    if (err) console.error(`Error adding ${col.name} column to inventory_transactions:`, err);
                    else console.log(`Added ${col.name} column to inventory_transactions table`);
                  });
                }
              });
            }
          });
        }
      });

      // Material Batches Table (for batch/lot tracking)
      db.run(`CREATE TABLE IF NOT EXISTS material_batches (
        id TEXT PRIMARY KEY,
        item_id TEXT NOT NULL,
        batch_number TEXT NOT NULL,
        quantity INTEGER NOT NULL,
        remaining_quantity INTEGER NOT NULL,
        cost_per_unit REAL,
        received_date DATETIME,
        expiry_date DATETIME,
        supplier_id TEXT,
        supplier_name TEXT,
        warehouse_id TEXT,
        status TEXT DEFAULT 'active' CHECK(status IN ('active', 'depleted', 'expired')),
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`, (err) => {
        if (!err) {
          db.all("PRAGMA table_info(material_batches)", (err, rows) => {
            if (!err && rows) {
              const existingColumns = new Set(rows.map(r => r.name));
              const columnsToAdd = [ ];
              columnsToAdd.forEach(col => {
                if (!existingColumns.has(col.name)) {
                  db.run(`ALTER TABLE material_batches ADD COLUMN ${col.name} ${col.type}`, (err) => {
                    if (err) console.error(`Error adding ${col.name} column to material_batches:`, err);
                    else console.log(`Added ${col.name} column to material_batches table`);
                  });
                }
              });
            }
          });
        }
      });

      // Warehouse Inventory Table (for multi-warehouse support)
      db.run(`CREATE TABLE IF NOT EXISTS warehouse_inventory (
        id TEXT PRIMARY KEY,
        item_id TEXT NOT NULL,
        warehouse_id TEXT NOT NULL,
        quantity INTEGER NOT NULL DEFAULT 0,
        reserved INTEGER NOT NULL DEFAULT 0,
        available INTEGER NOT NULL DEFAULT 0,
        last_updated DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(item_id, warehouse_id)
      )`, (err) => {
        if (!err) {
          db.all("PRAGMA table_info(warehouse_inventory)", (err, rows) => {
            if (!err && rows) {
              const existingColumns = new Set(rows.map(r => r.name));
              const columnsToAdd = [ ];
              columnsToAdd.forEach(col => {
                if (!existingColumns.has(col.name)) {
                  db.run(`ALTER TABLE warehouse_inventory ADD COLUMN ${col.name} ${col.type}`, (err) => {
                    if (err) console.error(`Error adding ${col.name} column to warehouse_inventory:`, err);
                    else console.log(`Added ${col.name} column to warehouse_inventory table`);
                  });
                }
              });
            }
          });
        }
      });

      // Warehouse Snapshots Table
      db.run(`CREATE TABLE IF NOT EXISTS warehouse_snapshots (
        id TEXT PRIMARY KEY,
        snapshot_data TEXT NOT NULL,
        snapshot_type TEXT DEFAULT 'manual',
        notes TEXT,
        created_by TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`, (err) => {
        if (!err) { }
      });

      // Material Categories Table
      db.run(`CREATE TABLE IF NOT EXISTS material_categories (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        parent_category_id TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`);

      // Document Registry (The Core of the New Document Engine)
      db.run(`CREATE TABLE IF NOT EXISTS documents (
        id TEXT PRIMARY KEY,
        logical_number TEXT UNIQUE, -- e.g., INV-0001
        type TEXT NOT NULL, -- e.g., 'invoice', 'purchase_order'
        status TEXT NOT NULL DEFAULT 'draft', -- draft, finalized, voided
        payload TEXT NOT NULL, -- The InvoicePayload JSON
        render_model TEXT, -- The generated RenderModel (only when finalized)
        fingerprint TEXT, -- Consistency Lock fingerprint
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        finalized_at DATETIME,
        created_by TEXT,
        metadata TEXT -- Flexible metadata storage
      )`);

      // Subjects Table
      db.run(`CREATE TABLE IF NOT EXISTS subjects (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE NOT NULL,
        code TEXT UNIQUE
      )`);

      // Sales Exchanges Table
      db.run(`CREATE TABLE IF NOT EXISTS sales_exchanges (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        exchange_number TEXT UNIQUE,
        invoice_id TEXT, -- Logical ID like INV-0001 or DB ID
        customer_id TEXT,
        customer_name TEXT,
        exchange_date DATETIME DEFAULT CURRENT_TIMESTAMP,
        reason TEXT NOT NULL,
        remarks TEXT,
        status TEXT DEFAULT 'pending', -- pending, approved, rejected, completed
        created_by TEXT,
        total_price_difference REAL DEFAULT 0,
        FOREIGN KEY (invoice_id) REFERENCES documents(logical_number)
      )`);

      // Sales Exchange Items Table
      db.run(`CREATE TABLE IF NOT EXISTS sales_exchange_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        exchange_id INTEGER,
        product_id TEXT,
        product_name TEXT,
        qty_returned INTEGER DEFAULT 0,
        qty_replaced INTEGER DEFAULT 0,
        price_difference REAL DEFAULT 0,
        condition TEXT,
        FOREIGN KEY (exchange_id) REFERENCES sales_exchanges(id)
      )`);

      // Reprint Jobs Table
      db.run(`CREATE TABLE IF NOT EXISTS reprint_jobs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        exchange_id INTEGER,
        job_description TEXT,
        paper_used REAL DEFAULT 0,
        ink_used REAL DEFAULT 0,
        finishing_cost REAL DEFAULT 0,
        total_reprint_cost REAL DEFAULT 0,
        status TEXT DEFAULT 'pending', -- pending, in_progress, completed
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        completed_at DATETIME,
        FOREIGN KEY (exchange_id) REFERENCES sales_exchanges(id)
      )`);

      // Sales Exchange Approvals Table
      db.run(`CREATE TABLE IF NOT EXISTS sales_exchange_approvals (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        exchange_id INTEGER,
        approved_by TEXT,
        approval_date DATETIME DEFAULT CURRENT_TIMESTAMP,
        comments TEXT,
        status TEXT, -- approved, rejected
        FOREIGN KEY (exchange_id) REFERENCES sales_exchanges(id)
      )`);

      // Market Adjustments Table
      // Stores adjustment rules (profit margin, transport, wastage, etc.)
      db.run(`CREATE TABLE IF NOT EXISTS market_adjustments (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        type TEXT CHECK(type IN ('PERCENTAGE', 'FIXED', 'PERCENT')) NOT NULL,
        value REAL NOT NULL DEFAULT 0,
        percentage REAL,
        applies_to TEXT NOT NULL DEFAULT 'COST',
        active INTEGER NOT NULL DEFAULT 1,
        is_active INTEGER DEFAULT 1,
        description TEXT,
        category TEXT,
        display_name TEXT,
        adjustment_category TEXT CHECK(adjustment_category IN ('Profit Margin', 'Transport/Logistics', 'Wastage Factor', 'Overhead', 'Custom')),
        sort_order INTEGER DEFAULT 0,
        is_system_default INTEGER DEFAULT 0,
        apply_to_categories TEXT DEFAULT '[]',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        last_applied_at DATETIME,
        total_applied_amount REAL DEFAULT 0,
        application_count INTEGER DEFAULT 0,
        last_synced_at DATETIME,
        sync_checksum TEXT
      )`);

      // Seed the synthetic auto-rounding adjustment so that rounding
      // entries in market_adjustment_transactions satisfy the FK constraint.
      db.run(`INSERT OR IGNORE INTO market_adjustments (id, name, type, value, applies_to, is_system_default, is_active, active, adjustment_category, sort_order)
              VALUES ('auto-rounding', 'Rounding Adjustment', 'FIXED', 0, 'COST', 1, 0, 0, 'Custom', 9999)`);

      db.run(`CREATE TABLE IF NOT EXISTS examination_batch_notifications (
        id TEXT PRIMARY KEY,
        batch_id TEXT,
        user_id TEXT NOT NULL,
        notification_type TEXT NOT NULL,
        title TEXT NOT NULL,
        message TEXT NOT NULL,
        priority TEXT DEFAULT 'Medium',
        batch_details_json TEXT,
        is_read INTEGER DEFAULT 0,
        read_at DATETIME,
        delivered_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        expires_at DATETIME
      )`);
      db.run(`CREATE TABLE IF NOT EXISTS notification_audit_logs (
        id TEXT PRIMARY KEY,
        notification_id TEXT,
        user_id TEXT NOT NULL,
        action TEXT NOT NULL,
        details_json TEXT,
        ip_address TEXT,
        user_agent TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`);

      // -----------------------------------------------------------------------
      // Examination Module - Normalized Schema (New Implementation)
      // -----------------------------------------------------------------------

      // 1. Examination Batches (Top level container for a school's exam order)
      // Note: school_id references either schools(id) or customers(id) — app-level enforced
      db.run(`CREATE TABLE IF NOT EXISTS examination_batches (
        id TEXT PRIMARY KEY,
        batch_number TEXT UNIQUE,
        school_id TEXT NOT NULL,
        name TEXT NOT NULL, -- e.g. "Term 1 2026"
        academic_year TEXT,
        term TEXT,
        exam_type TEXT,
        status TEXT DEFAULT 'Draft', -- Draft, Calculated, Approved, Invoiced
        total_amount REAL DEFAULT 0,
        calculated_material_total REAL DEFAULT 0,
        calculated_adjustment_total REAL DEFAULT 0,
        adjustment_snapshots_json TEXT,
        rounding_adjustment_total REAL DEFAULT 0,
        pre_rounding_total_amount REAL DEFAULT 0,
        rounding_method TEXT DEFAULT 'nearest_50',
        rounding_value REAL DEFAULT 50,
        expected_candidature INTEGER DEFAULT 0,
        calculated_cost_per_learner REAL DEFAULT 0,
        calculation_trigger TEXT,
        calculation_duration_ms INTEGER DEFAULT 0,
        last_calculated_at DATETIME,
        currency TEXT DEFAULT 'MWK',
        invoice_id TEXT,
        pricing_lock_enabled INTEGER DEFAULT 0,
        pricing_lock_reason TEXT,
        pricing_lock_by TEXT,
        pricing_locked_at DATETIME,
        locked_paper_unit_cost REAL,
        locked_toner_unit_cost REAL,
        locked_conversion_rate REAL,
        locked_adjustments_json TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (invoice_id) REFERENCES documents(logical_number)
      )`);

      // 2. Examination Classes (Groups learners and pricing per class)
      db.run(`CREATE TABLE IF NOT EXISTS examination_classes (
        id TEXT PRIMARY KEY,
        batch_id TEXT NOT NULL,
        class_name TEXT NOT NULL,
        number_of_learners INTEGER NOT NULL,
        suggested_cost_per_learner REAL DEFAULT 0,
        manual_cost_per_learner REAL,
        is_manual_override INTEGER DEFAULT 0,
        manual_override_reason TEXT,
        manual_override_by TEXT,
        manual_override_at DATETIME,
        calculated_total_cost REAL DEFAULT 0,
        material_total_cost REAL DEFAULT 0,
        adjustment_total_cost REAL DEFAULT 0,
        adjustment_delta_percent REAL DEFAULT 0,
        cost_last_calculated_at DATETIME,
        price_per_learner REAL DEFAULT 0,
        total_price REAL DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (batch_id) REFERENCES examination_batches(id) ON DELETE CASCADE
      )`);

      // Ensure no duplicate class names exist within the same batch
      db.run(`CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_class_per_batch ON examination_classes(batch_id, class_name)`);

      // 3. Examination Subjects (The actual patch/paper details)
      db.run(`CREATE TABLE IF NOT EXISTS examination_subjects (
        id TEXT PRIMARY KEY,
        class_id TEXT NOT NULL,
        subject_name TEXT NOT NULL,
        pages INTEGER NOT NULL,
        extra_copies INTEGER DEFAULT 0,
        paper_size TEXT DEFAULT 'A4',
        orientation TEXT DEFAULT 'Portrait',
        total_sheets INTEGER DEFAULT 0, -- Calculated field
        total_pages INTEGER DEFAULT 0, -- Calculated field
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (class_id) REFERENCES examination_classes(id) ON DELETE CASCADE
      )`);

      // 3b. Examination Global Hidden BOM Defaults
      db.run(`CREATE TABLE IF NOT EXISTS bom_default_materials (
        material_type TEXT PRIMARY KEY,
        preferred_item_id TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (preferred_item_id) REFERENCES inventory(id)
      )`);

      // 4. Examination BOM Calculations (Stores cost breakdown)
      db.run(`CREATE TABLE IF NOT EXISTS examination_bom_calculations (
        id TEXT PRIMARY KEY,
        batch_id TEXT NOT NULL,
        class_id TEXT, -- Optional, if specific to a class
        item_id TEXT NOT NULL, -- Inventory Item ID (Paper, Toner), app-level FK to inventory(id)
        item_name TEXT,
        component_type TEXT DEFAULT 'MATERIAL',
        adjustment_id TEXT,
        adjustment_name TEXT,
        adjustment_type TEXT,
        adjustment_value REAL DEFAULT 0,
        allocation_ratio REAL DEFAULT 0,
        quantity_required REAL NOT NULL,
        unit_cost REAL NOT NULL,
        total_cost REAL NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (batch_id) REFERENCES examination_batches(id) ON DELETE CASCADE
      )`);

      // 5. Examination Class Adjustment Allocations
      // Stores original and redistributed adjustment amounts per class.
      db.run(`CREATE TABLE IF NOT EXISTS examination_class_adjustments (
        id TEXT PRIMARY KEY,
        batch_id TEXT NOT NULL,
        class_id TEXT NOT NULL,
        adjustment_id TEXT NOT NULL,
        adjustment_name TEXT NOT NULL,
        adjustment_type TEXT NOT NULL CHECK(adjustment_type IN ('PERCENTAGE', 'FIXED', 'PERCENT')),
        adjustment_value REAL DEFAULT 0,
        base_amount REAL DEFAULT 0,
        original_amount REAL DEFAULT 0,
        redistributed_amount REAL DEFAULT 0,
        allocation_ratio REAL DEFAULT 0,
        sequence_no INTEGER DEFAULT 0,
        source TEXT DEFAULT 'SYSTEM' CHECK(source IN ('SYSTEM', 'MANUAL_OVERRIDE')),
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (batch_id) REFERENCES examination_batches(id) ON DELETE CASCADE,
        FOREIGN KEY (class_id) REFERENCES examination_classes(id) ON DELETE CASCADE
      )`);

      // 6. Examination Pricing Audit
      // Full history of automatic/manual pricing changes.
      db.run(`CREATE TABLE IF NOT EXISTS examination_pricing_audit (
        id TEXT PRIMARY KEY,
        batch_id TEXT NOT NULL,
        class_id TEXT,
        user_id TEXT,
        event_type TEXT NOT NULL CHECK(event_type IN ('SYSTEM_CALCULATION', 'MANUAL_OVERRIDE', 'MANUAL_OVERRIDE_RESET', 'AUTO_RECALC', 'VALIDATION_WARNING', 'PERMISSION_DENIED')),
        trigger_source TEXT,
        previous_cost_per_learner REAL,
        suggested_cost_per_learner REAL,
        new_cost_per_learner REAL,
        candidature INTEGER DEFAULT 0,
        previous_total_amount REAL,
        new_total_amount REAL,
        percentage_difference REAL DEFAULT 0,
        details_json TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (batch_id) REFERENCES examination_batches(id) ON DELETE CASCADE,
        FOREIGN KEY (class_id) REFERENCES examination_classes(id) ON DELETE CASCADE
      )`);

      // Market Adjustment Transactions Table
      // Individual adjustment records for each sale item
      db.run(`CREATE TABLE IF NOT EXISTS market_adjustment_transactions (
        id TEXT PRIMARY KEY,
        sale_id TEXT NOT NULL,
        item_id TEXT NOT NULL,
        variant_id TEXT,
        adjustment_id TEXT NOT NULL,
        adjustment_name TEXT NOT NULL,
        adjustment_type TEXT CHECK(adjustment_type IN ('PERCENTAGE', 'FIXED', 'PERCENT')) NOT NULL,
        adjustment_value REAL NOT NULL,
        base_amount REAL NOT NULL,
        calculated_amount REAL NOT NULL,
        quantity INTEGER NOT NULL,
        unit_amount REAL NOT NULL,
        timestamp DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        status TEXT NOT NULL DEFAULT 'Active' CHECK(status IN ('Active', 'Reversed', 'Modified')),
        reversed_by TEXT,
        notes TEXT,
        FOREIGN KEY (adjustment_id) REFERENCES market_adjustments(id)
      )`);

      // Transaction Adjustment Snapshots Table
      // Detailed snapshots for audit trail
      db.run(`CREATE TABLE IF NOT EXISTS transaction_adjustment_snapshots (
        id TEXT PRIMARY KEY,
        sale_id TEXT NOT NULL,
        item_id TEXT NOT NULL,
        item_name TEXT,
        variant_id TEXT,
        quantity INTEGER NOT NULL,
        base_cost REAL NOT NULL,
        unit_adjustment_amount REAL NOT NULL,
        total_adjustment_amount REAL NOT NULL,
        adjustment_id TEXT,
        timestamp DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        name TEXT NOT NULL,
        type TEXT CHECK(type IN ('PERCENTAGE', 'FIXED', 'PERCENT')) NOT NULL,
        value REAL NOT NULL,
        calculated_amount REAL NOT NULL,
        category TEXT,
        is_active INTEGER NOT NULL DEFAULT 1
      )`);

      // Create indices for market adjustment tables
      db.run(`CREATE INDEX IF NOT EXISTS idx_mat_sale_id ON market_adjustment_transactions(sale_id)`);
      db.run(`CREATE INDEX IF NOT EXISTS idx_mat_item_id ON market_adjustment_transactions(item_id)`);
      db.run(`CREATE INDEX IF NOT EXISTS idx_mat_adjustment_id ON market_adjustment_transactions(adjustment_id)`);
      db.run(`CREATE INDEX IF NOT EXISTS idx_mat_timestamp ON market_adjustment_transactions(timestamp)`);
      db.run(`CREATE INDEX IF NOT EXISTS idx_tas_sale_id ON transaction_adjustment_snapshots(sale_id)`);
      db.run(`CREATE INDEX IF NOT EXISTS idx_tas_item_id ON transaction_adjustment_snapshots(item_id)`);
      db.run(`CREATE INDEX IF NOT EXISTS idx_ma_active ON market_adjustments(active)`);
      db.run(`CREATE INDEX IF NOT EXISTS idx_ma_category ON market_adjustments(adjustment_category)`);
      db.run(`CREATE INDEX IF NOT EXISTS idx_exam_notifications_user ON examination_batch_notifications(user_id)`);
      db.run(`CREATE INDEX IF NOT EXISTS idx_exam_notifications_created ON examination_batch_notifications(created_at)`);
      db.run(`CREATE INDEX IF NOT EXISTS idx_exam_notifications_read ON examination_batch_notifications(is_read)`);
      db.run(`CREATE INDEX IF NOT EXISTS idx_exam_notifications_user_created ON examination_batch_notifications(user_id, created_at DESC)`);
      db.run(`CREATE INDEX IF NOT EXISTS idx_notification_audit_logs_notification ON notification_audit_logs(notification_id)`);
      db.run(`CREATE INDEX IF NOT EXISTS idx_notification_audit_logs_user ON notification_audit_logs(user_id)`);
      db.run(`CREATE INDEX IF NOT EXISTS idx_notification_audit_logs_created ON notification_audit_logs(created_at)`);
      db.run(`CREATE INDEX IF NOT EXISTS idx_exam_class_adjustments_batch ON examination_class_adjustments(batch_id)`);
      db.run(`CREATE INDEX IF NOT EXISTS idx_exam_class_adjustments_class ON examination_class_adjustments(class_id)`);
      db.run(`CREATE INDEX IF NOT EXISTS idx_exam_pricing_audit_batch ON examination_pricing_audit(batch_id)`);
      db.run(`CREATE INDEX IF NOT EXISTS idx_exam_pricing_audit_class ON examination_pricing_audit(class_id)`);
      db.run(`CREATE INDEX IF NOT EXISTS idx_exam_pricing_audit_event ON examination_pricing_audit(event_type)`);
      db.run(`CREATE INDEX IF NOT EXISTS idx_exam_bom_calc_batch_class ON examination_bom_calculations(batch_id, class_id)`);
      db.run(`CREATE INDEX IF NOT EXISTS idx_bom_default_materials_preferred ON bom_default_materials(preferred_item_id)`);

      db.run(`CREATE TABLE IF NOT EXISTS email_verifications (
        id TEXT PRIMARY KEY,
        email TEXT NOT NULL,
        code TEXT NOT NULL,
        purpose TEXT NOT NULL,
        verified INTEGER DEFAULT 0,
        attempts INTEGER DEFAULT 0,
        expires_at TEXT NOT NULL,
        verified_at TEXT,
        created_at TEXT DEFAULT (datetime('now'))
      )`);

      db.run(`CREATE INDEX IF NOT EXISTS idx_ev_email ON email_verifications(email)`);
      db.run(`CREATE INDEX IF NOT EXISTS idx_ev_purpose ON email_verifications(purpose)`);
      db.run(`CREATE INDEX IF NOT EXISTS idx_ev_expires ON email_verifications(expires_at)`);

      // -----------------------------------------------------------------------
      // Profit Margin Settings & Overrides
      // -----------------------------------------------------------------------
      db.run(`CREATE TABLE IF NOT EXISTS profit_margin_settings (
        id TEXT PRIMARY KEY,
        scope TEXT NOT NULL CHECK(scope IN ('global', 'category', 'line_item')),
        scope_ref_id TEXT, -- category ID or line-item/product SKU
        margin_type TEXT NOT NULL CHECK(margin_type IN ('percentage', 'fixed_amount')),
        margin_value REAL NOT NULL,
        is_active INTEGER DEFAULT 1,
        apply_volume_margins INTEGER DEFAULT 0,
        reason TEXT,
        created_by TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        deleted_at DATETIME
      )`);

      db.run(`CREATE TABLE IF NOT EXISTS profit_margin_audit_logs (
        id TEXT PRIMARY KEY,
        setting_id TEXT,
        action TEXT NOT NULL, -- CREATE, UPDATE, DELETE, TOGGLE
        scope TEXT NOT NULL,
        old_value TEXT,
        new_value TEXT,
        reason TEXT,
        performed_by TEXT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
      )`);

      db.run(`CREATE INDEX IF NOT EXISTS idx_pms_resolution ON profit_margin_settings(scope, scope_ref_id, is_active, deleted_at)`);
      db.run(`CREATE INDEX IF NOT EXISTS idx_pm_audit_setting ON profit_margin_audit_logs(setting_id)`);
      db.run(`CREATE INDEX IF NOT EXISTS idx_pm_audit_timestamp ON profit_margin_audit_logs(timestamp)`);

      // Sales Orders Table (Phase 1 - Sales Module)
      db.run(`CREATE TABLE IF NOT EXISTS sales_orders (
        id TEXT PRIMARY KEY,
        quotation_id TEXT,
        order_number TEXT,
        source_request_id TEXT,
        source_request_number TEXT,
        reorder_of TEXT,
        reorder_of_number TEXT,
        approved_by TEXT,
        approved_at TEXT,
        erp_order_id TEXT,
        customer_id TEXT,
        orderDate DATETIME NOT NULL,
        deliveryDate DATETIME,
        status TEXT DEFAULT 'Draft',
        items TEXT NOT NULL,
        subtotal REAL DEFAULT 0,
        discounts REAL DEFAULT 0,
        tax REAL DEFAULT 0,
        other_charges REAL DEFAULT 0,
        total REAL DEFAULT 0,
        notes TEXT,
        created_by TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_by TEXT,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL
      )`);
      db.run(`CREATE INDEX IF NOT EXISTS idx_sales_orders_order_number ON sales_orders(order_number)`);
      db.run(`CREATE INDEX IF NOT EXISTS idx_sales_orders_source_request ON sales_orders(source_request_id)`);

      // -----------------------------------------------------------------------
      // Update existing tables if columns are missing
      const columns = [
        { table: 'examinations', column: 'charge_per_learner', type: 'REAL DEFAULT 0' },
        { table: 'examinations', column: 'batch_id', type: 'TEXT' },
        { table: 'examinations', column: 'actual_waste_sheets', type: 'REAL' },
        { table: 'examinations', column: 'invoice_id', type: 'INTEGER' },
        { table: 'examinations', column: 'is_recurring', type: 'INTEGER DEFAULT 0' },
        { table: 'examinations', column: 'academic_year', type: 'TEXT' },
        { table: 'examinations', column: 'term', type: 'TEXT' },
        { table: 'examinations', column: 'exam_type', type: 'TEXT' },
        { table: 'examinations', column: 'sub_account_name', type: 'TEXT' },
        { table: 'examinations', column: 'customer_id', type: 'TEXT' },
        { table: 'invoices', column: 'status', type: "TEXT DEFAULT 'unpaid'" },
        { table: 'invoices', column: 'payment_method', type: 'TEXT' },
        { table: 'invoices', column: 'paid_at', type: 'DATETIME' },
        { table: 'invoices', column: 'paid_amount', type: 'REAL DEFAULT 0' },
        { table: 'invoices', column: 'customer_id', type: 'TEXT' },
        { table: 'invoices', column: 'sub_account_name', type: 'TEXT' },
        { table: 'inventory', column: 'conversion_rate', type: 'REAL DEFAULT 500' },
        { table: 'sales_orders', column: 'other_charges', type: 'REAL DEFAULT 0' },
        { table: 'sales_orders', column: 'quotation_id', type: 'TEXT' },
        // Sales document chain (Phase: complete request architecture)
        { table: 'sales_orders', column: 'order_number', type: 'TEXT' },
        { table: 'sales_orders', column: 'source_request_id', type: 'TEXT' },
        { table: 'sales_orders', column: 'source_request_number', type: 'TEXT' },
        { table: 'sales_orders', column: 'reorder_of', type: 'TEXT' },
        { table: 'sales_orders', column: 'reorder_of_number', type: 'TEXT' },
        { table: 'sales_orders', column: 'approved_by', type: 'TEXT' },
        { table: 'sales_orders', column: 'approved_at', type: 'TEXT' },
        { table: 'sales_orders', column: 'erp_order_id', type: 'TEXT' },
        // Phase 4 — Customer-facing shipment tracking
        { table: 'sales_orders', column: 'tracking_number', type: 'TEXT' },
        { table: 'sales_orders', column: 'carrier', type: 'TEXT' },
        { table: 'sales_orders', column: 'driver_name', type: 'TEXT' },
        { table: 'sales_orders', column: 'vehicle_no', type: 'TEXT' },
        { table: 'sales_orders', column: 'estimated_delivery', type: 'DATETIME' },
        { table: 'sales_orders', column: 'actual_arrival', type: 'DATETIME' },
        { table: 'sales_orders', column: 'current_location', type: "TEXT DEFAULT '{}'" },
        { table: 'sales_orders', column: 'proof_of_delivery', type: 'TEXT' },
        { table: 'sales_orders', column: 'shipping_address', type: 'TEXT' },
        // Phase 3 — Versioning & Expiry
        { table: 'quotations', column: 'version', type: 'INTEGER DEFAULT 1' },
        { table: 'quotations', column: 'expired_at', type: 'TEXT' },
        { table: 'quotations', column: 'accepted_by', type: 'TEXT' },
        { table: 'quotations', column: 'accepted_by_email', type: 'TEXT' },
        { table: 'examination_batches', column: 'batch_number', type: 'TEXT' },
        { table: 'examination_batches', column: 'sub_account_name', type: 'TEXT' },
        { table: 'examination_batches', column: 'type', type: "TEXT DEFAULT 'Original'" },
        { table: 'examination_batches', column: 'parent_batch_id', type: 'TEXT' },
        { table: 'examination_batches', column: 'calculated_material_total', type: 'REAL DEFAULT 0' },
        { table: 'examination_batches', column: 'calculated_adjustment_total', type: 'REAL DEFAULT 0' },
        { table: 'examination_batches', column: 'adjustment_snapshots_json', type: 'TEXT' },
        { table: 'examination_batches', column: 'rounding_adjustment_total', type: 'REAL DEFAULT 0' },
        { table: 'examination_batches', column: 'pre_rounding_total_amount', type: 'REAL DEFAULT 0' },
        { table: 'examination_batches', column: 'rounding_method', type: "TEXT DEFAULT 'nearest_50'" },
        { table: 'examination_batches', column: 'rounding_value', type: 'REAL DEFAULT 50' },
        { table: 'examination_batches', column: 'expected_candidature', type: 'INTEGER DEFAULT 0' },
        { table: 'examination_batches', column: 'calculated_cost_per_learner', type: 'REAL DEFAULT 0' },
        { table: 'examination_batches', column: 'calculation_trigger', type: 'TEXT' },
        { table: 'examination_batches', column: 'calculation_duration_ms', type: 'INTEGER DEFAULT 0' },
        { table: 'examination_batches', column: 'last_calculated_at', type: 'DATETIME' },
        { table: 'examination_batches', column: 'pricing_lock_enabled', type: 'INTEGER DEFAULT 0' },
        { table: 'examination_batches', column: 'pricing_lock_reason', type: 'TEXT' },
        { table: 'examination_batches', column: 'pricing_lock_by', type: 'TEXT' },
        { table: 'examination_batches', column: 'pricing_locked_at', type: 'DATETIME' },
        { table: 'examination_batches', column: 'locked_paper_unit_cost', type: 'REAL' },
        { table: 'examination_batches', column: 'locked_toner_unit_cost', type: 'REAL' },
        { table: 'examination_batches', column: 'locked_conversion_rate', type: 'REAL' },
        { table: 'examination_batches', column: 'locked_adjustments_json', type: 'TEXT' },
        { table: 'examination_classes', column: 'suggested_cost_per_learner', type: 'REAL DEFAULT 0' },
        { table: 'examination_classes', column: 'manual_cost_per_learner', type: 'REAL' },
        { table: 'examination_classes', column: 'is_manual_override', type: 'INTEGER DEFAULT 0' },
        { table: 'examination_classes', column: 'manual_override_reason', type: 'TEXT' },
        { table: 'examination_classes', column: 'manual_override_by', type: 'TEXT' },
        { table: 'examination_classes', column: 'manual_override_at', type: 'DATETIME' },
        { table: 'examination_classes', column: 'calculated_total_cost', type: 'REAL DEFAULT 0' },
        { table: 'examination_classes', column: 'material_total_cost', type: 'REAL DEFAULT 0' },
        { table: 'examination_classes', column: 'adjustment_total_cost', type: 'REAL DEFAULT 0' },
        { table: 'examination_classes', column: 'adjustment_delta_percent', type: 'REAL DEFAULT 0' },
        { table: 'examination_classes', column: 'cost_last_calculated_at', type: 'DATETIME' },
        // Three Critical Financial Metrics (Examination Pricing Redesign)
        { table: 'examination_classes', column: 'expected_fee_per_learner', type: 'REAL DEFAULT 0' },
        { table: 'examination_classes', column: 'final_fee_per_learner', type: 'REAL DEFAULT 0' },
        { table: 'examination_classes', column: 'live_total_preview', type: 'REAL DEFAULT 0' },
        // Audit trail for financial metrics
        { table: 'examination_classes', column: 'financial_metrics_updated_at', type: 'DATETIME' },
        { table: 'examination_classes', column: 'financial_metrics_updated_by', type: 'TEXT' },
        { table: 'examination_classes', column: 'financial_metrics_source', type: 'TEXT' },
        { table: 'examination_subjects', column: 'total_pages', type: 'INTEGER DEFAULT 0' },
        { table: 'examination_bom_calculations', column: 'component_type', type: "TEXT DEFAULT 'MATERIAL'" },
        { table: 'examination_bom_calculations', column: 'adjustment_id', type: 'TEXT' },
        { table: 'examination_bom_calculations', column: 'adjustment_name', type: 'TEXT' },
        { table: 'examination_bom_calculations', column: 'adjustment_type', type: 'TEXT' },
        { table: 'examination_bom_calculations', column: 'adjustment_value', type: 'REAL DEFAULT 0' },
        { table: 'examination_bom_calculations', column: 'allocation_ratio', type: 'REAL DEFAULT 0' },
        { table: 'documents', column: 'logical_number', type: 'TEXT' },
        { table: 'profit_margin_settings', column: 'apply_volume_margins', type: 'INTEGER DEFAULT 0' },
                { table: 'quotations', column: 'erp_quotation_id', type: 'TEXT' },
        { table: 'quotation_requests', column: 'requested_delivery_date', type: 'TEXT' },
        { table: 'quotation_requests', column: 'attachments', type: 'TEXT' },
        { table: 'quotation_requests', column: 'assigned_to', type: 'TEXT' },
        { table: 'quotation_requests', column: 'assigned_by', type: 'TEXT' },
        { table: 'quotation_requests', column: 'assigned_at', type: 'TEXT' },
        { table: 'quotation_requests', column: 'converted_at', type: 'TEXT' },
        { table: 'quotation_requests', column: 'converted_by', type: 'TEXT' },
        { table: 'quotation_requests', column: 'quotation_number', type: 'TEXT' },
        // Order request → official sales order links (complete request architecture)
        { table: 'quotation_requests', column: 'sales_order_id', type: 'TEXT' },
        { table: 'quotation_requests', column: 'sales_order_number', type: 'TEXT' },
        { table: 'quotation_requests', column: 'reorder_of', type: 'TEXT' },
        { table: 'quotation_requests', column: 'reorder_of_number', type: 'TEXT' },
        { table: 'quotation_requests', column: 'marked', type: 'INTEGER DEFAULT 0' },
        { table: 'quotation_requests', column: 'deleted_at', type: 'TEXT' },
        // Customer Portal 2FA (Phase: portal security)
        { table: 'portal_users', column: 'two_factor_enabled', type: "INTEGER DEFAULT 0" },
        { table: 'portal_users', column: 'two_factor_secret', type: 'TEXT' },
        { table: 'portal_users', column: 'two_factor_confirmed', type: "INTEGER DEFAULT 0" }
      ];

      // Process migrations: add missing columns to existing tables
      const processedTables = new Set();
      columns.forEach(({ table, column, type }) => {
        if (processedTables.has(table)) return;
        processedTables.add(table);
        db.all(`PRAGMA table_info(${table})`, (err, rows) => {
          if (err) return;
          const existingColumns = new Set(rows.map(r => r.name));
          columns.filter(c => c.table === table).forEach(({ column: colName, type: colType }) => {
            if (!existingColumns.has(colName)) {
              db.run(`ALTER TABLE ${table} ADD COLUMN ${colName} ${colType}`, (alterErr) => {
                if (alterErr) console.error(`Error adding ${colName} to ${table}:`, alterErr.message);
              });
            }
          });
        });
      }); // ==================== REFERRAL MODULE ====================
      db.run(`CREATE TABLE IF NOT EXISTS customer_referrals (
        id TEXT PRIMARY KEY,
        customer_id TEXT NOT NULL,
        referred_by_id TEXT,
        referred_by_name TEXT,
        referral_code TEXT NOT NULL UNIQUE,
        status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','converted','expired','cancelled')),
        pending_invoice_id TEXT,
        pending_invoice_amount REAL DEFAULT 0,
        converted_invoice_id TEXT,
        converted_at DATETIME,
        notes TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        deleted_at DATETIME
      )`);
      db.run(`CREATE INDEX IF NOT EXISTS idx_referrals_customer ON customer_referrals(customer_id)`);
      db.run(`CREATE INDEX IF NOT EXISTS idx_referrals_referrer ON customer_referrals(referred_by_id)`);
      db.run(`CREATE INDEX IF NOT EXISTS idx_referrals_code ON customer_referrals(referral_code)`);
      db.run(`CREATE INDEX IF NOT EXISTS idx_referrals_status ON customer_referrals(status)`); db.run(`CREATE INDEX IF NOT EXISTS idx_referrals_created ON customer_referrals(created_at)`); 
      db.run(`CREATE TABLE IF NOT EXISTS referral_rewards (
        id TEXT PRIMARY KEY,
        referral_id TEXT NOT NULL,
        customer_id TEXT NOT NULL,
        invoice_id TEXT NOT NULL,
        invoice_amount REAL DEFAULT 0,
        amount REAL NOT NULL CHECK(amount >= 0),
        status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','paid','cancelled')),
        approved_at DATETIME,
        approved_by TEXT,
        cancelled_at DATETIME,
        cancelled_by TEXT,
        cancel_reason TEXT,
        wallet_transaction_id TEXT,
        notes TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (referral_id) REFERENCES customer_referrals(id) ON DELETE CASCADE
      )`);
      db.run(`CREATE INDEX IF NOT EXISTS idx_rewards_referral ON referral_rewards(referral_id)`);
      db.run(`CREATE INDEX IF NOT EXISTS idx_rewards_customer ON referral_rewards(customer_id)`);
      db.run(`CREATE INDEX IF NOT EXISTS idx_rewards_invoice ON referral_rewards(invoice_id)`);
      db.run(`CREATE INDEX IF NOT EXISTS idx_rewards_status ON referral_rewards(status)`); db.run(`CREATE INDEX IF NOT EXISTS idx_rewards_created ON referral_rewards(created_at)`);

      db.run(`CREATE TABLE IF NOT EXISTS referral_timeline (
        id TEXT PRIMARY KEY,
        referral_id TEXT NOT NULL,
        event_type TEXT NOT NULL,
        title TEXT NOT NULL,
        description TEXT,
        amount REAL,
        actor_id TEXT,
        actor_name TEXT,
        metadata_json TEXT,
        timestamp DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (referral_id) REFERENCES customer_referrals(id) ON DELETE CASCADE
      )`);
      db.run(`CREATE INDEX IF NOT EXISTS idx_timeline_referral ON referral_timeline(referral_id)`);
      db.run(`CREATE INDEX IF NOT EXISTS idx_timeline_event ON referral_timeline(event_type)`); 
      db.run(`CREATE TABLE IF NOT EXISTS referral_audit_logs (
        id TEXT PRIMARY KEY,
        entity_type TEXT NOT NULL CHECK(entity_type IN ('referral','reward','campaign','setting','reversal')),
        entity_id TEXT NOT NULL,
        action TEXT NOT NULL,
        actor_id TEXT NOT NULL,
        actor_name TEXT,
        field_name TEXT,
        old_value TEXT,
        new_value TEXT,
        reason TEXT,
        correlation_id TEXT,
        ip_address TEXT,
        user_agent TEXT,
        timestamp DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`);
      db.run(`CREATE INDEX IF NOT EXISTS idx_audit_entity ON referral_audit_logs(entity_type, entity_id)`);
      db.run(`CREATE INDEX IF NOT EXISTS idx_audit_actor ON referral_audit_logs(actor_id)`);
      db.run(`CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON referral_audit_logs(timestamp)`);

      db.run(`CREATE TABLE IF NOT EXISTS referral_campaigns (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        start_date TEXT NOT NULL,
        end_date TEXT,
        status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','active','paused','completed','cancelled')),
        reward_type TEXT NOT NULL DEFAULT 'percentage' CHECK(reward_type IN ('fixed','percentage','hybrid')),
        reward_value REAL DEFAULT 0,
        reward_percentage REAL DEFAULT 0,
        min_purchase_amount REAL DEFAULT 0,
        max_reward_amount REAL DEFAULT 0,
        max_rewards_per_customer INTEGER DEFAULT 0,
        max_total_rewards INTEGER DEFAULT 0,
        total_rewards_given INTEGER DEFAULT 0,
        target_segments_json TEXT,
        excluded_customers_json TEXT,
        bonus_multiplier REAL DEFAULT 1,
        terms_json TEXT,
        created_by TEXT,
        approved_by TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`);
      db.run(`CREATE INDEX IF NOT EXISTS idx_campaigns_status ON referral_campaigns(status)`);
      db.run(`CREATE INDEX IF NOT EXISTS idx_campaigns_dates ON referral_campaigns(start_date, end_date)`); 
      db.run(`CREATE TABLE IF NOT EXISTS referral_analytics (
        id TEXT PRIMARY KEY,
        period TEXT NOT NULL CHECK(period IN ('daily','weekly','monthly','quarterly','yearly')),
        period_start TEXT NOT NULL,
        period_end TEXT NOT NULL,
        total_referrals INTEGER DEFAULT 0,
        active_referrals INTEGER DEFAULT 0,
        converted_referrals INTEGER DEFAULT 0,
        total_rewards_amount REAL DEFAULT 0,
        approved_rewards_amount REAL DEFAULT 0,
        paid_rewards_amount REAL DEFAULT 0,
        pending_rewards_amount REAL DEFAULT 0,
        average_reward_amount REAL DEFAULT 0,
        conversion_rate REAL DEFAULT 0,
        revenue_attributed REAL DEFAULT 0,
        roi REAL DEFAULT 0,
        data_json TEXT,
        generated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`);
      db.run(`CREATE INDEX IF NOT EXISTS idx_analytics_period ON referral_analytics(period, period_start)`); 
      db.run(`CREATE TABLE IF NOT EXISTS referral_reversals (
        id TEXT PRIMARY KEY,
        reward_id TEXT NOT NULL,
        reason TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected','completed')),
        requested_by TEXT NOT NULL,
        requested_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        approved_by TEXT,
        approved_at DATETIME,
        rejected_by TEXT,
        rejected_at DATETIME,
        reject_reason TEXT,
        completed_at DATETIME,
        wallet_transaction_id TEXT,
        notes TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (reward_id) REFERENCES referral_rewards(id) ON DELETE CASCADE
      )`);
      db.run(`CREATE INDEX IF NOT EXISTS idx_reversals_reward ON referral_reversals(reward_id)`);
      db.run(`CREATE INDEX IF NOT EXISTS idx_reversals_status ON referral_reversals(status)`);
      db.run(`CREATE INDEX IF NOT EXISTS idx_reversals_created ON referral_reversals(created_at)`);

      db.run(`CREATE TABLE IF NOT EXISTS referral_settings (
        id TEXT PRIMARY KEY,
        settings_json TEXT NOT NULL DEFAULT '{}',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`);

      db.run(`CREATE TABLE IF NOT EXISTS idempotency_keys (
        id TEXT PRIMARY KEY,
        key TEXT NOT NULL UNIQUE,
        response_code INTEGER NOT NULL,
        response_body TEXT,
        method TEXT NOT NULL,
        path TEXT NOT NULL,
        user_id TEXT,
        expires_at DATETIME NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`);
      db.run(`CREATE INDEX IF NOT EXISTS idx_idempotency_key ON idempotency_keys(key)`);
      db.run(`CREATE INDEX IF NOT EXISTS idx_idempotency_expires ON idempotency_keys(expires_at)`);

      db.run(`CREATE TABLE IF NOT EXISTS notifications (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        title TEXT NOT NULL,
        message TEXT NOT NULL,
        recipient_id TEXT NOT NULL,
        referral_id TEXT,
        reward_id TEXT,
        status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','read','sent','failed')),
        read_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`);
      db.run(`CREATE INDEX IF NOT EXISTS idx_notifications_recipient ON notifications(recipient_id)`); db.run(`CREATE INDEX IF NOT EXISTS idx_notifications_status ON notifications(status)`);

      // ==================== BANKING MODULE ====================
      db.run(`CREATE TABLE IF NOT EXISTS bank_accounts (
        id TEXT PRIMARY KEY,
        account_name TEXT NOT NULL,
        account_number TEXT NOT NULL,
        bank_name TEXT NOT NULL,
        branch_code TEXT,
        account_type TEXT DEFAULT 'checking' CHECK(account_type IN ('checking', 'savings', 'credit', 'petty_cash')),
        currency TEXT DEFAULT 'USD',
        opening_balance REAL DEFAULT 0,
        current_balance REAL DEFAULT 0,
        status TEXT DEFAULT 'Active' CHECK(status IN ('Active', 'Inactive', 'Closed')),
        created_by TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`); db.run(`CREATE INDEX IF NOT EXISTS idx_bank_accounts_status ON bank_accounts(status)`);

      db.run(`CREATE TABLE IF NOT EXISTS bank_transactions (
        id TEXT PRIMARY KEY,
        account_id TEXT NOT NULL,
        date TEXT NOT NULL,
        type TEXT NOT NULL CHECK(type IN ('deposit', 'withdrawal', 'transfer')),
        amount REAL NOT NULL CHECK(amount > 0),
        currency TEXT DEFAULT 'USD',
        description TEXT,
        reference_type TEXT,
        reference_id TEXT,
        status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'completed', 'failed', 'cancelled')),
        reconciled INTEGER DEFAULT 0,
        reconciled_at DATETIME,
        created_by TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (account_id) REFERENCES bank_accounts(id) ON DELETE CASCADE
      )`);
      db.run(`CREATE INDEX IF NOT EXISTS idx_bank_transactions_account ON bank_transactions(account_id)`);
      db.run(`CREATE INDEX IF NOT EXISTS idx_bank_transactions_date ON bank_transactions(date)`);
      db.run(`CREATE INDEX IF NOT EXISTS idx_bank_transactions_reconciled ON bank_transactions(reconciled)`); 
      // ==================== VAT/TAX MODULE ====================
      db.run(`CREATE TABLE IF NOT EXISTS vat_transactions (
        id TEXT PRIMARY KEY,
        transaction_type TEXT NOT NULL CHECK(transaction_type IN ('sale', 'purchase', 'adjustment')),
        reference_id TEXT NOT NULL,
        reference_type TEXT NOT NULL,
        vat_rate REAL NOT NULL,
        vat_amount REAL NOT NULL,
        net_amount REAL NOT NULL,
        gross_amount REAL NOT NULL,
        vat_category TEXT DEFAULT 'standard' CHECK(vat_category IN ('standard', 'reduced', 'zero', 'exempt')),
        is_recoverable INTEGER DEFAULT 1,
        period TEXT NOT NULL,
        status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'filed', 'paid')),
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`);
      db.run(`CREATE INDEX IF NOT EXISTS idx_vat_transactions_period ON vat_transactions(period)`); db.run(`CREATE INDEX IF NOT EXISTS idx_vat_transactions_reference ON vat_transactions(reference_id, reference_type)`); db.run(`CREATE TABLE IF NOT EXISTS purchase_order_items (
        id TEXT PRIMARY KEY,
        purchase_order_id TEXT NOT NULL,
        item_id TEXT,
        item_name TEXT NOT NULL,
        quantity REAL NOT NULL CHECK(quantity > 0),
        unit_price REAL NOT NULL CHECK(unit_price >= 0),
        total_price REAL NOT NULL CHECK(total_price >= 0),
        FOREIGN KEY (purchase_order_id) REFERENCES purchase_orders(id) ON DELETE CASCADE
      )`);
      db.run(`CREATE INDEX IF NOT EXISTS idx_po_items_po ON purchase_order_items(purchase_order_id)`); db.run(`CREATE TABLE IF NOT EXISTS sale_items (
        id TEXT PRIMARY KEY,
        sale_id TEXT NOT NULL,
        item_id TEXT NOT NULL,
        variant_id TEXT,
        item_name TEXT,
        quantity INTEGER NOT NULL,
        unit_price REAL NOT NULL DEFAULT 0,
        unit_cost REAL DEFAULT 0,
        line_total REAL DEFAULT 0,
        discount REAL DEFAULT 0,
        item_type TEXT,
        consumption_snapshot_json TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (sale_id) REFERENCES sales(id) ON DELETE CASCADE
      )`);
      db.run(`CREATE INDEX IF NOT EXISTS idx_sale_items_sale ON sale_items(sale_id)`);
      db.run(`CREATE INDEX IF NOT EXISTS idx_sale_items_item ON sale_items(item_id)`); 
      // Production resources (work centers and resources) — must be queued
      // BEFORE migration ALTER TABLEs so they exist when initDb() resolves.
      db.run(`CREATE TABLE IF NOT EXISTS work_centers (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        hourly_rate REAL DEFAULT 0,
        capacity_per_day INTEGER DEFAULT 8,
        status TEXT DEFAULT 'Active',
        location TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`);

      db.run(`CREATE TABLE IF NOT EXISTS production_resources (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        work_center_id TEXT NOT NULL,
        status TEXT DEFAULT 'Active',
        resource_type TEXT,
        description TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (work_center_id) REFERENCES work_centers(id) ON DELETE CASCADE
      )`);

      // Work Orders Table (for production module)
      db.run(`CREATE TABLE IF NOT EXISTS work_orders (
        id TEXT PRIMARY KEY,
        customer_id TEXT,
        customer_name TEXT,
        product_id TEXT NOT NULL,
        product_name TEXT NOT NULL,
        quantity_planned INTEGER NOT NULL DEFAULT 1,
        quantity_completed INTEGER NOT NULL DEFAULT 0,
        quantity_waste INTEGER DEFAULT 0,
        status TEXT DEFAULT 'Draft',
        bom_id TEXT,
        due_date DATETIME,
        start_date DATETIME,
        actual_start_time DATETIME,
        completed_at DATETIME,
        notes TEXT,
        assigned_to TEXT,
        priority TEXT DEFAULT 'Normal',
        work_center_id TEXT,
        linked_batch_id TEXT,
        logs_json TEXT,
        attributes_json TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (work_center_id) REFERENCES work_centers(id) ON DELETE SET NULL
      )`);

      // Production Batches Table
      db.run(`CREATE TABLE IF NOT EXISTS production_batches (
        id TEXT PRIMARY KEY,
        work_order_id TEXT,
        customer_id TEXT,
        customer_name TEXT,
        name TEXT NOT NULL,
        status TEXT DEFAULT 'Draft',
        total_amount REAL DEFAULT 0,
        quantity_produced INTEGER DEFAULT 0,
        unit_cost REAL DEFAULT 0,
        total_cost REAL DEFAULT 0,
        total_labor_cost REAL DEFAULT 0,
        total_material_cost REAL DEFAULT 0,
        components_json TEXT,
        attributes_json TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (work_order_id) REFERENCES work_orders(id) ON DELETE SET NULL
      )`);

      db.run(`CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`);

      // ==================== ENGAGEMENT MODULE ====================
      db.run(`CREATE TABLE IF NOT EXISTS engagement_membership_tiers (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        level INTEGER NOT NULL DEFAULT 0,
        description TEXT,
        color TEXT,
        icon TEXT,
        min_spend REAL DEFAULT 0,
        entry_spend REAL DEFAULT 0,
        min_frequency INTEGER DEFAULT 0,
        min_clv REAL DEFAULT 0,
        point_multiplier REAL DEFAULT 1,
        cashback_rate REAL DEFAULT 0,
        priority_support INTEGER DEFAULT 0,
        exclusive_pricing INTEGER DEFAULT 0,
        exclusive_campaigns INTEGER DEFAULT 0,
        free_shipping INTEGER DEFAULT 0,
        birthday_reward REAL DEFAULT 0,
        annual_reward REAL DEFAULT 0,
        benefits_json TEXT,
        status TEXT DEFAULT 'active',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`);

      db.run(`CREATE TABLE IF NOT EXISTS engagement_customer_tiers (
        id TEXT PRIMARY KEY,
        customer_id TEXT NOT NULL,
        tier_id TEXT NOT NULL,
        assigned_at DATETIME,
        period_start DATETIME,
        period_spend REAL DEFAULT 0,
        period_count INTEGER DEFAULT 0,
        upgraded_at DATETIME,
        downgraded_at DATETIME,
        last_evaluated DATETIME,
        expires_at DATETIME,
        status TEXT DEFAULT 'active',
        notes TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`);

      db.run(`CREATE TABLE IF NOT EXISTS engagement_gift_cards (
        id TEXT PRIMARY KEY,
        code TEXT NOT NULL,
        pin TEXT,
        customer_id TEXT,
        issuer_id TEXT,
        initial_balance REAL DEFAULT 0,
        current_balance REAL DEFAULT 0,
        status TEXT DEFAULT 'active',
        type TEXT DEFAULT 'digital',
        expires_at DATETIME,
        activated_at DATETIME,
        cancelled_at DATETIME,
        cancel_reason TEXT,
        rechargeable INTEGER DEFAULT 0,
        transferable INTEGER DEFAULT 0,
        barcode_data TEXT,
        design_color TEXT,
        gift_message TEXT,
        purchased_with TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`);

      db.run(`CREATE TABLE IF NOT EXISTS engagement_gift_card_transactions (
        id TEXT PRIMARY KEY,
        gift_card_id TEXT NOT NULL,
        type TEXT NOT NULL,
        amount REAL NOT NULL,
        balance_after REAL NOT NULL,
        reference_type TEXT,
        reference_id TEXT,
        customer_id TEXT,
        description TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`);

      db.run(`CREATE TABLE IF NOT EXISTS engagement_promotions (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        type TEXT NOT NULL,
        value REAL NOT NULL DEFAULT 0,
        category_id TEXT,
        brand TEXT,
        bundle_items_json TEXT,
        buy_x_qty INTEGER DEFAULT 0,
        get_y_qty INTEGER DEFAULT 0,
        get_y_discount REAL DEFAULT 0,
        min_purchase REAL DEFAULT 0,
        max_discount REAL DEFAULT 0,
        max_uses INTEGER DEFAULT 0,
        current_uses INTEGER DEFAULT 0,
        customer_ids_json TEXT,
        tier_ids_json TEXT,
        campaign_id TEXT,
        stacking_rule TEXT DEFAULT 'best_only',
        priority INTEGER DEFAULT 0,
        starts_at DATETIME,
        expires_at DATETIME,
        status TEXT DEFAULT 'draft',
        created_by TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`);

      db.run(`CREATE TABLE IF NOT EXISTS engagement_cashback (
        id TEXT PRIMARY KEY,
        customer_id TEXT NOT NULL,
        invoice_id TEXT,
        amount REAL NOT NULL,
        rate REAL DEFAULT 0,
        type TEXT DEFAULT 'percentage',
        status TEXT DEFAULT 'pending',
        category TEXT,
        campaign_id TEXT,
        wallet_tx_id TEXT,
        scheduled_at DATETIME,
        approved_at DATETIME,
        approved_by TEXT,
        reversed_at DATETIME,
        reversed_by TEXT,
        reverse_reason TEXT,
        expires_at DATETIME,
        notes TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`);

      db.run(`CREATE TABLE IF NOT EXISTS engagement_points (
        id TEXT PRIMARY KEY,
        customer_id TEXT NOT NULL,
        points INTEGER NOT NULL,
        balance_after INTEGER NOT NULL,
        type TEXT NOT NULL,
        reference_type TEXT,
        reference_id TEXT,
        description TEXT,
        campaign_id TEXT,
        tier_multiplier REAL DEFAULT 1,
        expires_at DATETIME,
        redeemed_at DATETIME,
        created_by TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`);

      db.run(`CREATE TABLE IF NOT EXISTS engagement_point_balances (
        id TEXT PRIMARY KEY,
        customer_id TEXT NOT NULL,
        total_earned INTEGER DEFAULT 0,
        total_redeemed INTEGER DEFAULT 0,
        current_balance INTEGER DEFAULT 0,
        pending_expiry INTEGER DEFAULT 0,
        expires_at DATETIME,
        last_updated DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`);

      db.run(`CREATE TABLE IF NOT EXISTS engagement_affiliates (
        id TEXT PRIMARY KEY,
        customer_id TEXT NOT NULL,
        referral_code TEXT,
        status TEXT DEFAULT 'active',
        commission_rate REAL DEFAULT 0,
        commission_type TEXT DEFAULT 'percentage',
        fixed_commission REAL DEFAULT 0,
        tier_id TEXT,
        payment_method TEXT DEFAULT 'wallet',
        payment_details_json TEXT,
        total_earned REAL DEFAULT 0,
        total_paid REAL DEFAULT 0,
        approved_at DATETIME,
        approved_by TEXT,
        notes TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`);

      db.run(`CREATE TABLE IF NOT EXISTS engagement_affiliate_commissions (
        id TEXT PRIMARY KEY,
        affiliate_id TEXT NOT NULL,
        referral_id TEXT,
        invoice_id TEXT,
        customer_id TEXT,
        amount REAL NOT NULL,
        rate REAL DEFAULT 0,
        status TEXT DEFAULT 'pending',
        approved_at DATETIME,
        approved_by TEXT,
        paid_at DATETIME,
        wallet_tx_id TEXT,
        reversed_at DATETIME,
        reverse_reason TEXT,
        notes TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`);

      db.run(`CREATE TABLE IF NOT EXISTS engagement_customer_rewards (
        id TEXT PRIMARY KEY,
        customer_id TEXT NOT NULL,
        type TEXT NOT NULL,
        status TEXT DEFAULT 'pending',
        reward_type TEXT NOT NULL,
        reward_value REAL NOT NULL,
        reward_data_json TEXT,
        description TEXT,
        milestone_key TEXT,
        tier_id TEXT,
        campaign_id TEXT,
        invoice_id TEXT,
        points_tx_id TEXT,
        wallet_tx_id TEXT,
        gift_card_id TEXT,
        granted_at DATETIME,
        granted_by TEXT,
        approved_at DATETIME,
        approved_by TEXT,
        rejected_at DATETIME,
        reject_reason TEXT,
        expires_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`);

      db.run(`CREATE TABLE IF NOT EXISTS engagement_timeline (
        id TEXT PRIMARY KEY,
        customer_id TEXT NOT NULL,
        event_type TEXT NOT NULL,
        title TEXT NOT NULL,
        description TEXT,
        amount REAL,
        points INTEGER,
        tier_name TEXT,
        reference_type TEXT,
        reference_id TEXT,
        metadata_json TEXT,
        actor_id TEXT,
        actor_name TEXT,
        timestamp DATETIME NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`);

      db.run(`CREATE TABLE IF NOT EXISTS engagement_audit (
        id TEXT PRIMARY KEY,
        entity_type TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        action TEXT NOT NULL,
        actor_id TEXT NOT NULL,
        actor_name TEXT,
        field_name TEXT,
        old_value TEXT,
        new_value TEXT,
        reason TEXT,
        correlation_id TEXT,
        ip_address TEXT,
        user_agent TEXT,
        timestamp DATETIME NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`);

      db.run(`CREATE TABLE IF NOT EXISTS engagement_analytics (
        id TEXT PRIMARY KEY,
        period TEXT NOT NULL,
        period_start TEXT NOT NULL,
        period_end TEXT NOT NULL,
        data_json TEXT NOT NULL,
        generated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`);

      db.run(`CREATE TABLE IF NOT EXISTS chart_of_accounts (
        id TEXT PRIMARY KEY,
        code TEXT NOT NULL,
        name TEXT NOT NULL,
        type TEXT NOT NULL CHECK(type IN ('asset','liability','equity','revenue','expense')),
        category TEXT,
        subtype TEXT,
        parent_id TEXT,
        balance REAL DEFAULT 0,
        is_active INTEGER DEFAULT 1,
        description TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`);

      db.run(`CREATE UNIQUE INDEX IF NOT EXISTS idx_chart_of_accounts_code ON chart_of_accounts(code)`);

      db.run(`CREATE TABLE IF NOT EXISTS ledger_entries (
        id TEXT PRIMARY KEY,
        account_id TEXT NOT NULL,
        account_code TEXT,
        account_name TEXT,
        entry_type TEXT NOT NULL CHECK(entry_type IN ('debit','credit')),
        amount REAL NOT NULL CHECK(amount >= 0),
        currency TEXT DEFAULT 'USD',
        description TEXT,
        reference_type TEXT,
        reference_id TEXT,
        journal_id TEXT,
        entry_date TEXT NOT NULL,
        created_by TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (account_id) REFERENCES chart_of_accounts(id) ON DELETE CASCADE
      )`);

      db.run(`CREATE TRIGGER IF NOT EXISTS trg_update_account_balance_insert
        AFTER INSERT ON ledger_entries
        FOR EACH ROW
      BEGIN
        UPDATE chart_of_accounts
        SET balance = COALESCE(balance, 0) + CASE NEW.entry_type WHEN 'debit' THEN NEW.amount WHEN 'credit' THEN -NEW.amount ELSE 0 END
        WHERE id = NEW.account_id;
      END`);

      db.run(`CREATE TRIGGER IF NOT EXISTS trg_update_account_balance_delete
        AFTER DELETE ON ledger_entries
        FOR EACH ROW
      BEGIN
        UPDATE chart_of_accounts
        SET balance = COALESCE(balance, 0) + CASE OLD.entry_type WHEN 'debit' THEN -OLD.amount WHEN 'credit' THEN OLD.amount ELSE 0 END
        WHERE id = OLD.account_id;
      END`);

      db.run(`CREATE TABLE IF NOT EXISTS budgets (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        account_id TEXT,
        fiscal_year TEXT NOT NULL,
        period TEXT NOT NULL CHECK(period IN ('monthly','quarterly','yearly')),
        amount REAL NOT NULL CHECK(amount >= 0),
        spent REAL DEFAULT 0,
        notes TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (account_id) REFERENCES chart_of_accounts(id) ON DELETE SET NULL
      )`);

      db.run(`CREATE TABLE IF NOT EXISTS transfers (
        id TEXT PRIMARY KEY,
        from_account_id TEXT NOT NULL,
        to_account_id TEXT NOT NULL,
        amount REAL NOT NULL CHECK(amount > 0),
        currency TEXT DEFAULT 'USD',
        description TEXT,
        status TEXT DEFAULT 'completed' CHECK(status IN ('pending','completed','failed','cancelled')),
        reference TEXT,
        created_by TEXT,
        executed_at DATETIME,
        ledger_journal_id TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (from_account_id) REFERENCES chart_of_accounts(id),
        FOREIGN KEY (to_account_id) REFERENCES chart_of_accounts(id)
      )`);

      db.run(`CREATE TABLE IF NOT EXISTS expenses (
        id TEXT PRIMARY KEY,
        category TEXT NOT NULL,
        vendor_name TEXT,
        amount REAL NOT NULL CHECK(amount > 0),
        currency TEXT DEFAULT 'USD',
        description TEXT,
        expense_date TEXT NOT NULL,
        account_id TEXT,
        payment_method TEXT,
        status TEXT DEFAULT 'pending' CHECK(status IN ('pending','paid','cancelled')),
        receipt_url TEXT,
        created_by TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (account_id) REFERENCES chart_of_accounts(id) ON DELETE SET NULL
      )`);

      db.run(`CREATE TABLE IF NOT EXISTS income (
        id TEXT PRIMARY KEY,
        source TEXT NOT NULL,
        amount REAL NOT NULL CHECK(amount > 0),
        currency TEXT DEFAULT 'USD',
        description TEXT,
        income_date TEXT NOT NULL,
        account_id TEXT,
        payment_method TEXT,
        reference TEXT,
        created_by TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (account_id) REFERENCES chart_of_accounts(id) ON DELETE SET NULL
      )`);

      db.run(`CREATE TABLE IF NOT EXISTS suppliers (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT,
        phone TEXT,
        address TEXT,
        city TEXT,
        status TEXT DEFAULT 'Active',
        category TEXT,
        payment_terms TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`);

      db.run(`CREATE TABLE IF NOT EXISTS purchase_orders (
        id TEXT PRIMARY KEY,
        supplier_id TEXT NOT NULL,
        order_date TEXT NOT NULL,
        expected_date TEXT,
        status TEXT DEFAULT 'Draft' CHECK(status IN ('Draft','Sent','Approved','Received','Cancelled')),
        currency TEXT DEFAULT 'USD',
        notes TEXT,
        created_by TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (supplier_id) REFERENCES suppliers(id) ON DELETE CASCADE
      )`);

      db.run(`CREATE TABLE IF NOT EXISTS purchase_order_items (
        id TEXT PRIMARY KEY,
        purchase_order_id TEXT NOT NULL,
        item_id TEXT,
        item_name TEXT NOT NULL,
        quantity REAL NOT NULL CHECK(quantity > 0),
        unit_price REAL NOT NULL CHECK(unit_price >= 0),
        total_price REAL NOT NULL CHECK(total_price >= 0),
        FOREIGN KEY (purchase_order_id) REFERENCES purchase_orders(id) ON DELETE CASCADE
      )`);

      db.run(`CREATE TABLE IF NOT EXISTS goods_receipts (
        id TEXT PRIMARY KEY,
        purchase_order_id TEXT NOT NULL,
        received_date TEXT NOT NULL,
        status TEXT DEFAULT 'Received',
        notes TEXT,
        created_by TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (purchase_order_id) REFERENCES purchase_orders(id) ON DELETE SET NULL
      )`);

      db.run(`CREATE TABLE IF NOT EXISTS departments (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`);

      db.run(`CREATE TABLE IF NOT EXISTS employees (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT,
        phone TEXT,
        department TEXT,
        role TEXT,
        status TEXT DEFAULT 'Active',
        salary REAL DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`);

      db.run(`CREATE TABLE IF NOT EXISTS payroll_runs (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        period_start TEXT NOT NULL,
        period_end TEXT NOT NULL,
        status TEXT DEFAULT 'Draft' CHECK(status IN ('Draft','Completed','Cancelled')),
        total_gross REAL DEFAULT 0,
        total_deductions REAL DEFAULT 0,
        total_net REAL DEFAULT 0,
        employee_count INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`);

      db.run(`CREATE TABLE IF NOT EXISTS payslips (
        id TEXT PRIMARY KEY,
        employee_id TEXT NOT NULL,
        payroll_run_id TEXT NOT NULL,
        gross_pay REAL DEFAULT 0,
        deductions REAL DEFAULT 0,
        net_pay REAL DEFAULT 0,
        pay_period TEXT,
        status TEXT DEFAULT 'Draft' CHECK(status IN ('Draft','Paid','Cancelled')),
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
        FOREIGN KEY (payroll_run_id) REFERENCES payroll_runs(id) ON DELETE CASCADE
      )`);

      db.run(`CREATE TABLE IF NOT EXISTS customer_payments (
        id TEXT PRIMARY KEY,
        customer_id TEXT,
        customer_name TEXT NOT NULL,
        amount REAL NOT NULL DEFAULT 0,
        date TEXT NOT NULL,
        method TEXT DEFAULT 'Cash',
        account_id TEXT,
        reference TEXT,
        allocations_json TEXT,
        excess_amount REAL DEFAULT 0,
        excess_handling TEXT,
        notes TEXT,
        status TEXT DEFAULT 'Cleared',
        reconciled INTEGER DEFAULT 0,
        created_by TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`); db.run(`CREATE INDEX IF NOT EXISTS idx_customer_payments_customer ON customer_payments(customer_id)`);
      db.run(`CREATE INDEX IF NOT EXISTS idx_customer_payments_date ON customer_payments(date)`);

      db.run(`CREATE TABLE IF NOT EXISTS financial_years (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        code TEXT,
        start_date TEXT NOT NULL,
        end_date TEXT NOT NULL,
        is_default INTEGER DEFAULT 0,
        is_closed INTEGER DEFAULT 0,
        status TEXT DEFAULT 'Active' CHECK(status IN ('Active','Closed')),
        created_by TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`); 
      // User Preferences Table — cross-device preference sync
      db.run(`CREATE TABLE IF NOT EXISTS user_preferences (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        pref_key TEXT NOT NULL,
        pref_value TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`); 
      // Payment Allocation Tables
      db.run(`CREATE TABLE IF NOT EXISTS payment_allocations (
        id TEXT PRIMARY KEY,
        payment_id TEXT NOT NULL,
        total_allocated REAL NOT NULL DEFAULT 0,
        excess_amount REAL DEFAULT 0,
        excess_handling TEXT DEFAULT 'credit_to_customer',
        reversed INTEGER DEFAULT 0,
        reversed_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (payment_id) REFERENCES customer_payments(id) ON DELETE CASCADE
      )`);
      db.run(`CREATE INDEX IF NOT EXISTS idx_payment_allocations_payment ON payment_allocations(payment_id)`); 
      db.run(`CREATE TABLE IF NOT EXISTS payment_allocation_lines (
        id TEXT PRIMARY KEY,
        allocation_id TEXT NOT NULL,
        invoice_id TEXT NOT NULL,
        amount REAL NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (allocation_id) REFERENCES payment_allocations(id) ON DELETE CASCADE
      )`);
      db.run(`CREATE INDEX IF NOT EXISTS idx_payment_allocation_lines_allocation ON payment_allocation_lines(allocation_id)`);
      db.run(`CREATE INDEX IF NOT EXISTS idx_payment_allocation_lines_invoice ON payment_allocation_lines(invoice_id)`);

      db.run(`CREATE TABLE IF NOT EXISTS assets (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        asset_type TEXT NOT NULL CHECK(asset_type IN ('printer','vehicle','equipment','furniture','computer','other')),
        serial_number TEXT,
        model TEXT,
        manufacturer TEXT,
        purchase_date TEXT,
        purchase_cost REAL DEFAULT 0,
        current_value REAL DEFAULT 0,
        depreciation_method TEXT DEFAULT 'straight_line',
        useful_life_years INTEGER DEFAULT 5,
        status TEXT DEFAULT 'active' CHECK(status IN ('active','maintenance','retired','sold')),
        location TEXT,
        assigned_to TEXT,
        notes TEXT,
        warranty_expiry TEXT,
        last_maintenance TEXT,
        next_maintenance TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`);

      // Portal Tables — Customer Portal users, sessions, login history
      db.run(`CREATE TABLE IF NOT EXISTS portal_users (
        id TEXT PRIMARY KEY,
        customer_id TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        full_name TEXT,
        phone TEXT,
        status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'disabled', 'invited')),
        last_login_at TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      )`);
      db.run(`CREATE INDEX IF NOT EXISTS idx_portal_users_customer ON portal_users(customer_id)`); db.run(`CREATE INDEX IF NOT EXISTS idx_portal_users_email ON portal_users(email)`);

      db.run(`CREATE TABLE IF NOT EXISTS portal_sessions (
        id TEXT PRIMARY KEY,
        portal_user_id TEXT NOT NULL,
        refresh_token_hash TEXT NOT NULL,
        ip_address TEXT,
        user_agent TEXT,
        expires_at TEXT NOT NULL,
        revoked_at TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (portal_user_id) REFERENCES portal_users(id)
      )`);
      db.run(`CREATE INDEX IF NOT EXISTS idx_portal_sessions_user ON portal_sessions(portal_user_id)`);
      db.run(`CREATE INDEX IF NOT EXISTS idx_portal_sessions_token ON portal_sessions(refresh_token_hash)`);
      db.run(`CREATE INDEX IF NOT EXISTS idx_portal_sessions_expires ON portal_sessions(expires_at)`);

      db.run(`CREATE TABLE IF NOT EXISTS portal_password_resets (
        id TEXT PRIMARY KEY,
        portal_user_id TEXT NOT NULL,
        code TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        used_at TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (portal_user_id) REFERENCES portal_users(id)
      )`);
      db.run(`CREATE INDEX IF NOT EXISTS idx_portal_password_resets_user ON portal_password_resets(portal_user_id)`);
      db.run(`CREATE INDEX IF NOT EXISTS idx_portal_password_resets_code ON portal_password_resets(code)`);

      db.run(`CREATE TABLE IF NOT EXISTS portal_login_history (
        id TEXT PRIMARY KEY,
        portal_user_id TEXT NOT NULL,
        ip_address TEXT,
        user_agent TEXT,
        login_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (portal_user_id) REFERENCES portal_users(id)
      )`);
      db.run(`CREATE INDEX IF NOT EXISTS idx_portal_login_history_user ON portal_login_history(portal_user_id)`);
      db.run(`CREATE INDEX IF NOT EXISTS idx_portal_login_history_at ON portal_login_history(login_at)`);

      db.run(`CREATE TABLE IF NOT EXISTS portal_notifications (
        id TEXT PRIMARY KEY,
        portal_user_id TEXT NOT NULL,
        type TEXT NOT NULL,
        title TEXT NOT NULL,
        body TEXT,
        link TEXT,
        is_read INTEGER DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (portal_user_id) REFERENCES portal_users(id)
      )`);
      db.run(`CREATE INDEX IF NOT EXISTS idx_portal_notifications_user ON portal_notifications(portal_user_id)`);
      db.run(`CREATE INDEX IF NOT EXISTS idx_portal_notifications_read ON portal_notifications(portal_user_id, is_read)`);

      db.run(`CREATE TABLE IF NOT EXISTS portal_tickets (
        id TEXT PRIMARY KEY,
        portal_user_id TEXT NOT NULL,
        customer_id TEXT NOT NULL,
        subject TEXT NOT NULL,
        message TEXT NOT NULL,
        priority TEXT DEFAULT 'normal' CHECK(priority IN ('low', 'normal', 'high', 'urgent')),
        status TEXT DEFAULT 'open' CHECK(status IN ('open', 'in_progress', 'resolved', 'closed')),
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (portal_user_id) REFERENCES portal_users(id)
      )`);
      db.run(`CREATE INDEX IF NOT EXISTS idx_portal_tickets_user ON portal_tickets(portal_user_id)`);
      db.run(`CREATE INDEX IF NOT EXISTS idx_portal_tickets_status ON portal_tickets(status)`);

      db.run(`CREATE TABLE IF NOT EXISTS portal_ticket_messages (
        id TEXT PRIMARY KEY,
        ticket_id TEXT NOT NULL,
        sender_type TEXT NOT NULL CHECK(sender_type IN ('customer', 'staff')),
        message TEXT NOT NULL,
        created_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (ticket_id) REFERENCES portal_tickets(id)
      )`);
      db.run(`CREATE INDEX IF NOT EXISTS idx_portal_ticket_messages_ticket ON portal_ticket_messages(ticket_id)`);

      // Ticket Attachments Table
      db.run(`CREATE TABLE IF NOT EXISTS ticket_attachments (
        id TEXT PRIMARY KEY,
        ticket_id TEXT NOT NULL,
        message_id TEXT,
        filename TEXT NOT NULL,
        original_name TEXT NOT NULL,
        mime_type TEXT NOT NULL,
        size_bytes INTEGER NOT NULL DEFAULT 0,
        storage_path TEXT NOT NULL,
        uploaded_by TEXT NOT NULL,
        created_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (ticket_id) REFERENCES portal_tickets(id) ON DELETE CASCADE,
        FOREIGN KEY (message_id) REFERENCES portal_ticket_messages(id) ON DELETE CASCADE
      )`);
      db.run(`CREATE INDEX IF NOT EXISTS idx_ticket_attachments_ticket ON ticket_attachments(ticket_id)`);
      db.run(`CREATE INDEX IF NOT EXISTS idx_ticket_attachments_message ON ticket_attachments(message_id)`);

      // Portal document lifecycle — customer quotation/order requests (NOT official documents)
      db.run(`CREATE TABLE IF NOT EXISTS quotation_requests (
        id TEXT PRIMARY KEY,
        request_number TEXT UNIQUE NOT NULL,
        customer_id TEXT NOT NULL,
        customer_name TEXT,
        request_type TEXT NOT NULL DEFAULT 'quotation' CHECK(request_type IN ('quotation', 'order')),
        items TEXT NOT NULL,
        subtotal REAL DEFAULT 0,
        notes TEXT,
        status TEXT NOT NULL DEFAULT 'submitted' CHECK(status IN ('draft', 'submitted', 'assigned', 'under_review', 'waiting_for_customer', 'ready_for_conversion', 'converted', 'rejected', 'cancelled')),
        review_note TEXT,
        reviewed_by TEXT,
        reviewed_at TEXT,
        quotation_id TEXT,
        requested_delivery_date TEXT,
        attachments TEXT,
        assigned_to TEXT,
        assigned_by TEXT,
        assigned_at TEXT,
        converted_at TEXT,
        converted_by TEXT,
        quotation_number TEXT,
        sales_order_id TEXT,
        sales_order_number TEXT,
reorder_of TEXT,
        reorder_of_number TEXT,
        marked INTEGER DEFAULT 0,
        deleted_at TEXT,
        created_by TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      )`);
      db.run(`CREATE INDEX IF NOT EXISTS idx_quotation_requests_customer ON quotation_requests(customer_id)`);
      // NOTE: the legacy quotation_requests rebuild migration runs below, after
      // the column migrations — SQLite re-prepares every trigger when a table is
      // renamed, so all columns referenced by triggers must exist first.

      // Portal document lifecycle — official quotations (backend-authoritative, customer read-only)
      db.run(`CREATE TABLE IF NOT EXISTS quotations (
        id TEXT PRIMARY KEY,
        quotation_number TEXT UNIQUE NOT NULL,
        request_id TEXT,
        customer_id TEXT NOT NULL,
        customer_name TEXT,
        items TEXT NOT NULL,
        subtotal REAL DEFAULT 0,
        discount REAL DEFAULT 0,
        tax_rate REAL DEFAULT 0,
        tax_amount REAL DEFAULT 0,
        delivery_fee REAL DEFAULT 0,
        total REAL DEFAULT 0,
        currency TEXT DEFAULT 'MWK',
        payment_terms TEXT DEFAULT 'Net 7',
        valid_until TEXT,
        status TEXT NOT NULL DEFAULT 'ready' CHECK(status IN ('ready', 'accepted', 'rejected', 'revision_requested', 'converted', 'expired')),
        version INTEGER DEFAULT 1,
        expired_at TEXT,
        revision_note TEXT,
        rejection_reason TEXT,
        accepted_by TEXT,
        accepted_by_email TEXT,
        accepted_at TEXT,
        rejected_at TEXT,
        revision_requested_at TEXT,
        converted_at TEXT,
        order_id TEXT,
        created_by TEXT,
        source_request_number TEXT,
        erp_quotation_id TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      )`);
      db.run(`CREATE INDEX IF NOT EXISTS idx_quotations_customer ON quotations(customer_id)`); db.run(`CREATE INDEX IF NOT EXISTS idx_quotations_request ON quotations(request_id)`);

      // Portal document lifecycle — merged chronological timeline per document
      db.run(`CREATE TABLE IF NOT EXISTS portal_timeline_events (
        id TEXT PRIMARY KEY,
        customer_id TEXT,
        doc_type TEXT NOT NULL,
        doc_id TEXT NOT NULL,
        event_type TEXT NOT NULL,
        title TEXT NOT NULL,
        description TEXT,
        actor_type TEXT NOT NULL DEFAULT 'system' CHECK(actor_type IN ('customer', 'admin', 'system')),
        actor_id TEXT,
        actor_name TEXT,
        metadata TEXT,
        created_at TEXT DEFAULT (datetime('now'))
      )`);
      db.run(`CREATE INDEX IF NOT EXISTS idx_timeline_doc ON portal_timeline_events(doc_type, doc_id)`); 
      // Portal document lifecycle — download audit trail + analytics counters
      db.run(`CREATE TABLE IF NOT EXISTS portal_downloads (
        id TEXT PRIMARY KEY,
        customer_id TEXT NOT NULL,
        portal_user_id TEXT,
        doc_type TEXT NOT NULL,
        doc_id TEXT NOT NULL,
        doc_number TEXT,
        ip_address TEXT,
        user_agent TEXT,
        created_at TEXT DEFAULT (datetime('now'))
      )`);
      db.run(`CREATE INDEX IF NOT EXISTS idx_portal_downloads_doc ON portal_downloads(doc_type, doc_id)`); 
      // Portal document lifecycle — version snapshots (Phase 3: Versioning).
      // Generic per-document history so any docType (quotation today, artwork
      // files in later phases) records immutable point-in-time snapshots.
      db.run(`CREATE TABLE IF NOT EXISTS document_versions (
        id TEXT PRIMARY KEY,
        customer_id TEXT,
        doc_type TEXT NOT NULL,
        doc_id TEXT NOT NULL,
        version INTEGER NOT NULL,
        snapshot TEXT NOT NULL,
        reason TEXT,
        created_by TEXT,
        created_by_name TEXT,
        created_at TEXT DEFAULT (datetime('now'))
      )`);
      db.run(`CREATE INDEX IF NOT EXISTS idx_document_versions_doc ON document_versions(doc_type, doc_id, version)`); 
      // Portal document lifecycle — decision signatures (Phase 3: digital
      // approval trail). Records who accepted/rejected/requested revision and
      // when, so acceptance can never be forged or silently overwritten.
      db.run(`CREATE TABLE IF NOT EXISTS document_signatures (
        id TEXT PRIMARY KEY,
        customer_id TEXT,
        doc_type TEXT NOT NULL,
        doc_id TEXT NOT NULL,
        decision TEXT NOT NULL CHECK(decision IN ('accepted', 'rejected', 'revision')),
        signed_by TEXT,
        signer_name TEXT,
        signer_email TEXT,
        note TEXT,
        ip_address TEXT,
        user_agent TEXT,
        created_at TEXT DEFAULT (datetime('now'))
      )`);
      db.run(`CREATE INDEX IF NOT EXISTS idx_document_signatures_doc ON document_signatures(doc_type, doc_id)`); 
      // Portal document lifecycle — threaded discussions (Phase 4: collaboration).
      // 'customer' visibility = visible to the customer; 'internal' = staff-only
      // notes. Comments are always attached to a document in the chain.
      db.run(`CREATE TABLE IF NOT EXISTS document_comments (
        id TEXT PRIMARY KEY,
        customer_id TEXT,
        doc_type TEXT NOT NULL,
        doc_id TEXT NOT NULL,
        author_type TEXT NOT NULL DEFAULT 'admin' CHECK(author_type IN ('customer', 'admin', 'system')),
        author_id TEXT,
        author_name TEXT,
        visibility TEXT NOT NULL DEFAULT 'internal' CHECK(visibility IN ('customer', 'internal')),
        body TEXT NOT NULL,
        created_at TEXT DEFAULT (datetime('now'))
      )`);
      db.run(`CREATE INDEX IF NOT EXISTS idx_document_comments_doc ON document_comments(doc_type, doc_id)`); 
      // Admin notifications — new quotation requests, customer decisions, downloads
      db.run(`CREATE TABLE IF NOT EXISTS admin_notifications (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        title TEXT NOT NULL,
        body TEXT,
        link TEXT,
        customer_id TEXT,
        customer_name TEXT,
        is_read INTEGER DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now'))
      )`);

      const allColumns = [...columns];
      const migrationPromises = allColumns.map(col => {
        return new Promise((res) => {
          db.run(`ALTER TABLE ${col.table} ADD COLUMN IF NOT EXISTS ${col.column} ${col.type}`, (err) => {
            // Ignore error if column exists or other migration issues
            res();
          });
        });
      });

      function runIndex(sql) {
        return new Promise(res => db.run(sql, () => res()));
      }
      Promise.all(migrationPromises).then(() => {
        // Migration: databases created before the request-status expansion carry the
        // old CHECK constraint (5 statuses) and lack the newer columns. SQLite cannot
        // alter CHECK constraints in place, so rebuild the table when the legacy
        // constraint is detected. Legacy 'quotation_ready' rows map to 'ready_for_conversion'.
        // NOTE: must run after the column migrations — RENAME re-prepares all triggers.
        return new Promise((resolve) => {
          db.all(`SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'quotation_requests'`, [], (mErr, mRows) => {
            if (mErr) return resolve();
            const legacySql = mRows && mRows[0] && mRows[0].sql ? String(mRows[0].sql) : '';
            if (!legacySql.includes("'submitted', 'under_review', 'quotation_ready', 'rejected', 'cancelled'")) return resolve();
            db.serialize(() => {
              db.run(`ALTER TABLE quotation_requests RENAME TO quotation_requests_legacy`, (rErr) => {
                if (rErr) return console.error('[DB] quotation_requests rebuild rename failed:', rErr.message);
db.run(`CREATE TABLE quotation_requests (
	                   id TEXT PRIMARY KEY,
	                   request_number TEXT UNIQUE NOT NULL,
	                   customer_id TEXT NOT NULL,
	                   customer_name TEXT,
	                   request_type TEXT NOT NULL DEFAULT 'quotation' CHECK(request_type IN ('quotation', 'order')),
	                   items TEXT NOT NULL,
	                   subtotal REAL DEFAULT 0,
	                   notes TEXT,
	                   status TEXT NOT NULL DEFAULT 'submitted' CHECK(status IN ('draft', 'submitted', 'assigned', 'under_review', 'waiting_for_customer', 'ready_for_conversion', 'converted', 'rejected', 'cancelled')),
	                   review_note TEXT,
	                   reviewed_by TEXT,
	                   reviewed_at TEXT,
	                   quotation_id TEXT,
	                   requested_delivery_date TEXT,
	                   attachments TEXT,
	                   assigned_to TEXT,
	                   assigned_by TEXT,
	                   assigned_at TEXT,
	                   converted_at TEXT,
	                   converted_by TEXT,
	                   quotation_number TEXT,
	                   sales_order_id TEXT,
	                   sales_order_number TEXT,
	                   reorder_of TEXT,
	                   reorder_of_number TEXT,
	                   marked INTEGER DEFAULT 0,
	                   deleted_at TEXT,
	                   created_by TEXT,
	                   created_at TEXT DEFAULT (datetime('now')),
	                   updated_at TEXT DEFAULT (datetime('now'))
	                 )`, (cErr) => {
                  if (cErr) return console.error('[DB] quotation_requests rebuild create failed:', cErr.message);
db.run(`INSERT INTO quotation_requests
	                      (id, request_number, customer_id, customer_name, request_type,
	                       items, subtotal, notes, status, review_note, reviewed_by, reviewed_at,
	                       quotation_id, created_by, created_at, updated_at, marked, deleted_at)
	                    SELECT id, request_number, customer_id, customer_name, request_type,
	                           items, subtotal, notes,
	                           CASE WHEN status = 'quotation_ready' THEN 'ready_for_conversion' ELSE status END,
	                           review_note, reviewed_by, reviewed_at,
	                           quotation_id, created_by, created_at, updated_at, 0, NULL
	                    FROM quotation_requests_legacy`, (iErr) => {
                    if (iErr) return console.error('[DB] quotation_requests rebuild copy failed:', iErr.message);
                    db.run(`DROP TABLE quotation_requests_legacy`, (dErr) => {
                      if (dErr) console.error('[DB] quotation_requests legacy drop failed:', dErr.message);
                      db.run(`CREATE INDEX IF NOT EXISTS idx_quotation_requests_customer ON quotation_requests(customer_id)`); resolve();
                    });
                  });
                });
              });
            });
          });
        });
      }).then(() => {
        // Migration: databases created before Phase 3 carry the quotations CHECK
        // constraint without 'expired'. SQLite cannot alter CHECK constraints in
        // place, so rebuild the table when the legacy constraint is detected.
        return new Promise((resolve) => {
          db.all(`SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'quotations'`, [], (mErr, mRows) => {
            if (mErr) return resolve();
            const legacySql = mRows && mRows[0] && mRows[0].sql ? String(mRows[0].sql) : '';
            if (legacySql.includes("'expired'")) return resolve();
            db.serialize(() => {
              db.run(`ALTER TABLE quotations RENAME TO quotations_legacy`, (rErr) => {
                if (rErr) return console.error('[DB] quotations rebuild rename failed:', rErr.message);
                db.run(`CREATE TABLE quotations (
                  id TEXT PRIMARY KEY,
                  quotation_number TEXT UNIQUE NOT NULL,
                  request_id TEXT,
                  customer_id TEXT NOT NULL,
                  customer_name TEXT,
                  items TEXT NOT NULL,
                  subtotal REAL DEFAULT 0,
                  discount REAL DEFAULT 0,
                  tax_rate REAL DEFAULT 0,
                  tax_amount REAL DEFAULT 0,
                  delivery_fee REAL DEFAULT 0,
                  total REAL DEFAULT 0,
                  currency TEXT DEFAULT 'MWK',
                  payment_terms TEXT DEFAULT 'Net 7',
                  valid_until TEXT,
                  status TEXT NOT NULL DEFAULT 'ready' CHECK(status IN ('ready', 'accepted', 'rejected', 'revision_requested', 'converted', 'expired')),
                  version INTEGER DEFAULT 1,
                  expired_at TEXT,
                  revision_note TEXT,
                  rejection_reason TEXT,
                  accepted_by TEXT,
                  accepted_by_email TEXT,
                  accepted_at TEXT,
                  rejected_at TEXT,
                  revision_requested_at TEXT,
                  converted_at TEXT,
                  order_id TEXT,
                  created_by TEXT,
                  source_request_number TEXT,
                  erp_quotation_id TEXT,
                  created_at TEXT DEFAULT (datetime('now')),
                  updated_at TEXT DEFAULT (datetime('now'))
                )`, (cErr) => {
                  if (cErr) return console.error('[DB] quotations rebuild create failed:', cErr.message);
                  db.run(`INSERT INTO quotations
                     (id, quotation_number, request_id, customer_id, customer_name, items,
                      subtotal, discount, tax_rate, tax_amount, delivery_fee, total, currency,
                      payment_terms, valid_until, status, revision_note, rejection_reason,
                      accepted_at, rejected_at, revision_requested_at, converted_at, order_id,
                      created_by, source_request_number, erp_quotation_id, created_at, updated_at)
                   SELECT id, quotation_number, request_id, customer_id, customer_name, items,
                          subtotal, discount, tax_rate, tax_amount, delivery_fee, total, currency,
                          payment_terms, valid_until, status, revision_note, rejection_reason,
                          accepted_at, rejected_at, revision_requested_at, converted_at, order_id,
                          created_by, source_request_number, erp_quotation_id, created_at, updated_at
                   FROM quotations_legacy`, (iErr) => {
                    if (iErr) return console.error('[DB] quotations rebuild copy failed:', iErr.message);
                    db.run(`DROP TABLE quotations_legacy`, (dErr) => {
                      if (dErr) console.error('[DB] quotations legacy drop failed:', dErr.message);
                      db.run(`CREATE INDEX IF NOT EXISTS idx_quotations_customer ON quotations(customer_id)`); db.run(`CREATE INDEX IF NOT EXISTS idx_quotations_request ON quotations(request_id)`);
                      resolve();
                    });
                  });
                });
              });
            });
          });
        });
      }).then(() => {
        Promise.all([
          
          runIndex(`CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status)`),
          runIndex(`CREATE INDEX IF NOT EXISTS idx_invoices_customer_id ON invoices(customer_id)`),
          
          runIndex(`CREATE INDEX IF NOT EXISTS idx_sales_date ON sales(date)`),
          runIndex(`CREATE INDEX IF NOT EXISTS idx_sales_customer_id ON sales(customer_id)`),
          runIndex(`CREATE INDEX IF NOT EXISTS idx_sales_status ON sales(status)`),
          runIndex(`CREATE INDEX IF NOT EXISTS idx_sales_source ON sales(source)`),
          runIndex(`CREATE INDEX IF NOT EXISTS idx_sales_created_at ON sales(created_at)`),
          
          runIndex(`CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(expense_date)`),
          runIndex(`CREATE INDEX IF NOT EXISTS idx_expenses_category_date ON expenses(category, expense_date)`),
          
          
          runIndex(`CREATE INDEX IF NOT EXISTS idx_inventory_transactions_item ON inventory_transactions(item_id)`),
          
          runIndex(`CREATE INDEX IF NOT EXISTS idx_warehouse_inventory_item ON warehouse_inventory(item_id)`),
          runIndex(`CREATE INDEX IF NOT EXISTS idx_warehouse_inventory_warehouse ON warehouse_inventory(warehouse_id)`),
          
          runIndex(`CREATE INDEX IF NOT EXISTS idx_material_batches_item ON material_batches(item_id)`),
          runIndex(`CREATE INDEX IF NOT EXISTS idx_material_batches_status ON material_batches(status)`),
          
          
          
          
          
          
          
          
          
          
          // Financial Year performance indexes
          runIndex('CREATE INDEX IF NOT EXISTS idx_sales_date_fy ON sales(date)'),
          runIndex('CREATE INDEX IF NOT EXISTS idx_invoices_created_fy ON invoices(created_at)'),
          runIndex('CREATE INDEX IF NOT EXISTS idx_customer_payments_date_fy ON customer_payments(date)'),
          runIndex('CREATE INDEX IF NOT EXISTS idx_ledger_entries_date_fy ON ledger_entries(entry_date)'),
          runIndex('CREATE INDEX IF NOT EXISTS idx_expenses_date_fy ON expenses(expense_date)'),
          runIndex('CREATE INDEX IF NOT EXISTS idx_income_date_fy ON income(income_date)'),
          runIndex('CREATE INDEX IF NOT EXISTS idx_purchase_orders_date_fy ON purchase_orders(order_date)'),
          runIndex('CREATE INDEX IF NOT EXISTS idx_goods_receipts_date_fy ON goods_receipts(received_date)'),
          runIndex('CREATE INDEX IF NOT EXISTS idx_sales_orders_date_fy ON sales_orders(orderDate)'),
          runIndex('CREATE INDEX IF NOT EXISTS idx_inventory_transactions_ts_fy ON inventory_transactions(timestamp)'), 
          
          runIndex('CREATE INDEX IF NOT EXISTS idx_subjects_code ON subjects(code)'),
          runIndex('CREATE INDEX IF NOT EXISTS idx_documents_logical_number ON documents(logical_number)'),
          runIndex('CREATE INDEX IF NOT EXISTS idx_sales_exchanges_exchange_number ON sales_exchanges(exchange_number)'),
          
          
          
          
          
          runIndex('CREATE UNIQUE INDEX IF NOT EXISTS idx_exam_classes_batch_class ON examination_classes(batch_id, class_name)')
        ]).then(() => {
          migrateSingleOrganization(resolve);
        });
      });
    });
  });
};

/**
 * Single-organization ERP migration.
 *
 * Removes all company_id columns / indexes / tables from existing databases so
 * the application runs as one shared organization with no company concept.
 * Steps:
 *   1. Back up the current schema (CREATE statements) to the storage dir.
 *   2. Verify existing data belongs to a single company (warn if not).
 *   3. Drop the companies / user_companies tables and company indexes.
 *   4. Drop the company_id column from every table that has one, rebuilding
 *      any table whose constraints (e.g. UNIQUE(company_id)) block the drop.
 * Idempotent: safe to run on every startup.
 */
function migrateSingleOrganization(cb) {
  const serialize = () => {
    // 1. Schema backup
    db.all(`SELECT type, name, sql FROM sqlite_master WHERE sql IS NOT NULL AND type IN ('table','index','trigger','view')`, (e, schema) => {
      if (!e && schema && schema.length) {
        try {
          const { backupDir } = require('./runtimePaths.cjs');
          const stamp = new Date().toISOString().replace(/[:.]/g, '-');
          const file = require('path').join(backupDir, `schema_backup_pre_single_org_${stamp}.sql`);
          require('fs').writeFileSync(file, schema.map(s => s.sql + ';\n').join('\n'), 'utf8');
          console.log(`[DB] Schema backup written to ${file}`);
        } catch (backupErr) {
          console.warn('[DB] Schema backup failed:', backupErr.message);
        }
      }
      verifySingleCompany(dropCompanyTables);
    });
  };

  // 2. Verify all data belongs to one company
  const verifySingleCompany = (next) => {
    db.all(`SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'`, (e, tables) => {
      if (e || !tables || !tables.length) return next();
      const names = tables.map(t => t.name);
      let i = 0;
      const checkNext = () => {
        if (i >= names.length) return next();
        const t = names[i++];
        db.all(`PRAGMA table_info("${t}")`, (e2, cols) => {
          if (e2 || !cols || !cols.some(c => c.name === 'company_id')) return checkNext();
          db.get(`SELECT COUNT(DISTINCT company_id) AS n, COUNT(*) AS total FROM "${t}"`, (e3, row) => {
            if (!e3 && row && row.total > 0 && row.n > 1) {
              console.warn(`[DB] MIGRATION: table "${t}" has ${row.n} distinct company_id values across ${row.total} rows. All data will be merged into the single organization.`);
            }
            checkNext();
          });
        });
      };
      checkNext();
    });
  };

  // 3. Drop company tables and company indexes
  const dropCompanyTables = () => {
    db.run(`DROP TABLE IF EXISTS companies`, () => {
      // company_pricing_config is a dead multi-tenant table from the old schema;
      // no code creates or references it, and its PRIMARY KEY (company_id) blocks
      // an in-place ALTER, so drop it outright.
      db.run(`DROP TABLE IF EXISTS company_pricing_config`, () => {
        db.run(`DROP TABLE IF EXISTS user_companies`, () => {
      db.all(`SELECT name, sql FROM sqlite_master WHERE type='index' AND sql IS NOT NULL`, (e, indexes) => {
        if (e || !indexes) return dropColumns();
        const toDrop = indexes.filter(ix => /company|company_id/i.test(ix.sql || '')).map(ix => ix.name);
        const dropNext = (i) => {
          if (i >= toDrop.length) return dropColumns();
          db.run(`DROP INDEX IF EXISTS "${toDrop[i]}"`, () => dropNext(i + 1));
        };
          dropNext(0);
        });
        });
      });
    });
  };

  // 4. Drop company_id columns (rebuild table if constraints block the drop)
  const dropColumns = () => {
    db.all(`SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'`, (e, tables) => {
      if (e || !tables) { return cb(); }
      const names = tables.map(t => t.name);
      let i = 0;
      const next = () => {
        if (i >= names.length) { return cb(); }
        const t = names[i++];
        db.all(`PRAGMA table_info("${t}")`, (e2, cols) => {
          if (e2 || !cols) { return next(); }
          if (!cols.some(c => c.name === 'company_id')) return next();
          db.run(`ALTER TABLE "${t}" DROP COLUMN company_id`, (e3) => {
            if (!e3) return next();
            rebuildTableWithoutCompany(t, next);
          });
        });
      };
      next();
    });
  };

  // Rebuild a table whose company_id column cannot be dropped in place
  const rebuildTableWithoutCompany = (table, cb2) => {
    db.get(`SELECT sql FROM sqlite_master WHERE type='table' AND name=?`, [table], (e, row) => {
      if (e || !row || !row.sql) return cb2();
      let createSql = String(row.sql);
      if (!/company_id/i.test(createSql)) return cb2();
      // Strip the company_id column definition (and its trailing comma)
      createSql = createSql.replace(/\s*"?company_id"?\s+TEXT[^\n,)]*,?/gi, '');
      // Strip constraints that reference company_id
      createSql = createSql.replace(/\s*,\s*UNIQUE\s*\(\s*"?company_id"?\s*\)/gi, '');
      createSql = createSql.replace(/\s*,\s*UNIQUE\s*\([^)]*"?company_id"?[^)]*\)/gi, '');
      createSql = createSql.replace(/\s*,\s*PRIMARY\s+KEY\s*\(\s*"?company_id"?\s*\)/gi, '');
      createSql = createSql.replace(/\s*,\s*FOREIGN\s+KEY\s*\(\s*"?company_id"?\s*\)\s*REFERENCES[^,)]*\),?/gi, '');
      createSql = createSql.replace(/\s*,\s*"?company_id"?\s+TEXT[^,]*(?:REFERENCES[^,]*)?,?/gi, '');
      // Clean up any dangling commas left by the removals
      createSql = createSql.replace(/\s*,\s*\)/g, ')');
      createSql = createSql.replace(/,{2,}/g, ',');
      const temp = table + '_single_org_new';
      createSql = createSql.split(`CREATE TABLE ${table}`).join(`CREATE TABLE ${temp}`);
      createSql = createSql.split(`CREATE TABLE "${table}"`).join(`CREATE TABLE "${temp}"`);
      db.run(createSql, (cErr) => {
        if (cErr) {
          console.error(`[DB] MIGRATION: rebuild of "${table}" failed:`, cErr.message);
          return cb2();
        }
        db.all(`PRAGMA table_info("${table}")`, (e2, cols) => {
          if (e2 || !cols) {
            db.run(`DROP TABLE IF EXISTS "${temp}"`, () => cb2());
            return;
          }
          const colList = cols.filter(c => c.name !== 'company_id').map(c => `"${c.name}"`).join(', ');
          db.run(`INSERT INTO "${temp}" (${colList}) SELECT ${colList} FROM "${table}"`, (iErr) => {
            if (iErr) {
              console.error(`[DB] MIGRATION: copy into "${temp}" failed:`, iErr.message);
              db.run(`DROP TABLE IF EXISTS "${temp}"`, () => cb2());
              return;
            }
            db.run(`DROP TABLE "${table}"`, (dErr) => {
              if (dErr) {
                console.error(`[DB] MIGRATION: drop legacy "${table}" failed:`, dErr.message);
                db.run(`DROP TABLE IF EXISTS "${temp}"`, () => cb2());
                return;
              }
              db.run(`ALTER TABLE "${temp}" RENAME TO "${table}"`, () => cb2());
            });
          });
        });
      });
    });
  };

  serialize();
}

/**
 * Re-initialize the database connection with the current dbPath.
 * This is useful after workspace initialization when the dbPath changes.
 * @returns {sqlite3.Database} The new database instance
 */
function reinitializeDatabase() {
  if (dbInstance !== null) {
    try {
      dbInstance.close();
    } catch (e) {
      console.warn('[DB] Error closing existing connection:', e.message);
    }
    dbInstance = null;
    instanceId = 0;
  }
  db = getDatabase();
  return db;
}

function resetDatabase() {
  const currentPath = getDbPath();
  if (dbInstance) {
    try { dbInstance.close(); } catch (e) { console.warn('[DB] Error closing:', e.message); }
    dbInstance = null;
    instanceId = 0;
  }
  try {
    if (fs.existsSync(currentPath)) {
      fs.unlinkSync(currentPath);
      console.log('[DB] Deleted database file:', currentPath);
    }
  } catch (e) {
    console.error('[DB] Failed to delete database file:', e.message);
    throw e;
  }
  db = getDatabase();
  return db;
}

module.exports = {
  get db() { return getDatabase(); },
  initDb,
  getDatabase,
  reinitializeDatabase,
  resetDatabase
};
