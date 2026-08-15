# CEP Blueprint — Customer Engagement Platform

## 1. Architecture Overview

### 1.1 Guiding Principle

Build ONE `CustomerEngagementEngine`. Every engagement feature (Loyalty, Cashback, Membership, Gift Cards, Affiliate, Promotions, Rewards) is a **plugin** registered with the engine. The engine delegates to the existing Rule Engine, Event Bus, Timeline, Audit, Wallet, Campaign Engine, Analytics, and Notifications.

```
Purchase/Sale/Event
    │
    ▼
┌──────────────────────────────────────────────────────────┐
│             CustomerEngagementEngine                      │
│                                                          │
│  1. Receive event (InvoicePaid, CustomerCreated, etc.)    │
│  2. Evaluate all registered engagement plugins            │
│  3. For each plugin, check eligibility via RuleEngine     │
│  4. Calculate reward/points/cashback via RuleEngine       │
│  5. Apply via Wallet/Points/Membership/Tier changes       │
│  6. Add Timeline entries                                  │
│  7. Log Audit entries                                     │
│  8. Emit Engagement events via EventBus                    │
│  9. Trigger Notifications                                 │
└──────────────────────────────────────────────────────────┘
    │
    ├──→ Plugin: Loyalty (earns/redeems points)
    ├──→ Plugin: Cashback (credits wallet)
    ├──→ Plugin: Membership (evaluates tier changes)
    ├──→ Plugin: GiftCards (activates/tracks usage)
    ├──→ Plugin: Affiliate (extends referral with commissions)
    ├──→ Plugin: Promotions (applies discounts)
    └──→ Plugin: Rewards (grants milestone/birthday/etc.)
```

### 1.2 Existing Architecture to Reuse

| Component | Use |
|-----------|-----|
| `referralRuleEngine` | Extend with `engagement_rule` type registry |
| `referralEventBus` | Add new event types (no structural changes needed) |
| `referralTimelineService` | Generalize into `engagementTimelineService` |
| `referralAuditService` | Generalize into `engagementAuditService` |
| `referralAnalyticsService` | Extend with new metric calculators |
| `referralCampaignService` | Already generic — reusable as-is |
| `referralReversalService` | Generalize to support all reward types |
| `walletTransactions` + `customers.walletBalance` | Cashback, GiftCard, Reward payouts |
| `notificationService.notify()` | All engagement event notifications |
| `AuthContext.addAuditLog()` | System-level audit trail |
| `dbService.executeAtomicOperation()` | All reward/point/balance changes |
| `idempotencyKeys` | Prevent duplicate rewards |
| `CompanyConfig.referralSettings` | Add `engagementSettings` alongside it |
| `CustomerWorkspace` | Add Engagement tab |
| `Settings.tsx` | Add Engagement settings section |
| `ReportService` | Add engagement data sources |
| `transactionService.ts` | Fire engagement events on sale/payment |
| `Dexie schema-types.ts` | Add new store definitions |
| `db.ts NexusDB` | Add new store types |
| `cloudDb.ts` | Add new Supabase table mappings |
| Supabase migration pattern | Follow `supabase-referral-tables-v2.sql` |

### 1.3 New Event Types (EventBus)

```
customer.created
invoice.paid
payment.received
wallet.credited
wallet.debited
points.earned
points.redeemed
points.expired
points.adjusted
tier.changed
tier.benefit.activated
cashback.issued
cashback.approved
cashback.reversed
reward.granted
reward.milestone
giftcard.created
giftcard.activated
giftcard.redeemed
giftcard.expired
giftcard.recharged
giftcard.cancelled
affiliate.commission.earned
affiliate.commission.approved
affiliate.commission.paid
promotion.applied
promotion.expired
engagement.rule.evaluated
```

---

## 2. Database Changes

### 2.1 New Tables (Supabase + Dexie)

All tables follow the existing pattern: UUID PK, created_at/updated_at, company_id, RLS.

#### `engagement_points` (Loyalty Points Ledger)
```
id              TEXT PK
customer_id     TEXT NOT NULL FK -> customers
points          NUMERIC(15,2) NOT NULL
balance_after   NUMERIC(15,2) NOT NULL
type            TEXT NOT NULL CHECK(earned|redeemed|expired|adjusted|bonus|reversed)
reference_type  TEXT (invoice|reward|cashback|campaign|adjustment|expiry)
reference_id    TEXT
description     TEXT
campaign_id     TEXT FK -> referral_campaigns
tier_multiplier NUMERIC(5,2) DEFAULT 1.00
expires_at      TIMESTAMPTZ
redeemed_at     TIMESTAMPTZ
created_by      TEXT
company_id      TEXT FK -> company_config
created_at      TIMESTAMPTZ DEFAULT NOW()
updated_at      TIMESTAMPTZ DEFAULT NOW()
INDEX: (customer_id, created_at), (type, created_at), (expires_at), (reference_type, reference_id), company_id
```

#### `engagement_point_balances` (Current + Expiring Balances)
```
id              TEXT PK
customer_id     TEXT NOT NULL FK -> customers UNIQUE
total_earned    NUMERIC(15,2) DEFAULT 0
total_redeemed  NUMERIC(15,2) DEFAULT 0
current_balance NUMERIC(15,2) DEFAULT 0
pending_expiry  NUMERIC(15,2) DEFAULT 0
expires_at      TIMESTAMPTZ
last_updated    TIMESTAMPTZ
company_id      TEXT FK -> company_config
INDEX: customer_id, company_id
```

#### `engagement_cashback` (Cashback Records)
```
id              TEXT PK
customer_id     TEXT NOT NULL FK -> customers
invoice_id      TEXT FK -> invoices
amount          NUMERIC(15,2) NOT NULL
rate            NUMERIC(5,2) NOT NULL       -- percentage used
type            TEXT NOT NULL CHECK(percentage|fixed|category|campaign|scheduled)
status          TEXT NOT NULL DEFAULT 'pending' CHECK(pending|approved|paid|reversed|expired)
category        TEXT                        -- for category-based cashback
campaign_id     TEXT FK -> referral_campaigns
wallet_tx_id    TEXT FK -> wallet_transactions
scheduled_at    TIMESTAMPTZ                 -- for delayed cashback
approved_at     TIMESTAMPTZ
approved_by     TEXT
reversed_at     TIMESTAMPTZ
reversed_by     TEXT
reverse_reason  TEXT
expires_at      TIMESTAMPTZ
notes           TEXT
company_id      TEXT FK -> company_config
created_at      TIMESTAMPTZ DEFAULT NOW()
updated_at      TIMESTAMPTZ DEFAULT NOW()
INDEX: customer_id, status, campaign_id, invoice_id, company_id
```

