import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { portalApi, portalLifecycle, PortalPromotionInfo, PortalAdInfo, PortalDeliveryBanner } from '../../services/portalApiClient';
import { useCustomerAuth } from '../../context/CustomerAuthContext';
import { useAuth } from '../../context/AuthContext';
import { usePortalData } from './hooks/usePortalData';
import { QuoteRequestItem } from '../../types';
import ErrorBanner from './components/ErrorBanner';
import PortalLoadingSkeleton from './components/PortalLoadingSkeleton';
import PremiumKPICard from './components/PremiumKPICard';
import PromotionBanner from './components/PromotionBanner';
import { QuoteRequestModal } from './components/QuoteRequestModal';
import { useToast } from './components/Toast';
import {
  Building2,
  CreditCard,
  ShoppingBag,
  ClipboardList,
  Truck,
  Gift,
  Wallet,
  FileText,
  ChevronRight,
  ChevronLeft,
  ArrowRight,
  Percent,
  Bell,
  Menu,
  PackageCheck,
} from 'lucide-react';

interface DashboardData {
  balance: number;
  walletBalance: number;
  outstandingBalance: number;
  creditLimit: number;
  unpaidInvoiceCount: number;
  totalOrders: number;
  activeRequestCount: number;
  openQuotationCount: number;
  productionOrderCount: number;
  unreadMessageCount: number;
  activeDeliveries: number;
  recentDocuments: any[];
  recentTransactions: any[];
  pendingDeliveries: any[];
  health: any;
}

interface UnpaidInvoice {
  id: string;
  invoice_number: string;
  total_amount: number;
  status: string;
  due_date: string;
  created_at: string;
}

interface Slide {
  id: string;
  gradient: string;
  icon: React.ReactNode;
  badge: string;
  title: string;
  subtitle: React.ReactNode;
  cta?: { label: string; to: string };
  onClick: () => void;
}

const F = "'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif";
const MONO = "'JetBrains Mono', monospace";
const NAVY = '#0F2C59';
const TEAL_GRADIENT = 'linear-gradient(135deg, #146b60 0%, #0f544c 100%)';
const EMERALD = '#059669';

const fmtMoney = (n: number) =>
  'K' + Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const mwk = (v: number) => `MWK ${Math.round(Number(v) || 0).toLocaleString()}`;

const discountLabel = (p: PortalPromotionInfo): string => {
  const type = String(p.discountType || 'percentage');
  const value = Number(p.discountValue ?? 0) || 0;
  if (type === 'percentage') return `${value}% OFF`;
  if (type === 'fixed_price') return `${mwk(value)} each`;
  if (type === 'buy_x_get_y') return 'Buy X Get Y';
  return `${mwk(value)} OFF`;
};

const adToSlide = (ad: PortalAdInfo, navigate: (to: string) => void): Slide => {
  const ctaTo = ad.ctaTarget || '/portal/orders';
  const ends = ad.endsAt ? new Date(ad.endsAt) : null;
  const endsLabel =
    ends && !Number.isNaN(ends.getTime())
      ? ` · ends ${ends.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`
      : '';
  return {
    id: `ad-${ad.id}`,
    gradient: ad.gradient || 'linear-gradient(135deg,#0b3e39 0%,#1f8577 100%)',
    icon: <span style={{ fontSize: 22 }}>{ad.emoji || '🎯'}</span>,
    badge: ad.badge || 'Sponsored',
    title: ad.title,
    subtitle: (
      <>
        {ad.subtitle || 'Explore our latest offers.'}
        {endsLabel}
      </>
    ),
    cta: { label: ad.ctaLabel || 'Order Now', to: ctaTo },
    onClick: () => navigate(ctaTo),
  };
};

