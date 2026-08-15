import React from 'react';
import { useProduction } from '../../context/ProductionContext';
import { useInventory } from '../../context/InventoryContext';
import { useAuth } from '../../context/AuthContext';
import { Calendar, Package } from 'lucide-react';
import { OfflineImage } from '../../components/OfflineImage';

const paper = '#FEFDFB', ink = '#23282A', inkSoft = '#5c6567', hairline = '#e4ddd1';

const ProductionHistory: React.FC = () => {
  const { batches = [], boms = [] } = useProduction();
  const { inventory = [] } = useInventory();
  const { companyConfig } = useAuth();
  const currency = companyConfig.currencySymbol;

  return (
    <div className="p-4 md:p-6 max-w-[1600px] mx-auto space-y-6">
      <div className="header-container">
        <h1 className="text-title">Production History</h1>
        <p className="text-[12px] mt-0.5" style={{ color: inkSoft }}>Log of all manufacturing batches and costs</p>
      </div>

      <div className="prime-card" style={{ background: paper, borderRadius: 14, border: `1.4px solid ${hairline}`, overflow: 'hidden' }}>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="table-header sticky top-0 z-10 shadow-sm border-b border-slate-200">
              <tr>
                <th className="px-4 py-2 uppercase tracking-tight">Batch ID</th>
                <th className="px-4 py-2 uppercase tracking-tight">Date Produced</th>
                <th className="px-4 py-2 uppercase tracking-tight">Product</th>
                <th className="px-4 py-2 text-center uppercase tracking-tight">Quantity</th>
                <th className="px-4 py-2 text-right uppercase tracking-tight">Unit Cost</th>
                <th className="px-4 py-2 text-right uppercase tracking-tight">Total Cost</th>
                <th className="px-4 py-2 text-right uppercase tracking-tight">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100/50">
              {(!batches || batches.length === 0) ? (
                <tr>
                  <td colSpan={7} className="table-body-cell p-12 text-center text-slate-400">
                    No production history found.
                  </td>
                </tr>
              ) : (
                batches.map((batch) => {
                  const bom = boms.find(b => b.id === batch.bomId);
                  const product = inventory.find(i => i.id === bom?.productId);

                  return (
                    <tr key={batch.id} className="hover:bg-slate-50 transition-colors">
                      <td className="table-body-cell px-4 py-2 font-mono text-slate-400 text-[11px] uppercase tracking-tight">{batch.id}</td>
                      <td className="table-body-cell px-4 py-2">
                        <div className="flex items-center gap-2 text-slate-700">
                          <Calendar size={14} className="text-slate-400" />
                          <span className="finance-nums">{new Date(batch.date).toLocaleDateString()}</span> 
                          <span className="text-[11px] text-slate-400 finance-nums">{new Date(batch.date).toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'})}</span>
                        </div>
                      </td>
                      <td className="table-body-cell px-4 py-2 font-medium text-slate-900">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-slate-50 rounded-lg overflow-hidden shrink-0 border border-slate-200">
                              <OfflineImage 
                                src={product?.image} 
                                alt={batch.productName} 
                                className="w-full h-full object-cover"
                                fallback={<div className="w-full h-full flex items-center justify-center text-slate-300"><Package size={16} /></div>}
                              />
                          </div>
                          <span className="text-[13px] font-bold">{batch.productName}</span>
                        </div>
                      </td>
                      <td className="table-body-cell px-4 py-2 text-center font-bold text-slate-900 finance-nums bg-slate-50/30">
                        {batch.quantityProduced}
                      </td>
                      <td className="table-body-cell px-4 py-2 text-right text-slate-900 numeric-cell font-bold text-[13px]">
                        {currency}{(batch.unitCost || 0).toLocaleString(undefined, {minimumFractionDigits: 2})}
                      </td>
                      <td className="table-body-cell px-4 py-2 text-right font-bold text-slate-900 numeric-cell text-[13px]">
                        {currency}{(batch.totalCost || 0).toLocaleString(undefined, {minimumFractionDigits: 2})}
                      </td>
                      <td className="table-body-cell px-4 py-2 text-right">
                        <span className="inline-flex px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200 uppercase tracking-tight">
                          {batch.status}
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default ProductionHistory;
