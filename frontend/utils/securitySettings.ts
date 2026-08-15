import { CompanyConfig, SecuritySettingsConfig } from '../types';

export type SecuritySettingsWithAccess = SecuritySettingsConfig & {
  passwordProtectionEnabled: boolean;
  enforcePasswordComplexity: boolean;
};

export const DEFAULT_SECURITY_SETTINGS: SecuritySettingsWithAccess = {
  sessionTimeoutMinutes: 10,
  forcePasswordChangeDays: 90,
  requireTwoFactor: false,
  auditLogLevel: 'Standard',
  lockoutAttempts: 5,
  passwordProtectionEnabled: true,
  enforcePasswordComplexity: true
};

export const normalizeSecuritySettings = (
  config?: Partial<CompanyConfig> | null
): SecuritySettingsWithAccess => {
  const legacySecurity = (config as Partial<CompanyConfig & { security?: Record<string, unknown> }>)?.security || {};
  const configuredSettings: SecuritySettingsConfig = (config?.securitySettings || {}) as SecuritySettingsConfig;

  const passwordProtectionEnabled = typeof configuredSettings.passwordProtectionEnabled === 'boolean'
    ? configuredSettings.passwordProtectionEnabled
    : (typeof legacySecurity.passwordRequired === 'boolean'
      ? legacySecurity.passwordRequired
      : DEFAULT_SECURITY_SETTINGS.passwordProtectionEnabled);

  const enforcePasswordComplexity = typeof configuredSettings.enforcePasswordComplexity === 'boolean'
    ? configuredSettings.enforcePasswordComplexity
    : (typeof legacySecurity.enforceComplexity === 'boolean'
      ? legacySecurity.enforceComplexity
      : DEFAULT_SECURITY_SETTINGS.enforcePasswordComplexity);

  return {
    ...DEFAULT_SECURITY_SETTINGS,
    ...configuredSettings,
    passwordProtectionEnabled,
    enforcePasswordComplexity
  };
};

export const withNormalizedSecurityConfig = <T extends Partial<CompanyConfig>>(config: T): T => {
  const securitySettings = normalizeSecuritySettings(config);
  return {
    ...config,
    securitySettings,
    security: {
      passwordRequired: securitySettings.passwordProtectionEnabled,
      enforceComplexity: securitySettings.enforcePasswordComplexity
    }
  };
};

export const isPasswordProtectionEnabled = (config?: Partial<CompanyConfig> | null): boolean =>
  normalizeSecuritySettings(config).passwordProtectionEnabled;

export const isPasswordComplexityEnabled = (config?: Partial<CompanyConfig> | null): boolean =>
  normalizeSecuritySettings(config).enforcePasswordComplexity;
