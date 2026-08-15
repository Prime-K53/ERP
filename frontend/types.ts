import type { ProviderName } from './services/ai/types';
export type {
  ProductType, ServiceCostMethod, ServiceResourceType, ServiceResource,
  ServiceRecipeLine, ServiceRecipe,
  ServiceJobStatus, ServiceJobPriority, ServiceJob,
  ServiceConsumptionRecord, CapacitySnapshot, ServiceMetrics,
  ServicePricingSnapshot, ServiceMaterialConsumption, MaterialState,
  ServiceLaborEntry, ServiceMachineEntry, ServiceExecutionSnapshot
} from './types/service';
export type {
  InventoryRole, ResourceSubtype, CostingMethod,
  UnitConversionFactor, PurchaseLot
} from './types/inventory';
export type {
  Referral, ReferralCommission,
  ReferralTransaction, ReferralSettings, ReferralLog
} from './types/referral';

export interface AppearanceConfig {
  theme: 'Light' | 'Dark' | 'System';
  density: 'Compact' | 'Comfortable' | 'Spacious';
  glassmorphism: boolean;
  borderRadius: 'Small' | 'Medium' | 'Large';
  enableAnimations: boolean;
  sidebarStyle?: 'Full' | 'Compact' | 'Minimal' | 'Classic';
}

export interface NumberingRule {
  prefix: string;
  padding: number;
  extension?: string;
  startNumber: number;
  currentNumber?: number;
  suffix?: string;
  resetInterval?: 'Never' | 'Daily' | 'Monthly' | 'Yearly';
}



export interface TransactionSettingsConfig {
  // Basic transaction controls
  allowBackdating: boolean;
  backdatingLimitDays: number;
  allowFutureDating: boolean;
  allowPartialFulfillment: boolean;
  voidingWindowHours: number;
  enforceCreditLimit: 'None' | 'Warning' | 'Strict';
  defaultPaymentTermsDays: number;
  quotationExpiryDays: number;
  autoPrintReceipt: boolean;
  showReceiptPreview?: boolean;
  quickItemEntry: boolean;
  defaultPOSWarehouse: string;
  posDefaultCustomer: string;

  // POS specific settings
  pos: {
    showItemImages: boolean;
    enableShortcuts: boolean;
    allowReturns: boolean;
    allowDiscounts: boolean;
    gridColumns: number;
    showCategoryFilters: boolean;
    photocopyPrice: number;
    photocopyCostPerPage: number;
    typePrintingPrice: number;
    typePrintingCostPerPage: number;
    staplePrice: number;
    receiptFooter: string;
    requireCustomer: boolean;
    defaultPaymentMethod: string;
    showShortcutHints: boolean;
    shortcutLabels: {
      F1: string;
      F2: string;
      F3: string;
      F10: string;
    };
    paymentDetails?: {
      bankAccounts: Array<{
        id: string;
        bankName: string;
        accountName: string;
        accountNumber: string;
        branchCode?: string;
      }>;
      mobileMoneyAccounts: Array<{
        id: string;
        network: string;
        accountName: string;
        phoneNumber: string;
      }>;
    };
  };
  
  // Company payment details for banking and documents
  paymentDetails: {
    bankAccounts: Array<{
      id: string;
      bankName: string;
      accountName: string;
      accountNumber: string;
      branchCode?: string;
    }>;
    mobileMoneyAccounts: Array<{
      id: string;
      network: string;
      accountName: string;
      phoneNumber: string;
    }>;
  };

  // Numbering rules (dynamic by transaction type)
  numbering: Record<string, NumberingRule>;

  // Approval thresholds (dynamic by transaction type)
  approvalThresholds: Record<string, number>;
}

export interface IntegrationSettingsConfig {
  externalApis: Array<{
    id?: string;
    name?: string;
    baseUrl: string;
    apiKey: string;
    enabled: boolean;
  }>;
  webhooks: Array<{
    id: string;
    url: string;
    events: string[];
    enabled: boolean;
  }>;
}

export interface InvoiceTemplatesConfig {
  engine: 'Standard' | 'Advanced' | 'Custom' | 'Classic' | 'Modern' | 'Professional' | 'Clean';
  accentColor: string;
  companyNameFontSize: number;
  bodyFontSize?: number;
  fontFamily?: 'Helvetica' | 'Courier' | 'Times-Roman' | 'Comic Sans MS';
  logoWidth?: number;
  showCompanyLogo?: boolean;
  showPaymentTerms?: boolean;
  showDueDate?: boolean;
  showOutstandingAndWalletBalances?: boolean;
  showAccountSummary?: boolean;
  [key: string]: any; // Dynamic boolean flags for template options
}

export interface GLMappingConfig {
  [key: string]: string; // Dynamic mapping of accounts
}

export interface ProductionSettingsConfig {
  autoConsumeMaterials: boolean;
  requireQAApproval: boolean;
  trackMachineDownTime: boolean;
  defaultWorkCenterId: string;
  defaultExamBomId: string;
  allowOverproduction: boolean;
  showKioskSummary: boolean;
  paperId?: string;
  tonerId?: string;
  laborCostPerHour?: number;
  baseMargin?: number;
}

export interface InventorySettingsConfig {
  valuationMethod: 'FIFO' | 'LIFO' | 'WeightedAverage' | 'StandardCost' | 'AVCO';
  allowNegativeStock: boolean;
  autoBarcode: boolean;
  trackBatches: boolean;
  defaultWarehouseId: string;
  trackSerialNumbers: boolean;
  lowStockAlerts: boolean;
}

export interface CloudSyncConfig {
  enabled: boolean;
  apiUrl: string;
  apiKey: string;
  autoSyncEnabled: boolean;
  syncIntervalMinutes: number;
  lastSyncTimestamp?: string;
}

export interface SecuritySettingsConfig {
  sessionTimeoutMinutes: number;
  forcePasswordChangeDays: number;
  requireTwoFactor: boolean;
  auditLogLevel: 'Minimal' | 'Standard' | 'Detailed' | 'Full';
  lockoutAttempts: number;
  passwordProtectionEnabled?: boolean;
  enforcePasswordComplexity?: boolean;
  mfaSecret?: string;
}

export interface VATConfig {
  enabled: boolean;
  rate: number;
  registrationNumber?: string;
  defaultTaxCategory?: string;
  outputTaxAccount?: string;
  inputTaxAccount?: string;
  marketAdjustmentAccount?: string;
  filingFrequency: 'Monthly' | 'Quarterly' | 'Annually';
  pricingMode: 'VAT' | 'MarketAdjustment';
}

export interface RoundingRulesConfig {
  method: 'Nearest' | 'Up' | 'Down' | 'Truncate';
  precision: number;
}

export interface CompanyConfig {
  // Basic company info
  companyName: string;
  tagline?: string;
  email: string;
  phone: string;
  addressLine1: string;
  city?: string;
  country?: string;
  currencySymbol: string;
  dateFormat: string;
  logo?: string;
  logoBase64?: string;
  signature?: string;
  signatureBase64?: string;
  footer?: string;
  showCompanyLogo?: boolean;

