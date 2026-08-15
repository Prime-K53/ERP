# Referral Management Module

## Architecture Overview

The Referral Management module follows a **backend-driven architecture** with a REST API exposing all business operations. The backend (Express.js + SQLite) owns all business logic, data persistence, and authorization. The frontend (TypeScript/React) provides a thin client layer with an API client that handles snake_case to camelCase transformation.

Key design decisions:
- **Backend service layer** (`ReferralService` class) encapsulates all business rules in transactional methods
- **Zod schemas** validate all inputs at the route level before they reach the service layer
- **JSONB columns** in the cloudDb-compatible schema store domain fields for flexibility
- **Company isolation** enforced at the query level — every query includes `company_id = ?`
- **JWT + role-based access** controls every endpoint
- **Automatic snake_case ↔ camelCase** transformation happens in the frontend API client

### Notifications
- `backend/services/referralNotificationService.cjs` handles in-app notifications
- Events: reward approved, reward rejected, reversal processed, referral converted
- Notifications stored in `notifications` table with status tracking
- Integrated into service: approveReward, rejectReward, approveReversal

---

## File Locations and Purposes

### Backend (`backend/`)

| File | Purpose |
|------|---------|
| `routes/referralRoutes.cjs` | Express router — all referral API endpoints |
| `services/referralService.cjs` | `ReferralService` class — all business logic |
| `services/baseService.cjs` | Base class with `_run`, `_get`, `_all`, `_transaction` wrappers |
| `middleware/auth.cjs` | `verifyToken` + `requireRole` JWT middleware |
| `middleware/validation.cjs` | Zod schemas for every referral request body/query |

### Frontend (`frontend/`)

| File | Purpose |
|------|---------|
| `types/referral.ts` | Core TypeScript interfaces: `Referral`, `ReferralReward`, `ReferralSettings` |
| `types/referral-extended.ts` | Extended interfaces: `ReferralTimelineEntry`, `ReferralAuditEntry`, `ReferralCampaign`, `ReferralAnalytics`, `ReversalRequest`, `ReferralRule`, `ReferralEvent` |
| `services/referralApiClient.ts` | HTTP client — all API calls, automatic snake_case → camelCase |
| `services/referralService.ts` | Frontend service facade combining API calls + local business rules |
| `services/referralRuleEngine.ts` | Client-side rule evaluation (eligibility, reward calculation, expiry) |
| `services/referralCampaignService.ts` | Client-side campaign CRUD + campaign applicability matching |
| `services/referralAnalyticsService.ts` | Client-side analytics generation + history |
| `services/referralTimelineService.ts` | Client-side timeline entry CRUD |
| `services/referralReversalService.ts` | Client-side reversal request lifecycle |
| `services/referralAuditService.ts` | Client-side audit logging |
| `services/referralEventBus.ts` | Event emitter for cross-service communication |
| `services/referralNotificationService.ts` | Notification hooks wired to events |

### Database (`database/`)

| File | Purpose |
|------|---------|
| `supabase-referral-tables.sql` | Initial schema: `customer_referrals` + `referral_rewards` |
| `supabase-referral-tables-v2.sql` | Tables v2: `referral_timeline`, `referral_audit_logs`, `referral_campaigns`, `referral_analytics`, `referral_reversals`, `referral_event_history` + auto-expire function + analytics function |
| `supabase-referral-migrate-to-jsonb.sql` | Full migration: drops + recreates all 8 tables with JSONB `data` column |
| `drop-fk-referrals.sql` | Drops FK constraints to `company_config` |
| `disable-rls-referrals.sql` | Disables Row Level Security on all referral tables |

---

## Database Schema

All 8 tables use a generic JSONB schema where domain-specific fields are stored in a `data` JSONB column. The backend `ReferralService` operates on individual columns (non-JSONB) in its actual queries, but the cloudDb-compatible DDL uses JSONB. The tables listed below reflect the **actual column-level schema** used by the service layer at runtime.

### ER Diagram (Text-Based)

