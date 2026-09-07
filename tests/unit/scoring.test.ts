import { describe, expect, it } from 'vitest';

import {
  ENDING_QUALITY,
  allScoreBands,
  compareRuns,
  endingQuality,
  finishedAtTime,
  isRankTie,
  percentileFor,
  rankMedal,
  rankRuns,
  scoreBand,
  type RankableRun,
} from '@/lib/game/scoring';

const BASE: RankableRun = {
  id: 'run-a',
  performanceScore: 60,
  endingType: 'survival',
  turnsCompleted: 10,
  endedAt: new Date('2025-03-12T10:00:00.000Z'),
};

const run = (overrides: Partial<RankableRun> = {}): RankableRun => ({ ...BASE, ...overrides });

describe('endingQuality', () => {
  it('rates growth above survival, and survival above every failure', () => {
    expect(ENDING_QUALITY.growth_win).toBeGreaterThan(ENDING_QUALITY.survival);
    expect(ENDING_QUALITY.survival).toBeGreaterThan(ENDING_QUALITY.takeover);
    expect(ENDING_QUALITY.takeover).toBeGreaterThan(ENDING_QUALITY.scandal);
    expect(ENDING_QUALITY.scandal).toBeGreaterThan(ENDING_QUALITY.bankruptcy);
  });

  it('rates an ending it has never heard of below every real one', () => {
    expect(endingQuality('asteroid_strike')).toBe(0);
    expect(endingQuality('')).toBe(0);
  });
});

describe('scoreBand', () => {
  it('bands a top score as exceptional', () => {
    expect(scoreBand(92).band).toBe('exceptional');
  });

  it('bands each range', () => {
    expect(scoreBand(75).band).toBe('strong');
    expect(scoreBand(55).band).toBe('steady');
    expect(scoreBand(35).band).toBe('fragile');
    expect(scoreBand(10).band).toBe('critical');
  });

  it('places a score exactly on a floor in the higher band', () => {
    expect(scoreBand(85).band).toBe('exceptional');
    expect(scoreBand(84).band).toBe('strong');
    expect(scoreBand(70).band).toBe('strong');
    expect(scoreBand(69).band).toBe('steady');
    expect(scoreBand(50).band).toBe('steady');
    expect(scoreBand(30).band).toBe('fragile');
    expect(scoreBand(29).band).toBe('critical');
  });

  it('still bands a score below zero', () => {
    expect(scoreBand(-5).band).toBe('critical');
  });

  it('gives every band a label, a colour and a description', () => {
    for (const band of allScoreBands()) {
      expect(band.label.length).toBeGreaterThan(0);
      expect(band.color).toMatch(/^text-accent-/);
      expect(band.description.length).toBeGreaterThan(10);
    }
  });

  it('lists the bands best first', () => {
    expect(allScoreBands().map((b) => b.band)).toEqual([
      'exceptional',
      'strong',
      'steady',
      'fragile',
      'critical',
    ]);
  });
});

describe('compareRuns', () => {
  it('puts the higher score first', () => {
    expect(compareRuns(run({ performanceScore: 80 }), run({ performanceScore: 40 }))).toBeLessThan(0);
  });

  it('breaks a score tie on the better ending', () => {
    const grew = run({ id: 'z', endingType: 'growth_win' });
    const survived = run({ id: 'a', endingType: 'survival' });

    expect(compareRuns(grew, survived)).toBeLessThan(0);
  });

  it('breaks an ending tie on the longer run', () => {
    const longer = run({ id: 'z', turnsCompleted: 10 });
    const shorter = run({ id: 'a', turnsCompleted: 6 });

    expect(compareRuns(longer, shorter)).toBeLessThan(0);
  });

  it('breaks a length tie on whoever finished first', () => {
    const earlier = run({ id: 'z', endedAt: new Date('2025-01-01T00:00:00.000Z') });
    const later = run({ id: 'a', endedAt: new Date('2025-06-01T00:00:00.000Z') });

    expect(compareRuns(earlier, later)).toBeLessThan(0);
  });

  it('falls back to the id so the order is total', () => {
    expect(compareRuns(run({ id: 'aaa' }), run({ id: 'bbb' }))).toBeLessThan(0);
    expect(compareRuns(run({ id: 'bbb' }), run({ id: 'aaa' }))).toBeGreaterThan(0);
  });

  it('reports identical runs as equal', () => {
    expect(compareRuns(run(), run())).toBe(0);
  });

  it('sorts a run that never recorded an end date last among its ties', () => {
    expect(compareRuns(run({ id: 'a', endedAt: null }), run({ id: 'z' }))).toBeGreaterThan(0);
  });

  it('reads an ISO string end date as readily as a Date', () => {
    const asString = run({ id: 'z', endedAt: '2025-01-01T00:00:00.000Z' });
    const asDate = run({ id: 'a', endedAt: new Date('2025-06-01T00:00:00.000Z') });

    expect(compareRuns(asString, asDate)).toBeLessThan(0);
  });
});

describe('finishedAtTime', () => {
  it('reads a Date', () => {
    expect(finishedAtTime(new Date('2025-03-12T10:00:00.000Z'))).toBe(
      Date.parse('2025-03-12T10:00:00.000Z')
    );
  });

  it('reads an ISO string to the same instant as the Date', () => {
    const iso = '2025-03-12T10:00:00.000Z';
    expect(finishedAtTime(iso)).toBe(finishedAtTime(new Date(iso)));
  });

  it('sorts a run that never recorded a finish last, not first', () => {
    expect(finishedAtTime(null)).toBeGreaterThan(finishedAtTime(new Date('2099-01-01T00:00:00.000Z')));
  });

  it('treats an unreadable value the same as a missing one', () => {
    expect(finishedAtTime('not a date')).toBe(finishedAtTime(null));
  });

  it('orders a list oldest first', () => {
    const days = ['2025-01-03', null, '2025-01-01', '2025-01-02'];
    const sorted = [...days].sort((a, b) => finishedAtTime(a) - finishedAtTime(b));

    expect(sorted).toEqual(['2025-01-01', '2025-01-02', '2025-01-03', null]);
  });
});

