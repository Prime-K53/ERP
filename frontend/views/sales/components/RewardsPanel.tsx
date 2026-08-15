import React, { useEffect, useState } from 'react'
import { CustomerReward, MilestoneRewardDef } from '../../../types/engagement'
import { dbService } from '../../../services/db'
import { Gift, Award, Calendar, Gift as Present, Star, CheckCircle, Clock } from 'lucide-react'

interface Props {
  customerId: string
}

export const RewardsPanel: React.FC<Props> = ({ customerId }) => {
  const [rewards, setRewards] = useState<CustomerReward[]>([])

  useEffect(() => {
    loadData()
  }, [customerId])

  async function loadData() {
    try {
      const all = await dbService.getAll<CustomerReward>('engagementCustomerRewards')
      setRewards(
        all
          .filter((r: any) => r.customerId === customerId)
          .sort((a: any, b: any) => new Date(b.createdAt || '').getTime() - new Date(a.createdAt || '').getTime())
      )
    } catch {}
  }

  const typeIcons: Record<string, React.ReactNode> = {
    milestone: <Award size={14} />,
    birthday: <Gift size={14} />,
    anniversary: <Calendar size={14} />,
    manual: <Star size={14} />,
    purchase: <Present size={14} />,
    tier: <Award size={14} />,
  }

  const statusColors: Record<string, string> = {
    approved: 'bg-emerald-100 text-emerald-700 border-emerald-200',
    granted: 'bg-blue-100 text-blue-700 border-blue-200',
    pending: 'bg-amber-100 text-amber-700 border-amber-200',
    expired: 'bg-slate-100 text-slate-500 border-slate-200',
    cancelled: 'bg-rose-100 text-rose-700 border-rose-200',
    rejected: 'bg-rose-100 text-rose-700 border-rose-200',
  }

  return (
    <div className="space-y-4">
      {rewards.length > 0 && (
        <div>
          <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Rewards History</h4>
          <div className="space-y-1 max-h-64 overflow-y-auto">
            {rewards.map((reward: any) => (
              <div key={reward.id} className="flex items-center justify-between py-2 px-3 bg-white rounded-lg border border-slate-100 text-sm">
                <div className="flex items-center gap-2">
                  <span className="text-slate-400">{typeIcons[reward.type] || <Gift size={14} />}</span>
                  <span className="font-medium text-slate-700">{reward.description || reward.type}</span>
                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold border ${statusColors[reward.status] || 'bg-slate-100 text-slate-600'}`}>
                    {reward.status}
                  </span>
                </div>
                <span className="font-bold text-emerald-600">
                  {reward.rewardType === 'points' ? `${reward.rewardValue} pts` : `$${reward.rewardValue}`}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {rewards.length === 0 && (
        <div className="text-center py-6 text-slate-400 text-sm">No rewards yet</div>
      )}
    </div>
  )
}

export default RewardsPanel
