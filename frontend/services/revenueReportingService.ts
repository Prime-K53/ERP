import {
  buildRevenueAnalysisDataset,
  buildRevenueAnalysisDatasetFromLines,
  type RevenueAnalysisDataset,
  type RevenueAnalysisLine,
  type RevenueAnalysisTransaction,
  type RevenueItemPerformanceRow,
  type RevenueAdjustmentLedgerRow,
  type RevenueSourceSummary,
} from './revenueAnalysisService';
import { format, isWithinInterval, startOfMonth, startOfWeek, startOfYear, subDays, endOfDay } from 'date-fns';

export type RevenueDateRange = 'week' | 'month' | 'quarter' | 'year' | 'all';

export interface RevenueTrendPoint {
  date: string;
  revenue: number;
  materialCost: number;
  adjustmentTotal: number;
  profitMargin: number;
  roundingTotal: number;
}

export interface RevenueCustomerSummary {
  customerName: string;
  transactionCount: number;
  revenue: number;
  adjustmentTotal: number;
  profitMargin: number;
  roundingTotal: number;
}

export interface RevenueReportingSnapshot {
  dataset: RevenueAnalysisDataset;
  totals: RevenueSourceSummary;
  sources: RevenueSourceSummary[];
  trend: RevenueTrendPoint[];
  customers: RevenueCustomerSummary[];
  topItems: RevenueItemPerformanceRow[];
  topAdjustments: RevenueAdjustmentLedgerRow[];
  transactions: RevenueAnalysisTransaction[];
  lines: RevenueAnalysisLine[];
}

const roundMoney = (value: unknown): number => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.round((parsed + Number.EPSILON) * 100) / 100;
};

const normalizeDate = (value: unknown) => {
  const raw = String(value || '').trim();
  if (!raw) return undefined;
  const parsed = new Date(raw);
  return Number.isFinite(parsed.getTime()) ? parsed : undefined;
};

const zeroSummary: RevenueSourceSummary = {
  source: 'ALL',
  transactionCount: 0,
  lineCount: 0,
  quantity: 0,
  revenue: 0,
  materialCost: 0,
  adjustmentTotal: 0,
  profitMargin: 0,
  roundingTotal: 0,
  manualOverrideAmount: 0,
  grossGain: 0,
  reconciliationDelta: 0,
};

export const matchesRevenueDateRange = (
  dateValue: unknown,
  dateRange: RevenueDateRange,
  referenceDate: Date = new Date()
) => {
  if (dateRange === 'all') return true;

  const date = normalizeDate(dateValue);
  if (!date) return false;

  const intervalEnd = endOfDay(referenceDate);
  switch (dateRange) {
    case 'week':
      return isWithinInterval(date, { start: startOfWeek(referenceDate, { weekStartsOn: 1 }), end: intervalEnd });
    case 'month':
      return isWithinInterval(date, { start: startOfMonth(referenceDate), end: intervalEnd });
    case 'quarter': {
      const quarterStart = new Date(referenceDate.getFullYear(), Math.floor(referenceDate.getMonth() / 3) * 3, 1);
      return isWithinInterval(date, { start: quarterStart, end: intervalEnd });
    }
    case 'year':
      return isWithinInterval(date, { start: startOfYear(referenceDate), end: intervalEnd });
    default:
      return true;
  }
};

export const filterRevenueDatasetByDateRange = (
  dataset: RevenueAnalysisDataset,
  dateRange: RevenueDateRange,
  referenceDate: Date = new Date()
) => {
  if (dateRange === 'all') return dataset;
  return buildRevenueAnalysisDatasetFromLines(
    (dataset?.lines || []).filter((line) => matchesRevenueDateRange(line.date, dateRange, referenceDate))
  );
};

