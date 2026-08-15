import React, { useMemo, useState, useRef, useEffect } from 'react';
import { logger } from '@/services/logger';
import { useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, ArrowRight, CheckCircle2, Loader2, AlertCircle, Eye, EyeOff, Upload, Receipt } from 'lucide-react';
import AuthLayout from './AuthLayout';
import { useAuth } from '../../context/AuthContext';
import { useFinancialYear } from '../../context/FinancialYearContext';
import { withNormalizedSecurityConfig } from '../../utils/securitySettings';

const SUPABASE_ENABLED = Boolean(
  import.meta.env.VITE_SUPABASE_URL &&
  import.meta.env.VITE_SUPABASE_ANON_KEY &&
  import.meta.env.VITE_SUPABASE_URL !== 'https://placeholder.supabase.co'
);

const SetupWizard: React.FC = () => {
  const navigate = useNavigate();
  const { companyConfig, completeSetup, validatePasswordStrength, signUpSupabase } = useAuth();
  const { availableFinancialYears, refreshFinancialYears } = useFinancialYear();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [isRestoringBackup, setIsRestoringBackup] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [restoredCompanyData, setRestoredCompanyData] = useState<any>(null);

  const [company, setCompany] = useState({
    companyName: companyConfig?.companyName || '',
    email: companyConfig?.email || '',
    phone: companyConfig?.phone || '',
    addressLine1: companyConfig?.addressLine1 || '',
    city: companyConfig?.city || '',
    country: companyConfig?.country || '',
    currencySymbol: companyConfig?.currencySymbol || 'K',
    dateFormat: companyConfig?.dateFormat || 'DD/MM/YYYY',
    financialYearStart: companyConfig?.financialYearStart || 'January',
    fiscalYearEndMonth: companyConfig?.fiscalYearEndMonth || 'December',
    vatPricingMode: companyConfig?.vat?.pricingMode || 'VAT',
    passwordRequired: false,
    enforceComplexity: false,
  });

  const [admin, setAdmin] = useState({
    fullName: '',
    username: '',
    email: '',
    password: '',
    confirmPassword: '',
  });

  const passwordValidation = useMemo(
    () => validatePasswordStrength(admin.password),
    [admin.password, validatePasswordStrength]
  );

  const canContinueCompany = [
    company.companyName,
    company.phone,
    company.addressLine1,
  ].every(value => value.trim().length > 0);

  const canContinueFinancial = true;

  const canContinueUser = [
    admin.fullName,
    admin.username,
    ...(SUPABASE_ENABLED ? [admin.email] : []),
  ].every(value => value.trim().length > 0);

  const canSubmitAdmin = [
    admin.fullName,
    admin.username,
    ...(SUPABASE_ENABLED ? [admin.email] : []),
  ].every(value => value.trim().length > 0)
    && (
      !company.passwordRequired
      || (
        admin.password.length > 0
        && admin.password === admin.confirmPassword
        && (
          !company.enforceComplexity
          || passwordValidation.valid
        )
      )
    );

  const handleRestoreBackupFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsRestoringBackup(true);
    setError(null);

    try {
      const fileContent = await file.text();
      const backupData = JSON.parse(fileContent);

      if (!backupData || typeof backupData !== 'object' || !backupData.data) {
        throw new Error('Invalid backup file format. Expected backup to contain meta and data sections.');
      }

      let companyConfigJson = backupData.settings?.['nexus_company_config'];
      if (!companyConfigJson && Array.isArray(backupData.data?.settings)) {
        const settingsEntry = backupData.data.settings.find((entry: any) =>
          entry?.id === 'nexus_company_config' || entry?.key === 'nexus_company_config'
        );
        if (settingsEntry?.value) {
          companyConfigJson = typeof settingsEntry.value === 'string'
            ? settingsEntry.value
            : JSON.stringify(settingsEntry.value);
        }
      }

      if (!companyConfigJson) {
        throw new Error('No company configuration found in backup file.');
      }

      const restoredConfig = JSON.parse(companyConfigJson);

      await (await import('../../services/db')).dbService.importDatabase(fileContent);
      localStorage.setItem('nexus_company_config', companyConfigJson);
      try {
        // Publish the restored config through the settings sync pipeline so
        // subsequent relogins on any device reconstruct it from the cloud.
        await (await import('../../services/db')).dbService.saveSetting('companyConfig', restoredConfig);
      } catch (restoreErr) {
        console.warn('[SetupWizard] Failed to persist restored config to sync store:', restoreErr);
      }
      localStorage.setItem('nexus_initialized', backupData.settings?.['nexus_initialized'] || 'true');
      localStorage.setItem('prime_erp_backup_restored', JSON.stringify({
        restoredAt: new Date().toISOString(),
        filename: file.name,
        snapshotDate: backupData.meta?.date
      }));

      setRestoredCompanyData(restoredConfig);

      setCompany({
        companyName: restoredConfig.companyName || '',
        email: restoredConfig.email || '',
        phone: restoredConfig.phone || '',
        addressLine1: restoredConfig.addressLine1 || '',
        city: restoredConfig.city || '',
        country: restoredConfig.country || '',
        currencySymbol: restoredConfig.currencySymbol || 'K',
        dateFormat: restoredConfig.dateFormat || 'DD/MM/YYYY',
        financialYearStart: restoredConfig.financialYearStart || 'January',
        fiscalYearEndMonth: restoredConfig.fiscalYearEndMonth || 'December',
        vatPricingMode: restoredConfig.vat?.pricingMode || 'VAT',
        passwordRequired: false,
        enforceComplexity: false,
      });

      setStep(1);
      event.target.value = '';

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to restore backup file.');
      logger.error('Restore error:', err);
      event.target.value = '';
    } finally {
      setIsRestoringBackup(false);
    }
  };

  const handleSetup = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canSubmitAdmin) return;

    setSubmitting(true);
    setError(null);

    try {
      if (company.passwordRequired && !admin.password) {
        throw new Error('Set an access password or turn off password protection.');
      }
      if (admin.password && admin.password !== admin.confirmPassword) {
        throw new Error("Passwords don't match.");
      }
      if (company.passwordRequired && company.enforceComplexity && admin.password && !passwordValidation.valid) {
        throw new Error(passwordValidation.errors[0] || 'Password does not meet the required complexity.');
      }

      const baseConfig = {
        ...companyConfig,
        ...company,
      };

      const finalConfig = withNormalizedSecurityConfig({
        ...baseConfig,
        financialYearStart: company.financialYearStart,
        fiscalYearEndMonth: company.fiscalYearEndMonth,
        securitySettings: {
          ...(baseConfig.securitySettings || {}),
          passwordProtectionEnabled: company.passwordRequired,
          enforcePasswordComplexity: company.enforceComplexity,
        },
        vat: {
          ...(baseConfig.vat || {
            enabled: true,
            rate: 16.5,
            filingFrequency: 'Monthly',
            pricingMode: 'VAT',
          }),
          pricingMode: company.vatPricingMode,
        },
      });

      if (SUPABASE_ENABLED && admin.email) {
        const supabasePassword = admin.password || `${admin.username}_${Date.now()}`;
        const signUpResult = await signUpSupabase(admin.email.trim(), supabasePassword, {
          username: admin.username.trim(),
          full_name: admin.fullName.trim(),
          role: 'Admin',
          is_super_admin: true,
          group_ids: ['GRP-ADMIN'],
          company_name: company.companyName.trim(),
        });

        if (!signUpResult.success) {
          logger.error('[Setup] Supabase signup failed:', signUpResult.error);
          throw new Error(`Cloud account creation failed: ${signUpResult.error}`);
        }
      }

      await completeSetup(
        finalConfig,
        {
          id: '',
          username: admin.username.trim(),
          fullName: admin.fullName.trim(),
          name: admin.fullName.trim(),
          email: admin.email.trim(),
          password: admin.password,
          role: 'Admin',
          status: 'Active',
          active: true,
          isSuperAdmin: true,
          mfaEnabled: false,
          groupIds: ['GRP-ADMIN'],
        }
      );

      const fyStartMonth = new Date(`${finalConfig.financialYearStart || 'January'} 1, 2000`).getMonth();
      const currentYear = new Date().getFullYear();
      const currentMonth = new Date().getMonth();
      const fyBaseYear = currentMonth < fyStartMonth ? currentYear - 1 : currentYear;
      const fyStartDate = `${fyBaseYear}-${String(fyStartMonth + 1).padStart(2, '0')}-01`;
      const fyEndDate = `${fyBaseYear + 1}-${String(fyStartMonth + 1).padStart(2, '0')}-${new Date(fyBaseYear + 1, fyStartMonth + 1, 0).getDate()}`;

      try {
        const { api } = await import('../../services/api');
        await api.system.createFinancialYear({
          id: `FY-${fyBaseYear}`,
          name: `${fyBaseYear}/${String(fyBaseYear + 1).slice(2)}`,
          code: `FY${fyBaseYear}`,
          start_date: fyStartDate,
          end_date: fyEndDate,
          is_default: true,
          is_active: true,
          status: 'Active',
          is_closed: false,
          createdAt: new Date().toISOString()
        });
      } catch (fyError) {
        console.warn('[Setup] Failed to create initial financial year:', fyError);
      }

      navigate('/', { replace: true });
    } catch (err) {
      const message = err instanceof Error ? err.message
        : err && typeof err === 'object' && 'message' in err ? String((err as any).message)
        : err && typeof err === 'object' && 'error' in err ? String((err as any).error)
        : err ? String(err)
        : 'Setup failed. Please check your Supabase configuration and try again.';
      setError(message);
    } finally {
      setSubmitting(false);
    }
  };

  const goToStep = (newStep: number) => {
    if (newStep === step || isTransitioning || newStep < 0 || newStep > 4) return;
    setIsTransitioning(true);
    setTimeout(() => {
      setStep(newStep);
      setIsTransitioning(false);
    }, 150);
  };

  const steps = [
    { label: 'Company Details', description: 'Organization info' },
    { label: 'Financial Settings', description: 'Currency & fiscal year' },
    { label: 'Admin Account', description: 'Primary user' },
    { label: 'Security', description: 'Password & access' },
  ];

  const progress = ((step) / steps.length) * 100;

  const inputClass = "w-full px-3.5 py-2.5 bg-[#0D1520] border border-[#1F2A3F] rounded-xl text-sm text-slate-100 placeholder:text-slate-500 outline-none transition-all focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20";
  const labelClass = "block text-[13px] font-semibold text-slate-300 mb-1.5";
  const cardBg = "bg-[#111927] border border-[#1F2A3F]";

  return (
    <AuthLayout title="Set up your workspace" subtitle="Configure your Prime ERP instance in a few simple steps." showBrand>
      {step === 0 ? (
        <div className={`${cardBg} rounded-2xl p-8 transition-all duration-200 ${isTransitioning ? 'opacity-0 translate-y-2' : 'opacity-100 translate-y-0'}`}>
          {error && (
            <div className="mb-5 p-3.5 bg-rose-500/10 border border-rose-500/30 rounded-xl flex items-start gap-3">
              <AlertCircle size={16} className="text-rose-400 shrink-0 mt-0.5" />
              <p className="text-xs text-rose-300">{error}</p>
            </div>
          )}

          <div className="text-center">
            <div className="w-16 h-16 mx-auto mb-6 rounded-2xl bg-gradient-to-br from-indigo-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-indigo-500/30">
              <Receipt size={32} className="text-white" />
            </div>

            <h1 className="text-2xl font-bold text-slate-100 tracking-tight">Intelligent Financial Management</h1>
            <p className="text-sm text-slate-400 mt-3 mb-8 leading-relaxed">
              Set up your company workspace to manage invoices, track expenses, and gain real-time financial insights — all in one place.
            </p>

            <button
              type="button"
              onClick={() => goToStep(1)}
              className="w-full py-3 bg-indigo-500 hover:bg-indigo-400 text-white rounded-xl font-semibold text-sm flex items-center justify-center gap-2 shadow-lg shadow-indigo-500/20 transition-all hover:shadow-indigo-500/30 active:scale-[0.99]"
            >
              Create New Company
              <ArrowRight size={16} />
            </button>

            <div className="mt-3">
              <input ref={fileInputRef} type="file" accept=".db,.json,application/octet-stream,application/json" onChange={handleRestoreBackupFile} className="hidden" />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isRestoringBackup}
                className="w-full py-3 border border-[#1F2A3F] hover:border-slate-500 text-slate-300 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 transition-all disabled:opacity-40 active:scale-[0.99]"
              >
                {isRestoringBackup ? (
                  <><Loader2 size={16} className="animate-spin" /> Restoring...</>
                ) : (
                  <><Upload size={16} /> Restore from Backup</>
                )}
              </button>
            </div>

            <div className="mt-8 pt-6 border-t border-[#1F2A3F]">
              <p className="text-xs text-slate-500">
                Have an account?{' '}
                <Link to="/login" className="text-indigo-400 hover:text-indigo-300 font-semibold transition-colors">Sign in</Link>
              </p>
            </div>
          </div>
        </div>
      ) : (
        <div>
          <div className="mb-8">
            <div className="flex items-center justify-between mb-4">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-[0.15em]">Step {step} of {steps.length}</span>
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-[0.15em]">{Math.round(progress)}%</span>
            </div>
            <div className="h-1.5 bg-[#1F2A3F] rounded-full overflow-hidden">
              <div
                className="h-full bg-indigo-500 rounded-full transition-all duration-500 ease-out"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>

          <div className="flex items-center justify-between mb-8">
            {step > 0 ? (
              <button
                type="button"
                onClick={() => goToStep(step - 1)}
                disabled={submitting}
                className="flex items-center gap-1.5 text-sm font-semibold text-slate-400 hover:text-slate-200 transition-colors disabled:opacity-40"
              >
                <ArrowLeft size={16} />
                Back
              </button>
            ) : (
              <div />
            )}
            <div className="flex items-center gap-4">
              {steps.map((s, i) => {
                const idx = i + 1;
                return (
                  <div key={s.label} className="hidden sm:flex items-center gap-2">
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold transition-all ${
                      idx < step ? 'bg-indigo-500 text-white' : idx === step ? 'bg-indigo-500 text-white' : 'bg-[#1F2A3F] text-slate-500'
                    }`}>
                      {idx < step ? <CheckCircle2 size={14} /> : idx}
                    </div>
                    <span className={`text-[11px] font-semibold ${idx === step ? 'text-slate-200' : 'text-slate-500'}`}>{s.label}</span>
                    {i < steps.length - 1 && <div className="w-4 h-px bg-[#1F2A3F] ml-2" />}
                  </div>
                );
              })}
            </div>
          </div>

          <div className={`${cardBg} rounded-2xl p-7 transition-all duration-200 ${isTransitioning ? 'opacity-0 translate-y-2' : 'opacity-100 translate-y-0'}`}>
            {step === 1 && (
              <div className="animate-fade-in">
                <h1 className="text-xl font-bold text-slate-100 tracking-tight">Company Details</h1>
                <p className="text-sm text-slate-400 mt-1 mb-6">Tell us about your organization</p>

                {error && (
                  <div className="mb-5 p-3.5 bg-rose-500/10 border border-rose-500/30 rounded-xl flex items-start gap-3">
                    <AlertCircle size={16} className="text-rose-400 shrink-0 mt-0.5" />
                    <p className="text-xs text-rose-300">{error}</p>
                  </div>
                )}

                <div className="space-y-4">
                  <div>
                    <label className={labelClass}>Company Name *</label>
                    <input
                      value={company.companyName}
                      onChange={e => setCompany(prev => ({ ...prev, companyName: e.target.value }))}
                      className={inputClass}
                      placeholder="Acme Corporation"
                      required
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className={labelClass}>Phone *</label>
                      <input
                        value={company.phone}
                        onChange={e => setCompany(prev => ({ ...prev, phone: e.target.value }))}
                        className={inputClass}
                        placeholder="+1 (555) 000-0000"
                        required
                      />
                    </div>
                    <div>
                      <label className={labelClass}>Email</label>
                      <input
                        type="email"
                        value={company.email}
                        onChange={e => setCompany(prev => ({ ...prev, email: e.target.value }))}
                        className={inputClass}
                        placeholder="contact@co.com"
                      />
                    </div>
                  </div>

                  <div>
                    <label className={labelClass}>Address *</label>
                    <input
                      value={company.addressLine1}
                      onChange={e => setCompany(prev => ({ ...prev, addressLine1: e.target.value }))}
                      className={inputClass}
                      placeholder="123 Business Way, Suite 100"
                      required
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className={labelClass}>City</label>
                      <input
                        value={company.city}
                        onChange={e => setCompany(prev => ({ ...prev, city: e.target.value }))}
                        className={inputClass}
                        placeholder="New York"
                      />
                    </div>
                    <div>
                      <label className={labelClass}>Country</label>
                      <input
                        value={company.country}
                        onChange={e => setCompany(prev => ({ ...prev, country: e.target.value }))}
                        className={inputClass}
                        placeholder="United States"
                      />
                    </div>
                  </div>

                  <div className="pt-2">
                    <button
                      type="button"
                      onClick={() => goToStep(2)}
                      disabled={!canContinueCompany}
                      className="w-full py-2.5 bg-indigo-500 hover:bg-indigo-400 disabled:bg-indigo-500/30 disabled:cursor-not-allowed text-white rounded-xl font-semibold text-[13px] flex items-center justify-center gap-2 shadow-sm hover:shadow-md transition-all duration-200 active:scale-[0.99]"
                    >
                      Continue
                      <ArrowRight size={16} />
                    </button>
                  </div>
                </div>
              </div>
            )}

            {step === 2 && (
              <div className="animate-fade-in">
                <h1 className="text-xl font-bold text-slate-100 tracking-tight">Financial Settings</h1>
                <p className="text-sm text-slate-400 mt-1 mb-6">Configure currency, fiscal year, and pricing</p>

                {error && (
                  <div className="mb-5 p-3.5 bg-rose-500/10 border border-rose-500/30 rounded-xl flex items-start gap-3">
                    <AlertCircle size={16} className="text-rose-400 shrink-0 mt-0.5" />
                    <p className="text-xs text-rose-300">{error}</p>
                  </div>
                )}

                <div className="space-y-4">
                  <div>
                    <label className={labelClass}>Currency</label>
                    <select
                      value={company.currencySymbol}
                      onChange={e => setCompany(prev => ({ ...prev, currencySymbol: e.target.value }))}
                      className={inputClass}
                    >
                      <option value="K">K - Kwacha</option>
                      <option value="MWK">MWK - Malawi</option>
                      <option value="$">$ - US Dollar</option>
                      <option value="£">£ - Pound</option>
                      <option value="€">€ - Euro</option>
                    </select>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className={labelClass}>Financial Year Start</label>
                      <select
                        value={company.financialYearStart}
                        onChange={e => setCompany(prev => ({ ...prev, financialYearStart: e.target.value }))}
                        className={inputClass}
                      >
                        {['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'].map(month => (
                          <option key={month} value={month}>{month}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className={labelClass}>Financial Year End</label>
                      <select
                        value={company.fiscalYearEndMonth}
                        onChange={e => setCompany(prev => ({ ...prev, fiscalYearEndMonth: e.target.value }))}
                        className={inputClass}
                      >
                        {['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'].map(month => (
                          <option key={month} value={month}>{month}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className={labelClass}>Date Format</label>
                    <select
                      value={company.dateFormat}
                      onChange={e => setCompany(prev => ({ ...prev, dateFormat: e.target.value }))}
                      className={inputClass}
                    >
                      <option value="DD/MM/YYYY">DD/MM/YYYY</option>
                      <option value="MM/DD/YYYY">MM/DD/YYYY</option>
                      <option value="YYYY-MM-DD">YYYY-MM-DD</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[13px] font-semibold text-slate-300 mb-1">Pricing Mode</label>
                    <p className="text-xs text-slate-500">The app supports both Tax (VAT) and Market Adjustment pricing.</p>
                  </div>

                  <div className="pt-2">
                    <button
                      type="button"
                      onClick={() => goToStep(3)}
                      disabled={!canContinueFinancial}
                      className="w-full py-2.5 bg-indigo-500 hover:bg-indigo-400 disabled:bg-indigo-500/30 disabled:cursor-not-allowed text-white rounded-xl font-semibold text-[13px] flex items-center justify-center gap-2 shadow-sm hover:shadow-md transition-all duration-200 active:scale-[0.99]"
                    >
                      Continue
                      <ArrowRight size={16} />
                    </button>
                  </div>
                </div>
              </div>
            )}

            {step === 3 && (
              <div className="animate-fade-in">
                <h1 className="text-xl font-bold text-slate-100 tracking-tight">Admin Account</h1>
                <p className="text-sm text-slate-400 mt-1 mb-6">Create your primary user account</p>

                {error && (
                  <div className="mb-5 p-3.5 bg-rose-500/10 border border-rose-500/30 rounded-xl flex items-start gap-3">
                    <AlertCircle size={16} className="text-rose-400 shrink-0 mt-0.5" />
                    <p className="text-xs text-rose-300">{error}</p>
                  </div>
                )}

                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className={labelClass}>Full Name *</label>
                      <input
                        value={admin.fullName}
                        onChange={e => setAdmin(prev => ({ ...prev, fullName: e.target.value }))}
                        className={inputClass}
                        placeholder="John Doe"
                        required
                      />
                    </div>
                    <div>
                      <label className={labelClass}>Email {SUPABASE_ENABLED && <span className="text-rose-400">*</span>}</label>
                      <input
                        type="email"
                        value={admin.email}
                        onChange={e => setAdmin(prev => ({ ...prev, email: e.target.value }))}
                        className={inputClass}
                        placeholder="admin@co.com"
                        required={SUPABASE_ENABLED}
                      />
                    </div>
                  </div>
                  <div>
                    <label className={labelClass}>Username *</label>
                    <input
                      value={admin.username}
                      onChange={e => setAdmin(prev => ({ ...prev, username: e.target.value }))}
                      className={inputClass}
                      placeholder="admin_prime"
                      required
                    />
                  </div>
                </div>

                <div className="pt-4">
                  <button
                    type="button"
                    onClick={() => goToStep(4)}
                    disabled={!canContinueUser}
                    className="w-full py-2.5 bg-indigo-500 hover:bg-indigo-400 disabled:bg-indigo-500/30 disabled:cursor-not-allowed text-white rounded-xl font-semibold text-[13px] flex items-center justify-center gap-2 shadow-sm hover:shadow-md transition-all duration-200 active:scale-[0.99]"
                  >
                    Continue
                    <ArrowRight size={16} />
                  </button>
                </div>
              </div>
            )}

            {step === 4 && (
              <div className="animate-fade-in">
                <div className="flex items-center gap-3 mb-1">
                  <h1 className="text-xl font-bold text-slate-100 tracking-tight">Security</h1>
                  <span className="px-2 py-0.5 bg-[#1F2A3F] border border-[#2A3A5A] rounded-md text-[10px] font-bold text-slate-400 uppercase tracking-wider">Optional</span>
                </div>
                <p className="text-sm text-slate-400 mt-1 mb-6">Configure account access settings</p>

                {error && (
                  <div className="mb-5 p-3.5 bg-rose-500/10 border border-rose-500/30 rounded-xl flex items-start gap-3">
                    <AlertCircle size={16} className="text-rose-400 shrink-0 mt-0.5" />
                    <p className="text-xs text-rose-300">{error}</p>
                  </div>
                )}

                <div className="p-3.5 bg-indigo-500/10 border border-indigo-500/30 rounded-xl flex items-start gap-3 mb-6">
                  <AlertCircle size={16} className="text-indigo-400 shrink-0 mt-0.5" />
                  <p className="text-xs text-indigo-300">Password is optional. Enable it later in settings if you skip now.</p>
                </div>

                <form onSubmit={handleSetup} className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className={labelClass}>Password</label>
                      <div className="relative">
                        <input
                          type={showPassword ? 'text' : 'password'}
                          autoComplete="new-password"
                          value={admin.password}
                          onChange={e => setAdmin(prev => ({ ...prev, password: e.target.value }))}
                          className={`${inputClass} pr-10`}
                          placeholder="Leave blank to skip"
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
                      <label className={labelClass}>Confirm</label>
                      <input
                        type="password"
                        autoComplete="new-password"
                        value={admin.confirmPassword}
                        onChange={e => setAdmin(prev => ({ ...prev, confirmPassword: e.target.value }))}
                        className={inputClass}
                        placeholder="Repeat password"
                      />
                    </div>
                  </div>

                  {admin.password && (
                    <div className="p-4 bg-[#0D1520] rounded-xl border border-[#1F2A3F] space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-slate-300">Password Strength</span>
                        <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full ${
                          passwordValidation.valid ? 'bg-emerald-500/10 text-emerald-300' : 'bg-[#1F2A3F] text-slate-400'
                        }`}>
                          {passwordValidation.valid ? 'Strong' : 'Basic'}
                        </span>
                      </div>
                      <div className="h-1.5 bg-[#1F2A3F] rounded-full overflow-hidden">
                        <div className={`h-full transition-all duration-500 rounded-full ${
                          passwordValidation.valid
                            ? 'w-full bg-emerald-400'
                            : 'w-1/3 bg-slate-400'
                        }`} />
                      </div>
                      {!passwordValidation.valid && (
                        <p className="text-xs text-slate-400">{passwordValidation.errors.length > 0 ? passwordValidation.errors[0] : 'Basic password strength'}</p>
                      )}
                      {admin.confirmPassword && admin.password !== admin.confirmPassword && (
                        <p className="text-xs text-rose-400 font-medium">Passwords don't match</p>
                      )}
                  </div>
                )}
                <div className="pt-4">
                  <button
                    type="submit"
                    disabled={!canSubmitAdmin || submitting}
                    className="w-full py-2.5 bg-indigo-500 hover:bg-indigo-400 disabled:bg-indigo-500/30 disabled:cursor-not-allowed text-white rounded-xl font-semibold text-[13px] flex items-center justify-center gap-2 shadow-sm hover:shadow-md transition-all duration-200 active:scale-[0.99]"
                  >
                    {submitting ? (
                      <>
                        <Loader2 size={16} className="animate-spin" />
                        <span>Creating account...</span>
                      </>
                    ) : (
                      <>
                        <span>{SUPABASE_ENABLED && admin.email ? 'Create Account & Continue' : 'Complete Setup'}</span>
                        <CheckCircle2 size={16} />
                      </>
                    )}
                  </button>
                </div>
                </form>
              </div>
            )}
          </div>
        </div>
      )}
    </AuthLayout>
  );
};

export default SetupWizard;
