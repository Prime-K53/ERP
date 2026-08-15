-- ============================================================================
-- Add Updated_At Triggers: Prime ERP
-- Run this AFTER supabase-create-all-tables.sql and supabase-migrate-to-single-company.sql
-- Adds a BEFORE UPDATE trigger on all business tables that have an updated_at column,
-- ensuring updated_at is automatically set to NOW() on every row update.
--
-- Without this trigger, syncService.pullRemoteChanges() incremental sync
-- (which filters on updated_at >= lastSyncAt) will miss cross-client updates.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Attach the trigger to every table in the public schema that has an updated_at column
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN
        SELECT c.relname AS table_name
        FROM pg_attribute a
        JOIN pg_class c ON c.oid = a.attrelid
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public'
          AND c.relkind = 'r'
          AND a.attname = 'updated_at'
    LOOP
        -- Remove existing trigger if it exists (idempotent re-run)
        EXECUTE format('DROP TRIGGER IF EXISTS trg_update_updated_at ON %I', r.table_name);
        -- Create the trigger
        EXECUTE format(
            'CREATE TRIGGER trg_update_updated_at BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column()',
            r.table_name
        );
        RAISE NOTICE 'Added trg_update_updated_at trigger to %.%', 'public', r.table_name;
    END LOOP;
END $$;
