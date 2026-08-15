import { useState, useEffect, useCallback, useMemo } from 'react';
import type { Item, Purchase, Sale, InventoryTransaction, AuditLogEntry, ProductionBatch, WorkOrder, Supplier } from '../../../../types';
import * as itemDetailService from '../services/itemDetailService';

export function useItemDetail(itemId: string | undefined) {
  const [item, setItem] = useState<Item | null>(null);
  const [allItems, setAllItems] = useState<Item[]>([]);
  const [transactions, setTransactions] = useState<InventoryTransaction[]>([]);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [productionData, setProductionData] = useState<{ batches: ProductionBatch[]; workOrders: WorkOrder[] }>({ batches: [], workOrders: [] });
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('overview');
  const [error, setError] = useState<string | null>(null);

  const loadItem = useCallback(async (id: string) => {
    setLoading(true);
    setError(null);
    try {
      const [fetchedItem, all, trans, purch, sal, audit, prod, supp] = await Promise.all([
        itemDetailService.fetchItem(id),
        itemDetailService.fetchAllItems(),
        itemDetailService.fetchItemTransactions(id),
        itemDetailService.fetchPurchaseHistory(id),
        itemDetailService.fetchSalesHistory(id),
        itemDetailService.fetchAuditLog(id),
        itemDetailService.fetchProductionData(id),
        itemDetailService.fetchSuppliers(),
      ]);
      if (!fetchedItem) {
        setError('Item not found');
      } else {
        setItem(fetchedItem);
      }
      setAllItems(all);
      setTransactions(trans);
      setPurchases(purch);
      setSales(sal);
      setAuditLogs(audit);
      setProductionData(prod);
      setSuppliers(supp);
    } catch (err: any) {
      setError(err?.message || 'Failed to load item');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (itemId) loadItem(itemId);
  }, [itemId, loadItem]);

  const refresh = useCallback(() => {
    if (itemId) loadItem(itemId);
  }, [itemId, loadItem]);

  const itemIndex = useMemo(() => {
    if (!item) return -1;
    return allItems.findIndex(i => i.id === item.id);
  }, [item, allItems]);

  const prevItem = useMemo(() => {
    if (itemIndex <= 0) return null;
    return allItems[itemIndex - 1];
  }, [itemIndex, allItems]);

  const nextItem = useMemo(() => {
    if (itemIndex < 0 || itemIndex >= allItems.length - 1) return null;
    return allItems[itemIndex + 1];
  }, [itemIndex, allItems]);

  const stockCalc = useMemo(() => item ? itemDetailService.getItemStockCalculations(item) : null, [item]);
  const pricingCalc = useMemo(() => item ? itemDetailService.getItemPricing(item) : null, [item]);

  const handleSave = useCallback(async (updated: Item) => {
    await itemDetailService.saveItem(updated);
    setItem(updated);
  }, []);

  const handleDuplicate = useCallback(async () => {
    if (!item) return null;
    return itemDetailService.duplicateItem(item);
  }, [item]);

  return {
    item, allItems, loading, error,
    transactions, purchases, sales, auditLogs, productionData, suppliers,
    activeTab, setActiveTab,
    stockCalc, pricingCalc,
    prevItem, nextItem,
    refresh, handleSave, handleDuplicate,
  };
}
