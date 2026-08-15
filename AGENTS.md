# AGENTS.md — Prime ERP Codebase Guide

## Project Structure
- `frontend/` — React/Vite/Typescript frontend (Prime ERP)
- `backend/` — Node.js backend API
- `database/` — Supabase PostgreSQL migration SQL files
- `supabase/functions/` — Supabase Edge Functions
- `tests/` — E2E test scripts

## Commands

### Frontend (from `frontend/`)
- **Test**: `npx vitest run`
- **Type check**: `npx tsc --noEmit`
- **Dev server**: `npm run dev`

### Backend (from `backend/`)
- **Test**: `npm test`
- **Type check**: `npx tsc --noEmit --project tsconfig.json`
- **Start**: `npm start`

### Database
- The authoritative migration chain is `supabase/migrations/`, run in numeric order:
  1. `0001_baseline_live_schema.sql` — consolidated LIVE schema (159 tables,
     functions, updated_at triggers, post-`_FIX_SYNC_ISSUES` RLS policy set,
     realtime publication). Idempotent; safe on existing DBs.
  2. `0002_fix_rls_profiles_account_creation.sql` — applied already (idempotent)
  3. `0003_referral_tables.sql` — PENDING, not yet applied to live
  4. `0004_referral_rls_policies.sql` — PENDING, not yet applied to live
  5. `0005_portal_quotation_requests.sql` — PENDING, not yet applied to live
     (creates the missing `quotation_requests` table the customer portal
     strictly reads; required for `/portal/dashboard`)
- `database/archive/` holds the previously-applied standalone SQL files for
  provenance (do NOT re-run them — e.g. `supabase-rls-hardening-migration.sql`
  would re-add `company_id` columns). Manifest: `database/archive/README.md`.

## Notes
- `npx vitest` / `npx tsc` require .NET Framework v4.0.30319 on Windows PowerShell 5.1
- If .NET is unavailable, use PowerShell 7+ or `cmd /c` to run Node.js commands
