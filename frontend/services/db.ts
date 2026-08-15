import { openDB, DBSchema, IDBPDatabase, deleteDB } from 'idb';
import { logger } from '@/services/logger';
import {
    Item, Warehouse, Purchase, Sale, Quotation, JobOrder, CustomerPayment, BillOfMaterial, ProductionBatch, WorkOrder, WorkCenter, ProductionResource, Account, LedgerEntry, Invoice, RecurringInvoice, Expense, Income, ScheduledPayment, WalletTransaction, DeliveryNote, Budget, Transfer, Employee, PayrollRun, Payslip, User, ResourceAllocation, GoodsReceipt, UserRole, SMSCampaign, Subscriber, SMSTemplate, Cheque, Shipment, SubcontractOrder, MaintenanceLog, AuditLogEntry, SystemAlert, Reminder, ExamJob, ExamPaper, ExamPrintingBatch, School, Customer, Supplier, SupplierPayment, Order, PurchaseAllocation, VatTransaction, VatReturn, BOMTemplate, MarketAdjustment, MarketAdjustmentTransaction, UserGroup, MaterialCategory, WarehouseInventory, MaterialBatch, InventoryTransaction, MaterialReservation, RoundingLog, ExaminationJob, ExaminationJobSubject, ExaminationInvoiceGroup, ExaminationRecurringProfile, ExaminationInventoryDeduction, CustomerReceiptSnapshot, ExaminationBatchNotification, NotificationAuditLog,     SalesOrder, JobTicket, JobTicketSettings,
    TaxRate
} from '../types';
import type { Referral, ReferralReward } from '../types/referral';
import type { ReferralTimelineEntry, ReferralAuditEntry, ReferralCampaign, ReferralAnalytics, ReversalRequest, ReferralEvent } from '../types/referral-extended';
import type { EngagementTimelineEntry, EngagementAuditEntry, PointEntry, PointBalance, CashbackEntry, MembershipTier, CustomerTier, GiftCard, GiftCardTransaction, AffiliateAccount, AffiliateCommission, Promotion, CustomerReward, EngagementAnalytics } from '../types/engagement';
import type { PortalAd } from '../types/ads';
import type { ProductAttribute } from '../types/attributes';
import { calculateCustomerPaymentSnapshot } from './receiptCalculationService';

import {
    BankAccount,
    BankTransaction,
    BankStatement,
    ScheduledPayment as BankScheduledPayment,
    ExchangeRate,
    BankFee,
    Reconciliation,
    Adjustment,
    CashFlowForecast,
    BankAlert,
    BankCategory
} from '../types/banking';
import { cloudDb } from './cloudDb';
import { isCloudOnlyMode, isSupabaseConfigured, requireCloudSessionMessage } from './cloudMode';
import { durableSyncQueue } from './durableSyncQueue';
import { backgroundSyncService } from './backgroundSyncService';
import { newId } from '../utils/ulid';

import { audit } from './syncAudit';

interface NexusDB extends DBSchema {
    inventory: { key: string; value: Item; };
    warehouses: { key: string; value: Warehouse; };
    purchases: { key: string; value: Purchase; };
    sales: { key: string; value: Sale; };
    quotations: { key: string; value: Quotation; };
    jobOrders: { key: string; value: JobOrder; };
    examJobs: { key: string; value: ExamJob; };
    examPapers: { key: string; value: ExamPaper; };
    examPrintingBatches: { key: string; value: ExamPrintingBatch; };
    examinationJobs: { key: string; value: ExaminationJob; };
    examinationJobSubjects: { key: string; value: ExaminationJobSubject; };
    examinationInvoiceGroups: { key: string; value: ExaminationInvoiceGroup; };
    examinationRecurringProfiles: { key: string; value: ExaminationRecurringProfile; };
    examinationInventoryDeductions: { key: string; value: ExaminationInventoryDeduction; };
    examinationBatchNotifications: { key: string; value: ExaminationBatchNotification; };
    examinationBatches: { key: string; value: any; };
    notificationAuditLogs: { key: string; value: NotificationAuditLog; };
    schools: { key: string; value: School; };
    classes: { key: string; value: { id: string; name: string } };
    subjects: { key: string; value: { id: string; name: string; code?: string } };
    customerPayments: { key: string; value: CustomerPayment; };
    boms: { key: string; value: BillOfMaterial; };
    bomTemplates: { key: string; value: BOMTemplate; };
    profitMarginSettings: { key: string; value: any; };
    marketAdjustments: { key: string; value: MarketAdjustment; };
    materialReservations: { key: string; value: MaterialReservation; };
    materialCategories: { key: string; value: MaterialCategory; };
    warehouseInventory: { key: string; value: WarehouseInventory; };
    materialBatches: { key: string; value: MaterialBatch; };
    inventoryTransactions: { key: string; value: InventoryTransaction; };
    marketAdjustmentTransactions: { key: string; value: MarketAdjustmentTransaction; };
    batches: { key: string; value: ProductionBatch; };
    workOrders: { key: string; value: WorkOrder; };
    jobTickets: { key: string; value: JobTicket; };
    jobTicketSettings: { key: string; value: { id: string } & JobTicketSettings; };
    workCenters: { key: string; value: WorkCenter; };
    resources: { key: string; value: ProductionResource; };
    resourceAllocations: { key: string; value: ResourceAllocation; };
    accounts: { key: string; value: Account; };
    ledger: { key: string; value: LedgerEntry; };
    invoices: { key: string; value: Invoice; };
    recurringInvoices: { key: string; value: RecurringInvoice; };
    expenses: { key: string; value: Expense; };
    income: { key: string; value: Income; };
    scheduledPayments: { key: string; value: ScheduledPayment; };
    walletTransactions: { key: string; value: WalletTransaction; };
    deliveryNotes: { key: string; value: DeliveryNote; };
    budgets: { key: string; value: Budget; };
    transfers: { key: string; value: Transfer; };
    cheques: { key: string; value: Cheque; };
    employees: { key: string; value: Employee; };
    payrollRuns: { key: string; value: PayrollRun; };
    payslips: { key: string; value: Payslip; };
    users: { key: string; value: User; };
    userGroups: { key: string; value: UserGroup; };
    goodsReceipts: { key: string; value: GoodsReceipt; };
    smsCampaigns: { key: string; value: SMSCampaign; };
    subscribers: { key: string; value: Subscriber; };
    smsTemplates: { key: string; value: SMSTemplate; };
    shipments: { key: string; value: Shipment; };
    subcontractOrders: { key: string; value: SubcontractOrder; };
    maintenanceLogs: { key: string; value: MaintenanceLog; };
    auditLogs: { key: string; value: AuditLogEntry; };
    alerts: { key: string; value: SystemAlert; };
    reminders: { key: string; value: Reminder; };
    customers: { key: string; value: Customer; };
    suppliers: { key: string; value: Supplier; };
    supplierPayments: { key: string; value: SupplierPayment; };
    orders: { key: string; value: Order; };
    salesOrders: { key: string; value: SalesOrder; };
    salesExchanges: { key: string; value: any; };
    salesExchangeItems: { key: string; value: any; };
    reprintJobs: { key: string; value: any; };
    salesExchangeApprovals: { key: string; value: any; };
    files: { key: string; value: { id: string; blob: Blob; name: string; type: string; created: string } };
    financialYears: { key: string; value: any };
    userPreferences: { key: string; value: any };
    tasks: { key: string; value: any };
    vatTransactions: { key: string; value: VatTransaction; };
    vatReturns: { key: string; value: VatReturn; };
    roundingLogs: { key: string; value: RoundingLog; };
    bankAccounts: { key: string; value: BankAccount; };
    bankTransactions: { key: string; value: BankTransaction; };
    bankStatements: { key: string; value: BankStatement; };
    bankScheduledPayments: { key: string; value: BankScheduledPayment; };
    bankExchangeRates: { key: string; value: ExchangeRate; };
    bankFees: { key: string; value: BankFee; };
    bankReconciliations: { key: string; value: Reconciliation; };
    bankAdjustments: { key: string; value: Adjustment; };
    bankCashFlowForecasts: { key: string; value: CashFlowForecast; };
    bankAlerts: { key: string; value: BankAlert; };
    bankCategories: { key: string; value: BankCategory; };
    idempotencyKeys: { key: string; value: { id: string; scope: string; sourceId: string; createdAt: string; metadata?: any } };
    settings: { key: string; value: any; };
    customerNotificationLogs: { key: string; value: any; };
    whatsappChats: { key: string; value: any; };
    whatsappTemplates: { key: string; value: any; };
    whatsappCampaigns: { key: string; value: any; };
    whatsappAutomations: { key: string; value: any; };
    productAttributes: { key: string; value: ProductAttribute; };
    taxRates: { key: string; value: TaxRate; };
    customerPricingTiers: { key: string; value: any; };
    discountRules: { key: string; value: any; };
    referrals: { key: string; value: Referral; };
    referralRewards: { key: string; value: ReferralReward; };
    referralTimeline: { key: string; value: ReferralTimelineEntry; };
    referralAuditLogs: { key: string; value: ReferralAuditEntry; };
    referralCampaigns: { key: string; value: ReferralCampaign; };
    referralAnalytics: { key: string; value: ReferralAnalytics; };
    referralReversals: { key: string; value: ReversalRequest; };
    referralEventHistory: { key: string; value: ReferralEvent; };
    engagementTimeline: { key: string; value: EngagementTimelineEntry; };
    engagementAudit: { key: string; value: EngagementAuditEntry; };
    engagementPoints: { key: string; value: PointEntry; };
    engagementPointBalances: { key: string; value: PointBalance; };
    engagementCashback: { key: string; value: CashbackEntry; };
    engagementMembershipTiers: { key: string; value: MembershipTier; };
    engagementCustomerTiers: { key: string; value: CustomerTier; };
    engagementGiftCards: { key: string; value: GiftCard; };
    engagementGiftCardTransactions: { key: string; value: GiftCardTransaction; };
    engagementAffiliates: { key: string; value: AffiliateAccount; };
    engagementAffiliateCommissions: { key: string; value: AffiliateCommission; };
    engagementPromotions: { key: string; value: Promotion; };
    engagementCustomerRewards: { key: string; value: CustomerReward; };
    engagementAnalytics: { key: string; value: EngagementAnalytics; };
    portalAds: { key: string; value: PortalAd; };

}

