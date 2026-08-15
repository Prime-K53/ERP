import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { Banknote, CreditCard, Smartphone, Briefcase, X, Wallet, Award, Clock, CheckCircle2, AlertCircle, ArrowLeftRight } from 'lucide-react';
import type { PaymentDetail } from '../../../types';
import { useAuth } from '../../../context/AuthContext';
import { useFinance } from '../../../context/FinanceContext';
import { useBankingStore } from '../../../context/BankingContext';
import { DEFAULT_ACCOUNTS } from '../../../constants';
import { currencyService } from '../../../services/currencyService';

import { formatNumber } from '../../../utils/helpers';

interface PaymentModalProps {
    total: number;
    onComplete: (paymentMethods: PaymentDetail[], excessHandling?: 'Change' | 'Wallet') => void;
    onCancel: () => void;
    customerName: string | null;
    availableCredit: number;
    walletBalance: number;
    loyaltyPoints?: number;
    subAccountName?: string;
    adjustmentSummary?: { adjustmentId: string; adjustmentName: string; totalAmount: number; itemCount: number; }[];
    roundingAccumulation?: number;
    totalProfitMargin?: number;
    orderNumber: string;
}

const teal: Record<string, string> = { 50: '#eef7f6', 100: '#d3ece9', 200: '#a6d9d3', 300: '#72c0b7', 400: '#3fa294', 500: '#1f8577', 600: '#146b60', 700: '#0f544c', 800: '#0b3e39', 900: '#082e2a' };
const amber: Record<string, string> = { 100: '#fbead0', 300: '#eec27a', 500: '#d99a3f', 600: '#b97e2b' };
const paper = '#FEFDFB';
const ink = '#23282A';
const inkSoft = '#5c6567';
const hairline = '#e4ddd1';

