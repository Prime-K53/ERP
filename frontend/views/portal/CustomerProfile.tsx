import React, { useEffect, useState, useCallback } from 'react';
import { User, Save, Lock, Loader2, Monitor, Smartphone, Bell, Shield, Settings2, ChevronRight, Building2, Key, CheckCircle2 } from 'lucide-react';
import QRCode from 'qrcode';
import { portalLifecycle, portalApi } from '../../services/portalApiClient';
import { useCustomerAuth } from '../../context/CustomerAuthContext';
import ErrorBanner from './components/ErrorBanner';
import { useToast } from './components/Toast';

import ConfirmDialog from './components/ConfirmDialog';

const teal = {
  50: '#eef7f6', 100: '#d3ece9', 200: '#a6d9d3', 300: '#72c0b7',
  400: '#3fa294', 500: '#1f8577', 600: '#146b60', 700: '#0f544c',
  800: '#0b3e39', 900: '#082e2a'
};
const danger = '#c0495f';
const ink = '#23282A';
const inkSoft = '#5c6567';
const hairline = '#E7E3DA';

const qboStyles = `
    .white-card {
        background: #FFFFFF;
        border: 1px solid rgba(16,24,40,0.07);
        border-radius: 14px;
        box-shadow: 0 1px 2px rgba(16,24,40,0.04), 0 12px 30px -16px rgba(16,24,40,0.18);
    }
    .settings-label {
        display: block;
        font-size: 12.5px;
        font-weight: 600;
        color: #3b454c;
        margin-bottom: 7px;
        letter-spacing: 0.01em;
    }
    .settings-input {
        width: 100%;
        padding: 10px 13px;
        background: #FFFFFF;
        border: 1px solid #e2ded3;
        border-radius: 10px;
        font-size: 14px;
        color: #23282A;
        transition: all 0.2s;
        box-shadow: inset 0 1px 2px rgba(16,24,40,0.03);
    }
    .settings-input:focus {
        outline: none;
        border-color: #1f8577 !important;
        box-shadow: 0 0 0 3px rgba(31,133,119,0.18);
    }
    .toggle-input {
        position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px;
        overflow: hidden; clip: rect(0,0,0,0); white-space: nowrap; border-width: 0;
    }
    .toggle-track {
        width: 44px; height: 24px; background: #d3ece9; border-radius: 9999px;
        position: relative; transition: background 0.2s ease; cursor: pointer; flex-shrink: 0;
    }
    .toggle-track::after {
        content: ''; position: absolute; top: 2px; left: 2px; width: 20px; height: 20px;
        background: #ffffff; border-radius: 50%; border: 1px solid #D4D7DC;
        transition: transform 0.2s ease; box-shadow: 0 1px 2px rgba(0,0,0,0.05);
    }
    .toggle-input:checked + .toggle-track { background: #1f8577; }
    .toggle-input:checked + .toggle-track::after { transform: translateX(20px); }
    .premium-settings input:not([type=checkbox]):not([type=radio]):not([type=range]):focus,
    .premium-settings textarea:focus,
    .premium-settings select:focus {
        outline: none; border-color: #1f8577 !important;
        box-shadow: 0 0 0 3px rgba(31,133,119,0.18) !important;
    }
`;

const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: 12.5, fontWeight: 600, color: '#3b454c',
  marginBottom: 7, letterSpacing: 0.01
};

const inputStyle: React.CSSProperties = {
  width: '100%', fontFamily: "'Inter', sans-serif", fontSize: 13.5,
  color: ink, background: '#fff',
  border: '1px solid #e2ded3', borderRadius: 10,
  padding: '10px 13px', outline: 'none',
  boxShadow: 'inset 0 1px 2px rgba(16,24,40,0.03)',
  transition: 'border-color .15s ease, box-shadow .15s ease'
};

interface ProfileData {
  full_name?: string;
  phone?: string;
  email?: string;
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
  country?: string;
}

interface TabItem {
  id: string;
  icon: React.ElementType;
  label: string;
  desc: string;
}