#### `engagement_membership_tiers` (Tier Definitions)
```
id              TEXT PK
name            TEXT NOT NULL
level           INTEGER NOT NULL UNIQUE     -- 1=Bronze, 2=Silver, etc.
description     TEXT
color           TEXT                        -- hex color for UI
icon            TEXT
min_spend       NUMERIC(15,2) DEFAULT 0     -- annual min spend to maintain
entry_spend     NUMERIC(15,2) DEFAULT 0     -- spend needed to enter
min_frequency   INTEGER DEFAULT 0           -- min purchases per year
min_clv         NUMERIC(15,2) DEFAULT 0     -- min customer lifetime value
point_multiplier NUMERIC(5,2) DEFAULT 1.00  -- loyalty points multiplier
cashback_rate   NUMERIC(5,2) DEFAULT 0      -- bonus cashback rate
priority_support BOOLEAN DEFAULT FALSE
exclusive_pricing BOOLEAN DEFAULT FALSE
exclusive_campaigns BOOLEAN DEFAULT FALSE
free_shipping   BOOLEAN DEFAULT FALSE
birthday_reward NUMERIC(15,2) DEFAULT 0     -- birthday reward amount
annual_reward   NUMERIC(15,2) DEFAULT 0     -- annual loyalty reward
benefits        JSONB DEFAULT '{}'           -- extensible benefits
status          TEXT NOT NULL DEFAULT 'active' CHECK(active|inactive)
company_id      TEXT FK -> company_config
created_at      TIMESTAMPTZ DEFAULT NOW()
updated_at      TIMESTAMPTZ DEFAULT NOW()
INDEX: level, status, company_id
```

#### `engagement_customer_tiers` (Customer-Tier Assignments)
```
id              TEXT PK
customer_id     TEXT NOT NULL FK -> customers
tier_id         TEXT NOT NULL FK -> engagement_membership_tiers
assigned_at     TIMESTAMPTZ DEFAULT NOW()
period_start    DATE NOT NULL               -- evaluation period start
period_spend    NUMERIC(15,2) DEFAULT 0     -- spend in current period
period_count    INTEGER DEFAULT 0           -- purchases in current period
upgraded_at     TIMESTAMPTZ
downgraded_at   TIMESTAMPTZ
last_evaluated  TIMESTAMPTZ
expires_at      TIMESTAMPTZ                 -- tier expiry
status          TEXT DEFAULT 'active' CHECK(active|expired|suspended)
notes           TEXT
company_id      TEXT FK -> company_config
created_at      TIMESTAMPTZ DEFAULT NOW()
updated_at      TIMESTAMPTZ DEFAULT NOW()
UNIQUE(customer_id, tier_id)
INDEX: customer_id, tier_id, status, company_id
```

#### `engagement_gift_cards` (Gift Cards)
```
id              TEXT PK
code            TEXT NOT NULL UNIQUE
pin             TEXT                        -- security PIN
customer_id     TEXT FK -> customers        -- owner
issuer_id       TEXT                        -- who created/issued
initial_balance NUMERIC(15,2) NOT NULL
current_balance NUMERIC(15,2) NOT NULL
status          TEXT NOT NULL DEFAULT 'active' CHECK(active|inactive|expired|cancelled|redeemed)
type            TEXT NOT NULL DEFAULT 'digital' CHECK(digital|physical|rechargeable)
expires_at      TIMESTAMPTZ
activated_at    TIMESTAMPTZ
cancelled_at    TIMESTAMPTZ
cancel_reason   TEXT
rechargeable    BOOLEAN DEFAULT FALSE
transferable    BOOLEAN DEFAULT FALSE
barcode_data    TEXT                        -- barcode/QR code content
design_color    TEXT
gift_message    TEXT
purchased_with  TEXT                        -- invoice or order reference
company_id      TEXT FK -> company_config
created_at      TIMESTAMPTZ DEFAULT NOW()
updated_at      TIMESTAMPTZ DEFAULT NOW()
INDEX: code, customer_id, status, expires_at, company_id
```

#### `engagement_gift_card_transactions` (Gift Card Usage)
```
id              TEXT PK
gift_card_id    TEXT NOT NULL FK -> engagement_gift_cards
type            TEXT NOT NULL CHECK(issued|redeemed|recharged|transferred|cancelled|expired)
amount          NUMERIC(15,2) NOT NULL
balance_after   NUMERIC(15,2) NOT NULL
reference_type  TEXT (invoice|recharge|transfer)
reference_id    TEXT
customer_id     TEXT FK -> customers
description     TEXT
company_id      TEXT FK -> company_config
created_at      TIMESTAMPTZ DEFAULT NOW()
INDEX: gift_card_id, type, reference_type, company_id
```

#### `engagement_affiliates` (Affiliate Accounts)
```
id              TEXT PK
customer_id     TEXT NOT NULL UNIQUE FK -> customers
referral_code   TEXT NOT NULL UNIQUE        -- reuses referral code pattern
status          TEXT DEFAULT 'active' CHECK(active|suspended|cancelled)
commission_rate NUMERIC(5,2) DEFAULT 5.00   -- default commission %
commission_type TEXT DEFAULT 'percentage' CHECK(percentage|fixed)
fixed_commission NUMERIC(15,2) DEFAULT 0
tier_id         TEXT                        -- affiliate tier (future)
payment_method  TEXT DEFAULT 'wallet' CHECK(wallet|bank|other)
payment_details JSONB
total_earned    NUMERIC(15,2) DEFAULT 0
total_paid      NUMERIC(15,2) DEFAULT 0
approved_at     TIMESTAMPTZ
approved_by     TEXT
notes           TEXT
company_id      TEXT FK -> company_config
created_at      TIMESTAMPTZ DEFAULT NOW()
updated_at      TIMESTAMPTZ DEFAULT NOW()
INDEX: customer_id, referral_code, status, company_id
```

#### `engagement_affiliate_commissions` (Commission Records)
```
id              TEXT PK
affiliate_id    TEXT NOT NULL FK -> engagement_affiliates
referral_id     TEXT FK -> customer_referrals
invoice_id      TEXT FK -> invoices
customer_id     TEXT NOT NULL FK -> customers  -- referred customer
amount          NUMERIC(15,2) NOT NULL
rate            NUMERIC(5,2) NOT NULL
status          TEXT NOT NULL DEFAULT 'pending' CHECK(pending|approved|paid|reversed|cancelled)
approved_at     TIMESTAMPTZ
approved_by     TEXT
paid_at         TIMESTAMPTZ
wallet_tx_id    TEXT FK -> wallet_transactions
reversed_at     TIMESTAMPTZ
reverse_reason  TEXT
notes           TEXT
company_id      TEXT FK -> company_config
created_at      TIMESTAMPTZ DEFAULT NOW()
updated_at      TIMESTAMPTZ DEFAULT NOW()
INDEX: affiliate_id, status, invoice_id, customer_id, company_id
```