const promoToSlide = (p: PortalPromotionInfo, navigate: (to: string) => void): Slide => {
  const ends = p.endsAt ? new Date(p.endsAt) : null;
  const endsLabel =
    ends && !Number.isNaN(ends.getTime())
      ? ` · ends ${ends.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`
      : '';
  const minOrder = p.minimumOrderAmount ? ` · min order ${mwk(p.minimumOrderAmount)}` : '';
  const isAuto = p.isAutoApply !== false;
  return {
    id: `promo-${p.id}`,
    gradient: 'linear-gradient(120deg,#0b3e39 0%,#0f544c 55%,#008A4C 130%)',
    icon: <Percent size={22} />,
    badge: '✦ Portal Exclusive Offer',
    title: `${p.name}${p.code ? ` · ${p.code}` : ''}`,
    subtitle: (
      <>
        Save <strong style={{ color: '#fff' }}>{discountLabel(p)}</strong>
        {endsLabel}
        {minOrder}
        {isAuto ? ' · auto-applied at checkout' : ''}
      </>
    ),
    cta: { label: 'Order now', to: '/portal/new-request' },
    onClick: () => navigate('/portal/new-request'),
  };
};

const deliveryToSlide = (b: PortalDeliveryBanner, navigate: (to: string) => void): Slide => {
  const ref = b.invoiceNumber
    ? `invoice ${b.invoiceNumber}`
    : (b.orderNumber ? `order ${b.orderNumber}` : 'your order');
  const config = (
    {
      inbound: {
        gradient: 'linear-gradient(135deg,#1E40AF 0%,#0F2C59 100%)',
        badge: 'Out of Warehouse',
        title: 'Your delivery is on the move',
        msg: `Delivery for ${ref} is out of the warehouse.`,
      },
      active: {
        gradient: 'linear-gradient(135deg,#7C3AED 0%,#5B21B6 100%)',
        badge: 'Out for Delivery',
        title: 'Your delivery is on its way',
        msg: `Delivery for ${ref} is out for delivery.`,
      },
      delivered: {
        gradient: 'linear-gradient(135deg,#059669 0%,#065F46 100%)',
        badge: 'Delivered',
        title: 'Delivery complete',
        msg: `Delivery for ${ref} has been delivered.`,
      },
    } as Record<string, { gradient: string; badge: string; title: string; msg: string }>
  )[b.stage] || {
    gradient: 'linear-gradient(135deg,#1E40AF 0%,#0F2C59 100%)',
    badge: 'Delivery Update',
    title: 'Delivery update',
    msg: `Delivery for ${ref} has an update.`,
  };
  return {
    id: `delivery-${b.id}`,
    gradient: config.gradient,
    icon: <PackageCheck size={22} />,
    badge: config.badge,
    title: config.title,
    subtitle: config.msg,
    cta: { label: b.stage === 'delivered' ? 'View' : 'Track', to: '/portal/deliveries' },
    onClick: () => navigate('/portal/deliveries'),
  };
};

const buildFallbackSlides = (
  navigate: (to: string) => void,
  displayName: string,
  companyName: string
): Slide[] => [
  {
    id: 'welcome',
    gradient: 'linear-gradient(135deg,#0F2C59 0%,#1E3A8A 100%)',
    icon: <Building2 size={22} />,
    badge: 'Welcome',
    title: `Welcome, ${displayName.split(' ')[0] || 'Customer'}!`,
    subtitle: (
      <>{companyName} — real-time tracking, quotes, statements &amp; payments.</>
    ),
    onClick: () => navigate('/portal/orders'),
  },
  {
    id: 'catalog',
    gradient: 'linear-gradient(135deg,#065F46 0%,#059669 100%)',
    icon: <ShoppingBag size={22} />,
    badge: 'New Orders',
    title: 'Browse the Catalog',
    subtitle: (
      <>Place new orders, request quotes and track every step in real time.</>
    ),
    onClick: () => navigate('/portal/orders'),
  },
  {
    id: 'payments',
    gradient: 'linear-gradient(135deg,#7C2D12 0%,#D97706 100%)',
    icon: <CreditCard size={22} />,
    badge: 'Receipt',
    title: 'Stay on Top of Receipts',
    subtitle: (
      <>Pay invoices online, view statements and monitor your account balance.</>
    ),
    onClick: () => navigate('/portal/account-statements'),
  },
];

