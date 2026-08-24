-- Customer Engagement Platform (CEP) Tables
-- Run after supabase-referral-tables-v2.sql

-- Helper function for reading current company ID with fallback to get_user_company_id()
CREATE OR REPLACE FUNCTION public.get_current_company_id()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    NULLIF(current_setting('app.company_id', TRUE), '')::TEXT,
    public.get_user_company_id()
  );
$$;

GRANT EXECUTE ON FUNCTION public.get_current_company_id() TO authenticated, anon, service_role;

-- 1. Engagement Timeline (Unified)
DROP TABLE IF EXISTS engagement_timeline CASCADE;
CREATE TABLE engagement_timeline (
    id TEXT PRIMARY KEY,
    customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    event_type TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    amount NUMERIC(15,2),
    points NUMERIC(15,2),
    tier_name TEXT,
    reference_type TEXT NOT NULL,
    reference_id TEXT NOT NULL,
    metadata JSONB DEFAULT '{}',
    actor_id TEXT,
    actor_name TEXT,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    company_id TEXT REFERENCES company_config(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_engagement_timeline_customer ON engagement_timeline(customer_id, timestamp);
CREATE INDEX IF NOT EXISTS idx_engagement_timeline_event ON engagement_timeline(event_type);
CREATE INDEX IF NOT EXISTS idx_engagement_timeline_ref ON engagement_timeline(reference_type, reference_id);

ALTER TABLE engagement_timeline ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS engagement_timeline_company ON engagement_timeline;
CREATE POLICY engagement_timeline_company ON engagement_timeline
    USING (company_id = get_current_company_id() OR customer_id IN (SELECT id FROM customers WHERE company_id IS NOT NULL));

DROP POLICY IF EXISTS engagement_timeline_company_insert ON engagement_timeline;
CREATE POLICY engagement_timeline_company_insert ON engagement_timeline
    FOR INSERT WITH CHECK (company_id = get_current_company_id());

-- 2. Engagement Audit (Unified)
DROP TABLE IF EXISTS engagement_audit CASCADE;
CREATE TABLE engagement_audit (
    id TEXT PRIMARY KEY,
    entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    action TEXT NOT NULL,
    old_values JSONB DEFAULT '{}',
    new_values JSONB DEFAULT '{}',
    changed_fields TEXT[] DEFAULT '{}',
    actor_id TEXT,
    actor_name TEXT,
    ip_address TEXT,
    user_agent TEXT,
    company_id TEXT REFERENCES company_config(id) ON DELETE CASCADE,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_engagement_audit_entity ON engagement_audit(entity_type, entity_id, timestamp);
CREATE INDEX IF NOT EXISTS idx_engagement_audit_action ON engagement_audit(action);
CREATE INDEX IF NOT EXISTS idx_engagement_audit_actor ON engagement_audit(actor_id);

ALTER TABLE engagement_audit ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS engagement_audit_company ON engagement_audit;
CREATE POLICY engagement_audit_company ON engagement_audit
    USING (company_id = get_current_company_id());

DROP POLICY IF EXISTS engagement_audit_company_insert ON engagement_audit;
CREATE POLICY engagement_audit_company_insert ON engagement_audit
    FOR INSERT WITH CHECK (company_id = get_current_company_id());

-- 3. Points & Point Balances
DROP TABLE IF EXISTS engagement_points CASCADE;
CREATE TABLE engagement_points (
    id TEXT PRIMARY KEY,
    customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    points NUMERIC(15,2) NOT NULL,
    reason TEXT NOT NULL,
    source TEXT NOT NULL DEFAULT 'manual',
    reference_type TEXT,
    reference_id TEXT,
    expires_at TIMESTAMPTZ,
    company_id TEXT REFERENCES company_config(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_engagement_points_customer ON engagement_points(customer_id, created_at);

ALTER TABLE engagement_points ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS engagement_points_company ON engagement_points;
CREATE POLICY engagement_points_company ON engagement_points
    USING (company_id = get_current_company_id());

DROP POLICY IF EXISTS engagement_points_company_insert ON engagement_points;
CREATE POLICY engagement_points_company_insert ON engagement_points
    FOR INSERT WITH CHECK (company_id = get_current_company_id());

DROP TABLE IF EXISTS engagement_point_balances CASCADE;
CREATE TABLE engagement_point_balances (
    id TEXT PRIMARY KEY,
    customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE UNIQUE,
    balance NUMERIC(15,2) NOT NULL DEFAULT 0,
    lifetime_earned NUMERIC(15,2) NOT NULL DEFAULT 0,
    lifetime_redeemed NUMERIC(15,2) NOT NULL DEFAULT 0,
    lifetime_expired NUMERIC(15,2) NOT NULL DEFAULT 0,
    last_updated TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    company_id TEXT REFERENCES company_config(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_engagement_balances_customer ON engagement_point_balances(customer_id);

ALTER TABLE engagement_point_balances ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS engagement_balances_company ON engagement_point_balances;
CREATE POLICY engagement_balances_company ON engagement_point_balances
    USING (company_id = get_current_company_id());

DROP POLICY IF EXISTS engagement_balances_company_insert ON engagement_point_balances;
CREATE POLICY engagement_balances_company_insert ON engagement_point_balances
    FOR INSERT WITH CHECK (company_id = get_current_company_id());

-- 4. Cashback
DROP TABLE IF EXISTS engagement_cashback CASCADE;
CREATE TABLE engagement_cashback (
    id TEXT PRIMARY KEY,
    customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    amount NUMERIC(15,2) NOT NULL,
    rate NUMERIC(5,4) NOT NULL,
    source_transaction_id TEXT,
    source_transaction_type TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    paid_at TIMESTAMPTZ,
    company_id TEXT REFERENCES company_config(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_engagement_cashback_customer ON engagement_cashback(customer_id);
CREATE INDEX IF NOT EXISTS idx_engagement_cashback_status ON engagement_cashback(status);

ALTER TABLE engagement_cashback ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS engagement_cashback_company ON engagement_cashback;
CREATE POLICY engagement_cashback_company ON engagement_cashback
    USING (company_id = get_current_company_id());

DROP POLICY IF EXISTS engagement_cashback_company_insert ON engagement_cashback;
CREATE POLICY engagement_cashback_company_insert ON engagement_cashback
    FOR INSERT WITH CHECK (company_id = get_current_company_id());

-- 5. Membership Tiers & Customer Tiers
DROP TABLE IF EXISTS engagement_membership_tiers CASCADE;
CREATE TABLE engagement_membership_tiers (
    id TEXT PRIMARY KEY,
    company_id TEXT NOT NULL REFERENCES company_config(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    slug TEXT NOT NULL,
    level INTEGER NOT NULL DEFAULT 0,
    min_points NUMERIC(15,2) NOT NULL DEFAULT 0,
    max_points NUMERIC(15,2),
    benefits JSONB DEFAULT '{}',
    color TEXT DEFAULT '#6366f1',
    icon TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(company_id, slug)
);

CREATE INDEX IF NOT EXISTS idx_engagement_tiers_level ON engagement_membership_tiers(level);

ALTER TABLE engagement_membership_tiers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS engagement_tiers_company ON engagement_membership_tiers;
CREATE POLICY engagement_tiers_company ON engagement_membership_tiers
    USING (company_id = get_current_company_id());

DROP POLICY IF EXISTS engagement_tiers_company_insert ON engagement_membership_tiers;
CREATE POLICY engagement_tiers_company_insert ON engagement_membership_tiers
    FOR INSERT WITH CHECK (company_id = get_current_company_id());

DROP TABLE IF EXISTS engagement_customer_tiers CASCADE;
CREATE TABLE engagement_customer_tiers (
    id TEXT PRIMARY KEY,
    customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    tier_id TEXT NOT NULL REFERENCES engagement_membership_tiers(id) ON DELETE CASCADE,
    tier_name TEXT NOT NULL,
    tier_level INTEGER NOT NULL DEFAULT 0,
    assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ,
    is_current BOOLEAN NOT NULL DEFAULT true,
    company_id TEXT REFERENCES company_config(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_engagement_customer_tiers_customer ON engagement_customer_tiers(customer_id, is_current);
CREATE INDEX IF NOT EXISTS idx_engagement_customer_tiers_tier ON engagement_customer_tiers(tier_id);

ALTER TABLE engagement_customer_tiers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS engagement_customer_tiers_company ON engagement_customer_tiers;
CREATE POLICY engagement_customer_tiers_company ON engagement_customer_tiers
    USING (company_id = get_current_company_id() OR customer_id IN (SELECT id FROM customers WHERE company_id IS NOT NULL));

DROP POLICY IF EXISTS engagement_customer_tiers_company_insert ON engagement_customer_tiers;
CREATE POLICY engagement_customer_tiers_company_insert ON engagement_customer_tiers
    FOR INSERT WITH CHECK (company_id = get_current_company_id());

-- 6. Gift Cards & Gift Card Transactions
DROP TABLE IF EXISTS engagement_gift_cards CASCADE;
CREATE TABLE engagement_gift_cards (
    id TEXT PRIMARY KEY,
    code TEXT NOT NULL UNIQUE,
    original_balance NUMERIC(15,2) NOT NULL,
    current_balance NUMERIC(15,2) NOT NULL,
    currency TEXT NOT NULL DEFAULT 'PHP',
    issuer_customer_id TEXT REFERENCES customers(id) ON DELETE SET NULL,
    recipient_customer_id TEXT REFERENCES customers(id) ON DELETE SET NULL,
    recipient_email TEXT,
    recipient_name TEXT,
    message TEXT,
    status TEXT NOT NULL DEFAULT 'active',
    expires_at TIMESTAMPTZ,
    company_id TEXT REFERENCES company_config(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_engagement_gift_cards_code ON engagement_gift_cards(code);
CREATE INDEX IF NOT EXISTS idx_engagement_gift_cards_issuer ON engagement_gift_cards(issuer_customer_id);
CREATE INDEX IF NOT EXISTS idx_engagement_gift_cards_recipient ON engagement_gift_cards(recipient_customer_id);

ALTER TABLE engagement_gift_cards ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS engagement_gift_cards_company ON engagement_gift_cards;
CREATE POLICY engagement_gift_cards_company ON engagement_gift_cards
    USING (company_id = get_current_company_id());

DROP POLICY IF EXISTS engagement_gift_cards_company_insert ON engagement_gift_cards;
CREATE POLICY engagement_gift_cards_company_insert ON engagement_gift_cards
    FOR INSERT WITH CHECK (company_id = get_current_company_id());

DROP TABLE IF EXISTS engagement_gift_card_transactions CASCADE;
CREATE TABLE engagement_gift_card_transactions (
    id TEXT PRIMARY KEY,
    gift_card_id TEXT NOT NULL REFERENCES engagement_gift_cards(id) ON DELETE CASCADE,
    customer_id TEXT REFERENCES customers(id) ON DELETE SET NULL,
    transaction_type TEXT NOT NULL,
    amount NUMERIC(15,2) NOT NULL,
    balance_before NUMERIC(15,2) NOT NULL,
    balance_after NUMERIC(15,2) NOT NULL,
    reference_type TEXT,
    reference_id TEXT,
    company_id TEXT REFERENCES company_config(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_engagement_gc_tx_giftcard ON engagement_gift_card_transactions(gift_card_id);
CREATE INDEX IF NOT EXISTS idx_engagement_gc_tx_customer ON engagement_gift_card_transactions(customer_id);

ALTER TABLE engagement_gift_card_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS engagement_gc_tx_company ON engagement_gift_card_transactions;
CREATE POLICY engagement_gc_tx_company ON engagement_gift_card_transactions
    USING (company_id = get_current_company_id());

DROP POLICY IF EXISTS engagement_gc_tx_company_insert ON engagement_gift_card_transactions;
CREATE POLICY engagement_gc_tx_company_insert ON engagement_gift_card_transactions
    FOR INSERT WITH CHECK (company_id = get_current_company_id());

-- 7. Affiliate Accounts & Commissions
DROP TABLE IF EXISTS engagement_affiliates CASCADE;
CREATE TABLE engagement_affiliates (
    id TEXT PRIMARY KEY,
    customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE UNIQUE,
    affiliate_code TEXT NOT NULL UNIQUE,
    referral_link TEXT,
    total_earned NUMERIC(15,2) NOT NULL DEFAULT 0,
    total_paid NUMERIC(15,2) NOT NULL DEFAULT 0,
    total_pending NUMERIC(15,2) NOT NULL DEFAULT 0,
    referral_count INTEGER NOT NULL DEFAULT 0,
    conversion_count INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'active',
    commission_rate NUMERIC(5,4) DEFAULT 0.0500,
    company_id TEXT REFERENCES company_config(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_engagement_affiliates_code ON engagement_affiliates(affiliate_code);
CREATE INDEX IF NOT EXISTS idx_engagement_affiliates_customer ON engagement_affiliates(customer_id);
CREATE INDEX IF NOT EXISTS idx_engagement_affiliates_status ON engagement_affiliates(status);

ALTER TABLE engagement_affiliates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS engagement_affiliates_company ON engagement_affiliates;
CREATE POLICY engagement_affiliates_company ON engagement_affiliates
    USING (company_id = get_current_company_id() OR customer_id IN (SELECT id FROM customers WHERE company_id IS NOT NULL));

DROP POLICY IF EXISTS engagement_affiliates_company_insert ON engagement_affiliates;
CREATE POLICY engagement_affiliates_company_insert ON engagement_affiliates
    FOR INSERT WITH CHECK (company_id = get_current_company_id());

DROP TABLE IF EXISTS engagement_affiliate_commissions CASCADE;
CREATE TABLE engagement_affiliate_commissions (
    id TEXT PRIMARY KEY,
    affiliate_id TEXT NOT NULL REFERENCES engagement_affiliates(id) ON DELETE CASCADE,
    customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    referred_customer_id TEXT REFERENCES customers(id) ON DELETE SET NULL,
    amount NUMERIC(15,2) NOT NULL,
    rate NUMERIC(5,4) NOT NULL,
    source_transaction_id TEXT,
    source_transaction_type TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    paid_at TIMESTAMPTZ,
    company_id TEXT REFERENCES company_config(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_engagement_aff_comm_affiliate ON engagement_affiliate_commissions(affiliate_id);
CREATE INDEX IF NOT EXISTS idx_engagement_aff_comm_status ON engagement_affiliate_commissions(status);

ALTER TABLE engagement_affiliate_commissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS engagement_aff_comm_company ON engagement_affiliate_commissions;
CREATE POLICY engagement_aff_comm_company ON engagement_affiliate_commissions
    USING (company_id = get_current_company_id());

DROP POLICY IF EXISTS engagement_aff_comm_company_insert ON engagement_affiliate_commissions;
CREATE POLICY engagement_aff_comm_company_insert ON engagement_affiliate_commissions
    FOR INSERT WITH CHECK (company_id = get_current_company_id());

-- 8. Promotions
DROP TABLE IF EXISTS engagement_promotions CASCADE;
CREATE TABLE engagement_promotions (
    id TEXT PRIMARY KEY,
    company_id TEXT NOT NULL REFERENCES company_config(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    type TEXT NOT NULL,
    value NUMERIC(15,2) NOT NULL,
    value_type TEXT NOT NULL DEFAULT 'percentage',
    code TEXT,
    usage_limit INTEGER,
    used_count INTEGER NOT NULL DEFAULT 0,
    per_customer_limit INTEGER DEFAULT 1,
    min_order_amount NUMERIC(15,2),
    max_discount_amount NUMERIC(15,2),
    applicable_products TEXT[] DEFAULT '{}',
    applicable_categories TEXT[] DEFAULT '{}',
    applicable_tiers TEXT[] DEFAULT '{}',
    starts_at TIMESTAMPTZ NOT NULL,
    ends_at TIMESTAMPTZ,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_engagement_promotions_code ON engagement_promotions(code);
CREATE INDEX IF NOT EXISTS idx_engagement_promotions_type ON engagement_promotions(type);
CREATE INDEX IF NOT EXISTS idx_engagement_promotions_active ON engagement_promotions(is_active);
CREATE INDEX IF NOT EXISTS idx_engagement_promotions_dates ON engagement_promotions(starts_at, ends_at);

ALTER TABLE engagement_promotions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS engagement_promotions_company ON engagement_promotions;
CREATE POLICY engagement_promotions_company ON engagement_promotions
    USING (company_id = get_current_company_id());

DROP POLICY IF EXISTS engagement_promotions_company_insert ON engagement_promotions;
CREATE POLICY engagement_promotions_company_insert ON engagement_promotions
    FOR INSERT WITH CHECK (company_id = get_current_company_id());

-- 9. Customer Rewards
DROP TABLE IF EXISTS engagement_customer_rewards CASCADE;
CREATE TABLE engagement_customer_rewards (
    id TEXT PRIMARY KEY,
    customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    reward_type TEXT NOT NULL,
    reward_name TEXT NOT NULL,
    description TEXT,
    value NUMERIC(15,2) NOT NULL DEFAULT 0,
    value_type TEXT NOT NULL DEFAULT 'fixed',
    status TEXT NOT NULL DEFAULT 'available',
    source TEXT NOT NULL,
    source_reference_id TEXT,
    expires_at TIMESTAMPTZ,
    redeemed_at TIMESTAMPTZ,
    company_id TEXT REFERENCES company_config(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_engagement_cust_rewards_customer ON engagement_customer_rewards(customer_id);
CREATE INDEX IF NOT EXISTS idx_engagement_cust_rewards_type ON engagement_customer_rewards(reward_type);
CREATE INDEX IF NOT EXISTS idx_engagement_cust_rewards_status ON engagement_customer_rewards(status);

ALTER TABLE engagement_customer_rewards ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS engagement_cust_rewards_company ON engagement_customer_rewards;
CREATE POLICY engagement_cust_rewards_company ON engagement_customer_rewards
    USING (company_id = get_current_company_id() OR customer_id IN (SELECT id FROM customers WHERE company_id IS NOT NULL));

DROP POLICY IF EXISTS engagement_cust_rewards_company_insert ON engagement_customer_rewards;
CREATE POLICY engagement_cust_rewards_company_insert ON engagement_customer_rewards
    FOR INSERT WITH CHECK (company_id = get_current_company_id());

-- 10. Engagement Analytics (Materialized / Aggregated)
DROP TABLE IF EXISTS engagement_analytics CASCADE;
CREATE TABLE engagement_analytics (
    id TEXT PRIMARY KEY,
    customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    period TEXT NOT NULL,
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    total_points_earned NUMERIC(15,2) NOT NULL DEFAULT 0,
    total_points_redeemed NUMERIC(15,2) NOT NULL DEFAULT 0,
    total_cashback NUMERIC(15,2) NOT NULL DEFAULT 0,
    total_promotion_savings NUMERIC(15,2) NOT NULL DEFAULT 0,
    total_gift_card_purchases NUMERIC(15,2) NOT NULL DEFAULT 0,
    total_gift_card_redemptions NUMERIC(15,2) NOT NULL DEFAULT 0,
    total_affiliate_earnings NUMERIC(15,2) NOT NULL DEFAULT 0,
    total_rewards_redeemed INTEGER NOT NULL DEFAULT 0,
    visit_count INTEGER NOT NULL DEFAULT 0,
    purchase_count INTEGER NOT NULL DEFAULT 0,
    purchase_total NUMERIC(15,2) NOT NULL DEFAULT 0,
    company_id TEXT REFERENCES company_config(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(customer_id, period)
);

CREATE INDEX IF NOT EXISTS idx_engagement_analytics_customer ON engagement_analytics(customer_id);
CREATE INDEX IF NOT EXISTS idx_engagement_analytics_period ON engagement_analytics(period);

ALTER TABLE engagement_analytics ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS engagement_analytics_company ON engagement_analytics;
CREATE POLICY engagement_analytics_company ON engagement_analytics
    USING (company_id = get_current_company_id() OR customer_id IN (SELECT id FROM customers WHERE company_id IS NOT NULL));

DROP POLICY IF EXISTS engagement_analytics_company_insert ON engagement_analytics;
CREATE POLICY engagement_analytics_company_insert ON engagement_analytics
    FOR INSERT WITH CHECK (company_id = get_current_company_id());

-- ============================================================
-- Postgres Functions for CEP
-- ============================================================

-- Get current company ID helper (uses session context set by Supabase)
CREATE OR REPLACE FUNCTION get_current_company_id()
RETURNS TEXT
LANGUAGE SQL
STABLE
AS $$
  SELECT NULLIF(current_setting('app.company_id', TRUE), '')::TEXT;
$$;

-- upsert_point_balance: atomically update or insert point balance
CREATE OR REPLACE FUNCTION upsert_point_balance(
  p_customer_id TEXT,
  p_points NUMERIC,
  p_reason TEXT,
  pcompany_id TEXT
)
RETURNS engagement_point_balances
LANGUAGE plpgsql
AS $$
DECLARE
  v_balance engagement_point_balances%ROWTYPE;
BEGIN
  INSERT INTO engagement_point_balances (id, customer_id, balance, lifetime_earned, last_updated, company_id)
  VALUES (
    gen_random_uuid()::TEXT,
    p_customer_id,
    CASE WHEN p_reason = 'redeem' THEN 0 ELSE p_points END,
    CASE WHEN p_reason = 'redeem' THEN 0 ELSE p_points END,
    NOW(),
    pcompany_id
  )
  ON CONFLICT (customer_id) DO UPDATE SET
    balance = engagement_point_balances.balance + CASE
      WHEN p_reason = 'redeem' THEN -p_points
      WHEN p_reason = 'expire' THEN 0
      ELSE p_points
    END,
    lifetime_earned = engagement_point_balances.lifetime_earned + CASE
      WHEN p_reason IN ('earn', 'bonus') THEN p_points
      ELSE 0
    END,
    lifetime_redeemed = engagement_point_balances.lifetime_redeemed + CASE
      WHEN p_reason = 'redeem' THEN p_points
      ELSE 0
    END,
    lifetime_expired = engagement_point_balances.lifetime_expired + CASE
      WHEN p_reason = 'expire' THEN p_points
      ELSE 0
    END,
    last_updated = NOW()
  RETURNING * INTO v_balance;

  RETURN v_balance;
END;
$$;

-- redeem_gift_card: atomically redeem a gift card
CREATE OR REPLACE FUNCTION redeem_gift_card(
  p_gift_card_id TEXT,
  p_amount NUMERIC,
  p_customer_id TEXT,
  pcompany_id TEXT
)
RETURNS engagement_gift_cards
LANGUAGE plpgsql
AS $$
DECLARE
  v_card engagement_gift_cards%ROWTYPE;
BEGIN
  SELECT * INTO v_card FROM engagement_gift_cards WHERE id = p_gift_card_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Gift card not found';
  END IF;

  IF v_card.status != 'active' THEN
    RAISE EXCEPTION 'Gift card is not active';
  END IF;

  IF v_card.current_balance < p_amount THEN
    RAISE EXCEPTION 'Insufficient gift card balance';
  END IF;

  IF v_card.expires_at IS NOT NULL AND v_card.expires_at < NOW() THEN
    RAISE EXCEPTION 'Gift card has expired';
  END IF;

  UPDATE engagement_gift_cards SET
    current_balance = current_balance - p_amount,
    updated_at = NOW()
  WHERE id = p_gift_card_id
  RETURNING * INTO v_card;

  INSERT INTO engagement_gift_card_transactions (id, gift_card_id, customer_id, transaction_type, amount, balance_before, balance_after, company_id)
  VALUES (
    gen_random_uuid()::TEXT,
    p_gift_card_id,
    p_customer_id,
    'redemption',
    p_amount,
    v_card.current_balance + p_amount,
    v_card.current_balance,
    pcompany_id
  );

  RETURN v_card;
END;
$$;

-- calculate_tier_for_customer: determine the correct tier based on points
CREATE OR REPLACE FUNCTION calculate_tier_for_customer(
  p_customer_id TEXT,
  pcompany_id TEXT
)
RETURNS engagement_customer_tiers
LANGUAGE plpgsql
AS $$
DECLARE
  v_points NUMERIC;
  v_tier engagement_membership_tiers%ROWTYPE;
  v_customer_tier engagement_customer_tiers%ROWTYPE;
BEGIN
  SELECT balance INTO v_points
  FROM engagement_point_balances
  WHERE customer_id = p_customer_id;

  IF v_points IS NULL THEN
    v_points := 0;
  END IF;

  SELECT * INTO v_tier FROM engagement_membership_tiers
  WHERE company_id = pcompany_id
    AND is_active = true
    AND min_points <= v_points
    AND (max_points IS NULL OR max_points >= v_points)
  ORDER BY level DESC
  LIMIT 1;

  IF v_tier.id IS NULL THEN
    SELECT * INTO v_tier FROM engagement_membership_tiers
    WHERE company_id = pcompany_id AND is_active = true
    ORDER BY level ASC
    LIMIT 1;
  END IF;

  IF v_tier.id IS NOT NULL THEN
    UPDATE engagement_customer_tiers
    SET is_current = false
    WHERE customer_id = p_customer_id AND is_current = true;

    INSERT INTO engagement_customer_tiers (id, customer_id, tier_id, tier_name, tier_level, company_id)
    VALUES (
      gen_random_uuid()::TEXT,
      p_customer_id,
      v_tier.id,
      v_tier.name,
      v_tier.level,
      pcompany_id
    )
    RETURNING * INTO v_customer_tier;
  END IF;

  RETURN v_customer_tier;
END;
$$;


