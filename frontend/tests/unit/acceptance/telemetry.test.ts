import { describe, it, expect, vi, beforeEach } from 'vitest';
import { setQueueSnapshotHook, refreshQueueSnapshot, currentQueueSnapshot, startTimer } from '../../../services/acceptance/telemetry';

describe('acceptance telemetry', () => {
  beforeEach(() => {
    setQueueSnapshotHook(async () => ({ pending: 5, retries: 2, conflicts: 3, deadLetters: 1 }));
    vi.stubGlobal('performance', { now: (() => { let n = 0; return () => (n += 100); })() });
  });

  it('snapshots the queue through the injected hook', async () => {
    await refreshQueueSnapshot();
    expect(currentQueueSnapshot()).toEqual({ pending: 5, retries: 2, conflicts: 3, deadLetters: 1 });
  });

  it('startTimer.stop computes duration and queue deltas', async () => {
    await refreshQueueSnapshot();
    setQueueSnapshotHook(async () => ({ pending: 1, retries: 4, conflicts: 5, deadLetters: 2 }));
    await refreshQueueSnapshot();

    const timer = startTimer('s1');
    setQueueSnapshotHook(async () => ({ pending: 1, retries: 6, conflicts: 7, deadLetters: 4 }));
    await refreshQueueSnapshot();

    const point = timer.stop({ gatewayMs: 42 });
    expect(point.scenarioKey).toBe('s1');
    expect(point.durationMs).toBeGreaterThan(0);
    expect(point.queueDepth).toBe(1);
    expect(point.retries).toBe(2);
    expect(point.conflicts).toBe(2);
    expect(point.deadLetters).toBe(2);
    expect(point.gatewayMs).toBe(42);
  });

  it('merge partial fields into the telemetry point', async () => {
    await refreshQueueSnapshot();
    const timer = startTimer('s2');
    const point = timer.stop({ realtimeMs: 9 });
    expect(point.realtimeMs).toBe(9);
    expect(typeof point.deviceId).toBe('string');
  });
});