const menuGroups = [
  {
    title: 'Account',
    items: [
      { id: 'Personal', icon: Building2, label: 'Personal Info', desc: 'Contact details and address' },
      { id: 'Notifications', icon: Bell, label: 'Notifications', desc: 'Email and browser alerts' }
    ] as TabItem[]
  },
  {
    title: 'Security',
    items: [
      { id: 'Password', icon: Key, label: 'Password', desc: 'Update your password' },
      { id: 'TwoFactor', icon: Shield, label: '2FA', desc: 'Two-factor authentication' },
      { id: 'Sessions', icon: Monitor, label: 'Sessions', desc: 'Manage signed-in devices' }
    ] as TabItem[]
  }
];

const allTabs = menuGroups.flatMap(g => g.items);

const CustomerProfile: React.FC = () => {
  const { user } = useCustomerAuth();
  const { addToast } = useToast();
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [form, setForm] = useState<ProfileData>({});

  const [passwordForm, setPasswordForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [changingPassword, setChangingPassword] = useState(false);
  const [passwordMsg, setPasswordMsg] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  const [sessions, setSessions] = useState<any[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(true);
  const [revokeConfirmSessionId, setRevokeConfirmSessionId] = useState<string | null>(null);
  const [revokingSessionId, setRevokingSessionId] = useState<string | null>(null);
  const [browserNotifs, setBrowserNotifs] = useState(() => localStorage.getItem('portal_browser_notifications') !== 'false');

  const [twoFactorStatus, setTwoFactorStatus] = useState<{ enabled: boolean; confirmed: boolean } | null>(null);
  const [twoFactorSetup, setTwoFactorSetup] = useState<{ secret: string; otpauth_uri: string } | null>(null);
  const [twoFactorCode, setTwoFactorCode] = useState('');
  const [twoFactorLoading, setTwoFactorLoading] = useState(false);
  const [twoFactorError, setTwoFactorError] = useState<string | null>(null);
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState('Personal');

  useEffect(() => {
    const style = document.createElement('style');
    style.innerHTML = qboStyles;
    document.head.appendChild(style);
    return () => { document.head.removeChild(style); };
  }, []);

  const loadSessions = () => {
    portalLifecycle.profile.listSessions()
      .then(setSessions)
      .catch(() => {})
      .finally(() => setSessionsLoading(false));
  };

  useEffect(() => { loadSessions(); }, []);

  useEffect(() => {
    portalLifecycle.twoFactor.status()
      .then(setTwoFactorStatus)
      .catch(() => setTwoFactorStatus({ enabled: false, confirmed: false }));
  }, []);

  const handleRevokeSession = async (sessionId: string) => {
    setRevokingSessionId(sessionId);
    try {
      await portalApi.delete(`/auth/sessions/${sessionId}`);
      setSessions((prev) => prev.filter((s) => s.id !== sessionId));
      addToast('success', 'Session revoked');
    } catch {
      addToast('error', 'Failed to revoke session');
    } finally {
      setRevokingSessionId(null);
      setRevokeConfirmSessionId(null);
    }
  };

  const handle2FASetup = async () => {
    setTwoFactorLoading(true);
    setTwoFactorError(null);
    setQrCodeDataUrl(null);
    try {
      const data = await portalLifecycle.twoFactor.setup();
      setTwoFactorSetup(data);
      const dataUrl = await QRCode.toDataURL(data.otpauth_uri, { width: 160, margin: 1 });
      setQrCodeDataUrl(dataUrl);
    } catch (err: any) {
      setTwoFactorError(err.message || 'Failed to set up 2FA');
    } finally {
      setTwoFactorLoading(false);
    }
  };

  const handle2FAEnable = async (e: React.FormEvent) => {
    e.preventDefault();
    setTwoFactorLoading(true);
    setTwoFactorError(null);
    try {
      await portalLifecycle.twoFactor.enable(twoFactorCode.trim());
      setTwoFactorStatus({ enabled: true, confirmed: true });
      setTwoFactorSetup(null);
      setTwoFactorCode('');
      addToast('success', 'Two-factor authentication enabled');
    } catch (err: any) {
      setTwoFactorError(err.message || 'Failed to enable 2FA');
    } finally {
      setTwoFactorLoading(false);
    }
  };

  const handle2FADisable = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!twoFactorCode) return;
    setTwoFactorLoading(true);
    setTwoFactorError(null);
    try {
      await portalLifecycle.twoFactor.disable(twoFactorCode.trim());
      setTwoFactorStatus({ enabled: false, confirmed: false });
      setTwoFactorSetup(null);
      setTwoFactorCode('');
      addToast('success', 'Two-factor authentication disabled');
    } catch (err: any) {
      setTwoFactorError(err.message || 'Failed to disable 2FA');
    } finally {
      setTwoFactorLoading(false);
    }
  };

  const loadProfile = useCallback(async () => {
    try {
      const data = await portalLifecycle.profile.get();
      setProfile(data);
      setForm({
        full_name: data.full_name || '',
        phone: data.phone || '',
        address: data.address || '',
        city: data.city || '',
        state: data.state || '',
        zip: data.zip || '',
        country: data.country || '',
        email: data.email || user?.email || '',
      });
    } catch (err: any) {
      setError(err.message || 'Failed to load profile');
    } finally {
      setLoading(false);
    }
  }, [user?.email]);

  useEffect(() => { loadProfile(); }, [loadProfile]);

  useEffect(() => {
    let cancelled = false;
    let unsubscribe: (() => void) | undefined;
    (async () => {
      unsubscribe = await portalLifecycle.subscribe({
        onEvent: (type, payload) => {
          if (type === 'entity_changed' && (payload?.docType === 'customer_updated' || payload?.docType === 'customer') && !cancelled) {
            loadProfile();
          }
        },
      });
    })();
    return () => { cancelled = true; unsubscribe?.(); };
  }, [loadProfile]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSaveMsg(null);
    try {
      await portalLifecycle.profile.update(form);
      setSaveMsg('Profile updated successfully.');
      addToast('success', 'Profile updated');
    } catch (err: any) {
      setSaveMsg(err.message || 'Failed to update profile.');
      addToast('error', err.message || 'Failed to update profile');
    } finally {
      setSaving(false);
    }
  };

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordMsg(null);
    setPasswordError(null);
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setPasswordError('Passwords do not match.');
      return;
    }
    if (passwordForm.newPassword.length < 6) {
      setPasswordError('Password must be at least 6 characters.');
      return;
    }
    setChangingPassword(true);
    try {
      await portalLifecycle.profile.changePassword({
        currentPassword: passwordForm.currentPassword,
        newPassword: passwordForm.newPassword,
      });
      setPasswordMsg('Password changed successfully.');
      setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
      addToast('success', 'Password changed');
    } catch (err: any) {
      setPasswordError(err.message || 'Failed to change password.');
    } finally {
      setChangingPassword(false);
    }
  };

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center" style={{ minHeight: '50vh' }}>
        <div className="w-8 h-8 border-2 border-teal-500/30 border-t-teal-600 rounded-full animate-spin" />
      </div>
    );
  }
  if (error) return <div className="p-6"><ErrorBanner message={error} /></div>;

  return (
    <div className="premium-settings" style={{ fontFamily: "'Inter','DM Sans',sans-serif" }}>
      <style>{qboStyles}</style>

      {/* Mobile header */}
      <div className="md:hidden" style={{
        position: 'sticky', top: 0, zIndex: 30,
        padding: '14px 16px',
        background: 'linear-gradient(120deg, #0b3e39 0%, #146b60 52%, #1f8577 100%)',
        boxShadow: '0 4px 16px -6px rgba(11,62,57,0.5)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 10,
            background: 'linear-gradient(155deg, rgba(255,255,255,0.22), rgba(255,255,255,0.06))',
            border: '1px solid rgba(255,255,255,0.28)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>
            <Settings2 size={18} color="#fff" />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h1 style={{
              fontFamily: "'DM Serif Display', 'Georgia', serif", fontWeight: 400,
              fontSize: 17, margin: 0, color: '#ffffff', letterSpacing: 0.3,
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            }}>
              {allTabs.find(t => t.id === activeTab)?.label || 'Profile'}
            </h1>
            <p style={{ margin: '1px 0 0', fontSize: 10.5, color: 'rgba(255,255,255,0.78)' }}>
              Manage your account
            </p>
          </div>
          <button onClick={handleSave} style={{
            display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer',
            fontSize: 12, fontWeight: 600, padding: '7px 12px', borderRadius: 8, border: 'none',
            background: '#ffffff', color: teal[700],
          }}>
            <CheckCircle2 size={14} /> Save
          </button>
        </div>
      </div>

      {/* Mobile tab bar */}
      <div className="md:hidden" style={{
        position: 'sticky', top: 62, zIndex: 29,
        background: '#fff', borderBottom: '1px solid #E9EDF3',
        overflowX: 'auto', WebkitOverflowScrolling: 'touch',
        scrollbarWidth: 'none',
      }}>
        <div style={{ display: 'flex', gap: 0, padding: '0 8px', minWidth: 'max-content' }}>
          {allTabs.map(tab => {
            const isActive = activeTab === tab.id;
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '10px 12px', border: 'none', background: 'none',
                  borderBottom: isActive ? `2px solid ${teal[500]}` : '2px solid transparent',
                  cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0,
                  transition: 'border-color .15s ease',
                }}
              >
                <Icon size={14} style={{ color: isActive ? teal[500] : inkSoft }} />
                <span style={{ fontSize: 12, fontWeight: isActive ? 700 : 500, color: isActive ? teal[700] : inkSoft }}>
                  {tab.label}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Desktop header */}
      <div className="hidden md:flex" style={{
        alignItems: 'center', justifyContent: 'space-between',
        padding: '15px 28px',
        borderBottom: '1px solid rgba(11,62,57,0.4)',
        background: 'linear-gradient(120deg, #0b3e39 0%, #146b60 52%, #1f8577 100%)',
        boxShadow: '0 6px 20px -10px rgba(11,62,57,0.6)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{
            width: 42, height: 42, borderRadius: 12,
            background: 'linear-gradient(155deg, rgba(255,255,255,0.22), rgba(255,255,255,0.06))',
            border: '1px solid rgba(255,255,255,0.28)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>
            <Settings2 size={20} color="#fff" />
          </div>
          <div>
            <h1 style={{
              fontFamily: "'DM Serif Display', 'Georgia', serif", fontWeight: 400,
              fontSize: 19, margin: 0, color: '#ffffff', letterSpacing: 0.3,
            }}>
              {allTabs.find(t => t.id === activeTab)?.label || 'Profile'}
            </h1>
            <p style={{ margin: '2px 0 0', fontSize: 11.5, color: 'rgba(255,255,255,0.78)' }}>
              {menuGroups.find(g => g.items.some(i => i.id === activeTab))?.title || 'Profile'} &mdash; Manage your account
            </p>
          </div>
        </div>
        <button onClick={handleSave} style={{
          display: 'flex', alignItems: 'center', gap: 7, cursor: 'pointer',
          fontSize: 13, fontWeight: 600, padding: '9px 18px', borderRadius: 10, border: 'none',
          background: '#ffffff', color: teal[700],
          boxShadow: '0 8px 18px -8px rgba(0,0,0,0.45)',
        }}>
          <CheckCircle2 size={16} /> Save Profile
        </button>
      </div>

      <div className="flex" style={{ minHeight: 'calc(100vh - 140px)' }}>
        {/* Desktop sidebar — hidden on mobile */}
        <div className="hidden md:flex" style={{
          width: 260, flexShrink: 0,
          background: '#FFFFFF',
          borderRight: '1px solid rgba(16,24,40,0.07)',
          flexDirection: 'column', overflowY: 'auto',
        }}>
          <div style={{ color: '#8b938f', fontSize: 11, letterSpacing: '1px', textTransform: 'uppercase', fontWeight: 700, padding: '20px 18px 10px' }}>
            Profile
          </div>
          <div style={{ padding: '0 12px 16px', flex: 1 }}>
            {menuGroups.map(group => (
              <div key={group.title} style={{ marginBottom: 18 }}>
                <div style={{ color: '#9aa19c', fontSize: 10, letterSpacing: '0.9px', textTransform: 'uppercase', fontWeight: 700, padding: '4px 6px 9px' }}>
                  {group.title}
                </div>
                {group.items.map(item => {
                  const isActive = activeTab === item.id;
                  return (
                    <button
                      key={item.id}
                      onClick={() => setActiveTab(item.id)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 12,
                        padding: '11px 13px', borderRadius: 11, width: '100%',
                        background: isActive ? `linear-gradient(135deg, ${teal[500]}, ${teal[700]})` : '#FFFFFF',
                        border: isActive ? '1px solid transparent' : '1px solid rgba(16,24,40,0.06)',
                        boxShadow: isActive ? `0 10px 22px -10px rgba(15,84,76,0.55)` : '0 1px 2px rgba(16,24,40,0.04)',
                        cursor: 'pointer', marginBottom: 8,
                        transition: 'all .15s ease', textAlign: 'left',
                      }}
                    >
                      <div style={{
                        width: 34, height: 34, borderRadius: 9,
                        background: isActive ? 'rgba(255,255,255,0.18)' : '#eef7f6',
                        color: isActive ? '#fff' : teal[600],
                        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                      }}>
                        <item.icon size={16} />
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: isActive ? '#fff' : '#23282A' }}>{item.label}</div>
                        <div style={{ fontSize: 10, color: isActive ? 'rgba(255,255,255,0.82)' : '#5c6567', marginTop: 1 }}>{item.desc}</div>
                      </div>
                      <ChevronRight size={12} style={{ color: isActive ? 'rgba(255,255,255,0.7)' : '#94a3b8' }} />
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </div>

        {/* Content area */}
        <div className="flex-1 overflow-y-auto p-4 md:p-7" style={{ background: 'linear-gradient(180deg, #F7F6F2 0%, #F2F1EB 100%)' }}>
          <div className="max-w-[920px] mx-auto">
            {saveMsg && (
              <div style={{
                marginBottom: 16, padding: '10px 14px', borderRadius: 10, fontSize: 13, fontWeight: 600,
                border: `1px solid ${saveMsg.includes('successfully') ? '#a6d9d3' : '#f0c4cd'}`,
                background: saveMsg.includes('successfully') ? '#e9f7f4' : '#fdeef0',
                color: saveMsg.includes('successfully') ? teal[700] : danger,
              }}>
                {saveMsg}
              </div>
            )}

            {/* Personal Info */}
            {activeTab === 'Personal' && (
              <form onSubmit={handleSave}>
                <div style={{ fontSize: 11, fontWeight: 700, color: teal[800], textTransform: 'uppercase', letterSpacing: 0.06, marginBottom: 10, paddingLeft: 10, borderLeft: `3px solid ${teal[500]}` }}>
                  Personal Information
                </div>
                <div className="white-card p-4 md:p-7">
                  <div className="grid grid-cols-1 gap-3.5 md:grid-cols-2 md:gap-4">
                    <div>
                      <label style={labelStyle}>Full Name</label>
                      <input style={inputStyle} name="full_name" value={form.full_name || ''} onChange={handleChange} placeholder="Your full name" />
                    </div>
                    <div>
                      <label style={labelStyle}>Email</label>
                      <input style={{ ...inputStyle, background: '#f5f4f0', color: inkSoft }} name="email" value={form.email || ''} disabled />
                    </div>
                    <div>
                      <label style={labelStyle}>Phone</label>
                      <input style={inputStyle} name="phone" value={form.phone || ''} onChange={handleChange} placeholder="Phone number" />
                    </div>
                    <div>
                      <label style={labelStyle}>Address</label>
                      <input style={inputStyle} name="address" value={form.address || ''} onChange={handleChange} placeholder="Street address" />
                    </div>
                    <div>
                      <label style={labelStyle}>City</label>
                      <input style={inputStyle} name="city" value={form.city || ''} onChange={handleChange} placeholder="City" />
                    </div>
                    <div>
                      <label style={labelStyle}>State / Province</label>
                      <input style={inputStyle} name="state" value={form.state || ''} onChange={handleChange} placeholder="State" />
                    </div>
                    <div>
                      <label style={labelStyle}>ZIP / Postal Code</label>
                      <input style={inputStyle} name="zip" value={form.zip || ''} onChange={handleChange} placeholder="ZIP code" />
                    </div>
                    <div>
                      <label style={labelStyle}>Country</label>
                      <input style={inputStyle} name="country" value={form.country || ''} onChange={handleChange} placeholder="Country" />
                    </div>
                  </div>
                  <div style={{ marginTop: 18, display: 'flex', justifyContent: 'flex-end' }}>
                    <button type="submit" style={{
                      fontFamily: "'Inter', sans-serif", fontSize: 13, fontWeight: 600,
                      padding: '9px 18px', borderRadius: 10, cursor: saving ? 'default' : 'pointer', border: 'none',
                      background: `linear-gradient(155deg, ${teal[500]}, ${teal[700]})`,
                      color: '#fff', display: 'flex', alignItems: 'center', gap: 7, opacity: saving ? 0.7 : 1,
                      boxShadow: `0 8px 20px -8px rgba(15,84,76,.6)`,
                    }}>
                      {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
                      {saving ? 'Saving...' : 'Save Changes'}
                    </button>
                  </div>
                </div>
              </form>
            )}

            {/* Notifications */}
            {activeTab === 'Notifications' && (
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: teal[800], textTransform: 'uppercase', letterSpacing: 0.06, marginBottom: 10, paddingLeft: 10, borderLeft: `3px solid ${teal[500]}` }}>
                  Notification Preferences
                </div>
                <div className="white-card p-4 md:p-7">
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 14, fontWeight: 600, color: ink }}>Browser notifications</div>
                      <p style={{ margin: '4px 0 0', fontSize: 11.5, color: inkSoft, lineHeight: 1.5 }}>
                        Receive native browser notifications for important portal events.
                      </p>
                    </div>
                    <label style={{ position: 'relative', display: 'inline-flex', flexShrink: 0, cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        className="toggle-input"
                        checked={browserNotifs}
                        onChange={(e) => {
                          const val = e.target.checked;
                          setBrowserNotifs(val);
                          localStorage.setItem('portal_browser_notifications', String(val));
                        }}
                      />
                      <span className="toggle-track" />
                    </label>
                  </div>
                </div>
              </div>
            )}

            {/* Password */}
            {activeTab === 'Password' && (
              <form onSubmit={handlePasswordChange}>
                <div style={{ fontSize: 11, fontWeight: 700, color: teal[800], textTransform: 'uppercase', letterSpacing: 0.06, marginBottom: 10, paddingLeft: 10, borderLeft: `3px solid ${teal[500]}` }}>
                  Change Password
                </div>
                <div className="white-card p-4 md:p-7">
                  {passwordMsg && (
                    <div style={{
                      marginBottom: 14, padding: '10px 14px', borderRadius: 10, fontSize: 13, fontWeight: 600,
                      border: '1px solid #A6D9D3', background: '#e9f7f4', color: teal[700],
                    }}>{passwordMsg}</div>
                  )}
                  {passwordError && <ErrorBanner message={passwordError} onDismiss={() => setPasswordError(null)} />}
                  <div className="grid grid-cols-1 gap-3.5 md:grid-cols-2 md:gap-4">
                    <div>
                      <label style={labelStyle}>Current Password</label>
                      <input style={inputStyle} type="password" value={passwordForm.currentPassword} onChange={(e) => setPasswordForm((p) => ({ ...p, currentPassword: e.target.value }))} />
                    </div>
                    <div>
                      <label style={labelStyle}>New Password</label>
                      <input style={inputStyle} type="password" value={passwordForm.newPassword} onChange={(e) => setPasswordForm((p) => ({ ...p, newPassword: e.target.value }))} />
                    </div>
                    <div className="md:col-span-2">
                      <label style={labelStyle}>Confirm Password</label>
                      <input style={inputStyle} type="password" value={passwordForm.confirmPassword} onChange={(e) => setPasswordForm((p) => ({ ...p, confirmPassword: e.target.value }))} />
                    </div>
                  </div>
                  <p style={{ fontSize: 11, color: inkSoft, marginTop: 10 }}>Password must be at least 6 characters long.</p>
                  <div style={{ marginTop: 18, display: 'flex', justifyContent: 'flex-end' }}>
                    <button
                      type="submit"
                      style={{
                        fontFamily: "'Inter', sans-serif", fontSize: 13, fontWeight: 600,
                        padding: '9px 18px', borderRadius: 10, cursor: changingPassword ? 'default' : 'pointer', border: 'none',
                        background: `linear-gradient(155deg, ${teal[500]}, ${teal[700]})`,
                        color: '#fff', display: 'flex', alignItems: 'center', gap: 7,
                        boxShadow: `0 8px 20px -8px rgba(15,84,76,.6)`, opacity: changingPassword ? 0.7 : 1,
                      }}
                      disabled={changingPassword || !passwordForm.currentPassword || !passwordForm.newPassword || !passwordForm.confirmPassword}
                    >
                      {changingPassword ? <Loader2 size={15} className="animate-spin" /> : <Lock size={15} />}
                      {changingPassword ? 'Changing...' : 'Change Password'}
                    </button>
                  </div>
                </div>
              </form>
            )}

            {/* 2FA */}
            {activeTab === 'TwoFactor' && (
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: teal[800], textTransform: 'uppercase', letterSpacing: 0.06, marginBottom: 10, paddingLeft: 10, borderLeft: `3px solid ${teal[500]}` }}>
                  Two-Factor Authentication
                </div>
                <div className="white-card p-4 md:p-7">
                  {twoFactorError && <ErrorBanner message={twoFactorError} onDismiss={() => setTwoFactorError(null)} />}

                  {twoFactorStatus?.enabled ? (
                    <>
                      <p style={{ fontSize: 13, color: inkSoft, marginBottom: 14 }}>
                        Two-factor authentication is <span style={{ color: ink, fontWeight: 600 }}>enabled</span>.
                      </p>
                      <form onSubmit={handle2FADisable} className="flex flex-col gap-3 md:flex-row md:items-end">
                        <div style={{ flex: 1 }}>
                          <label style={labelStyle}>Current 2FA Code</label>
                          <input style={{ ...inputStyle, maxWidth: 200 }} value={twoFactorCode} onChange={(e) => setTwoFactorCode(e.target.value)} disabled={twoFactorLoading} placeholder="000000" maxLength={6} />
                        </div>
                        <button type="submit" disabled={twoFactorLoading || !twoFactorCode} style={{
                          fontFamily: "'Inter', sans-serif", fontSize: 13, fontWeight: 600,
                          padding: '9px 18px', borderRadius: 10, cursor: twoFactorLoading ? 'default' : 'pointer',
                          background: '#fdf1f3', border: `1px solid #f0c4cd`, color: danger,
                          display: 'flex', alignItems: 'center', gap: 7, justifyContent: 'center',
                        }}>
                          {twoFactorLoading ? <Loader2 size={15} className="animate-spin" /> : <Lock size={15} />}
                          {twoFactorLoading ? 'Disabling...' : 'Disable 2FA'}
                        </button>
                      </form>
                    </>
                  ) : twoFactorSetup ? (
                    <>
                      <p style={{ fontSize: 13, color: inkSoft, marginBottom: 12 }}>
                        Scan this QR code with your authenticator app, then enter the verification code.
                      </p>
                      <div className="flex flex-col gap-4 items-center md:flex-row md:items-start">
                        <div style={{ flexShrink: 0, textAlign: 'center' }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 14, background: '#fff', border: `1px solid ${hairline}`, borderRadius: 10 }}>
                            {qrCodeDataUrl ? (
                              <img src={qrCodeDataUrl} alt="QR code" style={{ width: 160, height: 160, objectFit: 'contain' }} />
                            ) : (
                              <div style={{ width: 160, height: 160, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: inkSoft }}>Generating...</div>
                            )}
                          </div>
                        </div>
                        <form onSubmit={handle2FAEnable} style={{ flex: 1, minWidth: 200, display: 'flex', flexDirection: 'column', gap: 14 }}>
                          <div>
                            <label style={labelStyle}>Verification Code</label>
                            <input style={inputStyle} value={twoFactorCode} onChange={(e) => setTwoFactorCode(e.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="000000" maxLength={6} disabled={twoFactorLoading} />
                          </div>
                          <button type="submit" disabled={twoFactorLoading || twoFactorCode.length < 6} style={{
                            fontFamily: "'Inter', sans-serif", fontSize: 13, fontWeight: 600,
                            padding: '9px 18px', borderRadius: 10, cursor: twoFactorLoading ? 'default' : 'pointer', border: 'none',
                            background: `linear-gradient(155deg, ${teal[500]}, ${teal[700]})`,
                            color: '#fff', display: 'flex', alignItems: 'center', gap: 7, justifyContent: 'center',
                            boxShadow: `0 8px 20px -8px rgba(15,84,76,.6)`, opacity: twoFactorLoading || twoFactorCode.length < 6 ? 0.7 : 1,
                          }}>
                            {twoFactorLoading ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
                            {twoFactorLoading ? 'Enabling...' : 'Enable 2FA'}
                          </button>
                        </form>
                      </div>
                      <p style={{ fontSize: 11, color: inkSoft, marginTop: 12, wordBreak: 'break-all' }}>
                        Secret: <code style={{ fontSize: 10 }}>{twoFactorSetup.secret}</code>
                      </p>
                    </>
                  ) : (
                    <div>
                      <p style={{ fontSize: 13, color: inkSoft, marginBottom: 14 }}>
                        Add an extra layer of security with time-based one-time passwords (TOTP).
                      </p>
                      <button onClick={handle2FASetup} disabled={twoFactorLoading} style={{
                        fontFamily: "'Inter', sans-serif", fontSize: 13, fontWeight: 600,
                        padding: '9px 18px', borderRadius: 10, cursor: twoFactorLoading ? 'default' : 'pointer', border: 'none',
                        background: `linear-gradient(155deg, ${teal[500]}, ${teal[700]})`,
                        color: '#fff', display: 'flex', alignItems: 'center', gap: 7, justifyContent: 'center',
                        boxShadow: `0 8px 20px -8px rgba(15,84,76,.6)`, opacity: twoFactorLoading ? 0.7 : 1,
                      }}>
                        {twoFactorLoading ? <Loader2 size={15} className="animate-spin" /> : <Shield size={15} />}
                        {twoFactorLoading ? 'Setting up...' : 'Set Up 2FA'}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Sessions */}
            {activeTab === 'Sessions' && (
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: teal[800], textTransform: 'uppercase', letterSpacing: 0.06, marginBottom: 10, paddingLeft: 10, borderLeft: `3px solid ${teal[500]}` }}>
                  Active Sessions
                </div>
                <div className="white-card p-4 md:p-7">
                  {sessionsLoading ? (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px 0' }}>
                      <div className="w-6 h-6 border-2 border-teal-500/30 border-t-teal-600 rounded-full animate-spin" />
                    </div>
                  ) : sessions.length === 0 ? (
                    <p style={{ fontSize: 13, color: inkSoft, textAlign: 'center', padding: '20px 0' }}>No active sessions found.</p>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      {sessions.map((s) => {
                        const created = s.created_at ? new Date(s.created_at).toLocaleDateString() : '—';
                        const expires = s.expires_at ? new Date(s.expires_at).toLocaleDateString() : '—';
                        return (
                          <div key={s.id} style={{
                            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
                            padding: '12px 14px', background: '#fff', borderRadius: 12,
                            border: `1px solid ${hairline}`, flexWrap: 'wrap',
                          }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, flex: 1 }}>
                              <div style={{ width: 34, height: 34, borderRadius: 10, background: '#eef7f6', color: teal[600], display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                <Smartphone size={15} />
                              </div>
                              <div style={{ minWidth: 0 }}>
                                <p style={{ fontSize: 13, fontWeight: 600, color: ink, margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.user_agent || 'Unknown device'}</p>
                                <p style={{ fontSize: 10.5, color: inkSoft, marginTop: 2 }}>Created: {created} &bull; Expires: {expires}</p>
                              </div>
                            </div>
                            <button
                              onClick={() => setRevokeConfirmSessionId(s.id)}
                              disabled={revokingSessionId === s.id}
                              style={{
                                fontFamily: "'Inter', sans-serif", fontSize: 12, fontWeight: 600,
                                padding: '6px 12px', borderRadius: 8, cursor: revokingSessionId === s.id ? 'default' : 'pointer',
                                background: '#fdf1f3', border: '1px solid #f0c4c4', color: danger,
                              }}
                            >
                              {revokingSessionId === s.id ? 'Revoking...' : 'Revoke'}
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={revokeConfirmSessionId !== null}
        title="Revoke Session"
        message="Are you sure you want to revoke this session? The device will be signed out."
        confirmLabel="Revoke Session"
        variant="danger"
        onCancel={() => setRevokeConfirmSessionId(null)}
        onConfirm={() => { if (revokeConfirmSessionId) handleRevokeSession(revokeConfirmSessionId); }}
      />
    </div>
  );
};

export default CustomerProfile;
