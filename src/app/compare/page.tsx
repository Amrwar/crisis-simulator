'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';

import { TrajectoryChart } from '@/components/charts/TrajectoryChart';
import { AppHeader } from '@/components/layout/AppHeader';
import { ErrorBoundary } from '@/components/layout/ErrorBoundary';
import { Badge, difficultyTone, endingLabel, endingTone } from '@/components/ui/Badge';
import { Card, CardHeader, SectionHeading } from '@/components/ui/Card';
import { EmptyState, ErrorState, LoadingState, Notice } from '@/components/ui/States';
import type { RunComparison } from '@/lib/analytics/compare';
import { comparisonHeadline } from '@/lib/analytics/compare';
import { ApiError, apiGet, messageFor } from '@/lib/client/api';
import { fetchCurrentUser, type CurrentUser } from '@/lib/client/session';
import { formatCompactAmount, humanizeTag, ordinal, pluralize } from '@/lib/format';
import type { SimulationSearchPayload } from '@/lib/simulations/results';
import { METRIC_META, type VisibleMetricKey } from '@/types';

const COLOR_A = '#3b82f6';
const COLOR_B = '#a855f7';

interface RunOption {
  id: string;
  companyName: string;
  industry: string;
  endingType: string;
  createdAt: string;
}

export default function ComparePage() {
  return (
    <Suspense fallback={<div className="min-h-screen" />}>
      <CompareBody />
    </Suspense>
  );
}

function CompareBody() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [user, setUser] = useState<CurrentUser | null>(null);
  const [runs, setRuns] = useState<RunOption[]>([]);
  const [a, setA] = useState(searchParams.get('a') ?? '');
  const [b, setB] = useState(searchParams.get('b') ?? '');

  const [comparison, setComparison] = useState<RunComparison | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchCurrentUser().then(setUser);
  }, []);

  /**
   * The run picker lists only finished runs: a comparison of a run in progress
   * against a finished one would compare an unfinished trajectory.
   *
   * That narrowing is the search endpoint's rather than the browser's. Reading
   * the unpaged list and discarding the active runs here meant downloading
   * every run the player had ever started to fill one dropdown, and getting
   * slower with each new one. `pageSize` bounds it at the hundred most recent
   * finished runs, well past the point a dropdown stays usable.
   */
  useEffect(() => {
    apiGet<SimulationSearchPayload>(
      '/api/simulations/search?status=ended&sort=createdAt&direction=desc&pageSize=100'
    )
      .then((payload) => setRuns(payload.page.items))
      .catch(() => setRuns([]));
  }, []);

  const load = useCallback(async () => {
    if (a === '' || b === '' || a === b) {
      setComparison(null);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      setComparison(
        await apiGet<RunComparison>(
          `/api/simulations/compare?a=${encodeURIComponent(a)}&b=${encodeURIComponent(b)}`
        )
      );
    } catch (cause) {
      if (cause instanceof ApiError && cause.isUnauthorized) {
        router.push('/auth/login');
        return;
      }
      setComparison(null);
      setError(messageFor(cause));
    } finally {
      setLoading(false);
    }
  }, [a, b, router]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="min-h-screen">
      <AppHeader user={user} />

      <main className="max-w-7xl mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-text-primary">Compare runs</h1>
          <p className="text-text-secondary mt-1">
            Two finished simulations side by side: where the metrics parted, and where the
            decisions did.
          </p>
        </div>

        {runs.length < 2 ? (
          <EmptyState
            icon="⚖️"
            title="Not enough finished runs to compare"
            description="Comparison needs two completed simulations. Finish another and they can be lined up."
            action={{ href: '/new', label: 'Start a simulation' }}
          />
        ) : (
          <>
            <div className="glass-panel p-4 mb-6 grid gap-3 sm:grid-cols-2">
              <RunPicker label="First run" value={a} onChange={setA} runs={runs} exclude={b} />
              <RunPicker label="Second run" value={b} onChange={setB} runs={runs} exclude={a} />
            </div>

            {a !== '' && b !== '' && a === b && (
              <Notice tone="danger">Pick two different runs to compare.</Notice>
            )}

            {loading ? (
              <LoadingState label="Lining the runs up…" />
            ) : error !== null ? (
              <ErrorState message={error} onRetry={load} />
            ) : comparison === null ? (
              <p className="text-text-muted text-center py-16">
                Choose two runs above to compare them.
              </p>
            ) : (
              <ErrorBoundary label="The comparison">
                <ComparisonView comparison={comparison} />
              </ErrorBoundary>
            )}
          </>
        )}
      </main>
    </div>
  );
}

