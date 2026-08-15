import { roundMoney } from '../utils/roundingUtils';

const toNumber = (value: unknown, fallback = 0): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const toDate = (value: unknown): Date => {
  if (value instanceof Date) return value;
  const parsed = new Date(String(value || ''));
  return Number.isFinite(parsed.getTime()) ? parsed : new Date(0);
};

const isInRange = (date: Date, start: Date, end: Date): boolean => {
  return date >= start && date <= end;
};

const startOfDay = (d: Date): Date => {
  const result = new Date(d);
  result.setHours(0, 0, 0, 0);
  return result;
};

const endOfDay = (d: Date): Date => {
  const result = new Date(d);
  result.setHours(23, 59, 59, 999);
  return result;
};

const getDaysInMonth = (year: number, month: number): number => {
  return new Date(year, month, 0).getDate();
};

const getDayOfMonth = (date: Date): number => {
  return date.getDate();
};

const getWeekNumber = (date: Date): string => {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
};

const getLabel = (date: Date, period: 'daily' | 'weekly' | 'monthly'): string => {
  if (period === 'daily') return date.toISOString().slice(0, 10);
  if (period === 'weekly') return getWeekNumber(date);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
};

const getPeriodStart = (date: Date, period: 'daily' | 'weekly' | 'monthly'): Date => {
  const d = new Date(date);
  if (period === 'daily') return startOfDay(d);
  if (period === 'weekly') {
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    d.setDate(diff);
    return startOfDay(d);
  }
  return new Date(d.getFullYear(), d.getMonth(), 1);
};

const getPeriodEnd = (date: Date, period: 'daily' | 'weekly' | 'monthly'): Date => {
  const d = new Date(date);
  if (period === 'daily') return endOfDay(d);
  if (period === 'weekly') {
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? 0 : 7);
    d.setDate(diff);
    return endOfDay(d);
  }
  return endOfDay(new Date(d.getFullYear(), d.getMonth() + 1, 0));
};

const extractItems = (entity: any): any[] => {
  return Array.isArray(entity?.items) ? entity.items : [];
};

const extractPaymentMethod = (entity: any): string => {
  const method = entity?.paymentMethod || entity?.payment_method || entity?.paymentType || entity?.payment_type || '';
  return String(method).toLowerCase().trim();
};

const extractCustomerId = (entity: any): string => {
  return String(entity?.customerId || entity?.customer_id || entity?.clientId || entity?.client_id || '');
};

const extractCustomerName = (entity: any): string => {
  return String(entity?.customerName || entity?.customer_name || entity?.clientName || entity?.client_name || 'Walk-in');
};

const extractItemId = (item: any): string => {
  return String(item?.itemId || item?.productId || item?.id || '');
};

const extractItemName = (item: any): string => {
  return String(item?.productName || item?.name || item?.itemName || item?.description || 'Unknown');
};

const extractQuantity = (item: any): number => {
  const q = toNumber(item?.quantity, 1);
  return q > 0 ? q : 1;
};

const extractPrice = (item: any): number => {
  return toNumber(item?.price ?? item?.unitPrice ?? item?.sellingPrice, 0);
};

const extractRevenue = (entity: any): number => {
  if (entity?.total !== undefined && entity.total !== null) return toNumber(entity.total, 0);
  if (entity?.subtotal !== undefined && entity.subtotal !== null) return toNumber(entity.subtotal, 0);
  if (entity?.grandTotal !== undefined && entity.grandTotal !== null) return toNumber(entity.grandTotal, 0);
  if (entity?.amount !== undefined && entity.amount !== null) return toNumber(entity.amount, 0);
  const items = extractItems(entity);
  if (items.length > 0) {
    return items.reduce((sum: number, item: any) => {
      return sum + extractPrice(item) * extractQuantity(item);
    }, 0);
  }
  return 0;
};

const extractDate = (entity: any): Date => {
  return toDate(entity?.date || entity?.orderDate || entity?.createdAt || entity?.created_at || entity?.transactionDate);
};

const isSameDay = (a: Date, b: Date): boolean => {
  return a.getFullYear() === b.getFullYear()
    && a.getMonth() === b.getMonth()
    && a.getDate() === b.getDate();
};

const isYesterday = (date: Date, reference: Date): boolean => {
  const yesterday = new Date(reference);
  yesterday.setDate(yesterday.getDate() - 1);
  return isSameDay(date, yesterday);
};

const isToday = (date: Date, reference: Date): boolean => {
  return isSameDay(date, reference);
};

const getPaymentMethod = (entity: any): string => {
  const method = extractPaymentMethod(entity);
  if (!method || method === '' || method === 'cash') return 'cash';
  if (method === 'card' || method === 'credit_card' || method === 'debit_card' || method === 'visa' || method === 'mastercard') return 'card';
  if (method === 'mobile' || method === 'mobile_money' || method === 'momo' || method === 'mpesa' || method === 'airtel_money') return 'mobile';
  return 'other';
};

