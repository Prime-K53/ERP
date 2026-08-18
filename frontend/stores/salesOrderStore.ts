import { create } from 'zustand';
import { logger } from '@/services/logger';
import { SalesOrder, SalesOrderPayment } from '../types/salesOrder';
import { api } from '../services/api';
import { transactionService } from '../services/transactionService';
import { adminLifecycle } from '../services/adminPortalClient';
import {
  salesOrderService,
  MigrationReport,
  AdoptionResult,
} from '../services/salesOrderService';

interface SalesOrderState {
  salesOrders: SalesOrder[];
  isLoading: boolean;
  error: string | null;
  migrationReport: MigrationReport | null;

  fetchSalesOrders: (silent?: boolean) => Promise<void>;
  createSalesOrder: (order: SalesOrder) => Promise<SalesOrder>;
  createFinancialOrder: (order: SalesOrder) => Promise<void>;
  updateSalesOrder: (order: SalesOrder) => Promise<void>;
  deleteSalesOrder: (id: string) => Promise<void>;
  recordPayment: (orderId: string, payment: SalesOrderPayment) => Promise<void>;
  updateOrderStatus: (id: string, status: string) => Promise<void>;
  cancelOrder: (id: string, reason: string) => Promise<void>;
  adoptQuotationRequest: (
    prefill: { id: string; requestNumber?: string },
    order: SalesOrder,
  ) => Promise<AdoptionResult>;
  migrateLegacyOrders: () => Promise<MigrationReport>;
  runMigrationIfNeeded: () => Promise<void>;
}

export const useSalesOrderStore = create<SalesOrderState>((set, get) => ({
  salesOrders: [],
  isLoading: false,
  error: null,
  migrationReport: null,

  fetchSalesOrders: async (silent = false) => {
    if (!silent) set({ isLoading: true });
    try {
      const salesOrders = ((await api.sales.getSalesOrders()) || []) as unknown as SalesOrder[];
      set({ salesOrders, error: null });
    } catch (err: any) {
      set({ error: err?.message || String(err) });
      logger.error('Failed to load sales orders', err);
    } finally {
      if (!silent) set({ isLoading: false });
    }
  },

  createSalesOrder: async (order) => {
    const canonical = salesOrderService.canonicalizeOrder(order);
    const existing = get().salesOrders.find((o) => o.id === canonical.id);
    if (existing) {
      if (canonical.idempotencyKey && existing.idempotencyKey === canonical.idempotencyKey) {
        return existing;
      }
      throw new Error(`Sales order ${canonical.id} already exists`);
    }
    const errors = salesOrderService.validateOrder(canonical);
    if (errors.length > 0) throw new Error(errors.join('; '));
    await api.sales.saveSalesOrder(canonical);
    set((state) => ({ salesOrders: [...state.salesOrders, canonical] }));
    return canonical;
  },

  createFinancialOrder: async (order) => {
    await transactionService.createOrder(order as unknown as import('../types').Order);
    await get().fetchSalesOrders(true);
  },

  updateSalesOrder: async (order) => {
    const canonical = salesOrderService.canonicalizeOrder(order);
    await api.sales.saveSalesOrder(canonical);
    set((state) => ({
      salesOrders: state.salesOrders.map((o) => (o.id === canonical.id ? canonical : o)),
    }));
  },

  deleteSalesOrder: async (id) => {
    await api.sales.deleteSalesOrder(id);
    set((state) => ({ salesOrders: state.salesOrders.filter((o) => o.id !== id) }));
  },

  recordPayment: async (orderId, payment) => {
    await transactionService.recordOrderPayment(orderId, payment);
    await get().fetchSalesOrders(true);
  },

  updateOrderStatus: async (id, status) => {
    await transactionService.updateOrderStatus(id, status);
    await get().fetchSalesOrders(true);
  },

  cancelOrder: async (id, reason) => {
    await transactionService.cancelOrder(id, reason);
    await get().fetchSalesOrders(true);
  },

  adoptQuotationRequest: async (prefill, order) => {
    const result = await salesOrderService.adoptQuotationRequestAsSalesOrder(prefill, order, {
      persistLocal: async (local) => {
        await api.sales.saveSalesOrder(local);
        return local;
      },
      completeOrder: (requestId, payload) =>
        adminLifecycle.requests.completeOrder(requestId, payload),
      updateLocal: async (adopted) => {
        await api.sales.saveSalesOrder(adopted);
      },
    });
    await get().fetchSalesOrders(true);
    return result;
  },

  migrateLegacyOrders: async () => {
    const report = await salesOrderService.migrateLegacyOrders();
    set({ migrationReport: report });
    await get().fetchSalesOrders(true);
    return report;
  },

  runMigrationIfNeeded: async () => {
    if (get().migrationReport) return;
    const legacy = (await api.sales.getAllOrders()) || [];
    if (legacy.length === 0) return;
    await get().migrateLegacyOrders();
  },
}));