import { BaseRepository } from './baseRepository';
import { InventoryRepository, inventoryRepository } from './inventoryRepository';
import { CustomerRepository, customerRepository } from './customerRepository';
import { SettingsRepository, settingsRepository } from './settingsRepository';
import { FinancialYearRepository, financialYearRepository } from './financialYearRepository';

export { BaseRepository } from './baseRepository';
export { InventoryRepository, inventoryRepository } from './inventoryRepository';
export { CustomerRepository, customerRepository } from './customerRepository';
export { SettingsRepository, settingsRepository } from './settingsRepository';
export { FinancialYearRepository, financialYearRepository } from './financialYearRepository';

const STORE_TO_TABLE: Record<string, string> = {
  inventory: 'products',
  customers: 'customers',
  suppliers: 'suppliers',
  sales: 'sales',
  salesOrders: 'sales_orders',
  quotations: 'quotations',
  jobOrders: 'job_orders',
  purchases: 'purchases',
  purchaseOrders: 'purchase_orders',
  goodsReceipts: 'goods_receipts',
  orders: 'orders',
  invoices: 'invoices',
  expenses: 'expenses',
  income: 'income',
  ledger: 'ledger_entries',
  accounts: 'accounts',
  budgets: 'budgets',
  transfers: 'transfers',
  users: 'users',
  userGroups: 'user_groups',
  warehouses: 'warehouses',
  employees: 'employees',
  payrollRuns: 'payroll_runs',
  payslips: 'payslips',
  cheques: 'cheques',
  customerPayments: 'customer_payments',
  supplierPayments: 'supplier_payments',
  vatTransactions: 'vat_transactions',
  vatReturns: 'vat_returns',
  settings: 'settings',
  notifications: 'notifications',
  auditLogs: 'audit_logs',
  productionBatches: 'production_batches',
  batches: 'production_batches',
  workOrders: 'work_orders',
  workCenters: 'work_centers',
  productionResources: 'production_resources',
  resources: 'production_resources',
  resourceAllocations: 'resource_allocations',
  materialReservations: 'material_reservations',
  materialBatches: 'material_batches',
  bomTemplates: 'bom_templates',
  boms: 'boms',
  maintenanceLogs: 'maintenance_logs',
  bankAccounts: 'bank_accounts',
  bankTransactions: 'bank_transactions',
  bankStatements: 'bank_statements',
  scheduledPayments: 'scheduled_payments',
  bankScheduledPayments: 'bank_scheduled_payments',
  bankExchangeRates: 'bank_exchange_rates',
  bankFees: 'bank_fees',
  bankReconciliations: 'bank_reconciliations',
  bankAdjustments: 'bank_adjustments',
  bankCashFlowForecasts: 'bank_cash_flow_forecasts',
  bankAlerts: 'bank_alerts',
  bankCategories: 'bank_categories',
  walletTransactions: 'wallet_transactions',
  recurringInvoices: 'recurring_invoices',
  deliveryNotes: 'delivery_notes',
  shipments: 'shipments',
  salesExchanges: 'sales_exchanges',
  salesExchangeItems: 'sales_exchange_items',
  salesExchangeApprovals: 'sales_exchange_approvals',
  reprintJobs: 'reprint_jobs',
  subcontractOrders: 'subcontract_orders',
  examJobs: 'exam_jobs',
  examPapers: 'exam_papers',
  examPrintingBatches: 'examination_printing_batches',
  examinationBatches: 'examination_batches',
  examinationJobs: 'examination_jobs',
  examinationJobSubjects: 'examination_job_subjects',
  examinationPapers: 'examination_papers',
  examinationInvoiceGroups: 'examination_invoice_groups',
  examinationRecurringProfiles: 'examination_recurring_profiles',
  examinationInventoryDeductions: 'examination_inventory_deductions',
  examinationBatchNotifications: 'examination_batch_notifications',
  notificationAuditLogs: 'notification_audit_logs',
  schools: 'schools',
  classes: 'school_classes',
  subjects: 'school_subjects',
  jobTickets: 'job_tickets',
  jobTicketSettings: 'job_ticket_settings',
  smsCampaigns: 'sms_campaigns',
  smsTemplates: 'sms_templates',
  subscribers: 'subscribers',
  whatsappChats: 'whatsapp_chats',
  whatsappTemplates: 'whatsapp_templates',
  whatsappCampaigns: 'whatsapp_campaigns',
  whatsappAutomations: 'whatsapp_automations',
  marketAdjustments: 'market_adjustments',
  marketAdjustmentTransactions: 'market_adjustment_transactions',
  profitMarginSettings: 'profit_margin_settings',
  materialCategories: 'material_categories',
  warehouseInventory: 'warehouse_inventory',
  inventoryTransactions: 'inventory_transactions',
  roundingLogs: 'rounding_logs',
  financialYears: 'financial_years',
  userPreferences: 'user_preferences',
  companyConfig: 'company_config',
  tasks: 'tasks',
  customerNotificationLogs: 'customer_notification_logs',
  productAttributes: 'product_attributes',
  referrals: 'customer_referrals',
  referralCampaigns: 'referral_campaigns',
  referralRewards: 'referral_rewards',
  referralAnalytics: 'referral_analytics',
  referralSettings: 'referral_settings',
  referralAuditLogs: 'referral_audit_logs',
  referralReversals: 'referral_reversals',
  referralTimeline: 'referral_timeline',
  referralEventHistory: 'referral_event_history',
  engagementTimeline: 'engagement_timeline',
  engagementAudit: 'engagement_audit',
  engagementPoints: 'engagement_points',
  engagementPointBalances: 'engagement_point_balances',
  engagementCashback: 'engagement_cashback',
  engagementMembershipTiers: 'engagement_membership_tiers',
  engagementTiers: 'engagement_membership_tiers',
  engagementCustomerTiers: 'engagement_customer_tiers',
  engagementGiftCards: 'engagement_gift_cards',
  engagementGiftCardTransactions: 'engagement_gift_card_transactions',
  engagementAffiliates: 'engagement_affiliates',
  engagementAffiliateCommissions: 'engagement_affiliate_commissions',
  engagementPromotions: 'engagement_promotions',
  engagementCustomerRewards: 'engagement_customer_rewards',
  engagementAnalytics: 'engagement_analytics',
  taxRates: 'tax_rates',
  discountRules: 'discount_rules',
  customerPricingTiers: 'customer_pricing_tiers',
  idempotencyKeys: 'idempotency_keys',
};

const repoCache = new Map<string, BaseRepository<any>>();

export function getRepository(storeName: string): BaseRepository<any> {
  if (storeName === 'inventory') return inventoryRepository;
  if (storeName === 'customers') return customerRepository;
  if (storeName === 'settings') return settingsRepository;
  if (storeName === 'financialYears') return financialYearRepository;
  if (!repoCache.has(storeName)) {
    const syncTable = STORE_TO_TABLE[storeName] || storeName;
    repoCache.set(storeName, new BaseRepository<any>(storeName, syncTable));
  }
  return repoCache.get(storeName)!;
}

export function getAllStoreNames(): string[] {
  return Object.keys(STORE_TO_TABLE);
}

const syncDisabledStores = new Set<string>();

export function disableSyncForStore(storeName: string): void {
  syncDisabledStores.add(storeName);
}

export function enableSyncForStore(storeName: string): void {
  syncDisabledStores.delete(storeName);
}

export function isSyncEnabledForStore(storeName: string): boolean {
  return !syncDisabledStores.has(storeName);
}