import { dbService } from './db';

type TableAccessor = {
  toArray: <T>() => Promise<T[]>;
  get: <T>(id: string) => Promise<T | undefined>;
  put: <T>(value: T) => Promise<void>;
  delete: (id: string) => Promise<void>;
  bulkPut: <T>(items: T[]) => Promise<void>;
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
  bulkPut: async <T>(items: T[]) => {
    if (items.length === 0) return;
    await dbService.bulkPut(storeName as any, items as any[]);
  },
});

export const examinationDb = {
  examinationBatches: createTable('examinationBatches'),
  examinationBatchNotifications: createTable('examinationBatchNotifications'),
  examinationJobs: createTable('examinationJobs'),
  examinationJobSubjects: createTable('examinationJobSubjects'),
  examinationInvoiceGroups: createTable('examinationInvoiceGroups'),
  examinationRecurringProfiles: createTable('examinationRecurringProfiles'),
  examinationInventoryDeductions: createTable('examinationInventoryDeductions'),
  notificationAuditLogs: createTable('notificationAuditLogs'),
};

export const getExaminationDb = () => null;