#### `engagement_promotions` (Promotional Discounts)
```
id              TEXT PK
name            TEXT NOT NULL
description     TEXT
type            TEXT NOT NULL CHECK(percentage|fixed|category|brand|bundle|buy_x_get_y|tier|campaign|coupon)
value           NUMERIC(15,2) NOT NULL      -- discount amount or %
category_id     TEXT                        -- for category discounts
brand           TEXT                        -- for brand discounts
bundle_items    JSONB                       -- for bundle promotions
buy_x_qty       INTEGER                     -- buy X get Y
get_y_qty       INTEGER
get_y_discount  NUMERIC(5,2) DEFAULT 100   -- % off Y item (100 = free)
min_purchase    NUMERIC(15,2) DEFAULT 0
max_discount    NUMERIC(15,2) DEFAULT 0     -- 0 = unlimited
max_uses        INTEGER DEFAULT 0           -- 0 = unlimited
current_uses    INTEGER DEFAULT 0
customer_ids    JSONB DEFAULT '[]'          -- specific customer eligibility
tier_ids        JSONB DEFAULT '[]'          -- tier-level eligibility
campaign_id     TEXT FK -> referral_campaigns
stacking_rule   TEXT DEFAULT 'best_only' CHECK(best_only|stackable|exclusive)
priority        INTEGER DEFAULT 0           -- higher = evaluated first
starts_at       TIMESTAMPTZ NOT NULL
expires_at      TIMESTAMPTZ
status          TEXT DEFAULT 'draft' CHECK(draft|active|paused|expired|cancelled)
created_by      TEXT
company_id      TEXT FK -> company_config
created_at      TIMESTAMPTZ DEFAULT NOW()
updated_at      TIMESTAMPTZ DEFAULT NOW()
INDEX: status, type, (starts_at, expires_at), campaign_id, company_id
```

#### `engagement_customer_rewards` (Rewards - Milestone/Birthday/etc.)
```
id              TEXT PK
customer_id     TEXT NOT NULL FK -> customers
type            TEXT NOT NULL CHECK(milestone|birthday|anniversary|purchase|tier|campaign|holiday|manual|gift|point)
status          TEXT NOT NULL DEFAULT 'pending' CHECK(pending|approved|granted|rejected|cancelled|expired)
reward_type     TEXT NOT NULL CHECK(points|wallet_credit|gift_card|discount|product|tier_benefit|custom)
reward_value    NUMERIC(15,2) NOT NULL
reward_data     JSONB                       -- flexible payload
description     TEXT
milestone_key   TEXT                        -- e.g. 'first_purchase', '10th_purchase', 'spend_1000'
tier_id         TEXT FK -> engagement_membership_tiers
campaign_id     TEXT FK -> referral_campaigns
invoice_id      TEXT FK -> invoices
points_tx_id    TEXT FK -> engagement_points
wallet_tx_id    TEXT FK -> wallet_transactions
gift_card_id    TEXT FK -> engagement_gift_cards
granted_at      TIMESTAMPTZ
granted_by      TEXT
approved_at     TIMESTAMPTZ
approved_by     TEXT
rejected_at     TIMESTAMPTZ
reject_reason   TEXT
expires_at      TIMESTAMPTZ
company_id      TEXT FK -> company_config
created_at      TIMESTAMPTZ DEFAULT NOW()
updated_at      TIMESTAMPTZ DEFAULT NOW()
INDEX: customer_id, type, status, campaign_id, milestone_key, company_id
```

#### `engagement_timeline` (Unified Engagement Timeline)
```
id              TEXT PK
customer_id     TEXT NOT NULL FK -> customers
event_type      TEXT NOT NULL
title           TEXT NOT NULL
description     TEXT
amount          NUMERIC(15,2)
points          NUMERIC(15,2)
tier_name       TEXT
reference_type  TEXT (referral|reward|cashback|point|tier|giftcard|affiliate|promotion|purchase|wallet)
reference_id    TEXT
metadata        JSONB DEFAULT '{}'
actor_id        TEXT
actor_name      TEXT
timestamp       TIMESTAMPTZ NOT NULL DEFAULT NOW()
company_id      TEXT FK -> company_config
created_at      TIMESTAMPTZ DEFAULT NOW()
INDEX: (customer_id, timestamp), event_type, reference_type, company_id
```

#### `engagement_audit` (Unified Engagement Audit)
```
id              TEXT PK
entity_type     TEXT NOT NULL CHECK(loyalty|cashback|membership|tier|giftcard|affiliate|promotion|reward|setting)
entity_id       TEXT NOT NULL
action          TEXT NOT NULL
actor_id        TEXT NOT NULL
actor_name      TEXT
field_name      TEXT
old_value       JSONB
new_value       JSONB
reason          TEXT
correlation_id  TEXT
ip_address      TEXT
user_agent      TEXT
timestamp       TIMESTAMPTZ NOT NULL DEFAULT NOW()
company_id      TEXT FK -> company_config
created_at      TIMESTAMPTZ DEFAULT NOW()
INDEX: (entity_type, entity_id), actor_id, timestamp, correlation_id, company_id
```

#### `engagement_settings` (Platform Settings - stored in CompanyConfig)
```
No separate table. Stored as CompanyConfig.engagementSettings
Following the exact pattern of CompanyConfig.referralSettings
```

### 2.2 CompanyConfig Extension

Add to `CompanyConfig` interface:
```typescript
engagementSettings?: {
  // General
  enabled: boolean

  // Loyalty Points
  pointsEnabled: boolean
  pointsEarningRate: number           // points per currency unit
  pointsRedeemRate: number            // currency per point
  minPointsRedeem: number
  maxPointsRedeemPct: number          // % of invoice that can be paid with points
  pointsExpiryDays: number
  pointsRoundUp: boolean
  bonusPointsMultiplier: number       // default bonus
  pointsOnRegistration: number
  pointsOnReferral: number
  pointsOnBirthday: number
  pointsOnReview: number

  // Cashback
  cashbackEnabled: boolean
  cashbackDefaultRate: number         // percentage
  cashbackType: 'immediate' | 'delayed' | 'scheduled'
  cashbackDelayDays: number
  cashbackExpiryDays: number
  cashbackRequireApproval: boolean
  cashbackAutoApproveThreshold: number
  cashbackMaxPerTransaction: number
  cashbackMaxPerDay: number
  cashbackCategoryRates: Record<string, number>

  // Membership
  membershipEnabled: boolean
  membershipEvaluation: 'monthly' | 'quarterly' | 'yearly'
  membershipAutoUpgrade: boolean
  membershipAutoDowngrade: boolean
  membershipExpiryDays: number
  defaultTierId: string

  // Gift Cards
  giftCardsEnabled: boolean
  giftCardExpiryDays: number
  giftCardMaxBalance: number
  giftCardAllowRecharge: boolean
  giftCardAllowTransfer: boolean
  giftCardRequirePin: boolean

  // Affiliate
  affiliateEnabled: boolean
  affiliateDefaultRate: number
  affiliateType: 'percentage' | 'fixed'
  affiliateFixedAmount: number
  affiliateRequireApproval: boolean
  affiliateAutoApproveThreshold: number
  affiliateCookieDays: number

  // Promotions
  promotionsEnabled: boolean
  promotionDefaultStacking: 'best_only' | 'stackable' | 'exclusive'
  promotionMaxStacked: number
  promotionMaxTotalDiscount: number

  // Rewards
  rewardsEnabled: boolean
  birthdayRewardDays: number           // days before/after birthday
  anniversaryRewardDays: number
  milestoneRewards: Array<{
    key: string
    name: string
    type: 'purchase_count' | 'total_spend' | 'points_earned'
    threshold: number
    rewardType: 'points' | 'wallet_credit' | 'gift_card' | 'discount' | 'tier_benefit'
    rewardValue: number
    description: string
  }>
}
```

