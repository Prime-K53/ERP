-- ============================================================================
-- PENDING — NOT YET APPLIED TO LIVE
--
-- Fix: Enforce a unique official sales-order number across the cloud
-- `sales_orders` rows and record tenant-scoping guidance.
--
-- Context:
--   * The canonical sales order number is backend-authoritative (`SO-YYYY-######`).
--     Portal adoption (portalLifecycleService.completeSalesOrder) already mints it;
--     admin-created orders now receive it from the sync gateway
--     (cloudSyncStore.ensureSalesOrderNumber) at write time.
--   * Before this migration, a duplicate `order_number` was possible when two
--     devices created orders offline and both minted the same next sequence
--     value. The unique index below makes the collision fail loudly on the
--     second write instead of silently corrupting the number space.
--   * This is PENDING because it must only be applied AFTER the official-number
--     minting has propagated numbers to all existing rows (rows without an
--     official number would otherwise collide on the NULL → 000001 first mint).
--     Run the backfill once the gateway minting has been live for a full sync
--     pass, then apply this migration.
--
-- Tenant scope (guidance): the ERP is multi-tenant-capable but the LIVE schema
-- has no company_id on sales_orders and RLS is allow_all. The canonical store
-- enforces tenancy at the service layer (assertTenantSafe). When company_id
-- scoping is introduced, extend the unique index to (company_id, order_number)
-- and add the standard RLS policies from the 0001 section-2 pattern.
-- ============================================================================

-- Step 1: Unique official number (SQL NULLs do not collide, so rows still
-- awaiting a minted number are unaffected).
CREATE UNIQUE INDEX IF NOT EXISTS idx_sales_orders_order_number_unique
  ON public.sales_orders (((data->>'order_number')::text))
  WHERE data->>'order_number' IS NOT NULL AND data->>'order_number' != '';

-- Step 2: Index backing the minting scan (prefix match over the number column).
CREATE INDEX IF NOT EXISTS idx_sales_orders_order_number
  ON public.sales_orders (((data->>'order_number')::text));

-- Step 3: Idempotent guard — re-running this file is a no-op.