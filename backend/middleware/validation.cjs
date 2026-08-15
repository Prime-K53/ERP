/**
 * Input Validation Middleware for Prime ERP API
 * Uses Zod for schema validation
 */

const { z } = require('zod');

/**
 * Create a validation middleware for a Zod schema
 * @param {z.ZodSchema} schema - Zod schema to validate against
 * @param {string} source - Request property to validate ('body', 'query', 'params')
 * @returns {Function} Express middleware function
 */
const validate = (schema, source = 'body') => {
  return (req, res, next) => {
    try {
      const data = req[source];
      const validated = schema.parse(data);
      req[source] = validated;
      next();
    } catch (err) {
      if (err instanceof z.ZodError) {
        const errors = err.errors.map(e => ({
          field: e.path.join('.'),
          message: e.message,
          code: e.code
        }));
        
        return res.status(400).json({
          error: 'Validation failed',
          message: 'Invalid input data',
          details: errors
        });
      }
      next(err);
    }
  };
};

/**
 * Validate request body
 */
const validateBody = (schema) => validate(schema, 'body');

/**
 * Validate query parameters
 */
const validateQuery = (schema) => validate(schema, 'query');

/**
 * Validate route parameters
 */
const validateParams = (schema) => validate(schema, 'params');

// Common validation schemas
const commonSchemas = {
  id: z.string().min(1, 'ID is required'),
  pagination: z.object({
    page: z.number().int().positive().default(1),
    limit: z.number().int().min(1).max(100).default(25)
  }),
  dateRange: z.object({
    startDate: z.string().datetime().optional(),
    endDate: z.string().datetime().optional()
  }),
  search: z.object({
    query: z.string().optional(),
    filters: z.record(z.any()).optional()
  })
};

// Financial validation schemas
const financialSchemas = {
  amount: z.number().finite().min(0, 'Amount must be non-negative'),
  currency: z.string().length(3, 'Currency must be 3-letter ISO code'),
  accountCode: z.string().regex(/^\d{4}$/, 'Account code must be 4 digits'),
  journalEntry: z.object({
    date: z.string().datetime(),
    description: z.string().min(1).max(500),
    reference: z.string().optional(),
    lines: z.array(z.object({
      accountId: z.string(),
      debit: z.number().min(0).default(0),
      credit: z.number().min(0).default(0)
    })).min(2, 'Journal entry must have at least 2 lines')
  })
};

// User validation schemas
const userSchemas = {
  login: z.object({
    email: z.string().email('Invalid email address').optional(),
    username: z.string().min(3, 'Username must be at least 3 characters').optional(),
    password: z.string().min(6, 'Password must be at least 6 characters'),
    portal: z.enum(['admin', 'customer']).optional()
  }).refine((data) => Boolean(data.email || data.username), {
    message: 'Email or username is required'
  }),
  // Public self-registration: role/permissions are intentionally NOT accepted.
  // The backend always creates a non-privileged Clerk account; privileged
  // roles are assigned only by admins through the mirror/seed paths.
  publicRegister: z.object({
    username: z.string().min(3).max(50),
    email: z.string().email().optional(),
    password: z.string().min(6)
  }),
  createUser: z.object({
    username: z.string().min(3).max(50),
    email: z.string().email().optional(),
    password: z.string().min(6),
    role: z.enum(['Admin', 'Accountant', 'Clerk', 'Viewer']),
    permissions: z.array(z.string()).optional()
  }),
  requestEmailVerification: z.object({
    email: z.string().email('Invalid email address'),
    purpose: z.string().min(1, 'Purpose is required')
  }),
  verifyEmailCode: z.object({
    email: z.string().email('Invalid email address'),
    code: z.string().min(4, 'Code must be at least 4 characters').max(8),
    purpose: z.string().min(1, 'Purpose is required')
  })
};

