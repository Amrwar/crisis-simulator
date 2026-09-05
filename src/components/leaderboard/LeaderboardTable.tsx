'use client';

import Link from 'next/link';

import { Badge, difficultyTone, endingLabel, endingTone, industryIcon } from '@/components/ui/Badge';
import { formatDate } from '@/lib/format';
import { rankMedal } from '@/lib/game/scoring';
import type { LeaderboardEntry } from '@/lib/leaderboard';

/**
 * The ranked table. Split out from the page so the highlighting rule — the
 * caller's own rows, and only those, are picked out — is testable on its own.
 */

const BAND_COLORS: Record<string, string> = {
  exceptional: 'text-accent-green',
  strong: 'text-accent-blue',
  steady: 'text-accent-cyan',
  fragile: 'text-accent-orange',
  critical: 'text-accent-red',
};

export function LeaderboardTable({ entries }: { entries: LeaderboardEntry[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm border-collapse">
        <caption className="sr-only">Completed simulations ranked by performance score</caption>
        <thead>
          <tr className="text-left text-xs uppercase tracking-wider text-text-muted">
            <th scope="col" className="py-2 pr-3 font-semibold">
              Rank
            </th>
            <th scope="col" className="py-2 pr-3 font-semibold">
              Company
            </th>
            <th scope="col" className="py-2 pr-3 font-semibold">
              Player
            </th>
            <th scope="col" className="py-2 pr-3 font-semibold">
              Setup
            </th>
            <th scope="col" className="py-2 pr-3 font-semibold">
              Ending
            </th>
            <th scope="col" className="py-2 pr-3 font-semibold text-right">
              Score
            </th>
            <th scope="col" className="py-2 font-semibold text-right">
              Finished
            </th>
          </tr>
        </thead>
        <tbody>
          {entries.map((entry) => (
            <tr
              key={entry.simulationId}
              data-current-user={entry.isCurrentUser ? 'true' : 'false'}
              className={
                entry.isCurrentUser
                  ? 'border-t border-accent-blue/40 bg-blue-950/20'
                  : 'border-t border-bg-border'
              }
            >
              <td className="py-2.5 pr-3 font-mono whitespace-nowrap">
                <span className="text-text-primary">{rankMedal(entry.rank)}</span>
                {entry.tied && (
                  <span className="text-text-muted text-xs ml-1" title="Shared position">
                    =
                  </span>
                )}
              </td>

              <td className="py-2.5 pr-3">
                <span className="mr-1.5" aria-hidden="true">
                  {industryIcon(entry.industry)}
                </span>
                {entry.isCurrentUser ? (
                  <Link
                    href={`/sim/${entry.simulationId}/report`}
                    className="text-accent-blue hover:underline font-medium"
                  >
                    {entry.companyName}
                  </Link>
                ) : (
                  <span className="text-text-primary">{entry.companyName}</span>
                )}
              </td>

              <td className="py-2.5 pr-3 text-text-secondary">
                {entry.playerName}
                {entry.isCurrentUser && (
                  <Badge tone="info" className="ml-2">
                    You
                  </Badge>
                )}
              </td>

              <td className="py-2.5 pr-3">
                <div className="flex items-center gap-1.5">
                  <span className="text-text-secondary text-xs">{entry.industry}</span>
                  <Badge tone={difficultyTone(entry.difficulty)}>{entry.difficulty}</Badge>
                </div>
              </td>

              <td className="py-2.5 pr-3">
                <Badge tone={endingTone(entry.endingType)}>{endingLabel(entry.endingType)}</Badge>
              </td>

              <td className="py-2.5 pr-3 text-right">
                <span
                  className={`font-mono font-bold ${BAND_COLORS[entry.scoreBand] ?? 'text-text-primary'}`}
                  title={entry.scoreLabel}
                >
                  {entry.performanceScore}
                </span>
                <span className="text-text-muted text-xs ml-1">
                  · {entry.turnsCompleted}/{entry.maxTurns}
                </span>
              </td>

              <td className="py-2.5 text-right text-text-muted text-xs whitespace-nowrap">
                {entry.endedAt ? formatDate(entry.endedAt) : '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
