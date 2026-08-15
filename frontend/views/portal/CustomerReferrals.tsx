import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { Users, UserPlus, Gift, Clock, CheckCircle2, Wallet, TrendingUp, Search, Filter, ChevronDown, X, ArrowRight, Copy, ExternalLink, Share2 } from 'lucide-react';
import { portalLifecycle, PortalReferral, PortalReferralReward, PortalReferralSettings, PortalReferralTimelineEntry, PortalCustomerSearchResult } from '../../services/portalApiClient';
import { useNavigate } from 'react-router-dom';
import { useCustomerAuth } from '../../context/CustomerAuthContext';
import { useToast } from './components/Toast';
import EmptyState from './components/EmptyState';
import PortalLoadingSkeleton from './components/PortalLoadingSkeleton';
import StatusBadge from './components/StatusBadge';
import { F, MONO, NAVY, TEAL_GRADIENT, EMERALD } from './designTokens';


type Tab = 'referrals' | 'rewards';
type ReferralStatus = 'all' | 'active' | 'converted' | 'expired' | 'cancelled';

const statusLabel: Record<string, string> = {
  active: 'Active',
  converted: 'Converted',
  expired: 'Expired',
  cancelled: 'Cancelled',
  pending: 'Pending',
  approved: 'Approved',
  paid: 'Paid',
};

const referralBadgeConfig: Record<string, { label: string; bg: string; text: string }> = {
  pending: { label: 'PENDING', bg: '#F1F5F9', text: '#64748B' },
  signed_up: { label: 'SIGNED UP', bg: '#EFF6FF', text: '#2563EB' },
  completed: { label: 'COMPLETED', bg: '#ECFDF5', text: '#059669' },
  active: { label: 'ACTIVE', bg: '#EFF6FF', text: '#2563EB' },
  converted: { label: 'CONVERTED', bg: '#ECFDF5', text: '#059669' },
  expired: { label: 'EXPIRED', bg: '#F1F5F9', text: '#64748B' },
  cancelled: { label: 'CANCELLED', bg: '#FEF2F2', text: '#DC2626' },
};

