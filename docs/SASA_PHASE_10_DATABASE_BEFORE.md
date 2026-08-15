# SASA PHASE 10 — STAGING DATABASE PRE-MIGRATION STATE (BEFORE)

- Date: 2026-08-14
- Target: STAGING ONLY — `rdtuzuzehfbwvfdzqliw` (company TESTING/STAGING project)
- Mode: READ-ONLY inspection. NO writes, NO DDL, NO RPC, NO migration executed.
- Method: REST GETs only (repo's own mechanism, service key for read, anon key for
  RLS-posture probes). Values below are REAL probe results — nothing fabricated.

## 1. ENVIRONMENT CONFIRMATION

```
ENVIRONMENT:   STAGING
STAGING PROJECT: rdtuzuzehfbwvfdzqliw
SUPABASE_URL host: rdtuzuzehfbwvfdzqliw.supabase.co
NODE_ENV:      staging
GUARD:         backend/scripts/assert-staging.cjs → PASS 5/5 (run before this inspection)
```

## 2. MIGRATION MECHANISM CHECK (BLOCKER — READ FIRST)

The Phase 10 mandate requires applying migrations "using the repository's normal
Supabase migration mechanism". Investigation on 2026-08-14:

| Mechanism | Status |
|---|---|
| Supabase CLI (`supabase db push`) | **NOT INSTALLED** on this machine |
| `psql` | NOT INSTALLED |
| Docker / docker-compose local Postgres | NOT INSTALLED |
| `supabase/config.toml` / `.temp` link | ABSENT (no project link exists) |
| `DATABASE_URL` / `DIRECT_URL` / postgres:// password | **NOT PRESENT anywhere** in the repo |
| pg-meta SQL-over-REST `POST /pg/query` | HTTP 404 (endpoint not exposed on this project) |
| `exec_sql` RPC | HTTP 404 (PGRST202 — function does not exist) |
| Repo migration runner / CI migration step | NONE (no migrate script, no CI/vercel/netlify/render migration step) |
| Node `pg` / `postgres` driver | NOT INSTALLED in backend/node_modules |

**CONCLUSION: no mechanism exists in this environment to execute the migration SQL
files against the staging project.** Applying 0005/0006/0007 is BLOCKED pending a
decision/provisioning (see §7). Per the mandate failure rule, NO improvised SQL was
executed, and NO random SQL was pasted anywhere.

## 3. VERIFIED PRE-MIGRATION STATE (REAL PROBE RESULTS)

Source: OpenAPI spec `GET /rest/v1/` (service key) + per-table probes.

```
TOTAL PUBLIC TABLES (staging): 162
   = 159 baseline (0001) + customer_referrals + referral_rewards + quotation_requests
   ✓ matches the Phase 5/6 expected drift state
```

### Baseline sanity

| Check | Result |
|---|---|
| `customers` readable (service key) | HTTP 200, rows exist (e.g. CUST-0007) |
| Baseline tables present | 159/159 per OpenAPI (consistent with Phase 5) |

### Target tables

| Table | Exists | Columns (OpenAPI) | Row count (service, count=exact) | Anon probe (RLS posture) |
|---|---|---|---|---|
| `quotation_requests` | YES | id:string, data, created_at:string, updated_at:string, version:integer | 0 | HTTP 200, 0 rows (allow_all posture — readable) |
| `customer_referrals` | YES | id:string, data, **company_id:string**, created_at, updated_at — **NO version** | 0 | HTTP 200, 0 rows |
| `referral_rewards` | YES | id:string, data, **company_id:string**, created_at, updated_at — **NO version** | 0 | HTTP 200, 0 rows |
| `referral_timeline` | NO (404) | — | — | — |
| `referral_audit_logs` | NO (404) | — | — | — |
| `referral_campaigns` | NO (404) | — | — | — |
| `referral_analytics` | NO (404) | — | — | — |
| `referral_reversals` | NO (404) | — | — | — |
| `referral_settings` | NO (404) | — | — | — |
| `portal_timeline_events` | NO (404) | — | — | — |
| `portal_downloads` | NO (404) | — | — | — |
| `document_versions` | NO (404) | — | — | — |
| `document_signatures` | NO (404) | — | — | — |
| `document_comments` | NO (404) | — | — | — |

### Interpretation vs expected pre-migration state

- **Expected and confirmed:** quotation_requests exists with full envelope INCLUDING
  `version`; customer_referrals/referral_rewards exist as envelope-**minus-version**
  (+ unused `company_id`); all 9 other referral/lifecycle tables absent; all target
  tables empty (0 rows).
- **Confirms 0006's reconciliation premise:** the only live repair needed is the
  additive `version` column (Option A, Phase 6 §2/§4).

## 4. STATE NOT READABLE VIA AVAILABLE (REST-ONLY) MECHANISM

Recorded honestly as NOT VERIFIABLE with the current tooling (require SQL access):

- Migration history table (`supabase_migrations.schema_migrations`) — schema not
  exposed to PostgREST.
- RLS policy list (`pg_policies`) — not exposed.
- Indexes (`pg_indexes`), triggers (`pg_trigger`) — not exposed.
- Referral table RLS active/deny behavior — only the anon-posture probe above
  (0 rows readable) was possible; direct behavior tests require the RLS test stage.

These become verifiable once a SQL channel exists (§7).

## 5. ADMIN_NOTIFICATIONS

```
admin_notifications: FOLLOW-UP REQUIRED (Phase 11) — NOT created, NOT modified
                     (table is absent from staging, confirmed 404 in earlier phases;
                      out of 0006/0007 scope by mandate)
```

## 6. SAFETY STATEMENT

- NO migration applied. NO table created/altered/dropped. NO row inserted/updated/
  deleted. NO RPC called. NO secret printed. Staging only.
- Staging DB matches the expected pre-migration state; no discrepancy found that
  would justify stopping beyond the mechanism blocker in §2.

## 7. EXACT OPTIONS TO UNBLOCK APPLICATION (awaiting user decision)

1. **Supabase Dashboard SQL Editor (user-run, most faithful):** paste each migration
   file verbatim (0005 → 0006 → 0007) in Dashboard → SQL Editor → Run. I then verify
   post-state read-only via REST.
2. **Supabase CLI (I run it):** user provides an access token (PAT) and/or the
   staging DB password; I install the CLI, `supabase login`, `supabase link
   --project-ref rdtuzuzehfbwvfdzqliw`, then `supabase db push`.
3. **Direct DB connection (I run it):** user provides `DATABASE_URL`
   (postgres://postgres.rdtuzuzehfbwvfdzqliw:<password>@<pooler-host>:<port>/postgres)
   and authorizes `npm install pg` in backend (dev-only); I apply the three files
   verbatim through a proper DB client and verify.
4. **Dashboard → Database → Migrations UI:** push the migration files through
   Supabase's official migration UI.

No SQL was executed through any channel. Awaiting decision.