```
┌──────────────────────┐       ┌──────────────────────┐
│  customer_referrals  │       │   referral_rewards    │
├──────────────────────┤       ├──────────────────────┤
│ id (PK)              │──┐    │ id (PK)              │
│ customer_id          │  │    │ referral_id (FK)     │──┘
│ referred_by_id       │  │    │ customer_id          │
│ referred_by_name     │  │    │ invoice_id           │
│ referral_code (UQ)   │  │    │ invoice_amount       │
│ status               │  │    │ amount               │
│ pending_invoice_id   │  │    │ status               │
│ pending_invoice_amt  │  │    │ approved_by          │
│ converted_invoice_id │  │    │ approved_at          │
│ converted_at         │  │    │ cancelled_by         │
│ notes                │  │    │ cancel_reason        │
│ company_id           │  │    │ cancelled_at         │
│ created_at           │  │    │ wallet_tx_id         │
│ updated_at           │  │    │ company_id           │
└──────────────────────┘  │    │ created_at           │
                          │    │ updated_at           │
                          │    └──────────────────────┘
                          │
┌──────────────────────┐  │    ┌──────────────────────┐
│   referral_timeline  │  │    │ referral_audit_logs  │
├──────────────────────┤  │    ├──────────────────────┤
│ id (PK)              │  │    │ id (PK)              │
│ referral_id (FK)     │──┘    │ entity_type          │
│ event_type           │       │ entity_id            │
│ title                │       │ action               │
│ description          │       │ actor_id             │
│ amount               │       │ actor_name           │
│ actor_id             │       │ field_name           │
│ actor_name           │       │ old_value            │
│ metadata_json        │       │ new_value            │
│ timestamp            │       │ reason               │
│ company_id           │       │ correlation_id       │
│ created_at           │       │ ip_address           │
└──────────────────────┘       │ user_agent           │
                               │ timestamp            │
┌──────────────────────┐       │ company_id           │
│  referral_campaigns  │       │ created_at           │
├──────────────────────┤       └──────────────────────┘
│ id (PK)              │
│ name                 │       ┌──────────────────────┐
│ description          │       │ referral_reversals   │
│ start_date           │       ├──────────────────────┤
│ end_date             │       │ id (PK)              │
│ status               │       │ reward_id            │
│ reward_type          │       │ reason               │
│ reward_value         │       │ status               │
│ reward_percentage    │       │ requested_by         │
│ min_purchase_amount  │       │ requested_at         │
│ max_reward_amount    │       │ approved_by          │
│ max_rewards_per_cust │       │ approved_at          │
│ max_total_rewards    │       │ rejected_by          │
│ total_rewards_given  │       │ rejected_at          │
│ target_segments_json │       │ reject_reason        │
│ excluded_cust_json   │       │ completed_at         │
│ bonus_multiplier     │       │ notes                │
│ terms_json           │       │ company_id           │
│ created_by           │       │ created_at           │
│ approved_by          │       │ updated_at           │
│ company_id           │       └──────────────────────┘
│ created_at           │
│ updated_at           │       ┌──────────────────────────┐
└──────────────────────┘       │   referral_analytics     │
                               ├──────────────────────────┤
┌──────────────────────┐       │ id (PK)                  │
│ referral_event_hist  │       │ period                   │
├──────────────────────┤       │ period_start             │
│ id (PK)              │       │ period_end               │
│ event_type           │       │ total_referrals          │
│ source               │       │ active_referrals         │
│ entity_type          │       │ converted_referrals      │
│ entity_id            │       │ total_rewards_amount     │
│ data_json            │       │ approved_rewards_amount  │
│ correlation_id       │       │ paid_rewards_amount      │
│ actor_id             │       │ pending_rewards_amount   │
│ timestamp            │       │ reversed_rewards_amount  │
│ processed            │       │ average_reward_amount    │
│ processed_at         │       │ conversion_rate          │
│ error                │       │ revenue_attributed       │
│ retry_count          │       │ roi                      │
│ max_retries          │       │ generated_at             │
│ company_id           │       │ company_id               │
│ created_at           │       │ created_at               │
└──────────────────────┘       │ updated_at               │
                               └──────────────────────────┘

┌──────────────────────┐
│  referral_settings   │
├──────────────────────┤
│ id (PK)              │
│ company_id (UQ)      │
│ settings_json        │
│ created_at           │
│ updated_at           │
└──────────────────────┘
```

### Table: `customer_referrals`

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `id` | TEXT | PK | UUID |
| `customer_id` | TEXT | NOT NULL | Referred customer |
| `referred_by_id` | TEXT | NOT NULL | Referrer customer |
| `referred_by_name` | TEXT | NULLABLE | Denormalized referrer name |
| `referral_code` | TEXT | NOT NULL | 8-char alphanumeric, unique per company context |
| `status` | TEXT | NOT NULL, DEFAULT `'active'` | `active`, `converted`, `expired`, `cancelled` |
| `pending_invoice_id` | TEXT | NULLABLE | Invoice that triggered the referral |
| `pending_invoice_amount` | REAL | NULLABLE | Invoice amount |
| `converted_invoice_id` | TEXT | NULLABLE | Invoice that caused conversion |
| `converted_at` | TEXT | NULLABLE | ISO timestamp |
| `notes` | TEXT | NULLABLE |
| `company_id` | TEXT | NOT NULL, INDEXED |
| `created_at` | TEXT | NOT NULL, DEFAULT CURRENT_TIMESTAMP |
| `updated_at` | TEXT | NOT NULL, DEFAULT CURRENT_TIMESTAMP |

**Indexes:**
- `idx_customer_referrals_company_id` on `(company_id)`
- Implicit index on `referral_code` (queried in code)

### Table: `referral_rewards`

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `id` | TEXT | PK | UUID |
| `referral_id` | TEXT | NOT NULL | FK to `customer_referrals.id` |
| `customer_id` | TEXT | NOT NULL | Customer receiving the reward |
| `invoice_id` | TEXT | NOT NULL |
| `invoice_amount` | REAL | NOT NULL |
| `amount` | REAL | NOT NULL | Calculated reward amount |
| `status` | TEXT | NOT NULL, DEFAULT `'pending'` | `pending`, `approved`, `paid`, `cancelled` |
| `approved_by` | TEXT | NULLABLE |
| `approved_at` | TEXT | NULLABLE |
| `cancelled_by` | TEXT | NULLABLE |
| `cancel_reason` | TEXT | NULLABLE |
| `cancelled_at` | TEXT | NULLABLE |
| `wallet_transaction_id` | TEXT | NULLABLE |
| `company_id` | TEXT | NOT NULL, INDEXED |
| `created_at` | TEXT | NOT NULL |
| `updated_at` | TEXT | NOT NULL |

