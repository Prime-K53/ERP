export interface ReferralTimelineEntry {
  id: string
  referralId: string
  eventType: 'created' | 'reward_earned' | 'reward_approved' | 'reward_paid' | 'reward_rejected' | 'reward_reversed' | 'referral_converted' | 'referral_expired' | 'referral_cancelled' | 'campaign_applied' | 'note_added'
  title: string
  description?: string
  amount?: number
  actorId?: string
  actorName?: string
  metadata?: Record<string, any>
  timestamp: string
  createdAt?: string
}

export interface ReferralAuditEntry {
  id: string
  entityType: 'referral' | 'reward' | 'campaign' | 'setting' | 'reversal'
  entityId: string
  action: 'created' | 'updated' | 'cancelled' | 'approved' | 'rejected' | 'reversed' | 'expired' | 'configured'
  actorId: string
  actorName?: string
  fieldName?: string
  oldValue?: any
  newValue?: any
  reason?: string
  ipAddress?: string
  userAgent?: string
  timestamp: string
  correlationId?: string
  createdAt?: string
}

export interface ReferralCampaign {
  id: string
  name: string
  description?: string
  startDate: string
  endDate?: string
  status: 'draft' | 'active' | 'paused' | 'completed' | 'cancelled'
  rewardType: 'fixed' | 'percentage' | 'hybrid'
  rewardValue: number
  rewardPercentage: number
  minPurchaseAmount: number
  maxRewardAmount: number
  maxRewardsPerCustomer: number
  maxTotalRewards: number
  totalRewardsGiven: number
  targetCustomerSegments?: string[]
  excludedCustomerIds?: string[]
  bonusMultiplier?: number
  termsAndConditions?: string
  createdBy?: string
  approvedBy?: string
  createdAt?: string
  updatedAt?: string
}

export interface ReferralAnalytics {
  id?: string
  period: 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'yearly'
  periodStart: string
  periodEnd: string
  totalReferrals: number
  activeReferrals: number
  convertedReferrals: number
  totalRewardsAmount: number
  approvedRewardsAmount: number
  paidRewardsAmount: number
  pendingRewardsAmount: number
  reversedRewardsAmount: number
  averageRewardAmount: number
  conversionRate: number
  topReferrers?: Array<{ customerId: string; customerName: string; referralCount: number; rewardsAmount: number }>
  campaignBreakdown?: Record<string, { referrals: number; rewards: number; amount: number }>
  revenueAttributed: number
  roi: number
  generatedAt: string
}

export interface ReferralEvent {
  id: string
  eventType: string
  source: string
  entityType: string
  entityId: string
  data?: Record<string, any>
  correlationId?: string
  actorId?: string
  timestamp: string
  processed: boolean
  processedAt?: string
  error?: string
  retryCount: number
  maxRetries: number
}

export interface ReversalRequest {
  id: string
  rewardId: string
  reason: string
  status: 'pending' | 'approved' | 'rejected' | 'completed'
  requestedBy: string
  requestedAt: string
  approvedBy?: string
  approvedAt?: string
  rejectedBy?: string
  rejectedAt?: string
  rejectReason?: string
  completedAt?: string
  walletTransactionId?: string
  ledgerEntryId?: string
  notes?: string
  createdAt?: string
  updatedAt?: string
}

export interface ReferralRule {
  id: string
  name: string
  description?: string
  ruleType: 'eligibility' | 'reward_calc' | 'approval' | 'expiry' | 'campaign_qualification'
  conditions: Record<string, any>
  actions: Record<string, any>
  priority: number
  enabled: boolean
  createdAt?: string
  updatedAt?: string
}

export const REFERRAL_EVENT_TYPES = {
  REFERRAL_CREATED: 'referral.created',
  REWARD_EARNED: 'reward.earned',
  REWARD_APPROVED: 'reward.approved',
  REWARD_REJECTED: 'reward.rejected',
  REWARD_PAID: 'reward.paid',
  REWARD_REVERSED: 'reward.reversed',
  REFERRAL_CONVERTED: 'referral.converted',
  REFERRAL_EXPIRED: 'referral.expired',
  REFERRAL_CANCELLED: 'referral.cancelled',
  CAMPAIGN_STARTED: 'campaign.started',
  CAMPAIGN_ENDED: 'campaign.ended',
  CAMPAIGN_PAUSED: 'campaign.paused',
  RULE_EVALUATED: 'rule.evaluated',
} as const
