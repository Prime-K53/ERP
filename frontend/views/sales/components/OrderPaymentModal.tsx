import React, { useState, useEffect } from 'react';
import { DollarSign, Wallet, CreditCard, Smartphone, Banknote, Package, User, Hash, Calendar, X, ChevronRight } from 'lucide-react';
import { Order } from '../../../types';
import { DEFAULT_ACCOUNTS, ACCOUNT_IDS } from '../../../constants';
import { currencyService } from '../../../services/currencyService';
import { useAuth } from '../../../context/AuthContext';

interface OrderPaymentModalProps {
    order: Order;
    onClose: () => void;
    onRecord: (orderId: string, payment: {
        amountPaid: number;
        paymentMethod: string;
        reference: string;
    }) => Promise<void>;
}

const teal: Record<string, string> = { 50: '#eef7f6', 100: '#d3ece9', 200: '#a6d9d3', 300: '#72c0b7', 400: '#3fa294', 500: '#1f8577', 600: '#146b60', 700: '#0f544c', 800: '#0b3e39', 900: '#082e2a' };
const amber: Record<string, string> = { 100: '#fbead0', 300: '#eec27a', 500: '#d99a3f', 600: '#b97e2b' };
const paper = '#FEFDFB';
const ink = '#23282A';
const inkSoft = '#5c6567';
const hairline = '#e4ddd1';
const danger = '#b5493f';

const inputRest: React.CSSProperties = {
  width: '100%', fontFamily: "'Inter', sans-serif", fontSize: 13.5,
  color: ink, background: paper,
  border: `1.4px solid ${hairline}`, borderRadius: 9,
  padding: '9px 12px', outline: 'none',
  transition: 'border-color .15s ease, box-shadow .15s ease, background .15s ease'
};

