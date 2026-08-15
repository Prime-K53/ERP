/**
 * Dashboard components barrel export
 * Clean, maintainable imports
 */
export { default as KpiCard } from './KpiCard';
export { default as CustomTooltip } from './CustomTooltip';
export { default as IncomeVsExpenditureChart } from './IncomeVsExpenditureChart';
export { default as RecurringInvoiceCard } from './RecurringInvoiceCard';
export { default as CashFlowBreakdown } from './CashFlowBreakdown';

// Type exports
export type { TrendDirection, SparklineDataPoint, KpiCardProps } from './KpiCard';
export type { TooltipPayload, CustomTooltipProps } from './CustomTooltip';
export type { IncomeVsExpenditureDataPoint, IncomeVsExpenditureChartProps } from './IncomeVsExpenditureChart';
export type { RecurringInvoice, RecurringInvoiceCardProps } from './RecurringInvoiceCard';
export type { CashFlowData, CashFlowBreakdownProps } from './CashFlowBreakdown';