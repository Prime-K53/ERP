import { IEngagementPlugin, EngagementPluginContext } from '../../types/engagement-plugin'
import { EngagementPluginResult, AffiliateAccount, AffiliateCommission, ENGAGEMENT_EVENT_TYPES } from '../../types/engagement'
import { generateId } from '../transactions/_internal'
import { dbService } from '../db'
import { logger } from '../logger'
import { referralEventBus } from '../referralEventBus'

export const affiliatePlugin: IEngagementPlugin = {
  id: 'affiliate',
  name: 'Affiliate Program',
  supportedEvents: ['invoice.paid'],
  priority: 35,

  async enabled(context: EngagementPluginContext): Promise<boolean> {
    return context.companyConfig?.engagementSettings?.affiliateEnabled ?? false
  },

  async execute(event: any, context: EngagementPluginContext): Promise<EngagementPluginResult | null> {
    const { companyConfig } = context
    if (!event.data?.customerId && !event.data?.referredById) return null

    const referredById = event.data?.referredById
    if (!referredById) return null

    const settings = companyConfig?.engagementSettings
    const paidAmount = event.data?.paidAmount ?? event.data?.amount ?? 0
    if (paidAmount <= 0) return null

    try {
      const allAffiliates = await dbService.getAll<AffiliateAccount>('engagementAffiliates')
      const affiliate = allAffiliates.find((a: any) => a.customerId === referredById && a.status === 'active')
      if (!affiliate) return null

      const defaultRate = settings?.affiliateDefaultRate ?? 5
      const rate = affiliate.commissionRate > 0 ? affiliate.commissionRate : defaultRate
      const commissionType = affiliate.commissionType ?? settings?.affiliateType ?? 'percentage'
      const requireApproval = settings?.affiliateRequireApproval ?? false
      const autoApproveThreshold = settings?.affiliateAutoApproveThreshold ?? 100

      let amount: number
      if (commissionType === 'fixed') {
        amount = affiliate.fixedCommission > 0 ? affiliate.fixedCommission : (settings?.affiliateFixedAmount ?? 0)
      } else {
        amount = paidAmount * (rate / 100)
      }

      if (amount <= 0) return null
      amount = Math.round(amount * 100) / 100

      const invoiceId = event.data?.id || event.entityId
      const referredCustomerId = event.data?.customerId

      let commissionStatus: AffiliateCommission['status'] = 'approved'
      if (requireApproval && amount > autoApproveThreshold) {
        commissionStatus = 'pending'
      }

      const commission: AffiliateCommission = {
        id: generateId('AFFC'),
        affiliateId: affiliate.id,
        referralId: event.data?.referralId,
        invoiceId,
        customerId: referredCustomerId,
        amount,
        rate,
        status: commissionStatus,
        createdAt: new Date().toISOString(),
      }

      await dbService.put('engagementAffiliateCommissions', commission as any)

      affiliate.totalEarned = (affiliate.totalEarned ?? 0) + amount
      if (commissionStatus === 'pending') {
        affiliate.totalPending = (affiliate.totalPending ?? 0) + amount
      }
      affiliate.updatedAt = new Date().toISOString()
      await dbService.put('engagementAffiliates', affiliate as any)

      referralEventBus.emit(ENGAGEMENT_EVENT_TYPES.AFFILIATE_COMMISSION_EARNED, {
        source: 'affiliatePlugin',
        entityType: 'affiliate',
        entityId: commission.id,
        data: { affiliateId: affiliate.id, amount, rate, status: commissionStatus, invoiceId },
        actorId: event.actorId,
        correlationId: event.correlationId,
      })

      return {
        applied: true,
        description: `Affiliate commission $${amount} earned (${rate}%)${commissionStatus === 'pending' ? ' — pending' : ''}`,
        cashback: amount,
        metadata: { commissionId: commission.id, affiliateId: affiliate.id, rate, status: commissionStatus },
      }
    } catch (err) {
      logger.error('AffiliatePlugin: commission processing failed:', err)
      return null
    }
  },
}

export async function approveAffiliateCommission(commissionId: string, approvedBy: string): Promise<void> {
  try {
    const all = await dbService.getAll<AffiliateCommission>('engagementAffiliateCommissions')
    const commission = all.find((c: any) => c.id === commissionId)
    if (!commission || commission.status !== 'pending') throw new Error('Commission not found or not pending')

    commission.status = 'approved'
    commission.approvedAt = new Date().toISOString()
    commission.approvedBy = approvedBy
    await dbService.put('engagementAffiliateCommissions', commission as any)

    const allAffiliates = await dbService.getAll<AffiliateAccount>('engagementAffiliates')
    const affiliate = allAffiliates.find((a: any) => a.id === commission.affiliateId)
    if (affiliate) {
      affiliate.totalPending = Math.max(0, (affiliate.totalPending ?? 0) - commission.amount)
      affiliate.updatedAt = new Date().toISOString()
      await dbService.put('engagementAffiliates', affiliate as any)
    }

    referralEventBus.emit(ENGAGEMENT_EVENT_TYPES.AFFILIATE_COMMISSION_APPROVED, {
      source: 'affiliatePlugin',
      entityType: 'affiliate',
      entityId: commissionId,
      data: { amount: commission.amount },
      actorId: approvedBy,
    })
  } catch (err) {
    logger.error('AffiliatePlugin: approveCommission failed:', err)
    throw err
  }
}

export async function payAffiliateCommission(commissionId: string, walletTxId: string): Promise<void> {
  try {
    const all = await dbService.getAll<AffiliateCommission>('engagementAffiliateCommissions')
    const commission = all.find((c: any) => c.id === commissionId)
    if (!commission) throw new Error('Commission not found')

    commission.status = 'paid'
    commission.paidAt = new Date().toISOString()
    commission.walletTxId = walletTxId
    await dbService.put('engagementAffiliateCommissions', commission as any)

    const allAffiliates = await dbService.getAll<AffiliateAccount>('engagementAffiliates')
    const affiliate = allAffiliates.find((a: any) => a.id === commission.affiliateId)
    if (affiliate) {
      affiliate.totalPaid = (affiliate.totalPaid ?? 0) + commission.amount
      affiliate.updatedAt = new Date().toISOString()
      await dbService.put('engagementAffiliates', affiliate as any)
    }

    referralEventBus.emit(ENGAGEMENT_EVENT_TYPES.AFFILIATE_COMMISSION_PAID, {
      source: 'affiliatePlugin',
      entityType: 'affiliate',
      entityId: commissionId,
      data: { amount: commission.amount, walletTxId },
    })
  } catch (err) {
    logger.error('AffiliatePlugin: payCommission failed:', err)
    throw err
  }
}

export default affiliatePlugin
