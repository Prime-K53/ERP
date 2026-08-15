import { EngagementAnalytics, PointBalance, CashbackEntry, CustomerTier, MembershipTier, GiftCard, AffiliateAccount, AffiliateCommission, Promotion, CustomerReward } from '../types/engagement'
import { dbService } from './db'
import { logger } from './logger'

export const engagementAnalyticsService = {
  async computeAnalytics(): Promise<EngagementAnalytics> {
    try {
      const now = new Date()
      const periodStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10)
      const periodEnd = now.toISOString().slice(0, 10)

      const pointBalances = await safeGet<PointBalance>('engagementPointBalances')
      const cashbackRecords = await safeGet<CashbackEntry>('engagementCashback')
      const customerTiers = await safeGet<CustomerTier>('engagementCustomerTiers')
      const membershipTiers = await safeGet<MembershipTier>('engagementMembershipTiers')
      const giftCards = await safeGet<GiftCard>('engagementGiftCards')
      const affiliateAccounts = await safeGet<AffiliateAccount>('engagementAffiliates')
      const affiliateCommissions = await safeGet<AffiliateCommission>('engagementAffiliateCommissions')
      const promotions = await safeGet<Promotion>('engagementPromotions')
      const rewards = await safeGet<CustomerReward>('engagementCustomerRewards')

      const totalPointsEarned = pointBalances.reduce((s, b: any) => s + (b.totalEarned ?? 0), 0)
      const totalPointsRedeemed = pointBalances.reduce((s, b: any) => s + (b.totalRedeemed ?? 0), 0)
      const totalPointsExpired = pointBalances.reduce((s, b: any) => s + (b.totalExpired ?? b.pendingExpiry ?? 0), 0)
      const activePointBalances = pointBalances.reduce((s, b: any) => s + (b.currentBalance ?? 0), 0)
      const pointsLiability = activePointBalances

      const totalCashbackIssued = cashbackRecords.reduce((s, c: any) => s + (c.amount ?? 0), 0)
      const totalCashbackPaid = cashbackRecords.filter((c: any) => c.status === 'paid').reduce((s, c: any) => s + (c.amount ?? 0), 0)
      const pendingCashbackAmount = cashbackRecords.filter((c: any) => c.status === 'pending').reduce((s, c: any) => s + (c.amount ?? 0), 0)

      const activeCustomerTiers = customerTiers.filter((t: any) => t.status === 'active')
      const tierDistribution: Record<string, number> = {}
      for (const ct of activeCustomerTiers) {
        const tierDef = membershipTiers.find((t: any) => t.id === ct.tierId)
        const name = tierDef?.name || 'Unknown'
        tierDistribution[name] = (tierDistribution[name] || 0) + 1
      }

      const totalGiftCardSales = giftCards.reduce((s, g: any) => s + (g.initialBalance ?? 0), 0)
      const giftCardLiability = giftCards
        .filter((g: any) => g.status === 'active')
        .reduce((s, g: any) => s + (g.currentBalance ?? 0), 0)

      const totalAffiliateCommissions = affiliateCommissions.reduce((s, c: any) => s + (c.amount ?? 0), 0)
      const paidCommissions = affiliateCommissions.filter((c: any) => c.status === 'paid').reduce((s, c: any) => s + (c.amount ?? 0), 0)
      const totalAffiliateEarnings = affiliateAccounts.reduce((s, a: any) => s + (a.totalEarned ?? 0), 0)
      const affiliateROI = totalAffiliateEarnings > 0 ? (paidCommissions / totalAffiliateEarnings) * 100 : 0

      const totalRewardsGranted = rewards.filter((r: any) => r.status === 'approved' || r.status === 'granted').length
      const rewardCost = rewards
        .filter((r: any) => r.rewardType === 'wallet_credit')
        .reduce((s, r: any) => s + (r.rewardValue ?? 0), 0)

      return {
        period: 'monthly',
        periodStart,
        periodEnd,
        totalPointsEarned,
        totalPointsRedeemed,
        totalPointsExpired,
        activePointBalances,
        pointsLiability,
        totalCashbackIssued,
        totalCashbackPaid,
        pendingCashbackAmount,
        cashbackCost: totalCashbackPaid,
        tierDistribution,
        totalGiftCardSales,
        giftCardLiability,
        totalAffiliateCommissions,
        affiliateROI,
        totalRewardsGranted,
        rewardCost,
        customerRetentionRate: 0,
        repeatPurchaseRate: 0,
        topCustomers: [],
        revenueByTier: {},
        revenueByCampaign: {},
        walletUtilization: 0,
        generatedAt: now.toISOString(),
      } as EngagementAnalytics
    } catch (err) {
      logger.error('EngagementAnalyticsService: computation failed:', err)
      throw err
    }
  },
}

async function safeGet<T>(store: string): Promise<T[]> {
  try {
    return await dbService.getAll<T>(store)
  } catch {
    return []
  }
}

export default engagementAnalyticsService
