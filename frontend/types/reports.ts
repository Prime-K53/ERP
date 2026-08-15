/**
 * Report types for Prime ERP Advanced Reporting
 */

/**
 * Report category types
 */
export type ReportCategory = 
  | 'financial'
  | 'inventory'
  | 'sales'
  | 'purchasing'
  | 'production'
  | 'hr'
  | 'banking'
  | 'tax'
  | 'custom';

/**
 * Report type definitions
 */
export type ReportType = 
  // Financial Reports
  | 'profit_loss'
  | 'balance_sheet'
  | 'cash_flow'
  | 'trial_balance'
  | 'general_ledger'
  | 'aged_receivables'
  | 'aged_payables'
  | 'budget_variance'
  | 'expense_analysis'
  | 'revenue_analysis'
  | 'financial_ratios'
  
  // Inventory Reports
  | 'inventory_valuation'
  | 'stock_levels'
  | 'inventory_turnover'
  | 'low_stock_alert'
  | 'inventory_movement'
  | 'abc_analysis'
  | 'reorder_report'
  | 'inventory_aging'
  
  // Sales Reports
  | 'sales_summary'
  | 'sales_by_customer'
  | 'sales_by_product'
  | 'sales_by_category'
  | 'sales_by_salesperson'
  | 'sales_trends'
  | 'customer_analysis'
  | 'quotation_conversion'
  
  // Purchasing Reports
  | 'purchase_summary'
  | 'purchase_by_supplier'
  | 'purchase_by_category'
  | 'supplier_analysis'
  | 'purchase_order_status'
  | 'goods_receipt_report'
  
  // Production Reports
  | 'production_summary'
  | 'work_order_status'
  | 'material_consumption'
  | 'production_efficiency'
  | 'machine_utilization'
  | 'quality_control'
  | 'production_cost'
  
  // HR Reports
  | 'employee_directory'
  | 'payroll_summary'
  | 'attendance_report'
  | 'leave_balance'
  | 'performance_review'
  | 'training_record'
  
  // Banking Reports
  | 'bank_reconciliation'
  | 'cash_position'
  | 'bank_transaction'
  | 'cheque_register'
  | 'payment_summary'
  
  // Tax Reports
  | 'vat_report'
  | 'tax_summary'
  | 'withholding_tax'
  | 'tax_compliance'
  
  // Generic/Custom
  | 'tabular'
  | 'custom';

/**
 * Data aggregation types
 */
export type AggregationType = 
  | 'sum'
  | 'avg'
  | 'count'
  | 'min'
  | 'max'
  | 'count_distinct'
  | 'median'
  | 'std_dev';

/**
 * Sort direction
 */
export type SortDirection = 'asc' | 'desc';

/**
 * Filter operator types
 */
export type FilterOperator = 
  | 'equals'
  | 'not_equals'
  | 'contains'
  | 'not_contains'
  | 'starts_with'
  | 'ends_with'
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte'
  | 'between'
  | 'in'
  | 'not_in'
  | 'is_null'
  | 'is_not_null'
  | 'today'
  | 'yesterday'
  | 'this_week'
  | 'last_week'
  | 'this_month'
  | 'last_month'
  | 'this_quarter'
  | 'this_year'
  | 'last_year'
  | 'last_n_days'
  | 'next_n_days';

/**
 * Export format types
 */
export type ExportFormat = 'pdf' | 'excel' | 'csv' | 'json' | 'html' | 'print';

/**
 * Report column definition
 */
export interface ReportColumn {
  id: string;
  field: string;
  label: string;
  type: 'string' | 'number' | 'currency' | 'percentage' | 'date' | 'datetime' | 'boolean';
  width?: number;
  alignment?: 'left' | 'center' | 'right';
  aggregation?: AggregationType;
  format?: string; // e.g., '#,##0.00', 'MM/DD/YYYY'
  sortable?: boolean;
  filterable?: boolean;
  groupable?: boolean;
  hidden?: boolean;
  formula?: string; // For calculated columns
  decimals?: number;
  conditionalFormatting?: ConditionalFormat[];
}

/**
 * Conditional formatting rule
 */
export interface ConditionalFormat {
  id: string;
  condition: 'equals' | 'gt' | 'lt' | 'between' | 'contains';
  value: any;
  value2?: any; // For between condition
  backgroundColor?: string;
  textColor?: string;
  fontWeight?: 'normal' | 'bold';
  icon?: string;
}

/**
 * Report filter definition
 */