// Inventory validation schemas
const inventorySchemas = {
  item: z.object({
    name: z.string().min(1).max(200),
    sku: z.string().min(1).max(50),
    category: z.string(),
    type: z.enum(['Material', 'Product']),
    unit: z.string(),
    cost: z.number().min(0).optional(),
    price: z.number().min(0).optional(),
    stock: z.number().int().min(0).optional(),
    minStockLevel: z.number().int().min(0).optional()
  }),
  stockAdjustment: z.object({
    itemId: z.string(),
    quantity: z.number().int(),
    reason: z.string().min(1),
    warehouseId: z.string().optional(),
    batchId: z.string().optional(),
    reference: z.string().optional(),
    referenceId: z.string().optional(),
    performedBy: z.string().optional(),
    type: z.enum(['IN', 'OUT', 'ADJUSTMENT']).optional(),
    transaction_date: z.string().datetime()
  })
};

// Sales validation schemas
const salesSchemas = {
  sale: z.object({
    customerId: z.string().optional(),
    items: z.array(z.object({
      itemId: z.string(),
      quantity: z.number().positive(),
      unitPrice: z.number().min(0)
    })).min(1, 'Sale must have at least one item'),
    paymentMethod: z.enum(['Cash', 'Card', 'Mobile', 'Invoice']),
    warehouseId: z.string()
  }),
  invoice: z.object({
    customerId: z.string(),
    items: z.array(z.object({
      description: z.string(),
      quantity: z.number().positive(),
      unitPrice: z.number().min(0)
    })).min(1),
    dueDate: z.string().datetime(),
    notes: z.string().optional()
  })
};

// Production validation schemas
const productionSchemas = {
  workOrder: z.object({
    itemId: z.string(),
    quantity: z.number().positive(),
    priority: z.enum(['Low', 'Medium', 'High', 'Urgent']).default('Medium'),
    dueDate: z.string().datetime().optional(),
    notes: z.string().optional()
  }),
  bom: z.object({
    itemId: z.string(),
    components: z.array(z.object({
      materialId: z.string(),
      quantity: z.number().positive(),
      unit: z.string()
    })).min(1)
  })
};

// Document validation schemas
const documentSchemas = {
  register: z.object({
    type: z.string().min(1),
    payload: z.record(z.any()),
    id: z.string().optional()
  }),
  create: z.object({
    type: z.string().min(1),
    payload: z.record(z.any())
  }),
  update: z.object({
    payload: z.record(z.any())
  }),
  finalize: z.object({
    blueprint: z.record(z.any())
  }),
  batchFinalize: z.object({
    ids: z.array(z.string()).min(1),
    blueprint: z.record(z.any()).optional()
  }),
  batchExport: z.object({
    ids: z.array(z.string()).min(1),
    format: z.string().optional()
  })
};

// Exchange validation schemas
const exchangeSchemas = {
  create: z.object({
    originalSaleId: z.string(),
    items: z.array(z.object({
      itemId: z.string(),
      quantity: z.number().int().positive()
    })).min(1),
    reason: z.string().min(1),
    adjustment: z.number().optional()
  })
};

// Order validation schemas
const orderSchemas = {
  create: z.object({
    customerId: z.string().optional(),
    items: z.array(z.object({
      itemId: z.string(),
      quantity: z.number().positive(),
      unitPrice: z.number().min(0)
    })).min(1),
    notes: z.string().optional(),
    dueDate: z.string().optional()
  }),
  update: z.object({
    status: z.string().optional(),
    items: z.array(z.object({
      itemId: z.string(),
      quantity: z.number().positive(),
      unitPrice: z.number().min(0)
    })).optional(),
    notes: z.string().optional()
  })
};

// Class/Subject validation schemas
const classSchemas = {
  create: z.object({
    name: z.string().min(1),
    school_id: z.string().optional(),
    level: z.string().optional()
  })
};

const subjectSchemas = {
  create: z.object({
    name: z.string().min(1),
    code: z.string().optional(),
    class_id: z.string().optional()
  })
};

// Notification validation schemas
const notificationSchemas = {
  create: z.object({
    type: z.string().min(1),
    title: z.string().min(1),
    message: z.string().min(1),
    recipientId: z.string().optional()
  })
};

// Examination batch validation schemas
const examinationSchemas = {
  batch: z.object({
    exam_name: z.string().min(1),
    school_id: z.string().min(1),
    class_name: z.string().min(1),
    number_of_learners: z.number().int().positive(),
    subjects: z.array(z.object({
      name: z.string().min(1),
      pages: z.number().int().min(1).optional(),
      copies: z.number().int().min(1).optional()
    })).min(1).optional()
  }),
  batchUpdate: z.object({
    exam_name: z.string().min(1).optional(),
    number_of_learners: z.number().int().positive().optional(),
    status: z.string().optional()
  }),
  pricingSettings: z.object({
    rounding_method: z.string().optional(),
    rounding_step: z.number().positive().optional(),
    profit_margin: z.number().min(0).max(100).optional()
  })
};

