# SASA PHASE 5 — DATABASE MIGRATION READINESS
# Prime ERP → Sasa Portal Replacement · Database Audit & Preparation

- Date: 2026-08-14
- Mode: READ-ONLY AUDIT. NO migrations applied, NO production/development Supabase modified,
  NO RLS changed, NO code changed, NO Sasa changes, NO multi-tenancy introduced.
  PrimeERPsystem remains SINGLE-COMPANY.
- Live verification: `backend/scripts/verify-sync-contract.cjs` (the repo's own read-only
  live-schema verifier) executed 2026-08-14 13:48 UTC → **172/172 PASS**.
  Extended read-only REST probes executed for the non-baseline tables listed in §2.

---

## 1. COMPLETE MIGRATION INVENTORY

Authoritative chain: `supabase/migrations/` (numeric order). Archived standalone SQL in
`database/archive/` (do NOT re-run — see `database/archive/README.md`).

| # | Migration | Purpose | Tables | Columns | Indexes | RLS | Funcs/RPCs | Triggers | Dependencies | Status |
|---|---|---|---|---|---|---|---|---|---|---|
| 0001 | `0001_baseline_live_schema.sql` (2026-08-11 capture) | Reproduce LIVE schema | 159 (`{id TEXT PK, data JSONB, created_at, updated_at, version}` envelope; exceptions: `messages`, `sync_log`, `portal_ads`, portal ticket tables) | exact live column sets | 40 `CREATE INDEX` (+ `idx_portal_*` inline) | enabled on all 159; 168 policies (145× `allow_all_*` + profiles/companies/portal-tickets/portal_ads/payment_allocations/promotions sets) | 5: `update_updated_at_column`, `is_company_staff`, `get_current_company_id`, `set_user_app_metadata`, `apply_promotion_usage` | `trg_update_updated_at` (DO-loop over all tables with `updated_at`) | realtime publication DO-loop (all public tables) | **APPLIED LIVE** — verified 159/159 + RPC surface + trigger + envelope (172/172) |
| 0002 | `0002_fix_rls_profiles_account_creation.sql` | Hardening profiles RLS; staff helper | — | — | — | profiles INSERT own / SELECT own-or-staff / RESTRICTIVE tenant policy | `is_company_staff()` (SECURITY DEFINER, re-declared) | — | 0001 | **APPLIED LIVE** (idempotent) |
| 0003 | `0003_referral_tables.sql` | Referral tables (generic JSONB envelope) | `customer_referrals`, `referral_rewards` (2 of 8 required) | `id TEXT PK, data JSONB, company_id TEXT, created_at, updated_at` | conditional `idx_*_company_id` (only if `company_id` col exists) | none | none | none | none | **PENDING as chain — but BOTH tables already exist LIVE in COLUMNAR shape (drift, §3)** |
| 0004 | `0004_referral_rls_policies.sql` | Enable RLS + permissive policies on referral tables | — | — | — | `allow_all_customer_referrals` / `allow_all_referral_rewards` FOR ALL TO authenticated USING/WITH CHECK (true) | — | — | 0003 | **PENDING** (not applied live) |
| 0005 | `0005_portal_quotation_requests.sql` | Recreate missing `quotation_requests` | `quotation_requests` (envelope) | `id TEXT PK, data JSONB, created_at, updated_at, version` | `idx_quotation_requests_customer` (data->>customer_id), `_status`, `_created_at` | `allow_all_quotation_requests` FOR ALL TO authenticated (true) | — | `trg_update_updated_at` | 0001 | **PENDING as chain — but table ALREADY EXISTS LIVE in envelope shape (§5)** |

Later migrations touching Portal/customers/invoices/orders/quotations/payments/deliveries/
statements/wallets/notifications/documents/lifecycle/referrals/RLS beyond 0001: **none.**
0001 is the single source for all baseline tables; 0002–0005 are the only follow-ons.
All previously applied standalone files live in `database/archive/` (provenance only).

## 2. ACTUAL LIVE DATABASE STATE — VERIFIED (2026-08-14)

Verification via the repo's documented read-only mechanism (`backend/scripts/verify-sync-contract.cjs`),
plus read-only REST probes (SELECT/COUNT only, no writes):

