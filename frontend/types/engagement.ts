export interface EngagementSettings {
  enabled: boolean

  pointsEnabled: boolean
  pointsEarningRate: number
  pointsRedeemRate: number
  minPointsRedeem: number
  maxPointsRedeemPct: number
  pointsExpiryDays: number
  pointsRoundUp: boolean
  bonusPointsMultiplier: number
  pointsOnRegistration: number
  pointsOnReferral: number
  pointsOnBirthday: number
  pointsOnReview: number

  cashbackEnabled: boolean
  cashbackDefaultRate: number
  cashbackType: 'immediate' | 'delayed' | 'scheduled'
  cashbackDelayDays: number
  cashbackExpiryDays: number
  cashbackRequireApproval: boolean
  cashbackAutoApproveThreshold: number
  cashbackMaxPerTransaction: number
  cashbackMaxPerDay: number
  cashbackCategoryRates: Record<string, number>

  membershipEnabled: boolean
  membershipEvaluation: 'monthly' | 'quarterly' | 'yearly'
  membershipAutoUpgrade: boolean
  membershipAutoDowngrade: boolean
  membershipExpiryDays: number
  defaultTierId: string

  giftCardsEnabled: boolean
  giftCardExpiryDays: number
  giftCardMaxBalance: number
  giftCardAllowRecharge: boolean
  giftCardAllowTransfer: boolean
  giftCardRequirePin: boolean

  affiliateEnabled: boolean
  affiliateDefaultRate: number
  affiliateType: 'percentage' | 'fixed'
  affiliateFixedAmount: number
  affiliateRequireApproval: boolean
  affiliateAutoApproveThreshold: number
  affiliateCookieDays: number

  promotionsEnabled: boolean
  promotionDefaultStacking: 'best_only' | 'stackable' | 'exclusive'
  promotionMaxStacked: number
  promotionMaxTotalDiscount: number

  rewardsEnabled: boolean
  birthdayRewardDays: number
  anniversaryRewardDays: number
  milestoneRewards: MilestoneRewardDef[]
}

export interface MilestoneRewardDef {
  key: string
  name: string
  type: 'purchase_count' | 'total_spend' | 'points_earned'
  threshold: number
  rewardType: 'points' | 'wallet_credit' | 'gift_card' | 'discount' | 'tier_benefit'
  rewardValue: number
  description: string
}

export const DEFAULT_ENGAGEMENT_SETTINGS: EngagementSettings = {
  enabled: false,

  pointsEnabled: true,
  pointsEarningRate: 0.01,
  pointsRedeemRate: 0.01,
  minPointsRedeem: 100,
  maxPointsRedeemPct: 50,
  pointsExpiryDays: 365,
  pointsRoundUp: false,
  bonusPointsMultiplier: 1,
  pointsOnRegistration: 100,
  pointsOnReferral: 50,
  pointsOnBirthday: 200,
  pointsOnReview: 25,

  cashbackEnabled: true,
  cashbackDefaultRate: 2,
  cashbackType: 'immediate',
  cashbackDelayDays: 0,
  cashbackExpiryDays: 90,
  cashbackRequireApproval: false,
  cashbackAutoApproveThreshold: 50,
  cashbackMaxPerTransaction: 200,
  cashbackMaxPerDay: 500,
  cashbackCategoryRates: {},

  membershipEnabled: true,
  membershipEvaluation: 'yearly',
  membershipAutoUpgrade: true,
  membershipAutoDowngrade: false,
  membershipExpiryDays: 365,
  defaultTierId: '',

  giftCardsEnabled: true,
  giftCardExpiryDays: 365,
  giftCardMaxBalance: 1000,
  giftCardAllowRecharge: true,
  giftCardAllowTransfer: false,
  giftCardRequirePin: true,

  affiliateEnabled: true,
  affiliateDefaultRate: 5,
  affiliateType: 'percentage',
  affiliateFixedAmount: 0,
  affiliateRequireApproval: false,
  affiliateAutoApproveThreshold: 100,
  affiliateCookieDays: 30,

  promotionsEnabled: true,
  promotionDefaultStacking: 'best_only',
  promotionMaxStacked: 3,
  promotionMaxTotalDiscount: 50,

  rewardsEnabled: true,
  birthdayRewardDays: 14,
  anniversaryRewardDays: 14,
  milestoneRewards: [
    { key: 'first_purchase', name: 'First Purchase', type: 'purchase_count', threshold: 1, rewardType: 'points', rewardValue: 200, description: 'Welcome! Bonus points for your first purchase.' },
    { key: 'fifth_purchase', name: '5th Purchase', type: 'purchase_count', threshold: 5, rewardType: 'wallet_credit', rewardValue: 10, description: 'Spend $10 credit for your 5th purchase!' },
    { key: 'tenth_purchase', name: '10th Purchase', type: 'purchase_count', threshold: 10, rewardType: 'points', rewardValue: 500, description: '500 bonus points for 10 purchases!' },
    { key: 'spend_500', name: 'Spend $500', type: 'total_spend', threshold: 500, rewardType: 'wallet_credit', rewardValue: 25, description: '$25 wallet credit for spending $500!' },
    { key: 'spend_1000', name: 'Spend $1,000', type: 'total_spend', threshold: 1000, rewardType: 'wallet_credit', rewardValue: 50, description: '$50 wallet credit — VIP treatment!' },
    { key: 'points_5000', name: '5,000 Points', type: 'points_earned', threshold: 5000, rewardType: 'gift_card', rewardValue: 25, description: '$25 gift card for earning 5,000 points!' },
  ],
}

