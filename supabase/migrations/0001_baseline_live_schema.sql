-- ============================================================================
-- 0001_baseline_live_schema.sql
--
-- Prime ERP — consolidated live schema baseline.
-- Generated from the LIVE Supabase project (OpenAPI spec @ /rest/v1/ , 2026-08-11).
-- Reproduces: all 159 public tables w/ live column sets and types, sync envelope
-- (data/version/updated_at), updated_at triggers, RPC helpers, the post-
-- _FIX_SYNC_ISSUES RLS policy set, and realtime publication membership.
-- Idempotent (IF NOT EXISTS / DROP-then-CREATE) — safe to run on existing DBs.
--
-- Precursors archived at database/archive/ (applied move-by-move); pending
-- migrations continue at 0002+.
-- ============================================================================

-- ─── 0. update_updated_at_column (trigger helper) ─────────────────────────
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ─── 1. RPC helpers (live set — get_user_company_id was removed by _FIX) ──
-- is_company_staff: SECURITY DEFINER staff check (avoids RLS recursion)
CREATE OR REPLACE FUNCTION public.is_company_staff()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p WHERE p.user_id = auth.uid()::text
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_company_staff() TO authenticated;

-- get_current_company_id: app.company_id setting w/ legacy fallback
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

-- set_user_app_metadata: auth.users raw_app_meta_data writer
CREATE OR REPLACE FUNCTION public.set_user_app_metadata(
  p_user_id uuid,
  p_tenant_id text,
  p_role text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = auth, public
AS $$
DECLARE
  current_metadata jsonb;
BEGIN
  SELECT COALESCE(raw_app_meta_data, '{}') INTO current_metadata
  FROM auth.users WHERE id = p_user_id;

  current_metadata := jsonb_set(current_metadata, '{tenant_id}', to_jsonb(p_tenant_id));

  IF p_role IS NOT NULL THEN
    current_metadata := jsonb_set(current_metadata, '{role}', to_jsonb(p_role));
  END IF;

  UPDATE auth.users SET raw_app_meta_data = current_metadata WHERE id = p_user_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_user_app_metadata(uuid, text, text) TO authenticated;

-- apply_promotion_usage: atomic promotion redemption (usage-limit safe)
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

    SELECT id INTO v_existing FROM promotion_redemptions
        WHERE promotion_id = p_promotion_id AND source_id = p_source_id
        LIMIT 1;
    IF FOUND THEN
        RETURN jsonb_build_object('success', true, 'duplicate', true, 'used_count', v_promo.used_count);
    END IF;

    IF v_promo.usage_limit IS NOT NULL AND v_promo.usage_limit > 0
       AND v_promo.used_count >= v_promo.usage_limit THEN
        RETURN jsonb_build_object('success', false, 'reason', 'limit_reached', 'used_count', v_promo.used_count);
    END IF;

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


-- ─── 2. Tables (column sets & types captured from live) ───────────────
CREATE TABLE IF NOT EXISTS public.ticket_attachments (
id TEXT PRIMARY KEY,
  ticket_id TEXT,
  message_id TEXT,
  filename TEXT,
  original_name TEXT,
  mime_type TEXT,
  size_bytes INTEGER,
  storage_path TEXT,
  uploaded_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ticket_attachments_ticket ON public.ticket_attachments (ticket_id);
CREATE INDEX IF NOT EXISTS idx_ticket_attachments_message ON public.ticket_attachments (message_id);

CREATE TABLE IF NOT EXISTS public.examinations (
id TEXT PRIMARY KEY,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  version INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.production_batch_notifications (
id TEXT PRIMARY KEY,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  version INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.invoices (
id TEXT PRIMARY KEY,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  version INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.discountrules (
id TEXT PRIMARY KEY,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  version INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.engagement_point_balances (
id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL UNIQUE,
  balance NUMERIC(15,2),
  lifetime_earned NUMERIC(15,2),
  lifetime_redeemed NUMERIC(15,2),
  lifetime_expired NUMERIC(15,2),
  last_updated TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  version INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_engagement_balances_customer ON public.engagement_point_balances (customer_id);

CREATE TABLE IF NOT EXISTS public.purchases (
id TEXT PRIMARY KEY,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  version INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.maintenance_logs (
id TEXT PRIMARY KEY,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  version INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.engagement_timeline (
id TEXT PRIMARY KEY,
  customer_id TEXT,
  event_type TEXT,
  title TEXT,
  description TEXT,
  amount NUMERIC(15,2),
  points NUMERIC(15,2),
  tier_name TEXT,
  reference_type TEXT,
  reference_id TEXT,
  metadata JSONB,
  actor_id TEXT,
  actor_name TEXT,
  timestamp TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  version INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_engagement_timeline_customer ON public.engagement_timeline (customer_id, timestamp);
CREATE INDEX IF NOT EXISTS idx_engagement_timeline_event ON public.engagement_timeline (event_type);
CREATE INDEX IF NOT EXISTS idx_engagement_timeline_ref ON public.engagement_timeline (reference_type, reference_id);

CREATE TABLE IF NOT EXISTS public.bank_transactions (
id TEXT PRIMARY KEY,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  version INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.sales_exchange_approvals (
id TEXT PRIMARY KEY,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  version INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.whatsapp_message_queue (
id TEXT PRIMARY KEY,
  account_id TEXT,
  user_id TEXT,
  recipient TEXT,
  message_content TEXT,
  status TEXT,
  batch_id TEXT,
  retry_count INTEGER,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  version INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_whatsapp_queue_account ON public.whatsapp_message_queue (account_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_queue_status ON public.whatsapp_message_queue (status);

CREATE TABLE IF NOT EXISTS public.goods_receipts (
id TEXT PRIMARY KEY,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  version INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.expenses (
id TEXT PRIMARY KEY,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  version INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.examination_printing_batches (
id TEXT PRIMARY KEY,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  version INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.subcontract_orders (
id TEXT PRIMARY KEY,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  version INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.bank_statements (
id TEXT PRIMARY KEY,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  version INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.warehouses (
id TEXT PRIMARY KEY,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  version INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.engagement_membership_tiers (
id TEXT PRIMARY KEY,
  name TEXT,
  slug TEXT,
  level INTEGER,
  min_points NUMERIC(15,2),
  max_points NUMERIC(15,2),
  benefits JSONB,
  color TEXT,
  icon TEXT,
  is_active BOOLEAN,
  sort_order INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  version INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_engagement_tiers_active ON public.engagement_membership_tiers (is_active, sort_order);

CREATE TABLE IF NOT EXISTS public.rounding_logs (
id TEXT PRIMARY KEY,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  version INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.payroll_runs (
id TEXT PRIMARY KEY,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  version INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.engagement_affiliates (
id TEXT PRIMARY KEY,
  customer_id TEXT,
  affiliate_code TEXT,
  referral_link TEXT,
  total_earned NUMERIC(15,2),
  total_paid NUMERIC(15,2),
  total_pending NUMERIC(15,2),
  referral_count INTEGER,
  conversion_count INTEGER,
  status TEXT,
  commission_rate NUMERIC(15,2),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  version INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_engagement_affiliates_code ON public.engagement_affiliates (affiliate_code);

CREATE TABLE IF NOT EXISTS public.whatsapp_accounts (
id TEXT PRIMARY KEY,
  user_id TEXT,
  phone_number_id TEXT,
  access_token TEXT,
  display_name TEXT,
  connection_status TEXT,
  last_connected_at TIMESTAMPTZ,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  version INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_whatsapp_accounts_user_id ON public.whatsapp_accounts (user_id);

CREATE TABLE IF NOT EXISTS public.examination_class_adjustments (
id TEXT PRIMARY KEY,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  version INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.portal_ads (
id TEXT PRIMARY KEY,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  version INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  company_id TEXT
);
CREATE INDEX IF NOT EXISTS idx_portal_ads_company ON public.portal_ads (company_id);
CREATE INDEX IF NOT EXISTS idx_portal_ads_updated ON public.portal_ads (updated_at DESC);

CREATE TABLE IF NOT EXISTS public.supplier_payments (
id TEXT PRIMARY KEY,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  version INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.examination_pricing_audit (
id TEXT PRIMARY KEY,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  version INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.ledger_entries (
id TEXT PRIMARY KEY,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  version INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.subjects (
id TEXT PRIMARY KEY,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  version INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.classes (
id TEXT PRIMARY KEY,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  version INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.job_tickets (
id TEXT PRIMARY KEY,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  version INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.accounts (
id TEXT PRIMARY KEY,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  version INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.production_bom_calculations (
id TEXT PRIMARY KEY,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  version INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.profit_margin_audit_logs (
id TEXT PRIMARY KEY,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  version INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.portal_password_resets (
id TEXT PRIMARY KEY,
  portal_user_id TEXT,
  code TEXT,
  expires_at TEXT,
  used_at TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  version INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_portal_password_resets_user ON public.portal_password_resets (portal_user_id);
CREATE INDEX IF NOT EXISTS idx_portal_password_resets_code ON public.portal_password_resets (code);

CREATE TABLE IF NOT EXISTS public.whatsapp_automations (
id TEXT PRIMARY KEY,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  version INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.orders (
id TEXT PRIMARY KEY,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  version INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.customers (
id TEXT PRIMARY KEY,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  version INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.boms (
id TEXT PRIMARY KEY,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  version INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.examination_inventory_deductions (
id TEXT PRIMARY KEY,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  version INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.portal_sessions (
id TEXT PRIMARY KEY,
  portal_user_id TEXT,
  refresh_token_hash TEXT,
  ip_address TEXT,
  user_agent TEXT,
  expires_at TEXT,
  revoked_at TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  version INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_portal_sessions_user ON public.portal_sessions (portal_user_id);
CREATE INDEX IF NOT EXISTS idx_portal_sessions_token ON public.portal_sessions (refresh_token_hash);
CREATE INDEX IF NOT EXISTS idx_portal_sessions_expires ON public.portal_sessions (expires_at);

CREATE TABLE IF NOT EXISTS public.job_orders (
id TEXT PRIMARY KEY,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  version INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.bank_categories (
id TEXT PRIMARY KEY,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  version INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.delivery_notes (
id TEXT PRIMARY KEY,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  version INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.payment_allocation_lines (
id TEXT PRIMARY KEY,
  company_id TEXT,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  version INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_payment_allocation_lines_allocation_id ON public.payment_allocation_lines ((data->>'allocation_id'));
CREATE INDEX IF NOT EXISTS idx_payment_allocation_lines_invoice_id ON public.payment_allocation_lines ((data->>'invoice_id'));

CREATE TABLE IF NOT EXISTS public.idempotency_keys (
id UUID PRIMARY KEY,
  result TEXT,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  version INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.schools (
id TEXT PRIMARY KEY,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  version INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.cheques (
id TEXT PRIMARY KEY,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  version INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.inventory (
id TEXT PRIMARY KEY,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  version INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.examination_subjects (
id TEXT PRIMARY KEY,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  version INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.bank_exchange_rates (
id TEXT PRIMARY KEY,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  version INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.bom_default_materials (
id TEXT PRIMARY KEY,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  version INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.payment_allocations (
id TEXT PRIMARY KEY,
  company_id TEXT,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  version INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_payment_allocations_payment_id ON public.payment_allocations ((data->>'payment_id'));

CREATE TABLE IF NOT EXISTS public.vat_transactions (
id TEXT PRIMARY KEY,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  version INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.audit_logs (
id TEXT PRIMARY KEY,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  version INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.engagement_gift_cards (
id TEXT PRIMARY KEY,
  code TEXT,
  original_balance NUMERIC(15,2),
  current_balance NUMERIC(15,2),
  currency TEXT,
  issuer_customer_id TEXT,
  recipient_customer_id TEXT,
  recipient_email TEXT,
  recipient_name TEXT,
  message TEXT,
  status TEXT,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  version INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.financial_years (
id TEXT PRIMARY KEY,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  version INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.payslips (
id TEXT PRIMARY KEY,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  version INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.examination_batches (
id TEXT PRIMARY KEY,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  version INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.recurring_invoices (
id TEXT PRIMARY KEY,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  version INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.examination_invoice_groups (
id TEXT PRIMARY KEY,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  version INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.customer_notification_logs (
id TEXT PRIMARY KEY,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  version INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.engagement_gift_card_transactions (
id TEXT PRIMARY KEY,
  gift_card_id TEXT,
  customer_id TEXT,
  transaction_type TEXT,
  amount NUMERIC(15,2),
  balance_before NUMERIC(15,2),
  balance_after NUMERIC(15,2),
  reference_type TEXT,
  reference_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  version INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.market_adjustment_transactions (
id TEXT PRIMARY KEY,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  version INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.bom_templates (
id TEXT PRIMARY KEY,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  version INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.portal_login_history (
id TEXT PRIMARY KEY,
  portal_user_id TEXT,
  ip_address TEXT,
  user_agent TEXT,
  login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  version INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_portal_login_history_user ON public.portal_login_history (portal_user_id);
CREATE INDEX IF NOT EXISTS idx_portal_login_history_at ON public.portal_login_history (login_at);

CREATE TABLE IF NOT EXISTS public.portal_tickets (
id TEXT PRIMARY KEY,
  portal_user_id TEXT,
  customer_id TEXT,
  subject TEXT,
  message TEXT,
  priority TEXT,
  status TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  priority TEXT DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  status TEXT DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'resolved', 'closed'))
);
CREATE INDEX IF NOT EXISTS idx_portal_tickets_user ON public.portal_tickets (portal_user_id);
CREATE INDEX IF NOT EXISTS idx_portal_tickets_status ON public.portal_tickets (status);

CREATE TABLE IF NOT EXISTS public.documents (
id TEXT PRIMARY KEY,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  version INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.notification_audit_logs (
id TEXT PRIMARY KEY,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  version INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.reminders (
id TEXT PRIMARY KEY,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  version INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.profit_margin_settings (
id TEXT PRIMARY KEY,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  version INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.assets (
id TEXT PRIMARY KEY,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  version INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.job_ticket_settings (
id TEXT PRIMARY KEY,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  version INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.settings (
id TEXT PRIMARY KEY,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  version INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.engagement_customer_tiers (
id TEXT PRIMARY KEY,
  customer_id TEXT,
  tier_id TEXT,
  tier_name TEXT,
  tier_level INTEGER,
  assigned_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  is_current BOOLEAN,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  version INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.quotations (
id TEXT PRIMARY KEY,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  version INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.sales_exchange_items (
id TEXT PRIMARY KEY,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  version INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.subscribers (
id TEXT PRIMARY KEY,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  version INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.examination_bom_calculations (
id TEXT PRIMARY KEY,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  version INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.examination_recurring_profiles (
id TEXT PRIMARY KEY,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  version INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.bank_fees (
id TEXT PRIMARY KEY,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  version INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.production_subjects (
id TEXT PRIMARY KEY,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  version INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.whatsapp_chats (
id TEXT PRIMARY KEY,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  version INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.products (
id TEXT PRIMARY KEY,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  version INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.examination_classes (
id TEXT PRIMARY KEY,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  version INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.material_batches (
id TEXT PRIMARY KEY,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  version INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.sms_templates (
id TEXT PRIMARY KEY,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  version INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.engagement_promotions (
id TEXT PRIMARY KEY,
  name TEXT,
  description TEXT,
  type TEXT,
  value NUMERIC(15,2),
  value_type TEXT,
  code TEXT,
  usage_limit INTEGER,
  used_count INTEGER,
  per_customer_limit INTEGER,
  min_order_amount NUMERIC(15,2),
  max_discount_amount NUMERIC(15,2),
  applicable_products TEXT[],
  applicable_categories TEXT[],
  applicable_tiers TEXT[],
  starts_at TIMESTAMPTZ,
  ends_at TIMESTAMPTZ,
  is_active BOOLEAN,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  version INTEGER NOT NULL DEFAULT 0,
  company_id TEXT,
  channel TEXT,
  status TEXT,
  priority INTEGER,
  stackable BOOLEAN,
  is_auto_apply BOOLEAN,
  customer_scope TEXT,
  customer_ids TEXT[],
  applicable_to TEXT,
  paused_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  created_by TEXT
);
CREATE INDEX IF NOT EXISTS idx_engagement_promotions_status ON public.engagement_promotions (status);
CREATE INDEX IF NOT EXISTS idx_engagement_promotions_channel ON public.engagement_promotions (channel);
CREATE INDEX IF NOT EXISTS idx_engagement_promotions_dates ON public.engagement_promotions (starts_at, ends_at);
CREATE UNIQUE INDEX IF NOT EXISTS uq_engagement_promotions_company_code ON public.engagement_promotions (company_id, code) WHERE code IS NOT NULL AND code <> '';

CREATE TABLE IF NOT EXISTS public.resource_allocations (
id TEXT PRIMARY KEY,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  version INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.sales_orders (
id TEXT PRIMARY KEY,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  version INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.sales (
id TEXT PRIMARY KEY,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  version INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.transaction_adjustment_snapshots (
id TEXT PRIMARY KEY,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  version INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.material_reservations (
id TEXT PRIMARY KEY,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  version INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.bank_alerts (
id TEXT PRIMARY KEY,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  version INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.production_classes (
id TEXT PRIMARY KEY,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  version INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.profiles (
id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL UNIQUE,
  full_name TEXT,
  role TEXT,
  status TEXT,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  version INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.bank_cash_flow_forecasts (
id TEXT PRIMARY KEY,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  version INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.production_notification_audit_logs (
id TEXT PRIMARY KEY,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  version INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.customerpricingtiers (
id TEXT PRIMARY KEY,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  version INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.tax_rates (
id TEXT PRIMARY KEY,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  version INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.portal_notifications (
id TEXT PRIMARY KEY,
  portal_user_id TEXT,
  type TEXT,
  title TEXT,
  body TEXT,
  link TEXT,
  is_read BOOLEAN,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_portal_notifications_user ON public.portal_notifications (portal_user_id);
CREATE INDEX IF NOT EXISTS idx_portal_notifications_read ON public.portal_notifications (portal_user_id, is_read);

CREATE TABLE IF NOT EXISTS public.chart_of_accounts (
id TEXT PRIMARY KEY,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  version INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.whatsapp_templates (
id TEXT PRIMARY KEY,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  version INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.engagement_audit (
id TEXT PRIMARY KEY,
  entity_type TEXT,
  entity_id TEXT,
  action TEXT,
  old_values JSONB,
  new_values JSONB,
  changed_fields TEXT[],
  actor_id TEXT,
  actor_name TEXT,
  ip_address TEXT,
  user_agent TEXT,
  timestamp TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  version INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_engagement_audit_entity ON public.engagement_audit (entity_type, entity_id, timestamp);
CREATE INDEX IF NOT EXISTS idx_engagement_audit_actor ON public.engagement_audit (actor_id);

CREATE TABLE IF NOT EXISTS public.messages (
id TEXT PRIMARY KEY,
  message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.work_centers (
id TEXT PRIMARY KEY,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  version INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.engagement_cashback (
id TEXT PRIMARY KEY,
  customer_id TEXT,
  amount NUMERIC(15,2),
  rate NUMERIC(15,2),
  source_transaction_id TEXT,
  source_transaction_type TEXT,
  status TEXT,
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  version INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.bank_accounts (
id TEXT PRIMARY KEY,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  version INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.sync_log (
id TEXT PRIMARY KEY,
  table_name TEXT,
  record_id TEXT,
  operation TEXT,
  changed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS public.production_class_adjustments (
id TEXT PRIMARY KEY,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  version INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.examination_job_subjects (
id TEXT PRIMARY KEY,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  version INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.income (
id TEXT PRIMARY KEY,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  version INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.reprint_jobs (
id TEXT PRIMARY KEY,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  version INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.production_pricing_audit (
id TEXT PRIMARY KEY,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  version INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.engagement_customer_rewards (
id TEXT PRIMARY KEY,
  customer_id TEXT,
  reward_type TEXT,
  reward_name TEXT,
  description TEXT,
  value NUMERIC(15,2),
  value_type TEXT,
  status TEXT,
  source TEXT,
  source_reference_id TEXT,
  expires_at TIMESTAMPTZ,
  redeemed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  version INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.work_orders (
id TEXT PRIMARY KEY,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  version INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.examination_papers (
id TEXT PRIMARY KEY,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  version INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.tasks (
id TEXT PRIMARY KEY,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  version INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.suppliers (
id TEXT PRIMARY KEY,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  version INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.production_batches (
id TEXT PRIMARY KEY,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  version INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.sales_exchanges (
id TEXT PRIMARY KEY,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  version INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.inventory_movements (
id TEXT PRIMARY KEY,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  version INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.shipments (
id TEXT PRIMARY KEY,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  version INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.production_bom_templates (
id TEXT PRIMARY KEY,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  version INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.warehouse_inventory (
id TEXT PRIMARY KEY,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  version INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.customer_payments (
id TEXT PRIMARY KEY,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  version INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.sale_items (
id TEXT PRIMARY KEY,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  version INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.vat_returns (
id TEXT PRIMARY KEY,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  version INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.portal_ticket_messages (
id TEXT PRIMARY KEY,
  ticket_id TEXT,
  sender_type TEXT,
  message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_portal_ticket_messages_ticket ON public.portal_ticket_messages (ticket_id);

CREATE TABLE IF NOT EXISTS public.user_preferences (
id TEXT PRIMARY KEY,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  version INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.examination_jobs (
id TEXT PRIMARY KEY,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  version INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.engagement_affiliate_commissions (
id TEXT PRIMARY KEY,
  affiliate_id TEXT,
  customer_id TEXT,
  referred_customer_id TEXT,
  amount NUMERIC(15,2),
  rate NUMERIC(15,2),
  source_transaction_id TEXT,
  source_transaction_type TEXT,
  status TEXT,
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  version INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.user_groups (
id TEXT PRIMARY KEY,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  version INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.promotion_redemptions (
id TEXT PRIMARY KEY,
  company_id TEXT,
  promotion_id TEXT,
  customer_id TEXT,
  source_type TEXT,
  source_id TEXT,
  source_number TEXT,
  discount_amount NUMERIC(15,2),
  subtotal_before NUMERIC(15,2),
  subtotal_after NUMERIC(15,2),
  promotion_snapshot JSONB,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  version INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT uq_promotion_redemption_source UNIQUE (promotion_id, source_id)
);
CREATE INDEX IF NOT EXISTS idx_promotion_redemptions_promo ON public.promotion_redemptions (promotion_id, created_at);
CREATE INDEX IF NOT EXISTS idx_promotion_redemptions_source ON public.promotion_redemptions (source_type, source_id);

CREATE TABLE IF NOT EXISTS public.product_variants (
id TEXT PRIMARY KEY,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  version INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.portal_users (
id TEXT PRIMARY KEY,
  customer_id TEXT,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT,
  full_name TEXT,
  phone TEXT,
  status TEXT,
  last_login_at TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  version INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_portal_users_customer ON public.portal_users (customer_id);
CREATE INDEX IF NOT EXISTS idx_portal_users_email ON public.portal_users (email);

CREATE TABLE IF NOT EXISTS public.inventory_items (
id TEXT PRIMARY KEY,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  version INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.engagement_analytics (
id TEXT PRIMARY KEY,
  customer_id TEXT,
  period TEXT,
  period_start DATE,
  period_end DATE,
  total_points_earned NUMERIC(15,2),
  total_points_redeemed NUMERIC(15,2),
  total_cashback NUMERIC(15,2),
  total_promotion_savings NUMERIC(15,2),
  total_gift_card_purchases NUMERIC(15,2),
  total_gift_card_redemptions NUMERIC(15,2),
  total_affiliate_earnings NUMERIC(15,2),
  total_rewards_redeemed INTEGER,
  visit_count INTEGER,
  purchase_count INTEGER,
  purchase_total NUMERIC(15,2),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  version INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.employees (
id TEXT PRIMARY KEY,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  version INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.bank_scheduled_payments (
id TEXT PRIMARY KEY,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  version INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.examination_batch_notifications (
id TEXT PRIMARY KEY,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  version INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.transfers (
id TEXT PRIMARY KEY,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  version INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.purchase_orders (
id TEXT PRIMARY KEY,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  version INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.inventory_transactions (
id TEXT PRIMARY KEY,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  version INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.market_adjustments (
id TEXT PRIMARY KEY,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  version INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.whatsapp_campaigns (
id TEXT PRIMARY KEY,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  version INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.material_categories (
id TEXT PRIMARY KEY,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  version INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.production_bom_template_components (
id TEXT PRIMARY KEY,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  version INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.production_resources (
id TEXT PRIMARY KEY,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  version INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.scheduled_payments (
id TEXT PRIMARY KEY,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  version INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.whatsapp_messages (
id TEXT PRIMARY KEY,
  account_id TEXT,
  user_id TEXT,
  recipient TEXT,
  message_content TEXT,
  status TEXT,
  direction TEXT,
  message_id TEXT,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  version INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_account ON public.whatsapp_messages (account_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_user ON public.whatsapp_messages (user_id);

CREATE TABLE IF NOT EXISTS public.bank_adjustments (
id TEXT PRIMARY KEY,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  version INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.engagement_points (
id TEXT PRIMARY KEY,
  customer_id TEXT,
  points NUMERIC(15,2),
  reason TEXT,
  source TEXT,
  reference_type TEXT,
  reference_id TEXT,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  version INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_engagement_points_customer ON public.engagement_points (customer_id, created_at);

CREATE TABLE IF NOT EXISTS public.departments (
id TEXT PRIMARY KEY,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  version INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.sms_campaigns (
id TEXT PRIMARY KEY,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  version INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.wallet_transactions (
id TEXT PRIMARY KEY,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  version INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.budgets (
id TEXT PRIMARY KEY,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  version INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.companies (
id TEXT PRIMARY KEY,
  company_name TEXT,
  registration_number TEXT,
  email TEXT,
  phone TEXT,
  address TEXT,
  logo_url TEXT,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  version INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.bank_reconciliations (
id TEXT PRIMARY KEY,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  version INTEGER NOT NULL DEFAULT 0
);

-- ─── 3. updated_at triggers (all tables with updated_at) ──────────────
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
        EXECUTE format('DROP TRIGGER IF EXISTS trg_update_updated_at ON %I', r.table_name);
        EXECUTE format(
            'CREATE TRIGGER trg_update_updated_at BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column()',
            r.table_name
        );
    END LOOP;
END $$;

-- ─── 4. RLS ───────────────────────────────────────────────────────────
-- Enable RLS everywhere; policy set mirrors the post-_FIX end state.
ALTER TABLE public.ticket_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.examinations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.production_batch_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.discountrules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.engagement_point_balances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.maintenance_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.engagement_timeline ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bank_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_exchange_approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_message_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.goods_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.examination_printing_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subcontract_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bank_statements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.warehouses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.engagement_membership_tiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rounding_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payroll_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.engagement_affiliates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.examination_class_adjustments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.portal_ads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supplier_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.examination_pricing_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ledger_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subjects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.classes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.production_bom_calculations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profit_margin_audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.portal_password_resets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_automations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.boms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.examination_inventory_deductions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.portal_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bank_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_allocation_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.idempotency_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.schools ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cheques ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.examination_subjects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bank_exchange_rates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bom_default_materials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vat_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.engagement_gift_cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.financial_years ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payslips ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.examination_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recurring_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.examination_invoice_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_notification_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.engagement_gift_card_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.market_adjustment_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bom_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.portal_login_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.portal_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reminders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profit_margin_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_ticket_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.engagement_customer_tiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quotations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_exchange_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscribers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.examination_bom_calculations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.examination_recurring_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bank_fees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.production_subjects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_chats ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.examination_classes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.material_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sms_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.engagement_promotions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.resource_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transaction_adjustment_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.material_reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bank_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.production_classes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bank_cash_flow_forecasts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.production_notification_audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customerpricingtiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tax_rates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.portal_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chart_of_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.engagement_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.work_centers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.engagement_cashback ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bank_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sync_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.production_class_adjustments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.examination_job_subjects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.income ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reprint_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.production_pricing_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.engagement_customer_rewards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.work_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.examination_papers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.production_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_exchanges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shipments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.production_bom_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.warehouse_inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sale_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vat_returns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.portal_ticket_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.examination_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.engagement_affiliate_commissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.promotion_redemptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_variants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.portal_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.engagement_analytics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bank_scheduled_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.examination_batch_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transfers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.market_adjustments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.material_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.production_bom_template_components ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.production_resources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scheduled_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bank_adjustments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.engagement_points ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sms_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wallet_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.budgets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bank_reconciliations ENABLE ROW LEVEL SECURITY;

-- companies
DROP POLICY IF EXISTS "Authenticated users can insert companies" ON public.companies;
CREATE POLICY "Authenticated users can insert companies"
  ON public.companies FOR INSERT TO authenticated WITH CHECK (true);

-- profiles
DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
CREATE POLICY "Users can insert own profile"
  ON public.profiles FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid()::text);

DROP POLICY IF EXISTS "Users can view profiles" ON public.profiles;
CREATE POLICY "Users can view profiles"
  ON public.profiles FOR SELECT TO authenticated
  USING (user_id = auth.uid()::text OR public.is_company_staff());

DROP POLICY IF EXISTS "Users can update profiles" ON public.profiles;
CREATE POLICY "Users can update profiles"
  ON public.profiles FOR UPDATE TO authenticated
  USING (user_id = auth.uid()::text) WITH CHECK (user_id = auth.uid()::text);

DROP POLICY IF EXISTS "Users can delete profiles" ON public.profiles;
CREATE POLICY "Users can delete profiles"
  ON public.profiles FOR DELETE TO authenticated
  USING (user_id = auth.uid()::text);

DROP POLICY IF EXISTS "restrictive_profiles_tenant" ON public.profiles;
CREATE POLICY "restrictive_profiles_tenant"
  ON public.profiles AS RESTRICTIVE FOR ALL TO authenticated
  USING (user_id = auth.uid()::text OR public.is_company_staff())
  WITH CHECK (user_id = auth.uid()::text);

-- allow_all policies (post _FIX single-company end state)
DROP POLICY IF EXISTS "allow_all_examinations" ON public.examinations;
CREATE POLICY "allow_all_examinations" ON public.examinations FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "allow_all_production_batch_notifications" ON public.production_batch_notifications;
CREATE POLICY "allow_all_production_batch_notifications" ON public.production_batch_notifications FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "allow_all_invoices" ON public.invoices;
CREATE POLICY "allow_all_invoices" ON public.invoices FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "allow_all_discountrules" ON public.discountrules;
CREATE POLICY "allow_all_discountrules" ON public.discountrules FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "allow_all_engagement_point_balances" ON public.engagement_point_balances;
CREATE POLICY "allow_all_engagement_point_balances" ON public.engagement_point_balances FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "allow_all_purchases" ON public.purchases;
CREATE POLICY "allow_all_purchases" ON public.purchases FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "allow_all_maintenance_logs" ON public.maintenance_logs;
CREATE POLICY "allow_all_maintenance_logs" ON public.maintenance_logs FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "allow_all_engagement_timeline" ON public.engagement_timeline;
CREATE POLICY "allow_all_engagement_timeline" ON public.engagement_timeline FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "allow_all_bank_transactions" ON public.bank_transactions;
CREATE POLICY "allow_all_bank_transactions" ON public.bank_transactions FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "allow_all_sales_exchange_approvals" ON public.sales_exchange_approvals;
CREATE POLICY "allow_all_sales_exchange_approvals" ON public.sales_exchange_approvals FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "allow_all_whatsapp_message_queue" ON public.whatsapp_message_queue;
CREATE POLICY "allow_all_whatsapp_message_queue" ON public.whatsapp_message_queue FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "allow_all_goods_receipts" ON public.goods_receipts;
CREATE POLICY "allow_all_goods_receipts" ON public.goods_receipts FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "allow_all_expenses" ON public.expenses;
CREATE POLICY "allow_all_expenses" ON public.expenses FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "allow_all_examination_printing_batches" ON public.examination_printing_batches;
CREATE POLICY "allow_all_examination_printing_batches" ON public.examination_printing_batches FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "allow_all_subcontract_orders" ON public.subcontract_orders;
CREATE POLICY "allow_all_subcontract_orders" ON public.subcontract_orders FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "allow_all_bank_statements" ON public.bank_statements;
CREATE POLICY "allow_all_bank_statements" ON public.bank_statements FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "allow_all_warehouses" ON public.warehouses;
CREATE POLICY "allow_all_warehouses" ON public.warehouses FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "allow_all_engagement_membership_tiers" ON public.engagement_membership_tiers;
CREATE POLICY "allow_all_engagement_membership_tiers" ON public.engagement_membership_tiers FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "allow_all_rounding_logs" ON public.rounding_logs;
CREATE POLICY "allow_all_rounding_logs" ON public.rounding_logs FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "allow_all_payroll_runs" ON public.payroll_runs;
CREATE POLICY "allow_all_payroll_runs" ON public.payroll_runs FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "allow_all_engagement_affiliates" ON public.engagement_affiliates;
CREATE POLICY "allow_all_engagement_affiliates" ON public.engagement_affiliates FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "allow_all_whatsapp_accounts" ON public.whatsapp_accounts;
CREATE POLICY "allow_all_whatsapp_accounts" ON public.whatsapp_accounts FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "allow_all_examination_class_adjustments" ON public.examination_class_adjustments;
CREATE POLICY "allow_all_examination_class_adjustments" ON public.examination_class_adjustments FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "allow_all_supplier_payments" ON public.supplier_payments;
CREATE POLICY "allow_all_supplier_payments" ON public.supplier_payments FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "allow_all_examination_pricing_audit" ON public.examination_pricing_audit;
CREATE POLICY "allow_all_examination_pricing_audit" ON public.examination_pricing_audit FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "allow_all_ledger_entries" ON public.ledger_entries;
CREATE POLICY "allow_all_ledger_entries" ON public.ledger_entries FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "allow_all_subjects" ON public.subjects;
CREATE POLICY "allow_all_subjects" ON public.subjects FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "allow_all_classes" ON public.classes;
CREATE POLICY "allow_all_classes" ON public.classes FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "allow_all_job_tickets" ON public.job_tickets;
CREATE POLICY "allow_all_job_tickets" ON public.job_tickets FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "allow_all_accounts" ON public.accounts;
CREATE POLICY "allow_all_accounts" ON public.accounts FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "allow_all_production_bom_calculations" ON public.production_bom_calculations;
CREATE POLICY "allow_all_production_bom_calculations" ON public.production_bom_calculations FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "allow_all_profit_margin_audit_logs" ON public.profit_margin_audit_logs;
CREATE POLICY "allow_all_profit_margin_audit_logs" ON public.profit_margin_audit_logs FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "allow_all_whatsapp_automations" ON public.whatsapp_automations;
CREATE POLICY "allow_all_whatsapp_automations" ON public.whatsapp_automations FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "allow_all_orders" ON public.orders;
CREATE POLICY "allow_all_orders" ON public.orders FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "allow_all_customers" ON public.customers;
CREATE POLICY "allow_all_customers" ON public.customers FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "allow_all_boms" ON public.boms;
CREATE POLICY "allow_all_boms" ON public.boms FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "allow_all_examination_inventory_deductions" ON public.examination_inventory_deductions;
CREATE POLICY "allow_all_examination_inventory_deductions" ON public.examination_inventory_deductions FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "allow_all_job_orders" ON public.job_orders;
CREATE POLICY "allow_all_job_orders" ON public.job_orders FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "allow_all_bank_categories" ON public.bank_categories;
CREATE POLICY "allow_all_bank_categories" ON public.bank_categories FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "allow_all_delivery_notes" ON public.delivery_notes;
CREATE POLICY "allow_all_delivery_notes" ON public.delivery_notes FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "allow_all_idempotency_keys" ON public.idempotency_keys;
CREATE POLICY "allow_all_idempotency_keys" ON public.idempotency_keys FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "allow_all_schools" ON public.schools;
CREATE POLICY "allow_all_schools" ON public.schools FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "allow_all_cheques" ON public.cheques;
CREATE POLICY "allow_all_cheques" ON public.cheques FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "allow_all_inventory" ON public.inventory;
CREATE POLICY "allow_all_inventory" ON public.inventory FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "allow_all_examination_subjects" ON public.examination_subjects;
CREATE POLICY "allow_all_examination_subjects" ON public.examination_subjects FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "allow_all_bank_exchange_rates" ON public.bank_exchange_rates;
CREATE POLICY "allow_all_bank_exchange_rates" ON public.bank_exchange_rates FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "allow_all_bom_default_materials" ON public.bom_default_materials;
CREATE POLICY "allow_all_bom_default_materials" ON public.bom_default_materials FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "allow_all_vat_transactions" ON public.vat_transactions;
CREATE POLICY "allow_all_vat_transactions" ON public.vat_transactions FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "allow_all_audit_logs" ON public.audit_logs;
CREATE POLICY "allow_all_audit_logs" ON public.audit_logs FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "allow_all_engagement_gift_cards" ON public.engagement_gift_cards;
CREATE POLICY "allow_all_engagement_gift_cards" ON public.engagement_gift_cards FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "allow_all_financial_years" ON public.financial_years;
CREATE POLICY "allow_all_financial_years" ON public.financial_years FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "allow_all_payslips" ON public.payslips;
CREATE POLICY "allow_all_payslips" ON public.payslips FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "allow_all_examination_batches" ON public.examination_batches;
CREATE POLICY "allow_all_examination_batches" ON public.examination_batches FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "allow_all_recurring_invoices" ON public.recurring_invoices;
CREATE POLICY "allow_all_recurring_invoices" ON public.recurring_invoices FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "allow_all_examination_invoice_groups" ON public.examination_invoice_groups;
CREATE POLICY "allow_all_examination_invoice_groups" ON public.examination_invoice_groups FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "allow_all_customer_notification_logs" ON public.customer_notification_logs;
CREATE POLICY "allow_all_customer_notification_logs" ON public.customer_notification_logs FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "allow_all_engagement_gift_card_transactions" ON public.engagement_gift_card_transactions;
CREATE POLICY "allow_all_engagement_gift_card_transactions" ON public.engagement_gift_card_transactions FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "allow_all_market_adjustment_transactions" ON public.market_adjustment_transactions;
CREATE POLICY "allow_all_market_adjustment_transactions" ON public.market_adjustment_transactions FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "allow_all_bom_templates" ON public.bom_templates;
CREATE POLICY "allow_all_bom_templates" ON public.bom_templates FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "allow_all_documents" ON public.documents;
CREATE POLICY "allow_all_documents" ON public.documents FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "allow_all_notification_audit_logs" ON public.notification_audit_logs;
CREATE POLICY "allow_all_notification_audit_logs" ON public.notification_audit_logs FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "allow_all_reminders" ON public.reminders;
CREATE POLICY "allow_all_reminders" ON public.reminders FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "allow_all_profit_margin_settings" ON public.profit_margin_settings;
CREATE POLICY "allow_all_profit_margin_settings" ON public.profit_margin_settings FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "allow_all_assets" ON public.assets;
CREATE POLICY "allow_all_assets" ON public.assets FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "allow_all_job_ticket_settings" ON public.job_ticket_settings;
CREATE POLICY "allow_all_job_ticket_settings" ON public.job_ticket_settings FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "allow_all_settings" ON public.settings;
CREATE POLICY "allow_all_settings" ON public.settings FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "allow_all_engagement_customer_tiers" ON public.engagement_customer_tiers;
CREATE POLICY "allow_all_engagement_customer_tiers" ON public.engagement_customer_tiers FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "allow_all_quotations" ON public.quotations;
CREATE POLICY "allow_all_quotations" ON public.quotations FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "allow_all_sales_exchange_items" ON public.sales_exchange_items;
CREATE POLICY "allow_all_sales_exchange_items" ON public.sales_exchange_items FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "allow_all_subscribers" ON public.subscribers;
CREATE POLICY "allow_all_subscribers" ON public.subscribers FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "allow_all_examination_bom_calculations" ON public.examination_bom_calculations;
CREATE POLICY "allow_all_examination_bom_calculations" ON public.examination_bom_calculations FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "allow_all_examination_recurring_profiles" ON public.examination_recurring_profiles;
CREATE POLICY "allow_all_examination_recurring_profiles" ON public.examination_recurring_profiles FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "allow_all_bank_fees" ON public.bank_fees;
CREATE POLICY "allow_all_bank_fees" ON public.bank_fees FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "allow_all_production_subjects" ON public.production_subjects;
CREATE POLICY "allow_all_production_subjects" ON public.production_subjects FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "allow_all_whatsapp_chats" ON public.whatsapp_chats;
CREATE POLICY "allow_all_whatsapp_chats" ON public.whatsapp_chats FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "allow_all_products" ON public.products;
CREATE POLICY "allow_all_products" ON public.products FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "allow_all_examination_classes" ON public.examination_classes;
CREATE POLICY "allow_all_examination_classes" ON public.examination_classes FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "allow_all_material_batches" ON public.material_batches;
CREATE POLICY "allow_all_material_batches" ON public.material_batches FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "allow_all_sms_templates" ON public.sms_templates;
CREATE POLICY "allow_all_sms_templates" ON public.sms_templates FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "allow_all_engagement_promotions" ON public.engagement_promotions;
CREATE POLICY "allow_all_engagement_promotions" ON public.engagement_promotions FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "allow_all_resource_allocations" ON public.resource_allocations;
CREATE POLICY "allow_all_resource_allocations" ON public.resource_allocations FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "allow_all_sales_orders" ON public.sales_orders;
CREATE POLICY "allow_all_sales_orders" ON public.sales_orders FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "allow_all_sales" ON public.sales;
CREATE POLICY "allow_all_sales" ON public.sales FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "allow_all_transaction_adjustment_snapshots" ON public.transaction_adjustment_snapshots;
CREATE POLICY "allow_all_transaction_adjustment_snapshots" ON public.transaction_adjustment_snapshots FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "allow_all_material_reservations" ON public.material_reservations;
CREATE POLICY "allow_all_material_reservations" ON public.material_reservations FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "allow_all_bank_alerts" ON public.bank_alerts;
CREATE POLICY "allow_all_bank_alerts" ON public.bank_alerts FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "allow_all_production_classes" ON public.production_classes;
CREATE POLICY "allow_all_production_classes" ON public.production_classes FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "allow_all_bank_cash_flow_forecasts" ON public.bank_cash_flow_forecasts;
CREATE POLICY "allow_all_bank_cash_flow_forecasts" ON public.bank_cash_flow_forecasts FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "allow_all_production_notification_audit_logs" ON public.production_notification_audit_logs;
CREATE POLICY "allow_all_production_notification_audit_logs" ON public.production_notification_audit_logs FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "allow_all_customerpricingtiers" ON public.customerpricingtiers;
CREATE POLICY "allow_all_customerpricingtiers" ON public.customerpricingtiers FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "allow_all_tax_rates" ON public.tax_rates;
CREATE POLICY "allow_all_tax_rates" ON public.tax_rates FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "allow_all_chart_of_accounts" ON public.chart_of_accounts;
CREATE POLICY "allow_all_chart_of_accounts" ON public.chart_of_accounts FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "allow_all_whatsapp_templates" ON public.whatsapp_templates;
CREATE POLICY "allow_all_whatsapp_templates" ON public.whatsapp_templates FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "allow_all_engagement_audit" ON public.engagement_audit;
CREATE POLICY "allow_all_engagement_audit" ON public.engagement_audit FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "allow_all_messages" ON public.messages;
CREATE POLICY "allow_all_messages" ON public.messages FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "allow_all_work_centers" ON public.work_centers;
CREATE POLICY "allow_all_work_centers" ON public.work_centers FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "allow_all_engagement_cashback" ON public.engagement_cashback;
CREATE POLICY "allow_all_engagement_cashback" ON public.engagement_cashback FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "allow_all_bank_accounts" ON public.bank_accounts;
CREATE POLICY "allow_all_bank_accounts" ON public.bank_accounts FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "allow_all_sync_log" ON public.sync_log;
CREATE POLICY "allow_all_sync_log" ON public.sync_log FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "allow_all_production_class_adjustments" ON public.production_class_adjustments;
CREATE POLICY "allow_all_production_class_adjustments" ON public.production_class_adjustments FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "allow_all_examination_job_subjects" ON public.examination_job_subjects;
CREATE POLICY "allow_all_examination_job_subjects" ON public.examination_job_subjects FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "allow_all_income" ON public.income;
CREATE POLICY "allow_all_income" ON public.income FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "allow_all_reprint_jobs" ON public.reprint_jobs;
CREATE POLICY "allow_all_reprint_jobs" ON public.reprint_jobs FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "allow_all_production_pricing_audit" ON public.production_pricing_audit;
CREATE POLICY "allow_all_production_pricing_audit" ON public.production_pricing_audit FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "allow_all_engagement_customer_rewards" ON public.engagement_customer_rewards;
CREATE POLICY "allow_all_engagement_customer_rewards" ON public.engagement_customer_rewards FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "allow_all_work_orders" ON public.work_orders;
CREATE POLICY "allow_all_work_orders" ON public.work_orders FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "allow_all_examination_papers" ON public.examination_papers;
CREATE POLICY "allow_all_examination_papers" ON public.examination_papers FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "allow_all_tasks" ON public.tasks;
CREATE POLICY "allow_all_tasks" ON public.tasks FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "allow_all_suppliers" ON public.suppliers;
CREATE POLICY "allow_all_suppliers" ON public.suppliers FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "allow_all_production_batches" ON public.production_batches;
CREATE POLICY "allow_all_production_batches" ON public.production_batches FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "allow_all_sales_exchanges" ON public.sales_exchanges;
CREATE POLICY "allow_all_sales_exchanges" ON public.sales_exchanges FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "allow_all_inventory_movements" ON public.inventory_movements;
CREATE POLICY "allow_all_inventory_movements" ON public.inventory_movements FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "allow_all_shipments" ON public.shipments;
CREATE POLICY "allow_all_shipments" ON public.shipments FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "allow_all_production_bom_templates" ON public.production_bom_templates;
CREATE POLICY "allow_all_production_bom_templates" ON public.production_bom_templates FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "allow_all_warehouse_inventory" ON public.warehouse_inventory;
CREATE POLICY "allow_all_warehouse_inventory" ON public.warehouse_inventory FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "allow_all_customer_payments" ON public.customer_payments;
CREATE POLICY "allow_all_customer_payments" ON public.customer_payments FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "allow_all_sale_items" ON public.sale_items;
CREATE POLICY "allow_all_sale_items" ON public.sale_items FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "allow_all_vat_returns" ON public.vat_returns;
CREATE POLICY "allow_all_vat_returns" ON public.vat_returns FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "allow_all_user_preferences" ON public.user_preferences;
CREATE POLICY "allow_all_user_preferences" ON public.user_preferences FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "allow_all_examination_jobs" ON public.examination_jobs;
CREATE POLICY "allow_all_examination_jobs" ON public.examination_jobs FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "allow_all_engagement_affiliate_commissions" ON public.engagement_affiliate_commissions;
CREATE POLICY "allow_all_engagement_affiliate_commissions" ON public.engagement_affiliate_commissions FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "allow_all_user_groups" ON public.user_groups;
CREATE POLICY "allow_all_user_groups" ON public.user_groups FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "allow_all_product_variants" ON public.product_variants;
CREATE POLICY "allow_all_product_variants" ON public.product_variants FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "allow_all_inventory_items" ON public.inventory_items;
CREATE POLICY "allow_all_inventory_items" ON public.inventory_items FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "allow_all_engagement_analytics" ON public.engagement_analytics;
CREATE POLICY "allow_all_engagement_analytics" ON public.engagement_analytics FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "allow_all_employees" ON public.employees;
CREATE POLICY "allow_all_employees" ON public.employees FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "allow_all_bank_scheduled_payments" ON public.bank_scheduled_payments;
CREATE POLICY "allow_all_bank_scheduled_payments" ON public.bank_scheduled_payments FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "allow_all_examination_batch_notifications" ON public.examination_batch_notifications;
CREATE POLICY "allow_all_examination_batch_notifications" ON public.examination_batch_notifications FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "allow_all_transfers" ON public.transfers;
CREATE POLICY "allow_all_transfers" ON public.transfers FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "allow_all_purchase_orders" ON public.purchase_orders;
CREATE POLICY "allow_all_purchase_orders" ON public.purchase_orders FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "allow_all_inventory_transactions" ON public.inventory_transactions;
CREATE POLICY "allow_all_inventory_transactions" ON public.inventory_transactions FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "allow_all_market_adjustments" ON public.market_adjustments;
CREATE POLICY "allow_all_market_adjustments" ON public.market_adjustments FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "allow_all_whatsapp_campaigns" ON public.whatsapp_campaigns;
CREATE POLICY "allow_all_whatsapp_campaigns" ON public.whatsapp_campaigns FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "allow_all_material_categories" ON public.material_categories;
CREATE POLICY "allow_all_material_categories" ON public.material_categories FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "allow_all_production_bom_template_components" ON public.production_bom_template_components;
CREATE POLICY "allow_all_production_bom_template_components" ON public.production_bom_template_components FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "allow_all_production_resources" ON public.production_resources;
CREATE POLICY "allow_all_production_resources" ON public.production_resources FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "allow_all_scheduled_payments" ON public.scheduled_payments;
CREATE POLICY "allow_all_scheduled_payments" ON public.scheduled_payments FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "allow_all_whatsapp_messages" ON public.whatsapp_messages;
CREATE POLICY "allow_all_whatsapp_messages" ON public.whatsapp_messages FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "allow_all_bank_adjustments" ON public.bank_adjustments;
CREATE POLICY "allow_all_bank_adjustments" ON public.bank_adjustments FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "allow_all_engagement_points" ON public.engagement_points;
CREATE POLICY "allow_all_engagement_points" ON public.engagement_points FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "allow_all_departments" ON public.departments;
CREATE POLICY "allow_all_departments" ON public.departments FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "allow_all_sms_campaigns" ON public.sms_campaigns;
CREATE POLICY "allow_all_sms_campaigns" ON public.sms_campaigns FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "allow_all_wallet_transactions" ON public.wallet_transactions;
CREATE POLICY "allow_all_wallet_transactions" ON public.wallet_transactions FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "allow_all_budgets" ON public.budgets;
CREATE POLICY "allow_all_budgets" ON public.budgets FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "allow_all_bank_reconciliations" ON public.bank_reconciliations;
CREATE POLICY "allow_all_bank_reconciliations" ON public.bank_reconciliations FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- portal auth tables
DROP POLICY IF EXISTS "Portal auth: manage portal_users" ON public.portal_users;
CREATE POLICY "Portal auth: manage portal_users"
  ON public.portal_users FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Portal auth: manage portal_sessions" ON public.portal_sessions;
CREATE POLICY "Portal auth: manage portal_sessions"
  ON public.portal_sessions FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Portal auth: manage portal_password_resets" ON public.portal_password_resets;
CREATE POLICY "Portal auth: manage portal_password_resets"
  ON public.portal_password_resets FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Portal auth: manage portal_login_history" ON public.portal_login_history;
CREATE POLICY "Portal auth: manage portal_login_history"
  ON public.portal_login_history FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- portal_ads (company-scoped)
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

-- portal tickets/support (customer-scoped)
DROP POLICY IF EXISTS "portal_tickets_customer_isolation" ON public.portal_tickets;
CREATE POLICY "portal_tickets_customer_isolation"
  ON public.portal_tickets FOR ALL TO authenticated
  USING (customer_id = (SELECT customer_id FROM public.portal_users WHERE id = auth.uid()::text))
  WITH CHECK (customer_id = (SELECT customer_id FROM public.portal_users WHERE id = auth.uid()::text));

DROP POLICY IF EXISTS "portal_ticket_messages_customer_isolation" ON public.portal_ticket_messages;
CREATE POLICY "portal_ticket_messages_customer_isolation"
  ON public.portal_ticket_messages FOR ALL TO authenticated
  USING (ticket_id IN (SELECT id FROM public.portal_tickets WHERE customer_id = (SELECT customer_id FROM public.portal_users WHERE id = auth.uid()::text)))
  WITH CHECK (ticket_id IN (SELECT id FROM public.portal_tickets WHERE customer_id = (SELECT customer_id FROM public.portal_users WHERE id = auth.uid()::text)));

DROP POLICY IF EXISTS "ticket_attachments_customer_isolation" ON public.ticket_attachments;
CREATE POLICY "ticket_attachments_customer_isolation"
  ON public.ticket_attachments FOR ALL TO authenticated
  USING (ticket_id IN (SELECT id FROM public.portal_tickets WHERE customer_id = (SELECT customer_id FROM public.portal_users WHERE id = auth.uid()::text)))
  WITH CHECK (ticket_id IN (SELECT id FROM public.portal_tickets WHERE customer_id = (SELECT customer_id FROM public.portal_users WHERE id = auth.uid()::text)));

DROP POLICY IF EXISTS "portal_notifications_customer_isolation" ON public.portal_notifications;
CREATE POLICY "portal_notifications_customer_isolation"
  ON public.portal_notifications FOR ALL TO authenticated
  USING (portal_user_id IN (SELECT id FROM public.portal_users WHERE customer_id = (SELECT customer_id FROM public.portal_users WHERE id = auth.uid()::text)))
  WITH CHECK (portal_user_id IN (SELECT id FROM public.portal_users WHERE customer_id = (SELECT customer_id FROM public.portal_users WHERE id = auth.uid()::text)));

-- payment allocations
DROP POLICY IF EXISTS "payment_allocations_tenant_isolation" ON public.payment_allocations;
CREATE POLICY "payment_allocations_tenant_isolation"
  ON public.payment_allocations FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.user_id = auth.uid()::text))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.user_id = auth.uid()::text));

DROP POLICY IF EXISTS "payment_allocation_lines_tenant_isolation" ON public.payment_allocation_lines;
CREATE POLICY "payment_allocation_lines_tenant_isolation"
  ON public.payment_allocation_lines FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.user_id = auth.uid()::text))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.user_id = auth.uid()::text));

-- promotions
DROP POLICY IF EXISTS engagement_promotions_company_delete ON public.engagement_promotions;
CREATE POLICY engagement_promotions_company_delete ON public.engagement_promotions
  FOR DELETE USING (company_id = get_current_company_id());

DROP POLICY IF EXISTS promotion_redemptions_select ON public.promotion_redemptions;
CREATE POLICY promotion_redemptions_select ON public.promotion_redemptions
  FOR SELECT USING (company_id = get_current_company_id());

DROP POLICY IF EXISTS promotion_redemptions_insert ON public.promotion_redemptions;
CREATE POLICY promotion_redemptions_insert ON public.promotion_redemptions
  FOR INSERT WITH CHECK (company_id = get_current_company_id());

-- ─── 5. Realtime publication membership (idempotent) ──────────────────
DO $$
DECLARE
  r RECORD;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    FOR r IN
      SELECT tablename FROM pg_tables WHERE schemaname = 'public'
    LOOP
      BEGIN
        EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', r.tablename);
      EXCEPTION WHEN duplicate_object THEN
        NULL;
      END;
    END LOOP;
  END IF;
END $$;

-- Done. Baseline reproduces the live schema captured 2026-08-11.