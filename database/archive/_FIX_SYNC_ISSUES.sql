-- ============================================================
-- FIX: Remove multi-tenant company_id + add missing sync columns
-- ============================================================

-- STEP 1: Drop all triggers on tables with company_id
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT c.relname AS tablename, t.tgname AS triggername
    FROM pg_trigger t
    JOIN pg_class c ON t.tgrelid = c.oid
    JOIN pg_namespace n ON c.relnamespace = n.oid
    WHERE n.nspname = 'public'
      AND NOT t.tgisinternal
      AND c.relname IN ('accounts','assets','audit_logs','bank_accounts','bank_adjustments','bank_alerts','bank_cash_flow_forecasts','bank_categories','bank_exchange_rates','bank_fees','bank_reconciliations','bank_scheduled_payments','bank_statements','bank_transactions','bom_default_materials','bom_templates','boms','budgets','chart_of_accounts','cheques','classes','customer_notification_logs','customer_payments','customerpricingtiers','customers','delivery_notes','departments','discountrules','documents','employees','engagement_affiliate_commissions','engagement_affiliates','engagement_analytics','engagement_audit','engagement_cashback','engagement_customer_rewards','engagement_customer_tiers','engagement_gift_card_transactions','engagement_gift_cards','engagement_membership_tiers','engagement_point_balances','engagement_points','engagement_promotions','engagement_timeline','examination_batch_notifications','examination_batches','examination_bom_calculations','examination_class_adjustments','examination_classes','examination_inventory_deductions','examination_invoice_groups','examination_job_subjects','examination_jobs','examination_papers','examination_pricing_audit','examination_printing_batches','examination_recurring_profiles','examination_subjects','examinations','expenses','financial_years','goods_receipts','idempotency_keys','income','inventory','inventory_items','inventory_movements','inventory_transactions','invoices','job_orders','job_ticket_settings','job_tickets','ledger_entries','maintenance_logs','market_adjustment_transactions','market_adjustments','material_batches','material_categories','material_reservations','notification_audit_logs','orders','payroll_runs','payslips','product_variants','production_batch_notifications','production_batches','production_bom_calculations','production_bom_template_components','production_bom_templates','production_class_adjustments','production_classes','production_notification_audit_logs','production_pricing_audit','production_resources','production_subjects','products','profiles','profit_margin_audit_logs','profit_margin_settings','purchase_orders','purchases','quotations','recurring_invoices','reminders','reprint_jobs','resource_allocations','rounding_logs','sale_items','sales','sales_exchange_approvals','sales_exchange_items','sales_exchanges','sales_orders','scheduled_payments','schools','settings','shipments','sms_campaigns','sms_templates','subcontract_orders','subjects','subscribers','supplier_payments','suppliers','tasks','tax_rates','transaction_adjustment_snapshots','transfers','user_groups','user_preferences','vat_returns','vat_transactions','wallet_transactions','warehouse_inventory','warehouses','whatsapp_accounts','whatsapp_automations','whatsapp_campaigns','whatsapp_chats','whatsapp_message_queue','whatsapp_messages','whatsapp_templates','work_centers','work_orders')
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON %I', r.triggername, r.tablename);
    RAISE NOTICE 'Dropped trigger % on %', r.triggername, r.tablename;
  END LOOP;
END;
$$;

-- STEP 2: Drop functions that reference company_id
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public'
      AND p.prokind IN ('f', 'p')
      AND pg_get_functiondef(p.oid) LIKE '%company_id%'
  LOOP
    EXECUTE format('DROP FUNCTION IF EXISTS %I(%s) CASCADE', r.proname, r.args);
    RAISE NOTICE 'Dropped function %(%)', r.proname, r.args;
  END LOOP;
END;
$$;

-- STEP 3: Drop all RLS policies referencing company_id
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT schemaname, tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND (qual::text LIKE '%company_id%'
           OR with_check::text LIKE '%company_id%')
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I', r.policyname, r.schemaname, r.tablename);
    RAISE NOTICE 'Dropped policy % on %', r.policyname, r.tablename;
  END LOOP;
END;
$$;

