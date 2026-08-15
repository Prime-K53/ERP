import React, { useEffect, useMemo, useState } from 'react';
import { logger } from '@/services/logger';
import {
    Sparkles,
    Loader2,
    CheckCircle,
    AlertCircle,
    TrendingUp,
    TrendingDown,
    RefreshCw,
    Package,
    MapPin,
    X,
    SlidersHorizontal
} from 'lucide-react';
import { Item } from '../../../types';
import { useInventory } from '../../../context/InventoryContext';
import { getDefaultDate, validateDateInFY } from '../../../utils/financialYearUtils';

interface SmartAdjustModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
    items: Item[];
}

const teal = {
    50: '#eef7f6', 100: '#d3ece9', 200: '#a6d9d3', 300: '#72c0b7',
    400: '#3fa294', 500: '#1f8577', 600: '#146b60', 700: '#0f544c',
    800: '#0b3e39', 900: '#082e2a'
};
const amber = { 100: '#fbead0', 300: '#eec27a', 500: '#d99a3f', 600: '#b97e2b' };
const paper = '#FEFDFB';
const ink = '#23282A';
const inkSoft = '#5c6567';
const hairline = '#e4ddd1';
const danger = '#b5493f';

const labelStyle: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: 6,
    fontSize: 12, fontWeight: 600, color: teal[800],
    marginBottom: 6, letterSpacing: 0.01
};

const inputStyle: React.CSSProperties = {
    width: '100%', fontFamily: "'Inter', sans-serif", fontSize: 13.5,
    color: ink, background: paper,
    border: `1.4px solid ${hairline}`, borderRadius: 9,
    padding: '9px 12px', outline: 'none',
    transition: 'border-color .15s ease, box-shadow .15s ease, background .15s ease'
};

const textareaStyle: React.CSSProperties = {
    ...inputStyle, resize: 'none', minHeight: 66, lineHeight: 1.5
};

const selectStyle: React.CSSProperties = {
    ...inputStyle,
    appearance: 'none',
    backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%235c6567'/%3E%3C/svg%3E")`,
    backgroundRepeat: 'no-repeat',
    backgroundPosition: 'right 12px center',
    paddingRight: 30,
    cursor: 'pointer'
};

const sectionLabelStyle: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: 10,
    margin: '26px 0 14px'
};

const btnGhostStyle: React.CSSProperties = {
    fontFamily: "'Inter', sans-serif", fontSize: 13, fontWeight: 600,
    padding: '9px 18px', borderRadius: 9, cursor: 'pointer',
    background: paper, border: `1.4px solid ${hairline}`, color: inkSoft,
    display: 'flex', alignItems: 'center', gap: 7, transition: 'all .15s ease'
};

const btnPrimaryStyle: React.CSSProperties = {
    fontFamily: "'Inter', sans-serif", fontSize: 13, fontWeight: 600,
    padding: '9px 18px', borderRadius: 9, cursor: 'pointer', border: '1.4px solid transparent',
    background: `linear-gradient(155deg, ${teal[500]}, ${teal[700]})`,
    color: '#fff', display: 'flex', alignItems: 'center', gap: 7,
    boxShadow: `0 6px 16px -6px rgba(15,84,76,.55)`,
    transition: 'all .15s ease'
};

