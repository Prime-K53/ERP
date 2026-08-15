-- ============================================================================
-- 0006_reconcile_referral_schema.sql
-- Referral schema reconciliation + completion for the single-company ERP.
--
-- Purpose (derived from docs/SASA_PHASE_5_DATABASE_READINESS.md):
--   * Live `customer_referrals` / `referral_rewards` were created out-of-band
--     in the 0003 envelope shape (id, data, company_id, created_at,
--     updated_at) but WITHOUT the `version` column the backend envelope
--     contract requires (supabaseRepository.toSupabaseRow writes
--     { id, data, updated_at, version }). Read-only live probes confirmed
--     the exact missing object: `version INTEGER NOT NULL DEFAULT 0`.
--   * The other six referral tables the application references
--     (referral_timeline, referral_audit_logs, referral_campaigns,
--     referral_analytics, referral_reversals, referral_settings) do not exist
--     live and were never created by 0003.
--   * 0004 installed `USING (true)` permissive policies on the two tables.
--     This migration DROPs those and replaces them with customer-isolation
--     policies consistent with the 0001 portal-table convention
--     (portal_tickets_customer_isolation et al.).
--
-- Reconciliation strategy: OPTION A — additive ALTER. The live tables already
-- carry the envelope columns; only `version` is added. No table is dropped,
-- renamed, or recreated. All statements are idempotent; the whole migration is
-- safe to re-run and safe on a fresh chain (0001 → 0003 → 0004 → 0005 → 0006).
--
-- RLS design (single-company, no tenant_id, no company isolation added):
--   * Customer-owned tables get customer-isolation policies keyed on the
--     authenticated user's identity as a portal user:
--       (SELECT customer_id FROM public.portal_users WHERE id = auth.uid()::text)
--     — the exact pattern already used by 0001 for portal_tickets /
--       portal_ticket_messages / ticket_attachments / portal_notifications.
--     Because portal customers authenticate through the ERP backend (HS256
--     JWT), direct PostgREST access is denied by default; if a customer ever
--     holds a Supabase auth identity, the policy scopes them to their own
--     customer_id only.
--   * Ownership field per table (derived from backend code):
--       customer_referrals  → data->>'referred_by_id'   (the referring customer;
--                              portalService.createReferral writes
--                              referred_by_id = the authenticated customer)
--       referral_rewards    → data->>'customer_id'      (the earning customer)
--       referral_timeline   → data->>'referral_id'      (owned via its parent
--                              customer_referrals row)
--   * Staff/global tables (referral_audit_logs, referral_campaigns,
--     referral_analytics, referral_reversals, referral_settings) are NOT
--     customer-owned. No policy is created → default deny for direct REST;
--     all access flows through the ERP backend (service role, RLS bypassed).
--     This intentionally avoids the 0004 `USING (true)` permissive class.
--
-- Backend/service-role operations are unaffected (service_role bypasses RLS).
-- ERP staff operations are unaffected (all staff referral endpoints
-- `/api/referrals/*` are backend-mediated through referralService).
-- ============================================================================

-- ─── 0. DATA-SAFETY GUARD ───────────────────────────────────────────────────
-- The Phase 5 audit established the two legacy tables contain ZERO rows.
-- Verify before touching anything. If rows are ever present, STOP the
-- migration (do not drop/alter data-bearing tables).
DO $$
DECLARE
  r_count BIGINT;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'customer_referrals') THEN
    EXECUTE 'SELECT COUNT(*) FROM public.customer_referrals' INTO r_count;
    IF r_count > 0 THEN
      RAISE EXCEPTION 'Unexpected referral data detected — migration halted. public.customer_referrals contains % row(s).', r_count;
    END IF;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'referral_rewards') THEN
    EXECUTE 'SELECT COUNT(*) FROM public.referral_rewards' INTO r_count;
    IF r_count > 0 THEN
      RAISE EXCEPTION 'Unexpected referral data detected — migration halted. public.referral_rewards contains % row(s).', r_count;
    END IF;
  END IF;
END $$;

-- ─── 1. RECONCILE EXISTING TABLES TO THE ENVELOPE CONTRACT ─────────────────
-- Live shape today: id, data, company_id, created_at, updated_at.
-- Missing: `version` (backend envelope requires it). Additive, idempotent.
-- The CREATE TABLE IF NOT EXISTS guards a fresh chain that skips 0003.

