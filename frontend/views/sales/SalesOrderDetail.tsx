import React from 'react';
import { useSalesOrderStore } from '../../stores/salesOrderStore';
import { useFinanceStore } from '../../stores/financeStore';
import { salesOrderService } from '../../services/salesOrderService';
import { toast } from '../../components/Toast';

const SalesOrderDetail: React.FC<{ id?: string }> = ({ id }) => {
  const { salesOrders, updateSalesOrder, fetchSalesOrders } = useSalesOrderStore();
  const { addInvoice } = useFinanceStore();
  const order = (salesOrders || []).find((o: any) => o.id === id);

  if (!order) return <div>Select an order to view details</div>;

  const convert = async () => {
    try {
      // Idempotency: if already invoiced, no-op
      if (order.invoiceId || order.invoiceStatus === 'Invoiced') {
        toast.info('This order has already been converted to an invoice');
        return;
      }
      const invoice = salesOrderService.buildInvoiceFromOrder(order);
      const invoiceId = await addInvoice(invoice);
      await updateSalesOrder({ ...order, ...salesOrderService.markInvoiced(order, invoiceId, invoice.invoiceNumber) });
      await fetchSalesOrders(true);
      toast.success('Converted to invoice');
    } catch (err: any) {
      toast.error('Failed to convert: ' + (err?.message || err));
    }
  };

  const setStatus = async (status: string) => {
    try {
      salesOrderService.assertCanTransition(order.status, status);
      await updateSalesOrder({ ...order, status });
      await fetchSalesOrders(true);
      toast.success('Order status updated to ' + status);
    } catch (err: any) {
      toast.error('Failed to update status: ' + (err?.message || err));
    }
  };

  return (
    <div className="p-3 sm:p-4 border rounded-lg bg-white">
      <h3 className="text-base sm:text-lg font-medium mb-3">Order {order.id}</h3>
      <div className="space-y-2 text-sm">
        <p><span className="font-medium text-gray-500">Customer:</span> {order.customerId || '-'}</p>
        <p><span className="font-medium text-gray-500">Status:</span> {order.status}</p>
        <p><span className="font-medium text-gray-500">Total:</span> {order.total ?? order.totalAmount}</p>
      </div>
      <div className="mt-3">
        <h4 className="font-semibold text-sm mb-2">Items</h4>
        <ul className="space-y-1 text-sm">
          {(order.items || []).map((it: any) => (
            <li key={it.id} className="flex justify-between">
              <span className="truncate mr-2">{it.productName || it.description || it.id}</span>
              <span className="flex-shrink-0">{it.quantity} x {it.unitPrice}</span>
            </li>
          ))}
        </ul>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <button onClick={convert} className="px-3 py-2 text-sm bg-white border rounded-lg">Convert to Invoice</button>
        {order.status === 'Draft' && (
          <button onClick={() => setStatus('Confirmed')} className="px-3 py-2 text-sm bg-blue-600 text-white rounded-lg">Confirm</button>
        )}
        {order.status === 'Confirmed' && (
          <button onClick={() => setStatus('Processing')} className="px-3 py-2 text-sm bg-amber-500 text-white rounded-lg">Start Processing</button>
        )}
        {order.status === 'Processing' && (
          <button onClick={() => setStatus('Fulfilled')} className="px-3 py-2 text-sm bg-emerald-600 text-white rounded-lg">Mark Fulfilled</button>
        )}
        {order.status !== 'Cancelled' && (
          <button onClick={() => setStatus('Cancelled')} className="px-3 py-2 text-sm bg-rose-500 text-white rounded-lg">Cancel</button>
        )}
      </div>
    </div>
  );
};

export default SalesOrderDetail;
