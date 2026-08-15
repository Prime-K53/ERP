-- ============================================================================
-- Complete Realtime Publication: Prime ERP
-- Run this AFTER supabase-create-all-tables.sql and supabase-migrate-to-single-company.sql
-- Ensures all business tables are in the supabase_realtime publication for
-- cross-device realtime change propagation via subscribeToRemoteChanges().
--
-- The original array in supabase-migration-cloud-first.sql was incomplete and
-- contained invalid entries ('inventory' instead of 'products', duplicates).
-- This migration uses a dynamic approach to add ALL tables with updated_at.
-- ============================================================================

DO $$
DECLARE
    t TEXT;
BEGIN
    FOR t IN
        SELECT c.relname AS table_name
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public'
          AND c.relkind = 'r'
          AND c.relname IN (
            -- Core
            'products', 'customers', 'suppliers', 'invoices', 'sales_orders', 'sale_items',
            'sales_exchanges', 'sales_exchange_items', 'sales_exchange_approvals',
            'boms', 'bom_templates', 'quotations', 'orders', 'job_orders',
            'work_orders', 'work_centers', 'production_resources', 'production_batches',
            'production_bom_calculations', 'production_bom_templates',
            'ledger_entries', 'accounts', 'reminders', 'settings', 'warehouses',
            'purchase_orders', 'goods_receipts', 'sales', 'purchases',
            'expenses', 'income', 'budgets', 'transfers', 'cheques',
            'employees', 'payslips', 'payroll_runs', 'subscribers',
            'shipments', 'schools', 'classes', 'subjects', 'tasks',
            'financial_years', 'user_preferences', 'user_groups',
            -- Banking
            'bank_accounts', 'bank_transactions', 'bank_statements',
            'bank_scheduled_payments', 'bank_exchange_rates', 'bank_fees',
            'bank_reconciliations', 'bank_adjustments',
            'bank_cash_flow_forecasts', 'bank_alerts', 'bank_categories',
            -- Payments / Wallet
            'customer_payments', 'supplier_payments',
            'wallet_transactions', 'recurring_invoices', 'scheduled_payments',
            'delivery_notes', 'subcontract_orders', 'maintenance_logs', 'reprint_jobs',
            'resource_allocations', 'job_tickets', 'job_ticket_settings',
            'batches', 'material_reservations', 'material_categories',
            'warehouse_inventory', 'material_batches', 'inventory_transactions',
            -- Examination
            'examination_batches', 'examination_jobs', 'examination_job_subjects',
            'examination_invoice_groups', 'examination_recurring_profiles',
            'examination_inventory_deductions', 'examination_batch_notifications',
            'examination_papers', 'examination_printing_batches',
            -- Production
            'production_batch_notifications', 'production_notification_audit_logs',
            'production_classes', 'production_subjects',
            -- Other
            'vat_transactions', 'vat_returns', 'rounding_logs',
            'market_adjustments', 'market_adjustment_transactions', 'profit_margin_settings',
            'whatsapp_chats', 'whatsapp_templates', 'whatsapp_campaigns', 'whatsapp_automations',
            'sms_campaigns', 'sms_templates',
            'tax_rates', 'profiles', 'users', 'companies', 'idempotency_keys',
            'customer_notification_logs', 'customer_referrals',
            'referral_rewards', 'referral_campaigns', 'referral_analytics',
            'notification_audit_logs'
          )
        AND EXISTS (SELECT 1 FROM pg_attribute
                    WHERE attrelid = c.oid AND attname = 'updated_at')
          AND c.relname NOT IN (
            'profiles', 'users'
          )
    LOOP
        BEGIN
            EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE %I', t);
            RAISE NOTICE 'Added % to supabase_realtime publication', t;
        EXCEPTION
            WHEN duplicate_object THEN
                RAISE NOTICE '% already in supabase_realtime publication', t;
            WHEN OTHERS THEN
                RAISE NOTICE 'Could not add % to publication: %', t, SQLERRM;
        END;
    END LOOP;
END $$;
