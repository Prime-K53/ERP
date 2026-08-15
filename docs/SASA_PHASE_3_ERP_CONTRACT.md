# SASA REPLACEMENT — PHASE 3 ERP PORTAL CONTRACT

**Extracted from the running PrimeERPsystem production implementation. READ-ONLY audit — no code, schema, auth, migration, or environment changes were made.**

- **ERP repository:** `https://github.com/Prime-K53/PrimeERPsystem.git` (local: `D:\FonePaw\PrimeERPsystem`)
- **Sasa repository:** `https://github.com/PrimePrinting/Sasa.git` (local clone: `%TEMP%\opencode\Sasa`)
- **Date:** 2026-08-14
- **Phase mandate:** Document the REAL production contracts exactly as they exist so Sasa can connect without guessing. PrimeERPsystem is SINGLE-COMPANY. No tenant_id/organization_id/company_id multi-tenancy was introduced anywhere in this phase.

---

## 1. AUTHENTICATION CONTRACT

The production portal signs in through the **unified login endpoint** (`/api/auth/login`), which serves BOTH the admin ERP and the customer portal from one Express router. The portal-native auth router (`/api/portal/auth/*`) exposes the same token contract through parallel endpoints.

### 1.1 Login — production path (used by the live portal UI)

```
Customer Login (frontend/views/portal/CustomerLogin.tsx)
   └─ useCustomerAuth.loginWithApi()  (frontend/context/CustomerAuthContext.tsx)
       └─ loginWithApi()              (frontend/services/authApiClient.ts)
           └─ POST /api/auth/login    (backend/routes/auth.cjs:30)
               └─ portalAuthService.authenticatePortalUser(email, password)
                   └─ portal_users (Supabase flat table, fallback: customers.data->>portalEmail mirror)
```

**METHOD** `POST`
**PATH** `/api/auth/login`
**AUTHENTICATION** None (public). Rate limited: 10 req / 15 min per IP (`index.cjs:299`, redisRateLimiter authLimiter).
**REQUEST BODY**
```json
{
  "email": "customer@example.com",
  "password": "secret",
  "portal": "customer",
  "two_factor_code": "123456"
}
```
- `portal` is REQUIRED to select the customer branch. `'customer'` → portal login; anything else → admin login.
- `email` OR `username` accepted (schema: `middleware/validation.cjs:91-97`); the portal UI always sends `email`.
- `two_factor_code` optional — sent on the second step of an enabled-2FA login.
- Wrong-portal detection is explicit: a staff account signing in with `portal: 'customer'` gets `403` `{ error: 'Wrong portal', code: 'ACCOUNT_BELONGS_TO_ADMIN', role: 'admin', ... }` (`auth.cjs:70-77`).

**RESPONSE 200 (success)**
```json
{
  "message": "Login successful",
  "userId": "<portal_user_id>",
  "role": "customer",
  "user": {
    "id": "<portal_user_id>",
    "customer_id": "<customers.id>",
    "email": "customer@example.com",
    "full_name": "Jane Customer",
    "phone": "+265..."
  },
  "access_token": "<JWT>",
  "refresh_token": "<96-hex-chars>",
  "expires_in": "30m"
}
```
(`auth.cjs:109-133` — `loginCustomer()`)

**RESPONSE 200 (2FA challenge — when the account has 2FA enabled and no `two_factor_code` was sent)**
```json
{
  "requires_two_factor": true,
  "pending_token": "<32-byte hex, in-memory Map, expires 10 min>",
  "user": { "id": "<portal_user_id>", "email": "customer@example.com" }
}
```
The client then re-POSTs the same login with `two_factor_code` (`CustomerLogin.tsx:36-49`). The `pending_token` is NOT re-sent — the code alone completes the login.

**ERRORS**
| Status | Shape |
|---|---|
| 400 | `{ error: 'Email or username is required', issues: [...] }` (zod validation via `validateBody`) |
| 401 | `{ error: 'Invalid credentials', message: 'Email or password is incorrect' }` |
| 401 | `{ error: 'Invalid verification code' }` (bad 2FA code) |
| 403 | `{ error: 'Wrong portal', code: 'ACCOUNT_BELONGS_TO_ADMIN', message: '...', role: 'admin' }` |
| 429 | `{ error: 'Rate limit exceeded', message: 'Too many login attempts, please try again later', retryAfter }` |
| 500 | `{ error: 'Login failed' }` |

### 1.2 Login — portal-native alternates (same token contract)

**`POST /api/portal/auth/login`** — legacy Customer-ID login (no password).
- REQUEST `{ "customer_id": "<customers.id>", "full_name": "Jane Customer", "two_factor_code": "..." }`
- `full_name` must match `customers.data->>name` case-insensitively (`portalAuthService.resolvePortalUserForCustomer`, `services/portalAuthService.cjs:202-215`). The `portal_users` row must already exist with `status: 'active'`.
- RESPONSE identical to §1.1 success shape (`routes/portalAuth.cjs:46-58`). 2FA challenge identical (pending token lives 5 min, `routes/portalAuth.cjs:10-15`).
- 400 `{ error: 'Customer ID and full name are required' }`, 401 `{ error: 'Invalid credentials', message: 'Customer ID and full name do not match our records' }`.

**`POST /api/portal/auth/login-password`** — portal-native email+password.
- REQUEST `{ "email", "password", "two_factor_code" }` → RESPONSE identical to §1.1 (`routes/portalAuth.cjs:65-112`).

### 1.3 Refresh

**METHOD** `POST`
**PATH** `/api/portal/auth/refresh`
**AUTHENTICATION** None (refresh token IS the credential).
**REQUEST** `{ "refresh_token": "<96-hex-chars>" }`
**RESPONSE 200**
```json
{ "access_token": "<new JWT>", "refresh_token": "<new 96-hex>", "expires_in": "30m" }
```
**BEHAVIOR** (`routes/portalAuth.cjs:114-143`):
1. SHA-256 hash of the refresh token is looked up in `portal_sessions` where `revoked_at IS NULL AND expires_at > now`.
2. The old session is **revoked** (rotation — one-time use).
3. A fresh session + fresh refresh token are created.
4. Invalid/expired → `401 { error: 'Invalid or expired refresh token' }`.
5. Missing → `400 { error: 'Refresh token is required' }`.

The live frontend performs this refresh:
- Proactively at **25 minutes** after login/refresh (`CustomerAuthContext.tsx:68,114,148` — `scheduleTokenRefresh(25 * 60 * 1000)`), and
- On any `401` response (single-flight mutex so concurrent 401s do not race the rotated token, `portalApiClient.ts:52-89`).

**Token storage (browser):** `sessionStorage` key `portal_session` = `{ access_token, refresh_token, expires_in, user }` (`portalApiClient.ts:4-40`). Not localStorage, not httpOnly cookies. Sasa's `localStorage 'prime_portal_token'` approach must be adapted to the ERP contract (see §15).

### 1.4 Logout

**METHOD** `POST`
**PATH** `/api/portal/auth/logout`
**AUTHENTICATION** `Authorization: Bearer <portal JWT>`
**REQUEST** `{ "refresh_token": "<96-hex>" }` (optional but always sent by the live UI)
**RESPONSE** `{ "message": "Logged out successfully" }`
**BEHAVIOR** Revokes the specific session named by `refresh_token` (if given), then revokes ALL sessions for the portal user. The client clears `sessionStorage`. Fire-and-forget in the live UI (`CustomerAuthContext.tsx:45-53`).

### 1.5 Session validation / current user

**`GET /api/portal/auth/me`** — Bearer JWT. Returns the FULL `portal_users` row (all flat columns, including `password_hash`, `two_factor_secret` — see §17 security note). `404 { error: 'User not found' }`.

**`GET /api/portal/auth/sessions`** — Bearer JWT. Returns all non-revoked, non-expired `portal_sessions` rows for the user, newest first.

**`DELETE /api/portal/auth/sessions/:sessionId`** — Bearer JWT. Revokes one session; verifies `portal_user_id` ownership → `404 { error: 'Session not found' }` if not owned.

### 1.6 Password reset & account activation

| Feature | Endpoint | Request | Response |
|---|---|---|---|
| Forgot password | `POST /api/portal/auth/forgot-password` | `{ "email" }` | `{ "message": "If the email exists, a reset link has been sent." }` — ALWAYS 200 (no user enumeration). 6-digit code, 30-min expiry, emailed via `emailService`; dev fallback logs the code. 400 if email missing. |
| Reset password | `POST /api/portal/auth/reset-password` | `{ "email", "code", "password" }` | `{ "message": "Password has been reset successfully." }` — validates code (`portal_password_resets`, unused, unexpired), updates hash, marks code used, revokes ALL sessions. 400 for missing/invalid; password min 6 chars. |
| Activate account | `POST /api/portal/auth/activate` | `{ "customer_id", "code", "password" }` | Full login response (tokens + user) — account moves `status: 'invited' → 'active'`. Requires a pending invite (6-digit code). 400 `INVALID_INVITE`/`INVALID_CODE`; 409 `NOT_INVITED` (`err.code === 'NOT_INVITED' → 409`, `routes/portalAuth.cjs:215`). |

