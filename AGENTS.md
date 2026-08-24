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
- SQL migration files are in `database/`
- Run in this order:
  1. `supabase-create-all-tables.sql`
  2. `supabase-rls-hardening-migration.sql`
  3. `supabase-migration-cloud-first.sql`
  4. `supabase-migrate-to-single-company.sql`
  5. `supabase-add-updated-at-triggers.sql` (NEW — adds BEFORE UPDATE triggers)
  6. `supabase-fix-realtime-publication.sql` (NEW — completes realtime publication)
  7. `supabase-portal-tables.sql` (NEW — creates portal_users/portal_sessions/portal_password_resets/portal_login_history; required for customer portal auth & password regeneration)
  8. `supabase-add-version-columns.sql` (NEW — adds `version` column to every business table with a `data` JSONB; REQUIRED for cloud sync. Without it POST /api/sync/ops fails with PGRST204 "Could not find the 'version' column")

## Notes
- `npx vitest` / `npx tsc` require .NET Framework v4.0.30319 on Windows PowerShell 5.1
- If .NET is unavailable, use PowerShell 7+ or `cmd /c` to run Node.js commands

## Notes
- `npx vitest` / `npx tsc` require .NET Framework v4.0.30319 on Windows PowerShell 5.1
- If .NET is unavailable, use PowerShell 7+ or `cmd /c` to run Node.js commands
