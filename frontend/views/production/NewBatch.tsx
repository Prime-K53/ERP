import React, { useState, useEffect, useMemo } from 'react';
import { logger } from '@/services/logger';
import { Play, AlertTriangle, CheckCircle, Package, ArrowRight, Users } from 'lucide-react';
import { useProduction } from '../../context/ProductionContext';
import { useInventory } from '../../context/InventoryContext';
import { useSales } from '../../context/SalesContext';
import { useAuth } from '../../context/AuthContext';
import { BOMComponent } from '../../types';
import { OfflineImage } from '../../components/OfflineImage';
import { bomService } from '../../services/bomService';

const paper = '#FEFDFB', ink = '#23282A', inkSoft = '#5c6567', hairline = '#e4ddd1';

const NewBatch: React.FC = () => {
  const { boms, produceBatch } = useProduction();
  const { inventory } = useInventory();
  const { customers } = useSales();
  const { companyConfig, notify } = useAuth();
  const [selectedBomId, setSelectedBomId] = useState('');
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [variantId, setVariantId] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [canProduce, setCanProduce] = useState(true);
  const currency = companyConfig.currencySymbol;

  const selectedCustomer = useMemo(() =>
    customers?.find((c: any) => c.id === selectedCustomerId),
    [customers, selectedCustomerId]
  );

  const selectedBom = boms.find(b => b.id === selectedBomId);
  const selectedProductItem = selectedBom ? inventory.find(i => i.id === selectedBom.productId) : null;
  
  const variants = selectedProductItem?.variants || [];
  const selectedVariant = variants.find(v => v.id === variantId);

  // Calculate requirements and check stock
  const requirements = selectedBom ? selectedBom.components.map(c => {
    const material = inventory.find(i => i.id === c.materialId);
    
    // Unit Conversion Logic
    const conversion = material?.conversionRate || 1;
    const baseUnit = material?.unit || 'units';
    const usageUnit = material?.usageUnit || material?.unit || 'units';
    
    // Use formula if available and variant is selected
    let unitQty = c.quantity;
    if (c.formula && selectedVariant) {
        try {
            unitQty = bomService.resolveFormula(c.formula, selectedVariant.attributes);
        } catch (e) {
            logger.error("Formula resolution failed for component", e);
        }
    }
    
    // Required Qty in Usage Units (defined in BOM)
    const requiredQtyUsage = unitQty * quantity;
    
    // Required Qty in Base Units (stored in Inventory)
    // Ex: 10 Cuts needed. 1 Sheet = 4 Cuts. 10 / 4 = 2.5 Sheets needed.
    const requiredQtyBase = requiredQtyUsage / conversion;
    
    const availableBase = material?.stock || 0;
    const sufficient = availableBase >= requiredQtyBase;
    
    // Cost Calculation (Material Cost usually stored per Base Unit)
    const cost = (material?.cost || 0) * requiredQtyBase;

    return {
      ...c,
      materialName: material?.name || 'Unknown',
      materialImage: material?.image,
      baseUnit,
      usageUnit,
      conversion,
      requiredQtyUsage,
      requiredQtyBase,
      availableBase,
      sufficient,
      cost
    };
  }) : [];

  const totalMaterialCost = requirements.reduce((sum, r) => sum + r.cost, 0);
  
  let laborCostPerUnit = selectedBom?.laborCost || 0;
  if (selectedBom?.isParameterized && selectedBom.laborFormula && selectedVariant) {
      try {
          laborCostPerUnit = bomService.resolveFormula(selectedBom.laborFormula, selectedVariant.attributes);
      } catch (e) {
          logger.error("Formula resolution failed for labor cost", e);
      }
  }

  const totalLaborCost = selectedBom ? laborCostPerUnit * quantity : 0;
  const totalBatchCost = totalMaterialCost + totalLaborCost;
  const unitCost = quantity > 0 ? totalBatchCost / quantity : 0;

  useEffect(() => {
    const allSufficient = requirements.every(r => r.sufficient);
    const variantRequired = variants.length > 0;
    const variantSelected = !!selectedVariant;
    setCanProduce(allSufficient && quantity > 0 && !!selectedBom && (!variantRequired || variantSelected));
  }, [requirements, quantity, selectedBom, variants, selectedVariant]);

  const handleProduce = () => {
    if(!canProduce || !selectedBom) return;
    
    produceBatch({
      id: `BATCH-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      date: new Date().toISOString(),
      bomId: selectedBom.id,
      customerId: selectedCustomerId || undefined,
      customerName: selectedCustomer?.name || undefined,
      productName: selectedVariant ? selectedVariant.name : selectedBom.productName,
      quantityProduced: quantity,
      unitCost,
      totalCost: totalBatchCost,
      totalLaborCost,
      totalMaterialCost,
      totalAmount: quantity,
      status: 'Completed',
      attributes: selectedVariant ? { ...selectedVariant.attributes, variantId: selectedVariant.id } : {}
    }, selectedBom.components);

    notify("Production Batch Completed Successfully! Inventory Updated.", "success");
    setQuantity(1);
    setSelectedBomId('');
    setSelectedCustomerId('');
    setVariantId('');
  };

  return (
    <div className="p-6 max-w-[1200px] mx-auto h-[calc(100vh-4rem)] overflow-y-auto">
      <div className="flex items-center justify-between mb-6">
         <div>
           <h1 className="text-title">New Production Batch</h1>
           <p className="text-[12px] mt-0.5" style={{ color: inkSoft }}>Manufacture finished goods from raw materials</p>
         </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Configuration Panel */}
        <div className="lg:col-span-1 space-y-6">
          <div className="prime-card" style={{ background: paper, padding: 24, borderRadius: 14, border: `1.4px solid ${hairline}` }}>
            <h3 className="font-bold text-[13px] mb-4 flex items-center gap-2 uppercase tracking-tight" style={{ color: ink }}>
              <Package className="text-blue-600" size={16}/>
              Batch Configuration
            </h3>
            
              <div className="space-y-4">
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1 tracking-tight">Customer (Optional)</label>
                  <select 
                    className="w-full p-3 border border-slate-200 rounded-lg bg-slate-50 focus:bg-white transition-colors text-[13px]"
                    value={selectedCustomerId}
                    onChange={(e) => setSelectedCustomerId(e.target.value)}
                  >
                    <option value="">-- No customer linked --</option>
                    {(customers || []).map((c: any) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                  {selectedCustomer && (
                    <div className="flex items-center gap-1 mt-1 text-[11px] text-blue-600">
                      <Users size={12} /> Producing for: {selectedCustomer.name}
                    </div>
                  )}
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1 tracking-tight">Select Product Recipe</label>
                  <select 
                    className="w-full p-3 border border-slate-200 rounded-lg bg-slate-50 focus:bg-white transition-colors text-[13px]"
                    value={selectedBomId}
                    onChange={(e) => setSelectedBomId(e.target.value)}
                  >
                    <option value="">-- Select Product to Produce --</option>
                    {boms.map(b => (
                      <option key={b.id} value={b.id}>{b.productName}</option>
                    ))}
                  </select>
                </div>

              {selectedBom && (
                <div className="animate-fadeIn">
                  <div className="flex items-center gap-4 mb-4 p-3 bg-blue-50 rounded-lg border border-blue-100">
                      <div className="w-12 h-12 bg-white rounded-lg border border-blue-200 overflow-hidden shrink-0">
                          <OfflineImage src={selectedProductItem?.image} alt={selectedBom.productName} className="w-full h-full object-cover"/>
                      </div>
                      <div>
                          <div className="font-bold text-slate-800 text-[13px]">{selectedBom.productName}</div>
                          <div className="text-[10px] text-blue-600 font-bold uppercase tracking-tight">BOM: {selectedBom.id}</div>
                      </div>
                  </div>

                  <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1 tracking-tight">Production Quantity</label>
                  <div className="flex items-center gap-2">
                    <input 
                      type="number" 
                      min="1"
                      className="w-full p-3 border border-slate-200 rounded-lg text-[18px] font-bold text-slate-800 finance-nums"
                      value={quantity}
                      onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value) || 0))}
                    />
                    <span className="text-slate-500 font-bold text-[13px] uppercase tracking-tight">Units</span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {selectedBom && (
            <div className="prime-card" style={{ background: paper, padding: 24, borderRadius: 14, border: `1.4px solid ${hairline}` }}>
              <h3 className="font-bold text-[13px] mb-4 uppercase tracking-tight" style={{ color: ink }}>Cost Estimation</h3>
              <div className="space-y-2 text-[13px]">
                <div className="flex justify-between">
                  <span style={{ color: inkSoft }}>Total Material Cost</span>
                  <span className="font-bold finance-nums">{currency}{totalMaterialCost.toLocaleString(undefined, {minimumFractionDigits: 2})}</span>
                </div>
                <div className="flex justify-between">
                  <span style={{ color: inkSoft }}>Total Labor/Overhead</span>
                  <span className="font-bold finance-nums">{currency}{totalLaborCost.toLocaleString(undefined, {minimumFractionDigits: 2})}</span>
                </div>
                <div className="my-2 pt-2 flex justify-between text-[15px] font-bold" style={{ borderTop: `1.4px solid ${hairline}`, color: ink }}>
                  <span>Total Batch Cost</span>
                  <span className="finance-nums">{currency}{totalBatchCost.toLocaleString(undefined, {minimumFractionDigits: 2})}</span>
                </div>
                <div className="flex justify-between text-blue-600 font-bold bg-blue-50 p-2 rounded-lg mt-2">
                  <span>Cost Per Unit</span>
                  <span className="finance-nums">{currency}{unitCost.toLocaleString(undefined, {minimumFractionDigits: 2})}</span>
                </div>
              </div>
              
              <button 
                onClick={handleProduce}
                disabled={!canProduce}
                className={`
                  w-full mt-6 py-3 px-4 rounded-xl font-bold text-white flex items-center justify-center gap-2 transition-all text-sm
                  ${canProduce 
                    ? 'bg-emerald-600 hover:bg-emerald-700 shadow-lg shadow-emerald-200' 
                    : 'bg-slate-300 cursor-not-allowed'}
                `}
              >
                {canProduce ? <Play size={16} fill="currentColor"/> : <AlertTriangle size={16}/>}
                {canProduce ? 'Execute Production' : 'Insufficient Stock'}
              </button>
            </div>
          )}
        </div>

        {/* Materials Checklist Panel */}
        <div className="lg:col-span-2">
          <div className="prime-card" style={{ background: paper, borderRadius: 14, border: `1.4px solid ${hairline}`, overflow: 'hidden', height: '100%', display: 'flex', flexDirection: 'column' }}>
            <div className="p-6" style={{ borderBottom: `1.4px solid ${hairline}`, background: '#eef7f6' }}>
              <h3 className="font-bold text-slate-800 text-[13px] uppercase tracking-tight">Material Requirements & Availability</h3>
            </div>
            
            {!selectedBom ? (
              <div className="flex-1 flex flex-col items-center justify-center text-slate-400 p-10">
                <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mb-4">
                  <Package size={32} />
                </div>
                <p className="text-[13px]">Select a product recipe to view requirements</p>
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto p-0">
                <table className="w-full text-left text-[13px]">
                  <thead className="table-header border-b border-slate-200">
                    <tr>
                      <th className="px-6 py-4 uppercase tracking-tight">Material</th>
                      <th className="px-6 py-4 text-center uppercase tracking-tight">Required</th>
                      <th className="px-6 py-4 text-center uppercase tracking-tight">In Stock</th>
                      <th className="px-6 py-4 text-right uppercase tracking-tight">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {requirements.map((req, idx) => (
                      <tr key={idx} className="hover:bg-slate-50">
                        <td className="table-body-cell px-6 py-4">
                          <div className="flex items-center gap-3">
                              <div className="w-8 h-8 bg-slate-50 rounded overflow-hidden shrink-0 border border-slate-200">
                                  <OfflineImage src={req.materialImage} alt={req.materialName} className="w-full h-full object-cover"/>
                              </div>
                              <div>
                                  <div className="font-bold text-slate-900 text-[13px]">{req.materialName}</div>
                                  <div className="text-[11px] text-slate-500 font-bold uppercase tracking-tight">
                                      Cost: <span className="finance-nums">{currency}{req.cost.toLocaleString(undefined, {minimumFractionDigits: 2})}</span>
                                      {req.conversion > 1 && <span className="ml-2 text-purple-600 bg-purple-50 px-1 rounded">1 {req.baseUnit} = {req.conversion} {req.usageUnit}</span>}
                                  </div>
                              </div>
                          </div>
                        </td>
                        <td className="table-body-cell px-6 py-4 text-center">
                          <div className="font-bold text-slate-700 text-[13px] finance-nums">{req.requiredQtyUsage.toFixed(1)} {req.usageUnit}</div>
                          {req.conversion > 1 && <div className="text-[11px] text-slate-400 font-bold uppercase tracking-tight finance-nums">({req.requiredQtyBase.toFixed(2)} {req.baseUnit})</div>}
                        </td>
                        <td className="table-body-cell px-6 py-4 text-center font-bold text-slate-900 text-[13px] finance-nums">
                          {req.availableBase} {req.baseUnit}
                        </td>
                        <td className="table-body-cell px-6 py-4 text-right">
                          {req.sufficient ? (
                            <span className="inline-flex items-center gap-1 text-emerald-600 bg-emerald-50 px-2 py-1 rounded-full text-[10px] font-bold border border-emerald-100 uppercase tracking-tight">
                              <CheckCircle size={12} /> Available
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-red-600 bg-red-50 px-2 py-1 rounded-full text-[10px] font-bold border border-red-100 uppercase tracking-tight">
                              <AlertTriangle size={12} /> Shortage (-{(req.requiredQtyBase - req.availableBase).toFixed(2)} {req.baseUnit})
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default NewBatch;
