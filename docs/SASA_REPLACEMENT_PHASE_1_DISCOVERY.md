# SASA REPLACEMENT — PHASE 1 DISCOVERY REPORT

**Existing Portal → Sasa Customer Portal Migration — Discovery Only (no changes made)**

- **ERP repository:** `https://github.com/Prime-K53/PrimeERPsystem.git` (local: `D:\FonePaw\PrimeERPsystem`)
- **Sasa repository:** `https://github.com/PrimePrinting/Sasa.git` (local clone: `%TEMP%\opencode\Sasa`)
- **Date:** 2026-08-14
- **Phase mandate:** DISCOVERY ONLY. No application code, schema, Supabase, auth, or routing changes were made. Nothing was deleted. Sasa was not modified.

**Architectural guardrails observed throughout this phase (confirmed intact):**
1. PrimeERPsystem is a **single-company ERP** — no `tenant_id`, no multi-tenancy.
2. `company_id` exists only as a vestigial column on 7 of 159 tables (see §5.4); no multi-tenant architecture was introduced.
3. ERP `customers` remain the source of truth for customer records; portal users link to them via `portal_users.customer_id = customers.id`.
4. The existing portal remains fully operational; removal is deferred until Sasa passes complete functional verification.

---

## 1. EXISTING PORTAL ARCHITECTURE

### 1.1 System context

```
┌───────────────────────────── ERP FRONTEND (React 18 + Vite, offline-first) ─────────────────────────────┐
│  HashRouter (#/...), provider stack: AuthProvider → ... → DataProvider → CustomerAuthProvider → Routes  │
│                                                                                                        │
│  ERP UI (views/*)                    PORTAL UI (views/portal/*)          ADMIN PORTAL UI (ERP shell)    │
│  - stores → IndexedDB                 - CustomerLayout + 26 pages        - PortalUserManagement        │
│  - syncService → /api/sync/ops        - portalApiClient (JWT, cache)     - adminPortalClient (ERP JWT) │
│  - realtime via Supabase              - SSE /portal/events               - SSE /portal/admin/events    │
└──────────────────────────────┬───────────────────────────────────────────┬──────────────────────────────┘
                               │                                           │
                 /api/sync/ops (ERP token)          /api/portal/* + /api/portal/auth/* (portal JWT)
                                                 /api/portal/admin/* (ERP token)  /api/auth/login (both)
┌──────────────────────────────▼───────────────────────────────────────────▼──────────────────────────────┐
│                               BACKEND (Node.js Express, backend/)                                        │
│  db.cjs (local SQLite, WAL)  +  services/supabaseRepository.cjs (PostgREST, service-role)                │
│  portalService / portalLifecycleService / portalAuthService / portalScope / workflowEngine /             │
│  promotionEngine / referralService / authService / emailService / cloudSyncStore …                       │
└──────────────────────────────┬───────────────────────────────────────────┬──────────────────────────────┘
                               │                                           │
                        Supabase PostgreSQL (159 tables, JSONB envelope, RLS)  └── Stripe (optional, /payments/intent)
```

**Key architectural facts:**

- The Portal is **not** a separate app. It is a frontend module (`frontend/views/portal/`) + a backend API surface (`/api/portal*`) inside the ERP monorepo. It shares the ERP's Supabase database, backend process, and several ERP services.
- The Portal uses **its own authentication** (backend-issued portal JWT, `role: portal_customer`) — independent of the ERP's Supabase-based staff auth.
- Customer identity resolution: `portal_users.customer_id` → `customers.id` (ERP customer row). Every portal query is customer-scoped server-side (`backend/services/portalScope.cjs`).
- Portal data reads are **customer-scoped reads over ERP tables** (customers, invoices, customer_payments, sales_orders, quotations, products, delivery_notes, shipments, wallet_transactions, engagement_*), plus **portal-owned lifecycle tables** (quotation_requests, portal_timeline_events, document_versions, document_signatures, document_comments, portal_notifications, admin_notifications, portal_downloads, portal_tickets, portal_sessions, portal_users, portal_password_resets, portal_login_history).
- Portal writes are **backend-mediated** (never direct Supabase from the customer UI); ERP writes are **frontend-store → IndexedDB → sync gateway** (`POST /api/sync/ops`) → Supabase.
- The portal is **portal-aware hosted**: `portal.primeerp.com` host lands directly on `/portal/login` (`frontend/App.tsx:1112–1130`).

### 1.2 Scope boundaries

| Boundary | Content |
|---|---|
| Portal customer UI | `frontend/views/portal/*` (26 pages, layout, 21 components, 2 hooks, 1 local context, utils, constants) |
| Portal customer auth infra | `frontend/context/CustomerAuthContext.tsx`, `frontend/services/authApiClient.ts`, `frontend/services/portalApiClient.ts`, `frontend/services/portalCache.ts`, `frontend/views/portal/CustomerLayout.tsx` |
| Portal admin UI (ERP-side) | `frontend/views/portal/PortalUserManagement.tsx` + `frontend/services/adminPortalClient.ts`; consumed by ERP views (`sales/QuotationRequests.tsx`, `sales/SalesOrders.tsx`, `sales/Orders.tsx`, `Settings.tsx`, `SalesContext.tsx`, `stores/salesStore.ts`, `context/NotificationContext.tsx`, `components/Sidebar.tsx`, `views/CustomersHub.tsx`, `views/tools/AdsManager.tsx`) |
| Portal backend | `backend/routes/portal.cjs`, `portalAuth.cjs`, `portalAdmin.cjs`, `routes/auth.cjs` (unified login), `routes/referralRoutes.cjs`, `routes/notifications.cjs`, `routes/promotions.cjs` (partially), `backend/middleware/portalAuth.cjs`, `backend/services/portal*.cjs`, `backend/services/referralService.cjs`, `backend/services/promotionEngine.cjs`, `backend/services/workflowEngine.cjs` |
| Portal DB (Supabase) | See §5 — portal-owned tables + customer-scoped reads of ERP tables |
| Portal DB (backend SQLite) | `backend/db.cjs:2032–2306` portal lifecycle tables + referral tables (`db.cjs:1103–1270`) |
| Dead/vestigial | `backend/routes/erpPortalMirror.cjs` (0 lines, unreferenced), `frontend/views/portal/sampleData.ts` (482 lines mock data, zero imports), `frontend/views/auth/Gateway.tsx` (dead, still imports `getPortalSession`) |

---

## 2. EXISTING PORTAL ROUTE MAP

Router: **react-router 6.22.3, HashRouter** (`frontend/App.tsx:1268`). Portal routes are a `<React.Fragment>` `PortalRoutes` at `App.tsx:1071–1107`, mounted in **all three** `RootNavigator` trees (setup-pending, logged-out, logged-in ERP) so customers can sign in without an ERP session.

### 2.1 Public (unauthenticated) routes

| Path | Component | Lazy | Notes |
|---|---|---|---|
| `/portal/login` | `CustomerLogin` | No (eager) | Email+password via unified login; built-in 2FA step |
| `/portal/activate` | `CustomerActivate` | No (eager) | Customer ID + 6-digit invite code + new password |
| `/portal/forgot-password` | `CustomerForgotPassword` | No (eager) | Wrapped in `ToastProvider` |
| `/portal/reset-password` | `CustomerResetPassword` | No (eager) | Reads `?email=` & `?code=`; wrapped in `ToastProvider` |

### 2.2 Protected routes (parent `<Route path="/portal" element={<CustomerLayout/>}>`, `App.tsx:1077`)

Guard = `CustomerLayout` (`frontend/views/portal/CustomerLayout.tsx:132–134`): `!isAuthenticated → <Navigate to="/portal/login">`. All feature pages are lazy-loaded via `lazyWithRetry` (3 retries, `App.tsx:53–90`).

| Path | Component | Lazy |
|---|---|---|
| `/portal` (index) | `Navigate → /portal/dashboard` | — |
| `/portal/dashboard` | `CustomerDashboard` | ✔ |
| `/portal/requests` | `CustomerRequests` | ✔ |
| `/portal/requests/:id` | `CustomerRequestDetail` | ✔ |
| `/portal/orders` | `CustomerOrders` (wrapped in `CartProvider`) | ✔ |
| `/portal/orders/:id` | `CustomerOrderDetail` | ✔ |
| `/portal/shipments` | `Navigate → /portal/deliveries` | — |
| `/portal/shipments/:id` | `Navigate → /portal/deliveries` | — |
| `/portal/deliveries` | `CustomerDeliveries` | ✔ |
| `/portal/quotations` | `CustomerQuotations` | ✔ |
| `/portal/quotations/:id` | `CustomerQuotationDetail` | ✔ |
| `/portal/new-request` | `CustomerCreateRequest` | ✔ |
| `/portal/invoices` | `CustomerInvoices` | ✔ |
| `/portal/invoices/:id` | `CustomerInvoiceDetail` | ✔ |
| `/portal/payments` | `CustomerPayments` | ✔ |
| `/portal/payments/:id` | `CustomerPaymentDetail` | ✔ |
| `/portal/payment-options` | `CustomerPaymentOptions` (static page, no API) | ✔ |
| `/portal/statements` | `Navigate → /portal/account-statements` | — |
| `/portal/account-statements` | `CustomerAccountStatements` | ✔ |
| `/portal/wallet` | `CustomerWallet` | ✔ |
| `/portal/loyalty` | `CustomerLoyalty` | ✔ |
| `/portal/documents` | `CustomerDocuments` | ✔ |
| `/portal/notifications` | `CustomerNotifications` | ✔ |
| `/portal/referrals` | `CustomerReferrals` | ✔ |
| `/portal/profile` | `CustomerProfile` | ✔ |
| `/portal/support` | `CustomerSupport` (static page, no API) | ✔ |

### 2.3 Portal-adjacent ERP admin route (NOT customer-facing)

| Path | Component | Guard |
|---|---|---|
| `/portal/users` | `PortalUserManagement` (`App.tsx:825`, inside ERP `AppLayout`) | ERP admin session (logged-in tree only) |

### 2.4 Redirects, guards, fallbacks