const CustomerReferrals: React.FC = () => {
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>('referrals');
  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState<PortalReferralSettings | null>(null);
  const [funnel, setFunnel] = useState<any>(null);
  const [referrals, setReferrals] = useState<PortalReferral[]>([]);
  const [rewards, setRewards] = useState<PortalReferralReward[]>([]);
  const [referralSearch, setReferralSearch] = useState('');
  const [referralStatus, setReferralStatus] = useState<ReferralStatus>('all');
  const [referralPage, setReferralPage] = useState(1);
  const [referralTotalPages, setReferralTotalPages] = useState(1);
  const [rewardStatus, setRewardStatus] = useState<string>('');
  const [rewardPage, setRewardPage] = useState(1);
  const [rewardTotalPages, setRewardTotalPages] = useState(1);
  const [showReferModal, setShowReferModal] = useState(false);
  const [referSearch, setReferSearch] = useState('');
  const [referResults, setReferResults] = useState<PortalCustomerSearchResult[]>([]);
  const [referSelected, setReferSelected] = useState<PortalCustomerSearchResult | null>(null);
  const [referNotes, setReferNotes] = useState('');
  const [referCompany, setReferCompany] = useState('');
  const [referSubmitting, setReferSubmitting] = useState(false);
  const [detailReferral, setDetailReferral] = useState<PortalReferral | null>(null);
  const [timeline, setTimeline] = useState<PortalReferralTimelineEntry[]>([]);
  const [timelineLoading, setTimelineLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { user } = useCustomerAuth();
  const { addToast } = useToast();

  const pageSize = 20;

  const loadSettings = async () => {
    try {
      const s = await portalLifecycle.referrals.settings();
      setSettings(s || null);
    } catch { setSettings(null); }
  };

  const loadFunnel = async () => {
    try {
      const f = await portalLifecycle.referrals.stats();
      setFunnel(f || null);
    } catch { setFunnel(null); }
  };

  const loadReferrals = async () => {
    try {
      const data = await portalLifecycle.referrals.list({
        page: referralPage,
        pageSize,
        status: referralStatus === 'all' ? undefined : referralStatus,
        search: referralSearch || undefined,
        sort: 'date_desc',
      });
      setReferrals(data.referrals.length > 0 ? data.referrals : []);
      setReferralTotalPages(data.totalPages || 1);
    } catch (err: any) {
      setError(err.message || 'Failed to load referrals');
      setReferrals([]);
    }
  };

  const loadRewards = async () => {
    try {
      const data = await portalLifecycle.referrals.rewards({
        page: rewardPage,
        pageSize,
        status: rewardStatus || undefined,
      });
      setRewards(data.rewards.length > 0 ? data.rewards : []);
      setRewardTotalPages(data.totalPages || 1);
    } catch (err: any) {
      setError(err.message || 'Failed to load rewards');
      setRewards([]);
    }
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      await Promise.all([loadSettings(), loadFunnel(), loadReferrals(), loadRewards()]);
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [referralPage, rewardPage]);

  useEffect(() => {
    setReferralPage(1);
  }, [referralStatus, referralSearch]);

  useEffect(() => {
    if (tab === 'referrals') loadReferrals();
    else loadRewards();
  }, [tab]);

  const handleReferSearch = async () => {
    if (referSearch.trim().length < 2) return;
    const results = await portalLifecycle.referrals.searchCustomers(referSearch.trim());
    setReferResults(results);
  };

  const handleReferSubmit = async () => {
    if (!referSelected) return;
    setReferSubmitting(true);
    try {
      const companyNote = referCompany ? `\nCompany: ${referCompany}` : '';
      await portalLifecycle.referrals.create({
        referredCustomerId: referSelected.id,
        notes: referNotes ? `${referNotes}${companyNote}` : (companyNote || undefined),
      });
      setShowReferModal(false);
      setReferSearch('');
      setReferResults([]);
      setReferSelected(null);
      setReferNotes('');
      setReferCompany('');
      loadReferrals();
      loadFunnel();
    } catch (err: any) {
      setError(err.message || 'Failed to create referral');
    } finally {
      setReferSubmitting(false);
    }
  };

  const handleCopyReferralLink = useCallback(() => {
    const referralCode = user?.id || '';
    const link = `${window.location.origin}/#/portal/referrals?ref=${referralCode}`;
    navigator.clipboard.writeText(link).then(() => {
      addToast('success', 'Referral link copied to clipboard!');
    }).catch(() => {
      addToast('error', 'Failed to copy link');
    });
  }, [user?.id, addToast]);

  const handleShareWhatsApp = useCallback(() => {
    const message = `I highly recommend *Prime Printing* for quality, affordable, and reliable printing services.\n\nSimply *mention that you were referred by an existing customer*, and you'll receive a *discount on your first order*.\n\nGive them a try—you won't be disappointed!`;
    const url = `https://wa.me/?text=${encodeURIComponent(message)}`;
    window.open(url, '_blank');
  }, []);

  const openDetail = async (referral: PortalReferral) => {
    setDetailReferral(referral);
    setTimelineLoading(true);
    try {
      const entries = await portalLifecycle.referrals.timeline(referral.id);
      setTimeline(entries);
    } catch {
      setTimeline([]);
    } finally {
      setTimelineLoading(false);
    }
  };

  const funnelStages = useMemo(() => {
    if (!funnel) return [];
    return [
      { label: 'Invited', value: funnel.total, icon: Users, color: '#0D5047' },
      { label: 'Qualified', value: funnel.qualified, icon: CheckCircle2, color: '#DD6B20' },
      { label: 'Paid', value: funnel.paid, icon: Wallet, color: '#0D5047' },
    ];
  }, [funnel]);

  const rewardStatusColor: Record<string, { bg: string; text: string }> = {
    pending: { bg: 'bg-amber-100', text: 'text-amber-700' },
    approved: { bg: 'bg-emerald-100', text: 'text-emerald-700' },
    paid: { bg: 'bg-emerald-100', text: 'text-emerald-700' },
    cancelled: { bg: 'bg-rose-100', text: 'text-rose-700' },
  };

  const totalEarned = useMemo(() => funnel?.totalEarned || 0, [funnel]);
  const pendingReferralsCount = useMemo(() => {
    if (!referrals.length) return 0;
    return referrals.filter(r => ['pending', 'active', 'signed_up'].includes(r.status.toLowerCase())).length;
  }, [referrals]);

  const primaryContainer = {
    background: '#EFF6FF',
    border: '1px solid #BFDBFE',
    borderRadius: 12,
  } as React.CSSProperties;

  const tertiaryContainer = {
    background: '#ECFDF5',
    border: '1px solid #A7F3D0',
    borderRadius: 12,
  } as React.CSSProperties;

  if (loading) return <div className="p-6"><PortalLoadingSkeleton type="card" count={4} /></div>;

  return (
    <div>
      {error && (
        <div style={{ padding: '0 28px', marginTop: 16 }}>
          <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', borderRadius: 12, padding: '12px 16px', fontSize: 13 }}>
            {error}
          </div>
        </div>
      )}

      {/* Header */}
      <div style={{ padding: '0 28px 16px' }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: '#0F172A', margin: '0 0 6px', letterSpacing: '-0.01em', lineHeight: 1.3 }}>Customer Referral Partner Program</h1>
        <p style={{ fontSize: 13, fontWeight: 500, color: '#64748B', margin: 0, lineHeight: 1.5 }}>Earn up to $150 in account statement credit for every referred company that completes an order.</p>
      </div>

      {/* Metrics */}
      {settings?.enabled && (
        <div style={{ padding: '0 28px 16px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
            <div style={{ background: '#ECFDF5', borderRadius: 10, padding: '14px 16px', border: '1px solid #A7F3D0', transition: 'all 200ms cubic-bezier(.4,0,.2,1)' }}
              onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 8px 24px -8px rgba(15,23,42,0.14)'; e.currentTarget.style.borderColor = 'rgba(5,150,105,0.28)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.borderColor = '#A7F3D0'; }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#059669', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>Earned Credit</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: '#065F46', fontFamily: F, fontVariantNumeric: 'tabular-nums' }}>${totalEarned.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
            </div>
            <div style={{ background: '#EFF6FF', borderRadius: 10, padding: '14px 16px', border: '1px solid #BFDBFE', transition: 'all 200ms cubic-bezier(.4,0,.2,1)' }}
              onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 8px 24px -8px rgba(15,23,42,0.14)'; e.currentTarget.style.borderColor = 'rgba(37,99,235,0.28)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.borderColor = '#BFDBFE'; }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#2563EB', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>Pending Referrals</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: '#1E40AF', fontFamily: F, fontVariantNumeric: 'tabular-nums' }}>{pendingReferralsCount}</div>
            </div>
          </div>
        </div>
      )}

      {/* Share Link */}
      {settings?.enabled && (
        <div style={{ padding: '0 28px 18px' }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#475569', marginBottom: 6 }}>Your Unique Share Link</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: '#fff', borderRadius: 10, border: '1px solid #E9EDF3', transition: 'all 200ms cubic-bezier(.4,0,.2,1)' }}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#0D5047'; e.currentTarget.style.boxShadow = '0 4px 12px -4px rgba(13,80,71,0.25)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#E9EDF3'; e.currentTarget.style.boxShadow = 'none'; }}>
            <input
              type="text"
              readOnly
              value={`${window.location.origin}/#/portal/referrals?ref=${user?.id || ''}`}
              style={{
                flex: 1, fontFamily: "'JetBrains Mono', monospace", fontSize: 12,
                padding: '6px 10px', border: '1px solid #E9EDF3', borderRadius: 8,
                background: '#f8fafc', color: '#4A5568', outline: 'none',
              }}
            />
             <button
               onClick={handleCopyReferralLink}
               style={{
                 width: 36, height: 36, borderRadius: 8, border: '1px solid #E9EDF3',
                 background: '#fff', color: '#4A5568', fontSize: 12, fontWeight: 600,
                 cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                 flexShrink: 0, transition: 'all .15s ease',
               }}
               onMouseEnter={(e) => { e.currentTarget.style.background = '#F8FAFC'; e.currentTarget.style.borderColor = '#0D5047'; e.currentTarget.style.color = '#0D5047'; }}
               onMouseLeave={(e) => { e.currentTarget.style.background = '#fff'; e.currentTarget.style.borderColor = '#E9EDF3'; e.currentTarget.style.color = '#4A5568'; }}
               aria-label="Copy link"
             >
              <Copy size={16} />
            </button>
          </div>
        </div>
      )}

      {/* Referred Partners History */}
      {settings?.enabled && tab === 'referrals' && (
        <div style={{ padding: '0 28px 28px' }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#0F172A', marginBottom: 12 }}>Referred Partners History</div>

          {referrals.length === 0 ? (
            <EmptyState icon={<Users size={28} />} title="No referrals yet" description="You haven't referred any customers yet." />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {referrals.map((r, idx) => {
                const badge = referralBadgeConfig[r.status.toLowerCase()] || referralBadgeConfig.pending;
                const initials = (r.referredCustomerName || '?').split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
                const credit = r.pendingInvoiceAmount > 0 ? `+${r.pendingInvoiceAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}` : '-';
                const dateStr = r.createdAt ? new Date(r.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '';

                return (
                  <div key={r.id} style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
                    padding: '14px 12px', borderBottom: idx < referrals.length - 1 ? '1px solid #F1F5F9' : 'none',
                    borderLeft: '3px solid transparent', borderRadius: 8, background: '#fff',
                    transition: 'all 200ms cubic-bezier(.4,0,.2,1)', cursor: 'pointer',
                  }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = '#F8FAFC'; e.currentTarget.style.borderLeftColor = '#0D5047'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = '#fff'; e.currentTarget.style.borderLeftColor = 'transparent'; }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0, flex: 1 }}>
                      <div style={{
                        width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
                        background: '#F1F5F9', color: '#475569',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 12, fontWeight: 700,
                      }}>
                        {initials}
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 13.5, fontWeight: 600, color: '#1A202C', lineHeight: 1.3 }}>{r.referredCustomerName}</div>
                        <div style={{ fontSize: 12, color: '#64748B', marginTop: 1, lineHeight: 1.4 }}>
                          {r.referredCustomerEmail || '-'}
                        </div>
                        <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 1 }}>Invited: {dateStr}</div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                      <span style={{
                        fontSize: 10, fontWeight: 700, letterSpacing: '0.05em', color: badge.text, background: badge.bg,
                        padding: '4px 10px', borderRadius: 6, whiteSpace: 'nowrap',
                      }}>
                        {badge.label}
                      </span>
                      <span style={{ textAlign: 'right', fontFamily: F, fontSize: 13, fontWeight: 700, color: '#1A202C', fontVariantNumeric: 'tabular-nums', minWidth: 70 }}>
                        {credit}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Rewards Tab */}
      {settings?.enabled && tab === 'rewards' && (
        <div style={{ padding: '0 28px 28px' }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#0F172A', marginBottom: 12 }}>My Rewards</div>
          {rewards.length === 0 ? (
            <EmptyState icon={<Gift size={28} />} title="No rewards yet" description="When your referrals convert, your rewards will appear here." />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {rewards.map((r) => (
                <div key={r.id} style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
                  padding: '14px 18px', background: '#fff', borderRadius: 10,
                  border: '1px solid #E9EDF3', borderLeft: '3px solid transparent',
                  transition: 'all 200ms cubic-bezier(.4,0,.2,1)', cursor: 'pointer',
                }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = '#F8FAFC'; e.currentTarget.style.borderLeftColor = '#0D5047'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = '#fff'; e.currentTarget.style.borderLeftColor = 'transparent'; }}
                >
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <p style={{ fontWeight: 600, color: '#1A202C', margin: 0, fontSize: 13 }}>{r.referredCustomerName}</p>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0, flexWrap: 'wrap' }}>
                    <span style={{ textAlign: 'right', fontFamily: "'JetBrains Mono', monospace", fontSize: 12, fontWeight: 700, color: '#0D5047' }}>
                      +{r.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </span>
                    <span style={{ fontSize: 11, color: '#94A3B8', whiteSpace: 'nowrap' }}>{new Date(r.createdAt).toLocaleDateString()}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Refer Someone Modal */}
      {showReferModal && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 60, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,.4)', backdropFilter: 'blur(4px)' }}>
          <div style={{ background: '#fff', borderRadius: 16, width: '100%', maxWidth: 480, maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,.2)', border: `1px solid #E9EDF3` }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 22px', borderBottom: `1px solid #E9EDF3` }}>
              <h2 style={{ fontSize: 16, fontWeight: 700, color: '#1A202C', margin: 0 }}>Refer a Business</h2>
              <button onClick={() => setShowReferModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, borderRadius: 8, color: '#8A94A6' }}><X size={18} /></button>
            </div>
            <div style={{ padding: '18px 22px' }}>
              {!referSelected ? (
                <>
                  <p style={{ fontSize: 13, color: '#8A94A6', margin: '0 0 12px' }}>Search for an existing customer to refer.</p>
                  <div style={{ position: 'relative' }}>
                    <Search size={16} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: '#8A94A6' }} />
                    <input
                      type="text"
                      placeholder="Search by name, email, or phone..."
                      value={referSearch}
                      onChange={(e) => setReferSearch(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') handleReferSearch(); }}
                      style={{
                        width: '100%', fontFamily: "'Inter', sans-serif", fontSize: 13, padding: '10px 14px 10px 40px',
                        border: `1.4px solid #E9EDF3`, borderRadius: 9, background: '#f8fafc', color: '#1A202C', outline: 'none'
                      }}
                    />
                  </div>
                   <button onClick={handleReferSearch} style={{
                     marginTop: 10, width: '100%', padding: '9px', borderRadius: 9, border: `1.4px solid #0D5047`,
                     background: '#fff', color: '#0D5047', fontSize: 13, fontWeight: 600, cursor: 'pointer', transition: 'all .15s ease'
                   }} onMouseEnter={(e) => { e.currentTarget.style.background = '#0D5047'; e.currentTarget.style.color = '#fff'; }} onMouseLeave={(e) => { e.currentTarget.style.background = '#fff'; e.currentTarget.style.color = '#0D5047'; }}>Search</button>
                  {referResults.length > 0 && (
                    <div style={{ marginTop: 10, border: `1px solid #E9EDF3`, borderRadius: 9, overflow: 'hidden' }}>
                      {referResults.map((c) => (
                        <button key={c.id} onClick={() => setReferSelected(c)} style={{
                          width: '100%', textAlign: 'left', padding: '10px 12px', border: 'none', borderBottom: `1px solid #E9EDF3`, background: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#1A202C', transition: 'background .15s ease'
                        }} onMouseEnter={e => { e.currentTarget.style.background = '#ECFDF5'; }} onMouseLeave={e => { e.currentTarget.style.background = 'none'; }}>
                          <div style={{ width: 32, height: 32, borderRadius: 8, background: '#ECFDF5', color: '#0D5047', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 12, flexShrink: 0 }}>
                             {(c.name || '').charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <p style={{ fontWeight: 600, margin: 0, fontSize: 13 }}>{c.name}</p>
                            <p style={{ fontSize: 11, color: '#8A94A6', margin: '1px 0 0' }}>{c.email || c.phone || '-'}</p>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                    <div style={{ width: 40, height: 40, borderRadius: 10, background: '#ECFDF5', color: '#0D5047', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 14, flexShrink: 0 }}>
                      {(referSelected.name || '').charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <p style={{ fontWeight: 700, margin: 0, fontSize: 14, color: '#1A202C' }}>{referSelected.name}</p>
                      <p style={{ fontSize: 12, color: '#8A94A6', margin: '1px 0 0' }}>{referSelected.email || referSelected.phone || '-'}</p>
                    </div>
                  </div>
                  <div style={{ marginBottom: 12 }}>
                    <label style={{ fontSize: 11, fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: 0.04, margin: '0 0 6px', display: 'block' }}>Company Name</label>
                    <input
                      type="text"
                      placeholder="Enter company name"
                      value={referCompany}
                      onChange={(e) => setReferCompany(e.target.value)}
                      style={{
                        width: '100%', fontFamily: "'Inter', sans-serif", fontSize: 13, padding: '10px 12px',
                        border: `1.4px solid #E9EDF3`, borderRadius: 9, background: '#f8fafc', color: '#1A202C', outline: 'none'
                      }}
                    />
                  </div>
                  <div style={{ marginBottom: 12 }}>
                    <label style={{ fontSize: 11, fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: 0.04, margin: '0 0 6px', display: 'block' }}>Business Email</label>
                    <input
                      type="text"
                      value={referSelected.email || ''}
                      readOnly
                      style={{
                        width: '100%', fontFamily: "'Inter', sans-serif", fontSize: 13, padding: '10px 12px',
                        border: `1.4px solid #E9EDF3`, borderRadius: 9, background: '#f8fafc', color: '#4A5568', outline: 'none'
                      }}
                    />
                  </div>
                  <textarea
                    placeholder="Notes (optional)"
                    value={referNotes}
                    onChange={(e) => setReferNotes(e.target.value)}
                    rows={3}
                    style={{
                      width: '100%', fontFamily: "'Inter', sans-serif", fontSize: 13, padding: '10px 12px',
                      border: `1.4px solid #E9EDF3`, borderRadius: 9, background: '#f8fafc', color: '#1A202C', outline: 'none', resize: 'vertical'
                    }}
                  />
                  <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
                     <button onClick={() => setReferSelected(null)} style={{
                       flex: 1, padding: '9px', borderRadius: 9, border: `1.4px solid #E9EDF3`,
                       background: '#fff', color: '#8A94A6', fontSize: 13, fontWeight: 600, cursor: 'pointer', transition: 'all .15s ease'
                     }} onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#0D5047'; e.currentTarget.style.color = '#0D5047'; }} onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#E9EDF3'; e.currentTarget.style.color = '#8A94A6'; }}>Back</button>
                     <button onClick={handleReferSubmit} disabled={referSubmitting} style={{
                       flex: 1, padding: '9px', borderRadius: 9, border: '1.4px solid transparent',
                       background: `linear-gradient(155deg, #0D5047, #0D5047)`, color: '#fff',
                       fontSize: 13, fontWeight: 600, cursor: referSubmitting ? 'not-allowed' : 'pointer', opacity: referSubmitting ? 0.7 : 1,
                       transition: 'transform .15s ease',
                     }}
                       onMouseEnter={(e) => { if (!referSubmitting) e.currentTarget.style.transform = 'translateY(-1px)'; }}
                       onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; }}
                     >
                      {referSubmitting ? 'Saving...' : 'Submit Referral'}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Detail Modal */}
      {detailReferral && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 60, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,.4)', backdropFilter: 'blur(4px)' }} onClick={() => setDetailReferral(null)}>
          <div style={{ background: '#fff', borderRadius: 16, width: '100%', maxWidth: 560, maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,.2)', border: `1px solid #E9EDF3` }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 22px', borderBottom: `1px solid #E9EDF3` }}>
              <div>
                <h2 style={{ fontSize: 16, fontWeight: 700, color: '#1A202C', margin: 0 }}>Referral Details</h2>
                <p style={{ fontSize: 12, color: '#8A94A6', margin: '2px 0 0' }}>{detailReferral.referredCustomerName}</p>
              </div>
              <button onClick={() => setDetailReferral(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, borderRadius: 8, color: '#8A94A6' }}><X size={18} /></button>
            </div>
            <div style={{ padding: '18px 22px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 18 }}>
                <div>
                  <p style={{ fontSize: 12, fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: 0.06, margin: '0 0 4px' }}>Status</p>
                  <StatusBadge status={detailReferral.status} />
                </div>
                <div>
                  <p style={{ fontSize: 12, fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: 0.06, margin: '0 0 4px' }}>Pending Amount</p>
                  <p style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 14, fontWeight: 700, color: detailReferral.pendingInvoiceAmount > 0 ? '#1A202C' : '#8A94A6', margin: 0 }}>
                    {detailReferral.pendingInvoiceAmount > 0 ? detailReferral.pendingInvoiceAmount.toLocaleString(undefined, { minimumFractionDigits: 2 }) : '-'}
                  </p>
                </div>
                <div>
                  <p style={{ fontSize: 12, fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: 0.06, margin: '0 0 4px' }}>Created</p>
                  <p style={{ fontSize: 13, color: '#1A202C', margin: 0 }}>{new Date(detailReferral.createdAt).toLocaleDateString()}</p>
                </div>
                <div>
                  <p style={{ fontSize: 12, fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: 0.06, margin: '0 0 4px' }}>Converted</p>
                  <p style={{ fontSize: 13, color: '#1A202C', margin: 0 }}>{detailReferral.convertedAt ? new Date(detailReferral.convertedAt).toLocaleDateString() : '-'}</p>
                </div>
              </div>

              <div style={{ borderTop: `1px solid #E9EDF3`, paddingTop: 14 }}>
                <p style={{ fontSize: 12, fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: 0.06, margin: '0 0 10px' }}>Timeline</p>
                {timelineLoading ? (
                  <PortalLoadingSkeleton type="card" count={3} />
                ) : timeline.length === 0 ? (
                  <p style={{ fontSize: 12, color: '#8A94A6', margin: 0 }}>No timeline events yet.</p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                    {timeline.map((entry, idx) => (
                      <div key={entry.id} style={{ display: 'flex', gap: 12, position: 'relative' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                          <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#008A4C', border: `2px solid #fff`, boxShadow: '0 0 0 2px #A7F3D0', flexShrink: 0, marginTop: 4 }} />
                          {idx < timeline.length - 1 && <div style={{ width: 2, flex: 1, background: '#E9EDF3', marginTop: 4 }} />}
                        </div>
                        <div style={{ paddingBottom: idx < timeline.length - 1 ? 16 : 0, flex: 1 }}>
                          <p style={{ fontSize: 12, fontWeight: 700, color: '#1A202C', margin: '0 0 2px' }}>{entry.title}</p>
                          {entry.description && <p style={{ fontSize: 11, color: '#8A94A6', margin: '0 0 2px', lineHeight: 1.4 }}>{entry.description}</p>}
                          <p style={{ fontSize: 10, color: '#8A94A6', margin: 0 }}>{new Date(entry.timestamp).toLocaleString()}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CustomerReferrals;
