/**
 * Cash Flow Breakdown component
 * Clean summary cards showing cash flow metrics
 * Simple, readable, well-structured
 */
import React, { memo, useMemo } from 'react';
import { ArrowUpRight, ArrowDownRight, Wallet } from 'lucide-react';
import { SEMANTIC_COLORS, SHADOWS, RADIUS } from '../../styles/designTokens';

// ============================================================
// TYPE DEFINITIONS
// ============================================================
export interface CashFlowData {
  income: number;
  expenses: number;
  netProfit: number;
  margin: number;
  pending: number;
  overdue: number;
}

export interface CashFlowBreakdownProps {
  data: CashFlowData;
  currency?: string;
}

// ============================================================
// STABLE STYLE OBJECTS - Defined outside component
// ============================================================
const CONTAINER_STYLE: React.CSSProperties = {
  backgroundColor: '#FFFFFF',
  borderRadius: RADIUS.lg,
  boxShadow: SHADOWS.card,
  padding: '24px',
  height: '100%',
};

const HEADER_STYLE: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '10px',
  marginBottom: '20px',
};

const HEADER_ICON_STYLE: React.CSSProperties = {
  width: '36px',
  height: '36px',
  borderRadius: RADIUS.md,
  backgroundColor: '#EEF2FF',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  color: '#4F46E5',
};

const HEADER_TITLE_STYLE: React.CSSProperties = {
  fontSize: '16px',
  fontWeight: 600,
  color: SEMANTIC_COLORS.textPrimary,
  margin: 0,
  letterSpacing: '-0.01em',
};

const GRID_STYLE: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(2, 1fr)',
  gap: '16px',
};

const METRIC_CARD_STYLE: React.CSSProperties = {
  padding: '16px',
  borderRadius: RADIUS.md,
  backgroundColor: '#F8FAFC',
  display: 'flex',
  flexDirection: 'column',
  gap: '8px',
};

const METRIC_ACCENT_STYLE: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '6px',
};

const METRIC_DOT_STYLE: (color: string) => React.CSSProperties = (color: string) => ({
  width: '8px',
  height: '8px',
  borderRadius: '50%',
  backgroundColor: color,
});

const METRIC_LABEL_STYLE: React.CSSProperties = {
  fontSize: '12px',
  fontWeight: 500,
  color: SEMANTIC_COLORS.textMuted,
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
};

const METRIC_VALUE_STYLE: React.CSSProperties = {
  fontSize: '22px',
  fontWeight: 700,
  color: SEMANTIC_COLORS.textPrimary,
  letterSpacing: '-0.02em',
  fontVariantNumeric: 'tabular-nums',
};

const METRIC_SUBTEXT_STYLE: (positive: boolean) => React.CSSProperties = (positive: boolean) => ({
  fontSize: '11px',
  fontWeight: 500,
  color: positive ? SEMANTIC_COLORS.income : SEMANTIC_COLORS.expenditure,
  display: 'flex',
  alignItems: 'center',
  gap: '2px',
});

const FULL_WIDTH_STYLE: React.CSSProperties = {
  gridColumn: '1 / -1',
  marginTop: '8px',
  paddingTop: '16px',
  borderTop: `1px solid ${SEMANTIC_COLORS.borderLighter}`,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
};

// ============================================================
// HELPER FUNCTIONS - Stable references
// ============================================================
const formatCurrency = (amount: number, currency: string): string => {
  const absAmount = Math.abs(amount);
  const thousands = absAmount / 1000;
  const formatted = thousands.toFixed(0);
  const sign = amount < 0 ? '-' : '';
  return `${sign}${currency}${formatted}k`;
};

const formatPercent = (value: number): string => {
  const prefix = value >= 0 ? '+' : '';
  return `${prefix}${value.toFixed(1)}%`;
};

// ============================================================
// MAIN COMPONENT - Memoized for performance
// ============================================================
const CashFlowBreakdownComponent: React.FC<CashFlowBreakdownProps> = memo(({
  data,
  currency = '',
}) => {
  // Memoize metric values
  const metrics = useMemo(() => [
    {
      label: 'Total Income',
      value: data.income,
      color: SEMANTIC_COLORS.income,
      positive: true,
    },
    {
      label: 'Total Expenses',
      value: data.expenses,
      color: SEMANTIC_COLORS.expenditure,
      positive: false,
    },
    {
      label: 'Net Profit',
      value: data.netProfit,
      color: data.netProfit >= 0 ? SEMANTIC_COLORS.income : SEMANTIC_COLORS.expenditure,
      positive: data.netProfit >= 0,
    },
    {
      label: 'Markup',
      value: data.margin,
      color: data.margin >= 0 ? SEMANTIC_COLORS.income : SEMANTIC_COLORS.expenditure,
      positive: data.margin >= 0,
      isPercent: true,
    },
  ], [data.income, data.expenses, data.netProfit, data.margin]);

  return (
    <div style={CONTAINER_STYLE}>
      {/* Header */}
      <div style={HEADER_STYLE}>
        <div style={HEADER_ICON_STYLE}>
          <Wallet size={18} />
        </div>
        <h3 style={HEADER_TITLE_STYLE}>Cash Flow</h3>
      </div>

      {/* Metrics Grid */}
      <div style={GRID_STYLE}>
        {metrics.map((metric) => (
          <div key={metric.label} style={METRIC_CARD_STYLE}>
            <div style={METRIC_ACCENT_STYLE}>
              <span style={METRIC_DOT_STYLE(metric.color)} />
              <span style={METRIC_LABEL_STYLE}>{metric.label}</span>
            </div>
            <div style={METRIC_VALUE_STYLE}>
              {metric.isPercent
                ? formatPercent((metric.value as number))
                : formatCurrency((metric.value as number), currency)
              }
            </div>
            {metric.label === 'Net Profit' && (
              <div style={METRIC_SUBTEXT_STYLE(metric.positive)}>
                {metric.positive ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
                {formatPercent(data.margin)}
              </div>
            )}
          </div>
        ))}

        {/* Pending & Overdue Row */}
        <div style={FULL_WIDTH_STYLE}>
          <div style={{ display: 'flex', gap: '24px' }}>
            <div>
              <div style={METRIC_LABEL_STYLE}>Pending</div>
              <div style={{ ...METRIC_VALUE_STYLE, fontSize: '18px' }}>
                {formatCurrency(data.pending, currency)}
              </div>
            </div>
            <div>
              <div style={METRIC_LABEL_STYLE}>Overdue</div>
              <div style={{ ...METRIC_VALUE_STYLE, fontSize: '18px', color: SEMANTIC_COLORS.expenditure }}>
                {formatCurrency(data.overdue, currency)}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
});

CashFlowBreakdownComponent.displayName = 'CashFlowBreakdown';

export default CashFlowBreakdownComponent;