import React, { useState } from 'react';
import { logger } from '@/services/logger';
import { useVatStore } from '../../stores/vatStore';
import { useAuth } from '../../context/AuthContext';
import { format, parseISO, startOfMonth, endOfMonth } from 'date-fns';
import { currencyService } from '../../services/currencyService';
import { FileText, Download, CheckCircle, AlertCircle, Plus, Calendar } from 'lucide-react';
import { VatReturn } from '../../types';
import { ConfirmDialog, ConfirmDialogType } from '../../components/ConfirmDialog';

const t = { 50: '#eef7f6', 100: '#d3ece9', 200: '#a6d9d3', 300: '#72c0b7', 500: '#1f8577', 600: '#146b60', 700: '#0f544c', 800: '#0b3e39' };
const amber = { 100: '#fbead0', 500: '#d99a3f' };
const paper = '#FEFDFB', ink = '#23282A', inkSoft = '#5c6567', hairline = '#e4ddd1', danger = '#b5493f';

export const VatReports: React.FC = () => {
    const { returns, generateReturn, fileReturn, isLoading } = useVatStore();
    const { companyConfig } = useAuth();
    const currency = currencyService.getCurrency(currencyService.getBaseCurrency())?.symbol || '$';
    const [isGenerating, setIsGenerating] = useState(false);
    const [selectedReturn, setSelectedReturn] = useState<VatReturn | null>(null);
    const [period, setPeriod] = useState({ month: new Date().getMonth(), year: new Date().getFullYear() });
    const [confirmState, setConfirmState] = useState<{ open: boolean; title: string; message: string; confirmText?: string; type?: ConfirmDialogType; onConfirm?: () => void }>({ open: false, title: '', message: '' });

    const handleGenerate = async () => {
        setIsGenerating(true);
        try {
            const date = new Date(period.year, period.month, 1);
            await generateReturn(startOfMonth(date).toISOString(), endOfMonth(date).toISOString());
        } catch (error) {
            logger.error("Failed to generate return", error);
        } finally { setIsGenerating(false); }
    };

    const handleFileReturn = async (returnId: string) => {
        setConfirmState({ open: true, title: 'File VAT Return', message: 'Are you sure you want to file this return? This action cannot be undone.', type: 'warning', confirmText: 'File Return', onConfirm: async () => { await fileReturn(returnId); } });
    };

    const handleMarkPaid = async (returnId: string) => {
        const date = prompt('Enter payment date (YYYY-MM-DD):', new Date().toISOString().split('T')[0]);
        if (date) { await fileReturn(returnId, date); }
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h2 style={{ fontSize: 22, fontWeight: 700, color: ink, margin: 0 }}>VAT returns</h2>
                <div className="prime-card" style={{ display: 'flex', alignItems: 'center', gap: 8, background: paper, padding: 8, borderRadius: 12, border: `1.4px solid ${hairline}` }}>
                    <select className="prime-select" style={{
                        border: 'none', background: 'transparent', fontSize: 13, fontWeight: 600, color: ink, outline: 'none', cursor: 'pointer', padding: '4px 8px'
                    }} value={period.month} onChange={(e) => setPeriod(p => ({ ...p, month: parseInt(e.target.value) }))}>
                        {Array.from({ length: 12 }).map((_, i) => (<option key={i} value={i}>{format(new Date(2024, i, 1), 'MMMM')}</option>))}
                    </select>
                    <select className="prime-select" style={{
                        border: 'none', background: 'transparent', fontSize: 13, fontWeight: 600, color: ink, outline: 'none', cursor: 'pointer', padding: '4px 8px'
                    }} value={period.year} onChange={(e) => setPeriod(p => ({ ...p, year: parseInt(e.target.value) }))}>
                        {[0, 1, 2].map(i => (<option key={i} value={new Date().getFullYear() - i}>{new Date().getFullYear() - i}</option>))}
                    </select>
                    <button className="prime-btn" onClick={handleGenerate} disabled={isGenerating}
                        style={{ background: t[500], color: '#fff', border: 'none', padding: '6px 14px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, transition: 'all .15s ease' }}
                        onMouseEnter={e => { e.currentTarget.style.background = t[700]; }}
                        onMouseLeave={e => { e.currentTarget.style.background = t[500]; }}
                    ><Plus size={16} /> Generate return</button>
                </div>
            </div>

            <div className="prime-card" style={{ background: paper, borderRadius: 14, border: `1.4px solid ${hairline}`, overflow: 'hidden' }}>
                <table className="prime-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                        <tr style={{ background: t[50] }}>
                            <th className="prime-table-header" style={{ padding: '12px 20px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: inkSoft, textTransform: 'uppercase', letterSpacing: 0.5 }}>Period</th>
                            <th className="prime-table-header" style={{ padding: '12px 20px', textAlign: 'right', fontSize: 11, fontWeight: 700, color: inkSoft, textTransform: 'uppercase', letterSpacing: 0.5 }}>Total output</th>
                            <th className="prime-table-header" style={{ padding: '12px 20px', textAlign: 'right', fontSize: 11, fontWeight: 700, color: inkSoft, textTransform: 'uppercase', letterSpacing: 0.5 }}>Total input</th>
                            <th className="prime-table-header" style={{ padding: '12px 20px', textAlign: 'right', fontSize: 11, fontWeight: 700, color: inkSoft, textTransform: 'uppercase', letterSpacing: 0.5 }}>Net payable</th>
                            <th className="prime-table-header" style={{ padding: '12px 20px', textAlign: 'center', fontSize: 11, fontWeight: 700, color: inkSoft, textTransform: 'uppercase', letterSpacing: 0.5 }}>Status</th>
                            <th className="prime-table-header" style={{ padding: '12px 20px', textAlign: 'right', fontSize: 11, fontWeight: 700, color: inkSoft, textTransform: 'uppercase', letterSpacing: 0.5 }}>Actions</th>
                        </tr>
                    </thead>
                    <tbody style={{ borderTop: `1px solid ${hairline}` }}>
                        {returns.length === 0 ? (
                            <tr><td colSpan={6} style={{ padding: '40px 20px', textAlign: 'center', color: inkSoft }}>No VAT returns found. Generate one to get started.</td></tr>
                        ) : returns.map(ret => (
                            <tr key={ret.id} style={{ borderBottom: `1px solid ${hairline}`, transition: 'all .15s ease' }}
                                onMouseEnter={e => { e.currentTarget.style.background = t[50]; }}
                                onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                            >
                                <td className="prime-table-cell" style={{ padding: '14px 20px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                        <Calendar size={16} color={inkSoft} />
                                        <span style={{ fontWeight: 600, color: ink }}>{format(parseISO(ret.periodStart), 'MMM yyyy')}</span>
                                    </div>
                                    <div style={{ fontSize: 12, color: inkSoft, marginLeft: 24, marginTop: 2 }}>
                                        {format(parseISO(ret.periodStart), 'dd MMM')} - {format(parseISO(ret.periodEnd), 'dd MMM')}
                                    </div>
                                </td>
                                <td className="prime-table-cell" style={{ padding: '14px 20px', textAlign: 'right', color: ink, fontVariantNumeric: 'tabular-nums' }}>{currency} {ret.totalOutputTax.toLocaleString()}</td>
                                <td className="prime-table-cell" style={{ padding: '14px 20px', textAlign: 'right', color: ink, fontVariantNumeric: 'tabular-nums' }}>{currency} {ret.totalInputTax.toLocaleString()}</td>
                                <td className="prime-table-cell" style={{ padding: '14px 20px', textAlign: 'right', fontWeight: 700, color: ret.netPayable >= 0 ? ink : t[500], fontVariantNumeric: 'tabular-nums' }}>
                                    {currency} {Math.abs(ret.netPayable).toLocaleString()}{ret.netPayable < 0 && ' (CR)'}
                                </td>
                                <td className="prime-table-cell" style={{ padding: '14px 20px', textAlign: 'center' }}>
                                    <span style={{
                                        display: 'inline-flex', alignItems: 'center', padding: '4px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600,
                                        background: ret.status === 'Paid' ? t[100] : ret.status === 'Filed' ? '#dbeafe' : amber[100],
                                        color: ret.status === 'Paid' ? t[800] : ret.status === 'Filed' ? '#1e40af' : '#92400e'
                                    }}>{ret.status}</span>
                                </td>
                                <td className="prime-table-cell" style={{ padding: '14px 20px', textAlign: 'right' }}>
                                    {ret.status === 'Draft' && <button className="prime-btn-secondary" onClick={() => handleFileReturn(ret.id)} style={{ background: 'none', border: 'none', color: t[500], fontWeight: 600, cursor: 'pointer', fontSize: 13, marginRight: 8 }}>File</button>}
                                    {ret.status === 'Filed' && <button className="prime-btn-secondary" onClick={() => handleMarkPaid(ret.id)} style={{ background: 'none', border: 'none', color: t[500], fontWeight: 600, cursor: 'pointer', fontSize: 13, marginRight: 8 }}>Mark paid</button>}
                                    <button className="prime-btn-secondary" style={{ background: 'none', border: 'none', color: inkSoft, cursor: 'pointer' }}><Download size={18} /></button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
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
