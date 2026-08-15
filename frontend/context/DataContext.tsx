import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { logger } from '@/services/logger';
import { useFinanceStore } from '../stores/financeStore';
import { useInventory } from './InventoryContext';
import { useProduction } from './ProductionContext';
import { useSales } from './SalesContext';
import { useProcurement } from './ProcurementContext';
import { useOrders } from './OrdersContext';
import { useExamination } from './ExaminationContext';
import { useBankingStore } from './BankingContext';
import { useAuth } from './AuthContext';
import { dbService } from '../services/db';
import { generateNextId } from '../utils/helpers';
import { runLegacyRefreshTasks } from './legacyDataContext';
import { generateOpaqueId } from '../utils/idGeneration';

export const REFRESH_INTERVAL = 300_000;
const FRESH_THRESHOLD_MS = 30_000;
const REFRESH_DEBOUNCE_MS = 250;
const MIN_POLL_INTERVAL = 60_000;

type DataContextValue = {
  refreshAllData: (options?: { force?: boolean }) => Promise<void>;
  startPolling: (intervalMs?: number) => void;
  stopPolling: () => void;
  customerPayments: any[];
  companyConfig: any;
  sales: any[];
  tasks: any[];
  workOrders: any[];
  recurringInvoices: any[];
  invoices: any[];
  filteredLedger: any[];
  accounts: any[];
  filteredInvoices: any[];
  alerts: any[];
  reminders: any[];
  isOnline: boolean;
  user: any;
  notify: (message: string, type?: 'info' | 'success' | 'warning' | 'error') => void;
  dbSyncStatus: string;
  connectDbSync: () => void;
  toggleReminder: (id: string) => void;
  addReminder: (text: string, date?: string) => void;
  deleteReminder: (id: string) => void;
  clearAlerts: () => void;
  dismissAlert: (id: string) => void;
  addTask: (task: any) => void;
  updateTask: (task: any) => void;
  deleteTask: (id: string) => void;
};

const DataContext = createContext<DataContextValue | undefined>(undefined);

