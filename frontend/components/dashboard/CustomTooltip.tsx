/**
 * Custom tooltip component for Recharts
 * White background, rounded corners, soft shadow
 * Proper currency formatting
 */
import React, { memo } from 'react';
import { SEMANTIC_COLORS, SHADOWS, RADIUS } from '../../styles/designTokens';

export interface TooltipPayload {
  name: string;
  value: number | string;
  color: string;
  payload?: Record<string, unknown>;
}

export interface CustomTooltipProps {
  active?: boolean;
  payload?: TooltipPayload[];
  label?: string;
  currency?: string;
  valuePrefix?: string;
  valueSuffix?: string;
  decimals?: number;
}

/**
 * Format value with proper currency
 */
const formatValue = (
  value: number | string,
  currency: string,
  prefix?: string,
  suffix?: string,
  decimals: number = 2
): string => {
  const num = typeof value === 'string' ? parseFloat(value) : value;
  if (!Number.isFinite(num)) return `${prefix || ''}0${suffix || ''}`;
  const formatted = num.toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  return `${prefix || ''}${currency}${formatted}${suffix || ''}`;
};

/**
 * Custom tooltip component - memoized for performance
 * Uses stable references for all styles
 */
const CustomTooltipComponent: React.FC<CustomTooltipProps> = memo(({
  active,
  payload,
  label,
  currency = '',
  valuePrefix,
  valueSuffix,
  decimals = 2,
}) => {
  // Memoized style objects to prevent re-renders
  const tooltipStyle: React.CSSProperties = {
    backgroundColor: '#FFFFFF',
    borderRadius: RADIUS.lg,
    boxShadow: SHADOWS.tooltip,
    border: `1px solid ${SEMANTIC_COLORS.borderLight}`,
    padding: '12px 16px',
    minWidth: '180px',
    pointerEvents: 'none' as const,
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  };

  const labelStyle: React.CSSProperties = {
    margin: 0,
    marginBottom: '8px',
    fontSize: '13px',
    fontWeight: 600,
    color: SEMANTIC_COLORS.textPrimary,
    letterSpacing: '-0.01em',
  };

  const itemStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '12px',
    padding: '2px 0',
  };

  const colorDotStyle: React.CSSProperties = {
    width: '10px',
    height: '10px',
    borderRadius: '50%',
    flexShrink: 0,
  };

  const itemNameStyle: React.CSSProperties = {
    flex: 1,
    fontSize: '12px',
    color: SEMANTIC_COLORS.textSecondary,
    whiteSpace: 'nowrap' as const,
  };

  const itemValueStyle: React.CSSProperties = {
    fontSize: '13px',
    fontWeight: 600,
    color: SEMANTIC_COLORS.textPrimary,
    fontVariantNumeric: 'tabular-nums',
    whiteSpace: 'nowrap' as const,
  };

  if (!active || !payload || payload.length === 0) {
    return null;
  }

  return (
    <div style={tooltipStyle}>
      {label && <p style={labelStyle}>{label}</p>}
      <div>
        {payload.map((entry: TooltipPayload, index: number) => (
          <div key={`tooltip-item-${index}`} style={itemStyle}>
            <span style={{ ...colorDotStyle, backgroundColor: entry.color }} />
            <span style={itemNameStyle}>{entry.name}</span>
            <span style={itemValueStyle}>
              {formatValue(entry.value, currency, valuePrefix, valueSuffix, decimals)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
});

CustomTooltipComponent.displayName = 'CustomTooltip';

export default CustomTooltipComponent;
