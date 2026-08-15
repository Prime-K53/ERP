import React, { useState, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    RefreshCw, Calendar, DollarSign, Clock, Repeat, FileText, Plus,
    TrendingUp, AlertCircle, ArrowRight, Wallet, Activity, Zap,
    Play, Pause, Edit2, Trash2, Eye, Download, Copy, X, Search, LayoutGrid, List,
    CheckCircle, BarChart3
} from 'lucide-react';
import { RecurringInvoice } from '../../types';
import { useFinance } from '../../context/FinanceContext';
import { useSales } from '../../context/SalesContext';
import { useAuth } from '../../context/AuthContext';
import SubscriptionView from '../../views/sales/components/SubscriptionView';
import { OrderForm } from '../../views/sales/components/OrderForm';
import { useDocumentPreview } from '../../hooks/useDocumentPreview';
import { buildRecurringDraftFromInvoice } from '../../utils/recurringConversion';
import { enrichDocumentCustomerData } from '../../utils/documentCustomerData';
import { mapToInvoiceData } from '../../utils/pdfMapper';
import { PrimeDocument } from '../../views/shared/components/PDF/PrimeDocument';
import { PrimeDocData } from '../../views/shared/components/PDF/schemas';
import { ConfirmDialog, ConfirmDialogType } from '../../components/ConfirmDialog';
import { pdf } from '@react-pdf/renderer';
import { initializePrimePdfFonts } from '../../views/shared/components/PDF/templateSettings';
import { attachDocumentSecurity } from '../../utils/documentSecurity';
import { downloadBlob, generateNextId } from '../../utils/helpers';
import { currencyService } from '../../services/currencyService';

const SUBSCRIPTION_STATUSES = ['Draft', 'Active', 'Paused', 'Cancelled', 'Expired'] as const;

const cloneSerializable = <T,>(value: T): T => {
    if (value == null) return value;
    if (typeof structuredClone === 'function') {
        return structuredClone(value);
    }
    return JSON.parse(JSON.stringify(value));
};

const normalizeDateOnly = (value?: string) => {
    const fallback = new Date();
    const parsed = value ? new Date(value) : fallback;
    if (Number.isNaN(parsed.getTime())) {
        return fallback.toISOString().split('T')[0];
    }
    return parsed.toISOString().split('T')[0];
};

const normalizeSubscriptionStatus = (status?: string) => {
    return SUBSCRIPTION_STATUSES.includes(status as typeof SUBSCRIPTION_STATUSES[number])
        ? status
        : 'Draft';
};

const addSubscriptionFrequency = (dateValue: string, frequency?: string) => {
    const nextDate = new Date(normalizeDateOnly(dateValue));
    switch (frequency) {
        case 'Daily':
            nextDate.setDate(nextDate.getDate() + 1);
            break;
        case 'Weekly':
            nextDate.setDate(nextDate.getDate() + 7);
            break;
        case 'Quarterly':
            nextDate.setMonth(nextDate.getMonth() + 3);
            break;
        case 'Annually':
            nextDate.setFullYear(nextDate.getFullYear() + 1);
            break;
        default:
            nextDate.setMonth(nextDate.getMonth() + 1);
            break;
    }
    return nextDate.toISOString().split('T')[0];
};

const ensureFutureSubscriptionRunDate = (nextRunDate?: string, frequency?: string) => {
    const today = normalizeDateOnly(new Date().toISOString());
    const normalizedNextRunDate = nextRunDate ? normalizeDateOnly(nextRunDate) : '';

    if (normalizedNextRunDate && new Date(normalizedNextRunDate).getTime() > new Date(today).getTime()) {
        return normalizedNextRunDate;
    }

    return addSubscriptionFrequency(today, frequency);
};

const buildRecurringDraftFromTemplate = (item: RecurringInvoice): RecurringInvoice => {
    const cloned = cloneSerializable(item);
    const {
        id: _originalId,
        paidAmount: _paidAmount,
        amountPaid: _amountPaid,
        generatedInvoiceIds: _generatedInvoiceIds,
        generatedInvoices: _generatedInvoices,
        billingHistory: _billingHistory,
        runHistory: _runHistory,
        lastRunDate: _lastRunDate,
        billingPeriodStart: _billingPeriodStart,
        billingPeriodEnd: _billingPeriodEnd,
        nextBillingDate: _nextBillingDate,
        approvedAt: _approvedAt,
        createdAt: _createdAt,
        updatedAt: _updatedAt,
        ...rest
    } = cloned;

    return {
        ...rest,
        id: '',
        date: normalizeDateOnly(new Date().toISOString()),
        status: 'Draft',
        nextRunDate: ensureFutureSubscriptionRunDate(rest.nextRunDate, rest.frequency),
        scheduledDates: Array.isArray(rest.scheduledDates) ? rest.scheduledDates.map((date: any) => String(date)) : [],
        items: Array.isArray(rest.items) ? rest.items.map((entry: any) => cloneSerializable(entry)) : [],
        paidAmount: 0,
        amountPaid: 0
    } as RecurringInvoice;
};

