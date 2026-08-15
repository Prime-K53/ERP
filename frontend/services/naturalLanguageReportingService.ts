import { startOfMonth, endOfMonth, subMonths, startOfQuarter, endOfQuarter, startOfYear, endOfYear, format, parseISO, isWithinInterval } from 'date-fns';

export interface InterpretedQuery {
  type: 'unpaid_invoices' | 'sales_by_branch' | 'large_expenses' | 'top_customers' | 'sales_trend' | 'inventory_alert' | 'customer_history' | 'profit_analysis' | 'sales_by_category' | 'cash_flow' | 'payment_history_top' | 'inventory_value' | 'customer_balances' | 'customer_behavior' | 'purchase_orders' | 'expense_by_category' | 'top_branch' | 'unknown';
  params: Record<string, any>;
}

export interface QueryResultColumn {
  key: string;
  label: string;
  type: 'string' | 'number' | 'date' | 'currency';
}

export interface QueryResult {
  type: string;
  title: string;
  description: string;
  data: any[];
  summary: string;
  columns: QueryResultColumn[];
}

export interface QuerySuggestion {
  query: string;
  description: string;
  icon: string;
  category?: string;
}

const periodMap: Record<string, string> = {
  'this month': 'month',
  'this quarter': 'quarter',
  'this year': 'year',
  'last month': 'month',
  'last quarter': 'quarter',
  'last year': 'year',
  month: 'month',
  quarterly: 'quarter',
  quarter: 'quarter',
  yearly: 'year',
  year: 'year',
  weekly: 'week',
  week: 'week',
  today: 'day',
  daily: 'day',
  day: 'day',
};

const quarterRx = /q([1-4])/i;
const offsetRx = /last\s+(\d+)\s+(month|year|quarter|week|day)s?/i;

const extractPeriod = (query: string): { period: string; offset: number; quarter?: number } | null => {
  const lower = query.toLowerCase();
  const qMatch = lower.match(quarterRx);
  if (qMatch) return { period: 'quarter', offset: 0, quarter: parseInt(qMatch[1], 10) };

  const offsetMatch = lower.match(offsetRx);
  if (offsetMatch) return { period: offsetMatch[2], offset: parseInt(offsetMatch[1], 10) };

  for (const [phrase, period] of Object.entries(periodMap)) {
    if (lower.includes(phrase)) {
      const hasLast = lower.includes('last ') || lower.includes('previous ');
      return { period, offset: hasLast ? 1 : 0 };
    }
  }

  return null;
};

const extractCurrency = (query: string): string => {
  const currencies = ['MWK', 'USD', 'EUR', 'GBP', 'ZAR', 'KES', 'TZS', 'NGN', 'GHS'];
  for (const c of currencies) {
    if (query.includes(c)) return c;
  }
  return 'MWK';
};

const extractAmount = (query: string): number | null => {
  const numRx = /(\d{1,3}(?:,\d{3})*(?:\.\d+)?|\d+(?:\.\d+)?)/g;
  const matches = query.match(numRx);
  if (!matches) return null;
  const cleaned = matches[matches.length - 1].replace(/,/g, '');
  const val = parseFloat(cleaned);
  return Number.isFinite(val) ? val : null;
};

const extractLimit = (query: string): number => {
  const topRx = /top\s+(\d+)/i;
  const match = query.match(topRx);
  if (match) return parseInt(match[1], 10);
  return 10;
};

const extractCustomerName = (query: string): string | null => {
  const patterns = [
    /customer\s+(\w+(?:\s+\w+)?)/i,
    /client\s+(\w+(?:\s+\w+)?)/i,
    /did\s+(\w+(?:\s+\w+)?)\s+buy/i,
    /for\s+(\w+(?:\s+\w+)?)/i,
  ];
  for (const rx of patterns) {
    const match = query.match(rx);
    if (match) return match[1];
  }
  return null;
};

