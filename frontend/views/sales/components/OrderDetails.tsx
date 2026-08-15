import React, { useState, useMemo } from 'react';
import {
    X, CheckCircle, Clock, FileText, DollarSign, Printer, Edit2, Download,
    ArrowRight, History, Trash2, CreditCard,
    AlertTriangle, Plus, Eye, Package, User, MapPin, Calendar, ShoppingBag, ChevronRight
} from 'lucide-react';
import { Order, OrderPayment, OrderItem } from '../../../types';
import { useAuth } from '../../../context/AuthContext';
import { useOrders } from '../../../context/OrdersContext';
import { useDocumentPreview } from '../../../hooks/useDocumentPreview';
import { useLocation } from 'react-router-dom';
import DocLink from '../../../components/DocLink';
import TransactionPricingInsights from './TransactionPricingInsights';
import { currencyService } from '../../../services/currencyService';

interface OrderDetailsProps {
    order: Order;
    onClose: () => void;
    onEdit: (order: Order) => void;
    onAction: (order: Order, action: string) => void;
}

const teal: Record<string, string> = { 50: '#eef7f6', 100: '#d3ece9', 200: '#a6d9d3', 300: '#72c0b7', 400: '#3fa294', 500: '#1f8577', 600: '#146b60', 700: '#0f544c', 800: '#0b3e39', 900: '#082e2a' };
const amber: Record<string, string> = { 100: '#fbead0', 300: '#eec27a', 500: '#d99a3f', 600: '#b97e2b' };
const paper = '#FEFDFB';
const ink = '#23282A';
const inkSoft = '#5c6567';
const hairline = '#e4ddd1';
const danger = '#b5493f';

