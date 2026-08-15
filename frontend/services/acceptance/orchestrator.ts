// Orchestrator: drives the run on device A (sequential scenarios) and the
// observer loop on device B. Also injects live queue telemetry and produces
// the final report + verdict.

import { acceptanceApi } from './api';
import { scenarios } from './scenarios';
import { getDeviceId, getDeviceLabel } from './device';
import { setQueueSnapshotHook, refreshQueueSnapshot } from './telemetry';
import { mergeChecks, verdictFromChecks } from './verify';
import { SCENARIO_PLAN } from './types';
import type { AcceptanceRun, CheckResult, EnvironmentMeta, ScenarioMeta, TelemetryPoint, Verdict } from './types';
import { durableSyncQueue } from '../durableSyncQueue';
import { API_BASE_URL, SUPABASE_CONFIGURED } from '../../config/api.js';

export interface ScenarioResult {
  scenario: ScenarioMeta;
  checks: CheckResult[];
  telemetry: TelemetryPoint[];
  count: number;
  passCount: number;
}

export interface AcceptanceReport {
  runId: string;
  company: string;
  runDate: string;
  devices: { a: string; b: string | null };
  scenarioResults: ScenarioResult[];
  allChecks: CheckResult[];
  telemetry: TelemetryPoint[];
  environment: EnvironmentMeta;
  verdict: Verdict;
}

