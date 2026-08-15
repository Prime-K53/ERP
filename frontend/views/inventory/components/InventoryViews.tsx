import React, { useState, useEffect, useRef } from 'react';
import ReactDOM from 'react-dom';
import { Edit2, Search, Eye, ArrowUp, ArrowDown, ArrowRight, Ruler, AlertCircle, Copy, Trash2, CheckSquare, Square, Warehouse as WarehouseIcon, MapPin, Package, Truck, ShieldCheck, MoreVertical, ChevronRight, SlidersHorizontal, DollarSign } from 'lucide-react';
import { Item, Warehouse } from '../../../types';
import { usePagination } from '../../../hooks/usePagination';
import Pagination from '../../../components/Pagination';
import PreviewButton from '../../../components/PreviewButton';
import { useAuth } from '../../../context/AuthContext';
import { useInventory } from '../../../context/InventoryContext';
import { useProcurement } from '../../../context/ProcurementContext';
import { useNavigate, useLocation } from 'react-router-dom';
import { useHighlight } from '../../../hooks/useHighlight';
import { formatParentProductPrice, formatMaterialItemCost } from '../../../utils/pricing';

const t = { 50: '#eef7f6', 100: '#d3ece9', 200: '#a6d9d3', 500: '#1f8577', 600: '#146b60', 700: '#0f544c', 800: '#0b3e39' };
const amber = { 100: '#fbead0', 500: '#d99a3f' };
const paper = '#FEFDFB', ink = '#23282A', inkSoft = '#5c6567', hairline = '#e4ddd1', danger = '#b5493f';

const btnSec: React.CSSProperties = { padding: '6px 12px', borderRadius: 9, border: `1.4px solid ${hairline}`, background: paper, color: inkSoft, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, transition: 'all .15s' };

const getServiceMaterials = (item: Item, allItems: Item[]): string => {
    const smartPricing = item.smartPricing || item.smartPricingSnapshot;
    if (!smartPricing) return '-';
    
    const materials: string[] = [];
    
    // Resolve Paper
    if (smartPricing.paperItemId) {
        const paper2 = allItems.find(i => i.id === smartPricing.paperItemId);
        if (paper2) {
            materials.push(paper2.name.replace(/\s*\d+gsm.*/i, ''));
        } else if (Number(smartPricing.paperCost) > 0) {
            materials.push('Paper');
        }
    } else if (Number(smartPricing.paperCost) > 0) {
        materials.push('Paper');
    }
    
    // Resolve Toner
    if (smartPricing.tonerItemId) {
        const toner = allItems.find(i => i.id === smartPricing.tonerItemId);
        if (toner) {
            materials.push(toner.name.replace(/\s*Universal\s*/i, ''));
        } else if (Number(smartPricing.tonerCost) > 0) {
            materials.push('Toner');
        }
    } else if (Number(smartPricing.tonerCost) > 0) {
        materials.push('Toner');
    }
    
    // Resolve Finishing Options
    const finishingEnabled = smartPricing.finishingEnabled || [];
    if (Array.isArray(finishingEnabled) && finishingEnabled.length > 0) {
        finishingEnabled.forEach((id: string) => {
            const name = id
                .replace(/([A-Z])/g, ' $1')
                .replace(/^./, str => str.toUpperCase());
            materials.push(name);
        });
    } else if (Number(smartPricing.finishingCost) > 0) {
        materials.push('Finishing');
    }
    
    return materials.length > 0 ? materials.join(', ') : '-';
};

interface ItemTableProps {
    items: Item[];
    warehouses: Warehouse[];
    suppliers?: any[];
    onEdit: (item: Item) => void;
    onView: (item: Item) => void;
    onPreview?: (item: Item) => void;
    onDuplicate: (item: Item) => void;
    onDelete: (id: string) => void;
    onBatchDelete: (ids: string[]) => void;
    onAdjust?: (item: Item) => void;
    onChangeType?: (item: Item) => void;
    onLoadToSPE?: (item: Item) => void;
    initialSearch?: string;
}

const useContextMenu = () => {
    const [openMenuId, setOpenMenuId] = useState<string | null>(null);
    const [menuPos, setMenuPos] = useState<{ x: number; y: number } | null>(null);
    const [activeSubmenu, setActiveSubmenu] = useState<string | null>(null);
    const menuRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
                setOpenMenuId(null);
                setMenuPos(null);
                setActiveSubmenu(null);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleRowClick = (e: React.MouseEvent, id: string) => {
        e.preventDefault();
        e.stopPropagation();
        if (openMenuId === id) {
            setOpenMenuId(null);
        } else {
            const root = document.documentElement;
            const rootRect = root.getBoundingClientRect();
            const zoom = rootRect.width / root.offsetWidth || 1;

            const x = e.clientX / zoom;
            const y = e.clientY / zoom;

            const menuWidth = 256;
            const menuHeight = 320;
            const vw = window.innerWidth / zoom;
            const vh = window.innerHeight / zoom;

            let finalX = x + 4;
            let finalY = y + 4;
            if (finalX + menuWidth > vw) finalX = x - menuWidth - 4;
            if (finalY + menuHeight > vh) finalY = y - menuHeight - 4;

            setMenuPos({ x: finalX, y: finalY });
            setOpenMenuId(id);
            setActiveSubmenu(null);
        }
    };

    return { openMenuId, menuPos, activeSubmenu, setActiveSubmenu, menuRef, handleRowClick, setOpenMenuId };
};

