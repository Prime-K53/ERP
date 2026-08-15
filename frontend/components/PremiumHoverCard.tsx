import React, { useState, useCallback } from 'react';
import { Package, FileText, Receipt, ShoppingCart, Quote, Info, Layers, Copy, Tag, Percent, Hash } from 'lucide-react';
import { currencyService } from '../services/currencyService';

// Types for item metadata
interface ItemMetadata {
  id: string;
  name: string;
  description?: string;
  category: 'product' | 'service' | 'material' | 'stationery';
  type: 'INVOICE' | 'ORDER' | 'SALES_ORDER' | 'QUOTATION' | 'POS';
  pricing: {
    unitPrice: number;
    totalPrice: number;
    currency: string;
  };
  vatRegistered: boolean;
  // Service-specific fields
  serviceDetails?: {
    totalPages: number;
    copies: number;
    unitType?: string;
  };
  // Product fields
  productDetails?: {
    sku: string;
    stockLevel?: number;
    unitOfMeasure?: string;
  };
}

interface PremiumHoverCardProps {
  item: ItemMetadata;
  children: React.ReactNode;
  position?: 'top' | 'bottom' | 'left' | 'right';
  delay?: number;
}

// Document type icons and labels
const documentTypeConfig = {
  INVOICE: { icon: FileText, label: 'Invoice', color: 'text-blue-600', bgColor: 'bg-blue-50' },
  ORDER: { icon: ShoppingCart, label: 'Sales Order', color: 'text-emerald-600', bgColor: 'bg-emerald-50' },
  SALES_ORDER: { icon: ShoppingCart, label: 'Sales Order', color: 'text-emerald-600', bgColor: 'bg-emerald-50' },
  QUOTATION: { icon: Quote, label: 'Quotation', color: 'text-amber-600', bgColor: 'bg-amber-50' },
  POS: { icon: Receipt, label: 'POS Receipt', color: 'text-purple-600', bgColor: 'bg-purple-50' },
};

// Category icons
const categoryConfig = {
  product: { icon: Package, label: 'Physical Product' },
  service: { icon: FileText, label: 'Service' },
  material: { icon: Layers, label: 'Material' },
  stationery: { icon: Tag, label: 'Stationery' },
};

