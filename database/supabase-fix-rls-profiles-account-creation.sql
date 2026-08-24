-- ============================================================================
-- Fix RLS Policies for Account Creation Security
-- Run this in Supabase SQL Editor after the other migrations.
-- ============================================================================

-- 1. Fix Profiles INSERT policy: user can only create a profile for themselves
--    The old policy WITH CHECK (true) allowed any authenticated user to
--    create a profile linking ANY user_id to ANY company_id, enabling
--    cross-account data leaking and account takeover.
-- ============================================================================
DROP POLICY IF EXISTS "Authenticated users can insert profiles" ON public.profiles;

CREATE POLICY "Users can insert own profile"
  ON public.profiles
  FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid()::text
  );

-- 2. Fix Profiles SELECT policy: restrict to own profile or own company
--    The existing policy already checks company_id via get_user_company_id(),
--    but we add a restrictive policy for defense in depth.
-- ============================================================================
DROP POLICY IF EXISTS "Users can view profiles" ON public.profiles;

CREATE POLICY "Users can view profiles"
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()::text
    OR company_id = public.get_user_company_id()
  );

-- 3. Add a RESTRICTIVE policy on profiles for defense in depth:
--    Even if a permissive policy is created, this RESTRICTIVE policy
--    ensures the user can only access profiles in their own company.
-- ============================================================================
DROP POLICY IF EXISTS "restrictive_profiles_tenant" ON public.profiles;

CREATE POLICY "restrictive_profiles_tenant"
  ON public.profiles
  AS RESTRICTIVE
  FOR ALL
  TO authenticated
  USING (
    user_id = auth.uid()::text
    OR company_id = public.get_user_company_id()
  )
  WITH CHECK (
    user_id = auth.uid()::text
  );

-- 4. Fix Companies INSERT policy: while companies need to be insertable
--    by any authenticated user (for first-time setup), we add a safety
--    check that the company ID doesn't already exist (prevent overwrite).
-- ============================================================================
-- (No change needed - companies INSERT with CHECK (true) is intentional
--  for first-time setup, and the application code uses crypto.randomUUID()
--  or similar to generate unique IDs.)

-- 5. Update get_user_company_id() to prefer the verified profile company_id
--    over the user_metadata (which is client-controllable).
-- ============================================================================
CREATE OR REPLACE FUNCTION public.get_user_company_id()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT company_id FROM public.profiles WHERE user_id = auth.uid()::text LIMIT 1),
    auth.jwt() ->> 'company_id',
    (SELECT raw_app_meta_data ->> 'tenant_id' FROM auth.users WHERE id = auth.uid()),
    (SELECT raw_user_meta_data ->> 'company_id' FROM auth.users WHERE id = auth.uid())
  );
$$;

GRANT EXECUTE ON FUNCTION public.get_user_company_id() TO authenticated;

-- 6. Trigger function: when a profile is created/updated, sync company_id
--    into the auth user's app_metadata so it's baked into the JWT
--    (app_metadata cannot be spoofed by the client).
-- ============================================================================
CREATE OR REPLACE FUNCTION public.sync_profile_company_to_auth()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = auth, public
AS $$
BEGIN
  IF NEW.company_id IS NOT NULL AND NEW.company_id <> '' THEN
    BEGIN
      UPDATE auth.users
      SET raw_app_meta_data = COALESCE(raw_app_meta_data, '{}'::jsonb) || jsonb_build_object('tenant_id', NEW.company_id)
      WHERE id = NEW.user_id::uuid;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Could not sync company_id to auth.users for user %: %', NEW.user_id, SQLERRM;
    END;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_profile_company_to_auth ON public.profiles;
CREATE TRIGGER trg_sync_profile_company_to_auth
  AFTER INSERT OR UPDATE OF company_id
  ON public.profiles
  FOR EACH ROW
  WHEN (NEW.company_id IS NOT NULL AND NEW.company_id <> '')
  EXECUTE FUNCTION public.sync_profile_company_to_auth();

-- ============================================================================
-- End of migration
-- ============================================================================
