
import React, { useState, useEffect, useMemo } from 'react';
// PRICING RULE: Cost is calculated by Smart Pricing/BOM. Selling Price is user-entered.
//   Pricing engine returns raw (unrounded) prices. Display rounding via pricingDisplayService.
import { useAuth } from '../context/AuthContext';
import { useFinance } from '../context/FinanceContext';
import { useSales } from '../context/SalesContext';
import { useInventory } from '../context/InventoryContext';
import { useProduction } from '../context/ProductionContext';
import { CartItem, Item, Sale, PaymentDetail, HeldOrder, ZReport, BOMTemplate } from '../types';
import { ProductGrid } from './pos/components/ProductGrid';
import { CartSidebar } from './pos/components/CartSidebar';
import { PaymentModal } from './pos/components/PaymentModal';
import { CustomerModal, HeldOrdersModal, ReturnsModal, ServiceCalculatorModal } from './pos/components/PosModals';
import BatchPickerModal from './pos/components/BatchPickerModal';
import QuickPrintModal from '../components/QuickPrintModal';
import { inventoryTransactionService } from '../services/inventoryTransactionService';
import { resolveCustomerPrice, getApplicableDiscounts, applyDiscounts, incrementDiscountUsage, getCustomerPricingTier } from '../services/customerPricingService';
import { calculateItemTax } from '../services/taxRateService';
import { FileText, Printer, X, Plus, Clock as ClockIcon, User as UserIcon, Copy, TrendingUp, DollarSign, ShieldCheck, Landmark, RefreshCw, BookOpen, Eye, CheckCircle, FileDown, Gift } from 'lucide-react';
import { pdf } from '@react-pdf/renderer';
import { PrimeDocument } from './shared/components/PDF/PrimeDocument';
import { PreviewModal } from './shared/components/PDF/PreviewModal';
import { PosReceiptSchema, PrimeDocData } from './shared/components/PDF/schemas';
import { hardwareService } from '../services/hardwareService';
import { transactionService } from '../services/transactionService';
import { pricingService, DynamicServicePricingResult } from '../services/pricingService';
import { dbService } from '../services/db';
import { buildPosReceiptDoc } from '../services/receiptCalculationService';
import { api } from '../services/api';
import { customerNotificationService } from '../services/customerNotificationService';
import { logger } from '../services/logger';

import { generateNextId, roundToCurrency, formatNumber, downloadBlob } from '../utils/helpers';
import { attachDocumentSecurity } from '../utils/documentSecurity';
import { initializePrimePdfFonts, resolvePrimeTemplateSettings, getStoredCompanyConfig } from './shared/components/PDF/templateSettings';
import { resolveStoredCalculatedPrice, resolveStoredCost, resolveStoredRoundingDifference, resolveStoredSellingPrice, calculatePhotocopyCostPerPage, calculateTypePrintingCostPerPage } from '../utils/pricing';
import { calculateSellingPrice, calculateServicePrice } from '../utils/pricing/pricingEngine';
import { aggregateMarketAdjustmentSnapshots, attachPricingBreakdown, getMarketAdjustmentSnapshots, getSnapshotCalculatedAmount, resolveItemAdjustmentSnapshots, summarizePricingBreakdown } from '../utils/pricingBreakdown';
import { PrintingPOSIntegrator, isPrintingService, createProductionJobsFromSale } from '../components/printing/PrintingPOSIntegrator';
import { usePrintingStore } from '../stores/printingStore';