const SubscriptionsView: React.FC = () => {
    const navigate = useNavigate();
    const { companyConfig, notify, user } = useAuth();
    const finance = useFinance();
    const { runRecurringBilling } = useSales();
    const { handlePreview, handlePrint } = useDocumentPreview();

    const currency = companyConfig?.currencySymbol || currencyService.getCurrency(currencyService.getBaseCurrency())?.symbol || '$';

    const [isFormOpen, setIsFormOpen] = useState(false);
    const [editingItem, setEditingItem] = useState<any>(null);
    const [isSaving, setIsSaving] = useState(false);
    const [searchText, setSearchTerm] = useState('');
    const [selectedMetric, setSelectedMetric] = useState<string>('All');
    const [confirmState, setConfirmState] = useState<{ open: boolean; title: string; message: string; confirmText?: string; type?: ConfirmDialogType; onConfirm?: () => void }>({ open: false, title: '', message: '' });

    const recurringInvoices = finance.recurringInvoices || [];
    const invoices = finance.invoices || [];
    const { customers } = useSales();

    const filteredData = useMemo(() => {
        if (!searchText) return recurringInvoices;
        const lower = searchText.toLowerCase();
        return recurringInvoices.filter(i =>
            (i.customerName || '').toLowerCase().includes(lower) ||
            (i.id || '').toLowerCase().includes(lower)
        );
    }, [recurringInvoices, searchText]);

    const stats = useMemo(() => {
        let mrr = 0;
        let activeCount = 0;
        let upcomingTotal = 0;

        (recurringInvoices || []).forEach(sub => {
            if (sub.status === 'Active') {
                activeCount++;
                upcomingTotal += sub.total;
                if (sub.frequency === 'Weekly') mrr += sub.total * 4.33;
                else if (sub.frequency === 'Quarterly') mrr += sub.total / 3;
                else if (sub.frequency === 'Annually') mrr += sub.total / 12;
                else mrr += sub.total;
            }
        });
        return { mrr, activeCount, upcomingTotal, totalSubscriptions: recurringInvoices.length, arr: mrr * 12 };
    }, [recurringInvoices]);

    const handleCreate = () => {
        setEditingItem(null);
        setIsFormOpen(true);
    };

    const handleEdit = (item: any) => {
        setEditingItem(item);
        setIsFormOpen(true);
    };

    const handleDelete = async (id: string) => {
        setConfirmState({
            open: true,
            title: 'Delete Recurring Invoice',
            message: 'Are you sure you want to delete this recurring invoice?',
            type: 'danger',
            confirmText: 'Delete',
            onConfirm: async () => {
                await finance.deleteRecurringInvoice(id);
                notify("Recurring invoice deleted", "info");
            }
        });
    };

    const handleView = (item: any) => {
        handlePreview('SUBSCRIPTION', item);
    };

    const handleSave = async (data: any, asDraft: boolean, reason?: string) => {
        if (isSaving) return;
        setIsSaving(true);
        try {
            if (editingItem) {
                await finance.updateRecurringInvoice(data);
            } else {
                await finance.addRecurringInvoice(data);
            }
            setIsFormOpen(false);
            setEditingItem(null);
            notify("Subscription saved successfully", "success");
        } catch (err: any) {
            notify(`Failed to save: ${err.message}`, "error");
        } finally {
            setIsSaving(false);
        }
    };

    const handleAction = useCallback(async (item: any, action: string) => {
        if (action.startsWith('status_')) {
            const newStatus = action.replace('status_', '');
            const normalizedStatus = normalizeSubscriptionStatus(newStatus);
            await finance.updateRecurringInvoice({
                ...item,
                status: normalizedStatus,
                nextRunDate: normalizedStatus === 'Active'
                    ? ensureFutureSubscriptionRunDate(item.nextRunDate, item.frequency)
                    : item.nextRunDate
            });
            notify(`Status updated to ${newStatus}`, "success");
            return;
        }

        if (action === 'toggle_status') {
            const currentStatus = normalizeSubscriptionStatus(item.status);

            if (currentStatus === 'Cancelled' || currentStatus === 'Expired') {
                notify("Change the subscription status from the status menu before reactivating this record.", "error");
                return;
            }

            const newStatus = currentStatus === 'Active' ? 'Paused' : 'Active';
            await finance.updateRecurringInvoice({
                ...item,
                status: newStatus,
                nextRunDate: newStatus === 'Active'
                    ? ensureFutureSubscriptionRunDate(item.nextRunDate, item.frequency)
                    : item.nextRunDate
            });
            notify(`Subscription ${currentStatus === 'Active' ? 'paused' : (currentStatus === 'Draft' ? 'activated' : 'resumed')} successfully`, "success");
            return;
        }

        if (action === 'duplicate_exact') {
            const duplicatedDraft = buildRecurringDraftFromTemplate(item);
            setEditingItem(duplicatedDraft);
            setIsFormOpen(true);
            notify("Subscription copied into a new draft. Review before saving.", "success");
            return;
        }

        if (action === 'preview_pdf') {
            handlePreview('SUBSCRIPTION', item);
            return;
        }

        if (action === 'print_doc') {
            handlePrint('SUBSCRIPTION', item);
            return;
        }

        if (action === 'download_pdf') {
            try {
                notify("Preparing PDF document...", "info");
                const enrichedItem = enrichDocumentCustomerData(item, customers);
                const pdfData = mapToInvoiceData(enrichedItem, companyConfig, 'SUBSCRIPTION');
                await initializePrimePdfFonts();
                const securedPdfData = await attachDocumentSecurity(pdfData, companyConfig?.companyName);
                const blob = await pdf(<PrimeDocument type="SUBSCRIPTION" data={securedPdfData as PrimeDocData} />).toBlob();
                const docNumber = item.invoiceNumber || item.id || '';
                const fileName = docNumber ? `Recurring Invoice - ${docNumber}.pdf` : `Recurring Invoice.pdf`;
                downloadBlob(blob, fileName);
                notify("PDF downloaded successfully", "success");
                return;
            } catch (error) {
                notify("Failed to generate PDF", "error");
                return;
            }
        }
    }, [finance, companyConfig, notify, handlePreview, handlePrint]);

    return (
        <div className="p-4 md:p-6 max-w-[1600px] mx-auto h-[calc(100vh-4rem)] flex flex-col relative w-full text-sm font-normal">
            {isFormOpen && (
                <div className="absolute inset-0 z-50 bg-slate-50 overflow-y-auto custom-scrollbar p-4 md:p-6">
                    <OrderForm type="Recurring" initialData={editingItem} onSave={handleSave} onCancel={() => { setIsFormOpen(false); setEditingItem(null); }} saving={isSaving} />
                </div>
            )}

            <div className="flex flex-col md:flex-row justify-between items-center mb-4 gap-4 shrink-0">
                <div>
                    <h1 className="text-[22px] font-semibold text-slate-900 flex items-center gap-2 tracking-tight">
                        <Repeat className="text-blue-600" size={20} /> Subscriptions
                    </h1>
                    <p className="text-xs font-normal text-slate-500 mt-0.5">
                        Manage recurring billing, subscriptions, and automated renewals
                    </p>
                </div>

                <div className="flex items-center gap-2">
                    <div className="relative">
                        <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input
                            type="text"
                            placeholder="Search subscriptions..."
                            value={searchText}
                            onChange={e => setSearchTerm(e.target.value)}
                            className="pl-8 pr-3 py-1.5 rounded-xl border border-slate-200 bg-white text-[11px] w-48 focus:ring-4 focus:ring-blue-500/5 outline-none"
                        />
                    </div>
                    <button
                        onClick={() => finance.fetchFinanceData().catch(() => {})}
                        className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-[10px] font-bold uppercase tracking-tight text-slate-600 shadow-sm transition-all hover:bg-slate-50"
                    >
                        <RefreshCw size={14} /> Refresh
                    </button>
                    <button
                        onClick={handleCreate}
                        className="bg-blue-600 text-white px-3 py-1.5 rounded-xl font-bold text-[10px] uppercase tracking-tight flex items-center gap-2 hover:bg-blue-700 shadow-sm transition-all"
                    >
                        <Plus size={14} /> New Subscription
                    </button>
                </div>
            </div>

            {/* Money Bar (QBO Style) */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6 shrink-0">
                <div
                    onClick={() => setSelectedMetric(selectedMetric === 'Active' ? 'All' : 'Active')}
                    className={`cursor-pointer transition-all duration-200 bg-white p-3 md:p-4 rounded-xl shadow-sm border border-slate-100 flex items-center gap-4 border-l-4 border-l-emerald-500 ${selectedMetric === 'Active' ? 'ring-2 ring-emerald-500 shadow-md scale-[1.01]' : 'hover:bg-slate-50'}`}
                >
                    <div className="p-2.5 bg-emerald-50 text-emerald-600 rounded-lg">
                        <CheckCircle size={20} />
                    </div>
                    <div>
                        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-tight leading-none mb-1.5">Active Subscriptions</p>
                        <p className="text-lg md:text-xl font-semibold text-slate-900 finance-nums">{stats.activeCount}</p>
                    </div>
                </div>

                <div
                    onClick={() => setSelectedMetric(selectedMetric === 'MRR' ? 'All' : 'MRR')}
                    className={`cursor-pointer transition-all duration-200 bg-white p-3 md:p-4 rounded-xl shadow-sm border border-slate-100 flex items-center gap-4 border-l-4 border-l-blue-500 ${selectedMetric === 'MRR' ? 'ring-2 ring-blue-500 shadow-md scale-[1.01]' : 'hover:bg-slate-50'}`}
                >
                    <div className="p-2.5 bg-blue-50 text-blue-600 rounded-lg">
                        <TrendingUp size={20} />
                    </div>
                    <div>
                        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-tight leading-none mb-1.5">Monthly Recurring Revenue</p>
                        <p className="text-lg md:text-xl font-semibold text-slate-900 finance-nums">{currency}{stats.mrr.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                    </div>
                </div>

                <div
                    onClick={() => setSelectedMetric(selectedMetric === 'ARR' ? 'All' : 'ARR')}
                    className={`cursor-pointer transition-all duration-200 bg-white p-3 md:p-4 rounded-xl shadow-sm border border-slate-100 flex items-center gap-4 border-l-4 border-l-indigo-500 ${selectedMetric === 'ARR' ? 'ring-2 ring-indigo-500 shadow-md scale-[1.01]' : 'hover:bg-slate-50'}`}
                >
                    <div className="p-2.5 bg-indigo-50 text-indigo-600 rounded-lg">
                        <BarChart3 size={20} />
                    </div>
                    <div>
                        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-tight leading-none mb-1.5">ARR Projection</p>
                        <p className="text-lg md:text-xl font-semibold text-slate-900 finance-nums">{currency}{stats.arr.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                    </div>
                </div>

                <div
                    onClick={() => setSelectedMetric(selectedMetric === 'NextRun' ? 'All' : 'NextRun')}
                    className={`cursor-pointer transition-all duration-200 bg-white p-3 md:p-4 rounded-xl shadow-sm border border-slate-100 flex items-center gap-4 border-l-4 border-l-amber-500 ${selectedMetric === 'NextRun' ? 'ring-2 ring-amber-500 shadow-md scale-[1.01]' : 'hover:bg-slate-50'}`}
                >
                    <div className="p-2.5 bg-amber-50 text-amber-600 rounded-lg">
                        <Calendar size={20} />
                    </div>
                    <div>
                        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-tight leading-none mb-1.5">Next Run Value</p>
                        <p className="text-lg md:text-xl font-semibold text-slate-900 finance-nums">{currency}{(stats.upcomingTotal || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                    </div>
                </div>
            </div>

            <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
                <SubscriptionView
                    data={filteredData}
                    onEdit={handleEdit}
                    onView={handleView}
                    onDelete={handleDelete}
                    onAction={handleAction}
                />
            </div>
            <ConfirmDialog
                open={confirmState.open}
                onOpenChange={(open) => !open && setConfirmState(c => ({ ...c, open: false }))}
                onConfirm={() => {
                    confirmState.onConfirm?.();
                    setConfirmState(c => ({ ...c, open: false }));
                }}
                onCancel={() => setConfirmState(c => ({ ...c, open: false }))}
                title={confirmState.title}
                message={confirmState.message}
                confirmText={confirmState.confirmText}
                type={confirmState.type || 'danger'}
            />
        </div>
    );
};

export default SubscriptionsView;
