import React from 'react';
import { useSales } from '../../context/SalesContext';

const SalesOrderList: React.FC = () => {
  const { salesOrders, deleteSalesOrder } = useSales();

  return (
    <div>
      <h2>Sales Orders</h2>
      <table className="min-w-full table-auto">
        <thead>
          <tr>
            <th>ID</th>
            <th>Customer</th>
            <th>Date</th>
            <th>Status</th>
            <th>Total</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {(salesOrders || []).length === 0 ? (
            <tr>
              <td colSpan={6}>
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center mb-4">
                    <svg className="w-8 h-8 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                  </div>
                  <p className="text-slate-500 font-medium">No sales orders</p>
                  <p className="text-slate-400 text-sm mt-1">Sales orders will appear here once created.</p>
                </div>
              </td>
            </tr>
          ) : (salesOrders || []).map((o: any) => (
            <tr key={o.id}>
              <td>{o.id}</td>
              <td>{o.customerId || '-'}</td>
              <td>{o.orderDate?.split('T')[0] || '-'}</td>
              <td>{o.status}</td>
              <td>{o.total}</td>
              <td>
                <button className="btn" onClick={() => alert('Open order ' + o.id)}>Open</button>
                <button className="btn ml-2" onClick={() => deleteSalesOrder(o.id)}>Delete</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default SalesOrderList;
