
import React, { useState, useRef } from 'react';
import { Users, Shield, Lock, Plus, Edit2, Trash2, Check, X, Key, Loader2, Camera, ShieldCheck, QrCode, Smartphone } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { User, UserGroup } from '../../types';
import { AVAILABLE_PERMISSIONS } from '../../constants';
import { localFileStorage } from '../../services/localFileStorage';
import { OfflineImage } from '../../components/OfflineImage';
import { useConfirmDialog } from '../../components/ConfirmDialog';

const t = { 50: '#eef7f6', 100: '#d3ece9', 200: '#a6d9d3', 300: '#72c0b7', 400: '#3fa294', 500: '#1f8577', 600: '#146b60', 700: '#0f544c', 800: '#0b3e39', 900: '#082e2a' };
const amber = { 100: '#fbead0', 300: '#eec27a', 500: '#d99a3f', 600: '#b97e2b' };
const paper = '#FEFDFB'; const ink = '#23282A'; const inkSoft = '#5c6567'; const hairline = '#E7E3DA'; const danger = '#c0495f';
const canvas = '#F5F4EF';

const inputBase = {
  fontFamily: "'Inter','DM Sans',sans-serif", fontSize: 13.5, padding: '10px 13px', borderRadius: 10,
  border: '1px solid #e2ded3', background: '#fff', color: ink, outline: 'none',
  boxShadow: 'inset 0 1px 2px rgba(16,24,40,0.03)', lineHeight: 1.4, width: '100%', boxSizing: 'border-box' as const
};

const btnPrimaryStyle = {
  fontFamily: "'Inter','DM Sans',sans-serif", fontSize: 13, fontWeight: 600,
  padding: '9px 18px', borderRadius: 10, border: 'none', cursor: 'pointer',
  background: `linear-gradient(155deg, ${t[500]}, ${t[700]})`, color: '#fff',
  display: 'flex', alignItems: 'center', gap: 8,
  boxShadow: `0 8px 20px -8px rgba(15,84,76,0.6)`, lineHeight: 1.4, transition: 'all .15s ease'
};

const cardStyle: React.CSSProperties = {
  background: '#FFFFFF', borderRadius: 14,
  border: '1px solid rgba(16,24,40,0.07)',
  boxShadow: '0 1px 2px rgba(16,24,40,0.04), 0 12px 30px -16px rgba(16,24,40,0.18)'
};

const adminStyles = `
  .premium-admin input:not([type=checkbox]):not([type=radio]):focus,
  .premium-admin textarea:focus,
  .premium-admin select:focus {
    outline: none;
    border-color: ${t[500]} !important;
    box-shadow: 0 0 0 3px rgba(31,133,119,0.18) !important;
  }
  .premium-admin input[type=checkbox] { accent-color: ${t[500]}; }
`;


