import React, { useMemo } from 'react';
import { RADIUS } from '../../styles/designTokens';

export interface SparklineChartProps {
  data: number[];
  width?: number;
  height?: number;
  color?: string;
  strokeWidth?: number;
}

interface Point {
  x: number;
  y: number;
}

const convertDataToPoints = (data: number[], width: number, height: number): Point[] => {
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const padding = 2;

  return data.map((value, index) => ({
    x: padding + (index / (data.length - 1 || 1)) * (width - padding * 2),
    y: height - padding - ((value - min) / range) * (height - padding * 2),
  }));
};

const buildSmoothPath = (points: Point[]): string => {
  if (points.length === 0) return '';
  if (points.length === 1) return `M${points[0].x},${points[0].y}`;

  let d = `M${points[0].x},${points[0].y}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i];
    const p1 = points[i + 1];
    const cpx = (p0.x + p1.x) / 2;
    d += ` Q${cpx},${p0.y} ${p1.x},${p1.y}`;
  }
  return d;
};

const buildAreaPath = (points: Point[], height: number): string => {
  if (points.length === 0) return '';
  const smooth = buildSmoothPath(points);
  const last = points[points.length - 1];
  const first = points[0];
  return `${smooth} L${last.x},${height} L${first.x},${height} Z`;
};

const SparklineChart: React.FC<SparklineChartProps> = ({
  data,
  width: containerWidth = 80,
  height: containerHeight = 32,
  color = '#6366F1',
  strokeWidth = 1.5,
}) => {
  const gradientId = useMemo(() => `sparkline-grad-${Math.random().toString(36).slice(2, 9)}`, []);

  const points = useMemo(
    () => convertDataToPoints(data, containerWidth, containerHeight),
    [data, containerWidth, containerHeight]
  );

  const linePath = useMemo(() => buildSmoothPath(points), [points]);
  const areaPath = useMemo(() => buildAreaPath(points, containerHeight), [points, containerHeight]);

  if (data.length === 0) return null;

  return (
    <svg
      width={containerWidth}
      height={containerHeight}
      viewBox={`0 0 ${containerWidth} ${containerHeight}`}
      style={{ display: 'block', overflow: 'visible' }}
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.25} />
          <stop offset="100%" stopColor={color} stopOpacity={0.02} />
        </linearGradient>
      </defs>
      <path d={areaPath} fill={`url(#${gradientId})`} />
      <path
        d={linePath}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
};

export default SparklineChart;
