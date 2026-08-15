import React, { useMemo, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useSales } from '../../context/SalesContext';
import { useFinance } from '../../context/FinanceContext';
import { useExamination } from '../../context/ExaminationContext';
import { format, parseISO, startOfWeek, startOfMonth, isWithinInterval, isSameDay } from 'date-fns';
import {
    DollarSign, CreditCard, Wallet, Banknote, Smartphone, ArrowDownUp,
    TrendingUp, ChevronDown, ChevronUp, Clock,
    Calendar, Printer, BarChart3, Users,
    Receipt, XCircle, CheckCircle, RefreshCw
} from 'lucide-react';
import { currencyService } from '../../services/currencyService';
import { Sale, CustomerPayment } from '../../types';

const teal = { 50: '#eef7f6', 100: '#d3ece9', 200: '#a6d9d3', 500: '#1f8577', 600: '#146b60', 700: '#0f544c', 800: '#0b3e39', 900: '#082e2a' };
const amber = { 100: '#fbead0', 300: '#eec27a', 500: '#d99a3f' };
const paper = '#FEFDFB';
const ink = '#23282A';
const inkSoft = '#5c6567';
const hairline = '#e4ddd1';
const danger = '#b5493f';

type DateRangeFilter = 'today' | 'week' | 'month' | 'quarter' | 'year' | 'all';

interface SalesAuditData {
    totalSales: number;
    totalTransactions: number;
    byPaymentMethod: Record<string, { count: number; amount: number }>;
    byStatus: Record<string, { count: number; amount: number }>;
    byCashier: Record<string, { count: number; amount: number }>;
    dailyBreakdown: { date: string; sales: number; count: number; byMethod: Record<string, number> }[];
    voidedAmount: number;
    refundedAmount: number;
    averageTransaction: number;
    topTransactions: Sale[];
    recentPayments: CustomerPayment[];
}

const s: Record<string, React.CSSProperties> = {
    card: { background: paper, borderRadius: 14, border: `1.4px solid ${hairline}`, boxShadow: '0 1px 3px rgba(0,0,0,.04)' },
    cardPad: { background: paper, borderRadius: 14, border: `1.4px solid ${hairline}`, boxShadow: '0 1px 3px rgba(0,0,0,.04)', padding: 24 },
    kpi: { padding: '12px 16px', borderRadius: 12, boxShadow: '0 1px 3px rgba(0,0,0,.04)', border: `1.4px solid ${hairline}`, display: 'flex', alignItems: 'center', gap: 16, cursor: 'pointer', transition: 'all .2s' },
    th: { padding: '12px 16px', fontSize: 10, fontWeight: 700, color: inkSoft, textTransform: 'uppercase', letterSpacing: 0.06, textAlign: 'left' as const },
    thRight: { padding: '12px 16px', fontSize: 10, fontWeight: 700, color: inkSoft, textTransform: 'uppercase', letterSpacing: 0.06, textAlign: 'right' as const },
    td: { padding: '10px 16px', fontSize: 13, color: ink, borderBottom: `1.4px solid ${teal[50]}` },
    tdRight: { padding: '10px 16px', fontSize: 13, borderBottom: `1.4px solid ${teal[50]}`, textAlign: 'right' as const },
};

