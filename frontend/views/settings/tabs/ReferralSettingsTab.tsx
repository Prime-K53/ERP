import React, { useState, useEffect } from 'react'
import { Award, DollarSign, Percent, Shield, Clock, Filter, RotateCw, Megaphone } from 'lucide-react'
import type { CompanyConfig } from '../../../types'
import { DEFAULT_REFERRAL_SETTINGS } from '../../../types/referral'
import type { ReferralSettings } from '../../../types/referral'
import { referralCampaignService } from '../../../services/referralCampaignService'
import type { ReferralCampaign } from '../../../types/referral-extended'

interface ReferralSettingsTabProps {
  config: CompanyConfig
  setConfig: React.Dispatch<React.SetStateAction<CompanyConfig>>
}

export const ReferralSettingsTab: React.FC<ReferralSettingsTabProps> = ({ config, setConfig }) => {
  const settings: ReferralSettings = { ...DEFAULT_REFERRAL_SETTINGS, ...config.referralSettings }
  const [campaigns, setCampaigns] = useState<ReferralCampaign[]>([])

  useEffect(() => {
    referralCampaignService.getAllCampaigns().then(setCampaigns).catch(() => {})
  }, [])

  const update = (patch: Partial<ReferralSettings>) => {
    setConfig({
      ...config,
      referralSettings: { ...settings, ...patch },
    })
  }

  return (
    <div className="space-y-12 animate-in fade-in slide-in-from-bottom-4">
      <div className="flex items-center gap-3">
        <Award size={18} className="text-[#d99a3f]" />
        <h3 className="text-[11px] font-black text-[#5c6567] uppercase tracking-[0.2em]">Referral Program</h3>
      </div>

      <div className="grid grid-cols-2 gap-10">
        {/* Enable/Disable */}
        <div style={{ background: '#FEFDFB', borderRadius: 12, border: '1px solid #D4D7DC', padding: 24, boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }} className="space-y-10 col-span-2">
          <div className="flex justify-between items-center">
            <div>
              <p className="font-black text-[#23282A] uppercase text-lg">Referral Rewards System</p>
              <p className="text-[10px] text-[#5c6567] mt-1 italic font-medium">Enable or disable the customer referral and wallet rewards program</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                className="sr-only peer"
                checked={settings.enabled}
                onChange={e => update({ enabled: e.target.checked })}
              />
              <div className="w-14 h-7 bg-[#e4ddd1] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-6 after:w-6 after:transition-all peer-checked:bg-[#d99a3f]"></div>
            </label>
          </div>
        </div>

        {/* Reward Configuration */}
        <div style={{ background: '#FEFDFB', borderRadius: 12, border: '1px solid #D4D7DC', padding: 24, boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }} className="space-y-8">
          <div className="flex items-center gap-2">
            <DollarSign size={16} style={{ color: '#1f8577' }} />
            <p className="font-black text-[#23282A] text-sm">Reward Configuration</p>
          </div>

          <div className="space-y-6">
            <div>
              <label className="block text-[10px] font-black text-[#5c6567] uppercase tracking-widest mb-3">Reward Type</label>
              <select
                value={settings.rewardType}
                onChange={e => update({ rewardType: e.target.value as 'fixed' | 'percentage' | 'hybrid' })}
                className="w-full bg-white border border-[#D4D7DC] rounded-lg px-4 py-2.5 text-sm font-medium text-[#23282A] outline-none focus:ring-2 focus:ring-[#1f8577]/20 focus:border-[#1f8577] transition-all"
              >
                <option value="fixed">Fixed Amount</option>
                <option value="percentage">Percentage of Invoice</option>
                <option value="hybrid">Fixed + Percentage (Hybrid)</option>
              </select>
            </div>

            {settings.rewardType !== 'percentage' && (
              <div>
                <label className="block text-[10px] font-black text-[#5c6567] uppercase tracking-widest mb-3">Fixed Reward Amount</label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[#5c6567] font-bold text-sm">$</span>
                  <input
                    type="number"
                    min={0}
                    step={0.01}
                    value={settings.rewardValue}
                    onChange={e => update({ rewardValue: parseFloat(e.target.value) || 0 })}
                    className="w-full bg-white border border-[#D4D7DC] rounded-lg pl-8 pr-4 py-2.5 text-sm font-medium text-[#23282A] outline-none focus:ring-2 focus:ring-[#1f8577]/20 focus:border-[#1f8577] transition-all"
                  />
                </div>
              </div>
            )}

            {settings.rewardType !== 'fixed' && (
              <div>
                <label className="block text-[10px] font-black text-[#5c6567] uppercase tracking-widest mb-3">Reward Percentage (%)</label>
                <div className="relative">
                  <Percent size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-[#5c6567]" />
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step={0.1}
                    value={settings.rewardPercentage}
                    onChange={e => update({ rewardPercentage: parseFloat(e.target.value) || 0 })}
                    className="w-full bg-white border border-[#D4D7DC] rounded-lg pl-10 pr-4 py-2.5 text-sm font-medium text-[#23282A] outline-none focus:ring-2 focus:ring-[#1f8577]/20 focus:border-[#1f8577] transition-all"
                  />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Limits */}
        <div style={{ background: '#FEFDFB', borderRadius: 12, border: '1px solid #D4D7DC', padding: 24, boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }} className="space-y-8">
          <div className="flex items-center gap-2">
            <Filter size={16} style={{ color: '#1f8577' }} />
            <p className="font-black text-[#23282A] text-sm">Limits & Thresholds</p>
          </div>

          <div className="space-y-6">
            <div>
              <label className="block text-[10px] font-black text-[#5c6567] uppercase tracking-widest mb-3">Min Purchase Amount</label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[#5c6567] font-bold text-sm">$</span>
                <input
                  type="number"
                  min={0}
                  step={0.01}
                  value={settings.minPurchaseAmount}
                  onChange={e => update({ minPurchaseAmount: parseFloat(e.target.value) || 0 })}
                  className="w-full bg-white border border-[#D4D7DC] rounded-lg pl-8 pr-4 py-2.5 text-sm font-medium text-[#23282A] outline-none focus:ring-2 focus:ring-[#1f8577]/20 focus:border-[#1f8577] transition-all"
                />
              </div>
            </div>
            <div>
              <label className="block text-[10px] font-black text-[#5c6567] uppercase tracking-widest mb-3">Max Reward Amount</label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[#5c6567] font-bold text-sm">$</span>
                <input
                  type="number"
                  min={0}
                  step={0.01}
                  value={settings.maxRewardAmount}
                  onChange={e => update({ maxRewardAmount: parseFloat(e.target.value) || 0 })}
                  placeholder="0 = no limit"
                  className="w-full bg-white border border-[#D4D7DC] rounded-lg pl-8 pr-4 py-2.5 text-sm font-medium text-[#23282A] outline-none focus:ring-2 focus:ring-[#1f8577]/20 focus:border-[#1f8577] transition-all"
                />
              </div>
            </div>
            <div>
              <label className="block text-[10px] font-black text-[#5c6567] uppercase tracking-widest mb-3">Auto-Approve Threshold</label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[#5c6567] font-bold text-sm">$</span>
                <input
                  type="number"
                  min={0}
                  step={0.01}
                  value={settings.autoApproveThreshold}
                  onChange={e => update({ autoApproveThreshold: parseFloat(e.target.value) || 0 })}
                  className="w-full bg-white border border-[#D4D7DC] rounded-lg pl-8 pr-4 py-2.5 text-sm font-medium text-[#23282A] outline-none focus:ring-2 focus:ring-[#1f8577]/20 focus:border-[#1f8577] transition-all"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Safety Controls */}
        <div style={{ background: '#FEFDFB', borderRadius: 12, border: '1px solid #D4D7DC', padding: 24, boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }} className="space-y-8 col-span-2">
          <div className="flex items-center gap-2">
            <Shield size={16} style={{ color: '#d99a3f' }} />
            <p className="font-black text-[#23282A] text-sm">Safety Controls</p>
          </div>

          <div className="grid grid-cols-3 gap-8">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-bold text-[#23282A] text-sm">Require Approval</p>
                <p className="text-[10px] text-[#5c6567] italic">Manual approval for rewards above threshold</p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  className="sr-only peer"
                  checked={settings.requireApproval}
                  onChange={e => update({ requireApproval: e.target.checked })}
                />
                <div className="w-12 h-6 bg-[#e4ddd1] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#d99a3f]"></div>
              </label>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="font-bold text-[#23282A] text-sm">Prevent Self-Referral</p>
                <p className="text-[10px] text-[#5c6567] italic">Block customers from referring themselves</p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  className="sr-only peer"
                  checked={settings.selfReferralPrevention}
                  onChange={e => update({ selfReferralPrevention: e.target.checked })}
                />
                <div className="w-12 h-6 bg-[#e4ddd1] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#d99a3f]"></div>
              </label>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="font-bold text-[#23282A] text-sm">Allow Multiple Rewards</p>
                <p className="text-[10px] text-[#5c6567] italic">Allow multiple rewards per referral</p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  className="sr-only peer"
                  checked={settings.allowMultipleRewards}
                  onChange={e => update({ allowMultipleRewards: e.target.checked })}
                />
                <div className="w-12 h-6 bg-[#e4ddd1] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#d99a3f]"></div>
              </label>
            </div>
          </div>
        </div>

        {/* Expiry */}
        <div style={{ background: '#FEFDFB', borderRadius: 12, border: '1px solid #D4D7DC', padding: 24, boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }} className="space-y-8 col-span-2">
          <div className="flex items-center gap-2">
            <Clock size={16} style={{ color: '#1f8577' }} />
            <p className="font-black text-[#23282A] text-sm">Referral Expiry</p>
          </div>
          <div className="grid grid-cols-1 max-w-xs">
            <div>
              <label className="block text-[10px] font-black text-[#5c6567] uppercase tracking-widest mb-3">Expiry Period (days)</label>
              <input
                type="number"
                min={0}
                value={settings.expiryDays}
                onChange={e => update({ expiryDays: parseInt(e.target.value) || 0 })}
                placeholder="0 = never expires"
                className="w-full bg-white border border-[#D4D7DC] rounded-lg px-4 py-2.5 text-sm font-medium text-[#23282A] outline-none focus:ring-2 focus:ring-[#1f8577]/20 focus:border-[#1f8577] transition-all"
              />
              <p className="text-[10px] text-[#5c6567] italic mt-1">Referrals expire after this many days (0 = no expiry)</p>
            </div>
          </div>
        </div>

        {/* Active Campaigns Summary */}
        {campaigns.filter(c => c.status === 'active').length > 0 && (
          <div style={{ background: '#FEFDFB', borderRadius: 12, border: '1px solid #D4D7DC', padding: 24, boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }} className="space-y-8 col-span-2">
            <div className="flex items-center gap-2">
              <Megaphone size={16} style={{ color: '#d99a3f' }} />
              <p className="font-black text-[#23282A] text-sm">Active Campaigns</p>
            </div>
            <div className="grid grid-cols-1 gap-4">
              {campaigns.filter(c => c.status === 'active').map(c => (
                <div key={c.id} className="flex items-center justify-between p-3 bg-[#eef7f6] rounded-lg border border-[#D4D7DC]">
                  <div>
                    <p className="font-bold text-[#23282A]">{c.name}</p>
                    <p className="text-[10px] text-[#5c6567]">{c.rewardType === 'fixed' ? `${c.rewardValue} fixed` : c.rewardType === 'percentage' ? `${c.rewardPercentage}%` : `${c.rewardValue} + ${c.rewardPercentage}%`} bonus{c.bonusMultiplier && c.bonusMultiplier > 1 ? ` x${c.bonusMultiplier}` : ''}</p>
                  </div>
                  <span className="text-[10px] font-bold text-[#d99a3f]">{c.totalRewardsGiven} / {c.maxTotalRewards || '∞'} used</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