const POS: React.FC = () => {
  const { companyConfig, user, allUsers, notify, addAlert, updateCompanyConfig } = useAuth();
  const { sales, customers, parkOrder, heldOrders, retrieveOrder, generateZReport, fetchSalesData } = useSales();
  const { invoices, accounts } = useFinance();
  const { inventory, updateReservedStock } = useInventory();
  const { addBOM } = useProduction();
  const { postZReportToLedger, fetchFinanceData } = useFinance();
  const currency = companyConfig.currencySymbol;

  const [cart, setCart] = useState<CartItem[]>([]);
  const [selectedCustomerName, setSelectedCustomerName] = useState<string | null>(null);
  const [selectedSubAccount, setSelectedSubAccount] = useState<string>('Main');
  const [manualDiscountPercent, setManualDiscountPercent] = useState(0);

  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showReturnsModal, setShowReturnsModal] = useState(false);
  const [showCustomerModal, setShowCustomerModal] = useState(false);
  const [showHeldOrdersModal, setShowHeldOrdersModal] = useState(false);
  const [showZReport, setShowZReport] = useState(false);
  const [selectedServiceForCalculator, setSelectedServiceForCalculator] = useState<Item | null>(null);
  const [selectedPrintingService, setSelectedPrintingService] = useState<Item | null>(null);
  const [autoPreviewReceipt, setAutoPreviewReceipt] = useState(companyConfig?.transactionSettings?.showReceiptPreview !== false);
  const [quickReceiptSale, setQuickReceiptSale] = useState<Sale | null>(null);

  const [batchPickerState, setBatchPickerState] = useState<{
    item: Item;
    resolve: (selections: any[]) => void;
  } | null>(null);
    
    const handleConfigureService = (service: Item) => {
        if (isPrintingService(service)) {
            setSelectedPrintingService(service);
        } else {
            setSelectedServiceForCalculator(service);
        }
    };
  const [quickPrintModal, setQuickPrintModal] = useState<{ open: boolean; type: 'photocopy' | 'printing' }>({
    open: false,
    type: 'photocopy'
  });
  const [giftCardModal, setGiftCardModal] = useState(false);
  const [giftCardForm, setGiftCardForm] = useState({ amount: 50, message: '', color: '#10b981' });
  const [selectedSalesAccountId, setSelectedSalesAccountId] = useState('4000');
  const [bomTemplates, setBomTemplates] = useState<BOMTemplate[]>([]);

  const [lastSale, setLastSale] = useState<Sale | null>(null);
  const [zReportData, setZReportData] = useState<ZReport | null>(null);
  const [isClosingDrawer, setIsClosingDrawer] = useState(false);
  const [previewState, setPreviewState] = useState<{ isOpen: boolean, data: any, type: 'POS_RECEIPT' }>({
    isOpen: false,
    data: null,
    type: 'POS_RECEIPT'
  });

  const getPosReceiptFooter = () =>
    companyConfig.transactionSettings?.pos?.receiptFooter || companyConfig.receiptFooter || '';

  const buildValidatedPosReceipt = (sale: Sale) => {
    const receipt = buildPosReceiptDoc({
      sale,
      cashierName: (() => {
        const cashierUser = allUsers?.find(u => u.id === sale.cashierId);
        return cashierUser?.name || cashierUser?.fullName || cashierUser?.username || user?.name || 'Cashier';
      })(),
      customerName: sale.customerName || 'Walk-in Customer',
      itemDescriptionFormatter: formatServiceDescription,
      footerMessage: getPosReceiptFooter(),
      companyConfig
    });

    const parsed = PosReceiptSchema.safeParse(receipt);
    if (!parsed.success) {
      const message = parsed.error.issues[0]?.message || 'Invalid POS receipt payload';
      throw new Error(`POS receipt validation failed: ${message}`);
    }

    return parsed.data;
  };

  useEffect(() => {
    let mounted = true;
    dbService.getAll<BOMTemplate>('bomTemplates')
      .then((templates) => {
        if (mounted) setBomTemplates(templates || []);
      })
      .catch((err) => {
        logger.error('Failed to load BOM templates for POS service pricing', err);
      });
    return () => {
      mounted = false;
    };
  }, []);

  const formatServiceDescription = (lineItem: any) => {
    // If it already has a detailed description (like from Quick Print), use it
    if (lineItem?.desc) return lineItem.desc;

    const service = lineItem?.serviceDetails;
    const name = lineItem?.name || lineItem?.productName || 'Service';
    if (!service) return name;

    // Use single line format for POS receipts to ensure visibility and follow OrderForm pattern
    return `${name} (${service.pages || 0} pages x ${service.copies || 0} copies)`;
  };

  const upsertDynamicServiceInCart = async (service: Item, pricing: DynamicServicePricingResult) => {
    const lineId = `${service.id}::${pricing.pages}`;
    const adjs = pricing.adjustmentSnapshots || [];
    const adjTotal = adjs.reduce((s: number, a: any) => s + (a.calculatedAmount || 0), 0);
    const baseCartItem = { ...service, id: lineId, itemId: service.id, productId: service.id, quantity: pricing.copies, price: pricing.unitPricePerCopy, cost: pricing.unitCostPerCopy, marginAmount: pricing.marginAmount, rounding_difference: pricing.rounding_difference, calculated_price: pricing.unitPricePerCopy - (pricing.rounding_difference || 0), basePrice: pricing.unitCostPerCopy, pagesOverride: pricing.pages, adjustmentSnapshots: adjs, adjustmentTotal: adjTotal, serviceDetails: pricing.serviceDetails, priceLocked: pricing.priceLocked || false, lockedTotalPrice: pricing.lockedTotalPrice, lockedUnitPricePerCopy: pricing.lockedUnitPricePerCopy, lockedUnitCostPerCopy: pricing.lockedUnitCostPerCopy } as CartItem;

    setCart(prev => {
      const existing = prev.find(i => i.id === lineId);
      if (!existing) return [...prev, baseCartItem];
      const updatedCopies = (existing.quantity || 0) + pricing.copies;
      return prev.map(i => i.id === lineId ? {
        ...i, quantity: updatedCopies, pagesOverride: pricing.pages, adjustmentSnapshots: adjs, adjustmentTotal: adjTotal,
        ...(pricing.priceLocked && pricing.lockedUnitPricePerCopy !== undefined
          ? { price: pricing.lockedUnitPricePerCopy, cost: pricing.lockedUnitCostPerCopy || i.cost, basePrice: pricing.lockedUnitCostPerCopy || i.basePrice, priceLocked: true, lockedTotalPrice: pricing.lockedTotalPrice, lockedUnitPricePerCopy: pricing.lockedUnitPricePerCopy, lockedUnitCostPerCopy: pricing.lockedUnitCostPerCopy, serviceDetails: pricing.serviceDetails }
          : { price: pricing.unitPricePerCopy, cost: pricing.unitCostPerCopy || i.cost, basePrice: pricing.unitCostPerCopy || i.basePrice, serviceDetails: { pages: pricing.pages, copies: updatedCopies, totalPages: pricing.pages * updatedCopies, unitCostPerPage: (pricing.unitCostPerCopy || 0) / pricing.pages, unitPricePerCopy: pricing.unitPricePerCopy, unitCostPerCopy: pricing.unitCostPerCopy, totalCost: pricing.unitCostPerCopy * updatedCopies, totalPrice: pricing.unitPricePerCopy * updatedCopies } })
      } : i);
    });
  };

  const handleDownloadReceipt = async (sale: Sale) => {
    try {
      notify("Preparing Receipt PDF...", "info");

      const pdfData = buildValidatedPosReceipt(sale);
      await initializePrimePdfFonts();
      const securedPdfData = await attachDocumentSecurity(pdfData, companyConfig?.companyName);
      const blob = await pdf(<PrimeDocument data={securedPdfData as PrimeDocData} type="POS_RECEIPT" />).toBlob();
      const receiptNumber = sale.receiptNumber || sale.id || '';
      const fileName = receiptNumber ? `Receipt - ${receiptNumber}.pdf` : `Receipt.pdf`;
      downloadBlob(blob, fileName);
      notify("Receipt PDF downloaded successfully", "success");
    } catch (error) {
      logger.error("PDF generation failed:", error);
      notify("Failed to generate PDF", "error");
    }
  };

  // Apply default customer from settings
  useEffect(() => {
    const defaultCustId = companyConfig.transactionSettings?.posDefaultCustomer;
    if (defaultCustId && !selectedCustomerName) {
      const defaultCust = customers.find(c => c.id === defaultCustId || c.name === defaultCustId);
      if (defaultCust) {
        setSelectedCustomerName(defaultCust.name);
      }
    }
  }, [companyConfig.transactionSettings?.posDefaultCustomer, customers]);

  // Global Keyboard Shortcuts for POS
  useEffect(() => {
    if (companyConfig.transactionSettings?.pos?.enableShortcuts === false) return;

    const handleGlobalPOS = (e: KeyboardEvent) => {
      if (e.key === 'F1') { e.preventDefault(); setShowCustomerModal(true); }
      if (e.key === 'F2') { e.preventDefault(); handleQuickPhotocopy(); }
      if (e.key === 'F3') { e.preventDefault(); handleQuickTypePrinting(); }
      if (e.key === 'F10') { e.preventDefault(); handlePay(); }
      if (e.ctrlKey && e.key === 'h') { e.preventDefault(); handleParkOrder(); }
    };
    window.addEventListener('keydown', handleGlobalPOS);
    return () => window.removeEventListener('keydown', handleGlobalPOS);
  }, [cart, selectedCustomerName, companyConfig.transactionSettings?.pos?.enableShortcuts]);

  const handlePay = () => {
    if (cart.length === 0) return;
    if (companyConfig.transactionSettings?.pos?.requireCustomer && !selectedCustomerName) {
      notify("Customer selection is required for this transaction", "error");
      setShowCustomerModal(true);
      return;
    }
    setShowPaymentModal(true);
  };

  const round2 = (v: number) => Math.round(v * 100) / 100;

  const { total, processedItems } = useMemo(() => {
    const items = cart.map(item => {
      const itemCost = Number(item.cost || item.cost_price || 0);
      const itemPrice = Number(item.price || 0);
      const itemQty = Number(item.quantity || 1);
      const marginPerItem = Number((item as CartItem & Record<string, unknown>).marginAmount) || (itemPrice - itemCost);
      return {
        ...item,
        totalAmount: round2(itemPrice * itemQty),
        _calcMargin: round2(marginPerItem * itemQty)
      };
    });

    const subTotal = items.reduce((sum, i) => sum + i.totalAmount, 0);
    const finalTotal = round2(subTotal);

    return {
      total: finalTotal,
      processedItems: items
    };
  }, [cart]);

  const manualDiscountAmount = manualDiscountPercent > 0 ? round2(total * (manualDiscountPercent / 100)) : 0;
  const payableTotal = round2(total - manualDiscountAmount);
  const pricingSummary = useMemo(() => summarizePricingBreakdown(cart), [cart]);

  // Calculate adjustment summary from cart items for display in totals section
  const cartAdjustmentSummary = useMemo(() => {
    const summary: { adjustmentId: string; adjustmentName: string; totalAmount: number; itemCount: number }[] = [];
    const seen = new Map<string, number>();

    cart.forEach(item => {
      const snapshots = getMarketAdjustmentSnapshots(resolveItemAdjustmentSnapshots(item));
      snapshots.forEach((snapshot: any) => {
        const key = snapshot.adjustmentId || snapshot.name || 'Unknown';
        if (!seen.has(key)) {
          seen.set(key, summary.length);
          summary.push({
            adjustmentId: snapshot.adjustmentId || key,
            adjustmentName: snapshot.name || key,
            totalAmount: 0,
            itemCount: 0
          });
        }
        const idx = seen.get(key)!;
        summary[idx].totalAmount += getSnapshotCalculatedAmount(snapshot) * (item.quantity || 1);
        summary[idx].itemCount += item.quantity || 1;
      });
    });

    return summary.filter((entry) => Math.abs(entry.totalAmount) > 0.0001);
  }, [cart]);

  const roundingAccumulation = Number(pricingSummary.roundingTotal || 0);

  const buildStoredPricingState = (source: any, fallbackCost: number, adjustmentTotalValue: number) => {
    const storedSellingPrice = resolveStoredSellingPrice(source);
    const storedCalculatedPrice = resolveStoredCalculatedPrice(source);
    const storedRoundingDifference = resolveStoredRoundingDifference(source);
    const normalizedPrice = storedSellingPrice > 0
      ? storedSellingPrice
      : roundToCurrency(storedCalculatedPrice + storedRoundingDifference);
    const normalizedCalculatedPrice = storedCalculatedPrice > 0
      ? storedCalculatedPrice
      : roundToCurrency(normalizedPrice - storedRoundingDifference);
    const normalizedRoundingDifference = roundToCurrency(
      storedRoundingDifference || (normalizedPrice - normalizedCalculatedPrice)
    );

    return {
      price: normalizedPrice,
      calculatedPrice: normalizedCalculatedPrice,
      roundingDifference: normalizedRoundingDifference,
      marginAmount: roundToCurrency(normalizedPrice - fallbackCost - adjustmentTotalValue - normalizedRoundingDifference)
    };
  };

  const commitAddToCart = async (item: any, batchSelections?: { batchId: string; batchNumber: string; quantity: number }[], absoluteQty?: boolean) => {
    if (item.type !== 'Service') {
      updateReservedStock(item.parentId || item.id, 1, 'POS Cart Addition', item.parentId ? item.id : undefined);
    }

    // Resolve customer pricing tier if customer is selected
    let customerPriceMultiplier = 1;
    if (selectedCustomerName && selectedCustomerName !== 'Walk-in') {
      const cust = (customers || []).find((c: any) => c.name === selectedCustomerName);
      if (cust) {
        try {
          const tier = await getCustomerPricingTier(cust.id);
          const basePrice = 100; // unit placeholder to get multiplier
          const adjusted = resolveCustomerPrice(basePrice, tier, cust.segment || '');
          customerPriceMultiplier = adjusted / basePrice;
        } catch { /* fall through */ }
      }
    }

    const baseItem = item.parentId ? inventory.find(i => i.id === item.parentId) || item : item;
    const variantId = item.parentId ? item.id : undefined;

    const existing = cart.find(i => i.id === item.id);
    const newQty = absoluteQty ? (item.quantity || 1) : (existing ? (existing.quantity + 1) : 1);
    const basePrice = resolveStoredSellingPrice(baseItem);

    const activeAdjs: any[] = [];
    const marketAdjustmentsInput: any[] = [];
    const marketAdjustmentTotal = marketAdjustmentsInput.reduce((sum: number, adj: any) => sum + (adj.calculatedAmount || 0), 0);
    const baseStoredCost = resolveStoredCost(baseItem) || Number(baseItem.cost || 0);
    const baseStoredPricing = buildStoredPricingState(baseItem, baseStoredCost, marketAdjustmentTotal);

    // For variants: use the stored selling price directly — it was already computed by
    // the SmartPricing engine and stored on the variant. Re-running calculateSellingPrice
    // with the parent's cost (which is 0 for SmartPricing products) produces K0.
    const isVariant = Boolean(item.parentId);
    const variantStoredPrice = resolveStoredSellingPrice(item);
    const variantStoredCost = resolveStoredCost(item);
    const variantAdjSnaps = resolveItemAdjustmentSnapshots(item);
    const variantAdjTotal = Number(
      item.smartPricingSnapshot?.marketAdjustmentTotal
      ?? item.adjustmentTotal
      ?? variantAdjSnaps.reduce((sum: number, snapshot: any) => sum + getSnapshotCalculatedAmount(snapshot), 0)
    );

    let resolvedPrice: number;
    let resolvedCost: number;
    let resolvedAdjTotal: number;
    let resolvedAdjSnaps: any[];
    let marginAmount = 0;
    let roundingDifference = 0;
    let calculatedPrice = 0;

    if (isVariant && variantStoredPrice > 0) {
      // Use variant's pre-computed price — no recalculation needed
      const variantStoredPricing = buildStoredPricingState(item, variantStoredCost, variantAdjTotal);
      resolvedPrice = variantStoredPricing.price || variantStoredPrice;
      resolvedCost = variantStoredCost;
      resolvedAdjTotal = variantAdjTotal;
      resolvedAdjSnaps = variantAdjSnaps;
      marginAmount = variantStoredPricing.marginAmount;
      roundingDifference = variantStoredPricing.roundingDifference;
      calculatedPrice = variantStoredPricing.calculatedPrice;
    } else if (basePrice != null && basePrice > 0) {
      // Pricing engine returns empty snapshots when basePrice exists
      // Use our marketAdjustmentsInput as the adjustment snapshots
      resolvedPrice = baseStoredPricing.price || basePrice;
      resolvedCost = baseStoredCost;
      resolvedAdjTotal = marketAdjustmentTotal;
      resolvedAdjSnaps = marketAdjustmentsInput;
      marginAmount = baseStoredPricing.marginAmount;
      roundingDifference = baseStoredPricing.roundingDifference;
      calculatedPrice = baseStoredPricing.calculatedPrice;
    } else {
      // Non-variant or variant without stored price — run the engine
      const parentFallbackPrice = resolveStoredSellingPrice(baseItem) || Number(baseItem.price) || 0;
      const pricing = await calculateSellingPrice({
        itemId: baseItem.id,
        categoryId: baseItem.category,
        baseCost: isVariant ? variantStoredCost : Number(baseItem.cost),
        basePrice: (isVariant ? (variantStoredPrice > 0 ? variantStoredPrice : (parentFallbackPrice > 0 ? parentFallbackPrice : undefined)) : (parentFallbackPrice > 0 ? parentFallbackPrice : undefined)),
        quantity: newQty,
        adjustments: marketAdjustmentsInput,
        context: 'POS',
        quantityTiers: baseItem?.volumePricing,
        allowQuantityTiering: baseItem?.allowVolumePricing,
      });
      resolvedPrice = pricing.unitPrice;
      resolvedCost = pricing.cost;
      resolvedAdjTotal = pricing.adjustmentTotal;
      resolvedAdjSnaps = pricing.adjustmentSnapshots;
      marginAmount = pricing.marginAmount || 0;
      roundingDifference = pricing.roundingDifference || 0;
      calculatedPrice = pricing.unitPrice - (pricing.roundingDifference || 0);
    }

    // Apply customer-specific pricing multiplier
    const finalPrice = round2(resolvedPrice * customerPriceMultiplier);
    const isCustomerPriced = customerPriceMultiplier !== 1 && selectedCustomerName && selectedCustomerName !== 'Walk-in';

    const originalPrice = resolveStoredSellingPrice(item) || 0;
    let productionCostSnapshot = item.productionCostSnapshot;

    setCart(prev => {
      if (existing) {
        return prev.map(i => i.id === item.id ? {
          ...i,
          quantity: newQty,
          price: finalPrice,
          selling_price: finalPrice,
          originalPrice,
          baseUnitPrice: resolvedPrice,
          cost: resolvedCost,
          cost_price: resolvedCost,
          adjustmentTotal: resolvedAdjTotal,
          adjustmentSnapshots: resolvedAdjSnaps,
          productionCostSnapshot,
          marginAmount,
          rounding_difference: roundingDifference,
          calculated_price: calculatedPrice,
          batchSelections: batchSelections || i.batchSelections,
          customerPriceAdjusted: isCustomerPriced
        } : i);
      }
      return [...prev, {
        ...item,
        quantity: newQty,
        price: finalPrice,
        selling_price: finalPrice,
        originalPrice,
        baseUnitPrice: resolvedPrice,
        cost: resolvedCost,
        cost_price: resolvedCost,
        adjustmentTotal: resolvedAdjTotal,
        adjustmentSnapshots: resolvedAdjSnaps,
        productionCostSnapshot,
        marginAmount,
        rounding_difference: roundingDifference,
        calculated_price: calculatedPrice,
        batchSelections: batchSelections || item.batchSelections,
        customerPriceAdjusted: isCustomerPriced
      }];
    });
  };

  const addToCart = async (item: any) => {
    const baseItem = item.parentId ? inventory.find(i => i.id === item.parentId) || item : item;
    const isBatchControlled = baseItem.batchControlled || item.batchControlled;

    if (isBatchControlled && item.type !== 'Service') {
      const existing = cart.find(i => i.id === item.id);
      const newQty = existing ? (existing.quantity + 1) : 1;

      const batchPromise = new Promise<any[]>((resolve) => {
        setBatchPickerState({ item: { ...item, quantity: newQty }, resolve });
      });
      const selections = await batchPromise;
      setBatchPickerState(null);

      if (selections.length > 0) {
        await commitAddToCart({ ...item, quantity: newQty, batchSelections: selections }, undefined, true);
      } else {
        await commitAddToCart({ ...item, quantity: newQty }, undefined, true);
      }
      return;
    }

    await commitAddToCart(item);
  };

  const handleQuickPhotocopy = () => {
    setQuickPrintModal({ open: true, type: 'photocopy' });
  };

  const handleQuickTypePrinting = () => {
    setQuickPrintModal({ open: true, type: 'printing' });
  };

  const handleSellGiftCard = () => {
    if (giftCardForm.amount <= 0) return
    const gcCode = `GC-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substr(2, 6).toUpperCase()}`
    const giftItem: any = {
      id: `GIFT-${Date.now()}`,
      itemId: 'GIFT-CARD',
      name: `Gift Card $${giftCardForm.amount}`,
      type: 'Service',
      price: giftCardForm.amount,
      quantity: 1,
      isGiftCard: true,
      giftCardCode: gcCode,
      giftCardAmount: giftCardForm.amount,
      giftCardMessage: giftCardForm.message,
      giftCardColor: giftCardForm.color,
      priceLocked: true,
    }
    commitAddToCart(giftItem)
    setGiftCardModal(false)
    setGiftCardForm({ amount: 50, message: '', color: '#10b981' })
  }

