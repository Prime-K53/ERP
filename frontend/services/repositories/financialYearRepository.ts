import { BaseRepository, SyncMetadata } from './baseRepository';
import { dbService } from '../db';
import { logger } from '../logger';

export interface FinancialYearRecord {
  id: string;
  name: string;
  code: string;
  start_date: string;
  end_date: string;
  is_default: number | boolean;
  is_active: number | boolean;
  is_closed: number | boolean;
  status: string;
  created_by?: string;
  created_at?: string;
  updated_at?: string;
  [key: string]: any;
}

const toNumber = (v: number | boolean | undefined): number => Number(Boolean(v));

export type FinancialYearListItem = FinancialYearRecord & SyncMetadata & {
  is_default: number;
  is_active: number;
  is_closed: number;
};

export class FinancialYearRepository extends BaseRepository<FinancialYearRecord> {
  constructor() {
    super('financialYears', 'financial_years');
  }

  async list(): Promise<FinancialYearListItem[]> {
    const all = await this.getAll();
    return all
      .map((r) => ({
        ...r,
        is_default: toNumber(r.is_default),
        is_active: toNumber(r.is_active),
        is_closed: toNumber(r.is_closed),
        status: r.status || (r.is_closed ? 'Closed' : 'Active'),
      }))
      .sort((a, b) => {
        const aStart = a.start_date || '';
        const bStart = b.start_date || '';
        if (aStart === bStart) return (a.name || '').localeCompare(b.name || '');
        return aStart.localeCompare(bStart);
      });
  }

  async create(data: Partial<FinancialYearRecord>): Promise<FinancialYearRecord & SyncMetadata> {
    const startYear = (data.start_date || '').slice(0, 4);
    const payload: Partial<FinancialYearRecord> = {
      ...data,
      name: data.name || startYear,
      code: data.code || (startYear ? `FY${startYear}` : `FY-${Date.now()}`),
      is_default: toNumber(data.is_default as number | boolean),
      is_active: toNumber(data.is_active as number | boolean),
      is_closed: toNumber(data.is_closed as number | boolean),
      status: data.status || (data.is_closed ? 'Closed' : 'Active'),
    };
    return super.create(payload);
  }

  async setActive(id: string): Promise<void> {
    const all = await this.getAll();
    for (const record of all) {
      const shouldActivate = record.id === id;
      const nextActive = toNumber(shouldActivate);
      if (toNumber(record.is_active) !== nextActive) {
        await this.update(record.id, {
          is_active: nextActive,
          status: shouldActivate ? 'Active' : record.status,
        });
      }
    }
    if (!all.some((r) => r.id === id)) {
      logger.warn(`[FinancialYearRepository] setActive: record not found: ${id}`);
    }
  }

  async close(id: string): Promise<void> {
    const existing = await this.getById(id);
    if (!existing) throw new Error(`[FinancialYearRepository] Record not found: ${id}`);
    await this.update(id, {
      is_closed: 1,
      status: 'Closed',
    });
  }

  async remove(id: string): Promise<void> {
    await this.softDelete(id);
  }

  async migrateLegacyLocalYears(): Promise<number> {
    try {
      const all = (await dbService.getAll<any>('financialYears')) || [];
      let migrated = 0;
      for (const record of all) {
        if (!record || record.deletedAt) continue;
        if (record.syncStatus === 'synced' && record.lastSyncedAt) continue;
        try {
          await super.create(record);
          migrated++;
        } catch (err) {
          logger.warn(`[FinancialYearRepository] migrate record ${record.id} failed:`, err);
        }
      }
      this.cleanupLegacyLocalStorageKeys();
      if (migrated > 0) {
        logger.info(`[FinancialYearRepository] migrated ${migrated} legacy financial year(s)`);
      }
      return migrated;
    } catch (err) {
      logger.error('[FinancialYearRepository] migrateLegacyLocalYears error:', err);
      return 0;
    }
  }

  private cleanupLegacyLocalStorageKeys(): void {
    try {
      const keysToRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && /(selectedFinancialYearId|selectedFinancialYearName|selectedFinancialYearStart|selectedFinancialYearEnd|selectedFinancialYearClosed)$/.test(key)) {
          keysToRemove.push(key);
        }
      }
      for (const key of keysToRemove) {
        localStorage.removeItem(key);
      }
    } catch {
      // best-effort cleanup
    }
  }
}

export const financialYearRepository = new FinancialYearRepository();
