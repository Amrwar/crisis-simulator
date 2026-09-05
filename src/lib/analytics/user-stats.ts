import { endingQuality } from '@/lib/game/scoring';

/**
 * Aggregating a player's whole run history.
 *
 * Everything here is a pure reduction over rows the caller has already loaded,
 * so the route stays a query plus a call and the arithmetic — which is where
 * the interesting edge cases live — is testable without a database.
 */

/** A run as the aggregator needs it. */
export interface RunRecord {
  id: string;
  industry: string;
  difficulty: string;
  companySize: string;
  status: string;
  endingType: string;
  performanceScore: number;
  currentTurn: number;
  maxTurns: number;
  createdAt: Date | string;
  endedAt: Date | string | null;
}

/** Endings that count as having come through it. */
export const WINNING_ENDINGS: ReadonlySet<string> = new Set(['growth_win', 'survival']);

export function isWin(endingType: string): boolean {
  return WINNING_ENDINGS.has(endingType);
}

export interface StreakSummary {
  /** The run of wins ending at the most recent completed run. */
  current: number;
  /** The longest run of wins anywhere in the history. */
  longest: number;
  /** True when the current streak is one of losses rather than wins. */
  currentIsLosing: boolean;
}

export interface GroupStats {
  key: string;
  runs: number;
  completed: number;
  wins: number;
  winRate: number | null;
  averageScore: number | null;
  bestScore: number | null;
}

export interface UserStats {
  totalRuns: number;
  activeRuns: number;
  completedRuns: number;
  wins: number;
  /** Wins as a share of completed runs, or null when none have completed. */
  winRate: number | null;
  averageScore: number | null;
  bestScore: number | null;
  /** The best run, by the same order the leaderboard uses. */
  bestRunId: string | null;
  /** The best ending reached, by ending quality. */
  bestEnding: string | null;
  /** How many runs reached each ending. */
  endingCounts: Record<string, number>;
  /** Mean turns played across completed runs. */
  averageTurnsSurvived: number | null;
  /** Completed runs that went the full distance. */
  fullDistanceRuns: number;
  streak: StreakSummary;
  byIndustry: GroupStats[];
  byDifficulty: GroupStats[];
}

/** The whole payload `GET /api/analytics/me` answers with. */
export interface UserAnalyticsPayload {
  stats: UserStats;
  /** Decision tags across every decided turn, most-used first. */
  favouriteDecisions: Array<{ tag: string; count: number }>;
  /** Score of each completed run, oldest first — the "am I improving?" line. */
  scoreHistory: Array<{ simulationId: string; score: number; endedAt: string | null }>;
}

/** Reduces a player's runs to the numbers the analytics page shows. */
export function summarizeRuns(runs: readonly RunRecord[]): UserStats {
  const completed = runs.filter((run) => run.status === 'ended');
  const scores = completed.map((run) => run.performanceScore);
  const wins = completed.filter((run) => isWin(run.endingType));

  const endingCounts: Record<string, number> = {};
  for (const run of completed) {
    if (run.endingType === '') continue;
    endingCounts[run.endingType] = (endingCounts[run.endingType] ?? 0) + 1;
  }

  const best = bestRun(completed);

  return {
    totalRuns: runs.length,
    activeRuns: runs.filter((run) => run.status === 'active').length,
    completedRuns: completed.length,
    wins: wins.length,
    winRate: completed.length === 0 ? null : round(wins.length / completed.length, 4),
    averageScore: mean(scores),
    bestScore: scores.length === 0 ? null : Math.max(...scores),
    bestRunId: best?.id ?? null,
    bestEnding: bestEndingOf(completed),
    endingCounts,
    averageTurnsSurvived: mean(completed.map((run) => run.currentTurn)),
    fullDistanceRuns: completed.filter((run) => run.currentTurn >= run.maxTurns).length,
    streak: streakOf(completed),
    byIndustry: groupBy(runs, (run) => run.industry),
    byDifficulty: groupBy(runs, (run) => run.difficulty),
  };
}

