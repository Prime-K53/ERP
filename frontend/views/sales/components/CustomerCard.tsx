import React, { useState } from 'react';
import { X, User, Phone, MapPin, ChevronRight, KeyRound, RefreshCw, Copy, Check, Globe, Loader2 } from 'lucide-react';
import { Customer } from '../../../types';
import { adminLifecycle, type PortalCredentials } from '../../../services/adminPortalClient';

interface CustomerCardProps {
  customer: Customer;
  onClose: () => void;
  onViewProfile?: (customer: Customer) => void;
  onEdit?: (customer: Customer) => void;
  onCreateInvoice?: (customer: Customer) => void;
  onCreateQuote?: (customer: Customer) => void;
  onStatement?: (customer: Customer) => void;
  onWhatsApp?: (customer: Customer) => void;
  onPortalUpdate?: (customer: Customer) => void;
}

const teal: Record<string, string> = { 50: '#eef7f6', 100: '#d3ece9', 200: '#a6d9d3', 300: '#72c0b7', 400: '#3fa294', 500: '#1f8577', 600: '#146b60', 700: '#0f544c', 800: '#0b3e39', 900: '#082e2a' };
const amber: Record<string, string> = { 100: '#fbead0', 300: '#eec27a', 500: '#d99a3f', 600: '#b97e2b' };
const paper = '#FEFDFB';
const ink = '#23282A';
const inkSoft = '#5c6567';
const hairline = '#e4ddd1';
const danger = '#b5493f';

const btnStyle: React.CSSProperties = {
  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
  padding: '12px 8px 10px', background: teal[50], border: `1px solid ${teal[100]}`,
  borderRadius: 10, cursor: 'pointer', fontSize: 11, fontWeight: 500,
  color: ink, fontFamily: "'Inter', sans-serif", transition: 'all .15s ease'
};

