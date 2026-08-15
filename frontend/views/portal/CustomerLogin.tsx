import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Lock, Loader2, Mail, KeyRound, Shield, QrCode } from 'lucide-react';
import { useCustomerAuth } from '../../context/CustomerAuthContext';
import ErrorBanner from './components/ErrorBanner';

const CustomerLogin: React.FC = () => {
  const navigate = useNavigate();
  const { loginWithApi } = useCustomerAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingToken, setPendingToken] = useState<string | null>(null);
  const [twoFactorCode, setTwoFactorCode] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) return;
    setSubmitting(true);
    setError(null);

    const result = await loginWithApi(email.trim(), password);
    if (result.success) {
      navigate('/portal/dashboard', { replace: true });
      return;
    }
    if (result.requiresTwoFactor) {
      setPendingToken(result.pendingToken || null);
      return;
    }
    setError(result.message || 'Login failed. Please try again.');
    setSubmitting(false);
  };

  const handleTwoFactorSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!twoFactorCode || twoFactorCode.length < 6) return;
    setSubmitting(true);
    setError(null);

    const result = await loginWithApi(email.trim(), password, twoFactorCode);
    if (result.success) {
      navigate('/portal/dashboard', { replace: true });
      return;
    }
    setError(result.message || 'Login failed. Please try again.');
    setSubmitting(false);
  };

  const inputClass = "w-full h-11 pl-10 pr-4 bg-slate-50/80 border border-slate-200 rounded-xl text-sm text-slate-900 placeholder-slate-400 outline-none focus:bg-white focus:ring-4 focus:ring-teal-500/10 focus:border-teal-500/60 transition-all shadow-2xs";

  return (
    <div className="fixed inset-0 overflow-y-auto bg-slate-900 font-sans">
      <div className="min-h-full flex items-center justify-center p-6 relative">
        {/* Background Mesh Orbs */}
        <div className="fixed inset-0 pointer-events-none overflow-hidden">
          <div className="absolute -top-32 -right-32 w-[650px] h-[650px] bg-gradient-to-br from-teal-500/20 via-emerald-500/10 to-transparent rounded-full blur-[140px]" />
          <div className="absolute -bottom-32 -left-32 w-[600px] h-[600px] bg-gradient-to-tr from-amber-500/15 via-teal-600/10 to-transparent rounded-full blur-[120px]" />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-radial from-teal-900/30 to-transparent blur-[160px]" />
        </div>

        <div className="w-full max-w-[440px] relative z-10 bg-white/95 backdrop-blur-2xl border border-white/20 rounded-3xl p-8 md:p-10 shadow-2xl shadow-slate-950/50">
          <div className="flex items-center gap-3.5 mb-8">
            <div className="w-12 h-12 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-teal-900/30" style={{ background: 'linear-gradient(135deg, #3fa294, #0f544c)' }}>
              <Lock size={22} />
            </div>
            <div>
              <div className="font-extrabold text-xl tracking-tight text-slate-900">
                Prime<span style={{ color: '#f59e0b' }}>PORTAL</span>
              </div>
              <div className="text-[10px] font-extrabold uppercase tracking-[0.2em] text-slate-400">Customer Portal</div>
            </div>
          </div>

          <div className="mb-8">
            <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">Welcome Back</h1>
            <p className="mt-2 text-xs font-medium text-slate-500 leading-relaxed">Sign in with your email and password to access invoices, orders, quotations, and account billing.</p>
          </div>

          {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}

          {pendingToken ? (
            <div>
              <div className="mb-6">
                <h2 className="text-lg font-bold tracking-tight text-slate-900">Two-Factor Authentication</h2>
                <p className="mt-1 text-xs text-slate-500">Enter the 6-digit code from your authenticator app to complete sign in.</p>
              </div>

              <form onSubmit={handleTwoFactorSubmit} className="space-y-5">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Verification Code</label>
                  <div className="relative">
                    <Shield size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      value={twoFactorCode}
                      onChange={(e) => setTwoFactorCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                      placeholder="000000"
                      autoComplete="one-time-code"
                      className={inputClass}
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={submitting || twoFactorCode.length < 6}
                  className="w-full h-11 text-white text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed btn-press"
                  style={{ background: 'linear-gradient(135deg, #146b60 0%, #0f544c 100%)', boxShadow: '0 6px 20px rgba(15, 84, 76, 0.35)' }}
                >
                  {submitting ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    'Verify & Sign In'
                  )}
                </button>
              </form>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Email Address</label>
                <div className="relative">
                  <Mail size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@company.com"
                    autoComplete="email"
                    className={inputClass}
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Password</label>
                <div className="relative">
                  <Lock size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••••••"
                    autoComplete="current-password"
                    className={inputClass}
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={submitting || !email.trim() || !password}
                className="w-full h-11 text-white text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed btn-press"
                style={{ background: 'linear-gradient(135deg, #146b60 0%, #0f544c 100%)', boxShadow: '0 6px 20px rgba(15, 84, 76, 0.35)' }}
              >
                {submitting ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  'Sign In to Customer Portal'
                )}
              </button>

              <div className="mt-5 pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
                <Link to="/portal/activate" className="text-slate-500 hover:text-teal-600 font-semibold transition-colors inline-flex items-center gap-1.5">
                  <KeyRound size={13} />
                  Activate account
                </Link>
                <Link to="/portal/forgot-password" className="text-slate-500 hover:text-teal-600 font-semibold transition-colors">
                  Forgot password?
                </Link>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};

export default CustomerLogin;