// Workspace validation schemas
const workspaceSchemas = {
  initialize: z.object({
    companyName: z.string().min(1, 'Company name is required').max(200).default('Prime ERP')
  }),
  sync: z.object({
    filename: z.string().min(1, 'Filename is required').max(255),
    data: z.any()
  }),
  saveDocument: z.object({
    folder: z.string().optional(),
    filename: z.string().min(1, 'Filename is required').max(255),
    data: z.any()
  })
};

// Task validation schemas
const taskSchemas = {
  create: z.object({
    title: z.string().min(1, 'Title is required').max(500)
  })
};

// Banking validation schemas
const bankingSchemas = {
  createAccount: z.object({
    name: z.string().min(1, 'Account name is required'),
    account_number: z.string().min(1, 'Account number is required'),
    bank_name: z.string().min(1, 'Bank name is required'),
    account_type: z.enum(['checking', 'savings', 'credit']).optional(),
    currency: z.string().length(3).default('USD'),
    opening_balance: z.number().min(0).default(0),
    is_active: z.boolean().default(true)
  }),
  createTransaction: z.object({
    account_id: z.string().min(1, 'Account ID is required'),
    type: z.enum(['deposit', 'withdrawal', 'transfer']),
    amount: z.number().positive('Amount must be positive'),
    currency: z.string().length(3).default('USD'),
    description: z.string().max(500).optional(),
    reference: z.string().optional(),
    to_account_id: z.string().optional(),
    transaction_date: z.string().datetime().optional()
  }),
  transfer: z.object({
    from_account_id: z.string().min(1, 'Source account is required'),
    to_account_id: z.string().min(1, 'Destination account is required'),
    amount: z.number().positive('Amount must be positive'),
    currency: z.string().length(3).default('USD'),
    description: z.string().max(500).optional(),
    reference: z.string().optional()
  }).refine(data => data.from_account_id !== data.to_account_id, {
    message: 'Source and destination accounts cannot be the same',
    path: ['to_account_id']
  })
};

// Payment allocation validation schemas
const paymentSchemas = {
  allocate: z.object({
    paymentId: z.string().min(1, 'Payment ID is required'),
    allocations: z.array(z.object({
      invoiceId: z.string().min(1, 'Invoice ID is required'),
      amount: z.number().positive('Allocation amount must be positive')
    })).min(1, 'At least one allocation is required')
  }),
  suggestAllocation: z.object({
    customerId: z.string().min(1, 'Customer ID is required'),
    amount: z.number().positive('Amount must be positive')
  })
};

// VAT validation schemas
const vatSchemas = {
  createTransaction: z.object({
    transaction_type: z.enum(['sale', 'purchase', 'adjustment']),
    reference_id: z.string().min(1, 'Reference ID is required'),
    reference_type: z.enum(['invoice', 'expense', 'purchase_order']),
    vat_rate: z.number().min(0).max(100),
    vat_amount: z.number().min(0),
    net_amount: z.number().min(0),
    gross_amount: z.number().min(0),
    vat_category: z.string().default('standard'),
    is_recoverable: z.boolean().default(true),
    period: z.string().regex(/^\d{4}-\d{2}$/, 'Period must be in YYYY-MM format').optional(),
    status: z.enum(['pending', 'submitted', 'paid', 'cancelled']).default('pending')
  }),
  updateStatus: z.object({
    status: z.enum(['pending', 'submitted', 'paid', 'cancelled'])
  }),
  reverse: z.object({
    reason: z.string().min(1, 'Reason is required').max(500)
  }),
  importFromInvoices: z.object({
    period: z.string().regex(/^\d{4}-\d{2}$/, 'Period must be in YYYY-MM format')
  })
};

