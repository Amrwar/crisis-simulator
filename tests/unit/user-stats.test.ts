import { describe, expect, it } from 'vitest';

import {
  bestRun,
  buildScoreHistory,
  groupBy,
  isWin,
  streakOf,
  summarizeRuns,
  tagFrequency,
  type RunRecord,
} from '@/lib/analytics/user-stats';

let counter = 0;

function record(overrides: Partial<RunRecord> = {}): RunRecord {
  counter += 1;
  return {
    id: `run-${counter}`,
    industry: 'Retail',
    difficulty: 'Medium',
    companySize: 'Small',
    status: 'ended',
    endingType: 'survival',
    performanceScore: 60,
    currentTurn: 10,
    maxTurns: 10,
    createdAt: new Date('2025-01-01T00:00:00.000Z'),
    endedAt: new Date('2025-01-02T00:00:00.000Z'),
    ...overrides,
  };
}

/** A completed run that finished at a given point on the clock. */
function finished(endingType: string, day: number): RunRecord {
  return record({
    endingType,
    endedAt: new Date(`2025-01-${String(day).padStart(2, '0')}T00:00:00.000Z`),
  });
}

describe('isWin', () => {
  it('counts growth and survival as coming through it', () => {
    expect(isWin('growth_win')).toBe(true);
    expect(isWin('survival')).toBe(true);
  });

  it('counts every failure ending as not', () => {
    expect(isWin('takeover')).toBe(false);
    expect(isWin('bankruptcy')).toBe(false);
    expect(isWin('scandal')).toBe(false);
    expect(isWin('')).toBe(false);
  });
});

describe('summarizeRuns — counts', () => {
  it('reports zeroes and nulls for a player with no runs', () => {
    const stats = summarizeRuns([]);

    expect(stats.totalRuns).toBe(0);
    expect(stats.completedRuns).toBe(0);
    expect(stats.winRate).toBeNull();
    expect(stats.averageScore).toBeNull();
    expect(stats.bestScore).toBeNull();
    expect(stats.bestEnding).toBeNull();
    expect(stats.bestRunId).toBeNull();
  });

  it('separates active runs from completed ones', () => {
    const stats = summarizeRuns([
      record({ status: 'active' }),
      record({ status: 'active' }),
      record({ status: 'ended' }),
    ]);

    expect(stats.totalRuns).toBe(3);
    expect(stats.activeRuns).toBe(2);
    expect(stats.completedRuns).toBe(1);
  });

  it('measures win rate against completed runs, not every run', () => {
    const stats = summarizeRuns([
      record({ status: 'ended', endingType: 'survival' }),
      record({ status: 'ended', endingType: 'bankruptcy' }),
      record({ status: 'active', endingType: '' }),
    ]);

    expect(stats.wins).toBe(1);
    expect(stats.winRate).toBe(0.5);
  });

  it('reports no win rate when nothing has completed', () => {
    expect(summarizeRuns([record({ status: 'active' })]).winRate).toBeNull();
  });

  it('averages and maxes the scores of completed runs only', () => {
    const stats = summarizeRuns([
      record({ status: 'ended', performanceScore: 40 }),
      record({ status: 'ended', performanceScore: 80 }),
      record({ status: 'active', performanceScore: 0 }),
    ]);

    expect(stats.averageScore).toBe(60);
    expect(stats.bestScore).toBe(80);
  });

  it('counts how many runs reached each ending', () => {
    const stats = summarizeRuns([
      record({ endingType: 'survival' }),
      record({ endingType: 'survival' }),
      record({ endingType: 'bankruptcy' }),
    ]);

    expect(stats.endingCounts).toEqual({ survival: 2, bankruptcy: 1 });
  });

  it('leaves an unfinished run out of the ending counts', () => {
    expect(summarizeRuns([record({ status: 'active', endingType: '' })]).endingCounts).toEqual({});
  });

  it('names the best ending reached', () => {
    const stats = summarizeRuns([
      record({ endingType: 'bankruptcy' }),
      record({ endingType: 'growth_win' }),
      record({ endingType: 'survival' }),
    ]);

    expect(stats.bestEnding).toBe('growth_win');
  });

  it('averages the turns survived and counts the full-distance runs', () => {
    const stats = summarizeRuns([
      record({ currentTurn: 4, maxTurns: 10 }),
      record({ currentTurn: 10, maxTurns: 10 }),
    ]);

    expect(stats.averageTurnsSurvived).toBe(7);
    expect(stats.fullDistanceRuns).toBe(1);
  });
});