### 1.7 TOTP / 2FA endpoints

All Bearer-protected except where noted (login challenge is handled inside §1.1/§1.2):

| Endpoint | Request | Response |
|---|---|---|
| `GET /api/portal/auth/two-factor/status` | — | `{ "enabled": boolean, "confirmed": boolean }` |
| `POST /api/portal/auth/two-factor/setup` | `{}` | `{ "secret": "<base32>", "otpauth_uri": "otpauth://totp/Prime ERP Portal:..." }` — saves secret to `portal_users.two_factor_secret` |
| `POST /api/portal/auth/two-factor/enable` | `{ "code": "123456" }` | `{ "message": "Two-factor authentication enabled successfully" }` — verifies code against saved secret, sets `two_factor_enabled` + `two_factor_confirmed`, revokes all sessions. 401 `INVALID_TOKEN`, 400 `NO_SECRET`. |
| `POST /api/portal/auth/two-factor/disable` | `{ "code": "123456" }` | `{ "message": "Two-factor authentication disabled successfully" }` — clears secret + flags, revokes all sessions. 401 `INVALID_TOKEN`, 400 `NOT_ENABLED`. |

Implementation: `otplib` `authenticator` (TOTP, window ±1 step), `services/portalAuthService.cjs:429-495`. There is **no standalone TOTP challenge endpoint** — challenge is inline via `requires_two_factor` + `two_factor_code` on the login routes.

---

## 2. JWT CONTRACT

Source of truth: `backend/middleware/portalAuth.cjs` (generation + verification).

**Signing:** `jsonwebtoken`, HS256 default, secret = `process.env.JWT_SECRET` (process **exits** at boot if unset — `portalAuth.cjs:4-8`).

**Payload (REAL claims — verified from code):**
```json
{
  "id": "<portal_user_id (portal_users.id)>",
  "customer_id": "<customers.id>",
  "email": "<portal_users.email>",
  "role": "portal_customer",
  "iat": 1770000000,
  "exp": 1770001800
}
```
- **No `sub`, no `iss`, no `aud`** — do NOT assume the standard JWT shape. `id` and `customer_id` are the identity claims.
- **Expiry:** `expiresIn: '30m'` (`portalAuthService.ACCESS_TOKEN_EXPIRY = '30m'`).
- **Role claim:** `role: 'portal_customer'` is REQUIRED. Verification rejects any token whose role differs → `403 { error: 'Invalid token role', message: 'This token is not valid for portal access' }`.
- **Verification:** `jwt.verify(token, JWT_SECRET)`; `TokenExpiredError` → `401 { error: 'Token expired', message: 'Your session has expired. Please login again.' }`; other failures → `401 { error: 'Invalid token', ... }`.
- **Authorization header format:** `Authorization: Bearer <token>` (only scheme accepted).
- **SSE exception:** for the single path `/events` the middleware ALSO accepts the token as a query parameter: `?token=<jwt>` (used by `EventSource`, which cannot set headers). The token there is a separate short-lived **event ticket** — see §10.

**Refresh tokens:** 48 random bytes → 96 hex chars. Stored as **SHA-256 hash** in `portal_sessions.refresh_token_hash` with `expires_at = now + 30 days` (`REFRESH_TOKEN_EXPIRY_DAYS = 30`). Full rotation on every refresh (§1.3). Sessions can be revoked (logout, password change, 2FA enable/disable, activation).

**Can Sasa safely consume this token contract?** YES, with one adapter requirement: Sasa must (a) send `Authorization: Bearer`, (b) store `{ access_token, refresh_token, expires_in, user }` and implement rotation on 401 + a ~25-min proactive refresh, (c) decode claims from `id`/`customer_id` (NOT `sub`), and (d) drop its current `localStorage 'prime_portal_token'` single-string convention. The token itself is a plain JWT Sasa can validate/parse with any JWT library — but Sasa must NOT hard-verify the JWT signature client-side (secret is server-only).

---

## 3. REFRESH CONTRACT

Summarized here as its own contract because rotation semantics matter:

- **Rotation:** every `/api/portal/auth/refresh` revokes the presented session and issues a NEW access token + NEW refresh token. Old refresh token becomes permanently invalid (SHA-256 match fails).
- **Concurrency:** single-flight in the live client (`portalApiClient.ts:52-103`) — mandatory with rotation, otherwise parallel 401-retries each revoke the other.
- **Response** is `{ access_token, refresh_token, expires_in }` — no `user` object; the client re-reads `user` from its stored session (`CustomerAuthContext.tsx:67`).
- **Refresh failure** (`!res.ok`) → client clears the session and dispatches `window` event `portal-session-expired` → UI redirects to `/portal/login` (`portalApiClient.ts:198-202`).
- **Sessions:** 30-day lifetime, listed at `GET /api/portal/auth/sessions`, revocable individually or wholesale (logout / password reset / 2FA toggle).

---

## 4. 2FA CONTRACT

Already covered in §1.7. Operational contract:
- TOTP (RFC-6238, `otplib`), 6-digit, window ±1.
- Enrollment flow: `status` → `setup` (get secret + otpauth URI) → `enable` (verify one code) → enabled. No QR image endpoint; the client renders the otpauth URI (or the raw secret).
- Login flow: if `two_factor_enabled`, first POST returns `requires_two_factor: true`; second POST must include `two_factor_code` (no pending-token round trip on the unified `/api/auth/login` path — only on `/api/portal/auth/login*`).
- `portal_users.two_factor_secret` stores the plaintext base32 secret (see §17).

---

## 5. CUSTOMER IDENTITY CONTRACT

```
portal_users.id  ──(portal_users.customer_id)──▶  customers.id
portal_users.email (UNIQUE)                    customers.data: { name, email, phone, ... }
portal_users.status ('active'|'invited'|...)    customers.data: { portalEmail, portalPasswordHash,
                                                                    portalStatus, portalUserId }  ← portal mirror
```

- **`portal_users`** — flat table (REAL columns, `supabase/migrations/0001_baseline_live_schema.sql:1489`): `id TEXT PK`, `customer_id TEXT`, `email TEXT UNIQUE NOT NULL`, `password_hash TEXT`, `full_name TEXT`, `phone TEXT`, `status TEXT`, `last_login_at TEXT`, `created_at`, `updated_at`, `data JSONB`, `version`. Auth-relevant: `email`, `password_hash` (bcrypt, 10 rounds), `customer_id`, `status` (must be `'active'`), plus `two_factor_secret`/`two_factor_enabled`/`two_factor_confirmed` stored in the JSONB `data` envelope or added columns (write path: `updatePortalUser`/2FA fns).
- **`customers`** — `{id TEXT PK, data JSONB, ...}`; `data` holds `name, email, phone, address, city, state, zip, country, balance, walletBalance, creditLimit, outstandingBalance, status, segment, paymentTerms, currency, ...`. Portal reads surface it via `getProfile`/`findCustomerInSupabase`.
- **Portal mirror on customers** — `syncCustomerPortalData()` (`portalAuthService.cjs:78-89`) copies `portalEmail`, `portalPasswordHash`, `portalStatus`, (and on `updatePassword`, `email` + `portalPasswordHash`) into `customers.data`. The Supabase-fallback authentication path (`authenticatePortalUserFromSupabase`, `:136-187`) can log a user in from this mirror even if `portal_users` is missing, and back-fills the `portal_users` row.
- **Relationship enforcement:** enforced in **application code** (every portal service function keys off `req.portalUser.customer_id`), NOT by DB foreign keys. RLS policies on portal tables are the permissive `allow_all` single-company pattern — application-level scoping is the only isolation boundary.
- **Customer identifier for Sasa:** `customer_id` (= `customers.id`) from the JWT claim. Display identity: `user.full_name` + `user.email` from the login response; profile data from `GET /api/portal/profile`.

---

## 6. COMPLETE PORTAL API INVENTORY

Base URL: `{API_BASE}/api/portal` (production: `https://<backend-host>/api/portal`; dev: relative `/api/portal` via Vite proxy → `127.0.0.1:3000`).

Auth legend: **JWT** = `Authorization: Bearer <portal JWT>` (mandatory except where noted); **—** = public; **TICKET** = SSE event ticket (`?token=`).

### 6.1 Portal AUTH (`/api/portal/auth`, mounted at `backend/index.cjs:306`)