// Currency validation schemas
const currencySchemas = {
  addCurrency: z.object({
    code: z.string().length(3, 'Currency code must be 3 letters'),
    name: z.string().min(1, 'Currency name is required'),
    symbol: z.string().min(1, 'Currency symbol is required'),
    decimalPlaces: z.number().int().min(0).max(6).default(2)
  }),
  updateRate: z.object({
    fromCurrency: z.string().length(3, 'Currency code must be 3 letters'),
    toCurrency: z.string().length(3, 'Currency code must be 3 letters'),
    rate: z.number().positive('Rate must be positive'),
    date: z.string().datetime().optional()
  })
};

// Profit margin validation schemas
const profitMarginSchemas = {
  create: z.object({
    name: z.string().min(1),
    percentage: z.number().min(0).max(100),
    type: z.enum(['product', 'category', 'global']).optional(),
    appliesTo: z.array(z.string()).optional()
  }),
  update: z.object({
    name: z.string().min(1).optional(),
    percentage: z.number().min(0).max(100).optional(),
    type: z.enum(['product', 'category', 'global']).optional(),
    appliesTo: z.array(z.string()).optional()
  }),
  bulkUpload: z.object({
    margins: z.array(z.object({
      name: z.string().min(1),
      percentage: z.number().min(0).max(100)
    })).min(1)
  })
};

/**
 * Sanitize input to prevent XSS attacks
 */
const sanitizeInput = (req, res, next) => {
  const sanitize = (obj) => {
    if (typeof obj === 'string') {
      // Remove potentially dangerous HTML/script tags
      return obj
        .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
        .replace(/javascript:/gi, '')
        .replace(/on\w+=/gi, '');
    }
    if (Array.isArray(obj)) {
      return obj.map(sanitize);
    }
    if (obj && typeof obj === 'object') {
      const sanitized = {};
      for (const key of Object.keys(obj)) {
        sanitized[key] = sanitize(obj[key]);
      }
      return sanitized;
    }
    return obj;
  };

  if (req.body) {
    req.body = sanitize(req.body);
  }
  if (req.query) {
    req.query = sanitize(req.query);
  }
  next();
};

// Expanded account/finance validation schemas
const accountSchemas = {
  create: z.object({
    code: z.string().regex(/^\d{4}$/, 'Account code must be 4 digits'),
    name: z.string().min(1, 'Name is required').max(100),
    type: z.enum(['asset', 'liability', 'equity', 'revenue', 'expense']),
    category: z.string().optional(),
    subtype: z.string().optional(),
    parent_id: z.string().optional(),
    is_active: z.union([z.boolean(), z.number()]).optional(),
    description: z.string().max(500).optional()
  }),
  update: z.object({
    code: z.string().regex(/^\d{4}$/).optional(),
    name: z.string().min(1).max(100).optional(),
    type: z.enum(['asset', 'liability', 'equity', 'revenue', 'expense']).optional(),
    category: z.string().optional(),
    subtype: z.string().optional(),
    parent_id: z.string().nullable().optional(),
    is_active: z.union([z.boolean(), z.number()]).optional(),
    description: z.string().max(500).nullable().optional()
  })
};

const expenseSchemas = {
  create: z.object({
    category: z.string().min(1, 'Category is required'),
    vendor_name: z.string().optional(),
    amount: z.number().positive('Amount must be positive'),
    currency: z.string().length(3).default('USD'),
    description: z.string().max(1000).optional(),
    expense_date: z.string().datetime('Invalid datetime format'),
    account_id: z.string().optional(),
    payment_method: z.string().optional(),
    status: z.enum(['pending', 'paid', 'cancelled']).default('pending'),
    receipt_url: z.string().optional()
  }),
  update: z.object({
    category: z.string().min(1).optional(),
    vendor_name: z.string().optional(),
    amount: z.number().positive().optional(),
    currency: z.string().length(3).optional(),
    description: z.string().max(1000).optional(),
    expense_date: z.string().optional(),
    account_id: z.string().nullable().optional(),
    payment_method: z.string().optional(),
    status: z.enum(['pending', 'paid', 'cancelled']).optional(),
    receipt_url: z.string().optional()
  })
};

const incomeSchemas = {
  create: z.object({
    source: z.string().min(1, 'Source is required'),
    amount: z.number().positive('Amount must be positive'),
    currency: z.string().length(3).default('USD'),
    description: z.string().max(1000).optional(),
    income_date: z.string().datetime('Invalid datetime format'),
    account_id: z.string().optional(),
    payment_method: z.string().optional(),
    reference: z.string().optional()
  })
};

