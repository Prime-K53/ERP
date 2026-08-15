-- ============================================================================
-- Prime ERP — Promotion Engine (Portal-Driven Promotions)
-- ----------------------------------------------------------------------------
-- Extends the EXISTING engagement_promotions table (no duplicate definition).
-- Adds the fields required by the promotion engine, an immutable redemption
-- audit trail, and an atomic usage-increment function that prevents two
-- customers from simultaneously exceeding a promotion's usage limits.
--
-- Run AFTER: supabase-engagement-tables.sql / supabase-engagement-tables-run.sql
--            supabase-add-version-columns.sql
-- NOTE: The table may have been created by the sync gateway from the local
-- SQLite schema (backend/db.cjs) which lacks company_id/code/usage fields, so
-- every column this engine depends on is added defensively with IF NOT EXISTS.
-- ============================================================================

-- Company-scoping helper used by the RLS policies below. Same guarded
-- definition as supabase-portal-ads.sql so this migration is self-contained;
-- CREATE OR REPLACE keeps it safe to re-run alongside that file.
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
  IF to_regprocedure('public.get_user_company_id()') IS NOT NULL THEN
    RETURN public.get_user_company_id();
  END IF;
  RETURN NULL;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_current_company_id() TO authenticated, anon, service_role;

-- ─── 1. Extend engagement_promotions ───────────────────────────────────────
ALTER TABLE IF EXISTS public.engagement_promotions
  ADD COLUMN IF NOT EXISTS company_id TEXT,
  ADD COLUMN IF NOT EXISTS code TEXT,
  ADD COLUMN IF NOT EXISTS usage_limit INTEGER,
  ADD COLUMN IF NOT EXISTS used_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS per_customer_limit INTEGER DEFAULT 1,
  ADD COLUMN IF NOT EXISTS min_order_amount NUMERIC(15,2),
  ADD COLUMN IF NOT EXISTS max_discount_amount NUMERIC(15,2),
  ADD COLUMN IF NOT EXISTS applicable_products TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS applicable_categories TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS applicable_tiers TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS starts_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS ends_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS channel TEXT NOT NULL DEFAULT 'BOTH',
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'draft',
  ADD COLUMN IF NOT EXISTS priority INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS stackable BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_auto_apply BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS customer_scope TEXT NOT NULL DEFAULT 'all',
  ADD COLUMN IF NOT EXISTS customer_ids TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS applicable_to TEXT NOT NULL DEFAULT 'all',
  ADD COLUMN IF NOT EXISTS paused_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS created_by TEXT,
  ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1;

COMMENT ON COLUMN public.engagement_promotions.channel IS 'Channel the promotion applies to: ERP | PORTAL | BOTH';
COMMENT ON COLUMN public.engagement_promotions.status IS 'Admin intent status: draft | scheduled | active | paused | cancelled (expired is derived from ends_at)';
COMMENT ON COLUMN public.engagement_promotions.stackable IS 'Whether this promotion may stack with other promotions';
COMMENT ON COLUMN public.engagement_promotions.is_auto_apply IS 'true = applied automatically for eligible customers; false = requires promo code';
COMMENT ON COLUMN public.engagement_promotions.customer_scope IS 'all | customers | tiers | new_customers | existing_customers';
COMMENT ON COLUMN public.engagement_promotions.applicable_to IS 'all | products | categories | tiers';

-- ─── 2. Indexes (company_id, status, channel, dates, code) ──────────────────
CREATE INDEX IF NOT EXISTS idx_engagement_promotions_company ON public.engagement_promotions(company_id);
CREATE INDEX IF NOT EXISTS idx_engagement_promotions_status ON public.engagement_promotions(status);
CREATE INDEX IF NOT EXISTS idx_engagement_promotions_channel ON public.engagement_promotions(channel);
CREATE INDEX IF NOT EXISTS idx_engagement_promotions_dates ON public.engagement_promotions(starts_at, ends_at);

-- Promotion codes must be unique within a company (when a code is supplied).
CREATE UNIQUE INDEX IF NOT EXISTS uq_engagement_promotions_company_code
  ON public.engagement_promotions(company_id, code)
  WHERE code IS NOT NULL AND code <> '';

