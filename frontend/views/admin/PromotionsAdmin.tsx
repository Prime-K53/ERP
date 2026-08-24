import React, { useState, useEffect } from 'react'
import { dbService } from '../../services/db'
import { Promotion } from '../../types/engagement'
import { Plus, Pencil, Trash2, Save, X, Play, Pause } from 'lucide-react'

const t = { 50: '#eef7f6', 100: '#d3ece9', 200: '#a6d9d3', 500: '#1f8577', 600: '#146b60', 700: '#0f544c', 800: '#0b3e39' };
const amber = { 100: '#fbead0', 500: '#d99a3f' };
const paper = '#FEFDFB', ink = '#23282A', inkSoft = '#5c6567', hairline = '#e4ddd1', danger = '#b5493f';

const STACKING_OPTIONS = ['best_only', 'stackable', 'exclusive'] as const
const STATUS_OPTIONS = ['draft', 'active', 'paused', 'expired', 'cancelled'] as const
const PROMO_TYPES = ['percentage', 'fixed', 'category', 'brand', 'bundle', 'buy_x_get_y', 'tier', 'campaign', 'coupon'] as const

export const PromotionsAdmin: React.FC = () => {
    const [promotions, setPromotions] = useState<Promotion[]>([])
    const [editingId, setEditingId] = useState<string | null>(null)
    const [editForm, setEditForm] = useState<Partial<Promotion>>({})
    const [showNew, setShowNew] = useState(false)
    const [newPromo, setNewPromo] = useState<Partial<Promotion>>({ name: '', description: '', type: 'percentage', value: 0, stackingRule: 'best_only', priority: 0, minPurchase: 0, maxDiscount: 0, maxUses: 0, currentUses: 0, customerIds: [], tierIds: [], status: 'draft', startsAt: new Date().toISOString(), expiresAt: '', buyXQty: 0, getYQty: 0, getYDiscount: 0 })

    useEffect(() => { loadPromotions() }, [])

    const loadPromotions = async () => {
        const data = await dbService.getAll<Promotion>('engagementPromotions')
        setPromotions(data.sort((a, b) => (b.priority || 0) - (a.priority || 0)))
    }

    const startEdit = (p: Promotion) => { setEditingId(p.id); setEditForm({ ...p }) }
    const saveEdit = async () => { if (!editingId || !editForm.name) return; await dbService.put('engagementPromotions', { ...editForm, id: editingId } as Promotion); setEditingId(null); setEditForm({}); await loadPromotions() }
    const saveNew = async () => { if (!newPromo.name) return; const id = `PROMO_${Date.now()}`; await dbService.put('engagementPromotions', { ...newPromo, id } as Promotion); setShowNew(false); setNewPromo({ name: '', description: '', type: 'percentage', value: 0, stackingRule: 'best_only', priority: 0, minPurchase: 0, maxDiscount: 0, maxUses: 0, currentUses: 0, customerIds: [], tierIds: [], status: 'draft', startsAt: new Date().toISOString(), expiresAt: '', buyXQty: 0, getYQty: 0, getYDiscount: 0 }); await loadPromotions() }
    const deletePromo = async (id: string) => { await dbService.delete('engagementPromotions', id); await loadPromotions() }
    const toggleStatus = async (p: Promotion) => { const newStatus = p.status === 'active' ? 'paused' : 'active'; await dbService.put('engagementPromotions', { ...p, status: newStatus } as Promotion); await loadPromotions() }

    const statusBadge = (status: string) => {
        const colors: Record<string, string> = { draft: hairline, active: t[100], paused: amber[100], expired: '#fef0ee', cancelled: '#fef0ee' }
        const txtColors: Record<string, string> = { draft: inkSoft, active: t[700], paused: '#92400e', expired: danger, cancelled: danger }
        return <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: colors[status] || hairline, color: txtColors[status] || inkSoft }}>{status}</span>
    }

    const inputStyle: React.CSSProperties = { width: '100%', fontFamily: "'Inter', sans-serif", fontSize: 13.5, color: ink, background: paper, border: `1.4px solid ${hairline}`, borderRadius: 9, padding: '7px 10px', outline: 'none' }

    function Input({ label, value, onChange, type = 'text' }: { label: string; value: any; onChange: (v: string) => void; type?: string }) {
        return <div>
            <label className="prime-label" style={{ display: 'block', fontSize: 12, fontWeight: 600, color: inkSoft, marginBottom: 4 }}>{label}</label>
            <input className="prime-input" type={type} value={value ?? ''} onChange={e => onChange(e.target.value)} style={inputStyle} />
        </div>
    }

    function Select({ label, value, options, onChange }: { label: string; value: string; options: readonly string[]; onChange: (v: string) => void }) {
        return <div>
            <label className="prime-label" style={{ display: 'block', fontSize: 12, fontWeight: 600, color: inkSoft, marginBottom: 4 }}>{label}</label>
            <select className="prime-select" value={value} onChange={e => onChange(e.target.value)} style={{
                ...inputStyle, appearance: 'none',
                backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%235c6567'/%3E%3C/svg%3E")`,
                backgroundRepeat: 'no-repeat', backgroundPosition: 'right 12px center', paddingRight: 30, cursor: 'pointer'
            }}>{options.map(o => <option key={o} value={o}>{o}</option>)}</select>
        </div>
    }

    return (
        <div style={{ padding: 24, maxWidth: 1200, margin: '0 auto', background: t[50], minHeight: '100%' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
                <div>
                    <h2 style={{ fontSize: 20, fontWeight: 700, color: ink, margin: 0 }}>Promotions</h2>
                    <p style={{ fontSize: 13, color: inkSoft, margin: '2px 0 0' }}>Manage discounts, coupons, and promotional campaigns</p>
                </div>
                <button className="prime-btn" onClick={() => setShowNew(true)} style={{ padding: '7px 12px', background: t[500], color: '#fff', borderRadius: 9, border: 'none', fontSize: 12, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', transition: 'all .15s ease' }}
                    onMouseEnter={e => { e.currentTarget.style.background = t[700]; }}
                    onMouseLeave={e => { e.currentTarget.style.background = t[500]; }}
                ><Plus size={14} /> Add Promotion</button>
            </div>

            {showNew && (
                <div className="prime-card" style={{ marginBottom: 20, padding: 16, background: t[50], borderRadius: 12, border: `1.4px solid ${t[200]}` }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 12 }}>
                        <Input label="Name" value={newPromo.name || ''} onChange={v => setNewPromo(prev => ({ ...prev, name: v }))} />
                        <Select label="Type" value={newPromo.type || 'percentage'} options={PROMO_TYPES} onChange={v => setNewPromo(prev => ({ ...prev, type: v as any }))} />
                        <Input label="Value" type="number" value={newPromo.value} onChange={v => setNewPromo(prev => ({ ...prev, value: parseFloat(v) || 0 }))} />
                        <Input label="Min Purchase ($)" type="number" value={newPromo.minPurchase} onChange={v => setNewPromo(prev => ({ ...prev, minPurchase: parseFloat(v) || 0 }))} />
                        <Input label="Max Discount ($)" type="number" value={newPromo.maxDiscount} onChange={v => setNewPromo(prev => ({ ...prev, maxDiscount: parseFloat(v) || 0 }))} />
                        <Input label="Max Uses" type="number" value={newPromo.maxUses} onChange={v => setNewPromo(prev => ({ ...prev, maxUses: parseInt(v) || 0 }))} />
                        <Select label="Stacking" value={newPromo.stackingRule || 'best_only'} options={STACKING_OPTIONS} onChange={v => setNewPromo(prev => ({ ...prev, stackingRule: v as any }))} />
                        <Select label="Status" value={newPromo.status || 'draft'} options={STATUS_OPTIONS} onChange={v => setNewPromo(prev => ({ ...prev, status: v as any }))} />
                        <Input label="Priority" type="number" value={newPromo.priority} onChange={v => setNewPromo(prev => ({ ...prev, priority: parseInt(v) || 0 }))} />
                    </div>
                    <div style={{ marginBottom: 12 }}>
                        <label className="prime-label" style={{ display: 'block', fontSize: 12, fontWeight: 600, color: inkSoft, marginBottom: 4 }}>Description</label>
                        <textarea className="prime-input" value={newPromo.description || ''} onChange={e => setNewPromo(prev => ({ ...prev, description: e.target.value }))} style={{ ...inputStyle, resize: 'none', minHeight: 50 }} rows={2} />
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                        <button className="prime-btn" onClick={saveNew} style={{ padding: '6px 12px', background: t[500], color: '#fff', borderRadius: 9, border: 'none', fontSize: 12, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}><Save size={12} /> Create</button>
                        <button className="prime-btn-secondary" onClick={() => setShowNew(false)} style={{ padding: '6px 12px', background: paper, border: `1.4px solid ${hairline}`, borderRadius: 9, color: inkSoft, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}><X size={12} /> Cancel</button>
                    </div>
                </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {promotions.map(p => (
                    <div key={p.id} className="prime-card" style={{ background: paper, borderRadius: 12, border: `1.4px solid ${hairline}`, padding: 14 }}>
                        {editingId === p.id ? (
                            <div>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 12 }}>
                                    <Input label="Name" value={editForm.name || ''} onChange={v => setEditForm(prev => ({ ...prev, name: v }))} />
                                    <Select label="Type" value={editForm.type || 'percentage'} options={PROMO_TYPES} onChange={v => setEditForm(prev => ({ ...prev, type: v as any }))} />
                                    <Input label="Value" type="number" value={editForm.value} onChange={v => setEditForm(prev => ({ ...prev, value: parseFloat(v) || 0 }))} />
                                    <Input label="Min Purchase ($)" type="number" value={editForm.minPurchase} onChange={v => setEditForm(prev => ({ ...prev, minPurchase: parseFloat(v) || 0 }))} />
                                    <Input label="Max Discount ($)" type="number" value={editForm.maxDiscount} onChange={v => setEditForm(prev => ({ ...prev, maxDiscount: parseFloat(v) || 0 }))} />
                                    <Input label="Max Uses" type="number" value={editForm.maxUses} onChange={v => setEditForm(prev => ({ ...prev, maxUses: parseInt(v) || 0 }))} />
                                    <Select label="Stacking" value={editForm.stackingRule || 'best_only'} options={STACKING_OPTIONS} onChange={v => setEditForm(prev => ({ ...prev, stackingRule: v as any }))} />
                                    <Select label="Status" value={editForm.status || 'draft'} options={STATUS_OPTIONS} onChange={v => setEditForm(prev => ({ ...prev, status: v as any }))} />
                                    <Input label="Priority" type="number" value={editForm.priority} onChange={v => setEditForm(prev => ({ ...prev, priority: parseInt(v) || 0 }))} />
                                </div>
                                <div style={{ display: 'flex', gap: 8 }}>
                                    <button className="prime-btn" onClick={saveEdit} style={{ padding: '6px 12px', background: t[500], color: '#fff', borderRadius: 9, border: 'none', fontSize: 12, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}><Save size={12} /> Save</button>
                                    <button className="prime-btn-secondary" onClick={() => { setEditingId(null); setEditForm({}) }} style={{ padding: '6px 12px', background: paper, border: `1.4px solid ${hairline}`, borderRadius: 9, color: inkSoft, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}><X size={12} /> Cancel</button>
                                </div>
                            </div>
                        ) : (
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                <div style={{ flex: 1 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                        <span style={{ fontSize: 13, fontWeight: 700, color: ink }}>{p.name}</span>
                                        {statusBadge(p.status || 'draft')}
                                    </div>
                                    <div style={{ display: 'flex', gap: 12, fontSize: 12, color: inkSoft, marginTop: 2 }}>
                                        <span>{p.type}: {p.type === 'percentage' ? `${p.value}%` : `$${p.value}`}</span>
                                        <span>Min: ${p.minPurchase}</span>
                                        <span>Uses: {p.currentUses}/{p.maxUses || '∞'}</span>
                                        <span>Stack: {p.stackingRule}</span>
                                    </div>
                                </div>
                                <div style={{ display: 'flex', gap: 4 }}>
                                    <button className="prime-btn-secondary" onClick={() => toggleStatus(p)} style={{ padding: 6, color: amber[500], background: 'none', border: 'none', cursor: 'pointer' }}>{p.status === 'active' ? <Pause size={14} /> : <Play size={14} />}</button>
                                    <button className="prime-btn-secondary" onClick={() => startEdit(p)} style={{ padding: 6, color: inkSoft, background: 'none', border: 'none', cursor: 'pointer' }}><Pencil size={14} /></button>
                                    <button className="prime-btn-secondary" onClick={() => deletePromo(p.id)} style={{ padding: 6, color: danger, background: 'none', border: 'none', cursor: 'pointer' }}><Trash2 size={14} /></button>
                                </div>
                            </div>
                        )}
                    </div>
                ))}
                {promotions.length === 0 && <div style={{ textAlign: 'center', padding: 40, color: inkSoft, fontSize: 13 }}>No promotions defined. Click "Add Promotion" to create one.</div>}
            </div>
        </div>
    )
}

export default PromotionsAdmin