```
172/172 checks passed                          ← verify-sync-contract.cjs
PASS  table <all 159 baseline tables>          ← exact live column sets
PASS  rpc is_company_staff / get_current_company_id / apply_promotion_usage
PASS  updated_at trigger fires on PATCH        ← idempotency_keys probe (row deleted after)
PASS  customers envelope round-trip + version  ← probe row deleted after
PASS  anon key blocked on business tables      ← RLS active, 0 rows leaked

Extended read-only probes (SELECT/COUNT only):
EXISTS  quotation_requests      ENVELOPE shape (id,data,version,created_at,updated_at) · 0 rows
EXISTS  customer_referrals      COLUMNAR shape (NO data/version → HTTP 42703)          · 0 rows
EXISTS  referral_rewards        COLUMNAR shape (NO data/version → HTTP 42703)          · 0 rows
MISSING referral_timeline / referral_audit_logs / referral_campaigns / referral_analytics
MISSING referral_reversals / referral_settings        (HTTP 404)
MISSING portal_timeline_events / document_versions / document_signatures / document_comments / portal_downloads (HTTP 404)
EXISTS  wallet_transactions     (baseline)
```

**LIVE DATABASE STATE = VERIFIED (not UNKNOWN).** Baseline chain is exactly reproduced on
live. However the live DB has DRIFT AHEAD OF THE CHAIN in two places (`quotation_requests`
exists in envelope shape; `customer_referrals`/`referral_rewards` exist in a legacy
COLUMNAR shape) — neither is captured by any migration file. The pending migrations
0003/0004/0005 are still required for chain reproducibility, and 0003 as written does NOT
repair the live columnar-shape mismatch.

RLS posture on the three drift tables is not fully introspectable read-only via REST
(no writes permitted this phase). `anon` SELECT returned `[]` on all three (consistent
with RLS active OR empty tables). Applying 0004/0005 closes the ambiguity by installing
explicit policies.

## 3. MIGRATION 0003 — REFERRALS: INCOMPLETE + LIVE SHAPE MISMATCH

### What it creates
`customer_referrals` + `referral_rewards` as generic envelopes
(`id TEXT PK, data JSONB, company_id TEXT, created_at, updated_at`) with conditional
company_id indexes. No constraints, triggers, functions, or realtime membership.

### What the code actually requires (backend/cloud-first contract)
The backend is Supabase-first: `referralService.cjs` is a SQL→REST shim (`_run`/`_get`/
`_all` in `backend/services/referralService.cjs`) that stores every domain field inside the
`data` JSONB envelope (`toSupabaseRow` in `supabaseRepository.cjs`) and filters with
`data->>field` PostgREST predicates. Eight tables are referenced:

| Table | Used by | Status vs 0003 |
|---|---|---|
| `customer_referrals` | referralService register/getAll/update/cancel/expire/delete; portalService getReferrals/getReferral/getReferralTimeline/getReferralStats/registerPortalReferral | 0003 creates — but live copy is COLUMNAR → reads/writes fail (`data->>customer_id` filter → 42703 → strict read throws → portal `/referrals` 500s) |
| `referral_rewards` | referralService createReward/approve/reject/getPendingRewards/analytics; portalService getReferralRewards | same mismatch |
| `referral_timeline` | referralService getTimeline/addTimeline; portalService getReferralTimeline (STRICT read → 500 on missing table) | **MISSING (not in 0003)** |
| `referral_audit_logs` | referralService logAudit/getAuditLogs/cleanupAuditLogs; `/api/referrals/audit*` | **MISSING** |
| `referral_campaigns` | referralService campaign CRUD; `/api/referrals/campaigns*` | **MISSING** |
| `referral_analytics` | referralService getAnalytics/getAnalyticsHistory (JS-computed over the two base tables); `/api/referrals/analytics*` | **MISSING** |
| `referral_reversals` | referralService reversal lifecycle; `/api/referrals/reversals*` | **MISSING** |
| `referral_settings` | referralService getSettings/updateSettings; `/api/portal/referrals/settings` | **MISSING** |

### Trace of dependent ERP code
- **referralService**: `backend/services/referralService.cjs` (1099 lines) — all 8 tables.
- **Portal referral endpoints**: `backend/routes/portal.cjs` L745–L856 (`/api/portal/referrals`,
  `/referrals/rewards`, `/referrals/settings`, `/referrals/stats`, `/referrals/:id`,
  `/referrals/:id/timeline`, `POST /referrals`, `/referrals/customers/search`) →
  `portalService.getReferrals` etc. (`backend/services/portalService.cjs` L1030–L1240).
- **Staff referral module**: `backend/routes/referralRoutes.cjs` → mounted at `/api/referrals`
  (staff JWT, role-gated Admin/Manager/Accountant/Clerk/Viewer) in `backend/index.cjs` L1077.
