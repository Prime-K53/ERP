
import React, { useState, useMemo, useRef, useEffect } from 'react';
import { logger } from '../services/logger';
import { useAuth } from '../context/AuthContext';
import { 
  User as UserIcon, Mail, Shield, Key, Clock, Activity, History, ArrowLeft, Save, Eye, EyeOff, 
  CheckCircle2, AlertCircle, Camera, Edit2, X, Check, Globe, Phone, Briefcase, Trash2, 
  ChevronRight, Upload, Loader2, Image as ImageIcon
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import Dialog from '../components/Dialog';
import { cloudDb } from '../services/cloudDb';
import './profile.css';

const teal={50:'#eef7f6',100:'#d3ece9',200:'#a6d9d3',300:'#72c0b7',400:'#3fa294',500:'#1f8577',600:'#146b60',700:'#0f544c',800:'#0b3e39',900:'#082e2a'};
const amber={100:'#fbead0',300:'#eec27a',500:'#d99a3f',600:'#b97e2b'};
const paper='#FEFDFB',ink='#23282A',inkSoft='#5c6567',hairline='#e4ddd1',danger='#b5493f';

const TIMEZONES = [
  { label: 'UTC (GMT)', value: 'UTC' },
  { label: 'Africa/Blantyre (Malawi)', value: 'Africa/Blantyre' },
  { label: 'Africa/Johannesburg', value: 'Africa/Johannesburg' },
  { label: 'Africa/Nairobi', value: 'Africa/Nairobi' },
  { label: 'Europe/London', value: 'Europe/London' },
  { label: 'America/New_York', value: 'America/New_York' },
  { label: 'Asia/Dubai', value: 'Asia/Dubai' },
];

const PREDEFINED_AVATARS = [
  'https://ui-avatars.com/api/?name=Admin&background=0D8ABC&color=fff',
  'https://ui-avatars.com/api/?name=User&background=6366f1&color=fff',
  'https://ui-avatars.com/api/?name=Staff&background=10b981&color=fff',
  'https://ui-avatars.com/api/?name=Manager&background=f59e0b&color=fff',
];

const Profile: React.FC = () => {
  const { user, allUsers, auditLogs, notify, manageUser, validatePasswordStrength } = useAuth();
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Profile data state
  const [profileData, setProfileData] = useState({
    fullName: user?.fullName || user?.name || '',
    email: user?.email || '',
    phone: (user as Record<string, unknown>)?.phone as string || '',
    jobTitle: (user as Record<string, unknown>)?.jobTitle as string || '',
    timezone: (user as Record<string, unknown>)?.timezone as string || 'Africa/Blantyre',
    profilePhoto: (user as Record<string, unknown>)?.profilePhoto as string || '',
  });

  const [originalData, setOriginalData] = useState({ ...profileData });
  const [isEditingName, setIsEditingName] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);

  // Password state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPasswords, setShowPasswords] = useState(false);
  
  // UI state
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [showSummaryModal, setShowSummaryModal] = useState(false);
  const [showCropModal, setShowCropModal] = useState(false);
  const [tempImage, setTempImage] = useState<string | null>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0, width: 100, height: 100 });

  const myUser = allUsers.find((u: any) => u.id === user?.id || u.username === user?.username);

  // Sync state with user when it changes
  useEffect(() => {
    if (user) {
      const newData = {
        fullName: user.fullName || user.name || '',
        email: user.email || '',
        phone: (user as Record<string, unknown>).phone as string || '',
        jobTitle: (user as Record<string, unknown>).jobTitle as string || '',
        timezone: (user as Record<string, unknown>).timezone as string || 'Africa/Blantyre',
        profilePhoto: (user as Record<string, unknown>).profilePhoto as string || '',
      };
      setProfileData(newData);
      setOriginalData(newData);
    }
  }, [user]);

  const hasChanges = useMemo(() => {
    return JSON.stringify(profileData) !== JSON.stringify(originalData);
  }, [profileData, originalData]);

  const changedFields = useMemo(() => {
    const changes: string[] = [];
    if (profileData.fullName !== originalData.fullName) changes.push('Full Name');
    if (profileData.email !== originalData.email) changes.push('Email');
    if (profileData.phone !== originalData.phone) changes.push('Phone');
    if (profileData.jobTitle !== originalData.jobTitle) changes.push('Job Title');
    if (profileData.timezone !== originalData.timezone) changes.push('Timezone');
    if (profileData.profilePhoto !== originalData.profilePhoto) changes.push('Profile Photo');
    return changes;
  }, [profileData, originalData]);

  const validateName = (name: string) => {
    if (name.length < 2 || name.length > 50) return 'Name must be between 2 and 50 characters';
    if (/[!@#$%^&*(),.?":{}|<>]/.test(name)) return 'Special characters are not allowed';
    const duplicate = allUsers.find(u => 
      (u.fullName?.toLowerCase() === name.toLowerCase() || u.name?.toLowerCase() === name.toLowerCase()) && 
      u.id !== user?.id
    );
    if (duplicate) return 'This name is already in use within the organization';
    return null;
  };

  const handleNameSave = () => {
    const error = validateName(profileData.fullName);
    if (error) {
      setNameError(error);
      return;
    }
    setIsEditingName(false);
    setNameError(null);
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      notify('File size must be less than 5MB', 'error');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setTempImage(reader.result as string);
      setShowCropModal(true);
    };
    reader.readAsDataURL(file);
  };

  const handleCropSave = async () => {
    if (!tempImage) return;

    setUploading(true);
    try {
      // Basic image compression/resizing using Canvas
      const img = new Image();
      img.src = tempImage;
      await new Promise((resolve) => { img.onload = resolve; });

      const canvas = document.createElement('canvas');
      const size = Math.min(img.width, img.height, 400); // Max 400px
      canvas.width = size;
      canvas.height = size;
      
      const ctx = canvas.getContext('2d');
      if (ctx) {
        // Center crop
        const sourceSize = Math.min(img.width, img.height);
        const sourceX = (img.width - sourceSize) / 2;
        const sourceY = (img.height - sourceSize) / 2;
        
        ctx.drawImage(img, sourceX, sourceY, sourceSize, sourceSize, 0, 0, size, size);
        
        const compressedDataUrl = canvas.toDataURL('image/jpeg', 0.8);
        setProfileData(prev => ({ ...prev, profilePhoto: compressedDataUrl }));
      }
      
      setShowCropModal(false);
      setTempImage(null);
      notify('Photo updated locally. Save changes to sync with cloud.', 'info');
    } catch (err) {
      notify('Failed to process image', 'error');
    } finally {
      setUploading(false);
    }
  };

  const handleBatchSave = async () => {
    setSaving(true);
    try {
      const updatedUser = {
        ...(myUser || user),
        ...profileData,
        fullName: profileData.fullName,
        name: profileData.fullName,
      };

      await manageUser(updatedUser as Record<string, unknown>);
      
      // If cloud mode is enabled, sync with profiles table in background
      if (cloudDb.isConfigured()) {
        cloudDb.upsertProfile({
          ...updatedUser,
          user_id: user?.id,
          full_name: profileData.fullName,
        }).catch((err) => logger.warn('[Profile] Background cloud sync warning:', err));
      }

      setOriginalData({ ...profileData });
      setShowSummaryModal(false);
      notify('Profile updated successfully', 'success');
    } catch (err) {
      logger.error('Save failed:', err);
      notify('Failed to update profile', 'error');
    } finally {
      setSaving(false);
    }
  };

  const userLogs = useMemo(() => {
    return auditLogs
      .filter((log: any) => log.userId === user?.username)
      .sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [auditLogs, user]);

  const stats = useMemo(() => {
    const today = new Date().toISOString().split('T')[0];
    const todayLogs = userLogs.filter((l: any) => l.date.startsWith(today));
    return {
      total: userLogs.length,
      today: todayLogs.length,
      lastAction: userLogs[0]?.action || 'None'
    };
  }, [userLogs]);

  const passwordValidation = validatePasswordStrength(newPassword);

  const handleChangePassword = async () => {
    if (!newPassword) { notify('Enter a new password', 'error'); return; }
    if (newPassword !== confirmPassword) { notify('Passwords do not match', 'error'); return; }
    if (!passwordValidation.valid) { notify(passwordValidation.errors[0] || 'Password does not meet requirements', 'error'); return; }

    setSaving(true);
    try {
      await manageUser({ ...(myUser || user), password: newPassword } as Record<string, unknown>);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      notify('Password updated successfully', 'success');
    } catch {
      notify('Failed to update password', 'error');
    } finally {
      setSaving(false);
    }
  };

  const displayName = profileData.fullName || 'User';
  const initials = displayName.charAt(0).toUpperCase();
  const role = user?.role || 'User';
  const username = user?.username || '';

  return (
    <div style={{ height: '100%', overflowY: 'auto' }}>
      <div style={{ maxWidth: '1024px', marginLeft: 'auto', padding: '16px', marginTop: '24px' }}>
        {/* Header */}
        <div className="pf-header-row">
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <button onClick={() => navigate(-1)} className="pf-back-btn" title="Go back">
              <ArrowLeft size={20} />
            </button>
            <div>
              <h1 className="pf-title">Account Settings</h1>
              <p className="pf-subtitle">Manage your personal information and preferences</p>
            </div>
          </div>

          {hasChanges && (
            <button
              onClick={() => setShowSummaryModal(true)}
              className="pf-btn-primary"
            >
              <Save size={16} />
              Save All Changes
            </button>
          )}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(1,1fr)', gap: '24px' }}>
          {/* Left Column - Profile Card */}
          <div style={{ marginTop: '24px' }}>
            <div className="pf-card">
              <div style={{ height: '96px' }} />
              <div style={{ paddingLeft: '20px', paddingBottom: '20px', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', paddingRight: '20px' }}>
                {/* Profile Photo */}
                <div style={{ position: 'relative' }}>
                  <div style={{ width: '96px', height: '96px', borderRadius: '9999px', borderWidth: '4px', border: '1.4px solid #e4ddd1', background: '#eef7f6', boxShadow: '0 20px 25px -5px rgba(0,0,0,.1)', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#5c6567' }}>
                    {profileData.profilePhoto ? (
                      <img src={profileData.profilePhoto} alt={displayName} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    ) : (
                      <span style={{ fontSize: '30px', fontWeight: 600, color: '#1f8577' }}>{initials}</span>
                    )}
                  </div>
                  <button 
                    onClick={() => fileInputRef.current?.click()}
                    style={{ position: 'absolute', top: 0, background: 'rgba(0,0,0,.4)', borderRadius: '9999px', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 0.0, transition: 'opacity .15s ease', right: 0, bottom: 0, left: 0 }}
                    title="Change photo"
                  >
                    <Camera size={24} />
                  </button>
                  <input 
                    type="file" 
                    ref={fileInputRef} 
                    style={{ display: 'hidden' }} 
                    accept="image/jpeg,image/png,image/webp"
                    onChange={handlePhotoUpload}
                  />
                </div>

                {/* Name & Role */}
                <div style={{ marginTop: '16px', width: '100%' }}>
                  {isEditingName ? (
                    <div style={{ marginTop: '8px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <input
                          autoFocus
                          value={profileData.fullName}
                          onChange={e => setProfileData(prev => ({ ...prev, fullName: e.target.value }))}
                          onKeyDown={e => {
                            if (e.key === 'Enter') handleNameSave();
                            if (e.key === 'Escape') { setIsEditingName(false); setNameError(null); setProfileData(prev => ({ ...prev, fullName: originalData.fullName })); }
                          }}
                          onBlur={() => {
                            if (!validateName(profileData.fullName)) {
                              setIsEditingName(false);
                              setNameError(null);
                            }
                          }}
                          className={`pf-input text-center ${nameError ? 'border-rose-500' : 'border-indigo-500'}`}
                        />
                        <button onClick={handleNameSave} style={{ color: '#1f8577' }}><Check size={18} /></button>
                        <button onClick={() => { setIsEditingName(false); setNameError(null); setProfileData(prev => ({ ...prev, fullName: originalData.fullName })); }} style={{ color: '#b5493f' }}><X size={18} /></button>
                      </div>
                      {nameError && <p style={{ color: '#b5493f', fontWeight: 500 }}>{nameError}</p>}
                    </div>
                  ) : (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                      <h2 className="pf-name">{displayName}</h2>
                      {(user?.isSuperAdmin || user?.role === 'Admin') && (
                        <button 
                          onClick={() => setIsEditingName(true)}
                          style={{ opacity: 0.0 }}
                        >
                          <Edit2 size={14} />
                        </button>
                      )}
                    </div>
                  )}
                  <p className="pf-username">@{username}</p>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '16px' }}>
                  <span className="pf-badge">{role}</span>
                </div>

                {/* Photo Actions */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: '8px', width: '100%', marginTop: '20px', paddingTop: '20px', borderStyle: 'solid', borderColor: '#e4ddd1' }}>
                  <button 
                    onClick={() => fileInputRef.current?.click()}
                    style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px', padding: '8px', borderRadius: '12px', transition: 'color .15s ease,background .15s ease,border-color .15s ease', color: '#5c6567' }}
                  >
                    <Upload size={16} style={{ color: '#1f8577' }} />
                    <span style={{ fontWeight: 500, textTransform: 'uppercase', letterSpacing: '-.025em' }}>Upload</span>
                  </button>
                  <button 
                    onClick={() => setProfileData(prev => ({ ...prev, profilePhoto: '' }))}
                    style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px', padding: '8px', borderRadius: '12px', transition: 'color .15s ease,background .15s ease,border-color .15s ease', color: '#5c6567' }}
                  >
                    <Trash2 size={16} style={{ color: '#b5493f' }} />
                    <span style={{ fontWeight: 500, textTransform: 'uppercase', letterSpacing: '-.025em' }}>Remove</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Quick Stats */}
            <div className="pf-stats-card">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                <span className="pf-stats-label">Activity Summary</span>
                <Activity size={16} style={{ color: '#3fa294' }} />
              </div>
              <div style={{ marginTop: '16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontWeight: 400, color: '#5c6567' }}>Total Actions</span>
                  <span className="pf-stats-value">{stats.total}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontWeight: 400, color: '#5c6567' }}>Today</span>
                  <span style={{ color: '#3fa294' }}>{stats.today}</span>
                </div>
                <div style={{ paddingTop: '16px', borderStyle: 'solid', border: '1.4px solid #e4ddd1' }}>
                  <span style={{ display: 'block', marginBottom: '4px' }}>Last Action</span>
                  <p style={{ fontWeight: 500, overflow: 'hidden', color: '#a6d9d3', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{stats.lastAction}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column - Forms */}
          <div style={{ marginTop: '24px' }}>
            {/* General Information */}
            <div className="pf-card">
              <div className="pf-card-header">
                <UserIcon size={16} style={{ color: '#1f8577' }} />
                <h3 className="pf-section-title">Personal Details</h3>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(1,1fr)', gap: '20px' }}>
                <div className="pf-input-group">
                  <label className="pf-label"><Mail size={12} /> Work Email</label>
                  <input
                    type="email"
                    value={profileData.email}
                    onChange={e => setProfileData(prev => ({ ...prev, email: e.target.value }))}
                    className="pf-input"
                    placeholder="email@organization.com"
                  />
                </div>
                <div className="pf-input-group">
                  <label className="pf-label"><Phone size={12} /> Contact Phone</label>
                  <input
                    type="tel"
                    value={profileData.phone}
                    onChange={e => setProfileData(prev => ({ ...prev, phone: e.target.value }))}
                    className="pf-input"
                    placeholder="+1 (555) 000-0000"
                  />
                </div>
                <div className="pf-input-group">
                  <label className="pf-label"><Briefcase size={12} /> Job Title</label>
                  <input
                    value={profileData.jobTitle}
                    onChange={e => setProfileData(prev => ({ ...prev, jobTitle: e.target.value }))}
                    className="pf-input"
                    placeholder="Financial Controller"
                  />
                </div>
                <div className="pf-input-group">
                  <label className="pf-label"><Globe size={12} /> Timezone</label>
                  <select
                    value={profileData.timezone}
                    onChange={e => setProfileData(prev => ({ ...prev, timezone: e.target.value }))}
                    className="pf-select"
                  >
                    {TIMEZONES.map(tz => (
                      <option key={tz.value} value={tz.value}>{tz.label}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* Password Management */}
            <div className="pf-card">
              <div className="pf-card-header">
                <Key size={16} style={{ color: '#1f8577' }} />
                <h3 className="pf-section-title">Security</h3>
              </div>
              <div style={{ marginTop: '16px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(1,1fr)', gap: '16px' }}>
                  <div className="pf-input-group">
                    <label className="pf-label">New Password</label>
                    <div style={{ position: 'relative' }}>
                      <input
                        type={showPasswords ? 'text' : 'password'}
                        value={newPassword}
                        onChange={e => setNewPassword(e.target.value)}
                        style={{ paddingRight: '40px' }}
                        placeholder="Enter new password"
                      />
                      <button onClick={() => setShowPasswords(!showPasswords)} style={{ position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)', color: '#5c6567' }}>
                        {showPasswords ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                  </div>
                  <div className="pf-input-group">
                    <label className="pf-label">Confirm Password</label>
                    <input
                      type={showPasswords ? 'text' : 'password'}
                      value={confirmPassword}
                      onChange={e => setConfirmPassword(e.target.value)}
                      className="pf-input"
                      placeholder="Repeat password"
                    />
                  </div>
                </div>

                {newPassword && (
                  <div style={{ padding: '12px', borderRadius: '12px', border: '1.4px solid #e4ddd1' }}>
                    {!passwordValidation.valid ? (
                      <p style={{ color: '#b5493f', fontWeight: 500, display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <AlertCircle size={14} /> {passwordValidation.errors[0]}
                      </p>
                    ) : (
                      <p style={{ color: '#1f8577', fontWeight: 500, display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <CheckCircle2 size={14} /> Password complexity requirements met
                      </p>
                    )}
                  </div>
                )}

                <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: '8px' }}>
                  <button
                    onClick={handleChangePassword}
                    disabled={saving || !newPassword || !confirmPassword || !!passwordValidation.errors?.length}
                    style={{ background: '#0b3e39' }}
                  >
                    {saving ? <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> : <Shield size={16} />}
                    Update Security
                  </button>
                </div>
              </div>
            </div>

            {/* Recent Activity */}
            <div className="pf-card">
              <div className="pf-card-header">
                <History size={16} style={{ color: '#1f8577' }} />
                <h3 className="pf-section-title">Recent Logs</h3>
              </div>
              <div style={{ overflowY: 'auto' }}>
                {userLogs.length === 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', paddingTop: '48px', color: '#5c6567', paddingBottom: '48px' }}>
                    <Activity size={32} style={{ marginBottom: '8px', opacity: 0.3 }} />
                    <p style={{ fontWeight: 500, textTransform: 'uppercase', letterSpacing: '.1em' }}>No activity history</p>
                  </div>
                ) : (
                  <div style={{ borderColor: '#e4ddd1' }}>
                    {userLogs.slice(0, 10).map((log: any) => (
                      <div key={log.id} className="pf-log-item">
                        <div className="pf-log-icon">
                          <Activity size={14} />
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p className="pf-log-action">{log.action}</p>
                          <p className="pf-log-date">{new Date(log.date).toLocaleString()}</p>
                        </div>
                        <ChevronRight size={14} style={{ color: '#5c6567' }} />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Summary Modal */}
      <Dialog 
        open={showSummaryModal} 
        onClose={() => setShowSummaryModal(false)}
        title="Review Profile Changes"
      >
        <div style={{ marginTop: '24px' }}>
          <p style={{ fontSize: '13px', color: '#5c6567' }}>You are about to save the following updates to your profile:</p>
          <div style={{ marginTop: '12px', padding: '16px', borderRadius: '16px', border: '1.4px solid #e4ddd1' }}>
            {changedFields.map(field => (
              <div key={field} className="pf-change-item">
                <div style={{ width: '6px', height: '6px', borderRadius: '9999px', background: '#eef7f6' }} />
                <span style={{ fontWeight: 600 }}>{field}</span>
                <span style={{ fontWeight: 400 }}>was modified</span>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: '12px', paddingTop: '8px' }}>
            <button
              onClick={() => setShowSummaryModal(false)}
              style={{ flex: 1, justifyContent: 'center' }}
            >
              Cancel
            </button>
            <button
              onClick={handleBatchSave}
              disabled={saving}
              style={{ flex: 1, justifyContent: 'center' }}
            >
              {saving ? <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> : <Check size={16} />}
              Confirm & Save
            </button>
          </div>
        </div>
      </Dialog>

      {/* Cropping Modal Placeholder */}
      <Dialog 
        open={showCropModal} 
        onClose={() => setShowCropModal(false)}
        title="Adjust Profile Photo"
      >
        <div style={{ marginTop: '24px' }}>
          <div style={{ aspectRatio: '1/1', width: '100%', background: '#eef7f6', borderRadius: '16px', overflow: 'hidden', position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {tempImage && (
              <img src={tempImage} alt="Preview" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
            )}
            <div style={{ position: 'absolute', top: 0, borderWidth: '2px', borderStyle: 'dashed', borderColor: 'rgba(255,255,255,.5)', margin: '32px', borderRadius: '9999px', pointerEvents: 'none', right: 0, bottom: 0, left: 0 }} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '24px' }}>
             <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
                <span style={{ fontWeight: 900, color: '#5c6567', textTransform: 'uppercase', letterSpacing: '.1em' }}>Predefined</span>
                <div style={{ display: 'flex', gap: '8px' }}>
                  {PREDEFINED_AVATARS.map((url, i) => (
                    <button 
                      key={i} 
                      onClick={() => { setTempImage(url); }}
                      style={{ width: '40px', height: '40px', borderRadius: '9999px', borderWidth: '2px', borderColor: '#fff', boxShadow: '0 1px 2px rgba(0,0,0,.05)', transition: 'transform .15s ease', overflow: 'hidden' }}
                    >
                      <img src={url} alt={`Avatar ${i}`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    </button>
                  ))}
                </div>
             </div>
          </div>
          <div style={{ display: 'flex', gap: '12px' }}>
            <button
              onClick={() => setShowCropModal(false)}
              style={{ flex: 1, justifyContent: 'center' }}
            >
              Cancel
            </button>
            <button
              onClick={handleCropSave}
              style={{ flex: 1, justifyContent: 'center' }}
            >
              <ImageIcon size={16} />
              Set Photo
            </button>
          </div>
        </div>
      </Dialog>
    </div>
  );
};


export default Profile;
