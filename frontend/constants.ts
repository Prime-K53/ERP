
import { Item, User, Account, Warehouse, WorkCenter, ProductionResource, PermissionNode, UserGroup } from './types';

export const OFFLINE_MODE = false;

export const SEED_ITEM_IDS = [
  'RM-PAP-A4','RM-TON-HP','RM-PAP-GLS','RM-INK-CYA','RM-INK-MAG','RM-INK-YEL',
  'RM-INK-BLK','RM-BND-GLU','RM-BND-WIR','FG-BK-001','FG-FL-001','FG-BC-001',
];

export const SEED_ITEMS: Item[] = [
  { id: 'RM-PAP-A4', name: 'A4 Copy Paper (70gsm)', sku: 'PAP-A4-70', type: 'Raw Material', category: 'Paper', unit: 'Ream', cost: 3.50, price: 5.00, stock: 100, costPrice: 3.50, sellingPrice: 5.00, profitAmount: 1.50, profitMargin: 42.86, minimumMargin: 20, pricingValidated: true, minStockLevel: 20, reorderPoint: 30, status: 'Active', description: 'Standard 70gsm A4 copy paper for everyday printing' },
  { id: 'RM-TON-HP', name: 'HP LaserJet Toner Cartridge', sku: 'TON-HP-85A', type: 'Raw Material', category: 'Toner', unit: 'Piece', cost: 45.00, price: 65.00, stock: 10, costPrice: 45.00, sellingPrice: 65.00, profitAmount: 20.00, profitMargin: 44.44, minimumMargin: 20, pricingValidated: true, minStockLevel: 3, reorderPoint: 5, status: 'Active', description: 'HP 85A black toner cartridge' },
  { id: 'RM-PAP-GLS', name: 'A4 Glossy Photo Paper', sku: 'PAP-GLS-200', type: 'Raw Material', category: 'Paper', unit: 'Pack', cost: 8.00, price: 12.00, stock: 50, costPrice: 8.00, sellingPrice: 12.00, profitAmount: 4.00, profitMargin: 50.00, minimumMargin: 20, pricingValidated: true, minStockLevel: 10, reorderPoint: 15, status: 'Active', description: '200gsm A4 glossy photo paper for high-quality prints' },
  { id: 'RM-INK-CYA', name: 'Cyan Ink (CMYK)', sku: 'INK-CMY-1L', type: 'Raw Material', category: 'Ink', unit: 'Litre', cost: 12.00, price: 18.00, stock: 20, costPrice: 12.00, sellingPrice: 18.00, profitAmount: 6.00, profitMargin: 50.00, minimumMargin: 20, pricingValidated: true, minStockLevel: 5, reorderPoint: 8, status: 'Active', description: 'Cyan ink for offset/inkjet printing, 1 litre' },
  { id: 'RM-INK-MAG', name: 'Magenta Ink (CMYK)', sku: 'INK-CMM-1L', type: 'Raw Material', category: 'Ink', unit: 'Litre', cost: 12.00, price: 18.00, stock: 20, costPrice: 12.00, sellingPrice: 18.00, profitAmount: 6.00, profitMargin: 50.00, minimumMargin: 20, pricingValidated: true, minStockLevel: 5, reorderPoint: 8, status: 'Active', description: 'Magenta ink for offset/inkjet printing, 1 litre' },
  { id: 'RM-INK-YEL', name: 'Yellow Ink (CMYK)', sku: 'INK-CMY-1L', type: 'Raw Material', category: 'Ink', unit: 'Litre', cost: 12.00, price: 18.00, stock: 20, costPrice: 12.00, sellingPrice: 18.00, profitAmount: 6.00, profitMargin: 50.00, minimumMargin: 20, pricingValidated: true, minStockLevel: 5, reorderPoint: 8, status: 'Active', description: 'Yellow ink for offset/inkjet printing, 1 litre' },
  { id: 'RM-INK-BLK', name: 'Black Ink (CMYK)', sku: 'INK-CMB-1L', type: 'Raw Material', category: 'Ink', unit: 'Litre', cost: 10.00, price: 15.00, stock: 30, costPrice: 10.00, sellingPrice: 15.00, profitAmount: 5.00, profitMargin: 50.00, minimumMargin: 20, pricingValidated: true, minStockLevel: 8, reorderPoint: 12, status: 'Active', description: 'Black ink for offset/inkjet printing, 1 litre' },
  { id: 'RM-BND-GLU', name: 'Perfect Binding Glue', sku: 'BND-GLU-500', type: 'Raw Material', category: 'Binding', unit: 'Bottle', cost: 6.00, price: 9.50, stock: 15, costPrice: 6.00, sellingPrice: 9.50, profitAmount: 3.50, profitMargin: 58.33, minimumMargin: 20, pricingValidated: true, minStockLevel: 3, reorderPoint: 5, status: 'Active', description: '500ml perfect binding adhesive glue' },
  { id: 'RM-BND-WIR', name: 'Binding Wire / Coil', sku: 'BND-WIR-3:1', type: 'Raw Material', category: 'Binding', unit: 'Roll', cost: 14.00, price: 20.00, stock: 12, costPrice: 14.00, sellingPrice: 20.00, profitAmount: 6.00, profitMargin: 42.86, minimumMargin: 20, pricingValidated: true, minStockLevel: 3, reorderPoint: 5, status: 'Active', description: '3:1 pitch binding wire coil for spiral binding' },
  { id: 'FG-BK-001', name: 'Perfect Bound Book (A5, 200pp)', sku: 'FG-BK-A5-200', type: 'Product', category: 'Finished Goods', unit: 'Piece', cost: 2.80, price: 6.00, stock: 200, costPrice: 2.80, sellingPrice: 6.00, profitAmount: 3.20, profitMargin: 114.29, minimumMargin: 30, pricingValidated: true, minStockLevel: 50, reorderPoint: 80, status: 'Active', description: 'A5 perfect bound book, 200 pages, full colour cover' },
  { id: 'FG-FL-001', name: 'A5 Full Colour Flyer', sku: 'FG-FL-A5-4C', type: 'Product', category: 'Finished Goods', unit: 'Piece', cost: 0.35, price: 0.75, stock: 1000, costPrice: 0.35, sellingPrice: 0.75, profitAmount: 0.40, profitMargin: 114.29, minimumMargin: 30, pricingValidated: true, minStockLevel: 200, reorderPoint: 400, status: 'Active', description: 'A5 full colour flyer, 150gsm gloss, single sided' },
  { id: 'FG-BC-001', name: 'Saddle-Stitched Booklet (A4 folded)', sku: 'FG-BC-A4-ST', type: 'Product', category: 'Finished Goods', unit: 'Piece', cost: 1.20, price: 2.50, stock: 500, costPrice: 1.20, sellingPrice: 2.50, profitAmount: 1.30, profitMargin: 108.33, minimumMargin: 30, pricingValidated: true, minStockLevel: 100, reorderPoint: 200, status: 'Active', description: 'A4 folded to A5 saddle-stitched booklet, 8 pages' },
];

