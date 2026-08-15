import React, { useEffect, useState } from 'react'
import { CashbackEntry } from '../../../types/engagement'
import { dbService } from '../../../services/db'
import { DollarSign, Clock, CheckCircle, XCircle } from 'lucide-react'

interface Props {
  customerId: string
}

const statusColors: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-700 border-amber-200',
  approved: 'bg-blue-100 text-blue-700 border-blue-200',
  paid: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  reversed: 'bg-rose-100 text-rose-700 border-rose-200',
  expired: 'bg-slate-100 text-slate-500 border-slate-200',
}

export const CashbackPanel: React.FC<Props> = ({ customerId }) => {
  const [entries, setEntries] = useState<CashbackEntry[]>([])

  useEffect(() => {
    loadData()
  }, [customerId])

  async function loadData() {
    try {
      const all = await dbService.getAll<CashbackEntry>('engagementCashback')
      setEntries(
        all
          .filter((e: any) => e.customerId === customerId)
          .sort((a: any, b: any) => new Date(b.createdAt || '').getTime() - new Date(a.createdAt || '').getTime())
      )
    } catch {}
  }

  const totals = {
    total: entries.reduce((s, e) => s + (e.amount ?? 0), 0),
    paid: entries.filter((e) => e.status === 'paid').reduce((s, e) => s + (e.amount ?? 0), 0),
    pending: entries.filter((e) => e.status === 'pending').reduce((s, e) => s + (e.amount ?? 0), 0),
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-gradient-to-br from-emerald-50 to-emerald-100 rounded-xl p-4 border border-emerald-200">
          <div className="flex items-center gap-2 text-emerald-600 text-xs font-semibold uppercase tracking-wider mb-1">
            <DollarSign size={14} /> Total
          </div>
          <div className="text-2xl font-black text-emerald-800">${totals.total.toFixed(2)}</div>
        </div>
        <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-xl p-4 border border-blue-200">
          <div className="flex items-center gap-2 text-blue-600 text-xs font-semibold uppercase tracking-wider mb-1">
            <CheckCircle size={14} /> Paid
          </div>
          <div className="text-2xl font-black text-blue-800">${totals.paid.toFixed(2)}</div>
        </div>
        <div className="bg-gradient-to-br from-amber-50 to-amber-100 rounded-xl p-4 border border-amber-200">
          <div className="flex items-center gap-2 text-amber-600 text-xs font-semibold uppercase tracking-wider mb-1">
            <Clock size={14} /> Pending
          </div>
          <div className="text-2xl font-black text-amber-800">${totals.pending.toFixed(2)}</div>
        </div>
      </div>

      {entries.length > 0 && (
        <div>
          <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">History</h4>
          <div className="space-y-1 max-h-64 overflow-y-auto">
            {entries.map((entry: any) => (
              <div key={entry.id} className="flex items-center justify-between py-2 px-3 bg-white rounded-lg border border-slate-100 text-sm">
                <div className="flex items-center gap-2">
                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold border ${statusColors[entry.status] || 'bg-slate-100 text-slate-600'}`}>
                    {entry.status}
                  </span>
                  <span className="text-slate-600">{entry.type}</span>
                  {entry.category && <span className="text-slate-400 text-xs">({entry.category})</span>}
                </div>
                <span className="font-bold text-emerald-600">${(entry.amount ?? 0).toFixed(2)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {entries.length === 0 && (
        <div className="text-center py-6 text-slate-400 text-sm">No cashback records</div>
      )}
    </div>
  )
}

export default CashbackPanel
