import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { portalApi, portalLifecycle } from '../../services/portalApiClient';
import { useCustomerAuth } from '../../context/CustomerAuthContext';
import ErrorBanner from './components/ErrorBanner';
import PortalLoadingSkeleton from './components/PortalLoadingSkeleton';
import { formatK } from './constants';

interface Transaction {
  date: string;
  description: string;
  amount: number | null;
  type: string;
  status?: string;
  docType?: string;
  docId?: string;
}

interface DashboardData {
  balance: number;
  outstandingBalance: number;
  walletBalance: number;
  unpaidInvoiceCount: number;
  totalOrders: number;
  unreadMessageCount: number;
  recentTransactions: Transaction[];
}

const getGreeting = (): string => {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
};

const F = "'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif";

const Sparkline: React.FC<{ v: number[]; c: string; w?: number; h?: number }> = ({ v, c, w = 56, h = 22 }) => {
  if (v.length < 2) return null;
  const mx = Math.max(...v), mn = Math.min(...v), r = mx - mn || 1;
  const pts = v.map((val, i) => `${2 + (i / (v.length - 1)) * (w - 4)},${2 + (1 - (val - mn) / r) * (h - 4)}`).join(' ');
  const gid = `g${c.replace('#', '')}`;
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ display: 'block' }}>
      <defs><linearGradient id={gid} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={c} stopOpacity="0.1" /><stop offset="100%" stopColor={c} stopOpacity="0" /></linearGradient></defs>
      <polygon points={`0,${h} ${pts} ${w},${h}`} fill={`url(#${gid})`} />
      <polyline points={pts} fill="none" stroke={c} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
};

const rT = () => Array.from({ length: 7 }, () => 20 + Math.random() * 80);

