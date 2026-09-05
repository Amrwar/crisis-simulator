'use client';

import Link from 'next/link';

import { Badge, difficultyTone, endingLabel, endingTone, industryIcon } from '@/components/ui/Badge';
import { formatCompactAmount, formatDate, formatPercent } from '@/lib/format';
import type { SimulationSearchResult } from '@/lib/simulations/results';

/**
 * One run on the dashboard. Split out of the page so the card's own branching
 * — active versus finished, scored versus not, labelled versus not — can be
 * tested without mounting the whole route.
 */
export function SimulationCard({ sim }: { sim: SimulationSearchResult }) {
  const active = sim.status === 'active';
  const progress = sim.maxTurns === 0 ? 0 : (sim.currentTurn / sim.maxTurns) * 100;

  return (
    <Link
      href={active ? `/sim/${sim.id}` : `/sim/${sim.id}/report`}
      data-status={sim.status}
      className="glass-panel p-5 hover:border-accent-blue/40 transition-all duration-150 block group"
    >
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-xl shrink-0" aria-hidden="true">
            {industryIcon(sim.industry)}
          </span>
          <div className="min-w-0">
            <h3 className="font-semibold text-text-primary text-sm leading-tight truncate group-hover:text-accent-blue transition-colors">
              {sim.companyName || sim.industry}
            </h3>
            <p className="text-xs text-text-muted">
              {sim.industry} · {sim.companySize}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {sim.hasNotes && (
            <span className="text-xs" title="You have written a note on this run" aria-label="Has a note">
              📝
            </span>
          )}
          <Badge tone={active ? 'success' : 'neutral'}>{active ? 'Active' : 'Done'}</Badge>
        </div>
      </div>

      {!active && sim.endingType !== '' && (
        <div className="flex items-center justify-between mb-3">
          <Badge tone={endingTone(sim.endingType)}>{endingLabel(sim.endingType)}</Badge>
          {sim.performanceScore > 0 && (
            <span className="font-mono text-sm font-bold text-text-primary">
              {sim.performanceScore}
              <span className="text-text-muted text-xs font-normal">/100</span>
            </span>
          )}
        </div>
      )}

      <div className="mb-4">
        <div className="flex justify-between text-xs text-text-muted mb-1.5">
          <span>
            Turn {sim.currentTurn}/{sim.maxTurns}
          </span>
          <Badge tone={difficultyTone(sim.difficulty)}>{sim.difficulty}</Badge>
        </div>
        <div className="w-full bg-bg-secondary rounded-full h-1.5">
          <div
            className={`h-1.5 rounded-full transition-all ${active ? 'bg-accent-blue' : 'bg-bg-border'}`}
            style={{ width: `${Math.min(100, progress)}%` }}
          />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <MetricMini label="Cash" value={formatCompactAmount(sim.cash)} color="text-accent-green" />
        <MetricMini
          label="Repute"
          value={String(Math.round(sim.reputation))}
          color="text-accent-purple"
        />
        <MetricMini
          label="Market"
          value={formatPercent(sim.marketShare, 0)}
          color="text-accent-blue"
        />
      </div>

      {sim.tags.length > 0 && (
        <ul className="flex flex-wrap gap-1 mt-3">
          {sim.tags.map((tag) => (
            <li key={tag} className="tag-badge">
              {tag}
            </li>
          ))}
        </ul>
      )}

      <p className="text-xs text-text-muted mt-3">{formatDate(sim.createdAt)}</p>
    </Link>
  );
}

function MetricMini({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="bg-bg-secondary rounded-md p-2 text-center">
      <div className={`text-sm font-bold font-mono ${color}`}>{value}</div>
      <div className="text-xs text-text-muted">{label}</div>
    </div>
  );
}
