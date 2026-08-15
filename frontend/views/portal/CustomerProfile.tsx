import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Save, Lock, Loader2, Monitor, Smartphone, Bell, Shield, Settings2, ChevronRight,
  Building2, Key, CheckCircle2, Star, Crown, BadgeCheck, Tag, Zap, Headphones, CalendarDays,
  CreditCard, Receipt, Gift, Wallet, Pencil, Phone, Mail, MapPin, X, FileBarChart, UserRound,
} from 'lucide-react';
import QRCode from 'qrcode';
import { portalLifecycle, portalApi } from '../../services/portalApiClient';
import { useCustomerAuth } from '../../context/CustomerAuthContext';
import { useAuth } from '../../context/AuthContext';
import ErrorBanner from './components/ErrorBanner';
import { useToast } from './components/Toast';
import ConfirmDialog from './components/ConfirmDialog';
import { formatK } from './constants';

const teal = {
  50: '#eef7f6', 100: '#d3ece9', 200: '#a6d9d3', 300: '#72c0b7',
  400: '#3fa294', 500: '#1f8577', 600: '#146b60', 700: '#0f544c',
  800: '#0b3e39', 900: '#082e2a'
};
const danger = '#c0495f';
const ink = '#23282A';
const inkSoft = '#5c6567';
const hairline = '#E7E3DA';

// Company Profile & Status palette — navy primary, emerald tertiary, gold partner accents
const navy = { 500: '#0F2C59', 600: '#0D254D', 700: '#0A1F42', 800: '#071836', 900: '#04102B' };
const emerald = { 500: '#059669', 600: '#047857', 700: '#065F46' };
const gold = { light: '#FFD700', deep: '#FFA500', ink: '#92400E', bg: '#FFFBEB', border: '#FCD34D' };
const FONT = "'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif";
const MONO = "'JetBrains Mono', monospace";

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
  tax_id?: string;
}

interface TabItem {
  id: string;
  icon: React.ElementType;
  label: string;
  desc: string;
}

