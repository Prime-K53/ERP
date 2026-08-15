import React, { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, ShoppingCart, FileText, Receipt, CreditCard,
  FileBarChart, Wallet, MessageSquare, ChevronLeft, ChevronRight,
  User, LogOut, Globe, X, Users, Truck, Bell, Package, ClipboardList
} from 'lucide-react';
import { useCustomerAuth } from '../../../context/CustomerAuthContext';

interface NavItem {
  label: string;
  path: string;
  icon: React.ElementType;
  action?: () => void;
}

interface NavSection {
  title: string;
  items: NavItem[];
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  collapsed?: boolean;
  onCollapsedChange?: (collapsed: boolean) => void;
  moduleName?: string;
}

const SIDEBAR_COLLAPSED_KEY = 'prime-portal-sidebar-collapsed';

const RAIL_BG = `
  radial-gradient(120% 70% at 50% -10%, rgba(74,118,181,0.32) 0%, rgba(74,118,181,0) 55%),
  radial-gradient(160% 60% at 110% 110%, rgba(5,150,105,0.14) 0%, rgba(5,150,105,0) 55%),
  linear-gradient(180deg, #0F2C59 0%, #0A1F42 46%, #071836 100%)
`;

const ACTIVE_ITEM_BG = 'linear-gradient(135deg, rgba(5,150,105,0.24) 0%, rgba(5,150,105,0.05) 100%)';
const ACTIVE_ITEM_SHADOW = 'inset 0 0 0 1px rgba(52,211,153,0.18), 0 6px 18px -6px rgba(5,150,105,0.4)';

