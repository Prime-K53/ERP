
import React, { useState } from 'react';
import { Truck, ShoppingCart, FileText } from 'lucide-react';
import { useData, REFRESH_INTERVAL } from '../context/DataContext';
import { useModuleRefresh } from '../hooks/useModuleRefresh';
import { useAuth } from '../context/AuthContext';
import { useFinance } from '../context/FinanceContext';
import { useInventory } from '../context/InventoryContext';
import { useProcurement } from '../context/ProcurementContext';
import { Purchase, SupplierPayment } from '../types';
import { PurchaseBuilder } from './purchases/components/PurchaseBuilder';
import { PurchaseHistory } from './purchases/components/PurchaseHistory';
import PurchaseOrderDetail from './purchases/components/PurchaseOrderDetail';
import { SupplierPaymentModal } from './purchases/components/SupplierPaymentModal';
import { PurchaseReceiveModal } from './purchases/components/PurchaseReceiveModal';
import { useNavigate, useLocation } from 'react-router-dom';
import { generateNextId } from '../utils/helpers';
import { ConfirmDialog, ConfirmDialogType } from '../components/ConfirmDialog';
import { getDefaultDate, validateDateInFY } from '../utils/financialYearUtils';

const teal = { 50:'#eef7f6',100:'#d3ece9',200:'#a6d9d3',300:'#72c0b7',400:'#3fa294',500:'#1f8577',600:'#146b60',700:'#0f544c',800:'#0b3e39',900:'#082e2a' };
const amber = { 100:'#fbead0',300:'#eec27a',500:'#d99a3f',600:'#b97e2b' };
const paper = '#FEFDFB'; const ink = '#23282A'; const inkSoft = '#5c6567'; const hairline = '#e4ddd1';

