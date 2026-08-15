import { referralEventBus } from './referralEventBus'
import { notificationService } from './notificationService'
import { logger } from './logger'

export const engagementNotificationService = {
  initialize(): void {
    const bus = referralEventBus

    bus.on('points.earned', async (event) => {
      const data = event.data || {}
      notificationService.notify({
        type: 'success',
        title: 'Points Earned',
        message: `${data.points || 0} points earned. Balance: ${data.balanceAfter || 0}`,
        entityType: 'loyalty',
        entityId: event.entityId,
        metadata: { ...data, eventId: event.id },
      })
    })

    bus.on('points.redeemed', async (event) => {
      const data = event.data || {}
      notificationService.notify({
        type: 'info',
        title: 'Points Redeemed',
        message: `${data.points || 0} points redeemed. Balance: ${data.balanceAfter || 0}`,
        entityType: 'loyalty',
        entityId: event.entityId,
        metadata: { ...data, eventId: event.id },
      })
    })

    bus.on('cashback.issued', async (event) => {
      const data = event.data || {}
      notificationService.notify({
        type: 'success',
        title: 'Cashback Issued',
        message: `$${data.amount || 0} cashback${data.status === 'pending' ? ' (pending approval)' : ''}`,
        entityType: 'cashback',
        entityId: event.entityId,
        metadata: { ...data, eventId: event.id },
      })
    })

    bus.on('cashback.approved', async (event) => {
      const data = event.data || {}
      notificationService.notify({
        type: 'success',
        title: 'Cashback Approved',
        message: `$${data.amount || 0} cashback approved`,
        entityType: 'cashback',
        entityId: event.entityId,
        metadata: { ...data, eventId: event.id },
      })
    })

    bus.on('cashback.reversed', async (event) => {
      const data = event.data || {}
      notificationService.notify({
        type: 'warning',
        title: 'Cashback Reversed',
        message: `$${data.amount || 0} cashback reversed: ${data.reason || ''}`,
        entityType: 'cashback',
        entityId: event.entityId,
        metadata: { ...data, eventId: event.id },
      })
    })

    bus.on('tier.changed', async (event) => {
      const data = event.data || {}
      notificationService.notify({
        type: 'info',
        title: 'Tier Change',
        message: `${data.direction === 'upgrade' ? 'Upgraded' : 'Downgraded'} to ${data.newTier || ''}`,
        entityType: 'membership',
        entityId: event.entityId,
        metadata: { ...data, eventId: event.id },
      })
    })

    bus.on('giftcard.created', async (event) => {
      const data = event.data || {}
      notificationService.notify({
        type: 'success',
        title: 'Gift Card Created',
        message: `Gift card ${data.code || ''} — $${data.initialBalance || 0}`,
        entityType: 'giftcard',
        entityId: event.entityId,
        metadata: { ...data, eventId: event.id },
      })
    })

    bus.on('giftcard.redeemed', async (event) => {
      const data = event.data || {}
      notificationService.notify({
        type: 'info',
        title: 'Gift Card Redeemed',
        message: `$${data.amount || 0} redeemed from ${data.code || ''}. Balance: $${data.balanceAfter || 0}`,
        entityType: 'giftcard',
        entityId: event.entityId,
        metadata: { ...data, eventId: event.id },
      })
    })

    bus.on('affiliate.commission.earned', async (event) => {
      const data = event.data || {}
      notificationService.notify({
        type: 'success',
        title: 'Affiliate Commission',
        message: `$${data.amount || 0} commission earned${data.status === 'pending' ? ' (pending)' : ''}`,
        entityType: 'affiliate',
        entityId: event.entityId,
        metadata: { ...data, eventId: event.id },
      })
    })

    bus.on('affiliate.commission.paid', async (event) => {
      const data = event.data || {}
      notificationService.notify({
        type: 'success',
        title: 'Commission Paid',
        message: `$${data.amount || 0} commission paid to wallet`,
        entityType: 'affiliate',
        entityId: event.entityId,
        metadata: { ...data, eventId: event.id },
      })
    })

    bus.on('promotion.applied', async (event) => {
      const data = event.data || {}
      notificationService.notify({
        type: 'success',
        title: 'Promotion Applied',
        message: `$${data.totalDiscount || 0} discount applied`,
        entityType: 'promotion',
        entityId: event.entityId,
        metadata: { ...data, eventId: event.id },
      })
    })

    bus.on('reward.granted', async (event) => {
      const data = event.data || {}
      notificationService.notify({
        type: 'success',
        title: 'Reward Granted',
        message: `${data.type || ''} reward — ${data.value || 0}`,
        entityType: 'reward',
        entityId: event.entityId,
        metadata: { ...data, eventId: event.id },
      })
    })

    bus.on('reward.milestone', async (event) => {
      const data = event.data || {}
      notificationService.notify({
        type: 'success',
        title: 'Milestone Reached!',
        message: `${data.milestoneKey || ''} — ${data.type || ''} reward of ${data.value || 0}`,
        entityType: 'reward',
        entityId: event.entityId,
        metadata: { ...data, eventId: event.id },
      })
    })

    logger.info('Engagement notification service initialized')
  },
}

engagementNotificationService.initialize()
export default engagementNotificationService
