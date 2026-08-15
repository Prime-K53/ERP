import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { dbService } from '../../services/db'
import type { PortalAd, PortalAdStatus } from '../../types/ads'
import { aiService } from '../../services/aiService'
import {
  Plus, Search, Pencil, Trash2, X, Play, Pause, Megaphone, Sparkles, Clock,
  CheckCircle2, CheckCircle, AlertTriangle, Calendar, Wand2, Eye, Layers, Loader2,
} from 'lucide-react'

const teal = {
  50: '#eef7f6', 100: '#d3ece9', 200: '#a6d9d3', 300: '#72c0b7',
  400: '#3fa294', 500: '#1f8577', 600: '#146b60', 700: '#0f544c',
  800: '#0b3e39', 900: '#082e2a'
}
const amber = { 100: '#fbead0', 300: '#eec27a', 500: '#d99a3f', 600: '#b97e2b' }
const paper = '#FEFDFB', ink = '#23282A', inkSoft = '#5c6567', hairline = '#e4ddd1', danger = '#b5493f'
const violet = { 50: '#f3f0ff', 100: '#e4dcff', 500: '#7c5cf0', 700: '#5b3fd4' }

const STATUSES: PortalAdStatus[] = ['draft', 'scheduled', 'active', 'paused', 'expired']

const GRADIENT_PRESETS = [
  { name: 'Portal Teal', value: 'linear-gradient(135deg, #0b3e39 0%, #1f8577 100%)' },
  { name: 'Deep Navy', value: 'linear-gradient(135deg, #0F2C59 0%, #1E3A8A 100%)' },
  { name: 'Emerald', value: 'linear-gradient(135deg, #065F46 0%, #059669 100%)' },
  { name: 'Amber Deal', value: 'linear-gradient(135deg, #7C2D12 0%, #D97706 100%)' },
  { name: 'Royal Purple', value: 'linear-gradient(135deg, #312E81 0%, #7C5CF0 100%)' },
  { name: 'Rose', value: 'linear-gradient(135deg, #831843 0%, #DB2777 100%)' },
]

const EMOJI_PRESETS = ['🎯', '✨', '🏷️', '🎁', '👑', '🚀', '🔥', '💰', '📦', '🖨️', '📣', '⭐']

const CTA_TARGETS = [
  { value: '/portal/orders', label: 'Browse Catalog / Orders' },
  { value: '/portal/new-request', label: 'New Request / Quote' },
  { value: '/portal/quotations', label: 'Quotations' },
  { value: '/portal/invoices', label: 'Invoices & Payments' },
  { value: '/portal/wallet', label: 'Wallet' },
  { value: '/portal/referrals', label: 'Referrals' },
  { value: '/portal/loyalty', label: 'Loyalty & Rewards' },
  { value: '/portal/deliveries', label: 'Deliveries' },
  { value: '/portal/account-statements', label: 'Account Statements' },
]

const fmtInt = (v: any) => Number(v || 0).toLocaleString()

const deriveStatus = (ad: any, now = new Date()): PortalAdStatus => {
  if (!ad) return 'draft'
  if (ad.status === 'paused') return 'paused'
  if (ad.status === 'draft') return 'draft'
  const ts = now.getTime()
  const start = ad.startsAt ? new Date(ad.startsAt).getTime() : null
  const end = ad.endsAt ? new Date(ad.endsAt).getTime() : null
  if (start !== null && !Number.isNaN(start) && ts < start) return 'scheduled'
  if (end !== null && !Number.isNaN(end) && ts > end) return 'expired'
  if (ad.isActive === false) return 'draft'
  return 'active'
}

const STATUS_META: Record<PortalAdStatus, { bg: string; fg: string; dot: string }> = {
  draft: { bg: hairline, fg: inkSoft, dot: '#94a3b8' },
  scheduled: { bg: violet[100], fg: violet[700], dot: '#7c5cf0' },
  active: { bg: teal[100], fg: teal[700], dot: '#1f8577' },
  paused: { bg: amber[100], fg: '#92400e', dot: '#d99a3f' },
  expired: { bg: '#fef0ee', fg: danger, dot: '#b5493f' },
}

const emptyForm = (): Partial<PortalAd> => ({
  title: '',
  subtitle: '',
  badge: 'Special Offer',
  ctaLabel: 'Order Now',
  ctaTarget: '/portal/orders',
  gradient: GRADIENT_PRESETS[0].value,
  emoji: '🎯',
  priority: 0,
  isActive: true,
  status: 'draft',
  startsAt: new Date().toISOString().slice(0, 16),
  endsAt: '',
})

const toCanonical = (f: Partial<PortalAd>): PortalAd => ({
  id: f.id || `AD_${Date.now()}`,
  title: String(f.title || '').trim(),
  subtitle: f.subtitle ? String(f.subtitle).trim() : '',
  badge: f.badge ? String(f.badge).trim() : '',
  ctaLabel: f.ctaLabel ? String(f.ctaLabel).trim() : 'Order Now',
  ctaTarget: f.ctaTarget || '/portal/orders',
  imageUrl: f.imageUrl ? String(f.imageUrl).trim() : '',
  gradient: f.gradient || GRADIENT_PRESETS[0].value,
  emoji: f.emoji || '🎯',
  priority: Number(f.priority ?? 0) || 0,
  startsAt: f.startsAt ? new Date(f.startsAt).toISOString() : new Date().toISOString(),
  endsAt: f.endsAt ? new Date(f.endsAt).toISOString() : '',
  isActive: f.isActive !== undefined ? !!f.isActive : true,
  status: f.status || 'draft',
  createdAt: f.createdAt || new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  createdBy: f.createdBy,
  companyId: f.companyId,
  aiGenerated: f.aiGenerated || false,
  aiPrompt: f.aiPrompt,
})