- **Wallet behavior**: reward approval writes `wallet_transaction_id` onto the reward row
  (referralService L1070); portal wallet balance = `customers.walletBalance` +
  `customer_payments` method `wallet` + `wallet_transactions` (portalService getWallet
  L958–L970). `wallet_transactions` EXISTS live (baseline) → wallet is READY once referrals
  are; wallet itself is not blocked.
- **Referral analytics**: computed in JS (referralService L860–L935) over
  `customer_referrals`/`referral_rewards` — NO database RPC required (see §7).
- **Referral rewards**: `referral_rewards.status` ∈ pending/approved/paid/cancelled;
  portalService getReferralStats tallies approved/paid/pending.
- **Referral UI (ERP staff)**: `frontend/` referral module (per `backend/docs/referral-module.md`).

### Verdict: **INCOMPLETE / NEEDS REVIEW — do not apply as-is.**
1. Creates only 2 of the 8 required tables.
2. `CREATE TABLE IF NOT EXISTS` will NOT convert the two live COLUMNAR tables to the
   envelope contract — applying 0003 leaves referrals broken (writes → 42703/PGRST204,
   reads → strict 500). The live copies are EMPTY (0 rows), so a clean drop + recreate to
   envelope (in a follow-on migration) is safe.
3. No `updated_at` trigger, no realtime publication membership for the new tables (the
   0001 realtime DO-loop already ran; new tables need explicit `ALTER PUBLICATION`).

## 4. MIGRATION 0004 — REFERRAL RLS: SECURITY-CRITICAL REVIEW

### What it changes
Enables RLS on `customer_referrals` + `referral_rewards`; drops stale policy names; adds
`allow_all_customer_referrals` and `allow_all_referral_rewards`
(`FOR ALL TO authenticated USING (true) WITH CHECK (true)`). Verification SELECTs included.

### Analysis
- **Exactly which tables**: the 2 referral tables only. The other 6 referral tables and all
  5 lifecycle tables remain with NO RLS configuration → default deny for non-`service_role`
  (safe, but inconsistent).
- **Policy conditions**: unconditional (`USING true`). This is the same `allow_all` pattern
  as 145 baseline tables (documented B15 in `backend/docs/sync-infra-audit-2026-08-11.md`).
- **Do the policies restrict customers?** NO. Any authenticated Supabase user (any ERP
  staff user holding a Supabase `auth` account/JWT) can SELECT/INSERT/UPDATE/DELETE every
  customer's referral and reward rows via direct PostgREST access. There is no
  `customer_id` condition. (Compare: `portal_tickets_customer_isolation`,
  `portal_notifications_customer_isolation` in 0001 DO scope by `portal_users.customer_id`.)
- **Are authenticated Portal users supported?** Not via these policies. Portal customers
  authenticate through the ERP Node backend (HS256 `JWT_SECRET` tokens), not Supabase
  auth — their tokens are rejected by PostgREST, so they cannot reach these tables
  directly. `allow_all … TO authenticated` never matches anon.
- **Are ERP staff affected?** Yes, positively for staff (they can manage referrals through
  direct REST if they hold a Supabase JWT — consistent with the rest of the schema), and
  this is the exposure surface: any compromised staff/agent Supabase credential sees ALL
  referral data. Same risk class as every other `allow_all_*` table (B15).
- **Are service-role/backend operations affected?** NO — the Node backend and
  cloud-sync use the service role (`SUPABASE_SECRET_KEY`), which bypasses RLS entirely.
- **Would existing workflows break?** No — no table shape change, no DROP of data, no
  constraint changes. Portal ticket/notification isolation policies are untouched.
- **Recursive RLS?** No recursion risk in these policies (no subqueries). Note the
  customer-isolation policies in 0001 use subqueries against `portal_users` keyed on
  `auth.uid()::text` — those only ever match a portal user if that user ALSO exists as a
  Supabase auth user with a matching UUID-string id (out of scope for this phase; not
  changed by 0004).

### Flagged risks
- Cross-customer exposure: any `authenticated` Supabase user can read/write all referral
  and reward rows (mitigation today is purely application-level: `customerFilter`/
  `withCustomerScope` + JS re-verification in `scopedRows` for portal reads).
- 0004 does not cover 6 of the 8 referral tables (their RLS is absent until a follow-on
  migration extends the same policy set).

