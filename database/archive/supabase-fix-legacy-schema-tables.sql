-- ============================================================================
-- Fix all legacy-schema tables to match cloud sync pattern
-- Converts: id SERIAL → TEXT, adds company_id/data/updated_at JSONB columns
-- Run this in Supabase SQL Editor.
-- ============================================================================

-- Step 1: Drop all FK constraints referencing any of the legacy tables
-- (needed so we can change id types from SERIAL to TEXT)
DO $$
DECLARE
  fk RECORD;
BEGIN
  FOR fk IN
    SELECT con.conname AS constraint_name, rel.relname AS table_name
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    WHERE con.contype = 'f'
      AND con.confrelid IN (
        SELECT oid FROM pg_class WHERE relname IN (
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
          'production_bom_template_components'
        ) AND relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
      )
  LOOP
    EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT %I CASCADE', fk.table_name, fk.constraint_name);
    RAISE NOTICE 'Dropped FK %.%', fk.table_name, fk.constraint_name;
  END LOOP;
END $$;

-- Step 2: Convert each legacy table to cloud sync format
DO $$
DECLARE
  t TEXT;
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
    'production_bom_template_components'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    BEGIN
      -- Change id from SERIAL to TEXT
      EXECUTE format('ALTER TABLE public.%I ALTER COLUMN id DROP DEFAULT', t);
      EXECUTE format('ALTER TABLE public.%I ALTER COLUMN id TYPE TEXT USING id::TEXT', t);
      EXECUTE format('DROP SEQUENCE IF EXISTS public.%I_id_seq', t);

      -- Add cloud sync columns (IF NOT EXISTS for idempotency)
      EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS company_id TEXT', t);
      EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS data JSONB DEFAULT ''{}''::jsonb', t);
      EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW()', t);
      EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW()', t);

      -- Drop legacy NOT NULL constraints that conflict with cloud sync
      BEGIN
        EXECUTE format('ALTER TABLE public.%I ALTER COLUMN name DROP NOT NULL', t);
      EXCEPTION WHEN undefined_column THEN END;

      -- Add company_id index
      EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%I_company_id ON public.%I(company_id)', t, t);

      RAISE NOTICE 'Fixed table: %', t;
    EXCEPTION WHEN undefined_table THEN
      RAISE NOTICE 'Table % does not exist, skipping', t;
    WHEN OTHERS THEN
      RAISE NOTICE 'Error fixing %: %', t, SQLERRM;
    END;
  END LOOP;
END $$;
