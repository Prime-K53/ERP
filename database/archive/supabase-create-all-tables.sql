-- ============================================================================
-- Create All Business Tables for Prime ERP
-- Run this in Supabase SQL Editor BEFORE the RLS migrations.
-- Uses CREATE TABLE IF NOT EXISTS so it's safe to re-run.
-- ============================================================================

-- Helper: create a standard business table with common columns
-- Each table has: id TEXT PK, company_id TEXT, data JSONB, created_at, updated_at
-- Some tables may have additional specific columns.

-- ============================================================================
-- 1. Core tables (already created in previous migrations, but included for completeness)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.companies (
  id TEXT PRIMARY KEY,
  company_name TEXT,
  registration_number TEXT,
  email TEXT,
  phone TEXT,
  address TEXT,
  logo_url TEXT,
  data JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.profiles (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  company_id TEXT,
  full_name TEXT,
  role TEXT DEFAULT 'member',
  status TEXT DEFAULT 'Active',
  data JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id)
);

CREATE TABLE IF NOT EXISTS public.idempotency_keys (
  id UUID PRIMARY KEY,
  result TEXT,
  company_id TEXT,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.tax_rates (
  id TEXT PRIMARY KEY,
  data JSONB DEFAULT '{}',
  company_id TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- 2. Business / ERP core tables
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.financial_years (id TEXT PRIMARY KEY, company_id TEXT, data JSONB DEFAULT '{}', created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW());
CREATE TABLE IF NOT EXISTS public.user_preferences (id TEXT PRIMARY KEY, company_id TEXT, data JSONB DEFAULT '{}', created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW());
CREATE TABLE IF NOT EXISTS public.products (id TEXT PRIMARY KEY, company_id TEXT, data JSONB DEFAULT '{}', created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW());
CREATE TABLE IF NOT EXISTS public.customers (id TEXT PRIMARY KEY, company_id TEXT, data JSONB DEFAULT '{}', created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW());
CREATE TABLE IF NOT EXISTS public.suppliers (id TEXT PRIMARY KEY, company_id TEXT, data JSONB DEFAULT '{}', created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW());
CREATE TABLE IF NOT EXISTS public.invoices (id TEXT PRIMARY KEY, company_id TEXT, data JSONB DEFAULT '{}', created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW());
CREATE TABLE IF NOT EXISTS public.sales (id TEXT PRIMARY KEY, company_id TEXT, data JSONB DEFAULT '{}', created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW());
CREATE TABLE IF NOT EXISTS public.sale_items (id TEXT PRIMARY KEY, company_id TEXT, data JSONB DEFAULT '{}', created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW());
CREATE TABLE IF NOT EXISTS public.sales_orders (id TEXT PRIMARY KEY, company_id TEXT, data JSONB DEFAULT '{}', created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW());
CREATE TABLE IF NOT EXISTS public.sales_exchanges (id TEXT PRIMARY KEY, company_id TEXT, data JSONB DEFAULT '{}', created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW());
CREATE TABLE IF NOT EXISTS public.sales_exchange_items (id TEXT PRIMARY KEY, company_id TEXT, data JSONB DEFAULT '{}', created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW());
CREATE TABLE IF NOT EXISTS public.sales_exchange_approvals (id TEXT PRIMARY KEY, company_id TEXT, data JSONB DEFAULT '{}', created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW());
CREATE TABLE IF NOT EXISTS public.reprint_jobs (id TEXT PRIMARY KEY, company_id TEXT, data JSONB DEFAULT '{}', created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW());
CREATE TABLE IF NOT EXISTS public.purchase_orders (id TEXT PRIMARY KEY, company_id TEXT, data JSONB DEFAULT '{}', created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW());
CREATE TABLE IF NOT EXISTS public.goods_receipts (id TEXT PRIMARY KEY, company_id TEXT, data JSONB DEFAULT '{}', created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW());
CREATE TABLE IF NOT EXISTS public.supplier_payments (id TEXT PRIMARY KEY, company_id TEXT, data JSONB DEFAULT '{}', created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW());
CREATE TABLE IF NOT EXISTS public.customer_payments (id TEXT PRIMARY KEY, company_id TEXT, data JSONB DEFAULT '{}', created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW());
CREATE TABLE IF NOT EXISTS public.expenses (id TEXT PRIMARY KEY, company_id TEXT, data JSONB DEFAULT '{}', created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW());
CREATE TABLE IF NOT EXISTS public.income (id TEXT PRIMARY KEY, company_id TEXT, data JSONB DEFAULT '{}', created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW());
CREATE TABLE IF NOT EXISTS public.budgets (id TEXT PRIMARY KEY, company_id TEXT, data JSONB DEFAULT '{}', created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW());
CREATE TABLE IF NOT EXISTS public.transfers (id TEXT PRIMARY KEY, company_id TEXT, data JSONB DEFAULT '{}', created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW());
CREATE TABLE IF NOT EXISTS public.ledger_entries (id TEXT PRIMARY KEY, company_id TEXT, data JSONB DEFAULT '{}', created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW());
CREATE TABLE IF NOT EXISTS public.chart_of_accounts (id TEXT PRIMARY KEY, company_id TEXT, data JSONB DEFAULT '{}', created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW());
CREATE TABLE IF NOT EXISTS public.inventory (id TEXT PRIMARY KEY, company_id TEXT, data JSONB DEFAULT '{}', created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW());
CREATE TABLE IF NOT EXISTS public.inventory_items (id TEXT PRIMARY KEY, company_id TEXT, data JSONB DEFAULT '{}', created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW());
CREATE TABLE IF NOT EXISTS public.inventory_transactions (id TEXT PRIMARY KEY, company_id TEXT, data JSONB DEFAULT '{}', created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW());
CREATE TABLE IF NOT EXISTS public.inventory_movements (id TEXT PRIMARY KEY, company_id TEXT, data JSONB DEFAULT '{}', created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW());
CREATE TABLE IF NOT EXISTS public.warehouse_inventory (id TEXT PRIMARY KEY, company_id TEXT, data JSONB DEFAULT '{}', created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW());
CREATE TABLE IF NOT EXISTS public.material_categories (id TEXT PRIMARY KEY, company_id TEXT, data JSONB DEFAULT '{}', created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW());
CREATE TABLE IF NOT EXISTS public.material_batches (id TEXT PRIMARY KEY, company_id TEXT, data JSONB DEFAULT '{}', created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW());
CREATE TABLE IF NOT EXISTS public.material_reservations (id TEXT PRIMARY KEY, company_id TEXT, data JSONB DEFAULT '{}', created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW());
CREATE TABLE IF NOT EXISTS public.product_variants (id TEXT PRIMARY KEY, company_id TEXT, data JSONB DEFAULT '{}', created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW());

-- ============================================================================
-- 3. Production / Work Order tables
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.work_centers (id TEXT PRIMARY KEY, company_id TEXT, data JSONB DEFAULT '{}', created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW());
CREATE TABLE IF NOT EXISTS public.work_orders (id TEXT PRIMARY KEY, company_id TEXT, data JSONB DEFAULT '{}', created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW());
CREATE TABLE IF NOT EXISTS public.production_resources (id TEXT PRIMARY KEY, company_id TEXT, data JSONB DEFAULT '{}', created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW());
CREATE TABLE IF NOT EXISTS public.production_batches (id TEXT PRIMARY KEY, company_id TEXT, data JSONB DEFAULT '{}', created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW());
CREATE TABLE IF NOT EXISTS public.production_classes (id TEXT PRIMARY KEY, company_id TEXT, data JSONB DEFAULT '{}', created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW());
CREATE TABLE IF NOT EXISTS public.production_subjects (id TEXT PRIMARY KEY, company_id TEXT, data JSONB DEFAULT '{}', created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW());
CREATE TABLE IF NOT EXISTS public.production_bom_calculations (id TEXT PRIMARY KEY, company_id TEXT, data JSONB DEFAULT '{}', created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW());
CREATE TABLE IF NOT EXISTS public.production_class_adjustments (id TEXT PRIMARY KEY, company_id TEXT, data JSONB DEFAULT '{}', created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW());
CREATE TABLE IF NOT EXISTS public.production_pricing_audit (id TEXT PRIMARY KEY, company_id TEXT, data JSONB DEFAULT '{}', created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW());
CREATE TABLE IF NOT EXISTS public.production_batch_notifications (id TEXT PRIMARY KEY, company_id TEXT, data JSONB DEFAULT '{}', created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW());
CREATE TABLE IF NOT EXISTS public.production_notification_audit_logs (id TEXT PRIMARY KEY, company_id TEXT, data JSONB DEFAULT '{}', created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW());
CREATE TABLE IF NOT EXISTS public.production_bom_templates (id TEXT PRIMARY KEY, company_id TEXT, data JSONB DEFAULT '{}', created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW());
CREATE TABLE IF NOT EXISTS public.production_bom_template_components (id TEXT PRIMARY KEY, company_id TEXT, data JSONB DEFAULT '{}', created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW());
CREATE TABLE IF NOT EXISTS public.job_tickets (id TEXT PRIMARY KEY, company_id TEXT, data JSONB DEFAULT '{}', created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW());
CREATE TABLE IF NOT EXISTS public.job_ticket_settings (id TEXT PRIMARY KEY, company_id TEXT, data JSONB DEFAULT '{}', created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW());
CREATE TABLE IF NOT EXISTS public.job_orders (id TEXT PRIMARY KEY, company_id TEXT, data JSONB DEFAULT '{}', created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW());
CREATE TABLE IF NOT EXISTS public.subcontract_orders (id TEXT PRIMARY KEY, company_id TEXT, data JSONB DEFAULT '{}', created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW());
CREATE TABLE IF NOT EXISTS public.maintenance_logs (id TEXT PRIMARY KEY, company_id TEXT, data JSONB DEFAULT '{}', created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW());
CREATE TABLE IF NOT EXISTS public.resource_allocations (id TEXT PRIMARY KEY, company_id TEXT, data JSONB DEFAULT '{}', created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW());

-- ============================================================================
-- 4. BOM / Pricing tables
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.bom_templates (id TEXT PRIMARY KEY, company_id TEXT, data JSONB DEFAULT '{}', created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW());
CREATE TABLE IF NOT EXISTS public.bom_default_materials (id TEXT PRIMARY KEY, company_id TEXT, data JSONB DEFAULT '{}', created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW());
CREATE TABLE IF NOT EXISTS public.profit_margin_settings (id TEXT PRIMARY KEY, company_id TEXT, data JSONB DEFAULT '{}', created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW());
CREATE TABLE IF NOT EXISTS public.profit_margin_audit_logs (id TEXT PRIMARY KEY, company_id TEXT, data JSONB DEFAULT '{}', created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW());
CREATE TABLE IF NOT EXISTS public.market_adjustments (id TEXT PRIMARY KEY, company_id TEXT, data JSONB DEFAULT '{}', created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW());
CREATE TABLE IF NOT EXISTS public.market_adjustment_transactions (id TEXT PRIMARY KEY, company_id TEXT, data JSONB DEFAULT '{}', created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW());
CREATE TABLE IF NOT EXISTS public.transaction_adjustment_snapshots (id TEXT PRIMARY KEY, company_id TEXT, data JSONB DEFAULT '{}', created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW());
CREATE TABLE IF NOT EXISTS public.rounding_logs (id TEXT PRIMARY KEY, company_id TEXT, data JSONB DEFAULT '{}', created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW());

-- ============================================================================
-- 5. Examination / Education module tables
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.schools (id TEXT PRIMARY KEY, company_id TEXT, data JSONB DEFAULT '{}', created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW());
CREATE TABLE IF NOT EXISTS public.classes (id TEXT PRIMARY KEY, company_id TEXT, data JSONB DEFAULT '{}', created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW());
CREATE TABLE IF NOT EXISTS public.subjects (id TEXT PRIMARY KEY, company_id TEXT, data JSONB DEFAULT '{}', created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW());
CREATE TABLE IF NOT EXISTS public.examinations (id TEXT PRIMARY KEY, company_id TEXT, data JSONB DEFAULT '{}', created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW());
CREATE TABLE IF NOT EXISTS public.examination_batches (id TEXT PRIMARY KEY, company_id TEXT, data JSONB DEFAULT '{}', created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW());
CREATE TABLE IF NOT EXISTS public.examination_classes (id TEXT PRIMARY KEY, company_id TEXT, data JSONB DEFAULT '{}', created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW());
CREATE TABLE IF NOT EXISTS public.examination_subjects (id TEXT PRIMARY KEY, company_id TEXT, data JSONB DEFAULT '{}', created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW());
CREATE TABLE IF NOT EXISTS public.examination_bom_calculations (id TEXT PRIMARY KEY, company_id TEXT, data JSONB DEFAULT '{}', created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW());
CREATE TABLE IF NOT EXISTS public.examination_class_adjustments (id TEXT PRIMARY KEY, company_id TEXT, data JSONB DEFAULT '{}', created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW());
CREATE TABLE IF NOT EXISTS public.examination_pricing_audit (id TEXT PRIMARY KEY, company_id TEXT, data JSONB DEFAULT '{}', created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW());
CREATE TABLE IF NOT EXISTS public.examination_batch_notifications (id TEXT PRIMARY KEY, company_id TEXT, data JSONB DEFAULT '{}', created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW());
CREATE TABLE IF NOT EXISTS public.examination_jobs (id TEXT PRIMARY KEY, company_id TEXT, data JSONB DEFAULT '{}', created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW());
CREATE TABLE IF NOT EXISTS public.examination_job_subjects (id TEXT PRIMARY KEY, company_id TEXT, data JSONB DEFAULT '{}', created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW());
CREATE TABLE IF NOT EXISTS public.examination_invoice_groups (id TEXT PRIMARY KEY, company_id TEXT, data JSONB DEFAULT '{}', created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW());
CREATE TABLE IF NOT EXISTS public.examination_recurring_profiles (id TEXT PRIMARY KEY, company_id TEXT, data JSONB DEFAULT '{}', created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW());
CREATE TABLE IF NOT EXISTS public.examination_inventory_deductions (id TEXT PRIMARY KEY, company_id TEXT, data JSONB DEFAULT '{}', created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW());
CREATE TABLE IF NOT EXISTS public.examination_papers (id TEXT PRIMARY KEY, company_id TEXT, data JSONB DEFAULT '{}', created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW());
CREATE TABLE IF NOT EXISTS public.examination_printing_batches (id TEXT PRIMARY KEY, company_id TEXT, data JSONB DEFAULT '{}', created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW());
CREATE TABLE IF NOT EXISTS public.notification_audit_logs (id TEXT PRIMARY KEY, company_id TEXT, data JSONB DEFAULT '{}', created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW());

-- ============================================================================
-- 6. Banking / Finance tables
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.bank_accounts (id TEXT PRIMARY KEY, company_id TEXT, data JSONB DEFAULT '{}', created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW());
CREATE TABLE IF NOT EXISTS public.bank_transactions (id TEXT PRIMARY KEY, company_id TEXT, data JSONB DEFAULT '{}', created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW());
CREATE TABLE IF NOT EXISTS public.bank_statements (id TEXT PRIMARY KEY, company_id TEXT, data JSONB DEFAULT '{}', created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW());
CREATE TABLE IF NOT EXISTS public.bank_scheduled_payments (id TEXT PRIMARY KEY, company_id TEXT, data JSONB DEFAULT '{}', created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW());
CREATE TABLE IF NOT EXISTS public.bank_exchange_rates (id TEXT PRIMARY KEY, company_id TEXT, data JSONB DEFAULT '{}', created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW());
CREATE TABLE IF NOT EXISTS public.bank_fees (id TEXT PRIMARY KEY, company_id TEXT, data JSONB DEFAULT '{}', created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW());
CREATE TABLE IF NOT EXISTS public.bank_reconciliations (id TEXT PRIMARY KEY, company_id TEXT, data JSONB DEFAULT '{}', created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW());
CREATE TABLE IF NOT EXISTS public.bank_adjustments (id TEXT PRIMARY KEY, company_id TEXT, data JSONB DEFAULT '{}', created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW());
CREATE TABLE IF NOT EXISTS public.bank_cash_flow_forecasts (id TEXT PRIMARY KEY, company_id TEXT, data JSONB DEFAULT '{}', created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW());
CREATE TABLE IF NOT EXISTS public.bank_alerts (id TEXT PRIMARY KEY, company_id TEXT, data JSONB DEFAULT '{}', created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW());
CREATE TABLE IF NOT EXISTS public.bank_categories (id TEXT PRIMARY KEY, company_id TEXT, data JSONB DEFAULT '{}', created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW());

-- ============================================================================
-- 7. HR / Payroll tables
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.departments (id TEXT PRIMARY KEY, company_id TEXT, data JSONB DEFAULT '{}', created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW());
CREATE TABLE IF NOT EXISTS public.employees (id TEXT PRIMARY KEY, company_id TEXT, data JSONB DEFAULT '{}', created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW());
CREATE TABLE IF NOT EXISTS public.payroll_runs (id TEXT PRIMARY KEY, company_id TEXT, data JSONB DEFAULT '{}', created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW());
CREATE TABLE IF NOT EXISTS public.payslips (id TEXT PRIMARY KEY, company_id TEXT, data JSONB DEFAULT '{}', created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW());

-- ============================================================================
-- 8. WhatsApp / Communication tables
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.whatsapp_accounts (
  id TEXT PRIMARY KEY,
  company_id TEXT,
  user_id TEXT,
  phone_number_id TEXT,
  access_token TEXT,
  display_name TEXT,
  connection_status TEXT DEFAULT 'disconnected',
  last_connected_at TIMESTAMPTZ,
  data JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_whatsapp_accounts_user_id ON public.whatsapp_accounts(user_id);
CREATE TABLE IF NOT EXISTS public.whatsapp_message_queue (
  id TEXT PRIMARY KEY,
  company_id TEXT,
  account_id TEXT,
  user_id TEXT,
  recipient TEXT,
  message_content TEXT,
  status TEXT DEFAULT 'pending',
  batch_id TEXT,
  retry_count INTEGER DEFAULT 0,
  data JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_whatsapp_queue_account ON public.whatsapp_message_queue(account_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_queue_status ON public.whatsapp_message_queue(status);
CREATE TABLE IF NOT EXISTS public.whatsapp_messages (
  id TEXT PRIMARY KEY,
  company_id TEXT,
  account_id TEXT,
  user_id TEXT,
  recipient TEXT,
  message_content TEXT,
  status TEXT DEFAULT 'pending',
  direction TEXT,
  message_id TEXT,
  data JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_account ON public.whatsapp_messages(account_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_user ON public.whatsapp_messages(user_id);
CREATE TABLE IF NOT EXISTS public.whatsapp_chats (id TEXT PRIMARY KEY, company_id TEXT, data JSONB DEFAULT '{}', created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW());
CREATE TABLE IF NOT EXISTS public.whatsapp_templates (id TEXT PRIMARY KEY, company_id TEXT, data JSONB DEFAULT '{}', created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW());
CREATE TABLE IF NOT EXISTS public.whatsapp_campaigns (id TEXT PRIMARY KEY, company_id TEXT, data JSONB DEFAULT '{}', created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW());
CREATE TABLE IF NOT EXISTS public.whatsapp_automations (id TEXT PRIMARY KEY, company_id TEXT, data JSONB DEFAULT '{}', created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW());
CREATE TABLE IF NOT EXISTS public.customer_notification_logs (id TEXT PRIMARY KEY, company_id TEXT, data JSONB DEFAULT '{}', created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW());

-- ============================================================================
-- 9. SMS tables
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.sms_campaigns (id TEXT PRIMARY KEY, company_id TEXT, data JSONB DEFAULT '{}', created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW());
CREATE TABLE IF NOT EXISTS public.sms_templates (id TEXT PRIMARY KEY, company_id TEXT, data JSONB DEFAULT '{}', created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW());

-- ============================================================================
-- 10. VAT / Tax tables
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.vat_transactions (id TEXT PRIMARY KEY, company_id TEXT, data JSONB DEFAULT '{}', created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW());
CREATE TABLE IF NOT EXISTS public.vat_returns (id TEXT PRIMARY KEY, company_id TEXT, data JSONB DEFAULT '{}', created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW());

-- ============================================================================
-- 11. Other / Utility tables
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.assets (id TEXT PRIMARY KEY, company_id TEXT, data JSONB DEFAULT '{}', created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW());
CREATE TABLE IF NOT EXISTS public.audit_logs (id TEXT PRIMARY KEY, company_id TEXT, data JSONB DEFAULT '{}', created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW());
CREATE TABLE IF NOT EXISTS public.documents (id TEXT PRIMARY KEY, company_id TEXT, data JSONB DEFAULT '{}', created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW());
CREATE TABLE IF NOT EXISTS public.settings (id TEXT PRIMARY KEY, company_id TEXT, data JSONB DEFAULT '{}', created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW());
CREATE TABLE IF NOT EXISTS public.warehouses (id TEXT PRIMARY KEY, company_id TEXT, data JSONB DEFAULT '{}', created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW());
CREATE TABLE IF NOT EXISTS public.customerpricingtiers (id TEXT PRIMARY KEY, company_id TEXT, data JSONB DEFAULT '{}', created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW());
CREATE TABLE IF NOT EXISTS public.discountrules (id TEXT PRIMARY KEY, company_id TEXT, data JSONB DEFAULT '{}', created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW());
CREATE TABLE IF NOT EXISTS public.recurring_invoices (id TEXT PRIMARY KEY, company_id TEXT, data JSONB DEFAULT '{}', created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW());
CREATE TABLE IF NOT EXISTS public.scheduled_payments (id TEXT PRIMARY KEY, company_id TEXT, data JSONB DEFAULT '{}', created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW());
CREATE TABLE IF NOT EXISTS public.wallet_transactions (id TEXT PRIMARY KEY, company_id TEXT, data JSONB DEFAULT '{}', created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW());
CREATE TABLE IF NOT EXISTS public.delivery_notes (id TEXT PRIMARY KEY, company_id TEXT, data JSONB DEFAULT '{}', created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW());
CREATE TABLE IF NOT EXISTS public.shipments (id TEXT PRIMARY KEY, company_id TEXT, data JSONB DEFAULT '{}', created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW());
CREATE TABLE IF NOT EXISTS public.tasks (id TEXT PRIMARY KEY, company_id TEXT, data JSONB DEFAULT '{}', created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW());
CREATE TABLE IF NOT EXISTS public.user_groups (id TEXT PRIMARY KEY, company_id TEXT, data JSONB DEFAULT '{}', created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW());

-- ============================================================================
-- 12. Legacy tables (from erp_schema_postgresql.sql)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.purchases (id TEXT PRIMARY KEY, company_id TEXT, data JSONB DEFAULT '{}', created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW());
CREATE TABLE IF NOT EXISTS public.accounts (id TEXT PRIMARY KEY, company_id TEXT, data JSONB DEFAULT '{}', created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW());
CREATE TABLE IF NOT EXISTS public.reminders (id TEXT PRIMARY KEY, company_id TEXT, data JSONB DEFAULT '{}', created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW());
CREATE TABLE IF NOT EXISTS public.quotations (id TEXT PRIMARY KEY, company_id TEXT, data JSONB DEFAULT '{}', created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW());
CREATE TABLE IF NOT EXISTS public.orders (id TEXT PRIMARY KEY, company_id TEXT, data JSONB DEFAULT '{}', created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW());
CREATE TABLE IF NOT EXISTS public.boms (id TEXT PRIMARY KEY, company_id TEXT, data JSONB DEFAULT '{}', created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW());
CREATE TABLE IF NOT EXISTS public.cheques (id TEXT PRIMARY KEY, company_id TEXT, data JSONB DEFAULT '{}', created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW());
CREATE TABLE IF NOT EXISTS public.subscribers (id TEXT PRIMARY KEY, company_id TEXT, data JSONB DEFAULT '{}', created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW());

-- ============================================================================
-- 13. Indexes for query performance
-- NOTE: company_id-based indexes (idx_profiles_company_id,
-- idx_idempotency_keys_company_id, idx_tax_rates_company_id) were removed
-- because supabase-migrate-to-single-company.sql drops the company_id column
-- from every table. Re-running this file on an already-migrated database
-- otherwise fails with: ERROR 42703: column "company_id" does not exist.
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_companies_company_id ON public.companies(id);
CREATE INDEX IF NOT EXISTS idx_profiles_user_id ON public.profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_idempotency_keys_expires_at ON public.idempotency_keys(expires_at);

-- ============================================================================
-- 14. Enable RLS on all tables (idempotent via IF NOT EXISTS approach,
--     but ALTER TABLE ... ENABLE ROW LEVEL SECURITY is safe to re-run)
-- ============================================================================
-- Note: This section is also covered by supabase-rls-hardening-migration.sql,
-- but we include it here so table creation and RLS enablement are atomic.

-- The actual RLS policies are defined in supabase-rls-policies.sql and
-- supabase-rls-hardening-migration.sql, which should be run after this file.

-- ============================================================================
-- End of migration
-- ============================================================================
