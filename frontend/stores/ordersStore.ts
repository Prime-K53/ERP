import { create } from 'zustand';
import { Order, OrderPayment } from '../types';
import { api } from '../services/api';

interface OrdersState {
  orders: Order[];
  isLoading: boolean;
  error: string | null;

  fetchOrders: () => Promise<void>;
  addOrder: (order: Order) => Promise<void>;
  updateOrderStatus: (id: string, status: Order['status']) => Promise<void>;
  recordPayment: (orderId: string, payment: OrderPayment) => Promise<void>;
  cancelOrder: (id: string, reason: string) => Promise<void>;
}

export const useOrdersStore = create<OrdersState>((set, get) => ({
  orders: [],
  isLoading: false,
  error: null,

  fetchOrders: async () => {
    set({ isLoading: true });
    try {
      const orders = await api.sales.getAllOrders();
      set({ orders, error: null });
    } catch (err: any) {
      set({ error: err.message });
    } finally {
      set({ isLoading: false });
    }
  },

  addOrder: async (order: Order) => {
    set({ isLoading: true });
    try {
      await api.sales.createOrder(order);
      await get().fetchOrders();
    } catch (err: any) {
      set({ error: err.message });
      throw err;
    } finally {
      set({ isLoading: false });
    }
  },

  updateOrderStatus: async (id: string, status: Order['status']) => {
    set({ isLoading: true });
    try {
      await api.sales.updateOrderStatus(id, status);
      await get().fetchOrders();
    } catch (err: any) {
      set({ error: err.message });
      throw err;
    } finally {
      set({ isLoading: false });
    }
  },

  recordPayment: async (orderId: string, payment: OrderPayment) => {
    set({ isLoading: true });
    try {
      await api.sales.recordOrderPayment(orderId, payment);
      await get().fetchOrders();
    } catch (err: any) {
      set({ error: err.message });
      throw err;
    } finally {
      set({ isLoading: false });
    }
  },

  cancelOrder: async (id: string, reason: string) => {
    set({ isLoading: true });
    try {
      await api.sales.cancelOrder(id, reason);
      await get().fetchOrders();
    } catch (err: any) {
      set({ error: err.message });
      throw err;
    } finally {
      set({ isLoading: false });
    }
  }
}));
