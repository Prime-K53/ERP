# SASA PHASE 9 — STAGING CONFIGURATION
# PREPARE ONLY — NO MIGRATIONS APPLIED, NO DATABASE CONTACT

- Date: 2026-08-14
- Mode: ENVIRONMENT CONFIGURATION + SAFE LOCAL CHECKS ONLY.
  NO migrations executed. NO database connected. NO Sasa changes. NO ERP Portal changes.

---

## 1. CONFIRMED STAGING PROJECT

```
STAGING PROJECT REF:  rdtuzuzehfbwvfdzqliw
STAGING HOST:         rdtuzuzehfbwvfdzqliw.supabase.co
STATUS:               CONFIRMED as the company TESTING/STAGING project
                      (user-confirmed 2026-08-14; NOT the live production database)
```

### Occurrence inventory of `rdtuzuzehfbwvfdzqliw` (full repo scan, node_modules excluded)

| Location | Classification | Notes |
|---|---|---|
| `backend/.env` | **staging configuration** (reclassified) | Runtime env; contains the staging project's URL + publishable + secret keys. `NODE_ENV` corrected `production` → `staging` (see §2) |
| `backend/.env.example` | documentation | Template showing `SUPABASE_URL=https://rdtuzuzehfbwvfdzqliw.supabase.co` as the example — now documented as the STAGING example |
| `frontend/.env` | **staging configuration** | Browser-safe `VITE_SUPABASE_URL` (host `rdtuzuzehfbwvfdzqliw.supabase.co`) + `VITE_SUPABASE_ANON_KEY` (anon/publishable only — verified no service-role key present) |
| `database/archive/README.md` | documentation | Archive manifest referencing the project |
| `docs/SASA_PHASE_7_DATABASE_VERIFICATION.md` | documentation | Phase 7 STOP report (historical) |

No occurrence is a production configuration. The migration files (`supabase/migrations/*.sql`) contain **no** project-reference strings — they are environment-agnostic SQL and were NOT modified (and must not be modified merely because the project ref appears in `.env.example`).

## 2. ENVIRONMENT CLASSIFICATION

- The repository's ONLY Supabase project is `rdtuzuzehfbwvfdzqliw` — now confirmed STAGING/TESTING.
- The previous `NODE_ENV=production` in `backend/.env` was the mislabel that caused Phase 7 to stop.
- **Resolution — truthful reclassification (not "pretending"):** the credentials in `backend/.env` are the staging project's credentials; `NODE_ENV` was edited `production` → `staging` so the file honestly describes the environment it points to. Nothing else in `.env` changed.
- **PRODUCTION separation (repo convention):** the backend loads exactly one env file (`dotenv.config({ path: join(__dirname, '.env') })` at `backend/index.cjs:1`). The repository has NO in-process per-environment file switching — its convention is one `.env` per host/deployment. Therefore production separation = a **separate production host/deployment** carrying its own `.env` (or a documented `backend/.env.production` applied at deploy time). No new configuration system was introduced.
- `.gitignore` extended with `.env.staging` and `.env.production` so future per-env files are never committed. (`.env`, `.env.local` were already ignored.)

## 3. BACKEND STAGING VARIABLES

File: `backend/.env` (the staging runtime env; `backend/.env.example` documents every variable).

| Variable | Staging value (source) | Secret? |
|---|---|---|
| `PORT` | 3000 (unchanged) | no |
| `NODE_ENV` | `staging` (edited from `production`) | no |
| `SUPABASE_URL` | `https://rdtuzuzehfbwvfdzqliw.supabase.co` (unchanged) | no |
| `SUPABASE_PUBLISHABLE_KEY` | staging publishable key (unchanged, present in file) | publishable — safe for backend use |
| `SUPABASE_SECRET_KEY` | staging service-role key (unchanged, present in file) | **YES — server-only** |

