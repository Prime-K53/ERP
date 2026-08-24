-- ============================================================================
-- 0007_referral_prospective_person.sql
-- Extend customer_referrals for prospective-person referrals.
--
-- Purpose:
--   The referral business model is changing from "existing customer → existing
--   customer" to "existing customer → prospective/new person". This migration
--   adds the nullable columns needed to store a prospective person's contact
--   info at referral creation time, and to link the referral to a customer
--   record once the person registers/activates.
--
-- Strategy: ADDITIVE ONLY. No columns are dropped, renamed, or modified.
-- All new columns are NULLABLE so existing referral rows remain valid.
-- The existing `customer_id` column becomes NULLABLE (it was implicitly
-- NOT NULL from the service layer; the actual DDL has no NOT NULL constraint
-- in the envelope schema).
--
-- Backward compatibility:
--   Legacy referrals (customer-to-customer) retain their customer_id and
--   work unchanged. New Portal-created referrals use the prospective-person
--   columns and leave customer_id NULL.
-- ============================================================================

-- ─── 1. ADD PROSPECTIVE-PERSON COLUMNS ────────────────────────────────────
-- All nullable — existing rows are unaffected.

ALTER TABLE public.customer_referrals
  ADD COLUMN IF NOT EXISTS referred_name TEXT;

ALTER TABLE public.customer_referrals
  ADD COLUMN IF NOT EXISTS referred_email TEXT;

ALTER TABLE public.customer_referrals
  ADD COLUMN IF NOT EXISTS referred_phone TEXT;

ALTER TABLE public.customer_referrals
  ADD COLUMN IF NOT EXISTS invitation_sent_at TIMESTAMPTZ;

ALTER TABLE public.customer_referrals
  ADD COLUMN IF NOT EXISTS registered_customer_id TEXT;

ALTER TABLE public.customer_referrals
  ADD COLUMN IF NOT EXISTS registered_at TIMESTAMPTZ;

-- ─── 2. INDEXES FOR NEW LOOKUP FIELDS ─────────────────────────────────────
-- Expression indexes on the JSONB data column for PostgREST queries.

CREATE INDEX IF NOT EXISTS idx_referrals_referred_email
  ON public.customer_referrals ((data->>'referred_email'));

CREATE INDEX IF NOT EXISTS idx_referrals_referred_phone
  ON public.customer_referrals ((data->>'referred_phone'));

CREATE INDEX IF NOT EXISTS idx_referrals_registered_customer
  ON public.customer_referrals ((data->>'registered_customer_id'));

-- ─── 3. DUPLICATE PROTECTION ──────────────────────────────────────────────
-- Prevent multiple active prospective referrals for the same email or phone.
-- Uses a partial unique index that only applies to active referrals
-- (status IN 'pending' or 'registered') and only when the value is NOT NULL.
-- NULL values are never treated as duplicates (three-valued SQL logic).

CREATE UNIQUE INDEX IF NOT EXISTS idx_referrals_unique_active_email
  ON public.customer_referrals ((data->>'referred_email'))
  WHERE (data->>'status') IN ('pending', 'registered')
    AND (data->>'referred_email') IS NOT NULL
    AND (data->>'referred_email') != '';

CREATE UNIQUE INDEX IF NOT EXISTS idx_referrals_unique_active_phone
  ON public.customer_referrals ((data->>'referred_phone'))
  WHERE (data->>'status') IN ('pending', 'registered')
    AND (data->>'referred_phone') IS NOT NULL
    AND (data->>'referred_phone') != '';

-- ─── 4. REALTIME ──────────────────────────────────────────────────────────
-- No new tables; customer_referrals is already in the realtime publication.

-- ============================================================================
-- End of 0007
-- ============================================================================
