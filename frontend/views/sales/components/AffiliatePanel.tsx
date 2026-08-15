import React, { useEffect, useState } from 'react'
import { AffiliateAccount, AffiliateCommission } from '../../../types/engagement'
import { dbService } from '../../../services/db'
import { Users, DollarSign, Link, BarChart3 } from 'lucide-react'

interface Props {
  customerId: string
}

export const AffiliatePanel: React.FC<Props> = ({ customerId }) => {
  const [account, setAccount] = useState<AffiliateAccount | null>(null)
  const [commissions, setCommissions] = useState<AffiliateCommission[]>([])

  useEffect(() => {
    loadData()
  }, [customerId])

  async function loadData() {
    try {
      const affiliates = await dbService.getAll<AffiliateAccount>('engagementAffiliates')
      const acc = affiliates.find((a: any) => a.customerId === customerId)
      setAccount(acc || null)

      if (acc) {
        const all = await dbService.getAll<AffiliateCommission>('engagementAffiliateCommissions')
        setCommissions(
          all
            .filter((c: any) => c.affiliateId === acc.id)
            .sort((a: any, b: any) => new Date(b.createdAt || '').getTime() - new Date(a.createdAt || '').getTime())
        )
      }
    } catch {}
  }

  if (!account) {
    return <div className="text-center py-6 text-slate-400 text-sm">No affiliate account</div>
  }

  return (
    <div className="space-y-4">
      <div className="bg-gradient-to-br from-orange-50 to-orange-100 rounded-xl p-4 border border-orange-200">
        <div className="flex items-center gap-2 text-orange-600 text-xs font-semibold uppercase tracking-wider mb-1">
          <Link size={14} /> Referral Code
        </div>
        <div className="font-mono font-bold text-lg text-orange-800">{account.referralCode}</div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white rounded-xl p-3 border border-slate-200">
          <div className="text-xs text-slate-500 font-medium">Earned</div>
          <div className="text-lg font-bold text-emerald-600">${(account.totalEarned ?? 0).toFixed(2)}</div>
        </div>
        <div className="bg-white rounded-xl p-3 border border-slate-200">
          <div className="text-xs text-slate-500 font-medium">Paid</div>
          <div className="text-lg font-bold text-blue-600">${(account.totalPaid ?? 0).toFixed(2)}</div>
        </div>
        <div className="bg-white rounded-xl p-3 border border-slate-200">
          <div className="text-xs text-slate-500 font-medium">Pending</div>
          <div className="text-lg font-bold text-amber-600">${(account.totalPending ?? 0).toFixed(2)}</div>
        </div>
        <div className="bg-white rounded-xl p-3 border border-slate-200">
          <div className="text-xs text-slate-500 font-medium">Rate</div>
          <div className="text-lg font-bold text-purple-600">{account.commissionRate}%</div>
        </div>
      </div>

      {commissions.length > 0 && (
        <div>
          <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Commissions</h4>
          <div className="space-y-1 max-h-64 overflow-y-auto">
            {commissions.map((c: any) => (
              <div key={c.id} className="flex items-center justify-between py-2 px-3 bg-white rounded-lg border border-slate-100 text-sm">
                <div className="flex items-center gap-2">
                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold border ${
                    c.status === 'paid' ? 'bg-emerald-100 text-emerald-700 border-emerald-200' :
                    c.status === 'pending' ? 'bg-amber-100 text-amber-700 border-amber-200' :
                    c.status === 'approved' ? 'bg-blue-100 text-blue-700 border-blue-200' :
                    'bg-rose-100 text-rose-700 border-rose-200'
                  }`}>{c.status}</span>
                  <span className="text-slate-500 text-xs">{c.rate}%</span>
                </div>
                <span className="font-bold text-emerald-600">${(c.amount ?? 0).toFixed(2)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export default AffiliatePanel
