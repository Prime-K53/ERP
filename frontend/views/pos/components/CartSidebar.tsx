import React, { useMemo, useState, useEffect } from 'react';
import { ShoppingCart, User, Plus, Minus, ShoppingBag, UserPlus, ChevronRight, X } from 'lucide-react';
import { CartItem, Sale } from '../../../types';
import { useAuth } from '../../../context/AuthContext';
import { useFinance } from '../../../context/FinanceContext';
import { PrintJobCartCard } from '../../../components/printing/PrintJobCartCard';

import { formatNumber, generateNextId } from '../../../utils/helpers';
import { roundToNearest, roundUpToStep } from '../../../utils/roundingUtils';
import { displayPrice } from '../../../services/pricingDisplayService';
import { resolveItemAdjustmentSnapshots, getMarketAdjustmentSnapshots } from '../../../utils/pricingBreakdown';

const B7 = '#2563EB';
const B6 = '#1D4ED8';
const B100 = '#DBEAFE';
const B50 = '#EFF6FF';
const PAPER = '#faf9f6';
const INK = '#16211f';
const SOFT = '#5c6b68';
const LINE = '#e1e5e2';
const AMBER = '#b8863f';
const RED = '#b3402f';
const GREEN = '#1f7a52';

interface CartSidebarProps {
    cart: CartItem[];
    sales: Sale[];
    selectedCustomerName: string | null;
    selectedSubAccount: string;
    setSelectedSubAccount: (val: string) => void;
    onSelectCustomer: () => void;
    updateQuantity: (id: string, delta: number, isAbsolute?: boolean) => void;
    updatePrice: (id: string, newPrice: number) => void;
    resetPriceOverride: (id: string) => void | Promise<void>;
    removeFromCart: (id: string) => void;
    clearCart: () => void;
    onPark: () => void;
    onReturn: () => void;
    onPay: () => void;
    totals: { subtotal: number, total: number };
    adjustmentSummary?: { adjustmentId: string; adjustmentName: string; totalAmount: number; itemCount: number; }[];
    pricingSummary?: {
        profitMarginTotal: number;
        roundingTotal: number;
    };
    rounding?: {
        enabled: boolean;
        applyRounding: boolean;
        calculatedPrice: number;
        roundedPrice: number;
        difference: number;
        method: string;
        methodLabel?: string;
        methodOptions?: { value: string; label: string }[];
        showOriginalPrice?: boolean;
        manualOverrideAllowed?: boolean;
        onToggle?: (value: boolean) => void;
        onMethodChange?: (value: string) => void;
    };
    manualDiscountPercent?: number;
    onManualDiscountChange?: (value: number) => void;
}