const DB_NAME = 'PrimeERP_Final_v3_Clean';
const DB_VERSION = 52;

let dbPromise: Promise<IDBPDatabase<NexusDB>> | null = null;

const isRecoverableDbConnectionError = (error: unknown): boolean => {
    if (!(error instanceof Error)) return false;
    if (error.name === 'VersionError' || error.name === 'InvalidStateError') return true;
    if (error.name === 'AbortError') return true;

    const message = String(error.message || '').toLowerCase();
    return message.includes('database connection is closing')
        || message.includes('connection is closing')
        || message.includes('connection is closed');
};

const resetDbConnection = async (db?: IDBPDatabase<NexusDB> | null) => {
    console.warn('[DB] resetDbConnection called!', new Error().stack);
    try {
        db?.close();
    } catch (err) {
        console.warn('[DB] Error closing connection:', err);
    }
    dbPromise = null;
};

const withDbRecovery = async <T>(operation: (db: IDBPDatabase<NexusDB>) => Promise<T>): Promise<T> => {
    let lastError: unknown;

    for (let attempt = 0; attempt < 2; attempt += 1) {
        const db = await initDB();
        try {
            return await operation(db);
        } catch (error) {
            lastError = error;
            if (!isRecoverableDbConnectionError(error) || attempt === 1) {
                throw error;
            }

            console.warn('[DB] Recovering from stale IndexedDB connection, reopening database...');
            await resetDbConnection(db);
        }
    }

    throw lastError instanceof Error ? lastError : new Error('IndexedDB operation failed.');
};

// Handle HMR and page reloads by closing the connection
if (typeof window !== 'undefined') {
    window.addEventListener('beforeunload', () => {
        if (dbPromise) {
            dbPromise.then(db => {
                db.close();
                // Connection closed on page unload
            }).catch(() => { });
        }
    });

    // Handle Vite HMR
    if ((import.meta as { hot?: { dispose(cb: () => void): void } }).hot) {
        (import.meta as { hot?: { dispose(cb: () => void): void } }).hot.dispose(() => {
            if (dbPromise) {
                dbPromise.then(db => {
                    db.close();
                    // Connection closed due to HMR
                }).catch(() => { });
                dbPromise = null;
            }
        });
    }
}

let fileHandle: FileSystemFileHandle | null = null;
let saveTimer: any = null;
let isSaving = false;
type SyncStatus = 'idle' | 'connected' | 'syncing' | 'error' | 'restricted';
let onSyncStateChange: ((status: SyncStatus) => void) | null = null;
const DATA_CHANGED_EVENT = 'primeerp:data-changed';
const DATA_CHANGED_CHANNEL = 'primeerp-data-sync';
let DB_SOURCE = `db-${Math.random().toString(36).slice(2)}`;
let dataChangeChannel: BroadcastChannel | null = null;

