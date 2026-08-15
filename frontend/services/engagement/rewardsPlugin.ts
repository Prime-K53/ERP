import { IEngagementPlugin, EngagementPluginContext } from '../../types/engagement-plugin'
import { EngagementPluginResult, CustomerReward, MilestoneRewardDef, ENGAGEMENT_EVENT_TYPES } from '../../types/engagement'
import { generateId } from '../transactions/_internal'
import { dbService } from '../db'
import { logger } from '../logger'
import { referralEventBus } from '../referralEventBus'

export const rewardsPlugin: IEngagementPlugin = {
  id: 'rewards',
  name: 'Customer Rewards',
  supportedEvents: ['invoice.paid', 'customer.created'],
  priority: 30,

  async enabled(context: EngagementPluginContext): Promise<boolean> {
    return context.companyConfig?.engagementSettings?.rewardsEnabled ?? false
  },

  async execute(event: any, context: EngagementPluginContext): Promise<EngagementPluginResult | null> {
    const { customer, companyConfig } = context
    if (!customer?.id) return null

    const settings = companyConfig?.engagementSettings
    if (!settings) return null

    if (event.eventType === 'customer.created') {
      return handleBirthdayCheck(customer.id, customer as any, settings, event)
    }

    if (event.eventType === 'invoice.paid') {
      const milestoneResult = await handleMilestoneCheck(customer.id, settings, event)
      const birthdayResult = await handleBirthdayCheck(customer.id, customer as any, settings, event)
      const anniversaryResult = await handleAnniversaryCheck(customer.id, customer as any, settings, event)

      const results = [milestoneResult, birthdayResult, anniversaryResult].filter(Boolean) as EngagementPluginResult[]

      if (results.length === 1) return results[0]
      if (results.length > 1) {
        return {
          applied: true,
          description: `Rewards granted: ${results.map((r) => r.description).join('; ')}`,
          points: results.reduce((sum, r) => sum + (r.points ?? 0), 0),
          cashback: results.reduce((sum, r) => sum + (r.cashback ?? 0), 0),
          metadata: { rewards: results.map((r) => r.metadata) },
        }
      }
    }

    return null
  },
}

async function handleMilestoneCheck(
  customerId: string,
  settings: any,
  event: any
): Promise<EngagementPluginResult | null> {
  const milestoneRewards: MilestoneRewardDef[] = settings?.milestoneRewards ?? []
  if (milestoneRewards.length === 0) return null

  try {
    const allRewards = await dbService.getAll<CustomerReward>('engagementCustomerRewards')
    const customerRewards = allRewards.filter((r: any) => r.customerId === customerId && r.type === 'milestone')
    const grantedMilestones = new Set(customerRewards.map((r: any) => r.milestoneKey))

    const pointsBalances = await dbService.getAll<any>('engagementPointBalances')
    const pointBalance = pointsBalances.find((b: any) => b.customerId === customerId)
    const totalPointsEarned = pointBalance?.totalEarned ?? 0

    const invoices = await dbService.getAll<any>('invoices')
    const paidInvoices = invoices.filter((inv: any) => inv.customerId === customerId && inv.status === 'paid')
    const purchaseCount = paidInvoices.length
    const totalSpend = paidInvoices.reduce((sum: number, inv: any) => sum + (inv.paidAmount ?? inv.total ?? 0), 0)

    for (const milestone of milestoneRewards) {
      if (grantedMilestones.has(milestone.key)) continue

      let qualified = false
      let currentValue = 0

      switch (milestone.type) {
        case 'purchase_count':
          currentValue = purchaseCount
          qualified = currentValue >= milestone.threshold
          break
        case 'total_spend':
          currentValue = totalSpend
          qualified = currentValue >= milestone.threshold
          break
        case 'points_earned':
          currentValue = totalPointsEarned
          qualified = currentValue >= milestone.threshold
          break
      }

      if (!qualified) continue

      const reward = await createReward(customerId, {
        type: 'milestone',
        milestoneKey: milestone.key,
        rewardType: milestone.rewardType,
        rewardValue: milestone.rewardValue,
        description: milestone.description || `Milestone reward: ${milestone.name}`,
      })

      referralEventBus.emit(ENGAGEMENT_EVENT_TYPES.REWARD_MILESTONE, {
        source: 'rewardsPlugin',
        entityType: 'reward',
        entityId: reward.id,
        data: { milestoneKey: milestone.key, type: milestone.rewardType, value: milestone.rewardValue, currentValue, threshold: milestone.threshold },
        actorId: event.actorId,
        correlationId: event.correlationId,
      })

      const pointsValue = milestone.rewardType === 'points' ? milestone.rewardValue : 0
      const cashbackValue = milestone.rewardType === 'wallet_credit' ? milestone.rewardValue : 0

      return {
        applied: true,
        description: `${milestone.name}: ${milestone.description}`,
        points: pointsValue,
        cashback: cashbackValue,
        metadata: { rewardId: reward.id, milestoneKey: milestone.key, type: milestone.rewardType, value: milestone.rewardValue },
      }
    }

    return null
  } catch (err) {
    logger.error('RewardsPlugin: milestone check failed:', err)
    return null
  }
}

