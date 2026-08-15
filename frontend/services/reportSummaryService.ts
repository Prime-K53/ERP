const toSafeNumber = (value: unknown, fallback = 0): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const toSafeString = (value: unknown, fallback = ''): string => {
  if (value === null || value === undefined) return fallback;
  return String(value);
};

const toDate = (value: unknown): Date => {
  const d = new Date(toSafeString(value));
  return Number.isFinite(d.getTime()) ? d : new Date();
};

const sumBy = (items: any[], field: string): number =>
  items.reduce((s, item) => s + toSafeNumber(item[field]), 0);

const groupBy = <T>(items: T[], key: string): Record<string, T[]> =>
  items.reduce((acc, item) => {
    const k = toSafeString((item as any)[key], 'Unknown');
    if (!acc[k]) acc[k] = [];
    acc[k].push(item);
    return acc;
  }, {} as Record<string, T[]>);

const pickTop = <T>(map: Record<string, T[]>, valueField: string, count: number): { key: string; total: number }[] =>
  Object.entries(map)
    .map(([key, items]) => ({ key, total: items.reduce((s, item) => s + toSafeNumber((item as any)[valueField]), 0) }))
    .sort((a, b) => b.total - a.total)
    .slice(0, count);

const splitDateRange = (start: string, end: string): { firstHalf: { start: string; end: string }; secondHalf: { start: string; end: string } } => {
  const startDate = toDate(start);
  const endDate = toDate(end);
  const midPoint = new Date(startDate.getTime() + (endDate.getTime() - startDate.getTime()) / 2);
  return {
    firstHalf: { start: startDate.toISOString(), end: midPoint.toISOString() },
    secondHalf: { start: midPoint.toISOString(), end: endDate.toISOString() },
  };
};

const computePeriodChange = (
  items: any[],
  dateField: string,
  valueField: string,
  dateRange: { start: string; end: string }
): { current: number; previous: number; change: string; direction: 'up' | 'down' | 'neutral' } => {
  const { firstHalf, secondHalf } = splitDateRange(dateRange.start, dateRange.end);
  const firstTotal = items
    .filter((item) => {
      const d = toDate(item[dateField]);
      return d >= toDate(firstHalf.start) && d < toDate(firstHalf.end);
    })
    .reduce((s, item) => s + toSafeNumber(item[valueField]), 0);
  const secondTotal = items
    .filter((item) => {
      const d = toDate(item[dateField]);
      return d >= toDate(secondHalf.start) && d <= toDate(secondHalf.end);
    })
    .reduce((s, item) => s + toSafeNumber(item[valueField]), 0);
  const diff = secondTotal - firstTotal;
  const pct = firstTotal !== 0 ? (diff / Math.abs(firstTotal)) * 100 : (diff !== 0 ? 100 : 0);
  const direction: 'up' | 'down' | 'neutral' = diff > 0.01 ? 'up' : diff < -0.01 ? 'down' : 'neutral';
  const change = `${pct > 0 ? '+' : ''}${pct.toFixed(1)}%`;
  return { current: secondTotal, previous: firstTotal, change, direction };
};

const computeSimplePeriodChange = (
  current: number,
  previous: number
): { change: string; direction: 'up' | 'down' | 'neutral' } => {
  const diff = current - previous;
  const pct = previous !== 0 ? (diff / Math.abs(previous)) * 100 : (diff !== 0 ? 100 : 0);
  const direction: 'up' | 'down' | 'neutral' = diff > 0.01 ? 'up' : diff < -0.01 ? 'down' : 'neutral';
  const change = `${pct > 0 ? '+' : ''}${pct.toFixed(1)}%`;
  return { change, direction };
};

