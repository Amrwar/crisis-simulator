'use client';

import { MeterBar } from '@/components/ui/StatTile';
import { formatPercent } from '@/lib/format';
import type { GroupStats } from '@/lib/analytics/user-stats';

/**
 * The per-industry and per-difficulty tables on the analytics page. A group
 * with nothing completed shows a dash rather than a misleading zero: never
 * having finished a Hard run is not the same as never having won one.
 */

interface GroupBreakdownProps {
  groups: GroupStats[];
  /** What the key column holds — "Industry" or "Difficulty". */
  keyLabel: string;
  emptyMessage?: string;
}

export function GroupBreakdown({
  groups,
  keyLabel,
  emptyMessage = 'No runs yet.',
}: GroupBreakdownProps) {
  if (groups.length === 0) {
    return <p className="text-sm text-text-muted py-4">{emptyMessage}</p>;
  }

  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-left text-xs uppercase tracking-wider text-text-muted">
          <th scope="col" className="py-2 font-semibold">
            {keyLabel}
          </th>
          <th scope="col" className="py-2 font-semibold text-right">
            Runs
          </th>
          <th scope="col" className="py-2 font-semibold text-right">
            Win rate
          </th>
          <th scope="col" className="py-2 font-semibold text-right">
            Avg score
          </th>
        </tr>
      </thead>
      <tbody>
        {groups.map((group) => (
          <tr key={group.key} className="border-t border-bg-border">
            <td className="py-2.5 text-text-primary">{group.key}</td>
            <td className="py-2.5 text-right font-mono text-text-secondary">
              {group.runs}
              {group.completed < group.runs && (
                <span className="text-text-muted text-xs ml-1">({group.completed} done)</span>
              )}
            </td>
            <td className="py-2.5 text-right">
              {group.winRate === null ? (
                <span className="text-text-muted">—</span>
              ) : (
                <div className="flex items-center justify-end gap-2">
                  <span className="font-mono text-text-primary">
                    {formatPercent(group.winRate * 100, 0)}
                  </span>
                  <span className="w-14">
                    <MeterBar value={group.winRate * 100} />
                  </span>
                </div>
              )}
            </td>
            <td className="py-2.5 text-right font-mono text-text-secondary">
              {group.averageScore === null ? (
                <span className="text-text-muted">—</span>
              ) : (
                Math.round(group.averageScore)
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
