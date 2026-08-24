-- ============================================================================
-- Cloud-First Migration: Prime ERP
-- Run this in Supabase SQL Editor to enable the cloud-first architecture.
-- ============================================================================

-- 1. Ensure idempotency_keys table exists and has the updated_at column
CREATE TABLE IF NOT EXISTS public.idempotency_keys (
  id UUID PRIMARY KEY,
  result TEXT,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE IF EXISTS idempotency_keys 
ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_idempotency_keys_expires_at 
ON idempotency_keys(expires_at);

-- Clean up expired keys periodically (optional: run via cron)
-- DELETE FROM idempotency_keys WHERE expires_at < NOW() - INTERVAL '7 days';

-- Add company_id for tenant isolation
ALTER TABLE IF EXISTS idempotency_keys
ADD COLUMN IF NOT EXISTS company_id TEXT;

-- Add updated_at for cloudDb.getAll ordering
ALTER TABLE IF EXISTS idempotency_keys
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_idempotency_keys_company_id
ON idempotency_keys(company_id);

-- 1b. Ensure tax_rates table exists for tax rate config sync
CREATE TABLE IF NOT EXISTS public.tax_rates (
  id TEXT PRIMARY KEY,
  data JSONB,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  company_id TEXT
);

CREATE INDEX IF NOT EXISTS idx_tax_rates_company_id 
ON tax_rates(company_id);

-- 2a. Ensure all business tables have updated_at for incremental sync
DO $$
DECLARE
  tables TEXT[] := ARRAY[
    'products', 'customers', 'suppliers', 'invoices', 'sales_orders',
    'production_batches', 'work_orders', 'ledger_entries', 'bank_accounts',
    'examination_batches', 'examination_jobs', 'inventory_transactions',
    'purchase_orders', 'goods_receipts', 'vat_transactions', 'profit_margin_settings',
    'market_adjustments', 'whatsapp_chats', 'settings', 'companies', 'profiles'
  ];
  t TEXT;
BEGIN
  FOREACH t IN ARRAY tables LOOP
    BEGIN
      EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();', t);
    EXCEPTION WHEN undefined_table THEN
      RAISE NOTICE 'Table % does not exist, skipping', t;
    END;
  END LOOP;
END $$;

-- 2b. Add data JSONB column to all business tables (cloudDb.put stores the entire payload here)
DO $$
DECLARE
  tables TEXT[] := ARRAY[
    'products', 'customers', 'suppliers', 'invoices', 'sales_orders',
    'production_batches', 'work_orders', 'work_centers', 'production_resources',
    'ledger_entries', 'bank_accounts', 'bank_transactions',
    'examination_batches', 'examination_jobs', 'examination_job_subjects',
    'inventory_transactions', 'warehouse_inventory',
    'purchase_orders', 'goods_receipts', 'vat_transactions', 'vat_returns',
    'profit_margin_settings', 'market_adjustments', 'market_adjustment_transactions',
    'whatsapp_chats', 'whatsapp_templates', 'whatsapp_campaigns', 'whatsapp_automations',
    'user_groups', 'bom_templates', 'customer_payments', 'supplier_payments',
    'resource_allocations', 'material_categories', 'material_batches',
    'material_reservations', 'bank_scheduled_payments', 'bank_exchange_rates',
    'bank_fees', 'bank_reconciliations', 'bank_adjustments', 'bank_cash_flow_forecasts',
    'bank_alerts', 'bank_categories', 'bank_statements',
    'customer_notification_logs',
    'notification_audit_logs', 'rounding_logs',
    'examination_invoice_groups', 'examination_recurring_profiles',
    'examination_inventory_deductions', 'examination_batch_notifications',
    'sms_campaigns', 'sms_templates', 'subcontract_orders', 'maintenance_logs',
    'job_tickets', 'job_ticket_settings', 'job_orders', 'examination_papers',
    'examination_printing_batches', 'sales_exchanges', 'sales_exchange_items',
    'reprint_jobs', 'sales_exchange_approvals',
    'classes', 'subjects', 'recurring_invoices', 'scheduled_payments',
    'wallet_transactions', 'delivery_notes', 'payroll_runs', 'shipments',
    'schools', 'tasks', 'expenses', 'income', 'budgets', 'transfers',
    'cheques', 'employees', 'payslips', 'subscribers',
    'sales', 'purchases', 'accounts', 'reminders', 'quotations', 'orders', 'boms',
    'inventory', 'inventory_movements', 'companies', 'profiles', 'idempotency_keys'
  ];
  t TEXT;
BEGIN
  FOREACH t IN ARRAY tables LOOP
    BEGIN
      EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS data JSONB DEFAULT ''{}''::jsonb;', t);
    EXCEPTION WHEN undefined_table THEN
      RAISE NOTICE 'Table % does not exist, skipping', t;
    END;
  END LOOP;
END $$;

-- 3. Enable Realtime for all tables (so changes propagate to other devices)
DO $$
DECLARE
  tables TEXT[] := ARRAY[
    'products', 'customers', 'suppliers', 'invoices', 'sales_orders',
    'production_batches', 'work_orders', 'work_centers', 'production_resources',
    'ledger_entries', 'bank_accounts', 'bank_transactions',
    'examination_batches', 'examination_jobs', 'examination_job_subjects',
    'inventory_transactions', 'inventory', 'warehouse_inventory',
    'purchase_orders', 'goods_receipts', 'vat_transactions',
    'profit_margin_settings', 'market_adjustments', 'whatsapp_chats',
    'settings', 'companies', 'profiles', 'users',
    'sales', 'expenses', 'purchase_orders', 'inventory_movements',
    'customers', 'suppliers', 'inventory'
  ];
  t TEXT;
BEGIN
  FOREACH t IN ARRAY tables LOOP
    BEGIN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE %I', t);
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Could not add % to publication: %', t, SQLERRM;
    END;
  END LOOP;
END $$;

-- 4. Add company_id index for multi-tenant queries
DO $$
DECLARE
  tables TEXT[] := ARRAY[
    'products', 'customers', 'suppliers', 'invoices', 'sales_orders',
    'production_batches', 'work_orders', 'ledger_entries',
    'examination_batches', 'inventory_transactions',
    'purchase_orders', 'vat_transactions', 'profit_margin_settings',
    'market_adjustments', 'whatsapp_chats', 'settings'
  ];
  t TEXT;
BEGIN
  FOREACH t IN ARRAY tables LOOP
    BEGIN
      EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%I_company_id ON %I(company_id)', t, t);
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Could not index %: %', t, SQLERRM;
    END;
  END LOOP;
END $$;
