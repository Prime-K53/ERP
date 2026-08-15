import React from 'react';
import { History, User, Monitor, Clock, Activity } from 'lucide-react';
import type { AuditLogEntry } from '../../../../types';

const t = { 50: '#eef7f6', 100: '#d3ece9', 200: '#a6d9d3', 500: '#1f8577', 600: '#146b60', 700: '#0f544c', 800: '#0b3e39' };
const amber = { 100: '#fbead0', 500: '#d99a3f' };
const paper = '#FEFDFB', ink = '#23282A', inkSoft = '#5c6567', hairline = '#e4ddd1', danger = '#b5493f';

interface Props {
  auditLog: AuditLogEntry[];
}

export const AuditLogTab: React.FC<Props> = ({ auditLog }) => {
  if (auditLog.length === 0) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '64px 0', color: inkSoft }}>
        <History size={48} style={{ marginBottom: 16, opacity: 0.5 }} />
        <p style={{ fontSize: 14, fontWeight: 600 }}>No Audit Log Entries</p>
        <p style={{ fontSize: 12, marginTop: 4 }}>No changes have been recorded for this item yet.</p>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {auditLog.map((entry, i) => {
        const action = entry.action || 'Unknown';
        const actionColor: React.CSSProperties =
          action === 'create' || action === 'created' ? { background: t[50], color: t[600], border: `1.4px solid ${t[100]}` } :
          action === 'update' || action === 'updated' ? { background: t[50], color: t[600], border: `1.4px solid ${t[100]}` } :
          action === 'delete' || action === 'deleted' ? { background: '#fef2f2', color: danger, border: '1.4px solid #fecaca' } :
          { background: t[100], color: inkSoft, border: `1.4px solid ${hairline}` };

        return (
          <div key={entry.id || i} className="prime-card" style={{ background: paper, borderRadius: 12, border: `1.4px solid ${hairline}`, overflow: 'hidden', boxShadow: '0 1px 2px rgba(0,0,0,0.05)', transition: 'all .15s' }}>
            <div style={{ padding: 16 }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                <div style={{ padding: 8, background: t[50], borderRadius: 9999, border: `1.4px solid ${hairline}`, flexShrink: 0, marginTop: 2 }}>
                  <Activity size={16} style={{ color: inkSoft }} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 14, fontWeight: 600, color: ink, textTransform: 'capitalize' }}>{action}</span>
                    <span style={{ display: 'inline-flex', alignItems: 'center', fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 9999, ...actionColor }}>
                      {action}
                    </span>
                  </div>
                  {entry.details && (
                    <p style={{ fontSize: 12, color: inkSoft, marginTop: 6 }}>{entry.details}</p>
                  )}
                  {entry.details && (
                    <pre style={{ fontSize: 10, color: inkSoft, marginTop: 8, background: t[50], padding: 12, borderRadius: 9, border: `1.4px solid ${hairline}`, maxHeight: 128, overflow: 'auto', fontFamily: 'monospace' }}>
                      {JSON.stringify(entry.details, null, 2)}
                    </pre>
                  )}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 10, fontSize: 10, color: inkSoft }}>
                    {entry.userId && (
                      <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <User size={10} /> {entry.userId}
                      </span>
                    )}
                    {(entry as AuditLogEntry & { ipAddress?: string }).ipAddress && (
                      <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <Monitor size={10} /> {(entry as AuditLogEntry & { ipAddress?: string }).ipAddress}
                      </span>
                    )}
                    <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <Clock size={10} />
                      {new Date(entry.date || Date.now()).toLocaleString()}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};