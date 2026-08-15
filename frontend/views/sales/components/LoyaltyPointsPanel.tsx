import React, { useEffect, useState } from 'react'
import { PointBalance, PointEntry } from '../../../types/engagement'
import { dbService } from '../../../services/db'
import { Gift, TrendingUp, Clock, RotateCcw } from 'lucide-react'

interface Props {
  customerId: string
}

export const LoyaltyPointsPanel: React.FC<Props> = ({ customerId }) => {
  const [balance, setBalance] = useState<PointBalance | null>(null)
  const [recentEntries, setRecentEntries] = useState<PointEntry[]>([])

  useEffect(() => {
    loadData()
  }, [customerId])

  async function loadData() {
    try {
      const balances = await dbService.getAll<PointBalance>('engagementPointBalances')
      const b = balances.find((b: any) => b.customerId === customerId)
      setBalance(b || null)

      const entries = await dbService.getAll<PointEntry>('engagementPoints')
      setRecentEntries(
        entries
          .filter((e: any) => e.customerId === customerId)
          .sort((a: any, b: any) => new Date(b.createdAt || '').getTime() - new Date(a.createdAt || '').getTime())
          .slice(0, 10)
      )
    } catch {}
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-gradient-to-br from-amber-50 to-amber-100 rounded-xl p-4 border border-amber-200">
          <div className="flex items-center gap-2 text-amber-600 text-xs font-semibold uppercase tracking-wider mb-1">
            <Gift size={14} /> Balance
          </div>
          <div className="text-2xl font-black text-amber-800">{balance?.currentBalance ?? 0}</div>
          <div className="text-[10px] text-amber-600 font-medium">points</div>
        </div>
        <div className="bg-gradient-to-br from-emerald-50 to-emerald-100 rounded-xl p-4 border border-emerald-200">
          <div className="flex items-center gap-2 text-emerald-600 text-xs font-semibold uppercase tracking-wider mb-1">
            <TrendingUp size={14} /> Earned
          </div>
          <div className="text-2xl font-black text-emerald-800">{balance?.totalEarned ?? 0}</div>
          <div className="text-[10px] text-emerald-600 font-medium">lifetime</div>
        </div>
        <div className="bg-gradient-to-br from-rose-50 to-rose-100 rounded-xl p-4 border border-rose-200">
          <div className="flex items-center gap-2 text-rose-600 text-xs font-semibold uppercase tracking-wider mb-1">
            <RotateCcw size={14} /> Redeemed
          </div>
          <div className="text-2xl font-black text-rose-800">{balance?.totalRedeemed ?? 0}</div>
          <div className="text-[10px] text-rose-600 font-medium">lifetime</div>
        </div>
        <div className="bg-gradient-to-br from-slate-50 to-slate-100 rounded-xl p-4 border border-slate-200">
          <div className="flex items-center gap-2 text-slate-600 text-xs font-semibold uppercase tracking-wider mb-1">
            <Clock size={14} /> Expiring
          </div>
          <div className="text-2xl font-black text-slate-800">{balance?.pendingExpiry ?? 0}</div>
          <div className="text-[10px] text-slate-600 font-medium">points</div>
        </div>
      </div>

      {recentEntries.length > 0 && (
        <div>
          <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Recent Activity</h4>
          <div className="space-y-1">
            {recentEntries.map((entry: any) => (
              <div key={entry.id} className="flex items-center justify-between py-2 px-3 bg-white rounded-lg border border-slate-100 text-sm">
                <div className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full ${entry.type === 'earned' || entry.type === 'bonus' ? 'bg-emerald-400' : entry.type === 'redeemed' ? 'bg-rose-400' : 'bg-amber-400'}`} />
                  <span className="font-medium text-slate-700">{entry.description || entry.type}</span>
                </div>
                <span className={`font-bold ${entry.type === 'earned' || entry.type === 'bonus' ? 'text-emerald-600' : 'text-rose-600'}`}>
                  {entry.type === 'earned' || entry.type === 'bonus' ? '+' : '-'}{entry.points}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {!balance && (
        <div className="text-center py-6 text-slate-400 text-sm">No points activity yet</div>
      )}
    </div>
  )
}

export default LoyaltyPointsPanel