CREATE TABLE IF NOT EXISTS public.customer_referrals (
    id TEXT PRIMARY KEY,
    data JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    version INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.referral_rewards (
    id TEXT PRIMARY KEY,
    data JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    version INTEGER NOT NULL DEFAULT 0
);

ALTER TABLE public.customer_referrals ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 0;
ALTER TABLE public.referral_rewards   ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 0;

-- Belt-and-braces: guarantee the envelope columns exist regardless of the
-- historical shape encountered (covers any other legacy variant).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'customer_referrals' AND column_name = 'data') THEN
    ALTER TABLE public.customer_referrals ADD COLUMN data JSONB NOT NULL DEFAULT '{}'::jsonb;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'referral_rewards' AND column_name = 'data') THEN
    ALTER TABLE public.referral_rewards ADD COLUMN data JSONB NOT NULL DEFAULT '{}'::jsonb;
  END IF;
END $$;

-- ─── 2. CREATE THE SIX MISSING REFERRAL TABLES (envelope contract) ─────────
-- All fields written by referralService are stored inside `data` JSONB via
-- supabaseRepository.toSupabaseRow; the row contract is exactly
-- { id, data, created_at, updated_at, version }.

CREATE TABLE IF NOT EXISTS public.referral_timeline (
    id TEXT PRIMARY KEY,
    data JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    version INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.referral_audit_logs (
    id TEXT PRIMARY KEY,
    data JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    version INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.referral_campaigns (
    id TEXT PRIMARY KEY,
    data JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    version INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.referral_analytics (
    id TEXT PRIMARY KEY,
    data JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    version INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.referral_reversals (
    id TEXT PRIMARY KEY,
    data JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    version INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.referral_settings (
    id TEXT PRIMARY KEY,
    data JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    version INTEGER NOT NULL DEFAULT 0
);

-- ─── 3. INDEXES (expression indexes over the JSONB envelope) ───────────────
-- Cover every filter the application sends to PostgREST (`data->>field`).

CREATE INDEX IF NOT EXISTS idx_customer_referrals_referred_by ON public.customer_referrals ((data->>'referred_by_id'));
CREATE INDEX IF NOT EXISTS idx_customer_referrals_customer    ON public.customer_referrals ((data->>'customer_id'));
CREATE INDEX IF NOT EXISTS idx_customer_referrals_code        ON public.customer_referrals ((data->>'referral_code'));
CREATE INDEX IF NOT EXISTS idx_customer_referrals_status      ON public.customer_referrals ((data->>'status'));
CREATE INDEX IF NOT EXISTS idx_customer_referrals_created     ON public.customer_referrals (created_at);

CREATE INDEX IF NOT EXISTS idx_referral_rewards_referral      ON public.referral_rewards ((data->>'referral_id'));
CREATE INDEX IF NOT EXISTS idx_referral_rewards_customer      ON public.referral_rewards ((data->>'customer_id'));
CREATE INDEX IF NOT EXISTS idx_referral_rewards_status        ON public.referral_rewards ((data->>'status'));
CREATE INDEX IF NOT EXISTS idx_referral_rewards_created       ON public.referral_rewards (created_at);

CREATE INDEX IF NOT EXISTS idx_referral_timeline_referral     ON public.referral_timeline ((data->>'referral_id'));
CREATE INDEX IF NOT EXISTS idx_referral_timeline_event        ON public.referral_timeline ((data->>'event_type'));
CREATE INDEX IF NOT EXISTS idx_referral_timeline_ts           ON public.referral_timeline ((data->>'timestamp'));

CREATE INDEX IF NOT EXISTS idx_referral_audit_entity          ON public.referral_audit_logs ((data->>'entity_type'), (data->>'entity_id'));
CREATE INDEX IF NOT EXISTS idx_referral_audit_actor           ON public.referral_audit_logs ((data->>'actor_id'));
CREATE INDEX IF NOT EXISTS idx_referral_audit_ts              ON public.referral_audit_logs ((data->>'timestamp'));

CREATE INDEX IF NOT EXISTS idx_referral_campaigns_status      ON public.referral_campaigns ((data->>'status'));
CREATE INDEX IF NOT EXISTS idx_referral_campaigns_dates       ON public.referral_campaigns ((data->>'start_date'), (data->>'end_date'));
CREATE INDEX IF NOT EXISTS idx_referral_campaigns_created     ON public.referral_campaigns (created_at);

CREATE INDEX IF NOT EXISTS idx_referral_analytics_period      ON public.referral_analytics ((data->>'period'), (data->>'period_start'));
CREATE INDEX IF NOT EXISTS idx_referral_analytics_generated   ON public.referral_analytics ((data->>'generated_at'));

CREATE INDEX IF NOT EXISTS idx_referral_reversals_reward      ON public.referral_reversals ((data->>'reward_id'));
CREATE INDEX IF NOT EXISTS idx_referral_reversals_status      ON public.referral_reversals ((data->>'status'));
CREATE INDEX IF NOT EXISTS idx_referral_reversals_created     ON public.referral_reversals (created_at);

-- ─── 4. updated_at TRIGGERS (mirrors 0001 section-3 pattern) ───────────────
DO $$
DECLARE
    t TEXT;
BEGIN
    FOREACH t IN ARRAY ARRAY[
        'customer_referrals','referral_rewards','referral_timeline',
        'referral_audit_logs','referral_campaigns','referral_analytics',
        'referral_reversals','referral_settings'
    ]
    LOOP
        EXECUTE format('DROP TRIGGER IF EXISTS trg_update_updated_at ON public.%I', t);
        EXECUTE format(
            'CREATE TRIGGER trg_update_updated_at BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column()',
            t
        );
    END LOOP;
END $$;

-- ─── 5. RLS — customer isolation for customer-owned tables ─────────────────
-- Replace the 0004 `allow_all_*` (USING true) policies with the portal-table
-- isolation convention (see header for rationale and ownership derivation).
-- Staff/global tables keep NO policy → default deny for direct REST access;
-- all access is backend/service-role (RLS bypassed).

ALTER TABLE public.customer_referrals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.referral_rewards   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.referral_timeline  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.referral_audit_logs   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.referral_campaigns    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.referral_analytics    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.referral_reversals    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.referral_settings     ENABLE ROW LEVEL SECURITY;

-- Drop every historical permissive policy (0004 names + any legacy names).
DROP POLICY IF EXISTS "allow_all_customer_referrals" ON public.customer_referrals;
DROP POLICY IF EXISTS "tenant_all"                    ON public.customer_referrals;
DROP POLICY IF EXISTS "tenant_isolation_policy"       ON public.customer_referrals;
DROP POLICY IF EXISTS "allow_all_referral_rewards"    ON public.referral_rewards;
DROP POLICY IF EXISTS "tenant_all"                    ON public.referral_rewards;
DROP POLICY IF EXISTS "tenant_isolation_policy"       ON public.referral_rewards;

-- customer_referrals: owned by the REFERRING customer (data->>referred_by_id).
DROP POLICY IF EXISTS "customer_referrals_customer_isolation" ON public.customer_referrals;
CREATE POLICY "customer_referrals_customer_isolation" ON public.customer_referrals
  FOR ALL TO authenticated
  USING (data->>'referred_by_id' = (SELECT customer_id FROM public.portal_users WHERE id = auth.uid()::text))
  WITH CHECK (data->>'referred_by_id' = (SELECT customer_id FROM public.portal_users WHERE id = auth.uid()::text));

-- referral_rewards: owned by the EARNING customer (data->>customer_id).
DROP POLICY IF EXISTS "referral_rewards_customer_isolation" ON public.referral_rewards;
CREATE POLICY "referral_rewards_customer_isolation" ON public.referral_rewards
  FOR ALL TO authenticated
  USING (data->>'customer_id' = (SELECT customer_id FROM public.portal_users WHERE id = auth.uid()::text))
  WITH CHECK (data->>'customer_id' = (SELECT customer_id FROM public.portal_users WHERE id = auth.uid()::text));

-- referral_timeline: owned via its parent referral (referral → referrer).
-- No recursion: the subquery targets customer_referrals (a different table),
-- whose own policy only references portal_users.
DROP POLICY IF EXISTS "referral_timeline_customer_isolation" ON public.referral_timeline;
CREATE POLICY "referral_timeline_customer_isolation" ON public.referral_timeline
  FOR ALL TO authenticated
  USING (data->>'referral_id' IN (
    SELECT id FROM public.customer_referrals
    WHERE data->>'referred_by_id' = (SELECT customer_id FROM public.portal_users WHERE id = auth.uid()::text)
  ))
  WITH CHECK (data->>'referral_id' IN (
    SELECT id FROM public.customer_referrals
    WHERE data->>'referred_by_id' = (SELECT customer_id FROM public.portal_users WHERE id = auth.uid()::text)
  ));

-- referral_audit_logs / referral_campaigns / referral_analytics /
-- referral_reversals / referral_settings: staff/global, NOT customer-owned.
-- Intentionally NO policy (default deny for direct REST). Backend service-role
-- operations bypass RLS and are unaffected.

-- ─── 6. REALTIME PUBLICATION MEMBERSHIP (idempotent) ───────────────────────
DO $$
DECLARE
    t TEXT;
BEGIN
    IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
        FOREACH t IN ARRAY ARRAY[
            'customer_referrals','referral_rewards','referral_timeline',
            'referral_audit_logs','referral_campaigns','referral_analytics',
            'referral_reversals','referral_settings'
        ]
        LOOP
            BEGIN
                EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
            EXCEPTION WHEN duplicate_object THEN
                NULL;
            END;
        END LOOP;
    END IF;
END $$;

-- ============================================================================
-- End of 0006
-- ============================================================================