  // Configuration sections
  appearance: AppearanceConfig;
  transactionSettings: TransactionSettingsConfig;
  integrationSettings: IntegrationSettingsConfig;
  invoiceTemplates: InvoiceTemplatesConfig;
  glMapping: GLMappingConfig;
  productionSettings: ProductionSettingsConfig;
  inventorySettings: InventorySettingsConfig;
  cloudSync: CloudSyncConfig;
  securitySettings: SecuritySettingsConfig;
  security?: {
    passwordRequired?: boolean;
    enforceComplexity?: boolean;
  };
  vat: VATConfig;
  roundingRules: RoundingRulesConfig;
  notificationSettings: {
    customerActivityNotifications?: boolean;
    smsGatewayEnabled?: boolean;
    emailGatewayEnabled?: boolean;
    dailySummaryEnabled?: boolean;
    dailySummaryTime?: string;
    dailySummaryEmail?: string;
    emailEnabled?: boolean;
    smsEnabled?: boolean;
    systemAlertsEnabled?: boolean;
    lowStockThreshold?: number;
    largeTransactionThreshold?: number;
    [key: string]: any;
  };
  lateFeePolicy: LateFeePolicy;
  registrationNumber?: string;
  defaultTaxCategory?: string;
  outputTaxAccount?: string;
  inputTaxAccount?: string;
  marketAdjustmentAccount?: string;
  monthlyRevenueTarget?: number;

  // Dynamic module enablement
  enabledModules: Record<string, boolean>;
  notificationTemplates?: Array<{
    id: string;
    enabled: boolean;
    subjectTemplate: string;
    bodyTemplate: string;
    [key: string]: any;
  }>;
  taxRate?: number;
  enableTax?: boolean;
  receiptFooter?: string;

  // Backup configuration
  backupFrequency: 'Daily' | 'Weekly' | 'Monthly' | 'Never';
  backupSettings?: {
    autoBackupEnabled: boolean;
    backupFrequency: 'Daily' | 'Weekly' | 'Monthly';
    retentionCount: number;
    cloudBackupEnabled: boolean;
  };

  // AI configuration
  aiConfig?: {
    provider: ProviderName;
    baseUrl: string;
    apiKey: string;
    model: string;
    openrouterApiKey: string;
    openrouterModel: string;
    geminiApiKey: string;
    geminiModel: string;
    customEndpoint: string;
  };

  // Pricing settings (from Phase 0-1)
  pricingSettings?: {
    roundingMethod?: string;
    defaultMarkup?: number;
    categoryOverrides?: Array<{
      category: string;
      markup: number;
      roundingMethod?: string;
    }>;
    seasonalAdjustments?: Array<{
      startDate: string;
      endDate: string;
      adjustmentPercent: number;
      categories?: string[];
    }>;
    [key: string]: any;
  };
  referralSettings?: import('./types/referral').ReferralSettings;
  engagementSettings?: import('./types/engagement').EngagementSettings;
}

export interface SalesOrderItem {
  id: string;
  productId: string;
  description?: string;
  quantity: number;
  unitPrice: number;
  discount?: number;
  lineTotal?: number;
}

export interface SalesOrder {
  id: string;
  quotationId?: string | null;
  customerId?: string | null;
  salesPersonId?: string | null;
  territoryId?: string | null;
  orderDate: string;
  deliveryDate?: string | null;
  status: 'Draft' | 'Confirmed' | 'Processing' | 'Cancelled' | 'Fulfilled';
  items: SalesOrderItem[];
  subtotal: number;
  discounts: number;
  tax: number;
  total: number;
  notes?: string;
}

// Examination Batch Notification Types
export type NotificationType = 'BATCH_CREATED' | 'BATCH_CALCULATED' | 'BATCH_APPROVED' | 'BATCH_INVOICED' | 'DEADLINE_REMINDER';
export type NotificationPriority = 'Low' | 'Medium' | 'High' | 'Urgent';

export interface ExaminationBatchNotification {
  id: string;
  batch_id: string;
  user_id: string;
  notification_type: NotificationType;
  title: string;
  message: string;
  priority: NotificationPriority;
  batch_details: {
    batchId: string;
    batchName: string;
    examinationDate: string;
    numberOfStudents: number;
    schoolName?: string;
    academicYear?: string;
    term?: string;
    examType?: string;
    totalAmount?: number;
    status?: string;
  };
  is_read: boolean;
  read_at: string | null;
  delivered_at: string;
  created_at: string;
  expires_at?: string;
}

export interface NotificationAuditLog {
  id: string;
  notification_id: string | null;
  user_id: string;
  action: 'CREATED' | 'DELIVERED' | 'READ' | 'DISMISSED' | 'EXPIRED' | 'FAILED';
  details_json: Record<string, unknown>;
  ip_address?: string;
  user_agent?: string;
  created_at: string;
}


// ============================================
// PRINT JOB TICKET TYPES - For Printing Services
// ============================================

export type JobTicketType = 'Photocopy' | 'Printing' | 'Binding' | 'Scan' | 'Lamination' | 'Other';
export type JobTicketPriority = 'Normal' | 'Rush' | 'Express' | 'Urgent';
export type JobTicketStatus = 'Received' | 'Processing' | 'Ready' | 'Delivered' | 'Cancelled';

export interface JobTicketFinishing {
  staple?: boolean;
  fold?: boolean;
  collate?: boolean;
  trim?: boolean;
  punch?: boolean;
  bindingType?: 'None' | 'Spiral' | 'Perfect' | 'Wire' | 'Tape';
  lamination?: boolean;
}

export interface JobTicket {
  id: string;
  ticketNumber: string;
  type: JobTicketType;
  customerId?: string;
  customerName: string;
  customerPhone?: string;
  customerEmail?: string;
  description: string;
  quantity: number;
  priority: JobTicketPriority;
  status: JobTicketStatus;
  paperSize?: 'A4' | 'A3' | 'A5' | 'Legal' | 'Letter' | 'Custom';
  paperType?: string;
  colorMode?: 'BlackWhite' | 'Color';
  sides?: 'Single' | 'Double';
  finishing: JobTicketFinishing;
  unitPrice: number;
  rushFee: number;
  finishingCost: number;
  discount: number;
  subtotal: number;
  tax: number;
  total: number;
  dateReceived: string;
  dueDate?: string;
  dueTime?: string;
  expectedCompletionDate?: string;
  expectedCompletionTime?: string;
  completedAt?: string;
  deliveredAt?: string;
  operatorId?: string;
  operatorName?: string;
  machineId?: string;
  machineName?: string;
  progressPercent: number;
  attachments?: Array<{ id: string; name: string; url: string; fileId?: string; type: string; size: number }>;
  notes?: string;
  internalNotes?: string;
  sourceType?: 'quotation' | 'examination_batch' | 'order' | 'manual';
  sourceId?: string;
  linkedWorkOrderId?: string;
  batchReference?: string;
  createdBy?: string;
  createdAt: string;
  updatedBy?: string;
  updatedAt?: string;
}


export interface JobTicketSettings {
  defaultRushFeePercent: number;
  expressFeePercent: number;
  urgentFeePercent: number;
  enableNotifications: boolean;
  notifyOnReceived: boolean;
  notifyOnReady: boolean;
  notifyOnDelivered: boolean;
}

export interface AuditLogEntry {
  id: string;
  date: string;
  action: string;
  entityType: string;
  entityId: string;
  details: string;
  userId: string;
  userRole: string;
  oldValue?: unknown;
  newValue?: Record<string, unknown>;
  reason?: string;
  correlationId?: string;
}
export type ExamInvoiceClassSummary = any; // TIER 2: Added as any due to missing definitions
export type ItemType = 'Raw Material' | 'Service' | 'Product' | 'Stationery' | 'Material';