---

## 3. Files to Create

### 3.1 New Service Files

| # | File Path | Purpose |
|---|-----------|---------|
| 1 | `frontend/services/engagementEngine.ts` | **Core engine** — orchestrates all plugins, receives events, dispatches processing |
| 2 | `frontend/services/engagementPlugin.ts` | Plugin interface + base class for all engagement plugins |
| 3 | `frontend/services/plugins/engagementLoyaltyPlugin.ts` | Loyalty Points — earn, redeem, expire, adjust, bonus |
| 4 | `frontend/services/plugins/engagementCashbackPlugin.ts` | Cashback — percentage, fixed, category, campaign |
| 5 | `frontend/services/plugins/engagementMembershipPlugin.ts` | Membership Tiers — evaluate, upgrade, downgrade, benefits |
| 6 | `frontend/services/plugins/engagementGiftCardPlugin.ts` | Gift Cards — create, activate, redeem, recharge, transfer |
| 7 | `frontend/services/plugins/engagementAffiliatePlugin.ts` | Affiliate — wraps referral engine with commissions |
| 8 | `frontend/services/plugins/engagementPromotionPlugin.ts` | Promotions — discount application, stacking, priority |
| 9 | `frontend/services/plugins/engagementRewardsPlugin.ts` | Rewards — milestone, birthday, anniversary, campaign |
| 10 | `frontend/services/engagementTimelineService.ts` | Unified engagement timeline (generalized from referralTimelineService) |
| 11 | `frontend/services/engagementAuditService.ts` | Unified engagement audit (generalized from referralAuditService) |
| 12 | `frontend/services/engagementAnalyticsService.ts` | Engagement analytics (extends referralAnalyticsService pattern) |
| 13 | `frontend/services/engagementNotificationService.ts` | Engagement notifications (subscribes to engagement events) |
| 14 | `frontend/services/engagementSettingsService.ts` | Engagement settings management (read/write CompanyConfig) |

### 3.2 New Type Files

| # | File Path | Purpose |
|---|-----------|---------|
| 15 | `frontend/types/engagement.ts` | All CEP interfaces (points, cashback, tiers, gift cards, affiliate, promotions, rewards) |
| 16 | `frontend/types/engagement-plugin.ts` | Plugin interface types (IPlugin, PluginContext, PluginResult) |

### 3.3 New UI Component Files

| # | File Path | Purpose |
|---|-----------|---------|
| 17 | `frontend/views/sales/components/EngagementDashboard.tsx` | Customer engagement overview (points, tier, cashback, gift cards, rewards) |
| 18 | `frontend/views/sales/components/EngagementTimeline.tsx` | Unified engagement timeline visualization |
| 19 | `frontend/views/sales/components/LoyaltyPointsPanel.tsx` | Points earned/redeemed/balance UI |
| 20 | `frontend/views/sales/components/CashbackPanel.tsx` | Cashback history and status UI |
| 21 | `frontend/views/sales/components/MembershipPanel.tsx` | Tier display, benefits, progress |
| 22 | `frontend/views/sales/components/GiftCardPanel.tsx` | Gift card management UI |
| 23 | `frontend/views/sales/components/AffiliatePanel.tsx` | Affiliate dashboard for customers |
| 24 | `frontend/views/sales/components/PromotionsPanel.tsx` | Active promotions display |
| 25 | `frontend/views/sales/components/RewardsPanel.tsx` | Available and claimed rewards |
| 26 | `frontend/views/sales/EngagementOverview.tsx` | Full-page engagement overview (analytics dashboard) |
| 27 | `frontend/views/settings/tabs/EngagementSettingsTab.tsx` | CEP settings tab (all 7 features) |
| 28 | `frontend/views/settings/tabs/LoyaltySettingsTab.tsx` | Loyalty-specific settings subtab |
| 29 | `frontend/views/settings/tabs/MembershipSettingsTab.tsx` | Membership tier management subtab |

### 3.4 New SQL Migration File

| # | File Path | Purpose |
|---|-----------|---------|
| 30 | `database/supabase-engagement-tables.sql` | All new CEP tables + indexes + RLS + functions |

### 3.5 New Edge Functions

| # | File Path | Purpose |
|---|-----------|---------|
| 31 | `supabase/functions/engagement-analytics/index.ts` | Scheduled analytics generation |
| 32 | `supabase/functions/engagement-expiry/index.ts` | Scheduled points/gift card/tier expiry |
| 33 | `supabase/functions/engagement-membership/index.ts` | Scheduled tier evaluation |
| 34 | `supabase/functions/engagement-cashback/index.ts` | Scheduled cashback release |

### 3.6 New Test Files

| # | File Path | Purpose |
|---|-----------|---------|
| 35 | `frontend/tests/unit/services/engagementEngine.test.ts` | Engine unit tests |
| 36 | `frontend/tests/unit/services/engagementLoyaltyPlugin.test.ts` | Loyalty plugin tests |
| 37 | `frontend/tests/unit/services/engagementCashbackPlugin.test.ts` | Cashback plugin tests |
| 38 | `frontend/tests/unit/services/engagementMembershipPlugin.test.ts` | Membership plugin tests |
| 39 | `frontend/tests/unit/services/engagementGiftCardPlugin.test.ts` | Gift card plugin tests |
| 40 | `frontend/tests/unit/services/engagementAffiliatePlugin.test.ts` | Affiliate plugin tests |
| 41 | `frontend/tests/unit/services/engagementPromotionPlugin.test.ts` | Promotion plugin tests |
| 42 | `frontend/tests/unit/services/engagementRewardsPlugin.test.ts` | Rewards plugin tests |
| 43 | `frontend/tests/unit/services/engagementTimelineService.test.ts` | Timeline tests |
| 44 | `frontend/tests/unit/services/engagementAnalyticsService.test.ts` | Analytics tests |
| 45 | `frontend/tests/integration/engagementPayoutFlow.test.ts` | Full payout flow integration test |

---

## 4. Files to Modify

### 4.1 Infrastructure Files

| # | File | Changes |
|---|------|---------|
| 1 | `frontend/services/db.ts` | Add NexusDB entries for 12 new stores (engagement_points, engagement_point_balances, engagement_cashback, engagement_membership_tiers, engagement_customer_tiers, engagement_gift_cards, engagement_gift_card_transactions, engagement_affiliates, engagement_affiliate_commissions, engagement_promotions, engagement_customer_rewards, engagement_timeline, engagement_audit). Add to STORE_NAMES. Add to CLOUD_TABLE_MAP. |
| 2 | `frontend/services/dexie/schema-types.ts` | Add 13 new table definitions (all engagement_* tables) with domain 'finance' |
| 3 | `frontend/services/cloudDb.ts` | Add 13 new Supabase table mappings |
| 4 | `frontend/types.ts` | Extend CompanyConfig with `engagementSettings` |
| 5 | `frontend/services/transactions/_internal.ts` | Add engagement ID prefix 'ENG' to generateId calls |
| 6 | `database/supabase-referral-tables-v2.sql` | Add ALTER TABLE policies for cross-engagement FKs |

