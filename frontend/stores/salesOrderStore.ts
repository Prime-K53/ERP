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
    // Tenant isolation: enforced server-side when company_id is added to sales_orders.
    // assertTenantSafe() exists but requires companyConfig from React context; not wired here intentionally.
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
    // Terminal status protection at store level
    const existingOrder = get().salesOrders.find((o) => o.id === canonical.id);
    if (existingOrder) {
      const existingCanonical = salesOrderService.canonicalizeStatus(existingOrder.status);
      if (salesOrderService.isTerminalStatus(existingCanonical) && canonical.status === existingCanonical) {
        // Status unchanged — this is a field update on a terminal order (e.g. marking invoiced).
        // Allow it only for specific non-destructive fields.
        const allowedTerminalFields = ['invoiceId', 'invoiceNumber', 'invoiceStatus', 'conversionDetails', 'convertedJobTicketId', 'linkedWorkOrderId'];
        const patchKeys = Object.keys(order).filter(k => k !== 'id' && k !== 'status');
        const disallowedKeys = patchKeys.filter(k => !allowedTerminalFields.includes(k));
        if (disallowedKeys.length > 0) {
          throw new Error(`Cannot modify fields [${disallowedKeys.join(', ')}] on a sales order in terminal status: ${existingCanonical}`);
        }
      }
    }
    await api.sales.saveSalesOrder(canonical);
    set((state) => ({
      salesOrders: state.salesOrders.map((o) => (o.id === canonical.id ? canonical : o)),
    }));
  },

  deleteSalesOrder: async (id) => {
    const existingOrder = get().salesOrders.find((o) => o.id === id);
    if (existingOrder) {
      const canonical = salesOrderService.canonicalizeStatus(existingOrder.status);
      if (salesOrderService.isTerminalStatus(canonical)) {
        throw new Error(`Cannot delete a sales order in terminal status: ${canonical}`);
      }
    }
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