export interface EngagementTimelineEntry {
  id: string
  customerId: string
  eventType: string
  title: string
  description?: string
  amount?: number
  points?: number
  tierName?: string
  referenceType: string
  referenceId: string
  metadata?: Record<string, any>
  actorId?: string
  actorName?: string
  timestamp: string
  createdAt?: string
}

export interface EngagementAuditEntry {
  id: string
  entityType: 'loyalty' | 'cashback' | 'membership' | 'tier' | 'giftcard' | 'affiliate' | 'promotion' | 'reward' | 'setting'
  entityId: string
  action: string
  actorId: string
  actorName?: string
  fieldName?: string
  oldValue?: any
  newValue?: any
  reason?: string
  correlationId?: string
  ipAddress?: string
  userAgent?: string
  timestamp: string
  createdAt?: string
}

export interface PointEntry {
  id: string
  customerId: string
  points: number
  balanceAfter: number
  type: 'earned' | 'redeemed' | 'expired' | 'adjusted' | 'bonus' | 'reversed'
  referenceType: string
  referenceId?: string
  description?: string
  campaignId?: string
  tierMultiplier: number
  expiresAt?: string
  redeemedAt?: string
  createdBy?: string
  createdAt?: string
  updatedAt?: string
}

export interface PointBalance {
  id: string
  customerId: string
  totalEarned: number
  totalRedeemed: number
  currentBalance: number
  pendingExpiry: number
  expiresAt?: string
  lastUpdated: string
}

export interface CashbackEntry {
  id: string
  customerId: string
  invoiceId?: string
  amount: number
  rate: number
  type: 'percentage' | 'fixed' | 'category' | 'campaign' | 'scheduled'
  status: 'pending' | 'approved' | 'paid' | 'reversed' | 'expired'
  category?: string
  campaignId?: string
  walletTxId?: string
  scheduledAt?: string
  approvedAt?: string
  approvedBy?: string
  reversedAt?: string
  reversedBy?: string
  reverseReason?: string
  expiresAt?: string
  notes?: string
  createdAt?: string
  updatedAt?: string
}

export interface MembershipTier {
  id: string
  name: string
  level: number
  description?: string
  color?: string
  icon?: string
  minSpend: number
  entrySpend: number
  minFrequency: number
  minClv: number
  pointMultiplier: number
  cashbackRate: number
  prioritySupport: boolean
  exclusivePricing: boolean
  exclusiveCampaigns: boolean
  freeShipping: boolean
  birthdayReward: number
  annualReward: number
  benefits: Record<string, any>
  status: 'active' | 'inactive'
  createdAt?: string
  updatedAt?: string
}

export interface CustomerTier {
  id: string
  customerId: string
  tierId: string
  assignedAt: string
  periodStart: string
  periodSpend: number
  periodCount: number
  upgradedAt?: string
  downgradedAt?: string
  lastEvaluated?: string
  expiresAt?: string
  status: 'active' | 'expired' | 'suspended'
  notes?: string
  createdAt?: string
  updatedAt?: string
}

export interface GiftCard {
  id: string
  code: string
  pin?: string
  customerId?: string
  issuerId?: string
  initialBalance: number
  currentBalance: number
  status: 'active' | 'inactive' | 'expired' | 'cancelled' | 'redeemed'
  type: 'digital' | 'physical' | 'rechargeable'
  expiresAt?: string
  activatedAt?: string
  cancelledAt?: string
  cancelReason?: string
  rechargeable: boolean
  transferable: boolean
  barcodeData?: string
  designColor?: string
  giftMessage?: string
  purchasedWith?: string
  createdAt?: string
  updatedAt?: string
}

export interface GiftCardTransaction {
  id: string
  giftCardId: string
  type: 'issued' | 'redeemed' | 'recharged' | 'transferred' | 'cancelled' | 'expired'
  amount: number
  balanceAfter: number
  referenceType?: string
  referenceId?: string
  customerId?: string
  description?: string
  createdAt?: string
}

