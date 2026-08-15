import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { User, UserRole, UserGroup, PasswordPolicy, CompanyConfig, AuditLogEntry, SystemAlert, Reminder } from '../types';
import { INITIAL_USER_GROUPS, AVAILABLE_PERMISSIONS, SEED_ITEMS } from '../constants';
import { generateNextId } from '../utils/helpers';
import { dbService } from '../services/db';
import { DEFAULT_PRICING_SETTINGS } from '../services/pricingRoundingService';
import { syncDocumentNumberSeriesConfig } from '../services/documentNumberService';
import {
  isIdenticalToDefaults,
  loadStoredCompanyConfig,
  normalizeStoredCompanyConfig,
  persistCompanyConfig,
  registerCompanyConfigContextProvider,
} from '../utils/companyConfigSync';
import { publishSystemAlert } from '../services/systemAlertService';
import { isPasswordProtectionEnabled, normalizeSecuritySettings, withNormalizedSecurityConfig } from '../utils/securitySettings';
import { DEFAULT_SHARED_NUMBERING_RULE, normalizeCompanyNumberingConfig } from '../utils/numbering';
import { hydrateCompanyPdfAssets } from '../utils/companyAssetUtils';
import { supabase } from '../services/supabaseClient';
import type { AuthResult } from '../services/supabaseAuthService';
import { cloudDb } from '../services/cloudDb';
import { logger } from '../services/logger';
import { initAudit, audit } from '../services/syncAudit';

const SUPABASE_ENABLED = Boolean(
  import.meta.env.VITE_SUPABASE_URL &&
  import.meta.env.VITE_SUPABASE_ANON_KEY &&
  import.meta.env.VITE_SUPABASE_URL !== 'https://placeholder.supabase.co'
);

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  const timer = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error(`Request timed out after ${ms}ms`)), ms)
  );
  return Promise.race([promise, timer]);
}

function normalizeRoleForDisplay(role: string): string {
  return role === 'Company Admin' ? 'Admin' : role;
}

interface Notification {
  id: string;
  message: string;
  type: 'success' | 'error' | 'info' | 'warning';
}

interface AuditParams {
    action: AuditLogEntry['action'];
    entityType: string;
    entityId: string;
    details: string;
    oldValue?: any;
    newValue?: any;
    reason?: string;
}

interface AuthContextType {
  user: User | null;
  allUsers: User[];
  userGroups: UserGroup[];
  passwordPolicy: PasswordPolicy;
  companyConfig: CompanyConfig;
  requiresSetup: boolean;
  notification: Notification | null;
  auditLogs: AuditLogEntry[];
  alerts: SystemAlert[];
  isInitialized: boolean;
  activeFinancialYear: number;
  reminders: Reminder[];
  isOnline: boolean;
  dbSyncStatus: 'idle' | 'connected' | 'syncing' | 'error' | 'restricted';
  lastSyncTime: string | null;
  loginDiagnostic: LoginDiagnostic | null;
  
  notify: (message: string, type: 'success' | 'error' | 'info' | 'warning') => void;
  clearNotification: () => void;
  login: (username: string, password?: string, mfaCode?: string) => Promise<'SUCCESS' | 'INVALID' | 'MFA_REQUIRED' | 'EXPIRED'>;
  loginWithApi: (user: User, token: string, tokenExpiry: string, credentials?: { email: string; password: string }) => Promise<void>;
  logout: () => void;
  checkPermission: (permissionId: string) => boolean;
  validatePasswordStrength: (password: string) => { valid: boolean; errors: string[] };
  
  manageUser: (user: User) => Promise<void>;
  deleteUser: (id: string) => void;
  manageUserGroup: (group: UserGroup) => void;
  deleteUserGroup: (id: string) => void;
  updatePasswordPolicy: (policy: PasswordPolicy) => void;
  updateCompanyConfig: (config: CompanyConfig) => void;
  
  addAuditLog: (params: AuditParams) => void;
  addAlert: (alert: SystemAlert) => void;
  dismissAlert: (id: string) => void;
  clearAlerts: () => void;
  resetSystem: () => Promise<void>;
  completeSetup: (config: CompanyConfig, adminUser: User) => Promise<void>;
  setFinancialYear: (year: number) => void;

  addReminder: (text: string, dueDate?: string) => void;
  toggleReminder: (id: string) => void;
  deleteReminder: (id: string) => void;
  
  connectDbSync: () => Promise<void>;
  manualDownloadBackup: () => Promise<void>;

  signUpSupabase: (email: string, password: string, metadata?: Record<string, unknown>) => Promise<AuthResult>;
  sendPasswordResetOtp: (email: string) => Promise<AuthResult>;
  verifyResetOtp: (email: string, token: string) => Promise<AuthResult>;
  updatePasswordAfterReset: (password: string) => Promise<AuthResult>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

interface LoginDiagnostic {
  supabaseUrl: string;
  email: string;
  timestamp: string;
  errorCode: string;
  errorMessage: string;
  authState: string;
  sessionState: string;
}

class AuthFlowError extends Error {
  code?: string;
  status?: number;
  userMessage: string;

  constructor(message: string, options: { code?: string; status?: number; userMessage?: string } = {}) {
    super(message);
    this.name = 'AuthFlowError';
    this.code = options.code;
    this.status = options.status;
    this.userMessage = options.userMessage || message;
  }
}

function getEmailForUser(username: string, domain = 'prime-erp.local'): string {
  if (username.includes('@')) return username;
  return `${username}@${domain}`;
}

function getAuthErrorCode(error: any): string {
  return error?.code || error?.error_code || error?.name || 'auth_error';
}

function getUserFriendlyAuthMessage(error: any): string {
  const code = String(getAuthErrorCode(error)).toLowerCase();
  const message = String(error?.message || error || '').toLowerCase();

  if (code.includes('email_not_confirmed') || message.includes('email not confirmed')) {
    return 'Email confirmation is disabled for this ERP. Please ask an administrator to disable Confirm email in Supabase Authentication > Providers > Email, then try again.';
  }
  if (code.includes('invalid_credentials') || message.includes('invalid login credentials')) {
    return 'Invalid email or password. Please check your credentials and try again.';
  }
  if (message.includes('user not found')) {
    return 'No account was found for this email address.';
  }
  if (message.includes('failed to fetch') || message.includes('network')) {
    return 'Unable to reach Supabase Auth. Please check your connection and try again.';
  }
  if (message.includes('session')) {
    return 'Your session could not be established. Please sign in again.';
  }

  return error?.message || 'Login failed. Please try again.';
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);

  const [isInitialized, setIsInitialized] = useState<boolean>(false);
  const [requiresSetup, setRequiresSetup] = useState<boolean>(false);

  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [userGroups, setUserGroups] = useState<UserGroup[]>(INITIAL_USER_GROUPS);
  const [passwordPolicy, setPasswordPolicy] = useState<PasswordPolicy>({ minLength: 8, requireSpecialChar: true, requireNumber: true, expiryDays: 90 });
  
