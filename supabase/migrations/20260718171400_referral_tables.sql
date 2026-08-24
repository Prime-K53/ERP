-- Customer Referral Tables — Generic JSONB schema for cloudDb compatibility
-- Each table stores domain fields in a 'data' JSONB column per cloudDb convention

-- 1. Referrals
CREATE TABLE IF NOT EXISTS customer_referrals (
    id TEXT PRIMARY KEY,
    data JSONB NOT NULL DEFAULT '{}',
    company_id TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Referral Rewards
CREATE TABLE IF NOT EXISTS referral_rewards (
    id TEXT PRIMARY KEY,
    data JSONB NOT NULL DEFAULT '{}',
    company_id TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for company-scoped lookups (only while company_id columns exist;
-- the single-company migration drops them).
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'customer_referrals' AND column_name = 'company_id'
    ) THEN
        EXECUTE 'CREATE INDEX IF NOT EXISTS idx_customer_referrals_company_id ON customer_referrals(company_id)';
    END IF;
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'referral_rewards' AND column_name = 'company_id'
    ) THEN
        EXECUTE 'CREATE INDEX IF NOT EXISTS idx_referral_rewards_company_id ON referral_rewards(company_id)';
    END IF;
END $$;
