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
    <div className="p-4 border rounded">
      <h3 className="text-lg font-medium">Order {order.id}</h3>
      <p>Customer: {order.customerId || '-'}</p>
      <p>Status: {order.status}</p>
      <p>Total: {order.total}</p>
      <div className="mt-2">
        <h4 className="font-semibold">Items</h4>
        <ul>
          {(order.items || []).map((it: any) => (
            <li key={it.id}>{it.product_name || it.product_name || it.id} — {it.quantity} × {it.unit_price}</li>
          ))}
        </ul>
      </div>
      <div className="mt-3 flex gap-2">
        <button onClick={convert} className="px-3 py-1 bg-white border rounded">Convert to Invoice</button>
        {order.status === 'Draft' && (
          <button onClick={() => setStatus('Confirmed')} className="px-3 py-1 bg-blue-600 text-white rounded">Confirm</button>
        )}
        {order.status === 'Confirmed' && (
          <button onClick={() => setStatus('Processing')} className="px-3 py-1 bg-amber-500 text-white rounded">Start Processing</button>
        )}
        {order.status === 'Processing' && (
          <button onClick={() => setStatus('Fulfilled')} className="px-3 py-1 bg-emerald-600 text-white rounded">Mark Fulfilled</button>
        )}
        {order.status !== 'Cancelled' && (
          <button onClick={() => setStatus('Cancelled')} className="px-3 py-1 bg-rose-500 text-white rounded">Cancel</button>
        )}
      </div>
    </div>
  );
};

export default SalesOrderDetail;
