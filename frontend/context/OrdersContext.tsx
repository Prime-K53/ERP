import React, { createContext, useContext, useEffect, useState } from 'react';
import { logger } from '@/services/logger';
import { useOrdersStore } from '../stores/ordersStore';
import { Order, OrderPayment, OrderItem, Quotation } from '../types';
import { useAuth } from './AuthContext';
import { useSales } from './SalesContext';
import { generateNextId } from '../utils/helpers';
import { customerNotificationService } from '../services/customerNotificationService';
import { aggregateMarketAdjustmentSnapshots, attachPricingBreakdown, summarizePricingBreakdown } from '../utils/pricingBreakdown';

interface OrdersContextType {
  orders: Order[];
  isLoading: boolean;
  fetchOrders: () => Promise<void>;
  createOrder: (data: Partial<Order> & { items: OrderItem[] }) => Promise<void>;
  updateOrderStatus: (id: string, status: Order['status']) => Promise<void>;
  recordPayment: (orderId: string, payment: Partial<OrderPayment>) => Promise<void>;
  cancelOrder: (id: string, reason: string) => Promise<void>;
  getOrderById: (id: string) => Order | undefined;
  convertQuotationToOrder: (quotation: Quotation) => Promise<string>;
}

const OrdersContext = createContext<OrdersContextType | undefined>(undefined);

