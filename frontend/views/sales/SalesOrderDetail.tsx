import React from 'react';
import { useSales } from '../../context/SalesContext';
import { useFinanceStore } from '../../stores/financeStore';
import { useSalesStore } from '../../stores/salesStore';

const SalesOrderDetail: React.FC<{ id?: string }> = ({ id }) => {
  const { salesOrders } = useSales() as { salesOrders: any[] };
  const { addInvoice } = useFinanceStore();
  const { updateSalesOrder, fetchSalesData } = useSalesStore();
  const order = (salesOrders || []).find((o: any) => o.id === id);

  if (!order) return <div>Select an order to view details</div>;

  const convert = async () => {
    const invoice = {
      customerId: order.customerId,
      customerName: order.customerName || '',
      date: new Date().toISOString(),
      dueDate: order.deliveryDate || null,
      lines: (order.items || []).map((it: any) => ({ itemId: it.product_id || it.id, description: it.product_name || it.description || '', quantity: it.quantity, unitPrice: it.unit_price || it.unitPrice || 0, total: it.line_total || (it.quantity * (it.unit_price || it.unitPrice || 0)) })),
      totalAmount: order.total || 0,
      status: 'Unpaid',
      sourceOrderId: order.id
    };

    try {
      await addInvoice(invoice);
      alert('Converted to invoice');
    } catch (err: any) {
      alert('Failed to convert: ' + (err?.message || err));
    }
  };

  const setStatus = async (status: string) => {
    try {
      await updateSalesOrder({ ...order, status });
      await fetchSalesData();
      alert('Order status updated to ' + status);
    } catch (err: any) {
      alert('Failed to update status: ' + (err?.message || err));
    }
  };

  return (
    <div className="p-3 sm:p-4 border rounded-lg bg-white">
      <h3 className="text-base sm:text-lg font-medium mb-3">Order {order.id}</h3>
      <div className="space-y-2 text-sm">
        <p><span className="font-medium text-gray-500">Customer:</span> {order.customerId || '-'}</p>
        <p><span className="font-medium text-gray-500">Status:</span> {order.status}</p>
        <p><span className="font-medium text-gray-500">Total:</span> {order.total}</p>
      </div>
      <div className="mt-3">
        <h4 className="font-semibold text-sm mb-2">Items</h4>
        <ul className="space-y-1 text-sm">
          {(order.items || []).map((it: any) => (
            <li key={it.id} className="flex justify-between">
              <span className="truncate mr-2">{it.product_name || it.product_name || it.id}</span>
              <span className="flex-shrink-0">{it.quantity} x {it.unit_price}</span>
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