export const SkeletonLoader: React.FC<{ type: 'table' | 'grid' }> = ({ type }) => {
    if (type === 'table') {
        return (
            <div className="prime-card" style={{ display: 'flex', flexDirection: 'column', background: paper, borderRadius: 16, border: `1.4px solid ${hairline}`, animation: 'pulse 2s infinite' }}>
                <div style={{ padding: 12, borderBottom: `1.4px solid ${hairline}`, display: 'flex', gap: 12, background: t[50] }}>
                    <div style={{ height: 40, width: '100%', maxWidth: 400, background: t[100], borderRadius: 12 }}></div>
                    <div style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
                        {[1, 2, 3, 4, 5].map(i => <div key={i} style={{ height: 32, width: 64, background: t[100], borderRadius: 9 }}></div>)}
                    </div>
                </div>
                <div style={{ flex: 1 }}>
                    <div style={{ height: 40, background: t[100], borderBottom: `1.4px solid ${hairline}` }}></div>
                    {[1, 2, 3, 4, 5, 6, 7, 8].map(i => (
                        <div key={i} style={{ height: 48, borderBottom: `1.4px solid ${hairline}`, display: 'flex', alignItems: 'center', padding: '0 16px', gap: 16 }}>
                            <div style={{ height: 16, width: 16, background: t[100], borderRadius: 4 }}></div>
                            <div style={{ height: 16, flex: 1, background: t[100], borderRadius: 4 }}></div>
                            <div style={{ height: 16, width: '15%', background: t[100], borderRadius: 4 }}></div>
                            <div style={{ height: 16, width: '10%', background: t[100], borderRadius: 4 }}></div>
                            <div style={{ height: 16, width: '15%', background: t[100], borderRadius: 4 }}></div>
                        </div>
                    ))}
                </div>
            </div>
        );
    }
    return (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 24, flex: 1, padding: 4 }}>
            {[1, 2, 3, 4, 5, 6].map(i => (
                <div key={i} className="prime-card" style={{ padding: 24, borderRadius: 16, border: `1.4px solid ${hairline}`, animation: 'pulse 2s infinite' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24 }}>
                        <div style={{ width: 48, height: 48, borderRadius: 12, background: t[100] }}></div>
                        <div style={{ flex: 1 }}>
                            <div style={{ height: 16, width: 96, background: t[100], borderRadius: 4, marginBottom: 8 }}></div>
                            <div style={{ height: 12, width: 64, background: t[50], borderRadius: 4 }}></div>
                        </div>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24 }}>
                        <div style={{ height: 48, background: t[50], borderRadius: 12 }}></div>
                        <div style={{ height: 48, background: t[50], borderRadius: 12 }}></div>
                    </div>
                    <div style={{ height: 16, width: '100%', background: t[100], borderRadius: 4 }}></div>
                </div>
            ))}
        </div>
    );
};