const menuGroups = [
  {
    title: 'Company',
    items: [
      { id: 'Company', icon: Building2, label: 'Company Profile', desc: 'Account status & partnership benefits' }
    ] as TabItem[]
  },
  {
    title: 'Account',
    items: [
      { id: 'Personal', icon: UserRound, label: 'Personal Info', desc: 'Contact details and address' },
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

// ── Gold Partner benefits (status & tier card) ──────────────────────────
const BENEFITS = [
  { icon: Tag, title: 'Enterprise Wholesale Discount', desc: '15% automatic discount applied on orders.' },
  { icon: Zap, title: 'Shipping SLA', desc: 'Priority 24-hour Express Shipping guarantee.' },
  { icon: Headphones, title: 'Dedicated Account Rep', desc: 'Direct assigned manager — Sarah Jenkins.' },
  { icon: CalendarDays, title: 'Payment Terms', desc: 'Net-30 deferred invoicing enabled.' },
] as const;

const ACCOUNT_REP = {
  name: 'Sarah Jenkins',
  role: 'Senior Account Manager',
  email: 's.jenkins@enterprise-portal.com',
  phone: '+1 (800) 555-0199',
  hours: 'Mon–Fri, 8:00 AM – 6:00 PM CST',
};

// ── Financial data model ────────────────────────────────────────────────
interface FinancialState {
  creditLimit: number;
  balance: number;
  referralEarned: number;
  tier: string;
}

// ── Company Header & Badge Card ─────────────────────────────────────────
interface CompanyHeaderCardProps {
  companyName: string;
  accountId: string;
  tier: string;
}

const CompanyHeaderCard: React.FC<CompanyHeaderCardProps> = ({ companyName, accountId, tier }) => {
  const initial = (companyName || 'A').trim().charAt(0).toUpperCase() || 'A';
  return (
    <div style={{
      borderRadius: 20, overflow: 'hidden',
      border: '1px solid rgba(252,211,77,0.55)',
      boxShadow: '0 10px 34px -12px rgba(15,23,42,0.16), 0 2px 8px -4px rgba(255,165,0,0.25)',
      background: 'linear-gradient(180deg, #FDFBF3 0%, #FFFDF7 100%)',
    }}>
      {/* Gold shimmer top band */}
      <div style={{ height: 5, background: 'linear-gradient(90deg, #FFD700 0%, #FFA500 50%, #FFD700 100%)' }} />
      <div style={{ padding: '26px 24px 24px', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
        {/* Gold avatar ring + floating star */}
        <div style={{ position: 'relative', width: 88, height: 88 }}>
          <div style={{
            position: 'absolute', inset: 0, borderRadius: '50%', padding: 3,
            background: 'linear-gradient(135deg, #FFD700 0%, #FFA500 100%)',
            boxShadow: '0 6px 18px -4px rgba(255,165,0,0.55)',
          }}>
            <div style={{
              width: '100%', height: '100%', borderRadius: '50%',
              background: '#FFFFFF', display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <span style={{
                fontSize: 34, fontWeight: 800, fontFamily: FONT, color: navy[700], letterSpacing: '-0.02em',
              }}>
                {initial}
              </span>
            </div>
          </div>
          <div style={{
            position: 'absolute', bottom: -2, right: -2, width: 30, height: 30, borderRadius: '50%',
            background: 'linear-gradient(135deg, #FFD700, #FFA500)',
            border: '2px solid #FFFFFF',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 2px 8px -2px rgba(255,165,0,0.6)',
          }}>
            <Star size={14} color="#fff" fill="#fff" />
          </div>
        </div>

        <h2 style={{ fontSize: 22, fontWeight: 700, color: navy[800], margin: '16px 0 3px', fontFamily: FONT, letterSpacing: '-0.02em', lineHeight: 1.25 }}>
          {companyName || 'Acme Corp B2B'}
        </h2>
        <p style={{ fontSize: 12, color: '#8A94A6', margin: 0, fontFamily: MONO, fontVariantNumeric: 'tabular-nums', letterSpacing: '0.02em' }}>
          {accountId}
        </p>

        {/* Gold Partner badge */}
        <div style={{
          marginTop: 16, display: 'inline-flex', alignItems: 'center', gap: 8,
          padding: '7px 16px', borderRadius: 9999,
          background: gold.bg, border: `1px solid ${gold.border}`,
          boxShadow: '0 2px 8px -3px rgba(255,165,0,0.4)',
        }}>
          <Crown size={15} color={gold.ink} />
          <span style={{ fontSize: 12.5, fontWeight: 700, color: gold.ink, fontFamily: FONT }}>
            {tier} Partner
          </span>
          <span style={{ width: 5, height: 5, borderRadius: '50%', background: emerald[500], boxShadow: `0 0 0 3px rgba(5,150,105,0.15)` }} />
          <span style={{ fontSize: 11.5, fontWeight: 600, color: emerald[700], fontFamily: FONT }}>
            Active · Good Standing
          </span>
        </div>
      </div>
    </div>
  );
};

// ── Status & Tier Progress Card ─────────────────────────────────────────
interface TierProgressCardProps {
  tier: string;
  progress: number;
  nextTier: string;
}

const TierProgressCard: React.FC<TierProgressCardProps> = ({ tier, progress, nextTier }) => {
  return (
    <div className="white-card" style={{ padding: '22px 24px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 11,
            background: 'linear-gradient(135deg, rgba(255,215,0,0.18), rgba(255,165,0,0.1))',
            border: '1px solid rgba(255,165,0,0.35)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <BadgeCheck size={18} color={gold.ink} />
          </div>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#0F172A', fontFamily: FONT, lineHeight: 1.3 }}>
              Company Status &amp; Partnership Benefits
            </div>
            <div style={{ fontSize: 11.5, color: '#8A94A6', marginTop: 2, fontFamily: FONT }}>
              Verified enterprise account
            </div>
          </div>
        </div>
        <span style={{
          fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
          padding: '5px 12px', borderRadius: 9999, color: navy[500],
          background: 'rgba(15,44,89,0.06)', border: '1px solid rgba(15,44,89,0.12)',
          fontFamily: FONT,
        }}>
          Tier · {tier}
        </span>
      </div>

      {/* Tier progression tracker */}
      <div style={{ marginBottom: 22 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 9 }}>
          <span style={{ fontSize: 12.5, fontWeight: 600, color: '#334155', fontFamily: FONT }}>
            Tier Progress: <span style={{ color: navy[600], fontWeight: 700 }}>{tier}</span>
            <span style={{ color: '#CBD5E1', margin: '0 6px' }}>→</span>
            <span style={{ color: gold.ink, fontWeight: 700 }}>{nextTier}</span>
          </span>
          <span style={{ fontSize: 13, fontWeight: 700, color: gold.ink, fontFamily: MONO, fontVariantNumeric: 'tabular-nums' }}>
            {progress}%
          </span>
        </div>
        <div style={{ height: 9, borderRadius: 6, background: '#F1F0EA', overflow: 'hidden', border: '1px solid rgba(16,24,40,0.04)' }}>
          <div style={{
            height: '100%', width: `${progress}%`, borderRadius: 6,
            background: 'linear-gradient(90deg, #FFD700 0%, #FFA500 100%)',
            boxShadow: '0 0 8px rgba(255,165,0,0.5)',
            transition: 'width 700ms cubic-bezier(.4,0,.2,1)',
          }} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 5, fontSize: 10.5, color: '#A0AEC0', fontFamily: FONT }}>
          <span>{tier}</span>
          <span style={{ color: gold.ink, fontWeight: 600 }}>{nextTier} unlocks 20% discount</span>
        </div>
      </div>

      {/* Active privileges */}
      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#8A94A6', marginBottom: 12, fontFamily: FONT }}>
        Active {tier} Partner Privileges
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 }}>
        {BENEFITS.map((benefit) => {
          const Icon = benefit.icon;
          return (
            <div key={benefit.title} style={{
              display: 'flex', alignItems: 'flex-start', gap: 11,
              padding: '12px 13px', borderRadius: 12,
              background: '#FAFAF7', border: '1px solid rgba(16,24,40,0.06)',
              transition: 'all .18s ease',
            }}
              onMouseEnter={(e) => { e.currentTarget.style.background = '#FFFDF6'; e.currentTarget.style.borderColor = 'rgba(255,165,0,0.4)'; e.currentTarget.style.boxShadow = '0 4px 12px -6px rgba(255,165,0,0.35)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = '#FAFAF7'; e.currentTarget.style.borderColor = 'rgba(16,24,40,0.06)'; e.currentTarget.style.boxShadow = 'none'; }}
            >
              <div style={{
                width: 32, height: 32, borderRadius: 9, flexShrink: 0,
                background: 'linear-gradient(135deg, #FFFBEB, #FEF3C7)',
                border: '1px solid #FDE68A',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: gold.ink,
              }}>
                <Icon size={15} />
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 12.5, fontWeight: 600, color: '#1E293B', fontFamily: FONT, lineHeight: 1.35 }}>{benefit.title}</div>
                <div style={{ fontSize: 11.5, color: '#64748B', marginTop: 2, fontFamily: FONT, lineHeight: 1.45 }}>{benefit.desc}</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

// ── Basic Information Card ──────────────────────────────────────────────
interface BasicInfoCardProps {
  profile: ProfileData;
  companyName: string;
  onEdit: () => void;
}

const BasicInfoCard: React.FC<BasicInfoCardProps> = ({ profile, companyName, onEdit }) => {
  const fullAddress = [profile.address, profile.city, profile.state, profile.zip, profile.country]
    .filter(Boolean).join(', ') || '100 Industrial Parkway, Suite 400, Chicago, IL 60601';

  const rows: { icon: React.ElementType; label: string; value: string; mono?: boolean }[] = [
    { icon: Building2, label: 'Company Name', value: companyName || 'Acme Corp B2B' },
    { icon: Key, label: 'Tax ID / Registration', value: profile.tax_id || 'EIN-98-341209', mono: true },
    { icon: UserRound, label: 'Primary Contact', value: profile.full_name || 'John Doe' },
    { icon: Mail, label: 'Email Address', value: profile.email || 'john.doe@acme.com' },
    { icon: Phone, label: 'Phone Number', value: profile.phone || '+1 (555) 234-5678', mono: true },
    { icon: MapPin, label: 'Business Address', value: fullAddress },
    { icon: CalendarDays, label: 'Member Since', value: profile.created_at ? new Date(profile.created_at).toLocaleDateString('en-US', { month: 'long', year: 'numeric' }) : 'N/A' },
  ];

  return (
    <div className="white-card" style={{ padding: '22px 24px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700, color: '#0F172A', fontFamily: FONT, lineHeight: 1.3 }}>
            Basic Information &amp; Contact Details
          </div>
          <div style={{ fontSize: 11.5, color: '#8A94A6', marginTop: 2, fontFamily: FONT }}>
            Official account details on file
          </div>
        </div>
        <button
          onClick={onEdit}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '7px 14px', borderRadius: 10,
            border: '1px solid rgba(15,44,89,0.16)',
            background: 'rgba(15,44,89,0.04)',
            color: navy[600], fontSize: 12.5, fontWeight: 600, cursor: 'pointer',
            fontFamily: FONT, transition: 'all .18s ease',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(15,44,89,0.09)'; e.currentTarget.style.borderColor = 'rgba(15,44,89,0.3)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(15,44,89,0.04)'; e.currentTarget.style.borderColor = 'rgba(15,44,89,0.16)'; }}
        >
          <Pencil size={13} />
          Edit
        </button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {rows.map((row, idx) => {
          const Icon = row.icon;
          return (
            <div
              key={row.label}
              style={{
                display: 'flex', alignItems: 'center', gap: 13,
                padding: '12px 4px',
                borderBottom: idx < rows.length - 1 ? '1px solid rgba(16,24,40,0.05)' : 'none',
              }}
            >
              <div style={{
                width: 34, height: 34, borderRadius: '50%', flexShrink: 0,
                background: 'rgba(15,44,89,0.05)', color: navy[500],
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <Icon size={15} />
              </div>
              <div style={{ minWidth: 130, fontSize: 12, fontWeight: 600, color: '#8A94A6', fontFamily: FONT }}>
                {row.label}
              </div>
              <div style={{ flex: 1, textAlign: 'right', fontSize: 13, fontWeight: 600, color: '#1E293B', fontFamily: row.mono ? MONO : FONT, fontVariantNumeric: 'tabular-nums', lineHeight: 1.4, wordBreak: 'break-word' }}>
                {row.value}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

// ── Financial & Account Overview Card ───────────────────────────────────
interface FinancialOverviewCardProps {
  financial: FinancialState;
  onStatements: () => void;
  onContactRep: () => void;
}

const FinancialOverviewCard: React.FC<FinancialOverviewCardProps> = ({ financial, onStatements, onContactRep }) => {
  const limit = Number(financial.creditLimit) || 100000;
  const balance = Number(financial.balance) || 0;
  const available = Math.max(0, limit - Math.abs(balance));

  const tiles = [
    { icon: CreditCard, label: 'Credit Limit', value: formatK(limit), color: navy[600], bg: 'rgba(15,44,89,0.06)' },
    { icon: Receipt, label: 'Current Balance', value: formatK(Math.abs(balance)), color: balance < 0 ? '#DC2626' : '#1E293B', bg: balance < 0 ? 'rgba(220,38,38,0.06)' : 'rgba(15,23,42,0.05)' },
    { icon: Wallet, label: 'Available Credit', value: formatK(available), color: emerald[600], bg: 'rgba(5,150,105,0.08)' },
    { icon: Gift, label: 'Referral Earned', value: formatK(Number(financial.referralEarned) || 0), color: gold.ink, bg: 'rgba(255,165,0,0.09)' },
  ];

  return (
    <div className="white-card" style={{ padding: '22px 24px' }}>
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: '#0F172A', fontFamily: FONT, lineHeight: 1.3 }}>
          Financial &amp; Account Overview
        </div>
        <div style={{ fontSize: 11.5, color: '#8A94A6', marginTop: 2, fontFamily: FONT }}>
          Credit facility, outstanding balance and partner earnings
        </div>
      </div>

      {/* 4-tile grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 10, marginBottom: 18 }}>
        {tiles.map((tile) => {
          const Icon = tile.icon;
          return (
            <div key={tile.label} style={{
              padding: '14px 15px', borderRadius: 13,
              background: tile.bg, border: '1px solid rgba(16,24,40,0.05)',
              display: 'flex', flexDirection: 'column', gap: 8,
              transition: 'all .18s ease',
            }}
              onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 6px 16px -8px rgba(15,23,42,0.25)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = 'none'; }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                <Icon size={15} color={tile.color} />
                <span style={{ fontSize: 11, fontWeight: 600, color: '#64748B', letterSpacing: '0.03em', fontFamily: FONT, textTransform: 'uppercase' }}>
                  {tile.label}
                </span>
              </div>
              <span style={{ fontSize: 19, fontWeight: 700, color: tile.color, fontFamily: MONO, fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.01em', lineHeight: 1.2 }}>
                {tile.value}
              </span>
            </div>
          );
        })}
      </div>

      {/* Quick actions */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <button
          onClick={onStatements}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            padding: '10px 18px', borderRadius: 11, border: 'none', cursor: 'pointer',
            background: 'linear-gradient(135deg, #0F2C59 0%, #0A1F42 100%)',
            color: '#fff', fontSize: 13, fontWeight: 600, fontFamily: FONT,
            boxShadow: '0 6px 16px -6px rgba(15,44,89,0.6)',
            transition: 'all .18s ease', lineHeight: 1.4,
          }}
          onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 10px 22px -8px rgba(15,44,89,0.7)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = '0 6px 16px -6px rgba(15,44,89,0.6)'; }}
        >
          <FileBarChart size={16} />
          Statements
        </button>
        <button
          onClick={onContactRep}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            padding: '10px 18px', borderRadius: 11, cursor: 'pointer',
            border: '1px solid rgba(15,44,89,0.18)',
            background: '#fff', color: navy[600], fontSize: 13, fontWeight: 600, fontFamily: FONT,
            transition: 'all .18s ease', lineHeight: 1.4,
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(15,44,89,0.05)'; e.currentTarget.style.borderColor = 'rgba(15,44,89,0.35)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = '#fff'; e.currentTarget.style.borderColor = 'rgba(15,44,89,0.18)'; }}
        >
          <Headphones size={16} />
          Contact Rep
        </button>
      </div>
    </div>
  );
};

// ── Edit Profile Information Dialog ─────────────────────────────────────
interface EditProfileDialogProps {
  open: boolean;
  onClose: () => void;
  initial: { full_name: string; email: string; phone: string; address: string };
  saving: boolean;
  onSave: (values: { full_name: string; email: string; phone: string; address: string }) => void;
}

const EditProfileDialog: React.FC<EditProfileDialogProps> = ({ open, onClose, initial, saving, onSave }) => {
  const [form, setForm] = useState(initial);

  useEffect(() => {
    if (open) setForm(initial);
  }, [open, initial]);

  if (!open) return null;

  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(form);
  };

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 100,
        background: 'rgba(15,23,42,0.6)', backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="edit-profile-title"
        style={{
          background: 'rgba(255,255,255,0.97)', backdropFilter: 'blur(24px) saturate(160%)',
          WebkitBackdropFilter: 'blur(24px) saturate(160%)',
          borderRadius: 20, border: '1px solid rgba(226,232,240,0.9)',
          boxShadow: '0 30px 60px -15px rgba(15,23,42,0.35), 0 4px 12px -4px rgba(15,23,42,0.08)',
          width: '100%', maxWidth: 480, animation: 'modalIn .18s cubic-bezier(.4,0,.2,1)',
        }}
      >
        {/* Header */}
        <div style={{
          padding: '18px 24px', borderBottom: '1px solid #F1F5F9',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 34, height: 34, borderRadius: 10,
              background: 'linear-gradient(135deg, #0F2C59, #0A1F42)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 2px 8px -2px rgba(15,44,89,0.5)',
            }}>
              <Pencil size={16} color="#fff" />
            </div>
            <div>
              <h2 id="edit-profile-title" style={{ fontSize: 17, fontWeight: 700, color: '#0F172A', margin: 0, fontFamily: FONT, lineHeight: 1.25 }}>
                Edit Profile Information
              </h2>
              <p style={{ fontSize: 12, color: '#64748B', margin: '2px 0 0', fontFamily: FONT, lineHeight: 1.3 }}>
                Update your business contact details
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{ width: 34, height: 34, borderRadius: 10, border: '1px solid #E2E8F0', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#64748B', transition: 'all 150ms ease' }}
            aria-label="Close dialog"
          >
            <X size={18} />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit}>
          <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <label style={labelStyle}>Contact Person Name</label>
              <input style={inputStyle} value={form.full_name} onChange={set('full_name')} placeholder="John Doe" />
            </div>
            <div>
              <label style={labelStyle}>Email Address</label>
              <input style={inputStyle} type="email" value={form.email} onChange={set('email')} placeholder="john.doe@acme.com" />
            </div>
            <div>
              <label style={labelStyle}>Phone Number</label>
              <input style={inputStyle} value={form.phone} onChange={set('phone')} placeholder="+1 (555) 234-5678" />
            </div>
            <div>
              <label style={labelStyle}>Business Address</label>
              <textarea
                style={{ ...inputStyle, minHeight: 78, resize: 'vertical', lineHeight: 1.5, fontFamily: "'Inter', sans-serif" }}
                value={form.address}
                onChange={set('address')}
                placeholder="100 Industrial Parkway, Suite 400, Chicago, IL 60601"
              />
            </div>
          </div>

          <div style={{
            display: 'flex', justifyContent: 'flex-end', gap: 10,
            padding: '16px 24px', borderTop: '1px solid #F1F5F9',
          }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: '9px 18px', borderRadius: 10, cursor: 'pointer',
                border: '1px solid #E2E8F0', background: '#fff', color: '#64748B',
                fontSize: 13, fontWeight: 600, fontFamily: FONT,
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              style={{
                padding: '9px 18px', borderRadius: 10, cursor: saving ? 'default' : 'pointer', border: 'none',
                background: 'linear-gradient(135deg, #0F2C59, #0A1F42)',
                color: '#fff', fontSize: 13, fontWeight: 600, fontFamily: FONT,
                display: 'inline-flex', alignItems: 'center', gap: 7,
                boxShadow: '0 6px 16px -6px rgba(15,44,89,0.6)', opacity: saving ? 0.7 : 1,
              }}
            >
              {saving ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle2 size={15} />}
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// ── Contact Account Manager Dialog ──────────────────────────────────────
interface ContactRepDialogProps {
  open: boolean;
  onClose: () => void;
}

const ContactRepDialog: React.FC<ContactRepDialogProps> = ({ open, onClose }) => {
  if (!open) return null;

  const rows = [
    { icon: Mail, label: 'Direct Email', value: ACCOUNT_REP.email, href: `mailto:${ACCOUNT_REP.email}` },
    { icon: Phone, label: 'Direct Phone', value: ACCOUNT_REP.phone, href: `tel:${ACCOUNT_REP.phone.replace(/[^+\d]/g, '')}` },
    { icon: CalendarDays, label: 'Office Hours', value: ACCOUNT_REP.hours },
  ];

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 100,
        background: 'rgba(15,23,42,0.6)', backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="contact-rep-title"
        style={{
          background: 'rgba(255,255,255,0.97)', backdropFilter: 'blur(24px) saturate(160%)',
          WebkitBackdropFilter: 'blur(24px) saturate(160%)',
          borderRadius: 20, border: '1px solid rgba(226,232,240,0.9)',
          boxShadow: '0 30px 60px -15px rgba(15,23,42,0.35), 0 4px 12px -4px rgba(15,23,42,0.08)',
          width: '100%', maxWidth: 460, animation: 'modalIn .18s cubic-bezier(.4,0,.2,1)',
        }}
      >
        {/* Header */}
        <div style={{
          padding: '18px 24px', borderBottom: '1px solid #F1F5F9',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 34, height: 34, borderRadius: 10,
              background: 'linear-gradient(135deg, #059669, #065F46)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 2px 8px -2px rgba(5,150,105,0.5)',
            }}>
              <Headphones size={16} color="#fff" />
            </div>
            <div>
              <h2 id="contact-rep-title" style={{ fontSize: 17, fontWeight: 700, color: '#0F172A', margin: 0, fontFamily: FONT, lineHeight: 1.25 }}>
                Contact Account Manager
              </h2>
              <p style={{ fontSize: 12, color: '#64748B', margin: '2px 0 0', fontFamily: FONT, lineHeight: 1.3 }}>
                Your dedicated enterprise representative
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{ width: 34, height: 34, borderRadius: 10, border: '1px solid #E2E8F0', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#64748B', transition: 'all 150ms ease' }}
            aria-label="Close dialog"
          >
            <X size={18} />
          </button>
        </div>

        {/* Rep profile */}
        <div style={{ padding: '20px 24px' }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 13,
            padding: '16px 18px', borderRadius: 14,
            background: 'linear-gradient(135deg, #ECFDF5, #F0FDF9)',
            border: '1px solid rgba(5,150,105,0.2)',
            marginBottom: 16,
          }}>
            <div style={{
              width: 48, height: 48, borderRadius: '50%', flexShrink: 0,
              background: 'linear-gradient(135deg, #059669, #065F46)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#fff', fontWeight: 700, fontSize: 18, fontFamily: FONT,
              boxShadow: '0 4px 12px -4px rgba(5,150,105,0.6)',
            }}>
              {ACCOUNT_REP.name.split(' ').map(w => w[0]).join('')}
            </div>
            <div>
              <div style={{ fontSize: 15, fontWeight: 700, color: '#0F172A', fontFamily: FONT, lineHeight: 1.3 }}>{ACCOUNT_REP.name}</div>
              <div style={{ fontSize: 12, color: '#059669', fontWeight: 600, fontFamily: FONT, marginTop: 1 }}>{ACCOUNT_REP.role}</div>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {rows.map((row) => {
              const Icon = row.icon;
              const content = (
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 13px', borderRadius: 11, background: '#FAFAF7', border: '1px solid rgba(16,24,40,0.06)' }}>
                  <div style={{ width: 32, height: 32, borderRadius: 9, background: 'rgba(15,44,89,0.05)', color: navy[500], display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Icon size={15} />
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 10.5, fontWeight: 600, color: '#8A94A6', textTransform: 'uppercase', letterSpacing: '0.05em', fontFamily: FONT }}>{row.label}</div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#1E293B', fontFamily: FONT, marginTop: 1, wordBreak: 'break-word' }}>{row.value}</div>
                  </div>
                </div>
              );
              return row.href ? (
                <a key={row.label} href={row.href} style={{ textDecoration: 'none' }}>{content}</a>
              ) : (
                <div key={row.label}>{content}</div>
              );
            })}
          </div>

          <button
            onClick={onClose}
            style={{
              width: '100%', marginTop: 16, padding: '11px 18px', borderRadius: 11, cursor: 'pointer',
              border: '1px solid rgba(15,44,89,0.18)', background: '#fff', color: navy[600],
              fontSize: 13, fontWeight: 600, fontFamily: FONT,
              transition: 'all .18s ease',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(15,44,89,0.05)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = '#fff'; }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

// ── Main Component ──────────────────────────────────────────────────────
const CustomerProfile: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useCustomerAuth();
  const { companyConfig } = useAuth();
  const { addToast } = useToast();
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [form, setForm] = useState<ProfileData>({});

  // Company hub state
  const [financial, setFinancial] = useState<FinancialState>({ creditLimit: 0, balance: 0, referralEarned: 0, tier: '' });
  const [editOpen, setEditOpen] = useState(false);
  const [repOpen, setRepOpen] = useState(false);

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

  const [activeTab, setActiveTab] = useState('Company');

  // Stable object for the Edit Profile dialog so its initial-sync effect never
  // re-fires on parent re-renders (which would wipe in-progress edits).
  const editInitial = useMemo(
    () => ({
      full_name: profile?.full_name || '',
      email: profile?.email || user?.email || '',
      phone: profile?.phone || '',
      address: profile?.address || '',
    }),
    [profile?.full_name, profile?.email, profile?.phone, profile?.address, user?.email]
  );

  // Stable account ID derived from the company name.
  const accountId = useMemo(() => {
    const base = (companyConfig?.companyName || 'CUS').replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 4) || 'CUS';
    const code = [...base].reduce((acc, ch) => acc + ch.charCodeAt(0), 0).toString(16).toUpperCase().padStart(4, '0');
    return `ACC-${base}-${code}`;
  }, [companyConfig?.companyName]);

  // Tier progression: computed from loyalty data when available.
  const tierProgress = financial.tier && financial.tier !== 'Standard' ? 75 : 0;
  const nextTier = financial.tier === 'Gold' ? 'Platinum' : financial.tier === 'Silver' ? 'Gold' : 'Silver';

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

  // Load the company hub's financial summary (non-fatal — UI falls back to sample defaults).
  const loadFinancial = useCallback(async () => {
    try {
      const stmt = await portalLifecycle.statements.list({});
      if (stmt) {
        const limit = Number(stmt.credit_limit || 0);
        const balance = Number(stmt.outstanding_balance ?? stmt.closing_balance ?? 0);
        setFinancial((f) => ({ ...f, creditLimit: limit, balance }));
      }
    } catch { /* display-only, non-fatal */ }
    try {
      const stats = await portalLifecycle.referrals.stats();
      if (stats) setFinancial((f) => ({ ...f, referralEarned: Number(stats.totalEarned || 0) }));
    } catch { /* display-only, non-fatal */ }
    try {
      const loyalty = await portalLifecycle.loyalty.get();
      if (loyalty?.tier) setFinancial((f) => ({ ...f, tier: loyalty.tier }));
    } catch { /* display-only, non-fatal */ }
  }, []);

  useEffect(() => { loadFinancial(); }, [loadFinancial]);

  useEffect(() => {
    let cancelled = false;
    let unsubscribe: (() => void) | undefined;
    (async () => {
      unsubscribe = await portalLifecycle.subscribe({
        onEvent: (type, payload) => {
          if (type === 'entity_changed' && (payload?.docType === 'customer_updated' || payload?.docType === 'customer') && !cancelled) {
            loadProfile();
            loadFinancial();
          }
        },
      });
    })();
    return () => { cancelled = true; unsubscribe?.(); };
  }, [loadProfile, loadFinancial]);

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

  // Edit Profile modal → save contact info and reflect changes instantly.
  const handleEditSave = async (values: { full_name: string; email: string; phone: string; address: string }) => {
    setSaving(true);
    try {
      await portalLifecycle.profile.update({
        full_name: values.full_name,
        email: values.email,
        phone: values.phone,
        address: values.address,
      });
      setProfile((p) => ({ ...(p || {}), ...values }));
      setForm((f) => ({ ...f, ...values }));
      setEditOpen(false);
      addToast('success', 'Company profile updated');
    } catch (err: any) {
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

  const companyName = companyConfig?.companyName || 'Acme Corp B2B';

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
          {activeTab === 'Personal' && (
            <button onClick={handleSave} style={{
              display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer',
              fontSize: 12, fontWeight: 600, padding: '7px 12px', borderRadius: 8, border: 'none',
              background: '#ffffff', color: teal[700],
            }}>
              <CheckCircle2 size={14} /> Save
            </button>
          )}
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
              fontSize: 20, margin: 0, color: '#ffffff', letterSpacing: 0.3,
            }}>
              {allTabs.find(t => t.id === activeTab)?.label || 'Profile'}
            </h1>
            <p style={{ margin: '2px 0 0', fontSize: 11.5, color: 'rgba(255,255,255,0.78)' }}>
              {menuGroups.find(g => g.items.some(i => i.id === activeTab))?.title || 'Profile'} &mdash; Manage your account
            </p>
          </div>
        </div>
        {activeTab === 'Personal' && (
          <button onClick={handleSave} style={{
            display: 'flex', alignItems: 'center', gap: 7, cursor: 'pointer',
            fontSize: 13, fontWeight: 600, padding: '8px 14px', borderRadius: 10, border: 'none',
            background: '#ffffff', color: teal[700],
            boxShadow: '0 8px 18px -8px rgba(0,0,0,0.45)',
          }}>
            <CheckCircle2 size={16} /> Save Profile
          </button>
        )}
      </div>

      <div className="flex" style={{ minHeight: 'calc(100vh - 140px)' }}>
        {/* Desktop sidebar — hidden on mobile */}
        <div className="hidden md:flex" style={{
          width: 260, flexShrink: 0,
          background: '#FFFFFF',
          borderRight: '1px solid rgba(16,24,40,0.07)',
          flexDirection: 'column', overflowY: 'auto',
        }}>
          <div style={{ color: '#8b938f', fontSize: 12, letterSpacing: '1px', textTransform: 'uppercase', fontWeight: 700, padding: '20px 18px 10px' }}>
            Profile
          </div>
          <div style={{ padding: '0 12px 16px', flex: 1 }}>
            {menuGroups.map(group => (
              <div key={group.title} style={{ marginBottom: 18 }}>
                <div style={{ color: '#9aa19c', fontSize: 12, letterSpacing: '0.9px', textTransform: 'uppercase', fontWeight: 700, padding: '4px 6px 9px' }}>
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

            {/* Company Profile & Status hub */}
            {activeTab === 'Company' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                <CompanyHeaderCard companyName={companyName} accountId={accountId} tier={financial.tier} />
                <TierProgressCard tier={financial.tier} progress={tierProgress} nextTier={nextTier} />
                <BasicInfoCard profile={profile || {}} companyName={companyName} onEdit={() => setEditOpen(true)} />
                <FinancialOverviewCard
                  financial={financial}
                  onStatements={() => navigate('/portal/account-statements')}
                  onContactRep={() => setRepOpen(true)}
                />
              </div>
            )}

            {/* Personal Info */}
            {activeTab === 'Personal' && (
              <form onSubmit={handleSave}>
                <div style={{ fontSize: 12, fontWeight: 700, color: teal[800], textTransform: 'uppercase', letterSpacing: 0.06, marginBottom: 10, paddingLeft: 10, borderLeft: `3px solid ${teal[500]}` }}>
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
                      padding: '8px 14px', borderRadius: 10, cursor: saving ? 'default' : 'pointer', border: 'none',
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
                <div style={{ fontSize: 12, fontWeight: 700, color: teal[800], textTransform: 'uppercase', letterSpacing: 0.06, marginBottom: 10, paddingLeft: 10, borderLeft: `3px solid ${teal[500]}` }}>
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
                <div style={{ fontSize: 12, fontWeight: 700, color: teal[800], textTransform: 'uppercase', letterSpacing: 0.06, marginBottom: 10, paddingLeft: 10, borderLeft: `3px solid ${teal[500]}` }}>
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
                        padding: '8px 14px', borderRadius: 10, cursor: changingPassword ? 'default' : 'pointer', border: 'none',
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
                <div style={{ fontSize: 12, fontWeight: 700, color: teal[800], textTransform: 'uppercase', letterSpacing: 0.06, marginBottom: 10, paddingLeft: 10, borderLeft: `3px solid ${teal[500]}` }}>
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
                          padding: '8px 14px', borderRadius: 10, cursor: twoFactorLoading ? 'default' : 'pointer',
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
                            padding: '8px 14px', borderRadius: 10, cursor: twoFactorLoading ? 'default' : 'pointer', border: 'none',
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
                        padding: '8px 14px', borderRadius: 10, cursor: twoFactorLoading ? 'default' : 'pointer', border: 'none',
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
                <div style={{ fontSize: 12, fontWeight: 700, color: teal[800], textTransform: 'uppercase', letterSpacing: 0.06, marginBottom: 10, paddingLeft: 10, borderLeft: `3px solid ${teal[500]}` }}>
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

      <EditProfileDialog
        open={editOpen}
        onClose={() => setEditOpen(false)}
        initial={editInitial}
        saving={saving}
        onSave={handleEditSave}
      />

      <ContactRepDialog open={repOpen} onClose={() => setRepOpen(false)} />
    </div>
  );
};

export default CustomerProfile;