### Verdict: **NOT customer-restricting — consistent with the single-company posture, but SECURITY REVIEW REQUIRED** (same class as baseline B15; acceptable only while the app-level boundary is the agreed isolation model).

## 5. MIGRATION 0005 — QUOTATION REQUESTS: SAFE, IDEMPOTENT, LIVE-COMPATIBLE

### Table & schema
`quotation_requests`: `id TEXT PK, data JSONB NOT NULL, created_at, updated_at, version`
+ 3 indexes (`data->>customer_id`, `data->>status`, `created_at`) + `trg_update_updated_at`
+ `allow_all_quotation_requests` RLS + realtime membership (idempotent DO block).

### Live reality
The table ALREADY EXISTS live in EXACTLY this envelope shape (probed: `select=data,
version,created_at,updated_at` → HTTP 200), currently 0 rows. Applying 0005 is therefore a
no-op for creation and installs the missing indexes, trigger, RLS policy and realtime
membership. It was created out-of-band (like `rls_auto_enable()`, §6 of the sync audit) —
0005 is needed so the chain reproduces it.

### Status model (from code)
- `REQUEST_STATUS` (`portalLifecycleService.cjs` L22): draft, submitted, assigned,
  under_review, waiting_for_customer, ready_for_conversion, converted, rejected, cancelled.
- `QUOTATION_STATUS` L34: ready, accepted, rejected, revision_requested, converted, expired.

### Workflow traces (unchanged by this migration)
Customer Portal request → quotation_request → ERP staff → quotation → customer Portal:

- **Portal (Sasa-facing)**: `POST /api/portal/requests` → `createQuotationRequest`
  (server-authoritative pricing/promotions, `status=submitted`, timeline event,
  notification) → `GET /api/portal/requests` / `/:id` → customer views; `POST
  /requests/:id/cancel`; `POST /quotations/:id/accept|reject|revision`; `GET /document-chain`.
- **ERP staff**: `/api/portal/admin/requests` (get, put, reject, clarify, open, assign,
  mark, delete) → `generate-quotation` → `complete-quotation` (writes the official
  `quotations` row, `status=ready`, request → `converted`, version snapshot) →
  `convert-to-order` / `generate-order` + `complete-order` (writes `sales_orders`).
- **Existing ERP workflow intact**: the ERP-native `quotations → sales_orders → invoices`
  chain is untouched. `quotation_requests` is a NEW customer-initiated front door; the
  portal lifecycle writes INTO the existing `quotations` and `sales_orders` tables
  (present in 0001). Nothing is replaced, simplified, or redesigned.

### Sasa screens depending on 0005
- `QuotesTab.tsx` + `QuoteRequestModal.tsx` (list/submit requests) — adapter calls
  `GET/POST /requests`.
- `DashboardTab.tsx` (recent requests/quotation activity) — dashboard reads
  `quotation_requests`.
- `OrdersTab.tsx` (post-conversion order visibility via `sales_orders`).
- `InvoicesTab.tsx`/`DeliveriesTab.tsx` downstream chain views.

### Verdict: **SAFE** — idempotent, non-destructive, no ALTER of existing tables, no data
changes, no constraints that could block ERP data. Only dependency: 0001 (satisfied).

## 6. PORTAL LIFECYCLE / DOCUMENT TABLES — SCHEMA DRIFT / MISSING MIGRATION

All five are referenced by production code, exist in the backend SQLite schema
(`backend/db.cjs` L2217–L2294) as the canonical contract, and are **absent from both the
migration chain and the live database**:

| Table | Creation migration | Purpose | Application usage | API usage | RLS | Dependencies | Live status |
|---|---|---|---|---|---|---|---|
| `portal_timeline_events` | **NONE (MISSING)** | Merged chronological timeline per document (request/quotation/order/invoice) | `portalLifecycleService.addTimeline` (every workflow event), `getTimeline`, `getRecentActivity`; `workflowEngine` chain events | `GET /api/portal/timeline`; admin `GET /api/portal/admin/activity` | none (default deny) | quotation_requests/quotations/sales_orders ids | **MISSING LIVE (404)** — writes fail silently (repo.upsert → null), reads return [] (non-strict) |
| `portal_downloads` | **NONE (MISSING)** | Download audit trail + analytics counters | `recordDownload` (portal `POST /downloads`), admin activity/analytics | `POST /api/portal/downloads`; admin activity | none | documents/quotations/orders | **MISSING LIVE (404)** — silent write failure |
| `document_versions` | **NONE (MISSING)** | Immutable point-in-time snapshots (quotation generation/regeneration) | `workflowEngine.createVersionSnapshot/listDocumentVersions/getDocumentVersion` (L102–L130) | `GET /quotations/:id/versions(/:version)` (portal + admin) | none | quotations | **MISSING LIVE (404)** — version snapshots silently dropped |
| `document_signatures` | **NONE (MISSING)** | Decision trail (accepted/rejected/revision) | `recordSignature` on quotation accept/reject/revision (portalLifecycleService L602, L1858) | `GET /quotations/:id/signatures` (portal + admin) | none | quotations | **MISSING LIVE (404)** — silent write failure |
| `document_comments` | **NONE (MISSING)** | Threaded discussion (customer/internal visibility) | portalLifecycleService L2262–L2294; portal + admin comment handlers | `GET/POST /comments` (portal + admin) | none | documents/quotations/orders | **MISSING LIVE (404)** — silent write failure |