**Indexes:** `idx_referral_rewards_company_id` on `(company_id)`

### Table: `referral_timeline`

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `id` | TEXT | PK | UUID |
| `referral_id` | TEXT | NOT NULL |
| `event_type` | TEXT | NOT NULL | `created`, `reward_earned`, `reward_approved`, `reward_rejected`, `reward_reversed`, `referral_converted`, `referral_expired`, `referral_cancelled`, `campaign_applied`, `note_added` |
| `title` | TEXT | NOT NULL |
| `description` | TEXT | NULLABLE |
| `amount` | REAL | NULLABLE |
| `actor_id` | TEXT | NULLABLE |
| `actor_name` | TEXT | NULLABLE |
| `metadata_json` | TEXT | NULLABLE |
| `timestamp` | TEXT | NOT NULL |
| `company_id` | TEXT | NOT NULL, INDEXED |

**Indexes:** `idx_referral_timeline_company_id` on `(company_id)`

### Table: `referral_audit_logs`

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `id` | TEXT | PK | UUID |
| `entity_type` | TEXT | NOT NULL | `referral`, `reward`, `campaign`, `setting`, `reversal` |
| `entity_id` | TEXT | NOT NULL |
| `action` | TEXT | NOT NULL | `created`, `updated`, `cancelled`, `approved`, `rejected`, `reversed`, `expired`, `configured` |
| `actor_id` | TEXT | NOT NULL |
| `actor_name` | TEXT | NULLABLE |
| `field_name` | TEXT | NULLABLE |
| `old_value` | TEXT | NULLABLE |
| `new_value` | TEXT | NULLABLE |
| `reason` | TEXT | NULLABLE |
| `correlation_id` | TEXT | NULLABLE |
| `ip_address` | TEXT | NULLABLE |
| `user_agent` | TEXT | NULLABLE |
| `timestamp` | TEXT | NOT NULL |
| `company_id` | TEXT | NOT NULL, INDEXED |

**Indexes:** `idx_referral_audit_company_id` on `(company_id)`

### Table: `referral_campaigns`

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `id` | TEXT | PK | UUID |
| `name` | TEXT | NOT NULL |
| `description` | TEXT | NULLABLE |
| `start_date` | TEXT | NOT NULL |
| `end_date` | TEXT | NULLABLE |
| `status` | TEXT | NOT NULL, DEFAULT `'draft'` | `draft`, `active`, `paused`, `completed`, `cancelled` |
| `reward_type` | TEXT | NOT NULL | `fixed`, `percentage`, `hybrid` |
| `reward_value` | REAL | NOT NULL, DEFAULT 0 |
| `reward_percentage` | REAL | NOT NULL, DEFAULT 0 |
| `min_purchase_amount` | REAL | NOT NULL, DEFAULT 0 |
| `max_reward_amount` | REAL | NOT NULL, DEFAULT 0 |
| `max_rewards_per_customer` | INTEGER | NOT NULL, DEFAULT 0 |
| `max_total_rewards` | INTEGER | NOT NULL, DEFAULT 0 |
| `total_rewards_given` | INTEGER | NOT NULL, DEFAULT 0 |
| `target_segments_json` | TEXT | NULLABLE |
| `excluded_customers_json` | TEXT | NULLABLE |
| `bonus_multiplier` | REAL | NOT NULL, DEFAULT 1 |
| `terms_json` | TEXT | NULLABLE |
| `created_by` | TEXT | NULLABLE |
| `approved_by` | TEXT | NULLABLE |
| `company_id` | TEXT | NOT NULL, INDEXED |
| `created_at` | TEXT | NOT NULL |
| `updated_at` | TEXT | NOT NULL |

**Indexes:** `idx_referral_campaigns_company_id` on `(company_id)`

### Table: `referral_analytics`

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `id` | TEXT | PK | UUID |
| `period` | TEXT | NOT NULL | `daily`, `weekly`, `monthly`, `quarterly`, `yearly` |
| `period_start` | TEXT | NOT NULL |
| `period_end` | TEXT | NOT NULL |
| `total_referrals` | INTEGER | NOT NULL |
| `active_referrals` | INTEGER | NOT NULL |
| `converted_referrals` | INTEGER | NOT NULL |
| `total_rewards_amount` | REAL | NOT NULL |
| `approved_rewards_amount` | REAL | NOT NULL |
| `paid_rewards_amount` | REAL | NOT NULL |
| `pending_rewards_amount` | REAL | NOT NULL |
| `reversed_rewards_amount` | REAL | NOT NULL |
| `average_reward_amount` | REAL | NOT NULL |
| `conversion_rate` | REAL | NOT NULL |
| `revenue_attributed` | REAL | NOT NULL |
| `roi` | REAL | NOT NULL |
| `generated_at` | TEXT | NOT NULL |
| `company_id` | TEXT | NOT NULL, INDEXED |
| `created_at` | TEXT | NOT NULL |
| `updated_at` | TEXT | NOT NULL |

**Indexes:** `idx_referral_analytics_company_id` on `(company_id)`

