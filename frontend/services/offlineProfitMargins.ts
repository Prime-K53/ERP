import { dbService } from './db';

export interface OfflineMarginSetting {
  id: string;
  scope: 'global' | 'category' | 'line_item';
  scope_ref_id: string | null;
  margin_type: 'percentage' | 'fixed_amount';
  margin_value: number;
  is_active: boolean | number;
  reason: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  apply_volume_margins?: boolean | number;
}

export interface OfflineMarginAuditEntry {
  id: string;
  setting_id: string;
  action: string;
  scope: string;
  old_value: string | null;
  new_value: string | null;
  reason: string | null;
  performed_by: string | null;
  timestamp: string;
}

export const OFFLINE_MARGIN_STORE_KEY = 'nexus_profit_margin_settings';
export const OFFLINE_MARGIN_AUDIT_KEY = 'nexus_profit_margin_audit';

const nowIso = () => new Date().toISOString();
const nextId = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const readJsonArray = <T>(key: string): T[] => {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const writeJsonArray = async <T>(key: string, rows: T[]) => {
  await dbService.saveSetting(key, rows);
};

const normalizeScope = (value: unknown): OfflineMarginSetting['scope'] => {
  const scope = String(value || '').trim().toLowerCase();
  if (scope === 'category') return 'category';
  if (scope === 'line_item') return 'line_item';
  return 'global';
};

const normalizeMarginType = (value: unknown): OfflineMarginSetting['margin_type'] => (
  String(value || '').trim().toLowerCase() === 'fixed_amount' ? 'fixed_amount' : 'percentage'
);

const normalizeBooleanFlag = (value: unknown, fallback = true): boolean => {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
    if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  }
  return fallback;
};

const normalizeMarginValue = (value: unknown): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const getCurrentUserId = (): string => {
  try {
    const sessionUser = sessionStorage.getItem('nexus_user');
    if (sessionUser) {
      const parsed = JSON.parse(sessionUser);
      if (parsed?.id) return String(parsed.id);
      if (parsed?.username) return String(parsed.username);
    }
  } catch {
    // Ignore parse errors and fall back below.
  }

  return String(
    localStorage.getItem('prime_user_id')
    || localStorage.getItem('prime_user_role')
    || 'system'
  );
};

const scopeWeight = (scope: OfflineMarginSetting['scope']) => {
  if (scope === 'global') return 0;
  if (scope === 'category') return 1;
  return 2;
};

const normalizeSetting = (
  input: Partial<OfflineMarginSetting>,
  existing?: OfflineMarginSetting
): OfflineMarginSetting => {
  const timestamp = nowIso();
  return {
    id: String(existing?.id || input.id || nextId('local-margin')),
    scope: normalizeScope(input.scope ?? existing?.scope),
    scope_ref_id: input.scope_ref_id !== undefined
      ? (input.scope_ref_id ? String(input.scope_ref_id) : null)
      : (existing?.scope_ref_id ?? null),
    margin_type: normalizeMarginType(input.margin_type ?? existing?.margin_type),
    margin_value: normalizeMarginValue(input.margin_value ?? existing?.margin_value),
    is_active: normalizeBooleanFlag(input.is_active ?? existing?.is_active, true),
    reason: input.reason !== undefined ? (input.reason ? String(input.reason) : null) : (existing?.reason ?? null),
    created_by: String(existing?.created_by || input.created_by || getCurrentUserId()),
    created_at: String(existing?.created_at || input.created_at || timestamp),
    updated_at: String(input.updated_at || existing?.updated_at || timestamp),
    deleted_at: input.deleted_at !== undefined ? (input.deleted_at ? String(input.deleted_at) : null) : (existing?.deleted_at ?? null),
    apply_volume_margins: normalizeBooleanFlag(
      input.apply_volume_margins ?? existing?.apply_volume_margins,
      false
    )
  };
};

const serializeSetting = (setting: OfflineMarginSetting) => JSON.stringify({
  scope: setting.scope,
  scope_ref_id: setting.scope_ref_id,
  margin_type: setting.margin_type,
  margin_value: setting.margin_value,
  is_active: normalizeBooleanFlag(setting.is_active, true),
  apply_volume_margins: normalizeBooleanFlag(setting.apply_volume_margins, false)
});

const appendAuditEntry = async (
  setting: OfflineMarginSetting,
  action: 'CREATE' | 'UPDATE' | 'DELETE',
  oldValue: string | null,
  newValue: string | null,
  reason?: string | null
) => {
  const existing = readJsonArray<OfflineMarginAuditEntry>(OFFLINE_MARGIN_AUDIT_KEY);
  existing.unshift({
    id: nextId('local-margin-audit'),
    setting_id: setting.id,
    action,
    scope: setting.scope,
    old_value: oldValue,
    new_value: newValue,
    reason: reason ?? setting.reason ?? null,
    performed_by: getCurrentUserId(),
    timestamp: nowIso()
  });
  await writeJsonArray(OFFLINE_MARGIN_AUDIT_KEY, existing);
};

