import { dbService } from '../db';
import { durableSyncQueue, QueueOperation } from '../durableSyncQueue';
import { logger } from '../logger';

export type SyncStatus = 'pending' | 'syncing' | 'synced' | 'failed' | 'conflict';

export interface SyncMetadata {
  id: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  syncStatus: SyncStatus;
  lastSyncedAt: string | null;
  deviceId: string;
  version: number;
}

const getDeviceId = (): string => {
  try {
    let deviceId = localStorage.getItem('primeerp_device_id');
    if (!deviceId) {
      deviceId = crypto.randomUUID?.() ?? `device-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      localStorage.setItem('primeerp_device_id', deviceId);
    }
    return deviceId;
  } catch {
    return `device-${Date.now()}`;
  }
};

const nowISO = () => new Date().toISOString();

export class BaseRepository<T extends Record<string, any>> {
  protected storeName: string;
  protected syncTable: string;

  constructor(storeName: string, syncTable?: string) {
    this.storeName = storeName;
    this.syncTable = syncTable || storeName;
  }

  protected attachSyncMeta(record: Partial<T>): T & SyncMetadata {
    const now = nowISO();
    const existing = (record as any);
    return {
      ...record,
      id: (existing.id || crypto.randomUUID?.()) ?? `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      createdAt: existing.createdAt || now,
      updatedAt: now,
      deletedAt: existing.deletedAt || null,
      syncStatus: 'pending' as SyncStatus,
      lastSyncedAt: existing.lastSyncedAt || null,
      deviceId: getDeviceId(),
      version: (existing.version || 0) + 1,
    } as T & SyncMetadata;
  }

  async getAll(): Promise<(T & SyncMetadata)[]> {
    try {
      const records = await dbService.getAll<any>(this.storeName);
      return (records || []).filter((r: any) => !r.deletedAt);
    } catch (err) {
      logger.error(`[${this.storeName}] getAll error:`, err);
      return [];
    }
  }

  async getById(id: string): Promise<(T & SyncMetadata) | null> {
    try {
      const record = await dbService.get<any>(this.storeName, id);
      if (!record || record.deletedAt) return null;
      return record;
    } catch (err) {
      logger.error(`[${this.storeName}] getById error:`, err);
      return null;
    }
  }

  async create(data: Partial<T>): Promise<T & SyncMetadata> {
    const record = this.attachSyncMeta(data);
    record.syncStatus = 'pending';
    try {
      await dbService.put(this.storeName, record);
      await this.enqueueSync(record, 'insert');
      return record;
    } catch (err) {
      logger.error(`[${this.storeName}] create error:`, err);
      throw err;
    }
  }

  async update(id: string, data: Partial<T>): Promise<T & SyncMetadata> {
    const existing = await dbService.get<any>(this.storeName, id);
    if (!existing) throw new Error(`[${this.storeName}] Record not found: ${id}`);
    const updated: T & SyncMetadata = {
      ...existing,
      ...data,
      id,
      updatedAt: nowISO(),
      syncStatus: 'pending',
      version: (existing.version || 0) + 1,
    };
    try {
      await dbService.put(this.storeName, updated);
      await this.enqueueSync(updated, 'update');
      return updated;
    } catch (err) {
      logger.error(`[${this.storeName}] update error:`, err);
      throw err;
    }
  }

  async softDelete(id: string): Promise<void> {
    const existing = await dbService.get<any>(this.storeName, id);
    if (!existing) return;
    const deleted: T & SyncMetadata = {
      ...existing,
      deletedAt: nowISO(),
      syncStatus: 'pending',
      updatedAt: nowISO(),
      version: (existing.version || 0) + 1,
    };
    try {
      await dbService.put(this.storeName, deleted);
      await this.enqueueSync(deleted, 'delete');
    } catch (err) {
      logger.error(`[${this.storeName}] softDelete error:`, err);
      throw err;
    }
  }

  async markSynced(id: string, serverTimestamp?: string): Promise<void> {
    try {
      const record = await dbService.get<any>(this.storeName, id);
      if (record) {
        record.syncStatus = 'synced';
        record.lastSyncedAt = serverTimestamp || nowISO();
        await dbService.put(this.storeName, record);
      }
    } catch (err) {
      logger.error(`[${this.storeName}] markSynced error:`, err);
    }
  }

  async markFailed(id: string): Promise<void> {
    try {
      const record = await dbService.get<any>(this.storeName, id);
      if (record) {
        record.syncStatus = 'failed';
        await dbService.put(this.storeName, record);
      }
    } catch (err) {
      logger.error(`[${this.storeName}] markFailed error:`, err);
    }
  }

  async putBulk(records: (T & SyncMetadata)[]): Promise<void> {
    for (const record of records) {
      await dbService.put(this.storeName, record);
    }
  }

  async count(): Promise<number> {
    const all = await this.getAll();
    return all.length;
  }

  private async enqueueSync(record: any, operation: QueueOperation): Promise<void> {
    try {
      await durableSyncQueue.enqueue({
        table: this.syncTable,
        recordId: record.id,
        operation,
        payload: record,
      });
    } catch (err) {
      logger.warn(`[${this.storeName}] Failed to enqueue sync:`, err);
    }
  }
}