export const buildRevenueTrend = (
  lines: RevenueAnalysisLine[] = [],
  windowDays = 7,
  referenceDate: Date = new Date()
): RevenueTrendPoint[] => {
  const safeWindowDays = Math.max(1, Math.floor(windowDays));
  const normalizedLines = Array.isArray(lines) ? lines : [];

  return Array.from({ length: safeWindowDays }, (_, index) => {
    const date = subDays(referenceDate, safeWindowDays - index - 1);
    const dateKey = format(date, 'yyyy-MM-dd');
    const scopedLines = normalizedLines.filter((line) => {
      const lineDate = normalizeDate(line.date);
      return lineDate ? format(lineDate, 'yyyy-MM-dd') === dateKey : false;
    });

    return {
      date: format(date, safeWindowDays > 10 ? 'MMM d' : 'EEE'),
      revenue: roundMoney(scopedLines.reduce((sum, line) => sum + line.revenue, 0)),
      materialCost: roundMoney(scopedLines.reduce((sum, line) => sum + line.materialCost, 0)),
      adjustmentTotal: roundMoney(scopedLines.reduce((sum, line) => sum + line.adjustmentTotal, 0)),
      profitMargin: roundMoney(scopedLines.reduce((sum, line) => sum + line.profitMargin, 0)),
      roundingTotal: roundMoney(scopedLines.reduce((sum, line) => sum + line.roundingTotal, 0)),
    };
  });
};

export const buildRevenueCustomerSummaries = (
  transactions: RevenueAnalysisTransaction[] = []
): RevenueCustomerSummary[] => {
  const map = new Map<string, RevenueCustomerSummary>();

  (Array.isArray(transactions) ? transactions : []).forEach((transaction) => {
    const key = String(transaction.customerName || 'Walk-in').trim() || 'Walk-in';
    const existing = map.get(key);

    if (existing) {
      existing.transactionCount += 1;
      existing.revenue = roundMoney(existing.revenue + transaction.revenue);
      existing.adjustmentTotal = roundMoney(existing.adjustmentTotal + transaction.adjustmentTotal);
      existing.profitMargin = roundMoney(existing.profitMargin + transaction.profitMargin);
      existing.roundingTotal = roundMoney(existing.roundingTotal + transaction.roundingTotal);
      return;
    }

    map.set(key, {
      customerName: key,
      transactionCount: 1,
      revenue: roundMoney(transaction.revenue),
      adjustmentTotal: roundMoney(transaction.adjustmentTotal),
      profitMargin: roundMoney(transaction.profitMargin),
      roundingTotal: roundMoney(transaction.roundingTotal),
    });
  });

  return Array.from(map.values()).sort((a, b) => b.revenue - a.revenue);
};

export const buildRevenueReportingSnapshotFromLines = ({
  lines = [],
  dateRange = 'all',
  trendDays = 7,
  referenceDate = new Date(),
}: {
  lines?: RevenueAnalysisLine[];
  dateRange?: RevenueDateRange;
  trendDays?: number;
  referenceDate?: Date;
} = {}): RevenueReportingSnapshot => {
  const baseDataset = buildRevenueAnalysisDatasetFromLines(lines);
  const dataset = filterRevenueDatasetByDateRange(baseDataset, dateRange, referenceDate);
  const totals = dataset.sourceSummaries.find((summary) => summary.source === 'ALL') || zeroSummary;

  return {
    dataset,
    totals,
    sources: dataset.sourceSummaries.filter((summary) => summary.source !== 'ALL'),
    trend: buildRevenueTrend(dataset.lines, trendDays, referenceDate),
    customers: buildRevenueCustomerSummaries(dataset.transactions),
    topItems: dataset.itemPerformance,
    topAdjustments: dataset.adjustmentLedger,
    transactions: dataset.transactions,
    lines: dataset.lines,
  };
};

export const buildRevenueReportingSnapshot = ({
  sales = [],
  invoices = [],
  orders = [],
  batches = [],
  dateRange = 'all',
  trendDays = 7,
  referenceDate = new Date(),
}: {
  sales?: any[];
  invoices?: any[];
  orders?: any[];
  batches?: any[];
  dateRange?: RevenueDateRange;
  trendDays?: number;
  referenceDate?: Date;
} = {}): RevenueReportingSnapshot => {
  const dataset = buildRevenueAnalysisDataset({ sales, invoices, orders, batches });
  return buildRevenueReportingSnapshotFromLines({
    lines: dataset.lines,
    dateRange,
    trendDays,
    referenceDate,
  });
};
