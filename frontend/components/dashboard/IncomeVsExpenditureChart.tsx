/**
 * Income vs Expenditure Line Chart
 * Smooth curved lines, no area fills, proper memoization
 * CRITICAL: Anti-flickering measures applied
 *
 * 🚨 RECHARTS ANTI-FLICKERING RULES:
 * - Memoize data with useMemo
 * - Memoize entire chart component with React.memo
 * - Use stable color constants (no inline objects)
 * - Disable unnecessary animations
 * - Use stable keys
 */
import React, { useMemo, memo } from 'react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  CartesianGrid,
  XAxis,
  YAxis,
  Legend,
  Tooltip as RechartsTooltip,
} from 'recharts';
import CustomTooltipComponent from './CustomTooltip';
import { SEMANTIC_COLORS } from '../../styles/designTokens';

// ============================================================
// STABLE COLOR CONSTANTS - Never change, prevents re-renders
// ============================================================
const INCOME_COLOR = '#22C55E';      // Green
const EXPENDITURE_COLOR = '#EF4444'; // Red
const GRID_COLOR = '#F1F5F9';
const AXIS_TEXT_COLOR = '#94A3B8';

// ============================================================
// STABLE STYLE OBJECTS - Defined outside component
// ============================================================
const CHART_CONTAINER_STYLE: React.CSSProperties = {
  width: '100%',
  height: '100%',
  minHeight: 200,
  fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
};

const X_AXIS_STYLE = {
  fontSize: 12,
  fill: AXIS_TEXT_COLOR,
};

const Y_AXIS_STYLE = {
  fontSize: 12,
  fill: AXIS_TEXT_COLOR,
};

const GRID_STYLE = {
  strokeDasharray: '3 3',
  vertical: false,
  stroke: GRID_COLOR,
};

const LEGEND_STYLE: React.CSSProperties = {
  paddingTop: '16px',
};

const EMPTY_STATE_STYLE: React.CSSProperties = {
  width: '100%',
  height: '100%',
  minHeight: '220px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  textAlign: 'center',
  padding: '24px',
  color: SEMANTIC_COLORS.textMuted,
  fontSize: '14px',
  fontWeight: 500,
  border: `1px dashed ${SEMANTIC_COLORS.borderLight}`,
  borderRadius: '12px',
  backgroundColor: '#FAFBFC',
};

// ============================================================
// TYPE DEFINITIONS
// ============================================================
export interface IncomeVsExpenditureDataPoint {
  day: string;
  income: number;
  expenditure: number;
}

export interface IncomeVsExpenditureChartProps {
  data: IncomeVsExpenditureDataPoint[];
  currency?: string;
  height?: number;
}

// ============================================================
// TICK FORMATTER - Stable function reference
// ============================================================
const formatYAxisTick = (value: number): string => {
  if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`;
  if (value >= 1000) return `${(value / 1000).toFixed(0)}k`;
  return String(value);
};

// ============================================================
// RENDER LEGEND ITEM - Custom legend rendering
// ============================================================
interface LegendItemProps {
  color: string;
  label: string;
  value: string;
}

const LegendItem: React.FC<LegendItemProps> = memo(({ color, label, value }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
    <div
      style={{
        width: '10px',
        height: '3px',
        borderRadius: '2px',
        backgroundColor: color,
      }}
    />
    <span style={{ fontSize: '13px', color: SEMANTIC_COLORS.textSecondary }}>
      {label}
    </span>
    <span style={{ fontSize: '13px', fontWeight: 600, color: SEMANTIC_COLORS.textPrimary }}>
      {value}
    </span>
  </div>
));

LegendItem.displayName = 'LegendItem';

// ============================================================
// MAIN CHART COMPONENT - Memoized to prevent re-renders
// ============================================================
const IncomeVsExpenditureChart: React.FC<IncomeVsExpenditureChartProps> = memo(({
  data,
  currency = '',
  height,
}) => {
  // Memoize chart data with stable comparison
  const memoizedData = useMemo(() => {
    return data.map((item) => ({
      ...item,
      income: item.income,
      expenditure: item.expenditure,
    }));
  }, [data]);

  // Memoize container style with potential height
  const containerStyle = useMemo<React.CSSProperties>(() => ({
    ...CHART_CONTAINER_STYLE,
    ...(height ? { height: `${height}px` } : {}),
  }), [height]);

  // Use a stable key based on data length to prevent unnecessary remounts
  const stableKey = `income-expense-chart-${memoizedData.length}`;
  const hasMeaningfulValues = memoizedData.some((item) => item.income > 0 || item.expenditure > 0);

  if (!hasMeaningfulValues) {
    return (
      <div style={containerStyle}>
        <div style={EMPTY_STATE_STYLE}>
          No income or expenditure data is available for the selected period yet.
        </div>
      </div>
    );
  }

  return (
    <div style={containerStyle}>
      <ResponsiveContainer key={stableKey} width="100%" height="100%" minWidth={0} minHeight={150}>
        <LineChart
          data={memoizedData}
          margin={{ top: 5, right: 20, left: -10, bottom: 0 }}
        >
          {/* Subtle grid - light, non-distracting */}
          <CartesianGrid
            strokeDasharray={GRID_STYLE.strokeDasharray}
            vertical={GRID_STYLE.vertical}
            stroke={GRID_STYLE.stroke}
          />

          {/* X Axis - date labels */}
          <XAxis
            dataKey="day"
            axisLine={false}
            tickLine={false}
            tick={{ ...X_AXIS_STYLE }}
          />

          {/* Y Axis - currency values */}
          <YAxis
            axisLine={false}
            tickLine={false}
            tick={{ ...Y_AXIS_STYLE }}
            tickFormatter={formatYAxisTick}
          />

          {/* Custom Tooltip */}
          <RechartsTooltip
            content={
              <CustomTooltipComponent
                currency={currency}
              />
            }
            cursor={{ stroke: '#E5E7EB', strokeWidth: 1, strokeDasharray: '5 5' }}
          />

          {/* Legend at bottom */}
          <Legend
            verticalAlign="bottom"
            height={40}
            iconType="line"
            iconSize={12}
            wrapperStyle={LEGEND_STYLE}
            formatter={(value: string) => {
              const displayName = value === 'income' ? 'Income' : 'Expenditure';
              return (
                <span style={{ fontSize: '13px', color: SEMANTIC_COLORS.textSecondary }}>
                  {displayName}
                </span>
              );
            }}
          />

          {/* Income Line - GREEN, smooth, NO area */}
          <Line
            type="monotone"
            dataKey="income"
            name="income"
            stroke={INCOME_COLOR}
            strokeWidth={2.5}
            dot={false}
            activeDot={{ r: 4, stroke: INCOME_COLOR, strokeWidth: 2, fill: '#FFFFFF' }}
            isAnimationActive={false}
          />

          {/* Expenditure Line - RED, smooth, NO area */}
          <Line
            type="monotone"
            dataKey="expenditure"
            name="expenditure"
            stroke={EXPENDITURE_COLOR}
            strokeWidth={2.5}
            dot={false}
            activeDot={{ r: 4, stroke: EXPENDITURE_COLOR, strokeWidth: 2, fill: '#FFFFFF' }}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
});

IncomeVsExpenditureChart.displayName = 'IncomeVsExpenditureChart';

export default IncomeVsExpenditureChart;
