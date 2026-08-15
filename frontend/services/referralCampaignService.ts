import { ReferralCampaign } from '../types/referral-extended'
import { dbService } from './db'
import { generateId } from './transactions/_internal'
import { referralEventBus } from './referralEventBus'
import { referralAuditService } from './referralAuditService'
import { logger } from './logger'

export const referralCampaignService = {
  async createCampaign(params: {
    name: string
    description?: string
    startDate: string
    endDate?: string
    rewardType: 'fixed' | 'percentage' | 'hybrid'
    rewardValue: number
    rewardPercentage: number
    minPurchaseAmount: number
    maxRewardAmount: number
    maxRewardsPerCustomer: number
    maxTotalRewards: number
    bonusMultiplier?: number
    targetCustomerSegments?: string[]
    excludedCustomerIds?: string[]
    termsAndConditions?: string
    createdBy?: string
  }): Promise<ReferralCampaign> {
    const campaign: ReferralCampaign = {
      id: generateId('CAMP'),
      name: params.name,
      description: params.description,
      startDate: params.startDate,
      endDate: params.endDate,
      status: 'draft',
      rewardType: params.rewardType,
      rewardValue: params.rewardValue,
      rewardPercentage: params.rewardPercentage,
      minPurchaseAmount: params.minPurchaseAmount,
      maxRewardAmount: params.maxRewardAmount,
      maxRewardsPerCustomer: params.maxRewardsPerCustomer,
      maxTotalRewards: params.maxTotalRewards,
      totalRewardsGiven: 0,
      targetCustomerSegments: params.targetCustomerSegments,
      excludedCustomerIds: params.excludedCustomerIds,
      bonusMultiplier: params.bonusMultiplier,
      termsAndConditions: params.termsAndConditions,
      createdBy: params.createdBy,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    await dbService.put('referralCampaigns', campaign)

    await referralAuditService.log({
      entityType: 'campaign',
      entityId: campaign.id,
      action: 'created',
      actorId: params.createdBy || 'system',
      newValue: campaign,
    })

    return campaign
  },

  async updateCampaign(id: string, updates: Partial<ReferralCampaign>, updatedBy?: string): Promise<ReferralCampaign> {
    const all = (await dbService.getAll<ReferralCampaign>('referralCampaigns')) || []
    const campaign = all.find(c => c.id === id)
    if (!campaign) throw new Error('Campaign not found')

    const oldValue = { ...campaign }
    Object.assign(campaign, updates, {
      updatedAt: new Date().toISOString(),
    })
    await dbService.put('referralCampaigns', campaign)

    await referralAuditService.log({
      entityType: 'campaign',
      entityId: id,
      action: 'updated',
      actorId: updatedBy || 'system',
      oldValue,
      newValue: updates,
    })

    return campaign
  },

  async activateCampaign(id: string, activatedBy?: string): Promise<ReferralCampaign> {
    const all = (await dbService.getAll<ReferralCampaign>('referralCampaigns')) || []
    const campaign = all.find(c => c.id === id)
    if (!campaign) throw new Error('Campaign not found')

    campaign.status = 'active'
    campaign.updatedAt = new Date().toISOString()
    await dbService.put('referralCampaigns', campaign)

    await referralEventBus.emit('campaign.started', {
      source: 'referralCampaignService',
      entityType: 'campaign',
      entityId: id,
      data: { campaignName: campaign.name },
      actorId: activatedBy,
    })

    await referralAuditService.log({
      entityType: 'campaign',
      entityId: id,
      action: 'updated',
      actorId: activatedBy || 'system',
      fieldName: 'status',
      oldValue: 'draft',
      newValue: 'active',
    })

    return campaign
  },

  async pauseCampaign(id: string, pausedBy?: string): Promise<ReferralCampaign> {
    const all = (await dbService.getAll<ReferralCampaign>('referralCampaigns')) || []
    const campaign = all.find(c => c.id === id)
    if (!campaign) throw new Error('Campaign not found')

    campaign.status = 'paused'
    campaign.updatedAt = new Date().toISOString()
    await dbService.put('referralCampaigns', campaign)

    await referralEventBus.emit('campaign.paused', {
      source: 'referralCampaignService',
      entityType: 'campaign',
      entityId: id,
      data: { campaignName: campaign.name },
      actorId: pausedBy,
    })

    return campaign
  },

  async endCampaign(id: string, endedBy?: string): Promise<ReferralCampaign> {
    const all = (await dbService.getAll<ReferralCampaign>('referralCampaigns')) || []
    const campaign = all.find(c => c.id === id)
    if (!campaign) throw new Error('Campaign not found')

    campaign.status = 'completed'
    campaign.updatedAt = new Date().toISOString()
    await dbService.put('referralCampaigns', campaign)

    await referralEventBus.emit('campaign.ended', {
      source: 'referralCampaignService',
      entityType: 'campaign',
      entityId: id,
      data: { campaignName: campaign.name },
      actorId: endedBy,
    })

    return campaign
  },

  async getActiveCampaigns(): Promise<ReferralCampaign[]> {
    const all = (await dbService.getAll<ReferralCampaign>('referralCampaigns')) || []
    return all.filter(c => c.status === 'active')
  },

  async getCampaignsByStatus(status: ReferralCampaign['status']): Promise<ReferralCampaign[]> {
    const all = (await dbService.getAll<ReferralCampaign>('referralCampaigns')) || []
    return all.filter(c => c.status === status)
  },

  async getAllCampaigns(): Promise<ReferralCampaign[]> {
    return (await dbService.getAll<ReferralCampaign>('referralCampaigns')) || []
  },

  async getApplicableCampaign(invoiceCustomerId: string, paidAmount: number): Promise<ReferralCampaign | null> {
    const active = await this.getActiveCampaigns()
    const now = new Date()

    for (const campaign of active) {
      const start = new Date(campaign.startDate)
      const end = campaign.endDate ? new Date(campaign.endDate) : null
      if (now < start || (end && now > end)) continue
      if (paidAmount < campaign.minPurchaseAmount) continue
      if (campaign.excludedCustomerIds?.includes(invoiceCustomerId)) continue
      if (campaign.maxTotalRewards > 0 && campaign.totalRewardsGiven >= campaign.maxTotalRewards) continue

      return campaign
    }
    return null
  },
}

export default referralCampaignService
