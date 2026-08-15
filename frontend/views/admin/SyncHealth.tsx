import React, { useEffect, useRef, useState } from 'react';
import { Activity, AlertTriangle, CheckCircle, Clock, Database, RefreshCw, Trash2, RotateCcw, HeartPulse, ArrowLeft, GitBranch, Server } from 'lucide-react';
import { backgroundSyncService } from '../../services/backgroundSyncService';
import type { QueueMetrics, QueuedOperation } from '../../services/durableSyncQueue';
import { countTombstones, purgeTombstones } from '../../services/syncApiClient';
import { API_BASE_URL } from '../../config/api.js';
import { useNavigate } from 'react-router-dom';

const t = { 50: '#eef7f6', 100: '#d3ece9', 200: '#a6d9d3', 500: '#1f8577', 600: '#146b60', 700: '#0f544c', 800: '#0b3e39' };
const amber = { 100: '#fbead0', 500: '#d99a3f' };
const paper = '#FEFDFB', ink = '#23282A', inkSoft = '#5c6567', hairline = '#e4ddd1', danger = '#b5493f';

interface ConflictRecord {
  operationId?: string | null;
  table?: string;
  recordId?: string | null;
  conflictedFields?: string[];
  resolved?: 'auto' | 'review';
  serverVersion?: number;
  timestamp?: string;
}

const SYNC_TABLES = [
  'products', 'customers', 'sales_orders', 'invoices', 'production_batches',
  'warehouse_inventory', 'inventory_transactions', 'ledger_entries', 'job_tickets',
  'delivery_notes', 'bank_transactions',
];

const fmtAge = (iso: string | null | undefined) => {
  if (!iso) return '—';
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 0) return 'just now';
  if (ms < 60000) return `${Math.round(ms / 1000)}s ago`;
  if (ms < 3600000) return `${Math.round(ms / 60000)}m ago`;
  if (ms < 86400000) return `${Math.round(ms / 3600000)}h ago`;
  return `${Math.round(ms / 86400000)}d ago`;
};

