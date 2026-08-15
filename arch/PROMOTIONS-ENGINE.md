# Promotion Engine — Portal-Driven Promotions (without changing ERP master prices)

> **Status:** Implemented · **Engine version:** `promotionEngine@1`
> **Core rule:** Promotions modify the **transaction price**, never the ERP
> master product price. When a promotion expires, prices automatically return
> to the master value — no product-price restoration is ever required.

```
                    ERP MASTER DATA
                         │
                         │              Product Price = MWK 10,000
                         ▼
                ┌─────────────────┐
                │ Promotion Engine│   Portal: −10%  (transaction-level rule)
                └────────┬────────┘
                         ▼
                   TRANSACTION
                  Original = 10,000 · Discount = 1,000 · Net = 9,000
                         │
                         ▼
              ERP Order / Invoice (snapshot keeps the discount)
                         │
                         ▼
                    Payment / Wallet  (charged the discounted amount)
```

---

## 1. Architecture

All promotion logic lives in **one server-side path**. Portal preview, Portal
order submission, and the ERP admin UI all call the same engine. There is no
duplicated calculation in React components, cart, checkout, or invoice code.

```
Supabase (cloud source of truth)
   │  engagement_promotions   (rule definitions)
   │  promotion_redemptions   (usage/analytics ledger)
   │  realtime publication    (admin edits → portal sees instantly)
   ▼
backend/services/promotionEngine.cjs    ← pure, deterministic calculation
backend/services/promotionService.cjs   ← data access + atomic redemption
   ▼
backend/routes/promotions.cjs           ← ERP admin CRUD + analytics (/api/promotions)
backend/routes/portal.cjs               ← portal preview + submission (/api/portal/*)
   ▼
frontend/views/admin/PromotionsAdmin.tsx  ← premium admin UI
frontend/views/portal/CustomerCreateRequest.tsx, CustomerCatalog.tsx, details
```

### Files

| File | Purpose |
|---|---|
| `database/supabase-promotions-engine.sql` | Migration: columns, `promotion_redemptions`, atomic `apply_promotion_usage` RPC, RLS, indexes, realtime |
| `backend/services/promotionEngine.cjs` | Pure engine: normalization, status derivation, eligibility, discount calc, stacking, security caps |
| `backend/services/promotionService.cjs` | Promotions data access, atomic redemption, analytics queries |
| `backend/routes/promotions.cjs` | Admin REST API: list/get/create/update/pause/resume/cancel/analytics |
| `backend/routes/portal.cjs` | Portal: `GET /promotions` (display), `POST /orders/preview`, request creation |
| `backend/services/portalLifecycleService.cjs` | Server-authoritative pricing at request submission + promotion carry-through to quotation → sales order |
| `backend/services/portalService.cjs` | Order/request serialization includes promotion snapshot |
| `backend/tests/promotionEngine.test.cjs` | 36 unit tests (basic/dates/channels/conditions/usage/security/stacking/e2e) |
| `frontend/views/admin/PromotionsAdmin.tsx` | Admin dashboard, filters, premium create/edit form with live discount preview |
| `frontend/views/portal/CustomerCreateRequest.tsx` | Checkout: live promo banner, code entry, save breakdown |
| `frontend/views/portal/CustomerCatalog.tsx` | Product-card promo badges |
| `frontend/views/portal/CustomerRequestDetail.tsx` / `CustomerOrderDetail.tsx` | Discount breakdown on existing documents |
| `frontend/views/portal/components/PromotionBanner.tsx` | Live premium banner on the Portal home (display-only) |
| `e2e/promotions.spec.ts` | Playwright e2e: admin creates a PORTAL promotion |
| `scripts/validate-promotions-migration.cjs` | Static validator for the migration SQL |
| `frontend/types/engagement.ts` | Canonical `Promotion` + calculation types |
| `frontend/services/portalApiClient.ts` | Portal client additions + request/order promotion fields |

---

## 2. Promotion model

Canonical fields (superset of the legacy `engagement_promotions` shape — legacy
keys are normalized by `promotionEngine.normalizePromotion`):

```text
id · company_id · name · description · promotion_code · status
channel (ERP|PORTAL|BOTH) · discount_type · discount_value
minimum_order_amount · maximum_discount_amount
start_at · end_at · usage_limit · usage_limit_per_customer
applicable_to (all|products|categories|tiers) · applicable_products ·
applicable_categories · customer_scope (all|customers|tiers|new_customers|existing_customers) ·
customer_ids · tier_ids · priority · stackable · is_auto_apply
is_active · paused_at · cancelled_at · created_by · created_at · updated_at
```

### Status is derived, not trusted

`deriveStatus()` computes the effective status server-side from stored state:

```text
cancelled_at set / status=cancelled  →  cancelled
paused_at set / status=paused       →  paused
status=draft                        →  draft
now < start_at                      →  scheduled
now > end_at                        →  expired
is_active = false                   →  draft
otherwise                           →  active
```

