const sqlite3 = require('sqlite3');
const { initDb } = require('../db.cjs');

function createTestDb() {
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(':memory:', (err) => {
      if (err) return reject(err);
      resolve(db);
    });
  });
}

function createTestSchema(db) {
  const tables = [
    `CREATE TABLE IF NOT EXISTS chart_of_accounts (
      id TEXT PRIMARY KEY, code TEXT NOT NULL, name TEXT NOT NULL,
      type TEXT NOT NULL, category TEXT, subtype TEXT, parent_id TEXT,
      balance REAL DEFAULT 0, is_active INTEGER DEFAULT 1, description TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS ledger_entries (
      id TEXT PRIMARY KEY, account_id TEXT NOT NULL,
      account_code TEXT, account_name TEXT,
      entry_type TEXT NOT NULL, amount REAL NOT NULL,
      currency TEXT DEFAULT 'USD', description TEXT,
      reference_type TEXT, reference_id TEXT, journal_id TEXT,
      entry_date TEXT NOT NULL, created_by TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS budgets (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, account_id TEXT,
      fiscal_year TEXT NOT NULL, period TEXT NOT NULL,
      amount REAL NOT NULL, spent REAL DEFAULT 0,
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS transfers (
      id TEXT PRIMARY KEY, from_account_id TEXT NOT NULL, to_account_id TEXT NOT NULL,
      amount REAL NOT NULL, currency TEXT DEFAULT 'USD',
      description TEXT, status TEXT DEFAULT 'completed',
      reference TEXT, created_by TEXT,
      executed_at DATETIME, ledger_journal_id TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS expenses (
      id TEXT PRIMARY KEY, category TEXT NOT NULL, vendor_name TEXT,
      amount REAL NOT NULL, currency TEXT DEFAULT 'USD',
      description TEXT, expense_date TEXT NOT NULL, account_id TEXT,
      payment_method TEXT, status TEXT DEFAULT 'pending',
      receipt_url TEXT, created_by TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS income (
      id TEXT PRIMARY KEY, source TEXT NOT NULL,
      amount REAL NOT NULL, currency TEXT DEFAULT 'USD',
      description TEXT, income_date TEXT NOT NULL, account_id TEXT,
      payment_method TEXT, reference TEXT,       created_by TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS suppliers (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT, phone TEXT,
      address TEXT, city TEXT, status TEXT DEFAULT 'Active',
      category TEXT, payment_terms TEXT,       created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS purchase_orders (
      id TEXT PRIMARY KEY, supplier_id TEXT NOT NULL,
      order_date TEXT NOT NULL, expected_date TEXT,
      status TEXT DEFAULT 'Draft', currency TEXT DEFAULT 'USD',
      notes TEXT, created_by TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS purchase_order_items (
      id TEXT PRIMARY KEY,
      purchase_order_id TEXT NOT NULL,
      item_id TEXT,
      item_name TEXT NOT NULL,
      quantity REAL NOT NULL,
      unit_price REAL NOT NULL,
      total_price REAL NOT NULL,
      FOREIGN KEY (purchase_order_id) REFERENCES purchase_orders(id) ON DELETE CASCADE
    )`,
    `CREATE TABLE IF NOT EXISTS goods_receipts (
      id TEXT PRIMARY KEY,
      purchase_order_id TEXT NOT NULL,
      received_date TEXT NOT NULL,
      status TEXT DEFAULT 'Received',
      notes TEXT,
            created_by TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (purchase_order_id) REFERENCES purchase_orders(id) ON DELETE SET NULL
    )`,
    `CREATE TABLE IF NOT EXISTS employees (
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
    )`,
    `CREATE TABLE IF NOT EXISTS departments (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS attendance (
      id TEXT PRIMARY KEY, employee_id TEXT NOT NULL,
      date TEXT NOT NULL, status TEXT DEFAULT 'present',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS payroll (
      id TEXT PRIMARY KEY, employee_id TEXT NOT NULL,
      period TEXT NOT NULL, amount REAL NOT NULL,
      currency TEXT DEFAULT 'USD', status TEXT DEFAULT 'pending',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS work_centers (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      hourly_rate REAL DEFAULT 0,
      capacity_per_day REAL DEFAULT 0,
      status TEXT DEFAULT 'Active',
      location TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS production_resources (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      work_center_id TEXT,
      status TEXT DEFAULT 'Active',
      resource_type TEXT,
      description TEXT,
      cost_per_unit REAL DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS work_orders (
      id TEXT PRIMARY KEY,
      customer_id TEXT,
      customer_name TEXT,
      product_id TEXT,
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
            created_by TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (work_center_id) REFERENCES work_centers(id) ON DELETE SET NULL
    )`,
    `CREATE TABLE IF NOT EXISTS production_batches (
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
    )`,
    `CREATE TABLE IF NOT EXISTS payroll_runs (
      id TEXT PRIMARY KEY, name TEXT, period_start TEXT, period_end TEXT,
      status TEXT DEFAULT 'draft', total_gross REAL DEFAULT 0,
      total_deductions REAL DEFAULT 0, total_net REAL DEFAULT 0,
      employee_count INTEGER DEFAULT 0,       created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS payslips (
      id TEXT PRIMARY KEY, employee_id TEXT NOT NULL, payroll_run_id TEXT,
      gross_pay REAL DEFAULT 0, deductions REAL DEFAULT 0,
      net_pay REAL DEFAULT 0, pay_period TEXT, status TEXT DEFAULT 'pending',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`
  ];

  return tables.reduce((chain, sql) =>
    chain.then(() => new Promise((resolve, reject) => {
      db.run(sql, (err) => { if (err) reject(err); else resolve(); });
    })),
    Promise.resolve()
  );
}

function createTestApp(db) {
  const express = require('express');
  const app = express();
  app.use(express.json());

  const FinanceService = require('../services/financeService.cjs');
  const procurementService = require('../services/procurementService.cjs');
  const ProductionService = require('../services/productionService.cjs');
  const HRService = require('../services/hrService.cjs');

  const services = {
    finance: new FinanceService(db),
    procurement: new procurementService(db),
    production: new ProductionService(db),
    hr: new HRService(db)
  };

  return { app, services, db };
}

function generateTestId(prefix = 'test') {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

module.exports = { createTestDb, createTestApp, createTestSchema, generateTestId };