describe('bestRun', () => {
  it('picks the highest score', () => {
    const winner = record({ performanceScore: 90 });
    expect(bestRun([record({ performanceScore: 50 }), winner])?.id).toBe(winner.id);
  });

  it('breaks a score tie on the better ending', () => {
    const grew = record({ performanceScore: 70, endingType: 'growth_win' });
    const survived = record({ performanceScore: 70, endingType: 'survival' });

    expect(bestRun([survived, grew])?.id).toBe(grew.id);
  });

  it('returns nothing for an empty history', () => {
    expect(bestRun([])).toBeNull();
  });
});

describe('streakOf', () => {
  it('reports no streak for an empty history', () => {
    expect(streakOf([])).toEqual({ current: 0, longest: 0, currentIsLosing: false });
  });

  it('counts consecutive wins ending at the most recent run', () => {
    const streak = streakOf([
      finished('bankruptcy', 1),
      finished('survival', 2),
      finished('growth_win', 3),
    ]);

    expect(streak.current).toBe(2);
    expect(streak.currentIsLosing).toBe(false);
  });

  it('reports a losing streak when the most recent runs were losses', () => {
    const streak = streakOf([
      finished('growth_win', 1),
      finished('bankruptcy', 2),
      finished('scandal', 3),
    ]);

    expect(streak.current).toBe(2);
    expect(streak.currentIsLosing).toBe(true);
  });

  it('remembers the longest win streak even after it has been broken', () => {
    const streak = streakOf([
      finished('survival', 1),
      finished('survival', 2),
      finished('survival', 3),
      finished('bankruptcy', 4),
      finished('survival', 5),
    ]);

    expect(streak.longest).toBe(3);
    expect(streak.current).toBe(1);
  });

  it('reads the history by finish time, not by the order it was handed', () => {
    const streak = streakOf([
      finished('bankruptcy', 9),
      finished('survival', 1),
      finished('survival', 2),
    ]);

    expect(streak.currentIsLosing).toBe(true);
    expect(streak.current).toBe(1);
    expect(streak.longest).toBe(2);
  });

  it('reports a whole history of wins as one streak', () => {
    const streak = streakOf([finished('survival', 1), finished('growth_win', 2)]);

    expect(streak.current).toBe(2);
    expect(streak.longest).toBe(2);
  });

  it('reports no longest streak when nothing was ever won', () => {
    expect(streakOf([finished('bankruptcy', 1), finished('takeover', 2)]).longest).toBe(0);
  });
});

describe('buildScoreHistory', () => {
  it('is empty for a player with no runs', () => {
    expect(buildScoreHistory([])).toEqual([]);
  });

  it('leaves unfinished runs out', () => {
    const history = buildScoreHistory([
      record({ status: 'active', performanceScore: 90 }),
      record({ status: 'ended', performanceScore: 40 }),
    ]);

    expect(history.map((point) => point.score)).toEqual([40]);
  });

  it('runs oldest first, whatever order the rows arrived in', () => {
    const history = buildScoreHistory([
      record({ performanceScore: 30, endedAt: new Date('2025-03-01T00:00:00.000Z') }),
      record({ performanceScore: 10, endedAt: new Date('2025-01-01T00:00:00.000Z') }),
      record({ performanceScore: 20, endedAt: new Date('2025-02-01T00:00:00.000Z') }),
    ]);

    expect(history.map((point) => point.score)).toEqual([10, 20, 30]);
  });

  it('carries the run id and the finish as ISO-8601', () => {
    const [point] = buildScoreHistory([
      record({ id: 'run-x', performanceScore: 55, endedAt: new Date('2025-02-01T09:30:00.000Z') }),
    ]);

    expect(point).toEqual({
      simulationId: 'run-x',
      score: 55,
      endedAt: '2025-02-01T09:30:00.000Z',
    });
  });

  it('accepts a finish that arrived as a string', () => {
    const [point] = buildScoreHistory([record({ endedAt: '2025-02-01T09:30:00.000Z' })]);
    expect(point.endedAt).toBe('2025-02-01T09:30:00.000Z');
  });

  it('reports a missing finish as null rather than inventing one', () => {
    const [point] = buildScoreHistory([record({ endedAt: null })]);
    expect(point.endedAt).toBeNull();
  });

  /**
   * The route used to sort this with `endedAt?.getTime() ?? 0`, which reads a
   * missing finish as the epoch. The streak reads the same run as the most
   * recent one, so the page claimed a run was simultaneously the newest and
   * the oldest thing the player had done.
   */
  it('agrees with the streak about which completed run is the latest', () => {
    const runs = [
      record({ id: 'old', endingType: 'bankruptcy', endedAt: new Date('2025-01-01T00:00:00.000Z') }),
      record({ id: 'unfinished-clock', endingType: 'growth_win', endedAt: null }),
    ];

    const history = buildScoreHistory(runs);
    const latestOnTheChart = history[history.length - 1].simulationId;
    const streak = streakOf(runs);

    expect(latestOnTheChart).toBe('unfinished-clock');
    // The streak reads the same run as the latest, so it reports a win streak.
    expect(streak.currentIsLosing).toBe(false);
  });

  it('does not reorder the rows it was handed', () => {
    const runs = [
      record({ id: 'later', endedAt: new Date('2025-03-01T00:00:00.000Z') }),
      record({ id: 'earlier', endedAt: new Date('2025-01-01T00:00:00.000Z') }),
    ];
    buildScoreHistory(runs);

    expect(runs.map((r) => r.id)).toEqual(['later', 'earlier']);
  });
});