/**
 * The player's strongest completed run: highest score, with the better ending
 * breaking a tie. Returns null when nothing has completed.
 */
export function bestRun(completed: readonly RunRecord[]): RunRecord | null {
  return completed.reduce<RunRecord | null>((best, candidate) => {
    if (best === null) return candidate;
    if (candidate.performanceScore !== best.performanceScore) {
      return candidate.performanceScore > best.performanceScore ? candidate : best;
    }
    return endingQuality(candidate.endingType) > endingQuality(best.endingType) ? candidate : best;
  }, null);
}

function bestEndingOf(completed: readonly RunRecord[]): string | null {
  let best: string | null = null;

  for (const run of completed) {
    if (run.endingType === '') continue;
    if (best === null || endingQuality(run.endingType) > endingQuality(best)) best = run.endingType;
  }

  return best;
}

/**
 * Win and loss streaks over the completed runs, oldest first.
 *
 * "Current" means the streak that includes the most recent completed run, so a
 * player who has just lost twice sees a losing streak of two rather than a
 * stale win count.
 */
export function streakOf(completed: readonly RunRecord[]): StreakSummary {
  const ordered = [...completed].sort(
    (a, b) => finishedAt(a.endedAt) - finishedAt(b.endedAt)
  );

  let longest = 0;
  let running = 0;

  for (const run of ordered) {
    if (isWin(run.endingType)) {
      running += 1;
      if (running > longest) longest = running;
    } else {
      running = 0;
    }
  }

  if (ordered.length === 0) {
    return { current: 0, longest: 0, currentIsLosing: false };
  }

  const latestIsWin = isWin(ordered[ordered.length - 1].endingType);
  let current = 0;
  for (let i = ordered.length - 1; i >= 0; i--) {
    if (isWin(ordered[i].endingType) !== latestIsWin) break;
    current += 1;
  }

  return { current, longest, currentIsLosing: !latestIsWin };
}

/** Per-group breakdown, ordered by run count then alphabetically. */
export function groupBy(
  runs: readonly RunRecord[],
  keyOf: (run: RunRecord) => string
): GroupStats[] {
  const buckets = new Map<string, RunRecord[]>();

  for (const run of runs) {
    const key = keyOf(run);
    const bucket = buckets.get(key);
    if (bucket) bucket.push(run);
    else buckets.set(key, [run]);
  }

  const stats: GroupStats[] = [];

  buckets.forEach((bucket, key) => {
    const completed = bucket.filter((run) => run.status === 'ended');
    const scores = completed.map((run) => run.performanceScore);
    const wins = completed.filter((run) => isWin(run.endingType)).length;

    stats.push({
      key,
      runs: bucket.length,
      completed: completed.length,
      wins,
      winRate: completed.length === 0 ? null : round(wins / completed.length, 4),
      averageScore: mean(scores),
      bestScore: scores.length === 0 ? null : Math.max(...scores),
    });
  });

  return stats.sort((a, b) => (b.runs - a.runs) || a.key.localeCompare(b.key));
}

/** How often each decision tag was used, most-used first. */
export function tagFrequency(tagsPerTurn: ReadonlyArray<readonly string[]>): Array<{
  tag: string;
  count: number;
}> {
  const counts = new Map<string, number>();

  for (const tags of tagsPerTurn) {
    for (const tag of tags) {
      counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
  }

  return Array.from(counts, ([tag, count]) => ({ tag, count })).sort(
    (a, b) => b.count - a.count || a.tag.localeCompare(b.tag)
  );
}

function finishedAt(value: Date | string | null): number {
  if (value === null) return Number.POSITIVE_INFINITY;
  const time = (value instanceof Date ? value : new Date(value)).getTime();
  return Number.isNaN(time) ? Number.POSITIVE_INFINITY : time;
}

function mean(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  return round(values.reduce((sum, v) => sum + v, 0) / values.length, 2);
}

function round(value: number, places: number): number {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}
