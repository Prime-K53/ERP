import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ShieldCheck, Mail, Lock, Eye, EyeOff, Loader2, ArrowRight } from 'lucide-react';
import AuthLayout from './AuthLayout';
import { useAuth } from '../../context/AuthContext';
import { loginWithApi, ApiError, StaffUserInfo } from '../../services/authApiClient';

const Login: React.FC = () => {
  const navigate = useNavigate();
  const { loginWithApi: establishSession, login: legacyLogin } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = useMemo(() => email.trim().length > 0 && password.length > 0, [email, password]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);

    try {
      const result = await loginWithApi({ email: email.trim(), password, portal: 'admin' });

      const staff = result.user as StaffUserInfo;
      const isAdmin = staff.role === 'Admin' || staff.role === 'Company Admin' || staff.role === 'Super Admin';
      const user = {
        id: staff.id,
        username: staff.username,
        fullName: staff.username,
        name: staff.username,
        email: staff.email,
        role: staff.role || 'Staff',
        status: 'Active',
        active: true,
        isSuperAdmin: isAdmin,
        securityLevel: 'Elevated',
        groupIds: isAdmin ? ['GRP-ADMIN'] : ['GRP-USER'],
        authMode: 'api',
      };

      const token = result.token || '';
      const tokenExpiry = new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString();
      establishSession(user, token, tokenExpiry, { email: email.trim(), password });
      navigate('/', { replace: true });
    } catch (err) {
      if (err instanceof ApiError && err.status === 403) {
        setError(err.body?.message || 'This account is not authorized to sign in here.');
      } else if (err instanceof ApiError && err.status === 401) {
        const fallbackMessage = await tryLegacyLogin(email.trim(), password);
        if (fallbackMessage === null) return;
        setError(fallbackMessage);
      } else {
        const fallbackMessage = await tryLegacyLogin(email.trim(), password);
        if (fallbackMessage === null) return;
        setError(fallbackMessage);
      }
      setSubmitting(false);
    }
  };

  const tryLegacyLogin = async (userName: string, userPassword: string): Promise<string | null> => {
    try {
      const result = await legacyLogin(userName, userPassword);
      if (result === 'SUCCESS') {
        navigate('/', { replace: true });
        return null;
      }
      if (result === 'INVALID') {
        return 'Invalid credentials. Please check your email and password and try again.';
      }
      if (result === 'MFA_REQUIRED') {
        return 'Two-factor authentication is required for this account.';
      }
      return 'Your session could not be established. Please sign in again.';
    } catch (legacyErr) {
      const legacyError = legacyErr as { userMessage?: string; message?: string };
      return legacyError.userMessage || legacyError.message || 'Login failed. Please try again.';
    }
  };

  return (
    <AuthLayout title="Administrator Login" subtitle="Sign in with your administrator credentials to access the Prime ERP dashboard." showBrand>
      <div>
        <div className="mb-8">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-[11px] font-bold text-indigo-300 uppercase tracking-wider">
            <ShieldCheck size={12} />
            Administrator Login
          </span>
          <h1 className="mt-4 text-[1.65rem] font-bold text-slate-100 tracking-tight leading-snug">
            Welcome back
          </h1>
          <p className="mt-2 text-sm text-slate-400 leading-relaxed">
            Enter your credentials to continue where you left off.
          </p>
        </div>

        {error && (
          <div className="mb-5 p-3.5 bg-rose-50 border border-rose-200 rounded-xl flex items-start gap-3">
            <div className="w-5 h-5 rounded-full bg-rose-100 flex items-center justify-center shrink-0 mt-0.5">
              <div className="w-2 h-2 rounded-full bg-rose-500" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs text-rose-700 leading-relaxed">{error}</p>
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-4">
            <div>
              <label className="block text-[13px] font-semibold text-slate-700 mb-1.5">
                Email <span className="text-rose-500">*</span>
              </label>
              <div className="relative">
                <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400">
                  <Mail size={16} />
                </div>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 placeholder:text-slate-400 outline-none transition-all focus:border-sky-400 focus:ring-3 focus:ring-sky-100/60"
                  placeholder="admin@company.com"
                  autoComplete="email"
                  disabled={submitting}
                  required
                />
              </div>
            </div>

            <div>
              <div className="flex justify-between items-center mb-1.5">
                <label className="block text-[13px] font-semibold text-slate-700">
                  Password <span className="text-rose-500">*</span>
                </label>
                <a href="#/forgot-password" className="text-[11px] font-semibold text-sky-600 hover:text-sky-700 transition-colors">
                  Forgot Password?
                </a>
              </div>
              <div className="relative">
                <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400">
                  <Lock size={16} />
                </div>
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-10 pr-11 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 placeholder:text-slate-400 outline-none transition-all focus:border-sky-400 focus:ring-3 focus:ring-sky-100/60"
                  placeholder="Enter your password"
                  autoComplete="current-password"
                  disabled={submitting}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>
          </div>

          <button
            type="submit"
            disabled={!canSubmit || submitting}
            className="w-full py-2.5 bg-indigo-500 hover:bg-indigo-400 disabled:bg-indigo-500/30 disabled:cursor-not-allowed text-white rounded-xl font-semibold text-[13px] flex items-center justify-center gap-2 shadow-sm hover:shadow-md transition-all duration-200 active:scale-[0.99]"
          >
            {submitting ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                <span>Signing in...</span>
              </>
            ) : (
              <>
                <span>Sign In</span>
                <ArrowRight size={16} />
              </>
            )}
          </button>
        </form>

        <div className="mt-8 pt-6 border-t border-slate-200 text-center space-y-2">
          <p className="text-xs text-slate-400">
            New to Prime ERP?{' '}
            <a href="#/setup" className="text-xs font-semibold text-sky-600 hover:text-sky-700 transition-colors">
              Create a New Company
            </a>
          </p>
          <p className="text-xs text-slate-400">
            <a href="#/portal/login" className="text-xs font-semibold text-emerald-600 hover:text-emerald-700 transition-colors">
              Customer Portal Login
            </a>
          </p>
        </div>
      </div>
    </AuthLayout>
  );
};

export default Login;
