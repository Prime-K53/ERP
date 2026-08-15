import React from 'react';
import { useSales } from '../../context/SalesContext';

const SalesOrderList: React.FC = () => {
  const { salesOrders, deleteSalesOrder } = useSales();

  return (
    <div className="p-3 sm:p-4 md:p-6">
      <h2 className="text-lg sm:text-xl font-semibold mb-4">Sales Orders</h2>
      <div className="overflow-x-auto -mx-3 sm:mx-0 px-3 sm:px-0">
        <table className="min-w-full table-auto">
          <thead>
            <tr>
              <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide p-2 sm:p-3">ID</th>
              <th className="hidden sm:table-cell text-left text-xs font-semibold text-gray-500 uppercase tracking-wide p-2 sm:p-3">Customer</th>
              <th className="hidden md:table-cell text-left text-xs font-semibold text-gray-500 uppercase tracking-wide p-2 sm:p-3">Date</th>
              <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide p-2 sm:p-3">Status</th>
              <th className="text-right text-xs font-semibold text-gray-500 uppercase tracking-wide p-2 sm:p-3">Total</th>
              <th className="text-right text-xs font-semibold text-gray-500 uppercase tracking-wide p-2 sm:p-3">Actions</th>
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
              <tr key={o.id} className="border-t border-gray-100 hover:bg-gray-50">
                <td className="p-2 sm:p-3 text-sm font-medium">{o.id}</td>
                <td className="hidden sm:table-cell p-2 sm:p-3 text-sm">{o.customerId || '-'}</td>
                <td className="hidden md:table-cell p-2 sm:p-3 text-sm text-gray-500">{o.orderDate?.split('T')[0] || '-'}</td>
                <td className="p-2 sm:p-3">
                  <span className="inline-block px-2 py-0.5 text-xs font-semibold rounded-full bg-teal-50 text-teal-700">{o.status}</span>
                </td>
                <td className="p-2 sm:p-3 text-sm font-semibold text-right">{o.total}</td>
                <td className="p-2 sm:p-3 text-right">
                  <button className="text-teal-600 text-sm font-semibold hover:underline" onClick={() => alert('Open order ' + o.id)}>Open</button>
                  <button className="text-red-500 text-sm font-semibold hover:underline ml-2" onClick={() => deleteSalesOrder(o.id)}>Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default SalesOrderList;