export const OrderDetails: React.FC<OrderDetailsProps> = ({ order: initialOrder, onClose, onEdit, onAction }) => {
    const { companyConfig, notify } = useAuth();
    const { orders = [] } = useOrders();
    const { handlePreview } = useDocumentPreview();
    const location = useLocation();
    const currency = companyConfig?.currencySymbol || currencyService.getCurrency(currencyService.getBaseCurrency())?.symbol || '$';

    const order = useMemo(() =>
        orders.find(o => o.id === initialOrder.id) || initialOrder
        , [orders, initialOrder]);

    const [activeTab, setActiveTab] = useState<'Overview' | 'Payments' | 'Activity'>('Overview');

    const isCancelled = order.status === 'Cancelled';
    const isCompleted = order.status === 'Completed';
    const isPaid = order.status === 'Paid';

    return (
        <div className="sales-detail-backdrop" style={{ fontFamily: "'Inter','DM Sans',sans-serif", fontSize: 13.5, color: ink }}>
            <div className="sales-detail-panel">
                <div style={{
                    position: 'absolute', top: 0, left: 0, right: 0, height: 4,
                    background: `linear-gradient(90deg, ${teal[600]}, ${teal[400]} 40%, ${amber[500]} 100%)`
                }} />

                <div className="sales-detail-header">
                    <div style={{ display: 'flex', alignItems: 'center', gap: 14, minWidth: 0, flex: 1 }}>
                        <div style={{
                            width: 40, height: 40, borderRadius: 10,
                            background: `linear-gradient(155deg, ${teal[500]}, ${teal[700]})`,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            boxShadow: `0 4px 10px -3px rgba(15,84,76,.6)`, flexShrink: 0
                        }}>
                            <Package size={19} color="#fff" />
                        </div>
                        <div style={{ minWidth: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                                <h1 className="sales-detail-title">
                                    Order #{order.orderNumber}
                                </h1>
                                <span style={{
                                    padding: '2px 10px', borderRadius: 6, fontSize: 11.5, fontWeight: 600, flexShrink: 0,
                                    background: order.status === 'Completed' || order.status === 'Paid' ? '#ecfdf5' :
                                        order.status === 'Partially Paid' ? amber[100] :
                                        order.status === 'Cancelled' ? '#fef2f2' :
                                        order.status === 'Processing' ? '#eff6ff' : amber[100],
                                    color: order.status === 'Completed' || order.status === 'Paid' ? '#059669' :
                                        order.status === 'Partially Paid' ? '#d97706' :
                                        order.status === 'Cancelled' ? '#dc2626' :
                                        order.status === 'Processing' ? '#2563eb' : '#d97706'
                                }}>
                                    {order.status}
                                </span>
                            </div>
                            <p style={{ margin: '2px 0 0', fontSize: 11.5, color: inkSoft, letterSpacing: 0.02, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                                <span style={{ padding: '1px 6px', borderRadius: 4, background: teal[50], color: teal[700], fontWeight: 600 }}>{order.customerName}</span>
                                <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><Clock size={12} /> Placed {new Date(order.orderDate).toLocaleDateString()}</span>
                                <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><User size={12} /> Created by {order.createdBy}</span>
                            </p>
                        </div>
                    </div>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
                        <button onClick={() => onEdit(order)}
                            style={{ padding: '8px 14px', borderRadius: 8, background: paper, border: `1.4px solid ${hairline}`, color: inkSoft, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600 }}>
                            <Edit2 size={14} /> <span className="hidden sm:inline">Edit</span>
                        </button>
                        <button onClick={onClose}
                            style={{ width: 32, height: 32, borderRadius: 8, border: `1px solid ${hairline}`, background: paper, color: inkSoft, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                            <X size={15} />
                        </button>
                    </div>
                </div>

                <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                        <div className="sales-tabs">
                            {(['Overview', 'Payments', 'Activity'] as const).map(tab => (
                                <button key={tab} onClick={() => setActiveTab(tab)}
                                    className={`sales-tab ${activeTab === tab ? 'active' : ''}`}>
                                    {tab}
                                </button>
                            ))}
                        </div>

                        <div className="sales-detail-content">
                            {activeTab === 'Overview' && (
                                <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-300">
                                    <div style={{ borderRadius: 12, border: `1px solid ${hairline}`, overflow: 'hidden', background: paper }}>
                                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                                            <thead>
                                                <tr style={{ borderBottom: `1px solid ${hairline}`, background: teal[50] }}>
                                                    <th style={{ padding: '10px 16px', textAlign: 'center', fontSize: 11, fontWeight: 600, color: inkSoft }}>Qty</th>
                                                    <th style={{ padding: '10px 16px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: inkSoft }}>Description</th>
                                                    <th style={{ padding: '10px 16px', textAlign: 'right', fontSize: 11, fontWeight: 600, color: inkSoft }}>Price</th>
                                                    <th style={{ padding: '10px 16px', textAlign: 'right', fontSize: 11, fontWeight: 600, color: inkSoft }}>Total</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {order.items.map((item, idx) => (
                                                    <tr key={idx} style={{ borderBottom: `1px solid ${hairline}` }}>
                                                        <td style={{ padding: '10px 16px', textAlign: 'center', fontWeight: 600, color: ink }}>{item.quantity}</td>
                                                        <td style={{ padding: '10px 16px' }}>
                                                            <div style={{ fontWeight: 600, color: ink }}>{item.productName}</div>
                                                            <div style={{ fontSize: 11, color: inkSoft, marginTop: 2 }}>
                                                                <DocLink docNumber={item.productId} targetPage="/inventory" rowId={`item-${item.productId}`} currentPage={location.pathname} />
                                                            </div>
                                                        </td>
                                                        <td style={{ padding: '10px 16px', textAlign: 'right', fontWeight: 500, color: ink }}>{currency}{item.unitPrice.toLocaleString()}</td>
                                                        <td style={{ padding: '10px 16px', textAlign: 'right', fontWeight: 700, color: ink }}>{currency}{item.subtotal.toLocaleString()}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>

                                    <div className="sales-grid-2">
                                        <div className="space-y-6">
                                            <div style={{ padding: 20, background: paper, borderRadius: 12, border: `1px solid ${hairline}` }}>
                                                <h3 style={{ margin: '0 0 8px', fontSize: 10, fontWeight: 700, color: inkSoft, textTransform: 'uppercase', letterSpacing: 0.06, display: 'flex', alignItems: 'center', gap: 6 }}>
                                                    <MapPin size={14} /> Shipping Address
                                                </h3>
                                                <p style={{ margin: 0, fontSize: 12, color: ink, lineHeight: 1.5 }}>
                                                    {order.shippingAddress || 'No shipping address provided.'}
                                                </p>
                                            </div>
                                            {order.notes && (
                                                <div style={{ padding: 20, background: teal[50], borderRadius: 12, border: `1px solid ${teal[100]}` }}>
                                                    <h3 style={{ margin: '0 0 8px', fontSize: 10, fontWeight: 700, color: teal[600], textTransform: 'uppercase', letterSpacing: 0.06 }}>Internal Notes</h3>
                                                    <p style={{ margin: 0, fontSize: 12, color: teal[800], fontStyle: 'italic' }}>"{order.notes}"</p>
                                                </div>
                                            )}
                                        </div>

                                        <div style={{ padding: 24, background: teal[800], borderRadius: 12, color: '#fff' }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'rgba(255,255,255,.6)', marginBottom: 8 }}>
                                                <span>Subtotal</span>
                                                <span>{currency}{((order.totalAmount || 0) - (order.tax || 0)).toLocaleString()}</span>
                                            </div>
                                            {(order.discount || 0) > 0 && (
                                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#fca5a5', marginBottom: 8 }}>
                                                    <span>Discount {order.discountType === 'percentage' ? `(${order.discount}%)` : ''}</span>
                                                    <span>-{currency}{(order.discount || 0).toLocaleString()}</span>
                                                </div>
                                            )}
                                            {order.tax && order.tax > 0 && (
                                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'rgba(255,255,255,.6)', marginBottom: 8 }}>
                                                    <span>Tax ({order.taxRate}%)</span>
                                                    <span>{currency}{order.tax.toLocaleString()}</span>
                                                </div>
                                            )}
                                            <div style={{ height: 1, background: 'rgba(255,255,255,.1)', margin: '8px 0' }} />
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.08, color: amber[300] }}>Total Amount</span>
                                                <span style={{ fontSize: 24, fontWeight: 800 }}>{currency}{order.totalAmount.toLocaleString()}</span>
                                            </div>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 12 }}>
                                                <span style={{ fontSize: 11, color: '#6ee7b7' }}>Paid Amount</span>
                                                <span style={{ fontSize: 16, fontWeight: 700, color: '#6ee7b7' }}>{currency}{order.paidAmount.toLocaleString()}</span>
                                            </div>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
                                                <span style={{ fontSize: 11, color: '#fca5a5' }}>Balance Due</span>
                                                <span style={{ fontSize: 16, fontWeight: 700, color: '#fca5a5' }}>{currency}{order.remainingBalance.toLocaleString()}</span>
                                            </div>
                                        </div>
                                    </div>

                                    <TransactionPricingInsights transaction={order} currencySymbol={currency} />
                                </div>
                            )}

                            {activeTab === 'Payments' && (
                                <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-300">
                                    {order.payments.length > 0 ? (
                                        <div className="space-y-4">
                                            {order.payments.map((payment, idx) => (
                                                <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 16, background: paper, borderRadius: 12, border: `1px solid ${hairline}` }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                                        <div style={{ width: 40, height: 40, borderRadius: 10, background: '#ecfdf5', color: '#059669', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                            <DollarSign size={20} />
                                                        </div>
                                                        <div>
                                                            <div style={{ fontWeight: 700, color: ink }}>{currency}{payment.amountPaid.toLocaleString()}</div>
                                                            <div style={{ fontSize: 11, color: inkSoft, marginTop: 2 }}>via {payment.paymentMethod} &bull; {new Date(payment.paymentDate).toLocaleDateString()}</div>
                                                        </div>
                                                    </div>
                                                    <div style={{ textAlign: 'right' }}>
                                                        <div style={{ fontSize: 10, fontWeight: 700, color: inkSoft, textTransform: 'uppercase', letterSpacing: 0.06, marginBottom: 2 }}>Recorded by</div>
                                                        <div style={{ fontSize: 12, fontWeight: 700, color: ink }}>{payment.recordedBy}</div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    ) : (
                                        <div style={{ height: 200, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: teal[50], borderRadius: 12, border: `2px dashed ${teal[200]}` }}>
                                            <div style={{ width: 48, height: 48, borderRadius: '50%', background: teal[100], color: teal[300], display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
                                                <CreditCard size={24} />
                                            </div>
                                            <p style={{ color: inkSoft, fontWeight: 700, textTransform: 'uppercase', fontSize: 11, letterSpacing: 0.06 }}>No payments recorded yet</p>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="sales-desktop-actions" style={{ width: 260, flexShrink: 0, borderLeft: `1px solid ${hairline}`, padding: 16, background: teal[50], display: 'flex', flexDirection: 'column', gap: 16 }}>
                        <div>
                            <h3 style={{ margin: '0 0 8px', fontSize: 11, fontWeight: 600, color: inkSoft }}>Quick Actions</h3>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                <button onClick={() => onAction(order, 'preview_pdf')}
                                    style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: `1.4px solid ${hairline}`, cursor: 'pointer', background: paper, color: inkSoft, fontWeight: 600, fontSize: 11, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                                    <Eye size={14} /> Preview Order
                                </button>
                                <button onClick={() => onAction(order, 'download_pdf')}
                                    style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: `1.4px solid ${hairline}`, cursor: 'pointer', background: paper, color: inkSoft, fontWeight: 600, fontSize: 11, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                                    <Download size={14} /> Download PDF
                                </button>
                                <button onClick={() => window.print()}
                                    style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: `1.4px solid ${hairline}`, cursor: 'pointer', background: paper, color: inkSoft, fontWeight: 600, fontSize: 11, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                                    <Printer size={14} /> Print Order
                                </button>
                            </div>
                        </div>

                        <div>
                            <h3 style={{ margin: '0 0 8px', fontSize: 11, fontWeight: 600, color: inkSoft }}>Workflow</h3>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                <button onClick={() => onAction(order, 'record_payment')} disabled={isCompleted || isPaid || isCancelled}
                                    style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: 'none', cursor: 'pointer', background: `linear-gradient(155deg, ${teal[500]}, ${teal[700]})`, color: '#fff', fontWeight: 600, fontSize: 11, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, opacity: (isCompleted || isPaid || isCancelled) ? 0.5 : 1, boxShadow: `0 4px 10px -4px rgba(15,84,76,.4)` }}>
                                    <DollarSign size={14} /> Record Payment
                                </button>
                                <button onClick={() => onAction(order, 'convert_to_invoice')} disabled={isCompleted || isCancelled}
                                    style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: `1.4px solid ${teal[200]}`, cursor: 'pointer', background: teal[50], color: teal[700], fontWeight: 600, fontSize: 11, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, opacity: (isCompleted || isCancelled) ? 0.5 : 1 }}>
                                    <CheckCircle size={14} /> Convert to Invoice
                                </button>
                                <button onClick={() => onAction(order, 'convert_to_job_ticket')} disabled={isCompleted || isCancelled}
                                    style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: `1.4px solid ${teal[200]}`, cursor: 'pointer', background: teal[50], color: teal[700], fontWeight: 600, fontSize: 11, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, opacity: (isCompleted || isCancelled) ? 0.5 : 1 }}>
                                    <Package size={14} /> Convert to Job Ticket
                                </button>
                            </div>
                        </div>

                        <div style={{ padding: 14, borderRadius: 10, border: `1px solid ${danger}30`, background: `${danger}08` }}>
                            <h3 style={{ margin: '0 0 8px', fontSize: 10, fontWeight: 700, color: danger, textTransform: 'uppercase', letterSpacing: 0.06 }}>Danger Zone</h3>
                            <button onClick={() => onAction(order, 'cancel_order')} disabled={isCancelled}
                                style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: `1.4px solid ${danger}30`, cursor: 'pointer', background: paper, color: danger, fontWeight: 600, fontSize: 11, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, opacity: isCancelled ? 0.5 : 1 }}>
                                <X size={14} /> Cancel Order
                            </button>
                        </div>
                    </div>
                </div>

                <div className="sales-mobile-actions" style={{ flexWrap: 'wrap' }}>
                    <button onClick={() => onAction(order, 'record_payment')} disabled={isCompleted || isPaid || isCancelled}
                        style={{ flex: 1, minWidth: 120, padding: '10px 12px', borderRadius: 8, border: 'none', cursor: 'pointer', background: `linear-gradient(155deg, ${teal[500]}, ${teal[700]})`, color: '#fff', fontWeight: 600, fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, opacity: (isCompleted || isPaid || isCancelled) ? 0.5 : 1 }}>
                        <DollarSign size={14} /> Pay
                    </button>
                    <button onClick={() => onAction(order, 'convert_to_invoice')} disabled={isCompleted || isCancelled}
                        style={{ flex: 1, minWidth: 120, padding: '10px 12px', borderRadius: 8, border: `1.4px solid ${teal[200]}`, cursor: 'pointer', background: teal[50], color: teal[700], fontWeight: 600, fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, opacity: (isCompleted || isCancelled) ? 0.5 : 1 }}>
                        <CheckCircle size={14} /> Invoice
                    </button>
                    <button onClick={() => onAction(order, 'preview_pdf')}
                        style={{ padding: '10px 12px', borderRadius: 8, border: `1.4px solid ${hairline}`, cursor: 'pointer', background: paper, color: inkSoft, fontWeight: 600, fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                        <Eye size={14} />
                    </button>
                </div>

                <div className="sales-detail-footer">
                    <button type="button" onClick={onClose}
                        style={{
                            fontFamily: "'Inter', sans-serif", fontSize: 13, fontWeight: 600,
                            padding: '9px 18px', borderRadius: 9, cursor: 'pointer',
                            background: paper, border: `1.4px solid ${hairline}`, color: inkSoft,
                            display: 'flex', alignItems: 'center', gap: 7, transition: 'all .15s ease'
                        }}
                        onMouseEnter={e => { e.currentTarget.style.background = teal[50]; e.currentTarget.style.color = teal[800]; e.currentTarget.style.borderColor = teal[200]; }}
                        onMouseLeave={e => { e.currentTarget.style.background = paper; e.currentTarget.style.color = inkSoft; e.currentTarget.style.borderColor = hairline; }}>
                        Close
                    </button>
                </div>
            </div>
        </div>
    );
};
