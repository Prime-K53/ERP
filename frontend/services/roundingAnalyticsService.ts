import {
  Invoice,
  PricingRoundingMethod,
  RoundingDashboardData,
  RoundingInsight,
  RoundingLog,
  RoundingMethodPerformanceRow,
  RoundingPeriodReportRow,
  RoundingPriceHistoryEntry,
  RoundingProductPerformanceRow,
  RoundingProfitProjection,
  RoundingProfitSummary,
  RoundingRealizedProfitResult,
  RoundingRealizedProfitRow,
  RoundingTopProductRow,
  Sale
} from '../types';
import { roundToCurrency } from '../utils/helpers';
import { dbService } from './db';

export interface DateRangeFilter {
  from?: string;
  to?: string;
}

export interface RoundingReportFilter extends DateRangeFilter {
  productId?: string;
  variantId?: string;
}

export interface LogRoundingEventInput {
  productId: string;
  productName: string;
  variantId?: string;
  variantName?: string;
  date?: string;
  calculatedPrice: number;
  roundedPrice: number;
  roundingDifference: number;
  roundingMethod: PricingRoundingMethod;
  userId?: string;
}

interface TransactionLineSnapshot {
  transactionId: string;
  transactionType: 'sale' | 'invoice';
  transactionDate: string;
  productId: string;
  productName: string;
  variantId?: string;
  quantitySold: number;
  unitPrice: number;
}

const ROUNDING_LOG_STORE: 'roundingLogs' = 'roundingLogs';
const PRICE_MATCH_TOLERANCE = 0.0001;

const normalizeId = (value: unknown): string | undefined => {
  const text = String(value || '').trim();
  return text.length > 0 ? text : undefined;
};

const toNumber = (value: unknown, fallback = 0): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const toSafeDate = (value?: string): string => {
  if (!value) return new Date().toISOString();
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) return new Date().toISOString();
  return new Date(time).toISOString();
};

const toTimestamp = (value: string): number => {
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : 0;
};

const buildProductKey = (productId: string, variantId?: string): string =>
  `${productId}::${variantId || ''}`;

const startOfDayIso = (date: Date): string => {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy.toISOString();
};

const endOfDayIso = (date: Date): string => {
  const copy = new Date(date);
  copy.setHours(23, 59, 59, 999);
  return copy.toISOString();
};

const periodKeyForDate = (isoDate: string, granularity: 'day' | 'month'): string => {
  if (granularity === 'month') return isoDate.slice(0, 7);
  return isoDate.slice(0, 10);
};

const isDateInRange = (isoDate: string, filter?: DateRangeFilter): boolean => {
  if (!filter?.from && !filter?.to) return true;
  const time = toTimestamp(isoDate);
  if (!time) return false;
  const fromTime = filter.from ? toTimestamp(filter.from) : Number.NEGATIVE_INFINITY;
  const toTime = filter.to ? toTimestamp(filter.to) : Number.POSITIVE_INFINITY;
  return time >= fromTime && time <= toTime;
};

const resolveCurrentUserId = (): string => {
  if (typeof window === 'undefined' || !window.sessionStorage) return 'system';
  try {
    const raw = sessionStorage.getItem('nexus_user');
    if (!raw) return 'system';
    const parsed = JSON.parse(raw);
    return String(parsed?.id || parsed?.username || 'system');
  } catch {
    return 'system';
  }
};

const resolveLineProductId = (item: Record<string, any>): string | undefined => {
  return normalizeId(item.parentId)
    || normalizeId(item.productId)
    || normalizeId(item.itemId)
    || normalizeId(item.id);
};

const resolveLineVariantId = (item: Record<string, any>): string | undefined => {
  if (normalizeId(item.parentId)) return normalizeId(item.id);
  return normalizeId(item.variantId);
};

const resolveLineProductName = (item: Record<string, any>): string => {
  return String(
    item.name
    || item.productName
    || item.description
    || item.product_name
    || item.itemName
    || item.id
    || 'Unknown Product'
  );
};

