// Shared types for the Live Multi-Device Acceptance Framework.

export type CheckStatus = 'pass' | 'fail' | 'warning';

export interface CheckResult {
  scenarioKey: string;
  name: string;
  expected: string;
  actual: string;
  status: CheckStatus;
  durationMs?: number;
  meta?: Record<string, unknown>;
}

export interface ScenarioMeta {
  key: string;
  title: string;
  description: string;
  requiresObserver: boolean;
}

export interface AcceptanceRun {
  runId: string;
  state: 'created' | 'awaiting_device_b' | 'running' | 'complete' | 'closed';
  deviceA: { id: string; label: string };
  deviceB: { id: string; label: string } | null;
  scenarioIndex: number;
  scenarioKey: string | null;
  step: string | null;
  plan: ScenarioMeta[];
  data: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface TelemetryPoint {
  deviceId: string;
  scenarioKey: string;
  durationMs: number;
  queueDepth: number;
  retries: number;
  conflicts: number;
  deadLetters: number;
  gatewayMs?: number;
  idbWriteMs?: number;
  cloudWriteMs?: number;
  realtimeMs?: number;
  note?: string;
}

export type Verdict = 'GO' | 'GO_WITH_OBSERVATIONS' | 'NO_GO';

export interface EnvironmentMeta {
  gitSha: string | null;
  backendVersion: string | null;
  nodeVersion: string | null;
  supabaseProject: string | null;
  supabaseConfigured: boolean;
  backendUrl: string;
  deviceCount: number;
}

export const SCENARIO_PLAN: ScenarioMeta[] = [
  { key: 'offline_create', title: 'Offline Create', description: 'Create a customer while offline, then sync and verify cloud + device B.', requiresObserver: true },
  { key: 'offline_update', title: 'Offline Update', description: 'Update the same customer offline; verify version increment and conflict-free propagation.', requiresObserver: true },
  { key: 'offline_delete', title: 'Offline Delete', description: 'Delete the customer; verify tombstone, realtime removal and no resurrection.', requiresObserver: true },
  { key: 'file_upload', title: 'Offline File Upload', description: 'Attach a file offline; on reconnect upload to storage and download on device B.', requiresObserver: true },
  { key: 'conflict', title: 'Conflict Resolution', description: 'Device A edits offline while B edits online; verify detection, merge and queue empty.', requiresObserver: true },
  { key: 'restart', title: 'Browser Restart', description: 'Queue while paused, simulate restart, verify pending ops resume.', requiresObserver: false },
  { key: 'realtime', title: 'Realtime Propagation', description: 'Create an invoice online; device B receives it without a refresh.', requiresObserver: true },
  { key: 'multi_tab', title: 'Multi-Tab Idempotency', description: 'Rapid concurrent writes + duplicate enqueues; verify exactly-once cloud rows.', requiresObserver: false },
];

export const PRODUCTION_ACCEPTANCE_CRITERIA: { key: string; label: string }[] = [
  { key: 'offline_create', label: 'Offline create synchronizes' },
  { key: 'offline_update', label: 'Offline update propagates with version' },
  { key: 'offline_delete', label: 'Offline delete tombstones without resurrection' },
  { key: 'file_upload', label: 'File upload synchronizes to storage' },
  { key: 'realtime', label: 'Realtime propagation without refresh' },
  { key: 'version_stamping', label: 'Version stamping on every write' },
  { key: 'conflict', label: 'Conflict detection and merge' },
  { key: 'restart', label: 'Queue recovery after restart' },
  { key: 'multi_tab', label: 'Multi-device synchronization' },
  { key: 'sync_health', label: 'Sync Health accuracy' },
  { key: 'storage', label: 'Storage synchronization' },
  { key: 'cleanup', label: 'Cleanup verification' },
];

export const ACCEPTANCE_TAG = 'acceptanceRunId';
export const ACCEPTANCE_COMPANY = 'Prime Acceptance Ltd';
export const ACCEPTANCE_FY = 'TEST-FY';