export interface Item {
  id: string;
  name: string;
  sku: string;
  barcode?: string;
  type: ItemType;
  category?: string;
  description?: string;
  unit?: string;
  cost: number;
  cost_price?: number;
  marginPercent?: number;
  price: number;
  selling_price?: number;
  calculated_price?: number;
  rounding_adjustment?: number;
  stock: number;
  minStockLevel?: number;
  reorderPoint?: number;
  minOrderQty?: number;
  leadTimeDays?: number;
  binLocation?: string;
  preferredSupplierId?: string;
  isLargeFormat?: boolean;
  rollWidth?: number;
  rollLength?: number;
  pages?: number;
  /** @deprecated Migrate to VariantUnit + UnitConversion per variant */
  conversionRate?: number;
  /** @deprecated Migrate to VariantUnit.purchaseUnit per variant */
  purchaseUnit?: string;
  /** @deprecated Migrate to VariantUnit.usageUnit per variant */
  usageUnit?: string;
  pricingConfig?: PricingConfig;
  variants?: ProductVariant[];
  adjustmentSnapshots?: any[];
  rounding_method?: string;
  rounding_difference?: number;
  reserved?: number;
  /** @deprecated Use `reserved` instead — kept for backward compat with reservation service */
  reservedStock?: number;
  locationStock?: { warehouseId: string; quantity: number }[];
  smartPricing?: SmartPricingConfig;
  /** @deprecated Migrate to Variant.source + VariantUnit */
  isStationeryPack?: boolean;
  /** @deprecated Migrate to SupplierVariantLink.costPrice / Variant.costPrice */
  costPerPack?: number;
  /** @deprecated Migrate to VariantUnit.conversions */
  unitsPerPack?: number;
  /** @deprecated Migrate to Variant.sellingPrice */
  sellingPricePerPiece?: number;
  /** @deprecated Migrate to Variant.costPrice */
  costPerPiece?: number;
  /** @deprecated Migrate to Variant.profitAmount */
  profitPerPiece?: number;
  markup_percent?: number;
  manual_override?: boolean;

  costPrice: number;
  sellingPrice: number;
  profitAmount: number;
  profitMargin: number;
  minimumMargin: number;
  pricingValidated: boolean;
  validationTimestamp?: string;
  pricingVersion?: number;
  // Product type determines fulfillment behavior
  productType?: import('./types/service').ProductType;
  serviceRecipeId?: string;
  // Service-specific fields
  serviceSku?: string;
  priceType?: string;
  size?: string;
  color?: string;
  status?: 'Active' | 'Inactive' | 'Pending';

  // ── Inventory Resource fields ──
  inventoryRole?: import('./types/inventory').InventoryRole;
  resourceSubtype?: import('./types/inventory').ResourceSubtype;
  costingMethod?: import('./types/inventory').CostingMethod;
  /** Unit used for consumption / costing (e.g. "sheet", "gram", "ml") */
  consumptionUnit?: string;
  /** How many consumption units per primary purchase unit (e.g. 500 sheets per ream) */
  conversionFactor?: number;
  /** Cost Price normalized to one consumption unit (auto-calculated from purchases) */
  normalizedCP?: number;

  [key: string]: any;
}
export interface User {
  id: string;
  username: string;
  role: string;
  email?: string;
  password?: string;
  isSuperAdmin?: boolean;
  groupIds?: string[];
  authMode?: string;
  tokenExpiry?: number;
  fullName?: string;
  name?: string;
  status?: string;
  active?: boolean;
  mfaEnabled?: boolean;
  mfaSecret?: string;
  securityLevel?: string;
  avatar?: string;
}
export type Account = any; // TIER 2: Added as any due to missing definitions
export type Warehouse = any; // TIER 2: Added as any due to missing definitions
export type WorkCenter = any; // TIER 2: Added as any due to missing definitions
export type ProductionResource = any; // TIER 2: Added as any due to missing definitions
export type PermissionNode = any; // TIER 2: Added as any due to missing definitions
export interface UserGroup {
  id: string;
  name: string;
  description?: string;
  permissions: string[];
}
export type UserRole = string;
export interface PasswordPolicy {
  minLength: number;
  requireNumber: boolean;
  requireSpecialChar: boolean;
  expiryDays?: number;
}
// PasswordPolicy defined above; no duplicate needed
export type SystemAlert = any; // TIER 2: Added as any due to missing definitions
export type Reminder = any; // TIER 2: Added as any due to missing definitions
export type ExaminationJob = any; // TIER 2: Added as any due to missing definitions
export type ExaminationJobSubject = any; // TIER 2: Added as any due to missing definitions
export type ExaminationInvoiceGroup = any; // TIER 2: Added as any due to missing definitions
export type ExaminationRecurringProfile = any; // TIER 2: Added as any due to missing definitions
export type ExaminationJobPayload = any; // TIER 2: Added as any due to missing definitions
export type ExaminationGroupPayload = any; // TIER 2: Added as any due to missing definitions
export type ExaminationRecurringPayload = any; // TIER 2: Added as any due to missing definitions
export type ExaminationRecurringFrequency = 'weekly' | 'monthly' | 'termly';
export interface ExaminationInvoiceGroupJobLine {
  examination_job_id: string;
  class_name: string;
  learners: number;
  price_per_learner: number;
  amount: number;
}
export interface Customer {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  address?: string;
  city?: string;
  balance?: number;
  walletBalance?: number;
  referredById?: string
  referredByName?: string
  creditLimit?: number;
  creditHold?: boolean;
  outstandingBalance?: number;
  status?: string;
  category?: string;
  segment?: string;
  paymentTerms?: string;
  billingAddress?: string;
  shippingAddress?: string;
  notes?: string;
  tags?: string[];
  leadSource?: string;
  pipelineStage?: string;
  leadScore?: number;
  nextFollowUpDate?: string;
  estimatedDealValue?: number;
  assignedSalesperson?: string;
  subAccounts?: string[];
  avgPaymentDays?: number;
  taxId?: string;
  companyName?: string;
  currency?: string;
  [key: string]: any;
}

export interface PortalUser {
  id: string;
  customer_id: string;
  email: string;
  full_name?: string;
  phone?: string;
  status?: 'active' | 'disabled' | 'invited';
  last_login_at?: string;
  created_at?: string;
}

export interface PortalSession {
  access_token: string;
  refresh_token: string;
  expires_in: string;
  user: PortalUser;
}

export interface School {
  id: string | number;
  name: string;
  pricing_type?: 'margin-based' | 'per-sheet';
  pricing_value?: number;
  phone?: string;
  email?: string;
  address?: string;
  source?: 'school' | 'customer';
  contactPerson?: string;
  [key: string]: any;
}

export interface MarketAdjustment {
  id: string;
  name: string;
  type: 'PERCENTAGE' | 'FIXED' | 'PERCENT';
  value: number;
  percentage?: number;
  applies_to: string;
  active: boolean;
  is_active?: boolean;
  description?: string;
  category?: string;
  display_name?: string;
  adjustment_category?: string;
  sort_order?: number;
  is_system_default?: boolean;
  apply_to_categories?: string;
  created_at?: string;
  last_applied_at?: string;
  total_applied_amount?: number;
  application_count?: number;
  [key: string]: any;
}

export interface ExaminationSubject {
  id: string;
  class_id: string;
  subject_name: string;
  pages: number;
  extra_copies?: number;
  paper_size?: string;
  orientation?: string;
  total_sheets?: number;
  total_pages?: number;
  created_at?: string;
  updated_at?: string;
  [key: string]: any;
}

