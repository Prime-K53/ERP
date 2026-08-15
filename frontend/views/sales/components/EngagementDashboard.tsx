import React, { useEffect, useState } from 'react'
import { PointBalance, MembershipTier, CustomerTier } from '../../../types/engagement'
import { dbService } from '../../../services/db'
import { engagementSettingsService } from '../../../services/engagementSettingsService'
import { Gift, Award, DollarSign, CreditCard, Users, Tag, Star, TrendingUp } from 'lucide-react'
import { LoyaltyPointsPanel } from './LoyaltyPointsPanel'
import { CashbackPanel } from './CashbackPanel'
import { MembershipPanel } from './MembershipPanel'
import { GiftCardPanel } from './GiftCardPanel'
import { AffiliatePanel } from './AffiliatePanel'
import { PromotionsPanel } from './PromotionsPanel'
import { RewardsPanel } from './RewardsPanel'

interface Props {
  customerId: string
  customer: any
}

type TabId = 'points' | 'cashback' | 'membership' | 'giftcards' | 'affiliate' | 'promotions' | 'rewards'

const tabs: Array<{ id: TabId; label: string; icon: React.ReactNode; color: string; setting: keyof ReturnType<typeof engagementSettingsService.getSettings> }> = [
  { id: 'points', label: 'Points', icon: <Gift size={14} />, color: 'amber', setting: 'pointsEnabled' },
  { id: 'cashback', label: 'Cashback', icon: <DollarSign size={14} />, color: 'emerald', setting: 'cashbackEnabled' },
  { id: 'membership', label: 'Tier', icon: <Award size={14} />, color: 'purple', setting: 'membershipEnabled' },
  { id: 'giftcards', label: 'Gift Cards', icon: <CreditCard size={14} />, color: 'cyan', setting: 'giftCardsEnabled' },
  { id: 'affiliate', label: 'Affiliate', icon: <Users size={14} />, color: 'orange', setting: 'affiliateEnabled' },
  { id: 'promotions', label: 'Promotions', icon: <Tag size={14} />, color: 'rose', setting: 'promotionsEnabled' },
  { id: 'rewards', label: 'Rewards', icon: <Star size={14} />, color: 'pink', setting: 'rewardsEnabled' },
]

export const EngagementDashboard: React.FC<Props> = ({ customerId, customer }) => {
  const [activeTab, setActiveTab] = useState<TabId>('points')
  const [settings] = useState(() => engagementSettingsService.getSettings())

  if (!settings.enabled) {
    return (
      <div className="text-center py-8 text-slate-400">
        <TrendingUp size={32} className="mx-auto mb-2 opacity-50" />
        <p className="text-sm font-medium">Engagement platform is disabled</p>
        <p className="text-xs mt-1">Enable it in Settings → Engagement</p>
      </div>
    )
  }

  const enabledTabs = tabs.filter((t) => (settings as any)[t.setting] !== false)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1">
        {enabledTabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
              activeTab === tab.id
                ? `bg-${tab.color}-100 text-${tab.color}-700 border border-${tab.color}-200`
                : 'text-slate-500 hover:bg-slate-100 border border-transparent'
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      <div className="min-h-[200px]">
        {activeTab === 'points' && <LoyaltyPointsPanel customerId={customerId} />}
        {activeTab === 'cashback' && <CashbackPanel customerId={customerId} />}
        {activeTab === 'membership' && <MembershipPanel customerId={customerId} />}
        {activeTab === 'giftcards' && <GiftCardPanel customerId={customerId} />}
        {activeTab === 'affiliate' && <AffiliatePanel customerId={customerId} />}
        {activeTab === 'promotions' && <PromotionsPanel customerId={customerId} />}
        {activeTab === 'rewards' && <RewardsPanel customerId={customerId} />}
      </div>
    </div>
  )
}

export default EngagementDashboard