export const ACCOUNT_IDS = {
  CASH_DRAWER: '1000',
  BANK: '1050',
  MOBILE_MONEY: '1060',
  RECEIVABLE: '1100',
  PAYABLE: '2000',
  EQUITY: '3000',
  SALES: '4000',
  COGS: '5000'
};

export const DEFAULT_ACCOUNTS: Account[] = [
  // --- Assets (1000-1999) ---
  { id: '1000', code: '1000', name: 'Cash Account', type: 'Asset' },
  { id: '1050', code: '1050', name: 'Bank Account', type: 'Asset' },
  { id: '1060', code: '1060', name: 'Mobile Money', type: 'Asset' },
  { id: '1100', code: '1100', name: 'Accounts Receivable', type: 'Asset' },
  { id: '1200', code: '1200', name: 'Inventory Asset', type: 'Asset' },
  { id: '1250', code: '1250', name: 'Inventory Asset', type: 'Asset' },
  { id: '1300', code: '1300', name: 'Work in Progress (WIP)', type: 'Asset' },
  { id: '1500', code: '1500', name: 'Machinery & Equipment', type: 'Asset' },

  // --- Liabilities (2000-2999) ---
  { id: '2000', code: '2000', name: 'Accounts Payable', type: 'Liability' },
  { id: '2100', code: '2100', name: 'Accounts Payable', type: 'Liability' },
  { id: '2300', code: '2300', name: 'Wages Payable', type: 'Liability' },

  // --- Equity (3000-3999) ---
  { id: '3000', code: '3000', name: 'Owner\'s Equity', type: 'Equity' },

  // --- Revenue (4000-4999) ---
  { id: '4000', code: '4000', name: 'Sales', type: 'Revenue' },
  { id: '4001', code: '4001', name: 'Examination', type: 'Revenue' },
  { id: '4002', code: '4002', name: 'Assessments', type: 'Revenue' },
  { id: '4003', code: '4003', name: 'School Account', type: 'Revenue' },

  // --- Expenses (5000-6999) ---
  { id: '5000', code: '5000', name: 'Cost of Goods Sold', type: 'Expense' },
  { id: '6100', code: '6100', name: 'Maintenance Expense', type: 'Expense' },
  { id: '6200', code: '6200', name: 'Utilities', type: 'Expense' },
  { id: '6300', code: '6300', name: 'Labor Wages', type: 'Expense' },
];

