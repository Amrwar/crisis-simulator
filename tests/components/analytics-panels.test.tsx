// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { GroupBreakdown } from '@/components/analytics/GroupBreakdown';
import { ScoreHistoryChart, trendSummary } from '@/components/analytics/ScoreHistoryChart';
import { TrajectoryChart, linePath, resolveDomain } from '@/components/charts/TrajectoryChart';
import type { GroupStats } from '@/lib/analytics/user-stats';

afterEach(cleanup);

const group = (overrides: Partial<GroupStats> = {}): GroupStats => ({
  key: 'Retail',
  runs: 3,
  completed: 2,
  wins: 1,
  winRate: 0.5,
  averageScore: 61.5,
  bestScore: 80,
  ...overrides,
});

describe('GroupBreakdown', () => {
  it('shows a row per group', () => {
    const { container } = render(
      <GroupBreakdown
        groups={[group({ key: 'Retail' }), group({ key: 'SaaS' })]}
        keyLabel="Industry"
      />
    );

    expect(container.querySelectorAll('tbody tr')).toHaveLength(2);
    expect(screen.getByText('Retail')).toBeTruthy();
    expect(screen.getByText('SaaS')).toBeTruthy();
  });

  it('labels the key column as asked', () => {
    render(<GroupBreakdown groups={[group()]} keyLabel="Difficulty" />);
    expect(screen.getByText('Difficulty')).toBeTruthy();
  });

  it('renders the win rate as a percentage', () => {
    render(<GroupBreakdown groups={[group({ winRate: 0.75 })]} keyLabel="Industry" />);
    expect(screen.getByText('75%')).toBeTruthy();
  });

  it('rounds the average score', () => {
    render(<GroupBreakdown groups={[group({ averageScore: 61.5 })]} keyLabel="Industry" />);
    expect(screen.getByText('62')).toBeTruthy();
  });

  it('notes how many of the runs are finished when some are not', () => {
    render(<GroupBreakdown groups={[group({ runs: 5, completed: 2 })]} keyLabel="Industry" />);
    expect(screen.getByText('(2 done)')).toBeTruthy();
  });

  it('does not note the split when every run is finished', () => {
    render(<GroupBreakdown groups={[group({ runs: 2, completed: 2 })]} keyLabel="Industry" />);
    expect(screen.queryByText(/done\)/)).toBeNull();
  });

  it('shows a dash rather than a zero for a group with nothing completed', () => {
    const { container } = render(
      <GroupBreakdown
        groups={[group({ completed: 0, winRate: null, averageScore: null })]}
        keyLabel="Industry"
      />
    );

    const text = container.textContent ?? '';
    expect(text).toContain('—');
    expect(text).not.toContain('0%');
  });

  it('shows the empty message for no groups at all', () => {
    render(<GroupBreakdown groups={[]} keyLabel="Industry" emptyMessage="Nothing played." />);
    expect(screen.getByText('Nothing played.')).toBeTruthy();
  });
});

describe('ScoreHistoryChart', () => {
  const point = (score: number, id = `run-${score}`) => ({
    simulationId: id,
    score,
    endedAt: '2025-03-01T00:00:00.000Z',
  });

  it('invites the player to finish a run when there is no history', () => {
    render(<ScoreHistoryChart history={[]} />);
    expect(screen.getByText(/appears here/)).toBeTruthy();
  });

  it('shows a single score as a number, not a chart', () => {
    const { container } = render(<ScoreHistoryChart history={[point(64)]} />);

    expect(screen.getByText('64')).toBeTruthy();
    expect(container.querySelector('svg')).toBeNull();
  });

  it('charts two or more completed runs', () => {
    const { container } = render(<ScoreHistoryChart history={[point(40), point(70)]} />);
    expect(container.querySelector('svg')).toBeTruthy();
  });

  it('plots one point per run', () => {
    const { container } = render(
      <ScoreHistoryChart history={[point(40), point(55), point(70)]} />
    );

    expect(container.querySelectorAll('circle')).toHaveLength(3);
  });
});

