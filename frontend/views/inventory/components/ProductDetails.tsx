import React, { useEffect, useMemo, useState } from 'react';
import {
    ArrowLeft, ArrowRight, Edit2, Printer, Activity, Package, DollarSign,
    TrendingUp, AlertTriangle, Factory, Truck, ShoppingCart,
    Calendar, FileText, Layers, BarChart3, ArrowRightLeft, X, Sparkles, Loader2, Recycle, ClipboardCheck, Calculator, ShieldCheck, Trash2, TrendingDown, Award, PieChart as PieChartIcon, RefreshCw
} from 'lucide-react';
import {
    AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, PieChart, Pie, Cell
} from 'recharts';
import { useNavigate } from 'react-router-dom';
import { Item, Sale, Purchase, ProductionBatch, WorkOrder } from '../../../types';
import { useAuth } from '../../../context/AuthContext';
import { useInventory } from '../../../context/InventoryContext';
import { useSales } from '../../../context/SalesContext';
import { useProcurement } from '../../../context/ProcurementContext';
import { useProduction } from '../../../context/ProductionContext';
import { OfflineImage } from '../../../components/OfflineImage';
import { generateAIResponse } from '../../../services/geminiService';
import ReactMarkdown from 'react-markdown';
import { AuditTimeline } from '../../shared/components/AuditTimeline';
import { ConfirmDialog, ConfirmDialogType } from '../../../components/ConfirmDialog';
import { generateNextId } from '../../../utils/helpers';

const t = { 50: '#eef7f6', 100: '#d3ece9', 200: '#a6d9d3', 500: '#1f8577', 600: '#146b60', 700: '#0f544c', 800: '#0b3e39' };
const amber = { 100: '#fbead0', 500: '#d99a3f', 200: '#f5d8a0' };
const paper = '#FEFDFB', ink = '#23282A', inkSoft = '#5c6567', hairline = '#e4ddd1', danger = '#b5493f';

interface ProductDetailsProps {
    item: Item;
    onBack: () => void;
    onEdit: (item: Item) => void;
    onAdjust: (item: Item) => void;
    onUpdate?: (item: Item) => void;
}

const btnSec: React.CSSProperties = { padding: '6px 12px', borderRadius: 9, border: `1.4px solid ${hairline}`, background: paper, color: inkSoft, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, transition: 'all .15s' };
const cardInner: React.CSSProperties = { background: paper, borderRadius: 16, border: `1.4px solid ${hairline}`, padding: 24, boxShadow: '0 1px 2px rgba(0,0,0,0.05)' };

