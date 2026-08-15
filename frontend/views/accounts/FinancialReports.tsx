
import React, { useState, useMemo, useEffect } from 'react';
import {
    FileBarChart, Printer, TrendingUp, TrendingDown, Activity,
    DollarSign, Scale, AlertTriangle, ChevronRight, X, Search, Target,
    ArrowUpRight, ArrowDownLeft, Landmark, FileText, History, Plus,
    MoveUpRight, MoveDownLeft, Coins, Calendar, Download, Filter,
    RefreshCw, ChevronDown, CheckCircle2, Wallet, ArrowRight, ExternalLink,
    Eye
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useFinance } from '../../context/FinanceContext';
import { useSales } from '../../context/SalesContext';
import { useInventory } from '../../context/InventoryContext';
import { useProcurement } from '../../context/ProcurementContext';
import { useDocumentStore } from '../../stores/documentStore';
import { AccountType, LedgerEntry, Account } from '../../types';
import { format, startOfYear, endOfYear, startOfMonth, endOfMonth, isWithinInterval, parseISO, isBefore, isAfter, differenceInDays } from 'date-fns';
import { exportToCSV } from '../../services/excelService';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { currencyService } from '../../services/currencyService';

interface ReportRowProps {
    label: string;
    amount: number;
    prevAmount?: number;
    showCompare?: boolean;
    currency: string;
    isTotal?: boolean;
    subText?: string;
    forceColor?: string;
    onClick?: () => void;
    indent?: boolean;
}