export interface AffiliateAccount {
  id: string
  customerId: string
  referralCode: string
  status: 'active' | 'suspended' | 'cancelled'
  commissionRate: number
  commissionType: 'percentage' | 'fixed'
  fixedCommission: number
  tierId?: string
  paymentMethod: 'wallet' | 'bank' | 'other'
  paymentDetails?: Record<string, any>
  totalEarned: number
  totalPaid: number
  approvedAt?: string
  approvedBy?: string
  notes?: string
  createdAt?: string
  updatedAt?: string
}

export interface AffiliateCommission {
  id: string
  affiliateId: string
  referralId?: string
  invoiceId?: string
  customerId: string
  amount: number
  rate: number
  status: 'pending' | 'approved' | 'paid' | 'reversed' | 'cancelled'
  approvedAt?: string
  approvedBy?: string
  paidAt?: string
  walletTxId?: string
  reversedAt?: string
  reverseReason?: string
  notes?: string
  createdAt?: string
  updatedAt?: string
}

export type PromotionChannel = 'ERP' | 'PORTAL' | 'BOTH'
export type PromotionStatus = 'draft' | 'scheduled' | 'active' | 'paused' | 'expired' | 'cancelled'
export type PromotionDiscountType =
  | 'percentage' | 'fixed_amount' | 'fixed_price' | 'buy_x_get_y' | 'tiered'
  | 'category' | 'brand' | 'bundle' | 'coupon' | 'campaign' | 'fixed'
export type PromotionCustomerScope = 'all' | 'customers' | 'tiers' | 'new_customers' | 'existing_customers'
export type PromotionApplicableTo = 'all' | 'products' | 'categories' | 'tiers'

export interface Promotion {
  id: string
  name: string
  description?: string
  companyId?: string
  // Legacy aliases (kept for backwards compatibility with the engagement module)
  type?: 'percentage' | 'fixed' | 'category' | 'brand' | 'bundle' | 'buy_x_get_y' | 'tier' | 'campaign' | 'coupon'
  value?: number
  categoryId?: string
  brand?: string
  bundleItems?: any[]
  buyXQty?: number
  getYQty?: number
  getYDiscount?: number
  minPurchase?: number
  maxDiscount?: number
  maxUses?: number
  currentUses?: number
  customerIds?: string[]
  tierIds?: string[]
  campaignId?: string
  stackingRule?: 'best_only' | 'stackable' | 'exclusive'
  priority?: number
  startsAt?: string
  endsAt?: string
  expiresAt?: string
  createdAt?: string
  updatedAt?: string
  createdBy?: string
  // Canonical promotion-engine fields
  code?: string
  promotionCode?: string
  channel?: PromotionChannel
  discountType?: PromotionDiscountType
  discountValue?: number
  valueType?: 'percentage' | 'fixed'
  status?: PromotionStatus
  isActive?: boolean
  isAutoApply?: boolean
  minimumOrderAmount?: number
  maximumDiscountAmount?: number
  usageLimit?: number
  usageLimitPerCustomer?: number
  per_customer_limit?: number
  applicableTo?: PromotionApplicableTo
  productIds?: string[]
  categoryIds?: string[]
  customerScope?: PromotionCustomerScope
  customerScopeIds?: string[]
  stackable?: boolean
  pausedAt?: string
  cancelledAt?: string
  usedCount?: number
  _effectiveStatus?: PromotionStatus
}

export interface PromotionLine {
  productId: string | null
  name: string
  quantity: number
  unitPrice: number
  originalUnitPrice: number
  discountPercent: number
  discountAmount: number
  netUnitPrice: number
  lineTotal: number
  promotionId: string | null
  promotionCode: string | null
  category?: string | null
}

export interface PromotionAppliedInfo {
  id: string
  name: string
  code: string | null
  discountType: PromotionDiscountType
  discountValue: number
  discountAmount: number
  channel: PromotionChannel
  priority: number
  stackable: boolean
}

export interface PromotionCalculationResult {
  applied: boolean
  promotions: PromotionAppliedInfo[]
  lines: PromotionLine[]
  subtotal: number
  discountTotal: number
  subtotalBeforeDiscount: number
  subtotalAfterDiscount: number
  taxableSubtotal: number
  grandTotal: number
  metadata: Record<string, any>
}

export interface PromotionSnapshot {
  id: string
  code: string | null
  name: string
  discountType: PromotionDiscountType
  discountValue: number
  discountAmount: number
  discountPercent: number
  channel: PromotionChannel
  appliedAt: string
}

export interface PromotionRedemption {
  id: string
  promotionId: string
  customerId: string | null
  sourceType: 'request' | 'quotation' | 'sales_order' | 'invoice'
  sourceId: string
  sourceNumber: string | null
  discountAmount: number
  subtotalBefore: number
  subtotalAfter: number
  promotionSnapshot: Record<string, any>
  createdAt: string
}