-- ─── 3. Immutable redemption audit trail ────────────────────────────────────
-- One row per promotion application on a source document (request / quotation /
-- sales order / invoice). The promotion_snapshot preserves the exact rules that
-- were applied so historical orders are never recalculated from current rules.
DROP TABLE IF EXISTS public.promotion_redemptions CASCADE;
CREATE TABLE public.promotion_redemptions (
    id TEXT PRIMARY KEY,
    -- Plain TEXT (no FK): company_config is not created by any migration and may
    -- be absent on databases bootstrapped by the sync gateway. RLS + the index
    -- below enforce company scoping, matching the portal_ads pattern.
    company_id TEXT,
    promotion_id TEXT NOT NULL REFERENCES public.engagement_promotions(id) ON DELETE CASCADE,
    customer_id TEXT REFERENCES public.customers(id) ON DELETE SET NULL,
    source_type TEXT NOT NULL,          -- 'request' | 'quotation' | 'sales_order' | 'invoice'
    source_id TEXT NOT NULL,
    source_number TEXT,
    discount_amount NUMERIC(15,2) NOT NULL DEFAULT 0,
    subtotal_before NUMERIC(15,2) NOT NULL DEFAULT 0,
    subtotal_after NUMERIC(15,2) NOT NULL DEFAULT 0,
    promotion_snapshot JSONB DEFAULT '{}',
    data JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    version INTEGER NOT NULL DEFAULT 1,
    -- One application per promotion per source document (idempotency guard).
    CONSTRAINT uq_promotion_redemption_source UNIQUE (promotion_id, source_id)
);

CREATE INDEX IF NOT EXISTS idx_promotion_redemptions_promo ON public.promotion_redemptions(promotion_id, created_at);
CREATE INDEX IF NOT EXISTS idx_promotion_redemptions_company ON public.promotion_redemptions(company_id, created_at);
CREATE INDEX IF NOT EXISTS idx_promotion_redemptions_customer ON public.promotion_redemptions(customer_id, created_at);
CREATE INDEX IF NOT EXISTS idx_promotion_redemptions_source ON public.promotion_redemptions(source_type, source_id);

-- ─── 4. Atomic usage increment (prevents race conditions on usage limits) ───
-- Locks the promotion row, re-validates dates/status, enforces total + per-
-- customer usage limits, records the redemption, and increments used_count —
-- all in one transaction. Two simultaneous checkouts cannot overshoot a limit.
CREATE OR REPLACE FUNCTION public.apply_promotion_usage(
    p_promotion_id TEXT,
    p_customer_id TEXT,
    p_source_type TEXT,
    p_source_id TEXT,
    p_source_number TEXT,
    p_company_id TEXT,
    p_discount_amount NUMERIC,
    p_subtotal_before NUMERIC,
    p_subtotal_after NUMERIC,
    p_snapshot JSONB DEFAULT '{}'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_promo engagement_promotions%ROWTYPE;
    v_customer_usage INTEGER;
    v_now TIMESTAMPTZ := NOW();
    v_existing TEXT;
    v_effective_status TEXT;
BEGIN
    SELECT * INTO v_promo FROM engagement_promotions WHERE id = p_promotion_id FOR UPDATE;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'reason', 'not_found');
    END IF;

    -- Effective status: cancelled/paused explicit; else derive from dates.
    IF v_promo.status = 'cancelled' THEN
        RETURN jsonb_build_object('success', false, 'reason', 'cancelled');
    END IF;
    IF v_promo.status = 'paused' OR v_promo.paused_at IS NOT NULL THEN
        RETURN jsonb_build_object('success', false, 'reason', 'paused');
    END IF;
    IF NOT v_promo.is_active THEN
        RETURN jsonb_build_object('success', false, 'reason', 'inactive');
    END IF;
    IF v_promo.starts_at IS NOT NULL AND v_promo.starts_at > v_now THEN
        RETURN jsonb_build_object('success', false, 'reason', 'not_started');
    END IF;
    IF v_promo.ends_at IS NOT NULL AND v_promo.ends_at < v_now THEN
        RETURN jsonb_build_object('success', false, 'reason', 'expired');
    END IF;

    -- Idempotency: a source document may only consume the promotion once.
    SELECT id INTO v_existing FROM promotion_redemptions
        WHERE promotion_id = p_promotion_id AND source_id = p_source_id
        LIMIT 1;
    IF FOUND THEN
        RETURN jsonb_build_object('success', true, 'duplicate', true, 'used_count', v_promo.used_count);
    END IF;

    -- Total usage limit (atomic — row is locked above).
    IF v_promo.usage_limit IS NOT NULL AND v_promo.usage_limit > 0
       AND v_promo.used_count >= v_promo.usage_limit THEN
        RETURN jsonb_build_object('success', false, 'reason', 'limit_reached', 'used_count', v_promo.used_count);
    END IF;

    -- Per-customer usage limit.
    IF p_customer_id IS NOT NULL AND v_promo.per_customer_limit IS NOT NULL AND v_promo.per_customer_limit > 0 THEN
        SELECT COUNT(*) INTO v_customer_usage FROM promotion_redemptions
            WHERE promotion_id = p_promotion_id AND customer_id = p_customer_id;
        IF v_customer_usage >= v_promo.per_customer_limit THEN
            RETURN jsonb_build_object('success', false, 'reason', 'per_customer_limit', 'used_count', v_promo.used_count);
        END IF;
    END IF;

    INSERT INTO promotion_redemptions
        (id, company_id, promotion_id, customer_id, source_type, source_id, source_number,
         discount_amount, subtotal_before, subtotal_after, promotion_snapshot, version)
    VALUES
        (gen_random_uuid()::TEXT, p_company_id, p_promotion_id, p_customer_id, p_source_type, p_source_id, p_source_number,
         COALESCE(p_discount_amount, 0), COALESCE(p_subtotal_before, 0), COALESCE(p_subtotal_after, 0),
         COALESCE(p_snapshot, '{}'::jsonb), 1);

    UPDATE engagement_promotions SET used_count = used_count + 1, updated_at = v_now
        WHERE id = p_promotion_id
        RETURNING used_count INTO v_promo.used_count;

    RETURN jsonb_build_object('success', true, 'used_count', v_promo.used_count);