// Scoped premium styling (hover lifts, arrow reveals, icon chips).
const DASHBOARD_CSS = `
  .cpd-card { transition: transform .18s ease, box-shadow .18s ease, border-color .18s ease; }
  .cpd-card:hover { transform: translateY(-2px); box-shadow: 0 16px 34px -18px rgba(15,44,89,.28) !important; }
  .cpd-card:active { transform: translateY(0) scale(.995); }
  .cpd-card-arrow { opacity: 0; transform: translateX(-5px); transition: all .18s ease; }
  .cpd-card:hover .cpd-card-arrow { opacity: 1 !important; transform: translateX(0); }
  .cpd-qicon { transition: transform .18s ease, box-shadow .18s ease; }
  .cpd-card:hover .cpd-qicon { transform: translateY(-2px) scale(1.07); }
  .cpd-ghost { transition: all .15s ease; }
  .cpd-ghost:hover { background: #EEF2FF !important; border-color: #C7D2FE !important; }
  .cpd-link { transition: color .15s ease, gap .15s ease; }
  .cpd-link:hover { color: #1D4ED8 !important; gap: 6px !important; }
  .cpd-row { transition: background .15s ease; }
  .cpd-row:hover { background: #F8FAFF !important; }
  @media (max-width: 480px) {
    .cpd-carousel-cta { display: none !important; }
    .cpd-carousel-arrow { display: none !important; }
  }
`;

