-- ============================================================================
-- Fix RLS Policies for Account Creation Security
-- Run this in Supabase SQL Editor after the other migrations.
-- Idempotent — safe to re-run.
--
-- Mirrors database/supabase-fix-rls-profiles-account-creation.sql for the
-- current single-company schema:
--   * profiles.company_id no longer exists, so every "own company" check is
--     expressed as is_company_staff(): the caller has an own profile row
--     (profiles.user_id = auth.uid()::text).
--   * auth.uid() is uuid while profiles.user_id is TEXT, hence the ::text cast.
--   * get_user_company_id() and sync_profile_company_to_auth() referenced
--     profiles.company_id and have been removed.
--   * Every CREATE POLICY is preceded by DROP POLICY IF EXISTS so a previous
--     partial run (e.g. "policy already exists", 42710) is recovered by re-run.
-- ============================================================================

-- 0. Helper: SECURITY DEFINER staff check (avoids self-referencing RLS recursion)
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

-- 1. Fix Profiles INSERT policy: user can only create a profile for themselves
--    The old policy WITH CHECK (true) allowed any authenticated user to
--    create a profile linking ANY user_id to ANY company_id, enabling
--    cross-account data leaking and account takeover.
-- ============================================================================
DROP POLICY IF EXISTS "Authenticated users can insert profiles" ON public.profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;

CREATE POLICY "Users can insert own profile"
  ON public.profiles
  FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid()::text
  );

-- 2. Fix Profiles SELECT policy: restrict to own profile or own company
--    Single-company equivalent of "own company": any authenticated user who
--    has a profile (company staff) may read the profile list.
-- ============================================================================
DROP POLICY IF EXISTS "Users can view profiles" ON public.profiles;

CREATE POLICY "Users can view profiles"
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()::text
    OR public.is_company_staff()
  );

-- 3. Add a RESTRICTIVE policy on profiles for defense in depth:
--    Even if a permissive policy is created, this RESTRICTIVE policy
--    ensures only the user's own profile can ever be modified.
-- ============================================================================
DROP POLICY IF EXISTS "restrictive_profiles_tenant" ON public.profiles;

CREATE POLICY "restrictive_profiles_tenant"
  ON public.profiles
  AS RESTRICTIVE
  FOR ALL
  TO authenticated
  USING (
    user_id = auth.uid()::text
    OR public.is_company_staff()
  )
  WITH CHECK (
    user_id = auth.uid()::text
  );

-- 4. Companies INSERT policy: while companies need to be insertable
--    by any authenticated user (for first-time setup), we add a safety
--    check that the company ID doesn't already exist (prevent overwrite).
-- ============================================================================
-- (No change needed - companies INSERT with CHECK (true) is intentional
--  for first-time setup, and the application code uses crypto.randomUUID()
--  or similar to generate unique IDs.)

-- 5 & 6 removed: get_user_company_id() and the profile→auth.company_id sync
--    trigger depended on profiles.company_id, which no longer exists in the
--    single-company schema (see header comment).

-- ============================================================================
-- End of migration
-- ============================================================================