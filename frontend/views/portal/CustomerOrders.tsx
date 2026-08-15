import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  ShoppingCart, Plus, Minus, Search, Package,
  ChevronRight, MapPin, Truck, X, Receipt, Loader2, CheckCircle2, RefreshCw, Star,
  Filter, Layers, Check,
} from 'lucide-react';
import { portalLifecycle, PortalCatalogItem, PortalCatalogVariant, PortalPromotionInfo, buildQueryString } from '../../services/portalApiClient';
import { usePortalData } from './hooks/usePortalData';
import { useCart, CartProvider } from '../../context/CartContext';
import { useToast } from './components/Toast';
import PortalInput from './components/PortalInput';
import ErrorBanner from './components/ErrorBanner';
import EmptyState from './components/EmptyState';
import PortalLoadingSkeleton from './components/PortalLoadingSkeleton';
import { F, MONO, TEAL_GRADIENT } from './designTokens';
import { DEFAULT_PAGE_SIZE, formatK } from './constants';


type Tab = 'catalog' | 'history';
type TypeFilter = 'all' | 'Product' | 'Stationery' | 'Service';

const parseItems = (raw: any): { name: string; quantity: number; unitPrice: number; lineTotal: number }[] => {
  let arr = raw;
  if (typeof raw === 'string') {
    try { arr = JSON.parse(raw); } catch { arr = []; }
  }
  if (!Array.isArray(arr)) return [];
  return arr.map((it: any) => {
    const unitPrice = Number(it.price ?? it.unitPrice ?? it.unit_price ?? 0);
    const quantity = Number(it.quantity ?? 1);
    return {
      name: it.name || it.productName || it.product_name || it.description || 'Item',
      quantity,
      unitPrice,
      lineTotal: Number(it.lineTotal ?? it.line_total ?? unitPrice * quantity),
    };
  });
};

interface OrderRow {
  id: string;
  orderNumber: string;
  orderDate: string;
  totalAmount: number;
  status: string;
  items: ReturnType<typeof parseItems>;
  shippingAddress: string | null;
  trackingNumber: string | null;
  carrier: string | null;
  driverName: string | null;
  vehicleNo: string | null;
  currentLocation: string | null;
  estimatedDelivery: string | null;
}

const mapOrder = (o: any): OrderRow => ({
  id: o.id,
  orderNumber: o.order_number || o.orderNumber || o.id.slice(0, 8),
  orderDate: o.orderDate || o.order_date || o.created_at || '',
  totalAmount: Number(o.totalAmount ?? o.total ?? 0),
  status: o.status || 'Pending',
  items: parseItems(o.items_json ?? o.items ?? o.itemsJson),
  shippingAddress: o.shipping_address || o.shippingAddress || null,
  trackingNumber: o.tracking_number || o.trackingNumber || null,
  carrier: o.carrier || null,
  driverName: o.driver_name || o.driverName || null,
  vehicleNo: o.vehicle_no || o.vehicleNo || null,
  currentLocation: o.current_location || o.currentLocation || null,
  estimatedDelivery: o.estimated_delivery || o.estimatedDelivery || null,
});

const chipMeta = (status: string) => {
  const s = (status || '').toLowerCase();
  if (s === 'delivered' || s === 'fulfilled' || s === 'completed') return { label: 'DELIVERED', color: '#2563EB', bg: 'transparent' };
  if (s === 'shipped' || s === 'in_transit') return { label: 'IN_TRANSIT', color: '#2563EB', bg: 'transparent' };
  if (s === 'processing' || s === 'confirmed') return { label: 'PROCESSING', color: '#D97706', bg: 'transparent' };
  if (s === 'pending') return { label: 'PENDING', color: '#D97706', bg: 'transparent' };
  if (s === 'cancelled') return { label: 'CANCELLED', color: '#DC2626', bg: 'transparent' };
  return { label: status || 'UNKNOWN', color: '#6B7280', bg: 'transparent' };
};

const TYPE_FILTERS: { key: TypeFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'Product', label: 'Printed Products' },
  { key: 'Stationery', label: 'Stationery' },
  { key: 'Service', label: 'Service' },
];

const variantAttributes = (v: PortalCatalogVariant): string => {
  if (!v.attributes || typeof v.attributes !== 'object') return '';
  return Object.entries(v.attributes)
    .filter(([, val]) => val != null && val !== '')
    .map(([key, val]) => `${key}: ${val}`)
    .join(' · ');
};

