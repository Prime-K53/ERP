import React, { useState, useRef, useEffect } from 'react';
import { CreditCard, Printer, Plus, Search, Calendar, CheckCircle, XCircle, Clock, Settings, Save, ArrowLeft, MoreVertical, Edit2, Trash2, FileText, Loader2 } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useFinance } from '../../context/FinanceContext';
import { Cheque } from '../../types';

const t = { 50: '#eef7f6', 100: '#d3ece9', 200: '#a6d9d3', 500: '#1f8577', 600: '#146b60', 700: '#0f544c', 800: '#0b3e39' };
const amber = { 100: '#fbead0', 500: '#d99a3f' };
const paper = '#FEFDFB', ink = '#23282A', inkSoft = '#5c6567', hairline = '#e4ddd1', danger = '#b5493f';

const numberToWords = (amount: number): string => {
    const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine'];
    const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
    const teens = ['Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
    const convertLessThanOneThousand = (n: number): string => {
        if (n === 0) return '';
        if (n < 10) return ones[n];
        if (n < 20) return teens[n - 10];
        if (n < 100) return tens[Math.floor(n / 10)] + (n % 10 !== 0 ? ' ' + ones[n % 10] : '');
        return ones[Math.floor(n / 100)] + ' Hundred' + (n % 100 !== 0 ? ' and ' + convertLessThanOneThousand(n % 100) : '');
    };
    if (amount === 0) return 'Zero';
    const numStr = amount.toString();
    const parts = numStr.split('.');
    const whole = parseInt(parts[0]);
    const fraction = parts.length > 1 ? parseInt(parts[1].substring(0, 2).padEnd(2, '0')) : 0;
    let words = '';
    if (whole < 1000) words = convertLessThanOneThousand(whole);
    else if (whole < 1000000) words = convertLessThanOneThousand(Math.floor(whole / 1000)) + ' Thousand ' + convertLessThanOneThousand(whole % 1000);
    else words = convertLessThanOneThousand(Math.floor(whole / 1000000)) + ' Million ' + convertLessThanOneThousand(Math.floor((whole % 1000000) / 1000)) + ' Thousand ' + convertLessThanOneThousand(whole % 1000);
    return `${words} Only`.trim();
};

const ChequeManager: React.FC = () => {
    const { companyConfig, notify } = useAuth();
    const { cheques, addCheque, updateCheque, deleteCheque } = useFinance();
    const currency = companyConfig.currencySymbol;
    const [activeTab, setActiveTab] = useState<'Issued' | 'Received' | 'Print' | 'Settings'>('Issued');
    const [searchTerm, setSearchTerm] = useState('');
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingCheque, setEditingCheque] = useState<Partial<Cheque>>({});
    const [printConfig, setPrintConfig] = useState({ width: 200, height: 90, datePos: { x: 160, y: 10 }, payeePos: { x: 20, y: 25 }, amountWordsPos: { x: 20, y: 40 }, amountFigPos: { x: 160, y: 38 } });
    const [selectedChequeId, setSelectedChequeId] = useState<string | null>(null);

    const handlePrint = () => { window.print(); };
    const filteredCheques = cheques.filter(c => c.type === activeTab && (c.payeeName.toLowerCase().includes(searchTerm.toLowerCase()) || c.chequeNumber.includes(searchTerm)));

    const handleSave = () => {
        if (!editingCheque.payeeName || !editingCheque.amount) return;
        const chequeData: Cheque = { id: editingCheque.id || '', type: (activeTab === 'Issued' || activeTab === 'Received') ? activeTab : 'Issued', chequeNumber: editingCheque.chequeNumber || '', date: editingCheque.date || new Date().toISOString().split('T')[0], payeeName: editingCheque.payeeName, amount: Number(editingCheque.amount), bankName: editingCheque.bankName || '', status: editingCheque.status || 'Pending', notes: editingCheque.notes, printConfig };
        if (chequeData.id) updateCheque(chequeData); else addCheque(chequeData);
        setIsModalOpen(false); setEditingCheque({});
    };

    const handleStatusChange = (c: Cheque, status: Cheque['status']) => { updateCheque({ ...c, status }); notify(`Cheque marked as ${status}`, 'success'); };
    const openPrintPreview = (c: Cheque) => { setEditingCheque(c); setSelectedChequeId(c.id); setActiveTab('Print'); };

    const inputStyle: React.CSSProperties = { width: '100%', fontFamily: "'Inter', sans-serif", fontSize: 13.5, color: ink, background: paper, border: `1.4px solid ${hairline}`, borderRadius: 9, padding: '9px 12px', outline: 'none' };

    return (
        <div style={{ padding: 24, maxWidth: 1600, margin: '0 auto', height: 'calc(100vh - 4rem)', display: 'flex', flexDirection: 'column', background: t[50] }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
                <div>
                    <h1 style={{ fontSize: 20, fontWeight: 700, color: ink, display: 'flex', alignItems: 'center', gap: 8, margin: 0 }}><CreditCard color={t[500]} /> Cheque Manager</h1>
                    <p style={{ fontSize: 12, color: inkSoft, marginTop: 2 }}>Track, Manage & Print Cheques</p>
                </div>
                <div style={{ display: 'flex', background: t[50], padding: 4, borderRadius: 12 }}>
                    {['Issued', 'Received', 'Print'].map(tab => (
                        <button key={tab} onClick={() => setActiveTab(tab as 'Issued' | 'Received' | 'Print')} style={{
                            padding: '6px 14px', fontSize: 12, fontWeight: 700, borderRadius: 8, border: 'none', cursor: 'pointer', transition: 'all .15s ease',
                            background: activeTab === tab ? paper : 'transparent', color: activeTab === tab ? t[500] : inkSoft, boxShadow: activeTab === tab ? '0 1px 3px rgba(0,0,0,0.08)' : 'none'
                        }}>{tab}</button>
                    ))}
                </div>
            </div>

            <div className="prime-card" style={{ flex: 1, background: paper, borderRadius: 14, border: `1.4px solid ${hairline}`, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                {(activeTab === 'Issued' || activeTab === 'Received') && (
                    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                        <div style={{ padding: '12px 16px', borderBottom: `1.4px solid ${hairline}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: t[50] }}>
                            <div style={{ position: 'relative', width: 280 }}>
                                <Search size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: inkSoft }} />
                                <input className="prime-input" type="text" placeholder={`Search ${activeTab} cheques...`} value={searchTerm} onChange={e => setSearchTerm(e.target.value)} style={{ ...inputStyle, paddingLeft: 32 }} />
                            </div>
                            <button className="prime-btn" onClick={() => { setEditingCheque({ type: activeTab }); setIsModalOpen(true); }} style={{ padding: '7px 14px', background: t[500], color: '#fff', borderRadius: 9, border: 'none', fontSize: 12, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', transition: 'all .15s ease' }}
                                onMouseEnter={e => { e.currentTarget.style.background = t[700]; }}
                                onMouseLeave={e => { e.currentTarget.style.background = t[500]; }}
                            ><Plus size={14} /> Add Cheque</button>
                        </div>
                        <div style={{ flex: 1, overflowY: 'auto' }}>
                            <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
                                <thead style={{ background: paper, borderBottom: `1.4px solid ${hairline}`, position: 'sticky', top: 0 }}>
                                    <tr>{['Date', 'Cheque No.', activeTab === 'Issued' ? 'Payee' : 'Payer', 'Bank', 'Amount', 'Status', 'Actions'].map(h => (
                                        <th key={h} className="prime-table-header" style={{ padding: '12px 16px', fontSize: 11, fontWeight: 700, color: inkSoft, textTransform: 'uppercase', letterSpacing: 0.5, textAlign: h === 'Amount' || h === 'Actions' ? 'right' : h === 'Status' ? 'center' : 'left' }}>{h}</th>
                                    ))}</tr>
                                </thead>
                                <tbody style={{ borderTop: `1px solid ${hairline}` }}>
                                    {filteredCheques.map(c => (
                                        <tr key={c.id} className="prime-table-cell" style={{ borderBottom: `1px solid ${hairline}`, transition: 'all .15s ease' }}
                                            onMouseEnter={e => { e.currentTarget.style.background = t[50]; }}
                                            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                                        >
                                            <td style={{ padding: '12px 16px', color: inkSoft }}>{c.date}</td>
                                            <td style={{ padding: '12px 16px', fontFamily: "'JetBrains Mono', monospace", color: ink }}>{c.chequeNumber}</td>
                                            <td style={{ padding: '12px 16px', fontWeight: 700, color: ink }}>{c.payeeName}</td>
                                            <td style={{ padding: '12px 16px', color: inkSoft }}>{c.bankName}</td>
                                            <td style={{ padding: '12px 16px', textAlign: 'right', fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, color: ink }}>{currency}{c.amount.toLocaleString()}</td>
                                            <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                                                <span style={{
                                                    padding: '2px 10px', borderRadius: 20, fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
                                                    background: c.status === 'Cleared' ? t[100] : c.status === 'Bounced' ? '#fef0ee' : amber[100],
                                                    color: c.status === 'Cleared' ? t[700] : c.status === 'Bounced' ? danger : '#92400e'
                                                }}>{c.status}</span>
                                            </td>
                                            <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                                                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 4 }}>
                                                    {c.type === 'Issued' && <button className="prime-btn-secondary" onClick={() => openPrintPreview(c)} style={{ padding: 6, background: t[50], border: 'none', borderRadius: 6, color: inkSoft, cursor: 'pointer' }}><Printer size={14} /></button>}
                                                    <button className="prime-btn-secondary" onClick={() => { setEditingCheque(c); setIsModalOpen(true); }} style={{ padding: 6, background: t[50], border: 'none', borderRadius: 6, color: inkSoft, cursor: 'pointer' }}><Edit2 size={14} /></button>
                                                    {c.status === 'Pending' && <button className="prime-btn-secondary" onClick={() => handleStatusChange(c, 'Cleared')} style={{ padding: 6, background: t[50], border: 'none', borderRadius: 6, color: t[500], cursor: 'pointer' }}><CheckCircle size={14} /></button>}
                                                    <button className="prime-btn-secondary" onClick={() => { if (confirm("Delete Cheque?")) deleteCheque(c.id); }} style={{ padding: 6, background: t[50], border: 'none', borderRadius: 6, color: danger, cursor: 'pointer' }}><Trash2 size={14} /></button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                {activeTab === 'Print' && (
                    <div style={{ display: 'flex', height: '100%' }}>
                        <div style={{ width: 300, borderRight: `1.4px solid ${hairline}`, background: t[50], padding: 20, overflowY: 'auto' }}>
                            <h3 style={{ fontSize: 14, fontWeight: 700, color: ink, margin: '0 0 16px', display: 'flex', alignItems: 'center', gap: 8 }}><Settings size={18} color={t[500]} /> Configuration (mm)</h3>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 16, fontSize: 13 }}>
                                <div className="prime-card" style={{ background: paper, padding: 14, borderRadius: 12, border: `1.4px solid ${hairline}` }}>
                                    <h4 style={{ fontSize: 11, fontWeight: 700, color: inkSoft, textTransform: 'uppercase', margin: '0 0 12px' }}>Cheque Dimensions</h4>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                                        <div><label style={{ fontSize: 10, color: inkSoft }}>Width</label><input className="prime-input" type="number" value={printConfig.width} onChange={e => setPrintConfig({ ...printConfig, width: Number(e.target.value) })} style={inputStyle} /></div>
                                        <div><label style={{ fontSize: 10, color: inkSoft }}>Height</label><input className="prime-input" type="number" value={printConfig.height} onChange={e => setPrintConfig({ ...printConfig, height: Number(e.target.value) })} style={inputStyle} /></div>
                                    </div>
                                </div>
                                <div className="prime-card" style={{ background: paper, padding: 14, borderRadius: 12, border: `1.4px solid ${hairline}`, display: 'flex', flexDirection: 'column', gap: 12 }}>
                                    <h4 style={{ fontSize: 11, fontWeight: 700, color: inkSoft, textTransform: 'uppercase', margin: 0 }}>Field Positions (X, Y)</h4>
                                    {[
                                        { label: 'Date', key: 'datePos' },
                                        { label: 'Payee Name', key: 'payeePos' },
                                        { label: 'Amount (Words)', key: 'amountWordsPos' },
                                        { label: 'Amount (Fig)', key: 'amountFigPos' },
                                    ].map(field => (
                                        <div key={field.key}>
                                            <label style={{ fontSize: 12, fontWeight: 700, color: ink }}>{field.label}</label>
                                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 4 }}>
                                                <input className="prime-input" type="number" value={(printConfig as Record<string, { x: number; y: number }>)[field.key].x} onChange={e => setPrintConfig({ ...printConfig, [field.key]: { ...(printConfig as Record<string, { x: number; y: number }>)[field.key], x: Number(e.target.value) } })} style={inputStyle} />
                                                <input className="prime-input" type="number" value={(printConfig as Record<string, { x: number; y: number }>)[field.key].y} onChange={e => setPrintConfig({ ...printConfig, [field.key]: { ...(printConfig as Record<string, { x: number; y: number }>)[field.key], y: Number(e.target.value) } })} style={inputStyle} />
                                            </div>
                                        </div>
                                    ))}
                                </div>
                                <button className="prime-btn" onClick={handlePrint} style={{ width: '100%', padding: '10px 16px', background: t[500], color: '#fff', borderRadius: 9, border: 'none', fontSize: 13, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, cursor: 'pointer', transition: 'all .15s ease' }}
                                    onMouseEnter={e => { e.currentTarget.style.background = t[700]; }}
                                    onMouseLeave={e => { e.currentTarget.style.background = t[500]; }}
                                ><Printer size={16} /> Print Cheque</button>
                            </div>
                        </div>
                        <div style={{ flex: 1, padding: 24, background: hairline, overflow: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <div id="cheque-canvas" style={{
                                background: paper, width: `${printConfig.width}mm`, height: `${printConfig.height}mm`,
                                position: 'relative', boxShadow: '0 8px 32px rgba(0,0,0,0.12)', borderRadius: 4,
                                backgroundImage: 'repeating-linear-gradient(45deg, #f0f0f0 25%, transparent 25%, transparent 75%, #f0f0f0 75%, #f0f0f0), repeating-linear-gradient(45deg, #f0f0f0 25%, #ffffff 25%, #ffffff 75%, #f0f0f0 75%, #f0f0f0)',
                                backgroundPosition: '0 0, 10px 10px', backgroundSize: '20px 20px'
                            }}>
                                <div style={{ position: 'absolute', fontSize: 13, fontFamily: "'JetBrains Mono', monospace", left: `${printConfig.datePos.x}mm`, top: `${printConfig.datePos.y}mm`, color: ink }}>{editingCheque.date || 'DD/MM/YYYY'}</div>
                                <div style={{ position: 'absolute', fontSize: 13, fontWeight: 700, fontFamily: "'Georgia', serif", left: `${printConfig.payeePos.x}mm`, top: `${printConfig.payeePos.y}mm`, color: ink }}>{editingCheque.payeeName || 'Payee Name'}</div>
                                <div style={{ position: 'absolute', fontSize: 13, fontStyle: 'italic', fontFamily: "'Georgia', serif", width: '120mm', left: `${printConfig.amountWordsPos.x}mm`, top: `${printConfig.amountWordsPos.y}mm`, color: ink }}>{editingCheque.amount ? numberToWords(editingCheque.amount) : 'Amount in Words'}</div>
                                <div style={{ position: 'absolute', fontSize: 16, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace", left: `${printConfig.amountFigPos.x}mm`, top: `${printConfig.amountFigPos.y}mm`, color: ink }}>{editingCheque.amount ? `**${editingCheque.amount.toLocaleString()}**` : '0.00'}</div>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {isModalOpen && (
                <div style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(15,23,42,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
                    <div className="prime-card" style={{ background: paper, borderRadius: 14, maxWidth: 480, width: '100%', padding: 24 }}>
                        <h2 style={{ fontSize: 18, fontWeight: 700, color: ink, margin: '0 0 16px' }}>{editingCheque.id ? 'Edit Cheque' : 'Add Cheque'}</h2>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                            {[
                                { label: 'Cheque Number', key: 'chequeNumber' },
                                { label: 'Payee Name', key: 'payeeName' },
                                { label: 'Bank Name', key: 'bankName' },
                            ].map(f => (
                                <div key={f.key}>
                                    <label className="prime-label" style={{ display: 'block', fontSize: 11, fontWeight: 700, color: inkSoft, textTransform: 'uppercase', marginBottom: 4 }}>{f.label}</label>
                                    <input className="prime-input" value={(editingCheque as any)[f.key] || ''} onChange={e => setEditingCheque({ ...editingCheque, [f.key]: e.target.value })} style={inputStyle} />
                                </div>
                            ))}
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                                <div>
                                    <label className="prime-label" style={{ display: 'block', fontSize: 11, fontWeight: 700, color: inkSoft, textTransform: 'uppercase', marginBottom: 4 }}>Date</label>
                                    <input className="prime-input" type="date" value={editingCheque.date || ''} onChange={e => setEditingCheque({ ...editingCheque, date: e.target.value })} style={inputStyle} />
                                </div>
                                <div>
                                    <label className="prime-label" style={{ display: 'block', fontSize: 11, fontWeight: 700, color: inkSoft, textTransform: 'uppercase', marginBottom: 4 }}>Amount</label>
                                    <input className="prime-input" type="number" value={editingCheque.amount || ''} onChange={e => setEditingCheque({ ...editingCheque, amount: parseFloat(e.target.value) })} style={inputStyle} />
                                </div>
                            </div>
                            <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
                                <button className="prime-btn-secondary" onClick={() => setIsModalOpen(false)} style={{ flex: 1, padding: '9px 16px', borderRadius: 9, border: `1.4px solid ${hairline}`, background: paper, color: inkSoft, fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
                                <button className="prime-btn" onClick={handleSave} style={{ flex: 1, padding: '9px 16px', borderRadius: 9, border: 'none', background: t[500], color: '#fff', fontWeight: 700, cursor: 'pointer' }}>Save</button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ChequeManager;
