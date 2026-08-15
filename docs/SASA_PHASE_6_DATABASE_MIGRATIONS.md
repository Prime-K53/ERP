# SASA PHASE 6 — DATABASE RECONCILIATION IMPLEMENTATION
# Migration Creation Only — NOTHING APPLIED TO ANY DATABASE

- Date: 2026-08-14
- Mode: MIGRATION FILE CREATION + STATIC VALIDATION ONLY.
  NO migrations applied (`supabase db push` / `migration up` / `db reset` / raw DDL NOT executed).
  NO live/development database touched. NO data modified. NO Sasa changes.
  NO ERP application code changes. NO multi-tenancy introduced. Single-company preserved.

---

## 1. MIGRATION 0005 DECISION — PRESERVED UNCHANGED

`0005_portal_quotation_requests.sql` was inspected against the Phase 5 findings
(quotation_requests exists live in the exact envelope shape: id, data, created_at,
updated_at, version; 0 rows; dashboard/requests/documents already functional).

**Decision: no rewrite.** The migration is already correct and idempotent for its purpose:

- `CREATE TABLE IF NOT EXISTS` → no-op on the live table (does NOT drop or recreate it →
  live data preserved).
- Installs the missing indexes (`data->>customer_id`, `data->>status`, `created_at`),
  the `trg_update_updated_at` trigger, the RLS policy and realtime membership — the
  exact chain-reproducibility objects that do not yet exist live.
- No column conflicts (additive only), no policy conflicts, no destructive statements.

The one property worth noting: 0005's RLS policy is `allow_all_quotation_requests`
(`USING true`), the same permissive class as the 145 baseline `allow_all_*` tables.
Per the Phase 6 mandate §1 ("do not unnecessarily rewrite"), 0005 is left untouched.
This is documented as a known posture item (§14) — quotation_requests is customer-
readable data under an allow_all policy, consistent with the baseline but a candidate
for the same isolation treatment if the baseline posture is ever revisited.

## 2. 0006 REFERRAL RECONCILIATION — `0006_reconcile_referral_schema.sql` (CREATED)

Purpose: reconcile the live referral tables with the current backend envelope contract
and create the six missing tables the application references. Full annotated source in
`supabase/migrations/0006_reconcile_referral_schema.sql`.

### Refined live-schema finding (supersedes the Phase 5 "columnar" label)

Read-only probes (SELECT only, service key) established the live tables are **NOT fully
columnar** — they match the 0003 envelope shape minus one column:

| Table | Live columns (verified) | Missing vs envelope contract |
|---|---|---|
| `customer_referrals` | id, data, company_id, created_at, updated_at | `version INTEGER NOT NULL DEFAULT 0` |
| `referral_rewards` | id, data, company_id, created_at, updated_at | `version INTEGER NOT NULL DEFAULT 0` |

Row counts: 0 / 0 (verified via `Prefer: count=exact` → `content-range: */0`).

### Reconciliation strategy — OPTION A (additive ALTER), chosen deliberately

NOT rename/recreate, NOT drop/create:
1. **Zero data** → no preservation conflict.
2. **Additive ALTER is fully reversible** (`DROP COLUMN version` if ever needed) and
   never risks data loss, unlike rename/drop strategies.
3. **Deterministic on any target**: fresh chain (0003 already created the tables) and
   live DB converge to the same final shape.
4. Belt-and-braces DO block adds `data` if some legacy variant ever lacks it.

