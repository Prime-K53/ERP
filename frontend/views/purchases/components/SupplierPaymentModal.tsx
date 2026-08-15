import React, { useState } from 'react';
import { X, Banknote, CreditCard, Smartphone, Send, ChevronRight } from 'lucide-react';
import { Purchase, SupplierPayment } from '../../../types';
import { DEFAULT_ACCOUNTS } from '../../../constants';

interface SupplierPaymentModalProps {
    purchase: Purchase;
    onClose: () => void;
    onRecord: (payment: SupplierPayment) => void;
}

const teal: Record<string, string> = { 50: '#eef7f6', 100: '#d3ece9', 200: '#a6d9d3', 300: '#72c0b7', 400: '#3fa294', 500: '#1f8577', 600: '#146b60', 700: '#0f544c', 800: '#0b3e39', 900: '#082e2a' };
const amber: Record<string, string> = { 100: '#fbead0', 300: '#eec27a', 500: '#d99a3f', 600: '#b97e2b' };
const paper = '#FEFDFB';
const ink = '#23282A';
const inkSoft = '#5c6567';
const hairline = '#e4ddd1';

export const SupplierPaymentModal: React.FC<SupplierPaymentModalProps> = ({ purchase, onClose, onRecord }) => {
    const remainingBalance = purchase.total - (purchase.paidAmount || 0);
    const [amount, setAmount] = useState(remainingBalance.toString());
    const [selectedAccountId, setSelectedAccountId] = useState('1000');

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        const paymentAmount = parseFloat(amount);
        if (isNaN(paymentAmount) || paymentAmount <= 0) {
            alert("Please enter a valid positive amount.");
            return;
        }
        const selectedAccount = DEFAULT_ACCOUNTS.find(a => a.id === selectedAccountId);
        const payment: SupplierPayment = {
            id: '',
            date: new Date().toISOString(),
            supplierId: purchase.supplierId,
            amount: paymentAmount,
            accountId: selectedAccountId,
            paymentMethod: selectedAccount?.name.includes('Cash') ? 'Cash' :
                (selectedAccount?.name.includes('Mobile') ? 'Mobile Money' : 'Bank'),
            status: 'Cleared',
            reconciled: false,
            allocations: [{ purchaseId: purchase.id, amount: paymentAmount }]
        };
        onRecord(payment);
    };

    const getIcon = (accountId: string) => {
        if (accountId === '1000') return <Banknote size={18} />;
        if (accountId === '1050') return <CreditCard size={18} />;
        if (accountId === '1060') return <Smartphone size={18} />;
        return null;
    };

    return (
        <div style={{
            position: 'fixed', inset: 0, zIndex: 9999,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'rgba(15, 23, 42, 0.6)',
            padding: '40px 20px', fontFamily: "'Inter','DM Sans',sans-serif", fontSize: 13.5, color: ink,
        }}>
            <div style={{
                width: 440, maxWidth: '100%', maxHeight: '92vh',
                background: paper, borderRadius: 14,
                boxShadow: '0 30px 70px -20px rgba(0,0,0,.55), 0 8px 24px -8px rgba(0,0,0,.35), 0 0 0 1px rgba(255,255,255,.04)',
                display: 'flex', flexDirection: 'column', overflow: 'hidden', position: 'relative'
            }}>
                <div style={{
                    position: 'absolute', top: 0, left: 0, right: 0, height: 4,
                    background: `linear-gradient(90deg, ${teal[600]}, ${teal[400]} 40%, ${amber[500]} 100%)`
                }} />

                <div style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '22px 28px 18px',
                    borderBottom: `1px solid ${hairline}`,
                    background: paper
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                        <div style={{
                            width: 40, height: 40, borderRadius: 10,
                            background: `linear-gradient(155deg, ${teal[500]}, ${teal[700]})`,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            boxShadow: `0 4px 10px -3px rgba(15,84,76,.6)`, flexShrink: 0
                        }}>
                            <Send size={19} color="#fff" style={{ transform: 'rotate(-45deg)' }} />
                        </div>
                        <div>
                            <h1 style={{
                                fontFamily: "'DM Serif Display', 'Georgia', serif", fontWeight: 400,
                                fontSize: 22, margin: 0, color: teal[800], letterSpacing: 0.2
                            }}>
                                Record Supplier Payment
                            </h1>
                            <p style={{ margin: '2px 0 0', fontSize: 11.5, color: inkSoft, letterSpacing: 0.02 }}>
                                Bill #{purchase.id} · Balance: ${remainingBalance.toLocaleString()}
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

                <form id="supplier-payment-form" onSubmit={handleSubmit} style={{ padding: '22px 28px 18px', display: 'flex', flexDirection: 'column', gap: 18 }}>
                    <div>
                        <div style={{ fontSize: 10, fontWeight: 700, color: inkSoft, textTransform: 'uppercase', letterSpacing: 0.08, marginBottom: 6 }}>Payment Amount</div>
                        <div style={{ position: 'relative' }}>
                            <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: inkSoft, fontWeight: 700, fontSize: 18 }}>$</span>
                            <input
                                autoFocus
                                type="number"
                                step="0.01"
                                value={amount}
                                onChange={(e) => setAmount(e.target.value)}
                                placeholder="0.00"
                                style={{
                                    ...inputStyle,
                                    fontFamily: "'JetBrains Mono',monospace",
                                    fontSize: 20,
                                    fontWeight: 700,
                                    paddingLeft: 28
                                }}
                            />
                        </div>
                    </div>

                    <div>
                        <div style={{ fontSize: 10, fontWeight: 700, color: inkSoft, textTransform: 'uppercase', letterSpacing: 0.08, marginBottom: 8 }}>Payment Account</div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                            {DEFAULT_ACCOUNTS.filter(a => ['1000', '1050', '1060'].includes(a.id)).map(account => {
                                const isActive = selectedAccountId === account.id;
                                const Icon = getIcon(account.id);
                                return (
                                    <button
                                        key={account.id}
                                        type="button"
                                        onClick={() => setSelectedAccountId(account.id)}
                                        style={{
                                            display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px',
                                            borderRadius: 9, border: `1.4px solid ${isActive ? teal[400] : hairline}`,
                                            background: isActive ? teal[50] : paper, cursor: 'pointer', transition: 'all .15s ease',
                                            fontFamily: 'inherit', fontSize: 13, textAlign: 'left'
                                        }}
                                    >
                                        <div style={{
                                            width: 36, height: 36, borderRadius: 8,
                                            background: isActive ? teal[100] : teal[50],
                                            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                                            color: isActive ? teal[600] : inkSoft
                                        }}>
                                            {Icon}
                                        </div>
                                        <div style={{ flex: 1 }}>
                                            <div style={{ fontWeight: 600, color: isActive ? teal[600] : ink }}>{account.name}</div>
                                            <div style={{ fontSize: 11, color: inkSoft, letterSpacing: 0.04 }}>{account.code}</div>
                                        </div>
                                        {isActive && (
                                            <div style={{
                                                width: 20, height: 20, borderRadius: '50%',
                                                background: teal[500], display: 'flex', alignItems: 'center', justifyContent: 'center'
                                            }}>
                                                <div style={{ width: 8, height: 8, borderRadius: '50%', background: paper }} />
                                            </div>
                                        )}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                </form>

                <div style={{
                    display: 'flex', gap: 10, padding: '16px 28px',
                    borderTop: `1px solid ${hairline}`, background: paper
                }}>
                    <button
                        type="button"
                        onClick={onClose}
                        style={{
                            fontFamily: "'Inter', sans-serif", fontSize: 13, fontWeight: 600,
                            padding: '9px 18px', borderRadius: 9, cursor: 'pointer',
                            background: paper, border: `1.4px solid ${hairline}`, color: inkSoft,
                            display: 'flex', alignItems: 'center', gap: 7, transition: 'all .15s ease'
                        }}
                        onMouseEnter={e => { e.currentTarget.style.background = teal[50]; e.currentTarget.style.color = teal[800]; e.currentTarget.style.borderColor = teal[200]; }}
                        onMouseLeave={e => { e.currentTarget.style.background = paper; e.currentTarget.style.color = inkSoft; e.currentTarget.style.borderColor = hairline; }}>
                        Cancel
                    </button>
                    <button
                        type="submit"
                        form="supplier-payment-form"
                        style={{
                            fontFamily: "'Inter', sans-serif", fontSize: 13, fontWeight: 600,
                            padding: '9px 18px', borderRadius: 9, cursor: 'pointer', border: '1.4px solid transparent',
                            background: `linear-gradient(155deg, ${teal[500]}, ${teal[700]})`,
                            color: '#fff', display: 'flex', alignItems: 'center', gap: 7,
                            boxShadow: `0 6px 16px -6px rgba(15,84,76,.55)`,
                            transition: 'all .15s ease'
                        }}
                        onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 8px 20px -6px rgba(15,84,76,.65)'; }}
                        onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 6px 16px -6px rgba(15,84,76,.55)'; }}>
                        Record Payment
                        <ChevronRight size={14} />
                    </button>
                </div>
            </div>
        </div>
    );
};

const inputStyle: React.CSSProperties = {
    width: '100%', fontFamily: "'Inter', sans-serif", fontSize: 13.5,
    color: ink, background: paper,
    border: `1.4px solid ${hairline}`, borderRadius: 9,
    padding: '9px 12px', outline: 'none',
    transition: 'border-color .15s ease, box-shadow .15s ease, background .15s ease'
};

export default SupplierPaymentModal;