export const PaymentModal: React.FC<PaymentModalProps> = ({
    total,
    onComplete,
    onCancel,
    customerName,
    availableCredit: _availableCredit,
    walletBalance,
    loyaltyPoints = 0,
    subAccountName: _subAccountName,
    adjustmentSummary = [],
    roundingAccumulation: _roundingAccumulation = 0,
    totalProfitMargin = 0,
    orderNumber
}) => {
    const { companyConfig, notify } = useAuth(); const { invoices } = useFinance();
    const { accounts: bankAccounts, fetchBankingData } = useBankingStore();
    const currency = companyConfig?.currencySymbol || currencyService.getCurrency(currencyService.getBaseCurrency())?.symbol || '$';
    const [splitPayments, setSplitPayments] = useState<PaymentDetail[]>([]);
    const [remainingDue, setRemainingDue] = useState(total);
    const [currentPaymentAmount, setCurrentPaymentAmount] = useState(() => (Number.isFinite(total) ? total.toFixed(2) : ''));
    const [changeDue, setChangeDue] = useState(0);
    const [activePaymentMethod, setActivePaymentMethod] = useState<string | null>(null);

    const handleCancel = useCallback(() => {
        setActivePaymentMethod(null);
        onCancel();
    }, [onCancel]);

    useEffect(() => {
        const val = parseFloat(currentPaymentAmount);
        if (!isNaN(val) && val > total) {
            setChangeDue(val - total);
        } else {
            setChangeDue(0);
        }
    }, [currentPaymentAmount, total]);

    const pointsConversionRate = 0.10;

    useEffect(() => {
        fetchBankingData?.();
    }, [fetchBankingData]);

    useEffect(() => {
        if (!bankAccounts || bankAccounts.length === 0) {
            fetchBankingData?.();
        }
    }, [bankAccounts?.length, fetchBankingData]);

    useEffect(() => {
        if (splitPayments.length === 0 && (currentPaymentAmount === '' || Number(currentPaymentAmount) === 0)) {
            setCurrentPaymentAmount(Number.isFinite(total) ? total.toFixed(2) : '');
            setRemainingDue(total);
        }
    }, [total, splitPayments.length]);

    const typedAmount = useMemo(() => {
        const parsed = parseFloat(currentPaymentAmount);
        return Number.isFinite(parsed) ? parsed : 0;
    }, [currentPaymentAmount]);

    const effectiveRemainingDue = useMemo(() => {
        if (splitPayments.length > 0) return remainingDue;
        return Math.max(0, total - typedAmount);
    }, [splitPayments.length, remainingDue, total, typedAmount]);

const canCompleteSale = useMemo(() => {
  const totalPaid = splitPayments.reduce((sum, p) => sum + p.amount, 0) + typedAmount;
  return totalPaid >= total - 0.01;
}, [splitPayments, typedAmount, total]);

    const handleComplete = useCallback(() => {
        const paymentsToSubmit: PaymentDetail[] = splitPayments.length > 0
            ? splitPayments
            : (
                typedAmount > 0
                    ? [{ method: 'Cash', amount: typedAmount, accountId: '1000' }]
                    : []
            );
        const totalPaid = paymentsToSubmit.reduce((sum, p) => sum + p.amount, 0);

        if (paymentsToSubmit.length === 0) {
            notify("Select a payment method or enter amount received.", "error");
            return;
        }

        if (totalPaid < total - 0.01) {
            notify("Amount tendered cannot be less than bill total.", "error");
            return;
        }

        onComplete(paymentsToSubmit, 'Change');
        setActivePaymentMethod(null);
    }, [splitPayments, typedAmount, total, onComplete, notify]);

    const addPaymentMethod = useCallback((accountId: string) => {
        const amountInput = parseFloat(currentPaymentAmount);
        if (isNaN(amountInput) || amountInput <= 0) {
            notify("Please enter a valid positive payment amount.", "error");
            return;
        }

        let method: string;
        if (accountId === 'WALLET') {
            if (amountInput > walletBalance) {
                notify(`Insufficient wallet balance. Available: ${currency}${formatNumber(walletBalance)}`, "error");
                return;
            }
            method = 'Wallet';
        } else if (accountId === 'LOYALTY') {
            const availableValue = loyaltyPoints * pointsConversionRate;
            if (amountInput > availableValue) {
                notify(`Insufficient loyalty points. Max value: ${currency}${formatNumber(availableValue)}`, "error");
                return;
            }
            method = 'Loyalty';
        } else if (accountId === 'CREDIT') {
            if (amountInput > creditStatus.available) {
                notify(`Insufficient credit limit. Available: ${currency}${formatNumber(creditStatus.available)}`, "error");
                return;
            }
            method = 'Credit';
        } else {
            const account = DEFAULT_ACCOUNTS.find(a => a.id === accountId);
            if (!account) return;
            method = account.name.includes('Cash') ? 'Cash' :
                (account.name.includes('Mobile') ? 'Mobile Money' : 'Bank Transfer');
        }

        const newSplit = [...splitPayments, { method, amount: amountInput, accountId }];
        setSplitPayments(newSplit);

        setActivePaymentMethod(accountId);

        const newPaid = newSplit.reduce((sum, p) => sum + p.amount, 0);
        const newRemaining = total - newPaid;

        if (newPaid > total) {
            setChangeDue(newPaid - total);
        } else {
            setChangeDue(0);
        }

        setRemainingDue(newRemaining > 0.01 ? newRemaining : 0);
        setCurrentPaymentAmount(newRemaining > 0.01 ? newRemaining.toFixed(2) : '');
    }, [currentPaymentAmount, splitPayments, total, notify]);

    useEffect(() => {
        const handleGlobalKeys = (e: KeyboardEvent) => {
            if (e.key === 'Enter' && canCompleteSale) handleComplete();
            if (e.altKey) {
                if (e.key === '1') addPaymentMethod('1000');
                if (e.key === '2') addPaymentMethod('1050');
                if (e.key === '3') addPaymentMethod('1060');
            }
        };
        window.addEventListener('keydown', handleGlobalKeys);
        return () => window.removeEventListener('keydown', handleGlobalKeys);
    }, [canCompleteSale, handleComplete, handleCancel, addPaymentMethod]);

    const normalizedBankAccounts = useMemo(() => {
        return (bankAccounts || []).filter(acc => acc.status !== 'Closed');
    }, [bankAccounts]);

    const resolveBankAccount = (
        tokens: string[],
        options?: { allowBankNameMatch?: boolean; excludeNameTokens?: string[] }
    ) => {
        if (normalizedBankAccounts.length === 0) return undefined;
        const loweredTokens = tokens.map(token => token.toLowerCase());
        const exclude = (options?.excludeNameTokens || []).map(token => token.toLowerCase());

        const byAccountNumber = normalizedBankAccounts.find(acc => {
            const accountNumber = (acc.accountNumber || '').toLowerCase();
            return loweredTokens.some(token => accountNumber.includes(token));
        });
        if (byAccountNumber) return byAccountNumber;

        const byName = normalizedBankAccounts.find(acc => {
            const name = (acc.name || '').toLowerCase();
            return loweredTokens.some(token => name.includes(token));
        });
        if (byName) return byName;

        if (!options?.allowBankNameMatch) return undefined;

        return normalizedBankAccounts.find(acc => {
            const name = (acc.name || '').toLowerCase();
            const bank = (acc.bankName || '').toLowerCase();
            if (exclude.some(token => name.includes(token))) return false;
            return loweredTokens.some(token => bank.includes(token));
        });
    };

    const cashBankAccount = useMemo(
        () => resolveBankAccount(['cash'], { allowBankNameMatch: false }),
        [normalizedBankAccounts]
    );
    const bankBankAccount = useMemo(
        () => resolveBankAccount(['bank'], { allowBankNameMatch: true, excludeNameTokens: ['cash', 'mobile', 'momo'] }),
        [normalizedBankAccounts]
    );
    const mobileBankAccount = useMemo(
        () => resolveBankAccount(['mobile', 'momo', 'money'], { allowBankNameMatch: true, excludeNameTokens: ['cash', 'bank'] }),
        [normalizedBankAccounts]
    );

    const cashBalance = cashBankAccount?.availableBalance ?? cashBankAccount?.balance;
    const bankBalance = bankBankAccount?.availableBalance ?? bankBankAccount?.balance;
    const mobileBalance = mobileBankAccount?.availableBalance ?? mobileBankAccount?.balance;
    const formatBalance = (value?: number) => (value === undefined ? '--' : `${currency}${formatNumber(value)}`);

    const hasAdjustments = adjustmentSummary && adjustmentSummary.length > 0;
    const adjustmentTotal = useMemo(() => {
        if (!adjustmentSummary || adjustmentSummary.length === 0) return 0;
        return adjustmentSummary.reduce((sum, adj) => sum + (adj.totalAmount || 0), 0);
    }, [adjustmentSummary]);
    const roundingTotal = Number.isFinite(_roundingAccumulation) ? _roundingAccumulation : 0;

    const creditStatus = useMemo(() => {
        if (!customerName) return { available: 0, blocked: true, reason: 'Walk-in' };
        const subLimit = 0;
        const currentBalance = (invoices || [])
            .filter((i: any) => i.customerName === customerName && i.status !== 'Paid' && i.status !== 'Draft' && i.status !== 'Cancelled')
            .reduce((acc: number, inv: any) => acc + ((inv.totalAmount || 0) - (inv.paidAmount || 0)), 0);
        const available = Math.max(0, subLimit - currentBalance);
        const blocked = true;
        return { available, blocked, reason: 'Credit Disabled', limit: subLimit };
    }, [customerName, invoices]);

    return (
        <div style={{
            position: 'fixed', inset: 0, zIndex: 9999,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'rgba(15, 23, 42, 0.6)',
            padding: '40px 20px', fontFamily: "'Inter','DM Sans',sans-serif", fontSize: 13.5, color: ink,
        }}>
            <div style={{
                width: 680, maxWidth: '100%', maxHeight: '92vh',
                background: paper, borderRadius: 14,
                boxShadow: '0 30px 70px -20px rgba(0,0,0,.55), 0 8px 24px -8px rgba(0,0,0,.35), 0 0 0 1px rgba(255,255,255,.04)',
                display: 'flex', flexDirection: 'column', overflow: 'hidden', position: 'relative'
            }}>
                <div style={{
                    position: 'absolute', top: 0, left: 0, right: 0, height: 4,
                    background: `linear-gradient(90deg, ${teal[600]}, ${teal[400]} 40%, ${amber[500]} 100%)`
                }} />

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '22px 28px 18px', borderBottom: `1px solid ${hairline}` }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                        <div style={{
                            width: 40, height: 40, borderRadius: 10,
                            background: `linear-gradient(155deg, ${teal[500]}, ${teal[700]})`,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            boxShadow: `0 4px 10px -3px rgba(15,84,76,.6)`, flexShrink: 0
                        }}>
                            <Wallet size={19} color="#fff" />
                        </div>
                        <div>
                            <h1 style={{ fontFamily: "'Inter','DM Sans',sans-serif", fontWeight: 400, fontSize: 22, margin: 0, color: teal[800], letterSpacing: 0.2 }}>Payment</h1>
                            <p style={{ margin: '2px 0 0', fontSize: 11.5, color: inkSoft, letterSpacing: 0.02 }}>{orderNumber}</p>
                        </div>
                    </div>
                    <button onClick={handleCancel} aria-label="Close" style={{
                        width: 32, height: 32, borderRadius: 8,
                        border: `1px solid ${hairline}`, background: paper, color: inkSoft,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        cursor: 'pointer', transition: 'all .15s ease'
                    }}
                        onMouseEnter={e => { e.currentTarget.style.background = teal[50]; e.currentTarget.style.color = teal[700]; e.currentTarget.style.borderColor = teal[200]; }}
                        onMouseLeave={e => { e.currentTarget.style.background = paper; e.currentTarget.style.color = inkSoft; e.currentTarget.style.borderColor = hairline; }}
                    ><X size={15} /></button>
                </div>

                <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
                    <div style={{ width: 240, background: teal[50], padding: '18px 16px 14px', borderRight: `1px solid ${hairline}`, display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
                        <div style={{ fontSize: 10, fontWeight: 700, color: inkSoft, textTransform: 'uppercase', letterSpacing: 0.08, marginBottom: 2 }}>Order total</div>
                        <div style={{ padding: '8px 0 12px', borderBottom: `1px dashed ${teal[200]}`, marginBottom: 10 }}>
                            <div style={{ fontSize: 11, color: inkSoft }}>Due</div>
                            <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 22, fontWeight: 700, color: ink, marginTop: 2 }}>
                                {currency}{formatNumber(total || 0)}
                            </div>
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '4px 0', fontSize: 13 }}>
                            <span style={{ color: inkSoft }}>Adjustments</span>
                            <span style={{ fontFamily: "'JetBrains Mono',monospace", fontWeight: 600, color: ink }}>+{currency}{formatNumber(adjustmentTotal)}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '4px 0', fontSize: 13 }}>
                            <span style={{ color: inkSoft }}>Margin</span>
                            <span style={{ fontFamily: "'JetBrains Mono',monospace", fontWeight: 600, color: teal[600] }}>{currency}{formatNumber(totalProfitMargin)}</span>
                        </div>

                        <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 0.08, textTransform: 'uppercase', color: inkSoft, margin: '12px 0 5px' }}>Balances</div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: paper, border: `1px solid ${hairline}`, borderRadius: 7, padding: '6px 10px', fontSize: 12.5 }}>
                                <span style={{ color: ink, fontWeight: 600 }}>Cash</span>
                                <span style={{ fontFamily: "'JetBrains Mono',monospace", color: inkSoft }}>{formatBalance(cashBalance)}</span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: paper, border: `1px solid ${hairline}`, borderRadius: 7, padding: '6px 10px', fontSize: 12.5 }}>
                                <span style={{ color: ink, fontWeight: 600 }}>Bank</span>
                                <span style={{ fontFamily: "'JetBrains Mono',monospace", color: inkSoft }}>{formatBalance(bankBalance)}</span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: paper, border: `1px solid ${hairline}`, borderRadius: 7, padding: '6px 10px', fontSize: 12.5 }}>
                                <span style={{ color: ink, fontWeight: 600 }}>Mobile</span>
                                <span style={{ fontFamily: "'JetBrains Mono',monospace", color: inkSoft }}>{formatBalance(mobileBalance)}</span>
                            </div>
                        </div>

                        <div style={{ marginTop: 'auto', paddingTop: 12 }}>
                            <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 0.08, textTransform: 'uppercase', color: teal[600] }}>{changeDue > 0 ? 'Change' : 'Remaining'}</div>
                            <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 24, fontWeight: 700, color: teal[600], marginTop: 2 }}>
                                {changeDue > 0 ? currency + formatNumber(changeDue) : currency + formatNumber(effectiveRemainingDue || 0)}
                            </div>
                        </div>
                    </div>

                    <div style={{ flex: 1, padding: '18px 22px 14px', display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                        <div style={{ fontSize: 10, fontWeight: 700, color: inkSoft, textTransform: 'uppercase', letterSpacing: 0.08, marginBottom: 6 }}>Amount received</div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
                            <div style={{ flex: 1, display: 'flex', alignItems: 'center', border: `1.4px solid ${hairline}`, borderRadius: 9, padding: '0 14px', height: 48 }}>
                                <span style={{ fontFamily: "'JetBrains Mono',monospace", fontWeight: 600, color: inkSoft, marginRight: 8, fontSize: 17 }}>{currency}</span>
                                <input type="text" inputMode="decimal"
                                    style={{ border: 'none', outline: 'none', fontFamily: "'JetBrains Mono',monospace", fontSize: 17, fontWeight: 500, width: '100%', color: ink, background: 'transparent' }}
                                    placeholder="0.00" value={currentPaymentAmount}
                                    onChange={e => { const val = e.target.value; if (val === '' || /^\d*\.?\d*$/.test(val)) setCurrentPaymentAmount(val); }}
                                    autoFocus />
                            </div>
                            <div style={{ textAlign: 'right' }}>
                                <div style={{ fontSize: 9, fontWeight: 700, color: inkSoft, textTransform: 'uppercase', letterSpacing: 0.06 }}>Remaining</div>
                                <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 17, fontWeight: 700, color: teal[600] }}>
                                    {currency}{formatNumber(effectiveRemainingDue || 0)}
                                </div>
                            </div>
                        </div>

                        <div style={{ fontSize: 10, fontWeight: 700, color: inkSoft, textTransform: 'uppercase', letterSpacing: 0.08, marginBottom: 6 }}>Payment method</div>
                        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
                            {[
                                { id: '1000', icon: Banknote, label: 'Cash' },
                                { id: '1050', icon: CreditCard, label: 'Bank' },
                                { id: '1060', icon: Smartphone, label: 'Mobile' },
                            ].map(btn => {
                                const isActive = activePaymentMethod === btn.id;
                                const Icon = btn.icon;
                                return (
                                    <button key={btn.id} onClick={() => addPaymentMethod(btn.id)}
                                        style={{
                                            flex: 1, display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'center',
                                            border: `1.4px solid ${isActive ? teal[400] : hairline}`,
                                            borderRadius: 8, padding: '10px 8px', fontSize: 13, fontWeight: 600,
                                            color: isActive ? teal[600] : ink, cursor: 'pointer',
                                            background: isActive ? teal[50] : paper, transition: 'all .12s',
                                            fontFamily: 'inherit'
                                        }}>
                                        <Icon size={17} /> {btn.label}
                                    </button>
                                );
                            })}
                            {customerName && walletBalance > 0 && (
                                <button onClick={() => addPaymentMethod('WALLET')}
                                    style={{
                                        flex: 1, display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'center',
                                        border: `1.4px solid ${activePaymentMethod === 'WALLET' ? teal[400] : hairline}`,
                                        borderRadius: 8, padding: '10px 8px', fontSize: 13, fontWeight: 600,
                                        color: activePaymentMethod === 'WALLET' ? teal[600] : ink, cursor: 'pointer',
                                        background: activePaymentMethod === 'WALLET' ? teal[50] : paper, transition: 'all .12s',
                                        fontFamily: 'inherit'
                                    }}>
                                    <Wallet size={17} /> Wallet
                                </button>
                            )}
                            {customerName && loyaltyPoints > 0 && (
                                <button onClick={() => addPaymentMethod('LOYALTY')}
                                    style={{
                                        flex: 1, display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'center',
                                        border: `1.4px solid ${activePaymentMethod === 'LOYALTY' ? teal[400] : hairline}`,
                                        borderRadius: 8, padding: '10px 8px', fontSize: 13, fontWeight: 600,
                                        color: activePaymentMethod === 'LOYALTY' ? teal[600] : ink, cursor: 'pointer',
                                        background: activePaymentMethod === 'LOYALTY' ? teal[50] : paper, transition: 'all .12s',
                                        fontFamily: 'inherit'
                                    }}>
                                    <Award size={17} /> Loyalty
                                </button>
                            )}
                        </div>

                        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
                            {[
                                { label: 'Exact', onClick: () => setCurrentPaymentAmount(Number.isFinite(total) ? total.toFixed(2) : '') },
                                { label: `+${currency}5,000`, onClick: () => setCurrentPaymentAmount(prev => (Number(prev) + 5000).toFixed(2)) },
                                { label: `+${currency}10,000`, onClick: () => setCurrentPaymentAmount(prev => (Number(prev) + 10000).toFixed(2)) },
                            ].map(q => (
                                <div key={q.label} onClick={q.onClick}
                                    style={{ flex: 1, textAlign: 'center', padding: '8px 0', border: `1.4px solid ${hairline}`, borderRadius: 7, fontFamily: "'JetBrains Mono',monospace", fontSize: 12.5, color: inkSoft, cursor: 'pointer' }}>
                                    {q.label}
                                </div>
                            ))}
                        </div>

                        {splitPayments.length > 0 && (
                            <div style={{ marginBottom: 12 }}>
                                <div style={{ fontSize: 10, fontWeight: 700, color: inkSoft, textTransform: 'uppercase', letterSpacing: 0.08, marginBottom: 5 }}>Payment Breakdown</div>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                                    {splitPayments.map((p, i) => (
                                        <div key={i} style={{ background: teal[50], padding: '5px 10px', borderRadius: 7, display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, border: `1px solid ${teal[100]}` }}>
                                            <span style={{ fontWeight: 600, color: teal[600] }}>{p.method}</span>
                                            <span style={{ fontFamily: "'JetBrains Mono',monospace", fontWeight: 600, color: ink }}>{currency}{formatNumber(p.amount)}</span>
                                            <button onClick={() => {
                                                setSplitPayments(prev => prev.filter((_, idx) => idx !== i));
                                                setActivePaymentMethod(null);
                                                const totalPaid = splitPayments.filter((_, idx) => idx !== i).reduce((s, x) => s + x.amount, 0);
                                                setRemainingDue(total - totalPaid);
                                                setChangeDue(0);
                                                setCurrentPaymentAmount((total - totalPaid).toFixed(2));
                                            }} style={{ border: 'none', background: 'none', cursor: 'pointer', color: inkSoft, padding: 0, fontSize: 14 }}>&times;</button>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {changeDue > 0 && (
                            <div style={{ background: teal[50], border: `1px solid ${teal[200]}`, borderRadius: 8, padding: '8px 12px', marginBottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span style={{ fontSize: 12, fontWeight: 600, color: teal[600] }}>Change due</span>
                                <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 17, fontWeight: 700, color: teal[600] }}>{currency}{formatNumber(changeDue)}</span>
                            </div>
                        )}

                        <div style={{ flex: 1 }} />
                        <button onClick={handleComplete} disabled={!canCompleteSale}
                            style={{
                                width: '100%', border: 'none', borderRadius: 9, padding: '13px 0',
                                fontFamily: "'Inter', sans-serif", fontSize: 14, fontWeight: 600,
                                background: canCompleteSale ? `linear-gradient(155deg, ${teal[500]}, ${teal[700]})` : teal[50],
                                color: canCompleteSale ? '#fff' : inkSoft,
                                cursor: canCompleteSale ? 'pointer' : 'default',
                                boxShadow: canCompleteSale ? '0 6px 16px -6px rgba(15,84,76,.55)' : 'none',
                                transition: 'all .15s'
                            }}>
                            {!canCompleteSale ? 'Awaiting payment' : 'Complete Sale'}
                        </button>
                    </div>
                </div>

                <div onClick={handleCancel} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '11px 24px', borderTop: `1px solid ${hairline}`, fontSize: 13, color: inkSoft, cursor: 'pointer' }}>
                    &larr; Back to register
                </div>
            </div>
        </div>
    );
};
