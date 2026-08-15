import React, { useMemo, memo } from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  Cell,
} from 'recharts';
import { motion } from 'framer-motion';
import { SEMANTIC_COLORS, SHADOWS, RADIUS } from '../../styles/designTokens';

export interface BarChartWidgetProps {
  data: any[];
  dataKeys: { key: string; color: string; name: string; stackId?: string }[];
  xKey?: string;
  title?: string;
  height?: number;
  showGrid?: boolean;
  showLegend?: boolean;
  stacked?: boolean;
}

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
  minWidth: '140px',
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

interface RoundedBarProps {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  fill?: string;
  radius?: number;
}

const RoundedBar: React.FC<RoundedBarProps> = ({
  x = 0,
  y = 0,
  width = 0,
  height = 0,
  fill = '#6366F1',
  radius = 4,
}) => {
  const adjustedHeight = Math.max(height, 0);
  const r = Math.min(radius, width / 2, adjustedHeight / 2);

  if (adjustedHeight < 0.5) return null;

  return (
    <rect
      x={x}
      y={y + adjustedHeight - Math.min(adjustedHeight, r * 2)}
      width={width}
      height={Math.min(adjustedHeight, r * 2)}
      rx={r}
      ry={r}
      fill={fill}
    />
  );
};

RoundedBar.displayName = 'RoundedBar';

const CustomBarTooltip: React.FC<{
  active?: boolean;
  payload?: any[];
  label?: string;
}> = ({ active, payload, label }) => {
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
            {typeof entry.value === 'number' ? entry.value.toLocaleString() : entry.value}
          </span>
        </div>
      ))}
    </motion.div>
  );
};

CustomBarTooltip.displayName = 'CustomBarTooltip';

const BarChartWidgetComponent: React.FC<BarChartWidgetProps> = ({
  data,
  dataKeys,
  xKey = 'name',
  title,
  height = 300,
  showGrid = true,
  showLegend = false,
  stacked = false,
}) => {
  return (
    <div style={{ width: '100%' }}>
      {title && <h3 style={TITLE_STYLE}>{title}</h3>}
      <div style={{ width: '100%', height }}>
        <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={150}>
          <BarChart
            data={data}
            margin={{ top: 8, right: 16, left: 0, bottom: 0 }}
            barCategoryGap={stacked ? '20%' : '30%'}
            barGap={stacked ? 0 : 4}
          >
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

            <Tooltip
              content={<CustomBarTooltip />}
              cursor={{ fill: '#F1F5F9', opacity: 0.6 }}
            />

            {showLegend && dataKeys.length > 1 && (
              <Legend
                verticalAlign="bottom"
                height={28}
                iconType="circle"
                iconSize={8}
                wrapperStyle={{ fontSize: '11px', color: SEMANTIC_COLORS.textSecondary }}
              />
            )}

            {dataKeys.map((dk) => (
              <Bar
                key={dk.key}
                dataKey={dk.key}
                name={dk.name}
                fill={dk.color}
                stackId={stacked ? (dk.stackId || 'stack') : undefined}
                radius={[4, 4, 0, 0]}
                minPointSize={2}
                shape={(props: any) => (
                  <RoundedBar {...props} fill={dk.color} radius={4} />
                )}
                isAnimationActive={true}
                animationDuration={600}
                animationEasing="ease-out"
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

BarChartWidgetComponent.displayName = 'BarChartWidget';

export default memo(BarChartWidgetComponent);