export interface ExaminationClass {
  id: string;
  batch_id: string;
  class_name: string;
  number_of_learners: number;
  suggested_cost_per_learner?: number;
  manual_cost_per_learner?: number;
  is_manual_override?: boolean;
  manual_override_reason?: string;
  manual_override_by?: string;
  manual_override_at?: string;
  calculated_total_cost?: number;
  material_total_cost?: number;
  adjustment_total_cost?: number;
  adjustment_delta_percent?: number;
  cost_last_calculated_at?: string;
  price_per_learner?: number;
  total_price?: number;
  created_at?: string;
  updated_at?: string;
  [key: string]: any;
}

export interface ExaminationBatch {
  id: string;
  batch_number?: string;
  school_id: string;
  name: string;
  academic_year?: string;
  term?: string;
  exam_type?: string;
  status?: string;
  total_amount?: number;
  calculated_material_total?: number;
  calculated_adjustment_total?: number;
  adjustment_snapshots_json?: string;
  rounding_adjustment_total?: number;
  pre_rounding_total_amount?: number;
  rounding_method?: string;
  rounding_value?: number;
  expected_candidature?: number;
  calculated_cost_per_learner?: number;
  calculation_trigger?: string;
  calculation_duration_ms?: number;
  last_calculated_at?: string;
  currency?: string;
  invoice_id?: string;
  pricing_lock_enabled?: boolean;
  pricing_lock_reason?: string;
  pricing_lock_by?: string;
  pricing_locked_at?: string;
  locked_paper_unit_cost?: number;
  locked_toner_unit_cost?: number;
  locked_conversion_rate?: number;
  locked_adjustments_json?: string;
  schoolName?: string;
  school_name?: string;
  customer_name?: string;
  customerName?: string;
  quotation_id?: string;
  [key: string]: any;
}

export interface LedgerEntry {
  id: string;
  date: string;
  description?: string;
  debitAccountId?: string;
  creditAccountId?: string;
  amount: number;
  type?: string;
  entryType?: string;
  referenceType?: string;
  referenceId?: string;
  reconciled?: boolean;
  customerId?: string;
  customerName?: string;
  [key: string]: any;
}

export interface Invoice {
  id: string;
  customerId?: string;
  customerName?: string;
  subAccountName?: string;
  totalAmount: number;
  paidAmount?: number;
  date: string;
  dueDate?: string;
  status: string;
  items?: CartItem[];
  currency?: string;
  paymentMethod?: string;
  paidAt?: string;
  invoiceNumber?: string;
  originModule?: string;
  originBatchId?: string;
  idempotencyKey?: string;
  lineItemsJson?: string;
  notes?: string;
  documentTitle?: string;
  materialTotal?: number;
  adjustmentTotal?: number;
  profitMarginTotal?: number;
  roundingTotal?: number;
  roundingDifference?: number;
  roundingMethod?: string;
  adjustmentSnapshots?: any[];
  tax?: number;
  taxRate?: number;
  paymentTerms?: string;
  customerPhone?: string;
  total?: number;
  [key: string]: any;
}

export interface Expense {
  id: string;
  date: string;
  description: string;
  amount: number;
  category?: string;
  paymentMethod?: string;
  reference?: string;
  [key: string]: any;
}

export interface RecurringInvoice {
  id: string;
  customerId?: string;
  customerName: string;
  total: number;
  status: string;
  startDate?: string;
  endDate?: string;
  nextRunDate?: string;
  frequency?: string;
  scheduledDates?: string[];
  items?: CartItem[];
  [key: string]: any;
}

export interface ScheduledPayment {
  id: string;
  invoiceId: string;
  amount: number;
  dueDate: string;
  status: string;
  [key: string]: any;
}

export interface WalletTransaction {
  id: string;
  customerId: string;
  amount: number;
  type: string;
  reference?: string;
  date: string;
  [key: string]: any;
}

export interface DeliveryNote {
  id: string;
  invoiceId?: string;
  customerId?: string;
  customerName?: string;
  items: CartItem[];
  date: string;
  status: string;
  [key: string]: any;
}

export interface Budget {
  id: string;
  name: string;
  amount: number;
  period: string;
  category?: string;
  [key: string]: any;
}

export interface Transfer {
  id: string;
  fromAccount: string;
  toAccount: string;
  amount: number;
  date: string;
  [key: string]: any;
}

export interface Employee {
  id: string;
  name: string;
  role?: string;
  salary?: number;
  [key: string]: any;
}

export interface PayrollRun {
  id: string;
  period: string;
  employees: Employee[];
  totalAmount: number;
  [key: string]: any;
}

export interface Payslip {
  id: string;
  employeeId: string;
  amount: number;
  period: string;
  [key: string]: any;
}

export interface Income {
  id: string;
  date: string;
  description: string;
  amount: number;
  category?: string;
  [key: string]: any;
}

export interface Cheque {
  id: string;
  number: string;
  amount: number;
  payee: string;
  date: string;
  status: string;
  [key: string]: any;
}

export interface ZReport {
  id: string;
  date: string;
  cashierId: string;
  totalSales: number;
  cashSales: number;
  cardSales: number;
  otherSales: number;
  openingCash: number;
  closingCash: number;
  variance: number;
  generatedAt: string;
  [key: string]: any;
}

export interface SupplierPayment {
  id: string;
  supplierId: string;
  amount: number;
  date: string;
  method: string;
  [key: string]: any;
}

export interface CustomerPayment {
  id: string;
  customerId?: string;
  customerName: string;
  amount: number;
  date: string;
  method?: string;
  paymentMethod?: string;
  accountId?: string;
  reference?: string;
  allocations: Array<{ invoiceId: string; amount: number; saleId?: string }>;
  excessAmount?: number;
  excessHandling?: string;
  notes?: string;
  [key: string]: any;
}

export interface Purchase {
  id: string;
  supplierId: string;
  items: CartItem[];
  totalAmount: number;
  date: string;
  status: string;
  [key: string]: any;
}

export interface GoodsReceipt {
  id: string;
  purchaseId?: string;
  items: CartItem[];
  date: string;
  status: string;
  [key: string]: any;
}

export interface BOMComponent {
  id?: string;
  itemId: string;
  materialId?: string;
  name: string;
  quantity: number;
  formula?: string;
  /** @deprecated Use formula instead */
  quantityFormula?: string;
  unit?: string;
  cost?: number;
  costPerUnit?: number;
  consumptionMode?: string;
  [key: string]: any;
}

export interface BillOfMaterial {
  id: string;
  name: string;
  productId: string;
  productName?: string;
  description?: string;
  version?: string;
  status?: string;
  components: BOMComponent[];
  createdAt?: string;
  updatedAt?: string;
  [key: string]: any;
}

export interface Order {
  id: string;
  customerId?: string;
  customerName?: string;
  items: CartItem[];
  totalAmount: number;
  date: string;
  status: string;
  [key: string]: any;
}

export interface OrderPayment {
  id: string;
  orderId: string;
  amount: number;
  method: string;
  date: string;
  [key: string]: any;
}

export interface OrderItem {
  id: string;
  orderId: string;
  productId: string;
  quantity: number;
  price: number;
  [key: string]: any;
}

export interface Quotation {
  id: string;
  customerId?: string;
  customerName: string;
  items: CartItem[];
  total: number;
  totalAmount?: number;
  subtotal?: number;
  date: string;
  validUntil?: string;
  status: string;
  notes?: string;
  quotationType?: string;
  linkedBatchId?: string;
  linkedBatchName?: string;
  isPriceLocked?: boolean;
  approvedAt?: string;
  examinationDetails?: any;
  tax?: number;
  taxRate?: number;
  adjustmentTotal?: number;
  materialTotal?: number;
  profitMarginTotal?: number;
  roundingTotal?: number;
  roundingDifference?: number;
  roundingMethod?: string;
  currency?: string;
  sourceRequestNumber?: string;
  sourceRequestId?: string;
  erpQuotationId?: string;
  [key: string]: any;
}