export const PremiumHoverCard: React.FC<PremiumHoverCardProps> = ({
  item,
  children,
  position = 'top',
  delay = 300,
}) => {
  const [isVisible, setIsVisible] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });
  const hoverTimeout = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleMouseEnter = useCallback((e: React.MouseEvent) => {
    setMousePosition({ x: e.clientX, y: e.clientY });
    hoverTimeout.current = setTimeout(() => {
      setIsMounted(true);
      // Small delay for animation
      requestAnimationFrame(() => setIsVisible(true));
    }, delay);
  }, [delay]);

  const handleMouseLeave = useCallback(() => {
    if (hoverTimeout.current) {
      clearTimeout(hoverTimeout.current);
    }
    setIsVisible(false);
    setTimeout(() => setIsMounted(false), 300); // Match transition duration
  }, []);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    setMousePosition({ x: e.clientX, y: e.clientY });
  }, []);

  // Determine if this is a service item with simplified formatting
  const isService = item.category === 'service';
  const isPOS = item.type === 'POS';
  const useSimplifiedFormat = isService && !isPOS;

  // Get document type config
  const docConfig = documentTypeConfig[item.type] || documentTypeConfig.INVOICE;
  const DocIcon = docConfig.icon;

  // Get category config
  const catConfig = categoryConfig[item.category] || categoryConfig.product;
  const CatIcon = catConfig.icon;

  // Format currency
  const formatCurrency = (amount: number, currency: string) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency || currencyService.getBaseCurrency(),
      minimumFractionDigits: 2,
    }).format(amount);
  };

  // Calculate position styles
  const getPositionStyles = () => {
    const offset = 16; // 16px offset from cursor
    const styles: React.CSSProperties = {
      position: 'fixed',
      zIndex: 9999,
      pointerEvents: 'none',
    };

    switch (position) {
      case 'top':
        styles.left = mousePosition.x;
        styles.top = mousePosition.y - offset;
        styles.transform = 'translate(-50%, -100%)';
        break;
      case 'bottom':
        styles.left = mousePosition.x;
        styles.top = mousePosition.y + offset;
        styles.transform = 'translate(-50%, 0)';
        break;
      case 'left':
        styles.left = mousePosition.x - offset;
        styles.top = mousePosition.y;
        styles.transform = 'translate(-100%, -50%)';
        break;
      case 'right':
        styles.left = mousePosition.x + offset;
        styles.top = mousePosition.y;
        styles.transform = 'translate(0, -50%)';
        break;
    }

    return styles;
  };

  // Format description based on item type
  const getFormattedDescription = () => {
    if (useSimplifiedFormat && item.serviceDetails) {
      return `${item.name} (${item.serviceDetails.totalPages} pages × ${item.serviceDetails.copies} copies)`;
    }
    return item.description || item.name;
  };

  return (
    <div
      className="relative inline-block"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onMouseMove={handleMouseMove}
    >
      {children}

      {isMounted && (
        <div
          style={getPositionStyles()}
          className={`
            w-[360px] rounded-2xl overflow-hidden
            transition-all duration-300 ease-out
            ${isVisible ? 'opacity-100 scale-100 translate-y-0' : 'opacity-0 scale-95 translate-y-2'}
          `}
        >
          {/* Glassmorphism Container */}
          <div
            className="
              bg-white/80 backdrop-blur-xl 
              border border-white/60 
              shadow-[0_25px_50px_-12px_rgba(0,0,0,0.25)]
              rounded-2xl overflow-hidden
            "
          >
            {/* Header Section */}
            <div className="px-6 py-4 bg-gradient-to-r from-slate-50/90 to-slate-100/90 border-b border-slate-200/50">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-xl ${docConfig.bgColor} ${docConfig.color}`}>
                    <DocIcon size={20} />
                  </div>
                  <div>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none">
                      {docConfig.label}
                    </p>
                    <p className="text-sm font-bold text-slate-800 mt-0.5 leading-tight">
                      Item Details
                    </p>
                  </div>
                </div>
                <div
                  className={`
                    px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider
                    ${item.vatRegistered 
                      ? 'bg-emerald-100 text-emerald-700' 
                      : 'bg-amber-100 text-amber-700'}
                  `}
                >
                  {item.vatRegistered ? 'VAT Registered' : 'Not VAT Reg.'}
                </div>
              </div>
            </div>

            {/* Content Section */}
            <div className="p-6 space-y-5">
              {/* Item Name & Category */}
              <div className="flex items-start gap-3">
                <div className="p-2 rounded-xl bg-slate-100 text-slate-600 mt-0.5">
                  <CatIcon size={18} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-black text-slate-400 uppercase tracking-wider mb-1">
                    {catConfig.label}
                  </p>
                  <p className="text-base font-bold text-slate-900 leading-snug break-words">
                    {getFormattedDescription()}
                  </p>
                </div>
              </div>

              {/* Service-specific Details - Only for services on Invoice/Order/Quotation */}
              {useSimplifiedFormat && item.serviceDetails && (
                <div className="flex gap-4">
                  <div className="flex-1 p-3 rounded-xl bg-blue-50/60 border border-blue-100/60">
                    <div className="flex items-center gap-2 mb-1">
                      <FileText size={14} className="text-blue-600" />
                      <p className="text-[10px] font-black text-blue-600 uppercase tracking-wider">
                        Total Pages
                      </p>
                    </div>
                    <p className="text-xl font-black text-slate-800">
                      {item.serviceDetails.totalPages.toLocaleString()}
                    </p>
                  </div>
                  <div className="flex-1 p-3 rounded-xl bg-indigo-50/60 border border-indigo-100/60">
                    <div className="flex items-center gap-2 mb-1">
                      <Copy size={14} className="text-indigo-600" />
                      <p className="text-[10px] font-black text-indigo-600 uppercase tracking-wider">
                        Copies
                      </p>
                    </div>
                    <p className="text-xl font-black text-slate-800">
                      {item.serviceDetails.copies.toLocaleString()}
                    </p>
                  </div>
                </div>
              )}

              {/* Product-specific Details */}
              {!isService && item.productDetails && (
                <div className="flex items-center gap-3 p-3 rounded-xl bg-slate-50/60 border border-slate-200/60">
                  <Hash size={16} className="text-slate-500" />
                  <div>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider">
                      SKU / Product Code
                    </p>
                    <p className="text-sm font-bold text-slate-800 font-mono">
                      {item.productDetails.sku}
                    </p>
                  </div>
                  {item.productDetails.stockLevel !== undefined && (
                    <div className="ml-auto text-right">
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider">
                        Stock
                      </p>
                      <p className={`text-sm font-bold ${item.productDetails.stockLevel > 10 ? 'text-emerald-600' : 'text-amber-600'}`}>
                        {item.productDetails.stockLevel.toLocaleString()} {item.productDetails.unitOfMeasure || 'units'}
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* Pricing Information */}
              <div className="pt-4 border-t border-slate-200/50">
                <div className="flex items-center gap-2 mb-3">
                  <Percent size={14} className="text-slate-500" />
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider">
                    Pricing Information
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-3 rounded-xl bg-slate-50/80">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1">
                      Unit Price
                    </p>
                    <p className="text-lg font-black text-slate-800">
                      {formatCurrency(item.pricing.unitPrice, item.pricing.currency)}
                    </p>
                    {useSimplifiedFormat && item.serviceDetails && (
                      <p className="text-[10px] text-slate-500 mt-0.5">
                        per page
                      </p>
                    )}
                  </div>
                  <div className="p-3 rounded-xl bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-100/50">
                    <p className="text-[10px] font-black text-blue-600 uppercase tracking-wider mb-1">
                      Total Amount
                    </p>
                    <p className="text-lg font-black text-slate-800">
                      {formatCurrency(item.pricing.totalPrice, item.pricing.currency)}
                    </p>
                  </div>
                </div>
              </div>

              {/* Document Type Context Badge */}
              <div className="flex items-center justify-between pt-2">
                <div className="flex items-center gap-2 text-slate-400">
                  <Info size={14} />
                  <span className="text-[10px] font-medium">
                    ID: {item.id.slice(-8)}
                  </span>
                </div>
                <div className={`
                  px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider
                  ${isService 
                    ? 'bg-purple-100 text-purple-700' 
                    : 'bg-slate-100 text-slate-700'}
                `}>
                  {isService ? 'Service Item' : 'Physical Product'}
                </div>
              </div>
            </div>
          </div>

          {/* Arrow indicator */}
          <div
            className={`
              absolute w-3 h-3 bg-white/80 backdrop-blur-xl border-r border-b border-white/60
              transform rotate-45
              ${position === 'top' ? 'bottom-[-6px] left-1/2 -translate-x-1/2' : ''}
              ${position === 'bottom' ? 'top-[-6px] left-1/2 -translate-x-1/2' : ''}
              ${position === 'left' ? 'right-[-6px] top-1/2 -translate-y-1/2' : ''}
              ${position === 'right' ? 'left-[-6px] top-1/2 -translate-y-1/2' : ''}
            `}
          />
        </div>
      )}
    </div>
  );
};

// Example usage component for documentation
export const PremiumHoverCardExample: React.FC = () => {
  const exampleServiceItem: ItemMetadata = {
    id: 'inv-12345',
    name: 'Pamphlet Printing',
    description: 'Pamphlet',
    category: 'service',
    type: 'INVOICE',
    pricing: {
      unitPrice: 2.50,
      totalPrice: 900.00,
      currency: '$',
    },
    vatRegistered: true,
    serviceDetails: {
      totalPages: 180,
      copies: 2,
    },
  };

  const exampleProductItem: ItemMetadata = {
    id: 'prod-67890',
    name: 'Premium A4 Paper (500 sheets)',
    description: 'Premium A4 Paper',
    category: 'product',
    type: 'ORDER',
    pricing: {
      unitPrice: 12.99,
      totalPrice: 129.90,
      currency: '$',
    },
    vatRegistered: true,
    productDetails: {
      sku: 'PAPER-A4-500',
      stockLevel: 150,
      unitOfMeasure: 'reams',
    },
  };

  return (
    <div className="p-8 space-y-8 bg-slate-100 min-h-screen">
      <h2 className="text-2xl font-bold text-slate-800 mb-6">Premium Hover Card Examples</h2>
      
      {/* Service Item Example */}
      <div className="flex items-center gap-4">
        <PremiumHoverCard item={exampleServiceItem} position="top">
          <button className="px-6 py-3 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 transition-all shadow-lg hover:shadow-xl active:scale-95">
            Hover for Service Details
          </button>
        </PremiumHoverCard>
        <span className="text-sm text-slate-500">Service type with simplified format</span>
      </div>

      {/* Product Item Example */}
      <div className="flex items-center gap-4">
        <PremiumHoverCard item={exampleProductItem} position="right">
          <button className="px-6 py-3 bg-emerald-600 text-white rounded-xl font-medium hover:bg-emerald-700 transition-all shadow-lg hover:shadow-xl active:scale-95">
            Hover for Product Details
          </button>
        </PremiumHoverCard>
        <span className="text-sm text-slate-500">Physical product with stock info</span>
      </div>

      {/* POS Item Example (shows standard format even for services) */}
      <div className="flex items-center gap-4">
        <PremiumHoverCard 
          item={{ ...exampleServiceItem, type: 'POS' }} 
          position="bottom"
        >
          <button className="px-6 py-3 bg-purple-600 text-white rounded-xl font-medium hover:bg-purple-700 transition-all shadow-lg hover:shadow-xl active:scale-95">
            POS Receipt Item
          </button>
        </PremiumHoverCard>
        <span className="text-sm text-slate-500">POS format (standard display)</span>
      </div>
    </div>
  );
};

export default PremiumHoverCard;
