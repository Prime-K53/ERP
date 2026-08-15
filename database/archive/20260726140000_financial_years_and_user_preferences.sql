-- ═══════════════════════════════════════════════════════════════════════
-- Migration: financial_years + user_preferences tables
-- Date: 2026-07-26
-- Purpose: Enable cross-device sync of financial year data and user
--          preferences (like selected FY) across multiple devices
-- ═══════════════════════════════════════════════════════════════════════

-- 1. Financial Years table (mirrors SQLite schema for cloud-first)
CREATE TABLE IF NOT EXISTS financial_years (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    code        TEXT DEFAULT '',
    start_date  TEXT NOT NULL,
    end_date    TEXT NOT NULL,
    is_default  INTEGER DEFAULT 0,
    is_closed   INTEGER DEFAULT 0,
    status      TEXT DEFAULT 'Active' CHECK (status IN ('Active', 'Closed', 'Draft')),
    company_id  TEXT NOT NULL,
    created_by  TEXT DEFAULT '',
    created_at  TEXT DEFAULT (CURRENT_TIMESTAMP::TEXT),
    updated_at  TEXT DEFAULT (CURRENT_TIMESTAMP::TEXT)
);

-- Index for company-scoped lookups (only when the company_id column exists;
-- the single-company migration drops that column, breaking replay).
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

-- 2. User Preferences table — key-value store per user + company
-- Used for storing things like "selected financial year id" that
-- need to sync across devices.
CREATE TABLE IF NOT EXISTS user_preferences (
    id          TEXT PRIMARY KEY,  -- composite key like "user_id:company_id:pref_key"
    user_id     TEXT NOT NULL,
    company_id  TEXT NOT NULL,
    pref_key    TEXT NOT NULL,
    pref_value  TEXT,
    created_at  TEXT DEFAULT (CURRENT_TIMESTAMP::TEXT),
    updated_at  TEXT DEFAULT (CURRENT_TIMESTAMP::TEXT)
);

-- Unique constraint: one value per (user, company, key); only when the
-- company_id column still exists (single-company migration drops it).
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'user_preferences' AND column_name = 'company_id'
    ) THEN
        EXECUTE 'CREATE UNIQUE INDEX IF NOT EXISTS idx_user_preferences_unique
            ON user_preferences(user_id, company_id, pref_key)';
        EXECUTE 'CREATE INDEX IF NOT EXISTS idx_user_preferences_lookup
            ON user_preferences(user_id, company_id)';
    END IF;
END $$;

-- ═══════════════════════════════════════════════════════════════════════
-- RLS Policies
-- ═══════════════════════════════════════════════════════════════════════

-- Enable RLS on both tables
ALTER TABLE financial_years ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_preferences ENABLE ROW LEVEL SECURITY;

-- ── financial_years RLS ──
-- These company-scoped policies only apply when the company_id column still
-- exists on the table (single-company migration drops it, so re-running this
-- migration on such a schema must skip company-scoped policies entirely).
DO $$
DECLARE
    has_company_col BOOLEAN;
BEGIN
    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'financial_years' AND column_name = 'company_id'
    ) INTO has_company_col;

    IF has_company_col THEN
        DROP POLICY IF EXISTS financial_years_select ON financial_years;
        CREATE POLICY financial_years_select ON financial_years
            FOR SELECT
            USING (
                company_id IN (
                    SELECT company_id FROM profiles WHERE user_id = auth.uid()::TEXT
                )
            );

        DROP POLICY IF EXISTS financial_years_insert ON financial_years;
        CREATE POLICY financial_years_insert ON financial_years
            FOR INSERT
            WITH CHECK (
                company_id IN (
                    SELECT company_id FROM profiles
                    WHERE user_id = auth.uid()::TEXT AND role IN ('Admin', 'Company Admin', 'Super Admin')
                )
            );

        DROP POLICY IF EXISTS financial_years_update ON financial_years;
        CREATE POLICY financial_years_update ON financial_years
            FOR UPDATE
            USING (
                company_id IN (
                    SELECT company_id FROM profiles
                    WHERE user_id = auth.uid()::TEXT AND role IN ('Admin', 'Company Admin', 'Super Admin')
                )
            );

        DROP POLICY IF EXISTS financial_years_delete ON financial_years;
        CREATE POLICY financial_years_delete ON financial_years
            FOR DELETE
            USING (
                company_id IN (
                    SELECT company_id FROM profiles
                    WHERE user_id = auth.uid()::TEXT AND role IN ('Admin', 'Company Admin', 'Super Admin')
                )
            );
    END IF;
END $$;

-- ── user_preferences RLS ──
-- Users can only read/write their own preferences
-- Cast auth.uid() (uuid) to TEXT because user_id is stored as TEXT
DROP POLICY IF EXISTS user_preferences_select ON user_preferences;
CREATE POLICY user_preferences_select ON user_preferences
    FOR SELECT
    USING (user_id = auth.uid()::TEXT);

DROP POLICY IF EXISTS user_preferences_insert ON user_preferences;
CREATE POLICY user_preferences_insert ON user_preferences
    FOR INSERT
    WITH CHECK (user_id = auth.uid()::TEXT);

DROP POLICY IF EXISTS user_preferences_update ON user_preferences;
CREATE POLICY user_preferences_update ON user_preferences
    FOR UPDATE
    USING (user_id = auth.uid()::TEXT);

DROP POLICY IF EXISTS user_preferences_delete ON user_preferences;
CREATE POLICY user_preferences_delete ON user_preferences
    FOR DELETE
    USING (user_id = auth.uid()::TEXT);