const SmartAdjustModal: React.FC<SmartAdjustModalProps> = ({ isOpen, onClose, onSuccess, items }) => {
    const { updateStock, warehouses } = useInventory();

    const [applying, setApplying] = useState(false);
    const [selectedItems, setSelectedItems] = useState<string[]>([]);
    const [adjustmentType, setAdjustmentType] = useState<'ADD' | 'REMOVE' | 'SET'>('ADD');
    const [quantity, setQuantity] = useState<number>(0);
    const [reason, setReason] = useState<string>('');
    const [selectedWarehouse, setSelectedWarehouse] = useState<string>('WH-MAIN');
    const [step, setStep] = useState<'preview' | 'applying' | 'success'>('preview');

    useEffect(() => {
        if (!isOpen) return;

        const lowStockIds = items
            .filter(item => (item.stock || 0) <= (item.minStockLevel || 0))
            .map(item => item.id);

        setSelectedItems(lowStockIds.length > 0 ? lowStockIds : items.map(item => item.id));
        setAdjustmentType('ADD');
        setQuantity(0);
        setReason('');
        setSelectedWarehouse(warehouses[0]?.id || 'WH-MAIN');
        setStep('preview');
        setApplying(false);
    }, [isOpen, items, warehouses]);

    const itemById = useMemo(() => {
        const map = new Map<string, Item>();
        items.forEach(item => map.set(item.id, item));
        return map;
    }, [items]);

    const selectedItemRows = useMemo(
        () => selectedItems.map(id => itemById.get(id)).filter(Boolean) as Item[],
        [selectedItems, itemById]
    );

    const getStockChange = (item: Item): number => {
        if (adjustmentType === 'SET') {
            return quantity - (item.stock || 0);
        }
        if (adjustmentType === 'REMOVE') {
            return -Math.abs(quantity);
        }
        return Math.abs(quantity);
    };

    const projectedNetChange = selectedItemRows.reduce((sum, item) => sum + getStockChange(item), 0);
    const projectedNegativeStock = selectedItemRows.some(item => (item.stock || 0) + getStockChange(item) < 0);
    const hasValidQuantity = adjustmentType === 'SET' ? quantity >= 0 : quantity > 0;

    const handleApplyAdjustments = async () => {
        if (selectedItems.length === 0 || !hasValidQuantity) return;

        const dateValidation = validateDateInFY(getDefaultDate());
        if (dateValidation) {
            alert(dateValidation);
            return;
        }

        setApplying(true);
        setStep('applying');

        try {
            const summaryReason = reason.trim() || `Smart stock adjustment (${adjustmentType})`;

            for (const itemId of selectedItems) {
                const item = itemById.get(itemId);
                if (!item) continue;

                const stockChange = getStockChange(item);
                if (stockChange === 0) continue;

                await updateStock(item.id, stockChange, selectedWarehouse, summaryReason, true);
            }

            setStep('success');

            setTimeout(() => {
                onSuccess();
                onClose();
                setStep('preview');
            }, 1500);
        } catch (error) {
            logger.error('Error applying adjustments:', error);
            setStep('preview');
            alert('Failed to apply stock adjustments. Please try again.');
        } finally {
            setApplying(false);
        }
    };

    const toggleItem = (id: string) => {
        setSelectedItems(prev =>
            prev.includes(id)
                ? prev.filter(itemId => itemId !== id)
                : [...prev, id]
        );
    };

    const toggleSelectAll = () => {
        if (selectedItems.length === items.length) {
            setSelectedItems([]);
            return;
        }
        setSelectedItems(items.map(item => item.id));
    };

    const formatTypeLabel = (type: 'ADD' | 'REMOVE' | 'SET') => {
        if (type === 'SET') return 'Set Quantity';
        return type === 'ADD' ? 'Increase Stock' : 'Reduce Stock';
    };

    if (!isOpen) return null;

    return (
        <div style={{
            position: 'fixed', inset: 0, zIndex: 9999,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'rgba(15, 23, 42, 0.6)',
            padding: '40px 20px', fontFamily: "'Inter','DM Sans',sans-serif", fontSize: 13.5, color: ink,
        }}>
            <div style={{
                width: 960, maxWidth: '100%', maxHeight: '92vh',
                background: paper, borderRadius: 14,
                boxShadow: '0 30px 70px -20px rgba(0,0,0,.55), 0 8px 24px -8px rgba(0,0,0,.35), 0 0 0 1px rgba(255,255,255,.04)',
                display: 'flex', flexDirection: 'column', overflow: 'hidden', position: 'relative'
            }}>
                {/* Accent stripe */}
                <div style={{
                    position: 'absolute', top: 0, left: 0, right: 0, height: 4,
                    background: `linear-gradient(90deg, ${teal[600]}, ${teal[400]} 40%, ${amber[500]} 100%)`
                }} />

                {/* Header */}
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
                            <SlidersHorizontal size={19} color="#fff" />
                        </div>
                        <div>
                            <h1 style={{
                                fontFamily: "'DM Serif Display', 'Georgia', serif", fontWeight: 400,
                                fontSize: 22, margin: 0, color: teal[800], letterSpacing: 0.2
                            }}>
                                Smart Stock Adjust
                            </h1>
                            <p style={{ margin: '2px 0 0', fontSize: 11.5, color: inkSoft, letterSpacing: 0.02 }}>
                                Bulk inventory updates &mdash; {selectedItemRows.length} items selected
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

                {/* Body */}
                <div style={{ flex: 1, overflowY: 'auto', padding: '24px 30px 8px' }}>
                        {step === 'applying' ? (
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px 0' }}>
                                <Loader2 size={56} style={{ color: teal[500], animation: 'spin 1s linear infinite', marginBottom: 16 }} />
                                <p style={{ fontSize: 16, fontWeight: 700, color: ink, margin: '0 0 6px' }}>Applying Stock Adjustments</p>
                                <p style={{ fontSize: 13.5, color: inkSoft }}>Updating stock levels in inventory records...</p>
                            </div>
                        ) : step === 'success' ? (
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px 0' }}>
                                <div style={{ width: 56, height: 56, borderRadius: '50%', background: teal[50], display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16, border: `1px solid ${teal[100]}` }}>
                                    <CheckCircle size={28} style={{ color: teal[500] }} />
                                </div>
                                <p style={{ fontSize: 16, fontWeight: 700, color: ink, margin: '0 0 6px' }}>Stock Adjustments Applied</p>
                                <p style={{ fontSize: 13.5, color: inkSoft }}>Inventory stock levels have been updated</p>
                            </div>
                        ) : (
                            <>
                                {/* KPI Cards */}
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 20 }}>
                                    <div style={{ padding: 14, background: paper, borderRadius: 12, border: `1px solid ${hairline}`, borderLeft: `4px solid ${teal[500]}`, transition: 'all .15s ease' }}
                                        onMouseEnter={e => { e.currentTarget.style.background = teal[50]; }}
                                        onMouseLeave={e => { e.currentTarget.style.background = paper; }}
                                    >
                                        <p style={{ margin: 0, fontSize: 10, fontWeight: 700, color: inkSoft, textTransform: 'uppercase', letterSpacing: 0.05 }}>Selected Items</p>
                                        <p style={{ margin: '4px 0 0', fontSize: 22, fontWeight: 700, color: ink, fontVariantNumeric: 'tabular-nums' }}>{selectedItems.length}</p>
                                    </div>
                                    <div style={{ padding: 14, background: paper, borderRadius: 12, border: `1px solid ${hairline}`, borderLeft: `4px solid ${teal[400]}`, transition: 'all .15s ease' }}
                                        onMouseEnter={e => { e.currentTarget.style.background = teal[50]; }}
                                        onMouseLeave={e => { e.currentTarget.style.background = paper; }}
                                    >
                                        <p style={{ margin: 0, fontSize: 10, fontWeight: 700, color: inkSoft, textTransform: 'uppercase', letterSpacing: 0.05 }}>Operation</p>
                                        <p style={{ margin: '4px 0 0', fontSize: 15, fontWeight: 700, color: ink }}>{formatTypeLabel(adjustmentType)}</p>
                                    </div>
                                    <div style={{ padding: 14, background: paper, borderRadius: 12, border: `1px solid ${hairline}`, borderLeft: `4px solid ${amber[500]}`, transition: 'all .15s ease' }}
                                        onMouseEnter={e => { e.currentTarget.style.background = teal[50]; }}
                                        onMouseLeave={e => { e.currentTarget.style.background = paper; }}
                                    >
                                        <p style={{ margin: 0, fontSize: 10, fontWeight: 700, color: inkSoft, textTransform: 'uppercase', letterSpacing: 0.05 }}>Net Change</p>
                                        <p style={{ margin: '4px 0 0', fontSize: 22, fontWeight: 700, color: ink, fontVariantNumeric: 'tabular-nums' }}>{projectedNetChange.toFixed(2)}</p>
                                    </div>
                                </div>

                                <div style={sectionLabelStyle}><span>Configuration</span></div>

                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 18 }}>
                                    <div>
                                        <label style={labelStyle}>Warehouse</label>
                                        <div style={{ position: 'relative' }}>
                                            <MapPin size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: inkSoft, pointerEvents: 'none' }} />
                                            <select
                                                value={selectedWarehouse}
                                                onChange={(e) => setSelectedWarehouse(e.target.value)}
                                                style={{ ...selectStyle, paddingLeft: 32 }}
                                            >
                                                {warehouses.length > 0 ? (
                                                    warehouses.map(wh => (
                                                        <option key={wh.id} value={wh.id}>{wh.name}</option>
                                                    ))
                                                ) : (
                                                    <option value="WH-MAIN">Main Warehouse</option>
                                                )}
                                            </select>
                                        </div>
                                    </div>
                                    <div>
                                        <label style={labelStyle}>Quantity</label>
                                        <input
                                            type="number"
                                            min="0"
                                            value={Number.isNaN(quantity) ? 0 : quantity}
                                            onChange={(e) => setQuantity(Number(e.target.value))}
                                            style={inputStyle}
                                            placeholder="0"
                                        />
                                    </div>
                                </div>

                                <div style={{ marginBottom: 18 }}>
                                    <label style={labelStyle}>Adjustment Type</label>
                                    <div style={{ display: 'flex', padding: '4px', background: teal[50], borderRadius: 9, gap: 4 }}>
                                        {(['ADD', 'REMOVE', 'SET'] as const).map((type) => {
                                            const isActive = adjustmentType === type;
                                            return (
                                                <button
                                                    key={type}
                                                    type="button"
                                                    onClick={() => setAdjustmentType(type)}
                                                    style={{
                                                        flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                                                        padding: '8px 12px', borderRadius: 7, border: 'none',
                                                        fontSize: 13, fontWeight: 600, cursor: 'pointer',
                                                        transition: 'all .15s ease',
                                                        background: isActive ? paper : 'transparent',
                                                        color: isActive ? teal[700] : inkSoft,
                                                        boxShadow: isActive ? `0 1px 3px rgba(15,84,76,.12)` : 'none'
                                                    }}
                                                >
                                                    {type === 'ADD' && <TrendingUp size={14} />}
                                                    {type === 'REMOVE' && <TrendingDown size={14} />}
                                                    {type === 'SET' && <RefreshCw size={14} />}
                                                    {formatTypeLabel(type)}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>

                                <div style={{ marginBottom: 18 }}>
                                    <label style={labelStyle}>Reason (Optional)</label>
                                    <textarea
                                        value={reason}
                                        onChange={(e) => setReason(e.target.value)}
                                        style={textareaStyle}
                                        rows={2}
                                        placeholder="e.g., Cycle count correction, damaged stock write-off..."
                                    />
                                </div>

                                <div style={sectionLabelStyle}><span>Select Items</span></div>

                                {items.length === 0 ? (
                                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 32, textAlign: 'center' }}>
                                        <AlertCircle size={40} style={{ color: amber[500], marginBottom: 12 }} />
                                        <p style={{ fontSize: 15, fontWeight: 700, color: ink, margin: '0 0 6px' }}>No Inventory Items</p>
                                        <p style={{ fontSize: 13.5, color: inkSoft, maxWidth: 400 }}>Create inventory items before using Smart Adjust.</p>
                                    </div>
                                ) : (
                                    <>
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                                            <h3 style={{ fontSize: 13, fontWeight: 700, color: ink, margin: 0 }}>Items to Update</h3>
                                            <button
                                                type="button"
                                                onClick={toggleSelectAll}
                                                style={{ fontSize: 12, fontWeight: 700, color: teal[600], background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                                            >
                                                {selectedItems.length === items.length ? 'Clear All' : 'Select All'}
                                            </button>
                                        </div>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                            {items.map((item, idx) => {
                                                const change = getStockChange(item);
                                                const resultingStock = (item.stock || 0) + change;
                                                const isSelected = selectedItems.includes(item.id);
                                                return (
                                                    <div
                                                        key={`${item.id}-${idx}`}
                                                        onClick={() => toggleItem(item.id)}
                                                        style={{
                                                            padding: 14, borderRadius: 12, cursor: 'pointer',
                                                            border: `1.4px solid ${isSelected ? teal[500] : hairline}`,
                                                            background: isSelected ? teal[50] : paper,
                                                            transition: 'all .15s ease'
                                                        }}
                                                    >
                                                        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                                                                    <h4 style={{ fontWeight: 700, color: ink, margin: 0, fontSize: 13 }}>{item.name}</h4>
                                                                    <span style={{ padding: '2px 8px', borderRadius: 6, background: teal[50], color: teal[700], fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.05 }}>{item.sku}</span>
                                                                </div>
                                                                <div style={{ display: 'flex', alignItems: 'center', gap: 16, fontSize: 12.5 }}>
                                                                    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                                                                        <Package size={13} style={{ color: teal[600] }} />
                                                                        <span style={{ fontWeight: 600, color: ink, fontVariantNumeric: 'tabular-nums' }}>Current: {item.stock} {item.unit}</span>
                                                                    </div>
                                                                    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                                                                        {change >= 0 ? (
                                                                            <TrendingUp size={13} style={{ color: teal[500] }} />
                                                                        ) : (
                                                                            <TrendingDown size={13} style={{ color: danger }} />
                                                                        )}
                                                                        <span style={{ fontVariantNumeric: 'tabular-nums', color: resultingStock < 0 ? danger : inkSoft }}>
                                                                            New: {resultingStock.toFixed(2)} {item.unit}
                                                                        </span>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                            <div style={{
                                                                width: 20, height: 20, borderRadius: 6, flexShrink: 0,
                                                                border: `2px solid ${isSelected ? teal[600] : hairline}`,
                                                                background: isSelected ? teal[600] : paper,
                                                                display: 'flex', alignItems: 'center', justifyContent: 'center'
                                                            }}>
                                                                {isSelected && <CheckCircle size={12} style={{ color: '#fff' }} />}
                                                            </div>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </>
                                )}
                                {projectedNegativeStock && (
                                    <p style={{ fontSize: 12, color: amber[600], display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600, marginTop: 12 }}>
                                        <AlertCircle size={13} />
                                        One or more selected items will result in negative stock.
                                    </p>
                                )}
                            </>
                        )}
                    </div>

                {/* Footer */}
                {step === 'preview' && items.length > 0 && (
                    <div style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        gap: 14, padding: '16px 28px',
                        borderTop: `1px solid ${hairline}`, background: paper
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: inkSoft }}>
                            <span style={{ width: 6, height: 6, borderRadius: '50%', background: amber[500] }} />
                            {selectedItems.length} item{selectedItems.length !== 1 ? 's' : ''} selected &mdash; Net change: {projectedNetChange.toFixed(2)}
                        </div>
                        <div style={{ display: 'flex', gap: 10 }}>
                            <button type="button" onClick={onClose}
                                style={btnGhostStyle}
                                onMouseEnter={e => { e.currentTarget.style.background = teal[50]; e.currentTarget.style.color = teal[800]; e.currentTarget.style.borderColor = teal[200]; }}
                                onMouseLeave={e => { e.currentTarget.style.background = paper; e.currentTarget.style.color = inkSoft; e.currentTarget.style.borderColor = hairline; }}>
                                Cancel
                            </button>
                            <button type="button" onClick={handleApplyAdjustments}
                                disabled={applying || selectedItems.length === 0 || !hasValidQuantity}
                                style={{
                                    ...btnPrimaryStyle,
                                    opacity: (applying || selectedItems.length === 0 || !hasValidQuantity) ? 0.5 : 1,
                                    cursor: (applying || selectedItems.length === 0 || !hasValidQuantity) ? 'not-allowed' : 'pointer'
                                }}
                                onMouseEnter={e => { if (!applying && selectedItems.length > 0 && hasValidQuantity) { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 8px 20px -6px rgba(15,84,76,.65)'; } }}
                                onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 6px 16px -6px rgba(15,84,76,.55)'; }}
                            >
                                <Sparkles size={14} />
                                Apply Stock Adjustments
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default SmartAdjustModal;
