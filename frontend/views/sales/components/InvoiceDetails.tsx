import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    X, CheckCircle, Clock, DollarSign, Printer, Edit2, Download,
    FileText, ArrowRight, History, Trash2,
    AlertTriangle, Plus, CreditCard, FileCheck as PaymentIcon,
    ChevronRight, Send, ExternalLink, TrendingUp, BarChart3, Zap, Lock, RefreshCw, Ban, Truck, Eye, Percent, User, Wallet
} from 'lucide-react';
import { Invoice, CustomerPayment, InvoiceAllocation } from '../../../types';
import { useAuth } from '../../../context/AuthContext';
import { useFinance } from '../../../context/FinanceContext';
import { useSales } from '../../../context/SalesContext';
import { useExamination } from '../../../context/ExaminationContext';
import { useDocumentPreview } from '../../../hooks/useDocumentPreview';
import TransactionPricingInsights from './TransactionPricingInsights';
import AIDocumentSummarizer from '../../../components/ai/AIDocumentSummarizer';
import { enrichInvoiceWithBatchPricing, findMatchingExaminationBatch } from '../../../utils/examinationInvoicePricing';
import { currencyService } from '../../../services/currencyService';

interface InvoiceDetailsProps {
    invoice: Invoice;
    onClose: () => void;
    onEdit: (inv: Invoice) => void;
    onAction: (inv: Invoice, action: string) => void;
    /**
     * True when this panel is showing a genuine recurring invoice (opened from
     * the Subscriptions tab). This is decided by the caller rather than by
     * peeking at `invoice.frequency`: the order form stores a default
     * `frequency: 'Monthly'` on REGULAR invoices too, which made the preview
     * wrongly render a Recurring Invoice document.
     */
    isSubscription?: boolean;
}

const teal: Record<string, string> = { 50: '#eef7f6', 100: '#d3ece9', 200: '#a6d9d3', 300: '#72c0b7', 400: '#3fa294', 500: '#1f8577', 600: '#146b60', 700: '#0f544c', 800: '#0b3e39', 900: '#082e2a' };
const amber: Record<string, string> = { 100: '#fbead0', 300: '#eec27a', 500: '#d99a3f', 600: '#b97e2b' };
const paper = '#FEFDFB';
const ink = '#23282A';
const inkSoft = '#5c6567';
const hairline = '#e4ddd1';
const danger = '#b5493f';

