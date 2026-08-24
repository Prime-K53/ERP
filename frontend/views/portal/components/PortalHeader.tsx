import React, { useState, useRef, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Menu, Bell, LogOut, User } from 'lucide-react';
import { useCustomerAuth } from '../../../context/CustomerAuthContext';
import { portalLifecycle } from '../../../services/portalApiClient';

const F = "'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif";

interface Props { title: string; onMenuToggle: () => void; sidebarCollapsed?: boolean; onCommandToggle?: () => void; }

interface NotificationItem { id: string; type: string; title: string; body: string; link: string; is_read: boolean; created_at: string; }

const PortalHeader: React.FC<Props> = ({ title, onMenuToggle }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useCustomerAuth();
  const [showDD, setShowDD] = useState(false);
  const [showNotif, setShowNotif] = useState(false);
  const [notifs, setNotifs] = useState<NotificationItem[]>([]);
  const [unread, setUnread] = useState(0);
  const ddRef = useRef<HTMLDivElement>(null);
  const notifRef = useRef<HTMLDivElement>(null);
  const isDash = location.pathname === '/portal/dashboard';

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (ddRef.current && !ddRef.current.contains(e.target as Node)) setShowDD(false);
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) setShowNotif(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const loadNotifs = async () => {
    try {
      const [l, c] = await Promise.all([portalLifecycle.notifications.list(), portalLifecycle.notifications.unreadCount()]);
      setNotifs(l.slice(0, 10));
      setUnread(c.count);
    } catch {}
  };

  useEffect(() => { loadNotifs(); }, []);

  useEffect(() => {
    let off = false;
    let unsub: (() => void) | undefined;
    (async () => { unsub = await portalLifecycle.subscribe({ onEvent: (t) => { if (t === 'notification') loadNotifs(); } }); })();
    return () => { off = true; unsub?.(); };
  }, []);

  const logout_ = () => { setShowDD(false); logout(); navigate('/portal/login'); };

  const clickNotif = async (n: NotificationItem) => {
    if (!n.is_read) {
      await portalLifecycle.notifications.markRead(n.id).catch(() => {});
      setNotifs((p) => p.map((x) => (x.id === n.id ? { ...x, is_read: true } : x)));
      setUnread((c) => Math.max(0, c - 1));
    }
    if (n.link) navigate(n.link.startsWith('#') ? n.link.slice(1) : n.link);
    setShowNotif(false);
  };

  const markAll = async () => {
    await portalLifecycle.notifications.markAllRead().catch(() => {});
    setNotifs((p) => p.map((x) => ({ ...x, is_read: true })));
    setUnread(0);
  };

  const bell = <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>;

  return (
    <header style={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100, height: 52, background: '#fff', borderBottom: '1px solid #E9EDF3', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 12px', fontFamily: F }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <button onClick={onMenuToggle} aria-label="Menu" style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px 6px', borderRadius: 6, color: '#1A202C', display: 'flex' }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" /></svg>
        </button>
        {isDash ? (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontSize: 15, fontWeight: 700, color: '#1A202C', lineHeight: 1.15 }}>Prime<span style={{ color: '#F15A24' }}>PORTAL</span></span>
            <span style={{ fontSize: 8, fontWeight: 600, color: '#8A94A6', textTransform: 'uppercase' as const, letterSpacing: '0.07em', lineHeight: 1.3 }}>CUSTOMER PORTAL</span>
          </div>
        ) : <span style={{ fontSize: 15, fontWeight: 600, color: '#1A202C' }}>{title}</span>}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <div ref={notifRef} style={{ position: 'relative' }}>
          <button onClick={() => { setShowNotif((v) => !v); setShowDD(false); }} aria-label="Notifications" style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px 6px', borderRadius: 6, position: 'relative', color: '#1A202C', display: 'flex' }}>
            {bell}
            {unread > 0 && <span style={{ position: 'absolute', top: 0, right: 0, minWidth: 14, height: 14, borderRadius: '50%', background: '#E53E3E', color: '#fff', fontSize: 8, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 3px', border: '1.5px solid #fff' }}>{unread > 99 ? '99+' : unread}</span>}
          </button>
          {showNotif && (
            <div style={{ position: 'absolute', right: 0, top: '100%', marginTop: 6, width: 280, background: '#fff', border: '1px solid #E9EDF3', borderRadius: 12, boxShadow: '0 6px 20px rgba(0,0,0,0.1)', overflow: 'hidden', zIndex: 200 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', borderBottom: '1px solid #E9EDF3' }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: '#1A202C' }}>Notifications</span>
                {unread > 0 && <button onClick={markAll} style={{ background: 'none', border: 'none', fontSize: 11, fontWeight: 600, color: '#008A4C', cursor: 'pointer', padding: '4px 0' }}>Mark all read</button>}
              </div>
              <div style={{ maxHeight: 260, overflowY: 'auto' }}>
                {notifs.length === 0 ? <p style={{ padding: '16px 12px', textAlign: 'center', fontSize: 11, color: '#8A94A6' }}>No notifications yet.</p> : notifs.map((n) => (
                  <button key={n.id} onClick={() => clickNotif(n)} style={{ width: '100%', textAlign: 'left', padding: '8px 12px', borderBottom: '1px solid #F3F4F6', background: n.is_read ? '#fff' : '#F0FFF8', cursor: 'pointer', border: 'none', borderLeft: 'none', borderRight: 'none', borderTop: 'none' }}>
                    <p style={{ fontSize: 12, fontWeight: 600, color: n.is_read ? '#4A5568' : '#1A202C', margin: 0, lineHeight: 1.3 }}>{n.title}</p>
                    {n.body && <p style={{ fontSize: 11, color: '#8A94A6', margin: '1px 0 0', lineHeight: 1.3 }}>{n.body}</p>}
                    <p style={{ fontSize: 9.5, color: '#A0AAB8', margin: '2px 0 0' }}>{new Date(n.created_at).toLocaleString()}</p>
                  </button>
                ))}
              </div>
              <div style={{ padding: '6px 12px', borderTop: '1px solid #E9EDF3' }}>
                <button onClick={() => { setShowNotif(false); navigate('/portal/notifications'); }} style={{ width: '100%', textAlign: 'center', fontSize: 12, fontWeight: 600, color: '#008A4C', background: 'none', border: 'none', cursor: 'pointer', padding: '4px 0' }}>View all</button>
              </div>
            </div>
          )}
        </div>
        <div ref={ddRef} style={{ position: 'relative' }}>
          <button onClick={() => { setShowDD(!showDD); setShowNotif(false); }} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, borderRadius: '50%' }}>
            <div style={{ width: 28, height: 28, borderRadius: '50%', background: '#0D5047', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 12, fontWeight: 600 }}>{(user?.full_name || user?.email || 'C').charAt(0).toUpperCase()}</div>
          </button>
          {showDD && (
            <div style={{ position: 'absolute', right: 0, top: '100%', marginTop: 6, width: 180, background: '#fff', border: '1px solid #E9EDF3', borderRadius: 12, boxShadow: '0 6px 20px rgba(0,0,0,0.1)', overflow: 'hidden', zIndex: 200 }}>
              <div style={{ padding: '8px 12px', borderBottom: '1px solid #E9EDF3' }}>
                <p style={{ fontSize: 12, fontWeight: 600, color: '#1A202C', margin: 0 }}>{user?.full_name || 'Customer'}</p>
                <p style={{ fontSize: 11, color: '#8A94A6', margin: '1px 0 0' }}>{user?.email || ''}</p>
              </div>
              <div style={{ padding: 3 }}>
                <button onClick={() => { setShowDD(false); navigate('/portal/profile'); }} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', borderRadius: 6, fontSize: 12, fontWeight: 500, color: '#4A5568', background: 'none', border: 'none', cursor: 'pointer' }}>
                  <User size={13} style={{ color: '#8A94A6' }} /> Profile
                </button>
                <button onClick={logout_} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', borderRadius: 6, fontSize: 12, fontWeight: 500, color: '#E53E3E', background: 'none', border: 'none', cursor: 'pointer' }}>
                  <LogOut size={13} /> Sign Out
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};

export default PortalHeader;