const ReportRow: React.FC<ReportRowProps> = ({
    label, amount, prevAmount = 0, showCompare = false, currency, isTotal = false,
    subText = "", forceColor = "", onClick, indent = false
}) => {
    const variance = amount - prevAmount;
    const variancePercent = prevAmount !== 0 ? (variance / Math.abs(prevAmount)) * 100 : 0;

    return (
        <div
            onClick={onClick}
            className={`flex justify-between items-center py-2 px-1 border-b border-slate-100 group ${onClick ? 'cursor-pointer hover:bg-slate-50' : ''} ${isTotal ? 'border-t-2 border-slate-900 mt-4 pt-4 font-bold bg-slate-50/30' : ''} ${indent ? 'pl-8' : ''}`}
        >
            <div className="flex flex-col">
                <span className={`${isTotal ? 'text-[#393A3D] uppercase' : 'text-sm text-slate-700'} font-semibold truncate`}>{label}</span>
                {subText && <span className="text-[10px] text-slate-400 font-medium uppercase">{subText}</span>}
            </div>

            <div className="flex items-center gap-8">
                {showCompare && !isTotal && (
                    <div className="flex flex-col items-end min-w-[100px]">
                        <span className="text-xs text-slate-400">
                            {prevAmount < 0 ? `(${currency}${Math.abs(prevAmount).toLocaleString()})` : `${currency}${prevAmount.toLocaleString()}`}
                        </span>
                        <span className={`text-[10px] font-bold ${variance >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                            {variance >= 0 ? '+' : ''}{variancePercent.toFixed(1)}%
                        </span>
                    </div>
                )}

                <div className="flex items-center gap-3">
                    <span className={`${isTotal ? 'text-lg text-[#393A3D]' : 'text-sm text-[#393A3D]'} font-bold tabular-nums whitespace-nowrap ${forceColor}`}>
                        {amount < 0 ? `(${currency}${Math.abs(amount).toLocaleString(undefined, { minimumFractionDigits: 2 })})` : `${currency}${amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}`}
                    </span>
                    {onClick && !isTotal && <ChevronRight size={16} className="text-slate-300 group-hover:text-[#0077C5] transition-colors" />}
                </div>
            </div>
        </div>
    );
};

const FinancialReports: React.FC = () => {
    const { companyConfig, notify } = useAuth();
    const { accounts, ledger, budgets, invoices, runMonthEndClosing, syncInventoryValuation } = useFinance();
    const { customers } = useSales();
    const { inventory } = useInventory();
    const { purchases } = useProcurement();
    const { safeOpenPreview } = useDocumentStore();
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const [reportType, setReportType] = useState<'TrialBalance' | 'IncomeStatement' | 'BalanceSheet' | 'CashFlow' | 'EquityStatement' | 'AgedAR' | 'AgedAP' | 'Budget'>('IncomeStatement');
    const [drilldownAccount, setDrilldownAccount] = useState<Account | null>(null);
    const [selectedCustomerId, setSelectedCustomerId] = useState<string>('');
    const [selectedSubAccountNames, setSelectedSubAccountNames] = useState<string[]>([]);
    const [isCustomerFilterOpen, setIsCustomerFilterOpen] = useState(false);
    const [dateRange, setDateRange] = useState({
        start: startOfYear(new Date()).toISOString().split('T')[0],
        end: endOfYear(new Date()).toISOString().split('T')[0]
    });

    const currency = companyConfig?.currencySymbol || currencyService.getCurrency(currencyService.getBaseCurrency())?.symbol || '$';

    useEffect(() => {
        const typeParam = searchParams.get('type');
        if (typeParam && ['TrialBalance', 'IncomeStatement', 'BalanceSheet', 'CashFlow', 'EquityStatement', 'AgedAR', 'AgedAP', 'Budget'].includes(typeParam)) {
            setReportType(typeParam as 'TrialBalance' | 'IncomeStatement' | 'BalanceSheet' | 'CashFlow' | 'EquityStatement' | 'AgedAR' | 'AgedAP' | 'Budget');
        }
    }, [searchParams]);

    const physicalValuation = useMemo(() =>
        (inventory || []).reduce((sum, item) => sum + ((item.stock || 0) * (item.cost || 0)), 0)
        , [inventory]);

    const [quickFilter, setQuickFilter] = useState('This Year');
    const [compareWithPrevious, setCompareWithPrevious] = useState(false);
    const [refreshCounter, setRefreshCounter] = useState(0);

    const handleQuickFilter = (type: string) => {
        const now = new Date();
        setQuickFilter(type);
        if (type === 'This Year') {
            setDateRange({ start: startOfYear(now).toISOString().split('T')[0], end: endOfYear(now).toISOString().split('T')[0] });
        } else if (type === 'This Month') {
            setDateRange({ start: startOfMonth(now).toISOString().split('T')[0], end: endOfMonth(now).toISOString().split('T')[0] });
        } else if (type === 'Last Month') {
            const last = new Date(now.getFullYear(), now.getMonth() - 1, 1);
            setDateRange({ start: startOfMonth(last).toISOString().split('T')[0], end: endOfMonth(last).toISOString().split('T')[0] });
        }
    };

    const handlePreviewReport = () => {
        let reportData: any = {
            reportName: reportType === 'IncomeStatement' ? 'Profit & Loss Statement' :
                reportType === 'BalanceSheet' ? 'Balance Sheet' :
                    reportType === 'CashFlow' ? 'Statement of Cash Flows' :
                        reportType === 'EquityStatement' ? 'Statement of Changes in Equity' :
                            reportType === 'TrialBalance' ? 'Trial Balance' :
                                reportType === 'Budget' ? 'Budget Analysis' : 'Aged Report',
            period: `${format(parseISO(dateRange.start), 'MMMM d, yyyy')} - ${format(parseISO(dateRange.end), 'MMMM d, yyyy')}`,
            currency,
            sections: []
        };

        if (reportType === 'IncomeStatement') {
            reportData.sections = [
                {
                    title: 'Operating Revenue',
                    rows: [
                        ...getAccountRows(['Revenue']).map(a => ({
                            label: a.name,
                            subText: a.code,
                            amount: a.balance,
                            prevAmount: a.prevBalance
                        })),
                        {
                            label: 'Total Revenue',
                            amount: getAccountRows(['Revenue']).reduce((s, a) => s + a.balance, 0),
                            prevAmount: getAccountRows(['Revenue']).reduce((s, a) => s + (a.prevBalance || 0), 0),
                            isTotal: true
                        }
                    ]
                },
                {
                    title: 'Operating Expenses',
                    rows: [
                        ...getAccountRows(['Expense']).map(a => ({
                            label: a.name,
                            subText: a.code,
                            amount: a.balance,
                            prevAmount: a.prevBalance
                        })),
                        {
                            label: 'Total Expenses',
                            amount: getAccountRows(['Expense']).reduce((s, a) => s + a.balance, 0),
                            prevAmount: getAccountRows(['Expense']).reduce((s, a) => s + (a.prevBalance || 0), 0),
                            isTotal: true
                        }
                    ]
                }
            ];
            reportData.netPerformance = {
                label: 'Net Performance',
                amount: netIncome.current,
                prevAmount: netIncome.previous
            };
        } else if (reportType === 'BalanceSheet') {
            reportData.sections = [
                {
                    title: 'Assets',
                    rows: [
                        ...getAccountRows(['Asset']).map(a => ({
                            label: a.name,
                            subText: a.code,
                            amount: a.balance,
                            prevAmount: a.prevBalance
                        })),
                        {
                            label: 'Total Assets',
                            amount: getAccountRows(['Asset']).reduce((sum, a) => sum + a.balance, 0),
                            prevAmount: getAccountRows(['Asset']).reduce((sum, a) => sum + (a.prevBalance || 0), 0),
                            isTotal: true
                        }
                    ]
                },
                {
                    title: 'Liabilities & Equity',
                    rows: [
                        ...getAccountRows(['Liability']).map(a => ({
                            label: a.name,
                            subText: a.code,
                            amount: a.balance,
                            prevAmount: a.prevBalance
                        })),
                        ...getAccountRows(['Equity']).map(a => ({
                            label: a.name,
                            subText: a.code,
                            amount: a.balance,
                            prevAmount: a.prevBalance
                        })),
                        {
                            label: 'Net Profit / (Loss) for Period',
                            amount: netIncome.current,
                            prevAmount: netIncome.previous,
                            subText: 'Linked from Income Statement'
                        },
                        {
                            label: 'Total Liabilities & Equity',
                            amount: getAccountRows(['Liability']).reduce((sum, a) => sum + a.balance, 0) + getAccountRows(['Equity']).reduce((sum, a) => sum + a.balance, 0) + netIncome.current,
                            prevAmount: getAccountRows(['Liability']).reduce((sum, a) => sum + (a.prevBalance || 0), 0) + getAccountRows(['Equity']).reduce((sum, a) => sum + (a.prevBalance || 0), 0) + netIncome.previous,
                            isTotal: true
                        }
                    ]
                }
            ];
        } else if (reportType === 'CashFlow') {
            reportData.sections = [
                {
                    title: 'Operating Activities',
                    rows: cashFlowStats.activities.operating.map(a => ({
                        label: a.label,
                        amount: a.amount
                    }))
                },
                {
                    title: 'Investing Activities',
                    rows: cashFlowStats.activities.investing.map(a => ({
                        label: a.label,
                        amount: a.amount
                    }))
                },
                {
                    title: 'Financing Activities',
                    rows: cashFlowStats.activities.financing.map(a => ({
                        label: a.label,
                        amount: a.amount
                    }))
                }
            ];
            reportData.netPerformance = {
                label: 'Net Change in Cash',
                amount: cashFlowStats.netChange
            };
        } else if (reportType === 'EquityStatement') {
            const equityRows = getAccountRows(['Equity']);
            const openingEquityRow = (accountBalances.current['3000'] || 0);
            const netIncomeVal = netIncome.current;
            const totalEquityRow = equityRows.reduce((s, a) => s + a.balance, 0);
            const capitalContributions = equityRows
                .filter(a => a.balance > 0 && a.code !== '3000')
                .reduce((s, a) => s + a.balance, 0);
            const drawings = equityRows
                .filter(a => a.balance < 0 && a.code !== '3000')
                .reduce((s, a) => s + Math.abs(a.balance), 0);

            reportData.sections = [
                {
                    title: 'Equity Movement',
                    rows: [
                        { label: 'Opening Equity', amount: openingEquityRow, subText: 'As at period start' },
                        { label: 'Net Income / (Loss) for Period', amount: netIncomeVal, subText: 'From Income Statement' },
                        ...(capitalContributions !== 0 ? [{ label: 'Capital Contributions', amount: capitalContributions }] : []),
                        ...(drawings !== 0 ? [{ label: 'Drawings / Distributions', amount: -drawings }] : []),
                        ...equityRows
                            .filter(a => a.code !== '3000')
                            .map(a => ({ label: a.name, amount: a.balance, subText: a.code })),
                    ]
                }
            ];
            reportData.netPerformance = {
                label: 'Closing Equity',
                amount: totalEquityRow
            };
        } else if (reportType === 'TrialBalance') {
            const totalDebit = (accounts || []).reduce((sum, a) => {
                const bal = accountBalances.current[a.id] || 0;
                return sum + (bal > 0 ? bal : 0);
            }, 0);
            const totalCredit = (accounts || []).reduce((sum, a) => {
                const bal = accountBalances.current[a.id] || 0;
                return sum + (bal < 0 ? Math.abs(bal) : 0);
            }, 0);

            reportData.sections = [
                {
                    title: 'Debit Balances',
                    rows: (accounts || [])
                        .map(a => ({
                            label: a.name,
                            subText: a.code,
                            balance: accountBalances.current[a.id] || 0
                        }))
                        .filter(a => a.balance > 0)
                        .map(a => ({
                            label: a.label,
                            subText: a.subText,
                            amount: a.balance
                        }))
                },
                {
                    title: 'Credit Balances',
                    rows: (accounts || [])
                        .map(a => ({
                            label: a.name,
                            subText: a.code,
                            balance: accountBalances.current[a.id] || 0
                        }))
                        .filter(a => a.balance < 0)
                        .map(a => ({
                            label: a.label,
                            subText: a.subText,
                            amount: Math.abs(a.balance)
                        }))
                }
            ];
            reportData.netPerformance = {
                label: 'Trial Balance Totals (Debit / Credit)',
                amount: totalDebit,
                prevAmount: totalCredit
            };
        } else if (reportType === 'Budget') {
            reportData.sections = budgetData.reduce((acc: any[], item) => {
                let section = acc.find(s => s.title === item.type);
                if (!section) {
                    section = { title: item.type, rows: [] };
                    acc.push(section);
                }
                section.rows.push({
                    label: item.name,
                    subText: `${item.code} • Budget: ${currency}${item.budget.toLocaleString()}`,
                    amount: item.actual,
                    prevAmount: item.budget
                });
                return acc;
            }, []);
        } else if (reportType === 'AgedAR' || reportType === 'AgedAP') {
            const type = reportType === 'AgedAR' ? 'AR' : 'AP';
            const data = type === 'AR' ? agedData.ar : agedData.ap;
            const title = type === 'AR' ? 'Aged Receivables' : 'Aged Payables';
            const entityLabel = type === 'AR' ? 'Customer' : 'Supplier';

            reportData.reportName = title;
            reportData.sections = [
                {
                    title: 'Aging Summary',
                    rows: Object.entries(data.buckets).map(([bucket, amount]) => ({
                        label: `${bucket} Days`,
                        amount: amount as number
                    }))
                },
                {
                    title: `Top Outstanding ${entityLabel}s`,
                    rows: data.items
                        .sort((a, b) => b.balance - a.balance)
                        .slice(0, 10)
                        .map(i => ({
                            label: i.customerName || i.supplierId || 'Unknown',
                            subText: `Due: ${i.dueDate || i.date}`,
                            amount: i.balance
                        }))
                }
            ];
        } else {
            // Fallback for other report types
            reportData.sections = [
                {
                    title: 'Report Data',
                    rows: [
                        { label: 'Feature pending for this report type', amount: 0 }
                    ]
                }
            ];
        }

        safeOpenPreview('FISCAL_REPORT', reportData);
    };

    const accountBalances = useMemo(() => {
        const balances: Record<string, number> = {};
        const prevBalances: Record<string, number> = {};

        const startDate = parseISO(dateRange.start);
        const endDate = parseISO(dateRange.end);
        const startDay = dateRange.start;
        const endDay = dateRange.end;

        // Calculate previous period dates
        const diff = endDate.getTime() - startDate.getTime();
        const prevStartDate = new Date(startDate.getTime() - diff - 86400000);
        const prevEndDate = new Date(startDate.getTime() - 86400000);
        const prevStartDay = format(prevStartDate, 'yyyy-MM-dd');
        const prevEndDay = format(prevEndDate, 'yyyy-MM-dd');
        const isBalanceSheetAccount = (type?: AccountType) => type === 'Asset' || type === 'Liability' || type === 'Equity';
        const shouldIncludeForType = (entryDay: string, accountType: AccountType | undefined, rangeStart: string, rangeEnd: string) => {
            if (!accountType) return false;
            if (isBalanceSheetAccount(accountType)) return entryDay <= rangeEnd;
            return entryDay >= rangeStart && entryDay <= rangeEnd;
        };

        (accounts || []).forEach(a => {
            balances[a.id] = 0;
            prevBalances[a.id] = 0;
        });

        (ledger || []).forEach(entry => {
            // Apply Customer/Sub-Account Filtering
            if (selectedCustomerId && entry.customerId !== selectedCustomerId) return;
            if (selectedSubAccountNames.length > 0 && !selectedSubAccountNames.includes(entry.subAccountName || 'Main')) return;

            const entryDay = String(entry.date || '').slice(0, 10);
            const debitAcc = accounts.find(a => a.id === entry.debitAccountId || a.code === entry.debitAccountId);
            const creditAcc = accounts.find(a => a.id === entry.creditAccountId || a.code === entry.creditAccountId);

            const includeDebitCurrent = shouldIncludeForType(entryDay, debitAcc?.type, startDay, endDay);
            const includeCreditCurrent = shouldIncludeForType(entryDay, creditAcc?.type, startDay, endDay);

            if (debitAcc && includeDebitCurrent) {
                const sign = (debitAcc.type === 'Asset' || debitAcc.type === 'Expense') ? 1 : -1;
                balances[debitAcc.id] = (balances[debitAcc.id] || 0) + ((entry.amount || 0) * sign);
            }
            if (creditAcc && includeCreditCurrent) {
                const sign = (creditAcc.type === 'Asset' || creditAcc.type === 'Expense') ? -1 : 1;
                balances[creditAcc.id] = (balances[creditAcc.id] || 0) + ((entry.amount || 0) * sign);
            }

            if (!compareWithPrevious) return;
            const includeDebitPrev = shouldIncludeForType(entryDay, debitAcc?.type, prevStartDay, prevEndDay);
            const includeCreditPrev = shouldIncludeForType(entryDay, creditAcc?.type, prevStartDay, prevEndDay);

            if (debitAcc && includeDebitPrev) {
                const sign = (debitAcc.type === 'Asset' || debitAcc.type === 'Expense') ? 1 : -1;
                prevBalances[debitAcc.id] = (prevBalances[debitAcc.id] || 0) + ((entry.amount || 0) * sign);
            }
            if (creditAcc && includeCreditPrev) {
                const sign = (creditAcc.type === 'Asset' || creditAcc.type === 'Expense') ? -1 : 1;
                prevBalances[creditAcc.id] = (prevBalances[creditAcc.id] || 0) + ((entry.amount || 0) * sign);
            }
        });
        return { current: balances, previous: prevBalances };
    }, [ledger, accounts, dateRange, compareWithPrevious, selectedCustomerId, selectedSubAccountNames, refreshCounter]);

    const getAccountRows = (types: AccountType[]) => {
        return (accounts || [])
            .filter(a => types.includes(a.type))
            .map(a => {
                const gl = companyConfig?.glMapping || {};
                const invAccId = gl.defaultInventoryAccount || '1200';
                const isInventory = a.id === invAccId || a.code === invAccId;

                return {
                    ...a,
                    balance: accountBalances.current[a.id] || 0,
                    prevBalance: accountBalances.previous[a.id] || 0,
                    isInventory
                };
            })
            .filter(a => Math.abs(a.balance) > 0.001 || Math.abs(a.prevBalance) > 0.001)
            .sort((a, b) => a.code.localeCompare(b.code));
    };

    const netIncome = useMemo(() => {
        const revenue = getAccountRows(['Revenue']).reduce((s, a) => s + a.balance, 0);
        const expenses = getAccountRows(['Expense']).reduce((s, a) => s + a.balance, 0);
        const prevRevenue = getAccountRows(['Revenue']).reduce((s, a) => s + (a.prevBalance || 0), 0);
        const prevExpenses = getAccountRows(['Expense']).reduce((s, a) => s + (a.prevBalance || 0), 0);
        return {
            current: revenue - expenses,
            previous: prevRevenue - prevExpenses
        };
    }, [accountBalances, accounts, dateRange]);

    // Cash Flow Logic (Direct Method Simulation)
    const cashFlowStats = useMemo(() => {
        const gl = companyConfig?.glMapping;
        const cashAccCodes = [
            gl?.cashDrawerAccount || '1000',
            gl?.bankAccount || '1050'
        ];
        // Find account IDs for the cash codes to handle both ID and Code based ledger entries
        const cashAccs = (accounts || []).filter(a => cashAccCodes.includes(a.code) || cashAccCodes.includes(a.id));
        const cashAccIds = cashAccs.map(a => a.id);
        const cashAccFullCodes = cashAccs.map(a => a.code);

        const startDate = parseISO(dateRange.start);
        const endDate = parseISO(dateRange.end);

        const activities = {
            operating: [] as { label: string, amount: number }[],
            investing: [] as { label: string, amount: number }[],
            financing: [] as { label: string, amount: number }[]
        };

        let openingBalance = 0;

        // Calculate Opening Cash
        (ledger || []).forEach(entry => {
            const entryDate = parseISO(entry.date);
            if (isBefore(entryDate, startDate)) {
                const isDebitCash = cashAccIds.includes(entry.debitAccountId) || cashAccFullCodes.includes(entry.debitAccountId);
                const isCreditCash = cashAccIds.includes(entry.creditAccountId) || cashAccFullCodes.includes(entry.creditAccountId);
                if (isDebitCash) openingBalance += entry.amount;
                if (isCreditCash) openingBalance -= entry.amount;
            }
        });

        // Process period movements
        const periodEntries = (ledger || []).filter(entry => {
            const d = parseISO(entry.date);
            return (isWithinInterval(d, { start: startDate, end: endDate }) || entry.date.startsWith(dateRange.start));
        });

        const categories: Record<string, number> = {};

        periodEntries.forEach(entry => {
            const isDebitCash = cashAccIds.includes(entry.debitAccountId) || cashAccFullCodes.includes(entry.debitAccountId);
            const isCreditCash = cashAccIds.includes(entry.creditAccountId) || cashAccFullCodes.includes(entry.creditAccountId);

            if (!isDebitCash && !isCreditCash) return; // Non-cash entry

            // Get the non-cash side to categorize
            const otherSideId = isDebitCash ? entry.creditAccountId : entry.debitAccountId;
            const otherAcc = (accounts || []).find(a => a.id === otherSideId || a.code === otherSideId);

            if (!otherAcc) return;

            const movement = isDebitCash ? entry.amount : -entry.amount;
            const catName = otherAcc.name;
            categories[catName] = (categories[catName] || 0) + movement;
        });

        // Map categories to groups
        Object.entries(categories).forEach(([name, amount]) => {
            const acc = (accounts || []).find(a => a.name === name);
            if (!acc) return;

            const arId = gl?.accountsReceivable || '1100';
            const apId = gl?.accountsPayable || '2000';
            const invId = gl?.defaultInventoryAccount || '1200';

            const isOperating = acc.type === 'Revenue' || acc.type === 'Expense' ||
                acc.id === arId || acc.code === arId ||
                acc.id === apId || acc.code === apId;

            const isInvesting = acc.id === invId || acc.code === invId;

            if (isOperating) {
                activities.operating.push({ label: name, amount });
            } else if (isInvesting) {
                activities.investing.push({ label: name, amount });
            } else if (acc.type === 'Equity' || acc.type === 'Liability') {
                activities.financing.push({ label: name, amount });
            } else {
                activities.operating.push({ label: name, amount });
            }
        });

        const netOperating = activities.operating.reduce((s, a) => s + a.amount, 0);
        const netInvesting = activities.investing.reduce((s, a) => s + a.amount, 0);
        const netFinancing = activities.financing.reduce((s, a) => s + a.amount, 0);
        const netChange = netOperating + netInvesting + netFinancing;

        return {
            openingBalance,
            activities,
            netOperating,
            netInvesting,
            netFinancing,
            netChange,
            endingBalance: openingBalance + netChange
        };
    }, [ledger, accounts, dateRange, companyConfig]);

    const agedData = useMemo(() => {
        const now = new Date();
        const ar = (invoices || [])
            .filter(i => i.status !== 'Paid' && i.status !== 'Cancelled')
            .filter(i => {
                if (selectedCustomerId && i.customerId !== selectedCustomerId) return false;
                if (selectedSubAccountNames.length > 0 && !selectedSubAccountNames.includes(i.subAccountName || 'Main')) return false;
                return true;
            })
            .map(i => {
                const dueDate = i.dueDate || i.date;
                const days = differenceInDays(now, parseISO(dueDate));
                const balance = i.totalAmount - (i.paidAmount || 0);
                return { ...i, days, balance };
            });

        const ap = (purchases || [])
            .filter(p => p.paymentStatus !== 'Paid' && p.status !== 'Cancelled')
            .map(p => {
                const dueDate = p.dueDate || p.date;
                const days = differenceInDays(now, parseISO(dueDate));
                const balance = p.total - (p.paidAmount || 0);
                return { ...p, days, balance };
            });

        const getAgedBuckets = (items: { days: number, balance: number }[]) => {
            const buckets = {
                current: 0,
                '1-30': 0,
                '31-60': 0,
                '61-90': 0,
                '90+': 0
            };
            items.forEach(i => {
                if (i.days <= 0) buckets.current += i.balance;
                else if (i.days <= 30) buckets['1-30'] += i.balance;
                else if (i.days <= 60) buckets['31-60'] += i.balance;
                else if (i.days <= 90) buckets['61-90'] += i.balance;
                else buckets['90+'] += i.balance;
            });
            return buckets;
        };

        return {
            ar: { items: ar, buckets: getAgedBuckets(ar) },
            ap: { items: ap, buckets: getAgedBuckets(ap) }
        };
    }, [invoices, purchases, selectedCustomerId, selectedSubAccountNames]);

    const budgetData = useMemo(() => {
        const start = parseISO(dateRange.start);
        const end = parseISO(dateRange.end);

        // Filter budgets for the selected range
        const activeBudgets = (budgets || []).filter(b => {
            const bDate = parseISO(`${b.month}-01`);
            return (bDate >= start || b.month === format(start, 'yyyy-MM')) &&
                (bDate <= end || b.month === format(end, 'yyyy-MM'));
        });

        const report = (accounts || [])
            .filter(a => a.type === 'Revenue' || a.type === 'Expense')
            .map(acc => {
                const actual = accountBalances.current[acc.id] || 0;
                const budgetAmount = activeBudgets
                    .filter(b => b.accountId === acc.id)
                    .reduce((sum, b) => sum + b.amount, 0);

                const variance = actual - budgetAmount;
                const variancePct = budgetAmount !== 0 ? (variance / budgetAmount) * 100 : 0;

                return {
                    ...acc,
                    actual,
                    budget: budgetAmount,
                    variance,
                    variancePct
                };
            })
            .filter(item => Math.abs(item.actual) > 0 || Math.abs(item.budget) > 0);

        return report;
    }, [budgets, accounts, accountBalances, dateRange, selectedCustomerId, selectedSubAccountNames]);

    const renderBudgetReport = () => (
        <div className="animate-in fade-in duration-500">
            <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                    <thead>
                        <tr className="text-slate-500 font-bold uppercase tracking-widest border-b-2 border-slate-900">
                            <th className="py-4 px-2">Account</th>
                            <th className="py-4 px-2 text-right">Actual</th>
                            <th className="py-4 px-2 text-right">Budget</th>
                            <th className="py-4 px-2 text-right">Variance</th>
                            <th className="py-4 px-2 text-right">Var %</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {budgetData.map(item => {
                            const isFavorable = item.type === 'Revenue' ? item.variance >= 0 : item.variance <= 0;
                            return (
                                <tr key={item.id} className="hover:bg-slate-50 transition-colors">
                                    <td className="py-4 px-2">
                                        <p className="font-bold text-slate-700">{item.name}</p>
                                        <p className="text-[10px] text-slate-400 font-medium uppercase">{item.type}</p>
                                    </td>
                                    <td className="py-4 px-2 text-right font-mono font-bold">{currency}{item.actual.toLocaleString()}</td>
                                    <td className="py-4 px-2 text-right font-mono text-slate-500">{currency}{item.budget.toLocaleString()}</td>
                                    <td className={`py-4 px-2 text-right font-mono font-bold ${isFavorable ? 'text-emerald-600' : 'text-rose-600'}`}>
                                        {item.variance > 0 ? '+' : ''}{currency}{item.variance.toLocaleString()}
                                    </td>
                                    <td className={`py-4 px-2 text-right font-bold ${isFavorable ? 'text-emerald-600' : 'text-rose-600'}`}>
                                        {item.variancePct.toFixed(1)}%
                                    </td>
                                </tr>
                            );
                        })}
                        {budgetData.length === 0 && (
                            <tr><td colSpan={5} className="py-20 text-center text-slate-400 font-bold italic">No budget or actual data for this period.</td></tr>
                        )}
                    </tbody>
                    <tfoot className="border-t-4 border-double border-slate-900 bg-slate-50">
                        <tr className="font-bold">
                            <td className="py-4 px-2 uppercase">Total Performance</td>
                            <td className="py-4 px-2 text-right font-mono">{currency}{budgetData.reduce((s, i) => s + i.actual, 0).toLocaleString()}</td>
                            <td className="py-4 px-2 text-right font-mono text-slate-500">{currency}{budgetData.reduce((s, i) => s + i.budget, 0).toLocaleString()}</td>
                            <td colSpan={2} className="py-4 px-2 text-right text-emerald-600">Calculated on Ledger</td>
                        </tr>
                    </tfoot>
                </table>
            </div>
        </div>
    );

    const renderAgedReport = (type: 'AR' | 'AP') => {
        const data = type === 'AR' ? agedData.ar : agedData.ap;
        const label = type === 'AR' ? 'Customer' : 'Supplier';

        return (
            <div className="animate-in fade-in duration-500">
                <div className="grid grid-cols-5 gap-4 mb-12 no-print">
                    {Object.entries(data.buckets).map(([bucket, amount]) => (
                        <div key={bucket} className="bg-slate-50 p-4 rounded border border-slate-200 text-center">
                            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">{bucket} Days</p>
                            <p className="text-xl font-bold text-slate-900 mt-1">{currency}{amount.toLocaleString(undefined, { minimumFractionDigits: 0 })}</p>
                        </div>
                    ))}
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs border-collapse">
                        <thead>
                            <tr className="text-slate-500 font-bold uppercase tracking-widest border-b-2 border-slate-900">
                                <th className="py-4 px-2">{label}</th>
                                <th className="py-4 px-2">Document</th>
                                <th className="py-4 px-2">Date</th>
                                <th className="py-4 px-2">Aging</th>
                                <th className="py-4 px-2 text-right">Balance</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {data.items.sort((a, b) => b.days - a.days).map((item: any) => (
                                <tr key={item.id} className="hover:bg-slate-50 transition-colors">
                                    <td className="py-4 px-2 font-bold text-slate-700">{item.customerName || item.supplierId}</td>
                                    <td className="py-4 px-2 font-mono text-slate-500 text-[10px]">{item.id}</td>
                                    <td className="py-4 px-2 text-slate-500">{new Date(item.date).toLocaleDateString()}</td>
                                    <td className="py-4 px-2">
                                        <span className={`px-2 py-0.5 rounded font-bold text-[10px] ${item.days > 90 ? 'bg-rose-100 text-rose-600' : item.days > 30 ? 'bg-amber-100 text-amber-600' : 'bg-slate-100 text-slate-500'}`}>
                                            {item.days} days
                                        </span>
                                    </td>
                                    <td className="py-4 px-2 text-right font-bold text-[#393A3D]">{currency}{item.balance.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                                </tr>
                            ))}
                            {data.items.length === 0 && (
                                <tr><td colSpan={5} className="py-20 text-center text-slate-400 font-bold italic">No outstanding balances found.</td></tr>
                            )}
                        </tbody>
                        <tfoot className="border-t-4 border-double border-slate-900 bg-slate-50">
                            <tr className="font-bold">
                                <td colSpan={4} className="py-4 px-2 uppercase">Total Outstanding</td>
                                <td className="py-4 px-2 text-right text-lg">{currency}{Object.values(data.buckets).reduce((s, a) => s + (a as number), 0).toLocaleString()}</td>
                            </tr>
                        </tfoot>
                    </table>
                </div>
            </div>
        );
    };

    const handleExportReport = () => {
        let data: any[] = [];
        const rows = (accounts || []).map(a => ({ ...a, balance: accountBalances.current[a.id] || 0 })).filter(a => Math.abs(a.balance) > 0.001);

        if (reportType === 'TrialBalance') {
            data = rows.map(r => {
                const isDebitNature = r.type === 'Asset' || r.type === 'Expense';
                return {
                    Code: r.code,
                    Name: r.name,
                    Type: r.type,
                    Debit: isDebitNature ? (r.balance > 0 ? r.balance : 0) : (r.balance < 0 ? Math.abs(r.balance) : 0),
                    Credit: !isDebitNature ? (r.balance > 0 ? r.balance : 0) : (r.balance < 0 ? Math.abs(r.balance) : 0)
                };
            });
        } else {
            data = rows.map(r => ({ Code: r.code, Name: r.name, Type: r.type, Balance: r.balance }));
        }

        exportToCSV(data, `${reportType}_${dateRange.start}_to_${dateRange.end}`);
        notify("Report exported to CSV", "success");
    };

    const handlePrint = () => {
        window.print();
    };

    const printStyles = `
    @media print {
        body * { visibility: hidden !important; }
        #financial-report-printable, #financial-report-printable * { visibility: visible !important; }
        #financial-report-printable {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            margin: 0 !important;
            padding: 20px !important;
            background: white !important;
        }
        .no-print { display: none !important; }
    }
  `;

    const renderDrilldownModal = () => {
        if (!drilldownAccount) return null;
        const accountEntries = ledger.filter(l => l.debitAccountId === drilldownAccount.id || l.creditAccountId === drilldownAccount.id || l.debitAccountId === drilldownAccount.code || l.creditAccountId === drilldownAccount.code);

        return (
            <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-end animate-in fade-in duration-300">
                <div className="w-full max-w-2xl bg-white h-full shadow-2xl flex flex-col animate-in slide-in-from-right duration-300">
                    <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                        <div>
                            <h2 className="text-xl font-black text-slate-900 uppercase tracking-tighter">Audit: {drilldownAccount.name}</h2>
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">GL Source • {drilldownAccount.code}</p>
                        </div>
                        <div className="flex items-center gap-2">
                            <button
                                onClick={() => {
                                    navigate(`/fiscal-reports/ledgers?accountId=${drilldownAccount.id}`);
                                    setDrilldownAccount(null);
                                }}
                                className="flex items-center gap-2 px-3 py-2 bg-blue-50 text-blue-600 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-blue-100 transition-all border border-blue-100"
                            >
                                <ExternalLink size={14} /> Full Ledger
                            </button>
                            <button onClick={() => setDrilldownAccount(null)} className="p-2 hover:bg-white rounded-full text-slate-400 transition-all border border-transparent hover:border-slate-200"><X size={24} /></button>
                        </div>
                    </div>

                    <div className="flex-1 overflow-y-auto custom-scrollbar p-6">
                        <table className="w-full text-left text-xs border-collapse">
                            <thead className="text-slate-400 font-black uppercase tracking-widest border-b border-slate-100 sticky top-0 bg-white z-10">
                                <tr><th className="py-3 pr-4">Date</th><th className="py-3">Narration</th><th className="py-3 text-right">Debit</th><th className="py-3 text-right">Credit</th></tr>
                            </thead>
                            <tbody className="divide-y divide-slate-50">
                                {accountEntries.map(entry => {
                                    const isDebit = entry.debitAccountId === drilldownAccount.id || entry.debitAccountId === drilldownAccount.code;
                                    return (
                                        <tr key={entry.id} className="hover:bg-slate-50">
                                            <td className="py-3 pr-4 text-slate-400 whitespace-nowrap">{new Date(entry.date).toLocaleDateString()}</td>
                                            <td className="py-3">
                                                <div className="font-bold text-slate-700">{entry.description}</div>
                                                <div className="text-[9px] text-slate-400 font-mono">Ref: {entry.referenceId || entry.id}</div>
                                            </td>
                                            <td className="py-3 text-right font-mono font-bold text-slate-600">{isDebit ? entry.amount.toFixed(2) : '—'}</td>
                                            <td className="py-3 text-right font-mono font-bold text-slate-600">{!isDebit ? entry.amount.toFixed(2) : '—'}</td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>

                    <div className="p-6 bg-slate-900 text-white">
                        <div className="flex justify-between items-center text-lg font-black uppercase tracking-tighter">
                            <span>Account Balance</span>
                            <span>{currency}{(accountBalances.current[drilldownAccount.id] || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                        </div>
                    </div>
                </div>
            </div>
        );
    };

    return (
        <div className="h-screen flex flex-col bg-[#F4F5F8] font-sans text-[#393A3D]">
            <style>{printStyles}</style>

            {/* QBO Top Navigation Bar */}
            <div className="sticky top-0 z-30 bg-white border-b border-slate-200 shadow-sm no-print">
                <div className="max-w-[1600px] mx-auto px-8 h-16 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <h1 className="text-xl font-bold text-[#393A3D]">
                            {reportType === 'IncomeStatement' ? 'Profit & Loss' :
                                reportType === 'BalanceSheet' ? 'Balance Sheet' :
                                    reportType === 'CashFlow' ? 'Statement of Cash Flows' :
                                        reportType === 'EquityStatement' ? 'Statement of Changes in Equity' :
                                            reportType === 'TrialBalance' ? 'Trial Balance' :
                                                reportType === 'Budget' ? 'Budget Analysis' :
                                                    reportType === 'AgedAR' ? 'Aged Receivables' : 'Aged Payables'}
                        </h1>
                        <div className="h-6 w-px bg-slate-200 mx-2" />
                        <div className="flex items-center gap-2 group cursor-pointer">
                            <Calendar size={16} className="text-[#0077C5]" />
                            <span className="text-sm font-semibold text-[#0077C5]">
                                {format(parseISO(dateRange.start), 'MMM d')} - {format(parseISO(dateRange.end), 'MMM d, yyyy')}
                            </span>
                            <ChevronDown size={14} className="text-[#0077C5]" />
                        </div>
                    </div>

                    <div className="flex items-center gap-3">
                        <button
                            onClick={handlePreviewReport}
                            className="flex items-center gap-2 px-4 py-2 hover:bg-slate-100 rounded text-sm font-semibold transition-colors"
                        >
                            <Eye size={18} />
                            Print / Preview
                        </button>
                        <button
                            onClick={handleExportReport}
                            className="flex items-center gap-2 px-4 py-2 hover:bg-slate-100 rounded text-sm font-semibold transition-colors"
                        >
                            <Download size={18} />
                            Export
                        </button>
                        <button
                            onClick={() => setRefreshCounter(c => c + 1)}
                            className="flex items-center gap-2 px-6 py-2 bg-[#2CA01C] hover:bg-[#248217] text-white rounded-full text-sm font-black transition-all shadow-sm active:scale-95"
                        >
                            Run Report
                        </button>
                    </div>
                </div>
            </div>

            {/* Main Content Area - Scrollable */}
            <div className="flex-1 overflow-y-auto custom-scrollbar">
                <div className="max-w-[1600px] mx-auto p-8">
                    {/* QBO Filter Panel */}
                    <div className="bg-white p-6 rounded border border-slate-200 shadow-sm mb-8 no-print">
                        <div className="grid grid-cols-1 md:grid-cols-5 gap-6">
                            <div className="space-y-2">
                                <label className="text-xs font-bold text-slate-500 uppercase">Report period</label>
                                <select
                                    value={quickFilter}
                                    onChange={(e) => handleQuickFilter(e.target.value)}
                                    className="w-full p-2 bg-white border border-slate-300 rounded text-sm outline-none focus:border-[#0077C5]"
                                >
                                    <option>This Year</option>
                                    <option>This Month</option>
                                    <option>Last Month</option>
                                    <option>Custom</option>
                                </select>
                            </div>
                            <div className="space-y-2">
                                <label className="text-xs font-bold text-slate-500 uppercase">Start date</label>
                                <input
                                    type="date"
                                    value={dateRange.start}
                                    onChange={(e) => setDateRange(prev => ({ ...prev, start: e.target.value }))}
                                    className="w-full p-2 bg-white border border-slate-300 rounded text-sm outline-none focus:border-[#0077C5]"
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-xs font-bold text-slate-500 uppercase">End date</label>
                                <input
                                    type="date"
                                    value={dateRange.end}
                                    onChange={(e) => setDateRange(prev => ({ ...prev, end: e.target.value }))}
                                    className="w-full p-2 bg-white border border-slate-300 rounded text-sm outline-none focus:border-[#0077C5]"
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-xs font-bold text-slate-500 uppercase">Comparison</label>
                                <button
                                    onClick={() => setCompareWithPrevious(!compareWithPrevious)}
                                    className={`w-full p-2 border rounded text-sm font-bold transition-all flex items-center justify-center gap-2 ${compareWithPrevious ? 'bg-blue-50 border-blue-200 text-blue-600' : 'bg-white border-slate-300 text-slate-600'}`}
                                >
                                    <div className={`w-1.5 h-1.5 rounded-full ${compareWithPrevious ? 'bg-blue-600' : 'bg-slate-300'}`} />
                                    {compareWithPrevious ? 'Active' : 'Previous'}
                                </button>
                            </div>
                            <div className="flex items-end gap-2">
                                <button
                                    onClick={() => setIsCustomerFilterOpen(!isCustomerFilterOpen)}
                                    className={`flex-1 p-2 border rounded text-sm font-bold transition-all flex items-center justify-center gap-2 ${selectedCustomerId ? 'bg-blue-50 border-blue-200 text-[#0077C5]' : 'bg-white border-slate-300 text-slate-600'}`}
                                >
                                    <Filter size={14} />
                                    {selectedCustomerId ? 'Filtered' : 'Customer'}
                                </button>
                                <button
                                    onClick={() => setRefreshCounter(c => c + 1)}
                                    className="p-2 bg-white border border-slate-300 hover:border-slate-400 rounded text-slate-600 transition-colors"
                                    title="Refresh Data"
                                >
                                    <RefreshCw size={14} />
                                </button>

                                {isCustomerFilterOpen && (
                                    <div className="absolute top-full left-0 right-0 mt-4 bg-white border border-slate-200 rounded shadow-xl z-50 p-6 animate-in fade-in slide-in-from-top-2">
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                            <div className="space-y-3">
                                                <label className="text-xs font-bold text-slate-500 uppercase block">Select Customer</label>
                                                <select
                                                    value={selectedCustomerId}
                                                    onChange={(e) => {
                                                        setSelectedCustomerId(e.target.value);
                                                        setSelectedSubAccountNames([]);
                                                    }}
                                                    className="w-full bg-white border border-slate-300 rounded p-2 text-sm outline-none focus:border-[#0077C5]"
                                                >
                                                    <option value="">All Customers</option>
                                                    {customers.map(c => (
                                                        <option key={c.id} value={c.id}>{c.name}</option>
                                                    ))}
                                                </select>
                                                {selectedCustomerId && (
                                                    <button
                                                        onClick={() => { setSelectedCustomerId(''); setSelectedSubAccountNames([]); }}
                                                        className="text-[10px] text-rose-500 font-bold uppercase"
                                                    >
                                                        Clear Filter
                                                    </button>
                                                )}
                                            </div>

                                            {selectedCustomerId && (
                                                <div className="space-y-3">
                                                    <label className="text-xs font-bold text-slate-500 uppercase block">Filter by Sub-Accounts</label>
                                                    <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto custom-scrollbar p-1">
                                                        {['Main', ...(customers.find(c => c.id === selectedCustomerId)?.subAccounts?.map(s => s.name) || [])].map(sub => (
                                                            <label key={sub} className="flex items-center gap-2 px-3 py-1.5 rounded-full border border-slate-200 bg-slate-50 hover:bg-white cursor-pointer transition-colors group">
                                                                <input
                                                                    type="checkbox"
                                                                    checked={selectedSubAccountNames.includes(sub)}
                                                                    onChange={(e) => {
                                                                        if (e.target.checked) {
                                                                            setSelectedSubAccountNames([...selectedSubAccountNames, sub]);
                                                                        } else {
                                                                            setSelectedSubAccountNames(selectedSubAccountNames.filter(s => s !== sub));
                                                                        }
                                                                    }}
                                                                    className="w-3 h-3 rounded text-[#0077C5] focus:ring-[#0077C5]"
                                                                />
                                                                <span className="text-[11px] font-medium text-slate-600 group-hover:text-[#0077C5]">{sub}</span>
                                                            </label>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                        <div className="mt-6 pt-4 border-t border-slate-100 flex justify-end">
                                            <button
                                                onClick={() => setIsCustomerFilterOpen(false)}
                                                className="px-6 py-2 bg-[#0077C5] text-white rounded text-xs font-bold uppercase transition-colors"
                                            >
                                                Apply Filters
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    

                    {/* Report Content */}
                    <div id="financial-report-printable" className="bg-white rounded border border-slate-200 shadow-sm overflow-hidden mb-12">
                        <div className="p-12">
                            <div className="text-center mb-12">
                                <h2 className="text-xl font-bold text-[#393A3D]">{companyConfig?.companyName || 'Prime ERP System'}</h2>
                                <h3 className="text-2xl font-bold text-[#393A3D] mt-1">
                                    {reportType === 'IncomeStatement' ? 'Profit & Loss' :
                                        reportType === 'BalanceSheet' ? 'Balance Sheet' :
                                            reportType === 'CashFlow' ? 'Statement of Cash Flows' :
                                                reportType === 'EquityStatement' ? 'Statement of Changes in Equity' :
                                                    reportType === 'TrialBalance' ? 'Trial Balance' :
                                                        reportType === 'Budget' ? 'Budget Analysis' :
                                                            reportType === 'AgedAR' ? 'Aged Receivables' : 'Aged Payables'}
                                </h3>
                                <p className="text-sm text-slate-500 mt-2 font-medium">
                                    {reportType === 'BalanceSheet' ? `As of ${format(parseISO(dateRange.end), 'MMMM d, yyyy')}` :
                                        `${format(parseISO(dateRange.start), 'MMMM d, yyyy')} - ${format(parseISO(dateRange.end), 'MMMM d, yyyy')}`}
                                </p>
                            </div>

                            <div className="max-w-4xl mx-auto">
                                {reportType === 'IncomeStatement' && (
                                    <div className="space-y-10">
                                        <div>
                                            <h3 className="font-bold text-slate-900 border-b-2 border-slate-900 pb-2 mb-4 text-xs uppercase tracking-widest">Revenue</h3>
                                            {getAccountRows(['Revenue']).map(a => <ReportRow key={a.id} label={a.name} subText={a.code} amount={a.balance} prevAmount={a.prevBalance} showCompare={compareWithPrevious} currency={currency} onClick={() => setDrilldownAccount(a)} />)}
                                            <ReportRow
                                                label="Total Revenue"
                                                amount={getAccountRows(['Revenue']).reduce((s, a) => s + a.balance, 0)}
                                                prevAmount={getAccountRows(['Revenue']).reduce((s, a) => s + (a.prevBalance || 0), 0)}
                                                showCompare={compareWithPrevious}
                                                currency={currency}
                                                isTotal
                                            />
                                        </div>
                                        <div>
                                            <h3 className="font-bold text-slate-900 border-b-2 border-slate-900 pb-2 mb-4 text-xs uppercase tracking-widest">Expenses</h3>
                                            {getAccountRows(['Expense']).map(a => <ReportRow key={a.id} label={a.name} subText={a.code} amount={a.balance} prevAmount={a.prevBalance} showCompare={compareWithPrevious} currency={currency} onClick={() => setDrilldownAccount(a)} />)}
                                            <ReportRow
                                                label="Total Expenses"
                                                amount={getAccountRows(['Expense']).reduce((s, a) => s + a.balance, 0)}
                                                prevAmount={getAccountRows(['Expense']).reduce((s, a) => s + (a.prevBalance || 0), 0)}
                                                showCompare={compareWithPrevious}
                                                currency={currency}
                                                isTotal
                                            />
                                        </div>
                                        <div className="pt-6 border-t-4 border-double border-slate-900 mt-6 bg-[#393A3D] text-white p-8 rounded-xl">
                                            <ReportRow
                                                label="Net Performance"
                                                amount={netIncome.current}
                                                prevAmount={netIncome.previous}
                                                showCompare={compareWithPrevious}
                                                currency={currency}
                                                isTotal
                                                forceColor={netIncome.current >= 0 ? 'text-emerald-400' : 'text-rose-400'}
                                            />
                                        </div>
                                    </div>
                                )}

                                {reportType === 'BalanceSheet' && (
                                    <div className="space-y-10">
                                        <div>
                                            <h3 className="font-bold text-slate-900 border-b-2 border-slate-900 pb-2 mb-4 text-xs uppercase tracking-widest">Assets</h3>
                                            {getAccountRows(['Asset']).map(a => {
                                                const drift = a.isInventory ? a.balance - physicalValuation : 0;
                                                return (
                                                    <div key={a.id} className="space-y-1">
                                                        <ReportRow label={a.name} subText={a.code} amount={a.balance} prevAmount={a.prevBalance} showCompare={compareWithPrevious} currency={currency} onClick={() => setDrilldownAccount(a)} />
                                                        {a.isInventory && Math.abs(drift) > 1 && (
                                                            <div className="mx-2 mb-4 p-4 bg-amber-50 rounded-xl border border-amber-100">
                                                                <div className="flex items-center justify-between mb-2">
                                                                    <span className="text-[10px] font-black text-amber-700 uppercase tracking-tight flex items-center gap-1">
                                                                        <AlertTriangle size={12} /> Physical Valuation Drift
                                                                    </span>
                                                                    <div className="flex items-center gap-3">
                                                                        <span className={`text-[10px] font-black ${drift > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                                                                            {drift > 0 ? '+' : ''}{currency}{drift.toLocaleString()}
                                                                        </span>
                                                                        <button
                                                                            onClick={(e) => {
                                                                                e.stopPropagation();
                                                                                if (confirm("Adjust ledger to match physical valuation? This will post an adjustment entry.")) {
                                                                                    syncInventoryValuation(a.id, physicalValuation, a.balance);
                                                                                }
                                                                            }}
                                                                            className="px-2 py-1 bg-amber-600 text-white rounded text-[8px] font-black uppercase tracking-tighter hover:bg-amber-700 transition-colors"
                                                                        >
                                                                            Sync Ledger
                                                                        </button>
                                                                    </div>
                                                                </div>
                                                                <div className="flex justify-between text-[9px] font-bold text-amber-600/70">
                                                                    <span>Physical: {currency}{physicalValuation.toLocaleString()}</span>
                                                                    <span>Ledger: {currency}{a.balance.toLocaleString()}</span>
                                                                </div>
                                                            </div>
                                                        )}
                                                    </div>
                                                );
                                            })}
                                            <ReportRow
                                                label="Total Assets"
                                                amount={getAccountRows(['Asset']).reduce((sum, a) => sum + a.balance, 0)}
                                                prevAmount={getAccountRows(['Asset']).reduce((sum, a) => sum + (a.prevBalance || 0), 0)}
                                                showCompare={compareWithPrevious}
                                                currency={currency}
                                                isTotal
                                            />
                                        </div>
                                        <div>
                                            <h3 className="font-bold text-slate-900 border-b-2 border-slate-900 pb-2 mb-4 text-xs uppercase tracking-widest">Liabilities & Equity</h3>
                                            {getAccountRows(['Liability']).map(a => <ReportRow key={a.id} label={a.name} subText={a.code} amount={a.balance} prevAmount={a.prevBalance} showCompare={compareWithPrevious} currency={currency} onClick={() => setDrilldownAccount(a)} />)}
                                            {getAccountRows(['Equity']).map(a => <ReportRow key={a.id} label={a.name} subText={a.code} amount={a.balance} prevAmount={a.prevBalance} showCompare={compareWithPrevious} currency={currency} onClick={() => setDrilldownAccount(a)} />)}
                                            <ReportRow
                                                label="Net Profit for Period"
                                                amount={netIncome.current}
                                                prevAmount={netIncome.previous}
                                                showCompare={compareWithPrevious}
                                                currency={currency}
                                                subText="Retained Earnings"
                                            />
                                            <ReportRow
                                                label="Total Liabilities & Equity"
                                                amount={getAccountRows(['Liability']).reduce((sum, a) => sum + a.balance, 0) + getAccountRows(['Equity']).reduce((sum, a) => sum + a.balance, 0) + netIncome.current}
                                                prevAmount={getAccountRows(['Liability']).reduce((sum, a) => sum + (a.prevBalance || 0), 0) + getAccountRows(['Equity']).reduce((sum, a) => sum + (a.prevBalance || 0), 0) + netIncome.previous}
                                                showCompare={compareWithPrevious}
                                                currency={currency}
                                                isTotal
                                            />
                                        </div>
                                    </div>
                                )}

                                {reportType === 'CashFlow' && (
                                    <div className="space-y-10">
                                        <div>
                                            <ReportRow label="Opening Balance" amount={cashFlowStats.openingBalance} currency={currency} isTotal />
                                        </div>
                                        <div>
                                            <h3 className="font-bold text-slate-900 border-b-2 border-slate-900 pb-2 mb-4 text-xs uppercase tracking-widest">Operating Activities</h3>
                                            {cashFlowStats.activities.operating.map((a, i) => <ReportRow key={i} label={a.label} amount={a.amount} currency={currency} />)}
                                            <ReportRow label="Net Cash from Operations" amount={cashFlowStats.netOperating} currency={currency} isTotal indent />
                                        </div>
                                        {cashFlowStats.activities.investing.length > 0 && (
                                            <div>
                                                <h3 className="font-bold text-slate-900 border-b-2 border-slate-900 pb-2 mb-4 text-xs uppercase tracking-widest">Investing Activities</h3>
                                                {cashFlowStats.activities.investing.map((a, i) => <ReportRow key={i} label={a.label} amount={a.amount} currency={currency} />)}
                                                <ReportRow label="Net Cash from Investing" amount={cashFlowStats.netInvesting} currency={currency} isTotal indent />
                                            </div>
                                        )}
                                        <div>
                                            <h3 className="font-bold text-slate-900 border-b-2 border-slate-900 pb-2 mb-4 text-xs uppercase tracking-widest">Financing Activities</h3>
                                            {cashFlowStats.activities.financing.map((a, i) => <ReportRow key={i} label={a.label} amount={a.amount} currency={currency} />)}
                                            <ReportRow label="Net Cash from Financing" amount={cashFlowStats.netFinancing} currency={currency} isTotal indent />
                                        </div>
                                        <div className="pt-6 border-t-4 border-double border-slate-900 mt-6 bg-[#393A3D] text-white p-8 rounded-xl">
                                            <ReportRow label="Net Change in Cash" amount={cashFlowStats.netChange} currency={currency} isTotal />
                                            <div className="h-px bg-white/20 my-4" />
                                            <ReportRow label="Closing Balance" amount={cashFlowStats.endingBalance} currency={currency} isTotal forceColor="text-emerald-400" />
                                        </div>
                                    </div>
                                )}

                                {reportType === 'EquityStatement' && (
                                    <div className="space-y-10">
                                        <div>
                                            <h3 className="font-bold text-slate-900 border-b-2 border-slate-900 pb-2 mb-4 text-xs uppercase tracking-widest">Statement of Changes in Equity</h3>
                                            <ReportRow label="Opening Equity" amount={accountBalances.current['3000'] || 0} currency={currency} isTotal />
                                            <ReportRow label="Net Income / (Loss) for Period" amount={netIncome.current} currency={currency} />
                                            {getAccountRows(['Equity']).filter(a => a.code !== '3000' && a.balance > 0).map(a => (
                                                <ReportRow key={a.id} label={a.name} amount={a.balance} currency={currency} subText={a.code} />
                                            ))}
                                            {getAccountRows(['Equity']).filter(a => a.code !== '3000' && a.balance < 0).map(a => (
                                                <ReportRow key={a.id} label={`Drawings: ${a.name}`} amount={a.balance} currency={currency} subText={a.code} />
                                            ))}
                                            <div className="pt-6 border-t-4 border-double border-slate-900 mt-6 bg-[#393A3D] text-white p-8 rounded-xl">
                                                <ReportRow
                                                    label="Closing Equity"
                                                    amount={getAccountRows(['Equity']).reduce((s, a) => s + a.balance, 0)}
                                                    currency={currency}
                                                    isTotal
                                                    forceColor="text-emerald-400"
                                                />
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {reportType === 'TrialBalance' && (
                                    <table className="w-full text-sm text-left border-collapse">
                                        <thead>
                                            <tr className="border-b-2 border-[#393A3D]">
                                                <th className="py-4 font-bold">Account</th>
                                                <th className="py-4 text-right">Debit</th>
                                                <th className="py-4 text-right">Credit</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100">
                                            {accounts.map(a => {
                                                const bal = accountBalances.current[a.id] || 0;
                                                if (Math.abs(bal) < 0.01) return null;
                                                const dr = bal > 0 ? bal : 0;
                                                const cr = bal < 0 ? Math.abs(bal) : 0;
                                                return (
                                                    <tr key={a.id} className="hover:bg-slate-50 transition-colors">
                                                        <td className="py-3 px-2">
                                                            <span className="text-slate-500 font-mono text-xs mr-3">{a.code}</span>
                                                            <span className="font-medium text-slate-700">{a.name}</span>
                                                        </td>
                                                        <td className="py-3 text-right tabular-nums font-mono">{dr > 0 ? dr.toLocaleString() : '—'}</td>
                                                        <td className="py-3 text-right tabular-nums font-mono">{cr > 0 ? cr.toLocaleString() : '—'}</td>
                                                    </tr>
                                                );
                                            })}
                                            <tr className="border-t-4 border-double border-[#393A3D] font-bold bg-slate-50">
                                                <td className="py-4 px-2">TOTALS</td>
                                                <td className="py-4 text-right tabular-nums font-mono">
                                                    {currency}{accounts.reduce((sum, a) => sum + (accountBalances.current[a.id] > 0 ? accountBalances.current[a.id] : 0), 0).toLocaleString()}
                                                </td>
                                                <td className="py-4 text-right tabular-nums font-mono">
                                                    {currency}{accounts.reduce((sum, a) => sum + (accountBalances.current[a.id] < 0 ? Math.abs(accountBalances.current[a.id]) : 0), 0).toLocaleString()}
                                                </td>
                                            </tr>
                                        </tbody>
                                    </table>
                                )}

                                {reportType === 'Budget' && renderBudgetReport()}
                                {reportType === 'AgedAR' && renderAgedReport('AR')}
                                {reportType === 'AgedAP' && renderAgedReport('AP')}
                            </div>
                        </div>
                    </div>

                    {/* Drilldown Modal integration remains same as it's separate */}
                    {renderDrilldownModal()}
                </div>
            </div>
        </div>
    );
};

export default FinancialReports;
