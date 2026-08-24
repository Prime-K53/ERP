import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft, Search, Plus, Trash2, ShoppingCart, FileText,
  Loader2, CheckCircle2, Minus, Package, Link2
} from 'lucide-react';
import { api } from '../../services/api';
import { portalLifecycle } from '../../services/portalApiClient';
import ErrorBanner from './components/ErrorBanner';
import { formatK } from './constants';
import { F } from './portalStyles';
import { useCustomerAuth } from '../../context/CustomerAuthContext';

type RequestType = 'order' | 'quotation';

interface LineItem {
  id: string;
  productId: string;
  name: string;
  unit: string;
  quantity: number;
  unitPrice: number;
}

const fieldBase: React.CSSProperties = {
  width: '100%',
  fontFamily: F,
  fontSize: 13,
  color: '#2D3748',
  background: '#fff',
  border: '1px solid #E9EDF3',
  borderRadius: 10,
  padding: '8px 12px',
  outline: 'none',
  transition: 'border-color .15s ease, box-shadow .15s ease',
  lineHeight: 1.4,
};

const focusIn = (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => {
  e.currentTarget.style.borderColor = '#4ed3c7';
  e.currentTarget.style.boxShadow = '0 0 0 3px #eef7f6';
};

const focusOut = (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => {
  e.currentTarget.style.borderColor = '#E9EDF3';
  e.currentTarget.style.boxShadow = 'none';
};

const spinKeyframes = `@keyframes spin { to { transform: rotate(360deg); } }`;

const CustomerCreateRequest: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user } = useCustomerAuth();

  const [type, setType] = useState<RequestType>(searchParams.get('type') === 'order' ? 'order' : 'quotation');
  const [catalog, setCatalog] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [lines, setLines] = useState<LineItem[]>([]);
  const [deliveryDate, setDeliveryDate] = useState('');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successId, setSuccessId] = useState<string | null>(null);
  const [reorderRef, setReorderRef] = useState<string | null>(searchParams.get('ref'));
  const [reorderOf, setReorderOf] = useState<string | null>(searchParams.get('order_id'));

  useEffect(() => {
    if (!reorderOf) return;

    let cancelled = false;
    const loadSourceOrder = async () => {
      try {
        const orderDetail = await portalLifecycle.orders.get(reorderOf);
        if (orderDetail && orderDetail.items && Array.isArray(orderDetail.items)) {
          const lineItems: LineItem[] = orderDetail.items.map((item: any) => ({
            id: item.id || Math.random().toString(36).substr(2, 9),
            productId: item.productId || null,
            name: item.name || item.description || 'Item',
            quantity: Number(item.quantity || 0),
            unitPrice: Number(item.unitPrice || item.price || 0),
          }));
          setLines(lineItems);
        }
      } catch (err) {
        console.warn('Failed to load source order for reorder:', err);
      }
    };

    loadSourceOrder();
    return () => {
      cancelled = true;
    };
  }, [reorderOf]);

  useEffect(() => {
    (async () => {
      try {
        const [items, custs] = await Promise.all([
          portalLifecycle.catalog.list(),
          api.customers.getAll(),
        ]);
        setCatalog(items || []);
        setCustomers(custs || []);
      } catch (err: any) {
        setError(err.message || 'Failed to load catalog');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const customerRecord = useMemo(
    () => (customers || []).find((c: any) => String(c.id) === String(user?.customer_id)),
    [customers, user]
  );
  const customerName = customerRecord?.name || user?.full_name || 'Customer';

  const filteredCatalog = useMemo(() => {
    const term = search.trim().toLowerCase();
    const available = (catalog || []).filter(
      (item: any) =>
        String(item.status || '').toLowerCase() !== 'deleted'
    );
    if (!term) return available;
    return available.filter((item: any) =>
      `${item.name} ${item.sku || ''} ${item.category || ''}`.toLowerCase().includes(term)
    );
  }, [catalog, search]);

  const subtotal = lines.reduce((sum, l) => sum + l.quantity * l.unitPrice, 0);

  const addLine = (item: any) => {
    setLines((prev) => {
      const existing = prev.find((l) => l.productId === item.id);
      if (existing) {
        return prev.map((l) =>
          l.productId === item.id ? { ...l, quantity: l.quantity + 1 } : l
        );
      }
      return [
        ...prev,
        {
          id: crypto.randomUUID(),
          productId: item.id,
          name: item.name,
          unit: item.unit || '',
          quantity: 1,
          unitPrice: Number(item.price) || 0,
        },
      ];
    });
    setSearch('');
  };

  const updateQuantity = (id: string, quantity: number) => {
    setLines((prev) =>
      prev.map((l) => (l.id === id ? { ...l, quantity: Math.max(1, quantity) } : l))
    );
  };

  const removeLine = (id: string) => {
    setLines((prev) => prev.filter((l) => l.id !== id));
  };

  const handleSubmit = async () => {
    if (lines.length === 0) {
      setError('Please add at least one line item.');
      return;
    }
    for (const l of lines) {
      if (!l.name || !l.quantity || l.quantity <= 0) {
        setError(`Invalid quantity for "${l.name || 'unknown item'}". Quantity must be a positive number.`);
        return;
      }
      if (!l.unitPrice || l.unitPrice <= 0) {
        setError(`Invalid unit price for "${l.name || 'unknown item'}". Unit price must be a positive number.`);
        return;
      }
    }
    if (deliveryDate) {
      const selected = new Date(deliveryDate);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      if (selected < today) {
        setError('Requested delivery date cannot be in the past.');
        return;
      }
    }
    setSaving(true);
    setError(null);
    try {
      const created = await portalLifecycle.requests.create({
        requestType: type === 'order' ? 'order' : 'quotation',
        items: lines.map((l) => ({
          productId: l.productId,
          name: l.name,
          quantity: l.quantity,
          unitPrice: l.unitPrice,
        })),
        notes: notes || undefined,
        requestedDeliveryDate: deliveryDate || null,
        reorderOf: reorderOf || null,
        reorderOfNumber: reorderRef || null,
      });
      setSuccessId(created.request_number || created.id);
    } catch (err: any) {
      setError(err.message || 'Failed to submit request');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div style={{ maxWidth: 720, margin: '0 auto', minHeight: '50vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <style>{spinKeyframes}</style>
        <div style={{
          width: 48, height: 48, borderRadius: 16,
          background: 'linear-gradient(135deg, #1f8577, #0f544c)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 4px 14px -4px rgba(15,84,76,.6)', animation: 'pulse 1.5s ease-in-out infinite'
        }}>
          <Loader2 size={24} color="#fff" style={{ animation: 'spin 1s linear infinite' }} />
        </div>
      </div>
    );
  }

  if (successId) {
    return (
      <div style={{ maxWidth: 460, margin: '0 auto', padding: '16px 16px 40px', minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{
          background: '#fff', borderRadius: 12, padding: '32px 24px 28px', textAlign: 'center', position: 'relative',
          border: '1px solid #E9EDF3', boxShadow: '0 20px 40px -16px rgba(0,0,0,.2)', width: '100%',
          animation: 'scaleIn .3s cubic-bezier(.4,0,.2,1)'
        }}>
          <div style={{
            position: 'absolute', top: 0, left: 0, right: 0, height: 4,
            background: 'linear-gradient(90deg, #146b60, #4ed3c7 40%, #d99a3f 100%)', borderRadius: '12px 12px 0 0'
          }} />
          <div style={{
            width: 72, height: 72, borderRadius: 12,
            background: 'linear-gradient(135deg, #1f857718, #4ed3c710)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 16px', animation: 'scaleIn .4s cubic-bezier(.4,0,.2,1) .1s both'
          }}>
            <CheckCircle2 size={36} color="#146b60" strokeWidth={2.5} />
          </div>
          <h2 style={{
            fontFamily: F, fontSize: 22, margin: 0, color: '#0b3e39', letterSpacing: 0.2, lineHeight: 1.35
          }}>
            {type === 'order' ? 'Order Requested' : 'Quotation Requested'}
          </h2>
          <p style={{ margin: '8px 0 0', fontSize: 13, fontWeight: 500, color: '#4A5568', lineHeight: 1.5 }}>
            Reference <span style={{ fontFamily: F, fontWeight: 600, color: '#2D3748', letterSpacing: 0.15, fontVariantNumeric: 'tabular-nums' }}>#{successId}</span><br />
            Our team will review your request shortly.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 24 }}>
            <button
               onClick={() => navigate('/portal/orders?tab=requests')}
              style={{
                width: '100%', padding: '8px 14px', borderRadius: 8, border: 'none', cursor: 'pointer',
                background: 'linear-gradient(135deg, #1f8577, #0f544c)', color: '#fff',
                fontSize: 12, fontWeight: 600, lineHeight: 1.4, boxShadow: '0 6px 16px -6px rgba(15,84,76,.5)',
                transition: 'all .15s ease'
              }}
            >
              Track Request
            </button>
            <button
              onClick={() => navigate('/portal/new-request')}
              style={{
                width: '100%', padding: '8px 14px', borderRadius: 8, cursor: 'pointer',
                background: '#fff', border: '1px solid #E9EDF3', color: '#4A5568',
                fontSize: 12, fontWeight: 600, lineHeight: 1.4, transition: 'all .15s ease'
              }}
            >
              Create Another
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ fontFamily: F, fontSize: 13, lineHeight: 1.4, color: '#2D3748', maxWidth: 720, margin: '0 auto', paddingBottom: 120 }}>
      <style>{spinKeyframes}</style>
      <div style={{
        position: 'sticky', top: 0, zIndex: 20, background: 'rgba(255,253,250,.92)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)',
        borderBottom: '1px solid #E9EDF3'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px' }}>
          <button
            onClick={() => navigate('/portal/requests')}
            aria-label="Back to requests"
            style={{
              width: 40, height: 40, borderRadius: 10, border: 'none', cursor: 'pointer',
              background: '#eef7f6', color: '#0f544c', flexShrink: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all .15s ease'
            }}
          >
            <ArrowLeft size={20} strokeWidth={2.2} />
          </button>
          <div style={{ minWidth: 0, flex: 1 }}>
            <h1 style={{
              fontFamily: F, fontWeight: 600, fontSize: 14, margin: 0,
              color: '#1A202C',
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              lineHeight: 1.35
            }}>
              New {type === 'order' ? 'Order' : 'Quotation'} Request
            </h1>
            <p style={{ margin: '2px 0 0', fontSize: 12, fontWeight: 500, color: '#4A5568', lineHeight: 1.4 }}>
              {type === 'order' ? 'Place a new order with our team' : 'Request a quotation for your needs'}
            </p>
          </div>
          <div style={{
            width: 44, height: 44, borderRadius: 12, flexShrink: 0,
            background: type === 'order'
              ? 'linear-gradient(135deg, #1f8577, #0f544c)'
              : 'linear-gradient(135deg, #d99a3f, #b97e2b)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 4px 12px -4px rgba(15,84,76,.5)'
          }}>
            {type === 'order' ? <ShoppingCart size={20} color="#fff" strokeWidth={2.2} /> : <FileText size={20} color="#fff" strokeWidth={2.2} />}
          </div>
        </div>
      </div>

      <div style={{ padding: '14px 16px 0', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}

        <div style={{
          display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, padding: 6,
          background: '#fff', border: '1px solid #E9EDF3', borderRadius: 12
        }}>
          <button
            aria-pressed={type === 'order'}
            onClick={() => setType('order')}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              height: 46, borderRadius: 8, border: 'none', cursor: 'pointer',
              fontFamily: F, fontSize: 12, fontWeight: 600,
              background: type === 'order' ? 'linear-gradient(135deg, #1f8577, #0f544c)' : 'transparent',
              color: type === 'order' ? '#fff' : '#4A5568',
              boxShadow: type === 'order' ? '0 4px 14px -4px rgba(15,84,76,.5)' : 'none',
              transition: 'all .2s cubic-bezier(.4,0,.2,1)', position: 'relative', overflow: 'hidden'
            }}
          >
            {type === 'order' && (
              <div style={{
                position: 'absolute', inset: 0, background: 'linear-gradient(135deg, rgba(255,255,255,.15), transparent)',
                borderRadius: 8
              }} />
            )}
            <ShoppingCart size={16} strokeWidth={2.2} />
            <span style={{ position: 'relative', zIndex: 1 }}>Order</span>
          </button>
          <button
            aria-pressed={type === 'quotation'}
            onClick={() => setType('quotation')}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              height: 46, borderRadius: 8, border: 'none', cursor: 'pointer',
              fontFamily: F, fontSize: 12, fontWeight: 600,
              background: type === 'quotation' ? 'linear-gradient(135deg, #1f8577, #0f544c)' : 'transparent',
              color: type === 'quotation' ? '#fff' : '#4A5568',
              boxShadow: type === 'quotation' ? '0 4px 14px -4px rgba(15,84,76,.5)' : 'none',
              transition: 'all .2s cubic-bezier(.4,0,.2,1)', position: 'relative', overflow: 'hidden'
            }}
          >
            {type === 'quotation' && (
              <div style={{
                position: 'absolute', inset: 0, background: 'linear-gradient(135deg, rgba(255,255,255,.15), transparent)',
                borderRadius: 8
              }} />
            )}
            <FileText size={16} strokeWidth={2.2} />
            <span style={{ position: 'relative', zIndex: 1 }}>Quotation</span>
          </button>
        </div>

        {reorderRef && (
          <div style={{
            background: '#fff', borderRadius: 12, border: '1px solid #E9EDF3',
            overflow: 'hidden', marginBottom: 10
          }}>
            <div style={{ padding: '12px 14px' }}>
              <label style={{
                display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600, color: '#4A5568',
                marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.06
              }}>
                <Link2 size={14} /> Reference
              </label>
              <input
                readOnly
                value={`From ${reorderRef}`}
                style={{
                  ...fieldBase, fontSize: 13, padding: '8px 12px',
                  background: '#eef7f6', border: '1px solid #a6d9d3', color: '#0b3e39', fontWeight: 600,
                }}
                onFocus={(e) => { e.target.select(); }}
              />
            </div>
          </div>
        )}

        <div style={{
          background: '#fff', borderRadius: 12, border: '1px solid #E9EDF3',
          overflow: 'hidden', marginBottom: 10
        }}>
          <div style={{ padding: '12px 14px' }}>
            <label style={{
              display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600, color: '#4A5568',
              marginBottom: 4, letterSpacing: 0.02
            }}>
              <Search size={13} /> Search Products
            </label>
            <div style={{ position: 'relative' }}>
              <Search size={18} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: '#8A94A6', pointerEvents: 'none' }} />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search products by name, SKU..."
                style={{ ...fieldBase, paddingLeft: 42, fontSize: 13, height: 42 }}
                onFocus={focusIn}
                onBlur={focusOut}
              />
            </div>

            {search.trim() && (
              <div style={{
                marginTop: 10, maxHeight: 260, overflowY: 'auto', borderRadius: 10,
                border: '1px solid #E9EDF3', background: '#fff',
                boxShadow: '0 4px 12px -4px rgba(0,0,0,.08)'
              }}>
                {filteredCatalog.length === 0 ? (
                  <div style={{ padding: '20px 14px', textAlign: 'center' }}>
                    <Package size={28} color="#72c0b7" style={{ margin: '0 auto 8px' }} />
                    <p style={{ margin: 0, fontSize: 13, fontWeight: 500, color: '#4A5568', lineHeight: 1.45 }}>No products match your search</p>
                  </div>
                ) : (
                  filteredCatalog.slice(0, 20).map((item: any) => (
                    <button
                      key={item.id}
                      onClick={() => addLine(item)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 10, width: '100%', minHeight: 54, padding: '10px 14px',
                        textAlign: 'left', border: 'none', borderBottom: '1px solid #E9EDF3',
                        background: 'transparent', cursor: 'pointer', fontSize: 13, transition: 'all .15s ease'
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = '#eef7f6'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                    >
                      <div style={{ minWidth: 0, flex: 1, textAlign: 'left' }}>
                        <p style={{ fontWeight: 600, color: '#2D3748', margin: 0, lineHeight: 1.4, fontSize: 13 }}>{item.name}</p>
                        <p style={{ fontSize: 12, color: '#4A5568', marginTop: 2, lineHeight: 1.4 }}>
                          {item.sku || ''}{item.unit ? ` • ${item.unit}` : ''} • {formatK(item.price)}
                        </p>
                      </div>
                      <div style={{
                        width: 36, height: 36, borderRadius: 8, flexShrink: 0,
                        background: 'linear-gradient(135deg, #1f8577, #146b60)', color: '#fff',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        boxShadow: '0 2px 6px -2px rgba(15,84,76,.4)'
                      }}>
                        <Plus size={18} strokeWidth={3} />
                      </div>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
        </div>

        <div style={{
          background: '#fff', borderRadius: 12, border: '1px solid #E9EDF3',
          overflow: 'hidden', marginBottom: 10
        }}>
          <div style={{
            padding: '10px 14px', borderBottom: '1px solid #E9EDF3',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8
          }}>
            <h2 style={{ fontSize: 14, fontWeight: 600, color: '#1A202C', margin: 0 }}>
              Selected Items ({lines.length})
            </h2>
            <span style={{ fontSize: 10.5, color: '#8A94A6', fontWeight: 600 }}>{customerName}</span>
          </div>
          {lines.length === 0 ? (
            <div style={{ padding: '36px 14px', textAlign: 'center' }}>
              <div style={{
                width: 48, height: 48, borderRadius: 12, background: '#ECFDF5',
                display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px'
              }}>
                <Package size={26} color="#008A4C" />
              </div>
              <p style={{ margin: 0, fontSize: 13, fontWeight: 500, color: '#4A5568', lineHeight: 1.5 }}>
                No items selected yet.<br />Search and add products above.
              </p>
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #E9EDF3' }}>
                    <th style={{ textAlign: 'left', padding: '8px 14px', fontSize: 10.5, fontWeight: 600, color: '#8A94A6', textTransform: 'uppercase', letterSpacing: 0.08 }}>Item</th>
                    <th style={{ textAlign: 'right', padding: '8px 14px', fontSize: 10.5, fontWeight: 600, color: '#8A94A6', textTransform: 'uppercase', letterSpacing: 0.08, width: 90 }}>Qty</th>
                    <th style={{ textAlign: 'right', padding: '8px 14px', fontSize: 10.5, fontWeight: 600, color: '#8A94A6', textTransform: 'uppercase', letterSpacing: 0.08, width: 110 }}>Price</th>
                    <th style={{ textAlign: 'right', padding: '8px 14px', fontSize: 10.5, fontWeight: 600, color: '#8A94A6', textTransform: 'uppercase', letterSpacing: 0.08, width: 110 }}>Total</th>
                    <th style={{ width: 44 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((l) => (
                    <tr key={l.id} style={{ borderBottom: '1px solid #E9EDF3' }}>
                      <td style={{ padding: '8px 14px', fontSize: 13, fontWeight: 600, color: '#2D3748', lineHeight: 1.4 }}>{l.name}</td>
                      <td style={{ padding: '8px 14px', textAlign: 'right' }}>
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                          <button
                            onClick={() => updateQuantity(l.id, l.quantity - 1)}
                            aria-label="Decrease quantity"
                            style={{
                              width: 32, height: 32, borderRadius: 8, border: '1px solid #E9EDF3',
                              background: '#fff', color: '#146b60', cursor: 'pointer', fontSize: 14, fontWeight: 600,
                              display: 'inline-flex', alignItems: 'center', justifyContent: 'center', transition: 'all .15s ease'
                            }}
                          >
                            <Minus size={14} strokeWidth={2.5} />
                          </button>
                          <div style={{
                            width: 44, height: 32, borderRadius: 8, border: '1px solid #E9EDF3',
                            background: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center'
                          }}>
                            <span style={{ fontFamily: F, fontSize: 13, fontWeight: 600, color: '#2D3748', fontVariantNumeric: 'tabular-nums' }}>{l.quantity}</span>
                          </div>
                          <button
                            onClick={() => updateQuantity(l.id, l.quantity + 1)}
                            aria-label="Increase quantity"
                            style={{
                              width: 32, height: 32, borderRadius: 8, border: '1px solid #E9EDF3',
                              background: '#fff', color: '#146b60', cursor: 'pointer', fontSize: 14, fontWeight: 600,
                              display: 'inline-flex', alignItems: 'center', justifyContent: 'center', transition: 'all .15s ease'
                            }}
                          >
                            <Plus size={14} strokeWidth={2.5} />
                          </button>
                        </div>
                      </td>
                      <td style={{ padding: '8px 14px', textAlign: 'right', fontSize: 13, color: '#4A5568', fontFamily: F, fontVariantNumeric: 'tabular-nums' }}>{formatK(l.unitPrice)}</td>
                      <td style={{ padding: '8px 14px', textAlign: 'right', fontSize: 13, fontWeight: 600, color: '#2D3748', fontFamily: F, fontVariantNumeric: 'tabular-nums' }}>{formatK(l.quantity * l.unitPrice)}</td>
                      <td style={{ padding: '8px 14px', textAlign: 'center' }}>
                        <button
                          onClick={() => removeLine(l.id)}
                          aria-label={`Remove ${l.name}`}
                          style={{
                            width: 32, height: 32, borderRadius: 8, border: 'none', cursor: 'pointer',
                            background: 'rgba(181,73,63,0.07)', color: '#b5493f',
                            display: 'inline-flex', alignItems: 'center', justifyContent: 'center', transition: 'all .15s ease'
                          }}
                        >
                          <Trash2 size={15} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div style={{
          background: '#fff', borderRadius: 12, border: '1px solid #E9EDF3',
          padding: '12px 14px', marginBottom: 10
        }}>
          <h2 style={{ fontSize: 14, fontWeight: 600, color: '#1A202C', margin: '0 0 10px', lineHeight: 1.4 }}>
            Delivery & Notes
          </h2>
          <div style={{ marginBottom: 12 }}>
            <label style={{
              display: 'block', fontSize: 12, fontWeight: 600, color: '#4A5568', marginBottom: 4, lineHeight: 1.4
            }}>
              Delivery Date
            </label>
            <input
              type="date"
              value={deliveryDate}
              onChange={(e) => setDeliveryDate(e.target.value)}
              style={{ ...fieldBase, fontSize: 13, padding: '8px 12px' }}
              onFocus={focusIn}
              onBlur={focusOut}
            />
          </div>
          <div>
            <label style={{
              display: 'block', fontSize: 12, fontWeight: 600, color: '#4A5568', marginBottom: 4, lineHeight: 1.4
            }}>
              Notes
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder={type === 'order' ? 'Order instructions, special requirements...' : 'Tell us what you need...'}
              style={{ ...fieldBase, minHeight: 88, lineHeight: 1.5, resize: 'vertical', fontSize: 13, padding: '8px 12px', borderRadius: 10, border: '1px solid #E9EDF3' }}
              onFocus={focusIn}
              onBlur={focusOut}
            />
          </div>
        </div>

        <div style={{
          background: '#fff',
          borderRadius: 12, border: '1px solid #E9EDF3',
          padding: '12px 14px', marginBottom: 10
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <div>
              <p style={{ margin: 0, fontSize: 12, fontWeight: 600, color: '#4A5568', lineHeight: 1.4 }}>Estimated Total</p>
              <p style={{ margin: '3px 0 0', fontSize: 10.5, color: '#8A94A6', lineHeight: 1.4 }}>
                {lines.length} item{lines.length === 1 ? '' : 's'}
              </p>
            </div>
            <div style={{ textAlign: 'right' }}>
              <p style={{ margin: 0, fontSize: 22, fontWeight: 600, color: '#2D3748', fontFamily: F, letterSpacing: 0.15, fontVariantNumeric: 'tabular-nums', lineHeight: 1.35 }}>
                {formatK(subtotal)}
              </p>
            </div>
          </div>
        </div>
      </div>

      <div
        style={{
          position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 30,
          background: 'rgba(255,253,250,.96)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)',
          borderTop: '1px solid #E9EDF3', boxShadow: '0 -8px 24px -12px rgba(0,0,0,.15)'
        }}
      >
        <div style={{ maxWidth: 720, margin: '0 auto', display: 'flex', alignItems: 'stretch', gap: 10, padding: '10px 16px', paddingBottom: 'calc(12px + env(safe-area-inset-bottom))' }}>
          <button
            onClick={() => navigate('/portal/requests')}
            style={{
              height: 46, padding: '0 14px', borderRadius: 8, cursor: 'pointer',
              border: '1px solid #E9EDF3', background: '#fff', color: '#4A5568',
              fontFamily: F, fontSize: 12, fontWeight: 600,
              display: 'inline-flex', alignItems: 'center', gap: 6, transition: 'all .15s ease', lineHeight: 1.4
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving || lines.length === 0}
            style={{
              flex: 1, height: 46, borderRadius: 8, border: 'none', cursor: saving || lines.length === 0 ? 'not-allowed' : 'pointer',
              background: saving || lines.length === 0
                ? '#E9EDF3'
                : 'linear-gradient(135deg, #1f8577, #0f544c)',
              color: saving || lines.length === 0 ? '#8A94A6' : '#fff', fontSize: 12, fontWeight: 600,
              fontFamily: F, lineHeight: 1.4,
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              boxShadow: saving || lines.length === 0 ? 'none' : '0 8px 20px -8px rgba(15,84,76,.6)',
              transition: 'all .2s cubic-bezier(.4,0,.2,1)'
            }}
          >
            {saving ? <Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} /> : (
              type === 'order' ? 'Submit Order' : 'Request Quotation'
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default CustomerCreateRequest;