The frontend only *displays* status; the engine re-derives it at calculation
time so an expired/paused promotion can never be applied.

---

## 3. Discount types

Implemented in `computeLineDiscount` (extensible — new types are a switch case):

| Type | Behaviour |
|---|---|
| `percentage` | `lineTotal × value%` |
| `fixed_amount` | Order-level fixed MWK discount, distributed proportionally across eligible lines |
| `fixed_price` | Sets net unit price to `discount_value` (clamped ≥ 0) |
| `buy_x_get_y` | `buyXQty`/`getYQty`/`getYDiscount` — get-Y items at the discounted rate |
| Legacy aliases | `fixed`, `tiered`, `category`, `brand`, `bundle`, `coupon`, `campaign` mapped to canonical handling |

**No separate pricing system.** The engine sits on top of the ERP master price:
`resolveAuthoritativePrices()` re-derives every line from the catalog master
price at submission time. Browser prices are display-only.

---

## 4. Security model

At checkout the backend does, in order:

1. Authenticate the portal customer (existing JWT middleware).
2. Resolve the customer → company (cross-company promotions are filtered out).
3. Resolve **authoritative** master prices from the ERP catalog
   (`resolveAuthoritativePrices`).
4. Load active promotions for the company + channel (`PORTAL`).
5. Validate eligibility (dates, channel, min order, max discount, product/
   category/tier scope, customer scope, usage limits, code).
6. Calculate the discount (stacking + caps).
7. Persist the order **with the promotion snapshot** (immutable history).
8. Synchronize to ERP.

**Never trusted from the browser:** `unit_price`, `discount`,
`discount_percent`, `promotion_id`, `promotion_code`, `total`.

**Prevented:** manipulated prices/discounts, negative prices (net clamped ≥ 0),
excessive discounts (`maxTotalDiscountPct` default 50%), expired promotions,
unauthorized promotions, cross-company access, ERP-only promotions on Portal
orders (channel gate), and duplicate application of the same promotion record
(dedupe by id) or double-discounting from non-stackable promotions.

---

## 5. Stacking & priority

- Candidates sorted by `priority` (higher wins), then by discount amount.
- `stackable = true` promotions may stack (up to `maxStacked`, default 3) under
  a hard total cap (`maxTotalDiscountPct`, default 50% of subtotal).
- Non-stackable promotions are mutually exclusive — the best one wins.
- `stackingRule: 'exclusive' | 'best_only'` supported for future config.

---

## 6. Transaction lifecycle & historical integrity

When a Portal request is submitted, the backend stores on the request:

```text
subtotal · discount_total · total · promotion_applied
promotion  → { id, code, name, discountType, discountValue, discountAmount,
               discountPercent, channel, appliedAt }
```

Line items keep **both** master price and discount fields:

```text
unitPrice (master) · originalUnitPrice · discountPercent · discountAmount ·
netUnitPrice · promotionId · promotionCode · priceSource
```

`priceSource` is an audit flag: `master` (priced from the ERP catalog),
`custom_line` (browser price kept because the line has no productId — a
bespoke item sales confirms before quoting) or `unknown_product` (a productId
was supplied but is NOT in the ERP catalog → priced at 0 so sales must review
before a quotation is issued).

`completeQuotation` and `generateSalesOrder` carry the request's promotion
forward into the quotation / sales order rows (`promotion`, `discount_total`,
`promotion_applied`, `subtotal_before_discount`). The ERP therefore always sees
the *reason* a price differs (legitimate promotion) instead of a silently
changed master. Sales may override, but the discount is never silently lost.

**Historical orders are never recalculated.** The snapshot means an order
created under a 10% promotion stays 10% even after the promotion is edited or
deleted.

---

## 7. Database migration

Apply `database/supabase-promotions-engine.sql` after the existing
`supabase-add-version-columns.sql`. It:

1. **Extends `engagement_promotions`** (idempotent `ALTER TABLE ... ADD COLUMN
   IF NOT EXISTS`) with the canonical columns — no new table, no duplicate
   definitions.
2. **Creates `promotion_redemptions`** — the usage/analytics ledger:
   `id · promotion_id → engagement_promotions(id) · company_id · customer_id ·
   source_type · source_id · source_number · subtotal_before · discount_amount ·
   subtotal_after · promotion_snapshot jsonb · created_at`, indexed by
   `(promotion_id)`, `(company_id)`, `(customer_id)`.
3. **Creates `apply_promotion_usage(...)` RPC** — an atomic Supabase
   function that:
   - `SELECT ... FOR UPDATE` locks the promotion row (no read-then-write race),
   - re-validates status, dates, channel, usage limits inside the DB,
   - increments `used_count` and `customer_used_count`,
   - inserts the redemption ledger row,
   - **all in one transaction**, so two simultaneous checkouts can never exceed
     a usage limit.
   - Falls back gracefully (service-level best effort) if the RPC is
     unavailable, so checkout never fails on usage bookkeeping.
