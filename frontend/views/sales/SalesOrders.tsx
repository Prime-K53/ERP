import React, { useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useSalesStore } from '../../stores/salesStore';
import { useFinanceStore } from '../../stores/financeStore';
import { adminLifecycle, OrderPrefillPayload } from '../../services/adminPortalClient';
import { useMediaQuery } from '../../hooks/useMediaQuery';
import { generateNextId } from '../../utils/helpers';
import SalesOrderForm from './SalesOrderForm';

const teal = {
  50: '#eef7f6', 100: '#d3ece9', 200: '#a6d9d3', 300: '#72c0b7',
  400: '#3fa294', 500: '#1f8577', 600: '#146b60', 700: '#0f544c',
  800: '#0b3e39', 900: '#082e2a'
};
const amber = { 100: '#fbead0', 300: '#eec27a', 500: '#d99a3f', 600: '#b97e2b' };
const paper = '#FEFDFB';
const ink = '#23282A';
const inkSoft = '#5c6567';
const hairline = '#e4ddd1';

const statusBadgeColors: Record<string, { bg: string; color: string; border: string }> = {
  Draft: { bg: amber[100], color: amber[600], border: amber[300] },
  Confirmed: { bg: teal[50], color: teal[700], border: teal[200] },
  Processing: { bg: teal[50], color: teal[500], border: teal[200] },
  Fulfilled: { bg: teal[100], color: teal[800], border: teal[200] },
  Cancelled: { bg: '#f3f4f6', color: inkSoft, border: hairline },
};

const statusOptions = ['Draft', 'Confirmed', 'Processing', 'Fulfilled', 'Cancelled'];

interface RowActionsProps {
  order: any;
  onEdit: (o: any) => void;
  onConvert: (o: any) => void;
  onChangeStatus: (o: any, s: string) => void;
}

const RowActions: React.FC<RowActionsProps> = ({ order, onEdit, onConvert, onChangeStatus }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%' }}>
    <button
      onClick={() => onEdit(order)}
      style={{
        fontFamily: "'Inter', sans-serif",
        fontSize: 12,
        fontWeight: 600,
        padding: '10px 12px',
        borderRadius: 9,
        cursor: 'pointer',
        background: paper,
        border: `1.4px solid ${hairline}`,
        color: inkSoft,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 5,
        flex: 1,
        minWidth: 0,
        transition: 'all .15s ease'
      }}
      onMouseEnter={e => { e.currentTarget.style.background = teal[50]; e.currentTarget.style.color = teal[800]; e.currentTarget.style.borderColor = teal[200]; }}
      onMouseLeave={e => { e.currentTarget.style.background = paper; e.currentTarget.style.color = inkSoft; e.currentTarget.style.borderColor = hairline; }}
    >
      Edit
    </button>
    <button
      onClick={() => onConvert(order)}
      style={{
        fontFamily: "'Inter', sans-serif",
        fontSize: 12,
        fontWeight: 600,
        padding: '10px 12px',
        borderRadius: 9,
        cursor: 'pointer',
        background: `linear-gradient(155deg, ${teal[500]}, ${teal[700]})`,
        color: '#fff',
        border: '1.4px solid transparent',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 5,
        flex: 1,
        minWidth: 0,
        transition: 'all .15s ease',
        boxShadow: '0 4px 10px -4px rgba(15,84,76,.4)'
      }}
      onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 6px 14px -4px rgba(15,84,76,.55)'; }}
      onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 4px 10px -4px rgba(15,84,76,.4)'; }}
    >
      Convert
    </button>
    <select
      value={order.status}
      onChange={(e) => onChangeStatus(order, e.target.value)}
      style={{
        fontFamily: "'Inter', sans-serif",
        fontSize: 12,
        fontWeight: 500,
        padding: '9px 10px',
        borderRadius: 9,
        cursor: 'pointer',
        background: paper,
        border: `1.4px solid ${hairline}`,
        color: inkSoft,
        outline: 'none',
        flex: 1,
        minWidth: 0,
        transition: 'border-color .15s ease'
      }}
    >
      {statusOptions.map(s => <option key={s} value={s}>{s}</option>)}
    </select>
  </div>
);