  const defaultCompanyConfig = {
      companyName: 'Prime ERP', 
      country: 'Malawi', 
      addressLine1: 'Main Street', 
      city: 'Dedza', 
      phone: '0884 528 222', 
      email: 'info@primeerp.com', 
      currencySymbol: 'K',
      monthlyRevenueTarget: 50000,
      financialYearStart: 'January',
      fiscalYearEndMonth: 'December',
      dateFormat: 'DD/MM/YYYY',
      decimalPlaceAmount: 2,
      decimalPlaceQuantity: 2,
      currencyFormat: 'Symbol First',
      timezone: 'Africa/Blantyre',
      languageCode: 'en-MW',
      templateStyle: 'Modern',
      fontStyle: 'Inter',
      showCompanyHeader: true,
      showCompanyLogo: true,
      appearance: {
          theme: 'Light',
          glassmorphism: false,
          density: 'Comfortable',
          borderRadius: 'Medium',
          enableAnimations: true,
          sidebarStyle: 'Full'
      },
      inventorySettings: {
          valuationMethod: 'AVCO',
          allowNegativeStock: false,
          autoBarcode: true,
          trackBatches: true,
          trackSerialNumbers: false,
          defaultWarehouseId: 'WH-MAIN',
          lowStockAlerts: true
      },
      productionSettings: {
          autoConsumeMaterials: false,
          requireQAApproval: false,
          allowOverproduction: false,
          trackMachineDownTime: true,
          showKioskSummary: true,
          defaultWorkCenterId: 'WC-MAIN',
          defaultExamBomId: 'BOM-EXAM-STD',
          finishingOptions: []
      },
      enabledModules: {
          manufacturing: true,
          loyalty: true,
          accounting: true,
          payroll: true,
          crm: true,
          multiWarehouse: true
      },
      glMapping: {
          defaultSalesAccount: '4000',
          defaultInventoryAccount: '1200',
          defaultCOGSAccount: '5000',
          accountsReceivable: '1100',
          accountsPayable: '2000',
          cashDrawerAccount: '1000',
          bankAccount: '1050',
          salesReturnAccount: '4100',
          customerDepositAccount: '2200',
          otherIncomeAccount: '4900',
           defaultExpenseAccount: '6100',
           defaultLaborWagesAccount: '6300',
           retainedEarningsAccount: '3000'
      },
      transactionSettings: {
          allowBackdating: true,
          backdatingLimitDays: 30,
          allowPartialFulfillment: true,
          voidingWindowHours: 24,
          enforceCreditLimit: 'None',
          defaultPaymentTermsDays: 30,
          quotationExpiryDays: 30,
          autoPrintReceipt: true,
          quickItemEntry: true,
          defaultPOSWarehouse: 'WH-MAIN',
          posDefaultCustomer: '',
          allowFutureDating: true,
          numbering: {
            shared: { ...DEFAULT_SHARED_NUMBERING_RULE }
          },
          approvalThresholds: {},
          paymentDetails: {
            bankAccounts: [],
            mobileMoneyAccounts: []
          },
          pos: {
              allowReturns: true,
              requireCustomer: false,
              enableShortcuts: true,
              showItemImages: true,
              gridColumns: 5,
              photocopyPrice: 0,
              typePrintingPrice: 0,
              staplePrice: 0,
              allowDiscounts: true,
              showCategoryFilters: true,
              receiptFooter: '',
              defaultPaymentMethod: 'Cash',
              photocopyCostPerPage: 0,
              typePrintingCostPerPage: 0,
              showShortcutHints: true,
              shortcutLabels: { F1: '', F2: '', F3: '', F10: '' }
          }
      },
      pricingSettings: { ...DEFAULT_PRICING_SETTINGS },
      integrationSettings: {
        externalApis: [],
        webhooks: []
      },
      invoiceTemplates: {
        engine: 'Standard',
        accentColor: '#3b82f6',
        companyNameFontSize: 18,
        bodyFontSize: 12,
        fontFamily: 'Helvetica',
        logoWidth: 140,
        showCompanyLogo: true,
        showPaymentTerms: true,
        showDueDate: true,
        showOutstandingAndWalletBalances: false,
        showAccountSummary: false
      },
      cloudSync: {
        enabled: SUPABASE_ENABLED,
        apiUrl: import.meta.env.VITE_SUPABASE_URL || '',
        apiKey: '',
        autoSyncEnabled: true,
        syncIntervalMinutes: 15
      },
      securitySettings: {
        ...normalizeSecuritySettings()
      },
      security: {
        passwordRequired: true,
        enforceComplexity: true
      },
      vat: {
        enabled: false,
        rate: 0,
        filingFrequency: 'Monthly',
        pricingMode: 'VAT'
      },
      lateFeePolicy: {},
      roundingRules: {
        method: 'Nearest',
        precision: 2
      },
      notificationSettings: {
        customerActivityNotifications: true,
        smsGatewayEnabled: false,
        emailGatewayEnabled: false
      },
      backupFrequency: 'Daily'
  };

  const [companyConfig, setCompanyConfig] = useState<CompanyConfig>(() => withNormalizedSecurityConfig(defaultCompanyConfig as CompanyConfig));

  useEffect(() => {
    const unregister = registerCompanyConfigContextProvider({
      getDefaults: () => defaultCompanyConfig as CompanyConfig,
      getCurrentConfig: () => companyConfigRef.current,
    });
    return unregister;
  }, []);

  const [notification, setNotification] = useState<Notification | null>(null);
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [alerts, setAlerts] = useState<SystemAlert[]>([]);
  const [activeFinancialYear, setActiveFinancialYear] = useState<number>(new Date().getFullYear());
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [isOnline, setIsOnline] = useState<boolean>(navigator.onLine);
  const [dbSyncStatus, setDbSyncStatus] = useState<'idle' | 'connected' | 'syncing' | 'error' | 'restricted'>('idle');
  const [lastSyncTime, setLastSyncTime] = useState<string | null>(() => SUPABASE_ENABLED ? null : localStorage.getItem('nexus_last_sync'));
  const [loginDiagnostic, setLoginDiagnostic] = useState<LoginDiagnostic | null>(null);