Sequence inside 0006:
0. **Data-safety guard** (RAISE EXCEPTION if either table has rows — "Unexpected
   referral data detected — migration halted.").
1. `CREATE TABLE IF NOT EXISTS` (both tables, full envelope) — covers a chain that
   skips 0003; no-op elsewhere.
2. `ALTER TABLE ... ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 0` —
   the only live repair needed.
3. Guarded `data` column addition for legacy variants.
4. `CREATE TABLE IF NOT EXISTS` for the six missing tables (envelope contract).
5. 31 expression/btree indexes over `data->>` predicates used by PostgREST filters.
6. `trg_update_updated_at` triggers on all 8 tables (0001 section-3 pattern).
7. RLS: enable on all 8; DROP the 0004 `allow_all_*`/`tenant_*` policies; install
   customer-isolation policies (§6); staff/global tables left policy-less (default deny).
8. Realtime publication membership for all 8 (idempotent).

### Company_id column
The two live tables carry a NULL `company_id` column (inherited from 0003's script).
It is retained (not dropped — dropping is destructive and pointless for single-company),
documented as unused. No `tenant_id`/`organization_id` introduced.

## 3. 0006 TABLE INVENTORY — REFERRAL COLUMNS

All 8 referral tables use the envelope contract: `id TEXT PRIMARY KEY`, `data JSONB
NOT NULL DEFAULT '{}'`, `created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`, `updated_at
TIMESTAMPTZ NOT NULL DEFAULT NOW()`, `version INTEGER NOT NULL DEFAULT 0`.

Domain fields live inside `data` (written by `referralService` via the SQL→REST shim →
`supabaseRepository.toSupabaseRow`). Full field inventory per table (traced from
`backend/services/referralService.cjs` INSERT/UPDATE statements and portalService reads):

| Table | Domain fields (inside `data`) | Purpose | Indexes (expression) |
|---|---|---|---|
| `customer_referrals` | id, customer_id (referred), referred_by_id (referrer), referred_by_name, referral_code, status, pending_invoice_id, pending_invoice_amount, converted_invoice_id, converted_at, notes, created_at, updated_at, deleted_at | The referral relationship | referred_by_id, customer_id, referral_code, status, created_at |
| `referral_rewards` | id, referral_id, customer_id (earner), invoice_id, invoice_amount, amount, status (pending/approved/paid/cancelled), approved_at, approved_by, cancelled_at, cancelled_by, cancel_reason, wallet_transaction_id, created_at, updated_at | Reward lifecycle + wallet linkage | referral_id, customer_id, status, created_at |
| `referral_timeline` | id, referral_id, event_type, title, description, amount, actor_id, actor_name, metadata_json, timestamp | Per-referral event history | referral_id, event_type, timestamp |
| `referral_audit_logs` | id, entity_type, entity_id, action, actor_id, actor_name, field_name, old_value, new_value, reason, correlation_id, ip_address, user_agent, timestamp | Staff audit trail | entity_type+entity_id, actor_id, timestamp |
| `referral_campaigns` | id, name, description, start_date, end_date, status, reward_type, reward_value, reward_percentage, min_purchase_amount, max_reward_amount, max_rewards_per_customer, max_total_rewards, total_rewards_given, target_segments_json, excluded_customers_json, bonus_multiplier, terms_json, created_by, approved_by | Campaign config | status, start_date+end_date, created_at |
| `referral_analytics` | id, period, period_start, period_end, total_referrals, active_referrals, converted_referrals, total_rewards_amount, approved_rewards_amount, paid_rewards_amount, pending_rewards_amount, average_reward_amount, conversion_rate, revenue_attributed, roi, generated_at | JS-generated analytics snapshots | period+period_start, generated_at |
| `referral_reversals` | id, reward_id, reason, status (pending/approved/completed/rejected), requested_by, approved_by, approved_at, rejected_by, rejected_at, reject_reason, completed_at, notes, created_at, updated_at | Reward reversal lifecycle | reward_id, status, created_at |
| `referral_settings` | id, settings_json (enabled, rewardType, rewardValue, rewardPercentage, minPurchaseAmount, maxRewardAmount, expiryDays, requireApproval …) | Global referral config | — |

No speculative tables were added. Exactly the 8 tables referenced by
`referralService.cjs`, `portalService.cjs`, `referralRoutes.cjs` and
`routes/portal.cjs` were created.

## 4. LEGACY SCHEMA RECONCILIATION STRATEGY — DOCUMENTED DECISION

- **Option A (additive ALTER) selected.** Rationale above (§2). Live tables already
  carry the envelope columns; only `version` is added. Nothing dropped, renamed, or
  recreated. Fully idempotent and reversible.
- Option B (rename + recreate) rejected: unnecessary churn, renames would break any
  external dependency on the table OIDs/names during the window, and rollback is more
  complex.
- Option D (drop/create) rejected outright: destructive without benefit.

## 5. REFERRAL DATA-SAFETY CHECK — VERIFIED

- Read-only probe (2026-08-14): `customer_referrals` and `referral_rewards` → 0 rows
  each (`content-range: */0`).
- 0006 embeds a runtime guard that re-verifies row counts on the target database and
  **halts the migration** (`RAISE EXCEPTION 'Unexpected referral data detected —
  migration halted.'`) if rows are ever present at apply time.
- No data deleted. The other six tables do not exist anywhere (fresh creates only).

## 6. REFERRAL RLS DESIGN — CUSTOMER ISOLATION (replaces 0004's USING true)

Ownership fields derived from application code (NOT assumed):

| Table | Owner key | Evidence |
|---|---|---|
| `customer_referrals` | `data->>'referred_by_id'` | portalService.createReferral writes referred_by_id = authenticated portal customer (portalService.cjs L1177); portal reads filter `data->>referred_by_id eq customerId` (L1040, L1213) |
| `referral_rewards` | `data->>'customer_id'` | Earning customer; portal reads filter `data->>customer_id eq customerId` (L958, L1219); staff approval writes wallet_transaction_id |
| `referral_timeline` | `data->>'referral_id'` ∈ caller's referrals | Portal timeline is ownership-gated by the parent referral (portalService.getReferralTimeline L1094–1100) |

Policy shape (mirrors 0001's `portal_tickets_customer_isolation`):
```
USING (data->>'<owner_key>' = (SELECT customer_id FROM public.portal_users WHERE id = auth.uid()::text))
WITH CHECK (same)
```
- **SELECT/INSERT/UPDATE/DELETE**: single `FOR ALL` policy per table with USING+WITH
  CHECK — the 0001 portal-table convention (not separate per-command policies).
- **What it permits**: an `authenticated` Supabase identity whose id matches a
  `portal_users` row may touch only rows whose owner key equals that portal user's
  customer_id. `WITH CHECK` prevents creating/editing rows for other customers.
- **What it denies**: every other authenticated identity (including ERP staff holding
  Supabase JWTs) → zero rows via direct REST. All staff referral endpoints
  (`/api/referrals/*`) are backend-mediated (service role bypasses RLS) → **staff
  operations unaffected**.
- **Portal customers**: authenticate via the ERP backend (HS256 JWT, not Supabase
  auth) → cannot reach PostgREST directly → denied by default (defense-in-depth).
  The policy activates scoping only if a customer ever holds a Supabase auth identity.
- **Staff/global tables** (`referral_audit_logs`, `referral_campaigns`,
  `referral_analytics`, `referral_reversals`, `referral_settings`): **no policy →
  default deny** for direct REST. They are not customer-owned; all access is backend
  (service role). This deliberately avoids the `USING true` class for them.
- **Recursion check**: referral_timeline policy subqueries customer_referrals (a
  different table), whose own policy only references portal_users → no recursion cycle.
  portal_users has a permissive policy in 0001 → the identity subquery always resolves.

## 7. MIGRATION 0004 TREATMENT — PRESERVED IMMUTABLE, CORRECTED IN 0006

- **0004 is NOT modified.** The repository's chain convention (AGENTS.md: numeric order,
  idempotent migrations, historical migrations already applied) treats applied history
  as immutable; rewriting 0004 would invalidate any environment where it already ran.
- 0004 remains in place (runs at step 4 of the chain; idempotent; creates transient
  `allow_all_*` policies on the two tables).
- **The corrected RLS is applied in 0006** (step 5, §6): 0006 DROPs the
  `allow_all_customer_referrals` / `allow_all_referral_rewards` (plus legacy
  `tenant_*`) policies and installs the customer-isolation policies. Net chain result
  is deterministic: the final posture never contains `USING true` on customer-owned
  referral tables, regardless of whether 0004 ran.
- Final chain: `0001 → 0002 → 0003 → 0004 → 0005 → 0006 → 0007`.

## 8. 0007 LIFECYCLE SCHEMA — `0007_portal_lifecycle_tables.sql` (CREATED)

Traced write/read contracts (all through the SQL→REST shim → envelope contract):

| Table | Fields written (source line) | Read paths |
|---|---|---|
| `portal_timeline_events` | id, customer_id, doc_type, doc_id, event_type, title, description, actor_type, actor_id, actor_name, metadata (portalLifecycleService.cjs addTimeline L485–494) | getTimeline L2123 (doc_type+doc_id+customer_id), getRecentActivity L2166, portal `/timeline`, admin `/activity` |
| `portal_downloads` | id, customer_id, portal_user_id, doc_type, doc_id, doc_number, ip_address, user_agent (recordDownload L2093–2099) | getRecentActivity L2216, admin `/activity`, analytics |
| `document_versions` | id, customer_id, doc_type, doc_id, version, snapshot (JSON string), reason, created_by, created_by_name (workflowEngine.createVersionSnapshot L102–116) | listDocumentVersions L119, getDocumentVersion L125, `/quotations/:id/versions(/:v)` |
| `document_signatures` | id, customer_id, doc_type, doc_id, decision (accepted/rejected/revision), signed_by, signer_name, signer_email, note, ip_address, user_agent (recordSignature L600–607) | getDocumentSignatures L2251, `/quotations/:id/signatures` |
| `document_comments` | id, customer_id, doc_type, doc_id, author_type (customer/admin/system), author_id, author_name, visibility (customer/internal), body (addComment L2282–2287) | getComments L2261 (customer view filters visibility='customer'), `/comments` |

All five: `{id TEXT PK, data JSONB, created_at, updated_at, version}` + indexes over
`data->>doc_type`, `data->>doc_id`, `data->>customer_id` (+ `version`, `visibility`,
`event_type`) + `trg_update_updated_at` + realtime membership. Idempotent throughout.

## 9. LIFECYCLE RLS DESIGN

All five tables are **customer-owned** (`customer_id` written into every row by the
backend). Each gets a customer-isolation policy identical in shape to 0006/0001:
`data->>'customer_id' = (SELECT customer_id FROM public.portal_users WHERE id =
auth.uid()::text)` with USING + WITH CHECK. No `USING (true)`.

- Backend/service-role writes (addTimeline, recordDownload, versions, signatures,
  comments) bypass RLS → unaffected.
- Admin (staff) reads (admin `/activity`, `/comments`, `/versions`, `/signatures`)
  are backend-mediated → unaffected.
- `document_versions` rows written with a NULL customer_id (e.g., system snapshots
  where customerId is null) are visible to nobody via direct REST — acceptable;
  backend reads still work.

## 10. DOCUMENT RELATIONSHIPS — NO FOREIGN KEYS

The ERP's envelope architecture expresses document relationships as logical
references inside JSONB (`doc_type` ∈ request/quotation/order + `doc_id` +
`customer_id`); the backend never relies on DB-level FKs (the codebase's only FKs are
in the legacy SQLite schema, and the archived Supabase file `drop-fk-referrals.sql`
deliberately removed FK constraints). **No FKs were added** — adding them would be
"theoretical cleanliness" that conflicts with the actual architecture (and would
conflict with soft-deletes/tombstones). Document relationships stay logical.

## 11. MIGRATION ORDERING — FINAL DETERMINISTIC CHAIN

```
0001 baseline (live-verified 159 tables)      → APPLIED LIVE
0002 profiles RLS hardening                    → APPLIED LIVE
0003 referral tables (2 of 8, legacy shape)    → PENDING (no-op repair-wise; superseded by 0006)
0004 referral RLS allow_all (transient)        → PENDING (superseded by 0006 policies)
0005 quotation_requests (idempotent no-op +    → PENDING (table already live)
     index/trigger/RLS/realtime)
0006 reconcile referral schema (NEW)           → CREATED, NOT APPLIED
0007 portal lifecycle tables (NEW)             → CREATED, NOT APPLIED
```
Dependencies: 0006 → 0001 (envelope contract, portal_users for RLS, trigger function);
0007 → 0001 (same). 0006/0007 are independent of each other. Numeric order is the
repository convention; 0004's transient policies are replaced by 0006, so final
posture is deterministic whichever way 0003/0004 ran.

## 12. IDEMPOTENCY ANALYSIS

Every statement in 0006/0007 is idempotent on re-run:
- `CREATE TABLE IF NOT EXISTS` — no-op when present.
- `ADD COLUMN IF NOT EXISTS` — no-op when present.
- `CREATE INDEX IF NOT EXISTS` — no-op when present.
- `DROP TRIGGER IF EXISTS` + `CREATE TRIGGER` — deterministic recreate.
- `DROP POLICY IF EXISTS` + `CREATE POLICY` — deterministic recreate.
- `ENABLE ROW LEVEL SECURITY` — idempotent.
- Realtime DO blocks — `ALTER PUBLICATION ... ADD TABLE` with `duplicate_object`
  exception handler; guarded by publication existence.
- Data-safety guard — read-only; raises only when rows exist.

Re-running the full chain on any target (fresh DB, 0003-only DB, live drifted DB)
converges to the same final schema.

## 13. ROLLBACK CONSIDERATIONS

| Migration | Rollback | Notes |
|---|---|---|
| 0006 | `DROP POLICY` the 3 isolation policies; `DROP TABLE` the 6 new tables; `ALTER TABLE ... DROP COLUMN version` on the 2 reconciled tables | Additive-only on live tables; nothing destroyed. company_id retained (unused) |
| 0007 | `DROP TABLE` all 5 tables | New tables only; lifecycle history is the only loss |
| 0005 | `DROP TABLE quotation_requests` + DROP INDEX/POLICY/TRIGGER | Live data preserved (0 rows today) |

No migration alters pre-existing baseline tables except the two additive `version`
columns. No data-bearing object is touched.

## 14. VALIDATION PERFORMED — PARTIAL (STATIC ONLY)

**DATABASE EXECUTION TEST NOT AVAILABLE.**
No local PostgreSQL, no Docker, no Supabase CLI, no `supabase/config.toml` exist in
the repository or environment (verified). Per the Phase 6 mandate, this is reported
honestly — no fake database test was performed.

Static validation (completed):
- Structural check of 0005/0006/0007: 12/57/39 statements; parentheses balanced;
  single-quote pairing OK (scripted, `validate-sql.cjs`).
- Object-name collision scan across the full chain (0001–0007): no table, policy, or
  index name collisions. 173 tables total = 159 (0001) + 2 (0003) + 8 (0006) + 5 (0007)
  with 0003's two re-declared in 0006.
- Trigger-function dependency verified present in 0001 (`public.update_updated_at_column`).
- RLS identity subquery target (`public.portal_users`) verified present with a
  permissive policy in 0001 (no recursion denial).
- Live-shape probes confirmed the exact `version`-only gap (read-only).
- RLS recursion reviewed by hand (referral_timeline → customer_referrals →
  portal_users; acyclic).

## 15. UNRESOLVED RISKS

1. **`admin_notifications` is ALSO missing live and from the chain** (verified HTTP 404;
   written by portalLifecycleService.notifyAdmin, read by admin `/notifications`,
   `/notifications/unread-count`, `/activity`). It is OUT of this phase's mandated 0007
   scope (5 lifecycle tables). **A follow-on migration (0008) is required** before admin
   notification features are usable. Flagged; not created (scope discipline).
2. **0005's `allow_all_quotation_requests`** retains the permissive class (§1). If the
   baseline posture is ever tightened, quotation_requests should receive the same
   customer-isolation policy as 0006/0007.
3. **RLS state of the live drift tables before 0004/0005/0006/0007 run** is not fully
   verifiable read-only (no writes permitted). Anon-key reads returned 0 rows on all
   probed tables (consistent with RLS active or empty tables); the migrations make the
   posture explicit.
4. **No unique constraint on `referral_code`** (inside JSONB envelope) — code-level
   uniqueness only; unchanged by design.
5. **`portal_users` RLS convention** (`auth.uid()::text` = portal_users.id) means the
   isolation policies are fully activated only if customers hold Supabase auth
   identities; today they add default-deny defense-in-depth. Documented; no change.
6. **Static validation only** — a database execution test should be run on a scratch
   Supabase project or local Postgres before the apply phase (§16).

## 16. EXACT COMMANDS THAT WOULD APPLY THESE MIGRATIONS LATER (NOT RUN)

Assuming the Supabase CLI is linked to the target project and the chain lives in
`supabase/migrations/`:

```bash
# 1. Backup first (in Supabase dashboard: Database → Backups → Create backup)
# 2. Push the full chain (or run up to a specific migration):
supabase link --project-ref <PROJECT_REF>        # once
supabase db push                                  # applies 0003..0007 in numeric order
#     (or, for strict staging of new migrations only:
supabase migration up)

# 3. Verify live contract (repo read-only verifier — must stay 172/172 + new checks):
cd backend && node scripts/verify-sync-contract.cjs

# 4. Extended read-only verification of the new tables:
#    - 14 tables (8 referral + 5 lifecycle + 1 quotation_requests) return HTTP 200
#    - all show envelope columns (id, data, created_at, updated_at, version)
#    - anon key SELECT returns 0 rows on all 14
#    - updated_at trigger probe on one new table (idempotency-style row, deleted after)
#    - pg_policies shows the 8 isolation policies (no allow_all on referral/lifecycle)

# 5. Post-migration code follow-up (later phase, NOT this one):
#    - add the 8 referral tables to backend/routes/sync.cjs ALLOWED_TABLES
#    - extend backend/scripts/verify-sync-contract.cjs to cover the 14 new tables
#    - create migration 0008 for admin_notifications
```

---

## FINAL STATUS

```
MIGRATION FILES CREATED:
  - supabase/migrations/0006_reconcile_referral_schema.sql
  - supabase/migrations/0007_portal_lifecycle_tables.sql

MIGRATION FILES MODIFIED:
  - none (0005 preserved unchanged; 0004 preserved immutable)

DATABASE TOUCHED:        NO
LIVE DATA MODIFIED:      NO
REFERRAL SCHEMA:         READY     (8/8 tables in envelope contract; version gap repaired additively)
REFERRAL RLS:            READY     (customer-isolation policies replace USING true; staff tables default-deny)
LIFECYCLE SCHEMA:        READY     (5/5 tables created in envelope contract)
0005:                    READY     (verified correct/idempotent; left unchanged)
0006:                    READY     (static-validated; additive, idempotent, reversible)
0007:                    READY     (static-validated; idempotent, reversible)
VALIDATION:              PARTIAL   (static only — DATABASE EXECUTION TEST NOT AVAILABLE)
```

STOP condition met — migration files created and statically validated only. Nothing was
applied, pushed, or executed against any database. Phase 7 not started.