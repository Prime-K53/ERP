const repo = require('./supabaseRepository.cjs');

class ReferralNotificationService {
  async sendRewardApprovedNotification(reward, referral) {
    return this._sendNotification({
      type: 'reward_approved',
      title: 'Reward Approved',
      message: `Your reward of ${reward.amount} has been approved and credited to your wallet.`,
      recipientId: reward.customer_id,
      referralId: referral.id,
      rewardId: reward.id,
    });
  }

  async sendRewardRejectedNotification(reward, referral, reason) {
    return this._sendNotification({
      type: 'reward_rejected',
      title: 'Reward Rejected',
      message: `Your reward of ${reward.amount} has been rejected. Reason: ${reason}`,
      recipientId: reward.customer_id,
      referralId: referral.id,
      rewardId: reward.id,
    });
  }

  async sendReversalProcessedNotification(reversal, reward) {
    return this._sendNotification({
      type: 'reversal_processed',
      title: 'Reversal Processed',
      message: `A reversal has been processed for reward ${reward.id}.`,
      recipientId: reward.customer_id,
      rewardId: reward.id,
    });
  }

  async sendReferralConvertedNotification(referral) {
    return this._sendNotification({
      type: 'referral_converted',
      title: 'Referral Converted',
      message: `A referral you made has been converted.`,
      recipientId: referral.referred_by_id,
      referralId: referral.id,
    });
  }

  async _sendNotification({ type, title, message, recipientId, referralId, rewardId }) {
    const id = require('crypto').randomUUID();
    const record = {
      id,
      data: {
        type,
        title,
        message,
        recipient_id: recipientId,
        referral_id: referralId || null,
        reward_id: rewardId || null,
        status: 'pending',
        created_at: new Date().toISOString(),
      },
    };
    await repo.upsert('notifications', record);
    return { id, type, title, message, recipientId };
  }

  async getNotifications(recipientId, limit = 20) {
    const rows = await repo.getAll('notifications', { 'data->>recipient_id': `eq.${recipientId}` });
    rows.sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
    return rows.slice(0, limit);
  }

  async markAsRead(notificationId) {
    const old = await repo.getById('notifications', notificationId);
    if (!old) return { success: false };
    const oldData = old.data || old;
    await repo.upsert('notifications', {
      ...old,
      data: {
        ...oldData,
        status: 'read',
        read_at: new Date().toISOString(),
      },
      updated_at: new Date().toISOString(),
    });
    return { success: true };
  }
}

module.exports = ReferralNotificationService;