function RunPicker({
  label,
  value,
  onChange,
  runs,
  exclude,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  runs: RunOption[];
  exclude: string;
}) {
  return (
    <label className="block">
      <span className="text-xs text-text-muted">{label}</span>
      <select
        aria-label={label}
        className="input-field mt-1 py-1.5 text-sm"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">Choose a run…</option>
        {runs
          .filter((run) => run.id !== exclude)
          .map((run) => (
            <option key={run.id} value={run.id}>
              {run.companyName || run.industry} · {endingLabel(run.endingType)}
            </option>
          ))}
      </select>
    </label>
  );
}

function ComparisonView({ comparison }: { comparison: RunComparison }) {
  const { a, b } = comparison;

  return (
    <div className="space-y-6">
      <Notice tone="info">{comparisonHeadline(comparison)}</Notice>

      <div className="grid gap-4 sm:grid-cols-2">
        <RunHeaderCard run={a} color={COLOR_A} won={comparison.metricsWonByA.length} />
        <RunHeaderCard run={b} color={COLOR_B} won={comparison.metricsWonByB.length} />
      </div>

      <section>
        <SectionHeading>Metric trajectories</SectionHeading>
        <div className="grid gap-4 lg:grid-cols-2">
          {comparison.metrics.map((metric) => (
            <Card key={metric.metric}>
              <CardHeader
                title={METRIC_META[metric.metric].label}
                subtitle={
                  metric.winner === 'tie'
                    ? 'Both runs finished level'
                    : `${metric.winner === 'a' ? a.companyName : b.companyName} finished ahead`
                }
                action={
                  <Badge tone={metric.winner === 'tie' ? 'neutral' : 'info'}>
                    {formatCompactAmount(metric.aLast)} v {formatCompactAmount(metric.bLast)}
                  </Badge>
                }
              />
              <TrajectoryChart
                height={140}
                labels={longerAxis(metric.aValues.length, metric.bValues.length)}
                domain={domainFor(metric.metric)}
                formatValue={formatCompactAmount}
                series={[
                  { key: 'a', label: a.companyName, color: COLOR_A, points: metric.aValues },
                  { key: 'b', label: b.companyName, color: COLOR_B, points: metric.bValues },
                ]}
              />
            </Card>
          ))}
        </div>
      </section>

      <Card>
        <CardHeader
          title="Decisions"
          subtitle={
            comparison.firstDivergentTurn === null
              ? `The two runs never took a materially different line across ${pluralize(comparison.comparableTurns, 'shared turn')}`
              : `First parted ways on the ${ordinal(comparison.firstDivergentTurn)} turn`
          }
        />

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wider text-text-muted">
                <th scope="col" className="py-2 pr-3 font-semibold">
                  Turn
                </th>
                <th scope="col" className="py-2 pr-3 font-semibold">
                  {a.companyName}
                </th>
                <th scope="col" className="py-2 font-semibold">
                  {b.companyName}
                </th>
              </tr>
            </thead>
            <tbody>
              {comparison.decisions.map((decision) => (
                <tr
                  key={decision.turnNumber}
                  data-diverged={decision.diverged ? 'true' : 'false'}
                  className={
                    decision.diverged
                      ? 'border-t border-accent-orange/30 bg-orange-950/10'
                      : 'border-t border-bg-border'
                  }
                >
                  <td className="py-2.5 pr-3 font-mono text-text-muted align-top">
                    {decision.turnNumber}
                  </td>
                  <td className="py-2.5 pr-3 align-top">
                    <TagList tags={decision.aTags} shared={decision.sharedTags} absent={decision.aDecision === null} />
                  </td>
                  <td className="py-2.5 align-top">
                    <TagList tags={decision.bTags} shared={decision.sharedTags} absent={decision.bDecision === null} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-3">
        <TagSummary title="Used in both" tags={comparison.sharedTags} tone="success" />
        <TagSummary title={`Only ${a.companyName}`} tags={comparison.onlyInA} tone="info" />
        <TagSummary title={`Only ${b.companyName}`} tags={comparison.onlyInB} tone="accent" />
      </div>
    </div>
  );
}

function RunHeaderCard({
  run,
  color,
  won,
}: {
  run: RunComparison['a'];
  color: string;
  won: number;
}) {
  return (
    <Card>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span
              aria-hidden="true"
              className="inline-block w-3 h-3 rounded-sm shrink-0"
              style={{ backgroundColor: color }}
            />
            <h3 className="font-semibold text-text-primary truncate">{run.companyName}</h3>
          </div>
          <div className="flex flex-wrap items-center gap-2 mt-2">
            <Badge tone="neutral">{run.industry}</Badge>
            <Badge tone={difficultyTone(run.difficulty)}>{run.difficulty}</Badge>
            <Badge tone={endingTone(run.endingType)}>{endingLabel(run.endingType)}</Badge>
          </div>
        </div>
        <div className="text-right shrink-0">
          <div className="font-mono text-2xl font-bold text-text-primary">
            {run.performanceScore}
          </div>
          <div className="text-xs text-text-muted">
            {pluralize(run.turnsCompleted, 'turn')} · ahead on {won}
          </div>
        </div>
      </div>
      <Link
        href={`/sim/${run.simulationId}/report`}
        className="text-accent-blue text-xs hover:underline mt-3 inline-block"
      >
        Open report
      </Link>
    </Card>
  );
}

function TagList({
  tags,
  shared,
  absent,
}: {
  tags: string[];
  shared: string[];
  absent: boolean;
}) {
  if (absent) return <span className="text-xs text-text-muted">Not reached</span>;
  if (tags.length === 0) return <span className="text-xs text-text-muted">No tagged decision</span>;

  return (
    <span className="flex flex-wrap gap-1.5">
      {tags.map((tag) => (
        <span
          key={tag}
          className={
            shared.includes(tag)
              ? 'tag-badge border-accent-green/40 text-accent-green'
              : 'tag-badge'
          }
        >
          {humanizeTag(tag)}
        </span>
      ))}
    </span>
  );
}

function TagSummary({
  title,
  tags,
  tone,
}: {
  title: string;
  tags: string[];
  tone: 'success' | 'info' | 'accent';
}) {
  return (
    <Card>
      <CardHeader title={title} subtitle={pluralize(tags.length, 'decision type')} />
      {tags.length === 0 ? (
        <p className="text-xs text-text-muted">None.</p>
      ) : (
        <ul className="flex flex-wrap gap-1.5">
          {tags.map((tag) => (
            <li key={tag}>
              <Badge tone={tone}>{humanizeTag(tag)}</Badge>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

/** Percentage metrics are charted on a fixed 0–100 axis so the two lines are comparable. */
function domainFor(metric: VisibleMetricKey): [number, number] | undefined {
  const unit = METRIC_META[metric].unit;
  return unit === 'currency' ? undefined : [0, 100];
}

function longerAxis(aLength: number, bLength: number): number[] {
  return Array.from({ length: Math.max(aLength, bLength) }, (_, index) => index + 1);
}