const Purchases: React.FC = () => {
  const { refreshAllData } = useData();
  const { notify, companyConfig } = useAuth();
  const { recordSupplierPayment, addExpense } = useFinance();
  const { inventory, addPurchase, purchases, updatePurchase, deleteItem } = useInventory();
  const { suppliers, receivePurchase } = useProcurement();

  // 5-minute poll + focus refresh
  useModuleRefresh(refreshAllData, { interval: REFRESH_INTERVAL });
  const [activeTab, setActiveTab] = useState<'New' | 'History'>('New');
  const [selectedPurchase, setSelectedPurchase] = useState<Purchase | null>(null);
  const [editingPurchase, setEditingPurchase] = useState<Purchase | null>(null);
  const [paymentPurchase, setPaymentPurchase] = useState<Purchase | null>(null);
  const [receivingPurchase, setReceivingPurchase] = useState<Purchase | null>(null);
   const navigate = useNavigate();
   const location = useLocation();

  const [confirmState, setConfirmState] = useState<{ open: boolean; title: string; message: string; confirmText?: string; type?: ConfirmDialogType; onConfirm?: () => void }>({ open: false, title: '', message: '' });

   React.useEffect(() => {
     if (location.state?.action === 'create') {
       setActiveTab('New');
       if (location.state.supplierId) {
         setEditingPurchase({
           id: '',
           supplierId: location.state.supplierId,
           date: getDefaultDate(),
           dueDate: getDefaultDate(),
           items: [],
           total: 0,
           status: 'Draft',
           paymentStatus: 'Unpaid'
          } as Purchase);
       }
      // Clear state
      window.history.replaceState({}, document.title);
    }
  }, [location.state]);
  
  const handleCreateOrder = (data: { supplierId: string, items: any[], reference: string, dueDate: string, date: string }) => {
    const dateError = validateDateInFY(data.date);
    if (dateError) { notify(dateError, "error"); return; }
    const purchaseId = generateNextId('PO', purchases, companyConfig);
    addPurchase({
      id: purchaseId,
      date: data.date,
      dueDate: data.dueDate,
      supplierId: data.supplierId,
      items: data.items.map(p => ({ itemId: p.item.id, name: p.item.name, quantity: p.qty, cost: p.cost, receivedQty: 0 })),
      total: data.items.reduce((sum, p) => sum + (p.qty * p.cost), 0),
      status: 'Ordered',
      reference: data.reference,
      paymentStatus: 'Unpaid'
    });
    setActiveTab('History');
  };

  const handleUpdateOrder = (id: string, data: { supplierId: string, items: any[], reference: string, dueDate: string, date: string }) => {
      if (!editingPurchase) return;
      const dateError = validateDateInFY(data.date);
      if (dateError) { notify(dateError, "error"); return; }
      const updatedPurchase: Purchase = {
          ...editingPurchase,
          supplierId: data.supplierId,
          date: data.date,
          dueDate: data.dueDate,
          reference: data.reference,
          items: data.items.map(p => ({ 
              itemId: p.item.id, 
              name: p.item.name, 
              quantity: p.qty, 
              cost: p.cost, 
              receivedQty: 0 
          })),
          total: data.items.reduce((sum, p) => sum + (p.qty * p.cost), 0),
      };
      updatePurchase(updatedPurchase);
      setEditingPurchase(null);
      setActiveTab('History');
      notify(`Bill ${id} updated successfully`, 'success');
  };

  const handleReceive = (id: string) => {
    const po = purchases.find(p => p.id === id);
    if (po) setReceivingPurchase(po);
  };

  const handleReceiveComplete = () => {
    setReceivingPurchase(null);
    refreshAllData();
  };

  const handleConvert = (id: string) => {
      const purchase = purchases.find(p => p.id === id);
      if (!purchase) return;

      setConfirmState({
        open: true,
        title: 'Verify Bill',
        message: 'Verify this Bill? This will lock the record as a confirmed payable.',
        type: 'info',
        confirmText: 'Verify',
        onConfirm: () => {
            updatePurchase({ ...purchase, status: 'Closed' });
            setSelectedPurchase(null);
            notify("Bill verified and closed for payment", "success");
        }
      });
  };

  const handleEditOrder = (po: Purchase) => {
      setEditingPurchase(po);
      setActiveTab('New');
  };

  const handleMergeOrders = (ids: string[]) => {
      if (ids.length < 2) {
          notify("Select at least 2 orders to merge.", "error");
          return;
      }
      
      const selectedOrders = purchases.filter(p => ids.includes(p.id));
      
      if (selectedOrders.length !== ids.length) {
          notify("Some selected orders could not be found.", "error");
          return;
      }

      // Validation 1: Same Supplier
      const supplierId = selectedOrders[0].supplierId;
      if (selectedOrders.some(p => p.supplierId !== supplierId)) {
          notify("Cannot merge orders from different suppliers.", "error");
          return;
      }

      setConfirmState({
        open: true,
        title: 'Merge Orders',
        message: `Merge ${ids.length} orders into one new Bill? Original orders will be cancelled.`,
        type: 'warning',
        confirmText: 'Merge',
        onConfirm: () => {
          // Combine items
          const combinedItems: any[] = [];
          selectedOrders.forEach(order => {
              order.items.forEach(item => {
                  const existing = combinedItems.find(i => i.itemId === item.itemId && i.cost === item.cost);
                  if (existing) {
                      existing.quantity += item.quantity;
                  } else {
                      combinedItems.push({ ...item, receivedQty: 0 });
                  }
              });
          });

          const totalCost = combinedItems.reduce((sum, i) => sum + (i.quantity * i.cost), 0);
          const newId = generateNextId('PO', purchases, companyConfig);

          addPurchase({
              id: newId,
              date: getDefaultDate(),
              supplierId,
              items: combinedItems,
              total: totalCost,
              status: 'Draft',
              notes: `Merged from orders: ${ids.join(', ')}`,
              paymentStatus: 'Unpaid'
          });

          selectedOrders.forEach(order => {
              updatePurchase({ ...order, status: 'Cancelled', notes: `${order.notes || ''} [Merged into ${newId}]` });
          });

          notify("Orders merged successfully! New Draft Bill created.", "success");
        }
      });
  };

  const handleBatchDelete = (ids: string[]) => {
      setConfirmState({
        open: true,
        title: 'Delete Bills',
        message: `Delete ${ids.length} selected bills? This will mark them as Cancelled.`,
        type: 'danger',
        confirmText: 'Delete',
        onConfirm: () => {
            ids.forEach(id => {
                const po = purchases.find(p => p.id === id);
                if (po) {
                    updatePurchase({ ...po, status: 'Cancelled', paymentStatus: 'Cancelled' });
                }
            });
            notify(`${ids.length} bills cancelled successfully.`, "success");
        }
      });
  };

  const handlePaymentRequest = (purchase: Purchase) => {
      setPaymentPurchase(purchase);
  };

  const handleRecordPayment = async (payment: SupplierPayment) => {
      if (!paymentPurchase) return;

      try {
          await recordSupplierPayment(payment);
          
          const updatedPaidAmount = (paymentPurchase.paidAmount || 0) + payment.amount;
          const updatedStatus = updatedPaidAmount >= paymentPurchase.total ? 'Paid' : 'Partial';
          
          const updatedPurchase = {
              ...paymentPurchase,
              paidAmount: updatedPaidAmount,
              paymentStatus: updatedStatus
          };

          updatePurchase(updatedPurchase);
          
          if (selectedPurchase && selectedPurchase.id === paymentPurchase.id) {
              setSelectedPurchase(updatedPurchase);
          }
          
          setPaymentPurchase(null);
          notify(`Payment of $${payment.amount.toLocaleString()} recorded successfully`, "success");
      } catch (err) {
          // Error notified by context
      }
  };

  const handleTabChange = (tab: 'New' | 'History') => {
      if (tab !== 'New') setEditingPurchase(null);
      setActiveTab(tab);
  };

  return (
    <div className="purchases-page flex flex-col h-full relative w-full" style={{background:paper,color:ink,fontFamily:"'Inter','DM Sans',sans-serif",fontSize:13.5}}>
      <style>{`
:root{--teal-50:#eef7f6;--teal-100:#d3ece9;--teal-200:#a6d9d3;--teal-300:#72c0b7;--teal-400:#3fa294;--teal-500:#1f8577;--teal-600:#146b60;--teal-700:#0f544c;--teal-800:#0b3e39;--teal-900:#082e2a;--amber-100:#fbead0;--amber-300:#eec27a;--amber-500:#d99a3f;--amber-600:#b97e2b;--paper:#FEFDFB;--ink:#23282A;--ink-soft:#5c6567;--hairline:#e4ddd1}
.purchases-page{background:var(--paper);color:var(--ink);font-family:'Inter','DM Sans',sans-serif;font-size:13.5px;min-height:100vh;padding:20px 24px!important;max-width:1600px!important;margin:0 auto!important}
.purchases-page *{box-sizing:border-box}
.purchases-card{background:var(--paper);border-radius:14px;box-shadow:0 30px 70px -20px rgba(0,0,0,.55),0 8px 24px -8px rgba(0,0,0,.35);overflow:hidden;border:1.4px solid var(--hairline)}
.purchases-tab{display:flex;align-items:center;gap:6px;padding:9px 18px;border-radius:9px;font-size:13px;font-weight:600;cursor:pointer;transition:all .15s ease;border:1.4px solid var(--hairline);background:var(--paper);color:var(--ink-soft);font-family:'Inter','DM Sans',sans-serif}
.purchases-tab:hover{background:var(--teal-50);color:var(--teal-700);border-color:var(--teal-200)}
.purchases-tab.active{background:linear-gradient(155deg,var(--teal-500),var(--teal-700));color:#fff;border-color:transparent;box-shadow:0 6px 16px -6px rgba(15,84,76,.55)}
.purchases-input{width:100%;border:1.4px solid var(--hairline);border-radius:9px;padding:9px 12px;background:var(--paper);font-family:'Inter','DM Sans',sans-serif;font-size:13.5px;color:var(--ink);outline:none;transition:border-color .15s ease,box-shadow .15s ease,background .15s ease}
.purchases-input:focus{border-color:var(--teal-400);box-shadow:0 0 0 3px rgba(31,133,119,.1)}
.purchases-input::placeholder{color:#b7afa4;opacity:.85}
.purchases-btn-primary{background:linear-gradient(155deg,var(--teal-500),var(--teal-700));color:#fff;border-radius:9px;padding:9px 18px;border:none;font-family:'Inter','DM Sans',sans-serif;font-size:13.5px;font-weight:600;cursor:pointer;box-shadow:0 6px 16px -6px rgba(15,84,76,.55);transition:all .15s ease;display:inline-flex;align-items:center;gap:7px}
.purchases-btn-primary:hover{transform:translateY(-1px);box-shadow:0 8px 20px -6px rgba(15,84,76,.65)}
.purchases-btn-primary:disabled{opacity:.55;cursor:not-allowed;transform:none}
.purchases-btn-ghost{background:var(--paper);border:1.4px solid var(--hairline);color:var(--ink-soft);border-radius:9px;padding:9px 18px;font-family:'Inter','DM Sans',sans-serif;font-size:13.5px;font-weight:600;cursor:pointer;transition:all .15s ease;display:inline-flex;align-items:center;gap:7px}
.purchases-btn-ghost:hover{background:var(--teal-50);color:var(--teal-800);border-color:var(--teal-200)}
.purchases-label{display:block;font-size:12px;font-weight:600;color:var(--teal-800);margin-bottom:6px;letter-spacing:.01;font-family:'Inter','DM Sans',sans-serif}
.purchases-accent-border{border-color:var(--teal-200)!important}
.purchases-accent-bg{background:linear-gradient(135deg,var(--teal-50) 0%,var(--paper) 100%)!important}
.purchases-text-heading{font-family:'DM Serif Display','Georgia',serif;font-size:22px;color:var(--teal-800);font-weight:400;letter-spacing:.2}
.purchases-text-subtitle{font-size:11.5px;color:var(--ink-soft);margin-top:2px;letter-spacing:.02;font-family:'Inter','DM Sans',sans-serif}
.purchases-icon-teal{background:linear-gradient(155deg,var(--teal-500),var(--teal-700));color:#fff;display:flex;align-items:center;justify-content:center;box-shadow:0 4px 10px -3px rgba(15,84,76,.6)}
.nav-tilde{color:var(--teal-400);margin:0 4px;opacity:.6}
      `}</style>
      
      {selectedPurchase && (
          <PurchaseOrderDetail 
              purchase={selectedPurchase}
              suppliers={suppliers}
              onClose={() => setSelectedPurchase(null)}
              onReceive={handleReceive}
              onConvert={handleConvert}
              onPayment={handlePaymentRequest}
          />
      )}

      {paymentPurchase && (
          <SupplierPaymentModal
              purchase={paymentPurchase}
              onClose={() => setPaymentPurchase(null)}
              onRecord={handleRecordPayment}
          />
      )}

      {receivingPurchase && (
          <PurchaseReceiveModal
              purchase={receivingPurchase}
              onClose={() => setReceivingPurchase(null)}
              onComplete={handleReceiveComplete}
          />
      )}

      <div className="mb-5 flex justify-between items-center shrink-0">
         <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg purchases-icon-teal" style={{borderRadius:10}}>
               <Truck size={18} />
            </div>
            <div>
               <h1 className="purchases-text-heading" style={{margin:0}}>Bills & Purchases</h1>
               <p className="purchases-text-subtitle">Manage vendor bills and purchase orders</p>
            </div>
         </div>
         <div className="flex gap-1 p-1">
            <button
              onClick={() => handleTabChange('New')}
              className={`purchases-tab${activeTab === 'New' ? ' active' : ''}`}
            >
               <ShoppingCart size={13} />{editingPurchase ? 'Edit Bill' : 'New Bill'}
            </button>
            <button
              onClick={() => handleTabChange('History')}
              className={`purchases-tab${activeTab === 'History' ? ' active' : ''}`}
            >
               <FileText size={13} />All Bills
            </button>
         </div>
      </div>

      <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
         {activeTab === 'New' && (
             <div className="purchases-card flex-1 min-h-0 overflow-hidden">
                <PurchaseBuilder
                    inventory={inventory}
                    suppliers={suppliers}
                    onCreateOrder={handleCreateOrder}
                    initialData={editingPurchase}
                    onUpdateOrder={handleUpdateOrder}
                    onCancel={() => { setEditingPurchase(null); setActiveTab('History'); }}
                />
             </div>
         )}

         {activeTab === 'History' && (
             <div className="purchases-card flex-1 min-h-0 overflow-hidden">
                <PurchaseHistory
                    purchases={purchases}
                    suppliers={suppliers}
                    onReceive={handleReceive}
                    onView={(po) => setSelectedPurchase(po)}
                    onEdit={handleEditOrder}
                    onMerge={handleMergeOrders}
                    onBatchDelete={handleBatchDelete}
                    onPayment={handlePaymentRequest}
                />
             </div>
         )}
      </div>

      <ConfirmDialog
        open={confirmState.open}
        onOpenChange={(open) => !open && setConfirmState(c => ({ ...c, open: false }))}
        onConfirm={() => {
          confirmState.onConfirm?.();
          setConfirmState(c => ({ ...c, open: false }));
        }}
        onCancel={() => setConfirmState(c => ({ ...c, open: false }))}
        title={confirmState.title}
        message={confirmState.message}
        confirmText={confirmState.confirmText}
        type={confirmState.type || 'question'}
      />


    </div>
  );
};

export default Purchases;