const UserManagement: React.FC = () => {
  const { allUsers, userGroups, manageUser, deleteUser, manageUserGroup, deleteUserGroup, passwordPolicy, updatePasswordPolicy, checkPermission, validatePasswordStrength, notify } = useAuth();
  const { confirm, ConfirmDialogComponent } = useConfirmDialog();
  const [activeTab, setActiveTab] = useState<'Users' | 'Groups' | 'Policies'>('Users');

  // User Modal State
  const [isUserModalOpen, setIsUserModalOpen] = useState(false);
  const [editUser, setEditUser] = useState<Partial<User>>({});
  const [passwordError, setPasswordError] = useState<string[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // MFA Setup State
  const [showMfaSetup, setShowMfaSetup] = useState(false);
  const [mfaStep, setMfaStep] = useState(1);
  const [tempMfaSecret, setTempMfaSecret] = useState('');
  const [mfaCode, setMfaCode] = useState('');

  // Group Modal State
  const [isGroupModalOpen, setIsGroupModalOpen] = useState(false);
  const [editGroup, setEditGroup] = useState<Partial<UserGroup>>({});

  const handleUserSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editUser.username || !editUser.name) return;

    // Validate Password if changed/new
    if (editUser.password) {
       const validation = validatePasswordStrength(editUser.password);
       if (!validation.valid) {
          setPasswordError(validation.errors);
          return;
       }
    }

    setIsSaving(true);
    setPasswordError([]);
    try {
      await manageUser(editUser as User);
      setIsUserModalOpen(false);
    } catch (err: any) {
      setPasswordError([err?.message || 'Failed to save user.']);
    } finally {
      setIsSaving(false);
    }
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
          try {
              const id = await localFileStorage.save(file);
              setEditUser(prev => ({ ...prev, avatar: id }));
              notify("Photo uploaded successfully", "success");
          } catch (error) {
              notify("Failed to save photo", "error");
          }
      }
  };

  const startMfaSetup = (user: User) => {
      setEditUser(user);
      setTempMfaSecret('NEXUS-' + Math.random().toString(36).substring(2, 10).toUpperCase());
      setMfaStep(1);
      setShowMfaSetup(true);
  };

  const verifyMfaCode = () => {
      // In a real system, we'd use a TOTP library to verify the code against the secret.
      // For this native-desktop prototype, we'll implement a validation rule (must be 6 digits).
      if (/^\d{6}$/.test(mfaCode)) {
          setMfaStep(2);
          setTimeout(async () => {
              await manageUser({ ...editUser as User, mfaEnabled: true, mfaSecret: tempMfaSecret, securityLevel: 'Elevated' });
              setShowMfaSetup(false);
              notify("MFA Enabled Successfully", "success");
          }, 1000);
      } else {
          notify("Invalid 6-digit security code.", "error");
      }
  };

  const handleGroupSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editGroup.name) return;
    manageUserGroup(editGroup as UserGroup);
    setIsGroupModalOpen(false);
  };

  const togglePermission = (permId: string) => {
    const currentPerms = editGroup.permissions || [];
    if (currentPerms.includes(permId)) {
      setEditGroup({ ...editGroup, permissions: currentPerms.filter(p => p !== permId) });
    } else {
      setEditGroup({ ...editGroup, permissions: [...currentPerms, permId] });
    }
  };

  const handleEnforceMfa = async () => {
      const ok = await confirm({
          title: 'Enforce MFA',
          message: 'This will enable MFA for all active users. Continue?',
          type: 'warning',
          confirmText: 'Enforce',
      });
      if (ok) {
          for(const u of allUsers) {
              if(u.active && !u.mfaEnabled) {
                  await manageUser({...u, mfaEnabled: true, securityLevel: 'Elevated'});
              }
          }
          notify("MFA Enforced for all active users", "success");
      }
  };

  const renderUsers = () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, color: ink, margin: 0 }}>System Users</h2>
         <button onClick={() => { setEditUser({ id: '', active: true, mfaEnabled: false, groupIds: [], securityLevel: 'Standard' }); setPasswordError([]); setIsUserModalOpen(true); }} className="prime-btn" style={{ ...btnPrimaryStyle, padding: '8px 16px', gap: 8 }}>
          <Plus size={18}/> Add User
        </button>
      </div>

      <div className="prime-card" style={{ ...cardStyle, overflow: 'hidden' }}>
        <table style={{ width: '100%', textAlign: 'left', fontSize: 13, borderCollapse: 'collapse' }}>
          <thead style={{ background: t[50] }}>
            <tr>
              <th className="prime-table-header" style={{ padding: '12px 16px', fontSize: 11, fontWeight: 700, color: inkSoft, textTransform: 'uppercase', letterSpacing: 0.5 }}>User</th>
              <th className="prime-table-header" style={{ padding: '12px 16px', fontSize: 11, fontWeight: 700, color: inkSoft, textTransform: 'uppercase', letterSpacing: 0.5 }}>Role</th>
              <th className="prime-table-header" style={{ padding: '12px 16px', fontSize: 11, fontWeight: 700, color: inkSoft, textTransform: 'uppercase', letterSpacing: 0.5 }}>Groups</th>
              <th className="prime-table-header" style={{ padding: '12px 16px', fontSize: 11, fontWeight: 700, color: inkSoft, textTransform: 'uppercase', letterSpacing: 0.5 }}>Security</th>
              <th className="prime-table-header" style={{ padding: '12px 16px', fontSize: 11, fontWeight: 700, color: inkSoft, textTransform: 'uppercase', letterSpacing: 0.5 }}>Status</th>
              <th className="prime-table-header" style={{ padding: '12px 16px', fontSize: 11, fontWeight: 700, color: inkSoft, textTransform: 'uppercase', letterSpacing: 0.5, textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody style={{ borderTop: `1.4px solid ${hairline}` }}>
            {allUsers.map(u => (
              <tr key={u.id} style={{ borderBottom: `1px solid ${hairline}`, transition: 'background 0.1s' }}
                onMouseEnter={e => e.currentTarget.style.background = t[50]}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              >
                <td className="prime-table-cell" style={{ padding: '12px 16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ width: 32, height: 32, borderRadius: '50%', background: t[100], display: 'flex', alignItems: 'center', justifyContent: 'center', color: t[600], fontWeight: 700, fontSize: 11, overflow: 'hidden', border: `1px solid ${t[200]}` }}>
                      <OfflineImage src={u.avatar} alt={u.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} fallback={u.name.substring(0, 2)}/>
                    </div>
                    <div>
                      <div style={{ fontWeight: 500, color: ink }}>{u.name}</div>
                      <div style={{ fontSize: 12, color: inkSoft }}>@{u.username}</div>
                    </div>
                  </div>
                </td>
                <td className="prime-table-cell" style={{ padding: '12px 16px', color: ink }}>{u.role}</td>
                <td className="prime-table-cell" style={{ padding: '12px 16px' }}>
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                    {u.groupIds?.map(gid => {
                      const g = userGroups.find(grp => grp.id === gid);
                      return g ? <span key={gid} style={{ padding: '2px 8px', background: t[50], color: t[700], borderRadius: 4, fontSize: 11, border: `1px solid ${t[100]}` }}>{g.name}</span> : null;
                    })}
                  </div>
                </td>
                <td className="prime-table-cell" style={{ padding: '12px 16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ width: 8, height: 8, borderRadius: '50%', background: u.mfaEnabled ? t[500] : amber[500], flexShrink: 0 }}></div>
                      <div style={{ display: 'flex', flexDirection: 'column' }}>
                          <span style={{ fontSize: 12, fontWeight: 700, color: ink }}>{u.securityLevel || 'Standard'}</span>
                          <button 
                            onClick={() => !u.mfaEnabled && startMfaSetup(u)}
                            style={{ fontSize: 10, fontFamily: "'Inter','DM Sans',sans-serif", textTransform: 'uppercase', fontWeight: 800, letterSpacing: 1, background: 'none', border: 'none', cursor: u.mfaEnabled ? 'default' : 'pointer', padding: 0, color: u.mfaEnabled ? t[600] : t[500] }}
                          >
                              {u.mfaEnabled ? 'MFA ACTIVE' : 'SETUP MFA'}
                          </button>
                      </div>
                  </div>
                </td>
                <td className="prime-table-cell" style={{ padding: '12px 16px' }}>
                  <span style={{ padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700, display: 'inline-block', background: u.active ? '#d3ece9' : '#fbead0', color: u.active ? t[800] : '#23282A' }}>
                    {u.active ? 'Active' : 'Inactive'}
                  </span>
                </td>
                <td className="prime-table-cell" style={{ padding: '12px 16px', textAlign: 'right' }}>
                  <button onClick={() => { setEditUser({...u, password: ''}); setPasswordError([]); setIsUserModalOpen(true); }} className="prime-btn-secondary" style={{ padding: 6, background: 'none', border: 'none', color: inkSoft, cursor: 'pointer', borderRadius: 6 }} onMouseEnter={e => e.currentTarget.style.color = t[500]} onMouseLeave={e => e.currentTarget.style.color = inkSoft}><Edit2 size={16}/></button>
                  <button onClick={() => deleteUser(u.id)} className="prime-btn-secondary" style={{ padding: 6, background: 'none', border: 'none', color: inkSoft, cursor: 'pointer', borderRadius: 6 }} onMouseEnter={e => e.currentTarget.style.color = danger} onMouseLeave={e => e.currentTarget.style.color = inkSoft}><Trash2 size={16}/></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );

  const renderGroups = () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, color: ink, margin: 0 }}>User Groups & Roles</h2>
         <button onClick={() => { setEditGroup({ id: '', permissions: [] }); setIsGroupModalOpen(true); }} className="prime-btn" style={{ ...btnPrimaryStyle, padding: '8px 16px', gap: 8 }}>
          <Plus size={18}/> New Group
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 20 }}>
        {userGroups.map(g => (
           <div key={g.id} className="prime-card" style={{ ...cardStyle, padding: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
              <div>
                <h3 style={{ fontWeight: 700, color: ink, margin: 0, fontSize: 15 }}>{g.name}</h3>
                <p style={{ fontSize: 12, color: inkSoft, margin: '4px 0 0' }}>{g.description || 'No description'}</p>
              </div>
              <div style={{ display: 'flex', gap: 4 }}>
                 <button onClick={() => { setEditGroup(g); setIsGroupModalOpen(true); }} className="prime-btn-secondary" style={{ padding: 6, background: 'none', border: 'none', color: inkSoft, cursor: 'pointer', borderRadius: 6 }} onMouseEnter={e => e.currentTarget.style.color = t[500]} onMouseLeave={e => e.currentTarget.style.color = inkSoft}><Edit2 size={16}/></button>
                 <button onClick={() => deleteUserGroup(g.id)} className="prime-btn-secondary" style={{ padding: 6, background: 'none', border: 'none', color: inkSoft, cursor: 'pointer', borderRadius: 6 }} onMouseEnter={e => e.currentTarget.style.color = danger} onMouseLeave={e => e.currentTarget.style.color = inkSoft}><Trash2 size={16}/></button>
              </div>
            </div>
            <div style={{ fontSize: 11, color: inkSoft, marginBottom: 8, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>Permissions</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {(g.permissions || []).slice(0, 5).map(p => (
                <span key={p} style={{ padding: '3px 8px', background: t[50], color: t[700], borderRadius: 6, fontSize: 11, border: `1px solid ${t[100]}` }}>
                  {AVAILABLE_PERMISSIONS.find(ap => ap.id === p)?.label || p}
                </span>
              ))}
              {(g.permissions || []).length > 5 && <span style={{ fontSize: 12, color: inkSoft, display: 'flex', alignItems: 'center' }}>+{g.permissions.length - 5} more</span>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  const renderPolicies = () => (
    <div style={{ maxWidth: 560 }}>
       <h2 style={{ fontSize: 18, fontWeight: 700, color: ink, margin: '0 0 20px' }}>Global Security Policies</h2>
        <div className="prime-card" style={{ ...cardStyle, padding: 24, display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: `1px solid ${hairline}`, paddingBottom: 20 }}>
             <div>
                <h3 style={{ fontWeight: 700, color: ink, margin: 0, fontSize: 15 }}>Password Complexity</h3>
                <p style={{ fontSize: 13, color: inkSoft, margin: '2px 0 0' }}>Minimum requirements for user passwords</p>
             </div>
             <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', gap: 8 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, color: ink }}>
                   <input type="checkbox" style={{ width: 16, height: 16, accentColor: t[500] }} checked={passwordPolicy.requireSpecialChar} onChange={e => updatePasswordPolicy({...passwordPolicy, requireSpecialChar: e.target.checked})}/>
                   Require Special Character
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, color: ink }}>
                   <input type="checkbox" style={{ width: 16, height: 16, accentColor: t[500] }} checked={passwordPolicy.requireNumber} onChange={e => updatePasswordPolicy({...passwordPolicy, requireNumber: e.target.checked})}/>
                   Require Number
                </label>
             </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
             <div>
                <label className="prime-label" style={{ fontSize: 12, fontWeight: 600, color: ink, marginBottom: 6, display: 'block' }}>Minimum Length</label>
                <input className="prime-input" type="number" style={inputBase} value={passwordPolicy.minLength} onChange={e => updatePasswordPolicy({...passwordPolicy, minLength: parseInt(e.target.value)})} />
             </div>
             <div>
                <label className="prime-label" style={{ fontSize: 12, fontWeight: 600, color: ink, marginBottom: 6, display: 'block' }}>Expiration (Days)</label>
                <input className="prime-input" type="number" style={inputBase} value={passwordPolicy.expiryDays} onChange={e => updatePasswordPolicy({...passwordPolicy, expiryDays: parseInt(e.target.value)})} />
             </div>
          </div>
          
          <div style={{ padding: 16, background: t[50], borderRadius: 10, border: `1px solid ${t[100]}`, display: 'flex', gap: 12, alignItems: 'flex-start' }}>
             <Lock style={{ color: t[600], flexShrink: 0, marginTop: 2 }} size={20}/>
             <div>
                <h4 style={{ fontWeight: 700, color: t[800], fontSize: 13, margin: 0 }}>MFA Enforcement</h4>
                <p style={{ fontSize: 12, color: t[600], margin: '4px 0' }}>Multi-Factor Authentication is currently optional. Enable strict mode to force MFA for all Admin and Manager accounts.</p>
                 <button onClick={handleEnforceMfa} className="prime-btn" style={{ ...btnPrimaryStyle, marginTop: 8, padding: '6px 14px', borderRadius: 8, fontWeight: 700, fontSize: 12 }}>Enforce MFA Across System</button>
             </div>
          </div>
       </div>
    </div>
  );

  return (
    <div className="premium-admin" style={{ padding: 24, maxWidth: 1600, margin: '0 auto', fontFamily: "'Inter','DM Sans',sans-serif", fontSize: 13.5, color: ink, minHeight: '100%', background: 'linear-gradient(180deg, #F7F6F2 0%, #F2F1EB 100%)' }}>
      <style>{adminStyles}</style>
      {/* User Modal */}
      {isUserModalOpen && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(15,23,42,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
            <div className="prime-card" style={{ background: '#fff', borderRadius: 14, border: '1px solid rgba(16,24,40,0.07)', boxShadow: '0 30px 70px -20px rgba(0,0,0,.55)', width: '100%', maxWidth: 480, padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
              <h2 style={{ fontSize: 20, fontWeight: 700, color: ink, margin: 0 }}>{editUser.id ? 'Edit User' : 'New User'}</h2>
              <form onSubmit={handleUserSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                 <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 8 }}>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                        <div style={{ position: 'relative', width: 96, height: 96, borderRadius: '50%', background: t[50], border: `2px solid ${hairline}`, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }} onClick={() => fileInputRef.current?.click()}>
                            {editUser.avatar ? (
                                <OfflineImage src={editUser.avatar} alt="Avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }}/>
                            ) : (
                                <Camera size={24} color={inkSoft}/>
                            )}
                            <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 11, fontWeight: 700 }}>Change</div>
                            <input type="file" ref={fileInputRef} style={{ display: 'none' }} accept="image/*" onChange={handleAvatarUpload}/>
                        </div>
                        <button type="button" onClick={() => fileInputRef.current?.click()} className="prime-btn-secondary" style={{ fontSize: 12, color: t[500], fontWeight: 700, background: 'none', border: 'none', cursor: 'pointer' }}>Upload Photo</button>
                    </div>
                 </div>

                 <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div>
                       <label className="prime-label" style={{ fontSize: 11, fontWeight: 700, color: inkSoft, textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>Username</label>
                       <input className="prime-input" type="text" style={inputBase} value={editUser.username} onChange={e => setEditUser({...editUser, username: e.target.value})}/>
                    </div>
                    <div>
                       <label className="prime-label" style={{ fontSize: 11, fontWeight: 700, color: inkSoft, textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>Full Name</label>
                       <input className="prime-input" type="text" style={inputBase} value={editUser.name} onChange={e => setEditUser({...editUser, name: e.target.value})}/>
                    </div>
                 </div>
                 <div>
                    <label className="prime-label" style={{ fontSize: 11, fontWeight: 700, color: inkSoft, textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>Role</label>
                    <select className="prime-select" style={{ ...inputBase, appearance: 'auto' as any, cursor: 'pointer' }} value={editUser.role} onChange={e => setEditUser({...editUser, role: e.target.value})}>
                       <option value="Admin">Admin</option>
                       <option value="Manager">Manager</option>
                       <option value="Cashier">Cashier</option>
                       <option value="Operator">Operator</option>
                    </select>
                 </div>
                 <div>
                     <label className="prime-label" style={{ fontSize: 11, fontWeight: 700, color: inkSoft, textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>Password {editUser.id && '(Leave blank to keep current)'}</label>
                     <input className="prime-input" type="password" style={{ ...inputBase, borderColor: passwordError.length > 0 ? danger : hairline, background: passwordError.length > 0 ? '#fef7f6' : '#fff' }} value={editUser.password || ''} onChange={e => setEditUser({...editUser, password: e.target.value})} placeholder={editUser.id ? "********" : "Enter password"} />
                     {passwordError.map((err, i) => <div key={i} style={{ fontSize: 12, color: danger, marginTop: 2 }}>{err}</div>)}
                 </div>
                 <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: 12, borderTop: `1px solid ${hairline}` }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13 }}>
                       <input type="checkbox" checked={editUser.active} onChange={e => setEditUser({...editUser, active: e.target.checked})} style={{ accentColor: t[500], width: 16, height: 16 }}/>
                       Active Account
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13 }}>
                       <input type="checkbox" checked={editUser.mfaEnabled} onChange={e => setEditUser({...editUser, mfaEnabled: e.target.checked})} style={{ accentColor: t[500], width: 16, height: 16 }}/>
                       MFA Enabled
                    </label>
                 </div>
                 <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
                    <button type="button" onClick={() => setIsUserModalOpen(false)} className="prime-btn-secondary" style={{ flex: 1, padding: '10px 16px', border: `1.4px solid ${hairline}`, borderRadius: 10, fontWeight: 600, color: ink, background: 'transparent', cursor: 'pointer', fontSize: 13, lineHeight: 1.4 }}>Cancel</button>
                     <button type="submit" disabled={isSaving} className="prime-btn" style={{ ...btnPrimaryStyle, flex: 1, padding: '10px 16px', justifyContent: 'center', cursor: isSaving ? 'default' : 'pointer', opacity: isSaving ? 0.7 : 1 }}>
                        {isSaving ? <><Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }}/> Saving...</> : 'Save User'}
                    </button>
                 </div>
              </form>
           </div>
        </div>
      )}

      {/* MFA SETUP MODAL */}
      {showMfaSetup && (
          <div style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, backdropFilter: 'blur(4px)' }}>
               <div className="prime-card" style={{ background: '#fff', borderRadius: 14, width: '100%', maxWidth: 420, overflow: 'hidden', border: '1px solid rgba(16,24,40,0.07)', boxShadow: '0 30px 70px -20px rgba(0,0,0,.55)' }}>
                  <div style={{ padding: 16, background: t[800], color: '#fff', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
                          <ShieldCheck style={{ color: t[200] }}/> Security Activation
                      </h2>
                      <button onClick={() => setShowMfaSetup(false)} style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer' }}><X/></button>
                  </div>
                  
                  <div style={{ padding: '24px 32px', textAlign: 'center' }}>
                      {mfaStep === 1 ? (
                          <div>
                              <div style={{ width: 64, height: 64, background: t[50], color: t[600], borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
                                  <Smartphone size={32}/>
                              </div>
                              <h3 style={{ fontSize: 17, fontWeight: 700, color: ink, margin: '0 0 8px' }}>Authenticator App</h3>
                              <p style={{ fontSize: 13, color: inkSoft, marginBottom: 20 }}>Scan this QR code with Google Authenticator or Microsoft Authenticator.</p>
                              
                              <div style={{ width: 160, height: 160, background: t[50], borderRadius: 12, margin: '0 auto 20px', display: 'flex', alignItems: 'center', justifyContent: 'center', border: `2px solid ${hairline}` }}>
                                  <QrCode size={100} style={{ color: ink, opacity: 0.8 }}/>
                              </div>
                              
                              <div style={{ marginBottom: 20 }}>
                                  <p style={{ fontSize: 10, fontWeight: 700, color: inkSoft, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>Manual Entry Code</p>
                                  <div style={{ fontFamily: "'JetBrains Mono', monospace", background: t[50], padding: 8, borderRadius: 8, border: `1px solid ${hairline}`, color: t[600], fontWeight: 700, fontSize: 14 }}>
                                      {tempMfaSecret}
                                  </div>
                              </div>
                              
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                                  <input type="text" style={{ width: '100%', textAlign: 'center', fontSize: 22, fontWeight: 800, letterSpacing: '0.3em', padding: 10, border: `2px solid ${t[100]}`, borderRadius: 10, outline: 'none', background: '#fff', color: ink, fontFamily: "'Inter','DM Sans',sans-serif", boxSizing: 'border-box' }} placeholder="000000" maxLength={6} value={mfaCode} onChange={e => setMfaCode(e.target.value)} />
                                  <button onClick={verifyMfaCode} className="prime-btn" style={{ width: '100%', padding: 12, background: t[800], color: '#fff', border: 'none', borderRadius: 10, fontWeight: 700, fontSize: 14, cursor: 'pointer', lineHeight: 1.4 }}>
                                      Verify & Activate
                                  </button>
                              </div>
                          </div>
                      ) : (
                          <div style={{ padding: '32px 0' }}>
                              <div style={{ width: 80, height: 80, background: t[100], color: t[600], borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
                                  <Check size={40} strokeWidth={3}/>
                              </div>
                              <h3 style={{ fontSize: 22, fontWeight: 700, color: ink, margin: '0 0 8px' }}>MFA Verified</h3>
                              <p style={{ color: inkSoft, marginBottom: 24 }}>Elevated security has been applied to this account.</p>
                              <div className="prime-label" style={{ background: t[50], padding: 12, borderRadius: 10, border: `1px solid ${hairline}`, display: 'inline-block' }}>
                                  <p style={{ fontSize: 11, fontWeight: 700, color: inkSoft, textTransform: 'uppercase', margin: 0 }}>Security Level</p>
                                  <p style={{ color: t[600], fontWeight: 800, margin: '2px 0 0', fontSize: 15 }}>ELEVATED</p>
                              </div>
                          </div>
                      )}
                  </div>
              </div>
          </div>
      )}

      {/* Group Modal */}
      {isGroupModalOpen && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(15,23,42,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
            <div className="prime-card" style={{ background: '#fff', borderRadius: 14, border: '1px solid rgba(16,24,40,0.07)', boxShadow: '0 30px 70px -20px rgba(0,0,0,.55)', width: '100%', maxWidth: 900, height: '80vh', display: 'flex', flexDirection: 'column' }}>
              <div style={{ padding: '16px 20px', borderBottom: `1px solid ${hairline}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                 <h2 style={{ fontSize: 20, fontWeight: 700, color: ink, margin: 0 }}>{editGroup.id ? 'Edit User Group' : 'Create User Group'}</h2>
                 <button onClick={() => setIsGroupModalOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: inkSoft }}><X/></button>
              </div>
              <div style={{ flex: 1, overflow: 'hidden', display: 'flex' }}>
                 <div style={{ width: '33.33%', padding: 16, borderRight: `1px solid ${hairline}`, display: 'flex', flexDirection: 'column', gap: 16 }}>
                    <div>
                       <label className="prime-label" style={{ fontSize: 11, fontWeight: 700, color: inkSoft, textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>Group Name</label>
                       <input className="prime-input" type="text" style={inputBase} value={editGroup.name} onChange={e => setEditGroup({...editGroup, name: e.target.value})}/>
                    </div>
                    <div>
                       <label className="prime-label" style={{ fontSize: 11, fontWeight: 700, color: inkSoft, textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>Description</label>
                       <textarea className="prime-input" style={{ ...inputBase, height: 96, resize: 'none', boxSizing: 'border-box' }} value={editGroup.description} onChange={e => setEditGroup({...editGroup, description: e.target.value})}/>
                    </div>
                 </div>
                 <div style={{ flex: 1, padding: 16, overflowY: 'auto', background: t[50] }}>
                    <h3 style={{ fontSize: 14, fontWeight: 700, color: ink, margin: '0 0 16px' }}>Permissions Matrix</h3>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                       {Array.from(new Set(AVAILABLE_PERMISSIONS.map(p => p.module))).map(module => (
                           <div key={module} className="prime-card" style={{ ...cardStyle, padding: 14, borderRadius: 10 }}>
                             <h4 style={{ fontSize: 11, fontWeight: 700, color: inkSoft, textTransform: 'uppercase', margin: '0 0 10px', paddingBottom: 8, borderBottom: `1px solid ${hairline}` }}>{module}</h4>
                             <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                {AVAILABLE_PERMISSIONS.filter(p => p.module === module).map(perm => (
                                   <label key={perm.id} style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontSize: 13, color: ink, padding: 4, borderRadius: 4 }}>
                                      <input type="checkbox" style={{ accentColor: t[500], width: 16, height: 16 }} checked={editGroup.permissions?.includes(perm.id)} onChange={() => togglePermission(perm.id)} />
                                      {perm.label}
                                   </label>
                                ))}
                             </div>
                          </div>
                       ))}
                    </div>
                 </div>
              </div>
              <div style={{ padding: '12px 20px', borderTop: `1px solid ${hairline}`, display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
                 <button onClick={() => setIsGroupModalOpen(false)} className="prime-btn-secondary" style={{ padding: '8px 20px', border: `1.4px solid ${hairline}`, borderRadius: 10, fontWeight: 600, color: ink, background: 'transparent', cursor: 'pointer', fontSize: 13 }}>Cancel</button>
                 <button onClick={handleGroupSubmit} className="prime-btn" style={{ ...btnPrimaryStyle, padding: '8px 20px', fontWeight: 700 }}>Save Group</button>
              </div>
           </div>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', marginBottom: 26 }}>
         <div>
            <h1 style={{ fontFamily: "'DM Serif Display', 'Georgia', serif", fontWeight: 400, fontSize: 24, color: t[800], display: 'flex', alignItems: 'center', gap: 10, margin: 0, letterSpacing: 0.2 }}>
               <Shield style={{ color: t[500] }}/> Security &amp; Access Control
            </h1>
            <p style={{ color: inkSoft, margin: '4px 0 0', fontSize: 13 }}>Configure user accounts, permission roles, and global security policies.</p>
         </div>
      </div>

      <div className="prime-btn-secondary" style={{ display: 'flex', gap: 4, background: '#FFFFFF', padding: 4, borderRadius: 12, width: 'fit-content', marginBottom: 26, border: '1px solid rgba(16,24,40,0.07)', boxShadow: '0 1px 2px rgba(16,24,40,0.04)' }}>
         <button onClick={() => setActiveTab('Users')} style={{ padding: '8px 20px', borderRadius: 9, fontSize: 13, fontWeight: 700, border: 'none', cursor: 'pointer', transition: 'all .15s ease', background: activeTab === 'Users' ? `linear-gradient(135deg, ${t[500]}, ${t[700]})` : 'transparent', color: activeTab === 'Users' ? '#fff' : inkSoft, boxShadow: activeTab === 'Users' ? `0 6px 16px -8px rgba(15,84,76,0.55)` : 'none', lineHeight: 1.4 }}>
            Users
         </button>
         <button onClick={() => setActiveTab('Groups')} style={{ padding: '8px 20px', borderRadius: 9, fontSize: 13, fontWeight: 700, border: 'none', cursor: 'pointer', transition: 'all .15s ease', background: activeTab === 'Groups' ? `linear-gradient(135deg, ${t[500]}, ${t[700]})` : 'transparent', color: activeTab === 'Groups' ? '#fff' : inkSoft, boxShadow: activeTab === 'Groups' ? `0 6px 16px -8px rgba(15,84,76,0.55)` : 'none', lineHeight: 1.4 }}>
            Groups &amp; Roles
         </button>
         <button onClick={() => setActiveTab('Policies')} style={{ padding: '8px 20px', borderRadius: 9, fontSize: 13, fontWeight: 700, border: 'none', cursor: 'pointer', transition: 'all .15s ease', background: activeTab === 'Policies' ? `linear-gradient(135deg, ${t[500]}, ${t[700]})` : 'transparent', color: activeTab === 'Policies' ? '#fff' : inkSoft, boxShadow: activeTab === 'Policies' ? `0 6px 16px -8px rgba(15,84,76,0.55)` : 'none', lineHeight: 1.4 }}>
            Security Policies
         </button>
      </div>

      <div>
         {activeTab === 'Users' && renderUsers()}
         {activeTab === 'Groups' && renderGroups()}
         {activeTab === 'Policies' && renderPolicies()}
      </div>
      <ConfirmDialogComponent />
    </div>
  );
};

export default UserManagement;
