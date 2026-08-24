import { supabase } from './supabaseClient';
import { isSupabaseConfigured } from './cloudMode';
import { logger } from './logger';
import { stringToUuid5 } from '../utils/uuid';

export const STORE_TO_TABLE: Record<string, string> = {
  warehouses: 'warehouses',
  inventory: 'products',
  ledger: 'ledger_entries',
  batches: 'production_batches',
  resources: 'production_resources',
  workCenters: 'work_centers',
  workOrders: 'work_orders',
  salesOrders: 'sales_orders',
  userGroups: 'user_groups',
  bomTemplates: 'bom_templates',
  bankAccounts: 'bank_accounts',
  customerPayments: 'customer_payments',
  examinationBatches: 'examination_batches',
  auditLogs: 'audit_logs',
  productionBatches: 'production_batches',
  productionResources: 'production_resources',
  goodsReceipts: 'goods_receipts',
  supplierPayments: 'supplier_payments',
  resourceAllocations: 'resource_allocations',
  profitMarginSettings: 'profit_margin_settings',
  marketAdjustments: 'market_adjustments',
  materialCategories: 'material_categories',
  taxRates: 'tax_rates',
  warehouseInventory: 'warehouse_inventory',
  materialBatches: 'material_batches',
  inventoryTransactions: 'inventory_transactions',
  materialReservations: 'material_reservations',
  bankTransactions: 'bank_transactions',
  bankStatements: 'bank_statements',
  bankScheduledPayments: 'bank_scheduled_payments',
  bankExchangeRates: 'bank_exchange_rates',
  bankFees: 'bank_fees',
  bankReconciliations: 'bank_reconciliations',
  bankAdjustments: 'bank_adjustments',
  bankCashFlowForecasts: 'bank_cash_flow_forecasts',
  bankAlerts: 'bank_alerts',
  bankCategories: 'bank_categories',
  idempotencyKeys: 'idempotency_keys',
  customerNotificationLogs: 'customer_notification_logs',
  whatsappChats: 'whatsapp_chats',
  whatsappTemplates: 'whatsapp_templates',
  whatsappCampaigns: 'whatsapp_campaigns',
  whatsappAutomations: 'whatsapp_automations',
  vatTransactions: 'vat_transactions',
  vatReturns: 'vat_returns',
  roundingLogs: 'rounding_logs',
  examinationJobs: 'examination_jobs',
  examinationJobSubjects: 'examination_job_subjects',
  examinationInvoiceGroups: 'examination_invoice_groups',
  examinationRecurringProfiles: 'examination_recurring_profiles',
  examinationInventoryDeductions: 'examination_inventory_deductions',
  examinationBatchNotifications: 'examination_batch_notifications',
  smsCampaigns: 'sms_campaigns',
  smsTemplates: 'sms_templates',
  subcontractOrders: 'subcontract_orders',
  maintenanceLogs: 'maintenance_logs',
  jobTickets: 'job_tickets',
  jobTicketSettings: 'job_ticket_settings',
  jobOrders: 'job_orders',
  examJobs: 'examination_jobs',
  examPapers: 'examination_papers',
  examPrintingBatches: 'examination_printing_batches',
  salesExchanges: 'sales_exchanges',
  salesExchangeItems: 'sales_exchange_items',
  reprintJobs: 'reprint_jobs',
  salesExchangeApprovals: 'sales_exchange_approvals',
  marketAdjustmentTransactions: 'market_adjustment_transactions',
  notificationAuditLogs: 'notification_audit_logs',
  classes: 'classes',
  subjects: 'subjects',
  recurringInvoices: 'recurring_invoices',
  scheduledPayments: 'scheduled_payments',
  walletTransactions: 'wallet_transactions',
  deliveryNotes: 'delivery_notes',
  payrollRuns: 'payroll_runs',
  shipments: 'shipments',
  schools: 'schools',
  tasks: 'tasks',
  referrals: 'customer_referrals',
  referralRewards: 'referral_rewards',
  referralTimeline: 'referral_timeline',
  referralAuditLogs: 'referral_audit_logs',
  referralCampaigns: 'referral_campaigns',
  referralAnalytics: 'referral_analytics',
  referralReversals: 'referral_reversals',
  referralEventHistory: 'referral_event_history',
  engagementTimeline: 'engagement_timeline',
  engagementAudit: 'engagement_audit',
  engagementPoints: 'engagement_points',
  engagementPointBalances: 'engagement_point_balances',
  engagementCashback: 'engagement_cashback',
  engagementMembershipTiers: 'engagement_membership_tiers',
  engagementCustomerTiers: 'engagement_customer_tiers',
  engagementGiftCards: 'engagement_gift_cards',
  engagementGiftCardTransactions: 'engagement_gift_card_transactions',
  engagementAffiliates: 'engagement_affiliates',
  engagementAffiliateCommissions: 'engagement_affiliate_commissions',
  engagementPromotions: 'engagement_promotions',
  engagementCustomerRewards: 'engagement_customer_rewards',
  engagementAnalytics: 'engagement_analytics',

  // Financial years & user preferences for cross-device sync
  financialYears: 'financial_years',
  userPreferences: 'user_preferences',

};