| METHOD | PATH | REQUEST | RESPONSE | AUTH | SOURCE |
|---|---|---|---|---|---|
| POST | `/auth/login` | `{customer_id, full_name, two_factor_code?}` | login payload or 2FA challenge | — | `routes/portalAuth.cjs:17` |
| POST | `/auth/login-password` | `{email, password, two_factor_code?}` | login payload or 2FA challenge | — | `:65` |
| POST | `/auth/refresh` | `{refresh_token}` | `{access_token, refresh_token, expires_in}` | — | `:114` |
| POST | `/auth/forgot-password` | `{email}` | `{message}` (always) | — | `:145` |
| POST | `/auth/activate` | `{customer_id, code, password}` | login payload | — | `:179` |
| POST | `/auth/reset-password` | `{email, code, password}` | `{message}` | — | `:219` |
| GET | `/auth/me` | — | full `portal_users` row | JWT | `:244` |
| POST | `/auth/logout` | `{refresh_token}` | `{message}` | JWT | `:255` |
| GET | `/auth/sessions` | — | `portal_sessions[]` | JWT | `:270` |
| DELETE | `/auth/sessions/:sessionId` | — | `{message}` | JWT | `:280` |
| GET | `/auth/two-factor/status` | — | `{enabled, confirmed}` | JWT | `:294` |
| POST | `/auth/two-factor/setup` | `{}` | `{secret, otpauth_uri}` | JWT | `:304` |
| POST | `/auth/two-factor/enable` | `{code}` | `{message}` | JWT | `:319` |
| POST | `/auth/two-factor/disable` | `{code}` | `{message}` | JWT | `:333` |

### 6.2 Unified AUTH (`/api/auth`, `routes/auth.cjs`)

| METHOD | PATH | REQUEST | RESPONSE | AUTH | SOURCE |
|---|---|---|---|---|---|
| POST | `/auth/login` | `{email, password, portal: 'customer', two_factor_code?}` | login payload / 2FA challenge / 403 wrong-portal | — | `:30` |

### 6.3 Portal DATA (`/api/portal`, `routes/portal.cjs` — all routes behind `verifyPortalToken` + 200 req/15-min IP limit)

| FEATURE | METHOD | PATH | REQUEST | RESPONSE | CUSTOMER SCOPING | SOURCE |
|---|---|---|---|---|---|---|
| Realtime ticket | POST | `/events-ticket` | `{purpose?}` | `{ticket, expiresIn: 300}` (30/hr limit) | — | `:76` |
| SSE stream | GET | `/events` | `?token=<event ticket>` | `text/event-stream` | filtered by `customer_id` in hub | `:86` |
| Catalog | GET | `/catalog` | — | product array (see §7.14) | not customer-scoped (public catalog) | `:91` |
| Promotions | GET | `/promotions` | — | display-only promotion array | company-scoped via customer row | `:102` |
| Banner ads | GET | `/ads` | — | display-only ad array | company-scoped via customer row | `:114` |
| Order preview | POST | `/orders/preview` | `{items[], promotionCode?}` | computed preview (server-authoritative pricing) | pricing per customer | `:127` |
| Requests list | GET | `/requests` | `?page&pageSize&status&search` | array OR `{requests, total, page, pageSize, totalPages}` | `customer_id` filter | `:147` |
| Request create | POST | `/requests` | `{requestType?, items[], notes?, requestedDeliveryDate?, attachments?, reorderOf?, reorderOfNumber?, promotionCode?}` | `201` created request | `customer_id` from JWT | `:169` |
| Request detail | GET | `/requests/:id` | — | request record | id + customer check | `:197` |
| Request cancel | POST | `/requests/:id/cancel` | — | `{id, status:'cancelled'}` | customer check | `:209` |
| Quotation detail | GET | `/quotations/:id` | — | quotation record | id + customer check | `:225` |
| Quotation accept | POST | `/quotations/:id/accept` | — | `{id, status:'accepted'}` | customer check | `:237` |
| Quotation reject | POST | `/quotations/:id/reject` | `{reason?}` | `{id, status:'rejected'}` | customer check | `:254` |
| Quotation revision | POST | `/quotations/:id/revision` | `{comments?}` | `{id, status:'revision_requested'}` | customer check | `:273` |
| Quotation versions | GET | `/quotations/:id/versions` | — | version snapshot array | read via customer check | `:293` |
| Quotation version | GET | `/quotations/:id/versions/:version` | — | one snapshot | read via customer check | `:306` |
| Quotation signatures | GET | `/quotations/:id/signatures` | — | signature array | read via customer check | `:321` |
| Comments list | GET | `/comments` | `?docType&docId` | comment array (customer visibility only) | customer check | `:335` |
| Comment add | POST | `/comments` | `{docType, docId, body}` | `201` comment array | `assertDocAccess` customer check | `:352` |
| Download gate | POST | `/downloads` | `{docType: 'quotation'\|'order', docId}` | `{allowed, docType, docId, docNumber, downloadId}` (30/hr) | customer check | `:373` |
| Timeline | GET | `/timeline` | `?docType&docId` | timeline event array | customer filter | `:395` |
| Dashboard | GET | `/dashboard` | — | dashboard payload (see §7.2) | customer-scoped reads | `:415` |
| Orders list | GET | `/orders` | `?page&pageSize&status&search&dateFrom&dateTo` | array OR `{orders, ...}` | customer filter | `:427` |
| Order detail | GET | `/orders/:id` | — | order record | id + customer check | `:451` |
| Order reorder | POST | `/orders/:id/reorder` | — | `201` `{id, requestNumber, status:'submitted', reorderOf, reorderOfNumber}` | customer check | `:465` |
| Document chain | GET | `/document-chain` | `?docType&docId` | `{chain[], originOrder, request, quotation, order}` | customer check | `:481` |
| Quotations list | GET | `/quotations` | `?page&pageSize&status&search` | array OR `{quotations, ...}` | customer filter | `:501` |
| Invoices list | GET | `/invoices` | `?page&pageSize&status&search&dateFrom&dateTo` | array OR `{invoices, ...}` | customer filter | `:524` |
| Invoice detail | GET | `/invoices/:id` | — | invoice record (line_items hydrated) | id + customer check | `:548` |
| Invoice revert | POST | `/invoices/:id/revert` | — | **ALWAYS `403`** (disabled by design) | — | `:564` |
| Payments list | GET | `/payments` | `?page&pageSize&search&dateFrom&dateTo` | array OR `{payments, ...}` | customer filter | `:569` |
| Payment detail | GET | `/payments/:id` | — | payment + enriched allocations | id + customer check | `:592` |
| Statements | GET | `/statements` | `?startDate&endDate` | statement payload (see §7.7) | customer filter | `:605` |
| Loyalty | GET | `/loyalty` | — | `{points, cashback, tier, pointsHistory[]}` | customer-scoped | `:618` |
| Wallet | GET | `/wallet` | — | `{walletBalance, transactions[]}` | customer-scoped | `:630` |
| Profile get | GET | `/profile` | — | profile payload (see §7.3) | customer-scoped | `:642` |
| Profile update | PUT | `/profile` | `{full_name, phone, email, address, city, state, zip, country}` | `{message}` | portal user id from JWT | `:654` |
| Change password | PUT | `/profile/password` | `{currentPassword, newPassword}` | `{message}` (30/hr) | portal user id | `:666` |
| Documents | GET | `/documents` | — | document list (`url` = hash links) | customer filter | `:688` |
| Notifications | GET | `/notifications` | — | notification array | `portal_user_id` filter | `:700` |
| Mark read | PUT | `/notifications/:id/read` | `{}` | `{success: true}` | portal_user_id check | `:711` |
| Unread count | GET | `/notifications/unread-count` | — | `{count}` | portal_user_id filter | `:722` |
| Mark all read | PUT | `/notifications/read-all` | `{}` | `{success: true}` | portal_user_id | `:733` |
| Referrals list | GET | `/referrals` | `?page&pageSize&status&search&sort` | `{referrals, total, page, pageSize, totalPages}` | `referred_by_id = customer` filter | `:745` |
| Referral rewards | GET | `/referrals/rewards` | `?page&pageSize&status` | `{rewards, total, ...}` | `customer_id` filter | `:763` |
| Referral settings | GET | `/referrals/settings` | — | settings payload | global (not scoped) | `:779` |
| Referral stats | GET | `/referrals/stats` | — | funnel stats | customer filter | `:789` |
| Referral timeline | GET | `/referrals/:id/timeline` | — | timeline array | `referred_by_id` check | `:800` |
| Referral detail | GET | `/referrals/:id` | — | referral record | `referred_by_id` check | `:812` |
| Referral create | POST | `/referrals` | `{referredCustomerId, notes?}` | `201` referral | creates for JWT customer | `:824` |
| Customer search | GET | `/referrals/customers/search` | `?q` | `{id, name, email}[]` (max 20) | excludes self; global search | `:842` |
| Support tickets | GET | `/support/tickets` | — | ticket array | portal_user_id + customer_id | `:858` |
| Ticket create | POST | `/support/tickets` | `{subject, message, priority?}` | `201` `{id, subject, message, priority}` (30/hr) | JWT ids | `:869` |
| Ticket message | POST | `/support/tickets/:id/messages` | `{message}` | `201` `{id, ticket_id, message}` | ownership gate | `:884` |
| Ticket status | PUT | `/support/tickets/:id/status` | `{status}` | `{success, ticketId, status}` | ownership gate | `:899` |
| Attachment upload | POST | `/support/tickets/:id/attachments` | `multipart/form-data` `file` (≤10MB, allowlist MIME) + `message_id?` | `201` attachment meta | ownership gate | `:915` |
| Attachment download | GET | `/support/tickets/:id/attachments/:attachmentId` | — | file stream (`Content-Type` + `Content-Disposition: attachment`) | ticket→customer check | `:936` |
| Attachment delete | DELETE | `/support/tickets/:id/attachments/:attachmentId` | — | `{success, attachmentId}` | ownership gate | `:954` |
| Today deliveries | GET | `/deliveries/today` | — | in-flight delivery rows for today | customer filter | `:968` |
| Delivery banners | GET | `/deliveries/banner` | — | banner array | customer filter | `:981` |
| Delivery note | GET | `/deliveries/:id/note` | — | delivery-note record (JSON) | customer check | `:994` |
| Shipments list | GET | `/shipments` | `?status&search` | merged delivery-note + sales-order rows | `scopedRows` customer check | `:1006` |
| Shipment detail | GET | `/shipments/:id` | — | shipment record | customer check | `:1021` |
| Payment intent | POST | `/payments/intent` | `{invoiceId, amount, currency?}` | `{clientSecret, mode: 'stripe'\|'mock'}` | invoice ownership verified | `:1035` |
| Record payment | POST | `/payments` | `{invoiceId, amount, currency?, paymentMethod?, reference?, transactionId?}` | `{success, paymentId, status}` | invoice ownership verified | `:1066` |