describe('compareRuns — the finish tie-break', () => {
  it('puts the run that finished first ahead when everything else ties', () => {
    const early = run({ id: 'early', endedAt: new Date('2025-01-01T00:00:00.000Z') });
    const late = run({ id: 'late', endedAt: new Date('2025-02-01T00:00:00.000Z') });

    expect([late, early].sort(compareRuns).map((r) => r.id)).toEqual(['early', 'late']);
  });

  it('puts a run with no recorded finish behind one that has one', () => {
    const finished = run({ id: 'finished' });
    const unknown = run({ id: 'unknown', endedAt: null });

    expect([unknown, finished].sort(compareRuns).map((r) => r.id)).toEqual([
      'finished',
      'unknown',
    ]);
  });
});

describe('rankRuns', () => {
  it('numbers a clean ordering one to n', () => {
    const ranked = rankRuns([
      run({ id: 'c', performanceScore: 40 }),
      run({ id: 'a', performanceScore: 90 }),
      run({ id: 'b', performanceScore: 65 }),
    ]);

    expect(ranked.map((r) => [r.run.id, r.rank])).toEqual([
      ['a', 1],
      ['b', 2],
      ['c', 3],
    ]);
  });

  it('gives two indistinguishable runs the same rank and skips the next number', () => {
    const shared = { performanceScore: 70, endedAt: new Date('2025-03-01T00:00:00.000Z') };
    const ranked = rankRuns([
      run({ id: 'a', ...shared }),
      run({ id: 'b', ...shared }),
      run({ id: 'c', performanceScore: 50 }),
    ]);

    expect(ranked.map((r) => r.rank)).toEqual([1, 1, 3]);
  });

  it('flags both sides of a tie, not just the second', () => {
    const shared = { performanceScore: 70, endedAt: new Date('2025-03-01T00:00:00.000Z') };
    const ranked = rankRuns([run({ id: 'a', ...shared }), run({ id: 'b', ...shared })]);

    expect(ranked.map((r) => r.tied)).toEqual([true, true]);
  });

  it('does not tie two runs that merely share a score', () => {
    const ranked = rankRuns([
      run({ id: 'a', performanceScore: 70, endingType: 'growth_win' }),
      run({ id: 'b', performanceScore: 70, endingType: 'survival' }),
    ]);

    expect(ranked.map((r) => r.rank)).toEqual([1, 2]);
    expect(ranked.every((r) => r.tied === false)).toBe(true);
  });

  it('returns an empty ranking for an empty board', () => {
    expect(rankRuns([])).toEqual([]);
  });

  it('does not mutate the array it was given', () => {
    const runs = [run({ id: 'c', performanceScore: 10 }), run({ id: 'a', performanceScore: 90 })];
    const before = runs.map((r) => r.id);

    rankRuns(runs);
    expect(runs.map((r) => r.id)).toEqual(before);
  });

  it('carries the original row through untouched', () => {
    const original = run({ id: 'a' });
    expect(rankRuns([original])[0].run).toBe(original);
  });

  it('ranks a three-way tie identically and resumes at four', () => {
    const shared = { performanceScore: 70, endedAt: new Date('2025-03-01T00:00:00.000Z') };
    const ranked = rankRuns([
      run({ id: 'a', ...shared }),
      run({ id: 'b', ...shared }),
      run({ id: 'c', ...shared }),
      run({ id: 'd', performanceScore: 20 }),
    ]);

    expect(ranked.map((r) => r.rank)).toEqual([1, 1, 1, 4]);
  });
});

describe('isRankTie', () => {
  it('is true only when every ranked field matches', () => {
    expect(isRankTie(run(), run({ id: 'other' }))).toBe(true);
  });

  it('is false when the endings differ', () => {
    expect(isRankTie(run(), run({ endingType: 'growth_win' }))).toBe(false);
  });

  it('is false when the run lengths differ', () => {
    expect(isRankTie(run(), run({ turnsCompleted: 7 }))).toBe(false);
  });
});

describe('rankMedal', () => {
  it('medals the top three', () => {
    expect(rankMedal(1)).toBe('🥇');
    expect(rankMedal(2)).toBe('🥈');
    expect(rankMedal(3)).toBe('🥉');
  });

  it('numbers everybody else', () => {
    expect(rankMedal(4)).toBe('#4');
    expect(rankMedal(41)).toBe('#41');
  });
});

describe('percentileFor', () => {
  it('puts the top of a large board at the hundredth percentile', () => {
    expect(percentileFor(1, 101)).toBe(100);
  });

  it('puts the bottom at zero', () => {
    expect(percentileFor(101, 101)).toBe(0);
  });

  it('puts the middle near fifty', () => {
    expect(percentileFor(51, 101)).toBe(50);
  });

  it('calls a board of one the hundredth percentile rather than dividing by zero', () => {
    expect(percentileFor(1, 1)).toBe(100);
  });

  it('returns nothing for an empty board', () => {
    expect(percentileFor(1, 0)).toBeNull();
  });

  it('returns nothing for a rank that cannot exist', () => {
    expect(percentileFor(0, 10)).toBeNull();
  });
});