- No secret values printed here; they exist only in the local file.
- The backend already runs entirely against the staging project (all prior phases' verification hit this same project).
- Note: with `NODE_ENV=staging`, `emailService.cjs` skips its production-only SMTP requirement check — acceptable for staging; document it.

## 4. FRONTEND STAGING VARIABLES

File: `frontend/.env` (browser-safe; verified contents: only `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY`).

| Variable | Staging value | Secret? |
|---|---|---|
| `VITE_SUPABASE_URL` | `https://rdtuzuzehfbwvfdzqliw.supabase.co` (present, unchanged) | no |
| `VITE_SUPABASE_ANON_KEY` | staging anon/publishable key (present, unchanged) | no (publishable by design) |
| `VITE_API_URL` | ERP staging backend origin, **no** `/api` suffix — REQUIRED for staging deploys; leave unset for local Vite dev (relative `/api` via proxy → `127.0.0.1:3000`) | no |
| `VITE_EXAM_BACKEND_URL` | same backend origin (optional; same value as `VITE_API_URL`) | no |

- Verified: the frontend receives **no** service-role key, DB password, JWT secret, or encryption key. `VITE_*` only.
- `.env.example` (frontend) already documents all variables — no change needed.

## 5. PRODUCTION CONFIGURATION SEPARATION

- The repository contains **no confirmed production Supabase project reference** (scan found only the staging ref). It must be supplied by the company before any strict production-ID guard can be built.
- Planned separation (documented, not invented):
  - `backend/.env` → staging (current).
  - `backend/.env.production` → future production config (gitignored), applied only on the production host/deployment.
  - `frontend/.env` per deploy host (already the convention: single env file per host).
- Nothing in this phase creates or assumes production credentials.

## 6. MIGRATION SAFETY GUARDS

- **NEW — `backend/scripts/assert-staging.cjs`** (safe, local, no DB contact): verifies `NODE_ENV=staging`, `SUPABASE_URL` host === `rdtuzuzehfbwvfdzqliw.supabase.co`, and that no `.env.production` override exists; exits 1 otherwise. Run it immediately before any migration/destructive/sync command:
  ```
  cd backend && node scripts/assert-staging.cjs   # must print STAGING CONFIRMED
  ```
- **STAGING-only rule:** staging operations require BOTH `NODE_ENV=staging` AND the staging project ref — the guard enforces both.
- **PRODUCTION-ID guard: NEEDS REVIEW** — the inverse guard ("refuse if production ref detected") cannot be built until the actual production project ref is supplied. Until then, the documented policy is: any environment NOT passing `assert-staging.cjs` is treated as UNKNOWN and no migration/destructive command may run against it.
- No CLI/config-based Supabase migration mechanism exists in this repo (no `supabase/config.toml`, no CLI link); the future apply procedure is documented in Phase 6 §16 — the guard becomes step 0 of that procedure.

## 7. CREDENTIAL REQUIREMENTS (names only)

Required to run the ERP backend against staging (verified from `backend/index.cjs`, `supabaseRepository.cjs`, `supabaseQuery.cjs`, `verify-sync-contract.cjs`, `.env.example`):

- `SUPABASE_URL` — required (REST API URL of the staging project)
- `SUPABASE_PUBLISHABLE_KEY` — required (alias of anon key; `SUPABASE_ANON_KEY` also accepted per `.env.example`)
- `SUPABASE_SECRET_KEY` — required for `/api/sync/ops` and service-role writes (503 without it, per `.env.example`)
- `PORT`, `NODE_ENV` — runtime (optional with defaults; `NODE_ENV=staging` for staging)
- Not required for Supabase staging (may still be needed by other features): `JWT_SECRET`, `SESSION_SECRET`, `ENCRYPTION_KEY`, `DB_PATH`, `SMTP_*`, `WHATSAPP_*`, `AI_*`, `CORS_ORIGIN` (all documented in `.env.example`)

Frontend (browser-safe only): `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_API_URL`, `VITE_EXAM_BACKEND_URL`.

## 8. SASA STAGING CONNECTION REQUIREMENTS (documentation only — Sasa NOT modified)

Future wiring (Phase 10+): Sasa staging build must point at the ERP **staging backend**:

```
Sasa staging build
   ↓  VITE_API_URL = <ERP staging backend origin> (no /api suffix)
   ↓  adapter composes ${VITE_API_URL}/api/portal  (Phase 3 adapter mismatch — ERP uses /api/portal)
ERP staging backend (NODE_ENV=staging)
   ↓  SUPABASE_URL / SUPABASE_PUBLISHABLE_KEY / SUPABASE_SECRET_KEY
rdtuzuzehfbwvfdzqliw  →  STAGING DATA
```

- Sasa must use browser-safe variables only (ERP frontend pattern): `VITE_API_URL`, and (if Sasa ever talks to Supabase directly) `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` — never a service-role key.
- No Sasa files were touched in this phase.

## 9. EXISTING ERP PORTAL — PRESERVED

- No routes, components, APIs, auth, or Portal business logic modified.
- The built-in Portal remains fully operational for Phase 10+ regression testing.
- Only files changed this phase: `backend/.env` (one line: `NODE_ENV`), `.gitignore` (two added ignore patterns), new `backend/scripts/assert-staging.cjs`, this document.

## 10. EXACT NEXT STEP FOR PHASE 10

1. Re-run `backend/scripts/assert-staging.cjs` → must print `STAGING CONFIRMED`.
2. Begin Phase 7-style verification against staging ONLY: record before-state, apply `0005` → verify, apply `0006` → verify (schema/indexes/triggers/RLS/realtime/data-loss), apply `0007` → verify, run the RLS isolation tests, referral/quotation/lifecycle functional tests, idempotency re-run check, and ERP regression tests (existing Portal must stay functional).
3. Use staging credentials only; never touch any other project.
4. `admin_notifications` remains BLOCKED / FOLLOW-UP 0008 REQUIRED — do not create 0008 in this phase chain.
5. Production apply remains out of scope until a confirmed production ref + a separate production config exist.

---

## VERIFICATION PERFORMED (SAFE LOCAL CHECKS ONLY)

```
- Guard script syntax:        node --check  → PASS
- assert-staging.cjs run:     PASS 5/5 (NODE_ENV=staging, URL valid, host = staging ref,
                              no .env.production override) — no database contacted
- frontend/.env scan:         VITE_SUPABASE_URL host = rdtuzuzehfbwvfdzqliw.supabase.co;
                              key is anon/publishable only — NO service-role in frontend
- project-ref occurrence scan: complete; classified §1; migrations untouched
- production config:          none exists; no production secret exposed anywhere
- build / typecheck:          NOT RUN (only runtime config + one standalone script
                              changed — no compiled code affected)
```

## FINAL STATUS

```
STAGING PROJECT:      rdtuzuzehfbwvfdzqliw
ENVIRONMENT:          STAGING / TESTING
STAGING CONFIG:       READY      (backend .env reclassified + guard script in place;
                                  frontend .env already staging-correct)
PRODUCTION CONFIG:    PRESERVED  (nothing removed; no production config existed to modify;
                                  separation documented in §5)
PRODUCTION SAFETY:    NEEDS REVIEW  (strict production-ID guard requires the real
                                     production project ref — must be supplied)
MIGRATIONS EXECUTED:  NO
DATABASE TOUCHED:     NO         (assert-staging is local-only; no network call made)
SASA MODIFIED:        NO
ERP PORTAL MODIFIED:  NO
BUILD:                NOT RUN    (no compiled code changed)
TYPECHECK:            NOT RUN    (no compiled code changed)
```

## FILES CHANGED THIS PHASE

- `backend/.env` — `NODE_ENV=production` → `NODE_ENV=staging` (truthful reclassification; only line changed)
- `.gitignore` — added `.env.staging`, `.env.production`
- `backend/scripts/assert-staging.cjs` — NEW staging guard (local, no DB contact)
- `docs/SASA_PHASE_9_STAGING_CONFIGURATION.md` — this report