export interface BOMTemplate {
  id: string;
  name: string;
  description?: string;
  category?: string;
  components: BOMComponent[];
  createdAt?: string;
  updatedAt?: string;
  [key: string]: any;
}
export interface FinishingItemConfig {
  itemId: string;
  quantity: number;
}

export interface FinishingOption {
  id: string;
  name: string;
  enabled: boolean;
  price: number;
  description?: string;
  quantity?: number;
  items: FinishingItemConfig[];
  /** When set, price is charged per batch of this many copies (e.g. 10 = per 10 sheets) instead of per copy */
  batchSize?: number;
}

export interface ProductionSettingsConfig {
  autoConsumeMaterials: boolean;
  requireQAApproval: boolean;
  trackMachineDownTime: boolean;
  defaultWorkCenterId: string;
  defaultExamBomId: string;
  allowOverproduction: boolean;
  showKioskSummary: boolean;
  finishingOptions: FinishingOption[];
}
export interface SubcontractOrder {
  id: string;
  supplierId: string;
  items: CartItem[];
  totalAmount: number;
  date: string;
  status: string;
  [key: string]: any;
}

export interface Supplier {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  address?: string;
  city?: string;
  status?: string;
  category?: string;
  paymentTerms?: string;
  [key: string]: any;
}

export interface ProductionLog {
  id: string;
  workOrderId: string;
  timestamp: string;
  action: string;
  user: string;
  qtyProcessed?: number;
  notes?: string;
  materialId?: string;
  wasteDestroyed?: boolean;
}

export interface ResourceAllocation {
  id: string;
  workOrderId: string;
  resourceId: string;
  startTime: string;
  endTime: string;
  [key: string]: any;
}

export interface MaterialReservation {
  id: string;
  workOrderId: string;
  materialId: string;
  materialName: string;
  quantityReserved: number;
  quantityConsumed: number;
  unitCost: number;
  status: 'Reserved' | 'Partially Consumed' | 'Fully Consumed' | 'Released';
  reservedAt: string;
  consumedAt?: string;
  releasedAt?: string;
  warehouseId?: string;
  salesOrderId?: string;
  itemId?: string;
  unitPrice?: number;
  [key: string]: any;
}

export interface QACheck {
  id: string;
  name: string;
  category: string;
  status: 'Pending' | 'Pass' | 'Fail' | 'N/A';
  description?: string;
  notes?: string;
  actualValue?: number;
  checkedAt?: string;
  checkedBy?: string;
}

export interface WorkOrder {
  id: string;
  status: 'Draft' | 'Scheduled' | 'In Progress' | 'On Hold' | 'QA' | 'Completed' | 'Cancelled';
  source?: 'examination' | 'regular';
  productId: string;
  productName: string;
  customerId?: string;
  customerName?: string;
  quantityPlanned: number;
  quantityCompleted: number;
  quantityWaste?: number;
  bomId?: string;
  dueDate?: string;
  startDate?: string;
  actualStartTime?: string;
  completedAt?: string;
  logs: ProductionLog[];
  materialReservations?: MaterialReservation[];
  qaChecks?: QACheck[];
  qaStatus?: string;
  qaInspector?: string;
  qaNotes?: string;
  qaCompletedAt?: string;
  dependencies?: string[];
  dependents?: string[];
  assignedTo?: string;
  holdReason?: string;
  holdStartedAt?: string;
  holdEndedAt?: string;
  totalHoldTime?: number;
  progressPercentage?: number;
  attributes?: Record<string, unknown>;
  notes?: string;
  consumptionSnapshot?: any;
  linkedBatchId?: string;
  workCenterId?: string;
  priority?: string;
  [key: string]: any;
}

export interface ProductionBatch {
  id: string;
  name: string;
  workOrderId?: string;
  customerId?: string;
  customerName?: string;
  status: string;
  totalAmount?: number;
  components?: BOMComponent[];
  createdAt?: string;
  updatedAt?: string;
  [key: string]: any;
}
export interface CartItem {
  id: string;
  productId?: string;
  name: string;
  description?: string;
  quantity: number;
  price: number;
  cost?: number;
  type?: string;
  unit?: string;
  lineTotalNet?: number;
  discount?: number;
  tax?: number;
  bomBreakdown?: Array<{ materialId: string; materialName: string; quantity: number; unit: string; cost: number }>;
  adjustmentSnapshots?: TransactionAdjustmentSnapshot[];
  consumptionSnapshot?: ConsumptionSnapshot;
  pricingBreakdown?: PricingBreakdownSnapshot;
  parentId?: string;
  [key: string]: any;
}

export interface SalePayment {
  id: string;
  amount: number;
  method: string;
  accountId?: string;
  reference?: string;
  date?: string;
  notes?: string;
}

export interface Sale {
  id: string;
  date: string;
  customerId?: string;
  customerName?: string;
  subAccountName?: string;
  items: CartItem[];
  payments: SalePayment[];
  totalAmount: number;
  materialTotal?: number;
  adjustmentTotal?: number;
  profitMarginTotal?: number;
  roundingTotal?: number;
  roundingDifference?: number;
  roundingMethod?: string;
  status: string;
  paymentMethod?: string;
  source?: string;
  cashierId?: string;
  notes?: string;
  consumptionSnapshots?: ConsumptionSnapshot[];
  adjustmentSnapshots_json?: string;
  items_json?: string;
  payments_json?: string;
  created_at?: string;
  last_synced_at?: string;
  sync_checksum?: string;
  [key: string]: any;
}

export interface JobOrder {
  id: string;
  customerId?: string;
  customerName?: string;
  productId?: string;
  totalQuantity: number;
  status: string;
  date?: string;
  dueDate?: string;
  notes?: string;
  [key: string]: any;
}

export interface HeldOrder {
  id: string;
  customerId?: string;
  customerName?: string;
  items: CartItem[];
  totalAmount: number;
  heldAt: string;
  reason?: string;
  [key: string]: any;
}

export interface SalesExchangeItem {
  id: string;
  exchangeId?: string;
  productId?: string;
  productName?: string;
  qtyReturned: number;
  qtyReplaced: number;
  priceDifference?: number;
  condition?: string;
  reason?: string;
}

export interface SalesExchangeApproval {
  id: string;
  exchangeId?: string;
  approvedBy?: string;
  approvalDate?: string;
  comments?: string;
  status: string;
  exchange_id?: string;
  approved_by?: string;
  approval_date?: string;
}

export interface SalesExchange {
  id: string;
  exchangeNumber?: string;
  invoiceId?: string;
  customerId?: string;
  customerName?: string;
  exchangeDate: string;
  reason: string;
  remarks?: string;
  status: string;
  createdBy?: string;
  totalPriceDifference?: number;
  items?: SalesExchangeItem[];
  approvals?: SalesExchangeApproval[];
  [key: string]: any;
}