const SalesAudit: React.FC = () => {
    const { companyConfig, allUsers = [] } = useAuth();
    const { sales = [], customerPayments = [] } = useSales();
    const { invoices = [] } = useFinance();
    const { batches: examinationBatches = [] } = useExamination();
    const currency = companyConfig?.currencySymbol || currencyService.getCurrency(currencyService.getBaseCurrency())?.symbol || '$';
    const [dateRange, setDateRange] = useState<DateRangeFilter>('all');
    const [expandedSection, setExpandedSection] = useState<string | null>('daily');

    const formatCurrency = (val: number) => {
        if (val === undefined || val === null || isNaN(val)) return `${currency}0.00`;
        return `${currency}${val.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    };

    const filterByDateRange = (dateStr: string): boolean => {
        if (dateRange === 'all') return true;
        if (!dateStr) return false;
        const date = parseISO(dateStr);
        if (isNaN(date.getTime())) return false;
        const now = new Date();
        switch (dateRange) {
            case 'today': return isSameDay(date, now);
            case 'week': { const ws = startOfWeek(now, { weekStartsOn: 1 }); return isWithinInterval(date, { start: ws, end: now }); }
            case 'month': return isWithinInterval(date, { start: startOfMonth(now), end: now });
            case 'quarter': { const qs = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1); return isWithinInterval(date, { start: qs, end: now }); }
            case 'year': return date.getFullYear() === now.getFullYear();
            default: return true;
        }
    };

    const auditData: SalesAuditData = useMemo(() => {
        const filteredSales = (sales || []).filter(s => filterByDateRange(s.date));
        const filteredPayments = (customerPayments || []).filter(p => filterByDateRange(p.date));
        const filteredInvoices = (invoices || []).filter((inv: any) => {
            const status = String(inv?.status || '').toLowerCase();
            if (status === 'cancelled' || status === 'draft') return false;
            return filterByDateRange(inv.date);
        });
        const recognizedSaleIds = new Set<string>(filteredSales.map((s: any) => String(s?.id || '').trim()).filter(Boolean));
        const isPosMirrorInv = (inv: any) => { const origin = String(inv?.originModule || inv?.origin_module || '').toLowerCase(); const convType = String(inv?.conversionDetails?.sourceType || '').toLowerCase(); const note = String(inv?.notes || '').toLowerCase(); return origin === 'pos' || convType === 'sale' || note.includes('pos sale') || note.includes('source: pos') || (!!String(inv?.reference || '') && recognizedSaleIds.has(String(inv?.reference || ''))); };
        const isExamInv = (inv: any) => { const origin = String(inv?.originModule || inv?.origin_module || '').toLowerCase(); const batchId = String(inv?.batchId || inv?.linkedBatchId || inv?.originBatchId || inv?.origin_batch_id || '').trim(); const ref = String(inv?.reference || '').toUpperCase(); return origin === 'examination' || batchId.length > 0 || ref.startsWith('EXM-BATCH-'); };
        const pureInvoices = filteredInvoices.filter((inv: any) => !isPosMirrorInv(inv) && !isExamInv(inv));
        const examInvoices = filteredInvoices.filter((inv: any) => isExamInv(inv));
        const posSalesTotal = filteredSales.reduce((sum, s) => sum + (s.totalAmount || s.total || 0), 0);
        const invoiceRevenue = pureInvoices.reduce((sum: number, inv: any) => sum + (inv.totalAmount || 0), 0);
        const examRevenue = examInvoices.reduce((sum: number, inv: any) => sum + (inv.totalAmount || 0), 0);
        const totalSales = posSalesTotal + invoiceRevenue + examRevenue;
        const totalTransactions = filteredSales.length + pureInvoices.length + examInvoices.length;
        const byPaymentMethod: Record<string, { count: number; amount: number }> = {};
        filteredSales.forEach(sale => {
            const total = sale.totalAmount || sale.total || 0;
            if (sale.paymentMethod === 'Split' && sale.payments && sale.payments.length > 0) { sale.payments.forEach(p => { const m = p.method || 'Cash'; if (!byPaymentMethod[m]) byPaymentMethod[m] = { count: 0, amount: 0 }; byPaymentMethod[m].count++; byPaymentMethod[m].amount += p.amount || 0; }); return; }
            const method = sale.paymentMethod || 'Cash';
            if (!byPaymentMethod[method]) byPaymentMethod[method] = { count: 0, amount: 0 };
            byPaymentMethod[method].count++; byPaymentMethod[method].amount += total;
        });
        [...pureInvoices, ...examInvoices].forEach((inv: any) => { const method = inv.paymentMethod || 'Invoice'; if (!byPaymentMethod[method]) byPaymentMethod[method] = { count: 0, amount: 0 }; byPaymentMethod[method].count++; byPaymentMethod[method].amount += (inv.totalAmount || 0); });
        const byStatus: Record<string, { count: number; amount: number }> = {};
        [...filteredSales, ...pureInvoices, ...examInvoices].forEach((rec: any) => { const status = rec.status || 'Unknown'; if (!byStatus[status]) byStatus[status] = { count: 0, amount: 0 }; byStatus[status].count++; byStatus[status].amount += (rec.totalAmount || rec.total || 0); });
        const byCashier: Record<string, { count: number; amount: number }> = {};
        filteredSales.forEach(sale => { const c = sale.cashierId || 'Unknown'; if (!byCashier[c]) byCashier[c] = { count: 0, amount: 0 }; byCashier[c].count++; byCashier[c].amount += (sale.totalAmount || sale.total || 0); });
        [...pureInvoices, ...examInvoices].forEach((inv: any) => { const c = inv.createdBy || 'System'; if (!byCashier[c]) byCashier[c] = { count: 0, amount: 0 }; byCashier[c].count++; byCashier[c].amount += (inv.totalAmount || 0); });
        const dailyMap = new Map<string, { sales: number; count: number; byMethod: Record<string, number> }>();
        filteredSales.forEach(sale => { const dk = sale.date.split('T')[0]; const ex = dailyMap.get(dk) || { sales: 0, count: 0, byMethod: {} }; const t = sale.totalAmount || sale.total || 0; ex.sales += t; ex.count++; if (sale.paymentMethod === 'Split' && sale.payments && sale.payments.length > 0) { sale.payments.forEach(p => { const m = p.method || 'Cash'; ex.byMethod[m] = (ex.byMethod[m] || 0) + (p.amount || 0); }); } else { const m = sale.paymentMethod || 'Cash'; ex.byMethod[m] = (ex.byMethod[m] || 0) + t; } dailyMap.set(dk, ex); });
        [...pureInvoices, ...examInvoices].forEach((inv: any) => { const dk = String(inv.date || '').split('T')[0]; if (!dk) return; const ex = dailyMap.get(dk) || { sales: 0, count: 0, byMethod: {} }; const t = inv.totalAmount || 0; ex.sales += t; ex.count++; const m = inv.paymentMethod || 'Invoice'; ex.byMethod[m] = (ex.byMethod[m] || 0) + t; dailyMap.set(dk, ex); });
        const dailyBreakdown = Array.from(dailyMap.entries()).map(([date, data]) => ({ date, ...data })).sort((a, b) => b.date.localeCompare(a.date));
        const voidedAmount = filteredSales.filter(s => s.status === 'Cancelled' || s.status === 'Refunded').reduce((sum, s) => sum + (s.totalAmount || s.total || 0), 0);
        const refundedAmount = filteredSales.filter(s => s.status === 'Refunded').reduce((sum, s) => sum + (s.totalAmount || s.total || 0), 0);
        const averageTransaction = totalTransactions > 0 ? totalSales / totalTransactions : 0;
        const allTransactions = [...filteredSales, ...pureInvoices.map((inv: any) => ({ ...inv, total: inv.totalAmount || 0 })), ...examInvoices.map((inv: any) => ({ ...inv, total: inv.totalAmount || 0 }))];
        const topTransactions = [...allTransactions].sort((a, b) => (b.totalAmount || b.total || 0) - (a.totalAmount || a.total || 0)).slice(0, 10);
        const recentPayments = [...filteredPayments].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).slice(0, 10);
        return { totalSales, totalTransactions, byPaymentMethod, byStatus, byCashier, dailyBreakdown, voidedAmount, refundedAmount, averageTransaction, topTransactions, recentPayments };
    }, [sales, invoices, examinationBatches, customerPayments, dateRange]);

    const getPaymentMethodIcon = (method: string) => {
        const c = inkSoft;
        switch (method) {
            case 'Cash': return <Banknote size={18} style={{ color: teal[500] }} />;
            case 'Card': return <CreditCard size={18} style={{ color: teal[500] }} />;
            case 'Mobile Money': return <Smartphone size={18} style={{ color: amber[500] }} />;
            case 'Wallet': return <Wallet size={18} style={{ color: amber[500] }} />;
            case 'Split': return <ArrowDownUp size={18} style={{ color: inkSoft }} />;
            default: return <DollarSign size={18} style={{ color: c }} />;
        }
    };

    const getStatusIcon = (status: string) => {
        switch (status) {
            case 'Paid': return <CheckCircle size={16} style={{ color: teal[500] }} />;
            case 'Partial': return <Clock size={16} style={{ color: amber[500] }} />;
            case 'Cancelled': return <XCircle size={16} style={{ color: danger }} />;
            case 'Refunded': return <RefreshCw size={16} style={{ color: danger }} />;
            default: return <Clock size={16} style={{ color: inkSoft }} />;
        }
    };

    const getCashierName = (cashierId: string) => { const u = allUsers.find(u => u.id === cashierId); return u?.fullName || u?.name || cashierId; };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24, padding: 24, fontFamily: "'Inter',sans-serif", fontSize: 13, color: ink }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
                <div>
                    <h2 style={{ fontSize: 22, fontWeight: 700, color: ink, margin: 0, letterSpacing: -0.02 }}>Sales Audit Report</h2>
                    <p style={{ fontSize: 13, color: inkSoft, fontWeight: 500, margin: '4px 0 0' }}>Reconciliation and transaction analysis</p>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ display: 'flex', gap: 2, background: paper, padding: 3, borderRadius: 12, border: `1.4px solid ${hairline}`, boxShadow: '0 1px 2px rgba(0,0,0,.04)' }}>
                        {(['today', 'week', 'month', 'quarter', 'year', 'all'] as const).map(range => (
                            <button key={range} onClick={() => setDateRange(range)}
                                style={{ padding: '6px 12px', borderRadius: 9, fontSize: 12, fontWeight: 600, border: 'none', cursor: 'pointer', background: dateRange === range ? `linear-gradient(155deg, ${teal[500]}, ${teal[700]})` : 'transparent', color: dateRange === range ? '#fff' : inkSoft, boxShadow: dateRange === range ? `0 4px 10px -4px rgba(15,84,76,.4)` : 'none' }}>
                                {range.charAt(0).toUpperCase() + range.slice(1)}
                            </button>
                        ))}
                    </div>
                    <button onClick={() => window.print()}
                        style={{ padding: 8, background: paper, border: `1.4px solid ${hairline}`, borderRadius: 12, color: inkSoft, cursor: 'pointer', boxShadow: '0 1px 2px rgba(0,0,0,.04)' }}
                        onMouseEnter={e => { e.currentTarget.style.color = teal[500]; e.currentTarget.style.borderColor = teal[200]; }}
                        onMouseLeave={e => { e.currentTarget.style.color = inkSoft; e.currentTarget.style.borderColor = hairline; }}>
                        <Printer size={18} />
                    </button>
                </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
                {[
                    { label: 'Total Revenue', value: formatCurrency(auditData.totalSales), sub: `${auditData.totalTransactions} transactions`, borderColor: teal[500], icon: DollarSign, iconBg: teal[50], iconColor: teal[500] },
                    { label: 'Avg Transaction', value: formatCurrency(auditData.averageTransaction), sub: 'Per sale average', borderColor: teal[500], icon: TrendingUp, iconBg: teal[50], iconColor: teal[500] },
                    { label: 'Voided/Cancelled', value: formatCurrency(auditData.voidedAmount), sub: 'Non-collected revenue', borderColor: danger, icon: XCircle, iconBg: `${danger}15`, iconColor: danger },
                    { label: 'Payments Received', value: `${auditData.recentPayments.length}`, sub: 'Payment records', borderColor: amber[500], icon: Receipt, iconBg: amber[100], iconColor: amber[500] },
                ].map(item => (
                    <div key={item.label} style={{ ...s.kpi, borderLeft: `4px solid ${item.borderColor}` }}
                        onMouseEnter={e => e.currentTarget.style.background = teal[50]}
                        onMouseLeave={e => e.currentTarget.style.background = paper}>
                        <div style={{ padding: 10, borderRadius: 9, background: item.iconBg, color: item.iconColor, flexShrink: 0 }}>
                            <item.icon size={20} />
                        </div>
                        <div style={{ minWidth: 0 }}>
                            <p style={{ fontSize: 10, fontWeight: 700, color: inkSoft, textTransform: 'uppercase', letterSpacing: -0.01, margin: '0 0 4px' }}>{item.label}</p>
                            <p style={{ fontSize: 18, fontWeight: 600, color: ink, margin: 0 }}>{item.value}</p>
                            <p style={{ fontSize: 10, color: inkSoft, margin: '2px 0 0' }}>{item.sub}</p>
                        </div>
                    </div>
                ))}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
                <div style={s.cardPad}>
                    <h3 style={{ fontWeight: 700, color: ink, fontSize: 13, margin: '0 0 16px', display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Wallet size={18} style={{ color: teal[500] }} /> Revenue by Payment Method
                    </h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                        {Object.entries(auditData.byPaymentMethod).sort((a, b) => b[1].amount - a[1].amount).map(([method, data]) => (
                            <div key={method} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 12, background: teal[50], borderRadius: 12 }}
                                onMouseEnter={e => e.currentTarget.style.background = teal[100]}
                                onMouseLeave={e => e.currentTarget.style.background = teal[50]}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                    {getPaymentMethodIcon(method)}
                                    <div>
                                        <p style={{ fontWeight: 600, color: ink, fontSize: 13, margin: 0 }}>{method}</p>
                                        <p style={{ fontSize: 11, color: inkSoft, margin: 0 }}>{data.count} transactions</p>
                                    </div>
                                </div>
                                <div style={{ textAlign: 'right' }}>
                                    <p style={{ fontWeight: 700, color: ink, margin: 0 }}>{formatCurrency(data.amount)}</p>
                                    <p style={{ fontSize: 11, color: inkSoft, margin: 0 }}>{auditData.totalSales > 0 ? ((data.amount / auditData.totalSales) * 100).toFixed(1) : 0}%</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
                <div style={s.cardPad}>
                    <h3 style={{ fontWeight: 700, color: ink, fontSize: 13, margin: '0 0 16px', display: 'flex', alignItems: 'center', gap: 8 }}>
                        <BarChart3 size={18} style={{ color: teal[500] }} /> Transaction Status Breakdown
                    </h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                        {Object.entries(auditData.byStatus).sort((a, b) => b[1].count - a[1].count).map(([status, data]) => (
                            <div key={status} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 12, background: teal[50], borderRadius: 12 }}
                                onMouseEnter={e => e.currentTarget.style.background = teal[100]}
                                onMouseLeave={e => e.currentTarget.style.background = teal[50]}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                    {getStatusIcon(status)}
                                    <div>
                                        <p style={{ fontWeight: 600, color: ink, fontSize: 13, margin: 0 }}>{status}</p>
                                        <p style={{ fontSize: 11, color: inkSoft, margin: 0 }}>{data.count} transactions</p>
                                    </div>
                                </div>
                                <p style={{ fontWeight: 700, color: ink, margin: 0 }}>{formatCurrency(data.amount)}</p>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            <div style={s.cardPad}>
                <button onClick={() => setExpandedSection(expandedSection === 'cashier' ? null : 'cashier')}
                    style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', border: 'none', background: 'transparent', cursor: 'pointer', padding: 0 }}>
                    <h3 style={{ fontWeight: 700, color: ink, fontSize: 13, margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Users size={18} style={{ color: amber[500] }} /> Cashier Performance
                    </h3>
                    {expandedSection === 'cashier' ? <ChevronUp size={18} style={{ color: inkSoft }} /> : <ChevronDown size={18} style={{ color: inkSoft }} />}
                </button>
                {expandedSection === 'cashier' && (
                    <div style={{ marginTop: 16, overflowX: 'auto' }}>
                        <table style={{ width: '100%', textAlign: 'left', fontSize: 13, borderCollapse: 'collapse' }}>
                            <thead>
                                <tr style={{ borderBottom: `1.4px solid ${teal[100]}` }}>
                                    <th style={s.th}>Cashier</th>
                                    <th style={s.thRight}>Transactions</th>
                                    <th style={s.thRight}>Total Sales</th>
                                    <th style={s.thRight}>Avg per Transaction</th>
                                    <th style={s.thRight}>% of Total</th>
                                </tr>
                            </thead>
                            <tbody>
                                {Object.entries(auditData.byCashier).sort((a, b) => b[1].amount - a[1].amount).map(([cashierId, data]) => (
                                    <tr key={cashierId} style={{ borderBottom: `1.4px solid ${teal[50]}` }}
                                        onMouseEnter={e => e.currentTarget.style.background = teal[50]}
                                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                                        <td style={s.td}>{getCashierName(cashierId)}</td>
                                        <td style={s.tdRight}>{data.count}</td>
                                        <td style={s.tdRight}><strong>{formatCurrency(data.amount)}</strong></td>
                                        <td style={s.tdRight}>{formatCurrency(data.amount / (data.count || 1))}</td>
                                        <td style={s.tdRight}>{auditData.totalSales > 0 ? ((data.amount / auditData.totalSales) * 100).toFixed(1) : 0}%</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            <div style={s.cardPad}>
                <button onClick={() => setExpandedSection(expandedSection === 'daily' ? null : 'daily')}
                    style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', border: 'none', background: 'transparent', cursor: 'pointer', padding: 0 }}>
                    <h3 style={{ fontWeight: 700, color: ink, fontSize: 13, margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Calendar size={18} style={{ color: teal[500] }} /> Daily Reconciliation
                    </h3>
                    {expandedSection === 'daily' ? <ChevronUp size={18} style={{ color: inkSoft }} /> : <ChevronDown size={18} style={{ color: inkSoft }} />}
                </button>
                {expandedSection === 'daily' && (
                    <div style={{ marginTop: 16, overflowX: 'auto' }}>
                        <table style={{ width: '100%', textAlign: 'left', fontSize: 13, borderCollapse: 'collapse' }}>
                            <thead>
                                <tr style={{ borderBottom: `1.4px solid ${teal[100]}` }}>
                                    {['Date', 'Transactions', 'Total Sales', 'Cash', 'Card', 'Mobile', 'Other'].map(h => (
                                        <th key={h} style={h === 'Date' ? s.th : s.thRight}>{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {auditData.dailyBreakdown.slice(0, 30).map(day => (
                                    <tr key={day.date} style={{ borderBottom: `1.4px solid ${teal[50]}` }}
                                        onMouseEnter={e => e.currentTarget.style.background = teal[50]}
                                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                                        <td style={s.td}>{format(parseISO(day.date), 'EEE, MMM dd, yyyy')}</td>
                                        <td style={s.tdRight}>{day.count}</td>
                                        <td style={s.tdRight}><strong>{formatCurrency(day.sales)}</strong></td>
                                        <td style={{ ...s.tdRight, color: teal[600] }}>{formatCurrency(day.byMethod['Cash'] || 0)}</td>
                                        <td style={{ ...s.tdRight, color: teal[600] }}>{formatCurrency(day.byMethod['Card'] || 0)}</td>
                                        <td style={{ ...s.tdRight, color: amber[500] }}>{formatCurrency(day.byMethod['Mobile Money'] || 0)}</td>
                                        <td style={s.tdRight}>{formatCurrency((day.byMethod['Wallet'] || 0) + (day.byMethod['Bank Transfer'] || 0) + (day.byMethod['Split'] || 0))}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
                <div style={s.cardPad}>
                    <h3 style={{ fontWeight: 700, color: ink, fontSize: 13, margin: '0 0 16px', display: 'flex', alignItems: 'center', gap: 8 }}>
                        <TrendingUp size={18} style={{ color: teal[500] }} /> Top 10 Transactions
                    </h3>
                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', textAlign: 'left', fontSize: 13, borderCollapse: 'collapse' }}>
                            <thead>
                                <tr style={{ borderBottom: `1.4px solid ${teal[100]}` }}>
                                    {['ID', 'Customer', 'Method', 'Amount'].map(h => (
                                        <th key={h} style={h === 'Amount' ? s.thRight : s.th}>{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {auditData.topTransactions.map(sale => (
                                    <tr key={sale.id} style={{ borderBottom: `1.4px solid ${teal[50]}` }}
                                        onMouseEnter={e => e.currentTarget.style.background = teal[50]}
                                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                                        <td style={s.td}>{sale.id.slice(-8)}</td>
                                        <td style={s.td}>{sale.customerName || 'Walk-in'}</td>
                                        <td style={s.td}><span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>{getPaymentMethodIcon(sale.paymentMethod)}<span style={{ color: inkSoft, fontSize: 12 }}>{sale.paymentMethod}</span></span></td>
                                        <td style={s.tdRight}><strong>{formatCurrency(sale.totalAmount || sale.total || 0)}</strong></td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
                <div style={s.cardPad}>
                    <h3 style={{ fontWeight: 700, color: ink, fontSize: 13, margin: '0 0 16px', display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Receipt size={18} style={{ color: amber[500] }} /> Recent Customer Payments
                    </h3>
                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', textAlign: 'left', fontSize: 13, borderCollapse: 'collapse' }}>
                            <thead>
                                <tr style={{ borderBottom: `1.4px solid ${teal[100]}` }}>
                                    {['Date', 'Customer', 'Method', 'Amount'].map(h => (
                                        <th key={h} style={h === 'Amount' ? s.thRight : s.th}>{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {auditData.recentPayments.map(payment => (
                                    <tr key={payment.id} style={{ borderBottom: `1.4px solid ${teal[50]}` }}
                                        onMouseEnter={e => e.currentTarget.style.background = teal[50]}
                                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                                        <td style={s.td}>{format(parseISO(payment.date), 'MMM dd')}</td>
                                        <td style={s.td}>{payment.customerName}</td>
                                        <td style={s.td}>{payment.paymentMethod}</td>
                                        <td style={{ ...s.tdRight, color: teal[600] }}><strong>{formatCurrency(payment.amount)}</strong></td>
                                    </tr>
                                ))}
                                {auditData.recentPayments.length === 0 && (
                                    <tr><td colSpan={4} style={{ padding: '24px 16px', textAlign: 'center', color: inkSoft, fontStyle: 'italic', fontSize: 12 }}>No payments recorded</td></tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default SalesAudit;