const budgetSchemas = {
  create: z.object({
    name: z.string().min(1, 'Name is required'),
    account_id: z.string().nullable().optional(),
    fiscal_year: z.string().min(4, 'Fiscal year is required'),
    period: z.enum(['monthly', 'quarterly', 'yearly']),
    amount: z.number().min(0, 'Amount must be non-negative'),
    notes: z.string().max(1000).optional()
  }),
  update: z.object({
    name: z.string().min(1).optional(),
    account_id: z.string().nullable().optional(),
    fiscal_year: z.string().min(4).optional(),
    period: z.enum(['monthly', 'quarterly', 'yearly']).optional(),
    amount: z.number().min(0).optional(),
    notes: z.string().max(1000).nullable().optional()
  })
};

const transferSchemas = {
  create: z.object({
    from_account_id: z.string().min(1, 'Source account is required'),
    to_account_id: z.string().min(1, 'Destination account is required'),
    amount: z.number().positive('Amount must be positive'),
    currency: z.string().length(3, 'Currency must be 3-letter ISO code').default('USD'),
    description: z.string().max(500).optional(),
    reference: z.string().optional()
  }).refine(data => data.from_account_id !== data.to_account_id, {
    message: 'Source and destination accounts cannot be the same',
    path: ['to_account_id']
  })
};

// Referral validation schemas
const referralSchemas = {
  createReferral: z.object({
    customer_id: z.string().min(1, 'Customer ID is required'),
    referred_by_id: z.string().min(1, 'Referrer ID is required'),
    referred_by_name: z.string().optional().nullable(),
    notes: z.string().optional().nullable(),
    pending_invoice_id: z.string().optional().nullable(),
    pending_invoice_amount: z.number().min(0).optional().nullable()
  }),
  updateReferral: z.object({
    notes: z.string().optional().nullable(),
    status: z.enum(['active', 'converted', 'expired', 'cancelled']).optional()
  }),
  cancelReferral: z.object({
    reason: z.string().optional().nullable()
  }),
  createReward: z.object({
    referral_id: z.string().min(1, 'Referral ID is required'),
    invoice_id: z.string().min(1, 'Invoice ID is required'),
    invoice_amount: z.number().min(0, 'Invoice amount must be non-negative'),
    customer_id: z.string().min(1, 'Customer ID is required'),
    amount: z.number().min(0, 'Amount must be non-negative').optional(),
    status: z.enum(['pending', 'approved', 'paid', 'cancelled']).optional().default('pending')
  }),
  approveReward: z.object({
    approved_by: z.string().min(1, 'Approver ID is required')
  }),
  rejectReward: z.object({
    reason: z.string().min(1, 'Reason is required'),
    rejected_by: z.string().optional()
  }),
  createCampaign: z.object({
    name: z.string().min(1, 'Campaign name is required'),
    description: z.string().optional().nullable(),
    start_date: z.string().min(1, 'Start date is required'),
    end_date: z.string().optional().nullable(),
    reward_type: z.enum(['fixed', 'percentage', 'hybrid']).default('percentage'),
    reward_value: z.number().min(0).default(0),
    reward_percentage: z.number().min(0).max(100).default(0),
    min_purchase_amount: z.number().min(0).default(0),
    max_reward_amount: z.number().min(0).default(0),
    max_rewards_per_customer: z.number().int().min(0).default(0),
    max_total_rewards: z.number().int().min(0).default(0),
    bonus_multiplier: z.number().min(0).default(1),
    target_segments_json: z.string().optional().nullable(),
    excluded_customers_json: z.string().optional().nullable(),
    terms_json: z.string().optional().nullable()
  }),
  updateCampaign: z.object({
    name: z.string().min(1).optional(),
    description: z.string().optional().nullable(),
    start_date: z.string().optional(),
    end_date: z.string().optional().nullable(),
    reward_type: z.enum(['fixed', 'percentage', 'hybrid']).optional(),
    reward_value: z.number().min(0).optional(),
    reward_percentage: z.number().min(0).max(100).optional(),
    min_purchase_amount: z.number().min(0).optional(),
    max_reward_amount: z.number().min(0).optional(),
    max_rewards_per_customer: z.number().int().min(0).optional(),
    max_total_rewards: z.number().int().min(0).optional(),
    bonus_multiplier: z.number().min(0).optional(),
    target_segments_json: z.string().optional().nullable(),
    excluded_customers_json: z.string().optional().nullable(),
    terms_json: z.string().optional().nullable()
  }),
  updateCampaignStatus: z.object({
    status: z.enum(['draft', 'active', 'paused', 'completed', 'cancelled'])
  }),
  createReversal: z.object({
    reward_id: z.string().min(1, 'Reward ID is required'),
    reason: z.string().min(1, 'Reason is required'),
    notes: z.string().optional().nullable()
  }),
  approveReversal: z.object({
    approved_by: z.string().min(1, 'Approver ID is required'),
    notes: z.string().optional().nullable()
  }),
  rejectReversal: z.object({
    reason: z.string().min(1, 'Reason is required'),
    rejected_by: z.string().optional(),
    notes: z.string().optional().nullable()
  }),
  updateSettings: z.object({
    settings: z.record(z.any())
  }),
  getReferralsQuery: z.object({
    page: z.coerce.number().int().positive().optional().default(1),
    limit: z.coerce.number().int().positive().max(100).optional().default(50),
    status: z.enum(['active', 'converted', 'expired', 'cancelled', 'all']).optional().default('all'),
    search: z.string().optional(),
    customer_id: z.string().optional(),
    referred_by_id: z.string().optional(),
    referral_code: z.string().optional(),
    sort_by: z.string().optional().default('created_at'),
    sort_dir: z.enum(['asc', 'desc']).optional().default('desc')
  }),
  getAnalyticsQuery: z.object({
    period: z.enum(['daily', 'weekly', 'monthly', 'quarterly', 'yearly']).optional().default('monthly'),
    period_start: z.string().optional(),
    period_end: z.string().optional()
  })
};