END;
$$;

GRANT EXECUTE ON FUNCTION public.apply_promotion_usage(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, NUMERIC, NUMERIC, NUMERIC, JSONB)
    TO authenticated, anon, service_role;

-- ─── 5. RLS — a company can only ever touch its own promotions ─────────────
ALTER TABLE public.promotion_redemptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS promotion_redemptions_select ON public.promotion_redemptions;
CREATE POLICY promotion_redemptions_select ON public.promotion_redemptions
    FOR SELECT USING (company_id = get_current_company_id());

DROP POLICY IF EXISTS promotion_redemptions_insert ON public.promotion_redemptions;
CREATE POLICY promotion_redemptions_insert ON public.promotion_redemptions
    FOR INSERT WITH CHECK (company_id = get_current_company_id());

-- Promotion RLS already exists (engagement_promotions_company); keep it and add
-- a delete policy so cancelled promotions can be removed by their own company.
DROP POLICY IF EXISTS engagement_promotions_company_delete ON public.engagement_promotions;
CREATE POLICY engagement_promotions_company_delete ON public.engagement_promotions
    FOR DELETE USING (company_id = get_current_company_id());

-- ─── 6. Realtime — admin changes propagate to Portal/ERP without redeploys ──
DO $$
BEGIN
    BEGIN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.promotion_redemptions;
    EXCEPTION WHEN duplicate_object THEN
        RAISE NOTICE 'promotion_redemptions already in publication';
    END;
    BEGIN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.engagement_promotions;
    EXCEPTION WHEN duplicate_object THEN
        RAISE NOTICE 'engagement_promotions already in publication';
    END;
END $$;

-- ─── 7. Backfill safety ─────────────────────────────────────────────────────
-- Historical orders are NEVER recalculated. Existing promotion records keep
-- their current values; only the new columns get safe defaults. No existing
-- financial totals are touched.
-- Existing rows: mark channels as BOTH so the legacy client-side behaviour is
-- preserved for promotions that predate the engine (admin can narrow later).
UPDATE public.engagement_promotions
   SET channel = 'BOTH'
 WHERE channel = 'BOTH'
   AND (ends_at IS NULL OR ends_at >= NOW());