export const listOfflineMarginSettings = (): OfflineMarginSetting[] => {
  return readJsonArray<OfflineMarginSetting>(OFFLINE_MARGIN_STORE_KEY)
    .map((setting) => normalizeSetting(setting, setting))
    .sort((left, right) => {
      const scopeDelta = scopeWeight(left.scope) - scopeWeight(right.scope);
      if (scopeDelta !== 0) return scopeDelta;
      return new Date(right.updated_at).getTime() - new Date(left.updated_at).getTime();
    });
};

/** Async version that falls back to IndexedDB when localStorage is empty (for cross-device cloud sync). */
export const listOfflineMarginSettingsAsync = async (): Promise<OfflineMarginSetting[]> => {
  const local = listOfflineMarginSettings();
  if (local.length > 0) return local;
  try {
    const idbSettings = await dbService.getAll('profitMarginSettings') as OfflineMarginSetting[];
    if (idbSettings.length > 0) {
      await writeJsonArray(OFFLINE_MARGIN_STORE_KEY, idbSettings);
      return idbSettings
        .map((setting) => normalizeSetting(setting, setting))
        .sort((left, right) => {
          const scopeDelta = scopeWeight(left.scope) - scopeWeight(right.scope);
          if (scopeDelta !== 0) return scopeDelta;
          return new Date(right.updated_at).getTime() - new Date(left.updated_at).getTime();
        });
    }
  } catch { /* best-effort */ }
  return [];
};

export const listOfflineMarginAuditLogs = (filters?: {
  scope?: string;
  user?: string;
  startDate?: string;
  endDate?: string;
}): OfflineMarginAuditEntry[] => {
  const rows = readJsonArray<OfflineMarginAuditEntry>(OFFLINE_MARGIN_AUDIT_KEY);
  const scope = String(filters?.scope || '').trim().toLowerCase();
  const user = String(filters?.user || '').trim().toLowerCase();
  const startDate = String(filters?.startDate || '').trim();
  const endDate = String(filters?.endDate || '').trim();

  return rows.filter((row) => {
    if (scope && String(row.scope || '').trim().toLowerCase() !== scope) return false;
    if (user && !String(row.performed_by || '').trim().toLowerCase().includes(user)) return false;

    if (startDate) {
      const timestamp = new Date(row.timestamp).getTime();
      const start = new Date(`${startDate}T00:00:00`).getTime();
      if (timestamp < start) return false;
    }

    if (endDate) {
      const timestamp = new Date(row.timestamp).getTime();
      const end = new Date(`${endDate}T23:59:59.999`).getTime();
      if (timestamp > end) return false;
    }

    return true;
  });
};

const persistMarginSettings = async (settings: OfflineMarginSetting[]) => {
  await writeJsonArray(OFFLINE_MARGIN_STORE_KEY, settings);
  // Also write to IndexedDB for cross-device sync
  try {
    for (const setting of settings) {
      await dbService.put('profitMarginSettings', setting);
    }
  } catch { /* best-effort */ }
  return settings;
};

export const createOfflineMarginSetting = async (input: Partial<OfflineMarginSetting>) => {
  const settings = listOfflineMarginSettings();
  const created = normalizeSetting({ ...input, updated_at: nowIso() });
  const nextSettings = [created, ...settings.filter((setting) => setting.id !== created.id)];
  await persistMarginSettings(nextSettings);
  await appendAuditEntry(created, 'CREATE', null, serializeSetting(created), input.reason ?? null);
  return created;
};

export const updateOfflineMarginSetting = async (id: string, updates: Partial<OfflineMarginSetting>) => {
  const settings = listOfflineMarginSettings();
  const index = settings.findIndex((setting) => String(setting.id) === String(id));
  if (index < 0) {
    throw new Error('Margin setting not found');
  }

  const existing = settings[index];
  const updated = normalizeSetting({ ...updates, updated_at: nowIso() }, existing);
  settings[index] = updated;
  await persistMarginSettings(settings);
  await appendAuditEntry(updated, 'UPDATE', serializeSetting(existing), serializeSetting(updated), updates.reason ?? updated.reason);
  return updated;
};

export const deleteOfflineMarginSetting = async (id: string, reason?: string | null) => {
  const settings = listOfflineMarginSettings();
  const index = settings.findIndex((setting) => String(setting.id) === String(id));
  if (index < 0) {
    throw new Error('Margin setting not found');
  }

  const existing = settings[index];
  const deleted = normalizeSetting({
    ...existing,
    is_active: false,
    updated_at: nowIso(),
    deleted_at: nowIso(),
    reason: reason ?? existing.reason
  }, existing);

  settings[index] = deleted;
  await persistMarginSettings(settings);
  await appendAuditEntry(deleted, 'DELETE', serializeSetting(existing), null, reason ?? existing.reason);
  return { success: true };
};

