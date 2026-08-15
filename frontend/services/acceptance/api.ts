// Thin HTTP client for the backend acceptance endpoints. Mirrors the auth
// pattern used by syncApiClient (Supabase access token -> backend verify ->
// service-role actions).

import { API_BASE_URL } from '../../config/api.js';
import { getJsonRequestHeaders } from '../requestHeaders';
import { SCENARIO_PLAN } from './types';
import type { AcceptanceRun, CheckResult, TelemetryPoint } from './types';

const BASE = `${API_BASE_URL}/acceptance`;

function newRunId(): string {
  const d = new Date();
  const ymd = [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-');
  const hms = [String(d.getHours()).padStart(2, '0'), String(d.getMinutes()).padStart(2, '0'), String(d.getSeconds()).padStart(2, '0')].join('');
  return `ACC-${ymd}-${hms}${String(d.getMilliseconds()).padStart(3, '0')}`;
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = await getJsonRequestHeaders();
  const response = await fetch(`${BASE}${path}`, { ...init, headers });
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`${init.method || 'GET'} ${path} -> ${response.status}: ${body.slice(0, 300)}`);
  }
  const text = await response.text();
  if (!text) return undefined as unknown as T;
  const parsed: unknown = JSON.parse(text);
  if (parsed && typeof parsed === 'object') {
    const record = parsed as Record<string, unknown>;
    if ('run' in record) return record.run as T;
    if ('runs' in record) return record.runs as T;
  }
  return parsed as T;
}

const json = (body: unknown) => ({ 'Content-Type': 'application/json', body: JSON.stringify(body) });

export const acceptanceApi = {
  createRun(): Promise<AcceptanceRun> {
    const runId = newRunId();
    return request('/runs', { method: 'POST', ...json({ runId, label: navigator.userAgent, plan: SCENARIO_PLAN }) });
  },
  listRuns(): Promise<AcceptanceRun[]> {
    return request('/runs');
  },
  getRun(runId: string): Promise<AcceptanceRun> {
    return request(`/runs/${runId}`);
  },
  getActiveRun(): Promise<AcceptanceRun | null> {
    return request('/runs/active');
  },
  joinRun(runId: string, label: string): Promise<AcceptanceRun> {
    return request(`/runs/${runId}/join`, { method: 'POST', ...json({ label }) });
  },
  startRun(runId: string): Promise<AcceptanceRun> {
    return request(`/runs/${runId}/start`, { method: 'POST', ...json({}) });
  },
  advance(runId: string, scenarioKey: string, index: number, step: string): Promise<AcceptanceRun> {
    return request(`/runs/${runId}/advance`, { method: 'POST', ...json({ scenarioIndex: index, scenarioKey, step }) });
  },
  patch(runId: string, data: Record<string, unknown>): Promise<AcceptanceRun> {
    return request(`/runs/${runId}/patch`, { method: 'POST', ...json({ patch: data }) });
  },
  postObservation(runId: string, scenarioKey: string, check: CheckResult, deviceId: string): Promise<AcceptanceRun> {
    return request(`/runs/${runId}/observation`, { method: 'POST', ...json({ deviceId, scenarioKey, check }) });
  },
  postTelemetry(runId: string, telemetry: TelemetryPoint): Promise<AcceptanceRun> {
    return request(`/runs/${runId}/telemetry`, { method: 'POST', ...json({ telemetry }) });
  },
  closeRun(runId: string): Promise<AcceptanceRun> {
    return request(`/runs/${runId}/close`, { method: 'POST', ...json({}) });
  },
  deleteRun(runId: string): Promise<void> {
    return request(`/runs/${runId}`, { method: 'DELETE' });
  },
  verifyCloud(runId: string, table: string): Promise<{ table: string; count: number; rows: Record<string, unknown>[] }> {
    return request(`/verify/cloud?runId=${encodeURIComponent(runId)}&table=${encodeURIComponent(table)}`);
  },
  verifyFile(runId: string): Promise<{ runId: string; found: boolean; name: string | null; url: string | null }> {
    return request(`/verify/file?runId=${encodeURIComponent(runId)}`);
  },
  cleanup(payload: { runId?: string; tables?: string[]; filePaths?: string[]; prefix?: string }): Promise<{ ok: boolean; counts: Record<string, number>; filesRemoved: number; rowsRemoved: number }> {
    return request('/cleanup', { method: 'POST', ...json(payload) });
  },
};