export interface ReprintJob {
  id: string;
  exchangeId?: string;
  jobDescription?: string;
  paperUsed?: number;
  inkUsed?: number;
  finishingCost?: number;
  totalReprintCost?: number;
  status: string;
  createdAt?: string;
  completedAt?: string;
  exchange_id?: string;
  job_description?: string;
  paper_used?: string;
  ink_used?: string;
  finishing_cost?: number;
  total_reprint_cost?: number;
  [key: string]: any;
}
export interface SMSCampaign {
  id: string;
  name: string;
  message: string;
  recipients: string[];
  status: string;
  sentAt?: string;
  [key: string]: any;
}

export interface Subscriber {
  id: string;
  phone: string;
  name?: string;
  active: boolean;
  [key: string]: any;
}

export interface SMSTemplate {
  id: string;
  name: string;
  body: string;
  [key: string]: any;
}

export interface Shipment {
  id: string;
  orderId?: string;
  customerId?: string;
  customerName?: string;
  items: CartItem[];
  date: string;
  status: string;
  trackingNumber?: string;
  [key: string]: any;
}

export interface MaintenanceLog {
  id: string;
  resourceId: string;
  date: string;
  type: string;
  description: string;
  cost?: number;
  performedBy?: string;
  nextScheduledDate?: string;
  [key: string]: any;
}

export interface ExamPaper {
  id: string;
  name: string;
  subject: string;
  pages: number;
  [key: string]: any;
}

export interface ExamPrintingBatch {
  id: string;
  schoolId: string;
  papers: ExamPaper[];
  status: string;
  [key: string]: any;
}

export interface ExamJob {
  id: string;
  examId: string;
  status: string;
  [key: string]: any;
}

export interface SalesReturn {
  id: string;
  saleId: string;
  items: SalesExchangeItem[];
  totalAmount: number;
  reason: string;
  date: string;
  [key: string]: any;
}

export interface PurchaseAllocation {
  id: string;
  purchaseId: string;
  itemId: string;
  quantity: number;
  [key: string]: any;
}

export interface VatTransaction {
  id: string;
  date: string;
  type: string;
  amount: number;
  rate: number;
  vatAmount?: number;
  taxableAmount?: number;
  reference?: string;
  referenceId?: string;
  referenceType?: string;
  description?: string;
  isFiled?: boolean;
  customerName?: string;
  [key: string]: any;
}

export interface VatReturn {
  id: string;
  period: string;
  outputVat: number;
  inputVat: number;
  netVat: number;
  [key: string]: any;
}

export interface MarketAdjustmentTransaction {
  id: string;
  sale_id: string;
  item_id: string;
  variant_id?: string;
  adjustment_id: string;
  adjustment_name: string;
  adjustment_type: string;
  adjustment_value: number;
  base_amount: number;
  calculated_amount: number;
  quantity: number;
  unit_amount: number;
  timestamp: string;
  status: string;
  [key: string]: any;
}

export interface MaterialCategory {
  id: string;
  name: string;
  description?: string;
  parent_category_id?: string;
  [key: string]: any;
}

export interface WarehouseInventory {
  id: string;
  itemId: string;
  warehouseId: string;
  quantity: number;
  reserved: number;
  available: number;
  lastUpdated?: string;
  [key: string]: any;
}

export interface MaterialBatch {
  id: string;
  itemId: string;
  batchNumber: string;
  quantity: number;
  remainingQuantity: number;
  costPerUnit?: number;
  receivedDate?: string;
  expiryDate?: string;
  supplierId?: string;
  supplierName?: string;
  warehouseId?: string;
  status: 'active' | 'depleted' | 'expired';
  createdAt?: string;
  updatedAt?: string;
  [key: string]: any;
}

export interface InventoryTransaction {
  id: string;
  itemId: string;
  warehouseId?: string;
  batchId?: string;
  type: 'IN' | 'OUT' | 'ADJUSTMENT';
  quantity: number;
  previousQuantity: number;
  newQuantity: number;
  unitCost?: number;
  totalCost?: number;
  reference?: string;
  referenceId?: string;
  reason: string;
  performedBy?: string;
  timestamp: string;
  [key: string]: any;
}

export interface RoundingLog {
  id: string;
  saleId?: string;
  itemId?: string;
  originalPrice: number;
  roundedPrice: number;
  difference: number;
  method: string;
  timestamp: string;
  [key: string]: any;
}

export interface ExaminationInventoryDeduction {
  id: string;
  batchId: string;
  materialId: string;
  quantity: number;
  timestamp: string;
  [key: string]: any;
}

export interface CustomerReceiptSnapshot {
  generatedAt: string;
  paymentPurpose?: string;
  amountTendered: number;
  amountApplied: number;
  changeGiven: number;
  walletDeposit: number;
  amountRetained: number;
  invoiceTotalAtPosting: number;
  balanceDueAfterPayment: number;
  appliedInvoices: string[];
  paymentStatus: string;
  confidence?: string;
  calculationVersion?: number;
  narrative?: string;
  backfilled?: boolean;
  [key: string]: any;
}

export interface ProductionCostSnapshot {
  id: string;
  workOrderId: string;
  plannedCost: number;
  actualCost: number;
  variance: number;
  breakdown: Array<{ materialId: string; planned: number; actual: number }>;
  timestamp: string;
  [key: string]: any;
}

export interface ExaminationPricingSettings {
  roundingMethod: string;
  roundingValue: number;
  defaultMarkup: number;
  [key: string]: any;
}

export interface AdjustmentSnapshot {
  id: string;
  adjustmentId: string;
  name: string;
  type: string;
  value: number;
  amount: number;
  category?: string;
  isActive?: boolean;
  [key: string]: any;
}

export type ExaminationAdjustmentType = string;
export type ExaminationRoundingRuleType = string;
export type PricingRoundingMethod = 'ALWAYS_UP_50' | 'ALWAYS_UP_100' | 'ALWAYS_UP_500' | 'ALWAYS_UP_10' | 'ALWAYS_UP_CUSTOM' | 'NEAREST_10' | 'NEAREST_50' | 'NEAREST_100' | 'PSYCHOLOGICAL' | 'Nearest' | 'AlwaysUp' | 'AlwaysDown';
export type PricingMode = 'VAT' | 'MarketAdjustment';
export interface PricingSyncPayload {
  items: Array<{ id: string; price: number; cost: number }>;
  timestamp: string;
  [key: string]: any;
}

export interface PricingSyncResult {
  synced: number;
  failed: number;
  errors?: string[];
  [key: string]: any;
}

export interface OverrideCascadeResult {
  updatedItems: number;
  warnings: string[];
  [key: string]: any;
}

export interface ExamClass {
  id: string;
  name: string;
  learners: number;
  [key: string]: any;
}

export interface ExamBOMConfig {
  paperItemId?: string;
  tonerItemId?: string;
  finishingOptions?: string[];
  [key: string]: any;
}

export interface ExamSubject {
  id: string;
  name: string;
  pages: number;
  [key: string]: any;
}

export interface ExamMaterialDeduction {
  subjectId: string;
  materialId: string;
  quantity: number;
  [key: string]: any;
}

export interface InvoiceGenerationClassLine {
  className: string;
  learners: number;
  pricePerLearner: number;
  totalAmount: number;
  [key: string]: any;
}
export interface ProductVariant {
  id: string;
  productId: string;
  name: string;
  sku: string;
  attributes?: Record<string, unknown>;
  recipeId?: string;
  recipeVersion?: string;
  /** @deprecated Use costPrice instead */
  cost?: number;
  costPrice: number;
  /** @deprecated Use sellingPrice instead */
  price?: number;
  sellingPrice: number;
  profitAmount: number;
  profitMargin: number;
  minimumMargin: number;
  pricingValidated: boolean;
  bomVersion?: string;
  lastCostCalculation?: string;
  stock: number;
  pages?: number;
  active: boolean;
  /** Unique key generated from attribute value IDs for deduplication and exclusion */
  _attributeKey?: string;
  [key: string]: any;
}
export interface PricingThresholdRule {
  minPrice: number;
  maxPrice?: number;
  step: number;
  method?: PricingRoundingMethod;
}