### 4.2 Existing Service Modifications

| # | File | Changes |
|---|------|---------|
| 7 | `frontend/services/referralService.ts` | Add `processInvoiceReward()` call to `engagementEngine.emit('invoice.paid')`. Existing reward flow stays — engagement events fire alongside it. |
| 8 | `frontend/services/referralEventBus.ts` | Add new event type constants to REFERRAL_EVENT_TYPES (or import from engagement types). No structural changes needed — EventBus is already fully generic. |
| 9 | `frontend/services/referralRuleEngine.ts` | Add `evaluateEngagementRule()` method that evaluates rule conditions across engagement types. Add engagement rule constants. |
| 10 | `frontend/services/referralCampaignService.ts` | Add `campaignType` field support (referral | loyalty | cashback | reward). Add `getApplicableCampaignByType()` for engagement plugins. |
| 11 | `frontend/services/referralNotificationService.ts` | Add subscription to engagement events |
| 12 | `frontend/services/transactionService.ts` | Add `engagementEngine.emit('invoice.paid')` after successful sale completion. Add wallet deduction for point redemption. |

### 4.3 UI Component Modifications

| # | File | Changes |
|---|------|---------|
| 13 | `frontend/views/sales/components/CustomerWorkspace.tsx` | Add `Engagement` tab showing: EngagementDashboard (points, tier, cashback, gift cards, rewards, affiliate) + EngagementTimeline. Add tab to tabType union. Wire data loading from engagement services. |
| 14 | `frontend/views/sales/Referrals.tsx` | Add link to affiliate dashboard for customers with affiliate accounts |
| 15 | `frontend/views/settings/tabs/ReferralSettingsTab.tsx` | Add navigation link to Engagement Settings |
| 16 | `frontend/views/Settings.tsx` | Add `Engagement` menu group with sub-tabs: General, Loyalty, Cashback, Membership, Gift Cards, Affiliate, Promotions, Rewards |
| 17 | `frontend/components/TopBar.tsx` | Add engagement alerts (points expiring, tier change, cashback available) |

### 4.4 Admin/Analytics Modifications

| # | File | Changes |
|---|------|---------|
| 18 | `frontend/views/admin/Reports.tsx` (or equivalent) | Add engagement reports data sources |
| 19 | `frontend/services/revenueReportingService.ts` | Add engagement metrics to revenue analysis |
| 20 | `frontend/services/reportService.ts` | Add engagement_* data sources to allowedSources map |

---

## 5. React Components Architecture

### 5.1 CustomerWorkspace Engagement Tab

```
┌─────────────────────────────────────────────────────┐
│ Engagement Tab                                       │
│                                                      │
│ ┌─────────────┐ ┌──────────┐ ┌───────┐ ┌─────────┐  │
│ │  Points      │ │ Tier     │ │Cashback│ │GiftCards│  │
│ │  1,250 pts  │ │ Gold ⭐  │ │ $45.50 │ │ 2 cards │  │
│ └─────────────┘ └──────────┘ └───────┘ └─────────┘  │
│                                                      │
│ ┌──────────────────────────────────────────────────┐ │
│ │ Engagement Timeline (unified)                    │ │
│ │ ┌──────────────────────────────────────────────┐ │ │
│ │ │ 🎂 Birthday reward granted — 500 pts         │ │ │
│ │ │ 💰 Cashback $12.50 from invoice #INV-0042    │ │ │
│ │ │ ⭐ Upgraded to Gold tier — 2x points now!   │ │ │
│ │ │ 🎁 Gift card #GC-8821 redeemed $25.00       │ │ │
│ │ │ 👥 Referral: John Smith — reward $10.00      │ │ │
│ │ └──────────────────────────────────────────────┘ │ │
│ └──────────────────────────────────────────────────┘ │
│                                                      │
│ ┌──────────────────────────────────────────────────┐ │
│ │ Available Rewards & Promotions                   │ │
│ │ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ │ │
│ │ │ Birthday    │ │ Spend $500  │ │ Holiday     │ │ │
│ │ │ Reward      │ │ Unlock 10%  │ │ Bonus       │ │ │
│ │ │ 500 pts     │ │ Discount    │ │ 2x Points   │ │ │
│ │ └─────────────┘ └─────────────┘ └─────────────┘ │ │
│ └──────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────┘
```

### 5.2 Settings Tab Hierarchy

```
Engagement Settings
├── General (enable/disable, global rates)
├── Loyalty (points rates, redemption, expiry)
├── Cashback (rates, delay, approval thresholds)
├── Membership (tier definitions, evaluation rules)  ← Full CRUD for tiers
├── Gift Cards (expiry, max balance, recharge policy)
├── Affiliate (commission rates, approval)
├── Promotions (stacking rules, max discounts)
└── Rewards (milestone definitions, birthday/anniversary settings)
```

---

## 6. Core Engine Design

### 6.1 Plugin Interface

```typescript
// engagementPlugin.ts
interface EngagementPluginContext {
  event: EngagementEvent
  customer: Customer
  companyConfig: CompanyConfig
  ruleEngine: typeof referralRuleEngine
  eventBus: typeof referralEventBus
  timelineService: IEngagementTimelineService
  auditService: IEngagementAuditService
  dbService: IDbService
  logger: Logger
}

interface EngagementPluginResult {
  applied: boolean
  description?: string
  points?: number
  cashback?: number
  discount?: number
  tierChange?: string
  reward?: RewardResult
  metadata?: Record<string, any>
}

interface IEngagementPlugin {
  id: string
  name: string
  supportedEvents: string[]
  enabled(context: EngagementPluginContext): boolean | Promise<boolean>
  execute(event: EngagementEvent, context: EngagementPluginContext): Promise<EngagementPluginResult | null>
  priority: number
}
```

### 6.2 Engine Flow

```typescript
// engagementEngine.ts
class CustomerEngagementEngine {
  plugins: Map<string, IEngagementPlugin> = new Map()

  register(plugin: IEngagementPlugin): void {
    this.plugins.set(plugin.id, plugin)
    // Auto-subscribe plugin's supportedEvents to engine dispatch
    for (const eventType of plugin.supportedEvents) {
      referralEventBus.on(eventType, (event) => this.dispatch(event))
    }
  }

  async dispatch(event: ReferralEvent): Promise<void> {
    const sortedPlugins = [...this.plugins.values()]
      .filter(p => p.supportedEvents.includes(event.eventType))
      .sort((a, b) => b.priority - a.priority)

    for (const plugin of sortedPlugins) {
      try {
        const context = await this.buildContext(event)
        if (!await plugin.enabled(context)) continue
        const result = await plugin.execute(event, context)
        if (result) {
          await this.applyResult(result, context)
        }
      } catch (err) {
        logger.error(`Plugin ${plugin.id} failed:`, err)
        await this.handlePluginError(plugin, event, err)
      }
    }
  }

  private async applyResult(result: EngagementPluginResult, context: EngagementPluginContext): Promise<void> {
    const timelineEntry = {
      customerId: context.customer.id,
      eventType: result.reward?.type || 'engagement_action',
      title: result.description || 'Engagement action',
      amount: result.cashback,
      points: result.points,
      metadata: result.metadata,
      timestamp: new Date().toISOString(),
    }
    await context.timelineService.addEntry(timelineEntry)

    if (result.points) {
      await context.auditService.log({
        entityType: 'loyalty',
        entityId: context.customer.id,
        action: 'points_earned',
        actorId: 'system',
        newValue: { points: result.points },
      })
    }
  }
}

export const engagementEngine = new CustomerEngagementEngine()
```