- **Host-based landing:** `getLandingPath()` (`App.tsx:1112–1118`) — `portal.primeerp.com` / `*.portal.primeerp.com` → `/portal/login`; other hosts → `/login`.
- **Branding:** `isPortalContext()` (`App.tsx:1123–1130`) drives "PrimePORTAL" title/branding.
- **404 behavior:** no dedicated portal 404. Logged-out+portal-host → `/portal/login`; logged-in ERP session on an unmatched `/portal/xyz` falls through to the **ERP** dashboard (`App.tsx:1253`, `960`).
- **ERP permission guard:** `ProtectedRoute` (`App.tsx:258–271`) is ERP-only; the portal has no permission model (identity = customer_id).
- **Legacy redirects:** `shipments*` → deliveries, `statements` → account-statements.

---

## 3. EXISTING PORTAL AUTHENTICATION

### 3.1 Two independent auth systems

| Aspect | ERP admin auth | Portal customer auth |
|---|---|---|
| Context | `context/AuthContext.tsx` | `context/CustomerAuthContext.tsx` |
| Session storage | `sessionStorage['nexus_user']` + cached localStorage | `sessionStorage['portal_session']` |
| Session shape | user + Supabase accessToken + authMode | `{access_token, refresh_token, expires_in:'30m', user}` |
| Token | Supabase GoTrue JWT (or local SHA-256) | Backend-issued portal JWT, `role: 'portal_customer'`, 30-min TTL |
| Refresh | Supabase SDK / inactivity timeout | 25-min proactive timer + 401-triggered single-flight rotation |
| Login endpoint | Supabase `signInWithPassword` | `POST /api/auth/login` with `portal:'customer'` |
| Logout | `signOut` | `POST /api/portal/auth/logout` + clear session |
| 2FA | ERP staff MFA (local) | Portal TOTP 2FA (otplib, ±1 window) |
| Roles | user groups + permissions | none (customer_id only) |

### 3.2 Portal user ↔ ERP customer mapping

- **`portal_users.customer_id = customers.id`** — the single identity contract.
- `portal_users` columns: `id, customer_id, email (UNIQUE), password_hash (bcrypt, 10 rounds), full_name, phone, status ('invited'|'active'|'disabled'), two_factor_enabled, two_factor_secret, two_factor_confirmed, last_login_at, …` (`backend/db.cjs:2032–2044`).
- **Legacy mirror:** `customers.data` JSONB may carry `portalEmail / portalPasswordHash / portalStatus / portalUserId` (`backend/services/portalAuthService.cjs:78–89`); Supabase fallback auth reads `data->>portalEmail` (`:136–187`).
- **Scoping:** every `/api/portal/*` request is double-gated — PostgREST filter via `portalScope.cjs` (`data->>customerId` and/or `data->>customer_id`) **plus** in-JS ownership checks on reads and writes.
- **Portal JWT claims:** `{id, customer_id, email, role:'portal_customer'}`, 30-min expiry (`backend/middleware/portalAuth.cjs:10–18`); `verifyPortalToken` rejects any other role (403) and exempts public paths `auth/login, forgot-password, reset-password, refresh`; SSE `/events` accepts a 5-min ticket via `?token=`.
- **Employees cannot use the portal, customers cannot use the ERP:** unified login returns 403 `ACCOUNT_BELONGS_TO_ADMIN` / `ACCOUNT_BELONGS_TO_CUSTOMER` for cross-portal attempts (`backend/routes/auth.cjs:70–87`). Sync gateway rejects portal tokens (`sync.cjs:102–111`).

### 3.3 Auth flows (documented end-to-end)

1. **Login (unified):** `CustomerLogin` → `useCustomerAuth().loginWithApi` (`CustomerAuthContext.tsx:133–153`) → `POST /api/auth/login {email, password, portal:'customer', two_factor_code?}` (`frontend/services/authApiClient.ts:49–72`; handler `backend/routes/auth.cjs:30–133`). Backend tries staff then portal account; issues portal session. 2FA-enabled + no code → `{requires_two_factor:true, pending_token}` (10-min in-memory map).
2. **Activation (admin-issued invite):** admin creates portal user (status `invited`) + 6-digit code (30-min, in `portal_password_resets`); customer `/portal/activate` → `POST /api/portal/auth/activate {customer_id, code, password}` → status `active`, auto-login. (`CustomerAuthContext.tsx:155–179`; `portalAuth.cjs:179–217`.)
3. **Password recovery:** `/portal/forgot-password` → `POST /api/portal/auth/forgot-password` (enumeration-safe; 6-digit code emailed, 30-min); `/portal/reset-password` → `POST /api/portal/auth/reset-password` → revokes all sessions.
4. **Session refresh:** proactive 25-min timer (`CustomerAuthContext.tsx:77–84`) + 401-triggered mutex refresh with token rotation (`portalApiClient.ts:52–103, 183–203`); refresh failure clears session and dispatches `portal-session-expired` → redirect to login.
5. **Sessions:** refresh tokens SHA-256-hashed in `portal_sessions` (30-day expiry, per-device, rotatable); login history in `portal_login_history`; UI management in `CustomerProfile` (`portalLifecycle.profile.listSessions`, `DELETE /auth/sessions/:id`).
6. **2FA (TOTP):** setup/enable/disable endpoints under `/api/portal/auth/two-factor/*` (`portalAuth.cjs:294–344`, `portalAuthService.cjs:429–490`); QR shown in `CustomerProfile.tsx:833–950`; login challenge in `CustomerLogin.tsx:36–49`.
7. **Portal account lifecycle is admin-driven** (no customer self-registration): `PortalUserManagement` + `adminLifecycle.users` (`create, auto-create, invite, reset-password, regenerate-password, status toggle`) — wired into ERP customer creation (`SalesContext.tsx:996–1036`, `stores/salesStore.ts:330–378`).

### 3.4 Admin portal auth (ERP side)

`/api/portal/admin/*` secured by `verifyAdminAuth` (`portalAdmin.cjs`): loopback header auth → Supabase JWT (from `nexus_user`) → SSE ticket. Client: `frontend/services/adminPortalClient.ts` (base `/portal/admin`, sends Supabase JWT + `x-user-*` headers). Admin SSE: `/portal/admin/events`.

---

## 4. EXISTING PORTAL API INVENTORY

All paths below are prefixed by `API_BASE_URL` (dev `/api`, prod `VITE_API_URL/api`). Rate limits: global portal `200/15min`, sensitive portal routes `30/hour`, portal auth `30/15min`, auth `10/15min`.

### 4.1 Authentication — `/api/portal/auth` (mounted `index.cjs:306`)

| Method | Path | Auth | Input | Output | Service / DB |
|---|---|---|---|---|---|
| POST | `/auth/login` | public | `{customer_id, full_name, two_factor_code?}` | 2FA challenge or full session | `portalAuthService.loginWithCustomerId` (legacy ID+name) |
| POST | `/auth/login-password` | public | `{email, password, two_factor_code?}` | 2FA challenge or full session | `authenticatePortalUser` (bcrypt; Supabase fallback) |
| POST | `/auth/refresh` | public | `{refresh_token}` | rotated `{access_token, refresh_token, expires_in:'30m'}` | `portal_sessions` (rotation, revoke old) |
| POST | `/auth/forgot-password` | public | `{email}` | enumeration-safe `{message}` + 6-digit code emailed | `portal_password_resets` + `emailService` |
| POST | `/auth/activate` | public | `{customer_id, code, password}` | full session (auto-login) | `activatePortalUser` (`invited`→`active`) |
| POST | `/auth/reset-password` | public | `{email, code, password}` | `{message}`, revokes all sessions | `portal_password_resets` |
| GET | `/auth/me` | portal JWT | — | portal user row | `portal_users` |
| POST | `/auth/logout` | portal JWT | `{refresh_token?}` | revoke session(s) | `portal_sessions` |
| GET | `/auth/sessions` | portal JWT | — | active sessions | `portal_sessions` |
| DELETE | `/auth/sessions/:id` | portal JWT | — | revoke one session (ownership-checked) | `portal_sessions` |
| GET | `/auth/two-factor/status` | portal JWT | — | `{enabled, confirmed}` | `portal_users` |
| POST | `/auth/two-factor/setup` | portal JWT | — | `{secret, otpauth_uri}` (persisted) | otplib |
| POST | `/auth/two-factor/enable` | portal JWT | `{code}` | `{message}`, revokes all sessions | TOTP verify |
| POST | `/auth/two-factor/disable` | portal JWT | `{code}` | `{message}`, revokes all sessions | TOTP verify |

**Shared auth:** `POST /api/auth/login` (unified staff+customer, `routes/auth.cjs:30–133`) — used by the portal login page; `POST /auth/register`, `/auth/request-verification`, `/auth/verify-code` are ERP/staff or general.

### 4.2 Customer portal — `/api/portal` (mounted `index.cjs:315`, `verifyPortalToken`)

**Dashboard**
| Method | Path | Input | Output | Service / DB |
|---|---|---|---|---|
| GET | `/dashboard` | — | balances, unpaid count, orders, requests, quotations, deliveries, recent docs/transactions, health score | `portalService.getDashboard` (parallel reads of customers, invoices, sales_orders, quotation_requests, quotations, portal_notifications, engagement_point_balances, wallet_transactions, shipments) |
| GET | `/events-ticket` | — | 5-min SSE ticket | `portalAuthService.generateEventTicket` |
| GET | `/events` | `?token=` | SSE stream (`notification`, `entity_changed`) | `portalLifecycleService.subscribePortal` |

**Catalog / products**
| Method | Path | Input | Output | Service / DB |
|---|---|---|---|---|
| GET | `/catalog` | — | products (excl. raw/material/stock types) + active variants | `portalService.getCatalog` (cloud `products`) |
| GET | `/promotions` | — | active portal promotions (badges/banners) | `portalLifecycleService.getActivePortalPromotions` |
| GET | `/ads` | — | active banner ads | `portalLifecycleService.getActivePortalAds` (`portal_ads`) |
| POST | `/orders/preview` | `{items[], promotionCode?}` | server-authoritative price/promotion preview | `promotionEngine.calculatePromotion` |

**Requests (quotation/order requests)**
| Method | Path | Input | Output | Service / DB |
|---|---|---|---|---|
| GET | `/requests` | `?page&pageSize&status&search` | paginated or full list | `portalService` / `portalLifecycleService`; `quotation_requests` |
| POST | `/requests` | `{requestType, items[], notes, requestedDeliveryDate, attachments(≤20), reorderOf, reorderOfNumber, promotionCode}` | 201 request (number `QR-`/`ODR-` year-scoped) + timeline + notifications | `portalLifecycleService.createQuotationRequest` |
| GET | `/requests/:id` | — | detail (customer-scoped) | `getRequestById` |
| POST | `/requests/:id/cancel` | — | soft-cancel + timeline + audit | `cancelRequest` |

