import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { dbService } from '../../services/db'
import {
  Promotion, PromotionChannel, PromotionStatus, PromotionDiscountType,
  PromotionCalculationResult, PromotionAnalytics,
} from '../../types/engagement'
import {
  Plus, Search, Pencil, Trash2, Save, X, Play, Pause, Tag, Percent,
  Calendar, Users, Award, TrendingUp, BadgePercent, Layers,
  CheckCircle2, CheckCircle, AlertTriangle, Filter, Sparkles, Clock, ChevronRight,
} from 'lucide-react'
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { API_BASE_URL } from '../../config/api.js'
import { ensureSessionAuthState } from '../../services/authSession'

const teal = {
  50: '#eef7f6', 100: '#d3ece9', 200: '#a6d9d3', 300: '#72c0b7',
  400: '#3fa294', 500: '#1f8577', 600: '#146b60', 700: '#0f544c',
  800: '#0b3e39', 900: '#082e2a'
}
const amber = { 100: '#fbead0', 300: '#eec27a', 500: '#d99a3f', 600: '#b97e2b' }
const paper = '#FEFDFB', ink = '#23282A', inkSoft = '#5c6567', hairline = '#e4ddd1', danger = '#b5493f'
const violet = { 50: '#f3f0ff', 100: '#e4dcff', 500: '#7c5cf0', 700: '#5b3fd4' }

const CHANNELS: PromotionChannel[] = ['PORTAL', 'ERP', 'BOTH']
const DISCOUNT_TYPES: PromotionDiscountType[] = ['percentage', 'fixed_amount', 'fixed_price', 'buy_x_get_y', 'coupon', 'tiered']
const STATUSES: PromotionStatus[] = ['draft', 'scheduled', 'active', 'paused', 'expired', 'cancelled']

const fmt = (v: any) => {
  const n = Number(v || 0)
  return `MWK ${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}
const fmtInt = (v: any) => Number(v || 0).toLocaleString()

// Mirrors the server-side status derivation (backend/services/promotionEngine.cjs).
const deriveStatus = (p: any, now = new Date()): PromotionStatus => {
  if (!p) return 'draft'
  if (p.cancelledAt) return 'cancelled'
  if (p.status === 'cancelled') return 'cancelled'
  if (p.pausedAt || p.status === 'paused') return 'paused'
  if (p.status === 'draft') return 'draft'
  const ts = now.getTime()
  const start = p.startsAt || p.starts_at ? new Date(p.startsAt || p.starts_at).getTime() : null
  const end = p.endsAt || p.ends_at || p.expiresAt ? new Date(p.endsAt || p.ends_at || p.expiresAt).getTime() : null
  if (start !== null && !Number.isNaN(start) && ts < start) return 'scheduled'
  if (end !== null && !Number.isNaN(end) && ts > end) return 'expired'
  if (p.isActive === false) return 'draft'
  return 'active'
}

const STATUS_META: Record<PromotionStatus, { bg: string; fg: string; dot: string }> = {
  draft: { bg: hairline, fg: inkSoft, dot: '#94a3b8' },
  scheduled: { bg: violet[100], fg: violet[700], dot: '#7c5cf0' },
  active: { bg: teal[100], fg: teal[700], dot: '#1f8577' },
  paused: { bg: amber[100], fg: '#92400e', dot: '#d99a3f' },
  expired: { bg: '#fef0ee', fg: danger, dot: '#b5493f' },
  cancelled: { bg: '#f1f2f4', fg: '#64748b', dot: '#94a3b8' },
}

const discountLabel = (p: any) => {
  const type = String(p.discountType || p.type || 'percentage')
  const value = Number(p.discountValue ?? p.value ?? 0)
  if (type === 'percentage' || type === 'coupon' || type === 'campaign' || type === 'category' || type === 'brand' || type === 'bundle' || type === 'tier' || type === 'tiered') return `${value}%`
  if (type === 'fixed_price') return `MWK ${value} each`
  if (type === 'buy_x_get_y') return `Buy ${p.buyXQty || 0} Get ${p.getYQty || 0}`
  return `MWK ${value} off`
}

const emptyForm = (): Partial<Promotion> => ({
  name: '',
  description: '',
  code: '',
  channel: 'PORTAL',
  discountType: 'percentage',
  discountValue: 10,
  status: 'draft',
  isActive: true,
  isAutoApply: true,
  stackable: false,
  priority: 0,
  startsAt: new Date().toISOString().slice(0, 16),
  endsAt: '',
  minimumOrderAmount: 0,
  maximumDiscountAmount: 0,
  usageLimit: 0,
  usageLimitPerCustomer: 0,
  applicableTo: 'all',
  customerScope: 'all',
  productIds: [],
  categoryIds: [],
  customerIds: [],
})

const toCanonical = (f: Partial<Promotion>): Promotion => {
  const discountType = (f.discountType || 'percentage') as PromotionDiscountType
  const discountValue = Number(f.discountValue ?? 0) || 0
  const legacyTypeMap: Record<string, string> = {
    percentage: 'percentage', fixed_amount: 'fixed', fixed_price: 'fixed',
    buy_x_get_y: 'buy_x_get_y', coupon: 'coupon', tiered: 'tier', category: 'category', brand: 'brand',
  }
  return {
    id: f.id || `PROMO_${Date.now()}`,
    name: String(f.name || '').trim(),
    description: f.description || null,
    code: f.code ? String(f.code).trim().toUpperCase() : null,
    promotionCode: f.code ? String(f.code).trim().toUpperCase() : null,
    channel: f.channel || 'PORTAL',
    discountType,
    discountValue,
    valueType: discountType === 'percentage' ? 'percentage' : 'fixed',
    // Legacy aliases so the engagement module + sales panels keep working.
    type: legacyTypeMap[discountType] as any,
    value: discountValue,
    status: f.status || 'draft',
    isActive: f.isActive !== undefined ? !!f.isActive : true,
    isAutoApply: f.isAutoApply !== undefined ? !!f.isAutoApply : true,
    stackable: !!f.stackable,
    priority: Number(f.priority ?? 0) || 0,
    startsAt: f.startsAt ? new Date(f.startsAt).toISOString() : new Date().toISOString(),
    endsAt: f.endsAt ? new Date(f.endsAt).toISOString() : null,
    expiresAt: f.endsAt ? new Date(f.endsAt).toISOString() : null,
    minimumOrderAmount: Number(f.minimumOrderAmount ?? 0) || 0,
    minPurchase: Number(f.minimumOrderAmount ?? 0) || 0,
    maximumDiscountAmount: Number(f.maximumDiscountAmount ?? 0) || 0,
    maxDiscount: Number(f.maximumDiscountAmount ?? 0) || 0,
    usageLimit: Number(f.usageLimit ?? 0) || 0,
    maxUses: Number(f.usageLimit ?? 0) || 0,
    usageLimitPerCustomer: Number(f.usageLimitPerCustomer ?? 0) || 0,
    per_customer_limit: Number(f.usageLimitPerCustomer ?? 0) || 0,
    applicableTo: f.applicableTo || 'all',
    productIds: f.productIds || [],
    categoryIds: f.categoryIds || [],
    customerScope: f.customerScope || 'all',
    customerIds: f.customerIds || [],
    createdBy: f.createdBy,
    createdAt: f.createdAt,
    updatedAt: f.updatedAt,
  }
}

// Tab definition for the ClientModal-style form.
const modalTabs = [
  { id: 'Details' as const, label: 'Promotion Details', icon: Tag },
  { id: 'Schedule' as const, label: 'Schedule & Status', icon: Calendar },
  { id: 'Limits' as const, label: 'Limits & Priority', icon: Layers },
  { id: 'Audience' as const, label: 'Audience', icon: Users },
  { id: 'Preview' as const, label: 'Live Preview', icon: Sparkles },
]

const labelStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 6,
  fontSize: 12, fontWeight: 600, color: teal[800],
  marginBottom: 6, letterSpacing: 0.01
}

const modalInputStyle: React.CSSProperties = {
  width: '100%', fontFamily: "'Inter', sans-serif", fontSize: 13.5,
  color: ink, background: paper,
  border: `1.4px solid ${hairline}`, borderRadius: 9,
  padding: '9px 12px', outline: 'none',
  transition: 'border-color .15s ease, box-shadow .15s ease, background .15s ease'
}

const modalSelectStyle: React.CSSProperties = {
  ...modalInputStyle,
  appearance: 'none',
  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%235c6567'/%3E%3C/svg%3E")`,
  backgroundRepeat: 'no-repeat',
  backgroundPosition: 'right 12px center',
  paddingRight: 30,
  cursor: 'pointer'
}

const sectionLabelStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 10,
  margin: '26px 0 14px'
}

export const PromotionsAdmin: React.FC = () => {
  const [promotions, setPromotions] = useState<Promotion[]>([])
  const [loading, setLoading] = useState(true)
  const [showNew, setShowNew] = useState(false)
  const [form, setForm] = useState<Partial<Promotion>>(emptyForm())
  const [activeTab, setActiveTab] = useState<typeof modalTabs[number]['id']>('Details')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [channelFilter, setChannelFilter] = useState<string>('all')
  const [typeFilter, setTypeFilter] = useState<string>('all')
  const [deleteTarget, setDeleteTarget] = useState<Promotion | null>(null)
  const [analytics, setAnalytics] = useState<PromotionAnalytics | null>(null)
  const [preview, setPreview] = useState<PromotionCalculationResult | null>(null)
  const [sampleAmount, setSampleAmount] = useState(100000)
  const [saving, setSaving] = useState(false)
  const [notify, setNotify] = useState<{ kind: 'success' | 'error'; text: string } | null>(null)

  const openNew = () => { setEditingId(null); setForm(emptyForm()); setActiveTab('Details'); setShowNew(true) }

  const load = useCallback(async () => {
    try {
      const data = await dbService.getAll<Promotion>('engagementPromotions')
      setPromotions([...data].sort((a, b) => (Number(b.priority) || 0) - (Number(a.priority) || 0)))
    } catch (err: any) {
      setNotify({ kind: 'error', text: err?.message || 'Failed to load promotions' })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  // Best-effort analytics from the backend (offline-safe).
  useEffect(() => {
    let cancelled = false
    const run = async () => {
      try {
        const session = ensureSessionAuthState()
        const res = await fetch(`${API_BASE_URL}/promotions/analytics`, {
          headers: { Authorization: `Bearer ${session.accessToken || ''}` },
        })
        if (res.ok && !cancelled) setAnalytics(await res.json())
      } catch {
        /* offline — analytics stay null */
      }
    }
    run()
    return () => { cancelled = true }
  }, [promotions.length])

  const effective = useMemo(
    () => promotions.map((p) => ({ ...p, _effectiveStatus: deriveStatus(p) })),
    [promotions]
  )

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return effective.filter((p) => {
      if (statusFilter !== 'all' && p._effectiveStatus !== statusFilter) return false
      if (channelFilter !== 'all' && String(p.channel || 'BOTH') !== channelFilter) return false
      if (typeFilter !== 'all' && String(p.discountType || p.type || '') !== typeFilter) return false
      if (q && !`${p.name} ${p.code || p.promotionCode || ''}`.toLowerCase().includes(q)) return false
      return true
    })
  }, [effective, search, statusFilter, channelFilter, typeFilter])

  const stats = useMemo(() => {
    const counts: Record<string, number> = { active: 0, scheduled: 0, expired: 0, paused: 0, draft: 0, cancelled: 0 }
    let totalUsage = 0
    for (const p of promotions) {
      const s = p._effectiveStatus || deriveStatus(p)
      if (counts[s] !== undefined) counts[s] += 1
      totalUsage += Number(p.usedCount ?? p.currentUses ?? 0) || 0
    }
    const a = analytics?.totals
    return {
      counts,
      totalUsage,
      totalDiscount: a?.discountAmount ?? null,
      netSales: a?.netSales ?? null,
      orders: a?.orders ?? null,
      avgOrder: a?.averageOrderValue ?? null,
    }
  }, [promotions, analytics])

  // Live preview: recompute whenever the form discount changes.
  useEffect(() => {
    const type = String(form.discountType || 'percentage')
    const value = Number(form.discountValue ?? 0) || 0
    const gross = Math.max(0, Number(sampleAmount) || 0)
    let discountTotal = 0
    if (type === 'percentage' || type === 'coupon' || type === 'tiered' || type === 'category' || type === 'brand' || type === 'bundle') {
      discountTotal = gross * (value / 100)
    } else if (type === 'fixed_amount') {
      discountTotal = value
    } else if (type === 'fixed_price') {
      discountTotal = value > 0 && value < 10000 ? (10000 - value) * Math.max(1, Math.round(gross / 10000)) : 0
    }
    const maxDiscount = Number(form.maximumDiscountAmount ?? 0) || 0
    if (maxDiscount > 0) discountTotal = Math.min(discountTotal, maxDiscount)
    discountTotal = Math.min(Math.max(discountTotal, 0), gross)
    setPreview({
      applied: discountTotal > 0,
      promotions: [],
      lines: [],
      subtotal: gross,
      discountTotal: Math.round(discountTotal * 100) / 100,
      subtotalBeforeDiscount: gross,
      subtotalAfterDiscount: Math.round((gross - discountTotal) * 100) / 100,
      taxableSubtotal: Math.round((gross - discountTotal) * 100) / 100,
      grandTotal: Math.round((gross - discountTotal) * 100) / 100,
      metadata: {},
    })
  }, [form.discountType, form.discountValue, form.maximumDiscountAmount, sampleAmount])

  const saveNew = async () => {
    if (!form.name || !String(form.name).trim()) {
      setNotify({ kind: 'error', text: 'Promotion name is required.' })
      return
    }
    setSaving(true)
    try {
      const record = toCanonical(form)
      await dbService.put('engagementPromotions', record)
      setShowNew(false)
      setForm(emptyForm())
      setNotify({ kind: 'success', text: `Promotion "${record.name}" created.` })
      await load()
    } catch (err: any) {
      setNotify({ kind: 'error', text: err?.message || 'Failed to create promotion' })
    } finally {
      setSaving(false)
    }
  }

  const startEdit = (p: Promotion) => {
    setEditingId(p.id)
    setForm({
      ...p,
      endsAt: p.endsAt || p.expiresAt ? (p.endsAt || p.expiresAt || '').slice(0, 16) : '',
      startsAt: (p.startsAt || new Date().toISOString()).slice(0, 16),
    })
    setActiveTab('Details')
    setShowNew(true)
  }

  const saveEdit = async () => {
    if (!editingId || !form.name) return
    setSaving(true)
    try {
      const existing = promotions.find((p) => p.id === editingId)
      const record = toCanonical({ ...existing, ...form, id: editingId })
      await dbService.put('engagementPromotions', record)
      setShowNew(false)
      setEditingId(null)
      setForm(emptyForm())
      setNotify({ kind: 'success', text: 'Promotion updated.' })
      await load()
    } catch (err: any) {
      setNotify({ kind: 'error', text: err?.message || 'Failed to update promotion' })
    } finally {
      setSaving(false)
    }
  }

  const toggleStatus = async (p: Promotion) => {
    const current = deriveStatus(p)
    const next: PromotionStatus = current === 'active' ? 'paused' : 'active'
    await dbService.put('engagementPromotions', {
      ...p,
      status: next,
      isActive: next === 'active',
      pausedAt: next === 'paused' ? new Date().toISOString() : null,
      updatedAt: new Date().toISOString(),
    } as Promotion)
    setNotify({ kind: 'success', text: next === 'active' ? 'Promotion activated.' : 'Promotion paused.' })
    await load()
  }

  const confirmDelete = async () => {
    if (!deleteTarget) return
    await dbService.delete('engagementPromotions', deleteTarget.id)
    setDeleteTarget(null)
    setNotify({ kind: 'success', text: `Promotion "${deleteTarget.name}" deleted.` })
    await load()
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', fontFamily: "'Inter', sans-serif", fontSize: 13.5, color: ink,
    background: paper, border: `1.4px solid ${hairline}`, borderRadius: 9, padding: '7px 10px', outline: 'none',
  }

  const Field = ({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) => (
    <div>
      <label className="prime-label" style={{ display: 'block', fontSize: 12, fontWeight: 600, color: inkSoft, marginBottom: 4 }}>{label}</label>
      {children}
      {hint && <p style={{ margin: '3px 0 0', fontSize: 10.5, color: '#8a9496', lineHeight: 1.4 }}>{hint}</p>}
    </div>
  )

  const Input = ({ value, onChange, type = 'text', placeholder }: any) => (
    <input className="prime-input" type={type} value={value ?? ''} placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)} style={inputStyle} />
  )

  const Select = ({ value, onChange, options }: any) => (
    <select className="prime-select" value={value} onChange={(e) => onChange(e.target.value)} style={{
      ...inputStyle, appearance: 'none', cursor: 'pointer',
      backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%235c6567'/%3E%3C/svg%3E")`,
      backgroundRepeat: 'no-repeat', backgroundPosition: 'right 12px center', paddingRight: 30,
    }}>
      {options.map((o: any) => <option key={String(o.value ?? o)} value={String(o.value ?? o)}>{o.label ?? o}</option>)}
    </select>
  )

  const Toggle = ({ value, onChange, label }: any) => (
    <button type="button" onClick={() => onChange(!value)} style={{
      display: 'flex', alignItems: 'center', gap: 8, background: 'transparent', border: 'none', cursor: 'pointer', padding: '4px 0',
    }}>
      <span style={{
        width: 38, height: 21, borderRadius: 20, position: 'relative', transition: 'all .18s ease', flexShrink: 0,
        background: value ? teal[500] : '#d6dadd',
      }}>
        <span style={{
          position: 'absolute', top: 2, left: value ? 19 : 2, width: 17, height: 17, borderRadius: '50%',
          background: '#fff', transition: 'all .18s ease', boxShadow: '0 1px 3px rgba(0,0,0,.25)',
        }} />
      </span>
      <span style={{ fontSize: 12.5, fontWeight: 600, color: ink }}>{label}</span>
    </button>
  )

  // Client-module "money bar" KPI card — clickable, filters the promotion list.
  const KpiCard = ({ kpiId, label, value, icon, iconBg, iconColor, borderColor }: any) => {
    const active = kpiId === 'all' ? statusFilter === 'all' : statusFilter === kpiId
    const onClick = () => {
      if (kpiId === 'all') { setStatusFilter('all'); return }
      setStatusFilter(prev => prev === kpiId ? 'all' : kpiId)
    }
    return (
      <div onClick={onClick}
        style={{
          cursor: 'pointer', padding: '14px 16px', borderRadius: 14,
          background: paper, border: `1.4px solid ${hairline}`,
          borderLeft: `4px solid ${borderColor}`,
          display: 'flex', alignItems: 'flex-start', gap: 14,
          transition: 'transform .15s ease, box-shadow .15s ease',
          transform: active ? 'scale(1.01)' : 'scale(1)',
          boxShadow: active ? '0 8px 20px -8px rgba(0,0,0,.12)' : '0 1px 3px rgba(0,0,0,.04)'
        }}>
        <div style={{ padding: 10, borderRadius: 10, background: iconBg, color: iconColor, display: 'inline-flex' }}>{icon}</div>
        <div style={{ minWidth: 0 }}>
          <p style={{ fontSize: 10, fontWeight: 700, color: inkSoft, textTransform: 'uppercase', letterSpacing: 0.08, margin: '0 0 6px' }}>{label}</p>
          <p style={{ fontSize: 18, fontWeight: 600, color: '#111827', margin: 0, fontFamily: "'Inter', sans-serif", fontVariantNumeric: 'tabular-nums', letterSpacing: 0 }}>
            {value}
          </p>
        </div>
      </div>
    )
  }

  const StatusBadge = ({ status }: { status: PromotionStatus }) => {
    const m = STATUS_META[status] || STATUS_META.draft
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 10, fontWeight: 700, padding: '3px 9px', borderRadius: 20, background: m.bg, color: m.fg }}>
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: m.dot }} />
        {status}
      </span>
    )
  }

  const ChannelTag = ({ channel }: { channel?: string }) => {
    const c = String(channel || 'BOTH')
    const portal = c === 'PORTAL' || c === 'BOTH'
    return (
      <span style={{
        display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10, fontWeight: 700,
        padding: '2px 8px', borderRadius: 6,
        background: portal ? 'linear-gradient(135deg,#f0fdf9,#ecfdf5)' : '#f1f2f4',
        border: portal ? '1px solid #a7f3d0' : `1px solid ${hairline}`,
        color: portal ? '#047857' : inkSoft,
      }}>
        <Sparkles size={10} />
        {c === 'BOTH' ? 'ERP + PORTAL' : c}
      </span>
    )
  }

  const stepNumber = modalTabs.findIndex(t => t.id === activeTab) + 1
  const totalSteps = modalTabs.length

  return (
    <div style={{ padding: 24, maxWidth: 1280, margin: '0 auto', background: teal[50], minHeight: '100%' }}>
      {/* ── Header ── */}
      <div style={{
        borderRadius: 16, padding: '22px 24px',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, marginBottom: 20,
        position: 'relative', overflow: 'hidden',
      }}>
        <div style={{ position: 'absolute', right: -40, top: -60, width: 220, height: 220, borderRadius: '50%', background: 'rgba(255,255,255,.05)' }} />
        <div style={{ position: 'absolute', right: 60, bottom: -80, width: 180, height: 180, borderRadius: '50%', background: 'rgba(255,255,255,.04)' }} />
        <div style={{ position: 'relative', zIndex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 42, height: 42, borderRadius: 12, background: teal[100], display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid rgba(255,255,255,.2)' }}>
              <BadgePercent size={22} color={teal[700]} />
            </div>
            <div>
              <h2 style={{ fontSize: 20, fontWeight: 800, color: teal[900], margin: 0, letterSpacing: 0.2 }}>Promotions</h2>
              <p style={{ fontSize: 12, color: inkSoft, margin: '2px 0 0', lineHeight: 1.4 }}>
                Portal-driven promotions — applied at transaction level, never to master prices.
              </p>
            </div>
          </div>
        </div>
        <button onClick={openNew}
          style={{
            position: 'relative', zIndex: 1, padding: '10px 16px', background: '#fff', color: teal[700], borderRadius: 10,
            border: 'none', fontSize: 12.5, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 7, cursor: 'pointer',
            boxShadow: '0 6px 16px -6px rgba(0,0,0,.35)', transition: 'transform .15s ease, box-shadow .15s ease',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 10px 22px -8px rgba(0,0,0,.4)' }}
          onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 6px 16px -6px rgba(0,0,0,.35)' }}
        >
          <Plus size={15} strokeWidth={3} /> New Promotion
        </button>
      </div>

      {notify && !showNew && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', borderRadius: 10, marginBottom: 14,
          background: notify.kind === 'success' ? teal[100] : '#fef0ee',
          border: `1.4px solid ${notify.kind === 'success' ? teal[200] : '#f3c1bd'}`,
          color: notify.kind === 'success' ? teal[700] : danger, fontSize: 12.5, fontWeight: 600,
        }}>
          {notify.kind === 'success' ? <CheckCircle2 size={15} /> : <AlertTriangle size={15} />}
          <span style={{ flex: 1 }}>{notify.text}</span>
          <button onClick={() => setNotify(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit' }}><X size={14} /></button>
        </div>
      )}

      {/* ── Money bar (client-module style KPIs) ── */}
      <div className="customers-money-bar" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14, marginBottom: 18 }}>
        <KpiCard kpiId="active" label="Active" value={fmtInt(stats.counts.active)}
          icon={<CheckCircle size={20} />} iconBg={teal[100]} iconColor={teal[600]} borderColor={teal[500]} />
        <KpiCard kpiId="scheduled" label="Scheduled" value={fmtInt(stats.counts.scheduled)}
          icon={<Clock size={20} />} iconBg={amber[100]} iconColor={amber[500]} borderColor={amber[500]} />
        <KpiCard kpiId="expired" label="Expired" value={fmtInt(stats.counts.expired)}
          icon={<AlertTriangle size={20} />} iconBg="#fef2f2" iconColor={danger} borderColor={danger} />
        <KpiCard kpiId="all" label="Discount Given" value={stats.totalDiscount != null ? fmt(stats.totalDiscount) : '—'}
          icon={<BadgePercent size={20} />} iconBg={teal[50]} iconColor={teal[500]} borderColor={teal[500]} />
      </div>

      {/* ── Analytics charts ── */}
      {(() => {
        const trend = (analytics?.trend || []).filter((d: any) => d.orders > 0)
        const byPromo = (analytics?.byPromotion || [])
          .filter((p) => (p.orders || 0) > 0 || (p.discountAmount || 0) > 0)
          .slice()
          .sort((a, b) => (b.discountAmount || 0) - (a.discountAmount || 0))
          .slice(0, 6)
          .map((p) => ({ name: p.name, discount: p.discountAmount, net: p.netSales }))
        if (trend.length === 0 && byPromo.length === 0) return null
        const axisTick = { fontSize: 10, fill: inkSoft } as const
        const tooltipStyle = { borderRadius: 10, border: `1px solid ${hairline}`, fontSize: 11 } as const
        const moneyTick = (v: any) => {
          const n = Number(v) || 0
          return n >= 1000 ? `K ${(n / 1000).toFixed(n >= 1_000_000 ? 1 : 0)}${n >= 1_000_000 ? 'M' : 'k'}` : String(n)
        }
        return (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(320px,1fr))', gap: 12, marginBottom: 20 }}>
            <div className="prime-card" style={{ background: paper, borderRadius: 14, border: `1.4px solid ${hairline}`, padding: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 800, color: ink, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                <TrendingUp size={14} style={{ color: teal[600] }} /> Discount Given — Last 30 Days
              </div>
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={trend} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="promoDiscountGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={teal[500]} stopOpacity={0.28} />
                      <stop offset="100%" stopColor={teal[500]} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke={hairline} strokeOpacity={0.6} />
                  <XAxis dataKey="date" axisLine={false} tickLine={false} tick={axisTick} minTickGap={24} />
                  <YAxis axisLine={false} tickLine={false} tick={axisTick} tickFormatter={moneyTick} width={46} />
                  <Tooltip formatter={(v: any) => fmt(Number(v))} labelStyle={{ fontSize: 11, fontWeight: 700 }} contentStyle={tooltipStyle} />
                  <Area type="monotone" dataKey="discountAmount" stroke={teal[500]} strokeWidth={2.4} fill="url(#promoDiscountGrad)" name="Discount" dot={false} activeDot={{ r: 4 }} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            <div className="prime-card" style={{ background: paper, borderRadius: 14, border: `1.4px solid ${hairline}`, padding: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 800, color: ink, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                <Award size={14} style={{ color: violet[500] }} /> Top Promotions by Discount
              </div>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={byPromo} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={hairline} strokeOpacity={0.6} />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ ...axisTick, fontSize: 9 }} interval={0} angle={-14} height={46} textAnchor="end" />
                  <YAxis axisLine={false} tickLine={false} tick={axisTick} tickFormatter={moneyTick} width={46} />
                  <Tooltip formatter={(v: any) => fmt(Number(v))} labelStyle={{ fontSize: 11, fontWeight: 700 }} contentStyle={tooltipStyle} />
                  <Bar dataKey="discount" fill={violet[500]} radius={[5, 5, 0, 0]} name="Discount Given" />
                  <Bar dataKey="net" fill={teal[500]} radius={[5, 5, 0, 0]} name="Net Sales" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )
      })()}

      {/* ── Toolbar ── */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: '1 1 220px', minWidth: 200 }}>
          <Search size={15} style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: '#8a9496', zIndex: 1 }} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or code..."
            style={{ ...inputStyle, paddingLeft: 34, height: 38 }}
          />
        </div>
        <Select value={statusFilter} onChange={setStatusFilter} options={[{ value: 'all', label: 'All Status' }, ...STATUSES.map((s) => ({ value: s, label: s }))]} />
        <Select value={channelFilter} onChange={setChannelFilter} options={[{ value: 'all', label: 'All Channels' }, ...CHANNELS.map((c) => ({ value: c, label: c === 'BOTH' ? 'ERP + PORTAL' : c }))]} />
        <Select value={typeFilter} onChange={setTypeFilter} options={[{ value: 'all', label: 'All Types' }, ...DISCOUNT_TYPES.map((d) => ({ value: d, label: d.replace('_', ' ') }))]} />
        <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11.5, color: inkSoft, fontWeight: 600, marginLeft: 'auto' }}>
          <Filter size={13} /> {filtered.length} of {promotions.length}
        </span>
      </div>

      {/* ── Promotion list ── */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: 60, color: inkSoft, fontSize: 13 }}>Loading promotions…</div>
      ) : filtered.length === 0 ? (
        <div className="prime-card" style={{ textAlign: 'center', padding: 48, borderRadius: 14, border: `1.4px dashed ${hairline}`, background: paper }}>
          <div style={{ width: 56, height: 56, borderRadius: 16, background: teal[50], margin: '0 auto 14px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Tag size={26} style={{ color: teal[500] }} />
          </div>
          <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: ink }}>{promotions.length === 0 ? 'No promotions yet' : 'No promotions match your filters'}</p>
          <p style={{ margin: '4px 0 0', fontSize: 12.5, color: inkSoft }}>
            {promotions.length === 0 ? 'Create your first promotion — a 10% Portal discount takes minutes.' : 'Try clearing the search or filters.'}
          </p>
          {promotions.length === 0 && (
            <button onClick={openNew}
              style={{ marginTop: 18, padding: '9px 16px', background: teal[500], color: '#fff', borderRadius: 9, border: 'none', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <Plus size={14} /> Create Promotion
            </button>
          )}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {filtered.map((p) => {
            const status = p._effectiveStatus as PromotionStatus
            const used = Number(p.usedCount ?? p.currentUses ?? 0) || 0
            const limit = Number(p.usageLimit ?? p.maxUses ?? 0) || 0
            const pct = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0
            const auto = p.isAutoApply !== false
            return (
              <div key={p.id} className="prime-card" style={{
                background: paper, borderRadius: 12, border: `1.4px solid ${hairline}`, padding: '14px 16px',
                transition: 'box-shadow .15s ease, transform .15s ease',
                boxShadow: '0 1px 2px rgba(0,0,0,.03)',
              }}
                onMouseEnter={(e) => { e.currentTarget.style.boxShadow = '0 8px 20px -10px rgba(11,62,57,.25)'; e.currentTarget.style.transform = 'translateY(-1px)' }}
                onMouseLeave={(e) => { e.currentTarget.style.boxShadow = '0 1px 2px rgba(0,0,0,.03)'; e.currentTarget.style.transform = 'translateY(0)' }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap' }}>
                  <div style={{ minWidth: 0, flex: '1 1 340px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 14, fontWeight: 800, color: ink }}>{p.name}</span>
                      <StatusBadge status={status} />
                      <ChannelTag channel={p.channel} />
                      {auto && (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10, fontWeight: 700, color: violet[700], background: violet[50], padding: '2px 8px', borderRadius: 6 }}>
                          <Sparkles size={10} /> AUTO
                        </span>
                      )}
                      {p.code && (
                        <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10.5, fontWeight: 700, color: inkSoft, background: '#f4f5f6', padding: '2px 8px', borderRadius: 6, letterSpacing: 0.08 }}>{p.code}</span>
                      )}
                    </div>
                    {p.description && <p style={{ margin: '5px 0 0', fontSize: 12, color: inkSoft, lineHeight: 1.45, maxWidth: 560 }}>{p.description}</p>}
                    <div style={{ display: 'flex', gap: 14, fontSize: 11.5, color: inkSoft, marginTop: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><Percent size={11} /> {discountLabel(p)}</span>
                      {Number(p.minimumOrderAmount ?? p.minPurchase ?? 0) > 0 && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><Layers size={11} /> Min order {fmt(p.minimumOrderAmount ?? p.minPurchase)}</span>}
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><Calendar size={11} /> {new Date(p.startsAt || new Date().toISOString()).toLocaleDateString()} → {p.endsAt || p.expiresAt ? new Date(p.endsAt || p.expiresAt).toLocaleDateString() : '∞'}</span>
                      {Number(p.priority || 0) > 0 && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><TrendingUp size={11} /> Priority {p.priority}</span>}
                      {p.stackable && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><Layers size={11} /> Stackable</span>}
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                    <div style={{ textAlign: 'right', minWidth: 120 }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: inkSoft, textTransform: 'uppercase', letterSpacing: 0.05 }}>Usage</div>
                      <div style={{ fontSize: 13, fontWeight: 800, color: ink, fontFamily: "'JetBrains Mono', monospace" }}>{used}{limit > 0 ? ` / ${limit}` : ''}</div>
                      {limit > 0 && (
                        <div style={{ width: 110, height: 5, borderRadius: 3, background: hairline, marginTop: 4, overflow: 'hidden' }}>
                          <div style={{ width: `${pct}%`, height: '100%', background: pct >= 100 ? danger : teal[500], borderRadius: 3, transition: 'width .3s ease' }} />
                        </div>
                      )}
                    </div>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button title={status === 'active' ? 'Pause' : 'Activate'} onClick={() => toggleStatus(p)}
                        style={{ width: 32, height: 32, borderRadius: 8, border: 'none', cursor: 'pointer', background: status === 'active' ? amber[100] : teal[100], color: status === 'active' ? '#92400e' : teal[700], display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'transform .12s ease' }}
                        onMouseEnter={(e) => { e.currentTarget.style.transform = 'scale(1.08)' }}
                        onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)' }}
                      >
                        {status === 'active' ? <Pause size={13} /> : <Play size={13} />}
                      </button>
                      <button title="Edit" onClick={() => startEdit(p)}
                        style={{ width: 32, height: 32, borderRadius: 8, border: 'none', cursor: 'pointer', background: '#f1f2f4', color: inkSoft, display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'transform .12s ease' }}
                        onMouseEnter={(e) => { e.currentTarget.style.transform = 'scale(1.08)' }}
                        onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)' }}
                      >
                        <Pencil size={13} />
                      </button>
                      <button title="Delete" onClick={() => setDeleteTarget(p)}
                        style={{ width: 32, height: 32, borderRadius: 8, border: 'none', cursor: 'pointer', background: 'rgba(181,73,63,.08)', color: danger, display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'transform .12s ease' }}
                        onMouseEnter={(e) => { e.currentTarget.style.transform = 'scale(1.08)' }}
                        onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)' }}
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* ── Create / Edit modal (ClientModal-style) ── */}
      {showNew && (
        <div className="client-modal-overlay" style={{
          position: 'fixed', inset: 0, zIndex: 9999,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'rgba(15, 23, 42, 0.6)',
          padding: '40px 20px', fontFamily: "'Inter','DM Sans',sans-serif", fontSize: 13.5, color: ink,
        }}>
          <div className="client-modal-content" style={{
            width: 920, maxWidth: '100%', maxHeight: '92vh',
            background: paper, borderRadius: 14,
            boxShadow: '0 30px 70px -20px rgba(0,0,0,.55), 0 8px 24px -8px rgba(0,0,0,.35), 0 0 0 1px rgba(255,255,255,.04)',
            display: 'flex', flexDirection: 'column', overflow: 'hidden', position: 'relative'
          }}>
            {/* Accent stripe */}
            <div style={{
              position: 'absolute', top: 0, left: 0, right: 0, height: 4,
              background: `linear-gradient(90deg, ${teal[600]}, ${teal[400]} 40%, ${amber[500]} 100%)`
            }} />

            {/* Header */}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '22px 28px 18px',
              borderBottom: `1px solid ${hairline}`,
              background: paper
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <div style={{
                  width: 40, height: 40, borderRadius: 10,
                  background: `linear-gradient(155deg, ${teal[500]}, ${teal[700]})`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  boxShadow: `0 4px 10px -3px rgba(15,84,76,.6)`, flexShrink: 0
                }}>
                  <BadgePercent size={19} color="#fff" />
                </div>
                <div>
                  <h1 style={{
                    fontFamily: "'DM Serif Display', 'Georgia', serif", fontWeight: 400,
                    fontSize: 22, margin: 0, color: teal[800], letterSpacing: 0.2
                  }}>
                    {editingId ? `Edit Promotion: ${form.name || '—'}` : 'Add New Promotion'}
                  </h1>
                  <p style={{ margin: '2px 0 0', fontSize: 11.5, color: inkSoft, letterSpacing: 0.02 }}>
                    Smart Operations &mdash; portal-driven discount campaigns
                  </p>
                </div>
              </div>
              <button onClick={() => { setShowNew(false); setEditingId(null); setForm(emptyForm()) }} aria-label="Close" style={{
                width: 32, height: 32, borderRadius: 8,
                border: `1px solid ${hairline}`, background: paper, color: inkSoft,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer', transition: 'all .15s ease', fontSize: 16
              }}
                onMouseEnter={e => { e.currentTarget.style.background = teal[50]; e.currentTarget.style.color = teal[700]; e.currentTarget.style.borderColor = teal[200]; }}
                onMouseLeave={e => { e.currentTarget.style.background = paper; e.currentTarget.style.color = inkSoft; e.currentTarget.style.borderColor = hairline; }}
              >
                <X size={15} />
              </button>
            </div>

            {/* Body */}
            <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>

              {/* Sidebar Nav */}
              <div style={{
                width: 212, flexShrink: 0,
                background: `linear-gradient(180deg, ${teal[800]}, ${teal[900]})`,
                padding: '18px 12px', position: 'relative'
              }}>
                <div style={{
                  position: 'absolute', top: 0, right: 0, bottom: 0, width: 10,
                  backgroundImage: 'radial-gradient(circle, rgba(254,253,251,.9) 2.2px, transparent 2.3px)',
                  backgroundSize: '10px 16px', backgroundPosition: '4px 8px', opacity: 0.12
                }} />
                <div style={{
                  color: 'rgba(255,255,255,.4)', fontSize: 10, letterSpacing: 0.16,
                  textTransform: 'uppercase', fontWeight: 600, padding: '4px 12px 10px'
                }}>
                  Promotion Setup
                </div>
                {modalTabs.map((tab) => {
                  const isActive = activeTab === tab.id;
                  const Icon = tab.icon;
                  return (
                    <button key={tab.id} type="button" onClick={() => setActiveTab(tab.id)} style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      padding: '10px 12px', borderRadius: 8,
                      color: isActive ? '#fff' : 'rgba(255,255,255,.62)',
                      fontSize: 13, fontWeight: 500, cursor: 'pointer', marginBottom: 2,
                      transition: 'all .15s ease', position: 'relative',
                      width: '100%', border: 'none', background: 'transparent', textAlign: 'left',
                      ...(isActive ? {
                        background: `linear-gradient(90deg, rgba(217,154,63,.18), rgba(217,154,63,.05))`,
                        boxShadow: `inset 3px 0 0 ${amber[500]}`
                      } : {})
                    }}
                      onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = 'rgba(255,255,255,.06)'; e.currentTarget.style.color = '#fff'; }}
                      onMouseLeave={e => { if (!isActive) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'rgba(255,255,255,.62)'; } }}
                    >
                      <Icon size={16} style={{ flexShrink: 0, opacity: 0.85 }} />
                      {tab.label}
                      <span style={{
                        marginLeft: 'auto', width: 16, height: 16, borderRadius: '50%',
                        background: isActive ? amber[500] : 'rgba(255,255,255,.12)',
                        fontFamily: "'JetBrains Mono', monospace", fontSize: 9.5,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        color: isActive ? teal[900] : 'rgba(255,255,255,.55)',
                        fontWeight: isActive ? 600 : 400
                      }}>
                        {modalTabs.indexOf(tab) + 1}
                      </span>
                    </button>
                  );
                })}
                <div style={{
                  position: 'absolute', bottom: 18, left: 12, right: 22,
                  padding: 12, borderRadius: 8,
                  background: 'rgba(255,255,255,.045)',
                  border: '1px dashed rgba(255,255,255,.14)'
                }}>
                  <p style={{ margin: 0, fontSize: 10.5, color: 'rgba(255,255,255,.42)', lineHeight: 1.5 }}>
                    Fields marked <b style={{ color: amber[300], fontWeight: 600 }}>*</b> are required before this record can be saved to the ledger.
                  </p>
                </div>
              </div>

              {/* Form Area */}
              <div style={{ flex: 1, overflowY: 'auto', padding: '24px 30px 8px' }}>
                <form id="promotion-form" onSubmit={(e) => { e.preventDefault(); editingId ? saveEdit() : saveNew() }}>

                  {notify && notify.kind === 'error' && (
                    <div style={{
                      display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', borderRadius: 10, marginBottom: 16,
                      background: '#fef0ee', border: `1.4px solid #f3c1bd`, color: danger, fontSize: 12.5, fontWeight: 600,
                    }}>
                      <AlertTriangle size={15} />
                      <span style={{ flex: 1 }}>{notify.text}</span>
                    </div>
                  )}

                  {/* Details Tab */}
                  {activeTab === 'Details' && (
                    <>
                      <div style={sectionLabelStyle}><span>Basics</span></div>

                      <div style={{ marginBottom: 18 }}>
                        <label style={labelStyle}>
                          Promotion Name <span style={{ color: danger, fontWeight: 700 }}>*</span>
                        </label>
                        <input
                          required type="text" value={form.name || ''}
                          onChange={(e) => setForm(p => ({ ...p, name: e.target.value }))}
                          placeholder="e.g. August Portal Promotion"
                          style={modalInputStyle}
                        />
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 18 }}>
                        <div>
                          <label style={labelStyle}>Promo Code</label>
                          <input
                            type="text" value={form.code || ''}
                            onChange={(e) => setForm(p => ({ ...p, code: e.target.value }))}
                            placeholder="AUGUST10"
                            style={{ ...modalInputStyle, fontFamily: "'JetBrains Mono', monospace", textTransform: 'uppercase' }}
                          />
                        </div>
                        <div>
                          <label style={labelStyle}>Channel</label>
                          <select
                            value={form.channel || 'PORTAL'}
                            onChange={(e) => setForm(p => ({ ...p, channel: e.target.value as PromotionChannel }))}
                            style={modalSelectStyle}
                          >
                            {CHANNELS.map((c) => (
                              <option key={c} value={c}>
                                {c === 'BOTH' ? 'ERP + Portal (Both)' : c === 'PORTAL' ? 'Portal Only' : 'ERP Only'}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 18 }}>
                        <div>
                          <label style={labelStyle}>Discount Type</label>
                          <select
                            value={form.discountType || 'percentage'}
                            onChange={(e) => setForm(p => ({ ...p, discountType: e.target.value as PromotionDiscountType }))}
                            style={modalSelectStyle}
                          >
                            {DISCOUNT_TYPES.map((d) => (
                              <option key={d} value={d}>{d.replace('_', ' ').toUpperCase()}</option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label style={labelStyle}>
                            {String(form.discountType || 'percentage').includes('percent') ? 'Discount Value (%)' : 'Discount Value (MWK)'}
                          </label>
                          <input
                            type="number" value={form.discountValue}
                            onChange={(e) => setForm(p => ({ ...p, discountValue: parseFloat(e.target.value) || 0 }))}
                            placeholder="e.g. 10"
                            style={modalInputStyle}
                          />
                        </div>
                      </div>

                      <div style={{ marginBottom: 18 }}>
                        <label style={labelStyle}>Description</label>
                        <textarea
                          value={form.description || ''}
                          onChange={(e) => setForm(p => ({ ...p, description: e.target.value }))}
                          rows={3}
                          placeholder="What customers see and why this promotion exists..."
                          style={{ ...modalInputStyle, resize: 'none', minHeight: 66, lineHeight: 1.5 }}
                        />
                      </div>
                    </>
                  )}

                  {/* Schedule Tab */}
                  {activeTab === 'Schedule' && (
                    <>
                      <div style={sectionLabelStyle}><span>Schedule &amp; Status</span></div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 18 }}>
                        <div>
                          <label style={labelStyle}>Status</label>
                          <select
                            value={form.status || 'draft'}
                            onChange={(e) => setForm(p => ({ ...p, status: e.target.value as PromotionStatus }))}
                            style={modalSelectStyle}
                          >
                            {STATUSES.map((s) => (
                              <option key={s} value={s}>{s}</option>
                            ))}
                          </select>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'flex-end', paddingBottom: 6 }}>
                          <Toggle value={form.isActive !== false} onChange={(v: boolean) => setForm(p => ({ ...p, isActive: v }))} label="Active" />
                        </div>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 18 }}>
                        <div>
                          <label style={labelStyle}>Start Date / Time</label>
                          <input
                            type="datetime-local" value={form.startsAt || ''}
                            onChange={(e) => setForm(p => ({ ...p, startsAt: e.target.value }))}
                            style={modalInputStyle}
                          />
                        </div>
                        <div>
                          <label style={labelStyle}>End Date / Time</label>
                          <input
                            type="datetime-local" value={form.endsAt || ''}
                            onChange={(e) => setForm(p => ({ ...p, endsAt: e.target.value }))}
                            style={modalInputStyle}
                          />
                        </div>
                      </div>
                      <div style={{
                        padding: 14, background: teal[50], borderRadius: 9, border: `1px solid ${teal[100]}`,
                        display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18
                      }}>
                        <div style={{ padding: 8, borderRadius: 8, background: teal[100], color: teal[600], display: 'inline-flex' }}>
                          <Clock size={18} />
                        </div>
                        <div style={{ fontSize: 12, color: inkSoft, fontWeight: 500, lineHeight: 1.5 }}>
                          Leave <b style={{ color: teal[800] }}>End Date/Time</b> empty for no expiry. Scheduled promotions go live automatically once the start time passes.
                        </div>
                      </div>
                    </>
                  )}

                  {/* Limits Tab */}
                  {activeTab === 'Limits' && (
                    <>
                      <div style={sectionLabelStyle}><span>Limits &amp; Priority</span></div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 18 }}>
                        <div>
                          <label style={labelStyle}>Minimum Order (MWK)</label>
                          <input
                            type="number" value={form.minimumOrderAmount}
                            onChange={(e) => setForm(p => ({ ...p, minimumOrderAmount: parseFloat(e.target.value) || 0 }))}
                            placeholder="0.00"
                            style={modalInputStyle}
                          />
                        </div>
                        <div>
                          <label style={labelStyle}>Maximum Discount (MWK)</label>
                          <input
                            type="number" value={form.maximumDiscountAmount}
                            onChange={(e) => setForm(p => ({ ...p, maximumDiscountAmount: parseFloat(e.target.value) || 0 }))}
                            placeholder="0.00"
                            style={modalInputStyle}
                          />
                        </div>
                        <div>
                          <label style={labelStyle}>Usage Limit (total)</label>
                          <input
                            type="number" value={form.usageLimit}
                            onChange={(e) => setForm(p => ({ ...p, usageLimit: parseInt(e.target.value) || 0 }))}
                            placeholder="0 = unlimited"
                            style={modalInputStyle}
                          />
                        </div>
                        <div>
                          <label style={labelStyle}>Per-Customer Limit</label>
                          <input
                            type="number" value={form.usageLimitPerCustomer}
                            onChange={(e) => setForm(p => ({ ...p, usageLimitPerCustomer: parseInt(e.target.value) || 0 }))}
                            placeholder="0 = unlimited"
                            style={modalInputStyle}
                          />
                        </div>
                        <div>
                          <label style={labelStyle}>Priority</label>
                          <input
                            type="number" value={form.priority}
                            onChange={(e) => setForm(p => ({ ...p, priority: parseInt(e.target.value) || 0 }))}
                            placeholder="Higher applies first"
                            style={modalInputStyle}
                          />
                        </div>
                      </div>
                      <div style={{
                        padding: 14, background: amber[100], borderRadius: 9, border: `1px solid ${amber[300]}`,
                        display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18
                      }}>
                        <div style={{ padding: 8, borderRadius: 8, background: 'rgba(181,73,63,.08)', color: danger, display: 'inline-flex' }}>
                          <Layers size={18} />
                        </div>
                        <div style={{ fontSize: 12, color: '#8a5a1a', fontWeight: 500, lineHeight: 1.5 }}>
                          Higher <b>priority</b> promotions apply first when multiple promotions are eligible on the same order.
                        </div>
                      </div>
                    </>
                  )}

                  {/* Audience Tab */}
                  {activeTab === 'Audience' && (
                    <>
                      <div style={sectionLabelStyle}><span>Audience</span></div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 18 }}>
                        <div>
                          <label style={labelStyle}>Applies To</label>
                          <select
                            value={form.applicableTo || 'all'}
                            onChange={(e) => setForm(p => ({ ...p, applicableTo: e.target.value as any }))}
                            style={modalSelectStyle}
                          >
                            <option value="all">All Products</option>
                            <option value="categories">Specific Categories</option>
                            <option value="products">Specific Products</option>
                          </select>
                        </div>
                        <div>
                          <label style={labelStyle}>Customer Scope</label>
                          <select
                            value={form.customerScope || 'all'}
                            onChange={(e) => setForm(p => ({ ...p, customerScope: e.target.value as any }))}
                            style={modalSelectStyle}
                          >
                            <option value="all">All Customers</option>
                            <option value="new_customers">New Customers (&lt; 90 days)</option>
                            <option value="existing_customers">Existing Customers</option>
                            <option value="customers">Specific Customers</option>
                          </select>
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 22, marginTop: 14, flexWrap: 'wrap', alignItems: 'center', marginBottom: 18 }}>
                        <Toggle value={form.isAutoApply !== false} onChange={(v: boolean) => setForm(p => ({ ...p, isAutoApply: v }))} label="Auto-apply for eligible customers" />
                        <Toggle value={!!form.stackable} onChange={(v: boolean) => setForm(p => ({ ...p, stackable: v }))} label="Stackable with other promotions" />
                      </div>
                      <div style={{
                        padding: 14, background: teal[50], borderRadius: 9, border: `1px solid ${teal[100]}`,
                        display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18
                      }}>
                        <div style={{ padding: 8, borderRadius: 8, background: teal[100], color: teal[600], display: 'inline-flex' }}>
                          <Users size={18} />
                        </div>
                        <div style={{ fontSize: 12, color: inkSoft, fontWeight: 500, lineHeight: 1.5 }}>
                          Auto-applied promotions require <b style={{ color: teal[800] }}>no code</b> — eligible customers get the discount at checkout automatically.
                        </div>
                      </div>
                    </>
                  )}

                  {/* Preview Tab */}
                  {activeTab === 'Preview' && (
                    <>
                      <div style={sectionLabelStyle}><span>Live Preview</span></div>
                      <div style={{ borderRadius: 12, border: `1.4px solid ${teal[200]}`, background: teal[50], padding: 14, marginBottom: 18 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
                          <Sparkles size={14} style={{ color: teal[600] }} />
                          <span style={{ fontSize: 12, fontWeight: 800, color: teal[700], textTransform: 'uppercase', letterSpacing: 0.06 }}>Live Preview</span>
                        </div>
                        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                          <div style={{ flex: '1 1 200px' }}>
                            <label style={labelStyle}>Sample Order Amount (MWK)</label>
                            <input
                              type="number" value={sampleAmount}
                              onChange={(e) => setSampleAmount(parseFloat(e.target.value) || 0)}
                              style={modalInputStyle}
                            />
                          </div>
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 10, flex: 1, minWidth: 420 }}>
                            <div style={{ background: paper, borderRadius: 10, border: `1px solid ${hairline}`, padding: '10px 12px' }}>
                              <div style={{ fontSize: 10, fontWeight: 700, color: inkSoft, textTransform: 'uppercase', letterSpacing: 0.05 }}>Original Price</div>
                              <div style={{ fontSize: 15, fontWeight: 700, color: ink, fontFamily: "'JetBrains Mono', monospace" }}>{fmt(preview?.subtotal || 0)}</div>
                            </div>
                            <div style={{ background: paper, borderRadius: 10, border: `1px solid ${hairline}`, padding: '10px 12px' }}>
                              <div style={{ fontSize: 10, fontWeight: 700, color: '#047857', textTransform: 'uppercase', letterSpacing: 0.05 }}>Discount</div>
                              <div style={{ fontSize: 15, fontWeight: 700, color: '#047857', fontFamily: "'JetBrains Mono', monospace" }}>− {fmt(preview?.discountTotal || 0)}</div>
                            </div>
                            <div style={{ background: paper, borderRadius: 10, border: `1px solid ${hairline}`, padding: '10px 12px' }}>
                              <div style={{ fontSize: 10, fontWeight: 700, color: '#92400e', textTransform: 'uppercase', letterSpacing: 0.05 }}>Customer Saves</div>
                              <div style={{ fontSize: 15, fontWeight: 700, color: '#92400e', fontFamily: "'JetBrains Mono', monospace" }}>{fmt(preview?.discountTotal || 0)}</div>
                            </div>
                            <div style={{ background: 'linear-gradient(135deg,#0b3e39,#1f8577)', borderRadius: 10, padding: '10px 12px' }}>
                              <div style={{ fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,.7)', textTransform: 'uppercase', letterSpacing: 0.05 }}>Customer Pays</div>
                              <div style={{ fontSize: 15, fontWeight: 800, color: '#fff', fontFamily: "'JetBrains Mono', monospace" }}>{fmt(preview?.grandTotal || 0)}</div>
                            </div>
                          </div>
                        </div>
                        <p style={{ margin: '10px 0 0', fontSize: 11, color: '#8a9496', lineHeight: 1.5 }}>
                          The preview is an estimate. At checkout the server re-calculates using authoritative ERP master prices — browsers never set prices or discounts.
                        </p>
                      </div>
                    </>
                  )}

                </form>
              </div>
            </div>

            {/* Footer */}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              gap: 14, padding: '16px 28px',
              borderTop: `1px solid ${hairline}`, background: paper
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: inkSoft }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: amber[500] }} />
                Step {stepNumber} of {totalSteps} &mdash; {modalTabs.find(t => t.id === activeTab)?.label}
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <button type="button" onClick={() => { setShowNew(false); setEditingId(null); setForm(emptyForm()) }}
                  style={{
                    fontFamily: "'Inter', sans-serif", fontSize: 13, fontWeight: 600,
                    padding: '9px 18px', borderRadius: 9, cursor: 'pointer',
                    background: paper, border: `1.4px solid ${hairline}`, color: inkSoft,
                    display: 'flex', alignItems: 'center', gap: 7, transition: 'all .15s ease'
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = teal[50]; e.currentTarget.style.color = teal[800]; e.currentTarget.style.borderColor = teal[200]; }}
                  onMouseLeave={e => { e.currentTarget.style.background = paper; e.currentTarget.style.color = inkSoft; e.currentTarget.style.borderColor = hairline; }}>
                  Cancel
                </button>
                <button type="submit" form="promotion-form" disabled={saving}
                  style={{
                    fontFamily: "'Inter', sans-serif", fontSize: 13, fontWeight: 600,
                    padding: '9px 18px', borderRadius: 9, cursor: saving ? 'not-allowed' : 'pointer', border: '1.4px solid transparent',
                    background: `linear-gradient(155deg, ${teal[500]}, ${teal[700]})`,
                    color: '#fff', display: 'flex', alignItems: 'center', gap: 7,
                    boxShadow: `0 6px 16px -6px rgba(15,84,76,.55)`,
                    opacity: saving ? 0.6 : 1,
                    transition: 'all .15s ease'
                  }}
                  onMouseEnter={e => { if (!saving) { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 8px 20px -6px rgba(15,84,76,.65)'; } }}
                  onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 6px 16px -6px rgba(15,84,76,.55)'; }}>
                  {saving ? (
                    <span style={{ width: 12, height: 12, borderRadius: '50%', border: '2px solid rgba(255,255,255,.4)', borderTopColor: '#fff', display: 'inline-block', animation: 'spin 0.8s linear infinite' }} />
                  ) : (
                    <><Save size={13} /> {editingId ? 'Save Changes' : 'Create Promotion'} <ChevronRight size={14} /></>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete confirmation ── */}
      {deleteTarget && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(15,23,42,.55)', backdropFilter: 'blur(3px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ background: paper, borderRadius: 16, padding: '24px 24px 20px', maxWidth: 420, width: '100%', boxShadow: '0 30px 70px -20px rgba(0,0,0,.45)', animation: 'scaleIn .18s cubic-bezier(.4,0,.2,1)', position: 'relative', overflow: 'hidden' }}>
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 4, background: `linear-gradient(90deg, ${danger}, #e27065)` }} />
            <div style={{ width: 46, height: 46, borderRadius: 12, background: '#fef0ee', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 14 }}>
              <AlertTriangle size={22} style={{ color: danger }} />
            </div>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: ink }}>Delete promotion?</h3>
            <p style={{ margin: '8px 0 0', fontSize: 13, color: inkSoft, lineHeight: 1.55 }}>
              <b style={{ color: ink }}>{deleteTarget.name}</b> will be removed. Historical orders keep their recorded discounts — they are never recalculated.
            </p>
            <div style={{ display: 'flex', gap: 8, marginTop: 20, justifyContent: 'flex-end' }}>
              <button onClick={() => setDeleteTarget(null)} style={{ padding: '9px 14px', background: paper, border: `1.4px solid ${hairline}`, borderRadius: 9, fontSize: 12.5, fontWeight: 700, color: inkSoft, cursor: 'pointer' }}>Cancel</button>
              <button onClick={confirmDelete} style={{ padding: '9px 16px', background: danger, color: '#fff', borderRadius: 9, border: 'none', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
                <Trash2 size={13} /> Delete Promotion
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`@keyframes scaleIn { from { transform: scale(.96); opacity: 0 } to { transform: scale(1); opacity: 1 } }
        @keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}

export default PromotionsAdmin