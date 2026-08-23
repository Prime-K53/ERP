import { create } from 'zustand';
import { logger } from '@/services/logger';
import { Sale, Quotation, JobOrder, HeldOrder, ZReport, CustomerPayment, Shipment, Customer, SalesExchange, ReprintJob, DeliveryNote, SalesOrder } from '../types';
import { api } from '../services/api';
import { transactionService } from '../services/transactionService';
import { useSalesOrderStore } from './salesOrderStore';
import { generateCustomerId, generateNextId } from '../utils/helpers';
import { customerNotificationService } from '../services/customerNotificationService';
import { adminLifecycle, type PortalCredentials } from '../services/adminPortalClient';

const buildDeliveryNotePatchFromShipment = (shipment: Shipment): Partial<DeliveryNote> | undefined => {
  if (!shipment.orderId) return undefined;

  const mappedStatus: DeliveryNote['status'] | undefined =
    shipment.status === 'Delivered'
      ? 'Delivered'
      : shipment.status === 'In Transit'
        ? 'In Transit'
        : undefined;

  return {
    id: shipment.orderId,
    status: mappedStatus,
    carrier: shipment.carrier,
    driverName: shipment.driverName,
    vehicleNo: shipment.vehicleNo,
    trackingNumber: shipment.trackingNumber,
    estimatedDelivery: shipment.estimatedDelivery,
    actualArrival: shipment.actualArrival,
    currentLocation: shipment.currentLocation,
    proofOfDelivery: shipment.proofOfDelivery
  };
};

interface SalesState {
  sales: Sale[];
  quotations: Quotation[];
  jobOrders: JobOrder[];
  heldOrders: HeldOrder[];
  zReports: ZReport[];
  customerPayments: CustomerPayment[];
  shipments: Shipment[];
  customers: Customer[];
  salesExchanges: SalesExchange[];
  salesOrders: SalesOrder[];
  reprintJobs: ReprintJob[];
  isLoading: boolean;

  addSalesOrder: (order: SalesOrder) => Promise<void>;
  updateSalesOrder: (order: SalesOrder) => Promise<void>;
  deleteSalesOrder: (id: string) => Promise<void>;

  fetchSalesData: (silent?: boolean) => Promise<void>;
  fetchExchanges: () => Promise<void>;
  
  addSale: (sale: Sale) => Promise<void>;
  updateSale: (sale: Sale) => Promise<void>;
  
  addQuotation: (quotation: Quotation) => Promise<Quotation>;
  updateQuotation: (quotation: Quotation) => Promise<void>;
  deleteQuotation: (id: string) => Promise<void>;
  
  addJobOrder: (jobOrder: JobOrder) => Promise<void>;
  updateJobOrder: (jobOrder: JobOrder) => Promise<void>;
  deleteJobOrder: (id: string) => Promise<void>;
  
  addHeldOrder: (order: HeldOrder) => Promise<void>;
  deleteHeldOrder: (id: string) => Promise<void>;
  
  addCustomerPayment: (payment: CustomerPayment) => Promise<void>;
  updateCustomerPayment: (payment: CustomerPayment) => Promise<void>;
  deleteCustomerPayment: (id: string) => Promise<void>;
  permanentlyDeleteCustomerPayment: (id: string) => Promise<void>;

  addShipment: (shipment: Shipment, deliveryNotePatch?: Partial<DeliveryNote>) => Promise<void>;
  updateShipment: (shipment: Shipment, deliveryNotePatch?: Partial<DeliveryNote>) => Promise<void>;
  deleteShipment: (id: string) => Promise<void>;

  addCustomer: (customer: Customer, options?: { invite?: boolean }) => Promise<PortalCredentials | null>;
  updateCustomer: (customer: Customer) => Promise<void>;
  deleteCustomer: (id: string) => Promise<void>;

  createSalesExchange: (exchange: any) => Promise<void>;
  approveSalesExchange: (id: string, comments: string) => Promise<void>;
  deleteSalesExchange: (id: string) => Promise<void>;
  cancelSalesExchange: (id: string) => Promise<void>;
  bulkCancelSalesExchanges: (ids: string[]) => Promise<void>;
  updateReprintJob: (id: string, data: any) => Promise<void>;
}

