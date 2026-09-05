'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

import { AchievementCard } from '@/components/achievements/AchievementCard';
import { AppHeader } from '@/components/layout/AppHeader';
import { SectionHeading } from '@/components/ui/Card';
import { ErrorState, LoadingState } from '@/components/ui/States';
import { MeterBar, StatRow, StatTile } from '@/components/ui/StatTile';
import { ApiError, apiGet, messageFor } from '@/lib/client/api';
import { fetchCurrentUser, type CurrentUser } from '@/lib/client/session';
import { formatPercent } from '@/lib/format';
import {
  CATEGORY_LABELS,
  type AchievementCategory,
  type AchievementsPayload,
} from '@/lib/game/achievement-catalog';

type Filter = 'all' | 'unlocked' | 'locked';

export default function AchievementsPage() {
  const router = useRouter();

  const [user, setUser] = useState<CurrentUser | null>(null);
  const [data, setData] = useState<AchievementsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('all');

  useEffect(() => {
    fetchCurrentUser().then(setUser);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      setData(await apiGet<AchievementsPayload>('/api/achievements'));
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

  const progressByType = useMemo(() => {
    const map = new Map<string, AchievementsPayload['progress'][number]>();
    for (const entry of data?.progress ?? []) map.set(entry.type, entry);
    return map;
  }, [data]);

  const grouped = useMemo(() => {
    const buckets = new Map<AchievementCategory, AchievementsPayload['catalog']>();

    for (const definition of data?.catalog ?? []) {
      const progress = progressByType.get(definition.type);
      if (filter === 'unlocked' && !progress?.unlocked) continue;
      if (filter === 'locked' && progress?.unlocked) continue;

      const bucket = buckets.get(definition.category);
      if (bucket) bucket.push(definition);
      else buckets.set(definition.category, [definition]);
    }

    return buckets;
  }, [data, filter, progressByType]);

  const completion =
    data === null || data.totalCount === 0 ? 0 : (data.unlockedCount / data.totalCount) * 100;

  return (
    <div className="min-h-screen">
      <AppHeader user={user} />

      <main className="max-w-7xl mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-text-primary">Achievements</h1>
          <p className="text-text-secondary mt-1">
            What the simulation rewards, and how close you are to each one.
          </p>
        </div>

        {loading && data === null ? (
          <LoadingState label="Checking your trophies…" />
        ) : error !== null ? (
          <ErrorState message={error} onRetry={load} />
        ) : data === null ? null : (
          <>
            <section className="mb-8">
              <StatRow>
                <StatTile
                  icon="🏆"
                  label="Unlocked"
                  value={`${data.unlockedCount} / ${data.totalCount}`}
                  hint={formatPercent(completion, 0)}
                  valueColor={data.unlockedCount > 0 ? 'text-accent-green' : undefined}
                />
                <StatTile icon="⭐" label="Best reputation" value={Math.round(data.bests.bestReputation)} />
                <StatTile icon="💙" label="Best morale" value={Math.round(data.bests.bestMorale)} />
                <StatTile
                  icon="📊"
                  label="Best market share"
                  value={formatPercent(data.bests.bestMarketShare)}
                />
              </StatRow>
              <div className="mt-3">
                <MeterBar value={completion} />
              </div>
            </section>

            <div className="flex gap-2 mb-6" role="group" aria-label="Filter achievements">
              {(['all', 'unlocked', 'locked'] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  aria-pressed={filter === option}
                  onClick={() => setFilter(option)}
                  className={
                    filter === option
                      ? 'bg-accent-blue text-white text-sm font-semibold py-1.5 px-4 rounded-lg capitalize'
                      : 'btn-ghost text-sm py-1.5 px-4 capitalize'
                  }
                >
                  {option}
                </button>
              ))}
            </div>

            {grouped.size === 0 ? (
              <p className="text-text-muted text-center py-16">
                {filter === 'unlocked'
                  ? 'Nothing unlocked yet — play a run and they start landing.'
                  : 'Everything unlocked. Nothing left to chase.'}
              </p>
            ) : (
              <div className="space-y-8">
                {Array.from(grouped.entries()).map(([category, definitions]) => (
                  <section key={category}>
                    <SectionHeading>{CATEGORY_LABELS[category] ?? category}</SectionHeading>
                    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                      {definitions.map((definition) => {
                        const progress = progressByType.get(definition.type);
                        if (!progress) return null;
                        return (
                          <AchievementCard
                            key={definition.type}
                            definition={definition}
                            progress={progress}
                          />
                        );
                      })}
                    </div>
                  </section>
                ))}
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
