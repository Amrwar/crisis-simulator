'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { GroupBreakdown } from '@/components/analytics/GroupBreakdown';
import { ScoreHistoryChart, trendSummary } from '@/components/analytics/ScoreHistoryChart';
import { AppHeader } from '@/components/layout/AppHeader';
import { ErrorBoundary } from '@/components/layout/ErrorBoundary';
import { Badge, endingLabel, endingTone } from '@/components/ui/Badge';
import { Card, CardHeader, SectionHeading } from '@/components/ui/Card';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/States';
import { StatRow, StatTile } from '@/components/ui/StatTile';
import type { UserAnalyticsPayload } from '@/lib/analytics/user-stats';
import { ApiError, apiGet, messageFor } from '@/lib/client/api';
import { fetchCurrentUser, type CurrentUser } from '@/lib/client/session';
import { formatPercent, humanizeTag, pluralize } from '@/lib/format';

export default function AnalyticsPage() {
  const router = useRouter();

  const [user, setUser] = useState<CurrentUser | null>(null);
  const [data, setData] = useState<UserAnalyticsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchCurrentUser().then(setUser);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      setData(await apiGet<UserAnalyticsPayload>('/api/analytics/me'));
    } catch (cause) {
      if (cause instanceof ApiError && cause.isUnauthorized) {
        router.push('/auth/login');
        return;
      }
      setError(messageFor(cause));
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="min-h-screen">
      <AppHeader user={user} />

      <main className="max-w-7xl mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-text-primary">Analytics</h1>
          <p className="text-text-secondary mt-1">
            How your simulations have gone, and what you tend to decide.
          </p>
        </div>

        {loading && data === null ? (
          <LoadingState label="Crunching your history…" />
        ) : error !== null ? (
          <ErrorState message={error} onRetry={load} />
        ) : data === null || data.stats.totalRuns === 0 ? (
          <EmptyState
            icon="📈"
            title="Nothing to analyse yet"
            description="Your win rate, score trend and decision habits appear here once you have played a simulation."
            action={{ href: '/new', label: 'Start a simulation' }}
          />
        ) : (
          <AnalyticsBody data={data} />
        )}
      </main>
    </div>
  );
}

function AnalyticsBody({ data }: { data: UserAnalyticsPayload }) {
  const { stats } = data;

  return (
    <div className="space-y-8">
      <section>
        <SectionHeading>Overview</SectionHeading>
        <StatRow>
          <StatTile
            icon="🎮"
            label="Simulations"
            value={stats.totalRuns}
            hint={
              stats.activeRuns > 0
                ? `${pluralize(stats.activeRuns, 'still active')}`
                : 'All completed'
            }
          />
          <StatTile
            icon="🏆"
            label="Win rate"
            value={stats.winRate === null ? '—' : formatPercent(stats.winRate * 100, 0)}
            hint={
              stats.completedRuns === 0
                ? 'No completed runs yet'
                : `${stats.wins} of ${stats.completedRuns} completed`
            }
            valueColor={winRateColor(stats.winRate)}
          />
          <StatTile
            icon="⭐"
            label="Average score"
            value={stats.averageScore === null ? '—' : Math.round(stats.averageScore)}
            hint={stats.bestScore === null ? 'Out of 100' : `Best ${stats.bestScore}`}
          />
          <StatTile
            icon="🔥"
            label={stats.streak.currentIsLosing ? 'Losing streak' : 'Win streak'}
            value={stats.streak.current}
            hint={`Longest ${stats.streak.longest}`}
            valueColor={
              stats.streak.currentIsLosing && stats.streak.current > 0
                ? 'text-accent-red'
                : stats.streak.current > 0
                  ? 'text-accent-green'
                  : undefined
            }
          />
        </StatRow>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <ErrorBoundary label="The score trend">
          <Card>
            <CardHeader
              title="Score trend"
              subtitle={trendSummary(data.scoreHistory) || 'Every completed run, in finish order'}
            />
            <ScoreHistoryChart history={data.scoreHistory} />
          </Card>
        </ErrorBoundary>

        <Card>
          <CardHeader title="How your runs ended" subtitle="Across every completed simulation" />
          {Object.keys(stats.endingCounts).length === 0 ? (
            <p className="text-sm text-text-muted py-4">No completed runs yet.</p>
          ) : (
            <ul className="space-y-2">
              {Object.entries(stats.endingCounts)
                .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
                .map(([ending, count]) => (
                  <li key={ending} className="flex items-center justify-between">
                    <Badge tone={endingTone(ending)}>{endingLabel(ending)}</Badge>
                    <span className="font-mono text-sm text-text-secondary">
                      {pluralize(count, 'run')}
                    </span>
                  </li>
                ))}
            </ul>
          )}

          <dl className="grid grid-cols-2 gap-3 mt-5 pt-4 border-t border-bg-border text-sm">
            <div>
              <dt className="text-text-muted text-xs">Avg turns survived</dt>
              <dd className="font-mono text-text-primary">
                {stats.averageTurnsSurvived === null ? '—' : stats.averageTurnsSurvived}
              </dd>
            </div>
            <div>
              <dt className="text-text-muted text-xs">Went the distance</dt>
              <dd className="font-mono text-text-primary">
                {stats.fullDistanceRuns} / {stats.completedRuns}
              </dd>
            </div>
          </dl>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="By industry" subtitle="Where you do best" />
          <GroupBreakdown groups={stats.byIndustry} keyLabel="Industry" />
        </Card>

        <Card>
          <CardHeader title="By difficulty" subtitle="How the setting changes your outcome" />
          <GroupBreakdown groups={stats.byDifficulty} keyLabel="Difficulty" />
        </Card>
      </div>

      <Card>
        <CardHeader
          title="Your decision habits"
          subtitle={
            data.favouriteDecisions.length === 0
              ? 'Decide a turn and your habits appear here'
              : `Across ${pluralize(
                  data.favouriteDecisions.reduce((sum, d) => sum + d.count, 0),
                  'tagged decision'
                )}`
          }
          action={
            stats.bestRunId ? (
              <Link href={`/sim/${stats.bestRunId}/report`} className="btn-ghost text-xs py-1.5 px-3">
                Open best run
              </Link>
            ) : undefined
          }
        />

        {data.favouriteDecisions.length === 0 ? (
          <p className="text-sm text-text-muted py-4">Nothing decided yet.</p>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {data.favouriteDecisions.slice(0, 18).map((decision) => (
              <li key={decision.tag}>
                <span className="tag-badge">
                  {humanizeTag(decision.tag)}
                  <span className="ml-1.5 text-accent-blue">{decision.count}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function winRateColor(winRate: number | null): string | undefined {
  if (winRate === null) return undefined;
  if (winRate >= 0.6) return 'text-accent-green';
  if (winRate >= 0.3) return 'text-accent-yellow';
  return 'text-accent-red';
}