export const formatCurrency = (value: number, currency = 'MK'): string => {
  return `${currency} ${Math.abs(value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

export const formatPercent = (value: number): string => {
  return `${value.toFixed(1)}%`;
};

const findTopCategory = (sales: any[], invoices: any[]): string => {
  const all = [...sales, ...invoices];
  const categories: Record<string, number> = {};
  all.forEach((item) => {
    const items = Array.isArray(item.items) ? item.items : [];
    items.forEach((line: any) => {
      const cat = toSafeString(line.category || line.productCategory || line.type, 'General');
      const qty = toSafeNumber(line.quantity, 1);
      categories[cat] = (categories[cat] || 0) + qty;
    });
  });
  const sorted = Object.entries(categories).sort((a, b) => b[1] - a[1]);
  return sorted.length > 0 ? sorted[0][0] : 'N/A';
};

const findTopCustomer = (sales: any[], invoices: any[]): string => {
  const all = [...sales, ...invoices];
  const customerTotals: Record<string, number> = {};
  all.forEach((item) => {
    const name = toSafeString(item.customerName || item.customer_name, 'Walk-in');
    const total = toSafeNumber(item.total || item.totalAmount || item.amount);
    customerTotals[name] = (customerTotals[name] || 0) + total;
  });
  const sorted = Object.entries(customerTotals).sort((a, b) => b[1] - a[1]);
  return sorted.length > 0 ? sorted[0][0] : 'N/A';
};

const computeInventoryTurnover = (inventory: any[], transactions: any[]): number => {
  const totalSalesQty = transactions.reduce((s, t) => {
    const items = Array.isArray(t.items) ? t.items : [];
    return s + items.reduce((si, line) => si + toSafeNumber(line.quantity), 0);
  }, 0);
  const avgInventory = inventory.reduce((s, item) => s + toSafeNumber(item.stock || item.quantity || item.currentStock, 0), 0) / Math.max(1, inventory.length);
  return avgInventory > 0 ? totalSalesQty / avgInventory : 0;
};

const buildHighlights = (
  revenue: number,
  expenses: number,
  netProfit: number,
  profitMargin: number,
  totalSales: number,
  totalInvoices: number,
  topCategory: string,
  topCustomer: string
): string[] => {
  const highlights: string[] = [];
  if (netProfit > 0) highlights.push(`Net profit of ${formatCurrency(netProfit)} indicates a profitable period.`);
  if (profitMargin > 20) highlights.push(`Profit margin of ${formatPercent(profitMargin)} exceeds the 20% benchmark.`);
  if (totalSales > 0 || totalInvoices > 0) highlights.push(`${totalSales + totalInvoices} total transactions processed during the period.`);
  if (topCategory !== 'N/A') highlights.push(`Top product category: "${topCategory}" drove the highest volume.`);
  if (topCustomer !== 'N/A') highlights.push(`Top customer "${topCustomer}" contributed the most revenue.`);
  if (revenue > expenses) highlights.push(`Revenue of ${formatCurrency(revenue)} covers all expenses with a surplus.`);
  return highlights.slice(0, 5);
};

const buildRecommendations = (
  netProfit: number,
  profitMargin: number,
  expenses: number,
  inventory: any[],
  sales: any[],
  invoices: any[]
): string[] => {
  const recs: string[] = [];
  if (profitMargin < 10) recs.push('Consider reviewing pricing strategy to improve profit margins above 10%.');
  if (expenses > 0 && profitMargin < 15) recs.push('Evaluate operational expenses for potential cost reduction opportunities.');
  const lowStock = inventory.filter((item) => {
    const stock = toSafeNumber(item.stock || item.quantity || item.currentStock, 0);
    const reorder = toSafeNumber(item.reorderLevel || item.minStock || item.minStockLevel, 0);
    return stock <= reorder;
  });
  if (lowStock.length > 3) recs.push(`${lowStock.length} items are at or below reorder level; prioritize restocking.`);
  const allTx = [...sales, ...invoices];
  const unpaid = allTx.filter((t) => {
    const status = toSafeString(t.status).toLowerCase();
    return status === 'pending' || status === 'unpaid' || status === 'overdue';
  });
  if (unpaid.length > 0) recs.push(`${unpaid.length} transactions have outstanding balances; follow up on collections.`);
  if (recs.length === 0) recs.push('Business metrics look healthy. Continue monitoring key indicators.');
  return recs.slice(0, 3);
};

export const generateExecutiveSummary = (data: {
  sales: any[];
  invoices: any[];
  expenses: any[];
  inventory: any[];
  dateRange: { start: string; end: string };
}): {
  title: string;
  summary: string;
  highlights: string[];
  metrics: { label: string; value: string; change: string; direction: 'up' | 'down' | 'neutral' }[];
  recommendations: string[];
} => {
  const { sales = [], invoices = [], expenses = [], inventory = [], dateRange } = data;

  const paidInvoices = invoices.filter((inv) => {
    const status = toSafeString(inv.status).toLowerCase();
    return status === 'paid' || status === 'completed';
  });

  const totalRevenue = sumBy(sales, 'total') + sumBy(sales, 'totalAmount') + sumBy(paidInvoices, 'total') + sumBy(paidInvoices, 'totalAmount') + sumBy(paidInvoices, 'amount');
  const totalExpenses = sumBy(expenses, 'amount') + sumBy(expenses, 'total');
  const netProfit = totalRevenue - totalExpenses;
  const profitMargin = totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : 0;
  const totalSalesTransactions = sales.length;
  const totalInvoicesIssued = invoices.length;
  const allTx = [...sales, ...invoices];
  const avgTransactionValue = allTx.length > 0 ? totalRevenue / allTx.length : 0;
  const topCategory = findTopCategory(sales, invoices);
  const inventoryTurnover = computeInventoryTurnover(inventory, allTx);
  const topCustomer = findTopCustomer(sales, invoices);

  const revenueChange = computePeriodChange(
    [...sales, ...paidInvoices],
    'date',
    'total',
    dateRange
  );
  const expenseChange = computePeriodChange(expenses, 'date', 'amount', dateRange);
  const profitChange = computeSimplePeriodChange(revenueChange.current - expenseChange.current, revenueChange.previous - expenseChange.previous);

  const highlights = buildHighlights(totalRevenue, totalExpenses, netProfit, profitMargin, totalSalesTransactions, totalInvoicesIssued, topCategory, topCustomer);
  const recommendations = buildRecommendations(netProfit, profitMargin, totalExpenses, inventory, sales, invoices);

  const summary = `During this period, the business generated ${formatCurrency(totalRevenue)} in revenue against ${formatCurrency(totalExpenses)} in expenses, resulting in a net ${netProfit >= 0 ? 'profit' : 'loss'} of ${formatCurrency(Math.abs(netProfit))} (${formatPercent(profitMargin)} margin). ${totalSalesTransactions} sales and ${totalInvoicesIssued} invoices were processed with an average transaction value of ${formatCurrency(avgTransactionValue)}.`;

  return {
    title: 'Executive Summary',
    summary,
    highlights,
    metrics: [
      { label: 'Total Revenue', value: formatCurrency(totalRevenue), change: revenueChange.change, direction: revenueChange.direction },
      { label: 'Total Expenses', value: formatCurrency(totalExpenses), change: expenseChange.change, direction: expenseChange.direction },
      { label: 'Net Profit', value: formatCurrency(netProfit), change: profitChange.change, direction: profitChange.direction },
      { label: 'Profit Margin', value: formatPercent(profitMargin), change: profitChange.change, direction: profitChange.direction },
      { label: 'Sales Transactions', value: String(totalSalesTransactions), change: revenueChange.change, direction: revenueChange.direction },
      { label: 'Invoices Issued', value: String(totalInvoicesIssued), change: computePeriodChange(invoices, 'date', 'total', dateRange).change, direction: computePeriodChange(invoices, 'date', 'total', dateRange).direction },
      { label: 'Avg Transaction Value', value: formatCurrency(avgTransactionValue), change: computeSimplePeriodChange(avgTransactionValue, 0).change, direction: 'neutral' },
      { label: 'Top Category', value: topCategory, change: '', direction: 'neutral' },
      { label: 'Inventory Turnover', value: inventoryTurnover.toFixed(2), change: '', direction: 'neutral' },
      { label: 'Top Customer', value: topCustomer, change: '', direction: 'neutral' },
    ],
    recommendations,
  };
};

export const generateFinancialHealthScore = (data: {
  revenue: number;
  expenses: number;
  assets: number;
  liabilities: number;
  equity: number;
  profitMargin: number;
  currentRatio: number;
}): {
  score: number;
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
  breakdown: { category: string; score: number; maxScore: number; comment: string }[];
} => {
  const { profitMargin, currentRatio, liabilities, equity, revenue, expenses } = data;

  const revenueGrowth = revenue > 0 ? ((revenue - expenses) / revenue) * 100 : 0;
  const debtToEquity = equity > 0 ? liabilities / equity : 999;

  const calcProfitability = (): { score: number; comment: string } => {
    if (profitMargin > 20) return { score: 25, comment: `Profit margin ${formatPercent(profitMargin)} is excellent (>20%)` };
    if (profitMargin > 10) return { score: 18, comment: `Profit margin ${formatPercent(profitMargin)} is good (>10%)` };
    if (profitMargin > 5) return { score: 10, comment: `Profit margin ${formatPercent(profitMargin)} is fair (>5%)` };
    if (profitMargin > 0) return { score: 5, comment: `Profit margin ${formatPercent(profitMargin)} is marginal (>0%)` };
    return { score: 0, comment: `Negative profit margin ${formatPercent(profitMargin)}` };
  };

  const calcLiquidity = (): { score: number; comment: string } => {
    if (currentRatio > 2) return { score: 25, comment: `Current ratio ${currentRatio.toFixed(2)} indicates strong liquidity (>2)` };
    if (currentRatio > 1.5) return { score: 18, comment: `Current ratio ${currentRatio.toFixed(2)} is healthy (>1.5)` };
    if (currentRatio > 1) return { score: 10, comment: `Current ratio ${currentRatio.toFixed(2)} is adequate (>1)` };
    if (currentRatio > 0.5) return { score: 5, comment: `Current ratio ${currentRatio.toFixed(2)} is weak (>0.5)` };
    return { score: 0, comment: `Current ratio ${currentRatio.toFixed(2)} is critical` };
  };

  const calcDebt = (): { score: number; comment: string } => {
    if (debtToEquity < 0.5) return { score: 25, comment: `Debt-to-equity ${debtToEquity.toFixed(2)} is very low (<0.5)` };
    if (debtToEquity < 1) return { score: 18, comment: `Debt-to-equity ${debtToEquity.toFixed(2)} is low (<1)` };
    if (debtToEquity < 2) return { score: 10, comment: `Debt-to-equity ${debtToEquity.toFixed(2)} is moderate (<2)` };
    if (debtToEquity < 3) return { score: 5, comment: `Debt-to-equity ${debtToEquity.toFixed(2)} is high (<3)` };
    return { score: 0, comment: `Debt-to-equity ${debtToEquity.toFixed(2)} is very high` };
  };

  const calcGrowth = (): { score: number; comment: string } => {
    if (revenueGrowth > 20) return { score: 25, comment: `Revenue growth ${formatPercent(revenueGrowth)} is strong (>20%)` };
    if (revenueGrowth > 10) return { score: 18, comment: `Revenue growth ${formatPercent(revenueGrowth)} is solid (>10%)` };
    if (revenueGrowth > 5) return { score: 10, comment: `Revenue growth ${formatPercent(revenueGrowth)} is modest (>5%)` };
    if (revenueGrowth > 0) return { score: 5, comment: `Revenue growth ${formatPercent(revenueGrowth)} is minimal (>0%)` };
    return { score: 0, comment: `Negative revenue growth ${formatPercent(revenueGrowth)}` };
  };

  const profitability = calcProfitability();
  const liquidity = calcLiquidity();
  const debt = calcDebt();
  const growth = calcGrowth();

  const totalScore = profitability.score + liquidity.score + debt.score + growth.score;

  let grade: 'A' | 'B' | 'C' | 'D' | 'F';
  if (totalScore >= 90) grade = 'A';
  else if (totalScore >= 75) grade = 'B';
  else if (totalScore >= 60) grade = 'C';
  else if (totalScore >= 40) grade = 'D';
  else grade = 'F';

  return {
    score: totalScore,
    grade,
    breakdown: [
      { category: 'Profitability', score: profitability.score, maxScore: 25, comment: profitability.comment },
      { category: 'Liquidity', score: liquidity.score, maxScore: 25, comment: liquidity.comment },
      { category: 'Debt Management', score: debt.score, maxScore: 25, comment: debt.comment },
      { category: 'Growth', score: growth.score, maxScore: 25, comment: growth.comment },
    ],
  };
};

export const generateSalesReportSummary = (
  sales: any[],
  invoices: any[],
  period: string
): {
  title: string;
  summary: string;
  keyFindings: string[];
  trends: string[];
  charts: { type: string; title: string; description: string }[];
} => {
  const allTransactions = [...sales, ...invoices];
  const totalRevenue = allTransactions.reduce((s, t) => s + toSafeNumber(t.total || t.totalAmount || t.amount), 0);
  const transactionCount = allTransactions.length;
  const avgValue = transactionCount > 0 ? totalRevenue / transactionCount : 0;

  const byDate = groupBy(allTransactions, 'date');
  const dailyTotals = Object.entries(byDate).map(([date, items]) => ({
    date,
    total: items.reduce((s, t) => s + toSafeNumber(t.total || t.totalAmount || t.amount), 0),
    count: items.length,
  })).sort((a, b) => a.date.localeCompare(b.date));

  const byCustomer = pickTop(groupBy(allTransactions, 'customerName'), 'total', 5);

  const keyFindings: string[] = [];
  if (totalRevenue > 0) keyFindings.push(`Total sales revenue reached ${formatCurrency(totalRevenue)} across ${transactionCount} transactions.`);
  if (avgValue > 0) keyFindings.push(`Average transaction value was ${formatCurrency(avgValue)}.`);
  if (byCustomer.length > 0) keyFindings.push(`Top customer "${byCustomer[0].key}" accounted for ${formatCurrency(byCustomer[0].total)} in revenue.`);
  if (dailyTotals.length > 0) {
    const peakDay = dailyTotals.reduce((max, d) => d.total > max.total ? d : max, dailyTotals[0]);
    keyFindings.push(`Peak sales day was ${peakDay.date} with ${formatCurrency(peakDay.total)}.`);
  }

  const trends: string[] = [];
  if (dailyTotals.length >= 2) {
    const firstHalf = dailyTotals.slice(0, Math.floor(dailyTotals.length / 2));
    const secondHalf = dailyTotals.slice(Math.floor(dailyTotals.length / 2));
    const firstTotal = firstHalf.reduce((s, d) => s + d.total, 0);
    const secondTotal = secondHalf.reduce((s, d) => s + d.total, 0);
    if (secondTotal > firstTotal) trends.push('Sales revenue is trending upward in the latter part of the period.');
    else if (secondTotal < firstTotal) trends.push('Sales revenue declined in the latter part of the period.');
    else trends.push('Sales revenue remained stable throughout the period.');
  }

  return {
    title: `Sales Report — ${period}`,
    summary: `${transactionCount} transactions totaling ${formatCurrency(totalRevenue)} with an average of ${formatCurrency(avgValue)} per transaction.`,
    keyFindings,
    trends,
    charts: [
      { type: 'line', title: 'Daily Sales Trend', description: 'Revenue over time' },
      { type: 'bar', title: 'Top Customers', description: `Top ${byCustomer.length} customers by revenue` },
      { type: 'pie', title: 'Revenue Distribution', description: 'Revenue breakdown by customer' },
    ],
  };
};

export const generateExpenseReportSummary = (
  expenses: any[],
  period: string
): {
  title: string;
  summary: string;
  keyFindings: string[];
  categories: { name: string; amount: number; percentOfTotal: number }[];
  recommendations: string[];
} => {
  const totalExpenses = expenses.reduce((s, e) => s + toSafeNumber(e.amount || e.total), 0);
  const expenseCount = expenses.length;

  const byCategory = groupBy(expenses, 'category');
  const categories = Object.entries(byCategory)
    .map(([name, items]) => {
      const amount = items.reduce((s, e) => s + toSafeNumber(e.amount || e.total), 0);
      return {
        name,
        amount,
        percentOfTotal: totalExpenses > 0 ? (amount / totalExpenses) * 100 : 0,
      };
    })
    .sort((a, b) => b.amount - a.amount);

  const keyFindings: string[] = [];
  if (totalExpenses > 0) keyFindings.push(`Total expenses of ${formatCurrency(totalExpenses)} across ${expenseCount} entries.`);
  if (categories.length > 0) keyFindings.push(`Largest expense category is "${categories[0].name}" at ${formatCurrency(categories[0].amount)} (${formatPercent(categories[0].percentOfTotal)} of total).`);
  if (categories.length > 1) keyFindings.push(`Top 3 categories account for ${formatPercent(categories.slice(0, 3).reduce((s, c) => s + c.percentOfTotal, 0))} of all expenses.`);

  const recommendations: string[] = [];
  const topCat = categories[0];
  if (topCat && topCat.percentOfTotal > 40) recommendations.push(`"${topCat.name}" represents ${formatPercent(topCat.percentOfTotal)} of total expenses; review for optimization opportunities.`);
  if (expenseCount > 0 && totalExpenses / expenseCount > 10000) recommendations.push('High average expense value detected; consider implementing approval thresholds.');
  if (recommendations.length === 0) recommendations.push('Expense patterns appear reasonable. Continue monitoring for anomalies.');

  return {
    title: `Expense Report — ${period}`,
    summary: `${expenseCount} expense entries totaling ${formatCurrency(totalExpenses)} across ${categories.length} categories.`,
    keyFindings,
    categories,
    recommendations,
  };
};

export const generateInventoryReportSummary = (
  inventory: any[],
  transactions: any[]
): {
  title: string;
  summary: string;
  totalItems: number;
  totalValue: number;
  lowStockItems: number;
  overstockItems: number;
  topMovingItems: string[];
  recommendations: string[];
} => {
  const totalItems = inventory.length;
  const totalValue = inventory.reduce((s, item) => {
    const stock = toSafeNumber(item.stock || item.quantity || item.currentStock, 0);
    const cost = toSafeNumber(item.cost || item.unitCost || item.price, 0);
    return s + stock * cost;
  }, 0);

  const lowStock = inventory.filter((item) => {
    const stock = toSafeNumber(item.stock || item.quantity || item.currentStock, 0);
    const reorder = toSafeNumber(item.reorderLevel || item.minStock || item.minStockLevel, 0);
    return stock <= reorder;
  });

  const avgStock = inventory.reduce((s, item) => s + toSafeNumber(item.stock || item.quantity || item.currentStock, 0), 0) / Math.max(1, inventory.length);
  const overstock = inventory.filter((item) => {
    const stock = toSafeNumber(item.stock || item.quantity || item.currentStock, 0);
    return stock > avgStock * 2;
  });

  const itemMovement: Record<string, number> = {};
  (Array.isArray(transactions) ? transactions : []).forEach((tx) => {
    const items = Array.isArray(tx.items) ? tx.items : [];
    items.forEach((line: any) => {
      const name = toSafeString(line.productName || line.itemName || line.name, 'Unknown');
      itemMovement[name] = (itemMovement[name] || 0) + toSafeNumber(line.quantity, 1);
    });
  });

  const topMoving = Object.entries(itemMovement)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name]) => name);

  const recommendations: string[] = [];
  if (lowStock.length > 0) recommendations.push(`${lowStock.length} items are low in stock; reorder soon to avoid stockouts.`);
  if (overstock.length > 0) recommendations.push(`${overstock.length} items exceed twice the average stock level; consider promotions or reduced orders.`);
  if (totalValue > 0) recommendations.push(`Total inventory value is ${formatCurrency(totalValue)} across ${totalItems} items.`);
  if (recommendations.length === 0) recommendations.push('Inventory levels appear balanced. Continue periodic reviews.');

  return {
    title: 'Inventory Report Summary',
    summary: `${totalItems} items with a total value of ${formatCurrency(totalValue)}. ${lowStock.length} items need restocking, ${overstock.length} items are overstocked.`,
    totalItems,
    totalValue,
    lowStockItems: lowStock.length,
    overstockItems: overstock.length,
    topMovingItems: topMoving,
    recommendations,
  };
};