const SalesOrders: React.FC = () => {
  const { salesOrders, isLoading, fetchSalesData, addSalesOrder, updateSalesOrder } = useSalesStore();
  const { addInvoice } = useFinanceStore();
  const location = useLocation();
  const isMobile = useMediaQuery('(max-width: 767px)');
  const [editing, setEditing] = useState<any | null>(null);
  const [pendingOrderRequest, setPendingOrderRequest] = useState<{ requestId: string; requestNumber: string } | null>(null);

  const completeOrderRequest = async (order: any) => {
    if (!pendingOrderRequest) return null;
    try {
      const res = await adminLifecycle.requests.completeOrder(pendingOrderRequest.requestId, {
        erpOrderId: order.id || undefined,
        orderSnapshot: {
          items: order.items || [],
          subtotal: order.subtotal || 0,
          discounts: order.discounts || 0,
          tax: order.tax || 0,
          otherCharges: 0,
          total: order.total || 0,
          notes: order.notes || null,
          deliveryDate: order.deliveryDate || null,
          customerId: order.customerId || null,
          customerName: order.customerName || null
        }
      });
      return res || null;
    } catch (err: any) {
      alert('Request conversion failed: ' + (err?.message || err));
      return null;
    }
  };

  const handleCreate = async (o: any) => {
    // Converting a portal request → the ERP record is saved first (offline-safe),
    // then the backend ADOPTS it as the official sales order (SO-YYYY-######),
    // links the request (marked converted) and notifies the customer. The local
    // record is then updated with the official number + request linkage so the
    // admin list never shows an "Unnumbered order" and ODR-… stays traceable.
    if (pendingOrderRequest) {
      const orderId = o.id || generateNextId('SO', salesOrders);
      const orderToSave = { ...o, id: orderId };
      await addSalesOrder(orderToSave);
      const res = await completeOrderRequest(orderToSave);
      if (res?.id) {
        await updateSalesOrder({
          ...orderToSave,
          id: res.id,
          orderNumber: res.orderNumber || '',
          sourceRequestId: pendingOrderRequest.requestId,
          sourceRequestNumber: pendingOrderRequest.requestNumber,
          status: 'Confirmed',
        });
        alert(`Official sales order ${res.orderNumber || res.id} created. Request ${pendingOrderRequest.requestNumber} marked converted and the customer notified.`);
      } else {
        alert('Sales order saved locally, but the request could not be marked converted right now. Retry from Customer Requests when online.');
      }
      await fetchSalesData();
      setPendingOrderRequest(null);
      setEditing(null);
      return;
    }
    await addSalesOrder(o);
    await fetchSalesData();
  };

  React.useEffect(() => {
    const p = (location.state as any)?.orderPrefill as OrderPrefillPayload | undefined;
    if (p) {
      const prefill: any = {
        id: '',
        customerId: p.customer_id || '',
        items: (p.items || []).map((it: any, i: number) => ({
          id: `item-${Date.now()}-${i}`,
          productId: it.productId || '',
          description: it.name || '',
          quantity: Number(it.quantity) || 0,
          unitPrice: Number(it.unitPrice) || 0,
          discount: 0,
          lineTotal: Number(it.lineTotal) || 0
        })),
        subtotal: p.subtotal || 0,
        discounts: 0,
        tax: 0,
        total: p.subtotal || 0,
        orderDate: new Date().toISOString(),
        deliveryDate: p.deliveryDate || null,
        status: 'Draft'
      };
      setEditing(prefill);
      setPendingOrderRequest({ requestId: p.id, requestNumber: p.requestNumber });
      window.history.replaceState({}, '');
    }
    fetchSalesData().catch(() => {});
  }, []);

  const handleConvertToInvoice = async (order: any) => {
    const invoice = {
      id: '',
      customerId: order.customerId,
      customerName: order.customerName || '',
      date: new Date().toISOString(),
      dueDate: order.deliveryDate || null,
      lines: (order.items || []).map((it: any) => ({ itemId: it.product_id || it.id, description: it.product_name || it.description || '', quantity: it.quantity, unitPrice: it.unit_price || it.unitPrice || 0, total: it.line_total || (it.quantity * (it.unit_price || it.unitPrice || 0)) })),
      totalAmount: order.total || 0,
      status: 'Unpaid',
      sourceOrderId: order.id
    };

    try {
      await addInvoice(invoice);
      alert('Converted to invoice');
    } catch (err: any) {
      alert('Failed to convert: ' + (err?.message || err));
    }
  };

  const changeStatus = async (order: any, status: string) => {
    try {
      await updateSalesOrder({ ...order, status });
      await fetchSalesData();
    } catch (err: any) {
      alert('Failed to update status: ' + (err?.message || err));
    }
  };

  return (
    <div style={{ background: '#f0ede8', minHeight: '100vh', padding: '12px 12px 24px', fontFamily: "'Inter','DM Sans',sans-serif", color: ink }}>
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
        <h1 style={{
          fontFamily: "'DM Serif Display', 'Georgia', serif",
          fontWeight: 400,
          fontSize: 20,
          color: teal[800],
          margin: '0 0 16px',
          letterSpacing: 0.2
        }}>
          Sales Orders
        </h1>

        {pendingOrderRequest && (
          <div style={{
            marginBottom: 20,
            padding: '12px 16px',
            borderRadius: 12,
            background: teal[50],
            border: `1px solid ${teal[200]}`,
            color: teal[800],
            fontSize: 13,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12
          }}>
            <span>
              Creating official sales order from request <strong>{pendingOrderRequest.requestNumber}</strong>. After saving, the request will be marked converted and the customer notified.
            </span>
            <button
              onClick={() => { setPendingOrderRequest(null); setEditing(null); }}
              style={{
                fontFamily: "'Inter', sans-serif",
                fontSize: 12,
                fontWeight: 600,
                padding: '6px 12px',
                borderRadius: 8,
                cursor: 'pointer',
                background: paper,
                border: `1.4px solid ${teal[200]}`,
                color: teal[700]
              }}
            >
              Cancel
            </button>
          </div>
        )}

        <div style={{ marginBottom: 20, background: paper, borderRadius: 14, border: `1px solid ${hairline}`, overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,.04), 0 4px 12px rgba(0,0,0,.03)' }}>
          <div style={{ height: 3, background: `linear-gradient(90deg, ${teal[600]}, ${teal[400]} 40%, ${amber[500]} 100%)` }} />
          <div style={{ padding: 20 }}>
            {!editing ? (
              <SalesOrderForm onCreate={handleCreate} />
            ) : (
              <div style={{ marginBottom: 16 }}>
                <SalesOrderForm
                  initial={editing}
                  onCreate={pendingOrderRequest ? handleCreate : undefined}
                  onDone={() => { setEditing(null); void fetchSalesData(); }}
                />
              </div>
            )}
          </div>
        </div>

        <div style={{
          background: paper,
          borderRadius: 14,
          border: `1px solid ${hairline}`,
          overflow: 'hidden',
          boxShadow: '0 1px 3px rgba(0,0,0,.04), 0 4px 12px rgba(0,0,0,.03)'
        }}>
          {isLoading ? (
            <div style={{ padding: 40, textAlign: 'center', color: inkSoft, fontSize: 14 }}>Loading...</div>
          ) : salesOrders.length === 0 ? (
            <div style={{ padding: 48, textAlign: 'center' }}>
              <div style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14
              }}>
                <div style={{
                  width: 52, height: 52, borderRadius: '50%',
                  background: teal[50],
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  border: `1px solid ${teal[100]}`
                }}>
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={teal[400]} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
                <p style={{ fontSize: 14, fontWeight: 600, color: teal[800], margin: 0 }}>No sales orders yet</p>
                <p style={{ fontSize: 13, color: inkSoft, margin: 0 }}>Create your first sales order using the form above.</p>
              </div>
            </div>
          ) : isMobile ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: 12 }}>
              {salesOrders.map((o: any) => {
                const sc = statusBadgeColors[o.status] || { bg: paper, color: inkSoft, border: hairline };
                return (
                  <div
                    key={o.id}
                    style={{
                      background: paper,
                      borderRadius: 14,
                      border: `1px solid ${hairline}`,
                      overflow: 'hidden',
                      boxShadow: '0 1px 3px rgba(0,0,0,.05)'
                    }}
                  >
                    <div style={{ padding: '12px 14px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11.5, color: inkSoft, fontVariantNumeric: 'tabular-nums', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{o.id}</span>
                      <span style={{
                        display: 'inline-block',
                        padding: '3px 10px',
                        borderRadius: 20,
                        fontSize: 11,
                        fontWeight: 600,
                        background: sc.bg,
                        color: sc.color,
                        border: `1px solid ${sc.border}`,
                        letterSpacing: 0.02,
                        flexShrink: 0
                      }}>
                        {o.status}
                      </span>
                    </div>
                    <div style={{ padding: '10px 14px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 10 }}>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <p style={{ margin: 0, fontSize: 13.5, fontWeight: 600, color: ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{o.customerId || 'No customer'}</p>
                        <p style={{ margin: '3px 0 0', fontSize: 11.5, color: inkSoft }}>{new Date(o.orderDate).toLocaleDateString()}</p>
                      </div>
                      <div style={{ textAlign: 'right', flexShrink: 0 }}>
                        <p style={{ margin: 0, fontSize: 9, fontWeight: 700, color: inkSoft, textTransform: 'uppercase', letterSpacing: 0.08 }}>Total</p>
                        <p style={{ margin: '2px 0 0', fontFamily: "'JetBrains Mono', monospace", fontSize: 15, fontWeight: 700, color: teal[800], fontVariantNumeric: 'tabular-nums' }}>{o.total}</p>
                      </div>
                    </div>
                    <div style={{ borderTop: `1px solid ${hairline}`, padding: '10px 12px' }}>
                      <RowActions order={o} onEdit={setEditing} onConvert={handleConvertToInvoice} onChangeStatus={changeStatus} />
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5 }}>
              <thead>
                <tr style={{ background: teal[50] }}>
                  {['ID', 'Customer', 'Order Date', 'Status', 'Total', 'Actions'].map((h) => (
                    <th key={h} style={{
                      padding: '10px 14px',
                      textAlign: 'left',
                      fontSize: 11,
                      fontWeight: 600,
                      color: teal[700],
                      textTransform: 'uppercase',
                      letterSpacing: 0.06,
                      borderBottom: `1px solid ${teal[100]}`,
                      fontFamily: "'Inter', sans-serif"
                    }} className={h === 'Customer' || h === 'Order Date' ? 'hidden md:table-cell' : ''}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {salesOrders.map((o: any) => {
                  const sc = statusBadgeColors[o.status] || { bg: paper, color: inkSoft, border: hairline };
                  return (
                    <tr key={o.id} style={{ borderBottom: `1px solid ${hairline}` }}>
                      <td style={{ padding: '10px 14px', fontFamily: "'JetBrains Mono', monospace", fontSize: 12.5, color: ink, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{o.id}</td>
                      <td style={{ padding: '10px 14px', color: ink }} className="hidden md:table-cell">{o.customerId || '-'}</td>
                      <td style={{ padding: '10px 14px', color: inkSoft, fontSize: 13, whiteSpace: 'nowrap' }} className="hidden md:table-cell">{new Date(o.orderDate).toLocaleDateString()}</td>
                      <td style={{ padding: '10px 14px' }}>
                        <span style={{
                          display: 'inline-block',
                          padding: '3px 10px',
                          borderRadius: 20,
                          fontSize: 11,
                          fontWeight: 600,
                          background: sc.bg,
                          color: sc.color,
                          border: `1px solid ${sc.border}`,
                          letterSpacing: 0.02
                        }}>
                          {o.status}
                        </span>
                      </td>
                      <td style={{ padding: '10px 14px', fontFamily: "'JetBrains Mono', monospace", fontSize: 12.5, fontWeight: 600, color: ink, whiteSpace: 'nowrap' }}>{o.total}</td>
                      <td style={{ padding: '10px 14px', minWidth: 230 }}>
                        <RowActions order={o} onEdit={setEditing} onConvert={handleConvertToInvoice} onChangeStatus={changeStatus} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default SalesOrders;