import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { PortalCatalogItem, PortalCatalogVariant } from '../services/portalApiClient';

export interface CartItem {
  product: PortalCatalogItem;
  selectedVariant?: PortalCatalogVariant | null;
  quantity: number;
}

/** Unique key for a cart entry: product id + variant id (or empty). */
const cartKey = (p: PortalCatalogItem, v?: PortalCatalogVariant | null) =>
  v ? `${p.id}::${v.id}` : p.id;

interface CartContextValue {
  items: CartItem[];
  itemCount: number;
  total: number;
  addItem: (product: PortalCatalogItem, quantity?: number, variant?: PortalCatalogVariant | null) => void;
  removeItem: (key: string) => void;
  updateQuantity: (key: string, quantity: number) => void;
  clearCart: () => void;
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
}

const CartContext = createContext<CartContextValue | null>(null);

export const useCart = (): CartContextValue => {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used within CartProvider');
  return ctx;
};

export const CartProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [items, setItems] = useState<CartItem[]>([]);
  const [isOpen, setIsOpen] = useState(false);

  const addItem = useCallback((product: PortalCatalogItem, quantity = 1, variant?: PortalCatalogVariant | null) => {
    setItems((prev) => {
      const key = cartKey(product, variant);
      const existing = prev.find((i) => cartKey(i.product, i.selectedVariant) === key);
      if (existing) {
        return prev.map((i) =>
          cartKey(i.product, i.selectedVariant) === key ? { ...i, quantity: i.quantity + quantity } : i
        );
      }
      return [...prev, { product, selectedVariant: variant || null, quantity }];
    });
  }, []);

  const removeItem = useCallback((key: string) => {
    setItems((prev) => prev.filter((i) => cartKey(i.product, i.selectedVariant) !== key));
  }, []);

  const updateQuantity = useCallback((key: string, quantity: number) => {
    if (quantity <= 0) {
      setItems((prev) => prev.filter((i) => cartKey(i.product, i.selectedVariant) !== key));
    } else {
      setItems((prev) =>
        prev.map((i) => (cartKey(i.product, i.selectedVariant) === key ? { ...i, quantity } : i))
      );
    }
  }, []);

  const clearCart = useCallback(() => setItems([]), []);

  const value = useMemo(() => ({
    items,
    itemCount: items.reduce((sum, i) => sum + i.quantity, 0),
    total: items.reduce((sum, i) => {
      const price = i.selectedVariant
        ? Number(i.selectedVariant.sellingPrice || i.product.unitPrice || i.product.price || 0)
        : Number(i.product.unitPrice || i.product.price || 0);
      return sum + price * i.quantity;
    }, 0),
    addItem,
    removeItem,
    updateQuantity,
    clearCart,
    isOpen,
    setIsOpen,
  }), [items, addItem, removeItem, updateQuantity, clearCart, isOpen]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
};