Rate limits recap (applied per IP): global `/api` 600/60s (`index.cjs:289`); `/api/auth` 10/15min (`:299`); `/api/portal/auth` 30/15min (`:305`); `/api/portal` 200/15min + 30/60min on `events-ticket`, `downloads`, `profile/password`, `support/tickets`, `support/tickets/:id/attachments` (`portal.cjs:59-63,76,373,666,869,915`).

---

## 7. RESPONSE SHAPES

All shapes below are the REAL backend serializers (`backend/services/portalService.cjs`, `portalLifecycleService.cjs`, `portalAuthService.cjs`, routes). Typescript interfaces are the shape Sasa should implement.

### 7.1 Login / current user

```ts
interface PortalSessionPayload {
  message: string;
  userId: string;                 // portal_users.id
  role: 'customer';
  user: {
    id: string;                   // portal_users.id
    customer_id: string;          // customers.id  ← Sasa's customer identity
    email: string;
    full_name?: string;
    phone?: string;
  };
  access_token: string;
  refresh_token: string;
  expires_in: '30m';
}
```

### 7.2 Dashboard (`GET /api/portal/dashboard` — `portalService.getDashboard`, portalService.cjs:71-145)

```ts
interface PortalDashboard {
  balance: number;                 // customers.data.balance
  walletBalance: number;           // customers.data.walletBalance
  outstandingBalance: number;      // Σ(unpaid/partial/overdue invoice totals − paid)
  creditLimit: number;             // customers.data.creditLimit
  unpaidInvoiceCount: number;
  totalOrders: number;
  activeRequestCount: number;      // submitted|assigned|under_review|waiting_for_customer|ready_for_conversion
  openQuotationCount: number;      // ready|accepted|revision_requested
  productionOrderCount: number;    // confirmed|processing|pending|shipped
  unreadMessageCount: number;
  activeDeliveries: number;
  recentDocuments: { docType: 'request'|'quotation'|'order'; id: string; docNumber: string; status: string; created_at: string }[];
  recentTransactions: { date: string; description: string; amount: number|null; type: 'invoice'|'sale'|'payment'|'order'|'request'; status: string; docType: string; docId: string }[];
  pendingDeliveries: TodayDelivery[];
  health: {
    score: number;                 // 0-100
    factors: { paymentHistory: number; overdueInvoices: number; orderFrequency: number; rewards: number; responseTime: number };
    summary: { paidValue: number; totalValue: number; openInvoices: number; overdueInvoices: number; recentOrders: number; totalOrders: number; points: number; walletCredits: number };
  };
}
```

### 7.3 Profile (`GET /api/portal/profile` — `getProfile`, portalService.cjs:975-995)

```ts
interface PortalProfile {
  id: string; full_name: string; email: string; phone: string;
  address: string; city: string; state: string; zip: string; country: string;
  balance: number; walletBalance: number; creditLimit: number;
  outstandingBalance: number; status: string; created_at: string|null;
}
```

### 7.4 Invoice (list items: `getInvoices`, :579-591; detail: `getInvoiceById`, :748-763)

List item:
```ts
interface PortalInvoiceSummary {
  id: string; invoice_number: string; customer_name: string;
  total_amount: number; paid_amount: number; status: string;
  due_date: string|null; created_at: string;
}
```
Detail = full `invoices.data` row (`{id, data JSONB}` envelope flattened) with `line_items` hydrated from `items`/`line_items_json` (camelCase ERP keys: `invoiceNumber`, `customerId`, `totalAmount`, `paidAmount`, `status`, `dueDate`, `items[]` — keys vary by writer). Statuses in use: `unpaid | partially_paid | paid | overdue | credit_note | Voided` (matching applied by `getInvoicesPaginated` and payment record logic).

### 7.5 Order (list: `getOrders` :445-456 + paginated :458-513; detail: `getOrderById` :515-534)

```ts
interface PortalOrder {
  id: string;
  order_number: string|null;
  customerId?: string; customer_id?: string;   // dual-spelling
  customerName: string;                          // resolved from customers row
  orderDate: string; deliveryDate: string|null;
  status: 'Draft'|'Confirmed'|'Processing'|'Pending'|'Delivered'|'Fulfilled'|'Shipped'|'Cancelled';
  items: { name: string; quantity: number; unitPrice: number; lineTotal: number }[];
  totalAmount: number;                            // = total ?? totalAmount
  subtotal?: number; discount_total?: number; tax?: number; other_charges?: number;
  promotion?: object|null; promotion_applied?: boolean;
  quotation_id?: string|null; source_request_id?: string|null; source_request_number?: string|null;
  reorder_of?: string|null; reorder_of_number?: string|null;
  notes?: string|null; approved_at?: string|null; created_at: string;
  tracking_number?: string|null;                  // present on shipments-eligible rows
}
```

### 7.6 Quotation (detail: `getQuotationById` + lifecycle; list: `getQuotations`)

```ts
interface PortalQuotation {
  id: string; quotation_number: string; request_id: string|null;
  customer_id: string; customer_name: string;
  items: { productId?: string|null; name: string; quantity: number; unitPrice: number; lineTotal: number; originalUnitPrice?: number; discountPercent?: number; discountAmount?: number; netUnitPrice?: number; promotionId?: string|null; promotionCode?: string|null }[];
  subtotal: number; discount: number; tax_rate: number; tax_amount: number;
  delivery_fee: number; total: number; currency: string;
  payment_terms: string|null; valid_until: string|null;
  status: 'ready'|'accepted'|'rejected'|'revision_requested'|'converted'|'expired';
  version: number; expired_at: string|null;
  accepted_by: string|null; accepted_by_email: string|null;
  revision_note: string|null; rejection_reason: string|null;
  accepted_at: string|null; rejected_at: string|null; revision_requested_at: string|null; converted_at: string|null;
  order_id: string|null; source_request_number: string|null;
  erp_quotation_id?: string|null; promotion?: object|null; discount_total?: number; promotion_applied?: number;
  created_by: string; created_at: string; updated_at: string;
}
```
Status transitions enforced by state machine (`portalLifecycleService.cjs:583-595`); lazy expiry on read (`applyQuotationExpiry`, :611-643).

### 7.7 Statement (`getStatements`, portalService.cjs:852-930)

```ts
interface PortalStatement {
  opening_balance: number;
  closing_balance: number;
  outstanding_balance: number;
  credit_limit: number;
  transactions: { date: string|null; description: string; type: 'invoice'|'credit_note'|'payment'; debit: number; credit: number; balance: number }[];
}
```
`?startDate`/`?endDate` filter the ledger and recompute opening/closing; without them all transactions are returned.

### 7.8 Payment (list: :765-774; detail: :804-850)

List item: `{ id, amount, payment_method, date, reference }`. Detail adds `customerId/customer_id`, `method`, `status`, and:
```ts
allocations: {
  allocation_id: string|null; invoice_id: string;
  invoice_number: string|null;          // null when invoice not in customer scope (never fabricated)
  total_amount: number|null;            // null when unauthorized/missing
  amount: number;
  missing_invoice: boolean;
}[];
```
Create: `POST /api/portal/payments` → `{ success: true, paymentId, status: 'paid'|'partially_paid' }`. Intent: `{ clientSecret, mode: 'stripe'|'mock' }` (mock client secret `pi_mock_<hex>_secret`).

