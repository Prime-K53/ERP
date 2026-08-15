
import React, { useState } from 'react';
import { Layers, ShoppingCart, CheckSquare, Square, Truck, TrendingDown, PackagePlus, AlertTriangle, ShieldCheck, Info, X } from 'lucide-react';
import { useProduction } from '../../context/ProductionContext';
import { useInventory } from '../../context/InventoryContext';
import { useProcurement } from '../../context/ProcurementContext';
import { useAuth } from '../../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { OfflineImage } from '../../components/OfflineImage';
import { generateNextId } from '../../utils/helpers';

const teal={50:'#eef7f6',100:'#d3ece9',200:'#a6d9d3',300:'#72c0b7',400:'#3fa294',500:'#1f8577',600:'#146b60',700:'#0f544c',800:'#0b3e39',900:'#082e2a'};
const amber={100:'#fbead0',300:'#eec27a',500:'#d99a3f',600:'#b97e2b'};
const paper='#FEFDFB',ink='#23282A',inkSoft='#5c6567',hairline='#e4ddd1',danger='#b5493f';

const MRP: React.FC = () => {
  const { 
    workOrders = [], 
    boms = []
  } = useProduction();
  const { 
    inventory = []
  } = useInventory();
  const { 
    purchases = [],
    addPurchase, 
    suppliers = []
  } = useProcurement();
  const { 
    notify, 
    companyConfig 
  } = useAuth();
  const navigate = useNavigate();
  const [selectedItemIds, setSelectedItemIds] = useState<string[]>([]);
  const currency = companyConfig.currencySymbol;

  const getSupplierName = (id: string) => suppliers.find(s => s.id === id)?.name || id;

  // 1. Get all Scheduled or In Progress Work Orders
  const activeWOs = workOrders.filter(wo => ['Scheduled', 'In Progress'].includes(wo.status));

  // 2. Aggregate Required Materials (Recursive Logic Simulation)
  const materialDemand: Record<string, number> = {};

  const explodeBOM = (bomId: string, multiplier: number) => {
      const bom = boms.find(b => b.id === bomId);
      if (!bom) return;
      
      bom.components.forEach(comp => {
          // Use itemId or materialId (some BOMs store itemId, others use materialId)
          const materialId = comp.materialId || comp.itemId;
          if (!materialId) return;
          materialDemand[materialId] = (materialDemand[materialId] || 0) + (comp.quantity * multiplier);
          
          // Check if this component itself has a BOM (Sub-assembly)
          const subBom = boms.find(b => b.productId === materialId);
          if (subBom) {
              explodeBOM(subBom.id, comp.quantity * multiplier);
          }
      });
  };

  activeWOs.forEach(wo => {
    const remainingQty = Math.max(0, wo.quantityPlanned - wo.quantityCompleted);
    explodeBOM(wo.bomId, remainingQty);
  });

  // 3. Compare with Inventory & Calculate Purchase Needs
  const mrpReport = Object.entries(materialDemand).map(([matId, requiredQty]) => {
      const item = inventory.find(i => i.id === matId);
      const currentStock = item?.stock || 0;
      
      // LOGIC LINK: Calculate what's already in the pipeline (Inbound)
      const inboundQty = purchases
        .filter(p => p.status === 'Ordered' || p.status === 'Partially Received')
        .reduce((sum, p) => {
            const line = p.items.find(li => li.itemId === matId);
            return sum + (line ? (line.quantity - (line.receivedQty || 0)) : 0);
        }, 0);

      const netPosition = currentStock + inboundQty - requiredQty;
      
      const minStock = item?.minStockLevel || 0;
      const shortage = netPosition < 0 ? Math.abs(netPosition) : 0;
      const safetyShortage = (netPosition < minStock && netPosition >= 0) ? (minStock - netPosition) : 0;
      
      let suggestedOrder = shortage + safetyShortage;
      const moq = item?.minOrderQty || 1;

      return {
          id: matId,
          name: item?.name || 'Unknown',
          sku: item?.sku || 'N/A',
          image: item?.image,
          preferredSupplierId: item?.preferredSupplierId,
          currentStock,
          inboundQty,
          requiredQty,
          netStock: netPosition,
          status: netPosition < 0 ? 'Critical' : netPosition < minStock ? 'Buffer Warning' : 'Healthy',
          suggestedOrder: suggestedOrder > 0 ? Math.max(suggestedOrder, moq) : 0,
          unit: item?.unit || 'units'
      };
  }).sort((a, b) => {
      if (a.status === 'Critical') return -1;
      if (b.status === 'Critical') return 1;
      return 0;
  });

  const handleToggleSelect = (id: string) => {
      setSelectedItemIds(prev => 
          prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
      );
  };

  const handleGeneratePOs = async () => {
      if (selectedItemIds.length === 0) return;

      const itemsToOrder = mrpReport.filter(item => selectedItemIds.includes(item.id));
      const ordersBySupplier: Record<string, typeof itemsToOrder> = {};
      const stagedPurchases = [...purchases];
      
      itemsToOrder.forEach(item => {
          const supId = item.preferredSupplierId || 'SUP-GENERIC';
          if (!ordersBySupplier[supId]) ordersBySupplier[supId] = [];
          ordersBySupplier[supId].push(item);
      });

      let ordersCreated = 0;
      for (const [supId, items] of Object.entries(ordersBySupplier)) {
          const poItems = items.map(i => {
              const invItem = inventory.find(inv => inv.id === i.id);
              return {
                  itemId: i.id,
                  name: i.name,
                  quantity: Math.ceil(i.suggestedOrder),
                  cost: invItem?.cost || 0,
                  receivedQty: 0
              };
          });

          const nextPurchase = {
              id: generateNextId('PO', stagedPurchases, companyConfig),
              date: new Date().toISOString(),
              supplierId: supId,
              items: poItems,
              total: poItems.reduce((sum, p) => sum + (p.quantity * p.cost), 0),
              status: 'Draft',
              paymentStatus: 'Unpaid',
              paidAmount: 0,
              notes: 'Auto-generated via MRP recursive demand analysis.'
          };

          stagedPurchases.push(nextPurchase);
          await addPurchase(nextPurchase);
          ordersCreated++;
      }

      notify(`${ordersCreated} Procurement Drafts generated successfully.`, 'success');
      setSelectedItemIds([]);
      navigate('/purchases');
  };

  return (
    <div style={{ padding: '16px', marginLeft: 'auto', display: 'flex', flexDirection: 'column', fontFamily: 'Inter,"DM Sans",sans-serif', lineHeight: 1.625, color: '#23282A', background: '#eef7f6' }}>
        <div style={{ marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0, paddingLeft: '8px', paddingTop: '10px', background: 'rgba(254,253,251,.5)', backdropFilter: 'blur(4px)', borderRadius: '16px', border: '1.4px solid #e4ddd1', borderColor: '#e4ddd1', boxShadow: '0 1px 2px rgba(0,0,0,.05)', paddingRight: '8px', paddingBottom: '10px' }}>
           <div>
                <h1 style={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: '12px', letterSpacing: '-.025em', color: '#23282A' }}>
                    <Layers style={{ color: '#1f8577' }} size={24}/> MRP Intelligence
                </h1>
                <p style={{ color: '#5c6567', marginTop: '2px', fontWeight: 500 }}>Multi-level BOM explosion for {activeWOs.length} active work orders.</p>
           </div>
            {selectedItemIds.length > 0 && (
                <button onClick={handleGeneratePOs} style={{ background: '#1f8577', color: '#fff', paddingLeft: '14px', paddingTop: '8px', borderRadius: '12px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px', boxShadow: '0 4px 14px 0 rgba(8,46,42,.1)', transition: 'all .15s ease', border: '1.4px solid #e4ddd1', borderColor: '#a6d9d3', paddingRight: '14px', paddingBottom: '8px' }}>
                    <PackagePlus size={16}/> Generate {selectedItemIds.length} Lines
                </button>
            )}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(1,1fr)', gap: '16px', marginBottom: '24px', flexShrink: 0 }}>
          <div style={{ background: '#FEFDFB', padding: '12px', borderRadius: '12px', boxShadow: '0 1px 2px rgba(0,0,0,.05)', border: '1.4px solid #e4ddd1', borderColor: '#e4ddd1', display: 'flex', alignItems: 'center', gap: '16px', borderLeftWidth: '4px', borderLeftColor: '#b5493f', transition: 'all .15s ease' }}>
            <div style={{ padding: '10px', background: '#fef2f2', color: '#b5493f', borderRadius: '10px' }}>
              <TrendingDown size={20} />
            </div>
            <div>
              <p style={{ fontWeight: 700, color: '#5c6567', textTransform: 'uppercase', letterSpacing: '-.025em', lineHeight: 1, marginBottom: '6px' }}>Shortages</p>
              <p style={{ fontSize: '16px', fontWeight: 600, color: '#23282A' }}>{mrpReport.filter(i => i.status === 'Critical').length}</p>
            </div>
          </div>
          <div style={{ background: '#FEFDFB', padding: '12px', borderRadius: '12px', boxShadow: '0 1px 2px rgba(0,0,0,.05)', border: '1.4px solid #e4ddd1', borderColor: '#e4ddd1', display: 'flex', alignItems: 'center', gap: '16px', borderLeftWidth: '4px', borderLeftColor: '#1f8577', transition: 'all .15s ease' }}>
            <div style={{ padding: '10px', background: '#eef7f6', color: '#1f8577', borderRadius: '10px' }}>
              <Truck size={20} />
            </div>
            <div>
              <p style={{ fontWeight: 700, color: '#5c6567', textTransform: 'uppercase', letterSpacing: '-.025em', lineHeight: 1, marginBottom: '6px' }}>Inbound</p>
              <p style={{ fontSize: '16px', fontWeight: 600, color: '#23282A' }}>{mrpReport.reduce((s, i) => s + (i.inboundQty > 0 ? 1 : 0), 0)} <span style={{ fontSize: '11px', fontWeight: 600, color: '#5c6567' }}>Items</span></p>
            </div>
          </div>
          <div style={{ background: '#FEFDFB', padding: '12px', borderRadius: '12px', boxShadow: '0 1px 2px rgba(0,0,0,.05)', border: '1.4px solid #e4ddd1', borderColor: '#e4ddd1', display: 'flex', alignItems: 'center', gap: '16px', borderLeftWidth: '4px', borderLeftColor: '#d99a3f', transition: 'all .15s ease' }}>
            <div style={{ padding: '10px', background: '#fbead0', color: '#d99a3f', borderRadius: '10px' }}>
              <AlertTriangle size={20} />
            </div>
            <div>
              <p style={{ fontWeight: 700, color: '#5c6567', textTransform: 'uppercase', letterSpacing: '-.025em', lineHeight: 1, marginBottom: '6px' }}>Warnings</p>
              <p style={{ fontSize: '16px', fontWeight: 600, color: '#23282A' }}>{mrpReport.filter(i => i.status === 'Buffer Warning').length}</p>
            </div>
          </div>
          <div style={{ background: '#FEFDFB', padding: '12px', borderRadius: '12px', boxShadow: '0 1px 2px rgba(0,0,0,.05)', border: '1.4px solid #e4ddd1', borderColor: '#e4ddd1', display: 'flex', alignItems: 'center', gap: '16px', borderLeftWidth: '4px', borderLeftColor: '#1f8577', transition: 'all .15s ease' }}>
            <div style={{ padding: '10px', background: '#eef7f6', color: '#1f8577', borderRadius: '10px' }}>
              <CheckSquare size={20} />
            </div>
            <div>
              <p style={{ fontWeight: 700, color: '#5c6567', textTransform: 'uppercase', letterSpacing: '-.025em', lineHeight: 1, marginBottom: '6px' }}>Yield</p>
              <p style={{ fontSize: '16px', fontWeight: 600, color: '#23282A' }}>{mrpReport.filter(i => i.status === 'Healthy').length} <span style={{ fontSize: '11px', fontWeight: 600, color: '#5c6567' }}>Active</span></p>
            </div>
          </div>
        </div>

        <div style={{ background: '#eef7f6', borderRadius: '24px', boxShadow: '0 1px 2px rgba(0,0,0,.05)', border: '1.4px solid #e4ddd1', borderColor: '#e4ddd1', overflow: 'hidden', flex: 1, display: 'flex', flexDirection: 'column' }}>
            <div style={{ paddingLeft: '16px', paddingTop: '10px', background: '#eef7f6', borderStyle: 'solid', borderColor: '#e4ddd1', display: 'flex', alignItems: 'center', gap: '12px', paddingRight: '16px', paddingBottom: '10px' }}>
                <Info size={14} style={{ color: '#1f8577', flexShrink: 0 }}/>
                <p style={{ fontWeight: 600, color: '#5c6567' }}>Logic: Net Position = (On-Hand + Inbound) - Gross Demand. Replenish suggestions auto-deduct items already in transit.</p>
            </div>
            <div style={{ flex: 1, overflowY: 'auto' }}>
                <table style={{ width: '100%', textAlign: 'left', lineHeight: 1.625, borderCollapse: 'separate', borderSpacing: 0 }}>
                    <thead style={{ background: '#eef7f6', backdropFilter: 'blur(4px)', color: '#5c6567', fontWeight: 700, borderStyle: 'solid', borderColor: '#e4ddd1', position: 'sticky', top: 0, zIndex: 10 }}>
                        <tr>
                            <th style={{ width: '56px', paddingLeft: '16px', paddingTop: '8px', textAlign: 'center', borderStyle: 'solid', borderColor: '#e4ddd1', paddingRight: '16px', paddingBottom: '8px' }}>
                                <button onClick={() => setSelectedItemIds(selectedItemIds.length === mrpReport.length ? [] : mrpReport.map(i => i.id))} style={{ color: '#5c6567', transition: 'color .15s ease,background .15s ease,border-color .15s ease' }}>
                                    {selectedItemIds.length > 0 && selectedItemIds.length === mrpReport.length ? <CheckSquare size={18}/> : <Square size={18}/>}
                                </button>
                            </th>
                            <th style={{ paddingLeft: '16px', paddingTop: '8px', borderStyle: 'solid', borderColor: '#e4ddd1', fontWeight: 700, paddingRight: '16px', paddingBottom: '8px' }}>Component Material</th>
                            <th style={{ paddingLeft: '16px', paddingTop: '8px', textAlign: 'right', borderStyle: 'solid', borderColor: '#e4ddd1', fontWeight: 700, paddingRight: '16px', paddingBottom: '8px' }}>On-Hand</th>
                            <th style={{ paddingLeft: '16px', paddingTop: '8px', textAlign: 'right', borderStyle: 'solid', borderColor: '#e4ddd1', fontWeight: 700, paddingRight: '16px', paddingBottom: '8px' }}>Inbound</th>
                            <th style={{ paddingLeft: '16px', paddingTop: '8px', textAlign: 'right', borderStyle: 'solid', borderColor: '#e4ddd1', fontWeight: 700, paddingRight: '16px', paddingBottom: '8px' }}>Net Position</th>
                            <th style={{ paddingLeft: '16px', paddingTop: '8px', textAlign: 'center', borderStyle: 'solid', borderColor: '#e4ddd1', fontWeight: 700, paddingRight: '16px', paddingBottom: '8px' }}>Procurement Advice</th>
                            <th style={{ paddingLeft: '16px', paddingTop: '8px', textAlign: 'right', borderStyle: 'solid', borderColor: '#e4ddd1', fontWeight: 700, paddingRight: '16px', paddingBottom: '8px' }}>Preferred Vendor</th>
                        </tr>
                    </thead>
                    <tbody style={{ borderColor: '#e4ddd1' }}>
                        {mrpReport.map(row => (
                            <tr key={row.id} className={`hover:bg-blue-50/40 transition-colors cursor-pointer group ${row.status === 'Critical' ? 'bg-rose-50/20' : ''}`} onClick={() => handleToggleSelect(row.id)}>
                                <td style={{ paddingLeft: '16px', paddingTop: '8px', textAlign: 'center', paddingRight: '16px', paddingBottom: '8px' }} onClick={e => e.stopPropagation()}>
                                    <button onClick={() => handleToggleSelect(row.id)} className={`transition-colors ${selectedItemIds.includes(row.id) ? 'text-blue-600' : 'text-slate-300 hover:text-slate-400'}`}>
                                        {selectedItemIds.includes(row.id) ? <CheckSquare size={18}/> : <Square size={18}/>}
                                    </button>
                                </td>
                                <td style={{ paddingLeft: '16px', paddingTop: '8px', paddingRight: '16px', paddingBottom: '8px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                        <div style={{ width: '40px', height: '40px', background: '#eef7f6', borderRadius: '12px', boxShadow: 'inset 0 2px 4px 0 rgba(0,0,0,.06)', overflow: 'hidden', flexShrink: 0, border: '1.4px solid #e4ddd1', borderColor: '#e4ddd1', transition: 'color .15s ease,background .15s ease,border-color .15s ease' }}>
                                            <OfflineImage src={row.image} alt={row.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }}/>
                                        </div>
                                        <div style={{ minWidth: 0 }}>
                                            <div style={{ fontWeight: 700, color: '#23282A', transition: 'color .15s ease,background .15s ease,border-color .15s ease', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.name}</div>
                                            <div style={{ color: '#5c6567', fontFamily: '"JetBrains Mono",monospace', letterSpacing: '-.025em', marginTop: '2px' }}>{row.sku}</div>
                                        </div>
                                    </div>
                                </td>
                                <td style={{ paddingLeft: '16px', paddingTop: '8px', textAlign: 'right', fontWeight: 700, color: '#23282A', fontVariantNumeric: 'tabular-nums', paddingRight: '16px', paddingBottom: '8px' }}>{row.currentStock}</td>
                                <td style={{ paddingLeft: '16px', paddingTop: '8px', textAlign: 'right', fontWeight: 700, color: '#0f544c', fontVariantNumeric: 'tabular-nums', paddingRight: '16px', paddingBottom: '8px' }}>+{row.inboundQty}</td>
                                <td style={{ paddingLeft: '16px', paddingTop: '8px', textAlign: 'right', paddingRight: '16px', paddingBottom: '8px' }}>
                                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'end' }}>
                                        <span className={`text-[13px] font-bold tabular-nums ${row.netStock < 0 ? 'text-rose-600' : 'text-slate-800'}`}>
                                            {row.netStock.toFixed(1)} <span style={{ fontWeight: 500, color: '#5c6567', marginLeft: '2px' }}>{row.unit}</span>
                                        </span>
                                        <span style={{ fontWeight: 600, color: '#5c6567' }}>Req: {row.requiredQty}</span>
                                    </div>
                                </td>
                                <td style={{ paddingLeft: '16px', paddingTop: '8px', textAlign: 'center', paddingRight: '16px', paddingBottom: '8px' }}>
                                    {row.suggestedOrder > 0 ? (
                                        <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center' }}>
                                            <span style={{ background: '#1f8577', paddingLeft: '10px', paddingTop: '2px', borderRadius: '10px', fontWeight: 700, boxShadow: '0 4px 14px 0 rgba(8,46,42,.1)', border: '1.4px solid #e4ddd1', borderColor: '#a6d9d3', paddingRight: '10px', paddingBottom: '2px' }}>
                                                +{row.suggestedOrder.toFixed(1)}
                                            </span>
                                            <span className={`text-[12px] font-bold mt-0.5 ${row.status === 'Critical' ? 'text-rose-500' : 'text-amber-500'}`}>{row.status}</span>
                                        </div>
                                    ) : (
                                        <span style={{ color: '#0f544c', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}><ShieldCheck size={14}/> Covered</span>
                                    )}
                                </td>
                                <td style={{ paddingLeft: '16px', paddingTop: '8px', textAlign: 'right', paddingRight: '16px', paddingBottom: '8px' }}>
                                    {row.preferredSupplierId ? (
                                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'end' }}>
                                            <span style={{ fontWeight: 700, color: '#23282A' }}>{getSupplierName(row.preferredSupplierId)}</span>
                                            <span style={{ fontWeight: 700, color: '#0f544c', display: 'flex', alignItems: 'center', gap: '4px' }}>Source Linked</span>
                                        </div>
                                    ) : (
                                        <span style={{ fontWeight: 600, color: '#5c6567', fontStyle: 'italic' }}>Unassigned</span>
                                    )}
                                </td>
                            </tr>
                        ))}
                        {mrpReport.length === 0 && (
                            <tr><td colSpan={7} style={{ padding: '80px', textAlign: 'center', color: '#5c6567', fontWeight: 500, fontStyle: 'italic' }}>All production requirements are currently covered by available inventory and inbound shipments.</td></tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    </div>
  );
};

export default MRP;
