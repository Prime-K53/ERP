import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Activity, ArrowLeft, ClipboardCopy, Download, Flag, Play, Radio, RefreshCw, Trash2, XCircle, FileText, Users } from 'lucide-react';
import { acceptanceOrchestrator } from '../../services/acceptance/orchestrator';
import type { AcceptanceReport } from '../../services/acceptance/orchestrator';
import { acceptanceApi } from '../../services/acceptance/api';
import { cleanupRun } from '../../services/acceptance/cleanup';
import { downloadReport, downloadMarkdown, downloadHtml } from '../../services/acceptance/report';
import { getDeviceId } from '../../services/acceptance/device';
import { SCENARIO_PLAN } from '../../services/acceptance/types';
import type { AcceptanceRun, CheckResult } from '../../services/acceptance/types';

const t = { 50: '#eef7f6', 100: '#d3ece9', 200: '#a6d9d3', 500: '#1f8577', 600: '#146b60', 700: '#0f544c', 800: '#0b3e39' };
const amber = { 100: '#fbead0', 500: '#d99a3f' };
const paper = '#FEFDFB', ink = '#23282A', inkSoft = '#5c6567', hairline = '#e4ddd1', danger = '#b5493f';

const statusColor = (s: CheckResult['status']) => (s === 'pass' ? '#15803d' : s === 'fail' ? '#b91c1c' : '#b45309');

const primary = (disabled: boolean) => ({
  display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px', borderRadius: 8,
  border: 'none', color: '#fff', background: t[600], cursor: disabled ? 'default' : 'pointer',
  fontWeight: 700, fontSize: 12.5, opacity: disabled ? 0.5 : 1,
});

const secondary = (color: string, disabled: boolean) => ({
  display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px', borderRadius: 8,
  border: `1px solid ${color}`, color, background: '#fff', cursor: disabled ? 'default' : 'pointer',
  fontWeight: 600, fontSize: 12.5, opacity: disabled ? 0.5 : 1,
});

