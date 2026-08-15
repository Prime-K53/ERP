-- ═══════════════════════════════════════════════════════════════════════
-- Migration: Fix financial_years cross-device synchronization
-- Date: 2026-07-31
-- Purpose: Make financial_years behave exactly like customers/products
--          in the universal sync pipeline.
--
-- Root cause: the local-first sync pipeline (cloudDb.put / pullRemoteChanges)
-- writes every entity as { id, data JSONB, company_id, updated_at }.
-- The original financial_years table was columnar with NO `data` column and
-- NOT NULL name/start_date/end_date, so every upsert failed with
-- "column \"data\" does not exist" → permanent error → dead letter.
-- Financial Years therefore never left the creating device.
-- ═══════════════════════════════════════════════════════════════════════

-- 1. Add the universal `data` JSONB column used by the sync pipeline
ALTER TABLE financial_years
    ADD COLUMN IF NOT EXISTS data JSONB DEFAULT '{}'::jsonb;

-- 2. Relax NOT NULL constraints so the universal writer (id + data +
--    company_id + updated_at only) can insert rows. The canonical fields
--    live inside the `data` JSONB object; the legacy columns are kept for
--    backward compatibility with anything reading them directly.
ALTER TABLE financial_years
    ALTER COLUMN name DROP NOT NULL,
    ALTER COLUMN code DROP NOT NULL,
    ALTER COLUMN start_date DROP NOT NULL,
    ALTER COLUMN end_date DROP NOT NULL;

ALTER TABLE financial_years
    ALTER COLUMN name SET DEFAULT '',
    ALTER COLUMN code SET DEFAULT '',
    ALTER COLUMN start_date SET DEFAULT '',
    ALTER COLUMN end_date SET DEFAULT '';

-- 3. Backfill `data` from the legacy columns for pre-existing columnar rows
--    so downloads return the full record shape. (Skip when company_id has
--    been dropped by the single-company migration.)
DO $$
DECLARE
    has_company_col BOOLEAN;
BEGIN
    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'financial_years' AND column_name = 'company_id'
    ) INTO has_company_col;

    IF has_company_col THEN
        UPDATE financial_years
        SET data = jsonb_build_object(
                'id',           id,
                'name',         name,
                'code',         code,
                'start_date',   start_date,
                'end_date',     end_date,
                'is_default',   is_default = 1,
                'is_closed',    is_closed = 1,
                'status',       status,
                'company_id',   company_id,
                'created_by',   created_by,
                'created_at',   created_at,
                'updated_at',   updated_at
            )
        WHERE data IS NULL OR data = '{}'::jsonb;
    END IF;
END $$;

-- 4. Index for company-scoped sync queries (only when the column exists).
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'financial_years' AND column_name = 'company_id'
    ) THEN
        EXECUTE 'CREATE INDEX IF NOT EXISTS idx_financial_years_company
            ON financial_years(company_id, status, start_date)';
    END IF;
END $$;

-- 5. Verify RLS policies exist (created by the original migration). On fresh
--    databases where this file is applied standalone, recreate them. Company-
--    scoped policies are skipped when the company_id column has been dropped.
DO $$
DECLARE
    has_company_col BOOLEAN;
BEGIN
    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'financial_years' AND column_name = 'company_id'
    ) INTO has_company_col;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public' AND tablename = 'financial_years'
    ) THEN
        ALTER TABLE financial_years ENABLE ROW LEVEL SECURITY;

        IF has_company_col THEN
            CREATE POLICY financial_years_select ON financial_years
                FOR SELECT
                USING (
                    company_id IN (
                        SELECT company_id FROM profiles WHERE user_id = auth.uid()::TEXT
                    )
                );

            CREATE POLICY financial_years_insert ON financial_years
                FOR INSERT
                WITH CHECK (
                    company_id IN (
                        SELECT company_id FROM profiles
                        WHERE user_id = auth.uid()::TEXT AND role IN ('Admin', 'Company Admin', 'Super Admin')
                    )
                );

            CREATE POLICY financial_years_update ON financial_years
                FOR UPDATE
                USING (
                    company_id IN (
                        SELECT company_id FROM profiles
                        WHERE user_id = auth.uid()::TEXT AND role IN ('Admin', 'Company Admin', 'Super Admin')
                    )
                );

            CREATE POLICY financial_years_delete ON financial_years
                FOR DELETE
                USING (
                    company_id IN (
                        SELECT company_id FROM profiles
                        WHERE user_id = auth.uid()::TEXT AND role IN ('Admin', 'Company Admin', 'Super Admin')
                    )
                );
        ELSE
            CREATE POLICY financial_years_all ON financial_years
                FOR ALL
                USING (true)
                WITH CHECK (true);
        END IF;
    END IF;
END
$$;
