import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    X, MessageSquare, FileCheck, Truck, Loader2, PackageCheck,
    Flag, Trash2, ChevronDown, BadgeCheck, Send, Clock
} from 'lucide-react';
import { AdminQuotationRequest, adminLifecycle } from '../../../services/adminPortalClient';
import { formatDate } from '../../../utils/formatters';
import { useAuth } from '../../../context/AuthContext';

const teal: Record<string, string> = { 50: '#eef7f6', 100: '#d3ece9', 200: '#a6d9d3', 300: '#72c0b7', 400: '#3fa294', 500: '#1f8577', 600: '#146b60', 700: '#0f544c', 800: '#0b3e39', 900: '#082e2a' };
const paper = '#FEFDFB';
const ink = '#23282A';
const inkSoft = '#5c6567';
const hairline = '#e4ddd1';
const danger = '#b5493f';

const requestStatusMeta: Record<string, { label: string; color: string; bg: string }> = {
    draft: { label: 'Draft', color: '#64748b', bg: '#f1f5f9' },
    submitted: { label: 'Submitted', color: '#1d4ed8', bg: '#eff6ff' },
    assigned: { label: 'Assigned', color: '#0f766e', bg: '#f0fdfa' },
    under_review: { label: 'Under Review', color: '#b45309', bg: '#fffbeb' },
    waiting_for_customer: { label: 'Waiting for Customer', color: '#7c3aed', bg: '#f5f3ff' },
    ready_for_conversion: { label: 'Ready for Conversion', color: '#047857', bg: '#ecfdf5' },
    converted: { label: 'Converted', color: '#0f766e', bg: '#f0fdfa' },
    rejected: { label: 'Rejected', color: '#b91c1c', bg: '#fef2f2' },
    cancelled: { label: 'Cancelled', color: '#64748b', bg: '#f1f5f9' },
};

interface QuotationRequestDetailsProps {
    request: AdminQuotationRequest;
    onClose: () => void;
    onAction: (request: AdminQuotationRequest, action: string) => void;
    staff?: { id: string; username: string }[];
    customerNameMap?: Record<string, string>;
}