const AcceptanceDashboard: React.FC = () => {
  const navigate = useNavigate();
  const [run, setRun] = useState<AcceptanceRun | null>(null);
  const [checks, setChecks] = useState<CheckResult[]>([]);
  const [report, setReport] = useState<AcceptanceReport | null>(null);
  const [busy, setBusy] = useState(false);
  const [joinId, setJoinId] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const [apiDown, setApiDown] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const failureRef = useRef(0);

  const myId = getDeviceId();

  const stopPolling = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  const startPolling = () => {
    if (timerRef.current) return;
    timerRef.current = setInterval(() => void refresh(), 2000);
  };

  const refresh = async () => {
    setRun(acceptanceOrchestrator.getRun());
    setChecks(acceptanceOrchestrator.getChecks());
    try {
      const active = await acceptanceApi.getActiveRun();
      if (active) setRun(acceptanceOrchestrator.getRun() ?? active);
      failureRef.current = 0;
    } catch {
      failureRef.current += 1;
      if (failureRef.current >= 3) {
        setApiDown(true);
        stopPolling();
      }
    }
  };

  const retry = () => {
    failureRef.current = 0;
    setApiDown(false);
    startPolling();
    void refresh();
  };

  useEffect(() => {
    void refresh();
    startPolling();
    return () => {
      stopPolling();
      acceptanceOrchestrator.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const role: 'A' | 'B' | 'none' = run
    ? run.deviceA.id === myId
      ? 'A'
      : run.deviceB?.id === myId
        ? 'B'
        : 'none'
    : 'none';

  const running = !!run && !['complete', 'closed'].includes(run.state);

  const startAsA = async () => {
    setBusy(true);
    setStatus('Creating run…');
    try {
      const runA = await acceptanceOrchestrator.startDeviceA();
      setRun(runA);
      setStatus(`Run ${runA.runId} created. On Device B enter this run id and join, then click "Drive scenarios" here.`);
    } catch (err) {
      setStatus(`Failed to create run: ${String(err)}`);
    } finally {
      setBusy(false);
    }
  };

  const driveA = async () => {
    setBusy(true);
    setStatus('Running the eight scenarios… keep this tab open.');
    setReport(null);
    try {
      const rep = await acceptanceOrchestrator.runAll();
      setReport(rep);
      setStatus(`Complete — verdict ${rep.verdict}`);
    } catch (err) {
      setStatus(`Run failed: ${String(err)}`);
    } finally {
      setBusy(false);
      await refresh();
    }
  };

  const joinAsB = async () => {
    const runId = joinId.trim() || run?.runId || '';
    if (!runId) { setStatus('Enter the run id from Device A.'); return; }
    setBusy(true);
    setStatus('Joining run as Device B…');
    try {
      const joined = await acceptanceOrchestrator.joinAsDeviceB(runId);
      setRun(joined);
      setStatus(`Joined ${runId}. Observing scenarios now.`);
      void acceptanceOrchestrator.runObserver();
    } catch (err) {
      setStatus(`Join failed: ${String(err)}`);
    } finally {
      setBusy(false);
    }
  };

  const abort = () => {
    acceptanceOrchestrator.abort();
    setStatus('Aborted. Click "Drive scenarios" shape will not continue; report reflects collected checks.');
  };

  const doCleanup = async () => {
    if (!run) return;
    setBusy(true);
    setStatus('Removing acceptance-tagged rows and storage objects…');
    try {
      const result = await cleanupRun(run.runId);
      setStatus(result.ok ? `Cleanup complete. Cloud clean for ${run.runId}.` : `Cleanup finished with leftovers: ${JSON.stringify(result.remaining)}`);
    } catch (err) {
      setStatus(`Cleanup failed: ${String(err)}`);
    } finally {
      setBusy(false);
    }
  };

  const pass = checks.filter((c) => c.status === 'pass').length;
  const fail = checks.filter((c) => c.status === 'fail').length;
  const warn = checks.filter((c) => c.status === 'warning').length;

  return (
    <div style={{ padding: 24, maxWidth: 1080, margin: '0 auto', fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 4 }}>
        <button onClick={() => navigate('/settings')} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'transparent', border: 'none', color: t[600], cursor: 'pointer', fontWeight: 600 }}>
          <ArrowLeft size={16} /> Back
        </button>
        <h1 style={{ fontSize: 18, fontWeight: 700, color: ink, margin: 0 }}>Live Multi-Device Acceptance Framework</h1>
      </div>
      <p style={{ color: inkSoft, fontSize: 12.5, margin: '0 0 20px' }}>
        Runs the eight production acceptance scenarios across two real browsers against the live backend, Sync Gateway and Supabase.
      </p>

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 20 }}>
        <div className="prime-card" style={{ flex: 1, minWidth: 240, background: paper, borderRadius: 14, border: `1.4px solid ${hairline}`, borderLeft: `4px solid ${t[500]}`, padding: 14 }}>
          <p style={{ margin: 0, fontSize: 10, fontWeight: 700, color: inkSoft, textTransform: 'uppercase', letterSpacing: 0.5 }}>This device</p>
          <p style={{ margin: '6px 0 0', fontSize: 12, color: ink, fontWeight: 600 }}>Role: {role === 'A' ? 'Device A (driver)' : role === 'B' ? 'Device B (observer)' : 'unassigned'}</p>
          <p style={{ margin: '2px 0 0', fontSize: 11, color: inkSoft, wordBreak: 'break-all' }}>{myId}</p>
        </div>
        <div className="prime-card" style={{ flex: 1, minWidth: 240, background: paper, borderRadius: 14, border: `1.4px solid ${hairline}`, borderLeft: `4px solid ${run ? t[500] : amber[500]}`, padding: 14 }}>
          <p style={{ margin: 0, fontSize: 10, fontWeight: 700, color: inkSoft, textTransform: 'uppercase', letterSpacing: 0.5 }}>Run</p>
          {run ? (
            <>
              <p style={{ margin: '6px 0 0', fontSize: 15, fontWeight: 700, color: ink }}>
                {run.runId}
                <button title="Copy run id" style={{ marginLeft: 8, background: 'none', border: 'none', cursor: 'pointer', color: t[600], verticalAlign: 'middle' }} onClick={() => navigator.clipboard?.writeText(run.runId)}><ClipboardCopy size={14} /></button>
              </p>
              <p style={{ margin: '4px 0 0', fontSize: 11.5, color: inkSoft }}>
                {run.state} · scenario {run.scenarioIndex + 1}/{SCENARIO_PLAN.length}{run.scenarioKey ? ` · ${run.scenarioKey}` : ''}
              </p>
              <p style={{ margin: '2px 0 0', fontSize: 11.5, color: inkSoft }}>A: {run.deviceA.label} {run.deviceB ? ` · B: ${run.deviceB.label}` : ' · B not joined'}</p>
            </>
          ) : (
            <p style={{ margin: '6px 0 0', fontSize: 12, color: inkSoft }}>No active run. Start one on Device A.</p>
          )}
        </div>
        <div className="prime-card" style={{ flex: 1, minWidth: 160, background: paper, borderRadius: 14, border: `1.4px solid ${hairline}`, borderLeft: `4px solid ${fail ? danger : t[500]}`, padding: 14 }}>
          <p style={{ margin: 0, fontSize: 10, fontWeight: 700, color: inkSoft, textTransform: 'uppercase', letterSpacing: 0.5 }}>Checks</p>
          <p style={{ margin: '6px 0 0', fontSize: 16, fontWeight: 700, color: ink }}>
            <span style={{ color: t[600] }}>{pass} pass</span> · <span style={{ color: fail ? danger : inkSoft }}>{fail} fail</span> · {warn} warn
          </p>
          <p style={{ margin: '2px 0 0', fontSize: 11, color: inkSoft }}>{report ? `Report ${report.verdict}` : running ? 'In progress…' : 'Idle'}</p>
        </div>
      </div>

      {apiDown && (
        <div style={{ background: '#fbeaea', color: danger, borderRadius: 10, padding: '10px 14px', fontSize: 13, marginBottom: 16, fontWeight: 500 }}>
          The acceptance API is not reachable — the running backend predates the acceptance routes. Restart the backend
          (Ctrl+C then <code style={{ background: '#f4ecec', padding: '1px 5px', borderRadius: 4 }}>npm start</code> in
          <code style={{ background: '#f4ecec', padding: '1px 5px', borderRadius: 4 }}>backend/</code>), then retry.
          <button
            onClick={retry}
            style={{ marginLeft: 10, padding: '4px 10px', borderRadius: 6, border: `1px solid ${danger}`, background: '#fff', color: danger, cursor: 'pointer', fontWeight: 700, fontSize: 12 }}
          >
            Retry
          </button>
        </div>
      )}
      {status && (
        <div style={{ background: amber[100], color: '#7a4a12', borderRadius: 10, padding: '10px 14px', fontSize: 13, marginBottom: 16, fontWeight: 500 }}>
          {status}
        </div>
      )}

      <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))' }}>
        <div className="prime-card" style={{ background: paper, borderRadius: 14, border: `1.4px solid ${hairline}`, padding: 16 }}>
          <h3 style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 700, color: ink, display: 'flex', alignItems: 'center', gap: 8 }}><Flag size={16} color={t[600]} /> Device A — driver</h3>
          <p style={{ fontSize: 12, color: inkSoft, margin: '0 0 12px', lineHeight: 1.5 }}>
            Creates the run, then drives all eight scenarios. Leave this tab open until completion.
          </p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button onClick={startAsA} disabled={busy || !!run} style={primary(busy || !!run)}><Play size={16} /> New run (A)</button>
            {role === 'A' && !report && (
              <button onClick={driveA} disabled={busy} style={primary(busy)}><RefreshCw size={16} /> Drive scenarios</button>
            )}
            {role === 'A' && (
              <button onClick={abort} disabled={busy} style={secondary(danger, busy)}><XCircle size={16} /> Abort</button>
            )}
          </div>
          {role === 'A' && report && (
            <div style={{ marginTop: 12 }}>
              <p style={{ margin: 0, fontSize: 12, fontWeight: 700, color: report.verdict === 'NO_GO' ? '#b91c1c' : t[600] }}>Verdict: {report.verdict}</p>
              <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                <button onClick={() => downloadHtml(report)} style={secondary(t[600], false)}><FileText size={14} /> HTML</button>
                <button onClick={() => downloadMarkdown(report)} style={secondary(t[600], false)}><FileText size={14} /> Markdown</button>
                <button onClick={() => downloadReport(report)} style={secondary(t[600], false)}><Download size={14} /> JSON</button>
              </div>
            </div>
          )}
        </div>

        <div className="prime-card" style={{ background: paper, borderRadius: 14, border: `1.4px solid ${hairline}`, padding: 16 }}>
          <h3 style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 700, color: ink, display: 'flex', alignItems: 'center', gap: 8 }}><Users size={16} color={t[500]} /> Device B — observer</h3>
          <p style={{ fontSize: 12, color: inkSoft, margin: '0 0 12px', lineHeight: 1.5 }}>
            On a second browser/tab, enter the run id from this device and join. Device B verifies propagation, realtime delivery and storage downloads.
          </p>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              value={joinId}
              onChange={(e) => setJoinId(e.target.value)}
              placeholder={run?.runId ?? 'ACC-YYYY-MM-DD-…'}
              style={{ flex: 1, padding: '8px 10px', borderRadius: 8, border: `1px solid ${hairline}`, fontSize: 13, background: paper, color: ink }}
            />
            <button onClick={joinAsB} disabled={busy} style={primary(busy)}><Radio size={16} /> Join as B</button>
          </div>
          {role === 'B' && <p style={{ fontSize: 12, color: t[600], margin: '10px 0 0', fontWeight: 600 }}>Observing as Device B.</p>}
        </div>
      </div>

      <div className="prime-card" style={{ background: paper, borderRadius: 14, border: `1.4px solid ${hairline}`, padding: 16, marginTop: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: ink, display: 'flex', alignItems: 'center', gap: 8 }}><Activity size={16} color={t[600]} /> Scenario checks (live)</h3>
          {run && <button onClick={doCleanup} disabled={busy} style={secondary(inkSoft, busy)}><Trash2 size={14} /> Cleanup cloud</button>}
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left', padding: '6px 8px', color: inkSoft, fontWeight: 600 }}>Scenario</th>
                <th style={{ textAlign: 'left', padding: '6px 8px', color: inkSoft, fontWeight: 600 }}>Check</th>
                <th style={{ textAlign: 'left', padding: '6px 8px', color: inkSoft, fontWeight: 600 }}>Expected</th>
                <th style={{ textAlign: 'left', padding: '6px 8px', color: inkSoft, fontWeight: 600 }}>Actual</th>
                <th style={{ textAlign: 'left', padding: '6px 8px', color: inkSoft, fontWeight: 600 }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {checks.length === 0 ? (
                <tr><td colSpan={5} style={{ padding: 12, color: inkSoft, textAlign: 'center' }}>No checks yet — start a run to begin.</td></tr>
              ) : (
                checks.map((c, i) => (
                  <tr key={i}>
                    <td style={{ padding: '6px 8px', color: inkSoft, whiteSpace: 'nowrap' }}>{c.scenarioKey}</td>
                    <td style={{ padding: '6px 8px', color: ink, fontWeight: 500 }}>{c.name}</td>
                    <td style={{ padding: '6px 8px', color: inkSoft }}>{c.expected}</td>
                    <td style={{ padding: '6px 8px', color: inkSoft, maxWidth: 320, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={c.actual}>{c.actual}</td>
                    <td style={{ padding: '6px 8px', color: statusColor(c.status), fontWeight: 700 }}>{c.status.toUpperCase()}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div style={{ marginTop: 16 }}>
        <p style={{ fontSize: 12, color: inkSoft, margin: 0, lineHeight: 1.6 }}>
          <strong style={{ color: ink }}>On completion:</strong> the run closes with a verdict of <strong>GO</strong>, <strong>GO_WITH_OBSERVATIONS</strong> or <strong>NO_GO</strong>.
          Download the report and run <strong>Cleanup cloud</strong> to remove acceptance-tagged rows and storage objects before cutting the v1.0.0 release.
        </p>
      </div>
    </div>
  );
};

export default AcceptanceDashboard;