-- STEP 4: Drop company_id from all tables (144)
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN SELECT unnest(ARRAY['accounts','assets','audit_logs','bank_accounts','bank_adjustments','bank_alerts','bank_cash_flow_forecasts','bank_categories','bank_exchange_rates','bank_fees','bank_reconciliations','bank_scheduled_payments','bank_statements','bank_transactions','bom_default_materials','bom_templates','boms','budgets','chart_of_accounts','cheques','classes','customer_notification_logs','customer_payments','customerpricingtiers','customers','delivery_notes','departments','discountrules','documents','employees','engagement_affiliate_commissions','engagement_affiliates','engagement_analytics','engagement_audit','engagement_cashback','engagement_customer_rewards','engagement_customer_tiers','engagement_gift_card_transactions','engagement_gift_cards','engagement_membership_tiers','engagement_point_balances','engagement_points','engagement_promotions','engagement_timeline','examination_batch_notifications','examination_batches','examination_bom_calculations','examination_class_adjustments','examination_classes','examination_inventory_deductions','examination_invoice_groups','examination_job_subjects','examination_jobs','examination_papers','examination_pricing_audit','examination_printing_batches','examination_recurring_profiles','examination_subjects','examinations','expenses','financial_years','goods_receipts','idempotency_keys','income','inventory','inventory_items','inventory_movements','inventory_transactions','invoices','job_orders','job_ticket_settings','job_tickets','ledger_entries','maintenance_logs','market_adjustment_transactions','market_adjustments','material_batches','material_categories','material_reservations','notification_audit_logs','orders','payroll_runs','payslips','product_variants','production_batch_notifications','production_batches','production_bom_calculations','production_bom_template_components','production_bom_templates','production_class_adjustments','production_classes','production_notification_audit_logs','production_pricing_audit','production_resources','production_subjects','products','profiles','profit_margin_audit_logs','profit_margin_settings','purchase_orders','purchases','quotations','recurring_invoices','reminders','reprint_jobs','resource_allocations','rounding_logs','sale_items','sales','sales_exchange_approvals','sales_exchange_items','sales_exchanges','sales_orders','scheduled_payments','schools','settings','shipments','sms_campaigns','sms_templates','subcontract_orders','subjects','subscribers','supplier_payments','suppliers','tasks','tax_rates','transaction_adjustment_snapshots','transfers','user_groups','user_preferences','vat_returns','vat_transactions','wallet_transactions','warehouse_inventory','warehouses','whatsapp_accounts','whatsapp_automations','whatsapp_campaigns','whatsapp_chats','whatsapp_message_queue','whatsapp_messages','whatsapp_templates','work_centers','work_orders']) AS tbl LOOP
    EXECUTE format('ALTER TABLE IF EXISTS %I DROP COLUMN IF EXISTS company_id', r.tbl);
  END LOOP;
END;
$$;

-- STEP 5: Drop company_id indexes
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN SELECT indexname FROM pg_indexes WHERE indexname LIKE '%company_id%' AND schemaname = 'public' LOOP
    EXECUTE format('DROP INDEX IF EXISTS %I', r.indexname);
  END LOOP;
END;
$$;

-- STEP 6: Add data JSONB column (18 tables)
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN SELECT unnest(ARRAY['engagement_affiliate_commissions','engagement_affiliates','engagement_analytics','engagement_audit','engagement_cashback','engagement_customer_rewards','engagement_customer_tiers','engagement_gift_card_transactions','engagement_gift_cards','engagement_membership_tiers','engagement_point_balances','engagement_points','engagement_promotions','engagement_timeline','portal_login_history','portal_password_resets','portal_sessions','portal_users']) AS tbl LOOP
    EXECUTE format('ALTER TABLE IF EXISTS %I ADD COLUMN IF NOT EXISTS data JSONB DEFAULT ''{}''::jsonb', r.tbl);
  END LOOP;
END;
$$;

-- STEP 7: Add version INTEGER column (18 tables)
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN SELECT unnest(ARRAY['engagement_affiliate_commissions','engagement_affiliates','engagement_analytics','engagement_audit','engagement_cashback','engagement_customer_rewards','engagement_customer_tiers','engagement_gift_card_transactions','engagement_gift_cards','engagement_membership_tiers','engagement_point_balances','engagement_points','engagement_promotions','engagement_timeline','portal_login_history','portal_password_resets','portal_sessions','portal_users']) AS tbl LOOP
    EXECUTE format('ALTER TABLE IF EXISTS %I ADD COLUMN IF NOT EXISTS version INTEGER DEFAULT 1', r.tbl);
  END LOOP;
END;
$$;

-- STEP 8: Add updated_at TIMESTAMPTZ column (9 tables)
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN SELECT unnest(ARRAY['engagement_affiliate_commissions','engagement_audit','engagement_cashback','engagement_customer_rewards','engagement_customer_tiers','engagement_gift_card_transactions','engagement_point_balances','engagement_points','engagement_timeline']) AS tbl LOOP
    EXECUTE format('ALTER TABLE IF EXISTS %I ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW()', r.tbl);
  END LOOP;
END;
$$;

-- STEP 9: Create permissive policies for all tables (single-company)
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public'
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = r.tablename
    ) THEN
      EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', r.tablename);
      EXECUTE format('CREATE POLICY %I ON %I FOR ALL TO authenticated USING (true) WITH CHECK (true)', 'allow_all_' || r.tablename, r.tablename);
    END IF;
  END LOOP;
END;
$$;