export const ItemTable: React.FC<ItemTableProps> = ({
    items,
    warehouses,
    onEdit,
    onView,
    onPreview,
    onDuplicate,
    onDelete,
    onBatchDelete,
    onAdjust,
    onChangeType,
    onLoadToSPE,
    initialSearch = ''
}) => {
    const { companyConfig, notify } = useAuth();
    const { triggerReplenishment } = useInventory();
    const { suppliers } = useProcurement();
    const navigate = useNavigate();
    const currency = companyConfig.currencySymbol;

    const [searchTerm, setSearchTerm] = useState('');
    const [filterType, setFilterType] = useState<'Material' | 'Product' | 'Service' | 'Stationery'>('Product');
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const [sortField, setSortField] = useState<keyof Item | 'category'>('name');
    const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
    const [expandedIds, setExpandedIds] = useState<string[]>([]);
    const location = useLocation();
    useHighlight();
    const { openMenuId, menuPos, activeSubmenu, setActiveSubmenu, menuRef, handleRowClick, setOpenMenuId } = useContextMenu();

const showStockColumn = filterType === 'Material' || filterType === 'Stationery';
    const showServiceColumns = filterType === 'Service';
    const showMaterialColumns = filterType === 'Material';
    const showProductColumns = filterType === 'Product';
    const showStationeryColumns = filterType === 'Stationery';

    const currentItem = (items || []).find((i) => i.id === openMenuId);

    useEffect(() => { if (initialSearch) setSearchTerm(initialSearch); }, [initialSearch]);

    const renderMenu = (item: Item) => {
        if (!menuPos) return null;
        
        const x = menuPos.x;
        const y = menuPos.y;
        const menuWidth = 256;

        const isMaterial = item.type === 'Material' || item.type === 'Raw Material' || item.type === 'Stationery';
        const isProductOrService = item.type === 'Product' || item.type === 'Service';
        const currentType = item.type;
        
        const spaceOnRight = window.innerWidth - (x + menuWidth);
        const submenuDirectionClass = spaceOnRight < 160 ? "right-full" : "left-full";

        return ReactDOM.createPortal(
            <div
                ref={menuRef}
                className="prime-card"
                style={{ width: 256, background: paper, borderRadius: 12, boxShadow: '0 20px 25px rgba(0,0,0,0.15)', border: `1.4px solid ${hairline}`, display: 'flex', flexDirection: 'column', padding: '4px 0', textAlign: 'left', position: 'fixed', top: y, left: x, zIndex: 99999, animation: 'fadeIn 0.1s ease' }}
                onClick={(e) => e.stopPropagation()}
            >
                <div style={{ padding: '8px 16px', borderBottom: `1.4px solid ${hairline}`, fontSize: 10, fontWeight: 700, color: inkSoft, textTransform: 'uppercase', letterSpacing: 0.5, background: t[50], borderTopLeftRadius: 12, borderTopRightRadius: 12 }}>ITEM ACTIONS</div>
                <button onClick={() => { setOpenMenuId(null); onView(item); }} className="prime-btn-secondary" style={{ width: '100%', textAlign: 'left', padding: '8px 16px', fontSize: 12, fontWeight: 500, color: ink, background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12, transition: 'all .15s' }} onMouseEnter={e => e.currentTarget.style.background = t[50]} onMouseLeave={e => e.currentTarget.style.background = 'none'}><Eye size={14} /> View Details</button>
                <button onClick={() => { setOpenMenuId(null); onEdit(item); }} className="prime-btn-secondary" style={{ width: '100%', textAlign: 'left', padding: '8px 16px', fontSize: 12, fontWeight: 500, color: ink, background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12, transition: 'all .15s' }} onMouseEnter={e => e.currentTarget.style.background = amber[100]} onMouseLeave={e => e.currentTarget.style.background = 'none'}><Edit2 size={14} /> Edit Item</button>
                {isProductOrService && onLoadToSPE && (
                    <button onClick={() => { setOpenMenuId(null); onLoadToSPE(item); }} className="prime-btn-secondary" style={{ width: '100%', textAlign: 'left', padding: '8px 16px', fontSize: 12, fontWeight: 500, color: t[600], background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12, transition: 'all .15s' }} onMouseEnter={e => e.currentTarget.style.background = t[50]} onMouseLeave={e => e.currentTarget.style.background = 'none'}><DollarSign size={14} /> Load to SPE</button>
                )}
                {isMaterial && onAdjust && (
                    <button onClick={() => { setOpenMenuId(null); onAdjust(item); }} className="prime-btn-secondary" style={{ width: '100%', textAlign: 'left', padding: '8px 16px', fontSize: 12, fontWeight: 500, color: t[500], background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12, transition: 'all .15s' }} onMouseEnter={e => e.currentTarget.style.background = t[50]} onMouseLeave={e => e.currentTarget.style.background = 'none'}><SlidersHorizontal size={14} /> Adjust Stock</button>
                )}
                <div style={{ position: 'relative' }}>
                    <button className="prime-btn-secondary" style={{ width: '100%', textAlign: 'left', padding: '8px 16px', fontSize: 12, fontWeight: 500, background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, transition: 'all .15s', color: ink }} onMouseEnter={e => e.currentTarget.style.background = t[50]} onMouseLeave={e => e.currentTarget.style.background = 'none'}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 12 }}><ArrowRight size={14} /> Change Type</span>
                        <ChevronRight size={12} />
                    </button>
                </div>

                <div style={{ margin: '4px 0', borderTop: `1.4px solid ${hairline}` }}></div>
                <button onClick={() => { setOpenMenuId(null); onDuplicate(item); }} className="prime-btn-secondary" style={{ width: '100%', textAlign: 'left', padding: '8px 16px', fontSize: 12, fontWeight: 500, color: ink, background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12, transition: 'all .15s' }} onMouseEnter={e => e.currentTarget.style.background = t[50]} onMouseLeave={e => e.currentTarget.style.background = 'none'}><Copy size={14} /> Duplicate Item</button>

                {!item.isProtected && (
                    <>
                        <div style={{ margin: '4px 0', borderTop: `1.4px solid ${hairline}` }}></div>
                        <button onClick={() => { setOpenMenuId(null); onDelete(item.id); }} className="prime-btn-secondary" style={{ width: '100%', textAlign: 'left', padding: '8px 16px', fontSize: 12, color: danger, background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12, transition: 'all .15s' }} onMouseEnter={e => e.currentTarget.style.background = '#fef2f2'} onMouseLeave={e => e.currentTarget.style.background = 'none'}><Trash2 size={14} /> Delete</button>
                    </>
                )}
            </div>,
            document.body
        );
    };

    const handleSmartReplenish = async (item: Item) => {
        try {
            await triggerReplenishment(item.id);
            navigate('/purchases');
        } catch (e) {
            // Error handled in context
        }
    };

    const handleSort = (field: keyof Item | 'category') => {
        if (sortField === field) { setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc'); } else { setSortField(field); setSortDirection('asc'); }
    };

    const handleToggleSelect = (id: string) => {
        const item = items.find(i => i.id === id);
        if (item?.isProtected) {
            notify('Protected items cannot be selected for deletion', 'warning');
            return;
        }
        setSelectedIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
    };
    const handleSelectAll = () => {
        const selectableItems = currentItems.filter(i => !i.isProtected);
        setSelectedIds(selectedIds.length === selectableItems.length ? [] : selectableItems.map(i => i.id));
    };

    const handleToggleExpand = (e: React.MouseEvent, id: string) => {
        e.stopPropagation();
        setExpandedIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
    };

    const filteredItems = items.filter(item => {
        const matchesSearch = item.name.toLowerCase().includes(searchTerm.toLowerCase()) || item.sku.toLowerCase().includes(searchTerm.toLowerCase());
        const matchesType = item.type === filterType || (showMaterialColumns && (item.type === 'Material' || item.type === 'Raw Material')) || (showStationeryColumns && item.type === 'Stationery');
        return matchesSearch && matchesType;
    }).sort((a, b) => {
        let valA = a[sortField as keyof Item];
        let valB = b[sortField as keyof Item];
        if (typeof valA === 'string') valA = valA.toLowerCase();
        if (typeof valB === 'string') valB = valB.toLowerCase();
        if (valA < valB) return sortDirection === 'asc' ? -1 : 1;
        if (valA > valB) return sortDirection === 'asc' ? 1 : -1;
        return 0;
    });

    const { currentItems, currentPage, maxPage, totalItems, next, prev, first, last, setItemsPerPage, itemsPerPage } = usePagination(filteredItems, 50);

    const renderSortIcon = (field: keyof Item | 'category') => {
        if (sortField !== field) return null;
        return sortDirection === 'asc' ? <ArrowUp size={10} style={{ display: 'inline', marginLeft: 4 }} /> : <ArrowDown size={10} style={{ display: 'inline', marginLeft: 4 }} />;
    };

    const inputStyle: React.CSSProperties = { width: '100%', padding: '8px 40px 8px 36px', border: `1.4px solid ${hairline}`, borderRadius: 12, outline: 'none', fontSize: 13, background: paper, height: 40, fontFamily: "'Inter','DM Sans',sans-serif", lineHeight: 1.4, boxSizing: 'border-box' };
    const thStyle: React.CSSProperties = { padding: '10px 16px', fontSize: 11, fontWeight: 700, color: inkSoft, textTransform: 'uppercase', letterSpacing: 0.5 };
    const tdStyle: React.CSSProperties = { padding: '10px 16px', fontSize: 13, borderTop: `1.4px solid ${hairline}` };

    const StatusBadge = ({ status }: { status?: string }) => {
        const bg = status === 'Active' ? t[50] : status === 'Inactive' ? '#fef2f2' : amber[100];
        const color = status === 'Active' ? t[600] : status === 'Inactive' ? danger : amber[500];
        return (
            <span style={{ display: 'inline-flex', alignItems: 'center', padding: '4px 8px', borderRadius: 6, fontSize: 10, fontWeight: 600, background: bg, color: color, border: `1.4px solid ${bg}` }}>
                {status || 'Active'}
            </span>
        );
    };

    return (
        <div className="prime-card" style={{ display: 'flex', flexDirection: 'column', background: paper, borderRadius: 16, border: `1.4px solid ${hairline}`, boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>
            {openMenuId && menuPos && currentItem && renderMenu(currentItem)}
            <div style={{ padding: 12, borderBottom: `1.4px solid ${hairline}`, display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center', background: t[50] }}>
                <div style={{ position: 'relative', flex: 1, minWidth: 250 }}>
                    <Search style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: inkSoft, pointerEvents: 'none' }} size={16} />
                    <input
                        type="text"
                        name="inventorySearch"
                        placeholder="Search items..."
                        className="prime-input"
                        style={inputStyle}
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                    />
                </div>

                {selectedIds.length > 0 && (
                    <button onClick={() => { onBatchDelete(selectedIds); setSelectedIds([]); }} className="prime-btn-secondary"
                        style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '8px 16px', background: '#fef2f2', color: danger, border: `1.4px solid #fecaca`, borderRadius: 9, fontSize: 13, fontWeight: 500, cursor: 'pointer', transition: 'all .15s' }}>
                        <Trash2 size={14} /> Delete ({selectedIds.length})
                    </button>
                )}

                <div style={{ display: 'flex', alignItems: 'center', gap: 4, overflowX: 'auto', marginLeft: 'auto', background: paper, padding: 4, borderRadius: 12, border: `1.4px solid ${hairline}` }}>
                    {['Product', 'Material', 'Stationery', 'Service'].map(type => (
                        <button key={type} onClick={() => setFilterType(type as 'Product' | 'Material' | 'Stationery' | 'Service')} className="prime-btn-secondary"
                            style={{
                                padding: '6px 12px',
                                borderRadius: 9,
                                fontSize: 10,
                                fontWeight: 700,
                                transition: 'all .15s',
                                whiteSpace: 'nowrap',
                                textTransform: 'uppercase',
                                letterSpacing: 0.5,
                                background: filterType === type ? '#23282A' : 'transparent',
                                color: filterType === type ? '#fff' : inkSoft,
                                boxShadow: filterType === type ? '0 1px 2px rgba(0,0,0,0.05)' : 'none',
                                border: 'none',
                                cursor: 'pointer'
                            }}>{type}</button>
                    ))}
                </div>
            </div>
            <div>
                <table style={{ width: '100%', textAlign: 'left', tableLayout: 'fixed' }}>
                    <thead style={{ background: t[50], color: inkSoft, fontWeight: 700, borderBottom: `1.4px solid ${hairline}`, position: 'sticky', top: 0, zIndex: 10, boxShadow: '0 1px 2px rgba(0,0,0,0.03)' }}>
                        <tr>
                            <th className="prime-table-header" style={{ ...thStyle, width: 48, textAlign: 'center' }}>
                                <button onClick={handleSelectAll} className="prime-btn-secondary" style={{ background: 'none', border: 'none', cursor: 'pointer', color: inkSoft, padding: 0 }}>
                                    {selectedIds.length > 0 && selectedIds.length === currentItems.length ? <CheckSquare size={16} style={{ color: t[500] }} /> : <Square size={16} />}
                                </button>
                            </th>
                            {showServiceColumns ? (
                                <>
                                    <th className="prime-table-header" style={{ ...thStyle, width: '14%', cursor: 'pointer' }} onClick={() => handleSort('sku')}>SKU {renderSortIcon('sku')}</th>
                                    <th className="prime-table-header" style={{ ...thStyle, width: '24%', cursor: 'pointer' }} onClick={() => handleSort('name')}>Service Name {renderSortIcon('name')}</th>
                                    <th className="prime-table-header" style={{ ...thStyle, width: '14%' }}>Materials Used</th>
                                    <th className="prime-table-header" style={{ ...thStyle, width: '16%', textAlign: 'right', cursor: 'pointer' }} onClick={() => handleSort('price')}>Base Price {renderSortIcon('price')}</th>
                                    <th className="prime-table-header" style={{ ...thStyle, width: '12%', textAlign: 'right', cursor: 'pointer' }} onClick={() => handleSort('salesCount')}>Units {renderSortIcon('salesCount')}</th>
                                    <th className="prime-table-header" style={{ ...thStyle, width: '12%' }}>Status</th>
                                </>
                            ) : showMaterialColumns ? (
                                <>
                                    <th className="prime-table-header" style={{ ...thStyle, width: '14%', cursor: 'pointer' }} onClick={() => handleSort('sku')}>SKU {renderSortIcon('sku')}</th>
                                    <th className="prime-table-header" style={{ ...thStyle, width: '22%', cursor: 'pointer' }} onClick={() => handleSort('name')}>Material Name {renderSortIcon('name')}</th>
                                    <th className="prime-table-header" style={{ ...thStyle, width: '16%', cursor: 'pointer' }} onClick={() => handleSort('category')}>Category {renderSortIcon('category')}</th>
                                    <th className="prime-table-header" style={{ ...thStyle, width: '10%', textAlign: 'center' }}>Unit</th>
                                    <th className="prime-table-header" style={{ ...thStyle, width: '12%', cursor: 'pointer', textAlign: 'center' }} onClick={() => handleSort('stock')}>Stock {renderSortIcon('stock')}</th>
                                    <th className="prime-table-header" style={{ ...thStyle, width: '14%', textAlign: 'right', cursor: 'pointer' }} onClick={() => handleSort('cost')}>Cost Price {renderSortIcon('cost')}</th>
                                    <th className="prime-table-header" style={{ ...thStyle, width: '12%' }}>Status</th>
                                </>
                            ) : showProductColumns ? (
                                <>
                                    <th className="prime-table-header" style={{ ...thStyle, width: '14%', cursor: 'pointer' }} onClick={() => handleSort('sku')}>SKU {renderSortIcon('sku')}</th>
                                    <th className="prime-table-header" style={{ ...thStyle, width: '24%', cursor: 'pointer' }} onClick={() => handleSort('name')}>Product Name {renderSortIcon('name')}</th>
                                    <th className="prime-table-header" style={{ ...thStyle, width: '16%', cursor: 'pointer' }} onClick={() => handleSort('category')}>Category {renderSortIcon('category')}</th>
                                    <th className="prime-table-header" style={{ ...thStyle, width: '14%', textAlign: 'right', cursor: 'pointer' }} onClick={() => handleSort('price')}>Selling Price {renderSortIcon('price')}</th>
                                    <th className="prime-table-header" style={{ ...thStyle, width: '10%', textAlign: 'center' }}>Unit</th>
                                    <th className="prime-table-header" style={{ ...thStyle, width: '12%' }}>Status</th>
                                </>
                            ) : showStationeryColumns ? (
                                <>
                                    <th className="prime-table-header" style={{ ...thStyle, width: '14%', cursor: 'pointer' }} onClick={() => handleSort('sku')}>SKU {renderSortIcon('sku')}</th>
                                    <th className="prime-table-header" style={{ ...thStyle, width: '22%', cursor: 'pointer' }} onClick={() => handleSort('name')}>Item Name {renderSortIcon('name')}</th>
                                    <th className="prime-table-header" style={{ ...thStyle, width: '14%', cursor: 'pointer' }} onClick={() => handleSort('category')}>Category {renderSortIcon('category')}</th>
                                    <th className="prime-table-header" style={{ ...thStyle, width: '8%', textAlign: 'center' }}>Unit</th>
                                    <th className="prime-table-header" style={{ ...thStyle, width: '10%', cursor: 'pointer', textAlign: 'center' }} onClick={() => handleSort('stock')}>Stock {renderSortIcon('stock')}</th>
                                    <th className="prime-table-header" style={{ ...thStyle, width: '12%', textAlign: 'right', cursor: 'pointer' }} onClick={() => handleSort('cost')}>Cost Price {renderSortIcon('cost')}</th>
                                    <th className="prime-table-header" style={{ ...thStyle, width: '12%', textAlign: 'right', cursor: 'pointer' }} onClick={() => handleSort('price')}>Selling Price {renderSortIcon('price')}</th>
                                    <th className="prime-table-header" style={{ ...thStyle, width: '8%' }}>Status</th>
                                </>
                            ) : (
                                <>
                                    <th className="prime-table-header" style={{ ...thStyle, width: '33%', cursor: 'pointer' }} onClick={() => handleSort('name')}>Name {renderSortIcon('name')}</th>
                                    <th className="prime-table-header" style={{ ...thStyle, width: '15%', cursor: 'pointer' }} onClick={() => handleSort('sku')}>SKU {renderSortIcon('sku')}</th>
                                    {showStockColumn && <th className="prime-table-header" style={{ ...thStyle, width: '10%', cursor: 'pointer', textAlign: 'center' }} onClick={() => handleSort('stock')}>Stock {renderSortIcon('stock')}</th>}
                                    <th className="prime-table-header" style={{ ...thStyle, width: '15%', textAlign: 'right', cursor: 'pointer' }} onClick={() => handleSort('price')}>Price {renderSortIcon('price')}</th>
                                    <th className="prime-table-header" style={{ ...thStyle, width: '10%', textAlign: 'right', cursor: 'pointer' }} onClick={() => handleSort('salesCount')}>Units {renderSortIcon('salesCount')}</th>
                                </>
                            )}
                        </tr>
                    </thead>
                    <tbody>
                        {currentItems.length === 0 ? (
                            <tr>
                                <td colSpan={showMaterialColumns || showProductColumns || showServiceColumns || showStationeryColumns ? 8 : (showStockColumn ? 6 : 5)} style={{ padding: '80px 16px', textAlign: 'center' }}>
                                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: inkSoft, gap: 12 }}>
                                        <div style={{ width: 64, height: 64, background: t[50], borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', border: `1.4px solid ${hairline}`, boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.05)' }}>
                                            <Package size={32} strokeWidth={1.5} />
                                        </div>
                                        <div>
                                            <p style={{ color: ink, fontWeight: 700, fontSize: 13 }}>No items found</p>
                                            <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }}>Try adjusting your search or filter</p>
                                        </div>
                                    </div>
                                </td>
                            </tr>
                        ) : currentItems.map(item => {
                            const isLowStock = item.stock <= item.minStockLevel;
                            const isSelected = selectedIds.includes(item.id);
                            const isExpanded = expandedIds.includes(item.id);
                            const hasVariants = item.isVariantParent && item.variants && item.variants.length > 0;

                            return (
                                <React.Fragment key={`${item.id}-${item.sku}`}>
                                    {showServiceColumns ? (
                                        <tr
                                            id={`item-${item.id}`}
                                            className="prime-table-cell"
                                            style={{ transition: 'all .15s', cursor: 'pointer', background: isSelected ? t[50] : 'transparent', opacity: item.isProtected ? 0.95 : 1 }}
                                            onClick={(e) => handleRowClick(e, item.id)}
                                            onContextMenu={(e) => handleRowClick(e, item.id)}
                                            onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = amber[100]; }}
                                            onMouseLeave={e => { e.currentTarget.style.background = isSelected ? t[50] : 'transparent'; }}
                                        >
                                            <td className="prime-table-cell" style={{ ...tdStyle, textAlign: 'center' }} onClick={(e) => { e.stopPropagation(); handleToggleSelect(item.id); }}>
                                                {item.isProtected ? (
                                                    <ShieldCheck size={16} style={{ color: inkSoft, margin: '0 auto' }} />
                                                ) : (
                                                    isSelected ? <CheckSquare size={16} style={{ color: t[500], margin: '0 auto' }} /> : <Square size={16} style={{ color: inkSoft, margin: '0 auto' }} />
                                                )}
                                            </td>
                                            <td className="prime-table-cell" style={{ ...tdStyle, color: inkSoft, fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.serviceSku || item.sku}</td>
                                            <td className="prime-table-cell" style={{ ...tdStyle, fontWeight: 500, color: ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                    {item.isProtected && <ShieldCheck size={12} style={{ color: t[500], flexShrink: 0 }} />}
                                                    <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</div>
                                                </div>
                                            </td>
                                            <td className="prime-table-cell" style={{ ...tdStyle, color: inkSoft, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{getServiceMaterials(item, items)}</td>
                                            <td className="prime-table-cell" style={{ ...tdStyle, textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 700, color: t[500] }}>
                                                {formatParentProductPrice(item, currency)}
                                            </td>
                                            <td className="prime-table-cell" style={{ ...tdStyle, textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 700, color: inkSoft }}>
                                                {(item.salesCount || 0).toLocaleString()}
                                            </td>
                                            <td className="prime-table-cell" style={tdStyle}><StatusBadge status={item.status} /></td>
                                        </tr>
                                    ) : showMaterialColumns ? (
                                        <tr
                                            id={`item-${item.id}`}
                                            className="prime-table-cell"
                                            style={{ transition: 'all .15s', cursor: 'pointer', background: isSelected ? t[50] : 'transparent', opacity: item.isProtected ? 0.95 : 1 }}
                                            onClick={(e) => handleRowClick(e, item.id)}
                                            onContextMenu={(e) => handleRowClick(e, item.id)}
                                            onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = amber[100]; }}
                                            onMouseLeave={e => { e.currentTarget.style.background = isSelected ? t[50] : 'transparent'; }}
                                        >
                                            <td className="prime-table-cell" style={{ ...tdStyle, textAlign: 'center' }} onClick={(e) => { e.stopPropagation(); handleToggleSelect(item.id); }}>
                                                {item.isProtected ? (
                                                    <ShieldCheck size={16} style={{ color: inkSoft, margin: '0 auto' }} />
                                                ) : (
                                                    isSelected ? <CheckSquare size={16} style={{ color: t[500], margin: '0 auto' }} /> : <Square size={16} style={{ color: inkSoft, margin: '0 auto' }} />
                                                )}
                                            </td>
                                            <td className="prime-table-cell" style={{ ...tdStyle, color: inkSoft, fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.sku}</td>
                                            <td className="prime-table-cell" style={{ ...tdStyle, fontWeight: 500, color: ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                    {item.isProtected && <ShieldCheck size={12} style={{ color: t[500], flexShrink: 0 }} />}
                                                    <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</div>
                                                </div>
                                            </td>
                                            <td className="prime-table-cell" style={{ ...tdStyle, color: inkSoft, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.category || '-'}</td>
                                            <td className="prime-table-cell" style={{ ...tdStyle, textAlign: 'center', color: inkSoft }}>
                                                <span style={{ padding: '2px 6px', background: t[100], color: inkSoft, fontSize: 10, fontWeight: 700, borderRadius: 4, border: `1.4px solid ${hairline}`, textTransform: 'uppercase' }}>{item.unit}</span>
                                            </td>
                                            <td className="prime-table-cell" style={{ ...tdStyle, textAlign: 'center', fontVariantNumeric: 'tabular-nums', fontWeight: 700, color: inkSoft }}>
                                                {item.stock.toLocaleString()}
                                                {isLowStock && <AlertCircle size={12} style={{ display: 'inline', marginLeft: 4, color: danger }} />}
                                            </td>
                                            <td className="prime-table-cell" style={{ ...tdStyle, textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 700, color: danger }}>
                                                {formatMaterialItemCost(item, currency)}
                                            </td>
                                            <td className="prime-table-cell" style={tdStyle}><StatusBadge status={item.status} /></td>
                                        </tr>
                                    ) : showProductColumns ? (
                                        <tr
                                            id={`item-${item.id}`}
                                            className="prime-table-cell"
                                            style={{ transition: 'all .15s', cursor: 'pointer', background: isSelected ? t[50] : 'transparent', opacity: item.isProtected ? 0.95 : 1 }}
                                            onClick={(e) => handleRowClick(e, item.id)}
                                            onContextMenu={(e) => handleRowClick(e, item.id)}
                                            onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = amber[100]; }}
                                            onMouseLeave={e => { e.currentTarget.style.background = isSelected ? t[50] : 'transparent'; }}
                                        >
                                            <td className="prime-table-cell" style={{ ...tdStyle, textAlign: 'center' }} onClick={(e) => { e.stopPropagation(); handleToggleSelect(item.id); }}>
                                                {item.isProtected ? (
                                                    <ShieldCheck size={16} style={{ color: inkSoft, margin: '0 auto' }} />
                                                ) : (
                                                    isSelected ? <CheckSquare size={16} style={{ color: t[500], margin: '0 auto' }} /> : <Square size={16} style={{ color: inkSoft, margin: '0 auto' }} />
                                                )}
                                            </td>
                                            <td className="prime-table-cell" style={{ ...tdStyle, color: inkSoft, fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.sku}</td>
                                            <td className="prime-table-cell" style={{ ...tdStyle, fontWeight: 500, color: ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                    {item.isProtected && <ShieldCheck size={12} style={{ color: t[500], flexShrink: 0 }} />}
                                                    <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</div>
                                                </div>
                                            </td>
                                            <td className="prime-table-cell" style={{ ...tdStyle, color: inkSoft, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.category || '-'}</td>
                                            <td className="prime-table-cell" style={{ ...tdStyle, textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 700, color: t[500] }}>
                                                {formatParentProductPrice(item, currency)}
                                            </td>
                                            <td className="prime-table-cell" style={{ ...tdStyle, textAlign: 'center', color: inkSoft }}>
                                                <span style={{ padding: '2px 6px', background: t[100], color: inkSoft, fontSize: 10, fontWeight: 700, borderRadius: 4, border: `1.4px solid ${hairline}`, textTransform: 'uppercase' }}>{item.unit}</span>
                                            </td>
                                            <td className="prime-table-cell" style={tdStyle}><StatusBadge status={item.status} /></td>
                                        </tr>
                                    ) : showStationeryColumns ? (
                                        <tr
                                            id={`item-${item.id}`}
                                            className="prime-table-cell"
                                            style={{ transition: 'all .15s', cursor: 'pointer', background: isSelected ? t[50] : 'transparent', opacity: item.isProtected ? 0.95 : 1 }}
                                            onClick={(e) => handleRowClick(e, item.id)}
                                            onContextMenu={(e) => handleRowClick(e, item.id)}
                                            onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = amber[100]; }}
                                            onMouseLeave={e => { e.currentTarget.style.background = isSelected ? t[50] : 'transparent'; }}
                                        >
                                            <td className="prime-table-cell" style={{ ...tdStyle, textAlign: 'center' }} onClick={(e) => { e.stopPropagation(); handleToggleSelect(item.id); }}>
                                                {item.isProtected ? (
                                                    <ShieldCheck size={16} style={{ color: inkSoft, margin: '0 auto' }} />
                                                ) : (
                                                    isSelected ? <CheckSquare size={16} style={{ color: t[500], margin: '0 auto' }} /> : <Square size={16} style={{ color: inkSoft, margin: '0 auto' }} />
                                                )}
                                            </td>
                                            <td className="prime-table-cell" style={{ ...tdStyle, color: inkSoft, fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.sku}</td>
                                            <td className="prime-table-cell" style={{ ...tdStyle, fontWeight: 500, color: ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                    {item.isProtected && <ShieldCheck size={12} style={{ color: t[500], flexShrink: 0 }} />}
                                                    <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</div>
                                                </div>
                                            </td>
                                            <td className="prime-table-cell" style={{ ...tdStyle, color: inkSoft, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.category || "-"}</td>
                                            <td className="prime-table-cell" style={{ ...tdStyle, textAlign: 'center', color: inkSoft }}>
                                                <span style={{ padding: '2px 6px', background: t[100], color: inkSoft, fontSize: 10, fontWeight: 700, borderRadius: 4, border: `1.4px solid ${hairline}`, textTransform: 'uppercase' }}>{item.unit}</span>
                                            </td>
                                            <td className="prime-table-cell" style={{ ...tdStyle, textAlign: 'center', fontVariantNumeric: 'tabular-nums', fontWeight: 700, color: inkSoft }}>
                                                {item.stock.toLocaleString()}
                                                {isLowStock && <AlertCircle size={12} style={{ display: 'inline', marginLeft: 4, color: danger }} />}
                                            </td>
                                            <td className="prime-table-cell" style={{ ...tdStyle, textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 700, color: danger }}>
                                                {formatMaterialItemCost(item, currency)}
                                            </td>
                                            <td className="prime-table-cell" style={{ ...tdStyle, textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 700, color: t[500] }}>
                                                {formatParentProductPrice(item, currency)}
                                            </td>
                                            <td className="prime-table-cell" style={tdStyle}><StatusBadge status={item.status} /></td>
                                        </tr>
                                    ) : (
                                        <tr className="prime-table-cell"
                                            style={{ transition: 'all .15s', cursor: 'pointer', background: isSelected ? t[50] : isExpanded ? t[50] : 'transparent', opacity: item.isProtected ? 0.95 : 1 }}
                                            onClick={(e) => handleRowClick(e, item.id)}
                                            onContextMenu={(e) => handleRowClick(e, item.id)}
                                            onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = amber[100]; }}
                                            onMouseLeave={e => { e.currentTarget.style.background = isSelected || isExpanded ? t[50] : 'transparent'; }}
                                        >
                                            <td className="prime-table-cell" style={{ ...tdStyle, textAlign: 'center' }} onClick={(e) => { e.stopPropagation(); handleToggleSelect(item.id); }}>
                                                {item.isProtected ? (
                                                    <ShieldCheck size={16} style={{ color: inkSoft, margin: '0 auto' }} />
                                                ) : (
                                                    isSelected ? <CheckSquare size={16} style={{ color: t[500], margin: '0 auto' }} /> : <Square size={16} style={{ color: inkSoft, margin: '0 auto' }} />
                                                )}
                                            </td>
                                            <td className="prime-table-cell" style={{ ...tdStyle, fontWeight: 500, color: ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                    {item.isProtected && <ShieldCheck size={12} style={{ color: t[500], flexShrink: 0 }} />}
                                                    {hasVariants && (
                                                        <button onClick={(e) => handleToggleExpand(e, item.id)} className="prime-btn-secondary"
                                                            style={{ padding: 4, background: 'transparent', borderRadius: 4, border: 'none', cursor: 'pointer', color: inkSoft, transition: 'all .15s' }}
                                                            onMouseEnter={e => e.currentTarget.style.background = t[100]}
                                                            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                                                            {isExpanded ? <ArrowDown size={12} /> : <ArrowRight size={12} />}
                                                        </button>
                                                    )}
                                                    <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                        {item.name}
                                                        {(item.type === 'Raw Material' || item.type === 'Material') && (item as any).rawMaterialCategory === 'non_consumable' && (
                                                            <span style={{ marginLeft: 8, padding: '2px 6px', background: amber[100], color: amber[500], fontSize: 10, fontWeight: 700, borderRadius: 6, border: `1.4px solid ${amber[100]}`, textTransform: 'uppercase', letterSpacing: 0.5 }}>Non-Consumable</span>
                                                        )}
                                                        {(item.type === 'Raw Material' || item.type === 'Material') && (!(item as any).rawMaterialCategory || (item as any).rawMaterialCategory === 'consumable') && (
                                                            <span style={{ marginLeft: 8, padding: '2px 6px', background: t[50], color: t[500], fontSize: 10, fontWeight: 700, borderRadius: 6, border: `1.4px solid ${t[100]}`, textTransform: 'uppercase', letterSpacing: 0.5 }}>Consumable</span>
                                                        )}
                                                        {hasVariants && <span style={{ marginLeft: 8, padding: '2px 6px', background: t[50], color: t[600], fontSize: 10, fontWeight: 700, borderRadius: 6, border: `1.4px solid ${t[100]}`, textTransform: 'uppercase', letterSpacing: 0.5 }}>Variants: {item.variants?.length}</span>}
                                                        {item.isLargeFormat && <div style={{ fontSize: 10, color: t[500], display: 'flex', alignItems: 'center', gap: 4, marginTop: 2, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }}><Ruler size={10} /> Roll: {item.rollWidth}cm</div>}
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="prime-table-cell" style={{ ...tdStyle, color: inkSoft, fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.sku}</td>
                                            {showStockColumn && (
                                            <td className="prime-table-cell" style={{ ...tdStyle, textAlign: 'center', fontVariantNumeric: 'tabular-nums', fontWeight: 700, color: inkSoft }}>
                                                <>
                                                    {item.stock.toLocaleString()} <span style={{ fontSize: 10, fontWeight: 700, color: inkSoft, textTransform: 'uppercase', letterSpacing: 0.5 }}>{item.unit}</span>
                                                    {isLowStock && <AlertCircle size={12} style={{ display: 'inline', marginLeft: 4, color: danger }} />}
                                                </>
                                            </td>
                                            )}
                                            <td className="prime-table-cell" style={{ ...tdStyle, textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 700, color: (item.type === 'Raw Material' || item.type === 'Material') ? danger : t[500] }}>
                                                {(item.type === 'Raw Material' || item.type === 'Material') ? formatMaterialItemCost(item, currency) : formatParentProductPrice(item, currency)}
                                                {item.pricingConfig?.manualOverride && (
                                                    <span style={{ marginLeft: 4, fontSize: 9, color: t[500], fontWeight: 700 }} title="Manual Override">*</span>
                                                )}
                                            </td>
                                            <td className="prime-table-cell" style={{ ...tdStyle, textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 700, color: inkSoft }}>
                                                {(item.type === 'Raw Material' || item.type === 'Material')
                                                    ? Math.max(0, (item.stock || 0) - (item.reserved || 0)).toLocaleString()
                                                    : (item.salesCount || 0).toLocaleString()
                                                }
                                            </td>
                                        </tr>
                                    )}

                                    {isExpanded && hasVariants && !showServiceColumns && item.variants?.map((variant: any) => (
                                        <tr key={variant.id} id={`variant-${variant.id}`} className="prime-table-cell"
                                            style={{ background: t[50], transition: 'all .15s', borderLeft: `4px solid ${t[500]}` }}
                                            onMouseEnter={e => e.currentTarget.style.background = t[50]}
                                            onMouseLeave={e => e.currentTarget.style.background = t[50]}>
                                            <td className="prime-table-cell" style={tdStyle}></td>
                                            <td className="prime-table-cell" style={{ ...tdStyle, paddingLeft: 48 }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                    <div style={{ width: 6, height: 6, borderRadius: '50%', background: t[500] }}></div>
                                                    <span style={{ fontWeight: 700, color: inkSoft }}>{variant.name}</span>
                                                    <div style={{ display: 'flex', gap: 4 }}>
                                                        {Object.entries(variant.attributes || {}).map(([k, v]) => (
                                                            <span key={k} style={{ fontSize: 10, background: t[100], color: inkSoft, padding: '2px 4px', borderRadius: 4, textTransform: 'uppercase', fontWeight: 700, letterSpacing: 0.5 }}>{k}: {String(v)}</span>
                                                        ))}
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="prime-table-cell" style={{ ...tdStyle, fontFamily: 'monospace', color: inkSoft }}>{variant.sku}</td>
                                            {showStockColumn && (
                                            <td className="prime-table-cell" style={{ ...tdStyle, textAlign: 'center', fontVariantNumeric: 'tabular-nums', fontWeight: 700, color: inkSoft }}>
                                                <>{variant.stock.toLocaleString()} <span style={{ fontSize: 10, fontWeight: 700, color: inkSoft, textTransform: 'uppercase', letterSpacing: 0.5 }}>{item.unit}</span></>
                                            </td>
                                            )}
                                            <td className="prime-table-cell" style={{ ...tdStyle, textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 700, color: (item.type === 'Raw Material' || item.type === 'Material') ? danger : t[500] }}>
                                                {currency}{((item.type === 'Raw Material' || item.type === 'Material') ? variant.cost : variant.price).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                            </td>
                                            <td className="prime-table-cell" style={{ ...tdStyle, textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: inkSoft, fontWeight: 500 }}>
                                                {(item.type === 'Raw Material' || item.type === 'Material')
                                                    ? Math.max(0, (variant.stock || 0) - (variant.reserved || 0)).toLocaleString()
                                                    : (variant.salesCount || 0).toLocaleString()
                                            }
                                            </td>
                                        </tr>
                                    ))}
                                </React.Fragment>
                            )
                        })
                    }
                    </tbody>
                </table>
            </div>
            <Pagination currentPage={currentPage} maxPage={maxPage} totalItems={totalItems} itemsPerPage={itemsPerPage} onNext={next} onPrev={prev} onFirst={first} onLast={last} onItemsPerPageChange={setItemsPerPage} />
        </div>
    );
};

export const WarehouseGrid: React.FC<{ warehouses: Warehouse[]; inventory: Item[]; }> = ({ warehouses, inventory }) => {
    if (warehouses.length === 0) {
        return (
            <div className="prime-card" style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 80, color: inkSoft, background: paper, borderRadius: 16, border: `1.4px solid ${hairline}` }}>
                <div style={{ width: 80, height: 80, background: t[50], borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', border: `1.4px solid ${hairline}`, marginBottom: 16 }}>
                    <WarehouseIcon size={40} strokeWidth={1.5} />
                </div>
                <h3 style={{ color: ink, fontWeight: 600, fontSize: 18 }}>No Warehouses Defined</h3>
                <p style={{ fontSize: 14, maxWidth: 320, textAlign: 'center', marginTop: 4 }}>Add a warehouse to start tracking stock across multiple locations.</p>
            </div>
        );
    }
    return (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 24, flex: 1, padding: 4 }}>
            {warehouses.map(wh => {
                const stockCount = inventory.reduce((sum, item) => { const loc = item.locationStock?.find(l => l.warehouseId === wh.id); return sum + (loc ? loc.quantity : 0); }, 0);
                const distinctItems = inventory.filter(i => i.locationStock?.some(l => l.warehouseId === wh.id && l.quantity > 0)).length;
                return (
                    <div key={wh.id} className="prime-card" style={{ padding: 24, borderRadius: 16, border: `1.4px solid ${hairline}`, background: paper, boxShadow: '0 1px 2px rgba(0,0,0,0.05)', transition: 'all .3s' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                                <div style={{ width: 48, height: 48, borderRadius: 12, background: t[50], color: t[500], display: 'flex', alignItems: 'center', justifyContent: 'center', border: `1.4px solid ${t[100]}`, boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>
                                    <WarehouseIcon size={24} />
                                </div>
                                <div>
                                    <h3 style={{ fontSize: 14, fontWeight: 600, color: ink }}>{wh.name}</h3>
                                    <p style={{ fontSize: 10, color: inkSoft, fontFamily: 'monospace', textTransform: 'uppercase', fontWeight: 400 }}>{wh.id}</p>
                                </div>
                            </div>
                            <span style={{ padding: '4px 12px', background: t[100], color: inkSoft, borderRadius: 9, fontSize: 10, fontWeight: 700, border: `1.4px solid ${hairline}`, textTransform: 'uppercase', letterSpacing: 0.5 }}>{wh.type}</span>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24 }}>
                            <div style={{ padding: 12, background: t[50], borderRadius: 12, textAlign: 'center', border: `1.4px solid ${hairline}` }}>
                                <div style={{ fontSize: 13, fontWeight: 700, color: ink, fontVariantNumeric: 'tabular-nums' }}>{stockCount.toLocaleString()}</div>
                                <div style={{ fontSize: 10, color: inkSoft, textTransform: 'uppercase', fontWeight: 700, letterSpacing: 0.5 }}>Units</div>
                            </div>
                            <div style={{ padding: 12, background: t[50], borderRadius: 12, textAlign: 'center', border: `1.4px solid ${hairline}` }}>
                                <div style={{ fontSize: 13, fontWeight: 700, color: ink, fontVariantNumeric: 'tabular-nums' }}>{distinctItems.toLocaleString()}</div>
                                <div style={{ fontSize: 10, color: inkSoft, textTransform: 'uppercase', fontWeight: 700, letterSpacing: 0.5 }}>SKUs</div>
                            </div>
                        </div>
                        <div style={{ fontSize: 12.5, color: inkSoft, borderTop: `1.4px solid ${hairline}`, paddingTop: 16, display: 'flex', alignItems: 'center', gap: 8, fontWeight: 400 }}>
                            <MapPin size={14} /> <span style={{ fontWeight: 500, color: inkSoft }}>{wh.location}</span>
                        </div>
                    </div>
                )
            })}
        </div>
    );
};