const modalTabs = [
  { id: 'Details' as const, label: 'Ad Details', icon: Megaphone },
  { id: 'AIStudio' as const, label: 'AI Studio', icon: Wand2 },
  { id: 'Schedule' as const, label: 'Schedule & Status', icon: Calendar },
  { id: 'Preview' as const, label: 'Live Preview', icon: Eye },
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
  display: 'flex', alignItems: 'center', gap: 10, margin: '26px 0 14px'
}

export const AdsManager: React.FC = () => {
  const [ads, setAds] = useState<PortalAd[]>([])
  const [loading, setLoading] = useState(true)
  const [showNew, setShowNew] = useState(false)
  const [form, setForm] = useState<Partial<PortalAd>>(emptyForm())
  const [activeTab, setActiveTab] = useState<typeof modalTabs[number]['id']>('Details')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [deleteTarget, setDeleteTarget] = useState<PortalAd | null>(null)
  const [saving, setSaving] = useState(false)
  const [notify, setNotify] = useState<{ kind: 'success' | 'error'; text: string } | null>(null)

  // ── AI Studio state ──
  const [aiBrief, setAiBrief] = useState('')
  const [aiAudience, setAiAudience] = useState('all customers')
  const [aiTone, setAiTone] = useState('friendly')
  const [aiBusy, setAiBusy] = useState(false)
  const [aiError, setAiError] = useState('')

  const openNew = () => { setEditingId(null); setForm(emptyForm()); setActiveTab('Details'); setShowNew(true) }

  const load = useCallback(async () => {
    try {
      const data = await dbService.getAll<PortalAd>('portalAds')
      setAds([...data].sort((a, b) => (Number(b.priority) || 0) - (Number(a.priority) || 0)))
    } catch (err: any) {
      setNotify({ kind: 'error', text: err?.message || 'Failed to load ads' })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const effective = useMemo(
    () => ads.map((a) => ({ ...a, _effectiveStatus: deriveStatus(a) })),
    [ads]
  )

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return effective.filter((a) => {
      if (statusFilter !== 'all') {
        const s = a._effectiveStatus
        // The "Draft / Paused" KPI card filters both states.
        if (statusFilter === 'draft-paused') {
          if (s !== 'draft' && s !== 'paused') return false
        } else if (s !== statusFilter) {
          return false
        }
      }
      if (q && !`${a.title} ${a.subtitle || ''} ${a.badge || ''}`.toLowerCase().includes(q)) return false
      return true
    })
  }, [effective, search, statusFilter])

  const stats = useMemo(() => {
    const counts: Record<string, number> = { active: 0, scheduled: 0, draft: 0, paused: 0, expired: 0 }
    for (const a of effective) {
      const s = a._effectiveStatus || deriveStatus(a)
      if (counts[s] !== undefined) counts[s] += 1
    }
    const aiCount = ads.filter((a) => a.aiGenerated).length
    return { counts, aiCount }
  }, [effective, ads])

  const saveNew = async () => {
    if (!form.title || !String(form.title).trim()) {
      setNotify({ kind: 'error', text: 'Ad title is required.' })
      return
    }
    setSaving(true)
    try {
      const record = toCanonical(form)
      await dbService.put('portalAds', record)
      setShowNew(false)
      setForm(emptyForm())
      setNotify({ kind: 'success', text: `Ad "${record.title}" created — it will appear on the portal banner when active.` })
      await load()
    } catch (err: any) {
      setNotify({ kind: 'error', text: err?.message || 'Failed to create ad' })
    } finally {
      setSaving(false)
    }
  }

  const startEdit = (ad: PortalAd) => {
    setEditingId(ad.id)
    setForm({
      ...ad,
      startsAt: (ad.startsAt || new Date().toISOString()).slice(0, 16),
      endsAt: ad.endsAt ? ad.endsAt.slice(0, 16) : '',
    })
    setAiBrief(ad.aiPrompt || '')
    setActiveTab('Details')
    setShowNew(true)
  }

  const saveEdit = async () => {
    if (!editingId || !form.title) return
    setSaving(true)
    try {
      const existing = ads.find((a) => a.id === editingId)
      const record = toCanonical({ ...existing, ...form, id: editingId })
      await dbService.put('portalAds', record)
      setShowNew(false)
      setEditingId(null)
      setForm(emptyForm())
      setNotify({ kind: 'success', text: 'Ad updated.' })
      await load()
    } catch (err: any) {
      setNotify({ kind: 'error', text: err?.message || 'Failed to update ad' })
    } finally {
      setSaving(false)
    }
  }

  const toggleStatus = async (ad: PortalAd) => {
    const current = deriveStatus(ad)
    const next: PortalAdStatus = current === 'active' ? 'paused' : 'active'
    await dbService.put('portalAds', {
      ...ad,
      status: next,
      isActive: next === 'active',
      updatedAt: new Date().toISOString(),
    } as PortalAd)
    setNotify({ kind: 'success', text: next === 'active' ? 'Ad activated.' : 'Ad paused.' })
    await load()
  }

  const confirmDelete = async () => {
    if (!deleteTarget) return
    await dbService.delete('portalAds', deleteTarget.id)
    setDeleteTarget(null)
    setNotify({ kind: 'success', text: `Ad "${deleteTarget.title}" deleted.` })
    await load()
  }

  // ── AI generation ──
  const runAIGenerate = async () => {
    if (!aiBrief.trim()) {
      setAiError('Describe the ad first — e.g. "20% off all business cards this month".')
      return
    }
    setAiBusy(true)
    setAiError('')
    try {
      const result = await aiService.generateAdCopy({ description: aiBrief, audience: aiAudience, tone: aiTone })
      if (result) {
        setForm((prev) => ({
          ...prev,
          title: result.title,
          subtitle: result.subtitle,
          badge: result.badge,
          ctaLabel: result.ctaLabel,
          emoji: result.emoji,
          gradient: result.gradient,
          aiGenerated: true,
          aiPrompt: aiBrief,
        }))
        setActiveTab('Preview')
      }
    } catch (err: any) {
      setAiError(err?.message || 'AI generation failed. Try again or write the copy manually.')
    } finally {
      setAiBusy(false)
    }
  }

  // Portal-style banner preview (mirrors CustomerDashboard carousel slide).
  const BannerPreview = ({ ad, compact = false }: { ad: Partial<PortalAd>; compact?: boolean }) => {
    const title = ad.title || 'Your ad title'
    const subtitle = ad.subtitle || 'Your supporting message appears here.'
    const badge = ad.badge || 'Special Offer'
    const emoji = ad.emoji || '🎯'
    const ctaLabel = ad.ctaLabel || 'Order Now'
    return (
      <div style={{
        borderRadius: 14, overflow: 'hidden', position: 'relative',
        background: ad.gradient || GRADIENT_PRESETS[0].value, color: '#fff',
        boxShadow: '0 10px 26px -12px rgba(11,62,57,.5)', minHeight: compact ? 84 : 96,
      }}>
        <div style={{ position: 'absolute', right: -40, top: -60, width: 180, height: 180, borderRadius: '50%', background: 'rgba(255,255,255,.07)' }} />
        <div style={{ position: 'absolute', left: -50, bottom: -90, width: 200, height: 200, borderRadius: '50%', background: 'rgba(255,255,255,.05)' }} />
        <div style={{ position: 'relative', padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{
            width: compact ? 34 : 40, height: compact ? 34 : 40, borderRadius: 11, flexShrink: 0,
            background: 'rgba(255,255,255,.16)', border: '1px solid rgba(255,255,255,.24)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: compact ? 17 : 20,
          }}>{emoji}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            {!compact && (
              <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: '0.09em', textTransform: 'uppercase', color: 'rgba(255,255,255,.72)', marginBottom: 2 }}>
                {badge}
              </div>
            )}
            <div style={{ fontSize: compact ? 13 : 15, fontWeight: 800, lineHeight: 1.25 }}>{title}</div>
            {!compact && subtitle && (
              <div style={{ fontSize: 11.5, color: 'rgba(255,255,255,.8)', marginTop: 1, lineHeight: 1.45 }}>{subtitle}</div>
            )}
          </div>
          {!compact && (
            <button style={{
              flexShrink: 0, padding: '7px 12px', borderRadius: 9, border: 'none',
              background: '#fff', color: '#0b3e39', fontSize: 11.5, fontWeight: 800, cursor: 'default',
              boxShadow: '0 4px 10px -4px rgba(0,0,0,.35)',
            }}>{ctaLabel}</button>
          )}
        </div>
      </div>
    )
  }

  const KpiCard = ({ kpiId, label, value, icon, iconBg, iconColor, borderColor }: any) => {
    const active = kpiId === 'all' ? statusFilter === 'all' : statusFilter === kpiId
    const onClick = () => {
      if (kpiId === 'all') { setStatusFilter('all'); return }
      setStatusFilter(prev => prev === kpiId ? 'all' : kpiId)
    }
    return (
      <div onClick={onClick} style={{
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
          <p style={{ fontSize: 18, fontWeight: 600, color: '#111827', margin: 0, fontFamily: "'Inter', sans-serif", fontVariantNumeric: 'tabular-nums' }}>{value}</p>
        </div>
      </div>
    )
  }

  const StatusBadge = ({ status }: { status: PortalAdStatus }) => {
    const m = STATUS_META[status] || STATUS_META.draft
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 10, fontWeight: 700, padding: '3px 9px', borderRadius: 20, background: m.bg, color: m.fg }}>
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: m.dot }} />
        {status}
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
              <Megaphone size={22} color={teal[700]} />
            </div>
            <div>
              <h2 style={{ fontSize: 20, fontWeight: 800, color: teal[900], margin: 0, letterSpacing: 0.2 }}>Portal Ads</h2>
              <p style={{ fontSize: 12, color: inkSoft, margin: '2px 0 0', lineHeight: 1.4 }}>
                Banner ads that appear on the customer portal — generate, schedule and manage them here.
              </p>
            </div>
          </div>
        </div>
        <button onClick={openNew} style={{
          position: 'relative', zIndex: 1, padding: '10px 16px', background: '#fff', color: teal[700], borderRadius: 10,
          border: 'none', fontSize: 12.5, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 7, cursor: 'pointer',
          boxShadow: '0 6px 16px -6px rgba(0,0,0,.35)', transition: 'transform .15s ease, box-shadow .15s ease',
        }}
          onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 10px 22px -8px rgba(0,0,0,.4)' }}
          onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 6px 16px -6px rgba(0,0,0,.35)' }}
        >
          <Plus size={15} strokeWidth={3} /> New Ad
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

      {/* ── Money bar ── */}
      <div className="customers-money-bar" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14, marginBottom: 18 }}>
        <KpiCard kpiId="active" label="Active" value={fmtInt(stats.counts.active)}
          icon={<CheckCircle size={20} />} iconBg={teal[100]} iconColor={teal[600]} borderColor={teal[500]} />
        <KpiCard kpiId="scheduled" label="Scheduled" value={fmtInt(stats.counts.scheduled)}
          icon={<Clock size={20} />} iconBg={amber[100]} iconColor={amber[500]} borderColor={amber[500]} />
        <KpiCard kpiId="draft-paused" label="Draft / Paused" value={fmtInt(stats.counts.draft + stats.counts.paused)}
          icon={<Layers size={20} />} iconBg={violet[50]} iconColor={violet[500]} borderColor={violet[500]} />
        <KpiCard kpiId="all" label="AI Generated" value={fmtInt(stats.aiCount)}
          icon={<Sparkles size={20} />} iconBg={teal[50]} iconColor={teal[500]} borderColor={teal[500]} />
      </div>

      {/* ── Toolbar ── */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: '1 1 220px', minWidth: 200 }}>
          <Search size={15} style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: '#8a9496', zIndex: 1 }} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search ads by title, subtitle or badge..."
            style={{ width: '100%', fontFamily: "'Inter', sans-serif", fontSize: 13.5, color: ink, background: paper, border: `1.4px solid ${hairline}`, borderRadius: 9, padding: '8px 10px 8px 34px', outline: 'none' }}
          />
        </div>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={{ ...modalSelectStyle, width: 160 }}>
          <option value="all">All Status</option>
          {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11.5, color: inkSoft, fontWeight: 600, marginLeft: 'auto' }}>
          <Megaphone size={13} /> {filtered.length} of {ads.length}
        </span>
      </div>

      {/* ── Ad list ── */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: 60, color: inkSoft, fontSize: 13 }}>Loading ads…</div>
      ) : filtered.length === 0 ? (
        <div className="prime-card" style={{ textAlign: 'center', padding: 48, borderRadius: 14, border: `1.4px dashed ${hairline}`, background: paper }}>
          <div style={{ width: 56, height: 56, borderRadius: 16, background: teal[50], margin: '0 auto 14px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Megaphone size={26} style={{ color: teal[500] }} />
          </div>
          <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: ink }}>{ads.length === 0 ? 'No portal ads yet' : 'No ads match your filters'}</p>
          <p style={{ margin: '4px 0 0', fontSize: 12.5, color: inkSoft }}>
            {ads.length === 0 ? 'Create your first banner ad — or let AI write one for you.' : 'Try clearing the search or filters.'}
          </p>
          {ads.length === 0 && (
            <button onClick={openNew} style={{ marginTop: 18, padding: '9px 16px', background: teal[500], color: '#fff', borderRadius: 9, border: 'none', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <Plus size={14} /> Create Ad
            </button>
          )}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {filtered.map((ad) => {
            const status = ad._effectiveStatus as PortalAdStatus
            return (
              <div key={ad.id} className="prime-card" style={{
                background: paper, borderRadius: 12, border: `1.4px solid ${hairline}`, padding: '14px 16px',
                transition: 'box-shadow .15s ease, transform .15s ease',
                boxShadow: '0 1px 2px rgba(0,0,0,.03)',
              }}
                onMouseEnter={(e) => { e.currentTarget.style.boxShadow = '0 8px 20px -10px rgba(11,62,57,.25)'; e.currentTarget.style.transform = 'translateY(-1px)' }}
                onMouseLeave={(e) => { e.currentTarget.style.boxShadow = '0 1px 2px rgba(0,0,0,.03)'; e.currentTarget.style.transform = 'translateY(0)' }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
                  <div style={{ flex: '1 1 320px', minWidth: 280 }}>
                    <BannerPreview ad={ad} compact />
                  </div>
                  <div style={{ minWidth: 180, flex: '1 1 200px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 13.5, fontWeight: 800, color: ink }}>{ad.title}</span>
                      <StatusBadge status={status} />
                    </div>
                    <div style={{ display: 'flex', gap: 14, fontSize: 11.5, color: inkSoft, marginTop: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                        <Calendar size={11} />
                        {new Date(ad.startsAt || new Date().toISOString()).toLocaleDateString()} → {ad.endsAt ? new Date(ad.endsAt).toLocaleDateString() : '∞'}
                      </span>
                      {Number(ad.priority || 0) > 0 && <span>Priority {ad.priority}</span>}
                      {ad.aiGenerated && (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: violet[700], background: violet[50], padding: '2px 8px', borderRadius: 6, fontSize: 10, fontWeight: 700 }}>
                          <Sparkles size={10} /> AI
                        </span>
                      )}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 4, marginLeft: 'auto' }}>
                    <button title={status === 'active' ? 'Pause' : 'Activate'} onClick={() => toggleStatus(ad)}
                      style={{ width: 32, height: 32, borderRadius: 8, border: 'none', cursor: 'pointer', background: status === 'active' ? amber[100] : teal[100], color: status === 'active' ? '#92400e' : teal[700], display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'transform .12s ease' }}
                      onMouseEnter={(e) => { e.currentTarget.style.transform = 'scale(1.08)' }}
                      onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)' }}
                    >
                      {status === 'active' ? <Pause size={13} /> : <Play size={13} />}
                    </button>
                    <button title="Edit" onClick={() => startEdit(ad)}
                      style={{ width: 32, height: 32, borderRadius: 8, border: 'none', cursor: 'pointer', background: '#f1f2f4', color: inkSoft, display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'transform .12s ease' }}
                      onMouseEnter={(e) => { e.currentTarget.style.transform = 'scale(1.08)' }}
                      onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)' }}
                    >
                      <Pencil size={13} />
                    </button>
                    <button title="Delete" onClick={() => setDeleteTarget(ad)}
                      style={{ width: 32, height: 32, borderRadius: 8, border: 'none', cursor: 'pointer', background: 'rgba(181,73,63,.08)', color: danger, display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'transform .12s ease' }}
                      onMouseEnter={(e) => { e.currentTarget.style.transform = 'scale(1.08)' }}
                      onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)' }}
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* ── Create / Edit modal ── */}
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
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 4, background: `linear-gradient(90deg, ${teal[600]}, ${teal[400]} 40%, ${amber[500]} 100%)` }} />

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '22px 28px 18px', borderBottom: `1px solid ${hairline}`, background: paper }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <div style={{ width: 40, height: 40, borderRadius: 10, background: `linear-gradient(155deg, ${teal[500]}, ${teal[700]})`, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: `0 4px 10px -3px rgba(15,84,76,.6)`, flexShrink: 0 }}>
                  <Megaphone size={19} color="#fff" />
                </div>
                <div>
                  <h1 style={{ fontFamily: "'DM Serif Display', 'Georgia', serif", fontWeight: 400, fontSize: 22, margin: 0, color: teal[800], letterSpacing: 0.2 }}>
                    {editingId ? `Edit Ad: ${form.title || '—'}` : 'Create Banner Ad'}
                  </h1>
                  <p style={{ margin: '2px 0 0', fontSize: 11.5, color: inkSoft, letterSpacing: 0.02 }}>
                    Smart Operations &mdash; customer portal banner campaigns
                  </p>
                </div>
              </div>
              <button onClick={() => { setShowNew(false); setEditingId(null); setForm(emptyForm()) }} aria-label="Close" style={{ width: 32, height: 32, borderRadius: 8, border: `1px solid ${hairline}`, background: paper, color: inkSoft, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', transition: 'all .15s ease', fontSize: 16 }}
                onMouseEnter={e => { e.currentTarget.style.background = teal[50]; e.currentTarget.style.color = teal[700]; e.currentTarget.style.borderColor = teal[200]; }}
                onMouseLeave={e => { e.currentTarget.style.background = paper; e.currentTarget.style.color = inkSoft; e.currentTarget.style.borderColor = hairline; }}
              >
                <X size={15} />
              </button>
            </div>

            <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
              {/* Sidebar Nav */}
              <div style={{ width: 212, flexShrink: 0, background: `linear-gradient(180deg, ${teal[800]}, ${teal[900]})`, padding: '18px 12px', position: 'relative' }}>
                <div style={{ position: 'absolute', top: 0, right: 0, bottom: 0, width: 10, backgroundImage: 'radial-gradient(circle, rgba(254,253,251,.9) 2.2px, transparent 2.3px)', backgroundSize: '10px 16px', backgroundPosition: '4px 8px', opacity: 0.12 }} />
                <div style={{ color: 'rgba(255,255,255,.4)', fontSize: 10, letterSpacing: 0.16, textTransform: 'uppercase', fontWeight: 600, padding: '4px 12px 10px' }}>
                  Ad Setup
                </div>
                {modalTabs.map((tab) => {
                  const isActive = activeTab === tab.id
                  const Icon = tab.icon
                  return (
                    <button key={tab.id} type="button" onClick={() => setActiveTab(tab.id)} style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      padding: '10px 12px', borderRadius: 8,
                      color: isActive ? '#fff' : 'rgba(255,255,255,.62)',
                      fontSize: 13, fontWeight: 500, cursor: 'pointer', marginBottom: 2,
                      transition: 'all .15s ease', position: 'relative',
                      width: '100%', border: 'none', background: 'transparent', textAlign: 'left',
                      ...(isActive ? { background: `linear-gradient(90deg, rgba(217,154,63,.18), rgba(217,154,63,.05))`, boxShadow: `inset 3px 0 0 ${amber[500]}` } : {})
                    }}
                      onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = 'rgba(255,255,255,.06)'; e.currentTarget.style.color = '#fff'; }}
                      onMouseLeave={e => { if (!isActive) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'rgba(255,255,255,.62)'; } }}
                    >
                      <Icon size={16} style={{ flexShrink: 0, opacity: 0.85 }} />
                      {tab.label}
                      <span style={{ marginLeft: 'auto', width: 16, height: 16, borderRadius: '50%', background: isActive ? amber[500] : 'rgba(255,255,255,.12)', fontFamily: "'JetBrains Mono', monospace", fontSize: 9.5, display: 'flex', alignItems: 'center', justifyContent: 'center', color: isActive ? teal[900] : 'rgba(255,255,255,.55)', fontWeight: isActive ? 600 : 400 }}>
                        {modalTabs.indexOf(tab) + 1}
                      </span>
                    </button>
                  )
                })}
                <div style={{ position: 'absolute', bottom: 18, left: 12, right: 22, padding: 12, borderRadius: 8, background: 'rgba(255,255,255,.045)', border: '1px dashed rgba(255,255,255,.14)' }}>
                  <p style={{ margin: 0, fontSize: 10.5, color: 'rgba(255,255,255,.42)', lineHeight: 1.5 }}>
                    Use the <b style={{ color: amber[300], fontWeight: 600 }}>AI Studio</b> to draft a whole ad from a one-line brief, then fine-tune here.
                  </p>
                </div>
              </div>

              {/* Form Area */}
              <div style={{ flex: 1, overflowY: 'auto', padding: '24px 30px 8px' }}>
                <form id="ad-form" onSubmit={(e) => { e.preventDefault(); editingId ? saveEdit() : saveNew() }}>

                  {notify && notify.kind === 'error' && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', borderRadius: 10, marginBottom: 16, background: '#fef0ee', border: `1.4px solid #f3c1bd`, color: danger, fontSize: 12.5, fontWeight: 600 }}>
                      <AlertTriangle size={15} />
                      <span style={{ flex: 1 }}>{notify.text}</span>
                    </div>
                  )}

                  {/* Details Tab */}
                  {activeTab === 'Details' && (
                    <>
                      <div style={sectionLabelStyle}><span>Content</span></div>

                      <div style={{ marginBottom: 18 }}>
                        <label style={labelStyle}>Ad Title <span style={{ color: danger, fontWeight: 700 }}>*</span></label>
                        <input required type="text" value={form.title || ''}
                          onChange={(e) => setForm(p => ({ ...p, title: e.target.value }))}
                          placeholder="e.g. 20% Off Business Cards"
                          style={modalInputStyle} />
                      </div>

                      <div style={{ marginBottom: 18 }}>
                        <label style={labelStyle}>Subtitle</label>
                        <textarea
                          value={form.subtitle || ''}
                          onChange={(e) => setForm(p => ({ ...p, subtitle: e.target.value }))}
                          rows={2}
                          placeholder="One supporting line customers see under the headline..."
                          style={{ ...modalInputStyle, resize: 'none', minHeight: 52, lineHeight: 1.5 }} />
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 18 }}>
                        <div>
                          <label style={labelStyle}>Badge Label</label>
                          <input type="text" value={form.badge || ''}
                            onChange={(e) => setForm(p => ({ ...p, badge: e.target.value }))}
                            placeholder="Limited Time / New Arrival"
                            style={modalInputStyle} />
                        </div>
                        <div>
                          <label style={labelStyle}>CTA Button Text</label>
                          <input type="text" value={form.ctaLabel || ''}
                            onChange={(e) => setForm(p => ({ ...p, ctaLabel: e.target.value }))}
                            placeholder="Order Now / Learn More"
                            style={modalInputStyle} />
                        </div>
                      </div>

                      <div style={{ marginBottom: 18 }}>
                        <label style={labelStyle}>Tap Target (portal page)</label>
                        <select value={form.ctaTarget || '/portal/orders'}
                          onChange={(e) => setForm(p => ({ ...p, ctaTarget: e.target.value }))}
                          style={modalSelectStyle}>
                          {CTA_TARGETS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                        </select>
                      </div>

                      <div style={{ marginBottom: 18 }}>
                        <label style={labelStyle}>Emoji Icon</label>
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                          {EMOJI_PRESETS.map((em) => (
                            <button key={em} type="button" onClick={() => setForm(p => ({ ...p, emoji: em }))} style={{
                              width: 38, height: 38, borderRadius: 9, fontSize: 18, cursor: 'pointer',
                              border: (form.emoji || '🎯') === em ? `2px solid ${teal[500]}` : `1.4px solid ${hairline}`,
                              background: (form.emoji || '🎯') === em ? teal[50] : paper,
                              transition: 'all .12s ease',
                            }}>{em}</button>
                          ))}
                        </div>
                      </div>

                      <div style={{ marginBottom: 18 }}>
                        <label style={labelStyle}>Banner Gradient</label>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                          {GRADIENT_PRESETS.map((g) => (
                            <button key={g.name} type="button" onClick={() => setForm(p => ({ ...p, gradient: g.value }))} style={{
                              height: 44, borderRadius: 9, cursor: 'pointer', background: g.value,
                              border: (form.gradient || '') === g.value ? `2px solid ${amber[500]}` : '1px solid rgba(0,0,0,.08)',
                              position: 'relative', overflow: 'hidden',
                            }}>
                              <span style={{ position: 'absolute', bottom: 4, left: 8, fontSize: 9, fontWeight: 700, color: '#fff', textShadow: '0 1px 3px rgba(0,0,0,.5)' }}>{g.name}</span>
                            </button>
                          ))}
                        </div>
                      </div>

                      <div style={{ marginBottom: 18 }}>
                        <label style={labelStyle}>Hero Image URL (optional)</label>
                        <input type="text" value={form.imageUrl || ''}
                          onChange={(e) => setForm(p => ({ ...p, imageUrl: e.target.value }))}
                          placeholder="https://… (leave empty to use the gradient)"
                          style={modalInputStyle} />
                      </div>
                    </>
                  )}

                  {/* AI Studio Tab */}
                  {activeTab === 'AIStudio' && (
                    <>
                      <div style={sectionLabelStyle}><span>AI Studio</span></div>
                      <div style={{ padding: 14, background: violet[50], borderRadius: 9, border: `1px solid ${violet[100]}`, display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18 }}>
                        <div style={{ padding: 8, borderRadius: 8, background: violet[500], color: '#fff', display: 'inline-flex' }}>
                          <Wand2 size={18} />
                        </div>
                        <div style={{ fontSize: 12, color: inkSoft, fontWeight: 500, lineHeight: 1.5 }}>
                          Describe your offer in one line and the AI will draft a headline, subtitle, badge, CTA, emoji and banner gradient. Edit anything afterwards.
                        </div>
                      </div>

                      <div style={{ marginBottom: 18 }}>
                        <label style={labelStyle}>Your Offer / Brief</label>
                        <textarea
                          value={aiBrief}
                          onChange={(e) => { setAiBrief(e.target.value); setAiError('') }}
                          rows={3}
                          placeholder='e.g. "20% off all business cards this month for returning customers"'
                          style={{ ...modalInputStyle, resize: 'none', minHeight: 78, lineHeight: 1.5 }} />
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 18 }}>
                        <div>
                          <label style={labelStyle}>Audience</label>
                          <select value={aiAudience} onChange={(e) => setAiAudience(e.target.value)} style={modalSelectStyle}>
                            <option value="all customers">All customers</option>
                            <option value="new customers">New customers</option>
                            <option value="existing customers">Existing customers</option>
                            <option value="loyalty members">Loyalty members</option>
                            <option value="corporate clients">Corporate clients</option>
                          </select>
                        </div>
                        <div>
                          <label style={labelStyle}>Tone</label>
                          <select value={aiTone} onChange={(e) => setAiTone(e.target.value)} style={modalSelectStyle}>
                            <option value="friendly">Friendly</option>
                            <option value="professional">Professional</option>
                            <option value="urgent">Urgent / Scarcity</option>
                            <option value="premium">Premium</option>
                            <option value="festive">Festive</option>
                          </select>
                        </div>
                      </div>

                      {aiError && (
                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '10px 14px', borderRadius: 10, marginBottom: 14, background: '#fef0ee', border: `1.4px solid #f3c1bd`, color: danger, fontSize: 12.5, fontWeight: 600 }}>
                          <AlertTriangle size={15} style={{ flexShrink: 0, marginTop: 1 }} />
                          <span>{aiError}</span>
                        </div>
                      )}

                      <button type="button" onClick={runAIGenerate} disabled={aiBusy} style={{
                        width: '100%', padding: '12px 16px', borderRadius: 10, border: 'none', cursor: aiBusy ? 'default' : 'pointer',
                        background: `linear-gradient(135deg, ${violet[500]}, ${violet[700]})`, color: '#fff', fontSize: 13.5, fontWeight: 700,
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                        boxShadow: '0 8px 20px -8px rgba(124,92,240,.55)', transition: 'transform .15s ease',
                      }}
                        onMouseEnter={(e) => { if (!aiBusy) e.currentTarget.style.transform = 'translateY(-1px)' }}
                        onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)' }}
                      >
                        {aiBusy ? <Loader2 size={16} className="animate-spin" /> : <Wand2 size={16} />}
                        {aiBusy ? 'Writing your ad…' : 'Generate Ad with AI'}
                      </button>
                      <p style={{ fontSize: 10.5, color: inkSoft, marginTop: 10, lineHeight: 1.5 }}>
                        Uses your configured AI provider (OpenAI / OpenRouter / Anthropic / Ollama). Not configured? It falls back to smart templates, and you can still fine-tune everything manually.
                      </p>
                    </>
                  )}

                  {/* Schedule Tab */}
                  {activeTab === 'Schedule' && (
                    <>
                      <div style={sectionLabelStyle}><span>Schedule &amp; Status</span></div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 18 }}>
                        <div>
                          <label style={labelStyle}>Status</label>
                          <select value={form.status || 'draft'}
                            onChange={(e) => setForm(p => ({ ...p, status: e.target.value as PortalAdStatus }))}
                            style={modalSelectStyle}>
                            {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                          </select>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'flex-end', paddingBottom: 6 }}>
                          <button type="button" onClick={() => setForm(p => ({ ...p, isActive: !(p.isActive !== false) }))} style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'transparent', border: 'none', cursor: 'pointer', padding: '4px 0' }}>
                            <span style={{ width: 38, height: 21, borderRadius: 20, position: 'relative', transition: 'all .18s ease', flexShrink: 0, background: form.isActive !== false ? teal[500] : '#d6dadd' }}>
                              <span style={{ position: 'absolute', top: 2, left: form.isActive !== false ? 19 : 2, width: 17, height: 17, borderRadius: '50%', background: '#fff', transition: 'all .18s ease', boxShadow: '0 1px 3px rgba(0,0,0,.25)' }} />
                            </span>
                            <span style={{ fontSize: 12.5, fontWeight: 600, color: ink }}>Active</span>
                          </button>
                        </div>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 18 }}>
                        <div>
                          <label style={labelStyle}>Start Date / Time</label>
                          <input type="datetime-local" value={form.startsAt || ''}
                            onChange={(e) => setForm(p => ({ ...p, startsAt: e.target.value }))}
                            style={modalInputStyle} />
                        </div>
                        <div>
                          <label style={labelStyle}>End Date / Time</label>
                          <input type="datetime-local" value={form.endsAt || ''}
                            onChange={(e) => setForm(p => ({ ...p, endsAt: e.target.value }))}
                            style={modalInputStyle} />
                        </div>
                      </div>
                      <div style={{ marginBottom: 18 }}>
                        <label style={labelStyle}>Priority (higher shows first)</label>
                        <input type="number" value={form.priority || 0}
                          onChange={(e) => setForm(p => ({ ...p, priority: parseInt(e.target.value) || 0 }))}
                          placeholder="0"
                          style={modalInputStyle} />
                      </div>
                      <div style={{ padding: 14, background: teal[50], borderRadius: 9, border: `1px solid ${teal[100]}`, display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18 }}>
                        <div style={{ padding: 8, borderRadius: 8, background: teal[100], color: teal[600], display: 'inline-flex' }}>
                          <Clock size={18} />
                        </div>
                        <div style={{ fontSize: 12, color: inkSoft, fontWeight: 500, lineHeight: 1.5 }}>
                          Only ads with status <b style={{ color: teal[800] }}>active</b> (and within the date window) are served to the portal banner.
                        </div>
                      </div>
                    </>
                  )}

                  {/* Preview Tab */}
                  {activeTab === 'Preview' && (
                    <>
                      <div style={sectionLabelStyle}><span>Live Preview</span></div>
                      <p style={{ fontSize: 12, color: inkSoft, margin: '0 0 14px', lineHeight: 1.5 }}>
                        Exactly how this ad renders in the customer portal banner carousel.
                      </p>
                      <BannerPreview ad={form} />
                      <div style={{ marginTop: 16, padding: 12, borderRadius: 10, background: '#f8fafc', border: `1px solid ${hairline}`, fontSize: 11.5, color: inkSoft, lineHeight: 1.6 }}>
                        <b style={{ color: ink }}>Details</b>
                        <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 3 }}>
                          <span>Title: <b style={{ color: ink }}>{form.title || '—'}</b></span>
                          <span>Badge: <b style={{ color: ink }}>{form.badge || '—'}</b></span>
                          <span>CTA: <b style={{ color: ink }}>{form.ctaLabel || '—'}</b> → <b style={{ color: teal[700] }}>{form.ctaTarget || '/portal/orders'}</b></span>
                          <span>Emoji: <b style={{ color: ink }}>{form.emoji || '—'}</b></span>
                          <span>Priority: <b style={{ color: ink }}>{form.priority || 0}</b></span>
                        </div>
                      </div>
                    </>
                  )}

                  {/* Footer */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 26, paddingBottom: 22 }}>
                    <span style={{ fontSize: 11, color: inkSoft, fontFamily: "'JetBrains Mono', monospace" }}>
                      Step {stepNumber} of {totalSteps}
                    </span>
                    <div style={{ display: 'flex', gap: 10 }}>
                      <button type="button" onClick={() => { setShowNew(false); setEditingId(null); setForm(emptyForm()) }} style={{ padding: '10px 16px', borderRadius: 10, border: `1.4px solid ${hairline}`, fontWeight: 600, fontSize: 13, color: ink, background: 'transparent', cursor: 'pointer', lineHeight: 1.4 }}>
                        Cancel
                      </button>
                      <button type="submit" disabled={saving} style={{
                        padding: '10px 20px', borderRadius: 10, fontWeight: 600, fontSize: 13,
                        border: 'none', cursor: saving ? 'default' : 'pointer',
                        background: `linear-gradient(135deg, ${teal[500]}, ${teal[700]})`, color: '#fff', lineHeight: 1.4,
                        display: 'flex', alignItems: 'center', gap: 8,
                        boxShadow: '0 8px 20px -8px rgba(15,84,76,.55)',
                      }}>
                        {saving ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle size={15} />}
                        {saving ? 'Saving…' : (editingId ? 'Save Changes' : 'Create Ad')}
                      </button>
                    </div>
                  </div>
                </form>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete confirm ── */}
      {deleteTarget && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 10000, background: 'rgba(15,23,42,.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ background: paper, borderRadius: 14, width: '100%', maxWidth: 400, boxShadow: '0 30px 70px -20px rgba(0,0,0,.55)', padding: 22 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
              <div style={{ width: 34, height: 34, borderRadius: 9, background: 'rgba(181,73,63,.1)', color: danger, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Trash2 size={16} />
              </div>
              <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: ink }}>Delete this ad?</h3>
            </div>
            <p style={{ fontSize: 12.5, color: inkSoft, margin: '0 0 18px', lineHeight: 1.5 }}>
              "{deleteTarget.title}" will be removed from the portal banner immediately. This cannot be undone.
            </p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => setDeleteTarget(null)} style={{ padding: '9px 16px', borderRadius: 9, border: `1.4px solid ${hairline}`, fontWeight: 600, fontSize: 12.5, color: ink, background: 'transparent', cursor: 'pointer' }}>Cancel</button>
              <button onClick={confirmDelete} style={{ padding: '9px 16px', borderRadius: 9, border: 'none', fontWeight: 600, fontSize: 12.5, background: danger, color: '#fff', cursor: 'pointer' }}>Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default AdsManager