const LEGACY_DATABASE_NAMES = [
    'PrimeERP_Final_v3_Clean',
    'PrimeERP_Production_v1',
    'PrimeERP_OfflineFirst',
    'PrimeERP_Examination_v1'
] as const;
const extractLegacySettingValue = <T>(value: any): T | undefined => {
    if (value === undefined || value === null) {
        return value as T | undefined;
    }

    if (typeof value !== 'object' || Array.isArray(value)) {
        return value as T;
    }

    if ('value' in value && Object.keys(value).every((key) => key === 'id' || key === 'value')) {
        return value.value as T;
    }

    if ('id' in value) {
        const { id: _unused, ...rest } = value as Record<string, unknown>;
        return rest as T;
    }

    return value as T;
};

const shapeLegacySettingRecord = (key: string, value: unknown) => {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
        const { id: _unused, ...safeValue } = value as Record<string, unknown>;
        return { id: key, ...safeValue };
    }

    return { id: key, value };
};

const notifySyncState = (status: SyncStatus) => {
    if (onSyncStateChange) onSyncStateChange(status);
};

const emitDataChange = (stores: string[]) => {
    const payload = {
        type: 'data-changed',
        stores,
        source: DB_SOURCE,
        at: Date.now()
    };
    try {
        if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent(DATA_CHANGED_EVENT, { detail: payload }));
            if (!isCloudOnlyMode()) {
                localStorage.setItem(DATA_CHANGED_EVENT, JSON.stringify(payload));
            }
        }
    } catch (err) {
        console.warn('[DB] Failed to dispatch data change event:', err);
    }
    try {
        if (typeof BroadcastChannel !== 'undefined') {
            if (!dataChangeChannel) {
                dataChangeChannel = new BroadcastChannel(DATA_CHANGED_CHANNEL);
            }
            dataChangeChannel.postMessage(payload);
        }
    } catch (err) {
        console.warn('[DB] Failed to broadcast data change:', err);
    }
};

const getAllFromLegacyStore = async <T>(storeName: keyof NexusDB): Promise<T[]> => withDbRecovery(async (db) => {
    if (!db?.objectStoreNames?.contains?.(storeName as any)) {
        console.warn(`Object store "${storeName}" not found in IndexedDB.`);
        return [];
    }
    // Use getAllKeys + get to avoid any stale-snapshot issues with getAll
    const keys = await db.getAllKeys(storeName as any);
    const items: T[] = [];
    for (const key of keys) {
        const item = await db.get(storeName as any, key);
        if (item !== undefined) items.push(item);
    }
    return items;
});

const getFromLegacyStore = async <T>(storeName: keyof NexusDB, id: string): Promise<T | undefined> => withDbRecovery(async (db) => {
    if (!db?.objectStoreNames?.contains?.(storeName as any)) {
        console.warn(`Object store "${storeName}" not found in IndexedDB.`);
        return undefined;
    }
    const record = await db.get(storeName as any, id) as T | undefined;
    if (!record) return undefined;
    return record;
});

const writeQueues = new Map<string, Promise<void>>();

// Simulated-offline gate for the acceptance framework: while true, saveFile
// skips the Supabase Storage attempt and uses the offline cache + queue path.
let forceOffline = false;

const putToLegacyStore = async <T>(storeName: keyof NexusDB, item: T): Promise<string> => {
    const key = String(storeName);
    const prev = writeQueues.get(key) ?? Promise.resolve();
    const next = prev.then(() => withDbRecovery(async (db) => {
        const result = await db.put(storeName as any, item);
        return result as string;
    }));
    writeQueues.set(key, next.then(() => {}, () => {}));
    return next;
};

const deleteFromLegacyStore = async (storeName: keyof NexusDB, id: string): Promise<void> => {
    await withDbRecovery(async (db) => {
        if (!db?.objectStoreNames?.contains?.(storeName as any)) {
            return;
        }
        await db.delete(storeName as any, id);
    });
};

const SUPABASE_CONFIGURED = isSupabaseConfigured;

const LOCAL_ONLY_STORES = new Set([
  'idempotencyKeys',
  'customerNotificationLogs',
  'alerts', 'auditLogs',
  'productAttributes',
  // Users are auth records only — no `users` table exists in Supabase
  // (staff profiles live in `profiles`), so keep them local to avoid
  // 404s on /rest/v1/users from the background sync engine.
  'users',
]);

interface PutOptions {
    cloudSource?: boolean;
}

interface DeleteOptions {
    cloudSource?: boolean;
}

const shouldUseCloud = () => {
  return SUPABASE_CONFIGURED();
};



const CLOUD_TABLE_MAP: Record<string, string> = {
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
  goodsReceipts: 'goods_receipts',
  supplierPayments: 'supplier_payments',
  resourceAllocations: 'resource_allocations',
  profitMarginSettings: 'profit_margin_settings',
  marketAdjustments: 'market_adjustments',
  materialCategories: 'material_categories',
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
  financialYears: 'financial_years',
  userPreferences: 'user_preferences',
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
  expenses: 'expenses',
  income: 'income',
  budgets: 'budgets',
  transfers: 'transfers',
  cheques: 'cheques',
  employees: 'employees',
  payslips: 'payslips',
  subscribers: 'subscribers',
  suppliers: 'suppliers',
  sales: 'sales',
  purchases: 'purchases',
  invoices: 'invoices',
  customers: 'customers',
  accounts: 'accounts',
  reminders: 'reminders',
  quotations: 'quotations',
  orders: 'orders',
  boms: 'boms',
  taxRates: 'tax_rates',
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
  portalAds: 'portal_ads',

};

function getCloudTable(storeName: string): string {
  return CLOUD_TABLE_MAP[storeName] || storeName;
}

// Reverse map (cloud table → local store) for writing server-stamped metadata
// back into live records. Tables reached from more than one store are excluded
// (ambiguous) so the stamp is never written to the wrong store.
const REVERSE_CLOUD_TABLE: Record<string, string> = {};
const AMBIGUOUS_CLOUD_TABLES: Record<string, boolean> = {};
for (const [store, table] of Object.entries(CLOUD_TABLE_MAP)) {
  if (table in REVERSE_CLOUD_TABLE) {
    delete REVERSE_CLOUD_TABLE[table];
    AMBIGUOUS_CLOUD_TABLES[table] = true;
  } else if (!AMBIGUOUS_CLOUD_TABLES[table]) {
    REVERSE_CLOUD_TABLE[table] = store;
  }
}

function getStoreForCloudTable(table: string): string | null {
  if (AMBIGUOUS_CLOUD_TABLES[table]) return null;
  return REVERSE_CLOUD_TABLE[table] || table;
}

export { getStoreForCloudTable };

