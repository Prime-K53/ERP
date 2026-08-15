import React, { useState, useEffect, useMemo, useRef } from 'react';
import { logger } from '@/services/logger';
// PRICING RULE: Raw prices from engine. Display rounding via pricingDisplayService only.
//   No rounding, no markup, no market adjustments in persistence layer.
import { X, Save, Plus, Trash2, Calculator, Info, ShieldCheck, Building2, Package, Tag, Clock, Search, ChevronDown, Coins, UserPlus, Calendar, RefreshCw, Wallet, Mail, Layers, ExternalLink, FileText, Printer, FileDown, Eye, TrendingUp, Truck, Scale, Copy, Sparkles, AlertTriangle, Lightbulb, Image, History, AlertCircle, Check, FolderOpen, Link2 } from 'lucide-react';
import { useOrders } from '../../../context/OrdersContext';
import { useAuth } from '../../../context/AuthContext';
import { useFinance } from '../../../context/FinanceContext';
import { useSales } from '../../../context/SalesContext';
import { useInventory } from '../../../context/InventoryContext';
import { CartItem, Item, Invoice, ProductVariant, Account, OrderItem, OrderPayment, BOMTemplate, AdjustmentSnapshot, Customer } from '../../../types';
import { generateCustomerId, generateNextId, getDefaultPaymentTermsForSegment, resolveCustomerPaymentPolicy, roundToCurrency } from '../../../utils/helpers';
import { generateLocalId } from '../../../utils/idGeneration';
import { pricingService, DynamicServicePricingResult } from '../../../services/pricingService';
import { dbService } from '../../../services/db';

import { useNavigate } from 'react-router-dom';
import { VariantSelectorModal, ServiceCalculatorModal } from '../../pos/components/PosModals';
import { Loader2 } from 'lucide-react';
import QuickPrintModal from '../../../components/QuickPrintModal';
import { calculateSellingPrice, calculateServicePrice } from '../../../utils/pricing/pricingEngine';
import { getPlaceholder } from '../../../constants/placeholders';
import { resolveStoredCalculatedPrice, resolveStoredCost, resolveStoredSellingPrice, calculatePhotocopyCostPerPage, calculateTypePrintingCostPerPage } from '../../../utils/pricing';
import { aggregateMarketAdjustmentSnapshots, attachPricingBreakdown, getMarketAdjustmentSnapshots, getSnapshotCalculatedAmount, resolveItemAdjustmentSnapshots, summarizePricingBreakdown } from '../../../utils/pricingBreakdown';
import { displayPrice } from '../../../services/pricingDisplayService';
import { resolveCustomerPrice, getApplicableDiscounts, applyDiscounts, incrementDiscountUsage, getCustomerPricingTier } from '../../../services/customerPricingService';
import { calculateItemTax } from '../../../services/taxRateService';
import { getFifoUnitCost } from '../../../services/fifoCostService';

import { ItemModal } from '../../../components/items/ItemModal';
import { useDocumentPreview } from '../../../hooks/useDocumentPreview';
import { useOrderFormAI, AISuggestionItem, AIPriceOptimisation, AIFraudFlag } from '../../../hooks/useOrderFormAI';
import InventoryTransactionHistory from '../../inventory/components/InventoryTransactionHistory';
import { OfflineImage } from '../../../components/OfflineImage';
import { currencyService } from '../../../services/currencyService';
import { AIGeneratorCard } from '../../../components/AIGeneratorCard';

export interface OrderFormSaveSuccessDoc {
    type: string;
    docNumber: string;
    totalAmount: number;
    customerName: string;
    data?: any;
}

interface OrderFormProps {
    type: string;
    initialData?: any;
    onSave: (data: any, asDraft?: boolean, auditReason?: string, andPay?: boolean) => void;
    onCancel: () => void;
    onPreview?: () => void;
    saving?: boolean;
    /** Fired right after a non-draft document has been created, so the parent
     * can surface a "saved successfully" modal (POS-style). Required for the
     * Order path because OrderForm finalises orders itself and then calls
     * onCancel() directly. */
    onSaveSuccess?: (doc: OrderFormSaveSuccessDoc) => void;
}

const RECURRING_STATUSES = ['Draft', 'Active', 'Paused', 'Cancelled', 'Expired'] as const;

const cloneSerializable = <T,>(value: T): T => {
    if (value == null) return value;
    if (typeof structuredClone === 'function') {
        try { return structuredClone(value); } catch { /* fall through */ }
    }
    return JSON.parse(JSON.stringify(value));
};

const normalizeDateInputValue = (value?: string | null) => {
    const fallback = new Date();
    const parsed = value ? new Date(value) : fallback;
    if (Number.isNaN(parsed.getTime())) {
        return fallback.toISOString().split('T')[0];
    }
    return parsed.toISOString().split('T')[0];
};

const addRecurringFrequency = (dateValue: string, frequency?: string) => {
    const nextDate = new Date(normalizeDateInputValue(dateValue));
    switch (frequency) {
        case 'Daily':
            nextDate.setDate(nextDate.getDate() + 1);
            break;
        case 'Weekly':
            nextDate.setDate(nextDate.getDate() + 7);
            break;
        case 'Quarterly':
            nextDate.setMonth(nextDate.getMonth() + 3);
            break;
        case 'Annually':
            nextDate.setFullYear(nextDate.getFullYear() + 1);
            break;
        default:
            nextDate.setMonth(nextDate.getMonth() + 1);
            break;
    }
    return nextDate.toISOString().split('T')[0];
};

const getDefaultRecurringNextRunDate = (frequency = 'Monthly', fromDate?: string) => {
    return addRecurringFrequency(normalizeDateInputValue(fromDate), frequency);
};

const normalizeRecurringStatus = (status?: string) => {
    if (!status) return 'Draft';
    if (!RECURRING_STATUSES.includes(status as typeof RECURRING_STATUSES[number])) {
        console.warn(`Unknown recurring status "${status}" — defaulting to Draft`);
        return 'Draft';
    }
    return status;
};

const normalizeOtherCharges = (items: any[] = []): { items: any[]; otherChargesCalculated: number } => {
    let totalAdj = 0;
    const normalized = items.map((item: any) => {
        const adj = Number(item.otherChargesAdjustment) || 0;
        totalAdj += adj;
        const price = Number(item.price) || 0;
        return {
            ...item,
            price: Math.max(0, roundToCurrency(price - adj)),
            otherChargesAdjustment: adj
        };
    });
    return { items: normalized, otherChargesCalculated: roundToCurrency(totalAdj) };
};

