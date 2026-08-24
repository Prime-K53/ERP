import React, { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, ShoppingCart, FileText, Receipt, CreditCard,
  FileBarChart, Wallet, MessageSquare, ChevronLeft, ChevronRight,
  User, LogOut, Globe, X, Users, Truck, Bell
} from 'lucide-react';
import { useCustomerAuth } from '../../../context/CustomerAuthContext';

interface NavItem {
  label: string;
  path: string;
  icon: React.ElementType;
}

interface NavSection {
  title: string;
  items: NavItem[];
}

const navSections: NavSection[] = [
  {
    title: 'Overview',
    items: [
      { label: 'Dashboard', path: '/portal/dashboard', icon: LayoutDashboard },
    ],
  },
  {
    title: 'Commerce',
    items: [
      { label: 'Orders', path: '/portal/orders', icon: ShoppingCart },
      { label: 'Referrals', path: '/portal/referrals', icon: Users },
    ],
  },
  {
    title: 'Documents & Billing',
    items: [
      { label: 'Invoices', path: '/portal/invoices', icon: Receipt },
      { label: 'Statements', path: '/portal/statements', icon: FileBarChart },
      { label: 'Payment Options', path: '/portal/payment-options', icon: CreditCard },
    ],
  },
  {
    title: 'Finance',
    items: [
      { label: 'Payments', path: '/portal/payments', icon: CreditCard },
      { label: 'Wallet', path: '/portal/wallet', icon: Wallet },
    ],
  },
  {
    title: 'Logistics',
    items: [
      { label: 'Shipments', path: '/portal/shipments', icon: Truck },
    ],
  },
  {
    title: 'Account',
    items: [
      { label: 'Support', path: '/portal/support', icon: MessageSquare },
      { label: 'Notifications', path: '/portal/notifications', icon: Bell },
      { label: 'Documents', path: '/portal/documents', icon: FileText },
      { label: 'Profile', path: '/portal/profile', icon: User },
    ],
  },
];

interface Props {
  isOpen: boolean;
  onClose: () => void;
  collapsed?: boolean;
  onCollapsedChange?: (collapsed: boolean) => void;
}

const SIDEBAR_COLLAPSED_KEY = 'prime-portal-sidebar-collapsed';

