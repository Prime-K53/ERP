import { describe, it, expect } from 'vitest';
import { check, warn, statusOf, isNumericWithin, verdictFromChecks, mergeChecks } from '../../../services/acceptance/verify';

describe('acceptance verify helpers', () => {
  it('check builds a pass/fail CheckResult', () => {
    const ok = check('s1', 'x', true, 'yes', 'yes');
    expect(ok.status).toBe('pass');
    const bad = check('s1', 'y', false, 'yes', 'no');
    expect(bad.status).toBe('fail');
  });

  it('warn builds a warning CheckResult', () => {
    const w = warn('s1', 'observer missing', 'not joined');
    expect(w.status).toBe('warning');
  });

  it('statusOf compares strict values', () => {
    expect(statusOf(1, 1)).toBe('pass');
    expect(statusOf({ a: 1 }, { a: 1 })).toBe('pass');
    expect(statusOf(1, '1')).toBe('fail');
  });

  it('isNumericWithin tolerates a percentage band', () => {
    expect(isNumericWithin(105, 100)).toBe('pass');
    expect(isNumericWithin(106, 100)).toBe('fail');
    expect(isNumericWithin(0, 0)).toBe('pass');
  });

  it('verdictFromChecks returns GO only with zero failures and warnings', () => {
    const pass = [check('a', '1', true, 'x', 'x'), check('b', '2', true, 'x', 'x')];
    expect(verdictFromChecks(pass)).toBe('GO');
    const withWarn = [...pass, warn('c', 'note', 'reason')];
    expect(verdictFromChecks(withWarn)).toBe('GO_WITH_OBSERVATIONS');
    const withFail = [...pass, check('d', '3', false, 'x', 'y')];
    expect(verdictFromChecks(withFail)).toBe('NO_GO');
  });

  it('mergeChecks dedupes by scenarioKey:name, later entries win', () => {
    const a = [check('s1', 'name', false, 'a', 'a')];
    const b = [check('s1', 'name', true, 'b', 'b'), check('s2', 'other', true, 'b', 'b')];
    const merged = mergeChecks(a, b);
    expect(merged).toHaveLength(2);
    const winner = merged.find((c) => c.scenarioKey === 's1' && c.name === 'name');
    expect(winner!.status).toBe('pass');
  });
});
