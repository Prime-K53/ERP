import React, { createContext, useContext, useEffect, useState } from 'react';
import { Item, Warehouse, Purchase, GoodsReceipt, BillOfMaterial, SystemAlert, LedgerEntry, MarketAdjustment } from '../types';
import { useAuth } from './AuthContext';
import { useFinance } from './FinanceContext';
import { useInventoryStore } from '../stores/inventoryStore';
import { useProcurementStore } from '../stores/procurementStore';
import { transactionService } from '../services/transactionService';
import { generateNextId, roundFinancial } from '../utils/helpers';
import { generateLocalId } from '../utils/idGeneration';
import { dbService } from '../services/db';
import { useProductionStore } from '../stores/productionStore';
import { isItemBomRelevant, syncBomRelevantInventoryToBackend } from '../services/examinationSyncService';
import { logger } from '../services/logger';
import { syncAllItemStockWithWarehouses } from '../services/inventorySyncService';
import { checkAndSendLowStockAlerts } from '../services/lowStockAlertService';

interface InventoryContextType {
    inventory: Item[];
    warehouses: Warehouse[];
    purchases: Purchase[];
    goodsReceipts: GoodsReceipt[];
    marketAdjustments: MarketAdjustment[];
    refreshMarketAdjustments: () => Promise<void>;
    isLoading: boolean;
    fetchInventoryData: (silent?: boolean) => Promise<void>;
    fetchInventory: (silent?: boolean) => Promise<void>;
    fetchProcurementData: () => Promise<void>;

    addItem: (item: Item) => Promise<void>;
    updateItem: (item: Item, reason?: string) => Promise<void>;
    recalculatePrice: (itemId: string) => Promise<Item | undefined>;
    deleteItem: (id: string, reason?: string) => Promise<void>;

    addWarehouse: (warehouse: Warehouse) => Promise<void>;
    deleteWarehouse: (id: string) => Promise<void>;

    addPurchase: (purchase: Purchase) => void;
    updatePurchase: (purchase: Purchase, reason?: string) => void;
    approvePurchase: (id: string) => Promise<void>;

    saveGoodsReceipt: (grn: GoodsReceipt) => Promise<string>;
    processGoodsReceipt: (grn: GoodsReceipt) => Promise<void>;
    deleteGoodsReceipt: (id: string) => void;

    updateStock: (itemId: string, quantityChange: number, locationId?: string, reason?: string, manualAdjustment?: boolean, variantId?: string) => Promise<void>;
    updateReservedStock: (itemId: string, reservedChange: number, reason?: string, variantId?: string) => void;
    transferStock: (itemId: string, fromLocationId: string, toLocationId: string, quantity: number, reason?: string) => void;
    getAvailableWithKits: (itemId: string) => number;
    triggerReplenishment: (itemId: string) => Promise<string>;
    reconcileInventory: (results: { itemId: string; variance: number; warehouseId: string }[]) => Promise<void>;
    syncWarehouseStock: () => Promise<number>;
}

const InventoryContext = createContext<InventoryContextType | undefined>(undefined);

