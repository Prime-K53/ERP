import React from 'react';
import { useAuth } from '../context/AuthContext';
import { AuditTimeline } from './shared/components/AuditTimeline';

const teal={50:'#eef7f6',100:'#d3ece9',200:'#a6d9d3',300:'#72c0b7',400:'#3fa294',500:'#1f8577',600:'#146b60',700:'#0f544c',800:'#0b3e39',900:'#082e2a'};
const amber={100:'#fbead0',300:'#eec27a',500:'#d99a3f',600:'#b97e2b'};
const paper='#FEFDFB',ink='#23282A',inkSoft='#5c6567',hairline='#e4ddd1',danger='#b5493f';

const AuditLogs: React.FC = () => {
    const { auditLogs = [] } = useAuth();

    return (
        <div style={{ padding: '24px', marginLeft: 'auto', display: 'flex', flexDirection: 'column', fontFamily: 'Inter,"DM Sans",sans-serif' }}>
            <AuditTimeline logs={auditLogs} />
            <div style={{ marginTop: '24px', display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 900, color: '#5c6567', textTransform: 'uppercase', paddingLeft: '8px', background: '#eef7f6', padding: '8px', borderRadius: '12px', border: '1.4px solid #e4ddd1', borderColor: '#e4ddd1', paddingRight: '8px' }}>
                <span style={{ color: '#d99a3f' }}>🛡️</span>
                Notice: Audit logs are immutable and permanent. They cannot be modified or deleted, ensuring full regulatory compliance and non-repudiation.
            </div>
        </div>
    );
};

export default AuditLogs;
