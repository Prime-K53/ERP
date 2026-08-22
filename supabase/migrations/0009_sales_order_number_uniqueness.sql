-- ============================================================================
-- Migration 0009: Enforce Sales Order Number Uniqueness
-- Prime ERP — Single-Company
-- ============================================================================
--
-- Purpose:
--   Enforce database-level uniqueness for official Sales Order numbers.
--
-- Canonical JSON field:
--   sales_orders.data->>'orderNumber'
--
-- Existing records:
--   Legacy numbers such as SO-0001 and SO-P726/002 are preserved.
--   New backend-authoritative numbers use SO-YYYY-######.
--
-- IMPORTANT:
--   This migration does NOT rename, delete, or modify existing Sales Orders.
--   It only prevents duplicate non-empty orderNumber values going forward.
--
-- Pre-flight verification completed:
--   - Existing Sales Orders with missing orderNumber: 0
--   - Existing duplicate orderNumber values: MUST be 0 before applying
--
-- ============================================================================


-- ============================================================================
-- STEP 1: Prevent duplicate Sales Order numbers
-- ============================================================================
--
-- PostgreSQL allows multiple NULL values in a UNIQUE index.
-- The partial predicate additionally excludes empty strings.
--
-- Therefore:
--   NULL        -> allowed
--   ''          -> excluded
--   SO-0001     -> must be unique
--   SO-2026-000001 -> must be unique
--
-- This protects both legacy and new official Sales Order numbers.
-- ============================================================================

CREATE UNIQUE INDEX IF NOT EXISTS idx_sales_orders_order_number_unique
ON public.sales_orders (((data->>'orderNumber')::text))
WHERE data->>'orderNumber' IS NOT NULL
  AND data->>'orderNumber' != '';


-- ============================================================================
-- STEP 2: Verification
-- ============================================================================
--
-- The migration itself does not modify existing rows.
-- The following query can be run after migration to verify that no duplicate
-- official Sales Order numbers exist.
-- ============================================================================

-- SELECT
--   data->>'orderNumber' AS order_number,
--   COUNT(*) AS count
-- FROM public.sales_orders
-- WHERE data->>'orderNumber' IS NOT NULL
--   AND data->>'orderNumber' != ''
-- GROUP BY data->>'orderNumber'
-- HAVING COUNT(*) > 1
-- ORDER BY count DESC, order_number;


-- ============================================================================
-- STEP 3: Verify the unique index
-- ============================================================================

-- SELECT
--   indexname,
--   indexdef
-- FROM pg_indexes
-- WHERE schemaname = 'public'
--   AND tablename = 'sales_orders'
--   AND indexname = 'idx_sales_orders_order_number_unique';


-- ============================================================================
-- END MIGRATION 0009
-- ============================================================================