export const AVAILABLE_PERMISSIONS: PermissionNode[] = [
  // Dashboard & Analytics
  { id: 'dashboard.view', label: 'View Dashboard', module: 'Analytics' },
  { id: 'reports.view', label: 'View Financial Reports', module: 'Analytics' },
  { id: 'audit.view', label: 'View Audit Logs', module: 'System' },

  // Sales & POS
  { id: 'sales.view', label: 'View Sales Modules', module: 'Sales' },
  { id: 'sale.process', label: 'Process Sales', module: 'Sales' },
  { id: 'sale.refund', label: 'Process Refunds', module: 'Sales' },
  { id: 'sale.void', label: 'Void Transactions', module: 'Sales' },
  { id: 'quotation.manage', label: 'Manage Quotations', module: 'Sales' },

  // Inventory & Procurement
  { id: 'inventory.view', label: 'View Inventory', module: 'Inventory' },
  { id: 'inventory.adjust', label: 'Adjust Stock', module: 'Inventory' },
  { id: 'inventory.receive', label: 'Receive Goods (GRN)', module: 'Inventory' },
  { id: 'procurement.view', label: 'View Procurement', module: 'Procurement' },
  { id: 'procurement.manage', label: 'Manage Purchase Orders', module: 'Procurement' },

  // Production
  { id: 'production.view', label: 'View Production', module: 'Production' },
  { id: 'production.manage', label: 'Manage Work Orders', module: 'Production' },
  { id: 'production.log', label: 'Log Production Progress', module: 'Production' },
  { id: 'examination.cost.override', label: 'Override Examination Cost', module: 'Production' },

  // Finance
  { id: 'accounts.view', label: 'View Accounts', module: 'Finance' },
  { id: 'ledger.view', label: 'View General Ledger', module: 'Finance' },
  { id: 'ledger.post', label: 'Post Journal Entries', module: 'Finance' },
  { id: 'banking.manage', label: 'Manage Bank Accounts', module: 'Finance' },
  { id: 'payroll.manage', label: 'Process Payroll', module: 'Finance' },

  // Referral Program
  { id: 'referrals.view', label: 'View Referrals & Rewards', module: 'Sales' },
  { id: 'referrals.approve', label: 'Approve Referral Rewards', module: 'Sales' },
  { id: 'referrals.manage', label: 'Manage Referral Settings', module: 'System' },

  // System
  { id: 'admin.settings', label: 'Manage System Settings', module: 'System' },
  { id: 'admin.users', label: 'Manage Users & Groups', module: 'System' },
  { id: 'settings.manage', label: 'Manage System Settings', module: 'System' },
  { id: 'users.manage', label: 'Manage Users & Groups', module: 'System' },
];

export const INITIAL_USER_GROUPS: UserGroup[] = [
  {
    id: 'GRP-ADMIN',
    name: 'Administrators',
    description: 'Full system access with all permissions',
    permissions: ['all']
  },
  {
    id: 'GRP-ACCOUNTANT',
    name: 'Accountants',
    description: 'Financial management, reporting, and ledger access',
    permissions: [
      'dashboard.view', 'reports.view', 'ledger.view', 'ledger.post',
      'banking.manage', 'sale.process', 'sale.refund', 'inventory.view',
      'examination.cost.override'
    ]
  },
  {
    id: 'GRP-CASHIER',
    name: 'Cashiers',
    description: 'Front-end sales and basic inventory viewing',
    permissions: ['dashboard.view', 'sale.process', 'sale.refund', 'inventory.view']
  },
  {
    id: 'GRP-MANAGER',
    name: 'Managers',
    description: 'Operational managers with sales, inventory, and report visibility',
    permissions: ['dashboard.view', 'reports.view', 'sales.view', 'sale.process', 'inventory.view', 'inventory.adjust', 'procurement.view', 'referrals.view', 'referrals.approve']
  },
  {
    id: 'GRP-SALES',
    name: 'Sales Staff',
    description: 'Sales users who can manage customers, quotations, invoices, and receipts',
    permissions: ['dashboard.view', 'sales.view', 'sale.process', 'quotation.manage', 'inventory.view']
  },
  {
    id: 'GRP-USER',
    name: 'Standard Users',
    description: 'Baseline authenticated access',
    permissions: ['dashboard.view']
  },
  {
    id: 'GRP-OPERATOR',
    name: 'Production Operators',
    description: 'Production logging and work order execution',
    permissions: ['dashboard.view', 'production.log', 'inventory.view']
  }
];

export const MOCK_WAREHOUSES: Warehouse[] = [
  { id: 'WH-MAIN', name: 'Main Warehouse', type: 'Physical', location: 'Lilongwe' },
  { id: 'WH-SHOP', name: 'Front Shop', type: 'Store', location: 'Lilongwe' },
  { id: 'WH-VIR', name: 'Virtual/Transit', type: 'Virtual', location: 'System' },
];

export const MOCK_WORK_CENTERS: WorkCenter[] = [
  { id: 'WC-PRN-01', name: 'Offset Printing Line 1', hourlyRate: 45.00, capacityPerDay: 8 },
  { id: 'WC-BND-01', name: 'Perfect Binding Station', hourlyRate: 35.00, capacityPerDay: 8 },
  { id: 'WC-CUT-01', name: 'Hydraulic Cutting Station', hourlyRate: 25.00, capacityPerDay: 8 },
];

export const MOCK_RESOURCES: ProductionResource[] = [
  { id: 'RES-PRN-01', name: 'Heidelberg Speedmaster', workCenterId: 'WC-PRN-01', status: 'Active' },
  { id: 'RES-BND-01', name: 'Horizon Binder', workCenterId: 'WC-BND-01', status: 'Active' },
  { id: 'RES-CUT-01', name: 'Polar Cutter', workCenterId: 'WC-CUT-01', status: 'Active' },
];
