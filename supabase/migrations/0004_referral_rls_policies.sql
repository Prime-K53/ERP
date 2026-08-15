-- ============================================================================
-- Fix: Enable RLS and add RLS policies for referral tables
-- Uses the same allow_all pattern as the rest of the single-company schema.
-- ============================================================================

-- Step 1: Enable RLS on referral tables
ALTER TABLE IF EXISTS public.customer_referrals ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.referral_rewards ENABLE ROW LEVEL SECURITY;

-- Step 2: Drop existing policies if they exist (for idempotency)
DROP POLICY IF EXISTS "tenant_all" ON public.customer_referrals;
DROP POLICY IF EXISTS "tenant_isolation_policy" ON public.customer_referrals;
DROP POLICY IF EXISTS "allow_all_customer_referrals" ON public.customer_referrals;
DROP POLICY IF EXISTS "tenant_all" ON public.referral_rewards;
DROP POLICY IF EXISTS "tenant_isolation_policy" ON public.referral_rewards;
DROP POLICY IF EXISTS "allow_all_referral_rewards" ON public.referral_rewards;

-- Step 3: Create permissive policies (single-company: all authenticated users)
CREATE POLICY "allow_all_customer_referrals" ON public.customer_referrals
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "allow_all_referral_rewards" ON public.referral_rewards
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Step 4: Verify RLS is enabled and policies are in place
SELECT schemaname, tablename, rowsecurity FROM pg_tables
WHERE tablename IN ('customer_referrals', 'referral_rewards');

SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual
FROM pg_policies
WHERE tablename IN ('customer_referrals', 'referral_rewards')
ORDER BY tablename, policyname;

-- ============================================================================
-- End of migration
-- ============================================================================
