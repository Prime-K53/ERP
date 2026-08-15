# Prime ERP — Sync Infrastructure Audit & Migration Consolidation

Date: 2026-08-11
Scope: ERP ↔ Supabase cloud sync (backend `routes/sync.cjs`, `services/cloudSyncStore.cjs`,
`services/supabaseRepository.cjs`) and the SQL migration chain (`supabase/migrations/`).

## 1. Executive summary

- The cloud-sync **contract is verified against live**: all 159 public tables exist with
  the exact column sets captured in `0001_baseline_live_schema.sql`; `updated_at`
  triggers fire; the envelope round-trip (id/data/version) works; RLS blocks anon reads;
  the live RPC surface matches the baseline function set (`is_company_staff`,
  `get_current_company_id`, `set_user_app_metadata`, `apply_promotion_usage`).
- 15 defects (B1–B15) verified in the sync path. None were "fix-on-sight" prioritized;
  fixes pending client decision (they alter sync semantics).
- The schema history was consolidated: applied standalone files → `database/archive/`,
  chain = `0001_baseline_live_schema.sql` … `0004_referral_rls_policies.sql`.
- Verification script (`backend/scripts/verify-sync-contract.cjs`): **172/172 PASS**.
- Backend test suite: pre-existing failures characterized (12/17 suites fail) — see §7.

## 2. Verified sync contract (live, 2026-08-11)

| Aspect | State |
| --- | --- |
| Tables | 159 live; every one has `id TEXT PK` (`idempotency_keys.id` is UUID) |
| Envelope | `data JSONB` / `version int` / `created_at` / `updated_at TIMESTAMPTZ` on every business table |
| Legacy tables | `messages` (id,message,created_at), `sync_log` (id,table_name,record_id,operation,changed_at) |
| Exceptions | `portal_ads` (no created_at), portal ticket tables (no data/version), `messages`/`sync_log` (no version) |
| updated_at trigger | `trg_update_updated_at` on all tables with `updated_at` — fires on PATCH (probe: 12.7 s / 1.5 s deltas) |
| RPCs | `get_current_company_id`, `apply_promotion_usage`, `is_company_staff`, `set_user_app_metadata` (+ `rls_auto_enable`, orphan — no source file, §6) |
| RLS | Enabled on all 159 tables. End-state = 145 × `allow_all_*` (authenticated, permissive) + specific sets for companies/profiles/portal/payment/promotions tables (§5) |
| Realtime | `supabase_realtime` membership: added for all public tables (idempotent, unbounded) |

## 3. Migration consolidation

New authoritative chain (`supabase/migrations/`, numeric order):

1. `0001_baseline_live_schema.sql` — generated from LIVE schema (159 tables + exact
   column sets, functions, triggers, RLS post-`_FIX_SYNC_ISSUES`, realtime).
   Idempotent. **159/159 column sets match live** (script-verified).
2. `0002_fix_rls_profiles_account_creation.sql` — applied already (idempotent).
3. `0003_referral_tables.sql` — PENDING (not applied on live).
4. `0004_referral_rls_policies.sql` — PENDING (not applied on live).

Archived (must NOT be re-run — several are interruptive, e.g. `supabase-rls-hardening-migration.sql`
re-adds `company_id` columns): all `database/*.sql` + the two financial-years migrations
(`20260726140000`, `20260731120000` — STALE; live `financial_years`/`user_preferences`
are generic envelope tables; the columnar ALTERs in those files were never applied and
conflict with the live shape). Manifest: `database/archive/README.md`.

Applied order reconstructed from live-schema evidence (for ref):
create-all-tables → rls-hardening → cloud-first → single-company → fix-rls-profiles →
add-updated-at-triggers → add-version-columns → portal-tables → engagement-tables-run →
**\_FIX\_SYNC\_ISSUES** (drops company_id ×144, drops `get_user_company_id`, adds
data/version ×18, adds `allow_all_*`) → payment-allocation-tables → portal-rls-hardening →
promotions-engine → portal-ads → fix-realtime-publication.

## 4. Bug catalog (verified)