const StatCard: React.FC<{ label: string; value: React.ReactNode; icon: React.ReactNode; color: string; bg?: string; sub?: string }> = ({ label, value, icon, color, bg, sub }) => (
  <div className="prime-card" style={{ background: paper, padding: '12px 16px', borderRadius: 14, border: `1.4px solid ${hairline}`, borderLeft: `4px solid ${color}`, display: 'flex', alignItems: 'center', gap: 16 }}>
    <div style={{ padding: 10, background: bg || `${color}15`, color, borderRadius: 8, display: 'flex', alignItems: 'center' }}>{icon}</div>
    <div style={{ minWidth: 0 }}>
      <p style={{ fontSize: 10, fontWeight: 700, color: inkSoft, textTransform: 'uppercase', letterSpacing: 0.5, margin: '0 0 4px' }}>{label}</p>
      <p style={{ fontSize: 18, fontWeight: 700, color: ink, margin: 0, fontVariantNumeric: 'tabular-nums' }}>{value}</p>
      {sub && <p style={{ fontSize: 11, color: inkSoft, margin: '2px 0 0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{sub}</p>}
    </div>
  </div>
);

const SyncHealth: React.FC = () => {
  const navigate = useNavigate();
  const [metrics, setMetrics] = useState<QueueMetrics | null>(null);
  const [deadLetterOps, setDeadLetterOps] = useState<QueuedOperation[]>([]);
  const [conflicts, setConflicts] = useState<ConflictRecord[]>([]);
  const [tombstones, setTombstones] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState(false);
  const [retentionDays, setRetentionDays] = useState(30);
  const [notice, setNotice] = useState<string | null>(null);
  const [gwOnline, setGwOnline] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const refresh = async () => {
    const m = await backgroundSyncService.getMetrics().catch(() => null);
    setMetrics(m);
    const ops = await backgroundSyncService.exportQueue().catch(() => [] as QueuedOperation[]);
    setDeadLetterOps(ops.filter(o => o.status === 'dead_letter'));
    const c = await backgroundSyncService.getConflicts(40).catch(() => [] as unknown[]);
    setConflicts(c as ConflictRecord[]);
    try {
      const res = await fetch(`${API_BASE_URL}/sync/health`, { signal: AbortSignal.timeout(8000) });
      setGwOnline(res?.ok === true);
    } catch {
      setGwOnline(false);
    }
  };

  const loadTombstones = async () => {
    const counts: Record<string, number> = {};
    await Promise.all(SYNC_TABLES.map(async (table) => {
      counts[table] = await countTombstones(table);
    }));
    setTombstones(counts);
  };

  useEffect(() => {
    refresh();
    loadTombstones();
    timerRef.current = setInterval(refresh, 10000);
    const unsub = backgroundSyncService.subscribe('sync-health', () => { refresh(); });
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      unsub();
    };
  }, []);

  const runSyncNow = async () => {
    setBusy(true);
    setNotice(null);
    await backgroundSyncService.syncNow(true);
    await refresh();
    setBusy(false);
    setNotice('Sync pass completed');
  };

  const retryAllFailed = async () => {
    setBusy(true);
    const count = await backgroundSyncService.retryAllFailed();
    await refresh();
    setBusy(false);
    setNotice(`Requeued ${count} failed operation(s)`);
  };

  const retryOp = async (id: string) => {
    await backgroundSyncService.retryDeadLetter(id);
    await refresh();
  };

  const runCompaction = async () => {
    setBusy(true);
    const { durableSyncQueue } = await import('../../services/durableSyncQueue');
    const removed = await durableSyncQueue.cleanup(86400000, 30 * 86400000, 90 * 86400000);
    await refresh();
    setBusy(false);
    setNotice(`Queue compaction removed ${removed} stale item(s)`);
  };

  const purgeTable = async (table: string) => {
    if (!window.confirm(`Purge tombstones older than ${retentionDays} days in "${table}"? This hard-deletes rows from the cloud after archiving them to the workspace.`)) return;
    setBusy(true);
    setNotice(null);
    try {
      const result = await purgeTombstones(table, retentionDays);
      setNotice(`Purged ${result.purged} tombstone(s) from ${table} (archived ${result.archived})`);
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Purge failed');
    }
    await loadTombstones();
    setBusy(false);
  };

  const totalTombstones = (Object.values(tombstones) as number[]).reduce((s: number, n: number) => s + (n || 0), 0);

  return (
    <div style={{ padding: 24, maxWidth: 1400, margin: '0 auto', minHeight: '100%', background: t[50] }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <button onClick={() => navigate(-1)} style={{ padding: 8, borderRadius: '50%', border: `1.4px solid ${hairline}`, background: paper, color: inkSoft, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <ArrowLeft size={20} />
          </button>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 800, color: ink, display: 'flex', alignItems: 'center', gap: 8, margin: 0 }}>
              <HeartPulse size={24} color={t[500]} /> Sync Health
            </h1>
            <p style={{ fontSize: 13, color: inkSoft, margin: '3px 0 0' }}>Queue depth, retries, latency, conflicts &amp; tombstone lifecycle</p>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 12px', borderRadius: 20, fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.5, background: gwOnline ? t[100] : '#fef0ee', color: gwOnline ? t[800] : danger }}>
            <Server size={12} /> {gwOnline ? 'Gateway Online' : 'Gateway Unreachable'}
          </span>
          <button onClick={runSyncNow} disabled={busy} style={{ padding: '9px 16px', borderRadius: 10, border: 'none', background: t[600], color: '#fff', fontWeight: 700, fontSize: 13, cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.6 : 1, display: 'flex', alignItems: 'center', gap: 6 }}>
            <RefreshCw size={14} className={busy ? 'animate-spin' : ''} /> Sync Now
          </button>
          <button onClick={() => { refresh(); loadTombstones(); }} style={{ padding: 9, borderRadius: 10, border: `1.4px solid ${hairline}`, background: paper, color: inkSoft, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <RefreshCw size={15} />
          </button>
        </div>
      </div>

      {notice && <div style={{ marginBottom: 16, padding: '10px 16px', borderRadius: 10, background: '#f0fdf4', border: '1px solid #bbf7d0', color: '#166534', fontSize: 13, fontWeight: 600 }}>{notice}</div>}

      {/* Queue stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 16, marginBottom: 24 }}>
        <StatCard label="Queue Depth" value={metrics?.total ?? 0} icon={<Database size={20} />} color={t[500]} sub={`pending ${metrics?.pending ?? 0} · syncing ${metrics?.syncing ?? 0}`} />
        <StatCard label="Pending" value={metrics?.pending ?? 0} icon={<Clock size={20} />} color="#06b6d4" sub={metrics?.oldestPending ? `oldest ${fmtAge(metrics.oldestPending)}` : 'queue empty'} />
        <StatCard label="Failed" value={metrics?.failed ?? 0} icon={<AlertTriangle size={20} />} color={danger} sub="retryable errors" />
        <StatCard label="Dead Letter" value={metrics?.deadLetter ?? 0} icon={<AlertTriangle size={20} />} color="#b91c1c" bg="#fef2f2" sub="await review/retry" />
        <StatCard label="Avg Sync Latency" value={metrics?.avgSyncLatencyMs ? `${metrics.avgSyncLatencyMs}ms` : '—'} icon={<Activity size={20} />} color="#8b5cf6" bg="#f5f3ff" sub="per batch" />
        <StatCard label="Avg Retries" value={metrics?.avgRetryCount != null ? metrics.avgRetryCount.toFixed(1) : '—'} icon={<RotateCcw size={20} />} color="#6366f1" bg="#eef2ff" sub="per operation" />
        <StatCard label="Conflicts" value={metrics?.conflictsTotal ?? 0} icon={<GitBranch size={20} />} color="#d97706" bg={amber[100]} sub={`${metrics?.conflictsAuto ?? 0} auto · ${metrics?.conflictsReview ?? 0} review`} />
        <StatCard label="Last Sync" value={''} icon={<CheckCircle size={20} />} color={t[700]} sub={metrics?.lastSyncSuccess ? `success ${fmtAge(metrics.lastSyncSuccess)}` : metrics?.lastSyncFailure ? `failure ${fmtAge(metrics.lastSyncFailure)}` : 'never synced'} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 2fr) minmax(0, 1fr)', gap: 24, marginBottom: 24 }}>
        {/* Dead letter ops */}
        <div className="prime-card" style={{ background: paper, borderRadius: 14, border: `1.4px solid ${hairline}`, overflow: 'hidden' }}>
          <div style={{ padding: '14px 18px', borderBottom: `1.4px solid ${hairline}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: t[50] }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, color: ink, margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
              <AlertTriangle size={16} color="#b91c1c" /> Dead-Letter Operations
            </h3>
            <button onClick={retryAllFailed} disabled={busy} style={{ padding: '6px 12px', borderRadius: 8, border: 'none', background: '#b91c1c', color: '#fff', fontWeight: 700, fontSize: 12, cursor: busy ? 'default' : 'pointer' }}>Retry Failed</button>
          </div>
          {deadLetterOps.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 36, color: inkSoft }}>
              <CheckCircle size={36} style={{ margin: '0 auto 10px', color: t[200] }} />
              <p style={{ fontWeight: 600 }}>No dead-letter operations</p>
              <p style={{ fontSize: 12.5, marginTop: 4 }}>Rejected writes and unresolved conflicts land here for review.</p>
            </div>
          ) : (
            <div style={{ maxHeight: 360, overflowY: 'auto' }}>
              <table style={{ width: '100%', fontSize: 12.5, borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ position: 'sticky', top: 0, background: paper, borderBottom: `1.4px solid ${hairline}` }}>
                    {['Table', 'Record', 'Retries', 'Error', 'When'].map(h => (
                      <th key={h} className="prime-table-header" style={{ padding: '9px 12px', fontSize: 10.5, fontWeight: 700, color: inkSoft, textTransform: 'uppercase', letterSpacing: 0.5, textAlign: 'left' }}>{h}</th>
                    ))}
                    <th className="prime-table-header" style={{ padding: '9px 12px', fontSize: 10.5, fontWeight: 700, color: inkSoft, textTransform: 'uppercase', letterSpacing: 0.5, textAlign: 'right' }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {deadLetterOps.map(op => (
                    <tr key={op.id} className="prime-table-cell" style={{ borderBottom: `1px solid ${hairline}` }}>
                      <td style={{ padding: '9px 12px', fontFamily: "'JetBrains Mono', monospace", fontSize: 11.5 }}>{op.table}</td>
                      <td style={{ padding: '9px 12px', fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: inkSoft }}>{op.recordId || '—'}</td>
                      <td style={{ padding: '9px 12px', textAlign: 'center' }}>{op.retryCount}</td>
                      <td style={{ padding: '9px 12px', color: '#b91c1c', maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={op.lastError || ''}>{op.lastError || 'no error recorded'}</td>
                      <td style={{ padding: '9px 12px', color: inkSoft, fontSize: 11.5 }}>{fmtAge(op.lastAttempt)}</td>
                      <td style={{ padding: '9px 12px', textAlign: 'right' }}>
                        <button onClick={() => retryOp(op.id)} disabled={busy} title="Requeue for retry" style={{ padding: '4px 10px', borderRadius: 7, border: `1px solid ${t[500]}`, background: t[50], color: t[700], fontSize: 11.5, fontWeight: 700, cursor: 'pointer' }}>Retry</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Conflicts */}
        <div className="prime-card" style={{ background: paper, borderRadius: 14, border: `1.4px solid ${hairline}`, overflow: 'hidden' }}>
          <div style={{ padding: '14px 18px', borderBottom: `1.4px solid ${hairline}`, background: t[50] }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, color: ink, margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
              <GitBranch size={16} color="#d97706" /> Recent Conflicts
            </h3>
            <p style={{ fontSize: 12, color: inkSoft, margin: '4px 0 0' }}>Auto-merged on disjoint fields; same-field edits are LWW-resolved and flagged for review.</p>
          </div>
          {conflicts.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 36, color: inkSoft }}>
              <CheckCircle size={36} style={{ margin: '0 auto 10px', color: t[200] }} />
              <p style={{ fontWeight: 600 }}>No conflicts recorded</p>
            </div>
          ) : (
            <div style={{ maxHeight: 360, overflowY: 'auto' }}>
              <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ position: 'sticky', top: 0, background: paper, borderBottom: `1.4px solid ${hairline}` }}>
                    {['Table', 'Fields', 'Resolution', 'When'].map(h => (
                      <th key={h} className="prime-table-header" style={{ padding: '9px 12px', fontSize: 10.5, fontWeight: 700, color: inkSoft, textTransform: 'uppercase', letterSpacing: 0.5, textAlign: 'left' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {conflicts.map((c, i) => (
                    <tr key={i} className="prime-table-cell" style={{ borderBottom: `1px solid ${hairline}` }}>
                      <td style={{ padding: '9px 12px', fontFamily: "'JetBrains Mono', monospace", fontSize: 11 }}>{c.table || '—'}</td>
                      <td style={{ padding: '9px 12px', color: inkSoft, fontSize: 11, maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={(c.conflictedFields || []).join(', ')}>
                        {(c.conflictedFields || []).length > 0 ? c.conflictedFields!.join(', ') : '—'}
                      </td>
                      <td style={{ padding: '9px 12px' }}>
                        <span style={{ padding: '2px 8px', borderRadius: 10, fontSize: 10, fontWeight: 800, textTransform: 'uppercase', background: c.resolved === 'review' ? '#fef2f2' : t[100], color: c.resolved === 'review' ? '#b91c1c' : t[700] }}>
                          {c.resolved === 'review' ? 'Review' : 'Auto'}
                        </span>
                      </td>
                      <td style={{ padding: '9px 12px', color: inkSoft, fontSize: 11.5 }}>{fmtAge(c.timestamp)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Tombstone GC */}
      <div className="prime-card" style={{ background: paper, padding: 18, borderRadius: 14, border: `1.4px solid ${hairline}` }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 6 }}>
          <h3 style={{ fontSize: 14, fontWeight: 700, color: ink, margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Trash2 size={15} color={danger} /> Tombstone Lifecycle — Retention &amp; GC
          </h3>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input type="number" min={1} max={365} value={retentionDays} onChange={e => setRetentionDays(parseInt(e.target.value) || 30)} style={{ width: 80, padding: '7px 10px', borderRadius: 8, border: `1.4px solid ${hairline}`, fontSize: 13, color: ink, background: paper, outline: 'none' }} />
            <span style={{ fontSize: 12, color: inkSoft }}>days retention</span>
          </div>
        </div>
        <p style={{ fontSize: 12.5, color: inkSoft, margin: '0 0 14px', lineHeight: 1.5, maxWidth: 720 }}>
          Soft deletes keep the physical row so other devices reconcile. Purge tombstones past the retention window — each row is archived (JSONL in the workspace) before the hard delete, so GC never destroys the audit trail.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 10 }}>
          {SYNC_TABLES.map(table => (
            <div key={table} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '9px 12px', borderRadius: 10, border: `1px solid ${hairline}`, background: paper }}>
              <div style={{ minWidth: 0 }}>
                <p style={{ margin: 0, fontFamily: "'JetBrains Mono', monospace", fontSize: 11.5, color: ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{table}</p>
                <p style={{ margin: '2px 0 0', fontSize: 11, color: tombstones[table] ? danger : inkSoft }}>{tombstones[table] ?? 0} tombstone(s)</p>
              </div>
              <button onClick={() => purgeTable(table)} disabled={busy || !tombstones[table]} title="Archive + purge old tombstones" style={{ padding: '5px 11px', borderRadius: 7, border: `1px solid ${danger}`, background: tombstones[table] ? '#fef0ee' : paper, color: danger, fontSize: 11.5, fontWeight: 700, cursor: tombstones[table] && !busy ? 'pointer' : 'default', opacity: tombstones[table] ? 1 : 0.45, display: 'flex', alignItems: 'center', gap: 5 }}>
                <Trash2 size={12} /> GC
              </button>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 14, gap: 12, flexWrap: 'wrap' }}>
          <p style={{ fontSize: 12, color: inkSoft, margin: 0 }}>{totalTombstones} tombstone(s) pending GC across these tables</p>
          <button onClick={runCompaction} disabled={busy} style={{ padding: '8px 14px', borderRadius: 9, border: 'none', background: t[600], color: '#fff', fontWeight: 700, fontSize: 12.5, cursor: busy ? 'default' : 'pointer' }}>
            Run Queue Compaction
          </button>
        </div>
      </div>
    </div>
  );
};

export default SyncHealth;