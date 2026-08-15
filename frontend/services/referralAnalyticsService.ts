import { Referral, ReferralReward } from '../types/referral'
import { ReferralAnalytics } from '../types/referral-extended'
import { dbService } from './db'
import { generateId } from './transactions/_internal'
import { logger } from './logger'

export const referralAnalyticsService = {
  async generateAnalytics(period: ReferralAnalytics['period'], periodStart: string, periodEnd: string): Promise<ReferralAnalytics> {
    const allReferrals = (await dbService.getAll<Referral>('referrals')) || []
    const allRewards = (await dbService.getAll<ReferralReward>('referralRewards')) || []
    const start = new Date(periodStart)
    const end = new Date(periodEnd)

    const filteredReferrals = allReferrals.filter(r => {
      const d = new Date(r.date)
      return d >= start && d <= end
    })

    const filteredRewards = allRewards.filter(r => {
      const d = new Date(r.date)
      return d >= start && d <= end
    })

    const totalReferrals = filteredReferrals.length
    const activeReferrals = filteredReferrals.filter(r => r.status === 'active').length
    const convertedReferrals = filteredReferrals.filter(r => r.status === 'converted').length
    const conversionRate = totalReferrals > 0 ? toMoney((convertedReferrals / totalReferrals) * 100) : 0

    const totalRewardsAmount = toMoney(filteredRewards.reduce((sum, r) => sum + r.amount, 0))
    const approvedRewardsAmount = toMoney(filteredRewards.filter(r => r.status === 'approved' || r.status === 'paid').reduce((sum, r) => sum + r.amount, 0))
    const paidRewardsAmount = toMoney(filteredRewards.filter(r => r.status === 'paid').reduce((sum, r) => sum + r.amount, 0))
    const pendingRewardsAmount = toMoney(filteredRewards.filter(r => r.status === 'pending').reduce((sum, r) => sum + r.amount, 0))
    const reversedRewardsAmount = toMoney(filteredRewards.filter(r => r.status === 'cancelled').reduce((sum, r) => sum + r.amount, 0))
    const averageRewardAmount = filteredRewards.length > 0 ? toMoney(totalRewardsAmount / filteredRewards.length) : 0

    const referrerMap = new Map<string, { customerName: string; referralCount: number; rewardsAmount: number }>()
    for (const ref of filteredReferrals) {
      if (ref.referredById) {
        const existing = referrerMap.get(ref.referredById) || { customerName: ref.referredByName || '', referralCount: 0, rewardsAmount: 0 }
        existing.referralCount++
        referrerMap.set(ref.referredById, existing)
      }
    }
    for (const rew of filteredRewards) {
      const ref = allReferrals.find(r => r.id === rew.referralId)
      if (ref?.referredById && referrerMap.has(ref.referredById)) {
        referrerMap.get(ref.referredById)!.rewardsAmount += rew.amount
      }
    }

    const topReferrers = Array.from(referrerMap.entries())
      .map(([customerId, data]) => ({ customerId, ...data }))
      .sort((a, b) => b.referralCount - a.referralCount)
      .slice(0, 10)

    const revenueAttributed = toMoney(filteredRewards.reduce((sum, r) => sum + (r.invoiceAmount || 0), 0))
    const roi = totalRewardsAmount > 0 ? toMoney((revenueAttributed - totalRewardsAmount) / totalRewardsAmount * 100) : 0

    const analytics: ReferralAnalytics = {
      id: generateId('ANL'),
      period,
      periodStart,
      periodEnd,
      totalReferrals,
      activeReferrals,
      convertedReferrals,
      totalRewardsAmount,
      approvedRewardsAmount,
      paidRewardsAmount,
      pendingRewardsAmount,
      reversedRewardsAmount,
      averageRewardAmount,
      conversionRate,
      topReferrers,
      revenueAttributed,
      roi,
      generatedAt: new Date().toISOString(),
    }

    await dbService.put('referralAnalytics', analytics)
    return analytics
  },

  async getAnalyticsHistory(period?: ReferralAnalytics['period'], limit = 12): Promise<ReferralAnalytics[]> {
    const all = (await dbService.getAll<ReferralAnalytics>('referralAnalytics')) || []
    let filtered = all
    if (period) {
      filtered = filtered.filter(a => a.period === period)
    }
    return filtered
      .sort((a, b) => new Date(b.periodStart).getTime() - new Date(a.periodStart).getTime())
      .slice(0, limit)
  },

  async getLatestAnalytics(): Promise<ReferralAnalytics | null> {
    const all = (await dbService.getAll<ReferralAnalytics>('referralAnalytics')) || []
    if (all.length === 0) return null
    return all.sort((a, b) => new Date(b.generatedAt).getTime() - new Date(a.generatedAt).getTime())[0]
  },

  async getCustomerReferralStats(customerId: string): Promise<{
    totalReferrals: number
    activeReferrals: number
    convertedReferrals: number
    totalRewards: number
    totalRewardAmount: number
  }> {
    const allReferrals = (await dbService.getAll<Referral>('referrals')) || []
    const customerReferrals = allReferrals.filter(r => r.referredById === customerId)
    const totalReferrals = customerReferrals.length
    const activeReferrals = customerReferrals.filter(r => r.status === 'active').length
    const convertedReferrals = customerReferrals.filter(r => r.status === 'converted').length

    const allRewards = (await dbService.getAll<ReferralReward>('referralRewards')) || []
    const customerRewards = allRewards.filter(r => r.customerId === customerId)
    const totalRewards = customerRewards.length
    const totalRewardAmount = toMoney(customerRewards.reduce((sum, r) => sum + r.amount, 0))

    return { totalReferrals, activeReferrals, convertedReferrals, totalRewards, totalRewardAmount }
  },
}

const toMoney = (v: number): number => Math.round(v * 100) / 100

export default referralAnalyticsService