### 7.9 Delivery / Shipment (portalService.cjs:1377-1604)

```ts
interface PortalShipment {   // merged delivery_notes + sales_orders rows
  id: string; _source: 'delivery_notes'|'sales_orders';
  order_number: string|null; order_id?: string|null; orderDate: string;
  customerName: string; status: string;          // delivery lifecycle: Inbound→Active→Delivered
  tracking_number: string|null; carrier: string|null;
  driver_name: string|null; driver_phone: string|null; vehicle_no: string|null;
  estimated_delivery: string|null; actual_arrival: string|null;
  current_location: string|null; proof_of_delivery: string|null;
  shipping_address: string|null; items: { name; quantity; unitPrice; lineTotal }[];
}
interface PortalDeliveryBanner { id: string; stage: 'inbound'|'active'|'delivered'; status: string; orderNumber: string|null; invoiceNumber: string|null; trackingNumber: string|null; updatedAt: string|null; }
interface TodayDelivery { shipmentId: string; orderId: string|null; status: string; deliveryDate: string|null; trackingNumber: string|null; carrier: string|null; driverName: string|null; vehicleNo: string|null; items: any[]; notes: string|null; invoiceId: string|null; invoiceNumber: string|null; invoiceStatus: string|null; invoiceAmount: number|null; }
```
`GET /shipments` only surfaces rows that carry a `tracking_number` (dispatch-pipeline only).

### 7.10 Referral (portalService.cjs:1035-1241)

```ts
interface PortalReferral {
  id: string; referredCustomerId: string; referredCustomerName: string;
  referredCustomerEmail: string|null; status: string;
  pendingInvoiceId: string|null; pendingInvoiceAmount: number;
  convertedInvoiceId: string|null; convertedAt: string|null;
  notes: string|null; createdAt: string; updatedAt: string;
}
// list wrapper: { referrals: PortalReferral[], total, page, pageSize, totalPages }
// stats: { total, signedUp, qualified, rewardApproved, paid, pendingRewardAmount, totalEarned, conversionRate }
// settings: { enabled, rewardType, rewardValue, rewardPercentage, minimumPurchase, maxRewardAmount, expiryDays, requireApproval, shareMessage }
```
Rewards: `{ id, referralId, referralCode, referredCustomerId, referredCustomerName, invoiceId, invoiceAmount, amount, status, approvedAt, cancelledAt, cancelReason, walletTransactionId, createdAt }`. Customer search: `{ id, name, email }[]`.

### 7.11 Wallet (`getWallet`, :950-973)

```ts
{ walletBalance: number; transactions: { date: string|null; amount: number; type: 'credit'|'debit'; reference: string }[] }
```
(Read-only; no redemption/payment endpoint — wallet debits only via ERP `customer_payments` method 'wallet'.)

### 7.12 Loyalty (`getLoyalty`, :932-948)

```ts
{ points: number; cashback: number; tier: string; pointsHistory: any[] }  // tier default 'Standard'
```

### 7.13 Notification (`portalService.getNotifications` :1009-1013; table 0001:1150)

```ts
interface PortalNotification {
  id: string; portal_user_id: string; type: string; title: string;
  body: string|null; link: string|null; is_read: boolean; created_at: string;
}
```
(plus `portal_notifications` flat columns; `is_read` may be null on legacy rows.)

### 7.14 Catalog (`getCatalog`, portalService.cjs:238-299)

```ts
interface PortalCatalogItem {
  id: string; name: string; sku: string|null; unit: string;
  type: string|null;                 // Product | Stationery | Service | Raw Material(EXCLUDED)
  description: string|null;
  price: number;                     // sellingPrice ?? selling_price ?? price
  quantity: number;                  // stock ?? quantity
  category: string;                  // category ?? type ?? 'General'
  status: string;                    // 'Active' default; 'deleted' rows excluded
  variants?: { id: string; productId: string; name: string; sku: string|null;
               attributes: any; sellingPrice: number; costPrice: number;
               stock: number; active: boolean }[];
}
```
Raw-material/stock items are filtered out; sorted by name. Reads the Supabase `products` table (NOT `inventory` — the sync gateway never writes cloud `inventory`).

### 7.15 Request / Quotation Request (portalLifecycleService.cjs:775-851, 968-1006)

```ts
interface QuotationRequestRecord {
  id: string; request_number: string;              // REQ-/ORD-YYYY-###### or ODR-YYYY-######
  customer_id: string; customer_name: string;
  request_type: 'quotation'|'order';
  items: RequestLineItem[];                        // incl. promotion fields (see 7.6 items)
  subtotal: number; discount_total?: number; total?: number;
  promotion?: RequestPromotionInfo|null; promotion_applied?: boolean;
  notes: string|null; status: 'draft'|'submitted'|'assigned'|'under_review'|'waiting_for_customer'|'ready_for_conversion'|'converted'|'rejected'|'cancelled';
  review_note: string|null; reviewed_by: string|null; reviewed_at: string|null;
  quotation_id: string|null; quotation_number: string|null;
  sales_order_id: string|null; sales_order_number: string|null;
  reorder_of: string|null; reorder_of_number: string|null;
  requested_delivery_date: string|null;
  attachments: { name: string; url: string; type: string }[];
  created_by: string; created_at: string; updated_at: string;
}
```
Order preview (`POST /orders/preview`): `{ applied, promotion, lines[], subtotal, discountTotal, subtotalBeforeDiscount, subtotalAfterDiscount, taxableSubtotal, grandTotal, metadata }` with per-line `originalUnitPrice/discountPercent/discountAmount/netUnitPrice/promotionId/promotionCode/priceSource`.

### 7.16 Document support records

```ts
DocumentVersionRecord { id, version, snapshot: { items?, subtotal?, discount?, taxRate?, taxAmount?, deliveryFee?, total?, currency?, paymentTerms?, validUntil?, status? }, reason, created_by, created_by_name, created_at }
DocumentSignatureRecord { id, decision: 'accepted'|'rejected'|'revision', signed_by, signer_name, signer_email, note, ip_address, created_at }
DocumentCommentRecord { id, doc_type, doc_id, author_type: 'customer'|'admin'|'system', author_id, author_name, visibility: 'customer'|'internal', body, created_at }
TimelineEvent { id, doc_type, doc_id, event_type, title, description, actor_type, actor_name, created_at }
DownloadGateResult { allowed, docType, docId, docNumber, downloadId }
```

---

## 8. ERROR CONTRACT

Canonical shape: **`{ "error": "<machine-code-ish title>", "message": "<human text>" }`** (plus optional extras). The live client surfaces `body.message || body.error` and attaches `error.status` + `error.body` (`portalApiClient.ts:211-215`).

| Status | Meaning | Examples (error → message) |
|---|---|---|
| 400 | Validation / bad input | `'Customer ID and full name are required'`; `'At least one line item is required'`; `'Password must be at least 6 characters'`; `'docType and docId are required'`; `'Invalid or expired reset code'`; `'Current password is incorrect'`; `'You cannot refer yourself'`; `'File type not allowed'` (upload) |
| 401 | Not authenticated / bad token / bad 2FA / expired | `'Access denied' → 'No authentication token provided'`; `'Token expired' → 'Your session has expired. Please login again.'`; `'Invalid token'`; `'Invalid credentials'`; `'Invalid verification code'`; `'Invalid or expired refresh token'` |
| 403 | Wrong role / forbidden | `'Invalid token role'`; `'Wrong portal' + code ACCOUNT_BELONGS_TO_ADMIN/ACCOUNT_BELONGS_TO_CUSTOMER`; invoice revert stub always 403 |
| 404 | Not found | `'Order not found'`, `'Invoice not found'`, `'Quotation not found'`, `'Request not found'`, `'Delivery note not found'`, `'User not found'`, `'Session not found'`, `'Attachment not found'` |
| 409 | Conflict | `'This account has no pending invite...'` (activate, `NOT_INVITED`) |
| 429 | Rate limited | `{ error: 'Rate limit exceeded', message, retryAfter }` + `Retry-After` header + `X-RateLimit-*` headers |
| 500 | Server error | `'Failed to load dashboard'`, `'Failed to load orders'`, `'Login failed'`, etc. — generic, stable titles |

Notes:
- Business-rule violations are usually 400 with the human message in `error` (e.g. `'This quotation has expired and can no longer be accepted'`, `'Invalid request transition...'`).
- `message` is optional on many 500s — Sasa's `apiClient` must fall back `error.message ?? error.error ?? 'Request failed with status <code>'`.
- Strict-read policy: a DB failure is NEVER masked as an empty list — it 500s (`getAllFrom` → `repo.getAllStrict`).
- The live client also has offline-first behavior: GET failures (network/5xx) fall back to cached snapshots (`portalCache.ts`), and 401s trigger one auto-refresh-retry with header `X-Refresh-Attempt: true`.

