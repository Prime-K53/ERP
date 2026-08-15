import React, { useMemo, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useSales } from '../../context/SalesContext';
import { useFinance } from '../../context/FinanceContext';
import { useInventory } from '../../context/InventoryContext';
import { format, parseISO, startOfWeek, startOfMonth, isWithinInterval } from 'date-fns';
import {
    ShieldCheck, AlertTriangle, CheckCircle, XCircle, RefreshCw,
    DollarSign, Wallet, Building2, Package, TrendingUp, TrendingDown,
    ChevronDown, ChevronUp, Landmark, LayoutGrid, FileText, Printer
} from 'lucide-react';
import { currencyService } from '../../services/currencyService';

type DateRange = 'today' | 'week' | 'month' | 'quarter' | 'year' | 'all';

interface ReconciliationItem {
    name: string;
    expected: number;
    actual: number;
    variance: number;
    status: 'balanced' | 'warning' | 'error';
}

const InternalAuditor: React.FC = () => {
    const { companyConfig } = useAuth();
    const { sales = [], customerPayments = [] } = useSales();
    const { invoices = [], expenses = [], ledger = [], accounts = [] } = useFinance();
    const { inventory = [], purchases = [] } = useInventory();
    const currency = companyConfig?.currencySymbol || currencyService.getCurrency(currencyService.getBaseCurrency())?.symbol || '$';
    const gl = companyConfig?.glMapping || {};
    const [dateRange, setDateRange] = useState<DateRange>('month');
    const [expandedSection, setExpandedSection] = useState<string | null>('sales');

    const formatCurrency = (val: number) => {
        if (val === undefined || val === null || isNaN(val)) return `${currency}0.00`;
        return `${currency}${val.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    };

    const filterByDateRange = (dateStr: string): boolean => {
        if (dateRange === 'all') return true;
        const date = parseISO(dateStr);
        const now = new Date();

        switch (dateRange) {
            case 'today':
                return date.toDateString() === now.toDateString();
            case 'week':
                return isWithinInterval(date, { start: startOfWeek(now, { weekStartsOn: 1 }), end: now });
            case 'month':
                return isWithinInterval(date, { start: startOfMonth(now), end: now });
            case 'quarter': {
                const quarterStart = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1);
                return isWithinInterval(date, { start: quarterStart, end: now });
            }
            case 'year':
                return date.getFullYear() === now.getFullYear();
            default:
                return true;
        }
    };

    const auditData = useMemo(() => {
        const filteredSales = sales.filter((s: any) => filterByDateRange(s.date));
        const filteredInvoices = invoices.filter((i: any) => {
            const status = String(i?.status || '').toLowerCase();
            if (status === 'cancelled' || status === 'draft') return false;
            return filterByDateRange(i.date);
        });
        const filteredPayments = customerPayments.filter((p: any) => filterByDateRange(p.date));
        const filteredExpenses = expenses.filter((e: any) => filterByDateRange(e.date));

        // 1. Sales Reconciliation — includes POS sales + invoices (excluding POS-mirror)
        const recognizedSaleIds = new Set<string>(
            filteredSales.map((s: any) => String(s?.id || '').trim()).filter(Boolean)
        );
        const isPosMirrorInv = (inv: any) => {
            const origin = String(inv?.originModule || inv?.origin_module || '').toLowerCase();
            const convType = String(inv?.conversionDetails?.sourceType || '').toLowerCase();
            const note = String(inv?.notes || '').toLowerCase();
            return origin === 'pos' || convType === 'sale' ||
                note.includes('pos sale') || note.includes('source: pos') ||
                (!!String(inv?.reference || '') && recognizedSaleIds.has(String(inv?.reference || '')));
        };
        const posSalesTotal = filteredSales.reduce((sum: number, s: any) => sum + (s.totalAmount || s.total || 0), 0);
        const invoiceSalesTotal = filteredInvoices
            .filter((i: any) => !isPosMirrorInv(i))
            .reduce((sum: number, i: any) => sum + (i.totalAmount || 0), 0);
        const totalSalesAmount = posSalesTotal + invoiceSalesTotal;
        const salesAccountId = gl.defaultSalesAccount || '4000';
        const ledgerSalesAmount = ledger
            .filter((e: any) => filterByDateRange(e.date) && (e.creditAccountId === salesAccountId || e.creditAccountId === '4000'))
            .reduce((sum: number, e: any) => sum + (e.amount || 0), 0);
        const salesVariance = totalSalesAmount - ledgerSalesAmount;

        // 2. Cash Reconciliation
        // Payments collected vs ledger cash account balance
        const totalPaymentsCollected = filteredPayments.reduce((sum: number, p: any) => sum + (p.amount || 0), 0);
        const cashAccountId = gl.cashDrawerAccount || gl.defaultCashAccount || '1000';
        const ledgerCashChange = ledger
            .filter((e: any) => filterByDateRange(e.date))
            .reduce((sum: number, e: any) => {
                if (e.debitAccountId === cashAccountId || e.debitAccountId === '1000') return sum + (e.amount || 0);
                if (e.creditAccountId === cashAccountId || e.creditAccountId === '1000') return sum - (e.amount || 0);
                return sum;
            }, 0);
        const cashVariance = totalPaymentsCollected - ledgerCashChange;

        // 3. Inventory Reconciliation
        // Physical stock value vs ledger inventory account
        const physicalInventoryValue = inventory.reduce((sum: number, item: any) => sum + ((item.stock || 0) * (item.cost || 0)), 0);
        const inventoryAccountId = gl.defaultInventoryAccount || '1200';
        const ledgerInventoryValue = ledger
            .filter((e: any) => e.debitAccountId === inventoryAccountId || e.debitAccountId === '1200' ||
                             e.creditAccountId === inventoryAccountId || e.creditAccountId === '1200')
            .reduce((sum: number, e: any) => {
                if (e.debitAccountId === inventoryAccountId || e.debitAccountId === '1200') return sum + (e.amount || 0);
                if (e.creditAccountId === inventoryAccountId || e.creditAccountId === '1200') return sum - (e.amount || 0);
                return sum;
            }, 0);
        const inventoryVariance = physicalInventoryValue - ledgerInventoryValue;

        // 4. AR Reconciliation
        // Outstanding invoices vs ledger AR balance
        const outstandingAR = invoices
            .filter((i: any) => i.status !== 'Paid' && i.status !== 'Cancelled')
            .reduce((sum: number, i: any) => sum + ((i.totalAmount || 0) - (i.paidAmount || 0)), 0);
        const arAccountId = gl.accountsReceivable || '1100';
        const ledgerARBalance = ledger
            .reduce((sum: number, e: any) => {
                if (e.debitAccountId === arAccountId || e.debitAccountId === '1100') return sum + (e.amount || 0);
                if (e.creditAccountId === arAccountId || e.creditAccountId === '1100') return sum - (e.amount || 0);
                return sum;
            }, 0);
        const arVariance = outstandingAR - ledgerARBalance;

        // 5. AP Reconciliation
        // Outstanding purchases vs ledger AP balance
        const outstandingAP = purchases
            .filter((p: any) => p.paymentStatus !== 'Paid' && p.status !== 'Cancelled')
            .reduce((sum: number, p: any) => sum + ((p.total || p.totalAmount || 0) - (p.paidAmount || 0)), 0);
        const apAccountId = gl.accountsPayable || '2000';
        const ledgerAPBalance = ledger
            .reduce((sum: number, e: any) => {
                if (e.creditAccountId === apAccountId || e.creditAccountId === '2000') return sum + (e.amount || 0);
                if (e.debitAccountId === apAccountId || e.debitAccountId === '2000') return sum - (e.amount || 0);
                return sum;
            }, 0);
        const apVariance = outstandingAP - ledgerAPBalance;

        // Valuation by Category
        const categoryValuation: Record<string, number> = {};
        inventory.forEach((item: any) => {
            const cat = item.category || 'Uncategorized';
            categoryValuation[cat] = (categoryValuation[cat] || 0) + ((item.stock || 0) * (item.cost || 0));
        });

        // Valuation by Warehouse
        const warehouseValuation: Record<string, number> = {};
        inventory.forEach((item: any) => {
            if (item.locationStock && item.locationStock.length > 0) {
                item.locationStock.forEach((loc: any) => {
                    warehouseValuation[loc.warehouseId] = (warehouseValuation[loc.warehouseId] || 0) + (loc.quantity * (item.cost || 0));
                });
            } else {
                warehouseValuation['WH-MAIN'] = (warehouseValuation['WH-MAIN'] || 0) + ((item.stock || 0) * (item.cost || 0));
            }
        });

        // Build reconciliation items
        const reconciliationItems: ReconciliationItem[] = [
            {
                name: 'Sales',
                expected: totalSalesAmount,
                actual: ledgerSalesAmount,
                variance: salesVariance,
                status: Math.abs(salesVariance) < 0.01 ? 'balanced' : Math.abs(salesVariance) < 100 ? 'warning' : 'error'
            },
            {
                name: 'Cash & Payments',
                expected: totalPaymentsCollected,
                actual: ledgerCashChange,
                variance: cashVariance,
                status: Math.abs(cashVariance) < 0.01 ? 'balanced' : Math.abs(cashVariance) < 100 ? 'warning' : 'error'
            },
            {
                name: 'Inventory',
                expected: physicalInventoryValue,
                actual: ledgerInventoryValue,
                variance: inventoryVariance,
                status: Math.abs(inventoryVariance) < 0.01 ? 'balanced' : Math.abs(inventoryVariance) < 1000 ? 'warning' : 'error'
            },
            {
                name: 'Accounts Receivable',
                expected: outstandingAR,
                actual: ledgerARBalance,
                variance: arVariance,
                status: Math.abs(arVariance) < 0.01 ? 'balanced' : Math.abs(arVariance) < 100 ? 'warning' : 'error'
            },
            {
                name: 'Accounts Payable',
                expected: outstandingAP,
                actual: ledgerAPBalance,
                variance: apVariance,
                status: Math.abs(apVariance) < 0.01 ? 'balanced' : Math.abs(apVariance) < 100 ? 'warning' : 'error'
            }
        ];

        return {
            reconciliationItems,
            physicalInventoryValue,
            ledgerInventoryValue,
            inventoryVariance,
            categoryValuation,
            warehouseValuation,
            totalSalesAmount,
            totalPaymentsCollected,
            outstandingAR,
            outstandingAP
        };
    }, [sales, invoices, customerPayments, expenses, inventory, purchases, ledger, dateRange, gl]);

    const getStatusIcon = (status: string) => {
        switch (status) {
            case 'balanced': return <CheckCircle size={18} className="text-emerald-500" />;
            case 'warning': return <AlertTriangle size={18} className="text-amber-500" />;
            case 'error': return <XCircle size={18} className="text-rose-500" />;
            default: return <AlertTriangle size={18} className="text-slate-400" />;
        }
    };

    const getStatusBadge = (status: string) => {
        switch (status) {
            case 'balanced': return 'bg-emerald-50 text-emerald-600';
            case 'warning': return 'bg-amber-50 text-amber-600';
            case 'error': return 'bg-rose-50 text-rose-600';
            default: return 'bg-slate-50 text-slate-500';
        }
    };

    const errorCount = auditData.reconciliationItems.filter(r => r.status === 'error').length;
    const warningCount = auditData.reconciliationItems.filter(r => r.status === 'warning').length;

    return (
        <div className="space-y-6 animate-fadeIn">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-xl font-bold text-slate-800 tracking-tight">Internal Auditor</h2>
                    <p className="text-sm text-slate-500 mt-1">Reconciliation and discrepancy detection</p>
                </div>
                <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1 bg-white p-1 rounded-xl border border-slate-200 shadow-sm">
                        {(['today', 'week', 'month', 'quarter', 'year', 'all'] as const).map(range => (
                            <button
                                key={range}
                                onClick={() => setDateRange(range)}
                                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${dateRange === range
                                    ? 'bg-blue-600 text-white shadow-sm'
                                    : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'
                                }`}
                            >
                                {range.charAt(0).toUpperCase() + range.slice(1)}
                            </button>
                        ))}
                    </div>
                    <button
                        onClick={() => window.print()}
                        className="p-2 bg-white border border-slate-200 rounded-xl text-slate-400 hover:text-blue-600 hover:border-blue-200 transition-all shadow-sm"
                    >
                        <Printer size={18} />
                    </button>
                </div>
            </div>

            {/* Audit Status Banner */}
            <div className={`p-4 rounded-2xl flex items-center gap-4 ${
                errorCount > 0 ? 'bg-rose-50 border border-rose-200' :
                warningCount > 0 ? 'bg-amber-50 border border-amber-200' :
                'bg-emerald-50 border border-emerald-200'
            }`}>
                <div className={`p-3 rounded-xl ${
                    errorCount > 0 ? 'bg-rose-100' :
                    warningCount > 0 ? 'bg-amber-100' :
                    'bg-emerald-100'
                }`}>
                    <ShieldCheck size={24} className={
                        errorCount > 0 ? 'text-rose-600' :
                        warningCount > 0 ? 'text-amber-600' :
                        'text-emerald-600'
                    } />
                </div>
                <div className="flex-1">
                    <h3 className={`font-bold ${
                        errorCount > 0 ? 'text-rose-700' :
                        warningCount > 0 ? 'text-amber-700' :
                        'text-emerald-700'
                    }`}>
                        {errorCount > 0 ? `${errorCount} Critical Discrepancy${errorCount > 1 ? 's' : ''} Found` :
                         warningCount > 0 ? `${warningCount} Warning${warningCount > 1 ? 's' : ''} Found` :
                         'All Accounts Reconciled'}
                    </h3>
                    <p className={`text-sm ${
                        errorCount > 0 ? 'text-rose-600' :
                        warningCount > 0 ? 'text-amber-600' :
                        'text-emerald-600'
                    }`}>
                        {errorCount > 0 ? 'Immediate attention required for accounting discrepancies' :
                         warningCount > 0 ? 'Minor variances detected - review recommended' :
                         'All reconciliation checks passed successfully'}
                    </p>
                </div>
            </div>

            {/* Reconciliation Summary */}
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                <h3 className="font-bold text-slate-800 text-sm tracking-tight mb-4 flex items-center gap-2">
                    <RefreshCw size={18} className="text-blue-500" />
                    Account Reconciliation
                </h3>
                <div className="space-y-3">
                    {auditData.reconciliationItems.map((item) => (
                        <div 
                            key={item.name} 
                            className={`p-4 rounded-xl border ${item.status === 'error' ? 'border-rose-200 bg-rose-50/50' : 'border-slate-100 bg-slate-50'}`}
                        >
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    {getStatusIcon(item.status)}
                                    <div>
                                        <p className="font-semibold text-slate-700">{item.name}</p>
                                        <p className="text-xs text-slate-500">
                                            Expected: {formatCurrency(item.expected)} | Ledger: {formatCurrency(item.actual)}
                                        </p>
                                    </div>
                                </div>
                                <div className="text-right">
                                    <p className={`text-sm font-bold tabular-nums ${
                                        item.variance === 0 ? 'text-slate-900' :
                                        item.variance > 0 ? 'text-rose-600' : 'text-emerald-600'
                                    }`}>
                                        {item.variance >= 0 ? '+' : ''}{formatCurrency(item.variance)}
                                    </p>
                                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${getStatusBadge(item.status)}`}>
                                        {item.status}
                                    </span>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Inventory Valuation Details */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                    <button
                        onClick={() => setExpandedSection(expandedSection === 'category' ? null : 'category')}
                        className="w-full flex items-center justify-between"
                    >
                        <h3 className="font-bold text-slate-800 text-sm tracking-tight flex items-center gap-2">
                            <LayoutGrid size={18} className="text-blue-500" />
                            Inventory by Category
                        </h3>
                        {expandedSection === 'category' ? <ChevronUp size={18} className="text-slate-400" /> : <ChevronDown size={18} className="text-slate-400" />}
                    </button>
                    {expandedSection === 'category' && (
                        <div className="mt-4 space-y-2">
                            {Object.entries(auditData.categoryValuation)
                                .sort((a, b) => b[1] - a[1])
                                .map(([cat, val]) => (
                                    <div key={cat} className="flex justify-between items-center py-3 px-3 bg-slate-50 rounded-xl">
                                        <span className="text-sm font-medium text-slate-600">{cat}</span>
                                        <span className="text-sm font-bold text-slate-900 tabular-nums">{formatCurrency(val)}</span>
                                    </div>
                                ))}
                        </div>
                    )}
                </div>

                <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                    <button
                        onClick={() => setExpandedSection(expandedSection === 'warehouse' ? null : 'warehouse')}
                        className="w-full flex items-center justify-between"
                    >
                        <h3 className="font-bold text-slate-800 text-sm tracking-tight flex items-center gap-2">
                            <Landmark size={18} className="text-emerald-500" />
                            Inventory by Warehouse
                        </h3>
                        {expandedSection === 'warehouse' ? <ChevronUp size={18} className="text-slate-400" /> : <ChevronDown size={18} className="text-slate-400" />}
                    </button>
                    {expandedSection === 'warehouse' && (
                        <div className="mt-4 space-y-2">
                            {Object.entries(auditData.warehouseValuation)
                                .sort((a, b) => b[1] - a[1])
                                .map(([wh, val]) => (
                                    <div key={wh} className="flex justify-between items-center py-3 px-3 bg-slate-50 rounded-xl">
                                        <span className="text-sm font-medium text-slate-600">{wh}</span>
                                        <span className="text-sm font-bold text-slate-900 tabular-nums">{formatCurrency(val)}</span>
                                    </div>
                                ))}
                        </div>
                    )}
                </div>
            </div>

            {/* Quick Stats (QBO Style) */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="bg-white p-3 md:p-4 rounded-xl shadow-sm border border-slate-100 flex items-center gap-4 border-l-4 border-l-slate-500 hover:bg-slate-50 transition-all duration-200">
                    <div className="p-2.5 bg-slate-50 text-slate-600 rounded-lg shrink-0"><Package size={20} /></div>
                    <div className="min-w-0">
                        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-tight leading-none mb-1.5">Physical Inventory</p>
                        <p className="text-lg md:text-xl font-semibold text-slate-900">{formatCurrency(auditData.physicalInventoryValue)}</p>
                    </div>
                </div>
                <div className="bg-white p-3 md:p-4 rounded-xl shadow-sm border border-slate-100 flex items-center gap-4 border-l-4 border-l-blue-500 hover:bg-slate-50 transition-all duration-200">
                    <div className="p-2.5 bg-blue-50 text-blue-600 rounded-lg shrink-0"><FileText size={20} /></div>
                    <div className="min-w-0">
                        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-tight leading-none mb-1.5">Ledger Inventory</p>
                        <p className="text-lg md:text-xl font-semibold text-slate-900">{formatCurrency(auditData.ledgerInventoryValue)}</p>
                    </div>
                </div>
                <div className="bg-white p-3 md:p-4 rounded-xl shadow-sm border border-slate-100 flex items-center gap-4 border-l-4 border-l-rose-500 hover:bg-slate-50 transition-all duration-200">
                    <div className="p-2.5 bg-rose-50 text-rose-600 rounded-lg shrink-0"><DollarSign size={20} /></div>
                    <div className="min-w-0">
                        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-tight leading-none mb-1.5">Outstanding AR</p>
                        <p className="text-lg md:text-xl font-semibold text-rose-600">{formatCurrency(auditData.outstandingAR)}</p>
                    </div>
                </div>
                <div className="bg-white p-3 md:p-4 rounded-xl shadow-sm border border-slate-100 flex items-center gap-4 border-l-4 border-l-amber-500 hover:bg-slate-50 transition-all duration-200">
                    <div className="p-2.5 bg-amber-50 text-amber-600 rounded-lg shrink-0"><Wallet size={20} /></div>
                    <div className="min-w-0">
                        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-tight leading-none mb-1.5">Outstanding AP</p>
                        <p className="text-lg md:text-xl font-semibold text-amber-600">{formatCurrency(auditData.outstandingAP)}</p>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default InternalAuditor;