/**
 * Validate that a resource exists.
 * Works with both singleton (getDatabase) and direct db patterns.
 * @param {string} tableName - Database table to query
 * @param {string} idField - Column name for the record ID (e.g., 'id')
 * @param {string} recordId - The record's ID value
 * @param {object} [db] - Optional database instance (uses getDatabase singleton if omitted)
 * @returns {Promise<object|null>} The record, or null
 */
const validateResourceExists = async (tableName, idField, recordId, db) => {
  if (!recordId) return null;
  try {
    const repo = require('../services/supabaseRepository.cjs');
    const row = await repo.getById(tableName, recordId);
    return row || null;
  } catch {
    return null;
  }
};

/**
 * Express middleware factory: validates that a resource in req.params exists.
 * @param {string} tableName - Database table to query
 * @param {string} [paramName='id'] - Route param name for the record ID
 * @param {string} [idField='id'] - Column name for the record ID
 * @returns {Function} Express middleware
 */
const requireResourceExists = (tableName, paramName = 'id', idField = 'id') => {
  return async (req, res, next) => {
    try {
      const recordId = req.params[paramName];
      if (!recordId) {
        return res.status(403).json({
          error: 'Access denied',
          message: 'Resource not found or access denied'
        });
      }
      const record = await validateResourceExists(tableName, idField, recordId);
      if (!record) {
        return res.status(404).json({
          error: 'Not found',
          message: 'Resource not found or access denied'
        });
      }
      req.tenantResource = record;
      next();
    } catch (err) {
      next(err);
    }
  };
};

module.exports = {
  validate,
  validateBody,
  validateQuery,
  validateParams,
  sanitizeInput,
  validateResourceExists,
  requireResourceExists,
  commonSchemas,
  financialSchemas,
  accountSchemas,
  expenseSchemas,
  incomeSchemas,
  budgetSchemas,
  transferSchemas,
  userSchemas,
  inventorySchemas,
  salesSchemas,
  productionSchemas,
  documentSchemas,
  exchangeSchemas,
  orderSchemas,
  classSchemas,
  subjectSchemas,
  notificationSchemas,
  examinationSchemas,
  profitMarginSchemas,
  workspaceSchemas,
  taskSchemas,
  bankingSchemas,
  paymentSchemas,
  vatSchemas,
  currencySchemas,
  referralSchemas
};
