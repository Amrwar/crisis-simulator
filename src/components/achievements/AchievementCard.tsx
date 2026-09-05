'use client';

import Link from 'next/link';

import { Badge } from '@/components/ui/Badge';
import { MeterBar } from '@/components/ui/StatTile';
import { formatDate, formatPercent, pluralize } from '@/lib/format';
import type { AchievementDefinition, AchievementProgress } from '@/lib/game/achievement-catalog';

/**
 * One achievement, locked or unlocked.
 *
 * A locked card still shows the criterion — the point of the page is to tell a
 * player what to aim at — but is visibly dimmed, and shows a progress bar only
 * where progress is actually measurable.
 */

interface AchievementCardProps {
  definition: AchievementDefinition;
  progress: AchievementProgress;
}

export function AchievementCard({ definition, progress }: AchievementCardProps) {
  const unlocked = progress.unlocked;

  return (
    <article
      data-unlocked={unlocked ? 'true' : 'false'}
      className={
        unlocked
          ? 'glass-panel p-5 border-accent-green/40'
          : 'glass-panel p-5 opacity-60 hover:opacity-100 transition-opacity'
      }
    >
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-start gap-3 min-w-0">
          <span className={`text-3xl ${unlocked ? '' : 'grayscale'}`} aria-hidden="true">
            {definition.emoji}
          </span>
          <div className="min-w-0">
            <h3 className="font-semibold text-text-primary leading-tight">{definition.label}</h3>
            <p className="text-xs text-text-muted mt-0.5">{definition.description}</p>
          </div>
        </div>

        <Badge tone={unlocked ? 'success' : 'neutral'}>{unlocked ? 'Unlocked' : 'Locked'}</Badge>
      </div>

      <p className="text-sm text-text-secondary border-l-2 border-bg-border pl-3 mb-3">
        {definition.criteria}
      </p>

      {unlocked ? (
        <div className="flex items-center justify-between text-xs">
          <span className="text-text-muted">
            {progress.unlockedAt === null ? 'Earned' : `Earned ${formatDate(progress.unlockedAt)}`}
            {progress.timesUnlocked > 1 && ` · ${pluralize(progress.timesUnlocked, 'time')}`}
          </span>
          {progress.simulationId !== null && (
            <Link
              href={`/sim/${progress.simulationId}/report`}
              className="text-accent-blue hover:underline"
            >
              View run
            </Link>
          )}
        </div>
      ) : progress.fraction !== null && definition.target !== null ? (
        <div>
          <div className="flex items-center justify-between text-xs text-text-muted mb-1.5">
            <span>Your best</span>
            <span className="font-mono">
              {formatBest(progress.best, definition)} / {formatTarget(definition)}
            </span>
          </div>
          <MeterBar value={progress.fraction * 100} />
          <p className="text-xs text-text-muted mt-1.5">
            {formatPercent(progress.fraction * 100, 0)} of the way there
          </p>
        </div>
      ) : (
        <p className="text-xs text-text-muted">Not earned yet.</p>
      )}
    </article>
  );
}

function formatBest(best: number | null, definition: AchievementDefinition): string {
  if (best === null) return '—';
  return definition.unit === 'percent' ? `${Math.round(best * 10) / 10}%` : String(Math.round(best));
}

function formatTarget(definition: AchievementDefinition): string {
  if (definition.target === null) return '—';
  return definition.unit === 'percent' ? `${definition.target}%` : String(definition.target);
}