export interface PromotionAnalyticsEntry {
  id: string
  name: string
  code: string | null
  status: PromotionStatus
  channel: PromotionChannel
  discountType: PromotionDiscountType
  discountValue: number
  orders: number
  customers: number
  grossSales: number
  discountAmount: number
  netSales: number
  averageOrderValue: number
}

export interface PromotionAnalytics {
  totals: {
    orders: number
    customers: number
    grossSales: number
    discountAmount: number
    netSales: number
    averageOrderValue: number
  }
  byPromotion: PromotionAnalyticsEntry[]
  /** Daily redemption activity for the last 30 days (admin charts). */
  trend?: {
    date: string
    orders: number
    grossSales: number
    discountAmount: number
    netSales: number
  }[]
}

export interface CustomerReward {
  id: string
  customerId: string
  type: 'milestone' | 'birthday' | 'anniversary' | 'purchase' | 'tier' | 'campaign' | 'holiday' | 'manual' | 'gift' | 'point'
  status: 'pending' | 'approved' | 'granted' | 'rejected' | 'cancelled' | 'expired'
  rewardType: 'points' | 'wallet_credit' | 'gift_card' | 'discount' | 'product' | 'tier_benefit' | 'custom'
  rewardValue: number
  rewardData?: Record<string, any>
  description?: string
  milestoneKey?: string
  tierId?: string
  campaignId?: string
  invoiceId?: string
  pointsTxId?: string
  walletTxId?: string
  giftCardId?: string
  grantedAt?: string
  grantedBy?: string
  approvedAt?: string
  approvedBy?: string
  rejectedAt?: string
  rejectReason?: string
  expiresAt?: string
  createdAt?: string
  updatedAt?: string
}

export interface EngagementAnalytics {
  id?: string
  period: 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'yearly'
  periodStart: string
  periodEnd: string
  totalPointsEarned: number
  totalPointsRedeemed: number
  totalPointsExpired: number
  activePointBalances: number
  pointsLiability: number
  totalCashbackIssued: number
  totalCashbackPaid: number
  pendingCashbackAmount: number
  cashbackCost: number
  tierDistribution: Record<string, number>
  totalGiftCardSales: number
  giftCardLiability: number
  totalAffiliateCommissions: number
  affiliateROI: number
  totalRewardsGranted: number
  rewardCost: number
  customerRetentionRate: number
  repeatPurchaseRate: number
  topCustomers: Array<{ customerId: string; customerName: string; totalSpend: number; pointsEarned: number; tierName: string }>
  revenueByTier: Record<string, number>
  revenueByCampaign: Record<string, number>
  walletUtilization: number
  generatedAt: string
}

export interface EngagementPluginResult {
  applied: boolean
  description?: string
  points?: number
  cashback?: number
  discount?: number
  discountPercent?: number
  tierChange?: string
  reward?: {
    type: string
    value: number
    id?: string
  }
  metadata?: Record<string, any>
}

export const ENGAGEMENT_EVENT_TYPES = {
  CUSTOMER_CREATED: 'customer.created',
  INVOICE_PAID: 'invoice.paid',
  PAYMENT_RECEIVED: 'payment.received',
  WALLET_CREDITED: 'wallet.credited',
  WALLET_DEBITED: 'wallet.debited',
  POINTS_EARNED: 'points.earned',
  POINTS_REDEEMED: 'points.redeemed',
  POINTS_EXPIRED: 'points.expired',
  POINTS_ADJUSTED: 'points.adjusted',
  TIER_CHANGED: 'tier.changed',
  TIER_BENEFIT_ACTIVATED: 'tier.benefit.activated',
  CASHBACK_ISSUED: 'cashback.issued',
  CASHBACK_APPROVED: 'cashback.approved',
  CASHBACK_REVERSED: 'cashback.reversed',
  REWARD_GRANTED: 'reward.granted',
  REWARD_MILESTONE: 'reward.milestone',
  GIFTCARD_CREATED: 'giftcard.created',
  GIFTCARD_ACTIVATED: 'giftcard.activated',
  GIFTCARD_REDEEMED: 'giftcard.redeemed',
  GIFTCARD_EXPIRED: 'giftcard.expired',
  GIFTCARD_RECHARGED: 'giftcard.recharged',
  GIFTCARD_CANCELLED: 'giftcard.cancelled',
  AFFILIATE_COMMISSION_EARNED: 'affiliate.commission.earned',
  AFFILIATE_COMMISSION_APPROVED: 'affiliate.commission.approved',
  AFFILIATE_COMMISSION_PAID: 'affiliate.commission.paid',
  PROMOTION_APPLIED: 'promotion.applied',
  PROMOTION_EXPIRED: 'promotion.expired',
  ENGAGEMENT_RULE_EVALUATED: 'engagement.rule.evaluated',
} as const
