import React, { useMemo } from 'react';
import { useAuth } from '../../context/AuthContext';
import { History as HistoryIcon, Clock, Activity, Shield, User as UserIcon, ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const t = { 50: '#eef7f6', 100: '#d3ece9', 200: '#a6d9d3', 500: '#1f8577', 600: '#146b60', 700: '#0f544c', 800: '#0b3e39' };
const paper = '#FEFDFB', ink = '#23282A', inkSoft = '#5c6567', hairline = '#e4ddd1';

const ProfileActivity: React.FC = () => {
    const { auditLogs, user } = useAuth();
    const navigate = useNavigate();

    const userLogs = useMemo(() => {
        return auditLogs
            .filter((log: any) => log.userId === user?.username)
            .sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime());
    }, [auditLogs, user]);

    const stats = useMemo(() => {
        const today = new Date().toISOString().split('T')[0];
        const todayLogs = userLogs.filter((l: any) => l.date.startsWith(today));
        return { total: userLogs.length, today: todayLogs.length, lastAction: userLogs[0]?.action || 'None' };
    }, [userLogs]);

    return (
        <div style={{ padding: 24, maxWidth: 960, margin: '0 auto', height: 'calc(100vh - 4rem)', display: 'flex', flexDirection: 'column', background: t[50] }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 32, flexShrink: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                    <button onClick={() => navigate(-1)} style={{ padding: 8, borderRadius: '50%', border: `1.4px solid ${hairline}`, background: paper, color: inkSoft, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <ArrowLeft size={20} />
                    </button>
                    <div>
                        <h1 style={{ fontSize: 22, fontWeight: 800, color: ink, display: 'flex', alignItems: 'center', gap: 8, margin: 0 }}>
                            <UserIcon size={24} color={t[500]} /> User Activity Profile
                        </h1>
                        <p style={{ fontSize: 13, color: inkSoft, margin: '4px 0 0' }}>Audit trail for @{user?.username || 'user'}</p>
                    </div>
                </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 20, marginBottom: 32, flexShrink: 0 }}>
                <div className="prime-card" style={{ background: paper, padding: 20, borderRadius: 14, border: `1.4px solid ${hairline}` }}>
                    <p style={{ fontSize: 10, fontWeight: 800, color: inkSoft, textTransform: 'uppercase', letterSpacing: '0.2em', margin: '0 0 4px' }}>Total Actions</p>
                    <p style={{ fontSize: 28, fontWeight: 800, color: ink, margin: 0 }}>{stats.total}</p>
                </div>
                <div className="prime-card" style={{ background: paper, padding: 20, borderRadius: 14, border: `1.4px solid ${hairline}` }}>
                    <p style={{ fontSize: 10, fontWeight: 800, color: inkSoft, textTransform: 'uppercase', letterSpacing: '0.2em', margin: '0 0 4px' }}>Actions Today</p>
                    <p style={{ fontSize: 28, fontWeight: 800, color: t[500], margin: 0 }}>{stats.today}</p>
                </div>
                <div className="prime-card" style={{ background: t[800], padding: 20, borderRadius: 14 }}>
                    <p style={{ fontSize: 10, fontWeight: 800, color: t[200], textTransform: 'uppercase', letterSpacing: '0.2em', margin: '0 0 4px' }}>Last Logged Action</p>
                    <p style={{ fontSize: 18, fontWeight: 700, color: '#fff', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{stats.lastAction}</p>
                </div>
            </div>

            <div className="prime-card" style={{ flex: 1, background: paper, borderRadius: 14, border: `1.4px solid ${hairline}`, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                <div style={{ padding: '12px 16px', borderBottom: `1px solid ${hairline}`, background: t[50], display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                    <HistoryIcon size={16} color={inkSoft} />
                    <h3 style={{ fontSize: 13, fontWeight: 700, color: ink, textTransform: 'uppercase', letterSpacing: '0.1em', margin: 0 }}>Operation History</h3>
                </div>
                <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>
                    {userLogs.length === 0 ? (
                        <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: inkSoft, opacity: 0.5 }}>
                            <Clock size={48} style={{ marginBottom: 16 }} />
                            <p style={{ fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', fontSize: 12 }}>No activity found</p>
                        </div>
                    ) : (
                        <div style={{ position: 'relative', paddingLeft: 16, borderLeft: `2px solid ${hairline}`, marginLeft: 8, display: 'flex', flexDirection: 'column', gap: 24 }}>
                            {userLogs.map((log: any) => (
                                <div key={log.id} style={{ position: 'relative' }}>
                                    <div style={{ position: 'absolute', left: -25, top: 4, width: 12, height: 12, borderRadius: '50%', background: t[500], border: `2px solid ${paper}`, boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }} />
                                    <div style={{ display: 'flex', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16 }}>
                                        <div style={{ flex: 1 }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                <span style={{ fontSize: 13, fontWeight: 800, color: ink }}>{log.action}</span>
                                                <span style={{ fontSize: 9, fontFamily: "'JetBrains Mono', monospace", background: t[50], padding: '2px 6px', borderRadius: 4, border: `1px solid ${hairline}`, color: inkSoft, textTransform: 'uppercase' }}>{log.id}</span>
                                            </div>
                                            <p style={{ fontSize: 12, color: inkSoft, margin: '4px 0 0', lineHeight: 1.5 }}>{log.details}</p>
                                        </div>
                                        <div style={{ textAlign: 'right', flexShrink: 0 }}>
                                            <p style={{ fontSize: 10, fontWeight: 800, color: inkSoft, textTransform: 'uppercase', margin: 0 }}>{new Date(log.date).toLocaleDateString()}</p>
                                            <p style={{ fontSize: 10, fontWeight: 700, color: t[500], margin: 0 }}>{new Date(log.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default ProfileActivity;
