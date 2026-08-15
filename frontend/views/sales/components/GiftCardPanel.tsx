import React, { useEffect, useState } from 'react'
import { GiftCard } from '../../../types/engagement'
import { dbService } from '../../../services/db'
import { CreditCard, Plus, RefreshCw, XCircle } from 'lucide-react'

interface Props {
  customerId: string
}

export const GiftCardPanel: React.FC<Props> = ({ customerId }) => {
  const [cards, setCards] = useState<GiftCard[]>([])

  useEffect(() => {
    loadData()
  }, [customerId])

  async function loadData() {
    try {
      const all = await dbService.getAll<GiftCard>('engagementGiftCards')
      setCards(
        all
          .filter((c: any) => c.customerId === customerId)
          .sort((a: any, b: any) => new Date(b.createdAt || '').getTime() - new Date(a.createdAt || '').getTime())
      )
    } catch {}
  }

  const activeCards = cards.filter((c) => c.status === 'active')
  const totalBalance = activeCards.reduce((s, c) => s + (c.currentBalance ?? 0), 0)

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-gradient-to-br from-cyan-50 to-cyan-100 rounded-xl p-4 border border-cyan-200">
          <div className="flex items-center gap-2 text-cyan-600 text-xs font-semibold uppercase tracking-wider mb-1">
            <CreditCard size={14} /> Active Cards
          </div>
          <div className="text-2xl font-black text-cyan-800">{activeCards.length}</div>
        </div>
        <div className="bg-gradient-to-br from-teal-50 to-teal-100 rounded-xl p-4 border border-teal-200">
          <div className="flex items-center gap-2 text-teal-600 text-xs font-semibold uppercase tracking-wider mb-1">
            <Plus size={14} /> Total Balance
          </div>
          <div className="text-2xl font-black text-teal-800">${totalBalance.toFixed(2)}</div>
        </div>
      </div>

      {cards.length > 0 && (
        <div>
          <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Gift Cards</h4>
          <div className="space-y-2">
            {cards.map((card: any) => (
              <div key={card.id} className="bg-white rounded-xl border border-slate-200 p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold text-sm text-slate-800">{card.code}</span>
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold border ${
                      card.status === 'active' ? 'bg-emerald-100 text-emerald-700 border-emerald-200' :
                      card.status === 'redeemed' ? 'bg-blue-100 text-blue-700 border-blue-200' :
                      card.status === 'expired' ? 'bg-slate-100 text-slate-500 border-slate-200' :
                      'bg-rose-100 text-rose-700 border-rose-200'
                    }`}>{card.status}</span>
                  </div>
                  <span className="font-bold text-lg text-slate-800">${(card.currentBalance ?? 0).toFixed(2)}</span>
                </div>
                <div className="flex items-center justify-between text-xs text-slate-400">
                  <span>Initial: ${(card.initialBalance ?? 0).toFixed(2)}</span>
                  {card.expiresAt && <span>Expires: {new Date(card.expiresAt).toLocaleDateString()}</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {cards.length === 0 && (
        <div className="text-center py-6 text-slate-400 text-sm">No gift cards</div>
      )}
    </div>
  )
}

export default GiftCardPanel