export const CustomerCard: React.FC<CustomerCardProps> = ({
  customer, onClose, onViewProfile, onEdit,
  onCreateInvoice, onCreateQuote, onStatement, onWhatsApp, onPortalUpdate,
}) => {
  const [portalCreds, setPortalCreds] = useState<PortalCredentials | null>(null);
  const [portalBusy, setPortalBusy] = useState(false);
  const [portalError, setPortalError] = useState<string | null>(null);
  const [copiedField, setCopiedField] = useState<'email' | 'password' | null>(null);

  const copyCredential = async (field: 'email' | 'password') => {
    if (!portalCreds) return;
    try {
      await navigator.clipboard.writeText(portalCreds[field]);
      setCopiedField(field);
      setTimeout(() => setCopiedField(null), 1500);
    } catch { /* clipboard unavailable */ }
  };

  const applyPortalAccount = (account: { id: string; email: string; status?: string }, creds: PortalCredentials | null) => {
    if (creds) setPortalCreds(creds);
    onPortalUpdate?.({
      ...customer,
      portalUserId: account.id,
      portalEmail: account.email,
      portalStatus: account.status || 'active',
    });
  };

  const handleCreatePortal = async () => {
    if (portalBusy) return;
    setPortalBusy(true);
    setPortalError(null);
    try {
      const result = await adminLifecycle.users.autoCreate({
        customer_id: customer.id,
        name: customer.name,
        email: customer.email,
        phone: customer.phone,
      });
      if (result?.user) {
        applyPortalAccount(
          { id: result.user.id, email: result.user.email, status: result.user.status },
          result.generated_password
            ? { email: result.user.email, password: result.generated_password }
            : null
        );
      }
    } catch (err: any) {
      setPortalError(err?.body?.error || err?.message || 'Failed to create portal account');
    } finally {
      setPortalBusy(false);
    }
  };

  const handleRegeneratePassword = async () => {
    if (portalBusy || !customer.portalUserId) return;
    setPortalBusy(true);
    setPortalError(null);
    try {
      const result = await adminLifecycle.users.regeneratePassword(customer.portalUserId as string, {
        customer_id: customer.id,
        name: customer.name,
        email: customer.email,
        phone: customer.phone,
      });
      if (result.user_id && result.user_id !== customer.portalUserId) {
        applyPortalAccount(
          { id: result.user_id, email: customer.portalEmail || '', status: customer.portalStatus },
          { email: customer.portalEmail || '', password: result.generated_password }
        );
      } else {
        setPortalCreds({ email: customer.portalEmail || '', password: result.generated_password });
      }
    } catch (err: any) {
      setPortalError(err?.body?.error || err?.message || 'Failed to regenerate password');
    } finally {
      setPortalBusy(false);
    }
  };

  const portalActive = Boolean(customer.portalUserId) && customer.portalStatus !== 'disabled';

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'rgba(15, 23, 42, 0.6)',
      padding: '40px 20px', fontFamily: "'Inter','DM Sans',sans-serif", fontSize: 13.5, color: ink,
    }} onClick={onClose}>
      <div style={{
        width: 480, maxWidth: '100%',
        background: paper, borderRadius: 14,
        boxShadow: '0 30px 70px -20px rgba(0,0,0,.55), 0 8px 24px -8px rgba(0,0,0,.35), 0 0 0 1px rgba(255,255,255,.04)',
        overflow: 'hidden', position: 'relative'
      }} onClick={(e) => e.stopPropagation()}>
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, height: 4,
          background: `linear-gradient(90deg, ${teal[600]}, ${teal[400]} 40%, ${amber[500]} 100%)`
        }} />

        {/* Header */}
        <div style={{
          background: `linear-gradient(135deg, ${teal[800]} 0%, ${teal[600]} 100%)`,
          padding: '24px 24px 18px', position: 'relative'
        }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
            <div style={{
              width: 56, height: 56, borderRadius: 12,
              background: 'rgba(255,255,255,0.15)',
              border: '2px solid rgba(255,255,255,0.25)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0, fontSize: 22, fontWeight: 600, color: '#fff', letterSpacing: -1
            }}>
              {customer.name?.charAt(0)?.toUpperCase() || '?'}
              {customer.name?.split(' ')[1]?.charAt(0)?.toUpperCase() || ''}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 17, fontWeight: 600, color: '#fff', lineHeight: 1.25, marginBottom: 4 }}>{customer.name}</div>
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.55)', fontFamily: "'JetBrains Mono', monospace", letterSpacing: 0.06, textTransform: 'uppercase' }}>
                {customer.id} &middot; {customer.segment || 'Individual'}
              </div>
              <div style={{
                marginTop: 6, display: 'inline-flex', alignItems: 'center', gap: 5,
                background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.2)',
                borderRadius: 20, padding: '2px 10px', fontSize: 10, color: 'rgba(255,255,255,0.85)', fontWeight: 500
              }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#4ADE80' }} />
                {customer.status || 'Active'}
              </div>
            </div>
            <button onClick={onClose}
              style={{ width: 28, height: 28, borderRadius: 8, background: 'rgba(255,255,255,0.12)', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <X size={13} />
            </button>
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
            {customer.phone && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'rgba(255,255,255,0.1)', borderRadius: 7, padding: '5px 9px', fontSize: 11, color: 'rgba(255,255,255,0.85)' }}>
                <Phone size={12} style={{ opacity: 0.75 }} /> {customer.phone}
              </div>
            )}
            {customer.address && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'rgba(255,255,255,0.1)', borderRadius: 7, padding: '5px 9px', fontSize: 11, color: 'rgba(255,255,255,0.85)' }}>
                <MapPin size={12} style={{ opacity: 0.75 }} /> {customer.address}
              </div>
            )}
          </div>
        </div>

        {/* Body */}
        <div style={{ padding: '20px 22px 22px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 18 }}>
            <div style={{ padding: 12, borderRadius: 10, background: teal[50], border: `1px solid ${teal[100]}`, position: 'relative', overflow: 'hidden' }}>
              <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: danger, borderRadius: '10px 10px 0 0' }} />
              <div style={{ fontSize: 9, fontWeight: 600, letterSpacing: 0.08, textTransform: 'uppercase', color: inkSoft, marginBottom: 4 }}>Open Balance</div>
              <div style={{ fontSize: 20, fontWeight: 500, color: danger, fontFamily: "'JetBrains Mono', monospace", lineHeight: 1 }}>${(customer.balance || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
            </div>
            <div style={{ padding: 12, borderRadius: 10, background: teal[50], border: `1px solid ${teal[100]}`, position: 'relative', overflow: 'hidden' }}>
              <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: '#059669', borderRadius: '10px 10px 0 0' }} />
              <div style={{ fontSize: 9, fontWeight: 600, letterSpacing: 0.08, textTransform: 'uppercase', color: inkSoft, marginBottom: 4 }}>Wallet</div>
              <div style={{ fontSize: 20, fontWeight: 500, color: '#059669', fontFamily: "'JetBrains Mono', monospace", lineHeight: 1 }}>${(customer.walletBalance || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
            </div>
          </div>

          {customer.subAccounts && customer.subAccounts.length > 0 && (
            <>
              <div style={{ fontSize: 9, fontWeight: 600, letterSpacing: 0.1, textTransform: 'uppercase', color: inkSoft, marginBottom: 8 }}>
                Sub Accounts ({customer.subAccounts.length})
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginBottom: 18 }}>
                {customer.subAccounts.map((sub: any) => (
                  <div key={sub.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', background: teal[50], border: `1px solid ${teal[100]}`, borderRadius: 8, fontSize: 12, color: ink, fontWeight: 500 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ width: 24, height: 24, borderRadius: 6, background: paper, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11 }}>
                        {sub.name?.charAt(0)?.toUpperCase() || '?'}
                      </div>
                      {sub.name}
                    </div>
                    <span style={{ fontSize: 9, fontWeight: 600, padding: '1px 7px', borderRadius: 20, background: sub.status === 'Active' ? '#dcfce7' : hairline, color: sub.status === 'Active' ? '#15803d' : inkSoft }}>
                      {sub.status}
                    </span>
                  </div>
                ))}
              </div>
              <div style={{ height: 1, background: hairline, margin: '14px 0' }} />
            </>
          )}

          <div style={{ fontSize: 9, fontWeight: 600, letterSpacing: 0.1, textTransform: 'uppercase', color: inkSoft, marginBottom: 8 }}>Customer Portal</div>
          <div style={{ padding: 12, borderRadius: 10, background: teal[50], border: `1px solid ${teal[100]}`, marginBottom: 18 }}>
            {portalActive ? (
              <>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
                    <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#4ADE80', flexShrink: 0 }} />
                    <span style={{ fontSize: 11, fontWeight: 700, color: '#15803d' }}>Active</span>
                    <span style={{ fontSize: 12.5, fontWeight: 600, color: ink, fontFamily: "'JetBrains Mono', monospace", overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {customer.portalEmail}
                    </span>
                  </div>
                  <button onClick={handleRegeneratePassword} disabled={portalBusy}
                    style={{
                      flexShrink: 0, display: 'flex', alignItems: 'center', gap: 5,
                      fontSize: 10.5, fontWeight: 600, padding: '5px 10px', borderRadius: 8, cursor: 'pointer',
                      background: paper, border: `1px solid ${teal[200]}`, color: teal[700],
                      transition: 'all .15s ease', opacity: portalBusy ? 0.6 : 1
                    }}>
                    {portalBusy ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
                    New Password
                  </button>
                </div>
                <p style={{ margin: 0, fontSize: 10.5, color: inkSoft, lineHeight: 1.5 }}>
                  The generated password is shown once. Use &ldquo;New Password&rdquo; to rotate it (old sessions are revoked).
                </p>
              </>
            ) : (
              <>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                    <Globe size={14} color={inkSoft} />
                    <span style={{ fontSize: 12, color: inkSoft, fontWeight: 500 }}>No portal account yet</span>
                  </div>
                  <button onClick={handleCreatePortal} disabled={portalBusy}
                    style={{
                      flexShrink: 0, display: 'flex', alignItems: 'center', gap: 5,
                      fontSize: 10.5, fontWeight: 700, padding: '5px 10px', borderRadius: 8, cursor: 'pointer',
                      background: `linear-gradient(155deg, ${teal[500]}, ${teal[700]})`, border: 'none', color: '#fff',
                      boxShadow: `0 4px 10px -3px rgba(15,84,76,.55)`, transition: 'all .15s ease', opacity: portalBusy ? 0.6 : 1
                    }}>
                    {portalBusy ? <Loader2 size={12} className="animate-spin" /> : <KeyRound size={12} />}
                    Create Portal Account
                  </button>
                </div>
                {portalError && (
                  <p style={{ margin: '8px 0 0', fontSize: 10.5, color: danger, lineHeight: 1.5 }}>{portalError}</p>
                )}
              </>
            )}
          </div>

          <div style={{ fontSize: 9, fontWeight: 600, letterSpacing: 0.1, textTransform: 'uppercase', color: inkSoft, marginBottom: 8 }}>Quick Actions</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
            <button style={btnStyle} onClick={() => onCreateInvoice?.(customer)}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={teal[600]} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/>
              </svg>
              Invoice
            </button>
            <button style={btnStyle} onClick={() => onCreateQuote?.(customer)}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={teal[600]} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/>
              </svg>
              Quote
            </button>
            <button style={btnStyle} onClick={() => onStatement?.(customer)}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={teal[600]} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 17H5a2 2 0 00-2 2v1M15 17h4a2 2 0 012 2v1M12 11V3M8 7l4-4 4 4"/>
              </svg>
              Statement
            </button>
            <button style={btnStyle} onClick={() => onWhatsApp?.(customer)}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#25D366" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
              </svg>
              WhatsApp
            </button>
            <button style={{ ...btnStyle, gridColumn: 'span 2' }} onClick={() => onViewProfile?.(customer)}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#7c3aed" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/>
              </svg>
              View Profile
            </button>
            <button style={{ ...btnStyle, gridColumn: 'span 2' }} onClick={() => onEdit?.(customer)}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={amber[500]} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
              </svg>
              Edit Details
            </button>
          </div>
        </div>
      </div>

      {portalCreds && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'rgba(15, 23, 42, 0.6)', padding: '40px 20px', fontFamily: "'Inter','DM Sans',sans-serif", fontSize: 13.5, color: ink,
        }}>
          <div style={{
            width: '100%', maxWidth: 440, background: paper, borderRadius: 14,
            border: `1px solid ${hairline}`,
            boxShadow: '0 30px 70px -20px rgba(0,0,0,.55), 0 8px 24px -8px rgba(0,0,0,.35)',
            overflow: 'hidden', position: 'relative'
          }} onClick={(e) => e.stopPropagation()}>
            <div style={{ height: 4, background: `linear-gradient(90deg, ${teal[600]}, ${teal[400]} 40%, ${amber[500]} 100%)` }} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '20px 24px 14px' }}>
              <div style={{
                width: 38, height: 38, borderRadius: 10,
                background: `linear-gradient(155deg, ${teal[500]}, ${teal[700]})`,
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
              }}>
                <KeyRound size={16} color="#fff" />
              </div>
              <div>
                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: teal[800] }}>
                  {customer.portalUserId ? 'Password Updated' : 'Portal Credentials'}
                </h3>
                <p style={{ margin: '2px 0 0', fontSize: 11.5, color: inkSoft }}>
                  {customer.portalUserId
                    ? 'A new password was generated. The old one no longer works.'
                    : 'Share these credentials with the customer. The password is shown only once.'}
                </p>
              </div>
            </div>
            <div style={{ padding: '6px 24px 20px', display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '10px 12px', background: teal[50], border: `1px solid ${teal[100]}`, borderRadius: 9 }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 0.08, textTransform: 'uppercase', color: inkSoft }}>Portal Email</div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: ink, fontFamily: "'JetBrains Mono', monospace", overflow: 'hidden', textOverflow: 'ellipsis' }}>{portalCreds.email}</div>
                </div>
                <button onClick={() => copyCredential('email')} style={{ flexShrink: 0, width: 32, height: 32, borderRadius: 8, border: `1px solid ${teal[200]}`, background: paper, color: teal[700], cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {copiedField === 'email' ? <Check size={14} /> : <Copy size={14} />}
                </button>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '10px 12px', background: amber[100], border: `1px solid ${amber[300]}`, borderRadius: 9 }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 0.08, textTransform: 'uppercase', color: '#8a5a1a' }}>
                    {customer.portalUserId ? 'New Password' : 'Temporary Password'}
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: ink, fontFamily: "'JetBrains Mono', monospace", overflow: 'hidden', textOverflow: 'ellipsis' }}>{portalCreds.password}</div>
                </div>
                <button onClick={() => copyCredential('password')} style={{ flexShrink: 0, width: 32, height: 32, borderRadius: 8, border: `1px solid ${amber[300]}`, background: paper, color: amber[600], cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {copiedField === 'password' ? <Check size={14} /> : <Copy size={14} />}
                </button>
              </div>
              <p style={{ margin: 0, fontSize: 11, color: inkSoft, lineHeight: 1.5 }}>
                The customer signs in at <b>#/portal/login</b> with the Email &amp; Password method.
              </p>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, padding: '14px 24px', borderTop: `1px solid ${hairline}`, background: paper }}>
              <button onClick={() => setPortalCreds(null)}
                style={{
                  fontFamily: "'Inter', sans-serif", fontSize: 13, fontWeight: 600,
                  padding: '9px 18px', borderRadius: 9, cursor: 'pointer',
                  background: paper, border: `1.4px solid ${hairline}`, color: inkSoft,
                  display: 'flex', alignItems: 'center', gap: 7, transition: 'all .15s ease'
                }}>
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CustomerCard;