export const interpretQuery = (query: string): InterpretedQuery => {
  const lower = query.toLowerCase().trim();

  // Exact literal matches for all suggested queries
  const literalMap: Record<string, { type: InterpretedQuery['type']; params?: Record<string, any> }> = {
    'sales this month vs last month': { type: 'sales_trend' },
    'sales by branch this quarter': { type: 'sales_by_branch' },
    'revenue by month this year': { type: 'sales_trend' },
    'most profitable products': { type: 'profit_analysis', params: { focus: 'products' } },
    'sales by product category': { type: 'sales_by_category' },
    'top 10 customers this year': { type: 'top_customers', params: { limit: 10 } },
    'show unpaid invoices': { type: 'unpaid_invoices' },
    'expenses over mwk 500,000': { type: 'large_expenses', params: { minAmount: 500000, currency: 'MWK' } },
    'overdue invoices by customer': { type: 'unpaid_invoices' },
    'cash flow summary': { type: 'cash_flow' },
    'payment history for top customer': { type: 'payment_history_top' },
    'inventory below reorder level': { type: 'inventory_alert' },
    'items with highest profit margin': { type: 'profit_analysis', params: { focus: 'products' } },
    'low stock alerts': { type: 'inventory_alert' },
    'inventory value summary': { type: 'inventory_value' },
    'top spending customers': { type: 'top_customers' },
    'customers with balances': { type: 'customer_balances' },
    'customer payment behavior': { type: 'customer_behavior' },
    'purchase orders this month': { type: 'purchase_orders' },
    'expense breakdown by category': { type: 'expense_by_category' },
    'best performing branch': { type: 'top_branch' },
  };

  if (literalMap[lower]) {
    return { type: literalMap[lower].type, params: literalMap[lower].params || {} };
  }

  if (/unpaid\s+invoices?|outstanding\s+invoices?|pending\s+payments?|due\s+invoices?|overdue\s+invoices?/.test(lower)) {
    return { type: 'unpaid_invoices', params: {} };
  }

  if (/sales\s+by\s+branch|branch.*sales|revenue\s+by\s+branch/.test(lower)) {
    const period = extractPeriod(query);
    return { type: 'sales_by_branch', params: { ...(period || { period: 'all', offset: 0 }) } };
  }

  if (/expenses?\s+(over|above|exceeding|greater\s+than|more\s+than)|large\s+expenses?|big\s+expenses?/.test(lower)) {
    const minAmount = extractAmount(query) || 500000;
    const currency = extractCurrency(query);
    return { type: 'large_expenses', params: { minAmount, currency } };
  }

  if (/top\s+(\d+\s+)?customers?|best\s+customers?|highest.*customers?|leading\s+customers?|top\s+spending/.test(lower)) {
    const limit = extractLimit(query);
    const period = extractPeriod(query);
    return { type: 'top_customers', params: { limit, ...(period || { period: 'all', offset: 0 }) } };
  }

  if (/sales?\s+trend|month.*sales|sales.*month|sales.*quarter|sales.*year|sales.*period|last month.*sales|sales.*last|trend|revenue\s+by\s+month|monthly\s+revenue/.test(lower)) {
    const period = extractPeriod(query) || { period: 'all', offset: 0 };
    return { type: 'sales_trend', params: period };
  }

  if (/inventory\s+(alert|below|low|reorder|shortage|stock)|low\s+stock|stock\s+alert|reorder\s+level/.test(lower)) {
    return { type: 'inventory_alert', params: {} };
  }

  if (/customer\s+history|what\s+did\s+\w+\s+buy|purchases?\s+by\s+\w+|client\s+history/.test(lower)) {
    const customerName = extractCustomerName(query) || 'Unknown';
    return { type: 'customer_history', params: { customerName } };
  }

  if (/profit\s+(margin|analysis|report)|profitability|gross\s+profit|margin\s+analysis/.test(lower)) {
    const period = extractPeriod(query);
    const quarterMatch = query.match(quarterRx);
    return {
      type: 'profit_analysis',
      params: {
        ...(period || { period: 'all', offset: 0 }),
        ...(quarterMatch ? { quarter: parseInt(quarterMatch[1], 10) } : {}),
      },
    };
  }

  if (/most\s+profitable\s+products?|top\s+products?|best\s+sellers?|high.*margin/.test(lower)) {
    return { type: 'profit_analysis', params: { focus: 'products' } };
  }

  // Additional flexible pattern matching for user-typed queries
  if (/cash\s+flow/.test(lower)) {
    return { type: 'cash_flow', params: {} };
  }
  if (/inventory.*(value|worth)|stock.*(value|worth)/.test(lower)) {
    return { type: 'inventory_value', params: {} };
  }
  if (/customer\s+(balance|balances)|outstanding\s+balance/.test(lower)) {
    return { type: 'customer_balances', params: {} };
  }
  if (/payment.*(behavior|pattern)|customer.*payment/.test(lower)) {
    return { type: 'customer_behavior', params: {} };
  }
  if (/purchase\s+order|purchases?\s+this\s+month/.test(lower)) {
    return { type: 'purchase_orders', params: {} };
  }
  if (/expense\s+breakdown|expenses?\s+by\s+category|category.*expense/.test(lower)) {
    return { type: 'expense_by_category', params: {} };
  }
  if (/best.*branch|branch.*performance|top.*branch/.test(lower)) {
    return { type: 'top_branch', params: {} };
  }
  if (/sales\s+by\s+(category|product|item)|product.*category/.test(lower)) {
    return { type: 'sales_by_category', params: {} };
  }
  if (/payment.*history.*top|customer.*top.*payment|top.*customer.*payment/.test(lower)) {
    return { type: 'payment_history_top', params: {} };
  }

  return { type: 'unknown', params: {} };
};