function envMeta(deviceCount: number): EnvironmentMeta {
  return {
    gitSha: null,
    backendVersion: null,
    nodeVersion: null,
    supabaseProject: SUPABASE_CONFIGURED ? 'configured' : 'not-configured',
    supabaseConfigured: SUPABASE_CONFIGURED,
    backendUrl: API_BASE_URL,
    deviceCount,
  };
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export interface ScenarioContext {
  runId: string;
  deviceId: string;
  role: 'A' | 'B';
  checks: CheckResult[];
  addCheck(result: CheckResult): void;
  patch(data: Record<string, unknown>): Promise<void>;
  getRun(): Promise<AcceptanceRun>;
  sleep(ms: number): Promise<void>;
  waitFor(fn: () => Promise<boolean>, timeoutMs: number, what: string): Promise<boolean>;
}

class AcceptanceOrchestrator {
  private run: AcceptanceRun | null = null;
  private role: 'A' | 'B' | null = null;
  private localChecks: CheckResult[] = [];
  private localTelemetry: TelemetryPoint[] = [];
  private aborted = false;
  private pollTimer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    setQueueSnapshotHook(async () => {
      await refreshQueueSnapshot();
      const m = await durableSyncQueue.getMetrics();
      return { pending: m.pending, retries: m.failed, conflicts: m.conflictsTotal, deadLetters: m.deadLetter };
    });
  }

  getRun(): AcceptanceRun | null { return this.run; }
  getRole(): 'A' | 'B' | null { return this.role; }
  getChecks(): CheckResult[] { return [...this.localChecks]; }
  isRunning(): boolean { return !!this.run && !['complete', 'closed'].includes(this.run.state); }

  private makeCtx(): ScenarioContext {
    const runId = this.run!.runId;
    const deviceId = getDeviceId();
    const checks = this.localChecks;
    return {
      runId,
      deviceId,
      role: this.role!,
      checks,
      addCheck: (c) => {
        checks.push(c);
        void acceptanceApi.postObservation(runId, c.scenarioKey, c, deviceId).catch(() => {});
      },
      patch: async (data) => { await acceptanceApi.patch(runId, data); },
      getRun: () => acceptanceApi.getRun(runId),
      sleep: sleep as (ms: number) => Promise<void>,
      waitFor: async (fn, timeoutMs, what) => {
        const deadline = Date.now() + timeoutMs;
        while (Date.now() < deadline) {
          if (this.aborted) return false;
          try { if (await fn()) return true; } catch { /* transient */ }
          await sleep(700);
        }
        return false;
      },
    };
  }

  /** Device A: create a fresh run and drive all scenarios in sequence. */
  async startDeviceA(): Promise<AcceptanceRun> {
    const run = await acceptanceApi.createRun();
    this.run = run;
    this.role = 'A';
    return run;
  }

  /** Device A: re-adopt an existing run after a reload. */
  async adoptAsDeviceA(runId: string): Promise<AcceptanceRun> {
    this.run = await acceptanceApi.getRun(runId);
    this.role = 'A';
    return this.run;
  }

  /** Device B: join an existing run as the observer device. */
  async joinAsDeviceB(runId: string): Promise<AcceptanceRun> {
    this.run = await acceptanceApi.joinRun(runId, getDeviceLabel());
    this.role = 'B';
    return this.run;
  }

  /** Drive all scenarios sequentially on device A. */
  async runAll(): Promise<AcceptanceReport> {
    if (!this.run || this.role !== 'A') throw new Error('Device A not initialised');
    const runId = this.run.runId;
    await acceptanceApi.startRun(runId);
    await refreshQueueSnapshot();

    for (let i = 0; i < SCENARIO_PLAN.length; i++) {
      if (this.aborted) break;
      const meta = SCENARIO_PLAN[i];
      this.run = await acceptanceApi.advance(runId, meta.key, i, `Running ${meta.title}`);
      await refreshQueueSnapshot();
      const handler = scenarios[meta.key];
      if (!handler || !handler.runOnA) {
        this.localChecks.push({ scenarioKey: meta.key, name: 'Scenario handler', expected: 'implemented', actual: 'missing', status: 'fail' });
        continue;
      }
      try {
        await handler.runOnA(this.makeCtx());
        this.localChecks.push({ scenarioKey: meta.key, name: 'Scenario execution', expected: 'completed', actual: 'completed', status: 'pass' });
      } catch (err) {
        this.localChecks.push({ scenarioKey: meta.key, name: 'Scenario handler error', expected: 'no error', actual: String(err), status: 'fail' });
      }
    }

    return this.closeAndReport();
  }

  /** Observer loop for device B. Polls the run and observes each scenario. */
  async runObserver(): Promise<void> {
    if (!this.run || this.role !== 'B') throw new Error('Device B not initialised');
    const runId = this.run.runId;
    let lastHandled = -1;
    this.pollTimer = setInterval(async () => {
      if (this.aborted) return;
      try {
        const run = await acceptanceApi.getRun(runId);
        this.run = run;
        if (run.state === 'complete' || run.state === 'closed') {
          this.stop();
          return;
        }
        if (run.scenarioIndex >= 0 && run.scenarioIndex !== lastHandled) {
          lastHandled = run.scenarioIndex;
          const meta = SCENARIO_PLAN[run.scenarioIndex];
          const handler = scenarios[meta.key];
          if (handler?.observeOnB) {
            await handler.observeOnB(this.makeCtx());
          }
        }
      } catch {
        /* transient poll failure */
      }
    }, 1000);
  }

  /** Collect the merged report + verdict. */
  async closeAndReport(): Promise<AcceptanceReport> {
    const runId = this.run!.runId;
    if (!this.aborted) {
      this.run = await acceptanceApi.closeRun(runId);
    }
    const final = this.run!;
    const observations = (final.data?.observations as Array<Partial<CheckResult> | { check?: CheckResult }> | undefined) || [];
    const remoteChecks = observations
      .map((o) => (o as { check?: CheckResult }).check ?? (o as CheckResult))
      .filter((c): c is CheckResult => !!c && typeof (c as CheckResult).name === 'string');
    const remoteTelemetry = (final.data?.telemetry as Array<Partial<TelemetryPoint> | { telemetry?: TelemetryPoint }> | undefined) || [];
    const telemetryPoints = remoteTelemetry
      .map((t) => (t as { telemetry?: TelemetryPoint }).telemetry ?? (t as TelemetryPoint))
      .filter((t): t is TelemetryPoint => !!t && typeof (t as TelemetryPoint).scenarioKey === 'string');
    const allChecks = mergeChecks(remoteChecks, this.localChecks);
    const telemetry = [...telemetryPoints, ...this.localTelemetry];
    this.stop();
    return {
      runId,
      company: String(final.data?.company || 'Prime Acceptance'),
      runDate: new Date().toISOString(),
      devices: { a: final.deviceA.label, b: final.deviceB?.label ?? null },
      scenarioResults: SCENARIO_PLAN.map((scenario) => {
        const checks = allChecks.filter((c) => c.scenarioKey === scenario.key);
        return {
          scenario,
          checks,
          telemetry: telemetry.filter((t) => t.scenarioKey === scenario.key),
          count: checks.length,
          passCount: checks.filter((c) => c.status !== 'fail').length,
        };
      }),
      allChecks,
      telemetry,
      environment: envMeta(final.deviceB ? 2 : 1),
      verdict: verdictFromChecks(allChecks),
    };
  }

  abort(): void {
    this.aborted = true;
  }

  stop(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }
}

export const acceptanceOrchestrator = new AcceptanceOrchestrator();