### Table: `referral_reversals`

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `id` | TEXT | PK | UUID |
| `reward_id` | TEXT | NOT NULL |
| `reason` | TEXT | NOT NULL |
| `status` | TEXT | NOT NULL, DEFAULT `'pending'` | `pending`, `approved`, `rejected`, `completed` |
| `requested_by` | TEXT | NOT NULL |
| `requested_at` | TEXT | NULLABLE |
| `approved_by` | TEXT | NULLABLE |
| `approved_at` | TEXT | NULLABLE |
| `rejected_by` | TEXT | NULLABLE |
| `rejected_at` | TEXT | NULLABLE |
| `reject_reason` | TEXT | NULLABLE |
| `completed_at` | TEXT | NULLABLE |
| `notes` | TEXT | NULLABLE |
| `company_id` | TEXT | NOT NULL, INDEXED |
| `created_at` | TEXT | NOT NULL |
| `updated_at` | TEXT | NOT NULL |

**Indexes:** `idx_referral_reversals_company_id` on `(company_id)`

### Table: `referral_settings`

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `id` | TEXT | PK | UUID |
| `company_id` | TEXT | UNIQUE, NOT NULL |
| `settings_json` | TEXT | NOT NULL | JSON string of `ReferralSettings` |
| `created_at` | TEXT | NOT NULL |
| `updated_at` | TEXT | NOT NULL |

### Table: `referral_event_history`

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `id` | TEXT | PK | UUID |
| `event_type` | TEXT | NOT NULL |
| `source` | TEXT | NOT NULL |
| `entity_type` | TEXT | NOT NULL |
| `entity_id` | TEXT | NOT NULL |
| `data_json` | TEXT | NULLABLE |
| `correlation_id` | TEXT | NULLABLE |
| `actor_id` | TEXT | NULLABLE |
| `timestamp` | TEXT | NOT NULL |
| `processed` | INTEGER | NOT NULL, DEFAULT 0 |
| `processed_at` | TEXT | NULLABLE |
| `error` | TEXT | NULLABLE |
| `retry_count` | INTEGER | NOT NULL, DEFAULT 0 |
| `max_retries` | INTEGER | NOT NULL, DEFAULT 3 |
| `company_id` | TEXT | NOT NULL, INDEXED |
| `created_at` | TEXT | NOT NULL |
| `updated_at` | TEXT | NOT NULL |

**Indexes:** `idx_referral_events_company_id` on `(company_id)`

### Soft Delete
- `customer_referrals` table supports `deleted_at` column
- `DELETE /api/referrals/:id` sets `deleted_at` timestamp
- All queries filter out soft-deleted records (`deleted_at IS NULL`)

---

## API Endpoints

All endpoints are mounted at `/api/referrals`. Authentication is required on all endpoints.

### Referrals

| Method | Path | Auth | Roles | Request | Response | Error Codes |
|--------|------|------|-------|---------|----------|-------------|
| `GET` | `/` | JWT | Admin, Manager, Accountant, Clerk, Viewer | **Query:** `page`, `limit`, `status`, `search`, `customer_id`, `referred_by_id`, `referral_code`, `sort_by`, `sort_dir` | `{ referrals: [], total, page, limit, totalPages }` | 500 |
| `GET` | `/:id` | JWT | Admin, Manager, Accountant, Clerk, Viewer | **Param:** `id` | `Referral \| null` | 404, 500 |
| `POST` | `/` | JWT | Admin, Manager | **Body:** `{ customer_id, referred_by_id, referred_by_name?, notes?, pending_invoice_id?, pending_invoice_amount? }` | `Referral` (201) | 500, error message on self-referral |
| `PUT` | `/:id` | JWT | Admin, Manager | **Body:** `{ notes?, status?, pending_invoice_id?, pending_invoice_amount?, converted_invoice_id? }` | `Referral` | 404, 500 |
| `PATCH` | `/:id/cancel` | JWT | Admin, Manager | **Body:** `{ reason? }` | `Referral` | 404, 409 (already cancelled/expired), 500 |
| `PATCH` | `/:id/expire` | JWT | Admin, Manager | **Param:** `id` | `Referral` | 404, 409 (already expired), 500 |
| `GET` | `/:id/timeline` | JWT | Admin, Manager, Accountant, Clerk, Viewer | **Param:** `id` | `TimelineEntry[]` | 404, 500 |

### Rewards

| Method | Path | Auth | Roles | Request | Response | Error Codes |
|--------|------|------|-------|---------|----------|-------------|
| `GET` | `/rewards` | JWT | Admin, Manager, Accountant, Clerk, Viewer | **Query:** `page`, `limit`, `status`, `referral_id` | `{ rewards: [], total, page, limit, totalPages }` | 500 |
| `GET` | `/rewards/pending` | JWT | Admin, Manager, Accountant, Clerk, Viewer | — | `Reward[]` | 500 |
| `GET` | `/rewards/:id` | JWT | Admin, Manager, Accountant, Clerk, Viewer | **Param:** `id` | `Reward \| null` | 404, 500 |
| `POST` | `/rewards` | JWT | Admin, Manager | **Body:** `{ referral_id, invoice_id, invoice_amount, customer_id, amount? }` | `Reward` (201) | 500 (referral not found or not active) |
| `PATCH` | `/rewards/:id/approve` | JWT | Admin, Manager | **Body:** `{ approved_by }` | `Reward` | 404, 500 |
| `PATCH` | `/rewards/:id/reject` | JWT | Admin, Manager | **Body:** `{ reason, rejected_by? }` | `Reward` | 404, 500 |

