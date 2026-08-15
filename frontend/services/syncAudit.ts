export interface AuditEntry {
  ts: string;
  source: string;
  data: Record<string, unknown>;
}

const FLAG_KEY = 'prime_erp_sync_audit';
const SNAPSHOT_KEY = 'prime_erp_sync_audit_snapshot';
const MAX_ENTRIES = 500;

let enabled = false;

export function isAuditEnabled(): boolean {
  return enabled;
}

export function enableAudit(): void {
  enabled = true;
  localStorage.setItem(FLAG_KEY, '1');
}

export function disableAudit(): void {
  enabled = false;
  localStorage.removeItem(FLAG_KEY);
}

export function initAudit(): void {
  try {
    enabled = localStorage.getItem(FLAG_KEY) === '1';
  } catch {
    enabled = false;
  }
  if (enabled) {
    installGlobalAccessor();
  }
}

let buffer: AuditEntry[] = [];

function getSnapshot(): { enabled: boolean; entryCount: number; entries: AuditEntry[] } {
  return {
    enabled,
    entryCount: buffer.length,
    entries: buffer,
  };
}

function installGlobalAccessor(): void {
  if (typeof window === 'undefined') return;
  try {
    (window as any).__primeErpSyncAudit = getSnapshot;
    (window as any).__primeErpSyncAuditEnable = enableAudit;
    (window as any).__primeErpSyncAuditDisable = disableAudit;
  } catch {
    /* ignore */
  }
}

export function audit(level: 'boot' | 'auth' | 'sync' | 'pull' | 'push' | 'write', msg: string, data: Record<string, unknown> = {}): void {
  if (!enabled) return;
  const entry: AuditEntry = { ts: new Date().toISOString(), level, data: { msg, ...data } };
  buffer.push(entry);
  if (buffer.length > MAX_ENTRIES) {
    buffer = buffer.slice(-MAX_ENTRIES);
  }
  try {
    localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(buffer.slice(-200)));
  } catch {
    /* ignore */
  }
  const prefix = `[primerp-audit:${level}]`;
  const kv = Object.entries(entry.data).map(([k, v]) => `${k}=${formatValue(v)}`).join(' ');
  // eslint-disable-next-line no-console
  console.log(`${prefix} ${msg} ${kv}`);
}

function formatValue(v: unknown): string {
  if (v === null || v === undefined) return String(v);
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}