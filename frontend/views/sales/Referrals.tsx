import React, { useMemo, useState, useEffect, useRef } from 'react'
import { Search, Award, TrendingUp, DollarSign, Clock, CheckCircle, XCircle, BarChart3, Percent, Users, RotateCw, AlertTriangle, Mail, Eye, MessageSquare, X, Gem, Trophy, Medal } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { currencyService } from '../../services/currencyService'
import { referralService } from '../../services/referralService'
import { whatsappClient } from '../../services/whatsappClientService'
import type { Referral, ReferralReward } from '../../types/referral'
import { customerRepository } from '../../services/repositories'

import type { ReferralAnalytics, ReferralCampaign, ReversalRequest } from '../../types/referral-extended'

const teal = { 50:'#eef7f6',100:'#d3ece9',200:'#a6d9d3',300:'#72c0b7',400:'#3fa294',500:'#1f8577',600:'#146b60',700:'#0f544c',800:'#0b3e39',900:'#082e2a' }
const amber = { 100:'#fbead0',300:'#eec27a',500:'#d99a3f',600:'#b97e2b' }
const paper = '#FEFDFB'
const ink = '#23282A'
const inkSoft = '#5c6567'
const hairline = '#e4ddd1'
const danger = '#b5493f'

const inputStyle: React.CSSProperties = {
  width: '100%', fontFamily: "'Inter', sans-serif", fontSize: 13.5,
  color: ink, background: paper,
  border: `1.4px solid ${hairline}`, borderRadius: 9,
  padding: '9px 12px', outline: 'none',
  transition: 'border-color .15s ease, box-shadow .15s ease, background .15s ease'
}

const labelStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 6,
  fontSize: 12, fontWeight: 600, color: teal[800],
  marginBottom: 6, letterSpacing: 0.01
}

const btnPrimaryStyle: React.CSSProperties = {
  fontFamily: "'Inter', sans-serif", fontSize: 13, fontWeight: 600,
  padding: '9px 18px', borderRadius: 9, cursor: 'pointer', border: '1.4px solid transparent',
  background: 'linear-gradient(155deg, #1f8577, #0f544c)',
  color: '#fff', display: 'flex', alignItems: 'center', gap: 7,
  boxShadow: '0 6px 16px -6px rgba(15,84,76,.55)',
  transition: 'all .15s ease'
}

const btnGhostStyle: React.CSSProperties = {
  fontFamily: "'Inter', sans-serif", fontSize: 13, fontWeight: 600,
  padding: '9px 18px', borderRadius: 9, cursor: 'pointer',
  background: paper, border: `1.4px solid ${hairline}`, color: inkSoft,
  display: 'flex', alignItems: 'center', gap: 7, transition: 'all .15s ease'
}

const cardStyle: React.CSSProperties = {
  background: paper, borderRadius: 14, border: `1px solid ${hairline}`,
  boxShadow: '0 1px 3px rgba(0,0,0,.04)'
}