const extractTransactionLines = (
  sales: Sale[],
  invoices: Invoice[],
  filter?: RoundingReportFilter
): TransactionLineSnapshot[] => {
  const rows: TransactionLineSnapshot[] = [];

  const pushLine = (
    transactionType: 'sale' | 'invoice',
    transactionId: string,
    transactionDate: string,
    item: Record<string, any>
  ) => {
    const productId = resolveLineProductId(item);
    if (!productId) return;

    const variantId = resolveLineVariantId(item);
    if (filter?.productId && filter.productId !== productId) return;
    if (filter?.variantId && filter.variantId !== (variantId || '')) return;

    const quantity = toNumber(item.quantity, 0);
    if (quantity <= 0) return;

    const unitPrice = toNumber(item.unitPrice, NaN);
    const normalizedUnitPrice = Number.isFinite(unitPrice)
      ? unitPrice
      : toNumber(item.price, Number.isFinite(toNumber(item.total, NaN)) && quantity > 0
        ? toNumber(item.total) / quantity
        : 0);

    rows.push({
      transactionId,
      transactionType,
      transactionDate: toSafeDate(transactionDate),
      productId,
      productName: resolveLineProductName(item),
      variantId,
      quantitySold: quantity,
      unitPrice: roundToCurrency(normalizedUnitPrice)
    });
  };

  sales.forEach((sale) => {
    const date = toSafeDate(String(sale.date || ''));
    if (!isDateInRange(date, filter)) return;
    (sale.items || []).forEach((item: any) => pushLine('sale', sale.id, date, item));
  });

  invoices.forEach((invoice) => {
    const date = toSafeDate(String(invoice.date || ''));
    if (!isDateInRange(date, filter)) return;
    (invoice.items || []).forEach((item: any) => pushLine('invoice', invoice.id, date, item));
  });

  return rows;
};

const buildLogIndex = (logs: RoundingLog[]): Map<string, RoundingLog[]> => {
  const map = new Map<string, RoundingLog[]>();
  logs.forEach((log) => {
    const key = buildProductKey(log.product_id, log.variant_id);
    const current = map.get(key) || [];
    current.push(log);
    map.set(key, current);
  });

  map.forEach((value, key) => {
    value.sort((a, b) => {
      const dateOrder = toTimestamp(a.date) - toTimestamp(b.date);
      if (dateOrder !== 0) return dateOrder;
      return a.version - b.version;
    });
    map.set(key, value);
  });

  return map;
};

const pickClosestPriceMatch = (logs: RoundingLog[], linePrice: number): RoundingLog | undefined => {
  return [...logs]
    .reverse()
    .find((log) => Math.abs(Number(log.rounded_price || 0) - linePrice) <= PRICE_MATCH_TOLERANCE);
};

export const selectRoundingLogForLine = (
  logs: RoundingLog[],
  line: Pick<TransactionLineSnapshot, 'transactionDate' | 'unitPrice'>
): RoundingLog | undefined => {
  if (!logs || logs.length === 0) return undefined;

  const txTime = toTimestamp(line.transactionDate);
  if (!txTime) return logs[logs.length - 1];

  const logsBeforeOrAt = logs.filter((log) => toTimestamp(log.date) <= txTime);
  if (logsBeforeOrAt.length > 0) {
    const priceMatched = pickClosestPriceMatch(logsBeforeOrAt, line.unitPrice);
    return priceMatched || logsBeforeOrAt[logsBeforeOrAt.length - 1];
  }

  const logsAfter = logs.filter((log) => toTimestamp(log.date) > txTime);
  if (logsAfter.length > 0) {
    const priceMatched = pickClosestPriceMatch(logsAfter, line.unitPrice);
    return priceMatched || logsAfter[0];
  }

  return logs[logs.length - 1];
};

const resolveLineLog = (
  logIndex: Map<string, RoundingLog[]>,
  line: TransactionLineSnapshot
): RoundingLog | undefined => {
  const variantKey = buildProductKey(line.productId, line.variantId);
  const productKey = buildProductKey(line.productId);

  const variantLogs = logIndex.get(variantKey);
  const productLogs = logIndex.get(productKey);

  if (variantLogs && variantLogs.length > 0) {
    return selectRoundingLogForLine(variantLogs, line);
  }
  if (productLogs && productLogs.length > 0) {
    return selectRoundingLogForLine(productLogs, line);
  }
  return undefined;
};