const STORE_NAMES: (keyof NexusDB)[] = [
    'inventory', 'warehouses', 'purchases', 'sales',
    'quotations', 'jobOrders', 'customerPayments', 'boms', 'bomTemplates', 'marketAdjustments', 'marketAdjustmentTransactions', 'batches',
    'workOrders', 'jobTickets', 'jobTicketSettings', 'workCenters', 'resources', 'resourceAllocations',
    'accounts', 'ledger', 'invoices', 'recurringInvoices',
    'expenses', 'income', 'scheduledPayments',
    'walletTransactions', 'deliveryNotes', 'budgets', 'cheques',
    'transfers', 'employees', 'payrollRuns', 'payslips', 'tasks',
    'users', 'userGroups', 'goodsReceipts', 'files',
    'financialYears',
    'userPreferences',
    'smsCampaigns', 'subscribers', 'smsTemplates', 'shipments',
    'subcontractOrders', 'maintenanceLogs',
    'auditLogs', 'alerts', 'reminders',
    'examJobs', 'examPapers', 'examPrintingBatches',
    'examinationJobs', 'examinationJobSubjects', 'examinationInvoiceGroups', 'examinationRecurringProfiles', 'examinationInventoryDeductions', 'examinationBatchNotifications', 'examinationBatches', 'notificationAuditLogs',
    'schools',
    'classes', 'subjects',
    'customers', 'suppliers', 'supplierPayments',
    'orders', 'materialReservations', 'materialCategories', 'warehouseInventory', 'materialBatches', 'inventoryTransactions',
    'salesExchanges', 'salesExchangeItems', 'reprintJobs', 'salesExchangeApprovals', 'salesOrders',
    'vatTransactions', 'vatReturns', 'roundingLogs',
    'bankAccounts', 'bankTransactions', 'bankStatements', 'bankScheduledPayments',
    'bankExchangeRates', 'bankFees', 'bankReconciliations', 'bankAdjustments',
    'bankCashFlowForecasts', 'bankAlerts', 'bankCategories',
    'idempotencyKeys',
    'settings', 'customerNotificationLogs',
    'whatsappChats', 'whatsappTemplates', 'whatsappCampaigns', 'whatsappAutomations',
    'productAttributes',
    'taxRates',
    'customerPricingTiers',
    'discountRules',
    'referrals',
    'referralRewards',
    'referralTimeline',
    'referralAuditLogs',
    'referralCampaigns',
    'referralAnalytics',
    'referralReversals',
    'referralEventHistory',
    'engagementTimeline',
    'engagementAudit',
    'engagementPoints',
    'engagementPointBalances',
    'engagementCashback',
    'engagementMembershipTiers',
    'engagementCustomerTiers',
    'engagementGiftCards',
    'engagementGiftCardTransactions',
    'engagementAffiliates',
    'engagementAffiliateCommissions',
    'engagementPromotions',
    'engagementCustomerRewards',
    'engagementAnalytics',
    'portalAds',

];

export const initDB = async (): Promise<IDBPDatabase<NexusDB>> => {
    if (dbPromise) return dbPromise;

    // Starting connection

    dbPromise = (async () => {
        const timeoutPromise = new Promise<never>((_, reject) => {
            setTimeout(() => {
                reject(new Error(`Database connection timed out(120s). This usually happens if a large migration is running or another tab is blocking the connection. Please close all other tabs and refresh.`));
            }, 120000);
        });

        const openPromise = openDB<NexusDB>(DB_NAME, DB_VERSION, {
            async upgrade(db, oldVersion, newVersion, transaction) {
                // Upgrading/Creating DB
                for (const store of STORE_NAMES) {
                    if (!db.objectStoreNames.contains(store as any)) {
                        // Creating store
                        db.createObjectStore(store as any, { keyPath: 'id' });
                    }
                }
                // All stores created

                if (oldVersion < 20 && transaction) {
                    await migrateToVersion20(transaction);
                }

                if (oldVersion < 24 && transaction) {
                    await migrateToVersion24(transaction);
                }

                if (oldVersion < 39 && transaction) {
                    await migrateToVersion39(transaction);
                }

                if (oldVersion < 40 && transaction) {
                    await migrateToVersion40(transaction);
                }

                if (oldVersion < 41 && transaction) {
                    await migrateToVersion41(transaction);
                }
            },
            blocked() {
                console.warn('[DB] CONNECTION BLOCKED - Another tab is using an older version of this database.');
                window.dispatchEvent(new CustomEvent('nexus-db-blocked'));
            },
            blocking() {
                console.warn('[DB] CONNECTION BLOCKING - Another tab needs to upgrade. Closing connection...', new Error().stack);
                if (dbPromise) {
                    dbPromise.then(db => db.close()).catch(() => { });
                    dbPromise = null;
                }
            },
            terminated() {
                logger.error('[DB] CONNECTION TERMINATED UNEXPECTEDLY');
                console.warn('[DB] terminated callback invoked', new Error().stack);
                dbPromise = null;
            }
        });

        try {
            const db = await Promise.race([openPromise, timeoutPromise]);
            // Connection successful

            return db;
        } catch (err) {
            logger.error("[DB] Critical Failure:", err);
            dbPromise = null; // Reset promise so next attempt can retry
            throw err;
        }
    })();

    return dbPromise;
};

async function migrateToVersion20(transaction: any) {
    const invoiceStore = transaction.objectStore('invoices');
    await new Promise<void>((resolve, reject) => {
        const request = invoiceStore.openCursor();
        request.onsuccess = (event: any) => {
            const cursor = event.target.result;
            if (cursor) {
                const inv = cursor.value;
                if (inv.totalAmount < 0) {
                    inv.totalAmount = Math.abs(inv.totalAmount);
                    cursor.update(inv);
                }
                cursor.continue();
            } else {
                resolve();
            }
        };
        request.onerror = () => reject(request.error);
    });
}

const round2 = (value: number): number =>
    Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;

const toIsoSafe = (value?: string): string => {
    const parsed = value ? new Date(value) : new Date();
    if (Number.isNaN(parsed.getTime())) return new Date().toISOString();
    return parsed.toISOString();
};

const inferBackfillPurpose = (payment: CustomerPayment): CustomerReceiptSnapshot['paymentPurpose'] => {
    const note = (payment.notes || '').toLowerCase();
    if (note.includes('exam')) return 'EXAM_PAYMENT';
    if ((payment.reference || '').toUpperCase().startsWith('INV')) return 'INVOICE_PAYMENT';
    if ((payment.reference || '').toUpperCase().startsWith('RCPT')) return 'POS_PAYMENT';
    if ((payment.allocations || []).length > 0) return 'INVOICE_PAYMENT';
    if ((payment.excessHandling === 'Wallet') || Number(payment.walletDeposit || payment.overpaymentAmount || 0) > 0) {
        return 'WALLET_TOPUP';
    }
    return 'UNALLOCATED_PAYMENT';
};