export interface RoundingAnalytics {
  totalExtraProfit: number;
  roundedTransactions: number;
  lastUpdatedAt?: string;
  byMethod: Record<string, number>;
}

export interface PricingSettings {
  enableRounding: boolean;
  defaultMethod: PricingRoundingMethod;
  customStep: number;
  applyToPOS: boolean;
  applyToInvoices: boolean;
  applyToQuotations: boolean;
  allowManualOverride: boolean;
  showOriginalPrice: boolean;
  profitProtectionMode: boolean;
  enableSmartThresholds: boolean;
  thresholdRules: PricingThresholdRule[];
  analytics: RoundingAnalytics;
}

export interface ConsumptionSnapshot {
  id?: string;
  saleId?: string;
  itemId: string;
  variantId?: string;
  pages?: number;
  quantity: number;
  cost: number;
  totalCost: number;
  name?: string;
  paperConsumed?: number;
  tonerConsumed?: number;
  costPerUnit?: number;
  bomBreakdown?: Array<{ materialId: string; materialName: string; quantity: number; unit: string; cost: number }>;
  timestamp?: string;
}

export interface TransactionAdjustmentSnapshot {
  id?: string;
  saleId?: string;
  itemId?: string;
  itemName?: string;
  variantId?: string;
  adjustmentId?: string;
  name: string;
  amount?: number;
  type: string;
  value?: number;
  baseCost?: number;
  quantity?: number;
  unitAdjustmentAmount?: number;
  totalAdjustmentAmount?: number;
  calculatedAmount?: number;
  category?: string;
  isActive?: boolean;
  timestamp?: string;
}

export interface DynamicServiceDetails {
  materials: ConsumptionSnapshot[];
  adjustments: TransactionAdjustmentSnapshot[];
  pages?: number;
  copies?: number;
  totalPages?: number;
  unitCostPerPage?: number;
  unitPricePerPage?: number;
  unitCostPerCopy?: number;
  unitPricePerCopy?: number;
  totalCost?: number;
  totalPrice?: number;
  calculatedTotalPrice?: number;
}

export type ReceiptPaymentStatus = 'Paid' | 'Partial' | 'Unpaid' | 'Voided' | 'Overpaid';

export interface FinancialIntegrityIssue {
  id: string;
  severity: 'high' | 'medium' | 'low';
  type: string;
  entityType: string;
  entityId?: string;
  message: string;
  recommendedAction: string;
  relatedIds?: string[];
}

export interface FinancialIntegrityAuditResult {
  healthy: boolean;
  issues: FinancialIntegrityIssue[];
  summary: {
    totalIssues: number;
    highSeverity: number;
    mediumSeverity: number;
    lowSeverity: number;
    checkedAt: string;
  };
}

export interface VerifiedMonthlyMetrics {
  revenue: number;
  expenses: number;
  netProfit: number;
}

export interface VerifiedDashboardMetrics {
  currentMonth: VerifiedMonthlyMetrics;
  previousMonth: VerifiedMonthlyMetrics;
  todayCollection: number;
  receivables: number;
  payables: number;
  cashPosition: number;
  cashForecast: number;
}

export interface Discrepancy {
  type: string;
  entityId: string;
  entityName: string;
  expectedValue: number;
  actualValue: number;
  difference: number;
  suggestedAction: string;
  severity: 'high' | 'medium' | 'low';
}

export interface ReconciliationResult {
  success: boolean;
  discrepancies: Discrepancy[];
  summary: {
    totalChecked: number;
    totalDiscrepancies: number;
  };
}

export interface RoundingDashboardData {
  totalExtraProfit: number;
  roundedTransactions: number;
  byMethod: Record<string, number>;
  [key: string]: any;
}

export interface RoundingInsight {
  type: string;
  message: string;
  severity: string;
  [key: string]: any;
}

export interface RoundingMethodPerformanceRow {
  method: string;
  count: number;
  totalExtraProfit: number;
  [key: string]: any;
}

export interface RoundingPeriodReportRow {
  period: string;
  transactions: number;
  totalRounding: number;
  [key: string]: any;
}

export interface RoundingPriceHistoryEntry {
  itemId: string;
  originalPrice: number;
  roundedPrice: number;
  method: string;
  timestamp: string;
  [key: string]: any;
}

export interface RoundingProductPerformanceRow {
  itemId: string;
  itemName: string;
  transactions: number;
  totalRoundingProfit: number;
  [key: string]: any;
}

export interface RoundingProfitProjection {
  projectedMonthly: number;
  projectedAnnual: number;
  confidence: number;
  [key: string]: any;
}

export interface RoundingProfitSummary {
  totalProfit: number;
  byMethod: Record<string, number>;
  projectedAnnual: number;
  [key: string]: any;
}

export interface RoundingRealizedProfitResult {
  success: boolean;
  profit: number;
  details: string;
  [key: string]: any;
}

export interface RoundingRealizedProfitRow {
  date: string;
  profit: number;
  transactionCount: number;
  [key: string]: any;
}

export interface RoundingTopProductRow {
  itemId: string;
  itemName: string;
  roundingProfit: number;
  transactionCount: number;
  [key: string]: any;
}
export interface ProofOfDeliveryRecord {
  id: string;
  shipmentId: string;
  signature?: string;
  photoUrl?: string;
  notes?: string;
  deliveredAt: string;
  receivedBy?: string;
  [key: string]: any;
}

export type AccountType = string;
export interface PricingConfig {
  paperId?: string;
  tonerId?: string;
  finishingOptions: FinishingOption[];
  manualOverride: boolean;
  marketAdjustment: number;
  totalCost?: number;
  selectedAdjustmentIds?: string[];
  selectedRoundingMethod?: PricingRoundingMethod;
  customRoundingStep?: number;
  [key: string]: any;
}
export type SignatureInputMode = string;
export interface PaymentDetail {
  id: string;
  method: string;
  amount: number;
  reference?: string;
  date: string;
  [key: string]: any;
}

export interface InkCoverage {
  cyan?: number;
  magenta?: number;
  yellow?: number;
  black?: number;
  total?: number;
  [key: string]: any;
}

export interface ProductionOperation {
  id: string;
  workOrderId: string;
  operation: string;
  status: string;
  [key: string]: any;
}

export interface VDPConfig {
  enabled: boolean;
  fieldMappings?: Record<string, string>;
  [key: string]: any;
}

export interface ExamPricingResult {
  totalCost: number;
  totalPrice: number;
  perLearner: number;
  breakdown: Array<{ name: string; cost: number }>;
  [key: string]: any;
}

export interface SubjectJob {
  id: string;
  subjectId: string;
  status: string;
  [key: string]: any;
}

export interface ExamSchoolLocal {
  id: string;
  name: string;
  [key: string]: any;
}

export interface ExamClassLocal {
  id: string;
  name: string;
  learners: number;
  [key: string]: any;
}

export interface ExamSubjectLocal {
  id: string;
  name: string;
  pages: number;
  [key: string]: any;
}

export interface LandingCostItem {
  id: string;
  purchaseItemId: string;
  cost: number;
  [key: string]: any;
}