export const useSalesStore = create<SalesState>((set, get) => ({
  sales: [],
  quotations: [],
  jobOrders: [],
  heldOrders: [],
  zReports: [],
  customerPayments: [],
  shipments: [],
  customers: [],
  salesExchanges: [],
  salesOrders: [],
  reprintJobs: [],
  isLoading: false,

  fetchSalesData: async (silent = false) => {
    if (!silent) set({ isLoading: true });
    try {
      // Sales Orders are fetched from the canonical salesOrderStore, not duplicated here.
      await useSalesOrderStore.getState().fetchSalesOrders(true);
      const [sales, quotations, jobOrders, customerPayments, shipments, customers, salesExchanges, reprintJobs] = await Promise.all([
        api.sales.getAllSales(),
        api.sales.getQuotations(),
        api.sales.getJobOrders(),
        api.sales.getCustomerPayments(),
        api.sales.getShipments(),
        api.customers.getAll().then(list => (list as Array<Record<string, unknown>>).filter(c => !c.deletedAt)),
        api.sales.getSalesExchanges(),
        api.sales.getReprintJobs(),
      ]);

      set({ sales, quotations, jobOrders, customerPayments, shipments, customers, salesExchanges, reprintJobs, salesOrders: useSalesOrderStore.getState().salesOrders });
    } catch (error) {
      logger.error("Failed to load sales data", error);
    } finally {
      if (!silent) set({ isLoading: false });
    }
  },

  fetchExchanges: async () => {
    try {
      const [salesExchanges, reprintJobs] = await Promise.all([
        api.sales.getSalesExchanges(),
        api.sales.getReprintJobs()
      ]);
      set({ salesExchanges, reprintJobs });
    } catch (error) {
      logger.error("Failed to fetch exchanges", error);
    }
  },

  addSale: async (sale) => {
    const newSale = { ...sale, id: sale.id || generateNextId('SALE', get().sales) };
    const prev = get().sales;
    set(state => ({ sales: [...state.sales, newSale] }));
    try {
      await api.sales.createSale(newSale);
    } catch (error) {
      set({ sales: prev });
      throw error;
    }
    if (newSale.customerPhone) {
      await customerNotificationService.triggerNotification('SALES_ORDER', {
        id: newSale.id,
        customerName: newSale.customerName,
        phoneNumber: newSale.customerPhone,
        amount: newSale.total ? `${newSale.currency || 'KES'} ${Number(newSale.total).toLocaleString()}` : '',
      });
    }
  },
  updateSale: async (sale) => {
    const prev = get().sales;
    set(state => ({ sales: state.sales.map(s => s.id === sale.id ? sale : s) }));
    try {
      await transactionService.updateSale(sale);
    } catch (error) {
      set({ sales: prev });
      throw error;
    }
  },

  addQuotation: async (quotation) => {
    const newQuotation = { ...quotation, id: quotation.id || generateNextId('QTN', get().quotations) };
    const prev = get().quotations;
    set(state => ({ quotations: [...state.quotations, newQuotation] }));
    try {
      await api.sales.saveQuotation(newQuotation);
    } catch (error) {
      set({ quotations: prev });
      throw error;
    }
    if (newQuotation.customerPhone) {
      await customerNotificationService.triggerNotification('QUOTATION', {
        id: newQuotation.id,
        customerName: newQuotation.customerName,
        phoneNumber: newQuotation.customerPhone,
        amount: newQuotation.total ? `${newQuotation.currency || 'KES'} ${Number(newQuotation.total).toLocaleString()}` : '',
      });
    }
    return newQuotation;
  },
  updateQuotation: async (quotation) => {
    const prev = get().quotations;
    set(state => ({ quotations: state.quotations.map(q => q.id === quotation.id ? quotation : q) }));
    try {
      await api.sales.saveQuotation(quotation);
    } catch (error) {
      set({ quotations: prev });
      throw error;
    }
  },
  deleteQuotation: async (id) => {
    const prev = get().quotations;
    set(state => ({ quotations: state.quotations.filter(q => q.id !== id) }));
    try {
      await api.sales.deleteQuotation(id);
    } catch (error) {
      set({ quotations: prev });
      throw error;
    }
  },

  addJobOrder: async (jobOrder) => {
    const newJob = { ...jobOrder, id: jobOrder.id || generateNextId('JO', get().jobOrders) };
    const prev = get().jobOrders;
    set(state => ({ jobOrders: [...state.jobOrders, newJob] }));
    try {
      await api.sales.saveJobOrder(newJob);
    } catch (error) {
      set({ jobOrders: prev });
      throw error;
    }
  },
  updateJobOrder: async (jobOrder) => {
    const prev = get().jobOrders;
    set(state => ({ jobOrders: state.jobOrders.map(j => j.id === jobOrder.id ? jobOrder : j) }));
    try {
      await api.sales.saveJobOrder(jobOrder);
    } catch (error) {
      set({ jobOrders: prev });
      throw error;
    }
  },
  deleteJobOrder: async (id) => {
    const prev = get().jobOrders;
    set(state => ({ jobOrders: state.jobOrders.filter(j => j.id !== id) }));
    try {
      await api.sales.deleteJobOrder(id);
    } catch (error) {
      set({ jobOrders: prev });
      throw error;
    }
  },

  addHeldOrder: async (order) => {
    const prev = get().heldOrders;
    const newOrder = { ...order };
    set(state => ({ heldOrders: [...state.heldOrders, newOrder] }));
    try {
      await api.sales.saveHeldOrder(newOrder);
    } catch (error) {
      set({ heldOrders: prev });
      throw error;
    }
  },
  deleteHeldOrder: async (id) => {
      set(state => ({ heldOrders: state.heldOrders.filter(h => h.id !== id) }));
  },

addCustomerPayment: async (payment) => {
      const newPayment = { ...payment, id: payment.id || generateNextId('RCPT', get().customerPayments) };
      const prev = get().customerPayments;
      set(state => ({ customerPayments: [...state.customerPayments, newPayment] }));
      try {
        await api.sales.saveCustomerPayment(newPayment);
      } catch (error) {
        set({ customerPayments: prev });
        throw error;
      }
      if (newPayment.customerPhone) {
        await customerNotificationService.triggerNotification('PAYMENT', {
          id: newPayment.id,
          customerName: newPayment.customerName,
          phoneNumber: newPayment.customerPhone,
          amount: newPayment.amount ? `${newPayment.currency || 'KES'} ${Number(newPayment.amount).toLocaleString()}` : '',
        });
      }
    },
  updateCustomerPayment: async (payment) => {
      const prev = get().customerPayments;
      set(state => ({ customerPayments: state.customerPayments.map(p => p.id === payment.id ? payment : p) }));
      try {
        await api.sales.saveCustomerPayment(payment);
      } catch (error) {
        set({ customerPayments: prev });
        throw error;
      }
  },
  deleteCustomerPayment: async (id) => {
      const prev = get().customerPayments;
      set(state => ({ customerPayments: state.customerPayments.filter(p => p.id !== id) }));
      try {
        await api.sales.deleteCustomerPayment(id);
      } catch (error) {
        set({ customerPayments: prev });
        throw error;
      }
  },
  permanentlyDeleteCustomerPayment: async (id) => {
      const prev = get().customerPayments;
      set(state => ({ customerPayments: state.customerPayments.filter(p => p.id !== id) }));
      try {
        await api.sales.permanentlyDeleteCustomerPayment(id);
      } catch (error) {
        set({ customerPayments: prev });
        throw error;
      }
  },

  addShipment: async (shipment, deliveryNotePatch) => {
    const newShipment = { ...shipment, id: shipment.id || generateNextId('SHP', get().shipments) };
    const prev = get().shipments;
    set(state => ({ shipments: [...state.shipments, newShipment] }));
    try {
      await transactionService.updateShipmentStatus(newShipment, deliveryNotePatch || buildDeliveryNotePatchFromShipment(newShipment));
    } catch (error) {
      set({ shipments: prev });
      throw error;
    }
  },

  updateShipment: async (shipment, deliveryNotePatch) => {
    const prev = get().shipments;
    set(state => ({ shipments: state.shipments.map(s => s.id === shipment.id ? shipment : s) }));
    try {
      await transactionService.updateShipmentStatus(shipment, deliveryNotePatch || buildDeliveryNotePatchFromShipment(shipment));
    } catch (error) {
      set({ shipments: prev });
      throw error;
    }
  },

  deleteShipment: async (id) => {
    const prev = get().shipments;
    set(state => ({ shipments: state.shipments.filter(s => s.id !== id) }));
    try {
      await api.sales.deleteShipment(id);
    } catch (error) {
      set({ shipments: prev });
      throw error;
    }
  },

  addCustomer: async (customer, options = {}): Promise<PortalCredentials | null> => {
    const newCustomer = { ...customer, id: customer.id || generateCustomerId(get().customers) };
    const prev = get().customers;
    set(state => ({ customers: [...state.customers, newCustomer] }));
    try {
      await api.customers.save(newCustomer);
      import('../services/engagementEngine').then(({ engagementEngine }) =>
        engagementEngine.emit('customer.created', {
          source: 'salesStore',
          entityType: 'customer',
          entityId: newCustomer.id,
          data: { customerId: newCustomer.id },
          correlationId: `customer-${newCustomer.id}`,
        }).catch(err =>
          console.error('Engagement customer.created processing failed:', err)
        )
      );
      let credentials: PortalCredentials | null = null;
      try {
        const portalAccount = await adminLifecycle.users.autoCreate({
          customer_id: newCustomer.id,
          name: newCustomer.name,
          email: newCustomer.email,
          phone: newCustomer.phone,
          invite: options.invite,
        });
        if (portalAccount?.user) {
          const isInvite = options.invite && !!portalAccount.invite_code;
          credentials = {
            email: portalAccount.user.email,
            password: isInvite ? null : portalAccount.generated_password,
            inviteCode: portalAccount.invite_code ?? null,
            userId: portalAccount.user.id,
          };
          const enriched = {
            ...newCustomer,
            portalUserId: portalAccount.user.id,
            portalEmail: portalAccount.user.email,
            portalStatus: portalAccount.user.status || (isInvite ? 'invited' : 'active'),
          };
          set(state => ({ customers: state.customers.map(c => c.id === enriched.id ? enriched : c) }));
          await api.customers.save(enriched).catch(() => {});
        }
      } catch (portalErr: any) {
        console.warn(`Portal provisioning skipped for ${newCustomer.id}:`, portalErr?.message || portalErr);
      }
      return credentials;
    } catch (error) {
      set({ customers: prev });
      throw error;
    }
  },
  updateCustomer: async (customer) => {
    const prev = get().customers;
    set(state => ({ customers: state.customers.map(c => c.id === customer.id ? customer : c) }));
    try {
      await api.customers.save(customer);
    } catch (error) {
      set({ customers: prev });
      throw error;
    }
  },
  deleteCustomer: async (id) => {
    const prev = get().customers;
    set(state => ({ customers: state.customers.filter(c => c.id !== id) }));
    try {
      await api.customers.delete(id);
    } catch (error) {
      set({ customers: prev });
      throw error;
    }
  },

  // Pure facade — delegates entirely to the canonical salesOrderStore.
  // No local ID generation: server-authoritative numbering (SO-YYYY-######).
  addSalesOrder: async (order) => {
    await useSalesOrderStore.getState().createSalesOrder(order);
  },
  updateSalesOrder: async (order) => {
    await useSalesOrderStore.getState().updateSalesOrder(order);
  },
  deleteSalesOrder: async (id) => {
    await useSalesOrderStore.getState().deleteSalesOrder(id);
  },

  createSalesExchange: async (exchange) => {
    try {
      await api.sales.createSalesExchange(exchange);
      await get().fetchExchanges();
    } catch (error) {
      logger.error('createSalesExchange error:', error);
      throw error; // Re-throw to let the caller handle it
    }
  },
  approveSalesExchange: async (id, comments) => {
    await api.sales.approveSalesExchange(id, comments);
    await get().fetchExchanges();
  },
  deleteSalesExchange: async (id) => {
    await api.sales.deleteSalesExchange(id);
    await get().fetchExchanges();
  },
  cancelSalesExchange: async (id) => {
    await api.sales.cancelSalesExchange(id);
    await get().fetchExchanges();
  },
  bulkCancelSalesExchanges: async (ids) => {
    await transactionService.bulkCancelSalesExchanges(ids);
    await get().fetchExchanges();
  },
  updateReprintJob: async (id, data) => {
    await api.sales.updateReprintJob(id, data);
    await get().fetchExchanges();
  }
}));
