import React, { useState } from 'react';
import { Database, Play, AlertTriangle, CheckCircle, XCircle, SkipForward, RefreshCw, Download } from 'lucide-react';
import { legacyMigrationService, type MigrationSummary } from '../../services/legacyMigrationService';
import { ConfirmDialog, ConfirmDialogType } from '../../components/ConfirmDialog';

const t = { 50: '#eef7f6', 100: '#d3ece9', 200: '#a6d9d3', 500: '#1f8577', 600: '#146b60', 700: '#0f544c', 800: '#0b3e39' };
const amber = { 100: '#fbead0', 500: '#d99a3f' };
const paper = '#FEFDFB', ink = '#23282A', inkSoft = '#5c6567', hairline = '#e4ddd1', danger = '#b5493f';

const LegacyMigrationPage: React.FC = () => {
    const [running, setRunning] = useState(false);
    const [summary, setSummary] = useState<MigrationSummary | null>(null);
    const [progress, setProgress] = useState<{ current: number; total: number; percent: number; currentItem: string } | null>(null);
    const [confirmState, setConfirmState] = useState<{ open: boolean; title: string; message: string; confirmText?: string; type?: ConfirmDialogType; onConfirm?: () => void }>({ open: false, title: '', message: '' });

    const handleRun = async () => {
        setConfirmState({
            open: true, title: 'Run Legacy Migration',
            message: 'This will scan all inventory items and populate productType, inventoryRole, and Variant fields from legacy type data.\n\nItems already migrated will be skipped.\n\nContinue?',
            type: 'warning', confirmText: 'Continue',
            onConfirm: async () => {
                setRunning(true); setSummary(null); setProgress({ current: 0, total: 0, percent: 0, currentItem: 'Starting...' });
                try {
                    const result = await legacyMigrationService.migrateLegacyTypes((p) => { setProgress(p); });
                    setSummary(result);
                } catch (err) {
                    setSummary({ totalItems: 0, processed: 0, errors: 1, skipped: 0, details: [{ itemId: '', itemName: '', action: 'error', error: err instanceof Error ? err.message : 'Migration failed' }] });
                } finally { setRunning(false); setProgress(null); }
            }
        });
    };

    const handleExport = () => {
        if (!summary) return;
        const csv = [['Item ID', 'Item Name', 'Action', 'Product Type', 'Inventory Role', 'Resource Subtype', 'Variant Created', 'Error'].join(','), ...summary.details.map(d => [d.itemId, `"${d.itemName}"`, d.action, d.productType || '', d.inventoryRole || '', d.resourceSubtype || '', d.variantCreated ? 'Yes' : '', d.error || ''].join(','))].join('\n');
        const blob = new Blob([csv], { type: 'text/csv' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `legacy-migration-${new Date().toISOString().split('T')[0]}.csv`; a.click(); URL.revokeObjectURL(url);
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: paper, borderRadius: 14, border: `1.4px solid ${hairline}`, overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 24px', borderBottom: `1.4px solid ${hairline}` }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ padding: 8, background: amber[100], color: amber[500], borderRadius: 8 }}><Database size={24} /></div>
                    <div>
                        <h2 style={{ fontSize: 20, fontWeight: 700, color: ink, margin: 0 }}>Legacy Type Migration</h2>
                        <p style={{ fontSize: 13, color: inkSoft, margin: '2px 0 0' }}>Populate productType, inventoryRole, and Variant data from legacy Item records</p>
                    </div>
                </div>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: 24 }}>
                <div style={{ maxWidth: 640, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 24 }}>
                    <div style={{ background: t[50], borderRadius: 14, padding: 20, border: `1.4px solid ${hairline}` }}>
                        <h3 style={{ fontSize: 16, fontWeight: 700, color: ink, margin: '0 0 16px' }}>Migration Rules</h3>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, fontSize: 13 }}>
                            {[
                                { badge: 'RM', bg: '#dbeafe', color: '#1e40af', text: 'Raw Material', result: 'productType: INVENTORY, inventoryRole: internal, resourceSubtype: raw_material' },
                                { badge: 'M', bg: '#f3e8ff', color: '#6b21a8', text: 'Material', result: 'productType: INVENTORY, inventoryRole: internal, resourceSubtype: raw_material' },
                                { badge: 'S', bg: t[100], color: t[700], text: 'Stationery', result: 'productType: INVENTORY, inventoryRole: both' },
                                { badge: 'P', bg: '#e0e7ff', color: '#3730a3', text: 'Product', result: 'productType: MANUFACTURED, inventoryRole: sellable' },
                                { badge: 'SV', bg: '#fce7f3', color: '#9d174d', text: 'Service', result: 'productType: SERVICE, inventoryRole: sellable' },
                            ].map((r, i) => (
                                <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                                    <div style={{ width: 28, height: 28, borderRadius: 8, background: r.bg, color: r.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, flexShrink: 0 }}>{r.badge}</div>
                                    <div><span style={{ fontWeight: 700, color: ink }}>{r.text}</span> → <span style={{ color: inkSoft }}>{r.result}</span></div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {!running && !summary && (
                        <button className="prime-btn" onClick={handleRun} style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, padding: '14px 24px', background: amber[500], color: '#fff', borderRadius: 14, border: 'none', fontSize: 14, fontWeight: 700, cursor: 'pointer', boxShadow: `0 6px 20px -6px rgba(217,154,63,.5)`, transition: 'all .15s ease' }}
                            onMouseEnter={e => { e.currentTarget.style.background = '#c0842b'; }}
                            onMouseLeave={e => { e.currentTarget.style.background = amber[500]; }}
                        ><Play size={20} /> Run Migration</button>
                    )}

                    {running && progress && (
                        <div style={{ background: t[50], borderRadius: 14, padding: 20, border: `1.4px solid ${hairline}`, textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 16 }}>
                            <RefreshCw size={32} style={{ margin: '0 auto', color: amber[500] }} className="animate-spin" />
                            <div><p style={{ fontWeight: 700, color: ink, margin: 0 }}>Migrating...</p><p style={{ fontSize: 13, color: inkSoft, marginTop: 4 }}>{progress.currentItem}</p></div>
                            <div style={{ width: '100%', background: hairline, height: 8, borderRadius: 20, overflow: 'hidden' }}>
                                <div style={{ height: '100%', background: amber[500], borderRadius: 20, transition: 'width .3s', width: `${progress.percent}%` }} />
                            </div>
                            <p style={{ fontSize: 12, color: inkSoft }}>{progress.current} / {progress.total} items ({progress.percent}%)</p>
                        </div>
                    )}

                    {summary && !running && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 12 }}>
                                {[
                                    { label: 'Migrated', value: summary.processed, color: t[500], bg: t[100], icon: <CheckCircle size={20} /> },
                                    { label: 'Skipped', value: summary.skipped, color: inkSoft, bg: hairline, icon: <SkipForward size={20} /> },
                                    { label: 'Errors', value: summary.errors, color: danger, bg: '#fef0ee', icon: <XCircle size={20} /> },
                                    { label: 'Total Items', value: summary.totalItems, color: '#6366f1', bg: '#eef2ff', icon: <Database size={20} /> },
                                ].map((c, i) => (
                                    <div key={i} style={{ background: c.bg, borderRadius: 14, padding: 14, textAlign: 'center', border: `1px solid ${hairline}` }}>
                                        <div style={{ color: c.color, marginBottom: 4 }}>{c.icon}</div>
                                        <p style={{ fontSize: 22, fontWeight: 800, color: c.color, margin: 0 }}>{c.value}</p>
                                        <p style={{ fontSize: 10, fontWeight: 700, color: c.color, textTransform: 'uppercase', letterSpacing: 0.5 }}>{c.label}</p>
                                    </div>
                                ))}
                            </div>
                            {summary.errors > 0 && (
                                <div style={{ background: '#fef0ee', borderRadius: 14, padding: 14, border: `1px solid #fecaca` }}>
                                    <h4 style={{ fontSize: 13, fontWeight: 700, color: danger, margin: '0 0 8px', display: 'flex', alignItems: 'center', gap: 8 }}><AlertTriangle size={16} /> Errors</h4>
                                    <div style={{ maxHeight: 120, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
                                        {summary.details.filter(d => d.action === 'error').map((d, i) => (<p key={i} style={{ fontSize: 12, color: danger, margin: 0 }}>{d.itemName}: {d.error}</p>))}
                                    </div>
                                </div>
                            )}
                            <div style={{ display: 'flex', gap: 12 }}>
                                <button className="prime-btn" onClick={handleRun} style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '12px 20px', background: amber[500], color: '#fff', borderRadius: 14, border: 'none', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}><RefreshCw size={16} /> Run Again</button>
                                <button className="prime-btn-secondary" onClick={handleExport} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '12px 20px', background: t[50], color: ink, borderRadius: 14, border: `1.4px solid ${hairline}`, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}><Download size={16} /> Export CSV</button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
            <ConfirmDialog
                open={confirmState.open}
                onOpenChange={(open) => !open && setConfirmState(c => ({ ...c, open: false }))}
                onConfirm={() => { confirmState.onConfirm?.(); setConfirmState(c => ({ ...c, open: false })); }}
                onCancel={() => setConfirmState(c => ({ ...c, open: false }))}
                title={confirmState.title}
                message={confirmState.message}
                confirmText={confirmState.confirmText}
                type={confirmState.type || 'warning'}
            />
        </div>
    );
};

export default LegacyMigrationPage;
