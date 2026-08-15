import React, { useState, useEffect } from 'react'
import { EngagementSettings, DEFAULT_ENGAGEMENT_SETTINGS, MilestoneRewardDef } from '../../../types/engagement'
import { engagementSettingsService } from '../../../services/engagementSettingsService'
import { Save, RotateCcw, Gift, DollarSign, Award, CreditCard, Users, Tag, Star } from 'lucide-react'

export const EngagementSettingsTab: React.FC = () => {
  const [settings, setSettings] = useState<EngagementSettings>(() => engagementSettingsService.getSettings())
  const [activeSubTab, setActiveSubTab] = useState<string>('general')
  const [saved, setSaved] = useState(false)

  const update = (partial: Partial<EngagementSettings>) => {
    setSettings((prev) => ({ ...prev, ...partial }))
  }

  const handleSave = async () => {
    await engagementSettingsService.updateSettings(settings)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const handleReset = async () => {
    const defaults = await engagementSettingsService.resetSettings()
    setSettings(defaults)
  }

  const subTabs = [
    { id: 'general', label: 'General', icon: <Gift size={14} /> },
    { id: 'loyalty', label: 'Loyalty', icon: <Gift size={14} /> },
    { id: 'cashback', label: 'Cashback', icon: <DollarSign size={14} /> },
    { id: 'membership', label: 'Membership', icon: <Award size={14} /> },
    { id: 'giftcards', label: 'Gift Cards', icon: <CreditCard size={14} /> },
    { id: 'affiliate', label: 'Affiliate', icon: <Users size={14} /> },
    { id: 'promotions', label: 'Promotions', icon: <Tag size={14} /> },
    { id: 'rewards', label: 'Rewards', icon: <Star size={14} /> },
  ]

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-[#23282A]">Engagement Settings</h2>
          <p className="text-sm text-[#5c6567]">Configure loyalty, cashback, membership, and rewards</p>
        </div>
        <div className="flex gap-2">
          <button onClick={handleReset} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-[#23282A] bg-white border border-[#D4D7DC] rounded-lg hover:bg-[#eef7f6]">
            <RotateCcw size={12} /> Reset
          </button>
          <button onClick={handleSave} className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-bold text-white bg-[#1f8577] rounded-lg hover:bg-[#1a7366]">
            <Save size={12} /> {saved ? 'Saved!' : 'Save'}
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-1 border-b border-[#D4D7DC] pb-2">
        {subTabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveSubTab(tab.id)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
              activeSubTab === tab.id
                ? 'bg-[#eef7f6] text-[#1f8577]'
                : 'text-[#5c6567] hover:bg-[#eef7f6]'
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      <div className="space-y-4">
        {activeSubTab === 'general' && <GeneralSettings settings={settings} update={update} />}
        {activeSubTab === 'loyalty' && <LoyaltySettings settings={settings} update={update} />}
        {activeSubTab === 'cashback' && <CashbackSettings settings={settings} update={update} />}
        {activeSubTab === 'membership' && <MembershipSettings settings={settings} update={update} />}
        {activeSubTab === 'giftcards' && <GiftCardSettings settings={settings} update={update} />}
        {activeSubTab === 'affiliate' && <AffiliateSettings settings={settings} update={update} />}
        {activeSubTab === 'promotions' && <PromotionSettings settings={settings} update={update} />}
        {activeSubTab === 'rewards' && <RewardSettings settings={settings} update={update} />}
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between py-2 px-4" style={{ background: '#FEFDFB', borderRadius: 12, border: '1px solid #D4D7DC' }}>
      <span className="text-sm font-medium text-[#23282A]">{label}</span>
      <div className="w-48">{children}</div>
    </div>
  )
}

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!value)}
      className={`w-10 h-5 rounded-full transition-colors relative ${value ? 'bg-[#1f8577]' : 'bg-[#e4ddd1]'}`}
    >
      <div className={`w-4 h-4 bg-white rounded-full absolute top-0.5 transition-transform ${value ? 'translate-x-5' : 'translate-x-0.5'}`} />
    </button>
  )
}

function NumberField({ value, onChange, min, max, step }: { value: number; onChange: (v: number) => void; min?: number; max?: number; step?: number }) {
  return (
    <input
      type="number"
      value={value}
      onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
      min={min}
      max={max}
      step={step}
      className="w-full text-sm border border-[#D4D7DC] rounded-lg px-2.5 py-1.5 text-right font-medium focus:ring-2 focus:ring-[#1f8577] focus:border-[#1f8577]"
    />
  )
}

function GeneralSettings({ settings, update }: { settings: EngagementSettings; update: (p: Partial<EngagementSettings>) => void }) {
  return (
    <div className="space-y-2">
      <Field label="Enable Engagement Platform">
        <Toggle value={settings.enabled} onChange={(v) => update({ enabled: v })} />
      </Field>
    </div>
  )
}

function LoyaltySettings({ settings, update }: { settings: EngagementSettings; update: (p: Partial<EngagementSettings>) => void }) {
  return (
    <div className="space-y-2">
      <Field label="Enable Points"><Toggle value={settings.pointsEnabled} onChange={(v) => update({ pointsEnabled: v })} /></Field>
      <Field label="Earning Rate (per $1)"><NumberField value={settings.pointsEarningRate} onChange={(v) => update({ pointsEarningRate: v })} min={0} step={0.01} /></Field>
      <Field label="Redeem Rate ($ per point)"><NumberField value={settings.pointsRedeemRate} onChange={(v) => update({ pointsRedeemRate: v })} min={0} step={0.01} /></Field>
      <Field label="Min Points to Redeem"><NumberField value={settings.minPointsRedeem} onChange={(v) => update({ minPointsRedeem: v })} min={0} /></Field>
      <Field label="Max Redeem %"><NumberField value={settings.maxPointsRedeemPct} onChange={(v) => update({ maxPointsRedeemPct: v })} min={0} max={100} /></Field>
      <Field label="Points Expiry (days)"><NumberField value={settings.pointsExpiryDays} onChange={(v) => update({ pointsExpiryDays: v })} min={0} /></Field>
      <Field label="Round Up"><Toggle value={settings.pointsRoundUp} onChange={(v) => update({ pointsRoundUp: v })} /></Field>
      <Field label="Bonus Multiplier"><NumberField value={settings.bonusPointsMultiplier} onChange={(v) => update({ bonusPointsMultiplier: v })} min={0} step={0.1} /></Field>
      <Field label="Registration Bonus"><NumberField value={settings.pointsOnRegistration} onChange={(v) => update({ pointsOnRegistration: v })} min={0} /></Field>
      <Field label="Referral Bonus"><NumberField value={settings.pointsOnReferral} onChange={(v) => update({ pointsOnReferral: v })} min={0} /></Field>
      <Field label="Birthday Bonus"><NumberField value={settings.pointsOnBirthday} onChange={(v) => update({ pointsOnBirthday: v })} min={0} /></Field>
      <Field label="Review Bonus"><NumberField value={settings.pointsOnReview} onChange={(v) => update({ pointsOnReview: v })} min={0} /></Field>
    </div>
  )
}

function CashbackSettings({ settings, update }: { settings: EngagementSettings; update: (p: Partial<EngagementSettings>) => void }) {
  return (
    <div className="space-y-2">
      <Field label="Enable Cashback"><Toggle value={settings.cashbackEnabled} onChange={(v) => update({ cashbackEnabled: v })} /></Field>
      <Field label="Default Rate (%)"><NumberField value={settings.cashbackDefaultRate} onChange={(v) => update({ cashbackDefaultRate: v })} min={0} step={0.1} /></Field>
      <Field label="Delay (days)"><NumberField value={settings.cashbackDelayDays} onChange={(v) => update({ cashbackDelayDays: v })} min={0} /></Field>
      <Field label="Expiry (days)"><NumberField value={settings.cashbackExpiryDays} onChange={(v) => update({ cashbackExpiryDays: v })} min={0} /></Field>
      <Field label="Require Approval"><Toggle value={settings.cashbackRequireApproval} onChange={(v) => update({ cashbackRequireApproval: v })} /></Field>
      <Field label="Auto-Approve Threshold ($)"><NumberField value={settings.cashbackAutoApproveThreshold} onChange={(v) => update({ cashbackAutoApproveThreshold: v })} min={0} /></Field>
      <Field label="Max Per Transaction ($)"><NumberField value={settings.cashbackMaxPerTransaction} onChange={(v) => update({ cashbackMaxPerTransaction: v })} min={0} /></Field>
      <Field label="Max Per Day ($)"><NumberField value={settings.cashbackMaxPerDay} onChange={(v) => update({ cashbackMaxPerDay: v })} min={0} /></Field>
    </div>
  )
}

function MembershipSettings({ settings, update }: { settings: EngagementSettings; update: (p: Partial<EngagementSettings>) => void }) {
  return (
    <div className="space-y-2">
      <Field label="Enable Membership"><Toggle value={settings.membershipEnabled} onChange={(v) => update({ membershipEnabled: v })} /></Field>
      <Field label="Auto Upgrade"><Toggle value={settings.membershipAutoUpgrade} onChange={(v) => update({ membershipAutoUpgrade: v })} /></Field>
      <Field label="Auto Downgrade"><Toggle value={settings.membershipAutoDowngrade} onChange={(v) => update({ membershipAutoDowngrade: v })} /></Field>
      <Field label="Expiry (days)"><NumberField value={settings.membershipExpiryDays} onChange={(v) => update({ membershipExpiryDays: v })} min={0} /></Field>
    </div>
  )
}

function GiftCardSettings({ settings, update }: { settings: EngagementSettings; update: (p: Partial<EngagementSettings>) => void }) {
  return (
    <div className="space-y-2">
      <Field label="Enable Gift Cards"><Toggle value={settings.giftCardsEnabled} onChange={(v) => update({ giftCardsEnabled: v })} /></Field>
      <Field label="Expiry (days)"><NumberField value={settings.giftCardExpiryDays} onChange={(v) => update({ giftCardExpiryDays: v })} min={0} /></Field>
      <Field label="Max Balance ($)"><NumberField value={settings.giftCardMaxBalance} onChange={(v) => update({ giftCardMaxBalance: v })} min={0} /></Field>
      <Field label="Allow Recharge"><Toggle value={settings.giftCardAllowRecharge} onChange={(v) => update({ giftCardAllowRecharge: v })} /></Field>
      <Field label="Allow Transfer"><Toggle value={settings.giftCardAllowTransfer} onChange={(v) => update({ giftCardAllowTransfer: v })} /></Field>
      <Field label="Require PIN"><Toggle value={settings.giftCardRequirePin} onChange={(v) => update({ giftCardRequirePin: v })} /></Field>
    </div>
  )
}

function AffiliateSettings({ settings, update }: { settings: EngagementSettings; update: (p: Partial<EngagementSettings>) => void }) {
  return (
    <div className="space-y-2">
      <Field label="Enable Affiliate"><Toggle value={settings.affiliateEnabled} onChange={(v) => update({ affiliateEnabled: v })} /></Field>
      <Field label="Default Rate (%)"><NumberField value={settings.affiliateDefaultRate} onChange={(v) => update({ affiliateDefaultRate: v })} min={0} step={0.1} /></Field>
      <Field label="Fixed Amount ($)"><NumberField value={settings.affiliateFixedAmount} onChange={(v) => update({ affiliateFixedAmount: v })} min={0} /></Field>
      <Field label="Require Approval"><Toggle value={settings.affiliateRequireApproval} onChange={(v) => update({ affiliateRequireApproval: v })} /></Field>
      <Field label="Auto-Approve Threshold ($)"><NumberField value={settings.affiliateAutoApproveThreshold} onChange={(v) => update({ affiliateAutoApproveThreshold: v })} min={0} /></Field>
      <Field label="Cookie Duration (days)"><NumberField value={settings.affiliateCookieDays} onChange={(v) => update({ affiliateCookieDays: v })} min={0} /></Field>
    </div>
  )
}

function PromotionSettings({ settings, update }: { settings: EngagementSettings; update: (p: Partial<EngagementSettings>) => void }) {
  return (
    <div className="space-y-2">
      <Field label="Enable Promotions"><Toggle value={settings.promotionsEnabled} onChange={(v) => update({ promotionsEnabled: v })} /></Field>
      <Field label="Max Stacked"><NumberField value={settings.promotionMaxStacked} onChange={(v) => update({ promotionMaxStacked: v })} min={1} /></Field>
      <Field label="Max Total Discount (%)"><NumberField value={settings.promotionMaxTotalDiscount} onChange={(v) => update({ promotionMaxTotalDiscount: v })} min={0} max={100} /></Field>
    </div>
  )
}

function RewardSettings({ settings, update }: { settings: EngagementSettings; update: (p: Partial<EngagementSettings>) => void }) {
  const [milestones, setMilestones] = useState<MilestoneRewardDef[]>(settings.milestoneRewards || [])

  const updateMilestones = (newMilestones: MilestoneRewardDef[]) => {
    setMilestones(newMilestones)
    update({ milestoneRewards: newMilestones })
  }

  const addMilestone = () => {
    updateMilestones([
      ...milestones,
      { key: `milestone_${Date.now()}`, name: 'New Milestone', type: 'purchase_count', threshold: 1, rewardType: 'points', rewardValue: 100, description: '' },
    ])
  }

  const removeMilestone = (index: number) => {
    updateMilestones(milestones.filter((_, i) => i !== index))
  }

  const updateMilestone = (index: number, partial: Partial<MilestoneRewardDef>) => {
    updateMilestones(milestones.map((m, i) => (i === index ? { ...m, ...partial } : m)))
  }

  return (
    <div className="space-y-2">
      <Field label="Enable Rewards"><Toggle value={settings.rewardsEnabled} onChange={(v) => update({ rewardsEnabled: v })} /></Field>
      <Field label="Birthday Window (days)"><NumberField value={settings.birthdayRewardDays} onChange={(v) => update({ birthdayRewardDays: v })} min={0} /></Field>
      <Field label="Anniversary Window (days)"><NumberField value={settings.anniversaryRewardDays} onChange={(v) => update({ anniversaryRewardDays: v })} min={0} /></Field>

      <div className="pt-4">
        <div className="flex items-center justify-between mb-3">
          <h4 className="text-sm font-bold text-[#23282A]">Milestone Rewards</h4>
          <button onClick={addMilestone} className="text-xs font-bold text-[#1f8577] hover:text-[#1f8577]">+ Add Milestone</button>
        </div>
        {milestones.map((m, i) => (
          <div key={i} className="flex items-center gap-2 py-2 px-3 mb-1" style={{ background: '#FEFDFB', borderRadius: 12, border: '1px solid #D4D7DC' }}>
            <input
              type="text"
              value={m.name}
              onChange={(e) => updateMilestone(i, { name: e.target.value })}
              className="flex-1 text-sm border border-[#D4D7DC] rounded px-2 py-1"
              placeholder="Name"
            />
            <select
              value={m.type}
              onChange={(e) => updateMilestone(i, { type: e.target.value as any })}
              className="text-xs border border-[#D4D7DC] rounded px-2 py-1"
            >
              <option value="purchase_count">Purchase Count</option>
              <option value="total_spend">Total Spend</option>
              <option value="points_earned">Points Earned</option>
            </select>
            <input
              type="number"
              value={m.threshold}
              onChange={(e) => updateMilestone(i, { threshold: parseInt(e.target.value) || 0 })}
              className="w-16 text-sm border border-[#D4D7DC] rounded px-2 py-1 text-right"
              placeholder="Threshold"
            />
            <select
              value={m.rewardType}
              onChange={(e) => updateMilestone(i, { rewardType: e.target.value as any })}
              className="text-xs border border-[#D4D7DC] rounded px-2 py-1"
            >
              <option value="points">Points</option>
              <option value="wallet_credit">Wallet Credit</option>
              <option value="gift_card">Gift Card</option>
              <option value="discount">Discount</option>
            </select>
            <input
              type="number"
              value={m.rewardValue}
              onChange={(e) => updateMilestone(i, { rewardValue: parseFloat(e.target.value) || 0 })}
              className="w-20 text-sm border border-[#D4D7DC] rounded px-2 py-1 text-right"
              placeholder="Value"
            />
            <button onClick={() => removeMilestone(i)} className="text-[#b5493f] hover:text-rose-700 text-xs font-bold">X</button>
          </div>
        ))}
      </div>
    </div>
  )
}

export default EngagementSettingsTab
