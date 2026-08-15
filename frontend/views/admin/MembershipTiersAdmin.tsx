import React, { useState, useEffect } from 'react'
import { dbService } from '../../services/db'
import { MembershipTier } from '../../types/engagement'
import { Plus, Pencil, Trash2, Save, X, GripVertical } from 'lucide-react'

const t = { 50: '#eef7f6', 100: '#d3ece9', 200: '#a6d9d3', 500: '#1f8577', 600: '#146b60', 700: '#0f544c', 800: '#0b3e39' };
const paper = '#FEFDFB', ink = '#23282A', inkSoft = '#5c6567', hairline = '#e4ddd1';

export const MembershipTiersAdmin: React.FC = () => {
    const [tiers, setTiers] = useState<MembershipTier[]>([])
    const [editingId, setEditingId] = useState<string | null>(null)
    const [editForm, setEditForm] = useState<Partial<MembershipTier>>({})
    const [showNew, setShowNew] = useState(false)
    const [newTier, setNewTier] = useState<Partial<MembershipTier>>({
        name: '', level: 0, description: '', color: '#1f8577', icon: '',
        minSpend: 0, entrySpend: 0, minFrequency: 0, minClv: 0, pointMultiplier: 1, cashbackRate: 0,
        prioritySupport: false, exclusivePricing: false, exclusiveCampaigns: false, freeShipping: false,
        birthdayReward: 0, annualReward: 0, benefits: {}, status: 'active',
    })

    useEffect(() => { loadTiers() }, [])

    const loadTiers = async () => {
        const data = await dbService.getAll<MembershipTier>('engagementMembershipTiers')
        setTiers(data.sort((a, b) => a.level - b.level))
    }

    const startEdit = (tier: MembershipTier) => { setEditingId(tier.id); setEditForm({ ...tier }) }
    const cancelEdit = () => { setEditingId(null); setEditForm({}) }

    const saveEdit = async () => {
        if (!editingId || !editForm.name) return
        await dbService.put('engagementMembershipTiers', { ...editForm, id: editingId } as MembershipTier)
        setEditingId(null); setEditForm({}); await loadTiers()
    }

    const saveNew = async () => {
        if (!newTier.name) return
        const id = `TIER_${Date.now()}`
        await dbService.put('engagementMembershipTiers', { ...newTier, id } as MembershipTier)
        setShowNew(false); setNewTier({ name: '', level: tiers.length, description: '', color: '#1f8577', icon: '', minSpend: 0, entrySpend: 0, minFrequency: 0, minClv: 0, pointMultiplier: 1, cashbackRate: 0, prioritySupport: false, exclusivePricing: false, exclusiveCampaigns: false, freeShipping: false, birthdayReward: 0, annualReward: 0, benefits: {}, status: 'active' })
        await loadTiers()
    }

    const deleteTier = async (id: string) => { await dbService.delete('engagementMembershipTiers', id); await loadTiers() }
    const updateField = (key: string, value: any) => { setEditForm(prev => ({ ...prev, [key]: value })) }
    const updateNewField = (key: string, value: any) => { setNewTier(prev => ({ ...prev, [key]: value })) }

    const inputStyle: React.CSSProperties = {
        width: '100%', fontFamily: "'Inter', sans-serif", fontSize: 13.5,
        color: ink, background: paper, border: `1px solid ${hairline}`, borderRadius: 9,
        padding: '7px 10px', outline: 'none'
    }

    function Input({ label, value, onChange, type = 'text', step }: { label: string; value: any; onChange: (v: string) => void; type?: string; step?: string }) {
        return <div>
            <label className="prime-label" style={{ display: 'block', fontSize: 12, fontWeight: 600, color: inkSoft, marginBottom: 4 }}>{label}</label>
            <input className="prime-input" type={type} value={value ?? ''} onChange={e => onChange(e.target.value)} step={step} style={inputStyle} />
        </div>
    }

    function Toggle({ label, value, onChange }: { label: string; value?: boolean; onChange: (v: boolean) => void }) {
        return (
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: ink, cursor: 'pointer' }}>
                <button onClick={() => onChange(!value)} style={{ width: 32, height: 18, borderRadius: 9, border: 'none', background: value ? t[500] : hairline, position: 'relative', cursor: 'pointer', transition: 'all .2s' }}>
                    <div style={{ width: 14, height: 14, background: '#fff', borderRadius: '50%', position: 'absolute', top: 2, left: value ? 16 : 2, transition: 'all .2s' }} />
                </button>
                {label}
            </label>
        )
    }

    return (
        <div style={{ padding: 24, maxWidth: 960, margin: '0 auto', background: t[50], minHeight: '100%' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
                <div>
                    <h2 style={{ fontSize: 20, fontWeight: 700, color: ink, margin: 0 }}>Membership Tiers</h2>
                    <p style={{ fontSize: 13, color: inkSoft, margin: '2px 0 0' }}>Manage loyalty tiers and benefits</p>
                </div>
                <button className="prime-btn" onClick={() => setShowNew(true)} style={{ padding: '7px 12px', background: t[500], color: '#fff', borderRadius: 9, border: 'none', fontSize: 12, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', transition: 'all .15s ease' }}
                    onMouseEnter={e => { e.currentTarget.style.background = t[700]; }}
                    onMouseLeave={e => { e.currentTarget.style.background = t[500]; }}
                ><Plus size={14} /> Add Tier</button>
            </div>

            {showNew && (
                <div className="prime-card" style={{ marginBottom: 20, padding: 16, background: t[50], borderRadius: 12, border: `1.4px solid ${t[200]}` }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 12 }}>
                        <Input label="Name" value={newTier.name} onChange={v => updateNewField('name', v)} />
                        <Input label="Level" type="number" value={newTier.level} onChange={v => updateNewField('level', parseInt(v) || 0)} />
                        <Input label="Color" value={newTier.color} onChange={v => updateNewField('color', v)} />
                        <Input label="Min Spend" type="number" value={newTier.minSpend} onChange={v => updateNewField('minSpend', parseFloat(v) || 0)} />
                        <Input label="Entry Spend" type="number" value={newTier.entrySpend} onChange={v => updateNewField('entrySpend', parseFloat(v) || 0)} />
                        <Input label="Min Purchases" type="number" value={newTier.minFrequency} onChange={v => updateNewField('minFrequency', parseInt(v) || 0)} />
                        <Input label="Point Multiplier" type="number" step="0.1" value={newTier.pointMultiplier} onChange={v => updateNewField('pointMultiplier', parseFloat(v) || 1)} />
                        <Input label="Cashback Rate (%)" type="number" step="0.1" value={newTier.cashbackRate} onChange={v => updateNewField('cashbackRate', parseFloat(v) || 0)} />
                        <Input label="Birthday Reward ($)" type="number" value={newTier.birthdayReward} onChange={v => updateNewField('birthdayReward', parseFloat(v) || 0)} />
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, marginBottom: 12 }}>
                        {(['prioritySupport', 'exclusivePricing', 'exclusiveCampaigns', 'freeShipping'] as const).map(f => (
                            <Toggle key={f} label={f === 'prioritySupport' ? 'Priority Support' : f === 'exclusivePricing' ? 'Exclusive Pricing' : f === 'exclusiveCampaigns' ? 'Exclusive Campaigns' : 'Free Shipping'} value={newTier[f]} onChange={v => updateNewField(f, v)} />
                        ))}
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                        <button className="prime-btn" onClick={saveNew} style={{ padding: '6px 12px', background: t[500], color: '#fff', borderRadius: 9, border: 'none', fontSize: 12, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}><Save size={12} /> Create</button>
                            <button className="prime-btn-secondary" onClick={() => setShowNew(false)} style={{ padding: '6px 12px', background: paper, border: `1.4px solid ${hairline}`, borderRadius: 9, color: inkSoft, fontSize: 12, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}><X size={12} /> Cancel</button>
                    </div>
                </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {tiers.map(tier => (
                    <div key={tier.id} className="prime-card" style={{ background: paper, borderRadius: 12, border: `1.4px solid ${hairline}`, padding: 14 }}>
                        {editingId === tier.id ? (
                            <div>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 12 }}>
                                    <Input label="Name" value={editForm.name || ''} onChange={v => updateField('name', v)} />
                                    <Input label="Level" type="number" value={editForm.level} onChange={v => updateField('level', parseInt(v) || 0)} />
                                    <Input label="Color" value={editForm.color || ''} onChange={v => updateField('color', v)} />
                                    <Input label="Min Spend" type="number" value={editForm.minSpend} onChange={v => updateField('minSpend', parseFloat(v) || 0)} />
                                    <Input label="Entry Spend" type="number" value={editForm.entrySpend} onChange={v => updateField('entrySpend', parseFloat(v) || 0)} />
                                    <Input label="Min Purchases" type="number" value={editForm.minFrequency} onChange={v => updateField('minFrequency', parseInt(v) || 0)} />
                                    <Input label="Point Multiplier" type="number" step="0.1" value={editForm.pointMultiplier} onChange={v => updateField('pointMultiplier', parseFloat(v) || 1)} />
                                    <Input label="Cashback Rate (%)" type="number" step="0.1" value={editForm.cashbackRate} onChange={v => updateField('cashbackRate', parseFloat(v) || 0)} />
                                    <Input label="Birthday Reward ($)" type="number" value={editForm.birthdayReward} onChange={v => updateField('birthdayReward', parseFloat(v) || 0)} />
                                </div>
                                <div style={{ display: 'flex', gap: 16, marginBottom: 12 }}>
                                    {(['prioritySupport', 'exclusivePricing', 'exclusiveCampaigns', 'freeShipping'] as const).map(f => (
                                        <Toggle key={f} label={f === 'prioritySupport' ? 'Priority Support' : f === 'exclusivePricing' ? 'Exclusive Pricing' : f === 'exclusiveCampaigns' ? 'Exclusive Campaigns' : 'Free Shipping'} value={editForm[f]} onChange={v => updateField(f, v)} />
                                    ))}
                                </div>
                                <div style={{ display: 'flex', gap: 8 }}>
                                    <button className="prime-btn" onClick={saveEdit} style={{ padding: '6px 12px', background: t[500], color: '#fff', borderRadius: 9, border: 'none', fontSize: 12, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}><Save size={12} /> Save</button>
                                    <button className="prime-btn-secondary" onClick={cancelEdit} style={{ padding: '6px 12px', background: paper, border: `1.4px solid ${hairline}`, borderRadius: 9, color: inkSoft, fontSize: 12, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}><X size={12} /> Cancel</button>
                                </div>
                            </div>
                        ) : (
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                    <div style={{ width: 12, height: 12, borderRadius: '50%', background: tier.color || '#1f8577' }} />
                                    <div>
                                        <span style={{ fontSize: 13, fontWeight: 700, color: ink }}>{tier.name}</span>
                                        <span style={{ fontSize: 12, color: inkSoft, marginLeft: 8 }}>Level {tier.level}</span>
                                    </div>
                                    <div style={{ display: 'flex', gap: 12, fontSize: 12, color: inkSoft, marginLeft: 12 }}>
                                        <span>Min ${tier.minSpend}</span>
                                        <span>{tier.pointMultiplier}x pts</span>
                                        <span>{tier.cashbackRate}% cashback</span>
                                    </div>
                                </div>
                                <div style={{ display: 'flex', gap: 4 }}>
                                    <button className="prime-btn-secondary" onClick={() => startEdit(tier)} style={{ padding: 6, color: inkSoft, background: 'none', border: 'none', cursor: 'pointer' }}><Pencil size={14} /></button>
                                    <button className="prime-btn-secondary" onClick={() => deleteTier(tier.id)} style={{ padding: 6, color: '#b5493f', background: 'none', border: 'none', cursor: 'pointer' }}><Trash2 size={14} /></button>
                                </div>
                            </div>
                        )}
                    </div>
                ))}
                {tiers.length === 0 && <div style={{ textAlign: 'center', padding: 40, color: inkSoft, fontSize: 13 }}>No membership tiers defined. Click "Add Tier" to create one.</div>}
            </div>
        </div>
    )
}

export default MembershipTiersAdmin
