import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';

const SF = "'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif";

const MobileBottomNav: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();

  const items = [
    { label: 'Dashboard', path: '/portal/dashboard', icon: (a: boolean) => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={a ? '#008A4C' : '#718096'} strokeWidth={a ? 2 : 1.8} strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></svg> },
    { label: 'Orders', path: '/portal/orders', icon: (a: boolean) => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={a ? '#008A4C' : '#718096'} strokeWidth={a ? 2 : 1.8} strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /></svg> },
    { label: 'Invoices', path: '/portal/invoices', icon: (a: boolean) => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={a ? '#008A4C' : '#718096'} strokeWidth={a ? 2 : 1.8} strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><line x1="12" y1="6" x2="12" y2="12" /><path d="M15.5 14.5c-.5 1-1.5 1.5-3.5 1.5s-3-.5-3.5-1.5" /></svg> },
    { label: 'Payments', path: '/portal/payments', icon: (a: boolean) => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={a ? '#008A4C' : '#718096'} strokeWidth={a ? 2 : 1.8} strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="5" width="20" height="14" rx="2" /><path d="M2 10h20" /></svg> },
    { label: 'More', path: '/portal/profile', icon: (a: boolean) => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={a ? '#008A4C' : '#718096'} strokeWidth={a ? 2.2 : 2} strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="1.5" /><circle cx="19" cy="12" r="1.5" /><circle cx="5" cy="12" r="1.5" /></svg> },
  ];

  return (
    <nav style={{ position: 'fixed', bottom: 0, left: 0, right: 0, height: 56, background: '#fff', borderTop: '1px solid #E9EDF3', display: 'flex', alignItems: 'center', justifyContent: 'space-around', paddingBottom: 'env(safe-area-inset-bottom,0)', zIndex: 50, fontFamily: SF }}>
      {items.map((item) => {
        const active = location.pathname === item.path || location.pathname.startsWith(item.path + '/');
        return (
          <button key={item.path} onClick={() => navigate(item.path)} aria-label={item.label} aria-current={active ? 'page' : undefined} style={{ display: 'flex', flexDirection: 'column' as const, alignItems: 'center', justifyContent: 'center', gap: 2, background: 'none', border: 'none', cursor: 'pointer', padding: '6px 0', minWidth: 52, color: active ? '#008A4C' : '#718096' }}>
            {item.icon(active)}
            <span style={{ fontSize: 9.5, fontWeight: active ? 700 : 500, lineHeight: 1.2, fontFamily: SF, color: active ? '#008A4C' : '#718096' }}>{item.label}</span>
          </button>
        );
      })}
    </nav>
  );
};

export default MobileBottomNav;