const PortalSidebar: React.FC<Props> = ({ isOpen, onClose, collapsed: collapsedExternal, onCollapsedChange, moduleName }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { logout } = useCustomerAuth();
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
        { label: 'Product Orders', path: '/portal/orders', icon: ShoppingCart },
        { label: 'Quotations', path: '/portal/quotations', icon: FileText },
        { label: 'Referrals', path: '/portal/referrals', icon: Users },
      ],
    },
    {
      title: 'Documents & Billing',
      items: [
        { label: 'Invoices', path: '/portal/invoices', icon: Receipt },
      ],
    },
    {
      title: 'Finance',
      items: [
        { label: 'Receipt', path: '/portal/payments', icon: Receipt },
        { label: 'Wallet', path: '/portal/wallet', icon: Wallet },
        { label: 'Account Statements', path: '/portal/account-statements', icon: FileBarChart },
      ],
    },
    {
      title: 'Logistics',
      items: [
        { label: 'Deliveries & Tracking', path: '/portal/deliveries', icon: Truck },
      ],
    },
    {
      title: 'Account',
      items: [
        { label: 'Support', path: '/portal/support', icon: MessageSquare },
        { label: 'Notifications', path: '/portal/notifications', icon: Bell },
        { label: 'Documents', path: '/portal/documents', icon: FileText },
        { label: 'Log Out', path: '', icon: LogOut, action: handleLogout },
      ],
    },
  ];

  const renderNavItem = (item: NavItem, isActive: boolean) => {
    const Icon = item.icon;
    const showTooltip = collapsed && hoveredItem === item.path;
    const handleClick = () => {
      if (item.action) {
        item.action();
      } else {
        handleNavigate(item.path);
      }
    };
    return (
      <button
        key={item.path}
        ref={isActive ? activeRef : undefined}
        onClick={handleClick}
        onMouseEnter={() => setHoveredItem(item.path)}
        onMouseLeave={() => setHoveredItem(null)}
        className={`
          group relative w-full flex items-center gap-2.5 rounded-xl text-sm
          transition-all duration-200 ease-out
          ${isActive ? '' : 'hover:bg-white/[0.05]'}
            ${collapsed ? 'justify-center px-2 py-1.5' : 'px-2 py-1.5'}
        `}
        style={{
          cursor: 'pointer',
          background: isActive ? ACTIVE_ITEM_BG : undefined,
          boxShadow: isActive ? ACTIVE_ITEM_SHADOW : undefined,
        }}
      >
        {isActive && !collapsed && (
          <span
            className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-[18px] rounded-r-full pointer-events-none"
            style={{
              background: 'linear-gradient(180deg, #34D399, #059669)',
              boxShadow: '0 0 12px rgba(52,211,153,0.8)',
            }}
          />
        )}
        <span
          className={`
            flex items-center justify-center w-7 h-7 rounded-lg shrink-0 transition-all duration-200
            ${isActive ? '' : 'text-white/55 group-hover:bg-white/10 group-hover:text-white/90'}
          `}
          style={isActive ? {
            background: 'linear-gradient(135deg, #059669, #047857)',
            color: '#fff',
            boxShadow: '0 4px 10px -3px rgba(5,150,105,0.6)',
          } : undefined}
        >
          <Icon size={16} strokeWidth={2} />
        </span>
        {!collapsed && (
          <span
            className={`font-medium whitespace-nowrap text-[13px] transition-colors duration-200 ${isActive ? '' : 'text-white/60 group-hover:text-white/90'}`}
            style={isActive ? { color: '#FFFFFF' } : undefined}
          >
            {item.label}
          </span>
        )}
        {showTooltip && (
          <div
            className="absolute left-full ml-2 px-3 py-1.5 rounded-lg text-xs font-semibold text-white whitespace-nowrap z-50 pointer-events-none"
            style={{
              background: 'rgba(7,24,54,0.92)',
              boxShadow: '0 8px 24px -6px rgba(0,0,0,0.5), inset 0 0 0 1px rgba(255,255,255,0.08)',
              backdropFilter: 'blur(12px)',
              WebkitBackdropFilter: 'blur(12px)',
              animation: 'modalIn .12s ease',
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
      <div
        className="h-12 flex items-center gap-2.5 px-3 shrink-0 border-b relative overflow-hidden"
        style={{
          borderColor: 'rgba(255,255,255,0.06)',
          background: 'linear-gradient(180deg, rgba(13,37,77,0.85), rgba(7,24,54,0.4))',
          boxShadow: 'inset 0 -1px 0 rgba(255,255,255,0.04)',
        }}
      >
        <span
          className="absolute inset-x-0 top-0 h-px pointer-events-none"
          style={{ background: 'linear-gradient(90deg, transparent, rgba(52,211,153,0.45), transparent)' }}
        />
        <div
          className="w-9 h-9 rounded-xl shrink-0 flex items-center justify-center text-white"
          style={{
            background: 'linear-gradient(160deg, #4A76B5 0%, #0F2C59 100%)',
            boxShadow: '0 4px 14px -4px rgba(15,44,89,0.6), inset 0 1px 0 rgba(255,255,255,0.25)',
          }}
        >
          <Globe size={17} strokeWidth={2} />
        </div>
        {!collapsed && (
          <div className="flex flex-col min-w-0">
            {moduleName ? (
              <span className="font-extrabold text-[15px] tracking-tight text-white truncate leading-tight">
                {moduleName}
              </span>
            ) : (
              <>
                <span className="font-extrabold text-[16px] tracking-tight text-white truncate leading-tight">
                  Prime<span style={{ color: '#34D399' }}>Portal</span>
                </span>
                <span className="text-[9.5px] font-bold uppercase tracking-[0.16em] -mt-0.5 truncate" style={{ color: 'rgba(255,255,255,0.38)' }}>
                  Customer Portal
                </span>
              </>
            )}
          </div>
        )}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="hidden md:flex ml-auto w-6 h-6 items-center justify-center rounded-md text-white/35 hover:text-white hover:bg-white/10 transition-all duration-200"
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
        </button>
        <button
          onClick={onClose}
          className="md:hidden ml-auto w-6 h-6 flex items-center justify-center rounded-md text-white/35 hover:text-white hover:bg-white/10 transition-all duration-200"
          aria-label="Close sidebar"
        >
          <X size={14} />
        </button>
      </div>

      <nav
        ref={navRef}
        className="flex-1 overflow-y-auto custom-scrollbar py-2 px-2 space-y-3 relative"
        style={{ scrollbarColor: 'rgba(255,255,255,0.18) rgba(255,255,255,0.02)' }}
      >
        {collapsed && indicator.height > 0 && (
          <div
            className="absolute left-0 right-0 mx-auto w-8 rounded-lg pointer-events-none"
            style={{
              top: indicator.top,
              height: indicator.height,
              background: 'linear-gradient(135deg, rgba(5,150,105,0.18), rgba(5,150,105,0.04))',
              border: '1px solid rgba(52,211,153,0.22)',
              boxShadow: '0 0 16px rgba(5,150,105,0.25)',
              transition: 'all var(--motion-normal) cubic-bezier(.4,0,.2,1)',
            }}
          />
        )}
        {navSections.map((section) => (
          <div key={section.title}>
            {!collapsed && (
              <div className="flex items-center gap-2 px-2 mb-1">
                <p className="text-[9.5px] font-bold uppercase tracking-[0.14em] m-0" style={{ color: 'rgba(255,255,255,0.30)' }}>
                  {section.title}
                </p>
                <span className="flex-1 h-px" style={{ background: 'linear-gradient(90deg, rgba(255,255,255,0.08), transparent)' }} />
              </div>
            )}
            <div className="space-y-0">
              {section.items.map((item) => {
                const isActive = item.path ? location.pathname === item.path || location.pathname.startsWith(item.path + '/') : false;
                return renderNavItem(item, isActive);
              })}
            </div>
          </div>
        ))}
      </nav>
    </div>
  );

  const railStyle: React.CSSProperties = {
    background: RAIL_BG,
    borderColor: 'rgba(255,255,255,0.06)',
    boxShadow: 'inset -1px 0 0 rgba(255,255,255,0.03), 8px 0 24px -12px rgba(4,16,43,0.45)',
  };

  return (
    <>
      <aside
        className={`
          fixed top-0 left-0 z-40 h-full flex flex-col text-white/70 border-r transition-all duration-200 ease-out
          hidden md:flex
          ${collapsed ? 'w-16' : 'w-[220px]'}
        `}
        style={railStyle}
      >
        {sidebarContent}
      </aside>

      {isOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={onClose} />
          <aside
            className="absolute top-0 left-0 h-full w-[220px] flex flex-col text-white/70 border-r transition-all duration-200 ease-out"
            style={railStyle}
          >
            {sidebarContent}
          </aside>
        </div>
      )}
    </>
  );
};

export default PortalSidebar;