### Campaigns

| Method | Path | Auth | Roles | Request | Response | Error Codes |
|--------|------|------|-------|---------|----------|-------------|
| `GET` | `/campaigns` | JWT | Admin, Manager, Accountant, Viewer | **Query:** `status` | `Campaign[]` | 500 |
| `POST` | `/campaigns` | JWT | Admin, Manager | **Body:** `{ name, description?, start_date, end_date?, reward_type?, reward_value?, reward_percentage?, min_purchase_amount?, max_reward_amount?, max_rewards_per_customer?, max_total_rewards?, bonus_multiplier?, target_segments_json?, excluded_customers_json?, terms_json? }` | `Campaign` (201) | 500 |
| `PUT` | `/campaigns/:id` | JWT | Admin, Manager | **Body:** Partial campaign fields | `Campaign` | 404, 500 |
| `PATCH` | `/campaigns/:id/status` | JWT | Admin, Manager | **Body:** `{ status }` (enum: draft/active/paused/completed/cancelled) | `Campaign` | 404, 500 |

### Reversals

| Method | Path | Auth | Roles | Request | Response | Error Codes |
|--------|------|------|-------|---------|----------|-------------|
| `GET` | `/reversals` | JWT | Admin, Manager, Accountant, Viewer | **Query:** `page`, `limit`, `status` | `{ reversals: [], total, page, limit, totalPages }` | 500 |
| `POST` | `/reversals` | JWT | Admin, Manager | **Body:** `{ reward_id, reason, notes? }` | `Reversal` (201) | 500 |
| `PATCH` | `/reversals/:id/approve` | JWT | Admin, Manager | **Body:** `{ approved_by, notes? }` | `Reversal` | 404, 500 |
| `PATCH` | `/reversals/:id/reject` | JWT | Admin, Manager | **Body:** `{ reason, rejected_by?, notes? }` | `Reversal` | 404, 500 |

### Analytics

| Method | Path | Auth | Roles | Request | Response | Error Codes |
|--------|------|------|-------|---------|----------|-------------|
| `GET` | `/analytics` | JWT | Admin, Manager, Accountant, Viewer | **Query:** `period?`, `period_start?`, `period_end?` | `Analytics` | 500 |
| `GET` | `/analytics/history` | JWT | Admin, Manager, Accountant, Viewer | **Query:** `period?`, `period_start?`, `period_end?` | `Analytics[]` | 500 |

### Audit

| Method | Path | Auth | Roles | Request | Response | Error Codes |
|--------|------|------|-------|---------|----------|-------------|
| `GET` | `/audit` | JWT | Admin, Manager, Auditor | **Query:** `page`, `limit`, `entity_type`, `entity_id` | `{ auditLogs: [], total, page, limit, totalPages }` | 500 |

### Settings

| Method | Path | Auth | Roles | Request | Response | Error Codes |
|--------|------|------|-------|---------|----------|-------------|
| `GET` | `/settings` | JWT | Admin, Manager, Viewer | — | `ReferralSettings` | 500 |
| `PUT` | `/settings` | JWT | Admin, Manager | **Body:** `{ settings: { ... } }` | `ReferralSettings` | 500 |

### Export Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | /api/referrals/export/referrals | Admin, Manager, Accountant, Viewer | Export referrals as CSV |
| GET | /api/referrals/export/rewards | Admin, Manager, Accountant, Viewer | Export rewards as CSV |
| GET | /api/referrals/export/analytics | Admin, Manager, Accountant, Viewer | Export analytics as CSV |

### Maintenance Operations

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| DELETE | /api/referrals/:id | Admin, Manager | Soft-delete a referral |
| POST | /api/referrals/audit/cleanup | Admin | Delete audit logs older than N days (default 90) |

---

## Service Layer

### `ReferralService` (`backend/services/referralService.cjs`)

Extends `BaseService`. All public methods:

```js
class ReferralService extends BaseService {
  // ── Transaction Helper ──
  async _transaction(callback)

  // ── Pagination ──
  getPaginationParams(params)  // → { page, limit, offset }

  // ── Referral CRUD ──
  async getAll(params, companyId)               // Paginated list with filters
  async getById(id, companyId)                   // Single referral
  async register(data, companyId)                // Create referral (transactional)
  async update(id, data, companyId)              // Update allowed fields
  async cancel(id, actorId, actorName, reason, companyId)    // Cancel (transactional)
  async expire(id, companyId)                    // Expire (transactional)
  async generateReferralCode()                   // 8-char alphanumeric, uniqueness check

  // ── Rewards ──
  async getAllRewards(params, companyId)         // Paginated list
  async getPendingRewards(companyId)             // All pending rewards
  async getRewardById(id, companyId)
  async createReward(data, companyId)            // Transactional, auto-calculates amount
  async approveReward(id, approvedBy, companyId) // Transactional, credits wallet
  async rejectReward(id, reason, rejectedBy, companyId)  // Transactional

  // ── Timeline ──
  async getTimeline(referralId, companyId)
  async addTimelineEntry({ referralId, eventType, title, description, amount, actorId, actorName, metadata, companyId })

  // ── Audit ──
  async getAuditLogs(params, companyId)          // Paginated
  async addAuditLog(data)

  // ── Campaigns ──
  async getAllCampaigns(params, companyId)
  async getActiveCampaign(companyId)
  async createCampaign(data, companyId)
  async updateCampaign(id, data, companyId)
  async updateCampaignStatus(id, status, companyId)

  // ── Reversals ──
  async getAllReversals(params, companyId)       // Paginated
  async createReversal(data, companyId)          // Transactional
  async approveReversal(id, approvedBy, notes, companyId)  // Transactional
  async rejectReversal(id, reason, rejectedBy, notes, companyId)

  // ── Analytics ──
  async getAnalytics(params, companyId)          // Auto-generates if missing
  async getAnalyticsHistory(params, companyId)
  async generateAnalytics(period, periodStart, periodEnd, companyId)  // Computes & stores

  // ── Settings ──
  async getSettings(companyId)                   // Returns defaults if none stored
  async updateSettings(companyId, settings)

  // ── Internal ──
  async creditWalletForReward(reward, referral, companyId)  // Wallet + ledger entries
}
```

