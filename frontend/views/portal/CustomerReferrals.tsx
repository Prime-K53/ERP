import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { Users, UserPlus, Gift, Clock, CheckCircle2, Wallet, TrendingUp, Search, Filter, ChevronDown, X, ArrowRight, Copy, ExternalLink, Share2 } from 'lucide-react';
import { portalLifecycle, PortalReferral, PortalReferralReward, PortalReferralSettings, PortalReferralTimelineEntry, PortalCustomerSearchResult } from '../../services/portalApiClient';
import { useNavigate } from 'react-router-dom';
import { useCustomerAuth } from '../../context/CustomerAuthContext';
import { useToast } from './components/Toast';
import EmptyState from './components/EmptyState';
import PortalLoadingSkeleton from './components/PortalLoadingSkeleton';
import StatusBadge from './components/StatusBadge';
import { F } from './portalStyles';

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
      setSettings(s);
    } catch { /* ignore */ }
  };

  const loadFunnel = async () => {
    try {
      const f = await portalLifecycle.referrals.stats();
      setFunnel(f);
    } catch { /* ignore */ }
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
      setReferrals(data.referrals);
      setReferralTotalPages(data.totalPages);
    } catch (err: any) {
      setError(err.message || 'Failed to load referrals');
    }
  };

  const loadRewards = async () => {
    try {
      const data = await portalLifecycle.referrals.rewards({
        page: rewardPage,
        pageSize,
        status: rewardStatus || undefined,
      });
      setRewards(data.rewards);
      setRewardTotalPages(data.totalPages);
    } catch (err: any) {
      setError(err.message || 'Failed to load rewards');
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
      await portalLifecycle.referrals.create({
        referredCustomerId: referSelected.id,
        notes: referNotes || undefined,
      });
      setShowReferModal(false);
      setReferSearch('');
      setReferResults([]);
      setReferSelected(null);
      setReferNotes('');
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

  if (loading) return <div className="p-6"><PortalLoadingSkeleton type="card" count={4} /></div>;

  return (
    <div>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '22px 28px 18px', borderBottom: `1px solid #E9EDF3`, background: '#fff'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{
            width: 40, height: 40, borderRadius: 10,
            background: `linear-gradient(155deg, #0D5047, #0D5047)`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 4px 10px -3px rgba(15,84,76,.6)', flexShrink: 0
          }}>
            <Users size={19} color="#fff" />
          </div>
          <div>
            <h1 style={{
              fontFamily: "'DM Serif Display', 'Georgia', serif", fontWeight: 400,
              fontSize: 22, margin: 0, color: '#0D5047', letterSpacing: 0.2
            }}>
              Referrals
            </h1>
            <p style={{ margin: '2px 0 0', fontSize: 11.5, color: '#8A94A6', letterSpacing: 0.02 }}>
              Track your referrals and rewards
            </p>
          </div>
        </div>
        {settings?.enabled && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              onClick={handleCopyReferralLink}
              style={{
                fontFamily: "'Inter', sans-serif", fontSize: 13, fontWeight: 600,
                padding: '9px 18px', borderRadius: 9, cursor: 'pointer',
                background: 'transparent',
                color: '#8A94A6', display: 'inline-flex', alignItems: 'center', gap: 7,
                border: `1.4px solid #E9EDF3`, transition: 'all .15s ease'
              }}
              title="Copy your referral link"
            >
               <Copy size={16} /> Copy Link
            </button>
            <button
              onClick={handleShareWhatsApp}
              style={{
                fontFamily: "'Inter', sans-serif", fontSize: 13, fontWeight: 600,
                padding: '9px 18px', borderRadius: 9, cursor: 'pointer',
                background: '#25D366',
                color: '#fff', display: 'inline-flex', alignItems: 'center', gap: 7,
                border: '1.4px solid transparent', transition: 'all .15s ease'
              }}
              title="Share via WhatsApp"
            >
              <Share2 size={16} /> Share
            </button>
            <button onClick={() => setShowReferModal(true)} style={{
              fontFamily: "'Inter', sans-serif", fontSize: 13, fontWeight: 600,
              padding: '9px 18px', borderRadius: 9, cursor: 'pointer', border: '1.4px solid transparent',
              background: `linear-gradient(155deg, #0D5047, #0D5047)`,
              color: '#fff', display: 'inline-flex', alignItems: 'center', gap: 7,
              boxShadow: '0 6px 16px -6px rgba(15,84,76,.55)', transition: 'all .15s ease'
            }}>
              <UserPlus size={16} /> Refer Someone
            </button>
          </div>
        )}
      </div>

      {error && (
        <div style={{ padding: '0 28px', marginTop: 16 }}>
          <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', borderRadius: 12, padding: '12px 16px', fontSize: 13 }}>
            {error}
          </div>
        </div>
      )}

      {/* Funnel */}
      {funnel && (
        <div style={{ padding: '20px 28px 0' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12 }}>
            <TrendingUp size={16} style={{ color: '#0D5047' }} />
            <span style={{ fontSize: 11, fontWeight: 700, color: '#0D5047', textTransform: 'uppercase', letterSpacing: 0.08 }}>
              Referral Funnel
            </span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
            {funnelStages.map((stage, idx) => (
              <div key={stage.label} style={{ position: 'relative' }}>
                <div style={{
                  padding: '14px 16px', borderRadius: 12, background: '#fff',
                  border: '1.4px solid #e4ddd1', borderLeft: `4px solid ${stage.color}`,
                  boxShadow: '0 1px 3px rgba(0,0,0,.04)'
                }}>
                  <p style={{ fontSize: 10, fontWeight: 700, color: '#8A94A6', textTransform: 'uppercase', letterSpacing: 0.08, margin: '0 0 6px' }}>{stage.label}</p>
                  <p style={{ fontSize: 22, fontWeight: 700, color: '#1A202C', margin: 0, fontFamily: "'JetBrains Mono', monospace", fontVariantNumeric: 'tabular-nums' }}>
                    {stage.value}
                  </p>
                </div>
                {idx < funnelStages.length - 1 && (
                  <div style={{ position: 'absolute', top: '50%', right: -10, transform: 'translateY(-50%)', zIndex: 2 }}>
                    <ArrowRight size={16} style={{ color: '#E9EDF3' }} />
                  </div>
                )}
              </div>
            ))}
          </div>
          {funnel.pendingRewardAmount > 0 && (
            <p style={{ fontSize: 11, color: '#8A94A6', marginTop: 10 }}>
              <Gift size={12} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 4 }} />
              <span style={{ fontWeight: 600 }}>{funnel.pendingRewardAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span> in pending rewards •
              <span style={{ fontWeight: 600, marginLeft: 4 }}>{funnel.totalEarned.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span> total earned
            </p>
          )}
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 8, padding: '16px 28px 0' }}>
        {([
          { key: 'referrals', label: 'My Referrals', icon: Users },
          { key: 'rewards', label: 'My Rewards', icon: Gift },
        ] as const).map((t) => {
          const isActive = tab === t.key;
          return (
            <button key={t.key} onClick={() => setTab(t.key)} style={{
              fontFamily: "'Inter', sans-serif", fontSize: 12, fontWeight: 600,
              padding: '8px 16px', borderRadius: 9, border: isActive ? '1.4px solid transparent' : `1.4px solid #E9EDF3`,
              background: isActive ? `linear-gradient(155deg, #0D5047, #0D5047)` : '#fff',
              color: isActive ? '#fff' : '#8A94A6', cursor: 'pointer',
              display: 'inline-flex', alignItems: 'center', gap: 7, transition: 'all .15s ease',
              boxShadow: isActive ? '0 4px 12px -4px rgba(15,84,76,.4)' : 'none',
            }}>
              <t.icon size={14} /> {t.label}
            </button>
          );
        })}
      </div>

      {/* Filters */}
      {tab === 'referrals' && (
        <div style={{ display: 'flex', gap: 8, padding: '12px 28px 0', flexWrap: 'wrap' }}>
          <div style={{ position: 'relative', flex: '1 1 240px' }}>
            <Search size={16} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#8A94A6' }} />
            <input
              type="text"
              placeholder="Search referred customers..."
              value={referralSearch}
              onChange={(e) => setReferralSearch(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { setReferralPage(1); loadReferrals(); } }}
              style={{
                width: '100%', fontFamily: "'Inter', sans-serif", fontSize: 13, padding: '9px 12px 9px 32px',
                border: `1.4px solid #E9EDF3`, borderRadius: 9, background: '#fff', color: '#1A202C', outline: 'none'
              }}
            />
          </div>
          <select
            value={referralStatus}
            onChange={(e) => { setReferralStatus(e.target.value as ReferralStatus); setReferralPage(1); }}
            style={{
              fontFamily: "'Inter', sans-serif", fontSize: 13, padding: '9px 32px 9px 12px',
              border: `1.4px solid #E9EDF3`, borderRadius: 9, background: '#fff', color: '#1A202C',
              appearance: 'none', backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%235c6567'/%3E%3C/svg%3E")`,
              backgroundRepeat: 'no-repeat', backgroundPosition: 'right 12px center', cursor: 'pointer'
            }}
          >
            <option value="all">All Statuses</option>
            <option value="active">Active</option>
            <option value="converted">Converted</option>
            <option value="expired">Expired</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </div>
      )}

      {/* Content */}
      <div style={{ padding: '16px 28px 28px' }}>
        {!settings?.enabled && (
          <EmptyState
            icon={<Users size={28} />}
            title="Referrals not enabled"
            description="The referral program is currently disabled. Contact support for more information."
          />
        )}

        {settings?.enabled && tab === 'referrals' && referrals.length === 0 && (
          <EmptyState
            icon={<Users size={28} />}
            title="No referrals yet"
            description="You haven't referred any customers yet. Click 'Refer Someone' to get started."
            action={{ label: 'Refer Someone', onClick: () => setShowReferModal(true) }}
          />
        )}

        {settings?.enabled && tab === 'referrals' && referrals.length > 0 && (
          <div className="space-y-2">
            {referrals.map((r) => (
              <div key={r.id} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
                padding: '14px 18px', background: '#fff', borderRadius: 12,
                border: '1.4px solid #e4ddd1', boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
                flexWrap: 'wrap', cursor: 'pointer', transition: 'all .15s ease'
              }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = '#a6d9d3'; e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,.08)'; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = '#e4ddd1'; e.currentTarget.style.boxShadow = '0 1px 2px rgba(0,0,0,0.04)'; }}
                onClick={() => openDetail(r)}
              >
                <div style={{ minWidth: 0, flex: 1 }}>
                  <p style={{ fontWeight: 600, color: '#1A202C', margin: 0, fontSize: 13 }}>{r.referredCustomerName}</p>
                  {r.referredCustomerEmail && <p style={{ fontSize: 11, color: '#8A94A6', margin: '2px 0 0' }}>{r.referredCustomerEmail}</p>}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexShrink: 0 }}>
                  <StatusBadge status={r.status} size="sm" />
                  <span style={{ textAlign: 'right', fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: r.pendingInvoiceAmount > 0 ? '#1A202C' : '#8A94A6' }}>
                    {r.pendingInvoiceAmount > 0 ? r.pendingInvoiceAmount.toLocaleString(undefined, { minimumFractionDigits: 2 }) : '-'}
                  </span>
                  <span style={{ fontSize: 12, color: '#8A94A6', whiteSpace: 'nowrap' }}>{new Date(r.createdAt).toLocaleDateString()}</span>
                  <button onClick={(e) => { e.stopPropagation(); openDetail(r); }} style={{
                    fontSize: 11, fontWeight: 700, color: '#0D5047', background: 'none', border: 'none', cursor: 'pointer',
                    padding: '4px 8px', borderRadius: 6, transition: 'all .15s'
                  }} onMouseEnter={e => { e.currentTarget.style.background = '#ECFDF5'; }} onMouseLeave={e => { e.currentTarget.style.background = 'none'; }}>
                    View Timeline
                  </button>
                </div>
              </div>
            ))}
            {referralTotalPages > 1 && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 16, fontSize: 12, color: '#8A94A6' }}>
                <span>Page {referralPage} of {referralTotalPages}</span>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button onClick={() => setReferralPage(p => Math.max(1, p - 1))} disabled={referralPage <= 1} style={{
                    padding: '6px 12px', borderRadius: 8, border: `1.4px solid #E9EDF3`, background: '#fff', cursor: referralPage <= 1 ? 'not-allowed' : 'pointer', opacity: referralPage <= 1 ? 0.5 : 1, fontSize: 12, color: '#1A202C'
                  }}>Previous</button>
                  <button onClick={() => setReferralPage(p => Math.min(referralTotalPages, p + 1))} disabled={referralPage >= referralTotalPages} style={{
                    padding: '6px 12px', borderRadius: 8, border: `1.4px solid #E9EDF3`, background: '#fff', cursor: referralPage >= referralTotalPages ? 'not-allowed' : 'pointer', opacity: referralPage >= referralTotalPages ? 0.5 : 1, fontSize: 12, color: '#1A202C'
                  }}>Next</button>
                </div>
              </div>
            )}
          </div>
        )}

        {settings?.enabled && tab === 'rewards' && rewards.length === 0 && (
          <EmptyState
            icon={<Gift size={28} />}
            title="No rewards yet"
            description="When your referrals convert, your rewards will appear here."
          />
        )}

        {settings?.enabled && tab === 'rewards' && rewards.length > 0 && (
          <div className="space-y-2">
            {rewards.map((r) => (
              <div key={r.id} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
                padding: '14px 18px', background: '#fff', borderRadius: 12,
                border: '1.4px solid #e4ddd1', boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
                flexWrap: 'wrap'
              }}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <p style={{ fontWeight: 600, color: '#1A202C', margin: 0, fontSize: 13 }}>{r.referredCustomerName}</p>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexShrink: 0, flexWrap: 'wrap' }}>
                  <span style={{ textAlign: 'right', fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: '#8A94A6' }}>
                    {r.invoiceAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </span>
                  <span style={{ textAlign: 'right', fontFamily: "'JetBrains Mono', monospace", fontSize: 12, fontWeight: 700, color: '#0D5047' }}>
                    +{r.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </span>
                  <span className={`inline-flex items-center gap-1.5 font-semibold rounded-full whitespace-nowrap text-xs px-2.5 py-1 ${rewardStatusColor[r.status]?.bg || 'bg-slate-100'} ${rewardStatusColor[r.status]?.text || 'text-slate-600'}`}>
                    <span className={`rounded-full ${rewardStatusColor[r.status]?.bg ? 'bg-current opacity-40' : 'bg-slate-400'} w-2 h-2`} />
                    {statusLabel[r.status] || r.status}
                  </span>
                  <span style={{ fontSize: 12, color: '#8A94A6', whiteSpace: 'nowrap' }}>{new Date(r.createdAt).toLocaleDateString()}</span>
                </div>
              </div>
            ))}
            {rewardTotalPages > 1 && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 16, fontSize: 12, color: '#8A94A6' }}>
                <span>Page {rewardPage} of {rewardTotalPages}</span>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button onClick={() => setRewardPage(p => Math.max(1, p - 1))} disabled={rewardPage <= 1} style={{
                    padding: '6px 12px', borderRadius: 8, border: `1.4px solid #E9EDF3`, background: '#fff', cursor: rewardPage <= 1 ? 'not-allowed' : 'pointer', opacity: rewardPage <= 1 ? 0.5 : 1, fontSize: 12, color: '#1A202C'
                  }}>Previous</button>
                  <button onClick={() => setRewardPage(p => Math.min(rewardTotalPages, p + 1))} disabled={rewardPage >= rewardTotalPages} style={{
                    padding: '6px 12px', borderRadius: 8, border: `1.4px solid #E9EDF3`, background: '#fff', cursor: rewardPage >= rewardTotalPages ? 'not-allowed' : 'pointer', opacity: rewardPage >= rewardTotalPages ? 0.5 : 1, fontSize: 12, color: '#1A202C'
                  }}>Next</button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Refer Someone Modal */}
      {showReferModal && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 60, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,.4)', backdropFilter: 'blur(4px)' }}>
          <div style={{ background: '#fff', borderRadius: 16, width: '100%', maxWidth: 480, maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,.2)', border: `1px solid #E9EDF3` }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 22px', borderBottom: `1px solid #E9EDF3` }}>
              <h2 style={{ fontSize: 16, fontWeight: 700, color: '#1A202C', margin: 0 }}>Refer Someone</h2>
              <button onClick={() => setShowReferModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, borderRadius: 8, color: '#8A94A6' }}><X size={18} /></button>
            </div>
            <div style={{ padding: '18px 22px' }}>
              {!referSelected ? (
                <>
                  <p style={{ fontSize: 13, color: '#8A94A6', margin: '0 0 12px' }}>Search for an existing customer to refer.</p>
                  <div style={{ position: 'relative' }}>
                    <Search size={16} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#8A94A6' }} />
                    <input
                      type="text"
                      placeholder="Search by name, email, or phone..."
                      value={referSearch}
                      onChange={(e) => setReferSearch(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') handleReferSearch(); }}
                      style={{
                        width: '100%', fontFamily: "'Inter', sans-serif", fontSize: 13, padding: '10px 12px 10px 32px',
                        border: `1.4px solid #E9EDF3`, borderRadius: 9, background: '#f8fafc', color: '#1A202C', outline: 'none'
                      }}
                    />
                  </div>
                  <button onClick={handleReferSearch} style={{
                    marginTop: 10, width: '100%', padding: '9px', borderRadius: 9, border: `1.4px solid #0D5047`,
                    background: '#fff', color: '#0D5047', fontSize: 13, fontWeight: 600, cursor: 'pointer'
                  }}>Search</button>
                  {referResults.length > 0 && (
                    <div style={{ marginTop: 10, border: `1px solid #E9EDF3`, borderRadius: 9, overflow: 'hidden' }}>
                      {referResults.map((c) => (
                        <button key={c.id} onClick={() => setReferSelected(c)} style={{
                          width: '100%', textAlign: 'left', padding: '10px 12px', border: 'none', borderBottom: `1px solid #E9EDF3`, background: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#1A202C'
                        }} onMouseEnter={e => { e.currentTarget.style.background = '#ECFDF5'; }} onMouseLeave={e => { e.currentTarget.style.background = 'none'; }}>
                          <div style={{ width: 32, height: 32, borderRadius: 8, background: '#ECFDF5', color: '#0D5047', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 12, flexShrink: 0 }}>
                            {c.name.charAt(0).toUpperCase()}
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
                      {referSelected.name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <p style={{ fontWeight: 700, margin: 0, fontSize: 14, color: '#1A202C' }}>{referSelected.name}</p>
                      <p style={{ fontSize: 12, color: '#8A94A6', margin: '1px 0 0' }}>{referSelected.email || referSelected.phone || '-'}</p>
                    </div>
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
                      background: '#fff', color: '#8A94A6', fontSize: 13, fontWeight: 600, cursor: 'pointer'
                    }}>Back</button>
                    <button onClick={handleReferSubmit} disabled={referSubmitting} style={{
                      flex: 1, padding: '9px', borderRadius: 9, border: '1.4px solid transparent',
                      background: `linear-gradient(155deg, #0D5047, #0D5047)`, color: '#fff',
                      fontSize: 13, fontWeight: 600, cursor: referSubmitting ? 'not-allowed' : 'pointer', opacity: referSubmitting ? 0.7 : 1
                    }}>
                      {referSubmitting ? 'Saving...' : 'Refer Customer'}
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
                  <p style={{ fontSize: 10, fontWeight: 700, color: '#8A94A6', textTransform: 'uppercase', letterSpacing: 0.06, margin: '0 0 4px' }}>Status</p>
                  <StatusBadge status={detailReferral.status} />
                </div>
                <div>
                  <p style={{ fontSize: 10, fontWeight: 700, color: '#8A94A6', textTransform: 'uppercase', letterSpacing: 0.06, margin: '0 0 4px' }}>Pending Amount</p>
                  <p style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 14, fontWeight: 700, color: detailReferral.pendingInvoiceAmount > 0 ? '#1A202C' : '#8A94A6', margin: 0 }}>
                    {detailReferral.pendingInvoiceAmount > 0 ? detailReferral.pendingInvoiceAmount.toLocaleString(undefined, { minimumFractionDigits: 2 }) : '-'}
                  </p>
                </div>
                <div>
                  <p style={{ fontSize: 10, fontWeight: 700, color: '#8A94A6', textTransform: 'uppercase', letterSpacing: 0.06, margin: '0 0 4px' }}>Created</p>
                  <p style={{ fontSize: 13, color: '#1A202C', margin: 0 }}>{new Date(detailReferral.createdAt).toLocaleDateString()}</p>
                </div>
                <div>
                  <p style={{ fontSize: 10, fontWeight: 700, color: '#8A94A6', textTransform: 'uppercase', letterSpacing: 0.06, margin: '0 0 4px' }}>Converted</p>
                  <p style={{ fontSize: 13, color: '#1A202C', margin: 0 }}>{detailReferral.convertedAt ? new Date(detailReferral.convertedAt).toLocaleDateString() : '-'}</p>
                </div>
              </div>

              <div style={{ borderTop: `1px solid #E9EDF3`, paddingTop: 14 }}>
                <p style={{ fontSize: 10, fontWeight: 700, color: '#8A94A6', textTransform: 'uppercase', letterSpacing: 0.06, margin: '0 0 10px' }}>Timeline</p>
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