const handleQuickPrintConfirm = (quantity: number, pagesPerCopy: number, total: number, printType: 'photocopy' | 'printing', pinningCost?: number, pinningCount?: number) => {
        const isPhotocopy = printType === 'photocopy';
        const pricePerPage = isPhotocopy 
          ? (companyConfig.transactionSettings?.pos?.photocopyPrice ?? 2.00)
          : (companyConfig.transactionSettings?.pos?.typePrintingPrice ?? 5.00);

        const costPerPage = isPhotocopy
          ? calculatePhotocopyCostPerPage(inventory)
          : calculateTypePrintingCostPerPage(inventory);

        const totalPages = pagesPerCopy * quantity;
        const totalSheets = isPhotocopy ? quantity * Math.ceil(pagesPerCopy / 2) : totalPages;
        const materialCost = costPerPage * totalPages;

        const finalPrice = total;
        const unitCostPerCopy = totalPages > 0 ? materialCost : 0;

        const quickItem: CartItem = {
          id: `QUICK-${isPhotocopy ? 'PHOTO' : 'PRINT'}-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
          itemId: isPhotocopy ? 'SVC-PHOTOCOPY' : 'SVC-TYPE-PRINT',
          name: isPhotocopy ? 'Photocopy' : 'Type & Printing',
          sku: isPhotocopy ? 'QUICK-PHOTO' : 'QUICK-PRINT',
          desc: isPhotocopy 
            ? `Quick Photocopy (${pagesPerCopy} pages, ${Math.ceil(pagesPerCopy / 2)} sheets × ${quantity} copies)`
            : `Type & Printing (${pagesPerCopy} pages × ${quantity} copies)`,
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

        // Add to cart (stapling cost is included in item price)
        setCart(prev => [...prev, quickItem]);
        notify(`${quantity}x${pagesPerCopy} pages added to cart`, 'success');
      };

  const updatePrice = (id: string, newPrice: number) => {
    setCart(prev => prev.map(item => {
      if (item.id === id) {
        const currentCost = Number(item.cost || item.cost_price || 0);
        const adjustmentTotal = Number(item.adjustmentTotal || 0);
        return {
          ...item,
          price: roundToCurrency(newPrice),
          marginAmount: roundToCurrency(newPrice - currentCost - adjustmentTotal),
          rounding_difference: 0,
          calculated_price: roundToCurrency(newPrice),
          manual_override: true
        };
      }
      return item;
    }));
  };

  const resetPriceOverride = async (id: string) => {
    const itemInCart = cart.find(i => i.id === id);
    if (!itemInCart) return;

    if (itemInCart.serviceDetails) {
      const cartItem = itemInCart;
      const pages = Number(cartItem.serviceDetails?.pages || cartItem.pagesOverride || 1);

      if (cartItem.priceLocked && cartItem.lockedUnitPricePerCopy !== undefined) {
        setCart(prev => prev.map(i => i.id === id ? {
          ...i,
          price: cartItem.lockedUnitPricePerCopy,
          selling_price: cartItem.lockedUnitPricePerCopy,
          cost: cartItem.lockedUnitCostPerCopy || i.cost,
          cost_price: cartItem.lockedUnitCostPerCopy || i.cost_price || i.cost,
          basePrice: cartItem.lockedUnitCostPerCopy || i.basePrice,
          manual_override: false,
          serviceDetails: {
            ...i.serviceDetails,
            pages,
            copies: itemInCart.quantity,
            totalPages: pages * itemInCart.quantity,
            unitPricePerCopy: cartItem.lockedUnitPricePerCopy,
            unitCostPerCopy: cartItem.lockedUnitCostPerCopy || i.cost,
            totalCost: Number(cartItem.lockedUnitCostPerCopy || i.cost || 0) * itemInCart.quantity,
            totalPrice: cartItem.lockedUnitPricePerCopy * itemInCart.quantity
          }
        } : i));
        return;
      }

      const activeAdjs: any[] = [];

      const baseServiceId = cartItem.itemId || itemInCart.id.split('::')[0];
      const baseService = inventory.find(i => i.id === baseServiceId) || ({ ...itemInCart, id: baseServiceId } as Item);
      const baseCost = Number(baseService.cost) || 0;

      const pricing = await calculateServicePrice({
        itemId: baseService.id,
        categoryId: baseService.category,
        baseCost,
        pages,
        copies: itemInCart.quantity,
        adjustments: activeAdjs,
        marketAdjustments: activeAdjs,
        context: 'SERVICE'
      });

      setCart(prev => prev.map(i => i.id === id ? {
        ...i,
        price: pricing.unitPrice,
        selling_price: pricing.unitPrice,
        cost: pricing.cost,
        cost_price: pricing.cost,
        basePrice: pricing.cost,
        adjustmentSnapshots: pricing.adjustmentSnapshots,
        adjustmentTotal: pricing.adjustmentTotal,
        marginAmount: pricing.marginAmount,
        rounding_difference: pricing.roundingDifference,
        calculated_price: pricing.unitPrice - pricing.roundingDifference,
        manual_override: false,
        serviceDetails: {
          pages,
          copies: itemInCart.quantity,
          totalPages: pages * itemInCart.quantity,
          unitCostPerPage: pricing.cost / pages,
          unitPricePerCopy: pricing.unitPrice,
          unitCostPerCopy: pricing.cost,
          totalCost: baseCost,
          totalPrice: pricing.totalPrice
        }
      } : i));
      return;
    }

    const baseItemId = itemInCart.parentId || itemInCart.id.split('::')[0];
    const baseItem = inventory.find(i => i.id === baseItemId) || itemInCart;

    const activeAdjs: any[] = [];
    const marketAdjustmentsInput: any[] = [];

    const isCartItemVariant = Boolean(itemInCart.parentId);
    const cartVariantStoredPrice = resolveStoredSellingPrice(itemInCart);
    const cartVariantAdjustmentSnapshots = resolveItemAdjustmentSnapshots(itemInCart);
    const cartVariantAdjustmentTotal = Number(
      itemInCart.smartPricingSnapshot?.marketAdjustmentTotal
      ?? itemInCart.adjustmentTotal
      ?? cartVariantAdjustmentSnapshots.reduce((sum: number, snapshot: any) => sum + getSnapshotCalculatedAmount(snapshot), 0)
    );

    if (isCartItemVariant && cartVariantStoredPrice > 0) {
      const variantStoredPricing = buildStoredPricingState(itemInCart, resolveStoredCost(itemInCart), cartVariantAdjustmentTotal);
      setCart(prev => prev.map(i => i.id === id ? {
        ...i,
        price: variantStoredPricing.price || cartVariantStoredPrice,
        selling_price: variantStoredPricing.price || cartVariantStoredPrice,
        cost: resolveStoredCost(itemInCart),
        cost_price: resolveStoredCost(itemInCart),
        originalPrice: itemInCart.originalPrice,
        adjustmentSnapshots: cartVariantAdjustmentSnapshots,
        adjustmentTotal: cartVariantAdjustmentTotal,
        rounding_difference: variantStoredPricing.roundingDifference,
        marginAmount: variantStoredPricing.marginAmount,
        calculated_price: variantStoredPricing.calculatedPrice,
        manual_override: false,
        productionCostSnapshot: itemInCart.productionCostSnapshot
      } : i));
      return;
    }

    const effectiveCost = isCartItemVariant ? resolveStoredCost(itemInCart) : Number(baseItem.cost);
    const effectiveBasePrice = isCartItemVariant ? resolveStoredSellingPrice(itemInCart) : resolveStoredSellingPrice(baseItem);
    const parentFallbackPrice = isCartItemVariant
      ? (resolveStoredSellingPrice(baseItem) || Number(baseItem.price) || 0)
      : 0;
    const effectiveAdjustmentTotal = marketAdjustmentsInput.reduce((sum: number, adj: any) => sum + (adj.calculatedAmount || 0), 0);

    if (effectiveBasePrice > 0) {
      const storedPricing = buildStoredPricingState(baseItem, effectiveCost, effectiveAdjustmentTotal);
      setCart(prev => prev.map(i => i.id === id ? {
        ...i,
        price: storedPricing.price || effectiveBasePrice,
        selling_price: storedPricing.price || effectiveBasePrice,
        cost: effectiveCost,
        cost_price: effectiveCost,
        originalPrice: itemInCart.originalPrice,
        adjustmentSnapshots: marketAdjustmentsInput,
        adjustmentTotal: effectiveAdjustmentTotal,
        rounding_difference: storedPricing.roundingDifference,
        marginAmount: storedPricing.marginAmount,
        calculated_price: storedPricing.calculatedPrice,
        manual_override: false,
        productionCostSnapshot: itemInCart.productionCostSnapshot
      } : i));
      return;
    }

    const pricing = await calculateSellingPrice({
      itemId: baseItem.id,
      categoryId: baseItem.category,
      baseCost: effectiveCost,
      basePrice: (effectiveBasePrice > 0 ? effectiveBasePrice : (parentFallbackPrice > 0 ? parentFallbackPrice : undefined)),
      quantity: itemInCart.quantity,
      adjustments: marketAdjustmentsInput,
      context: 'POS',
      quantityTiers: baseItem?.volumePricing,
      allowQuantityTiering: baseItem?.allowVolumePricing,
    });

    setCart(prev => prev.map(i => i.id === id ? {
      ...i,
      price: pricing.unitPrice,
      selling_price: pricing.unitPrice,
      cost: pricing.cost,
      cost_price: pricing.cost,
      originalPrice: itemInCart.originalPrice,
      adjustmentSnapshots: pricing.adjustmentSnapshots,
      adjustmentTotal: pricing.adjustmentTotal,
      rounding_difference: pricing.roundingDifference,
      marginAmount: pricing.marginAmount,
      calculated_price: pricing.unitPrice - pricing.roundingDifference,
      manual_override: false,
      productionCostSnapshot: itemInCart.productionCostSnapshot
    } : i));
  };

  const updateQuantity = async (id: string, value: number, isAbsolute?: boolean) => {
    const itemInCart = cart.find(i => i.id === id);
    if (!itemInCart) return;

    const oldQty = itemInCart.quantity;
    const newQty = Math.max(1, isAbsolute ? value : oldQty + value);
    if (newQty < 1) return;

    if (itemInCart.serviceDetails) {
      const cartItem = itemInCart;
      const serviceInfo = cartItem.serviceDetails;
      const pages = Number(serviceInfo?.pages || cartItem.pagesOverride || 1);
      const baseServiceId = cartItem.itemId || itemInCart.id.split('::')[0];
      const baseService = inventory.find(i => i.id === baseServiceId) || ({ ...itemInCart, id: baseServiceId } as Item);

      if (cartItem.manual_override) {
        setCart(prev => prev.map(i => i.id === id ? {
          ...i,
          quantity: newQty,
          price: cartItem.price,
          selling_price: cartItem.price,
          cost: cartItem.cost,
          cost_price: cartItem.cost_price || cartItem.cost,
          basePrice: cartItem.basePrice,
          manual_override: true,
          serviceDetails: {
            ...i.serviceDetails,
            pages,
            copies: newQty,
            totalPages: pages * newQty,
            unitCostPerPage: pages > 0 ? Number(cartItem.cost || 0) / pages : 0,
            unitPricePerCopy: cartItem.price,
            unitCostPerCopy: cartItem.cost,
            totalCost: Number(cartItem.cost || 0) * newQty,
            totalPrice: Number(cartItem.price || 0) * newQty
          }
        } : i));
        return;
      }

      if (cartItem.priceLocked && cartItem.lockedUnitPricePerCopy !== undefined) {
        const lockedAdjustmentTotal = cartItem.adjustmentTotal || 0;
        setCart(prev => prev.map(i => i.id === id ? {
          ...i,
          quantity: newQty,
          price: cartItem.lockedUnitPricePerCopy,
          cost: cartItem.lockedUnitCostPerCopy || i.cost,
          basePrice: cartItem.lockedUnitCostPerCopy || i.basePrice,
          adjustmentTotal: lockedAdjustmentTotal,
          priceLocked: true,
          lockedTotalPrice: cartItem.lockedTotalPrice,
          lockedUnitPricePerCopy: cartItem.lockedUnitPricePerCopy,
          lockedUnitCostPerCopy: cartItem.lockedUnitCostPerCopy
        } : i));
        return;
      }

      const activeAdjs: any[] = [];

      const baseCost = Number(baseService.cost) || 0;
      const unitCostPerCopy = newQty > 0 ? roundToCurrency(baseCost / newQty) : baseCost;

      const pricing = await calculateServicePrice({
        itemId: baseService.id,
        categoryId: baseService.category,
        baseCost: baseCost,
        pages: pages,
        copies: newQty,
        adjustments: activeAdjs,
        marketAdjustments: activeAdjs,
        context: 'SERVICE'
      });

      setCart(prev => prev.map(i => i.id === id ? {
        ...i,
        quantity: newQty,
        price: pricing.unitPrice,
        cost: pricing.cost,
        basePrice: pricing.cost,
        pagesOverride: pages,
        adjustmentSnapshots: pricing.adjustmentSnapshots,
        adjustmentTotal: pricing.adjustmentTotal,
        serviceDetails: {
          pages,
          copies: newQty,
          totalPages: pages * newQty,
          unitCostPerPage: pricing.cost / pages,
          unitPricePerCopy: pricing.unitPrice,
          unitCostPerCopy: pricing.cost,
          totalCost: baseCost,
          totalPrice: pricing.totalPrice
        }
      } : i));
      return;
    }

    const delta = newQty - oldQty;
    if (delta !== 0 && itemInCart.type !== 'Service') {
      updateReservedStock(itemInCart.parentId || itemInCart.id, delta, 'POS Quantity Change', itemInCart.parentId ? itemInCart.id : undefined);
    }

    const baseItemId = itemInCart.parentId || itemInCart.id.split('::')[0];
    const baseItem = inventory.find(i => i.id === baseItemId) || itemInCart;

    const activeAdjs: any[] = [];
    const marketAdjustmentsInput: any[] = [];

    // For variants: use the stored price on the cart item — do not recalculate
    // from parent cost which is 0 for SmartPricing products.
    const isCartItemVariant = Boolean(itemInCart.parentId);
    const cartVariantStoredPrice = resolveStoredSellingPrice(itemInCart);
    const cartVariantAdjustmentSnapshots = resolveItemAdjustmentSnapshots(itemInCart);
    const cartVariantAdjustmentTotal = Number(
      itemInCart.smartPricingSnapshot?.marketAdjustmentTotal
      ?? itemInCart.adjustmentTotal
      ?? cartVariantAdjustmentSnapshots.reduce((sum: number, snapshot: any) => sum + getSnapshotCalculatedAmount(snapshot), 0)
    );

    if (isCartItemVariant && cartVariantStoredPrice > 0) {
      // Keep existing variant price — only update quantity
      const variantStoredPricing = buildStoredPricingState(itemInCart, resolveStoredCost(itemInCart), cartVariantAdjustmentTotal);
      setCart(prev => prev.map(i => i.id === id ? {
        ...i,
        quantity: newQty,
        price: variantStoredPricing.price || cartVariantStoredPrice,
        selling_price: variantStoredPricing.price || cartVariantStoredPrice,
        cost_price: resolveStoredCost(itemInCart),
        originalPrice: itemInCart.originalPrice,
        adjustmentSnapshots: cartVariantAdjustmentSnapshots,
        adjustmentTotal: cartVariantAdjustmentTotal,
        rounding_difference: variantStoredPricing.roundingDifference,
        marginAmount: variantStoredPricing.marginAmount,
        calculated_price: variantStoredPricing.calculatedPrice,
        productionCostSnapshot: itemInCart.productionCostSnapshot
      } : i));
      return;
    }

    const effectiveCost = isCartItemVariant ? resolveStoredCost(itemInCart) : Number(baseItem.cost);
    const effectiveAdjustmentTotal = marketAdjustmentsInput.reduce((sum: number, adj: any) => sum + (adj.calculatedAmount || 0), 0);

    if (!itemInCart.manual_override) {
      const storedBasePrice = resolveStoredSellingPrice(baseItem);
      if (storedBasePrice > 0) {
        const storedPricing = buildStoredPricingState(baseItem, effectiveCost, effectiveAdjustmentTotal);
        setCart(prev => prev.map(i => i.id === id ? {
          ...i,
          quantity: newQty,
          price: storedPricing.price || storedBasePrice,
          selling_price: storedPricing.price || storedBasePrice,
          cost: effectiveCost,
          cost_price: effectiveCost,
          originalPrice: itemInCart.originalPrice,
          adjustmentSnapshots: marketAdjustmentsInput,
          adjustmentTotal: effectiveAdjustmentTotal,
          rounding_difference: storedPricing.roundingDifference,
          marginAmount: storedPricing.marginAmount,
          calculated_price: storedPricing.calculatedPrice,
          productionCostSnapshot: itemInCart.productionCostSnapshot
        } : i));
        return;
      }
    }

    const effectiveBasePrice = itemInCart.manual_override
      ? itemInCart.price
      : (isCartItemVariant ? resolveStoredSellingPrice(itemInCart) : resolveStoredSellingPrice(baseItem));

    const parentFallbackPrice = isCartItemVariant
      ? (resolveStoredSellingPrice(baseItem) || Number(baseItem.price) || 0)
      : 0;

    const pricing = await calculateSellingPrice({
      itemId: baseItem.id,
      categoryId: baseItem.category,
      baseCost: effectiveCost,
      basePrice: (effectiveBasePrice > 0 ? effectiveBasePrice : (parentFallbackPrice > 0 ? parentFallbackPrice : undefined)),
      quantity: newQty,
      adjustments: marketAdjustmentsInput,
      context: 'POS',
      quantityTiers: baseItem?.volumePricing,
      allowQuantityTiering: baseItem?.allowVolumePricing,
    });

    setCart(prev => prev.map(i => i.id === id ? {
      ...i,
      quantity: newQty,
      price: pricing.unitPrice,
      selling_price: pricing.unitPrice,
      cost: pricing.cost,
      cost_price: pricing.cost,
      originalPrice: itemInCart.originalPrice,
      adjustmentSnapshots: pricing.adjustmentSnapshots,
      adjustmentTotal: pricing.adjustmentTotal,
      rounding_difference: pricing.roundingDifference,
      marginAmount: pricing.marginAmount,
      calculated_price: pricing.unitPrice - pricing.roundingDifference,
      productionCostSnapshot: itemInCart.productionCostSnapshot
    } : i));
  };

  const removeFromCart = (id: string) => {
    setCart(prev => {
      const item = prev.find(i => i.id === id);
      if (item && item.type !== 'Service') {
        updateReservedStock(item.parentId || item.id, -item.quantity, 'POS Item Removal', item.parentId ? item.id : undefined);
      }
      return prev.filter(i => i.id !== id);
    });
  };

  const clearCart = (releaseReservation: boolean = true) => {
    if (releaseReservation && cart.length > 0) {
      cart.forEach(item => {
        if (item.type !== 'Service') {
          updateReservedStock(item.parentId || item.id, -item.quantity, 'POS Cart Clear', item.parentId ? item.id : undefined);
        }
      });
    }
    setCart([]);
    setSelectedCustomerName(null);
    setSelectedSubAccount('Main');
    setManualDiscountPercent(0);
  };

  const recalculateCartPrices = async (customerName: string | null) => {
    if (!customerName || customerName === 'Walk-in') {
      setCart(prev => prev.map(i => ({
        ...i,
        price: i.baseUnitPrice || i.price,
        selling_price: i.baseUnitPrice || i.selling_price,
        customerPriceAdjusted: false
      })));
      return;
    }
    const cust = (customers || []).find((c: any) => c.name === customerName);
    if (!cust) return;
    let multiplier = 1;
    try {
      const tier = await getCustomerPricingTier(cust.id);
      const basePrice = 100;
      const adjusted = resolveCustomerPrice(basePrice, tier, cust.segment || '');
      multiplier = adjusted / basePrice;
    } catch { /* keep 1 */ }

    if (multiplier === 1) return;
    setCart(prev => prev.map(i => ({
      ...i,
      price: round2((i.baseUnitPrice || i.price) * multiplier),
      selling_price: round2((i.baseUnitPrice || i.selling_price) * multiplier),
      customerPriceAdjusted: true
    })));
  };

  const getErrorMessage = (err: unknown) => {
    if (err instanceof Error) return err.message || String(err);
    if (typeof err === 'string') return err;
    if (err && typeof err === 'object') {
      const anyErr = err as Record<string, unknown>;
      if (typeof anyErr.message === 'string' && anyErr.message.trim()) return anyErr.message;
      if (typeof anyErr.name === 'string' && anyErr.name.trim()) return anyErr.name;
      try {
        return JSON.stringify(err);
      } catch {
        return String(err);
      }
    }
    return 'Unknown error';
  };

  const handleCustomerSelect = (name: string) => {
    setSelectedCustomerName(name);
    setSelectedSubAccount('Main');
    setShowCustomerModal(false);
    recalculateCartPrices(name);
  };

  const handleParkOrder = () => {
    if (cart.length === 0) return;
    parkOrder({ id: '', customerName: selectedCustomerName || 'Walk-in', date: new Date().toISOString(), items: cart, note: 'Parked from POS' });
    clearCart();
    notify("Order Parked", 'success');
  };

  const handleCompletePayment = async (payments: PaymentDetail[], excessHandling?: 'Change' | 'Wallet') => {
    try {
      const [persistedSales, idempotencyKeys] = await Promise.all([
        dbService.getAll<Sale>('sales'),
        dbService.getAll<any>('idempotencyKeys')
      ]);

      const knownSales = [...(sales || []), ...(persistedSales || [])];
      const blockedSaleIds = new Set(
        (idempotencyKeys || [])
          .filter((entry: any) => String(entry?.scope || '').trim() === 'sale')
          .map((entry: any) => String(entry?.sourceId || '').trim())
          .filter(Boolean)
      );

      let idCollection = knownSales.slice();
      let saleId = generateNextId('POS', idCollection, companyConfig);
      while (blockedSaleIds.has(saleId) || idCollection.some((entry: any) => String(entry?.id || '').trim() === saleId)) {
        idCollection = [...idCollection, { id: saleId, date: new Date().toISOString() } as Record<string, unknown>];
        saleId = generateNextId('POS', idCollection, companyConfig);
      }

      const totalPaid = round2(payments.reduce((s, p) => s + p.amount, 0));
      const changeDue = round2(Math.max(totalPaid - payableTotal, 0));

      // Resolve customer tier/segment for pricing
      const selectedCustomer = (customers || []).find((c: any) => c.name === selectedCustomerName);
      const customerId = selectedCustomer?.id || selectedCustomerName || 'walk-in';
      const customerSegment = selectedCustomer?.segment || '';

      // Apply customer pricing, discounts, and tax to each item
      let totalDiscount = 0;
      let totalTax = 0;
      const itemTaxDetails: { itemId: string; rate: number; name: string; taxAmount: number }[] = [];

      const processesedItemsWithSnapshots = processedItems.map((item: any) => {
        let snapshots = resolveItemAdjustmentSnapshots(item);
        const isSmartPricingVariant = !!item.parentId && !!item.smartPricingSnapshot;

        if ((!snapshots || snapshots.length === 0) && item.type !== 'Service' && !isSmartPricingVariant) {
          const activeAdjs: any[] = [];
          snapshots = [];
        }

        return { ...item, adjustmentSnapshots: snapshots };
      });

      // Apply discount rules
      const allDiscounts = selectedCustomer
        ? await getApplicableDiscounts(selectedCustomer.id, customerSegment, undefined, total)
        : [];

      const allLineTotal = processesedItemsWithSnapshots.reduce((s, i) => s + (i.price || 0) * (i.quantity || 1), 0);
      const totalManualDiscount = manualDiscountPercent > 0 && allLineTotal > 0 ? round2(allLineTotal * (manualDiscountPercent / 100)) : 0;

      const saleItems = await Promise.all(processesedItemsWithSnapshots.map(async (item: any) => {
        const qty = item.quantity || 1;
        const unitPrice = item.price || 0;
        const lineTotal = unitPrice * qty;

        const manualDiscountForItem = totalManualDiscount > 0 ? round2((lineTotal / allLineTotal) * totalManualDiscount) : 0;
        const baseForRules = round2(lineTotal - manualDiscountForItem);

        // Apply rule-based discounts on top of manual discount
        let discountTotal = manualDiscountForItem;
        let appliedRuleIds: string[] = [];
        if (allDiscounts.length > 0 && item.type !== 'Service') {
          const catDiscounts = allDiscounts.filter(d =>
            d.scope === 'global' ||
            (d.scope === 'category' && d.scopeValue === item.category) ||
            (d.scope === 'item_specific' && d.scopeValue === item.id) ||
            (d.scope === 'customer_specific') ||
            (d.scope === 'customer_segment')
          );
          if (catDiscounts.length > 0) {
            const result = applyDiscounts(baseForRules, qty, unitPrice, catDiscounts);
            discountTotal += baseForRules - result.discountedTotal;
            appliedRuleIds = result.appliedDiscounts.map(r => r.ruleId);
          }
        }

        const discountedLineTotal = round2(baseForRules - (discountTotal - manualDiscountForItem));
        const finalUnitPrice = qty > 0 ? round2(discountedLineTotal / qty) : unitPrice;

        // Calculate tax on final discounted unit price
        const baseItem = item.parentId ? inventory.find(i => i.id === item.parentId) || item : item;
        const taxResult = await calculateItemTax(baseItem, finalUnitPrice, qty, customerId);
        totalTax += taxResult.taxAmount;
        itemTaxDetails.push({ itemId: item.id, rate: taxResult.rate, name: taxResult.name, taxAmount: taxResult.taxAmount });

        // Increment discount usage counters
        for (const ruleId of appliedRuleIds) {
          await incrementDiscountUsage(ruleId).catch(() => {});
        }

        totalDiscount += discountTotal;

        return attachPricingBreakdown({
          ...item,
          productId: item.productId || item.itemId || item.id,
          productName: item.name,
          unitPrice,
          subtotal: lineTotal,
          discount: round2(discountTotal),
          discountRuleIds: appliedRuleIds,
          taxRate: taxResult.rate,
          taxName: taxResult.name,
          taxAmount: taxResult.taxAmount,
          taxableAmount: taxResult.taxableAmount,
          productionCostSnapshot: item.productionCostSnapshot,
          adjustmentSnapshots: item.adjustmentSnapshots,
          desc: item.desc
        });
      }));

      const pricingSummary = summarizePricingBreakdown(saleItems);
      const aggregatedSnapshots = aggregateMarketAdjustmentSnapshots(saleItems);
      const totalCost = pricingSummary.materialTotal;
      const finalTotal = round2(payableTotal + totalTax);

        const saleData: Sale = {
          id: saleId,
          date: new Date().toISOString(),
          source: 'POS',
          totalAmount: finalTotal,
          discount: round2(totalDiscount),
          status: 'Paid',
          items: saleItems,
          paymentMethod: payments.length === 1 ? payments[0].method : 'Split',
          payments: payments,
          cashierId: user?.id || 'unknown',
          customerId,
          customerName: selectedCustomerName || 'Walk-in',
          subAccountName: selectedSubAccount,
          total: finalTotal,
          bill_total: finalTotal,
          cash_tendered: round2(totalPaid),
          change_due: round2(changeDue),
         adjustmentTotal: pricingSummary.adjustmentTotal,
         adjustmentSnapshots: aggregatedSnapshots,
         // SmartPricing revenue analytics fields
         profitMarginTotal: pricingSummary.profitMarginTotal,
         roundingTotal: pricingSummary.roundingTotal,
         roundingDifference: pricingSummary.roundingTotal,
         materialTotal: pricingSummary.materialTotal,
         material_total_cost: pricingSummary.materialTotal,
         taxTotal: round2(totalTax),
         taxDetails: itemTaxDetails,
          discountTotal: round2(totalDiscount),
          referredBy: selectedCustomer?.referredById || '',
          referredByName: selectedCustomer?.referredByName || '',
          salesAccountId: selectedSalesAccountId,
        };

      try {
        const serverPricing = await calculateSellingPrice({
          itemId: 'BATCH_SALE',
          categoryId: null,
          baseCost: totalCost,
          quantity: 1,
          adjustments: aggregatedSnapshots,
          context: 'POS'
        });
        if (serverPricing.totalPrice - payableTotal > 0.01) {
          console.warn('⚠️ Price mismatch detected before submit', { 
            serverPrice: serverPricing.totalPrice, 
            frontendPrice: payableTotal,
            diff: serverPricing.totalPrice - payableTotal
          });
        }
      } catch (pricingError) {
        logger.error('[Pricing Integrity Check Failed]', pricingError);
      }

      // Deduct from tracked batches FIRST (before creating sale) to detect failures early
      const warehouseId = companyConfig.transactionSettings?.defaultPOSWarehouse || 'WH-MAIN';
      for (const cartItem of cart) {
        const selections = cartItem.batchSelections;
        if (selections && selections.length > 0) {
          for (const sel of selections) {
            const dedResult = await inventoryTransactionService.deductInventory({
              itemId: cartItem.parentId || cartItem.id || cartItem.itemId,
              warehouseId,
              quantity: sel.quantity,
              batchId: sel.batchId,
              reason: `POS Sale #${saleId}`,
              reference: 'POS',
              referenceId: saleId,
              performedBy: user?.name || 'Cashier'
            });
            if (!dedResult.success) {
              throw new Error(`Batch deduction failed for ${cartItem.name}: ${dedResult.error}`);
            }
          }
        }
      }

      await api.sales.createSale(saleData);

      // Refresh data across modules
      await Promise.all([
        fetchSalesData?.(),
        fetchFinanceData?.()
      ]);

      // Trigger customer notification if customer has a phone number
      const customerPhone = selectedCustomer?.phone;
      if (customerPhone) {
        customerNotificationService.triggerNotification('SALES_ORDER', {
          id: saleId,
          customerName: selectedCustomerName || 'Walk-in',
          phoneNumber: customerPhone,
          amount: `${currency}${formatNumber(payableTotal)}`,
        }).catch((err: any) => logger.error('[POS] Notification failed', err));
      }

      const persistedSale = await dbService.get<Sale>('sales', saleId);
      const receiptSale: Sale = persistedSale || {
        ...saleData,
        excessHandling: (excessHandling || 'Change') as 'Change' | 'Wallet',
        excessAmount: changeDue
      };
      setLastSale(receiptSale);
      setShowPaymentModal(false);

      await addAlert?.({
        id: `ALERT-SALE-${saleId}-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
        title: 'POS Sale Completed',
        message: `Sale #${saleId} posted for ${receiptSale.customerName || 'Walk-in Customer'} (${currency}${formatNumber(payableTotal)}).`,
        type: 'SUCCESS',
        module: 'POS',
        severity: 'Low',
        actionUrl: '/pos',
        date: new Date().toISOString(),
        read: false
      });

      const previewData = buildValidatedPosReceipt(receiptSale);

      // Only show receipt preview if user has the toggle on
      if (autoPreviewReceipt) {
        setPreviewState({
          isOpen: true,
          type: 'POS_RECEIPT',
          data: previewData
        });
      } else {
        setQuickReceiptSale(receiptSale);
      }

      if (companyConfig.transactionSettings?.autoPrintReceipt) {
        if (hardwareService.isConnected()) {
          try {
            await hardwareService.printPosReceipt(previewData, companyConfig);
          } catch (printError) {
            logger.error('Auto-print failed:', printError);
            notify('Auto-print failed. Receipt preview is available.', 'warning');
          }
        } else {
          notify('Auto-print is enabled but no printer is connected.', 'warning');
        }
      }

      // Create gift cards for any gift card items in the cart
      for (const cartItem of cart) {
        if (cartItem.isGiftCard) {
          const gcCode = cartItem.giftCardCode || `GC-${Date.now()}-${Math.random().toString(36).substr(2, 6).toUpperCase()}`
          await dbService.put('engagementGiftCards', {
            id: `GC-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
            code: gcCode,
            customerId: customerId !== 'walk-in' ? customerId : null,
            initialBalance: cartItem.giftCardAmount || cartItem.price || 0,
            currentBalance: cartItem.giftCardAmount || cartItem.price || 0,
            status: 'active',
            type: 'digital',
            purchasedWith: saleId,
            giftMessage: cartItem.giftCardMessage || null,
            designColor: cartItem.giftCardColor || '#10b981',
            rechargeable: true,
            transferable: false,
            expiresAt: new Date(Date.now() + 365 * 86400000).toISOString(),
            createdAt: new Date().toISOString(),
          } as any)
        }
      }

      // Create production jobs for printing services
      const { addProductionJob, createProductionJob } = usePrintingStore.getState();
      createProductionJobsFromSale(cart, saleId, addProductionJob, createProductionJob);

      clearCart(true);
      notify(`Sale #${saleId} completed`, 'success');
    } catch (error: any) {
      const message = getErrorMessage(error);
      logger.error('POS Sale Error:', error, message);
      notify(message || 'Error processing sale', 'error');
    }
  };

  const handleProcessRefund = async (saleId: string, items: { itemId: string, qty: number }[], refundAccountId?: string) => {
    try {
      const sale = sales.find(entry => entry.id === saleId);
      if (!sale) throw new Error('Sale not found');

      let calculatedRefundAmount = 0;
      const refundItems = items.map(item => {
        const saleItem = (sale.items || []).find(entry => entry.id === item.itemId);
        const itemPrice = saleItem?.price || 0;
        calculatedRefundAmount += itemPrice * item.qty;

        return {
          itemId: item.itemId,
          quantity: item.qty,
          reason: 'POS Return',
          condition: 'Sellable' as const
        };
      });

      await transactionService.processRefund({
        saleId,
        items: refundItems,
        reason: 'POS Return',
        refundMethod: 'Cash',
        accountId: refundAccountId || '1000', // Default to Cash Account if not specified
        date: new Date().toISOString(),
        id: generateNextId('refund', sales, companyConfig),
        refundAmount: calculatedRefundAmount,
        restock: true
      });

      await fetchSalesData?.();
      await addAlert?.({
        id: `ALERT-REFUND-${saleId}-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
        title: 'Refund Processed',
        message: `Refund posted for Sale #${saleId} (${currency}${formatNumber(calculatedRefundAmount)}).`,
        type: 'INFO',
        module: 'POS',
        severity: 'Medium',
        actionUrl: '/pos',
        date: new Date().toISOString(),
        read: false
      });
      notify(`Refund processed for Sale #${saleId}`, 'success');
      setShowReturnsModal(false);
    } catch (error: any) {
      notify(`Refund Failed: ${error.message}`, 'error');
    }
  };

  const handleCloseRegister = async () => {
    if (!zReportData) return;
    setIsClosingDrawer(true);
    const bankAccId = accounts.find((a: any) => a.code === '1050')?.id || '1050';
    await postZReportToLedger(zReportData, bankAccId);
    setIsClosingDrawer(false);
    setShowZReport(false);
  };

  return (
    <div className="h-full flex flex-col md:flex-row overflow-hidden bg-[#FEFDFB] relative font-['Inter',_sans-serif] text-[#23282A]">
      <div className="flex-1 flex flex-col relative overflow-hidden">
        {/* Top Header Mimicking QBO */}
          <div className="px-6 py-1 flex items-center justify-between z-30 bg-[#FEFDFB] border-b border-[#e4ddd1]">
           <div className="flex items-center gap-4">
             <div className="hidden lg:flex gap-2">
<button onClick={handleQuickPhotocopy} className="px-3 py-1.5 bg-[#FEFDFB] border border-[#e4ddd1] rounded-lg text-[12px] font-bold text-[#23282A] hover:bg-[#eef7f6] hover:border-[#a6d9d3] hover:text-[#0b3e39] transition-all flex items-center gap-1.5 shadow-sm">
                  <Copy size={14} /> Photocopy
                </button>
                 <button onClick={handleQuickTypePrinting} className="px-3 py-1.5 bg-[#FEFDFB] border border-[#e4ddd1] rounded-lg text-[12px] font-bold text-[#23282A] hover:bg-[#eef7f6] hover:border-[#a6d9d3] hover:text-[#0b3e39] transition-all flex items-center gap-1.5 shadow-sm">
                  <FileText size={14} /> Type & Print
                </button>
                 <button onClick={() => setGiftCardModal(true)} className="px-3 py-1.5 bg-[#FEFDFB] border border-[#e4ddd1] rounded-lg text-[12px] font-bold text-[#0f544c] hover:bg-[#eef7f6] hover:border-[#a6d9d3] hover:text-[#0b3e39] transition-all flex items-center gap-1.5 shadow-sm">
                 <Gift size={14} /> Gift Card
               </button>
<select value={selectedSalesAccountId} onChange={e => setSelectedSalesAccountId(e.target.value)}
                   className="px-3 py-1.5 bg-[#FEFDFB] border border-[#e4ddd1] rounded-lg text-[12px] font-bold text-[#23282A] hover:border-[#a6d9d3] transition-all shadow-sm outline-none cursor-pointer">
                 {(accounts || []).filter((a: any) => a.type === 'Revenue').map(acc => (
                   <option key={acc.id} value={acc.id}>{acc.name}</option>
                 ))}
               </select>
             </div>
           </div>

          <div className="flex gap-3 items-center">
            {companyConfig?.transactionSettings?.pos?.showShortcutHints !== false && (
              <span className="text-[11px] text-[#5c6567] font-medium hidden xl:block italic">
                {companyConfig?.transactionSettings?.pos?.shortcutLabels?.F1 ? `F1: ${companyConfig.transactionSettings.pos.shortcutLabels.F1} • ` : 'F1: Cust • '}
                {companyConfig?.transactionSettings?.pos?.shortcutLabels?.F2 ? `F2: ${companyConfig.transactionSettings.pos.shortcutLabels.F2} • ` : 'F2: Photo • '}
                {companyConfig?.transactionSettings?.pos?.shortcutLabels?.F3 ? `F3: ${companyConfig.transactionSettings.pos.shortcutLabels.F3} • ` : 'F3: Print • '}
                {companyConfig?.transactionSettings?.pos?.shortcutLabels?.F10 ? `F10: ${companyConfig.transactionSettings.pos.shortcutLabels.F10}` : 'F10: Pay'}
              </span>
            )}
            <div className="flex gap-2">
<label className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-[#e4ddd1] text-[12px] font-bold text-[#23282A] hover:bg-[#eef7f6] cursor-pointer transition-all bg-[#FEFDFB] shadow-sm select-none">
                 <div className={`w-7 h-3.5 rounded-full flex items-center p-0.5 transition-colors ${autoPreviewReceipt ? 'bg-[#1f8577]' : 'bg-[#e4ddd1]'}`}>
                  <div className={`bg-white w-2.5 h-2.5 rounded-full shadow-sm transform transition-transform ${autoPreviewReceipt ? 'translate-x-3.5' : 'translate-x-0'}`}></div>
                </div>
                <span>Preview</span>
                <input 
                  type="checkbox" 
                  className="hidden" 
                  checked={autoPreviewReceipt} 
                  onChange={(e) => {
                    setAutoPreviewReceipt(e.target.checked);
                    updateCompanyConfig({
                      ...companyConfig,
                      transactionSettings: {
                        ...companyConfig.transactionSettings,
                        showReceiptPreview: e.target.checked
                      }
                    });
                  }} 
                />
              </label>
               <button onClick={async () => { await fetchSalesData?.(); setZReportData(generateZReport(user?.id || '')); setShowZReport(true); }} className="px-3 py-1.5 rounded-lg border border-[#e4ddd1] text-[12px] font-bold text-[#23282A] hover:bg-[#eef7f6] hover:border-[#d4cdc2] transition-all bg-[#FEFDFB] shadow-sm flex items-center gap-1.5">
                <TrendingUp size={14} /> Register
              </button>
            </div>
          </div>
        </div>
        <ProductGrid
          inventory={inventory}
          addToCart={addToCart}
          onConfigureService={handleConfigureService}
          onRecall={() => setShowHeldOrdersModal(true)}
          heldCount={heldOrders.length}
          onZReport={async () => { await fetchSalesData?.(); setZReportData(generateZReport(user?.id || '')); setShowZReport(true); }}
        />
      </div>

      {/* Right Sidebar - Checkout */}
      <div className="w-full md:w-1/3 h-full relative z-20 border-l border-[#e4ddd1]">
        <div className="absolute inset-0 bg-[#FEFDFB]">
          <CartSidebar
            cart={cart}
            sales={sales}
            selectedCustomerName={selectedCustomerName}
            selectedSubAccount={selectedSubAccount}
            setSelectedSubAccount={setSelectedSubAccount}
            onSelectCustomer={() => setShowCustomerModal(true)}
            updateQuantity={updateQuantity}
            updatePrice={updatePrice}
            resetPriceOverride={resetPriceOverride}
            removeFromCart={removeFromCart}
            clearCart={clearCart}
            onPark={handleParkOrder}
            onReturn={() => setShowReturnsModal(true)}
            onPay={handlePay}
            totals={{ subtotal: total, total }}
            manualDiscountPercent={manualDiscountPercent}
            onManualDiscountChange={setManualDiscountPercent}
            adjustmentSummary={cartAdjustmentSummary}
            pricingSummary={pricingSummary}
          />
        </div>
      </div>

      {showZReport && zReportData && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4 backdrop-blur-[2px]">
          <div className="bg-[#FEFDFB] w-full max-w-sm rounded-xl shadow-2xl overflow-hidden flex flex-col border border-[#e4ddd1]">
            <div className="px-6 py-4 border-b border-[#e4ddd1] bg-[#eef7f6] flex justify-between items-center">
              <h2 className="text-sm font-bold text-[#23282A] flex items-center gap-2 uppercase tracking-wider"><TrendingUp size={16} className="text-[#1f8577]" /> Register Summary</h2>
              <button onClick={() => setShowZReport(false)} className="text-[#5c6567] hover:text-[#b5493f]"><X size={20} /></button>
            </div>
            <div id="register-details" className="flex-1 overflow-y-auto p-8 text-sm bg-[#FEFDFB]">
              <div className="text-center border-b border-[#e4ddd1] pb-6 mb-6">
                <h1 className="font-bold text-lg text-[#23282A] uppercase tracking-tight">{companyConfig.companyName}</h1>
                <p className="text-[#5c6567] text-xs mt-1 font-medium">Daily Sales Summary</p>
              </div>
              <div className="space-y-4">
                <div className="flex justify-between items-center"><span className="text-[#5c6567]">Gross Sales</span><span className="font-bold text-[#23282A]">{currency}{formatNumber(zReportData.totalSales)}</span></div>
                <div className="flex justify-between items-center"><span className="text-[#5c6567]">Cash in Drawer</span><span className="font-bold text-[#1f8577]">{currency}{formatNumber(zReportData.cashSales)}</span></div>
                <div className="flex justify-between items-center"><span className="text-[#5c6567]">Card Terminal</span><span className="font-bold text-[#23282A]">{currency}{formatNumber(zReportData.cardSales)}</span></div>
              </div>
              <div className="mt-8 p-4 bg-[#eef7f6] rounded-xl border border-[#e4ddd1] text-[11px] text-[#5c6567] leading-relaxed">
                Closing the register will automatically transfer the cash balance to the Main Ledger account.
              </div>
            </div>
            <div className="p-6 bg-[#eef7f6] border-t border-[#e4ddd1]">
              <button
                onClick={handleCloseRegister}
                disabled={isClosingDrawer}
                className="w-full py-3.5 text-white rounded-full font-bold text-sm flex items-center justify-center gap-2 transition-all shadow-sm" style={{ background: 'linear-gradient(155deg, #1f8577, #0f544c)' }}>
                {isClosingDrawer ? <RefreshCw size={16} className="animate-spin" /> : <ShieldCheck size={16} />}
                {isClosingDrawer ? 'Posting to Ledger...' : 'Close Register & Post'}
              </button>
            </div>
          </div>
        </div>
      )}

      {quickReceiptSale && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 50,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'rgba(15, 23, 42, 0.6)', padding: '40px 20px',
          fontFamily: "'Inter','DM Sans',sans-serif", fontSize: 13.5, color: '#23282A', lineHeight: 1.5
        }}>
          <div style={{
            width: 420, maxWidth: '100%', maxHeight: '92vh',
            background: '#FEFDFB', borderRadius: 14,
            boxShadow: '0 30px 70px -20px rgba(0,0,0,.55), 0 8px 24px -8px rgba(0,0,0,.35), 0 0 0 1px rgba(255,255,255,.04)',
            display: 'flex', flexDirection: 'column', overflow: 'hidden', position: 'relative'
          }}>
            {/* Header */}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '16px 20px 12px',
              borderBottom: '1px solid #e4ddd1',
              background: '#eef7f6'
            }}>
              <h2 style={{ fontSize: 13.5, fontWeight: 700, color: '#23282A', margin: 0, display: 'flex', alignItems: 'center', gap: 8, letterSpacing: 0.01 }}>
                <CheckCircle size={16} style={{ color: '#1f8577' }} /> Sale Successful
              </h2>
              <button onClick={() => setQuickReceiptSale(null)} style={{ color: '#5c6567', background: 'none', border: 'none', cursor: 'pointer', padding: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'color .15s ease' }}
                onMouseEnter={e => { e.currentTarget.style.color = '#b5493f'; }}
                onMouseLeave={e => { e.currentTarget.style.color = '#5c6567'; }}
              >
                <X size={18} />
              </button>
            </div>

            {/* Body */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px 8px' }}>
              <div style={{ textAlign: 'center', marginBottom: 18 }}>
                <h1 style={{ fontSize: 20, fontWeight: 700, color: '#23282A', margin: '0 0 4px', letterSpacing: 0.2 }}>{companyConfig.companyName}</h1>
                <p style={{ fontSize: 12, color: '#5c6567', margin: 0, fontWeight: 500 }}>Receipt #{quickReceiptSale.id}</p>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 10px', background: '#FEFDFB', borderRadius: 8, border: '1px solid #e4ddd1' }}>
                  <span style={{ fontSize: 12, color: '#5c6567', fontWeight: 500 }}>Customer</span>
                  <span style={{ fontSize: 13, fontWeight: 600, color: '#23282A' }}>{quickReceiptSale.customerName || 'Walk-in'}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 10px', background: '#FEFDFB', borderRadius: 8, border: '1px solid #e4ddd1' }}>
                  <span style={{ fontSize: 12, color: '#5c6567', fontWeight: 500 }}>Total Amount</span>
                  <span style={{ fontSize: 13.5, fontWeight: 700, color: '#23282A', fontVariantNumeric: 'tabular-nums' }}>{currency}{formatNumber(quickReceiptSale.totalAmount)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 10px', background: '#FEFDFB', borderRadius: 8, border: '1px solid #e4ddd1' }}>
                  <span style={{ fontSize: 12, color: '#5c6567', fontWeight: 500 }}>Paid Amount</span>
                  <span style={{ fontSize: 13.5, fontWeight: 700, color: '#23282A', fontVariantNumeric: 'tabular-nums' }}>{currency}{formatNumber(quickReceiptSale.cash_tendered || quickReceiptSale.totalAmount)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 10px', background: '#FEFDFB', borderRadius: 8, border: '1px solid #e4ddd1' }}>
                  <span style={{ fontSize: 12, color: '#5c6567', fontWeight: 500 }}>Change Due</span>
                  <span style={{ fontSize: 13.5, fontWeight: 700, color: '#1f8577', fontVariantNumeric: 'tabular-nums' }}>{currency}{formatNumber(quickReceiptSale.change_due || 0)}</span>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div style={{ display: 'flex', gap: 10, padding: '14px 20px', borderTop: '1px solid #e4ddd1', background: '#eef7f6' }}>
              <button
                onClick={() => {
                  const receiptData = buildValidatedPosReceipt(quickReceiptSale);
                  setQuickReceiptSale(null);
                  setPreviewState({ isOpen: true, type: 'POS_RECEIPT', data: receiptData });
                }}
                style={{ flex: 1, padding: '8px 12px', background: 'linear-gradient(155deg, #1f8577, #0f544c)', color: '#fff', border: 'none', borderRadius: 9, fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, boxShadow: '0 6px 16px -6px rgba(15,84,76,.55)', transition: 'all .15s ease' }}
                onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 8px 20px -6px rgba(15,84,76,.65)'; }}
                onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 6px 16px -6px rgba(15,84,76,.55)'; }}
              >
                <FileText size={15} /> Full Receipt
              </button>
              <button
                onClick={() => setQuickReceiptSale(null)}
                style={{ flex: 1, padding: '8px 12px', background: '#FEFDFB', border: '1.4px solid #e4ddd1', color: '#5c6567', borderRadius: 9, fontSize: 13, fontWeight: 600, cursor: 'pointer', transition: 'all .15s ease' }}
                onMouseEnter={e => { e.currentTarget.style.background = '#eef7f6'; e.currentTarget.style.color = '#0f544c'; e.currentTarget.style.borderColor = '#a6d9d3'; }}
                onMouseLeave={e => { e.currentTarget.style.background = '#FEFDFB'; e.currentTarget.style.color = '#5c6567'; e.currentTarget.style.borderColor = '#e4ddd1'; }}
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {showPaymentModal && (
        <PaymentModal
          total={payableTotal}
          onComplete={handleCompletePayment}
          onCancel={() => setShowPaymentModal(false)}
          customerName={selectedCustomerName}
          availableCredit={0}
          walletBalance={customers.find((c: any) => c.name === selectedCustomerName || c.id === selectedCustomerName)?.walletBalance || 0}
          loyaltyPoints={customers.find((c: any) => c.name === selectedCustomerName || c.id === selectedCustomerName)?.loyaltyPoints || 0}
          totalProfitMargin={pricingSummary.profitMarginTotal}
          subAccountName={selectedSubAccount}
          adjustmentSummary={cartAdjustmentSummary}
          roundingAccumulation={roundingAccumulation}
          orderNumber={generateNextId('POS', sales, companyConfig)}
        />
      )}
      {showCustomerModal && <CustomerModal onSelect={handleCustomerSelect} onClose={() => setShowCustomerModal(false)} />}
      {showHeldOrdersModal && <HeldOrdersModal orders={heldOrders} onRetrieve={(o) => { setCart(o.items); retrieveOrder(o.id); setShowHeldOrdersModal(false); }} onClose={() => setShowHeldOrdersModal(false)} />}
      {showReturnsModal && <ReturnsModal sales={sales} onProcess={handleProcessRefund} onClose={() => setShowReturnsModal(false)} />}
      {selectedServiceForCalculator && (
        <ServiceCalculatorModal
          service={selectedServiceForCalculator}
          currencySymbol={currency}
          initialPages={selectedServiceForCalculator.pages || 1}
          initialCopies={1}
          onConfirm={async (pricing) => {
            await upsertDynamicServiceInCart(selectedServiceForCalculator, pricing);
            setSelectedServiceForCalculator(null);
            notify(`${selectedServiceForCalculator.name} added`, 'success');
          }}
          onClose={() => setSelectedServiceForCalculator(null)}
        />
      )}
      {selectedPrintingService && (
        <PrintingPOSIntegrator
          selectedService={{ item: selectedPrintingService, customerName: selectedCustomerName || undefined }}
          currency={currency}
          onAddToCart={(cartItem) => {
            setCart(prev => [...prev, cartItem]);
            setSelectedPrintingService(null);
            notify(`${selectedPrintingService.name} configured and added to cart`, 'success');
          }}
          onClose={() => setSelectedPrintingService(null)}
        />
      )}
      {batchPickerState && (
        <BatchPickerModal
          itemId={batchPickerState.item.parentId || batchPickerState.item.id}
          itemName={batchPickerState.item.name}
          targetQuantity={batchPickerState.item.quantity || 1}
          isOpen={true}
          onConfirm={(selections) => {
            batchPickerState.resolve(selections);
          }}
          onClose={() => {
            batchPickerState.resolve([]);
          }}
        />
      )}

      {quickPrintModal.open && (
        <QuickPrintModal
          open={quickPrintModal.open}
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
          onConfirm={(quantity, pagesPerCopy, total, printType, pinningCost, pinningCount) => {
            handleQuickPrintConfirm(quantity, pagesPerCopy, total, printType, pinningCost, pinningCount);
            setQuickPrintModal({ open: false, type: quickPrintModal.type });
          }}
          onClose={() => setQuickPrintModal({ open: false, type: quickPrintModal.type })}
        />
      )}

      {/* Receipt Preview Banner */}
      {lastSale && (
         <div className="fixed bottom-4 right-4 text-white px-4 py-3 rounded-2xl shadow-2xl flex items-center gap-3 animate-in slide-in-from-bottom-2 duration-300" style={{ background: 'linear-gradient(155deg, #1f8577, #0f544c)' }}>
          <CheckCircle size={20} />
          <div className="text-sm font-bold">Sale #{lastSale.id} completed</div>
          <button
            onClick={() => handleDownloadReceipt(lastSale)}
            className="ml-4 px-3 py-1.5 bg-[#FEFDFB] text-[#5c6567] rounded-xl text-xs font-black uppercase tracking-wider hover:bg-[#eef7f6] transition-colors flex items-center gap-1"
          >
            <FileDown size={12} /> Download Receipt
          </button>
        </div>
      )}

      {/* Gift Card Sell Modal */}
      {giftCardModal && (
        <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-[2px] flex items-center justify-center p-4">
          <div className="bg-[#FEFDFB] rounded-2xl shadow-2xl w-full max-w-sm p-6">
            <h3 className="text-lg font-bold text-[#23282A] mb-4">Sell Gift Card</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-[#5c6567] mb-1">Amount ($)</label>
                <input type="number" value={giftCardForm.amount} onChange={e => setGiftCardForm(prev => ({ ...prev, amount: parseFloat(e.target.value) || 0 }))} className="w-full text-lg font-bold border border-[#e4ddd1] rounded-lg px-3 py-2 text-right" min={1} autoFocus />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#5c6567] mb-1">Gift Message (optional)</label>
                <input type="text" value={giftCardForm.message} onChange={e => setGiftCardForm(prev => ({ ...prev, message: e.target.value }))} className="w-full text-sm border border-[#e4ddd1] rounded-lg px-3 py-2" placeholder="Happy Birthday!" />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#5c6567] mb-1">Card Color</label>
                <input type="color" value={giftCardForm.color} onChange={e => setGiftCardForm(prev => ({ ...prev, color: e.target.value }))} className="w-full h-10 border border-[#e4ddd1] rounded-lg cursor-pointer" />
              </div>
              <div className="flex gap-2 pt-2">
                <button onClick={handleSellGiftCard} className="flex-1 px-4 py-2.5 text-sm font-bold text-white rounded-xl transition-all" style={{ background: 'linear-gradient(155deg, #1f8577, #0f544c)' }}>Add to Cart</button>
                <button onClick={() => { setGiftCardModal(false); setGiftCardForm({ amount: 50, message: '', color: '#10b981' }) }} className="px-4 py-2.5 text-sm font-bold text-[#5c6567] bg-[#FEFDFB] border border-[#e4ddd1] rounded-xl hover:bg-[#eef7f6]">Cancel</button>
              </div>
            </div>
          </div>
        </div>
      )}

      <PreviewModal
        isOpen={previewState.isOpen}
        onClose={() => setPreviewState(prev => ({ ...prev, isOpen: false }))}
        type={previewState.type}
        data={previewState.data}
      />
    </div>
  );
};

export default POS;