export const OrderForm: React.FC<OrderFormProps> = ({ type, initialData, onSave, onCancel, onPreview, saving, onSaveSuccess }) => {
    const { companyConfig, notify, user } = useAuth();
    const { invoices, recurringInvoices, accounts, ledger } = useFinance();
    const { quotations, customerPayments, customers, addCustomer } = useSales();
    const { inventory, marketAdjustments, updateReservedStock, addItem } = useInventory();
    const { createOrder } = useOrders();
    const { handlePreview } = useDocumentPreview();
    const navigate = useNavigate();
    const currency = companyConfig?.currencySymbol || currencyService.getCurrency(currencyService.getBaseCurrency())?.symbol || '$';
    const ai = useOrderFormAI();

    const [aiSuggestions, setAiSuggestions] = useState<AISuggestionItem[]>([]);
    const [showAiSuggestions, setShowAiSuggestions] = useState(false);
    const [aiFraudFlags, setAiFraudFlags] = useState<AIFraudFlag[]>([]);
    const [showAiFraud, setShowAiFraud] = useState(false);
    const [showAiGenerator, setShowAiGenerator] = useState(false);
    const [aiDiscountSuggestion, setAiDiscountSuggestion] = useState<any>(null);
    const [aiGeneratingDesc, setAiGeneratingDesc] = useState(false);

    const [formData, setFormData] = useState<any>({
        id: '',
        date: new Date().toISOString().split('T')[0],
        dueDate: new Date().toISOString().split('T')[0],
        customerName: '',
        customerId: '',
        subAccountName: 'Main',
        salesAccountId: '4000',
        items: [] as CartItem[],
        status: type === 'Invoice' ? 'Unpaid' : (type === 'Order' ? 'Pending' : 'Draft'),
        discount: 0,
        discountType: 'fixed',
        otherCharges: 0,
        otherChargesEnabled: false,
        otherChargesAdjustment: '',
        otherChargesPercent: 0,
        otherChargesCalculated: 0,
        roundingMethod: 'Nearest',
        roundingEnabled: false,
        frequency: 'Monthly',
        autoDeductWallet: false,
        autoEmail: true,
        startDate: new Date().toISOString().split('T')[0],
        endDate: '',
        scheduledDates: [] as string[],
        nextRunDate: getDefaultRecurringNextRunDate(),
        notes: '',
        billingAddress: '',
        shippingAddress: '',
        orderNumber: '',
        orderDate: new Date().toISOString().split('T')[0],
        paymentMethod: 'Cash',
        tax: 0,
        taxRate: 0,
        customerPricingTier: '',
        customerPricingSegment: '',
        referenceDoc: ''
    });

    const calculatedOtherCharges = useMemo(() => {
        return (formData.items || []).reduce((sum, item) => sum + (Number(item.otherChargesAdjustment) || 0), 0);
    }, [formData.items]);

    const customerNames = useMemo(() => {
        const names = new Set<string>();
        customers?.forEach(c => names.add(c.name));
        invoices?.forEach(inv => names.add(inv.customerName));
        customerPayments?.forEach(rec => names.add(rec.customerName));
        quotations?.forEach(q => names.add(q.customerName));
        return Array.from(names).sort();
    }, [customers, invoices, customerPayments, quotations]);

    const findCustomerByName = (name: string) => {
        const normalized = name.trim().toLowerCase();
        if (!normalized) return undefined;
        return customers.find(c => c.name.trim().toLowerCase() === normalized);
    };

    const ensureCustomerExists = async (name: string): Promise<Customer | null> => {
        const normalizedName = name.trim();
        if (!normalizedName) return null;

        const existing = findCustomerByName(normalizedName);
        if (existing) {
            return existing;
        }

        if (typeof addCustomer !== 'function') return null;

        const newCustomer: Customer = {
            id: generateCustomerId(customers),
            name: normalizedName,
            email: '',
            phone: '',
            balance: 0,
            walletBalance: 0,
            creditLimit: 0,
            status: 'Active',
            segment: 'Individual',
            paymentTerms: getDefaultPaymentTermsForSegment('Individual'),
        };

        await addCustomer(newCustomer);

        return newCustomer;
    };

    const selectedCustomerObj = useMemo(() => {
        if (!formData.customerName) return null;
        return findCustomerByName(formData.customerName) || null;
    }, [customers, formData.customerName]);

    const customerSubAccounts = useMemo(() => {
        if (!formData.customerName) return [];

        const profileSubs: Array<{ name: string; accountNumber: string; walletBalance: number }> = (selectedCustomerObj?.subAccounts || []).map((s: string) => ({
            name: s,
            accountNumber: s === 'Main' ? (selectedCustomerObj as any)?.accountNumber || '' : '',
            walletBalance: 0,
        }));

        const transactionSubNames = new Set<string>();
        invoices.filter(i => i.customerName === formData.customerName).forEach(i => {
            if (i.subAccountName) transactionSubNames.add(i.subAccountName);
        });
        customerPayments.filter(r => r.customerName === formData.customerName).forEach(r => {
            if (r.subAccountName) transactionSubNames.add(r.subAccountName);
        });

        const subs = [...profileSubs];
        transactionSubNames.forEach(name => {
            if (!subs.find(s => s.name === name) && name !== 'Main') {
                subs.push({ name, accountNumber: 'Legacy/External', walletBalance: 0 });
            }
        });

        return subs.sort((a, b) => a.name.localeCompare(b.name));
    }, [selectedCustomerObj, formData.customerName, invoices, customerPayments]);

    const [manualDate, setManualDate] = useState(new Date().toISOString().split('T')[0]);

    const [itemSearch, setItemSearch] = useState('');
    const [isItemDropdownOpen, setIsItemDropdownOpen] = useState(false);
    const [highlightedIndex, setHighlightedIndex] = useState(-1);
    const [serviceSearch, setServiceSearch] = useState('');
    const [isServiceDropdownOpen, setIsServiceDropdownOpen] = useState(false);
    const [customerPanelOpen, setCustomerPanelOpen] = useState(false);
    const [customerSearch, setCustomerSearch] = useState('');
    const [showItemHistory, setShowItemHistory] = useState(false);
    const [itemHistoryItemId, setItemHistoryItemId] = useState<string | undefined>();
    const [photoViewItem, setPhotoViewItem] = useState<Item | null>(null);

    const itemDropdownRef = useRef<HTMLDivElement>(null);
    const serviceDropdownRef = useRef<HTMLDivElement>(null);
    const customerDropdownRef = useRef<HTMLDivElement>(null);

    const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);



    const getCustomerOutstanding = (name: string) => {
        return (invoices as Invoice[])
            .filter(i => i.customerName === name && i.status !== 'Paid' && i.status !== 'Draft' && i.status !== 'Cancelled')
            .reduce((sum, i) => sum + (i.totalAmount - (i.paidAmount || 0)), 0);
    };

    const filteredInventory = useMemo(() => {
        const base = inventory.filter((i: Item) => i.type !== 'Raw Material' && i.type !== 'Material' && i.type !== 'Service');
        if (!itemSearch) return base;
        return base.filter((i: Item) =>
            (i.name.toLowerCase().includes(itemSearch.toLowerCase()) || i.sku.toLowerCase().includes(itemSearch.toLowerCase()))
        );
    }, [inventory, itemSearch]);

    const handleItemKeyDown = (e: React.KeyboardEvent, items: Item[], allItems: Item[]) => {
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setHighlightedIndex(prev => Math.min(prev + 1, items.length - 1));
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setHighlightedIndex(prev => Math.max(prev - 1, 0));
        } else if (e.key === 'Enter' && highlightedIndex >= 0 && highlightedIndex < items.length) {
            e.preventDefault();
            const item = items[highlightedIndex];
            if (item) {
                handleAddItem(item);
                setIsItemDropdownOpen(false);
                setItemSearch('');
                setHighlightedIndex(-1);
            }
        } else if (e.key === 'Escape') {
            setIsItemDropdownOpen(false);
            setHighlightedIndex(-1);
        }
    };

    const filteredServices = useMemo(() => {
        const base = inventory.filter((i: Item) => i.type === 'Service');
        if (!serviceSearch) return base;
        return base.filter((i: Item) =>
            (i.name.toLowerCase().includes(serviceSearch.toLowerCase()) || i.sku.toLowerCase().includes(serviceSearch.toLowerCase()))
        );
    }, [inventory, serviceSearch]);

    const filteredCustomers = useMemo(() => {
        if (!customerSearch) return customers || [];
        const term = customerSearch.toLowerCase();
        return (customers || []).filter((c: Customer) =>
            c.name?.toLowerCase().includes(term) ||
            c.id?.toLowerCase().includes(term) ||
            c.phone?.includes(term)
        );
    }, [customers, customerSearch]);

    const revenueAccounts = useMemo(() => {
        return (accounts as Account[]).filter(acc => acc.type === 'Revenue' || acc.code.startsWith('4'));
    }, [accounts]);

    const accountBalances = useMemo(() => {
        const balances: Record<string, number> = {};
        (ledger || []).forEach((entry: any) => {
            const debitAcc = accounts.find((a: any) => a.id === entry.debitAccountId || a.code === entry.debitAccountId);
            const creditAcc = accounts.find((a: any) => a.id === entry.creditAccountId || a.code === entry.creditAccountId);
            [debitAcc, creditAcc].forEach((acc, idx) => {
                if (!acc) return;
                const isDebit = idx === 0;
                const isAssetOrExpense = acc.type === 'Asset' || acc.type === 'Expense';
                if (isAssetOrExpense) {
                    balances[acc.id] = (balances[acc.id] || 0) + (isDebit ? entry.amount : -entry.amount);
                } else {
                    balances[acc.id] = (balances[acc.id] || 0) + (isDebit ? -entry.amount : entry.amount);
                }
            });
        });
        return balances;
    }, [accounts, ledger]);

    const [auditReason, setAuditReason] = useState('');
    const [selectedProductForVariants, setSelectedProductForVariants] = useState<Item | null>(null);
    const [selectedServiceForCalculator, setSelectedServiceForCalculator] = useState<Item | null>(null);
    const [serviceEditIndex, setServiceEditIndex] = useState<number | null>(null);
    const [serviceInitialValues, setServiceInitialValues] = useState<{ pages: number; copies: number }>({ pages: 1, copies: 1 });
    const [selectedManualOverrideItemId, setSelectedManualOverrideItemId] = useState('');
    const [manualOverrideValue, setManualOverrideValue] = useState('');
    const [showManualOverrideCard, setShowManualOverrideCard] = useState(false);
    const [bomTemplates, setBomTemplates] = useState<BOMTemplate[]>([]);
    const [showCreateItemModal, setShowCreateItemModal] = useState(false);
    const [quickPrintModal, setQuickPrintModal] = useState<{ open: boolean; type: 'photocopy' | 'printing' }>({
      open: false,
      type: 'photocopy'
    });
    const isEditing = !!initialData?.id;
    const [localUnlock, setLocalUnlock] = useState(false);
    const [priceUnlockModal, setPriceUnlockModal] = useState({
      open: false,
    });
    const [priceUnlockReason, setPriceUnlockReason] = useState('');
    const isQuotation = type === 'Quotation';
    const isRecurring = type === 'Recurring';
    const primaryActionLabel = isRecurring
        ? (isEditing
            ? 'Update Subscription'
            : normalizeRecurringStatus(formData.status) === 'Active'
                ? 'Create & Activate Subscription'
                : 'Save Subscription')
        : (isEditing ? 'Commit Secure Patch' : 'Post & Seal Voucher');
    const manualOverrideItems = useMemo(
        () => (Array.isArray(formData.items) ? formData.items.filter((entry: any) => !entry?.isVariantParent) : []),
        [formData.items]
    );
    const selectedManualOverrideItem = useMemo(
        () => manualOverrideItems.find((entry: any) => entry.id === selectedManualOverrideItemId) || manualOverrideItems[0] || null,
        [manualOverrideItems, selectedManualOverrideItemId]
    );
    const getPricingDisplayMeta = (label: string) => {
        const normalized = String(label || '').toLowerCase();

        if (normalized.includes('transport') || normalized.includes('logistics') || normalized.includes('delivery')) {
            return { priority: 0, Icon: Truck, iconClass: 'text-emerald-600', textClass: 'text-emerald-700' };
        }
        if (normalized.includes('waste') || normalized.includes('wastage') || normalized.includes('shrinkage')) {
            return { priority: 1, Icon: Scale, iconClass: 'text-rose-500', textClass: 'text-rose-600' };
        }
        if (normalized.includes('round')) {
            return { priority: 3, Icon: Tag, iconClass: 'text-purple-500', textClass: normalized.includes('-') ? 'text-rose-600' : 'text-purple-600' };
        }
        if (normalized.includes('profit') || normalized.includes('margin')) {
            return { priority: 4, Icon: TrendingUp, iconClass: 'text-emerald-600', textClass: 'text-emerald-700' };
        }
        return { priority: 2, Icon: Tag, iconClass: 'text-indigo-500', textClass: 'text-indigo-600' };
    };
    const isPriceLocked = (!localUnlock) && (initialData?.isPriceLocked || (formData.status === 'Approved' || formData.status === 'Completed' || formData.status === 'Paid'));

    const getAutomaticOrderItemPrice = (item: CartItem | null) => {
        if (!item) return 0;

        const explicitOriginal = Number(item.originalPrice);
        if (Number.isFinite(explicitOriginal) && explicitOriginal > 0) return explicitOriginal;

        const storedSelling = Number(item.selling_price);
        if (Number.isFinite(storedSelling) && storedSelling > 0) return storedSelling;

        const calculatedPrice = Number(item.calculated_price);
        if (Number.isFinite(calculatedPrice) && calculatedPrice > 0) return calculatedPrice;

        return Number(item.price) || 0;
    };

    useEffect(() => {
        if (!manualOverrideItems.length) {
            setSelectedManualOverrideItemId('');
            return;
        }

        const currentExists = manualOverrideItems.some((entry: any) => entry.id === selectedManualOverrideItemId);
        if (!selectedManualOverrideItemId || !currentExists) {
            setSelectedManualOverrideItemId(manualOverrideItems[0].id);
        }
    }, [manualOverrideItems, selectedManualOverrideItemId]);

    useEffect(() => {
        if (selectedManualOverrideItem) {
            setManualOverrideValue(String(Number(selectedManualOverrideItem.price || 0)));
        } else {
            setManualOverrideValue('');
        }
    }, [selectedManualOverrideItem]);

    useEffect(() => {
        if (!manualOverrideItems.length) {
            setShowManualOverrideCard(false);
        }
    }, [manualOverrideItems.length]);

    const applyManualLineItemPrice = (targetId: string, newPrice: number) => {
        const safePrice = roundToCurrency(Math.max(0, Number(newPrice) || 0));

        setFormData((prev: any) => ({
            ...prev,
            items: Array.isArray(prev.items)
                ? prev.items.map((entry: any) => {
                    if (entry.id !== targetId) return entry;

                    const originalPrice = entry.basePrice || entry.cost || entry.price || 0;
                    if (originalPrice > 0) {
                        const deviation = Math.abs(safePrice - originalPrice) / originalPrice;
                        if (deviation > 0.5) {
                            notify(`Price override is ${(deviation * 100).toFixed(0)}% from original price — verify correctness`, 'warning');
                        }
                    }

                    return {
                        ...entry,
                        price: safePrice,
                        manual_override: true,
                        serviceDetails: entry.serviceDetails
                            ? {
                                ...entry.serviceDetails,
                                unitPricePerCopy: safePrice,
                                totalPrice: safePrice * (Number(entry.quantity) || 1)
                            }
                            : entry.serviceDetails
                    };
                })
                : prev.items
        }));
    };

    const resetManualLineItemPrice = async (targetId: string) => {
        const currentItems = Array.isArray(formData.items) ? [...formData.items] : [];
        const idx = currentItems.findIndex((entry: any) => entry.id === targetId);
        if (idx < 0) return;

        const item = currentItems[idx];

        if (item.type === 'Service' && item.serviceDetails) {
            const cartItem = item;
            const pages = Number(cartItem.serviceDetails?.pages || item.pagesOverride || 1);

            if (cartItem.priceLocked && cartItem.lockedUnitPricePerCopy !== undefined) {
                currentItems[idx] = {
                    ...currentItems[idx],
                    price: cartItem.lockedUnitPricePerCopy,
                    selling_price: cartItem.lockedUnitPricePerCopy,
                    cost: cartItem.lockedUnitCostPerCopy || cartItem.cost,
                    cost_price: cartItem.lockedUnitCostPerCopy || cartItem.cost_price || cartItem.cost,
                    basePrice: cartItem.lockedUnitCostPerCopy || cartItem.basePrice,
                    manual_override: false,
                    serviceDetails: {
                        ...cartItem.serviceDetails,
                        pages,
                        copies: item.quantity,
                        totalPages: pages * item.quantity,
                        unitPricePerCopy: cartItem.lockedUnitPricePerCopy,
                        unitCostPerCopy: cartItem.lockedUnitCostPerCopy || cartItem.cost,
                        totalCost: Number(cartItem.lockedUnitCostPerCopy || cartItem.cost || 0) * item.quantity,
                        totalPrice: cartItem.lockedUnitPricePerCopy * item.quantity
                    }
                };
                setFormData({ ...formData, items: currentItems });
                return;
            }

            const baseService = inventory.find((i: Item) => i.id === (cartItem.itemId || item.id)) || item;
            const activeAdjs: any[] = [];

            const baseCost = Number(baseService.cost) || 0;
            const pricing = await calculateServicePrice({
                itemId: baseService.id,
                categoryId: baseService.category,
                baseCost,
                pages,
                copies: item.quantity,
                adjustments: activeAdjs,
                marketAdjustments: activeAdjs,
                context: 'SERVICE'
            });

            currentItems[idx] = {
                ...currentItems[idx],
                price: pricing.unitPrice,
                selling_price: pricing.unitPrice,
                cost: pricing.cost,
                cost_price: pricing.cost,
                basePrice: pricing.cost,
                adjustmentSnapshots: pricing.adjustmentSnapshots,
                adjustmentTotal: pricing.adjustmentTotal,
                manual_override: false,
                serviceDetails: {
                    pages,
                    copies: item.quantity,
                    totalPages: pages * item.quantity,
                    unitCostPerPage: pricing.cost / pages,
                    unitPricePerCopy: pricing.unitPrice,
                    unitCostPerCopy: pricing.cost,
                    totalCost: baseCost,
                    totalPrice: pricing.totalPrice
                }
            };

            setFormData({ ...formData, items: currentItems });
            return;
        }

        const baseItemId = item.parentId || item.id;
        const baseItem = inventory.find((i: Item) => i.id === baseItemId) || item;
        const activeAdjs: any[] = [];
        const marketAdjustmentsInput: any[] = [];

        const normalizedSnapshots = resolveItemAdjustmentSnapshots(item);
        const storedVariantPrice = resolveStoredSellingPrice(item);
        const storedVariantCost = resolveStoredCost(item);
        const storedVariantAdjustmentTotal = Number(
            item.smartPricingSnapshot?.marketAdjustmentTotal
            ?? item.adjustmentTotal
            ?? normalizedSnapshots.reduce((sum: number, snapshot: any) => sum + getSnapshotCalculatedAmount(snapshot), 0)
        );

        if (item.parentId && storedVariantPrice > 0) {
            currentItems[idx] = {
                ...currentItems[idx],
                price: storedVariantPrice,
                selling_price: storedVariantPrice,
                calculated_price: resolveStoredCalculatedPrice(item) || storedVariantPrice,
                cost: storedVariantCost || currentItems[idx].cost || 0,
                cost_price: storedVariantCost || currentItems[idx].cost_price || currentItems[idx].cost || 0,
                adjustmentSnapshots: normalizedSnapshots,
                adjustmentTotal: storedVariantAdjustmentTotal,
                manual_override: false
            };
            setFormData({ ...formData, items: currentItems });
            return;
        }

        const basePrice = resolveStoredSellingPrice(baseItem);
        const priceData = basePrice > 0 ? {
            unitPrice: basePrice,
            cost: Number(currentItems[idx].cost || baseItem.cost) || 0,
            adjustmentTotal: marketAdjustmentsInput.reduce((sum: number, adj: any) => sum + (adj.calculatedAmount || 0), 0),
            adjustmentSnapshots: marketAdjustmentsInput
        } : await calculateSellingPrice({
            itemId: baseItem.id,
            categoryId: baseItem.category,
            baseCost: Number(currentItems[idx].cost || baseItem.cost) || 0,
            basePrice: Number(currentItems[idx].price || baseItem.price) || undefined,
            quantity: Number(currentItems[idx].quantity) || 1,
            adjustments: marketAdjustmentsInput,
            context: 'ORDER',
            quantityTiers: baseItem?.volumePricing,
            allowQuantityTiering: baseItem?.allowVolumePricing,
        });

        currentItems[idx] = {
            ...currentItems[idx],
            price: priceData.unitPrice,
            selling_price: priceData.unitPrice,
            cost: priceData.cost,
            cost_price: priceData.cost,
            adjustmentSnapshots: priceData.adjustmentSnapshots,
            adjustmentTotal: priceData.adjustmentTotal,
            manual_override: false
        };

        setFormData({ ...formData, items: currentItems });
    };

    const getInventoryPrices = (item: CartItem) => {
        const invItem = inventory.find((i: Item) => i.id === (item.parentId || item.id));
        if (!invItem) return { price: item.price, cost: item.cost || 0, adjustmentSnapshots: resolveItemAdjustmentSnapshots(item) };

        if (item.parentId && invItem.variants) {
            const variant = invItem.variants.find(v => v.id === item.id);
            if (variant) {
                const snap = variant.smartPricingSnapshot;
                const resolvedPrice = resolveStoredSellingPrice(variant);
                const resolvedCost = resolveStoredCost(variant);
                return {
                    price: resolvedPrice,
                    cost: resolvedCost,
                    adjustmentSnapshots: resolveItemAdjustmentSnapshots(variant),
                    smartPricingSnapshot: snap
                };
            }
        }

        return {
            price: resolveStoredSellingPrice(invItem) || 0,
            cost: resolveStoredCost(invItem) || 0,
            adjustmentSnapshots: resolveItemAdjustmentSnapshots(invItem)
        };
    };

    useEffect(() => {
        let mounted = true;
        dbService.getAll<BOMTemplate>('bomTemplates')
            .then((templates) => {
                if (mounted) setBomTemplates(templates || []);
            })
            .catch((err) => {
                logger.error('Failed to load BOM templates for OrderForm service pricing', err);
            });

        return () => {
            mounted = false;
        };
    }, []);

    useEffect(() => {
        if (!formData.customerName) return;

        const customer = findCustomerByName(formData.customerName);
        if (!customer) return;

        const transactionType = type === 'Quotation'
            ? 'quotation'
            : type === 'Order'
                ? 'order'
                : 'invoice';
        const { paymentTerms, dueDate } = resolveCustomerPaymentPolicy({
            customer,
            subAccountName: formData.subAccountName,
            transactionType,
            issuedDate: formData.date,
            preserveCustomTerms: true
        });

        setFormData(prev => {
            if (prev.paymentTerms === paymentTerms && prev.dueDate === dueDate) {
                return prev;
            }

            return {
                ...prev,
                paymentTerms,
                dueDate
            };
        });
    }, [customers, formData.customerName, formData.date, formData.subAccountName, type]);

    const analysis = useMemo(() => {
        let totalGross = 0;
        let totalNet = 0;
        let totalCostPrice = 0;
        let totalQty = 0;
        const adjustmentBreakdown: Record<string, number> = {};

        const processedItems = (Array.isArray(formData.items) ? formData.items : []).map((item: CartItem) => {
            totalQty += item.quantity || 0;
            const lineBase = (Number(item.basePrice || item.price) || 0) * item.quantity;
            totalNet += lineBase;

            const lineTotal = (Number(item.price) || 0) * item.quantity;
            totalGross += lineTotal;

            const invItem = inventory.find((i: Item) => i.id === (item.parentId || item.id));
            let itemCost = item.cost || 0;

            if (item.serviceDetails) {
                itemCost = Number(item.cost) || 0;
            } else if (invItem) {
                const variant = item.parentId && invItem.variants
                    ? invItem.variants.find((v: any) => v.id === item.id)
                    : null;
                itemCost = variant ? (variant.cost || 0) : invItem.cost;
            }
            totalCostPrice += itemCost * item.quantity;

            let currentSnapshots = resolveItemAdjustmentSnapshots(item);

            const isSmartPricingVariant = !!item.parentId && !!item.smartPricingSnapshot;

            if (!currentSnapshots || currentSnapshots.length === 0) {
                if (isSmartPricingVariant) {
                    currentSnapshots = [];
                } else {
                    currentSnapshots = [];
                }
            }

            if (currentSnapshots && currentSnapshots.length > 0) {
                getMarketAdjustmentSnapshots(currentSnapshots).forEach((snap: any) => {
                    const amount = getSnapshotCalculatedAmount(snap) * item.quantity;
                    const name = snap.name || 'Other Adjustment';
                    adjustmentBreakdown[name] = (adjustmentBreakdown[name] || 0) + amount;
                });
            }

            return attachPricingBreakdown({
                ...item,
                adjustmentSnapshots: currentSnapshots,
                lineTotalNet: lineTotal
            });
        });

        const pricingSummary = summarizePricingBreakdown(processedItems);

        const rawDiscount = Number(formData.discount || 0);
        const discountAmount = formData.discountType === 'percentage' ? (rawDiscount / 100) * totalGross : rawDiscount;

        const currentTaxRate = companyConfig?.taxRate || 0;
        const taxAmount = (companyConfig?.enableTax) ? (totalGross - discountAmount) * (currentTaxRate / 100) : 0;
        const otherCharges = Number(formData.otherCharges) || 0;
        const calcOtherCharges = Number(calculatedOtherCharges) || 0;
        const subTotal = totalGross;
        const finalTotal = totalGross - discountAmount + taxAmount + otherCharges + calcOtherCharges;

        return {
            subTotal,
            totalCostPrice,
            totalAmount: finalTotal,
            tax: taxAmount,
            taxRate: currentTaxRate,
            processedItems,
            adjustmentBreakdown,
            otherCharges,
            pricingSummary,
            discountAmount,
            totalQty,
            totalItems: processedItems.length,
        };
    }, [formData.items, formData.discount, formData.discountType, formData.otherCharges, formData.customerPricingTier, inventory, marketAdjustments, companyConfig, calculatedOtherCharges]);

    const finalDisplayTotal = analysis.totalAmount;
    const orderedAdjustmentEntries = useMemo(() => {
        return Object.entries(analysis.adjustmentBreakdown).sort(([nameA], [nameB]) => {
            const metaA = getPricingDisplayMeta(nameA);
            const metaB = getPricingDisplayMeta(nameB);
            if (metaA.priority !== metaB.priority) return metaA.priority - metaB.priority;
            return nameA.localeCompare(nameB);
        });
    }, [analysis.adjustmentBreakdown]);

    useEffect(() => {
        if (!initialData) {
            let key = 'invoice';
            let collection: any[] = invoices;

            if (type === 'Quotation') {
                key = 'quotation';
                collection = quotations;
            } else if (type === 'Recurring') {
                key = 'REC';
                collection = recurringInvoices;
            } else if (type === 'Order') {
                key = 'order';
                collection = [];
            }

            setFormData((prev: any) => ({ ...prev, id: generateNextId(key, collection, companyConfig) }));
        } else {
            const clonedItems = Array.isArray(initialData.items) ? cloneSerializable(initialData.items) : [];
            const { items: normalizedItems, otherChargesCalculated: normalizedOtherCharges } = normalizeOtherCharges(clonedItems);
            const clonedScheduledDates = Array.isArray(initialData.scheduledDates)
                ? [...initialData.scheduledDates].map((date: any) => String(date))
                : [];
            const resolvedRecurringStatus = normalizeRecurringStatus(initialData.status);
            const fallbackId = initialData.id || generateNextId(
                type === 'Quotation' ? 'quotation' : type === 'Recurring' ? 'REC' : type === 'Order' ? 'order' : 'invoice',
                type === 'Quotation' ? quotations : type === 'Recurring' ? recurringInvoices : type === 'Order' ? [] : invoices,
                companyConfig
            );

            const editCustomer = initialData.customerId
                ? customers.find((c: any) => c.id === initialData.customerId)
                : null;
            const editSegment = editCustomer?.segment || initialData.customerPricingSegment || '';

            setFormData((prev: any) => ({
                ...prev,
                ...initialData,
                id: fallbackId,
                customerName: initialData.customerName || '',
                customerId: initialData.customerId || '',
                customerPricingTier: initialData.customerPricingTier || '',
                customerPricingSegment: editSegment,
                subAccountName: initialData.subAccountName || 'Main',
                salesAccountId: initialData.salesAccountId || '4000',
                items: normalizedItems,
                status: isRecurring
                    ? resolvedRecurringStatus
                    : (initialData.status || (type === 'Invoice' ? 'Unpaid' : (type === 'Order' ? 'Pending' : 'Draft'))),
                discount: initialData.discount || 0,
                discountType: initialData.discountType || 'fixed',
                otherCharges: initialData.otherCharges || 0,
                otherChargesCalculated: initialData.otherChargesCalculated ?? normalizedOtherCharges,
                date: initialData.date || prev.date,
                dueDate: initialData.dueDate || prev.dueDate,
                paymentTerms: initialData.paymentTerms || prev.paymentTerms,
                paymentMethod: initialData.paymentMethod || 'Cash',
                frequency: initialData.frequency || prev.frequency,
                startDate: isRecurring
                    ? normalizeDateInputValue(initialData.startDate || initialData.date || prev.startDate)
                    : (initialData.startDate || prev.startDate),
                endDate: initialData.endDate || '',
                scheduledDates: clonedScheduledDates,
                nextRunDate: isRecurring
                    ? normalizeDateInputValue(initialData.nextRunDate || getDefaultRecurringNextRunDate(initialData.frequency || prev.frequency, initialData.startDate || initialData.date || prev.startDate))
                    : initialData.nextRunDate || prev.nextRunDate,
                referenceDoc: initialData.referenceDoc || ''
            }));
        }
    }, [type, initialData, invoices, recurringInvoices, quotations, companyConfig, isRecurring]);

    const itemsRef = useRef(formData.items);
    itemsRef.current = formData.items;

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.altKey && e.key === 'F2') {
                e.preventDefault();
                const match = itemSearch.trim()
                    ? inventory.find((i: Item) =>
                        i.name.toLowerCase().includes(itemSearch.toLowerCase()) ||
                        i.sku.toLowerCase().includes(itemSearch.toLowerCase())
                      )
                    : null;
                setItemHistoryItemId(match?.id);
                setShowItemHistory(true);
            }
        };
        const handleClickOutside = (event: MouseEvent) => {
            if (itemDropdownRef.current && !itemDropdownRef.current.contains(event.target as Node)) {
                setIsItemDropdownOpen(false);
            }
            if (serviceDropdownRef.current && !serviceDropdownRef.current.contains(event.target as Node)) {
                setIsServiceDropdownOpen(false);
            }
        };
        document.addEventListener('keydown', handleKeyDown);
        document.addEventListener('mousedown', handleClickOutside);
        return () => {
            document.removeEventListener('keydown', handleKeyDown);
            document.removeEventListener('mousedown', handleClickOutside);
            // Release stock reservations on unmount (crash recovery)
            const items = itemsRef.current;
            items.forEach((item: any) => {
                const itemId = item.parentId || item.id;
                const variantId = item.parentId ? item.id : undefined;
                if (item.type !== 'Service' && item.quantity > 0) {
                    try { updateReservedStock(itemId, -item.quantity, `Form closed (cleanup)`, variantId); } catch (e) { logger.error("Operation failed", e as Error); }
                }
            });
        };
    }, []);

    const openServiceCalculator = (service: Item, editIndex: number | null = null, initial?: { pages: number; copies: number }) => {
        setSelectedServiceForCalculator(service);
        setServiceEditIndex(editIndex);
        setServiceInitialValues({
            pages: Math.max(1, Number(initial?.pages || service.pages || 1)),
            copies: Math.max(1, Number(initial?.copies || 1))
        });
    };

    const handleServicePricingConfirm = async (pricing: DynamicServicePricingResult) => {
        if (!selectedServiceForCalculator) return;
        const service = selectedServiceForCalculator;
        const pricedLine: CartItem = { ...service, quantity: pricing.copies, discount: 0, price: pricing.unitPricePerCopy, cost: pricing.unitCostPerCopy, basePrice: pricing.unitCostPerCopy, adjustmentSnapshots: pricing.adjustmentSnapshots || [], adjustmentTotal: pricing.adjustmentTotal, pagesOverride: pricing.pages, serviceDetails: pricing.serviceDetails, priceLocked: pricing.priceLocked || false, lockedTotalPrice: pricing.lockedTotalPrice, lockedUnitPricePerCopy: pricing.lockedUnitPricePerCopy, lockedUnitCostPerCopy: pricing.lockedUnitCostPerCopy } as CartItem;

        const items = Array.isArray(formData.items) ? [...formData.items] : [];

        if (serviceEditIndex !== null && serviceEditIndex >= 0 && serviceEditIndex < items.length) {
            items[serviceEditIndex] = { ...items[serviceEditIndex], ...pricedLine };
        } else {
            const existingIdx = items.findIndex((l: any) => l.type === 'Service' && !l.parentId && l.id === service.id && Number(l.serviceDetails?.pages || l.pagesOverride || 0) === pricing.pages);
            if (existingIdx > -1 && !(pricing.priceLocked && pricing.lockedUnitPricePerCopy !== undefined)) {
                const mergedCopies = Number(items[existingIdx].quantity || 0) + pricing.copies;
                const mergedPricing = await calculateServicePrice({ itemId: service.id, categoryId: service.category, baseCost: Number(service.cost) || 0, pages: pricing.pages, copies: mergedCopies, adjustments: [], marketAdjustments: [], context: 'SERVICE' });
                const totalPages = pricing.pages * mergedCopies;
                items[existingIdx] = { ...items[existingIdx], quantity: mergedCopies, price: mergedPricing.unitPrice, cost: mergedPricing.cost, basePrice: mergedPricing.cost, pagesOverride: pricing.pages, adjustmentSnapshots: mergedPricing.adjustmentSnapshots, adjustmentTotal: mergedPricing.adjustmentTotal, serviceDetails: { pages: pricing.pages, copies: mergedCopies, totalPages, unitCostPerPage: mergedPricing.cost / pricing.pages, unitPricePerCopy: mergedPricing.unitPrice, unitCostPerCopy: mergedPricing.cost, totalCost: Number(service.cost) || 0, totalPrice: mergedPricing.totalPrice } };
            } else items.push(pricedLine);
        }

        setFormData({ ...formData, items }); notify(`${service.name} updated`, "success"); setSelectedServiceForCalculator(null); setServiceEditIndex(null);
    };

    const handleEditServiceConfiguration = (idx: number) => {
        const line = formData.items[idx];
        if (!line || line.type !== 'Service') return;

        const baseService = inventory.find((i: Item) => i.id === (line.itemId || line.id)) || line;
        openServiceCalculator(baseService, idx, {
            pages: Number(line.serviceDetails?.pages || line.pagesOverride || 1),
            copies: Number(line.serviceDetails?.copies || line.quantity || 1)
        });
    };

    const handleSubmission = async (asDraft: boolean, andPay: boolean = false) => {
        if (saving) return;
        if (!formData.customerName || analysis.processedItems.length === 0) {
            notify("Selection of customer and items is required.", "error");
            return;
        }

        if (isRecurring && !formData.nextRunDate) {
            notify("Next billing date is required for a subscription.", "error");
            return;
        }
        if (isRecurring && !formData.startDate) {
            notify("Start date is required for a subscription.", "error");
            return;
        }
        if (isRecurring && formData.endDate && new Date(formData.endDate).getTime() < new Date(formData.startDate).getTime()) {
            notify("End date cannot be earlier than the subscription start date.", "error");
            return;
        }

        let resolvedCustomerName = formData.customerName.trim();
        let resolvedCustomerId = formData.customerId || '';

        const existingCustomer = findCustomerByName(resolvedCustomerName);
        if (existingCustomer) {
            resolvedCustomerName = existingCustomer.name;
            resolvedCustomerId = existingCustomer.id;
        } else {
            try {
                const createdCustomer = await ensureCustomerExists(resolvedCustomerName);
                if (createdCustomer) {
                    resolvedCustomerName = createdCustomer.name;
                    resolvedCustomerId = createdCustomer.id;
                }
            } catch (err: any) {
                notify(`Failed to add client: ${err.message || 'Unknown error'}`, "error");
                return;
            }
        }

        if (!resolvedCustomerId) {
            notify("Unable to resolve a valid client record. Please add/select a client and try again.", "error");
            return;
        }

        // Apply per-item discount rules and per-item tax
        const customerSegment = selectedCustomerObj?.segment || formData.customerPricingSegment || '';
        const applicableDiscounts = await getApplicableDiscounts(resolvedCustomerId, customerSegment, undefined, analysis.totalAmount);
        const processedItems = await Promise.all(analysis.processedItems.map(async (item: any) => {
            const basePrice = item.customerPriceAdjusted ? item.price : (Number(item.baseUnitPrice || item.price || 0));
            const unitPrice = Number(item.price) || 0;
            const qty = Number(item.quantity) || 0;
            const lineTotal = unitPrice * qty;

            let discountAmount = 0;
            let discountDetails: any[] = [];
            if (applicableDiscounts.length > 0) {
                const itemForDiscount = inventory.find((i: Item) => i.id === (item.parentId || item.id));
                const itemCategory = itemForDiscount?.category || item.category || '';
                const catDiscounts = applicableDiscounts.filter(
                    (d: any) => d.scope === 'global' || d.scope === itemCategory || d.itemId === item.id
                );
                if (catDiscounts.length > 0) {
                    const result = applyDiscounts(lineTotal, qty, unitPrice, catDiscounts);
                    discountAmount = result.appliedDiscounts.reduce((s: number, d: any) => s + d.amount, 0);
                    discountDetails = result.appliedDiscounts || [];
                }
            }

            const baseItem = inventory.find((i: Item) => i.id === (item.parentId || item.id));
            const taxableAmount = lineTotal - discountAmount;
            let taxAmount = 0;
            let taxRate = companyConfig?.taxRate || 0;
            let taxDetails: any = null;
            if (companyConfig?.enableTax && baseItem) {
                const effectiveUnitPrice = discountAmount > 0 && qty > 0 ? roundToCurrency(taxableAmount / qty) : unitPrice;
                const taxResult = await calculateItemTax(baseItem, effectiveUnitPrice, qty, resolvedCustomerId);
                taxAmount = taxResult?.taxAmount || 0;
                taxRate = taxResult?.rate || taxRate;
            }

            return {
                ...item,
                discount: discountAmount,
                discountDetails,
                taxAmount,
                taxRate,
                taxableAmount,
                taxDetails: null,
                lineTotalNet: lineTotal - discountAmount
            };
        }));

        const totalGross = processedItems.reduce((sum: number, i: any) => sum + (Number(i.price) || 0) * (Number(i.quantity) || 0), 0);
        const rawManualDiscount = Number(formData.discount || 0);
        const manualDiscount = formData.discountType === 'percentage' ? (rawManualDiscount / 100) * totalGross : rawManualDiscount;
        const ruleDiscount = processedItems.reduce((sum: number, i: any) => sum + (i.discount || 0), 0);
        const totalDiscount = manualDiscount + ruleDiscount;
        const totalTax = processedItems.reduce((sum: number, i: any) => sum + (i.taxAmount || 0), 0);
        const otherCharges = Number(formData.otherCharges) || 0;
        const preRoundTotal = totalGross - totalDiscount + totalTax + otherCharges + calculatedOtherCharges;
        const { rounded: finalTotalAmount, difference: roundingDifference } = applyRoundingToTotal(preRoundTotal, formData.roundingMethod || 'Nearest');
        const effectiveTaxRate = processedItems.length > 0
            ? (totalTax / (totalGross - totalDiscount)) * 100
            : 0;

        const consumptionSnapshots: any[] = [];

        processedItems.forEach((item: any) => {
            if (item.consumptionSnapshots) {
                consumptionSnapshots.push(...item.consumptionSnapshots);
            }
        });
        const aggregatedSnapshots = aggregateMarketAdjustmentSnapshots(processedItems);

        if (type === 'Order') {
            if (formData.status === 'Completed' && !formData.shippingAddress) {
                notify("Shipping address is required for completed orders.", "error");
                return;
            }

            const orderItems = processedItems.map((item: any) => ({
                id: Math.random().toString(36).substr(2, 9),
                orderId: formData.id,
                productId: item.id,
                productName: item.name,
                quantity: item.quantity,
                unitPrice: item.price,
                subtotal: item.lineTotalNet,
                total: item.lineTotalNet,
                discount: item.discount || 0,
                discountDetails: item.discountDetails,
                taxAmount: item.taxAmount || 0,
                taxRate: item.taxRate || 0,
                taxDetails: item.taxDetails,
                adjustmentSnapshots: item.adjustmentSnapshots,
                adjustmentTotal: item.adjustmentTotal || item.pricingBreakdown?.adjustmentTotal || 0,
                pricingBreakdown: item.pricingBreakdown,
                smartPricingSnapshot: item.smartPricingSnapshot,
                productionCostSnapshot: item.productionCostSnapshot,
                variantId: item.parentId ? item.id : item.variantId,
                parentId: item.parentId,
                serviceDetails: item.serviceDetails,
                price: item.price,
            })) as OrderItem[];

            const paidAmount = andPay ? finalTotalAmount : 0;
            const payments = andPay ? [{
                id: `PAY-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
                orderId: formData.id,
                amountPaid: finalTotalAmount,
                paymentDate: new Date().toISOString(),
                paymentMethod: formData.paymentMethod,
                recordedBy: user?.name || user?.username || 'System',
                reference: `Initial payment for Order #${formData.id}`
            }] : [] as OrderPayment[];

            const orderPayload = {
                id: formData.id,
                orderNumber: formData.id,
                customerId: resolvedCustomerId,
                customerName: resolvedCustomerName,
                orderDate: formData.date,
                status: asDraft ? 'Pending' : (formData.status === 'Draft' ? 'Pending' : formData.status),
                items: orderItems as any,
                totalAmount: finalTotalAmount,
                paidAmount: paidAmount,
                discount: totalDiscount,
                discountDetails: processedItems.flatMap((i: any) => i.discountDetails || []),
                notes: formData.notes,
                billingAddress: formData.billingAddress,
                shippingAddress: formData.shippingAddress,
                createdBy: user?.name || user?.username || 'System',
                payments: payments,
                adjustmentSnapshots: aggregatedSnapshots,
                adjustmentTotal: analysis.pricingSummary.adjustmentTotal,
                materialTotal: analysis.pricingSummary.materialTotal,
                profitMarginTotal: analysis.pricingSummary.profitMarginTotal,
                roundingTotal: roundingDifference,
                roundingDifference: roundingDifference,
                roundingMethod: formData.roundingMethod || '',
                consumptionSnapshots: consumptionSnapshots,
                subtotal: totalGross - totalDiscount,
                tax: totalTax,
                taxRate: effectiveTaxRate,
                otherCharges: otherCharges
            };
            await createOrder(orderPayload);
            const allAppliedDiscounts = processedItems.flatMap((i: any) => i.discountDetails || []);
            for (const d of allAppliedDiscounts) {
                await incrementDiscountUsage(d.ruleId || d.id).catch(() => {});
            }

            if (selectedCustomerObj?.referredById) {
                import('../../../services/referralService').then(({ referralService }) =>
                    referralService.registerReferralFromInvoice({
                        id: formData.id,
                        customerId: resolvedCustomerId || '',
                        customerName: resolvedCustomerName,
                        totalAmount: finalTotalAmount,
                        referredById: selectedCustomerObj.referredById,
                        referredByName: selectedCustomerObj.referredByName,
                    }).catch(err =>
                        console.error('[REFERRAL] register from order form (order path) failed:', err)
                    )
                );
            }

            // Save & Finalise → close the form and let the parent celebrate with
            // a POS-style success modal.
            if (!asDraft) {
                onSaveSuccess?.({
                    type: 'Order',
                    docNumber: orderPayload.orderNumber,
                    totalAmount: finalTotalAmount,
                    customerName: resolvedCustomerName,
                    data: orderPayload,
                });
            }

            onCancel();
            return;
        }

        const finalData = {
            ...formData,
            customerId: resolvedCustomerId,
            customerName: resolvedCustomerName,
            customerPhone: selectedCustomerObj?.phone || formData.customerPhone || '',
            customerEmail: selectedCustomerObj?.email || formData.customerEmail || '',
            customerAddress: formData.billingAddress || formData.shippingAddress || selectedCustomerObj?.billingAddress || selectedCustomerObj?.address || '',
            items: processedItems,
            totalAmount: finalTotalAmount,
            total: finalTotalAmount,
            discount: totalDiscount,
            discountType: formData.discountType || 'fixed',
            discountRaw: formData.discountType === 'percentage' ? Number(formData.discount || 0) : 0,
            otherCharges: otherCharges,
            discountDetails: processedItems.flatMap((i: any) => i.discountDetails || []),
            status: isRecurring
                ? normalizeRecurringStatus(asDraft ? 'Draft' : formData.status)
                : (asDraft ? 'Draft' : (formData.status || 'Unpaid')),
            materialTotal: analysis.pricingSummary.materialTotal,
            adjustmentTotal: analysis.pricingSummary.adjustmentTotal,
            adjustmentSnapshots: aggregatedSnapshots,
            profitMarginTotal: analysis.pricingSummary.profitMarginTotal,
            roundingTotal: roundingDifference,
            roundingDifference: roundingDifference,
            roundingMethod: formData.roundingMethod || '',
            consumptionSnapshots: consumptionSnapshots,
            tax: totalTax,
            taxRate: effectiveTaxRate,
            paymentTerms: formData.paymentTerms,
            startDate: isRecurring ? normalizeDateInputValue(formData.startDate || formData.date) : formData.startDate,
            endDate: isRecurring ? (formData.endDate || '') : formData.endDate,
            scheduledDates: isRecurring ? [...(formData.scheduledDates || [])].sort() : formData.scheduledDates,
            nextRunDate: isRecurring
                ? normalizeDateInputValue(formData.nextRunDate || getDefaultRecurringNextRunDate(formData.frequency || 'Monthly', formData.startDate || formData.date))
                : formData.nextRunDate,
            referredBy: selectedCustomerObj?.referredById || '',
            referredByName: selectedCustomerObj?.referredByName || '',
            createdBy: user?.name || user?.username || 'System User',
            referenceDoc: formData.referenceDoc || '',

        };

        const allAppliedDiscounts = processedItems.flatMap((i: any) => i.discountDetails || []);
        for (const d of allAppliedDiscounts) {
            await incrementDiscountUsage(d.ruleId || d.id).catch(() => {});
        }

        onSave(finalData, asDraft, auditReason, andPay);
    };

    const handleQuickService = (serviceName: string) => {
        if (serviceName === 'Printing') {
            setQuickPrintModal({ open: true, type: 'printing' });
        } else if (serviceName === 'Photocopy') {
            setQuickPrintModal({ open: true, type: 'photocopy' });
        }
    };

    const handleQuickPrintConfirm = (quantity: number, pagesPerCopy: number, total: number, printType: 'photocopy' | 'printing', pinningCost?: number, pinningCount?: number) => {
        const isPhotocopy = printType === 'photocopy';
        const pricePerPage = isPhotocopy 
          ? (companyConfig.transactionSettings?.pos?.photocopyPrice ?? 2.00)
          : (companyConfig.transactionSettings?.pos?.typePrintingPrice ?? 5.00);

        const costPerPage = isPhotocopy
          ? calculatePhotocopyCostPerPage(inventory)
          : calculateTypePrintingCostPerPage(inventory);

        const totalPages = pagesPerCopy * quantity;
        const materialCost = costPerPage * totalPages;
        const unitCostPerCopy = totalPages > 0 ? materialCost : 0;

        const finalPrice = total;

        const newItem: CartItem = {
          id: `QUICK-${isPhotocopy ? 'PHOTO' : 'PRINT'}-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
          itemId: isPhotocopy ? 'SVC-PHOTOCOPY' : 'SVC-TYPE-PRINT',
          name: isPhotocopy ? 'Quick Photocopy' : 'Type & Printing',
          sku: isPhotocopy ? 'QUICK-PHOTO' : 'QUICK-PRINT',
          desc: isPhotocopy 
            ? `Quick Photocopy (${pagesPerCopy} pages, ${Math.ceil(pagesPerCopy / 2)} sheets x ${quantity} copies)`
            : `Type & Printing (${pagesPerCopy} pages x ${quantity} copies)`,
          price: finalPrice,
          cost: materialCost,
          cost_price: materialCost,
          quantity: 1,
          pagesOverride: pagesPerCopy,
          category: 'Service',
          type: 'Service',
          unit: isPhotocopy ? 'sheet' : 'page',
          pages: pagesPerCopy,
          stock: 9999,
          minStockLevel: 0,
          adjustedPrice: finalPrice,
          priceLocked: true,
          lockedUnitPricePerCopy: finalPrice,
          lockedUnitCostPerCopy: unitCostPerCopy,
          serviceDetails: {
            pages: pagesPerCopy,
            copies: quantity,
            pinningCost: pinningCost,
            pinningCount: pinningCount
          }
        } as CartItem;

        setFormData((prev: any) => ({
            ...prev,
            items: [...prev.items, newItem]
        }));

        notify(`${quantity}x${pagesPerCopy} pages added to voucher`, 'success');
    };

const handleAddItem = async (item: Item) => {
        if (item.isVariantParent) {
            setSelectedProductForVariants(item);
            return;
        }

        if (item.type === 'Service') {
            openServiceCalculator(item, null, { pages: item.pages || 1, copies: 1 });
            setItemSearch('');
            return;
        }

        const existingItemIdx = formData.items.findIndex((i: any) => i.id === item.id && !i.parentId);

        if (existingItemIdx > -1) {
            await handleQuantityChange(existingItemIdx, formData.items[existingItemIdx].quantity + 1);
            notify(`Incremented quantity for ${item.name}`, "success");
        } else {
            if ((item.type as string) !== 'Service') {
                updateReservedStock(item.id, 1, `Selection in ${type} Form`);
            }

            const activeAdjs: any[] = [];
            const marketAdjustmentsInput: any[] = [];

            const storedPrice = resolveStoredSellingPrice(item);
            const pricing = storedPrice > 0 ? {
                unitPrice: storedPrice,
                cost: Number(item.cost) || 0,
                adjustmentTotal: 0,
                adjustmentSnapshots: []
            } : await calculateSellingPrice({
                itemId: item.id,
                categoryId: item.category,
                baseCost: Number(item.cost) || 0,
                quantity: 1,
                adjustments: marketAdjustmentsInput,
                context: 'ORDER',
                quantityTiers: item?.volumePricing,
                allowQuantityTiering: item?.allowVolumePricing,
            });

            let finalUnitPrice = pricing.unitPrice;
            let customerPriceAdjusted = false;
            const baseUnitPrice = finalUnitPrice;
            const segment = formData.customerPricingSegment || selectedCustomerObj?.segment || '';
            let tier: any = null;
            if (formData.customerId) {
                tier = await getCustomerPricingTier(formData.customerId).catch(() => null);
                if (tier) {
                    finalUnitPrice = resolveCustomerPrice(baseUnitPrice, tier, segment);
                    customerPriceAdjusted = true;
                }
            }

            const newItem: CartItem = {
                ...item,
                quantity: 1,
                discount: 0,
                price: finalUnitPrice,
                unitPrice: finalUnitPrice,
                selling_price: finalUnitPrice,
                cost: pricing.cost,
                basePrice: finalUnitPrice,
                baseUnitPrice,
                customerPriceAdjusted,
                customerPricingTier: tier?.id || '',
                customerPricingSegment: segment,
                adjustmentSnapshots: pricing.adjustmentSnapshots as any,
                adjustmentTotal: pricing.adjustmentTotal,
                pagesOverride: item.pages
            };

            setFormData((prev: any) => ({
                ...prev,
                items: [...prev.items, newItem]
            }));
            notify(`${item.name} added`, "success");
        }

        setItemSearch('');
    };

    const handleCreateItemSave = async (item: Item): Promise<void> => {
        await addItem(item);
        await handleAddItem(item);
        setShowCreateItemModal(false);
    };

const handleVariantSelect = async (variant: ProductVariant) => {
        if (!selectedProductForVariants) return;

        const normalizedAdjustmentSnapshots = resolveItemAdjustmentSnapshots(variant);

        const existingItemIdx = formData.items.findIndex((i: any) => i.id === variant.id && i.parentId === selectedProductForVariants.id);

        if (existingItemIdx > -1) {
            await handleQuantityChange(existingItemIdx, formData.items[existingItemIdx].quantity + 1);
            notify(`Incremented quantity for ${variant.name}`, "success");
        } else {
            const parentItem = selectedProductForVariants;
            const variantItem: any = {
                ...selectedProductForVariants,
                id: variant.id,
                parentId: selectedProductForVariants.id,
                sku: variant.sku,
                name: variant.name,
                price: resolveStoredSellingPrice(variant) || 0,
                selling_price: resolveStoredSellingPrice(variant) || 0,
                calculated_price: resolveStoredCalculatedPrice(variant) || 0,
                cost: resolveStoredCost(variant) || 0,
                cost_price: resolveStoredCost(variant) || 0,
                stock: variant.stock,
                isVariantParent: false,
                variants: [],
                pagesOverride: variant.pages,
                pricingSource: variant.pricingSource,
                productionCostSnapshot: variant.productionCostSnapshot,
                quantity: variant.quantity || 1
            };

            const quantity = variantItem.quantity || 1;

            updateReservedStock(selectedProductForVariants.id, quantity, `Variant selection in ${type} Form`, variant.id);

            const activeAdjs: any[] = [];
            const marketAdjustmentsInput: any[] = [];

            const snapPrice = resolveStoredSellingPrice(variant);
            const snapCost = resolveStoredCost(variant);
            const snapAdjTotal = Number(
                variant.smartPricingSnapshot?.marketAdjustmentTotal
                ?? variant.adjustmentTotal
                ?? normalizedAdjustmentSnapshots.reduce((sum: number, snapshot: any) => sum + getSnapshotCalculatedAmount(snapshot), 0)
            );
            const snapAdjSnaps = normalizedAdjustmentSnapshots;

            if (snapPrice > 0) {
                variantItem.price = snapPrice;
                variantItem.selling_price = snapPrice;
                variantItem.calculated_price = resolveStoredCalculatedPrice(variant) || snapPrice;
                variantItem.cost = snapCost;
                variantItem.cost_price = snapCost;
                variantItem.basePrice = snapCost;
                variantItem.adjustmentSnapshots = snapAdjSnaps;
                variantItem.adjustmentTotal = snapAdjTotal;
                variantItem.smartPricingSnapshot = variant.smartPricingSnapshot;
            } else {
                const parentFallbackPrice = resolveStoredSellingPrice(parentItem) || Number(parentItem.price) || 0;
                const pricing = await calculateSellingPrice({
                    itemId: parentItem.id,
                    categoryId: parentItem.category,
                    baseCost: Number(variantItem.cost) || 0,
                    basePrice: parentFallbackPrice > 0 ? parentFallbackPrice : undefined,
                    quantity: 1,
                    adjustments: marketAdjustmentsInput,
                    context: 'ORDER',
                    quantityTiers: parentItem?.volumePricing,
                    allowQuantityTiering: parentItem?.allowVolumePricing,
                });
                variantItem.price = pricing.unitPrice;
                variantItem.selling_price = pricing.unitPrice;
                variantItem.calculated_price = pricing.unitPrice;
                variantItem.cost = pricing.cost;
                variantItem.cost_price = pricing.cost;
                variantItem.basePrice = pricing.cost;
                variantItem.adjustmentSnapshots = pricing.adjustmentSnapshots;
                variantItem.adjustmentTotal = pricing.adjustmentTotal;
            }

            const segment = formData.customerPricingSegment || selectedCustomerObj?.segment || '';
            if (formData.customerId && !variant.customerPriceAdjusted) {
                const tier = await getCustomerPricingTier(formData.customerId).catch(() => null);
                if (tier) {
                    const baseUnitPrice = variantItem.price || 0;
                    const adjusted = resolveCustomerPrice(baseUnitPrice, tier, segment);
                    variantItem.price = adjusted;
                    variantItem.selling_price = adjusted;
                    variantItem.baseUnitPrice = baseUnitPrice;
                    variantItem.customerPriceAdjusted = true;
                    variantItem.customerPricingTier = tier?.id || '';
                    variantItem.customerPricingSegment = segment;
                }
            }

            setFormData((prev: any) => ({
                ...prev,
                items: [...prev.items, variantItem]
            }));

            notify(`${variant.name} added`, "success");
        }

        setSelectedProductForVariants(null);
        setItemSearch('');
    };

    const handleQuantityChange = async (idx: number, newValue: number) => {
        if (isPriceLocked) return;

        const item = formData.items[idx];
        const safeQty = Math.max(1, Math.floor(Number(newValue) || 1));

        if (item.type === 'Service' && item.serviceDetails) {
            const cartItem = item;

            if (cartItem.manual_override) {
                const pages = Number(cartItem.serviceDetails?.pages || item.pagesOverride || 1);
                const newItems = [...formData.items];
                newItems[idx] = {
                    ...newItems[idx],
                    quantity: safeQty,
                    manual_override: true,
                    serviceDetails: {
                        ...cartItem.serviceDetails,
                        pages,
                        copies: safeQty,
                        totalPages: pages * safeQty,
                        unitCostPerPage: pages > 0 ? Number(cartItem.cost || 0) / pages : 0,
                        unitPricePerCopy: cartItem.price,
                        unitCostPerCopy: cartItem.cost,
                        totalCost: Number(cartItem.cost || 0) * safeQty,
                        totalPrice: Number(cartItem.price || 0) * safeQty
                    }
                };

                setFormData({ ...formData, items: newItems });
                return;
            }

            if (cartItem.priceLocked && cartItem.lockedUnitPricePerCopy !== undefined) {
                const newItems = [...formData.items];
                newItems[idx] = {
                    ...newItems[idx],
                    quantity: safeQty,
                    price: cartItem.lockedUnitPricePerCopy,
                    cost: cartItem.lockedUnitCostPerCopy || cartItem.cost,
                    basePrice: cartItem.lockedUnitCostPerCopy || cartItem.basePrice,
                    priceLocked: true,
                    lockedTotalPrice: cartItem.lockedTotalPrice,
                    lockedUnitPricePerCopy: cartItem.lockedUnitPricePerCopy,
                    lockedUnitCostPerCopy: cartItem.lockedUnitCostPerCopy
                };

                setFormData({ ...formData, items: newItems });
                return;
            }

            const pages = Number(cartItem.serviceDetails?.pages || item.pagesOverride || 1);
            const baseService = inventory.find((i: Item) => i.id === (cartItem.itemId || item.id)) || item;

            const activeAdjs: any[] = [];

            const baseCost = Number(baseService.cost) || 0;
            const pricing = await calculateServicePrice({
                itemId: baseService.id,
                categoryId: baseService.category,
                baseCost: baseCost,
                pages: pages,
                copies: safeQty,
                adjustments: activeAdjs,
                marketAdjustments: activeAdjs,
                context: 'SERVICE'
            });

            const totalPages = pages * safeQty;
            const newItems = [...formData.items];
            newItems[idx] = {
                ...newItems[idx],
                quantity: safeQty,
                price: pricing.unitPrice,
                cost: pricing.cost,
                basePrice: pricing.cost,
                pagesOverride: pages,
                adjustmentSnapshots: pricing.adjustmentSnapshots,
                adjustmentTotal: pricing.adjustmentTotal,
                serviceDetails: {
                    pages,
                    copies: safeQty,
                    totalPages,
                    unitCostPerPage: pricing.cost / pages,
                    unitPricePerCopy: pricing.unitPrice,
                    unitCostPerCopy: pricing.cost,
                    totalCost: baseCost,
                    totalPrice: pricing.totalPrice
                }
            };

            setFormData({ ...formData, items: newItems });
            return;
        }

        const diff = safeQty - item.quantity;

        if (diff !== 0) {
            const itemId = item.parentId || item.id;
            const variantId = item.parentId ? item.id : undefined;
            if (item.type !== 'Service') {
                updateReservedStock(itemId, diff, `Quantity adjustment in ${type} Form`, variantId);
            }
        }

        const newItems = [...formData.items];
        newItems[idx].quantity = safeQty;

        if (item.parentId && (!newItems[idx].price || newItems[idx].price <= 0)) {
            const parentInv = inventory.find((i: Item) => i.id === item.parentId);
            const savedVariant = parentInv?.variants?.find((v: any) => v.id === item.id);
            if (savedVariant) {
                const restored = resolveStoredSellingPrice(savedVariant);
                if (restored > 0) {
                    newItems[idx].price = restored;
                    newItems[idx].selling_price = restored;
                    newItems[idx].calculated_price = resolveStoredCalculatedPrice(savedVariant) || restored;
                    newItems[idx].cost = resolveStoredCost(savedVariant) || 0;
                    newItems[idx].cost_price = resolveStoredCost(savedVariant) || 0;
                    newItems[idx].adjustmentSnapshots = resolveItemAdjustmentSnapshots(savedVariant);
                    newItems[idx].adjustmentTotal = Number(
                        savedVariant.smartPricingSnapshot?.marketAdjustmentTotal
                        ?? savedVariant.adjustmentTotal
                        ?? newItems[idx].adjustmentSnapshots.reduce((sum: number, snapshot: any) => sum + getSnapshotCalculatedAmount(snapshot), 0)
                    );
                }
            }
        }

        if ((!newItems[idx].price || newItems[idx].price <= 0) && item.type !== 'Service') {
            const baseItemId = item.parentId || item.id;
            const baseItem = inventory.find(i => i.id === baseItemId) || item;
            
            const activeAdjs: any[] = [];
            const marketAdjustmentsInput: any[] = [];

            const fallbackPrice = resolveStoredSellingPrice(baseItem);
            const priceData = Number(newItems[idx].price || fallbackPrice) > 0 ? {
                unitPrice: Number(newItems[idx].price || fallbackPrice),
                cost: Number(newItems[idx].cost || baseItem.cost),
                adjustmentTotal: 0,
                adjustmentSnapshots: []
            } : await calculateSellingPrice({
                itemId: baseItem.id,
                categoryId: baseItem.category,
                baseCost: Number(newItems[idx].cost || baseItem.cost) || 0,
                basePrice: Number(newItems[idx].price || baseItem.price) || undefined,
                quantity: safeQty,
                adjustments: marketAdjustmentsInput,
                context: 'ORDER',
                quantityTiers: baseItem?.volumePricing,
                allowQuantityTiering: baseItem?.allowVolumePricing,
            });

            newItems[idx].price = priceData.unitPrice;
            newItems[idx].cost = priceData.cost;
            newItems[idx].adjustmentSnapshots = priceData.adjustmentSnapshots;
            newItems[idx].adjustmentTotal = priceData.adjustmentTotal;
        }

        setFormData({ ...formData, items: newItems });
    };

    const handlePagesChange = async (idx: number, newPages: number) => {
        if (isPriceLocked) return;

        const item = formData.items[idx];
        const newItems = [...formData.items];
        newItems[idx].pagesOverride = newPages;

        if (item.type === 'Service' && !item.manual_override && !item.priceLocked) {
            const baseService = inventory.find((i: Item) => i.id === (item.itemId || item.id)) || item;
            const baseCost = Number(baseService.cost) || 0;
            try {
                const pricing = await calculateServicePrice({
                    itemId: baseService.id,
                    categoryId: baseService.category,
                    baseCost: baseCost,
                    pages: newPages,
                    copies: item.quantity || 1,
                    adjustments: [],
                    marketAdjustments: [],
                    context: 'SERVICE'
                });
                newItems[idx].price = pricing.unitPrice;
                newItems[idx].cost = pricing.cost;
                newItems[idx].basePrice = pricing.cost;
                newItems[idx].adjustmentSnapshots = pricing.adjustmentSnapshots;
                newItems[idx].adjustmentTotal = pricing.adjustmentTotal;
                newItems[idx].serviceDetails = {
                    ...item.serviceDetails,
                    pages: newPages,
                    copies: item.quantity,
                    totalPages: newPages * (item.quantity || 1),
                    unitPricePerCopy: pricing.unitPrice,
                    unitCostPerCopy: pricing.cost
                };
            } catch { /* keep existing pricing */ }
        }

        setFormData({ ...formData, items: newItems });
    };

    const handleRemoveItem = (idx: number) => {
        const item = formData.items[idx];
        const itemId = item.parentId || item.id;
        const variantId = item.parentId ? item.id : undefined;

        if (item.type !== 'Service') {
            updateReservedStock(itemId, -item.quantity, `Item removed from ${type} Form`, variantId);
        }

        setFormData({
            ...formData,
            items: formData.items.filter((_: any, i: number) => i !== idx)
        });
    };

    const recalculateCartPrices = (items: any[], tier: any, segment: string) => {
        return items.map((item: any) => {
            const basePrice = item.baseUnitPrice || item.price || 0;
            const adjusted = resolveCustomerPrice(basePrice, tier, segment);
            return {
                ...item,
                price: adjusted,
                unitPrice: adjusted,
                selling_price: adjusted,
                baseUnitPrice: basePrice,
                customerPriceAdjusted: true,
                customerPricingTier: tier?.id || '',
                customerPricingSegment: segment
            };
        });
    };

    const selectCustomer = async (name: string, customerId?: string) => {
        const normalizedName = name.trim();
        if (!normalizedName) return;
        const customer = customerId ? customers.find((c: any) => c.id === customerId) : findCustomerByName(normalizedName);
        const selectedName = customer?.name || normalizedName;
        const segment = customer?.segment || '';
        const tier = customer ? await getCustomerPricingTier(customer.id).catch(() => null) : null;

        const updatedItems = recalculateCartPrices(formData.items, tier, segment);

        setFormData({
            ...formData,
            customerName: selectedName,
            customerId: customer?.id || '',
            subAccountName: 'Main',
            billingAddress: customer?.billingAddress || customer?.address || formData.billingAddress || '',
            shippingAddress: customer?.shippingAddress || customer?.billingAddress || customer?.address || formData.shippingAddress || '',
            customerPhone: customer?.phone || formData.customerPhone || '',
            customerEmail: customer?.email || formData.customerEmail || '',
            customerPricingTier: tier?.id || '',
            customerPricingSegment: segment,
            items: updatedItems
        });
        setCustomerPanelOpen(false);

        if (customer && customer.creditLimit) {
            const outstanding = getCustomerOutstanding(selectedName);
            if (outstanding > customer.creditLimit) {
                notify(`Warning: ${selectedName} has exceeded their credit limit. Outstanding: ${currency}${outstanding.toLocaleString()}`, "warning");
            }
        }
    };

    const handleVoucherDateChange = (nextDate: string) => {
        setFormData((prev: any) => {
            if (!isRecurring) {
                return { ...prev, date: nextDate };
            }

            const currentDefault = getDefaultRecurringNextRunDate(prev.frequency || 'Monthly', prev.startDate || prev.date);
            const shouldRecalculateNextRunDate = !isEditing && (!prev.nextRunDate || prev.nextRunDate === currentDefault);

            return {
                ...prev,
                date: nextDate,
                startDate: prev.startDate || nextDate,
                nextRunDate: shouldRecalculateNextRunDate
                    ? getDefaultRecurringNextRunDate(prev.frequency || 'Monthly', prev.startDate || nextDate)
                    : prev.nextRunDate
            };
        });
    };

    const handleRecurringFrequencyChange = (nextFrequency: string) => {
        setFormData((prev: any) => {
            const currentDefault = getDefaultRecurringNextRunDate(prev.frequency || 'Monthly', prev.startDate || prev.date);
            const shouldRecalculateNextRunDate = !isEditing && (!prev.nextRunDate || prev.nextRunDate === currentDefault);

            return {
                ...prev,
                frequency: nextFrequency,
                nextRunDate: shouldRecalculateNextRunDate
                    ? getDefaultRecurringNextRunDate(nextFrequency, prev.startDate || prev.date)
                    : prev.nextRunDate
            };
        });
    };

    const handleRecurringStartDateChange = (nextStartDate: string) => {
        setFormData((prev: any) => {
            const currentDefault = getDefaultRecurringNextRunDate(prev.frequency || 'Monthly', prev.startDate || prev.date);
            const shouldRecalculateNextRunDate = !isEditing && (!prev.nextRunDate || prev.nextRunDate === currentDefault);

            return {
                ...prev,
                startDate: nextStartDate,
                nextRunDate: shouldRecalculateNextRunDate
                    ? getDefaultRecurringNextRunDate(prev.frequency || 'Monthly', nextStartDate)
                    : prev.nextRunDate
            };
        });
    };

    const addManualDate = () => {
        if (!manualDate || formData.scheduledDates.includes(manualDate)) return;
        setFormData({
            ...formData,
            scheduledDates: [...formData.scheduledDates, manualDate].sort()
        });
    };

    const removeManualDate = (date: string) => {
        setFormData({
            ...formData,
            scheduledDates: formData.scheduledDates.filter((d: string) => d !== date)
        });
    };

    const handleCancelForm = () => {
        formData.items.forEach((item: any) => {
            const itemId = item.parentId || item.id;
            const variantId = item.parentId ? item.id : undefined;
            if (item.type !== 'Service') {
                updateReservedStock(itemId, -item.quantity, `Form cancelled`, variantId);
            }
        });
        onCancel();
    };

    const toggleCustomerPanel = () => {
        if (!formData.customerName || formData.customerName === 'Cash') {
            setCustomerPanelOpen(false);
            return;
        }
        setCustomerPanelOpen(prev => !prev);
    };

    const isDuplicateInvoice = useMemo(() => {
        const invNo = formData.id?.trim();
        if (!invNo) return false;
        const allIds = new Set<string>();
        invoices?.forEach(i => allIds.add(i.id));
        quotations?.forEach(q => allIds.add(q.id));
        return allIds.has(invNo) && !isEditing;
    }, [formData.id, invoices, quotations, isEditing]);

    const ROUNDING_METHODS = [
        { value: 'Nearest', label: 'Nearest' },
        { value: 'Up', label: 'Always Up' },
        { value: 'Down', label: 'Always Down' },
        { value: 'Truncate', label: 'Truncate' },
    ];

    const applyRoundingToTotal = (value: number, method: string): { rounded: number; difference: number } => {
        if (!formData.roundingEnabled) return { rounded: value, difference: 0 };
        const step = companyConfig?.pricingSettings?.customStep || 1;
        let rounded: number;
        switch (method) {
            case 'Up': rounded = Math.ceil(value / step) * step; break;
            case 'Down': rounded = Math.floor(value / step) * step; break;
            case 'Truncate': rounded = Math.trunc(value / step) * step; break;
            default: rounded = Math.round(value / step) * step; break;
        }
        return { rounded, difference: rounded - value };
    };

    const roundOff = useMemo(() => {
        const preRound = analysis.subTotal - Number(formData.discount || 0) + (analysis.tax || 0) + Number(formData.otherCharges || 0) + calculatedOtherCharges;
        const { rounded, difference } = applyRoundingToTotal(preRound, formData.roundingMethod || 'Nearest');
        return difference;
    }, [analysis.subTotal, formData.discount, analysis.tax, formData.otherCharges, calculatedOtherCharges, formData.roundingMethod, formData.roundingEnabled]);

    const activeMarketAdjustments = useMemo(() => {
        return (marketAdjustments || []).filter((adj: any) => adj.active !== false && adj.isActive !== false);
    }, [marketAdjustments]);

    const selectedAdjustment = useMemo(() => {
        if (!formData.otherChargesAdjustment) return null;
        return activeMarketAdjustments.find((adj: any) => adj.id === formData.otherChargesAdjustment);
    }, [activeMarketAdjustments, formData.otherChargesAdjustment]);

    const handleCalculateCharges = () => {
        if (!selectedAdjustment || !formData.otherChargesEnabled) {
            setFormData((prev: any) => ({
                ...prev,
                items: (prev.items || []).map((item: any) => ({
                    ...item,
                    otherChargesAdjustment: 0
                }))
            }));
            notify('Select a market adjustment first', 'info');
            return;
        }

        const adj = selectedAdjustment;
        const isPercent = adj.type?.toUpperCase() === 'PERCENTAGE' || adj.type?.toUpperCase() === 'PERCENT';
        const adjValue = isPercent ? (adj.value || adj.percentage || 0) : (adj.value || 0);

        setFormData((prev: any) => ({
            ...prev,
            otherChargesPercent: isPercent ? adjValue : 0
        }));

        let totalAdjAmount = 0;
        const currentItems = [...formData.items];

        currentItems.forEach((item: any, idx: number) => {
            const itemPrice = Number(item.price) || 0;
            const itemQty = Number(item.quantity) || 1;
            let adjAmount = 0;

            if (isPercent) {
                adjAmount = itemPrice * (adjValue / 100);
            } else {
                adjAmount = adjValue / Math.max(1, currentItems.length);
            }

            const snapshots = Array.isArray(item.adjustmentSnapshots) ? [...item.adjustmentSnapshots] : [];
            snapshots.push({
                type: adj.type,
                name: adj.name || adj.type,
                value: adjValue,
                isPercent,
                calculatedAmount: adjAmount,
                timestamp: new Date().toISOString(),
                source: 'other_charges'
            });

            currentItems[idx] = {
                ...item,
                manual_override: true,
                otherChargesAdjustment: adjAmount,
                adjustmentSnapshots: snapshots
            };
            totalAdjAmount += adjAmount * itemQty;
        });

        setFormData((prev: any) => ({
            ...prev,
            otherChargesCalculated: totalAdjAmount,
            items: currentItems
        }));
        notify(`Other charges calculated: ${currency}${totalAdjAmount.toLocaleString()}`, 'success');
    };

    const scrollStyle = `.order-form-scroll::-webkit-scrollbar { width: 8px; }
.order-form-scroll::-webkit-scrollbar-track { background: #ede7db; border-radius: 10px; }
.order-form-scroll::-webkit-scrollbar-thumb { background: #72c0b7; border-radius: 10px; border: 2px solid #ede7db; background-clip: padding-box; }
.order-form-scroll::-webkit-scrollbar-thumb:hover { background: #3fa294; }`;

    return (
        <div style={{
            position: 'fixed', inset: 0, zIndex: 9999,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'rgba(15, 23, 42, 0.6)',
            padding: '40px 20px', fontFamily: "'Inter','DM Sans',sans-serif", fontSize: 13.5, color: '#23282A',
        }}>
            <style>{scrollStyle}</style>
            <div className="order-form-grid" style={{
                width: '100%', maxWidth: 1040,
                height: 'calc(100vh - 80px)',
                background: '#FEFDFB', borderRadius: 14,
                boxShadow: '0 30px 70px -20px rgba(0,0,0,.55), 0 8px 24px -8px rgba(0,0,0,.35), 0 0 0 1px rgba(255,255,255,.04)',
                display: 'grid', gridTemplateColumns: '266px 1fr',
                overflow: 'hidden', position: 'relative'
            }}>
                <div style={{
                    position: 'absolute', top: 0, left: 0, right: 0, height: 4, zIndex: 10,
                    background: 'linear-gradient(90deg, #146b60, #3fa294 40%, #d99a3f 100%)',
                }} />

                {/* DOCKET SIDEBAR */}
                <aside className="order-form-sidebar bg-[#FBF8F2] p-[20px_20px_14px] flex flex-col relative overflow-y-visible rounded-l-[14px] after:content-[''] after:absolute after:right-0 after:top-0 after:bottom-0 after:w-[1px] after:bg-[repeating-linear-gradient(#FEFDFB_50%,transparent_0%)] after:bg-[length:1px_14px] after:opacity-50">
                    <div className="text-[10.5px] font-bold tracking-[1.6px] uppercase text-[#666F6C] mb-[4px]">Sales Flow</div>
                    <div className="font-['DM_Serif_Display',serif] text-[27px] leading-[1.15] text-[#23282A] mb-[2px]">{type}</div>
                    <div className="font-['JetBrains_Mono',monospace] text-[13px] text-[#666F6C] tracking-[0.5px] mb-[12px]">#{formData.id}</div>

                    {formData.sourceRequestNumber && (
                        <div className="self-start border border-[#99f6e4] bg-[#f0fdfa] text-[#0f766e] text-[11px] font-bold tracking-[0.5px] px-[10px] py-[4px] rounded-[6px] mb-[12px] flex items-center gap-1.5">
                            <Link2 size={12} /> From {formData.sourceRequestNumber}
                        </div>
                    )}

                    {formData.status && (
                        <div className="self-start border-[2.5px] border-[#B8863B] text-[#B8863B] text-[12.5px] font-bold tracking-[2px] uppercase px-[14px] py-[6px] rounded-[6px] -rotate-6 mb-[12px] bg-[rgba(184,134,59,0.08)]">
                            {formData.status}
                        </div>
                    )}

                    <div className="docket-field mb-[10px] relative" ref={customerDropdownRef}>
                        <label className="block text-[10px] font-bold tracking-[0.8px] uppercase text-[#666F6C] mb-[3px]">Customer</label>
                        <div className="relative">
                            <input
                                type="text"
                                value={customerSearch || formData.customerName || ''}
                                onChange={e => { setCustomerSearch(e.target.value); setShowCustomerDropdown(true); }}
                                onFocus={() => setShowCustomerDropdown(true)}
                                onBlur={() => setTimeout(() => setShowCustomerDropdown(false), 200)}
                                placeholder="Search customer..."
                                className="w-full bg-white border border-[#E4DFD1] rounded-[7px] px-[10px] py-[8px] text-[13px] text-[#23282A] outline-none focus:border-[#146b60] focus:bg-[#eef7f6] transition-colors placeholder:text-[#666F6C] pr-8"
                            />
                            <Search size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#666F6C]" />
                        </div>
                        {showCustomerDropdown && (
                            <div className="absolute left-0 right-0 z-50 mt-1 bg-white border border-[#E4DFD1] rounded-[7px] shadow-lg max-h-[360px] overflow-y-auto">
                                {filteredCustomers.length > 0 ? filteredCustomers.map(c => (
                                    <button
                                        key={c.id}
                                        type="button"
                                        onMouseDown={e => { e.preventDefault(); selectCustomer(c.name, c.id); setCustomerSearch(''); setShowCustomerDropdown(false); }}
                                        className="w-full text-left px-[10px] py-[8px] text-[13px] text-[#23282A] hover:bg-[#eef7f6] transition-colors border-b border-[#E4DFD1]/50"
                                    >
                                        <div className="flex items-center justify-between">
                                            <span className="truncate">{c.name}</span>
                                            {(c.balance || c.outstandingBalance) ? (
                                                <span className={`ml-2 text-[11px] font-medium whitespace-nowrap ${(c.balance || c.outstandingBalance) > 0 ? 'text-red-500' : 'text-green-600'}`}>
                                                    {currency}{(c.balance || c.outstandingBalance).toLocaleString()}
                                                </span>
                                            ) : null}
                                        </div>
                                    </button>
                                )) : customerSearch.trim() ? null : (
                                    <div className="px-[10px] py-[8px] text-[13px] text-[#666F6C]">No customers found</div>
                                )}
                                {customerSearch.trim() && (
                                    <button
                                        type="button"
                                        onMouseDown={async e => {
                                            e.preventDefault();
                                            const name = customerSearch.trim();
                                            const newCustomer: Customer = {
                                                id: generateCustomerId(customers),
                                                name,
                                                email: '',
                                                phone: '',
                                                balance: 0,
                                                walletBalance: 0,
                                                creditLimit: 0,
                                                status: 'Active',
                                                segment: 'Individual',
                                                paymentTerms: getDefaultPaymentTermsForSegment('Individual'),
                                            };
                                            await addCustomer(newCustomer);
                                            setCustomerSearch('');
                                            setShowCustomerDropdown(false);
                                            selectCustomer(name, newCustomer.id);
                                        }}
                                        className="w-full text-left px-[10px] py-[8px] text-[13px] text-[#146b60] hover:bg-[#eef7f6] transition-colors font-medium border-t border-[#E4DFD1]/50"
                                    >
                                        + Add New Customer "{customerSearch.trim()}"
                                    </button>
                                )}
                            </div>
                        )}
                    </div>

                    <div className="docket-field mb-[10px]">
                        <label className="block text-[10px] font-bold tracking-[0.8px] uppercase text-[#666F6C] mb-[3px]">Voucher Date</label>
                        <input type="date" value={formData.date}
                            onChange={e => handleVoucherDateChange(e.target.value)}
                            className="w-full bg-white border border-[#E4DFD1] rounded-[7px] px-[10px] py-[8px] text-[13px] text-[#23282A] outline-none focus:border-[#146b60] focus:bg-[#eef7f6] transition-colors [color-scheme:dark]" />
                    </div>

                    <div className="docket-field mb-[10px]">
                        <label className="block text-[10px] font-bold tracking-[0.8px] uppercase text-[#666F6C] mb-[3px]">Due Date</label>
                        <input type="date" value={formData.dueDate}
                            onChange={e => setFormData({ ...formData, dueDate: e.target.value })}
                            className="w-full bg-white border border-[#E4DFD1] rounded-[7px] px-[10px] py-[8px] text-[13px] text-[#23282A] outline-none focus:border-[#146b60] focus:bg-[#eef7f6] transition-colors [color-scheme:dark]" />
                    </div>

                    <div className="docket-field mb-[10px]">
                        <label className="block text-[10px] font-bold tracking-[0.8px] uppercase text-[#666F6C] mb-[3px]">Reference</label>
                        <input type="text" placeholder="Reference..."
                            value={formData.referenceDoc || ''}
                            onChange={e => setFormData({ ...formData, referenceDoc: e.target.value })}
                            className="w-full bg-white border border-[#E4DFD1] rounded-[7px] px-[10px] py-[8px] text-[13px] text-[#23282A] outline-none placeholder:text-[#666F6C] focus:border-[#146b60] focus:bg-[#eef7f6] transition-colors" />
                    </div>

                    <div className="docket-field mb-[10px]">
                        <label className="block text-[10px] font-bold tracking-[0.8px] uppercase text-[#666F6C] mb-[3px]">Invoice Status</label>
                        <select value={type === 'Invoice' ? 'Invoice' : type === 'Quotation' ? 'Quotation' : type}
                            className="w-full bg-white border border-[#E4DFD1] rounded-[7px] px-[10px] py-[8px] text-[13px] text-[#23282A] outline-none transition-colors">
                            <option className="text-[#23282A]">{type === 'Invoice' ? 'Sales Invoice' : type === 'Quotation' ? 'Quotation' : type}</option>
                            <option className="text-[#23282A]">Proforma</option>
                            <option className="text-[#23282A]">Credit Note</option>
                        </select>
                    </div>

                    <div className="docket-field mb-[10px]">
                        <label className="block text-[10px] font-bold tracking-[0.8px] uppercase text-[#666F6C] mb-[3px]">Sales Account</label>
                        <div className="flex gap-[6px]">
                            <select value={formData.salesAccountId}
                                onChange={e => setFormData({ ...formData, salesAccountId: e.target.value })}
                                className="flex-1 bg-white border border-[#E4DFD1] rounded-[7px] px-[10px] py-[8px] text-[13px] text-[#23282A] outline-none focus:border-[#146b60] focus:bg-[#eef7f6] transition-colors">
                                {revenueAccounts.map(acc => (
                                    <option key={acc.id} value={acc.id} className="text-[#23282A]">{acc.name}</option>
                                ))}
                            </select>
                            <div className="flex items-center bg-white border border-[#E4DFD1] rounded-[7px] px-[10px] py-[8px] font-['JetBrains_Mono',monospace] text-[12.5px] text-[#23282A] whitespace-nowrap">
                                {(accountBalances[formData.salesAccountId] || 0) >= 0 ? '' : '-'}{companyConfig?.currencySymbol || '$'}{Math.abs(accountBalances[formData.salesAccountId] || 0).toLocaleString()}
                            </div>
                        </div>
                    </div>

                    <div className="flex-1"></div>
                    <div className="text-[10.5px] text-[#666F6C] leading-[1.5] pt-[16px] border-t border-dashed border-[#E4DFD1]">
                        Doc #{formData.id} &middot; issued from Sales Flow
                    </div>
                </aside>

                {/* MAIN CONTENT */}
                <div className="order-form-main flex flex-col min-w-0 min-h-0 h-full rounded-r-[14px]">
                    <div className="flex justify-end items-center px-[26px] pt-[16px]">
                        <div className="flex items-center gap-2">
                            {isPriceLocked && (
                                <button onClick={() => {
                                    setPriceUnlockReason('');
                                    setPriceUnlockModal({ open: true });
                                }}
                                    className="px-3 py-1.5 rounded-lg text-xs font-medium text-amber-600 bg-amber-50 border border-amber-200 hover:bg-amber-100 flex items-center gap-1.5">
                                    <ShieldCheck size={13} /> Unlock Price
                                </button>
                            )}
                            {onPreview && (
                                <button onClick={onPreview} className="px-3 py-1.5 rounded-lg text-xs font-medium text-slate-600 bg-white border border-[#E4DFD1] hover:border-[#72c0b7] hover:text-[#146b60] flex items-center gap-1.5 transition-colors">
                                    <Eye size={13} /> Preview
                                </button>
                            )}
                            <button onClick={handleCancelForm}
                                className="w-[30px] h-[30px] rounded-[8px] border border-[#E4DFD1] bg-[#FEFDFB] text-[#666F6C] text-[15px] flex items-center justify-center cursor-pointer hover:border-[#72c0b7] hover:text-[#146b60] transition-colors">
                                ✕
                            </button>
                        </div>
                    </div>

                    {isDuplicateInvoice && (
                        <div className="mx-[26px] mt-2 inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-red-50 text-red-600 border border-red-200">
                            <AlertCircle size={12} /> Duplicate invoice number
                        </div>
                    )}

                    <div className="flex-1 min-h-0 overflow-y-scroll px-[26px] pt-[6px] order-form-scroll" style={{ scrollbarWidth: 'thin', scrollbarColor: '#72c0b7 #ede7db' }}>

                        {formData.customerName && customerPanelOpen && (() => {
                            const cust = selectedCustomerObj;
                            if (!cust) return null;
                            const bal = getCustomerOutstanding(formData.customerName);
                            return (
                                <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
                                    <div className="flex items-center gap-2 mb-2">
                                        <Building2 size={15} className="text-indigo-500" />
                                        <span className="text-sm font-semibold text-slate-800">{formData.customerName}</span>
                                    </div>
                                    <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                                        <div className="flex justify-between py-0.5 border-b border-gray-100">
                                            <span className="text-slate-500">Balance</span>
                                            <span className={`font-medium ${bal > 0 ? 'text-red-600' : bal < 0 ? 'text-emerald-700' : 'text-slate-600'}`}>
                                                {bal > 0 ? `${currency}${bal.toLocaleString()} overdue` : bal < 0 ? `${currency}${Math.abs(bal).toLocaleString()} credit` : 'Settled'}
                                            </span>
                                        </div>
                                        <div className="flex justify-between py-0.5 border-b border-gray-100">
                                            <span className="text-slate-500">Credit Limit</span>
                                            <span className="font-medium text-slate-700">{currency}{(cust.creditLimit || 0).toLocaleString()}</span>
                                        </div>
                                        <div className="flex justify-between py-0.5 border-b border-gray-100">
                                            <span className="text-slate-500">Phone</span>
                                            <span className="font-medium text-slate-700">{cust.phone || '—'}</span>
                                        </div>
                                        <div className="flex justify-between py-0.5 border-b border-gray-100">
                                            <span className="text-slate-500">Email</span>
                                            <span className="font-medium text-slate-700">{cust.email || '—'}</span>
                                        </div>
                                        <div className="flex justify-between py-0.5">
                                            <span className="text-slate-500">Wallet</span>
                                            <span className="font-medium text-slate-700">{currency}{(cust.walletBalance || 0).toLocaleString()}</span>
                                        </div>
                                        <div className="flex justify-between py-0.5">
                                            <span className="text-slate-500">Segment</span>
                                            <span className="font-medium text-slate-700">{cust.segment || '—'}</span>
                                        </div>
                                    </div>
                                </div>
                            );
                        })()}

                        <div className="text-[11px] font-bold text-[#666F6C] uppercase tracking-[0.6px] px-[2px] py-[4px]">
                            Line Items
                        </div>

                        <div className="flex items-center gap-[6px] px-[2px] mb-[11px]">
                            <button type="button" onClick={() => handleQuickService('Photocopy')}
                                className="group inline-flex items-center gap-[6px] px-[10px] py-[5px] text-[11px] font-semibold text-[#666F6C] bg-white border border-[#E4DFD1] rounded-[6px] hover:border-[#72c0b7] hover:text-[#146b60] transition-all duration-200">
                                <span>Photocopy</span>
                            </button>
                            <button type="button" onClick={() => handleQuickService('Printing')}
                                className="group inline-flex items-center gap-[6px] px-[10px] py-[5px] text-[11px] font-semibold text-[#666F6C] bg-white border border-[#E4DFD1] rounded-[6px] hover:border-[#72c0b7] hover:text-[#146b60] transition-all duration-200">
                                <Printer size={13} className="shrink-0 text-[#B8863B] group-hover:text-[#146b60] group-hover:scale-110 transition-all" />
                                <span>Type &amp; Print</span>
                            </button>
                            {(type === 'Quotation' || type === 'Invoice') && (
                                <button type="button" onClick={() => setShowAiGenerator(!showAiGenerator)}
                                    className={`group inline-flex items-center gap-[6px] px-[10px] py-[5px] text-[11px] font-semibold border rounded-[6px] transition-all duration-200 ${showAiGenerator ? 'text-[#146b60] bg-[#eef7f6] border-[#146b60]' : 'text-[#666F6C] bg-white border-[#E4DFD1] hover:border-[#72c0b7] hover:text-[#146b60]'}`}>
                                    <Sparkles size={13} className={`shrink-0 transition-transform ${showAiGenerator ? 'text-[#146b60]' : 'text-[#B8863B] group-hover:scale-110'}`} />
                                    <span>AI {type === 'Invoice' ? 'Invoice' : 'Quote'}</span>
                                </button>
                            )}
                        </div>

                        <div className="search-row" style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"14px",marginBottom:"8px"}}>
                            <div className="search-box" style={{position:"relative"}} ref={itemDropdownRef}>
                                <span style={{position:"absolute",left:"12px",top:"50%",transform:"translateY(-50%)",fontSize:"11px",fontWeight:"700",textTransform:"uppercase",letterSpacing:"0.5px",color:"#146b60",background:"#FEFDFB",padding:"0 4px",zIndex:"1"}}>Item</span>
                                <input type="text" placeholder="Search inventory..."
                                    style={{width:"100%",padding:"7px 10px 7px 68px",fontFamily:"Inter,sans-serif",fontSize:"13px",border:"1px solid #E4DFD1",borderRadius:"9px",background:"#FEFDFB",outline:"none",transition:"border-color .15s ease"}}
                                    className="focus:border-[#146b60]"
                                    value={itemSearch}
                                    onFocus={() => setIsItemDropdownOpen(true)}
                                    onChange={e => { setItemSearch(e.target.value); setIsItemDropdownOpen(true); }}
                                    onKeyDown={e => handleItemKeyDown(e, filteredInventory, inventory)}
                                />
                                {isItemDropdownOpen && (
                                    <div className="absolute z-50 mt-[4px] w-full bg-[#FEFDFB] border border-[#E4DFD1] rounded-[6px] shadow-[0_8px_24px_-6px_rgba(16,43,40,0.15)] max-h-60 overflow-y-auto">
                                        {filteredInventory.length === 0 ? (
                                            <div className="p-[12px] text-center">
                                                <div className="text-[11px] text-[#666F6C] font-['JetBrains_Mono',monospace] mb-[6px]">No matching items</div>
                                                <button type="button" onClick={() => setShowCreateItemModal(true)}
                                                    className="inline-flex items-center gap-[4px] px-[10px] py-[5px] text-[11px] font-semibold text-white bg-[#146b60] rounded-[6px] hover:bg-[#0f544c] transition-colors">
                                                    <Plus size={12} />
                                                    <span>Create new item</span>
                                                </button>
                                            </div>
                                        ) : (
                                            filteredInventory.map(item => {
                                                const hasVariants = item.variants && item.variants.length > 0;
                                                const variantPrices = hasVariants ? item.variants.map((v: any) => Number(resolveStoredSellingPrice(v) || 0)) : [];
                                                const minPrice = hasVariants ? Math.min(...variantPrices) : 0;
                                                const stock = item.stock || 0;
                                                const isStockTracked = item.type === 'Stationery' || item.type === 'Raw Material';
                                                return (
                                                    <button
                                                        key={item.id}
                                                        onClick={() => {
                                                            handleAddItem(item);
                                                            setIsItemDropdownOpen(false);
                                                            setItemSearch('');
                                                        }}
                                                        className="w-full px-[10px] py-[7px] text-left hover:bg-[#F8F7F2] flex justify-between items-center border-b border-[#F0EFE8] last:border-b-0 transition-colors"
                                                    >
                                                        <div>
                                                            <div className="text-[12px] font-medium text-[#23282A]">{item.name}</div>
                                                            <div className="text-[9px] text-[#666F6C] font-['JetBrains_Mono',monospace]">{item.sku || 'NO-SKU'}</div>
                                                        </div>
                                                        <div className="text-right">
                                                        <div className="text-[12px] font-semibold text-[#23282A]">
                                                                {hasVariants
                                                                    ? <><span className="text-[10px] font-normal text-[#666F6C]">From </span>{currency}{minPrice.toLocaleString()} <span className="text-[9px] text-[#666F6C]">▼</span></>
                                                                    : `${currency}${Number(item.price || 0).toLocaleString()}`
                                                                }
                                                        </div>
                                                            {isStockTracked && (
                                                                <div className={`text-[9px] ${stock < 10 ? 'text-red-500 font-medium' : 'text-[#666F6C]'} font-['JetBrains_Mono',monospace]`}>
                                                                    {stock} left
                                                                </div>
                                                            )}
                                                        </div>
                                                    </button>
                                                );
                                            })
                                        )}
                                    </div>
                                )}
                            </div>
                            <div className="search-box" style={{position:"relative"}} ref={serviceDropdownRef}>
                                <span style={{position:"absolute",left:"12px",top:"50%",transform:"translateY(-50%)",fontSize:"11px",fontWeight:"700",textTransform:"uppercase",letterSpacing:"0.5px",color:"#146b60",background:"#FEFDFB",padding:"0 4px",zIndex:"1"}}>Services</span>
                                <input type="text" placeholder="Search services..."
                                    style={{width:"100%",padding:"7px 10px 7px 68px",fontFamily:"Inter,sans-serif",fontSize:"13px",border:"1px solid #E4DFD1",borderRadius:"9px",background:"#FEFDFB",outline:"none",transition:"border-color .15s ease"}}
                                    className="focus:border-[#146b60]"
                                    value={serviceSearch}
                                    onFocus={() => setIsServiceDropdownOpen(true)}
                                    onChange={e => { setServiceSearch(e.target.value); setIsServiceDropdownOpen(true); }}
                                />
                                {isServiceDropdownOpen && (
                                    <div className="absolute z-50 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-xl max-h-60 overflow-y-auto">
                                        {filteredServices.length === 0 ? (
                                            <div className="p-4 text-center text-xs text-slate-400">No matching services</div>
                                        ) : (
                                            filteredServices.map(item => (
                                                <button
                                                    key={item.id}
                                                    onClick={() => {
                                                        handleAddItem(item);
                                                        setIsServiceDropdownOpen(false);
                                                        setServiceSearch('');
                                                    }}
                                                    className="w-full px-3 py-2 text-left hover:bg-slate-50 flex justify-between items-center border-b border-gray-100 last:border-0"
                                                >
                                                    <div>
                                                        <div className="text-sm font-medium text-slate-700">{item.name}</div>
                                                        <div className="text-[10px] text-slate-400 font-mono">{item.sku || 'NO-SKU'}</div>
                                                    </div>
                                                    <div className="text-right">
                                                        <div className="text-sm font-semibold text-slate-800">
                                                            {currency}{Number((item.price || 0)).toLocaleString()}
                                                        </div>
                                                    </div>
                                                </button>
                                            ))
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="flex items-center gap-[8px] px-[2px] mb-[8px] text-[12px] font-medium text-[#23282A]">
                            <span className="text-[#666F6C]">Units left: <span className="font-medium text-[#23282A]">
                                {formData.items.length > 0 ? `${Math.min(...formData.items.map((i: any) => {
                                    const inv = inventory.find((inv: Item) => inv.id === (i.parentId || i.id));
                                    return inv?.stock ?? 0;
                                }))}` : '—'}
                            </span></span>
                            <span className="text-[#E4DFD1]">|</span>
                            <a href="#" className="text-[#146b60] hover:text-[#23282A] hover:underline" onClick={e => { e.preventDefault(); const match = itemSearch.trim() ? inventory.find((i: Item) => i.name.toLowerCase().includes(itemSearch.toLowerCase()) || i.sku.toLowerCase().includes(itemSearch.toLowerCase())) : null; setItemHistoryItemId(match?.id); setShowItemHistory(true); }}>
                                Alt+F2: Item History
                            </a>
                        </div>

                        {(type === 'Quotation' || type === 'Invoice') && showAiGenerator && (
                            <div className="mb-4">
                                <AIGeneratorCard
                                    type={type}
                                    onPopulate={(data) => {
                                        const normalize = (s: string) => s.toLowerCase().replace(/s$/, '');
                                        const matchedItems = data.items.map((item, idx) => {
                                            const desc = item.description.toLowerCase();
                                            const match = inventory.find((inv: any) => {
                                                const invName = inv.name?.toLowerCase() || '';
                                                return invName === desc ||
                                                    invName.includes(desc) ||
                                                    desc.includes(invName) ||
                                                    normalize(invName) === normalize(desc) ||
                                                    normalize(invName).includes(normalize(desc)) ||
                                                    normalize(desc).includes(normalize(invName));
                                            });
                                            if (match) {
                                                return {
                                                    id: `AI-${Date.now()}-${idx}`,
                                                    name: match.name,
                                                    description: item.description,
                                                    productId: match.id,
                                                    sku: match.sku || '',
                                                    quantity: item.quantity,
                                                    price: item.unitPrice,
                                                    unitPrice: item.unitPrice,
                                                    cost: match.cost || 0,
                                                    type: match.type || 'Service',
                                                    category: match.category || 'Service',
                                                    discount: 0,
                                                    taxRate: item.taxRate,
                                                    adjustmentSnapshots: [],
                                                    lineTotalNet: item.quantity * item.unitPrice,
                                                };
                                            }
                                            const similar = inventory.find((inv: any) => {
                                                const a = inv.name?.toLowerCase() || '';
                                                const words = desc.split(/\s+/);
                                                for (const word of words) {
                                                    if (word.length > 2 && a.includes(word)) return true;
                                                    if (word.length > 2 && normalize(a).includes(normalize(word))) return true;
                                                }
                                                const invWords = a.split(/\s+/);
                                                for (const w of invWords) {
                                                    if (w.length > 2 && desc.includes(w)) return true;
                                                    if (w.length > 2 && normalize(desc).includes(normalize(w))) return true;
                                                }
                                                return false;
                                            });
                                            return {
                                                id: `AI-${Date.now()}-${idx}`,
                                                name: similar ? similar.name : item.description,
                                                description: similar
                                                    ? `${item.description} was not found and was replaced with ${similar.name}`
                                                    : item.description,
                                                productId: similar?.id || '',
                                                sku: similar?.sku || '',
                                                quantity: item.quantity,
                                                price: item.unitPrice,
                                                unitPrice: item.unitPrice,
                                                cost: similar?.cost || 0,
                                                type: similar?.type || 'Service',
                                                category: similar?.category || 'Service',
                                                discount: 0,
                                                taxRate: item.taxRate,
                                                adjustmentSnapshots: [],
                                                lineTotalNet: item.quantity * item.unitPrice,
                                            };
                                        });
                                        setFormData((prev: any) => ({
                                            ...prev,
                                            customerName: data.customer.name || prev.customerName,
                                            billingAddress: data.customer.address || prev.billingAddress,
                                            shippingAddress: data.customer.address || prev.shippingAddress,
                                            items: matchedItems,
                                            discountType: data.discount.type === 'percentage' ? 'percentage' : 'fixed',
                                            discount: data.discount.value,
                                            notes: data.notes,
                                            dueDate: data.dueDate || prev.dueDate,
                                            paymentTerms: data.paymentTerms || prev.paymentTerms,
                                        }));
                                    }}
                                />
                            </div>
                        )}

                        {type === 'Recurring' && (
                            <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-4 space-y-4">
                                <div className="flex items-center gap-2">
                                    <RefreshCw size={15} className="text-indigo-600" />
                                    <span className="text-sm font-semibold text-slate-800">Subscription Settings</span>
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="text-xs text-slate-500 font-medium block mb-1">Billing Frequency</label>
                                        <select value={formData.frequency} onChange={e => handleRecurringFrequencyChange(e.target.value)} className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded-md focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-300 transition-colors">
                                            <option value="Daily">Daily</option>
                                            <option value="Weekly">Weekly</option>
                                            <option value="Monthly">Monthly</option>
                                            <option value="Quarterly">Quarterly</option>
                                            <option value="Annually">Annually</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className="text-xs text-slate-500 font-medium block mb-1">Status</label>
                                        <select value={formData.status} onChange={e => setFormData({ ...formData, status: e.target.value })} className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded-md focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-300 transition-colors">
                                            {RECURRING_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="text-xs text-slate-500 font-medium block mb-1">Start Date</label>
                                        <input type="date" value={formData.startDate} onChange={e => handleRecurringStartDateChange(e.target.value)} className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded-md focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-300 transition-colors" />
                                    </div>
                                    <div>
                                        <label className="text-xs text-slate-500 font-medium block mb-1">End Date</label>
                                        <input type="date" value={formData.endDate} min={formData.startDate || undefined} onChange={e => setFormData({ ...formData, endDate: e.target.value })} className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded-md focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-300 transition-colors" />
                                    </div>
                                    <div>
                                        <label className="text-xs text-slate-500 font-medium block mb-1">Next Billing Date</label>
                                        <input type="date" value={formData.nextRunDate} onChange={e => setFormData({ ...formData, nextRunDate: e.target.value })} className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded-md focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-300 transition-colors" />
                                    </div>
                                </div>
                                <div className="flex items-center gap-4">
                                    <label className="flex items-center gap-2 text-xs text-slate-600">
                                        <input type="checkbox" checked={formData.autoDeductWallet} onChange={e => setFormData({ ...formData, autoDeductWallet: e.target.checked })} className="rounded text-indigo-600" />
                                        Auto-Deduct from Wallet
                                    </label>
                                    <label className="flex items-center gap-2 text-xs text-slate-600">
                                        <input type="checkbox" checked={formData.autoEmail} onChange={e => setFormData({ ...formData, autoEmail: e.target.checked })} className="rounded text-indigo-600" />
                                        Auto-Email on Generation
                                    </label>
                                </div>
                            </div>
                        )}

                        <div className="bg-[#FEFDFB] border border-[#E4DFD1] rounded-[12px] overflow-hidden">
                            <div className="overflow-x-auto">
                                <table className="w-full">
                                    <colgroup>
                                        <col style={{width: '38%'}} />
                                        <col style={{width: '14%'}} />
                                        <col style={{width: '22%'}} />
                                        <col style={{width: '20%'}} />
                                        <col style={{width: '6%'}} />
                                    </colgroup>
                                    <thead>
                                        <tr className="text-[10.5px] font-bold text-[#0F3D3E] uppercase tracking-[0.7px] bg-[#eef7f6]">
                                            <th className="px-[12px] py-[6px] text-left border-b border-[#E4DFD1]">Item</th>
                                            <th className="px-[12px] py-[6px] text-center border-b border-[#E4DFD1]">Qty</th>
                                            <th className="px-[12px] py-[6px] text-right border-b border-[#E4DFD1]">Price</th>
                                            <th className="px-[12px] py-[6px] text-right border-b border-[#E4DFD1]">Amount</th>
                                            <th className="px-[12px] py-[6px] text-center border-b border-[#E4DFD1]"></th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-[#E4DFD1]">
                                        {analysis.processedItems.length === 0 ? (
                                            <tr>
                                                <td colSpan={5} className="px-[16px] py-[48px] text-center text-[#666F6C] text-[13px]">
                                                    <FileText size={20} className="mx-auto mb-[10px] opacity-40" />
                                                    Press Enter to add the first item
                                                </td>
                                            </tr>
                                        ) : (
                                            analysis.processedItems.map((item: CartItem, idx: number) => {
                                                const invItem = inventory.find((i: Item) => i.id === (item.parentId || item.id));
                                                const stock = invItem?.stock ?? 0;
                                                const qty = Number(item.quantity) || 0;
                                                return (
                                                    <tr key={idx} className="hover:bg-[#eef7f6] transition-colors border-b border-[#E4DFD1] last:border-b-0">
                                                        <td data-label="Item" className="px-[12px] py-[4px] text-[13px] text-[#23282A] font-medium flex items-center gap-[6px]">
                                                            {invItem?.image ? (
                                                                <button onClick={e => { e.stopPropagation(); setPhotoViewItem(invItem); }} className="shrink-0 w-7 h-7 rounded border border-teal-200 bg-teal-50 hover:border-teal-400 hover:shadow-sm transition-all flex items-center justify-center" title="View Details">
                                                                    <Package size={14} className="text-emerald-700"/>
                                                                </button>
                                                            ) : (
                                                                <span className="shrink-0 w-7 h-7 rounded border border-slate-100 flex items-center justify-center text-slate-300" title="No photo">
                                                                    <Image size={12} />
                                                                </span>
                                                            )}
                                                            <span>{item.name || invItem?.name || item.productName || 'Item'}</span>
                                                        </td>
                                                        <td data-label="Qty" className="px-2 py-1 text-center text-sm text-slate-800">
                                                            {item.id?.startsWith('QUICK-')
                                                                ? `${item.serviceDetails?.pages || item.pages || 0} pages`
                                                                : <input
                                                                    type="number"
                                                                    min={1}
                                                                    className={`w-16 text-center text-sm border border-gray-200 rounded px-1.5 py-1 bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-300 transition-colors ${qty > stock && stock > 0 ? 'text-red-600' : ''}`}
                                                                    value={qty}
                                                                    onChange={e => handleQuantityChange(idx, parseFloat(e.target.value) || 0)}
                                                                    disabled={isPriceLocked}
                                                                />}
                                                        </td>
                                                        <td data-label="Price" className="px-2 py-1 text-right text-sm text-slate-800">
                                                            {item.id?.startsWith('QUICK-')
                                                                ? (() => { const sheets = Math.ceil((item.serviceDetails?.pages || 1) / 2) * (item.serviceDetails?.copies || 1); return `${currency}${((item.price || 0) / sheets).toFixed(2)}/sheet`; })()
                                                                : <input
                                                                    type="number"
                                                                    min={0}
                                                                    step="0.01"
                                                                    className="w-24 text-right text-sm border border-gray-200 rounded px-1.5 py-1 bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-300 transition-colors"
                                                                    value={Number(item.price || 0)}
                                                                    onChange={e => {
                                                                        if (isPriceLocked) return;
                                                                        applyManualLineItemPrice(item.id, parseFloat(e.target.value) || 0);
                                                                    }}
                                                                    disabled={isPriceLocked}
                                                                />}
                                                        </td>
                                                        <td data-label="Amount" className="px-2 py-1 text-right text-sm font-semibold text-indigo-700">
                                                            {currency}{((Number(item.price) || 0) * qty).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                                        </td>
                                                        <td data-label="" className="px-2 py-1 text-center">
                                                            <button
                                                                onClick={() => handleRemoveItem(idx)}
                                                                disabled={isPriceLocked}
                                                                className="text-slate-300 hover:text-red-500 disabled:opacity-30 transition-colors"
                                                            >
                                                                <X size={14} />
                                                            </button>
                                                        </td>
                                                    </tr>
                                                );
                                            })
                                        )}
                                    </tbody>
                                </table>
                            </div>
                            <div className="flex items-center justify-between px-[14px] py-[10px] border-t border-[#E4DFD1] bg-gradient-to-r from-[rgba(20,107,96,0.03)] to-transparent">
                                <div className="flex items-center gap-[10px]">
                                    <div className="flex items-center gap-[6px] px-[8px] py-[3px] bg-[rgba(20,107,96,0.08)] border border-[rgba(20,107,96,0.15)] rounded-[5px]">
                                        <Package size={12} className="text-[#146b60]" />
                                        <span className="text-[11px] font-['JetBrains_Mono',monospace] font-semibold text-[#146b60]">
                                            {analysis.totalItems}
                                        </span>
                                        <span className="text-[10px] text-[rgba(20,107,96,0.6)] font-['JetBrains_Mono',monospace]">
                                            item{analysis.totalItems !== 1 ? 's' : ''}
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-[6px] px-[8px] py-[3px] bg-[rgba(15,61,62,0.06)] border border-[rgba(15,61,62,0.1)] rounded-[5px]">
                                        <Layers size={12} className="text-[#0F3D3E]" />
                                        <span className="text-[11px] font-['JetBrains_Mono',monospace] font-semibold text-[#0F3D3E]">
                                            {analysis.totalQty}
                                        </span>
                                        <span className="text-[10px] text-[rgba(15,61,62,0.5)] font-['JetBrains_Mono',monospace]">
                                            qty
                                        </span>
                                    </div>
                                </div>
                                <div className="flex items-center gap-[8px]">
                                    <span className="text-[10px] font-['JetBrains_Mono',monospace] font-medium text-[rgba(15,61,62,0.4)] uppercase tracking-[0.5px]">Subtotal</span>
                                    <span className="text-[17px] font-semibold text-[#23282A] tracking-[-0.3px]">
                                        {currency}{analysis.subTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                    </span>
                                </div>
                            </div>
                        </div>

                        {/* PERFORATION DIVIDER */}
                        <div style={{display:"flex",alignItems:"center",gap:"8px",margin:"26px -26px",padding:"0 26px"}}>
                            <span style={{width:"16px",height:"16px",borderRadius:"50%",background:"#FEFDFB",flex:"none"}}></span>
                            <span style={{flex:"1",height:"0",borderTop:"2px dashed #E4DFD1"}}></span>
                            <span style={{width:"16px",height:"16px",borderRadius:"50%",background:"#FEFDFB",flex:"none"}}></span>
                        </div>

                        <div className="bg-[#FEFDFB] border border-[#E4DFD1] rounded-[12px] overflow-hidden p-[22px]">
                        <div style={{display:"grid",gridTemplateColumns:"1.2fr 1fr",gap:"22px"}}>
                            <div className="pr-[14px] border-r border-[#E4DFD1]">
                                <div className="flex items-center gap-[6px] mb-[6px]">
                                    <input type="checkbox" className="rounded accent-[#146b60]"
                                        checked={formData.otherChargesEnabled}
                                        onChange={e => {
                                            setFormData((prev: any) => ({
                                                ...prev,
                                                otherChargesEnabled: e.target.checked,
                                                ...(e.target.checked ? {} : {
                                                    items: (prev.items || []).map((item: any) => ({
                                                        ...item,
                                                        otherChargesAdjustment: 0
                                                    }))
                                                })
                                            }));
                                        }}
                                    />
                                    <span className="text-[11px] font-medium text-[#23282A]">Other Charges</span>
                                    {formData.otherChargesEnabled && (
                                        <>
                                            <select className="text-[11px] border border-[#E4DFD1] rounded-[4px] px-[6px] py-[3px] bg-[#FEFDFB] flex-1 focus:border-[#72c0b7] outline-none transition-colors"
                                                value={formData.otherChargesAdjustment}
                                                onChange={e => {
                                                    const adj = activeMarketAdjustments.find((a: any) => a.id === e.target.value);
                                                    const val = adj ? (adj.type?.toUpperCase() === 'PERCENTAGE' || adj.type?.toUpperCase() === 'PERCENT' ? (adj.value || adj.percentage || 0) : 0) : 0;
                                                    setFormData({ ...formData, otherChargesAdjustment: e.target.value, otherChargesPercent: val });
                                                }}
                                            >
                                                <option value="">Select market adjustment...</option>
                                                {activeMarketAdjustments.length === 0 && (
                                                    <option value="" disabled>No adjustments available</option>
                                                )}
                                                {activeMarketAdjustments.map((adj: any) => {
                                                    const isPercent = adj.type?.toUpperCase() === 'PERCENTAGE' || adj.type?.toUpperCase() === 'PERCENT';
                                                    const val = isPercent ? (adj.value || adj.percentage || 0) : (adj.value || 0);
                                                    return (
                                                        <option key={adj.id} value={adj.id}>
                                                            {adj.name} {isPercent ? `(${val}%)` : `(${currency}${val})`}
                                                        </option>
                                                    );
                                                })}
                                            </select>
                                            {selectedAdjustment && formData.otherChargesPercent > 0 && (
                                                <span className="text-[11px] font-semibold text-[#146b60] whitespace-nowrap">{formData.otherChargesPercent}%</span>
                                            )}
                                            <button onClick={handleCalculateCharges} disabled={!formData.otherChargesAdjustment}
                                                className="px-[8px] py-[3px] text-[11px] font-medium text-white bg-[#146b60] rounded-[4px] hover:bg-[#146b60] disabled:opacity-40 flex items-center gap-[3px] transition-colors">
                                                <Calculator size={12} /> Calculate
                                            </button>
                                        </>
                                    )}
                                </div>
                                {formData.otherChargesEnabled && calculatedOtherCharges > 0 && (
                                    <div className="mb-[6px] text-[11px] text-[#146b60] font-medium bg-[rgba(20,107,96,0.08)] border border-[rgba(20,107,96,0.18)] rounded-[4px] px-[8px] py-[3px]">
                                        Adjustment applied: {currency}{calculatedOtherCharges.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                    </div>
                                )}
                                <div style={{display:"flex",alignItems:"center",gap:"8px",marginBottom:"16px"}}>
                                    <span style={{fontSize:"11px",fontWeight:"600",textTransform:"uppercase",letterSpacing:"0.5px",color:"#146b60",whiteSpace:"nowrap"}}>Discount</span>
                                    <div style={{display:"flex",alignItems:"center",gap:"6px",background:"#eef7f6",borderRadius:"8px",padding:"3px"}}>
                                        <button type="button" onClick={() => setFormData({ ...formData, discountType: 'fixed' })} style={{padding:"5px 10px",fontSize:"11px",fontWeight:"600",border:"none",borderRadius:"6px",cursor:"pointer",background:formData.discountType==='fixed'?'#146b60':'transparent',color:formData.discountType==='fixed'?'#fff':'#146b60',transition:"all 0.15s"}}>{currency}</button>
                                        <button type="button" onClick={() => setFormData({ ...formData, discountType: 'percentage' })} style={{padding:"5px 10px",fontSize:"11px",fontWeight:"600",border:"none",borderRadius:"6px",cursor:"pointer",background:formData.discountType==='percentage'?'#146b60':'transparent',color:formData.discountType==='percentage'?'#fff':'#146b60',transition:"all 0.15s"}}>%</button>
                                    </div>
                                    <div style={{position:"relative",flex:"1"}}>
                                        <input type="number" min="0" step="0.01" placeholder="0.00"
                                            value={formData.discount || ''}
                                            onChange={e => setFormData({ ...formData, discount: Math.max(0, Number(e.target.value) || 0) })}
                                            style={{width:"100%",fontFamily:"JetBrains Mono,monospace",fontSize:"13px",padding:"9px 34px 9px 12px",border:"1px solid #E4DFD1",borderRadius:"8px",background:"#FEFDFB",outline:"none"}}
                                            className="focus:border-[#146b60]"
                                        />
                                        <span style={{position:"absolute",right:"12px",top:"50%",transform:"translateY(-50%)",fontSize:"12px",fontWeight:"600",color:"#146b60"}}>{formData.discountType === 'percentage' ? '%' : currency}</span>
                                    </div>
                                </div>
                                <div className="notes-box">
                                    <textarea
                                        style={{width:"100%",minHeight:"82px",resize:"vertical",border:"1px solid #E4DFD1",borderRadius:"9px",background:"#FEFDFB",padding:"12px 14px",fontFamily:"Inter,sans-serif",fontSize:"13px",color:"#23282A",outline:"none"}}
                                        className="focus:border-[#146b60]"
                                        placeholder="Narration / notes..."
                                        value={formData.notes}
                                        onChange={e => setFormData({ ...formData, notes: e.target.value })}
                                    />
                                    <p style={{fontSize:"11px",color:"#666F6C",margin:"6px 0 0"}}>Ctrl+Enter for new line</p>
                                </div>
                            </div>
                            <div>
                                <div className="summary-card" style={{background:"#FBF8F2",border:"1.5px solid #0F3D3E",borderRadius:"10px",padding:"12px 14px",position:"relative"}}>
                                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"8px"}}>
                                        <span style={{fontSize:"10px",fontWeight:"600",textTransform:"uppercase",letterSpacing:"0.5px",color:"#146b60"}}>Round Up</span>
                                        <div className="flex items-center gap-[4px]">
                                            <select
                                                style={{fontFamily:"Inter,sans-serif",fontSize:"11px",padding:"4px 8px",border:"1px solid #E4DFD1",borderRadius:"7px",background:"#FEFDFB",color:"#23282A"}}
                                                value={formData.roundingMethod || 'Nearest'}
                                                onChange={e => setFormData({ ...formData, roundingMethod: e.target.value })}
                                            >
                                                {ROUNDING_METHODS.map(m => (
                                                    <option key={m.value} value={m.value}>{m.label}</option>
                                                ))}
                                            </select>
                                            <input type="checkbox" className="rounded accent-[#146b60]"
                                                checked={formData.roundingEnabled}
                                                onChange={e => setFormData({ ...formData, roundingEnabled: e.target.checked })}
                                            />
                                        </div>
                                    </div>
                                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"5px 0",borderBottom:"1px dashed #E4DFD1",fontSize:"12px"}}>
                                        <span style={{color:"#666F6C",fontWeight:"500"}}>Discount{formData.discountType === 'percentage' && formData.discount > 0 ? ` ${formData.discount}%` : ''}</span>
                                         <span style={{fontFamily:"JetBrains Mono,monospace",fontWeight:"600",color:"#146b60"}}>-{currency}{analysis.discountAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                                    </div>
                                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"5px 0",borderBottom:"1px dashed #E4DFD1",fontSize:"12px"}}>
                                        <span style={{color:"#666F6C",fontWeight:"500"}}>Other Charges</span>
                                        <span style={{fontFamily:"JetBrains Mono,monospace",fontWeight:"600",background:"#F7EFDF",padding:"2px 8px",borderRadius:"5px",color:"#B8863B"}}>{currency}{(Number(formData.otherCharges || 0) + calculatedOtherCharges).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                                    </div>
                                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"5px 0",borderBottom:"none",fontSize:"12px"}}>
                                        <span style={{color:"#666F6C",fontWeight:"500"}}>Round Off</span>
                                        <span style={{fontFamily:"JetBrains Mono,monospace",fontWeight:"600",color:"#23282A"}}>{roundOff.toFixed(2)}</span>
                                    </div>
                                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",marginTop:"8px",paddingTop:"8px",borderTop:"2px solid #0F3D3E"}}>
                                        <span style={{fontFamily:"DM Serif Display,serif",fontSize:"15px",color:"#23282A"}}>Total Amount</span>
                                        <span style={{fontFamily:"DM Serif Display,serif",fontSize:"25px",color:"#0F3D3E"}}>{currency}{(finalDisplayTotal + roundOff).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                        </div>
                    </div>
                    <div className="order-form-footer border-t border-[#E4DFD1] bg-[#FEFDFB] px-[26px] py-[16px] flex items-center justify-end gap-[10px] shrink-0">
                        <button onClick={handleCancelForm}
                            className="px-[14px] py-[7px] text-[13px] font-semibold text-[#23282A] bg-[#FEFDFB] border border-[#E4DFD1] rounded-[9px] hover:border-[#72c0b7] flex items-center gap-[7px] transition-colors">
                            <X size={14} /> Close
                        </button>
                        {isEditing && (
                            <input type="text" value={auditReason} onChange={e => setAuditReason(e.target.value)}
                                placeholder="Audit reason required (price unlock, quote override, etc.)"
                                className="w-[180px] text-[11px] border border-[#E4DFD1] rounded-[6px] px-[8px] py-[5px] bg-[#FEFDFB] placeholder:text-[#666F6C] font-['JetBrains_Mono',monospace] focus:border-[#B8863B] outline-none transition-colors"
                            />
                        )}
                        <button
                            onClick={() => handleSubmission(false, false)}
                            disabled={formData.items.length === 0 || (isEditing && !auditReason.trim()) || saving}
                            className="px-[16px] py-[7px] text-[13px] font-semibold text-white bg-gradient-to-br from-[#146b60] to-[#0b3e39] rounded-[9px] shadow-[0_4px_14px_rgba(20,107,96,0.35)] hover:shadow-[0_6px_18px_rgba(20,107,96,0.45)] hover:-translate-y-[0.5px] flex items-center gap-[7px] disabled:opacity-40 transition-all">
                            <Check size={14} /> Save &amp; Finalise
                        </button>
                    </div>
                </div>

                {selectedProductForVariants && (
                    <VariantSelectorModal
                        product={selectedProductForVariants}
                        onSelect={handleVariantSelect}
                        onClose={() => setSelectedProductForVariants(null)}
                    />
                )}
                {selectedServiceForCalculator && (
                    <ServiceCalculatorModal
                        service={selectedServiceForCalculator}
                        currencySymbol={currency}
                        initialPages={serviceInitialValues.pages}
                        initialCopies={serviceInitialValues.copies}
                        onConfirm={handleServicePricingConfirm}
                        onClose={() => {
                            setSelectedServiceForCalculator(null);
                            setServiceEditIndex(null);
                        }}
                    />
                )}
                {quickPrintModal.open && (
                    <QuickPrintModal
                        open={quickPrintModal.open}
                        onClose={() => setQuickPrintModal({ open: false, type: 'photocopy' })}
                        type={quickPrintModal.type}
                        pricePerPage={quickPrintModal.type === 'photocopy' 
                            ? (companyConfig.transactionSettings?.pos?.photocopyPrice ?? 2.00)
                            : (companyConfig.transactionSettings?.pos?.typePrintingPrice ?? 5.00)}
                        costPerPage={quickPrintModal.type === 'photocopy'
                            ? calculatePhotocopyCostPerPage(inventory)
                            : calculateTypePrintingCostPerPage(inventory)}
                        currency={currency}
                        staplePrice={companyConfig.transactionSettings?.pos?.staplePrice}
                        pinningItem={(() => {
                            const pinning = inventory.find(i => {
                                const name = i.name?.toLowerCase() || '';
                                return name.includes('staple') || /\bpins?\b/.test(name);
                            });
                            if (!pinning) return null;
                            const conversionRate = Number(pinning.conversionRate ?? pinning.conversion_rate ?? 1);
                            return {
                                costPerUnit: Number(pinning.cost_price ?? pinning.cost_per_unit ?? pinning.cost ?? 0),
                                conversionRate: conversionRate,
                                materialId: pinning.id
                            };
                        })()}
                        onConfirm={handleQuickPrintConfirm}
                    />
                )}
                {showItemHistory && (
                    <div className="fixed inset-0 z-[100] flex items-center justify-center" onClick={() => setShowItemHistory(false)} style={{background: 'rgba(15, 23, 42, 0.6)'}}>
                        <div className="bg-white rounded-xl shadow-2xl max-w-3xl w-full max-h-[80vh] overflow-hidden flex flex-col m-4" onClick={e => e.stopPropagation()}>
                            <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200 bg-slate-50">
                                <span className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                                    <History size={16} className="text-indigo-500" />
                                    Item History
                                    {itemHistoryItemId && (
                                        <span className="text-xs font-normal text-slate-400">
                                            #{inventory.find((i: Item) => i.id === itemHistoryItemId)?.sku ?? itemHistoryItemId}
                                        </span>
                                    )}
                                </span>
                                <button onClick={() => setShowItemHistory(false)} className="p-1 rounded-md hover:bg-slate-200 text-slate-400 hover:text-slate-600 transition-colors">
                                    <X size={16} />
                                </button>
                            </div>
                            <div className="flex-1 overflow-y-auto p-4">
                                {itemHistoryItemId ? (
                                    <InventoryTransactionHistory itemId={itemHistoryItemId} />
                                ) : (
                                    <div className="py-8 text-center text-sm text-slate-400">
                                        <History size={32} className="mx-auto mb-2 opacity-30" />
                                        Type an item name or SKU in the search box above, then press Alt+F2
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                )}
                {photoViewItem && (
                    <div className="fixed inset-0 z-[100] flex items-center justify-center" onClick={() => setPhotoViewItem(null)} style={{background: 'rgba(15, 23, 42, 0.6)'}}>
                        <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full overflow-hidden m-4" onClick={e => e.stopPropagation()}>
                            <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200 bg-slate-50">
                                <span className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                                    <Image size={16} className="text-indigo-500" />
                                    {photoViewItem.name}
                                    {photoViewItem.sku && (
                                        <span className="text-xs font-normal text-slate-400">#{photoViewItem.sku}</span>
                                    )}
                                </span>
                                <button onClick={() => setPhotoViewItem(null)} className="p-1 rounded-md hover:bg-slate-200 text-slate-400 hover:text-slate-600 transition-colors">
                                    <X size={16} />
                                </button>
                            </div>
                            <div className="p-4 flex items-center justify-center bg-slate-100 min-h-[300px]">
                                <OfflineImage src={photoViewItem.image} alt={photoViewItem.name} className="max-w-full max-h-[60vh] object-contain rounded-lg shadow-sm" fallback={
                                    <div className="flex flex-col items-center gap-2 text-slate-400 py-12">
                                        <Image size={48} className="opacity-30" />
                                        <span className="text-sm">No image available</span>
                                    </div>
                                } />
                            </div>
                        </div>
                    </div>
                )}
                {showCreateItemModal && (
                    <ItemModal
                        open={showCreateItemModal}
                        onClose={() => setShowCreateItemModal(false)}
                        onSave={handleCreateItemSave}
                        allItems={inventory}
                    />
                )}

                {priceUnlockModal.open && (
                    <div
                        className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200"
                        onClick={(e) => {
                            if (e.target === e.currentTarget) {
                                setPriceUnlockModal({ open: false });
                            }
                        }}
                    >
                        <div className="w-full max-w-md animate-in zoom-in-95 duration-200" role="dialog" aria-modal="true">
                            <div className="bg-white rounded-2xl shadow-2xl overflow-hidden">
                                <div className="flex items-center justify-between py-4 px-6 border-b border-slate-100">
                                    <h2 className="text-lg font-semibold text-slate-800">Price Unlock</h2>
                                    <button
                                        onClick={() => setPriceUnlockModal({ open: false })}
                                        className="text-slate-400 hover:text-slate-600 transition-colors text-xl font-bold"
                                        type="button"
                                        aria-label="Close"
                                    >
                                        ✕
                                    </button>
                                </div>

                                <div className="px-6 py-5">
                                    <p className="text-sm text-slate-600 leading-relaxed mb-4">
                                        Enter audit reason for price unlock:
                                    </p>
                                    <textarea
                                        value={priceUnlockReason}
                                        onChange={(e) => setPriceUnlockReason(e.target.value)}
                                        placeholder="Enter audit reason..."
                                        className="w-full min-h-[100px] p-3 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-y placeholder-slate-400"
                                        autoFocus
                                    />
                                </div>

                                <div className="flex items-center justify-end gap-3 px-6 py-4 bg-slate-50 border-t border-slate-100">
                                    <button
                                        onClick={() => setPriceUnlockModal({ open: false })}
                                        className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 hover:border-slate-300 transition-all"
                                        type="button"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        onClick={() => {
                                            if (priceUnlockReason.trim()) {
                                                setLocalUnlock(true);
                                                setAuditReason(priceUnlockReason.trim());
                                                notify("Price unlocked for revision", "info");
                                                setPriceUnlockModal({ open: false });
                                            }
                                        }}
                                        disabled={!priceUnlockReason.trim()}
                                        className="px-5 py-2 text-sm font-medium text-white bg-amber-600 rounded-xl hover:bg-amber-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                                        type="button"
                                    >
                                        Unlock
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

            </div>
        </div>
    );
};
