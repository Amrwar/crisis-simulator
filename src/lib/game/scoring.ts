import type { EndingType } from './endings';

/**
 * Turning a finished run into a rank.
 *
 * `computePerformanceScore` in the rules engine already reduces the final
 * metrics to a 0–100 number, and that number is what the leaderboard sorts on.
 * What it cannot do on its own is break a tie, and ties are common: the score
 * is a rounded integer, so a hundred-run board will have several runs sharing
 * a number. This module owns the tie-break order and the banding.
 */

/**
 * How good an ending is, independent of the score. Two runs that scored 71
 * are not equally impressive if one grew and the other merely survived.
 */
export const ENDING_QUALITY: Record<EndingType, number> = {
  growth_win: 5,
  survival: 4,
  takeover: 3,
  scandal: 2,
  bankruptcy: 1,
};

export function endingQuality(endingType: string): number {
  return ENDING_QUALITY[endingType as EndingType] ?? 0;
}

export type ScoreBand = 'exceptional' | 'strong' | 'steady' | 'fragile' | 'critical';

export interface ScoreBandMeta {
  band: ScoreBand;
  label: string;
  /** Tailwind text colour, matching the accent palette the app already uses. */
  color: string;
  description: string;
}

/** Bands in descending order; the first whose floor a score clears wins. */
const BANDS: ReadonlyArray<ScoreBandMeta & { min: number }> = [
  {
    min: 85,
    band: 'exceptional',
    label: 'Exceptional',
    color: 'text-accent-green',
    description: 'Grew the business while keeping every stakeholder onside.',
  },
  {
    min: 70,
    band: 'strong',
    label: 'Strong',
    color: 'text-accent-blue',
    description: 'A healthy company at the end of a hard ten months.',
  },
  {
    min: 50,
    band: 'steady',
    label: 'Steady',
    color: 'text-accent-cyan',
    description: 'Held the line. Survived without building much of a buffer.',
  },
  {
    min: 30,
    band: 'fragile',
    label: 'Fragile',
    color: 'text-accent-orange',
    description: 'Still standing, but one bad month from real trouble.',
  },
  {
    min: Number.NEGATIVE_INFINITY,
    band: 'critical',
    label: 'Critical',
    color: 'text-accent-red',
    description: 'The decisions compounded against the company.',
  },
];

/** Which band a 0–100 performance score falls in. */
export function scoreBand(score: number): ScoreBandMeta {
  return BANDS.find((b) => score >= b.min) ?? BANDS[BANDS.length - 1];
}

/** Every band, best first — the legend a leaderboard renders beside the table. */
export function allScoreBands(): ScoreBandMeta[] {
  return BANDS.map((b) => b);
}

/** The fields ranking needs. Deliberately narrow: any row shape can supply them. */
export interface RankableRun {
  id: string;
  performanceScore: number;
  endingType: string;
  /** Turns actually played out. A run that lasted longer beat the clock. */
  turnsCompleted: number;
  /** When the run finished. Used only as a final, stable tie-break. */
  endedAt: Date | string | null;
}

export interface RankedRun<T extends RankableRun> {
  /** Competition ranking: two runs sharing a position both get it, and the
   *  next run skips a number (1, 2, 2, 4). */
  rank: number;
  /** True when at least one other run shares this exact position. */
  tied: boolean;
  run: T;
}

/**
 * Orders two runs best-first.
 *
 * Score decides it almost always. When two runs scored the same, the better
 * ending wins; then the longer run; then whoever finished first, so a run
 * cannot lose a position to somebody who played the same game later. The id
 * is the last resort, purely so the order is total and stable.
 */
export function compareRuns(a: RankableRun, b: RankableRun): number {
  if (a.performanceScore !== b.performanceScore) return b.performanceScore - a.performanceScore;

  const qualityGap = endingQuality(b.endingType) - endingQuality(a.endingType);
  if (qualityGap !== 0) return qualityGap;

  if (a.turnsCompleted !== b.turnsCompleted) return b.turnsCompleted - a.turnsCompleted;

  const finishedGap = timeOf(a.endedAt) - timeOf(b.endedAt);
  if (finishedGap !== 0) return finishedGap;

  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

function timeOf(value: Date | string | null): number {
  if (value === null) return Number.POSITIVE_INFINITY;
  const date = value instanceof Date ? value : new Date(value);
  const time = date.getTime();
  return Number.isNaN(time) ? Number.POSITIVE_INFINITY : time;
}

/**
 * Sorts runs and assigns competition ranks.
 *
 * Two runs share a rank only when every ranked field matches — not merely the
 * score — because the tie-breaks above are what the board is claiming to have
 * applied. The input array is not mutated.
 */
export function rankRuns<T extends RankableRun>(runs: readonly T[]): Array<RankedRun<T>> {
  const sorted = [...runs].sort(compareRuns);
  const ranked: Array<RankedRun<T>> = [];

  for (let i = 0; i < sorted.length; i++) {
    const run = sorted[i];
    const previous = ranked[i - 1];
    const sharesWithPrevious = previous !== undefined && isRankTie(previous.run, run);

    ranked.push({
      rank: sharesWithPrevious ? previous.rank : i + 1,
      tied: sharesWithPrevious,
      run,
    });

    if (sharesWithPrevious) previous.tied = true;
  }

  return ranked;
}

/** True when two runs are indistinguishable to every ranked field. */
export function isRankTie(a: RankableRun, b: RankableRun): boolean {
  return (
    a.performanceScore === b.performanceScore &&
    endingQuality(a.endingType) === endingQuality(b.endingType) &&
    a.turnsCompleted === b.turnsCompleted &&
    timeOf(a.endedAt) === timeOf(b.endedAt)
  );
}

/** `1` → `🥇`. Anything past third gets its plain number. */
export function rankMedal(rank: number): string {
  switch (rank) {
    case 1:
      return '🥇';
    case 2:
      return '🥈';
    case 3:
      return '🥉';
    default:
      return `#${rank}`;
  }
}

/**
 * The percentile a rank sits in, best-first: rank 1 of 100 is the 99th
 * percentile. Returns null for an empty board rather than dividing by zero.
 */
export function percentileFor(rank: number, total: number): number | null {
  if (total <= 0 || rank < 1) return null;
  if (total === 1) return 100;
  return Math.round(((total - rank) / (total - 1)) * 100);
}
