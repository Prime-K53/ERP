import React, { useState, useMemo } from 'react';
import { Warehouse, Plus, Edit3, Trash2, MapPin, Building2, X, Loader2, Check } from 'lucide-react';
import { useInventory } from '../../context/InventoryContext';
import { useAuth } from '../../context/AuthContext';
import { useConfirmDialog, ConfirmDialog, ConfirmDialogType } from '../../components/ConfirmDialog';
import type { Warehouse as WarehouseType } from '../../types';

const t = { 50: '#eef7f6', 100: '#d3ece9', 200: '#a6d9d3', 500: '#1f8577', 600: '#146b60', 700: '#0f544c', 800: '#0b3e39' };
const amber = { 100: '#fbead0', 500: '#d99a3f' };
const paper = '#FEFDFB', ink = '#23282A', inkSoft = '#5c6567', hairline = '#e4ddd1', danger = '#b5493f';

const WAREHOUSE_TYPES = ['Physical', 'Store', 'Virtual'] as const;
interface WarehouseForm { name: string; type: string; location: string; code: string; }
const EMPTY_FORM: WarehouseForm = { name: '', type: 'Physical', location: '', code: '' };

export const WarehousePage: React.FC = () => {
    const { warehouses, addWarehouse, deleteWarehouse } = useInventory();
    const { notify } = useAuth();
    const [modalOpen, setModalOpen] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [form, setForm] = useState<WarehouseForm>(EMPTY_FORM);
    const [submitting, setSubmitting] = useState(false);
    const [search, setSearch] = useState('');
    const [confirmState, setConfirmState] = useState<{ open: boolean; title: string; message: string; confirmText?: string; type?: ConfirmDialogType; onConfirm?: () => void }>({ open: false, title: '', message: '' });

    const filtered = useMemo(() => {
        if (!search.trim()) return warehouses;
        const q = search.toLowerCase();
        return warehouses.filter((w: WarehouseType) => (w.name || '').toLowerCase().includes(q) || (w.location || '').toLowerCase().includes(q) || (w.code || '').toLowerCase().includes(q));
    }, [warehouses, search]);

    const openCreate = () => { setEditingId(null); setForm(EMPTY_FORM); setModalOpen(true); };
    const openEdit = (wh: WarehouseType) => { setEditingId(wh.id); setForm({ name: wh.name || '', type: wh.type || 'Physical', location: wh.location || '', code: wh.code || '' }); setModalOpen(true); };

    const handleSave = async () => {
        if (!form.name.trim()) { notify('Warehouse name is required', 'error'); return; }
        setSubmitting(true);
        try {
            const warehouse: WarehouseType = { id: editingId || `WH-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 5).toUpperCase()}`, name: form.name.trim(), type: form.type, location: form.location.trim(), code: form.code.trim() || undefined };
            await addWarehouse(warehouse);
            notify(editingId ? 'Warehouse updated' : 'Warehouse created', 'success');
            setModalOpen(false);
        } catch (err: any) { notify(err?.message || 'Failed to save warehouse', 'error'); }
        finally { setSubmitting(false); }
    };

    const handleDelete = async (wh: WarehouseType) => {
        setConfirmState({ open: true, title: 'Delete Warehouse', message: `Delete warehouse "${wh.name}"? This cannot be undone.`, type: 'danger', confirmText: 'Delete', onConfirm: async () => { try { await deleteWarehouse(wh.id); notify('Warehouse deleted', 'success'); } catch (err: any) { notify(err?.message || 'Failed to delete warehouse', 'error'); } } });
    };

    const inputStyle: React.CSSProperties = {
        width: '100%', fontFamily: "'Inter', sans-serif", fontSize: 13.5,
        color: ink, background: paper, border: `1.4px solid ${hairline}`, borderRadius: 9,
        padding: '9px 12px', outline: 'none', transition: 'border-color .15s ease'
    };

    return (
        <div style={{ height: '100%', display: 'flex', flexDirection: 'column', padding: 24, background: t[50] }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ width: 40, height: 40, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', background: t[100], color: t[500] }}><Warehouse size={20} /></div>
                    <div>
                        <h1 style={{ fontSize: 20, fontWeight: 700, color: ink, margin: 0 }}>Warehouses</h1>
                        <p style={{ fontSize: 12, fontWeight: 600, color: inkSoft, margin: 0 }}>{warehouses.length} location{warehouses.length !== 1 ? 's' : ''}</p>
                    </div>
                </div>
                <button className="prime-btn" onClick={openCreate} style={{ padding: '8px 16px', borderRadius: 9, background: t[500], color: '#fff', border: 'none', fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', transition: 'all .15s ease' }}
                    onMouseEnter={e => { e.currentTarget.style.background = t[700]; }}
                    onMouseLeave={e => { e.currentTarget.style.background = t[500]; }}
                ><Plus size={16} /> Add Warehouse</button>
            </div>

            <input className="prime-input" type="text" placeholder="Search warehouses..." value={search} onChange={e => setSearch(e.target.value)} style={{ ...inputStyle, marginBottom: 16 }} />

            <div className="prime-card" style={{ flex: 1, overflowY: 'auto', borderRadius: 12, border: `1.4px solid ${hairline}`, background: paper }}>
                <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
                    <thead>
                        <tr style={{ background: t[50], borderBottom: `1.4px solid ${hairline}` }}>
                            {['Name', 'Type', 'Location', 'Code', 'Actions'].map(h => (
                                <th key={h} className="prime-table-header" style={{ textAlign: h === 'Actions' ? 'right' : 'left', padding: '10px 16px', fontSize: 11, fontWeight: 700, color: inkSoft, textTransform: 'uppercase', letterSpacing: 0.5 }}>{h}</th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {filtered.length === 0 ? (
                            <tr><td colSpan={5} style={{ padding: '40px 16px', textAlign: 'center', color: inkSoft, fontSize: 12 }}>{warehouses.length === 0 ? 'No warehouses found. Create one to get started.' : 'No matches'}</td></tr>
                        ) : filtered.map((wh: WarehouseType) => (
                            <tr key={wh.id} className="prime-table-cell" style={{ borderTop: `1.4px solid ${hairline}`, transition: 'all .15s ease' }}
                                onMouseEnter={e => { e.currentTarget.style.background = t[50]; }}
                                onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                            >
                                <td style={{ padding: '10px 16px', fontWeight: 600, color: ink }}>{wh.name}</td>
                                <td style={{ padding: '10px 16px' }}>
                                    <span style={{
                                        display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 10px',
                                        borderRadius: 6, fontSize: 12, fontWeight: 600,
                                        background: wh.type === 'Virtual' ? '#f0f0f5' : wh.type === 'Store' ? amber[100] : t[100],
                                        color: wh.type === 'Virtual' ? '#6b6b9c' : wh.type === 'Store' ? '#92400e' : t[700]
                                    }}><Building2 size={12} /> {wh.type}</span>
                                </td>
                                <td style={{ padding: '10px 16px' }}>
                                    <span style={{ display: 'flex', alignItems: 'center', gap: 6, color: inkSoft }}><MapPin size={13} color={inkSoft} />{wh.location || '-'}</span>
                                </td>
                                <td style={{ padding: '10px 16px', color: inkSoft, fontSize: 12 }}>{wh.code || '-'}</td>
                                <td style={{ padding: '10px 16px', textAlign: 'right' }}>
                                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 4 }}>
                                        <button className="prime-btn-secondary" onClick={() => openEdit(wh)} style={{ padding: 6, borderRadius: 6, border: 'none', background: 'transparent', color: inkSoft, cursor: 'pointer' }}><Edit3 size={14} /></button>
                                        <button className="prime-btn-secondary" onClick={() => handleDelete(wh)} style={{ padding: 6, borderRadius: 6, border: 'none', background: 'transparent', color: danger, cursor: 'pointer' }}><Trash2 size={14} /></button>
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {modalOpen && (
                <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, background: 'rgba(15,23,42,0.6)' }}>
                    <div className="prime-card" style={{ background: paper, borderRadius: 16, width: '100%', maxWidth: 440, overflow: 'hidden' }}>
                        <div style={{ padding: '16px 20px', borderBottom: `1.4px solid ${hairline}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                <div style={{ width: 34, height: 34, borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center', background: t[100], color: t[500] }}>
                                    {editingId ? <Edit3 size={18} /> : <Plus size={18} />}
                                </div>
                                <div>
                                    <h2 style={{ fontSize: 16, fontWeight: 700, color: ink, margin: 0 }}>{editingId ? 'Edit Warehouse' : 'Add Warehouse'}</h2>
                                    <p style={{ fontSize: 12, color: inkSoft, margin: 0 }}>{editingId ? 'Update warehouse details' : 'Create a new storage location'}</p>
                                </div>
                            </div>
                            <button className="prime-btn-secondary" onClick={() => setModalOpen(false)} style={{ background: 'none', border: 'none', color: inkSoft, cursor: 'pointer' }}><X size={20} /></button>
                        </div>
                        <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
                            {([{ key: 'name', label: 'Name *', ph: 'e.g. Main Warehouse' }, { key: 'type', label: 'Type', type: 'select' }, { key: 'location', label: 'Location', ph: 'e.g. Lilongwe' }, { key: 'code', label: 'Code', ph: 'e.g. WH-001' }] as const).map(f => (
                                <div key={f.key}>
                                    <label className="prime-label" style={{ display: 'block', fontSize: 12, fontWeight: 700, color: inkSoft, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>{f.label}</label>
                                    {f.type === 'select' ? (
                                        <select className="prime-select" value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))} style={{ ...inputStyle, appearance: 'none', cursor: 'pointer' }}>
                                            {WAREHOUSE_TYPES.map(t => (<option key={t} value={t}>{t}</option>))}
                                        </select>
                                    ) : (
                                        <input className="prime-input" type="text" value={form[f.key as keyof WarehouseForm]} onChange={e => setForm(f2 => ({ ...f2, [f.key]: e.target.value }))} placeholder={f.ph} style={inputStyle} />
                                    )}
                                </div>
                            ))}
                            <div style={{ display: 'flex', gap: 12, paddingTop: 8 }}>
                                <button className="prime-btn-secondary" onClick={() => setModalOpen(false)} style={{ flex: 1, padding: '9px 16px', borderRadius: 9, border: `1.4px solid ${hairline}`, background: paper, color: inkSoft, fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
                                <button className="prime-btn" onClick={handleSave} disabled={submitting || !form.name.trim()} style={{
                                    flex: 1, padding: '9px 16px', borderRadius: 9, border: 'none', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                                    background: t[500], color: '#fff', opacity: submitting || !form.name.trim() ? 0.6 : 1, transition: 'all .15s ease'
                                }}
                                    onMouseEnter={e => { if (!submitting && form.name.trim()) e.currentTarget.style.background = t[700]; }}
                                    onMouseLeave={e => { if (!submitting && form.name.trim()) e.currentTarget.style.background = t[500]; }}
                                >{submitting ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}{editingId ? 'Update' : 'Create'}</button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
            <ConfirmDialog
                open={confirmState.open}
                onOpenChange={(open) => !open && setConfirmState(c => ({ ...c, open: false }))}
                onConfirm={() => { confirmState.onConfirm?.(); setConfirmState(c => ({ ...c, open: false })); }}
                onCancel={() => setConfirmState(c => ({ ...c, open: false }))}
                title={confirmState.title}
                message={confirmState.message}
                confirmText={confirmState.confirmText}
                type={confirmState.type || 'danger'}
            />
        </div>
    );
};

export default WarehousePage;