const PortalSidebar: React.FC<Props> = ({ isOpen, onClose, collapsed: collapsedExternal, onCollapsedChange }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useCustomerAuth();
  const [internalCollapsed, setInternalCollapsed] = useState(() => {
    try {
      const stored = localStorage.getItem(SIDEBAR_COLLAPSED_KEY);
      return stored ? JSON.parse(stored) : false;
    } catch {
      return false;
    }
  });
  const [hoveredItem, setHoveredItem] = useState<string | null>(null);

  const collapsed = collapsedExternal ?? internalCollapsed;
  const setCollapsed = (value: boolean) => {
    setInternalCollapsed(value);
    onCollapsedChange?.(value);
  };
  const navRef = useRef<HTMLElement>(null);
  const activeRef = useRef<HTMLButtonElement>(null);
  const [indicator, setIndicator] = useState({ top: 0, height: 0 });

  useEffect(() => {
    try {
      localStorage.setItem(SIDEBAR_COLLAPSED_KEY, JSON.stringify(collapsed));
    } catch { /* noop */ }
  }, [collapsed]);

  useEffect(() => {
    if (collapsed && activeRef.current && navRef.current) {
      const navRect = navRef.current.getBoundingClientRect();
      const activeRect = activeRef.current.getBoundingClientRect();
      setIndicator({
        top: activeRect.top - navRect.top,
        height: activeRect.height,
      });
    }
  }, [collapsed, location.pathname]);

  const handleNavigate = (path: string) => {
    navigate(path);
    if (window.innerWidth < 768) onClose();
  };

  const handleLogout = () => {
    logout();
    navigate('/portal/login');
  };

  const renderNavItem = (item: NavItem, isActive: boolean) => {
    const Icon = item.icon;
    return (
      <button
        key={item.path}
        ref={isActive ? activeRef : undefined}
        onClick={() => handleNavigate(item.path)}
        onMouseEnter={() => setHoveredItem(item.path)}
        onMouseLeave={() => setHoveredItem(null)}
        className={`
          relative w-full flex items-center gap-3 px-3 py-2 rounded-xl transition-all duration-200 text-sm group
          ${isActive
            ? 'text-white bg-white/[0.08]'
            : 'text-white/60 hover:text-white hover:bg-white/[0.05]'
          }
          ${collapsed ? 'justify-center px-2' : ''}
        `}
        style={isActive ? { boxShadow: 'inset 0 0 0 1px rgba(217,154,63,0.15)' } : undefined}
      >
        {isActive && !collapsed && (
          <span
            className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-5 rounded-r-full"
            style={{ background: 'linear-gradient(180deg, #d99a3f, #b97e2b)', boxShadow: '0 0 8px rgba(217,154,63,0.4)' }}
          />
        )}
        <Icon size={18} className="shrink-0" style={{ color: isActive ? '#d99a3f' : undefined }} />
        {!collapsed && <span className="font-medium whitespace-nowrap">{item.label}</span>}
        {collapsed && hoveredItem === item.path && (
          <div
            className="absolute left-full ml-2 px-3 py-1.5 rounded-lg text-xs font-medium text-white whitespace-nowrap z-50 pointer-events-none"
            style={{
              background: 'rgba(15,84,76,0.95)',
              boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
              backdropFilter: 'blur(8px)',
            }}
          >
            {item.label}
          </div>
        )}
      </button>
    );
  };

  const sidebarContent = (
    <div className="flex flex-col h-full">
      <div className="h-16 flex items-center gap-3 px-5 shrink-0 border-b" style={{ borderColor: 'rgba(255,255,255,0.05)', background: 'linear-gradient(180deg, #0b3e39, #082e2a)' }}>
        <div className="w-9 h-9 rounded-xl shrink-0 flex items-center justify-center text-white" style={{ background: 'linear-gradient(160deg, #3fa294, #0f544c)' }}>
          <Globe size={18} />
        </div>
        {!collapsed && (
          <div className="flex flex-col min-w-0">
            <span className="font-bold text-[16px] tracking-tight text-white truncate">
              Prime<span style={{ color: '#d99a3f' }}>PORTAL</span>
            </span>
            <span className="text-[10px] font-semibold uppercase tracking-wider -mt-0.5 truncate" style={{ color: 'rgba(255,255,255,0.4)' }}>
              Customer Portal
            </span>
          </div>
        )}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="hidden md:flex ml-auto w-6 h-6 items-center justify-center rounded-md text-white/30 hover:text-white hover:bg-white/5 transition-all"
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
        </button>
        <button
          onClick={onClose}
          className="md:hidden ml-auto w-6 h-6 flex items-center justify-center rounded-md text-white/30 hover:text-white hover:bg-white/5 transition-all"
          aria-label="Close sidebar"
        >
          <X size={14} />
        </button>
      </div>

      <nav ref={navRef} className="flex-1 overflow-y-auto custom-scrollbar py-3 px-3 space-y-4 relative">
        {collapsed && indicator.height > 0 && (
          <div
            className="absolute left-0 right-0 mx-auto w-8 rounded-r-lg pointer-events-none"
            style={{
              top: indicator.top,
              height: indicator.height,
              background: 'rgba(217,154,63,0.08)',
              border: '1px solid rgba(217,154,63,0.15)',
              boxShadow: '0 0 12px rgba(217,154,63,0.25)',
              transition: 'all var(--motion-normal) ease',
            }}
          />
        )}
        {navSections.map((section) => (
          <div key={section.title}>
            {!collapsed && (
              <p className="px-3 mb-1.5 text-[10px] font-bold uppercase tracking-widest text-white/30">{section.title}</p>
            )}
            <div className="space-y-0.5">
              {section.items.map((item) => {
                const isActive = location.pathname === item.path || location.pathname.startsWith(item.path + '/');
                return renderNavItem(item, isActive);
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="border-t p-4 space-y-3" style={{ borderColor: 'rgba(255,255,255,0.05)', background: 'linear-gradient(180deg, #0b3e39, #082e2a)' }}>
        <div className={`flex items-center gap-3 px-2 ${collapsed ? 'justify-center' : ''}`}>
          <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0" style={{ background: 'linear-gradient(160deg, #3fa294, #0f544c)' }}>
            {(user?.full_name || user?.email || 'C').charAt(0).toUpperCase()}
          </div>
          {!collapsed && (
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-white truncate">{user?.full_name || 'Customer'}</p>
              <p className="text-xs truncate" style={{ color: 'rgba(255,255,255,0.4)' }}>{user?.email || ''}</p>
            </div>
          )}
        </div>
        <button
          onClick={handleLogout}
          className={`
            w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-white/60 hover:text-rose-300 hover:bg-rose-500/10 transition-all duration-200
            ${collapsed ? 'justify-center' : ''}
          `}
        >
          <LogOut size={18} className="shrink-0" />
          {!collapsed && <span className="font-medium">Sign Out</span>}
        </button>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop Sidebar */}
      <aside
        className={`
          fixed top-0 left-0 z-40 h-full flex flex-col text-white/70 border-r transition-all duration-200 ease-out
          hidden md:flex
          ${collapsed ? 'w-16' : 'w-[286px]'}
        `}
        style={{
          background: 'linear-gradient(180deg, #0b3e39, #082e2a)',
        }}
      >
        {sidebarContent}
      </aside>

      {/* Mobile Sidebar */}
      {isOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={onClose} />
          <aside
            className="absolute top-0 left-0 h-full w-[286px] flex flex-col text-white/70 border-r transition-all duration-200 ease-out"
            style={{
              background: 'linear-gradient(180deg, #0b3e39, #082e2a)',
            }}
          >
            {sidebarContent}
          </aside>
        </div>
      )}
    </>
  );
};

export default PortalSidebar;
