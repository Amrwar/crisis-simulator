// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { LeaderboardTable } from '@/components/leaderboard/LeaderboardTable';
import type { LeaderboardEntry } from '@/lib/leaderboard';

afterEach(cleanup);

const BASE: LeaderboardEntry = {
  rank: 1,
  tied: false,
  simulationId: 'sim-1',
  companyName: 'Nile Home Goods',
  industry: 'Retail',
  difficulty: 'Medium',
  companySize: 'Small',
  endingType: 'survival',
  performanceScore: 64,
  scoreBand: 'steady',
  scoreLabel: 'Steady',
  turnsCompleted: 10,
  maxTurns: 10,
  playerName: 'Rival Runner',
  isCurrentUser: false,
  endedAt: '2025-03-12T10:00:00.000Z',
};

const entry = (overrides: Partial<LeaderboardEntry> = {}): LeaderboardEntry => ({
  ...BASE,
  ...overrides,
});

function show(entries: LeaderboardEntry[]) {
  return render(<LeaderboardTable entries={entries} />).container;
}

/** The row for a given company, as the reader would pick it out. */
function rowFor(company: string): HTMLElement {
  const cell = screen.getByText(company);
  const row = cell.closest('tr');
  if (!row) throw new Error(`no row for ${company}`);
  return row;
}

describe('LeaderboardTable — what it puts on screen', () => {
  it('renders one row per entry plus the header row', () => {
    const container = show([entry({ simulationId: 'a' }), entry({ simulationId: 'b', rank: 2 })]);
    expect(container.querySelectorAll('tbody tr')).toHaveLength(2);
  });

  it('shows the company, the player and the score', () => {
    show([entry()]);

    expect(screen.getByText('Nile Home Goods')).toBeTruthy();
    expect(screen.getByText('Rival Runner')).toBeTruthy();
    expect(screen.getByText('64')).toBeTruthy();
  });

  it('shows how far the run got', () => {
    show([entry({ turnsCompleted: 7, maxTurns: 10 })]);
    expect(screen.getByText('· 7/10')).toBeTruthy();
  });

  it('medals the top three and numbers the rest', () => {
    show([
      entry({ simulationId: 'a', rank: 1, companyName: 'First' }),
      entry({ simulationId: 'b', rank: 2, companyName: 'Second' }),
      entry({ simulationId: 'c', rank: 3, companyName: 'Third' }),
      entry({ simulationId: 'd', rank: 4, companyName: 'Fourth' }),
    ]);

    expect(within(rowFor('First')).getByText('🥇')).toBeTruthy();
    expect(within(rowFor('Second')).getByText('🥈')).toBeTruthy();
    expect(within(rowFor('Third')).getByText('🥉')).toBeTruthy();
    expect(within(rowFor('Fourth')).getByText('#4')).toBeTruthy();
  });

  it('marks a shared position', () => {
    show([entry({ tied: true })]);
    expect(screen.getByTitle('Shared position')).toBeTruthy();
  });

  it('does not mark a position that is not shared', () => {
    show([entry({ tied: false })]);
    expect(screen.queryByTitle('Shared position')).toBeNull();
  });

  it('renders the finish date, and a dash when there is none', () => {
    show([
      entry({ simulationId: 'a', companyName: 'Dated' }),
      entry({ simulationId: 'b', companyName: 'Undated', endedAt: null }),
    ]);

    expect(within(rowFor('Dated')).getByText('12 Mar 2025')).toBeTruthy();
    expect(within(rowFor('Undated')).getByText('—')).toBeTruthy();
  });

  it('renders an empty table body for an empty board', () => {
    const container = show([]);
    expect(container.querySelectorAll('tbody tr')).toHaveLength(0);
  });
});

describe('LeaderboardTable — highlighting the caller', () => {
  it('marks the caller own row and no other', () => {
    const container = show([
      entry({ simulationId: 'a', companyName: 'Theirs', isCurrentUser: false }),
      entry({ simulationId: 'b', companyName: 'Mine', isCurrentUser: true, rank: 2 }),
    ]);

    const marked = container.querySelectorAll('tbody tr[data-current-user="true"]');
    expect(marked).toHaveLength(1);
    expect(marked[0].textContent).toContain('Mine');
  });

  it('labels the caller row "You"', () => {
    show([entry({ isCurrentUser: true })]);
    expect(screen.getByText('You')).toBeTruthy();
  });

  it('does not label anybody else "You"', () => {
    show([entry({ isCurrentUser: false })]);
    expect(screen.queryByText('You')).toBeNull();
  });

  it('links the caller own run to its report', () => {
    show([entry({ isCurrentUser: true, simulationId: 'sim-42' })]);

    const link = screen.getByText('Nile Home Goods').closest('a');
    expect(link?.getAttribute('href')).toBe('/sim/sim-42/report');
  });

  it('does not link somebody else run', () => {
    show([entry({ isCurrentUser: false })]);
    expect(screen.getByText('Nile Home Goods').closest('a')).toBeNull();
  });

  it('tints the caller row and leaves the others plain', () => {
    const container = show([
      entry({ simulationId: 'a', isCurrentUser: false, companyName: 'Theirs' }),
      entry({ simulationId: 'b', isCurrentUser: true, companyName: 'Mine' }),
    ]);

    const rows = Array.from(container.querySelectorAll('tbody tr'));
    const mine = rows.find((r) => r.textContent?.includes('Mine'));
    const theirs = rows.find((r) => r.textContent?.includes('Theirs'));

    expect(mine?.className).toContain('bg-blue-950/20');
    expect(theirs?.className).not.toContain('bg-blue-950/20');
  });
});

describe('LeaderboardTable — bands and endings', () => {
  it('colours the score by its band', () => {
    show([entry({ scoreBand: 'exceptional', performanceScore: 91 })]);
    expect(screen.getByText('91').className).toContain('text-accent-green');
  });

  it('colours a critical score differently from an exceptional one', () => {
    show([
      entry({ simulationId: 'a', scoreBand: 'exceptional', performanceScore: 91 }),
      entry({ simulationId: 'b', scoreBand: 'critical', performanceScore: 12 }),
    ]);

    expect(screen.getByText('91').className).not.toBe(screen.getByText('12').className);
  });

  it('titles the score with its band label', () => {
    show([entry({ scoreLabel: 'Steady' })]);
    expect(screen.getByTitle('Steady')).toBeTruthy();
  });

  it('labels each ending in words', () => {
    show([
      entry({ simulationId: 'a', endingType: 'growth_win', companyName: 'Grew' }),
      entry({ simulationId: 'b', endingType: 'bankruptcy', companyName: 'Failed' }),
    ]);

    expect(within(rowFor('Grew')).getByText('🏆 Growth Win')).toBeTruthy();
    expect(within(rowFor('Failed')).getByText('💸 Bankruptcy')).toBeTruthy();
  });

  it('shows the difficulty and the industry', () => {
    show([entry({ difficulty: 'Hard', industry: 'SaaS' })]);

    expect(screen.getByText('Hard')).toBeTruthy();
    expect(screen.getByText('SaaS')).toBeTruthy();
  });
});