export const QuotationRequestDetails: React.FC<QuotationRequestDetailsProps> = ({ request, onClose, onAction, staff = [], customerNameMap = {} }) => {
    const { companyConfig } = useAuth();
    const navigate = useNavigate();
    const currency = companyConfig?.currencySymbol || 'K';
    const [activeTab, setActiveTab] = useState<'Overview' | 'Items' | 'Activity'>('Overview');
    const [busy, setBusy] = useState<string | null>(null);
    const [assignTo, setAssignTo] = useState(request.assigned_to || '');
    const [rejectReason, setRejectReason] = useState('');
    const [clarifyNote, setClarifyNote] = useState('');

    const subtotal = (request.items || []).reduce((sum, i) => sum + (Number(i.quantity) || 0) * (Number(i.unitPrice) || 0), 0);
    const meta = requestStatusMeta[request.status] || { label: request.status, color: '#475569', bg: '#f8fafc' };
    const isTerminal = request.status === 'converted' || request.status === 'rejected' || request.status === 'cancelled';
    const assignedName = staff.find(s => s.id === request.assigned_to)?.username || request.assigned_to || '';

    const handleGenerateQuote = async () => {
        setBusy('generate_quote');
        try {
            const prefill = await adminLifecycle.requests.startQuotation(request.id);
            navigate('/sales-flow/quotations', { state: { action: 'create', quotationPrefill: prefill } });
        } catch (err: any) {
            console.error(err);
        } finally {
            setBusy(null);
        }
    };

    const handleGenerateOrder = async () => {
        setBusy('generate_order');
        try {
            const prefill = await adminLifecycle.requests.startOrder(request.id);
            navigate('/sales-flow/sales-orders', { state: { orderPrefill: prefill } });
        } catch (err: any) {
            console.error(err);
        } finally {
            setBusy(null);
        }
    };

    const handleReject = async () => {
        if (!rejectReason.trim()) return;
        setBusy('reject');
        try {
            await adminLifecycle.requests.reject(request.id, rejectReason);
            onClose();
        } catch (err: any) {
            console.error(err);
        } finally {
            setBusy(null);
        }
    };

    const handleClarify = async () => {
        if (!clarifyNote.trim()) return;
        setBusy('clarify');
        try {
            await adminLifecycle.requests.clarify(request.id, clarifyNote);
            setClarifyNote('');
        } catch (err: any) {
            console.error(err);
        } finally {
            setBusy(null);
        }
    };

    const handleAssign = async () => {
        if (!assignTo) return;
        setBusy('assign');
        try {
            const name = staff.find(s => s.id === assignTo)?.username || assignTo;
            await adminLifecycle.requests.assign(request.id, { assignTo, assignToName: name });
        } catch (err: any) {
            console.error(err);
        } finally {
            setBusy(null);
        }
    };

    const handleDelete = async () => {
        if (!window.confirm(`Delete request ${request.request_number}?`)) return;
        setBusy('delete');
        try {
            await adminLifecycle.requests.remove(request.id);
            onClose();
        } catch (err: any) {
            console.error(err);
        } finally {
            setBusy(null);
        }
    };

    return (
        <div className="w-full max-w-lg bg-[#FEFDFB] border-l border-[#e4ddd1] shadow-2xl flex flex-col h-full overflow-hidden animate-in slide-in-from-right duration-300">
            {/* Header */}
            <div className="p-4 border-b border-[#e4ddd1] shrink-0">
                <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-3">
                        <div className="p-2 rounded-lg" style={{ background: teal[50], color: teal[700] }}>
                            <MessageSquare size={18} />
                        </div>
                        <div>
                            <h2 className="text-sm font-bold text-[#23282A]">{request.request_number}</h2>
                            <p className="text-[10px] text-[#5c6567]">{request.request_type || 'quotation'} request</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-[#eef7f6] text-[#5c6567] hover:text-[#23282A] transition-colors">
                        <X size={18} />
                    </button>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold border" style={{ color: meta.color, background: meta.bg, borderColor: meta.color + '33' }}>
                        {meta.label}
                    </span>
                    <span className="text-[10px] text-[#5c6567]">{formatDate(request.created_at)}</span>
                    {assignedName && <span className="text-[10px] text-[#5c6567]">Assigned: <b className="text-[#0b3e39]">{assignedName}</b></span>}
                </div>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-[#e4ddd1] shrink-0">
                {(['Overview', 'Items', 'Activity'] as const).map(tab => (
                    <button key={tab} onClick={() => setActiveTab(tab)}
                        className={`flex-1 py-2.5 text-[10px] font-bold uppercase tracking-tight transition-colors ${activeTab === tab ? 'text-[#1f8577] border-b-2 border-[#1f8577] bg-[#eef7f6]' : 'text-[#5c6567] hover:text-[#23282A] hover:bg-[#f9f8f6]'}`}>
                        {tab}
                    </button>
                ))}
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto custom-scrollbar p-4">
                {activeTab === 'Overview' && (
                    <div className="space-y-4">
                        {/* Customer Info */}
                        <div className="bg-white rounded-xl border border-[#e4ddd1] p-3">
                            <p className="text-[10px] font-bold text-[#5c6567] uppercase tracking-tight mb-1">Customer</p>
                            <p className="text-sm font-semibold text-[#23282A]">{customerNameMap[request.customer_id] || request.customer_name || 'Unknown Customer'}</p>
                            <p className="text-[10px] text-[#5c6567] mt-0.5">ID: {request.customer_id?.slice(0, 8)}...</p>
                        </div>

                        {/* Total */}
                        <div className="bg-white rounded-xl border border-[#e4ddd1] p-3">
                            <p className="text-[10px] font-bold text-[#5c6567] uppercase tracking-tight mb-1">Estimated Total</p>
                            <p className="text-lg font-bold text-[#23282A] font-mono">{currency} {subtotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                        </div>

                        {/* Notes */}
                        {request.notes && (
                            <div className="bg-white rounded-xl border border-[#e4ddd1] p-3">
                                <p className="text-[10px] font-bold text-[#5c6567] uppercase tracking-tight mb-1">Notes</p>
                                <p className="text-xs text-[#23282A] whitespace-pre-wrap">{request.notes}</p>
                            </div>
                        )}

                        {/* Linked Documents */}
                        {(request.quotation_number || request.sales_order_number) && (
                            <div className="bg-white rounded-xl border border-[#e4ddd1] p-3">
                                <p className="text-[10px] font-bold text-[#5c6567] uppercase tracking-tight mb-2">Linked Documents</p>
                                {request.quotation_number && (
                                    <button onClick={() => navigate('/sales-flow/quotations')} className="text-xs text-[#1f8577] hover:underline font-semibold flex items-center gap-1 mb-1">
                                        <FileCheck size={12} /> {request.quotation_number}
                                    </button>
                                )}
                                {request.sales_order_number && (
                                    <button onClick={() => navigate('/sales-flow/sales-orders')} className="text-xs text-[#1f8577] hover:underline font-semibold flex items-center gap-1">
                                        <Truck size={12} /> {request.sales_order_number}
                                    </button>
                                )}
                            </div>
                        )}

                        {/* Delivery Date */}
                        {request.requested_delivery_date && (
                            <div className="bg-white rounded-xl border border-[#e4ddd1] p-3 flex items-center gap-3">
                                <Clock size={14} className="text-[#5c6567]" />
                                <div>
                                    <p className="text-[10px] font-bold text-[#5c6567] uppercase tracking-tight">Requested Delivery</p>
                                    <p className="text-xs font-semibold text-[#23282A]">{formatDate(request.requested_delivery_date)}</p>
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {activeTab === 'Items' && (
                    <div className="space-y-3">
                        <table className="w-full text-xs">
                            <thead>
                                <tr style={{ background: teal[50] }}>
                                    <th className="text-left p-2 text-[10px] font-bold text-[#5c6567] uppercase">Item</th>
                                    <th className="text-right p-2 text-[10px] font-bold text-[#5c6567] uppercase">Qty</th>
                                    <th className="text-right p-2 text-[10px] font-bold text-[#5c6567] uppercase">Price</th>
                                    <th className="text-right p-2 text-[10px] font-bold text-[#5c6567] uppercase">Total</th>
                                </tr>
                            </thead>
                            <tbody>
                                {(request.items || []).map((item, idx) => (
                                    <tr key={idx} className="border-t border-[#e4ddd1]">
                                        <td className="p-2 font-medium text-[#23282A]">{item.name}</td>
                                        <td className="p-2 text-right">{item.quantity}</td>
                                        <td className="p-2 text-right font-mono">{currency} {Number(item.unitPrice).toFixed(2)}</td>
                                        <td className="p-2 text-right font-mono font-bold">{currency} {Number(item.lineTotal ?? item.quantity * item.unitPrice).toFixed(2)}</td>
                                    </tr>
                                ))}
                            </tbody>
                            <tfoot>
                                <tr className="border-t-2 border-[#e4ddd1] font-bold">
                                    <td colSpan={3} className="p-2 text-right text-[#5c6567]">Subtotal</td>
                                    <td className="p-2 text-right font-mono text-[#23282A]">{currency} {subtotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                )}

                {activeTab === 'Activity' && (
                    <div className="space-y-3">
                        {/* Assign */}
                        {!isTerminal && (
                            <div className="bg-white rounded-xl border border-[#e4ddd1] p-3">
                                <p className="text-[10px] font-bold text-[#5c6567] uppercase tracking-tight mb-2 flex items-center gap-1.5"><PackageCheck size={12} /> Assign Salesperson</p>
                                <div className="flex gap-2">
                                    <select value={assignTo} onChange={e => setAssignTo(e.target.value)} className="flex-1 text-xs border border-[#e4ddd1] rounded-lg p-2 bg-white">
                                        <option value="">Select...</option>
                                        {staff.map(s => <option key={s.id} value={s.id}>{s.username}</option>)}
                                    </select>
                                    <button onClick={handleAssign} disabled={!assignTo || busy === 'assign'} className="px-3 py-1.5 text-[10px] font-bold uppercase rounded-lg bg-[#eef7f6] text-[#1f8577] hover:bg-[#d3ece9] disabled:opacity-50">
                                        {busy === 'assign' ? <Loader2 size={12} className="animate-spin" /> : 'Assign'}
                                    </button>
                                </div>
                            </div>
                        )}

                        {/* Clarify */}
                        {!isTerminal && (
                            <div className="bg-white rounded-xl border border-[#e4ddd1] p-3">
                                <p className="text-[10px] font-bold text-[#5c6567] uppercase tracking-tight mb-2 flex items-center gap-1.5"><Send size={12} /> Ask Customer</p>
                                <textarea value={clarifyNote} onChange={e => setClarifyNote(e.target.value)} rows={2} placeholder="Clarification note..." className="w-full text-xs border border-[#e4ddd1] rounded-lg p-2 resize-none mb-2" />
                                <button onClick={handleClarify} disabled={!clarifyNote.trim() || busy === 'clarify'} className="px-3 py-1.5 text-[10px] font-bold uppercase rounded-lg bg-[#eef7f6] text-[#1f8577] hover:bg-[#d3ece9] disabled:opacity-50">
                                    {busy === 'clarify' ? <Loader2 size={12} className="animate-spin" /> : 'Send'}
                                </button>
                            </div>
                        )}

                        {/* Reject */}
                        {!isTerminal && (
                            <div className="bg-white rounded-xl border border-[#fecaca] p-3">
                                <p className="text-[10px] font-bold text-[#b5493f] uppercase tracking-tight mb-2 flex items-center gap-1.5"><Flag size={12} /> Reject Request</p>
                                <input value={rejectReason} onChange={e => setRejectReason(e.target.value)} placeholder="Reason for rejection..." className="w-full text-xs border border-[#fecaca] rounded-lg p-2 mb-2" />
                                <button onClick={handleReject} disabled={!rejectReason.trim() || busy === 'reject'} className="px-3 py-1.5 text-[10px] font-bold uppercase rounded-lg bg-[#fef2f2] text-[#b5493f] hover:bg-[#fee2e2] disabled:opacity-50">
                                    {busy === 'reject' ? <Loader2 size={12} className="animate-spin" /> : 'Reject'}
                                </button>
                            </div>
                        )}

                        {/* Delete */}
                        <button onClick={handleDelete} disabled={busy === 'delete'} className="w-full px-3 py-2 text-[10px] font-bold uppercase rounded-lg border border-[#fecaca] text-[#b5493f] bg-[#fef2f2] hover:bg-[#fee2e2] disabled:opacity-50 flex items-center justify-center gap-2">
                            {busy === 'delete' ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />} Delete Request
                        </button>
                    </div>
                )}
            </div>

            {/* Footer Actions */}
            {!isTerminal && (
                <div className="p-4 border-t border-[#e4ddd1] shrink-0 space-y-2">
                    {request.request_type === 'order' ? (
                        <button onClick={handleGenerateOrder} disabled={busy === 'generate_order' || request.status !== 'ready_for_conversion'} className="w-full py-2.5 text-xs font-bold uppercase tracking-tight text-white rounded-xl flex items-center justify-center gap-2 disabled:opacity-50" style={{ background: request.status === 'ready_for_conversion' ? 'linear-gradient(155deg, #1f8577, #0f544c)' : '#94a3b8' }}>
                            {busy === 'generate_order' ? <Loader2 size={14} className="animate-spin" /> : <Truck size={14} />} {request.status === 'ready_for_conversion' ? 'Convert to Official Order' : 'Order Pending Review'}
                        </button>
                    ) : (
                        <button onClick={handleGenerateQuote} disabled={busy === 'generate_quote' || request.status !== 'ready_for_conversion'} className="w-full py-2.5 text-xs font-bold uppercase tracking-tight text-white rounded-xl flex items-center justify-center gap-2 disabled:opacity-50" style={{ background: request.status === 'ready_for_conversion' ? 'linear-gradient(155deg, #1f8577, #0f544c)' : '#94a3b8' }}>
                            {busy === 'generate_quote' ? <Loader2 size={14} className="animate-spin" /> : <FileCheck size={14} />} {request.status === 'ready_for_conversion' ? 'Convert to Official Quotation' : 'Quotation Pending Review'}
                        </button>
                    )}
                </div>
            )}
        </div>
    );
};