const calculateLineProfit = (unitDifference: number, quantity: number): number =>
  roundToCurrency(unitDifference * quantity);

const resolveItemUnitCost = (item: Record<string, any>): number => {
  if (Number.isFinite(toNumber(item.productionCostSnapshot?.baseProductionCost, NaN))) {
    return toNumber(item.productionCostSnapshot.baseProductionCost);
  }
  return toNumber(item.cost, 0);
};

const calculateTransactionProfit = (sales: Sale[], invoices: Invoice[], filter?: DateRangeFilter): number => {
  let totalProfit = 0;

  const handleItems = (items: Record<string, any>[]) => {
    items.forEach((item) => {
      const quantity = toNumber(item.quantity, 0);
      if (quantity <= 0) return;
      const unitPrice = Number.isFinite(toNumber(item.unitPrice, NaN))
        ? toNumber(item.unitPrice)
        : toNumber(item.price, 0);
      const unitCost = resolveItemUnitCost(item);
      totalProfit += (unitPrice - unitCost) * quantity;
    });
  };

  sales.forEach((sale) => {
    const saleDate = toSafeDate(String(sale.date || ''));
    if (!isDateInRange(saleDate, filter)) return;
    handleItems((sale.items || []) as Record<string, any>[]);
  });

  invoices.forEach((invoice) => {
    const invoiceDate = toSafeDate(String(invoice.date || ''));
    if (!isDateInRange(invoiceDate, filter)) return;
    handleItems((invoice.items || []) as Record<string, any>[]);
  });

  return roundToCurrency(totalProfit);
};

export const computeRealizedProfitFromData = (
  logs: RoundingLog[],
  sales: Sale[],
  invoices: Invoice[],
  filter?: RoundingReportFilter
): RoundingRealizedProfitResult => {
  const logIndex = buildLogIndex(logs);
  const lines = extractTransactionLines(sales, invoices, filter);

  const rows: RoundingRealizedProfitRow[] = [];
  let totalRealizedProfit = 0;
  let totalQuantitySold = 0;

  lines.forEach((line) => {
    const matchedLog = resolveLineLog(logIndex, line);
    if (!matchedLog) return;

    const unitDifference = toNumber(matchedLog.rounding_difference, 0);
    const realizedProfit = calculateLineProfit(unitDifference, line.quantitySold);

    rows.push({
      transaction_id: line.transactionId,
      transaction_type: line.transactionType,
      transaction_date: line.transactionDate,
      product_id: line.productId,
      product_name: line.productName,
      variant_id: line.variantId,
      quantity_sold: line.quantitySold,
      unit_price: line.unitPrice,
      rounding_version: matchedLog.version,
      rounding_difference: roundToCurrency(unitDifference),
      realized_rounding_profit: realizedProfit,
      rounding_method: matchedLog.rounding_method,
      rounding_log_id: matchedLog.id
    });

    totalRealizedProfit += realizedProfit;
    totalQuantitySold += line.quantitySold;
  });

  return {
    total_realized_profit: roundToCurrency(totalRealizedProfit),
    total_quantity_sold: roundToCurrency(totalQuantitySold),
    rows
  };
};

const groupLatestLogsByProduct = (logs: RoundingLog[]): Map<string, RoundingLog> => {
  const latestMap = new Map<string, RoundingLog>();
  logs.forEach((log) => {
    const key = buildProductKey(log.product_id, log.variant_id);
    const existing = latestMap.get(key);
    if (!existing) {
      latestMap.set(key, log);
      return;
    }

    const existingTime = toTimestamp(existing.date);
    const candidateTime = toTimestamp(log.date);
    if (candidateTime > existingTime || (candidateTime === existingTime && log.version > existing.version)) {
      latestMap.set(key, log);
    }
  });
  return latestMap;
};

const getAllLogs = async (): Promise<RoundingLog[]> => {
  const logs = await dbService.getAll<RoundingLog>(ROUNDING_LOG_STORE);
  return (logs || []).map((log) => ({
    ...log,
    date: toSafeDate(log.date),
    calculated_price: roundToCurrency(toNumber(log.calculated_price, 0)),
    rounded_price: roundToCurrency(toNumber(log.rounded_price, 0)),
    rounding_difference: roundToCurrency(toNumber(log.rounding_difference, 0))
  }));
};

