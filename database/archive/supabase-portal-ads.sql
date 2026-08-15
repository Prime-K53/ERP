-- ============================================================================
-- portal_ads — customer portal banner ads
--
-- Managed from Smart Operations Hub → Ads (frontend/views/tools/AdsManager.tsx)
-- and served to the customer portal banner via GET /portal/ads.
--
-- The cloud sync gateway writes every row as { id, data, version, updated_at },
-- matching the pattern used by every other business table (see
-- supabase-add-version-columns.sql). `data` holds the full PortalAd payload.
-- ============================================================================

-- Company-scoping helper used by the RLS policies below. Defined here so this
-- migration is self-contained and can run before (or without) the engagement
-- tables / RLS-hardening migrations. Written in PL/pgSQL with a runtime
-- existence guard so it never depends on functions that may not exist yet;
-- CREATE OR REPLACE keeps it safe to re-run alongside the identical helper in
-- supabase-engagement-tables-run.sql. Prefers the session-scoped app.company_id
-- (set by the backend), falling back to get_user_company_id() only when the
-- baseline RLS hardening migration has created it.
CREATE OR REPLACE FUNCTION public.get_current_company_id()
RETURNS TEXT
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company TEXT;
BEGIN
  v_company := NULLIF(current_setting('app.company_id', TRUE), '')::TEXT;
  IF v_company IS NOT NULL THEN
    RETURN v_company;
  END IF;
  -- Fallback only exists on databases that ran the baseline RLS hardening
  -- migration (supabase-rls-hardening-migration.sql).
  IF to_regprocedure('public.get_user_company_id()') IS NOT NULL THEN
    RETURN public.get_user_company_id();
  END IF;
  RETURN NULL;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_current_company_id() TO authenticated, anon, service_role;

CREATE TABLE IF NOT EXISTS public.portal_ads (
    id TEXT PRIMARY KEY,
    data JSONB NOT NULL DEFAULT '{}'::jsonb,
    version INTEGER NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    company_id TEXT
);

CREATE INDEX IF NOT EXISTS idx_portal_ads_company ON public.portal_ads (company_id);
CREATE INDEX IF NOT EXISTS idx_portal_ads_updated ON public.portal_ads (updated_at DESC);

-- Realtime publication for live banner updates (staff edits → portal refresh).
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
        IF NOT EXISTS (
            SELECT 1 FROM pg_publication_tables
            WHERE pubname = 'supabase_realtime' AND tablename = 'portal_ads'
        ) THEN
            ALTER PUBLICATION supabase_realtime ADD TABLE public.portal_ads;
        END IF;
    END IF;
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Could not add portal_ads to realtime publication: %', SQLERRM;
END $$;

ALTER TABLE public.portal_ads ENABLE ROW LEVEL SECURITY;

-- Staff (authenticated ERP users) manage their own company's ads — mirrors the
-- company-scoped engagement-table pattern (supabase-engagement-tables-run.sql).
DROP POLICY IF EXISTS "Portal ads company select" ON public.portal_ads;
CREATE POLICY "Portal ads company select"
  ON public.portal_ads FOR SELECT TO authenticated
  USING (company_id = public.get_current_company_id());

DROP POLICY IF EXISTS "Portal ads company insert" ON public.portal_ads;
CREATE POLICY "Portal ads company insert"
  ON public.portal_ads FOR INSERT TO authenticated
  WITH CHECK (company_id = public.get_current_company_id());

DROP POLICY IF EXISTS "Portal ads company update" ON public.portal_ads;
CREATE POLICY "Portal ads company update"
  ON public.portal_ads FOR UPDATE TO authenticated
  USING (company_id = public.get_current_company_id())
  WITH CHECK (company_id = public.get_current_company_id());

DROP POLICY IF EXISTS "Portal ads company delete" ON public.portal_ads;
CREATE POLICY "Portal ads company delete"
  ON public.portal_ads FOR DELETE TO authenticated
  USING (company_id = public.get_current_company_id());

-- Portal reads and sync writes go through the backend (service key, bypasses
-- RLS); the policies above scope direct client writes to the staff's company.
