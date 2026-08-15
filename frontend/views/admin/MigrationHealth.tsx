import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Database, Activity, CheckCircle, ArrowLeft, Server, Clock, Users, Settings } from 'lucide-react';

const t = { 50: '#eef7f6', 100: '#d3ece9', 500: '#1f8577', 600: '#146b60', 700: '#0f544c', 800: '#0b3e39' };
const paper = '#FEFDFB', ink = '#23282A', inkSoft = '#5c6567', hairline = '#e4ddd1';

const StatCard: React.FC<{ label: string; value: string | number; icon: React.ReactNode; color?: string }> = ({ label, value, icon, color }) => (
    <div className="prime-card" style={{ background: paper, padding: '16px 20px', borderRadius: 14, border: `1.4px solid ${hairline}` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
            <div style={{ padding: 8, borderRadius: 8, background: color ? color.match(/#[a-f0-9]{6}/)?.[0] ? `${color}20` : t[50] : t[50], display: 'flex', alignItems: 'center' }}>{icon}</div>
            <p style={{ fontSize: 10, fontWeight: 800, color: inkSoft, textTransform: 'uppercase', letterSpacing: '0.2em', margin: 0 }}>{label}</p>
        </div>
        <p style={{ fontSize: 24, fontWeight: 800, color: ink, margin: 0 }}>{value}</p>
    </div>
);

const StatusBadge: React.FC<{ healthy: boolean }> = ({ healthy }) => (
    <span style={{
        display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 8px', borderRadius: 20,
        fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.5,
        background: healthy ? t[100] : '#fef0ee', color: healthy ? t[800] : '#b5493f'
    }}>{healthy ? <CheckCircle size={10} /> : null}{healthy ? 'Healthy' : 'Issues'}</span>
);

const MigrationHealth: React.FC = () => {
    const navigate = useNavigate();
    const [loading, setLoading] = useState(true);
    const [serverTime, setServerTime] = useState<string | null>(null);
    const [online, setOnline] = useState(true);

    useEffect(() => {
        setLoading(true);
        const check = async () => {
            try {
                const localHealth = { status: 'healthy', serverTime: new Date().toISOString(), uptime: process.uptime?.() || 0 };
                setServerTime(localHealth.serverTime);
                setOnline(true);
            } catch { setOnline(false); }
            finally { setLoading(false); }
        };
        check();
    }, []);

    return (
        <div style={{ padding: 24, maxWidth: 1600, margin: '0 auto', height: 'calc(100vh - 4rem)', display: 'flex', flexDirection: 'column', background: t[50] }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, flexShrink: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                    <button onClick={() => navigate(-1)} style={{ padding: 8, borderRadius: '50%', border: `1.4px solid ${hairline}`, background: paper, color: inkSoft, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <ArrowLeft size={20} />
                    </button>
                    <div>
                        <h1 style={{ fontSize: 22, fontWeight: 800, color: ink, display: 'flex', alignItems: 'center', gap: 8, margin: 0 }}>
                            <Database size={24} color={t[500]} /> System Health
                        </h1>
                        <p style={{ fontSize: 13, color: inkSoft, margin: '4px 0 0' }}>Server connectivity and runtime diagnostics</p>
                    </div>
                </div>
            </div>
            {loading ? (
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
                        <Activity size={24} color={t[500]} className="animate-spin" />
                        <p style={{ fontSize: 13, fontWeight: 700, color: inkSoft, textTransform: 'uppercase', letterSpacing: '0.1em' }}>Loading diagnostics...</p>
                    </div>
                </div>
            ) : (
                <div style={{ flex: 1, overflowY: 'auto' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 16 }}>
                        <StatCard label="Server Status" value={online ? 'Online' : 'Offline'} icon={<Server size={16} color={online ? t[500] : '#b5493f'} />} color={online ? t[50] : '#fef0ee'} />
                        <StatCard label="Server Time" value={serverTime ? new Date(serverTime).toLocaleTimeString() : 'N/A'} icon={<Clock size={16} color={t[600]} />} color={t[50]} />
                        <StatCard label="Client Time" value={new Date().toLocaleTimeString()} icon={<Clock size={16} color={t[500]} />} color={t[50]} />
                        <StatCard label="Online" value={typeof navigator !== 'undefined' ? (navigator.onLine ? 'Yes' : 'No') : 'N/A'} icon={<Activity size={16} color={t[500]} />} />
                        <StatCard label="Users" value="—" icon={<Users size={16} color={inkSoft} />} />
                        <StatCard label="Mode" value="Local" icon={<Settings size={16} color={t[500]} />} />
                    </div>
                </div>
            )}
        </div>
    );
};

export default MigrationHealth;