export const CartSidebar: React.FC<CartSidebarProps> = ({
    cart, sales, selectedCustomerName, selectedSubAccount, setSelectedSubAccount, onSelectCustomer, updateQuantity, updatePrice, resetPriceOverride, removeFromCart, clearCart, onPark, onReturn, onPay, totals, adjustmentSummary, pricingSummary, rounding, manualDiscountPercent = 0, onManualDiscountChange
}) => {
    const { companyConfig } = useAuth();
    const { invoices } = useFinance();
    const currency = companyConfig.currencySymbol;

    const [roundingEnabled, setRoundingEnabled] = useState(false);
    const [showDiscountInput, setShowDiscountInput] = useState(false);
    const nextOrderNumber = useMemo(() => generateNextId('POS', sales, companyConfig), [sales, companyConfig]);
    const [roundingMethod, setRoundingMethod] = useState('Nearest');
    const roundingStep = 50;

    const grandTotal = totals.total;
    const discountPercent = manualDiscountPercent;
    const discountAmount = grandTotal * (discountPercent / 100);
    const effectiveTotal = grandTotal - discountAmount;
    const profitMarginTotal = Number(pricingSummary?.profitMarginTotal || 0);
    const hasPricingBreakdown = Boolean(Math.abs(profitMarginTotal) > 0.0001);

    const roundedTotal = useMemo(() => {
        if (!roundingEnabled) return effectiveTotal;
        if (roundingMethod === 'Up') return roundUpToStep(effectiveTotal, roundingStep);
        return roundToNearest(effectiveTotal, roundingStep);
    }, [effectiveTotal, roundingEnabled, roundingMethod, roundingStep]);

    const roundingDifference = roundToNearest(roundedTotal - effectiveTotal, 0.01);

    const totalQuantity = useMemo(() => cart.reduce((s, i) => s + i.quantity, 0), [cart]);
    const totalCost = useMemo(() => cart.reduce((s, i) => s + Number(i.cost || 0) * i.quantity, 0), [cart]);
    const adjustmentTotal = useMemo(() => {
        if (!adjustmentSummary || adjustmentSummary.length === 0) return 0;
        return adjustmentSummary.reduce((sum, adj) => sum + (adj.totalAmount || 0), 0);
    }, [adjustmentSummary]);
    const baseTotal = grandTotal - adjustmentTotal;
    const totalProfit = effectiveTotal - totalCost;
    const profitMarginPct = effectiveTotal > 0 ? (totalProfit / effectiveTotal) * 100 : 0;

    const customerOutstanding = useMemo(() => {
        if (!selectedCustomerName) return 0;
        return (invoices || [])
            .filter((i: any) => i.customerName === selectedCustomerName && i.status !== 'Paid' && i.status !== 'Draft' && i.status !== 'Cancelled')
            .reduce((acc: number, inv: any) => acc + ((inv.totalAmount || 0) - (inv.paidAmount || 0)), 0);
    }, [selectedCustomerName, invoices]);

    return (
        <div className="flex flex-col h-full overflow-hidden" style={{ background: '#fff', fontFamily: "'Inter','DM Sans',sans-serif", fontSize: 13.5, lineHeight: 1.45, color: INK }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderBottom: `1px solid ${LINE}`, background: B50 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 30, height: 30, borderRadius: 8, background: B7, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12 }}>
                        <ShoppingCart size={14} />
                    </div>
                    <div>
                        <h3 style={{ margin: 0, fontSize: 17, fontFamily: "'Inter','DM Sans',sans-serif", fontWeight: 400, color: INK }}>Current Order</h3>
                        <span style={{ fontSize: 12, color: SOFT }}>{cart.length} item{cart.length !== 1 ? 's' : ''} &middot; {totalQuantity} unit{totalQuantity !== 1 ? 's' : ''}</span>
                    </div>
                </div>
                <button onClick={clearCart} disabled={cart.length === 0} style={{ fontSize: 12, color: RED, fontWeight: 600, border: 'none', background: 'none', cursor: 'pointer', padding: 0 }}>
                    Clear all
                </button>
            </div>

            <div onClick={onSelectCustomer} style={{ margin: '10px 16px 0', padding: '8px 12px', border: `1.5px dashed ${B100}`, borderRadius: 10, display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', color: B7, fontWeight: 600, fontSize: 13 }}>
                <div style={{ width: 24, height: 24, borderRadius: '50%', background: B50, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, color: B7 }}>
                    {selectedCustomerName ? <User size={12} /> : <UserPlus size={12} />}
                </div>
                <span>{selectedCustomerName || 'Add customer'}</span>
                {selectedCustomerName && customerOutstanding > 0 && (
                    <span style={{ fontSize: 11, color: AMBER, fontWeight: 500, marginLeft: 4 }}>({currency} {formatNumber(customerOutstanding)})</span>
                )}
                <span style={{ marginLeft: 'auto', color: SOFT, fontSize: 11 }}>›</span>
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar" style={{ padding: '10px 16px 6px' }}>
                {cart.length === 0 ? (
                    <div style={{ padding: '40px 22px', textAlign: 'center', color: SOFT, fontSize: 13 }}>
                        <ShoppingBag size={36} style={{ opacity: 0.25, margin: '0 auto 12px', display: 'block' }} />
                        No items yet — tap a product to add it to the order.
                    </div>
                ) : (
                    <div>
                        {cart.map(item => {
                            if (item.isPrintingJob && item.printingSpec) {
                                return (
                                    <div key={item.id} style={{ padding: '12px 0', borderBottom: `1px dotted ${LINE}` }}>
                                        <PrintJobCartCard
                                            spec={item.printingSpec}
                                            currency={currency}
                                            productionRef={item.productionRef || `PJ-${item.id.slice(-5)}`}
                                            onRemove={() => removeFromCart(item.id)}
                                        />
                                    </div>
                                );
                            }
                            return (
                                <CartItemRow
                                    key={item.id}
                                    item={item}
                                    updateQuantity={updateQuantity}
                                    updatePrice={updatePrice}
                                    removeFromCart={removeFromCart}
                                />
                            );
                        })}
                    </div>
                )}
            </div>

            <div style={{ background: '#fff', borderRadius: 6, boxShadow: '0 1px 2px rgba(10,46,40,.06), 0 8px 24px rgba(10,46,40,.08)', overflow: 'hidden' }}>
                <div style={{ background: '#1E3A5F', color: '#fff', padding: '10px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                    <span style={{ fontSize: 11, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#a9c9c1', fontWeight: 500 }}>
                        Order {nextOrderNumber}
                    </span>
                    <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 13.5, fontWeight: 500 }}>
                        {totalQuantity} item{totalQuantity !== 1 ? 's' : ''}
                    </span>
                </div>

                <div style={{ padding: '10px 16px 2px', fontSize: 13 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '2px 0', lineHeight: 1.3 }}>
                        <span style={{ color: '#5c6d68', fontWeight: 400 }}>Subtotal</span>
                        <span style={{ fontFamily: "'JetBrains Mono',monospace", fontVariantNumeric: 'tabular-nums', color: '#12201d', fontWeight: 500 }}>
                            {currency}{formatNumber(totalCost)}
                        </span>
                    </div>
                    {discountPercent > 0 && (
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '2px 0', lineHeight: 1.3 }}>
                            <span style={{ color: '#a03c3c', opacity: 0.85, fontWeight: 400 }}>Discount ({discountPercent}%)</span>
                            <span style={{ fontFamily: "'JetBrains Mono',monospace", fontVariantNumeric: 'tabular-nums', color: '#a03c3c', fontWeight: 500 }}>
                                &minus;{currency}{formatNumber(discountAmount)}
                            </span>
                        </div>
                    )}
                    {adjustmentTotal > 0 && (
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '2px 0', lineHeight: 1.3 }}>
                            <span style={{ color: '#5c6d68', fontWeight: 400 }}>Adjustments</span>
                            <span style={{ fontFamily: "'JetBrains Mono',monospace", fontVariantNumeric: 'tabular-nums', color: '#0f4f42', fontWeight: 500 }}>
                                +{currency}{formatNumber(adjustmentTotal)}
                            </span>
                        </div>
                    )}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '2px 0', lineHeight: 1.3 }}>
                        <span style={{ color: totalProfit >= 0 ? '#0f4f42' : '#a03c3c', fontWeight: 400 }}>Profit</span>
                        <span style={{ fontFamily: "'JetBrains Mono',monospace", fontVariantNumeric: 'tabular-nums', color: totalProfit >= 0 ? '#0f4f42' : '#a03c3c', fontWeight: 500 }}>
                            {totalProfit >= 0 ? '+' : '-'}{currency}{formatNumber(Math.abs(totalProfit))}
                        </span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '2px 0', lineHeight: 1.3 }}>
                        <span style={{ color: totalProfit >= 0 ? '#0f4f42' : '#a03c3c', fontWeight: 400 }}>Margin</span>
                        <span style={{ fontFamily: "'JetBrains Mono',monospace", fontVariantNumeric: 'tabular-nums', color: totalProfit >= 0 ? '#0f4f42' : '#a03c3c', fontWeight: 500 }}>
                            {profitMarginPct.toFixed(1)}%
                        </span>
                    </div>

                    <div style={{ height: 0, borderTop: '1.5px dashed #d7e2df', margin: '5px 0' }} />

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0 8px', lineHeight: 1.3 }}>
                        <span style={{ fontFamily: "'Inter','DM Sans',sans-serif", fontSize: 15, color: '#12201d', fontWeight: 400 }}>Total</span>
                        <span style={{ fontFamily: "'JetBrains Mono',monospace", fontVariantNumeric: 'tabular-nums', fontSize: 19, fontWeight: 600, color: '#0f4f42' }}>
                            {currency}{formatNumber(displayPrice(roundedTotal, undefined, 'pos'))}
                        </span>
                    </div>
                </div>

                <div style={{ display: 'flex', gap: 8, padding: '6px 16px 12px' }}>
                    <div style={{ flex: 1, position: 'relative' }}>
                        {showDiscountInput ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                <input type="number" value={discountPercent} min={0} max={100} onChange={e => onManualDiscountChange?.(Math.min(100, Math.max(0, Number(e.target.value))))}
                                    style={{ flex: 1, fontFamily: "'Inter','DM Sans',sans-serif", fontSize: 12.5, fontWeight: 600, padding: '7px 6px', borderRadius: 4, border: '1px solid #a03c3c', textAlign: 'center', background: '#fff', color: '#a03c3c', outline: 'none', width: 0 }} />
                                <span style={{ fontSize: 11, color: '#a03c3c', fontWeight: 600, whiteSpace: 'nowrap' }}>%</span>
                                <button onClick={() => { setShowDiscountInput(false); }}
                                    style={{ fontFamily: "'Inter','DM Sans',sans-serif", fontSize: 11, fontWeight: 600, padding: '7px 8px', borderRadius: 4, border: 'none', cursor: 'pointer', background: '#a03c3c', color: '#fff' }}>
                                    OK
                                </button>
                            </div>
                        ) : (
                            <button onClick={() => setShowDiscountInput(true)}
                                style={{ width: '100%', fontFamily: "'Inter','DM Sans',sans-serif", fontSize: 12.5, fontWeight: 600, padding: '7px 0', borderRadius: 4, border: '1px solid #a03c3c', cursor: 'pointer', textAlign: 'center', background: '#fff', color: '#a03c3c' }}>
                                Discount
                            </button>
                        )}
                    </div>
                    <button onClick={onPay} disabled={cart.length === 0}
                        style={{ flex: 1, fontFamily: "'Inter','DM Sans',sans-serif", fontSize: 12.5, fontWeight: 600, padding: '7px 0', borderRadius: 4, border: 'none', cursor: 'pointer', textAlign: 'center', background: '#2563EB', color: '#fff', opacity: cart.length === 0 ? 0.5 : 1 }}>
                        Proceed
                    </button>
                </div>
            </div>
        </div>
    );
};