  useEffect(() => {
    const handleOnline = async () => {
      setIsOnline(true);
      if (!SUPABASE_ENABLED) {
        try {
          const { customerNotificationService } = await import('../services/customerNotificationService');
          await customerNotificationService.processPendingNotifications();
        } catch {}
      }
    };
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [user]);

  const roleToGroupIds = useCallback((role?: string, isSuperAdmin?: boolean) => {
    if (isSuperAdmin || role === 'Super Admin' || role === 'Company Admin' || role === 'Admin') return ['GRP-ADMIN'];
    if (role === 'Manager') return ['GRP-MANAGER'];
    if (role === 'Cashier') return ['GRP-CASHIER'];
    if (role === 'Sales Staff') return ['GRP-SALES'];
    return ['GRP-USER'];
  }, []);

  const syncSupabaseUserToLocal = useCallback(async (supabaseUser: any): Promise<User | null> => {
    const userId = supabaseUser?.id;
    if (!userId) return null;

    // 1. Check local users store
    try {
      const localUsers = await dbService.getAll<User>('users');
      const found = localUsers.find(u => u.id === userId || u.email === supabaseUser.email);
      if (found) return found;
    } catch { /* fall through */ }

    // 2. Build from user_metadata (set during signup)
    const meta = supabaseUser.user_metadata || {};
    if (meta.role || meta.is_super_admin) {
      return {
        id: userId,
        username: meta.username || supabaseUser.email || 'user',
        fullName: meta.full_name || meta.fullName || 'User',
        name: meta.full_name || meta.fullName || 'User',
        email: supabaseUser.email || meta.email || '',
        role: (meta.role || 'Staff') as UserRole,
        status: 'Active',
        active: true,
        isSuperAdmin: Boolean(meta.is_super_admin),
        securityLevel: 'Standard',
        groupIds: meta.group_ids || (meta.is_super_admin ? ['GRP-ADMIN'] : []),
        authMode: 'supabase',
      } as User;
    }

    return null;
  }, []);

  const updateLoginDiagnostic = useCallback(async (email: string, updates: Partial<LoginDiagnostic> = {}) => {
    setLoginDiagnostic({
      supabaseUrl: '',
      email,
      timestamp: new Date().toISOString(),
      errorCode: '',
      errorMessage: '',
      authState: 'local',
      sessionState: 'local',
      ...updates,
    });
  }, []);



  useEffect(() => {
    const loadInitData = async () => {
      initAudit();
      audit('boot', 'loadInitData start', { SUPABASE_ENABLED });
      console.log(`[SYNC-FORENSIC] AUTH loadInitData() START`, { SUPABASE_ENABLED });
      const failsafe = setTimeout(() => {
        if (!isInitialized) {
          setIsInitialized(true);
        }
      }, 25000);

      try {
        if (SUPABASE_ENABLED) {
          let restoredSession: User | null = null;
          const { data: { session } } = await supabase.auth.getSession();

          if (session?.user) {
            restoredSession = await syncSupabaseUserToLocal(session.user);
            if (restoredSession) {
              setUser(restoredSession);
              sessionStorage.setItem('nexus_user', JSON.stringify({
                ...restoredSession,
                authMode: 'supabase',
                accessToken: session.access_token || null,
                tokenExpiry: session.expires_at ? new Date(session.expires_at * 1000).toISOString() : null,
              }));
            }
          } else {
            sessionStorage.removeItem('nexus_user');
          }

          const [groups, profileRows, logs, storedAlerts, storedReminders] = await Promise.all([
            dbService.getAll<UserGroup>('userGroups').catch(() => []),
            cloudDb.listCompanyProfiles().catch(() => []),
            restoredSession ? dbService.getAll<AuditLogEntry>('auditLogs').catch(() => []) : Promise.resolve([]),
            restoredSession ? dbService.getAll<SystemAlert>('alerts').catch(() => []) : Promise.resolve([]),
            restoredSession ? dbService.getAll<Reminder>('reminders').catch(() => []) : Promise.resolve([])
          ]);

          setUserGroups(groups.length > 0 ? groups : INITIAL_USER_GROUPS);
          setAllUsers((profileRows || []).map((profile: any) => {
            const profileData = profile.data || {};
            const role = normalizeRoleForDisplay(profile.role || profileData.role || 'Sales Staff');
            return {
              id: profile.user_id || profile.id,
              username: profile.username || profileData.username || profile.full_name || 'user',
              fullName: profile.full_name || profileData.fullName || profileData.full_name || 'User',
              name: profile.full_name || profileData.fullName || profileData.full_name || 'User',
              email: profile.email || profileData.email || '',
              role,
              status: profile.status || 'Active',
              active: profile.status !== 'Inactive',
              isSuperAdmin: Boolean(profile.is_super_admin || profileData.is_super_admin || role === 'Super Admin' || role === 'Company Admin' || role === 'Admin'),
              securityLevel: profileData.securityLevel || 'Standard',
              groupIds: profileData.group_ids || profileData.groupIds || roleToGroupIds(role, profileData.is_super_admin),
              authMode: 'supabase',
            } as User;
          }));

          setAuditLogs(logs.sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime()));
          setAlerts(storedAlerts.sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime()));
          setReminders(storedReminders.sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime()));
          const requiresSupabaseSetup = Boolean(session?.user && !restoredSession);
          audit('auth', 'loadInitData supabase branch', {
            hasSession: Boolean(session?.user),
            restoredSessionFound: Boolean(restoredSession),
            requiresSetup: requiresSupabaseSetup,
          });
          setRequiresSetup(requiresSupabaseSetup);
          setDbSyncStatus('connected');
          setLastSyncTime(new Date().toISOString());
          // Cold-boot race fix: supabase-js emits SIGNED_IN during client creation,
          // BEFORE the onAuthStateChange effect (below) has registered its listener.
          // AuthContext ignores INITIAL_SESSION, and loadInitData returns here, so a
          // page reload with a persisted session would never start the sync engine.
          // Start it explicitly whenever a valid Supabase session is restored.
          if (session?.user && !requiresSupabaseSetup) {
            audit('auth', 'cold boot: starting sync engine from loadInitData', { hasSession: true });
            console.log(`[SYNC-FORENSIC] AUTH loadInitData() cold boot sync start`, {
              hasSession: true,
              requiresSetup: requiresSupabaseSetup,
            });
            import('../services/syncService').then(({ startPeriodicSync }) => {
              console.log(`[SYNC-FORENSIC] AUTH loadInitData() calling startPeriodicSync()`);
              startPeriodicSync();
            }).catch(() => {});
          }
          // Cloud settings are authoritative: hydrate the company config from
          // the sync store (populated by the initial pull), then migrate any
          // genuine legacy device-local cache only when no cloud config exists.
          await hydrateStoredCompanyConfig();
          await migrateLegacyCompanyConfig();
          return;
        }

        // Authoritative cloud/sync-store config wins; legacy device-local
        // cache is hydrated only when the store is empty, and pure defaults
        // are never uploaded.
        let parsedConfig: CompanyConfig | null = await hydrateStoredCompanyConfig();
        if (!parsedConfig) {
          parsedConfig = await migrateLegacyCompanyConfig();
        }

        let restoredSession: User | null = null;

        if (SUPABASE_ENABLED) {
          try {
            const { data: { session } } = await supabase.auth.getSession();
            if (session?.user) {
              const profile = await syncSupabaseUserToLocal(session.user);
              if (profile) {
                restoredSession = profile;
                sessionStorage.setItem('nexus_user', JSON.stringify({
                  ...profile,
                  authMode: 'supabase',
                  accessToken: session.access_token || null,
                  tokenExpiry: session.expires_at ? new Date(session.expires_at * 1000).toISOString() : null,
                }));
              }
            }
          } catch {
            await supabase.auth.signOut();
          }
        } else {
          const raw = sessionStorage.getItem('nexus_user');
          if (raw) {
            try {
              const parsed = JSON.parse(raw);
              const expiry = parsed?.tokenExpiry ? new Date(parsed.tokenExpiry).getTime() : 0;
              if (expiry && expiry > Date.now()) {
                restoredSession = parsed;
              } else {
                sessionStorage.removeItem('nexus_user');
              }
            } catch {
              sessionStorage.removeItem('nexus_user');
            }
          }
        }

        const [u, groups] = await Promise.all([
            dbService.getAll<User>('users'),
            dbService.getAll<UserGroup>('userGroups')
        ]);
        
        setAllUsers(u);
        setUserGroups(groups);
        const effectiveConfig = withNormalizedSecurityConfig((parsedConfig || defaultCompanyConfig) as CompanyConfig);
        const hasCompanyData = Boolean(parsedConfig?.companyName?.trim());
        const hasUsers = u.length > 0;
        const initializedFlag = localStorage.getItem('nexus_initialized') === 'true';
        const setupComplete = hasCompanyData && hasUsers;

        if (setupComplete && !initializedFlag) {
          localStorage.setItem('nexus_initialized', 'true');
        }
        if (!setupComplete) {
          setUser(null);
        } else if (restoredSession) {
          setUser(restoredSession);
        }
        setRequiresSetup(!setupComplete);

        const [logs, storedAlerts, storedReminders] = await Promise.all([
            dbService.getAll<AuditLogEntry>('auditLogs'),
            dbService.getAll<SystemAlert>('alerts'),
            dbService.getAll<Reminder>('reminders')
        ]);

        setAuditLogs(logs.sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime()));
        setAlerts(storedAlerts.sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime()));
        setReminders(storedReminders.sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime()));

        const integrity = await dbService.checkIntegrity();
        if (!integrity.healthy) {
            logger.error("[Auth] Database Integrity Issues:", integrity.issues);
        }

        dbService.setSyncListener((status) => {
            setDbSyncStatus(status);
            if (status === 'connected') setLastSyncTime(new Date().toISOString());
        });

        if (parsedConfig?.companyName) {
            try {
                const winApi = window as { api?: { system?: { initializeWorkspace?: (name: string) => Promise<void> } } };
                await winApi.api?.system?.initializeWorkspace(parsedConfig.companyName);
            } catch (wsErr) {
                console.warn("[Auth] Workspace initialization skipped:", wsErr);
            }
        }

          if (SUPABASE_ENABLED && setupComplete) {
          try {
            const { startPeriodicSync } = await import('../services/syncService');
            const { restoreLocalMarginsFromSync, migrateLocalMarginsToIndexedDB } = await import('../services/offlineProfitMargins');
            // startPeriodicSync fires an initial pull on start — avoids duplicate
            startPeriodicSync(undefined, (result) => {
              if (result.pulled > 0 || result.pushed > 0) {
              }
              // After pull, restore any newly synced profit margins to localStorage
              restoreLocalMarginsFromSync().catch(() => {});
            });
            // Restore profit margins from IndexedDB (populated by previous sync pulls)
            restoreLocalMarginsFromSync().catch(() => {});
            // Push any local-only profit margins into the sync pipeline
            migrateLocalMarginsToIndexedDB().catch(() => {});

            // Migrate legacy local-only Financial Years into the sync pipeline
            // (pre-schema-fix records that never reached the cloud).
            import('../services/repositories/financialYearRepository').then(({ financialYearRepository }) => {
              financialYearRepository.migrateLegacyLocalYears().catch(() => undefined);
            }).catch(() => undefined);

            // Migrate existing local business settings to cloud
            const LOCAL_BUSINESS_KEYS = [
              'nexus_volume_discount_tiers',
              'nexus_currency_settings',
              'nexus_exchange_rates',
              'nexus_workflow_definitions',
              'nexus_workflow_templates',
              'inventoryAlertConfig',
            ];
            for (const key of LOCAL_BUSINESS_KEYS) {
              try {
                const local = localStorage.getItem(key);
                if (local) {
                  await dbService.saveSetting(key, JSON.parse(local));
                }
              } catch {}
            }
          } catch (syncErr) {
            console.warn("[Auth] Sync service init skipped:", syncErr);
          }
        }

      } catch (err) {
        logger.error("[Auth] Critical system initialization failure:", err);
      } finally {
        clearTimeout(failsafe);
        setIsInitialized(true);
      }

      const lastBackup = localStorage.getItem('prime_erp_backup_date');
      const oneDay = 24 * 60 * 60 * 1000;
      if (!lastBackup || (Date.now() - new Date(lastBackup).getTime() > oneDay)) {
          dbService.performAutoBackup();
      }
    };
    loadInitData();
  }, []);

  /**
   * Realtime hydration: when the settings sync store changes — device A
   * saving the Settings page, realtime push from another device, or a
   * periodic pull completing — re-hydrate the active company config from the
   * authoritative store. Cloud always wins over the local cache.
   */
  useEffect(() => {
    const handleDataChanged = (event: Event) => {
      const detail = (event as CustomEvent).detail as
        | { stores?: string[]; table?: string }
        | undefined;
      if (!detail) return;
      const stores = Array.isArray(detail.stores) ? detail.stores : [];
      if (detail.table === 'settings' || stores.includes('settings')) {
        void (async () => {
          await hydrateStoredCompanyConfig();
          await migrateLegacyCompanyConfig();
        })();
      }
    };
    window.addEventListener('primeerp:data-changed', handleDataChanged);
    return () => window.removeEventListener('primeerp:data-changed', handleDataChanged);
  }, []);

  useEffect(() => {
    if (!SUPABASE_ENABLED) {
      console.log(`[SYNC-FORENSIC] AUTH onAuthStateChange SKIPPED — SUPABASE_ENABLED=false`);
      return;
    }

    console.log(`[SYNC-FORENSIC] AUTH onAuthStateChange effect registered`);
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      console.log(`[SYNC-FORENSIC] AUTH onAuthStateChange event: ${event}`, { requiresSetup });
      audit('auth', 'onAuthStateChange', { event, requiresSetup });
      if (event === 'SIGNED_OUT') {
        import('../services/syncService').then(({ stopPeriodicSync }) => {
          stopPeriodicSync();
        }).catch(() => {});
        setUser(null);
        setAllUsers([]);
        setRequiresSetup(false);
        return;
      }

      if ((event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') && !requiresSetup) {
        console.log(`[SYNC-FORENSIC] AUTH onAuthStateChange starting sync for ${event}`);
        audit('auth', 'starting periodic sync from auth event', { event, requiresSetup });
        import('../services/syncService').then(({ startPeriodicSync }) => {
          console.log(`[SYNC-FORENSIC] AUTH onAuthStateChange calling startPeriodicSync()`);
          startPeriodicSync();
        }).catch(() => {});
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [requiresSetup]);

  // ── Inactivity timeout ──
  const lastActivityRef = useRef(Date.now());
  const companyConfigRef = useRef(companyConfig);

  useEffect(() => {
    const update = () => { lastActivityRef.current = Date.now(); };
    const events = ['mousemove', 'keydown', 'click', 'scroll', 'touchstart'];
    events.forEach(e => window.addEventListener(e, update, { passive: true }));
    return () => { events.forEach(e => window.removeEventListener(e, update)); };
  }, []);

  useEffect(() => { companyConfigRef.current = companyConfig; }, [companyConfig]);

  useEffect(() => {
    if (!user) return;
    lastActivityRef.current = Date.now(); // reset timer on login

    const id = setInterval(() => {
      const elapsed = (Date.now() - lastActivityRef.current) / 60000;
      const config = companyConfigRef.current?.securitySettings?.sessionTimeoutMinutes ?? 30;
      if (config <= 0) return;
      if (elapsed >= config) {
        logout();
      }
    }, 60000);

    return () => clearInterval(id);
  }, [user]);

  // Safety net: ensure the sync engine starts whenever a user becomes
  // authenticated, regardless of which auth path was taken. This catches
  // edge cases where loginWithApi / onAuthStateChange / loadInitData
  // each missed the timing window to start the sync engine.
  const prevUserRef = useRef<User | null>(null);
  useEffect(() => {
    if (user && !prevUserRef.current && SUPABASE_ENABLED) {
      console.log(`[SYNC-FORENSIC] AUTH safety-net: user transition null→authenticated, ensuring sync started`);
      import('../services/syncService').then(({ startPeriodicSync }) => {
        startPeriodicSync();
      }).catch(() => {});
    }
    prevUserRef.current = user;
  }, [user, SUPABASE_ENABLED]);

  const notify = useCallback((message: string, type: 'success' | 'error' | 'info' | 'warning') => {
    setNotification({ id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`, message, type });
  }, []);

  useEffect(() => {
    logger.setNotifyCallback(notify);
  }, [notify]);

  const clearNotification = useCallback(() => {
    setNotification(null);
  }, []);

  const addAuditLog = useCallback(async (params: AuditParams) => {
    const entry: AuditLogEntry = {
        id: `LOG-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
        date: new Date().toISOString(),
        action: params.action,
        entityType: params.entityType,
        entityId: params.entityId,
        details: params.details,
        userId: user?.username || 'system',
        userRole: user?.role || 'System',
        oldValue: params.oldValue,
        newValue: params.newValue,
        reason: params.reason
    };
    setAuditLogs(prev => [entry, ...prev]);
    try {
      await dbService.put('auditLogs', entry);
    } catch {
      // Audit logs are non-critical; failures are silently handled
    }
  }, [user]);

  const login = useCallback(async (username: string, password?: string, mfaCode?: string): Promise<'SUCCESS' | 'INVALID' | 'MFA_REQUIRED' | 'EXPIRED'> => {
    try {
        if (requiresSetup && !SUPABASE_ENABLED) {
            return 'INVALID';
        }

        if (SUPABASE_ENABLED) {
          if (!password) return 'INVALID';
          const email = getEmailForUser(username);
          await updateLoginDiagnostic(email, {
            errorCode: '',
            errorMessage: '',
            authState: 'login attempt started',
            sessionState: 'pending',
          });

          // Check if device is offline before attempting network auth
          if (typeof navigator !== 'undefined' && navigator.onLine === false) {
            const cachedRaw = sessionStorage.getItem('nexus_user') || localStorage.getItem('nexus_cached_user_session');
            if (cachedRaw) {
              try {
                const cachedUser = JSON.parse(cachedRaw);
                if (cachedUser?.email === email || cachedUser?.username === username || cachedUser?.id) {
                  const offlineUser = { ...cachedUser, offlineAuthenticated: true, authMode: 'supabase' as const };
                  setUser(offlineUser);
                  sessionStorage.setItem('nexus_user', JSON.stringify(offlineUser));
                  setRequiresSetup(false);
                  return 'SUCCESS';
                }
              } catch {}
            }
            throw new AuthFlowError('Offline: No cached session available for this user. Connect to the internet to sign in.', {
              code: 'offline_session_not_found',
              userMessage: 'Offline: No cached session available for this account. Please connect to the internet to sign in.',
            });
          }

          let signInData: any = null;
          let error: any = null;

          try {
            const result = await withTimeout(supabase.auth.signInWithPassword({
              email,
              password,
            }), 15000);
            signInData = result.data;
            error = result.error;
          } catch (netErr: any) {
            // If network timed out or failed, attempt offline session restoration
            const cachedRaw = sessionStorage.getItem('nexus_user') || localStorage.getItem('nexus_cached_user_session');
            if (cachedRaw) {
              try {
                const cachedUser = JSON.parse(cachedRaw);
                if (cachedUser?.email === email || cachedUser?.username === username || cachedUser?.id) {
                  const offlineUser = { ...cachedUser, offlineAuthenticated: true, authMode: 'supabase' as const };
                  setUser(offlineUser);
                  sessionStorage.setItem('nexus_user', JSON.stringify(offlineUser));
                  setRequiresSetup(false);
                  return 'SUCCESS';
                }
              } catch {}
            }
            throw new AuthFlowError('Network unavailable and no cached session found. Connect to internet to sign in.', {
              code: 'network_unavailable_no_session',
              userMessage: 'Network unavailable and no cached session found. Connect to the internet to sign in.',
            });
          }

          console.log("AUTH RESPONSE:", signInData);
          console.log("AUTH ERROR:", error);

          if (error) {
            const authErr = error as { code?: string; status?: number; message?: string; name?: string };
            logger.error("LOGIN FAILED:", {
              code: authErr.code,
              message: authErr.message || '',
              status: authErr.status,
              name: authErr.name || '',
            });

            await updateLoginDiagnostic(email, {
              errorCode: getAuthErrorCode(error),
              errorMessage: error.message,
            });

            throw new AuthFlowError(error.message, {
              code: getAuthErrorCode(error),
              status: authErr.status,
              userMessage: getUserFriendlyAuthMessage(error),
            });
          }

          if (!signInData?.user) {
            const noUserError = new AuthFlowError('Supabase did not return an authenticated user.', {
              code: 'session_user_missing',
              userMessage: 'Your session could not be established. Please sign in again.',
            });
            await updateLoginDiagnostic(email, {
              errorCode: noUserError.code || '',
              errorMessage: noUserError.message,
            });
            throw noUserError;
          }

          console.log('[Auth] Authenticated Supabase user audit:', {
            id: signInData.user.id,
            email: signInData.user.email,
            last_sign_in_at: signInData.user.last_sign_in_at,
            user_metadata: signInData.user.user_metadata,
            app_metadata: signInData.user.app_metadata,
          });

          const profile = await syncSupabaseUserToLocal(signInData.user);

          audit('auth', 'supabase login resolved', {
            profileFound: Boolean(profile),
            userId: profile?.id,
            role: profile?.role,
            email: signInData.user.email,
          });
          setRequiresSetup(false);
          const supabaseUser = {
            ...profile,
            authMode: 'supabase' as const,
            offlineAuthenticated: true,
          };
          setUser(supabaseUser);
          const sessionPayload = JSON.stringify({
            ...supabaseUser,
            accessToken: signInData.session?.access_token || null,
            tokenExpiry: signInData.session?.expires_at ? new Date(signInData.session.expires_at * 1000).toISOString() : null,
          });
          sessionStorage.setItem('nexus_user', sessionPayload);
          localStorage.setItem('nexus_cached_user_session', sessionPayload);
          console.log(`[SYNC-FORENSIC] AUTH login() supabase path — starting sync engine`);
          import('../services/syncService').then(({ startPeriodicSync }) => {
            console.log(`[SYNC-FORENSIC] AUTH login() supabase path — calling startPeriodicSync()`);
            startPeriodicSync();
          }).catch((err) => {
            console.error(`[SYNC-FORENSIC] AUTH login() supabase path — FAILED to start sync`, {
              error: err?.message || err,
            });
          });
          await updateLoginDiagnostic(email, {
            errorCode: '',
            errorMessage: '',
          });
          return 'SUCCESS';
        }

        const dbUsers = await dbService.getAll<User>('users');
        const passwordProtectionEnabled = isPasswordProtectionEnabled(companyConfig);

        if (!passwordProtectionEnabled) {
            const fakeUser = dbUsers.find(u => u.isSuperAdmin || u.role === 'Admin') || {
              id: 'USR-LOCAL',
              username: username,
              fullName: username,
              name: username,
              email: getEmailForUser(username),
              role: 'Admin' as UserRole,
              status: 'Active' as const,
              active: true,
              isSuperAdmin: true,
              securityLevel: 'Elevated',
              groupIds: ['GRP-ADMIN'],
              authMode: 'anonymous'
            } as User;
            setUser(fakeUser);
            sessionStorage.setItem('nexus_user', JSON.stringify({ ...fakeUser, authMode: 'anonymous' }));
            return 'SUCCESS';
        }
        
        const foundUser = dbUsers.find(u => (u.username || '').toLowerCase() === (username || '').toLowerCase());
        if (!foundUser) {
            return 'INVALID';
        }
        
        if (foundUser.status !== 'Active') {
            return 'INVALID';
        }

        if (!foundUser.password || !password) {
            return 'INVALID';
        }

        const hashPassword = async (text: string): Promise<string> => {
          if (!text) return '';
          const encoder = new TextEncoder();
          const data = encoder.encode(text);
          const hashBuffer = await crypto.subtle.digest('SHA-256', data);
          const hashArray = Array.from(new Uint8Array(hashBuffer));
          return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
        };

        const isStoredHash = (value?: string) => {
          if (!value) return false;
          return value.startsWith('insecure_') || /^[a-f0-9]{64}$/i.test(value);
        };

        const hashedInput = await hashPassword(password);
        const isHash = (s: string) => /^[a-f0-9]{64}$/i.test(s) || isStoredHash(s);
        const expectedPassword = isHash(foundUser.password)
          ? foundUser.password
          : (async () => {
              const hashed = await hashPassword(foundUser.password);
              await dbService.put('users', { ...foundUser, password: hashed });
              return hashed;
            })();
        if (expectedPassword !== hashedInput) {
            return 'INVALID';
        }

        if (foundUser.mfaEnabled) {
            if (!mfaCode) return 'MFA_REQUIRED';
            if (mfaCode.length !== 6) return 'INVALID';
        }

        const localUser = { ...foundUser, authMode: 'local' as const };
        setUser(localUser);
        sessionStorage.setItem('nexus_user', JSON.stringify(localUser));

        addAuditLog({
            action: 'LOGIN',
            entityType: 'User',
            entityId: foundUser.id,
            details: `User ${foundUser.username} logged in successfully.`
        }).catch(err => logger.error("Failed to add login audit log:", err));

        return 'SUCCESS';
    } catch (err) {
        logger.error("AuthContext: Login function error:", err);
        if (SUPABASE_ENABLED) {
          const email = getEmailForUser(username);
          const error = err as { message?: string; code?: string };
          void updateLoginDiagnostic(email, {
            errorCode: getAuthErrorCode(error),
            errorMessage: error?.message || String(error),
          });
        }
        throw err;
    }
  }, [addAuditLog, companyConfig, requiresSetup, SUPABASE_ENABLED, syncSupabaseUserToLocal, updateLoginDiagnostic]);

  const loginWithApi = useCallback(async (apiUser: User, token: string, tokenExpiry: string, credentials?: { email: string; password: string }) => {
    console.log(`[SYNC-FORENSIC] AUTH loginWithApi() called`, {
      userId: apiUser.id,
      username: apiUser.username,
      hasToken: !!token,
      SUPABASE_ENABLED,
      hasCredentials: !!credentials,
    });
    setRequiresSetup(false);
    setUser(apiUser);
    sessionStorage.setItem('nexus_user', JSON.stringify({
      ...apiUser,
      authMode: 'api',
      accessToken: token,
      tokenExpiry,
    }));
    console.log(`[SYNC-FORENSIC] AUTH loginWithApi() user state set, checking sync init`, {
      SUPABASE_ENABLED,
    });
    if (SUPABASE_ENABLED) {
      // Establish a real Supabase session so that supabase.from() calls
      // can pass RLS policies (authenticated role). The backend JWT stored
      // in sessionStorage.nexus_user is NOT a Supabase session — it only
      // works for /api/sync/ops push calls via the backend gateway.
      if (credentials) {
        try {
          console.log(`[SYNC-FORENSIC] AUTH loginWithApi() establishing Supabase session`);
          const { data, error } = await supabase.auth.signInWithPassword({
            email: credentials.email,
            password: credentials.password,
          });
          if (error) {
            console.error(`[SYNC-FORENSIC] AUTH loginWithApi() Supabase session failed:`, error.message);
          } else if (data?.session) {
            console.log(`[SYNC-FORENSIC] AUTH loginWithApi() supabase session OK`, { userId: data.session.user?.id });
          }
        } catch (err) {
          console.error(`[SYNC-FORENSIC] AUTH loginWithApi() Supabase session error:`, err);
        }
      } else {
        console.warn(`[SYNC-FORENSIC] AUTH loginWithApi() no credentials provided — sync will rely on existing Supabase session`);
      }
      console.log(`[SYNC-FORENSIC] AUTH loginWithApi() starting sync engine`);
      import('../services/syncService').then(({ startPeriodicSync }) => {
        console.log(`[SYNC-FORENSIC] AUTH loginWithApi() calling startPeriodicSync()`);
        startPeriodicSync();
      }).catch((err) => {
        console.error(`[SYNC-FORENSIC] AUTH loginWithApi() FAILED to start sync`, {
          error: err?.message || err,
        });
      });
    }
  }, [SUPABASE_ENABLED]);

  const logout = useCallback(() => {
    if (user) {
        addAuditLog({
            action: 'LOGOUT',
            entityType: 'User',
            entityId: user.id,
            details: `User ${user.username} logged out.`
        });
        if (SUPABASE_ENABLED) {
          supabase.auth.signOut();
        }
        setUser(null);
        sessionStorage.removeItem('nexus_user');
        localStorage.removeItem('nexus_company_id');
    }
  }, [user, addAuditLog, SUPABASE_ENABLED]);

  const checkPermission = useCallback((permissionId: string) => {
    if (!user) return false;
    if (user.role === 'Admin' || user.isSuperAdmin) return true;
    const groups = userGroups.filter(g => user.groupIds?.includes(g.id));
    return groups.some(g => g.permissions.includes(permissionId));
  }, [user, userGroups]);

  const validatePasswordStrength = useCallback((password: string) => {
    const errors: string[] = [];
    if (password.length < passwordPolicy.minLength) errors.push(`Minimum length ${passwordPolicy.minLength}`);
    if (passwordPolicy.requireNumber && !/\d/.test(password)) errors.push('Must contain a number');
    if (passwordPolicy.requireSpecialChar && !/[!@#$%^&*(),.?":{}|<>]/.test(password)) errors.push('Must contain special character');
    return { valid: errors.length === 0, errors };
  }, [passwordPolicy]);

  const manageUser = async (u: User) => {
    const userData = { ...u, id: u.id || generateNextId('USR', allUsers, companyConfig) };

    // Check username uniqueness (exclude current user's ID on edit)
    const existingUsername = allUsers.find(
      existing => (existing.username || '').toLowerCase() === (userData.username || '').toLowerCase() && existing.id !== userData.id
    );
    if (existingUsername) {
      throw new Error(`Username "${userData.username}" is already taken.`);
    }

    // Check email uniqueness if provided
    if (userData.email) {
      const existingEmail = allUsers.find(
        existing => existing.email?.toLowerCase() === userData.email.toLowerCase() && existing.id !== userData.id
      );
      if (existingEmail) {
        throw new Error(`Email "${userData.email}" is already in use.`);
      }
    }

    if (SUPABASE_ENABLED && u.password) {
      if (!u.email) {
        throw new Error('Email is required to create a cloud user account.');
      }
      const email = getEmailForUser(u.email);
      const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
        email,
        password: u.password,
        options: {
          data: {
            username: u.username,
            full_name: u.fullName || u.name,
            role: u.role,
            is_super_admin: u.isSuperAdmin,
            group_ids: u.groupIds,
          }
        }
      });
      if (signUpError) {
        if (signUpError.message?.includes('already')) {
          console.warn('[Auth] Supabase user already exists, skipping cloud profile creation.');
        } else {
          logger.error('[Auth] Failed to create Supabase auth user:', signUpError);
          throw new Error(`Failed to create Supabase user: ${signUpError.message}`);
        }
      } else if (signUpData?.user) {
        console.log('[Auth] Supabase auth user created, trigger handles profile sync:', signUpData.user.id);
      }
    }

    await dbService.put('users', userData);
    
    setAllUsers(prev => {
      const exists = prev.some(item => item.id === userData.id);
      if (exists) {
        return prev.map(item => item.id === userData.id ? userData : item);
      }
      return [...prev, userData];
    });
    
    notify('User records synchronized', 'success');
  };

  const deleteUser = async (id: string) => {
    // Check for related records
    const relatedSales = await dbService.getAll('sales').catch(() => []);
    const hasSales = relatedSales.some((s: any) => s.createdBy === id || s.salesPerson === id);
    if (hasSales) {
      notify('Cannot delete user with existing sales transactions', 'error');
      return;
    }
    await dbService.delete('users', id);
    setAllUsers(prev => prev.filter(u => u.id !== id));
    notify('User account terminated', 'info');
  };

  const manageUserGroup = (group: UserGroup) => {
    const isNew = !group.id;
    const groupData = { ...group, id: group.id || generateNextId('GRP', userGroups, companyConfig) };
    setUserGroups(prev => isNew ? [...prev, groupData] : prev.map(g => g.id === groupData.id ? groupData : g));
    notify('Permission group saved', 'success');
  };

  const deleteUserGroup = (id: string) => {
    setUserGroups(prev => prev.filter(g => g.id !== id));
    notify('Permission group removed', 'info');
  };

  const updatePasswordPolicy = (policy: PasswordPolicy) => {
    setPasswordPolicy(policy);
    notify('Security policy updated', 'success');
  };

  const cacheCompanyConfig = (config: CompanyConfig) => {
    try {
      localStorage.setItem('nexus_company_config', JSON.stringify(config));
    } catch {
      // Sync store remains authoritative; ignore cache quota errors.
    }
  };

  /**
   * Hydrate the active company configuration from the authoritative sync
   * store (cloud `public.settings` row mirrored in IndexedDB) when it exists.
   * The cloud configuration takes precedence over the device's local cache.
   */
  const hydrateStoredCompanyConfig = async (): Promise<CompanyConfig | null> => {
    try {
      const stored = await loadStoredCompanyConfig(defaultCompanyConfig as CompanyConfig);
      if (!stored) return null;
      const hydrated = await hydrateCompanyPdfAssets(stored);
      setCompanyConfig(prev => {
        if (JSON.stringify(prev) === JSON.stringify(hydrated)) return prev;
        cacheCompanyConfig(hydrated);
        return hydrated;
      });
      return hydrated;
    } catch (err) {
      logger.error('[Auth] Failed to hydrate company config from sync store:', err);
      return null;
    }
  };

  /**
   * One-time migration: only when no authoritative cloud config exists yet,
   * publish a genuine legacy `nexus_company_config` device cache to the sync
   * store so other devices can inherit it. Never uploads untouched defaults —
   * a device with an empty/degenerated local cache must not replace cloud
   * settings with defaults.
   */
  const migrateLegacyCompanyConfig = async (): Promise<CompanyConfig | null> => {
    try {
      const stored = await loadStoredCompanyConfig(defaultCompanyConfig as CompanyConfig);
      if (stored) return null;
      const raw = localStorage.getItem('nexus_company_config');
      if (!raw) return null;
      const parsed = JSON.parse(raw) as Partial<CompanyConfig>;
      const legacy = normalizeStoredCompanyConfig(parsed, defaultCompanyConfig as CompanyConfig);
      if (!legacy) return null;
      if (isIdenticalToDefaults(legacy, defaultCompanyConfig as CompanyConfig)) return null;
      await persistCompanyConfig(legacy);
      const hydrated = await hydrateCompanyPdfAssets(legacy);
      setCompanyConfig(prev => {
        if (JSON.stringify(prev) === JSON.stringify(hydrated)) return prev;
        cacheCompanyConfig(hydrated);
        return hydrated;
      });
      return hydrated;
    } catch (err) {
      logger.error('[Auth] Failed to migrate legacy company config:', err);
      return null;
    }
  };

  const updateCompanyConfig = (config: CompanyConfig) => {
    const normalizedConfig: CompanyConfig = withNormalizedSecurityConfig(normalizeCompanyNumberingConfig({
      ...config,
      pricingSettings: {
        ...DEFAULT_PRICING_SETTINGS,
        ...(config.pricingSettings || {})
      }
    }));
    setCompanyConfig(normalizedConfig);
    cacheCompanyConfig(normalizedConfig);
    void persistCompanyConfig(normalizedConfig).catch((error) => {
      logger.error('Failed to persist company config to sync store', error);
    });
    void syncDocumentNumberSeriesConfig(normalizedConfig).catch((error) => {
      logger.error('Failed to sync document numbering configuration', error);
    });
    notify('System config saved', 'success');
  };

  const addAlert = useCallback(async (alert: SystemAlert) => {
    const persistedAlert = await publishSystemAlert({
      id: alert.id,
      type: alert.type,
      title: alert.title,
      message: alert.message,
      module: alert.module,
      severity: alert.severity,
      priority: alert.priority,
      actionUrl: alert.actionUrl,
      metadata: alert.metadata,
      date: alert.date,
      read: alert.read,
      readAt: alert.readAt
    });

    setAlerts(prev => [persistedAlert as SystemAlert, ...prev.filter(a => a.id !== persistedAlert.id)]);
  }, []);

  const dismissAlert = useCallback(async (id: string) => {
    await dbService.delete('alerts', id);
    setAlerts(prev => prev.filter(a => a.id !== id));
  }, []);

  const clearAlerts = useCallback(async () => {
    const db = await dbService.initDB();
    const tx = db.transaction('alerts', 'readwrite');
    await tx.objectStore('alerts').clear();
    await tx.done;
    setAlerts([]);
  }, []);

  const resetSystem = async () => {
    // Device reset must NEVER touch cloud data (financial years, company
    // settings, etc.). It only clears the local cache, IndexedDB and the
    // sync queue — after the next login the device re-downloads everything.
    if (SUPABASE_ENABLED) {
      await supabase.auth.signOut();
    }
    try {
      await dbService.factoryReset();
    } catch (err) {
      logger.error('[Auth] factoryReset failed:', err);
    }
    try {
      localStorage.clear();
    } catch {
      const appPrefixes = ['nexus_', 'prime_', 'db_', 'user_', 'auth_', 'finance_', 'sales_'];
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const key = localStorage.key(i);
        if (key && appPrefixes.some(prefix => key.startsWith(prefix))) {
          localStorage.removeItem(key);
        }
      }
    }
    try {
      sessionStorage.clear();
    } catch {
      // Ignore session storage cleanup failures.
    }
    setUser(null);
    if (!SUPABASE_ENABLED) {
      window.location.reload();
    }
  };

  const completeSetup = async (config: CompanyConfig, adminUser: User) => {
    if (SUPABASE_ENABLED) {
      // Get current session/user first
      let session: any = null;
      try {
        const { data } = await withTimeout(supabase.auth.getSession(), 5000);
        session = data.session;
      } catch (e) {
        console.warn('[Auth] Initial getSession failed or timed out:', e);
      }

      if (!session) {
        console.log('[Auth] No session found, waiting for auth state change...');
        try {
          session = await new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
              reject(new AuthFlowError('Auth timeout: No Supabase session available after 10s', {
                code: 'signup_session_timeout',
                userMessage: 'Account created, but we are still waiting for your session. Please try refreshing or signing in manually.'
              }));
            }, 10000);

            const { data: { subscription } } = supabase.auth.onAuthStateChange((event, newSession) => {
              if (newSession) {
                clearTimeout(timeout);
                subscription.unsubscribe();
                resolve(newSession);
              }
            });
          });
        } catch (error: any) {
          logger.error('[Auth] Session wait failed:', error);
          throw error;
        }
      }

      if (!session?.user) {
        throw new AuthFlowError('No Supabase session is available after signup.', {
          code: 'signup_session_missing',
          userMessage: 'Your account was created, but automatic login failed. Please sign in with your email and password.',
        });
      }

      const normalizedConfig: CompanyConfig = withNormalizedSecurityConfig(normalizeCompanyNumberingConfig({
        ...defaultCompanyConfig,
        ...config,
        pricingSettings: {
          ...DEFAULT_PRICING_SETTINGS,
          ...(config.pricingSettings || {})
        }
      }));

      setCompanyConfig(normalizedConfig);
      cacheCompanyConfig(normalizedConfig);
      await persistCompanyConfig(normalizedConfig);

      await cloudDb.upsertProfile({
        ...adminUser,
        user_id: session.user.id,
        role: 'Admin',
        status: 'Active',
        is_super_admin: true,
        group_ids: ['GRP-ADMIN'],
        email: session.user.email || adminUser.email,
      });
      const profile = await syncSupabaseUserToLocal(session.user);
      if (profile) setUser(profile);

      setUserGroups(INITIAL_USER_GROUPS);
      setAllUsers([{
        ...adminUser,
        id: session.user.id,
        role: 'Admin' as UserRole,
        status: 'Active',
        active: true,
        isSuperAdmin: true,
        groupIds: ['GRP-ADMIN'],
        authMode: 'supabase',
      } as User]);

      // Seed master inventory on first setup
      try {
        const existing = await dbService.getAll('inventory');
        if (existing.length === 0) {
          for (const item of SEED_ITEMS) await dbService.put('inventory', item);
        }
        const existingWh = await dbService.getAll('warehouses');
        if (existingWh.length === 0) {
          const { MOCK_WAREHOUSES } = await import('../constants');
          for (const w of MOCK_WAREHOUSES) await dbService.put('warehouses', w);
        }
      } catch (e) {
        console.warn('Failed to seed master inventory:', e);
      }

      setRequiresSetup(false);
      setIsInitialized(true);
      return;
    }

    const normalizedConfig: CompanyConfig = withNormalizedSecurityConfig(normalizeCompanyNumberingConfig({
      ...defaultCompanyConfig,
      ...config,
      pricingSettings: {
        ...DEFAULT_PRICING_SETTINGS,
        ...(config.pricingSettings || {})
      }
    }));

    if (userGroups.length === 0) {
      for (const group of INITIAL_USER_GROUPS) {
        await dbService.put('userGroups', group);
      }
      setUserGroups(INITIAL_USER_GROUPS);
    }

    setCompanyConfig(normalizedConfig);
    cacheCompanyConfig(normalizedConfig);
    await persistCompanyConfig(normalizedConfig);

    await manageUser({
      ...adminUser,
      role: 'Admin',
      status: 'Active',
      active: true,
      isSuperAdmin: true,
      groupIds: adminUser.groupIds?.length ? adminUser.groupIds : ['GRP-ADMIN']
    });
    const updatedUsers = await dbService.getAll<User>('users');
    setAllUsers(updatedUsers);

    // Seed master inventory on first setup
    try {
      const existing = await dbService.getAll('inventory');
      if (existing.length === 0) {
        for (const item of SEED_ITEMS) await dbService.put('inventory', item);
      }
      const existingWh = await dbService.getAll('warehouses');
      if (existingWh.length === 0) {
        const { MOCK_WAREHOUSES } = await import('../constants');
        for (const w of MOCK_WAREHOUSES) await dbService.put('warehouses', w);
      }
    } catch (e) {
      console.warn('Failed to seed master inventory:', e);
    }

    localStorage.setItem('nexus_initialized', 'true');
    setRequiresSetup(false);
    setIsInitialized(true);

    try {
      const { api } = await import('../services/api');
      await api.system.initializeWorkspace(normalizedConfig.companyName);
    } catch (err) {
      console.warn('Failed to initialize local workspace:', err);
    }

    if (!SUPABASE_ENABLED) {
      // Keep user logged in after initial setup
      if (adminUser) {
        setUser({ ...adminUser, authMode: 'local' });
      } else {
        setUser(null);
      }
    } else {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        const profile = await syncSupabaseUserToLocal(session.user);
        if (profile) setUser(profile);
      }
    }
  };

  const setFinancialYear = (year: number) => setActiveFinancialYear(year);

  const addReminder = useCallback(async (text: string, date?: string) => {
      const r: Reminder = { id: `REM-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`, text, date: date || new Date().toISOString(), completed: false };
      await dbService.put('reminders', r);
      setReminders(prev => [r, ...prev]);
  }, []);

  const toggleReminder = useCallback(async (id: string) => {
      const rem = reminders.find(r => r.id === id);
      if (rem) {
          const updated = { ...rem, completed: !rem.completed };
          await dbService.put('reminders', updated);
          setReminders(prev => prev.map(r => r.id === id ? updated : r));
      }
  }, [reminders]);

  const deleteReminder = useCallback(async (id: string) => {
      await dbService.delete('reminders', id);
      setReminders(prev => prev.filter(r => r.id !== id));
  }, []);

  const connectDbSync = async () => {
      await dbService.connectToLocalFile();
  };

  const manualDownloadBackup = async () => {
      await dbService.downloadBackupManual();
  };

  const signUpSupabase = async (email: string, password: string, metadata?: Record<string, unknown>) => {
    const { signUp } = await import('../services/supabaseAuthService');
    const result = await signUp(email, password, metadata);
    
    // If signup succeeded and returned a session, we can optimistically set the user
    // or wait for the onAuthStateChange. However, the SetupWizard will call completeSetup
    // which also checks for a session.
    
    return result;
  };

  const sendPasswordResetOtp = async (email: string) => {
    const { sendPasswordResetOtp: sendFn } = await import('../services/supabaseAuthService');
    return sendFn(email);
  };

  const verifyResetOtp = async (email: string, token: string) => {
    const { verifyOtp } = await import('../services/supabaseAuthService');
    return verifyOtp(email, token, 'recovery');
  };

  const updatePasswordAfterReset = async (password: string) => {
    const { updatePassword } = await import('../services/supabaseAuthService');
    return updatePassword(password);
  };

  const value = {
    user, allUsers, userGroups, passwordPolicy, companyConfig, requiresSetup, notification, auditLogs, alerts, isInitialized, activeFinancialYear, reminders, isOnline, dbSyncStatus, lastSyncTime,
    loginDiagnostic,
    notify, clearNotification, login, loginWithApi, logout, checkPermission, validatePasswordStrength,
    manageUser, deleteUser, manageUserGroup, deleteUserGroup, updatePasswordPolicy, updateCompanyConfig,
    addAuditLog, addAlert, dismissAlert, clearAlerts, resetSystem, completeSetup, setFinancialYear,
    addReminder, toggleReminder, deleteReminder, connectDbSync, manualDownloadBackup,
    signUpSupabase, sendPasswordResetOtp, verifyResetOtp, updatePasswordAfterReset,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
