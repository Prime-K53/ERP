-- ============================================================================
-- Fix: Create the missing public.quotation_requests table in Supabase.
--
-- The customer portal treats quotation_requests as a backend-authoritative
-- document table: portalLifecycleService.runQuery() routes every INSERT/
-- UPDATE/DELETE through repo.upsert/softDelete → cloudSyncStore → Supabase,
-- while portalService strictly reads it with a customer_id scope. The table
-- exists only in the backend SQLite schema (backend/db.cjs) and was dropped
-- from the 0001 baseline capture, so live portal reads of /dashboard,
-- /requests, /documents and recent-activity all 500
-- ("Failed to load dashboard").
--
-- This migration recreates it with the standard { id, data JSONB,
-- created_at, updated_at, version } row contract, indexes, RLS policy,
-- updated_at trigger and realtime publication membership.
-- ============================================================================

-- Step 1: Create the table (idempotent)
CREATE TABLE IF NOT EXISTS public.quotation_requests (
  id TEXT PRIMARY KEY,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  version INTEGER NOT NULL DEFAULT 0
);

-- Step 2: Indexes used by the portal reads (customer scope + status filter)
CREATE INDEX IF NOT EXISTS idx_quotation_requests_customer
  ON public.quotation_requests ((data->>'customer_id'));

CREATE INDEX IF NOT EXISTS idx_quotation_requests_status
  ON public.quotation_requests ((data->>'status'));

CREATE INDEX IF NOT EXISTS idx_quotation_requests_created_at
  ON public.quotation_requests (created_at);

-- Step 3: updated_at trigger (mirrors the 0001 section-3 pattern)
DROP TRIGGER IF EXISTS trg_update_updated_at ON public.quotation_requests;
CREATE TRIGGER trg_update_updated_at
  BEFORE UPDATE ON public.quotation_requests
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Step 4: RLS — same allow_all pattern as the rest of the single-company schema
ALTER TABLE public.quotation_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "allow_all_quotation_requests" ON public.quotation_requests;
CREATE POLICY "allow_all_quotation_requests" ON public.quotation_requests
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Step 5: Realtime publication membership (idempotent)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.quotation_requests';
  END IF;
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;

-- Step 6: Verify
SELECT schemaname, tablename, rowsecurity FROM pg_tables
WHERE tablename = 'quotation_requests';

SELECT schemaname, tablename, policyname, permissive, roles, cmd
FROM pg_policies
WHERE tablename = 'quotation_requests'
ORDER BY policyname;

-- ============================================================================
-- End of migration
-- ============================================================================