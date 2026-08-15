import { BaseRepository } from './baseRepository';
import { dbService } from '../db';
import { logger } from '../logger';

export interface SettingRecord {
  id: string;
  key: string;
  value: any;
  updatedAt?: string;
  [key: string]: any;
}

export class SettingsRepository extends BaseRepository<SettingRecord> {
  constructor() {
    super('settings', 'settings');
  }

  async getSetting<T>(key: string): Promise<T | undefined> {
    try {
      const record = await this.getById(key);
      if (record && record.value !== undefined) {
        return record.value as T;
      }
      // Fallback: check IndexedDB settings store directly if id doesn't match key property
      const raw = await dbService.get<any>('settings', key);
      if (raw && raw.value !== undefined) {
        return raw.value as T;
      }
      // Fallback: check localStorage
      const local = localStorage.getItem(key);
      if (local !== null) {
        try {
          return JSON.parse(local) as T;
        } catch {
          return local as unknown as T;
        }
      }
      return undefined;
    } catch (err) {
      logger.error(`[SettingsRepository] getSetting error for key ${key}:`, err);
      return undefined;
    }
  }

  async saveSetting<T>(key: string, value: T): Promise<void> {
    try {
      const existing = await this.getById(key);
      const payload: Partial<SettingRecord> = {
        id: key,
        key,
        value,
      };

      if (existing) {
        await this.update(key, payload);
      } else {
        await this.create(payload);
      }

      // Also update localStorage for instant synchronous reads when required
      try {
        const serialized = typeof value === 'string' ? value : JSON.stringify(value);
        localStorage.setItem(key, serialized);
      } catch {
        // Ignore localStorage quota errors
      }
    } catch (err) {
      logger.error(`[SettingsRepository] saveSetting error for key ${key}:`, err);
      throw err;
    }
  }
}

export const settingsRepository = new SettingsRepository();