export const getRoundingLogs = async (filter?: RoundingReportFilter): Promise<RoundingLog[]> => {
  const logs = await getAllLogs();
  return logs
    .filter((log) => {
      if (!isDateInRange(log.date, filter)) return false;
      if (filter?.productId && filter.productId !== log.product_id) return false;
      if (filter?.variantId && filter.variantId !== (log.variant_id || '')) return false;
      return true;
    })
    .sort((a, b) => {
      const dateOrder = toTimestamp(a.date) - toTimestamp(b.date);
      if (dateOrder !== 0) return dateOrder;
      return a.version - b.version;
    });
};

export const logRoundingEvent = async (input: LogRoundingEventInput): Promise<RoundingLog> => {
  const entries = await logRoundingEvents([input]);
  return entries[0];
};

export const logRoundingEvents = async (inputs: LogRoundingEventInput[]): Promise<RoundingLog[]> => {
  if (!inputs || inputs.length === 0) return [];

  const dedupedByProduct = new Map<string, LogRoundingEventInput>();
  inputs.forEach((input) => {
    const productId = normalizeId(input.productId);
    if (!productId) return;
    const key = buildProductKey(productId, normalizeId(input.variantId));
    dedupedByProduct.set(key, input);
  });

  if (dedupedByProduct.size === 0) return [];

  const existingLogs = await getAllLogs();
  const currentVersions = new Map<string, number>();

  existingLogs.forEach((log) => {
    const key = buildProductKey(log.product_id, log.variant_id);
    currentVersions.set(key, Math.max(currentVersions.get(key) || 0, Number(log.version || 0)));
  });

  const userIdFallback = resolveCurrentUserId();
  const created: RoundingLog[] = [];

  for (const [key, input] of dedupedByProduct.entries()) {
    const productId = normalizeId(input.productId)!;
    const variantId = normalizeId(input.variantId);
    const nextVersion = (currentVersions.get(key) || 0) + 1;
    currentVersions.set(key, nextVersion);

    const entry: RoundingLog = {
      id: `RLG-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      product_id: productId,
      product_name: String(input.productName || productId),
      variant_id: variantId,
      variant_name: normalizeId(input.variantName),
      date: toSafeDate(input.date),
      calculated_price: roundToCurrency(toNumber(input.calculatedPrice, 0)),
      rounded_price: roundToCurrency(toNumber(input.roundedPrice, 0)),
      rounding_difference: roundToCurrency(toNumber(input.roundingDifference, 0)),
      rounding_method: input.roundingMethod,
      user_id: normalizeId(input.userId) || userIdFallback,
      version: nextVersion
    };

    await dbService.put(ROUNDING_LOG_STORE, entry);
    created.push(entry);
  }

  return created.sort((a, b) => toTimestamp(a.date) - toTimestamp(b.date));
};

export const calculateRealizedProfit = async (filter?: RoundingReportFilter): Promise<RoundingRealizedProfitResult> => {
  const [logs, sales, invoices] = await Promise.all([
    getRoundingLogs(filter),
    dbService.getAll<Sale>('sales'),
    dbService.getAll<Invoice>('invoices')
  ]);

  return computeRealizedProfitFromData(logs, sales || [], invoices || [], filter);
};

export const getRoundingProfitSummary = async (filter?: RoundingReportFilter): Promise<RoundingProfitSummary> => {
  const [logs, realized, sales, invoices] = await Promise.all([
    getRoundingLogs(filter),
    calculateRealizedProfit(filter),
    dbService.getAll<Sale>('sales'),
    dbService.getAll<Invoice>('invoices')
  ]);

  const latestLogs = groupLatestLogsByProduct(logs);
  const potentialProfit = roundToCurrency(
    Array.from(latestLogs.values()).reduce((sum, log) => sum + toNumber(log.rounding_difference, 0), 0)
  );

  const totalProfit = calculateTransactionProfit(sales || [], invoices || [], filter);
  const percentage = totalProfit !== 0
    ? roundToCurrency((realized.total_realized_profit / totalProfit) * 100)
    : 0;

  return {
    potential_rounding_profit: potentialProfit,
    realized_rounding_profit: realized.total_realized_profit,
    total_profit: totalProfit,
    rounding_profit_percentage: percentage,
    products_with_rounding: latestLogs.size
  };
};

export const getRoundingProductPerformance = async (
  filter?: RoundingReportFilter
): Promise<RoundingProductPerformanceRow[]> => {
  const [logs, realized] = await Promise.all([
    getRoundingLogs(filter),
    calculateRealizedProfit(filter)
  ]);

  const latestLogs = groupLatestLogsByProduct(logs);
  const aggregate = new Map<string, RoundingProductPerformanceRow>();

  latestLogs.forEach((log) => {
    const key = buildProductKey(log.product_id, log.variant_id);
    aggregate.set(key, {
      product_id: log.product_id,
      product_name: log.variant_name || log.product_name,
      variant_id: log.variant_id,
      rounding_method: log.rounding_method,
      rounded_diff_per_unit: roundToCurrency(toNumber(log.rounding_difference, 0)),
      qty_sold: 0,
      realized_profit: 0,
      version: log.version
    });
  });

  realized.rows.forEach((row) => {
    const key = buildProductKey(row.product_id, row.variant_id);
    const current = aggregate.get(key) || {
      product_id: row.product_id,
      product_name: row.product_name,
      variant_id: row.variant_id,
      rounding_method: row.rounding_method,
      rounded_diff_per_unit: row.rounding_difference,
      qty_sold: 0,
      realized_profit: 0,
      version: row.rounding_version
    };

    current.qty_sold = roundToCurrency(current.qty_sold + row.quantity_sold);
    current.realized_profit = roundToCurrency(current.realized_profit + row.realized_rounding_profit);
    current.rounded_diff_per_unit = row.rounding_difference;
    current.rounding_method = row.rounding_method;
    current.version = Math.max(current.version, row.rounding_version);
    aggregate.set(key, current);
  });

  return Array.from(aggregate.values()).sort((a, b) => b.realized_profit - a.realized_profit);
};

export const getRoundingPeriodReport = async (
  granularity: 'day' | 'month',
  filter?: RoundingReportFilter
): Promise<RoundingPeriodReportRow[]> => {
  const [logs, realized] = await Promise.all([
    getRoundingLogs(filter),
    calculateRealizedProfit(filter)
  ]);

  const periodMap = new Map<string, RoundingPeriodReportRow>();
  const periodProducts = new Map<string, Set<string>>();

  logs.forEach((log) => {
    const period = periodKeyForDate(log.date, granularity);
    const existing = periodMap.get(period) || {
      period,
      products_updated: 0,
      potential_profit: 0,
      realized_profit: 0
    };
    existing.potential_profit = roundToCurrency(existing.potential_profit + toNumber(log.rounding_difference, 0));
    periodMap.set(period, existing);

    const products = periodProducts.get(period) || new Set<string>();
    products.add(buildProductKey(log.product_id, log.variant_id));
    periodProducts.set(period, products);
  });

  realized.rows.forEach((row) => {
    const period = periodKeyForDate(row.transaction_date, granularity);
    const existing = periodMap.get(period) || {
      period,
      products_updated: 0,
      potential_profit: 0,
      realized_profit: 0
    };
    existing.realized_profit = roundToCurrency(existing.realized_profit + row.realized_rounding_profit);
    periodMap.set(period, existing);
  });

  periodProducts.forEach((products, period) => {
    const entry = periodMap.get(period);
    if (!entry) return;
    entry.products_updated = products.size;
    periodMap.set(period, entry);
  });

  return Array.from(periodMap.values()).sort((a, b) => a.period.localeCompare(b.period));
};

export const getRoundingMethodPerformance = async (
  filter?: RoundingReportFilter
): Promise<RoundingMethodPerformanceRow[]> => {
  const [logs, realized] = await Promise.all([
    getRoundingLogs(filter),
    calculateRealizedProfit(filter)
  ]);

  const methodMap = new Map<PricingRoundingMethod, RoundingMethodPerformanceRow>();

  logs.forEach((log) => {
    const method = log.rounding_method;
    const current = methodMap.get(method) || {
      method,
      potential_profit: 0,
      realized_profit: 0,
      updates: 0
    };

    current.potential_profit = roundToCurrency(current.potential_profit + toNumber(log.rounding_difference, 0));
    current.updates += 1;
    methodMap.set(method, current);
  });

  realized.rows.forEach((row) => {
    const method = row.rounding_method;
    const current = methodMap.get(method) || {
      method,
      potential_profit: 0,
      realized_profit: 0,
      updates: 0
    };

    current.realized_profit = roundToCurrency(current.realized_profit + row.realized_rounding_profit);
    methodMap.set(method, current);
  });

  return Array.from(methodMap.values()).sort((a, b) => b.realized_profit - a.realized_profit);
};

export const getTopProductsByRoundingProfit = async (
  limit = 10,
  filter?: RoundingReportFilter
): Promise<RoundingTopProductRow[]> => {
  const rows = await getRoundingProductPerformance(filter);
  return rows
    .slice()
    .sort((a, b) => b.realized_profit - a.realized_profit)
    .slice(0, Math.max(1, limit))
    .map((row) => ({
      product_id: row.product_id,
      product_name: row.product_name,
      variant_id: row.variant_id,
      realized_profit: row.realized_profit,
      qty_sold: row.qty_sold,
      rounded_diff_per_unit: row.rounded_diff_per_unit
    }));
};

export const getRoundingImpactPercentage = async (filter?: RoundingReportFilter): Promise<number> => {
  const summary = await getRoundingProfitSummary(filter);
  return summary.rounding_profit_percentage;
};

export const getRoundingDashboardData = async (): Promise<RoundingDashboardData> => {
  const now = new Date();
  const todayRange: DateRangeFilter = {
    from: startOfDayIso(now),
    to: endOfDayIso(now)
  };
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthRange: DateRangeFilter = {
    from: startOfDayIso(monthStart),
    to: endOfDayIso(now)
  };

  const [todayRealized, monthRealized, topProducts] = await Promise.all([
    calculateRealizedProfit(todayRange),
    calculateRealizedProfit(monthRange),
    getTopProductsByRoundingProfit(1, monthRange)
  ]);

  const topProduct = topProducts[0];
  const avgGain = monthRealized.total_quantity_sold > 0
    ? roundToCurrency(monthRealized.total_realized_profit / monthRealized.total_quantity_sold)
    : 0;

  return {
    rounding_profit_today: todayRealized.total_realized_profit,
    rounding_profit_this_month: monthRealized.total_realized_profit,
    top_product_name: topProduct?.product_name || 'N/A',
    top_product_profit: topProduct?.realized_profit || 0,
    avg_rounding_gain_per_unit: avgGain
  };
};

export const getProductPriceHistory = async (
  productId: string,
  variantId?: string
): Promise<RoundingPriceHistoryEntry[]> => {
  const logs = await getRoundingLogs({
    productId,
    variantId: variantId || undefined
  });

  if (logs.length === 0) return [];

  const ordered = logs.slice().sort((a, b) => {
    const dateOrder = toTimestamp(a.date) - toTimestamp(b.date);
    if (dateOrder !== 0) return dateOrder;
    return a.version - b.version;
  });

  let previous: RoundingLog | null = null;
  const history = ordered.map((log) => {
    const entry: RoundingPriceHistoryEntry = {
      id: log.id,
      product_id: log.product_id,
      product_name: log.product_name,
      variant_id: log.variant_id,
      variant_name: log.variant_name,
      date: log.date,
      version: log.version,
      previous_calculated_price: previous ? previous.calculated_price : null,
      previous_rounded_price: previous ? previous.rounded_price : null,
      calculated_price: log.calculated_price,
      rounded_price: log.rounded_price,
      rounding_difference: log.rounding_difference,
      rounding_method: log.rounding_method,
      user_id: log.user_id
    };
    previous = log;
    return entry;
  });

  return history.reverse();
};

export const getRoundingProfitProjection = async (
  lookbackDays = 30,
  projectedDays = 30
): Promise<RoundingProfitProjection> => {
  const now = new Date();
  const start = new Date(now);
  start.setDate(start.getDate() - Math.max(1, lookbackDays));

  const realized = await calculateRealizedProfit({
    from: startOfDayIso(start),
    to: endOfDayIso(now)
  });

  const avgDaily = roundToCurrency(realized.total_realized_profit / Math.max(1, lookbackDays));
  return {
    lookback_days: lookbackDays,
    projected_days: projectedDays,
    average_daily_realized_profit: avgDaily,
    projected_realized_profit: roundToCurrency(avgDaily * Math.max(1, projectedDays))
  };
};

export const getRoundingSmartInsights = async (): Promise<RoundingInsight[]> => {
  const [methodPerformance, topProducts, logs] = await Promise.all([
    getRoundingMethodPerformance(),
    getTopProductsByRoundingProfit(5),
    getRoundingLogs()
  ]);

  const insights: RoundingInsight[] = [];

  const bestMethod = methodPerformance
    .slice()
    .sort((a, b) => b.realized_profit - a.realized_profit)[0];
  if (bestMethod && bestMethod.realized_profit > 0) {
    insights.push({
      id: 'best-method',
      severity: 'info',
      title: 'Best Performing Rounding Method',
      message: `${bestMethod.method} is currently generating the highest realized rounding profit.`
    });
  }

  const lowProfitProducts = topProducts.filter((row) => row.qty_sold > 0 && row.realized_profit <= 0);
  if (lowProfitProducts.length > 0) {
    insights.push({
      id: 'low-profit-products',
      severity: 'warning',
      title: 'Low Rounding Yield Alert',
      message: `${lowProfitProducts.length} products have sales volume but no realized rounding gain.`
    });
  }

  const negativeLogs = logs.filter((log) => toNumber(log.rounding_difference, 0) < 0);
  if (negativeLogs.length > 0) {
    insights.push({
      id: 'negative-rounding',
      severity: 'warning',
      title: 'Negative Rounding Detected',
      message: `${negativeLogs.length} pricing events recorded negative rounding differences; review method configuration.`
    });
  }

  if (insights.length === 0) {
    insights.push({
      id: 'no-insights',
      severity: 'info',
      title: 'No Critical Rounding Alerts',
      message: 'Current rounding performance is stable with no low-profit or negative-difference flags.'
    });
  }

  return insights;
};

export const ROUNDING_ANALYTICS_QUERIES = {
  TOTAL_ROUNDING_PROFIT: `
SELECT
  SUM(latest.rounding_difference) AS potential_rounding_profit,
  SUM(matched.rounding_difference * sales_line.quantity) AS realized_rounding_profit
FROM rounding_logs latest
LEFT JOIN sales_lines sales_line ON sales_line.product_id = latest.product_id
LEFT JOIN rounding_logs matched ON matched.id = resolved_log_id;
  `.trim(),
  PRODUCT_PERFORMANCE: `
SELECT
  product_id,
  product_name,
  rounding_difference AS rounded_diff_per_unit,
  SUM(quantity_sold) AS qty_sold,
  SUM(rounding_difference * quantity_sold) AS realized_profit
FROM rounding_logs
JOIN sales_lines USING (product_id)
GROUP BY product_id, product_name, rounding_difference;
  `.trim(),
  PERIOD_REPORT: `
SELECT
  DATE(log.date) AS period,
  COUNT(DISTINCT log.product_id) AS products_updated,
  SUM(log.rounding_difference) AS potential_profit,
  SUM(log.rounding_difference * sale_line.quantity) AS realized_profit
FROM rounding_logs log
LEFT JOIN sales_lines sale_line ON sale_line.product_id = log.product_id
GROUP BY period;
  `.trim(),
  METHOD_PERFORMANCE: `
SELECT
  rounding_method,
  SUM(rounding_difference) AS potential_profit,
  SUM(rounding_difference * quantity_sold) AS realized_profit
FROM rounding_logs
LEFT JOIN sales_lines USING (product_id)
GROUP BY rounding_method;
  `.trim()
};