export const InventoryProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const { notify, addAlert, companyConfig, addAuditLog, isInitialized } = useAuth();
    const { postJournalEntry } = useFinance();
    const prodStore = useProductionStore();

    const {
        inventory, warehouses, fetchInventory, isLoading: isInventoryLoading,
        addItem: storeAddItem, updateItem: storeUpdateItem, recalculatePrice: storeRecalculatePrice, deleteItem: storeDeleteItem,
        addWarehouse: storeAddWarehouse, deleteWarehouse: storeDeleteWarehouse, updateStock: storeUpdateStock, transferStock: storeTransferStock,
        updateReservedStock: storeUpdateReservedStock
    } = useInventoryStore();

    const {
        purchases, goodsReceipts, fetchProcurementData, isLoading: isProcurementLoading,
        addPurchase: storeAddPurchase, updatePurchase: storeUpdatePurchase,
        addGoodsReceipt: storeAddGoodsReceipt, updateGoodsReceipt: storeUpdateGoodsReceipt, deleteGoodsReceipt: storeDeleteGoodsReceipt
    } = useProcurementStore();

    const [marketAdjustments, setMarketAdjustments] = useState<MarketAdjustment[]>([]);

    const fetchMarketAdjustments = async () => {
        try {
            const data = await dbService.getAll<MarketAdjustment>('marketAdjustments');
            setMarketAdjustments(data);
        } catch (error) {
            logger.error("Failed to fetch market adjustments", error as Error);
        }
    };

    const isLoading = isInventoryLoading || isProcurementLoading;

    const syncBomRelevantInventory = async (
        triggerReason: string,
        items?: Array<Partial<Item> & { id: string }>
    ) => {
        try {
            const syncResult = await syncBomRelevantInventoryToBackend({
                items: items && items.length > 0 ? items : undefined,
                triggerRecalculate: true
            });
            if (syncResult?.recalculation?.failed > 0) {
                notify(`Inventory synced but ${syncResult.recalculation.failed} examination batch recalculation(s) failed`, 'error');
            }
        } catch (error) {
            logger.error(`Failed to sync BOM-relevant inventory after ${triggerReason}:`, error);
            notify('Inventory updated locally, but examination backend sync failed', 'error');
        }
    };

    useEffect(() => {
        if (!isInitialized) return;

        // Auth initialized, fetching inventory and procurement data
        fetchInventory();
        fetchProcurementData();
        fetchMarketAdjustments();

        // Sync Item.stock with WarehouseInventory on startup
        syncAllItemStockWithWarehouses().catch(err =>
            console.warn('Initial warehouse stock sync failed:', err)
        );
    }, [isInitialized]);

    const getAvailableWithKits = (itemId: string): number => {
        const item = inventory.find(i => i.id === itemId);
        if (!item) return 0;
        const onHand = item.stock;
        if (!item.isComposite) return onHand;
        const bom = prodStore.boms.find(b => b.productId === itemId);
        if (!bom) return onHand;

        const getAssemblableQty = (b: BillOfMaterial): number => {
            const componentAssemblable = b.components.map(comp => {
                const compItem = inventory.find(i => i.id === comp.materialId);
                if (!compItem) return 0;
                let compAvailable = compItem.stock;
                if (compItem.isComposite) {
                    const subBom = prodStore.boms.find(sb => sb.productId === compItem.id);
                    if (subBom) compAvailable += getAssemblableQty(subBom);
                }
                return Math.floor(compAvailable / comp.quantity);
            });
            return Math.min(...componentAssemblable);
        };
        return onHand + getAssemblableQty(bom);
    };

    const toLowStockItems = (items: Item[]) =>
        items.map(i => ({ id: i.id, name: i.name, sku: i.sku, stock: i.stock, reorderPoint: i.reorderPoint ?? 0 }));

    const addItem = async (item: Item): Promise<void> => {
        try {
            await storeAddItem(item);
            addAuditLog({
                action: 'CREATE',
                entityType: 'Item',
                entityId: item.name,
                details: `Created new ${item.type || 'item'}: ${item.name}`,
                newValue: item
            });
            // Fire-and-forget sync to backend - don't block the save operation
            syncBomRelevantInventory('item creation').catch((error) => {
                console.warn('Background inventory sync failed:', error);
            });
            checkAndSendLowStockAlerts(toLowStockItems(inventory)).catch(() => {});
        } catch (err: any) {
            throw err;
        }
    };

    const updateItem = async (item: Item, reason?: string): Promise<void> => {
        const oldVal = inventory.find(i => i.id === item.id);
        try {
            await storeUpdateItem(item);
            addAuditLog({
                action: 'UPDATE',
                entityType: 'Item',
                entityId: item.id,
                details: `Updated item: ${item.name}`,
                oldValue: oldVal,
                newValue: item,
                reason: reason
            });

            const normalizePrice = (item: any) => {
              if (item == null) return 0;
              const val = item.cost_price ?? item.costPrice ?? item.cost ?? item.sellingPrice ?? 0;
              return Number(val);
            };
            const previousCost = normalizePrice(oldVal);
            const nextCost = normalizePrice(item);
            const costChanged = Math.abs(previousCost - nextCost) > 0.00001;
            const wasBomRelevant = oldVal ? isItemBomRelevant(oldVal) : false;
            const isNowBomRelevant = isItemBomRelevant(item);
            if (costChanged || wasBomRelevant || isNowBomRelevant) {
                // Fire-and-forget sync to backend - don't block the save operation
                syncBomRelevantInventory('item update', [item]).catch((error) => {
                    console.warn('Background inventory sync failed:', error);
                });
            }
            checkAndSendLowStockAlerts(toLowStockItems(inventory)).catch(() => {});
        } catch (err: any) {
            throw err;
        }
    };

    const deleteItem = async (id: string, reason?: string): Promise<void> => {
        const oldVal = inventory.find(i => i.id === id);
        try {
            await storeDeleteItem(id);
            addAuditLog({
                action: 'DELETE',
                entityType: 'Item',
                entityId: id,
                details: `Deleted item: ${oldVal?.name || id}`,
                oldValue: oldVal,
                reason: reason
            });
        } catch (err: any) {
            throw err;
        }
    };

    const recalculatePrice = async (itemId: string): Promise<Item | undefined> => {
        try {
            const updatedItem = await storeRecalculatePrice(itemId);
            if (updatedItem) {
                addAuditLog({
                    action: 'UPDATE',
                    entityType: 'Item',
                    entityId: itemId,
                    details: `Recalculated and rounded selling price for ${updatedItem.name}`,
                    newValue: {
                        cost_price: updatedItem.cost_price,
                        calculated_price: updatedItem.calculated_price,
                        selling_price: updatedItem.selling_price,
                        rounding_difference: updatedItem.rounding_difference,
                        rounding_method: updatedItem.rounding_method
                    }
                });
                notify(`Price recalculated for ${updatedItem.name}`, 'success');
            }
            return updatedItem;
        } catch (err: any) {
            notify(`Price recalculation failed: ${err.message}`, 'error');
            return undefined;
        }
    };

    const addWarehouse = async (w: Warehouse): Promise<void> => {
        try {
            await storeAddWarehouse(w);
            addAuditLog({
                action: 'CREATE',
                entityType: 'Warehouse',
                entityId: w.id,
                details: `Added new warehouse: ${w.name}`
            });
        } catch (err: any) {
            throw err;
        }
    };

    const deleteWarehouse = async (id: string): Promise<void> => {
        const wh = warehouses.find(w => w.id === id);
        try {
            await storeDeleteWarehouse(id);
            if (wh) {
                addAuditLog({
                    action: 'DELETE',
                    entityType: 'Warehouse',
                    entityId: id,
                    details: `Deleted warehouse: ${wh.name}`
                });
            }
        } catch (err: any) {
            throw err;
        }
    };

    const updateStock = async (itemId: string, qty: number, loc: string = 'WH-MAIN', reason?: string, manualAdjustment: boolean = true, variantId?: string) => {
        const item = inventory.find(i => i.id === itemId);
        const oldStock = item?.stock || 0;

        try {
            // ALWAYS use TransactionService for stock adjustments to ensure atomicity and ledger integrity
            await transactionService.adjustStock({
                itemId,
                qtyChange: qty,
                reason: reason || (manualAdjustment ? 'Manual Adjustment' : 'System Adjustment'),
                warehouseId: loc,
                notes: reason,
                variantId
            });

            // Refresh to sync UI with DB changes
            await fetchInventory();

            // Audit Log (UI/UX Feedback)
            addAuditLog({
                action: 'UPDATE',
                entityType: 'Stock',
                entityId: itemId,
                details: `Stock adjustment for ${item?.name}${variantId ? ` (Variant: ${variantId})` : ''}: ${qty > 0 ? '+' : ''}${qty} units. New: ${oldStock + qty}`,
                oldValue: { stock: oldStock },
                newValue: { stock: oldStock + qty },
                reason: reason
            });

            // For printed/print-consumption items we suppress low-stock alerts
            if (item && !(item as Item & { printConsumptionEnabled?: boolean }).printConsumptionEnabled && oldStock + qty <= item.minStockLevel && qty < 0) {
                addAlert({
                    id: `STOCK-LOW-${itemId}-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
                    message: `Low Stock: ${item.name} at ${oldStock + qty} units.`,
                    type: 'Stock', date: new Date().toISOString(), severity: 'High'
                });
            }
            checkAndSendLowStockAlerts(toLowStockItems(inventory)).catch(() => {});
        } catch (err: any) {
            notify(`Stock update failed: ${err.message}`, "error");
        }
    };

    const updateReservedStock = async (itemId: string, reservedChange: number, reason?: string, variantId?: string) => {
        try {
            await transactionService.updateReservedStock(itemId, reservedChange, variantId);
            await fetchInventory();
            addAuditLog({
                action: 'UPDATE',
                entityType: 'Inventory',
                entityId: itemId,
                details: `${reservedChange > 0 ? 'Reserved' : 'Released'} ${Math.abs(reservedChange)} units${variantId ? ` (Variant: ${variantId})` : ''}. Reason: ${reason || 'Not specified'}`,
            });
        } catch (err: any) {
            notify(`Reservation update failed: ${err.message}`, "error");
        }
    };

    const transferStock = async (id: string, f: string, t: string, q: number, reason?: string) => {
        try {
            await transactionService.transferStock(id, f, t, q);
            await fetchInventory();
            addAuditLog({
                action: 'UPDATE',
                entityType: 'StockTransfer',
                entityId: id,
                details: `Transferred ${q} units from ${f} to ${t}`,
                reason: reason
            });
            notify('Stock moved', 'success');
        } catch (err: any) {
            notify(`Transfer failed: ${err.message}`, "error");
        }
    };

    const addPurchase = async (p: Purchase) => {
        try {
            await transactionService.processPurchaseOrder(p);
            await fetchProcurementData();

            addAuditLog({
                action: 'CREATE',
                entityType: 'PurchaseOrder',
                entityId: p.id,
                details: `Created Purchase Order for ${p.supplierId}. Status: ${p.status}`,
                newValue: p
            });
            notify('Purchase saved', 'success');
        } catch (err: any) {
            notify(`Failed to save purchase: ${err.message}`, 'error');
        }
    };

    const updatePurchase = async (p: Purchase, reason?: string) => {
        const oldVal = purchases.find(prev => prev.id === p.id);
        try {
            await transactionService.processPurchaseOrder(p);
            await fetchProcurementData();

            addAuditLog({
                action: 'UPDATE',
                entityType: 'PurchaseOrder',
                entityId: p.id,
                details: `Updated Purchase Order status to ${p.status}`,
                oldValue: oldVal,
                newValue: p,
                reason: reason
            });
            notify(`Update complete`, 'success');
        } catch (err: any) {
            notify(`Update failed: ${err.message}`, 'error');
        }
    };

    const approvePurchase = async (id: string) => {
        try {
            await transactionService.approvePurchaseOrder(id);
            await fetchProcurementData();
            addAuditLog({
                action: 'UPDATE',
                entityType: 'PurchaseOrder',
                entityId: id,
                details: `Approved Purchase Order ${id}`,
            });
            notify('Purchase Order approved', 'success');
        } catch (err: any) {
            notify(`Approval failed: ${err.message}`, 'error');
        }
    };

    const saveGoodsReceipt = async (grn: GoodsReceipt): Promise<string> => {
        const id = grn.id || generateNextId('GRN', goodsReceipts, companyConfig);
        if (grn.id) await storeUpdateGoodsReceipt(grn);
        else {
            await storeAddGoodsReceipt({ ...grn, id });
            addAuditLog({
                action: 'CREATE',
                entityType: 'GoodsReceipt',
                entityId: id,
                details: `Initial draft for Goods Receipt ${id}`
            });
        }
        return id;
    };

    const processGoodsReceipt = async (grn: GoodsReceipt) => {
        try {
            // Use TransactionService for atomic, multi-module processing
            await transactionService.processGoodsReceipt(grn);

            // Sync stores/UI
            await fetchInventory();
            await fetchProcurementData();

            addAuditLog({
                action: 'UPDATE',
                entityType: 'GoodsReceipt',
                entityId: grn.id,
                details: `Verified GRN ${grn.id} via TransactionService. Landed Costs capitalized into Inventory.`,
                newValue: grn
            });

            notify(`GRN ${grn.id} verified successfully.`, 'success');
        } catch (error: any) {
            logger.error("GRN Processing Error", error as Error, { grnId: grn.id });
            notify(`Failed to process GRN: ${error.message}`, 'error');
        }
    };

    const deleteGoodsReceipt = (id: string) => {
        storeDeleteGoodsReceipt(id);
        addAuditLog({
            action: 'DELETE',
            entityType: 'GoodsReceipt',
            entityId: id,
            details: `Removed GRN draft ${id}`
        });
    };

    const triggerReplenishment = async (itemId: string): Promise<string> => {
        try {
            const purchase = await transactionService.createReplenishmentOrder(itemId);
            await fetchProcurementData(); // Sync UI

            addAuditLog({
                action: 'CREATE',
                entityType: 'PurchaseOrder',
                entityId: purchase.id,
                details: `Auto-replenishment triggered for item ${itemId}`,
                newValue: purchase
            });

            notify(`Replenishment Order ${purchase.id} created successfully.`, 'success');
            return purchase.id;
        } catch (error: any) {
            logger.error("Replenishment Error", error as Error, { itemId });
            notify(`Failed to create replenishment: ${error.message}`, 'error');
            throw error;
        }
    };

    const syncWarehouseStock = async (): Promise<number> => {
        try {
            const count = await syncAllItemStockWithWarehouses();
            if (count > 0) {
                await fetchInventory();
            }
            return count;
        } catch (err: any) {
            notify(`Warehouse stock sync failed: ${err.message}`, 'error');
            return 0;
        }
    };

    const reconcileInventory = async (results: { itemId: string; variance: number; warehouseId: string }[]) => {
        try {
            let totalVarianceCost = 0;

            for (const res of results) {
                const item = inventory.find(i => i.id === res.itemId);
                if (!item) continue;
                const costPerUnit = item.cost || 0;
                totalVarianceCost += res.variance * costPerUnit;
            }

            // Use atomic transaction service
            await transactionService.reconcileInventory(results, totalVarianceCost);

            // Refresh data
            await fetchInventory();

            notify(`Inventory reconciled. ${results.length} variances adjusted.`, "success");
        } catch (err: any) {
            notify(`Reconciliation Failed: ${err.message}`, "error");
        }
    };

    return (
        <InventoryContext.Provider value={{
            inventory, warehouses, purchases, goodsReceipts, marketAdjustments,
            isLoading,
            refreshMarketAdjustments: fetchMarketAdjustments,
            fetchInventoryData: fetchInventory,
            fetchInventory,
            fetchProcurementData,
            addItem, updateItem, recalculatePrice, deleteItem, addWarehouse, deleteWarehouse,
            addPurchase, updatePurchase, approvePurchase, saveGoodsReceipt, processGoodsReceipt, deleteGoodsReceipt,
            updateStock, updateReservedStock, transferStock, getAvailableWithKits,
            triggerReplenishment,
            reconcileInventory,
            syncWarehouseStock
        }}>
            {children}
        </InventoryContext.Provider>
    );
};

export const useInventory = () => {
    const context = useContext(InventoryContext);
    if (!context) throw new Error('useInventory must be used within InventoryProvider');
    return context;
};
