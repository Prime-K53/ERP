import React, { useState } from 'react';
import { Activity, AlertTriangle, Clock, Server, Key, Users, BarChart3 } from 'lucide-react';

const t = { 50: '#eef7f6', 100: '#d3ece9', 200: '#a6d9d3', 500: '#1f8577', 600: '#146b60', 700: '#0f544c', 800: '#0b3e39' };
const amber = { 100: '#fbead0', 500: '#d99a3f' };
const paper = '#FEFDFB', ink = '#23282A', inkSoft = '#5c6567', hairline = '#e4ddd1', danger = '#b5493f';

interface APIEndpoint { path: string; method: string; calls24h: number; avgLatency: number; errorRate: number; lastCalled: string; }

const APIUsageDashboard: React.FC = () => {
    const [endpoints, setEndpoints] = useState<APIEndpoint[]>([]);
    const [rateLimit, setRateLimit] = useState(120);
    const [currentUsage, setCurrentUsage] = useState(0);
    const usagePct = rateLimit > 0 ? (currentUsage / rateLimit) * 100 : 0;

    const statCards = [
        { label: 'Requests (24h)', value: endpoints.reduce((s, e) => s + e.calls24h, 0) || 0, icon: <Activity size={20} />, borderColor: t[500], bg: t[50], color: t[500] },
        { label: 'Avg Latency', value: endpoints.length > 0 ? (endpoints.reduce((s, e) => s + e.avgLatency, 0) / endpoints.length).toFixed(0) : '0', suffix: 'ms', icon: <Clock size={20} />, borderColor: '#8b5cf6', bg: '#f5f3ff', color: '#8b5cf6' },
        { label: 'Error Rate', value: endpoints.length > 0 ? (endpoints.reduce((s, e) => s + e.errorRate, 0) / endpoints.length).toFixed(1) : '0', suffix: '%', icon: <AlertTriangle size={20} />, borderColor: danger, bg: '#fef0ee', color: danger },
        { label: 'Rate Limit', value: `${currentUsage}/${rateLimit}`, icon: <BarChart3 size={20} />, borderColor: amber[500], bg: amber[100], color: usagePct > 80 ? danger : usagePct > 50 ? amber[500] : t[500] },
    ];

    return (
        <div style={{ padding: 24, maxWidth: 1200, margin: '0 auto', background: t[50], minHeight: '100%' }}>
            <div style={{ marginBottom: 24 }}>
                <h1 style={{ fontSize: 22, fontWeight: 700, color: ink, margin: 0 }}>API Usage & Rate Limiting</h1>
                <p style={{ fontSize: 13, color: inkSoft, margin: '4px 0 0' }}>Monitor API consumption, latency, and error rates</p>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 24 }}>
                {statCards.map((c, i) => (
                    <div key={i} className="prime-card" style={{ background: paper, padding: '12px 16px', borderRadius: 14, border: `1.4px solid ${hairline}`, borderLeft: `4px solid ${c.borderColor}`, display: 'flex', alignItems: 'center', gap: 16, transition: 'all .15s ease' }}
                        onMouseEnter={e => { e.currentTarget.style.background = t[50]; }}
                        onMouseLeave={e => { e.currentTarget.style.background = paper; }}
                    >
                        <div style={{ padding: 10, background: c.bg, color: c.color, borderRadius: 8 }}>{c.icon}</div>
                        <div>
                            <p style={{ fontSize: 10, fontWeight: 700, color: inkSoft, textTransform: 'uppercase', letterSpacing: 0.5, margin: '0 0 4px' }}>{c.label}</p>
                            <p style={{ fontSize: 18, fontWeight: 700, color: ink, margin: 0, fontVariantNumeric: 'tabular-nums' }}>{c.value}{'suffix' in c ? (c as any).suffix : ''}</p>
                        </div>
                    </div>
                ))}
            </div>

            <div className="prime-card" style={{ background: paper, padding: 20, borderRadius: 14, border: `1.4px solid ${hairline}`, marginBottom: 24 }}>
                <h3 style={{ fontSize: 14, fontWeight: 700, color: ink, margin: '0 0 16px', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <BarChart3 size={16} color={t[500]} /> Rate Limit Configuration
                </h3>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                    <div>
                        <label className="prime-label" style={{ display: 'block', fontSize: 12, fontWeight: 700, color: inkSoft, marginBottom: 6 }}>Max Requests Per Minute</label>
                        <input className="prime-input" type="number" value={rateLimit} onChange={e => setRateLimit(parseInt(e.target.value) || 120)} style={{
                            width: '100%', padding: '9px 12px', borderRadius: 9, border: `1.4px solid ${hairline}`, fontSize: 13.5, color: ink, background: paper, outline: 'none'
                        }} />
                    </div>
                    <div>
                        <label className="prime-label" style={{ display: 'block', fontSize: 12, fontWeight: 700, color: inkSoft, marginBottom: 6 }}>Current Usage (this window)</label>
                        <div style={{ width: '100%', background: t[50], borderRadius: 12, height: 12, marginTop: 8 }}>
                            <div style={{ background: `linear-gradient(90deg, ${t[500]}, ${t[600]})`, height: 12, borderRadius: 12, transition: 'width .3s', width: `${Math.min(usagePct, 100)}%` }} />
                        </div>
                        <p style={{ fontSize: 12, color: inkSoft, marginTop: 4 }}>{currentUsage} of {rateLimit} requests used ({usagePct.toFixed(0)}%)</p>
                    </div>
                </div>
            </div>

            {endpoints.length === 0 ? (
                <div style={{ textAlign: 'center', padding: 40, color: inkSoft }}>
                    <Activity size={40} style={{ margin: '0 auto 12px', color: hairline }} />
                    <p style={{ fontWeight: 600 }}>No API activity recorded yet</p>
                    <p style={{ fontSize: 13, marginTop: 4 }}>Endpoint usage data will appear here as requests are made.</p>
                </div>
            ) : (
                <div className="prime-card" style={{ background: paper, borderRadius: 14, border: `1.4px solid ${hairline}`, overflow: 'hidden' }}>
                    <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
                        <thead>
                            <tr style={{ borderBottom: `1.4px solid ${hairline}`, background: t[50] }}>
                                {['Endpoint', 'Method', 'Calls (24h)', 'Avg Latency', 'Error Rate', 'Last Called'].map(h => (
                                    <th key={h} className="prime-table-header" style={{ textAlign: h === 'Endpoint' || h === 'Method' ? 'left' : 'right', padding: '10px 14px', fontSize: 11, fontWeight: 700, color: inkSoft, textTransform: 'uppercase', letterSpacing: 0.5 }}>{h}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {endpoints.map(e => (
                                <tr key={e.path} className="prime-table-cell" style={{ borderBottom: `1px solid ${hairline}`, transition: 'all .15s ease' }}
                                    onMouseEnter={e2 => { e2.currentTarget.style.background = t[50]; }}
                                    onMouseLeave={e2 => { e2.currentTarget.style.background = 'transparent'; }}
                                >
                                    <td style={{ padding: '10px 14px', fontFamily: "'JetBrains Mono', monospace", fontSize: 12 }}>{e.path}</td>
                                    <td style={{ padding: '10px 14px' }}>
                                        <span style={{ padding: '2px 8px', borderRadius: 4, fontSize: 10, fontFamily: "'JetBrains Mono', monospace", background: e.method === 'GET' ? t[100] : '#dbeafe', color: e.method === 'GET' ? t[700] : '#1e40af' }}>{e.method}</span>
                                    </td>
                                    <td style={{ padding: '10px 14px', textAlign: 'right' }}>{e.calls24h}</td>
                                    <td style={{ padding: '10px 14px', textAlign: 'right' }}>{e.avgLatency}ms</td>
                                    <td style={{ padding: '10px 14px', textAlign: 'right', color: e.errorRate > 5 ? danger : ink }}>{e.errorRate}%</td>
                                    <td style={{ padding: '10px 14px', textAlign: 'right', fontSize: 12, color: inkSoft }}>{e.lastCalled ? new Date(e.lastCalled).toLocaleString() : '—'}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
};

export default APIUsageDashboard;
