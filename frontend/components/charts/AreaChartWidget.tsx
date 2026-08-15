import React, { useMemo, memo } from 'react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';
import { motion } from 'framer-motion';
import { SEMANTIC_COLORS, SHADOWS, RADIUS } from '../../styles/designTokens';

export interface AreaChartWidgetProps {
  data: any[];
  dataKey: string;
  xKey?: string;
  title?: string;
  height?: number;
  color?: string;
  gradient?: boolean;
  showGrid?: boolean;
  showTooltip?: boolean;
  showLegend?: boolean;
  additionalLines?: { key: string; color: string; name: string }[];
  forecastData?: { key: string; color: string; name: string; dashed?: boolean }[];
}

const CONTAINER_STYLE: React.CSSProperties = {
  width: '100%',
  height: '100%',
  minHeight: 0,
  fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
};

const TITLE_STYLE: React.CSSProperties = {
  fontSize: '14px',
  fontWeight: 600,
  color: SEMANTIC_COLORS.textPrimary,
  margin: 0,
  marginBottom: '16px',
  letterSpacing: '-0.01em',
};

const AXIS_STYLE = {
  fontSize: 11,
  fill: SEMANTIC_COLORS.textMuted,
};

const GLASS_TOOLTIP_STYLE: React.CSSProperties = {
  background: 'rgba(255, 255, 255, 0.85)',
  backdropFilter: 'blur(12px)',
  WebkitBackdropFilter: 'blur(12px)',
  borderRadius: RADIUS.lg,
  boxShadow: SHADOWS.tooltip,
  border: '1px solid rgba(255, 255, 255, 0.3)',
  padding: '10px 14px',
  minWidth: '160px',
};

const TOOLTIP_LABEL_STYLE: React.CSSProperties = {
  margin: 0,
  marginBottom: '6px',
  fontSize: '12px',
  fontWeight: 600,
  color: SEMANTIC_COLORS.textPrimary,
};

const TOOLTIP_ITEM_STYLE: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  padding: '2px 0',
  fontSize: '12px',
  color: SEMANTIC_COLORS.textSecondary,
};

const TOOLTIP_DOT_STYLE: React.CSSProperties = {
  width: '8px',
  height: '8px',
  borderRadius: '50%',
  flexShrink: 0,
};

const TOOLTIP_VALUE_STYLE: React.CSSProperties = {
  marginLeft: 'auto',
  fontWeight: 600,
  color: SEMANTIC_COLORS.textPrimary,
  fontVariantNumeric: 'tabular-nums',
};

const CustomChartTooltip: React.FC<{
  active?: boolean;
  payload?: any[];
  label?: string;
  valuePrefix?: string;
  valueSuffix?: string;
}> = ({ active, payload, label, valuePrefix = '', valueSuffix = '' }) => {
  if (!active || !payload || payload.length === 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 4, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.15 }}
      style={GLASS_TOOLTIP_STYLE}
    >
      {label && <p style={TOOLTIP_LABEL_STYLE}>{label}</p>}
      {payload.map((entry: any, index: number) => (
        <div key={`tooltip-${index}`} style={TOOLTIP_ITEM_STYLE}>
          <span style={{ ...TOOLTIP_DOT_STYLE, backgroundColor: entry.color }} />
          <span>{entry.name}</span>
          <span style={TOOLTIP_VALUE_STYLE}>
            {valuePrefix}{typeof entry.value === 'number' ? entry.value.toLocaleString() : entry.value}{valueSuffix}
          </span>
        </div>
      ))}
    </motion.div>
  );
};

CustomChartTooltip.displayName = 'CustomChartTooltip';

const generateGradientId = () => `area-grad-${Math.random().toString(36).slice(2, 9)}`;

const AreaChartWidgetComponent: React.FC<AreaChartWidgetProps> = ({
  data,
  dataKey,
  xKey = 'name',
  title,
  height = 300,
  color = '#6366F1',
  gradient = true,
  showGrid = true,
  showTooltip = true,
  showLegend = false,
  additionalLines,
  forecastData,
}) => {
  const gradientId = useMemo(generateGradientId, []);

  const allLines = useMemo(() => {
    const lines: { key: string; color: string; name: string; dashed?: boolean }[] = [
      { key: dataKey, color, name: dataKey },
    ];
    if (additionalLines) {
      lines.push(...additionalLines);
    }
    if (forecastData) {
      lines.push(...forecastData);
    }
    return lines;
  }, [dataKey, color, additionalLines, forecastData]);

  const hasMultipleLines = allLines.length > 1;

  return (
    <div style={{ width: '100%' }}>
      {title && <h3 style={TITLE_STYLE}>{title}</h3>}
      <div style={{ width: '100%', height }}>
        <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={150}>
          <AreaChart
            data={data}
            margin={{ top: 8, right: 16, left: 0, bottom: 0 }}
          >
            <defs>
              {gradient && (
                <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={color} stopOpacity={0.3} />
                  <stop offset="100%" stopColor={color} stopOpacity={0.02} />
                </linearGradient>
              )}
            </defs>

            {showGrid && (
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="#E2E8F0"
                vertical={false}
              />
            )}

            <XAxis
              dataKey={xKey}
              axisLine={false}
              tickLine={false}
              tick={{ ...AXIS_STYLE }}
              dy={8}
            />

            <YAxis
              axisLine={false}
              tickLine={false}
              tick={{ ...AXIS_STYLE }}
              dx={-4}
              width={50}
            />

            {showTooltip && (
              <Tooltip
                content={<CustomChartTooltip />}
                cursor={{ stroke: '#CBD5E1', strokeWidth: 1, strokeDasharray: '4 4' }}
              />
            )}

            {showLegend && hasMultipleLines && (
              <Legend
                verticalAlign="bottom"
                height={28}
                iconType="circle"
                iconSize={8}
                wrapperStyle={{ fontSize: '11px', color: SEMANTIC_COLORS.textSecondary }}
              />
            )}

            {allLines.map((line) => (
              <Area
                key={line.key}
                type="monotone"
                dataKey={line.key}
                name={line.name}
                stroke={line.color}
                fill={gradient ? `url(#${gradientId})` : 'transparent'}
                strokeWidth={line.dashed ? 1.5 : 2}
                strokeDasharray={line.dashed ? '6 3' : undefined}
                fillOpacity={1}
                dot={false}
                activeDot={{
                  r: 4,
                  strokeWidth: 2,
                  stroke: '#fff',
                  fill: line.color,
                }}
                isAnimationActive={true}
                animationDuration={800}
                animationEasing="ease-out"
              />
            ))}
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

AreaChartWidgetComponent.displayName = 'AreaChartWidget';

export default memo(AreaChartWidgetComponent);