export const bulkUploadOfflineMarginSettings = async (rows: Array<Record<string, unknown>>) => {
  let success = 0;
  let failed = 0;
  const errors: Array<{ row: number; error: string }> = [];

  for (const [index, row] of rows.entries()) {
    try {
      const scopeRefId = String(row.sku || row.scope_ref_id || row.scopeRefId || '').trim();
      if (!scopeRefId) {
        throw new Error('SKU / scope_ref_id is required');
      }

      const marginType = normalizeMarginType(row.margin_type || row.marginType);
      const marginValue = normalizeMarginValue(row.margin_value || row.marginValue);
      const reason = row.reason ? String(row.reason) : 'Bulk upload';

      const existing = listOfflineMarginSettings().find((setting) => (
        setting.scope === 'line_item'
        && String(setting.scope_ref_id || '').trim().toLowerCase() === scopeRefId.toLowerCase()
        && !setting.deleted_at
      ));

      if (existing) {
        await updateOfflineMarginSetting(existing.id, {
          margin_type: marginType,
          margin_value: marginValue,
          is_active: true,
          deleted_at: null,
          reason
        });
      } else {
        await createOfflineMarginSetting({
          scope: 'line_item',
          scope_ref_id: scopeRefId,
          margin_type: marginType,
          margin_value: marginValue,
          is_active: true,
          reason
        });
      }

      success += 1;
    } catch (error) {
      failed += 1;
      errors.push({
        row: index + 2,
        error: error instanceof Error ? error.message : 'Invalid CSV row'
      });
    }
  }

  return { success, failed, errors };
};

export const resolveOfflineEffectiveMargin = (
  lineItemId?: string | null,
  categoryId?: string | null
) => {
  const activeSettings = listOfflineMarginSettings().filter((setting) => (
    !setting.deleted_at && normalizeBooleanFlag(setting.is_active, true)
  ));

  const normalizedLineItem = String(lineItemId || '').trim().toLowerCase();
  const normalizedCategory = String(categoryId || '').trim().toLowerCase();

  const lineItemMatch = normalizedLineItem
    ? activeSettings.find((setting) => (
      setting.scope === 'line_item'
      && String(setting.scope_ref_id || '').trim().toLowerCase() === normalizedLineItem
    ))
    : undefined;

  if (lineItemMatch) {
    return {
      margin_value: lineItemMatch.margin_value,
      margin_type: lineItemMatch.margin_type,
      source: 'line_item' as const,
      apply_volume_margins: normalizeBooleanFlag(lineItemMatch.apply_volume_margins, false)
    };
  }

  const categoryMatch = normalizedCategory
    ? activeSettings.find((setting) => (
      setting.scope === 'category'
      && String(setting.scope_ref_id || '').trim().toLowerCase() === normalizedCategory
    ))
    : undefined;

  if (categoryMatch) {
    return {
      margin_value: categoryMatch.margin_value,
      margin_type: categoryMatch.margin_type,
      source: 'category' as const,
      apply_volume_margins: normalizeBooleanFlag(categoryMatch.apply_volume_margins, false)
    };
  }

  const globalMatch = activeSettings.find((setting) => setting.scope === 'global');
  if (globalMatch) {
    return {
      margin_value: globalMatch.margin_value,
      margin_type: globalMatch.margin_type,
      source: 'global' as const,
      apply_volume_margins: normalizeBooleanFlag(globalMatch.apply_volume_margins, false)
    };
  }

  return {
    margin_value: 0,
    margin_type: 'percentage' as const,
    source: 'system' as const,
    apply_volume_margins: false
  };
};

/**
 * Copy any localStorage profit margin data into IndexedDB so it can be
 * synced to Supabase. Safe to call on startup (only migrates entries that
 * aren't already in IndexedDB).
 */
export async function migrateLocalMarginsToIndexedDB(): Promise<void> {
  try {
    const localSettings = readJsonArray<OfflineMarginSetting>(OFFLINE_MARGIN_STORE_KEY);
    if (localSettings.length === 0) return;
    for (const setting of localSettings) {
      const existing = await dbService.get('profitMarginSettings', setting.id).catch(() => null);
      if (!existing) {
        await dbService.put('profitMarginSettings', setting);
      }
    }
  } catch { /* best-effort */ }
}

/**
 * Called on startup to restore localStorage margin data from IndexedDB
 * (populated by cloud sync). This ensures the synchronous read paths
 * (resolveOfflineEffectiveMargin, listOfflineMarginSettings) work on
 * devices that received data via sync.
 */
export async function restoreLocalMarginsFromSync(): Promise<void> {
  try {
    const cloud = await dbService.getAll('profitMarginSettings').catch(() => []);
    if (cloud.length === 0) return;
    const existing = await dbService.getSetting<OfflineMarginSetting[]>(OFFLINE_MARGIN_STORE_KEY);
    if (existing && Array.isArray(existing) && existing.length >= cloud.length) return;
    await dbService.saveSetting(OFFLINE_MARGIN_STORE_KEY, cloud);
  } catch { /* best-effort */ }
}
