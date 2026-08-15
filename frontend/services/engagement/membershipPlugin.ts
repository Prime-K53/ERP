import { IEngagementPlugin, EngagementPluginContext } from '../../types/engagement-plugin'
import { EngagementPluginResult, MembershipTier, CustomerTier, ENGAGEMENT_EVENT_TYPES } from '../../types/engagement'
import { generateId } from '../transactions/_internal'
import { dbService } from '../db'
import { logger } from '../logger'
import { referralEventBus } from '../referralEventBus'

export const membershipPlugin: IEngagementPlugin = {
  id: 'membership',
  name: 'Membership Tiers',
  supportedEvents: ['invoice.paid', 'points.earned'],
  priority: 40,

  async enabled(context: EngagementPluginContext): Promise<boolean> {
    return context.companyConfig?.engagementSettings?.membershipEnabled ?? false
  },

  async execute(event: any, context: EngagementPluginContext): Promise<EngagementPluginResult | null> {
    const { customer, companyConfig } = context
    if (!customer?.id) return null

    if (event.eventType !== 'invoice.paid' && event.eventType !== 'points.earned') return null

    const settings = companyConfig?.engagementSettings
    const autoUpgrade = settings?.membershipAutoUpgrade ?? true
    const autoDowngrade = settings?.membershipAutoDowngrade ?? false
    if (!autoUpgrade && !autoDowngrade) return null

    try {
      const allTiers = await getAllTiers()
      if (allTiers.length === 0) return null

      const activeTiers = allTiers.filter((t: MembershipTier) => t.status === 'active')
      if (activeTiers.length === 0) return null

      const customerTiers = await dbService.getAll<CustomerTier>('engagementCustomerTiers')
      const currentAssignment = customerTiers.find((t: any) => t.customerId === customer.id && t.status === 'active')

      const totalSpend = await calculateCustomerSpend(customer.id)
      const purchaseCount = await calculatePurchaseCount(customer.id)
      const pointBalances = await dbService.getAll<any>('engagementPointBalances')
      const pointBalance = pointBalances.find((b: any) => b.customerId === customer.id)
      const totalPoints = pointBalance?.totalEarned ?? 0

      let eligibleTier: MembershipTier | null = null
      for (const tier of activeTiers.sort((a, b) => b.level - a.level)) {
        if (
          totalSpend >= (tier.entrySpend ?? 0) &&
          purchaseCount >= (tier.minFrequency ?? 0) &&
          totalPoints >= (tier.minClv ?? 0)
        ) {
          eligibleTier = tier
          break
        }
      }

      if (!eligibleTier) {
        const lowestTier = activeTiers.reduce((a, b) => a.level < b.level ? a : b)
        eligibleTier = lowestTier
      }

      if (!currentAssignment) {
        const newAssignment = await assignTier(customer.id, eligibleTier)
        return {
          applied: true,
          description: `Assigned to ${eligibleTier.name} tier`,
          tierChange: eligibleTier.name,
          metadata: { tierId: eligibleTier.id, tierLevel: eligibleTier.level, newAssignment: true },
        }
      }

      const currentTierDef = activeTiers.find((t: MembershipTier) => t.id === currentAssignment.tierId)
      if (!currentTierDef) {
        const newAssignment = await assignTier(customer.id, eligibleTier)
        return {
          applied: true,
          description: `Assigned to ${eligibleTier.name} tier`,
          tierChange: eligibleTier.name,
          metadata: { tierId: eligibleTier.id, tierLevel: eligibleTier.level, newAssignment: true },
        }
      }

      if (eligibleTier.level > currentTierDef.level && autoUpgrade) {
        currentAssignment.isCurrent = false
        currentAssignment.status = 'expired'
        currentAssignment.updatedAt = new Date().toISOString()
        await dbService.put('engagementCustomerTiers', currentAssignment as any)

        const newAssignment = await assignTier(customer.id, eligibleTier)

        referralEventBus.emit(ENGAGEMENT_EVENT_TYPES.TIER_CHANGED, {
          source: 'membershipPlugin',
          entityType: 'membership',
          entityId: newAssignment.id,
          data: { previousTier: currentTierDef.name, newTier: eligibleTier.name, direction: 'upgrade' },
          actorId: event.actorId,
          correlationId: event.correlationId,
        })

        return {
          applied: true,
          description: `Upgraded to ${eligibleTier.name} tier`,
          tierChange: eligibleTier.name,
          metadata: { previousTier: currentTierDef.name, tierId: eligibleTier.id, tierLevel: eligibleTier.level, upgrade: true },
        }
      }

      if (eligibleTier.level < currentTierDef.level && autoDowngrade) {
        currentAssignment.isCurrent = false
        currentAssignment.status = 'expired'
        currentAssignment.updatedAt = new Date().toISOString()
        await dbService.put('engagementCustomerTiers', currentAssignment as any)

        const newAssignment = await assignTier(customer.id, eligibleTier)

        referralEventBus.emit(ENGAGEMENT_EVENT_TYPES.TIER_CHANGED, {
          source: 'membershipPlugin',
          entityType: 'membership',
          entityId: newAssignment.id,
          data: { previousTier: currentTierDef.name, newTier: eligibleTier.name, direction: 'downgrade' },
          actorId: event.actorId,
          correlationId: event.correlationId,
        })

        return {
          applied: true,
          description: `Downgraded to ${eligibleTier.name} tier`,
          tierChange: eligibleTier.name,
          metadata: { previousTier: currentTierDef.name, tierId: eligibleTier.id, tierLevel: eligibleTier.level, downgrade: true },
        }
      }

      currentAssignment.lastEvaluated = new Date().toISOString()
      currentAssignment.updatedAt = new Date().toISOString()
      await dbService.put('engagementCustomerTiers', currentAssignment as any)

      return null
    } catch (err) {
      logger.error('MembershipPlugin: evaluation failed:', err)
      return null
    }
  },
}

async function getAllTiers(): Promise<MembershipTier[]> {
  try {
    return await dbService.getAll<MembershipTier>('engagementMembershipTiers')
  } catch {
    return []
  }
}

async function calculateCustomerSpend(customerId: string): Promise<number> {
  try {
    const invoices = await dbService.getAll<any>('invoices')
    return invoices
      .filter((inv: any) => inv.customerId === customerId && inv.status === 'paid')
      .reduce((sum: number, inv: any) => sum + (inv.paidAmount ?? inv.total ?? 0), 0)
  } catch {
    return 0
  }
}

async function calculatePurchaseCount(customerId: string): Promise<number> {
  try {
    const invoices = await dbService.getAll<any>('invoices')
    return invoices.filter((inv: any) => inv.customerId === customerId && inv.status === 'paid').length
  } catch {
    return 0
  }
}

async function assignTier(customerId: string, tier: MembershipTier): Promise<CustomerTier> {
  const assignment: CustomerTier = {
    id: generateId('CTR'),
    customerId,
    tierId: tier.id,
    assignedAt: new Date().toISOString(),
    periodStart: new Date().toISOString(),
    periodSpend: 0,
    periodCount: 0,
    lastEvaluated: new Date().toISOString(),
    status: 'active',
    createdAt: new Date().toISOString(),
  }

  await dbService.put('engagementCustomerTiers', assignment as any)
  return assignment
}

export default membershipPlugin