### 6.3 Plugin: Loyalty Points Example

```typescript
// engagementLoyaltyPlugin.ts
const loyaltyPlugin: IEngagementPlugin = {
  id: 'loyalty',
  name: 'Loyalty Points',
  supportedEvents: ['invoice.paid', 'customer.created', 'wallet.credited'],
  priority: 50,

  async enabled(context) {
    return context.companyConfig.engagementSettings?.pointsEnabled ?? false
  },

  async execute(event, context) {
    if (event.eventType === 'invoice.paid') {
      const invoice = event.data
      const settings = context.companyConfig.engagementSettings
      const tier = await getCustomerTier(context.customer.id)
      const multiplier = tier?.pointMultiplier || 1
      const points = Math.round(invoice.paidAmount * (settings.pointsEarningRate || 0.01) * multiplier)

      if (points <= 0) return null

      // Atomic: write point entry + update balance
      const balance = await atomicAddPoints(context.customer.id, points, {
        referenceType: 'invoice',
        referenceId: invoice.id,
        tierMultiplier: multiplier,
      })

      return {
        applied: true,
        description: `Earned ${points} loyalty points (${multiplier}x tier multiplier)`,
        points,
        metadata: { balanceAfter: balance, invoiceId: invoice.id },
      }
    }

    if (event.eventType === 'customer.created') {
      const bonusPoints = context.companyConfig.engagementSettings?.pointsOnRegistration || 0
      if (bonusPoints <= 0) return null
      await atomicAddPoints(context.customer.id, bonusPoints, { referenceType: 'registration' })
      return {
        applied: true,
        description: `Welcome bonus: ${bonusPoints} points`,
        points: bonusPoints,
      }
    }

    return null
  }
}
```

---

## 7. Supabase Migrations

### 7.1 Migration File

`database/supabase-engagement-tables.sql` — follows the exact pattern of `supabase-referral-tables-v2.sql`:

- 12 new tables as defined in Section 2.1
- Each with RLS: `company_isolation` (SELECT) + `company_isolation_insert` (INSERT)
- Indexes on all FK and query columns
- Foreign keys with ON DELETE CASCADE/SET NULL as appropriate
- `engagement_timeline` uses `USING (true)` for RLS (matching `referral_event_history` pattern — audit visibility)

### 7.2 Postgres Functions

```sql
-- EXPIRY: expire points
CREATE FUNCTION expire_engagement_points(p_company_id TEXT DEFAULT NULL)
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER
-- Iterates engagement_points WHERE expires_at <= NOW() AND type='earned'
-- Creates reversal entries, updates point_balances

-- MEMBERSHIP: evaluate tiers
CREATE FUNCTION evaluate_membership_tiers(p_company_id TEXT DEFAULT NULL)
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER
-- For each customer with active tier:
-- 1. Sum period_spend from invoices
-- 2. Compare against tier thresholds
-- 3. Upgrade if meets higher tier criteria
-- 4. Downgrade if fails current tier criteria
-- 5. Create engagement_timeline entries for changes

-- ANALYTICS: generate engagement analytics
CREATE FUNCTION generate_engagement_analytics(
  p_period TEXT, p_start_date DATE, p_end_date DATE, p_company_id TEXT DEFAULT NULL
) RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER
-- Point liability, tier distribution, cashback cost, reward cost, etc.

-- CASHBACK: release scheduled cashback
CREATE FUNCTION release_scheduled_cashback(p_company_id TEXT DEFAULT NULL)
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER
-- Finds cashback WHERE status='pending' AND scheduled_at <= NOW()
-- Credits wallet, updates status to 'paid'

-- GIFTCARD: expire gift cards
CREATE FUNCTION expire_gift_cards(p_company_id TEXT DEFAULT NULL)
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER
-- Sets status='expired' for gift cards past expires_at
```

### 7.3 Edge Functions

| Function | Schedule | Purpose |
|----------|----------|---------|
| `engagement-expiry` | Daily | Expire points, gift cards, pending cashback |
| `engagement-membership` | Daily | Evaluate tier upgrades/downgrades |
| `engagement-analytics` | Daily (night) | Generate engagement analytics snapshots |
| `engagement-cashback` | Hourly | Release delayed/scheduled cashback |

---

## 8. RLS Policies

All tables follow the same pattern:

```sql
ALTER TABLE engagement_points ENABLE ROW LEVEL SECURITY;

CREATE POLICY engagement_points_company_isolation ON engagement_points
    USING (company_id = get_current_company_id());

CREATE POLICY engagement_points_company_isolation_insert ON engagement_points
    FOR INSERT WITH CHECK (company_id = get_current_company_id());

-- Customer-tier tables also need:
CREATE POLICY engagement_points_own_data ON engagement_points
    FOR SELECT USING (customer_id IN (
        SELECT id FROM customers WHERE _company_id = get_current_company_id()
    ));
```

For `engagement_timeline` and `engagement_audit`:
```sql
-- These are visibility-only, no INSERT restriction for customers
CREATE POLICY engagement_timeline_company_isolation ON engagement_timeline
    USING (company_id = get_current_company_id()
        OR customer_id IN (SELECT id FROM customers WHERE _company_id = get_current_company_id())
    );
```

---

## 9. Testing Strategy

### 9.1 Unit Tests (frontend/tests/unit/services/engagement*.test.ts)

Each plugin tested in isolation with mocked:
- `dbService` (returns controlled data)
- `referralEventBus` (captures emitted events)
- `referralRuleEngine` (returns predictable evaluations)
- `notificationService` (captures notifications)
- `logger` (captures errors)

Tests per plugin:
- **LoyaltyPlugin**: earn on invoice.paid, redeem points, partial redemption, expiry, bonus multipliers, tier multipliers, reversal, idempotency (no double-earn)
- **CashbackPlugin**: percentage calc, fixed amount, category rates, campaign rates, delayed release, pending→approved→paid→reversed flow, expiry, approval thresholds
- **MembershipPlugin**: auto-upgrade test, auto-downgrade test, spending period evaluation, tier benefits activation, no-change scenario, tier expiry
- **GiftCardPlugin**: creation, activation, redemption (partial/full), recharge, balance check, transfer, cancellation, expiry, barcode generation
- **AffiliatePlugin**: commission calculation, pending→approved→paid→reversed, wallet payout, idempotency
- **PromotionPlugin**: percentage discount, fixed discount, stacking rules, priority ordering, best-only selection, category eligibility, tier eligibility, expiry
- **RewardsPlugin**: milestone detection (first_purchase, 10th_purchase, spend_1000), birthday reward (within window), anniversary reward, campaign reward, manual reward grant, expiry

### 9.2 Integration Tests