---

## 9. OWNERSHIP / SECURITY MODEL

The enforcement pattern is **exactly**:
```
Authorization: Bearer <JWT>  →  verifyPortalToken  →  req.portalUser = { id, customer_id, email, role }
   └─ every route passes req.portalUser.customer_id / req.portalUser.id into services
       └─ services filter reads with customerFilter(table, customerId)  (portalScope.cjs)
          AND re-verify each returned row in JS (scopedRows / explicit id+customer checks)
```

Key facts:
- `customerFilter` (portalScope.cjs) is the canonical PostgREST scope. Dual-key tables (`sales_orders`, `quotations`) use `or=(data->>customerId.eq.X,data->>customer_id.eq.X)` because ERP frontend stores write camelCase `customerId` while the backend shim writes snake_case `customer_id`. Single-key tables: `quotation_requests`→`customer_id`; `customer_payments, invoices, delivery_notes, shipments, sales, wallet_transactions, engagement_cashback, engagement_points`→`customerId`; `customer_referrals, referral_rewards`→`customer_id`.
- **Detail reads double-check ownership in JS**: `getOrderById`, `getInvoiceById`, `getPaymentById`, `getQuotationById`, `getRequestById`, `getShipmentById`, `getReferralById`/`getReferralTimeline`, `getDeliveryNoteForDelivery` all fetch by id then compare `customerId/customer_id === authenticated customer`; mismatch → `null` → 404. This is defense-in-depth over the RLS `allow_all` policies (single-company schema).
- **Writes never trust client ids**: `POST /requests`, `/quotations/:id/accept|reject|revision`, `/orders/:id/reorder`, `/comments`, `/downloads`, `/payments*`, `/support/tickets/*`, `/referrals` all take `customer_id` from the JWT, never from the body. `POST /payments` re-verifies the target invoice belongs to the customer (`getInvoiceById(invoiceId, customer_id)`).
- **Notification ownership** is by `portal_user_id` (JWT `id`), not `customer_id` — Sasa must use the portal user id for notifications, customer id for documents.
- **Referral create** intentionally references ANOTHER customer (`referredCustomerId` from body) — cross-customer by design (it's the referrer's own record). Duplicate active referrals rejected.
- **`GET /referrals/customers/search`** searches the entire `customers` directory (name/email) — any authenticated customer can enumerate other customer names/emails (by design for referral selection, but see §17).
- **Events SSE** delivery is filtered server-side by `customer_id` (`shouldDeliver`, portalLifecycleService.cjs:463-474).
- **Enforcement location:** application code (backend services). RLS is the permissive `allow_all` single-company pattern; there are NO customer-scoped RLS policies. Any direct Supabase access by Sasa would bypass ownership entirely — Sasa must go through `/api/portal/*`.

**Where customer_id is NOT server-enforced:**
- `GET /catalog`, `/promotions`, `/ads`, `/referrals/settings` — global/display endpoints (no per-customer data).
- `GET /referrals/customers/search` — cross-customer search by design (§17).

---

## 10. REALTIME / SSE CONTRACT

- **Ticket issuance:** `POST /api/portal/events-ticket` (JWT, 30/hr) → `{ ticket, expiresIn: 300 }`. Ticket = JWT signed with the same `JWT_SECRET`, payload `{ id, customer_id, email, role: 'portal_customer', purpose: 'portal', sse: true }`, `expiresIn: '5m'`.
- **Stream:** `GET /api/portal/events?token=<ticket>` (EventSource; the query-token exception is in `verifyPortalToken`, portalAuth.cjs:30-33). The connection is registered on the `portal` channel.
- **Handshake:** `Content-Type: text/event-stream`, `Cache-Control: no-cache, no-transform`, `X-Accel-Buffering: no`. Server first writes `retry: 15000\n\n`.
- **Heartbeat:** comment line `: ping` every **25 s**.
- **Event names:** `entity_changed`, `notification` (client also subscribes to these two only).
- **Payloads:**
  - `entity_changed`: `{ customerId, docType, docId, event, eventType, status, docNumber, metadata, updatedAt }` (from `publicEntityPayload`, :675-695). Emitted on request create/cancel/convert, quotation create/accept/reject/revision/expire/convert, order create/status-change/reorder, invoice post/update/void/payment, comment add, download.
  - `notification`: `{ customerId, type, title, body, link, actorName, createdAt }` (`notifyCustomer`, :518-532).
- **Delivery filter:** for the portal channel, events are only written to subscribers whose `req.portalUser.customer_id` matches `payload.customerId`.
- **Disconnect behavior:** `req.on('close')` unsubscribes and clears the heartbeat. Client `onerror` fires `Realtime connection lost`; the ERP client does NOT auto-reconnect its EventSource (browser EventSource would retry per `retry:` — 15s — but the ticket expires at 5 min; the live client refreshes the ticket on each `subscribe()` call and re-subscribes on page mount).
- **Which Sasa features can use it:** dashboard KPIs (entity_changed → refetch), notification drawer (notification + entity_changed), invoice/order/quotation/delivery detail refresh, document discussion updates. No Supabase Realtime is needed — this SSE hub is the portal's only realtime channel.

---

## 11. DOCUMENTS / PDF CONTRACT

- **Invoice PDFs / statements / quotations: NO server-side PDF endpoints exist.** The portal renders documents client-side:
  - `GET /api/portal/documents` returns `{ id, type: 'invoice'|'receipt', title, date, url: '#/portal/invoices/<id>', amount }` — `url` is a client-side hash link, not a file.
  - Quotation/order "downloads" are gated + audited via `POST /api/portal/downloads` (`{docType: 'quotation'|'order', docId}` → `{allowed, downloadId, ...}`), which records a `portal_downloads` row + timeline + admin notification. The actual PDF is generated client-side (frontend print/render; the CSP allows `prime-pdf:` scheme).
  - Delivery notes: `GET /api/portal/deliveries/:id/note` returns the delivery-note **JSON record** (not a file).
- **The only server-streamed files are support-ticket attachments:** `GET /api/portal/support/tickets/:id/attachments/:attachmentId` → binary stream, `Content-Type` from stored `mime_type`, `Content-Disposition: attachment; filename="<original_name>"`, 10 MB upload cap with MIME allowlist (jpeg/png/gif/webp/pdf/txt/csv/doc/docx/xls/xlsx/zip).
- **Authorization:** all of the above require the portal JWT; document-level ownership is customer-scoped in the service layer.

---

## 12. BROWSER ENVIRONMENT CONFIGURATION

Browser-safe config only (no secrets):

| Var | Purpose | ERP usage | Sasa requirement |
|---|---|---|---|
| `VITE_API_URL` | Backend origin, **no `/api` suffix** | `config/api.js`: `API_BASE_URL = VITE_API_URL + '/api'` (production); relative `/api` in dev (Vite proxy → `http://127.0.0.1:3000`, `vite.config.ts:46-56`) | Sasa's adapter currently treats `VITE_API_URL` as the full `/api/portal` base (`BASE_URL = VITE_API_URL || '/api/portal'`) — **this is a contract mismatch**; Sasa must compose `${VITE_API_URL}/api/portal` (or set a Sasa-specific base to the full path). Default `/api/portal` works under a reverse-proxy/Netlify `_redirects`/Vercel rewrites setup identical to the ERP's |
| `VITE_SUPABASE_URL` | Supabase project URL | Cloud sync for ERP stores; **not required** for the portal API path | Not needed by Sasa for API use (Supabase anon-key RLS is permissive; direct access is out of scope) |
| `VITE_SUPABASE_ANON_KEY` | Supabase publishable anon key | Same as above | Not needed by Sasa |
| `VITE_USE_REAL_BACKEND` | Sasa flag (`'true'` switches off mock data) | n/a | Sasa-specific; leave `'true'` in production |
| CORS | — | Allowlist: `primeerp.com`, `admin.primeerp.com`, `portal.primeerp.com`, `*.primeerp.com`, `*.vercel.app`, `*.netlify.app`, local/LAN, `CORS_ORIGIN` env; credentials true (`index.cjs:151-228`) | Sasa's deployed origin must be on this allowlist (e.g. a `*.vercel.app` / `*.netlify.app` / `*.primeerp.com` domain or `CORS_ORIGIN`) |

**Do NOT expose to the browser:** `SUPABASE_SECRET_KEY` (service role), `JWT_SECRET`, DB passwords, Stripe secret keys. The portal JWT is issued only by the backend.

---

## 13. ERP BUSINESS WORKFLOWS (as actually implemented)

