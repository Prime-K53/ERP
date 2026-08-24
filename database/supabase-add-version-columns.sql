-- ============================================================================
-- Add Version Columns for Cloud Sync Optimistic Locking: Prime ERP
-- Run this AFTER supabase-create-all-tables.sql and supabase-migrate-to-single-company.sql.
--
-- The cloud sync gateway (backend/services/cloudSyncStore.cjs + supabaseRepository.cjs)
-- writes every row as `{ id, data, version, updated_at }` and treats the top-level
-- `version` column as the optimistic-lock precondition. Without the column, every
-- upsert/delete through POST /api/sync/ops fails with PGRST204:
--   "Could not find the 'version' column of '<table>' in the schema cache."
--
-- prior to this migration only `rounding_logs` had a `version` column (from the
-- legacy erp_schema_postgresql.sql), so business-table sync was silently broken.
--
-- This uses the same dynamic pattern as supabase-add-updated-at-triggers.sql and
-- is idempotent (ADD COLUMN IF NOT EXISTS). Re-runnable.
-- ============================================================================

DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN
        SELECT c.relname AS table_name
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public'
          AND c.relkind = 'r'
          AND EXISTS (
              SELECT 1 FROM pg_attribute a
              WHERE a.attrelid = c.oid
                AND a.attname = 'data'            -- domain envelope lives in JSONB `data`
          )
    LOOP
        BEGIN
            EXECUTE format(
                'ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 0',
                r.table_name
            );
            RAISE NOTICE 'Added version column to %.%', 'public', r.table_name;
        EXCEPTION WHEN OTHERS THEN
            RAISE NOTICE 'Could not add version column to %.%: %', 'public', r.table_name, SQLERRM;
        END;
    END LOOP;
END $$;