const filterByPeriod = (items: any[], dateField: string, period: string, offset: number, quarter?: number): any[] => {
  if (!period || period === 'all') return items;

  const now = new Date();
  let start: Date;
  let end: Date;

  if (period === 'quarter' && quarter) {
    start = new Date(now.getFullYear(), (quarter - 1) * 3, 1);
    end = new Date(now.getFullYear(), quarter * 3, 0);
  } else if (period === 'month') {
    const target = subMonths(now, offset || 0);
    start = startOfMonth(target);
    end = endOfMonth(target);
  } else if (period === 'quarter') {
    const q = Math.floor(now.getMonth() / 3) - (offset || 0);
    start = startOfQuarter(new Date(now.getFullYear(), q * 3, 1));
    end = endOfQuarter(new Date(now.getFullYear(), q * 3, 1));
  } else if (period === 'year') {
    const targetYear = now.getFullYear() - (offset || 0);
    start = startOfYear(new Date(targetYear, 0, 1));
    end = endOfYear(new Date(targetYear, 0, 1));
  } else {
    return items;
  }

  return items.filter((item: any) => {
    const d = parseISO(String(item[dateField] || ''));
    return isWithinInterval(d, { start, end });
  });
};

const val = (obj: any, ...fields: string[]): any => {
  for (const f of fields) {
    const v = obj[f];
    if (v !== undefined && v !== null) return v;
  }
  return undefined;
};

const getAmount = (obj: any): number => Number(val(obj, 'totalAmount', 'amount', 'total')) || 0;

const getItemName = (obj: any): string => val(obj, 'name', 'itemName', 'productName') || 'Unknown';

const getBranch = (obj: any): string => val(obj, 'branch', 'subAccountName', 'source') || 'Unknown';