### Transaction Safety

The service overrides `BaseService._transaction` to use raw SQLite `BEGIN TRANSACTION` / `COMMIT` / `ROLLBACK`. The following operations are transactional:
- `register` — creates referral + timeline entry + audit log
- `cancel` — updates status + timeline + audit log
- `expire` — updates status + timeline
- `createReward` — validates referral + inserts reward + timeline + audit log
- `approveReward` — updates reward + converts referral + credits wallet + timeline + audit log
- `rejectReward` — updates reward + timeline + audit log
- `createReversal` — inserts reversal + audit log
- `approveReversal` — approves reversal + completes it + adds timeline + audit log

### Business Rules

| Rule | Implementation | Location |
|------|---------------|----------|
| **Self-referral prevention** | `if (data.customer_id === data.referred_by_id) throw Error` | `register()` L116-118 |
| **Minimum purchase check** | `if (minPurchaseAmount > 0 && invoiceAmount < minPurchaseAmount) throw Error` | `createReward()` L312-314 |
| **Reward calculation** | Fixed: `rewardValue`; Percentage: `invoiceAmount × rewardPercentage / 100`; Capped by `maxRewardAmount` | `createReward()` L299-310 |
| **Reward capping** | `if (maxRewardAmount > 0 && amount > maxRewardAmount) amount = maxRewardAmount` | `createReward()` L306-308 |
| **Cannot cancel/expire if already cancelled/expired** | `if (existing.status !== 'active') throw Error` | `cancel()` L185, `expire()` L223 |
| **Cannot approve/reject non-pending reward** | `if (reward.status !== 'pending') throw Error` | `approveReward()` L350, `rejectReward()` L400 |
| **Cannot approve/reject non-pending reversal** | `if (reversal.status !== 'pending') throw Error` | `approveReversal()` L682, `rejectReversal()` L732 |
| **Wallet credit on reward approval** | `creditWalletForReward()` creates ledger entry + updates customer walletBalance | `approveReward()` L367-369 |
| **Duplicate reversal prevention** | (Client-side only) | frontend `referralReversalService.ts` L43-44 |
| **Referral code uniqueness** | Generates random 8-char code, checks DB, retries up to 10 times | `generateReferralCode()` L25-50 |

---

## Frontend Integration

### `referralApiClient.ts`

The API client is a thin wrapper around `fetch()` that:
- Prefixes all URLs with `${BASE_URL}/api/referrals`
- Adds `Content-Type: application/json` header automatically
- Reads `x-user-id` from `sessionStorage('nexus_user')` and `x-company-id` from `localStorage('nexus_company_config')`
- Appends query params (skipping `undefined`/`null`/empty values)
- Throws `Error` with server error message on non-OK responses

**snake_case → camelCase Transformation:**

The `transformKeys` function recursively traverses all response objects and converts snake_case keys to camelCase using a combination of:
1. An explicit mapping table for known keys (e.g., `created_at` → `date`, `referred_by_id` → `referredById`)
2. A generic regex fallback: `str.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase())`

This means all frontend code works with camelCase properties while the API speaks snake_case.

### `referralService.ts`

Frontend service that wraps `referralApiClient` with additional business logic:

| Method | Description |
|--------|-------------|
| `registerReferral(customerId, referredById, referredByName?)` | Registers via API |
| `registerReferralFromInvoice(invoice)` | Auto-registers from invoice data; returns `null` if self-referral or disabled |
| `getReferralsByCustomer(customerId)` | Filters by customer |
| `getReferralsByReferrer(referredById)` | Filters by referrer |
| `getReferralByCode(code)` | Looks up by code + active status |
| `getAllReferrals(params?)` | Paginated list |
| `processInvoiceReward(invoice)` | Full flow: finds/creates referral → creates reward |
| `checkAndExpireReferrals()` | Client-side expiry check against settings |
| `getAnalytics(params)`, `getAnalyticsHistory(params)` | Analytics delegation |
| `getAllCampaigns`, `createCampaign`, `updateCampaign`, `updateCampaignStatus` | Campaign delegation |
| `getAllReversals`, `createReversal`, `approveReversal`, `rejectReversal` | Reversal delegation |
| `getSettings`, `updateSettings` | Settings delegation |
| `getAuditLogs(params)` | Audit delegation |