const ProductDetails: React.FC<ProductDetailsProps> = ({ item, onBack, onEdit, onAdjust, onUpdate }) => {
    const { companyConfig, isOnline, notify, auditLogs } = useAuth();
    const { inventory, updateItem, recalculatePrice } = useInventory();
    const { sales } = useSales();
    const { purchases, addPurchase } = useProcurement();
    const { boms, batches, workOrders } = useProduction();
    const navigate = useNavigate();
    const currency = companyConfig.currencySymbol;
    const [activeTab, setActiveTab] = useState<'Overview' | 'Variants' | 'Logistics' | 'Sales History' | 'Purchase History' | 'Stock Log' | 'Analytics' | 'Security'>('Overview');
    const [showLabelModal, setShowLabelModal] = useState(false);
    const [selectedVariantFilter, setSelectedVariantFilter] = useState<string>('all');
    const [isRepricing, setIsRepricing] = useState(false);
    const [confirmState, setConfirmState] = useState<{ open: boolean; title: string; message: string; confirmText?: string; type?: ConfirmDialogType; onConfirm?: () => void }>({ open: false, title: '', message: '' });

    // Variant Detection
    const hasVariants = item.isVariantParent && item.variants && item.variants.length > 0;
    const variants = item.variants || [];
    const normalizedItemType = String(item.type || '');
    const supportsStockRecords = normalizedItemType === 'Stationery' || normalizedItemType === 'Raw Material' || normalizedItemType === 'Material' || normalizedItemType === 'Product';
    const visibleTabs = useMemo(() => {
        const baseTabs: Array<'Overview' | 'Variants' | 'Logistics' | 'Sales History' | 'Purchase History' | 'Analytics' | 'Security'> = [
            'Overview',
            'Variants',
            'Logistics',
            'Sales History',
            'Purchase History',
            'Analytics',
            'Security'
        ];

        if (supportsStockRecords) {
            return [...baseTabs.slice(0, 5), 'Stock Log', ...baseTabs.slice(5)] as Array<'Overview' | 'Variants' | 'Logistics' | 'Sales History' | 'Purchase History' | 'Stock Log' | 'Analytics' | 'Security'>;
        }

        return baseTabs;
    }, [supportsStockRecords]);

    useEffect(() => {
        if (!visibleTabs.includes(activeTab)) {
            setActiveTab('Overview');
        }
    }, [activeTab, visibleTabs]);

    // Calculate aggregated stock from variants
    const variantTotalStock = useMemo(() => {
        if (!supportsStockRecords) return 0;
        if (!hasVariants) return item.stock;
        return variants.reduce((sum, v) => sum + (v.stock || 0), 0);
    }, [hasVariants, item.stock, supportsStockRecords, variants]);

    // Variant Sales Analytics
    const variantSalesData = useMemo(() => {
        if (!hasVariants) return [];

        const variantStats: Record<string, { unitsSold: number; revenue: number; name: string; sku: string; stock: number; cost: number; price: number }> = {};

        // Initialize all variants
        variants.forEach(v => {
            variantStats[v.id] = {
                unitsSold: 0,
                revenue: 0,
                name: v.name,
                sku: v.sku,
                stock: supportsStockRecords ? (v.stock || 0) : 0,
                cost: v.cost || 0,
                price: v.price || 0
            };
        });

        // Aggregate sales by variant
        sales.forEach(sale => {
            sale.items.forEach(saleItem => {
                // Check if this sale item matches a variant (by variant ID or SKU match)
                const variant = variants.find(v => v.id === saleItem.id || v.sku === saleItem.sku || saleItem.id?.includes(v.id));
                if (variant && variantStats[variant.id]) {
                    variantStats[variant.id].unitsSold += saleItem.quantity || 0;
                    variantStats[variant.id].revenue += (saleItem.price || 0) * (saleItem.quantity || 0);
                }
            });
        });

        return Object.entries(variantStats).map(([id, data]) => ({
            id,
            ...data,
            profit: data.revenue - (data.unitsSold * data.cost),
            margin: data.revenue > 0 ? ((data.revenue - (data.unitsSold * data.cost)) / data.revenue) * 100 : 0
        })).sort((a, b) => b.unitsSold - a.unitsSold);
    }, [hasVariants, sales, supportsStockRecords, variants]);

    // Top performing variant
    const topVariant = variantSalesData.length > 0 ? variantSalesData[0] : null;

    // Variant Stock Distribution for Pie Chart
    const variantStockChartData = useMemo(() => {
        if (!hasVariants || !supportsStockRecords) return [];
        const colors = ['#1f8577', '#146b60', '#0b3e39', '#a6d9d3', '#d3ece9', '#eef7f6', '#0f544c', '#5c6567'];
        return variants.map((v, idx) => ({
            name: v.name,
            value: v.stock || 0,
            color: colors[idx % colors.length]
        }));
    }, [hasVariants, supportsStockRecords, variants]);

    // Variant Sales Chart Data
    const variantSalesChartData = useMemo(() => {
        return variantSalesData.slice(0, 10).map(v => ({
            name: v.name.length > 15 ? v.name.substring(0, 15) + '...' : v.name,
            'Units Sold': v.unitsSold,
            'Revenue': v.revenue
        }));
    }, [variantSalesData]);

    // AI State
    const [aiPriceSuggestion, setAiPriceSuggestion] = useState('');
    const [isAiPricingLoading, setIsAiPricingLoading] = useState(false);

    const handlePrintLabel = () => {
        const printContent = document.getElementById('product-label-printable');
        if (printContent) {
            const printWindow = window.open('', '_blank');
            if (printWindow) {
                printWindow.document.write(`
          <html>
            <head>
              <title>Print Label</title>
              <style>
                body { font-family: sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; }
                .label { border: 2px solid black; padding: 20px; border-radius: 10px; width: 300px; }
                .title { font-size: 20px; font-weight: bold; margin-bottom: 10px; }
                .barcode { font-family: 'Libre Barcode 39', cursive; font-size: 40px; text-align: center; margin: 15px 0; }
                .footer { display: flex; justify-content: space-between; align-items: flex-end; }
                .sku { font-family: monospace; font-size: 14px; font-weight: bold; }
                .price { font-size: 24px; font-weight: bold; }
              </style>
            </head>
            <body>
              <div class="label">
                <div class="title">${item.name}</div>
                <div class="barcode">||| |||| || |||||| |||</div>
                <div class="footer">
                  <div class="sku">${item.sku}</div>
                  <div class="price">${currency}${(item.type === 'Raw Material' ? item.cost : item.price || 0).toFixed(2)}</div>
                </div>
              </div>
              <script>
                window.onload = () => {
                  window.print();
                  window.close();
                };
              <\/script>
            </body>
          </html>
        `);
                printWindow.document.close();
            }
        }
    };

    // --- Logic Updates ---

    const calculateWastePercent = () => {
        let totalUsed = 0;
        let totalWasted = 0;

        (workOrders as WorkOrder[]).forEach(wo => {
            wo.logs?.forEach(log => {
                if (log.materialId === item.id) {
                    if (log.action === 'Complete' || log.action === 'Log Waste') {
                        const qty = log.qtyProcessed || 0;
                        if (log.action === 'Log Waste') totalWasted += qty;
                        else totalUsed += qty;
                    }
                }
            });
        });

        if (totalUsed + totalWasted === 0) return 0;
        return (totalWasted / (totalUsed + totalWasted)) * 100;
    };

    const wastePct = useMemo(() => calculateWastePercent(), [workOrders, item.id]);

    // 1. Inventory Logic
    const stockOnOrder = purchases
        .filter(p => supportsStockRecords && (p.status === 'Ordered' || p.status === 'Partially Received'))
        .reduce((sum, p) => {
            const line = p.items.find(i => i.itemId === item.id);
            return sum + (line ? (line.quantity - (line.receivedQty || 0)) : 0);
        }, 0);

    const stockAllocated = workOrders
        .filter(wo => supportsStockRecords && ['Scheduled', 'In Progress'].includes(wo.status))
        .reduce((sum, wo) => {
            const bom = boms.find(b => b.id === wo.bomId);
            const comp = bom?.components.find(c => c.materialId === item.id);
            if (comp) {
                return sum + (comp.quantity * (wo.quantityPlanned - wo.quantityCompleted));
            }
            return sum;
        }, 0);

    const stockAvailable = supportsStockRecords ? item.stock - stockAllocated : 0;

    // Logistics & Supply Chain Info
    const logisticsData = [
        { label: 'Bin Location', value: item.binLocation || 'Not Assigned', icon: Package, color: inkSoft },
        { label: 'QC Status', value: item.qcStatus || 'Passed', icon: ClipboardCheck, color: item.qcStatus === 'Failed' ? danger : t[500] },
        { label: 'Lead Time', value: `${item.leadTimeDays || 0} Days`, icon: Calendar, color: t[500] },
        { label: 'MOQ', value: `${item.minOrderQty || 0} ${item.unit}`, icon: ShoppingCart, color: t[500] },
        { label: 'Reorder Point', value: `${item.reorderPoint || 0} ${item.unit}`, icon: AlertTriangle, color: inkSoft },
        { label: 'Manufacturer', value: item.manufacturer || 'N/A', icon: Factory, color: inkSoft },
    ];

    // 2. Financials
    const lastPurchase = purchases
        .filter(p => p.items.some(i => i.itemId === item.id))
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];

    const lastCost = lastPurchase?.items.find(i => i.itemId === item.id)?.cost || item.cost || 0;

    const netSellingPrice = item.type === 'Raw Material' ? item.cost : item.price;

    const margin = netSellingPrice > 0 ? ((netSellingPrice - lastCost) / netSellingPrice) * 100 : 0;

    const handleCreatePO = () => {
        const id = generateNextId('PO', purchases, companyConfig);
        addPurchase({
            id,
            date: new Date().toISOString(),
            supplierId: item.preferredSupplierId || 'SUP-0001',
            items: [{ id: item.id, itemId: item.id, name: item.name, quantity: item.minStockLevel || 100, price: item.cost || 0, cost: item.cost || 0, receivedQty: 0 }],
            totalAmount: (item.cost || 0) * (item.minStockLevel || 100),
            status: 'Draft'
        });
        notify(`Draft PO ${id} created for ${item.name}`, 'success');
        navigate('/purchases');
    };

    const handleRecalculatePrice = async () => {
        if (typeof recalculatePrice !== 'function') return;
        setIsRepricing(true);
        try {
            const updated = await recalculatePrice(item.id);
            if (updated && onUpdate) {
                onUpdate(updated);
            }
        } finally {
            setIsRepricing(false);
        }
    };

    // 3. Activity Timeline
    const stockLog = useMemo(() => {
        if (!supportsStockRecords) return [];
        const events: any[] = [];
        sales.forEach(s => {
            const line = s.items.find(i => i.id === item.id);
            if (line) {
                events.push({
                    date: s.date, type: 'Sale', ref: s.id, qty: -line.quantity,
                    price: line.price, entity: s.customerName, details: `Sold ${line.quantity} units`
                });
            }
        });
        purchases.forEach(p => {
            const line = p.items.find(i => i.itemId === item.id);
            if (line) {
                events.push({
                    date: p.date, type: 'Purchase', ref: p.id, qty: line.quantity,
                    price: line.cost, entity: p.supplierId, details: `Purchased ${line.quantity} units`
                });
            }
        });
        batches.forEach(b => {
            const bom = boms.find(bm => bm.id === b.bomId);
            if (bom?.productId === item.id) {
                events.push({
                    date: b.date, type: 'Production', ref: b.id, qty: b.quantityProduced,
                    price: b.unitCost, entity: 'Manufacturing', details: `Produced ${b.quantityProduced} units`
                });
            } else {
                const comp = bom?.components.find(c => c.materialId === item.id);
                if (comp) {
                    events.push({
                        date: b.date, type: 'Consumption', ref: b.id, qty: -(comp.quantity * b.quantityProduced),
                        price: item.cost, entity: 'Manufacturing', details: `Used in ${b.productName}`
                    });
                }
            }
        });
        return events.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    }, [batches, boms, item.cost, item.id, purchases, sales, supportsStockRecords]);

    const salesHistory = useMemo(() => stockLog.filter(l => l.type === 'Sale'), [stockLog]);
    const purchaseHistory = useMemo(() => stockLog.filter(l => l.type === 'Purchase'), [stockLog]);

    // 4. Profitability
    const itemSales = sales.flatMap(s => s.items.filter(i => i.id === item.id));
    const totalGrossRevenue = itemSales.reduce((sum, i) => sum + (i.price * i.quantity), 0);
    const totalNetRevenue = totalGrossRevenue;
    const totalUnitsSold = itemSales.reduce((sum, i) => sum + i.quantity, 0);
    const estCOGS = totalUnitsSold * lastCost;
    const grossProfit = totalNetRevenue - estCOGS;
    const averageVariantPrice = variants.length > 0
        ? variants.reduce((sum, variant) => sum + (variant.price || 0), 0) / variants.length
        : 0;
    const variantPriceBands = [...variants]
        .sort((a, b) => (b.price || 0) - (a.price || 0))
        .slice(0, 6);

    const linkedBom = boms.find(b => b.productId === item.id);

    // --- AI Suggestion Logic Upgrade ---
    const handleAiPriceSuggestion = async () => {
        if (!isOnline) return;
        setIsAiPricingLoading(true);

        let actualBomCost = 0;
        let bomDetails = "N/A";

        if (linkedBom) {
            actualBomCost = linkedBom.components.reduce((sum, c) => {
                const mat = inventory.find(inv => inv.id === c.materialId);
                return sum + (c.quantity * (mat?.cost || mat?.price || 0));
            }, 0);
            bomDetails = linkedBom.components.map(c => {
                const mat = inventory.find(inv => inv.id === c.materialId);
                return `${c.quantity}x ${mat?.name} (@${mat?.cost})`;
            }).join(", ");
        } else {
            actualBomCost = lastCost;
        }

        const prompt = `
      Product: ${item.name}
      Current Selling Price: ${item.price}
      Raw Cost Calculation: ${linkedBom ? 'Calculated from BOM' : 'Based on Last Purchase Cost'}
      Components Involved: ${bomDetails}
      Total Calculated Material Cost: ${actualBomCost}
      Labor Component: ${linkedBom ? linkedBom.laborCost : 0}
      Actual Historical Waste/Scrap Rate for this item: ${(wastePct || 0).toFixed(1)}%
      
      Using these PRECISE figures, suggest an optimal selling price range. 
      Factor in the waste percentage as a direct overhead cost. 
      Ensure the suggested price maintains a minimum net profit markup of 25%.
      Provide a brief justification for the suggestion.
      `;

        const response = await generateAIResponse(prompt, "You are a Pricing Strategy Expert.");
        setAiPriceSuggestion(response);
        setIsAiPricingLoading(false);
    };

    const chartData = useMemo(() => {
        const data: Record<string, number> = {};
        salesHistory.forEach(t => {
            const d = new Date(t.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
            data[d] = (data[d] || 0) + Math.abs(t.qty);
        });
        return Object.entries(data).map(([name, value]) => ({ name, value })).reverse();
    }, [salesHistory]);

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: t[50], position: 'relative', fontFamily: 'inherit' }}>
            {/* Label Modal */}
            {showLabelModal && (
                <div style={{ position: 'fixed', inset: 0, zIndex: 80, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, backdropFilter: 'blur(4px)' }}>
                    <div className="prime-card" style={{ background: paper, padding: 32, borderRadius: 16, width: '100%', maxWidth: 384, textAlign: 'center', boxShadow: '0 25px 50px rgba(0,0,0,0.15)', border: `1.4px solid rgba(255,255,255,0.5)` }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                            <h3 style={{ fontWeight: 700, fontSize: 18 }}>Print Label Preview</h3>
                            <button onClick={() => setShowLabelModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}><X size={20} style={{ color: inkSoft }} /></button>
                        </div>
                        <div id="product-label-printable" style={{ border: '2px solid #000', padding: 24, borderRadius: 12, marginBottom: 24, background: paper, textAlign: 'left', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>
                            <h4 style={{ fontWeight: 700, fontSize: 20, color: '#000', marginBottom: 8, overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{item.name}</h4>
                            <div style={{ margin: '12px 0', fontFamily: 'monospace', fontSize: 36, letterSpacing: 4, textAlign: 'center', opacity: 0.8 }}>||| |||| || |||||| |||</div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: 8 }}>
                                <p style={{ fontFamily: 'monospace', fontSize: 14, fontWeight: 700 }}>{item.sku}</p>
                                <p style={{ fontWeight: 700, fontSize: 24 }}>{currency}{(item.type === 'Raw Material' ? item.cost : item.price || 0).toFixed(2)}</p>
                            </div>
                        </div>
                        <div style={{ display: 'flex', gap: 12 }}>
                            <button onClick={() => setShowLabelModal(false)} className="prime-btn-secondary" style={{ flex: 1, padding: '10px 0', borderRadius: 12, border: `1.4px solid ${hairline}`, background: paper, color: ink, fontWeight: 700, cursor: 'pointer', fontSize: 14 }}>Cancel</button>
                            <button
                                onClick={handlePrintLabel} className="prime-btn"
                                style={{ flex: 1, padding: '10px 0', borderRadius: 12, background: t[500], color: '#fff', fontWeight: 700, border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontSize: 14, boxShadow: '0 4px 6px rgba(0,0,0,0.1)' }}
                            >
                                <Printer size={16} />
                                Print
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* 1. Header Section */}
            <div style={{ background: paper, borderBottom: `1.4px solid ${hairline}`, padding: '16px 24px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                        <button onClick={onBack} className="prime-btn-secondary" style={{ padding: 8, background: 'transparent', borderRadius: 12, color: inkSoft, border: '1.4px solid transparent', cursor: 'pointer', transition: 'all .15s' }}
                            onMouseEnter={e => { e.currentTarget.style.background = paper; e.currentTarget.style.borderColor = hairline; e.currentTarget.style.boxShadow = '0 1px 2px rgba(0,0,0,0.05)'; }}
                            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderColor = 'transparent'; e.currentTarget.style.boxShadow = 'none'; }}>
                            <ArrowLeft size={20} />
                        </button>
                        <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <h1 style={{ fontSize: 20, fontWeight: 700, color: ink, letterSpacing: -0.02 }}>{item.name}</h1>
                                {item.isProtected && (
                                    <span style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 4, fontSize: 10, fontWeight: 700, background: ink, color: '#fff', border: `1.4px solid ${ink}`, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                                        <ShieldCheck size={10} /> Protected
                                    </span>
                                )}
                                <span style={{ padding: '2px 8px', borderRadius: 4, fontSize: 10, fontWeight: 700, border: `1.4px solid ${hairline}`, textTransform: 'uppercase', letterSpacing: 0.5, background: item.type === 'Product' ? t[50] : amber[100], color: item.type === 'Product' ? t[600] : amber[500] }}>
                                    {item.type}
                                </span>
                            </div>
                            <div style={{ fontSize: 12, color: inkSoft, display: 'flex', alignItems: 'center', gap: 12, marginTop: 4 }}>
                                <span style={{ fontFamily: 'monospace', background: t[50], padding: '2px 6px', borderRadius: 4 }}>{item.sku}</span>
                                <span>&bull;</span>
                                <span>{item.category}</span>
                            </div>
                        </div>
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                        {supportsStockRecords && (
                            <button onClick={() => onAdjust(item)} className="prime-btn-secondary" style={btnSec}>
                                <ArrowRightLeft size={14} /> Adjust
                            </button>
                        )}
                        <button onClick={() => onEdit(item)} className="prime-btn-secondary" style={btnSec}>
                            <Edit2 size={14} /> Edit
                        </button>
                        <button onClick={() => setShowLabelModal(true)} className="prime-btn-secondary" style={{ ...btnSec, padding: '6px' }} title="Print Label">
                            <Printer size={16} />
                        </button>
                        {item.isProtected ? (
                            <div style={{ padding: 6, color: inkSoft, background: t[100], border: `1.4px solid ${hairline}`, borderRadius: 4, cursor: 'not-allowed' }} title="This core system item cannot be deleted">
                                <Trash2 size={16} style={{ opacity: 0.5 }} />
                            </div>
                        ) : (
                            <button className="prime-btn-secondary" style={{ padding: 6, color: inkSoft, background: paper, border: `1.4px solid ${hairline}`, borderRadius: 4, cursor: 'pointer', boxShadow: '0 1px 2px rgba(0,0,0,0.05)', transition: 'all .15s' }}
                                title="Delete Item"
                                onMouseEnter={e => e.currentTarget.style.color = danger}
                                onMouseLeave={e => e.currentTarget.style.color = inkSoft}
                                onClick={() => {
                                    setConfirmState({
                                        open: true,
                                        title: 'Delete Item',
                                        message: `Are you sure you want to delete ${item.name}?`,
                                        type: 'danger',
                                        confirmText: 'Delete',
                                        onConfirm: () => {
                                            notify(`${item.name} deleted successfully`, 'success');
                                            onBack();
                                        }
                                    });
                                }}
                            >
                                <Trash2 size={16} />
                            </button>
                        )}
                    </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
                    {supportsStockRecords ? (
                        <>
                            <div className="prime-card" style={{ padding: 16, borderRadius: 16, display: 'flex', flexDirection: 'column', justifyContent: 'center', border: `1.4px solid ${hairline}`, background: paper, boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>
                                <div style={{ fontSize: 11, fontWeight: 600, color: inkSoft, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>Available Stock</div>
                                <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
                                    <span style={{ fontSize: 20, fontWeight: 900, fontVariantNumeric: 'tabular-nums', color: stockAvailable <= (item.minStockLevel || 0) ? danger : ink }}>
                                        {stockAvailable}
                                    </span>
                                    <span style={{ fontSize: 10, color: inkSoft, fontWeight: 500 }}>{item.unit}</span>
                                </div>
                                <div style={{ fontSize: 11, color: inkSoft, marginTop: 2, fontVariantNumeric: 'tabular-nums' }}>Total On Hand: {item.stock}</div>
                            </div>

                            <div className="prime-card" style={{ padding: 16, borderRadius: 16, display: 'flex', flexDirection: 'column', justifyContent: 'center', border: `1.4px solid ${hairline}`, background: paper, boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>
                                <div style={{ fontSize: 11, fontWeight: 600, color: inkSoft, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>Allocated / On Order</div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
                                    <div style={{ textAlign: 'center' }}>
                                        <div style={{ fontSize: 13, fontWeight: 700, color: amber[500], fontVariantNumeric: 'tabular-nums' }}>{stockAllocated}</div>
                                        <div style={{ fontSize: 9, color: inkSoft, fontWeight: 500 }}>Reserved</div>
                                    </div>
                                    <div style={{ width: 1, height: 24, background: hairline }}></div>
                                    <div style={{ textAlign: 'center' }}>
                                        <div style={{ fontSize: 13, fontWeight: 700, color: t[500], fontVariantNumeric: 'tabular-nums' }}>{stockOnOrder}</div>
                                        <div style={{ fontSize: 9, color: inkSoft, fontWeight: 500 }}>Inbound</div>
                                    </div>
                                </div>
                            </div>
                        </>
                    ) : (
                        <>
                            <div className="prime-card" style={{ padding: 16, borderRadius: 16, display: 'flex', flexDirection: 'column', justifyContent: 'center', border: `1.4px solid ${hairline}`, background: paper, boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>
                                <div style={{ fontSize: 11, fontWeight: 600, color: inkSoft, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>Stock Records</div>
                                <div style={{ fontSize: 20, fontWeight: 900, color: ink }}>Disabled</div>
                                <div style={{ fontSize: 11, color: inkSoft, marginTop: 2 }}>This {item.type.toLowerCase()} is price-tracked only.</div>
                            </div>

                            <div className="prime-card" style={{ padding: 16, borderRadius: 16, display: 'flex', flexDirection: 'column', justifyContent: 'center', border: `1.4px solid ${hairline}`, background: paper, boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>
                                <div style={{ fontSize: 11, fontWeight: 600, color: inkSoft, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>Inventory Policy</div>
                                <div style={{ fontSize: 13, fontWeight: 700, color: ink }}>No stock log or quantity adjustments</div>
                                <div style={{ fontSize: 11, color: inkSoft, marginTop: 2 }}>Use variants and pricing only.</div>
                            </div>
                        </>
                    )}

                    <div className="prime-card" style={{ padding: 16, borderRadius: 16, display: 'flex', flexDirection: 'column', justifyContent: 'center', border: `1.4px solid ${hairline}`, background: paper, boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>
                        <div style={{ fontSize: 11, fontWeight: 600, color: inkSoft, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>Pricing</div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginTop: 4 }}>
                            <span style={{ color: inkSoft, fontWeight: 500 }}>Last Cost:</span>
                            <span style={{ fontWeight: 700, color: ink, fontVariantNumeric: 'tabular-nums' }}>{currency}{(lastCost || 0).toFixed(2)}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginTop: 2 }}>
                            <span style={{ color: inkSoft, fontWeight: 500 }}>{item.type === 'Raw Material' ? 'Base Cost:' : 'Price (Inc):'}</span>
                            <span style={{ fontWeight: 900, fontVariantNumeric: 'tabular-nums', color: (item as Item & { pricingConfig?: { manualOverride?: boolean } }).pricingConfig?.manualOverride ? t[500] : ink, textDecoration: (item as Item & { pricingConfig?: { manualOverride?: boolean } }).pricingConfig?.manualOverride ? 'underline dotted' : 'none' }}>{currency}{(item.type === 'Raw Material' ? item.cost : item.price || 0).toFixed(2)}</span>
                        </div>
                        {(item as Item & { pricingConfig?: { manualOverride?: boolean } }).pricingConfig?.manualOverride && (
                            <div style={{ marginTop: 8, fontSize: 10, background: t[50], color: t[500], padding: '4px 8px', borderRadius: 4, fontWeight: 500 }}>
                                Manual Override Active
                            </div>
                        )}
                    </div>

                    <div className="prime-card" style={{ padding: 16, borderRadius: 16, display: 'flex', flexDirection: 'column', justifyContent: 'center', border: `1.4px solid ${hairline}`, background: paper, boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>
                        <div style={{ fontSize: 11, fontWeight: 600, color: inkSoft, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>Manufacturing Loss</div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                            <div style={{ fontSize: 20, fontWeight: 900, fontVariantNumeric: 'tabular-nums', color: (wastePct || 0) > 10 ? danger : t[500] }}>{(wastePct || 0).toFixed(1)}%</div>
                            <Recycle size={14} style={{ color: (wastePct || 0) > 10 ? danger : t[500] }} />
                        </div>
                        <div style={{ fontSize: 9, color: inkSoft, marginTop: 2, fontWeight: 500 }}>Historical Scrap Rate</div>
                    </div>
                </div>
            </div>

            {/* 2. Alerts Section */}
            {(supportsStockRecords && (item.stock <= (item.minStockLevel || 0) || stockAvailable < 0) && !((item as Item & { printConsumptionEnabled?: boolean }).printConsumptionEnabled)) && (
                <div style={{ padding: '12px 24px', background: '#fef2f2', borderBottom: '1.4px solid #fecaca', display: 'flex', alignItems: 'center', gap: 12, fontSize: 12, color: danger }}>
                    <AlertTriangle size={14} style={{ flexShrink: 0 }} />
                    <span style={{ fontWeight: 700 }}>Low Stock Warning:</span>
                    Available stock below min level ({item.minStockLevel} {item.unit}).
                    <button
                        onClick={handleCreatePO} className="prime-btn-secondary"
                        style={{ marginLeft: 'auto', fontSize: 10, background: paper, padding: '4px 12px', borderRadius: 9, fontWeight: 700, color: '#991b1b', cursor: 'pointer', border: `1.4px solid ${hairline}`, boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}
                    >
                        Create PO
                    </button>
                </div>
            )}

            {/* Variant Badge in Header */}
            {hasVariants && (
                <div style={{ padding: '8px 24px', background: t[50], borderBottom: `1.4px solid ${t[100]}`, display: 'flex', alignItems: 'center', gap: 12 }}>
                    <Layers size={14} style={{ color: t[500] }} />
                    <span style={{ fontSize: 12, fontWeight: 700, color: t[600] }}>
                        This product has {variants.length} variant{variants.length > 1 ? 's' : ''}
                    </span>
                    {supportsStockRecords ? (
                        <span style={{ fontSize: 11, color: t[500] }}>
                            Total Stock: {variantTotalStock.toLocaleString()} {item.unit}
                        </span>
                    ) : (
                        <span style={{ fontSize: 11, color: t[500] }}>
                            Stock records are disabled for {item.type.toLowerCase()} items
                        </span>
                    )}
                    {topVariant && (
                        <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: t[500], fontWeight: 500 }}>
                            <Award size={12} /> Top Seller: {topVariant.name} ({topVariant.unitsSold} units)
                        </span>
                    )}
                </div>
            )}

            {/* 3. Tabs Navigation */}
            <div style={{ display: 'flex', gap: 4, padding: '16px 24px 0', background: 'transparent', overflowX: 'auto' }}>
                {visibleTabs.map(tab => (
                    <button key={tab} onClick={() => setActiveTab(tab)} className="prime-btn-secondary"
                        style={{
                            padding: '8px 16px',
                            fontSize: 13,
                            fontWeight: 700,
                            transition: 'all .15s',
                            borderBottom: '2px solid',
                            whiteSpace: 'nowrap',
                            background: 'none',
                            cursor: 'pointer',
                            border: 'none',
                            borderBottom: activeTab === tab ? `2px solid ${t[500]}` : '2px solid transparent',
                            color: activeTab === tab ? t[500] : inkSoft,
                        }}>
                        {tab}
                        {tab === 'Variants' && hasVariants && (
                            <span style={{ marginLeft: 6, padding: '2px 6px', background: t[100], color: t[500], borderRadius: 4, fontSize: 10 }}>{variants.length}</span>
                        )}
                    </button>
                ))}
            </div>

            {/* 4. Tab Content */}
            <div style={{ flex: 1, overflowY: 'auto', padding: 24 }}>
                {activeTab === 'Overview' && (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 24 }}>
                        <div className="prime-card" style={{ ...cardInner, display: 'flex', flexDirection: 'column', gap: 16 }}>
                            <h3 style={{ fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8, textTransform: 'uppercase', letterSpacing: 0.5, color: ink }}>
                                <Package size={16} style={{ color: t[500] }} /> Item Identity
                            </h3>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, fontSize: 13 }}>
                                <div><div style={{ color: inkSoft, fontWeight: 700, marginBottom: 4, textTransform: 'uppercase', fontSize: 10 }}>SKU / Code</div><div style={{ fontFamily: 'monospace', fontWeight: 500, color: ink }}>{item.sku}</div></div>
                                <div><div style={{ color: inkSoft, fontWeight: 700, marginBottom: 4, textTransform: 'uppercase', fontSize: 10 }}>Unit of Measure</div><div style={{ fontWeight: 500, color: ink }}>{item.unit}</div></div>
                                <div style={{ gridColumn: 'span 2' }}><div style={{ color: inkSoft, fontWeight: 700, marginBottom: 4, textTransform: 'uppercase', fontSize: 10 }}>Description</div><div style={{ color: ink, lineHeight: 1.625 }}>{item.description || 'No description provided.'}</div></div>
                            </div>
                        </div>
                        <div className="prime-card" style={{ ...cardInner, display: 'flex', flexDirection: 'column', gap: 16 }}>
                            <h3 style={{ fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8, textTransform: 'uppercase', letterSpacing: 0.5, color: ink }}>
                                <DollarSign size={16} style={{ color: t[500] }} /> Current Pricing
                            </h3>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 12, background: paper, borderRadius: 12, border: `1.4px solid ${hairline}` }}>
                                    <span style={{ fontSize: 13, fontWeight: 700, color: inkSoft }}>{item.type === 'Raw Material' ? 'Material Cost' : 'Retail Price (Inc)'}</span>
                                    <span style={{ fontWeight: 700, color: ink, fontSize: 13, fontVariantNumeric: 'tabular-nums' }}>{currency}{(item.type === 'Raw Material' ? item.cost : item.price || 0).toFixed(2)}</span>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderBottom: `1.4px solid ${hairline}` }}>
                                    <span style={{ fontSize: 13, color: inkSoft, fontWeight: 500 }}>Net Price (Excl)</span>
                                    <span style={{ fontWeight: 500, color: ink, fontSize: 13, fontVariantNumeric: 'tabular-nums' }}>{currency}{(netSellingPrice || 0).toFixed(2)}</span>
                                </div>
                            </div>
                        </div>

                        {hasVariants && (
                            <div style={{ gridColumn: 'span 2', background: `linear-gradient(135deg, ${t[50]}, ${t[50]})`, padding: 16, borderRadius: 16, border: `1.4px solid ${t[100]}`, boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                                    <h3 style={{ fontSize: 11, fontWeight: 700, color: t[600], display: 'flex', alignItems: 'center', gap: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                                        <Layers size={16} /> Variant Summary
                                    </h3>
                                    <button onClick={() => setActiveTab('Variants')} className="prime-btn-secondary" style={{ fontSize: 11, color: t[500], fontWeight: 700, background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
                                        View All Variants <ArrowRightLeft size={12} style={{ transform: 'rotate(180deg)' }} />
                                    </button>
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
                                    {variants.slice(0, 4).map((v, idx) => (
                                        <div key={v.id} className="prime-card" style={{ background: paper, padding: 16, borderRadius: 12, border: `1.4px solid ${t[100]}`, boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>
                                            <div style={{ fontSize: 11, fontWeight: 700, color: inkSoft, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v.name}</div>
                                            {supportsStockRecords ? (
                                                <>
                                                    <div style={{ fontSize: 18, fontWeight: 900, color: ink, fontVariantNumeric: 'tabular-nums', marginTop: 4 }}>{v.stock || 0}</div>
                                                    <div style={{ fontSize: 10, color: inkSoft }}>in stock</div>
                                                    <div style={{ fontSize: 12, fontWeight: 600, color: '#111827', marginTop: 8, fontVariantNumeric: 'tabular-nums' }}>{currency}{(v.price || 0).toFixed(2)}</div>
                                                </>
                                            ) : (
                                                <>
                                                    <div style={{ fontSize: 18, fontWeight: 600, color: '#111827', fontVariantNumeric: 'tabular-nums', marginTop: 4 }}>{currency}{(v.price || 0).toFixed(2)}</div>
                                                    <div style={{ fontSize: 10, color: inkSoft }}>selling price</div>
                                                    <div style={{ fontSize: 11, color: inkSoft, marginTop: 8, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                        {Object.values(v.attributes || {}).join(' / ') || 'No attribute'}
                                                    </div>
                                                </>
                                            )}
                                        </div>
                                    ))}
                                    {variants.length > 4 && (
                                        <div className="prime-card" style={{ background: t[50], padding: 16, borderRadius: 12, border: `1.4px solid ${t[100]}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                            <span style={{ fontSize: 12, color: t[500], fontWeight: 700 }}>+{variants.length - 4} more</span>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {activeTab === 'Variants' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
                        {!hasVariants ? (
                            <div className="prime-card" style={{ ...cardInner, padding: 48, textAlign: 'center' }}>
                                <Layers size={48} style={{ margin: '0 auto 16px', color: inkSoft }} />
                                <h3 style={{ fontSize: 18, fontWeight: 700, color: ink, marginBottom: 8 }}>No Variants Configured</h3>
                                <p style={{ fontSize: 13, color: inkSoft, marginBottom: 16 }}>This product doesn't have any variants yet.</p>
                                <button onClick={() => onEdit(item)} className="prime-btn" style={{ padding: '8px 16px', background: t[500], color: '#fff', borderRadius: 9, fontSize: 14, fontWeight: 700, border: 'none', cursor: 'pointer' }}>
                                    Add Variants
                                </button>
                            </div>
                        ) : (
                            <>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
                                    {[
                                        { label: 'Total Variants', value: variants.length, color: ink },
                                        { label: supportsStockRecords ? 'Combined Stock' : 'Average Price', value: supportsStockRecords ? variantTotalStock.toLocaleString() : `${currency}${averageVariantPrice.toFixed(2)}`, color: '#111827' },
                                        { label: 'Total Units Sold', value: variantSalesData.reduce((sum, v) => sum + v.unitsSold, 0).toLocaleString(), color: t[500] },
                                        { label: 'Total Revenue', value: `${currency}${variantSalesData.reduce((sum, v) => sum + v.revenue, 0).toLocaleString()}`, color: '#111827' },
                                    ].map((k, i) => (
                                        <div key={i} className="prime-card" style={{ ...cardInner, padding: 16 }}>
                                            <div style={{ fontSize: 10, fontWeight: 700, color: inkSoft, textTransform: 'uppercase', letterSpacing: 0.5 }}>{k.label}</div>
                                            <div style={{ fontSize: 24, fontWeight: 900, color: k.color, fontVariantNumeric: 'tabular-nums' }}>{k.value}</div>
                                        </div>
                                    ))}
                                </div>

                                {topVariant && topVariant.unitsSold > 0 && (
                                    <div style={{ background: `linear-gradient(135deg, ${t[50]}, ${t[50]})`, padding: 16, borderRadius: 16, border: `1.4px solid ${t[100]}`, display: 'flex', alignItems: 'center', gap: 16, boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>
                                        <div style={{ padding: 12, background: t[100], borderRadius: 12 }}>
                                            <Award size={24} style={{ color: t[500] }} />
                                        </div>
                                        <div>
                                            <div style={{ fontSize: 10, fontWeight: 700, color: t[500], textTransform: 'uppercase', letterSpacing: 0.5 }}>Top Performing Variant</div>
                                            <div style={{ fontSize: 16, fontWeight: 900, color: ink }}>{topVariant.name}</div>
                                        </div>
                                        <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
                                            <div style={{ fontSize: 20, fontWeight: 900, color: t[500], fontVariantNumeric: 'tabular-nums' }}>{topVariant.unitsSold.toLocaleString()}</div>
                                            <div style={{ fontSize: 10, color: inkSoft }}>units sold</div>
                                        </div>
                                    </div>
                                )}

                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 24 }}>
                                    {supportsStockRecords ? (
                                        <div className="prime-card" style={{ ...cardInner }}>
                                            <h4 style={{ fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, textTransform: 'uppercase', letterSpacing: 0.5, color: ink }}>
                                                <PieChartIcon size={14} style={{ color: t[500] }} /> Stock Distribution
                                            </h4>
                                            <div style={{ width: '100%', height: 200, minHeight: 150 }}>
                                                <ResponsiveContainer width="100%" height="100%" minHeight={150} minWidth={0}>
                                                    <PieChart>
                                                        <Pie
                                                            data={variantStockChartData}
                                                            cx="50%"
                                                            cy="50%"
                                                            innerRadius={50}
                                                            outerRadius={80}
                                                            paddingAngle={2}
                                                            dataKey="value"
                                                        >
                                                            {variantStockChartData.map((entry, index) => (
                                                                <Cell key={`cell-${index}`} fill={entry.color} />
                                                            ))}
                                                        </Pie>
                                                        <Tooltip contentStyle={{ borderRadius: 12, border: 'none' }} />
                                                    </PieChart>
                                                </ResponsiveContainer>
                                            </div>
                                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 16 }}>
                                                {variantStockChartData.slice(0, 6).map((entry, idx) => (
                                                    <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10 }}>
                                                        <div style={{ width: 10, height: 10, borderRadius: '50%', backgroundColor: entry.color }} />
                                                        <span style={{ color: inkSoft, maxWidth: 80, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{entry.name}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="prime-card" style={{ ...cardInner }}>
                                            <h4 style={{ fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, textTransform: 'uppercase', letterSpacing: 0.5, color: ink }}>
                                                <DollarSign size={14} style={{ color: t[500] }} /> Variant Pricing
                                            </h4>
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                                                {variantPriceBands.length > 0 ? variantPriceBands.map((variant) => (
                                                    <div key={variant.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderRadius: 12, border: `1.4px solid ${hairline}`, background: paper, padding: '12px 16px' }}>
                                                        <div>
                                                            <div style={{ fontSize: 12, fontWeight: 700, color: ink }}>{variant.name}</div>
                                                            <div style={{ fontSize: 10, color: inkSoft }}>{Object.values(variant.attributes || {}).join(' / ') || 'No attribute'}</div>
                                                        </div>
                                                        <div style={{ fontSize: 13, fontWeight: 600, color: '#111827', fontVariantNumeric: 'tabular-nums' }}>{currency}{(variant.price || 0).toFixed(2)}</div>
                                                    </div>
                                                )) : (
                                                    <div style={{ fontSize: 13, color: inkSoft, fontStyle: 'italic' }}>No variant pricing data yet.</div>
                                                )}
                                            </div>
                                        </div>
                                    )}

                                    <div className="prime-card" style={{ ...cardInner }}>
                                        <h4 style={{ fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, textTransform: 'uppercase', letterSpacing: 0.5, color: ink }}>
                                            <BarChart3 size={14} style={{ color: t[500] }} /> Sales by Variant
                                        </h4>
                                        <div style={{ width: '100%', height: 200, minHeight: 150 }}>
                                            <ResponsiveContainer width="100%" height="100%" minHeight={150} minWidth={0}>
                                                <BarChart data={variantSalesChartData} layout="vertical">
                                                    <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke={hairline} />
                                                    <XAxis type="number" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: inkSoft }} />
                                                    <YAxis type="category" dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: inkSoft }} width={100} />
                                                    <Tooltip contentStyle={{ borderRadius: 12, border: 'none' }} />
                                                    <Bar dataKey="Units Sold" fill={t[500]} radius={[0, 4, 4, 0]} barSize={16} />
                                                </BarChart>
                                            </ResponsiveContainer>
                                        </div>
                                    </div>
                                </div>

                                <div className="prime-card" style={{ ...cardInner, padding: 0, overflow: 'hidden' }}>
                                    <div style={{ padding: '16px 24px', borderBottom: `1.4px solid ${hairline}` }}>
                                        <h4 style={{ fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8, textTransform: 'uppercase', letterSpacing: 0.5, color: ink }}>
                                            <Layers size={14} style={{ color: t[500] }} /> Variant Performance Breakdown
                                        </h4>
                                    </div>
                                    <div style={{ overflowX: 'auto' }}>
                                        <table style={{ width: '100%', textAlign: 'left', borderCollapse: 'collapse' }}>
                                            <thead>
                                                <tr style={{ background: t[50] }}>
                                                    <th className="prime-table-header" style={{ padding: '12px 16px', fontSize: 11, fontWeight: 600, color: inkSoft }}>Variant</th>
                                                    {supportsStockRecords && <th className="prime-table-header" style={{ padding: '12px 16px', fontSize: 11, fontWeight: 600, color: inkSoft, textAlign: 'center' }}>Stock</th>}
                                                    <th className="prime-table-header" style={{ padding: '12px 16px', fontSize: 11, fontWeight: 600, color: inkSoft, textAlign: 'right' }}>Cost</th>
                                                    <th className="prime-table-header" style={{ padding: '12px 16px', fontSize: 11, fontWeight: 600, color: inkSoft, textAlign: 'right' }}>Price</th>
                                                    <th className="prime-table-header" style={{ padding: '12px 16px', fontSize: 11, fontWeight: 600, color: inkSoft, textAlign: 'right' }}>Units Sold</th>
                                                    <th className="prime-table-header" style={{ padding: '12px 16px', fontSize: 11, fontWeight: 600, color: inkSoft, textAlign: 'right' }}>Revenue</th>
                                                    <th className="prime-table-header" style={{ padding: '12px 16px', fontSize: 11, fontWeight: 600, color: inkSoft, textAlign: 'right' }}>Markup</th>
                                                </tr>
                                            </thead>
                                            <tbody style={{}}>
                                                {variantSalesData.map((v, idx) => {
                                                    const variantObj = variants.find(x => x.id === v.id) || {} as { printConsumptionEnabled?: boolean };
                                                    const suppressedLowStock = (item as Item & { printConsumptionEnabled?: boolean }).printConsumptionEnabled || variantObj.printConsumptionEnabled;
                                                    const isLowStock = supportsStockRecords && !suppressedLowStock && v.stock <= (item.minStockLevel || 0);
                                                    const isTopSeller = topVariant?.id === v.id;
                                                    return (
                                                        <tr key={v.id} className="prime-table-cell"
                                                            style={{ borderTop: `1.4px solid ${hairline}`, transition: 'all .15s', background: isTopSeller ? t[50] : 'transparent' }}
                                                            onMouseEnter={e => e.currentTarget.style.background = t[50]}
                                                            onMouseLeave={e => e.currentTarget.style.background = isTopSeller ? t[50] : 'transparent'}
                                                        >
                                                            <td className="prime-table-cell" style={{ padding: '12px 16px' }}>
                                                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                                    {isTopSeller && <Award size={14} style={{ color: t[500] }} />}
                                                                    <div>
                                                                        <div style={{ fontWeight: 700, color: ink, fontSize: 12 }}>{v.name}</div>
                                                                        <div style={{ fontSize: 10, color: inkSoft, fontFamily: 'monospace' }}>{v.sku}</div>
                                                                    </div>
                                                                </div>
                                                            </td>
                                                            {supportsStockRecords && (
                                                                <td className="prime-table-cell" style={{ padding: '12px 16px', textAlign: 'center' }}>
                                                                    <span style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: isLowStock ? danger : ink }}>
                                                                        {v.stock.toLocaleString()}
                                                                    </span>
                                                                    {isLowStock && <AlertTriangle size={12} style={{ display: 'inline', marginLeft: 4, color: danger }} />}
                                                                </td>
                                                            )}
                                                            <td className="prime-table-cell" style={{ padding: '12px 16px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{currency}{v.cost.toFixed(2)}</td>
                                                            <td className="prime-table-cell" style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 600, color: '#111827', fontVariantNumeric: 'tabular-nums' }}>{currency}{v.price.toFixed(2)}</td>
                                                            <td className="prime-table-cell" style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{v.unitsSold.toLocaleString()}</td>
                                                            <td className="prime-table-cell" style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 600, color: '#111827', fontVariantNumeric: 'tabular-nums' }}>{currency}{v.revenue.toFixed(2)}</td>
                                                            <td className="prime-table-cell" style={{ padding: '12px 16px', textAlign: 'right' }}>
                                                                <span style={{ padding: '2px 8px', borderRadius: 9999, fontSize: 10, fontWeight: 700, background: v.margin >= 25 ? t[100] : v.margin >= 10 ? amber[100] : '#fef2f2', color: v.margin >= 25 ? t[600] : v.margin >= 10 ? amber[500] : danger }}>
                                                                    {v.margin.toFixed(1)}%
                                                                </span>
                                                            </td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            </>
                        )}
                    </div>
                )}

                {activeTab === 'Logistics' && (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 24 }}>
                        {logisticsData.map((ld, idx) => (
                            <div key={idx} className="prime-card" style={{ ...cardInner, display: 'flex', alignItems: 'center', gap: 16 }}>
                                <div style={{ padding: 12, borderRadius: 16, background: paper, boxShadow: '0 1px 2px rgba(0,0,0,0.05)', color: inkSoft }}>
                                    <ld.icon size={24} />
                                </div>
                                <div>
                                    <p style={{ fontSize: 10, fontWeight: 700, color: inkSoft, textTransform: 'uppercase', letterSpacing: 0.5 }}>{ld.label}</p>
                                    <p style={{ fontSize: 14, fontWeight: 900, color: ink, fontVariantNumeric: 'tabular-nums' }}>{ld.value}</p>
                                </div>
                            </div>
                        ))}

                        <div className="prime-card" style={{ ...cardInner, gridColumn: 'span 3' }}>
                            <h3 style={{ fontSize: 11, fontWeight: 700, color: ink, marginBottom: 24, display: 'flex', alignItems: 'center', gap: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                                <Activity size={16} style={{ color: t[500] }} /> Technical & Manufacturer Data
                            </h3>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 32 }}>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                                    <div style={{ padding: 16, background: t[50], borderRadius: 16, border: `1.4px solid ${hairline}` }}>
                                        <p style={{ fontSize: 10, fontWeight: 700, color: inkSoft, textTransform: 'uppercase', marginBottom: 4 }}>Manufacturer</p>
                                        <p style={{ fontSize: 13, fontWeight: 700, color: ink }}>{item.manufacturer || 'None Specified'}</p>
                                    </div>
                                    <div style={{ padding: 16, background: t[50], borderRadius: 16, border: `1.4px solid ${hairline}` }}>
                                        <p style={{ fontSize: 10, fontWeight: 700, color: inkSoft, textTransform: 'uppercase', marginBottom: 4 }}>Part Number (MPN)</p>
                                        <p style={{ fontFamily: 'monospace', fontSize: 13, fontWeight: 700, color: ink }}>{item.manufacturerPartNumber || 'N/A'}</p>
                                    </div>
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                                    <div style={{ padding: 16, background: t[50], borderRadius: 16, border: `1.4px solid ${hairline}` }}>
                                        <p style={{ fontSize: 10, fontWeight: 700, color: inkSoft, textTransform: 'uppercase', marginBottom: 4 }}>Expiry / Shelf Life</p>
                                        <p style={{ fontSize: 13, fontWeight: 700, color: ink }}>{item.expiryDate ? new Date(item.expiryDate).toLocaleDateString() : 'Non-perishable'}</p>
                                    </div>
                                    <div style={{ padding: 16, borderRadius: 16, border: `1.4px solid ${hairline}`, background: item.isHazardous ? '#fef2f2' : t[50] }}>
                                        <p style={{ fontSize: 10, fontWeight: 700, color: inkSoft, textTransform: 'uppercase', marginBottom: 4 }}>Safety Class</p>
                                        <p style={{ fontSize: 13, fontWeight: 700, color: item.isHazardous ? danger : t[500] }}>
                                            {item.isHazardous ? 'Hazardous Material (HAZMAT)' : 'Standard / Safe'}
                                        </p>
                                    </div>
                                </div>
                                <div style={{ background: t[50], padding: 24, borderRadius: 16, border: `1.4px solid ${t[100]}` }}>
                                    <h4 style={{ fontSize: 12, fontWeight: 700, color: t[600], textTransform: 'uppercase', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
                                        <Truck size={14} /> Supply Chain Health
                                    </h4>
                                    {supportsStockRecords ? (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                                            {[
                                                { label: 'Reorder Level:', value: `${item.reorderPoint || 0} ${item.unit}` },
                                                { label: 'Min Stock Level:', value: `${item.minStockLevel || 0} ${item.unit}` },
                                                { label: 'Typical Lead Time:', value: `${item.leadTimeDays || 0} Days` },
                                            ].map((r, i) => (
                                                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13 }}>
                                                    <span style={{ color: inkSoft }}>{r.label}</span>
                                                    <span style={{ fontWeight: 700, color: r.label.includes('Lead Time') ? t[500] : ink, fontVariantNumeric: 'tabular-nums' }}>{r.value}</span>
                                                </div>
                                            ))}
                                        </div>
                                    ) : (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                                            <p style={{ fontSize: 13, fontWeight: 700, color: ink }}>Stock records are disabled for {item.type.toLowerCase()} items.</p>
                                            <p style={{ fontSize: 12, color: inkSoft }}>This view keeps pricing and reference data, but it won't track stock movements, reorder levels, or quantity adjustments.</p>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {item.type === 'Raw Material' && item.purchaseUnit && item.usageUnit && (
                                <div style={{ marginTop: 32, paddingTop: 32, borderTop: `1.4px solid ${hairline}` }}>
                                    <h4 style={{ fontSize: 12, fontWeight: 700, color: ink, textTransform: 'uppercase', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
                                        <ArrowRightLeft size={16} style={{ color: t[500] }} /> Material Unit Conversion
                                    </h4>
                                    <div style={{ background: t[50], padding: 16, borderRadius: 12, border: `1.4px solid ${t[100]}`, display: 'inline-flex', alignItems: 'center', gap: 24 }}>
                                        <div style={{ textAlign: 'center' }}>
                                            <p style={{ fontSize: 10, color: inkSoft, fontWeight: 700, textTransform: 'uppercase', marginBottom: 4 }}>Purchased In</p>
                                            <p style={{ fontSize: 13, fontWeight: 900, color: ink }}>{item.purchaseUnit}</p>
                                        </div>
                                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                                            <div style={{ fontSize: 10, fontWeight: 900, color: t[500], marginBottom: 4 }}>x{item.conversionRate}</div>
                                            <ArrowRight size={14} style={{ color: t[500] }} />
                                        </div>
                                        <div style={{ textAlign: 'center' }}>
                                            <p style={{ fontSize: 10, color: inkSoft, fontWeight: 700, textTransform: 'uppercase', marginBottom: 4 }}>Used In</p>
                                            <p style={{ fontSize: 13, fontWeight: 900, color: ink }}>{item.usageUnit}</p>
                                        </div>
                                        <div style={{ marginLeft: 24, paddingLeft: 24, borderLeft: `1.4px solid ${t[100]}` }}>
                                            <p style={{ fontSize: 10, color: inkSoft, fontWeight: 700, textTransform: 'uppercase', marginBottom: 4 }}>Conversion Rule</p>
                                            <p style={{ fontSize: 12, fontWeight: 500, color: t[600], fontStyle: 'italic' }}>
                                                1 {item.purchaseUnit} contains {item.conversionRate} {item.usageUnit}s
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {activeTab === 'Sales History' && (
                    <div className="prime-card" style={{ ...cardInner, padding: 0, overflow: 'hidden' }}>
                        <div style={{ padding: '16px 24px', borderBottom: `1.4px solid ${hairline}` }}>
                            <h3 style={{ fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8, textTransform: 'uppercase', letterSpacing: 0.5, color: ink }}>
                                <ShoppingCart size={16} style={{ color: t[500] }} /> Sales History
                            </h3>
                        </div>
                        <div style={{ overflowX: 'auto' }}>
                            <table style={{ width: '100%', textAlign: 'left', borderCollapse: 'collapse' }}>
                                <thead>
                                    <tr style={{ background: t[50] }}>
                                        {['Date', 'Reference', 'Customer', 'Quantity', 'Price'].map(h => (
                                            <th key={h} className="prime-table-header" style={{ padding: '12px 24px', fontSize: 11, fontWeight: 600, color: inkSoft, textAlign: h === 'Quantity' || h === 'Price' ? 'right' as const : 'left' as const }}>{h}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {salesHistory.length > 0 ? salesHistory.map((s, idx) => (
                                        <tr key={idx} className="prime-table-cell"
                                            style={{ borderTop: `1.4px solid ${hairline}`, transition: 'all .15s' }}
                                            onMouseEnter={e => e.currentTarget.style.background = t[50]}
                                            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                                        >
                                            <td className="prime-table-cell" style={{ padding: '12px 24px' }}>{new Date(s.date).toLocaleDateString()}</td>
                                            <td className="prime-table-cell" style={{ padding: '12px 24px', fontFamily: 'monospace', fontSize: 11 }}>{s.ref}</td>
                                            <td className="prime-table-cell" style={{ padding: '12px 24px', fontWeight: 700, color: ink }}>{s.entity}</td>
                                            <td className="prime-table-cell" style={{ padding: '12px 24px', textAlign: 'right', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{Math.abs(s.qty)}</td>
                                            <td className="prime-table-cell" style={{ padding: '12px 24px', textAlign: 'right', fontWeight: 600, color: '#111827', fontVariantNumeric: 'tabular-nums' }}>{currency}{(s.price || 0).toFixed(2)}</td>
                                        </tr>
                                    )) : (
                                        <tr><td colSpan={5} style={{ padding: '48px 0', textAlign: 'center', color: inkSoft, fontStyle: 'italic', fontSize: 13 }}>No sales history found for this item.</td></tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                {activeTab === 'Purchase History' && (
                    <div className="prime-card" style={{ ...cardInner, padding: 0, overflow: 'hidden' }}>
                        <div style={{ padding: '16px 24px', borderBottom: `1.4px solid ${hairline}` }}>
                            <h3 style={{ fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8, textTransform: 'uppercase', letterSpacing: 0.5, color: ink }}>
                                <Truck size={16} style={{ color: t[500] }} /> Purchase History
                            </h3>
                        </div>
                        <div style={{ overflowX: 'auto' }}>
                            <table style={{ width: '100%', textAlign: 'left', borderCollapse: 'collapse' }}>
                                <thead>
                                    <tr style={{ background: t[50] }}>
                                        {['Date', 'Reference', 'Supplier', 'Quantity', 'Cost'].map(h => (
                                            <th key={h} className="prime-table-header" style={{ padding: '12px 24px', fontSize: 11, fontWeight: 600, color: inkSoft, textAlign: h === 'Quantity' || h === 'Cost' ? 'right' as const : 'left' as const }}>{h}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {purchaseHistory.length > 0 ? purchaseHistory.map((p, idx) => (
                                        <tr key={idx} className="prime-table-cell"
                                            style={{ borderTop: `1.4px solid ${hairline}`, transition: 'all .15s' }}
                                            onMouseEnter={e => e.currentTarget.style.background = t[50]}
                                            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                                        >
                                            <td className="prime-table-cell" style={{ padding: '12px 24px' }}>{new Date(p.date).toLocaleDateString()}</td>
                                            <td className="prime-table-cell" style={{ padding: '12px 24px', fontFamily: 'monospace', fontSize: 11 }}>{p.ref}</td>
                                            <td className="prime-table-cell" style={{ padding: '12px 24px', fontWeight: 700, color: ink }}>{p.entity}</td>
                                            <td className="prime-table-cell" style={{ padding: '12px 24px', textAlign: 'right', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{p.qty}</td>
                                            <td className="prime-table-cell" style={{ padding: '12px 24px', textAlign: 'right', fontWeight: 600, color: '#111827', fontVariantNumeric: 'tabular-nums' }}>{currency}{(p.price || 0).toFixed(2)}</td>
                                        </tr>
                                    )) : (
                                        <tr><td colSpan={5} style={{ padding: '48px 0', textAlign: 'center', color: inkSoft, fontStyle: 'italic', fontSize: 13 }}>No purchase history found for this item.</td></tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                {activeTab === 'Stock Log' && (
                    <div className="prime-card" style={{ ...cardInner, padding: 0, overflow: 'hidden' }}>
                        <div style={{ padding: '16px 24px', borderBottom: `1.4px solid ${hairline}` }}>
                            <h3 style={{ fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8, textTransform: 'uppercase', letterSpacing: 0.5, color: ink }}>
                                <Activity size={16} style={{ color: t[500] }} /> Complete Stock Log
                            </h3>
                        </div>
                        <div style={{ overflowX: 'auto' }}>
                            <table style={{ width: '100%', textAlign: 'left', borderCollapse: 'collapse' }}>
                                <thead>
                                    <tr style={{ background: t[50] }}>
                                        {['Date', 'Type', 'Reference', 'Entity / Source', 'Change'].map(h => (
                                            <th key={h} className="prime-table-header" style={{ padding: '12px 24px', fontSize: 11, fontWeight: 600, color: inkSoft, textAlign: h === 'Change' ? 'right' as const : 'left' as const }}>{h}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {stockLog.length > 0 ? stockLog.map((log, idx) => {
                                        const typeColors: Record<string, { bg: string; color: string }> = {
                                            Sale: { bg: t[50], color: t[500] },
                                            Purchase: { bg: t[50], color: t[500] },
                                            Production: { bg: t[50], color: t[500] },
                                        };
                                        const tc = typeColors[log.type] || { bg: t[100], color: inkSoft };
                                        return (
                                            <tr key={idx} className="prime-table-cell"
                                                style={{ borderTop: `1.4px solid ${hairline}`, transition: 'all .15s' }}
                                                onMouseEnter={e => e.currentTarget.style.background = t[50]}
                                                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                                            >
                                                <td className="prime-table-cell" style={{ padding: '12px 24px' }}>{new Date(log.date).toLocaleDateString()}</td>
                                                <td className="prime-table-cell" style={{ padding: '12px 24px' }}>
                                                    <span style={{ padding: '2px 8px', borderRadius: 9999, fontSize: 10, fontWeight: 700, textTransform: 'uppercase', background: tc.bg, color: tc.color }}>
                                                        {log.type}
                                                    </span>
                                                </td>
                                                <td className="prime-table-cell" style={{ padding: '12px 24px', fontFamily: 'monospace', fontSize: 11 }}>{log.ref}</td>
                                                <td className="prime-table-cell" style={{ padding: '12px 24px', color: inkSoft }}>{log.entity}</td>
                                                <td className="prime-table-cell" style={{ padding: '12px 24px', textAlign: 'right', fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: log.qty >= 0 ? t[500] : danger }}>
                                                    {log.qty > 0 ? '+' : ''}{log.qty}
                                                </td>
                                            </tr>
                                        );
                                    }) : (
                                        <tr><td colSpan={5} style={{ padding: '48px 0', textAlign: 'center', color: inkSoft, fontStyle: 'italic', fontSize: 13 }}>No activity logs found.</td></tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                {activeTab === 'Analytics' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 24 }}>
                            <div className="prime-card" style={{ ...cardInner }}>
                                <h3 style={{ fontSize: 11, fontWeight: 700, marginBottom: 24, display: 'flex', alignItems: 'center', gap: 8, textTransform: 'uppercase', letterSpacing: 0.5, color: ink }}>
                                    <BarChart3 size={16} style={{ color: t[500] }} /> Sales Trend (Units)
                                </h3>
                                <div style={{ width: '100%', height: 300, minHeight: 150 }}>
                                    <ResponsiveContainer width="100%" height="100%" minHeight={150} minWidth={0}>
                                        <BarChart data={chartData}>
                                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={hairline} />
                                            <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: inkSoft }} />
                                            <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: inkSoft }} />
                                            <Tooltip contentStyle={{ borderRadius: 12, border: 'none' }} cursor={{ fill: t[50] }} />
                                            <Bar dataKey="value" fill={t[500]} radius={[4, 4, 0, 0]} barSize={30} name="Units Sold" />
                                        </BarChart>
                                    </ResponsiveContainer>
                                </div>
                            </div>
                            <div className="prime-card" style={{ ...cardInner }}>
                                <h3 style={{ fontSize: 11, fontWeight: 700, marginBottom: 24, textTransform: 'uppercase', letterSpacing: 0.5, color: ink }}>Profitability Overview</h3>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 24, fontSize: 13 }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: `1.4px solid ${hairline}`, paddingBottom: 8 }}><span style={{ color: inkSoft }}>Net Revenue</span><span style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{currency}{(totalNetRevenue || 0).toFixed(2)}</span></div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: `1.4px solid ${hairline}`, paddingBottom: 8 }}><span style={{ color: inkSoft }}>COGS (at Last Cost)</span><span style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>-{currency}{(estCOGS || 0).toFixed(2)}</span></div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, fontWeight: 900 }}><span style={{ color: ink, textTransform: 'uppercase' }}>Gross Profit</span><span style={{ fontVariantNumeric: 'tabular-nums', color: grossProfit >= 0 ? t[500] : danger }}>{currency}{(grossProfit || 0).toFixed(2)}</span></div>
                                    <div style={{ padding: 16, background: t[50], borderRadius: 12, textAlign: 'center', border: `1.4px solid ${hairline}` }}>
                                        <span style={{ display: 'block', fontSize: 10, color: inkSoft, textTransform: 'uppercase', fontWeight: 700, marginBottom: 4 }}>Average Markup</span>
                                        <span style={{ fontSize: 24, fontWeight: 900, color: t[500], fontVariantNumeric: 'tabular-nums' }}>{totalNetRevenue > 0 ? ((grossProfit / totalNetRevenue) * 100).toFixed(1) : 0}%</span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div style={{ background: `linear-gradient(135deg, ${t[50]}, ${t[50]})`, padding: 24, borderRadius: 16, border: `1.4px solid ${t[100]}`, boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                                <h3 style={{ fontSize: 11, fontWeight: 700, color: ink, display: 'flex', alignItems: 'center', gap: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}><Sparkles size={16} style={{ color: t[500] }} /> AI Optimal Price Suggestions</h3>
                                {isOnline ? (
                                    <button onClick={handleAiPriceSuggestion} disabled={isAiPricingLoading} className="prime-btn-secondary" style={{ background: paper, border: `1.4px solid ${t[100]}`, color: t[500], padding: '8px 16px', borderRadius: 9, fontSize: 12, fontWeight: 700, cursor: isAiPricingLoading ? 'default' : 'pointer', display: 'flex', alignItems: 'center', gap: 8, transition: 'all .15s' }}>
                                        {isAiPricingLoading ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Sparkles size={14} />}
                                        {isAiPricingLoading ? 'Analyzing BOM Data...' : 'Generate New Pricing'}
                                    </button>
                                ) : <span style={{ fontSize: 12, color: inkSoft }}>Online only</span>}
                            </div>
                            {aiPriceSuggestion ? (
                                <div className="prime-card" style={{ background: paper, padding: 20, borderRadius: 12, border: `1.4px solid ${t[100]}`, color: ink, fontSize: 13, lineHeight: 1.625 }}>
                                    <ReactMarkdown>{aiPriceSuggestion}</ReactMarkdown>
                                </div>
                            ) : <div style={{ textAlign: 'center', padding: '24px 0', color: inkSoft, fontSize: 12, fontStyle: 'italic' }}>Uses real-time scrap rates and BOM component costs for accuracy.</div>}
                        </div>
                    </div>
                )}

                {activeTab === 'Security' && (
                    <div className="prime-card" style={{ background: paper, borderRadius: 12, border: `1.4px solid ${hairline}`, boxShadow: '0 1px 2px rgba(0,0,0,0.05)', padding: 24, overflow: 'hidden', display: 'flex', flexDirection: 'column', height: 600 }}>
                        <AuditTimeline 
                            logs={(auditLogs || []).filter((log: any) => 
                                log.entityId === item.id || 
                                (log.entityType === 'Stock' && log.entityId === item.id)
                            )} 
                            title={`Security Audit: ${item.name}`}
                            subtitle="Immutable trail of all modifications to this inventory item."
                        />
                    </div>
                )}
            </div>
            <ConfirmDialog
                open={confirmState.open}
                onOpenChange={(open) => !open && setConfirmState(c => ({ ...c, open: false }))}
                onConfirm={() => {
                    confirmState.onConfirm?.();
                    setConfirmState(c => ({ ...c, open: false }));
                }}
                onCancel={() => setConfirmState(c => ({ ...c, open: false }))}
                title={confirmState.title}
                message={confirmState.message}
                confirmText={confirmState.confirmText}
                type={confirmState.type || 'danger'}
            />
        </div>
    );
};

export default ProductDetails;