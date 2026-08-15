import React, { createContext, useContext, useEffect } from 'react';
import { logger } from '@/services/logger';
import { useProcurementStore } from '../stores/procurementStore';
import { Purchase, GoodsReceipt, SubcontractOrder, Supplier } from '../types';
import { useAuth } from './AuthContext';

interface ProcurementContextType {
  purchases: Purchase[];
  goodsReceipts: GoodsReceipt[];
  subcontractOrders: SubcontractOrder[];
  suppliers: Supplier[];
  isLoading: boolean;

  fetchProcurementData: () => Promise<void>;
  addPurchase: (purchase: Purchase) => Promise<void>;
  updatePurchase: (purchase: Purchase) => Promise<void>;
  receivePurchase: (id: string) => Promise<void>;
  
  addGoodsReceipt: (gr: GoodsReceipt) => Promise<void>;
  updateGoodsReceipt: (gr: GoodsReceipt) => Promise<void>;
  deleteGoodsReceipt: (id: string) => Promise<void>;

  addSubcontractOrder: (order: SubcontractOrder) => Promise<void>;
  updateSubcontractOrder: (order: SubcontractOrder) => Promise<void>;
  deleteSubcontractOrder: (id: string) => Promise<void>;

  addSupplier: (supplier: Supplier) => Promise<Supplier>;
  updateSupplier: (supplier: Supplier) => Promise<void>;
  deleteSupplier: (id: string) => Promise<void>;
}

const ProcurementContext = createContext<ProcurementContextType | undefined>(undefined);

export const ProcurementProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    // receivePurchase will be defined after store initialization

    const store = useProcurementStore();
    const receivePurchase = async (id: string) => {
        const purchase = store.purchases.find(p => p.id === id);
        if (!purchase) {
            console.warn(`Purchase with id ${id} not found`);
            return;
        }
        const updatedPurchase: Purchase = { ...purchase, status: 'Received' };
        await store.updatePurchase(updatedPurchase);
    };

  const { notify, addAuditLog, isInitialized } = useAuth();

  useEffect(() => {
    if (!isInitialized) return;

    // Auth initialized, fetching procurement data
    store.fetchProcurementData().catch(err => {
      logger.error("Failed to initialize procurement data:", err);
    });
  }, [isInitialized]);

  const addSupplier = async (supplier: Supplier) => {
    try {
      const newSupplier = await store.addSupplier(supplier);
      notify(`Supplier ${newSupplier.name} added successfully`, "success");
      addAuditLog({ 
        action: 'CREATE', 
        entityType: 'Supplier', 
        entityId: newSupplier.id, 
        details: `Added supplier: ${newSupplier.name}`,
        newValue: newSupplier
      });
      return newSupplier;
    } catch (err: any) {
      notify(`Failed to add supplier: ${err.message}`, "error");
      throw err;
    }
  };

  const updateSupplier = async (supplier: Supplier) => {
    try {
      const oldSupplier = store.suppliers.find(s => s.id === supplier.id);
      await store.updateSupplier(supplier);
      notify(`Supplier ${supplier.name} updated successfully`, "success");
      addAuditLog({ 
        action: 'UPDATE', 
        entityType: 'Supplier', 
        entityId: supplier.id, 
        details: `Updated supplier: ${supplier.name}`, 
        oldValue: oldSupplier,
        newValue: supplier 
      });
    } catch (err: any) {
      notify(`Failed to update supplier: ${err.message}`, "error");
    }
  };

  const deleteSupplier = async (id: string) => {
    try {
      const supplier = store.suppliers.find(s => s.id === id);
      await store.deleteSupplier(id);
      notify(`Supplier deleted successfully`, "success");
      addAuditLog({ 
        action: 'DELETE', 
        entityType: 'Supplier', 
        entityId: id, 
        details: `Deleted supplier: ${supplier?.name || id}`,
        oldValue: supplier
      });
    } catch (err: any) {
      notify(`Failed to delete supplier: ${err.message}`, "error");
    }
  };

  return (
    <ProcurementContext.Provider value={{
      ...store,
      addSupplier,
      updateSupplier,
      deleteSupplier,
      receivePurchase
    }}>
      {children}
    </ProcurementContext.Provider>
  );
};

export const useProcurement = () => {
  const context = useContext(ProcurementContext);
  if (!context) throw new Error('useProcurement must be used within ProcurementProvider');
  return context;
};