export interface ReportFilter {
  id: string;
  field: string;
  operator: FilterOperator;
  value: any;
  value2?: any; // For between operator
  logicalOperator?: 'AND' | 'OR';
  isParameter?: boolean; // If true, user must provide value at runtime
  parameterLabel?: string;
  parameterOrder?: number;
}

/**
 * Report grouping definition
 */
export interface ReportGrouping {
  field: string;
  label: string;
  showSubtotals?: boolean;
  showGrandTotal?: boolean;
  collapsed?: boolean;
  sortBy?: SortDirection;
}

/**
 * Report sorting definition
 */
export interface ReportSorting {
  field: string;
  direction: SortDirection;
}

/**
 * Chart configuration
 */
export interface ReportChart {
  id: string;
  type: 'bar' | 'line' | 'pie' | 'doughnut' | 'area' | 'scatter' | 'radar';
  title: string;
  xAxisField?: string;
  yAxisField: string;
  yAxisAggregation?: AggregationType;
  seriesField?: string; // For multiple series
  colors?: string[];
  showLegend?: boolean;
  showDataLabels?: boolean;
  width?: number;
  height?: number;
}

/**
 * Report definition
 */
export interface ReportDefinition {
  id: string;
  name: string;
  description?: string;
  category: ReportCategory;
  type: ReportType;
  
  // Data source
  dataSource: string; // e.g., 'invoices', 'inventory', 'sales'
  
  // Columns
  columns: ReportColumn[];
  
  // Filters
  filters: ReportFilter[];
  
  // Grouping
  groupBy?: ReportGrouping[];
  
  // Sorting
  sortBy?: ReportSorting[];
  
  // Pagination
  pageSize?: number;
  showRowNumbers?: boolean;
  
  // Charts
  charts?: ReportChart[];
  parameters?: ReportParameter[];
  
  // Layout
  orientation?: 'portrait' | 'landscape';
  pageSizeType?: 'letter' | 'a4' | 'legal';
  margins?: { top: number; right: number; bottom: number; left: number };
  
  // Header/Footer
  header?: string;
  footer?: string;
  showTimestamp?: boolean;
  showFilters?: boolean;
  
  // Access
  isPublic?: boolean;
  allowedRoles?: string[];
  
  // Metadata
  createdBy: string;
  createdAt: Date;
  updatedBy?: string;
  updatedAt: Date;
  
  // Tags
  tags?: string[];
  
  // Version
  version: number;
}

/**
 * Report parameter (for runtime input)
 */
export interface ReportParameter {
  id: string;
  name: string;
  label: string;
  type: 'string' | 'number' | 'date' | 'datetime' | 'boolean' | 'select' | 'multi_select';
  required: boolean;
  defaultValue?: any;
  options?: Array<{ value: any; label: string }>;
  placeholder?: string;
  helpText?: string;
  order: number;
}

/**
 * Report result row
 */
export interface ReportRow {
  [key: string]: any;
}

/**
 * Report result
 */
export interface ReportResult {
  id: string;
  reportDefinitionId: string;
  reportName: string;
  
  // Data
  rows: ReportRow[];
  columns: ReportColumn[];
  
  // Summary/Totals
  summary: Record<string, any>;
  subtotals?: Record<string, any>[];
  
  // Grouping results
  groupedData?: Array<{
    groupValue: any;
    groupLabel: string;
    rows: ReportRow[];
    subtotal: Record<string, any>;
  }>;
  
  // Charts data
  chartData?: Record<string, any[]>;
  charts?: ReportChart[];
  
  // Metadata
  generatedAt: Date;
  generatedBy: string;
  parameters?: Record<string, any>;
  
  // Performance
  executionTimeMs: number;
  totalRows: number;
  
  // Pagination
  page: number;
  pageSize: number;
  totalPages: number;
}

/**
 * Report schedule frequency
 */
export type ScheduleFrequency = 
  | 'daily'
  | 'weekly'
  | 'biweekly'
  | 'monthly'
  | 'quarterly'
  | 'yearly'
  | 'custom';

/**
 * Report schedule
 */
export interface ReportSchedule {
  id: string;
  reportDefinitionId: string;
  name: string;
  
  // Schedule
  frequency: ScheduleFrequency;
  dayOfWeek?: number; // 0-6 for weekly
  dayOfMonth?: number; // 1-31 for monthly
  time: string; // HH:mm format
  timezone?: string;
  
  // Custom cron expression
  cronExpression?: string;
  
  // Recipients
  recipients: Array<{
    type: 'user' | 'role' | 'email';
    value: string;
  }>;
  
  // Export settings
  exportFormat: ExportFormat;
  includeCharts?: boolean;
  includeFilters?: boolean;
  
  // Parameters
  parameters?: Record<string, any>;
  