A. **Customer requests quotation** — `POST /api/portal/requests` (requestType `'quotation'`) → request `submitted` → admin notified (SSE `notification` + `entity_changed` + `admin_notifications`) → staff review pipeline (`assigned → under_review → waiting_for_customer → ready_for_conversion`) via `/api/portal/admin/*` (`routes/portalAdmin.cjs`, backend-only functions in portalLifecycleService) → staff saves official quotation in ERP editor → `completeQuotation` creates the `quotations` row, links request↔quotation, notifies customer (`Your quotation <num> is ready`) → customer sees it in portal, can accept/reject/request revision.

B. **Customer order** — `POST /api/portal/requests` (requestType `'order'`) → same review pipeline → staff creates official sales order → `completeSalesOrder` (SO-YYYY-######, status `Confirmed`) → customer notified. Order lifecycle then driven by ERP: production statuses `Processing → Shipped → Delivered/Fulfilled` (each `updateOrderStatus` change emits `entity_changed` + notification to customer). Invoices are ERP-created; portal payment records `POST /api/portal/payments` (or Stripe intent flow) → invoice status `paid`/`partially_paid`, `payment_made` event. Deliveries: ERP creates `delivery_notes` / dispatches `shipments` → `GET /api/portal/deliveries/banner` banners + `entity_changed`; POD-sealed status `Delivered` drops the banner.

C. **ERP-created quotation** — Any official ERP quotation linked to a customer appears in `GET /api/portal/quotations` (rows carry `customer_id`/`customerId`). If generated from a portal request, the request shows `converted` and links to it. Customer can respond (accept/reject/revision) from the portal.

D. **ERP-created invoice** — `invoices` rows written by ERP stores appear in `GET /api/portal/invoices` + `GET /api/portal/statements` + dashboard. No portal action required (display only).

E. **ERP-recorded payment** — payments recorded by ERP staff (`POST /api/payments` admin path in index.cjs, or `customer_payments` rows) appear in `GET /api/portal/payments`, statements, invoice `paid_amount`, and emit `payment_allocated`/`payment_made` events to the portal channel.

F. **ERP delivery update** — status changes to `delivery_notes`/`shipments` are immediately reflected in `/shipments`, `/deliveries/banner`, `/deliveries/today` and broadcast via `entity_changed` (docType `order`/`delivery`). Portal delivery tracking is read-only.

G. **Referrals** — customer creates a referral (`POST /api/portal/referrals` with a known `referredCustomerId`); referralService tracks status; rewards accrue on invoice qualification; customer views list/rewards/timeline/stats. **Note:** this workflow is broken in live until migrations 0003/0004 are applied (see §14).

H. **Wallet/loyalty** — derived from ERP engagement tables (`engagement_point_balances`, `engagement_points`, `engagement_cashback`, `engagement_customer_tiers`, `wallet_transactions`, `customer_payments` method `'wallet'`); read-only in the portal.

---

## 14. DATABASE BLOCKERS

Verified against `supabase/migrations/` and the 0001 baseline capture:

| Migration | Status | Impact |
|---|---|---|
| `0003_referral_tables.sql` | **PENDING — not applied** | Creates `customer_referrals`, `referral_rewards` (with vestigial `company_id`). These tables are **absent from the 0001 live baseline** → every referral read (`GET /api/portal/referrals*`) runs `getAllStrict` → 500s in live; `GET /api/portal/wallet` also queries `referral_rewards` → 500s. Referral RPCs/analytics have no cloud tables to read. |
| `0004_referral_rls_policies.sql` | **PENDING — not applied** | Enables RLS + permissive `allow_all` policies on the two referral tables. No-op until 0003 lands. |
| `0005_portal_quotation_requests.sql` | **PENDING — not applied** | Creates the missing `quotation_requests` table. The 0005 header states live portal reads of `/dashboard`, `/requests`, `/documents` and recent-activity currently **500** because this table only exists in the backend SQLite shim. |
| referral RPCs | Not present in live schema | Referral service relies on table reads (JS-computed analytics), no RPCs in 0001. |
| referral analytics | Present in frontend services only (`referralAnalyticsService.ts`) | No backend analytics RPC; stats are JS-computed from tables. |
| `quotation_requests` | Missing in 0001 baseline | Blocked until 0005. |

Also absent from the 0001 baseline (portal-owned lifecycle tables used by `portalLifecycleService`): `portal_timeline_events`, `document_versions`, `document_signatures`, `document_comments`, `portal_downloads`. If these are also missing in live, quotation decision/signature/version/comment/timeline/download endpoints 500 — they are created only by backend SQLite shims (`backend/db.cjs` portal section, `db.cjs:2032-2306`). **Verification against live is required before Phase 4.**

Present in 0001 (safe): `portal_users`, `portal_sessions`, `portal_password_resets`, `portal_notifications`, `portal_tickets`, `portal_ticket_messages`, `customers`, `invoices`, `sales_orders`, `quotations`, `customer_payments`, `delivery_notes`, `shipments`, `products`, `wallet_transactions`, `engagement_*`.

---

## 15. SASA → ERP MAPPING

Sasa service → ERP endpoint → request → ERP response → Sasa type. Status legend: **READY TO CONNECT** (endpoint exists, shape verified), **NEEDS ADAPTER** (exists but requires a client-side shape/flow adaptation), **ERP ENDPOINT MISSING**, **ERP DATA MISSING**, **BLOCKED BY MIGRATION**, **BLOCKED BY SECURITY ISSUE**.

| Sasa service | ERP endpoint | Status |
|---|---|---|
| authService.login | `POST /api/auth/login` `{email, password, portal:'customer', two_factor_code?}` → login payload | **READY TO CONNECT** (needs the ERP session-store/rotation client logic — see JWT §2/§3) |
| authService.2FA challenge | inline on login (`requires_two_factor`) | **READY TO CONNECT** |
| authService.logout | `POST /api/portal/auth/logout` | **READY TO CONNECT** |
| authService.refresh | `POST /api/portal/auth/refresh` | **READY TO CONNECT** (rotation + single-flight required) |
| authService.activate | `POST /api/portal/auth/activate` | **READY TO CONNECT** |
| authService.forgot/reset | `POST /api/portal/auth/forgot-password`, `/reset-password` | **READY TO CONNECT** |
| account / profile | `GET|PUT /api/portal/profile`, `PUT /profile/password`, `GET /auth/sessions`, `DELETE /auth/sessions/:id` | **READY TO CONNECT** (Sasa `AccountProfile` → map `full_name→customerName`, `creditLimit`, `balance`; `accountNumber`/`companyName`/`tier`/`accountManager`/`referralCode` have no ERP source → **ERP DATA MISSING**, use loyalty `tier` and leave others optional) |
| dashboard | `GET /api/portal/dashboard` | **READY TO CONNECT** (live 500s until 0005 applied — **BLOCKED BY MIGRATION** in production) |
| products (catalog) | `GET /api/portal/catalog` (+ `/promotions`, `/ads`) | **READY TO CONNECT** (Sasa `Product` needs `category`, `price`, `unit`, `sku`, `description`, `inStock`→`quantity>0`, `image`→ **ERP DATA MISSING** — catalog has no image field) |
| invoices | `GET /api/portal/invoices`, `GET /api/portal/invoices/:id` | **READY TO CONNECT** (**NEEDS ADAPTER**: ERP returns `invoice_number/total_amount/paid_amount/status/due_date/created_at` snake_case summary; Sasa `Invoice` uses camelCase `invoiceNumber/amount/amountPaid/amountRemaining/status/issueDate` + `pdfUrl` → derive `amountRemaining = total_amount - paid_amount`; `pdfUrl` **ERP ENDPOINT MISSING** — no server PDF; client renders) |
| payments | `POST /api/portal/payments/intent`, `POST /api/portal/payments`, `GET /api/portal/payments`, `GET /api/portal/payments/:id` | **READY TO CONNECT** |
| orders | `GET /api/portal/orders`, `GET /api/portal/orders/:id`, `POST /api/portal/orders/:id/reorder`, `POST /api/portal/orders/preview` | **READY TO CONNECT** (**NEEDS ADAPTER**: statuses `Confirmed/Pending/Processing/Shipped/Delivered/Fulfilled/Cancelled/Draft` map onto Sasa `OrderStatus`; `order_number`, `totalAmount`; no direct "create order" endpoint — ordering is via requests) |
| quotations | `GET /api/portal/quotations`, `GET /api/portal/quotations/:id`, `POST .../accept`, `/reject`, `/revision`, `/versions`, `/signatures` | **READY TO CONNECT** |
| quotation requests | `GET|POST /api/portal/requests`, `GET /requests/:id`, `POST /requests/:id/cancel` | **READY TO CONNECT** (**BLOCKED BY MIGRATION** 0005 in live; **NEEDS ADAPTER**: Sasa `QuoteRequest` fields `quoteNumber/requiredByDate/deliveryLocation/priority/attachmentsCount` map to `request_number/requested_delivery_date/attachments`, no `deliveryLocation`/`priority` → **ERP DATA MISSING**) |
| deliveries | `GET /api/portal/shipments`, `GET /api/portal/shipments/:id`, `GET /api/portal/deliveries/today`, `GET /api/portal/deliveries/banner`, `GET /api/portal/deliveries/:id/note` | **READY TO CONNECT** (**NEEDS ADAPTER**: Sasa `DeliveryNotification` fields `deliveryAddress`, `itemsSummary`, `proofOfDelivery.photoUrl` → `shipping_address`, derive summary, POD photo **ERP ENDPOINT MISSING** (POD is a status/flag, no photo URL served)) |
| statements | `GET /api/portal/statements?startDate&endDate` | **READY TO CONNECT** (Sasa `StatementEntry` maps `date/description/debit/credit/balance`; `type` values `'Invoice'|'Payment'|'Credit Note'|'Adjustment'` ← ERP `invoice|payment|credit_note`, no `Adjustment` → **NEEDS ADAPTER**) |
| referrals | `GET /api/portal/referrals`, `GET /referrals/:id`, `/rewards`, `/settings`, `/stats`, `/:id/timeline`, `POST /referrals`, `GET /referrals/customers/search` | **BLOCKED BY MIGRATION** (0003/0004 pending) in live; **READY TO CONNECT** once applied. **NEEDS ADAPTER**: Sasa `Referral.status` (`invited/registered/first_purchase_completed/reward_issued`) ← ERP `active/pending/converted/...` statuses differ; Sasa `refereeName/email/dateInvited/rewardClaimed` map to `referredCustomerName/Email`, `createdAt`, reward status |
| wallet | `GET /api/portal/wallet` | **READY TO CONNECT** (read-only; no redemption endpoint → Sasa wallet redemption **ERP ENDPOINT MISSING**) |
| loyalty | `GET /api/portal/loyalty` | **READY TO CONNECT** |
| notifications | `GET /api/portal/notifications`, `/notifications/unread-count`, `PUT /notifications/:id/read`, `PUT /notifications/read-all`, SSE `/events` (+ `/events-ticket`) | **READY TO CONNECT** |
| realtime | SSE (§10) | **READY TO CONNECT** |
| support | `GET|POST /api/portal/support/tickets`, messages, status, attachments | **READY TO CONNECT** |
| documents | `GET /api/portal/documents`, `POST /api/portal/downloads`, `GET /timeline`, `GET|POST /comments`, `GET /document-chain` | **READY TO CONNECT** (**BLOCKED BY MIGRATION** for `documents`/`timeline`/`comments`/`document-chain` if lifecycle tables are absent in live — verify) |

---

## 16. MISSING FUNCTIONALITY (ERP gap list for Sasa)

1. **No server-side PDF/document generation or streaming** for invoices, statements, quotations, orders, delivery notes (client-side rendering only).
2. **No direct "place order" endpoint** — orders are created via quotation-request pipeline (`request_type: 'order'`) or ERP staff. Sasa's checkout must map to `POST /api/portal/requests`.
3. **No wallet redemption/payment-using-wallet endpoint** (wallet is read-only in portal; wallet payments exist only as ERP-side `customer_payments` rows with method `'wallet'`).
4. **No product images** in catalog (no `imageUrl` field).
5. **No account manager / company / referral-code/profile tier fields** in the ERP profile payload.
6. **No standalone TOTP challenge endpoint** (challenge is inline in login).
7. **No notification pagination** and **no SSE auto-reconnect with ticket rotation** (client must re-subscribe every ≤5 min).
8. **No proof-of-delivery photo URL** (POD is a status on the shipment record).
9. **Invoice list/detail do not include `pdfUrl`**; `amountRemaining` must be derived.
10. **No loyalty redemption**; loyalty is display-only (points/cashback/tier).

---

## 17. SECURITY CONCERNS (documented for Phase 4 — NOT fixed in this phase)

1. **`GET /api/portal/auth/me` returns the full `portal_users` row** including `password_hash` and `two_factor_secret` (`routes/portalAuth.cjs:244-253` → raw repo row). Client never uses it (portal UI relies on the session payload), but Sasa must NOT rely on `/auth/me` for profile display.
2. **`portal_users.two_factor_secret` stored in plaintext** (base32) and returned by `/two-factor/setup` — standard for TOTP onboarding but the stored secret is a long-lived credential.
3. **Referral customer search enumerates the whole customer directory** (`GET /referrals/customers/search?q=` name/email ilike) — information disclosure by design; acceptable for referrals, but rate/scope awareness needed.
4. **RLS is permissive `allow_all` on portal tables** — isolation depends entirely on application-level scoping. Any code path that reads a table without `customerFilter` leaks cross-customer data; Sasa must ONLY use `/api/portal/*` (never direct Supabase).
5. **Session tokens live in `sessionStorage`** with 30-day refresh tokens (hashed at rest, plaintext in browser) — XSS exposure window is the standard SPA trade-off.
6. **Rate limits are per-IP only**, in-memory unless Redis is configured; `authLimiter` keys on `username` which the portal sends as `email` — two portal users behind one IP share a login budget (10/15 min).
7. **Dual-spelling customer keys** (`customerId` vs `customer_id`) create a class of scoping bugs; the portal mitigates with OR filters + JS row checks — Sasa should not replicate this logic client-side.
8. **Wrong-portal error messages** leak account type (staff vs customer) via `code: ACCOUNT_BELONGS_TO_ADMIN` / `ACCOUNT_BELONGS_TO_CUSTOMER`.
9. **`X-Refresh-Attempt` header** is client-controlled; harmless today (retry only re-sends with a new token).
10. **Uploaded ticket attachments** are stored on backend disk with no filename sanitization issue (uuid names) but MIME sniffing is client-supplied.

---

## 18. RECOMMENDED INTEGRATION ORDER (for Phase 4+)

1. **Apply migrations 0005, 0003, 0004** (in that order) against live Supabase — unblocks dashboard/requests/documents/wallet/referrals. (Database owner action, not part of this read-only phase.)
2. **Sasa auth layer first**: implement the ERP login/refresh/logout/2FA client (JWT from `id`/`customer_id`, rotation, 25-min proactive refresh, `portal_session` storage shape, `portal-session-expired` handling). Verify against a test portal account.
3. **Static reads**: profile, dashboard, catalog, loyalty, wallet, notifications (+ SSE subscribe).
4. **Documents**: invoices, orders, quotations (+ accept/reject/revision), requests (+ create/cancel), statements, shipments/deliveries.
5. **Writes**: order preview, request submission, payments (intent + record), referrals, support tickets, comments/downloads.
6. **Run parallel**: keep the built-in portal live; gate Sasa traffic with the same CORS allowlist; remove the built-in portal only after Sasa passes functional equivalence.
7. **Verify live table presence** for `portal_timeline_events`, `document_versions`, `document_signatures`, `document_comments`, `portal_downloads` before enabling those Sasa screens.

---

## PHASE 3 STATUS

```
AUTH:               READY     (dual login paths verified; JWT + refresh + 2FA + reset/activate contracts extracted)
API:                BLOCKED   (endpoints exist and are fully mapped; /dashboard, /requests, /documents 500 until
                               migration 0005 applied; referral/wallet 500 until 0003+0004 applied)
CUSTOMER IDENTITY:  READY     (portal_users.customer_id → customers.id, JWT claim `customer_id`, dual-spelling scope)
ORDERS:             READY     (list/detail/reorder/preview verified; creation via requests pipeline)
INVOICES:           READY     (list/detail/statements verified; no server PDF — client-render)
QUOTATIONS:         READY     (list/detail/accept/reject/revision/versions/signatures verified)
PAYMENTS:           READY     (intent + record + list/detail verified; Stripe/mock modes)
DELIVERIES:         READY     (shipments/today/banner/note verified; read-only)
STATEMENTS:         READY     (ledger with opening/closing balances verified)
REFERRALS:          BLOCKED   (all referral endpoints 500 in live — migrations 0003/0004 pending)
NOTIFICATIONS:      READY     (list/unread/read/read-all + SSE entity_changed + notification verified)
DATABASE:           BLOCKED   (0003, 0004, 0005 PENDING; lifecycle tables unverified in live)
```

**Bottom line:** the ERP exposes a complete, well-scoped portal API. Sasa can connect to every service above as soon as the three pending migrations (0005 first, then 0003+0004) are applied to live Supabase and the presence of the five lifecycle tables is confirmed. The auth contract (unified `/api/auth/login` with `portal: 'customer'`, portal JWT with `id`/`customer_id` claims, rotating refresh) is directly consumable by Sasa's tokenStore with the adapter changes noted in §2/§3/§15. No ERP code changes, new endpoints, renames, or multi-tenancy are required for any of the mapped services.

**Phase 3 made NO changes to the repository.**