const CartItemRow: React.FC<{ item: CartItem, updateQuantity: (id: string, delta: number, isAbsolute?: boolean) => void, updatePrice: (id: string, newPrice: number) => void, removeFromCart: (id: string) => void }> = ({ item, updateQuantity, updatePrice, removeFromCart }) => {
    const { companyConfig } = useAuth();
    const currency = companyConfig.currencySymbol;
    const serviceDetails = item.serviceDetails;

    const [isEditingPrice, setIsEditingPrice] = useState(false);
    const [localPrice, setLocalPrice] = useState(item.price.toString());

    useEffect(() => {
        setLocalPrice(item.price.toString());
    }, [item.price]);

    const handlePriceKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            const val = parseFloat(localPrice);
            if (!isNaN(val) && val >= 0) {
                updatePrice(item.id, val);
                setIsEditingPrice(false);
            } else {
                setLocalPrice(item.price.toString());
                setIsEditingPrice(false);
            }
        } else if (e.key === 'Escape') {
            setLocalPrice(item.price.toString());
            setIsEditingPrice(false);
        }
    };

    const handlePriceBlur = () => {
        const val = parseFloat(localPrice);
        if (!isNaN(val) && val >= 0) {
            updatePrice(item.id, val);
        } else {
            setLocalPrice(item.price.toString());
        }
        setIsEditingPrice(false);
    };

    const adjSnapshots = useMemo(() => getMarketAdjustmentSnapshots(resolveItemAdjustmentSnapshots(item)), [item]);
    const adjAmount = useMemo(() => adjSnapshots.reduce((s: number, a: any) => s + (a.calculatedAmount || 0), 0), [adjSnapshots]);
    const hasAdj = adjAmount !== 0;

    const isPrintType = serviceDetails && (item.pages || serviceDetails.pages);
    const totalPages = isPrintType ? (serviceDetails.pages || item.pages || 1) * (serviceDetails.copies || item.quantity || 1) : 0;
    const isPhotocopy = item.unit === 'sheet';
    const sheetCount = isPhotocopy ? Math.ceil((serviceDetails.pages || item.pages || 1) / 2) * (serviceDetails.copies || item.quantity || 1) : 0;
    const perUnit = isPrintType ? (isPhotocopy ? item.price / sheetCount : item.price / totalPages) : 0;

    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0', borderBottom: `1px dotted ${LINE}` }}>
            {isPrintType ? (
                <div style={{ width: 28, flexShrink: 0 }} />
            ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: 0, border: `1px solid ${LINE}`, borderRadius: 8, overflow: 'hidden', height: 26, flexShrink: 0 }}>
                    <button onClick={() => updateQuantity(item.id, -1)} style={{ width: 22, border: 'none', background: B50, color: B7, fontWeight: 600, cursor: 'pointer', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12 }} title="Decrease quantity" aria-label="Decrease quantity"><Minus size={9} /></button>
                    <span style={{ width: 22, textAlign: 'center', fontFamily: "'JetBrains Mono',monospace", fontSize: 12, fontWeight: 600, color: INK }}>{item.quantity}</span>
                    <button onClick={() => updateQuantity(item.id, 1)} style={{ width: 22, border: 'none', background: B50, color: B7, fontWeight: 600, cursor: 'pointer', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12 }} title="Increase quantity" aria-label="Increase quantity"><Plus size={9} /></button>
                </div>
            )}

            <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 4, fontSize: 13, fontWeight: 600, color: INK }}>
                <span className="truncate">
                    {isPrintType ? `${totalPages} pages ${item.name}` : item.name}
                </span>
                {isPrintType ? (
                    <span style={{ fontFamily: "'JetBrains Mono',monospace", fontWeight: 400, color: SOFT, fontSize: 11.5, whiteSpace: 'nowrap' }}>
                        @{currency}{formatNumber(perUnit)}/{isPhotocopy ? 'sheet' : 'page'}
                    </span>
                ) : (
                    <span style={{ fontFamily: "'JetBrains Mono',monospace", fontWeight: 400, color: SOFT, fontSize: 11.5, whiteSpace: 'nowrap' }}>
                        @{currency}{formatNumber(displayPrice(item.price, undefined, 'pos'))}
                    </span>
                )}
                {item.manual_override && <span style={{ fontSize: 9, fontWeight: 600, color: '#2f5fa8', background: '#eaf1fb', padding: '1px 4px', borderRadius: 4, flexShrink: 0 }}>OVR</span>}
                {hasAdj && <span style={{ fontSize: 9, fontWeight: 600, color: AMBER, background: '#fbf1e2', padding: '1px 4px', borderRadius: 4, flexShrink: 0 }}>ADJ</span>}
            </div>

            <div style={{ fontFamily: "'JetBrains Mono',monospace", fontWeight: 600, fontSize: 13, color: INK, whiteSpace: 'nowrap', flexShrink: 0 }}>
                {currency}{formatNumber(displayPrice(item.price * item.quantity, undefined, 'pos'))}
            </div>

            <button onClick={() => removeFromCart(item.id)} style={{ border: 'none', background: 'none', color: SOFT, cursor: 'pointer', fontSize: 12, padding: '2px 4px', opacity: 0.6, transition: '.15s', flexShrink: 0, display: 'flex', alignItems: 'center' }} title="Remove item" aria-label="Remove item from cart">
                <X size={11} />
            </button>
        </div>
    );
};
