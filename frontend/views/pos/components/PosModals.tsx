import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { logger } from '@/services/logger';
// PRICING RULE: Do NOT implement pricing logic here. All pricing MUST go through pricingEngine.ts
import { X, CheckCircle, Printer, Usb, Wallet, UserPlus, Save, ArrowRight, Plus, Search, Clock, Info, AlertTriangle, Users } from 'lucide-react';
import { HeldOrder, Sale, Invoice, Item, ProductVariant, BillOfMaterial, WorkOrder, BOMTemplate } from '../../../types';
import { useAuth } from '../../../context/AuthContext';
import { useFinance } from '../../../context/FinanceContext';
import { useInventory } from '../../../context/InventoryContext';
import { useSales } from '../../../context/SalesContext';
import { DEFAULT_ACCOUNTS, ACCOUNT_IDS } from '../../../constants';
import { hardwareService } from '../../../services/hardwareService';
import { generateAccountNumber, roundFinancial, formatNumber, roundToCurrency } from '../../../utils/helpers';
import { bomService } from '../../../services/bomService';
import { pricingService, DynamicServicePricingResult } from '../../../services/pricingService';
import { dbService } from '../../../services/db';
import { calculateServicePrice } from '../../../utils/pricing/pricingEngine';
import { normalizeStoredPricing, resolveStoredSellingPrice } from '../../../utils/pricing';
import { getPlaceholder } from '../../../constants/placeholders';

const teal: Record<string, string> = { 50: '#eef7f6', 100: '#d3ece9', 200: '#a6d9d3', 300: '#72c0b7', 400: '#3fa294', 500: '#1f8577', 600: '#146b60', 700: '#0f544c', 800: '#0b3e39', 900: '#082e2a' };
const amber: Record<string, string> = { 100: '#fbead0', 300: '#eec27a', 500: '#d99a3f', 600: '#b97e2b' };
const paper = '#FEFDFB';
const ink = '#23282A';
const inkSoft = '#5c6567';
const hairline = '#e4ddd1';
const danger = '#b5493f';

const modalOverlay: React.CSSProperties = {
  position: 'fixed', inset: 0, zIndex: 9999,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  background: 'rgba(15, 23, 42, 0.6)',
  padding: '40px 20px', fontFamily: "'Inter','DM Sans',sans-serif", fontSize: 13.5, color: ink,
};

const modalCard: React.CSSProperties = {
  maxWidth: '100%', background: paper, borderRadius: 14,
  boxShadow: '0 30px 70px -20px rgba(0,0,0,.55), 0 8px 24px -8px rgba(0,0,0,.35), 0 0 0 1px rgba(255,255,255,.04)',
  display: 'flex', flexDirection: 'column', overflow: 'hidden', position: 'relative',
};

const accentBar: React.CSSProperties = {
  position: 'absolute', top: 0, left: 0, right: 0, height: 4,
  background: `linear-gradient(90deg, ${teal[600]}, ${teal[400]} 40%, ${amber[500]} 100%)`
};

const closeBtn: React.CSSProperties = {
  width: 32, height: 32, borderRadius: 8,
  border: `1px solid ${hairline}`, background: paper, color: inkSoft,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  cursor: 'pointer', transition: 'all .15s ease', flexShrink: 0,
};

const iconBox: React.CSSProperties = {
  width: 40, height: 40, borderRadius: 10,
  background: `linear-gradient(155deg, ${teal[500]}, ${teal[700]})`,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  boxShadow: `0 4px 10px -3px rgba(15,84,76,.6)`, flexShrink: 0,
};

const ghostBtn: React.CSSProperties = {
  fontFamily: "'Inter', sans-serif", fontSize: 13, fontWeight: 600,
  padding: '9px 18px', borderRadius: 9, cursor: 'pointer',
  background: paper, border: `1.4px solid ${hairline}`, color: inkSoft,
};

const tealBtn: React.CSSProperties = {
  fontFamily: "'Inter', sans-serif", fontSize: 13, fontWeight: 600,
  padding: '9px 18px', borderRadius: 9, cursor: 'pointer', border: '1.4px solid transparent',
  background: `linear-gradient(155deg, ${teal[500]}, ${teal[700]})`,
  color: '#fff', display: 'flex', alignItems: 'center', gap: 6,
  boxShadow: `0 6px 16px -6px rgba(15,84,76,.55)`,
  transition: 'all .15s ease',
};

const dangerBtn: React.CSSProperties = {
  ...tealBtn,
  background: `linear-gradient(155deg, #dc2626, #b91c1c)`,
  boxShadow: `0 6px 16px -6px rgba(185,28,28,.55)`,
};