**Current live behavior**: every write to these tables fails silently (the repo returns
null on transport/404 errors — `supabaseRepository.upsert`), and every non-strict read
returns `[]` (404 → null → `[]`), so the portal renders with empty timelines/history
rather than 500s. The single STRICT read is `portalService.getReferralTimeline`
(`getAllFrom('referral_timeline', …)` → `getAllStrict`) → **`GET /api/portal/referrals/:id/
timeline` returns 500 today**.

**Verdict: SCHEMA DRIFT / MISSING MIGRATION for all 5 tables.** A new migration is
required (recommended envelope contract: `{id TEXT PK, data JSONB, created_at, updated_at,
version}` + `data->>` indexes + `trg_update_updated_at` + realtime membership — matching
how the lifecycle shims filter via `data->>doc_type` / `data->>doc_id`).

## 7. REFERRAL RPCs / FUNCTIONS

- **Repo-wide search for RPC invocations** (`.rpc(` / `rpc('` in backend) → **zero matches**.
  No production code path calls any database function for referrals.
- `expire_referrals()` and `generate_referral_analytics()` are NOT referenced by any code
  and exist in NO migration file. They appear only in historical documentation
  (`backend/docs/referral-module.md`) describing long-superseded standalone SQL files
  (`supabase-referral-tables-v2.sql`, etc.) that are NOT in the repository.
- Referral analytics are computed **in JavaScript** by `referralService.getAnalytics` /
  `getAnalyticsHistory` (L860–L935) over the two base tables — no DB function needed.
- Expiry is a service method (`referralService.expire`, route `PATCH /api/referrals/:id/
  expire`) — no scheduler/RPC.
- Live RPC surface (verified): only `is_company_staff`, `get_current_company_id`,
  `set_user_app_metadata`, `apply_promotion_usage` (+ orphan `rls_auto_enable` — no source
  file, §6 sync audit).

**Verdict: no RPCs are required. Creating `expire_referrals()` / `generate_referral_
analytics()` is optional (would be unused by current code) and therefore NOT part of this
phase's blockers.**

## 8. DATABASE → API → SASA DEPENDENCY MAP

| Feature | Database objects | ERP service | ERP endpoints | Sasa feature | Status |
|---|---|---|---|---|---|
| Referrals | `customer_referrals` (COLUMNAR live), `referral_rewards` (COLUMNAR live); 6 tables MISSING | referralService.cjs; portalService L1030–1240 | `/api/referrals/*` (staff); `/api/portal/referrals*` (customer) | `ReferralsTab.tsx` | **BLOCKED** — shape mismatch + 6 missing tables |
| Wallet | `wallet_transactions` (EXISTS) + `customers.walletBalance` | portalService.getWallet L950–1000 | `GET /api/portal/wallet` | wallet section (Account) | **READY** |
| Dashboard | customers, invoices, sales_orders, quotation_requests (EXISTS), quotations, portal_notifications, engagement_point_balances, wallet_transactions, shipments | portalService.getDashboard L71+ (strict reads) | `GET /api/portal/dashboard` | `DashboardTab.tsx` | **READY** (was 500 while quotation_requests was absent; now present live) |
| Quotation Requests | `quotation_requests` (EXISTS envelope, 0 rows) | portalLifecycleService L775+; portalService getRequests | `GET/POST /api/portal/requests*`; admin `/api/portal/admin/requests*` | `QuotesTab.tsx`, `QuoteRequestModal.tsx` | **READY** (live); 0005 required for chain reproducibility |
| Documents | `documents` (baseline) + quotations/sales_orders + 5 lifecycle tables MISSING | portalService.getDocuments; portalLifecycleService document chain | `GET /api/portal/documents`, `/document-chain`, `/timeline`, `/downloads` | Invoices/Orders/Deliveries tabs, history panels | **PARTIAL** — core READY; lifecycle history BLOCKED (5 tables missing) |
| Statements | `customer_payments`, `invoices` | portalService.getStatements | `GET /api/portal/statements` | `StatementsTab.tsx`, StatementPrintModal | **READY** |
| Notifications | `portal_notifications` (baseline, customer-isolation RLS) | portalService; portalLifecycleService notifications | `GET /api/portal/notifications*` | `NotificationDrawer.tsx` | **READY** |
| Lifecycle/timeline | 5 tables MISSING | portalLifecycleService addTimeline/versions/signatures/comments/downloads | `/timeline`, `/comments`, `/downloads`, `/quotations/:id/versions(/:v)`, `/signatures`; admin `/activity` | Dashboard activity, quote detail timeline | **MISSING SCHEMA** (writes silent, reads empty) |

