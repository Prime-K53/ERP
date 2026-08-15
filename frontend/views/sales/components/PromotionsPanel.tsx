import React, { useEffect, useState } from 'react'
import { Promotion } from '../../../types/engagement'
import { dbService } from '../../../services/db'
import { Tag, Percent, Clock, CheckCircle } from 'lucide-react'

interface Props {
  customerId: string
}

export const PromotionsPanel: React.FC<Props> = ({ customerId }) => {
  const [promotions, setPromotions] = useState<Promotion[]>([])

  useEffect(() => {
    loadData()
  }, [customerId])

  async function loadData() {
    try {
      const all = await dbService.getAll<Promotion>('engagementPromotions')
      const now = new Date()
      setPromotions(
        all
          .filter((p: any) => {
            if (p.status !== 'active') return false
            if (p.startsAt && new Date(p.startsAt) > now) return false
            if (p.expiresAt && new Date(p.expiresAt) < now) return false
            if (p.maxUses > 0 && (p.currentUses ?? 0) >= p.maxUses) return false
            if (p.customerIds?.length > 0 && !p.customerIds.includes(customerId)) return false
            return true
          })
          .sort((a: any, b: any) => (b.priority ?? 0) - (a.priority ?? 0))
      )
    } catch {}
  }

  if (promotions.length === 0) {
    return <div className="text-center py-6 text-slate-400 text-sm">No active promotions</div>
  }

  const typeIcons: Record<string, React.ReactNode> = {
    percentage: <Percent size={14} />,
    fixed: <Tag size={14} />,
    coupon: <Tag size={14} />,
  }

  return (
    <div className="space-y-3">
      <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Available Promotions</h4>
      {promotions.map((promo: any) => (
        <div key={promo.id} className="bg-gradient-to-br from-rose-50 to-pink-50 rounded-xl p-4 border border-rose-200">
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-rose-500">{typeIcons[promo.type] || <Tag size={14} />}</span>
                <span className="font-bold text-slate-800">{promo.name}</span>
              </div>
              {promo.description && <p className="text-sm text-slate-500 mt-1">{promo.description}</p>}
            </div>
            <span className="text-lg font-black text-rose-600">
              {promo.type === 'percentage' ? `${promo.value}%` : `$${promo.value}`}
            </span>
          </div>
          <div className="flex items-center gap-3 mt-2 text-[10px] text-slate-400 font-medium">
            {promo.minPurchase > 0 && <span>Min: $${promo.minPurchase}</span>}
            {promo.maxDiscount > 0 && <span>Max discount: ${promo.maxDiscount}</span>}
            {promo.expiresAt && (
              <span className="flex items-center gap-1">
                <Clock size={10} /> Expires {new Date(promo.expiresAt).toLocaleDateString()}
              </span>
            )}
            <span className={`px-1 py-0.5 rounded-full text-[9px] font-bold uppercase ${
              promo.stackingRule === 'stackable' ? 'bg-emerald-100 text-emerald-600' :
              promo.stackingRule === 'best_only' ? 'bg-amber-100 text-amber-600' :
              'bg-blue-100 text-blue-600'
            }`}>{promo.stackingRule}</span>
          </div>
        </div>
      ))}
    </div>
  )
}

export default PromotionsPanel