const CustomerDashboard: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useCustomerAuth();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    portalApi.get<DashboardData>('/dashboard').then(setData).catch((e) => setError(e.message)).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    let off = false;
    let unsub: (() => void) | undefined;
    (async () => {
      const T = ['invoice', 'order', 'sale', 'payment', 'quotation', 'request', 'shipment'];
      unsub = await portalLifecycle.subscribe({
        onEvent: (type, p) => {
          const dt = p?.docType;
          if ((p?.event === 'payment_allocated' || (dt && T.includes(dt)) || type === 'activity') && !off)
            portalApi.get<DashboardData>('/dashboard').then(setData).catch(() => {});
        },
      });
    })();
    return () => { off = true; unsub?.(); };
  }, []);

  if (loading) return <div style={{ padding: 12 }}><PortalLoadingSkeleton type="card" /><PortalLoadingSkeleton type="table" count={5} /></div>;
  if (error) return <div style={{ padding: 12 }}><ErrorBanner message={error} onDismiss={() => setError(null)} /></div>;
  if (!data) return null;

  const txns = (data.recentTransactions || []).slice().sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).slice(0, 3);
  const dateStr = new Date().toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  const icon = (d: string, s: number = 14, sw: number = 2) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" dangerouslySetInnerHTML={{ __html: d }} />
  );

  return (
    <div style={{ fontFamily: F, fontSize: 13, lineHeight: 1.4, color: '#2D3748' }}>

      {/* Welcome */}
      <div style={{ background: '#fff', borderRadius: 12, padding: '12px 14px', marginBottom: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between', border: '1px solid #E9EDF3' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 42, height: 42, borderRadius: 12, background: 'linear-gradient(135deg,#0D5047,#08352F)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, flexShrink: 0 }}>👋</div>
          <div>
            <div style={{ fontSize: 16, fontWeight: 600, color: '#1A202C', lineHeight: 1.3 }}>{getGreeting()},<br />{user?.full_name || 'Guest'}</div>
            <div style={{ fontSize: 11.5, color: '#8A94A6', marginTop: 1, lineHeight: 1.35 }}>{dateStr}</div>
          </div>
        </div>
        <button onClick={() => navigate('/portal/new-request')} aria-label="New request" style={{ width: 44, height: 44, borderRadius: '50%', background: '#008A4C', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 3px 10px rgba(0,138,76,0.25)', flexShrink: 0 }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
        </button>
      </div>

      {/* KPI Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }}>
        {([
          { l: 'OUTSTANDING BALANCE', v: formatK(data.outstandingBalance || 0), s: 'No change from last month', c: '#E53E3E', bg: '#FFF5F5', ic: '<line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>', to: '/portal/statements' },
          { l: 'UNPAID INVOICES', v: String(data.unpaidInvoiceCount ?? 0), s: 'No unpaid invoices', c: '#DD6B20', bg: '#FFFAF0', ic: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>', to: '/portal/invoices?status=Unpaid' },
          { l: 'TOTAL ORDERS', v: String(data.totalOrders ?? 0), s: 'No orders this month', c: '#805AD5', bg: '#FAF5FF', ic: '<circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/>', to: '/portal/orders' },
          { l: 'WALLET BALANCE', v: formatK(data.walletBalance || 0), s: 'No change from last month', c: '#3182CE', bg: '#EBF8FF', ic: '<rect x="2" y="4" width="20" height="16" rx="2"/><path d="M2 10h20"/>', to: '/portal/wallet' },
        ] as const).map((k, i) => (
          <div key={i} onClick={() => navigate(k.to)} style={{ background: '#fff', borderRadius: 10, padding: '10px 10px 8px', border: '1px solid #E9EDF3', cursor: 'pointer', display: 'flex', flexDirection: 'column' as const }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
              <div style={{ width: 26, height: 26, borderRadius: 7, background: k.bg, color: k.c, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{icon(k.ic, 13)}</div>
              <span style={{ fontSize: 9.5, fontWeight: 600, color: '#8A94A6', textTransform: 'uppercase' as const, letterSpacing: '0.03em', lineHeight: 1.2 }}>{k.l}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontSize: 20, fontWeight: 600, color: '#1A202C', lineHeight: 1.1, fontVariantNumeric: 'tabular-nums' }}>{k.v}</div>
                <div style={{ fontSize: 10.5, color: '#8A94A6', marginTop: 3 }}>{k.s}</div>
              </div>
              <div style={{ opacity: 0.5, flexShrink: 0 }}><Sparkline v={rT()} c={k.c} /></div>
            </div>
          </div>
        ))}
      </div>

      {/* Transaction Overview */}
      <div style={{ background: '#fff', borderRadius: 12, marginBottom: 10, border: '1px solid #E9EDF3', overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px 6px' }}>
          <h2 style={{ fontSize: 14, fontWeight: 600, margin: 0, color: '#1A202C' }}>Transaction Overview</h2>
          <button onClick={() => navigate('/portal/payments')} style={{ display: 'flex', alignItems: 'center', gap: 2, background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600, color: '#008A4C', padding: '4px 0' }}>
            View all <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg>
          </button>
        </div>
        {([
          { ic: '<polyline points="7 17 17 7"/><polyline points="7 7 17 7 17 17"/>', bg: '#ECFDF5', c: '#008A4C', l: 'Total Transactions', v: String(txns.length) },
          { ic: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>', bg: '#FFFAF0', c: '#DD6B20', l: 'Last Transaction', v: '—' },
          { ic: '<rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>', bg: '#EBF8FF', c: '#3182CE', l: 'Last Transaction Date', v: '—' },
        ] as const).map((r, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', padding: '8px 14px', borderTop: '1px solid #F3F4F6' }}>
            <div style={{ width: 28, height: 28, borderRadius: 7, background: r.bg, color: r.c, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginRight: 10 }}>{icon(r.ic, 13)}</div>
            <span style={{ flex: 1, fontSize: 13, fontWeight: 500, color: '#4A5568' }}>{r.l}</span>
            <span style={{ fontSize: 13, fontWeight: 600, color: '#718096', marginRight: 6, fontVariantNumeric: 'tabular-nums', textAlign: 'right' as const }}>{r.v}</span>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#CBD5E0" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg>
          </div>
        ))}
      </div>

      {/* Recent Activity */}
      <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #E9EDF3', overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px 6px' }}>
          <h2 style={{ fontSize: 14, fontWeight: 600, margin: 0, color: '#1A202C' }}>Recent Activity</h2>
          <button onClick={() => navigate('/portal/payments')} style={{ display: 'flex', alignItems: 'center', gap: 2, background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600, color: '#008A4C', padding: '4px 0' }}>
            View all <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg>
          </button>
        </div>
        {(txns.length > 0
          ? txns.map((t) => ({ icon: '<polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>', title: t.description || 'Activity', sub: undefined as string | undefined, date: new Date(t.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }), onClick: t.docId && t.docType ? () => navigate(`/portal/${t.docType}s/${t.docId}`) : undefined }))
          : [
              { icon: '<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>', title: 'Welcome to PrimePORTAL', sub: 'Your account has been created successfully.', date: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }), onClick: undefined },
              { icon: '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>', title: 'Profile Updated', sub: 'Your profile information was updated.', date: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }), onClick: () => navigate('/portal/profile') },
              { icon: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><polyline points="9 12 11 14 15 10"/>', title: 'Account Activated', sub: 'Your account is now active.', date: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }), onClick: undefined },
            ]
        ).map((item, i) => (
          <div key={i} onClick={item.onClick} style={{ display: 'flex', alignItems: 'center', padding: '8px 14px', borderTop: '1px solid #F3F4F6', cursor: item.onClick ? 'pointer' : 'default' }}>
            <div style={{ width: 34, height: 34, borderRadius: '50%', background: '#ECFDF5', color: '#008A4C', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginRight: 10 }}>{icon(item.icon, 14)}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#1A202C', lineHeight: 1.3 }}>{item.title}</div>
              {item.sub && <div style={{ fontSize: 11.5, color: '#8A94A6', marginTop: 1 }}>{item.sub}</div>}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0, marginLeft: 6 }}>
              <span style={{ fontSize: 11, color: '#8A94A6', whiteSpace: 'nowrap' as const }}>{item.date}</span>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#CBD5E0" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default CustomerDashboard;
