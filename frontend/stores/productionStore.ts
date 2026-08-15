
import { create } from 'zustand';
import { logger } from '../services/logger';
import { ProductionBatch, WorkOrder, WorkCenter, ProductionResource, ResourceAllocation, MaintenanceLog, BillOfMaterial } from '../types';
import { dbService } from '../services/db';
import { api } from '../services/api';
import { generateNextId } from '../utils/helpers';
import { MOCK_WORK_CENTERS, MOCK_RESOURCES } from '../constants';
import { isSupabaseConfigured } from '../services/cloudMode';

const isProd = Boolean(import.meta.env?.PROD);

interface ProductionState {
  batches: ProductionBatch[];
  workOrders: WorkOrder[];
  workCenters: WorkCenter[];
  resources: ProductionResource[];
  allocations: ResourceAllocation[];
  maintenanceLogs: MaintenanceLog[];
  boms: BillOfMaterial[];
  isLoading: boolean;

  fetchProductionData: () => Promise<void>;

  addBatch: (batch: ProductionBatch) => Promise<void>;

  addWorkOrder: (wo: WorkOrder) => Promise<void>;
  updateWorkOrder: (wo: WorkOrder) => Promise<void>;
  deleteWorkOrder: (id: string) => Promise<void>;

  addAllocation: (allocation: ResourceAllocation) => Promise<void>;
  updateAllocation: (allocation: ResourceAllocation) => Promise<void>;
  deleteAllocation: (id: string) => Promise<void>;

  addMaintenanceLog: (log: MaintenanceLog) => Promise<void>;
  deleteMaintenanceLog: (id: string) => Promise<void>;

  addBOM: (bom: BillOfMaterial) => Promise<void>;
  updateBOM: (bom: BillOfMaterial) => Promise<void>;
  deleteBOM: (id: string) => Promise<void>;
}

export const useProductionStore = create<ProductionState>((set, get) => ({
  batches: [],
  workOrders: [],
  workCenters: [],
  resources: [],
  allocations: [],
  maintenanceLogs: [],
  boms: [],
  isLoading: false,

  fetchProductionData: async () => {
    set({ isLoading: true });
    try {
      const [batches, workOrders, allocations, maintenanceLogs, boms, workCenters, resources] = await Promise.all([
        dbService.getAll<ProductionBatch>('batches'),
        dbService.getAll<WorkOrder>('workOrders'),
        dbService.getAll<ResourceAllocation>('resourceAllocations'),
        dbService.getAll<MaintenanceLog>('maintenanceLogs'),
        dbService.getAll<BillOfMaterial>('boms'),
        dbService.getAll<WorkCenter>('workCenters'),
        dbService.getAll<ProductionResource>('resources')
      ]);

      // In non-production environments, seed mock data ONLY if still empty
      if ((!workCenters || workCenters.length === 0) && !isProd && !isSupabaseConfigured()) {
        for (const wc of MOCK_WORK_CENTERS) {
          await dbService.put('workCenters', wc);
        }
        for (const r of MOCK_RESOURCES) {
          await dbService.put('resources', r);
        }
        set({
          batches: batches || [],
          workOrders: workOrders || [],
          workCenters: MOCK_WORK_CENTERS,
          resources: MOCK_RESOURCES,
          allocations: allocations || [],
          maintenanceLogs: maintenanceLogs || [],
          boms: boms || [],
        });
      } else {
        set({ batches: batches || [], workOrders: workOrders || [], workCenters: workCenters || [], resources: resources || [], allocations: allocations || [], maintenanceLogs: maintenanceLogs || [], boms: boms || [] });
      }
    } catch (error) {
      logger.error("Failed to load production data", error);
    } finally {
      set({ isLoading: false });
    }
  },

  addBatch: async (batch) => {
    set(state => ({ batches: [...state.batches, batch] }));
    await api.production.saveBatch(batch);
  },

  addWorkOrder: async (wo) => {
    const newWO = { ...wo, id: wo.id || generateNextId('WO', get().workOrders) };
    set(state => ({ workOrders: [...state.workOrders, newWO] }));
    await api.production.saveWorkOrder(newWO);
  },
  updateWorkOrder: async (wo) => {
    set(state => ({ workOrders: state.workOrders.map(w => w.id === wo.id ? wo : w) }));
    await api.production.saveWorkOrder(wo);
  },
  deleteWorkOrder: async (id) => {
    set(state => ({ workOrders: state.workOrders.filter(w => w.id !== id) }));
    await api.production.deleteWorkOrder(id);
  },

  addAllocation: async (allocation) => {
    set(state => ({ allocations: [...state.allocations, allocation] }));
    await api.production.saveAllocation(allocation);
  },
  updateAllocation: async (allocation) => {
    set(state => ({ allocations: state.allocations.map(a => a.id === allocation.id ? allocation : a) }));
    await api.production.saveAllocation(allocation);
  },
  deleteAllocation: async (id) => {
    set(state => ({ allocations: state.allocations.filter(a => a.id !== id) }));
    await api.production.deleteAllocation(id);
  },

  addMaintenanceLog: async (log) => {
    const newLog = { ...log, id: log.id || generateNextId('MNT', get().maintenanceLogs) };
    set(state => ({ maintenanceLogs: [newLog, ...state.maintenanceLogs] }));
    await api.production.saveMaintenanceLog(newLog);
  },
  deleteMaintenanceLog: async (id) => {
    set(state => ({ maintenanceLogs: state.maintenanceLogs.filter(l => l.id !== id) }));
    await api.production.deleteMaintenanceLog(id);
  },

  addBOM: async (bom) => {
    set(state => ({ boms: [...state.boms, bom] }));
    await api.production.saveBOM(bom);
  },
  updateBOM: async (bom) => {
    set(state => ({ boms: state.boms.map(b => b.id === bom.id ? bom : b) }));
    await api.production.saveBOM(bom);
  },
  deleteBOM: async (id) => {
    set(state => ({ boms: state.boms.filter(b => b.id !== id) }));
    await api.production.deleteBOM(id);
  }
}));
