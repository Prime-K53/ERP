import React, { useState, useEffect } from 'react'
import { dbService } from '../../services/db'
import { GiftCard } from '../../types/engagement'
import { Plus, Search, RotateCcw, X } from 'lucide-react'

const t = { 50: '#eef7f6', 100: '#d3ece9', 200: '#a6d9d3', 500: '#1f8577', 600: '#146b60', 700: '#0f544c', 800: '#0b3e39' };
const amber = { 100: '#fbead0', 500: '#d99a3f' };
const paper = '#FEFDFB', ink = '#23282A', inkSoft = '#5c6567', hairline = '#e4ddd1', danger = '#b5493f';

export const GiftCardsAdmin: React.FC = () => {
    const [cards, setCards] = useState<GiftCard[]>([])
    const [search, setSearch] = useState('')
    const [showIssue, setShowIssue] = useState(false)
    const [issueForm, setIssueForm] = useState({ code: '', customerId: '', initialBalance: 50, type: 'digital' as const, expiresAt: '', rechargeable: true, transferable: false, giftMessage: '', designColor: t[500] })
    const [redeemCode, setRedeemCode] = useState('')

    useEffect(() => { loadCards() }, [])

    const loadCards = async () => {
        const data = await dbService.getAll<GiftCard>('engagementGiftCards')
        setCards(data.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || '')))
    }

    const filteredCards = cards.filter(c => !search || c.code.toLowerCase().includes(search.toLowerCase()) || (c.customerId || '').toLowerCase().includes(search.toLowerCase()))

    const generateCode = () => {
        const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
        let code = ''
        for (let i = 0; i < 16; i++) { if (i > 0 && i % 4 === 0) code += '-'; code += chars[Math.floor(Math.random() * chars.length)] }
        return code
    }

    const handleIssue = async () => {
        if (!issueForm.code) return
        await dbService.put('engagementGiftCards', { id: `GC_${Date.now()}`, code: issueForm.code, customerId: issueForm.customerId || null, initialBalance: issueForm.initialBalance, currentBalance: issueForm.initialBalance, status: 'active', type: issueForm.type, expiresAt: issueForm.expiresAt || null, rechargeable: issueForm.rechargeable, transferable: issueForm.transferable, giftMessage: issueForm.giftMessage || null, designColor: issueForm.designColor, createdAt: new Date().toISOString() } as GiftCard)
        setShowIssue(false)
        setIssueForm({ code: '', customerId: '', initialBalance: 50, type: 'digital', expiresAt: '', rechargeable: true, transferable: false, giftMessage: '', designColor: t[500] })
        await loadCards()
    }

    const handleRedeem = async () => {
        const card = cards.find(c => c.code === redeemCode && c.status === 'active')
        if (!card) { alert('Gift card not found or not active'); return }
        await dbService.put('engagementGiftCards', { ...card, currentBalance: 0, status: 'redeemed' } as GiftCard)
        setRedeemCode('')
        await loadCards()
    }

    const cancelCard = async (id: string) => {
        const card = cards.find(c => c.id === id)
        if (!card) return
        await dbService.put('engagementGiftCards', { ...card, status: 'cancelled' } as GiftCard)
        await loadCards()
    }

    const statusBadge = (status: string) => {
        const colors: Record<string, string> = { active: t[100], inactive: hairline, expired: '#fef0ee', cancelled: '#fef0ee', redeemed: '#dbeafe' }
        const txtColors: Record<string, string> = { active: t[700], inactive: inkSoft, expired: danger, cancelled: danger, redeemed: '#1e40af' }
        return <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: colors[status] || hairline, color: txtColors[status] || inkSoft }}>{status}</span>
    }

    const inputStyle: React.CSSProperties = {
        fontFamily: "'Inter', sans-serif", fontSize: 13.5, color: ink, background: paper,
        border: `1.4px solid ${hairline}`, borderRadius: 9, padding: '7px 10px', outline: 'none'
    }

    return (
        <div style={{ padding: 24, maxWidth: 1200, margin: '0 auto', background: t[50], minHeight: '100%' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
                <div>
                    <h2 style={{ fontSize: 20, fontWeight: 700, color: ink, margin: 0 }}>Gift Cards</h2>
                    <p style={{ fontSize: 13, color: inkSoft, margin: '2px 0 0' }}>Issue, manage, and redeem gift cards</p>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                    <div style={{ position: 'relative' }}>
                        <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: inkSoft }} />
                        <input className="prime-input" type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search cards..." style={{ ...inputStyle, paddingLeft: 30, width: 180 }} />
                    </div>
                    <button className="prime-btn" onClick={() => setShowIssue(true)} style={{ padding: '7px 12px', background: t[500], color: '#fff', borderRadius: 9, border: 'none', fontSize: 12, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', transition: 'all .15s ease' }}
                        onMouseEnter={e => { e.currentTarget.style.background = t[700]; }}
                        onMouseLeave={e => { e.currentTarget.style.background = t[500]; }}
                    ><Plus size={14} /> Issue Card</button>
                    <button className="prime-btn-secondary" onClick={loadCards} style={{ padding: '7px 10px', background: paper, border: `1.4px solid ${hairline}`, borderRadius: 9, color: inkSoft, cursor: 'pointer', display: 'flex', alignItems: 'center' }}><RotateCcw size={14} /></button>
                </div>
            </div>

            <div style={{ marginBottom: 16, padding: 12, background: amber[100], borderRadius: 12, border: `1.4px solid ${amber[500]}40`, display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: '#92400e' }}>Redeem Card:</span>
                <input className="prime-input" type="text" value={redeemCode} onChange={e => setRedeemCode(e.target.value.toUpperCase())} placeholder="Enter gift card code..." style={{ flex: 1, ...inputStyle, fontFamily: "'JetBrains Mono', monospace" }} />
                <button className="prime-btn" onClick={handleRedeem} disabled={!redeemCode} style={{ padding: '7px 12px', background: amber[500], color: '#fff', borderRadius: 9, border: 'none', fontSize: 12, fontWeight: 700, cursor: 'pointer', opacity: redeemCode ? 1 : 0.5 }}>Redeem</button>
            </div>

            {showIssue && (
                <div className="prime-card" style={{ marginBottom: 20, padding: 16, background: t[50], borderRadius: 12, border: `1.4px solid ${t[200]}` }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 12 }}>
                        <div>
                            <label className="prime-label" style={{ display: 'block', fontSize: 12, fontWeight: 600, color: inkSoft, marginBottom: 4 }}>Code</label>
                            <div style={{ display: 'flex', gap: 4 }}>
                                <input className="prime-input" type="text" value={issueForm.code} onChange={e => setIssueForm(prev => ({ ...prev, code: e.target.value.toUpperCase() }))} placeholder="XXXX-XXXX-XXXX-XXXX" style={{ flex: 1, ...inputStyle, fontFamily: "'JetBrains Mono', monospace" }} />
                                <button className="prime-btn-secondary" onClick={() => setIssueForm(prev => ({ ...prev, code: generateCode() }))} style={{ fontSize: 12, color: t[500], fontWeight: 700, background: 'none', border: 'none', cursor: 'pointer' }}>Generate</button>
                            </div>
                        </div>
                        <div>
                            <label className="prime-label" style={{ display: 'block', fontSize: 12, fontWeight: 600, color: inkSoft, marginBottom: 4 }}>Initial Balance ($)</label>
                            <input className="prime-input" type="number" value={issueForm.initialBalance} onChange={e => setIssueForm(prev => ({ ...prev, initialBalance: parseFloat(e.target.value) || 0 }))} style={{ width: '100%', ...inputStyle }} />
                        </div>
                        <div>
                            <label className="prime-label" style={{ display: 'block', fontSize: 12, fontWeight: 600, color: inkSoft, marginBottom: 4 }}>Expires At</label>
                            <input className="prime-input" type="date" value={issueForm.expiresAt} onChange={e => setIssueForm(prev => ({ ...prev, expiresAt: e.target.value }))} style={{ width: '100%', ...inputStyle }} />
                        </div>
                        <div>
                            <label className="prime-label" style={{ display: 'block', fontSize: 12, fontWeight: 600, color: inkSoft, marginBottom: 4 }}>Customer ID (optional)</label>
                            <input className="prime-input" type="text" value={issueForm.customerId} onChange={e => setIssueForm(prev => ({ ...prev, customerId: e.target.value }))} style={{ width: '100%', ...inputStyle }} />
                        </div>
                        <div>
                            <label className="prime-label" style={{ display: 'block', fontSize: 12, fontWeight: 600, color: inkSoft, marginBottom: 4 }}>Gift Message</label>
                            <input className="prime-input" type="text" value={issueForm.giftMessage} onChange={e => setIssueForm(prev => ({ ...prev, giftMessage: e.target.value }))} style={{ width: '100%', ...inputStyle }} />
                        </div>
                        <div>
                            <label className="prime-label" style={{ display: 'block', fontSize: 12, fontWeight: 600, color: inkSoft, marginBottom: 4 }}>Color</label>
                            <input type="color" value={issueForm.designColor} onChange={e => setIssueForm(prev => ({ ...prev, designColor: e.target.value }))} style={{ width: '100%', height: 32, border: `1.4px solid ${hairline}`, borderRadius: 9, cursor: 'pointer' }} />
                        </div>
                    </div>
                    <div style={{ display: 'flex', gap: 16, marginBottom: 12 }}>
                        {(['rechargeable', 'transferable'] as const).map(f => (
                            <label key={f} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: ink, cursor: 'pointer' }}>
                                <input type="checkbox" checked={issueForm[f]} onChange={e => setIssueForm(prev => ({ ...prev, [f]: e.target.checked }))} style={{ width: 16, height: 16, accentColor: t[500], cursor: 'pointer' }} />
                                {f.charAt(0).toUpperCase() + f.slice(1)}
                            </label>
                        ))}
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                        <button className="prime-btn" onClick={handleIssue} style={{ padding: '6px 12px', background: t[500], color: '#fff', borderRadius: 9, border: 'none', fontSize: 12, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}><Plus size={12} /> Issue Card</button>
                        <button className="prime-btn-secondary" onClick={() => setShowIssue(false)} style={{ padding: '6px 12px', background: paper, border: `1.4px solid ${hairline}`, borderRadius: 9, color: inkSoft, fontSize: 12, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}><X size={12} /> Cancel</button>
                    </div>
                </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {filteredCards.map(card => (
                    <div key={card.id} className="prime-card" style={{ background: paper, borderRadius: 12, border: `1.4px solid ${hairline}`, padding: 14, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                            <div style={{ width: 32, height: 20, borderRadius: 4, background: card.designColor || t[500] }} />
                            <div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <span style={{ fontSize: 13, fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, color: ink }}>{card.code}</span>
                                    {statusBadge(card.status || 'active')}
                                </div>
                                <div style={{ display: 'flex', gap: 12, fontSize: 12, color: inkSoft, marginTop: 2 }}>
                                    <span>Balance: ${card.currentBalance?.toFixed(2)} / ${card.initialBalance?.toFixed(2)}</span>
                                    {card.customerId && <span>Customer: {card.customerId}</span>}
                                    {card.expiresAt && <span>Expires: {new Date(card.expiresAt).toLocaleDateString()}</span>}
                                </div>
                            </div>
                        </div>
                        <div>{card.status === 'active' && <button className="prime-btn-secondary" onClick={() => cancelCard(card.id)} style={{ padding: '4px 8px', fontSize: 12, color: danger, background: 'none', border: 'none', cursor: 'pointer' }}>Cancel</button>}</div>
                    </div>
                ))}
                {filteredCards.length === 0 && (
                    <div style={{ textAlign: 'center', padding: 40, color: inkSoft, fontSize: 13 }}>{search ? 'No gift cards match your search.' : 'No gift cards issued yet. Click "Issue Card" to create one.'}</div>
                )}
            </div>
        </div>
    )
}

export default GiftCardsAdmin