- `engagementPayoutFlow.test.ts`: Create invoice → trigger invoice.paid → verify points earned + cashback calculated + tier evaluated + timeline entry created + audit logged
- `fullRedemptionFlow.test.ts`: Earn points → redeem points on next invoice → verify balance deduction + ledger entry + timeline
- `tierUpgradeFlow.test.ts`: Customer spends enough → tier evaluation triggers → verify upgrade + benefit activation + notification

### 9.3 Edge Function Tests

- `referral-expiry` test: Mock expired records → verify expiry count
- `engagement-membership` test: Create customers at different spend levels → verify correct tier assignments

### 9.4 Migration Tests

- Verify all 12 new tables created with correct schema
- Verify RLS policies applied
- Verify indexes created
- Verify functions can be called
- Rollback and verify table removal

---

## 10. Deployment Plan

### Phase 1: Foundation (Days 1-2)
1. Create `types/engagement.ts` and `types/engagement-plugin.ts`
2. Create `engagementPlugin.ts` (interface + base)
3. Create `engagementEngine.ts` (core engine)
4. Create `engagementTimelineService.ts` (generalized)
5. Create `engagementAuditService.ts` (generalized)
6. Update `db.ts`, `schema-types.ts`, `cloudDb.ts` with new stores
7. Create `database/supabase-engagement-tables.sql`
8. Update DB_VERSION
9. **Build & test** — verify zero regressions

### Phase 2: Plugins 1-3 (Days 3-5)
1. `engagementLoyaltyPlugin.ts` + point balance management
2. `engagementCashbackPlugin.ts` + wallet credit integration
3. `engagementMembershipPlugin.ts` + tier evaluation engine
4. SQL functions for points expiry, cashback release
5. Edge Functions for scheduled jobs
6. **Build + unit test each plugin**

### Phase 3: Plugins 4-5 (Days 6-7)
1. `engagementGiftCardPlugin.ts` + barcode/QR generation
2. `engagementAffiliatePlugin.ts` + referral engine integration
3. SQL functions for gift card expiry
4. **Build + unit test**

### Phase 4: Plugins 6-7 (Days 8-9)
1. `engagementPromotionPlugin.ts` + discount application on sales
2. `engagementRewardsPlugin.ts` + milestone detection
3. SQL functions for reward processing
4. **Build + unit test**

### Phase 5: UI & Settings (Days 10-12)
1. `EngagementSettingsTab.tsx` + sub-tabs
2. Update `Settings.tsx` with Engagement menu group
3. `CustomerWorkspace.tsx` — add Engagement tab
4. `EngagementDashboard.tsx` — overview widgets
5. `EngagementTimeline.tsx` — unified timeline
6. Individual panels (LoyaltyPointsPanel, CashbackPanel, etc.)
7. **Build + visual test**

### Phase 6: Analytics & Integration (Days 13-14)
1. `engagementAnalyticsService.ts` + report data sources
2. `engagementNotificationService.ts` + event subscriptions
3. Update `transactionService.ts` with engagement event emission
4. Update `referralService.ts` with engagement engine calls
5. Edge Functions for analytics generation
6. **Integration test + full flow test**

### Phase 7: Polish & Deploy (Days 15-16)
1. Complete UAT scenarios
2. Performance testing (load test with 10K+ point entries)
3. Documentation
4. Staged rollout (feature flags per module)
5. Production deployment

---

## 11. Rollback Strategy

### Per-Feature Rollback
Each plugin has a feature flag (`engagementSettings.pointsEnabled`, `engagementSettings.cashbackEnabled`, etc.). Setting to `false` immediately stops evaluation without data loss.

### Database Rollback
```sql
-- Reversible migration: drop all engagement tables
DROP TABLE IF EXISTS engagement_customer_rewards CASCADE;
DROP TABLE IF EXISTS engagement_promotions CASCADE;
DROP TABLE IF EXISTS engagement_affiliate_commissions CASCADE;
DROP TABLE IF EXISTS engagement_affiliates CASCADE;
DROP TABLE IF EXISTS engagement_gift_card_transactions CASCADE;
DROP TABLE IF EXISTS engagement_gift_cards CASCADE;
DROP TABLE IF EXISTS engagement_customer_tiers CASCADE;
DROP TABLE IF EXISTS engagement_membership_tiers CASCADE;
DROP TABLE IF EXISTS engagement_cashback CASCADE;
DROP TABLE IF EXISTS engagement_point_balances CASCADE;
DROP TABLE IF EXISTS engagement_points CASCADE;
DROP TABLE IF EXISTS engagement_timeline CASCADE;
DROP TABLE IF EXISTS engagement_audit CASCADE;
```

### Code Rollback
- Revert `db.ts` version bump
- Revert `schema-types.ts` additions
- Revert `cloudDb.ts` additions
- Remove `engagementSettings` from CompanyConfig interface
- Remove Engagement tab from CustomerWorkspace
- Remove Engagement settings from Settings.tsx
- Delete all new files

### Data Preservation
- No existing tables are modified (only new tables created)
- Existing `customers.walletBalance` remains — engagement data is additive
- Referral system is untouched — only enhanced with event emissions

---

## 12. Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| **DB_VERSION bump causes migration failures** | High — users lose data | Test migration on staging first. Provide manual migration script. Add fallback logic in upgrade handler. |
| **Atomic operation complexity** | Medium — wallet double-credit or point loss | All critical paths use `executeAtomicOperation`. Idempotency keys on every reward/payout. |
| **Plugin execution order race** | Medium — promotion applied before points discount | Plugins ordered by priority. Promotion (priority 90) runs before Points redemption (priority 40). |
| **Tier evaluation on every invoice is expensive** | Medium — performance degradation | Tier evaluation is scheduled (cron), not per-invoice. Only re-evaluate when crossing threshold. |
| **Points expiry data volume** | Low — millions of point entries | Archive expired points older than 2 years. Use partitioned tables in Supabase. |
| **Event bus memory growth** | Low — 500 event default limit | History is bounded (500 events). Set to 1000 for engagement events. |
| **Offline sync conflicts** | Medium — points balance out of sync | Use idempotency keys. Conflict resolution: "last write wins" with balance recalculation. |
| **Gift card fraud** | High — financial loss | PIN verification. Recharge limits. Per-customer max balance. Audit every transaction. Idempotency on redemption. Atomic operations. |
| **Affiliate commission double-payout** | High — financial loss | Idempotency key per invoice+affiliate combination. Atomic transaction for commission+wallet credit. |
| **Promotion stacking exceeds discounts** | Medium — negative margin transactions | Max total discount cap. Stacking rules enforced. Priority-based evaluation prevents conflicts. |

---

## 13. Dependencies

### Internal Dependencies