const buildBackfilledReceiptSnapshot = (payment: CustomerPayment): CustomerReceiptSnapshot => {
    const rawAllocations = (payment.allocations || []).map((allocation: any) => ({
        invoiceId: allocation.invoiceId,
        allocationAmount: round2(allocation.amount),
        outstandingAmount: round2(allocation.amount)
    }));

    const legacyChange = round2(
        payment.changeGiven ??
        (payment.excessHandling === 'Change' ? (payment.excessAmount || 0) : 0)
    );
    const legacyWallet = round2(
        payment.walletDeposit ??
        payment.overpaymentAmount ??
        (payment.excessHandling === 'Wallet' ? (payment.excessAmount || 0) : 0)
    );
    const amountTendered = round2(payment.amount || 0);
    let remainingTendered = amountTendered;
    const allocations = rawAllocations.map((allocation: any) => {
        const clampedAmount = round2(Math.max(0, Math.min(allocation.allocationAmount, remainingTendered)));
        remainingTendered = round2(Math.max(0, remainingTendered - clampedAmount));
        return {
            ...allocation,
            allocationAmount: clampedAmount
        };
    }).filter((allocation: any) => allocation.allocationAmount > 0);
    const fallbackAmountApplied = round2(
        payment.amountApplied ??
        allocations.reduce((sum: number, allocation: any) => sum + allocation.allocationAmount, 0)
    );
    const fallbackAmountRetained = round2(
        payment.amountRetained ??
        Math.max(0, amountTendered - legacyChange)
    );

    let calculated: CustomerReceiptSnapshot;
    try {
        calculated = calculateCustomerPaymentSnapshot({
            amountTendered,
            appliedInvoices: allocations,
            excessHandling: legacyWallet > 0 ? 'Wallet' : (legacyChange > 0 ? 'Change' : undefined),
            paymentPurpose: inferBackfillPurpose(payment),
            paymentDate: payment.date,
            customerName: payment.customerName
        });
    } catch {
        const fallbackApplied = round2(Math.min(fallbackAmountApplied, amountTendered));
        const fallbackRetained = round2(Math.max(0, amountTendered - legacyChange));
        const fallbackInvoiceTotal = round2(payment.invoiceTotal ?? fallbackApplied);
        const fallbackBalance = round2(Math.max(0, fallbackInvoiceTotal - fallbackApplied));
        calculated = {
            id: String(payment.id ?? ''),
            customerId: String(payment.customerId ?? ''),
            invoiceId: allocations[0]?.invoiceId ?? '',
            amount: amountTendered,
            date: toIsoSafe(payment.date),
            generatedAt: toIsoSafe(payment.date),
            paymentPurpose: inferBackfillPurpose(payment),
            amountTendered,
            amountApplied: fallbackApplied,
            changeGiven: legacyChange,
            walletDeposit: legacyWallet,
            amountRetained: fallbackRetained,
            invoiceTotalAtPosting: fallbackInvoiceTotal,
            balanceDueAfterPayment: fallbackBalance,
            appliedInvoices: allocations.map((allocation: any) => allocation.invoiceId),
            paymentStatus: legacyWallet > 0 ? 'OVERPAID' : (fallbackBalance > 0 ? 'PARTIALLY PAID' : 'PAID'),
            backfilled: true,
            confidence: 'estimated',
            calculationVersion: 1
        };
    }

    const invoiceTotalAtPosting = round2(
        payment.invoiceTotal ??
        calculated.invoiceTotalAtPosting
    );
    const amountApplied = round2(payment.amountApplied ?? fallbackAmountApplied);
    const balanceDueAfterPayment = round2(
        payment.balanceDue ??
        Math.max(0, invoiceTotalAtPosting - amountApplied)
    );
    const walletDeposit = round2(
        payment.walletDeposit ??
        payment.overpaymentAmount ??
        calculated.walletDeposit
    );
    const changeGiven = round2(payment.changeGiven ?? (walletDeposit > 0 ? 0 : calculated.changeGiven));
    const amountRetained = round2(payment.amountRetained ?? fallbackAmountRetained);
    const paymentStatus = payment.paymentStatus ??
        (walletDeposit > 0
            ? 'OVERPAID'
            : (amountApplied >= invoiceTotalAtPosting - 0.01 ? 'PAID' : 'PARTIALLY PAID'));

    return {
        ...calculated,
        generatedAt: toIsoSafe(payment.date),
        paymentPurpose: inferBackfillPurpose(payment),
        amountApplied,
        changeGiven,
        walletDeposit,
        amountRetained,
        invoiceTotalAtPosting,
        balanceDueAfterPayment,
        paymentStatus,
        appliedInvoices: allocations.map((allocation: any) => allocation.invoiceId),
        backfilled: true,
        confidence: payment.invoiceTotal !== undefined || payment.amountApplied !== undefined ? 'exact' : 'estimated',
        narrative: payment.receiptSnapshot?.narrative,
        calculationVersion: payment.calculationVersion || 1
    };
};

async function migrateToVersion24(transaction: any) {
    const paymentStore = transaction.objectStore('customerPayments');
    await new Promise<void>((resolve, reject) => {
        const request = paymentStore.openCursor();
        request.onsuccess = (event: any) => {
            const cursor = event.target.result;
            if (cursor) {
                const payment: CustomerPayment = cursor.value;
                const hasSnapshot = !!payment.receiptSnapshot;
                const snapshot = hasSnapshot
                    ? {
                        ...payment.receiptSnapshot!,
                        backfilled: payment.receiptSnapshot?.backfilled ?? false,
                        confidence: payment.receiptSnapshot?.confidence || 'exact',
                        calculationVersion: payment.receiptSnapshot?.calculationVersion || payment.calculationVersion || 1
                    }
                    : buildBackfilledReceiptSnapshot(payment);

                const updated: CustomerPayment = {
                    ...payment,
                    receiptSnapshot: snapshot,
                    invoiceTotal: payment.invoiceTotal ?? snapshot.invoiceTotalAtPosting,
                    paymentStatus: payment.paymentStatus ?? snapshot.paymentStatus,
                    balanceDue: payment.balanceDue ?? snapshot.balanceDueAfterPayment,
                    overpaymentAmount: payment.overpaymentAmount ?? snapshot.walletDeposit,
                    walletDeposit: payment.walletDeposit ?? snapshot.walletDeposit,
                    changeGiven: payment.changeGiven ?? snapshot.changeGiven,
                    amountApplied: payment.amountApplied ?? snapshot.amountApplied,
                    amountRetained: payment.amountRetained ?? snapshot.amountRetained,
                    calculationVersion: payment.calculationVersion ?? snapshot.calculationVersion ?? 1
                };

                cursor.update(updated);
                cursor.continue();
            } else {
                resolve();
            }
        };
        request.onerror = () => reject(request.error);
    });
}