  // Status
  isActive: boolean;
  lastRun?: Date;
  nextRun?: Date;
  
  // Metadata
  createdBy: string;
  createdAt: Date;
}

/**
 * Report saved view (user's saved filter/column configuration)
 */
export interface ReportSavedView {
  id: string;
  reportDefinitionId: string;
  name: string;
  
  // Customizations
  columns?: string[]; // Column IDs to show
  columnOrder?: string[];
  columnWidths?: Record<string, number>;
  filters?: ReportFilter[];
  sortBy?: ReportSorting[];
  groupBy?: string[];
  
  // Default view
  isDefault?: boolean;
  
  // Metadata
  userId: string;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Report dashboard widget
 */
export interface ReportWidget {
  id: string;
  reportDefinitionId: string;
  title: string;
  
  // Display
  type: 'table' | 'chart' | 'kpi' | 'gauge';
  width: number; // Grid columns (1-12)
  height: number; // Grid rows
  
  // Data
  columns?: string[]; // Columns to display
  chartType?: ReportChart['type'];
  kpiField?: string;
  kpiAggregation?: AggregationType;
  
  // Filters
  filters?: ReportFilter[];
  
  // Refresh
  autoRefresh?: boolean;
  refreshInterval?: number; // seconds
  
  // Position
  position: { x: number; y: number };
}

/**
 * Report dashboard
 */
export interface ReportDashboard {
  id: string;
  name: string;
  description?: string;
  
  // Widgets
  widgets: ReportWidget[];
  
  // Layout
  columns: number; // Grid columns (default 12)
  rowHeight: number; // pixels
  
  // Access
  isPublic: boolean;
  allowedRoles?: string[];
  
