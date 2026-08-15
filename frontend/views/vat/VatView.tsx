import React, { useState } from 'react';
import { LayoutDashboard, FileText, Settings } from 'lucide-react';
import { VatDashboard } from './VatDashboard';
import { VatReports } from './VatReports';
import { VatSettings } from './VatSettings';

const VatView: React.FC = () => {
    const [activeTab, setActiveTab] = useState<'Dashboard' | 'Reports' | 'Settings'>('Dashboard');

    return (
        <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
            <div style={{
                background: '#FEFDFB', borderBottom: '1px solid #e4ddd1',
                padding: '16px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center'
            }}>
                <h1 style={{ fontSize: 22, fontWeight: 700, color: '#23282A', margin: 0 }}>VAT management</h1>
                <div className="prime-btn-secondary" style={{ display: 'flex', gap: 4, background: '#eef7f6', padding: 4, borderRadius: 12 }}>
                    {(['Dashboard', 'Reports', 'Settings'] as const).map(tab => (
                        <button key={tab} onClick={() => setActiveTab(tab)}
                            style={{
                                padding: '8px 16px', borderRadius: 8, fontSize: 13, fontWeight: 600,
                                border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8,
                                background: activeTab === tab ? '#FEFDFB' : 'transparent',
                                color: activeTab === tab ? '#1f8577' : '#5c6567',
                                boxShadow: activeTab === tab ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                                transition: 'all .15s ease'
                            }}
                            onMouseEnter={e => { if (activeTab !== tab) { e.currentTarget.style.color = '#23282A'; } }}
                            onMouseLeave={e => { if (activeTab !== tab) { e.currentTarget.style.color = '#5c6567'; } }}
                        >
                            {tab === 'Dashboard' && <LayoutDashboard size={16} />}
                            {tab === 'Reports' && <FileText size={16} />}
                            {tab === 'Settings' && <Settings size={16} />}
                            {tab === 'Reports' ? 'Returns & reports' : tab === 'Settings' ? 'Configuration' : 'Dashboard'}
                        </button>
                    ))}
                </div>
            </div>
            <div style={{ flex: 1, overflow: 'auto', padding: 24, background: '#eef7f6' }}>
                {activeTab === 'Dashboard' && <VatDashboard />}
                {activeTab === 'Reports' && <VatReports />}
                {activeTab === 'Settings' && <VatSettings />}
            </div>
        </div>
    );
};

export default VatView;