// --- Printing Variant Modal ---
export const PrintingVariantModal: React.FC<{
    product: Item;
    bom?: BillOfMaterial;
    materials: Item[];
    onSelect: (variant: any) => void;
    onClose: () => void;
}> = ({ product, bom, materials, onSelect, onClose }) => {
    const { companyConfig, notify } = useAuth(); const { inventory, marketAdjustments } = useInventory();
    const currency = companyConfig.currencySymbol;
    const [bomTemplates, setBomTemplates] = useState<BOMTemplate[]>([]);
    const [attributes, setAttributes] = useState<Record<string, any>>({
        number_of_pages: 1,
        paper_type: 'A4 80g',
        print_mode: 'B/W',
        binding_type: 'None'
    });
    const [pricingState, setPricingState] = useState({
        baseCost: product.cost,
        adjustmentTotal: 0,
        sellingPrice: product.price,
        adjustmentBreakdown: [] as Array<{ name: string; value: number; type: string }>,
        adjustmentSnapshots: [] as Array<{ name: string; type: string; value: number; calculatedAmount: number }>
    });
    const [quantity, setQuantity] = useState(1);

    useEffect(() => {
        let mounted = true;
        dbService.getAll<BOMTemplate>('bomTemplates')
            .then((templates) => {
                if (mounted) setBomTemplates(templates || []);
            })
            .catch((err) => {
                logger.error('Failed to load BOM templates for variant pricing', err);
            });
        return () => { mounted = false; };
    }, []);

    const materialsList = useMemo(() => inventory || materials, [inventory, materials]);
    const adjustmentsList = useMemo(() => marketAdjustments || [], [marketAdjustments]);

    useEffect(() => {
        const hasHiddenBOM = product.smartPricing?.hiddenBOMId || product.smartPricing?.bomTemplateId;

        if (hasHiddenBOM) {
            const virtualVariant = {
                id: 'virtual',
                productId: product.id,
                sku: product.sku,
                name: product.name,
                attributes: attributes,
                pages: attributes.number_of_pages || 1,
                price: 0,
                cost: 0,
                stock: 0,
                pricingSource: 'dynamic',
                inheritsParentBOM: true
            } as unknown as ProductVariant;

            const result = pricingService.calculateVariantPrice(
                product,
                virtualVariant,
                quantity,
                materialsList,
                bomTemplates,
                adjustmentsList
            );

            const finishingCost = (result.breakdown || []).reduce((sum: number, item: any) => sum + (Number(item.amount) || 0), 0);

            setPricingState({
                baseCost: result.cost + finishingCost,
                adjustmentTotal: result.adjustmentTotal,
                sellingPrice: result.price,
                adjustmentBreakdown: result.breakdown,
                adjustmentSnapshots: result.adjustmentSnapshots
            });
        } else if (bom) {
            const result = bomService.calculateVariantBOM(bom, { attributes } as Record<string, unknown>, materials);
            const cost = roundFinancial(result.totalProductionCost);

            let price = product.price;
            if (bom.priceFormula) {
                price = roundFinancial(bomService.resolveFormula(bom.priceFormula, attributes));
            }

            setPricingState({
                baseCost: cost,
                adjustmentTotal: 0,
                sellingPrice: roundToCurrency(cost),
                adjustmentBreakdown: [],
                adjustmentSnapshots: []
            });
        }
    }, [attributes, bom, materials, product, quantity, materialsList, adjustmentsList]);

    const handleAttributeChange = (key: string, value: any) => {
        setAttributes(prev => ({ ...prev, [key]: value }));
    };

    const handleConfirm = () => {
        const variantName = `${product.name} (${Object.entries(attributes).map(([k, v]) => `${k}: ${v}`).join(', ')})`;
        const virtualVariant = {
            ...product,
            id: `${product.id}-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
            parentId: product.id,
            name: variantName,
            attributes: attributes,
            quantity: quantity,
            price: pricingState.sellingPrice,
            cost: pricingState.baseCost,
            adjustmentTotal: pricingState.adjustmentTotal,
            adjustmentSnapshots: pricingState.adjustmentSnapshots,
            pagesOverride: attributes.number_of_pages
        };
        onSelect(virtualVariant);
    };

    return (
        <div style={modalOverlay} onClick={onClose}>
            <div style={{ ...modalCard, width: 520 }} onClick={(e) => e.stopPropagation()}>
                <div style={accentBar} />
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '22px 28px 18px', borderBottom: `1px solid ${hairline}` }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                        <div style={iconBox}><Printer size={19} color="#fff" /></div>
                        <div>
                            <h1 style={{
                                fontFamily: "'Inter','DM Sans',sans-serif", fontWeight: 400,
                                fontSize: 22, margin: 0, color: teal[800], letterSpacing: 0.2
                            }}>Configure {product.name}</h1>
                            <p style={{ margin: '2px 0 0', fontSize: 11.5, color: inkSoft, letterSpacing: 0.02 }}>Printing Variant</p>
                        </div>
                    </div>
                    <button onClick={onClose} aria-label="Close" style={closeBtn}
                        onMouseEnter={e => { e.currentTarget.style.background = teal[50]; e.currentTarget.style.color = teal[700]; e.currentTarget.style.borderColor = teal[200]; }}
                        onMouseLeave={e => { e.currentTarget.style.background = paper; e.currentTarget.style.color = inkSoft; e.currentTarget.style.borderColor = hairline; }}
                    ><X size={15} /></button>
                </div>
                <div style={{ padding: '20px 24px', overflowY: 'auto', maxHeight: '60vh' }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: inkSoft, textTransform: 'uppercase', letterSpacing: 0.08, marginBottom: 10 }}>Attributes</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 18 }}>
                        <div>
                            <label style={{ fontSize: 10, fontWeight: 600, color: inkSoft, textTransform: 'uppercase', letterSpacing: 0.06, marginBottom: 4, display: 'block' }}>Number of Pages</label>
                            <input type="number"
                                style={{ width: '100%', padding: '8px 10px', border: `1.4px solid ${hairline}`, borderRadius: 8, fontSize: 13, color: ink, background: paper, outline: 'none', fontFamily: 'inherit' }}
                                placeholder="e.g. 5"
                                onChange={e => handleAttributeChange('number_of_pages', parseInt(e.target.value))}
                            />
                        </div>
                        <div>
                            <label style={{ fontSize: 10, fontWeight: 600, color: inkSoft, textTransform: 'uppercase', letterSpacing: 0.06, marginBottom: 4, display: 'block' }}>Paper Type</label>
                            <select style={{ width: '100%', padding: '8px 10px', border: `1.4px solid ${hairline}`, borderRadius: 8, fontSize: 13, color: ink, background: paper, outline: 'none', fontFamily: 'inherit' }}
                                onChange={e => handleAttributeChange('paper_type', e.target.value)}>
                                <option value="">Select...</option>
                                <option value="A4 80g">A4 80g</option>
                                <option value="A4 100g">A4 100g</option>
                                <option value="A3 80g">A3 80g</option>
                            </select>
                        </div>
                        <div>
                            <label style={{ fontSize: 10, fontWeight: 600, color: inkSoft, textTransform: 'uppercase', letterSpacing: 0.06, marginBottom: 4, display: 'block' }}>Quantity</label>
                            <input type="number"
                                style={{ width: '100%', padding: '8px 10px', border: `1.4px solid ${hairline}`, borderRadius: 8, fontSize: 13, fontWeight: 700, color: ink, background: paper, outline: 'none', fontFamily: 'inherit' }}
                                value={quantity}
                                onChange={e => setQuantity(parseInt(e.target.value))}
                            />
                        </div>
                    </div>
                    <div style={{ background: teal[50], padding: 16, borderRadius: 10, border: `1px solid ${teal[100]}`, marginBottom: 18 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                            <span style={{ fontSize: 10, fontWeight: 700, color: inkSoft, textTransform: 'uppercase', letterSpacing: 0.06 }}>Unit Price</span>
                            <span style={{ fontSize: 15, fontWeight: 700, color: ink }}>{currency}{(pricingState.sellingPrice || 0).toLocaleString()}</span>
                        </div>
                        <div style={{ height: 1, background: teal[100], marginBottom: 8 }} />
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontSize: 11, fontWeight: 700, color: ink, textTransform: 'uppercase', letterSpacing: 0.05 }}>Total Amount</span>
                            <span style={{ fontSize: 20, fontWeight: 700, color: teal[600] }}>{currency}{((pricingState.sellingPrice || 0) * quantity).toLocaleString()}</span>
                        </div>
                    </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8, padding: '14px 24px 18px', borderTop: `1px solid ${hairline}` }}>
                    <button onClick={onClose} style={ghostBtn}>Cancel</button>
                    <button onClick={handleConfirm} style={tealBtn}><ArrowRight size={14} /> Add to Order</button>
                </div>
            </div>
        </div>
    );
};

// --- Dynamic Service Calculator Modal ---
const getFinishingName = (id: string) => ({ binding: 'Binding', coverPages: 'Cover Pages', cutting: 'Cutting & Trimming', holePunch: 'Hole Punching', folding: 'Folding', stapling: 'Stapling' })[id] || id;

export const ServiceCalculatorModal: React.FC<{
    service: Item;
    currencySymbol: string;
    initialPages?: number;
    initialCopies?: number;
    onConfirm: (pricing: DynamicServicePricingResult) => void;
    onClose: () => void;
}> = ({ service, currencySymbol, initialPages = 1, initialCopies = 1, onConfirm, onClose }) => {
    const { companyConfig } = useAuth(); const { inventory = [], marketAdjustments = [] } = useInventory();
    const [pages, setPages] = useState(Math.max(1, Number(initialPages) || 1));
    const [copies, setCopies] = useState(Math.max(1, Number(initialCopies) || 1));
    const [enginePricing, setEnginePricing] = useState<DynamicServicePricingResult | null>(null);
    const [finishingCostOverrides, setFinishingCostOverrides] = useState<Record<string, number>>({});
    const [sellingPrice, setSellingPrice] = useState<number>(0);
    const [priceManuallySet, setPriceManuallySet] = useState(false);
    const [bomTemplate, setBomTemplate] = useState<any>(null);

    const sp = service.smartPricing || service.pricingConfig;
    const hasSmartPricing = !!sp;

    const [enabledFinishing, setEnabledFinishing] = useState<string[]>(() => {
        const fromSmart = sp?.finishingEnabled;
        if (fromSmart && fromSmart.length > 0) return fromSmart as string[];
        const fromConfig = sp?.finishingOptions?.filter((o: any) => o.active)?.map((o: any) => o.name || o.id) || [];
        return fromConfig;
    });

    useEffect(() => { let m = true; dbService.getSetting<Record<string, number>>('finishingOptionCosts').then(c => { if (m) setFinishingCostOverrides(c || {}); }).catch(() => { if (m) setFinishingCostOverrides({}); }); return () => { m = false; }; }, []);

    useEffect(() => {
        const bomId = sp?.bomTemplateId;
        if (bomId) {
            dbService.get('bomTemplates', bomId).then(tpl => {
                if (tpl) setBomTemplate(tpl);
            }).catch(() => {});
        } else {
            setBomTemplate(null);
        }
    }, [sp?.bomTemplateId]);

    const paper = useMemo(() => sp && sp.paperItemId ? inventory.find((i: any) => i.id === sp.paperItemId) : null, [sp, inventory]);
    const toner = useMemo(() => sp && sp.tonerItemId ? inventory.find((i: any) => i.id === sp.tonerItemId) : null, [sp, inventory]);

    const normalizedAdjustments = useMemo(() => (marketAdjustments || []).filter((adj: any) => (adj.active ?? adj.isActive) && (!adj.applyToCategories?.length || adj.applyToCategories.includes(service.category))).map((adj: any) => ({ name: adj.name, type: adj.type, value: adj.value, percentage: adj.percentage ?? adj.value, calculatedAmount: adj.value, adjustmentId: adj.id, isActive: true })), [marketAdjustments, service.category]);

    const resolveFinishingCost = useCallback((id: string): number => {
        if (!sp) return 0;
        const savedCost = sp.finishingSelections?.find((o: any) => o?.id === id)?.price ?? (sp.finishingOptionCosts || {})[id] ?? finishingCostOverrides[id] ?? companyConfig?.productionSettings?.finishingOptions?.find((o: any) => o?.id === id)?.price ?? 0;
        if (savedCost > 0) return Number(savedCost);
        if (sp.finishingOptions) {
            const opt = sp.finishingOptions.find((o: any) => (o.name || o.id) === id);
            if (opt && Number(opt.price) > 0) return Number(opt.price);
        }
        const fees = ((sp.finishingEnabled || []) as string[]);
        const fb = fees.length > 0 && Number(sp.finishingCost) > 0 ? Number(sp.finishingCost) / (fees.length * Math.max(1, Number(sp.copies) || 1)) : 0;
        return fb > 0 ? Number(fb.toFixed(2)) : ({ binding: 150, coverPages: 20, cutting: 30, holePunch: 20, folding: 15, stapling: 10 }[id] || 0);
    }, [sp, companyConfig, finishingCostOverrides]);

    const costBreakdown = useMemo(() => {
        let paperCost = 0, sheetsPerCopy = 0, totalSheets = 0, costPerSheet = 0;
        let tonerCost = 0, tonerCostPerPage = 0;
        let fd: any[] = [], fc = 0;

        if (sp) {
            sheetsPerCopy = Math.ceil(pages / 2);
            totalSheets = sheetsPerCopy * copies;

            if (paper) {
                const rs = Number(paper.conversionRate || paper.conversion_rate || 500);
                costPerSheet = rs > 0 ? Number(paper.cost_price || paper.cost_per_unit || paper.cost || 0) / rs : 0;
                paperCost = Number((totalSheets * costPerSheet).toFixed(2));
            } else if (Number(sp.paperCost) > 0) {
                costPerSheet = Number(sp.paperCost);
                paperCost = Number((totalSheets * costPerSheet).toFixed(2));
            }

            if (toner) {
                const perUnitCost = Number(toner.cost_per_unit || 0);
                if (perUnitCost > 0) {
                    tonerCostPerPage = perUnitCost;
                } else {
                    const tonerRate = Number(toner.conversionRate || toner.conversion_rate || 20000);
                    tonerCostPerPage = tonerRate > 0 ? Number(toner.cost_price || toner.cost || 0) / tonerRate : 0;
                }
                tonerCost = Number(((pages * copies) * tonerCostPerPage).toFixed(2));
            } else if (Number(sp.tonerCost) > 0) {
                tonerCostPerPage = Number(sp.tonerCost);
                tonerCost = Number((pages * copies * tonerCostPerPage).toFixed(2));
            }

            fd = enabledFinishing.map(id => {
                let cost = resolveFinishingCost(id);
                if (cost === 0 && sp.finishingOptions) {
                    const opt = sp.finishingOptions.find((o: any) => (o.name || o.id) === id);
                    if (opt) cost = Number(opt.price) || 0;
                }
                return { id, name: getFinishingName(id), cost, total: cost };
            });
            fc = Number(fd.reduce((s, f) => s + f.total, 0).toFixed(2));
        }

        return { paperCost, tonerCost, finishingCost: fc, baseCost: Number((paperCost + tonerCost + fc).toFixed(2)), sheetsPerCopy, totalSheets, costPerSheet, tonerCostPerPage, finishingDetails: fd };
    }, [pages, copies, paper, toner, sp, enabledFinishing, resolveFinishingCost]);

    const computePageScaledCost = useCallback((pageCount: number, copyCount: number): number => {
        if (!sp) { const flat = service.serviceConfig?.baseLaborCost || service.serviceConfig?.baseRate || service.cost || 0; return flat * (pageCount / (Number(service.pages) || 1)) * copyCount; }
        const totalSheets = Math.ceil(pageCount / 2) * copyCount;
        const totalPages = pageCount * copyCount;
        let pc = 0, tc = 0;
        if (sp.paperItemId) {
            const p = inventory.find((i: any) => i.id === sp.paperItemId);
            if (p) pc = Number((totalSheets * (Number(p.conversionRate || p.conversion_rate || 500) > 0 ? Number(p.cost_price || p.cost_per_unit || p.cost || 0) / Number(p.conversionRate || p.conversion_rate || 500) : 0)).toFixed(2));
        } else if (Number(sp.paperCost) > 0) {
            pc = Number((totalSheets * Number(sp.paperCost)).toFixed(2));
        }
        if (sp.tonerItemId) {
            const tn = inventory.find((i: any) => i.id === sp.tonerItemId);
            if (tn) {
                const tnPerUnit = Number(tn.cost_per_unit || 0);
                if (tnPerUnit > 0) {
                    tc = Number((totalPages * tnPerUnit).toFixed(2));
                } else {
                    const tnRate = Number(tn.conversionRate || tn.conversion_rate || 20000);
                    tc = Number((totalPages * (tnRate > 0 ? Number(tn.cost_price || tn.cost || 0) / tnRate : 0)).toFixed(2));
                }
            }
        } else if (Number(sp.tonerCost) > 0) {
            tc = Number((totalPages * Number(sp.tonerCost)).toFixed(2));
        }
        const fc = enabledFinishing.reduce((s, id) => {
            let cost = resolveFinishingCost(id);
            if (cost === 0 && sp.finishingOptions) {
                const opt = sp.finishingOptions.find((o: any) => (o.name || o.id) === id);
                if (opt) cost = Number(opt.price) || 0;
            }
            return s + cost;
        }, 0);
        return Number((pc + tc + fc).toFixed(2));
    }, [service, inventory, sp, enabledFinishing, resolveFinishingCost]);

    useEffect(() => { let m = true; const calc = async () => { try { const bc = computePageScaledCost(pages, copies); const r = await calculateServicePrice({ itemId: service.id, categoryId: service.category, baseCost: bc, pages, copies, adjustments: normalizedAdjustments, context: 'SERVICE' }); if (m) { const tp = pages * copies; setEnginePricing({ pages, copies, totalPages: tp, unitCostPerCopy: copies > 0 ? roundToCurrency(bc / copies) : bc, unitPricePerCopy: r.unitPrice, unitCostPerPage: tp > 0 ? roundToCurrency(bc / tp) : bc, unitPricePerPage: tp > 0 ? roundToCurrency(r.unitPrice / tp) : r.unitPrice, totalCost: bc, totalPrice: r.totalPrice, calculatedTotalPrice: r.totalPrice, adjustmentTotal: r.adjustmentTotal, adjustmentSnapshots: r.adjustmentSnapshots, marginAmount: r.marginAmount, rounding_difference: r.roundingDifference, components: [], serviceDetails: { pages, copies, totalPages: tp, unitCostPerPage: tp > 0 ? roundToCurrency(bc / tp) : bc, unitPricePerPage: tp > 0 ? roundToCurrency(r.unitPrice / tp) : r.unitPrice, unitCostPerCopy: copies > 0 ? roundToCurrency(bc / copies) : bc, unitPricePerCopy: r.unitPrice, totalCost: bc, totalPrice: r.totalPrice, calculatedTotalPrice: r.totalPrice, materials: [], adjustments: [] } }); } } catch (e) { logger.error('[ServiceCalculatorModal] Pricing engine error:', e); } }; calc(); return () => { m = false; }; }, [service, pages, copies, normalizedAdjustments, computePageScaledCost]);

    useEffect(() => { if (enginePricing && !priceManuallySet && enginePricing.totalPrice > 0) setSellingPrice(enginePricing.totalPrice); }, [enginePricing, priceManuallySet]);

    const ap = enginePricing; if (!ap) return null;
    const fc = (v: number) => `${currencySymbol}${formatNumber(v)}`;
    const profit = roundToCurrency(sellingPrice - (ap?.totalCost || 0));
    const isLoss = profit < 0;
    const profitMarginPct = (ap?.totalCost || 0) > 0 ? roundToCurrency((profit / (ap?.totalCost || 1)) * 100) : 0;
    const priceDiff = ap ? roundToCurrency(sellingPrice - ap.totalPrice) : 0;

    const handleConfirm = () => onConfirm({ ...ap, totalPrice: sellingPrice, unitPricePerCopy: copies > 0 ? roundToCurrency(sellingPrice / copies) : 0, calculatedTotalPrice: ap.totalPrice, marginAmount: profit, priceLocked: true, lockedTotalPrice: sellingPrice, lockedUnitPricePerCopy: copies > 0 ? roundToCurrency(sellingPrice / copies) : 0, lockedUnitCostPerCopy: copies > 0 ? roundToCurrency(ap.totalCost / copies) : 0 });

    return (
        <div style={modalOverlay} onClick={onClose}>
            <div style={{ ...modalCard, width: 640, maxHeight: '92vh' }} onClick={(e) => e.stopPropagation()}>
                <div style={accentBar} />
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '22px 28px 18px', borderBottom: `1px solid ${hairline}` }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                        <div style={iconBox}><Printer size={19} color="#fff" /></div>
                        <div>
                            <div style={{ fontSize: 9.5, letterSpacing: '0.12em', textTransform: 'uppercase', color: amber[500], marginBottom: 5 }}>Printing Service</div>
                            <h1 style={{
                                fontFamily: "'Inter','DM Sans',sans-serif", fontWeight: 400,
                                fontSize: 22, margin: 0, color: teal[800], letterSpacing: 0.2, lineHeight: 1.1
                            }}>{service.name}</h1>
                        </div>
                    </div>
                    <button onClick={onClose} aria-label="Close" style={closeBtn}
                        onMouseEnter={e => { e.currentTarget.style.background = teal[50]; e.currentTarget.style.color = teal[700]; e.currentTarget.style.borderColor = teal[200]; }}
                        onMouseLeave={e => { e.currentTarget.style.background = paper; e.currentTarget.style.color = inkSoft; e.currentTarget.style.borderColor = hairline; }}
                    ><X size={15} /></button>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1px 1fr', flex: 1, minHeight: 0 }}>
                    <div style={{ padding: '16px 20px', maxHeight: '60vh', overflowY: 'auto' }}>
                        <div style={{ fontSize: 10, fontWeight: 700, color: inkSoft, textTransform: 'uppercase', letterSpacing: 0.08, marginBottom: 9 }}>Quantities</div>
                        <div style={{ display: 'flex', border: `1.4px solid ${hairline}`, borderRadius: 10, overflow: 'hidden', marginBottom: 14 }}>
                            <div style={{ flex: 1, padding: '8px 10px', borderRight: `1.4px solid ${hairline}` }}>
                                <div style={{ fontSize: 9, fontWeight: 600, color: inkSoft, textTransform: 'uppercase', letterSpacing: 0.06, marginBottom: 3 }}>Pages</div>
                                <input type="number" min={1} value={pages} onChange={e => setPages(Math.max(1, parseInt(e.target.value || '1', 10) || 1))}
                                    style={{ border: 'none', padding: 0, fontSize: 14, fontWeight: 700, color: ink, width: '100%', background: 'transparent', outline: 'none', fontFamily: 'inherit' }} />
                            </div>
                            <div style={{ flex: 1, padding: '8px 10px', background: teal[50], textAlign: 'center' }}>
                                <div style={{ fontSize: 9, fontWeight: 600, color: inkSoft, textTransform: 'uppercase', letterSpacing: 0.06, marginBottom: 3 }}>Copies</div>
                                <input type="number" min={1} value={copies} onChange={e => setCopies(Math.max(1, parseInt(e.target.value || '1', 10) || 1))}
                                    style={{ border: 'none', padding: 0, fontSize: 14, fontWeight: 700, color: ink, width: '100%', background: 'transparent', outline: 'none', textAlign: 'center', fontFamily: 'inherit' }} />
                            </div>
                        </div>
                        {bomTemplate && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11.5, color: inkSoft, paddingBottom: 14, marginBottom: 14, borderBottom: `1px solid ${hairline}` }}>
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={amber[500]} strokeWidth="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><path d="M3.27 6.96L12 12.01l8.73-5.05M12 22.08V12"/></svg>
                                Specs from <b style={{ color: ink, fontWeight: 700 }}>BOM: {bomTemplate.name}</b>
                            </div>
                        )}
                        {costBreakdown.finishingDetails.length > 0 && (
                            <>
                                <div style={{ fontSize: 10, fontWeight: 700, color: inkSoft, textTransform: 'uppercase', letterSpacing: 0.08, marginBottom: 9 }}>Finishing Options</div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                    {costBreakdown.finishingDetails.map(fd => {
                                        const isOn = enabledFinishing.includes(fd.id);
                                        return (
                                            <button key={fd.id} type="button" onClick={() => setEnabledFinishing(prev => prev.includes(fd.id) ? prev.filter(id => id !== fd.id) : [...prev, fd.id])}
                                                style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 10px', borderRadius: 8, border: 'none', cursor: 'pointer', width: '100%', textAlign: 'left', background: isOn ? amber[100] : teal[50], transition: 'all .12s' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                    <div style={{ width: 6, height: 6, borderRadius: '50%', background: isOn ? amber[500] : inkSoft }}></div>
                                                    <span style={{ fontSize: 12, fontWeight: 600, color: ink }}>{fd.name}</span>
                                                </div>
                                                <span style={{ fontSize: 11, color: isOn ? amber[500] : inkSoft }}>{fc(fd.cost)}/job</span>
                                            </button>
                                        );
                                    })}
                                </div>
                            </>
                        )}
                    </div>
                    <div style={{ background: hairline }}></div>
                    <div style={{ padding: '16px 20px', maxHeight: '60vh', overflowY: 'auto' }}>
                        <div style={{ fontSize: 10, fontWeight: 700, color: inkSoft, textTransform: 'uppercase', letterSpacing: 0.08, marginBottom: 9 }}>Cost Breakdown</div>
                        {hasSmartPricing ? (
                            <>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 0', fontSize: 12.5 }}>
                                    <span style={{ color: inkSoft }}>Paper</span>
                                    <span style={{ fontWeight: 600, color: ink }}>{fc(costBreakdown.paperCost)}</span>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 0', fontSize: 12.5 }}>
                                    <span style={{ color: inkSoft }}>Toner</span>
                                    <span style={{ fontWeight: 600, color: ink }}>{fc(costBreakdown.tonerCost)}</span>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 0', fontSize: 12.5 }}>
                                    <span style={{ color: inkSoft }}>Finishing</span>
                                    <span style={{ fontWeight: 600, color: ink }}>{fc(costBreakdown.finishingCost)}</span>
                                </div>
                                <div style={{ borderTop: `1px dashed ${hairline}`, margin: '4px 0' }}></div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 0', fontSize: 12.5 }}>
                                    <span style={{ color: inkSoft }}>Cost Price</span>
                                    <span style={{ fontWeight: 600, color: ink }}>{fc(costBreakdown.baseCost)}</span>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 0', fontSize: 12.5 }}>
                                    <span style={{ color: inkSoft }}>Selling Price</span>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                        <span style={{ fontSize: 11, color: inkSoft }}>{currencySymbol}</span>
                                        <input type="number" step="0.01" min={0} value={sellingPrice} onChange={e => { setSellingPrice(Math.max(0, parseFloat(e.target.value || '0'))); setPriceManuallySet(true); }}
                                            style={{ width: 80, textAlign: 'right', border: `1.4px solid ${hairline}`, borderRadius: 6, padding: '3px 7px', fontSize: 12.5, fontWeight: 700, color: ink, outline: 'none', fontFamily: 'inherit' }}
                                            onFocus={e => e.currentTarget.style.borderColor = amber[500]}
                                            onBlur={e => e.currentTarget.style.borderColor = hairline} />
                                    </div>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 0', fontSize: 12.5 }}>
                                    <span style={{ color: inkSoft }}>Calculated</span>
                                    <span style={{ fontSize: 13.5, fontWeight: 700, color: amber[600] }}>{fc(ap.totalPrice)}</span>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#ecfdf5', borderRadius: 8, padding: '9px 12px', marginTop: 12 }}>
                                    <div style={{ fontSize: 11.5, color: '#059669', fontWeight: 700 }}>
                                        Profit {isLoss ? '-' : '+'}{fc(Math.abs(profit))}
                                    </div>
                                    <div style={{ fontSize: 11, fontWeight: 700, color: '#059669', background: paper, padding: '3px 9px', borderRadius: 999 }}>{profitMarginPct}% margin</div>
                                </div>
                                {isLoss && (
                                    <div style={{ marginTop: 8, padding: '6px 10px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, fontSize: 11, color: '#dc2626', display: 'flex', alignItems: 'center', gap: 6 }}>
                                        <AlertTriangle size={12} /> Below cost — loss of {fc(Math.abs(profit))}
                                    </div>
                                )}
                                {!isLoss && profit > 0 && profitMarginPct < 10 && (
                                    <div style={{ marginTop: 8, padding: '6px 10px', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, fontSize: 11, color: '#d97706', display: 'flex', alignItems: 'center', gap: 6 }}>
                                        <Info size={12} /> Low margin ({profitMarginPct}%) — increase price
                                    </div>
                                )}
                            </>
                        ) : (
                            <>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 0', fontSize: 12.5 }}>
                                    <span style={{ color: inkSoft }}>Base Rate</span>
                                    <span style={{ fontWeight: 600, color: ink }}>{fc(ap.totalCost)}</span>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 0', fontSize: 12.5 }}>
                                    <span style={{ color: inkSoft }}>Selling Price</span>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                        <span style={{ fontSize: 11, color: inkSoft }}>{currencySymbol}</span>
                                        <input type="number" step="0.01" min={0} value={sellingPrice} onChange={e => { setSellingPrice(Math.max(0, parseFloat(e.target.value || '0'))); setPriceManuallySet(true); }}
                                            style={{ width: 80, textAlign: 'right', border: `1.4px solid ${hairline}`, borderRadius: 6, padding: '3px 7px', fontSize: 12.5, fontWeight: 700, color: ink, outline: 'none', fontFamily: 'inherit' }}
                                            onFocus={e => e.currentTarget.style.borderColor = amber[500]}
                                            onBlur={e => e.currentTarget.style.borderColor = hairline} />
                                    </div>
                                </div>
                            </>
                        )}
                    </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, padding: '14px 24px 18px', borderTop: `1px solid ${hairline}` }}>
                    <div>
                        <div style={{ fontSize: 9, fontWeight: 600, color: inkSoft, textTransform: 'uppercase', letterSpacing: 0.08 }}>Total Due</div>
                        <div style={{ fontSize: 23, color: ink, lineHeight: 1.15, fontWeight: 700 }}>{fc(sellingPrice)}</div>
                        <div style={{ fontSize: 10, color: inkSoft }}>{pages * copies} page{pages * copies !== 1 ? 's' : ''} &middot; {Math.ceil(pages / 2) * copies} sheet{Math.ceil(pages / 2) * copies !== 1 ? 's' : ''} &middot; {fc(copies > 0 ? roundToCurrency(sellingPrice / copies) : 0)}/copy</div>
                    </div>
                    <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                        <button onClick={onClose} style={ghostBtn}>Cancel</button>
                        <button onClick={handleConfirm} style={tealBtn}><ArrowRight size={14} /> Add to Order</button>
                    </div>
                </div>
            </div>
        </div>
    );
};

// --- Customer Modal ---
export const CustomerModal: React.FC<{
    onSelect: (name: string) => void;
    onClose: () => void;
}> = ({ onSelect, onClose }) => {
    const { companyConfig, notify } = useAuth(); const { invoices } = useFinance(); const { customers } = useSales();
    const [showQuickAdd, setShowQuickAdd] = useState(false);
    const [newCustomerName, setNewCustomerName] = useState('');
    const [newCustomerContact, setNewCustomerContact] = useState('');
    const [searchTerm, setSearchTerm] = useState('');

    const customerNames = useMemo(() => {
        const names = new Set<string>();
        customers?.forEach(c => {
            if (c.name) names.add(c.name);
        });
        invoices?.forEach(inv => {
            if (inv.customerName) names.add(inv.customerName);
        });
        return Array.from(names).sort();
    }, [invoices, customers]);

    const filteredCustomerNames = useMemo(() => {
        if (!searchTerm.trim()) return customerNames;
        const term = searchTerm.trim().toLowerCase();
        return customerNames.filter(name => name.toLowerCase().includes(term));
    }, [customerNames, searchTerm]);

    const handleQuickAdd = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newCustomerName) return;
        onSelect(newCustomerName);
        notify(`Customer ${newCustomerName} selected`, 'success');
        onClose();
    };

    return (
        <div style={modalOverlay} onClick={onClose}>
            <div style={{ ...modalCard, width: 520, maxHeight: '82vh' }} onClick={(e) => e.stopPropagation()}>
                <div style={accentBar} />
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '22px 28px 18px', borderBottom: `1px solid ${hairline}` }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                        <div style={iconBox}><Users size={19} color="#fff" /></div>
                        <div>
                            <h1 style={{
                                fontFamily: "'Inter','DM Sans',sans-serif", fontWeight: 400,
                                fontSize: 22, margin: 0, color: teal[800], letterSpacing: 0.2
                            }}>Select Customer</h1>
                            <p style={{ margin: '2px 0 0', fontSize: 11.5, color: inkSoft, letterSpacing: 0.02 }}>
                                {filteredCustomerNames.length} account{filteredCustomerNames.length !== 1 ? 's' : ''}
                            </p>
                        </div>
                    </div>
                    <button onClick={onClose} aria-label="Close" style={closeBtn}
                        onMouseEnter={e => { e.currentTarget.style.background = teal[50]; e.currentTarget.style.color = teal[700]; e.currentTarget.style.borderColor = teal[200]; }}
                        onMouseLeave={e => { e.currentTarget.style.background = paper; e.currentTarget.style.color = inkSoft; e.currentTarget.style.borderColor = hairline; }}
                    ><X size={15} /></button>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
                    <div style={{ padding: '10px 20px', borderBottom: `1px solid ${hairline}` }}>
                        <div style={{ position: 'relative' }}>
                            <Search style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: inkSoft }} size={14} />
                            <input type="text" placeholder="Search customers…" value={searchTerm}
                                onChange={e => setSearchTerm(e.target.value)}
                                style={{ width: '100%', padding: '8px 10px 8px 34px', border: `1.4px solid ${hairline}`, borderRadius: 8, fontSize: 13, color: ink, background: paper, outline: 'none', fontFamily: "'JetBrains Mono', monospace" }}
                                onFocus={e => { e.currentTarget.style.borderColor = teal[400]; e.currentTarget.style.background = teal[50]; }}
                                onBlur={e => { e.currentTarget.style.borderColor = hairline; e.currentTarget.style.background = paper; }} />
                            {searchTerm && (
                                <button onClick={() => setSearchTerm('')}
                                    style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', width: 20, height: 20, borderRadius: '50%', border: 'none', background: teal[50], color: inkSoft, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    <X size={11} />
                                </button>
                            )}
                        </div>
                    </div>
                    <div style={{ padding: '8px 20px', borderBottom: `1px solid ${hairline}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: 0.08, textTransform: 'uppercase', color: inkSoft }}>Actions</span>
                        <button onClick={() => setShowQuickAdd(!showQuickAdd)}
                            style={{
                                display: 'flex', alignItems: 'center', gap: 5, padding: '5px 10px', borderRadius: 7, fontSize: 12, fontWeight: 600,
                                fontFamily: 'inherit', cursor: 'pointer',
                                background: showQuickAdd ? teal[50] : `linear-gradient(155deg, ${teal[500]}, ${teal[700]})`,
                                color: showQuickAdd ? inkSoft : '#fff',
                                border: showQuickAdd ? `1.4px solid ${hairline}` : '1.4px solid transparent',
                                transition: 'all .12s'
                            }}>
                            {showQuickAdd ? <X size={13} /> : <UserPlus size={13} />}
                            {showQuickAdd ? 'Cancel' : 'New Customer'}
                        </button>
                    </div>
                    {showQuickAdd && (
                        <form onSubmit={handleQuickAdd} style={{ padding: '12px 20px', background: teal[50], borderBottom: `1px solid ${hairline}` }}>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 10 }}>
                                <div>
                                    <label style={{ fontSize: 9, fontWeight: 700, letterSpacing: 0.06, textTransform: 'uppercase', color: inkSoft, marginBottom: 5, display: 'block' }}>
                                        Full Name <span style={{ color: danger }}>*</span>
                                    </label>
                                    <input placeholder="e.g. Acme Printing" value={newCustomerName}
                                        onChange={e => setNewCustomerName(e.target.value)}
                                        style={{ width: '100%', padding: '7px 10px', border: `1.4px solid ${hairline}`, borderRadius: 7, fontSize: 13, color: ink, background: paper, outline: 'none', fontFamily: 'inherit' }}
                                        onFocus={e => { e.currentTarget.style.borderColor = teal[400]; e.currentTarget.style.background = teal[50]; }}
                                        onBlur={e => { e.currentTarget.style.borderColor = hairline; e.currentTarget.style.background = paper; }} />
                                </div>
                                <div>
                                    <label style={{ fontSize: 9, fontWeight: 700, letterSpacing: 0.06, textTransform: 'uppercase', color: inkSoft, marginBottom: 5, display: 'block' }}>Contact Info</label>
                                    <input placeholder="Phone or Email" value={newCustomerContact}
                                        onChange={e => setNewCustomerContact(e.target.value)}
                                        style={{ width: '100%', padding: '7px 10px', border: `1.4px solid ${hairline}`, borderRadius: 7, fontSize: 13, color: ink, background: paper, outline: 'none', fontFamily: 'inherit' }}
                                        onFocus={e => { e.currentTarget.style.borderColor = teal[400]; e.currentTarget.style.background = teal[50]; }}
                                        onBlur={e => { e.currentTarget.style.borderColor = hairline; e.currentTarget.style.background = paper; }} />
                                </div>
                            </div>
                            <button type="submit" disabled={!newCustomerName}
                                style={{
                                    ...tealBtn, width: '100%', justifyContent: 'center', opacity: newCustomerName ? 1 : 0.4,
                                    cursor: newCustomerName ? 'pointer' : 'not-allowed'
                                }}>
                                <Save size={13} /> Save and Select
                            </button>
                        </form>
                    )}
                    <div style={{ flex: 1, overflowY: 'auto', background: paper }}>
                        {filteredCustomerNames.length === 0 ? (
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '56px 24px' }}>
                                <div style={{ width: 48, height: 48, borderRadius: '50%', background: teal[50], display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
                                    <Users size={20} style={{ color: inkSoft, opacity: 0.5 }} />
                                </div>
                                <p style={{ fontSize: 13, fontWeight: 500, color: inkSoft, textAlign: 'center' }}>
                                    {searchTerm ? `No matches for "${searchTerm}"` : 'No customers found'}
                                </p>
                                <p style={{ fontSize: 11, color: hairline, marginTop: 4, textAlign: 'center' }}>
                                    {searchTerm ? 'Try adjusting your search criteria' : 'Add a new customer to get started'}
                                </p>
                            </div>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column' }}>
                                {filteredCustomerNames.map(name => {
                                    const custInvoices = invoices.filter(i => i.customerName === name && i.status !== 'Paid' && i.status !== 'Draft');
                                    const custDebt = custInvoices.reduce((sum, i) => sum + (i.totalAmount - (i.paidAmount || 0)), 0);
                                    const initials = name.charAt(0).toUpperCase();

                                    return (
                                        <button key={name} onClick={() => onSelect(name)}
                                            style={{ width: '100%', textAlign: 'left', padding: '10px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, border: 'none', cursor: 'pointer', background: 'transparent', borderBottom: `1px solid ${teal[50]}`, transition: 'all .12s', fontFamily: 'inherit', fontSize: 13.5, color: ink }}
                                            onMouseEnter={e => e.currentTarget.style.background = teal[50]}
                                            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0, flex: 1 }}>
                                                <div style={{
                                                    width: 36, height: 36, borderRadius: 8, background: teal[50], color: inkSoft,
                                                    border: `1px solid ${hairline}`, display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                    fontSize: 14, fontWeight: 700, flexShrink: 0,
                                                    transition: 'all .12s'
                                                }}
                                                    onMouseEnter={e => { e.currentTarget.style.background = teal[600]; e.currentTarget.style.color = '#fff'; e.currentTarget.style.borderColor = teal[600]; }}
                                                    onMouseLeave={e => { e.currentTarget.style.background = teal[50]; e.currentTarget.style.color = inkSoft; e.currentTarget.style.borderColor = hairline; }}>
                                                    {initials}
                                                </div>
                                                <div style={{ minWidth: 0 }}>
                                                    <div style={{ fontWeight: 700, lineHeight: 1.25, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</div>
                                                </div>
                                            </div>
                                            <div style={{ flexShrink: 0, textAlign: 'right' }}>
                                                <div style={{
                                                    display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px',
                                                    borderRadius: 5, fontSize: 11, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace",
                                                    border: `1px solid ${custDebt > 0 ? 'rgba(220,38,38,0.18)' : 'rgba(22,163,74,0.18)'}`,
                                                    background: custDebt > 0 ? 'rgba(220,38,38,0.07)' : 'rgba(22,163,74,0.07)',
                                                    color: custDebt > 0 ? '#dc2626' : '#16a34a'
                                                }}>
                                                    {companyConfig.currencySymbol}{custDebt.toLocaleString()}
                                                </div>
                                                <div style={{ fontSize: 10, color: inkSoft, fontWeight: 700, letterSpacing: 0.06, textTransform: 'uppercase', marginTop: 2 }}>
                                                    {custDebt > 0 ? 'Outstanding' : 'Settled'}
                                                </div>
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                    <div style={{ padding: '8px 20px', background: teal[50], borderTop: `1px solid ${hairline}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span style={{ fontSize: 10, color: hairline, fontFamily: "'JetBrains Mono', monospace" }}>↑↓ navigate &middot; ↵ select &middot; esc close</span>
                        <span style={{
                            display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 4,
                            fontSize: 10, fontWeight: 700, border: `1px solid rgba(15,84,76,0.2)`,
                            background: 'rgba(15,84,76,0.08)', color: teal[600]
                        }}>POS Mode</span>
                    </div>
                </div>
            </div>
        </div>
    );
};

// --- Held Orders Modal ---
export const HeldOrdersModal: React.FC<{
    orders: HeldOrder[];
    onRetrieve: (o: HeldOrder) => void;
    onClose: () => void;
}> = ({ orders, onRetrieve, onClose }) => (
    <div style={modalOverlay} onClick={onClose}>
        <div style={{ ...modalCard, width: 520, maxHeight: '82vh' }} onClick={(e) => e.stopPropagation()}>
            <div style={accentBar} />
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '22px 28px 18px', borderBottom: `1px solid ${hairline}` }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                    <div style={iconBox}><Clock size={19} color="#fff" /></div>
                    <div>
                        <h1 style={{
                            fontFamily: "'Inter','DM Sans',sans-serif", fontWeight: 400,
                            fontSize: 22, margin: 0, color: teal[800], letterSpacing: 0.2
                        }}>Parked Orders</h1>
                        <p style={{ margin: '2px 0 0', fontSize: 11.5, color: inkSoft, letterSpacing: 0.02 }}>Retrieve a parked order</p>
                    </div>
                </div>
                <button onClick={onClose} aria-label="Close" style={closeBtn}
                    onMouseEnter={e => { e.currentTarget.style.background = teal[50]; e.currentTarget.style.color = teal[700]; e.currentTarget.style.borderColor = teal[200]; }}
                    onMouseLeave={e => { e.currentTarget.style.background = paper; e.currentTarget.style.color = inkSoft; e.currentTarget.style.borderColor = hairline; }}
                ><X size={15} /></button>
            </div>
            <div style={{ overflowY: 'auto', flex: 1 }}>
                {orders.length === 0 ? (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '80px 20px', color: inkSoft }}>
                        <Clock size={48} style={{ marginBottom: 16, opacity: 0.2 }} />
                        <p style={{ fontSize: 14, fontWeight: 500 }}>No parked orders found</p>
                    </div>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                        {orders.map(order => (
                            <div key={order.id}
                                style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 24px', borderBottom: `1px solid ${teal[50]}`, transition: 'all .12s' }}
                                onMouseEnter={e => { e.currentTarget.style.background = teal[50]; }}
                                onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}>
                                <div>
                                    <div style={{ fontWeight: 700, color: ink }}>{order.customerName}</div>
                                    <div style={{ fontSize: 12, color: inkSoft, display: 'flex', alignItems: 'center', gap: 8, marginTop: 2 }}>
                                        <span>{new Date(order.date).toLocaleString()}</span>
                                        <span style={{ width: 4, height: 4, borderRadius: '50%', background: hairline }}></span>
                                        <span>{order.items.length} items</span>
                                    </div>
                                    {order.note && <div style={{ fontSize: 12, color: inkSoft, fontStyle: 'italic', marginTop: 2 }}>Note: {order.note}</div>}
                                </div>
                                <button onClick={() => onRetrieve(order)}
                                    style={{
                                        fontFamily: "'Inter', sans-serif", fontSize: 12, fontWeight: 600,
                                        padding: '7px 20px', borderRadius: 999, cursor: 'pointer',
                                        background: paper, border: `1.4px solid ${hairline}`, color: ink,
                                        transition: 'all .15s'
                                    }}
                                    onMouseEnter={e => { e.currentTarget.style.background = teal[50]; e.currentTarget.style.borderColor = teal[200]; e.currentTarget.style.color = teal[700]; }}
                                    onMouseLeave={e => { e.currentTarget.style.background = paper; e.currentTarget.style.borderColor = hairline; e.currentTarget.style.color = ink; }}>
                                    Retrieve
                                </button>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    </div>
);

// --- Returns Modal ---
export const ReturnsModal: React.FC<{
    sales: Sale[];
    onProcess: (saleId: string, items: any[], accountId: string) => void;
    onClose: () => void;
}> = ({ sales, onProcess, onClose }) => {
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedSale, setSelectedSale] = useState<Sale | null>(null);
    const [returnItems, setReturnItems] = useState<{ itemId: string, qty: number }[]>([]);
    const [refundAccountId, setRefundAccountId] = useState(ACCOUNT_IDS.CASH_DRAWER);

    const cashBankAccounts = useMemo(() =>
        DEFAULT_ACCOUNTS.filter(acc => [ACCOUNT_IDS.CASH_DRAWER, ACCOUNT_IDS.BANK, ACCOUNT_IDS.MOBILE_MONEY].includes(acc.id)),
        []);

    const handleSearch = () => {
        const sale = sales.find(s => s.id === searchTerm);
        if (sale) setSelectedSale(sale); else alert("Sale not found");
    };

    const toggleItem = (itemId: string, max: number) => {
        setReturnItems(prev => {
            if (prev.find(i => i.itemId === itemId)) return prev.filter(i => i.itemId !== itemId);
            return [...prev, { itemId, qty: max }];
        });
    };

    return (
        <div style={modalOverlay} onClick={onClose}>
            <div style={{ ...modalCard, width: 560, maxHeight: '82vh' }} onClick={(e) => e.stopPropagation()}>
                <div style={accentBar} />
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '22px 28px 18px', borderBottom: `1px solid ${hairline}` }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                        <div style={iconBox}><ArrowRight size={19} color="#fff" style={{ transform: 'rotate(180deg)' }} /></div>
                        <div>
                            <h1 style={{
                                fontFamily: "'Inter','DM Sans',sans-serif", fontWeight: 400,
                                fontSize: 22, margin: 0, color: teal[800], letterSpacing: 0.2
                            }}>Process Return</h1>
                            <p style={{ margin: '2px 0 0', fontSize: 11.5, color: inkSoft, letterSpacing: 0.02 }}>Refund items from a sale</p>
                        </div>
                    </div>
                    <button onClick={onClose} aria-label="Close" style={closeBtn}
                        onMouseEnter={e => { e.currentTarget.style.background = teal[50]; e.currentTarget.style.color = teal[700]; e.currentTarget.style.borderColor = teal[200]; }}
                        onMouseLeave={e => { e.currentTarget.style.background = paper; e.currentTarget.style.color = inkSoft; e.currentTarget.style.borderColor = hairline; }}
                    ><X size={15} /></button>
                </div>
                <div style={{ padding: '16px 24px', borderBottom: `1px solid ${hairline}` }}>
                    <div style={{ display: 'flex', gap: 10, maxWidth: 400 }}>
                        <input type="text" placeholder="e.g. REC-1234"
                            value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
                            style={{ flex: 1, padding: '8px 12px', border: `1.4px solid ${hairline}`, borderRadius: 8, fontSize: 13, color: ink, background: paper, outline: 'none', fontFamily: 'inherit' }}
                            onFocus={e => { e.currentTarget.style.borderColor = teal[400]; e.currentTarget.style.background = teal[50]; }}
                            onBlur={e => { e.currentTarget.style.borderColor = hairline; e.currentTarget.style.background = paper; }} />
                        <button onClick={handleSearch}
                            style={{
                                ...tealBtn, fontSize: 12, padding: '8px 20px',
                            }}>
                            Search
                        </button>
                    </div>
                </div>
                <div style={{ overflowY: 'auto', flex: 1, minHeight: 0 }}>
                    {selectedSale ? (
                        <div style={{ padding: '16px 24px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                                <p style={{ fontSize: 10, fontWeight: 700, color: inkSoft, textTransform: 'uppercase', letterSpacing: 0.06 }}>Select items to refund</p>
                                <span style={{
                                    padding: '2px 8px', borderRadius: 4, fontSize: 10, fontWeight: 700,
                                    background: amber[100], color: amber[600], border: `1px solid ${amber[300]}`
                                }}>POS Sale</span>
                            </div>
                            {selectedSale.items.map(item => {
                                const isSelected = returnItems.some(r => r.itemId === item.id);
                                return (
                                    <div key={item.id}
                                        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px', borderRadius: 8, cursor: 'pointer', transition: 'all .12s', border: `1px solid ${isSelected ? teal[200] : 'transparent'}`, background: isSelected ? teal[50] : 'transparent', marginBottom: 4 }}
                                        onClick={() => toggleItem(item.id, item.quantity)}
                                        onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = teal[50]; }}
                                        onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = 'transparent'; }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                            <div style={{
                                                width: 20, height: 20, borderRadius: 4,
                                                border: `1.4px solid ${isSelected ? teal[600] : hairline}`,
                                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                background: isSelected ? teal[600] : 'transparent',
                                                transition: 'all .12s'
                                            }}>
                                                {isSelected && <CheckCircle size={14} color="#fff" />}
                                            </div>
                                            <div>
                                                <div style={{ fontWeight: 700, color: ink, fontSize: 13 }}>{item.name}</div>
                                                <div style={{ fontSize: 11, color: inkSoft }}>{item.quantity} units @ ${item.price}</div>
                                            </div>
                                        </div>
                                        <div style={{ fontWeight: 700, color: ink }}>${formatNumber(item.quantity * item.price)}</div>
                                    </div>
                                );
                            })}
                        </div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '80px 20px', color: inkSoft }}>
                            <Search size={48} style={{ marginBottom: 16, opacity: 0.2 }} />
                            <p style={{ fontSize: 14, fontWeight: 500 }}>Search for a sale to begin refund</p>
                        </div>
                    )}
                </div>
                <div style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16,
                    padding: '14px 24px 18px', borderTop: `1px solid ${hairline}`,
                    background: teal[50]
                }}>
                    <div>
                        <label style={{ fontSize: 9, fontWeight: 700, letterSpacing: 0.06, textTransform: 'uppercase', color: inkSoft, marginBottom: 4, display: 'block' }}>Pay Refund From</label>
                        <select value={refundAccountId} onChange={(e) => setRefundAccountId(e.target.value)}
                            style={{ padding: '7px 10px', border: `1.4px solid ${hairline}`, borderRadius: 7, fontSize: 13, fontWeight: 700, color: ink, background: paper, outline: 'none', fontFamily: 'inherit', minWidth: 180 }}>
                            {cashBankAccounts.map(acc => (
                                <option key={acc.id} value={acc.id}>{acc.name}</option>
                            ))}
                        </select>
                    </div>
                    <button onClick={() => selectedSale && onProcess(selectedSale.id, returnItems, refundAccountId)}
                        disabled={returnItems.length === 0}
                        style={{
                            ...dangerBtn, fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.04,
                            opacity: returnItems.length === 0 ? 0.5 : 1,
                            cursor: returnItems.length === 0 ? 'not-allowed' : 'pointer'
                        }}>
                        Complete Refund
                    </button>
                </div>
            </div>
        </div>
    );
};

// --- Variant Selector Modal ---
export const VariantSelectorModal: React.FC<{
    product: Item;
    onSelect: (variant: ProductVariant) => void;
    onClose: () => void;
}> = ({ product, onSelect, onClose }) => {
    const { companyConfig } = useAuth();
    const currency = companyConfig.currencySymbol;
    const [quantity, setQuantity] = useState(1);

    const isStationery = product.type === 'Stationery' || product.type === 'Product';
    const shouldSkipConfigure = isStationery || (product.variants && product.variants.length > 0);

    const handleVariantClick = (v: ProductVariant) => {
        onSelect({ ...normalizeStoredPricing(v as unknown as Record<string, unknown>), quantity } as unknown as ProductVariant);
    };

    return (
        <div style={modalOverlay} onClick={onClose}>
            <div style={{ ...modalCard, width: 520, maxHeight: '82vh' }} onClick={(e) => e.stopPropagation()}>
                <div style={accentBar} />
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '22px 28px 18px', borderBottom: `1px solid ${hairline}` }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                        <div style={iconBox}><Printer size={19} color="#fff" /></div>
                        <div>
                            <h1 style={{
                                fontFamily: "'Inter','DM Sans',sans-serif", fontWeight: 400,
                                fontSize: 22, margin: 0, color: teal[800], letterSpacing: 0.2
                            }}>Select Variant</h1>
                            <p style={{ margin: '2px 0 0', fontSize: 11.5, color: inkSoft, letterSpacing: 0.02 }}>{product.name}</p>
                        </div>
                    </div>
                    <button onClick={onClose} aria-label="Close" style={closeBtn}
                        onMouseEnter={e => { e.currentTarget.style.background = teal[50]; e.currentTarget.style.color = teal[700]; e.currentTarget.style.borderColor = teal[200]; }}
                        onMouseLeave={e => { e.currentTarget.style.background = paper; e.currentTarget.style.color = inkSoft; e.currentTarget.style.borderColor = hairline; }}
                    ><X size={15} /></button>
                </div>
                <div style={{ padding: '12px 24px', borderBottom: `1px solid ${hairline}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <label style={{ fontSize: 10, fontWeight: 700, color: inkSoft, textTransform: 'uppercase', letterSpacing: 0.06 }}>Quantity to Add</label>
                    <input type="number" min="1"
                        style={{ width: 120, padding: '7px 10px', border: `1.4px solid ${hairline}`, borderRadius: 7, fontSize: 13, fontWeight: 700, color: ink, background: paper, outline: 'none', textAlign: 'right', fontFamily: 'inherit' }}
                        value={quantity}
                        onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                        onFocus={e => e.currentTarget.style.borderColor = teal[400]}
                        onBlur={e => e.currentTarget.style.borderColor = hairline} />
                </div>
                <div style={{ overflowY: 'auto', flex: 1 }}>
                    {product.variants?.map((v, vi) => (
                        <button key={v.id || vi} onClick={() => handleVariantClick(v)}
                            style={{ width: '100%', textAlign: 'left', padding: '14px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', border: 'none', cursor: 'pointer', background: 'transparent', borderBottom: `1px solid ${teal[50]}`, transition: 'all .12s', fontFamily: 'inherit' }}
                            onMouseEnter={e => e.currentTarget.style.background = teal[50]}
                            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                            <div style={{ flex: 1 }}>
                                <div style={{ fontWeight: 700, color: ink, fontSize: 13 }}>{v.name}</div>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
                                    {Object.entries(v.attributes || {}).map(([attrKey, val]) => (
                                        <span key={attrKey}
                                            style={{ fontSize: 9, fontWeight: 700, padding: '1px 6px', borderRadius: 999, background: teal[50], color: inkSoft, textTransform: 'uppercase', border: `1px solid ${teal[100]}` }}>
                                            {attrKey.replace(/_/g, ' ')}: {String(val)}
                                        </span>
                                    ))}
                                </div>
                            </div>
                            <div style={{ textAlign: 'right', marginLeft: 16, flexShrink: 0 }}>
                                <div style={{ fontSize: 14, fontWeight: 700, color: teal[600] }}>{currency}{formatNumber(resolveStoredSellingPrice(v))}</div>
                                {(product.type === 'Stationery' || product.type === 'Material' || product.type === 'Raw Material' || product.type === 'Product') && v.stock > 0 && (
                                    <div style={{ fontSize: 10, fontWeight: 500, color: inkSoft }}>{v.stock} in stock</div>
                                )}
                            </div>
                        </button>
                    ))}
                </div>
            </div>
        </div>
    );
};
