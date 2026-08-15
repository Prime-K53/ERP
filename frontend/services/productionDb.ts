import { dbService } from './db';

type TableAccessor = {
  toArray: <T>() => Promise<T[]>;
  get: <T>(id: string) => Promise<T | undefined>;
  put: <T>(value: T) => Promise<void>;
  delete: (id: string) => Promise<void>;
};

const createTable = (storeName: string): TableAccessor => ({
  toArray: async <T>() => {
    return dbService.getAll<T>(storeName as any);
  },
  get: async <T>(id: string) => {
    return dbService.get<T>(storeName as any, id);
  },
  put: async <T>(value: T) => {
    await dbService.put(storeName as any, value);
  },
  delete: async (id: string) => {
    await dbService.delete(storeName as any, id);
  },
});

export const productionDb = {
  batches: createTable('batches'),
  workOrders: createTable('workOrders'),
  workCenters: createTable('workCenters'),
  resources: createTable('resources'),
  resourceAllocations: createTable('resourceAllocations'),
  maintenanceLogs: createTable('maintenanceLogs'),
  boms: createTable('boms'),
  bomTemplates: createTable('bomTemplates'),
  jobTickets: createTable('jobTickets'),
  jobTicketSettings: createTable('jobTicketSettings'),
  serviceRecipes: createTable('serviceRecipes'),
  serviceJobs: createTable('serviceJobs'),
  serviceResources: createTable('serviceResources'),
  serviceConsumptions: createTable('serviceConsumptions'),
};

export const getProductionDb = () => productionDb;