export const OrdersProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { orders, isLoading, fetchOrders, addOrder, updateOrderStatus, recordPayment, cancelOrder } = useOrdersStore();
  const { companyConfig, notify, user } = useAuth();
  const salesContext = useSales();

  useEffect(() => {
    fetchOrders();
  }, []);

  const toNum = (val: any, fallback = 0) => {
    if (typeof val === 'number') return isNaN(val) ? fallback : val;
    if (!val) return fallback;
    const cleaned = String(val).replace(/[^0-9.-]/g, '');
    const n = parseFloat(cleaned);
    return isNaN(n) ? fallback : n;
  };

  const findCustomerForNotification = (customerId?: string, customerName?: string) => {
    const normalizedId = String(customerId || '').trim();
    const normalizedName = String(customerName || '').trim().toLowerCase();

    return salesContext?.customers.find((customer) =>
      (normalizedId && String(customer.id || '').trim() === normalizedId)
      || (normalizedName && String(customer.name || '').trim().toLowerCase() === normalizedName)
    );
  };

  const triggerSalesOrderNotification = async (order: Partial<Order> & { id: string; orderNumber?: string; totalAmount?: number; customerName?: string; customerId?: string }) => {
    const customer = findCustomerForNotification(order.customerId, order.customerName);
    if (!customer?.phone) {
      return;
    }

    try {
      await customerNotificationService.triggerNotification('SALES_ORDER', {
        id: order.orderNumber || order.id,
        customerName: order.customerName || customer.name,
        phoneNumber: customer.phone,
        amount: `${companyConfig?.currencySymbol || ''}${Number(order.totalAmount || 0).toLocaleString()}`
      });
    } catch (notificationError) {
      logger.error(`[OrdersContext] Failed to trigger sales order notification for ${order.id}`, notificationError);
    }
  };

  const handleConvertQuotationToOrder = async (quotation: Quotation): Promise<string> => {
    try {
      const existingOrder = orders.find(o => o.quotationId === quotation.id);
      if (existingOrder) {
        notify('This quotation has already been converted to an order', 'warning');
        return existingOrder.id;
      }
      const orderNumber = generateNextId('ORD', orders, companyConfig);
      const conversionDate = new Date().toLocaleDateString();
      const acceptedBy = quotation.customerName || 'Customer';
      const conversionDetails = {
        sourceType: 'Quotation',
        sourceNumber: quotation.id,
        date: conversionDate,
        acceptedBy
      };

      const mappedItems = quotation.items.map(item => {
        const unitPrice = toNum(item.price || item.unitPrice || item.cost);
        const quantity = toNum(item.quantity || item.qty, 0);
        return {
          id: generateNextId('OI', []),
          orderId: '',
          productId: item.id || item.productId || 'N/A',
          productName: item.name || item.productName || item.description || 'N/A',
          quantity,
          unitPrice,
          subtotal: unitPrice * quantity,
          discount: item.discount || 0,
          parentId: item.parentId,
          pagesOverride: item.pagesOverride,
          pricingSource: item.pricingSource,
          adjustmentSnapshots: item.adjustmentSnapshots || [],
          adjustmentTotal: item.adjustmentTotal || 0,
          productionCostSnapshot: item.productionCostSnapshot
        };
      });

      const normalizedMappedItems = mappedItems.map((item: any) => attachPricingBreakdown({
        ...item,
        variantId: item.parentId ? item.productId : item.variantId,
        pricingBreakdown: item.pricingBreakdown,
        smartPricingSnapshot: item.smartPricingSnapshot
      }));
      const pricingSummary = summarizePricingBreakdown(normalizedMappedItems as unknown[]);
      const subtotal = normalizedMappedItems.reduce((sum, it) => sum + (toNum(it.subtotal)), 0);
      const discount = toNum(quotation.discount);
      const discountType = quotation.discountType || 'fixed';
      const discountRaw = toNum(quotation.discountRaw || 0);
      const totalAmount = subtotal - discount;

        const newOrder: Order & Record<string, any> = {
        id: orderNumber,
        idempotencyKey: crypto.randomUUID(),
        orderNumber,
        customerId: '', // Quotation might not have customerId directly, we might need to look it up by name
        customerName: quotation.customerName,
        orderDate: new Date().toISOString(),
        date: new Date().toISOString(),
        status: 'Pending',
        subtotal,
        totalAmount,
        discount,
        discountType,
        discountRaw,
        items: normalizedMappedItems,
        payments: [],
        paidAmount: 0,
        remainingBalance: totalAmount,
        createdBy: user?.id || 'System',
        quotationId: quotation.id,
        notes: [
          `Converted from [Quotation] #[${quotation.id}] on [${conversionDate}] as accepted by [${acceptedBy}]`,
          quotation.notes
        ].filter(Boolean).join('\n'),
        conversionDetails,
        adjustmentSnapshots: aggregateMarketAdjustmentSnapshots(normalizedMappedItems as unknown[]),
        adjustmentTotal: quotation.adjustmentTotal || pricingSummary.adjustmentTotal,
        materialTotal: quotation.materialTotal || pricingSummary.materialTotal,
        profitMarginTotal: quotation.profitMarginTotal || pricingSummary.profitMarginTotal,
        roundingTotal: quotation.roundingTotal || pricingSummary.roundingTotal,
        roundingDifference: quotation.roundingDifference || pricingSummary.roundingTotal,
        tax: quotation.tax,
        taxRate: quotation.taxRate
      };

      // Try to find customer ID and referral info from sales context customers
      if (salesContext) {
        const customer = salesContext.customers.find(c => c.name === quotation.customerName);
        if (customer) {
          newOrder.customerId = customer.id;
          newOrder.referredBy = customer.referredById || '';
          newOrder.referredByName = customer.referredByName || '';
        }
      }

      await addOrder(newOrder);
      await triggerSalesOrderNotification(newOrder);

      // Update quotation status to Converted
      if (salesContext) {
        await salesContext.updateQuotation({ ...quotation, status: 'Converted' });
      }

      notify("Quotation converted to Order successfully", "success");
      return newOrder.id;
    } catch (error: any) {
      notify(`Failed to convert quotation: ${error.message}`, "error");
      throw error;
    }
  };

  const handleCreateOrder = async (data: any) => {
    try {
      const orderNumber = data.orderNumber || data.id || generateNextId('ORD', orders, companyConfig);

      const subtotal = toNum(data.subtotal) || data.items.reduce((sum: number, it: any) => sum + (toNum(it.subtotal || (toNum(it.quantity || it.qty) * toNum(it.unitPrice || it.price || it.cost)))), 0);
      const discount = toNum(data.discount);
      const totalAmount = toNum(data.totalAmount) || (subtotal - discount);
      const normalizedItems = data.items.map((item: any) => attachPricingBreakdown({
        ...item,
        orderId: '',
        quantity: toNum(item.quantity || item.qty),
        unitPrice: toNum(item.unitPrice || item.price || item.cost),
        subtotal: toNum(item.subtotal || (toNum(item.quantity || item.qty) * toNum(item.unitPrice || item.price || item.cost)))
      }));
      const pricingSummary = summarizePricingBreakdown(normalizedItems as unknown[]);
      const refCustomer = salesContext?.customers.find((c: any) => c.id === data.customerId || c.name === data.customerName);

      const newOrder: Order = {
        id: orderNumber,
        idempotencyKey: crypto.randomUUID(),
        orderNumber,
        customerId: data.customerId || '',
        customerName: data.customerName || 'Walking Customer',
        orderDate: new Date().toISOString(),
        date: new Date().toISOString(),
        status: 'Pending',
        subtotal,
        totalAmount,
        discount,
        discountType: data.discountType || 'fixed',
        discountRaw: data.discountRaw || 0,
        items: normalizedItems,
        payments: [],
        paidAmount: 0,
        remainingBalance: totalAmount,
        createdBy: user?.id || 'System',
        notes: data.notes,
        shippingAddress: data.shippingAddress,
        billingAddress: data.billingAddress,
        referredBy: data.referredBy || refCustomer?.referredById || '',
        referredByName: data.referredByName || refCustomer?.referredByName || '',
        adjustmentSnapshots: data.adjustmentSnapshots || aggregateMarketAdjustmentSnapshots(normalizedItems as unknown[]),
        adjustmentTotal: data.adjustmentTotal || pricingSummary.adjustmentTotal,
        materialTotal: data.materialTotal || pricingSummary.materialTotal,
        profitMarginTotal: data.profitMarginTotal || pricingSummary.profitMarginTotal,
        roundingTotal: data.roundingTotal || pricingSummary.roundingTotal,
        roundingDifference: data.roundingDifference || pricingSummary.roundingTotal,
      };

      await addOrder(newOrder);
      await triggerSalesOrderNotification(newOrder);
      notify("Order created successfully", "success");
    } catch (error: any) {
      notify(`Failed to create order: ${error.message}`, "error");
      throw error;
    }
  };

  const handleRecordPayment = async (orderId: string, payment: Partial<OrderPayment>) => {
    try {
      const fullPayment: OrderPayment = {
        id: generateNextId('PAY', []),
        orderId,
        amount: payment.amountPaid || payment.amount || 0,
        method: payment.paymentMethod || payment.method || 'Cash',
        date: payment.paymentDate || payment.date || new Date().toISOString(),
        amountPaid: payment.amountPaid || 0,
        paymentMethod: payment.paymentMethod || 'Cash',
        paymentDate: new Date().toISOString(),
        recordedBy: user?.id || 'System',
        reference: payment.reference
      };

      await recordPayment(orderId, fullPayment);
      notify("Payment recorded successfully", "success");
    } catch (error: any) {
      notify(`Failed to record payment: ${error.message}`, "error");
      throw error;
    }
  };

  const handleUpdateStatus = async (id: string, status: Order['status']) => {
    try {
      await updateOrderStatus(id, status);
      notify(`Order status updated to ${status}`, "success");
    } catch (error: any) {
      notify(`Failed to update status: ${error.message}`, "error");
      throw error;
    }
  };

  const handleCancelOrder = async (id: string, reason: string) => {
    try {
      await cancelOrder(id, reason);
      notify("Order cancelled successfully", "success");
    } catch (error: any) {
      notify(`Failed to cancel order: ${error.message}`, "error");
      throw error;
    }
  };

  const getOrderById = (id: string) => orders.find(o => o.id === id);

  return (
    <OrdersContext.Provider value={{
      orders,
      isLoading,
      fetchOrders,
      createOrder: handleCreateOrder,
      updateOrderStatus: handleUpdateStatus,
      recordPayment: handleRecordPayment,
      cancelOrder: handleCancelOrder,
      getOrderById,
      convertQuotationToOrder: handleConvertQuotationToOrder
    }}>
      {children}
    </OrdersContext.Provider>
  );
};

export const useOrders = () => {
  const context = useContext(OrdersContext);
  if (context === undefined) {
    throw new Error('useOrders must be used within an OrdersProvider');
  }
  return context;
};