const SUPABASE_ENABLED = isSupabaseConfigured();
const FILE_BUCKET = 'prime-erp-files';
const SIGNED_URL_TTL_SECONDS = 60 * 60;

async function ensureSession(signal?: AbortSignal) {
  if (!SUPABASE_ENABLED) return null;
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (session) return session;
  } catch {
    // getSession threw — don't return null yet, try refresh below
  }
  try {
    const { data: { session: refreshed } } = await supabase.auth.refreshSession();
    if (refreshed) return refreshed;
  } catch {
    // Refresh token expired or invalid — fall back to local operations
  }
  return null;
}

const SESSION_TIMEOUT_MS = 8_000;

async function withSession<T>(fn: () => Promise<T>): Promise<T> {
  const session = await ensureSession();
  if (!session) throw new Error('No Supabase session available');
  return fn();
}

export const cloudDb = {
  isConfigured: () => SUPABASE_ENABLED,

  getRealtimeTables(): string[] {
    return Array.from(new Set([
      ...Object.values(STORE_TO_TABLE),
      'customers',
      'products',
      'sales',
      'invoices',
      'expenses',
      'suppliers',
      'purchase_orders',
      'inventory_movements',
      'profiles',
      'users',
      'financial_years',
    ]));
  },

  async listCompanyProfiles(): Promise<any[] | null> {
    return withSession(async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: true });

      if (error) throw error;
      return (data || []).map((r: any) => {
        const { data: jsonData, updated_at, ...rest } = r;
        return { id: r.id, ...rest, ...(jsonData || {}) } as any;
      });
    });
  },

  /**
   * Write a staff profile through the single sync write path. The row is
   * enqueued on the durable queue and reaches the cloud via the backend sync
   * gateway (POST /api/sync/ops) — never written directly to Supabase from
   * the browser. The profile id is derived deterministically from the user id
   * so a retried upsert merges onto the existing row instead of duplicating it.
   */
  async upsertProfile(profile: Record<string, any>): Promise<string | null> {
    const userId = profile.user_id || profile.userId || profile.id;
    if (!userId) return null;

    const profileId = profile.profile_id || profile.profileId || await stringToUuid5(String(userId));

    const profileData = { ...profile };
    delete profileData.password;
    delete profileData.confirmPassword;
    delete profileData.profile_id;
    delete profileData.profileId;
    delete profileData.user_id;
    delete profileData.userId;
    delete profileData.company_id;
    delete profileData.companyId;

    const payload: Record<string, unknown> = {
      id: profileId,
      user_id: userId,
      full_name: profile.full_name || profile.fullName || 'User',
      role: profile.role || 'Sales Staff',
      status: profile.status || 'Active',
      data: profileData,
      updated_at: new Date().toISOString(),
    };

    try {
      const { durableSyncQueue } = await import('./durableSyncQueue');
      await durableSyncQueue.enqueue({
        table: 'profiles',
        recordId: profileId,
        operation: 'upsert',
        payload: payload as unknown,
      });
      const { backgroundSyncService } = await import('./backgroundSyncService');
      backgroundSyncService.trigger();
    } catch {
      // best-effort write: the queue will pick it up on the next sync pass.
    }
    return profileId;
  },

  /**
   * Check if an operation has already been processed (idempotency check).
   */
  _idempotencyTableReady: null as boolean | null,
  _idempotencyCache: new Map(),
  _idempotencyCacheMax: 500,
  _idempotencyCacheTtl: 60_000,
  _pendingChecks: new Map(),

  async _ensureIdempotencyTable(): Promise<boolean> {
    if (this._idempotencyTableReady !== null) return this._idempotencyTableReady;
    try {
      const { error } = await supabase
        .from('idempotency_keys')
        .select('id', { head: true, count: 'exact' })
        .limit(0);
      this._idempotencyTableReady = !error;
    } catch {
      this._idempotencyTableReady = false;
    }
    return this._idempotencyTableReady;
  },

  async checkIdempotency(operationId: string): Promise<{ alreadyProcessed: boolean; result?: string | null }> {
    // Check local cache first
    const cached = this._idempotencyCache.get(operationId);
    if (cached && Date.now() - cached.ts < this._idempotencyCacheTtl) {
      return { alreadyProcessed: cached.alreadyProcessed, result: cached.result };
    }

    // Deduplicate concurrent checks for the same operationId
    const pending = this._pendingChecks.get(operationId);
    if (pending) return pending;

    const promise = this._performIdempotencyCheck(operationId);
    this._pendingChecks.set(operationId, promise);
    try {
      return await promise;
    } finally {
      this._pendingChecks.delete(operationId);
    }
  },

  async _performIdempotencyCheck(operationId: string): Promise<{ alreadyProcessed: boolean; result?: string | null }> {
    if (!(await this._ensureIdempotencyTable())) return { alreadyProcessed: false };
    try {
      const uuidId = await stringToUuid5(operationId);
      const query = supabase
        .from('idempotency_keys')
        .select('result')
        .eq('id', uuidId);
      const { data } = await query.maybeSingle();
      const result = data
        ? { alreadyProcessed: true, result: data.result as string | null }
        : { alreadyProcessed: false };

      // Cache the result
      if (this._idempotencyCache.size >= this._idempotencyCacheMax) {
        const oldest = this._idempotencyCache.keys().next().value;
        if (oldest) this._idempotencyCache.delete(oldest);
      }
      this._idempotencyCache.set(operationId, { ...result, ts: Date.now() });

      return result;
    } catch {
      return { alreadyProcessed: false };
    }
  },

  /**
   * Record an idempotency key after successful operation.
   */
  async recordIdempotency(operationId: string, result: string, ttlMs: number = 86400000): Promise<void> {
    if (!(await this._ensureIdempotencyTable())) return;
    try {
      const uuidId = await stringToUuid5(operationId);
      const record: any = {
        id: uuidId,
        result,
        expires_at: new Date(Date.now() + ttlMs).toISOString(),
      };
      await supabase.from('idempotency_keys').upsert(record, { onConflict: 'id' });
    } catch {
      // Idempotency recording is best-effort
    }
  },

