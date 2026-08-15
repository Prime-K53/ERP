import React, { useEffect, useState } from 'react'
import { EngagementTimelineEntry } from '../../../types/engagement'
import { engagementTimelineService } from '../../../services/engagementTimelineService'
import { Gift, DollarSign, Award, CreditCard, Users, Tag, Star, TrendingUp, Calendar, Clock } from 'lucide-react'

interface Props {
  customerId: string
  limit?: number
}

const eventIcons: Record<string, React.ReactNode> = {
  'points.earned': <Gift size={14} className="text-amber-500" />,
  'points.redeemed': <Gift size={14} className="text-rose-500" />,
  'cashback.issued': <DollarSign size={14} className="text-emerald-500" />,
  'cashback.approved': <DollarSign size={14} className="text-blue-500" />,
  'cashback.paid': <DollarSign size={14} className="text-emerald-500" />,
  'tier.changed': <Award size={14} className="text-purple-500" />,
  'tier.upgraded': <Award size={14} className="text-purple-500" />,
  'tier.downgraded': <Award size={14} className="text-slate-500" />,
  'giftcard.created': <CreditCard size={14} className="text-cyan-500" />,
  'giftcard.redeemed': <CreditCard size={14} className="text-teal-500" />,
  'giftcard.expired': <CreditCard size={14} className="text-slate-500" />,
  'affiliate.commission.earned': <Users size={14} className="text-orange-500" />,
  'affiliate.commission.paid': <DollarSign size={14} className="text-orange-500" />,
  'promotion.applied': <Tag size={14} className="text-rose-500" />,
  'reward.granted': <Star size={14} className="text-pink-500" />,
  'reward.milestone': <Award size={14} className="text-pink-500" />,
  'loyalty': <Gift size={14} className="text-amber-500" />,
  'cashback': <DollarSign size={14} className="text-emerald-500" />,
  'membership': <Award size={14} className="text-purple-500" />,
  'giftcard': <CreditCard size={14} className="text-cyan-500" />,
  'affiliate': <Users size={14} className="text-orange-500" />,
  'promotion': <Tag size={14} className="text-rose-500" />,
  'reward': <Star size={14} className="text-pink-500" />,
}

export const EngagementTimeline: React.FC<Props> = ({ customerId, limit = 50 }) => {
  const [entries, setEntries] = useState<EngagementTimelineEntry[]>([])

  useEffect(() => {
    loadData()
  }, [customerId])

  async function loadData() {
    try {
      const all = await engagementTimelineService.getTimelineForCustomer(customerId)
      setEntries(all.slice(0, limit))
    } catch {}
  }

  if (entries.length === 0) {
    return (
      <div className="text-center py-6 text-slate-400">
        <Clock size={24} className="mx-auto mb-2 opacity-50" />
        <p className="text-sm">No engagement activity yet</p>
      </div>
    )
  }

  return (
    <div className="space-y-1">
      {entries.map((entry) => (
        <div key={entry.id} className="flex items-start gap-3 py-2.5 px-3 bg-white rounded-lg border border-slate-100">
          <div className="mt-0.5 shrink-0">
            {eventIcons[entry.eventType] || eventIcons[entry.referenceType] || <TrendingUp size={14} className="text-slate-400" />}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium text-slate-700 truncate">{entry.title}</div>
            {entry.description && <div className="text-xs text-slate-400 mt-0.5">{entry.description}</div>}
          </div>
          <div className="text-right shrink-0">
            {entry.points != null && entry.points > 0 && (
              <div className="text-sm font-bold text-amber-600">+{entry.points} pts</div>
            )}
            {entry.amount != null && entry.amount > 0 && (
              <div className="text-sm font-bold text-emerald-600">${entry.amount.toFixed(2)}</div>
            )}
            <div className="text-[10px] text-slate-400 mt-0.5">
              {entry.timestamp ? new Date(entry.timestamp).toLocaleDateString() : ''}
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

export default EngagementTimeline
