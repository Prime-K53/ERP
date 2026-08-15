import React, { useState, useEffect, useMemo } from 'react';
import { logger } from '@/services/logger';
import { Calculator, ChevronDown, ChevronUp, X, Info, Copy, RefreshCw, Save, Printer, Package, Settings, Plus, Download } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useSales } from '../../context/SalesContext';
import { useNavigate, useLocation } from 'react-router-dom';
import { dbService } from '../../services/db';
import { Item, MarketAdjustment, BOMTemplate, FinishingOption } from '../../types';
import { generateAutoSKU } from '../../utils/skuGenerator';
import { normalizeInventoryItemPricing } from '../../utils/pricing';
import { calculateProfit, calculateMarkup, validateMinimumMarkup, buildPricingSnapshot } from '../../services/pricingValidationService';
import { currencyService } from '../../services/currencyService';
import { calculateMaterialCosts } from '../../utils/pricingEngineShared';
import html2canvas from 'html2canvas';

const defaultFinishingOptions: FinishingOption[] = [
    { id: 'binding', name: 'Binding', enabled: false, price: 150, description: 'Book binding - comb or spiral', items: [] },
    { id: 'coverPages', name: 'Cover Pages', enabled: false, price: 20, description: 'Front and back cover pages per copy', items: [] },
    { id: 'cutting', name: 'Cutting & Trimming', enabled: false, price: 30, description: 'Trim edges to clean finish', items: [], batchSize: 10 },
    { id: 'holePunch', name: 'Hole Punching', enabled: false, price: 20, description: 'Punch holes for folder binding', items: [], batchSize: 10 },
    { id: 'folding', name: 'Folding', enabled: false, price: 15, description: 'Fold pages for insertion', items: [], batchSize: 10 },
    { id: 'stapling', name: 'Stapling', enabled: false, price: 10, description: 'Corner or saddle stapling', items: [] },
    { id: 'standardTurnaround', name: 'Standard Turnaround', enabled: false, price: 0, description: 'Standard delivery turnaround', items: [] },
    { id: 'rushSurcharge', name: 'Rush Surcharge', enabled: false, price: 0, description: 'Express/rush order surcharge', items: [] },
];