## 9. SAFE MIGRATION ORDER (derived, NOT executed)

Derived from code dependency + live drift:

1. **0005** `quotation_requests` — apply first (idempotent; live-compatible; unblocks chain
   reproducibility for the already-working dashboard/requests/documents).
2. **NEW 0006 (referral reconciliation + completion)** — requires a corrected 0003-style
   migration that:
   a. reconciles the two live COLUMNAR `customer_referrals`/`referral_rewards` tables to
      the envelope contract (0 rows verified live → drop + recreate is safe; still verify
      count first at apply time),
   b. creates the 6 missing tables (`referral_timeline`, `referral_audit_logs`,
      `referral_campaigns`, `referral_analytics`, `referral_reversals`,
      `referral_settings`) with envelope contract + `data->>` indexes +
      `trg_update_updated_at` + realtime membership.
3. **0004 extended** — RLS enable + `allow_all` policies on ALL 8 referral tables (0004 as
   written covers only 2).
4. **NEW 0007 (lifecycle tables)** — 5 tables (portal_timeline_events, portal_downloads,
   document_versions, document_signatures, document_comments) with envelope contract +
   indexes (`data->>doc_type`/`data->>doc_id`) + trigger + realtime membership.
5. **NO RPC migration needed** (nothing references RPCs).
6. **Post-migration code follow-up (later phase, out of scope)**: add referral tables to
   `sync.cjs` ALLOWED_TABLES (currently intentionally excluded at sync.cjs L77–78) and
   extend the verifier to cover the new tables.

Rationale for ordering: 0005 first (already live, zero risk, biggest unblock); 0006 before
0004 (policies require tables); 0007 independent of referrals but required before Sasa
lifecycle features are meaningful.

## 10. ROLLBACK ANALYSIS

