import { Referral, ReferralReward, ReferralSettings, DEFAULT_REFERRAL_SETTINGS } from '../types/referral'
import { dbService } from './db'
import { paymentService } from './paymentService'

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

function generateReferralCode(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  let code = ''
  for (let i = 0; i < 8; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return code
}

function generateId(): string {
  return `ref-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

export const referralService = {
  async registerReferral(customerId: string, referredById: string, referredByName?: string, actorId?: string): Promise<Referral> {
    const referral: Referral = {
      id: generateId(),
      customerId,
      referredById,
      referredByName,
      referralCode: generateReferralCode(),
      status: 'active',
      date: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    };
    await dbService.put('referrals', referral);
    return referral;
  },

  async registerReferralFromInvoice(invoice: {
    id: string
    customerId: string
    customerName?: string
    totalAmount: number
    referredById?: string
    referredByName?: string
  }): Promise<Referral | null> {
    if (!invoice.referredById) return null
    if (invoice.customerId === invoice.referredById) return null

    const settings = getReferralSettings()
    if (!settings.enabled) return null

    const all = await dbService.getAll<Referral>('referrals')
    const existing = all.find(r =>
      r.pendingInvoiceId === invoice.id &&
      r.customerId === invoice.customerId &&
      r.referredById === invoice.referredById
    )
    if (existing) return existing

    const referral: Referral = {
      id: generateId(),
      customerId: invoice.customerId,
      referredById: invoice.referredById,
      referredByName: invoice.referredByName,
      referralCode: generateReferralCode(),
      status: 'active',
      date: new Date().toISOString(),
      pendingInvoiceId: invoice.id,
      pendingInvoiceAmount: invoice.totalAmount,
      createdAt: new Date().toISOString(),
    };
    await dbService.put('referrals', referral);
    return referral;
  },

  async getReferralsByCustomer(customerId: string): Promise<Referral[]> {
    const all = await dbService.getAll<Referral>('referrals');
    return all.filter(r => r.customerId === customerId);
  },

  async getReferralsByReferrer(referredById: string): Promise<Referral[]> {
    const all = await dbService.getAll<Referral>('referrals');
    return all.filter(r => r.referredById === referredById);
  },

  async getReferralByCode(code: string): Promise<Referral | undefined> {
    const all = await dbService.getAll<Referral>('referrals');
    return all.find(r => r.referralCode === code && r.status === 'active');
  },

  async getAllReferrals(params?: { status?: string; search?: string; page?: number; limit?: number }): Promise<Referral[]> {
    let all = await dbService.getAll<Referral>('referrals');
    if (params?.status) all = all.filter(r => r.status === params.status);
    if (params?.search) {
      const s = params.search.toLowerCase();
      all = all.filter(r =>
        r.referredByName?.toLowerCase().includes(s) ||
        r.referralCode?.toLowerCase().includes(s) ||
        r.customerId?.toLowerCase().includes(s)
      );
    }
    return all;
  },

  async getPendingRewards(): Promise<ReferralReward[]> {
    const all = await dbService.getAll<ReferralReward>('referralRewards');
    return all.filter(r => r.status === 'pending');
  },

  async getRewardsByCustomer(customerId: string): Promise<ReferralReward[]> {
    const all = await dbService.getAll<ReferralReward>('referralRewards');
    return all.filter(r => r.customerId === customerId);
  },

  async getRewardsByReferral(referralId: string): Promise<ReferralReward[]> {
    const all = await dbService.getAll<ReferralReward>('referralRewards');
    return all.filter(r => r.referralId === referralId);
  },

  async approveReward(rewardId: string, approvedBy: string): Promise<ReferralReward> {
    const reward = await dbService.get<ReferralReward>('referralRewards', rewardId);
    if (!reward) throw new Error('Reward not found');
    const updated = { ...reward, status: 'approved' as const, approvedAt: new Date().toISOString(), approvedBy, updatedAt: new Date().toISOString() };
    await dbService.put('referralRewards', updated);
    try {
      await paymentService.updateCustomerWallet(reward.customerId, reward.amount);
    } catch (walletErr) {
      console.error(`[Referrals] Failed to credit wallet for customer ${reward.customerId}:`, walletErr);
    }
    return updated;
  },

  async rejectReward(rewardId: string, reason: string, rejectedBy?: string): Promise<ReferralReward> {
    const reward = await dbService.get<ReferralReward>('referralRewards', rewardId);
    if (!reward) throw new Error('Reward not found');
    const updated = { ...reward, status: 'cancelled' as const, cancelReason: reason, cancelledBy: rejectedBy, cancelledAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    await dbService.put('referralRewards', updated);
    return updated;
  },

  async getAllRewards(): Promise<ReferralReward[]> {
    return dbService.getAll<ReferralReward>('referralRewards');
  },

  async processInvoiceReward(invoice: {
    id: string
    customerId: string
    totalAmount: number
    paidAmount: number
    referredBy?: string
    referredByName?: string
    status?: string
  }): Promise<ReferralReward | null> {
    if (!invoice.referredBy) return null
    if (invoice.customerId === invoice.referredBy) return null

    const settings = getReferralSettings()
    if (!settings.enabled) return null

    const allReferrals = await this.getAllReferrals()
    let referral = allReferrals.find(
      r => r.customerId === invoice.customerId && r.referredById === invoice.referredBy && r.status === 'active'
    )

    if (!referral) {
      referral = await this.registerReferral(invoice.customerId, invoice.referredBy, invoice.referredByName)
    }

    const rewardAmount = settings.rewardType === 'percentage'
      ? invoice.totalAmount * (settings.rewardPercentage / 100)
      : settings.rewardValue;

    const reward: ReferralReward = {
      id: generateId(),
      referralId: referral.id,
      customerId: invoice.referredBy,
      invoiceId: invoice.id,
      invoiceAmount: invoice.totalAmount,
      amount: Math.min(rewardAmount, settings.maxRewardAmount || rewardAmount),
      status: settings.requireApproval ? 'pending' : 'approved',
      date: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    };
    await dbService.put('referralRewards', reward);

    if (referral.pendingInvoiceId) {
      const updated = { ...referral, status: 'converted' as const, convertedAt: new Date().toISOString(), convertedInvoiceId: invoice.id };
      await dbService.put('referrals', updated);
    }

    return reward;
  },

  async expireReferral(referralId: string): Promise<Referral> {
    const referral = await dbService.get<Referral>('referrals', referralId);
    if (!referral) throw new Error('Referral not found');
    const updated = { ...referral, status: 'expired' as const, updatedAt: new Date().toISOString() };
    await dbService.put('referrals', updated);
    return updated;
  },

  async cancelReferral(referralId: string, cancelledBy?: string, reason?: string): Promise<Referral> {
    const referral = await dbService.get<Referral>('referrals', referralId);
    if (!referral) throw new Error('Referral not found');
    const updated = { ...referral, status: 'cancelled' as const, notes: reason, updatedAt: new Date().toISOString() };
    await dbService.put('referrals', updated);
    return updated;
  },

  async checkAndExpireReferrals(): Promise<number> {
    const all = await this.getAllReferrals()
    const active = all.filter(r => r.status === 'active')
    const settings = getReferralSettings()
    const now = new Date()
    let expiredCount = 0
    for (const referral of active) {
      const created = new Date(referral.date)
      const daysSinceCreation = (now.getTime() - created.getTime()) / (1000 * 60 * 60 * 24)
      if (daysSinceCreation >= settings.expiryDays) {
        try {
          await this.expireReferral(referral.id)
          expiredCount++
        } catch (err) {
          console.error(`[Referrals] Failed to expire referral ${referral.id}:`, err)
        }
      }
    }
    return expiredCount
  },

  // Analytics
  async getAnalytics(params?: { period?: string; period_start?: string; period_end?: string }): Promise<any> {
    const allReferrals = await dbService.getAll<Referral>('referrals');
    const allRewards = await dbService.getAll<ReferralReward>('referralRewards');
    const active = allReferrals.filter(r => r.status === 'active');
    const converted = allReferrals.filter(r => r.status === 'converted');
    const totalRewards = allRewards.reduce((s, r) => s + r.amount, 0);
    const approvedRewards = allRewards.filter(r => r.status === 'approved').reduce((s, r) => s + r.amount, 0);
    const paidRewards = allRewards.filter(r => r.status === 'paid').reduce((s, r) => s + r.amount, 0);
    const pendingRewards = allRewards.filter(r => r.status === 'pending').reduce((s, r) => s + r.amount, 0);
    const revenueAttributed = converted.reduce((s, r) => s + (r.pendingInvoiceAmount || 0), 0);

    const referrerMap = new Map<string, { customerName: string; referralCount: number; rewardsAmount: number }>()
    for (const ref of allReferrals) {
      if (ref.referredById) {
        const existing = referrerMap.get(ref.referredById) || { customerName: ref.referredByName || '', referralCount: 0, rewardsAmount: 0 }
        existing.referralCount++
        referrerMap.set(ref.referredById, existing)
      }
    }
    for (const rew of allRewards) {
      const ref = allReferrals.find(r => r.id === rew.referralId)
      if (ref?.referredById && referrerMap.has(ref.referredById)) {
        referrerMap.get(ref.referredById)!.rewardsAmount += rew.amount
      }
    }

    const topReferrers = Array.from(referrerMap.entries())
      .map(([customerId, data]) => ({ customerId, ...data }))
      .sort((a, b) => b.referralCount - a.referralCount)
      .slice(0, 10)

    return {
      totalReferrals: allReferrals.length,
      activeReferrals: active.length,
      convertedReferrals: converted.length,
      totalRewardsAmount: totalRewards,
      approvedRewardsAmount: approvedRewards,
      paidRewardsAmount: paidRewards,
      pendingRewardsAmount: pendingRewards,
      reversedRewardsAmount: 0,
      averageRewardAmount: allRewards.length > 0 ? totalRewards / allRewards.length : 0,
      conversionRate: allReferrals.length > 0 ? (converted.length / allReferrals.length) * 100 : 0,
      revenueAttributed,
      roi: revenueAttributed > 0 ? ((revenueAttributed - totalRewards) / revenueAttributed) * 100 : 0,
      topReferrers,
      period: params?.period || 'monthly',
      periodStart: params?.period_start || '',
      periodEnd: params?.period_end || '',
      generatedAt: new Date().toISOString(),
    };
  },

  async getAnalyticsHistory(params?: { period?: string; period_start?: string; period_end?: string }): Promise<any[]> {
    return dbService.getAll<any>('referralAnalytics');
  },

  // Campaigns
  async getAllCampaigns(params?: { status?: string }): Promise<any[]> {
    let all = await dbService.getAll<any>('referralCampaigns');
    if (params?.status) all = all.filter(c => c.status === params.status);
    return all;
  },

  async createCampaign(data: any): Promise<any> {
    const campaign = { ...data, id: generateId(), createdAt: new Date().toISOString() };
    await dbService.put('referralCampaigns', campaign);
    return campaign;
  },

  async updateCampaign(id: string, data: any): Promise<any> {
    const existing = await dbService.get<any>('referralCampaigns', id);
    const updated = { ...existing, ...data, id, updatedAt: new Date().toISOString() };
    await dbService.put('referralCampaigns', updated);
    return updated;
  },

  async updateCampaignStatus(id: string, status: string): Promise<any> {
    const existing = await dbService.get<any>('referralCampaigns', id);
    const updated = { ...existing, status, updatedAt: new Date().toISOString() };
    await dbService.put('referralCampaigns', updated);
    return updated;
  },

  // Reversals
  async getAllReversals(params?: { page?: number; limit?: number; status?: string }): Promise<any[]> {
    let all = await dbService.getAll<any>('referralReversals');
    if (params?.status) all = all.filter(r => r.status === params.status);
    return all;
  },

  async createReversal(data: { reward_id: string; reason: string; notes?: string }): Promise<any> {
    const reversal = {
      id: generateId(),
      rewardId: data.reward_id,
      reason: data.reason,
      notes: data.notes,
      status: 'pending' as const,
      requestedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    };
    await dbService.put('referralReversals', reversal);
    return reversal;
  },

  async approveReversal(id: string, approvedBy: string, notes?: string): Promise<any> {
    const existing = await dbService.get<any>('referralReversals', id);
    const updated = { ...existing, status: 'approved' as const, approvedBy, approvedAt: new Date().toISOString(), notes: notes || existing.notes, updatedAt: new Date().toISOString() };
    await dbService.put('referralReversals', updated);
    return updated;
  },

  async rejectReversal(id: string, reason: string, rejectedBy?: string, notes?: string): Promise<any> {
    const existing = await dbService.get<any>('referralReversals', id);
    const updated = { ...existing, status: 'rejected' as const, rejectReason: reason, rejectedBy, rejectedAt: new Date().toISOString(), notes: notes || existing.notes, updatedAt: new Date().toISOString() };
    await dbService.put('referralReversals', updated);
    return updated;
  },

  // Settings
  async getSettings(): Promise<any> {
    const stored = await dbService.get<any>('settings', 'referral_settings');
    const defaults = getReferralSettings();
    return stored ? { ...defaults, ...stored.value } : defaults;
  },

  async updateSettings(settings: any): Promise<any> {
    await dbService.put('settings', { id: 'referral_settings', value: settings });
    return settings;
  },

  // Audit Logs
  async getAuditLogs(params?: { page?: number; limit?: number; entity_type?: string; entity_id?: string }): Promise<any> {
    let all = await dbService.getAll<any>('referralAuditLogs');
    if (params?.entity_type) all = all.filter(l => l.entityType === params.entity_type);
    if (params?.entity_id) all = all.filter(l => l.entityId === params.entity_id);
    return { logs: all, total: all.length };
  },
}
