import { Referral, ReferralReward } from '../types/referral'
import { ReferralCampaign, ReversalRequest } from '../types/referral-extended'
import { notificationService } from './notificationService'
import { referralEventBus } from './referralEventBus'
import { logger } from './logger'

export const referralNotificationService = {
  initialize(): void {
    referralEventBus.on('referral.created', async (event) => {
      const data = event.data || {}
      notificationService.notify({
        type: 'success',
        title: 'New Referral Registered',
        message: `Customer ${data.referredByName || ''} referred a new customer`,
        entityType: 'referral',
        entityId: event.entityId,
        metadata: { ...data, eventId: event.id },
      })
    })

    referralEventBus.on('reward.earned', async (event) => {
      const data = event.data || {}
      notificationService.notify({
        type: 'success',
        title: 'Referral Reward Earned',
        message: `Reward of ${data.amount || 0} earned. Needs ${data.needsApproval ? 'approval' : 'auto-approved'}`,
        entityType: 'reward',
        entityId: event.entityId,
        metadata: { ...data, eventId: event.id },
      })
    })

    referralEventBus.on('reward.approved', async (event) => {
      const data = event.data || {}
      notificationService.notify({
        type: 'success',
        title: 'Referral Reward Approved',
        message: `Reward of ${data.amount || 0} approved and credited to wallet`,
        entityType: 'reward',
        entityId: event.entityId,
        metadata: { ...data, eventId: event.id },
      })
    })

    referralEventBus.on('reward.paid', async (event) => {
      const data = event.data || {}
      notificationService.notify({
        type: 'success',
        title: 'Referral Reward Paid',
        message: `Reward of ${data.amount || 0} paid to referrer`,
        entityType: 'reward',
        entityId: event.entityId,
        metadata: { ...data, eventId: event.id },
      })
    })

    referralEventBus.on('reward.reversed', async (event) => {
      const data = event.data || {}
      notificationService.notify({
        type: 'warning',
        title: 'Referral Reward Reversed',
        message: `Reward reversed: ${data.reason || 'No reason provided'}`,
        entityType: 'reward',
        entityId: event.entityId,
        metadata: { ...data, eventId: event.id },
      })
    })

    referralEventBus.on('campaign.started', async (event) => {
      const data = event.data || {}
      notificationService.notify({
        type: 'info',
        title: 'Referral Campaign Started',
        message: `Campaign "${data.campaignName || 'Unknown'}" is now active`,
        entityType: 'campaign',
        entityId: event.entityId,
        metadata: { ...data, eventId: event.id },
      })
    })

    referralEventBus.on('campaign.ended', async (event) => {
      const data = event.data || {}
      notificationService.notify({
        type: 'info',
        title: 'Referral Campaign Ended',
        message: `Campaign "${data.campaignName || 'Unknown'}" has ended`,
        entityType: 'campaign',
        entityId: event.entityId,
        metadata: { ...data, eventId: event.id },
      })
    })
  },

  async notifyRewardPendingApproval(reward: ReferralReward): Promise<void> {
    notificationService.notify({
      type: 'info',
      title: 'Referral Reward Pending Approval',
      message: `Reward of ${reward.amount} for invoice #${reward.invoiceId} requires approval`,
      entityType: 'reward',
      entityId: reward.id,
      metadata: { rewardId: reward.id, amount: reward.amount, invoiceId: reward.invoiceId },
    })
  },

  async notifyCampaignToCustomers(campaign: ReferralCampaign, customerIds: string[]): Promise<void> {
    for (const customerId of customerIds) {
      notificationService.notify({
        type: 'info',
        title: `Campaign: ${campaign.name}`,
        message: `New referral campaign active! ${campaign.description || 'Check it out for bonus rewards.'}`,
        entityType: 'campaign',
        entityId: campaign.id,
        userId: customerId,
        metadata: { campaignId: campaign.id, campaignName: campaign.name },
      })
    }
  },
}

export default referralNotificationService

referralNotificationService.initialize()
logger.info('Referral notification service initialized')
