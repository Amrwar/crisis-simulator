'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

import { LeaderboardTable } from '@/components/leaderboard/LeaderboardTable';
import { AppHeader, type HeaderUser } from '@/components/layout/AppHeader';
import { ErrorBoundary } from '@/components/layout/ErrorBoundary';
import { SectionHeading } from '@/components/ui/Card';
import { FilterBar, FilterSelect } from '@/components/ui/FilterBar';
import { Pagination } from '@/components/ui/Pagination';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/States';
import { StatRow, StatTile } from '@/components/ui/StatTile';
import { ApiError, apiGet, buildQuery, messageFor } from '@/lib/client/api';
import { fetchCurrentUser } from '@/lib/client/session';
import { allScoreBands } from '@/lib/game/scoring';
import type { LeaderboardPayload } from '@/lib/leaderboard';
import { DIFFICULTIES, ENDING_TYPES, INDUSTRIES } from '@/types';

const INDUSTRY_OPTIONS = INDUSTRIES.map((value) => ({ value, label: value }));
const DIFFICULTY_OPTIONS = DIFFICULTIES.map((value) => ({ value, label: value }));
const ENDING_OPTIONS = ENDING_TYPES.map((value) => ({
  value,
  label: value.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase()),
}));

export default function LeaderboardPage() {
  const router = useRouter();

  const [user, setUser] = useState<HeaderUser | null>(null);
  const [data, setData] = useState<LeaderboardPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [industry, setIndustry] = useState('');
  const [difficulty, setDifficulty] = useState('');
  const [ending, setEnding] = useState('');
  const [page, setPage] = useState(1);

  useEffect(() => {
    // The board itself reports a 401; the header just goes nameless.
    fetchCurrentUser().then(setUser);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const query = buildQuery({ industry, difficulty, ending, page, pageSize: 15 });
      setData(await apiGet<LeaderboardPayload>(`/api/leaderboard${query}`));
    } catch (cause) {
      if (cause instanceof ApiError && cause.isUnauthorized) {
        router.push('/auth/login');
        return;
      }
      setError(messageFor(cause));
    } finally {
      setLoading(false);
    }
  }, [industry, difficulty, ending, page, router]);

  useEffect(() => {
    load();
  }, [load]);

  const activeFilters = [industry, difficulty, ending].filter((f) => f !== '').length;

  function clearFilters() {
    setIndustry('');
    setDifficulty('');
    setEnding('');
    setPage(1);
  }

  /** Any filter change resets to the first page: page 4 of the old board is meaningless. */
  function change(setter: (value: string) => void) {
    return (value: string) => {
      setter(value);
      setPage(1);
    };
  }

  return (
    <div className="min-h-screen">
      <AppHeader user={user} />

      <main className="max-w-7xl mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-text-primary">Leaderboard</h1>
          <p className="text-text-secondary mt-1">
            Every completed run, ranked by performance score. Your own runs are highlighted.
          </p>
        </div>

        <FilterBar onClear={clearFilters} activeCount={activeFilters}>
          <FilterSelect
            label="Industry"
            value={industry}
            options={INDUSTRY_OPTIONS}
            onChange={change(setIndustry)}
            anyLabel="All industries"
          />
          <FilterSelect
            label="Difficulty"
            value={difficulty}
            options={DIFFICULTY_OPTIONS}
            onChange={change(setDifficulty)}
            anyLabel="All difficulties"
          />
          <FilterSelect
            label="Ending"
            value={ending}
            options={ENDING_OPTIONS}
            onChange={change(setEnding)}
            anyLabel="All endings"
          />
        </FilterBar>

        {data?.yourBest && (
          <div className="mb-6">
            <SectionHeading>Your standing</SectionHeading>
            <StatRow>
              <StatTile
                icon="🏅"
                label="Best rank"
                value={`#${data.yourBest.rank}`}
                hint={`of ${data.totalRuns} completed runs`}
              />
              <StatTile
                icon="📊"
                label="Percentile"
                value={data.yourBest.percentile === null ? '—' : `${data.yourBest.percentile}th`}
                hint="Higher is better"
              />
              <StatTile
                icon="⭐"
                label="Best score"
                value={data.yourBest.performanceScore}
                hint="Out of 100"
              />
              <StatTile
                icon="🎯"
                label="Runs on this board"
                value={data.totalRuns}
                hint={activeFilters > 0 ? 'Matching your filters' : 'All completed runs'}
              />
            </StatRow>
          </div>
        )}

        <ErrorBoundary label="The leaderboard">
          {loading && data === null ? (
            <LoadingState label="Ranking runs…" />
          ) : error !== null ? (
            <ErrorState message={error} onRetry={load} />
          ) : data === null || data.page.items.length === 0 ? (
            <EmptyState
              icon="🏁"
              title="No completed runs yet"
              description={
                activeFilters > 0
                  ? 'No finished run matches these filters. Try widening them.'
                  : 'The board fills up as simulations reach an ending. Finish a run to appear here.'
              }
              action={activeFilters > 0 ? undefined : { href: '/new', label: 'Start a simulation' }}
            />
          ) : (
            <div className="glass-panel p-5">
              <LeaderboardTable entries={data.page.items} />
              <Pagination page={data.page} onPageChange={setPage} itemLabel="completed runs" />
            </div>
          )}
        </ErrorBoundary>

        <section className="mt-8">
          <SectionHeading>How scores band</SectionHeading>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {allScoreBands().map((band) => (
              <div key={band.band} className="metric-card">
                <div className={`font-semibold text-sm ${band.color}`}>{band.label}</div>
                <p className="text-xs text-text-muted mt-1">{band.description}</p>
              </div>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
