import { describe, it, expect } from 'vitest';
import { renderMarkdown, renderHtml } from '../../../services/acceptance/report';
import type { AcceptanceReport } from '../../../services/acceptance/orchestrator';
import type { CheckResult } from '../../../services/acceptance/types';

const checks: CheckResult[] = [
  { scenarioKey: 'offline_create', name: 'Cloud row created', expected: '1 customer', actual: 'count=1', status: 'pass' },
  { scenarioKey: 'offline_delete', name: 'No resurrection', expected: '0', actual: '0', status: 'fail' },
];

const report: AcceptanceReport = {
  runId: 'ACC-2026-08-06-TEST001',
  company: 'Prime Acceptance',
  runDate: '2026-08-06T10:00:00.000Z',
  devices: { a: 'Device A', b: 'Device B' },
  scenarioResults: [
    { scenario: { key: 'offline_create', title: 'Offline Create', description: '', requiresObserver: true }, checks: [checks[0]], telemetry: [], count: 1, passCount: 1 },
    { scenario: { key: 'offline_delete', title: 'Offline Delete', description: '', requiresObserver: true }, checks: [checks[1]], telemetry: [], count: 1, passCount: 0 },
  ],
  allChecks: checks,
  telemetry: [],
  environment: { gitSha: null, backendVersion: null, nodeVersion: null, supabaseProject: 'configured', supabaseConfigured: true, backendUrl: '/api', deviceCount: 2 },
  verdict: 'NO_GO',
};

describe('acceptance report rendering', () => {
  it('renderMarkdown includes run id, verdict and per-check lines', () => {
    const md = renderMarkdown(report);
    expect(md).toContain('# Live Multi-Device Acceptance Report');
    expect(md).toContain('ACC-2026-08-06-TEST001');
    expect(md).toContain('## Verdict: NO_GO');
    expect(md).toContain('[PASS] Cloud row created');
    expect(md).toContain('[FAIL] No resurrection');
  });

  it('renderHtml includes the checks table and verdict badge', () => {
    const html = renderHtml(report);
    expect(html).toContain('ACC-2026-08-06-TEST001');
    expect(html).toContain('NO_GO');
    expect(html).toContain('Cloud row created');
    expect(html).toContain('class="fail"');
  });
});
