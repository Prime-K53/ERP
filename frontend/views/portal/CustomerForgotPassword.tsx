import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Mail, ArrowLeft, Loader2, CheckCircle } from 'lucide-react';
import { useToast } from './components/Toast';
import ErrorBanner from './components/ErrorBanner';
import { portalApi } from '../../services/portalApiClient';

const CustomerForgotPassword: React.FC = () => {
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { addToast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      await portalApi.post('/auth/forgot-password', { email: email.trim() });
      setSent(true);
      addToast('success', 'Password reset link sent to your email.');
    } catch (err: any) {
      const msg = err?.body?.error || 'Failed to send reset email.';
      setError(msg);
      addToast('error', msg);
    } finally {
      setSubmitting(false);
    }
  };

  const inputClass = "w-full h-11 pl-10 pr-4 bg-slate-50/80 border border-slate-200 rounded-xl text-sm text-slate-900 placeholder-slate-400 outline-none focus:bg-white focus:ring-4 focus:ring-teal-500/10 focus:border-teal-500/60 transition-all shadow-2xs";

  return (
    <div className="fixed inset-0 overflow-y-auto bg-slate-900 font-sans">
      <div className="min-h-full flex items-center justify-center p-6 relative">
        <div className="fixed inset-0 pointer-events-none overflow-hidden">
          <div className="absolute -top-32 -right-32 w-[650px] h-[650px] bg-gradient-to-br from-teal-500/20 via-emerald-500/10 to-transparent rounded-full blur-[140px]" />
          <div className="absolute -bottom-32 -left-32 w-[500px] h-[500px] bg-gradient-to-tr from-teal-600/10 to-transparent rounded-full blur-[120px]" />
        </div>

        <div className="w-full max-w-[440px] relative z-10 bg-white/95 backdrop-blur-2xl border border-white/20 rounded-3xl p-8 md:p-10 shadow-2xl shadow-slate-950/50">
          <div className="flex items-center gap-3.5 mb-8">
            <div className="w-12 h-12 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-teal-900/30" style={{ background: 'linear-gradient(135deg, #3fa294, #0f544c)' }}>
              <Mail size={22} />
            </div>
            <div>
              <div className="font-extrabold text-xl tracking-tight text-slate-900">
                Prime<span style={{ color: '#f59e0b' }}>PORTAL</span>
              </div>
              <div className="text-[10px] font-extrabold uppercase tracking-[0.2em] text-slate-400">Password Recovery</div>
            </div>
          </div>

          {sent ? (
            <div className="text-center py-4">
              <div className="w-16 h-16 rounded-full bg-emerald-50 border border-emerald-100 flex items-center justify-center mx-auto mb-5">
                <CheckCircle size={32} className="text-emerald-500" />
              </div>
              <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 mb-2">Check your email</h1>
              <p className="text-xs font-medium text-slate-500 leading-relaxed mb-6">
                If an account exists for <strong className="text-slate-700">{email}</strong>, we've sent password reset instructions.
              </p>
              <Link to="/portal/login" className="inline-flex items-center gap-2 text-xs font-bold text-teal-600 hover:text-teal-700 transition-colors">
                <ArrowLeft size={14} />
                Back to Sign In
              </Link>
            </div>
          ) : (
            <>
              <div className="mb-8">
                <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">Forgot your password?</h1>
                <p className="mt-2 text-xs font-medium text-slate-500 leading-relaxed">Enter your registered email address and we'll send you a reset link.</p>
              </div>

              {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}

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

                <button
                  type="submit"
                  disabled={submitting || !email.trim()}
                  className="w-full h-11 text-white text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed btn-press"
                  style={{ background: 'linear-gradient(135deg, #146b60 0%, #0f544c 100%)', boxShadow: '0 6px 20px rgba(15, 84, 76, 0.35)' }}
                >
                  {submitting ? <Loader2 size={16} className="animate-spin" /> : 'Send Reset Link'}
                </button>
              </form>

              <div className="mt-5 pt-3 border-t border-slate-100 text-center">
                <Link to="/portal/login" className="text-xs font-semibold text-slate-500 hover:text-teal-600 transition-colors inline-flex items-center gap-1.5">
                  <ArrowLeft size={13} />
                  Back to Sign In
                </Link>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default CustomerForgotPassword;