**Quotations**
| Method | Path | Input | Output | Service / DB |
|---|---|---|---|---|
| GET | `/quotations` | `?page&pageSize&status&search` | paginated / merged list | `getQuotationsPaginated` / `getQuotations` (cloud `quotations`) |
| GET | `/quotations/:id` | — | detail (scoped) | `getQuotationById` |
| POST | `/quotations/:id/accept` | — | signature + timeline + admin notify | `acceptQuotation` (`document_signatures`) |
| POST | `/quotations/:id/reject` | `{reason?}` | signature + timeline | `rejectQuotation` |
| POST | `/quotations/:id/revision` | `{comments?}` | status→`revision_requested` + timeline | `requestRevision` |
| GET | `/quotations/:id/versions` | — | version history | `listDocumentVersions` |
| GET | `/quotations/:id/versions/:version` | — | version snapshot | `getDocumentVersion` |
| GET | `/quotations/:id/signatures` | — | decision signatures | `getDocumentSignatures` |

**Orders**
| Method | Path | Input | Output | Service / DB |
|---|---|---|---|---|
| GET | `/orders` | `?page&pageSize&status&search&dateFrom&dateTo` | paginated / full list (incl. request-chain fallback) | `portalService`; `sales_orders` |
| GET | `/orders/:id` | — | detail (scoped, normalized items) | `getOrderById` |
| POST | `/orders/:id/reorder` | — | new order request (`ODR-` number) + timeline | `reorderFromOrder` |

**Invoices**
| Method | Path | Input | Output | Service / DB |
|---|---|---|---|---|
| GET | `/invoices` | `?page&pageSize&status&search&dateFrom&dateTo` | paginated (cloud-first `supabaseStore.listInvoices` w/ fallback) | `getInvoicesPaginated` |
| GET | `/invoices/:id` | — | detail + line items (cloud-first) | `getInvoiceById` |
| POST | `/invoices/:id/revert` | — | **always 403 (disabled)** — ERP accounting rule | — |

**Payments**
| Method | Path | Input | Output | Service / DB |
|---|---|---|---|---|
| GET | `/payments` | `?page&pageSize&search&dateFrom&dateTo` | paginated / list | `getPaymentsPaginated`; `customer_payments` |
| GET | `/payments/:id` | — | detail + allocations (customer-scoped only) | `getPaymentById` |
| POST | `/payments/intent` | `{invoiceId, amount, currency='USD'}` | Stripe PaymentIntent or `pi_mock_*` secret `{clientSecret, mode}` | Stripe SDK (if `STRIPE_SECRET_KEY`) |
| POST | `/payments` | `{invoiceId, amount, currency, paymentMethod='Card', reference, transactionId}` | records payment + allocation + invoice status recompute + `payment_made` event | `repo.upsert` + `portalLifecycleService.publishErpEvent` |

**Statements / ledger**
| Method | Path | Input | Output | Service / DB |
|---|---|---|---|---|
| GET | `/statements` | `?startDate&endDate` | `{opening_balance, closing_balance, outstanding_balance, credit_limit, transactions[]}` | `getStatements` (invoices=debits, credit notes & payments=credits, running balance) |

**Deliveries / shipments**
| Method | Path | Input | Output | Service / DB |
|---|---|---|---|---|
| GET | `/deliveries/today` | — | today's in-flight deliveries + items + invoice link | `getTodayPendingDeliveries` (`shipments`, `delivery_notes`, `invoices`) |
| GET | `/deliveries/banner` | — | delivery status banners (carousel) | `getDeliveryBanners` |
| GET | `/deliveries/:id/note` | — | delivery note (strictly scoped) | `getDeliveryNoteForDelivery` |
| GET | `/shipments` | `?status&search` | shipments (delivery_notes authoritative) | `getShipments` |
| GET | `/shipments/:id` | — | shipment detail | `getShipmentById` |

**Wallet / loyalty**
| Method | Path | Input | Output | Service / DB |
|---|---|---|---|---|
| GET | `/wallet` | — | `{walletBalance, transactions[]}` | `getWallet` (`customers.walletBalance`, `wallet_transactions`) |
| GET | `/loyalty` | — | `{points, cashback, tier, pointsHistory}` | `getLoyalty` (`engagement_point_balances`, `engagement_cashback`, `engagement_points`, `engagement_customer_tiers`) |

**Referrals**
| Method | Path | Input | Output | Service / DB |
|---|---|---|---|---|
| GET | `/referrals` | `?page&pageSize&status&search&sort` | paginated referrals (by `referred_by_id`) | `getReferrals`; `customer_referrals` |
| GET | `/referrals/rewards` | `?page&pageSize&status` | paginated rewards | `getReferralRewards`; `referral_rewards` |
| GET | `/referrals/settings` | — | mapped settings | `referralService.getSettings` |
| GET | `/referrals/stats` | — | funnel stats | `getReferralFunnelStats` |
| GET | `/referrals/:id` | — | detail (ownership gate) | `getReferralById` |
| GET | `/referrals/:id/timeline` | — | timeline (ownership gate) | `getReferralTimeline` |
| POST | `/referrals` | `{referredCustomerId, notes}` | create referral (self-refer/duplicate/customer-not-found guarded) | `referralService.register` |
| GET | `/referrals/customers/search` | `?q` (≥2 chars) | customer search (≤20, excludes self) | `searchCustomersForReferral` |

**Notifications**
| Method | Path | Input | Output | Service / DB |
|---|---|---|---|---|
| GET | `/notifications` | — | notifications for portal user | `getNotifications`; `portal_notifications` |
| PUT | `/notifications/:id/read` | — | mark read (ownership-checked) | `markNotificationRead` |
| PUT | `/notifications/read-all` | — | mark all read | `markAllNotificationsRead` |
| GET | `/notifications/unread-count` | — | `{count}` | `getUnreadNotificationCount` |

**Support (tickets)**
| Method | Path | Input | Output | Service / DB |
|---|---|---|---|---|
| GET | `/support/tickets` | — | tickets for user + customer | `getSupportTickets`; `portal_tickets` |
| POST | `/support/tickets` | `{subject, message, priority?}` | 201 ticket + first message | `createSupportTicket` |
| POST | `/support/tickets/:id/messages` | `{message}` | append message (ownership gate) | `addTicketMessage` |
| PUT | `/support/tickets/:id/status` | `{status}` | update status (ownership gate) | `updateTicketStatus` |
| POST | `/support/tickets/:id/attachments` | multipart `file` | upload ≤10MB (allowlist) to disk + row | multer + `ticket_attachments` |
| GET | `/support/tickets/:id/attachments/:attachmentId` | — | stream file (scoped) | `getTicketAttachment` |
| DELETE | `/support/tickets/:id/attachments/:attachmentId` | — | unlink + soft-delete | `deleteTicketAttachment` |

**Profile / account**
| Method | Path | Input | Output | Service / DB |
|---|---|---|---|---|
| GET | `/profile` | — | profile + balances + credit limit + status | `getProfile` |
| PUT | `/profile` | `{full_name, phone, email, address, city, state, zip, country}` | update `portal_users` | `portalAuthService.updatePortalUser` |
| PUT | `/profile/password` | `{currentPassword, newPassword}` | change password | `portalAuthService.changePassword` |

**Documents / PDFs**
| Method | Path | Input | Output | Service / DB |
|---|---|---|---|---|
| GET | `/documents` | — | documents list (invoices → receipt/invoice, deep links) | `getDocuments` |
| GET | `/document-chain` | `?docType&docId` | request→quotation→order chain | `getDocumentChain` |
| POST | `/downloads` | `{docType, docId}` | audit-gated download record | `recordDownload` (`portal_downloads`, timeline `DOCUMENT_DOWNLOADED`) |
| GET | `/timeline` | `?docType&docId` | merged chronological timeline | `getTimeline` |
| GET | `/comments` | `?docType&docId` | customer-visible comments | `getComments({view:'customer'})` |
| POST | `/comments` | `{docType, docId, body}` | add customer comment | `addComment` (`document_comments`) |

*(PDFs themselves are generated client-side via `@react-pdf/renderer` + `views/shared/components/PDF/*` and the shared ERP PDF pipeline — no portal PDF endpoint.)*

### 4.3 Portal admin — `/api/portal/admin` (mounted `index.cjs:309`; `verifyAdminAuth`)

