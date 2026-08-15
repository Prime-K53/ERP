// Pure helpers: scenario verification against the production acceptance
// criteria, and verdict computation. No side effects — unit-testable.

import type { CheckResult, CheckStatus, Verdict } from './types';

export function check(
  scenarioKey: string,
  name: string,
  condition: boolean,
  expected: string,
  actual: string,
  meta?: Record<string, unknown>,
  durationMs?: number,
): CheckResult {
  return {
    scenarioKey,
    name,
    expected,
    actual,
    status: condition ? 'pass' : 'fail',
    durationMs,
    meta,
  };
}

export function warn(scenarioKey: string, name: string, reason: string): CheckResult {
  return { scenarioKey, name, expected: 'n/a', actual: reason, status: 'warning' };
}

export function statusOf(actual: unknown, expected: unknown): CheckStatus {
  return JSON.stringify(actual) === JSON.stringify(expected) ? 'pass' : 'fail';
}

export function isNumericWithin(actual: number, expected: number, tolerancePct = 5): CheckStatus {
  if (expected === 0) return actual === 0 ? 'pass' : 'fail';
  const diff = Math.abs(actual - expected) / Math.abs(expected);
  return diff <= tolerancePct / 100 ? 'pass' : 'fail';
}

export function verdictFromChecks(checks: CheckResult[]): Verdict {
  const failures = checks.filter((c) => c.status === 'fail');
  if (failures.length > 0) return 'NO_GO';
  const warnings = checks.filter((c) => c.status === 'warning');
  return warnings.length > 0 ? 'GO_WITH_OBSERVATIONS' : 'GO';
}

export function mergeChecks(a: CheckResult[], b: CheckResult[]): CheckResult[] {
  const map = new Map<string, CheckResult>();
  for (const c of [...a, ...b]) map.set(`${c.scenarioKey}:${c.name}`, c);
  return [...map.values()];
}
