import React, { useEffect, useState } from 'react'
import { CustomerTier, MembershipTier } from '../../../types/engagement'
import { dbService } from '../../../services/db'
import { Award, TrendingUp, Star, Shield } from 'lucide-react'

interface Props {
  customerId: string
}

export const MembershipPanel: React.FC<Props> = ({ customerId }) => {
  const [customerTier, setCustomerTier] = useState<CustomerTier | null>(null)
  const [tierDef, setTierDef] = useState<MembershipTier | null>(null)
  const [allTiers, setAllTiers] = useState<MembershipTier[]>([])

  useEffect(() => {
    loadData()
  }, [customerId])

  async function loadData() {
    try {
      const tiers = await dbService.getAll<MembershipTier>('engagementMembershipTiers')
      setAllTiers(tiers.filter((t: any) => t.status === 'active').sort((a: any, b: any) => a.level - b.level))

      const customerTiers = await dbService.getAll<CustomerTier>('engagementCustomerTiers')
      const active = customerTiers.find((t: any) => t.customerId === customerId && t.status === 'active')
      setCustomerTier(active || null)

      if (active) {
        const def = tiers.find((t: any) => t.id === active.tierId)
        setTierDef(def || null)
      }
    } catch {}
  }

  return (
    <div className="space-y-4">
      {tierDef && (
        <div className="bg-gradient-to-br from-purple-50 to-indigo-100 rounded-xl p-5 border border-purple-200">
          <div className="flex items-center justify-between mb-3">
            <div>
              <div className="text-xs font-semibold text-purple-600 uppercase tracking-wider">Current Tier</div>
              <div className="text-xl font-black text-purple-900 flex items-center gap-2 mt-1">
                <Award size={20} className="text-purple-500" />
                {tierDef.name}
              </div>
            </div>
            {tierDef.color && (
              <div className="w-10 h-10 rounded-full" style={{ backgroundColor: tierDef.color }} />
            )}
          </div>

          <div className="grid grid-cols-2 gap-2 text-sm">
            {tierDef.pointMultiplier > 1 && (
              <div className="flex items-center gap-1.5 text-purple-700">
                <Star size={14} /> {tierDef.pointMultiplier}x Points
              </div>
            )}
            {tierDef.cashbackRate > 0 && (
              <div className="flex items-center gap-1.5 text-purple-700">
                <TrendingUp size={14} /> {tierDef.cashbackRate}% Cashback
              </div>
            )}
            {tierDef.freeShipping && (
              <div className="flex items-center gap-1.5 text-purple-700">
                <Shield size={14} /> Free Shipping
              </div>
            )}
            {tierDef.prioritySupport && (
              <div className="flex items-center gap-1.5 text-purple-700">
                <Shield size={14} /> Priority Support
              </div>
            )}
          </div>
        </div>
      )}

      {!tierDef && (
        <div className="text-center py-6 text-slate-400 text-sm">No tier assigned</div>
      )}

      {allTiers.length > 0 && (
        <div>
          <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Available Tiers</h4>
          <div className="space-y-1">
            {allTiers.map((tier) => (
              <div
                key={tier.id}
                className={`flex items-center justify-between py-2 px-3 rounded-lg border text-sm ${
                  tierDef?.id === tier.id
                    ? 'bg-purple-50 border-purple-300'
                    : 'bg-white border-slate-100'
                }`}
              >
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[10px] font-bold" style={{ backgroundColor: tier.color || '#6366f1' }}>
                    {tier.level}
                  </div>
                  <span className="font-medium text-slate-700">{tier.name}</span>
                </div>
                <div className="text-xs text-slate-400">
                  {tier.entrySpend > 0 && `Spend $${tier.entrySpend}`}
                  {tier.pointMultiplier > 1 && ` · ${tier.pointMultiplier}x pts`}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export default MembershipPanel