const computeTrend = (current: number, previous: number): 'rising' | 'stable' | 'falling' => {
  if (previous <= 0) return current > 0 ? 'rising' : 'stable';
  const change = (current - previous) / previous;
  if (change > 0.1) return 'rising';
  if (change < -0.1) return 'falling';
  return 'stable';
};

export const getRealTimeSalesOverview = (
  sales: any[],
  invoices: any[],
  dateRange: { start: string; end: string }
): {
  totalRevenue: number;
  totalTransactions: number;
  averageTransactionValue: number;
  posRevenue: number;
  invoiceRevenue: number;
  cashRevenue: number;
  cardRevenue: number;
  mobileRevenue: number;
  otherRevenue: number;
  todayRevenue: number;
  todayTransactions: number;
  yesterdayRevenue: number;
  yesterdayTransactions: number;
  growthPercent: number;
  paymentMethodBreakdown: { method: string; amount: number; count: number }[];
} => {
  const start = toDate(dateRange.start);
  const end = toDate(dateRange.end);
  const now = new Date();

  const allTransactions = [...(Array.isArray(sales) ? sales : []), ...(Array.isArray(invoices) ? invoices : [])];

  const filtered = allTransactions.filter((t) => {
    const d = extractDate(t);
    return d >= start && d <= end;
  });

  let totalRevenue = 0;
  let totalTransactions = 0;
  let posRevenue = 0;
  let invoiceRevenue = 0;
  let cashRevenue = 0;
  let cardRevenue = 0;
  let mobileRevenue = 0;
  let otherRevenue = 0;
  let todayRevenue = 0;
  let todayTransactions = 0;
  let yesterdayRevenue = 0;
  let yesterdayTransactions = 0;
  const methodMap = new Map<string, { amount: number; count: number }>();

  for (const t of filtered) {
    const revenue = extractRevenue(t);
    const d = extractDate(t);
    const method = getPaymentMethod(t);

    totalRevenue += revenue;
    totalTransactions++;

    if (t?.source === 'POS' || t?.source === 'pos' || t?.originModule === 'POS') {
      posRevenue += revenue;
    } else {
      invoiceRevenue += revenue;
    }

    if (method === 'cash') cashRevenue += revenue;
    else if (method === 'card') cardRevenue += revenue;
    else if (method === 'mobile') mobileRevenue += revenue;
    else otherRevenue += revenue;

    const entry = methodMap.get(method) || { amount: 0, count: 0 };
    entry.amount += revenue;
    entry.count++;
    methodMap.set(method, entry);

    if (isToday(d, now)) {
      todayRevenue += revenue;
      todayTransactions++;
    }
    if (isYesterday(d, now)) {
      yesterdayRevenue += revenue;
      yesterdayTransactions++;
    }
  }

  const averageTransactionValue = totalTransactions > 0 ? roundMoney(totalRevenue / totalTransactions) : 0;
  const growthPercent = yesterdayRevenue > 0 ? roundMoney(((todayRevenue - yesterdayRevenue) / yesterdayRevenue) * 100) : todayRevenue > 0 ? 100 : 0;

  const paymentMethodBreakdown = Array.from(methodMap.entries())
    .map(([method, data]) => ({ method, amount: roundMoney(data.amount), count: data.count }))
    .sort((a, b) => b.amount - a.amount);

  return {
    totalRevenue: roundMoney(totalRevenue),
    totalTransactions,
    averageTransactionValue,
    posRevenue: roundMoney(posRevenue),
    invoiceRevenue: roundMoney(invoiceRevenue),
    cashRevenue: roundMoney(cashRevenue),
    cardRevenue: roundMoney(cardRevenue),
    mobileRevenue: roundMoney(mobileRevenue),
    otherRevenue: roundMoney(otherRevenue),
    todayRevenue: roundMoney(todayRevenue),
    todayTransactions,
    yesterdayRevenue: roundMoney(yesterdayRevenue),
    yesterdayTransactions,
    growthPercent,
    paymentMethodBreakdown
  };
};