export interface InvoiceAllocation {
  invoiceId: string;
  paymentId: string;
  amount: number;
  [key: string]: any;
}

export interface Attachment {
  id: string;
  name: string;
  url: string;
  type: string;
  size: number;
  [key: string]: any;
}

export interface CRMTask {
  id: string;
  title: string;
  description?: string;
  notes?: string;
  assignedTo?: string;
  dueDate?: string;
  status: 'Pending' | 'In Progress' | 'Completed';
  priority: 'Low' | 'Medium' | 'High' | 'Urgent';
  relatedEntityType?: string;
  relatedEntityId?: string;
  relatedTo?: { type: string; name: string; id: string };
  hasAlarm?: boolean;
  reminderDate?: string;
  createdAt?: string;
  updatedAt?: string;
  category?: string;
  [key: string]: any;
}
export interface SmartPricingConfig {
  hiddenBOMId?: string;
  bomTemplateId?: string;
  pages?: number;
  copies?: number;
  paperItemId?: string;
  tonerItemId?: string;
  finishingEnabled?: string[];
  paperCost?: number;
  tonerCost?: number;
  finishingCost?: number;
  finishingInventoryCost?: number;
  baseCost?: number;
  totalSheets?: number;
  totalPages?: number;
  [key: string]: any;
}

/**
 * Snapshot of the full SmartPricing breakdown captured at point-of-sale.
 * Stored on each SaleItem so Revenue Analysis can report on each component.
 */
export interface PricingBreakdownSnapshot {
  paperCost: number;
  tonerCost: number;
  finishingCost: number;
  baseMaterialCost: number;
  costPrice: number;
  sellingPrice: number;
  profitAmount: number;
  profitMargin: number;
  minimumMargin: number;
  pages?: number;
  copies?: number;
  adjustmentTotal: number;
  adjustmentLines?: AdjustmentSnapshot[];
  profitMarginAmount: number;
  marginType?: string;
  marginValue?: number;
  roundingDifference: number;
  wasRounded: boolean;
  roundingMethod?: PricingRoundingMethod;
}
export interface TransactionPricingSnapshot {
  itemId: string;
  itemName: string;
  variantId?: string;
  variantName?: string;
  recipeVersion?: string;
  costPrice: number;
  sellingPrice: number;
  profitAmount: number;
  profitMargin: number;
  quantity: number;
  totalCost: number;
  totalRevenue: number;
  totalProfit: number;
  capturedAt: string;
}

export type SidebarStyle = any;
export type AVCOValuationMethod = any;
export type RequireCustomerToPOS = any;
export type LateFeePolicy = any;

// ──────────────────────────────────────────────
// Phase 3: Unified Variant Model
// ──────────────────────────────────────────────

export type VariantSource = 'manufactured' | 'purchased' | 'manual';

export interface Variant {
  id: string;
  itemId: string;
  name: string;
  sku: string;
  barcode?: string;
  active: boolean;
  source: VariantSource;
  attributes?: Record<string, unknown>;

  // Pricing (cost-driven: costPrice is source of truth)
  costPrice: number;
  sellingPrice: number;
  profitAmount: number;
  profitMargin: number;
  minimumMargin: number;
  pricingValidated: boolean;
  pricingVersion?: number;
  validationTimestamp?: string;
  lastCostCalculation?: string;

  // BOM linkage (for manufactured variants)
  bomVersion?: string;

  // Service Recipe linkage (for service variants)
  serviceRecipeId?: string;
  productType?: import('./types/service').ProductType;
  costMethod?: import('./types/service').ServiceCostMethod;

  // Inventory Resource fields
  inventoryRole?: import('./types/inventory').InventoryRole;
  resourceSubtype?: import('./types/inventory').ResourceSubtype;

  // Unit configuration
  stockingUnit: string;
  units?: VariantUnit[];

  // Inventory snapshot (aggregated; per-warehouse in InventoryBalance)
  stock: number;

  // Deprecated aliases for backward compatibility
  /** @deprecated Use costPrice instead */
  cost?: number;
  /** @deprecated Use sellingPrice instead */
  price?: number;

  // Service-specific
  pages?: number;

  [key: string]: any;
}

export interface VariantUnit {
  unit: string;
  isStockingUnit: boolean;
  isPurchaseUnit: boolean;
  isUsageUnit: boolean;
  conversions: UnitConversion[];
}

export interface UnitConversion {
  fromUnit: string;
  toUnit: string;
  factor: number;
  precision?: number;
}

export interface InventoryBalance {
  variantId: string;
  warehouseId: string;
  quantity: number;
  reserved: number;
  binLocation?: string;
  lastUpdated: string;
}

export interface InventoryMovement {
  id: string;
  variantId: string;
  warehouseId: string;
  type: 'in' | 'out' | 'transfer' | 'adjustment' | 'reservation' | 'release';
  quantity: number;
  unit: string;
  referenceType?: string;
  referenceId?: string;
  reason?: string;
  costPerUnit?: number;
  totalCost?: number;
  performedBy?: string;
  timestamp: string;
  notes?: string;
}

export interface SupplierVariantLink {
  id: string;
  supplierId: string;
  variantId: string;
  supplierSku?: string;
  costPrice: number;
  currency?: string;
  leadTimeDays?: number;
  minOrderQty?: number;
  isPreferred: boolean;
  lastPurchasePrice?: number;
  lastPurchaseDate?: string;
  notes?: string;
}

export interface SalesOrderReservation {
  id: string;
  salesOrderId: string;
  itemId: string;
  variantId?: string;
  quantityReserved: number;
  quantityConsumed: number;
  unitPrice: number;
  status: 'Reserved' | 'Partially Consumed' | 'Fully Consumed' | 'Released';
  reservedAt: string;
  consumedAt?: string;
  releasedAt?: string;
  warehouseId?: string;
}

export interface DiscountRule {
  id: string;
  name: string;
  description?: string;
  type: 'percentage' | 'fixed_amount';
  value: number;
  scope: 'global' | 'category' | 'customer_segment' | 'customer_specific' | 'item_specific';
  scopeValue?: string;
  minOrderAmount?: number;
  maxDiscountAmount?: number;
  validFrom?: string;
  validTo?: string;
  usageLimit?: number;
  usageCount?: number;
  active: boolean;
  priority: number;
}

export interface CustomerPricingTier {
  customerId: string;
  tier: 'standard' | 'premium' | 'wholesale' | 'distributor';
  markupMultiplier?: number;
  discountPercent?: number;
  validFrom?: string;
  validTo?: string;
}

export interface TaxRate {
  id: string;
  name: string;
  rate: number;
  type: 'sales' | 'purchase' | 'both';
  isDefault: boolean;
  applicableItemTypes?: string[];
  active: boolean;
  accountId?: string;
}

export type DeliveryStatus =
  | 'order_placed'
  | 'warehouse_dispatched'
  | 'out_for_delivery'
  | 'in_transit'
  | 'dispatched'
  | 'delivered'
  | 'fulfilled'
  | 'processing'
  | string;

export interface DeliveryNotification {
  id: string;
  orderId: string;
  trackingNumber: string;
  status: DeliveryStatus;
  estimatedArrival?: string | null;
  driverName?: string | null;
  driverPhone?: string | null;
  vehicleNumber?: string | null;
  carrier?: string | null;
  shippingAddress?: string | null;
  currentLocation?: string | null;
  proofOfDelivery?: string | null;
  customerName?: string;
}

export interface QuoteRequestItem {
  id: string;
  name: string;
  quantity: number;
  targetPrice?: number;
  notes?: string;
}
