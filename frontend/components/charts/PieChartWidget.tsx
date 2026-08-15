import React, { useMemo, memo } from 'react';
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from 'recharts';
import { SEMANTIC_COLORS } from '../../styles/designTokens';

export interface PieChartWidgetProps {
  data: { name: string; value: number; color: string }[];
  title?: string;
  height?: number;
  innerRadius?: number;
  showLegend?: boolean;
}

const TITLE_STYLE: React.CSSProperties = {
  fontSize: '14px',
  fontWeight: 600,
  color: SEMANTIC_COLORS.textPrimary,
  margin: 0,
  marginBottom: '16px',
  letterSpacing: '-0.01em',
};

const CENTER_LABEL_CONTAINER: React.CSSProperties = {
  position: 'absolute',
  top: '50%',
  left: '50%',
  transform: 'translate(-50%, -50%)',
  textAlign: 'center',
  pointerEvents: 'none',
};

const CENTER_LABEL_TOTAL: React.CSSProperties = {
  fontSize: '22px',
  fontWeight: 700,
  color: SEMANTIC_COLORS.textPrimary,
  lineHeight: 1.2,
  fontVariantNumeric: 'tabular-nums',
};

const CENTER_LABEL_TEXT: React.CSSProperties = {
  fontSize: '10px',
  fontWeight: 600,
  color: SEMANTIC_COLORS.textMuted,
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
};

const CHART_WRAPPER: React.CSSProperties = {
  position: 'relative',
  width: '100%',
};

const PieChartWidgetComponent: React.FC<PieChartWidgetProps> = ({
  data,
  title,
  height = 280,
  innerRadius = 60,
  showLegend = true,
}) => {
  const total = useMemo(
    () => data.reduce((sum, item) => sum + item.value, 0),
    [data]
  );

  return (
    <div style={{ width: '100%' }}>
      {title && <h3 style={TITLE_STYLE}>{title}</h3>}
      <div style={CHART_WRAPPER}>
        <div style={{ width: '100%', height }}>
          <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={150}>
            <PieChart>
              <Pie
                data={data}
                cx="50%"
                cy="50%"
                innerRadius={innerRadius}
                outerRadius={Math.min(innerRadius + 40, height / 2 - 10)}
                dataKey="value"
                startAngle={90}
                endAngle={-270}
                strokeWidth={0}
                paddingAngle={3}
                isAnimationActive={true}
                animationDuration={600}
                animationEasing="ease-out"
              >
                {data.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>

              {showLegend && (
                <Legend
                  verticalAlign="bottom"
                  height={40}
                  iconType="circle"
                  iconSize={8}
                  formatter={(value: string) => (
                    <span style={{ fontSize: '11px', color: SEMANTIC_COLORS.textSecondary }}>
                      {value}
                    </span>
                  )}
                  wrapperStyle={{ paddingTop: '12px' }}
                />
              )}
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div style={CENTER_LABEL_CONTAINER}>
          <div style={CENTER_LABEL_TEXT}>Total</div>
          <div style={CENTER_LABEL_TOTAL}>{total.toLocaleString()}</div>
        </div>
      </div>
    </div>
  );
};

PieChartWidgetComponent.displayName = 'PieChartWidget';

export default memo(PieChartWidgetComponent);
