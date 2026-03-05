'use client';

import { useMemo } from 'react';

export interface Metrics {
  cash: number;
  monthlyRevenue: number;
  burnRate: number;
  reputation: number;
  morale: number;
  churn: number;
  legalRisk: number;
  marketShare: number;
}

interface MetricsSidebarProps {
  metrics: Metrics;
  deltas?: Partial<Metrics>;
  startingCash: number;
}

function formatEGP(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}K`;
  return String(Math.round(n));
}

function DeltaBadge({ delta }: { delta?: number }) {
  if (delta === undefined || delta === 0) return null;
  const isPos = delta > 0;
  return (
    <span
      className={`ml-2 text-xs font-mono ${isPos ? 'text-accent-green' : 'text-accent-red'}`}
    >
      {isPos ? '+' : ''}{delta > 1000 ? formatEGP(delta) : Math.round(delta * 10) / 10}
    </span>
  );
}

function CashBar({ value, max }: { value: number; max: number }) {
  const pct = Math.min(100, (value / max) * 100);
  const color = pct > 50 ? '#22c55e' : pct > 20 ? '#f97316' : '#ef4444';
  return (
    <div className="w-full bg-bg-secondary rounded-full h-1.5 mt-1.5">
      <div
        className="h-1.5 rounded-full transition-all duration-500"
        style={{ width: `${pct}%`, backgroundColor: color }}
      />
    </div>
  );
}

function PercentBar({ value, inverted = false }: { value: number; inverted?: boolean }) {
  const displayPct = Math.min(100, Math.max(0, value));
  const fillPct = inverted ? 100 - displayPct : displayPct;
  const color =
    fillPct > 70 ? '#22c55e' : fillPct > 40 ? '#eab308' : '#ef4444';

  return (
    <div className="w-full bg-bg-secondary rounded-full h-1.5 mt-1.5">
      <div
        className="h-1.5 rounded-full transition-all duration-500"
        style={{ width: `${fillPct}%`, backgroundColor: color }}
      />
    </div>
  );
}

interface MetricRowProps {
  icon: string;
  label: string;
  value: string;
  delta?: number;
  bar?: React.ReactNode;
  valueColor?: string;
}

function MetricRow({ icon, label, value, delta, bar, valueColor }: MetricRowProps) {
  return (
    <div className="metric-card">
      <div className="flex items-center justify-between">
        <span className="text-text-muted text-xs flex items-center gap-1.5">
          <span>{icon}</span>
          {label}
        </span>
        <span className={`font-mono font-semibold text-sm ${valueColor || 'text-text-primary'}`}>
          {value}
          <DeltaBadge delta={delta} />
        </span>
      </div>
      {bar}
    </div>
  );
}

export function MetricsSidebar({ metrics, deltas, startingCash }: MetricsSidebarProps) {
  const netFlow = metrics.monthlyRevenue - metrics.burnRate;
  const netColor = netFlow >= 0 ? 'text-accent-green' : 'text-accent-red';

  return (
    <div className="space-y-2">
      <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-3">
        Company Metrics
      </h3>

      {/* Cash */}
      <MetricRow
        icon="💰"
        label="Cash (EGP)"
        value={formatEGP(metrics.cash)}
        delta={deltas?.cash}
        valueColor={
          metrics.cash > startingCash * 0.5
            ? 'text-accent-green'
            : metrics.cash > startingCash * 0.2
            ? 'text-accent-orange'
            : 'text-accent-red'
        }
        bar={<CashBar value={metrics.cash} max={startingCash * 2} />}
      />

      {/* Revenue & Burn */}
      <div className="metric-card space-y-1.5">
        <div className="flex items-center justify-between">
          <span className="text-text-muted text-xs">📈 Revenue/mo</span>
          <span className="font-mono text-sm text-accent-blue">
            {formatEGP(metrics.monthlyRevenue)} EGP
            <DeltaBadge delta={deltas?.monthlyRevenue} />
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-text-muted text-xs">🔥 Burn/mo</span>
          <span className="font-mono text-sm text-accent-orange">
            {formatEGP(metrics.burnRate)} EGP
            <DeltaBadge delta={deltas?.burnRate} />
          </span>
        </div>
        <div className="border-t border-bg-border pt-1.5 flex items-center justify-between">
          <span className="text-text-muted text-xs">Net/mo</span>
          <span className={`font-mono text-sm font-bold ${netColor}`}>
            {netFlow >= 0 ? '+' : ''}{formatEGP(netFlow)} EGP
          </span>
        </div>
      </div>

      {/* Reputation */}
      <MetricRow
        icon="⭐"
        label="Reputation"
        value={`${Math.round(metrics.reputation)}/100`}
        delta={deltas?.reputation}
        valueColor={
          metrics.reputation >= 70 ? 'text-accent-purple' :
          metrics.reputation >= 40 ? 'text-accent-yellow' : 'text-accent-red'
        }
        bar={<PercentBar value={metrics.reputation} />}
      />

      {/* Morale */}
      <MetricRow
        icon="💙"
        label="Employee Morale"
        value={`${Math.round(metrics.morale)}/100`}
        delta={deltas?.morale}
        valueColor={
          metrics.morale >= 65 ? 'text-accent-green' :
          metrics.morale >= 35 ? 'text-accent-yellow' : 'text-accent-red'
        }
        bar={<PercentBar value={metrics.morale} />}
      />

      {/* Churn */}
      <MetricRow
        icon="🔄"
        label="Customer Churn"
        value={`${Math.round(metrics.churn)}%`}
        delta={deltas?.churn ? -deltas.churn : undefined} // inverted: positive churn delta is bad
        valueColor={
          metrics.churn <= 15 ? 'text-accent-green' :
          metrics.churn <= 35 ? 'text-accent-yellow' : 'text-accent-red'
        }
        bar={<PercentBar value={metrics.churn} inverted />}
      />

      {/* Legal Risk */}
      <MetricRow
        icon="⚖️"
        label="Legal Risk"
        value={`${Math.round(metrics.legalRisk)}/100`}
        delta={deltas?.legalRisk ? -deltas.legalRisk : undefined}
        valueColor={
          metrics.legalRisk <= 20 ? 'text-accent-green' :
          metrics.legalRisk <= 50 ? 'text-accent-yellow' : 'text-accent-red'
        }
        bar={<PercentBar value={metrics.legalRisk} inverted />}
      />

      {/* Market Share */}
      <MetricRow
        icon="📊"
        label="Market Share"
        value={`${Math.round(metrics.marketShare * 10) / 10}%`}
        delta={deltas?.marketShare}
        valueColor={
          metrics.marketShare >= 30 ? 'text-accent-green' :
          metrics.marketShare >= 15 ? 'text-accent-blue' : 'text-accent-orange'
        }
        bar={<PercentBar value={metrics.marketShare} />}
      />

      {/* Danger zones */}
      <div className="mt-3 space-y-1.5">
        {metrics.cash < 100_000 && (
          <div className="flex items-center gap-2 text-xs text-accent-red bg-red-950/30 border border-accent-red/30 rounded-md px-3 py-2">
            <span>⚠️</span> Critical: Cash nearly depleted
          </div>
        )}
        {metrics.legalRisk >= 75 && (
          <div className="flex items-center gap-2 text-xs text-accent-orange bg-orange-950/30 border border-accent-orange/30 rounded-md px-3 py-2">
            <span>⚖️</span> High legal risk — scandal imminent
          </div>
        )}
        {metrics.morale < 25 && (
          <div className="flex items-center gap-2 text-xs text-accent-yellow bg-yellow-950/30 border border-accent-yellow/30 rounded-md px-3 py-2">
            <span>😤</span> Morale critical — resignation wave risk
          </div>
        )}
      </div>
    </div>
  );
}
