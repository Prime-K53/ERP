import React, { useState, useEffect } from 'react';
import { logger } from '@/services/logger';
import { TrendingUp, Plus, Trash2, Edit2, Save, X, Percent, DollarSign, BarChart3, Clock } from 'lucide-react';
import { dbService } from '../../services/db';
import { MarketAdjustment, MarketAdjustmentTransaction } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { useInventory } from '../../context/InventoryContext';
import { useInventoryStore } from '../../stores/inventoryStore';
import { repriceMasterInventoryFromAdjustments } from '../../services/masterInventoryPricingService';
import { syncMarketAdjustmentsToBackend } from '../../services/examinationSyncService';
import { currencyService } from '../../services/currencyService';

const t = { 50: '#eef7f6', 100: '#d3ece9', 200: '#a6d9d3', 500: '#1f8577', 600: '#146b60', 700: '#0f544c', 800: '#0b3e39' };
const amber = { 100: '#fbead0', 500: '#d99a3f' };
const paper = '#FEFDFB', ink = '#23282A', inkSoft = '#5c6567', hairline = '#e4ddd1', danger = '#b5493f';

const MARKET_ADJUSTMENTS_CHANGED_EVENT = 'market-adjustments:changed';

const MarketAdjustments: React.FC = () => {
    const { notify, companyConfig } = useAuth();
    const { refreshMarketAdjustments } = useInventory();
    const currency = companyConfig?.currencySymbol || currencyService.getCurrency(currencyService.getBaseCurrency())?.symbol || '$';
    const refreshInventory = useInventoryStore(state => state.fetchInventory);
    const [adjustments, setAdjustments] = useState<MarketAdjustment[]>([]);
    const [adjustmentStats, setAdjustmentStats] = useState<Map<string, { totalApplied: number; applicationCount: number }>>(new Map());
    const [loading, setLoading] = useState(true);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [showForm, setShowForm] = useState(false);
    const [selectedAdjustment, setSelectedAdjustment] = useState<MarketAdjustment | null>(null);
    const [transactionHistory, setTransactionHistory] = useState<MarketAdjustmentTransaction[]>([]);
    const [showHistory, setShowHistory] = useState(false);
    const [formData, setFormData] = useState<Partial<MarketAdjustment>>({ name: '', type: 'PERCENTAGE', value: 0, description: '', category: 'general', adjustmentCategory: 'Custom', displayName: '', sortOrder: 0, active: true });

    const broadcastAdjustmentsChanged = (changeType: 'created' | 'updated' | 'deleted' | 'toggled', adjustmentId?: string) => {
        if (typeof window === 'undefined') return;
        window.dispatchEvent(new CustomEvent(MARKET_ADJUSTMENTS_CHANGED_EVENT, { detail: { changeType, adjustmentId: adjustmentId || null, timestamp: new Date().toISOString() } }));
    };

    useEffect(() => {
        loadAdjustments();
        const onDataChanged = (e: Event) => { const detail = (e as CustomEvent).detail; if (!detail || !detail.stores) return; if (detail.stores.includes('marketAdjustments') || detail.stores.includes('*')) loadAdjustments(); };
        window.addEventListener('primeerp:data-changed', onDataChanged);
        return () => window.removeEventListener('primeerp:data-changed', onDataChanged);
    }, []);

    const loadAdjustments = async () => {
        try {
            const data = await dbService.getAll<MarketAdjustment>('marketAdjustments');
            setAdjustments(data);
            const transactions = await dbService.getAll<MarketAdjustmentTransaction>('marketAdjustmentTransactions');
            const statsMap = new Map<string, { totalApplied: number; applicationCount: number }>();
            transactions.forEach(tx => { const e = statsMap.get(tx.adjustmentId) || { totalApplied: 0, applicationCount: 0 }; statsMap.set(tx.adjustmentId, { totalApplied: e.totalApplied + tx.calculatedAmount, applicationCount: e.applicationCount + 1 }); });
            setAdjustmentStats(statsMap);
        } catch (error) { logger.error('Error loading market adjustments:', error); }
        finally { setLoading(false); }
    };

    const loadTransactionHistory = async (adjustmentId: string) => {
        try {
            const transactions = await dbService.getAll<MarketAdjustmentTransaction>('marketAdjustmentTransactions');
            setTransactionHistory(transactions.filter(tx => tx.adjustmentId === adjustmentId).sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()));
        } catch (error) { logger.error('Error loading transaction history:', error); setTransactionHistory([]); }
    };

    const generateId = () => 'adj_' + Date.now().toString(36) + Math.random().toString(36).substr(2, 9);

    const repriceMasterInventory = async () => {
        try {
            const result = await repriceMasterInventoryFromAdjustments();
            await refreshInventory();
            if (result.updatedItems > 0 || result.updatedVariants > 0) { const parts: string[] = []; if (result.updatedItems > 0) parts.push(`${result.updatedItems} items`); if (result.updatedVariants > 0) parts.push(`${result.updatedVariants} variants`); notify(`Master inventory repriced: ${parts.join(', ')}`, 'success'); }
            else notify('Master inventory pricing is already up to date', 'info');
        } catch (error) { logger.error('Failed to reprice master inventory after adjustment change:', error); notify('Adjustment saved but master inventory repricing failed', 'error'); }
    };

    const syncBackendAdjustments = async () => {
        try { const syncResult = await syncMarketAdjustmentsToBackend({ triggerRecalculate: true }); if (syncResult?.recalculation?.failed > 0) notify(`Adjustments synced but ${syncResult.recalculation.failed} batch recalculation(s) failed`, 'error'); }
        catch (error) { logger.error('Failed to sync market adjustments to backend examination DB:', error); notify('Adjustment change saved locally, but backend sync failed', 'error'); }
    };

    const handleSave = async () => {
        if (!formData.name || formData.value === undefined) { notify('Please fill in all required fields', 'error'); return; }
        try {
            const isEditing = Boolean(editingId);
            const adjustment: MarketAdjustment = { id: editingId || generateId(), name: formData.name, type: formData.type as 'PERCENTAGE' | 'FIXED' | 'PERCENT', value: Number(formData.value), percentage: formData.type === 'PERCENTAGE' || formData.type === 'PERCENT' || formData.type === 'percentage' ? Number(formData.value) : undefined, appliesTo: 'COST', active: formData.active ?? true, isActive: formData.active ?? true, description: formData.description, category: formData.category, displayName: formData.displayName || formData.name, adjustmentCategory: formData.adjustmentCategory, sortOrder: formData.sortOrder || 0, createdAt: editingId ? adjustments.find(a => a.id === editingId)?.createdAt : new Date().toISOString() };
            await dbService.put('marketAdjustments', adjustment);
            await repriceMasterInventory();
            await syncBackendAdjustments();
            notify(isEditing ? 'Market adjustment updated' : 'Market adjustment created', 'success');
            setEditingId(null); setShowForm(false); setFormData({ name: '', type: 'PERCENTAGE', value: 0, description: '', category: 'general', adjustmentCategory: 'Custom', displayName: '', sortOrder: 0, active: true });
            loadAdjustments();
            refreshMarketAdjustments?.();
            broadcastAdjustmentsChanged(isEditing ? 'updated' : 'created', adjustment.id);
        } catch (error) { logger.error('Error saving adjustment:', error); notify('Failed to save adjustment', 'error'); }
    };

    const handleDelete = async (id: string) => {
        if (!confirm('Are you sure you want to delete this adjustment?')) return;
        try { await dbService.delete('marketAdjustments', id); await repriceMasterInventory(); await syncBackendAdjustments(); notify('Adjustment deleted', 'success'); loadAdjustments(); refreshMarketAdjustments?.(); broadcastAdjustmentsChanged('deleted', id); }
        catch (error) { logger.error('Error deleting adjustment:', error); notify('Failed to delete adjustment', 'error'); }
    };

    const handleEdit = (adjustment: MarketAdjustment) => { setEditingId(adjustment.id); setFormData({ name: adjustment.name, type: adjustment.type as 'PERCENTAGE' | 'FIXED' | 'PERCENT', value: adjustment.value, description: adjustment.description, category: adjustment.category, displayName: adjustment.displayName || adjustment.name, adjustmentCategory: adjustment.adjustmentCategory || 'Custom', sortOrder: adjustment.sortOrder || 0, active: adjustment.active ?? adjustment.isActive }); setShowForm(true); };

    const handleViewHistory = async (adjustment: MarketAdjustment) => { setSelectedAdjustment(adjustment); await loadTransactionHistory(adjustment.id); setShowHistory(true); };

    const formatCurrency = (amount: number) => {
        const symbolToCode: Record<string, string> = { '$': 'USD', 'KES': 'KES', 'ZAR': 'ZAR', 'GBP': 'GBP', 'EUR': 'EUR', 'UGX': 'UGX', 'K': 'MWK' };
        const currencyCode = symbolToCode[currency] || currency || 'USD';
        try { return new Intl.NumberFormat('en-US', { style: 'currency', currency: currencyCode }).format(amount || 0); }
        catch { return `${currency} ${Number(amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`; }
    };

    const toggleActive = async (adjustment: MarketAdjustment) => {
        try { const currentActive = adjustment.active ?? adjustment.isActive ?? false; const updated = { ...adjustment, active: !currentActive, isActive: !currentActive }; await dbService.put('marketAdjustments', updated); await repriceMasterInventory(); await syncBackendAdjustments(); notify(`Adjustment ${updated.active ? 'activated' : 'deactivated'}`, 'success'); loadAdjustments(); refreshMarketAdjustments?.(); broadcastAdjustmentsChanged('toggled', adjustment.id); }
        catch (error) { logger.error('Error toggling adjustment:', error); notify('Failed to update adjustment', 'error'); }
    };

    const inputStyle: React.CSSProperties = { width: '100%', fontFamily: "'Inter', sans-serif", fontSize: 13.5, color: ink, background: paper, border: `1.4px solid ${hairline}`, borderRadius: 9, padding: '9px 12px', outline: 'none' };
    const selectStyle: React.CSSProperties = { ...inputStyle, appearance: 'none', backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%235c6567'/%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 12px center', paddingRight: 30, cursor: 'pointer' };

    if (loading) return <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><div style={{ width: 32, height: 32, borderRadius: '50%', border: `4px solid ${amber[100]}`, borderTopColor: amber[500] }} className="animate-spin" /></div>;

    return (
        <div style={{ height: '100%', overflow: 'auto', padding: 24, background: t[50] }}>
            <div style={{ maxWidth: 960, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 24 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                        <div style={{ padding: 12, background: amber[100], borderRadius: 12 }}><TrendingUp size={24} color={amber[500]} /></div>
                        <div>
                            <h1 style={{ fontSize: 22, fontWeight: 700, color: ink, margin: 0 }}>Market Adjustments</h1>
                            <p style={{ fontSize: 13, color: inkSoft, margin: '2px 0 0' }}>Manage cost adjustments, inflation factors, and surcharges</p>
                        </div>
                    </div>
                    <button className="prime-btn" onClick={() => { setEditingId(null); setFormData({ name: '', type: 'PERCENTAGE', value: 0, description: '', category: 'general', active: true }); setShowForm(true); }} style={{ padding: '8px 16px', background: amber[500], color: '#fff', borderRadius: 9, border: 'none', fontSize: 13, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', transition: 'all .15s ease' }}
                        onMouseEnter={e => { e.currentTarget.style.background = '#c0842b'; }}
                        onMouseLeave={e => { e.currentTarget.style.background = amber[500]; }}
                    ><Plus size={16} /> Add Adjustment</button>
                </div>

                {showForm && (
                    <div className="prime-card" style={{ background: paper, borderRadius: 14, border: `1.4px solid ${hairline}`, padding: 20 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                            <h2 style={{ fontSize: 16, fontWeight: 700, color: ink, margin: 0 }}>{editingId ? 'Edit Adjustment' : 'New Adjustment'}</h2>
                            <button className="prime-btn-secondary" onClick={() => setShowForm(false)} style={{ padding: 8, background: 'none', border: 'none', color: inkSoft, cursor: 'pointer' }}><X size={20} /></button>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                            <div>
                                <label className="prime-label" style={{ display: 'block', fontSize: 12, fontWeight: 600, color: inkSoft, marginBottom: 4 }}>Name *</label>
                                <input className="prime-input" type="text" value={formData.name || ''} onChange={e => setFormData({ ...formData, name: e.target.value })} style={inputStyle} placeholder="e.g., Inflation Adjustment 2024" />
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                                <div>
                                    <label className="prime-label" style={{ display: 'block', fontSize: 12, fontWeight: 600, color: inkSoft, marginBottom: 4 }}>Type *</label>
                                    <select className="prime-select" value={formData.type || 'PERCENTAGE'} onChange={e => setFormData({ ...formData, type: e.target.value })} style={selectStyle}>
                                        <option value="PERCENTAGE">Percentage (%)</option>
                                        <option value="FIXED">Fixed Amount ($)</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="prime-label" style={{ display: 'block', fontSize: 12, fontWeight: 600, color: inkSoft, marginBottom: 4 }}>Value *</label>
                                    <div style={{ position: 'relative' }}>
                                        {(formData.type === 'PERCENTAGE' || formData.type === 'PERCENT' || formData.type === 'percentage') ? <Percent size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: inkSoft }} /> : <DollarSign size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: inkSoft }} />}
                                        <input className="prime-input" type="number" value={formData.value || ''} onChange={e => setFormData({ ...formData, value: Number(e.target.value) })} style={{ ...inputStyle, paddingLeft: 32 }} placeholder="Enter value" />
                                    </div>
                                </div>
                            </div>
                            <div>
                                <label className="prime-label" style={{ display: 'block', fontSize: 12, fontWeight: 600, color: inkSoft, marginBottom: 4 }}>Category</label>
                                <select className="prime-select" value={formData.category || 'general'} onChange={e => setFormData({ ...formData, category: e.target.value })} style={selectStyle}>
                                    {['general', 'inflation', 'logistics', 'materials', 'labor', 'energy'].map(c => (<option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>))}
                                </select>
                            </div>
                            <div>
                                <label className="prime-label" style={{ display: 'block', fontSize: 12, fontWeight: 600, color: inkSoft, marginBottom: 4 }}>Adjustment Category</label>
                                <select className="prime-select" value={formData.adjustmentCategory || 'Custom'} onChange={e => setFormData({ ...formData, adjustmentCategory: e.target.value })} style={selectStyle}>
                                    {['Profit Margin', 'Transport/Logistics', 'Wastage Factor', 'Overhead', 'Custom'].map(c => (<option key={c} value={c}>{c}</option>))}
                                </select>
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                                <div>
                                    <label className="prime-label" style={{ display: 'block', fontSize: 12, fontWeight: 600, color: inkSoft, marginBottom: 4 }}>Display Name</label>
                                    <input className="prime-input" type="text" value={formData.displayName || ''} onChange={e => setFormData({ ...formData, displayName: e.target.value })} style={inputStyle} placeholder="Name for reports" />
                                </div>
                                <div>
                                    <label className="prime-label" style={{ display: 'block', fontSize: 12, fontWeight: 600, color: inkSoft, marginBottom: 4 }}>Sort Order</label>
                                    <input className="prime-input" type="number" value={formData.sortOrder || 0} onChange={e => setFormData({ ...formData, sortOrder: Number(e.target.value) })} style={inputStyle} placeholder="0" />
                                </div>
                            </div>
                            <div>
                                <label className="prime-label" style={{ display: 'block', fontSize: 12, fontWeight: 600, color: inkSoft, marginBottom: 4 }}>Description</label>
                                <textarea className="prime-input" value={formData.description || ''} onChange={e => setFormData({ ...formData, description: e.target.value })} style={{ ...inputStyle, resize: 'none', minHeight: 70 }} rows={3} placeholder="Optional description..." />
                            </div>
                            <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
                                <input type="checkbox" checked={formData.active ?? true} onChange={e => setFormData({ ...formData, active: e.target.checked })} style={{ width: 18, height: 18, accentColor: t[500], cursor: 'pointer' }} />
                                <span style={{ fontSize: 13, color: ink }}>Active</span>
                            </label>
                            <div style={{ display: 'flex', gap: 12 }}>
                                <button className="prime-btn" onClick={handleSave} style={{ flex: 1, padding: '9px 16px', background: amber[500], color: '#fff', borderRadius: 9, border: 'none', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, cursor: 'pointer' }}><Save size={16} /> {editingId ? 'Update' : 'Create'} Adjustment</button>
                                <button className="prime-btn-secondary" onClick={() => setShowForm(false)} style={{ padding: '9px 20px', borderRadius: 9, border: `1.4px solid ${hairline}`, background: paper, color: inkSoft, fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
                            </div>
                        </div>
                    </div>
                )}

                <div className="prime-card" style={{ background: paper, borderRadius: 14, border: `1.4px solid ${hairline}`, overflow: 'hidden' }}>
                    {adjustments.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: 40, color: inkSoft }}>
                            <TrendingUp size={64} style={{ margin: '0 auto 16px', opacity: 0.3 }} />
                            <p style={{ fontSize: 16, fontWeight: 600, color: ink, margin: 0 }}>No market adjustments yet</p>
                            <p style={{ fontSize: 13, marginTop: 4 }}>Create your first adjustment to get started</p>
                        </div>
                    ) : (
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead style={{ background: t[50], borderBottom: `1.4px solid ${hairline}` }}>
                                <tr>{['Name', 'Type', 'Value', 'Category', 'Statistics', 'Status', ''].map(h => (<th key={h} className="prime-table-header" style={{ textAlign: 'left', padding: '12px 16px', fontSize: 11, fontWeight: 700, color: inkSoft, textTransform: 'uppercase', letterSpacing: 0.5 }}>{h}</th>))}</tr>
                            </thead>
                            <tbody style={{ borderTop: `1px solid ${hairline}` }}>
                                {adjustments.map(adj => {
                                    const stats = adjustmentStats.get(adj.id) || { totalApplied: 0, applicationCount: 0 };
                                    return (
                                        <tr key={adj.id} className="prime-table-cell" style={{ borderBottom: `1px solid ${hairline}`, transition: 'all .15s ease' }}
                                            onMouseEnter={e => { e.currentTarget.style.background = t[50]; }}
                                            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                                        >
                                            <td style={{ padding: '12px 16px' }}>
                                                <div style={{ fontWeight: 600, color: ink }}>{adj.displayName || adj.name}</div>
                                                {adj.description && <div style={{ fontSize: 12, color: inkSoft }}>{adj.description}</div>}
                                                {adj.adjustmentCategory && <div style={{ fontSize: 11, color: amber[500], fontWeight: 600, marginTop: 2 }}>{adj.adjustmentCategory}</div>}
                                            </td>
                                            <td style={{ padding: '12px 16px' }}>
                                                <span style={{ padding: '3px 8px', borderRadius: 20, fontSize: 11, fontWeight: 600, background: (adj.type === 'PERCENTAGE' || adj.type === 'PERCENT' || adj.type === 'percentage') ? t[100] : '#dbeafe', color: (adj.type === 'PERCENTAGE' || adj.type === 'PERCENT' || adj.type === 'percentage') ? t[700] : '#1e40af' }}>
                                                    {(adj.type === 'PERCENTAGE' || adj.type === 'PERCENT' || adj.type === 'percentage') ? 'Percentage' : 'Fixed'}
                                                </span>
                                            </td>
                                            <td style={{ padding: '12px 16px', fontWeight: 600, color: ink }}>{(adj.type === 'PERCENTAGE' || adj.type === 'PERCENT' || adj.type === 'percentage') ? `${adj.value || adj.percentage}%` : formatCurrency(adj.value)}</td>
                                            <td style={{ padding: '12px 16px', color: inkSoft, textTransform: 'capitalize' }}>{adj.category || 'general'}</td>
                                            <td style={{ padding: '12px 16px' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: inkSoft, fontSize: 12 }}><BarChart3 size={12} /> {stats.applicationCount} applications</div>
                                                <div style={{ fontSize: 11, color: t[500], fontWeight: 600 }}>{formatCurrency(stats.totalApplied)} total</div>
                                            </td>
                                            <td style={{ padding: '12px 16px' }}>
                                                <button onClick={() => toggleActive(adj)} style={{ padding: '4px 12px', borderRadius: 20, fontSize: 11, fontWeight: 600, border: 'none', cursor: 'pointer', background: (adj.active ?? adj.isActive) ? t[100] : hairline, color: (adj.active ?? adj.isActive) ? t[700] : inkSoft, transition: 'all .15s ease' }}>
                                                    {(adj.active ?? adj.isActive) ? 'Active' : 'Inactive'}
                                                </button>
                                            </td>
                                            <td style={{ padding: '12px 16px' }}>
                                                <div style={{ display: 'flex', gap: 4 }}>
                                                    <button className="prime-btn-secondary" onClick={() => handleViewHistory(adj)} style={{ padding: 6, border: 'none', background: 'none', color: inkSoft, cursor: 'pointer' }}><Clock size={16} /></button>
                                                    <button className="prime-btn-secondary" onClick={() => handleEdit(adj)} style={{ padding: 6, border: 'none', background: 'none', color: inkSoft, cursor: 'pointer' }}><Edit2 size={16} /></button>
                                                    <button className="prime-btn-secondary" onClick={() => handleDelete(adj.id)} style={{ padding: 6, border: 'none', background: 'none', color: danger, cursor: 'pointer' }}><Trash2 size={16} /></button>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    )}
                </div>

                {showHistory && selectedAdjustment && (
                    <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}>
                        <div className="prime-card" style={{ background: paper, borderRadius: 14, maxWidth: 800, width: '100%', maxHeight: '80vh', overflow: 'hidden' }}>
                            <div style={{ padding: '16px 20px', borderBottom: `1.4px solid ${hairline}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <div>
                                    <h2 style={{ fontSize: 16, fontWeight: 700, color: ink, margin: 0 }}>Transaction History</h2>
                                    <p style={{ fontSize: 13, color: inkSoft, margin: '2px 0 0' }}>{selectedAdjustment.displayName || selectedAdjustment.name}</p>
                                </div>
                                <button className="prime-btn-secondary" onClick={() => setShowHistory(false)} style={{ padding: 8, border: 'none', background: 'none', color: inkSoft, cursor: 'pointer' }}><X size={20} /></button>
                            </div>
                            <div style={{ padding: 20, overflow: 'auto', maxHeight: '60vh' }}>
                                {transactionHistory.length === 0 ? (
                                    <div style={{ textAlign: 'center', padding: 32, color: inkSoft }}><Clock size={48} style={{ margin: '0 auto 12px', opacity: 0.3 }} /><p>No transactions yet</p></div>
                                ) : (
                                    <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
                                        <thead style={{ background: t[50] }}>
                                            <tr>{['Date', 'Sale ID', 'Item', 'Qty', 'Unit Amt', 'Total', 'Status'].map(h => (<th key={h} className="prime-table-header" style={{ textAlign: h === 'Qty' || h === 'Unit Amt' || h === 'Total' ? 'right' : 'left', padding: '8px 12px', fontSize: 11, fontWeight: 700, color: inkSoft }}>{h}</th>))}</tr>
                                        </thead>
                                        <tbody style={{ borderTop: `1px solid ${hairline}` }}>
                                            {transactionHistory.map(tx => (
                                                <tr key={tx.id} className="prime-table-cell" style={{ borderBottom: `1px solid ${hairline}` }}>
                                                    <td style={{ padding: '8px 12px', color: inkSoft }}>{new Date(tx.timestamp).toLocaleDateString()}</td>
                                                    <td style={{ padding: '8px 12px', fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: inkSoft }}>{tx.saleId}</td>
                                                    <td style={{ padding: '8px 12px', color: ink }}>{tx.itemId}</td>
                                                    <td style={{ padding: '8px 12px', textAlign: 'right', color: inkSoft }}>{tx.quantity}</td>
                                                    <td style={{ padding: '8px 12px', textAlign: 'right', color: inkSoft }}>{formatCurrency(tx.unitAmount)}</td>
                                                    <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 600, color: t[500] }}>{formatCurrency(tx.calculatedAmount)}</td>
                                                    <td style={{ padding: '8px 12px' }}><span style={{ padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 600, background: tx.status === 'Active' ? t[100] : tx.status === 'Reversed' ? '#fef0ee' : amber[100], color: tx.status === 'Active' ? t[700] : tx.status === 'Reversed' ? danger : '#92400e' }}>{tx.status}</span></td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                )}
                            </div>
                            <div style={{ padding: '12px 20px', borderTop: `1.4px solid ${hairline}`, background: t[50], display: 'flex', justifyContent: 'space-between' }}>
                                <span style={{ fontSize: 13, color: inkSoft }}>Total: <b style={{ color: ink }}>{transactionHistory.length}</b> transactions</span>
                                <span style={{ fontSize: 13, color: inkSoft }}>Total Applied: <b style={{ color: t[500] }}>{formatCurrency(transactionHistory.reduce((sum, tx) => sum + tx.calculatedAmount, 0))}</b></span>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default MarketAdjustments;