describe('trendSummary', () => {
  it('says nothing until there are two runs to compare', () => {
    expect(trendSummary([])).toBe('');
    expect(trendSummary([{ score: 50 }])).toBe('');
  });

  it('reports an improvement', () => {
    expect(trendSummary([{ score: 40 }, { score: 65 }])).toBe('Up 25 points since your first run.');
  });

  it('reports a decline', () => {
    expect(trendSummary([{ score: 70 }, { score: 50 }])).toBe(
      'Down 20 points since your first run.'
    );
  });

  it('reports no change', () => {
    expect(trendSummary([{ score: 60 }, { score: 60 }])).toBe('Level with your first run.');
  });

  it('compares the first and last run, ignoring the middle', () => {
    expect(trendSummary([{ score: 40 }, { score: 99 }, { score: 50 }])).toBe(
      'Up 10 points since your first run.'
    );
  });
});

describe('TrajectoryChart', () => {
  const series = [{ key: 'cash', label: 'Cash', color: '#3b82f6', points: [10, 20, 15] }];

  it('draws a point per value and a path for the line', () => {
    const { container } = render(<TrajectoryChart series={series} labels={[1, 2, 3]} />);

    expect(container.querySelectorAll('circle')).toHaveLength(3);
    expect(container.querySelectorAll('path')).toHaveLength(1);
  });

  it('describes itself for a reader who cannot see it', () => {
    render(<TrajectoryChart series={series} labels={[1, 2, 3]} title="Cash over time" />);

    const label = screen.getByRole('img').getAttribute('aria-label') ?? '';
    expect(label).toContain('Cash over time');
    expect(label).toContain('Cash from 10 to 15');
  });

  it('labels the turn axis', () => {
    render(<TrajectoryChart series={series} labels={[4, 5, 6]} />);

    expect(screen.getByText('4')).toBeTruthy();
    expect(screen.getByText('6')).toBeTruthy();
  });

  it('shows a legend only when there is more than one line', () => {
    const { container: one } = render(<TrajectoryChart series={series} labels={[1, 2, 3]} />);
    expect(one.querySelector('ul')).toBeNull();

    cleanup();

    const { container: two } = render(
      <TrajectoryChart
        series={[...series, { key: 'rep', label: 'Reputation', color: '#22c55e', points: [1, 2, 3] }]}
        labels={[1, 2, 3]}
      />
    );
    expect(two.querySelectorAll('ul li')).toHaveLength(2);
  });

  it('says so rather than drawing an empty frame when there is nothing to chart', () => {
    const { container } = render(<TrajectoryChart series={[]} labels={[]} />);

    expect(screen.getByText('No turns to chart yet')).toBeTruthy();
    expect(container.querySelector('svg')).toBeNull();
  });
});

describe('resolveDomain', () => {
  const of = (points: number[]) => [{ key: 'k', label: 'l', color: '#fff', points }];

  it('uses a caller-supplied range exactly', () => {
    expect(resolveDomain(of([1, 2, 3]), [0, 100])).toEqual({ min: 0, max: 100 });
  });

  it('pads the data range so the extremes are not drawn on the frame', () => {
    const { min, max } = resolveDomain(of([0, 100]));

    expect(min).toBeLessThan(0);
    expect(max).toBeGreaterThan(100);
  });

  it('gives a flat line a band so it renders through the middle', () => {
    const { min, max } = resolveDomain(of([50, 50, 50]));

    expect(min).toBeLessThan(50);
    expect(max).toBeGreaterThan(50);
  });

  it('gives a flat line at zero a usable band rather than a zero-width one', () => {
    const { min, max } = resolveDomain(of([0, 0]));
    expect(max - min).toBeGreaterThan(0);
  });

  it('falls back to a unit range when there is no data at all', () => {
    expect(resolveDomain([])).toEqual({ min: 0, max: 1 });
  });
});

describe('linePath', () => {
  it('moves to the first point and lines to the rest', () => {
    const path = linePath([1, 2, 3], (index) => index * 10, (value) => value * 2);
    expect(path).toBe('M0.00 2.00 L10.00 4.00 L20.00 6.00');
  });

  it('produces an empty path for no points', () => {
    expect(linePath([], () => 0, () => 0)).toBe('');
  });

  it('produces a bare move for a single point', () => {
    expect(linePath([5], () => 7, () => 9)).toBe('M7.00 9.00');
  });
});
