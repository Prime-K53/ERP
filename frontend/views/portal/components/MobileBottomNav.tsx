import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { portalApi, portalLifecycle } from '../../../services/portalApiClient';

const SF = "'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif";

interface BadgeCounts {
  unpaidInvoices: number;
  activeDeliveries: number;
  unreadNotifications: number;
  activeOrders: number;
}

const MobileBottomNav: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [badges, setBadges] = useState<BadgeCounts>({ unpaidInvoices: 0, activeDeliveries: 0, unreadNotifications: 0, activeOrders: 0 });
  const [showFooter, setShowFooter] = useState(false);
  const [lastScrollY, setLastScrollY] = useState(0);

  useEffect(() => {
    let cancelled = false;

    const handleScroll = () => {
      if (!cancelled) {
        const currentScrollY = window.scrollY;
        const threshold = 100; // Only show footer after scrolling 100px

        // Show footer when scrolling down past threshold
        if (currentScrollY > threshold && currentScrollY > lastScrollY) {
          setShowFooter(true);
        } else if (currentScrollY < lastScrollY && currentScrollY > threshold) {
          // Hide footer when scrolling up (but keep it below threshold)
          setShowFooter(false);
        }

        setLastScrollY(currentScrollY);
      }
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => { window.removeEventListener('scroll', handleScroll); };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [dash, notifCount] = await Promise.all([
          portalApi.get<any>('/dashboard'),
          portalApi.get<{ count: number }>('/notifications/unread-count'),
        ]);
        if (!cancelled) {
          setBadges({
            unpaidInvoices: dash?.unpaidInvoiceCount ?? 0,
            activeDeliveries: dash?.activeDeliveries ?? 0,
            unreadNotifications: notifCount?.count ?? 0,
            activeOrders: dash?.totalOrders ?? 0,
          });
        }
      } catch { /* ignore */ }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    let unsub: (() => void) | undefined;
    (async () => {
      try {
        unsub = await portalLifecycle.subscribe({
          onEvent: (type) => {
            if (!cancelled && (type === 'notification' || type === 'entity_changed')) {
              portalApi.get<any>('/dashboard').then((dash) => {
                if (!cancelled) setBadges((prev) => ({ ...prev, unpaidInvoices: dash?.unpaidInvoiceCount ?? prev.unpaidInvoices, activeDeliveries: dash?.activeDeliveries ?? prev.activeDeliveries, activeOrders: dash?.totalOrders ?? prev.activeOrders }));
              }).catch(() => {
                if (!cancelled) setShowFooter(false);
              });
              portalApi.get<{ count: number }>('/notifications/unread-count').then((c) => {
                if (!cancelled) setBadges((prev) => ({ ...prev, unreadNotifications: c?.count ?? prev.unreadNotifications }));
              }).catch(() => {
                if (!cancelled) setShowFooter(false);
              });
            }
          },
        });
      } catch { /* ignore */ }
    })();
    return () => { cancelled = true; unsub?.(); };
  }, []);

  const Badge: React.FC<{ count: number; color: 'red' | 'green' }> = ({ count, color }) => {
    if (count <= 0) return null;
    const bg = color === 'red' ? '#DC2626' : '#059669';
    return (
      <span style={{
        position: 'absolute', top: -6, right: -8, minWidth: 18, height: 18,
        borderRadius: 9, background: bg, color: '#fff',
        fontSize: 10, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '0 5px', border: '2px solid #fff',
        boxShadow: '0 2px 6px -1px rgba(0,0,0,0.25)',
        lineHeight: 1,
      }}>
        {count > 99 ? '99+' : count}
      </span>
    );
  };

  const items = [
    { label: 'Overview', path: '/portal/dashboard', badge: 0, badgeColor: 'red' as const, icon: (active: boolean) => (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={active ? '#2563EB' : '#64748B'} strokeWidth={active ? 2.2 : 1.8} strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
        <polyline points="9 22 9 12 15 12 15 22" />
      </svg>
    )},
    { label: 'Invoices', path: '/portal/invoices', badge: badges.unpaidInvoices, badgeColor: 'red' as const, icon: (active: boolean) => (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={active ? '#2563EB' : '#64748B'} strokeWidth={active ? 2.2 : 1.8} strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        <line x1="16" y1="13" x2="8" y2="13" />
        <line x1="16" y1="17" x2="8" y2="17" />
      </svg>
    )},
    { label: 'Orders', path: '/portal/orders', badge: badges.activeOrders, badgeColor: 'red' as const, icon: (active: boolean) => (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={active ? '#2563EB' : '#64748B'} strokeWidth={active ? 2.2 : 1.8} strokeLinecap="round" strokeLinejoin="round">
        <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" />
        <line x1="3" y1="6" x2="21" y2="6" />
        <path d="M16 10a4 4 0 0 1-8 0" />
      </svg>
    )},
    { label: 'Deliveries', path: '/portal/deliveries', badge: badges.activeDeliveries, badgeColor: 'green' as const, icon: (active: boolean) => (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={active ? '#2563EB' : '#64748B'} strokeWidth={active ? 2.2 : 1.8} strokeLinecap="round" strokeLinejoin="round">
        <rect x="1" y="3" width="15" height="13" />
        <polygon points="16 8 20 8 23 11 23 16 16 16 16 8" />
        <circle cx="5.5" cy="18.5" r="2.5" />
        <circle cx="18.5" cy="18.5" r="2.5" />
      </svg>
    )},
    { label: 'Referrals', path: '/portal/referrals', badge: 0, badgeColor: 'red' as const, icon: (active: boolean) => (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={active ? '#2563EB' : '#64748B'} strokeWidth={active ? 2.2 : 1.8} strokeLinecap="round" strokeLinejoin="round">
        <polyline points="20 12 20 22 4 22 4 12" />
        <rect x="2" y="7" width="20" height="5" />
        <line x1="12" y1="22" x2="12" y2="7" />
        <path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z" />
        <path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z" />
      </svg>
    )},
  ];

  return (
    <nav
      style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        height: 52,
        display: 'flex',
        alignItems: 'stretch',
        justifyContent: 'space-around',
        paddingBottom: 'env(safe-area-inset-bottom, 0)',
        background: 'rgba(255,255,255,0.95)',
        backdropFilter: 'blur(20px) saturate(180%)',
        WebkitBackdropFilter: 'blur(20px) saturate(180%)',
        borderTop: '1px solid rgba(226,232,240,0.7)',
        boxShadow: '0 -8px 24px -12px rgba(15,23,42,0.12), inset 0 1px 0 rgba(255,255,255,0.6)',
        zIndex: 50,
        fontFamily: SF,
        transition: 'transform 250ms cubic-bezier(0.25,0.46,0.45,0.94), opacity 250ms ease',
        transform: showFooter ? 'translateY(0)' : 'translateY(100%)',
        opacity: showFooter ? 1 : 0,
        pointerEvents: showFooter ? 'auto' : 'none',
      }}
    >
      {items.map((item) => {
        const active = location.pathname === item.path || location.pathname.startsWith(item.path + '/');
        return (
          <button
            key={item.path}
            onClick={() => navigate(item.path)}
            aria-label={item.label}
            aria-current={active ? 'page' : undefined}
            className="btn-press"
            style={{
              position: 'relative',
              flex: 1,
              display: 'flex',
              flexDirection: 'column' as const,
              alignItems: 'center',
              justifyContent: 'center',
              gap: 4,
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: '10px 0',
              minWidth: 48,
              color: active ? '#2563EB' : '#64748B',
              transition: 'color 220ms ease',
            }}
          >
            <span style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', width: 24, height: 24 }}>
              {item.icon(active)}
              <Badge count={item.badge} color={item.badgeColor} />
            </span>
          </button>
        );
      })}
    </nav>
  );
};

export default MobileBottomNav;
