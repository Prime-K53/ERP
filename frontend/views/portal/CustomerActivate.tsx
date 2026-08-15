import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Fingerprint, KeyRound, Lock, Loader2 } from 'lucide-react';
import { useCustomerAuth } from '../../context/CustomerAuthContext';
import ErrorBanner from './components/ErrorBanner';

const CustomerActivate: React.FC = () => {
  const navigate = useNavigate();
  const { activate } = useCustomerAuth();
  const [customerId, setCustomerId] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customerId.trim() || !inviteCode.trim() || !newPassword) return;
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    if (newPassword.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }
    setSubmitting(true);
    setError(null);

    const result = await activate(customerId.trim(), inviteCode.trim(), newPassword);
    if (result === 'SUCCESS') {
      navigate('/portal/dashboard', { replace: true });
      return;
    }
    setError('Invalid customer ID or invite code. Codes expire after 30 minutes.');
    setSubmitting(false);
  };

  const inputClass = "w-full h-11 pl-10 pr-4 bg-slate-50/80 border border-slate-200 rounded-xl text-sm text-slate-900 placeholder-slate-400 outline-none focus:bg-white focus:ring-4 focus:ring-amber-500/10 focus:border-amber-500/60 transition-all shadow-2xs";

  return (
    <div className="fixed inset-0 overflow-y-auto bg-slate-900 font-sans">
      <div className="min-h-full flex items-center justify-center p-6 relative">
        <div className="fixed inset-0 pointer-events-none overflow-hidden">
          <div className="absolute -top-32 -right-32 w-[650px] h-[650px] bg-gradient-to-br from-amber-500/20 via-teal-500/10 to-transparent rounded-full blur-[140px]" />
          <div className="absolute -bottom-32 -left-32 w-[600px] h-[600px] bg-gradient-to-tr from-teal-500/15 via-amber-600/10 to-transparent rounded-full blur-[120px]" />
        </div>

        <div className="w-full max-w-[440px] relative z-10 bg-white/95 backdrop-blur-2xl border border-white/20 rounded-3xl p-8 md:p-10 shadow-2xl shadow-slate-950/50">
          <div className="flex items-center gap-3.5 mb-8">
            <div className="w-12 h-12 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-amber-900/20" style={{ background: 'linear-gradient(135deg, #f59e0b, #d99a3f)' }}>
              <KeyRound size={22} />
            </div>
            <div>
              <div className="font-extrabold text-xl tracking-tight text-slate-900">
                Prime<span style={{ color: '#f59e0b' }}>PORTAL</span>
              </div>
              <div className="text-[10px] font-extrabold uppercase tracking-[0.2em] text-slate-400">Account Activation</div>
            </div>
          </div>

          <div className="mb-8">
            <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">Activate Your Account</h1>
            <p className="mt-2 text-xs font-medium text-slate-500 leading-relaxed">Enter your Customer ID and 6-digit invite code to establish your password.</p>
          </div>

          {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Customer ID</label>
              <div className="relative">
                <Fingerprint size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={customerId}
                  onChange={(e) => setCustomerId(e.target.value)}
                  placeholder="e.g. CUST-10492"
                  className={inputClass}
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Invite Code</label>
              <div className="relative">
                <KeyRound size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={inviteCode}
                  onChange={(e) => setInviteCode(e.target.value)}
                  placeholder="6-digit code"
                  className={inputClass}
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">New Password</label>
              <div className="relative">
                <Lock size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="At least 6 characters"
                  className={inputClass}
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Confirm Password</label>
              <div className="relative">
                <Lock size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Repeat your password"
                  className={inputClass}
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={submitting || !customerId.trim() || !inviteCode.trim() || !newPassword || !confirmPassword}
              className="w-full h-11 text-white text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed btn-press"
              style={{ background: 'linear-gradient(135deg, #f59e0b 0%, #d99a3f 100%)', boxShadow: '0 6px 20px rgba(245, 158, 11, 0.35)' }}
            >
              {submitting ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                'Activate & Complete Setup'
              )}
            </button>
          </form>

          <div className="mt-8 pt-5 border-t border-slate-100 text-center">
            <Link to="/portal/login" className="text-xs font-semibold text-slate-500 hover:text-amber-600 transition-colors">
              Return to Sign In
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CustomerActivate;