async function migrateToVersion39(transaction: any) {
    const inventoryStore = transaction.objectStore('inventory');
    await new Promise<void>((resolve, reject) => {
        const request = inventoryStore.openCursor();
        request.onsuccess = (event: any) => {
            const cursor = event.target.result;
            if (cursor) {
                const item: any = cursor.value;
                if (item.reserved === undefined) {
                    item.reserved = 0;
                    cursor.update(item);
                }
                cursor.continue();
            } else {
                resolve();
            }
        };
        request.onerror = () => reject(request.error);
    });
}

async function migrateToVersion40(transaction: any) {
    const stores = ['bomTemplates', 'boms', 'productionBoms'];
    for (const storeName of stores) {
        if (!transaction.objectStoreNames?.contains?.(storeName)) continue;
        const store = transaction.objectStore(storeName);
        await new Promise<void>((resolve, reject) => {
            const request = store.openCursor();
            request.onsuccess = (event: any) => {
                const cursor = event.target.result;
                if (cursor) {
                    const record: any = cursor.value;
                    const components = record.components || record.items || [];
                    let changed = false;
                    for (const comp of components) {
                        if (comp.quantityFormula && !comp.formula) {
                            comp.formula = comp.quantityFormula;
                            changed = true;
                        }
                    }
                    if (record.components) record.components = components;
                    if (record.items) record.items = components;
                    if (changed) cursor.update(record);
                    cursor.continue();
                } else {
                    resolve();
                }
            };
            request.onerror = () => reject(request.error);
        });
    }
}

async function migrateToVersion41(_transaction: any) {
    // Stores are already created by the upgrade handler loop above
}

