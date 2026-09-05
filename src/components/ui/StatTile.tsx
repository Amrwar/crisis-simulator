import type { ReactNode } from 'react';

/**
 * A single headline number with its label — the unit the analytics, profile
 * and comparison pages build their summary rows from.
 */

interface StatTileProps {
  label: string;
  value: ReactNode;
  /** A smaller line under the value: a delta, a rank, a denominator. */
  hint?: ReactNode;
  /** Tailwind text colour for the value. Defaults to the primary text colour. */
  valueColor?: string;
  icon?: string;
}

export function StatTile({ label, value, hint, valueColor, icon }: StatTileProps) {
  return (
    <div className="metric-card">
      <div className="text-text-muted text-xs flex items-center gap-1.5 mb-1">
        {icon !== undefined && <span aria-hidden="true">{icon}</span>}
        {label}
      </div>
      <div className={`font-mono font-bold text-xl ${valueColor ?? 'text-text-primary'}`}>
        {value}
      </div>
      {hint !== undefined && hint !== '' && (
        <div className="text-xs text-text-muted mt-1">{hint}</div>
      )}
    </div>
  );
}

/** A responsive row of tiles. */
export function StatRow({ children }: { children: ReactNode }) {
  return <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">{children}</div>;
}

/**
 * A labelled 0–100 bar, reusing the colour thresholds the metrics sidebar
 * established. `inverted` is for metrics where a high number is bad.
 */
export function MeterBar({
  value,
  inverted = false,
  className = '',
}: {
  value: number;
  inverted?: boolean;
  className?: string;
}) {
  const clamped = Math.min(100, Math.max(0, value));
  const fill = inverted ? 100 - clamped : clamped;
  const color = fill > 70 ? '#22c55e' : fill > 40 ? '#eab308' : '#ef4444';

  return (
    <div className={`w-full bg-bg-secondary rounded-full h-1.5 ${className}`.trim()}>
      <div
        className="h-1.5 rounded-full transition-all duration-500"
        style={{ width: `${fill}%`, backgroundColor: color }}
      />
    </div>
  );
}
