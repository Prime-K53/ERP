-- ============================================================================
-- Fix: Enable RLS and add RLS policies for referral tables
-- ============================================================================

-- Step 1: Enable RLS on referral tables
ALTER TABLE IF EXISTS public.customer_referrals ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.referral_rewards ENABLE ROW LEVEL SECURITY;

-- Step 2: Drop existing policies if they exist (for idempotency)
DROP POLICY IF EXISTS "tenant_all" ON public.customer_referrals;
DROP POLICY IF EXISTS "tenant_isolation_policy" ON public.customer_referrals;
DROP POLICY IF EXISTS "tenant_all" ON public.referral_rewards;
DROP POLICY IF EXISTS "tenant_isolation_policy" ON public.referral_rewards;

-- Step 3: Create PERMISSIVE policies for customer_referrals table
-- Allow users to access referrals from their own company.
-- (Skipped when the company_id column has been dropped by the single-company
-- migration — RLS stays enabled, which grants nothing to non-owners.)
DO $$
DECLARE
    has_company_col BOOLEAN;
BEGIN
    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'customer_referrals' AND column_name = 'company_id'
    ) INTO has_company_col;

    IF has_company_col THEN
        CREATE POLICY "tenant_all" ON public.customer_referrals AS PERMISSIVE FOR ALL
        USING (company_id = public.get_user_company_id())
        WITH CHECK (company_id = public.get_user_company_id());
    END IF;
END $$;

-- Step 4: Create PERMISSIVE policies for referral_rewards table
-- Allow users to access rewards from their own company.
DO $$
DECLARE
    has_company_col BOOLEAN;
BEGIN
    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'referral_rewards' AND column_name = 'company_id'
    ) INTO has_company_col;

    IF has_company_col THEN
        CREATE POLICY "tenant_all" ON public.referral_rewards AS PERMISSIVE FOR ALL
        USING (company_id = public.get_user_company_id())
        WITH CHECK (company_id = public.get_user_company_id());
    END IF;
END $$;

-- Step 5: Verify RLS is enabled and policies are in place
SELECT 'RLS Status for referral tables:' as info;
SELECT schemaname, tablename, rowsecurity FROM pg_tables
WHERE tablename IN ('customer_referrals', 'referral_rewards');

SELECT 'Policies on customer_referrals:' as info;
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual
FROM pg_policies
WHERE tablename = 'customer_referrals'
ORDER BY policyname;

SELECT 'Policies on referral_rewards:' as info;
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual
FROM pg_policies
WHERE tablename = 'referral_rewards'
ORDER BY policyname;

-- ============================================================================
-- End of migration
-- ============================================================================