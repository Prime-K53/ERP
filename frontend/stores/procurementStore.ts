import { create } from 'zustand';
import { logger } from '@/services/logger';
import { Purchase, GoodsReceipt, SubcontractOrder, Supplier } from '../types';
import { api } from '../services/api';
import { transactionService } from '../services/transactionService';
import { generateNextId } from '../utils/helpers';

interface ProcurementState {
  purchases: Purchase[];
  goodsReceipts: GoodsReceipt[];
  subcontractOrders: SubcontractOrder[];
  suppliers: Supplier[];
  isLoading: boolean;

  fetchProcurementData: () => Promise<void>;
  addPurchase: (purchase: Purchase) => Promise<void>;
  updatePurchase: (purchase: Purchase) => Promise<void>;
  approvePurchase: (id: string) => Promise<{ success: boolean; apEntryId?: string }>;
  cancelPurchase: (id: string, reason: string) => Promise<{ success: boolean }>;
  
  addGoodsReceipt: (gr: GoodsReceipt) => Promise<void>;
  updateGoodsReceipt: (gr: GoodsReceipt) => Promise<void>;
  deleteGoodsReceipt: (id: string) => Promise<void>;

  addSubcontractOrder: (order: SubcontractOrder) => Promise<void>;
  updateSubcontractOrder: (order: SubcontractOrder) => Promise<void>;
  deleteSubcontractOrder: (id: string) => Promise<void>;

  addSupplier: (supplier: Supplier) => Promise<Supplier>;
  updateSupplier: (supplier: Supplier) => Promise<void>;
  deleteSupplier: (id: string) => Promise<void>;
}

export const useProcurementStore = create<ProcurementState>((set, get) => ({
  purchases: [],
  goodsReceipts: [],
  subcontractOrders: [],
  suppliers: [],
  isLoading: false,

  fetchProcurementData: async () => {
    set({ isLoading: true });
    try {
      const [purchases, goodsReceipts, subcontractOrders, suppliers] = await Promise.all([
        api.procurement.getPurchases(),
        api.procurement.getGoodsReceipts(),
        api.procurement.getSubcontractOrders(),
        api.suppliers.getAll()
      ]);
      set({ purchases, goodsReceipts, subcontractOrders, suppliers });
    } catch (error) {
      logger.error("Failed to load procurement data", error);
    } finally {
      set({ isLoading: false });
    }
  },

  addPurchase: async (purchase) => {
    const prev = get().purchases;
    const newPurchase = { ...purchase, id: purchase.id || generateNextId('PO', get().purchases) };
    set(state => ({ purchases: [...state.purchases, newPurchase] }));
    try {
      await api.procurement.savePurchase(newPurchase);
    } catch (error) {
      set({ purchases: prev });
      throw error;
    }
  },

  updatePurchase: async (purchase) => {
    const prev = get().purchases;
    set(state => ({ purchases: state.purchases.map(p => p.id === purchase.id ? purchase : p) }));
    try {
      await api.procurement.savePurchase(purchase);
    } catch (error) {
      set({ purchases: prev });
      throw error;
    }
  },

  approvePurchase: async (id: string) => {
    const result = await transactionService.approvePurchaseOrder(id);
    if (result.success) {
      set(state => ({
        purchases: state.purchases.map(p =>
          p.id === id ? { ...p, status: 'Approved', paymentStatus: 'Approved' } : p
        )
      }));
    }
    return result;
  },

  cancelPurchase: async (id: string, reason: string) => {
    const result = await transactionService.cancelPurchaseOrder(id, reason);
    if (result.success) {
      set(state => ({
        purchases: state.purchases.map(p =>
          p.id === id ? { ...p, status: 'Cancelled', paymentStatus: 'Cancelled' } : p
        )
      }));
    }
    return result;
  },

  addGoodsReceipt: async (gr) => {
    const prev = get().goodsReceipts;
    const newGR = { ...gr, id: gr.id || generateNextId('GRN', get().goodsReceipts) };
    set(state => ({ goodsReceipts: [...state.goodsReceipts, newGR] }));
    try {
      await transactionService.processGoodsReceipt(newGR);
    } catch (error) {
      set({ goodsReceipts: prev });
      throw error;
    }
  },

  updateGoodsReceipt: async (gr) => {
    const prev = get().goodsReceipts;
    set(state => ({ goodsReceipts: state.goodsReceipts.map(g => g.id === gr.id ? gr : g) }));
    try {
      await api.procurement.saveGoodsReceipt(gr);
    } catch (error) {
      set({ goodsReceipts: prev });
      throw error;
    }
  },

  deleteGoodsReceipt: async (id) => {
    const prev = get().goodsReceipts;
    set(state => ({ goodsReceipts: state.goodsReceipts.filter(g => g.id !== id) }));
    try {
      await api.procurement.deleteGoodsReceipt(id);
    } catch (error) {
      set({ goodsReceipts: prev });
      throw error;
    }
  },

  addSubcontractOrder: async (order) => {
    const prev = get().subcontractOrders;
    const newOrder = { ...order, id: order.id || generateNextId('SUB', get().subcontractOrders) };
    set(state => ({ subcontractOrders: [...state.subcontractOrders, newOrder] }));
    try {
      await api.procurement.saveSubcontractOrder(newOrder);
    } catch (error) {
      set({ subcontractOrders: prev });
      throw error;
    }
  },

  updateSubcontractOrder: async (order) => {
    const prev = get().subcontractOrders;
    set(state => ({ subcontractOrders: state.subcontractOrders.map(o => o.id === order.id ? order : o) }));
    try {
      await api.procurement.saveSubcontractOrder(order);
    } catch (error) {
      set({ subcontractOrders: prev });
      throw error;
    }
  },

  deleteSubcontractOrder: async (id) => {
    const prev = get().subcontractOrders;
    set(state => ({ subcontractOrders: state.subcontractOrders.filter(o => o.id !== id) }));
    try {
      await api.procurement.deleteSubcontractOrder(id);
    } catch (error) {
      set({ subcontractOrders: prev });
      throw error;
    }
  },

  addSupplier: async (supplier) => {
    const prev = get().suppliers;
    const requestedId = String(supplier.id || '').trim();
    const idInUse = requestedId
      ? prev.some(existingSupplier => existingSupplier.id === requestedId)
      : false;
    const newSupplier = {
      ...supplier,
      id: requestedId && !idInUse ? requestedId : generateNextId('SUP', prev)
    };
    set(state => ({ suppliers: [...state.suppliers, newSupplier] }));
    try {
      await api.suppliers.create(newSupplier);
      return newSupplier;
    } catch (error) {
      set({ suppliers: prev });
      throw error;
    }
  },

  updateSupplier: async (supplier) => {
    const prev = get().suppliers;
    set(state => ({ suppliers: state.suppliers.map(s => s.id === supplier.id ? supplier : s) }));
    try {
      await api.suppliers.update(supplier);
    } catch (error) {
      set({ suppliers: prev });
      throw error;
    }
  },

  deleteSupplier: async (id) => {
    const prev = get().suppliers;
    set(state => ({ suppliers: state.suppliers.filter(s => s.id !== id) }));
    try {
      await api.suppliers.deleteSupplier(id);
    } catch (error) {
      set({ suppliers: prev });
      throw error;
    }
  }
}));