4. **RLS** — companies can only read/update their own promotions
   (`company_id = (auth.jwt() ->> 'company_id')`); portal users read only
   active `PORTAL`-channel promotions for their company. `promotion_redemptions`
   has matching company scoping.
5. **Realtime** — `engagement_promotions` + `promotion_redemptions` are added
   to the realtime publication so admin edits reach the ERP sync layer and
   portal pricing immediately.
6. **Indexes** on `company_id`, `status`, `start_at`, `end_at`, `channel`,
   `promotion_code`; unique index on `(company_id, promotion_code)`.

### Applying the migration

Validate first (no database required):

```bash
node scripts/validate-promotions-migration.cjs
```

Then apply to your Supabase project **one** of:

```bash
# 1) psql (needs the project's connection string, e.g. from Dashboard →
#    Project Settings → Database → Connection string)
psql "postgresql://postgres.[project-ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres" \
  -v ON_ERROR_STOP=1 -f database/supabase-promotions-engine.sql

# 2) Supabase Dashboard → SQL Editor → new query → paste the file contents → Run
#
# 3) Supabase CLI
#    supabase db push  (with database/supabase-promotions-engine.sql tracked)
```

The migration is idempotent (`IF NOT EXISTS` / `CREATE OR REPLACE` everywhere)
and safe to re-run.

### Backfill strategy

Existing `engagement_promotions` rows are preserved and normalized on read
(legacy field names map onto canonical ones). Existing orders/quotations are
left financially untouched — the migration only adds nullable columns and
never alters historical totals.

---

## 8. API surface

### Admin (ERP) — `/api/promotions` (auth required)

```text
GET    /api/promotions            list (filters: status, channel, search, page, pageSize)
GET    /api/promotions/:id        detail (with usage + performance)
POST   /api/promotions            create
PUT    /api/promotions/:id        update
POST   /api/promotions/:id/pause  pause
POST   /api/promotions/:id/resume resume
POST   /api/promotions/:id/cancel cancel
GET    /api/promotions/analytics  dashboard stats + `byPromotion` per-promotion
                                  breakdown + `trend` (last 30 days of orders /
                                  gross / discount / net for charts)
```

All scoped by `req.user.company_id`; cross-company access returns 404.

### Portal — `/api/portal` (portal JWT required)

```text
GET   /promotions            display-only active PORTAL promotions (badges)
POST  /orders/preview        server-authoritative estimate (no persistence)
POST  /requests              order/quotation request — promotion applied server-side
```

---

## 9. Realtime

- Admin edits a promotion → Supabase row change → realtime event →
  ERP frontend sync layer (`syncService` subscription) updates local records →
  portal pricing endpoint returns the latest state.
- Portal requests/quotation/order updates already push over the SSE stream, so
  a customer's document reflects promotion changes without a manual refresh.
- Every order calculation **re-fetches current promotion state server-side**,
  so even without realtime the latest rules are always applied.

---

## 10. Acceptance criteria mapping

| # | Criterion | Where |
|---|---|---|
| A | Admin creates a 10% Portal promotion without changing product prices | `PromotionsAdmin.tsx` → `POST /api/promotions` (only promotion rows written) |
| B | Qualifying Portal customer automatically gets the discount | Auto promotions (`isAutoApply`) evaluated in `runOrderPromotion` at request creation |
| C | Portal shows Original / Discount / Savings / Final | `CustomerCreateRequest.tsx` promo banner + breakdown; request/order detail views |
| D | ERP master price unchanged | `resolveAuthoritativePrices` uses catalog price; line stores `unitPrice` = master |
| E | ERP order/invoice records promotion + discount | `promotion`/`discount_total` columns on requests → quotations → sales orders |
| F | Customer pays discounted amount | Request totals persisted as `total`; downstream invoices built from order totals |
| G | Wallet deductions use discounted amount | Payment flows read invoice `total_amount` (already discounted) |
| H | Promotion stops after expiry | `deriveStatus` → `expired` blocks eligibility; no price restoration needed |
| I | Historical orders not recalculated | Promotion snapshots embedded in each transaction |
| J | Frontend can't manipulate discount | Server re-derives prices + discount at submission |
| K | Portal & ERP share one source of truth | Supabase `engagement_promotions` + shared engine |
| L | Company isolation | RLS + `company_id` filter in service + engine cross-company block |
| M | No accidental double discount | Stacking rules, total cap, dedupe by id |
| N | Usage & financial impact reported | `promotion_redemptions` + `/api/promotions/analytics` + per-promotion stats |
| O | Works with no active promotion | Engine returns zero-discount result (tested) |

---

## 11. Running the tests

```bash
cd backend && npx jest tests/promotionEngine.test.cjs --no-coverage
```

Covers: 10%/5%/fixed discounts · date windows (before/at start/during/at
end/after) · channels (PORTAL/ERP/BOTH) · min order · max discount · product ·
category · customer · tier scope · total & per-customer usage limits ·
manipulated price/discount · invalid/expired/foreign-company promotions ·
no-double-discount · stacking/priority · the spec's AUGUST10 end-to-end example.