export const getTopSellingProducts = (
  sales: any[],
  invoices: any[],
  dateRange: { start: string; end: string },
  limit: number = 10
): {
  itemId: string;
  itemName: string;
  quantitySold: number;
  revenue: number;
  averagePrice: number;
  trend: 'rising' | 'stable' | 'falling';
}[] => {
  const start = toDate(dateRange.start);
  const end = toDate(dateRange.end);
  const now = new Date();

  const allTransactions = [...(Array.isArray(sales) ? sales : []), ...(Array.isArray(invoices) ? invoices : [])];

  const productMap = new Map<string, { itemId: string; itemName: string; quantitySold: number; revenue: number; recentQuantity: number; olderQuantity: number }>();

  for (const t of allTransactions) {
    const d = extractDate(t);
    if (d < start || d > end) continue;
    const items = extractItems(t);
    for (const item of items) {
      const itemId = extractItemId(item);
      const itemName = extractItemName(item);
      const quantity = extractQuantity(item);
      const price = extractPrice(item);
      const revenue = roundMoney(price * quantity);

      const key = itemId || itemName;
      const existing = productMap.get(key) || { itemId, itemName, quantitySold: 0, revenue: 0, recentQuantity: 0, olderQuantity: 0 };
      existing.quantitySold += quantity;
      existing.revenue += revenue;

      const midPoint = new Date((start.getTime() + end.getTime()) / 2);
      if (d >= midPoint) {
        existing.recentQuantity += quantity;
      } else {
        existing.olderQuantity += quantity;
      }

      productMap.set(key, existing);
    }
  }

  return Array.from(productMap.values())
    .map((p) => ({
      itemId: p.itemId,
      itemName: p.itemName,
      quantitySold: p.quantitySold,
      revenue: roundMoney(p.revenue),
      averagePrice: p.quantitySold > 0 ? roundMoney(p.revenue / p.quantitySold) : 0,
      trend: computeTrend(p.recentQuantity, p.olderQuantity)
    }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, limit);
};

export const getBestPerformingCustomers = (
  sales: any[],
  invoices: any[],
  dateRange: { start: string; end: string },
  limit: number = 10
): {
  customerId: string;
  customerName: string;
  totalSpent: number;
  orderCount: number;
  averageOrderValue: number;
  lastOrderDate: string;
  segment: 'vip' | 'regular' | 'occasional';
}[] => {
  const start = toDate(dateRange.start);
  const end = toDate(dateRange.end);

  const allTransactions = [...(Array.isArray(sales) ? sales : []), ...(Array.isArray(invoices) ? invoices : [])];

  const customerMap = new Map<string, { customerId: string; customerName: string; totalSpent: number; orderCount: number; lastOrderDate: Date }>();

  for (const t of allTransactions) {
    const d = extractDate(t);
    if (d < start || d > end) continue;
    const customerId = extractCustomerId(t);
    if (!customerId) continue;
    const customerName = extractCustomerName(t);
    const revenue = extractRevenue(t);

    const existing = customerMap.get(customerId) || { customerId, customerName, totalSpent: 0, orderCount: 0, lastOrderDate: new Date(0) };
    existing.totalSpent += revenue;
    existing.orderCount++;
    if (d > existing.lastOrderDate) existing.lastOrderDate = d;
    customerMap.set(customerId, existing);
  }

  return Array.from(customerMap.values())
    .map((c) => ({
      customerId: c.customerId,
      customerName: c.customerName,
      totalSpent: roundMoney(c.totalSpent),
      orderCount: c.orderCount,
      averageOrderValue: c.orderCount > 0 ? roundMoney(c.totalSpent / c.orderCount) : 0,
      lastOrderDate: c.lastOrderDate.toISOString(),
      segment: c.totalSpent > 100000 ? 'vip' as const : c.totalSpent > 20000 ? 'regular' as const : 'occasional' as const
    }))
    .sort((a, b) => b.totalSpent - a.totalSpent)
    .slice(0, limit);
};

export const getSalesTrends = (
  sales: any[],
  invoices: any[],
  period: 'daily' | 'weekly' | 'monthly'
): {
  label: string;
  revenue: number;
  transactions: number;
  growth: number;
}[] => {
  const allTransactions = [...(Array.isArray(sales) ? sales : []), ...(Array.isArray(invoices) ? invoices : [])];

  const periodMap = new Map<string, { revenue: number; transactions: number }>();

  for (const t of allTransactions) {
    const d = extractDate(t);
    const label = getLabel(d, period);
    const revenue = extractRevenue(t);

    const existing = periodMap.get(label) || { revenue: 0, transactions: 0 };
    existing.revenue += revenue;
    existing.transactions++;
    periodMap.set(label, existing);
  }

  const sorted = Array.from(periodMap.entries())
    .sort(([a], [b]) => a.localeCompare(b));

  return sorted.map(([label, data], index) => {
    const prev = index > 0 ? sorted[index - 1][1].revenue : 0;
    const growth = prev > 0 ? roundMoney(((data.revenue - prev) / prev) * 100) : data.revenue > 0 ? 100 : 0;
    return {
      label,
      revenue: roundMoney(data.revenue),
      transactions: data.transactions,
      growth
    };
  });
};

export const getBranchPerformance = (
  sales: any[],
  invoices: any[],
  branches?: string[]
): {
  branch: string;
  revenue: number;
  transactions: number;
  averageValue: number;
  topProducts: string[];
}[] => {
  const allTransactions = [...(Array.isArray(sales) ? sales : []), ...(Array.isArray(invoices) ? invoices : [])];

  const branchMap = new Map<string, { revenue: number; transactions: number; productMap: Map<string, number> }>();

  for (const t of allTransactions) {
    const branch = String(t?.branch || t?.branchName || t?.branch_name || t?.location || 'Main');
    if (branches && branches.length > 0 && !branches.includes(branch)) continue;

    const existing = branchMap.get(branch) || { revenue: 0, transactions: 0, productMap: new Map<string, number>() };
    existing.revenue += extractRevenue(t);
    existing.transactions++;

    const items = extractItems(t);
    for (const item of items) {
      const itemName = extractItemName(item);
      const qty = extractQuantity(item);
      existing.productMap.set(itemName, (existing.productMap.get(itemName) || 0) + qty);
    }

    branchMap.set(branch, existing);
  }

  return Array.from(branchMap.entries())
    .map(([branch, data]) => ({
      branch,
      revenue: roundMoney(data.revenue),
      transactions: data.transactions,
      averageValue: data.transactions > 0 ? roundMoney(data.revenue / data.transactions) : 0,
      topProducts: Array.from(data.productMap.entries())
        .sort(([, a], [, b]) => b - a)
        .slice(0, 5)
        .map(([name]) => name)
    }))
    .sort((a, b) => b.revenue - a.revenue);
};

export const getSalesTargetProgress = (
  targets: Record<string, number>,
  actuals: { revenue: number; transactions: number }
): {
  revenueTarget: number;
  revenueAchieved: number;
  revenuePercent: number;
  transactionTarget: number;
  transactionAchieved: number;
  transactionPercent: number;
  onTrack: boolean;
} => {
  const revenueTarget = toNumber(targets?.revenue ?? targets?.Revenue ?? targets?.revenueTarget ?? targets?.RevenueTarget, 0);
  const transactionTarget = toNumber(targets?.transactions ?? targets?.Transactions ?? targets?.transactionTarget ?? targets?.TransactionTarget, 0);
  const revenueAchieved = toNumber(actuals?.revenue, 0);
  const transactionAchieved = toNumber(actuals?.transactions, 0);
  const revenuePercent = revenueTarget > 0 ? roundMoney((revenueAchieved / revenueTarget) * 100) : 0;
  const transactionPercent = transactionTarget > 0 ? roundMoney((transactionAchieved / transactionTarget) * 100) : 0;
  const onTrack = revenuePercent >= 100 && transactionPercent >= 100;

  return {
    revenueTarget: roundMoney(revenueTarget),
    revenueAchieved: roundMoney(revenueAchieved),
    revenuePercent,
    transactionTarget: roundMoney(transactionTarget),
    transactionAchieved: roundMoney(transactionAchieved),
    transactionPercent,
    onTrack
  };
};

export const predictEndOfMonthRevenue = (
  sales: any[],
  invoices: any[],
  currentDate?: Date
): {
  predictedRevenue: number;
  lowEstimate: number;
  highEstimate: number;
  confidence: 'low' | 'medium' | 'high';
  basedOn: number;
} => {
  const now = currentDate || new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const daysInMonth = getDaysInMonth(year, month + 1);
  const dayOfMonth = getDayOfMonth(now);
  const daysRemaining = daysInMonth - dayOfMonth;

  const allTransactions = [...(Array.isArray(sales) ? sales : []), ...(Array.isArray(invoices) ? invoices : [])];

  const monthStart = new Date(year, month, 1);
  const monthEnd = new Date(year, month + 1, 0, 23, 59, 59, 999);

  let monthRevenue = 0;
  let daysWithData = 0;

  for (const t of allTransactions) {
    const d = extractDate(t);
    if (d >= monthStart && d <= monthEnd) {
      monthRevenue += extractRevenue(t);
      daysWithData++;
    }
  }

  const averageDailyRevenue = dayOfMonth > 0 ? monthRevenue / dayOfMonth : 0;
  const predictedRevenue = roundMoney(monthRevenue + averageDailyRevenue * daysRemaining);
  const lowEstimate = roundMoney(predictedRevenue * 0.9);
  const highEstimate = roundMoney(predictedRevenue * 1.1);

  let confidence: 'low' | 'medium' | 'high';
  if (dayOfMonth <= 7) confidence = 'low';
  else if (dayOfMonth <= 20) confidence = 'medium';
  else confidence = 'high';

  return {
    predictedRevenue,
    lowEstimate,
    highEstimate,
    confidence,
    basedOn: daysWithData
  };
};