describe('groupBy', () => {
  it('buckets runs and counts each bucket', () => {
    const groups = groupBy(
      [
        record({ industry: 'Retail' }),
        record({ industry: 'Retail' }),
        record({ industry: 'SaaS' }),
      ],
      (run) => run.industry
    );

    expect(groups.map((g) => [g.key, g.runs])).toEqual([
      ['Retail', 2],
      ['SaaS', 1],
    ]);
  });

  it('orders the busiest bucket first', () => {
    const groups = groupBy(
      [record({ industry: 'SaaS' }), record({ industry: 'Retail' }), record({ industry: 'Retail' })],
      (run) => run.industry
    );

    expect(groups[0].key).toBe('Retail');
  });

  it('breaks a count tie alphabetically, so the order is stable', () => {
    const groups = groupBy(
      [record({ industry: 'SaaS' }), record({ industry: 'Healthcare' })],
      (run) => run.industry
    );

    expect(groups.map((g) => g.key)).toEqual(['Healthcare', 'SaaS']);
  });

  it('reports per-bucket win rate and scores over completed runs only', () => {
    const [group] = groupBy(
      [
        record({ industry: 'Retail', status: 'ended', endingType: 'survival', performanceScore: 80 }),
        record({ industry: 'Retail', status: 'ended', endingType: 'bankruptcy', performanceScore: 20 }),
        record({ industry: 'Retail', status: 'active', performanceScore: 0 }),
      ],
      (run) => run.industry
    );

    expect(group.runs).toBe(3);
    expect(group.completed).toBe(2);
    expect(group.winRate).toBe(0.5);
    expect(group.averageScore).toBe(50);
    expect(group.bestScore).toBe(80);
  });

  it('reports no rate for a bucket with nothing completed', () => {
    const [group] = groupBy([record({ status: 'active' })], (run) => run.industry);

    expect(group.winRate).toBeNull();
    expect(group.averageScore).toBeNull();
    expect(group.bestScore).toBeNull();
  });

  it('returns nothing for an empty history', () => {
    expect(groupBy([], (run) => run.industry)).toEqual([]);
  });
});

describe('tagFrequency', () => {
  it('counts each tag across every turn', () => {
    expect(
      tagFrequency([['cut_costs', 'layoffs'], ['cut_costs'], ['take_loan', 'cut_costs']])
    ).toEqual([
      { tag: 'cut_costs', count: 3 },
      { tag: 'layoffs', count: 1 },
      { tag: 'take_loan', count: 1 },
    ]);
  });

  it('orders the most-used tag first', () => {
    const counts = tagFrequency([['a'], ['b'], ['b'], ['b']]);
    expect(counts[0]).toEqual({ tag: 'b', count: 3 });
  });

  it('breaks a count tie alphabetically', () => {
    expect(tagFrequency([['zebra'], ['apple']]).map((c) => c.tag)).toEqual(['apple', 'zebra']);
  });

  it('returns nothing when no turn carried a decision', () => {
    expect(tagFrequency([])).toEqual([]);
    expect(tagFrequency([[], []])).toEqual([]);
  });

  it('counts a tag repeated within one turn once per occurrence', () => {
    expect(tagFrequency([['cut_costs', 'cut_costs']])).toEqual([{ tag: 'cut_costs', count: 2 }]);
  });
});
