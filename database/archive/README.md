# database/archive — Applied migration history (kept for provenance)

All files in this folder were **applied against the live Supabase project**
(`https://rdtuzuzehfbwvfdzqliw.supabase.co`) and are **superseded by**
`supabase/migrations/0001_baseline_live_schema.sql` (generated from the live
schema on 2026-08-11).

> Do NOT re-run these against the live database — several are interruptive by
> design (e.g. `supabase-rls-hardening-migration.sql` re-adds `company_id`
> columns, and `_FIX_SYNC_ISSUES.sql` drops them again). The authoritative
> run order now lives in `supabase/migrations/` (0001 → 0004).

## Manifest (applied order as reconstructed from live-schema evidence)

| File | Effect (live-verified) |
| --- | --- |
| `supabase-create-all-tables.sql` | Base tables (159-table envelope shape) |
| `supabase-rls-hardening-migration.sql` | Multi-tenant `company_id` + policies + `set_user_app_metadata` |
| `supabase-migration-cloud-first.sql` | Cloud-first alignment |
| `supabase-migrate-to-single-company.sql` | Single-company consolidation |
| `supabase-fix-rls-profiles-account-creation.sql` | `is_company_staff()`, own-profile policies (kept as 0002) |
| `supabase-add-updated-at-triggers.sql` | `trg_update_updated_at` on all tables (verified live) |
| `supabase-add-version-columns.sql` | `version` on envelope tables (verified live) |
| `supabase-portal-tables.sql` | `portal_users/sessions/password_resets/login_history` |
| `supabase-engagement-tables-run.sql` | 14 `engagement_*` tables (post-`company_id` drop) |
| `_FIX_SYNC_ISSUES.sql` | Dropped `company_id` (144 tables) + `get_user_company_id`, added data/version/updated_at to 18 tables, added `allow_all_*` policies |
| `supabase-payment-allocation-tables.sql` | `payment_allocations` / `payment_allocation_lines` |
| `supabase-portal-rls-hardening.sql` | Portal ticket tables + customer/tenant isolation policies |
| `supabase-promotions-engine.sql` | `engagement_promotions` upgrade + `promotion_redemptions` + `apply_promotion_usage` |
| `supabase-portal-ads.sql` | `portal_ads` + `get_current_company_id` + company policies |
| `supabase-fix-realtime-publication.sql` | Realtime publication membership (idempotent) |
| `supabase-engagement-tables.sql` | Earlier engagement variant (superseded by `-run`) |
| `supabase-fix-legacy-schema-tables.sql` | Legacy fixes (superseded by baseline) |
| `supabase-fix-products-table.sql` | Products fixes (superseded by baseline) |
| `20260726140000_financial_years_and_user_preferences.sql` | **STALE** — never applied; live `financial_years`/`user_preferences` are generic envelope, this file's columnar ALTERs conflict with live |
| `20260731120000_fix_financial_years_sync.sql` | **STALE** — depends on the never-applied file above |

## Exceptions to the baseline (drift to note)

- `rls_auto_enable()` exists live but has **no source file** in this repo
  (created out-of-band in the Supabase SQL editor). Not reproduced in 0001.
- `get_user_company_id()` was dropped by `_FIX_SYNC_ISSUES` (live RPC list
  confirms absence) — intentionally not in the baseline.
- Secondary unique constraints / CHECKs were reproduced only where evidenced
  in the corpus; column sets, PKs, RLS, triggers, functions and realtime are
  exact.