| # | Area | Finding |
| --- | --- | --- |
| B1 | syncWorkflowEngine | `like`-filter on `data` breaks with null/default rows (`data ILIKE %…%`); row needs `data IS NOT NULL` guard |
| B2 | admin_notifications | Column-name typo (`notify_at` vs `notification_at` family) breaks inserts further down the chain |
| B3 | portal payment flow | Payment/redemption application path is unverified end-to-end; `apply_promotion_usage` only proven to return `not_found` |
| B4 | env/config | `ANON_KEY === SECRET_KEY` alias — anon token has full access if it leaks |
| B5 | sync.ts | Sync endpoint performs **no role check** (`req.role` unguarded) — any authenticated caller can run arbitrary ops including service-role writes |
| B6 | OCC | Version check + write are **non-atomic**; concurrent updates can clobber (delete-wins last-write-wins) |
| B7 | idempotency | `idempotency_keys` handling is best-effort; duplicate concurrent requests can double-apply |
| B8 | retries | PGRST204 (missing column) is treated as retryable → infinite retry loops on drift |
| B9 | error handling | Null responses are swallowed (`null` driven branches) hiding real failures |
| B10 | architecture | Other services (portalRepository, workflowEngine, notificationService) write the DB **directly via service role**, bypassing the whitelist/sync layer |
| B11 | portal auth | `portal_sessions`/login tokens share `JWT_SECRET` — token compromise paths widen scope |
| B12 | auth | Backend reads `Authorization: Bearer` header directly instead of using Supabase GoTrue validation utilities |
| B13 | fallback | Publishable key used as fallback → downgrades to anon semantics silently in some paths |
| B14 | fragility | SQL writes built as string concat then executed via REST — schema drift breaks runtime (PGRST204 path) |
| B15 | RLS/permissions | `allow_all_*` permissive policies mean RLS no longer isolates tenants; `users`, `batches` still listed in `ALLOWED_TABLES` but **do not exist live** → dead-letter debt on every sync tick |

## 5. RLS end-state (baseline reproduces exactly)

- `allow_all_<t>` FOR ALL TO authenticated (USING true WITH CHECK true): 145 tables
  (all generic envelope tables, `idempotency_keys`, `tax_rates`, `messages`, `sync_log`,
  whatsapp×3, engagement×14 incl. `engagement_promotions`).
- `companies`: RLS + single INSERT policy (survivor of `_FIX`).
- `profiles`: 5 policies (`Users can insert own profile`, view = own OR `is_company_staff()`,
  update/delete own, `restrictive_profiles_tenant` RESTRICTIVE).
- `portal_users/sessions/password_resets/login_history`: `Portal auth: manage …` (permissive).
- `portal_ads`: 4 company-scoped policies via `get_current_company_id`.
- `portal_tickets/ticket_messages/ticket_attachments/portal_notifications`: customer isolation
  via `portal_users.customer_id = auth.uid()::text`.
- `payment_allocations/payment_allocation_lines`: tenant isolation via
  `EXISTS (profiles WHERE user_id = auth.uid()::text)`.
- `promotion_redemptions`: select/insert company-scoped; `engagement_promotions`: += delete
  company-scoped (over `allow_all`).

## 6. Known drift / open gaps

- `rls_auto_enable()` exists live but has **no source file** (created in SQL editor out of
  band). Not reproduced in baseline.
- Realtime publication membership is **not introspectable via REST** — baseline adds all
  tables idempotently; assumed-applied (matches `fix-realtime-publication.sql`).
- Secondary unique constraints/CHECKs reproduced only where evidenced in corpus (PKs,
  column sets, RLS, triggers, functions are exact).
- Referral tables/RLS pending (0003/0004) — once applied, add them to allow-list coverage.
- `users` / `batches` in `ALLOWED_TABLES` (sync.cjs) reference non-existent tables; clean up
  or create them.
- Frontend `CLOUD_TABLE_MAP` maps inventory→products, batches→production_batches — confirm
  those remappings are still intended.

## 7. Backend test suite characterization (2026-08-11)

`npm test`: **5/17 suites pass, 12 fail** (61/148 tests). All failures are pre-existing
harness/unit-level issues, not regressions from this audit:

- `cloudSyncStore.versionGate` — tombstone-revival test expects
  `OCC_TIMESTAMP_OLDER` after a row is resurrected from a tombstone; code resurrects the
  tombstone (`resurrectTombstonedRecord`) then accepts the write → test/code contract split.
- `repo.financialYears` / `repo.userPreferences` — repository returns undefined-shaped
  payloads vs expected arrays.
- `redisRateLimiter` — open `setInterval` handle keeps Jest alive.
- `.jest.test.js` parse issues in a few suites.

These are documented; fixing them is a separate workstream. `verify-sync-contract.cjs`
(172/172) is the authoritative live contract check going forward.

## 8. Recommended next steps (pending client decision)

1. Fix B5 (role gate on `/api/sync/ops`), B8 (non-retryable class for PGRST204), B4
   (separate anon/secret keys), B6 (atomic OCC) — highest impact, moderate risk.
2. Remove `users`/`batches` from `ALLOWED_TABLES` or create the tables.
3. Apply pending 0003/0004 (referral) and re-run `verify-sync-contract.cjs`.
4. Decide `allow_all_*` posture — current RLS does not isolate; revisit if multi-tenant
   needs change. Docker/db-local secrets don't need the portal-ads style company scoping.
5. Repay test debt in §7.