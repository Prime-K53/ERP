// Report generation for the acceptance framework: self-contained JSON,
// Markdown and HTML, downloaded client-side.

import type { AcceptanceReport } from './orchestrator';

function statusLine(count: number, passCount: number): string {
  const failures = count - passCount;
  return failures > 0 ? `${failures} FAILURE${failures === 1 ? '' : 'S'}` : 'PASS';
}

export function renderMarkdown(report: AcceptanceReport): string {
  const lines: string[] = [];
  lines.push(`# Live Multi-Device Acceptance Report — ${report.runId}`);
  lines.push('');
  lines.push(`- **Run:** ${report.runId}`);
  lines.push(`- **Date:** ${report.runDate}`);
  lines.push(`- **Verdict:** ${report.verdict}`);
  lines.push(`- **Device A:** ${report.devices.a}`);
  lines.push(`- **Device B:** ${report.devices.b ?? '(not joined)'}`);
  lines.push('');
  lines.push('## Environment');
  lines.push(`- **Backend:** ${report.environment.backendUrl} (${report.environment.backendVersion ?? 'unknown'})`);
  lines.push(`- **Supabase:** ${report.environment.supabaseConfigured ? 'configured' : 'NOT CONFIGURED'}`);
  lines.push(`- **Devices:** ${report.environment.deviceCount}`);
  lines.push('');
  lines.push('## Scenario Results');
  for (const s of report.scenarioResults) {
    lines.push(`### ${s.scenario.title} (${s.scenario.key}) — ${statusLine(s.count, s.passCount)} (${s.passCount}/${s.count})`);
    for (const c of s.checks) {
      lines.push(`- [${c.status.toUpperCase()}] ${c.name} — expected: ${c.expected}; actual: ${c.actual}${c.durationMs != null ? ` (${c.durationMs}ms)` : ''}`);
    }
    const telemetry = s.telemetry[0];
    if (telemetry) {
      lines.push(`  - Telemetry: ${telemetry.durationMs}ms, queue ${telemetry.queueDepth}, conflicts ${telemetry.conflicts}, dead-letter ${telemetry.deadLetters}.`);
    }
  }
  if (report.allChecks.length === 0) {
    lines.push('_(no checks recorded)_');
  }
  lines.push('');
  lines.push(`## Verdict: ${report.verdict}`);
  return lines.join('\n');
}

const VERDICT_CLASS: Record<string, string> = {
  GO: 'go',
  GO_WITH_OBSERVATIONS: 'go-warn',
  NO_GO: 'no-go',
};

export function renderHtml(report: AcceptanceReport): string {
  const rows = report.allChecks.map((c) =>
    `<tr><td>${c.scenarioKey}</td><td>${c.name}</td><td>${c.expected}</td><td>${c.actual}</td><td class="${c.status}">${c.status}</td></tr>`
  ).join('');
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>${report.runId} — Acceptance Report</title>
<style>
body{font-family:system-ui,sans-serif;margin:2rem;color:#1f2937}
h1{color:#0f172a;font-size:1.4rem}table{border-collapse:collapse;width:100%;margin-top:1rem}
th,td{border:1px solid #e2e8f0;padding:.5rem;text-align:left;font-size:.9rem}
th{background:#f1f5f9}.pass{color:#15803d;font-weight:700}.fail{color:#b91c1c;font-weight:700}.warning{color:#b45309;font-weight:700}
.badge{display:inline-block;padding:.25rem .75rem;border-radius:9999px;font-weight:700;margin:1rem 0}
.go{background:#dcfce7;color:#15803d}.go-warn{background:#fef3c7;color:#b45309}.no-go{background:#fee2e2;color:#b91c1c}
</style></head><body>
<h1>Live Multi-Device Acceptance Report</h1>
<p><strong>${report.runId}</strong> &middot; ${report.runDate}</p>
<p>Device A: ${report.devices.a} &middot; Device B: ${report.devices.b ?? 'n/a'}</p>
<p class="badge ${VERDICT_CLASS[report.verdict] || 'no-go'}">${report.verdict}</p>
<table><thead><tr><th>Scenario</th><th>Check</th><th>Expected</th><th>Actual</th><th>Status</th></tr></thead>
<tbody>${rows}</tbody></table>
<p>Environment: ${report.environment.backendUrl} &middot; Supabase ${report.environment.supabaseConfigured ? 'configured' : 'NOT configured'} &middot; ${report.environment.deviceCount} device(s)</p>
</body></html>`;
}

export function downloadReport(report: AcceptanceReport): void {
  const stamp = report.runId;
  const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${stamp}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function downloadMarkdown(report: AcceptanceReport): void {
  const blob = new Blob([renderMarkdown(report)], { type: 'text/markdown' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${report.runId}.md`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function downloadHtml(report: AcceptanceReport): void {
  const blob = new Blob([renderHtml(report)], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${report.runId}.html`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}