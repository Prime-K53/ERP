import React, { useEffect, useState } from 'react';
import { Lock, ArrowLeft, Loader2, ShieldCheck, AlertCircle, CheckCircle2, Key } from 'lucide-react';
import { Input } from '../../components/Input';
import AuthLayout from './AuthLayout';
import { dbService } from '../../services/db';

const ResetPassword: React.FC = () => {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sessionReady, setSessionReady] = useState(true);

  useEffect(() => {
    setSessionReady(true);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const sessionUser = sessionStorage.getItem('nexus_user');
      if (!sessionUser) throw new Error('No active session.');
      const user = JSON.parse(sessionUser);
      const users = await dbService.getAll<any>('users');
      const updated = users.map((u: any) =>
        u.id === user.id ? { ...u, password } : u
      );
      await dbService.bulkPut('users', updated);
      setSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reset password.');
    } finally {
      setSubmitting(false);
    }
  };

  const inputClass = "w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl focus:bg-white/10 focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500/50 text-white text-sm transition-all placeholder:text-slate-600 outline-none";

  return (
    <AuthLayout title="Reset Password" subtitle="Enter your new password">
      <div className="mb-6">
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/5 border border-white/10 text-[11px] font-semibold text-emerald-400 uppercase tracking-widest mb-3">
          <ShieldCheck size={12} />
          {success ? 'Complete' : 'New Password'}
        </span>
        <h2 className="text-2xl font-bold text-white tracking-tight">
          {success ? 'Password Reset Complete' : 'Set New Password'}
        </h2>
        <p className="text-sm text-slate-400 mt-2">
          {success
            ? 'Your password has been updated successfully.'
            : sessionReady
              ? 'Choose a strong password for your account.'
              : 'Verifying your reset link...'}
        </p>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl flex items-start gap-2">
          <AlertCircle size={15} className="text-rose-400 shrink-0 mt-0.5" />
          <p className="text-xs text-rose-300">{error}</p>
        </div>
      )}

      {success ? (
        <div className="space-y-5">
          <div className="bg-white/3 border border-white/6 rounded-xl p-6 text-center">
            <div className="w-14 h-14 rounded-full bg-emerald-500/10 mx-auto flex items-center justify-center mb-4">
              <CheckCircle2 size={28} className="text-emerald-400" />
            </div>
            <p className="text-sm text-slate-300">
              Your password has been reset. You can now sign in with your new password.
            </p>
          </div>
          <a
            href="#/login"
            className="w-full px-4 py-3 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white rounded-lg font-semibold flex items-center justify-center gap-2"
          >
            <ArrowLeft size={16} />
            <span>Sign In</span>
          </a>
        </div>
      ) : !sessionReady ? (
        <div className="bg-white/3 border border-white/6 rounded-xl p-6 text-center">
          <Loader2 size={24} className="animate-spin text-emerald-400 mx-auto mb-3" />
          <p className="text-sm text-slate-400">Verifying your reset link...</p>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="bg-white/3 border border-white/6 rounded-xl p-5 space-y-4">
            <div className="flex items-center gap-2 mb-1">
              <Key size={16} className="text-emerald-400" />
              <h3 className="text-sm font-semibold text-white">New Password</h3>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-300 mb-1.5 block">
                New Password <span className="text-rose-400">*</span>
              </label>
              <div className="relative">
                <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500">
                  <Lock size={16} />
                </div>
                <Input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className={`${inputClass} pl-10`}
                  placeholder="••••••••"
                  autoComplete="new-password"
                  disabled={submitting}
                  required
                  minLength={6}
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-300 mb-1.5 block">
                Confirm Password <span className="text-rose-400">*</span>
              </label>
              <div className="relative">
                <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500">
                  <Lock size={16} />
                </div>
                <Input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className={`${inputClass} pl-10`}
                  placeholder="••••••••"
                  autoComplete="new-password"
                  disabled={submitting}
                  required
                />
              </div>
            </div>
          </div>

          <button
            type="submit"
            disabled={!password || !confirmPassword || submitting}
            className="w-full px-4 py-3 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 disabled:opacity-60 text-white rounded-lg font-semibold flex items-center justify-center gap-2"
          >
            {submitting ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                <span>Resetting...</span>
              </>
            ) : (
              <>
                <span>Reset Password</span>
              </>
            )}
          </button>
        </form>
      )}
    </AuthLayout>
  );
};

export default ResetPassword;
