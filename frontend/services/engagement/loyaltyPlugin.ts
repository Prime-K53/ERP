import { IEngagementPlugin, EngagementPluginContext } from '../../types/engagement-plugin'
import { EngagementPluginResult, PointEntry, PointBalance, ENGAGEMENT_EVENT_TYPES } from '../../types/engagement'
import { generateId } from '../transactions/_internal'
import { dbService } from '../db'
import { logger } from '../logger'
import { referralEventBus } from '../referralEventBus'

export const loyaltyPlugin: IEngagementPlugin = {
  id: 'loyalty',
  name: 'Loyalty Points',
  supportedEvents: ['invoice.paid', 'customer.created', 'wallet.debited'],
  priority: 50,

  async enabled(context: EngagementPluginContext): Promise<boolean> {
    return context.companyConfig?.engagementSettings?.pointsEnabled ?? false
  },

  async execute(event: any, context: EngagementPluginContext): Promise<EngagementPluginResult | null> {
    const { customer, companyConfig } = context
    const settings = companyConfig?.engagementSettings
    if (!customer?.id) return null

    if (event.eventType === 'invoice.paid') {
      return handleInvoicePaid(event, customer.id, settings, context)
    }

    if (event.eventType === 'customer.created') {
      return handleCustomerCreated(customer.id, settings, context)
    }

    if (event.eventType === 'wallet.debited') {
      return handleWalletDebited(event, customer.id, settings, context)
    }

    return null
  },
}

async function handleInvoicePaid(
  event: any,
  customerId: string,
  settings: any,
  context: EngagementPluginContext
): Promise<EngagementPluginResult | null> {
  const paidAmount = event.data?.paidAmount ?? event.data?.amount ?? 0
  if (paidAmount <= 0) return null

  const earningRate = settings?.pointsEarningRate ?? 0.01
  const roundUp = settings?.pointsRoundUp ?? false
  const bonusMultiplier = settings?.bonusPointsMultiplier ?? 1

  let tierMultiplier = 1
  try {
    const customerTiers = await dbService.getAll<any>('engagementCustomerTiers')
    const activeTier = customerTiers.find((t: any) => t.customerId === customerId && t.isCurrent)
    if (activeTier) {
      const tiers = await dbService.getAll<any>('engagementMembershipTiers')
      const tierDef = tiers.find((t: any) => t.id === activeTier.tierId)
      if (tierDef?.pointMultiplier) tierMultiplier = tierDef.pointMultiplier
    }
  } catch (err) {
    logger.warn('Failed to read tier multiplier, using default:', err)
  }

  let rawPoints = paidAmount * earningRate * tierMultiplier * bonusMultiplier
  if (roundUp) rawPoints = Math.ceil(rawPoints)
  const points = Math.round(rawPoints * 100) / 100
  if (points <= 0) return null

  try {
    const expiryDays = settings?.pointsExpiryDays ?? 365
    const expiresAt = expiryDays > 0
      ? new Date(Date.now() + expiryDays * 86400000).toISOString()
      : undefined

    const balances = await dbService.getAll<PointBalance>('engagementPointBalances')
    let balance = balances.find((b: any) => b.customerId === customerId)
    const currentBalance = balance?.currentBalance ?? 0

    const pointEntry: PointEntry = {
      id: generateId('PTS'),
      customerId,
      points,
      balanceAfter: currentBalance + points,
      type: 'earned',
      referenceType: 'invoice',
      referenceId: event.data?.id || event.entityId,
      description: `Earned ${points} points from invoice payment`,
      tierMultiplier,
      expiresAt,
      createdAt: new Date().toISOString(),
    }

    if (balance) {
      balance.totalEarned = (balance.totalEarned ?? 0) + points
      balance.currentBalance = (balance.currentBalance ?? 0) + points
      balance.lastUpdated = new Date().toISOString()
    } else {
      balance = {
        id: generateId('PBL'),
        customerId,
        totalEarned: points,
        totalRedeemed: 0,
        currentBalance: points,
        pendingExpiry: 0,
        lastUpdated: new Date().toISOString(),
      } as any as PointBalance
    }

    await dbService.executeAtomicOperation(
      ['engagementPoints', 'engagementPointBalances'],
      async (tx) => {
        await tx.put('engagementPoints', pointEntry as any)
        await tx.put('engagementPointBalances', balance as any)
      }
    )

    referralEventBus.emit(ENGAGEMENT_EVENT_TYPES.POINTS_EARNED, {
      source: 'loyaltyPlugin',
      entityType: 'loyalty',
      entityId: pointEntry.id,
      data: { points, balanceAfter: balance.currentBalance, invoiceId: event.data?.id },
      actorId: event.actorId,
      correlationId: event.correlationId,
    })

    return {
      applied: true,
      description: `Earned ${points} loyalty points${tierMultiplier !== 1 ? ` (${tierMultiplier}x tier multiplier)` : ''}`,
      points,
      metadata: { balanceAfter: balance.currentBalance, multiplier: tierMultiplier, invoiceId: event.data?.id },
    }
  } catch (err) {
    logger.error('LoyaltyPlugin: failed to process invoice points:', err)
    return null
  }
}