export const dbService = {
    initDB,

    get source() { return DB_SOURCE; },
    set source(value: string) { DB_SOURCE = value; },

    setSyncListener(cb: (status: SyncStatus) => void) {
        onSyncStateChange = cb;
        if (isCloudOnlyMode()) {
            cb('connected');
            return;
        }
        cb(fileHandle ? 'connected' : 'idle');
    },

    /** Force simulated offline (acceptance framework): files cache + queue only. */
    setForceOffline(value: boolean): void {
        forceOffline = value;
    },

    async executeAtomicOperation<T>(stores: (keyof NexusDB)[], operation: (tx: any) => Promise<T>): Promise<T> {
        // Cloud-authoritative: delegate to cloud-aware put/get/delete when Supabase is available
        const cloudTx = {
            objectStore: (storeName: string) => ({
                put: (item: any) => this.put(storeName as keyof NexusDB, item),
                get: (id: string) => this.get(storeName as keyof NexusDB, id),
                getAll: () => this.getAll(storeName as keyof NexusDB),
                delete: (id: string) => this.delete(storeName as keyof NexusDB, id),
            }),
            done: Promise.resolve(),
        };
        return operation(cloudTx);
    },

    async connectToLocalFile(): Promise<boolean> {
        if (isCloudOnlyMode()) {
            notifySyncState('restricted');
            return false;
        }
        if (!('showSaveFilePicker' in window)) {
            alert("WebUSB/WebFS restricted. Local backup service disabled.");
            return false;
        }
        
        // Extract company name for file naming
        let companyName = 'PrimeBOOKS';
        try {
            const configStr = localStorage.getItem('nexus_company_config');
            if (configStr) {
                const config = JSON.parse(configStr);
                if (config.companyName) {
                    companyName = config.companyName.replace(/[^a-zA-Z0-9_\-]/g, '_');
                }
            }
        } catch (e) {
            // Ignore parse errors, fallback to default
        }

        try {
            fileHandle = await (window as Window & { showSaveFilePicker(options?: { suggestedName?: string; types?: Array<{ description?: string; accept: Record<string, string | string[]> }> }): Promise<FileSystemFileHandle> }).showSaveFilePicker({
                suggestedName: `${companyName}_Vault_${new Date().toISOString().split('T')[0]}.db`,
                types: [{ description: 'ERP Backup', accept: { 'application/octet-stream': ['.db'] } }],
            });
            notifySyncState('connected');
            await this.triggerSync(true);
            return true;
        } catch (error: any) {
            logger.error("Sync connection cancelled", error);
            notifySyncState('restricted');
            return false;
        }
    },

    async triggerSync(immediate: boolean = false) {
        if (isCloudOnlyMode()) return;
        if (!fileHandle) return;
        if (saveTimer) clearTimeout(saveTimer);

        const delay = immediate ? 0 : 5000;
        notifySyncState('syncing');

        saveTimer = setTimeout(async () => {
            if (isSaving) {
                this.triggerSync();
                return;
            }

            isSaving = true;
            try {
                const blob = await this.exportDatabase();
                const writable = await (fileHandle as FileSystemFileHandle).createWritable();
                await writable.write(blob);
                await writable.close();
                notifySyncState('connected');
                localStorage.setItem('nexus_last_sync', new Date().toISOString());
            } catch (err) {
                logger.error("Auto-sync failed:", err);
                notifySyncState('error');
            } finally {
                isSaving = false;
            }
        }, delay);
    },

    async getAll<T>(storeName: keyof NexusDB): Promise<T[]> {
        // Local-first: read from IndexedDB immediately
        // Filter out soft-deleted (tombstoned) records so callers never see
        // records that have been deleted locally or via the sync gateway.
        try {
            const localValues = (await getAllFromLegacyStore<T>(storeName)).filter(
                (item: any) => !item?.deletedAt
            );
            if (localValues.length > 0) {
                if (storeName === 'customers') {
                    audit('read', 'dbservice.getAll customers', { count: localValues.length });
                }
                return localValues;
            }
        } catch { /* fall through */ }

        const all = (await getAllFromLegacyStore<T>(storeName)).filter(
            (item: any) => !item?.deletedAt
        );
        if (storeName === 'customers') {
            audit('read', 'dbservice.getAll customers (fallback)', { count: all.length });
        }
        return all;
    },

    async get<T>(storeName: keyof NexusDB, id: string): Promise<T | undefined> {
        return getFromLegacyStore<T>(storeName, id);
    },

    async put<T>(storeName: keyof NexusDB, item: T, options: PutOptions = {}): Promise<string> {
        const raw = { ...((item as Record<string, unknown>) || {}) };
        const isCloudSource = options.cloudSource === true || raw._cloudSource === true;

        console.log(`[SYNC-FORENSIC] STAGE-1 db.put() called`, {
            storeName,
            id: raw.id,
            isCloudSource,
            hasName: !!(raw.name || raw.customerName || raw.productName),
        });

        if (isCloudSource) {
            const preservedUpdatedAt = raw.serverUpdatedAt ?? raw.updated_at ?? raw._updatedAt;
            if (typeof preservedUpdatedAt === 'string' && preservedUpdatedAt.trim()) {
                raw._updatedAt = preservedUpdatedAt;
            }
        } else {
            raw._updatedAt = new Date().toISOString();
        }

        delete raw._cloudSource;

        // New records without an explicit id get a globally-unique
        // client-generated ULID so offline writes can never collide across
        // devices. Existing ids are always preserved.
        if (!raw.id) {
            raw.id = newId();
        }

        const itemId = String(raw.id ?? '');

        // Local-first: always write to IndexedDB, return immediately
        const localResultId = await putToLegacyStore(storeName, raw as T);

        // Background sync: fire-and-forget queue to cloud
        const isLocalOnly = LOCAL_ONLY_STORES.has(String(storeName));
        if (!isLocalOnly && itemId && !isCloudSource) {
            try {
                const table = getCloudTable(String(storeName));
                console.log(`[SYNC-FORENSIC] STAGE-2 enqueue() triggered`, {
                    storeName,
                    cloudTable: table,
                    recordId: itemId,
                    operation: 'upsert',
                    isLocalOnly,
                });
                durableSyncQueue.enqueue({
                    table,
                    recordId: itemId,
                    operation: 'upsert',
                    payload: raw,
                }).catch((enqueueErr) => {
                    console.error(`[SYNC-FORENSIC] STAGE-2 ENQUEUE FAILED`, {
                        storeName, recordId: itemId, error: enqueueErr?.message || enqueueErr,
                    });
                });
                backgroundSyncService.trigger();
            } catch (syncErr) {
                console.error(`[SYNC-FORENSIC] STAGE-2 TRIGGER FAILED`, {
                    storeName, recordId: itemId, error: syncErr?.message || syncErr,
                });
            }
        } else {
            console.log(`[SYNC-FORENSIC] STAGE-2 SKIPPED sync enqueue`, {
                storeName, recordId: itemId, isLocalOnly, isCloudSource,
            });
        }

        this.triggerSync();
        emitDataChange([String(storeName)]);
        return localResultId;
    },

    async bulkPut<T>(storeName: keyof NexusDB, items: T[]): Promise<void> {
      if (items.length === 0) return;
      // Skip cloud writes — bulkPut is for syncing cloud data into local cache
      await withDbRecovery(async (db) => {
        if (!db?.objectStoreNames?.contains?.(storeName as any)) return;
        const tx = db.transaction(storeName as any, 'readwrite');
        const store = tx.objectStore(storeName as any);
        for (const item of items) {
          const raw = { ...((item as Record<string, unknown>) || {}) };
          const preservedUpdatedAt = raw.serverUpdatedAt ?? raw.updated_at ?? raw._updatedAt;
          if (typeof preservedUpdatedAt === 'string' && preservedUpdatedAt.trim()) {
            raw._updatedAt = preservedUpdatedAt;
          } else {
            raw._updatedAt = new Date().toISOString();
          }
          delete raw._cloudSource;
          store.put(raw as T);
        }
        await tx.done;
        emitDataChange([String(storeName)]);
      });
    },

    async getSetting<T>(key: string): Promise<T | undefined> {
        try {
            const record = await getFromLegacyStore<any>('settings', key);
            if (record && record.value !== undefined) {
                return record.value as T;
            }
            if (record && typeof record === 'object' && !('value' in record)) {
                return record as T;
            }
            const local = localStorage.getItem(key);
            if (local !== null) {
                try {
                    return JSON.parse(local) as T;
                } catch {
                    return local as unknown as T;
                }
            }
            return undefined;
        } catch (err) {
            console.warn(`[DB] Local getSetting error for ${key}:`, err);
            return undefined;
        }
    },

    async saveSetting<T>(key: string, value: T): Promise<void> {
        try {
            const record = { id: key, key, value, _updatedAt: new Date().toISOString() };
            await this.put('settings', record);
            try {
                const serialized = typeof value === 'string' ? value : JSON.stringify(value);
                localStorage.setItem(key, serialized);
            } catch {
                // Ignore localStorage quota errors
            }
        } catch (err) {
            console.warn(`[DB] Local saveSetting error for ${key}:`, err);
        }
        this.triggerSync();
        emitDataChange(['settings']);
    },

    async factoryReset() {
        if (isCloudOnlyMode()) {
            try {
                sessionStorage.clear();
            } catch {
                // Ignore session storage cleanup failures.
            }
            return;
        }

        const db = await initDB();
        db.close();
        dbPromise = null;

        const [productionModule, examinationModule, offlineModule] = await Promise.all([
            import('./productionDb'),
            import('./examinationDb'),
            import('./offlineDb')
        ]);

        await offlineModule.closeOfflineDbConnection?.();

        await Promise.all(LEGACY_DATABASE_NAMES.map((name) => deleteDB(name).catch(() => undefined)));
        await durableSyncQueue.destroy().catch(() => undefined);

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

        dbPromise = null;
    },

    async delete(storeName: keyof NexusDB, id: string, options: DeleteOptions = {}): Promise<void> {
        // Local-first: soft delete in IndexedDB immediately
        const existing = await getFromLegacyStore<any>(storeName, id);
        if (existing) {
            existing._updatedAt = new Date().toISOString();
            existing.deletedAt = existing.deletedAt || new Date().toISOString();
            await putToLegacyStore(storeName, existing);
        } else {
            await deleteFromLegacyStore(storeName, id);
        }

        // Background sync: queue delete to cloud
        const isCloudSource = options.cloudSource === true;
        const isLocalOnly = LOCAL_ONLY_STORES.has(String(storeName));
        if (!isLocalOnly && id && !isCloudSource) {
            try {
                const table = getCloudTable(String(storeName));
                durableSyncQueue.enqueue({
                    table,
                    recordId: id,
                    operation: 'delete',
                    payload: { id },
                }).catch((enqueueErr) => {
                    console.warn(`[Sync] Delete enqueue failed for ${storeName}/${id}:`, enqueueErr);
                });
                backgroundSyncService.trigger();
            } catch (syncErr) {
                console.warn(`[Sync] Background sync trigger failed for delete ${storeName}/${id}:`, syncErr);
            }
        }

        this.triggerSync();
        emitDataChange([String(storeName)]);
    },

    /**
     * Permanently remove a record from IndexedDB (hard delete).
     * Used by the background sync engine to clean up tombstoned records
     * after the delete has been confirmed by the cloud.
     */
    async hardDelete(storeName: keyof NexusDB, id: string): Promise<void> {
        await deleteFromLegacyStore(storeName, id);
        emitDataChange([String(storeName)]);
    },

    async saveFile(file: File): Promise<string> {
        const id = `FILE-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

        // Cloud-authoritative: upload to Supabase Storage first. When the
        // acceptance framework forces offline, skip the cloud attempt and go
        // straight to the local cache + queue.
        if (!forceOffline) {
            try {
                const fileId = await cloudDb.uploadFile(file);
                if (fileId) {
                    // Hydrate local cache for offline availability
                    try {
                        await withDbRecovery(async (db) => {
                            await db.put('files', {
                                id: fileId,
                                blob: file,
                                name: file.name,
                                type: file.type,
                                created: new Date().toISOString()
                            });
                        });
                    } catch { /* cache best-effort */ }
                    return fileId;
                }
            } catch (err) {
                console.warn(`[DB] File upload failed for ${file.name}, queueing for retry:`, err);
            }
        }

        // Offline fallback: cache locally and queue for upload
        await withDbRecovery(async (db) => {
            await db.put('files', {
                id,
                blob: file,
                name: file.name,
                type: file.type,
                created: new Date().toISOString()
            });
        });

        try {
            await durableSyncQueue.enqueue({
                table: '_files',
                recordId: id,
                operation: 'upsert',
                payload: { id, name: file.name, type: file.type },
                fileRef: id,
            });
            backgroundSyncService.trigger();
        } catch (qErr) {
            console.warn('[DB] Failed to queue file upload:', qErr);
        }

        return id;
    },

    async getFile(id: string): Promise<string | null> {
        // Try cloud first when in cloud mode
        if (shouldUseCloud()) {
            try {
                const url = await cloudDb.createSignedFileUrl(id);
                if (url) return url;
            } catch {
                // Fall through to local cache
            }
        }

        return withDbRecovery(async (db) => {
            const fileRecord = await db.get('files', id);
            if (!fileRecord) return null;
            return URL.createObjectURL(fileRecord.blob);
        });
    },

    async getFileBlob(id: string): Promise<Blob | null> {
        // Try cloud first when in cloud mode
        if (shouldUseCloud()) {
            try {
                const blob = await cloudDb.downloadFile(id);
                if (blob) return blob;
            } catch {
                // Fall through to local cache
            }
        }

        return withDbRecovery(async (db) => {
            const fileRecord = await db.get('files', id);
            return fileRecord?.blob || null;
        });
    },

    async downloadBackupManual() {
        if (isCloudOnlyMode()) {
            throw new Error('Manual local database backups are disabled in cloud-only mode. Use Supabase backups and exports.');
        }

        const blob = await this.exportDatabase();
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        
        // Extract company name for file naming
        let companyName = 'PrimeBOOKS';
        try {
            const configStr = localStorage.getItem('nexus_company_config');
            if (configStr) {
                const config = JSON.parse(configStr);
                if (config.companyName) {
                    companyName = config.companyName.replace(/[^a-zA-Z0-9_\-]/g, '_');
                }
            }
        } catch (e) {
            // Ignore parse errors, fallback to default
        }

        link.download = `${companyName}_Manual_Backup_${new Date().toISOString().split('T')[0]}.db`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        localStorage.setItem('prime_erp_backup_date', new Date().toISOString());
    },

    async exportDatabase(): Promise<Blob> {
        if (isCloudOnlyMode()) {
            throw new Error('Local database export is disabled in cloud-only mode.');
        }

        const exportData: any = {
            meta: { version: DB_VERSION, date: new Date().toISOString(), app: 'Prime ERP' },
            data: {},
            settings: {}
        };

        for (const store of STORE_NAMES) {
            exportData.data[store] = await this.getAll(store as keyof NexusDB);
        }

        // Export all local storage settings dynamically to ensure nothing is missed
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key) {
                const val = localStorage.getItem(key);
                if (val !== null && val !== undefined) {
                    exportData.settings[key] = val;
                }
            }
        }

        return new Blob([JSON.stringify(exportData)], { type: 'application/octet-stream' });
    },

    async importDatabase(jsonData: string): Promise<void> {
        if (isCloudOnlyMode()) {
            throw new Error('Local database restore is disabled in cloud-only mode. Import data through Supabase migration tools.');
        }

        const db = await initDB();
        const parsed = JSON.parse(jsonData);

        const tx = db.transaction(db.objectStoreNames as any, 'readwrite');
        for (const store of STORE_NAMES) {
            if (!db.objectStoreNames.contains(store as any)) continue;
            const objectStore = tx.objectStore(store as any);
            await objectStore.clear();
            const items = parsed.data[store];
            if (Array.isArray(items)) {
                for (const item of items) {
                    await objectStore.put(item);
                }
            }
        }
        await tx.done;

        // Preserve current auth state before clearing localStorage
        const currentAuth = localStorage.getItem('prime-erp-supabase-auth');
        const currentUserId = localStorage.getItem('prime_user_id');

        try {
            localStorage.clear();
        } catch {
            // Ignore local storage clear failures and continue restoring known keys.
        }

        // Restore critical identity keys that must not be overwritten by backup
        if (currentAuth) localStorage.setItem('prime-erp-supabase-auth', currentAuth);
        if (currentUserId) localStorage.setItem('prime_user_id', currentUserId);

        if (parsed.settings && typeof parsed.settings === 'object') {
            Object.entries(parsed.settings).forEach(([key, value]) => {
                if (typeof value === 'string') {
                    // Skip identity keys that must not be overwritten
                    if (['prime-erp-supabase-auth', 'prime_user_id'].includes(key)) return;
                    localStorage.setItem(key, value);
                }
            });
        }

        localStorage.setItem('prime_erp_backup_date', new Date().toISOString());
    },

    async checkIntegrity(): Promise<{ healthy: boolean; issues: string[] }> {
        const issues: string[] = [];

        try {
            const db = await initDB();
            STORE_NAMES.forEach(store => {
                if (!db.objectStoreNames.contains(store as any)) {
                    issues.push(`Missing object store: ${store} `);
                }
            });
        } catch (error) {
            issues.push(`IndexedDB diagnostics unavailable: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }

        return {
            healthy: issues.length === 0,
            issues
        };
    },

    async performAutoBackup() {
        if (isCloudOnlyMode()) return;

        try {
            const blob = await this.exportDatabase();
            // In a real browser environment, we might save to IndexedDB or a specific "backups" store
            // For this offline-first app, we'll keep a copy in a special 'backups' store if it exists
            // or just log that it's ready.
            localStorage.setItem('prime_erp_backup_date', new Date().toISOString());
            // Auto-backup generated
        } catch (err) {
            logger.error("[DB] Auto-backup failed:", err);
        }
    }
};
