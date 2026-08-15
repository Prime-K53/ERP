-- ============================================================================
-- Create Payment Allocation tables for Supabase
-- These tables exist in the local SQLite schema (db.cjs) but were missing
-- from Supabase, causing the Customer Portal to lose allocation data.
--
-- Run AFTER supabase-create-all-tables.sql
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.payment_allocations (
  id TEXT PRIMARY KEY,
  company_id TEXT,
  data JSONB DEFAULT '{}',
  version INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.payment_allocation_lines (
  id TEXT PRIMARY KEY,
  company_id TEXT,
  data JSONB DEFAULT '{}',
  version INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for fast lookup by payment_id
CREATE INDEX IF NOT EXISTS idx_payment_allocations_payment_id
  ON public.payment_allocations ((data->>'payment_id'));

-- Index for fast lookup by allocation_id
CREATE INDEX IF NOT EXISTS idx_payment_allocation_lines_allocation_id
  ON public.payment_allocation_lines ((data->>'allocation_id'));

-- Index for fast lookup by invoice_id
CREATE INDEX IF NOT EXISTS idx_payment_allocation_lines_invoice_id
  ON public.payment_allocation_lines ((data->>'invoice_id'));

-- ============================================================================
-- End of migration
-- ============================================================================
