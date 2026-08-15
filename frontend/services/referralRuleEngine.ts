import { ReferralSettings, DEFAULT_REFERRAL_SETTINGS, ReferralReward } from '../types/referral'
import { ReferralRule, ReferralCampaign } from '../types/referral-extended'
import { referralEventBus } from './referralEventBus'
import { logger } from './logger'

export interface RuleEvaluationResult {
  allowed: boolean
  reason?: string
  rewardAmount?: number
  ruleApplied?: string
  campaignMultiplier?: number
}

const getCompanyConfig = () => {
  const saved = localStorage.getItem('nexus_company_config')
  if (saved) {
    try { return JSON.parse(saved) } catch { }
  }
  return null
}

const getReferralSettings = (): ReferralSettings => {
  const config = getCompanyConfig()
  return { ...DEFAULT_REFERRAL_SETTINGS, ...(config?.referralSettings || {}) }
}

const toMoney = (v: number): number => Math.round(v * 100) / 100

const DEFAULT_RULES: ReferralRule[] = [
  {
    id: 'rule-self-referral',
    name: 'Self-Referral Prevention',
    ruleType: 'eligibility',
    priority: 100,
    enabled: true,
    conditions: { preventSelfReferral: true },
    actions: { block: true, errorMessage: 'Self-referral is not allowed' },
  },
  {
    id: 'rule-duplicate',
    name: 'Duplicate Referral Prevention',
    ruleType: 'eligibility',
    priority: 90,
    enabled: true,
    conditions: { preventDuplicates: true },
    actions: { block: true, errorMessage: 'This referral already exists and is active' },
  },
  {
    id: 'rule-min-purchase',
    name: 'Minimum Purchase Requirement',
    ruleType: 'eligibility',
    priority: 80,
    enabled: true,
    conditions: { minPurchaseRequired: true },
    actions: { block: true, errorMessage: 'Purchase amount does not meet minimum requirement' },
  },
  {
    id: 'rule-max-reward',
    name: 'Maximum Reward Cap',
    ruleType: 'reward_calc',
    priority: 70,
    enabled: true,
    conditions: { applyCap: true },
    actions: { capAmount: true },
  },
  {
    id: 'rule-expiry',
    name: 'Referral Expiry',
    ruleType: 'expiry',
    priority: 60,
    enabled: true,
    conditions: { enableExpiry: true },
    actions: { expiryDays: 365 },
  },
]

export const referralRuleEngine = {
  getDefaultRules(): ReferralRule[] {
    return [...DEFAULT_RULES]
  },

  async evaluateEligibility(params: {
    customerId: string
    referredById: string
    paidAmount: number
    existingReferrals?: Array<{ customerId: string; referredById: string; status: string }>
  }): Promise<RuleEvaluationResult> {
    const settings = getReferralSettings()

    if (settings.selfReferralPrevention && params.customerId === params.referredById) {
      return { allowed: false, reason: 'Self-referral is not allowed' }
    }

    const duplicate = params.existingReferrals?.find(
      r => r.customerId === params.customerId && r.referredById === params.referredById && r.status === 'active'
    )
    if (duplicate) {
      return { allowed: false, reason: 'This referral already exists and is active' }
    }

    if (params.paidAmount < settings.minPurchaseAmount) {
      return { allowed: false, reason: `Minimum purchase amount of ${settings.minPurchaseAmount} not met` }
    }

    return { allowed: true }
  },

  async calculateReward(params: {
    paidAmount: number
    campaign?: ReferralCampaign | null
  }): Promise<RuleEvaluationResult> {
    const settings = getReferralSettings()
    const campaign = params.campaign

    let rewardAmount = 0
    let rewardType = settings.rewardType
    let rewardValue = settings.rewardValue
    let rewardPercentage = settings.rewardPercentage
    let multiplier = 1

    if (campaign && campaign.status === 'active') {
      rewardType = campaign.rewardType
      rewardValue = campaign.rewardValue
      rewardPercentage = campaign.rewardPercentage
      multiplier = campaign.bonusMultiplier || 1
      const now = new Date()
      const start = new Date(campaign.startDate)
      const end = campaign.endDate ? new Date(campaign.endDate) : null
      if (now >= start && (!end || now <= end)) {
      } else {
        return { allowed: false, reason: 'Campaign is not active for current date' }
      }
    }

    if (rewardType === 'fixed') {
      rewardAmount = rewardValue * multiplier
    } else if (rewardType === 'percentage') {
      rewardAmount = toMoney(params.paidAmount * (rewardPercentage / 100) * multiplier)
    } else if (rewardType === 'hybrid') {
      rewardAmount = toMoney((rewardValue + params.paidAmount * (rewardPercentage / 100)) * multiplier)
    }

    if (settings.maxRewardAmount > 0 && rewardAmount > settings.maxRewardAmount) {
      if (campaign && campaign.maxRewardAmount > 0) {
        rewardAmount = Math.min(settings.maxRewardAmount, campaign.maxRewardAmount)
      } else {
        rewardAmount = settings.maxRewardAmount
      }
    } else if (campaign && campaign.maxRewardAmount > 0 && rewardAmount > campaign.maxRewardAmount) {
      rewardAmount = campaign.maxRewardAmount
    }

    if (rewardAmount <= 0) {
      return { allowed: false, reason: 'Calculated reward amount is zero or negative' }
    }

    return { allowed: true, rewardAmount, campaignMultiplier: multiplier }
  },

  async evaluateApprovalRequirement(params: {
    rewardAmount: number
    customerTotalRewards?: number
    campaign?: ReferralCampaign | null
  }): Promise<{ needsApproval: boolean; reason?: string }> {
    const settings = getReferralSettings()
    if (!settings.requireApproval) {
      return { needsApproval: false }
    }
    if (params.rewardAmount <= settings.autoApproveThreshold) {
      return { needsApproval: false }
    }
    if (params.campaign && params.campaign.maxRewardsPerCustomer > 0) {
      const used = params.customerTotalRewards || 0
      if (used >= params.campaign.maxRewardsPerCustomer) {
        return { needsApproval: true, reason: 'Campaign max rewards per customer reached' }
      }
    }
    return { needsApproval: true, reason: `Reward amount ${params.rewardAmount} exceeds auto-approve threshold of ${settings.autoApproveThreshold}` }
  },

  async evaluateExpiry(referralDate: string): Promise<{ expired: boolean; expiredAt?: string }> {
    const settings = getReferralSettings()
    if (!settings.expiryDays || settings.expiryDays <= 0) {
      return { expired: false }
    }
    const created = new Date(referralDate)
    const expiryDate = new Date(created)
    expiryDate.setDate(expiryDate.getDate() + settings.expiryDays)
    const now = new Date()
    if (now >= expiryDate) {
      return { expired: true, expiredAt: expiryDate.toISOString() }
    }
    return { expired: false }
  },
}

export default referralRuleEngine