  // Metadata
  createdBy: string;
  createdAt: Date;
  updatedBy?: string;
  updatedAt: Date;
}

/**
 * Default report definitions
 */
export const DEFAULT_REPORT_DEFINITIONS: Partial<ReportDefinition>[] = [
  {
    name: 'Profit & Loss Statement',
    description: 'Summary of revenues and expenses for a period',
    category: 'financial',
    type: 'profit_loss',
    dataSource: 'ledger',
    columns: [
      { id: 'account', field: 'accountName', label: 'Account', type: 'string' },
      { id: 'amount', field: 'amount', label: 'Amount', type: 'currency', aggregation: 'sum' },
    ],
    filters: [
      { id: 'date_range', field: 'date', operator: 'between', value: null, value2: null, isParameter: true, parameterLabel: 'Date Range', parameterOrder: 1 },
    ],
    groupBy: [{ field: 'accountType', label: 'Account Type', showSubtotals: true }],
  },
  {
    name: 'Balance Sheet',
    description: 'Snapshot of assets, liabilities, and equity',
    category: 'financial',
    type: 'balance_sheet',
    dataSource: 'ledger',
    columns: [
      { id: 'account', field: 'accountName', label: 'Account', type: 'string' },
      { id: 'balance', field: 'balance', label: 'Balance', type: 'currency', aggregation: 'sum' },
    ],
    filters: [
      { id: 'as_of_date', field: 'date', operator: 'lte', value: null, isParameter: true, parameterLabel: 'As of Date', parameterOrder: 1 },
    ],
    groupBy: [{ field: 'accountType', label: 'Category', showSubtotals: true }],
  },
  {
    name: 'Aged Receivables',
    description: 'Outstanding customer invoices by age',
    category: 'financial',
    type: 'aged_receivables',
    dataSource: 'invoices',
    columns: [
      { id: 'customer', field: 'customerName', label: 'Customer', type: 'string' },
      { id: 'invoice', field: 'invoiceNumber', label: 'Invoice', type: 'string' },
      { id: 'due_date', field: 'dueDate', label: 'Due Date', type: 'date' },
      { id: 'current', field: 'current', label: 'Current', type: 'currency', aggregation: 'sum' },
      { id: 'days_30', field: 'days30', label: '1-30 Days', type: 'currency', aggregation: 'sum' },
      { id: 'days_60', field: 'days60', label: '31-60 Days', type: 'currency', aggregation: 'sum' },
      { id: 'days_90', field: 'days90', label: '61-90 Days', type: 'currency', aggregation: 'sum' },
      { id: 'over_90', field: 'over90', label: 'Over 90 Days', type: 'currency', aggregation: 'sum' },
      { id: 'total', field: 'total', label: 'Total', type: 'currency', aggregation: 'sum' },
    ],
    filters: [
      { id: 'as_of_date', field: 'dueDate', operator: 'lte', value: null, isParameter: true, parameterLabel: 'As of Date', parameterOrder: 1 },
    ],
  },
  {
    name: 'Inventory Valuation',
    description: 'Current value of inventory by item',
    category: 'inventory',
    type: 'inventory_valuation',
    dataSource: 'inventory',
    columns: [
      { id: 'item', field: 'name', label: 'Item', type: 'string' },
      { id: 'sku', field: 'sku', label: 'SKU', type: 'string' },
      { id: 'category', field: 'category', label: 'Category', type: 'string' },
      { id: 'quantity', field: 'stock', label: 'Quantity', type: 'number', aggregation: 'sum' },
      { id: 'unit_cost', field: 'cost', label: 'Unit Cost', type: 'currency' },
      { id: 'total_value', field: 'totalValue', label: 'Total Value', type: 'currency', aggregation: 'sum' },
    ],
    filters: [],
    groupBy: [{ field: 'category', label: 'Category', showSubtotals: true }],
  },
  {
    name: 'Sales Summary',
    description: 'Summary of sales by period',
    category: 'sales',
    type: 'sales_summary',
    dataSource: 'sales',
    columns: [
      { id: 'date', field: 'date', label: 'Date', type: 'date' },
      { id: 'customer', field: 'customerName', label: 'Customer', type: 'string' },
      { id: 'items', field: 'itemCount', label: 'Items', type: 'number', aggregation: 'sum' },
      { id: 'subtotal', field: 'subtotal', label: 'Subtotal', type: 'currency', aggregation: 'sum' },
      { id: 'tax', field: 'taxAmount', label: 'Tax', type: 'currency', aggregation: 'sum' },
      { id: 'total', field: 'totalAmount', label: 'Total', type: 'currency', aggregation: 'sum' },
    ],
    filters: [
      { id: 'date_range', field: 'date', operator: 'between', value: null, value2: null, isParameter: true, parameterLabel: 'Date Range', parameterOrder: 1 },
    ],
  },
  {
    name: 'Low Stock Alert',
    description: 'Items below minimum stock level',
    category: 'inventory',
    type: 'low_stock_alert',
    dataSource: 'inventory',
    columns: [
      { id: 'item', field: 'name', label: 'Item', type: 'string' },
      { id: 'sku', field: 'sku', label: 'SKU', type: 'string' },
      { id: 'category', field: 'category', label: 'Category', type: 'string' },
      { id: 'current_stock', field: 'stock', label: 'Current Stock', type: 'number' },
      { id: 'min_level', field: 'minStockLevel', label: 'Min Level', type: 'number' },
      { id: 'shortage', field: 'shortage', label: 'Shortage', type: 'number' },
      { id: 'reorder_qty', field: 'reorderQuantity', label: 'Reorder Qty', type: 'number' },
    ],
    filters: [
      { id: 'low_stock', field: 'stock', operator: 'lt', value: '{minStockLevel}', logicalOperator: 'AND' },
      { id: 'is_material', field: 'type', operator: 'equals', value: 'Material' },
    ],
  },
  {
    name: 'Payroll Summary',
    description: 'Summary of payroll by period',
    category: 'hr',
    type: 'payroll_summary',
    dataSource: 'payroll',
    columns: [
      { id: 'employee', field: 'employeeName', label: 'Employee', type: 'string' },
      { id: 'department', field: 'department', label: 'Department', type: 'string' },
      { id: 'basic', field: 'basicSalary', label: 'Basic Salary', type: 'currency', aggregation: 'sum' },
      { id: 'allowances', field: 'allowances', label: 'Allowances', type: 'currency', aggregation: 'sum' },
      { id: 'deductions', field: 'deductions', label: 'Deductions', type: 'currency', aggregation: 'sum' },
      { id: 'net_pay', field: 'netPay', label: 'Net Pay', type: 'currency', aggregation: 'sum' },
    ],
    filters: [
      { id: 'pay_period', field: 'payPeriod', operator: 'equals', value: null, isParameter: true, parameterLabel: 'Pay Period', parameterOrder: 1 },
    ],
    groupBy: [{ field: 'department', label: 'Department', showSubtotals: true }],
  },
];

/**
 * Report status colors for UI
 */
export const REPORT_STATUS_COLORS: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-800',
  generated: 'bg-blue-100 text-blue-800',
  scheduled: 'bg-purple-100 text-purple-800',
  failed: 'bg-red-100 text-red-800',
};

/**
 * Export format icons
 */
export const EXPORT_FORMAT_ICONS: Record<ExportFormat, string> = {
  pdf: '📄',
  excel: '📊',
  csv: '📋',
  json: '{ }',
  html: '🌐',
  print: '🖨️',
};