const SmartPricing: React.FC = () => {
    const { companyConfig } = useAuth();

    const { addJobOrder, jobOrders } = useSales();
    const navigate = useNavigate();
    const location = useLocation();
    const currency = currencyService.getCurrency(currencyService.getBaseCurrency())?.symbol || 'K';
    
    const [pages, setPages] = useState(1);
    const [copies, setCopies] = useState(1);
    const [selectedPaperId, setSelectedPaperId] = useState<string>('');
    const [selectedTonerId, setSelectedTonerId] = useState<string>('');
    const [finishingOptions, setFinishingOptions] = useState<FinishingOption[]>(defaultFinishingOptions);
    const [sellingPrice, setSellingPrice] = useState<number>(0);
    const [productName, setProductName] = useState('Scheme Pad');
    const [selectedInventoryProductId, setSelectedInventoryProductId] = useState('');
    const [editingProductId, setEditingProductId] = useState<string | null>(null);
    const [editingBomId, setEditingBomId] = useState<string | null>(null);
    const [itemType, setItemType] = useState<'Product' | 'Service'>('Product');
    const [isCreatingProduct, setIsCreatingProduct] = useState(false);
    const [inventory, setInventory] = useState<Item[]>([]);
    const [marketAdjustments, setMarketAdjustments] = useState<MarketAdjustment[]>([]);
    const [bomTemplates, setBOMTemplates] = useState<BOMTemplate[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [manualPaperUnitCost, setManualPaperUnitCost] = useState<number | null>(null);
    const [manualTonerUnitCost, setManualTonerUnitCost] = useState<number | null>(null);
    
    const [paperExpanded, setPaperExpanded] = useState(true);
    const [finishingExpanded, setFinishingExpanded] = useState(true);
    const [marketExpanded, setMarketExpanded] = useState(false);
    const [bomExpanded, setBomExpanded] = useState(false);
    const [showSummaryCard, setShowSummaryCard] = useState(false);
    const [cameFromModal, setCameFromModal] = useState(false);
    const [showSaveDialog, setShowSaveDialog] = useState(false);
    const [saveItemName, setSaveItemName] = useState('');
    const [saveDialogType, setSaveDialogType] = useState<'Product' | 'Service'>('Product');
    const [saveVariants, setSaveVariants] = useState<Array<{ id: string; attribute: string; pages: number; basePrice: number; sellingPrice: number }>>([]);

    useEffect(() => {
        const loadData = async () => {
            try {
                setIsLoading(true);
                const [inv, adjustments, templates] = await Promise.all([
                    dbService.getAll<Item>('inventory'),
                    dbService.getAll<MarketAdjustment>('marketAdjustments'),
                    dbService.getAll<BOMTemplate>('bomTemplates'),
                ]);
                setInventory(inv.map(normalizeInventoryItemPricing));
                setMarketAdjustments(adjustments.filter(adj => adj.active ?? adj.isActive ?? false));
                setBOMTemplates(templates);

                if (companyConfig?.productionSettings?.finishingOptions?.length > 0) {
                    setFinishingOptions(companyConfig.productionSettings.finishingOptions);
                } else {
                    const savedCosts = await dbService.getSetting<Record<string, number>>('finishingOptionCosts');
                    if (savedCosts) {
                        setFinishingOptions(prev => prev.map(opt => ({
                            ...opt,
                            price: savedCosts[opt.id] ?? opt.price
                        })));
                    }
                }

                const isRawMat = (i: Item) => i.type === 'Raw Material' || i.type === 'Material';

                const paperItemsList = inv.filter(i => {
                    if (!isRawMat(i)) return false;
                    const cat = (i.category || '').toLowerCase();
                    return cat.includes('paper') || cat.includes('bond') || cat.includes('sheet');
                });
                const tonerItemsList = inv.filter(i => {
                    if (!isRawMat(i)) return false;
                    const cat = (i.category || '').toLowerCase();
                    return cat.includes('toner') || cat.includes('ink') || cat.includes('cartridge');
                });

                if (paperItemsList.length > 0) setSelectedPaperId(paperItemsList[0].id);
                if (tonerItemsList.length > 0) {
                    const universalToner = tonerItemsList.find(t => 
                        (t.name || '').toLowerCase().includes('universal')
                    );
                    setSelectedTonerId(universalToner ? universalToner.id : tonerItemsList[0].id);
                }
            } catch (err) {
                logger.error('Failed to load pricing data:', err);
            } finally {
                setIsLoading(false);
            }
        };
        loadData();
    }, [companyConfig]);

    useEffect(() => {
        const loadProductId = (location.state as { loadProductId?: string })?.loadProductId || new URLSearchParams(location.search).get('loadProductId');
        if (loadProductId && inventory.length > 0) {
            loadInventoryProduct(loadProductId);
            setCameFromModal(true);
            window.history.replaceState({}, document.title);
        }
    }, [inventory, location.state, location.search]);

    const isRawMat = (i: Item) => i.type === 'Raw Material' || i.type === 'Material';

    const paperItems = useMemo(() => inventory.filter(i => {
        if (!isRawMat(i)) return false;
        const cat = (i.category || '').toLowerCase();
        return cat.includes('paper') || cat.includes('bond') || cat.includes('sheet');
    }), [inventory]);

    const tonerItems = useMemo(() => inventory.filter(i => {
        if (!isRawMat(i)) return false;
        const cat = (i.category || '').toLowerCase();
        return cat.includes('toner') || cat.includes('ink') || cat.includes('cartridge');
    }), [inventory]);

    const bindingInventoryItem = useMemo(() => inventory.find(i =>
        i.name?.toLowerCase().includes('binding')
    ), [inventory]);
    const staplingInventoryItem = useMemo(() => inventory.find(i =>
        i.name?.toLowerCase().includes('staple') || /\bpins?\b/.test(i.name || '')
    ), [inventory]);
    const coverInventoryItem = useMemo(() => inventory.find(i =>
        i.name?.toLowerCase().includes('cover') || i.name?.toLowerCase().includes('card') || i.name?.toLowerCase().includes('bold')
    ), [inventory]);

    const getItemUnitCost = (item: Item | undefined): number => {
        if (!item) return 0;
        return Number(item.cost_price ?? item.cost ?? item.costPrice ?? 0);
    };
    const getItemConversionRate = (item: Item | undefined, fallback: number): number => {
        if (!item) return fallback;
        return Number(item.conversionRate ?? fallback);
    };

    const inventoryBindingCost = useMemo(() => {
        if (!bindingInventoryItem) return 0;
        const unitCost = getItemUnitCost(bindingInventoryItem);
        const conversionRate = getItemConversionRate(bindingInventoryItem, 1);
        return conversionRate > 0 ? unitCost / conversionRate : 0;
    }, [bindingInventoryItem]);

    const inventoryStaplingCost = useMemo(() => {
        if (!staplingInventoryItem) return 0;
        const unitCost = getItemUnitCost(staplingInventoryItem);
        const conversionRate = getItemConversionRate(staplingInventoryItem, 5000);
        return conversionRate > 0 ? unitCost / conversionRate : 0;
    }, [staplingInventoryItem]);

    const inventoryCoverCost = useMemo(() => {
        if (!coverInventoryItem) return 0;
        const unitCost = getItemUnitCost(coverInventoryItem);
        const conversionRate = getItemConversionRate(coverInventoryItem, 100);
        return conversionRate > 0 ? unitCost / conversionRate : 0;
    }, [coverInventoryItem]);

    const finishingOptionsWithPrices = useMemo(() => {
        return finishingOptions.map(opt => {
            if (opt.id === 'binding' && inventoryBindingCost > 0) {
                return { ...opt, price: parseFloat(inventoryBindingCost.toFixed(2)) };
            }
            if (opt.id === 'coverPages' && inventoryCoverCost > 0) {
                return { ...opt, price: parseFloat(inventoryCoverCost.toFixed(2)) };
            }
            if (opt.id === 'stapling' && inventoryStaplingCost > 0) {
                return { ...opt, price: parseFloat(inventoryStaplingCost.toFixed(2)) };
            }
            return opt;
        });
    }, [finishingOptions, inventoryBindingCost, inventoryCoverCost, inventoryStaplingCost]);

    const selectedPaper = useMemo(() => inventory.find(i => i.id === selectedPaperId), [inventory, selectedPaperId]);
    const selectedToner = useMemo(() => inventory.find(i => i.id === selectedTonerId), [inventory, selectedTonerId]);

    const editableInventoryProducts = useMemo(
        () => inventory
            .filter(item => item.type === 'Product' || item.type === 'Service')
            .sort((left, right) => String(left.name || '').localeCompare(String(right.name || ''))),
        [inventory]
    );

    const { paperCost, tonerCost, finishingCost, finishingInventoryCost, baseCost } = calculateMaterialCosts({
        paper: selectedPaper,
        toner: selectedToner,
        pages,
        copies,
        finishingOptions: finishingOptionsWithPrices,
        inventory,
        paperUnitCost: manualPaperUnitCost ?? undefined,
        tonerUnitCost: manualTonerUnitCost ?? undefined,
    });
    const costPrice = baseCost;
    const profit = calculateProfit(costPrice, sellingPrice);
    const profitMarkup = calculateMarkup(costPrice, sellingPrice);
    const validation = validateMinimumMarkup(costPrice, sellingPrice, editingProductId ? { id: editingProductId, category: undefined } : undefined);
    const pricingSnapshot = buildPricingSnapshot(costPrice, sellingPrice, editingProductId ? { id: editingProductId, category: undefined } : undefined);

    const handlePagesChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const value = parseInt(e.target.value, 10);
        if (!isNaN(value) && value >= 1 && value <= 10000) setPages(value);
        else if (e.target.value === '') setPages(1);
    };

    const handleCopiesChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const value = parseInt(e.target.value, 10);
        if (!isNaN(value) && value >= 1 && value <= 100000) setCopies(value);
        else if (e.target.value === '') setCopies(1);
    };

    const handleSellingPriceChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const value = parseFloat(e.target.value);
        if (!isNaN(value) && value >= 0) setSellingPrice(value);
        else if (e.target.value === '') setSellingPrice(0);
    };

    const toggleFinishingOption = (id: string) => {
        setFinishingOptions(prev => prev.map(opt => 
            opt.id === id ? { ...opt, enabled: !opt.enabled } : opt
        ));
    };

    const resetCalculator = () => {
        setPages(1);
        setCopies(1);
        setSellingPrice(0);
        setManualPaperUnitCost(null);
        setManualTonerUnitCost(null);
        if (paperItems.length > 0) setSelectedPaperId(paperItems[0].id);
        if (tonerItems.length > 0) setSelectedTonerId(tonerItems[0].id);
        setFinishingOptions(prev => prev.map(opt => ({ ...opt, enabled: false })));
    };

    const clearLoadedProduct = () => {
        setEditingProductId(null);
        setEditingBomId(null);
        setSelectedInventoryProductId('');
        setProductName('');
        setItemType('Product');
        resetCalculator();
    };

    const loadInventoryProduct = (productId: string) => {
        const product = inventory.find(item => item.id === productId);
        if (!product) {
            alert('Selected item was not found in inventory.');
            return;
        }

        const smartPricing = product.smartPricing || {};
        const savedPaperId = String(smartPricing.paperItemId || product.pricingConfig?.paperId || '');
        const savedTonerId = String(smartPricing.tonerItemId || product.pricingConfig?.tonerId || '');
        const savedFinishingIds = new Set<string>([
            ...((smartPricing.finishingEnabled || []) as string[]),
            ...(((product.pricingConfig?.finishingOptions || []) as FinishingOption[]).map(option => option.id))
        ]);
        const savedFinishingCostMap = {
            ...Object.fromEntries(
                (((smartPricing.finishingSelections || []) as FinishingOption[]).map(option => [
                    option.id,
                    Number(option.price) || 0
                ]))
            ),
            ...((smartPricing.finishingOptionCosts || {}) as Record<string, number>)
        };
        const resolvedPaperId = savedPaperId || paperItems[0]?.id || selectedPaperId || '';
        const resolvedTonerId = savedTonerId || tonerItems[0]?.id || selectedTonerId || '';

        setPages(Math.max(1, Number(smartPricing.pages ?? product.pages ?? 1) || 1));
        setSellingPrice(Number(product.sellingPrice ?? product.price ?? 0));
        setSelectedPaperId(resolvedPaperId);
        setSelectedTonerId(resolvedTonerId);
        setFinishingOptions(prev => prev.map(option => ({
            ...option,
            price: Number(savedFinishingCostMap[option.id] ?? option.price) || option.price,
            enabled: savedFinishingIds.has(option.id)
        })));
        setEditingProductId(product.id);
        setEditingBomId(String(smartPricing.bomTemplateId || `BOM-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`));
        setSelectedInventoryProductId(product.id);
        setProductName(product.name || '');
        setItemType((product.type as 'Product' | 'Service') || 'Product');
    };

    const handleSaveProduct = async (nameOverride?: string) => {
        const nameToUse = nameOverride || productName;
        if (!nameToUse.trim()) {
            alert('Please enter a name');
            return;
        }

        if (!validation.valid) {
            alert(`Unable to save product.\n\nCalculated markup: ${profitMarkup.toFixed(1)}%\nMinimum required markup: ${validation.minimumMarkup}%\n\n${validation.message}`);
            return;
        }

        setIsCreatingProduct(true);

        try {
            const existingProduct = editingProductId ? inventory.find(item => item.id === editingProductId) : null;
            const productId = editingProductId || `PROD-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
            const bomId = editingBomId || existingProduct?.smartPricing?.bomTemplateId || `BOM-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
            const enabledFinishingOptions = finishingOptionsWithPrices.filter(option => option.enabled);
            const finishingOptionCosts = enabledFinishingOptions.reduce<Record<string, number>>((acc, option) => {
                acc[option.id] = Number(option.price) || 0;
                return acc;
            }, {});

            const newProduct: Item = {
                ...(existingProduct || {}),
                id: productId,
                name: nameToUse.trim(),
                sku: existingProduct?.sku || generateAutoSKU(itemType, nameToUse, undefined, inventory),
                type: itemType,
                classification: itemType === 'Service' ? 'printing_service' : existingProduct?.classification,
                category: existingProduct?.category || (itemType === 'Service' ? 'Printing Service' : 'Printed Products'),
                unit: existingProduct?.unit || 'Booklet',
                cost: baseCost,
                cost_price: baseCost,
                costPrice: baseCost,
                price: sellingPrice,
                selling_price: sellingPrice,
                sellingPrice: sellingPrice,
                profitAmount: profit,
                profitMargin: profitMarkup,
                minimumMargin: validation.minimumMarkup,
                pricingValidated: validation.valid,
                validationTimestamp: new Date().toISOString(),
                stock: existingProduct?.stock || 0,
                pages,
                pricingConfig: {
                    ...(existingProduct?.pricingConfig || {}),
                    paperId: selectedPaperId,
                    tonerId: selectedTonerId,
                    finishingOptions: enabledFinishingOptions,
                    manualOverride: false,
                    marketAdjustment: 0,
                },
                smartPricing: {
                    pages,
                    copies: 1,
                    totalPages: pages,
                    totalSheets: Math.ceil(pages / 2),
                    paperItemId: selectedPaperId,
                    tonerItemId: selectedTonerId,
                    finishingEnabled: enabledFinishingOptions.map(o => o.id),
                    finishingOptionCosts,
                    bomTemplateId: bomId,
                    paperCost,
                    tonerCost,
                    finishingCost,
                    finishingInventoryCost,
                    baseCost,
                } as Item['smartPricing']
            };

            const components: any[] = [];
            if (selectedPaper) {
                components.push({
                    itemId: selectedPaperId,
                    name: selectedPaper.name,
                    quantityFormula: `${totalSheets}`,
                    unit: selectedPaper.unit || 'ream'
                });
            }
            if (selectedToner) {
                components.push({
                    itemId: selectedTonerId,
                    name: selectedToner.name,
                    quantityFormula: `${Math.ceil(totalPages / 20000 * 100)} / 100`,
                    unit: selectedToner.unit || 'unit'
                });
            }
            enabledFinishingOptions.forEach(opt => {
                components.push({
                    itemId: opt.id,
                    name: opt.name,
                    quantityFormula: `${opt.id === 'coverPages' ? 2 : 1}`,
                    unit: 'unit'
                });
            });

            const bomSuffix = itemType === 'Service' ? ' (Printing Service)' : ' (Product)';
            const newBom: BOMTemplate = {
                ...(bomTemplates.find(template => template.id === bomId) || {}),
                id: bomId,
                name: `${productName.trim()}${bomSuffix}`,
                type: 'Custom',
                components,
                lastUpdated: new Date().toISOString()
            };

            await dbService.put('inventory', newProduct);
            await dbService.put('bomTemplates', newBom);

            setInventory(prev => {
                const exists = prev.some(item => item.id === newProduct.id);
                return exists ? prev.map(item => item.id === newProduct.id ? newProduct : item) : [...prev, newProduct];
            });
            setBOMTemplates(prev => {
                const exists = prev.some(template => template.id === newBom.id);
                return exists ? prev.map(template => template.id === newBom.id ? newBom : template) : [...prev, newBom];
            });

            setEditingProductId(newProduct.id);
            setEditingBomId(newBom.id);
            setSelectedInventoryProductId(newProduct.id);

            alert(editingProductId
                ? `${itemType} "${nameToUse.trim()}" updated and saved back to inventory.`
                : `${itemType} "${nameToUse.trim()}" created and saved to inventory with corresponding BOM recipe.`);
            if (cameFromModal) {
                navigate(-1);
            }
        } catch (error) {
            logger.error('Failed to save item:', error);
            alert(editingProductId ? 'Failed to update item' : 'Failed to create item');
        } finally {
            setIsCreatingProduct(false);
        }
    };

    const formatCurrency = (value: number) => `${currency} ${value.toFixed(2)}`;
    const totalPages = pages;
    const totalSheets = Math.ceil(pages / 2);

    const handleSaveCardImage = async () => {
        const el = document.getElementById('price-summary-card');
        if (!el) return;
        try {
            const canvas = await html2canvas(el, { backgroundColor: '#ffffff', scale: 2, useCORS: true, logging: false });
            const link = document.createElement('a');
            link.download = `price-summary-card-${Date.now()}.png`;
            link.href = canvas.toDataURL('image/png');
            link.click();
        } catch (err) {
            logger.error('Failed to save card image:', err);
        }
    };

    const formatRoundingLabel = (methodUsed: string): string => {
        if (!methodUsed) return 'rounded';

        if (methodUsed.startsWith('ALWAYS_UP_')) {
            const step = methodUsed.replace('ALWAYS_UP_', '');
            return `Rounding up (${step})`;
        } else if (methodUsed.startsWith('NEAREST_')) {
            const step = methodUsed.replace('NEAREST_', '');
            return `nearest ${step}`;
        } else if (methodUsed === 'PSYCHOLOGICAL') {
            return 'psychological';
        }

        return 'rounded';
    };

    const getItemCost = (item: Item | undefined) => {
        if (!item) return 0;
        return Number(item.cost_price || item.cost_per_unit || item.cost || 0);
    };

    const hasValidMaterialCost = (item: Item | undefined) => {
        if (!item) return false;
        return (item.cost_price || 0) > 0 || (item.cost_per_unit || 0) > 0 || (item.cost || 0) > 0 || (item.costPrice || 0) > 0;
    };

    const paperCostWarning = selectedPaper && !hasValidMaterialCost(selectedPaper);
    const tonerCostWarning = selectedToner && !hasValidMaterialCost(selectedToner);

    const getItemUnit = (item: Item | undefined) => {
        if (!item) return '';
        return item.unit || 'unit';
    };

    const handleOpenSaveDialog = () => {
        setSaveItemName(productName || '');
        setSaveDialogType('Product');
        setSaveVariants([]);
        setShowSaveDialog(true);
    };

    const addVariantRow = () => {
        if (saveVariants.length >= 5) return;
        const flatCost = paperCost + tonerCost + finishingCost + finishingInventoryCost;
        setSaveVariants(prev => [...prev, {
            id: `v${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
            attribute: '',
            pages,
            basePrice: parseFloat(flatCost.toFixed(2)),
            sellingPrice: 0,
        }]);
    };

    const updateVariantRow = (id: string, field: string, value: any) => {
        setSaveVariants(prev => prev.map(v => {
            if (v.id !== id) return v;
            const updated = { ...v, [field]: value };
            if (field === 'pages') {
                const pageCost = (paperCost + tonerCost) / pages;
                updated.basePrice = parseFloat((pageCost * (value as number) + finishingCost + finishingInventoryCost).toFixed(2));
            }
            return updated;
        }));
    };

    const removeVariantRow = (id: string) => {
        setSaveVariants(prev => prev.filter(v => v.id !== id));
    };

    const handleSaveFromDialog = async () => {
        if (!saveItemName.trim()) {
            alert('Please enter a name');
            return;
        }

        if (!validation.valid) {
            alert(`Unable to save product.\n\nCalculated markup: ${profitMarkup.toFixed(1)}%\nMinimum required markup: ${validation.minimumMarkup}%\n\n${validation.message}`);
            return;
        }

        const name = saveItemName.trim();
        const type = saveDialogType;
        const variantsToSave = saveVariants.filter(v => v.attribute.trim() && v.sellingPrice > 0);

        setProductName(name);
        setItemType(type);
        setShowSaveDialog(false);

        await new Promise(resolve => setTimeout(resolve, 50));

        setIsCreatingProduct(true);
        try {
            await handleSaveProduct(name);

            if (variantsToSave.length > 0) {
                const enabledFinishingOptions = finishingOptionsWithPrices.filter(o => o.enabled);

                for (const variant of variantsToSave) {
                    const varPages = variant.pages;
                    const varTotalSheets = Math.ceil(varPages / 2);
                    const varPaperCost = parseFloat((paperCost * (varPages / pages)).toFixed(2));
                    const varTonerCost = parseFloat((tonerCost * (varPages / pages)).toFixed(2));
                    const varCost = parseFloat((varPaperCost + varTonerCost + finishingCost + finishingInventoryCost).toFixed(2));
                    const varId = `PROD-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
                    const varBomId = `BOM-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;

                    const varProfit = parseFloat((variant.sellingPrice - varCost).toFixed(2));
                    const varItem: Item = {
                        id: varId,
                        name: `${name} - ${variant.attribute.trim()}`,
                        sku: generateAutoSKU(type, `${name} ${variant.attribute.trim()}`, undefined, inventory),
                        type: type,
                        classification: type === 'Service' ? 'printing_service' : undefined,
                        category: type === 'Service' ? 'Printing Service' : 'Printed Products',
                        unit: 'Booklet',
                        cost: varCost,
                        cost_price: varCost,
                        costPrice: varCost,
                        price: variant.sellingPrice,
                        selling_price: variant.sellingPrice,
                        sellingPrice: variant.sellingPrice,
                        profitAmount: varProfit,
                        profitMargin: varCost > 0 ? parseFloat(((varProfit / varCost) * 100).toFixed(2)) : 0,
                        minimumMargin: validation.minimumMarkup,
                        pricingValidated: validation.valid,
                        stock: 0,
                        pages: varPages,
                        pricingConfig: {
                            paperId: selectedPaperId,
                            tonerId: selectedTonerId,
                            finishingOptions: enabledFinishingOptions,
                            manualOverride: false,
                            marketAdjustment: 0,
                        },
                        smartPricing: {
                            pages: varPages,
                            copies: 1,
                            totalPages: varPages,
                            totalSheets: varTotalSheets,
                            paperItemId: selectedPaperId,
                            tonerItemId: selectedTonerId,
                            finishingEnabled: enabledFinishingOptions.map(o => o.id),
                            finishingOptionCosts: enabledFinishingOptions.reduce<Record<string, number>>((acc, o) => {
                                acc[o.id] = Number(o.price) || 0;
                                return acc;
                            }, {}),
                            bomTemplateId: varBomId,
                            paperCost: varPaperCost,
                            tonerCost: varTonerCost,
                            finishingCost: finishingCost,
                            finishingInventoryCost: finishingInventoryCost,
                            baseCost: varCost,
                        } as Item['smartPricing']
                    };

                    const varComponents: any[] = [];
                    if (selectedPaper) {
                        varComponents.push({
                            itemId: selectedPaperId,
                            name: selectedPaper.name,
                            quantityFormula: `${varTotalSheets}`,
                            unit: selectedPaper.unit || 'ream'
                        });
                    }
                    if (selectedToner) {
                        varComponents.push({
                            itemId: selectedTonerId,
                            name: selectedToner.name,
                            quantityFormula: `${Math.ceil(varPages / 20000 * 100)} / 100`,
                            unit: selectedToner.unit || 'unit'
                        });
                    }
                    enabledFinishingOptions.forEach(opt => {
                        varComponents.push({
                            itemId: opt.id,
                            name: opt.name,
                            quantityFormula: `${opt.id === 'coverPages' ? 2 : 1}`,
                            unit: 'unit'
                        });
                    });

                    const varBom: BOMTemplate = {
                        id: varBomId,
                        name: `${name} - ${variant.attribute.trim()} (${type === 'Service' ? 'Printing Service' : 'Product'})`,
                        type: 'Custom',
                        components: varComponents,
                        lastUpdated: new Date().toISOString()
                    };

                    await dbService.put('inventory', varItem);
                    await dbService.put('bomTemplates', varBom);
                }
            }
        } catch (error) {
            logger.error('Failed to save with variants:', error);
            alert('Failed to save item');
        } finally {
            setIsCreatingProduct(false);
        }
    };

    if (isLoading) {
        return (
            <div className="h-full flex items-center justify-center" style={{ background: '#FBF8F2' }}>
                <div className="flex flex-col items-center gap-4 p-8 bg-[#FEFDFB] rounded-2xl shadow-lg border border-[#E4DFD1]">
                    <div className="relative">
                        <div className="absolute inset-0 bg-[#1C8C86]/10 rounded-full blur-xl animate-pulse" />
                        <svg className="w-12 h-12 text-[#146B67] relative animate-pulse" viewBox="0 0 24 24" fill="none"><rect x="4" y="3" width="16" height="18" rx="2" stroke="currentColor" strokeWidth="1.7"/><path d="M8 8h8M8 12h8M8 16h5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/></svg>
                    </div>
                    <p className="text-[#666F6C] font-medium" style={{ fontSize: 13.5, lineHeight: 1.45 }}>Loading pricing engine...</p>
                    <div className="flex gap-1.5">
                        <div className="w-2 h-2 bg-[#1C8C86] rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                        <div className="w-2 h-2 bg-[#146B67] rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                        <div className="w-2 h-2 bg-[#0F3D3E] rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                    </div>
                </div>
            </div>
        );
    }

    const mkWarning = !validation.valid && sellingPrice > 0;

    return (
        <div className="h-full overflow-auto" style={{ background: '#FBF8F2' }}>
            <div className="max-w-[1340px] mx-auto p-6">

                {/* ── Top Bar ── */}
                <div className="flex items-center justify-between mb-4" style={{ padding: '10px 2px 16px' }}>
                    <div className="flex items-center gap-3.5">
                        <div style={{ width: 40, height: 40, borderRadius: 11, background: 'linear-gradient(150deg,#146B67,#0F3D3E)', display:'flex', alignItems:'center', justifyContent:'center', boxShadow: '0 1px 2px rgba(15,61,62,0.06)' }}>
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><rect x="4" y="3" width="16" height="18" rx="2" stroke="#fff" strokeWidth="1.7"/><path d="M8 8h8M8 12h8M8 16h5" stroke="#fff" strokeWidth="1.7" strokeLinecap="round"/></svg>
                        </div>
                        <div>
                            <h1 style={{ fontSize: 22, fontWeight: 600, letterSpacing: '-0.01em', lineHeight: 1.3, color: '#23282A', margin: 0 }}>Smart Pricing Engine</h1>
                            <p style={{ fontSize: 12.5, color: '#666F6C', lineHeight: 1.4, margin: '2px 0 0' }}>Calculate job pricing with BOM cost analysis</p>
                            {editingProductId && (
                                <div className="mt-1.5 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full" style={{ fontSize: 12, fontWeight: 600, background: 'linear-gradient(135deg, rgba(28,140,134,0.12), rgba(20,107,103,0.08))', border: '1px solid rgba(28,140,134,0.25)', color: '#146B67' }}>
                                    <span className="w-1.5 h-1.5 rounded-full bg-[#2AA69E] animate-pulse" />
                                    Editing {itemType}: {productName || inventory.find(item => item.id === editingProductId)?.name || editingProductId}
                                </div>
                            )}
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        {mkWarning && (
                            <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full" style={{ fontSize: 12, fontWeight: 600, background: '#FBEAEA', color: '#B23B3B' }}>
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none"><path d="M12 9v4M12 17h.01M10.3 3.9L2.6 18a2 2 0 001.8 3h15.2a2 2 0 001.8-3L13.7 3.9a2 2 0 00-3.4 0z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
                                Below minimum {validation.minimumMarkup}% markup
                            </div>
                        )}
                        <button
                            onClick={() => navigate('/settings', { state: { tab: 'Finishing' } })}
                            className="flex items-center gap-1.5" style={{ fontFamily:'Inter,sans-serif', fontSize:13, fontWeight:600, padding:'7px 12px', borderRadius:9, border:'1px solid #E4DFD1', background:'#FEFDFB', color:'#0F3D3E', cursor:'pointer', lineHeight:1.4, transition:'all .15s ease' }}
                            onMouseEnter={e => { e.currentTarget.style.borderColor = '#1C8C86'; e.currentTarget.style.color = '#1C8C86'; e.currentTarget.style.boxShadow = '0 1px 2px rgba(15,61,62,0.06)'; }}
                            onMouseLeave={e => { e.currentTarget.style.borderColor = '#E4DFD1'; e.currentTarget.style.color = '#0F3D3E'; e.currentTarget.style.boxShadow = 'none'; }}
                        >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M12 8v8M8 12h8" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/><circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.6"/></svg>
                            Manage Prices
                        </button>
                    </div>
                </div>

                {/* ── Load Strip ── */}
                <div style={{ background:'linear-gradient(120deg, rgba(28,140,134,0.08), rgba(201,131,47,0.05))', border:'1px solid #E4DFD1', borderRadius:14, padding:'12px 16px', display:'grid', gridTemplateColumns:'auto 1fr auto auto', alignItems:'center', gap:16, marginBottom:18 }}>
                    <div style={{ minWidth: 190 }}>
                        <p style={{ fontSize:12, fontWeight:600, letterSpacing:'0.06em', textTransform:'uppercase', color:'#1C8C86', margin:'0 0 2px', lineHeight:1.4 }}>Load from Inventory</p>
                        <p style={{ margin:0, fontSize:12.5, color:'#666F6C', lineHeight:1.4 }}>Pick an existing item, configure it, save back to its BOM</p>
                    </div>
                    <select
                        value={selectedInventoryProductId}
                        onChange={(e) => setSelectedInventoryProductId(e.target.value)}
                        style={{ width:'100%', fontFamily:'Inter,sans-serif', fontSize:13.5, padding:'8px 12px', borderRadius:9, border:'1px solid #E4DFD1', background:'#fff', color:'#23282A', outline:'none', lineHeight:1.4 }}
                    >
                        <option value="">Select a product or service...</option>
                        {editableInventoryProducts.map(product => (
                            <option key={product.id} value={product.id}>
                                [{product.type}] {product.name} ({product.sku})
                            </option>
                        ))}
                    </select>
                    <button
                        onClick={() => loadInventoryProduct(selectedInventoryProductId)}
                        disabled={!selectedInventoryProductId}
                        style={{ fontFamily:'Inter,sans-serif', fontSize:13, fontWeight:600, padding:'7px 12px', borderRadius:9, border:'none', cursor:'pointer', background:'linear-gradient(135deg, #1C8C86, #146B67)', color:'#fff', display:'flex', alignItems:'center', gap:7, lineHeight:1.4, transition:'all .15s ease', boxShadow:'0 1px 2px rgba(15,61,62,0.06)', opacity: selectedInventoryProductId ? 1 : 0.5 }}
                        onMouseEnter={e => { if (selectedInventoryProductId) { e.currentTarget.style.filter = 'brightness(1.06)'; e.currentTarget.style.boxShadow = '0 8px 24px rgba(15,61,62,0.10)'; }}}
                        onMouseLeave={e => { if (selectedInventoryProductId) { e.currentTarget.style.filter = ''; e.currentTarget.style.boxShadow = '0 1px 2px rgba(15,61,62,0.06)'; }}}
                    >
                        Load Item
                    </button>
                    <button
                        onClick={clearLoadedProduct}
                        style={{ fontFamily:'Inter,sans-serif', fontSize:13, fontWeight:600, padding:'7px 12px', borderRadius:9, border:'1px solid #E4DFD1', cursor:'pointer', background:'transparent', color:'#0F3D3E', lineHeight:1.4, transition:'all .15s ease' }}
                        onMouseEnter={e => { e.currentTarget.style.borderColor = '#1C8C86'; e.currentTarget.style.color = '#1C8C86'; }}
                        onMouseLeave={e => { e.currentTarget.style.borderColor = '#E4DFD1'; e.currentTarget.style.color = '#0F3D3E'; }}
                    >
                        + New Item
                    </button>
                </div>

                {/* ── 3-Column Layout ── */}
                <div style={{ display:'grid', gridTemplateColumns:'1.2fr 1.2fr 380px', gap:18, alignItems:'start' }}>

                    {/* ═══ Col 1: Finishing Options ═══ */}
                    <div>
                    <div>
                        <div style={{ background:'#FEFDFB', border:'1px solid #E4DFD1', borderRadius:14, boxShadow:'0 1px 2px rgba(15,61,62,0.06)', marginBottom:18 }}>
                            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'10px 16px', borderBottom:'1px solid #E4DFD1' }}>
                                <div className="flex items-center gap-2.5">
                                    <div style={{ width:28, height:28, borderRadius:8, background:'#EDE6F7', display:'flex', alignItems:'center', justifyContent:'center' }}>
                                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="#7B5CC9" strokeWidth="1.7"/><path d="M9 12l2 2 4-4" stroke="#7B5CC9" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/></svg>
                                    </div>
                                    <h3 style={{ fontSize:14, margin:0, fontWeight:600, lineHeight:1.4, color:'#23282A' }}>Finishing Options</h3>
                                </div>
                            </div>
                            <div style={{ padding:'14px 16px 16px' }}>
                                <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
                                    {finishingOptionsWithPrices.map(option => (
                                        <div
                                            key={option.id}
                                            onClick={() => toggleFinishingOption(option.id)}
                                            style={{
                                                border: `1.5px solid ${option.enabled ? '#1C8C86' : '#E4DFD1'}`,
                                                borderRadius: 11,
                                                padding: '11px 13px',
                                                cursor: 'pointer',
                                                transition: 'all .15s ease',
                                                background: option.enabled ? 'linear-gradient(135deg, #F0FAF8, #FFFFFF)' : '#fff',
                                                boxShadow: option.enabled ? '0 0 0 1px #1C8C86 inset' : 'none',
                                            }}
                                        >
                                            <div className="flex items-center justify-between" style={{ marginBottom: 5 }}>
                                                <span style={{ fontSize:13.5, fontWeight:600, lineHeight:1.4, color:'#23282A' }}>{option.name}</span>
                                                <div style={{
                                                    width: 18, height: 18, borderRadius: 6,
                                                    border: `1.5px solid ${option.enabled ? '#1C8C86' : '#E4DFD1'}`,
                                                    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                                                    transition: 'all .15s ease',
                                                    background: option.enabled ? '#1C8C86' : 'transparent',
                                                }}>
                                                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" style={{ opacity: option.enabled ? 1 : 0 }}><path d="M5 12l5 5L20 6" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/></svg>
                                                </div>
                                            </div>
                                            <p style={{ fontSize:12, color:'#666F6C', margin:'0 0 7px', lineHeight:1.45 }}>{option.description}</p>
                                            <span style={{ fontFamily:'"JetBrains Mono", monospace', fontVariantNumeric:'tabular-nums', fontSize:13, fontWeight:700, color:'#146B67' }}>{currency} {option.price}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>
                    </div>

                    {/* ═══ Col 2: Print Settings + BOM Materials + How Finishing ═══ */}
                    <div>

                    {/* ═══ Print Settings ═══ */}
                    <div>
                        <div style={{ background:'#FEFDFB', border:'1px solid #E4DFD1', borderRadius:14, boxShadow:'0 1px 2px rgba(15,61,62,0.06)', marginBottom:18 }}>
                            <div style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 16px', borderBottom:'1px solid #E4DFD1' }}>
                                <div style={{ width:28, height:28, borderRadius:8, background:'#F4E3C8', display:'flex', alignItems:'center', justifyContent:'center' }}>
                                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none"><rect x="4" y="3" width="16" height="18" rx="2" stroke="#C9832F" strokeWidth="1.7"/><path d="M8 8h8M8 12h8M8 16h5" stroke="#C9832F" strokeWidth="1.7" strokeLinecap="round"/></svg>
                                </div>
                                <h3 style={{ fontSize:14, margin:0, fontWeight:600, lineHeight:1.4, color:'#23282A' }}>Print Settings</h3>
                            </div>
                            <div style={{ padding:'14px 16px 16px' }}>
                                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:12 }}>
                                    <div>
                                        <span style={{ fontSize:12, fontWeight:600, color:'#666F6C', marginBottom:5, display:'block', lineHeight:1.4 }}>Pages per Copy</span>
                                        <input
                                            type="number"
                                            value={pages}
                                            onChange={handlePagesChange}
                                            min={1} max={10000}
                                            style={{ width:'100%', fontFamily:'"JetBrains Mono", monospace', fontVariantNumeric:'tabular-nums', fontSize:13.5, padding:'8px 12px', borderRadius:9, border:'1px solid #E4DFD1', background:'#fff', color:'#23282A', outline:'none', lineHeight:1.4 }}
                                        />
                                    </div>
                                    <div>
                                        <span style={{ fontSize:12, fontWeight:600, color:'#666F6C', marginBottom:5, display:'block', lineHeight:1.4 }}>Copies</span>
                                        <input
                                            type="number"
                                            value={copies}
                                            onChange={handleCopiesChange}
                                            min={1} max={100000}
                                            style={{ width:'100%', fontFamily:'"JetBrains Mono", monospace', fontVariantNumeric:'tabular-nums', fontSize:13.5, padding:'8px 12px', borderRadius:9, border:'1px solid #E4DFD1', background:'#fff', color:'#23282A', outline:'none', lineHeight:1.4 }}
                                        />
                                    </div>
                                </div>
                                <div style={{ display:'flex', gap:16, marginTop:10, paddingTop:10, borderTop:'1px dashed #E4DFD1', fontSize:12.5, color:'#666F6C', lineHeight:1.4 }}>
                                    <span>Sheets needed <b style={{ color:'#23282A', fontFamily:'"JetBrains Mono", monospace', fontVariantNumeric:'tabular-nums', fontWeight:600 }}>{totalSheets}</b></span>
                                    <span>Cost price <b style={{ color:'#23282A', fontFamily:'"JetBrains Mono", monospace', fontVariantNumeric:'tabular-nums', fontWeight:600 }}>{formatCurrency(costPrice)}</b></span>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* ═══ BOM Materials ═══ */}
                    <div>
                        <div style={{ background:'#FEFDFB', border:'1px solid #E4DFD1', borderRadius:14, boxShadow:'0 1px 2px rgba(15,61,62,0.06)', marginBottom:18 }}>
                            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'10px 16px', borderBottom:'1px solid #E4DFD1' }}>
                                <div className="flex items-center gap-2.5">
                                    <div style={{ width:28, height:28, borderRadius:8, background:'#FDF0E3', display:'flex', alignItems:'center', justifyContent:'center' }}>
                                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none"><path d="M12 2l9 4.5v9L12 20l-9-4.5v-9L12 2z" stroke="#C9832F" strokeWidth="1.7" strokeLinejoin="round"/></svg>
                                    </div>
                                    <h3 style={{ fontSize:14, margin:0, fontWeight:600, lineHeight:1.4, color:'#23282A' }}>BOM Materials</h3>
                                </div>
                                <span style={{ fontSize:12, fontWeight:600, padding:'3px 9px', borderRadius:100, background:'#E6F4F1', color:'#146B67', lineHeight:1.4 }}>Active</span>
                            </div>
                            <div style={{ padding:'14px 16px 16px' }}>
                                <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'8px 0', borderBottom:'1px solid #F2EEE3', fontSize:13, lineHeight:1.4 }}>
                                    <span className="flex items-center gap-2.5" style={{ color:'#23282A' }}>
                                        <span style={{ width:7, height:7, borderRadius:'50%', background: paperCostWarning ? '#B23B3B' : '#2AA69E', flexShrink:0 }} />
                                        {selectedPaper?.name?.replace(/\s*\d+gsm.*/i, '') || 'Paper'}
                                        {paperCostWarning && <span style={{ fontSize:10, fontWeight:700, padding:'2px 6px', borderRadius:100, background:'#FBEAEA', color:'#B23B3B' }}>NO COST</span>}
                                    </span>
                                    <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                                        {paperCostWarning && (
                                            <input
                                                type="number"
                                                value={manualPaperUnitCost ?? ''}
                                                onChange={e => setManualPaperUnitCost(e.target.value ? parseFloat(e.target.value) : null)}
                                                placeholder="Unit cost"
                                                min={0}
                                                step={0.01}
                                                style={{ width:80, fontFamily:'"JetBrains Mono", monospace', fontVariantNumeric:'tabular-nums', fontSize:11, padding:'3px 6px', borderRadius:6, border:'1px solid #B23B3B', background:'#FFF', color:'#23282A', outline:'none', textAlign:'right' }}
                                                title="Override paper unit cost"
                                            />
                                        )}
                                        <span style={{ fontFamily:'"JetBrains Mono", monospace', fontVariantNumeric:'tabular-nums', fontWeight:600, textAlign:'right', color: paperCostWarning ? '#B23B3B' : undefined }}>{formatCurrency(paperCost)}</span>
                                    </div>
                                </div>
                                <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'8px 0', borderBottom:'1px solid #F2EEE3', fontSize:13, lineHeight:1.4 }}>
                                    <span className="flex items-center gap-2.5" style={{ color:'#23282A' }}>
                                        <span style={{ width:7, height:7, borderRadius:'50%', background: tonerCostWarning ? '#B23B3B' : '#2AA69E', flexShrink:0 }} />
                                        {selectedToner?.name?.replace(/\s*Universal\s*/i, '') || 'Toner'}
                                        {tonerCostWarning && <span style={{ fontSize:10, fontWeight:700, padding:'2px 6px', borderRadius:100, background:'#FBEAEA', color:'#B23B3B' }}>NO COST</span>}
                                    </span>
                                    <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                                        {tonerCostWarning && (
                                            <input
                                                type="number"
                                                value={manualTonerUnitCost ?? ''}
                                                onChange={e => setManualTonerUnitCost(e.target.value ? parseFloat(e.target.value) : null)}
                                                placeholder="Unit cost"
                                                min={0}
                                                step={0.01}
                                                style={{ width:80, fontFamily:'"JetBrains Mono", monospace', fontVariantNumeric:'tabular-nums', fontSize:11, padding:'3px 6px', borderRadius:6, border:'1px solid #B23B3B', background:'#FFF', color:'#23282A', outline:'none', textAlign:'right' }}
                                                title="Override toner unit cost"
                                            />
                                        )}
                                        <span style={{ fontFamily:'"JetBrains Mono", monospace', fontVariantNumeric:'tabular-nums', fontWeight:600, textAlign:'right', color: tonerCostWarning ? '#B23B3B' : undefined }}>{formatCurrency(tonerCost)}</span>
                                    </div>
                                </div>
                                <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'8px 0', borderBottom:'none', fontSize:13, lineHeight:1.4 }}>
                                    <span className="flex items-center gap-2.5" style={{ color:'#23282A' }}>
                                        <span style={{ width:7, height:7, borderRadius:'50%', background:'#2AA69E', flexShrink:0 }} />
                                        Finishing
                                    </span>
                                    <span id="finishBomLine" style={{ fontFamily:'"JetBrains Mono", monospace', fontVariantNumeric:'tabular-nums', fontWeight:600, textAlign:'right' }}>{formatCurrency(finishingCost)}</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* ═══ How Finishing Options Work ═══ */}
                    <div style={{ background:'#FEFDFB', border:'1px solid #E4DFD1', borderRadius:14, boxShadow:'0 1px 2px rgba(15,61,62,0.06)', marginTop:18 }}>
                        <div style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 16px', borderBottom:'1px solid #E4DFD1' }}>
                            <div style={{ width:28, height:28, borderRadius:8, background:'#EDE6F7', display:'flex', alignItems:'center', justifyContent:'center' }}>
                                <svg width="15" height="15" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="#7B5CC9" strokeWidth="1.7"/><path d="M12 8v4.5l3 2" stroke="#7B5CC9" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/></svg>
                            </div>
                            <h3 style={{ fontSize:14, margin:0, fontWeight:600, lineHeight:1.4, color:'#23282A' }}>How Finishing Options Work</h3>
                        </div>
                        <div style={{ padding:'14px 16px 16px' }}>
                            {[
                                ['1','Tap a card to include or exclude that finishing step — its price is added to or removed from the cost price instantly.'],
                                ['2','Prices shown are pulled from each service\'s own BOM, so update them there if a supplier cost changes.'],
                                ['3','Only include steps this job actually needs — unused finishing lowers your margin without adding value for the customer.'],
                            ].map(([num, text]) => (
                                <div key={num} className="flex gap-3" style={{ marginBottom: 14 }}>
                                    <div style={{ width:20, height:20, borderRadius:'50%', flexShrink:0, background:'#F2EEE3', color:'#666F6C', fontSize:11, fontWeight:700, display:'flex', alignItems:'center', justifyContent:'center', lineHeight:1 }}>{num}</div>
                                    <p style={{ margin:0, fontSize:13, color:'#666F6C', lineHeight:1.5 }}>{text}</p>
                                </div>
                            ))}
                        </div>
                    </div>
                    </div>

                    {/* ═══ Col 3: Receipt Summary ═══ */}
                    <div style={{ position:'sticky', top:24 }}>
                        <div style={{ background:'#FEFDFB', borderRadius:16, boxShadow:'0 20px 50px rgba(15,61,62,0.16)', overflow:'hidden', border:'1px solid #E4DFD1' }}>
                            <div style={{ background:'linear-gradient(135deg, #146B67, #0F3D3E)', padding:'16px 20px 18px', color:'#fbfbfa', position:'relative' }}>
                                <p style={{ fontSize:12, letterSpacing:'0.08em', textTransform:'uppercase', fontWeight:600, opacity:0.78, margin:'0 0 5px', lineHeight:1.4 }}>Price Summary</p>
                                <h2 style={{ fontSize:21, margin:'0 0 4px', fontWeight:600, lineHeight:1.3, letterSpacing:'-0.01em' }}>{pages} page{pages!==1?'s':''} · Cost {formatCurrency(costPrice)}</h2>
                                <div style={{ fontSize:12, opacity:0.8, fontFamily:'"JetBrains Mono", monospace', fontVariantNumeric:'tabular-nums' }}>{editingProductId ? (productName || inventory.find(item => item.id === editingProductId)?.name || 'ITEM').toUpperCase() : 'NEW ITEM'}</div>
                            </div>
                            <div style={{ height:14, background:'linear-gradient(135deg, #146B67, #0F3D3E)', WebkitMask:'radial-gradient(circle at 10px 0, transparent 8px, black 8.5px) 0 -8px / 20px 16px repeat-x', mask:'radial-gradient(circle at 10px 0, transparent 8px, black 8.5px) 0 -8px / 20px 16px repeat-x' }} />

                            <div style={{ padding:'16px 20px 6px' }}>
                                <div style={{ display:'flex', alignItems:'baseline', justifyContent:'space-between', fontSize:13, padding:'6px 0', color:'#666F6C', lineHeight:1.4 }}>
                                    <span>{selectedPaper?.name?.replace(/\s*\d+gsm.*/i, '') || 'Paper'}{paperCostWarning ? ' ⚠' : ''}</span>
                                    <span style={{ fontFamily:'"JetBrains Mono", monospace', fontVariantNumeric:'tabular-nums', color: paperCostWarning ? '#B23B3B' : '#23282A', fontWeight:500, textAlign:'right' }}>{formatCurrency(paperCost)}</span>
                                </div>
                                <div style={{ display:'flex', alignItems:'baseline', justifyContent:'space-between', fontSize:13, padding:'6px 0', color:'#666F6C', lineHeight:1.4 }}>
                                    <span>{selectedToner?.name?.replace(/\s*Universal\s*/i, '') || 'Toner'}{tonerCostWarning ? ' ⚠' : ''}</span>
                                    <span style={{ fontFamily:'"JetBrains Mono", monospace', fontVariantNumeric:'tabular-nums', color: tonerCostWarning ? '#B23B3B' : '#23282A', fontWeight:500, textAlign:'right' }}>{formatCurrency(tonerCost)}</span>
                                </div>
                                <div style={{ display:'flex', alignItems:'baseline', justifyContent:'space-between', fontSize:13, padding:'6px 0', color:'#666F6C', lineHeight:1.4, borderBottom:'1px dashed #E4DFD1', marginBottom:4, paddingBottom:10 }}>
                                    <span>Finishing</span>
                                    <span id="finishTotalLine" style={{ fontFamily:'"JetBrains Mono", monospace', fontVariantNumeric:'tabular-nums', color:'#23282A', fontWeight:500, textAlign:'right' }}>{formatCurrency(finishingCost)}</span>
                                </div>

                                <div style={{ display:'flex', alignItems:'baseline', justifyContent:'space-between', padding:'10px 0', fontSize:14, fontWeight:700, lineHeight:1.4 }}>
                                    <span>Cost Price (CP)</span>
                                    <span id="cpTotal" style={{ fontFamily:'"JetBrains Mono", monospace', fontVariantNumeric:'tabular-nums', fontSize:16, textAlign:'right' }}>{formatCurrency(costPrice)}</span>
                                </div>

                                <div style={{ margin:'6px 0 4px', background:'#FBF8F2', border:'1px solid #E4DFD1', borderRadius:11, padding:'11px 14px' }}>
                                    <label style={{ fontSize:12, fontWeight:600, letterSpacing:'0.04em', textTransform:'uppercase', color:'#1C8C86' }}>Selling Price (SP)</label>
                                    <div className="flex items-baseline gap-1.5" style={{ marginTop:6 }}>
                                        <span style={{ fontFamily:'"JetBrains Mono", monospace', fontVariantNumeric:'tabular-nums', fontSize:20, fontWeight:700, color:'#0F3D3E' }}>{currency}</span>
                                        <input
                                            type="number"
                                            value={sellingPrice || ''}
                                            onChange={handleSellingPriceChange}
                                            min={0} step={0.01}
                                            placeholder="0.00"
                                            style={{ border:'none', background:'transparent', outline:'none', fontFamily:'"JetBrains Mono", monospace', fontVariantNumeric:'tabular-nums', fontSize:20, fontWeight:700, color:'#0F3D3E', width:'100%' }}
                                        />
                                    </div>
                                </div>

                                <div className="flex gap-2.5" style={{ margin:'12px 0 6px' }}>
                                    <div id="profitCard" style={{ flex:1, borderRadius:11, padding:'10px 13px', background:'#FBF8F2', border:'1px solid #E4DFD1' }}>
                                        <div style={{ fontSize:12, color:'#666F6C', fontWeight:600, marginBottom:3, lineHeight:1.4 }}>Profit</div>
                                        <div id="profitVal" style={{ fontFamily:'"JetBrains Mono", monospace', fontVariantNumeric:'tabular-nums', fontSize:16, fontWeight:700, color: profit >= 0 ? '#146B67' : '#B23B3B' }}>{profit >= 0 ? '+' : ''}{formatCurrency(profit)}</div>
                                    </div>
                                    <div id="marginCard" style={{ flex:1, borderRadius:11, padding:'10px 13px', background:'#FBF8F2', border:'1px solid #E4DFD1' }}>
                                        <div style={{ fontSize:12, color:'#666F6C', fontWeight:600, marginBottom:3, lineHeight:1.4 }}>Profit Margin</div>
                                        <div id="marginVal" style={{ fontFamily:'"JetBrains Mono", monospace', fontVariantNumeric:'tabular-nums', fontSize:16, fontWeight:700, color: validation.valid ? '#146B67' : '#B23B3B' }}>{profitMarkup.toFixed(1)}%</div>
                                    </div>
                                </div>

                                {sellingPrice > 0 && !validation.valid && (
                                    <div className="flex items-center gap-1.5" style={{ fontSize:12, fontWeight:600, color:'#B23B3B', lineHeight:1.4, background:'#FBEAEA', padding:'5px 10px', borderRadius:100, marginBottom:10, display:'inline-flex' }}>
                                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none"><path d="M12 9v4M12 17h.01M10.3 3.9L2.6 18a2 2 0 001.8 3h15.2a2 2 0 001.8-3L13.7 3.9a2 2 0 00-3.4 0z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
                                        Below minimum {validation.minimumMarkup}% markup
                                    </div>
                                )}
                                <div className="flex items-center gap-2" style={{ fontSize:12, color:'#666F6C', lineHeight:1.4, padding:'8px 2px 14px' }}>
                                    <span>Minimum required markup <b style={{ color:'#23282A', fontWeight:600 }}>{validation.minimumMarkup}%</b></span>
                                </div>
                            </div>

                            <div style={{ padding:'0 20px 18px' }}>
                                <button
                                    onClick={handleOpenSaveDialog}
                                    disabled={!validation.valid || sellingPrice <= 0}
                                    style={{ width:'100%', padding:'9px 14px', borderRadius:11, border:'none', cursor:'pointer', fontFamily:'Inter,sans-serif', fontWeight:600, fontSize:14, display:'flex', alignItems:'center', justifyContent:'center', gap:7, transition:'all .15s ease', background:'linear-gradient(135deg, #1C8C86, #146B67)', color:'#fff', boxShadow:'0 1px 2px rgba(15,61,62,0.06)', opacity: (!validation.valid || sellingPrice <= 0) ? 0.5 : 1 }}
                                    title={!validation.valid && sellingPrice > 0 ? `Markup ${profitMarkup.toFixed(1)}% below minimum ${validation.minimumMarkup}%` : ''}
                                    onMouseEnter={e => { if (validation.valid && sellingPrice > 0) { e.currentTarget.style.filter = 'brightness(1.07)'; e.currentTarget.style.boxShadow = '0 8px 24px rgba(15,61,62,0.10)'; }}}
                                    onMouseLeave={e => { if (validation.valid && sellingPrice > 0) { e.currentTarget.style.filter = ''; e.currentTarget.style.boxShadow = '0 1px 2px rgba(15,61,62,0.06)'; }}}
                                >
                                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none"><path d="M5 12l5 5L20 6" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"/></svg>
                                    {editingProductId ? `Save ${itemType}` : 'Save to Inventory'}
                                </button>
                                <button
                                    onClick={() => setShowSummaryCard(true)}
                                    disabled={!validation.valid || sellingPrice <= 0}
                                    style={{ width:'100%', padding:'8px 14px', borderRadius:11, cursor:'pointer', fontFamily:'Inter,sans-serif', fontWeight:600, fontSize:13, marginTop:8, background:'transparent', border:'1px solid #E4DFD1', color:'#0F3D3E', opacity: (!validation.valid || sellingPrice <= 0) ? 0.5 : 1 }}
                                    onMouseEnter={e => { if (validation.valid && sellingPrice > 0) { e.currentTarget.style.borderColor = '#1C8C86'; e.currentTarget.style.color = '#1C8C86'; }}}
                                    onMouseLeave={e => { if (validation.valid && sellingPrice > 0) { e.currentTarget.style.borderColor = '#E4DFD1'; e.currentTarget.style.color = '#0F3D3E'; }}}
                                >
                                    Download summary card
                                </button>
                            </div>
                        </div>
                    </div>

                </div>
            </div>

            {/* ── Save Dialog Modal ── */}
            {showSaveDialog && (
                <div className="fixed inset-0" style={{ background:'rgba(0,0,0,0.4)', backdropFilter:'blur(4px)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:50, padding:16 }}>
                    <div style={{ background:'#FEFDFB', borderRadius:14, width:'100%', maxWidth:420, boxShadow:'0 20px 50px rgba(15,61,62,0.16)', border:'1px solid #E4DFD1', overflow:'hidden' }}>
                        <div className="flex items-center justify-between" style={{ padding:'12px 16px', borderBottom:'1px solid #E4DFD1' }}>
                            <h2 style={{ fontSize:20, fontWeight:600, color:'#23282A', letterSpacing:'-0.01em', lineHeight:1.3, margin:0 }}>Save to Inventory</h2>
                            <button onClick={() => setShowSaveDialog(false)} style={{ padding:4, background:'none', border:'none', cursor:'pointer', borderRadius:6, color:'#666F6C' }}>
                                <X size={18} />
                            </button>
                        </div>
                        <div style={{ padding:'14px 16px' }}>
                            <div style={{ padding:'10px 13px', borderRadius:11, background:'#FBF8F2', border:'1px solid #E4DFD1', marginBottom:14 }}>
                                <p style={{ fontSize:12, fontWeight:600, color:'#666F6C', margin:0, marginBottom:8, lineHeight:1.4 }}>Item Cost Breakdown</p>
                                <div style={{ display:'flex', flexDirection:'column', gap:'3px', fontSize:13, lineHeight:1.5 }}>
                                    <div className="flex justify-between"><span style={{ color:'#666F6C' }}>{selectedPaper?.name?.replace(/\s*\d+gsm.*/i, '') || 'Paper'}</span><span style={{ fontFamily:'"JetBrains Mono", monospace', fontVariantNumeric:'tabular-nums', fontWeight:600, color:'#23282A' }}>{formatCurrency(paperCost)}</span></div>
                                    <div className="flex justify-between"><span style={{ color:'#666F6C' }}>{selectedToner?.name?.replace(/\s*Universal\s*/i, '') || 'Toner'}</span><span style={{ fontFamily:'"JetBrains Mono", monospace', fontVariantNumeric:'tabular-nums', fontWeight:600, color:'#23282A' }}>{formatCurrency(tonerCost)}</span></div>
                                    <div className="flex justify-between"><span style={{ color:'#666F6C' }}>Finishing</span><span style={{ fontFamily:'"JetBrains Mono", monospace', fontVariantNumeric:'tabular-nums', fontWeight:600, color:'#23282A' }}>{formatCurrency(finishingCost)}</span></div>
                                    {finishingInventoryCost > 0 && (
                                        <div className="flex justify-between"><span style={{ color:'#666F6C', paddingLeft:12 }}>Materials</span><span style={{ fontFamily:'"JetBrains Mono", monospace', fontVariantNumeric:'tabular-nums', fontWeight:600, color:'#23282A' }}>{formatCurrency(finishingInventoryCost)}</span></div>
                                    )}
                                    <div className="flex justify-between" style={{ borderTop:'1px dashed #E4DFD1', paddingTop:6, marginTop:4 }}><span style={{ color:'#23282A', fontWeight:700 }}>Total Cost</span><span style={{ fontFamily:'"JetBrains Mono", monospace', fontVariantNumeric:'tabular-nums', fontWeight:700, color:'#23282A' }}>{formatCurrency(costPrice)}</span></div>
                                    <div className="flex justify-between"><span style={{ color:'#666F6C' }}>Selling Price</span><span style={{ fontFamily:'"JetBrains Mono", monospace', fontVariantNumeric:'tabular-nums', fontWeight:600, color:'#23282A' }}>{formatCurrency(sellingPrice)}</span></div>
                                    <div className="flex justify-between"><span style={{ color: profit >= 0 ? '#146B67' : '#B23B3B' }}>Profit ({profitMarkup.toFixed(1)}%)</span><span style={{ fontFamily:'"JetBrains Mono", monospace', fontVariantNumeric:'tabular-nums', fontWeight:600, color: profit >= 0 ? '#146B67' : '#B23B3B' }}>{profit >= 0 ? '+' : ''}{formatCurrency(profit)}</span></div>
                                </div>
                            </div>

                            <div style={{ marginBottom:14 }}>
                                <label style={{ fontSize:12, fontWeight:600, color:'#666F6C', display:'block', marginBottom:5, lineHeight:1.4 }}>Item Name</label>
                                <input
                                    type="text"
                                    value={saveItemName}
                                    onChange={e => setSaveItemName(e.target.value)}
                                    placeholder="Enter item name..."
                                    style={{ width:'100%', fontFamily:'Inter,sans-serif', fontSize:13.5, padding:'8px 12px', borderRadius:9, border:'1px solid #E4DFD1', background:'#fff', color:'#23282A', outline:'none', lineHeight:1.4 }}
                                />
                            </div>

                            <div style={{ marginBottom:14 }}>
                                <label style={{ fontSize:12, fontWeight:600, color:'#666F6C', display:'block', marginBottom:5, lineHeight:1.4 }}>Type</label>
                                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
                                    <button
                                        type="button"
                                        onClick={() => setSaveDialogType('Product')}
                                        style={{ display:'flex', alignItems:'center', gap:7, padding:'7px 12px', borderRadius:9, border:`2px solid ${saveDialogType === 'Product' ? '#1C8C86' : '#E4DFD1'}`, background: saveDialogType === 'Product' ? 'linear-gradient(135deg, #F0FAF8, #FFFFFF)' : '#fff', cursor:'pointer', fontSize:13, lineHeight:1.4, color:'#23282A', fontWeight:600 }}
                                    >
                                        <Package size={18} style={{ color: saveDialogType === 'Product' ? '#1C8C86' : '#94A3B8' }} />
                                        <span style={{ color: saveDialogType === 'Product' ? '#146B67' : '#666F6C' }}>Product</span>
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setSaveDialogType('Service')}
                                        style={{ display:'flex', alignItems:'center', gap:7, padding:'7px 12px', borderRadius:9, border:`2px solid ${saveDialogType === 'Service' ? '#1C8C86' : '#E4DFD1'}`, background: saveDialogType === 'Service' ? 'linear-gradient(135deg, #F0FAF8, #FFFFFF)' : '#fff', cursor:'pointer', fontSize:13, lineHeight:1.4, color:'#23282A', fontWeight:600 }}
                                    >
                                        <Printer size={18} style={{ color: saveDialogType === 'Service' ? '#1C8C86' : '#94A3B8' }} />
                                        <span style={{ color: saveDialogType === 'Service' ? '#146B67' : '#666F6C' }}>Printing Service</span>
                                    </button>
                                </div>
                            </div>

                            {!editingProductId && (
                                <div style={{ marginBottom:14 }}>
                                    <div className="flex items-center justify-between" style={{ marginBottom:6 }}>
                                        <label style={{ fontSize:12, fontWeight:600, color:'#666F6C', lineHeight:1.4 }}>Variants</label>
                                        <button
                                            type="button"
                                            onClick={addVariantRow}
                                            disabled={saveVariants.length >= 5}
                                            style={{ display:'flex', alignItems:'center', gap:4, fontSize:12, fontWeight:600, color: saveVariants.length >= 5 ? '#CBD5E1' : '#1C8C86', background:'none', border:'none', cursor: saveVariants.length >= 5 ? 'default' : 'pointer', padding:0 }}
                                        >
                                            <Plus size={14} /> Add Variant
                                        </button>
                                    </div>
                                    {saveVariants.length > 0 && (
                                        <div style={{ overflowX:'auto', borderRadius:9, border:'1px solid #E4DFD1' }}>
                                            <table style={{ width:'100%', borderCollapse:'collapse' }}>
                                                <thead>
                                                    <tr style={{ borderBottom:'1px solid #E4DFD1', background:'#F2EEE3' }}>
                                                        <th style={{ textAlign:'left', padding:'6px 8px', fontSize:12, fontWeight:600, color:'#666F6C', lineHeight:1.4 }}>Attribute</th>
                                                        <th style={{ textAlign:'left', padding:'6px 8px', fontSize:12, fontWeight:600, color:'#666F6C', lineHeight:1.4 }}>Pages</th>
                                                        <th style={{ textAlign:'right', padding:'6px 8px', fontSize:12, fontWeight:600, color:'#666F6C', lineHeight:1.4 }}>Base Price</th>
                                                        <th style={{ textAlign:'right', padding:'6px 8px', fontSize:12, fontWeight:600, color:'#666F6C', lineHeight:1.4 }}>Selling Price</th>
                                                        <th style={{ padding:'6px 8px' }}></th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {saveVariants.map(v => (
                                                        <tr key={v.id} style={{ borderBottom:'1px solid #F2EEE3' }}>
                                                            <td style={{ padding:'4px 8px' }}>
                                                                <input type="text" value={v.attribute} onChange={e => updateVariantRow(v.id, 'attribute', e.target.value)} placeholder="e.g. A4" style={{ width:70, padding:'4px 8px', border:'1px solid #E4DFD1', borderRadius:6, fontSize:13, color:'#23282A', outline:'none', fontFamily:'Inter,sans-serif' }} />
                                                            </td>
                                                            <td style={{ padding:'4px 8px' }}>
                                                                <input type="number" value={v.pages} onChange={e => updateVariantRow(v.id, 'pages', parseInt(e.target.value) || 1)} min={1} style={{ width:50, padding:'4px 8px', border:'1px solid #E4DFD1', borderRadius:6, fontSize:13, color:'#23282A', outline:'none', fontFamily:'"JetBrains Mono", monospace', fontVariantNumeric:'tabular-nums' }} />
                                                            </td>
                                                            <td style={{ padding:'4px 8px', textAlign:'right', fontFamily:'"JetBrains Mono", monospace', fontVariantNumeric:'tabular-nums', fontSize:13, color:'#666F6C' }}>
                                                                {formatCurrency(v.basePrice)}
                                                            </td>
                                                            <td style={{ padding:'4px 8px' }}>
                                                                <input type="number" value={v.sellingPrice || ''} onChange={e => updateVariantRow(v.id, 'sellingPrice', parseFloat(e.target.value) || 0)} min={0} step={0.01} placeholder="0.00" style={{ width:70, padding:'4px 8px', border:'1px solid #E4DFD1', borderRadius:6, fontSize:13, color:'#23282A', textAlign:'right', outline:'none', fontFamily:'"JetBrains Mono", monospace', fontVariantNumeric:'tabular-nums' }} />
                                                            </td>
                                                            <td style={{ padding:'4px 8px' }}>
                                                                <button type="button" onClick={() => removeVariantRow(v.id)} style={{ padding:2, background:'none', border:'none', cursor:'pointer', color:'#B23B3B' }}><X size={14} /></button>
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    )}
                                    <p style={{ fontSize:12, color:'#666F6C', lineHeight:1.45, marginTop:6 }}>Base price auto-calculated from cost per page. Add up to 5 variants.</p>
                                </div>
                            )}
                        </div>

                        <div className="flex gap-2" style={{ padding:'12px 16px', borderTop:'1px solid #E4DFD1' }}>
                            <button
                                type="button"
                                onClick={() => setShowSaveDialog(false)}
                                style={{ flex:1, padding:'7px 12px', borderRadius:9, border:'1px solid #E4DFD1', background:'transparent', color:'#0F3D3E', cursor:'pointer', fontFamily:'Inter,sans-serif', fontWeight:600, fontSize:13, lineHeight:1.4 }}
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={handleSaveFromDialog}
                                disabled={isCreatingProduct || !saveItemName.trim()}
                                style={{ flex:1, padding:'7px 12px', borderRadius:9, border:'none', cursor:'pointer', fontFamily:'Inter,sans-serif', fontWeight:600, fontSize:13, lineHeight:1.4, background:'linear-gradient(135deg, #1C8C86, #146B67)', color:'#fff', opacity: (isCreatingProduct || !saveItemName.trim()) ? 0.5 : 1 }}
                            >
                                {isCreatingProduct ? 'Saving...' : editingProductId ? 'Update' : 'Save'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Summary Card Modal ── */}
            {showSummaryCard && (
                <div className="fixed inset-0" style={{ background:'rgba(0,0,0,0.4)', backdropFilter:'blur(4px)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:50, padding:16 }}>
                    <div style={{ background:'#FEFDFB', borderRadius:14, width:'100%', maxWidth:340, boxShadow:'0 20px 50px rgba(15,61,62,0.16)', border:'1px solid #E4DFD1', overflow:'hidden' }}>
                        <div className="flex items-center justify-between" style={{ padding:'12px 16px', borderBottom:'1px solid #E4DFD1' }}>
                            <h2 style={{ fontSize:20, fontWeight:600, color:'#23282A', letterSpacing:'-0.01em', lineHeight:1.3, margin:0 }}>Price Summary Card</h2>
                            <div className="flex items-center gap-1">
                                <button onClick={handleSaveCardImage} style={{ padding:4, background:'none', border:'none', cursor:'pointer', borderRadius:6, color:'#1C8C86' }} title="Save as Image">
                                    <Download size={18} />
                                </button>
                                <button onClick={() => setShowSummaryCard(false)} style={{ padding:4, background:'none', border:'none', cursor:'pointer', borderRadius:6, color:'#666F6C' }}>
                                    <X size={18} />
                                </button>
                            </div>
                        </div>
                        <div id="price-summary-card" style={{ padding:16 }}>
                            <div style={{ textAlign:'center', paddingBottom:12, borderBottom:'1px solid #E4DFD1' }}>
                                <h3 style={{ fontSize:18, fontWeight:600, color:'#23282A', letterSpacing:'-0.01em', lineHeight:1.3, margin:0 }}>Pricing Summary</h3>
                                <p style={{ fontSize:12, color:'#666F6C', marginTop:4 }}>{new Date().toLocaleDateString()}</p>
                            </div>
                            <div style={{ marginTop:12 }}>
                                <div className="flex justify-between" style={{ padding:'4px 0', fontSize:13, lineHeight:1.5 }}>
                                    <span style={{ color:'#666F6C' }}>Pages per Copy</span>
                                    <span style={{ fontWeight:600, color:'#23282A' }}>{pages}</span>
                                </div>
                                <div className="flex justify-between" style={{ padding:'4px 0', fontSize:13, lineHeight:1.5 }}>
                                    <span style={{ color:'#666F6C' }}>Sheets Needed</span>
                                    <span style={{ fontWeight:600, color:'#23282A' }}>{totalSheets}</span>
                                </div>
                                <div className="flex justify-between" style={{ padding:'4px 0', fontSize:13, lineHeight:1.5 }}>
                                    <span style={{ color:'#666F6C' }}>Toner</span>
                                    <span style={{ fontWeight:600, color:'#23282A' }}>{selectedToner?.name || 'None'}</span>
                                </div>
                                <div className="flex justify-between" style={{ padding:'4px 0', fontSize:13, lineHeight:1.5 }}>
                                    <span style={{ color:'#666F6C' }}>Finishing</span>
                                    <span style={{ fontWeight:600, color:'#23282A' }}>{finishingOptions.filter(o => o.enabled).map(o => o.name).join(', ') || 'None'}</span>
                                </div>
                            </div>
                            <div className="flex items-center justify-between" style={{ marginTop:12, paddingTop:12, borderTop:'1px solid #E4DFD1' }}>
                                <span style={{ fontSize:20, fontWeight:700, color:'#23282A', letterSpacing:'-0.01em', lineHeight:1.3 }}>Total</span>
                                <span style={{ fontFamily:'"JetBrains Mono", monospace', fontVariantNumeric:'tabular-nums', fontSize:20, fontWeight:700, color:'#23282A', letterSpacing:'-0.01em' }}>{formatCurrency(sellingPrice)}</span>
                            </div>
                        </div>
                        <div style={{ padding:'12px 16px', borderTop:'1px solid #E4DFD1' }}>
                            <button
                                onClick={() => setShowSummaryCard(false)}
                                style={{ width:'100%', padding:'7px 12px', borderRadius:9, border:'1px solid #E4DFD1', cursor:'pointer', fontFamily:'Inter,sans-serif', fontWeight:600, fontSize:13, lineHeight:1.4, background:'transparent', color:'#0F3D3E' }}
                            >
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            )}

        </div>
    );
};

export default SmartPricing;
