import { dbService } from './db';
import { examinationDb } from './examinationDb';

const MIGRATION_KEY = 'examination_dexie_migration_v1';
const MIGRATION_BATCH_SIZE = 100;

interface MigrationSummary {
  examinationBatches: number;
  examinationBatchNotifications: number;
  examinationJobs: number;
  examinationJobSubjects: number;
  examinationInvoiceGroups: number;
  examinationRecurringProfiles: number;
  examinationInventoryDeductions: number;
  notificationAuditLogs: number;
}

const hasMigrationRun = async (): Promise<boolean> => {
  try {
    const value = await dbService.getSetting<string>(MIGRATION_KEY);
    return value === 'completed';
  } catch {
    return false;
  }
};

const markMigrationComplete = async () => {
  try {
    await dbService.saveSetting(MIGRATION_KEY, 'completed');
  } catch {
  }
};

const migrateStore = async <T extends { id: string }>(
  storeName: keyof typeof dbService.getAll extends (store: infer S) => any ? S : never,
  dexieTable: any,
  batchSize: number = MIGRATION_BATCH_SIZE
): Promise<number> => {
  try {
    const allItems = await (dbService as { getAll: (store: string) => Promise<unknown> }).getAll(storeName) as T[];
    if (!Array.isArray(allItems) || allItems.length === 0) return 0;

    const existingIds = new Set<string>();
    try {
      const existing = await dexieTable.toArray();
      existing.forEach((item: any) => existingIds.add(String(item.id)));
    } catch {
    }

    const toInsert = allItems.filter((item) => !existingIds.has(String(item.id)));
    if (toInsert.length === 0) return 0;

    for (let i = 0; i < toInsert.length; i += batchSize) {
      const batch = toInsert.slice(i, i + batchSize);
      await dexieTable.bulkPut(batch);
    }

    return toInsert.length;
  } catch (error) {
    console.warn(`[DataMigrator] Failed to migrate ${String(storeName)}:`, error);
    return 0;
  }
};

const migrateBatchesFromOfflineDb = async (): Promise<number> => {
  try {
    const { offlineDb } = await import('./offlineDb');
    const batches = await offlineDb.getAllBatches();
    if (!Array.isArray(batches) || batches.length === 0) return 0;

    const existingIds = new Set<string>();
    try {
      const existing = await examinationDb.examinationBatches.toArray();
      existing.forEach((b) => existingIds.add(String(b.id)));
    } catch {
    }

    const toInsert = batches.filter((b: any) => !existingIds.has(String(b.id)));
    if (toInsert.length === 0) return 0;

    await examinationDb.examinationBatches.bulkPut(toInsert);
    return toInsert.length;
  } catch (error) {
    console.warn('[DataMigrator] Failed to migrate batches from offlineDb:', error);
    return 0;
  }
};

export const migrateExaminationData = async (): Promise<MigrationSummary> => {
  if (await hasMigrationRun()) {
    return {
      examinationBatches: 0,
      examinationBatchNotifications: 0,
      examinationJobs: 0,
      examinationJobSubjects: 0,
      examinationInvoiceGroups: 0,
      examinationRecurringProfiles: 0,
      examinationInventoryDeductions: 0,
      notificationAuditLogs: 0,
    };
  }

  const summary: MigrationSummary = {
    examinationBatches: 0,
    examinationBatchNotifications: 0,
    examinationJobs: 0,
    examinationJobSubjects: 0,
    examinationInvoiceGroups: 0,
    examinationRecurringProfiles: 0,
    examinationInventoryDeductions: 0,
    notificationAuditLogs: 0,
  };

  summary.examinationBatches = await migrateBatchesFromOfflineDb();

  summary.examinationBatchNotifications = await migrateStore<any>(
    'examinationBatchNotifications',
    examinationDb.examinationBatchNotifications
  );
  summary.examinationJobs = await migrateStore<any>(
    'examinationJobs',
    examinationDb.examinationJobs
  );
  summary.examinationJobSubjects = await migrateStore<any>(
    'examinationJobSubjects',
    examinationDb.examinationJobSubjects
  );
  summary.examinationInvoiceGroups = await migrateStore<any>(
    'examinationInvoiceGroups',
    examinationDb.examinationInvoiceGroups
  );
  summary.examinationRecurringProfiles = await migrateStore<any>(
    'examinationRecurringProfiles',
    examinationDb.examinationRecurringProfiles
  );
  summary.examinationInventoryDeductions = await migrateStore<any>(
    'examinationInventoryDeductions',
    examinationDb.examinationInventoryDeductions
  );
  summary.notificationAuditLogs = await migrateStore<any>(
    'notificationAuditLogs',
    examinationDb.notificationAuditLogs
  );

  const totalMigrated = Object.values(summary).reduce((sum, count) => sum + count, 0);
  if (totalMigrated > 0) {
    await markMigrationComplete();
  }

  return summary;
};

export const isMigrationCompleted = hasMigrationRun;