const Referrals: React.FC = () => {
  const { companyConfig, user, notify } = useAuth()
  const currency = companyConfig?.currencySymbol || currencyService.getCurrency(currencyService.getBaseCurrency())?.symbol || '$'

  const [referrals, setReferrals] = useState<Referral[]>([])
  const [rewards, setRewards] = useState<ReferralReward[]>([])
  const [allRewards, setAllRewards] = useState<ReferralReward[]>([])
  const [customers, setCustomers] = useState<Array<{ id: string; name: string }>>([])
  const [searchTerm, setSearchTerm] = useState('')
  const [activeView, setActiveView] = useState<'referrals' | 'approvals' | 'analytics' | 'campaigns' | 'reversals'>('referrals')
  const [isLoading, setIsLoading] = useState(true)
  const [analytics, setAnalytics] = useState<ReferralAnalytics | null>(null)
  const [analyticsHistory, setAnalyticsHistory] = useState<ReferralAnalytics[]>([])
  const [campaigns, setCampaigns] = useState<ReferralCampaign[]>([])
  const [reversals, setReversals] = useState<ReversalRequest[]>([])
  const [selectedReferral, setSelectedReferral] = useState<Referral | null>(null)
  const [showMenu, setShowMenu] = useState(false)
  const [menuPos, setMenuPos] = useState({ x: 0, y: 0 })
  const [detailReferral, setDetailReferral] = useState<Referral | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [showCreateCampaign, setShowCreateCampaign] = useState(false)
  const [selectedMetric, setSelectedMetric] = useState<string>('All')
  const [approvalFilter, setApprovalFilter] = useState<'pending' | 'approved'>('pending')
  const [newCampaign, setNewCampaign] = useState({
    name: '', description: '', startDate: '', endDate: '',
    rewardType: 'percentage' as 'fixed' | 'percentage' | 'hybrid',
    rewardValue: 0, rewardPercentage: 5, minPurchaseAmount: 0,
    maxRewardAmount: 0, maxRewardsPerCustomer: 0, maxTotalRewards: 0,
    bonusMultiplier: 1,
  })

  const loadData = async () => {
    setIsLoading(true)
    try {
      const [allCustomers, allReferrals] = await Promise.all([
        customerRepository.getAll().then(c => c || []),
        referralService.getAllReferrals().catch(() => [] as Referral[]),
      ])
      setCustomers(allCustomers)
      setReferrals(allReferrals)
      setIsLoading(false)
      Promise.all([
        referralService.getPendingRewards().catch(() => [] as ReferralReward[]),
        referralService.getAllRewards().catch(() => []),
        referralService.getAllCampaigns().catch(() => []),
        referralService.getAnalytics({ period: 'monthly' }).catch(() => null),
        referralService.getAnalyticsHistory({ period: 'monthly' }).catch(() => []),
        referralService.getAllReversals().catch(() => []),
      ]).then(([pendingRewards, allRewards, allCampaigns, latestAnalytics, analyticsHist, allReversals]) => {
        setRewards(pendingRewards)
        setAllRewards(allRewards)
        setCampaigns(allCampaigns)
        setAnalytics(latestAnalytics)
        setAnalyticsHistory(analyticsHist)
        setReversals(allReversals)
      }).catch(() => {})
    } catch (err: any) {
      const msg = err?.message || 'Failed to load referral data'
      console.error('Failed to load referral data:', err)
      setLoadError(msg)
      notify?.(msg, 'error')
      setIsLoading(false)
    }
  }

  useEffect(() => { loadData() }, [])

  const stats = useMemo(() => ({
    total: referrals.length,
    active: referrals.filter(r => r.status === 'active' && !r.pendingInvoiceId).length,
    pendingInvoices: referrals.filter(r => r.status === 'active' && r.pendingInvoiceId).length,
    pendingInvoiceTotal: referrals.filter(r => r.status === 'active' && r.pendingInvoiceId).reduce((s, r) => s + (r.pendingInvoiceAmount || 0), 0),
    converted: referrals.filter(r => r.status === 'converted').length,
    pendingRewards: rewards.filter(r => r.status === 'pending').length,
    totalPaid: rewards.filter(r => r.status === 'paid' || r.status === 'approved').reduce((s, r) => s + r.amount, 0),
  }), [referrals, rewards])

  const filteredReferrals = useMemo(() => {
    const q = searchTerm.trim().toLowerCase()
    if (!q) return referrals
    return referrals.filter(r =>
      r.referredByName?.toLowerCase().includes(q) ||
      r.referralCode?.toLowerCase().includes(q) ||
      r.customerId?.toLowerCase().includes(q)
    )
  }, [referrals, searchTerm])

  const handleApprove = async (rewardId: string) => {
    try {
      await referralService.approveReward(rewardId, user?.name || user?.id || 'system')
      notify('Reward approved and wallet credited', 'success')
      loadData()
    } catch (err: any) {
      notify(err.message || 'Failed to approve reward', 'error')
    }
  }

  const handleReject = async (rewardId: string) => {
    const reason = prompt('Reason for rejection:')
    if (!reason) return
    try {
      await referralService.rejectReward(rewardId, reason, user?.name || user?.id)
      notify('Reward rejected', 'info')
      loadData()
    } catch (err: any) {
      notify(err.message || 'Failed to reject reward', 'error')
    }
  }

  const handleGenerateAnalytics = async (period: ReferralAnalytics['period']) => {
    const now = new Date()
    let start: Date
    if (period === 'monthly') {
      start = new Date(now.getFullYear(), now.getMonth(), 1)
    } else if (period === 'weekly') {
      start = new Date(now)
      start.setDate(start.getDate() - start.getDay())
    } else {
      start = new Date(now.getFullYear(), 0, 1)
    }
    try {
      const result = await referralService.getAnalytics({ period, period_start: start.toISOString(), period_end: now.toISOString() })
      setAnalytics(result)
      notify('Analytics generated', 'success')
      loadData()
    } catch (err: any) {
      notify(err.message || 'Failed to generate analytics', 'error')
    }
  }

  const handleCreateCampaign = async () => {
    if (!newCampaign.name || !newCampaign.startDate) {
      notify('Name and start date are required', 'error')
      return
    }
    try {
      await referralService.createCampaign({
        ...newCampaign,
        created_by: user?.name || user?.id,
      })
      notify('Campaign created', 'success')
      setShowCreateCampaign(false)
      setNewCampaign({ name: '', description: '', startDate: '', endDate: '', rewardType: 'percentage', rewardValue: 0, rewardPercentage: 5, minPurchaseAmount: 0, maxRewardAmount: 0, maxRewardsPerCustomer: 0, maxTotalRewards: 0, bonusMultiplier: 1 })
      loadData()
    } catch (err: any) {
      notify(err.message || 'Failed to create campaign', 'error')
    }
  }

  const handleApproveReversal = async (reversalId: string) => {
    if (!confirm('Approve this reversal? The reward amount will be deducted from the referrer\'s wallet.')) return
    try {
      await referralService.approveReversal(reversalId, user?.name || user?.id || 'system')
      notify('Reversal processed', 'success')
      loadData()
    } catch (err: any) {
      notify(err.message || 'Failed to process reversal', 'error')
    }
  }

  const handleRequestReversal = async () => {
    if (!selectedReferral) return
    const reason = prompt('Reason for reversal:')
    if (!reason) return
    try {
      const reward = allRewards.find(r => r.referralId === selectedReferral.id)
      if (!reward) { notify('No reward found for this referral', 'error'); return }
      await referralService.createReversal({
        reward_id: reward.id,
        reason,
      })
      notify('Reversal request submitted', 'success')
      setSelectedReferral(null)
      loadData()
    } catch (err: any) {
      notify(err.message || 'Failed to request reversal', 'error')
    }
  }

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowMenu(false)
      }
    }
    if (showMenu) document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [showMenu])

  const handleViewDetails = () => {
    if (!selectedReferral) return
    setDetailReferral(selectedReferral)
    setShowMenu(false)
  }

  const handleSendViaWhatsApp = async () => {
    if (!selectedReferral) return
    const referrer = customers.find(c => c.id === selectedReferral.referredById)
    const phone = referrer?.phone
    if (!phone) { notify('Referrer has no phone number on file', 'error'); setShowMenu(false); return }
    const reward = allRewards.find(r => r.referralId === selectedReferral.id)
    const amount = reward?.amount || selectedReferral.pendingInvoiceAmount || 0
    const msg = `The customer you referred to us has made an order. Based on the order you will have a reward of ${currency}${amount.toLocaleString()} into your account when this invoice is paid.`

    try {
      const account = await whatsappClient.getAccount(user?.id || '')
      if (!account?.phoneNumberId || !account?.accessToken) {
        notify('WhatsApp not configured. Message: ' + msg, 'info')
        setShowMenu(false)
        return
      }
      await whatsappClient.sendMessage(account.phoneNumberId, account.accessToken, phone, msg)
      notify('WhatsApp message sent', 'success')
    } catch (err: any) {
      notify(err.message || 'Failed to send WhatsApp message', 'error')
    }
    setShowMenu(false)
  }

  const handleSendViaEmail = async () => {
    if (!selectedReferral) return
    const referrer = customers.find(c => c.id === selectedReferral.referredById)
    const email = referrer?.email
    if (!email) { notify('Referrer has no email on file', 'error'); setShowMenu(false); return }
    const reward = allRewards.find(r => r.referralId === selectedReferral.id)
    const amount = reward?.amount || selectedReferral.pendingInvoiceAmount || 0
    const subject = encodeURIComponent('Referral Reward Notification')
    const body = encodeURIComponent(
      `Dear ${selectedReferral.referredByName || selectedReferral.referredById},\n\n` +
      `The customer you referred to us has made an order. Based on the order you will have a reward of ${currency}${amount.toLocaleString()} into your account when this invoice is paid.\n\n` +
      `Thank you for your support!\n${companyConfig?.companyName || 'Printing ERP'}`
    )
    window.open(`mailto:${email}?subject=${subject}&body=${body}`, '_blank')
    setShowMenu(false)
  }

  const handleRejectReversal = async (reversalId: string) => {
    const reason = prompt('Reason for rejection:')
    if (!reason) return
    try {
      await referralService.rejectReversal(reversalId, reason, user?.name || user?.id || 'system')
      notify('Reversal rejected', 'info')
      loadData()
    } catch (err: any) {
      notify(err.message || 'Failed to reject reversal', 'error')
    }
  }

  const TabButton = ({ view, label, count }: { view: typeof activeView; label: string; count?: number }) => {
    const isActive = activeView === view
    return (
      <button
        onClick={() => setActiveView(view)}
        style={{
          fontFamily: "'Inter', sans-serif",
          fontSize: 12,
          fontWeight: 600,
          padding: '8px 16px',
          borderRadius: 9,
          border: isActive ? '1.4px solid transparent' : `1.4px solid ${hairline}`,
          background: isActive ? 'linear-gradient(155deg, #1f8577, #0f544c)' : paper,
          color: isActive ? '#fff' : inkSoft,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          transition: 'all .15s ease',
          boxShadow: isActive ? '0 4px 12px -4px rgba(15,84,76,.4)' : 'none',
        }}
      >
        {label}
        {count !== undefined && count > 0 && (
          <span style={{
            padding: '1px 6px',
            background: isActive ? 'rgba(255,255,255,.25)' : amber[100],
            color: isActive ? '#fff' : amber[600],
            borderRadius: 999,
            fontSize: 9,
            fontWeight: 700,
          }}>{count}</span>
        )}
      </button>
    )
  }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: paper, overflow: 'hidden', fontFamily: "'Inter', sans-serif", fontSize: 13.5, color: ink }}>
      {/* Header */}
      <div style={{
        background: paper,
        borderBottom: `1px solid ${hairline}`,
        padding: '12px 16px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexShrink: 0,
        flexWrap: 'wrap',
        gap: 12,
      }} className="md:!px-8 md:!py-4">
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 10, fontWeight: 600, color: inkSoft, textTransform: 'uppercase', letterSpacing: 0.1, marginBottom: 4 }}>
            <span>Sales Flow</span>
            <span style={{ color: hairline }}>/</span>
            <span style={{ color: teal[500] }}>Referrals</span>
          </div>
          <h1 style={{
            fontFamily: "'DM Serif Display', 'Georgia', serif",
            fontWeight: 400,
            fontSize: 20,
            margin: 0,
            color: teal[800],
            letterSpacing: 0.2,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }} className="md:!text-[22px]">
            <Award size={24} style={{ color: amber[500] }} />
            Referral Management
          </h1>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <TabButton view="referrals" label="Referrals" />
          <TabButton view="approvals" label="Approval Queue" count={stats.pendingRewards} />
          <TabButton view="analytics" label="Analytics" />
          <TabButton view="campaigns" label="Campaigns" count={campaigns.filter(c => c.status === 'active').length} />
          <TabButton view="reversals" label="Reversals" count={reversals.filter(r => r.status === 'pending').length} />
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: 12 }} className="md:!p-6">
        <div style={{ maxWidth: 1152, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Error banner */}
          {loadError && (
            <div style={{
              background: `${danger}10`,
              border: `1px solid ${danger}30`,
              borderRadius: 14,
              padding: 16,
              display: 'flex',
              alignItems: 'flex-start',
              gap: 12,
              fontSize: 13,
              color: danger,
            }}>
              <AlertTriangle size={20} style={{ color: danger, flexShrink: 0, marginTop: 2 }} />
              <div>
                <p style={{ fontWeight: 600 }}>Referral data unavailable</p>
                <p style={{ marginTop: 4, color: danger }}>{loadError}</p>
                <p style={{ marginTop: 4, fontSize: 12, color: danger }}>
                  Check that the Supabase tables exist (run <code style={{ background: `${danger}15`, padding: '1px 4px', borderRadius: 4 }}>database/supabase-referral-tables.sql</code> in your Supabase SQL editor).
                </p>
              </div>
            </div>
          )}

          {/* Stats (Referrals tab only) */}
          {activeView === 'referrals' && (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6" style={{ gap: 8 }}>
              {[
                { key: 'total', label: 'Total Referrals', value: stats.total, icon: Award, iconBg: teal[50], iconColor: teal[500], borderColor: teal[500] },
                { key: 'active', label: 'Active', value: stats.active, icon: TrendingUp, iconBg: teal[50], iconColor: teal[500], borderColor: teal[500] },
                { key: 'pendingInvoices', label: 'Pending Invoices', value: stats.pendingInvoices, icon: Clock, iconBg: amber[100], iconColor: amber[600], borderColor: teal[500], sub: `${currency}${stats.pendingInvoiceTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}` },
                { key: 'converted', label: 'Converted', value: stats.converted, icon: CheckCircle, iconBg: teal[50], iconColor: teal[500], borderColor: teal[500] },
                { key: 'pending', label: 'Pending Rewards', value: stats.pendingRewards, icon: Clock, iconBg: amber[100], iconColor: amber[600], borderColor: teal[500] },
                { key: 'paid', label: 'Total Paid', value: null, icon: DollarSign, iconBg: teal[50], iconColor: teal[500], borderColor: teal[500], sub: `${currency}${stats.totalPaid.toLocaleString(undefined, { minimumFractionDigits: 2 })}` },
              ].map((stat) => (
                <div
                  key={stat.key}
                  onClick={() => setSelectedMetric(selectedMetric === stat.key ? 'All' : stat.key)}
                  style={{
                    cursor: 'pointer',
                    transition: 'all .2s ease',
                    background: paper,
                    padding: '8px 12px',
                    borderRadius: 14,
                    border: `1px solid ${hairline}`,
                    borderLeft: `4px solid ${stat.borderColor}`,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    ...(selectedMetric === stat.key ? { boxShadow: '0 0 0 2px teal[500]', transform: 'scale(1.01)' } : {}),
                  }}
                  onMouseEnter={e => { if (selectedMetric !== stat.key) e.currentTarget.style.background = teal[50] }}
                  onMouseLeave={e => { if (selectedMetric !== stat.key) e.currentTarget.style.background = paper }}
                >
                  <div style={{ padding: 6, background: stat.iconBg, color: stat.iconColor, borderRadius: 8 }}>
                    <stat.icon size={20} />
                  </div>
                  <div>
                    <p style={{ fontSize: 10, fontWeight: 600, color: inkSoft, textTransform: 'uppercase', letterSpacing: 0.02, lineHeight: 1, marginBottom: 2 }}>{stat.label}</p>
                    <p style={{ fontSize: 18, fontWeight: 600, color: ink, fontFamily: "'JetBrains Mono', monospace" }}>{stat.value !== null ? stat.value.toLocaleString() : ''}</p>
                    {stat.sub && <p style={{ fontSize: 10, color: inkSoft, fontWeight: 500 }}>{stat.sub}</p>}
                  </div>
                </div>
              ))}
            </div>
          )}

          {isLoading ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 48 }}>
              <div style={{ width: 32, height: 32, border: '4px solid teal[50]', borderTop: '4px solid teal[500]', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
            </div>
          ) : activeView === 'referrals' ? (
            <>
              <div style={{ position: 'relative' }}>
                <Search size={18} style={{ position: 'absolute', left: 16, top: '50%', transform: 'translateY(-50%)', color: inkSoft }} />
                <input
                  type="text"
                  placeholder="Search referrals by customer name, code..."
                  style={{
                    ...inputStyle,
                    paddingLeft: 44,
                    paddingRight: 12,
                    background: paper,
                    border: `1.4px solid ${hairline}`,
                    borderRadius: 9,
                  }}
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                />
              </div>

              {/* Action Menu Popup */}
              {showMenu && selectedReferral && (
                <div ref={menuRef} style={{
                  background: paper,
                  border: `1px solid ${hairline}`,
                  borderRadius: 14,
                  boxShadow: '0 20px 60px -20px rgba(0,0,0,.5), 0 8px 24px -8px rgba(0,0,0,.3)',
                  padding: 8,
                  position: 'fixed',
                  zIndex: 50,
                  width: 224,
                  left: Math.min(menuPos.x, window.innerWidth - 240),
                  top: Math.min(menuPos.y, window.innerHeight - 220),
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', borderBottom: `1px solid ${hairline}`, marginBottom: 4 }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: inkSoft, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{selectedReferral.customerId}</span>
                    <button onClick={() => { setShowMenu(false); setSelectedReferral(null) }} style={{ color: inkSoft, background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}><X size={14} /></button>
                  </div>
                  <button onClick={handleViewDetails} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', fontSize: 12, fontWeight: 500, color: ink, background: 'none', border: 'none', cursor: 'pointer', borderRadius: 8, transition: 'background .15s' }} onMouseEnter={e => e.currentTarget.style.background = teal[50]} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                    <Eye size={16} style={{ color: teal[500] }} /> View Details
                  </button>
                  <button onClick={handleSendViaWhatsApp} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', fontSize: 12, fontWeight: 500, color: ink, background: 'none', border: 'none', cursor: 'pointer', borderRadius: 8, transition: 'background .15s' }} onMouseEnter={e => e.currentTarget.style.background = teal[50]} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                    <MessageSquare size={16} style={{ color: teal[500] }} /> Send via WhatsApp
                  </button>
                  <button onClick={handleSendViaEmail} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', fontSize: 12, fontWeight: 500, color: ink, background: 'none', border: 'none', cursor: 'pointer', borderRadius: 8, transition: 'background .15s' }} onMouseEnter={e => e.currentTarget.style.background = teal[50]} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                    <Mail size={16} style={{ color: amber[500] }} /> Send via Email
                  </button>
                  <div style={{ borderTop: `1px solid ${hairline}`, marginTop: 4, paddingTop: 4 }}>
                    <button onClick={handleRequestReversal} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', fontSize: 12, fontWeight: 500, color: danger, background: 'none', border: 'none', cursor: 'pointer', borderRadius: 8, transition: 'background .15s' }} onMouseEnter={e => e.currentTarget.style.background = `${danger}10`} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                      <RotateCw size={16} /> Request Reversal
                    </button>
                  </div>
                </div>
              )}

              <div style={{ ...cardStyle, overflow: 'hidden', position: 'relative' }}>
                <div style={{ padding: '12px 16px', borderBottom: `1px solid ${hairline}`, background: `${teal[50]}80` }}>
                  <h3 style={{ fontFamily: "'DM Serif Display', 'Georgia', serif", fontWeight: 400, fontSize: 16, color: ink }}>All Referrals</h3>
                </div>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', textAlign: 'left', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ background: teal[50], borderBottom: `1px solid ${hairline}` }}>
                        {['Referred Customer', 'Referrer', 'Invoice', 'Amount', 'Date', 'Status'].map(h => (
                          <th key={h} style={{ padding: '8px 12px', fontWeight: 600, fontSize: 10, color: inkSoft, textTransform: 'uppercase', letterSpacing: 0.1 }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody style={{ borderTop: `1px solid ${hairline}` }}>
                      {filteredReferrals.length === 0 ? (
                        <tr>
                          <td colSpan={6} style={{ padding: '40px 12px', textAlign: 'center', color: inkSoft, fontStyle: 'italic' }}>No referrals found.</td>
                        </tr>
                      ) : (
                        filteredReferrals.map((ref) => {
                          const rewardAmt = allRewards.filter(r => r.referralId === ref.id).reduce((s, r) => s + r.amount, 0)
                          const invoiceLabel = ref.pendingInvoiceId ? `#${ref.pendingInvoiceId.slice(-8)}` : ref.convertedInvoiceId ? `#${ref.convertedInvoiceId.slice(-8)}` : '-'
                          const amountLabel = ref.pendingInvoiceAmount ? `${currency}${ref.pendingInvoiceAmount.toLocaleString()}` : rewardAmt > 0 ? `${currency}${rewardAmt.toLocaleString()}` : '-'
                          const isSelected = selectedReferral?.id === ref.id
                          const statusLabel = ref.status === 'active' && ref.pendingInvoiceId ? 'Pending' : ref.status
                          return (
                            <tr key={ref.id} onClick={e => { setSelectedReferral(ref); setMenuPos({ x: e.clientX, y: e.clientY }); setShowMenu(true) }} style={{
                              cursor: 'pointer',
                              transition: 'background .15s',
                              background: isSelected ? teal[50] : 'transparent',
                            }} onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = `${teal[50]}60` }} onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = 'transparent' }}>
                              <td style={{ padding: '8px 12px', fontWeight: 600, color: ink }}>{customers.find(c => c.id === ref.customerId)?.name || ref.customerId}</td>
                              <td style={{ padding: '8px 12px', color: inkSoft }}>{ref.referredByName || ref.referredById || '-'}</td>
                              <td style={{ padding: '8px 12px', color: inkSoft, fontFamily: "'JetBrains Mono', monospace", fontSize: 12 }}>{invoiceLabel}</td>
                              <td style={{ padding: '8px 12px', fontWeight: 700, color: teal[500] }}>{amountLabel}</td>
                              <td style={{ padding: '8px 12px', color: inkSoft }}>{new Date(ref.date).toLocaleDateString()}</td>
                              <td style={{ padding: '8px 16px' }}>
                                <span style={{
                                  display: 'inline-block',
                                  padding: '2px 8px',
                                  borderRadius: 999,
                                  fontSize: 9,
                                  fontWeight: 700,
                                  textTransform: 'uppercase',
                                  letterSpacing: 0.08,
                                  border: `1px solid ${hairline}`,
                                  background: teal[50],
                                  color: teal[700],
                                }}>{statusLabel}</span>
                              </td>
                            </tr>
                          )
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          ) : activeView === 'approvals' ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <button onClick={() => setApprovalFilter('pending')} style={{
                  fontFamily: "'Inter', sans-serif",
                  fontSize: 12,
                  fontWeight: 600,
                  padding: '8px 16px',
                  borderRadius: 9,
                  border: `1.4px solid ${approvalFilter === 'pending' ? teal[500] : hairline}`,
                  background: approvalFilter === 'pending' ? teal[500] : paper,
                  color: approvalFilter === 'pending' ? '#fff' : inkSoft,
                  cursor: 'pointer',
                  textTransform: 'uppercase',
                  letterSpacing: 0.08,
                }}>Pending ({stats.pendingRewards})</button>
                <button onClick={() => setApprovalFilter('approved')} style={{
                  fontFamily: "'Inter', sans-serif",
                  fontSize: 12,
                  fontWeight: 600,
                  padding: '8px 16px',
                  borderRadius: 9,
                  border: `1.4px solid ${approvalFilter === 'approved' ? teal[500] : hairline}`,
                  background: approvalFilter === 'approved' ? teal[500] : paper,
                  color: approvalFilter === 'approved' ? '#fff' : inkSoft,
                  cursor: 'pointer',
                  textTransform: 'uppercase',
                  letterSpacing: 0.08,
                }}>Approved & Paid</button>
              </div>

              {approvalFilter === 'pending' ? (
                <div style={{ ...cardStyle, overflow: 'hidden' }}>
                  <div style={{ padding: '12px 16px', borderBottom: `1px solid ${hairline}`, background: `${teal[50]}80` }}>
                    <h3 style={{ fontFamily: "'DM Serif Display', 'Georgia', serif", fontWeight: 400, fontSize: 16, color: ink }}>Reward Approval Queue</h3>
                  </div>
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', textAlign: 'left', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr style={{ background: teal[50], borderBottom: `1px solid ${hairline}` }}>
                          {['Date', 'Customer', 'Invoice', 'Amount', 'Actions'].map(h => (
                            <th key={h} style={{ padding: '8px 12px', fontWeight: 600, fontSize: 10, color: inkSoft, textTransform: 'uppercase', letterSpacing: 0.1 }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody style={{ borderTop: `1px solid ${hairline}` }}>
                        {rewards.length === 0 ? (
                          <tr><td colSpan={5} style={{ padding: '40px 12px', textAlign: 'center', color: inkSoft, fontStyle: 'italic' }}>No pending rewards.</td></tr>
                        ) : (
                          rewards.map((r) => (
                            <tr key={r.id} style={{ transition: 'background .15s' }} onMouseEnter={e => e.currentTarget.style.background = teal[50]} onMouseLeave={e => e.currentTarget.style.background = paper}>
                              <td style={{ padding: '8px 12px', color: inkSoft }}>{new Date(r.date).toLocaleDateString()}</td>
                              <td style={{ padding: '8px 12px', fontWeight: 600, color: ink }}>{customers.find(c => c.id === r.customerId)?.name || r.customerId}</td>
                              <td style={{ padding: '8px 12px', color: inkSoft, fontFamily: "'JetBrains Mono', monospace", fontSize: 12 }}>#{r.invoiceId?.slice(-8) || '-'}</td>
                              <td style={{ padding: '8px 12px', fontWeight: 700, color: teal[500] }}>{currency}{r.amount.toLocaleString()}</td>
                              <td style={{ padding: '8px 16px', textAlign: 'right' }}>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8 }}>
                                  <button onClick={() => handleApprove(r.id)} style={{ padding: 8, background: teal[50], color: teal[500], borderRadius: 8, border: 'none', cursor: 'pointer', transition: 'background .15s' }} onMouseEnter={e => e.currentTarget.style.background = teal[100]} onMouseLeave={e => e.currentTarget.style.background = teal[50]} title="Approve"><CheckCircle size={18} /></button>
                                  <button onClick={() => handleReject(r.id)} style={{ padding: 8, background: `${danger}15`, color: danger, borderRadius: 8, border: 'none', cursor: 'pointer', transition: 'background .15s' }} onMouseEnter={e => e.currentTarget.style.background = `${danger}25`} onMouseLeave={e => e.currentTarget.style.background = `${danger}15`} title="Reject"><XCircle size={18} /></button>
                                </div>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                <div style={{ ...cardStyle, overflow: 'hidden' }}>
                  <div style={{ padding: '12px 16px', borderBottom: `1px solid ${hairline}`, background: `${teal[50]}80` }}>
                    <h3 style={{ fontFamily: "'DM Serif Display', 'Georgia', serif", fontWeight: 400, fontSize: 16, color: ink }}>Approved Referrals</h3>
                  </div>
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', textAlign: 'left', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr style={{ background: teal[50], borderBottom: `1px solid ${hairline}` }}>
                          {['Date', 'Customer', 'Invoice', 'Amount', 'Status', 'Approved'].map(h => (
                            <th key={h} style={{ padding: '8px 12px', fontWeight: 600, fontSize: 10, color: inkSoft, textTransform: 'uppercase', letterSpacing: 0.1 }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody style={{ borderTop: `1px solid ${hairline}` }}>
                        {allRewards.filter(r => r.status === 'approved' || r.status === 'paid').length === 0 ? (
                          <tr><td colSpan={6} style={{ padding: '40px 12px', textAlign: 'center', color: inkSoft, fontStyle: 'italic' }}>No approved rewards yet.</td></tr>
                        ) : (
                          allRewards.filter(r => r.status === 'approved' || r.status === 'paid').map((r) => (
                            <tr key={r.id} style={{ transition: 'background .15s' }} onMouseEnter={e => e.currentTarget.style.background = teal[50]} onMouseLeave={e => e.currentTarget.style.background = paper}>
                              <td style={{ padding: '8px 12px', color: inkSoft }}>{new Date(r.date).toLocaleDateString()}</td>
                              <td style={{ padding: '8px 12px', fontWeight: 600, color: ink }}>{customers.find(c => c.id === r.customerId)?.name || r.customerId}</td>
                              <td style={{ padding: '8px 12px', color: inkSoft, fontFamily: "'JetBrains Mono', monospace", fontSize: 12 }}>#{r.invoiceId?.slice(-8) || '-'}</td>
                              <td style={{ padding: '8px 12px', fontWeight: 700, color: teal[500] }}>{currency}{r.amount.toLocaleString()}</td>
                              <td style={{ padding: '8px 12px' }}>
                                <span style={{
                                  display: 'inline-block',
                                  padding: '2px 8px',
                                  borderRadius: 999,
                                  fontSize: 10,
                                  fontWeight: 700,
                                  textTransform: 'uppercase',
                                  letterSpacing: 0.08,
                                  background: teal[50],
                                  color: teal[700],
                                }}>{r.status}</span>
                              </td>
                              <td style={{ padding: '8px 12px', color: inkSoft, fontSize: 12 }}>{r.approvedAt ? new Date(r.approvedAt).toLocaleDateString() : '-'}</td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          ) : activeView === 'analytics' ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <h3 style={{ fontFamily: "'DM Serif Display', 'Georgia', serif", fontWeight: 400, fontSize: 18, color: ink, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <BarChart3 size={18} style={{ color: teal[500] }} /> Referral Analytics
                </h3>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={() => handleGenerateAnalytics('weekly')} style={{ ...btnGhostStyle, padding: '6px 12px', fontSize: 12 }}>Weekly</button>
                  <button onClick={() => handleGenerateAnalytics('monthly')} style={{ ...btnPrimaryStyle, padding: '6px 12px', fontSize: 12 }}>Monthly</button>
                  <button onClick={() => handleGenerateAnalytics('yearly')} style={{ ...btnGhostStyle, padding: '6px 12px', fontSize: 12 }}>Yearly</button>
                </div>
              </div>

              {analytics ? (
                <>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
                    {[
                      { key: 'Conversion Rate', label: 'Conversion Rate', value: `${analytics.conversionRate.toLocaleString(undefined, { minimumFractionDigits: 2 })}%`, icon: Percent, iconBg: teal[50], iconColor: teal[500], borderColor: teal[500] },
                      { key: 'Total Rewards', label: 'Total Rewards', value: `${currency}${analytics.totalRewardsAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}`, icon: Users, iconBg: amber[100], iconColor: amber[600], borderColor: teal[500] },
                      { key: 'Revenue Attributed', label: 'Revenue Attributed', value: `${currency}${analytics.revenueAttributed.toLocaleString(undefined, { minimumFractionDigits: 2 })}`, icon: DollarSign, iconBg: teal[50], iconColor: teal[500], borderColor: teal[500] },
                      { key: 'ROI', label: 'ROI', value: `${analytics.roi.toLocaleString(undefined, { minimumFractionDigits: 2 })}%`, icon: BarChart3, iconBg: teal[50], iconColor: teal[500], borderColor: teal[500] },
                    ].map((stat) => (
                      <div
                        key={stat.key}
                        onClick={() => setSelectedMetric(selectedMetric === stat.key ? 'All' : stat.key)}
                        style={{
                          cursor: 'pointer',
                          transition: 'all .2s ease',
                          background: paper,
                          padding: '8px 12px',
                          borderRadius: 14,
                          border: `1px solid ${hairline}`,
                          borderLeft: `4px solid ${stat.borderColor}`,
                          display: 'flex',
                          alignItems: 'center',
                          gap: 8,
                          ...(selectedMetric === stat.key ? { boxShadow: '0 0 0 2px teal[500]', transform: 'scale(1.01)' } : {}),
                        }}
                        onMouseEnter={e => { if (selectedMetric !== stat.key) e.currentTarget.style.background = teal[50] }}
                        onMouseLeave={e => { if (selectedMetric !== stat.key) e.currentTarget.style.background = paper }}
                      >
                        <div style={{ padding: 6, background: stat.iconBg, color: stat.iconColor, borderRadius: 8 }}>
                          <stat.icon size={20} />
                        </div>
                        <div>
                          <p style={{ fontSize: 10, fontWeight: 600, color: inkSoft, textTransform: 'uppercase', letterSpacing: 0.02, lineHeight: 1, marginBottom: 4 }}>{stat.label}</p>
                          <p style={{ fontSize: 18, fontWeight: 600, color: ink, fontFamily: "'JetBrains Mono', monospace" }}>{stat.value}</p>
                        </div>
                      </div>
                    ))}
                  </div>

                  {analytics.topReferrers && analytics.topReferrers.length > 0 && (
                    <div style={{ ...cardStyle, overflow: 'hidden' }}>
                      <div style={{ padding: '12px 16px', borderBottom: `1px solid ${hairline}`, background: `${teal[50]}80` }}>
                        <h3 style={{ fontFamily: "'DM Serif Display', 'Georgia', serif", fontWeight: 400, fontSize: 16, color: ink, display: 'flex', alignItems: 'center', gap: 8 }}>
                          <Users size={16} style={{ color: teal[500] }} /> Top Referrers
                        </h3>
                      </div>
                      <div style={{ padding: 16, display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16 }}>
                        {analytics.topReferrers.map((t, i) => {
                          const rank = i + 1
                          return (
                            <div key={t.customerId || i} style={{
                              background: paper,
                              border: `1px solid ${hairline}`,
                              borderLeft: `4px solid ${teal[500]}`,
                              borderRadius: 14,
                              padding: 20,
                              display: 'flex',
                              flexDirection: 'column',
                              alignItems: 'center',
                              textAlign: 'center',
                              transition: 'all .3s ease',
                            }}
                              onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 8px 24px -8px rgba(0,0,0,.12)' }}
                              onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = 'none' }}
                            >
                              {rank <= 3 && (
                                <span style={{
                                  position: 'absolute',
                                  top: 12,
                                  right: 12,
                                  fontSize: 9,
                                  fontWeight: 700,
                                  color: teal[500],
                                  textTransform: 'uppercase',
                                  letterSpacing: 0.1,
                                }}>#{rank}</span>
                              )}
                              <div style={{ padding: 10, background: teal[50], borderRadius: 12, marginBottom: 12 }}>
                                <Users size={24} style={{ color: teal[500] }} />
                              </div>
                              <p style={{ fontWeight: 600, fontSize: 13, lineHeight: 1.3, color: ink }}>{t.customerName || t.customerId}</p>
                              <p style={{ fontSize: 9, fontWeight: 700, color: teal[500], textTransform: 'uppercase', letterSpacing: 0.1, marginTop: 4 }}>Top Referrer</p>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 12, paddingTop: 12, borderTop: `1px solid ${hairline}`, width: '100%', justifyContent: 'center' }}>
                                <span style={{ fontSize: 11, fontWeight: 500, color: inkSoft }}>{t.referralCount} referrals</span>
                                <span style={{ width: 1, height: 12, background: hairline }} />
                                <span style={{ fontSize: 11, fontWeight: 700, color: teal[500], fontFamily: "'JetBrains Mono', monospace" }}>{currency}{(t.rewardsAmount || 0).toLocaleString()}</span>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}

                  {analyticsHistory.length > 0 && (
                    <div style={{ ...cardStyle, overflow: 'hidden' }}>
                      <div style={{ padding: '12px 16px', borderBottom: `1px solid ${hairline}`, background: `${teal[50]}80` }}>
                        <h3 style={{ fontFamily: "'DM Serif Display', 'Georgia', serif", fontWeight: 400, fontSize: 16, color: ink }}>Analytics History</h3>
                      </div>
                      <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', textAlign: 'left', borderCollapse: 'collapse' }}>
                          <thead>
                            <tr style={{ background: teal[50], borderBottom: `1px solid ${hairline}` }}>
                              {['Period', 'Referrals', 'Converted', 'Rate', 'Rewards', 'ROI'].map(h => (
                                <th key={h} style={{ padding: '8px 12px', fontWeight: 600, fontSize: 10, color: inkSoft, textTransform: 'uppercase', letterSpacing: 0.1 }}>{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody style={{ borderTop: `1px solid ${hairline}` }}>
                            {analyticsHistory.map(a => (
                              <tr key={a.id} style={{ transition: 'background .15s' }} onMouseEnter={e => e.currentTarget.style.background = teal[50]} onMouseLeave={e => e.currentTarget.style.background = paper}>
                                <td style={{ padding: '8px 12px', fontWeight: 600, color: ink }}>{new Date(a.periodStart).toLocaleDateString()} - {new Date(a.periodEnd).toLocaleDateString()}</td>
                                <td style={{ padding: '8px 12px', color: inkSoft, fontFamily: "'JetBrains Mono', monospace" }}>{a.totalReferrals}</td>
                                <td style={{ padding: '8px 12px', color: inkSoft, fontFamily: "'JetBrains Mono', monospace" }}>{a.convertedReferrals}</td>
                                <td style={{ padding: '8px 12px', fontWeight: 600, color: ink, fontFamily: "'JetBrains Mono', monospace" }}>{a.conversionRate}%</td>
                                <td style={{ padding: '8px 12px', fontWeight: 700, color: teal[500], fontFamily: "'JetBrains Mono', monospace" }}>{currency}{a.totalRewardsAmount.toLocaleString()}</td>
                                <td style={{ padding: '8px 12px', fontWeight: 600, color: ink, fontFamily: "'JetBrains Mono', monospace" }}>{a.roi}%</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <div style={{ ...cardStyle, padding: 48, textAlign: 'center' }}>
                  <BarChart3 size={48} style={{ color: inkSoft, margin: '0 auto 16px' }} />
                  <p style={{ color: inkSoft, fontWeight: 500 }}>No analytics data yet. Generate a report to see insights.</p>
                </div>
              )}
            </div>
          ) : activeView === 'campaigns' ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <h3 style={{ fontFamily: "'DM Serif Display', 'Georgia', serif", fontWeight: 400, fontSize: 18, color: ink, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Award size={18} style={{ color: amber[500] }} /> Referral Campaigns
                </h3>
                <button onClick={() => setShowCreateCampaign(!showCreateCampaign)} style={{
                  ...btnPrimaryStyle,
                  padding: '8px 16px',
                  fontSize: 12,
                }}>
                  {showCreateCampaign ? 'Cancel' : 'New Campaign'}
                </button>
              </div>

              {showCreateCampaign && (
                <div style={{ ...cardStyle, padding: 24 }}>
                  <h4 style={{ fontFamily: "'DM Serif Display', 'Georgia', serif", fontWeight: 400, fontSize: 16, color: ink, marginBottom: 16 }}>New Campaign</h4>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
                    <div>
                      <label style={labelStyle}>Name *</label>
                      <input type="text" style={inputStyle} value={newCampaign.name} onChange={e => setNewCampaign({ ...newCampaign, name: e.target.value })} />
                    </div>
                    <div>
                      <label style={labelStyle}>Reward Type</label>
                      <select style={{ ...inputStyle, appearance: 'none', backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%235c6567'/%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 12px center', paddingRight: 30, cursor: 'pointer' }} value={newCampaign.rewardType} onChange={e => setNewCampaign({ ...newCampaign, rewardType: e.target.value as any })}>
                        <option value="fixed">Fixed</option>
                        <option value="percentage">Percentage</option>
                        <option value="hybrid">Hybrid</option>
                      </select>
                    </div>
                    <div>
                      <label style={labelStyle}>Start Date *</label>
                      <input type="date" style={inputStyle} value={newCampaign.startDate} onChange={e => setNewCampaign({ ...newCampaign, startDate: e.target.value })} />
                    </div>
                    <div>
                      <label style={labelStyle}>End Date</label>
                      <input type="date" style={inputStyle} value={newCampaign.endDate} onChange={e => setNewCampaign({ ...newCampaign, endDate: e.target.value })} />
                    </div>
                    <div>
                      <label style={labelStyle}>Reward Value</label>
                      <input type="number" style={inputStyle} value={newCampaign.rewardValue} onChange={e => setNewCampaign({ ...newCampaign, rewardValue: parseFloat(e.target.value) || 0 })} />
                    </div>
                    <div>
                      <label style={labelStyle}>Reward %</label>
                      <input type="number" style={inputStyle} value={newCampaign.rewardPercentage} onChange={e => setNewCampaign({ ...newCampaign, rewardPercentage: parseFloat(e.target.value) || 0 })} />
                    </div>
                    <div>
                      <label style={labelStyle}>Bonus Multiplier</label>
                      <input type="number" step="0.1" min="1" style={inputStyle} value={newCampaign.bonusMultiplier} onChange={e => setNewCampaign({ ...newCampaign, bonusMultiplier: parseFloat(e.target.value) || 1 })} />
                    </div>
                    <div>
                      <label style={labelStyle}>Min Purchase</label>
                      <input type="number" style={inputStyle} value={newCampaign.minPurchaseAmount} onChange={e => setNewCampaign({ ...newCampaign, minPurchaseAmount: parseFloat(e.target.value) || 0 })} />
                    </div>
                  </div>
                  <div style={{ marginBottom: 16 }}>
                    <label style={labelStyle}>Description</label>
                    <textarea style={{ ...inputStyle, resize: 'none', minHeight: 66 }} rows={2} value={newCampaign.description} onChange={e => setNewCampaign({ ...newCampaign, description: e.target.value })} />
                  </div>
                  <button onClick={handleCreateCampaign} style={{ ...btnPrimaryStyle }}>Create Campaign</button>
                </div>
              )}

              <div style={{ ...cardStyle, overflow: 'hidden' }}>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', textAlign: 'left', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ background: teal[50], borderBottom: `1px solid ${hairline}` }}>
                        {['Name', 'Status', 'Dates', 'Reward', 'Given / Max', 'Actions'].map(h => (
                          <th key={h} style={{ padding: '8px 12px', fontWeight: 600, fontSize: 10, color: inkSoft, textTransform: 'uppercase', letterSpacing: 0.1 }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody style={{ borderTop: `1px solid ${hairline}` }}>
                      {campaigns.length === 0 ? (
                        <tr><td colSpan={6} style={{ padding: '40px 12px', textAlign: 'center', color: inkSoft, fontStyle: 'italic' }}>No campaigns created yet.</td></tr>
                      ) : (
                        campaigns.map(c => {
                          const statusLabel = c.status === 'active' ? 'Active' : c.status === 'draft' ? 'Draft' : c.status === 'paused' ? 'Paused' : 'Completed'
                          const statusColor = c.status === 'active' ? teal[500] : c.status === 'draft' ? inkSoft : c.status === 'paused' ? amber[500] : teal[500]
                          const statusBg = c.status === 'active' ? teal[50] : c.status === 'draft' ? `${hairline}30` : c.status === 'paused' ? amber[100] : teal[50]
                          const statusBorder = c.status === 'active' ? teal[100] : c.status === 'draft' ? hairline : c.status === 'paused' ? amber[100] : teal[100]
                          return (
                            <tr key={c.id} style={{ transition: 'background .15s' }} onMouseEnter={e => e.currentTarget.style.background = teal[50]} onMouseLeave={e => e.currentTarget.style.background = paper}>
                              <td style={{ padding: '8px 12px', fontWeight: 600, color: ink }}>{c.name}</td>
                              <td style={{ padding: '8px 16px' }}>
                                <span style={{
                                  display: 'inline-block',
                                  padding: '2px 8px',
                                  borderRadius: 999,
                                  fontSize: 9,
                                  fontWeight: 700,
                                  textTransform: 'uppercase',
                                  letterSpacing: 0.08,
                                  background: statusBg,
                                  color: statusColor,
                                  border: `1px solid ${statusBorder}`,
                                }}>{statusLabel}</span>
                              </td>
                              <td style={{ padding: '8px 12px', color: inkSoft, fontSize: 12 }}>{new Date(c.startDate).toLocaleDateString()}{c.endDate ? ` - ${new Date(c.endDate).toLocaleDateString()}` : ''}</td>
                              <td style={{ padding: '8px 12px', fontWeight: 600, color: ink }}>{c.rewardType === 'fixed' ? currency + c.rewardValue : c.rewardType === 'percentage' ? `${c.rewardPercentage}%` : `${currency + c.rewardValue} + ${c.rewardPercentage}%`}{c.bonusMultiplier && c.bonusMultiplier > 1 ? ` x${c.bonusMultiplier}` : ''}</td>
                              <td style={{ padding: '8px 12px', color: inkSoft }}>{c.totalRewardsGiven} / {c.maxTotalRewards || '∞'}</td>
                              <td style={{ padding: '8px 16px' }}>
                                <div style={{ display: 'flex', gap: 4 }}>
                                  {c.status === 'draft' && <button onClick={async () => { await referralService.updateCampaignStatus(c.id, 'active'); loadData(); notify('Campaign activated', 'success'); }} style={{ padding: '4px 8px', background: teal[50], color: teal[500], borderRadius: 6, border: 'none', fontSize: 10, fontWeight: 600, cursor: 'pointer', transition: 'background .15s' }} onMouseEnter={e => e.currentTarget.style.background = teal[100]} onMouseLeave={e => e.currentTarget.style.background = teal[50]}>Activate</button>}
                                  {c.status === 'active' && <button onClick={async () => { await referralService.updateCampaignStatus(c.id, 'paused'); loadData(); }} style={{ padding: '4px 8px', background: amber[100], color: amber[600], borderRadius: 6, border: 'none', fontSize: 10, fontWeight: 600, cursor: 'pointer', transition: 'background .15s' }} onMouseEnter={e => e.currentTarget.style.background = amber[300]} onMouseLeave={e => e.currentTarget.style.background = amber[100]}>Pause</button>}
                                  {c.status === 'paused' && <button onClick={async () => { await referralService.updateCampaignStatus(c.id, 'active'); loadData(); }} style={{ padding: '4px 8px', background: teal[50], color: teal[500], borderRadius: 6, border: 'none', fontSize: 10, fontWeight: 600, cursor: 'pointer', transition: 'background .15s' }} onMouseEnter={e => e.currentTarget.style.background = teal[100]} onMouseLeave={e => e.currentTarget.style.background = teal[50]}>Resume</button>}
                                  {(c.status === 'active' || c.status === 'paused') && <button onClick={async () => { await referralService.updateCampaignStatus(c.id, 'completed'); loadData(); }} style={{ padding: '4px 8px', background: `${danger}15`, color: danger, borderRadius: 6, border: 'none', fontSize: 10, fontWeight: 600, cursor: 'pointer', transition: 'background .15s' }} onMouseEnter={e => e.currentTarget.style.background = `${danger}25`} onMouseLeave={e => e.currentTarget.style.background = `${danger}15`}>End</button>}
                                </div>
                              </td>
                            </tr>
                          )
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
              <h3 style={{ fontFamily: "'DM Serif Display', 'Georgia', serif", fontWeight: 400, fontSize: 18, color: ink, display: 'flex', alignItems: 'center', gap: 8 }}>
                <RotateCw size={18} style={{ color: danger }} /> Reward Reversals
              </h3>

              <div style={{ ...cardStyle, overflow: 'hidden' }}>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', textAlign: 'left', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ background: teal[50], borderBottom: `1px solid ${hairline}` }}>
                        {['Date', 'Reason', 'Requested By', 'Status', 'Actions'].map(h => (
                          <th key={h} style={{ padding: '8px 12px', fontWeight: 600, fontSize: 10, color: inkSoft, textTransform: 'uppercase', letterSpacing: 0.1 }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody style={{ borderTop: `1px solid ${hairline}` }}>
                      {reversals.length === 0 ? (
                        <tr><td colSpan={5} style={{ padding: '40px 12px', textAlign: 'center', color: inkSoft, fontStyle: 'italic' }}>No reversals recorded.</td></tr>
                      ) : (
                        reversals.map(r => {
                          const statusLabel = r.status === 'pending' ? 'Pending' : r.status === 'completed' ? 'Completed' : r.status === 'rejected' ? 'Rejected' : r.status
                          const statusColor = r.status === 'pending' ? amber[600] : r.status === 'completed' ? danger : r.status === 'rejected' ? inkSoft : teal[500]
                          const statusBg = r.status === 'pending' ? amber[100] : r.status === 'completed' ? `${danger}15` : r.status === 'rejected' ? `${hairline}30` : teal[50]
                          const statusBorder = r.status === 'pending' ? amber[100] : r.status === 'completed' ? `${danger}30` : r.status === 'rejected' ? hairline : teal[100]
                          return (
                            <tr key={r.id} style={{ transition: 'background .15s' }} onMouseEnter={e => e.currentTarget.style.background = teal[50]} onMouseLeave={e => e.currentTarget.style.background = paper}>
                              <td style={{ padding: '8px 12px', color: inkSoft }}>{new Date(r.requestedAt).toLocaleDateString()}</td>
                              <td style={{ padding: '8px 12px', color: ink, fontWeight: 500 }}>{r.reason}</td>
                              <td style={{ padding: '8px 12px', color: inkSoft }}>{r.requestedBy}</td>
                              <td style={{ padding: '8px 16px' }}>
                                <span style={{
                                  display: 'inline-block',
                                  padding: '2px 8px',
                                  borderRadius: 999,
                                  fontSize: 9,
                                  fontWeight: 700,
                                  textTransform: 'uppercase',
                                  letterSpacing: 0.08,
                                  background: statusBg,
                                  color: statusColor,
                                  border: `1px solid ${statusBorder}`,
                                }}>{statusLabel}</span>
                              </td>
                              <td style={{ padding: '8px 16px', textAlign: 'right' }}>
                                {r.status === 'pending' && (
                                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8 }}>
                                    <button onClick={() => handleApproveReversal(r.id)} style={{ padding: 8, background: teal[50], color: teal[500], borderRadius: 8, border: 'none', cursor: 'pointer', transition: 'background .15s' }} onMouseEnter={e => e.currentTarget.style.background = teal[100]} onMouseLeave={e => e.currentTarget.style.background = teal[50]} title="Approve"><CheckCircle size={18} /></button>
                                    <button onClick={() => handleRejectReversal(r.id)} style={{ padding: 8, background: `${danger}15`, color: danger, borderRadius: 8, border: 'none', cursor: 'pointer', transition: 'background .15s' }} onMouseEnter={e => e.currentTarget.style.background = `${danger}25`} onMouseLeave={e => e.currentTarget.style.background = `${danger}15`} title="Reject"><XCircle size={18} /></button>
                                  </div>
                                )}
                              </td>
                            </tr>
                          )
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* Detail Modal */}
          {detailReferral && (
            <div style={{
              position: 'fixed', inset: 0, zIndex: 50,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'rgba(35, 40, 42, 0.2)',
              backdropFilter: 'blur(4px)',
            }} onClick={() => setDetailReferral(null)}>
              <div style={{
                background: paper,
                borderRadius: 14,
                border: `1px solid ${hairline}`,
                boxShadow: '0 30px 70px -20px rgba(0,0,0,.55), 0 8px 24px -8px rgba(0,0,0,.35)',
                width: '100%', maxWidth: 480, margin: '0 16px',
                padding: 24,
              }} onClick={e => e.stopPropagation()}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                  <h3 style={{ fontFamily: "'DM Serif Display', 'Georgia', serif", fontWeight: 400, fontSize: 18, color: ink }}>Referral Details</h3>
                  <button onClick={() => setDetailReferral(null)} style={{ padding: 8, color: inkSoft, background: 'none', border: 'none', cursor: 'pointer', borderRadius: 8, transition: 'background .15s' }} onMouseEnter={e => e.currentTarget.style.background = teal[50]} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                    <X size={18} />
                  </button>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13 }}>
                  {[
                    { label: 'Referred Customer', value: detailReferral.customerId },
                    { label: 'Referrer', value: detailReferral.referredByName || detailReferral.referredById || '-' },
                    { label: 'Referral Code', value: detailReferral.referralCode || '-' },
                    { label: 'Status', value: detailReferral.status === 'active' && detailReferral.pendingInvoiceId ? 'Pending' : detailReferral.status, isBadge: true, badgeBg: teal[50], badgeColor: teal[700], badgeBorder: teal[100] },
                    { label: 'Invoice', value: `#${detailReferral.pendingInvoiceId?.slice(-8) || detailReferral.convertedInvoiceId?.slice(-8) || '-'}` },
                    { label: 'Amount', value: detailReferral.pendingInvoiceAmount ? currency + detailReferral.pendingInvoiceAmount.toLocaleString() : currency + allRewards.filter(r => r.referralId === detailReferral.id).reduce((s, r) => s + r.amount, 0).toLocaleString() || '-', isAmount: true },
                    { label: 'Date', value: new Date(detailReferral.date).toLocaleDateString() },
                    { label: 'Reward Amount', value: currency + allRewards.filter(r => r.referralId === detailReferral.id).reduce((s, r) => s + r.amount, 0).toLocaleString(), isAmount: true },
                  ].map((row, idx) => (
                    <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: idx < 7 ? `1px solid ${hairline}` : 'none' }}>
                      <span style={{ color: inkSoft, fontWeight: 500 }}>{row.label}</span>
                      {row.isBadge ? (
                        <span style={{ padding: '2px 8px', borderRadius: 999, fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.08, background: row.badgeBg, color: row.badgeColor, border: `1px solid ${row.badgeBorder}` }}>{row.value}</span>
                      ) : row.isAmount ? (
                        <span style={{ fontWeight: 700, color: teal[500], fontFamily: "'JetBrains Mono', monospace" }}>{row.value}</span>
                      ) : (
                        <span style={{ fontWeight: 600, color: ink, fontFamily: row.label === 'Referral Code' ? "'JetBrains Mono', monospace" : 'inherit', fontSize: row.label === 'Referral Code' ? 12 : 13 }}>{row.value}</span>
                      )}
                    </div>
                  ))}
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 24 }}>
                  <button onClick={() => setDetailReferral(null)} style={{ ...btnGhostStyle, padding: '10px 24px' }}>Close</button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default Referrals