async uploadFile(file: File, folder = 'documents', operationId?: string): Promise<string | null> {
    return withSession(async () => {
      // Idempotency check for file uploads
      if (operationId) {
        const { alreadyProcessed, result } = await this.checkIdempotency(operationId);
        if (alreadyProcessed) return result || null;
      }

      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const path = `${folder}/${crypto.randomUUID()}-${safeName}`;
      const { data: uploadData, error } = await supabase.storage
        .from(FILE_BUCKET)
        .upload(path, file, {
          cacheControl: '3600',
          contentType: file.type || 'application/octet-stream',
          upsert: false,
        });

      if (error) {
        if (String(error.message || error.statusCode || '').includes('bucket')) {
          logger.error(`[CloudDB] Storage bucket '${FILE_BUCKET}' not found. Create it in Supabase Dashboard → Storage.`, error);
        } else {
          logger.error(`[CloudDB] File upload failed for ${path}`, error);
        }
        throw error;
      }
      const result = `storage:${FILE_BUCKET}:${path}`;

      // Record idempotency
      if (operationId) {
        await this.recordIdempotency(operationId, result);
      }

      return result;
    });
  },

  async createSignedFileUrl(fileId: string, expiresIn = SIGNED_URL_TTL_SECONDS): Promise<string | null> {
    return withSession(async () => {
      const match = /^storage:([^:]+):(.+)$/.exec(fileId);
      if (!match) return null;
      const [, bucket, path] = match;
      const { data, error } = await supabase.storage
        .from(bucket)
        .createSignedUrl(path, expiresIn);

      if (error) throw error;
      return data.signedUrl;
    });
  },

  async downloadFile(fileId: string): Promise<Blob | null> {
    return withSession(async () => {
      const match = /^storage:([^:]+):(.+)$/.exec(fileId);
      if (!match) return null;
      const [, bucket, path] = match;
      const { data, error } = await supabase.storage
        .from(bucket)
        .download(path);

      if (error) throw error;
      return data;
    });
  },
};

export default cloudDb;