| Migration | Reversible | Drops anything | Changes existing data | Changes RLS | Destructive constraints | Safe on DB with existing ERP data |
|---|---|---|---|---|---|---|
| 0005 | Yes — `DROP TABLE quotation_requests` (0 rows today; loses only portal requests if any later) | no (creates only) | no | yes (enables RLS + allow_all policy on that table only) | no | **Yes** — no ALTER on baseline tables |
| 0003 (as written) | Yes — `DROP TABLE` the 2 tables | no (IF NOT EXISTS; live tables stay columnar) | no | no | no | Partially — does not fix the live shape (that's the problem); reconciled 0006 drop/recreate of 2 EMPTY tables is safe |
| 0004 (extended) | Yes — `DROP POLICY` / `DISABLE ROW LEVEL SECURITY` | no | no | yes (adds allow_all on referral tables) | no | **Yes** |
| 0007 lifecycle | Yes — `DROP TABLE` (loses only lifecycle audit/version/signature/comment/download history) | no | no | no (default deny) | no | **Yes** |

No migration alters an existing baseline table, drops data, or introduces FKs/unique
constraints that could conflict with existing customer/quotation/order/invoice rows.
Note: `referral_code` uniqueness is NOT enforced at the DB level (it lives inside `data`
JSONB) — code-level `generateReferralCode` uniqueness check only.

## 11. PRODUCTION DATA SAFETY

- All pending/new migrations **create** tables (IF NOT EXISTS) + add indexes/triggers/
  policies/realtime membership. None ALTER, UPDATE, or DELETE existing ERP data.
- The 3 drift tables are **empty** (0 rows verified live) → any drop/recreate in the
  reconciliation migration loses nothing.
- Affected live objects: existing customers, invoices, orders, quotations, payments,
  inventory, staff users, portal users, portal sessions → **untouched**.
- RLS enable on `quotation_requests` + referral tables affects only those (empty) tables;
  staff/backend service-role paths bypass RLS and are unaffected.
- No data reset, no destructive SQL performed or planned in this phase.

## 12. SECURITY RISKS

1. **`allow_all` on referral tables (0004)** — any authenticated Supabase user can read/
   write ALL customers' referral + reward data via direct REST. Same risk class as the 145
   `allow_all_*` baseline tables (B15, sync audit). Acceptable only under the single-company
   app-level-boundary model; not a per-customer isolation.
2. **Live COLUMNAR referral tables** — if RLS is not enabled on them (unverifiable
   read-only; likely created before the RLS hardening), anon key access could be open.
   Applying 0004/0005 closes this.
3. **6 referral + 5 lifecycle tables created without policies** (future 0006/0007) —
   default deny for non-service-role → safe; keep it that way or add `allow_all` for
   consistency with the rest of the schema (staff direct access only).
4. **Portal customer isolation relies solely on application logic** — `customerFilter`/
   `withCustomerScope`/`scopedRows` JS re-verification (portalScope.cjs). DB-level
   isolation policies exist only for tickets/notifications/attachments (0001). No new
   customer-scoped policy is introduced by 0003–0005.
5. **`referral_code` uniqueness not DB-enforced** (inside JSONB envelope).
6. **quote request numbers generated app-side** (`workflowEngine.nextYearScopedNumber`) —
   no DB unique constraint; races possible.

## 13. EXACT BLOCKERS

1. **Referral tables wrong shape live** — `customer_referrals`/`referral_rewards` are
   COLUMNAR on live; backend envelope contract requires `data` JSONB. 0003 as written does
   NOT fix this → portal referrals 500 (strict read on `data->>customer_id` → 42703).
2. **6 referral tables missing** — `referral_timeline`, `referral_audit_logs`,
   `referral_campaigns`, `referral_analytics`, `referral_reversals`, `referral_settings`
   (all HTTP 404 live; not in 0003).
3. **5 lifecycle tables missing** — `portal_timeline_events`, `portal_downloads`,
   `document_versions`, `document_signatures`, `document_comments` (404 live; no migration).
4. **Referral RLS absent live** — 0004 pending; RLS state on the 2 live tables unverified.
5. **Chain reproducibility** — 0003/0004/0005 still pending in `supabase/migrations/` even
   though 3 of the 5 objects exist live out-of-band.
6. **`referral_timeline` strict read 500s** — `GET /api/portal/referrals/:id/timeline`
   (missing table).
7. **sync.cjs allow-list** — referral tables intentionally excluded (sync.cjs L77–78);
   post-migration code change required (later phase, not this one).
8. **NOT blockers**: dashboard/requests/documents (quotation_requests now exists live),
   wallet (table exists), referral RPCs (none referenced).

## 14. RECOMMENDED MIGRATION PROCEDURE (NOT EXECUTED)

1. Take a full Supabase backup (Dashboard → Database → Backups, or `pg_dump`) before any
   apply; verify restore works.
2. Apply **0005** (idempotent). Re-run `verify-sync-contract.cjs` → still 172/172.
3. Author **0006**: verify counts on the 2 referral tables (expect 0); reconcile columnar →
   envelope (drop + recreate only if still empty); create the 6 missing tables (envelope
   contract), `data->>` indexes, `trg_update_updated_at`, realtime membership. Apply.
4. Apply **0004 extended** (all 8 referral tables: enable RLS + `allow_all_*` policies).
5. Author **0007**: create the 5 lifecycle tables (envelope), indexes, trigger, realtime.
   Apply.
6. Re-run `verify-sync-contract.cjs` and a NEW extended verifier covering all 14 new/drift
   tables (existence + envelope + RLS + anon-blocked + updated_at trigger probe on one).
7. Execute the test plan (§15). Only then: code follow-ups (sync allow-list, portalScope
   additions, Sasa adapter) in the appropriate phase.
8. Each migration runs in its own transaction (Postgres DDL is transactional) — a failed
   apply rolls back cleanly.

## 15. REQUIRED POST-MIGRATION TESTS

Setup: two portal users, Customer A and Customer B (existing `portal_users`), plus a staff
account and the service role.

1. **Customer A/B isolation — referrals**: A creates a referral; B's `GET /api/portal/
   referrals`, `/referrals/rewards`, `/referrals/stats`, `/referrals/:id/timeline` must
   never contain A's rows (app-level scope + direct REST via an `authenticated` key must
   be denied or, under the current posture, flagged as B15 risk).
2. **Customer A/B isolation — quotation requests**: A submits a request; B's `GET /api/
   portal/requests` and `GET /requests/:id` (A's id) must not return it; direct REST read
   by A of B's request id → 0 rows.
3. **Customer A/B isolation — documents**: A's `GET /api/portal/documents`,
   `/document-chain` must not include B's; direct REST id probes return 0 rows.
4. **Customer A/B isolation — lifecycle**: A's `/timeline`, `/comments`,
   `/quotations/:id/versions`, `/signatures`, `POST /downloads` + admin `/activity` must
   only ever surface A's records.
5. **ERP staff access**: staff referral module CRUD (`/api/referrals/*`) and portal admin
   (`/api/portal/admin/requests*`, generate-quotation, complete-quotation, convert-to-order)
   still work end-to-end.
6. **Backend services**: dashboard, requests, referrals, wallet, notifications endpoints
   return data (no 500s); `GET /api/portal/referrals/:id/timeline` no longer 500s.
7. **Existing data intact**: invoices/orders/payments/customers counts and values unchanged
   before vs after (snapshot comparison).
8. **Portal auth intact**: login, refresh, logout, sessions, 2FA flows unchanged.
9. **Lifecycle writes succeed**: after a quotation is generated, version 1 exists in
   `document_versions`; accept/reject creates a `document_signatures` row; `POST /downloads`
   creates a `portal_downloads` row; timeline rows appear for request events.
10. **RLS posture**: anon key SELECT on all 14 new/drift tables → 0 rows; updated_at
    trigger fires (probe row, deleted after); realtime publication membership present.
11. **Referral code uniqueness**: duplicate `referral_code` rejected (code-level) — confirm
    behavior is unchanged post-migration.

---

## PHASE 5 STATUS

```
BASELINE:            READY     — 159/159 tables + RPC surface verified live (172/172, 2026-08-14)
LIFECYCLE TABLES:    BLOCKED   — 5 tables missing from chain AND live (404); writes silent, reads empty
QUOTATION REQUESTS:  READY     — table exists live in exact envelope shape (0 rows); 0005 pending for reproducibility
REFERRALS:           BLOCKED   — 2 tables wrong shape live (columnar vs envelope) + 6 tables missing
REFERRAL RLS:        BLOCKED   — 0004 pending; covers only 2 of 8 tables; provides NO customer isolation
REFERRAL RPCs:       READY     — zero RPCs referenced by code; analytics are JS-computed; none required
DASHBOARD:           READY     — live now (quotation_requests present); was 500 only while table absent
DOCUMENTS:           READY     — core chain (documents/quotations/orders) live; lifecycle history sub-features BLOCKED
SECURITY:            REVIEW REQUIRED — allow_all referral policies = B15 class; isolation remains app-level only
PRODUCTION SAFETY:   READY     — all pending migrations create-only; drift tables empty; no ALTER of ERP data
MIGRATION ORDER:     READY     — 0005 → new 0006 (referral reconcile+complete) → 0004 extended → new 0007 (lifecycle)
```

### Headline findings
1. **Live DB is verified and baseline-exact** (172/172 today), but has drifted AHEAD of the
   chain: `quotation_requests` already exists (envelope, empty) and the 2 referral tables
   exist in a legacy COLUMNAR shape (empty).
2. **0003 is INCOMPLETE** (2 of 8 tables) and **cannot repair the live shape mismatch** —
   a reconciled 0006 is required before referrals can work.
3. **0004 as written is not customer-isolating** (`USING true`) — same `allow_all` class as
   145 baseline tables; isolation remains application-level.
4. **0005 is safe and idempotent** — the dashboard/requests/documents functionality it
   represents is already live; apply for chain reproducibility.
5. **All 5 lifecycle tables are schema drift** — missing from migrations and live; new
   migration 0007 required for versioning/signatures/comments/downloads/timeline.
6. **No RPC work is needed** for referrals.
7. Dashboard is no longer blocked (contrary to the Phase 3 snapshot) — only referrals and
   lifecycle features remain blocked.

Nothing was applied, changed, or executed beyond the repo's own read-only verifier and
read-only SELECT/COUNT probes. STOP condition met — findings shown above.