export const DataProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const finance = useFinanceStore();
    const inventory = useInventory();
    const production = useProduction();
    const sales = useSales();
    const procurement = useProcurement();
    const orders = useOrders();
    const examination = useExamination();
    const auth = useAuth();

    const [tasks, setTasks] = useState<any[]>([]);

    const loadTasks = useCallback(async () => {
        try {
            const stored = await dbService.getAll<any>('tasks');
            setTasks(stored);
        } catch {
            setTasks([]);
        }
    }, []);

    useEffect(() => {
        loadTasks();
    }, [loadTasks]);

    const refreshInFlightRef = useRef(false);
    const refreshTimerRef = useRef<number | null>(null);
    const pollTimerRef = useRef<number | null>(null);
    const channelRef = useRef<BroadcastChannel | null>(null);
    const lastRefreshAtRef = useRef(0);
    const instanceIdRef = useRef(generateOpaqueId('ctx', { randomLength: 8 }));
    // Share the instance ID with db.ts so that emitDataChange uses the same
    // source value, allowing self-triggered data-changed events to be filtered out.
    dbService.source = instanceIdRef.current;

    const refreshAllData = useCallback(async (options?: { force?: boolean }) => {
        if (!options?.force && Date.now() - lastRefreshAtRef.current < FRESH_THRESHOLD_MS) {
            return;
        }
        if (refreshInFlightRef.current) {
            return;
        }
        refreshInFlightRef.current = true;
        try {
            await runLegacyRefreshTasks({
                finance,
                sales,
                inventory,
                procurement,
                production,
                orders,
                examination,
                banking: { fetchBankingData: useBankingStore.getState().fetchBankingData }
            }, true);
        } finally {
            lastRefreshAtRef.current = Date.now();
            refreshInFlightRef.current = false;
        }
    }, [finance, sales, inventory, procurement, production, orders, examination]);

    const queueRefresh = useCallback((delayMs = REFRESH_DEBOUNCE_MS, options: { force?: boolean } = { force: true }) => {
        if (refreshTimerRef.current) {
            window.clearTimeout(refreshTimerRef.current);
        }
        refreshTimerRef.current = window.setTimeout(() => {
            refreshAllData(options).catch((err) => logger.error('[DataContext] refresh failed:', err));
        }, delayMs);
    }, [refreshAllData]);

    const startPolling = useCallback((intervalMs = REFRESH_INTERVAL) => {
        if (pollTimerRef.current) {
            window.clearInterval(pollTimerRef.current);
            pollTimerRef.current = null;
        }
        // Enforce minimum polling interval to prevent overwhelming the backend
        const safeInterval = Math.max(intervalMs, MIN_POLL_INTERVAL);
        pollTimerRef.current = window.setInterval(() => {
            refreshAllData().catch((err) => logger.error('[DataContext] poll refresh failed:', err));
        }, safeInterval);
    }, [refreshAllData]);

    const stopPolling = useCallback(() => {
        if (!pollTimerRef.current) return;
        window.clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
    }, []);

    useEffect(() => {
        if (typeof window === 'undefined') return;

        const handleLocalDataChange = (event: Event) => {
            const customEvent = event as CustomEvent<{ source?: string }>;
            if (customEvent.detail?.source && customEvent.detail.source === instanceIdRef.current) return;
            queueRefresh(80);
        };

        const handleStorageChange = (event: StorageEvent) => {
            if (event.key !== 'primeerp:data-changed') return;
            queueRefresh(120);
        };

        window.addEventListener('primeerp:data-changed', handleLocalDataChange as EventListener);
        window.addEventListener('storage', handleStorageChange);

        if (typeof BroadcastChannel !== 'undefined') {
            channelRef.current = new BroadcastChannel('primeerp-data-sync');
            channelRef.current.onmessage = (messageEvent) => {
                const payload = messageEvent.data || {};
                if (payload.source && payload.source === instanceIdRef.current) return;
                if (payload.type === 'data-changed') {
                    queueRefresh(80);
                }
            };
        }

        return () => {
            window.removeEventListener('primeerp:data-changed', handleLocalDataChange as EventListener);
            window.removeEventListener('storage', handleStorageChange);
            if (refreshTimerRef.current) {
                window.clearTimeout(refreshTimerRef.current);
                refreshTimerRef.current = null;
            }
            stopPolling();
            if (channelRef.current) {
                channelRef.current.close();
                channelRef.current = null;
            }
        };
    }, [queueRefresh, refreshAllData, startPolling, stopPolling]);

    // NOTE: The Supabase realtime subscription was removed from this component.
    // syncService.ts::subscribeToRemoteChanges() handles all realtime events for
    // all tables and now correctly dispatches 'primeerp:data-changed' + BroadcastChannel
    // messages after each IndexedDB write, which the listeners above pick up via
    // queueRefresh(). Having a second subscription here caused a query storm
    // (refreshAllData() on every event across 160+ tables simultaneously).


    const addTask = useCallback(async (task: any) => {
        const newTask = { ...task, id: task.id || generateNextId('TASK', tasks, auth.companyConfig) };
        await dbService.put('tasks', newTask);
        setTasks(prev => [...prev, newTask]);
    }, [tasks, auth]);

    const updateTask = useCallback(async (task: any) => {
        await dbService.put('tasks', task);
        setTasks(prev => prev.map(t => t.id === task.id ? task : t));
    }, []);

    const deleteTask = useCallback(async (id: string) => {
        await dbService.delete('tasks', id);
        setTasks(prev => prev.filter(t => t.id !== id));
    }, []);

    const addReminder = useCallback((text: string, date?: string) => {
        auth.addReminder(text, date);
    }, [auth]);

    const toggleReminder = useCallback((id: string) => {
        auth.toggleReminder(id);
    }, [auth]);

    const deleteReminder = useCallback((id: string) => {
        auth.deleteReminder(id);
    }, [auth]);

    const clearAlerts = useCallback(() => {
        auth.clearAlerts();
    }, [auth]);

    const dismissAlert = useCallback((id: string) => {
        auth.dismissAlert(id);
    }, [auth]);

    return (
        <DataContext.Provider value={{
            refreshAllData,
            startPolling,
            stopPolling,
            customerPayments: (sales as { customerPayments?: any[] })?.customerPayments || [],
            companyConfig: auth.companyConfig,
            sales: (sales as { sales?: any[] })?.sales || [],
            tasks,
            workOrders: (production as { workOrders?: any[] })?.workOrders || [],
            recurringInvoices: (finance as { recurringInvoices?: any[] })?.recurringInvoices || [],
            invoices: (finance as { invoices?: any[] })?.invoices || [],
            filteredLedger: (finance as { ledger?: any[] })?.ledger || [],
            accounts: (finance as { accounts?: any[] })?.accounts || [],
            filteredInvoices: (finance as { invoices?: any[] })?.invoices || [],
            alerts: auth.alerts,
            reminders: auth.reminders,
            isOnline: auth.isOnline,
            user: auth.user,
            notify: auth.notify,
            dbSyncStatus: auth.dbSyncStatus as string,
            connectDbSync: auth.connectDbSync,
            toggleReminder,
            addReminder,
            deleteReminder,
            clearAlerts,
            dismissAlert,
            updateTask,
            addTask,
            deleteTask
        }}>
            {children}
        </DataContext.Provider>
    );
}

export const useData = () => {
    const context = useContext(DataContext);
    if (!context) {
        throw new Error('useData must be used within a DataProvider');
    }
    return context;
};