async function handleBirthdayCheck(
  customerId: string,
  customer: any,
  settings: any,
  event: any
): Promise<EngagementPluginResult | null> {
  const birthdayRewardDays = settings?.birthdayRewardDays ?? 14
  if (birthdayRewardDays <= 0) return null

  const birthday = customer?.birthday
  if (!birthday) return null

  try {
    const allRewards = await dbService.getAll<CustomerReward>('engagementCustomerRewards')
    const existing = allRewards.find(
      (r: any) => r.customerId === customerId && r.type === 'birthday'
    )
    if (existing) return null

    const today = new Date()
    const birthDate = new Date(birthday)
    const thisYearBirthday = new Date(today.getFullYear(), birthDate.getMonth(), birthDate.getDate())
    const diffDays = Math.abs(Math.round((today.getTime() - thisYearBirthday.getTime()) / 86400000))

    if (diffDays > birthdayRewardDays) return null

    const rewardValue = settings?.pointsOnBirthday ?? 200

    const reward = await createReward(customerId, {
      type: 'birthday',
      rewardType: 'points',
      rewardValue,
      description: `Happy Birthday! ${rewardValue} bonus points`,
    })

    referralEventBus.emit(ENGAGEMENT_EVENT_TYPES.REWARD_GRANTED, {
      source: 'rewardsPlugin',
      entityType: 'reward',
      entityId: reward.id,
      data: { type: 'birthday', value: rewardValue },
      actorId: event.actorId,
      correlationId: event.correlationId,
    })

    return {
      applied: true,
      description: `Happy Birthday! ${rewardValue} bonus points`,
      points: rewardValue,
      metadata: { rewardId: reward.id, type: 'birthday' },
    }
  } catch (err) {
    logger.error('RewardsPlugin: birthday check failed:', err)
    return null
  }
}

async function handleAnniversaryCheck(
  customerId: string,
  customer: any,
  settings: any,
  event: any
): Promise<EngagementPluginResult | null> {
  const anniversaryRewardDays = settings?.anniversaryRewardDays ?? 14
  if (anniversaryRewardDays <= 0) return null

  const createdAt = customer?.createdAt
  if (!createdAt) return null

  try {
    const allRewards = await dbService.getAll<CustomerReward>('engagementCustomerRewards')
    const existing = allRewards.find(
      (r: any) => r.customerId === customerId && r.type === 'anniversary'
    )
    if (existing) return null

    const today = new Date()
    const created = new Date(createdAt)
    const yearsSinceCreation = today.getFullYear() - created.getFullYear()
    if (yearsSinceCreation < 1) return null

    const thisYearAnniversary = new Date(today.getFullYear(), created.getMonth(), created.getDate())
    const diffDays = Math.abs(Math.round((today.getTime() - thisYearAnniversary.getTime()) / 86400000))

    if (diffDays > anniversaryRewardDays) return null

    const rewardValue = Math.min(yearsSinceCreation * 100, 1000)

    const reward = await createReward(customerId, {
      type: 'anniversary',
      rewardType: 'points',
      rewardValue,
      description: `${yearsSinceCreation} year anniversary! ${rewardValue} bonus points`,
    })

    referralEventBus.emit(ENGAGEMENT_EVENT_TYPES.REWARD_GRANTED, {
      source: 'rewardsPlugin',
      entityType: 'reward',
      entityId: reward.id,
      data: { type: 'anniversary', years: yearsSinceCreation, value: rewardValue },
      actorId: event.actorId,
      correlationId: event.correlationId,
    })

    return {
      applied: true,
      description: `${yearsSinceCreation} year anniversary! ${rewardValue} bonus points`,
      points: rewardValue,
      metadata: { rewardId: reward.id, type: 'anniversary', years: yearsSinceCreation },
    }
  } catch (err) {
    logger.error('RewardsPlugin: anniversary check failed:', err)
    return null
  }
}

async function createReward(
  customerId: string,
  params: {
    type: CustomerReward['type']
    milestoneKey?: string
    rewardType: CustomerReward['rewardType']
    rewardValue: number
    description: string
  }
): Promise<CustomerReward> {
  const reward: CustomerReward = {
    id: generateId('RWD'),
    customerId,
    type: params.type,
    status: 'approved',
    rewardType: params.rewardType,
    rewardValue: params.rewardValue,
    description: params.description,
    milestoneKey: params.milestoneKey,
    grantedAt: new Date().toISOString(),
    grantedBy: 'system',
    createdAt: new Date().toISOString(),
  }

  await dbService.put('engagementCustomerRewards', reward as any)
  return reward
}

export default rewardsPlugin