export const InvoiceDetails: React.FC<InvoiceDetailsProps> = ({ invoice: initialInvoice, onClose, onEdit, onAction, isSubscription = false }) => {
    const { companyConfig, auditLogs, notify } = useAuth();
    const { customerPayments = [], invoices = [], deliveryNotes = [], ledger = [], accounts = [], updateCustomerPayment, updateInvoice, addCustomerPayment } = useFinance();
    const { customers = [] } = useSales();
    const { batches = [] } = useExamination();

    const { handlePreview } = useDocumentPreview();
    const navigate = useNavigate();
    const currency = companyConfig?.currencySymbol || currencyService.getCurrency(currencyService.getBaseCurrency())?.symbol || '$';

    const invoice = useMemo(() =>
        invoices.find(i => i.id === initialInvoice.id) || initialInvoice
        , [invoices, initialInvoice]);

    const isExaminationInvoice = String((invoice as Record<string, unknown>).originModule ?? (invoice as Record<string, unknown>).origin_module ?? '').toLowerCase() === 'examination'
        || String((invoice as Record<string, unknown>).documentTitle ?? (invoice as Record<string, unknown>).document_title ?? '').toLowerCase().includes('examination invoice')
        || String((invoice as Record<string, unknown>).reference ?? '').toUpperCase().startsWith('EXM-BATCH-');
    const matchingExaminationBatch = useMemo(
        () => isExaminationInvoice ? findMatchingExaminationBatch(invoice, batches) : undefined,
        [batches, invoice, isExaminationInvoice]
    );
    const pricingInsightTransaction = useMemo(
        () => (isExaminationInvoice && matchingExaminationBatch)
            ? enrichInvoiceWithBatchPricing(invoice as Invoice & Record<string, unknown>, matchingExaminationBatch)
            : invoice,
        [invoice, isExaminationInvoice, matchingExaminationBatch]
    );
    
    const docTitle = 'Invoice';

    const [activeTab, setActiveTab] = useState<'Overview' | 'Financials' | 'Payments' | 'Activity'>('Overview');
    const [showAllocationModal, setShowAllocationModal] = useState(false);
    const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);

    const isCancelled = invoice.status === 'Cancelled';
    const balanceDue = isCancelled ? 0 : (invoice.totalAmount || 0) - (invoice.paidAmount || 0);
    const totalAmountDisplay = isCancelled ? 0 : (invoice.totalAmount || 0);
    const paidAmountDisplay = isCancelled ? 0 : (invoice.paidAmount || 0);
    const isPaid = balanceDue <= 0.001;

    const hasDeliveryNote = useMemo(() =>
        (deliveryNotes || []).some(dn => dn.invoiceId === invoice.id)
        , [deliveryNotes, invoice.id]);

    const handleStatusOverride = async (newStatus: string) => {
        setIsUpdatingStatus(true);
        try {
            if (newStatus === 'Paid' && !isPaid) {
                const paymentId = `PAY-FORCE-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
                const payment: CustomerPayment = {
                    id: paymentId,
                    date: new Date().toISOString(),
                    customerName: invoice.customerName,
                    amount: balanceDue,
                    paymentMethod: 'Cash',
                    reference: `Manual Override for INV #${invoice.id}`,
                    status: 'Cleared',
                    allocations: [{ paymentId: paymentId, invoiceId: invoice.id, amount: balanceDue }],
                    notes: 'System forced payment override.',
                    reconciled: false
                };
                await addCustomerPayment(payment);
                notify(`Payment record ${paymentId} generated and posted to Ledger.`, "success");
            } else {
                await updateInvoice({ ...invoice, status: newStatus as Invoice['status'] });
                notify(`Invoice status manually updated to ${newStatus}`, "info");
            }
        } finally {
            setIsUpdatingStatus(false);
        }
    };

    const handleAllocateCredit = async (payment: CustomerPayment) => {
        const amountToAllocate = Math.min(payment.creditApplied || 0, balanceDue);
        if (amountToAllocate <= 0) return;
        const newAllocation: InvoiceAllocation = { paymentId: payment.id, invoiceId: invoice.id, amount: amountToAllocate };
        const updatedPayment: CustomerPayment = { ...payment, allocations: [...(payment.allocations || []), newAllocation], creditApplied: (payment.creditApplied || 0) - amountToAllocate };
        try {
            await updateCustomerPayment(updatedPayment);
            notify(`${currency}${amountToAllocate} allocated from Payment #${payment.id}`, 'success');
            setShowAllocationModal(false);
        } catch (err: any) {
            notify(err?.message || 'Credit allocation blocked. Void and re-post payment for financial changes.', 'error');
        }
    };

    const paymentHistory = useMemo(() => {
        return (customerPayments || []).filter(payment =>
            payment.allocations && payment.allocations.some((a: any) => a.invoiceId === invoice.id)
        ).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    }, [customerPayments, invoice.id]);

    const availableCredits = useMemo(() => {
        return (customerPayments || []).filter(payment =>
            payment.customerName === invoice.customerName &&
            (payment.creditApplied || 0) > 0.01 &&
            payment.status === 'Cleared'
        );
    }, [customerPayments, invoice.customerName]);

    const totalCustomerOutstanding = useMemo(() => {
        return (invoices || [])
            .filter((inv: any) =>
                inv.customerName === invoice.customerName &&
                !['Paid', 'Cancelled', 'Void', 'Draft'].includes(String(inv.status || ''))
            )
            .reduce((sum: number, inv: any) => {
                const due = Math.max(0, Number(inv.totalAmount || 0) - Number(inv.paidAmount || 0));
                return sum + due;
            }, 0);
    }, [invoices, invoice.customerName]);

    const enrichedInvoice = useMemo(() => ({
        ...invoice,
        totalCustomerOutstanding,
    }), [invoice, totalCustomerOutstanding]);

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
                            <FileText size={19} color="#fff" />
                        </div>
                        <div style={{ minWidth: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                                <h1 className="sales-detail-title">
                                    {docTitle} #{invoice.id}
                                </h1>
                                <span style={{
                                    padding: '2px 10px', borderRadius: 6, fontSize: 11.5, fontWeight: 600,
                                    display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0,
                                    background: invoice.status === 'Paid' ? '#ecfdf5' : amber[100],
                                    color: invoice.status === 'Paid' ? '#059669' : '#d97706'
                                }}>
                                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: invoice.status === 'Paid' ? '#059669' : '#d97706' }} />
                                    {invoice.status}
                                </span>
                            </div>
                            <p style={{ margin: '2px 0 0', fontSize: 11.5, color: inkSoft, letterSpacing: 0.02, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                                <button onClick={() => navigate('/sales-flow/customers', { state: { customerId: invoice.customerId } })}
                                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: teal[600], fontWeight: 600, fontSize: 11.5, padding: 0, display: 'flex', alignItems: 'center', gap: 4 }}>
                                    {invoice.customerName}
                                    <ExternalLink size={10} />
                                </button>
                                <span style={{ color: hairline }}>|</span>
                                <span>Ref: {invoice.jobOrderId || 'Retail'}</span>
                            </p>
                        </div>
                    </div>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
                        {!hasDeliveryNote && (
                            <button onClick={() => onAction(invoice, 'generate_dn')}
                                className="hidden sm:flex"
                                style={{ padding: '6px 12px', borderRadius: 8, border: 'none', cursor: 'pointer', background: teal[500], color: '#fff', fontSize: 11, fontWeight: 600, alignItems: 'center', gap: 6 }}>
                                <Truck size={14} /> <span className="hidden md:inline">Generate delivery note</span>
                            </button>
                        )}
                        <button onClick={() => { onClose(); handlePreview(isSubscription ? 'SUBSCRIPTION' : (isExaminationInvoice ? 'EXAMINATION_INVOICE' : 'INVOICE'), enrichedInvoice); }}
                            style={{ padding: 6, borderRadius: 8, border: `1.4px solid ${hairline}`, background: paper, color: inkSoft, cursor: 'pointer', display: 'flex' }}>
                            <Eye size={16} />
                        </button>
                        <button onClick={() => onAction(invoice, 'download_pdf')}
                            style={{ padding: 6, borderRadius: 8, border: `1.4px solid ${hairline}`, background: paper, color: inkSoft, cursor: 'pointer', display: 'flex' }}>
                            <Download size={16} />
                        </button>
                        <button onClick={() => window.print()}
                            className="hidden sm:flex"
                            style={{ padding: 6, borderRadius: 8, border: `1.4px solid ${hairline}`, background: paper, color: inkSoft, cursor: 'pointer', display: 'flex' }}>
                            <Printer size={16} />
                        </button>
                        <button onClick={() => onEdit(invoice)}
                            style={{ padding: 6, borderRadius: 8, border: `1.4px solid ${hairline}`, background: paper, color: inkSoft, cursor: 'pointer', display: 'flex' }}>
                            <Edit2 size={16} />
                        </button>
                        <AIDocumentSummarizer docType="Invoice" data={invoice} label="" color="#8b5cf6" />
                        <button onClick={onClose}
                            style={{ width: 32, height: 32, borderRadius: 8, border: `1px solid ${hairline}`, background: paper, color: inkSoft, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                            <X size={15} />
                        </button>
                    </div>
                </div>

                <div className="sales-stats-row">
                    <div className="sales-stat-item">
                        <p style={{ margin: 0, fontSize: 11, color: inkSoft, fontWeight: 500 }}>Gross billing</p>
                        <p style={{ margin: '2px 0 0', fontSize: 18, fontWeight: 700, color: ink, fontFamily: "'JetBrains Mono', monospace" }}>{currency}{totalAmountDisplay.toLocaleString()}</p>
                    </div>
                    <div className="sales-stat-item">
                        <p style={{ margin: 0, fontSize: 11, color: inkSoft, fontWeight: 500 }}>Discount</p>
                        <p style={{ margin: '2px 0 0', fontSize: 18, fontWeight: 700, color: '#dc2626', fontFamily: "'JetBrains Mono', monospace" }}>
                            {invoice.discount ? `${invoice.discountType === 'percentage' ? invoice.discount + '%' : currency + (invoice.discount || 0).toLocaleString()}` : '-'}
                        </p>
                    </div>
                    <div className="sales-stat-item" style={{ borderRight: 'none' }}>
                        <p style={{ margin: 0, fontSize: 11, color: inkSoft, fontWeight: 500 }}>Net balance</p>
                        <p style={{ margin: '2px 0 0', fontSize: 18, fontWeight: 700, color: (balanceDue || 0) > 0.001 ? danger : hairline, fontFamily: "'JetBrains Mono', monospace" }}>{currency}{(balanceDue || 0).toLocaleString()}</p>
                    </div>
                </div>

                <div className="sales-tabs">
                    {['Overview', 'Financials', 'Payments', 'Activity'].map(tab => (
                        <button key={tab} onClick={() => setActiveTab(tab as 'Overview' | 'Financials' | 'Payments' | 'Activity')}
                            className={`sales-tab ${activeTab === tab ? 'active' : ''}`}>
                            {tab}
                        </button>
                    ))}
                </div>

                <div className="sales-detail-content" style={{ background: teal[50] }}>
                    {activeTab === 'Overview' && (
                        <div className="space-y-6 animate-in fade-in duration-300">
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                <div className="md:col-span-2 space-y-6">
                                    {(invoice as Record<string, unknown>).isConverted && (invoice as Record<string, unknown>).conversionDetails && (
                                        <div style={{ padding: 16, background: paper, borderRadius: 12, border: `1px solid ${hairline}` }}>
                                            <h3 style={{ margin: '0 0 12px', fontSize: 12, color: inkSoft, display: 'flex', alignItems: 'center', gap: 8 }}>
                                                <History size={14} color={teal[600]} /> Conversion History
                                            </h3>
                                            <div style={{ padding: 12, background: teal[50], borderRadius: 8, border: `1px solid ${teal[100]}` }}>
                                                <div style={{ display: 'flex', gap: 10 }}>
                                                    <div style={{ padding: 6, borderRadius: 6, background: paper, color: teal[600] }}>
                                                        <RefreshCw size={14} />
                                                    </div>
                                                    <div>
                                                        <p style={{ margin: 0, fontSize: 12, fontWeight: 600, color: ink }}>
                                                            Converted from <span style={{ color: teal[600] }}>{(invoice as any).conversionDetails.sourceType} {(invoice as any).conversionDetails.sourceNumber}</span>
                                                        </p>
                                                        <p style={{ margin: '4px 0 0', fontSize: 11, color: inkSoft, display: 'flex', alignItems: 'center', gap: 12 }}>
                                                            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><Clock size={11} /> {new Date((invoice as any).conversionDetails.date).toLocaleString()}</span>
                                                            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><User size={11} /> {(invoice as any).conversionDetails.acceptedBy}</span>
                                                        </p>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                    <div style={{ padding: 16, background: paper, borderRadius: 12, border: `1px solid ${hairline}` }}>
                                        <h3 style={{ margin: '0 0 12px', fontSize: 12, color: inkSoft, display: 'flex', alignItems: 'center', gap: 8 }}>
                                            <History size={14} color={teal[600]} /> System audit trail
                                        </h3>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 12px', background: teal[50], borderRadius: 8, border: `1px solid ${teal[100]}` }}>
                                                <span style={{ fontSize: 12, color: inkSoft }}>Created on</span>
                                                <span style={{ fontSize: 12, fontWeight: 600, color: ink }}>{new Date(invoice.date).toLocaleString()}</span>
                                            </div>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 12px', background: teal[50], borderRadius: 8, border: `1px solid ${teal[100]}` }}>
                                                <span style={{ fontSize: 12, color: inkSoft }}>Last modified</span>
                                                <span style={{ fontSize: 12, fontWeight: 600, color: ink }}>{new Date((invoice as Record<string, unknown>).updatedAt as string || invoice.date).toLocaleString()}</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <div style={{ padding: 16, background: paper, borderRadius: 12, border: `1px solid ${hairline}` }}>
                                    <h3 style={{ margin: '0 0 12px', fontSize: 11, color: inkSoft, display: 'flex', alignItems: 'center', gap: 6 }}>
                                        <Zap size={14} color={amber[500]} /> Quick actions
                                    </h3>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                        <button onClick={() => navigate('/sales-flow/payments', { state: { action: 'create', customer: invoice.customerName, customerId: invoice.customerId, invoiceId: invoice.id } })}
                                            style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: `1.4px solid ${teal[200]}`, cursor: 'pointer', background: teal[50], color: teal[700], fontWeight: 600, fontSize: 11, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                                            <PaymentIcon size={14} /> Record payment
                                        </button>
                                        {!isSubscription && (
                                            <button onClick={() => onAction(invoice, 'convert_to_recurring')}
                                                style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: `1.4px solid ${teal[200]}`, cursor: 'pointer', background: teal[50], color: teal[700], fontWeight: 600, fontSize: 11, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                                                <RefreshCw size={14} /> Convert to recurring
                                            </button>
                                        )}
                                        <button onClick={() => handleStatusOverride('Paid')} disabled={isUpdatingStatus || isPaid}
                                            style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: 'none', cursor: 'pointer', background: '#059669', color: '#fff', fontWeight: 600, fontSize: 11, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, opacity: (isUpdatingStatus || isPaid) ? 0.5 : 1 }}>
                                            {isUpdatingStatus ? <RefreshCw size={12} className="animate-spin" /> : <CheckCircle size={14} />} Force paid
                                        </button>
                                        <button onClick={() => handleStatusOverride('Cancelled')} disabled={isUpdatingStatus || isCancelled}
                                            style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: `1.4px solid ${danger}30`, cursor: 'pointer', background: paper, color: danger, fontWeight: 600, fontSize: 11, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, opacity: (isUpdatingStatus || isCancelled) ? 0.5 : 1 }}>
                                            <Ban size={14} /> Void invoice
                                        </button>
                                    </div>
                                    <div style={{ marginTop: 10, padding: 10, borderRadius: 8, background: `${amber[100]}80`, border: `1px solid ${amber[300]}`, display: 'flex', gap: 8 }}>
                                        <AlertTriangle size={14} color={amber[500]} style={{ flexShrink: 0, marginTop: 1 }} />
                                        <p style={{ margin: 0, fontSize: 10, color: '#92400e', lineHeight: 1.4 }}>Manual overrides bypass validation but generate full financial logs.</p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {activeTab === 'Financials' && (
                        <div className="space-y-6 animate-in fade-in duration-300">
                            <TransactionPricingInsights transaction={pricingInsightTransaction} currencySymbol={currency} />

                            <div style={{ borderRadius: 12, border: `1px solid ${hairline}`, overflow: 'hidden', background: paper }}>
                                <div style={{ padding: '12px 16px', borderBottom: `1px solid ${hairline}`, background: teal[50], display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <h3 style={{ margin: 0, fontSize: 12, color: ink, display: 'flex', alignItems: 'center', gap: 6 }}>
                                        <BarChart3 size={16} color={teal[600]} /> General ledger entries
                                    </h3>
                                    <span style={{ fontSize: 10, fontWeight: 700, background: teal[100], color: teal[600], padding: '2px 8px', borderRadius: 4 }}>Real-time sync</span>
                                </div>
                                <div style={{ overflowX: 'auto' }}>
                                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                                        <thead>
                                            <tr style={{ borderBottom: `1px solid ${hairline}`, background: teal[50] }}>
                                                <th style={{ padding: '8px 16px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: inkSoft }}>Date</th>
                                                <th style={{ padding: '8px 16px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: inkSoft }}>Account</th>
                                                <th style={{ padding: '8px 16px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: inkSoft }}>Description</th>
                                                <th style={{ padding: '8px 16px', textAlign: 'right', fontSize: 11, fontWeight: 600, color: inkSoft }}>Debit</th>
                                                <th style={{ padding: '8px 16px', textAlign: 'right', fontSize: 11, fontWeight: 600, color: inkSoft }}>Credit</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {ledger.filter(entry => entry.reference === invoice.id).length > 0 ? (
                                                ledger.filter(entry => entry.reference === invoice.id).map((entry, idx) => (
                                                    <tr key={idx} style={{ borderBottom: `1px solid ${hairline}` }}>
                                                        <td style={{ padding: '8px 16px', fontWeight: 600, color: ink }}>{new Date(entry.date).toLocaleDateString()}</td>
                                                        <td style={{ padding: '8px 16px', fontWeight: 600, color: teal[600] }}>{entry.accountName}</td>
                                                        <td style={{ padding: '8px 16px', color: inkSoft }}>{entry.description}</td>
                                                        <td style={{ padding: '8px 16px', textAlign: 'right', fontWeight: 600, color: ink, fontFamily: "'JetBrains Mono', monospace" }}>
                                                            {entry.type === 'Debit' ? `${currency}${entry.amount.toLocaleString()}` : '-'}
                                                        </td>
                                                        <td style={{ padding: '8px 16px', textAlign: 'right', fontWeight: 600, color: ink, fontFamily: "'JetBrains Mono', monospace" }}>
                                                            {entry.type === 'Credit' ? `${currency}${entry.amount.toLocaleString()}` : '-'}
                                                        </td>
                                                    </tr>
                                                ))
                                            ) : (
                                                <tr><td colSpan={5} style={{ padding: 32, textAlign: 'center', color: inkSoft, fontStyle: 'italic' }}>No ledger entries found for this invoice.</td></tr>
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                    )}

                    {activeTab === 'Payments' && (
                        <div className="space-y-6 animate-in fade-in duration-300">
                            <div style={{ borderRadius: 12, border: `1px solid ${hairline}`, overflow: 'hidden', background: paper }}>
                                <div style={{ padding: '12px 16px', borderBottom: `1px solid ${hairline}`, background: teal[50], display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <h3 style={{ margin: 0, fontSize: 12, color: ink, display: 'flex', alignItems: 'center', gap: 6 }}>
                                        <CreditCard size={16} color="#059669" /> Payment History
                                    </h3>
                                    <button onClick={() => navigate('/sales-flow/payments', { state: { action: 'create', customer: invoice.customerName, customerId: invoice.customerId, invoiceId: invoice.id } })}
                                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#059669', fontWeight: 600, fontSize: 11, display: 'flex', alignItems: 'center', gap: 4 }}>
                                        New Payment <ArrowRight size={12} />
                                    </button>
                                </div>
                                <div style={{ overflowX: 'auto' }}>
                                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                                        <thead>
                                            <tr style={{ borderBottom: `1px solid ${hairline}`, background: teal[50] }}>
                                                <th style={{ padding: '8px 16px', textAlign: 'left', fontSize: 10, fontWeight: 700, color: inkSoft, textTransform: 'uppercase', letterSpacing: 0.06 }}>Date</th>
                                                <th style={{ padding: '8px 16px', textAlign: 'left', fontSize: 10, fontWeight: 700, color: inkSoft, textTransform: 'uppercase', letterSpacing: 0.06 }}>Payment #</th>
                                                <th style={{ padding: '8px 16px', textAlign: 'left', fontSize: 10, fontWeight: 700, color: inkSoft, textTransform: 'uppercase', letterSpacing: 0.06 }}>Method</th>
                                                <th style={{ padding: '8px 16px', textAlign: 'right', fontSize: 10, fontWeight: 700, color: inkSoft, textTransform: 'uppercase', letterSpacing: 0.06 }}>Allocated</th>
                                                <th style={{ padding: '8px 16px', textAlign: 'center', fontSize: 10, fontWeight: 700, color: inkSoft, textTransform: 'uppercase', letterSpacing: 0.06 }}>Status</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {paymentHistory.map(payment => (
                                                <tr key={payment.id} style={{ borderBottom: `1px solid ${hairline}` }}>
                                                    <td style={{ padding: '8px 16px', fontWeight: 600, color: ink }}>{new Date(payment.date).toLocaleDateString()}</td>
                                                    <td style={{ padding: '8px 16px', fontWeight: 600, color: teal[600] }}>{payment.id}</td>
                                                    <td style={{ padding: '8px 16px', fontWeight: 600, color: ink }}>{payment.paymentMethod}</td>
                                                    <td style={{ padding: '8px 16px', textAlign: 'right', fontWeight: 600, color: '#059669', fontFamily: "'JetBrains Mono', monospace" }}>
                                                        {currency}{(payment.allocations?.find(a => a.invoiceId === invoice.id)?.amount || 0).toLocaleString()}
                                                    </td>
                                                    <td style={{ padding: '8px 16px', textAlign: 'center' }}>
                                                        <span style={{ padding: '2px 8px', borderRadius: 4, fontSize: 10, fontWeight: 700, background: payment.status === 'Cleared' ? '#ecfdf5' : payment.status === 'Bounced' ? '#fef2f2' : amber[100], color: payment.status === 'Cleared' ? '#059669' : payment.status === 'Bounced' ? '#dc2626' : '#d97706' }}>
                                                            {payment.status}
                                                        </span>
                                                    </td>
                                                </tr>
                                            ))}
                                            {paymentHistory.length === 0 && (
                                                <tr><td colSpan={5} style={{ padding: 32, textAlign: 'center', color: inkSoft, fontStyle: 'italic' }}>No payments recorded yet.</td></tr>
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                    )}

                    {activeTab === 'Activity' && (
                        <div className="space-y-6 animate-in fade-in duration-300">
                            <div style={{ borderRadius: 12, border: `1px solid ${hairline}`, overflow: 'hidden', background: paper }}>
                                <div style={{ padding: '12px 16px', borderBottom: `1px solid ${hairline}`, background: teal[50] }}>
                                    <h3 style={{ margin: 0, fontSize: 12, color: ink, display: 'flex', alignItems: 'center', gap: 6 }}>
                                        <History size={16} color={teal[600]} /> Detailed Audit Trail
                                    </h3>
                                </div>
                                <div style={{ padding: 16 }}>
                                    {auditLogs.filter(log => log.entityId === invoice.id).length > 0 ? (
                                        auditLogs.filter(log => log.entityId === invoice.id)
                                            .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                                            .map(log => (
                                                <div key={log.id} style={{ display: 'flex', gap: 12, padding: 12, background: teal[50], borderRadius: 8, border: `1px solid ${teal[100]}`, marginBottom: 8 }}>
                                                    <div style={{ width: 32, height: 32, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                                                        background: log.action === 'CREATE' ? '#ecfdf5' : log.action === 'UPDATE' ? '#eff6ff' : log.action === 'VOID' ? '#fef2f2' : hairline,
                                                        color: log.action === 'CREATE' ? '#059669' : log.action === 'UPDATE' ? '#2563eb' : log.action === 'VOID' ? '#dc2626' : inkSoft }}>
                                                        {log.action === 'CREATE' ? <Plus size={13} /> : log.action === 'UPDATE' ? <Edit2 size={13} /> : <Trash2 size={13} />}
                                                    </div>
                                                    <div style={{ flex: 1 }}>
                                                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                                                            <span style={{ fontSize: 12, fontWeight: 700, color: ink, textTransform: 'uppercase' }}>{log.action} {log.entityType}</span>
                                                            <span style={{ fontSize: 11, color: inkSoft }}>{new Date(log.date).toLocaleString()}</span>
                                                        </div>
                                                        <p style={{ margin: 0, fontSize: 12, color: ink, lineHeight: 1.5 }}>{log.details}</p>
                                                        <div style={{ marginTop: 4, display: 'flex', gap: 8 }}>
                                                            <span style={{ fontSize: 10, fontWeight: 700, background: hairline, color: inkSoft, padding: '1px 6px', borderRadius: 4, textTransform: 'uppercase' }}>{log.userId}</span>
                                                            <span style={{ fontSize: 10, color: inkSoft, textTransform: 'uppercase' }}>{log.userRole}</span>
                                                        </div>
                                                    </div>
                                                </div>
                                            ))
                                    ) : (
                                        <div style={{ padding: 32, textAlign: 'center', color: inkSoft, fontStyle: 'italic' }}>No activity recorded in the logs.</div>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {showAllocationModal && (
                    <div style={{ position: 'fixed', inset: 0, zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(15, 23, 42, 0.6)' }}>
                        <div style={{ width: 480, background: paper, borderRadius: 14, boxShadow: '0 30px 70px -20px rgba(0,0,0,.55)', overflow: 'hidden' }}>
                            <div style={{ padding: '14px 20px', borderBottom: `1px solid ${hairline}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <h3 style={{ margin: 0, fontSize: 13, color: ink, display: 'flex', alignItems: 'center', gap: 6 }}>
                                    <Wallet size={16} color="#059669" /> Apply Customer Credits
                                </h3>
                                <button onClick={() => setShowAllocationModal(false)} style={{ padding: 4, border: 'none', background: 'transparent', cursor: 'pointer', color: inkSoft }}>
                                    <X size={16} />
                                </button>
                            </div>
                            <div style={{ padding: 16, maxHeight: '50vh', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
                                {availableCredits.map(payment => (
                                    <div key={payment.id} onClick={() => handleAllocateCredit(payment)}
                                        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 14, border: `1px solid ${hairline}`, borderRadius: 10, cursor: 'pointer', background: paper }}>
                                        <div>
                                            <div style={{ fontWeight: 600, color: ink, fontSize: 12 }}>Payment #{payment.id}</div>
                                            <div style={{ fontSize: 11, color: inkSoft, marginTop: 2 }}>Found: {new Date(payment.date).toLocaleDateString()}</div>
                                        </div>
                                        <div style={{ textAlign: 'right' }}>
                                            <div style={{ fontSize: 15, fontWeight: 700, color: '#059669' }}>{currency}{(payment.creditApplied || 0).toLocaleString()}</div>
                                            <div style={{ fontSize: 10, color: inkSoft, textTransform: 'uppercase' }}>Avail. Fund</div>
                                        </div>
                                    </div>
                                ))}
                                {availableCredits.length === 0 && (
                                    <div style={{ padding: 32, textAlign: 'center', color: inkSoft, fontStyle: 'italic' }}>No available credits for this client.</div>
                                )}
                            </div>
                        </div>
                    </div>
                )}

                <div style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'flex-end',
                    gap: 10, padding: '16px 28px',
                    borderTop: `1px solid ${hairline}`, background: paper
                }}>
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
