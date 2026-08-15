import React, { useState, useEffect } from 'react';
import { Mail, ArrowLeft, ArrowRight, Loader2, ShieldCheck, AlertCircle, CheckCircle2, Key, Eye, EyeOff } from 'lucide-react';
import AuthLayout from './AuthLayout';
import { useAuth } from '../../context/AuthContext';

const ForgotPassword: React.FC = () => {
  const { sendPasswordResetOtp, verifyResetOtp, updatePasswordAfterReset } = useAuth();
  const [step, setStep] = useState<'email' | 'otp' | 'password' | 'done'>('email');
  const [email, setEmail] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resendCooldown, setResendCooldown] = useState(0);

  useEffect(() => {
    if (resendCooldown > 0) {
      const t = setInterval(() => setResendCooldown(c => Math.max(0, c - 1)), 1000);
      return () => clearInterval(t);
    }
  }, [resendCooldown]);

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const result = await sendPasswordResetOtp(email.trim());
      if (result.success) {
        setStep('otp');
        setResendCooldown(60);
      } else {
        setError(result.error || 'Failed to send reset code.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send reset code.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleVerifyOtp = async () => {
    if (otpCode.trim().length !== 6) return;
    setSubmitting(true);
    setError(null);
    try {
      const result = await verifyResetOtp(email.trim(), otpCode.trim());
      if (result.success) {
        setStep('password');
      } else {
        setError(result.error || 'Invalid or expired code.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Verification failed.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleResend = async () => {
    if (resendCooldown > 0) return;
    setSubmitting(true);
    setError(null);
    try {
      const result = await sendPasswordResetOtp(email.trim());
      if (result.success) {
        setResendCooldown(60);
      } else {
        setError(result.error || 'Failed to resend code.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to resend code.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const result = await updatePasswordAfterReset(newPassword);
      if (result.success) {
        setStep('done');
      } else {
        setError(result.error || 'Failed to update password.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update password.');
    } finally {
      setSubmitting(false);
    }
  };

  const inputClass = "w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl focus:bg-white/10 focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500/50 text-white text-sm transition-all placeholder:text-slate-600 outline-none";

  return (
    <AuthLayout title="Reset Password" subtitle="Reset your password using a verification code">
      <div className="mb-6">
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/5 border border-white/10 text-[11px] font-semibold text-emerald-400 uppercase tracking-widest mb-3">
          <ShieldCheck size={12} />
          Password Reset
        </span>
        <h2 className="text-2xl font-bold text-white tracking-tight">
          {step === 'email' && 'Forgot Password?'}
          {step === 'otp' && 'Enter Verification Code'}
          {step === 'password' && 'New Password'}
          {step === 'done' && 'Password Reset Complete'}
        </h2>
        <p className="text-sm text-slate-400 mt-2">
          {step === 'email' && 'Enter your email address to receive a verification code.'}
          {step === 'otp' && `Enter the 6-digit code sent to ${email}`}
          {step === 'password' && 'Create a new password for your account.'}
          {step === 'done' && 'Your password has been reset successfully.'}
        </p>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl flex items-start gap-2">
          <AlertCircle size={15} className="text-rose-400 shrink-0 mt-0.5" />
          <p className="text-xs text-rose-300">{error}</p>
        </div>
      )}

      {step === 'email' && (
        <form onSubmit={handleSendOtp} className="space-y-5">
          <div>
            <label className="text-xs font-semibold text-slate-300 mb-1.5 block">
              Email <span className="text-rose-400">*</span>
            </label>
            <div className="relative">
              <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500">
                <Mail size={16} />
              </div>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={`${inputClass} pl-10`}
                placeholder="admin@company.com"
                autoComplete="email"
                disabled={submitting}
                required
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={!email.trim() || submitting}
            className="w-full px-4 py-3 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 disabled:opacity-60 text-white rounded-lg font-semibold flex items-center justify-center gap-2"
          >
            {submitting ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                <span>Sending...</span>
              </>
            ) : (
              <>
                <span>Send Reset Code</span>
                <ArrowRight size={16} />
              </>
            )}
          </button>

          <a href="#/login" className="block text-center text-xs text-slate-500 hover:text-slate-300 transition-colors">
            <ArrowLeft size={12} className="inline mr-1" />
            Back to Login
          </a>
        </form>
      )}

      {step === 'otp' && (
        <div className="space-y-5">
          <div>
            <label className="text-xs font-semibold text-slate-300 mb-1.5 block">
              Verification Code <span className="text-rose-400">*</span>
            </label>
            <div className="relative">
              <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500">
                <Key size={16} />
              </div>
              <input
                value={otpCode}
                onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                className="w-full pl-10 pr-4 py-3 bg-white/5 border border-white/10 rounded-xl focus:bg-white/10 focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500/50 text-white text-sm transition-all placeholder:text-slate-600 outline-none tracking-[0.2em] font-mono text-center text-base"
                inputMode="numeric"
                placeholder="000000"
                disabled={submitting}
              />
            </div>
            <p className="text-[11px] text-slate-500 mt-1.5">Enter the 6-digit code sent to your email</p>
          </div>

          <button
            type="button"
            onClick={handleVerifyOtp}
            disabled={otpCode.trim().length !== 6 || submitting}
            className="w-full px-4 py-3 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 disabled:opacity-60 text-white rounded-lg font-semibold flex items-center justify-center gap-2"
          >
            {submitting ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                <span>Verifying...</span>
              </>
            ) : (
              <>
                <span>Verify Code</span>
                <CheckCircle2 size={16} />
              </>
            )}
          </button>

          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={handleResend}
              disabled={submitting || resendCooldown > 0}
              className="text-xs font-semibold text-emerald-400 hover:text-emerald-300 transition-colors disabled:text-slate-600 disabled:cursor-not-allowed"
            >
              {resendCooldown > 0 ? `Resend code in ${resendCooldown}s` : 'Resend Code'}
            </button>
            <button
              type="button"
              onClick={() => setStep('email')}
              className="text-xs text-slate-500 hover:text-slate-300 transition-colors"
            >
              <ArrowLeft size={12} className="inline mr-1" />
              Back
            </button>
          </div>
        </div>
      )}

      {step === 'password' && (
        <form onSubmit={handleUpdatePassword} className="space-y-5">
          <div>
            <label className="text-xs font-semibold text-slate-300 mb-1.5 block">
              New Password <span className="text-rose-400">*</span>
            </label>
            <div className="relative">
              <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500">
                <Key size={16} />
              </div>
              <input
                type={showPassword ? 'text' : 'password'}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className={`${inputClass} pl-10 pr-10`}
                placeholder="New password"
                autoComplete="new-password"
                disabled={submitting}
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors"
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-300 mb-1.5 block">
              Confirm Password <span className="text-rose-400">*</span>
            </label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className={inputClass}
              placeholder="Confirm new password"
              autoComplete="new-password"
              disabled={submitting}
              required
            />
          </div>

          <button
            type="submit"
            disabled={!newPassword || !confirmPassword || submitting}
            className="w-full px-4 py-3 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 disabled:opacity-60 text-white rounded-lg font-semibold flex items-center justify-center gap-2"
          >
            {submitting ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                <span>Updating...</span>
              </>
            ) : (
              <>
                <span>Update Password</span>
                <CheckCircle2 size={16} />
              </>
            )}
          </button>
        </form>
      )}

      {step === 'done' && (
        <div className="space-y-5">
          <div className="bg-white/3 border border-white/6 rounded-xl p-6 text-center">
            <div className="w-14 h-14 rounded-full bg-emerald-500/10 mx-auto flex items-center justify-center mb-4">
              <CheckCircle2 size={28} className="text-emerald-400" />
            </div>
            <p className="text-sm text-slate-300">
              Your password has been reset successfully. You can now sign in with your new password.
            </p>
          </div>
          <a
            href="#/login"
            className="w-full block text-center px-4 py-3 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white rounded-lg font-semibold transition-all"
          >
            Sign In
          </a>
        </div>
      )}
    </AuthLayout>
  );
};

export default ForgotPassword;
