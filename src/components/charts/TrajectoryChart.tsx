'use client';

import { useId } from 'react';

/**
 * A small multi-series line chart, drawn as inline SVG.
 *
 * The app has no charting dependency and does not need one: the shapes here
 * are ten-point lines over a fixed turn axis. Inline SVG keeps the bundle as
 * it was and renders identically under jsdom, so the geometry is testable.
 */

export interface ChartSeries {
  key: string;
  label: string;
  /** One value per turn, in turn order. */
  points: number[];
  color: string;
}

interface TrajectoryChartProps {
  series: ChartSeries[];
  /** Turn numbers, matching the length of each series. */
  labels: number[];
  height?: number;
  /** Forces the vertical range. Percentage metrics pass [0, 100]. */
  domain?: [number, number];
  /** Formats a value for the axis and the accessible summary. */
  formatValue?: (value: number) => string;
  title?: string;
}

const PADDING = { top: 12, right: 12, bottom: 22, left: 44 };
const VIEW_WIDTH = 480;

export function TrajectoryChart({
  series,
  labels,
  height = 180,
  domain,
  formatValue = (v) => String(Math.round(v)),
  title,
}: TrajectoryChartProps) {
  const gradientId = useId();
  const withPoints = series.filter((s) => s.points.length > 0);

  if (withPoints.length === 0 || labels.length === 0) {
    return (
      <div className="text-center text-text-muted text-sm py-10" role="status">
        No turns to chart yet
      </div>
    );
  }

  const { min, max } = resolveDomain(withPoints, domain);
  const plotWidth = VIEW_WIDTH - PADDING.left - PADDING.right;
  const plotHeight = height - PADDING.top - PADDING.bottom;

  const xFor = (index: number, count: number) =>
    PADDING.left + (count <= 1 ? plotWidth / 2 : (index / (count - 1)) * plotWidth);

  const yFor = (value: number) =>
    PADDING.top + plotHeight - ((clampToDomain(value, min, max) - min) / (max - min || 1)) * plotHeight;

  const ticks = [max, (max + min) / 2, min];

  return (
    <figure className="w-full">
      {title !== undefined && (
        <figcaption className="text-xs text-text-muted mb-2">{title}</figcaption>
      )}

      <svg
        viewBox={`0 0 ${VIEW_WIDTH} ${height}`}
        className="w-full"
        style={{ height }}
        role="img"
        aria-label={accessibleSummary(withPoints, formatValue, title)}
      >
        <defs>
          <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="currentColor" stopOpacity="0.18" />
            <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* Horizontal guides and their value labels */}
        {ticks.map((tick, index) => (
          <g key={`tick-${index}`}>
            <line
              x1={PADDING.left}
              x2={VIEW_WIDTH - PADDING.right}
              y1={yFor(tick)}
              y2={yFor(tick)}
              stroke="#1e2a3a"
              strokeWidth="1"
            />
            <text
              x={PADDING.left - 6}
              y={yFor(tick) + 3}
              textAnchor="end"
              fontSize="9"
              fill="#4a5568"
              fontFamily="monospace"
            >
              {formatValue(tick)}
            </text>
          </g>
        ))}

        {/* Turn numbers along the bottom */}
        {labels.map((label, index) => (
          <text
            key={`label-${label}-${index}`}
            x={xFor(index, labels.length)}
            y={height - 6}
            textAnchor="middle"
            fontSize="9"
            fill="#4a5568"
            fontFamily="monospace"
          >
            {label}
          </text>
        ))}

        {withPoints.map((line) => (
          <g key={line.key} color={line.color}>
            <path
              d={linePath(line.points, xFor, yFor)}
              fill="none"
              stroke={line.color}
              strokeWidth="2"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
            {line.points.map((value, index) => (
              <circle
                key={`${line.key}-${index}`}
                cx={xFor(index, line.points.length)}
                cy={yFor(value)}
                r="2.5"
                fill={line.color}
              >
                <title>{`${line.label} — turn ${labels[index] ?? index + 1}: ${formatValue(value)}`}</title>
              </circle>
            ))}
          </g>
        ))}
      </svg>

      {withPoints.length > 1 && (
        <ul className="flex flex-wrap gap-x-4 gap-y-1 mt-2 justify-center">
          {withPoints.map((line) => (
            <li key={line.key} className="flex items-center gap-1.5 text-xs text-text-secondary">
              <span
                aria-hidden="true"
                className="inline-block w-2.5 h-2.5 rounded-sm"
                style={{ backgroundColor: line.color }}
              />
              {line.label}
            </li>
          ))}
        </ul>
      )}
    </figure>
  );
}

/** The `d` attribute for one polyline. Exported so the geometry is testable. */
export function linePath(
  points: number[],
  xFor: (index: number, count: number) => number,
  yFor: (value: number) => number
): string {
  return points
    .map((value, index) => `${index === 0 ? 'M' : 'L'}${xFor(index, points.length).toFixed(2)} ${yFor(value).toFixed(2)}`)
    .join(' ');
}

/**
 * The vertical range to draw over.
 *
 * A caller-supplied domain wins. Otherwise the data's own range is used, padded
 * so the extremes are not drawn on the frame, and a flat series is given an
 * arbitrary band so it renders as a line through the middle rather than a
 * divide-by-zero.
 */
export function resolveDomain(
  series: ChartSeries[],
  domain?: [number, number]
): { min: number; max: number } {
  if (domain) return { min: domain[0], max: domain[1] };

  const values = series.flatMap((s) => s.points).filter((v) => Number.isFinite(v));
  if (values.length === 0) return { min: 0, max: 1 };

  const rawMin = Math.min(...values);
  const rawMax = Math.max(...values);

  if (rawMin === rawMax) {
    const band = Math.abs(rawMin) * 0.1 || 1;
    return { min: rawMin - band, max: rawMax + band };
  }

  const padding = (rawMax - rawMin) * 0.08;
  return { min: rawMin - padding, max: rawMax + padding };
}

function clampToDomain(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function accessibleSummary(
  series: ChartSeries[],
  formatValue: (value: number) => string,
  title?: string
): string {
  const parts = series.map((line) => {
    const first = line.points[0];
    const last = line.points[line.points.length - 1];
    return `${line.label} from ${formatValue(first)} to ${formatValue(last)}`;
  });

  return `${title ?? 'Metric trajectory'}: ${parts.join('; ')}`;
}