const CustomerDashboard: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useCustomerAuth();
  const { companyConfig } = useAuth();
  const { addToast } = useToast();
  const [showQuoteModal, setShowQuoteModal] = useState(false);
  const [unpaidInvoices, setUnpaidInvoices] = useState<UnpaidInvoice[]>([]);
  const [promotions, setPromotions] = useState<PortalPromotionInfo[] | null>(null);
  const [ads, setAds] = useState<PortalAdInfo[]>([]);
  const [deliveryBanners, setDeliveryBanners] = useState<PortalDeliveryBanner[]>([]);
  const [active, setActive] = useState(0);
  const [hovered, setHovered] = useState(false);
  const touchX = useRef<number | null>(null);

  const displayName = user?.full_name || 'Customer';
  const accountId = user?.customer_id || '';
  const companyName = companyConfig?.companyName || 'ERP';
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null);
  const [loyaltyTier, setLoyaltyTier] = useState<string>('');

  // ── KPI enrichments derived from live data ────────────────────────────────
  const todayStart = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };
  const overdueInvoices = useMemo(
    () =>
      (unpaidInvoices || []).filter((inv) => {
        if (/overdue|past_due/i.test(String(inv.status || ''))) return true;
        if (!inv.due_date) return false;
        const due = new Date(inv.due_date);
        return !Number.isNaN(due.getTime()) && due < todayStart();
      }).length,
    [unpaidInvoices]
  );

  const creditLimitNum = Number(dashboardData?.creditLimit || 0);
  const outstandingNum = Math.max(0, Number(dashboardData?.outstandingBalance || 0));
  const creditUtilizationPct =
    creditLimitNum > 0 ? Math.round(Math.min(100, (outstandingNum / creditLimitNum) * 100)) : 0;
  const paymentHistory = Number(dashboardData?.health?.factors?.paymentHistory ?? 100);
  const onTimeScore = Number(dashboardData?.health?.factors?.overdueInvoices ?? 100);

  const { loading, error, refresh, clearError } = usePortalData<DashboardData>({
    key: '/dashboard',
    label: 'Dashboard',
    fetcher: () => portalApi.get<DashboardData>('/dashboard'),
    onData: async (data) => {
      setDashboardData(data);
      try {
        // Fetch the full unpaid list so the Overdue count is accurate, then
        // truncate only for display below.
        const inv = await portalApi.get<{ invoices: UnpaidInvoice[] }>('/invoices?status=Unpaid&pageSize=100');
        setUnpaidInvoices(inv.invoices || []);
      } catch {
        if (unpaidInvoices.length === 0) setUnpaidInvoices([]);
      }
    },
  });

  // Live portal promotions + banner ads for the carousel (display only).
  // Live delivery status banners (sliding carousel like the ads). Refreshed
  // on mount, on realtime events and on a light poll so every delivery status
  // change updates the banner message.
  const loadDeliveryBanners = useCallback(() => {
    portalLifecycle.deliveries
      .banners()
      .then((list) => setDeliveryBanners(Array.isArray(list) ? list : []))
      .catch(() => setDeliveryBanners((prev) => prev));
  }, []);

  useEffect(() => {
    loadDeliveryBanners();
    const id = setInterval(loadDeliveryBanners, 60000);
    return () => clearInterval(id);
  }, [loadDeliveryBanners]);

  useEffect(() => {
    let cancelled = false;
    portalLifecycle.promotions
      .list()
      .then((list) => {
        if (!cancelled) setPromotions(Array.isArray(list) ? list : []);
      })
      .catch(() => {
        if (!cancelled) setPromotions([]);
      });
    portalLifecycle.ads
      .list()
      .then((list) => {
        if (!cancelled) setAds(Array.isArray(list) ? list : []);
      })
      .catch(() => {
        if (!cancelled) setAds([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    portalLifecycle.loyalty.get()
      .then((data) => { if (!cancelled && data?.tier) setLoyaltyTier(data.tier); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const [notifRefreshFailed, setNotifRefreshFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    portalApi.get<{ count: number }>('/notifications/unread-count')
      .then((c) => { if (!cancelled) { setUnreadNotifications(c?.count ?? 0); setNotifRefreshFailed(false); } })
      .catch(() => { if (!cancelled) setNotifRefreshFailed(true); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let off = false;
    let unsub: (() => void) | undefined;
    (async () => {
      const T = ['invoice', 'order', 'sale', 'payment', 'quotation', 'request', 'shipment', 'delivery', 'delivery_note'];
      unsub = await portalLifecycle.subscribe({
        onEvent: (type, p) => {
          if ((p?.event === 'payment_allocated' || (p?.docType && T.includes(p.docType)) || type === 'activity' || type === 'notification') && !off) {
            refresh();
            loadDeliveryBanners();
            portalApi.get<{ count: number }>('/notifications/unread-count')
              .then((c) => { if (!off) { setUnreadNotifications(c?.count ?? 0); setNotifRefreshFailed(false); } })
              .catch(() => { if (!off) setNotifRefreshFailed(true); });
          }
        },
      });
    })();
    return () => {
      off = true;
      unsub?.();
    };
  }, [refresh, loadDeliveryBanners]);

  // Banner slides: ads first, then live promotions, padded with curated
  // slides so the carousel always has at least 3 slides.
  const slides = useMemo<Slide[]>(() => {
    const deliverySlides = (deliveryBanners || []).map((b) => deliveryToSlide(b, navigate));
    const adSlides = ads.map((a) => adToSlide(a, navigate));
    const promoSlides = (promotions || []).map((p) => promoToSlide(p, navigate));
    const fallbacks = buildFallbackSlides(navigate, displayName, companyName);
    const count = Math.max(3, deliverySlides.length + adSlides.length + promoSlides.length);
    return [...deliverySlides, ...adSlides, ...promoSlides, ...fallbacks].slice(0, count);
  }, [deliveryBanners, ads, promotions, navigate, displayName, companyName]);

  // Clamp index when the slide set changes (e.g. promotions arrive).
  useEffect(() => {
    if (active >= slides.length) setActive(0);
  }, [active, slides.length]);

  // Auto-advance, paused while hovered, when the tab is hidden, or when the
  // user prefers reduced motion.
  useEffect(() => {
    if (hovered || slides.length <= 1) return;
    if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    const id = setInterval(() => {
      if (document.visibilityState === 'visible') setActive((a) => (a + 1) % slides.length);
    }, 4500);
    return () => clearInterval(id);
  }, [hovered, slides.length]);

  if (loading) return <div style={{ padding: 12 }}><PortalLoadingSkeleton type="card" count={6} /></div>;
  if (error) return <div style={{ padding: 12 }}><ErrorBanner message={error} onDismiss={clearError} onRetry={refresh} /></div>;

  // Show at most 5 rows on the dashboard; the badge/sublabel use the full list.
  const displayedInvoices = unpaidInvoices.slice(0, 5);

  const handleQuoteSubmit = async (
    items: QuoteRequestItem[],
    requiredByDate: string,
    deliveryLocation: string,
    priority: 'standard' | 'urgent' | 'express',
    notes: string
  ) => {
    try {
      const extra = [priority && `Priority: ${priority}`, deliveryLocation && `Delivery: ${deliveryLocation}`].filter(Boolean).join('\n');
      await portalLifecycle.requests.create({
        requestType: 'quotation',
        items: items.map((i) => ({ name: i.name, quantity: i.quantity, unitPrice: i.targetPrice || 0 })),
        notes: [notes, extra].filter(Boolean).join('\n\n') || undefined,
        requestedDeliveryDate: requiredByDate || null,
      });
      setShowQuoteModal(false);
      addToast('success', 'Quotation request submitted');
      navigate('/portal/quotations');
    } catch (err: any) {
      addToast('error', err.message || 'Failed to submit quotation request');
    }
  };

  return (
    <div style={{ fontFamily: F, fontSize: 13, lineHeight: 1.4, color: '#1E293B', background: '#F5F6FA', minHeight: '100vh' }}>
      <style>{DASHBOARD_CSS}</style>

      {/* Account Header */}
      <div style={{ padding: '12px 16px 8px', position: 'relative' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <button
            onClick={() => window.dispatchEvent(new CustomEvent('toggle-portal-sidebar'))}
            aria-label="Toggle sidebar"
            style={{
              width: 36, height: 36, borderRadius: 10,
              border: '1px solid rgba(255,255,255,0.2)',
              background: 'rgba(15,44,89,0.85)',
              color: '#fff',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer',
              backdropFilter: 'blur(8px)',
              boxShadow: '0 4px 12px -2px rgba(15,44,89,0.4)',
            }}
          >
            <Menu size={18} />
          </button>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10, position: 'absolute', left: '50%', transform: 'translateX(-50%)' }}>
            <Building2 size={22} color="#0F2C59" />
            <span style={{ fontSize: 18, fontWeight: 700, color: '#0F172A', lineHeight: 1.2, whiteSpace: 'nowrap' }}>{companyName}</span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button
              onClick={() => navigate('/portal/notifications')}
              style={{
                position: 'relative', width: 40, height: 40, borderRadius: '50%',
                border: '1px solid #E2E8F0', background: '#fff',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer', color: '#475569',
              }}
            >
              <Bell size={20} />
              {unreadNotifications > 0 && (
                <span style={{
                  position: 'absolute', top: -2, right: -2,
                  minWidth: 18, height: 18, padding: '0 5px', borderRadius: 9999,
                  background: '#DC2626', color: '#fff',
                  fontSize: 10, fontWeight: 800, lineHeight: '18px', textAlign: 'center',
                }}>
                  {unreadNotifications}
                </span>
              )}
            </button>
            <button
              onClick={() => navigate('/portal/profile')}
              style={{
                width: 40, height: 40, borderRadius: '50%',
                background: '#2563EB', color: '#fff',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 16, fontWeight: 700, cursor: 'pointer',
                border: 'none',
              }}
            >
              {displayName.charAt(0).toUpperCase()}
            </button>
          </div>
        </div>
      </div>

      {/* Company Title Row */}
      <div style={{ padding: '8px 16px 4px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <div>
            <div style={{ fontSize: 22, fontWeight: 800, color: '#0F172A', lineHeight: 1.2, letterSpacing: '-0.02em' }}>{displayName}</div>
            <div style={{ fontSize: 12, color: '#64748B', marginTop: 2 }}>Account ID: {accountId}</div>
          </div>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 4, padding: '3px 10px', borderRadius: 9999, background: '#FFFBEB', border: '1px solid #FDE68A' }}>
            <span style={{ fontSize: 13 }}>🏆</span>
            <span style={{ fontSize: 12, fontWeight: 700, color: '#92400E' }}>{loyaltyTier || 'Member'}</span>
          </div>
         </div>
       </div>

      {/* Promotions Carousel Banner */}
      <div
        className="cpd-carousel"
        role="region"
        aria-roledescription="carousel"
        aria-label="Promotions and updates"
        style={{
          margin: '0 16px 16px', borderRadius: 16, overflow: 'hidden', position: 'relative',
          boxShadow: '0 18px 40px -22px rgba(15,44,89,.55)',
          border: '1px solid rgba(255,255,255,.12)',
        }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onTouchStart={(e) => { touchX.current = e.touches[0].clientX; }}
        onTouchEnd={(e) => {
          if (touchX.current === null) return;
          const dx = e.changedTouches[0].clientX - touchX.current;
          touchX.current = null;
          if (Math.abs(dx) > 40) {
            setActive((a) => (dx < 0 ? (a + 1) % slides.length : (a - 1 + slides.length) % slides.length));
          }
        }}
      >
        <div
          aria-live="polite"
          style={{
            display: 'flex',
            transition: 'transform .65s cubic-bezier(.4,0,.2,1)',
            transform: `translateX(-${active * 100}%)`,
          }}
        >
          {slides.map((s) => (
            <div
              key={s.id}
              onClick={s.onClick}
              style={{ minWidth: '100%', position: 'relative', background: s.gradient, cursor: 'pointer', overflow: 'hidden' }}
            >
              <div style={{ position: 'absolute', right: -40, top: -60, width: 190, height: 190, borderRadius: '50%', background: 'rgba(255,255,255,.07)' }} />
              <div style={{ position: 'absolute', left: -50, bottom: -90, width: 210, height: 210, borderRadius: '50%', background: 'rgba(255,255,255,.05)' }} />
              <div
                style={{
                  position: 'relative', padding: '16px 52px 22px 16px',
                  display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', minHeight: 92,
                }}
              >
                <div
                  style={{
                    width: 40, height: 40, borderRadius: 11, flexShrink: 0,
                    background: 'rgba(255,255,255,.16)', border: '1px solid rgba(255,255,255,.24)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff',
                    boxShadow: '0 4px 10px -4px rgba(0,0,0,.35)',
                  }}
                >
                  {s.icon}
                </div>
                <div style={{ flex: '1 1 220px', minWidth: 0 }}>
                  <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: '0.09em', textTransform: 'uppercase', color: 'rgba(255,255,255,.72)', marginBottom: 2 }}>
                    {s.badge}
                  </div>
                  <div style={{ fontSize: 15, fontWeight: 800, color: '#fff', lineHeight: 1.25 }}>{s.title}</div>
                  <div style={{ fontSize: 11.5, color: 'rgba(255,255,255,.8)', marginTop: 1, lineHeight: 1.45 }}>{s.subtitle}</div>
                </div>
                {s.cta ? (
                  <button
                    className="cpd-carousel-cta"
                    onClick={(e) => { e.stopPropagation(); navigate(s.cta!.to); }}
                    style={{
                      flexShrink: 0, display: 'flex', alignItems: 'center', gap: 4,
                      color: 'rgba(255,255,255,.92)', fontSize: 11, fontWeight: 700,
                      background: 'none', border: 'none', padding: 0, cursor: 'pointer',
                      fontFamily: F, lineHeight: 1.4,
                    }}
                  >
                    {s.cta.label} <ArrowRight size={12} />
                  </button>
                ) : (
                  <div className="cpd-carousel-cta" style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 4, color: 'rgba(255,255,255,.92)', fontSize: 11, fontWeight: 700 }}>
                    Explore <ArrowRight size={12} />
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Arrows */}
        {slides.length > 1 && (
          <>
            <button
              aria-label="Previous slide"
              className="cpd-carousel-arrow"
              onClick={() => setActive((a) => (a - 1 + slides.length) % slides.length)}
              style={{
                position: 'absolute', left: 6, top: '50%', transform: 'translateY(-50%)',
                width: 26, height: 26, borderRadius: '50%', border: 'none', cursor: 'pointer',
                background: 'rgba(255,255,255,.22)', color: '#fff', fontSize: 15, fontWeight: 800,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                backdropFilter: 'blur(4px)', zIndex: 2,
              }}
            >
              <ChevronLeft size={14} />
            </button>
            <button
              aria-label="Next slide"
              className="cpd-carousel-arrow"
              onClick={() => setActive((a) => (a + 1) % slides.length)}
              style={{
                position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)',
                width: 26, height: 26, borderRadius: '50%', border: 'none', cursor: 'pointer',
                background: 'rgba(255,255,255,.22)', color: '#fff', fontSize: 15, fontWeight: 800,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                backdropFilter: 'blur(4px)', zIndex: 2,
              }}
            >
              <ChevronRight size={14} />
            </button>
          </>
        )}

        {/* Dots */}
        {slides.length > 1 && (
          <div style={{ position: 'absolute', bottom: 4, left: 0, right: 0, display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 6, zIndex: 2 }}>
            {slides.map((s, i) => (
              <button
                key={s.id}
                aria-label={`Go to slide ${i + 1}`}
                aria-current={i === active ? 'true' : undefined}
                onClick={() => setActive(i)}
                style={{
                  width: 22, height: 18, padding: 0, border: 'none', background: 'transparent', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
              >
                <span
                  style={{
                    display: 'block',
                    width: i === active ? 18 : 6, height: 6, borderRadius: 3,
                    background: i === active ? '#fff' : 'rgba(255,255,255,.45)',
                    transition: 'all .25s ease',
                    boxShadow: i === active ? '0 1px 4px rgba(0,0,0,.3)' : 'none',
                  }}
                />
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Account Summary */}
      <div style={{ padding: '0 16px', marginBottom: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <h2 style={{ fontSize: 15, fontWeight: 600, color: '#0F172A', margin: 0 }}>Account Summary</h2>
          <button
            onClick={() => navigate('/portal/account-statements')}
            className="cpd-link"
            style={{ background: 'none', border: 'none', color: '#2563EB', fontSize: 12, fontWeight: 600, cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', gap: 2 }}
          >
            View All <ArrowRight size={12} />
          </button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'row', gap: 12 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <PremiumKPICard
              label="Outstanding Balance"
              value={fmtMoney(dashboardData?.outstandingBalance)}
              icon={FileText}
              badge={dashboardData?.unpaidInvoiceCount ? (overdueInvoices > 0 ? 'Overdue' : 'Due') : 'All Clear'}
              badgeColor={dashboardData?.unpaidInvoiceCount ? (overdueInvoices > 0 ? '#DC2626' : '#D97706') : '#059669'}
              sublabel={
                overdueInvoices > 0
                  ? `${overdueInvoices} Overdue`
                  : undefined
              }
              sublabelColor={dashboardData?.unpaidInvoiceCount ? '#DC2626' : '#059669'}
              trend={{ value: paymentHistory, positive: paymentHistory >= 80, suffix: 'paid on time' }}
              gradient="linear-gradient(135deg, #DC2626 0%, #991B1B 100%)"
              glowColor="rgba(220,38,38,0.2)"
              lightBg="#FFF5F5"
              iconBg="#DC2626"
              onClick={() => navigate('/portal/invoices?status=Unpaid')}
            />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <PremiumKPICard
              label="Wallet Balance"
              value={fmtMoney(dashboardData?.walletBalance || 0)}
              icon={Wallet}
              badge={dashboardData?.walletBalance > 0 ? 'Active' : 'No Balance'}
              badgeColor={dashboardData?.walletBalance > 0 ? '#059669' : '#94A3B8'}
              trend={{ value: onTimeScore, positive: onTimeScore >= 80, suffix: 'on-time history' }}
              gradient="linear-gradient(135deg, #059669 0%, #065F46 100%)"
              glowColor="rgba(5,150,105,0.2)"
              lightBg="#F0FDF4"
              iconBg="#059669"
              onClick={() => navigate('/portal/wallet')}
            />
          </div>
        </div>
      </div>

      {/* Active Promotions */}
      {promotions && promotions.length > 0 && (
        <div style={{ padding: '0 16px', marginBottom: 18 }}>
          <h2 style={{ fontSize: 15, fontWeight: 600, color: '#0F172A', margin: '0 0 10px' }}>Active Promotions</h2>
          <PromotionBanner promotions={promotions} onNavigate={(path) => navigate(path)} />
        </div>
      )}

      {/* Quick Actions */}
      <div style={{ padding: '0 16px', marginBottom: 18 }}>
        <h2 style={{ fontSize: 15, fontWeight: 600, color: '#0F172A', margin: '0 0 10px' }}>Quick Actions</h2>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
          {[
            { label: 'Pay Invoices', icon: <CreditCard size={18} />, to: '/portal/invoices?status=Unpaid', bg: 'linear-gradient(135deg,#1E3A8A,#0F2C59)' },
            { label: 'New Order', icon: <ShoppingBag size={18} />, to: '/portal/orders', bg: 'linear-gradient(135deg,#059669,#065F46)' },
            { label: 'Get Quote', icon: <ClipboardList size={18} />, to: '/portal/quotations', bg: 'linear-gradient(135deg,#D97706,#92400E)' },
            { label: 'Track Shipments', icon: <Truck size={18} />, to: '/portal/deliveries', bg: 'linear-gradient(135deg,#2563EB,#1E40AF)' },
            { label: 'Refer Business', icon: <Gift size={18} />, to: '/portal/referrals', bg: 'linear-gradient(135deg,#7C3AED,#5B21B6)' },
            { label: 'Statements', icon: <Wallet size={18} />, to: '/portal/account-statements', bg: 'linear-gradient(135deg,#0D9488,#115E59)' },
          ].map((a, i) => (
            <div
              key={i}
              onClick={() => (a.label === 'Get Quote' ? setShowQuoteModal(true) : navigate(a.to))}
              className="cpd-card"
              style={{
                background: '#fff', borderRadius: 14, padding: '14px 10px 12px',
                border: '1px solid #E8EDF5', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, cursor: 'pointer',
                boxShadow: '0 1px 3px rgba(15,23,42,.03)',
                transition: 'transform .18s ease, box-shadow .18s ease, border-color .18s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'translateY(-1px)';
                e.currentTarget.style.boxShadow = '0 4px 12px -4px rgba(15,44,89,.08)';
                e.currentTarget.style.borderColor = '#D8E0F0';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = '0 1px 3px rgba(15,23,42,.03)';
                e.currentTarget.style.borderColor = '#E8EDF5';
              }}
            >
              <div
                className="cpd-qicon"
                style={{
                  width: 36, height: 36, borderRadius: 11, background: a.bg, color: '#fff',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  boxShadow: '0 2px 8px -2px rgba(0,0,0,0.18)', border: '1px solid rgba(255,255,255,.2)',
                }}
              >
                {a.icon}
              </div>
              <span style={{ fontSize: 11.5, fontWeight: 600, color: '#334155' }}>{a.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Unpaid Invoices Needing Attention */}
      <div style={{ padding: '0 16px 24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <h2 style={{ fontSize: 15, fontWeight: 600, color: '#0F172A', margin: 0 }}>Unpaid Invoices Needing Attention</h2>
          <button
            onClick={() => navigate('/portal/invoices?status=Unpaid')}
            className="cpd-link"
            style={{ background: 'none', border: 'none', color: '#2563EB', fontSize: 12, fontWeight: 600, cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', gap: 2 }}
          >
            View All <ArrowRight size={12} />
          </button>
        </div>
        {displayedInvoices.length === 0 ? (
          <div
            style={{
              background: 'linear-gradient(150deg,#FFFFFF,#F8FAFF)', borderRadius: 16,
              border: '1px solid #E8EDF5', padding: 26, textAlign: 'center', color: '#94A3B8', fontSize: 12,
              boxShadow: '0 1px 4px rgba(15,23,42,.04)',
            }}
          >
            No unpaid invoices
          </div>
        ) : (
          <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #E8EDF5', overflow: 'hidden', boxShadow: '0 1px 4px rgba(15,23,42,.04)' }}>
            {displayedInvoices.map((inv, i) => (
              <div
                key={inv.id}
                onClick={() => navigate(`/portal/invoices/${inv.id}`)}
                className="cpd-row"
                style={{
                  display: 'flex', alignItems: 'center', padding: '13px 14px',
                  borderTop: i > 0 ? '1px solid #F1F5F9' : undefined, cursor: 'pointer',
                }}
              >
                <div style={{ width: 36, height: 36, borderRadius: 10, background: '#FEF2F2', color: '#DC2626', display: 'flex', alignItems: 'center', justifyContent: 'center', marginRight: 10, flexShrink: 0 }}>
                  <FileText size={18} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#0F172A', lineHeight: 1.3 }}>{inv.invoice_number || inv.id}</div>
                  <div style={{ fontSize: 11, color: '#64748B', marginTop: 1 }}>Invoice Date: {inv.created_at ? new Date(inv.created_at).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' }) : '-'}</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                  {/overdue/i.test(String(inv.status || '')) && (
                    <span style={{ fontSize: 10, fontWeight: 700, color: '#DC2626', background: '#FEF2F2', padding: '2px 8px', borderRadius: 5, textTransform: 'uppercase' }}>Overdue</span>
                  )}
                  <span style={{ fontSize: 14, fontWeight: 700, color: '#DC2626', fontVariantNumeric: 'tabular-nums' }}>{fmtMoney(inv.total_amount || 0)}</span>
                  <ChevronRight size={16} color="#CBD5E0" />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <QuoteRequestModal
        isOpen={showQuoteModal}
        onClose={() => setShowQuoteModal(false)}
        onSubmitQuoteRequest={handleQuoteSubmit}
      />
    </div>
  );
};

export default CustomerDashboard;