### Supporting Services

| Service | Role |
|---------|------|
| `referralCampaignService.ts` | Client-side campaign CRUD + `getApplicableCampaign(invoiceCustomerId, paidAmount)` for campaign matching |
| `referralAnalyticsService.ts` | Client-side analytics computation from local data |
| `referralTimelineService.ts` | Client-side timeline storage via cloudDb |
| `referralReversalService.ts` | Client-side reversal lifecycle with wallet/ledger adjustments |
| `referralAuditService.ts` | Client-side audit entry creation |
| `referralRuleEngine.ts` | `evaluateEligibility`, `calculateReward`, `evaluateApprovalRequirement`, `evaluateExpiry` |
| `referralEventBus.ts` | In-memory event emitter with history (max 500 events) |
| `referralNotificationService.ts` | Subscribes to events and pushes notifications |

### Reward Calculation Formulas (Rule Engine)

```
Fixed:       rewardAmount = rewardValue × campaignMultiplier
Percentage:  rewardAmount = paidAmount × (rewardPercentage / 100) × campaignMultiplier
Hybrid:      rewardAmount = (rewardValue + paidAmount × (rewardPercentage / 100)) × campaignMultiplier
Capped:      rewardAmount = min(rewardAmount, maxRewardAmount, campaignMaxRewardAmount)
```

---

## Security

### JWT Authentication

- **Middleware:** `verifyToken` in `backend/middleware/auth.cjs`
- **Token:** JWT with 8-hour expiration, signed with `JWT_SECRET` env variable
- **Header:** `Authorization: Bearer <token>`
- **Fallback:** Header-based auth (`x-user-id`, `x-user-role`, etc.) is allowed **only** when `ALLOW_HEADER_AUTH=true` and request originates from loopback address
- **JWT Payload:** `{ id, username, role, email, company_id, companies? }`

### Role-Based Authorization

The `requireRole(...roles)` middleware (used on every route) checks `req.user.role` against the allowed roles. Role hierarchy used by referral routes:

| Route Group | Allowed Roles |
|-------------|---------------|
| Referral GET | Admin, Manager, Accountant, Clerk, Viewer |
| Referral POST/PUT/PATCH | Admin, Manager |
| Rewards GET | Admin, Manager, Accountant, Clerk, Viewer |
| Rewards POST/PATCH | Admin, Manager |
| Campaigns GET | Admin, Manager, Accountant, Viewer |
| Campaigns POST/PUT/PATCH | Admin, Manager |
| Reversals GET | Admin, Manager, Accountant, Viewer |
| Reversals POST/PATCH | Admin, Manager |
| Analytics | Admin, Manager, Accountant, Viewer |
| Audit | Admin, Manager, Auditor |
| Settings GET | Admin, Manager, Viewer |
| Settings PUT | Admin, Manager |

### Company Isolation

All queries in `ReferralService` include `WHERE company_id = ?` as the first condition. The `companyId` is extracted from `req.companyId` (set by earlier middleware from JWT or header). This ensures complete data isolation between companies.

### Input Validation (Zod)

Every `POST`, `PUT`, and `PATCH` route uses `validateBody(referralSchemas.xxx)` middleware. Every `GET` route with query params uses `validateQuery(referralSchemas.xxx)`. Schemas are defined in `backend/middleware/validation.cjs:560-661`.

Validation includes:
- String min lengths and required checks
- Number bounds (`min(0)`, `max(100)` for percentages)
- Enum constraining (`status`, `reward_type`, `period`)
- Coercion for query params (`z.coerce.number()`)
- Default values
- Nullable optionals

### SQL Injection Prevention

All database queries use parameterized statements (`?` placeholders) via `this._run(sql, params)`, `this._get(sql, params)`, and `this._all(sql, params)`. No string concatenation of user input into SQL.

The one exception is dynamic column names in `ORDER BY` clauses, which are validated against an allowlist:
```js
const allowedSorts = ['created_at', 'updated_at', 'status', 'customer_id', 'referred_by_name'];
const safeSort = allowedSorts.includes(sortBy) ? sortBy : 'created_at';
```

### Idempotency
- Idempotency-Key header support via `backend/middleware/idempotency.cjs`
- Applied to: POST /rewards, PATCH /rewards/:id/approve, PATCH /rewards/:id/reject, PATCH /reversals/:id/approve, POST /
- Keys stored in `idempotency_keys` table with 24h TTL
- Returns cached response for duplicate requests
- Race-condition safe with unique constraint

### Rate Limiting
- Referral creation: 10 requests/minute per IP
- Reward creation: 20 requests/minute per IP
- Uses `backend/middleware/rateLimiter.cjs` in-memory store

---

## Performance

### Pagination

All list endpoints support `page` and `limit` query parameters:
- `page`: default 1, minimum 1
- `limit`: default 20, minimum 1, maximum 100
- `offset = (page - 1) * limit`
- Response includes `total`, `page`, `limit`, `totalPages` for UI pagination

### Indexes

Each table has an index on `company_id` for multi-tenant filtering. Key composite patterns:

| Query Pattern | Indexed? | Notes |
|---------------|----------|-------|
| `WHERE company_id = ?` | Yes | Single-column index on all tables |
| `WHERE company_id = ? AND status = ?` | Partial | `company_id` is indexed, Post-filter on status |
| `ORDER BY created_at DESC` | No index | Full scan + sort (acceptable for moderate data volumes) |

### Query Optimization Notes

- `COUNT(*)` is run separately from the data query for accurate pagination totals
- Analytics generation uses aggregate queries (SUM, COUNT, AVG) rather than loading all records into memory
- The `getActiveCampaign` method limits to `ORDER BY ... LIMIT 1`
- Timeline and audit queries use `ORDER BY timestamp DESC`
- Allowed sort columns are whitelisted to prevent expensive sorts on unindexed columns

---

## Testing

### Backend Tests
```bash
node backend/tests/referral.test.cjs
```
105 tests covering all ReferralService methods — all passing.

### Frontend Tests
```bash
cd frontend && npx vitest run tests/views/Referrals.test.tsx
```
5 tests covering: render, header display, KPI cards, tab buttons, default tab — all passing.

### Test Coverage
| Area | Backend Tests | Frontend Tests |
|------|---------------|----------------|
| Referral CRUD | 37 | - |
| Reward Management | 23 | - |
| Reversals | 8 | - |
| Analytics | 12 | - |
| Settings | 15 | - |
| Edge cases & errors | 10 | - |
| Component rendering | - | 5 |
| **Total** | **105** | **5** |

---

## Configuration

### ReferralSettings Defaults

Defined in `frontend/types/referral.ts:56-68` and also hardcoded in `backend/services/referralService.cjs:847-859`:

```typescript
const DEFAULT_REFERRAL_SETTINGS: ReferralSettings = {
  enabled: true,
  rewardType: 'percentage',
  rewardValue: 0,
  rewardPercentage: 5,
  minPurchaseAmount: 0,
  maxRewardAmount: 0,
  requireApproval: true,
  autoApproveThreshold: 100,
  selfReferralPrevention: true,
  expiryDays: 365,
  allowMultipleRewards: true,
};
```

### Reward Calculation Formulas (Backend)

In `createReward()` at `backend/services/referralService.cjs:299-310`:

```
if rewardType === 'fixed':
    amount = rewardValue
else (percentage):
    amount = invoiceAmount × (rewardPercentage / 100)

if maxRewardAmount > 0 AND amount > maxRewardAmount:
    amount = maxRewardAmount

amount = round(amount × 100) / 100   // 2 decimal places
```

### Frontend Rule Engine Formulas

In `frontend/services/referralRuleEngine.ts:108-158`:

```
if rewardType === 'fixed':
    amount = rewardValue × multiplier
if rewardType === 'percentage':
    amount = paidAmount × (rewardPercentage / 100) × multiplier
if rewardType === 'hybrid':
    amount = (rewardValue + paidAmount × (rewardPercentage / 100)) × multiplier

Apply caps (settings.maxRewardAmount, campaign.maxRewardAmount)
```

### Auto-Expire Scheduled Function (PostgreSQL)

Defined in `database/supabase-referral-tables-v2.sql:72-114`:

```sql
CREATE OR REPLACE FUNCTION expire_referrals()
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    expired_count INTEGER := 0;
    rec RECORD;
BEGIN
    FOR rec IN
        SELECT id, company_id FROM customer_referrals
        WHERE data->>'status' = 'active'
        AND created_at + (COALESCE(
            (SELECT (data->>'expiryDays')::int
             FROM company_config c
             WHERE c.id = customer_referrals.company_id
             AND data ? 'referralSettings'),
             365
        ) || ' days')::INTERVAL <= NOW()
    LOOP
        UPDATE customer_referrals
        SET data = jsonb_set(COALESCE(data, '{}'), '{status}', '"expired"'),
            updated_at = NOW()
        WHERE id = rec.id;

        INSERT INTO referral_timeline (id, data, company_id)
        VALUES (gen_random_uuid()::text, jsonb_build_object(
            'referral_id', rec.id,
            'event_type', 'referral_expired',
            'title', 'Referral expired',
            'description', 'Referral automatically expired by scheduled job',
            'timestamp', NOW()::text
        ), rec.company_id);
    END LOOP;
    RETURN expired_count;
END;
$$;
```

### Analytics Generation Function (PostgreSQL)

Defined in `database/supabase-referral-tables-v2.sql:116-192`:

```sql
CREATE OR REPLACE FUNCTION generate_referral_analytics(
    p_period TEXT, p_start_date DATE, p_end_date DATE, p_company_id TEXT DEFAULT NULL
) RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER AS $$
-- Generates analytics snapshot with:
-- total_referrals, active_referrals, converted_referrals
-- total_rewards_amount, approved_rewards_amount, paid_rewards_amount
-- pending_rewards_amount, reversed_rewards_amount, average_reward_amount
-- conversion_rate, revenue_attributed, roi
-- Returns the analytics record ID
$$;
```

### Analytics Formulas (Backend Service)

In `generateAnalytics()` at `backend/services/referralService.cjs:780-836`:

```
conversionRate = convertedCount / totalCount × 100   (if totalCount > 0, else 0)
revenueAttributed = SUM(invoice_amount) where status IN ('approved', 'paid')
roi = (revenue - totalRewardsAmount) / totalRewardsAmount   (if totalRewardsAmount > 0, else 0)
```
