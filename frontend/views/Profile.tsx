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
    if (/[!@#$%^&*(),.?\":{}|<>]/.test(name)) return 'Special characters are not allowed';
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
      const img = new Image();
      img.src = tempImage;
      await new Promise((resolve) => { img.onload = resolve; });

      const canvas = document.createElement('canvas');
      const size = Math.min(img.width, img.height, 400);
      canvas.width = size;
      canvas.height = size;

      const ctx = canvas.getContext('2d');
      if (ctx) {
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

  // Password strength segments
  const strengthScore = !newPassword ? 0
    : passwordValidation.errors.length >= 3 ? 1
    : passwordValidation.errors.length >= 2 ? 2
    : passwordValidation.errors.length >= 1 ? 3
    : 4;
  const strengthClass = strengthScore <= 1 ? 'active' : strengthScore <= 2 ? 'medium' : 'strong';

  return (
    <div className="pf-page">
      <div className="pf-container">
        {/* Header */}
        <div className="pf-header">
          <div className="pf-header-left">
            <button onClick={() => navigate(-1)} className="pf-back-btn" title="Go back">
              <ArrowLeft size={18} />
            </button>
            <div className="pf-header-text">
              <h1>Account Settings</h1>
              <p>Manage your personal information and preferences</p>
            </div>
          </div>

          {hasChanges && (
            <button onClick={() => setShowSummaryModal(true)} className="pf-save-btn">
              <Save size={15} />
              Save Changes
            </button>
          )}
        </div>

        {/* Hero Banner */}
        <div className="pf-hero">
          <div className="pf-hero-content">
            {/* Avatar */}
            <div className="pf-avatar-wrapper">
              <div className="pf-avatar">
                {profileData.profilePhoto ? (
                  <img src={profileData.profilePhoto} alt={displayName} />
                ) : (
                  <span className="pf-avatar-initials">{initials}</span>
                )}
              </div>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="pf-avatar-edit"
                title="Change photo"
              >
                <Camera size={15} />
              </button>
              <input
                type="file"
                ref={fileInputRef}
                style={{ display: 'none' }}
                accept="image/jpeg,image/png,image/webp"
                onChange={handlePhotoUpload}
              />
            </div>

            {/* Name & Identity */}
            <div className="pf-hero-name-group">
              {isEditingName ? (
                <div className="pf-name-edit-row">
                  <input
                    autoFocus
                    value={profileData.fullName}
                    onChange={e => setProfileData(prev => ({ ...prev, fullName: e.target.value }))}
                    onKeyDown={e => {
                      if (e.key === 'Enter') handleNameSave();
                      if (e.key === 'Escape') { setIsEditingName(false); setNameError(null); setProfileData(prev => ({ ...prev, fullName: originalData.fullName })); }
                    }}
                    className="pf-name-edit-input"
                    placeholder="Your name"
                  />
                  <button onClick={handleNameSave} className="pf-name-edit-action save" title="Save"><Check size={16} /></button>
                  <button onClick={() => { setIsEditingName(false); setNameError(null); setProfileData(prev => ({ ...prev, fullName: originalData.fullName })); }} className="pf-name-edit-action cancel" title="Cancel"><X size={16} /></button>
                </div>
              ) : (
                <div className="pf-name-row">
                  <h2 className="pf-hero-name">{displayName}</h2>
                  {(user?.isSuperAdmin || user?.role === 'Admin') && (
                    <button onClick={() => setIsEditingName(true)} className="pf-name-edit-btn" title="Edit name">
                      <Edit2 size={13} />
                    </button>
                  )}
                </div>
              )}
              {nameError && <p className="pf-name-error">{nameError}</p>}
              <p className="pf-hero-username">@{username}</p>
            </div>

            {/* Role Badge */}
            <span className="pf-hero-role">
              <Shield size={11} />
              {role}
            </span>

            {/* Photo Actions */}
            <div className="pf-photo-actions">
              <button onClick={() => fileInputRef.current?.click()} className="pf-photo-action-btn">
                <Upload size={12} /> Upload
              </button>
              <button onClick={() => setProfileData(prev => ({ ...prev, profilePhoto: '' }))} className="pf-photo-action-btn danger">
                <Trash2 size={12} /> Remove
              </button>
            </div>
          </div>
        </div>

        {/* Stats Row */}
        <div className="pf-stats-row" style={{ marginBottom: 24 }}>
          <div className="pf-stat-item">
            <div className="pf-stat-value">{stats.total}</div>
            <div className="pf-stat-label">Total Actions</div>
          </div>
          <div className="pf-stat-item">
            <div className="pf-stat-value" style={{ color: '#1a6b5a' }}>{stats.today}</div>
            <div className="pf-stat-label">Today</div>
          </div>
          <div className="pf-stat-item">
            <div className="pf-stat-value" style={{ fontSize: 14, fontWeight: 500, color: '#6b7280', lineHeight: 1.4 }}>{stats.lastAction}</div>
            <div className="pf-stat-label">Last Action</div>
          </div>
        </div>

        {/* Two-Column Grid */}
        <div className="pf-grid">
          {/* Personal Details */}
          <div className="pf-card">
            <div className="pf-card-header">
              <div className="pf-card-icon teal">
                <UserIcon size={16} />
              </div>
              <span className="pf-card-title">Personal Details</span>
            </div>
            <div className="pf-card-body">
              <div className="pf-form-row">
                <div className="pf-field">
                  <label className="pf-label"><Mail size={11} /> Work Email</label>
                  <input
                    type="email"
                    value={profileData.email}
                    onChange={e => setProfileData(prev => ({ ...prev, email: e.target.value }))}
                    className="pf-input"
                    placeholder="email@organization.com"
                  />
                </div>
                <div className="pf-field">
                  <label className="pf-label"><Phone size={11} /> Contact Phone</label>
                  <input
                    type="tel"
                    value={profileData.phone}
                    onChange={e => setProfileData(prev => ({ ...prev, phone: e.target.value }))}
                    className="pf-input"
                    placeholder="+1 (555) 000-0000"
                  />
                </div>
              </div>
              <div className="pf-form-row" style={{ marginTop: 16 }}>
                <div className="pf-field">
                  <label className="pf-label"><Briefcase size={11} /> Job Title</label>
                  <input
                    value={profileData.jobTitle}
                    onChange={e => setProfileData(prev => ({ ...prev, jobTitle: e.target.value }))}
                    className="pf-input"
                    placeholder="Financial Controller"
                  />
                </div>
                <div className="pf-field">
                  <label className="pf-label"><Globe size={11} /> Timezone</label>
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
          </div>

          {/* Security */}
          <div className="pf-card">
            <div className="pf-card-header">
              <div className="pf-card-icon indigo">
                <Key size={16} />
              </div>
              <span className="pf-card-title">Security</span>
            </div>
            <div className="pf-card-body">
              <div className="pf-field" style={{ marginBottom: 14 }}>
                <label className="pf-label">New Password</label>
                <div className="pf-password-input-wrap">
                  <input
                    type={showPasswords ? 'text' : 'password'}
                    value={newPassword}
                    onChange={e => setNewPassword(e.target.value)}
                    className="pf-input"
                    placeholder="Enter new password"
                  />
                  <button onClick={() => setShowPasswords(!showPasswords)} className="pf-password-toggle" type="button">
                    {showPasswords ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
                {newPassword && (
                  <div className="pf-strength-bar">
                    {[1, 2, 3, 4].map(i => (
                      <div key={i} className={`pf-strength-segment ${i <= strengthScore ? strengthClass : ''}`} />
                    ))}
                  </div>
                )}
              </div>
              <div className="pf-field">
                <label className="pf-label">Confirm Password</label>
                <input
                  type={showPasswords ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  className="pf-input"
                  placeholder="Repeat password"
                />
              </div>

              {newPassword && (
                <div className={`pf-password-hint ${passwordValidation.valid ? 'success' : 'error'}`}>
                  {passwordValidation.valid ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
                  {passwordValidation.valid ? 'Password meets requirements' : passwordValidation.errors[0]}
                </div>
              )}

              <div className="pf-clearfix" style={{ marginTop: 14 }}>
                <button
                  onClick={handleChangePassword}
                  disabled={saving || !newPassword || !confirmPassword || !!passwordValidation.errors?.length}
                  className="pf-update-btn"
                >
                  {saving ? <Loader2 size={15} className="pf-spin" /> : <Shield size={15} />}
                  Update Password
                </button>
              </div>
            </div>
          </div>

          {/* Recent Activity — Full Width */}
          <div className="pf-card pf-col-full">
            <div className="pf-card-header">
              <div className="pf-card-icon amber">
                <History size={16} />
              </div>
              <span className="pf-card-title">Recent Activity</span>
              {userLogs.length > 0 && (
                <span style={{ marginLeft: 'auto', fontSize: 12, color: '#9ca3af', fontWeight: 500 }}>
                  {userLogs.length} entries
                </span>
              )}
            </div>
            <div className="pf-card-body" style={{ padding: '8px 20px' }}>
              {userLogs.length === 0 ? (
                <div className="pf-log-empty">
                  <div className="pf-log-empty-icon">
                    <Activity size={22} />
                  </div>
                  <p>No activity history</p>
                </div>
              ) : (
                <div className="pf-log-list">
                  {userLogs.slice(0, 15).map((log: any, idx: number) => (
                    <div key={log.id} className="pf-log-item">
                      <div className="pf-log-dot" />
                      <div className="pf-log-content">
                        <p className="pf-log-action">{log.action}</p>
                        <p className="pf-log-date">{new Date(log.date).toLocaleString()}</p>
                      </div>
                      <ChevronRight size={14} style={{ color: '#d1d5db', marginTop: 4, flexShrink: 0 }} />
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Summary Modal */}
      <Dialog
        open={showSummaryModal}
        onClose={() => setShowSummaryModal(false)}
        title="Review Changes"
      >
        <div className="pf-modal-summary">
          <p className="pf-modal-desc">
            You are about to save the following updates to your profile:
          </p>
          <div className="pf-change-list">
            {changedFields.map(field => (
              <div key={field} className="pf-change-item">
                <div className="pf-change-dot" />
                <span className="pf-change-field">{field}</span>
                <span className="pf-change-status">was modified</span>
              </div>
            ))}
          </div>
          <div className="pf-modal-actions">
            <button onClick={() => setShowSummaryModal(false)} className="pf-modal-btn secondary">
              Cancel
            </button>
            <button onClick={handleBatchSave} disabled={saving} className="pf-modal-btn primary">
              {saving ? <Loader2 size={15} className="pf-spin" /> : <Check size={15} />}
              Confirm & Save
            </button>
          </div>
        </div>
      </Dialog>

      {/* Crop Modal */}
      <Dialog
        open={showCropModal}
        onClose={() => setShowCropModal(false)}
        title="Adjust Profile Photo"
      >
        <div style={{ padding: 20 }}>
          <div className="pf-crop-preview">
            {tempImage && (
              <img src={tempImage} alt="Preview" />
            )}
            <div className="pf-crop-overlay" />
          </div>

          <div className="pf-avatar-presets">
            {PREDEFINED_AVATARS.map((url, i) => (
              <button
                key={i}
                onClick={() => setTempImage(url)}
                className="pf-avatar-preset"
              >
                <img src={url} alt={`Avatar ${i}`} />
              </button>
            ))}
          </div>

          <div className="pf-modal-actions" style={{ marginTop: 18 }}>
            <button onClick={() => setShowCropModal(false)} className="pf-modal-btn secondary">
              Cancel
            </button>
            <button onClick={handleCropSave} className="pf-modal-btn primary">
              <ImageIcon size={15} />
              Set Photo
            </button>
          </div>
        </div>
      </Dialog>
    </div>
  );
};

export default Profile;