export const OrderPaymentModal: React.FC<OrderPaymentModalProps> = ({ order, onClose, onRecord }) => {
    const { companyConfig, notify } = useAuth();
    const remainingBalance = Math.max(0, (order.totalAmount || 0) - (order.paidAmount || 0));
    const currency = companyConfig?.currencySymbol || currencyService.getCurrency(currencyService.getBaseCurrency())?.symbol || '$';
    const fmt = (n: number) => currency + n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    const [amount, setAmount] = useState(remainingBalance > 0 ? remainingBalance.toFixed(2) : '');
    const [selectedAccountId, setSelectedAccountId] = useState(ACCOUNT_IDS.CASH_DRAWER);
    const [reference, setReference] = useState(`Payment for Order #${order.orderNumber || order.id}`);
    const [isSubmitting, setIsSubmitting] = useState(false);

    useEffect(() => {
        if (remainingBalance > 0) setAmount(remainingBalance.toFixed(2));
    }, [remainingBalance]);

    const paymentAmount = parseFloat(amount);
    const isAmountValid = !isNaN(paymentAmount) && paymentAmount > 0;
    const exceedsBalance = isAmountValid && paymentAmount > remainingBalance + 0.01;
    const canSubmit = isAmountValid && !exceedsBalance && !isSubmitting;
    const isFullyPaid = remainingBalance <= 0;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!isAmountValid) {
            notify('Please enter a valid positive amount.', 'error');
            return;
        }
        if (exceedsBalance) {
            notify(`Amount exceeds remaining balance of ${fmt(remainingBalance)}`, 'error');
            return;
        }

        const selectedAccount = DEFAULT_ACCOUNTS.find(a => a.id === selectedAccountId);
        const paymentMethod = selectedAccount?.name.includes('Cash') ? 'Cash' :
            selectedAccount?.name.includes('Mobile') ? 'Mobile Money' : 'Bank Transfer';

        setIsSubmitting(true);
        try {
            await onRecord(order.id, {
                amountPaid: paymentAmount,
                paymentMethod,
                reference
            });
            onClose();
        } catch (error: any) {
            notify(`Payment failed: ${error.message}`, 'error');
        } finally {
            setIsSubmitting(false);
        }
    };

    const getIcon = (accountId: string) => {
        if (accountId === ACCOUNT_IDS.CASH_DRAWER) return <Banknote size={18} />;
        if (accountId === ACCOUNT_IDS.BANK) return <CreditCard size={18} />;
        if (accountId === ACCOUNT_IDS.MOBILE_MONEY) return <Smartphone size={18} />;
        return <Wallet size={18} />;
    };

    const paymentAccounts = DEFAULT_ACCOUNTS.filter(a => [ACCOUNT_IDS.CASH_DRAWER, ACCOUNT_IDS.BANK, ACCOUNT_IDS.MOBILE_MONEY].includes(a.id));

    const InfoRow = ({ icon: Icon, label, value, accent = false }: any) => (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 0' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: inkSoft }}>
                <Icon size={13} />
                <span style={{ fontSize: 12, fontWeight: 500 }}>{label}</span>
            </div>
            <span style={{ fontSize: 13, fontWeight: 600, color: accent ? teal[600] : ink, fontFamily: "'JetBrains Mono', monospace", fontVariantNumeric: 'tabular-nums' }}>
                {value}
            </span>
        </div>
    );

    return (
        <div className="sales-modal-backdrop" style={{ fontFamily: "'Inter','DM Sans',sans-serif", fontSize: 13.5, color: ink }}>
            <div className="sales-modal-panel">
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
                            <DollarSign size={19} color="#fff" />
                        </div>
                        <div>
                            <h1 className="sales-detail-title">
                                Record Payment
                            </h1>
                            <p style={{ margin: '2px 0 0', fontSize: 11.5, color: inkSoft, letterSpacing: 0.02 }}>
                                Receive payment against this order
                            </p>
                        </div>
                    </div>
                    <button onClick={onClose} aria-label="Close" style={{
                        width: 32, height: 32, borderRadius: 8,
                        border: `1px solid ${hairline}`, background: paper, color: inkSoft,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        cursor: 'pointer', transition: 'all .15s ease', fontSize: 16
                    }}
                        onMouseEnter={e => { e.currentTarget.style.background = teal[50]; e.currentTarget.style.color = teal[700]; e.currentTarget.style.borderColor = teal[200]; }}
                        onMouseLeave={e => { e.currentTarget.style.background = paper; e.currentTarget.style.color = inkSoft; e.currentTarget.style.borderColor = hairline; }}
                    >
                        <X size={15} />
                    </button>
                </div>

                <div style={{ display: 'flex', flex: 1, minHeight: 0, flexDirection: 'column' }}>
                    {/* Order Summary - hidden on mobile, shown as compact bar */}
                    <div className="hidden sm:block" style={{
                        width: 260, flexShrink: 0,
                        padding: 20,
                        borderRight: `1px solid ${hairline}`,
                        background: teal[50]
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
                            <div style={{ width: 36, height: 36, borderRadius: 10, background: teal[100], color: teal[600], display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <Package size={18} />
                            </div>
                            <div>
                                <div style={{ fontSize: 11, fontWeight: 700, color: inkSoft, textTransform: 'uppercase', letterSpacing: 0.06 }}>Order</div>
                                <div style={{ fontSize: 15, fontWeight: 700, color: ink, lineHeight: 1.2 }}>#{order.orderNumber || order.id}</div>
                            </div>
                        </div>

                        <div>
                            <InfoRow icon={User} label="Customer" value={order.customerName || 'N/A'} />
                            <InfoRow icon={Calendar} label="Order Date" value={new Date(order.orderDate || order.date).toLocaleDateString()} />
                            <InfoRow icon={Hash} label="Status" value={order.status} accent={order.status === 'Completed' || order.status === 'Paid'} />
                        </div>

                        <div style={{ marginTop: 16, paddingTop: 16, borderTop: `1px solid ${hairline}` }}>
                            <InfoRow icon={DollarSign} label="Total Amount" value={fmt(order.totalAmount || 0)} />
                            <InfoRow icon={DollarSign} label="Paid Amount" value={fmt(order.paidAmount || 0)} accent={order.paidAmount > 0} />
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 0' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: inkSoft }}>
                                    <DollarSign size={13} />
                                    <span style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.06 }}>Balance Due</span>
                                </div>
                                <span style={{ fontSize: 15, fontWeight: 700, color: danger, fontFamily: "'JetBrains Mono', monospace", fontVariantNumeric: 'tabular-nums' }}>
                                    {fmt(remainingBalance)}
                                </span>
                            </div>
                        </div>

                        {isFullyPaid && (
                            <div style={{ marginTop: 16, padding: 12, borderRadius: 8, background: '#ecfdf5', border: '1px solid rgba(5,150,105,.2)' }}>
                                <p style={{ margin: 0, fontSize: 11, fontWeight: 700, color: '#059669', textTransform: 'uppercase', letterSpacing: 0.06, textAlign: 'center' }}>Fully Paid</p>
                            </div>
                        )}
                    </div>

                    {/* Mobile compact order summary */}
                    <div className="sm:hidden" style={{ padding: '12px 16px', background: teal[50], borderBottom: `1px solid ${hairline}` }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <Package size={16} color={teal[600]} />
                                <span style={{ fontSize: 13, fontWeight: 700, color: ink }}>#{order.orderNumber || order.id}</span>
                            </div>
                            <div style={{ textAlign: 'right' }}>
                                <span style={{ fontSize: 11, color: inkSoft }}>Due: </span>
                                <span style={{ fontSize: 15, fontWeight: 700, color: danger, fontFamily: "'JetBrains Mono', monospace" }}>{fmt(remainingBalance)}</span>
                            </div>
                        </div>
                    </div>

                    {/* Right Panel - Payment Form */}
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                        {isFullyPaid ? (
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 200 }}>
                                <div style={{ textAlign: 'center' }}>
                                    <div style={{ width: 48, height: 48, borderRadius: '50%', background: '#ecfdf5', color: '#059669', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px' }}>
                                        <DollarSign size={24} />
                                    </div>
                                    <p style={{ fontSize: 14, fontWeight: 600, color: ink }}>Order is fully settled</p>
                                    <p style={{ fontSize: 12, color: inkSoft, marginTop: 4 }}>No further payment is required.</p>
                                </div>
                            </div>
                        ) : (
                            <form onSubmit={handleSubmit} style={{ padding: '16px', overflowY: 'auto', flex: 1 }}>
                                <div style={{ marginBottom: 20 }}>
                                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600, color: teal[800], marginBottom: 6, letterSpacing: 0.01 }}>
                                        Payment Amount
                                    </label>
                                    <div style={{ position: 'relative' }}>
                                        <div style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: inkSoft }}>
                                            <DollarSign size={16} />
                                        </div>
                                        <input
                                            autoFocus type="number" step="0.01"
                                            value={amount}
                                            onChange={(e) => setAmount(e.target.value)}
                                            placeholder="0.00"
                                            style={{
                                                ...inputRest, paddingLeft: 34, textAlign: 'right',
                                                fontFamily: "'JetBrains Mono', monospace", fontVariantNumeric: 'tabular-nums'
                                            }}
                                        />
                                    </div>
                                    {exceedsBalance && (
                                        <p style={{ margin: '6px 0 0', fontSize: 11, fontWeight: 500, color: danger, display: 'flex', alignItems: 'center', gap: 4 }}>
                                            <span style={{ width: 4, height: 4, borderRadius: '50%', background: danger }} />
                                            Cannot exceed remaining balance
                                        </p>
                                    )}
                                    <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                                        <button type="button" onClick={() => setAmount(remainingBalance.toFixed(2))}
                                            style={{
                                                flex: 1, padding: '7px 0', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.04,
                                                border: `1.4px solid ${hairline}`, borderRadius: 8, background: paper, color: inkSoft, cursor: 'pointer'
                                            }}>
                                            Exact
                                        </button>
                                        <button type="button" onClick={() => setAmount((paymentAmount + 5000).toFixed(2))}
                                            style={{
                                                flex: 1, padding: '7px 0', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.04,
                                                border: `1.4px solid ${hairline}`, borderRadius: 8, background: paper, color: inkSoft, cursor: 'pointer'
                                            }}>
                                            +{currency}5k
                                        </button>
                                        <button type="button" onClick={() => setAmount((paymentAmount + 10000).toFixed(2))}
                                            style={{
                                                flex: 1, padding: '7px 0', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.04,
                                                border: `1.4px solid ${hairline}`, borderRadius: 8, background: paper, color: inkSoft, cursor: 'pointer'
                                            }}>
                                            +{currency}10k
                                        </button>
                                    </div>
                                </div>

                                <div style={{ marginBottom: 20 }}>
                                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600, color: teal[800], marginBottom: 6, letterSpacing: 0.01 }}>
                                        Payment Method
                                    </label>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                        {paymentAccounts.map(account => {
                                            const active = selectedAccountId === account.id;
                                            return (
                                                <button key={account.id} type="button"
                                                    onClick={() => setSelectedAccountId(account.id)}
                                                    style={{
                                                        display: 'flex', alignItems: 'center', gap: 14,
                                                        padding: 12, borderRadius: 10,
                                                        border: `2px solid ${active ? teal[500] : hairline}`,
                                                        background: active ? teal[50] : paper,
                                                        cursor: 'pointer', transition: 'all .15s ease',
                                                        textAlign: 'left'
                                                    }}>
                                                    <div style={{
                                                        padding: 6, borderRadius: 8,
                                                        background: active ? `${teal[500]}15` : hairline,
                                                        color: active ? teal[600] : inkSoft
                                                    }}>
                                                        {getIcon(account.id)}
                                                    </div>
                                                    <div style={{ flex: 1, minWidth: 0 }}>
                                                        <div style={{ fontSize: 13, fontWeight: 600, color: active ? teal[600] : ink }}>{account.name}</div>
                                                        <div style={{ fontSize: 11, fontWeight: 500, color: inkSoft, textTransform: 'uppercase', letterSpacing: 0.04, marginTop: 2 }}>{account.code}</div>
                                                    </div>
                                                    {active && (
                                                        <div style={{ width: 18, height: 18, borderRadius: '50%', background: teal[500], display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                                            <div style={{ width: 6, height: 6, background: paper, borderRadius: '50%' }} />
                                                        </div>
                                                    )}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>

                                <div style={{ marginBottom: 20 }}>
                                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600, color: teal[800], marginBottom: 6, letterSpacing: 0.01 }}>
                                        Reference
                                    </label>
                                    <input type="text" value={reference}
                                        onChange={(e) => setReference(e.target.value)}
                                        placeholder="e.g., Payment reference"
                                        style={inputRest} />
                                </div>

                                <div style={{ display: 'flex', gap: 10, paddingTop: 4 }}>
                                    <button type="button" onClick={onClose}
                                        style={{
                                            fontFamily: "'Inter', sans-serif", fontSize: 13, fontWeight: 600,
                                            padding: '9px 18px', borderRadius: 9, cursor: 'pointer',
                                            background: paper, border: `1.4px solid ${hairline}`, color: inkSoft,
                                            flex: 1, transition: 'all .15s ease'
                                        }}
                                        onMouseEnter={e => { e.currentTarget.style.background = teal[50]; e.currentTarget.style.color = teal[800]; e.currentTarget.style.borderColor = teal[200]; }}
                                        onMouseLeave={e => { e.currentTarget.style.background = paper; e.currentTarget.style.color = inkSoft; e.currentTarget.style.borderColor = hairline; }}>
                                        Cancel
                                    </button>
                                    <button type="submit" disabled={!canSubmit}
                                        style={{
                                            fontFamily: "'Inter', sans-serif", fontSize: 13, fontWeight: 600,
                                            padding: '9px 18px', borderRadius: 9, cursor: 'pointer', border: '1.4px solid transparent',
                                            background: `linear-gradient(155deg, ${teal[500]}, ${teal[700]})`,
                                            color: '#fff', display: 'flex', alignItems: 'center', gap: 7, justifyContent: 'center',
                                            boxShadow: `0 6px 16px -6px rgba(15,84,76,.55)`,
                                            flex: 2, transition: 'all .15s ease', opacity: canSubmit ? 1 : 0.6
                                        }}
                                        onMouseEnter={e => { if (canSubmit) { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 8px 20px -6px rgba(15,84,76,.65)'; } }}
                                        onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 6px 16px -6px rgba(15,84,76,.55)'; }}>
                                        {isSubmitting ? 'Recording…' : 'Record Payment'}
                                        <ChevronRight size={14} />
                                    </button>
                                </div>
                            </form>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};