const formatCurrency = (amount: number, currency: string = 'MWK'): string => {
  return `${currency} ${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const sumBy = (items: any[], field: string): number =>
  items.reduce((sum: number, item: any) => sum + (Number(item[field]) || 0), 0);

const groupBy = (items: any[], key: string): Record<string, any[]> =>
  items.reduce((acc: Record<string, any[]>, item: any) => {
    const k = String(item[key] || 'Unknown');
    if (!acc[k]) acc[k] = [];
    acc[k].push(item);
    return acc;
  }, {});

const executeUnpaidInvoices = (invoices: any[]): QueryResult => {
  const unpaid = invoices
    .filter((inv: any) => {
      const balance = getAmount(inv) - Number(val(inv, 'paidAmount', 'paid') || 0);
      return inv.status !== 'paid' && inv.status !== 'cancelled' && balance > 0;
    })
    .map((inv: any) => ({
      ...inv,
      computedBalance: getAmount(inv) - Number(val(inv, 'paidAmount', 'paid') || 0),
      computedAmount: getAmount(inv),
    }));
  const total = sumBy(unpaid, 'computedBalance');
  return {
    type: 'unpaid_invoices',
    title: 'Unpaid Invoices',
    description: `${unpaid.length} unpaid invoice(s) totaling ${formatCurrency(total)}`,
    data: unpaid,
    summary: `${unpaid.length} outstanding invoice(s) with a total balance of ${formatCurrency(total)}`,
    columns: [
      { key: 'invoiceNumber', label: 'Invoice #', type: 'string' },
      { key: 'customerName', label: 'Customer', type: 'string' },
      { key: 'date', label: 'Date', type: 'date' },
      { key: 'dueDate', label: 'Due Date', type: 'date' },
      { key: 'computedAmount', label: 'Amount', type: 'currency' },
      { key: 'computedBalance', label: 'Balance', type: 'currency' },
      { key: 'status', label: 'Status', type: 'string' },
    ],
  };
};

const executeSalesByBranch = (sales: any[], params: Record<string, any>): QueryResult => {
  const filtered = filterByPeriod(sales, 'date', params.period, params.offset, params.quarter);
  const data = Object.entries(groupBy(filtered, 'subAccountName' as string)).map(([branch, items]) => ({
    branch: branch === 'Unknown' ? 'Main' : branch,
    count: items.length,
    total: items.reduce((s: number, i: any) => s + getAmount(i), 0),
  }));
  const grandTotal = sumBy(data, 'total');
  return {
    type: 'sales_by_branch',
    title: 'Sales by Branch',
    description: `Sales breakdown across ${data.length} branch(es)`,
    data,
    summary: `${data.length} branches, total sales ${formatCurrency(grandTotal)}`,
    columns: [
      { key: 'branch', label: 'Branch', type: 'string' },
      { key: 'count', label: 'Transactions', type: 'number' },
      { key: 'total', label: 'Total Sales', type: 'currency' },
    ],
  };
};

const executeLargeExpenses = (expenses: any[], params: Record<string, any>): QueryResult => {
  const minAmount = params.minAmount || 500000;
  const currency = params.currency || 'MWK';
  const large = expenses.filter((exp: any) => getAmount(exp) >= minAmount).sort((a: any, b: any) => getAmount(b) - getAmount(a));
  const total = sumBy(large, 'amount');
  return {
    type: 'large_expenses',
    title: `Large Expenses (>= ${formatCurrency(minAmount, currency)})`,
    description: `${large.length} expense(s) of ${formatCurrency(minAmount, currency)} or more`,
    data: large.map(e => ({ ...e, vendor_name: val(e, 'vendor_name', 'vendor', 'supplierName') || '-' })),
    summary: `${large.length} expense(s) totaling ${formatCurrency(total, currency)}`,
    columns: [
      { key: 'date', label: 'Date', type: 'date' },
      { key: 'description', label: 'Description', type: 'string' },
      { key: 'category', label: 'Category', type: 'string' },
      { key: 'amount', label: 'Amount', type: 'currency' },
      { key: 'vendor_name', label: 'Vendor', type: 'string' },
    ],
  };
};

const executeTopCustomers = (sales: any[], params: Record<string, any>): QueryResult => {
  const limit = params.limit || 10;
  const filtered = filterByPeriod(sales, 'date', params.period, params.offset);
  const grouped = groupBy(filtered, 'customerName' as string);
  const data = Object.entries(grouped)
    .map(([name, items]) => ({
      customerName: name,
      transactionCount: items.length,
      totalSpent: items.reduce((s: number, i: any) => s + getAmount(i), 0),
    }))
    .sort((a, b) => b.totalSpent - a.totalSpent)
    .slice(0, limit);
  const grandTotal = sumBy(data, 'totalSpent');
  return {
    type: 'top_customers',
    title: `Top ${limit} Customers`,
    description: `${data.length} top customer(s) by spending`,
    data,
    summary: `Top ${data.length} customer(s) with total spending of ${formatCurrency(grandTotal)}`,
    columns: [
      { key: 'customerName', label: 'Customer', type: 'string' },
      { key: 'transactionCount', label: 'Transactions', type: 'number' },
      { key: 'totalSpent', label: 'Total Spent', type: 'currency' },
    ],
  };
};

const executeSalesTrend = (sales: any[], params: Record<string, any>): QueryResult => {
  const filtered = filterByPeriod(sales, 'date', params.period, params.offset, params.quarter);
  const grouped = groupBy(filtered, 'date' as string);
  const data = Object.entries(grouped)
    .map(([date, items]) => ({
      date,
      count: items.length,
      total: items.reduce((s: number, i: any) => s + getAmount(i), 0),
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
  const grandTotal = sumBy(data, 'total');
  return {
    type: 'sales_trend',
    title: 'Sales Trend',
    description: `Sales trend over ${data.length} period(s)`,
    data,
    summary: `${data.length} data points, total ${formatCurrency(grandTotal)}`,
    columns: [
      { key: 'date', label: 'Date', type: 'date' },
      { key: 'count', label: 'Transactions', type: 'number' },
      { key: 'total', label: 'Total', type: 'currency' },
    ],
  };
};

const executeInventoryAlert = (inventory: any[], purchases: any[]): QueryResult => {
  const reorderField = inventory.some((i: any) => 'reorderPoint' in i) ? 'reorderPoint' : ('minStockLevel' in (inventory[0] || {}) ? 'minStockLevel' : 'reorderPoint');
  const stockField = inventory.some((i: any) => 'stock' in i) ? 'stock' : 'quantity';
  const alerts = inventory.filter((item: any) => {
    const stock = Number(val(item, 'stock', 'quantity', 'currentStock')) || 0;
    const reorder = Number(val(item, 'reorderPoint', 'minStockLevel', 'reorderLevel', 'minStock')) || 0;
    return stock <= reorder;
  });
  return {
    type: 'inventory_alert',
    title: 'Inventory Alerts',
    description: `${alerts.length} item(s) at or below reorder level`,
    data: alerts.map(i => ({ ...i, itemName: getItemName(i), stockField: Number(val(i, 'stock', 'quantity', 'currentStock')) || 0, reorderField: Number(val(i, 'reorderPoint', 'minStockLevel', 'reorderLevel', 'minStock')) || 0 })),
    summary: `${alerts.length} item(s) need restocking`,
    columns: [
      { key: 'itemName', label: 'Item', type: 'string' },
      { key: 'sku', label: 'SKU', type: 'string' },
      { key: 'stockField', label: 'Current Stock', type: 'number' },
      { key: 'reorderField', label: 'Reorder Level', type: 'number' },
    ],
  };
};

const executeCustomerHistory = (sales: any[], params: Record<string, any>): QueryResult => {
  const name = params.customerName || 'Unknown';
  const lowerName = name.toLowerCase();
  const customerSales = sales.filter((s: any) =>
    (s.customerName || '').toLowerCase().includes(lowerName)
  );
  const total = sumBy(customerSales, 'totalAmount');
  return {
    type: 'customer_history',
    title: `Purchase History: ${name}`,
    description: `${customerSales.length} transaction(s) for ${name}`,
    data: customerSales,
    summary: `${customerSales.length} transaction(s), total ${formatCurrency(total)}`,
    columns: [
      { key: 'date', label: 'Date', type: 'date' },
      { key: 'invoiceNumber', label: 'Invoice #', type: 'string' },
      { key: 'totalAmount', label: 'Amount', type: 'currency' },
      { key: 'status', label: 'Status', type: 'string' },
    ],
  };
};

const executeProfitAnalysis = (sales: any[], purchases: any[], params: Record<string, any>): QueryResult => {
  const filtered = filterByPeriod(sales, 'date', params.period, params.offset, params.quarter);

  if (params.focus === 'products') {
    // Aggregate product-level data from sales items
    const productMap: Record<string, { revenue: number; cost: number; count: number }> = {};
    filtered.forEach((s: any) => {
      (s.items || []).forEach((item: any) => {
        const name = getItemName(item);
        if (!productMap[name]) productMap[name] = { revenue: 0, cost: 0, count: 0 };
        productMap[name].revenue += Number(val(item, 'lineTotalNet', 'total', 'price')) || 0;
        productMap[name].cost += Number(val(item, 'cost', 'unitCost')) || 0;
        productMap[name].count += Number(item.quantity) || 1;
      });
    });
    const data = Object.entries(productMap)
      .map(([itemName, vals]) => ({
        itemName,
        revenue: vals.revenue,
        cost: vals.cost,
        profit: vals.revenue - vals.cost,
        margin: vals.revenue > 0 ? ((vals.revenue - vals.cost) / vals.revenue) * 100 : 0,
      }))
      .sort((a, b) => b.profit - a.profit)
      .slice(0, 20);
    const totalProfit = sumBy(data, 'profit');
    return {
      type: 'profit_analysis',
      title: 'Most Profitable Products',
      description: `${data.length} products ranked by profitability`,
      data,
      summary: `Total profit from top products: ${formatCurrency(totalProfit)}`,
      columns: [
        { key: 'itemName', label: 'Product', type: 'string' },
        { key: 'revenue', label: 'Revenue', type: 'currency' },
        { key: 'cost', label: 'Cost', type: 'currency' },
        { key: 'profit', label: 'Profit', type: 'currency' },
        { key: 'margin', label: 'Margin %', type: 'number' },
      ],
    };
  }

  const totalRevenue = filtered.reduce((s: number, i: any) => s + getAmount(i), 0);
  const totalCost = filtered.reduce((s: number, i: any) => s + Number(val(i, 'cost', 'materialTotal', 'materialCost') || 0), 0) || totalRevenue * 0.6;
  const totalProfit = totalRevenue - totalCost;
  const margin = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0;
  return {
    type: 'profit_analysis',
    title: 'Profit Analysis',
    description: `Revenue: ${formatCurrency(totalRevenue)}, Cost: ${formatCurrency(totalCost)}, Profit: ${formatCurrency(totalProfit)}`,
    data: filtered,
    summary: `Net profit ${formatCurrency(totalProfit)} (${margin.toFixed(1)}% margin) on ${filtered.length} transaction(s)`,
    columns: [
      { key: 'date', label: 'Date', type: 'date' },
      { key: 'customerName', label: 'Customer', type: 'string' },
      { key: 'totalAmount', label: 'Revenue', type: 'currency' },
      { key: 'cost', label: 'Cost', type: 'currency' },
    ],
  };
};

const executeSalesByCategory = (sales: any[], params: Record<string, any>): QueryResult => {
  const filtered = filterByPeriod(sales, 'date', params.period || 'all', params.offset || 0);
  // Aggregate from items array to get category/product-level data
  const catMap: Record<string, { count: number; total: number }> = {};
  filtered.forEach((s: any) => {
    const items = s.items || [];
    if (items.length === 0) {
      const cat = val(s, 'category', 'itemName') || 'Uncategorized';
      if (!catMap[cat]) catMap[cat] = { count: 0, total: 0 };
      catMap[cat].count += 1;
      catMap[cat].total += getAmount(s);
    } else {
      items.forEach((item: any) => {
        const cat = val(item, 'category', 'name', 'itemName') || 'Uncategorized';
        if (!catMap[cat]) catMap[cat] = { count: 0, total: 0 };
        catMap[cat].count += 1;
        catMap[cat].total += Number(val(item, 'lineTotalNet', 'total', 'price')) || 0;
      });
    }
  });
  const data = Object.entries(catMap)
    .map(([category, vals]) => ({ category, count: vals.count, total: vals.total }))
    .sort((a, b) => b.total - a.total);
  const grandTotal = sumBy(data, 'total');
  return {
    type: 'sales_by_category',
    title: 'Sales by Product Category',
    description: `Revenue grouped by product`,
    data,
    summary: `${data.length} categories, total sales ${formatCurrency(grandTotal)}`,
    columns: [
      { key: 'category', label: 'Category', type: 'string' },
      { key: 'count', label: 'Transactions', type: 'number' },
      { key: 'total', label: 'Total Sales', type: 'currency' },
    ],
  };
};

const executeCashFlow = (invoices: any[], expenses: any[]): QueryResult => {
  const paidInvoices = invoices.filter((inv: any) => inv.status === 'paid');
  const totalInflow = paidInvoices.reduce((s: number, i: any) => s + getAmount(i), 0);
  const totalOutflow = expenses.reduce((s: number, i: any) => s + getAmount(i), 0);
  const data = [
    { category: 'Inflow (Paid Invoices)', amount: totalInflow },
    { category: 'Outflow (Expenses)', amount: totalOutflow },
    { category: 'Net Cash Flow', amount: totalInflow - totalOutflow },
  ];
  return {
    type: 'cash_flow',
    title: 'Cash Flow Summary',
    description: `Inflow: ${formatCurrency(totalInflow)}, Outflow: ${formatCurrency(totalOutflow)}`,
    data,
    summary: `Net cash flow: ${formatCurrency(totalInflow - totalOutflow)}`,
    columns: [
      { key: 'category', label: 'Category', type: 'string' },
      { key: 'amount', label: 'Amount', type: 'currency' },
    ],
  };
};

const executePaymentHistoryTop = (sales: any[]): QueryResult => {
  const grouped = groupBy(sales, 'customerName');
  const topCustomer = Object.entries(grouped)
    .map(([name, items]) => ({
      name,
      total: items.reduce((s: number, i: any) => s + getAmount(i), 0),
    }))
    .sort((a, b) => b.total - a.total)[0];

  if (!topCustomer) {
    return {
      type: 'payment_history_top',
      title: 'Payment History',
      description: 'No customer data available',
      data: [],
      summary: 'No sales data found',
      columns: [
        { key: 'date', label: 'Date', type: 'date' },
        { key: 'invoiceNumber', label: 'Invoice #', type: 'string' },
        { key: 'totalAmount', label: 'Amount', type: 'currency' },
        { key: 'status', label: 'Status', type: 'string' },
      ],
    };
  }

  const customerSales = grouped[topCustomer.name];
  const total = customerSales.reduce((s: number, i: any) => s + getAmount(i), 0);
  return {
    type: 'payment_history_top',
    title: `Payment History: ${topCustomer.name}`,
    description: `Payment history for top customer (total spent: ${formatCurrency(topCustomer.total)})`,
    data: customerSales,
    summary: `${customerSales.length} transaction(s), total ${formatCurrency(total)}`,
    columns: [
      { key: 'date', label: 'Date', type: 'date' },
      { key: 'invoiceNumber', label: 'Invoice #', type: 'string' },
      { key: 'totalAmount', label: 'Amount', type: 'currency' },
      { key: 'status', label: 'Status', type: 'string' },
    ],
  };
};

const executeInventoryValue = (inventory: any[]): QueryResult => {
  const data = inventory
    .map((item: any) => {
      const qty = Number(val(item, 'stock', 'quantity', 'currentStock')) || 0;
      const price = Number(val(item, 'cost', 'price', 'unitPrice', 'costPrice')) || 0;
      return {
        itemName: getItemName(item),
        sku: item.sku || '-',
        quantity: qty,
        unitPrice: price,
        totalValue: qty * price,
      };
    })
    .sort((a, b) => b.totalValue - a.totalValue);
  const totalValue = sumBy(data, 'totalValue');
  return {
    type: 'inventory_value',
    title: 'Inventory Value Summary',
    description: `${data.length} item(s) with total value ${formatCurrency(totalValue)}`,
    data,
    summary: `Total inventory value: ${formatCurrency(totalValue)}`,
    columns: [
      { key: 'itemName', label: 'Item', type: 'string' },
      { key: 'sku', label: 'SKU', type: 'string' },
      { key: 'quantity', label: 'Qty', type: 'number' },
      { key: 'unitPrice', label: 'Unit Price', type: 'currency' },
      { key: 'totalValue', label: 'Total Value', type: 'currency' },
    ],
  };
};

const executeCustomerBalances = (invoices: any[]): QueryResult => {
  const withBalance = invoices
    .filter((inv: any) => {
      const balance = getAmount(inv) - Number(val(inv, 'paidAmount', 'paid') || 0);
      return balance > 0;
    })
    .map((inv: any) => ({
      ...inv,
      computedBalance: getAmount(inv) - Number(val(inv, 'paidAmount', 'paid') || 0),
    }));
  const grouped = groupBy(withBalance, 'customerName');
  const data = Object.entries(grouped)
    .map(([name, items]) => ({
      customerName: name,
      invoiceCount: items.length,
      totalBalance: items.reduce((s: number, i: any) => s + i.computedBalance, 0),
    }))
    .sort((a, b) => b.totalBalance - a.totalBalance);
  const grandTotal = sumBy(data, 'totalBalance');
  return {
    type: 'customer_balances',
    title: 'Customers with Balances',
    description: `${data.length} customer(s) with outstanding balances`,
    data,
    summary: `Total outstanding: ${formatCurrency(grandTotal)} across ${data.length} customer(s)`,
    columns: [
      { key: 'customerName', label: 'Customer', type: 'string' },
      { key: 'invoiceCount', label: 'Open Invoices', type: 'number' },
      { key: 'totalBalance', label: 'Total Balance', type: 'currency' },
    ],
  };
};

const executeCustomerBehavior = (invoices: any[]): QueryResult => {
  const withStatus = invoices.filter((inv: any) => inv.status);
  const grouped = groupBy(withStatus, 'customerName');
  const data = Object.entries(grouped)
    .map(([name, items]) => {
      const paid = items.filter((i: any) => i.status === 'paid').length;
      const late = items.filter((i: any) => i.status === 'late' || i.status === 'overdue').length;
      const unpaid = items.filter((i: any) => i.status !== 'paid' && i.status !== 'late' && i.status !== 'overdue').length;
      return {
        customerName: name,
        totalInvoices: items.length,
        paidOnTime: paid,
        late,
        unpaid,
        onTimeRate: items.length > 0 ? Math.round((paid / items.length) * 100) : 0,
      };
    })
    .sort((a, b) => a.onTimeRate - b.onTimeRate);
  return {
    type: 'customer_behavior',
    title: 'Customer Payment Behavior',
    description: `${data.length} customer(s) analyzed for payment patterns`,
    data,
    summary: `${data.filter(d => d.onTimeRate >= 80).length} customer(s) with ≥80% on-time payment rate`,
    columns: [
      { key: 'customerName', label: 'Customer', type: 'string' },
      { key: 'totalInvoices', label: 'Total Invoices', type: 'number' },
      { key: 'paidOnTime', label: 'Paid On Time', type: 'number' },
      { key: 'late', label: 'Late', type: 'number' },
      { key: 'unpaid', label: 'Unpaid', type: 'number' },
      { key: 'onTimeRate', label: 'On-Time %', type: 'number' },
    ],
  };
};

const executePurchaseOrders = (purchases: any[]): QueryResult => {
  const now = new Date();
  const thisMonth = purchases.filter((p: any) => {
    if (!p.date) return false;
    const d = new Date(p.date);
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  });
  const total = thisMonth.reduce((s: number, p: any) => s + getAmount(p), 0);
  const refField = thisMonth.some((p: any) => val(p, 'reference', 'poNumber', 'orderNumber')) ? 'reference' : 'id';
  return {
    type: 'purchase_orders',
    title: 'Purchase Orders This Month',
    description: `${thisMonth.length} purchase order(s) this month`,
    data: thisMonth.map(p => ({
      ...p,
      vendor_name: val(p, 'vendor_name', 'vendor', 'supplierName', 'supplierId') || '-',
    })),
    summary: `${thisMonth.length} purchase(s), total ${formatCurrency(total)}`,
    columns: [
      { key: 'date', label: 'Date', type: 'date' },
      { key: refField, label: 'Reference', type: 'string' },
      { key: 'vendor_name', label: 'Vendor', type: 'string' },
      { key: 'totalAmount', label: 'Amount', type: 'currency' },
      { key: 'status', label: 'Status', type: 'string' },
    ],
  };
};

const executeExpenseByCategory = (expenses: any[]): QueryResult => {
  const grouped = groupBy(expenses, 'category' as string);
  const data = Object.entries(grouped)
    .map(([category, items]) => ({
      category,
      count: items.length,
      total: sumBy(items, 'amount'),
    }))
    .sort((a, b) => b.total - a.total);
  const grandTotal = sumBy(data, 'total');
  return {
    type: 'expense_by_category',
    title: 'Expense Breakdown by Category',
    description: `${data.length} expense categories totaling ${formatCurrency(grandTotal)}`,
    data,
    summary: `${data.length} categories, total ${formatCurrency(grandTotal)}`,
    columns: [
      { key: 'category', label: 'Category', type: 'string' },
      { key: 'count', label: 'Transactions', type: 'number' },
      { key: 'total', label: 'Total', type: 'currency' },
    ],
  };
};

const executeTopBranch = (sales: any[]): QueryResult => {
  const data = Object.entries(groupBy(sales, 'subAccountName' as string))
    .map(([branch, items]) => ({
      branch: branch === 'Unknown' ? 'Main' : branch,
      count: items.length,
      total: items.reduce((s: number, i: any) => s + getAmount(i), 0),
    }))
    .sort((a, b) => b.total - a.total);
  const top = data[0];
  return {
    type: 'top_branch',
    title: 'Best Performing Branch',
    description: top ? `${top.branch} leads with ${formatCurrency(top.total)} in sales (${data.length} branches total)` : 'No data',
    data: data.slice(0, 5),
    summary: top ? `Top branch: ${top.branch} - ${formatCurrency(top.total)}` : 'No sales data found',
    columns: [
      { key: 'branch', label: 'Branch', type: 'string' },
      { key: 'count', label: 'Transactions', type: 'number' },
      { key: 'total', label: 'Total Sales', type: 'currency' },
    ],
  };
};

export const executeQuery = (
  query: string,
  data: { sales: any[]; invoices: any[]; expenses: any[]; customers: any[]; inventory: any[]; purchases: any[] }
): QueryResult => {
  const interpreted = interpretQuery(query);

  switch (interpreted.type) {
    case 'unpaid_invoices':
      return executeUnpaidInvoices(data.invoices);
    case 'sales_by_branch':
      return executeSalesByBranch(data.sales, interpreted.params);
    case 'large_expenses':
      return executeLargeExpenses(data.expenses, interpreted.params);
    case 'top_customers':
      return executeTopCustomers(data.sales, interpreted.params);
    case 'sales_trend':
      return executeSalesTrend(data.sales, interpreted.params);
    case 'inventory_alert':
      return executeInventoryAlert(data.inventory, data.purchases);
    case 'customer_history':
      return executeCustomerHistory(data.sales, interpreted.params);
    case 'profit_analysis':
      return executeProfitAnalysis(data.sales, data.purchases, interpreted.params);
    case 'sales_by_category':
      return executeSalesByCategory(data.sales, interpreted.params);
    case 'cash_flow':
      return executeCashFlow(data.invoices, data.expenses);
    case 'payment_history_top':
      return executePaymentHistoryTop(data.sales);
    case 'inventory_value':
      return executeInventoryValue(data.inventory);
    case 'customer_balances':
      return executeCustomerBalances(data.invoices);
    case 'customer_behavior':
      return executeCustomerBehavior(data.invoices);
    case 'purchase_orders':
      return executePurchaseOrders(data.purchases);
    case 'expense_by_category':
      return executeExpenseByCategory(data.expenses);
    case 'top_branch':
      return executeTopBranch(data.sales);
    default:
      return {
        type: 'unknown',
        title: 'Unknown Query',
        description: `Could not interpret: "${query}"`,
        data: [],
        summary: 'No results. Try one of the suggested queries.',
        columns: [],
      };
  }
};

export const generateQuerySuggestions = (): QuerySuggestion[] => [
  // Revenue & Sales
  { query: 'Sales this month vs last month', description: 'Compare current month sales with previous month', icon: 'trending_up', category: 'Revenue & Sales' },
  { query: 'Sales by branch this quarter', description: 'Compare sales performance across branches for this quarter', icon: 'store', category: 'Revenue & Sales' },
  { query: 'Revenue by month this year', description: 'Monthly revenue breakdown for the current year', icon: 'bar_chart', category: 'Revenue & Sales' },
  { query: 'Most profitable products', description: 'Discover which products generate the highest profit margins', icon: 'bar_chart', category: 'Revenue & Sales' },
  { query: 'Sales by product category', description: 'Revenue grouped by product category', icon: 'category', category: 'Revenue & Sales' },
  { query: 'Top 10 customers this year', description: 'See your best customers ranked by total spending this year', icon: 'people', category: 'Revenue & Sales' },

  // Invoices & Payments
  { query: 'Show unpaid invoices', description: 'View all outstanding invoices that are still unpaid', icon: 'receipt', category: 'Invoices & Payments' },
  { query: 'Expenses over MWK 500,000', description: 'Find large expenses exceeding MWK 500,000', icon: 'money_off', category: 'Invoices & Payments' },
  { query: 'Overdue invoices by customer', description: 'List overdue invoices grouped by customer', icon: 'warning', category: 'Invoices & Payments' },
  { query: 'Cash flow summary', description: 'View cash inflows and outflows over the selected period', icon: 'account_balance', category: 'Invoices & Payments' },
  { query: 'Payment history for top customer', description: 'Payment pattern analysis for your highest-value customer', icon: 'history', category: 'Invoices & Payments' },

  // Inventory & Stock
  { query: 'Inventory below reorder level', description: 'Check stock items that need to be reordered', icon: 'inventory', category: 'Inventory & Stock' },
  { query: 'Items with highest profit margin', description: 'Products with the best markup and margin percentages', icon: 'trending_up', category: 'Inventory & Stock' },
  { query: 'Low stock alerts', description: 'Items where stock quantity is critically low', icon: 'warning', category: 'Inventory & Stock' },
  { query: 'Inventory value summary', description: 'Total value of current stock on hand', icon: 'payments', category: 'Inventory & Stock' },

  // Customers & Analysis
  { query: 'Top spending customers', description: 'Customers ranked by total purchase value', icon: 'people', category: 'Customers & Analysis' },
  { query: 'Customers with balances', description: 'Show all customers and their outstanding balances', icon: 'people', category: 'Customers & Analysis' },
  { query: 'Customer payment behavior', description: 'Analyze on-time vs late payment patterns by customer', icon: 'insights', category: 'Customers & Analysis' },

  // Expenses & Procurement
  { query: 'Purchase orders this month', description: 'List all purchase orders created this month', icon: 'shopping_cart', category: 'Expenses & Procurement' },
  { query: 'Expense breakdown by category', description: 'Total expenses grouped by expense category', icon: 'money_off', category: 'Expenses & Procurement' },
  { query: 'Best performing branch', description: 'Branch with highest revenue and profit margin', icon: 'business', category: 'Expenses & Procurement' },
];
