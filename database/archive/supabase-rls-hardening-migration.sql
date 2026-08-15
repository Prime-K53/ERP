-- ============================================================================
-- Multi-Tenant RLS Hardening Migration
-- Run this in Supabase SQL Editor.
-- ============================================================================

-- ============================================================================
-- 1. Helper: SECURITY DEFINER function to read current user's company_id
-- ============================================================================
CREATE OR REPLACE FUNCTION public.get_user_company_id()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT company_id FROM public.profiles WHERE user_id = auth.uid()::text LIMIT 1),
    auth.jwt() ->> 'company_id',
    (SELECT raw_user_meta_data ->> 'company_id' FROM auth.users WHERE id = auth.uid())
  );
$$;

GRANT EXECUTE ON FUNCTION public.get_user_company_id() TO authenticated;

-- ============================================================================
-- 2. Helper: SECURITY DEFINER function to set tenant_id in auth.users
--    raw_app_meta_data (cannot be spoofed by client).
--    Call this after signup or company creation to bake the tenant into the JWT.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.set_user_app_metadata(
  p_user_id uuid,
  p_tenant_id text,
  p_role text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = auth, public
AS $$
DECLARE
  current_metadata jsonb;
BEGIN
  SELECT COALESCE(raw_app_meta_data, '{}') INTO current_metadata
  FROM auth.users WHERE id = p_user_id;

  current_metadata := jsonb_set(current_metadata, '{tenant_id}', to_jsonb(p_tenant_id));

  IF p_role IS NOT NULL THEN
    current_metadata := jsonb_set(current_metadata, '{role}', to_jsonb(p_role));
  END IF;

  UPDATE auth.users SET raw_app_meta_data = current_metadata WHERE id = p_user_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_user_app_metadata(uuid, text, text) TO authenticated;

-- ============================================================================
-- 3. Add company_id column to ALL tables
-- ============================================================================

-- Core ERP tables
ALTER TABLE IF EXISTS public.bom_templates ADD COLUMN IF NOT EXISTS company_id TEXT;
ALTER TABLE IF EXISTS public.inventory_items ADD COLUMN IF NOT EXISTS company_id TEXT;
ALTER TABLE IF EXISTS public.products ADD COLUMN IF NOT EXISTS company_id TEXT;
ALTER TABLE IF EXISTS public.product_variants ADD COLUMN IF NOT EXISTS company_id TEXT;
ALTER TABLE IF EXISTS public.market_adjustments ADD COLUMN IF NOT EXISTS company_id TEXT;
ALTER TABLE IF EXISTS public.market_adjustment_transactions ADD COLUMN IF NOT EXISTS company_id TEXT;
ALTER TABLE IF EXISTS public.transaction_adjustment_snapshots ADD COLUMN IF NOT EXISTS company_id TEXT;
ALTER TABLE IF EXISTS public.rounding_logs ADD COLUMN IF NOT EXISTS company_id TEXT;

-- Examination tables
ALTER TABLE IF EXISTS public.examination_batches ADD COLUMN IF NOT EXISTS company_id TEXT;
ALTER TABLE IF EXISTS public.examination_classes ADD COLUMN IF NOT EXISTS company_id TEXT;
ALTER TABLE IF EXISTS public.examination_subjects ADD COLUMN IF NOT EXISTS company_id TEXT;
ALTER TABLE IF EXISTS public.examination_bom_calculations ADD COLUMN IF NOT EXISTS company_id TEXT;
ALTER TABLE IF EXISTS public.examination_class_adjustments ADD COLUMN IF NOT EXISTS company_id TEXT;
ALTER TABLE IF EXISTS public.examination_pricing_audit ADD COLUMN IF NOT EXISTS company_id TEXT;
ALTER TABLE IF EXISTS public.examination_batch_notifications ADD COLUMN IF NOT EXISTS company_id TEXT;
ALTER TABLE IF EXISTS public.notification_audit_logs ADD COLUMN IF NOT EXISTS company_id TEXT;

-- Production tables
ALTER TABLE IF EXISTS public.production_batches ADD COLUMN IF NOT EXISTS company_id TEXT;
ALTER TABLE IF EXISTS public.production_classes ADD COLUMN IF NOT EXISTS company_id TEXT;
ALTER TABLE IF EXISTS public.production_subjects ADD COLUMN IF NOT EXISTS company_id TEXT;
ALTER TABLE IF EXISTS public.production_bom_calculations ADD COLUMN IF NOT EXISTS company_id TEXT;
ALTER TABLE IF EXISTS public.production_class_adjustments ADD COLUMN IF NOT EXISTS company_id TEXT;
ALTER TABLE IF EXISTS public.production_pricing_audit ADD COLUMN IF NOT EXISTS company_id TEXT;
ALTER TABLE IF EXISTS public.production_batch_notifications ADD COLUMN IF NOT EXISTS company_id TEXT;
ALTER TABLE IF EXISTS public.production_notification_audit_logs ADD COLUMN IF NOT EXISTS company_id TEXT;
ALTER TABLE IF EXISTS public.production_bom_templates ADD COLUMN IF NOT EXISTS company_id TEXT;
ALTER TABLE IF EXISTS public.production_bom_template_components ADD COLUMN IF NOT EXISTS company_id TEXT;

-- Business tables
ALTER TABLE IF EXISTS public.sales ADD COLUMN IF NOT EXISTS company_id TEXT;
ALTER TABLE IF EXISTS public.sale_items ADD COLUMN IF NOT EXISTS company_id TEXT;
ALTER TABLE IF EXISTS public.invoices ADD COLUMN IF NOT EXISTS company_id TEXT;
ALTER TABLE IF EXISTS public.inventory_transactions ADD COLUMN IF NOT EXISTS company_id TEXT;
ALTER TABLE IF EXISTS public.material_batches ADD COLUMN IF NOT EXISTS company_id TEXT;
ALTER TABLE IF EXISTS public.warehouse_inventory ADD COLUMN IF NOT EXISTS company_id TEXT;
ALTER TABLE IF EXISTS public.material_categories ADD COLUMN IF NOT EXISTS company_id TEXT;
ALTER TABLE IF EXISTS public.sales_orders ADD COLUMN IF NOT EXISTS company_id TEXT;
ALTER TABLE IF EXISTS public.sales_exchanges ADD COLUMN IF NOT EXISTS company_id TEXT;
ALTER TABLE IF EXISTS public.sales_exchange_items ADD COLUMN IF NOT EXISTS company_id TEXT;
ALTER TABLE IF EXISTS public.sales_exchange_approvals ADD COLUMN IF NOT EXISTS company_id TEXT;
ALTER TABLE IF EXISTS public.reprint_jobs ADD COLUMN IF NOT EXISTS company_id TEXT;
ALTER TABLE IF EXISTS public.audit_logs ADD COLUMN IF NOT EXISTS company_id TEXT;
ALTER TABLE IF EXISTS public.documents ADD COLUMN IF NOT EXISTS company_id TEXT;
ALTER TABLE IF EXISTS public.tasks ADD COLUMN IF NOT EXISTS company_id TEXT;
ALTER TABLE IF EXISTS public.classes ADD COLUMN IF NOT EXISTS company_id TEXT;
ALTER TABLE IF EXISTS public.subjects ADD COLUMN IF NOT EXISTS company_id TEXT;
ALTER TABLE IF EXISTS public.bom_default_materials ADD COLUMN IF NOT EXISTS company_id TEXT;
ALTER TABLE IF EXISTS public.profit_margin_settings ADD COLUMN IF NOT EXISTS company_id TEXT;
ALTER TABLE IF EXISTS public.profit_margin_audit_logs ADD COLUMN IF NOT EXISTS company_id TEXT;
ALTER TABLE IF EXISTS public.work_centers ADD COLUMN IF NOT EXISTS company_id TEXT;
ALTER TABLE IF EXISTS public.production_resources ADD COLUMN IF NOT EXISTS company_id TEXT;
ALTER TABLE IF EXISTS public.work_orders ADD COLUMN IF NOT EXISTS company_id TEXT;
ALTER TABLE IF EXISTS public.chart_of_accounts ADD COLUMN IF NOT EXISTS company_id TEXT;
ALTER TABLE IF EXISTS public.ledger_entries ADD COLUMN IF NOT EXISTS company_id TEXT;
ALTER TABLE IF EXISTS public.budgets ADD COLUMN IF NOT EXISTS company_id TEXT;
ALTER TABLE IF EXISTS public.transfers ADD COLUMN IF NOT EXISTS company_id TEXT;
ALTER TABLE IF EXISTS public.expenses ADD COLUMN IF NOT EXISTS company_id TEXT;
ALTER TABLE IF EXISTS public.income ADD COLUMN IF NOT EXISTS company_id TEXT;
ALTER TABLE IF EXISTS public.suppliers ADD COLUMN IF NOT EXISTS company_id TEXT;
ALTER TABLE IF EXISTS public.purchase_orders ADD COLUMN IF NOT EXISTS company_id TEXT;
ALTER TABLE IF EXISTS public.goods_receipts ADD COLUMN IF NOT EXISTS company_id TEXT;
ALTER TABLE IF EXISTS public.departments ADD COLUMN IF NOT EXISTS company_id TEXT;
ALTER TABLE IF EXISTS public.employees ADD COLUMN IF NOT EXISTS company_id TEXT;
ALTER TABLE IF EXISTS public.payroll_runs ADD COLUMN IF NOT EXISTS company_id TEXT;
ALTER TABLE IF EXISTS public.payslips ADD COLUMN IF NOT EXISTS company_id TEXT;
ALTER TABLE IF EXISTS public.customer_payments ADD COLUMN IF NOT EXISTS company_id TEXT;
ALTER TABLE IF EXISTS public.assets ADD COLUMN IF NOT EXISTS company_id TEXT;
ALTER TABLE IF EXISTS public.settings ADD COLUMN IF NOT EXISTS company_id TEXT;
ALTER TABLE IF EXISTS public.schools ADD COLUMN IF NOT EXISTS company_id TEXT;
ALTER TABLE IF EXISTS public.examinations ADD COLUMN IF NOT EXISTS company_id TEXT;
ALTER TABLE IF EXISTS public.customers ADD COLUMN IF NOT EXISTS company_id TEXT;
ALTER TABLE IF EXISTS public.inventory ADD COLUMN IF NOT EXISTS company_id TEXT;
ALTER TABLE IF EXISTS public.user_groups ADD COLUMN IF NOT EXISTS company_id TEXT;
ALTER TABLE IF EXISTS public.bank_accounts ADD COLUMN IF NOT EXISTS company_id TEXT;
ALTER TABLE IF EXISTS public.bank_transactions ADD COLUMN IF NOT EXISTS company_id TEXT;
ALTER TABLE IF EXISTS public.bank_statements ADD COLUMN IF NOT EXISTS company_id TEXT;
ALTER TABLE IF EXISTS public.bank_scheduled_payments ADD COLUMN IF NOT EXISTS company_id TEXT;
ALTER TABLE IF EXISTS public.bank_exchange_rates ADD COLUMN IF NOT EXISTS company_id TEXT;
ALTER TABLE IF EXISTS public.bank_fees ADD COLUMN IF NOT EXISTS company_id TEXT;
ALTER TABLE IF EXISTS public.bank_reconciliations ADD COLUMN IF NOT EXISTS company_id TEXT;
ALTER TABLE IF EXISTS public.bank_adjustments ADD COLUMN IF NOT EXISTS company_id TEXT;
ALTER TABLE IF EXISTS public.bank_cash_flow_forecasts ADD COLUMN IF NOT EXISTS company_id TEXT;
ALTER TABLE IF EXISTS public.bank_alerts ADD COLUMN IF NOT EXISTS company_id TEXT;
ALTER TABLE IF EXISTS public.bank_categories ADD COLUMN IF NOT EXISTS company_id TEXT;
ALTER TABLE IF EXISTS public.customer_notification_logs ADD COLUMN IF NOT EXISTS company_id TEXT;
ALTER TABLE IF EXISTS public.whatsapp_chats ADD COLUMN IF NOT EXISTS company_id TEXT;
ALTER TABLE IF EXISTS public.whatsapp_templates ADD COLUMN IF NOT EXISTS company_id TEXT;
ALTER TABLE IF EXISTS public.whatsapp_campaigns ADD COLUMN IF NOT EXISTS company_id TEXT;
ALTER TABLE IF EXISTS public.whatsapp_automations ADD COLUMN IF NOT EXISTS company_id TEXT;
ALTER TABLE IF EXISTS public.vat_transactions ADD COLUMN IF NOT EXISTS company_id TEXT;
ALTER TABLE IF EXISTS public.vat_returns ADD COLUMN IF NOT EXISTS company_id TEXT;
ALTER TABLE IF EXISTS public.examination_jobs ADD COLUMN IF NOT EXISTS company_id TEXT;
ALTER TABLE IF EXISTS public.examination_job_subjects ADD COLUMN IF NOT EXISTS company_id TEXT;
ALTER TABLE IF EXISTS public.examination_invoice_groups ADD COLUMN IF NOT EXISTS company_id TEXT;
ALTER TABLE IF EXISTS public.examination_recurring_profiles ADD COLUMN IF NOT EXISTS company_id TEXT;
ALTER TABLE IF EXISTS public.examination_inventory_deductions ADD COLUMN IF NOT EXISTS company_id TEXT;
ALTER TABLE IF EXISTS public.sms_campaigns ADD COLUMN IF NOT EXISTS company_id TEXT;
ALTER TABLE IF EXISTS public.sms_templates ADD COLUMN IF NOT EXISTS company_id TEXT;
ALTER TABLE IF EXISTS public.subcontract_orders ADD COLUMN IF NOT EXISTS company_id TEXT;
ALTER TABLE IF EXISTS public.maintenance_logs ADD COLUMN IF NOT EXISTS company_id TEXT;
ALTER TABLE IF EXISTS public.job_tickets ADD COLUMN IF NOT EXISTS company_id TEXT;
ALTER TABLE IF EXISTS public.job_ticket_settings ADD COLUMN IF NOT EXISTS company_id TEXT;
ALTER TABLE IF EXISTS public.job_orders ADD COLUMN IF NOT EXISTS company_id TEXT;
ALTER TABLE IF EXISTS public.examination_papers ADD COLUMN IF NOT EXISTS company_id TEXT;
ALTER TABLE IF EXISTS public.examination_printing_batches ADD COLUMN IF NOT EXISTS company_id TEXT;
ALTER TABLE IF EXISTS public.recurring_invoices ADD COLUMN IF NOT EXISTS company_id TEXT;
ALTER TABLE IF EXISTS public.scheduled_payments ADD COLUMN IF NOT EXISTS company_id TEXT;
ALTER TABLE IF EXISTS public.wallet_transactions ADD COLUMN IF NOT EXISTS company_id TEXT;
ALTER TABLE IF EXISTS public.delivery_notes ADD COLUMN IF NOT EXISTS company_id TEXT;

-- ============================================================================
-- 4. Create indexes on company_id for performance
-- ============================================================================
DO $$
DECLARE
  tables TEXT[] := ARRAY[
    'bom_templates', 'inventory_items', 'products', 'product_variants',
    'market_adjustments', 'market_adjustment_transactions',
    'transaction_adjustment_snapshots', 'rounding_logs',
    'examination_batches', 'examination_classes', 'examination_subjects',
    'examination_bom_calculations', 'examination_class_adjustments',
    'examination_pricing_audit', 'examination_batch_notifications',
    'notification_audit_logs',
    'production_batches', 'production_classes', 'production_subjects',
    'production_bom_calculations', 'production_class_adjustments',
    'production_pricing_audit', 'production_batch_notifications',
    'production_notification_audit_logs', 'production_bom_templates',
    'production_bom_template_components',
    'sales', 'sale_items', 'invoices', 'inventory_transactions',
    'material_batches', 'warehouse_inventory', 'material_categories',
    'sales_orders', 'sales_exchanges', 'sales_exchange_items',
    'sales_exchange_approvals', 'reprint_jobs', 'audit_logs', 'documents',
    'tasks', 'classes', 'subjects', 'bom_default_materials',
    'profit_margin_settings', 'profit_margin_audit_logs',
    'work_centers', 'production_resources', 'work_orders',
    'chart_of_accounts', 'ledger_entries', 'budgets', 'transfers',
    'expenses', 'income', 'suppliers', 'purchase_orders', 'goods_receipts',
    'departments', 'employees', 'payroll_runs', 'payslips',
    'customer_payments', 'assets', 'settings', 'schools', 'examinations',
    'customers', 'inventory', 'user_groups',
    'bank_accounts', 'bank_transactions', 'bank_statements',
    'bank_scheduled_payments', 'bank_exchange_rates', 'bank_fees',
    'bank_reconciliations', 'bank_adjustments', 'bank_cash_flow_forecasts',
    'bank_alerts', 'bank_categories', 'customer_notification_logs',
    'whatsapp_chats', 'whatsapp_templates', 'whatsapp_campaigns',
    'whatsapp_automations', 'vat_transactions', 'vat_returns',
    'examination_jobs', 'examination_job_subjects',
    'examination_invoice_groups', 'examination_recurring_profiles',
    'examination_inventory_deductions', 'sms_campaigns', 'sms_templates',
    'subcontract_orders', 'maintenance_logs', 'job_tickets',
    'job_ticket_settings', 'job_orders', 'examination_papers',
    'examination_printing_batches', 'recurring_invoices',
    'scheduled_payments', 'wallet_transactions', 'delivery_notes'
  ];
  t TEXT;
BEGIN
  FOREACH t IN ARRAY tables LOOP
    BEGIN
      EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%I_company_id ON %I(company_id)', t, t);
    EXCEPTION WHEN undefined_table THEN
      RAISE NOTICE 'Table % does not exist, skipping index', t;
    WHEN OTHERS THEN
      RAISE NOTICE 'Could not index %: %', t, SQLERRM;
    END;
  END LOOP;
END $$;

-- ============================================================================
-- 5. Enable RLS on ALL tables
-- ============================================================================

-- Core ERP
ALTER TABLE IF EXISTS public.bom_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.inventory_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.product_variants ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.market_adjustments ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.market_adjustment_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.transaction_adjustment_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.rounding_logs ENABLE ROW LEVEL SECURITY;

-- Examination
ALTER TABLE IF EXISTS public.examination_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.examination_classes ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.examination_subjects ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.examination_bom_calculations ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.examination_class_adjustments ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.examination_pricing_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.examination_batch_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.notification_audit_logs ENABLE ROW LEVEL SECURITY;

-- Production
ALTER TABLE IF EXISTS public.production_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.production_classes ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.production_subjects ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.production_bom_calculations ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.production_class_adjustments ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.production_pricing_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.production_batch_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.production_notification_audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.production_bom_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.production_bom_template_components ENABLE ROW LEVEL SECURITY;

-- Business
ALTER TABLE IF EXISTS public.sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.sale_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.inventory_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.material_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.warehouse_inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.material_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.sales_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.sales_exchanges ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.sales_exchange_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.sales_exchange_approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.reprint_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.classes ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.subjects ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.bom_default_materials ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.profit_margin_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.profit_margin_audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.work_centers ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.production_resources ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.work_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.chart_of_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.ledger_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.budgets ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.transfers ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.income ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.purchase_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.goods_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.payroll_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.payslips ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.customer_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.schools ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.examinations ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.user_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.bank_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.bank_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.bank_statements ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.bank_scheduled_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.bank_exchange_rates ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.bank_fees ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.bank_reconciliations ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.bank_adjustments ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.bank_cash_flow_forecasts ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.bank_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.bank_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.customer_notification_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.whatsapp_chats ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.whatsapp_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.whatsapp_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.whatsapp_automations ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.vat_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.vat_returns ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.examination_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.examination_job_subjects ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.examination_invoice_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.examination_recurring_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.examination_inventory_deductions ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.sms_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.sms_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.subcontract_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.maintenance_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.job_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.job_ticket_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.job_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.examination_papers ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.examination_printing_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.recurring_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.scheduled_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.wallet_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.delivery_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.idempotency_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.tax_rates ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- 6. Policies (DROP IF EXISTS before each CREATE for idempotent re-runs)
-- ============================================================================

-- Companies
DROP POLICY IF EXISTS "Authenticated users can insert companies" ON public.companies;
CREATE POLICY "Authenticated users can insert companies"
  ON public.companies FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated users can view companies" ON public.companies;
CREATE POLICY "Authenticated users can view companies"
  ON public.companies FOR SELECT TO authenticated
  USING (id = public.get_user_company_id());

DROP POLICY IF EXISTS "Authenticated users can update companies" ON public.companies;
CREATE POLICY "Authenticated users can update companies"
  ON public.companies FOR UPDATE TO authenticated
  USING (id = public.get_user_company_id())
  WITH CHECK (id = public.get_user_company_id());

DROP POLICY IF EXISTS "Authenticated users can delete companies" ON public.companies;
CREATE POLICY "Authenticated users can delete companies"
  ON public.companies FOR DELETE TO authenticated
  USING (id = public.get_user_company_id());

-- Profiles
DROP POLICY IF EXISTS "Authenticated users can insert profiles" ON public.profiles;
CREATE POLICY "Authenticated users can insert profiles"
  ON public.profiles FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Users can view profiles" ON public.profiles;
CREATE POLICY "Users can view profiles"
  ON public.profiles FOR SELECT TO authenticated
  USING (user_id = auth.uid()::text OR company_id = public.get_user_company_id());

DROP POLICY IF EXISTS "Users can update profiles" ON public.profiles;
CREATE POLICY "Users can update profiles"
  ON public.profiles FOR UPDATE TO authenticated
  USING (user_id = auth.uid()::text) WITH CHECK (user_id = auth.uid()::text);

DROP POLICY IF EXISTS "Users can delete profiles" ON public.profiles;
CREATE POLICY "Users can delete profiles"
  ON public.profiles FOR DELETE TO authenticated
  USING (user_id = auth.uid()::text);

-- Idempotency keys
DROP POLICY IF EXISTS "Users can manage idempotency keys" ON public.idempotency_keys;
CREATE POLICY "Users can manage idempotency keys"
  ON public.idempotency_keys FOR ALL TO authenticated
  USING (company_id = public.get_user_company_id())
  WITH CHECK (company_id = public.get_user_company_id());

-- Tax rates
DROP POLICY IF EXISTS "Users can view tax rates" ON public.tax_rates;
CREATE POLICY "Users can view tax rates"
  ON public.tax_rates FOR SELECT TO authenticated
  USING (company_id = public.get_user_company_id());

DROP POLICY IF EXISTS "Users can upsert tax rates" ON public.tax_rates;
CREATE POLICY "Users can upsert tax rates"
  ON public.tax_rates FOR INSERT TO authenticated
  WITH CHECK (company_id = public.get_user_company_id());

DROP POLICY IF EXISTS "Users can update tax rates" ON public.tax_rates;
CREATE POLICY "Users can update tax rates"
  ON public.tax_rates FOR UPDATE TO authenticated
  USING (company_id = public.get_user_company_id())
  WITH CHECK (company_id = public.get_user_company_id());

DROP POLICY IF EXISTS "Users can delete tax rates" ON public.tax_rates;
CREATE POLICY "Users can delete tax rates"
  ON public.tax_rates FOR DELETE TO authenticated
  USING (company_id = public.get_user_company_id());

-- ============================================================================
-- 7. RESTRICTIVE tenant isolation policies for ALL business tables
--     Uses dynamic SQL in a DO block so missing tables are skipped gracefully.
-- ============================================================================

DO $$
DECLARE
  tables TEXT[] := ARRAY[
    'bom_templates', 'inventory_items', 'products', 'product_variants',
    'market_adjustments', 'market_adjustment_transactions',
    'transaction_adjustment_snapshots', 'rounding_logs',
    'examination_batches', 'examination_classes', 'examination_subjects',
    'examination_bom_calculations', 'examination_class_adjustments',
    'examination_pricing_audit', 'examination_batch_notifications',
    'notification_audit_logs',
    'production_batches', 'production_classes', 'production_subjects',
    'production_bom_calculations', 'production_class_adjustments',
    'production_pricing_audit', 'production_batch_notifications',
    'production_notification_audit_logs', 'production_bom_templates',
    'production_bom_template_components',
    'sales', 'sale_items', 'invoices', 'inventory_transactions',
    'material_batches', 'warehouse_inventory', 'material_categories',
    'sales_orders', 'sales_exchanges', 'sales_exchange_items',
    'sales_exchange_approvals', 'reprint_jobs', 'audit_logs', 'documents',
    'tasks', 'classes', 'subjects', 'bom_default_materials',
    'profit_margin_settings', 'profit_margin_audit_logs',
    'work_centers', 'production_resources', 'work_orders',
    'chart_of_accounts', 'ledger_entries', 'budgets', 'transfers',
    'expenses', 'income', 'suppliers', 'purchase_orders', 'goods_receipts',
    'departments', 'employees', 'payroll_runs', 'payslips',
    'customer_payments', 'assets', 'settings', 'schools', 'examinations',
    'customers', 'inventory', 'user_groups',
    'bank_accounts', 'bank_transactions', 'bank_statements',
    'bank_scheduled_payments', 'bank_exchange_rates', 'bank_fees',
    'bank_reconciliations', 'bank_adjustments', 'bank_cash_flow_forecasts',
    'bank_alerts', 'bank_categories', 'customer_notification_logs',
    'whatsapp_chats', 'whatsapp_templates', 'whatsapp_campaigns',
    'whatsapp_automations', 'vat_transactions', 'vat_returns',
    'examination_jobs', 'examination_job_subjects',
    'examination_invoice_groups', 'examination_recurring_profiles',
    'examination_inventory_deductions', 'sms_campaigns', 'sms_templates',
    'subcontract_orders', 'maintenance_logs', 'job_tickets',
    'job_ticket_settings', 'job_orders', 'examination_papers',
    'examination_printing_batches', 'recurring_invoices',
    'scheduled_payments', 'wallet_transactions', 'delivery_notes'
  ];
  t TEXT;
BEGIN
  FOREACH t IN ARRAY tables LOOP
    BEGIN
      EXECUTE format('DROP POLICY IF EXISTS tenant_isolation_policy ON %I', t);
      EXECUTE format(
        'CREATE POLICY tenant_isolation_policy ON %I AS RESTRICTIVE FOR ALL '
        'USING (company_id = public.get_user_company_id()) '
        'WITH CHECK (company_id = public.get_user_company_id())',
        t
      );
    EXCEPTION WHEN undefined_table THEN
      RAISE NOTICE 'Table % does not exist, skipping tenant_isolation_policy', t;
    END;
  END LOOP;
END $$;

-- ============================================================================
-- 8. Users table (legacy — skip silently if it doesn't exist)
-- ============================================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'users') THEN
    ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS tenant_isolation_policy ON public.users;
    EXECUTE format(
      'CREATE POLICY tenant_isolation_policy ON public.users AS RESTRICTIVE FOR ALL '
      'USING (company_id = public.get_user_company_id()) WITH CHECK (company_id = public.get_user_company_id())'
    );
  END IF;
END $$;

-- ============================================================================
-- 9. Trigger: auto-set company_id on profile INSERT or UPDATE when omitted
-- ============================================================================
CREATE OR REPLACE FUNCTION public.handle_profile_company_id()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.company_id IS NULL OR NEW.company_id = '' THEN
    NEW.company_id := COALESCE(
      (SELECT raw_user_meta_data ->> 'company_id' FROM auth.users WHERE id = NEW.user_id::uuid),
      NEW.data ->> 'company_id',
      NEW.data ->> 'companyId',
      (SELECT id FROM public.companies ORDER BY created_at ASC LIMIT 1)
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_profile_company_id ON public.profiles;
CREATE TRIGGER trg_profile_company_id
  BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_profile_company_id();

-- ============================================================================
-- End of migration
-- ============================================================================