async function handleCustomerCreated(
  customerId: string,
  settings: any,
  context: EngagementPluginContext
): Promise<EngagementPluginResult | null> {
  const bonusPoints = settings?.pointsOnRegistration ?? 0
  if (bonusPoints <= 0) return null

  try {
    const pointEntry: PointEntry = {
      id: generateId('PTS'),
      customerId,
      points: bonusPoints,
      balanceAfter: bonusPoints,
      type: 'bonus',
      referenceType: 'registration',
      description: `Welcome bonus: ${bonusPoints} points`,
      tierMultiplier: 1,
      createdAt: new Date().toISOString(),
    }

    const balance: PointBalance = {
      id: generateId('PBL'),
      customerId,
      totalEarned: bonusPoints,
      totalRedeemed: 0,
      currentBalance: bonusPoints,
      pendingExpiry: 0,
      lastUpdated: new Date().toISOString(),
    }

    await dbService.executeAtomicOperation(
      ['engagementPoints', 'engagementPointBalances'],
      async (tx) => {
        await tx.put('engagementPoints', pointEntry as any)
        await tx.put('engagementPointBalances', balance as any)
      }
    )

    referralEventBus.emit(ENGAGEMENT_EVENT_TYPES.POINTS_EARNED, {
      source: 'loyaltyPlugin',
      entityType: 'loyalty',
      entityId: pointEntry.id,
      data: { points: bonusPoints, balanceAfter: bonusPoints, reason: 'registration' },
      actorId: context.event?.actorId,
      correlationId: context.event?.correlationId,
    })

    return {
      applied: true,
      description: `Welcome bonus: ${bonusPoints} points`,
      points: bonusPoints,
      metadata: { reason: 'registration' },
    }
  } catch (err) {
    logger.error('LoyaltyPlugin: failed to process registration bonus:', err)
    return null
  }
}

async function handleWalletDebited(
  event: any,
  customerId: string,
  settings: any,
  context: EngagementPluginContext
): Promise<EngagementPluginResult | null> {
  const pointsRedeemed = event.data?.pointsRedeemed ?? 0
  if (pointsRedeemed <= 0) return null

  try {
    const balances = await dbService.getAll<PointBalance>('engagementPointBalances')
    const balance = balances.find((b: any) => b.customerId === customerId)
    if (!balance || (balance.currentBalance ?? 0) < pointsRedeemed) {
      logger.warn('LoyaltyPlugin: insufficient points for redemption')
      return null
    }

    const pointEntry: PointEntry = {
      id: generateId('PTS'),
      customerId,
      points: pointsRedeemed,
      balanceAfter: (balance.currentBalance ?? 0) - pointsRedeemed,
      type: 'redeemed',
      referenceType: 'wallet',
      referenceId: event.entityId,
      description: `Redeemed ${pointsRedeemed} points`,
      tierMultiplier: 1,
      redeemedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    }

    balance.totalRedeemed = (balance.totalRedeemed ?? 0) + pointsRedeemed
    balance.currentBalance = (balance.currentBalance ?? 0) - pointsRedeemed
    balance.lastUpdated = new Date().toISOString()

    await dbService.executeAtomicOperation(
      ['engagementPoints', 'engagementPointBalances'],
      async (tx) => {
        await tx.put('engagementPoints', pointEntry as any)
        await tx.put('engagementPointBalances', balance as any)
      }
    )

    referralEventBus.emit(ENGAGEMENT_EVENT_TYPES.POINTS_REDEEMED, {
      source: 'loyaltyPlugin',
      entityType: 'loyalty',
      entityId: pointEntry.id,
      data: { points: pointsRedeemed, balanceAfter: balance.currentBalance },
      actorId: event.actorId,
      correlationId: event.correlationId,
    })

    return {
      applied: true,
      description: `Redeemed ${pointsRedeemed} points`,
      points: -pointsRedeemed,
      metadata: { balanceAfter: balance.currentBalance },
    }
  } catch (err) {
    logger.error('LoyaltyPlugin: failed to process redemption:', err)
    return null
  }
}

export default loyaltyPlugin
