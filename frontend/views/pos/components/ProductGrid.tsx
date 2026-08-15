
import React, { useState, useEffect, useRef } from 'react';
import { Search, Plus, PauseCircle, Printer, Book, Scissors, Image, Layout, PenTool, Box, Briefcase, Layers, FileText, Grid, Hash } from 'lucide-react';
import { Item, ProductVariant } from '../../../types';
import { useAuth } from '../../../context/AuthContext';
import { useProduction } from '../../../context/ProductionContext';
import { useKeyboardListNavigation } from '../../../hooks/useKeyboardListNavigation';
import { VariantSelectorModal, PrintingVariantModal } from './PosModals';
import { ItemModal } from '../../../components/items/ItemModal';

import { formatNumber } from '../../../utils/helpers';
import { generateLocalId } from '../../../utils/idGeneration';
import { useInventory } from '../../../context/InventoryContext';
import { generateNextId } from '../../../utils/helpers';
import { resolveStoredCalculatedPrice, resolveStoredCost, resolveStoredSellingPrice } from '../../../utils/pricing';
import { getSnapshotCalculatedAmount, resolveItemAdjustmentSnapshots } from '../../../utils/pricingBreakdown';

const B = '#1E3A5F';
const B7 = '#2563EB';
const B6 = '#1D4ED8';
const B5 = '#3B82F6';
const B100 = '#DBEAFE';
const B50 = '#EFF6FF';
const PAPER = '#faf9f6';
const INK = '#16211f';
const SOFT = '#5c6b68';
const LINE = '#e1e5e2';
const AMBER = '#b8863f';
const RED = '#b3402f';
const GREEN = '#1f7a52';

const SCANNER_THRESHOLD_MS = 50;

interface ProductGridProps {
    inventory: Item[];
    addToCart: (item: Item) => void;
    onConfigureService: (item: Item) => void;
    onRecall: () => void;
    heldCount: number;
    onZReport: () => void;
}

type ViewMode = 'Large' | 'Small' | 'List';