const OrdersInner: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { addToast } = useToast();
  const { items: cartItems, itemCount, total: cartTotal, addItem, updateQuantity, clearCart } = useCart();

  const [tab, setTab] = useState<Tab>(searchParams.get('tab') === 'history' ? 'history' : 'catalog');
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [filter, setFilter] = useState('All');
  const [page, setPage] = useState(1);

  const [products, setProducts] = useState<PortalCatalogItem[]>([]);
  const [promotions, setPromotions] = useState<PortalPromotionInfo[]>([]);
  const [addedIds, setAddedIds] = useState<Set<string>>(new Set());
  const catalog = usePortalData<PortalCatalogItem[]>({
    key: '/catalog',
    label: 'Orders · Catalog',
    fetcher: () => portalLifecycle.catalog.list(),
    onData: (data) => {
      if (Array.isArray(data) && data.length > 0) setProducts(data);
      else setProducts([]);
    },
  });

  useEffect(() => {
    let cancelled = false;
    portalLifecycle.promotions.list()
      .then((p) => { if (!cancelled) setPromotions(p || []); })
      .catch(() => { /* display-only, non-fatal */ });
    return () => { cancelled = true; };
  }, []);

  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const history = usePortalData<any>({
    key: buildQueryString({ page, pageSize: DEFAULT_PAGE_SIZE, search: search || undefined, status: filter === 'All' ? undefined : filter }) || '/orders',
    label: 'Orders · History',
    fetcher: () => portalLifecycle.orders.list({ page, pageSize: DEFAULT_PAGE_SIZE, search: search || undefined, status: filter === 'All' ? undefined : filter }),
    onData: (data: any) => {
      if (data && 'orders' in data) {
        setOrders((data.orders || []).map(mapOrder));
        setTotalPages(data.totalPages || 1);
        setTotal(data.total || 0);
      } else if (Array.isArray(data) && data.length > 0) {
        setOrders(data.map(mapOrder));
        setTotalPages(1);
        setTotal(data.length);
      } else {
        setOrders([]);
        setTotalPages(1);
        setTotal(0);
      }
    },
  });

   const [reviewOpen, setReviewOpen] = useState(false);
   const [deliveryAddress, setDeliveryAddress] = useState('');
   const [submitting, setSubmitting] = useState(false);
   const [variantModalProduct, setVariantModalProduct] = useState<PortalCatalogItem | null>(null);
   const [detailProduct, setDetailProduct] = useState<PortalCatalogItem | null>(null);

   const topSellingNames = useMemo(() => {
     const counts = new Map<string, number>();
     orders.forEach((o) => {
       o.items.forEach((it) => {
         const name = (it.name || '').trim();
         if (!name) return;
         counts.set(name, (counts.get(name) || 0) + it.quantity);
       });
     });
     const sorted = Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
     const top = sorted.slice(0, 5);
     return new Set(top.map(([name]) => name));
   }, [orders]);

  useEffect(() => {
    let cancelled = false;
    portalLifecycle.profile.get()
      .then((p: any) => {
        if (cancelled || !p) return;
        const addr = [p.address, p.city, p.state, p.zip, p.country].filter(Boolean).join(', ');
        if (addr.trim()) setDeliveryAddress(addr.trim());
      })
      .catch(() => { /* non-fatal */ });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    setSearchParams(tab === 'history' ? { tab: 'history' } : {}, { replace: true });
  }, [tab, setSearchParams]);

  useEffect(() => { setPage(1); }, [tab, search, filter]);

  const filteredProducts = useMemo(() => {
    const q = search.trim().toLowerCase();
    return products.filter((p) => {
      const matchSearch = !q
        || p.name?.toLowerCase().includes(q)
        || p.sku?.toLowerCase().includes(q)
        || `${p.category || ''}`.toLowerCase().includes(q);
      const matchType = typeFilter === 'all'
        || String(p.type || '').toLowerCase() === typeFilter.toLowerCase();
      return matchSearch && matchType;
    });
  }, [products, search, typeFilter]);

  const availableStatuses = ['All', 'Pending', 'Processing', 'Confirmed', 'Shipped', 'In Transit', 'Out for Delivery', 'Delivered', 'Cancelled'];

  const ordersTotalValue = useMemo(() => orders.reduce((s, o) => s + o.totalAmount, 0), [orders]);
  const pendingCount = useMemo(() => orders.filter((o) => ['Pending', 'Processing', 'Confirmed'].includes(o.status)).length, [orders]);

  const promoForProduct = (product: PortalCatalogItem): PortalPromotionInfo | null =>
    promotions.find((p) => p.isAutoApply && (
      p.applicableTo === 'all' ||
      (p.applicableTo === 'categories' && (p.categoryIds || []).includes(product.category || '')) ||
      (p.applicableTo === 'products' && (p.productIds || []).includes(product.id))
    )) || null;

  const promoPrice = (price: number, promo: PortalPromotionInfo | null): number => {
    if (!promo) return price;
    if (promo.discountType === 'percentage') return Math.round(price * (1 - promo.discountValue / 100) * 100) / 100;
    if (promo.discountType === 'fixed_amount') return Math.max(0, price - promo.discountValue);
    if (promo.discountType === 'fixed_price') return Math.min(price, promo.discountValue);
    return price;
  };

  const handleAdd = (product: PortalCatalogItem, variant?: PortalCatalogVariant | null) => {
    addItem(product, 1, variant);
    const key = variant ? `${product.id}::${variant.id}` : product.id;
    setAddedIds((prev) => new Set(prev).add(key));
    setTimeout(() => {
      setAddedIds((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    }, 1200);
    const label = variant ? `${product.name} (${variantAttributes(variant) || variant.name})` : product.name;
    addToast('success', `${label} added to cart`);
  };

  const handleReorder = (order: OrderRow) => {
    if (!order.items.length) {
      addToast('error', 'This order has no line items to reorder');
      return;
    }
    order.items.forEach((it) => {
      addItem(
        {
          id: `reorder-${order.id}-${it.name}`,
          name: it.name,
          unitPrice: it.unitPrice,
          price: it.unitPrice,
        } as PortalCatalogItem,
        it.quantity
      );
    });
    addToast('success', `Items from ${order.orderNumber} added to your order`);
    setTab('catalog');
  };

  const handleSubmitOrder = async () => {
    if (cartItems.length === 0 || submitting) return;
    setSubmitting(true);
    try {
      const created = await portalLifecycle.requests.create({
        requestType: 'order',
        items: cartItems.map((i) => ({
          productId: i.selectedVariant ? i.selectedVariant.id : i.product.id,
          name: i.selectedVariant
            ? `${i.product.name} - ${i.selectedVariant.name}`
            : i.product.name,
          quantity: i.quantity,
            unitPrice: i.selectedVariant
              ? Number(i.selectedVariant.sellingPrice || (i.product.unitPrice ?? i.product.price ?? 0))
              : Number(i.product.unitPrice ?? i.product.price ?? 0),
        })),
        notes: deliveryAddress.trim() ? `Delivery address: ${deliveryAddress.trim()}` : undefined,
      });
      addToast('success', `Order submitted — ${created.request_number || 'request received'}. Our team will confirm shortly.`);
      clearCart();
      setReviewOpen(false);
      history.refresh();
    } catch (err: any) {
      addToast('error', err.message || 'Failed to submit order');
    } finally {
      setSubmitting(false);
    }
  };

  // The review Total must equal what is actually submitted. Tax is applied
  // only on official quotations/orders created by the ERP team (which carry
  // tax_rate/tax_amount) — quotation_requests are stored tax-free, so a hardcoded
  // estimate here would silently mislead the customer.
  const subtotal = cartTotal;

  const catalogLoading = catalog.loading && products.length === 0;
  const historyLoading = history.loading && page === 1;

  return (
    <div style={{ fontFamily: F, fontSize: 13.5, lineHeight: 1.45, color: '#1E293B', paddingBottom: cartItems.length > 0 ? 90 : 16 }}>
      <style>{`
        @keyframes cpoSlideUp { from { transform: translateY(100%); opacity: 0 } to { transform: translateY(0); opacity: 1 } }
        @keyframes cpoFadeIn { from { opacity: 0 } to { opacity: 1 } }
        @keyframes cpoBarIn { from { transform: translateY(24px); opacity: 0 } to { transform: translateY(0); opacity: 1 } }
        @keyframes cpoPulse { 0%,100% { box-shadow: 0 6px 18px -6px rgba(0,138,76,.55) } 50% { box-shadow: 0 6px 26px -4px rgba(0,138,76,.8) } }
        .cpo-scroll::-webkit-scrollbar { display: none }
        .cpo-scroll { scrollbar-width: none; -ms-overflow-style: none }
      `}</style>

      {/* ── Top Bar Header ── */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16,
        margin: '4px 16px 18px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{
            width: 50, height: 50, borderRadius: 15,
            background: 'linear-gradient(160deg, #4A76B5 0%, #0F2C59 100%)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 8px 20px -8px rgba(15,44,89,0.6), inset 0 1px 0 rgba(255,255,255,0.25)',
          }}>
            <Package size={24} style={{ color: '#fff' }} />
          </div>
          <div>
            <h1 style={{ fontSize: 21, fontWeight: 700, color: '#0F172A', margin: 0, letterSpacing: '-0.02em', lineHeight: 1.25 }}>
              Orders
            </h1>
            <p style={{ fontSize: 13, fontWeight: 500, color: '#64748B', margin: '3px 0 0', lineHeight: 1.4 }}>
              Browse products and track your orders
            </p>
          </div>
        </div>
      </div>

      {/* ── Tabs ── */}
      <div style={{ padding: '0 16px' }}>
        <div style={{ display: 'flex', gap: 6, padding: '6px 0', borderBottom: '1px solid #E9EDF3', marginBottom: 4 }}>
          {([['catalog', 'Product Catalog', Package], ['history', `Order History (${total})`, Receipt]] as [Tab, string, React.ElementType][]).map(([key, label, Icon]) => {
            const active = tab === key;
            return (
              <button
                key={key}
                onClick={() => { setTab(key); setSearch(''); setFilter('All'); setTypeFilter('all'); }}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  padding: '8px 4px', borderRadius: 0, border: 'none', borderBottom: active ? '2px solid #0F2C59' : '2px solid transparent', cursor: 'pointer',
                  fontFamily: F, fontSize: 13, fontWeight: 600,
                  background: 'transparent',
                  color: active ? '#0F2C59' : '#718096',
                  transition: 'all .15s ease', lineHeight: 1.4,
                }}
              >
                <Icon size={15} />
                {label}
              </button>
            );
          })}
        </div>
      </div>

      {/* ═══════════════ PRODUCT CATALOG TAB ═══════════════ */}
      {tab === 'catalog' && (
        <div style={{ padding: '0 16px' }}>
          {catalog.error && <ErrorBanner message={catalog.error} onDismiss={catalog.clearError} onRetry={catalog.refresh} />}

          {/* Search */}
          <div style={{ position: 'relative', margin: '14px 0 10px' }}>
            <Search size={16} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: '#8A94A6', pointerEvents: 'none', zIndex: 1 }} />
            <PortalInput
              label=""
              placeholder="Search products by name, SKU, or category..."
              value={search}
              onChange={setSearch}
              onFocus={() => {}}
              onBlur={() => {}}
              style={{ paddingLeft: 40, height: 44, fontSize: 13, fontFamily: F, padding: '8px 12px 8px 40px', border: '1px solid #E9EDF3', borderRadius: 10, background: '#fff', color: '#1A202C', outline: 'none', width: '100%' }}
            />
          </div>

          {/* Type Filter Chips */}
          <div className="cpo-scroll" style={{ display: 'flex', gap: 6, overflowX: 'auto', padding: '2px 1px 10px' }}>
            {TYPE_FILTERS.map(({ key, label }) => {
              const active = typeFilter === key;
              return (
                <button
                  key={key}
                  onClick={() => setTypeFilter(key)}
                  style={{
                    flexShrink: 0, fontFamily: F, fontSize: 12, fontWeight: 600,
                    padding: '7px 14px', borderRadius: 9, border: active ? '1px solid transparent' : '1px solid #E9EDF3',
                    background: active ? '#0F2C59' : '#fff',
                    color: active ? '#fff' : '#718096', cursor: 'pointer',
                    transition: 'all .15s ease', lineHeight: 1.4,
                    display: 'inline-flex', alignItems: 'center', gap: 5,
                  }}
                >
                  {key === 'all' ? <Filter size={12} /> : key === 'Product' ? <Package size={12} /> : key === 'Stationery' ? <Layers size={12} /> : <Truck size={12} />}
                  {label}
                </button>
              );
            })}
          </div>

          {/* Product Cards Grid */}
          {catalogLoading ? (
            <div style={{ padding: 8 }}><PortalLoadingSkeleton type="card" count={6} /></div>
          ) : filteredProducts.length === 0 ? (
            <EmptyState
              icon={<Package size={28} />}
              title="No products found"
              description={search || typeFilter !== 'all' ? 'Try adjusting your search or filter.' : 'No products available in the catalog yet.'}
            />
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12, padding: '4px 0 16px' }}>
              {filteredProducts.map((product) => {
                const price = Number(product.unitPrice ?? product.price ?? 0);
                const promo = promoForProduct(product);
                const shownPrice = promoPrice(price, promo);
                const stock = Number(product.quantity ?? 0);
                const isService = String(product.type || '').toLowerCase() === 'service';
                const inStock = isService || stock > 0;
                const hasVariants = product.variants && product.variants.length > 0;
                const typeLabel = product.type || '';
                const typeColor =
                  String(product.type || '').toLowerCase() === 'service' ? '#2563EB'
                  : String(product.type || '').toLowerCase() === 'stationery' ? '#D97706'
                  : String(product.type || '').toLowerCase() === 'product' ? '#047857'
                  : '#6B7280';

                return (
                  <div
                    key={product.id}
                    style={{
                      border: '1px solid #E9EDF3',
                      borderRadius: 14,
                      background: '#fff',
                      overflow: 'hidden',
                      transition: 'all 200ms cubic-bezier(.4,0,.2,1)',
                      display: 'flex', flexDirection: 'column',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.boxShadow = '0 8px 24px -8px rgba(15,44,89,0.12)';
                      e.currentTarget.style.borderColor = '#0F2C59';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.boxShadow = 'none';
                      e.currentTarget.style.borderColor = '#E9EDF3';
                    }}
                  >
                    {/* Clickable details region — a single focusable element containing
                        only non-interactive content, so keyboard + screen-reader users
                        can open the detail modal and no key events bubble from the
                        footer buttons (those are siblings below). */}
                    <div
                      role="button"
                      tabIndex={0}
                      aria-label={`View details for ${product.name}`}
                      onClick={() => setDetailProduct(product)}
                      onKeyDown={(e) => {
                        if (e.target !== e.currentTarget) return;
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          setDetailProduct(product);
                        }
                      }}
                      style={{ display: 'flex', flexDirection: 'column', flex: 1, cursor: 'pointer' }}
                    >
                    {/* Card Header */}
                    <div style={{ padding: '16px 16px 10px', borderBottom: '1px solid #F1F5F9' }}>
                      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <h3 style={{ fontSize: 15, fontWeight: 700, color: '#0F172A', margin: 0, lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {product.name}
                          </h3>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
                            {typeLabel && (
                              <span style={{
                                display: 'inline-flex', alignItems: 'center',
                                padding: '2px 8px', borderRadius: 5,
                                background: `${typeColor}14`,
                                color: typeColor,
                                fontSize: 10, fontWeight: 700, letterSpacing: '0.04em',
                              }}>
                                {typeLabel}
                              </span>
                            )}
                            {product.sku && (
                              <span style={{ fontSize: 11, color: '#64748B', fontFamily: MONO }}>
                                {product.sku}
                              </span>
                            )}
                          </div>
                        </div>
                        <div style={{ textAlign: 'right', flexShrink: 0 }}>
                          <div style={{ fontSize: 17, fontWeight: 800, color: '#0F172A', fontFamily: F, fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.01em' }}>
                            {formatK(shownPrice)}
                          </div>
                          {product.unit && <div style={{ fontSize: 11, color: '#64748B', marginTop: 2 }}>per {product.unit}</div>}
                        </div>
                      </div>
                    </div>

                    {/* Card Body */}
                    <div style={{ padding: '10px 16px', flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {product.description && (
                        <p style={{ fontSize: 12, color: '#64748B', margin: 0, lineHeight: 1.5, overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                          {product.description}
                        </p>
                      )}

                      {promo && (
                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6, padding: '6px 8px', borderRadius: 7, background: '#FEF3C7', border: '1px solid #FDE68A' }}>
                          <Star size={12} color="#D97706" fill="#D97706" style={{ flexShrink: 0, marginTop: 1 }} />
                          <div style={{ fontSize: 11, color: '#92400E', lineHeight: 1.4 }}>
                            <span style={{ fontWeight: 700 }}>{promo.name}</span>
                            {promo.description && (
                              <span style={{ marginLeft: 4 }}>{promo.description}</span>
                            )}
                            {!promo.description && (
                              <span style={{ marginLeft: 4 }}>
                                {promo.discountType === 'percentage' && `${promo.discountValue}% off`}
                                {promo.discountType === 'fixed_amount' && `K${promo.discountValue} off`}
                                {promo.discountType === 'fixed_price' && `Fixed price K${promo.discountValue}`}
                              </span>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Stock Status */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 'auto' }}>
                        {isService ? (
                          <>
                            <span style={{ width: 8, height: 8, borderRadius: 4, background: '#2563EB', boxShadow: '0 0 0 3px rgba(37,99,235,.15)' }} />
                            <span style={{ fontSize: 11, fontWeight: 600, color: '#1D4ED8' }}>Service</span>
                          </>
                        ) : inStock ? (
                          <>
                            <span style={{ width: 8, height: 8, borderRadius: 4, background: '#22C55E', boxShadow: '0 0 0 3px rgba(34,197,94,.15)' }} />
                            <span style={{ fontSize: 11, fontWeight: 600, color: '#047857' }}>In Stock</span>
                            <span style={{ fontSize: 10, color: '#64748B' }}>· {stock} unit{stock === 1 ? '' : 's'}</span>
                          </>
                        ) : (
                          <>
                            <span style={{ width: 8, height: 8, borderRadius: 4, background: '#F59E0B' }} />
                            <span style={{ fontSize: 11, fontWeight: 600, color: '#B45309' }}>Out of Stock</span>
                          </>
                        )}
                        {hasVariants && (
                          <span style={{ fontSize: 10, color: '#6366F1', fontWeight: 600, marginLeft: 'auto' }}>
                            {product.variants!.length} variant{product.variants!.length !== 1 ? 's' : ''}
                          </span>
                        )}
                      </div>
                    </div>
                    </div>

                    {/* Card Footer */}
                    <div style={{ padding: '10px 16px 14px', borderTop: '1px solid #F1F5F9', display: 'flex', gap: 8 }}>
                      {hasVariants ? (
                        <button
                          onClick={() => setVariantModalProduct(product)}
                          disabled={!inStock}
                          style={{
                            flex: 1, padding: '9px 14px', borderRadius: 9, border: '1px solid #E9EDF3',
                            background: '#fff',
                            color: !inStock ? '#94A3B8' : '#0F2C59',
                            fontSize: 12, fontWeight: 700,
                            cursor: !inStock ? 'not-allowed' : 'pointer',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                            transition: 'all .15s ease',
                          }}
                        >
                          <Layers size={13} /> Choose Variant
                        </button>
                      ) : (() => {
                        const isAdded = addedIds.has(product.id);
                        return (
                          <button
                            onClick={() => handleAdd(product)}
                            disabled={!inStock || isAdded}
                            style={{
                              flex: 1, padding: '9px 14px', borderRadius: 9, border: 'none',
                              background: isAdded ? '#059669' : !inStock ? '#E2E8F0' : TEAL_GRADIENT,
                              color: !inStock ? '#94A3B8' : '#fff', fontSize: 12, fontWeight: 700,
                              cursor: !inStock || isAdded ? 'not-allowed' : 'pointer',
                              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                              boxShadow: inStock && !isAdded ? '0 4px 14px -4px rgba(15,84,76,0.55)' : 'none',
                              transition: 'all .15s ease',
                            }}
                          >
                            {isAdded ? <><Check size={13} /> Added</> : <><ShoppingCart size={13} /> Add to Order</>}
                          </button>
                        );
                      })()}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ═══════════════ ORDER HISTORY TAB ═══════════════ */}
      {tab === 'history' && (
        <div style={{ padding: '0 16px' }}>
          {history.error && <ErrorBanner message={history.error} onDismiss={history.clearError} onRetry={history.refresh} />}

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '12px 0 8px' }}>
            <div style={{ position: 'relative', flex: '1 1 240px' }}>
              <Search size={16} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: '#8A94A6', pointerEvents: 'none', zIndex: 1 }} />
              <PortalInput
                label=""
                placeholder="Search orders by reference..."
                value={search}
                onChange={(v) => { setPage(1); setSearch(v); }}
                onFocus={() => {}}
                onBlur={() => {}}
                style={{ paddingLeft: 40, height: 44, fontSize: 13, fontFamily: F, padding: '8px 12px 8px 40px', border: '1px solid #E9EDF3', borderRadius: 10, background: '#fff', color: '#1A202C', outline: 'none', width: '100%' }}
              />
            </div>
            <select
              value={filter}
              onChange={(e) => { setPage(1); setFilter(e.target.value); }}
              aria-label="Filter by status"
              style={{
                fontFamily: F, fontSize: 13, padding: '8px 32px 8px 12px',
                border: filter !== 'All' ? '1px solid #a6d9d3' : '1px solid #E9EDF3', borderRadius: 10, background: '#fff', color: '#1A202C',
                appearance: 'none', backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%235c6567'/%3E%3C/svg%3E")`,
                backgroundRepeat: 'no-repeat', backgroundPosition: 'right 14px center', cursor: 'pointer',
                boxShadow: filter !== 'All' ? '0 0 0 3px #ECFDF5' : 'none', outline: 'none', transition: 'all .15s ease', lineHeight: 1.4,
              }}
            >
              {availableStatuses.map((s) => <option key={s} value={s}>{s === 'All' ? 'All Statuses' : s}</option>)}
            </select>
          </div>

          {historyLoading ? (
            <div style={{ padding: 8 }}><PortalLoadingSkeleton type="table" count={5} /></div>
          ) : orders.length === 0 ? (
            <EmptyState icon={<ShoppingCart size={28} />} title="No orders yet" description={filter !== 'All' ? `No orders with status "${filter}".` : 'Your order history will appear here once you place your first order.'} />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
              {orders.map((order) => {
                const meta = chipMeta(order.status);
                const date = order.orderDate ? new Date(order.orderDate) : null;
                return (
                  <div
                    key={order.id}
                    style={{
                      padding: '10px 12px',
                      borderBottom: '1px solid #E2E8F0',
                      borderLeft: '3px solid transparent',
                      borderRadius: 8,
                      background: '#fff',
                      transition: 'all 200ms cubic-bezier(.4,0,.2,1)',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = '#F8FAFC';
                      e.currentTarget.style.borderLeftColor = '#0F2C59';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = '#fff';
                      e.currentTarget.style.borderLeftColor = 'transparent';
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 6 }}>
                      <div>
                        <div style={{ fontSize: 15, fontWeight: 700, color: '#1A202C', fontFamily: MONO, fontVariantNumeric: 'tabular-nums' }}>{order.orderNumber}</div>
                        <div style={{ fontSize: 12, color: '#64748B', marginTop: 2 }}>Date: {date ? date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}</div>
                      </div>
                      <span style={{
                        display: 'inline-flex', alignItems: 'center',
                        padding: '3px 10px', borderRadius: 6,
                        border: `1px solid ${meta.color}40`,
                        color: meta.color,
                        fontSize: 10, fontWeight: 700, letterSpacing: '0.05em',
                        whiteSpace: 'nowrap',
                      }}>
                        {meta.label}
                      </span>
                    </div>
                    {order.items.length > 0 && (
                      <div style={{ fontSize: 13.5, color: '#374151', lineHeight: 1.5, marginBottom: 10, display: 'flex', flexWrap: 'wrap', gap: '6px 12px' }}>
                        {order.items.map((it, idx) => {
                          const isTop = topSellingNames.has(it.name);
                          return (
                            <span key={idx} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                              <span>{it.quantity}x {it.name}</span>
                              {isTop && <Star size={13} color="#D97706" fill="#D97706" style={{ flexShrink: 0 }} />}
                            </span>
                          );
                        })}
                      </div>
                    )}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                      <div style={{ fontSize: 15, fontWeight: 700, color: '#1A202C', fontFamily: F, fontVariantNumeric: 'tabular-nums' }}>Total: {formatK(order.totalAmount)}</div>
                      <button
                        onClick={() => handleReorder(order)}
                        style={{
                          display: 'inline-flex', alignItems: 'center', gap: 6,
                          padding: '7px 16px', borderRadius: 9999,
                          border: '1px solid #D1D5DB',
                          background: '#fff',
                          color: '#374151',
                          fontSize: 12, fontWeight: 600,
                          cursor: 'pointer',
                        }}
                      >
                        <RefreshCw size={13} /> Reorder
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {totalPages > 1 && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 4, marginBottom: 24, gap: 12 }}>
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page <= 1}
                style={{ flex: 1, padding: '8px 14px', borderRadius: 10, border: '1px solid #E9EDF3', background: '#fff', cursor: page <= 1 ? 'not-allowed' : 'pointer', opacity: page <= 1 ? 0.4 : 1, fontSize: 12, fontWeight: 600, color: '#4A5568', fontFamily: F, lineHeight: 1.4 }}
              >
                Previous
              </button>
              <div style={{ fontSize: 12, color: '#8A94A6', fontWeight: 600 }}>Page {page} of {totalPages}</div>
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                style={{ flex: 1, padding: '8px 14px', borderRadius: 10, border: '1px solid #E9EDF3', background: '#fff', cursor: page >= totalPages ? 'not-allowed' : 'pointer', opacity: page >= totalPages ? 0.4 : 1, fontSize: 12, fontWeight: 600, color: '#4A5568', fontFamily: F, lineHeight: 1.4 }}
              >
                Next
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── Floating Order Summary Bar ── */}
      {tab === 'catalog' && cartItems.length > 0 && (
        <div style={{
          position: 'fixed', bottom: 56, left: 0, right: 0, zIndex: 40,
          background: '#fff', borderTop: '1px solid #E9EDF3', boxShadow: '0 -6px 24px rgba(0,0,0,0.12)',
          padding: '12px 16px', animation: 'cpoBarIn .25s ease',
        }}>
          <div style={{ maxWidth: 860, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
              <div style={{ width: 38, height: 38, borderRadius: 12, background: '#0F2C59', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', animation: 'cpoPulse 2s ease-in-out infinite' }}>
                <ShoppingCart size={17} />
                <span style={{ position: 'absolute', top: -5, right: -5, minWidth: 17, height: 17, borderRadius: 9, background: '#E53E3E', color: '#fff', fontSize: 9.5, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 4px', border: '1.5px solid #fff' }}>
                  {itemCount}
                </span>
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#1A202C' }}>{itemCount} item{itemCount !== 1 ? 's' : ''} in cart</div>
                <div style={{ fontSize: 12, color: '#8A94A6', fontFamily: "'JetBrains Mono', monospace", fontWeight: 600 }}>Total: {formatK(cartTotal)}</div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
              <button
                onClick={clearCart}
                style={{ padding: '8px 14px', borderRadius: 9, border: '1px solid #E9EDF3', background: '#fff', fontSize: 12, fontWeight: 600, color: '#4A5568', cursor: 'pointer', fontFamily: F }}
              >
                Clear
              </button>
              <button
                onClick={() => setReviewOpen(true)}
                style={{ padding: '8px 14px', borderRadius: 9, border: 'none', background: '#0F2C59', color: '#fff', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, boxShadow: '0 4px 12px -4px rgba(15,44,89,.55)', fontFamily: F }}
              >
                View Cart & Checkout <ChevronRight size={14} />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Product Detail Modal ── */}
      {detailProduct && (() => {
        const mPrice = Number(detailProduct.unitPrice ?? detailProduct.price ?? 0);
        const mPromo = promoForProduct(detailProduct);
        const mShownPrice = promoPrice(mPrice, mPromo);
        const mStock = Number(detailProduct.quantity ?? 0);
        const mIsService = String(detailProduct.type || '').toLowerCase() === 'service';
        const mInStock = mIsService || mStock > 0;
        const mHasVariants = !!(detailProduct.variants && detailProduct.variants.length > 0);
        const mTypeLabel = detailProduct.type || '';
        const mTypeColor =
          String(detailProduct.type || '').toLowerCase() === 'service' ? '#2563EB'
          : String(detailProduct.type || '').toLowerCase() === 'stationery' ? '#D97706'
          : String(detailProduct.type || '').toLowerCase() === 'product' ? '#047857'
          : '#6B7280';
        return createPortal(
          <div
            style={{ position: 'fixed', inset: 0, background: 'rgba(2,8,23,.55)', backdropFilter: 'blur(2px)', zIndex: 91, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', animation: 'cpoFadeIn .18s ease' }}
            onMouseDown={(e) => { if (e.target === e.currentTarget) setDetailProduct(null); }}
            role="dialog"
            aria-modal="true"
            aria-labelledby="product-detail-title"
          >
            <div style={{
              background: '#fff', width: '100%', maxWidth: 560, maxHeight: '88vh', overflowY: 'auto',
              borderRadius: '20px 20px 0 0', boxShadow: '0 -16px 48px rgba(2,8,23,.3)',
              animation: 'cpoSlideUp .28s cubic-bezier(.16,1,.3,1)',
            }}>
              {/* Header: type + promo badges, name, SKU / category */}
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', padding: '18px 20px 10px', gap: 12 }}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
                    {mTypeLabel && (
                      <span style={{ display: 'inline-flex', alignItems: 'center', padding: '2px 8px', borderRadius: 5, background: `${mTypeColor}14`, color: mTypeColor, fontSize: 10, fontWeight: 700, letterSpacing: '0.04em' }}>
                        {mTypeLabel}
                      </span>
                    )}
                    {mPromo && (
                      <span style={{ display: 'inline-flex', alignItems: 'center', padding: '2px 8px', borderRadius: 5, background: '#FEF3C7', color: '#B45309', fontSize: 10, fontWeight: 700, letterSpacing: '0.04em' }}>
                        <Star size={11} style={{ marginRight: 4 }} /> {mPromo.discountType === 'percentage' ? `${mPromo.discountValue}% off` : `${formatK(mPromo.discountValue)} off`}
                      </span>
                    )}
                  </div>
                  <h2 id="product-detail-title" style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#1A202C', fontFamily: F, lineHeight: 1.3 }}>{detailProduct.name}</h2>
                  {(detailProduct.sku || detailProduct.category) && (
                    <p style={{ margin: '4px 0 0', fontSize: 11.5, color: '#8A94A6', fontFamily: MONO }}>
                      {[detailProduct.sku && `SKU: ${detailProduct.sku}`, detailProduct.category && `Category: ${detailProduct.category}`].filter(Boolean).join('  ·  ')}
                    </p>
                  )}
                </div>
                <button onClick={() => setDetailProduct(null)} aria-label="Close" style={{ width: 32, height: 32, borderRadius: 9, border: '1px solid #E9EDF3', background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#8A94A6', flexShrink: 0 }}>
                  <X size={15} />
                </button>
              </div>

              {/* Price + stock strip */}
              <div style={{ padding: '6px 20px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, borderBottom: '1px solid #F1F5F9' }}>
                <div>
                  <div style={{ fontSize: 22, fontWeight: 800, color: '#0F172A', fontFamily: F, fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.01em' }}>
                    {formatK(mShownPrice)}
                    {detailProduct.unit && <span style={{ fontSize: 12, fontWeight: 500, color: '#8A94A6', marginLeft: 5 }}>per {detailProduct.unit}</span>}
                  </div>
                  {mPromo && mPrice > mShownPrice && (
                    <div style={{ fontSize: 12, color: '#94A3B8', textDecoration: 'line-through', fontFamily: MONO, marginTop: 2 }}>{formatK(mPrice)}</div>
                  )}
                </div>
                {mIsService ? (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11.5, fontWeight: 600, color: '#1D4ED8' }}>
                    <span style={{ width: 8, height: 8, borderRadius: 4, background: '#2563EB', boxShadow: '0 0 0 3px rgba(37,99,235,.15)' }} /> Service
                  </span>
                ) : mInStock ? (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11.5, fontWeight: 600, color: '#047857' }}>
                    <span style={{ width: 8, height: 8, borderRadius: 4, background: '#22C55E', boxShadow: '0 0 0 3px rgba(34,197,94,.15)' }} /> In stock · {mStock}
                  </span>
                ) : (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11.5, fontWeight: 600, color: '#B45309' }}>
                    <span style={{ width: 8, height: 8, borderRadius: 4, background: '#F59E0B' }} /> Out of stock
                  </span>
                )}
              </div>

              {/* Full description */}
              {detailProduct.description && (
                <div style={{ padding: '16px 20px 4px' }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#4A5568', textTransform: 'uppercase', letterSpacing: 0.05, marginBottom: 6 }}>About this product</div>
                  <p style={{ margin: 0, fontSize: 13.5, color: '#374151', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{detailProduct.description}</p>
                </div>
              )}

              {/* Variant options (choose + add from the detail view) */}
              {mHasVariants && (
                <div style={{ padding: '16px 20px 4px' }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#4A5568', textTransform: 'uppercase', letterSpacing: 0.05, marginBottom: 8 }}>
                    Options ({detailProduct.variants!.length})
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {detailProduct.variants!.map((variant) => {
                      const attrs = variantAttributes(variant);
                      const vOut = variant.stock <= 0;
                      const vPrice = Number(variant.sellingPrice || detailProduct.unitPrice || detailProduct.price || 0);
                      const vShown = promoPrice(vPrice, mPromo);
                      return (
                        <button
                          key={variant.id}
                          onClick={() => { if (!vOut) handleAdd(detailProduct, variant); }}
                          disabled={vOut}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 12,
                            padding: '12px 14px', borderRadius: 12,
                            border: vOut ? '1px solid #F1F5F9' : '1px solid #E9EDF3',
                            background: vOut ? '#F9FAFB' : '#fff',
                            cursor: vOut ? 'not-allowed' : 'pointer',
                            textAlign: 'left', transition: 'all .15s ease',
                            opacity: vOut ? 0.5 : 1,
                          }}
                          onMouseEnter={(e) => { if (!vOut) e.currentTarget.style.borderColor = '#0F2C59'; }}
                          onMouseLeave={(e) => { if (!vOut) e.currentTarget.style.borderColor = '#E9EDF3'; }}
                        >
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 13, fontWeight: 700, color: '#0F172A' }}>{variant.name}</div>
                            {attrs && (
                              <div style={{ fontSize: 11, color: '#64748B', marginTop: 2 }}>{attrs}</div>
                            )}
                            {variant.sku && (
                              <div style={{ fontSize: 10, color: '#94A3B8', fontFamily: MONO, marginTop: 2 }}>SKU: {variant.sku}</div>
                            )}
                          </div>
                          <div style={{ textAlign: 'right', flexShrink: 0 }}>
                            <div style={{ fontSize: 14, fontWeight: 800, color: '#0F172A', fontVariantNumeric: 'tabular-nums' }}>
                              {formatK(vShown)}
                            </div>
                            <div style={{ fontSize: 10, color: '#64748B', marginTop: 2 }}>
                              {vOut ? 'Out of stock' : `${variant.stock} in stock`}
                            </div>
                          </div>
                          {!vOut && (
                            <div style={{ width: 28, height: 28, borderRadius: 8, background: TEAL_GRADIENT, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                              <Plus size={14} />
                            </div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Footer actions */}
              <div style={{ padding: '16px 20px 20px', display: 'flex', gap: 10 }}>
                {!mHasVariants && (
                  <button
                    onClick={() => { handleAdd(detailProduct); setDetailProduct(null); }}
                    disabled={!mInStock}
                    style={{
                      flex: 1, padding: '12px 16px', borderRadius: 11, border: 'none',
                      background: !mInStock ? '#E2E8F0' : TEAL_GRADIENT,
                      color: !mInStock ? '#94A3B8' : '#fff', fontSize: 13, fontWeight: 700,
                      cursor: !mInStock ? 'not-allowed' : 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
                      boxShadow: mInStock ? '0 6px 16px -6px rgba(15,84,76,.55)' : 'none',
                      fontFamily: F,
                    }}
                  >
                    <ShoppingCart size={15} /> Add to Order
                  </button>
                )}
                <button
                  onClick={() => setDetailProduct(null)}
                  style={{
                    padding: '12px 18px', borderRadius: 11, border: '1px solid #D1D5DB',
                    background: '#fff', color: '#4A5568', fontSize: 13, fontWeight: 600,
                    cursor: 'pointer', fontFamily: F,
                  }}
                >
                  Close
                </button>
              </div>
            </div>
          </div>,
          document.body
        );
      })()}

      {/* ── Variant Selection Modal ── */}
      {variantModalProduct && createPortal(
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(2,8,23,.55)', backdropFilter: 'blur(2px)', zIndex: 90, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', animation: 'cpoFadeIn .18s ease' }}
          onMouseDown={(e) => { if (e.target === e.currentTarget) setVariantModalProduct(null); }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="variant-modal-title"
        >
          <div style={{
            background: '#fff', width: '100%', maxWidth: 480, maxHeight: '80vh', overflowY: 'auto',
            borderRadius: '20px 20px 0 0', boxShadow: '0 -16px 48px rgba(2,8,23,.3)',
            animation: 'cpoSlideUp .28s cubic-bezier(.16,1,.3,1)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 20px 12px' }}>
              <div>
                <h2 id="variant-modal-title" style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#1A202C', fontFamily: F }}>
                  Select Variant
                </h2>
                <p style={{ margin: '3px 0 0', fontSize: 12, color: '#8A94A6', fontFamily: F }}>
                  {variantModalProduct.name} — choose a specific option
                </p>
              </div>
              <button
                onClick={() => setVariantModalProduct(null)}
                aria-label="Close"
                style={{ width: 30, height: 30, borderRadius: 9, border: '1px solid #E9EDF3', background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#8A94A6' }}
              >
                <X size={15} />
              </button>
            </div>

            <div style={{ padding: '4px 20px 20px', display: 'flex', flexDirection: 'column', gap: 8 }}>
              {variantModalProduct.variants!.map((variant) => {
                const attrs = variantAttributes(variant);
                const isOutOfStock = variant.stock <= 0;
                const vPrice = Number(variant.sellingPrice || variantModalProduct.unitPrice || variantModalProduct.price || 0);
                // Align with the card + detail modal: show the promo-adjusted price.
                const vShown = promoPrice(vPrice, promoForProduct(variantModalProduct));
                return (
                  <button
                    key={variant.id}
                    onClick={() => {
                      if (!isOutOfStock) {
                        handleAdd(variantModalProduct, variant);
                        setVariantModalProduct(null);
                      }
                    }}
                    disabled={isOutOfStock}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 12,
                      padding: '12px 14px', borderRadius: 12,
                      border: isOutOfStock ? '1px solid #F1F5F9' : '1px solid #E9EDF3',
                      background: isOutOfStock ? '#F9FAFB' : '#fff',
                      cursor: isOutOfStock ? 'not-allowed' : 'pointer',
                      textAlign: 'left', transition: 'all .15s ease',
                      opacity: isOutOfStock ? 0.5 : 1,
                    }}
                    onMouseEnter={(e) => {
                      if (!isOutOfStock) e.currentTarget.style.borderColor = '#0F2C59';
                    }}
                    onMouseLeave={(e) => {
                      if (!isOutOfStock) e.currentTarget.style.borderColor = '#E9EDF3';
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: '#0F172A' }}>{variant.name}</div>
                      {attrs && (
                        <div style={{ fontSize: 11, color: '#64748B', marginTop: 2 }}>{attrs}</div>
                      )}
                      {variant.sku && (
                        <div style={{ fontSize: 10, color: '#94A3B8', fontFamily: MONO, marginTop: 2 }}>SKU: {variant.sku}</div>
                      )}
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 800, color: '#0F172A', fontVariantNumeric: 'tabular-nums' }}>
                        {formatK(vShown)}
                      </div>
                      <div style={{ fontSize: 10, color: '#64748B', marginTop: 2 }}>
                        {isOutOfStock ? 'Out of stock' : `${variant.stock} in stock`}
                      </div>
                    </div>
                    {!isOutOfStock && (
                      <div style={{ width: 28, height: 28, borderRadius: 8, background: TEAL_GRADIENT, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <Plus size={14} />
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* ── Review Cart Modal ── */}
      {reviewOpen && createPortal(
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(2,8,23,.55)', backdropFilter: 'blur(2px)', zIndex: 90, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', animation: 'cpoFadeIn .18s ease' }}
          onMouseDown={(e) => { if (e.target === e.currentTarget && !submitting) setReviewOpen(false); }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="review-cart-title"
        >
          <div style={{
            background: '#fff', width: '100%', maxWidth: 560, maxHeight: '88vh', overflowY: 'auto',
            borderRadius: '20px 20px 0 0', boxShadow: '0 -16px 48px rgba(2,8,23,.3)',
            animation: 'cpoSlideUp .28s cubic-bezier(.16,1,.3,1)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 20px 12px' }}>
              <div>
                <h2 id="review-cart-title" style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#1A202C', fontFamily: F }}>Review Your Order</h2>
                <p style={{ margin: '3px 0 0', fontSize: 12, color: '#8A94A6', fontFamily: F }}>Confirm quantities and delivery details</p>
              </div>
              <button
                onClick={() => { if (!submitting) setReviewOpen(false); }}
                aria-label="Close"
                style={{ width: 30, height: 30, borderRadius: 9, border: '1px solid #E9EDF3', background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#8A94A6' }}
              >
                <X size={15} />
              </button>
            </div>

            <div style={{ padding: '4px 20px', display: 'flex', flexDirection: 'column', gap: 8 }}>
              {cartItems.map((i) => {
                const cartItemKey = i.selectedVariant ? `${i.product.id}::${i.selectedVariant.id}` : i.product.id;
                const unitPrice = i.selectedVariant
                  ? Number(i.selectedVariant.sellingPrice || i.product.unitPrice || i.product.price || 0)
                  : Number(i.product.unitPrice ?? i.product.price ?? 0);
                const itemLabel = i.selectedVariant
                  ? `${i.product.name} — ${i.selectedVariant.name}`
                  : i.product.name;
                return (
                  <div key={cartItemKey} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', background: '#F8FAFC', border: '1px solid #E9EDF3', borderRadius: 12 }}>
                    <div style={{ width: 34, height: 34, borderRadius: 9, background: '#ECFDF5', color: '#008A4C', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <Package size={16} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12.5, fontWeight: 600, color: '#1A202C', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{itemLabel}</div>
                      <div style={{ fontSize: 11, color: '#8A94A6', fontFamily: "'JetBrains Mono', monospace" }}>{formatK(unitPrice)}{i.product.unit ? ` /${i.product.unit}` : ''}</div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                      <button onClick={() => updateQuantity(cartItemKey, i.quantity - 1)} aria-label="Decrease" style={{ width: 26, height: 26, borderRadius: 7, border: '1px solid #E9EDF3', background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#4A5568' }}>
                        <Minus size={12} />
                      </button>
                      <span style={{ fontSize: 13, fontWeight: 700, minWidth: 22, textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}>{i.quantity}</span>
                      <button onClick={() => updateQuantity(cartItemKey, i.quantity + 1)} aria-label="Increase" style={{ width: 26, height: 26, borderRadius: 7, border: '1px solid #E9EDF3', background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#4A5568' }}>
                        <Plus size={12} />
                      </button>
                    </div>
                    <div style={{ minWidth: 72, textAlign: 'right' }}>
                      <div style={{ fontSize: 12.5, fontWeight: 700, color: '#047857', fontFamily: "'JetBrains Mono', monospace", fontVariantNumeric: 'tabular-nums' }}>{formatK(unitPrice * i.quantity)}</div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div style={{ padding: '14px 20px 0' }}>
              <label style={{ fontSize: 11, fontWeight: 700, color: '#4A5568', textTransform: 'uppercase', letterSpacing: 0.05, display: 'flex', alignItems: 'center', gap: 5, marginBottom: 6 }}>
                <MapPin size={13} /> Delivery Address
              </label>
              <textarea
                value={deliveryAddress}
                onChange={(e) => setDeliveryAddress(e.target.value)}
                placeholder="Enter delivery address"
                rows={2}
                style={{
                  width: '100%', fontFamily: F, fontSize: 13, padding: '10px 12px', borderRadius: 10,
                  border: '1px solid #E9EDF3', background: '#fff', color: '#1A202C', outline: 'none', resize: 'vertical',
                  boxSizing: 'border-box',
                }}
              />
            </div>

            <div style={{ padding: '12px 20px', display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}><span style={{ color: '#4A5568' }}>Subtotal</span><span style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 600 }}>{formatK(subtotal)}</span></div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, borderTop: '1px solid #E9EDF3', paddingTop: 8 }}><span style={{ color: '#1A202C', fontWeight: 700 }}>Total</span><span style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 800, color: '#047857' }}>{formatK(subtotal)}</span></div>
              <p style={{ margin: '2px 0 0', fontSize: 10.5, color: '#8A94A6' }}>Final pricing is confirmed by our team at submission. An order request will be created for review.</p>
            </div>

            <div style={{ padding: '12px 20px 20px' }}>
              <button
                onClick={handleSubmitOrder}
                disabled={submitting}
                style={{
                  width: '100%', padding: '12px 16px', borderRadius: 11, border: 'none',
                  background: submitting ? '#9CA3AF' : '#0F2C59',
                  color: '#fff', fontSize: 13.5, fontWeight: 700, cursor: submitting ? 'not-allowed' : 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
                  boxShadow: submitting ? 'none' : '0 6px 16px -6px rgba(15,44,89,.6)', fontFamily: F,
                }}
              >
                {submitting ? (<><Loader2 size={15} className="animate-spin" /> Submitting...</>) : (<><CheckCircle2 size={16} /> Confirm & Submit Order</>)}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};

const CustomerOrders: React.FC = () => (
  <CartProvider>
    <OrdersInner />
  </CartProvider>
);

export default CustomerOrders;
