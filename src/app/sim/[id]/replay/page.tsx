'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { AppHeader } from '@/components/layout/AppHeader';
import { Badge, endingLabel, endingTone } from '@/components/ui/Badge';
import { Card, CardHeader } from '@/components/ui/Card';
import { ErrorState, LoadingState, Notice } from '@/components/ui/States';
import { StatRow, StatTile } from '@/components/ui/StatTile';
import { ApiError, apiGet, messageFor } from '@/lib/client/api';
import { fetchCurrentUser, type CurrentUser } from '@/lib/client/session';
import { formatCompactAmount, humanizeTag, ordinal, pluralize } from '@/lib/format';
import type { ReplayResult, ReplayStep } from '@/lib/game/replay';
import { METRIC_META, type VisibleMetricKey } from '@/types';

/**
 * The audit view for a finished run: re-run it from its seed and show, turn by
 * turn, that it lands where it landed. A page rather than a hidden check
 * because it is the evidence behind a leaderboard position.
 */
export default function ReplayPage({ params }: { params: { id: string } }) {
  const router = useRouter();

  const [user, setUser] = useState<CurrentUser | null>(null);
  const [result, setResult] = useState<ReplayResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openTurn, setOpenTurn] = useState<number | null>(null);

  useEffect(() => {
    fetchCurrentUser().then(setUser);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      setResult(await apiGet<ReplayResult>(`/api/simulations/${params.id}/replay`));
    } catch (cause) {
      if (cause instanceof ApiError && cause.isUnauthorized) {
        router.push('/auth/login');
        return;
      }
      setError(messageFor(cause));
    } finally {
      setLoading(false);
    }
  }, [params.id, router]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="min-h-screen">
      <AppHeader user={user} />

      <main className="max-w-5xl mx-auto px-4 py-8">
        <div className="flex items-start justify-between gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-bold text-text-primary">Deterministic replay</h1>
            <p className="text-text-secondary mt-1">
              The run re-computed from its stored seed and decisions, checked against what was
              recorded at the time.
            </p>
          </div>
          <Link href={`/sim/${params.id}/report`} className="btn-ghost text-sm shrink-0">
            Back to report
          </Link>
        </div>

        {loading && result === null ? (
          <LoadingState label="Re-running the simulation…" />
        ) : error !== null ? (
          <ErrorState message={error} onRetry={load} />
        ) : result === null ? null : (
          <ReplayBody result={result} openTurn={openTurn} onToggle={setOpenTurn} />
        )}
      </main>
    </div>
  );
}

function ReplayBody({
  result,
  openTurn,
  onToggle,
}: {
  result: ReplayResult;
  openTurn: number | null;
  onToggle: (turn: number | null) => void;
}) {
  return (
    <div className="space-y-6">
      <div data-verdict={result.reproduced ? 'reproduced' : 'diverged'}>
        {result.turnsReplayed === 0 ? (
          <Notice tone="info">
            This run has no decided turns yet, so there is nothing to replay.
          </Notice>
        ) : result.reproduced ? (
          <Notice tone="success">
            Reproduced exactly. All {pluralize(result.turnsReplayed, 'turn')} re-computed to the
            values stored at the time.
          </Notice>
        ) : (
          <Notice tone="danger">
            Diverged on {pluralize(result.mismatchCount, 'metric comparison')}. The stored run does
            not match what the rules engine produces from this seed.
          </Notice>
        )}
      </div>

      <StatRow>
        <StatTile icon="🎲" label="Seed" value={<span className="text-base">{result.seed}</span>} />
        <StatTile icon="🔁" label="Turns replayed" value={result.turnsReplayed} />
        <StatTile
          icon="✅"
          label="Verdict"
          value={result.reproduced ? 'Match' : 'Divergent'}
          valueColor={result.reproduced ? 'text-accent-green' : 'text-accent-red'}
          hint={`${result.mismatchCount} mismatched`}
        />
        <StatTile
          icon="🏁"
          label="Ending"
          value={
            result.computedEnding === null ? (
              '—'
            ) : (
              <Badge tone={endingTone(result.computedEnding)}>
                {endingLabel(result.computedEnding)}
              </Badge>
            )
          }
          hint={result.endingMatches ? 'Agrees with the record' : 'Disagrees with the record'}
        />
      </StatRow>

      <Card>
        <CardHeader
          title="Turn by turn"
          subtitle="Select a turn to compare every metric against the record"
        />
        <ul className="space-y-2">
          {result.steps.map((step) => (
            <li key={step.turnNumber}>
              <button
                type="button"
                onClick={() => onToggle(openTurn === step.turnNumber ? null : step.turnNumber)}
                aria-expanded={openTurn === step.turnNumber}
                className="w-full text-left metric-card hover:border-accent-blue/40 transition-colors"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="font-mono text-sm text-text-muted w-14 shrink-0">
                      {ordinal(step.turnNumber)}
                    </span>
                    <span className="flex flex-wrap gap-1.5 min-w-0">
                      {step.tags.length === 0 ? (
                        <span className="text-xs text-text-muted">No tagged decision</span>
                      ) : (
                        step.tags.map((tag) => (
                          <span key={tag} className="tag-badge">
                            {humanizeTag(tag)}
                          </span>
                        ))
                      )}
                    </span>
                  </div>
                  <Badge tone={step.matches ? 'success' : 'danger'}>
                    {step.matches ? 'Match' : `${step.mismatches.length} off`}
                  </Badge>
                </div>
              </button>

              {openTurn === step.turnNumber && <StepDetail step={step} />}
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}

function StepDetail({ step }: { step: ReplayStep }) {
  const offBy = new Map(step.mismatches.map((m) => [m.metric, m]));

  return (
    <div className="mt-2 mb-4 ml-4 pl-4 border-l border-bg-border">
      {step.competitorAction !== '' && (
        <p className="text-xs text-text-muted mb-3">
          Competitor {step.competitorAction}.
        </p>
      )}

      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs uppercase tracking-wider text-text-muted">
            <th scope="col" className="py-1.5 font-semibold">
              Metric
            </th>
            <th scope="col" className="py-1.5 font-semibold text-right">
              Replayed
            </th>
            <th scope="col" className="py-1.5 font-semibold text-right">
              Recorded
            </th>
          </tr>
        </thead>
        <tbody>
          {(Object.keys(METRIC_META) as VisibleMetricKey[]).map((metric) => {
            const mismatch = offBy.get(metric);
            return (
              <tr key={metric} className="border-t border-bg-border">
                <td className="py-1.5 text-text-secondary">{METRIC_META[metric].label}</td>
                <td
                  className={`py-1.5 text-right font-mono ${
                    mismatch ? 'text-accent-red' : 'text-text-primary'
                  }`}
                >
                  {formatCompactAmount(step.computed[metric])}
                </td>
                <td className="py-1.5 text-right font-mono text-text-muted">
                  {formatCompactAmount(step.stored[metric])}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {step.newFlags.length > 0 && (
        <p className="text-xs text-text-muted mt-3">
          Raised: {step.newFlags.map(humanizeTag).join(', ')}
        </p>
      )}
    </div>
  );
}