| Method | Path | Input | Output / Purpose |
|---|---|---|---|
| GET | `/events-ticket` / GET `/events` | — | admin SSE (`notification`, `system_alert`, `entity_changed`) |
| POST | `/company/delete` | — | **destructive**: wipes ALL Supabase tables + deletes caller's Auth user |
| POST | `/company/reset` | — | soft-deletes 17 local portal tables |
| GET | `/requests` / `GET /requests/:id` | `?status` | request list/detail |
| PUT | `/requests/:id` | `{items, notes}` | update request |
| POST | `/requests/:id/reject` / `clarify` / `open` / `assign` / `mark` / `DELETE` | reason/note/assignTo | reject/clarify/open/assign/toggle-mark/soft-delete |
| POST | `/requests/:id/generate-quotation` | — | prefill payload (no doc created) |
| POST | `/requests/:id/complete-quotation` | `{quotationNumber, erpQuotationId, quotationSnapshot}` | link official quotation |
| POST | `/requests/:id/generate-order` | — | prefill payload |
| POST | `/requests/:id/complete-order` | `{erpOrderId, orderSnapshot}` | create `sales_orders` row (SO-YYYY-######) |
| GET | `/orders` | — | all orders + customer names |
| GET | `/quotations` / `GET /quotations/:id` | `?status` | quotations |
| POST | `/quotations/:id/regenerate` | items/discount/tax/deliveryFee/paymentTerms/validUntil | new version after revision |
| POST | `/quotations/:id/convert-to-order` | `{deliveryDate, notes}` | accepted quotation → sales order |
| GET | `/quotations/:id/versions(/:version)`, `/signatures` | — | versions/signatures |
| POST | `/orders/:id/status` | `{status, note}` | workflow-enforced status transition |
| GET/POST | `/comments` | `{docType, docId, body, visibility}` | admin comments (incl. internal) |
| GET | `/notifications`, `/notifications/unread-count`, `PUT /notifications/:id/read`, `/read-all` | — | admin notifications |
| GET | `/activity` | `?limit` | activity feed |
| GET | `/analytics` | — | pipeline analytics |
| GET | `/users` | — | portal_users joined with customers |
| POST | `/users` | `{customer_id, email, password, full_name, phone}` | create portal user (409 dup email) |
| PUT | `/users/:id` | `{status, full_name, phone, email}` | update + status |
| DELETE | `/users/:id` | — | disable + revoke sessions |
| POST | `/users/:id/reset-password` | `{new_password}` | force reset |
| POST | `/users/auto-create` | `{customer_id, name, email, phone, full_name, invite}` | upsert customer + portal user (+invite code) |
| POST | `/users/:id/regenerate-password` | customer fields | recover missing portal_users row |
| POST | `/users/:id/invite` | — | re-invite (new 6-digit code) |
| GET | `/staff` | — | active staff for assignment |

### 4.4 Related ERP routes the portal touches indirectly

- `POST /api/sync/ops` (sync gateway, `routes/sync.cjs`) — ERP write path; **rejects portal tokens**.
- `GET /api/payments/...`, `/api/customers/...` allocation endpoints — ERP-only (staff).
- `routes/referralRoutes.cjs` (`/api/referrals`, staff-side referral management), `routes/notifications.cjs`, `routes/promotions.cjs` — shared ERP+portal services, staff auth.
- `routes/erpPortalMirror.cjs` — **dead file (0 lines, unreferenced).**

---

## 5. EXISTING PORTAL DATABASE INVENTORY

### 5.1 Supabase baseline (0001, applied live) — 159 tables

- **Row contract:** `id TEXT PK, data JSONB, created_at, updated_at, version` — domain fields inside `data` (ERP writes `customerId`; backend portal writes `customer_id`).
- **No foreign keys anywhere** — integrity by application convention (`portalScope.cjs`).
- **RLS enabled on all tables but effectively open**: ~151 `allow_all_*` policies (`FOR ALL TO authenticated USING(true)`). Real isolation only on: `profiles` (self/staff), `portal_ads` (company), portal tickets/notifications (customer subquery), `payment_allocations`(+lines) (staff-exists), `engagement_promotions`/`promotion_redemptions` (company).
- **Realtime:** all business tables published to `supabase_realtime`.

### 5.2 Portal-relevant tables

| Table | PK / shape | Customer link | RLS | ERP core? | Portal role |
|---|---|---|---|---|---|
| `customers` | envelope | master; referenced via `data->>customerId` | allow_all | ✔ | read-only (source of truth) |
| `portal_users` | `id PK, customer_id, email UNIQUE, password_hash, full_name, phone, status, two_factor_*` | **`customer_id = customers.id`** | "manage portal_users" allow_all | ✖ | **Portal-specific** (auth master) |
| `portal_sessions` | `id PK, portal_user_id, refresh_token_hash, ip, ua, expires_at, revoked_at` | via portal_user | allow_all | ✖ | Portal-specific |
| `portal_password_resets` | `id PK, portal_user_id, code, expires_at, used_at` | via portal_user | allow_all | ✖ | Portal-specific |
| `portal_login_history` | `id PK, portal_user_id, login_at, ip, ua` | via portal_user | allow_all | ✖ | Portal-specific |
| `portal_notifications` | `id PK, portal_user_id, type, title, body, link, is_read` | via portal_user | `portal_notifications_customer_isolation` (same-customer users) | ✖ | Portal-specific |
| `portal_tickets` | `id PK, portal_user_id, customer_id, subject, message, priority, status` | `customer_id` typed column | `portal_tickets_customer_isolation` | ✖ | Portal-specific |
| `portal_ticket_messages` | `id PK, ticket_id, sender_type, message` | via ticket | customer_isolation | ✖ | Portal-specific |
| `ticket_attachments` | `id PK, ticket_id, message_id, filename, storage_path` | via ticket | customer_isolation | ✖ | Portal-specific |
| `portal_ads` | `id PK, data, version, updated_at, company_id` | — (company-scoped) | **company-scoped CRUD** (`get_current_company_id()`) | ✖ (AdsManager) | Portal-specific (banner ads) |
| `quotation_requests` | envelope (0005) | `data->>customer_id` | allow_all (0005) | ✖ | **Portal-specific, backend-authoritative** |
| `invoices` | envelope | `data->>customerId` | allow_all | ✔ | read-only |
| `customer_payments` | envelope | `data->>customerId` | allow_all | ✔ | read + portal-payment writes |
| `payment_allocations` / `payment_allocation_lines` | envelope + `company_id` | `data->>payment_id` / invoice | staff-EXISTS | ✔ | read-only (via payments detail) |
| `sales_orders` | envelope | `customerId` + `customer_id` (OR) | allow_all | ✔ | read + admin-completion writes |
| `quotations` | envelope | dual key | allow_all | ✔ | read + admin writes |
| `orders` / `sales` / `sale_items` | envelope | `customerId` | allow_all | ✔ | read (ERP POS/sales) |
| `products` / `product_variants` | envelope | — | allow_all | ✔ | read-only (catalog) |
| `delivery_notes` / `shipments` | envelope | `customerId` | allow_all | ✔ | read-only |
| `ledger_entries` | envelope | `customerId` | allow_all | ✔ | read-only (statements source) |
| `wallet_transactions` | envelope | `customerId` | allow_all | ✔ | read (wallet) |
| `engagement_point_balances`, `engagement_points`, `engagement_cashback`, `engagement_customer_tiers`, `engagement_promotions`, `promotion_redemptions` | mixed | typed/company | company (promotions) | ✔ | read (loyalty/promotions) |
| `profiles` | `id PK, user_id UNIQUE, role` | staff identity | self/staff (+RESTRICTIVE) | ✔ | staff-only; portal users have none |

### 5.3 Tables that DO NOT exist (nearest equivalents)

| Requested name | Reality |
|---|---|
| `invoice_items`, `order_items`, `quotation_items` | line items inside `data`; backend SQLite `sale_items`, `purchase_order_items` |
| `payments` | `customer_payments` |
| `payment_intents`, `payment_methods`, `stripe_*` | **none** (Stripe only via backend SDK + `POST /payments/intent`) |
| `deliveries` | `delivery_notes`, `shipments` |
| `statements`, `account_ledger` | `ledger_entries`, `bank_statements` |
| `referral_codes`, `referral_payouts` | `customer_referrals.data.referral_code`; rewards = `referral_rewards.status` |
| `wallets` | `customers.data.walletBalance` + `wallet_transactions` |
| `notifications` | `portal_notifications` (portal); `customer_notification_logs`, `notification_audit_logs` (ERP) |
| `price_lists` | `customerpricingtiers`, `tax_rates`, `discountrules`, `profit_margin_settings` |

### 5.4 Pending migrations (not yet applied to live — per AGENTS.md)

| Migration | Adds | Status |
|---|---|---|
| `0003_referral_tables.sql` | `customer_referrals`, `referral_rewards` (envelope + `company_id`) | PENDING |
| `0004_referral_rls_policies.sql` | RLS + allow_all policies on the two referral tables | PENDING |
| `0005_portal_quotation_requests.sql` | `quotation_requests` (indexes, trigger, RLS, realtime) | PENDING — **required for `/portal/dashboard`** |

### 5.5 Backend SQLite mirror (local-first) — portal tables

`backend/db.cjs` creates columnar equivalents plus **SQLite-only** portal lifecycle tables:
`quotation_requests` (9-state status flow), `portal_timeline_events`, `portal_downloads`, `document_versions`, `document_signatures`, `document_comments`, `admin_notifications`, `notifications`, `email_verifications`; referral module tables `referral_timeline`, `referral_audit_logs`, `referral_campaigns`, `referral_analytics`, `referral_reversals`, `referral_settings` (+ columnar `customer_referrals`, `referral_rewards`). `customers.walletBalance REAL` drives the wallet feature.

### 5.6 Supabase Edge Functions (referral analytics/expiry)

- `referral-expiry` and `referral-analytics` (Cron) call RPCs (`expire_referrals()`, `generate_referral_analytics()`).
- ⚠ **Drift:** the documented RPC SQL is not in the repo and the RPCs reference `referral_timeline`, `referral_analytics`, `company_config` — **none exist in the Supabase baseline**. Expected to fail unless created out-of-band. Not a blocker for Sasa, but referral expiry/analytics depend on it.

---

## 6. EXISTING ERP BUSINESS SERVICES (the logic Sasa must reuse, not duplicate)

| Domain | Service(s) | Key capabilities | Portal relevance |
|---|---|---|---|
| Customers | ERP stores (`customers` in `frontend/services/db.ts`), `portalAuthService` (portal-user provisioning), `SalesContext`/`salesStore` (`addCustomer` w/ invite) | customer CRUD, portal account auto-create | Source of truth; Sasa must read ERP customers |
| Products / pricing | `pricingEngine.cjs`, `pricingService.ts`, `masterInventoryPricingService.ts`, `customerPricingService.ts`, `taxRateService.ts` | margin resolution, discounts, tax | Sasa catalog/preview must call these server-side |
| Inventory | `inventoryStore.ts`, `inventorySyncService.ts`, `inventoryTransactionService.ts`, `fifoCostService.ts`, `offlineProfitMargins.ts` | stock, FIFO costing, transactions | Only catalog availability matters to portal |
| Quotations | `workflowEngine.cjs` (versions, chain), `portalLifecycleService` (accept/reject/revision) | state machine, versions, signatures | Reuse |
| Quotation requests | `portalLifecycleService.createQuotationRequest`, `workflowEngine.nextYearScopedNumber` | QR-/ODR- numbering, timeline | Portal-native; Sasa must use same service |
| Orders | `workflowEngine.assertSalesOrderTransition`, `portalLifecycleService.completeSalesOrder` | SO state machine, completion | Reuse |
| Invoices | `supabaseStore` (cloud reads), `portalService.getInvoicesPaginated`, ERP `invoices` store | invoice lifecycle | Reuse read path |
| Payments | `paymentAllocationService.cjs` (allocate/suggest/reverse), `portalService` payments, `customer_payments` | allocation engine | Reuse; portal payment write path must post through it |
| Deliveries | `portalService.getShipments/getDeliveryNoteForDelivery` | delivery notes/shipments | Reuse read path |
| Statements | `portalService.getStatements` | running balance from ledger+payments | Reuse |
| Referrals | `referralService.cjs` (register/rewards/campaigns/reversals/analytics), `referralNotificationService.cjs`, `referralRuleEngine.ts`, frontend `referral*Service.ts` | full referral module | Reuse — Sasa referral UI must call backend |
| Wallet | `customers.walletBalance` + `wallet_transactions` (portalService `getWallet`) | balance + tx history | Reuse |
| Loyalty | engagement services (`engagementEngine.ts`, `engagement*Service.ts`) + `engagement_point_balances` etc. | points, cashback, tiers | Reuse |
| Promotions | `promotionService.cjs` + `promotionEngine.cjs` | discounts/codes, server-authoritative calc | **Critical** — Sasa's cart math must use `calculatePromotion` |
| Notifications | `portalLifecycleService.publishErpEvent`, `notificationDispatchService.cjs`, `emailService.cjs` | SSE + portal_notifications + email | Reuse |
| Support | `portalLifecycleService` ticket endpoints | tickets + attachments | Reuse |
| Auth | `authService.cjs`, `portalAuthService.cjs`, `emailVerificationService.cjs` | staff + portal auth | Reuse portal auth |
| Document numbering | `workflowEngine.nextYearScopedNumber` | QR-/ODR-/SO- year-scoped numbers | Reuse |
| Sync/cloud | `cloudSyncStore.cjs` (optimistic versioning, idempotency), `supabaseRepository.cjs`, `supabaseQuery.cjs`, `supabaseStore.cjs`, `idempotency.cjs` | all cloud persistence | Backend-only; Sasa talks to backend |

---

## 7. EXISTING PORTAL FEATURE INVENTORY

Legend: **API** = portal endpoints used (§4); **BS** = business service (§6); **AUTH** = public / customer / admin.

| FEATURE | CURRENT ERP IMPLEMENTATION | ROUTE | API | DATABASE | AUTH | BUSINESS SERVICE | SASA EQUIVALENT | MIGRATION STATUS |
|---|---|---|---|---|---|---|---|---|
| Customer login (email+password) | `CustomerLogin` + `CustomerAuthContext.loginWithApi` | `/portal/login` | `POST /api/auth/login` | `portal_users` | Public | `authService`, `portalAuthService` | `AuthPage` (FAKE) | GAP |
| Activation (invite code) | `CustomerActivate` | `/portal/activate` | `POST /portal/auth/activate` | `portal_users`, `portal_password_resets` | Public | `portalAuthService` | none | MISSING |
| Forgot/reset password | `CustomerForgotPassword`/`CustomerResetPassword` | `/portal/forgot-password`, `/portal/reset-password` | `POST /portal/auth/forgot-password`, `/reset-password` | `portal_password_resets` | Public | `portalAuthService`, `emailService` | canned "Reset Link Dispatched" (FAKE) | GAP |
| 2FA (TOTP) | `CustomerLogin` step + `CustomerProfile` 2FA panel | login + `/portal/profile` | `/portal/auth/two-factor/*` | `portal_users` | Public/Customer | `portalAuthService` (otplib) | none | MISSING |
| Session management | `CustomerProfile` sessions list | `/portal/profile` | `GET /auth/sessions`, `DELETE /auth/sessions/:id` | `portal_sessions` | Customer | `portalAuthService` | none | MISSING |
| Customer dashboard (KPIs, health score, carousel) | `CustomerDashboard` | `/portal/dashboard` | `GET /dashboard`, `/invoices`, `/notifications/unread-count`, `/loyalty`, `/ads`, `/promotions`, `/deliveries/banner` | multi-table read | Customer | `portalService.getDashboard`, `computeHealthScore` | `DashboardTab` (MOCK) | GAP |
| Catalog browsing + cart + checkout | `CustomerOrders` (+`CartContext`) | `/portal/orders` | `GET /catalog`, `/promotions`, `POST /orders/preview` | `products`, `product_variants` | Customer | `portalService.getCatalog`, `promotionEngine.calculatePromotion` | `OrdersTab`+`CartDrawer` (MOCK, cart lost on refresh) | GAP |
| Order request creation | `CustomerCreateRequest`, `CustomerRequests` | `/portal/new-request`, `/portal/requests` | `POST /requests`, `GET /requests`, cancel | `quotation_requests` | Customer | `portalLifecycleService.createQuotationRequest` | `QuoteRequestModal` (simulated) | GAP |
| Order history + detail + reorder | `CustomerOrders`, `CustomerOrderDetail` | `/portal/orders`, `/portal/orders/:id` | `GET /orders(/:id)`, `POST /orders/:id/reorder` | `sales_orders` | Customer | `portalService`, `reorderFromOrder` | `OrdersTab` history (MOCK) | GAP |
| Quotation list + detail + accept/reject/revision | `CustomerQuotations`, `CustomerQuotationDetail` | `/portal/quotations(/:id)` | `GET /quotations(/:id)`, accept/reject/revision, versions, signatures | `quotations`, `document_signatures`, `document_versions` | Customer | `portalLifecycleService`, `workflowEngine` | `QuotesTab` (accept = local status flip only) | GAP |
| Invoice list + detail + pay | `CustomerInvoices`, `CustomerInvoiceDetail`, `StripePaymentForm` | `/portal/invoices(/:id)` | `GET /invoices(/:id)`, `POST /payments/intent`, `POST /payments` | `invoices`, `customer_payments` | Customer | `supabaseStore`, `paymentAllocationService`, Stripe | `InvoicesTab`+`PaymentModal` (FAKE timeout+confetti) | GAP |
| Payment receipts + barcodes + PDF | `CustomerPayments`, `CustomerPaymentDetail` | `/portal/payments(/:id)` | `GET /payments(/:id)` | `customer_payments` | Customer | `portalService` | none (fake receipt string) | MISSING |
| Payment options (static bank/MOMO instructions) | `CustomerPaymentOptions` | `/portal/payment-options` | none (hardcoded) | — | Customer | none | `PaymentModal` hardcoded bank/MOMO | PARTIAL |
| Delivery tracking + banners + delivery note | `CustomerDeliveries` (+modals) | `/portal/deliveries` | `GET /shipments(/:id)`, `/deliveries/banner`, `/deliveries/:id/note`, `/deliveries/today` | `delivery_notes`, `shipments` | Customer | `portalService` | `DeliveriesTab`+`DeliveryTrackingModal` (static "telemetry") | GAP |
| Account statements + period filters + PDF | `CustomerAccountStatements` | `/portal/account-statements` | `GET /statements` | `ledger_entries`, `invoices`, `customer_payments` | Customer | `portalService.getStatements` | `StatementsTab` (Aug-2026 hardcoded) | GAP |
| Wallet balance + transactions | `CustomerWallet` | `/portal/wallet` | `GET /wallet` | `customers.walletBalance`, `wallet_transactions` | Customer | `portalService.getWallet` | none | MISSING |
| Loyalty points/cashback/tier | `CustomerLoyalty` | `/portal/loyalty` | `GET /loyalty` | `engagement_*` | Customer | engagement services | none | MISSING |
| Referral program (create/stats/rewards/timeline) | `CustomerReferrals` | `/portal/referrals` | `GET/POST /referrals*` | `customer_referrals`, `referral_rewards` | Customer | `referralService` | `ReferralsTab` (fake email, local rewards) | GAP |
| Notifications (list/read/SSE) | `CustomerNotifications`, `MobileBottomNav` | `/portal/notifications` | `GET /notifications`, read/read-all, `/events` SSE | `portal_notifications` | Customer | `portalLifecycleService.publishErpEvent` | `NotificationDrawer` (MOCK) | GAP |
| Profile edit + password + 2FA + sessions | `CustomerProfile` | `/portal/profile` | `GET/PUT /profile`, `PUT /profile/password`, auth endpoints | `portal_users` | Customer | `portalAuthService` | `AccountTab` (read-only) | GAP |
| Documents library + PDFs | `CustomerDocuments` | `/portal/documents` | `GET /documents` | `invoices` | Customer | `portalService.getDocuments` | none (fake .txt) | MISSING |
| Document chain / timeline / comments | `DocumentChain`, `DocumentDiscussion`, `VersionHistoryModal` (components) | within detail pages | `GET /document-chain`, `/timeline`, `/comments`, `POST /comments` | `document_*`, `portal_timeline_events` | Customer | `portalLifecycleService` | none | MISSING |
| PDF generation (PrimeDocument) | `@react-pdf/renderer` + `views/shared/components/PDF/*` | detail pages | client-side | — | Customer | shared ERP PDF pipeline | fake `.txt` download / print window | GAP |
| Support tickets + attachments | `CustomerSupport` + ticket endpoints | `/portal/support` | `GET/POST /support/tickets*` | `portal_tickets*` | Customer | `portalLifecycleService` | none (static contact card) | MISSING |
| Ads/promotions banners | `AdsManager` (ERP) → `/portal/ads` + `/promotions` | dashboard/orders | `GET /ads`, `GET /promotions` | `portal_ads`, `engagement_promotions` | Customer | `portalLifecycleService` | hardcoded banners | GAP |
| Command palette (⌘K) | `CommandPalette` | portal-wide | static commands | — | Customer | none | `CommandPaletteModal` (local) | MATCH (cosmetic) |
| Portal user management (admin) | `PortalUserManagement` + ERP-side provisioning | `/portal/users` | `GET/POST /users*`, `auto-create`, invite | `portal_users`, `customers` | Admin | `portalAuthService`, `SalesContext`/`salesStore` | none (no admin UI in Sasa) | MISSING |
| Quotation-request admin workflow | ERP `sales/QuotationRequests.tsx`, `Orders.tsx`, `SalesOrders.tsx` | ERP routes | `/portal/admin/*` | `quotation_requests`, `quotations`, `sales_orders` | Admin | `portalLifecycleService` | none | MISSING |
| Company reset/delete (admin) | `Settings.tsx` → `adminLifecycle.company` | ERP | `POST /portal/admin/company/reset|delete` | all tables | Admin | inline | none | MISSING |

---

## 8. LOCAL-FIRST / SYNC ARCHITECTURE

### 8.1 ERP data path (NOT portal)

```
React stores (zustand) → IndexedDB (offlineDb.ts/idb, db.ts) → durableSyncQueue (IndexedDB queue)
  → backgroundSyncService → POST /api/sync/ops (ops[] ≤ 100, allow-list ~100 tables, idempotent operationIds)
  → cloudSyncStore.applyOp (optimistic versioning, version-conflict detection, tombstones)
  → Supabase (PostgREST, service-role)
Real-time back: Supabase realtime + polling → syncService pulls cloud → IndexedDB
```
- **Offline-first:** writes succeed locally immediately; sync retries via durable queue; tombstones for deletes; conflict = `{conflict:true, conflictType:'version_conflict', serverVersion, server}`.
- **ERP auth:** staff Supabase JWT (or local mode); portal tokens rejected by the gateway.

### 8.2 Portal data path (backend-mediated)

```
Portal UI (views/portal) → portalApiClient (Bearer portal JWT, 15s timeout, 401→refresh+retry once)
  → Express /api/portal/* → portalService / portalLifecycleService / portalAuthService
    → (a) local SQLite (db.cjs) for lifecycle tables   AND/OR
    → (b) supabaseRepository (service-role) for ERP tables + portal tables
Real-time: POST /events-ticket → EventSource GET /portal/events?token= (SSE)
           (portalLifecycleService.publishErpEvent: timeline + portal_notifications + SSE broadcast)
Cache: portalCache.ts (localStorage buckets `primeportal:cache:v1:<customer_id>`, LRU 30, GET fallback on 5xx/network error)
```

### 8.3 Classification per the question

| Question | Answer |
|---|---|
| Goes directly to Supabase? | **No** — the customer UI never talks to Supabase. (ERP staff UI does via `supabaseClient.ts`.) |
| Goes through backend APIs? | **Yes** — all portal reads/writes via `/api/portal*`. |
| Repositories/services? | Yes — backend `portalService`/`portalLifecycleService`/`portalAuthService`/`referralService` over `supabaseRepository`/`supabaseQuery`/`supabaseStore` + SQLite. |
| IndexedDB? | ERP data: yes (`offlineDb.ts`, `db.ts`, `durableSyncQueue.ts`). **Portal data: no** — only `portalCache.ts` (localStorage) for GET-fallback snapshots. |
| Sync queues? | ERP writes: `durableSyncQueue` + `/api/sync/ops`. **Portal writes: no queue** — synchronous backend calls. |
| Realtime/SSE? | Portal: **SSE** (`/portal/events`, 5-min tickets). ERP staff: Supabase realtime + `subscribeAdminEvents` (`/portal/admin/events`). |

**Migration implication:** Sasa inherits the portal's backend-mediated model. Sasa must NOT be wired to the ERP frontend's IndexedDB/sync stores — it must call `/api/portal/*` (or future Sasa-adapted equivalents).

---

## 9. SASA COMPARISON (repo: `%TEMP%\opencode\Sasa`)

### 9.1 Sasa overview

- **What it is:** a standalone **front-end UI prototype** ("Prime PORTAL") — single-commit repo, one feature module `src/features/customer-portal/` (~35 files), React 19 + Vite 6 + Tailwind v4, Bun lockfile.
- **Routing:** no router — `TabType` union switched by `useState` in `CustomerPortalApp.tsx`. Tabs: dashboard, invoices, deliveries, orders, quotes, statements, referrals, account.
- **No backend, no database, no auth, no persistence.** The only API file (`services/portalApiAdapter.ts`) is **dead code — imported by nothing**. No `fetch`/axios/Supabase calls anywhere in the UI. All state is in-memory and lost on refresh.
- **No tests, no CI/CD, no Dockerfile.** `npm run lint` is broken by a stray leftover file (`temp_repo/e2e/setup-helper.ts` importing missing `./fixtures`). `metadata.json` declares it an AI-Studio applet (Gemini API capability, unused).
- **Auth:** boots **already logged-in** (`CustomerPortalApp.tsx:68` `useState(true)`); login screen checks only non-empty fields; demo-login buttons use hardcoded profiles; no token/session.
- **Known internal inconsistencies:** USD prices formatted as `K` (Kwacha), Chicago address with Malawi bank/MOMO details, three different company brands across print views, catalog prices differing from dashboard banner prices, bookmarks pointing at non-existent SKUs.

### 9.2 Sasa production-readiness classification (per feature)

| Feature | Classification | Evidence |
|---|---|---|
| Auth (login/register/forgot) | **FAKE** (UI-only) | `AuthPage.tsx:39–72`; boots logged-in `CustomerPortalApp.tsx:68` |
| Profile / identity | **MOCK** (hardcoded) | `mockData.ts:3–23` ("Marcus Vance", CUST-98231, `companyName: 'Customer ID'`) |
| Dashboard | **MOCK** | hardcoded banners/KPIs/prices; fallbacks `|| 1240`, `|| 4320` |
| Invoices | **MOCK** | 4 seeded invoices; "PDF" is a `.txt` blob (`InvoicesTab.tsx:84–94`) |
| Payments | **FAKE** | `setTimeout` + confetti + fake receipt `ERP-MSG-*`; nothing recorded; only a "payment prompt" note |
| Deliveries | **MOCK** | static string "Live GPS Telemetry Active" (`DeliveryTrackingModal.tsx:166`) |
| Orders/catalog | **MOCK** | 8 seeded products; cart is React state (lost on refresh); checkout `setTimeout`; address hardcoded |
| Quotes/RFQ | **MOCK** | attachment simulated (`QuoteRequestModal.tsx:195–211`); accept = local status flip only |
| Statements | **MOCK** | dates hardcoded to Aug 2026; mixed branding in print views |
| Referrals | **MOCK** | "Invitation email sent successfully!" with no email; rewards applied locally |
| Notifications | **MOCK** | local array; badge fallback `|| 3` |
| Backend adapter | **DEAD CODE** | `portalApiAdapter.ts` imported by nothing; only re-exported in barrel `index.ts:35` |
| Persistence | **NONE** | no localStorage (except never-read token key), no DB |
| Tests / CI | **NONE / BROKEN** | no test script; lint broken |

### 9.3 What Sasa does well (preserve)

- Polished, mobile-first UI/UX: sidebar, bottom navigation, dark auth screen, command palette (⌘K), notification drawer, confetti, responsive Tailwind design.
- Tab architecture that cleanly maps to the ERP portal's page set.

### 9.4 Sasa's documented (but unimplemented) integration contract

`portalApiAdapter.ts` + `MERGE_GUIDE.md` describe the intended wiring: `VITE_USE_REAL_BACKEND === 'true'` → `GET /api/portal/{profile,invoices,shipments,orders,requests,statements,catalog,ads,referrals}` and `POST /api/portal/{payments,orders,requests}` with a Bearer token from localStorage. These paths match the ERP backend's existing `/api/portal/*` surface — a strong starting point, but **nothing in Sasa implements it**.

---

## 10. FEATURE GAP MATRIX (ERP PORTAL → SASA)

| EXISTING ERP PORTAL FEATURE | SASA FEATURE | MATCH | PARTIAL | MISSING | ERP API REQUIRED | ERP SERVICE REQUIRED | DATABASE REQUIREMENT |
|---|---|---|---|---|---|---|---|
| Customer login (email+password) | `AuthPage` sign-in | | ✔ (fake) | | `POST /api/auth/login` (portal:'customer') | `authService`, `portalAuthService` | `portal_users` |
| 2FA (TOTP) | — | | | ✔ | `two-factor/*` endpoints | `portalAuthService` (otplib) | `portal_users` |
| Account activation (invite) | — | | | ✔ | `POST /portal/auth/activate` | `portalAuthService` | `portal_password_resets` |
| Forgot/reset password | `AuthPage` canned message | | ✔ (fake) | | forgot/reset endpoints | `portalAuthService`, `emailService` | `portal_password_resets` |
| Session list/revoke | — | | | ✔ | `GET/DELETE /auth/sessions*` | `portalAuthService` | `portal_sessions` |
| Profile view/edit | `AccountTab` (read-only) | | ✔ | | `GET/PUT /profile`, `/profile/password` | `portalAuthService` | `portal_users` |
| Dashboard KPIs + health | `DashboardTab` | | ✔ (mock) | | `GET /dashboard` | `portalService.getDashboard` | multi-table |
| Ads + promotions banners | hardcoded banner slides | | ✔ | | `GET /ads`, `/promotions` | `portalLifecycleService` | `portal_ads`, `engagement_promotions` |
| Catalog + cart + checkout | `OrdersTab`, `CartDrawer`, `ProductDetailModal` | | ✔ (mock) | | `GET /catalog`, `POST /orders/preview` | `promotionEngine.calculatePromotion`, `portalService.getCatalog` | `products` |
| Order request (RFQ/order) | `QuoteRequestModal` (simulated upload) | | ✔ | | `POST /requests` | `portalLifecycleService.createQuotationRequest` | `quotation_requests` |
| Order history/detail/reorder | `OrdersTab` history + 1-click reorder | | ✔ (mock) | | `GET /orders(/:id)`, `POST /orders/:id/reorder` | `portalService` | `sales_orders` |
| Quotations accept/reject/revision/versions/signatures | `QuotesTab` (accept only) | | ✔ | | `GET/POST /quotations*` | `portalLifecycleService`, `workflowEngine` | `quotations`, `document_*` |
| Invoice list/detail/pay | `InvoicesTab`, `PaymentModal`, `InvoiceDetailModal` | | ✔ (fake pay) | | `GET /invoices(/:id)`, `POST /payments/intent`, `/payments` | Stripe + `paymentAllocationService` | `invoices`, `customer_payments` |
| Payment receipts + PDF + barcode | — (fake `.txt`/print) | | ✔ | | `GET /payments(/:id)` | `portalService` | `customer_payments` |
| Payment options (bank/MOMO) | `PaymentModal` hardcoded accounts | | ✔ | | none | none (config data) | — |
| Delivery tracking/banners/note | `DeliveriesTab`, `DeliveryTrackingModal` | | ✔ (static) | | `GET /shipments(/:id)`, `/deliveries/*` | `portalService` | `delivery_notes`, `shipments` |
| Account statements + PDF | `StatementsTab` (+print) | | ✔ (mock) | | `GET /statements` | `portalService.getStatements` | `ledger_entries` etc. |
| Wallet | — | | | ✔ | `GET /wallet` | `portalService.getWallet` | `customers`, `wallet_transactions` |
| Loyalty (points/cashback/tier) | — | | | ✔ | `GET /loyalty` | engagement services | `engagement_*` |
| Referrals (create/stats/rewards/timeline) | `ReferralsTab` | | ✔ (fake email) | | `GET/POST /referrals*` | `referralService` | `customer_referrals`, `referral_rewards` |
| Notifications + SSE | `NotificationDrawer` | | ✔ (mock) | | `GET /notifications*`, `/events` | `publishErpEvent` | `portal_notifications` |
| Support tickets + attachments | — (static contact) | | | ✔ | `GET/POST /support/tickets*` | `portalLifecycleService` | `portal_tickets*` |
| Documents library + real PDFs | — (fake .txt) | | ✔ | | `GET /documents` | `portalService.getDocuments` | `invoices` |
| Document chain/timeline/comments | — | | | ✔ | `GET /document-chain`, `/timeline`, `/comments` | `portalLifecycleService` | `document_*` |
| Command palette ⌘K | `CommandPaletteModal` | ✔ | | | none | none | none |
| Admin: portal user management | — | | | ✔ | `/portal/admin/users*` | `portalAuthService` | `portal_users` |
| Admin: request→quotation→order workflow | — | | | ✔ | `/portal/admin/*` | `portalLifecycleService`, `workflowEngine` | `quotation_requests`, `quotations`, `sales_orders` |
| Admin: company reset/delete | — | | | ✔ | `/portal/admin/company/*` | inline | all tables |

**Summary:** 1 full match (cosmetic), 16 partial (all mock/fake in Sasa), 10 missing entirely. Sasa currently provides **no production functionality** — it is a visual prototype requiring full backend wiring for every feature.

---

## 11. DEPENDENCIES

### 11.1 Frontend packages used by the portal (shared or portal-only)

| Package | Used by | Portal-only? |
|---|---|---|
| `react-router`/`react-router-dom` 6.22.3 | all routing | shared (ERP too) |
| `@react-pdf/renderer` + `fontkit` | order/invoice/quotation/statement/delivery PDFs | shared with ERP (PrimeDocument) |
| `@stripe/stripe-js`, `@stripe/react-stripe-js` | `StripePaymentForm` | **portal-only** |
| `jsbarcode` | payment receipts | portal-only |
| `qrcode` | 2FA QR in profile | portal-only |
| `idb`/`dexie` | ERP IndexedDB (NOT portal) | shared (ERP) |
| `@supabase/supabase-js` | ERP staff auth (NOT portal) | shared (ERP) |
| `@reduxjs/toolkit`, `zustand` | ERP stores | shared (ERP) |
| `framer-motion`, `lucide-react`, `recharts`, `date-fns`, `zod` | shared UI | shared |

### 11.2 Backend packages used by the portal

| Package | Used for |
|---|---|
| `express`, `multer` (multipart ticket attachments) | routes |
| `jsonwebtoken` (portal JWT, 5-min SSE tickets) | `portalAuthService`, `middleware/portalAuth` |
| `bcrypt` (or `bcryptjs`) | portal password hashing |
| `otplib` | TOTP 2FA |
| `stripe` | `POST /payments/intent` (optional, `STRIPE_SECRET_KEY`) |
| `sqlite3` (node) | local SQLite lifecycle store |
| `axios` | PostgREST service-role repository |
| `nodemailer` | reset/invite emails (`emailService`) |

### 11.3 Environment variables

| Variable | Used by |
|---|---|
| `VITE_API_URL` | `frontend/config/api.js` — API base for portal + admin clients |
| `VITE_STRIPE_PUBLISHABLE_KEY` | `CustomerInvoices.tsx:35` (Stripe checkout) |
| `STRIPE_SECRET_KEY` | backend `POST /payments/intent` |
| `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SECRET_KEY` | backend cloud repo; ERP frontend staff auth |
| `ALLOW_HEADER_AUTH` | backend loopback/header auth (dev) |
| `VITE_USE_REAL_BACKEND` (Sasa only) | Sasa dead adapter gate — **never set in ERP** |

---

## 12. REMOVAL IMPACT (if the old Portal frontend were eventually removed)

### 12.1 SAFE TO REMOVE WITH OLD PORTAL (portal-only, no ERP consumer)

- `frontend/views/portal/*` — all 26 pages, `CustomerLayout`, 21 components, `ThemeContext`, `usePortalData`, `useConfirmDialog`, `validation.ts`, `sanitize.ts`, `constants.ts`, `designTokens.ts`, `portalDesignTokens.ts`, `portalStyles.ts`, `sampleData.ts` (already dead).
- `frontend/context/CustomerAuthContext.tsx`, `frontend/context/CartContext.tsx`.
- `frontend/services/portalApiClient.ts`, `portalCache.ts`, `authApiClient.ts` (after unified login removal), `adminPortalClient.ts` (**see 12.4** — heavily used by ERP views).
- Portal-only deps: `@stripe/*`, `jsbarcode`, `qrcode`.
- Backend: `routes/portalAuth.cjs`, `middleware/portalAuth.cjs`, `services/portalAuthService.cjs`, `services/portalScope.cjs`, `routes/erpPortalMirror.cjs` (already dead), `routes/portal.cjs` (**see 12.3**).
- Portal-only tests: `frontend/tests/usePortalData.test.tsx`, `frontend/tests/portalCache.test.ts`, `backend/tests/portalService.catalog.test.cjs`.
- Portal-only env: `VITE_STRIPE_PUBLISHABLE_KEY`, `STRIPE_SECRET_KEY` (Stripe), portal email templates.

### 12.2 MUST REMAIN FOR ERP (never remove — ERP business functionality)

- ERP business UI: `views/CustomersHub.tsx`, `views/Inventory.tsx`, `views/POS.tsx`, `views/Purchases.tsx`, `views/Reports.tsx` + `views/reports/`, `views/FiscalReportsHub.tsx`, `views/RevenueHub.tsx`, `views/AccountingAssistant.tsx`, `views/accounts/`, `views/sales/` (SalesFlowHub, QuotationRequests, SalesOrders, Orders), `views/procurement/`, `views/production/`, `views/warehouse/`, `views/settings/`, `views/admin/`, `views/vat/`, `views/service/`, `views/examination/`, `views/workflows/`, `views/apps/`, `views/tools/`, `views/ai/`.
- ERP contexts/stores/services: `AuthContext`, `DataContext`, `SalesContext`, `OrdersContext`, `InventoryContext`, `FinanceContext`, `stores/*`, `services/db.ts`, `offlineDb.ts`, `syncService.ts`, `durableSyncQueue.ts`, `backgroundSyncService.ts`, `cloudDb.ts`, `repositories/`, all ERP business services (§6), `SupabaseClient`, PDF pipeline (`views/shared/components/PDF/*`, `utils/pdfMapper`, `documentSecurity`).
- Backend ERP routes/services: `/api/sync`, `/api/auth` (staff parts), `authService`, all ERP business routes and services (§6), `cloudSyncStore`, `supabaseRepository/Query/Store`, financial/reporting/production/procurement/HR/examination/engagement services.
- Database: ALL ERP tables (customers, invoices, products, ledger, etc.) — source of truth for Sasa.
- ERP tests: `frontend/tests/*` (non-portal), `backend/tests/*` (non-portal), `e2e/*`.

### 12.3 MUST BE REUSED BY SASA (shared backend surface Sasa depends on)

- `routes/portal.cjs` (all customer endpoints: dashboard, catalog, requests, quotations, orders, invoices, payments, statements, deliveries, wallet, loyalty, referrals, notifications, support, documents, profile, SSE) — **or an equivalent new API; do not delete before Sasa is wired**.
- `services/portalService.cjs`, `portalLifecycleService.cjs` (business logic + `publishErpEvent`), `portalAuthService.cjs` (auth/session/2FA), `portalScope.cjs` (scoping contract).
- `services/workflowEngine.cjs` (SO/QR numbering, state machine, versions, chains), `promotionEngine.cjs`, `promotionService.cjs`, `referralService.cjs`, `paymentAllocationService.cjs`, `emailService.cjs`.
- Portal DB tables: `portal_users`, `portal_sessions`, `portal_password_resets`, `portal_login_history`, `portal_notifications`, `portal_tickets*`, `quotation_requests`, `portal_ads`, lifecycle tables (`portal_timeline_events`, `portal_downloads`, `document_*`, `admin_notifications`).
- Real-time SSE infra (`/portal/events`, tickets).

### 12.4 MUST BE REFACTORED BEFORE REMOVAL (ERP UI coupled to portal infrastructure)

| Coupling | Where | Refactor needed |
|---|---|---|
| `adminPortalClient` (adminLifecycle) used by ERP views | `views/sales/QuotationRequests.tsx` (heavy), `sales/SalesOrders.tsx:126`, `sales/Orders.tsx:465`, `Settings.tsx:752–753`, `NotificationContext.tsx`, `AdsManager.tsx` | Extract ERP-side admin functions to an ERP-native service, or keep a "portal admin" API surface for ERP staff |
| Portal-user provisioning inside ERP customer creation | `SalesContext.tsx:996–1036`, `stores/salesStore.ts:330–378` (`autoCreate` + invite) | Decouple: ERP keeps customers; portal account creation becomes a Sasa-side/backend concern |
| Unified login `/api/auth/login` used by BOTH portal + ERP API-mode | `authApiClient.ts`, `routes/auth.cjs` | Keep staff branch; customer branch moves behind Sasa |
| Portal users nav/hub entries in ERP | `components/Sidebar.tsx:135`, `CustomersHub.tsx:30–35` | Remove links only when Sasa takes over user provisioning |
| Shared PDF pipeline imported by portal pages | `views/shared/components/PDF/*`, `templateSettings.ts`, `utils/pdfMapper`, `utils/documentSecurity` | Shared with ERP — keep; Sasa must reuse it |
| `isPortalContext` / host detection / landing in `App.tsx:1112–1130` | `App.tsx` | To be retired when Sasa hosts its own domain; until then ERP must keep serving `/portal*` |
| Portal admin workflow inside ERP sales views | `QuotationRequests.tsx` (request→quotation→order pipeline, ~1200 lines of adminLifecycle calls) | This is **ERP staff functionality that Sasa does not replace** — must be preserved or re-platformed before portal removal |

### 12.5 Tests referencing portal (impact inventory)

- `frontend/tests/usePortalData.test.tsx`, `frontend/tests/portalCache.test.ts` — portal-only; removed with portal.
- `backend/tests/portalService.catalog.test.cjs` — portal-only; removed or re-based on new service.
- `backend/tests/unit/auth.register.test.cjs` — mocks `portalAuthService`; refactor.
- `backend/tests/unit/sync.authorization.test.cjs` — asserts portal tokens rejected from sync; **keep** (security contract).
- `backend/tests/referral.test.cjs`, `promotionEngine.test.cjs`, `tenant_isolation_security.test.js` — ERP-side; keep.
- `e2e/promotions.spec.ts` — portal-only reference at line 78; minor.

### 12.6 What breaks today if portal frontend removed (before refactor)

1. ERP staff quotation-request workflow (`QuotationRequests.tsx` etc.) — full loss of admin pipeline.
2. ERP customer creation invite flow (SalesContext/salesStore auto-create).
3. Unified login customer branch; ERP API-mode login unaffected but shares the endpoint.
4. Portal ads (AdsManager) would orphan `portal_ads`.
5. `/portal*` routes 404 on the portal host; `isPortalContext` dead code.
6. Portal auth backend (portal_users/sessions) would need a consumer (Sasa) or become stale.
7. Stripe/PDF/barcode/qrcode deps unused.

---

## 13. RECOMMENDED MIGRATION SEQUENCE (planning only — no action this phase)

1. **Gate:** apply pending migrations `0003`/`0004`/`0005` and fix referral edge-function drift (out of scope for Phase 1, flagged in §14).
2. **Keep ERP portal fully operational** (mandate #7) — do nothing destructive until Sasa passes full functional verification.
3. **Wire Sasa to the real backend** using the existing `/api/portal/*` contract (`portalApiClient` behavior: JWT, 401-refresh, cache, SSE) — auth via `POST /api/auth/login (portal:'customer')` + activation/2FA/sessions.
4. **Feature-by-feature parity verification** against §7 inventory (dashboard, catalog/cart/preview via `promotionEngine`, requests, quotations accept/reject/revision, invoices/payments via Stripe + allocation, statements, deliveries, wallet, loyalty, referrals, notifications/SSE, support tickets, documents/PDFs, profile/2FA/sessions, admin workflow).
5. **ERP-side decoupling refactors (§12.4):** extract admin portal workflow + invite provisioning into ERP-native services; keep unified login staff branch.
6. **Rollout:** dual-run Sasa on `portal.primeerp.com` while ERP portal remains on `#/portal`; customers migrate; disable old portal routes only after verification sign-off.
7. **Removal:** delete portal frontend module, portal auth context/clients, portal-only deps/tests/env, and (only after Sasa owns them) portal auth/lifecycle backend pieces that Sasa did not absorb.
8. **Post-cutover:** remove `isPortalContext`/host-detection/landing redirects; re-point `portal_ads`, notifications, and email flows.

---

## 14. RISKS / BLOCKERS

| # | Risk / Blocker | Severity | Detail |
|---|---|---|---|
| 1 | **Sasa is 0% production-ready** | CRITICAL | No backend, no auth, no persistence, no tests, broken lint. Every feature must be built/wired. |
| 2 | Pending migrations 0003/0004/0005 not applied | HIGH | Without 0005, `/portal/dashboard` 500s; without 0003/0004, referral tables/policies absent. Migration timing must be coordinated. |
| 3 | Referral edge functions reference non-existent RPCs/tables | HIGH | `referral-expiry`/`referral-analytics` cron expected to fail; referral expiry/analytics unreliable until fixed. |
| 4 | ERP staff admin workflow (request→quotation→order) has NO Sasa equivalent | HIGH | If Sasa replaces only the customer UI, the ERP admin pipeline in `QuotationRequests.tsx` must be preserved — it is ERP staff functionality. |
| 5 | Open-by-default RLS (~151 allow_all policies) | MEDIUM | Portal isolation is defense-in-depth via backend scoping only; a mis-wired Sasa (direct Supabase access) would expose all customer data. Sasa must go through the backend. |
| 6 | Dual-key scoping (`customerId` vs `customer_id`) | MEDIUM | Data written by ERP stores vs backend shim must be matched via `portalScope.cjs` OR-filters; Sasa integration must not bypass it. |
| 7 | Parallel duplicate provisioning paths (SalesContext vs salesStore) | MEDIUM | Two `addCustomer` implementations both call `autoCreate`; consolidation needed before removal. |
| 8 | Stripe in test/mock mode | MEDIUM | `POST /payments/intent` returns `pi_mock_*` without `STRIPE_SECRET_KEY`; payment verification must confirm production gateway. |
| 9 | PDF pipeline is shared with ERP | LOW-MEDIUM | Portal PDFs rely on shared components; Sasa must reuse them rather than regress to fake `.txt`. |
| 10 | 2FA/session complexity | LOW-MEDIUM | TOTP + session rotation + 25-min refresh must be re-implemented or reused; Sasa has none. |
| 11 | `portal_tickets` duplicate-column artifact in 0001 | LOW | Live-capture artifact; harmless but should be cleaned in a future migration. |
| 12 | Dead code accumulation | LOW | `erpPortalMirror.cjs`, `sampleData.ts`, `Gateway.tsx` — remove opportunistically, not as part of migration. |

---

## 15. EXACT ITEMS THAT MUST BE PRESERVED BEFORE THE OLD PORTAL IS REMOVED

**Backend (must survive the portal-frontend removal):**
1. `backend/routes/portal.cjs` — customer API surface (or its Sasa equivalent).
2. `backend/services/portalService.cjs`, `portalLifecycleService.cjs`, `portalAuthService.cjs`, `portalScope.cjs`.
3. `backend/services/workflowEngine.cjs`, `promotionEngine.cjs`, `promotionService.cjs`, `referralService.cjs`, `paymentAllocationService.cjs`, `emailService.cjs`.
4. `backend/routes/portalAdmin.cjs` + `adminLifecycle` capabilities (until ERP staff workflow is re-platformed).
5. Unified `POST /api/auth/login` customer branch (until Sasa auth is live).
6. Portal SSE infra (`/portal/events`, tickets) or Sasa equivalent.
7. Stripe intent endpoint + `STRIPE_SECRET_KEY`/`VITE_STRIPE_PUBLISHABLE_KEY` config.

**Database (preserve; never drop):**
8. `portal_users`, `portal_sessions`, `portal_password_resets`, `portal_login_history` (portal auth state).
9. `quotation_requests` + SQLite lifecycle tables (`portal_timeline_events`, `portal_downloads`, `document_versions`, `document_signatures`, `document_comments`, `admin_notifications`, `notifications`).
10. `portal_notifications`, `portal_tickets`, `portal_ticket_messages`, `ticket_attachments`, `portal_ads`.
11. All ERP tables (customers, invoices, customer_payments, sales_orders, quotations, products, delivery_notes, shipments, ledger_entries, wallet_transactions, engagement_*, referral tables) — **the source of truth Sasa reads**.
12. Apply pending migrations 0003/0004/0005 before any cutover involving referrals/quotation_requests.

**Frontend (preserve for ERP):**
13. ERP staff admin workflow in `views/sales/QuotationRequests.tsx`, `sales/Orders.tsx`, `sales/SalesOrders.tsx` (or extracted ERP-native service).
14. Customer-provisioning `autoCreate` path (until replaced by a Sasa-side provisioning flow).
15. Shared PDF pipeline (`views/shared/components/PDF/*`, `templateSettings.ts`, `utils/pdfMapper`, `utils/documentSecurity`, `utils/formatters`).
16. `frontend/App.tsx` host-detection/landing (`isPortalContext`, `getLandingPath`) — until Sasa owns the portal domain.

**Data integrity:**
17. `portal_users.customer_id → customers.id` mapping must be exported/verified before any auth migration.
18. `portal_session` tokens: active customer sessions must be honored or gracefully expired during cutover (refresh rotation means an Sasa-hosted token store must be compatible).

---

## MIGRATION READINESS SUMMARY

| Item | Status |
|---|---|
| ERP portal understood (routes/auth/API/DB/features) | **READY** — fully documented in §1–§8 |
| ERP business services available for reuse | **READY** — all identified in §6; Sasa must call them server-side |
| ERP portal remains operational during migration | **READY** — untouched; no changes made in this phase |
| Database contract for Sasa (customers, invoices, orders, quotation_requests, referrals) | **READY** (schema exists) — **BUT** pending migrations 0003/0004/0005 must be applied first → see BLOCKED |
| Sasa UI feature set (visual scope) | **READY** as a design reference — covers most ERP portal screens |
| Sasa backend connectivity | **NOT READY** — zero real API calls; dead adapter only |
| Sasa authentication | **NOT READY** — fake login, boots logged-in, no sessions/2FA/activation/reset |
| Sasa persistence & data source | **NOT READY** — in-memory mock data only, lost on refresh |
| Sasa payments | **NOT READY** — fake timeout+confetti; no gateway, no allocation, no ledger |
| Sasa referrals/loyalty/wallet/support/documents | **NOT READY** — missing or fake |
| Sasa tests / lint / CI | **NOT READY** — no tests; lint broken; no CI/CD |
| Referral edge functions (expiry/analytics) | **BLOCKED** — reference RPCs/tables not present in Supabase baseline |
| Pending DB migrations (0003/0004/0005) | **BLOCKED** — not applied; required before referral & quotation_requests parity |
| ERP staff admin workflow replacement (request→quotation→order) | **UNKNOWN** — no Sasa equivalent exists; decision needed on ERP-side re-platforming |
| Cutover/dual-run plan for customer sessions and portal domain | **UNKNOWN** — not yet defined (Phase 2+ scope) |

**Bottom line:** The ERP side of the migration is fully mapped and reusable. **Sasa is a UI prototype only and is NOT READY for production replacement** — it has zero backend integration, fake authentication, and no persistence. The old portal must remain live until Sasa's backend wiring, auth, and every feature in §7/§10 pass complete functional verification. No code was changed in this phase.

---

*End of Phase 1 Discovery Report.*