export const ProductGrid: React.FC<ProductGridProps> = ({ inventory, addToCart, onConfigureService, onRecall, heldCount, onZReport }) => {
    const { companyConfig, user } = useAuth(); const { boms } = useProduction();
    const { addItem: inventoryAddItem } = useInventory();
    const searchInputRef = useRef<HTMLInputElement>(null);
    const currency = companyConfig.currencySymbol;
    const [searchTerm, setSearchTerm] = useState('');
    const [activeCategory, setActiveCategory] = useState<string>('All');
    const [viewMode, setViewMode] = useState<ViewMode>('Large');
    const [selectedProductForVariants, setSelectedProductForVariants] = useState<Item | null>(null);
    const [showCreateItemModal, setShowCreateItemModal] = useState(false);
    const lastKeyTimeRef = useRef(0);
    const scannerBufferRef = useRef('');

    // Quick Item Entry: Auto-focus search on mount and after item add
    useEffect(() => {
        if (companyConfig.transactionSettings?.quickItemEntry) {
            searchInputRef.current?.focus();
        }
    }, [companyConfig.transactionSettings?.quickItemEntry]);

    const saleableInventory = inventory.filter(i => i.type && i.type !== 'Material' && i.type !== 'Raw Material');

    const categoryGroups = [
        { label: 'All', match: (_: Item) => true },
        { label: 'Products', match: (p: Item) => p.type === 'Product' },
        { label: 'Stationery', match: (p: Item) => p.type === 'Stationery' },
        { label: 'Service', match: (p: Item) => p.type === 'Service' || p.category === 'Service' },
    ] as const;

    const filteredProducts = saleableInventory.filter(p => {
        const group = categoryGroups.find(g => g.label === activeCategory);
        return (group ? group.match(p) : true) &&
            (p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                p.sku.toLowerCase().includes(searchTerm.toLowerCase()) ||
                (p.barcode && p.barcode.toLowerCase().includes(searchTerm.toLowerCase())));
    });

    // Barcode lookup: exact match on barcode regardless of category filter
    const barcodeMatch = searchTerm.trim()
        ? saleableInventory.find(p => p.barcode && p.barcode.toLowerCase() === searchTerm.trim().toLowerCase())
        : null;

    // Detect scanner vs manual typing by measuring inter-key timing
    const detectScannerInput = (): boolean => {
        const now = Date.now();
        const elapsed = now - lastKeyTimeRef.current;
        lastKeyTimeRef.current = now;
        return elapsed > 0 && elapsed < SCANNER_THRESHOLD_MS;
    };

    const autoAddItem = (item: Item) => {
        const itemType = item.type || item.category || '';
        const isService = itemType === 'Service' || item.category === 'Service';
        // Only clear search when we're directly adding to cart (not opening a modal)
        if (!item.isVariantParent && !isService) {
            setSearchTerm('');
        }
        handleItemClick(item);
    };

    const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            const term = searchTerm.trim();
            if (!term) return;

            // 1) Exact barcode match (fast path for scanner)
            if (barcodeMatch) {
                autoAddItem(barcodeMatch);
                return;
            }

            // 2) Single filtered result — auto-add
            if (filteredProducts.length === 1) {
                autoAddItem(filteredProducts[0]);
                return;
            }

            // 3) Multiple results — select first with keyboard nav
            if (filteredProducts.length > 0) {
                setActiveIndex(0);
            }
        }
    };

    const gridCols = viewMode === 'List' ? 1 : viewMode === 'Small' ? 8 : (companyConfig.transactionSettings?.pos?.gridColumns || 5);

    const handleItemClick = (item: Item) => {
        const itemType = item.type || item.category || '';
        const isService = itemType === 'Service' || item.category === 'Service';
        if (item.isVariantParent) {
            setSelectedProductForVariants(item);
        } else if (isService) {
            onConfigureService(item);
        } else {
            addToCart(item);
        }
    };

    const handleVariantSelect = (variant: ProductVariant) => {
        if (!selectedProductForVariants) return;

        const adjustmentSnapshots = resolveItemAdjustmentSnapshots(variant);
        const adjustmentTotal = Number(
            variant.smartPricingSnapshot?.marketAdjustmentTotal
            ?? variant.adjustmentTotal
            ?? adjustmentSnapshots.reduce((sum: number, snapshot: any) => sum + getSnapshotCalculatedAmount(snapshot), 0)
        );

        // Convert variant to Item with parentId for stock reservation
        // Include variant-specific adjustment data for margin tracking
        const variantItem: any = {
            ...selectedProductForVariants,
            id: variant.id,
            parentId: selectedProductForVariants.id,
            sku: variant.sku,
            name: variant.name,
            price: resolveStoredSellingPrice(variant) || 0,
            cost: resolveStoredCost(variant) || 0,
            cost_price: resolveStoredCost(variant) || 0,
            calculated_price: resolveStoredCalculatedPrice(variant) || 0,
            selling_price: resolveStoredSellingPrice(variant) || 0,
            rounding_difference: variant.rounding_difference,
            rounding_method: variant.rounding_method,
            stock: variant.stock,
            isVariantParent: false,
            variants: [],
            // ✅ Variant-specific adjustment data
            adjustmentSnapshots,
            adjustmentTotal,
            smartPricingSnapshot: variant.smartPricingSnapshot,
            productionCostSnapshot: variant.productionCostSnapshot,
            pagesOverride: variant.pages,
            pricingSource: variant.pricingSource,
            quantity: variant.quantity || 1 // Use selected quantity or default to 1
        };

        addToCart(variantItem);
        setSelectedProductForVariants(null);
    };

    const { activeIndex, setActiveIndex } = useKeyboardListNavigation({
        itemCount: filteredProducts.length,
        columns: gridCols,
        onSelect: (index) => handleItemClick(filteredProducts[index])
    });

    const getCategoryIcon = (cat: string | undefined) => {
        const lower = (cat || '').toLowerCase();
        if (lower.includes('print') || lower.includes('paper')) return <Printer size={12} />;
        if (lower.includes('book') || lower.includes('binding')) return <Book size={12} />;
        if (lower.includes('design')) return <PenTool size={12} />;
        if (lower.includes('large') || lower.includes('banner')) return <Image size={12} />;
        if (lower.includes('cut') || lower.includes('finish')) return <Scissors size={12} />;
        if (lower.includes('service')) return <Briefcase size={12} />;
        if (lower.includes('material')) return <Layers size={12} />;
        return <Box size={12} />;
    };

    const renderItems = (items: Item[]) => {
        const price = (item: Item) => resolveStoredSellingPrice(item) || 0;
        const lowestVariantPrice = (item: Item) => {
            if (!item.variants || item.variants.length === 0) return 0;
            const prices = item.variants.map(v => Number(resolveStoredSellingPrice(v) || 0));
            return Math.min(...prices);
        };

        if (viewMode === 'List') {
            return (
                <div style={{ width: '100%' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '28px 1fr 80px 70px 44px', gap: 8, padding: '6px 10px', fontSize: 10, fontWeight: 600, color: SOFT, textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: `1px solid ${LINE}`, background: B50 }}>
                        <span></span>
                        <span>Item</span>
                        <span style={{ textAlign: 'right' }}>Price</span>
                        <span style={{ textAlign: 'right' }}>Stock</span>
                        <span style={{ textAlign: 'center' }}>Type</span>
                    </div>
                    {items.map((item, idx) => (
                        <button
                            key={item.id}
                            onMouseEnter={() => setActiveIndex(idx)}
                            onClick={() => handleItemClick(item)}
                            disabled={item.stock <= 0 && item.type === 'Stationery' && !item.isVariantParent}
                            style={{
                                width: '100%',
                                display: 'grid',
                                gridTemplateColumns: '28px 1fr 80px 70px 44px',
                                gap: 8,
                                alignItems: 'center',
                                padding: '7px 10px',
                                textAlign: 'left',
                                border: 'none',
                                borderBottom: `1px solid ${LINE}`,
                                background: activeIndex === idx ? B100 : 'transparent',
                                cursor: item.stock <= 0 && item.type === 'Stationery' && !item.isVariantParent ? 'not-allowed' : 'pointer',
                                opacity: item.stock <= 0 && item.type === 'Stationery' && !item.isVariantParent ? 0.5 : 1,
                                fontFamily: "'Inter','DM Sans',sans-serif",
                                transition: '.1s'
                            }}
                            onMouseOver={e => { if (activeIndex !== idx) e.currentTarget.style.background = B50; }}
                            onMouseOut={e => { if (activeIndex !== idx) e.currentTarget.style.background = 'transparent'; }}
                        >
                            <div style={{ padding: 4, borderRadius: 6, background: B50, color: SOFT, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                {getCategoryIcon(item.category)}
                            </div>
                            <div style={{ minWidth: 0 }}>
                                <div style={{ fontSize: 12.5, fontWeight: 600, color: INK, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</div>
                                <div style={{ fontSize: 9.5, color: SOFT, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.sku}</div>
                            </div>
                            <div style={{ textAlign: 'right', fontSize: 12, fontWeight: 600, color: INK, fontFamily: "'JetBrains Mono',monospace" }}>
                                {item.isVariantParent ? (
                                    <>From&nbsp;{currency}{formatNumber(lowestVariantPrice(item))} <span style={{ fontSize: 9, color: SOFT }}>▼</span></>
                                ) : (
                                    `${currency}${formatNumber(price(item))}`
                                )}
                            </div>
                            <div style={{ textAlign: 'right', fontSize: 11, color: SOFT, fontFamily: "'JetBrains Mono',monospace" }}>
                                {(item.type === 'Stationery' || item.type === 'Product') ? `${item.stock}${item.unit ? ' ' + item.unit : ''}` : '\u2014'}
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'center' }}>
                                <span style={{ fontSize: 8, fontWeight: 700, padding: '2px 5px', borderRadius: 4, textTransform: 'uppercase', background: item.type === 'Service' ? B100 : B50, color: item.type === 'Service' ? B7 : SOFT }}>
                                    {(item.type || '?').charAt(0)}
                                </span>
                            </div>
                        </button>
                    ))}
                </div>
            );
        }

        return items.map((item, idx) => (
            <button
                key={item.id}
                onMouseEnter={() => setActiveIndex(idx)}
                onClick={() => handleItemClick(item)}
                disabled={item.stock <= 0 && item.type === 'Stationery' && !item.isVariantParent}
                style={{
                    position: 'relative',
                    background: activeIndex === idx ? B100 : '#fff',
                    border: `1px solid ${activeIndex === idx ? B6 : LINE}`,
                    borderRadius: 10,
                    padding: viewMode === 'Small' ? 8 : 10,
                    textAlign: 'left',
                    cursor: item.stock <= 0 && item.type === 'Stationery' && !item.isVariantParent ? 'not-allowed' : 'pointer',
                    opacity: item.stock <= 0 && item.type === 'Stationery' && !item.isVariantParent ? 0.6 : 1,
                    fontFamily: "'Inter','DM Sans',sans-serif",
                    display: 'flex',
                    flexDirection: 'column',
                    height: '100%',
                    transition: '.12s',
                    filter: activeIndex === idx ? 'none' : 'none',
                    boxShadow: activeIndex === idx ? `0 0 0 2px ${B5}33` : 'none'
                }}
                onMouseOver={e => {
                    if (activeIndex !== idx) {
                        e.currentTarget.style.borderColor = B5;
                        e.currentTarget.style.boxShadow = `0 0 0 2px ${B5}22`;
                    }
                }}
                onMouseOut={e => {
                    if (activeIndex !== idx) {
                        e.currentTarget.style.borderColor = LINE;
                        e.currentTarget.style.boxShadow = 'none';
                    }
                }}
            >
                {companyConfig.transactionSettings?.pos?.showItemImages && (
                    <div style={{
                        width: '100%',
                        aspectRatio: '1',
                        background: B50,
                        marginBottom: 8,
                        overflow: 'hidden',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        borderRadius: 8,
                        border: `1px solid ${LINE}`
                    }}>
                        {item.image ? (
                            <img src={item.image} alt={item.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        ) : (
                            <Box size={viewMode === 'Small' ? 18 : 24} style={{ color: SOFT }} />
                        )}
                    </div>
                )}
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6, marginBottom: 4 }}>
                    <div style={{ padding: '4px 5px', borderRadius: 6, background: B50, color: SOFT, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        {getCategoryIcon(item.category)}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: viewMode === 'Small' ? 11 : 12.5, fontWeight: 600, color: INK, lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                            {item.name}
                        </div>
                        {viewMode !== 'Small' && (
                            <div style={{ fontSize: 9.5, color: SOFT, fontFamily: "'JetBrains Mono',monospace", marginTop: 2 }}>{item.sku}</div>
                        )}
                    </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 'auto', paddingTop: 6, borderTop: `1px solid ${LINE}` }}>
                    <div>
                        {item.isVariantParent ? (
                            <span style={{ fontSize: viewMode === 'Small' ? 11 : 13, fontWeight: 700, color: INK }}>
                                From&nbsp;{currency}{formatNumber(lowestVariantPrice(item))} <span style={{ fontSize: 9, color: SOFT }}>▼</span>
                            </span>
                        ) : (
                            <span style={{ fontSize: viewMode === 'Small' ? 11 : 13, fontWeight: 700, color: INK }}>
                                {currency}{formatNumber(price(item))}
                                {(item.type === 'Service' || item.category === 'Service') && item.pages ? <span style={{ fontSize: 9, fontWeight: 400, color: SOFT, marginLeft: 1 }}>/pg</span> : ''}
                            </span>
                        )}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        {(item.type === 'Stationery' || item.type === 'Product') && (
                            <span style={{ fontSize: 9.5, fontWeight: 500, color: item.stock <= item.minStockLevel ? RED : SOFT }}>
                                {item.stock} {item.unit}
                            </span>
                        )}
                        <span style={{ fontSize: 8, fontWeight: 700, padding: '2px 5px', borderRadius: 4, textTransform: 'uppercase', background: item.type === 'Service' ? B100 : B50, color: item.type === 'Service' ? B7 : SOFT }}>
                            {(item.type || '?').charAt(0)}
                        </span>
                    </div>
                </div>
                {item.stock <= 0 && item.type === 'Stationery' && !item.isVariantParent && (
                    <div style={{ position: 'absolute', inset: 0, background: 'rgba(255,255,255,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(0.5px)', borderRadius: 10 }}>
                        <span style={{ background: RED, color: '#fff', padding: '2px 8px', borderRadius: 4, fontSize: 8, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Out of Stock</span>
                    </div>
                )}
            </button>
        ));
    };

    return (
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden" style={{ background: PAPER, fontFamily: "'Inter','DM Sans',sans-serif" }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 16px', borderBottom: `1px solid ${LINE}`, background: B50 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ width: 26, height: 26, borderRadius: 6, background: B7, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11 }}>
                        <Grid size={12} />
                    </div>
                    <h3 style={{ margin: 0, fontSize: 14, fontFamily: "'Inter','DM Sans',sans-serif", fontWeight: 400, color: INK }}>Items</h3>
                    <span style={{ fontSize: 12, color: SOFT }}>{filteredProducts.length} item{filteredProducts.length !== 1 ? 's' : ''}</span>
                </div>
                <div className="flex items-center gap-3">
                    <div className="flex" style={{ border: `1px solid ${LINE}`, borderRadius: 8, overflow: 'hidden' }}>
                        {(['Large', 'Small', 'List'] as ViewMode[]).map(mode => (
                            <button
                                key={mode}
                                onClick={() => setViewMode(mode)}
                                style={{
                                    padding: '6px 10px',
                                    transition: '.15s',
                                    border: 'none',
                                    borderRight: mode !== 'List' ? `1px solid ${LINE}` : 'none',
                                    cursor: 'pointer',
                                    background: viewMode === mode ? B100 : '#fff',
                                    color: viewMode === mode ? B7 : SOFT,
                                    fontSize: 12,
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 4,
                                    fontFamily: "'Inter','DM Sans',sans-serif",
                                    fontWeight: viewMode === mode ? 600 : 400
                                }}
                            >
                                {mode === 'Large' ? <Grid size={13} /> : mode === 'Small' ? <Layout size={13} /> : <FileText size={13} />}
                                <span style={{ fontSize: 10, display: 'none' }}>{mode}</span>
                            </button>
                        ))}
                    </div>
                    <div style={{ width: 1, height: 20, background: LINE }} />
                    <button onClick={onRecall} style={{ color: B6, fontWeight: 600, fontSize: 12.5, border: 'none', background: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}>
                        <PauseCircle size={15} /> Recall ({heldCount})
                    </button>
                </div>
            </div>

            {/* Search */}
            <div style={{ padding: '10px 16px', background: '#fff', borderBottom: `1px solid ${LINE}` }}>
                <div style={{ position: 'relative' }}>
                    <Search size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: SOFT }} />
                    <input
                        ref={searchInputRef}
                        type="text"
                        style={{
                            width: '100%',
                            padding: '8px 12px 8px 36px',
                            borderRadius: 8,
                            border: `1px solid ${LINE}`,
                            outline: 'none',
                            fontSize: 13,
                            fontFamily: "'Inter','DM Sans',sans-serif",
                            color: INK,
                            background: PAPER,
                            boxSizing: 'border-box'
                        }}
                        placeholder="Find items (Alt+S)..."
                        value={searchTerm}
                        onChange={e => {
                            const val = e.target.value;
                            const isScanner = detectScannerInput();
                            setSearchTerm(val);
                            if (isScanner && val.trim()) {
                                const match = saleableInventory.find(
                                    p => p.barcode && p.barcode.toLowerCase() === val.trim().toLowerCase()
                                );
                                if (match) {
                                    autoAddItem(match);
                                }
                            }
                        }}
                        onFocus={() => setActiveIndex(-1)}
                        onKeyDown={handleSearchKeyDown}
                    />
                </div>
            </div>

            {companyConfig.transactionSettings?.pos?.showCategoryFilters !== false && (
                <div style={{ background: '#fff', borderBottom: `1px solid ${LINE}`, overflowX: 'auto' }}>
                    <div style={{ display: 'flex', gap: 6, padding: '8px 16px' }}>
                        {categoryGroups.map(g => {
                            const isActive = activeCategory === g.label;
                            return (
                                <button
                                    key={g.label}
                                    onClick={() => { setActiveCategory(g.label); setActiveIndex(-1); }}
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: 6,
                                        padding: '6px 14px',
                                        borderRadius: 20,
                                        border: isActive ? 'none' : `1px solid ${LINE}`,
                                        background: isActive ? B7 : '#fff',
                                        color: isActive ? '#fff' : INK,
                                        fontSize: 12,
                                        fontWeight: 600,
                                        cursor: 'pointer',
                                        fontFamily: "'Inter','DM Sans',sans-serif",
                                        whiteSpace: 'nowrap',
                                        transition: '.12s'
                                    }}
                                >
                                    {g.label !== 'All' && (
                                        <span style={{ color: isActive ? '#fff' : SOFT, display: 'flex' }}>
                                            {getCategoryIcon(g.label)}
                                        </span>
                                    )}
                                    <span>{g.label}</span>
                                </button>
                            )
                        })}
                    </div>
                </div>
            )}

            <div className="flex-1 overflow-y-auto custom-scrollbar" style={{ padding: viewMode === 'List' ? '0' : '12px 16px' }}>
                {filteredProducts.length === 0 && searchTerm ? (
                    <div className="flex flex-col items-center justify-center h-full min-h-[200px] text-center">
                        <div style={{ fontSize: 13, color: SOFT, marginBottom: 12 }}>No items found for "{searchTerm}"</div>
                        <button
                            type="button"
                            onClick={() => setShowCreateItemModal(true)}
                            style={{
                                display: 'inline-flex', alignItems: 'center', gap: 6,
                                padding: '8px 16px', fontSize: 13, fontWeight: 600,
                                color: '#fff', background: B7, border: 'none', borderRadius: 8,
                                cursor: 'pointer', transition: '.12s'
                            }}
                            onMouseOver={e => e.currentTarget.style.background = B6}
                            onMouseOut={e => e.currentTarget.style.background = B7}
                        >
                            <Plus size={14} />
                            <span>Create new item</span>
                        </button>
                    </div>
                ) : viewMode === 'List' ? (
                    renderItems(filteredProducts)
                ) : (
                    <div className="grid gap-3 content-start pb-20" style={{ gridTemplateColumns: `repeat(${gridCols}, minmax(0, 1fr))` }}>
                        {renderItems(filteredProducts)}
                    </div>
                )}
            </div>

            {showCreateItemModal && (
                <ItemModal
                    open={showCreateItemModal}
                    onClose={() => setShowCreateItemModal(false)}
                    onSave={async (item) => {
                        await inventoryAddItem(item);
                        addToCart(item);
                        setShowCreateItemModal(false);
                    }}
                    allItems={inventory}
                />
            )}

            {selectedProductForVariants && (
                selectedProductForVariants.variants && selectedProductForVariants.variants.length > 0 ? (
                    <VariantSelectorModal
                        product={selectedProductForVariants}
                        onSelect={handleVariantSelect}
                        onClose={() => setSelectedProductForVariants(null)}
                    />
                ) : (
                    <PrintingVariantModal
                        product={selectedProductForVariants}
                        bom={boms.find((b: any) =>
                            b.productId === selectedProductForVariants.id ||
                            (selectedProductForVariants.parentId && b.productId === selectedProductForVariants.parentId)
                        )}
                        materials={inventory}
                        onSelect={(virtualVariant) => {
                            addToCart(virtualVariant);
                            setSelectedProductForVariants(null);
                        }}
                        onClose={() => setSelectedProductForVariants(null)}
                    />
                )
            )}
        </div>
    );
};
