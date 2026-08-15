// Per-scenario telemetry collector. Snapshots the durable queue around each
// scenario so the acceptance report can show real gateway/IDB/cloud timings
// and queue discipline instead of human-claimed pass/fails.

import { getDeviceId } from './device';
import type { TelemetryPoint } from './types';

export interface QueueSnapshot {
  pending: number;
  retries: number;
  conflicts: number;
  deadLetters: number;
}

let queueSnapshot: () => Promise<QueueSnapshot> = async () => ({
  pending: 0, retries: 0, conflicts: 0, deadLetters: 0,
});

let lastQueueSnapshot: QueueSnapshot = { pending: 0, retries: 0, conflicts: 0, deadLetters: 0 };

/** The orchestrator injects a live queue snapshot hook at startup. */
export function setQueueSnapshotHook(fn: () => Promise<QueueSnapshot>): void {
  queueSnapshot = fn;
}

export async function refreshQueueSnapshot(): Promise<void> {
  lastQueueSnapshot = await queueSnapshot();
}

export function currentQueueSnapshot(): QueueSnapshot {
  return lastQueueSnapshot;
}

export interface Timer {
  stop(partial?: Partial<TelemetryPoint>): TelemetryPoint;
}

export function startTimer(scenarioKey: string): Timer {
  const start = performance.now();
  const queueBefore = { ...lastQueueSnapshot };
  return {
    stop(partial = {}) {
      const durationMs = Math.round(performance.now() - start);
      const queueAfter = lastQueueSnapshot;
      return {
        deviceId: getDeviceId(),
        scenarioKey,
        durationMs,
        queueDepth: queueAfter.pending,
        retries: queueAfter.retries - queueBefore.retries,
        conflicts: queueAfter.conflicts - queueBefore.conflicts,
        deadLetters: queueAfter.deadLetters - queueBefore.deadLetters,
        ...partial,
      };
    },
  };
}
