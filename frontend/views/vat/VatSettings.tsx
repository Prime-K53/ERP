import React, { useEffect, useState } from 'react';
import { useVatStore } from '../../stores/vatStore';
import { useFinanceStore } from '../../stores/financeStore';
import { VATConfig } from '../../types';
import { Save } from 'lucide-react';

const t = { 50: '#eef7f6', 100: '#d3ece9', 200: '#a6d9d3', 500: '#1f8577', 600: '#146b60', 700: '#0f544c', 800: '#0b3e39' };
const paper = '#FEFDFB', ink = '#23282A', inkSoft = '#5c6567', hairline = '#e4ddd1';

export const VatSettings: React.FC = () => {
    const { config, updateConfig, isLoading } = useVatStore();
    const { accounts, fetchFinanceData } = useFinanceStore();
    const [localConfig, setLocalConfig] = useState<VATConfig>(config);
    const [isDirty, setIsDirty] = useState(false);

    useEffect(() => { fetchFinanceData(); }, []);
    useEffect(() => { setLocalConfig(config); }, [config]);

    const handleChange = (field: keyof VATConfig, value: any) => { setLocalConfig(prev => ({ ...prev, [field]: value })); setIsDirty(true); };

    const handleSave = async () => { await updateConfig(localConfig); setIsDirty(false); };

    const liabAccts = accounts.filter(a => a.type === 'Liability');
    const assetAccts = accounts.filter(a => a.type === 'Asset');

    const inputStyle: React.CSSProperties = {
        width: '100%', fontFamily: "'Inter', sans-serif", fontSize: 13.5,
        color: ink, background: paper,
        border: `1.4px solid ${hairline}`, borderRadius: 9,
        padding: '9px 12px', outline: 'none', transition: 'border-color .15s ease'
    };
    const selectStyle: React.CSSProperties = {
        ...inputStyle, appearance: 'none',
        backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%235c6567'/%3E%3C/svg%3E")`,
        backgroundRepeat: 'no-repeat', backgroundPosition: 'right 12px center',
        paddingRight: 30, cursor: 'pointer'
    };
    const labelStyle: React.CSSProperties = {
        display: 'block', fontSize: 12, fontWeight: 700, color: inkSoft,
        textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6
    };

    return (
        <div className="prime-card" style={{ background: paper, padding: 24, borderRadius: 14, border: `1.4px solid ${hairline}` }}>
            <h2 style={{ fontSize: 16, fontWeight: 700, color: ink, margin: '0 0 24px' }}>VAT settings</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                <div className="prime-label" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
                    <div>
                        <label style={labelStyle}>Standard rate (%)</label>
                        <input className="prime-input" type="number" value={localConfig.rate} onChange={(e) => handleChange('rate', parseFloat(e.target.value))} style={inputStyle} />
                        <p style={{ fontSize: 11, color: inkSoft, marginTop: 4 }}>Malawi standard rate: 17.5%</p>
                    </div>
                    <div>
                        <label style={labelStyle}>Registration number (TPIN)</label>
                        <input className="prime-input" type="text" value={localConfig.registrationNumber || ''} onChange={(e) => handleChange('registrationNumber', e.target.value)} style={inputStyle} placeholder="e.g. 100012345" />
                    </div>
                    <div>
                        <label style={labelStyle}>Filing frequency</label>
                        <select className="prime-select" value={localConfig.filingFrequency} onChange={(e) => handleChange('filingFrequency', e.target.value)} style={selectStyle}>
                            <option value="Monthly">Monthly</option>
                            <option value="Quarterly">Quarterly</option>
                            <option value="Annually">Annually</option>
                        </select>
                    </div>
                    <div>
                        <label style={labelStyle}>Default tax category</label>
                        <select className="prime-select" value={localConfig.defaultTaxCategory || 'Standard'} onChange={(e) => handleChange('defaultTaxCategory', e.target.value)} style={selectStyle}>
                            <option value="Standard">Standard rate</option>
                            <option value="Zero">Zero rated</option>
                            <option value="Exempt">Exempt</option>
                        </select>
                    </div>
                </div>
                <h3 style={{ fontSize: 16, fontWeight: 700, color: ink, margin: '20px 0 8px', paddingBottom: 8, borderBottom: `1px solid ${hairline}` }}>GL account mapping</h3>
                <div className="prime-label" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
                    <div>
                        <label style={labelStyle}>Output tax account (collected)</label>
                        <select className="prime-select" value={localConfig.outputTaxAccount || ''} onChange={(e) => handleChange('outputTaxAccount', e.target.value)} style={selectStyle}>
                            <option value="">Select liability account</option>
                            {liabAccts.map(a => (<option key={a.id} value={a.id}>{a.code} - {a.name}</option>))}
                        </select>
                        <p style={{ fontSize: 11, color: inkSoft, marginTop: 4 }}>Account for VAT collected on sales</p>
                    </div>
                    <div>
                        <label style={labelStyle}>Input tax account (paid)</label>
                        <select className="prime-select" value={localConfig.inputTaxAccount || ''} onChange={(e) => handleChange('inputTaxAccount', e.target.value)} style={selectStyle}>
                            <option value="">Select asset account</option>
                            {assetAccts.map(a => (<option key={a.id} value={a.id}>{a.code} - {a.name}</option>))}
                        </select>
                        <p style={{ fontSize: 11, color: inkSoft, marginTop: 4 }}>Account for VAT paid on purchases</p>
                    </div>
                    <div>
                        <label style={labelStyle}>Market adjustment account</label>
                        <select className="prime-select" value={localConfig.marketAdjustmentAccount || ''} onChange={(e) => handleChange('marketAdjustmentAccount', e.target.value)} style={selectStyle}>
                            <option value="">Select revenue/other account</option>
                            {accounts.filter(a => a.type === 'Revenue').map(a => (<option key={a.id} value={a.id}>{a.code} - {a.name}</option>))}
                        </select>
                        <p style={{ fontSize: 11, color: inkSoft, marginTop: 4 }}>Account for tracking market adjustments</p>
                    </div>
                </div>
                <div style={{ marginTop: 24, display: 'flex', justifyContent: 'flex-end' }}>
                    <button className="prime-btn" onClick={handleSave} disabled={!isDirty || isLoading}
                        style={{
                            padding: '8px 20px', borderRadius: 9, fontWeight: 700, color: '#fff', border: 'none', cursor: 'pointer',
                            display: 'flex', alignItems: 'center', gap: 8, transition: 'all .15s ease',
                            background: isDirty ? t[500] : inkSoft
                        }}
                        onMouseEnter={e => { if (isDirty) e.currentTarget.style.background = t[700]; }}
                        onMouseLeave={e => { if (isDirty) e.currentTarget.style.background = t[500]; }}
                    ><Save size={16} /> {isLoading ? 'Saving...' : 'Save configuration'}</button>
                </div>
            </div>
        </div>
    );
};