| Dependency | Required By | Type |
|------------|-------------|------|
| `referralEventBus` | All plugins — event dispatch | Hard |
| `referralRuleEngine` | All plugins — eligibility & calculation | Hard |
| `dbService` | All plugins — persistence | Hard |
| `notificationService` | `engagementNotificationService` | Hard |
| `logger` | All services — error tracking | Hard |
| `CompanyConfig` | All plugins — settings | Hard |
| `Customer` interface with `walletBalance` | Cashback, GiftCard — wallet payouts | Hard |
| `walletTransactions` store | Cashback, Affiliate — wallet credits | Hard |
| `customers` store | All plugins — balance updates | Hard |
| `idempotencyKeys` store | All plugins — duplicate prevention | Hard |
| `referralCampaignService` | Campaign plugins | Soft (enhancement) |
| `referralService` | Affiliate plugin — reuses referral engine | Soft (enhancement) |
| `transactionService.ts` | Event trigger — sales/payments fire events | Hard |
| `Dexie schema-types.ts` | Offline sync | Hard |

### Internal Dependents

| Component | Depends On |
|-----------|------------|
| `engagementEngine.ts` | Plugin interface, EventBus, dbService |
| `engagementLoyaltyPlugin.ts` | EngagementEngine, PointBalanceService |
| `engagementCashbackPlugin.ts` | EngagementEngine, walletTransactions |
| `engagementMembershipPlugin.ts` | EngagementEngine, tier definitions |
| `engagementGiftCardPlugin.ts` | EngagementEngine, walletTransactions |
| `engagementAffiliatePlugin.ts` | EngagementEngine, referralService |
| `engagementPromotionPlugin.ts` | EngagementEngine, invoice/order flow |
| `engagementRewardsPlugin.ts` | EngagementEngine, milestone detection |
| `engagementTimelineService.ts` | dbService |
| `engagementAuditService.ts` | dbService |
| `engagementAnalyticsService.ts` | All data stores |
| `engagementNotificationService.ts` | EventBus, notificationService |
| `EngagementSettingsTab.tsx` | CompanyConfig |
| `EngagementDashboard.tsx` | All engagement services |
| `CustomerWorkspace` changes | EngagementDashboard, EngagementTimeline |

### Third-Party Dependencies

| Dependency | Purpose |
|------------|---------|
| `bwip-js` or similar | Gift card barcode/QR generation |
| `date-fns` (already used) | Date calculations for expiry, milestones |
| No new npm packages required | Everything reuses existing stack |

---

## 14. Engagement Timeline — Unified Model

Instead of multiple topic-specific timelines, one `engagement_timeline` table serves all engagement events:

```typescript
interface EngagementTimelineEntry {
  id: string
  customerId: string
  eventType: string        // e.g. 'points.earned', 'tier.upgraded', 'cashback.issued'
  title: string            // Human-readable summary
  description?: string     // Detail
  amount?: number          // Monetary value (cashback, gift card, discount)
  points?: number          // Points value
  tierName?: string        // Tier name if applicable
  referenceType: string    // Entity type: point, cashback, tier, giftcard, affiliate, promotion, reward
  referenceId: string      // Entity ID for drill-down
  metadata?: Record<string, any>
  actorId?: string
  actorName?: string
  timestamp: string
}
```

This reuses the existing `referralTimelineService` pattern but generalizes the `referralId` FK to `customerId`.

---

## 15. CompanyConfig Extension (Final)

The existing `CompanyConfig.referralSettings` is kept unchanged. A new `engagementSettings` section sits alongside it:

```typescript
// Existing
referralSettings?: ReferralSettings

// New
engagementSettings?: EngagementSettings
```

Migration note: On first load of the settings page, if `engagementSettings` is undefined, it gets populated with defaults from `DEFAULT_ENGAGEMENT_SETTINGS`.

---

## 16. Implementation Order Within Each Plugin

Each plugin follows this implementation sequence:

1. **Types** — Add interfaces to `types/engagement.ts`
2. **Dexie schema** — Add table definitions to `schema-types.ts`
3. **NexusDB** — Add store types to `db.ts`
4. **Cloud mappings** — Add table mappings to `cloudDb.ts`
5. **SQL migration** — Add CREATE TABLE + indexes + RLS
6. **Service logic** — Implement plugin class with all features
7. **Timeline + Audit** — Wire into unified timeline and audit
8. **Event Bus** — Subscribe to relevant events, emit engagement events
9. **Notifications** — Wire event notifications
10. **Settings UI** — Add settings UI in Engagement Settings tab
11. **Customer UI** — Add widget/panel in Engagement Dashboard
12. **Analytics** — Add analytics calculations
13. **Tests** — Unit + integration tests
14. **Edge Function** — Add any scheduled processing needed

---

## 17. Full Event Flow Example: Customer Buys a Product

```
1. POS completes sale
   → transactionService.recordSale()
     → Creates invoice (status: Paid)
     → Updates wallet (if deposit/overpayment)
     → Updates ledger
     → referralService.processInvoiceReward() [existing flow]
     → **NEW** engagementEngine.emit('invoice.paid', { invoice, customer, paidAmount })

2. engagementEngine dispatches to eligible plugins (sorted by priority):

   a. PromotionPlugin (priority 90)
      → Checks active promotions applicable to this customer
      → If discount promotion, records usage (current_uses++)
      → Returns discount applied result

   b. CashbackPlugin (priority 70)
      → Calculates cashback (percentage or fixed)
      → Creates engagement_cashback record (status: pending or paid)
      → If auto-approved: credits wallet, logs timeline
      → Returns cashback result

   c. MembershipPlugin (priority 60)
      → Updates customer's period_spend + period_count
      → Checks if threshold met for upgrade
      → If threshold crossed: schedules tier evaluation
      → Returns membership progress result

   d. LoyaltyPlugin (priority 50)
      → Calculates points earned (base * tier multiplier)
      → Creates engagement_points record
      → Updates point_balances
      → Returns points result

   e. RewardsPlugin (priority 40)
      → Checks milestone thresholds (purchase count, total spend)
      → Checks birthday/anniversary window
      → If milestone/reward due: grants reward
      → Returns reward result

   f. AffiliatePlugin (priority 30)
      → If referred: calculates affiliate commission
      → Creates engagement_affiliate_commissions record
      → Returns commission result (pending or paid)

3. Each plugin result is applied atomically:
   → Points balance updated (atomic)
   → Wallet credited (atomic via existing wallet transaction pattern)
   → Timeline entry added
   → Audit entry logged
   → Engagement event emitted on EventBus

4. engagementNotificationService (subscribed to engagement events)
   → Creates notifications for:
     - "You earned 125 points!"
     - "Cashback $12.50 credited to your wallet"
     - "You're 80% of the way to Silver tier!"
     - "🎉 10th purchase milestone — 500 bonus points!"
```

---

## 18. Summary of All Files

### New Files: 45 total
- 2 type files
- 13 service files (engine, plugins, timeline, audit, analytics, settings, notifications)
- 13 UI component files (dashboard, panels, settings tabs)
- 1 SQL migration file
- 4 Edge Function files
- 11 test files

### Modified Files: 20 total
- 3 infrastructure (db.ts, schema-types.ts, cloudDb.ts)
- 2 types (types.ts, _internal.ts)
- 6 services (transactionService, referralService, eventBus, ruleEngine, campaignService, referralNotificationService)
- 4 UI components (CustomerWorkspace, Referrals, Settings, TopBar)
- 5 reporting/admin (Reports, revenueReportingService, reportService, ReferralSettingsTab, database migration)
